import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const WORLD = join(REPO, 'world');
export const CACHE = join(REPO, '.cache');
export const BLOBS = process.env.WIKIWORLDMODEL_BLOB_DIR ? resolve(process.env.WIKIWORLDMODEL_BLOB_DIR) : join(CACHE, 'blobs');
export const BUILD_CACHE = process.env.WIKIWORLDMODEL_BUILD_CACHE ? resolve(process.env.WIKIWORLDMODEL_BUILD_CACHE) : join(CACHE, 'build');
export const DIST = join(REPO, 'dist');
export const BUILDS = join(DIST, 'builds');

/**
 * Join a relative path inside `root`, rejecting absolute paths, NUL bytes, and any traversal
 * that resolves to or outside `root`.
 */
export function safeJoin(root: string, rel: string, label = 'path'): string {
  if (!rel || rel.includes('\0') || isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) {
    throw new Error(`unsafe ${label}: ${JSON.stringify(rel)}`);
  }
  const base = resolve(root);
  const out = resolve(base, rel);
  if (!out.startsWith(base + sep)) {
    throw new Error(`${label} escapes ${base}: ${JSON.stringify(rel)}`);
  }
  return out;
}

/** Extract a safe single filename from a download URL (stripping query/fragment and rejecting traversal). */
export function safeUrlBasename(url: string): string {
  const clean = url.split(/[?#]/, 1)[0];
  const name = clean.split('/').pop() ?? '';
  if (!name || name === '.' || name === '..' || name.includes('\0') || name.includes('\\')) {
    throw new Error(`unsafe filename in URL: ${JSON.stringify(url)}`);
  }
  return name;
}
