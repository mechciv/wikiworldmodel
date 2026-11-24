// Dependency-free S3 / Cloudflare R2 client with AWS Signature V4 signing.
// Supports HEAD, PUT (with Content-Type, Content-Encoding, Cache-Control, user metadata), and
// paginated ListObjectsV2 so deploys can deduplicate content-addressed blobs in milliseconds
// without spawning thousands of subprocesses or requiring the AWS CLI.
import { createHash, createHmac } from 'node:crypto';

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  /** Optional custom fetch implementation (for tests). */
  fetch?: typeof fetch;
  /** Optional custom sleep (for retry tests). */
  pause?: (ms: number) => Promise<void>;
}

export interface PutObjectOptions {
  contentType: string;
  contentEncoding?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

const PAUSES_MS = [1000, 4000, 12000];

const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data).digest();

/** RFC 3986 percent-encoding required by AWS Signature V4. */
function awsEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => awsEncode(seg))
    .join('/');
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Parse keys and NextContinuationToken from an S3 ListObjectsV2 XML response. */
export function parseListObjectsV2Xml(xml: string): { keys: string[]; nextToken?: string } {
  const keys: string[] = [];
  const keyRe = /<Key>([^<]*)<\/Key>/g;
  for (let m = keyRe.exec(xml); m; m = keyRe.exec(xml)) keys.push(decodeXml(m[1]));
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const tokMatch = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml);
  return { keys, nextToken: truncated && tokMatch ? decodeXml(tokMatch[1]) : undefined };
}

export class S3Client {
  private readonly endpoint: URL;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly region: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pauseImpl: (ms: number) => Promise<void>;

  constructor(cfg: S3Config) {
    this.endpoint = new URL(cfg.endpoint.endsWith('/') ? cfg.endpoint : `${cfg.endpoint}/`);
    this.bucket = cfg.bucket;
    this.accessKeyId = cfg.accessKeyId;
    this.secretAccessKey = cfg.secretAccessKey;
    this.region = cfg.region ?? 'auto';
    this.fetchImpl = cfg.fetch ?? fetch;
    this.pauseImpl = cfg.pause ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Sign and send one S3 request with retry on transient network/5xx/429 errors. */
  private async request(
    method: 'HEAD' | 'GET' | 'PUT',
    key: string,
    query: Record<string, string>,
    headers: Record<string, string>,
    body?: Uint8Array,
  ): Promise<Response> {
    const basePath = this.endpoint.pathname.replace(/\/+$/, '');
    const rawPath = key ? `${basePath}/${this.bucket}/${key}` : `${basePath}/${this.bucket}`;
    const canonicalUri = encodePath(rawPath);
    const sortedQuery = Object.entries(query)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`)
      .join('&');
    const url = `${this.endpoint.origin}${canonicalUri}${sortedQuery ? `?${sortedQuery}` : ''}`;
    const payloadHash = sha256Hex(body ?? '');

    for (let attempt = 1; ; attempt++) {
      const now = new Date();
      const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      const dateStamp = amzDate.slice(0, 8);

      const lower: Record<string, string> = {
        host: this.endpoint.host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      };
      for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v.trim();
      const signedHeaderKeys = Object.keys(lower).sort();
      const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${lower[k]}\n`).join('');
      const signedHeaders = signedHeaderKeys.join(';');
      const canonicalRequest = `${method}\n${canonicalUri}\n${sortedQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
      const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
      const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
      const kDate = hmac(`AWS4${this.secretAccessKey}`, dateStamp);
      const kRegion = hmac(kDate, this.region);
      const kService = hmac(kRegion, 's3');
      const kSigning = hmac(kService, 'aws4_request');
      const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

      const reqHeaders: Record<string, string> = {
        ...lower,
        authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      };
      delete reqHeaders.host; // fetch derives Host from URL

      try {
        const res = await this.fetchImpl(url, {
          method,
          headers: reqHeaders,
          body: body ? new Uint8Array(body) : undefined,
        });
        if (res.status >= 500 || res.status === 429 || res.status === 408) {
          const text = await res.text().catch(() => '');
          throw new Error(`S3 ${method} ${key || '/'} HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
        }
        return res;
      } catch (err) {
        const pause = PAUSES_MS[attempt - 1];
        if (pause === undefined) throw err;
        await this.pauseImpl(pause);
      }
    }
  }

  /** Whether an object key exists in the bucket. */
  async headObject(key: string): Promise<boolean> {
    const res = await this.request('HEAD', key, {}, {});
    await res.body?.cancel();
    if (res.status === 200) return true;
    if (res.status === 404) return false;
    throw new Error(`S3 HEAD ${key}: HTTP ${res.status}`);
  }

  /** List every object key under `prefix` using paginated ListObjectsV2. */
  async listKeys(prefix: string): Promise<Set<string>> {
    const out = new Set<string>();
    let token: string | undefined;
    for (;;) {
      const query: Record<string, string> = { 'list-type': '2', prefix };
      if (token) query['continuation-token'] = token;
      const res = await this.request('GET', '', query, {});
      const xml = await res.text();
      if (!res.ok) throw new Error(`S3 ListObjectsV2 (${prefix}): HTTP ${res.status}: ${xml.slice(0, 200)}`);
      const page = parseListObjectsV2Xml(xml);
      for (const k of page.keys) out.add(k);
      if (!page.nextToken) break;
      token = page.nextToken;
    }
    return out;
  }

  /** Upload an immutable object with Content-Type, optional Content-Encoding, and Cache-Control. */
  async putObject(key: string, body: Uint8Array, opts: PutObjectOptions): Promise<void> {
    const headers: Record<string, string> = { 'content-type': opts.contentType };
    if (opts.contentEncoding) headers['content-encoding'] = opts.contentEncoding;
    if (opts.cacheControl) headers['cache-control'] = opts.cacheControl;
    for (const [k, v] of Object.entries(opts.metadata ?? {})) headers[`x-amz-meta-${k.toLowerCase()}`] = v;
    const res = await this.request('PUT', key, {}, headers, body);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 PUT ${key}: HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    await res.body?.cancel();
  }
}

/**
 * Derive R2 S3 credentials from a Cloudflare API token and account ID (the token's ID is the
 * access key and SHA-256 of the token value is the secret), or read standard AWS_* env vars.
 */
export async function resolveS3Config(
  bucket: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<S3Config> {
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_ENDPOINT_URL) {
    return {
      bucket,
      endpoint: env.AWS_ENDPOINT_URL,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region: env.AWS_DEFAULT_REGION ?? 'auto',
      fetch: fetchImpl,
    };
  }
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error('missing S3 credentials: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, or AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_ENDPOINT_URL');
  }
  const verify = async (scope: string): Promise<string | undefined> => {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4/${scope}/tokens/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { result?: { id?: string } };
    return data.result?.id;
  };
  const tokenId = (await verify('user')) ?? (await verify(`accounts/${accountId}`));
  if (!tokenId) throw new Error('could not verify CLOUDFLARE_API_TOKEN to derive R2 S3 access key');
  const secret = sha256Hex(token);
  if (env.GITHUB_ACTIONS) console.log(`::add-mask::${secret}`);
  return {
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    accessKeyId: tokenId,
    secretAccessKey: secret,
    region: 'auto',
    fetch: fetchImpl,
  };
}
