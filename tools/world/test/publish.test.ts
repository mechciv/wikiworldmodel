import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { buildFileUrl, type BuildManifest } from '../../../core/records.ts';
import { putBlob } from '../src/blobs.ts';
import { compressPayload } from '../src/compress.ts';
import { publishBuild, publishSnapshots } from '../src/publish.ts';
import { S3Client } from '../src/s3.ts';
import { stableStringify } from '../src/util.ts';
import type { Manifest } from '../src/world.ts';

const tempDirs: string[] = [];
const servers: Server[] = [];

function makeTmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

interface StoredObject {
  body: Buffer;
  contentType?: string;
  contentEncoding?: string;
  cacheControl?: string;
  headers: Record<string, string | string[] | undefined>;
}

async function startMockS3(opts: { pageSize?: number; failOnceOnPut?: boolean } = {}) {
  const objects = new Map<string, StoredObject>();
  const requests: Array<{ method: string; key: string; query: string; auth?: string }> = [];
  let failedOnce = false;

  const server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    // Path style: /<bucket>/<key>
    const parts = u.pathname.replace(/^\//, '').split('/');
    const key = parts.slice(1).map(decodeURIComponent).join('/');
    requests.push({ method: req.method ?? 'GET', key, query: u.search, auth: req.headers.authorization });

    if (req.method === 'GET' && u.searchParams.get('list-type') === '2') {
      const prefix = u.searchParams.get('prefix') ?? '';
      const token = u.searchParams.get('continuation-token');
      const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = token ? Number(token) : 0;
      const limit = opts.pageSize ?? 1000;
      const slice = all.slice(start, start + limit);
      const truncated = start + slice.length < all.length;
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>` +
        `<IsTruncated>${truncated}</IsTruncated>` +
        (truncated ? `<NextContinuationToken>${start + slice.length}</NextContinuationToken>` : '') +
        slice.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('') +
        `</ListBucketResult>`;
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end(xml);
      return;
    }

    if (req.method === 'HEAD') {
      if (objects.has(key)) res.writeHead(200);
      else res.writeHead(404);
      res.end();
      return;
    }

    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        if (opts.failOnceOnPut && !failedOnce) {
          failedOnce = true;
          res.writeHead(503);
          res.end('transient error');
          return;
        }
        objects.set(key, {
          body: Buffer.concat(chunks),
          contentType: req.headers['content-type'],
          contentEncoding: req.headers['content-encoding'],
          cacheControl: req.headers['cache-control'],
          headers: req.headers,
        });
        res.writeHead(200);
        res.end();
      });
      return;
    }

    if (req.method === 'GET') {
      const obj = objects.get(key);
      if (!obj) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        ...(obj.contentType ? { 'Content-Type': obj.contentType } : {}),
        ...(obj.contentEncoding ? { 'Content-Encoding': obj.contentEncoding } : {}),
        ...(obj.cacheControl ? { 'Cache-Control': obj.cacheControl } : {}),
      });
      res.end(obj.body);
      return;
    }

    res.writeHead(405);
    res.end();
  });

  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('unexpected addr');
  const endpoint = `http://127.0.0.1:${addr.port}`;
  const s3 = new S3Client({
    endpoint,
    bucket: 'test-bucket',
    accessKeyId: 'test-key-id',
    secretAccessKey: 'test-secret-key',
    region: 'auto',
    pause: async () => {},
  });
  return { endpoint, s3, objects, requests };
}

afterEach(async () => {
  while (servers.length) {
    const s = servers.pop()!;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('payload pre-compression', () => {
  it('compresses .lwt and .json with brotli and gzip and round-trips bit-for-bit', async () => {
    const json = new TextEncoder().encode(JSON.stringify({ rows: Array.from({ length: 200 }, (_, i) => ({ id: i, name: 'Rome' })) }));
    const br = await compressPayload(json, 'tileset.json', 'br', { brotliQuality: 6 });
    expect(br.contentEncoding).toBe('br');
    expect(br.contentType).toBe('application/json; charset=utf-8');
    expect(br.wireBytes).toBeLessThan(br.rawBytes * 0.3);
    expect(new Uint8Array(brotliDecompressSync(br.body))).toEqual(json);

    const lwt = new Uint8Array(4096);
    for (let i = 0; i < lwt.length; i++) lwt[i] = i % 16;
    const gz = await compressPayload(lwt, 'tiles/0/0-0/b0.lwt', 'gzip');
    expect(gz.contentEncoding).toBe('gzip');
    expect(gz.contentType).toBe('application/octet-stream');
    expect(gz.wireBytes).toBeLessThan(gz.rawBytes * 0.2);
    expect(new Uint8Array(gunzipSync(gz.body))).toEqual(lwt);
  });

  it('skips compression for tiny files, .zip archives, and incompressible payloads', async () => {
    const tiny = new TextEncoder().encode('{"ok":true}');
    const rTiny = await compressPayload(tiny, 'small.json', 'br');
    expect(rTiny.contentEncoding).toBeUndefined();
    expect(rTiny.body).toEqual(tiny);

    const fakeZip = new Uint8Array(2048).fill(65);
    const rZip = await compressPayload(fakeZip, 'archive.zip', 'br');
    expect(rZip.contentEncoding).toBeUndefined();
    expect(rZip.contentType).toBe('application/zip');

    const noise = new Uint8Array(randomBytes(2048));
    const rNoise = await compressPayload(noise, 'random.lwt', 'br');
    expect(rNoise.contentEncoding).toBeUndefined();
    expect(rNoise.body).toEqual(noise);
  });
});

describe('S3Client and content-addressed publishing', () => {
  it('signs requests with AWS4-HMAC-SHA256, handles paginated ListObjectsV2, and retries 503', async () => {
    const { s3, requests } = await startMockS3({ pageSize: 2, failOnceOnPut: true });
    await s3.putObject('blobs/a', new TextEncoder().encode('a'), { contentType: 'text/plain' });
    await s3.putObject('blobs/b', new TextEncoder().encode('b'), { contentType: 'text/plain' });
    await s3.putObject('blobs/c', new TextEncoder().encode('c'), { contentType: 'text/plain' });
    expect(await s3.headObject('blobs/a')).toBe(true);
    expect(await s3.headObject('blobs/missing')).toBe(false);

    const listed = await s3.listKeys('blobs/');
    expect([...listed].sort()).toEqual(['blobs/a', 'blobs/b', 'blobs/c']);
    // First PUT failed once with 503 and was retried automatically.
    const putA = requests.filter((r) => r.method === 'PUT' && r.key === 'blobs/a');
    expect(putA.length).toBe(2);
    expect(putA[0].auth).toMatch(/^AWS4-HMAC-SHA256 Credential=test-key-id\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=/);
  });

  it('deduplicates blobs, uploads compressed blobs before atomic manifest.json, skips unchanged blobs on build 2, and serves browser reads', async () => {
    const buildsDir = makeTmp('pub-builds-');
    const blobDir = makeTmp('pub-blobs-');
    const { endpoint, s3, objects, requests } = await startMockS3();

    const makeBuild = async (id: string, files: Record<string, string | Uint8Array>) => {
      const dir = join(buildsDir, id);
      mkdirSync(dir, { recursive: true });
      const fileMap: Record<string, string> = {};
      for (const [rel, content] of Object.entries(files)) {
        const ref = await putBlob(content, blobDir);
        fileMap[rel] = ref.sha256;
        const full = join(dir, rel);
        mkdirSync(join(full, '..'), { recursive: true });
        writeFileSync(full, content);
      }
      const manifest: BuildManifest = { format: 'lightworld-manifest@1', build: id, blobs: '../blobs/', files: fileMap };
      writeFileSync(join(dir, 'manifest.json'), stableStringify(manifest));
      writeFileSync(join(buildsDir, 'index.json'), JSON.stringify({ latest: id, builds: [{ id }] }));
      return manifest;
    };

    const repeatedTile = new Uint8Array(2048);
    for (let i = 0; i < repeatedTile.length; i++) repeatedTile[i] = i % 32;
    const recordA = JSON.stringify({ id: 'a', text: 'Rome '.repeat(80) });
    const tileset1 = JSON.stringify({ format: 'lightworld-tileset@4', build: 'build-1', filler: 'x'.repeat(500) });

    const m1 = await makeBuild('build-1', {
      'tileset.json': tileset1,
      'tiles/0.lwt': repeatedTile,
      'tiles/1.lwt': repeatedTile, // duplicate content -> single blob!
      'records/a.json': recordA,
    });

    const r1 = await publishBuild({ buildsDir, blobDir, s3, encoding: 'br', log: () => {} });
    expect(r1.alreadyPublished).toBe(false);
    expect(r1.totalFiles).toBe(4);
    expect(r1.uniqueBlobs).toBe(3); // tiles/0.lwt and tiles/1.lwt share one blob
    expect(r1.uploadedBlobs).toBe(3);
    expect(r1.skippedBlobs).toBe(0);
    expect(r1.wireBytes).toBeLessThan(r1.rawBytes);

    // manifest.json MUST be the very last PUT so incomplete builds are never visible.
    const putKeys1 = requests.filter((r) => r.method === 'PUT').map((r) => r.key);
    expect(putKeys1.at(-1)).toBe('build-1/manifest.json');
    for (const k of putKeys1) {
      expect(objects.get(k)?.cacheControl).toBe('public, max-age=31536000, immutable');
      expect(objects.get(k)?.contentEncoding).toBe('br');
    }

    // Re-publishing build-1 short-circuits via HEAD with zero PUTs.
    const reqBefore = requests.length;
    const r1Again = await publishBuild({ buildsDir, blobDir, s3, encoding: 'br', log: () => {} });
    expect(r1Again.alreadyPublished).toBe(true);
    expect(r1Again.uploadedBlobs).toBe(0);
    expect(requests.slice(reqBefore).every((r) => r.method === 'HEAD')).toBe(true);

    // Build 2 edits only 1 record + tileset.json; the tile blob is reused with ZERO re-upload.
    const tileset2 = JSON.stringify({ format: 'lightworld-tileset@4', build: 'build-2', filler: 'y'.repeat(500) });
    const recordAEdited = JSON.stringify({ id: 'a', text: 'Roma '.repeat(80) });
    await makeBuild('build-2', {
      'tileset.json': tileset2,
      'tiles/0.lwt': repeatedTile,
      'tiles/1.lwt': repeatedTile,
      'records/a.json': recordAEdited,
    });

    const reqBefore2 = requests.length;
    const r2 = await publishBuild({ buildsDir, blobDir, s3, encoding: 'br', log: () => {} });
    expect(r2.alreadyPublished).toBe(false);
    expect(r2.uniqueBlobs).toBe(3);
    expect(r2.skippedBlobs).toBe(1); // repeatedTile skipped!
    expect(r2.uploadedBlobs).toBe(2); // only tileset2 + recordAEdited uploaded!
    const putKeys2 = requests.slice(reqBefore2).filter((r) => r.method === 'PUT').map((r) => r.key);
    expect(putKeys2.at(-1)).toBe('build-2/manifest.json');

    // End-to-end viewer fetch: resolve tileset.json and tiles/0.lwt via build-1/manifest.json -> blobs/<sha256>.
    const base = `${endpoint}/test-bucket/build-1/`;
    const fetchedManifest = (await (await fetch(`${base}manifest.json`)).json()) as BuildManifest;
    expect(fetchedManifest).toEqual(m1);
    const tileUrl = buildFileUrl(base, 'tiles/0.lwt', fetchedManifest);
    expect(tileUrl).toBe(`${endpoint}/test-bucket/blobs/${m1.files['tiles/0.lwt']}`);
    const tileBytes = new Uint8Array(await (await fetch(tileUrl)).arrayBuffer());
    expect(tileBytes).toEqual(repeatedTile);
  });

  it('publishes missing blob:<sha256> snapshots and skips existing ones', async () => {
    const blobDir = makeTmp('pub-snaps-');
    const { s3, objects } = await startMockS3();
    const jsonBytes = new TextEncoder().encode(JSON.stringify({ items: Array.from({ length: 100 }, (_, i) => i) }));
    const zipBytes = new Uint8Array(1024).fill(7);
    const jRef = await putBlob(jsonBytes, blobDir);
    const zRef = await putBlob(zipBytes, blobDir);

    const manifest: Manifest = {
      publish: { licenses: ['CC0-1.0'] },
      blobs: { url: 'https://builds.example.org/', prefix: 'blobs/' },
      datasets: {
        'src:snap-json': {
          id: 'src:snap-json',
          type: 'source',
          kind: 'dataset',
          citation: 'Test JSON snapshot',
          file: 'manifest.yaml',
          title: 'JSON snapshot',
          license: 'CC0-1.0',
          fetch: { url: `blob:${jRef.sha256}`, filename: 'snap.json', sha256: jRef.sha256, bytes: jRef.bytes, format: 'json' },
        },
        'src:snap-zip': {
          id: 'src:snap-zip',
          type: 'source',
          kind: 'dataset',
          citation: 'Test ZIP snapshot',
          file: 'manifest.yaml',
          title: 'ZIP snapshot',
          license: 'CC0-1.0',
          fetch: { url: `blob:${zRef.sha256}`, filename: 'snap.zip', sha256: zRef.sha256, bytes: zRef.bytes, format: 'zip' },
        },
      },
    };

    const r1 = await publishSnapshots({ manifest, blobDir, s3, encoding: 'br', log: () => {} });
    expect(r1.total).toBe(2);
    expect(r1.uploaded).toBe(2);
    expect(r1.skipped).toBe(0);
    // JSON snapshot is Brotli-compressed; .zip snapshot is uploaded raw.
    expect(objects.get(`blobs/${jRef.sha256}`)?.contentEncoding).toBe('br');
    expect(objects.get(`blobs/${zRef.sha256}`)?.contentEncoding).toBeUndefined();

    // Second run uploads nothing.
    const r2 = await publishSnapshots({ manifest, blobDir, s3, encoding: 'br', log: () => {} });
    expect(r2.uploaded).toBe(0);
    expect(r2.skipped).toBe(2);
  });
});
