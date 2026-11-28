// The sea's level at each keyframe of the elevation field, and the height of the land conditioned on the rocks and on
// the ranges' records (heights/index.json, heights/<age>.lwt; core/heights.ts; model:earth/shore-level,
// model:earth/land-height). The build places the rock record's collections where their plates stood at each keyframe,
// as the chance of sea does, and keeps where each lies today. From the beds laid down at the shore it reads the level
// against the map's own coast; from the map's keyframe of the present against today's surveyed ground, from the shore
// beds and from the ranges, how far the map misses; and then the height at every node. It scores what it made on beds
// it was not shown: the kinds of localities with their node, their tile, their block and their keyframe held out,
// beside the distance from the map's coast and beside a smoother that knows no map; where the map puts shore beds
// held out; each range with its own record left out; and the present, where the ground is measured.
import { chanceByte, coastDistance, expit, logit, nodeOf, scoreOf, type Guess, type SeaGrid } from '../../../../core/coast.ts';
import { encodeTile } from '../../../../core/container.ts';
import {
  addBeds,
  bedsOf,
  between,
  chanceBefore,
  chanceFrom,
  HEIGHT_BAND,
  heightAt,
  heightShort,
  levelGiven,
  levelsWithout,
  mapHeight,
  marineAmong,
  middle,
  missOf,
  nothingNear,
  RESTS,
  sdByte,
  shoreLine,
  smoothLevels,
  spreadOf,
  withRange,
  withShore,
  type Bed,
  type BedSite,
  type Height,
  type HeightKeyframe,
  type HeightsIndex,
  type HeightStretch,
  type KindHeld,
  type LevelSeen,
  type LevelSide,
  type Miss,
  type Near,
  type RangeHeld,
  type ShoreHeld,
  type ShorePoint,
} from '../../../../core/heights.ts';
import { kmBetween } from '../../../../core/landscape.ts';
import { conj, mul, rotate, toLatLon, unitVector, type Quat } from '../../../../core/quat.ts';
import type { SeriesRecord, SourceRecord } from '../../../../core/records.ts';
import { insideOutline, type ReliefRange } from '../../../../core/relief.ts';
import type { RotationModel } from '../../../../core/rotation-model.ts';
import { fromMa } from '../../../../core/time.ts';
import type { RocksSnapshot } from '../pbdb.ts';
import { stableStringify } from '../util.ts';
import { rowShare } from './atlas.ts';
import { SRC_H, SRC_W, type Snapshot } from './fields.ts';

/** The parameters of field:earth/shore-level and field:earth/land-height, together. */
export interface HeightsParams {
  /** the classes of environment, as the rock record's database names them, whose beds were laid down at the shore */
  shore_classes: string[];
  /** the map's depth below its coast is read no deeper than this for the level, in metres (negative) */
  floor_m: number;
  /** how many keyframes either side share one reading of how far the map follows today's ground, and of how far it misses */
  pool: number;
  /** a shore bed counts for less in the level the higher its ground stands today: by a factor of e for each so many metres */
  near_m: number;
  /** how many shore beds, by weight, a keyframe must have for its own to tell its level */
  shore_min: number;
  /** the walks the level may take: how much of a keyframe's level the next keeps, and how far it strays from the map's coast, in metres */
  hold: number[];
  stray_m: number[];
  /** the box of ground one bed is, in degrees, and below what height the map's sea is the ocean's floor */
  box_deg: number;
  deep_m: number;
  /** the bell the beds near a node are counted by, in km */
  kernel_km: number;
  /** a shore bed's word on the map's miss is carried to ground whose height on the map is within about this of the map's height at the bed, in metres */
  like_m: number;
  /** the kind of a bed, of the sea or of the land, is carried to ground whose height on the map is within about this of the map's height at the bed */
  like_kinds_m: number;
  /** what was found near a node counts against the map's word for its height only so far as it comes to this many beds */
  least_beds: number;
  /** today's ground below this, in metres, is low: the map's miss at the present is metres there and a share of the height above it */
  low_m: number;
  /** south of this latitude the map of the present has the bed under the ice and the survey its top: left out of what the present measures */
  ice_south: number;
  /** the doubt given a range's "about today's height": a share of it, and never less than so many metres */
  range_doubt: number;
  range_doubt_m: number;
  /** where the fits start: how many beds the map's word counts for; the rival's slopes by distance; and the furthest a distance moves the odds */
  strength: number;
  slope_in: number;
  slope_off: number;
  cap: number;
  /** how many keyframes either side share a yield, and how many land beds they must have for it to be fitted */
  yield_pool: number;
  yield_land_min: number;
  /** what is held out: tiles and blocks, in degrees, and every how many keyframes one whole */
  tile_deg: number;
  block_deg: number;
  span_every: number;
}

/** The parameters of the rock record a collection's share of a span is worked out by (field:earth/rock-record). */
export interface SpanRule {
  longest_span: number;
  longest_span_in_stages: number;
}

/** Today's ground on a global grid of nodes from 90°N and 180°W: the mean of each cell (tools/world/src/importer.ts, importMeanGrid). */
export interface TodayGrid {
  nx: number;
  ny: number;
  step: number;
  data: Float32Array;
}

/** Another's curve of sea level, set beside the level and never read by it: [year, value, …] rows, oldest first. */
export interface RivalCurve {
  field: string;
  title: string;
  points: readonly (readonly [number, number, ...unknown[]])[];
}

/** A keyframe as the build keeps it. */
export interface HeightKey {
  ageMa: number;
  olderMa: number;
  youngerMa: number;
  elev: Int16Array;
  beds: Bed[];
  /**
   * each bed: the map's height above its coast where it stood; today's height of its ground above today's sea, on the
   * survey's grid; and the same at the map's own grain, read between its nodes
   */
  m: Float32Array;
  t: Float32Array;
  t1: Float32Array;
  /** each node: whether it is the ocean's floor, and its distance from the map's coast in degrees (positive in the sea, infinite over the floor) */
  floor: Uint8Array;
  d: Float32Array;
  /** what was found near each node */
  near: Near;
  level: number;
  levelSd: number;
  follow: number;
  miss: Miss;
  yieldLog: number;
  /** each node's bell before the kinds of beds, and the chance it lay below the level */
  mean: Float32Array;
  sd: Float32Array;
  chance: Float32Array;
  rests: Uint8Array;
}

export interface HeightsOut {
  index: HeightsIndex;
  files: Map<string, Uint8Array | string>;
  keys: HeightKey[];
}

const GRID: SeaGrid = { nx: SRC_W, ny: SRC_H, step: 1 };
const NODES = SRC_W * SRC_H;
const Z90 = 1.6449;

type Held = 'cell' | 'tile' | 'block' | 'all' | 'none';
/**
 * What was found near a bed's node without its own group's beds: marine and land by distance alone, shore beds, the
 * map's heights at those summed, and marine and land counted on ground of like height.
 */
type Sums = [number, number, number, number, number, number];

/** A bed as the fits read it. */
interface Row {
  /** its number among all the beds, its keyframe, and its number among the keyframe's */
  id: number;
  k: number;
  i: number;
  node: number;
  sea: boolean;
  w: number;
  shore: number;
  /** the map's height above its coast at the bed's place; today's height of its ground, on the survey's grid and at the map's grain */
  m: number;
  t: number;
  t1: number;
  d: number;
  /** today's height of a range's ground where the bed's node lies in one that stood, and its doubt; else undefined */
  range?: [number, number];
  cell: Sums;
  tile: Sums;
  block: Sums;
  all: Sums;
  /** the same counted by distance alone, with no ocean's floor: what the smoother that knows no map reads */
  plain: Record<'cell' | 'tile' | 'block' | 'all', [number, number]>;
}

/** The highest point of a function of one number between two bounds, by golden section. */
function highest(f: (x: number) => number, lo: number, hi: number, steps: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < steps; i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

/** The plate under a place of today's Earth, by the plates of today's land: searching out a few degrees for one, as the chance of sea places its localities. */
function plateFinder(now: Snapshot): (lat: number, lon: number) => number {
  return (lat, lon) => {
    const j0 = Math.round(90 - lat);
    const i0 = Math.round(lon + 180);
    for (let r = 0; r <= 3; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(dj), Math.abs(di)) !== r) continue;
          const q = now.plate[Math.max(0, Math.min(180, j0 + dj)) * SRC_W + ((((i0 + di) % SRC_W) + SRC_W) % SRC_W)];
          if (q) return q;
        }
      }
    }
    return 0;
  };
}

/** Today's ground averaged about each node of the elevation's grid: the mean of the survey's nodes within half a step. */
export function todayAtNodes(today: TodayGrid): Float32Array {
  const out = new Float32Array(NODES);
  const per = Math.round(GRID.step / today.step);
  const half = Math.floor(per / 2);
  for (let i = 0; i < SRC_H; i++) {
    for (let j = 0; j < SRC_W; j++) {
      let sum = 0;
      let n = 0;
      for (let di = -half; di <= half; di++) {
        const r = i * per + di;
        if (r < 0 || r >= today.ny) continue;
        const wi = Math.abs(di) === half ? 0.5 : 1;
        for (let dj = -half; dj <= half; dj++) {
          const c = (((j * per + dj) % today.nx) + today.nx) % today.nx;
          const w = wi * (Math.abs(dj) === half ? 0.5 : 1);
          sum += today.data[r * today.nx + c] * w;
          n += w;
        }
      }
      out[i * SRC_W + j] = sum / n;
    }
  }
  return out;
}

/** A curve's value at a year, read straight between its rows, and held at its ends. */
function curveAt(points: RivalCurve['points'], t: number): number {
  if (t <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (t >= last[0]) return last[1];
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const [t0, v0] = points[lo];
  const [t1, v1] = points[hi];
  return t1 === t0 ? v0 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
}

/**
 * The keyframes with their spans and their beds, before anything is fitted: the chance of sea's localities
 * (tools/world/src/build/coast.ts, coastKeys), each with where it lies today, how high its ground stands there, and
 * whether it was laid down at the shore.
 */
export function heightKeys(model: RotationModel, elevation: Snapshot[], rocks: RocksSnapshot, span: SpanRule, today: TodayGrid, p: Pick<HeightsParams, 'box_deg' | 'deep_m' | 'shore_classes'>, isoline: number): HeightKey[] {
  const sorted = [...elevation].sort((a, b) => a.ageMa - b.ageMa);
  const plateOf = plateFinder(sorted[0]);
  const bit = (name: string) => {
    const k = rocks.classes.indexOf(name);
    return k < 0 ? 0 : 1 << k;
  };
  const LAND = bit('terrestrial');
  const SEA = bit('marine');
  const SHORE = p.shore_classes.reduce((bits, name) => bits | bit(name), 0);
  const edges = sorted.map((s, k) => ({
    older: k < sorted.length - 1 ? (s.ageMa + sorted[k + 1].ageMa) / 2 : s.ageMa + (s.ageMa - sorted[k - 1].ageMa) / 2,
    younger: k > 0 ? (s.ageMa + sorted[k - 1].ageMa) / 2 : Math.min(0, s.ageMa),
  }));
  const sites: BedSite[][] = sorted.map(() => []);
  const back = new Map<number, Quat | null>();
  const forth = sorted.map(() => new Map<number, Quat | null>());
  for (const c of rocks.collections) {
    const kind = c[16] & SEA && !(c[16] & LAND) ? 1 : c[16] & LAND && !(c[16] & SEA) ? 0 : -1;
    if (kind < 0) continue;
    let plate = -1;
    for (let k = 0; k < sorted.length; k++) {
      if (edges[k].younger >= c[3] && c[3] !== c[4]) break;
      if (edges[k].older <= c[4]) continue;
      const share = rowShare(c[3], c[4], edges[k].older, edges[k].younger, span);
      if (!share) continue;
      if (plate < 0) plate = plateOf(c[1], c[2]);
      let from = back.get(plate);
      if (from === undefined) back.set(plate, (from = plate && model.reaches(plate, 0) ? conj(model.total(plate, 0)) : null));
      let to = forth[k].get(plate);
      if (to === undefined) forth[k].set(plate, (to = plate && model.reaches(plate, sorted[k].ageMa) ? model.total(plate, sorted[k].ageMa) : null));
      if (!from || !to) continue;
      const [lat, lon] = toLatLon(rotate(to, rotate(from, unitVector(c[1], c[2]))));
      sites[k].push({ lat, lon, lat0: c[1], lon0: c[2], sea: kind === 1, shore: kind === 1 && !!(c[16] & SHORE), share });
    }
  }
  const todayOf = (lat: number, lon: number): number => {
    const r = Math.max(0, Math.min(today.ny - 1, Math.round((90 - lat) / today.step)));
    const c = ((Math.round((lon + 180) / today.step) % today.nx) + today.nx) % today.nx;
    return today.data[r * today.nx + c];
  };
  return sorted.map((s, k) => {
    const sea = new Uint8Array(NODES);
    const floor = new Uint8Array(NODES);
    for (let i = 0; i < NODES; i++) {
      sea[i] = s.elev[i] < isoline ? 1 : 0;
      floor[i] = s.elev[i] < p.deep_m ? 1 : 0;
    }
    const d = coastDistance(sea, GRID);
    for (let i = 0; i < NODES; i++) if (floor[i]) d[i] = Infinity;
    const beds = bedsOf(sites[k], p.box_deg, GRID);
    const m = new Float32Array(beds.length);
    const t = new Float32Array(beds.length);
    beds.forEach((b, i) => {
      m[i] = between(s.elev, GRID, b.lat, b.lon) - isoline;
      t[i] = todayOf(b.lat0, b.lon0);
    });
    return {
      ageMa: s.ageMa,
      olderMa: edges[k].older,
      youngerMa: edges[k].younger,
      elev: s.elev,
      beds,
      m,
      t,
      t1: new Float32Array(beds.length),
      floor,
      d,
      near: nothingNear(GRID),
      level: 0,
      levelSd: 0,
      follow: 0,
      miss: { base: 0, high: 0, deep: 0 },
      yieldLog: 0,
      mean: new Float32Array(NODES),
      sd: new Float32Array(NODES),
      chance: new Float32Array(NODES),
      rests: new Uint8Array(NODES),
    };
  });
}

/** A way of telling the kind of a bed: its chance of sea before the kinds found near are read, each keyframe's yield, and what its word counts for. */
interface Teller {
  /** the chance of sea at a bed's place before the kinds found near, with some of the beds near held out */
  before: (r: Row, held: Held) => number;
  /** the kinds found near, with some held out */
  found: (r: Row, held: Held) => [number, number];
  yields: number[];
  strength: number;
  /** what was found near counts against its word only so far as it comes to this many beds (core/heights.ts, marineAmong) */
  least?: number;
  /**
   * whether its yield is fitted where its own word is in doubt: each bed counting by how near an even chance the
   * teller has its ground before any bed is read. A yield is the share of marine among what is found where the sea is
   * as likely as not, and a teller that is sure of ground it has wrong would have its yield stretched to cover that.
   */
  doubt?: boolean;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0);
const round = (x: number, digits = 3) => Number(x.toPrecision(digits));
const whole = (x: number) => Math.round(x);

/**
 * The sea's level and the height of the land at every keyframe, with what they rest on and how they hold. `ranges`
 * are the ranges whose records say when they stood; `rival` is another's curve of sea level, set beside the level and
 * never read by it; `about` is for the files' headers.
 */
export function buildHeights(
  model: RotationModel,
  elevation: Snapshot[],
  rocks: RocksSnapshot,
  span: SpanRule,
  today: TodayGrid,
  ranges: ReliefRange[],
  rival: RivalCurve | undefined,
  p: HeightsParams,
  isoline: number,
  about: { field: string; title: string; description?: string; level: { field: string; title: string; description?: string; quantity?: string }; elevation: string; source: string; sourceRecord?: SourceRecord; today: string },
  log: (m: string) => void,
): HeightsOut {
  const started = Date.now();
  const keys = heightKeys(model, elevation, rocks, span, today, p, isoline);
  const K = keys.length;
  const count = keys.reduce((n, k) => n + k.beds.length, 0);
  log(`heights ${count.toLocaleString('en-US')} beds of ${rocks.collections.length.toLocaleString('en-US')} collections at ${K} keyframes, placed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const today1 = todayAtNodes(today);
  const groupBy = (deg: number) => (node: number) => Math.floor(Math.floor(node / SRC_W) / deg) * 1000 + Math.floor((node % SRC_W) / deg);
  const tileOf = groupBy(p.tile_deg);
  const blockOf = groupBy(p.block_deg);
  const youngest = 0;

  // ---- The ranges: which nodes of each keyframe hold the ground of a range that stood then, and today's height of that ground
  // The ground is carried from where it lies today, on the plate it lies on today, as the beds are: a node's own plate
  // in the map of a time is not always the plate its ground lies on now, least of all where two have met.
  const sortedSnaps = [...elevation].sort((a, b) => a.ageMa - b.ageMa);
  const plateOf = plateFinder(sortedSnaps[0]);
  const rangeAt: (Map<number, { range: number; today: number }> | undefined)[] = keys.map(() => undefined);
  {
    const sums: Map<number, { range: number; sum: number; n: number }>[] = keys.map(() => new Map());
    ranges.forEach((r, ri) => {
      let south = 90;
      let north = -90;
      let west = 180;
      let east = -180;
      for (const poly of r.outline) {
        for (const [lon, lat] of poly[0] ?? []) {
          south = Math.min(south, lat);
          north = Math.max(north, lat);
          west = Math.min(west, lon);
          east = Math.max(east, lon);
        }
      }
      // A range's own ground, half a degree apart, so that every node it is carried to is reached.
      const turn = new Map<string, Quat | null>();
      for (let lat = Math.floor(south * 2) / 2; lat <= north; lat += 0.5) {
        for (let lon = Math.floor(west * 2) / 2; lon <= east; lon += 0.5) {
          if (!insideOutline(r.outline, lon, lat)) continue;
          const t = between(today1, GRID, lat, lon);
          if (!(t > 0)) continue;
          const plate = plateOf(lat, lon);
          if (!plate || !model.reaches(plate, 0)) continue;
          keys.forEach((key, k) => {
            if (key.ageMa > r.standingMa) return;
            let at: [number, number] = [lat, lon];
            if (key.ageMa !== 0) {
              const id = `${plate}:${k}`;
              let q = turn.get(id);
              if (q === undefined) turn.set(id, (q = model.reaches(plate, key.ageMa) ? mul(model.total(plate, key.ageMa), conj(model.total(plate, 0))) : null));
              if (!q) return;
              at = toLatLon(rotate(q, unitVector(lat, lon)));
            }
            const n = nodeOf(GRID, at[0], at[1]);
            const have = sums[k].get(n);
            if (!have) sums[k].set(n, { range: ri, sum: t, n: 1 });
            else if (have.range === ri) {
              have.sum += t;
              have.n++;
            }
          });
        }
      }
    });
    sums.forEach((at, k) => {
      if (at.size) rangeAt[k] = new Map([...at].sort((x, y) => x[0] - y[0]).map(([n, v]) => [n, { range: v.range, today: v.sum / v.n }]));
    });
  }
  const doubtOf = (t: number) => Math.max(p.range_doubt_m, p.range_doubt * t);

  // ---- The beds, as the fits read them
  for (const key of keys) key.beds.forEach((b, i) => (key.t1[i] = between(today1, GRID, b.lat0, b.lon0)));
  const rows: Row[] = [];
  const byKey: Row[][] = keys.map(() => []);
  const none = (): Sums => [0, 0, 0, 0, 0, 0];
  keys.forEach((key, k) => {
    key.beds.forEach((b, i) => {
      const at = rangeAt[k]?.get(b.node);
      const r: Row = {
        id: rows.length,
        k,
        i,
        node: b.node,
        sea: b.sea,
        w: b.w,
        shore: b.shore,
        m: key.m[i],
        t: key.t[i],
        t1: key.t1[i],
        d: key.d[b.node],
        ...(at ? { range: [at.today, doubtOf(at.today)] as [number, number] } : {}),
        cell: none(),
        tile: none(),
        block: none(),
        all: none(),
        plain: { cell: [0, 0], tile: [0, 0], block: [0, 0], all: [0, 0] },
      };
      rows.push(r);
      byKey[k].push(r);
    });
  });

  // ---- The level, from the beds laid down at the shore
  // A shore bed over the ocean's floor is of an island the map does not draw: it says nothing of the map's coast.
  const shoreRows: Row[][] = byKey.map((list, k) => list.filter((r) => r.shore > 0 && !keys[k].floor[r.node]));
  // The level is the map's height at a shore bed whose ground stands at today's sea, so a bed counts for less the
  // higher its ground stands today: far up, the map's height follows today's by less, and a line through every bed
  // alike reads the low ground too high. Today's ground is read at the map's own grain, so that a map that is today's
  // ground follows it by all of it; and the map's depth and today's are read alike, no deeper than the floor.
  const near = (r: Row) => Math.exp(-Math.max(0, r.t1) / p.near_m);
  const pointOf = (r: Row): ShorePoint => ({ m: Math.max(p.floor_m, r.m), t: Math.max(p.floor_m, Math.min(3000, r.t1)), w: r.shore * near(r) });
  const pooled = (k: number, pool: number, without?: number): Row[] => {
    const out: Row[] = [];
    for (let j = k - pool; j <= k + pool; j++) if (j >= 0 && j < K && j !== without) out.push(...shoreRows[j]);
    return out;
  };
  const weigh = (list: Row[]) => list.reduce((s, r) => s + r.shore * near(r), 0);
  // How far each map follows today's ground where that ground stands near today's sea, and how far above its coast it
  // has ground that stands at today's sea: read off the whole map, every node of today's Earth carried on its plate to
  // where it stood, and not off the beds. It is what the map is, whatever was found.
  const lowGround: { lat: number; lon: number; t: number; plate: number; w: number }[] = [];
  for (let n = 0; n < NODES; n++) {
    // Every other node each way: a quarter of them tell the same line.
    if (Math.floor(n / SRC_W) % 2 || (n % SRC_W) % 2) continue;
    const lat = 90 - Math.floor(n / SRC_W);
    const t = today1[n];
    if (lat < p.ice_south || t < p.floor_m || t > 7 * p.near_m) continue;
    const plate = sortedSnaps[0].plate[n];
    if (!plate || !model.reaches(plate, 0)) continue;
    lowGround.push({ lat, lon: -180 + (n % SRC_W), t, plate, w: Math.cos((lat * Math.PI) / 180) * Math.exp(-Math.max(0, t) / p.near_m) });
  }
  const mapLines = keys.map((key) => {
    const turn = new Map<number, Quat | null>();
    const points: ShorePoint[] = [];
    for (const g of lowGround) {
      let at: [number, number] = [g.lat, g.lon];
      if (key.ageMa !== 0) {
        let q = turn.get(g.plate);
        if (q === undefined) turn.set(g.plate, (q = model.reaches(g.plate, key.ageMa) ? mul(model.total(g.plate, key.ageMa), conj(model.total(g.plate, 0))) : null));
        if (!q) continue;
        at = toLatLon(rotate(q, unitVector(g.lat, g.lon)));
      }
      const n = nodeOf(GRID, at[0], at[1]);
      if (key.floor[n]) continue;
      points.push({ m: Math.max(p.floor_m, key.elev[n] - isoline), t: g.t, w: g.w });
    }
    return shoreLine(points);
  });
  const follows = mapLines.map((l) => l.follow);
  /** a keyframe's own level without one group of its beds, by tile or by block; the whole where no group is named */
  const ownLevel = (k: number, group?: (node: number) => number, out?: number): { level: number; scale: number; n: number } => {
    const list = group ? shoreRows[k].filter((r) => group(r.node) !== out) : shoreRows[k];
    return { ...levelGiven(list.map(pointOf), follows[k]), n: weigh(list) };
  };
  const seen: (LevelSeen | undefined)[] = [];
  const told: boolean[] = [];
  /** each told keyframe's level without each of its tiles, for the hold-outs and for how sure its own level is */
  const withoutTile: Map<number, number>[] = keys.map(() => new Map());
  const read: number[] = [];
  keys.forEach((_, k) => {
    const list = shoreRows[k];
    const n = weigh(list);
    read.push(n);
    const deep = list.reduce((s, r) => s + (r.m <= p.floor_m ? r.shore * near(r) : 0), 0);
    told.push(n >= p.shore_min && deep < n / 2);
    if (!told[k]) {
      seen.push(undefined);
      return;
    }
    const all = ownLevel(k);
    const tiles = [...new Set(list.map((r) => tileOf(r.node)))];
    let sum = 0;
    for (const g of tiles) {
      const l = ownLevel(k, tileOf, g).level;
      withoutTile[k].set(g, l);
      sum += l;
    }
    // How sure: by leaving each tile's beds out in turn, and never surer than beds that each told of the level on their own would be.
    const mean = sum / tiles.length;
    let jack = 0;
    for (const l of withoutTile[k].values()) jack += (l - mean) * (l - mean);
    jack = tiles.length > 1 ? Math.sqrt(((tiles.length - 1) / tiles.length) * jack) : all.scale;
    // Nor surer than the map's own steps allow: its heights come a step apart, and a level read off them lies anywhere in one.
    seen.push({ value: all.level, sd: Math.max(jack, (1.2533 * all.scale) / Math.sqrt(Math.max(1, n)), -p.floor_m / Math.sqrt(12)) });
  });
  // The walk that best tells each keyframe's own level from the others'.
  const tried: HeightsIndex['tried'] = [];
  let walk = { hold: p.hold[0], stray: p.stray_m[0], lpd: -Infinity };
  for (const hold of p.hold) {
    for (const stray of p.stray_m) {
      const without = levelsWithout(seen, hold, stray);
      let sum = 0;
      let n = 0;
      seen.forEach((s, k) => {
        if (!s) return;
        const v = without[k].sd * without[k].sd + s.sd * s.sd;
        sum += -0.5 * Math.log(2 * Math.PI * v) - ((s.value - without[k].mean) * (s.value - without[k].mean)) / (2 * v);
        n++;
      });
      const lpd = n ? sum / n : 0;
      tried.push({ hold, stray_m: stray, lpd: round(lpd, 4) });
      if (lpd > walk.lpd) walk = { hold, stray, lpd };
    }
  }
  const levels = smoothLevels(seen, walk.hold, walk.stray);
  const levelsOut = levelsWithout(seen, walk.hold, walk.stray);
  keys.forEach((key, k) => {
    key.level = levels[k].mean;
    key.levelSd = levels[k].sd;
    key.follow = follows[k];
  });
  // Where the shore beds found stand today, on the survey's own grid: the middle one of a keyframe's and of those
  // either side. The old shore on ground that has not moved since stands somewhere at or below that, if ground has
  // gone up as often as down; the level is higher by the map's following times as much as it stands above today's
  // sea, which the beds cannot tell. The youngest keyframe's are its own beds alone.
  const stands = keys.map((_, k) => {
    const list = pooled(k, k === youngest ? 0 : p.pool);
    return list.length ? middle(list.map((r) => Math.max(0, r.t)), list.map((r) => r.shore)) : 0;
  });
  const toldCount = told.filter(Boolean).length;
  log(`heights the level is told by their own shore beds at ${toldCount} of ${K} keyframes; it keeps ${walk.hold} of itself from one keyframe to the next and strays ${walk.stray} m from the map's coast; in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // ---- How far the map misses: each spread is as wide as holds nine misses in ten (core/heights.ts, spreadOf)
  // At the present, against today's surveyed ground: metres on low ground, a share of the height on high ground.
  const now = keys[youngest];
  const lowMiss: number[] = [];
  const highMiss: number[] = [];
  const deepMiss: number[] = [];
  for (let n = 0; n < NODES; n++) {
    const lat = 90 - Math.floor(n / SRC_W);
    if (lat < p.ice_south) continue;
    const t = today1[n];
    const diff = now.elev[n] - isoline - t;
    if (t >= p.low_m) highMiss.push(diff / t);
    else if (t > -p.low_m) lowMiss.push(diff);
    else deepMiss.push(diff / t);
  }
  const ones = (xs: number[]) => xs.map(() => 1);
  const nowM = spreadOf(lowMiss, ones(lowMiss));
  const nowHigh = spreadOf(highMiss, ones(highMiss));
  const nowDeep = spreadOf(deepMiss, ones(deepMiss));
  // A bed against its own node, at the present: how far the map, read at a bed's place, is from today's height of the bed's own ground.
  const ownBeds = byKey[youngest].filter((r) => !now.floor[r.node]);
  const bedM = ownBeds.length ? spreadOf(ownBeds.map((r) => r.m - r.t), ownBeds.map((r) => r.w)) : nowM;
  // At each keyframe, at the shore beds: how far the map has them from the level, the keyframe's own and its neighbours'.
  const shoreSpread = keys.map((_, k) => {
    const list = pooled(k, k === youngest ? 0 : p.pool);
    return list.length ? spreadOf(list.map((r) => r.m - keys[r.k].level), list.map((r) => r.shore)) : 0;
  });
  // On high ground, at the ranges: the share of today's height by which the map, less the level, misses a range that stood.
  const rangeMiss: { range: number; rel: number; w: number }[] = [];
  keys.forEach((key, k) => {
    if (k === youngest || !rangeAt[k]) return;
    const per = new Map<number, number>();
    for (const at of rangeAt[k]!.values()) per.set(at.range, (per.get(at.range) ?? 0) + 1);
    for (const [n, at] of rangeAt[k]!) rangeMiss.push({ range: at.range, rel: (key.elev[n] - isoline - key.level - at.today) / at.today, w: 1 / per.get(at.range)! });
  });
  const rangesHighOf = (without?: number): number => {
    const list = rangeMiss.filter((x) => x.range !== without);
    return list.length ? spreadOf(list.map((x) => x.rel), list.map((x) => x.w)) : nowHigh;
  };
  const rangesHigh = rangesHighOf();
  const missOfKey = (k: number, high = rangesHigh): Miss => ({
    base: Math.sqrt(nowM * nowM + Math.max(0, shoreSpread[k] * shoreSpread[k] - shoreSpread[youngest] * shoreSpread[youngest])),
    high: k === youngest ? nowHigh : Math.max(nowHigh, high),
    deep: nowDeep,
  });
  keys.forEach((key, k) => (key.miss = missOfKey(k)));
  log(`heights the map misses today's ground by ${whole(nowM)} m on low ground and ${Math.round(nowHigh * 100)}% of the height above ${p.low_m} m and ${Math.round(nowDeep * 100)}% of the depth below as much, as bells that hold nine misses in ten; a bed of the present misses its own node by ${whole(bedM)} m; the ranges that stood are missed by ${Math.round(rangesHigh * 100)}% of their height`);

  // ---- What was found near each node, and near each bed's node without its own group's beds
  keys.forEach((key, k) => {
    const own = [
      { group: (n: number) => n, into: nothingNear(GRID) },
      { group: tileOf, into: nothingNear(GRID) },
      { group: blockOf, into: nothingNear(GRID) },
    ];
    const above = new Float32Array(NODES);
    for (let n = 0; n < NODES; n++) above[n] = key.elev[n] - isoline;
    addBeds(key.near, key.beds, (_, i) => key.m[i], GRID, p.kernel_km, own, key.floor, { node: above, bed: key.m, m: p.like_m, kinds_m: p.like_kinds_m });
    const plain = nothingNear(GRID);
    const plainOwn = [
      { group: (n: number) => n, into: nothingNear(GRID) },
      { group: tileOf, into: nothingNear(GRID) },
      { group: blockOf, into: nothingNear(GRID) },
    ];
    addBeds(plain, key.beds, () => 0, GRID, p.kernel_km, plainOwn);
    const less = (o: Near, n: number): Sums => [
      Math.max(0, key.near.marine[n] - o.marine[n]),
      Math.max(0, key.near.land[n] - o.land[n]),
      Math.max(0, key.near.shore[n] - o.shore[n]),
      key.near.miss[n] - o.miss[n],
      Math.max(0, key.near.marineLike[n] - o.marineLike[n]),
      Math.max(0, key.near.landLike[n] - o.landLike[n]),
    ];
    const lessPlain = (o: Near, n: number): [number, number] => [Math.max(0, plain.marine[n] - o.marine[n]), Math.max(0, plain.land[n] - o.land[n])];
    for (const r of byKey[k]) {
      const n = r.node;
      r.cell = less(own[0].into, n);
      r.tile = less(own[1].into, n);
      r.block = less(own[2].into, n);
      r.all = [key.near.marine[n], key.near.land[n], key.near.shore[n], key.near.miss[n], key.near.marineLike[n], key.near.landLike[n]];
      r.plain = { cell: lessPlain(plainOwn[0].into, n), tile: lessPlain(plainOwn[1].into, n), block: lessPlain(plainOwn[2].into, n), all: [plain.marine[n], plain.land[n]] };
    }
  });
  log(`heights counted what lies near each node in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // ---- The height at a bed's place, with some of the beds near held out
  /** the bell at a bed's place: the map's, less the level, with the shore beds near and a range's record */
  const bellAtBed = (r: Row, held: Held, level = keys[r.k].level, levelSd = keys[r.k].levelSd, miss = keys[r.k].miss): Height => {
    let h = mapHeight(r.m - level, miss, levelSd);
    if (held !== 'none') {
      const s = r[held];
      h = withShore(h, s[2], s[3] - level * s[2], (bedM * bedM) / (h.sd * h.sd));
    }
    if (r.range) h = withRange(h, r.range[0], r.range[1]);
    return h;
  };
  /** the chance each bed's ground lay below the level before the kinds found near are read, at each way of holding beds out: worked out once */
  const HELDS: Held[] = ['cell', 'tile', 'block', 'all', 'none'];
  const below = Object.fromEntries(HELDS.map((held) => [held, Float64Array.from(rows, (r) => chanceBefore(bellAtBed(r, held), p.cap))])) as Record<Held, Float64Array>;
  const distanceLogit = (d: number, slopeIn: number, slopeOff: number): number => Math.max(-p.cap, Math.min(p.cap, d < 0 ? slopeIn * d : d === Infinity ? p.cap : slopeOff * d));

  // ---- Telling the kinds of beds: yields and strengths, as the chance of sea fits them
  const toldYield = (without?: number): boolean[] =>
    keys.map((_, k) => {
      let land = 0;
      for (let j = k - p.yield_pool; j <= k + p.yield_pool; j++) if (j >= 0 && j < K && j !== without) for (const r of byKey[j]) if (!r.sea) land += r.w;
      return land >= p.yield_land_min;
    });
  const yieldTold = toldYield();
  const telling = rows.filter((r) => yieldTold[r.k]);
  const expected = (t: Teller, r: Row, held: Held, yieldLog = t.yields[r.k]): number => {
    const [marine, land] = held === 'none' ? [0, 0] : t.found(r, held);
    return marineAmong(t.before(r, held), marine, land, yieldLog, t.strength, t.least);
  };
  const likelihood = (t: Teller, list: Row[], held: Held[], yieldLog?: number): number => {
    let sum = 0;
    for (const r of list) {
      for (const h of held) {
        const q = Math.max(0.001, Math.min(0.999, expected(t, r, h, yieldLog)));
        sum += r.w * Math.log(r.sea ? q : 1 - q);
      }
    }
    return sum;
  };
  /** each keyframe's yield for a way of telling: what makes the map alone best tell its beds and its neighbours'; the nearest told keyframe's where the land left too few */
  const yieldsOf = (t: Teller, own: boolean, only?: number, without?: number): number[] => {
    const can = own ? toldYield(without) : keys.map(() => true);
    const near = (k: number): Row[] => {
      const out: Row[] = [];
      for (let j = k - p.yield_pool; j <= k + p.yield_pool; j++) if (j >= 0 && j < K && j !== without) out.push(...byKey[j]);
      return out;
    };
    const fitted = (k: number): number => {
      // The odds before any bed is read do not change with the yield: worked out once for the beds that share it.
      const list = near(k);
      const odds = new Float64Array(list.length);
      const counts = new Float64Array(list.length);
      list.forEach((r, i) => {
        const c = Math.max(0.001, Math.min(0.999, t.before(r, 'none')));
        odds[i] = logit(c);
        counts[i] = (t.doubt ? 4 * c * (1 - c) : 1) * r.w;
      });
      return highest(
        (y) => {
          let sum = 0;
          for (let i = 0; i < list.length; i++) {
            const q = Math.max(0.001, Math.min(0.999, expit(odds[i] + y)));
            sum += counts[i] * Math.log(list[i].sea ? q : 1 - q);
          }
          return sum - 0.5 * Math.log1p(Math.exp(y));
        },
        -3,
        9,
        20,
      );
    };
    const nearest = (k: number): number => {
      if (can[k]) return k;
      for (let far = 1; far < K; far++) {
        if (k - far >= 0 && can[k - far] && k - far !== without) return k - far;
        if (k + far < K && can[k + far] && k + far !== without) return k + far;
      }
      return k;
    };
    const memo = new Map<number, number>();
    const of = (k: number): number => {
      let y = memo.get(k);
      if (y === undefined) memo.set(k, (y = fitted(k)));
      return y;
    };
    return keys.map((_, k) => (only !== undefined && k !== only ? (t.yields[k] ?? 0) : of(nearest(k))));
  };
  const fitStrength = (t: Teller): void => {
    const s = highest((v) => likelihood({ ...t, strength: Math.exp(v) }, telling, ['cell', 'tile']), Math.log(0.02), Math.log(50), 22);
    t.strength = round(Math.exp(s));
  };
  /** the kinds found near, counted by distance alone: what the rival that reads the distance from the map's coast is given, as the chance of sea counts them */
  const withFloor = (r: Row, held: Held): [number, number] => (held === 'none' ? [0, 0] : [r[held][0], r[held][1]]);
  /** the kinds found near on ground of like height: what the heights read */
  const withLike = (r: Row, held: Held): [number, number] => (held === 'none' ? [0, 0] : [r[held][4], r[held][5]]);

  // The distance from the map's coast, as the chance of sea reads the map: two slopes, fitted with the yields.
  let slopeIn = p.slope_in;
  let slopeOff = p.slope_off;
  const distance: Teller = { before: (r) => expit(distanceLogit(r.d, slopeIn, slopeOff)), found: withFloor, yields: keys.map(() => 1.5), strength: p.strength };
  distance.yields = yieldsOf(distance, true);
  for (let turn = 0; turn < 4; turn++) {
    slopeIn = highest((v) => ((slopeIn = v), likelihood(distance, telling, ['none'])), 0.02, 2, 18);
    slopeOff = highest((v) => ((slopeOff = v), likelihood(distance, telling, ['none'])), 0.02, 2, 18);
    distance.yields = yieldsOf(distance, true);
  }
  slopeIn = round(slopeIn);
  slopeOff = round(slopeOff);
  distance.yields = yieldsOf(distance, true);
  fitStrength(distance);
  // Both together: the height's own odds counting for a share, and the distance from the coast moving them.
  let bothHeight = 0.5;
  let bothIn = 0.2;
  let bothOff = 0.1;
  const bothOf = (c: number, d: number): number => {
    const x = bothHeight * logit(Math.max(1e-6, Math.min(1 - 1e-6, c))) + (d === Infinity ? p.cap : d < 0 ? bothIn * d : bothOff * d);
    return expit(Math.max(-p.cap, Math.min(p.cap, x)));
  };
  const both: Teller = { before: (r, held) => bothOf(below[held][r.id], r.d), found: withLike, yields: keys.map(() => 1.5), strength: p.strength };
  both.yields = yieldsOf(both, true);
  for (let turn = 0; turn < 3; turn++) {
    bothHeight = highest((v) => ((bothHeight = v), likelihood(both, telling, ['none'])), 0, 1, 14);
    bothIn = highest((v) => ((bothIn = v), likelihood(both, telling, ['none'])), 0, 2, 14);
    bothOff = highest((v) => ((bothOff = v), likelihood(both, telling, ['none'])), 0, 2, 14);
    both.yields = yieldsOf(both, true);
  }
  bothHeight = round(bothHeight);
  bothIn = round(bothIn);
  bothOff = round(bothOff);
  both.yields = yieldsOf(both, true).map((y) => Math.round(y * 1000) / 1000);
  fitStrength(both);
  // The height above the level, with the shore beds near: what the heights' own sea is told by. Its yield is the one
  // fitted with both read together, which tells the kinds best: a yield is the record's, how many more beds the sea
  // leaves than the land, and not a teller's. Fitted where the height's own word is in doubt, on ground within its
  // spread of the level, it comes out half as great again to twice as great in the last 70 Myr, since most beds found
  // on such low ground are marine: that is the level and the yield tangled again, a higher sea and a greater yield
  // leaving the same record. With it the height tells for land places that were sea, where beds of both kinds are
  // found. The index keeps that one as `yield_own`.
  const height: Teller = { before: (r, held) => below[held][r.id], found: withLike, yields: both.yields, strength: p.strength, least: p.least_beds };
  const yieldOwn = yieldsOf({ ...height, doubt: true }, true);
  fitStrength(height);
  // The same with no level: the map's own coast.
  const belowNoLevel = Float64Array.from(rows, (r) => chanceBefore(mapHeight(r.m, keys[r.k].miss, 0), p.cap));
  const noLevel: Teller = { before: (r) => belowNoLevel[r.id], found: withLike, yields: both.yields, strength: height.strength, least: p.least_beds };
  // The smoother with no causes: the same beds, counted by distance alone, and an even chance everywhere before them.
  const smoother: Teller = { before: () => 0.5, found: (r, held) => (held === 'none' ? [0, 0] : r.plain[held]), yields: keys.map(() => 1.5), strength: p.strength };
  smoother.yields = yieldsOf(smoother, false);
  fitStrength(smoother);
  keys.forEach((key, k) => (key.yieldLog = height.yields[k]));
  log(`heights the kinds of beds fitted in ${((Date.now() - started) / 1000).toFixed(1)} s: the map's word counts for ${height.strength} of a bed beside those found near; by distance from its coast the odds of sea fall by ${slopeIn} a degree inland and rise by ${slopeOff} offshore`);

  // ---- The height at every node
  keys.forEach((key, k) => {
    for (let n = 0; n < NODES; n++) {
      let h = mapHeight(key.elev[n] - isoline - key.level, key.miss, key.levelSd);
      const counts = (bedM * bedM) / (h.sd * h.sd);
      let rests = 0;
      if (key.near.shore[n] > 0) {
        if (key.near.shore[n] >= counts) rests |= RESTS.shore;
        h = withShore(h, key.near.shore[n], key.near.miss[n] - key.level * key.near.shore[n], counts);
      }
      const at = rangeAt[k]?.get(n);
      if (at) {
        h = withRange(h, at.today, doubtOf(at.today));
        rests |= RESTS.range;
      }
      // The kinds of beds near are what the side rests on where they count for more than the map's word does.
      if (!at && key.near.marineLike[n] + key.near.landLike[n] >= Math.max(height.strength, p.least_beds / 2)) rests |= RESTS.kinds;
      key.mean[n] = h.mean;
      key.sd[n] = h.sd;
      // Which side of the level: the bell's own chance, then the kinds of beds near. Where a range's record speaks they
      // are not read: they are of the basins at its foot, and ground that stood as high as it does now was not under
      // the sea. The distance from the map's coast is not read here, though it tells the kinds of beds better: the
      // middle height of ground of which nothing is known would no longer be the map's.
      const before = chanceBefore(h, p.cap);
      key.chance[n] = at ? before : chanceFrom(marineAmong(before, key.near.marineLike[n], key.near.landLike[n], key.yieldLog, height.strength, p.least_beds), key.yieldLog);
      key.rests[n] = rests;
    }
  });

  // ---- How the kinds hold
  const guesses = (t: Teller, held: Held): Guess[] => telling.map((r) => ({ marine: expected(t, r, held), was: r.sea, w: r.w }));
  const spans = (t: Teller, own: boolean, before?: (r: Row, k: number) => number, yieldsBy: Teller = t): Guess[] => {
    const out: Guess[] = [];
    for (let k = Math.floor(p.span_every / 2); k < K; k += p.span_every) {
      if (!yieldTold[k]) continue;
      // The yield of a keyframe held out is fitted to the keyframes either side, by the teller the yields are fitted with.
      const y = yieldsOf(yieldsBy, own, k, k)[k];
      for (const r of byKey[k]) out.push({ marine: marineAmong(before ? before(r, k) : t.before(r, 'none'), 0, 0, y, t.strength), was: r.sea, w: r.w });
    }
    return out;
  };
  const heldOf = (t: Teller, own: boolean, before?: (r: Row, k: number) => number, yieldsBy: Teller = t): KindHeld => ({ node: scoreOf(guesses(t, 'cell')), tile: scoreOf(guesses(t, 'tile')), block: scoreOf(guesses(t, 'block')), span: scoreOf(spans(t, own, before, yieldsBy)) });
  // A keyframe held out whole has its level from the others' too.
  const heightOut = (r: Row, k: number) => chanceBefore(bellAtBed(r, 'none', levelsOut[k].mean, levelsOut[k].sd), p.cap);
  const kinds = {
    height: heldOf(height, true, heightOut, both),
    distance: heldOf(distance, true),
    both: heldOf(both, true, (r, k) => bothOf(heightOut(r, k), r.d)),
    smoother: heldOf(smoother, false),
  };
  const alone: HeightsIndex['scores']['alone'] = { height: scoreOf(guesses(height, 'none')), no_level: scoreOf(guesses(noLevel, 'none')), distance: scoreOf(guesses(distance, 'none')), both: scoreOf(guesses(both, 'none')) };

  // Which side of the level each kind of bed lies on.
  const chanceAt = (r: Row, held: Held): number => {
    if (r.range) return below[held][r.id];
    const [marine, land] = withLike(r, held);
    return chanceFrom(marineAmong(below[held][r.id], marine, land, height.yields[r.k], height.strength, p.least_beds), height.yields[r.k]);
  };
  const side = (below: (r: Row) => boolean, of: Row[] = rows): LevelSide => {
    const n = { marine: 0, in: 0, land: 0, on: 0 };
    for (const r of of) {
      if (r.sea) {
        n.marine += r.w;
        if (below(r)) n.in += r.w;
      } else {
        n.land += r.w;
        if (!below(r)) n.on += r.w;
      }
    }
    return { marine_below: pct(n.in, n.marine), land_above: pct(n.on, n.land) };
  };
  const sides: HeightsIndex['sides'] = {
    localities: { marine: whole(rows.reduce((s, r) => s + (r.sea ? r.w : 0), 0)), land: whole(rows.reduce((s, r) => s + (r.sea ? 0 : r.w), 0)) },
    map: side((r) => r.d >= 0),
    node: side((r) => chanceAt(r, 'cell') >= 0.5),
    tile: side((r) => chanceAt(r, 'tile') >= 0.5),
    block: side((r) => chanceAt(r, 'block') >= 0.5),
    all: side((r) => chanceAt(r, 'all') >= 0.5),
  };

  // ---- Where the map puts a shore bed held out
  // What the other shore beds near say with no level: the map's heights at them, averaged with one bed's weight of nothing.
  const shoreNear: { tile: Float64Array; block: Float64Array }[] = keys.map((key, k) => {
    const list = shoreRows[k];
    const out = { tile: new Float64Array(list.length), block: new Float64Array(list.length) };
    const reach = 3 * p.kernel_km;
    list.forEach((r, a) => {
      const ba = key.beds[r.i];
      const sums = { tile: [0, 0], block: [0, 0] };
      list.forEach((q, b) => {
        if (a === b) return;
        const bb = key.beds[q.i];
        if (Math.abs(ba.lat - bb.lat) * 111.2 > reach) return;
        const far = kmBetween(ba.lat, ba.lon, bb.lat, bb.lon);
        if (far > reach) return;
        const bell = q.shore * Math.exp(-0.5 * (far / p.kernel_km) * (far / p.kernel_km));
        const y = Math.max(p.floor_m, q.m);
        if (tileOf(q.node) !== tileOf(r.node)) {
          sums.tile[0] += bell;
          sums.tile[1] += bell * y;
        }
        if (blockOf(q.node) !== blockOf(r.node)) {
          sums.block[0] += bell;
          sums.block[1] += bell * y;
        }
      });
      out.tile[a] = sums.tile[1] / (1 + sums.tile[0]);
      out.block[a] = sums.block[1] / (1 + sums.block[0]);
    });
    return out;
  });
  const rivalAt = rival ? keys.map((key) => curveAt(rival.points, fromMa(key.ageMa))) : undefined;
  const shoreAll = ((): { level: ShoreHeld; map: ShoreHeld; smoother: ShoreHeld } => {
    type Way = 'level' | 'map' | 'smoother';
    type Out = 'tile' | 'block' | 'span';
    const lists = (): Record<Out, [number[], number[]]> => ({ tile: [[], []], block: [[], []], span: [[], []] });
    const acc: Record<Way, Record<Out, [number[], number[]]>> = { level: lists(), map: lists(), smoother: lists() };
    const put = (name: Way, held: Out, miss: number, w: number) => {
      acc[name][held][0].push(miss);
      acc[name][held][1].push(w);
    };
    keys.forEach((_, k) => {
      if (!told[k]) return;
      const list = shoreRows[k];
      const s = seen[k]!;
      // The level with one group of the keyframe's own beds left out, carried through the walk as the whole is.
      const levelWithout = (own: number): number => smoothLevels(seen.map((x, j) => (j === k ? { value: own, sd: s.sd } : x)), walk.hold, walk.stray)[k].mean;
      const byBlock = new Map<number, number>();
      for (const g of new Set(list.map((r) => blockOf(r.node)))) byBlock.set(g, levelWithout(ownLevel(k, blockOf, g).level));
      const byTile = new Map<number, number>();
      for (const [g, own] of withoutTile[k]) byTile.set(g, levelWithout(own));
      list.forEach((r, a) => {
        // A bed is told as the level reads it: its height on the map no deeper than the floor, and counted by how near today's sea its ground stands.
        const { m: y, t, w } = pointOf(r);
        put('level', 'tile', y - byTile.get(tileOf(r.node))! - follows[k] * t, w);
        put('level', 'block', y - byBlock.get(blockOf(r.node))! - follows[k] * t, w);
        put('level', 'span', y - levelsOut[k].mean - follows[k] * t, w);
        for (const held of ['tile', 'block', 'span'] as const) put('map', held, y, w);
        put('smoother', 'tile', y - shoreNear[k].tile[a], w);
        put('smoother', 'block', y - shoreNear[k].block[a], w);
        put('smoother', 'span', y, w);
      });
    });
    const of = (name: Way): ShoreHeld => ({ tile: missOf(...acc[name].tile), block: missOf(...acc[name].block), span: missOf(...acc[name].span) });
    return { level: of('level'), map: of('map'), smoother: of('smoother') };
  })();
  // Where the shore beds stand today, against where the other's curve has the old shore standing on ground that has
  // not moved: the share of a keyframe's beds that stand below the curve's level.
  const belowRival = (list: Row[], value: number): number => {
    const total = list.reduce((sum, r) => sum + r.shore, 0);
    return pct(list.reduce((sum, r) => sum + (Math.max(0, r.t) < value ? r.shore : 0), 0), total);
  };
  // Of the keyframes held out whole, how often their own level lies in the band told from the others.
  const band = { n: 0, inside: 0 };
  seen.forEach((s, k) => {
    if (!s) return;
    band.n++;
    if (Math.abs(s.value - levelsOut[k].mean) <= Z90 * Math.sqrt(levelsOut[k].sd * levelsOut[k].sd + s.sd * s.sd)) band.inside++;
  });
  // A shore bed held out: how far from the level the map has it, and the height.
  const shoreHeight = (held: 'cell' | 'tile' | 'block', of: Row[] = rows.filter((r) => r.shore > 0 && !keys[r.k].floor[r.node])): { n: number; map: number; height: number; inside: number } => {
    const mapMiss: number[] = [];
    const heightMiss: number[] = [];
    const w: number[] = [];
    let inside = 0;
    let total = 0;
    for (const r of of) {
      const h = bellAtBed(r, held);
      mapMiss.push(Math.abs(r.m));
      heightMiss.push(Math.abs(heightAt(h, chanceAt(r, held), 0.5)));
      w.push(r.shore);
      total += r.shore;
      if (Math.abs(h.mean) <= Z90 * Math.sqrt(h.sd * h.sd + bedM * bedM)) inside += r.shore;
    }
    return { n: whole(total), map: whole(middle(mapMiss, w)), height: whole(middle(heightMiss, w)), inside: pct(inside, total) };
  };
  const shoreHeightScores = { node: shoreHeight('cell'), tile: shoreHeight('tile'), block: shoreHeight('block') };

  // ---- The ranges
  const rangesHeld: RangeHeld[] = ranges.map((r, ri) => {
    const through: RangeHeld['through'] = [];
    const sum = { nodes: 0, today: 0, map: 0, mapAbs: 0, height: 0, heightAbs: 0, inside: 0, scored: 0 };
    const high = rangesHighOf(ri);
    keys.forEach((key, k) => {
      const at = rangeAt[k];
      if (!at) return;
      const here = { nodes: 0, today: 0, map: 0, height: 0 };
      for (const [n, x] of at) {
        if (x.range !== ri) continue;
        const above = key.elev[n] - isoline - key.level;
        const mid = heightAt({ mean: key.mean[n], sd: key.sd[n] }, key.chance[n], 0.5);
        here.nodes++;
        here.today += x.today;
        here.map += above;
        here.height += mid;
        sum.mapAbs += Math.abs(above - x.today);
        sum.heightAbs += Math.abs(mid - x.today);
        // With its own record left out: the map's bell, with the miss of high ground the other ranges give.
        if (k !== youngest) {
          const h = mapHeight(above, missOfKey(k, high), key.levelSd);
          sum.scored++;
          if (Math.abs(above - x.today) <= Z90 * h.sd) sum.inside++;
        }
      }
      if (!here.nodes) return;
      through.push({ ageMa: key.ageMa, nodes: here.nodes, today: whole(here.today / here.nodes), map: whole(here.map / here.nodes), height: whole(here.height / here.nodes) });
      sum.nodes += here.nodes;
      sum.today += here.today;
      sum.map += here.map;
      sum.height += here.height;
    });
    const n = Math.max(1, sum.nodes);
    return {
      id: r.id,
      label: r.label,
      standingMa: r.standingMa,
      keyframes: through.map((t) => t.ageMa),
      nodes: sum.nodes,
      today: whole(sum.today / n),
      map: { mean: whole((sum.map - sum.today) / n), abs: whole(sum.mapAbs / n) },
      height: { mean: whole((sum.height - sum.today) / n), abs: whole(sum.heightAbs / n) },
      without: { high: round(high), ...(sum.scored ? { inside: pct(sum.inside, sum.scored) } : {}) },
      through,
    };
  });

  // ---- Held to the present, and the globe
  const areaOf = (n: number) => Math.cos(((90 - Math.floor(n / SRC_W)) * Math.PI) / 180);
  const midOf = (key: HeightKey, n: number) => heightAt({ mean: key.mean[n], sd: key.sd[n] }, key.chance[n], 0.5);
  const present = (() => {
    const s = { area: 0, mapSea: 0, mapLand: 0, heightSea: 0, heightLand: 0, land: 0, mapMiss: 0, heightMiss: 0, nodes: 0, inside: 0 };
    for (let n = 0; n < NODES; n++) {
      const a = areaOf(n);
      s.area += a;
      if (90 - Math.floor(n / SRC_W) < p.ice_south) continue;
      const t = today1[n];
      const landNow = t >= 0;
      const mapSea = now.elev[n] < isoline;
      const heightSea = now.chance[n] >= 0.5;
      if (landNow && mapSea) s.mapSea += a;
      if (!landNow && !mapSea) s.mapLand += a;
      if (landNow && heightSea) s.heightSea += a;
      if (!landNow && !heightSea) s.heightLand += a;
      const h = { mean: now.mean[n], sd: now.sd[n] };
      s.nodes++;
      if (t >= heightAt(h, now.chance[n], HEIGHT_BAND[0]) && t <= heightAt(h, now.chance[n], HEIGHT_BAND[1])) s.inside++;
      if (landNow) {
        s.land++;
        s.mapMiss += Math.abs(now.elev[n] - isoline - now.level - t);
        s.heightMiss += Math.abs(midOf(now, n) - t);
      }
    }
    const own = seen[youngest];
    return {
      ageMa: now.ageMa,
      level: whole(own ? own.value : now.level),
      lo: whole(own ? own.value - Z90 * own.sd : now.level - Z90 * now.levelSd),
      hi: whole(own ? own.value + Z90 * own.sd : now.level + Z90 * now.levelSd),
      map: { to_sea: pct(s.mapSea, s.area), to_land: pct(s.mapLand, s.area) },
      height: { to_sea: pct(s.heightSea, s.area), to_land: pct(s.heightLand, s.area) },
      miss: { map: whole(s.mapMiss / Math.max(1, s.land)), height: whole(s.heightMiss / Math.max(1, s.land)) },
      inside: pct(s.inside, s.nodes),
    };
  })();
  const g = { area: 0, reached: 0, changed: 0, to_sea: 0 };
  const moved = keys.map((key) => {
    const k = { area: 0, to_sea: 0, to_land: 0, land: 0 };
    for (let n = 0; n < NODES; n++) {
      const a = areaOf(n);
      const mapSea = key.elev[n] < isoline;
      const sea = key.chance[n] >= 0.5;
      k.area += a;
      if (!mapSea) k.land += a;
      if (key.rests[n]) g.reached += a;
      if (sea !== mapSea) {
        if (sea) k.to_sea += a;
        else k.to_land += a;
      }
    }
    g.area += k.area;
    g.changed += k.to_sea + k.to_land;
    g.to_sea += k.to_sea;
    return { to_sea: pct(k.to_sea, k.area), to_land: pct(k.to_land, k.area), land: pct(k.land, k.area) };
  });

  // ---- Stretches of time, as the chance of sea sets them out
  const stretchOf = keys.map((key, k) => (yieldTold[k] ? Math.floor(key.ageMa / 100) : -1));
  const stretches = [...new Set(stretchOf)].sort((a, b) => (a < 0 ? Infinity : a) - (b < 0 ? Infinity : b));
  const through: HeightStretch[] = stretches.map((s) => {
    const ks = keys.map((_, k) => k).filter((k) => stretchOf[k] === s);
    const own = rows.filter((r) => stretchOf[r.k] === s);
    const shore = own.filter((r) => r.shore > 0 && !keys[r.k].floor[r.node]);
    const sh = shoreHeight('cell', shore);
    const lv = ks.map((k) => keys[k].level);
    return {
      olderMa: Math.max(...ks.map((k) => keys[k].ageMa)),
      youngerMa: Math.min(...ks.map((k) => keys[k].ageMa)),
      keyframes: ks.length,
      told: s >= 0,
      level: { mean: whole(lv.reduce((a, b) => a + b, 0) / lv.length), lo: whole(Math.min(...lv)), hi: whole(Math.max(...lv)), told: ks.filter((k) => told[k]).length },
      localities: { marine: whole(own.reduce((a, r) => a + (r.sea ? r.w : 0), 0)), land: whole(own.reduce((a, r) => a + (r.sea ? 0 : r.w), 0)) },
      map: side((r) => r.d >= 0, own),
      node: side((r) => chanceAt(r, 'cell') >= 0.5, own),
      shore: { n: sh.n, map: sh.map, height: sh.height, stands: whole(middle(shore.map((r) => Math.max(0, r.t)), shore.map((r) => r.shore))), ...(rivalAt ? { rival: whole(ks.reduce((a, k) => a + rivalAt[k], 0) / ks.length), below: pct(shore.reduce((a, r) => a + (Math.max(0, r.t) < rivalAt[r.k] ? r.shore : 0), 0), shore.reduce((a, r) => a + r.shore, 0)) } : {}) },
    };
  });

  // ---- The files
  const files = new Map<string, Uint8Array | string>();
  const grid = { lon0: -180, lat0: 90, step: 1, nx: SRC_W, ny: SRC_H, wrap: true };
  const keyframes: HeightKeyframe[] = keys.map((key, k) => {
    const map = new Int16Array(NODES);
    const mean = new Int16Array(NODES);
    const sd = new Uint8Array(NODES);
    const chance = new Uint8Array(NODES);
    for (let n = 0; n < NODES; n++) {
      map[n] = heightShort(key.elev[n] - isoline);
      mean[n] = heightShort(key.mean[n]);
      sd[n] = sdByte(key.sd[n]);
      chance[n] = chanceByte(key.chance[n]);
    }
    const file = `heights/${key.ageMa}.lwt`;
    files.set(file, encodeTile({ format: 'lightworld-heights-key@1', ageMa: key.ageMa, grid, map: 0, mean: 1, sd: 2, chance: 3, rests: 4 }, [map, mean, sd, chance, key.rests], stableStringify));
    const s = seen[k];
    return {
      ageMa: key.ageMa,
      olderMa: key.olderMa,
      youngerMa: key.youngerMa,
      file,
      level: whole(key.level),
      lo: whole(key.level - Z90 * key.levelSd),
      hi: whole(key.level + Z90 * key.levelSd),
      stands: whole(stands[k]),
      with_stands: whole(key.level + key.follow * stands[k]),
      raised: whole(mapLines[k].level),
      told: told[k],
      ...(s ? { own: { level: whole(s.value), sd: whole(s.sd) } } : {}),
      follow: key.follow,
      shore: Math.round(weigh(byKey[k].filter((r) => r.shore > 0)) * 10) / 10,
      read: Math.round(read[k] * 10) / 10,
      miss: { base: whole(key.miss.base), high: round(key.miss.high), deep: round(key.miss.deep) },
      yield: round(Math.exp(key.yieldLog)),
      yield_own: round(Math.exp(yieldOwn[k])),
      yield_told: yieldTold[k],
      ...moved[k],
    };
  });
  const ages = keys.map((k) => k.ageMa);
  const series: SeriesRecord = {
    id: about.level.field,
    title: about.level.title,
    quantity: about.level.quantity,
    unit: 'm',
    description: about.level.description,
    basis: 'reconstruction',
    interpolation: 'linear',
    band: 'nine chances in ten',
    spread: 'band',
    points: [...keyframes].sort((a, b) => b.ageMa - a.ageMa).map((k) => [Math.round(fromMa(k.ageMa)), k.level, k.lo, k.hi]),
    source: { ref: about.source },
    sourceRecord: about.sourceRecord,
    rule: { name: 'shore-level', params: { floor_m: p.floor_m, near_m: p.near_m, shore_min: p.shore_min, pool: p.pool } },
  };
  const index: HeightsIndex = {
    format: 'lightworld-heights@1',
    field: about.field,
    title: about.title,
    description: about.description,
    level: { field: about.level.field, title: about.level.title, series },
    elevation: about.elevation,
    source: about.source,
    sourceRecord: about.sourceRecord,
    today: about.today,
    grid,
    coverage: [fromMa(Math.max(...ages)), fromMa(Math.min(...ages))],
    rule: {
      coast_m: isoline,
      floor_m: p.floor_m,
      near_m: p.near_m,
      deep_m: p.deep_m,
      box_deg: p.box_deg,
      kernel_km: p.kernel_km,
      hold: walk.hold,
      stray_m: walk.stray,
      like_m: p.like_m,
      like_kinds_m: p.like_kinds_m,
      least_beds: p.least_beds,
      now_m: whole(nowM),
      now_high: round(nowHigh),
      now_deep: round(nowDeep),
      bed_m: whole(bedM),
      ranges_high: round(rangesHigh),
      range_doubt: p.range_doubt,
      range_doubt_m: p.range_doubt_m,
      strength: height.strength,
      slope_in: slopeIn,
      slope_off: slopeOff,
      cap: p.cap,
      both: { height: bothHeight, slope_in: bothIn, slope_off: bothOff },
      yield_land_min: p.yield_land_min,
      shore_min: p.shore_min,
    },
    tried,
    keyframes,
    scores: { kinds, alone, shore: shoreAll, level_band: { n: band.n, inside: pct(band.inside, band.n) }, shore_height: shoreHeightScores },
    ...(rival && rivalAt ? { rival: { field: rival.field, title: rival.title, at: keys.map((key, k) => ({ ageMa: key.ageMa, value: whole(rivalAt[k]), level: whole(key.level + key.follow * rivalAt[k]), below: belowRival(pooled(k, k === youngest ? 0 : p.pool), rivalAt[k]) })) } } : {}),
    sides,
    ranges: rangesHeld,
    present,
    globe: { reached: pct(g.reached, g.area), changed: pct(g.changed, g.area), to_sea: pct(g.to_sea, g.changed) },
    through,
  };
  files.set('heights/index.json', stableStringify(index));
  const sk = index.scores.kinds;
  log(`heights a locality held out with its node is given ${sk.height.node.lpd} (log of its chance, on average), with its tile ${sk.height.tile.lpd}, with its block ${sk.height.block.lpd}, with its keyframe ${sk.height.span.lpd}; by distance from the map's coast ${sk.distance.node.lpd}, ${sk.distance.tile.lpd}, ${sk.distance.block.lpd}, ${sk.distance.span.lpd}; by both ${sk.both.node.lpd}, ${sk.both.tile.lpd}, ${sk.both.block.lpd}, ${sk.both.span.lpd}; the smoother with no causes ${sk.smoother.node.lpd}, ${sk.smoother.tile.lpd}, ${sk.smoother.block.lpd}, ${sk.smoother.span.lpd}`);
  const ss = index.scores.shore;
  log(`heights a shore bed held out with its tile is put ${ss.level.tile.mean} m from where the map has it by the level, ${ss.map.tile.mean} m by the map's own coast, ${ss.smoother.tile.mean} m by the shore beds near; with its block ${ss.level.block.mean}, ${ss.map.block.mean}, ${ss.smoother.block.mean}; with its keyframe ${ss.level.span.mean}, ${ss.map.span.mean}, ${ss.smoother.span.mean}`);
  log(`heights ${Math.round(sides.map.marine_below * 100)}% of marine localities lie below the map's coast and ${Math.round(sides.map.land_above * 100)}% of land ones above it; with their own node held out, ${Math.round(sides.node.marine_below * 100)}% and ${Math.round(sides.node.land_above * 100)}% lie on their side of the level; built in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return { index, files, keys };
}
