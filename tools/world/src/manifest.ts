import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { blobPath, isBlobUrl } from './blobs.ts';
import { BLOBS, CACHE, REPO, WORLD } from './paths.ts';
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
  const name = d.fetch.filename ?? (isBlobUrl(d.fetch.url) ? `${d.fetch.sha256}.${d.fetch.format}` : d.fetch.url.split('/').pop()!);
  return join(datasetDir(id, d), name);
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
  const cached = !name ? datasetPath(id, d) : (() => {
    const f = d.fetch.files?.[name];
    if (!f) throw new Error(`dataset ${id} has no file "${name}"`);
    return join(datasetDir(id, d), f.path);
  })();
  if (existsSync(cached)) return cached;
  if (!name && isBlobUrl(d.fetch.url)) {
    const bp = blobPath(d.fetch.sha256, blobDir);
    if (existsSync(bp)) return bp;
  }
  if (!name && d.fetch.url.startsWith('repo:')) {
    const legacy = join(REPO, d.fetch.url.slice('repo:'.length));
    if (existsSync(legacy)) return legacy;
  }
  return cached;
}

