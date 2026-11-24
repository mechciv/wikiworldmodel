import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { blobPath, isBlobUrl } from './blobs.ts';
import { BLOBS, CACHE, REPO, safeJoin, safeUrlBasename, WORLD } from './paths.ts';
import { readYaml } from './util.ts';
import type { BlobStoreConfig, Dataset, Manifest } from './world.ts';

export type { BlobStoreConfig, Dataset, Manifest };

export async function loadManifest(root: string = WORLD): Promise<Manifest> {
  const m = await readYaml<Manifest>(join(root, 'manifest.yaml'));
  return {
    publish: m.publish,
    ...(m.blobs ? { blobs: m.blobs } : {}),
    datasets: Object.fromEntries(Object.entries(m.datasets).map(([id, d]) => [id, { ...d, id, file: 'manifest.yaml' }])),
  };
}

/** Each dataset version gets its own directory, named after it and keyed by its checksum. */
export function datasetDir(id: string, d: Dataset): string {
  return join(CACHE, 'datasets', `${id.replace(/^src:/, '').replace(/[^a-z0-9.-]+/g, '_')}@${d.fetch.sha256.slice(0, 12)}`);
}

export function datasetPath(id: string, d: Dataset): string {
  const dir = datasetDir(id, d);
  if (d.fetch.filename) {
    return safeJoin(dir, d.fetch.filename, `${id} download filename`);
  }
  if (isBlobUrl(d.fetch.url)) {
    return safeJoin(dir, `${d.fetch.sha256}.${d.fetch.format}`, `${id} download filename`);
  }
  const clean = safeJoin(dir, safeUrlBasename(d.fetch.url), `${id} download filename`);
  if (existsSync(clean)) return clean;
  // Preserve hits against caches populated before query strings (e.g. PANGAEA ?format=textfile) were stripped.
  const legacyName = d.fetch.url.split('/').pop();
  if (legacyName && legacyName !== '.' && legacyName !== '..' && !legacyName.includes('\0') && !legacyName.includes('\\')) {
    const legacy = safeJoin(dir, legacyName, `${id} download filename`);
    if (existsSync(legacy)) return legacy;
  }
  return clean;
}

/** Path of a named file inside a dataset: the archive member if it has `files`, else the download (or local blob cache). */
export function datasetFile(id: string, d: Dataset, name?: string): string {
  return resolveDatasetFile(id, d, name);
}

/**
 * Resolve a dataset file on disk, checking the extracted dataset cache first and falling back to
 * the local content-addressed blob cache (`.cache/blobs/<sha256>`) for non-archive `blob:` snapshots.
 */
export function resolveDatasetFile(id: string, d: Dataset, name?: string, blobDir: string = BLOBS): string {
  const cached = !name
    ? datasetPath(id, d)
    : (() => {
        const f = d.fetch.files?.[name];
        if (!f) throw new Error(`dataset ${id} has no file "${name}"`);
        return safeJoin(datasetDir(id, d), f.path, `${id} file "${name}"`);
      })();
  if (existsSync(cached)) return cached;
  if (!name && isBlobUrl(d.fetch.url)) {
    const bp = blobPath(d.fetch.sha256, blobDir);
    if (existsSync(bp)) return bp;
  }
  if (!name && d.fetch.url.startsWith('repo:')) {
    const legacy = safeJoin(REPO, d.fetch.url.slice('repo:'.length), `${id} repo path`);
    if (existsSync(legacy)) return legacy;
  }
  return cached;
}
