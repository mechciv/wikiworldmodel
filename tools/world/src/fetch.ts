// Download every dataset in world/manifest.yaml into .cache/, verifying checksums.
// Snapshot datasets referenced as `blob:<sha256>` are fetched from the local content-addressed
// blob cache (.cache/blobs/<sha256>) or the remote R2/S3 blob store (<store>/blobs/<sha256>).
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { blobPath, blobRemoteUrl, blobStoreUrls, DEFAULT_BLOB_PREFIX, isBlobUrl, linkOrCopy, parseBlobHash, snapshotDatasets } from './blobs.ts';
import { datasetDir, datasetPath, loadManifest, type BlobStoreConfig, type Dataset } from './manifest.ts';
import { BLOBS, REPO } from './paths.ts';
import { sha256, sha256File } from './util.ts';

/** A failure that asking again will not mend. */
class Final extends Error {}

// The undici the tools pin takes the place of the one inside Node in two cases, and is loaded only
// for them, since it needs a newer Node (zstd in zlib) than the tools otherwise do.
// - Behind a proxy: Node's fetch ignores HTTPS_PROXY, and undici's agent for it honours it. With
//   no HTTPS_PROXY the agent is a plain one, which goes straight to the host as Node's does: the
//   other would send https through an HTTP_PROXY.
// - For a download: the undici inside Node (seen in 22.23 and 24.22) stops the whole process on a
//   bare assertion, `AssertionError: false == true` at Parser.finish, when a host that closes the
//   connection after its answer, as NOAA's does, ends it while part of the file still waits to be
//   written. The one pinned reads the rest instead (nodejs/undici#5360).
const PROXIED = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
let pinned: Promise<void> | undefined;
function usePinnedUndici(): Promise<void> {
  return (pinned ??= import('undici').then(
    ({ Agent, EnvHttpProxyAgent, setGlobalDispatcher }) => setGlobalDispatcher(PROXIED ? new EnvHttpProxyAgent() : new Agent()),
    (err) => {
      throw new Final(`undici could not be loaded (${reason(err)}): it needs one of the Node versions package.json names`);
    },
  ));
}
if (PROXIED) await usePinnedUndici();

/** What a download needs from outside the process, so that a test can stand in for it. */
export interface Net {
  fetch: typeof fetch;
  /** Waits so many milliseconds. */
  pause: (ms: number) => Promise<void>;
}

const NET: Net = {
  fetch: async (url, init) => {
    await usePinnedUndici();
    return fetch(url, init);
  },
  pause: (ms) => new Promise((done) => setTimeout(done, ms)),
};

// How long to wait before each further try at a download that failed, in seconds: time for a host
// that dropped a connection or was busy to answer again, and not for one that is down.
const PAUSES_S = [2, 10, 30];

/** Why a try failed, read down through its causes: Node says only `fetch failed`, and keeps why below. */
function reason(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const { code } = err as { code?: unknown };
  let own = err.message || err.name;
  if (typeof code === 'string' && !own.includes(code)) own += ` (${code})`;
  const below = err instanceof AggregateError ? err.errors.map((e) => reason(e)).join('; ') : err.cause == null ? '' : reason(err.cause);
  return below ? `${own}: ${below}` : own;
}

/** One try at a URL: what the host answers, written to `tmp` as it comes. */
async function get(url: string, tmp: string, net: Net): Promise<void> {
  // Some hosts refuse a client with no name of its own.
  const res = await net.fetch(url, { headers: { 'User-Agent': 'wikiworldmodel-world-tools' } });
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    // A host that is busy or broken may answer in a moment. One that says the file is not there,
    // or not to be had, will say so again.
    if (res.status >= 500 || res.status === 408 || res.status === 429) throw new Error(`HTTP ${res.status}`);
    throw new Final(`HTTP ${res.status}`);
  }
  // Written as it comes, since some datasets are larger than is wise to hold in memory.
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(tmp));
}

export interface DownloadBlobOptions {
  blobs?: BlobStoreConfig;
  blobDir?: string;
}

/**
 * Download a dataset's file to `dest`. A try that fails is made again after a pause, a few times,
 * and a download given up says which dataset, which host and why.
 *
 * A `blob:<sha256>` URL is resolved from the local blob cache first, then from each configured
 * R2/S3 blob store URL (`<store>/blobs/<sha256>`), verifying the hash and caching locally.
 */
export async function download(
  id: string,
  url: string,
  dest: string,
  log: (s: string) => void,
  net: Net = NET,
  blobOpts: DownloadBlobOptions = {},
): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  if (url.startsWith('repo:')) {
    await writeFile(tmp, new Uint8Array(await readFile(join(REPO, url.slice('repo:'.length)))));
    await rename(tmp, dest);
    return;
  }
  if (isBlobUrl(url)) {
    const hash = parseBlobHash(url);
    if (!hash) throw new Error(`${id}: malformed blob URL "${url}" (expected blob:<64-hex-sha256>)`);
    const blobDir = blobOpts.blobDir ?? BLOBS;
    const localBlob = blobPath(hash, blobDir);
    if (existsSync(localBlob) && (await sha256File(localBlob)) === hash) {
      await linkOrCopy(localBlob, dest);
      return;
    }
    const stores = blobStoreUrls(blobOpts.blobs);
    const prefix = blobOpts.blobs?.prefix ?? DEFAULT_BLOB_PREFIX;
    const errors: string[] = [];
    for (const store of stores) {
      const remote = blobRemoteUrl(store, hash, prefix);
      if (remote.startsWith('file://')) {
        const src = fileURLToPath(remote);
        if (existsSync(src) && (await sha256File(src)) === hash) {
          await linkOrCopy(src, localBlob);
          await linkOrCopy(localBlob, dest);
          return;
        }
        errors.push(`${remote}: not found or checksum mismatch`);
        continue;
      }
      try {
        await downloadHttp(id, remote, tmp, log, net);
        const got = await sha256File(tmp);
        if (got !== hash) {
          await rm(tmp, { force: true }).catch(() => {});
          throw new Error(`${id}: checksum mismatch from ${remote}\n  expected ${hash}\n  got      ${got}`);
        }
        await mkdir(blobDir, { recursive: true });
        await rename(tmp, localBlob);
        await linkOrCopy(localBlob, dest);
        return;
      } catch (err) {
        await rm(tmp, { force: true }).catch(() => {});
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    throw new Error(`${id}: blob ${hash} not available in ${blobDir} or remote stores (${errors.join('; ')})`);
  }
  await downloadHttp(id, url, tmp, log, net);
  await rename(tmp, dest);
}

async function downloadHttp(id: string, url: string, tmp: string, log: (s: string) => void, net: Net): Promise<void> {
  const { host } = new URL(url);
  for (let tries = 1; ; tries++) {
    try {
      await get(url, tmp, net);
      return;
    } catch (err) {
      // Asking again mends neither a host's no nor a failure of this machine's own, as of a full
      // disk. Node marks such a failure with the system call that failed; what the network failed
      // at comes wrapped in fetch's own error, and is tried again.
      const final = err instanceof Final || typeof (err as NodeJS.ErrnoException).syscall === 'string';
      const pause = final ? undefined : PAUSES_S[tries - 1];
      if (pause === undefined) {
        await rm(tmp, { force: true }).catch(() => {});
        throw new Error(`${id}: not downloaded from ${host}${tries > 1 ? ` in ${tries} tries` : ''}: ${reason(err)}`, { cause: err });
      }
      log(`${id}: try ${tries} at ${host} failed, trying again in ${pause} s: ${reason(err)}`);
      await net.pause(pause * 1000);
    }
  }
}

async function verified(path: string, expected: string): Promise<boolean> {
  return existsSync(path) && (await sha256File(path)) === expected;
}

async function fetchDataset(
  id: string,
  d: Dataset,
  log: (s: string) => void,
  net: Net,
  blobs?: BlobStoreConfig,
  blobDir: string = BLOBS,
): Promise<void> {
  const path = datasetPath(id, d);
  const { url, sha256: expected, format, files } = d.fetch;
  if (!(await verified(path, expected))) {
    log(`${id}: downloading ${url}`);
    await download(id, url, path, log, net, { blobs, blobDir });
    const got = await sha256File(path);
    if (got !== expected) {
      await rm(path);
      throw new Error(`${id}: checksum mismatch\n  expected ${expected}\n  got      ${got}`);
    }
  }
  if (format === 'zip' && files) {
    let entries: Record<string, Uint8Array> | undefined;
    for (const [name, f] of Object.entries(files)) {
      const out = join(datasetDir(id, d), f.path);
      if (await verified(out, f.sha256)) continue;
      entries ??= unzipSync(new Uint8Array(await readFile(path)));
      const data = entries[f.path];
      if (!data) throw new Error(`${id}: archive has no member ${f.path}`);
      if (sha256(data) !== f.sha256) throw new Error(`${id}: member ${f.path} (${name}) checksum mismatch`);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, data);
    }
  }
  log(`${id}: ok (${expected.slice(0, 12)})`);
}

/**
 * Fetch every dataset in the manifest, or only those named (plus `--snapshots` for all
 * content-addressed `blob:` snapshot datasets). One already here with its checksum is not
 * downloaded again.
 */
export async function fetchAll(
  log: (s: string) => void = console.log,
  only: string[] = [],
  net: Net = NET,
  opts: { blobDir?: string } = {},
): Promise<void> {
  const manifest = await loadManifest();
  const wantSnapshots = only.includes('--snapshots');
  const named = only.filter((x) => x !== '--snapshots');
  for (const id of named) if (!manifest.datasets[id]) throw new Error(`${id} is not a dataset in the manifest`);
  const selected = new Set<string>(named);
  if (wantSnapshots) for (const [id] of snapshotDatasets(manifest)) selected.add(id);
  const all = selected.size === 0 && !wantSnapshots;
  for (const [id, d] of Object.entries(manifest.datasets)) {
    if (all || selected.has(id)) await fetchDataset(id, d, log, net, manifest.blobs, opts.blobDir);
  }
}

