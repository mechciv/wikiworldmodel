import type { SearchFile } from '../../../core/records.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { builds, createBuildFetch, loadBuildManifest } from '../data.ts';
import { isSafeBuildId } from '../ui/html.ts';

export async function loadAtlas(root: URL, requested: string | null) {
  const { latest, store } = await builds(root.href);
  const buildId = requested ?? latest;
  if (!isSafeBuildId(buildId)) throw new Error('Invalid build identifier.');
  const base = store + buildId + '/',
    io = createBuildFetch(base, await loadBuildManifest(base));
  const ts = await io.getJSON<Tileset>('tileset.json');
  return { search: await io.getJSON<SearchFile>(ts.files.search), buildId, root, label: 'Build ' + buildId };
}
