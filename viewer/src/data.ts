// Loading a build: its index files, and records on demand. Every build with a `manifest.json`
// resolves logical paths to immutable content-addressed blobs (`blobs/<sha256>`), while legacy
// builds without `manifest.json` fall back transparently to direct URLs under the build directory.
import type { PlanetFile } from '../../core/planet.ts';
import { buildFileUrl, buildStore, type BuildIndex, type BuildManifest, type EntityRecord, type PeriodsFile, type SearchFile, type SeriesFile } from '../../core/records.ts';
import { PlateModels, RotationModel } from '../../core/rotation-model.ts';
import { PRESENT_YEAR } from '../../core/time.ts';
import type { AtlasIndex, SeaIndex } from '../../core/atlas.ts';
import type { FeatureIndex } from '../../core/featuretiles.ts';
import type { RocksIndex } from '../../core/rocks.ts';
import type { SubstrateFile } from '../../core/substrate.ts';
import type { FramesFile, Tileset } from '../../core/tileset.ts';
import { isSafeBuildId } from './ui/html.ts';

/** Resolve and fetch logical build files through a content-addressed manifest when present. */
export interface BuildFetch {
  base: string;
  manifest?: BuildManifest;
  url(path: string): string;
  getJSON<T>(path: string): Promise<T>;
  getBytes(path: string): Promise<ArrayBuffer>;
}

export interface Build extends BuildFetch {
  id: string;
  tileset: Tileset;
  frames: FramesFile;
  /** the plate model the records' frames move with */
  model: RotationModel;
  /** every plate model a field moves with, by the plate numbers the tiles carry */
  plates: PlateModels;
  periods: PeriodsFile;
  search: SearchFile;
  series: SeriesFile;
  planet: PlanetFile;
  features: FeatureIndex;
  /** who lived where, if this build has it */
  atlas?: AtlasIndex;
  /** the sea's atlas: what lived in the sea, and the genera a scene of it can draw */
  sea?: SeaIndex;
  /** the rock record of fossil sites, and the rule a place's ground is read from it by, if this build has them */
  rocks?: RocksIndex;
  substrate?: SubstrateFile;
}

/** Every logical URL the viewer fetched, in order; tests read it to check what scrubbing loads. */
export const fetchLog: string[] = [];
const MAX_FETCH_LOG = 5000;
function logFetch(url: string): void {
  fetchLog.push(url);
  if (fetchLog.length > MAX_FETCH_LOG) fetchLog.splice(0, fetchLog.length - MAX_FETCH_LOG);
}

export async function getJSON<T>(url: string, logUrl: string = url): Promise<T> {
  logFetch(logUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function getBytes(url: string, logUrl: string = url): Promise<ArrayBuffer> {
  logFetch(logUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

/** Fetch `<base>manifest.json` if present, returning `undefined` on 404 for legacy builds. */
export async function loadBuildManifest(base: string): Promise<BuildManifest | undefined> {
  const res = await fetch(`${base}manifest.json`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`${base}manifest.json: HTTP ${res.status}`);
  return (await res.json()) as BuildManifest;
}

/** Build-scoped fetcher that hits immutable content-addressed blobs while logging logical URLs. */
export function createBuildFetch(base: string, manifest?: BuildManifest): BuildFetch {
  const url = (path: string) => buildFileUrl(base, path, manifest);
  return {
    base,
    ...(manifest ? { manifest } : {}),
    url,
    getJSON: <T>(path: string) => getJSON<T>(url(path), base + path),
    getBytes: (path: string) => getBytes(url(path), base + path),
  };
}

/** The builds of a viewer at `root` (an absolute URL ending in a slash): the latest's id, and the directory they are in. */
export async function builds(root: string): Promise<{ latest: string; store: string }> {
  const url = new URL('builds/index.json', root).href;
  const index = await getJSON<BuildIndex>(url);
  return { latest: index.latest, store: buildStore(index, url) };
}

/** A build from `store`, the directory the builds are in. */
export async function loadBuild(store: string, id: string): Promise<Build> {
  if (!isSafeBuildId(id)) throw new Error(`Invalid build id: ${JSON.stringify(id)}`);
  const base = `${store}${id}/`;
  const manifest = await loadBuildManifest(base);
  const io = createBuildFetch(base, manifest);
  const tileset = await io.getJSON<Tileset>('tileset.json');
  const [frames, periods, search, series, planet, features, atlas, sea, rocks, substrate] = await Promise.all([
    io.getJSON<FramesFile>(tileset.files.frames),
    io.getJSON<PeriodsFile>(tileset.files.periods),
    io.getJSON<SearchFile>(tileset.files.search),
    io.getJSON<SeriesFile>(tileset.files.series),
    io.getJSON<PlanetFile>(tileset.files.planet),
    io.getJSON<FeatureIndex>(tileset.files.features),
    tileset.files.atlas ? io.getJSON<AtlasIndex>(tileset.files.atlas) : Promise.resolve(undefined),
    tileset.files.sea ? io.getJSON<SeaIndex>(tileset.files.sea) : Promise.resolve(undefined),
    tileset.files.rocks ? io.getJSON<RocksIndex>(tileset.files.rocks) : Promise.resolve(undefined),
    tileset.files.substrate ? io.getJSON<SubstrateFile>(tileset.files.substrate) : Promise.resolve(undefined),
  ]);
  // A period that still holds has no end; on the time axis it runs to the present.
  for (const p of periods.periods) {
    p.end ??= PRESENT_YEAR;
    for (const v of Object.values(p.variants ?? {})) v.end ??= PRESENT_YEAR;
  }
  const model = new RotationModel(frames.rotations);
  const plates = new PlateModels(model, (frames.models ?? []).map((m) => ({ source: m.source, offset: m.offset, model: new RotationModel(m.rotations) })));
  return { id, ...io, tileset, frames, model, plates, periods, search, series, planet, features, atlas, sea, rocks, substrate };
}

const records = new Map<string, Promise<EntityRecord>>();

export function loadRecord(build: Build, id: string): Promise<EntityRecord> {
  const key = `${build.id}:${id}`;
  let p = records.get(key);
  if (!p) {
    p = build.getJSON<EntityRecord>(`${build.tileset.files.records}${id}.json`).catch((err) => {
      records.delete(key);
      throw err;
    });
    records.set(key, p);
  }
  return p;
}
