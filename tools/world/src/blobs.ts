// Content-addressed immutable blob store, locally under .cache/blobs/<sha256> and remotely at
// <store>/blobs/<sha256> in R2/S3. Raw snapshots live here rather than in git, referenced only by
// sha256 in world/manifest.yaml; build artifacts also stream directly to content-addressed blobs.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, link, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { BLOBS, REPO } from './paths.ts';
import { sha256, sha256File } from './util.ts';
import type { BlobStoreConfig, Dataset, Manifest } from './world.ts';

const execFileAsync = promisify(execFile);

/** Default public R2 blob store when manifest.yaml does not specify one. */
export const DEFAULT_BLOB_STORE = 'https://builds.wikiworldmodel.org/';
export const DEFAULT_BLOB_PREFIX = 'blobs/';

const SHA256_RE = /^[0-9a-f]{64}$/;

export function isBlobUrl(url: string): boolean {
  return url.startsWith('blob:');
}

/** Extract the 64-char hex SHA-256 from a `blob:<sha256>` dataset URL. */
export function parseBlobHash(url: string): string | undefined {
  if (!url.startsWith('blob:')) return undefined;
  const hash = url.slice('blob:'.length);
  return SHA256_RE.test(hash) ? hash : undefined;
}

/** Path of a blob inside the local content-addressed store. */
export function blobPath(hash: string, dir: string = BLOBS): string {
  if (!SHA256_RE.test(hash)) throw new Error(`invalid blob sha256 "${hash}"`);
  return join(dir, hash);
}

export function hasBlob(hash: string, dir: string = BLOBS): boolean {
  return existsSync(blobPath(hash, dir));
}

/** Write bytes into the local content-addressed blob store atomically; no-op if already present. */
export async function putBlob(content: Uint8Array | string, dir: string = BLOBS): Promise<{ sha256: string; bytes: number; path: string; existed: boolean }> {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const hash = sha256(buf);
  const path = blobPath(hash, dir);
  if (existsSync(path)) return { sha256: hash, bytes: buf.byteLength, path, existed: true };
  await mkdir(dir, { recursive: true });
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.part`;
  try {
    await writeFile(tmp, buf);
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    if (existsSync(path)) return { sha256: hash, bytes: buf.byteLength, path, existed: true };
    throw err;
  }
  return { sha256: hash, bytes: buf.byteLength, path, existed: false };
}

/** Ingest an existing file on disk into the local blob store without holding it in RAM. */
export async function putBlobFile(srcPath: string, dir: string = BLOBS): Promise<{ sha256: string; bytes: number; path: string; existed: boolean }> {
  const hash = await sha256File(srcPath);
  const bytes = (await stat(srcPath)).size;
  const dest = blobPath(hash, dir);
  if (existsSync(dest)) return { sha256: hash, bytes, path: dest, existed: true };
  await mkdir(dir, { recursive: true });
  const tmp = `${dest}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.part`;
  try {
    await linkOrCopy(srcPath, tmp);
    await rename(tmp, dest);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    if (existsSync(dest)) return { sha256: hash, bytes, path: dest, existed: true };
    throw err;
  }
  return { sha256: hash, bytes, path: dest, existed: false };
}

export async function readBlob(hash: string, dir: string = BLOBS): Promise<Uint8Array> {
  return new Uint8Array(await readFile(blobPath(hash, dir)));
}

/** Hard-link `src` to `dest`, falling back to copying across filesystems or where hard links are forbidden. */
export async function linkOrCopy(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await rm(dest, { force: true });
  try {
    await link(src, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EXDEV' || code === 'EPERM' || code === 'EACCES' || code === 'ENOTSUP' || code === 'EMLINK') {
      await copyFile(src, dest);
    } else if (code === 'EEXIST') {
      await rm(dest, { force: true });
      await copyFile(src, dest);
    } else {
      throw err;
    }
  }
}

function ensureSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/** Ordered list of remote blob store base URLs (env override first, then manifest primary + mirrors). */
export function blobStoreUrls(config?: BlobStoreConfig): string[] {
  const out: string[] = [];
  const add = (u?: string) => {
    if (!u) return;
    const norm = ensureSlash(u.trim());
    if (norm && !out.includes(norm)) out.push(norm);
  };
  add(process.env.WIKIWORLDMODEL_BLOB_STORE);
  add(process.env.SNAPSHOT_STORE);
  add(config?.url ?? DEFAULT_BLOB_STORE);
  for (const m of config?.mirrors ?? []) add(m);
  return out;
}

/** Remote URL for a blob hash under a given store base URL and prefix. */
export function blobRemoteUrl(storeUrl: string, hash: string, prefix: string = DEFAULT_BLOB_PREFIX): string {
  const cleanPrefix = prefix.replace(/^\/+/, '');
  const withSlash = cleanPrefix && !cleanPrefix.endsWith('/') ? `${cleanPrefix}/` : cleanPrefix;
  return `${ensureSlash(storeUrl)}${withSlash}${hash}`;
}

/** Every snapshot dataset in the manifest that is stored in the content-addressed blob store. */
export function snapshotDatasets(manifest: Manifest): [string, Dataset][] {
  return Object.entries(manifest.datasets).filter(([, d]) => isBlobUrl(d.fetch.url));
}

/**
 * Populate missing snapshot blobs in `blobDir` by extracting legacy `world/snapshots/<filename>`
 * entries from a git revision (e.g. a pre-migration commit). Every extracted file is verified
 * against the manifest's `sha256` and `bytes`.
 */
export async function stageBlobsFromGit(
  manifest: Manifest,
  rev: string,
  opts: { blobDir?: string; repo?: string; log?: (s: string) => void } = {},
): Promise<{ staged: number; alreadyPresent: number; missing: string[] }> {
  const blobDir = opts.blobDir ?? BLOBS;
  const repo = opts.repo ?? REPO;
  const log = opts.log ?? console.log;
  let staged = 0;
  let alreadyPresent = 0;
  const missing: string[] = [];
  for (const [id, d] of snapshotDatasets(manifest)) {
    const hash = d.fetch.sha256;
    if (existsSync(blobPath(hash, blobDir)) && (await sha256File(blobPath(hash, blobDir))) === hash) {
      alreadyPresent++;
      continue;
    }
    const name = d.fetch.filename;
    if (!name) {
      missing.push(id);
      continue;
    }
    const spec = `${rev}:world/snapshots/${name}`;
    try {
      const { stdout } = await execFileAsync('git', ['show', spec], {
        cwd: repo,
        encoding: 'buffer',
        maxBuffer: Math.max(64 * 1024 * 1024, d.fetch.bytes + 1024 * 1024),
      });
      const bytes = new Uint8Array(stdout);
      const got = sha256(bytes);
      if (got !== hash || bytes.byteLength !== d.fetch.bytes) {
        throw new Error(`${id}: ${spec} checksum/size mismatch (got ${got}, ${bytes.byteLength} bytes)`);
      }
      await putBlob(bytes, blobDir);
      staged++;
      log(`staged ${id} (${hash.slice(0, 12)}, ${(bytes.byteLength / 1e6).toFixed(2)} MB) from ${spec}`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('checksum/size mismatch')) throw err;
      missing.push(id);
    }
  }
  return { staged, alreadyPresent, missing };
}
