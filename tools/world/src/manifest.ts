import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, safeJoin, safeUrlBasename, WORLD } from './paths.ts';
import { readYaml } from './util.ts';
import type { Dataset, Manifest } from './world.ts';

export type { Dataset, Manifest };

export async function loadManifest(root: string = WORLD): Promise<Manifest> {
  const m = await readYaml<Manifest>(join(root, 'manifest.yaml'));
  return { publish: m.publish, datasets: Object.fromEntries(Object.entries(m.datasets).map(([id, d]) => [id, { ...d, id, file: 'manifest.yaml' }])) };
}

/** Each dataset version gets its own directory, named after it and keyed by its checksum. */
export function datasetDir(id: string, d: Dataset): string {
  return join(CACHE, 'datasets', `${id.replace(/^src:/, '').replace(/[^a-z0-9.-]+/g, '_')}@${d.fetch.sha256.slice(0, 12)}`);
}

export function datasetPath(id: string, d: Dataset): string {
  const dir = datasetDir(id, d);
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

/** Path of a named file inside a dataset: the archive member if it has `files`, else the download. */
export function datasetFile(id: string, d: Dataset, name?: string): string {
  if (!name) return datasetPath(id, d);
  const f = d.fetch.files?.[name];
  if (!f) throw new Error(`dataset ${id} has no file "${name}"`);
  return safeJoin(datasetDir(id, d), f.path, `${id} file "${name}"`);
}
