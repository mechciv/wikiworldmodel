// The build: validate the world, solve its chronology, and compile it into a versioned 4D
// tile set plus the records, search index, periods, series, frames and coverage the viewer
// reads. Each stage is content-addressed in a DAG (dag.ts) and streams its outputs directly
// to disk blobs rather than buffering the entire build in RAM.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { decodeNode, LAND_BIT, type ClimateHeader, type ClimateRule } from '../../../../core/climate.ts';
import { decodeTile, encodeTile } from '../../../../core/container.ts';
import { bytesPrint } from '../../../../core/fingerprint.ts';
import { ladderCounts } from '../../../../core/ladder.ts';
import { searchRows } from './searchrows.ts';
import type { BuildManifest, CoverageFile, OverlaysFile, PeriodRecord, PeriodsFile, SearchFile, SeriesFile } from '../../../../core/records.ts';
import type { TerritoryFile } from '../../../../core/territory.ts';
import { bakeRotationModel, parseRot, PLATE_OFFSET, RotationModel } from '../../../../core/rotation-model.ts';
import { fromMa, parseDuration, parsePoint, PRESENT_YEAR, formatTime, toMa, type TimePointInput } from '../../../../core/time.ts';
import type { Basis, Feature, FieldInfo, FieldKeyframe, FramesFile, GeneratorConstraint, SiteInfo, TileHeader, TileRef, Tileset } from '../../../../core/tileset.ts';
import { GENERATOR as BIOME_TEXTURE, VERSION as BIOME_TEXTURE_VERSION, generateBiomeTexture, type BiomeTextureParams } from '../../../../world/generators/earth/biome/v1.ts';
import { GENERATOR as CLOUDS, VERSION as CLOUDS_VERSION, generateClouds, type CloudParams } from '../../../../world/generators/earth/clouds/v1.ts';
import { GENERATOR as SURFACE, VERSION as SURFACE_VERSION, generateSurface, type SurfaceParams } from '../../../../world/generators/earth/surface/v1.ts';
import { GENERATOR as GENERIC_LAND, VERSION as GENERIC_LAND_VERSION, generateGenericLand, genericLandAt, type GenericLandParams } from '../../../../world/generators/earth/generic-land/v1.ts';
import { claimGroups, solveScenario, solveVariants } from '../chronology.ts';
import { fieldAgesMa, fieldSource, importBlocks, importElevation, importMeanGrid, importMonths, importReliefPlates, PLATE_MODEL, tiledField, type MonthsMore } from '../importer.ts';
import { between, carriedReach, sceneShape, type ReliefFineHeader, type ReliefInfo } from '../../../../core/relief.ts';
import { fillFromOcean, WATER, waterMask, type Areas } from './relief.ts';
import { carriedInfo, encodeFineTile, fineLevel, type FineParams } from './shape.ts';
import { deepRivers, recentRivers, riverFiles, type DrainageParams, type Water } from './rivers.ts';
import { encodeSegments, grwlSegments, thin, tiles as segmentTiles } from './grwl.ts';
import { RiverNet, riverKeys, riverWidths, type RiverKey, type RiversInfo, type RiversKeysHeader, type RiversNetworkHeader, type RiversSet, type RiverWidths, type RiverWidthsHeader } from '../../../../core/rivers.ts';
import type { SceneWater } from '../../../../core/scene.ts';
import { WATER_REACH, keyFile, observedFiles, sceneWater } from '../../../../world/generators/life/water.ts';
import { seaLevelAt } from '../../../../core/sealevel.ts';
import { datasetFile } from '../manifest.ts';
import { BUILDS, REPO } from '../paths.ts';
import { sha256, stableStringify } from '../util.ts';
import { formatIssue, overlayTables, validateWorld } from '../validate/index.ts';
import { loadWorld, type Entity, type Field, type World } from '../world.ts';
import { attributionMarkdown, credits } from '../attribution.ts';
import { ClaimIndex } from '../claimindex.ts';
import { correctLand, correctRocks, correctUnits } from '../tables.ts';
import { gridPlaces, lifeTierOf, seaTierOf, tierCounts, TIER_SPANS, type ResolveWorld } from '../../../../core/resolve.ts';
import { coverageMatrix, type CoverageSource } from '../../../../core/coverage.ts';
import { glance, landShares } from '../../../../core/glance.ts';
import { spanOf, type PlanetFile } from '../../../../core/planet.ts';
import { insideRow, politiesAt, type PeopleFile, type PeopleHeader, type PolitiesFile } from '../../../../core/layers.ts';
import {
  anthromeTile,
  cellOf,
  classAtStep,
  nearestStep,
  tileKey,
  type AnthromeTile,
  type AnthromeTileHeader,
  type AssessmentsFile,
  type CitiesFile,
  type HousingCount,
  type LandscapeIndex,
  type TraditionsFile,
} from '../../../../core/landscape.ts';
import type { AtlasBin, AtlasIndex, SeaBin, SeaIndex } from '../../../../core/atlas.ts';
import type { RocksBin, RocksIndex } from '../../../../core/rocks.ts';
import { fieldFor, fieldLods, loadBlocks, loadRelief, loadSnapshots, paleoElevation, sliceField, SRC_H, SRC_W, tileGrid, timeBins, type GridField } from './fields.ts';
import { buildCities } from './city.ts';
import { climateGrid, climateKeyframes, encodeClimate, forestChecks, heightOn, monthsFiles, monthsKeyframes, partClasses, partsFiles, waterParamsOf, type ClimateKeyframe, type PartRead, type WaterOptions } from './climate.ts';
import { MONTHS_PARTS, MonthsTile, PARTS, PartsTile, partsFile, tilesNear, type MonthsInfo, type MonthsPart, type MonthsSet, type MonthsTileHeader, type PartInfo, type PartsTileHeader } from '../../../../core/months.ts';
import { monthsPlace, placeMonths } from '../../../../world/generators/life/climate.ts';
import type { PlaceWorld } from '../../../../world/generators/life/spec.ts';
import { FEATURE_INDEX } from '../../../../core/featuretiles.ts';
import { prominenceOf, tileFeatures } from './featuretiles.ts';
import { buildIce, type IceBuilt } from './ice.ts';
import { hazardLayer, peopleLayer, polityLayer, presentLayer, stateRowKey } from './layers.ts';
import { buildLandscape, disagreement, farmingAgreement, housing, housingCounts, HOUSING_TIMES, landscapeEntities, landscapeResolve, regionHyde, type LandscapeBuilt } from './landscape.ts';
import { fitCitiesModel } from '../holdout.ts';
import { kindIs } from '../world.ts';
import { regionReach } from '../../../../core/landscape.ts';
import type { PeopleScores } from '../../../../core/citypop.ts';
import { mappedLake, shoresNear } from '../../../../core/shorelines.ts';
import type { LayerInfo, LayerRow } from '../../../../core/fieldlayers.ts';
import { fieldLayers, mappedShores } from './fieldlayers.ts';
import { buildAtlas, type RecentClimateSource, type RocksAgeData } from './atlas.ts';
import { buildSeaAtlas, type SeaOut, type SeaParams } from './sea.ts';
import { buildRocks, type NoneWords, type RocksOut, type RocksParams } from './rocks.ts';
import { buildGround, groundResolve, type GroundBuilt } from './groundmaps.ts';
import { buildStrata, columnAt, todayOf, type StrataOut, type StrataParams } from './strata.ts';
import { strataColumns, type StrataColumns, type StrataFile, type StrataHeader } from '../../../../core/strata.ts';
import { bedrockAt, firstGround, firstRock, groundHeld, groundOfStrata, substrateOfRocks, substrateOfSoil, type GroundHeader, type GroundMaps, type SceneBedrock, type SceneSubstrate, type StrataOf, type SubstrateFile, type SubstrateRule } from '../../../../core/substrate.ts';
import type { LandSnapshot, RocksSnapshot } from '../pbdb.ts';
import type { ColumnsSnapshot } from '../macrostrat.ts';
import { buildScene, witnesses } from './scene.ts';
import { features as buildFeatures, holdersOf, labeller, periods as buildPeriods, records as buildRecords, search as buildSearch, sourceRecord, type Solved } from './records.ts';
import { buildThings, thingLists } from './things.ts';
import { worldThings } from '../things.ts';
import { thingClaims, THINGS_INDEX } from '../../../../core/things.ts';
import { planet as buildPlanet } from './planet.ts';
import { series as buildSeries } from './series.ts';
import { energyBalanceReport, RULES as ENERGY_BALANCE, seriesAt } from './energybalance.ts';
import { territory as buildTerritory } from './territory.ts';
import { tree as buildTree } from './tree.ts';
import { DagRunner } from './dag.ts';

// Share of PaleoDEM land that must fall inside the plate model's polygons at every snapshot,
// a coarse check that field and frames come from the same model. This pair scores 0.85–1.00
// (mean 0.93); the score drops when the grid is shifted against the polygons.
const MIN_ALIGNMENT = 0.8;

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function dataCommit(): { commit: string; dirty: boolean } {
  const commit = git(['rev-parse', 'HEAD']) || 'unknown';
  const dirty = git(['status', '--porcelain', '--', 'world', 'core', 'tools']) !== '';
  return { commit, dirty };
}

/** The alternatives this build shows: a steward decision recorded in each group. */
function shownAlternatives(world: World): Tileset['alternatives'] {
  return world.alternatives
    .filter((g) => g.type === 'group' && g.show?.length)
    .map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      default: g.default ?? null,
      members: g.show!.map((id) => world.alternative.get(id)!).map((a) => ({ id: a.id, title: a.title, description: a.description, kind: a.kind })),
    }));
}

function minMax(values: Iterable<number>): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/**
 * The span of the world, in astronomical years: from the oldest time any record, period,
 * field or series reaches to the furthest projection, and at least to the present.
 */
function worldSpan(periods: PeriodRecord[], found: SearchFile, grids: GridField[], series: SeriesFile['series']): [number, number] {
  const times: number[] = [PRESENT_YEAR];
  for (const p of periods) times.push(p.start, ...(Number.isFinite(p.end) ? [p.end] : []));
  for (const e of found.entities) for (const x of [e.time.start.best, e.time.end.best]) if (x !== null && Number.isFinite(x)) times.push(x);
  for (const g of grids) times.push(fromMa(g.coverMa[0]), fromMa(g.coverMa[1]));
  for (const s of series) times.push(s.points[0][0], s.points.at(-1)![0]);
  return minMax(times);
}

/** How many keyframes a file of a climate finer in time holds: each file shares its last with the next file's first. */
const CLIMATE_CHUNK = 12;
/** How many degrees a tile of the months (field:earth/climate-at-height) is square: one a scene fetches. */
const MONTHS_TILE_DEG = 10;
/** What a part by month is multiplied by on its way in from a NetCDF-4 file, which keeps whole numbers: to a hundredth of its unit. One by year is kept as it is. */
const PART_IMPORT_SCALE = 100;

/** How finely the coverage chart asks the layers: columns along the time control's scale, the grid in degrees, and times per column. */
const COVERAGE = { columns: 160, step: 5, samples: 3 };

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/** Read-only Map view over UTF-8 text files stored in the DAG's on-disk blob cache, avoiding retaining file text in RAM. */
class LazyTextMap extends Map<string, string> {
  constructor(private readonly dag: DagRunner) {
    super();
  }
  override has(key: string): boolean {
    return this.dag.hasFile(key);
  }
  override get(key: string): string | undefined {
    return this.dag.hasFile(key) ? this.dag.readBlobTextSync(key) : undefined;
  }
}

/** Pack exact ClimateKeyframe arrays (including unquantized Float32Array `nodes` and `water`) into a cache-only LWT1 blob. */
function packClimateCache(keys: ClimateKeyframe[]): Uint8Array {
  const arrays: (Uint8Array | Uint16Array | Float32Array)[] = [];
  const entries = keys.map((k) => {
    const values = arrays.length;
    arrays.push(k.values);
    const plate = arrays.length;
    arrays.push(k.plate);
    const nodes = arrays.length;
    arrays.push(k.nodes);
    let water: { runoff: number; loss: number; slow: number } | undefined;
    if (k.water) {
      const runoff = arrays.length;
      arrays.push(k.water.runoff);
      const loss = arrays.length;
      arrays.push(k.water.loss);
      const slow = arrays.length;
      arrays.push(k.water.slow);
      water = { runoff, loss, slow };
    }
    return { ageMa: k.ageMa, ...(k.frameMa !== undefined ? { frameMa: k.frameMa } : {}), values, plate, nodes, ...(water ? { water } : {}) };
  });
  return encodeTile({ format: 'lightworld-climate-cache@1', keys: entries }, arrays, stableStringify);
}

interface PackedClimateHeader {
  keys: Array<{
    ageMa: number;
    frameMa?: number;
    values: number;
    plate: number;
    nodes: number;
    water?: { runoff: number; loss: number; slow: number };
  }>;
}

function unpackClimateCache(bytes: Uint8Array): ClimateKeyframe[] {
  const { header, arrays } = decodeTile<PackedClimateHeader>(toArrayBuffer(bytes));
  return header.keys.map((m) => ({
    ageMa: m.ageMa,
    ...(m.frameMa !== undefined ? { frameMa: m.frameMa } : {}),
    values: arrays[m.values] as Uint8Array,
    plate: arrays[m.plate] as Uint16Array,
    nodes: arrays[m.nodes] as Float32Array,
    ...(m.water
      ? {
          water: {
            runoff: arrays[m.water.runoff] as Float32Array,
            loss: arrays[m.water.loss] as Float32Array,
            slow: arrays[m.water.slow] as Uint16Array,
          },
        }
      : {}),
  }));
}

/** Pack only the `water` arrays of recent climate keyframes into a cache-only LWT1 blob for the rivers stage. */
function packWaterCache(keys: ClimateKeyframe[]): Uint8Array {
  const arrays: (Float32Array | Uint16Array)[] = [];
  const entries = keys.map((k) => {
    let water: { runoff: number; loss: number; slow: number } | undefined;
    if (k.water) {
      const runoff = arrays.length;
      arrays.push(k.water.runoff);
      const loss = arrays.length;
      arrays.push(k.water.loss);
      const slow = arrays.length;
      arrays.push(k.water.slow);
      water = { runoff, loss, slow };
    }
    return { ageMa: k.ageMa, ...(water ? { water } : {}) };
  });
  return encodeTile({ format: 'lightworld-water-cache@1', keys: entries }, arrays, stableStringify);
}

interface PackedWaterHeader {
  keys: Array<{ ageMa: number; water?: { runoff: number; loss: number; slow: number } }>;
}

function unpackWaterCache(bytes: Uint8Array): Array<{ ageMa: number; water?: ClimateKeyframe['water'] }> {
  const { header, arrays } = decodeTile<PackedWaterHeader>(toArrayBuffer(bytes));
  return header.keys.map((m) => ({
    ageMa: m.ageMa,
    ...(m.water
      ? {
          water: {
            runoff: arrays[m.water.runoff] as Float32Array,
            loss: arrays[m.water.loss] as Float32Array,
            slow: arrays[m.water.slow] as Uint16Array,
          },
        }
      : {}),
  }));
}

/** Reconstruct a lazy LandscapeBuilt backed directly by DAG blobs on disk. */
function readLandscapeFromDag(dag: DagRunner): LandscapeBuilt {
  const index = JSON.parse(dag.readBlobTextSync('people/landscape.json')) as LandscapeIndex;
  const assessments = JSON.parse(dag.readBlobTextSync(index.assessments)) as AssessmentsFile;
  const cities = JSON.parse(dag.readBlobTextSync(index.cities)) as CitiesFile;
  const trad = JSON.parse(dag.readBlobTextSync(index.traditions)) as TraditionsFile;
  const decoded = new Map<string, AnthromeTile>();
  const tileOf = (name: string): AnthromeTile | undefined => {
    if (decoded.has(name)) return decoded.get(name);
    const path = `people/anthromes/${name}.lwt`;
    if (!dag.hasFile(path)) return undefined;
    const { header, arrays } = decodeTile<AnthromeTileHeader>(toArrayBuffer(dag.readBlobBytesSync(path)));
    const t = anthromeTile(header, arrays[0] as Uint8Array, arrays[1] as Uint8Array, arrays[2] as Uint8Array);
    decoded.set(name, t);
    return t;
  };
  const at = (lat: number, lon: number, t: number) => {
    const step = nearestStep(index.steps, t);
    if (step < 0) return undefined;
    const tile = tileOf(tileKey(lat, lon, index.tile_deg).key);
    if (!tile) return { anthrome: 0, region: 0 };
    const cell = cellOf(tile, lat, lon);
    if (cell < 0) return { anthrome: 0, region: 0 };
    return { anthrome: classAtStep(tile, cell, step), region: tile.region[cell] };
  };
  return {
    files: new Map(),
    index,
    assessments,
    traditions: trad.traditions,
    husbandry: trad.husbandry ?? [],
    agriculture: trad.agriculture ?? [],
    cities,
    span: [index.steps[0], index.steps.at(-1)!],
    assessed: [assessments.slices[0].year, assessments.slices.at(-1)!.year],
    at,
    tile: tileOf,
    classes: index.classes,
  };
}

/** Reconstruct GroundBuilt from `ground.lwt` on disk. */
function readGroundFromDag(dag: DagRunner): GroundBuilt {
  const { header, arrays } = decodeTile<GroundHeader>(toArrayBuffer(dag.readBlobBytesSync('ground.lwt')));
  const u8 = arrays as Uint8Array[];
  const maps: GroundMaps = {
    header,
    ...(header.soil ? { soil: u8[header.soil.array] } : {}),
    ...(header.bedrock ? { bedrock: u8[header.bedrock.array] } : {}),
  };
  return { header, arrays: u8, maps };
}

/** Reconstruct RocksOut (without buffering `files`) from `rocks/index.json` + bins on disk. */
function readRocksFromDag(dag: DagRunner): RocksOut {
  const index = JSON.parse(dag.readBlobTextSync('rocks/index.json')) as RocksIndex;
  const bins = index.bins.map((b) => JSON.parse(dag.readBlobTextSync(b.file)) as RocksBin);
  return { index, bins, files: new LazyTextMap(dag) };
}

/** Reconstruct StrataOut (without buffering `files`) from `strata.lwt` + column files on disk. */
function readStrataFromDag(dag: DagRunner): Pick<StrataOut, 'header' | 'rows' | 'runs' | 'columns' | 'of'> {
  const { header, arrays } = decodeTile<StrataHeader>(toArrayBuffer(dag.readBlobBytesSync('strata.lwt')));
  const columns: StrataColumns = { first: 1, last: header.columns, columns: [] };
  for (const ref of header.files) {
    const file = JSON.parse(dag.readBlobTextSync(ref.file)) as StrataFile;
    columns.columns.push(...strataColumns(file).columns);
  }
  const of: StrataOf = { field: header.field, source: header.source, ...(header.credit ? { credit: header.credit } : {}) };
  return { header, rows: arrays[header.grid.rows] as Uint32Array, runs: arrays[header.grid.runs] as Uint16Array, columns, of };
}

/** Reconstruct SeaOut backed lazily by DAG blobs on disk. */
function readSeaFromDag(dag: DagRunner): SeaOut {
  const index = JSON.parse(dag.readBlobTextSync('life/sea.json')) as SeaIndex;
  const bins = index.bins.map((b) => JSON.parse(dag.readBlobTextSync(b.file)) as SeaBin);
  return { index, bins, files: new LazyTextMap(dag) };
}

/** Reconstruct minimal Atlas handle backed lazily by DAG blobs on disk. */
function readAtlasFromDag(dag: DagRunner): { index: AtlasIndex; files: Map<string, string> } {
  const index = JSON.parse(dag.readBlobTextSync('life/atlas.json')) as AtlasIndex;
  return { index, files: new LazyTextMap(dag) };
}

/** What resolve reads, from what the build has made (core/resolve.ts). */
export function resolveWorldOf(
  world: World,
  solved: Solved,
  grids: GridField[],
  climateKeys: { ageMa: number }[],
  ice: Pick<IceBuilt, 'coverage'> | undefined,
  people: { header: { steps: number[] } } | undefined,
  polities: PolitiesFile | undefined,
  atlas: { index: AtlasIndex; files: Map<string, string> } | undefined,
  sea?: SeaOut,
  rivers?: { info: RiversInfo; seen?: Uint8Array },
  series: SeriesFile['series'] = [],
  planetFile?: PlanetFile,
): ResolveWorld {
  const land = world.generators.find((g) => g.id === GENERIC_LAND);
  const landParams = land?.params as unknown as GenericLandParams | undefined;
  const mask = land ? generateGenericLand(land.slots.globe.seed, landParams!) : undefined;
  const bins = new Map<number, AtlasBin>();
  const ages = climateKeys.map((k) => k.ageMa);
  const [minAge, maxAge] = ages.length ? minMax(ages) : [0, 0];
  let polLo = Infinity;
  let polHi = -Infinity;
  if (polities?.rows.length) {
    for (const r of polities.rows) {
      if (r.from < polLo) polLo = r.from;
      if (r.to > polHi) polHi = r.to;
    }
  }
  // The states of the last time asked: a grid of places is asked at one time after another.
  let rowsT = NaN;
  let rows: ReturnType<typeof politiesAt> = [];
  const rowsAt = (t: number) => {
    if (t !== rowsT && polities) {
      rows = politiesAt(polities, t);
      rowsT = t;
    }
    return rows;
  };
  return {
    planet: planetFile ?? buildPlanet(solved),
    geography: grids.map((g) => ({ title: g.field.title, mode: g.mode, coverage: [fromMa(g.coverMa[0]), fromMa(g.coverMa[1])] })),
    climate: ages.length ? [fromMa(maxAge), fromMa(minAge)] : undefined,
    climateModel: energyBalanceOf(world, series),
    ice: ice?.coverage,
    people: people ? [people.header.steps[0], people.header.steps.at(-1)!] : undefined,
    polities: polities?.rows.length ? [polLo, polHi] : undefined,
    polity: polities ? (lat, lon, t) => rowsAt(t).find((r) => insideRow(r, lon, lat))?.name : undefined,
    life: atlas
      ? (lat, lon, t) => {
          const land = lifeTierOf(
            atlas.index.bins,
            atlas.index.grid,
            (i) => {
              if (!bins.has(i)) bins.set(i, JSON.parse(atlas.files.get(atlas.index.bins[i].file)!) as AtlasBin);
              return bins.get(i);
            },
            lat,
            lon,
            t,
          );
          // Where the land's atlas has no land, the sea's list.
          if (land !== 'sea' || !sea) return land;
          return seaTierOf(sea.index.bins, sea.index.grid, (i) => sea.bins[i], lat, lon, t) ?? land;
        }
      : undefined,
    genericLand: mask && landParams ? (lat, lon) => genericLandAt(mask, landParams, lat, lon) : undefined,
    water: rivers
      ? {
          observed: rivers.info.observed && rivers.seen ? { span: rivers.info.observed.span, at: (lat, lon) => !!rivers.seen![seenCell(lat, lon)] } : undefined,
          model: rivers.info.sets.map((x) => x.span),
        }
      : undefined,
  };
}

/** The energy-balance model's answer for the climate (core/resolve.ts): the span of its freezing threshold, and its value. */
export function energyBalanceOf(world: World, series: SeriesFile['series']): ResolveWorld['climateModel'] {
  const field = world.fields.find((f) => f.rule === ENERGY_BALANCE.freeze);
  const freeze = field && series.find((x) => x.id === field.id);
  if (!freeze?.points.length) return undefined;
  return { span: [freeze.points[0][0], freeze.points.at(-1)![0]], freezeBelow: (t) => seriesAt(freeze.points, t) };
}

/** The 1° cell of a grid of where rivers were seen that a place falls in. */
const seenCell = (lat: number, lon: number) =>
  Math.max(0, Math.min(179, Math.floor(90 - lat))) * 360 +
  Math.max(0, Math.min(359, Math.floor((((lon + 180) % 360) + 360) % 360)));

/**
 * What answers each layer, and when (core/coverage.ts): the same things resolveWorldOf hands to resolve, each with its
 * span, its tier, and the grain of its grid and its keyframes where it has them. The coverage chart draws them under
 * their layer's row.
 */
export function coverageSources(
  world: World,
  range: [number, number],
  planet: PlanetFile,
  grids: GridField[],
  climate: { field: Field; keys: { ageMa: number }[] }[],
  ice: { field: Field; built: Pick<IceBuilt, 'coverage'> } | undefined,
  people: { header: { steps: number[]; res: number; source: string; title: string } } | undefined,
  polities: { field: Field; file: PolitiesFile } | undefined,
  atlas: { index: AtlasIndex } | undefined,
  series: SeriesFile['series'] = [],
  sea?: { index: SeaIndex },
  rivers?: RiversInfo,
): CoverageSource[] {
  const out: CoverageSource[] = [];
  // A span that runs on to the end of time stops where the world does: JSON has no infinity.
  const clip = ([a, b]: [number, number]): [number, number] => [Math.max(a, range[0]), Math.min(b, range[1])];
  const grain = (f: Field) => ({
    ...(f.grid?.kind === 'lonlat' ? { res_deg: f.grid.res_deg } : {}),
    ...(f.time?.step ? { step_yr: parseDuration(f.time.step) } : {}),
  });
  for (const ph of planet.planet?.phases ?? []) out.push({ layer: 'planet', id: ph.subject, title: ph.label, tier: 'evidence', span: clip(spanOf(ph, {})), lane: 'phases' });
  for (const g of grids) {
    // A coast drawn at the sea level of each time moves as often as that series has a row.
    const level = g.seaLevel ? series.find((x) => x.id === g.seaLevel) : undefined;
    const steps = level ? level.points.slice(1).map((p, i) => p[0] - level.points[i][0]).sort((a, b) => a - b) : [];
    out.push({ layer: 'geography', id: g.field.id, title: g.field.title, tier: 'model', span: [fromMa(g.coverMa[0]), fromMa(g.coverMa[1])], ...grain(g.field), ...(steps.length ? { step_yr: steps[steps.length >> 1] } : {}) });
  }
  // Generic land stands in wherever no grid covers the time and the planet has oceans.
  const land = world.generators.find((g) => g.id === GENERIC_LAND);
  if (land && planet.planet) {
    const covered = grids.map((g) => [fromMa(g.coverMa[0]), fromMa(g.coverMa[1])] as [number, number]).sort((a, b) => a[0] - b[0]);
    const [born, gone] = spanOf(planet.planet, {});
    let from = Math.max(born, range[0]);
    for (const [a, b] of [...covered, [Math.min(gone, range[1]), Math.min(gone, range[1])] as [number, number]]) {
      if (a > from) out.push({ layer: 'geography', id: land.id, title: land.title, tier: 'generic', span: [from, a], lane: 'generic-land' });
      from = Math.max(from, b);
    }
  }
  for (const c of climate) {
    if (!c.keys.length) continue;
    const ages = c.keys.map((k) => k.ageMa).sort((a, b) => a - b);
    // A step from the field where it gives one, else the commonest between its keyframes.
    const steps = ages.slice(1).map((a, i) => Math.round((a - ages[i]) * 1e6)).sort((a, b) => a - b);
    out.push({ layer: 'climate', id: c.field.id, title: c.field.title, tier: 'model', span: [fromMa(ages.at(-1)!), fromMa(ages[0])], ...(steps.length ? { step_yr: steps[steps.length >> 1] } : {}), ...grain(c.field) });
  }
  // The energy-balance model answers the climate where no climate model's run does, as the CO₂ it would take to freeze.
  const ebm = world.fields.find((f) => f.rule === ENERGY_BALANCE.freeze);
  const ebmSeries = ebm && series.find((x) => x.id === ebm.id);
  if (ebm && ebmSeries?.points.length) out.push({ layer: 'climate', id: ebm.id, title: ebm.title, tier: 'model', span: [ebmSeries.points[0][0], ebmSeries.points.at(-1)![0]], lane: 'energy-balance', ...grain(ebm) });
  if (ice) out.push({ layer: 'ice', id: ice.field.id, title: ice.field.title, tier: 'model', span: ice.built.coverage, ...grain(ice.field) });
  for (const ep of planet.episodes) out.push({ layer: 'ice', id: ep.subject, title: ep.label, tier: 'evidence', span: clip(spanOf(ep, {})), lane: 'glaciations' });
  if (rivers) {
    // The drainage on today's ground for the glacial cycles, and on each PaleoDEM before; the rivers Landsat saw today.
    for (const today of [true, false]) {
      const sets = rivers.sets.filter((x) => (x.frameMa === 0) === today);
      if (!sets.length) continue;
      const keys = sets.flatMap((x) => x.chunks.flatMap((c) => c.keyframesMa)).sort((a, b) => a - b);
      const steps = keys.slice(1).map((a, i) => Math.round((a - keys[i]) * 1e6)).sort((a, b) => a - b);
      out.push({ layer: 'water', id: rivers.field, title: rivers.title, tier: 'model', span: [Math.min(...sets.map((x) => x.span[0])), Math.max(...sets.map((x) => x.span[1]))], res_deg: today ? 0.1 : 1, ...(steps.length ? { step_yr: steps[steps.length >> 1] } : {}) });
    }
    if (rivers.observed) out.push({ layer: 'water', id: rivers.observed.field, title: rivers.observed.title, tier: 'evidence', span: rivers.observed.span });
  }
  if (atlas) {
    const bins = atlas.index.bins;
    const span: [number, number] = [Math.min(...bins.map((b) => b.from)), Math.max(...bins.map((b) => b.to))];
    const field = world.fields.find((f) => f.data?.as === 'community');
    out.push({ layer: 'life', id: atlas.index.source, title: world.source.get(atlas.index.source)?.title ?? atlas.index.source, tier: 'evidence', span });
    if (field) out.push({ layer: 'life', id: field.id, title: field.title, tier: 'model', span, res_deg: atlas.index.grid.step });
  }
  if (sea) {
    const bins = sea.index.bins;
    const span: [number, number] = [Math.min(...bins.map((b) => b.from)), Math.max(...bins.map((b) => b.to))];
    const field = world.fields.find((f) => f.data?.as === 'community-sea');
    out.push({ layer: 'life', id: sea.index.source, title: world.source.get(sea.index.source)?.title ?? sea.index.source, tier: 'evidence', span });
    if (field) out.push({ layer: 'life', id: field.id, title: field.title, tier: 'model', span, res_deg: sea.index.grid.step });
  }
  if (people) {
    const field = world.fields.find((f) => f.data?.as === 'people');
    out.push({ layer: 'people', id: field?.id ?? people.header.source, title: people.header.title, tier: 'model', span: [people.header.steps[0], people.header.steps.at(-1)!], res_deg: people.header.res });
  }
  if (polities?.file.rows.length) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of polities.file.rows) {
      if (r.from < lo) lo = r.from;
      if (r.to > hi) hi = r.to;
    }
    out.push({ layer: 'polity', id: polities.field.id, title: polities.field.title, tier: 'evidence', span: [lo, hi] });
  }
  return out.map((s) => ({ ...s, span: clip(s.span) })).filter((s) => s.span[1] > s.span[0]);
}

/** What the overlays say of each row they name, with what the row itself says, as the inspect panel shows it. */
function overlayFile(world: World, index: ClaimIndex): OverlaysFile | undefined {
  if (!world.overlays.length) return undefined;
  const rows: OverlaysFile['rows'] = {};
  for (const o of [...world.overlays].sort((a, b) => (a.row < b.row ? -1 : a.row > b.row ? 1 : 0))) {
    rows[o.row] = {
      dataset: o.dataset,
      key: o.key,
      same_as: o.same_as,
      note: o.note,
      claims: index.of(o.row).map((c) => ({ prop: c.prop, value: c.value, origin: c.origin, rank: c.rank, status: c.status, level: c.level, author: c.author, sources: c.sources, note: c.note })),
    };
  }
  return { format: 'lightworld-overlays@1', rows };
}

/** Claims and wanted records, and how much of each tile's area and era rests on each basis. */
function coverage(world: World, wanted: { ref: string; from: { file: string; where: string }[] }[], feats: Feature[], tiles: TileRef[]): CoverageFile {
  const all = [...world.entities.flatMap((e) => [...e.claims, ...e.relations]), ...world.overlays.flatMap((o) => o.claims)];
  const byBasis: Record<string, number> = {};
  for (const c of all) byBasis[c.basis] = (byBasis[c.basis] ?? 0) + 1;
  const visible = (f: Feature, span: [number, number]) => {
    const lo = Number.isFinite(f.time.start.lo) ? f.time.start.lo : f.time.start.best ?? -Infinity;
    const hi = f.time.end.best === null ? Infinity : Number.isFinite(f.time.end.hi) ? f.time.end.hi : f.time.end.best;
    return lo <= span[1] && hi >= span[0];
  };
  return {
    claims: {
      total: all.length,
      byBasis,
      unsourced: all.filter((c) => c.unsourced).map((c) => c.ref),
      disputed: all.filter((c) => c.status === 'disputed').map((c) => c.ref),
      proposed: all.filter((c) => c.status === 'proposed').length,
      withoutLocator: all.filter((c) => c.sources.some((s) => !s.loc)).length,
      ladder: ladderCounts(all),
    },
    wanted: wanted.map((w) => ({ ref: w.ref, from: w.from.map((f) => `${f.file} ${f.where}`) })),
    tiles: tiles.map((t) => {
      const counts: Partial<Record<Basis, number>> = {};
      for (const f of feats) {
        const [w, s, e, n] = t.bbox;
        const inside = f.location.lon >= w && (e >= 180 ? f.location.lon <= e : f.location.lon < e) && f.location.lat >= s && f.location.lat <= n;
        if (!visible(f, t.time) || (t.lod > 0 && !inside)) continue;
        counts[f.basis.place] = (counts[f.basis.place] ?? 0) + 1;
      }
      return { tile: t.id, bbox: t.bbox, time: t.time, features: counts };
    }),
  };
}

/** What the viewer needs to know of a gridded field: what it is, and when it covers. */
function fieldInfo(world: World, g: GridField): FieldInfo {
  const f = g.field;
  const src = world.source.get(f.data!.from);
  const coastline = world.fields.find((c) => c.derived && c.rule === 'isoline' && c.from?.[0] === f.id);
  return {
    id: f.id,
    title: f.title,
    mode: g.mode,
    description: f.description,
    units: f.unit,
    datum: f.datum,
    basis: f.basis!,
    interpolation: f.interp!,
    source: f.data!.from,
    sourceRecord: src ? sourceRecord(src) : undefined,
    coverage: [fromMa(g.coverMa[0]), fromMa(g.coverMa[1])],
    keyframesMa: g.snapshots.map((s) => s.ageMa),
    projection: f.projection ? { method: f.projection.method, until: parsePoint(f.projection.until as TimePointInput).t, note: f.projection.note } : undefined,
    coastline: coastline ? { id: coastline.id, title: coastline.title, isolineM: coastline.isoline_m ?? 0, ...(g.seaLevel ? { seaLevel: g.seaLevel } : {}) } : undefined,
    spread: f.spread,
    res_deg: g.res,
  };
}

/** Deterministic fingerprint of a subset of entities together with their solved times/bounds. */
function entitiesKey(entities: Entity[], solved: Solved): string {
  const b = solved.sol.bounds;
  const c = solved.centres.ok ? solved.centres.bounds : undefined;
  const rows = entities
    .map((e) => {
      const pts = [
        `${e.id}|start`,
        `${e.id}|end`,
        `${e.id}|date`,
        ...e.phases.flatMap((p) => [`${e.id}@${p.id}|start`, `${e.id}@${p.id}|end`]),
      ];
      return {
        id: e.id,
        kind: e.kind,
        same_as: e.same_as,
        phases: e.phases,
        claims: e.claims,
        relations: e.relations,
        bounds: pts.map((p) => [b.get(p)?.lo, b.get(p)?.hi, c?.get(p)?.lo, c?.get(p)?.hi]),
      };
    })
    .sort((x, y) => (x.id < y.id ? -1 : 1));
  return sha256(stableStringify(rows));
}

export async function runBuild(args: string[]): Promise<number> {
  const log = (s: string) => console.log(s);
  const noCache = args.includes('--no-cache');
  const cacheIdx = args.indexOf('--cache-dir');
  const cacheDir = cacheIdx >= 0 ? args[cacheIdx + 1] : undefined;
  const dag = new DagRunner({ cacheDir, noCache, log });

  // 1. Validate once, pre-loading overlay tables once so ClaimIndex reuses them and
  //    chronology validation returns picture-level STN solutions for step 3 to reuse.
  const world = await loadWorld();
  const tables = await overlayTables(world);
  // The things of lists, and which record each is (docs/plans/ENTITIES.md, steps 2 and 4): read once, for the
  // references the validator checks and for search, pages and the tree.
  const listed = await worldThings(world);
  const { issues, wanted, chronology } = await validateWorld(world, { tables, things: listed.things });
  for (const i of issues) if (i.level !== 'info') log(formatIssue(i));
  if (issues.some((i) => i.level === 'error')) {
    log('build: the world does not validate');
    return 1;
  }

  const dsKey = (id: string | undefined) => {
    if (!id) return undefined;
    const d = world.manifest.datasets[id];
    return d ? { id, sha256: d.fetch.sha256, credit: d.credit, license: d.license } : { id };
  };
  const srcKey = (id: string | undefined) => {
    const s = id ? world.source.get(id) : undefined;
    return s ? sourceRecord(s) : undefined;
  };
  const fieldKey = (f: Field | undefined) =>
    f
      ? {
          id: f.id,
          title: f.title,
          description: f.description,
          kind: f.kind,
          quantity: f.quantity,
          unit: f.unit,
          datum: f.datum,
          basis: f.basis,
          interp: f.interp,
          grid: f.grid,
          time: f.time,
          projection: f.projection,
          data: f.data,
          derived: f.derived,
          rule: f.rule,
          from: f.from,
          refines: f.refines,
          isoline_m: f.isoline_m,
          moves_with: f.moves_with,
          params: f.params,
          spread: f.spread,
          uncertainty: f.uncertainty,
          rows: f.rows,
          layer: f.layer,
          source: f.source,
          dataset: dsKey(f.data?.from),
          sourceRecord: srcKey(f.derived ? f.source?.ref : f.data?.from),
        }
      : undefined;

  // 2. Frames: the plate model's rotations, baked for the client.
  const pm = world.manifest.datasets[PLATE_MODEL];
  const rot = await readFile(datasetFile(PLATE_MODEL, pm, 'rotations'), 'latin1');
  const baked = bakeRotationModel(parseRot(rot));
  const model = new RotationModel(baked);

  // Rows are claims (docs/STRUCTURE.md section 3.1): reuse the tables already loaded for validation.
  const claims = ClaimIndex.from(world, tables);
  const fixesOf = (as: string) => {
    const f = world.fields.find((x) => x.data?.as === as);
    return f ? claims.corrections(f.data!.from) : new Map<string, { prop: string; value: unknown }[]>();
  };
  const fixesKey = (m: Map<string, { prop: string; value: unknown }[]>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  for (const f of world.fields.filter((x) => x.data?.as === 'community' && x.rows)) {
    const snap = world.landFossils.get(f.data!.from);
    if (!snap) continue;
    const { snap: corrected, unapplied } = correctLand(snap, f.rows!, claims.corrections(f.data!.from));
    world.landFossils.set(f.data!.from, corrected);
    for (const u of unapplied) log(`warning rows        ${f.data!.from} ${u}`);
  }

  // 3. Chronology: reuse the picture-level solutions validation already computed.
  const sol = chronology?.defaultSol ?? solveScenario(world);
  if (!sol.ok) throw new Error('unreachable: validated world has no solution');
  const alternatives = shownAlternatives(world);
  const altIds = alternatives
    .flatMap((g) => g.members.map((m) => m.id))
    .filter((id) => world.entities.some((e) => [...e.claims, ...e.relations].some((c) => c.alt === id)));
  const solved: Solved = {
    world,
    sol,
    centres: chronology?.defaultCentres ?? solveScenario(world, {}, true),
    // An alternative that no claim names, such as one that changes only a field, moves no record.
    variants: solveVariants(world, altIds, chronology),
    groups: claimGroups(world),
    model,
  };
  // Who held each perspective, and when, as the records that held it say.
  for (const g of alternatives) {
    for (const m of g.members) {
      const held = holdersOf(solved, m.id);
      if (held.length) m.heldBy = held;
    }
  }
  // Compute planet.json once and reuse across planet stage, energy balance, scene, witnesses, and coverage.
  const planetFile = buildPlanet(solved);
  const planetHash = sha256(stableStringify(planetFile));

  // 4. Gridded fields: elevation grids, and before them the plate model's blocks.
  //    Fine 15″ relief tiles are deferred to their own content-addressed DAG stage so we never
  //    scan the GeoTIFF on cache hits or retain fine.tiles in RAM across the entire build.
  const grids: GridField[] = [];
  const imports: Record<string, string> = {};
  let pygplates = '';
  let reliefFineInput:
    | {
        grid: GridField;
        datasetPath: string;
        datasetSha: string;
        mean: Awaited<ReturnType<typeof importMeanGrid>>;
        params: FineParams;
      }
    | undefined;
  for (const f of world.fields.filter(tiledField)) {
    if (fieldSource(f) === 'relief') {
      // Today's relief, averaged onto the field's grid, and the plates under it: one snapshot, which its coastline
      // reads at the sea level of each time the field covers.
      const dir = await importReliefPlates(f, log);
      imports[f.id] = dir.split('/').pop()!;
      const d = world.manifest.datasets[f.data!.from];
      const res = (f.grid as { res_deg: number }).res_deg;
      const started = Date.now();
      const relief = await importMeanGrid(datasetFile(d.id, d), d.fetch.sha256, res, log);
      // Hollows today's ocean does not reach are held at the pass they would spill over, so that only the ocean floods.
      const water = f.data!.water;
      const areas = async (id: string) => JSON.parse(await readFile(datasetFile(id, world.manifest.datasets[id]), 'utf8')) as Areas;
      const mask = water ? waterMask(await areas(water.ocean), await areas(water.lakes), relief.nx, relief.ny, res) : undefined;
      const ground = mask ? fillFromOcean(relief.data, mask, relief.nx, relief.ny) : Int16Array.from(relief.data, (v) => Math.max(-32768, Math.min(32767, Math.round(v))));
      const snap = await loadRelief(dir, relief, ground);
      const coast = world.fields.find((c) => c.derived && c.rule === 'isoline' && c.from?.[0] === f.id);
      const oldest = toMa(parsePoint(f.time!.lo as TimePointInput).t);
      const until = f.projection ? toMa(parsePoint(f.projection.until as TimePointInput).t) : 0;
      // The drainage routes over each cell's lowest ground, so that a gorge narrower than a cell stays open.
      const drain = mask ? { z: relief.low, ocean: Uint8Array.from(mask, (v) => (v === WATER.ocean ? 1 : 0)), lakes: Uint8Array.from(mask, (v) => (v === WATER.lake ? 1 : 0)) } : undefined;
      const gridEntry: GridField = { field: f, mode: 'elevation', snapshots: [snap], coverMa: [oldest, until], res, seaLevel: coast?.from?.[1], drain };
      grids.push(gridEntry);
      const fineParams = f.params?.fine as FineParams | undefined;
      if (fineParams) {
        reliefFineInput = { grid: gridEntry, datasetPath: datasetFile(d.id, d), datasetSha: d.fetch.sha256, mean: relief, params: fineParams };
      }
      log(`relief  ${f.id}: ${snap.src!.width} × ${snap.src!.height} nodes at ${res}° from ${d.id} in ${((Date.now() - started) / 1000).toFixed(1)} s${coast?.from?.[1] ? `; its coast at the sea level of ${coast.from[1]}` : ''}`);
      continue;
    }
    const mode = fieldSource(f) as 'elevation' | 'blocks';
    const dir = mode === 'elevation' ? await importElevation(f, log) : await importBlocks(f, log);
    imports[f.id] = dir.split('/').pop()!;
    const { meta, snapshots } = mode === 'elevation' ? await loadSnapshots(dir) : await loadBlocks(dir);
    pygplates = meta.pygplates;
    if (mode === 'elevation') {
      for (const s of (meta as Awaited<ReturnType<typeof loadSnapshots>>['meta']).snapshots) {
        if (s.alignment.land_inside_polygons < MIN_ALIGNMENT) {
          log(`error   fields      ${f.id} ${s.ageMa} Ma: only ${s.alignment.land_inside_polygons} of its land lies inside the plate model's polygons (min ${MIN_ALIGNMENT}); field and frames disagree`);
          return 1;
        }
      }
    }
    const { maxAgeMa } = fieldAgesMa(f);
    const oldest = Math.min(maxAgeMa, Math.max(...snapshots.map((s) => s.ageMa)));
    const youngest = Math.min(...snapshots.map((s) => s.ageMa));
    const until = f.projection ? toMa(parsePoint(f.projection.until as TimePointInput).t) : youngest;
    grids.push({ field: f, mode, snapshots, coverMa: [oldest, Math.min(youngest, until)], res: (f.grid as { res_deg: number }).res_deg });
  }
  // A plate model other than the first writes its plates in a range of their own, and its rotations go with the frames.
  const otherModels = [...new Set(grids.map((g) => g.field.moves_with).filter((m): m is string => !!m && m !== PLATE_MODEL))].sort();
  for (const g of grids) {
    const i = otherModels.indexOf(g.field.moves_with ?? '');
    if (i >= 0) g.plateOffset = (i + 1) * PLATE_OFFSET;
  }
  // Where two fields meet, the younger one is preferred at the shared age, and of two that end together the one that
  // covers less, which is the finer.
  grids.sort((a, b) => a.coverMa[1] - b.coverMa[1] || a.coverMa[0] - a.coverMa[1] - (b.coverMa[0] - b.coverMa[1]));
  const plateIds = new Set<number>();
  for (const g of grids) for (const s of g.snapshots) for (const p of s.plate) if (p) plateIds.add(p + (g.plateOffset ?? 0));
  const plateIndexList = [0, ...[...plateIds].sort((a, b) => a - b)];
  const plateIndex = new Map(plateIndexList.map((p, i) => [p, i]));
  const gridsKey = grids.map((g) => ({
    id: g.field.id,
    import: imports[g.field.id],
    water: g.field.data?.water ? { ocean: dsKey(g.field.data.water.ocean), lakes: dsKey(g.field.data.water.lakes) } : undefined,
    mode: g.mode,
    coverMa: g.coverMa,
    res: g.res,
    plateOffset: g.plateOffset ?? 0,
    seaLevel: g.seaLevel ?? null,
    ages: g.snapshots.map((s) => s.ageMa),
  }));

  // Stage: frames.json
  const otherModelSpecs = otherModels.map((id, i) => ({
    id,
    offset: (i + 1) * PLATE_OFFSET,
    dataset: dsKey(id),
    youngest: Math.min(...grids.filter((g) => g.field.moves_with === id).map((g) => Math.min(...g.snapshots.map((s) => s.ageMa)))),
  }));
  await dag.runStage(
    'frames',
    {
      plateModel: dsKey(PLATE_MODEL),
      otherModels: otherModelSpecs,
      plateIndexList,
      frames: world.frames.map((f) => ({ id: f.id, title: f.title, kind: f.kind, plate: f.kind === 'plate' ? f.transform?.plate : undefined, entity: f.entity })),
    },
    async (sink) => {
      const models = await Promise.all(
        otherModels.map(async (id, i) => {
          const d = world.manifest.datasets[id];
          const texts = await Promise.all(['rotations', 'rotations_deep'].filter((n) => d.fetch.files?.[n]).map((n) => readFile(datasetFile(id, d, n), 'latin1')));
          const youngest = Math.min(...grids.filter((g) => g.field.moves_with === id).map((g) => Math.min(...g.snapshots.map((s) => s.ageMa))));
          const all = bakeRotationModel(parseRot(texts.join('\n')));
          return { source: id, offset: (i + 1) * PLATE_OFFSET, rotations: { ...all, sequences: all.sequences.filter((q) => q.ages[q.ages.length - 1] >= youngest) } };
        }),
      );
      const frames: FramesFile = {
        rotations: baked,
        ...(models.length ? { models } : {}),
        plateIndex: plateIndexList,
        frames: world.frames.map((f) => ({ id: f.id, title: f.title, kind: f.kind, plate: f.kind === 'plate' ? f.transform?.plate : undefined, entity: f.entity })),
      };
      await sink.put('frames.json', stableStringify(frames));
      return {};
    },
    { codeFiles: ['core/rotation-model.ts'] },
  );

  // 5. Stage: generators (fingerprints of procedural slots).
  const genSpecs = [
    { id: CLOUDS, version: CLOUDS_VERSION, run: (seed: string, p: unknown) => generateClouds(seed, p as CloudParams) },
    { id: SURFACE, version: SURFACE_VERSION, run: (seed: string, p: unknown) => generateSurface(seed, p as SurfaceParams) },
    { id: BIOME_TEXTURE, version: BIOME_TEXTURE_VERSION, run: (seed: string, p: unknown) => generateBiomeTexture(seed, p as BiomeTextureParams) },
    { id: GENERIC_LAND, version: GENERIC_LAND_VERSION, run: (seed: string, p: unknown) => generateGenericLand(seed, p as GenericLandParams) },
  ];
  for (const c of genSpecs) {
    const gen = world.generators.find((g) => g.id === c.id);
    if (!gen || gen.version !== c.version) {
      log(`error   generators  ${c.id}: the record is version ${gen?.version ?? 'missing'}, the code version ${c.version}`);
      return 1;
    }
  }
  const genStage = await dag.runStage(
    'generators',
    genSpecs.map((c) => {
      const gen = world.generators.find((g) => g.id === c.id)!;
      return { id: gen.id, version: gen.version, slots: gen.slots, params: gen.params, outputs: gen.outputs };
    }),
    async () => {
      const generators: GeneratorConstraint[] = [];
      for (const c of genSpecs) {
        const gen = world.generators.find((g) => g.id === c.id)!;
        for (const [slot, s] of Object.entries(gen.slots)) {
          generators.push({
            generator: gen.id,
            version: gen.version,
            slot,
            seed: s.seed,
            basis: gen.outputs.basis as 'procedural',
            params: gen.params,
            output: bytesPrint('pixels', c.run(s.seed, gen.params)),
          });
        }
      }
      return { generators };
    },
    {
      codeFiles: [
        'world/generators/earth/clouds/v1.ts',
        'world/generators/earth/surface/v1.ts',
        'world/generators/earth/biome/v1.ts',
        'world/generators/earth/generic-land/v1.ts',
        'core/fingerprint.ts',
      ],
    },
  );
  const generators = genStage.meta.generators;

  // 6. Series, records, periods, search and features, whose times set the span of the tile set.
  const seriesFields = world.fields.filter((f) => f.grid?.kind === 'series');
  const seriesProps = new Set(seriesFields.map((f) => f.data?.prop).filter((p): p is string => !!p));
  const seriesClaimInputs = seriesProps.size
    ? world.entities
        .flatMap((e) => e.claims.filter((c) => seriesProps.has(c.prop) || c.prop === 'date' || c.prop === 'start' || c.prop === 'end'))
        .map((c) => ({ ref: c.ref, subject: c.subject, prop: c.prop, value: c.value, rank: c.rank, status: c.status, alt: c.alt }))
    : [];
  const iceFieldForSeries = world.fields.find((f) => fieldSource(f) === 'ice');
  const seriesStage = await dag.runStage(
    'series',
    {
      fields: seriesFields.map(fieldKey),
      iceField: fieldKey(iceFieldForSeries),
      models: world.models.filter((m) => m.outputs?.some((o) => seriesFields.some((f) => f.id === o))).map((m) => ({ id: m.id, outputs: m.outputs, uncertainty: m.uncertainty })),
      claims: seriesClaimInputs,
    },
    async (sink) => {
      const list = await buildSeries(world);
      await sink.put('series.json', stableStringify({ series: list } satisfies SeriesFile));
      return { count: list.length };
    },
    { codeFiles: ['tools/world/src/build/series.ts', 'tools/world/src/build/energybalance.ts', 'tools/world/src/build/ice.ts'] },
  );
  const seriesList = (JSON.parse(dag.readBlobTextSync('series.json')) as SeriesFile).series;
  const seriesSha = seriesStage.files['series.json'].sha256;

  const allFeatures = buildFeatures(solved);
  const periodList = buildPeriods(solved);
  const periodHash = sha256(stableStringify(periodList));
  // A record an import made that is the same thing as a written one is found as the written one.
  const found = buildSearch(solved, allFeatures);
  for (const e of found.entities) {
    const same = listed.identity.same.get(e.id);
    if (same) e.same = same;
  }
  const span = worldSpan(periodList, found, grids, seriesList);

  // Stage: features/*.json
  const rule = world.vocab.prominence;
  const prominent = new Map(world.entities.map((e) => [e.id, prominenceOf(rule, e)]));
  const featuresStage = await dag.runStage(
    'features',
    {
      features: sha256(stableStringify(allFeatures)),
      prominence: rule,
      scores: [...prominent.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    },
    async (sink) => {
      const tiledFeatures = tileFeatures(allFeatures, rule, (f) => prominent.get(f.id) ?? 0);
      for (const [path, content] of tiledFeatures.files) await sink.put(path, content);
      return { tileCount: tiledFeatures.index.tiles.length, featureCount: Object.keys(tiledFeatures.index.where).length };
    },
    { codeFiles: ['tools/world/src/build/featuretiles.ts', 'core/featuretiles.ts'] },
  );
  log(`features ${featuresStage.meta.tileCount} tiles, ${featuresStage.meta.featureCount} features`);

  // 7. Stage: terrain-tiles (stream each .lwt straight to disk; never retain tile bytes in RAM).
  const terrainStage = await dag.runStage(
    'terrain-tiles',
    { grids: gridsKey, span, plateIndexList, generators },
    async (sink) => {
      const cuts = grids.flatMap((g) => [g.snapshots[0].ageMa, g.snapshots.at(-1)!.ageMa, g.coverMa[0]]);
      const lods = fieldLods(timeBins(toMa(span[0]), toMa(span[1]), cuts), grids);
      const tiles: TileRef[] = [];
      for (const lod of lods) {
        for (let ci = 0; ci < lod.cells.length; ci++) {
          const cell = lod.cells[ci];
          const grid = tileGrid(lod, cell);
          const x = ci % lod.across;
          const y = Math.floor(ci / lod.across);
          for (let bi = 0; bi < lod.binsMa.length; bi++) {
            const [older, younger] = lod.binsMa[bi];
            const g = fieldFor(grids, [older, younger]);
            const arrays: (Int16Array | Uint16Array)[] = [];
            let field: TileHeader['field'] = null;
            if (g) {
              // Every keyframe inside the span, and the ones on either side of it, which the times inside it blend between.
              const ages = g.snapshots.map((s) => s.ageMa);
              const below = ages.filter((a) => a <= younger);
              const above = ages.filter((a) => a >= older);
              const lo = below.length ? Math.max(...below) : Math.min(...ages);
              const hi = above.length ? Math.min(...above) : Math.max(...ages);
              const keys = g.snapshots.filter((s) => s.ageMa >= lo && s.ageMa <= hi);
              const keyframes: FieldKeyframe[] = sliceField(keys, grid, plateIndex, g.plateOffset).map((k) => {
                arrays.push(k.elev, k.plate);
                return { t: fromMa(k.ageMa), ageMa: k.ageMa, elev: arrays.length - 2, plate: arrays.length - 1 };
              });
              field = { id: g.field.id, grid, keyframes };
            }
            const time: [number, number] = [fromMa(older), fromMa(younger)];
            const id = `${lod.lod}/${x}-${y}/b${bi}`;
            const parentBin = lods[0].binsMa.findIndex(([o, yy]) => younger >= yy && older <= o);
            const header: TileHeader = {
              format: 'lightworld-tile@4',
              id,
              lod: lod.lod,
              bbox: cell,
              time,
              field,
              generators: lod.lod === 0 ? generators : [],
            };
            const bytes = encodeTile(header as unknown as Record<string, unknown>, arrays, stableStringify);
            const url = `tiles/${lod.lod}/${x}-${y}/b${bi}.lwt`;
            const ref = await sink.put(url, bytes);
            tiles.push({ id, lod: lod.lod, bbox: cell, time, url, bytes: ref.bytes, sha256: ref.sha256, parent: lod.lod === 0 || parentBin < 0 ? null : `0/0-0/b${parentBin}` });
          }
        }
      }
      return {
        tiles,
        lods: lods.map((l) => ({ lod: l.lod, step: l.step, cell: [l.cells[0][2] - l.cells[0][0], l.cells[0][3] - l.cells[0][1]] as [number, number], binsMa: l.binsMa })),
      };
    },
    { codeFiles: ['tools/world/src/build/fields.ts', 'core/container.ts'] },
  );
  const tiles = terrainStage.meta.tiles;
  const tilesetLods = terrainStage.meta.lods;

  // Stage: relief-fine-tiles + relief-index (streaming every fine tile directly to disk and releasing RAM immediately).
  const reliefGrid = reliefFineInput?.grid;
  let reliefInfo: ReliefInfo | undefined;
  let reliefHeight: ((lat: number, lon: number) => number) | undefined;
  let shapeAt: PlaceWorld['shape'];
  let plateNow: PlaceWorld['plateNow'];
  let reliefFineStageKey = '';
  let reliefIndexStageKey = '';
  if (reliefFineInput) {
    const rf = reliefFineInput.grid.field;
    const fineStage = await dag.runStage(
      'relief-fine-tiles',
      {
        field: fieldKey(rf),
        reliefDataset: reliefFineInput.datasetSha,
        reliefImport: imports[rf.id],
        fineParams: reliefFineInput.params,
      },
      async (sink) => {
        const started = Date.now();
        const fine = await fineLevel(reliefFineInput!.datasetPath, reliefFineInput!.mean, reliefFineInput!.params);
        let bytes = 0;
        for (const [key, codes] of fine.tiles) {
          const file = encodeFineTile(key, codes, fine);
          bytes += file.length;
          await sink.put(`relief/fine/${key}.lwt`, file);
        }
        log(`relief  cut ${fine.tiles.size} tiles of ${reliefFineInput!.params.res_arcsec}″ cells (${(bytes / 1e6).toFixed(1)} MB) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
        return { step: fine.step, tile_deg: fine.tile_deg, reach_deg: fine.reach_deg, rows: fine.rows, tileCount: fine.tiles.size, totalBytes: bytes };
      },
      { codeFiles: ['tools/world/src/build/shape.ts', 'tools/world/src/build/relief.ts', 'tools/world/src/tiff.ts', 'core/relief.ts', 'core/container.ts'] },
    );
    reliefFineStageKey = fineStage.key;
    // Release the large relief mean grid right away once fine tiles are written or hit cache.
    reliefFineInput = undefined;

    const carriedField = world.fields.find((x) => x.rule === 'relief-carried');
    const carriedModel = carriedField && world.models.find((m) => m.outputs?.includes(carriedField.id));
    const carried = carriedField && carriedModel ? carriedInfo(solved, carriedField, carriedModel.id) : undefined;
    const credit = world.manifest.datasets[rf.data!.from]?.credit;
    const { step: fineStep, tile_deg, reach_deg, rows, tileCount, totalBytes } = fineStage.meta;
    reliefInfo = {
      format: 'lightworld-relief@1',
      field: rf.id,
      title: rf.title,
      source: rf.data!.from,
      ...(credit ? { credit } : {}),
      fine: { step: fineStep, tile_deg, reach_deg, dir: 'relief/fine', rows },
      ...(carried ? { carried } : {}),
    };
    const reliefIndexStage = await dag.runStage(
      'relief-index',
      { reliefInfo },
      async (sink) => {
        await sink.put('relief/index.json', stableStringify(reliefInfo));
        return {};
      },
    );
    reliefIndexStageKey = reliefIndexStage.key;
    log(
      `relief  ${tileCount} tiles of the survey's cells, ${(totalBytes / 1e6).toFixed(1)} MB${
        carried
          ? `; today's shape carried back whole to ${carried.fullMa} Ma and gone by ${carried.goneMa} Ma${
              carried.ranges.length
                ? `, and for ${carried.ranges.length} range${carried.ranges.length === 1 ? '' : 's'} as their records say: ${carried.ranges.map((r) => `${r.label} stood by ${r.standingMa} Ma${r.startMa !== undefined ? `, rising from ${r.startMa} Ma` : ''}`).join('; ')}`
                : '; no range has a record of when it stood'
            }`
          : ''
      }`,
    );
    // A scene's shape, lazily reading only the needed relief/fine/<key>.lwt tiles from disk.
    const snap = reliefGrid!.snapshots[0];
    const { width, height, step } = snap.src!;
    const node = (lat: number, lon: number) => Math.max(0, Math.min(height - 1, Math.round((90 - lat) / step))) * width + ((((Math.round((lon + 180) / step) % width) + width) % width));
    reliefHeight = between((lat, lon) => snap.elev[node(lat, lon)], step);
    const info = reliefInfo;
    const fineTileCache = new Map<string, Int8Array | undefined>();
    const readFineTile = (key: string): Int8Array | undefined => {
      if (fineTileCache.has(key)) return fineTileCache.get(key);
      const path = `relief/fine/${key}.lwt`;
      if (!dag.hasFile(path)) {
        fineTileCache.set(key, undefined);
        return undefined;
      }
      const { arrays } = decodeTile<ReliefFineHeader>(toArrayBuffer(dag.readBlobBytesSync(path)));
      const raw = inflateSync(arrays[0] as Uint8Array);
      const codes = new Int8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      fineTileCache.set(key, codes);
      return codes;
    };
    const deep = paleoElevation(grids);
    const latest = deep?.snapshots.find((x) => x.ageMa === 0);
    const deepCoast = world.fields.find((c) => c.derived && c.rule === 'isoline' && c.from?.[0] === deep?.field.id)?.isoline_m ?? 0;
    const pg = latest?.src ?? { width: SRC_W, height: SRC_H, step: 1 };
    const pnode = (lat: number, lon: number) => Math.max(0, Math.min(pg.height - 1, Math.round((90 - lat) / pg.step))) * pg.width + ((((Math.round((lon + 180) / pg.step) % pg.width) + pg.width) % pg.width));
    const base = latest ? between((lat, lon) => latest.elev[pnode(lat, lon)] - deepCoast, pg.step) : undefined;
    plateNow = (lat, lon) => snap.plate[node(lat, lon)];
    shapeAt = (today, back) => {
      if (!back) return sceneShape({ info, tile: readFineTile, at: today });
      if (!base) return undefined;
      return sceneShape({ info, tile: readFineTile, at: today, carried: { ...back, today: { step, elevation: (lat, lon) => snap.elev[node(lat, lon)], plate: (lat, lon) => snap.plate[node(lat, lon)] }, base, grain: pg.step } });
    };
  }

  // 8. Records, periods, planet, territory, tree.
  const worldEntitiesDigest = sha256(
    stableStringify({
      entities: world.entities,
      sources: world.sources,
      alternatives: world.alternatives,
      frames: world.frames,
      vocab: world.vocab,
      plateModel: dsKey(PLATE_MODEL),
    }),
  );
  // What each list is, and which of its things each record is: a record's page shows what its rows say.
  const listKeys = listed.things.lists.map((l) => ({ field: fieldKey(l.field), dataset: dsKey(l.dataset), source: srcKey(l.dataset) }));
  const listsOfThings = thingLists(world, listed.things);
  const rowsOfRecords = [...listed.identity.rowsOf.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const recordsStage = await dag.runStage(
    'records',
    { worldEntitiesDigest, lists: listKeys, rowsOf: sha256(stableStringify(rowsOfRecords)) },
    async (sink) => {
      const recs = buildRecords(solved);
      for (const r of recs) {
        const ids = listed.identity.rowsOf.get(r.id);
        if (ids?.length) {
          r.rows = ids.flatMap((id) => {
            const t = listed.things.things.get(id)!;
            return t.rows.map((row) => {
              const list = listsOfThings[row.list];
              return { id, list: `${list.name}: ${list.title.charAt(0).toLowerCase()}${list.title.slice(1)}`, dataset: list.dataset, key: t.key, claims: thingClaims(list, { k: t.key, v: row.values }, r.id, false) };
            });
          });
        }
        await sink.put(`records/${r.id}.json`, stableStringify(r));
      }
      return { count: recs.length };
    },
    { codeFiles: ['tools/world/src/build/records.ts', 'core/records.ts', 'core/ladder.ts', 'core/things.ts', 'tools/world/src/things.ts', 'tools/world/src/tables.ts'] },
  );

  // Stage: things/: the things of lists, their pages, search and trees (docs/plans/ENTITIES.md, steps 2 to 4).
  const thingsStage = await dag.runStage(
    'things',
    { worldEntitiesDigest, lists: listKeys, overlays: world.overlays.filter((o) => o.same_as).map((o) => [o.row, o.same_as]) },
    async (sink) => {
      const b = buildThings(world, listed.things, listed.identity, labeller(solved));
      for (const [path, content] of [...b.files].sort(([a], [z]) => (a < z ? -1 : 1))) await sink.put(path, content);
      return { count: listed.things.things.size, files: b.files.size, listedChildren: [...b.listedChildren.entries()].sort(([a], [z]) => (a < z ? -1 : 1)) };
    },
    { codeFiles: ['tools/world/src/build/things.ts', 'tools/world/src/things.ts', 'core/things.ts', 'tools/world/src/tables.ts'] },
  );
  log(`things  ${thingsStage.meta.count} things of ${listed.things.lists.length} lists, in ${thingsStage.meta.files} files; ${listed.identity.record.size} of them records`);
  const listedChildren = new Map<string, { thing: string; count: number }>(thingsStage.meta.listedChildren);

  const periodSources = Object.fromEntries(
    [...new Set(world.entities.filter((e) => e.kind.startsWith('period/')).flatMap((e) => e.claims.flatMap((c) => c.sources.map((s) => s.ref))))]
      .sort()
      .map((id) => [id, sourceRecord(world.source.get(id)!)]),
  );
  await dag.runStage('periods', { periodHash, periodSources }, async (sink) => {
    const periods: PeriodsFile = { periods: periodList, sources: periodSources };
    await sink.put('periods.json', stableStringify(periods));
    return {};
  });

  await dag.runStage('planet', { planetHash }, async (sink) => {
    await sink.put('planet.json', stableStringify(planetFile));
    return {};
  });

  const territoryEntities = world.entities.filter((e) => e.claims.some((c) => c.prop === 'territory' || c.prop === 'extent'));
  const territoryDatasets = [...new Set(territoryEntities.flatMap((e) => e.claims.filter((c) => c.prop === 'territory').map((c) => (c.value as { dataset?: string } | undefined)?.dataset)).filter((x): x is string => !!x))].sort();
  const territoryStage = await dag.runStage(
    'territory',
    {
      entities: entitiesKey(territoryEntities, solved),
      datasets: territoryDatasets.map(dsKey),
      politiesField: fieldKey(world.fields.find((x) => x.data?.as === 'polities')),
      plateModel: dsKey(PLATE_MODEL),
      alternatives,
    },
    async (sink) => {
      const file = await buildTerritory(solved, log);
      await sink.put('territory.json', stableStringify(file));
      return { count: file.territories.length };
    },
    { codeFiles: ['tools/world/src/build/territory.ts'] },
  );
  const territoryFile = JSON.parse(dag.readBlobTextSync('territory.json')) as TerritoryFile;

  await dag.runStage(
    'tree',
    {
      entities: entitiesKey(
        world.entities.filter((e) => e.kind === 'taxon' || e.relations.some((r) => ['arose-from', 'succeeds', 'member-of', 'part-of'].includes(r.rel))),
        solved,
      ),
      vocab: world.vocab.kinds,
      listed: thingsStage.meta.listedChildren,
    },
    async (sink) => {
      await sink.put('tree.json', stableStringify(buildTree(solved, listedChildren)));
      return {};
    },
    { codeFiles: ['tools/world/src/build/tree.ts'] },
  );

  // Climate fields: deep-time climate + recent high-resolution climates + monthly tiles/parts.
  // Exact Float32Array nodes and water arrays are persisted in cache-only blobs so downstream stages
  // only decode them when they themselves miss cache.
  const climateField = world.fields.find((f) => fieldSource(f) === 'climate' && !f.data?.variables);
  const biomeField = world.fields.find((f) => f.rule === 'biome-from-climate');
  const runoffField = world.fields.find((f) => f.rule === 'water-balance');
  const paleo = paleoElevation(grids);
  const paleoImport = paleo ? imports[paleo.field.id] : undefined;
  const nearestSnapshot = (ageMa: number) => paleo!.snapshots.reduce((a, b) => (Math.abs(b.ageMa - ageMa) < Math.abs(a.ageMa - ageMa) ? b : a));
  const waterOptions: WaterOptions | undefined = runoffField && paleo ? { params: waterParamsOf(runoffField.params ?? {}), height: (ageMa) => heightOn(nearestSnapshot(ageMa)) } : undefined;
  const heightField = world.fields.find((f) => f.rule === 'lapse-rate');
  const heightParams = heightField?.params as { lapse_c_per_km: number; g0: number } | undefined;
  const reliefDrainGrid = grids.find((g) => g.drain && g.seaLevel);
  const cellHeight = (() => {
    const relief = reliefDrainGrid;
    if (!relief) return undefined;
    const snap = relief.snapshots[0];
    const { width, height, step } = snap.src!;
    const stack = seriesList.find((x) => x.id === relief.seaLevel)?.points as unknown as [number, number][] | undefined;
    if (!stack) return undefined;
    return (ageMa: number) => {
      const sea = seaLevelAt(stack, fromMa(ageMa));
      return (lat: number, lon: number, half: number) => {
        const j0 = Math.max(0, Math.ceil((90 - lat - half) / step - 1e-9));
        const j1 = Math.min(height - 1, Math.floor((90 - lat + half) / step - 1e-9));
        const i0 = Math.ceil((lon + 180 - half) / step - 1e-9);
        const i1 = Math.floor((lon + 180 + half) / step - 1e-9);
        let sum = 0;
        let n = 0;
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const z = snap.elev[j * width + (((i % width) + width) % width)];
            sum += z > sea ? z : sea;
            n++;
          }
        }
        return n ? sum / n : sea;
      };
    };
  })();
  const partFields = world.fields.filter((f) => fieldSource(f) === 'months');
  const partReads = (climate: Field): PartRead[] =>
    heightParams ? MONTHS_PARTS.flatMap((part) => partFields.filter((x) => x.data!.from === climate.data!.from && x.data!.reads?.[part]).map((x) => ({ part, field: x.id, ...x.data!.reads![part] }))) : [];

  const streamMonths = async (
    sink: import('./dag.ts').ArtifactSink,
    f: Field,
    keys: ClimateKeyframe[],
    classes: (part: MonthsPart) => Promise<Record<string, string> | undefined> = async () => undefined,
  ): Promise<MonthsSet> => {
    const grid = climateGrid((f.grid as { res_deg: number }).res_deg);
    const slug = f.id.replace(/^field:/, '').replace(/\//g, '-');
    const out = monthsFiles(f.id, `months/${slug}`, grid, keys, MONTHS_TILE_DEG);
    for (const [path, bytes] of out.files) await sink.put(path, bytes);
    const frames = new Set(keys.map((k) => k.frameMa ?? k.ageMa));
    const set: MonthsSet = { field: f.id, title: f.title, keyframesMa: keys.map((k) => k.ageMa).sort((a, b) => a - b), ...(frames.size === 1 ? { frameMa: [...frames][0] } : {}), step: grid.step, tile_deg: MONTHS_TILE_DEG, tiles: out.tiles };
    const reads = partReads(f);
    if (reads.length && keys.some((k) => k.parts)) {
      const dir = `months/${slug}/parts`;
      const made = partsFiles(f.id, dir, grid, keys, MONTHS_TILE_DEG, Object.keys(out.tiles));
      for (const [path, bytes] of made.files) await sink.put(path, bytes);
      const parts: PartInfo[] = [];
      for (const r of reads) {
        const pf = partFields.find((x) => x.id === r.field)!;
        const names = await classes(r.part);
        parts.push({ part: r.part, field: pf.id, title: pf.title, ...(pf.quantity ? { quantity: pf.quantity } : {}), ...(pf.unit ? { unit: pf.unit } : {}), source: pf.data!.from, ...(names ? { classes: names } : {}), ...(typeof pf.params?.scale === 'number' ? { scale: pf.params.scale } : {}) });
      }
      set.parts = { list: parts, dir, chunks: made.chunks };
    }
    for (const k of keys) {
      delete k.months;
      delete k.parts;
    }
    return set;
  };

  let deepClimateMeta: { ages: number[]; cacheBlobSha: string; monthsSet?: MonthsSet } | undefined;
  let deepClimateStageKey = '';
  let cachedDeepKeys: ClimateKeyframe[] | undefined;
  const loadDeepClimateKeys = (): ClimateKeyframe[] => {
    if (!deepClimateMeta) return [];
    if (!cachedDeepKeys) cachedDeepKeys = unpackClimateCache(dag.readBlobByHashSync(deepClimateMeta.cacheBlobSha));
    return cachedDeepKeys;
  };

  if (climateField && biomeField && paleo) {
    const reads = partReads(climateField);
    const stage = await dag.runStage(
      'climate-deep',
      {
        climateField: fieldKey(climateField),
        biomeField: fieldKey(biomeField),
        paleoImport,
        plateIndexList,
        runoff: fieldKey(runoffField),
        heightField: fieldKey(heightField),
        partReads: reads,
        partFields: reads.map((r) => fieldKey(partFields.find((x) => x.id === r.field))),
      },
      async (sink) => {
        const keys = await climateKeyframes(world, climateField, paleo.snapshots, plateIndex, log, waterOptions, heightParams ? { g0: heightParams.g0 } : undefined, reads);
        await sink.put('climate.lwt', encodeClimate(climateGrid((climateField.grid as { res_deg: number }).res_deg), keys, biomeField.params as unknown as ClimateRule));
        const monthsSet = heightParams && keys.length ? await streamMonths(sink, climateField, keys) : undefined;
        const cacheRef = await sink.putInternal(packClimateCache(keys));
        cachedDeepKeys = keys;
        return { ages: keys.map((k) => k.ageMa), cacheBlobSha: cacheRef.sha256, ...(monthsSet ? { monthsSet } : {}) };
      },
      { codeFiles: ['tools/world/src/build/climate.ts', 'core/climate.ts', 'core/months.ts', 'core/water.ts', 'core/container.ts'] },
    );
    deepClimateMeta = stage.meta;
    deepClimateStageKey = stage.key;
  }

  interface RecentClimateMeta {
    field: Field;
    ages: number[];
    hasWater: boolean;
    chunks: { file: string; keyframesMa: number[] }[];
    monthsSet?: MonthsSet;
    waterBlobSha?: string;
    stageKey: string;
  }
  const recentClimates: RecentClimateMeta[] = [];
  const monthsSets: MonthsSet[] = [];
  if (biomeField && paleo) {
    for (const f of world.fields.filter((x) => fieldSource(x) === 'climate' && x.data?.variables)) {
      const reads = cellHeight ? partReads(f) : [];
      const more: MonthsMore = Object.fromEntries(reads.map((r) => [r.part, PARTS[r.part].per === 12 ? { variable: r.variable, per: 'month' as const, scale: PART_IMPORT_SCALE, ...(r.part === 'u' || r.part === 'v' ? { signed: true } : {}) } : { variable: r.variable, per: 'year' as const, scale: 1 }]));
      const dir = await importMonths(f, f.data!.variables!, log, more);
      imports[f.id] = dir.split('/').pop()!;
      const slug = f.id.replace(/^field:/, '').replace(/\//g, '-');
      const seaLevelPointsHash = reliefDrainGrid?.seaLevel ? sha256(stableStringify(seriesList.find((x) => x.id === reliefDrainGrid.seaLevel)?.points ?? [])) : undefined;
      const stage = await dag.runStage(
        `climate-recent-${slug}`,
        {
          field: fieldKey(f),
          biomeField: fieldKey(biomeField),
          importHash: imports[f.id],
          paleoImport,
          plateIndexList,
          runoff: fieldKey(runoffField),
          heightField: fieldKey(heightField),
          reliefImport: reliefDrainGrid ? imports[reliefDrainGrid.field.id] : undefined,
          seaLevelPointsHash,
          partReads: reads,
          partFields: reads.map((r) => fieldKey(partFields.find((x) => x.id === r.field))),
        },
        async (sink) => {
          const keys = await monthsKeyframes(f, dir, paleo.snapshots.find((x) => x.ageMa === 0)!, plateIndex, log, waterOptions, heightParams && cellHeight ? { height: cellHeight } : undefined, reads);
          const grid = climateGrid((f.grid as { res_deg: number }).res_deg);
          const chunks: { file: string; keyframesMa: number[] }[] = [];
          for (let i = 0; ; i += CLIMATE_CHUNK - 1) {
            const part = keys.slice(i, i + CLIMATE_CHUNK);
            const file = `climate/${slug}/${chunks.length}.lwt`;
            await sink.put(file, encodeClimate(grid, part, biomeField.params as unknown as ClimateRule));
            chunks.push({ file, keyframesMa: part.map((k) => k.ageMa) });
            if (i + CLIMATE_CHUNK >= keys.length) break;
          }
          const monthsSet = heightParams ? await streamMonths(sink, f, keys, (part) => partClasses(dir, part)) : undefined;
          const hasWater = keys.length > 0 && keys.every((k) => !!k.water);
          const waterRef = hasWater ? await sink.putInternal(packWaterCache(keys)) : undefined;
          return { ages: keys.map((k) => k.ageMa), hasWater, chunks, ...(monthsSet ? { monthsSet } : {}), ...(waterRef ? { waterBlobSha: waterRef.sha256 } : {}) };
        },
        { codeFiles: ['tools/world/src/build/climate.ts', 'core/climate.ts', 'core/months.ts', 'core/water.ts', 'core/container.ts'] },
      );
      recentClimates.push({ field: f, ...stage.meta, stageKey: stage.key });
      if (stage.meta.monthsSet) monthsSets.push(stage.meta.monthsSet);
    }
  }
  if (deepClimateMeta?.monthsSet) monthsSets.push(deepClimateMeta.monthsSet);
  const monthsInfo: MonthsInfo | undefined = heightField && heightParams && monthsSets.length && waterOptions ? { water: waterOptions.params, field: heightField.id, title: heightField.title, model: 'model:earth/lapse-rate', lapse: heightParams.lapse_c_per_km, sets: monthsSets } : undefined;
  if (monthsInfo) log(`months  ${monthsSets.map((x) => `${x.field}: ${x.keyframesMa.length} keyframes in ${Object.keys(x.tiles).length} tiles${x.parts ? `, and ${x.parts.list.map((p) => p.part).join(', ')} in ${x.parts.chunks.length} span${x.parts.chunks.length === 1 ? '' : 's'} of them` : ''}`).join('; ')}`);

  // Stage: rivers (recent drainage, deep-time drainage, and GRWL observed rivers) streamed directly to disk.
  const riversField = world.fields.find((f) => f.rule === 'drainage' && f.kind === 'lines');
  const lakesField = world.fields.find((f) => f.rule === 'drainage' && f.kind === 'areas');
  let riversInfo: RiversInfo | undefined;
  let riversSeenBlobSha: string | undefined;
  let riversStageKey = '';
  if (riversField && lakesField && waterOptions) {
    const relief = reliefDrainGrid;
    const recent = recentClimates.find((c) => c.hasWater && c.waterBlobSha);
    const coast = world.fields.find((f) => f.id === 'field:earth/coastline')?.isoline_m ?? 20;
    const widthsField = world.fields.find((f) => f.data?.as === 'river-widths');
    const seaLevelPointsHash = relief?.seaLevel ? sha256(stableStringify(seriesList.find((x) => x.id === relief.seaLevel)?.points ?? [])) : undefined;
    const riversStage = await dag.runStage(
      'rivers',
      {
        riversField: fieldKey(riversField),
        lakesField: fieldKey(lakesField),
        waterParams: waterOptions.params,
        relief: relief ? { import: imports[relief.field.id], coverMa: relief.coverMa, res: relief.res, water: relief.field.data?.water ? { ocean: dsKey(relief.field.data.water.ocean), lakes: dsKey(relief.field.data.water.lakes) } : undefined, seaLevelPointsHash } : undefined,
        recent: recent ? { field: fieldKey(recent.field), waterBlobSha: recent.waterBlobSha } : undefined,
        deep: deepClimateMeta && climateField ? { field: fieldKey(climateField), cacheBlobSha: deepClimateMeta.cacheBlobSha } : undefined,
        paleoImport,
        coast,
        widthsField: fieldKey(widthsField),
      },
      async (sink) => {
        const started = Date.now();
        const p = { ...(riversField.params as unknown as DrainageParams), ...(lakesField.params as { min_lake_km2: number; spill_overlap: number }) };
        const sets: RiversSet[] = [];
        let recentFrom = Infinity;
        if (relief && recent?.waterBlobSha) {
          const stack = seriesList.find((x) => x.id === relief.seaLevel)!.points as unknown as [number, number][];
          const rg = climateGrid((recent.field.grid as { res_deg: number }).res_deg);
          const recentWater = unpackWaterCache(dag.readBlobByHashSync(recent.waterBlobSha));
          const waterOf = (k: { ageMa: number; water?: ClimateKeyframe['water'] }): Water => ({ ageMa: k.ageMa, grid: rg, runoff: k.water!.runoff, loss: k.water!.loss, slow: k.water!.slow });
          const times = recentWater.map((k) => ({ ageMa: k.ageMa, water: waterOf(k) }));
          const levelOf = (ageMa: number) => seaLevelAt(stack, fromMa(ageMa));
          const step = p.older_step_yr / 1e6;
          const youngest = Math.max(...recentWater.map((k) => k.ageMa));
          for (let a = Math.ceil(youngest / step) * step + step; a <= relief.coverMa[0] + 1e-9; a += step) {
            const s = levelOf(a);
            const like = recentWater.reduce((x, y) => (Math.abs(levelOf(y.ageMa) - s) < Math.abs(levelOf(x.ageMa) - s) ? y : x));
            times.push({ ageMa: Math.round(a * 1e6) / 1e6, water: waterOf(like) });
          }
          const snap = relief.snapshots[0];
          const g = { nx: snap.src!.width, ny: snap.src!.height, step: relief.res };
          const net = await recentRivers(relief.drain!.z, relief.drain!.ocean, g, stack, times, p, (k) => snap.plate[k], relief.drain!.lakes);
          recentFrom = fromMa(relief.coverMa[0]);
          const out = riverFiles(net, 'rivers/recent', [recentFrom, fromMa(relief.coverMa[1])], true);
          for (const [path, bytes] of out.files) await sink.put(path, bytes);
          sets.push(out.set);
          log(`rivers  ${net.reaches.length} reaches of today's ground, ${net.keyframes.length} keyframes back to ${relief.coverMa[0]} Ma`);
        }
        const deepKeys = loadDeepClimateKeys();
        const deep = deepKeys.filter((k) => k.water).sort((a, b) => a.ageMa - b.ageMa);
        const half = deep.length > 1 ? (deep[1].ageMa - deep[0].ageMa) / 2 : 5;
        const cg = climateField ? climateGrid((climateField.grid as { res_deg: number }).res_deg) : undefined;
        for (const k of deep) {
          const snap = paleo!.snapshots.find((x) => x.ageMa === k.ageMa);
          if (!snap || !cg) continue;
          const span: [number, number] = [fromMa(k.ageMa + half), Math.min(fromMa(Math.max(0, k.ageMa - half)), recentFrom)];
          if (span[1] <= span[0]) continue;
          const net = deepRivers(snap.elev, { nx: 360, ny: 181, step: 1 }, coast, k.ageMa, { ageMa: k.ageMa, grid: cg, runoff: k.water!.runoff, loss: k.water!.loss, slow: k.water!.slow }, p, (n) => snap.plate[n]);
          const out = riverFiles(net, `rivers/deep/${k.ageMa}`, span);
          for (const [path, bytes] of out.files) await sink.put(path, bytes);
          sets.push(out.set);
        }
        let observed: RiversInfo['observed'];
        let seenBlobSha: string | undefined;
        if (widthsField) {
          const id = widthsField.data!.from;
          const d = world.manifest.datasets[id];
          const segs = grwlSegments(await readFile(datasetFile(id, d, 'shp')), await readFile(datasetFile(id, d, 'dbf')));
          const seen = new Uint8Array(360 * 180);
          for (const x of segs) if (x.flag !== 1) for (let i = 0; i < x.xy.length; i += 2) seen[seenCell(x.xy[i + 1], x.xy[i])] = 1;
          seenBlobSha = (await sink.putInternal(seen)).sha256;
          const step = 10;
          const byTile: Record<string, string> = {};
          for (const [key, part] of [...segmentTiles(segs, step)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
            const [i, j] = key.split('_').map(Number);
            const file = `rivers/observed/${key}.lwt`;
            await sink.put(file, encodeSegments(part, [-180 + i * step, 90 - (j + 1) * step, -180 + (i + 1) * step, 90 - j * step]));
            byTile[key] = file;
          }
          await sink.put('rivers/observed/globe.lwt', encodeSegments(segs.map((x) => ({ ...x, xy: thin(x.xy, 0.02) })), [-180, -90, 180, 90]));
          const t = widthsField.time!;
          observed = { field: widthsField.id, title: widthsField.title, source: id, credit: d.credit, span: [parsePoint(t.lo as TimePointInput).t, parsePoint(t.hi as TimePointInput).t], step, tiles: byTile, globe: 'rivers/observed/globe.lwt' };
          log(`rivers  ${segs.length} observed segments in ${Object.keys(byTile).length} tiles of ${step}°`);
        }
        const info: RiversInfo = { field: riversField.id, title: riversField.title, description: riversField.description, lakes: { field: lakesField.id, title: lakesField.title }, model: 'model:earth/drainage', params: riversField.params ?? {}, sets, ...(observed ? { observed } : {}) };
        log(`rivers  ${sets.length} sets in ${((Date.now() - started) / 1000).toFixed(1)} s`);
        return { info, ...(seenBlobSha ? { seenBlobSha } : {}) };
      },
      { codeFiles: ['tools/world/src/build/rivers.ts', 'tools/world/src/build/grwl.ts', 'core/rivers.ts', 'core/sealevel.ts', 'core/container.ts'] },
    );
    riversInfo = { ...riversStage.meta.info };
    riversSeenBlobSha = riversStage.meta.seenBlobSha;
    riversStageKey = riversStage.key;
  }

  // Lazy disk-backed water sampler for witness scenes (zero riverBytes kept in RAM).
  const decodedRiver = <H>(f: string) => decodeTile<H>(toArrayBuffer(dag.readBlobBytesSync(f)));
  const nets = new Map<string, RiverNet>();
  const keySets = new Map<string, RiverKey[]>();
  const tilesRead = new Map<string, RiverWidths>();
  let shoreRows = new Map<string, LayerRow>();
  const waterAt = riversInfo
    ? (t: number, ageMa: number, at: { lat: number; lon: number }, isoline: number): SceneWater | undefined => {
        const info = riversInfo!;
        const set = info.sets.find((x) => x.span[0] <= t && t <= x.span[1]);
        const kf = set && keyFile(set, ageMa);
        if (!set || !kf) return undefined;
        if (!nets.has(set.network)) {
          const { header, arrays } = decodedRiver<RiversNetworkHeader>(set.network);
          nets.set(set.network, new RiverNet(header, arrays));
        }
        if (!keySets.has(kf.file)) {
          const { header, arrays } = decodedRiver<RiversKeysHeader>(kf.file);
          keySets.set(kf.file, riverKeys(header, arrays));
        }
        const observed =
          set.today && info.observed
            ? observedFiles(info.observed, at.lat, at.lon).map((f) => {
                if (!tilesRead.has(f)) {
                  const { header, arrays } = decodedRiver<RiverWidthsHeader>(f);
                  tilesRead.set(f, riverWidths(header, arrays));
                }
                return tilesRead.get(f)!;
              })
            : [];
        const localLakes = shoresNear(info.mappedShores ?? [], t, at, WATER_REACH).map((s) => mappedLake(s, shoreRows.get(s.row)!, at, isoline));
        return sceneWater(info, set, nets.get(set.network)!, keySets.get(kf.file)![kf.i], observed, at, isoline, WATER_REACH, localLakes);
      }
    : undefined;

  // Stage: ice.lwt
  const iceField = world.fields.find((f) => fieldSource(f) === 'ice');
  let iceMeta: Omit<IceBuilt, 'bytes'> | undefined;
  let iceStageKey = '';
  if (iceField && paleo) {
    const iceStage = await dag.runStage(
      'ice',
      { field: fieldKey(iceField), paleoImport, plateIndexList },
      async (sink) => {
        const present = paleo.snapshots.find((s) => s.ageMa === 0)!;
        const built = await buildIce(world, iceField, present, plateIndex, log);
        await sink.put('ice.lwt', built.bytes);
        return { coverage: built.coverage, keyframesMa: built.keyframesMa, marginM: built.marginM, scenarios: built.scenarios };
      },
      { codeFiles: ['tools/world/src/build/ice.ts', 'core/container.ts'] },
    );
    iceMeta = iceStage.meta;
    iceStageKey = iceStage.key;
  }
  // Stage: city. Every city a map of the world is of (a dataset imported as an `ohm-site` with its `site`): its records,
  // building by building, which a living scene near it draws, its surveyed ground, and the way in to it.
  const mapped = Object.entries(world.manifest.datasets).filter(([, d]) => d.import?.as === 'ohm-site' && d.import.site);
  let cityMeta: { files: string[]; sites: SiteInfo[] } = { files: [], sites: [] };
  if (mapped.length) {
    const drawnEntities = world.entities.filter((e) => /^(building|monument|works|open)(\/|$)/.test(e.kind));
    const cityStage = await dag.runStage(
      'city',
      {
        maps: mapped.map(([id, d]) => {
          const site = d.import!.site!;
          return { map: dsKey(id), site, surveys: [site.ground.city, ...site.ground.hills, ...site.ground.region].map(dsKey) };
        }),
        entities: entitiesKey(drawnEntities, solved),
      },
      async (sink) => {
        const files: string[] = [];
        const sites: SiteInfo[] = [];
        for (const c of await buildCities(solved, log)) {
          for (const [path, bytes] of c.blobs) await sink.put(path, bytes);
          const f = c.file.site;
          const file = `city/${f.id}.json`;
          await sink.put(file, stableStringify(c.file));
          files.push(file);
          // A map's way in, from its dataset's site: where a link to the city lands.
          const site = mapped.find(([, d]) => d.import!.site!.id === f.id)![1].import!.site!;
          sites.push({ kind: 'city', id: f.id, label: f.label, file, place: f.settlement, origin: f.origin, span: f.span, slice: (f.span[0] + f.span[1]) / 2, near: site.near ?? f.span, window: site.window ?? f.span, view: site.view ?? { x: 0, y: 0, range: 1500, heading: 0, tilt: 60 } });
        }
        return { files, sites };
      },
      { codeFiles: ['tools/world/src/build/city.ts', 'tools/world/src/build/ground.ts', 'core/city.ts'] },
    );
    cityMeta = cityStage.meta;
  }

  // Stage: present.json
  const bordersField = world.fields.find((x) => x.data?.as === 'borders');
  let hasPresent = false;
  if (bordersField) {
    const presentStage = await dag.runStage(
      'present',
      {
        field: fieldKey(bordersField),
        placesDataset: dsKey(bordersField.data?.places),
        placesSource: srcKey(bordersField.data?.places),
      },
      async (sink) => {
        const present = await presentLayer(world);
        if (present) await sink.put('present.json', stableStringify(present));
        return { present: !!present };
      },
      { codeFiles: ['tools/world/src/build/layers.ts'] },
    );
    hasPresent = presentStage.meta.present;
  }

  // Stage: hazards.json
  const hazardsField = world.fields.find((x) => x.data?.as === 'hazards');
  let hasHazards = false;
  if (hazardsField) {
    const hazardsStage = await dag.runStage(
      'hazards',
      { field: fieldKey(hazardsField), fixes: fixesKey(fixesOf('hazards')) },
      async (sink) => {
        const hazards = await hazardLayer(world, fixesOf('hazards'));
        if (hazards) await sink.put('hazards.json', stableStringify(hazards));
        return { present: !!hazards };
      },
      { codeFiles: ['tools/world/src/build/layers.ts'] },
    );
    hasHazards = hazardsStage.meta.present;
  }
  // Stage: polities.json
  // The rows each record draws as its territory, by row: the viewer leaves a row to its records while one holds.
  const claimedRows = new Map<string, string[]>();
  for (const t of territoryFile.territories) {
    for (const key of new Set(t.claims.flatMap((c) => c.rows.map((r) => stateRowKey(r.name, r.from))))) {
      let list = claimedRows.get(key);
      if (!list) {
        list = [];
        claimedRows.set(key, list);
      }
      list.push(t.subject);
    }
  }
  const statesField = world.fields.find((x) => x.data?.as === 'polities');
  let hasPolities = false;
  let politiesStageKey = '';
  if (statesField) {
    const politiesStage = await dag.runStage(
      'polities',
      {
        field: fieldKey(statesField),
        fixes: fixesKey(fixesOf('polities')),
        claimed: [...claimedRows.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
      },
      async (sink) => {
        const polities = await polityLayer(world, claimedRows, fixesOf('polities'));
        if (polities) await sink.put('polities.json', stableStringify(polities));
        return { present: !!polities };
      },
      { codeFiles: ['tools/world/src/build/layers.ts'] },
    );
    hasPolities = politiesStage.meta.present;
    politiesStageKey = politiesStage.key;
  }

  // Stage: search.json
  const adopted = new Map(world.overlays.filter((o) => o.same_as).map((o) => [o.row, o.same_as!]));
  const searchGap = (statesField?.params as { search_gap_yr?: number } | undefined)?.search_gap_yr ?? Infinity;
  await dag.runStage(
    'search',
    {
      found: sha256(stableStringify(found)),
      politiesSha: hasPolities ? dag.fileRef('polities.json')?.sha256 : null,
      statesKind: statesField?.rows?.kind ?? 'polity',
      searchGap: Number.isFinite(searchGap) ? searchGap : 'Infinity',
      adopted: [...adopted.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
      territorySha: territoryStage.files['territory.json'].sha256,
    },
    async (sink) => {
      const polities = hasPolities ? (JSON.parse(dag.readBlobTextSync('polities.json')) as PolitiesFile) : undefined;
      await sink.put('search.json', stableStringify(searchRows(found, polities, statesField?.rows?.kind ?? 'polity', searchGap, adopted, territoryFile)));
      return {};
    },
    { codeFiles: ['tools/world/src/build/searchrows.ts'] },
  );

  // Stage: field-layers (languages, roads, dated lake shorelines, etc.)
  const layerFields = world.fields.filter((f) => f.layer && f.rows && f.data && ['points', 'lines', 'areas'].includes(f.kind ?? ''));
  const fieldLayersStage = await dag.runStage(
    'field-layers',
    {
      fields: layerFields.map((f) => ({ field: fieldKey(f), fixes: fixesKey(claims.corrections(f.data!.from)) })),
    },
    async (sink) => {
      const layers = await fieldLayers(world, claims);
      for (const [path, content] of layers.files) await sink.put(path, content);
      return { infos: layers.infos };
    },
    { codeFiles: ['tools/world/src/build/fieldlayers.ts', 'core/fieldlayers.ts'] },
  );
  const layerInfos: LayerInfo[] = fieldLayersStage.meta.infos;
  if (lakesField && riversInfo && reliefHeight) {
    const mapped = mappedShores(world, { infos: layerInfos, files: new LazyTextMap(dag) }, lakesField.id, reliefHeight);
    if (mapped.shores.length) riversInfo.mappedShores = mapped.shores;
    shoreRows = mapped.rows;
  }

  // Stage: overlays.json
  const overlaysStage = await dag.runStage(
    'overlays',
    {
      overlays: world.overlays,
      datasets: [...new Set(world.overlays.map((o) => o.dataset))].sort().map(dsKey),
    },
    async (sink) => {
      const overlays = overlayFile(world, claims);
      if (overlays) await sink.put('overlays.json', stableStringify(overlays));
      return { present: !!overlays };
    },
    { codeFiles: ['tools/world/src/claimindex.ts', 'tools/world/src/tables.ts'] },
  );
  const hasOverlays = overlaysStage.meta.present;

  // Stage: people.lwt
  const peopleField = world.fields.find((x) => x.data?.as === 'people');
  let peopleHeader: PeopleHeader | undefined;
  let peopleStageKey = '';
  if (peopleField) {
    const peopleStage = await dag.runStage(
      'people',
      { field: fieldKey(peopleField) },
      async (sink) => {
        const people = await peopleLayer(world);
        if (!people) return {};
        await sink.put('people.lwt', encodeTile(people.header as unknown as Record<string, unknown>, people.arrays, stableStringify));
        return { header: people.header };
      },
      { codeFiles: ['tools/world/src/build/layers.ts', 'core/layers.ts', 'core/container.ts'] },
    );
    peopleHeader = peopleStage.meta.header;
    peopleStageKey = peopleStage.key;
  }

  // Stage: landscape (anthromes, assessments, cities, building/husbandry/agriculture traditions).
  const anthromesField = world.fields.find((x) => x.data?.as === 'anthromes');
  let landscapeMeta:
    | {
        present: boolean;
        span?: [number, number];
        assessed?: [number, number];
        res?: number;
        citySpans?: Record<string, [number, number]>;
        disagree?: ReturnType<typeof disagreement>;
        farming?: ReturnType<typeof farmingAgreement>;
        housing?: HousingCount[];
        people?: PeopleScores;
      }
    | undefined;
  let landscapeStageKey = '';
  if (anthromesField) {
    const landscapeFields = world.fields.filter((f) => ['anthromes', 'land-use-assessment', 'cities', 'lifeways', 'people', 'regions'].includes(f.data?.as ?? '') || f.id === 'field:people/lifeways');
    const settlementGen = world.generators.find((g) => g.id === 'gen:people/settlement');
    const regionsId = (anthromesField.params as { regions?: string } | undefined)?.regions;
    const landscapeStage = await dag.runStage(
      'landscape',
      {
        fields: landscapeFields.map(fieldKey),
        regionsDataset: dsKey(regionsId),
        settlementOutlines: [...new Set(world.entities.filter(e => kindIs(e.kind, 'settlement')).flatMap(e =>
          e.claims.filter(c => c.prop === 'extent').map(c => (c.value as { from?: string }).from).filter((id): id is string => !!id)
        ))].sort().map(dsKey),
        settlementGen: settlementGen ? { id: settlementGen.id, version: settlementGen.version, params: settlementGen.params } : undefined,
        peopleSha: peopleHeader ? dag.fileRef('people.lwt')?.sha256 : null,
        plans: world.plans,
        entities: entitiesKey(landscapeEntities(world), solved),
      },
      async (sink) => {
        const landscape = await buildLandscape(solved, log);
        if (!landscape) return { present: false };
        const decodedPeople = peopleHeader ? decodeTile<PeopleHeader>(toArrayBuffer(dag.readBlobBytesSync('people.lwt'))) : undefined;
        const pf = decodedPeople ? ({ ...decodedPeople.header, cell: decodedPeople.arrays[0], land: decodedPeople.arrays[1], people: decodedPeople.arrays[2] } as unknown as PeopleFile) : undefined;
        // The population model (model:people/city-population, docs/plans/MODELS.md): HYDE's people in each region a
        // record gives, the prior of its people beside the town's; then its parameters fitted to the figures held out,
        // the density model's anchors, and its scores, written into the cities file the browser reads.
        if (pf)
          for (const r of landscape.cities.records ?? []) {
            const km = regionReach(r);
            if (km) r.hyde = regionHyde(landscape, pf, r, km);
          }
        const peopleScores = fitCitiesModel(landscape.cities, log);
        landscape.files.set('people/cities.json', stableStringify(landscape.cities));
        for (const [p, c] of landscape.files) await sink.put(p, c);
        const disagree = disagreement(landscape, [-2999, -999, 1, 1000, 1500], 2);
        for (const x of disagree) log(`landscape  at ${x.t}: HYDE and the archaeologists disagree on ${(x.disagree * 100).toFixed(0)}% of the land; ${(x.evidence * 100).toFixed(0)}% rests on the archaeologists`);
        let housingRes: HousingCount[] | undefined;
        if (pf) {
          housingRes = housingCounts(landscape, housing(landscape, pf, HOUSING_TIMES));
          for (const h of housingRes) log(`landscape  at ${formatTime(h.t)}: ${((100 * h.housed) / Math.max(1, h.people)).toFixed(1)}% of ${(h.people / 1e6).toFixed(1)} million people in a tradition's house, in ${h.regions[1]} of ${h.regions[0]} regions; ${h.cities[0]} cities of the lists`);
        }
        const farming = farmingAgreement(landscape);
        for (const f of farming) if (f.none[1] || f.widespread[2]) log(`landscape  ${f.slice}: no farming in ${f.none[1]} regions, HYDE farms under 1% of ${f.none[0]}; farming widespread in ${f.widespread[2]}, HYDE farms ${f.widespread[0]} at all and ${f.widespread[1]} over a twentieth`);
        const citySpans: Record<string, [number, number]> = {};
        for (const f of world.fields.filter((x) => x.data?.as === 'cities')) {
          const own = landscape.cities.cities.filter((c) => c.field === f.id).flatMap((c) => c.pops.map((p) => p[0]));
          if (own.length) citySpans[f.id] = minMax(own);
        }
        return {
          present: true,
          span: landscape.span,
          assessed: landscape.assessed,
          res: landscape.index.res,
          citySpans,
          disagree,
          farming,
          ...(housingRes ? { housing: housingRes } : {}),
          people: peopleScores,
        };
      },
      { codeFiles: ['tools/world/src/build/landscape.ts', 'core/landscape.ts', 'core/dwelling.ts', 'core/citypop.ts', 'core/gauss.ts', 'tools/world/src/holdout.ts', 'world/generators/people/settlement/v12.ts'] },
    );
    landscapeMeta = landscapeStage.meta;
    landscapeStageKey = landscapeStage.key;
  }

  // Stage: rocks (PBDB rock record of fossil sites)
  const rockField = world.fields.find((f) => f.data?.as === 'rock-record');
  const rockLand = paleo;
  const coastIsoline = world.fields.find((f) => f.id === 'field:earth/coastline')?.isoline_m ?? 20;
  let rocksMeta: { present: boolean; stats?: CoverageFile['rocks']; source?: string; stagesSpan?: [number, number] } = { present: false };
  let rocksStageKey = '';
  if (rockField && rockLand) {
    const id = rockField.data!.from;
    const path = datasetFile(id, world.manifest.datasets[id], rockField.data!.file);
    if (existsSync(path)) {
      const rocksStage = await dag.runStage(
        'rocks',
        {
          field: fieldKey(rockField),
          fixes: fixesKey(claims.corrections(id)),
          periodHash,
          paleoImport,
          isoline: coastIsoline,
          plateModel: dsKey(PLATE_MODEL),
        },
        async (sink) => {
          const started = Date.now();
          const spec = rockField.rows;
          const snap = JSON.parse(await readFile(path, 'utf8')) as RocksSnapshot;
          const none: NoneWords = (column) => new Set(Object.values(spec?.claims ?? {}).filter((m) => m.column === column).flatMap((m) => (m.none ?? []).map(String)));
          const built = buildRocks(solved, periodList, rockLand.snapshots, spec ? correctRocks(snap, spec, claims.corrections(id)) : snap, id, rockField, rockField.params as unknown as RocksParams, none, coastIsoline, log);
          for (const [p, c] of built.files) await sink.put(p, c);
          const bins = built.index.bins;
          let stageLo = Infinity;
          let stageHi = -Infinity;
          for (const b of bins) {
            if (b.from < stageLo) stageLo = b.from;
            if (b.to > stageHi) stageHi = b.to;
          }
          const stats: CoverageFile['rocks'] = { collections: snap.collections.length, sites: bins.reduce((n, b) => n + b.sites, 0), stages: bins.length, agreement: built.index.agreement, measured: built.index.measured };
          log(`rocks   built in ${((Date.now() - started) / 1000).toFixed(1)} s`);
          return { present: true, stats, source: built.index.source, stagesSpan: [stageLo, stageHi] as [number, number] };
        },
        { codeFiles: ['tools/world/src/build/rocks.ts', 'core/rocks.ts', 'tools/world/src/tables.ts'] },
      );
      rocksMeta = rocksStage.meta;
      rocksStageKey = rocksStage.key;
    } else log(`rocks   not built: no snapshot ${id} yet`);
  }

  // Stage: ground.lwt (today's topsoil + bedrock maps)
  const soilField = world.fields.find((f) => f.data?.as === 'topsoil');
  const bedrockField = world.fields.find((f) => f.data?.as === 'bedrock');
  let groundHeader: GroundHeader | undefined;
  let groundStageKey = '';
  if (soilField || bedrockField) {
    const soilPath = soilField ? datasetFile(soilField.data!.from, world.manifest.datasets[soilField.data!.from], soilField.data!.file) : undefined;
    const bedrockPath = bedrockField ? datasetFile(bedrockField.data!.from, world.manifest.datasets[bedrockField.data!.from], bedrockField.data!.file) : undefined;
    const groundStage = await dag.runStage(
      'ground',
      {
        soilField: fieldKey(soilField),
        soilExists: !!soilPath && existsSync(soilPath),
        bedrockField: fieldKey(bedrockField),
        bedrockExists: !!bedrockPath && existsSync(bedrockPath),
        periodHash,
      },
      async (sink) => {
        const ground = await buildGround(world, periodList, log);
        if (!ground) return {};
        await sink.put('ground.lwt', encodeTile(ground.header as unknown as Record<string, unknown>, ground.arrays, stableStringify));
        return { header: ground.header };
      },
      { codeFiles: ['tools/world/src/build/groundmaps.ts', 'tools/world/src/soilgrids.ts', 'core/substrate.ts', 'core/container.ts'] },
    );
    groundHeader = groundStage.meta.header;
    groundStageKey = groundStage.key;
  }

  // Stage: strata.lwt + strata/columns/*.json
  const substrateField = world.fields.find((f) => f.rule === 'substrate');
  const strataField = world.fields.find((f) => f.data?.as === 'strata');
  let strataMeta: { present: boolean; header?: StrataHeader; stats?: CoverageFile['strata'] } = { present: false };
  let strataStageKey = '';
  if (strataField) {
    const id = strataField.data!.from;
    const path = datasetFile(id, world.manifest.datasets[id], strataField.data!.file);
    if (existsSync(path)) {
      const strataStage = await dag.runStage(
        'strata',
        {
          field: fieldKey(strataField),
          fixes: fixesKey(claims.corrections(id)),
          periodHash,
          paleoImport,
          isoline: coastIsoline,
          substrateParams: substrateField?.params,
          plateModel: dsKey(PLATE_MODEL),
        },
        async (sink) => {
          const started = Date.now();
          const given = JSON.parse(await readFile(path, 'utf8')) as ColumnsSnapshot;
          const { snap, unapplied } = strataField.rows ? correctUnits(given, strataField.rows, claims.corrections(id)) : { snap: given, unapplied: [] };
          for (const u of unapplied) log(`warning rows        ${id} ${u}`);
          const [lo, hi] = [toMa(parsePoint(strataField.time!.lo as TimePointInput).t), toMa(parsePoint(strataField.time!.hi as TimePointInput).t)];
          let older = -Infinity;
          let younger = Infinity;
          for (const u of snap.units) {
            if (u[5] > older) older = u[5];
            if (u[6] < younger) younger = u[6];
          }
          if (Math.abs(lo - older) > 1e-6 || Math.abs(hi - younger) > 1e-6) throw new Error(`${strataField.id}: its time runs from ${lo} to ${hi} Ma, and its units from ${older} to ${younger} Ma`);
          const rule = substrateField?.params as unknown as SubstrateRule | undefined;
          const built = buildStrata(solved, snap, id, strataField, strataField.params as unknown as StrataParams, world.manifest.datasets[id]?.credit, log, rockLand && rule ? { periods: periodList, elevation: rockLand.snapshots, isoline: coastIsoline, rule } : undefined);
          await sink.put('strata.lwt', encodeTile(built.header as unknown as Record<string, unknown>, [built.rows, built.runs], stableStringify));
          for (const [p, c] of built.files) await sink.put(p, c);
          const stats: CoverageFile['strata'] = { columns: snap.columns.length, units: snap.units.length, cells: built.cells, lost: built.lost, ...(built.agreement ? { agreement: built.agreement } : {}) };
          log(`strata  built in ${((Date.now() - started) / 1000).toFixed(1)} s`);
          return { present: true, header: built.header, stats };
        },
        { codeFiles: ['tools/world/src/build/strata.ts', 'core/strata.ts', 'core/substrate.ts', 'tools/world/src/tables.ts', 'core/container.ts'] },
      );
      strataMeta = strataStage.meta;
      strataStageKey = strataStage.key;
    } else log(`strata  not built: no snapshot ${id} yet`);
  }

  // Stage: substrate.json
  const hasAnySubstrate = rocksMeta.present || !!groundHeader || strataMeta.present;
  const substrateRule = hasAnySubstrate ? (substrateField?.params as unknown as SubstrateRule | undefined) : undefined;
  let substrateStageKey = '';
  if (substrateField && substrateRule) {
    const subStage = await dag.runStage(
      'substrate',
      { field: fieldKey(substrateField), rocks: rocksMeta.present, ground: groundHeader ? [groundHeader.soil, groundHeader.bedrock].flatMap((m) => (m ? [m.span] : [])) : null, strata: strataMeta.present },
      async (sink) => {
        const file: SubstrateFile = {
          format: 'lightworld-substrate@1',
          field: substrateField.id,
          title: substrateField.title,
          description: substrateField.description,
          rule: substrateRule,
          ...(rocksMeta.present ? { rocks: 'rocks/index.json' } : {}),
          ...(groundHeader ? { ground: 'ground.lwt', held: [groundHeader.soil, groundHeader.bedrock].flatMap((m) => (m ? [m.span] : [])) } : {}),
          ...(strataMeta.present ? { strata: 'strata.lwt' } : {}),
        };
        await sink.put('substrate.json', stableStringify(file));
        return {};
      },
    );
    substrateStageKey = subStage.key;
  }

  // Lazy disk-backed loaders for rocks/ground/strata (only decoded if life-scene or coverage-matrix misses cache).
  let loadedRocks: RocksOut | undefined;
  let loadedGround: GroundBuilt | undefined;
  let loadedStrata: Pick<StrataOut, 'header' | 'rows' | 'runs' | 'columns' | 'of'> | undefined;
  const getRocks = () => (rocksMeta.present ? (loadedRocks ??= readRocksFromDag(dag)) : undefined);
  const getGround = () => (groundHeader ? (loadedGround ??= readGroundFromDag(dag)) : undefined);
  const getStrata = () => (strataMeta.present ? (loadedStrata ??= readStrataFromDag(dag)) : undefined);

  const groundOf = substrateRule
    ? (slice: number, positionAt: (ageMa: number) => { lat: number; lon: number }) => {
        const rocks = getRocks();
        const ground = getGround();
        const strata = getStrata();
        const k = rocks ? rocks.index.bins.findIndex((b) => slice >= b.from && slice <= b.to) : -1;
        const at = k >= 0 ? positionAt(toMa(rocks!.index.bins[k].slice)) : undefined;
        const rock = at ? substrateOfRocks(rocks!.bins[k], rocks!.index, substrateRule, at.lat, at.lon) : undefined;
        const today = ground && (groundHeld(ground.header.soil, slice) || groundHeld(ground.header.bedrock, slice)) ? positionAt(0) : undefined;
        let units: { substrate?: SceneSubstrate; bedrock?: SceneBedrock } | undefined;
        const unitsHere = () => {
          if (!units) {
            const now = strata ? positionAt(0) : undefined;
            const column = now ? columnAt(strata!, now.lat, now.lon) : undefined;
            units = column ? groundOfStrata(column, toMa(slice), strata!.of, substrateRule) : {};
          }
          return units;
        };
        return {
          substrate: firstGround(
            rock,
            () => (today && groundHeld(ground!.header.soil, slice) ? substrateOfSoil(ground!.maps, substrateRule, today.lat, today.lon) : undefined),
            () => unitsHere().substrate,
          ),
          bedrock: firstRock(
            today && groundHeld(ground!.header.bedrock, slice) ? bedrockAt(ground!.maps, substrateRule, today.lat, today.lon) : undefined,
            () => unitsHere().bedrock,
          ),
        };
      }
    : undefined;

  // Life stages: life-scene, life-sea, life-atlas, life-witness.
  const sites: SiteInfo[] = [];
  sites.push(...cityMeta.sites);
  let atlasFile: string | undefined;
  let seaStageKey = '';
  let hasSea = false;
  let atlasStageKey = '';
  let atlasCoverage: CoverageFile['forms'] | undefined;

  if (deepClimateMeta && deepClimateMeta.ages.length && biomeField && paleo) {
    const cg = climateGrid((climateField!.grid as { res_deg: number }).res_deg);
    const lifeEntities = world.entities.filter((e) => e.kind === 'taxon' || e.kind.startsWith('formation') || e.kind.startsWith('place') || e.kind.startsWith('period/'));
    const lifeEntitiesDigest = entitiesKey(lifeEntities, solved);
    const formationDatasets = [...world.fossils.keys()].sort().map(dsKey);
    const landFossilDatasets = [...world.landFossils.keys()].sort().map((id) => ({ dataset: dsKey(id), fixes: fixesKey(claims.corrections(id)) }));

    // Stage: life-scene
    const lifeSceneGen = world.generators.find((g) => g.id === 'gen:life/scene');
    if (lifeSceneGen) {
      const sceneStage = await dag.runStage(
        'life-scene',
        {
          gen: { id: lifeSceneGen.id, version: lifeSceneGen.version, params: lifeSceneGen.params, slots: lifeSceneGen.slots },
          climateKey: deepClimateStageKey,
          biomeField: fieldKey(biomeField),
          paleoImport,
          planetHash,
          rocksStageKey,
          groundStageKey,
          strataStageKey,
          substrateStageKey,
          formations: formationDatasets,
          plans: world.plans,
          entities: lifeEntitiesDigest,
        },
        async (sink) => {
          const living = buildScene(solved, paleo.snapshots, loadDeepClimateKeys(), cg, biomeField.params as unknown as ClimateRule, planetFile, log, groundOf);
          if (!living) return {};
          const f = living.file;
          const spec = f.spec;
          const filePath = `scene/${spec.site.id}.json`;
          await sink.put(filePath, stableStringify(f));
          const lp = lifeSceneGen.params as unknown as { site: { window: string[] }; view: { range: number; turn: number; tilt: number } };
          const heading = (Math.atan2(f.to_river[0], f.to_river[1]) * 180) / Math.PI + lp.view.turn * (180 / Math.PI);
          const site: SiteInfo = {
            kind: 'life',
            id: spec.site.id,
            label: spec.site.label,
            file: filePath,
            place: spec.site.place,
            origin: spec.site.origin,
            span: spec.site.span,
            slice: spec.site.slice,
            near: spec.site.span,
            window: lp.site.window.map((p) => parsePoint(p as TimePointInput).t) as [number, number],
            view: { x: f.focus[0], y: f.focus[1], range: lp.view.range, heading: Math.round(((heading % 360) + 360) % 360), tilt: lp.view.tilt },
          };
          return { site };
        },
        { codeFiles: ['tools/world/src/build/scene.ts', 'world/generators/life/scene/v15.ts', 'world/generators/life/forms.ts', 'core/scene.ts'] },
      );
      if (sceneStage.meta.site) sites.push(sceneStage.meta.site);
    }

    // Shared measured ages from the rock record (tightening stratigraphic spans for both land and sea atlases)
    // and finer recent climates (last 120 kyr) for the land atlas's climate gating.
    const rocksDataset = rockField?.data?.from;
    let cachedRocksAges: RocksAgeData | undefined;
    const loadRocksAges = async (): Promise<RocksAgeData | undefined> => {
      if (!rockField || !rocksDataset) return undefined;
      if (!cachedRocksAges) {
        const rd = world.manifest.datasets[rocksDataset];
        if (!rd) return undefined;
        const raw = JSON.parse(await readFile(datasetFile(rocksDataset, rd, rockField.data!.file), 'utf8')) as RocksSnapshot;
        cachedRocksAges = { ages: raw.ages, words: raw.words };
      }
      return cachedRocksAges;
    };
    const loadRecentClimateSources = (): RecentClimateSource[] =>
      recentClimates.map((rc) => {
        const grid = climateGrid((rc.field.grid as { res_deg: number }).res_deg);
        const keys: ClimateKeyframe[] = [];
        const seen = new Set<number>();
        for (const ch of rc.chunks) {
          const { header, arrays } = decodeTile<ClimateHeader>(toArrayBuffer(dag.readBlobBytesSync(ch.file)));
          for (const kf of header.keyframes) {
            if (seen.has(kf.ageMa)) continue;
            seen.add(kf.ageMa);
            const vals = arrays[kf.values] as Uint8Array;
            const plate = arrays[kf.plate] as Uint16Array;
            const n = grid.nx * grid.ny;
            const nodes = new Float32Array(n * 4);
            for (let k = 0; k < n; k++) {
              const p = plate[k];
              const b = k * 4;
              // Empty cells outside the recent climate's domain encode { hot: 0, cold: 0, aridity: 1, margin: 0 } without LAND_BIT.
              const empty = !(p & LAND_BIT) && vals[b] === 139 && vals[b + 1] === 139 && vals[b + 2] === 128 && vals[b + 3] === 128;
              if (empty) {
                nodes[b] = NaN;
                nodes[b + 1] = NaN;
                nodes[b + 2] = NaN;
                nodes[b + 3] = NaN;
              } else {
                const c = decodeNode([vals[b] / 255, vals[b + 1] / 255, vals[b + 2] / 255, vals[b + 3] / 255]);
                nodes[b] = c.hot;
                nodes[b + 1] = c.cold;
                nodes[b + 2] = c.aridity;
                nodes[b + 3] = c.margin;
              }
            }
            keys.push({ ageMa: kf.ageMa, frameMa: kf.frameMa, values: vals, plate, nodes });
          }
        }
        return { keys, grid, maxAgeMa: Math.max(0, ...rc.ages) };
      });

    // Stage: life-sea
    const seaField = world.fields.find((f) => f.data?.as === 'community-sea');
    if (seaField) {
      const id = seaField.data!.from;
      const d = world.manifest.datasets[id];
      const seaStage = await dag.runStage(
        'life-sea',
        {
          field: fieldKey(seaField),
          rocksDataset: dsKey(rocksDataset),
          periodHash,
          paleoImport,
          isoline: coastIsoline,
          plateModel: dsKey(PLATE_MODEL),
          plans: world.plans,
          entities: lifeEntitiesDigest,
        },
        async (sink) => {
          const snap = JSON.parse(await readFile(datasetFile(id, d, seaField.data!.file), 'utf8')) as LandSnapshot;
          const started = Date.now();
          const built = buildSeaAtlas(solved, periodList, paleo.snapshots, snap, id, seaField.params as unknown as SeaParams, coastIsoline, log, undefined, await loadRocksAges());
          for (const [path, content] of built.files) await sink.put(path, content);
          log(`sea     built in ${((Date.now() - started) / 1000).toFixed(1)} s`);
          return { present: true };
        },
        { codeFiles: ['tools/world/src/build/sea.ts', 'tools/world/src/build/atlas.ts', 'tools/world/src/forms.ts', 'core/atlas.ts', 'core/form.ts'] },
      );
      hasSea = seaStage.meta.present;
      seaStageKey = seaStage.key;
    }

    // Stage: life-atlas
    const atlasFields = world.fields.filter((f) => f.data?.as === 'community');
    const atlasStage = await dag.runStage(
      'life-atlas',
      {
        fields: atlasFields.map(fieldKey),
        landFossils: landFossilDatasets,
        rocksDataset: dsKey(rocksDataset),
        climateKey: deepClimateStageKey,
        recentClimateKeys: recentClimates.map((c) => c.stageKey),
        biomeField: fieldKey(biomeField),
        periodHash,
        paleoImport,
        plateModel: dsKey(PLATE_MODEL),
        plans: world.plans,
        entities: lifeEntitiesDigest,
      },
      async (sink) => {
        const atlas = buildAtlas(solved, periodList, paleo.snapshots, loadDeepClimateKeys(), cg, biomeField.params as unknown as ClimateRule, log, undefined, loadRecentClimateSources(), await loadRocksAges());
        if (!atlas) return { present: false };
        for (const [path, content] of atlas.files) await sink.put(path, content);
        return { present: true, forms: { ...atlas.index.coverage, wanted: atlas.wanted.slice(0, 200) } };
      },
      { codeFiles: ['tools/world/src/build/atlas.ts', 'tools/world/src/forms.ts', 'core/atlas.ts', 'core/form.ts'] },
    );
    atlasStageKey = atlasStage.key;

    if (atlasStage.meta.present) {
      atlasFile = 'life/atlas.json';
      atlasCoverage = atlasStage.meta.forms;

      // Stage: life-witness (lazily reads months, rivers, relief fine tiles, atlas, and sea bins from disk).
      await dag.runStage(
        'life-witness',
        {
          atlasStageKey,
          seaStageKey,
          deepClimateStageKey,
          recentClimateKeys: recentClimates.map((c) => c.stageKey),
          riversStageKey,
          mappedShores: riversInfo?.mappedShores ?? null,
          reliefFineStageKey,
          reliefIndexStageKey,
          paleoImport,
          planetHash,
          biomeField: fieldKey(biomeField),
          plans: world.plans,
          entities: lifeEntitiesDigest,
        },
        async (sink) => {
          const atlas = readAtlasFromDag(dag);
          const sea = hasSea ? readSeaFromDag(dag) : undefined;
          const monthTiles = new Map<string, MonthsTile>();
          const partTiles = new Map<string, PartsTile>();
          const monthsAt = monthsInfo
            ? (pw: PlaceWorld, lat: number, lon: number, ageMa: number) => {
                const where = monthsPlace(monthsInfo, pw, lat, lon, ageMa);
                if (!where) return undefined;
                const mTiles: MonthsTile[] = [];
                const pTiles: PartsTile[] = [];
                for (const key of tilesNear(where.lat, where.lon, where.set)) {
                  const file = where.set.tiles[key];
                  if (!file) continue;
                  if (!monthTiles.has(file)) {
                    const { header, arrays } = decodeTile<MonthsTileHeader>(toArrayBuffer(dag.readBlobBytesSync(file)));
                    monthTiles.set(file, new MonthsTile(header, arrays as unknown as ArrayLike<number>[]));
                  }
                  mTiles.push(monthTiles.get(file)!);
                  const part = partsFile(where.set, where.ageMa, key);
                  if (!part) continue;
                  if (!partTiles.has(part)) {
                    const { header, arrays } = decodeTile<PartsTileHeader>(toArrayBuffer(dag.readBlobBytesSync(part)));
                    partTiles.set(part, new PartsTile(header, arrays as unknown as ArrayLike<number>[]));
                  }
                  pTiles.push(partTiles.get(part)!);
                }
                return mTiles.length ? placeMonths(monthsInfo, where, mTiles, undefined, pTiles) : undefined;
              }
            : undefined;
          const carriedAt = reliefInfo?.carried ? fromMa(reliefInfo.carried.fullMa * 0.8) : undefined;
          const seen = witnesses(
            solved,
            atlas.index,
            atlas.files,
            paleo.snapshots,
            loadDeepClimateKeys(),
            cg,
            biomeField.params as unknown as ClimateRule,
            planetFile,
            log,
            waterAt,
            monthsAt,
            sea,
            shapeAt ? { at: shapeAt, when: carriedAt, plateNow } : undefined,
          );
          await sink.put('life/witness.json', stableStringify(seen));
          return { count: seen.length };
        },
        {
          codeFiles: [
            'tools/world/src/build/scene.ts',
            'world/generators/life/spec.ts',
            'world/generators/life/scene/v15.ts',
            'world/generators/life/climate.ts',
            'world/generators/life/water.ts',
            'world/generators/life/forms.ts',
            'core/relief.ts',
          ],
        },
      );
    }
  }

  // Coverage: cache the expensive 160-column matrix + tierCounts + energyBalance + forests in a DAG stage,
  // then combine with fast per-build claims/wanted/tiles/glance into `coverage.json`.
  const coverageFile = coverage(world, wanted, allFeatures, tiles);
  if (landscapeMeta?.present && landscapeMeta.disagree && landscapeMeta.farming) {
    coverageFile.landscape = { disagree: landscapeMeta.disagree, farming: landscapeMeta.farming, ...(landscapeMeta.housing ? { housing: landscapeMeta.housing } : {}), ...(landscapeMeta.people ? { people: landscapeMeta.people } : {}) };
  }
  if (rocksMeta.stats) coverageFile.rocks = rocksMeta.stats;
  if (strataMeta.stats) coverageFile.strata = strataMeta.stats;
  if (atlasCoverage) coverageFile.forms = atlasCoverage;

  const genericLandGen = world.generators.find((g) => g.id === GENERIC_LAND);
  const climateCheckEntities = world.entities.filter((e) => e.kind === 'site/fossil-forest' || e.claims.some((c) => c.prop === 'co2' || c.prop === 'paleolatitude' || c.prop === 'biome'));
  const coverageAnalytics = await dag.runStage(
    'coverage-matrix',
    {
      span,
      planetHash,
      seriesSha,
      grids: gridsKey,
      deepClimateStageKey,
      recentClimateKeys: recentClimates.map((c) => c.stageKey),
      iceStageKey,
      peopleStageKey,
      politiesStageKey,
      landscapeStageKey,
      rocksStageKey,
      groundStageKey,
      strataStageKey,
      substrateStageKey,
      atlasStageKey,
      seaStageKey,
      riversStageKey,
      reliefIndexStageKey,
      genericLandGen: genericLandGen ? { id: genericLandGen.id, version: genericLandGen.version, params: genericLandGen.params, slots: genericLandGen.slots } : undefined,
      fieldsMeta: world.fields.map((f) => ({ id: f.id, title: f.title, rule: f.rule, data: f.data, grid: f.grid, time: f.time })),
      climateCheckEntities: entitiesKey(climateCheckEntities, solved),
    },
    async () => {
      const balance = energyBalanceReport(world, planetFile, seriesList);
      if (balance) {
        for (const e of balance.evidence) log(`climate  energy balance at ${e.id} (${e.ageMa} Ma, ${e.co2.join('–')} bar): freezes below ${e.freezeBelow} bar; ${e.frozen} of ${e.members} runs frozen`);
        for (const g of balance.glaciations) log(`climate  energy balance for ${g.id}: freezes below ${g.freezeBelowAtStart} bar at its start, thaws ${g.thawAboveAtEnd === null ? "only above the model's limit" : `above ${g.thawAboveAtEnd} bar`} at its end${g.co2AtEnd ? `; the rocks give ${[...new Set(g.co2AtEnd.value)].join('–')} bar` : ''}`);
        if (balance.phanerozoic) {
          const d = balance.phanerozoic.meanDifference;
          log(`climate  energy balance over the Phanerozoic against ${balance.phanerozoic.against}: ${Math.abs(d)} °C ${d < 0 ? 'colder' : 'warmer'} on average, r = ${balance.phanerozoic.correlation}`);
        }
      }
      let forests: CoverageFile['forests'];
      if (deepClimateMeta?.ages.length && biomeField) {
        forests = forestChecks(solved, loadDeepClimateKeys(), climateGrid((climateField!.grid as { res_deg: number }).res_deg), biomeField.params as unknown as ClimateRule);
        const dry = forests.filter((f) => f.climate === 'desert');
        log(`biomes  ${forests.length} fossil forests against the climate field: ${dry.length ? `${dry.length} in a reconstructed desert: ${dry.map((f) => `${f.id} (${f.ageMa} Ma)`).join(', ')}` : 'none in a reconstructed desert'}`);
      }

      const polities = hasPolities ? (JSON.parse(dag.readBlobTextSync('polities.json')) as PolitiesFile) : undefined;
      const atlas = atlasFile ? readAtlasFromDag(dag) : undefined;
      const sea = hasSea ? readSeaFromDag(dag) : undefined;
      const riversSeen = riversSeenBlobSha ? dag.readBlobByHashSync(riversSeenBlobSha) : undefined;
      const resolveWorld = resolveWorldOf(
        world,
        solved,
        grids,
        (deepClimateMeta?.ages ?? []).map((ageMa) => ({ ageMa })),
        iceMeta,
        peopleHeader ? { header: peopleHeader } : undefined,
        polities,
        atlas,
        sea,
        riversInfo ? { info: riversInfo, seen: riversSeen } : undefined,
        seriesList,
        planetFile,
      );
      if (landscapeMeta?.present) resolveWorld.landscape = landscapeResolve(readLandscapeFromDag(dag));
      if (substrateRule) {
        const rocks = getRocks();
        const ground = getGround();
        const strata = getStrata();
        const carry = strata && rockLand ? todayOf(solved, rockLand.snapshots) : undefined;
        resolveWorld.substrate = groundResolve(
          rocks,
          ground,
          substrateRule,
          strata && carry
            ? {
                span: strata.header.span,
                at: (lat, lon, t) => {
                  const ageMa = toMa(t);
                  const now = ageMa >= 0 ? carry(lat, lon, ageMa) : undefined;
                  const column = now ? columnAt(strata, now[0], now[1]) : undefined;
                  return column ? groundOfStrata(column, ageMa, strata.of, substrateRule) : {};
                },
              }
            : undefined,
        );
      }

      const tiers = TIER_SPANS.map((sp) => {
        const times = Array.from({ length: 8 }, (_, i) => fromMa(sp.olderMa + ((sp.youngerMa - sp.olderMa) * (i + 0.5)) / 8));
        return { span: sp.label, layers: tierCounts(resolveWorld, gridPlaces(10), times) };
      });

      const started = Date.now();
      const sources = coverageSources(
        world,
        span,
        resolveWorld.planet,
        grids,
        [...(climateField && deepClimateMeta?.ages.length ? [{ field: climateField, keys: deepClimateMeta.ages.map((ageMa) => ({ ageMa })) }] : []), ...recentClimates.map((c) => ({ field: c.field, keys: c.ages.map((ageMa) => ({ ageMa })) }))],
        iceField && iceMeta ? { field: iceField, built: iceMeta } : undefined,
        peopleHeader ? { header: peopleHeader } : undefined,
        polities ? { field: world.fields.find((f) => f.data?.as === 'polities')!, file: polities } : undefined,
        atlas,
        seriesList,
        sea,
        riversInfo,
      );
      if (rocksMeta.present && rocksMeta.stagesSpan && rocksMeta.source && substrateField && substrateRule) {
        sources.push({ layer: 'substrate', id: rocksMeta.source, title: world.source.get(rocksMeta.source)?.title ?? rocksMeta.source, tier: 'evidence', span: rocksMeta.stagesSpan, lane: 'rocks' });
        sources.push({ layer: 'substrate', id: substrateField.id, title: substrateField.title, tier: 'model', span: rocksMeta.stagesSpan, lane: 'substrate' });
      }
      if (reliefInfo && reliefGrid) {
        const held: [number, number] = [fromMa(reliefGrid.coverMa[0]), fromMa(reliefGrid.coverMa[1])];
        sources.push({ layer: 'geography', id: reliefInfo.field, title: `${reliefInfo.title}: the survey's cells, in a scene`, tier: 'model', span: held, res_deg: Math.round(reliefInfo.fine.step * 1e5) / 1e5, lane: 'relief-fine' });
        if (reliefInfo.carried) sources.push({ layer: 'geography', id: reliefInfo.carried.field, title: reliefInfo.carried.title, tier: 'model', span: [fromMa(carriedReach(reliefInfo.carried)), held[0]], res_deg: Math.round(reliefInfo.fine.step * 1e5) / 1e5, lane: 'relief-fine' });
      }
      if (groundHeader && substrateRule) {
        for (const m of [groundHeader.soil, groundHeader.bedrock]) if (m) sources.push({ layer: 'substrate', id: m.field, title: m.title, tier: 'model', span: m.span, res_deg: m.res, lane: m.field });
      }
      if (strataMeta.header && substrateRule) sources.push({ layer: 'substrate', id: strataMeta.header.field, title: strataMeta.header.title, tier: 'model', span: strataMeta.header.span, res_deg: strataMeta.header.grid.res, lane: strataMeta.header.field });
      if (landscapeMeta?.present && landscapeMeta.span && landscapeMeta.assessed && landscapeMeta.res !== undefined) {
        const af = world.fields.find((f) => f.data?.as === 'anthromes')!;
        const lf = world.fields.find((f) => f.data?.as === 'land-use-assessment')!;
        sources.push({ layer: 'people', id: af.id, title: af.title, tier: 'model', span: landscapeMeta.span, res_deg: landscapeMeta.res, lane: 'anthromes' });
        sources.push({ layer: 'people', id: lf.id, title: lf.title, tier: 'evidence', span: landscapeMeta.assessed, lane: 'assessments' });
        for (const f of world.fields.filter((x) => x.data?.as === 'cities')) {
          const cs = landscapeMeta.citySpans?.[f.id];
          if (cs) sources.push({ layer: 'people', id: f.id, title: f.title, tier: 'evidence', span: cs, lane: 'cities' });
        }
      }
      const matrix = coverageMatrix(resolveWorld, span, COVERAGE.columns, COVERAGE.step, COVERAGE.samples, sources);
      log(`coverage  ${COVERAGE.columns} columns × ${matrix.layers.length} layers over a ${COVERAGE.step}° grid in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      const now = fromMa(0);
      const land = landShares(resolveWorld, matrix.columns, COVERAGE.step, now);
      return { ...(balance ? { energyBalance: balance } : {}), ...(forests ? { forests } : {}), tiers, matrix, land };
    },
    { codeFiles: ['core/resolve.ts', 'core/coverage.ts', 'core/glance.ts', 'tools/world/src/build/energybalance.ts', 'tools/world/src/build/climate.ts'] },
  );
  if (coverageAnalytics.meta.energyBalance) coverageFile.energyBalance = coverageAnalytics.meta.energyBalance;
  if (coverageAnalytics.meta.forests) coverageFile.forests = coverageAnalytics.meta.forests;
  coverageFile.tiers = coverageAnalytics.meta.tiers;
  coverageFile.matrix = coverageAnalytics.meta.matrix;
  // How much is known, at a glance, from the same counts: the landing page's bars.
  const now = fromMa(0);
  coverageFile.glance = glance({
    matrix: coverageFile.matrix,
    until: now,
    land: coverageAnalytics.meta.land,
    housing: landscapeMeta?.housing,
    forms: coverageFile.forms,
    ladder: coverageFile.claims.ladder,
    formatTime,
  });
  log(`coverage  at a glance: ${coverageFile.glance.groups.flatMap((g) => g.rows).map((r) => `${r.label} ${r.share === null ? '–' : `${(r.share * 100).toFixed(1)}%`}`).join(', ')}`);
  await dag.putDirect('coverage.json', stableStringify(coverageFile));

  // 9. Index and identity (computed directly from sorted blob hashes — zero file bytes buffered in RAM).
  const tileset: Omit<Tileset, 'build'> = {
    format: 'lightworld-tileset@4',
    fields: grids.map((g) => fieldInfo(world, g)),
    timeRange: span,
    lods: tilesetLods,
    tiles,
    files: {
      frames: 'frames.json',
      periods: 'periods.json',
      search: 'search.json',
      records: 'records/',
      coverage: 'coverage.json',
      series: 'series.json',
      planet: 'planet.json',
      territory: 'territory.json',
      city: cityMeta.files[0],
      climate: deepClimateMeta?.ages.length ? 'climate.lwt' : undefined,
      ice: iceMeta ? 'ice.lwt' : undefined,
      tree: 'tree.json',
      things: THINGS_INDEX,
      ...(hasPresent ? { present: 'present.json' } : {}),
      ...(hasHazards ? { hazards: 'hazards.json' } : {}),
      ...(hasPolities ? { polities: 'polities.json' } : {}),
      ...(hasOverlays ? { overlays: 'overlays.json' } : {}),
      ...(peopleHeader ? { people: 'people.lwt' } : {}),
      ...(atlasFile ? { atlas: atlasFile } : {}),
      ...(hasSea ? { sea: 'life/sea.json' } : {}),
      ...(rocksMeta.present ? { rocks: 'rocks/index.json' } : {}),
      ...(substrateRule ? { substrate: 'substrate.json' } : {}),
      ...(groundHeader ? { ground: 'ground.lwt' } : {}),
      ...(strataMeta.present ? { strata: 'strata.lwt' } : {}),
      ...(landscapeMeta?.present ? { landscape: 'people/landscape.json' } : {}),
      ...(reliefInfo ? { relief: 'relief/index.json' } : {}),
      features: FEATURE_INDEX,
    },
    rivers: riversInfo,
    months: monthsInfo,
    climates: recentClimates.length
      ? recentClimates.map(({ field: f, ages, chunks }) => {
          const [minK, maxK] = minMax(ages);
          return {
            field: f.id,
            title: f.title,
            description: f.description,
            source: f.data!.from,
            sourceRecord: sourceRecord(world.source.get(f.data!.from)!),
            spread: f.spread,
            res_deg: (f.grid as { res_deg: number }).res_deg,
            coverage: [fromMa(maxK), fromMa(minK)] as [number, number],
            chunks,
          };
        })
      : undefined,
    climate:
      climateField && biomeField && deepClimateMeta?.ages.length
        ? {
            field: climateField.id,
            title: climateField.title,
            description: climateField.description,
            biomeTitle: biomeField.title,
            biomeDescription: biomeField.description,
            source: climateField.data!.from,
            sourceRecord: sourceRecord(world.source.get(climateField.data!.from)!),
            params: biomeField.params ?? {},
            spread: climateField.spread,
          }
        : undefined,
    ice:
      iceField && iceMeta
        ? {
            field: iceField.id,
            title: iceField.title,
            description: iceField.description,
            uncertainty: iceField.uncertainty,
            basis: iceField.basis!,
            source: iceField.data!.from,
            sourceRecord: sourceRecord(world.source.get(iceField.data!.from)!),
            coverage: iceMeta.coverage,
            keyframesMa: iceMeta.keyframesMa,
            projection: iceField.projection ? { method: iceField.projection.method, until: parsePoint(iceField.projection.until as TimePointInput).t, note: iceField.projection.note } : undefined,
            marginM: iceMeta.marginM,
            scenarios: iceMeta.scenarios,
          }
        : undefined,
    layers: layerInfos.length ? layerInfos : undefined,
    credits: credits(world),
    alternatives,
    kinds: Object.fromEntries(Object.entries(world.vocab.kinds).map(([k, v]) => [k, v.label])),
    sites: sites.length ? sites : undefined,
  };
  await dag.putDirect('ATTRIBUTION.md', attributionMarkdown(world));
  const contentHash = dag.contentHash(stableStringify(tileset));
  const buildId = contentHash.slice(0, 16);
  await dag.putDirect('tileset.json', stableStringify({ ...tileset, build: buildId }));
  const { commit, dirty } = dataCommit();
  await dag.putDirect(
    'build.json',
    stableStringify(
      {
        id: buildId,
        data: { commit, dirty },
        datasets: Object.fromEntries(Object.entries(world.manifest.datasets).map(([id, d]) => [id, { sha256: d.fetch.sha256, version: d.version, license: d.license }])),
        snapshots: Object.fromEntries(world.sources.filter((s) => s.snapshot).map((s) => [s.id, s.snapshot])),
        generators: Object.fromEntries(world.generators.map((g) => [g.id, { version: g.version, seeds: Object.fromEntries(Object.entries(g.slots).map(([k, v]) => [k, v.seed])) }])),
        alternatives: { shown: alternatives.flatMap((g) => g.members.map((m) => m.id)), default: Object.fromEntries(alternatives.map((g) => [g.id, g.default])) },
        licenses: { allowed: world.manifest.publish.licenses, datasets: Object.fromEntries(Object.entries(world.manifest.datasets).map(([id, d]) => [id, d.license])) },
        importer: { outputs: imports, pygplates },
        counts: { entities: world.entities.length, claims: world.entities.reduce((n, e) => n + e.claims.length + e.relations.length, 0), sources: world.sources.length, tiles: tiles.length, wanted: wanted.length },
      },
      1,
    ),
  );
  // Content-addressed build manifest: maps every logical build file to its immutable sha256 blob.
  // Excluded from `contentHash` so `buildId` remains non-circular and identical to prior builds.
  const manifest: BuildManifest = {
    format: 'lightworld-manifest@1',
    build: buildId,
    blobs: '../blobs/',
    files: dag.manifestFiles(),
  };
  await dag.putDirect('manifest.json', stableStringify(manifest));

  // 10. Materialize: atomically hard-link from `.cache/build/blobs/` into `dist/builds/<id>/`
  //     and populate shared `dist/builds/blobs/<sha256>` without duplicating bytes on disk.
  const dest = join(BUILDS, buildId);
  await dag.materialize(dest, join(BUILDS, 'blobs'));
  const indexPath = join(BUILDS, 'index.json');
  const index = existsSync(indexPath) ? JSON.parse(await readFile(indexPath, 'utf8')) : { builds: [] };
  index.builds = [{ id: buildId, commit, dirty }, ...index.builds.filter((b: { id: string }) => b.id !== buildId)];
  index.latest = buildId;
  await writeFile(indexPath, JSON.stringify(index, null, 1) + '\n');
  const stats = dag.summary();
  log(`build ${buildId}: ${tiles.length} tiles, ${recordsStage.meta.count} records, ${seriesList.length} series, ${(dag.totalBytes() / 1e6).toFixed(1)} MB (${stats.hits} cache hits, ${stats.misses} rebuilt) → ${dest}`);
  if (args.includes('--print-id')) console.log(buildId);
  return 0;
}
