// The climate of the deep past with its spread, at every node of the climate field at each of its keyframes
// (climate-chance/index.json, climate-chance/<age>.lwt; core/climatechance.ts; model:earth/climate-conditioned). The
// build reads how the runs' pattern answers to the Earth's mean warmth across the runs themselves, and how far the run
// of the present lies from the climate measured; makes the Earth's mean warmth at each keyframe from the energy balance
// on the CO₂'s members and the rocks' curve; places the rock record's beds that say something of climate where their
// plates stood, fits how each kind's share follows the climate, and conditions each node on the beds near it. Then it
// scores what it made: on beds whose node, tile and block were held out, and whole keyframes, beside a smoother that
// knows only latitude and time; against the columns of rock and the fossil forests, which it does not read; and at the
// present, where the climate is measured.
import { climateClass, encodeNode, LAND_BIT, type ClimateNode, type ClimateRule } from '../../../../core/climate.ts';
import { above, band, chanceByte, classChances, CLASSES, errorFrom, expit, findsByte, logit, monthSd, moved, nodeOf, nudged, PAIRS, restsOnBeds, scoreOf, shareNear, shareOver, together, toldOf, TREES, warmingAt, warmSdByte, wetSdByte, wettingAt, type Central, type ChanceGrid, type ChanceIndex, type ChanceKeyframe, type ChanceRule, type ChanceStretch, type ColumnsCheck, type ForestCheck, type Guess, type HeldScores, type Link, type Pair, type PairScores, type PresentCheck, type Response, type RunError, type Spreads, type Warmth } from '../../../../core/climatechance.ts';
import { encodeTile } from '../../../../core/container.ts';
import { EnergyBalance, type EnergyBalanceParams } from '../../../../core/ebm.ts';
import { kmBetween } from '../../../../core/landscape.ts';
import { conj, rotate, toLatLon, unitVector, type Quat } from '../../../../core/quat.ts';
import type { SeriesRecord, SourceRecord } from '../../../../core/records.ts';
import type { RotationModel } from '../../../../core/rotation-model.ts';
import { sample, type Uncertain } from '../../../../core/samples.ts';
import type { StrataColumn } from '../../../../core/strata.ts';
import { fromMa } from '../../../../core/time.ts';
import { datasetFile } from '../manifest.ts';
import { openNetcdf } from '../netcdf.ts';
import type { RocksSnapshot } from '../pbdb.ts';
import { stableStringify } from '../util.ts';
import type { Field, World } from '../world.ts';
import { rowShare } from './atlas.ts';
import type { Snapshot } from './fields.ts';

/** The parameters of field:earth/climate-chance and of field:earth/climate-beds, together. */
export interface ChanceParams {
  /** how many members the Earth's mean warmth is run for */
  members: number;
  /** the total pressure, bar, at which the CO₂ series' mixing ratios are read as partial pressures, as the energy balance's own field reads them */
  atmosphere_bar: number;
  /** how wide a belt of latitude the runs' answer to the mean warmth is read in, degrees */
  belt_deg: number;
  /** how many standard deviations the half-width of the curve's band is read as */
  curve_band_sd: number;
  /** how long a stretch of the curve is held out to score the energy balance, Myr */
  era_myr: number;
  /** the least the energy balance's own error is taken to be, °C */
  balance_sd_min: number;
  /** the chance that a fossil forest stood where the climate was not one that bears trees: along a river in dry country, say */
  forest_slip: number;
  /** the box of ground one bed is, in degrees */
  box_deg: number;
  /** which of the database's lithologies, adjectives, environments and classes of environment are read as which bed */
  wet_lithologies: string[];
  wet_environments: string[];
  dry_lithologies: string[];
  dry_adjectives: string[];
  dry_environments: string[];
  reef_class: string;
  sea_class: string;
  ice_class: string;
  land_class: string;
  /** where each pair's quantity is counted from: the log of the aridity, and degrees of the year's mean */
  wet_at: number;
  reef_at: number;
  ice_at: number;
  /** where the fit of each link's slope starts, and of how much a place's own share varies */
  wet_slope: number;
  reef_slope: number;
  ice_slope: number;
  own: number;
  /** how many keyframes either side share one level with a keyframe */
  pool: number;
  /** how many beds of the rarer kind, by weight, a keyframe and those it shares a level with must have for the pair to be read there */
  level_min: number;
  /** the width of the bell in latitude the smoother with no causes reads the beds by, degrees */
  smoother_deg: number;
  /** the sizes of the tiles and of the blocks held out, in degrees, and every how many keyframes one is held out whole */
  tile_deg: number;
  block_deg: number;
  span_every: number;
  /** the distances the run's errors at the present are compared over, km: the bell's width is fitted to how they go together within them */
  reach_km: number[];
}

/** The parameters of the rock record a collection's share of a span is worked out by (field:earth/rock-record). */
export interface SpanRule {
  longest_span: number;
  longest_span_in_stages: number;
}

/** A run of the climate field, as the stage reads it. */
export interface ChanceRun {
  ageMa: number;
  /** the warmest and coldest month, the aridity and the margin at each node, spread over the sea; NaN where the run has no land near */
  nodes: Float32Array;
  /** each node's plate, by its number in the frames' plate index, with LAND_BIT where the run has land */
  plate: Uint16Array;
  /** the mean of the year at the surface of each node, land or sea alike, °C */
  warm: Float32Array;
  /** the run's own global mean, °C */
  global: number;
}

/** The series the Earth's mean warmth is made of: the Sun's brightness, the CO₂ with its band, and the rocks' curve with its own. */
export interface ChanceSeries {
  sun: SeriesRecord['points'];
  co2: SeriesRecord['points'];
  curve: SeriesRecord['points'];
}

/** The climate measured at the present, at a place: undefined where it has no land. */
export type Measured = (lat: number, lon: number) => ClimateNode | undefined;

/** The columns of rock, for holding the climate to what it does not read: where each stands today, and its units. */
export interface ChanceColumns {
  points: [lat: number, lon: number][];
  columns: Pick<StrataColumn, 'units'>[];
}

/** A fossil forest, where it stood at the keyframe nearest its time. */
export interface ForestAt {
  id: string;
  ageMa: number;
  keyframeMa: number;
  lat: number;
  lon: number;
}

/** A bed, as the fit reads it: a kind found in a small box of ground in a keyframe's span. */
interface Bed {
  lat: number;
  lon: number;
  node: number;
  more: boolean;
  w: number;
}

/** What was found near each node, of a pair's two kinds, each counted by how near it lies. */
interface Found {
  more: Float32Array;
  less: Float32Array;
}

/** A bed with what the fit needs of its place. */
interface Row {
  k: number;
  node: number;
  /** its latitude's belt of the smoother: the node's row folded about the equator */
  bin: number;
  more: boolean;
  w: number;
  /** the pair's quantity at its node, as the members have it before any bed */
  x: number;
  /** what was found near its node without the beds of its own node, tile and block, and with them all */
  cell: [number, number];
  tile: [number, number];
  block: [number, number];
  all: [number, number];
}

type Held = 'cell' | 'tile' | 'block';

/** A keyframe as the build keeps it. */
export interface ChanceKey {
  ageMa: number;
  olderMa: number;
  youngerMa: number;
  warmth: Warmth;
  members: number[];
  /** the central climate at each node, four numbers as the run's are, and its spreads: of what moves both months, and of the log of the aridity */
  central: Float32Array;
  warmSd: Float32Array;
  wetSd: Float32Array;
  /** the chance of each class at each node, eight numbers */
  chances: Float32Array;
  found: Record<Pair, Found>;
  /** how much of the spread's square the beds took away at each node: of the warmth, and of the aridity */
  toldWarm: Float32Array;
  toldWet: Float32Array;
}

export interface ChanceOut {
  index: ChanceIndex;
  files: Map<string, Uint8Array | string>;
  keys: ChanceKey[];
}

const round = (x: number, digits = 3) => Number(x.toPrecision(digits));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0);

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

/**
 * The runs' surface at every node of a grid, land or sea alike, and each run's global mean: the mean of the year of the
 * file's surface temperature, each cell weighing by its area as the file's own weights have it. Read apart from the
 * climate field's nodes, which keep the land only.
 */
export async function surfaceOfRuns(world: World, f: Field, grid: ChanceGrid): Promise<Map<number, { warm: Float32Array; global: number }>> {
  const d = world.manifest.datasets[f.data!.from];
  const nc = await openNetcdf(datasetFile(d.id, d));
  const lat = await nc.read('lat');
  const lon = await nc.read('lon');
  const gw = await nc.read('gw');
  const runs = nc.variables.get('T')!.dims[0].size;
  const stepMyr = Number(/^(\d+)/.exec(f.time!.step!)![1]);
  const n = grid.nx * grid.ny;
  const out = new Map<number, { warm: Float32Array; global: number }>();
  for (let run = 0; run < runs; run++) {
    const t = await nc.read('T', run, 1);
    const nlat = lat.length;
    const nlon = lon.length;
    const sum = new Float64Array(n);
    const count = new Float64Array(n);
    let all = 0;
    let weight = 0;
    for (let j = 0; j < nlat; j++) {
      const row = Math.round((90 - lat[j]) / grid.step);
      for (let i = 0; i < nlon; i++) {
        let mean = 0;
        for (let m = 0; m < 12; m++) mean += t[(m * nlat + j) * nlon + i] / 12;
        all += gw[j] * mean;
        weight += gw[j];
        if (row < 0 || row >= grid.ny) continue;
        const lo = ((lon[i] + 180) % 360) - 180;
        const k = row * grid.nx + ((Math.round((lo + 180) / grid.step) % grid.nx) + grid.nx) % grid.nx;
        sum[k] += mean;
        count[k]++;
      }
    }
    const warm = new Float32Array(n).fill(NaN);
    for (let k = 0; k < n; k++) if (count[k]) warm[k] = sum[k] / count[k];
    out.set((runs - 1 - run) * stepMyr, { warm, global: all / weight });
  }
  await nc.close();
  return out;
}

/** A series' value at time t, linear between its points, with its band; null outside them. */
function seriesWith(points: SeriesRecord['points'], t: number): [number, number | null, number | null] | null {
  if (!points.length || t < points[0][0] || t > points.at(-1)![0]) return null;
  let i = 0;
  while (i < points.length - 2 && points[i + 1][0] < t) i++;
  const [a, b] = [points[i], points[i + 1] ?? points[i]];
  const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
  const mix = (x: number | null, y: number | null) => (x === null || y === null ? null : x + (y - x) * f);
  return [a[1] + (b[1] - a[1]) * f, mix(a[2], b[2]), mix(a[3], b[3])];
}

/** The plate under a place of today's Earth, by the plates of today's land: searching out a few degrees for one, as the rock record's sites are placed. */
function plateFinder(now: Snapshot): (lat: number, lon: number) => number {
  return (lat, lon) => {
    const j0 = Math.round(90 - lat);
    const i0 = Math.round(lon + 180);
    for (let r = 0; r <= 3; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(dj), Math.abs(di)) !== r) continue;
          const q = now.plate[Math.max(0, Math.min(180, j0 + dj)) * 360 + ((((i0 + di) % 360) + 360) % 360)];
          if (q) return q;
        }
      }
    }
    return 0;
  };
}

/** Where a place of today stood at an age, by the plate under it today; undefined where no plate carries it there. */
export function carrier(model: RotationModel, now: Snapshot): (lat: number, lon: number, ageMa: number) => [number, number] | undefined {
  const plateOf = plateFinder(now);
  return (lat, lon, ageMa) => {
    const plate = plateOf(lat, lon);
    if (!plate || !model.reaches(plate, 0) || !model.reaches(plate, ageMa)) return undefined;
    return toLatLon(rotate(model.total(plate, ageMa), rotate(conj(model.total(plate, 0)), unitVector(lat, lon))));
  };
}

/** The span of each keyframe: half way to the keyframe either side, and the youngest from the present. */
function spansOf(ages: number[]): { older: number; younger: number }[] {
  return ages.map((a, k) => ({
    older: k < ages.length - 1 ? (a + ages[k + 1]) / 2 : a + (a - ages[k - 1]) / 2,
    younger: k > 0 ? (a + ages[k - 1]) / 2 : Math.min(0, a),
  }));
}

/**
 * The beds of each keyframe's span, pair by pair, before anything is fitted. A collection is of each span its own
 * overlaps, by the share of it that lies inside, as the rock record counts a collection of a stage; it stands where its
 * plate stood at the keyframe. Collections of one kind in one box are one bed, at the box's middle, however many they
 * are: a quarry worked a hundred times says no more of the climate than one worked once. Its weight is the chance that
 * one of them at least is of the span.
 */
export function bedsOf(model: RotationModel, ages: number[], now: Snapshot, rocks: RocksSnapshot, span: SpanRule, p: ChanceParams, grid: ChanceGrid): Record<Pair, Bed[]>[] {
  const plateOf = plateFinder(now);
  const edges = spansOf(ages);
  const w = (i: number) => rocks.words[i] ?? '';
  const bit = (name: string) => {
    const k = rocks.classes.indexOf(name);
    return k < 0 ? 0 : 1 << k;
  };
  const REEF = bit(p.reef_class);
  const SEA = bit(p.sea_class);
  const ICE = bit(p.ice_class);
  const LAND = bit(p.land_class);
  const wetRock = new Set(p.wet_lithologies);
  const wetPlace = new Set(p.wet_environments);
  const dryRock = new Set(p.dry_lithologies);
  const dryWord = new Set(p.dry_adjectives);
  const dryPlace = new Set(p.dry_environments);
  const said = (words: string, of: Set<string>) => words.split(',').some((x) => of.has(x.trim()));
  // The chance that none of a box's collections of a kind is of the span, by keyframe, pair, kind and box.
  const miss: Map<string, number>[] = ages.map(() => new Map());
  const back = new Map<number, Quat | null>();
  const forth = ages.map(() => new Map<number, Quat | null>());
  for (const c of rocks.collections) {
    const wet = wetRock.has(w(c[8])) || wetRock.has(w(c[12])) || wetPlace.has(w(c[5]));
    const dry = dryRock.has(w(c[8])) || dryRock.has(w(c[12])) || dryPlace.has(w(c[5])) || said(w(c[9]), dryWord) || said(w(c[13]), dryWord);
    const kinds: string[] = [];
    if (wet !== dry) kinds.push(wet ? 'wet:1' : 'wet:0');
    if (c[16] & SEA) kinds.push(c[16] & REEF ? 'reef:1' : 'reef:0');
    if (c[16] & LAND || c[16] & ICE) kinds.push(c[16] & ICE ? 'ice:0' : 'ice:1');
    if (!kinds.length) continue;
    let plate = -1;
    for (let k = 0; k < ages.length; k++) {
      if (edges[k].younger >= c[3] && c[3] !== c[4]) break;
      if (edges[k].older <= c[4]) continue;
      const share = rowShare(c[3], c[4], edges[k].older, edges[k].younger, span);
      if (!share) continue;
      if (plate < 0) plate = plateOf(c[1], c[2]);
      let from = back.get(plate);
      if (from === undefined) back.set(plate, (from = plate && model.reaches(plate, 0) ? conj(model.total(plate, 0)) : null));
      let to = forth[k].get(plate);
      if (to === undefined) forth[k].set(plate, (to = plate && model.reaches(plate, ages[k]) ? model.total(plate, ages[k]) : null));
      if (!from || !to) continue;
      const [lat, lon] = toLatLon(rotate(to, rotate(from, unitVector(c[1], c[2]))));
      const box = `${Math.round(lat / p.box_deg)}:${Math.round(lon / p.box_deg)}`;
      for (const kind of kinds) {
        const key = `${kind}:${box}`;
        miss[k].set(key, (miss[k].get(key) ?? 1) * (1 - Math.min(1, share)));
      }
    }
  }
  return ages.map((_, k) => {
    const out = Object.fromEntries(PAIRS.map((pair) => [pair, [] as Bed[]])) as Record<Pair, Bed[]>;
    for (const [key, none] of miss[k]) {
      const [pair, more, a, b] = key.split(':');
      const lat = Math.max(-90, Math.min(90, Number(a) * p.box_deg));
      const lon = Number(b) * p.box_deg;
      out[pair as Pair].push({ lat, lon, node: nodeOf(grid, lat, lon), more: more === '1', w: 1 - none });
    }
    for (const pair of PAIRS) out[pair].sort((x, y) => x.node - y.node || Number(y.more) - Number(x.more) || x.lat - y.lat || x.lon - y.lon);
    return out;
  });
}

/**
 * How the runs' pattern answers to the mean, read across the runs: in each belt of latitude, the slope of the land's
 * mean of the year, and of the log of its aridity, against the run's global mean.
 */
export function responseOf(runs: ChanceRun[], grid: ChanceGrid, belt: number): Response {
  const belts = Math.round(90 / belt);
  const n = grid.nx * grid.ny;
  const sums = runs.map(() => Array.from({ length: belts }, () => ({ w: 0, warm: 0, wet: 0 })));
  runs.forEach((run, r) => {
    for (let k = 0; k < n; k++) {
      if (!(run.plate[k] & LAND_BIT) || !Number.isFinite(run.nodes[k * 4])) continue;
      const lat = 90 - Math.floor(k / grid.nx) * grid.step;
      const w = Math.cos((lat * Math.PI) / 180);
      const b = sums[r][Math.min(belts - 1, Math.floor(Math.abs(lat) / belt))];
      b.w += w;
      b.warm += (w * (run.nodes[k * 4] + run.nodes[k * 4 + 1])) / 2;
      b.wet += w * Math.log(Math.max(0.05, run.nodes[k * 4 + 2]));
    }
  });
  const slope = (b: number, of: 'warm' | 'wet'): number => {
    // Each run counts alike, where it has land in the belt at all.
    const rs = runs.map((run, r) => ({ x: run.global, y: sums[r][b][of] / sums[r][b].w, ok: sums[r][b].w > 0 })).filter((q) => q.ok);
    if (rs.length < 3) return NaN;
    const mx = rs.reduce((s, q) => s + q.x, 0) / rs.length;
    const my = rs.reduce((s, q) => s + q.y, 0) / rs.length;
    const sxx = rs.reduce((s, q) => s + (q.x - mx) ** 2, 0);
    return sxx > 0 ? rs.reduce((s, q) => s + (q.x - mx) * (q.y - my), 0) / sxx : NaN;
  };
  const fill = (xs: number[], none: number): number[] => xs.map((x, i) => (Number.isFinite(x) ? x : (xs.slice(0, i).reverse().find(Number.isFinite) ?? xs.slice(i).find(Number.isFinite) ?? none)));
  return {
    belt_deg: belt,
    warm: fill(Array.from({ length: belts }, (_, b) => slope(b, 'warm')), 1).map((x) => round(x, 4)),
    wet: fill(Array.from({ length: belts }, (_, b) => slope(b, 'wet')), 0).map((x) => round(x, 4)),
  };
}

/** A land node of the present's run with the climate measured there. */
interface Now {
  node: number;
  lat: number;
  lon: number;
  block: number;
  area: number;
  run: ClimateNode;
  seen: ClimateNode;
}

/** The mean, the swing and the log of the aridity of a climate; the last undefined where the aridity is at the cap, and says only "wet". */
const meanOf = (c: ClimateNode) => (c.hot + c.cold) / 2;
const swingOf = (c: ClimateNode) => (c.hot - c.cold) / 2;
const wetOf = (c: ClimateNode) => Math.log(Math.max(0.05, c.aridity));
const capped = (c: ClimateNode) => c.aridity >= 3.9;

/** How far the run lies from the climate measured, over some land nodes: on average and from place to place. */
function errorOver(nodes: Now[]): Omit<RunError, 'warm_km' | 'wet_km'> {
  const stat = (of: (q: Now) => number | undefined) => {
    let w = 0;
    let s = 0;
    let s2 = 0;
    for (const q of nodes) {
      const v = of(q);
      if (v === undefined) continue;
      w += q.area;
      s += q.area * v;
      s2 += q.area * v * v;
    }
    const mean = w ? s / w : 0;
    return { mean, sd: w ? Math.sqrt(Math.max(0, s2 / w - mean * mean)) : 0 };
  };
  const mean = stat((q) => meanOf(q.run) - meanOf(q.seen));
  const swing = stat((q) => swingOf(q.run) - swingOf(q.seen));
  const wet = stat((q) => (capped(q.run) || capped(q.seen) ? undefined : wetOf(q.run) - wetOf(q.seen)));
  return { mean_bias: mean.mean, swing_bias: swing.mean, wet_bias: wet.mean, mean_sd: mean.sd, swing_sd: swing.sd, wet_sd: wet.sd };
}

/**
 * The width of the bell the run's errors go together by: how alike the errors at two land nodes are, by how far apart
 * they lie, fitted with a bell that need not reach one at no distance, since part of an error is the node's own.
 */
function reachOf(nodes: Now[], of: (q: Now) => number | undefined, bias: number, edges: number[]): number {
  const acc = edges.map(() => ({ n: 0, s: 0, d: 0 }));
  let varSum = 0;
  let varN = 0;
  const vals = nodes.map((q) => of(q));
  for (const v of vals) {
    if (v === undefined) continue;
    varSum += (v - bias) ** 2;
    varN++;
  }
  const variance = varN ? varSum / varN : 0;
  if (!(variance > 0)) return edges[Math.floor(edges.length / 2)];
  for (let i = 0; i < nodes.length; i++) {
    const a = vals[i];
    if (a === undefined) continue;
    // Every third partner, which is pairs enough and a third of the work.
    for (let j = i + 1; j < nodes.length; j += 3) {
      const b = vals[j];
      if (b === undefined) continue;
      if (Math.abs(nodes[i].lat - nodes[j].lat) * 111.2 > edges[edges.length - 1]) continue;
      const km = kmBetween(nodes[i].lat, nodes[i].lon, nodes[j].lat, nodes[j].lon);
      const e = edges.findIndex((x) => km < x);
      if (e < 0) continue;
      acc[e].n++;
      acc[e].s += (a - bias) * (b - bias);
      acc[e].d += km;
    }
  }
  const bins = acc.filter((b) => b.n > 30).map((b) => ({ km: b.d / b.n, corr: b.s / b.n / variance, n: b.n }));
  if (bins.length < 3) return edges[Math.floor(edges.length / 2)];
  let best = { km: edges[0], miss: Infinity };
  for (let km = 100; km <= 3000; km += 25) {
    // The bell's height where it best fits, for this width: a line through the origin.
    const g = bins.map((b) => Math.exp(-0.5 * (b.km / km) ** 2));
    const top = Math.max(0, Math.min(1, bins.reduce((s, b, i) => s + b.n * b.corr * g[i], 0) / bins.reduce((s, b, i) => s + b.n * g[i] * g[i], 0)));
    const miss = bins.reduce((s, b, i) => s + b.n * (b.corr - top * g[i]) ** 2, 0);
    if (miss < best.miss) best = { km, miss };
  }
  return best.km;
}

/** The weights a bell `km` wide gives the nodes about a node of each row of the grid: [rows down, columns east, weight], out to three widths. */
function bellOf(grid: ChanceGrid, km: number): [number, number, number][][] {
  const reach = 3 * km;
  const band = reach / 111.2;
  const out: [number, number, number][][] = [];
  for (let row = 0; row < grid.ny; row++) {
    const lat = 90 - row * grid.step;
    const list: [number, number, number][] = [];
    const row0 = Math.max(0, Math.ceil((90 - (lat + band)) / grid.step));
    const row1 = Math.min(grid.ny - 1, Math.floor((90 - (lat - band)) / grid.step));
    for (let r = row0; r <= row1; r++) {
      const la = 90 - r * grid.step;
      for (let dc = 0; dc <= grid.nx / 2; dc++) {
        const far = kmBetween(lat, 0, la, dc * grid.step);
        if (far > reach) {
          // Along a row the distance grows with the columns until half way round: past the reach, the rest are too.
          if (dc * grid.step * Math.cos((Math.min(89.999, Math.max(Math.abs(lat), Math.abs(la))) * Math.PI) / 180) * 111.2 > reach) break;
          continue;
        }
        const w = Math.exp(-0.5 * (far / km) ** 2);
        list.push([r - row, dc, w]);
        if (dc > 0 && dc < grid.nx / 2) list.push([r - row, -dc, w]);
      }
    }
    out.push(list);
  }
  return out;
}

/** How nodes are grouped to be held out together: by a square of `deg` degrees. */
const groupBy = (grid: ChanceGrid, deg: number) => {
  const per = Math.max(1, Math.round(deg / grid.step));
  return (node: number) => Math.floor(Math.floor(node / grid.nx) / per) * 1000 + Math.floor((node % grid.nx) / per);
};

/**
 * What was found near every node of a keyframe, of a pair's two kinds, by a bell; and for each bed, what was found near
 * its own node without the beds of its node, of its tile and of its block.
 */
function gather(beds: Bed[], grid: ChanceGrid, bell: [number, number, number][][], tile: (n: number) => number, block: (n: number) => number): { found: Found; held: { cell: [number, number]; tile: [number, number]; block: [number, number]; all: [number, number] }[] } {
  const n = grid.nx * grid.ny;
  // The beds of each node together first: a bed counts from its node's own place, which is within a node of its own.
  const at = { more: new Float32Array(n), less: new Float32Array(n) };
  for (const b of beds) (b.more ? at.more : at.less)[b.node] += b.w;
  const found: Found = { more: new Float32Array(n), less: new Float32Array(n) };
  const own = { tile: { more: new Float32Array(n), less: new Float32Array(n) }, block: { more: new Float32Array(n), less: new Float32Array(n) } };
  for (let src = 0; src < n; src++) {
    const m = at.more[src];
    const l = at.less[src];
    if (!m && !l) continue;
    const row = Math.floor(src / grid.nx);
    const col = src % grid.nx;
    const t = tile(src);
    const bl = block(src);
    for (const [dr, dc, w] of bell[row]) {
      const k = (row + dr) * grid.nx + ((col + dc + grid.nx) % grid.nx);
      found.more[k] += w * m;
      found.less[k] += w * l;
      if (tile(k) === t) {
        own.tile.more[k] += w * m;
        own.tile.less[k] += w * l;
      }
      if (block(k) === bl) {
        own.block.more[k] += w * m;
        own.block.less[k] += w * l;
      }
    }
  }
  const less = (a: number, b: number) => Math.max(0, a - b);
  const held = beds.map((b) => {
    const k = b.node;
    return {
      cell: [less(found.more[k], at.more[k]), less(found.less[k], at.less[k])] as [number, number],
      tile: [less(found.more[k], own.tile.more[k]), less(found.less[k], own.tile.less[k])] as [number, number],
      block: [less(found.more[k], own.block.more[k]), less(found.less[k], own.block.less[k])] as [number, number],
      all: [found.more[k], found.less[k]] as [number, number],
    };
  });
  return { found, held };
}

/** A link as the fit holds it: how a pair's share follows its quantity, with each keyframe's level. */
interface Fit {
  slope: number;
  at: number;
  own: number;
  /** each keyframe's level, as the log of the odds of the `more` kind where the quantity is `at`; NaN where the pair is not read */
  levels: number[];
}

/** How much a spread of a place's own log odds flattens the share seen over many places: a logistic curve drawn over a bell is nearly a logistic one, less steep by this. */
const flattening = (own: number) => Math.sqrt(1 + 0.346 * own);

/** The log of the chance a model gives some rows' kinds, each row's log odds before the finds given by `expected`. */
function likelihood(rows: Row[], expected: (r: Row) => number, own: number, held: (Held | 'none')[]): number {
  let sum = 0;
  for (const r of rows) {
    const e = expected(r);
    if (!Number.isFinite(e)) continue;
    for (const h of held) {
      const [m, l] = h === 'none' ? [0, 0] : r[h];
      const q = Math.max(0.001, Math.min(0.999, m || l ? shareNear(e, m, l, own).share : shareOver(e, own)));
      sum += r.w * Math.log(r.more ? q : 1 - q);
    }
  }
  return sum;
}

/** The rows of a keyframe and of `pool` keyframes either side, which share one level; `without` leaves a keyframe's own out. */
function pooled<T>(byKey: T[][], k: number, pool: number, without?: number): T[] {
  const near: T[] = [];
  for (let j = k - pool; j <= k + pool; j++) if (j >= 0 && j < byKey.length && j !== without) near.push(...byKey[j]);
  return near;
}

/** Which keyframes a pair is read at: those with beds enough of its rarer kind, by weight, in the keyframe and those it shares a level with. */
function toldAt(byKey: Row[][], p: Pick<ChanceParams, 'pool' | 'level_min'>, without?: number): boolean[] {
  return byKey.map((_, k) => {
    const near = pooled(byKey, k, p.pool, without);
    const more = near.reduce((s, r) => s + (r.more ? r.w : 0), 0);
    const less = near.reduce((s, r) => s + (r.more ? 0 : r.w), 0);
    return Math.min(more, less) >= p.level_min;
  });
}

/**
 * The level with which a slope best tells the kinds of some beds from the members' climate at their places and nothing
 * else. A hundredth of a bed of each kind that is not there holds it off the ends.
 */
function levelOver(near: Row[], slope: number, at: number): number {
  return highest(
    (y) => {
      let sum = -0.01 * (Math.log1p(Math.exp(y)) + Math.log1p(Math.exp(-y)));
      for (const r of near) {
        const x = slope * (r.x - at) + y;
        sum += r.w * (r.more ? -Math.log1p(Math.exp(-x)) : -Math.log1p(Math.exp(x)));
      }
      return sum;
    },
    -12,
    12,
    24,
  );
}

/**
 * Each keyframe's level, given a slope: that of the beds of the keyframe and of `pool` keyframes either side. It is
 * where the members are taken to be right on average: more wet climate, and wet beds better kept or more looked for,
 * leave the same record, so the beds can move the climate from place to place and cannot say that a whole keyframe was
 * wetter than its members.
 */
function levelsOf(byKey: Row[][], slope: number, at: number, told: boolean[], p: Pick<ChanceParams, 'pool'>): number[] {
  return byKey.map((_, k) => (told[k] ? levelOver(pooled(byKey, k, p.pool), slope, at) : NaN));
}

/** The keyframes beyond those a keyframe shares a level with, as many again either side: what is left when its era is held out. */
function beyond(k: number, pool: number, count: number): number[] {
  const out: number[] = [];
  for (let j = k - 2 * pool - 1; j <= k + 2 * pool + 1; j++) if (j >= 0 && j < count && Math.abs(j - k) > pool) out.push(j);
  return out;
}

/**
 * A pair's link, fitted in two steps. First the slope and each keyframe's level, with which a bed's kind is best told
 * from the members' climate at its place and nothing else. Then how much a place's own share varies about that: the
 * spread with which a bed is best told when the others of its node, and of its tile, are held out. With that spread the
 * slope and the levels are those of a place, steeper than what is seen over many.
 */
function fitLink(rows: Row[], byKey: Row[][], told: boolean[], start: { slope: number; at: number; own: number }, p: ChanceParams): Fit {
  const read = rows.filter((r) => told[r.k]);
  let slope = start.slope;
  let levels = levelsOf(byKey, slope, start.at, told, p);
  for (let i = 0; i < 4; i++) {
    slope = highest((s) => likelihood(read, (r) => s * (r.x - start.at) + levels[r.k], 0, ['none']), -start.slope * 0.05, start.slope * 20, 20);
    levels = levelsOf(byKey, slope, start.at, told, p);
  }
  const seen = { slope, levels };
  const withOwn = (own: number): Fit => ({ slope: seen.slope * flattening(own), at: start.at, own, levels: seen.levels.map((y) => y * flattening(own)) });
  const of = (f: Fit) => likelihood(read, (r) => f.slope * (r.x - f.at) + f.levels[r.k], f.own, ['cell', 'tile']);
  const own = Math.exp(highest((v) => of(withOwn(Math.exp(v))), Math.log(0.02), Math.log(30), 20));
  return withOwn(round(own));
}

/**
 * The smoother with no causes, for a pair: the share of the `more` kind among the beds of a keyframe and those either
 * side, by latitude alone, north and south together, on a bell `deg` wide; and the finds near a bed averaged in as the
 * model averages them. It knows where the beds lie and when, and nothing of what makes a climate.
 */
class Smoother {
  private readonly bins: number;
  /** by keyframe: the beds of each belt of latitude, more and less */
  private readonly belts: Float64Array[];
  private readonly weights: Float64Array;
  own = 1;

  constructor(
    private readonly byKey: Row[][],
    grid: ChanceGrid,
    private readonly p: Pick<ChanceParams, 'pool' | 'smoother_deg'>,
  ) {
    this.bins = Math.floor((grid.ny - 1) / 2) + 1;
    this.belts = byKey.map((rows) => {
      const b = new Float64Array(this.bins * 2);
      for (const r of rows) b[r.bin * 2 + (r.more ? 0 : 1)] += r.w;
      return b;
    });
    this.weights = Float64Array.from({ length: this.bins }, (_, d) => Math.exp(-0.5 * ((d * grid.step) / p.smoother_deg) ** 2));
  }

  /**
   * The log odds of the `more` kind at a bed's latitude, from the beds of its keyframe and those either side, without
   * `out`: beds to leave out, as [keyframe, belt, more, less]. With `from`, from those keyframes instead.
   */
  expected(r: Row, out: [number, number, number, number][], from?: number[]): number {
    let more = 0;
    let less = 0;
    let allMore = 0;
    let allLess = 0;
    const keys = from ?? Array.from({ length: 2 * this.p.pool + 1 }, (_, i) => r.k - this.p.pool + i).filter((j) => j >= 0 && j < this.byKey.length);
    for (const j of keys) {
      const b = this.belts[j];
      for (let i = 0; i < this.bins; i++) {
        const w = this.weights[Math.abs(i - r.bin)];
        more += w * b[i * 2];
        less += w * b[i * 2 + 1];
        allMore += b[i * 2];
        allLess += b[i * 2 + 1];
      }
    }
    for (const [k, bin, m, l] of out) {
      if (!keys.includes(k)) continue;
      const w = this.weights[Math.abs(bin - r.bin)];
      more -= w * m;
      less -= w * l;
      allMore -= m;
      allLess -= l;
    }
    // Half a bed at the share of all the beds counted keeps a belt with none of its own off the ends.
    const all = Math.max(0.001, Math.min(0.999, (Math.max(0, allMore) + 0.5) / (Math.max(0, allMore) + Math.max(0, allLess) + 1)));
    return logit(Math.max(0.0005, Math.min(0.9995, (Math.max(0, more) + 0.5 * all) / (Math.max(0, more) + Math.max(0, less) + 0.5))));
  }
}

/** The beds of each group of nodes of a keyframe, as the smoother leaves them out: by group, [keyframe, belt, more, less] for each belt the group has beds in. */
function leftOut(byKey: Row[][], group: (node: number) => number): Map<string, [number, number, number, number][]> {
  const sums = new Map<string, Map<number, [number, number]>>();
  byKey.forEach((rows, k) => {
    for (const r of rows) {
      const key = `${k}:${group(r.node)}`;
      let g = sums.get(key);
      if (!g) sums.set(key, (g = new Map()));
      let b = g.get(r.bin);
      if (!b) g.set(r.bin, (b = [0, 0]));
      b[r.more ? 0 : 1] += r.w;
    }
  });
  const out = new Map<string, [number, number, number, number][]>();
  for (const [key, g] of sums) {
    const k = Number(key.split(':')[0]);
    out.set(key, [...g].map(([bin, [m, l]]) => [k, bin, m, l]));
  }
  return out;
}

/** What goes into a build of the climate conditioned. */
export interface ChanceInputs {
  model: RotationModel;
  grid: ChanceGrid;
  runs: ChanceRun[];
  /** the youngest snapshot of the elevation, whose plates place a spot of today's Earth */
  now: Snapshot;
  rocks: RocksSnapshot;
  span: SpanRule;
  series: ChanceSeries;
  balance: EnergyBalanceParams;
  measured: Measured;
  columns?: ChanceColumns;
  forests?: ForestAt[];
  rule: ClimateRule;
  params: ChanceParams;
  about: { field: string; title: string; description?: string; beds: { field: string; title: string }; climate: string; source: string; sourceRecord?: SourceRecord };
  log: (m: string) => void;
}

/** The climate of every keyframe with its spread, what it rests on and how it holds. */
export function buildClimateChance(input: ChanceInputs): ChanceOut {
  const { model, grid, rocks, span, series, measured, rule, params: p, about, log } = input;
  const started = Date.now();
  const runs = [...input.runs].sort((a, b) => a.ageMa - b.ageMa);
  const ages = runs.map((r) => r.ageMa);
  const edges = spansOf(ages);
  const N = grid.nx * grid.ny;
  const latOf = (node: number) => 90 - Math.floor(node / grid.nx) * grid.step;
  const lonOf = (node: number) => -180 + (node % grid.nx) * grid.step;
  const areaOf = (node: number) => Math.cos((latOf(node) * Math.PI) / 180);
  const runNode = (run: ChanceRun, k: number): ClimateNode | undefined => (Number.isFinite(run.nodes[k * 4]) ? { hot: run.nodes[k * 4], cold: run.nodes[k * 4 + 1], aridity: run.nodes[k * 4 + 2], margin: run.nodes[k * 4 + 3] } : undefined);
  const tile = groupBy(grid, p.tile_deg);
  const block = groupBy(grid, p.block_deg);

  // ---- How the pattern answers to the mean, across the runs
  const response = responseOf(runs, grid, p.belt_deg);

  // ---- The run's error, at the present
  const present = runs[0];
  const nows: Now[] = [];
  for (let k = 0; k < N; k++) {
    if (!(present.plate[k] & LAND_BIT)) continue;
    const run = runNode(present, k);
    const seen = measured(latOf(k), lonOf(k));
    if (run && seen) nows.push({ node: k, lat: latOf(k), lon: lonOf(k), block: block(k), area: areaOf(k), run, seen });
  }
  if (nows.length < 100) throw new Error(`climate-chance: only ${nows.length} land nodes of the youngest run have a measured climate to hold it to`);
  const over = errorOver(nows);
  const error: RunError = {
    mean_bias: round(over.mean_bias),
    swing_bias: round(over.swing_bias),
    wet_bias: round(over.wet_bias),
    mean_sd: round(Math.hypot(over.mean_bias, over.mean_sd)),
    swing_sd: round(Math.hypot(over.swing_bias, over.swing_sd)),
    wet_sd: round(Math.hypot(over.wet_bias, over.wet_sd)),
    warm_km: reachOf(nows, (q) => meanOf(q.run) - meanOf(q.seen), over.mean_bias, p.reach_km),
    wet_km: reachOf(nows, (q) => (capped(q.run) || capped(q.seen) ? undefined : wetOf(q.run) - wetOf(q.seen)), over.wet_bias, p.reach_km),
  };
  log(`climate-chance   the run of the present against the climate measured, ${nows.length} land nodes: the year's mean is out by ${error.mean_bias} °C on average and ${error.mean_sd} as a root mean square, the season's swing by ${error.swing_bias} and ${error.swing_sd}, the log of the aridity by ${error.wet_bias} and ${error.wet_sd}; its errors go together over ${error.warm_km} km for the warmth and ${error.wet_km} km for the aridity`);

  // ---- The Earth's mean warmth
  const ebm = new EnergyBalance(input.balance);
  const clampInto = (points: SeriesRecord['points'], older: number, younger: number, age: number): number | null => {
    if (!points.length) return null;
    const [first, last] = [points[0][0], points.at(-1)![0]];
    const t = Math.max(first, Math.min(last, fromMa(age)));
    return t >= fromMa(older) && t <= fromMa(younger) ? t : null;
  };
  const causes = ages.map((age, k) => {
    const t = clampInto(series.co2, edges[k].older, edges[k].younger, age);
    const ts = clampInto(series.sun, edges[k].older, edges[k].younger, age);
    const c = t === null ? null : seriesWith(series.co2, t);
    const l = ts === null ? null : seriesWith(series.sun, ts);
    if (!c || !l) return undefined;
    const u: Uncertain | null = c[1] !== null && c[2] !== null ? { kind: 'range', lo: c[1], hi: c[2] } : null;
    // Member 0 is the series' own value; the others are drawn from its band, the same member at every time.
    return Array.from({ length: p.members }, (_, m) => ebm.balance(l[0], ebm.forcing((m === 0 || !u ? c[0] : sample(u, 'field:earth/co2', m)) * 1e-6 * p.atmosphere_bar), 'warm').mean);
  });
  const seenAt = ages.map((_, k) => {
    const lo = fromMa(edges[k].older);
    const hi = fromMa(edges[k].younger);
    const inside = series.curve.filter((q) => q[0] >= lo && q[0] <= hi);
    if (!inside.length) return undefined;
    const mean = inside.reduce((s, q) => s + q[1], 0) / inside.length;
    const within = inside.reduce((s, q) => s + (q[1] - mean) ** 2, 0) / inside.length;
    const bands = inside.reduce((s, q) => s + (q[2] !== null && q[3] !== null ? ((q[3] - q[2]) / 2 / p.curve_band_sd) ** 2 : 0), 0) / inside.length;
    return { mean, sd: Math.sqrt(within + bands) };
  });
  const spreadOf = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  };
  // An era of the curve held out: the balance as it is, the balance with its mean distance from the curve told from the
  // other eras, and the mean of the other eras.
  const both = ages.map((_, k) => k).filter((k) => causes[k] && seenAt[k]);
  const eraOf = (k: number) => Math.floor(ages[k] / p.era_myr);
  const eras = [...new Set(both.map(eraOf))];
  const miss = { balance: 0, shifted: 0, baseline: 0 };
  for (const k of both) {
    const others = both.filter((j) => eraOf(j) !== eraOf(k));
    const baseline = others.reduce((s, j) => s + seenAt[j]!.mean, 0) / Math.max(1, others.length);
    const shift = others.reduce((s, j) => s + seenAt[j]!.mean - causes[j]![0], 0) / Math.max(1, others.length);
    miss.balance += (causes[k]![0] - seenAt[k]!.mean) ** 2;
    miss.shifted += (causes[k]![0] + shift - seenAt[k]!.mean) ** 2;
    miss.baseline += (baseline - seenAt[k]!.mean) ** 2;
  }
  const rms = (x: number) => round(Math.sqrt(x / Math.max(1, both.length)));
  // The balance is brought to the curve's level: its mean distance from the curve is taken off, so that what it adds is
  // its rises and falls with the CO₂ and the Sun. Its own error is how far it then lies from the curve with an era held
  // out: what it has earned.
  const lift = both.reduce((s, k) => s + seenAt[k]!.mean - causes[k]![0], 0) / Math.max(1, both.length);
  const balanceSd = Math.max(p.balance_sd_min, rms(miss.shifted));
  const warmthScore = { eras: eras.length, keyframes: both.length, balance: rms(miss.balance), shifted: rms(miss.shifted), baseline: rms(miss.baseline), bias: round(-lift) };
  log(`climate-chance   the Earth's mean warmth at ${ages.length} keyframes, ${both.length} with CO₂: the energy balance lies ${warmthScore.bias} °C from the rocks' curve on average; with an era of ${p.era_myr} Myr held out it tells the curve to ${warmthScore.balance} °C as it is, to ${warmthScore.shifted} brought to the curve's level by the other eras, and the mean of the other eras tells it to ${warmthScore.baseline}`);
  /** the warmth of each keyframe before any forest is read: the causes, what observes them, and the two together */
  const firsts = ages.map((_, k) => {
    const c = causes[k];
    const prior = c ? { mean: c[0] + lift, sd: Math.hypot(spreadOf(c), balanceSd) } : undefined;
    const seen = seenAt[k];
    const post = together(prior, seen) ?? { mean: runs[k].global, sd: balanceSd };
    return { prior, seen, mean: post.mean, sd: post.sd };
  });

  // ---- The members' climate at every node, before any bed
  const centralOf = (k: number): { central: (Central | undefined)[]; warm: Float32Array } => {
    const run = runs[k];
    const shift = firsts[k].mean - run.global;
    const central: (Central | undefined)[] = new Array(N);
    const warm = new Float32Array(N).fill(NaN);
    for (let n = 0; n < N; n++) {
      const node = runNode(run, n);
      central[n] = node ? moved(node, latOf(n), shift, response) : undefined;
      if (Number.isFinite(run.warm[n])) warm[n] = run.warm[n] + warmingAt(response, latOf(n)) * shift;
    }
    return { central, warm };
  };
  const before = ages.map((_, k) => centralOf(k));

  // ---- The beds, and what was found near
  const beds = bedsOf(model, ages, input.now, rocks, span, p, grid);
  const count = beds.reduce((n, b) => n + PAIRS.reduce((m, pair) => m + b[pair].length, 0), 0);
  log(`climate-chance   ${count.toLocaleString('en-US')} beds of ${rocks.collections.length.toLocaleString('en-US')} collections at ${ages.length} keyframes, placed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  // A bed counts at a node by how much of the node's error its own place's would tell: the square of how far the two
  // go together, which is a bell narrower than theirs by the root of two.
  const kmOf: Record<Pair, number> = { wet: error.wet_km / Math.SQRT2, reef: error.warm_km / Math.SQRT2, ice: error.warm_km / Math.SQRT2 };
  const bells = new Map<number, [number, number, number][][]>();
  const bellFor = (km: number) => {
    let b = bells.get(km);
    if (!b) bells.set(km, (b = bellOf(grid, km)));
    return b;
  };
  /** the quantity a pair's share follows, at a node of a keyframe, as the members have it before any bed */
  const quantity = (pair: Pair, k: number, node: number): number => {
    if (pair === 'wet') {
      const c = before[k].central[node];
      return c ? Math.log(Math.max(0.05, c.aridity)) : NaN;
    }
    return before[k].warm[node];
  };
  const bins = Math.floor((grid.ny - 1) / 2);
  const founds: Record<Pair, Found>[] = ages.map(() => ({}) as Record<Pair, Found>);
  const rowsOf = {} as Record<Pair, Row[]>;
  const byKeyOf = {} as Record<Pair, Row[][]>;
  for (const pair of PAIRS) {
    const rows: Row[] = [];
    const byKey: Row[][] = ages.map(() => []);
    ages.forEach((_, k) => {
      const g = gather(beds[k][pair], grid, bellFor(kmOf[pair]), tile, block);
      founds[k][pair] = g.found;
      beds[k][pair].forEach((b, i) => {
        const x = quantity(pair, k, b.node);
        if (!Number.isFinite(x)) return;
        const row: Row = { k, node: b.node, bin: Math.abs(bins - Math.floor(b.node / grid.nx)), more: b.more, w: b.w, x, ...g.held[i] };
        rows.push(row);
        byKey[k].push(row);
      });
    });
    rowsOf[pair] = rows;
    byKeyOf[pair] = byKey;
  }

  // ---- The links
  const starts: Record<Pair, { slope: number; at: number; own: number }> = { wet: { slope: p.wet_slope, at: p.wet_at, own: p.own }, reef: { slope: p.reef_slope, at: p.reef_at, own: p.own }, ice: { slope: p.ice_slope, at: p.ice_at, own: p.own } };
  const fits = {} as Record<Pair, Fit>;
  const tolds = {} as Record<Pair, boolean[]>;
  for (const pair of PAIRS) {
    tolds[pair] = toldAt(byKeyOf[pair], p);
    fits[pair] = fitLink(rowsOf[pair], byKeyOf[pair], tolds[pair], starts[pair], p);
    const f = fits[pair];
    log(`climate-chance   ${pair}: ${rowsOf[pair].length.toLocaleString('en-US')} beds, read at ${tolds[pair].filter(Boolean).length} keyframes; the log of the odds moves by ${round(f.slope)} for each unit, and a place's own varies by ${round(Math.sqrt(f.own))} about that`);
  }
  const links = Object.fromEntries(PAIRS.map((pair) => [pair, { slope: round(fits[pair].slope, 4), at: fits[pair].at, own: fits[pair].own }])) as Record<Pair, Link>;
  const ruleOut: ChanceRule = { response, error, balance_sd: balanceSd, links, box_deg: p.box_deg };
  const expectedOf = (pair: Pair, k: number, x: number): number => links[pair].slope * (x - links[pair].at) + fits[pair].levels[k];

  // ---- What the beds make of the run's error at every node
  const sdOf = { warm: error.mean_sd, wet: error.wet_sd };
  const local = ages.map((_, k) => {
    const warmMean = new Float32Array(N);
    const warmSd = new Float32Array(N).fill(sdOf.warm);
    const wetMean = new Float32Array(N);
    const wetSd = new Float32Array(N).fill(sdOf.wet);
    for (let n = 0; n < N; n++) {
      if (!before[k].central[n]) continue;
      const said = (pair: Pair) => {
        const f = founds[k][pair];
        const x = quantity(pair, k, n);
        if (!tolds[pair][k] || !Number.isFinite(x) || (!f.more[n] && !f.less[n])) return undefined;
        const s = shareNear(expectedOf(pair, k, x), f.more[n], f.less[n], links[pair].own);
        return { slope: links[pair].slope, own: links[pair].own, mean: s.mean, var: s.var };
      };
      const warm = errorFrom(sdOf.warm, [said('reef'), said('ice')].filter((x) => x !== undefined));
      const wet = errorFrom(sdOf.wet, [said('wet')].filter((x) => x !== undefined));
      warmMean[n] = warm.mean;
      warmSd[n] = warm.sd;
      wetMean[n] = wet.mean;
      wetSd[n] = wet.sd;
    }
    return { warmMean, warmSd, wetMean, wetSd };
  });

  // ---- The fossil forests: trees grew there, so its warmest month was no polar one, and the land no desert
  const treesOf = (cs: number[]) => CLASSES.reduce((s, c, i) => s + (TREES.includes(c) ? cs[i] : 0), 0);
  /** the chance of a climate that bears trees at a node of a keyframe, were the Earth's mean warmth `g`, give or take `sd` */
  const treesAt = (k: number, n: number, g: number, sd: number): number => {
    const lat = latOf(n);
    const c = nudged(moved(runNode(runs[k], n)!, lat, g - runs[k].global, response), local[k].warmMean[n], local[k].wetMean[n]);
    return treesOf(classChances(c, { warm: Math.hypot(warmingAt(response, lat) * sd, local[k].warmSd[n]), swing: error.swing_sd, wet: Math.hypot(wettingAt(response, lat) * sd, local[k].wetSd[n]) }, rule));
  };
  /**
   * A bound at a node tells of the nodes near, by how far the run's errors go together: there the mean moves and the
   * spread narrows in proportion.
   */
  const tellNear = (k: number, node: number, of: 'warm' | 'wet', by: number, after: number) => {
    const mean = of === 'warm' ? local[k].warmMean : local[k].wetMean;
    const sd = of === 'warm' ? local[k].warmSd : local[k].wetSd;
    const was = sd[node];
    if (!(was > 0)) return;
    const taken = Math.max(0, 1 - (after * after) / (was * was));
    const row = Math.floor(node / grid.nx);
    const col = node % grid.nx;
    for (const [dr, dc, w] of bellFor(of === 'warm' ? error.warm_km : error.wet_km)[row]) {
      const n = (row + dr) * grid.nx + ((col + dc + grid.nx) % grid.nx);
      if (!before[k].central[n]) continue;
      mean[n] += w * (sd[n] / was) * by;
      sd[n] = Math.sqrt(sd[n] * sd[n] * (1 - w * w * taken));
    }
  };
  const forestsAt = ages.map(() => [] as { f: ForestAt; node: number }[]);
  for (const f of input.forests ?? []) {
    const k = ages.indexOf(f.keyframeMa);
    const node = nodeOf(grid, f.lat, f.lon);
    if (k >= 0 && runNode(runs[k], node)) forestsAt[k].push({ f, node });
  }
  const heldOut = new Map<string, number>();
  const warmths: Warmth[] = [];
  const memberWarmth: number[][] = [];
  ages.forEach((_, k) => {
    const first = firsts[k];
    let post = { mean: first.mean, sd: first.sd };
    const here = forestsAt[k];
    if (here.length) {
      // The warmth on a grid of values, each forest weighing each by how likely trees were at its place under it.
      const G = 41;
      const gs = Array.from({ length: G }, (_, i) => first.mean + first.sd * (-4 + (8 * i) / (G - 1)));
      const like = here.map(({ node }) => gs.map((g) => p.forest_slip + (1 - p.forest_slip) * treesAt(k, node, g, 0)));
      const moments = (skip?: number) => {
        let z = 0;
        let m1 = 0;
        let m2 = 0;
        gs.forEach((g, i) => {
          let w = Math.exp(-0.5 * ((g - first.mean) / first.sd) ** 2);
          like.forEach((l, j) => {
            if (j !== skip) w *= l[i];
          });
          z += w;
          m1 += w * g;
          m2 += w * g * g;
        });
        const mean = m1 / z;
        return { mean, sd: Math.sqrt(Math.max(0, m2 / z - mean * mean)) };
      };
      post = moments();
      // Each forest held out: what the others of its keyframe, and all else, make of its place.
      here.forEach(({ f, node }, j) => {
        const without = moments(j);
        heldOut.set(f.id, treesAt(k, node, without.mean, without.sd));
      });
      // Then the place itself. A forest bounds the warmest month there, and the aridity, whatever the Earth's mean
      // warmth was: so each is asked with that warmth as it stood before the forests, and its spread as part of what
      // else decides the bound.
      for (const { node } of here) {
        const lat = latOf(node);
        const c0 = moved(runNode(runs[k], node)!, lat, first.mean - runs[k].global, response);
        const hot = c0.hot + local[k].warmMean[node];
        const warm = above(hot, local[k].warmSd[node], rule.polar, Math.hypot(error.swing_sd, warmingAt(response, lat) * first.sd), p.forest_slip);
        const l = Math.log(Math.max(0.05, c0.aridity)) + local[k].wetMean[node];
        const wet = above(l, local[k].wetSd[node], Math.log(rule.desert), Math.abs(wettingAt(response, lat)) * first.sd, p.forest_slip);
        tellNear(k, node, 'warm', warm.mean - hot, warm.sd);
        tellNear(k, node, 'wet', wet.mean - l, wet.sd);
      }
    }
    const r4 = (x: { mean: number; sd: number }) => ({ mean: round(x.mean, 4), sd: round(x.sd) });
    warmths.push({ ...(first.prior ? { prior: r4(first.prior) } : {}), ...(first.seen ? { seen: r4(first.seen) } : {}), ...(here.length ? { forests: { n: here.length, ...r4(first) } } : {}), ...r4(post), run: round(runs[k].global, 4) });
    // Each member keeps its place among the members: its CO₂'s warmth and its draw of the balance's error, as a score.
    const c = causes[k];
    memberWarmth.push(
      Array.from({ length: p.members }, (_, m) => {
        const own = m === 0 ? 0 : sample({ kind: 'normal', mean: 0, sd: 1 }, 'model:earth/climate-conditioned#balance', m);
        const z = first.prior && c ? (c[m] - c[0] + balanceSd * own) / first.prior.sd : own;
        return round(post.mean + post.sd * z, 4);
      }),
    );
  });

  // ---- The climate at every node
  const keys: ChanceKey[] = ages.map((age, k) => {
    const central = new Float32Array(N * 4).fill(NaN);
    const warmSd = new Float32Array(N);
    const wetSd = new Float32Array(N);
    const chances = new Float32Array(N * CLASSES.length);
    const toldWarm = new Float32Array(N);
    const toldWet = new Float32Array(N);
    const shift = warmths[k].mean - runs[k].global;
    for (let n = 0; n < N; n++) {
      const run = runNode(runs[k], n);
      if (!run) continue;
      const lat = latOf(n);
      const c = nudged(moved(run, lat, shift, response), local[k].warmMean[n], local[k].wetMean[n]);
      const s: Spreads = { warm: Math.hypot(warmingAt(response, lat) * warmths[k].sd, local[k].warmSd[n]), swing: error.swing_sd, wet: Math.hypot(wettingAt(response, lat) * warmths[k].sd, local[k].wetSd[n]) };
      central.set([c.hot, c.cold, c.aridity, c.margin], n * 4);
      warmSd[n] = s.warm;
      wetSd[n] = s.wet;
      chances.set(classChances(c, s, rule), n * CLASSES.length);
      toldWarm[n] = toldOf(sdOf.warm, local[k].warmSd[n]);
      toldWet[n] = toldOf(sdOf.wet, local[k].wetSd[n]);
    }
    return { ageMa: age, olderMa: edges[k].older, youngerMa: edges[k].younger, warmth: warmths[k], members: memberWarmth[k], central, warmSd, wetSd, chances, found: founds[k], toldWarm, toldWet };
  });
  log(`climate-chance   conditioned in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // ---- How the beds held out are told
  const scores = {} as Record<Pair, PairScores>;
  const tileScore = {} as Record<Pair, { model: Guess[][]; smoother: Guess[][]; alone: Guess[][] }>;
  for (const pair of PAIRS) {
    const byKey = byKeyOf[pair];
    const told = tolds[pair];
    const rows = rowsOf[pair].filter((r) => told[r.k]);
    const f = fits[pair];
    const guess = (r: Row, h: Held | 'none', level = f.levels[r.k]): Guess => {
      const e = f.slope * (r.x - f.at) + level;
      const [m, l] = h === 'none' ? [0, 0] : r[h];
      return { share: shareNear(e, m, l, f.own).share, was: r.more, w: r.w };
    };
    // An era held out: a keyframe with those it shares a level with, some fifty million years. Nothing found, and its
    // level from the keyframes beyond, as many again either side, where they have beds enough of both kinds.
    const heldKeys: number[] = [];
    const levelWithout = new Map<number, number>();
    for (let k = Math.floor(p.span_every / 2); k < ages.length; k += p.span_every) {
      if (!told[k]) continue;
      const far = beyond(k, p.pool, ages.length).flatMap((j) => byKey[j]);
      if (Math.min(far.reduce((s, r) => s + (r.more ? r.w : 0), 0), far.reduce((s, r) => s + (r.more ? 0 : r.w), 0)) < p.level_min) continue;
      heldKeys.push(k);
      levelWithout.set(k, levelOver(far, f.slope / flattening(f.own), f.at) * flattening(f.own));
    }
    const spans = (of: (r: Row, k: number) => Guess): Guess[] => heldKeys.flatMap((k) => byKey[k].map((r) => of(r, k)));
    const model: HeldScores = {
      node: scoreOf(rows.map((r) => guess(r, 'cell'))),
      tile: scoreOf(rows.map((r) => guess(r, 'tile'))),
      block: scoreOf(rows.map((r) => guess(r, 'block'))),
      span: scoreOf(spans((r, k) => guess(r, 'none', levelWithout.get(k)!))),
    };
    // The smoother with no causes: the same beds by latitude and time alone, its own spread fitted the same way.
    const smoother = new Smoother(byKey, grid, p);
    const out = { cell: leftOut(byKey, (n) => n), tile: leftOut(byKey, tile), block: leftOut(byKey, block) };
    const groupOf = { cell: (n: number) => n, tile, block };
    const flat = (r: Row, h: Held) => smoother.expected(r, out[h].get(`${r.k}:${groupOf[h](r.node)}`) ?? []);
    const cache = { cell: rows.map((r) => flat(r, 'cell')), tile: rows.map((r) => flat(r, 'tile')), block: rows.map((r) => flat(r, 'block')) };
    const smooth = (own: number, h: Held): Guess[] => rows.map((r, i) => ({ share: shareNear(cache[h][i] * flattening(own), r[h][0], r[h][1], own).share, was: r.more, w: r.w }));
    const total = (gs: Guess[]) => gs.reduce((s, g) => s + g.w * Math.log(Math.max(0.001, Math.min(0.999, g.was ? g.share : 1 - g.share))), 0);
    smoother.own = round(Math.exp(highest((v) => total(smooth(Math.exp(v), 'cell')) + total(smooth(Math.exp(v), 'tile')), Math.log(0.02), Math.log(30), 20)));
    const smoothed: HeldScores = {
      node: scoreOf(smooth(smoother.own, 'cell')),
      tile: scoreOf(smooth(smoother.own, 'tile')),
      block: scoreOf(smooth(smoother.own, 'block')),
      span: scoreOf(spans((r, k) => ({ share: expit(smoother.expected(r, [], beyond(k, p.pool, ages.length))), was: r.more, w: r.w }))),
    };
    scores[pair] = { model, smoother: smoothed, alone: scoreOf(rows.map((r) => guess(r, 'none'))) };
    // By keyframe, for the stretches of time: each bed with its tile held out.
    const perKey = (gs: Guess[]) => {
      const by: Guess[][] = ages.map(() => []);
      rows.forEach((r, i) => by[r.k].push(gs[i]));
      return by;
    };
    tileScore[pair] = { model: perKey(rows.map((r) => guess(r, 'tile'))), smoother: perKey(smooth(smoother.own, 'tile')), alone: perKey(rows.map((r) => guess(r, 'none'))) };
    const s = scores[pair];
    /** a score as the log has it: where nothing could be held out there is none, and a 0 would read as sure and right */
    const said = (x: { n: number; lpd: number }) => (x.n ? String(x.lpd) : 'none');
    log(`climate-chance   ${pair}: a bed held out with its node is given ${said(s.model.node)} (log of its chance, on average), with its tile ${said(s.model.tile)}, with its block ${said(s.model.block)}, with its era ${said(s.model.span)}; the smoother with no causes ${said(s.smoother.node)}, ${said(s.smoother.tile)}, ${said(s.smoother.block)}, ${said(s.smoother.span)}; the members alone ${said(s.alone)}`);
  }

  // ---- The columns of rock, which it does not read: units with a salt, and with a coal, being laid down at a keyframe.
  const stretchOf = ages.map((a) => Math.floor(a / 100));
  const stretches = [...new Set(stretchOf)].sort((a, b) => a - b);
  let columns: ColumnsCheck | undefined;
  const columnsIn = new Map<number, { dry: number; wet: number; run: number; model: number; pairs: number }>(stretches.map((s) => [s, { dry: 0, wet: 0, run: 0, model: 0, pairs: 0 }]));
  if (input.columns) {
    const carry = carrier(model, input.now);
    const wetRock = new Set(p.wet_lithologies);
    const says = (c: Pick<StrataColumn, 'units'>, age: number): 'dry' | 'wet' | undefined => {
      let salt = false;
      let coal = false;
      for (const u of c.units) {
        if (u.older < age || u.younger > age) continue;
        for (const l of u.lithologies) {
          if (l.type === 'evaporite') salt = true;
          if (l.type === 'organic' && wetRock.has(l.name)) coal = true;
        }
      }
      return salt === coal ? undefined : salt ? 'dry' : 'wet';
    };
    const sum = { dry: 0, wet: 0, runDry: 0, runWet: 0, modelDry: 0, modelWet: 0, pairs: 0, run: 0, model: 0, runDrySide: 0, runWetSide: 0, modelDrySide: 0, modelWetSide: 0 };
    const dryBelow = Math.log(rule.arid);
    ages.forEach((age, k) => {
      const at: { says: 'dry' | 'wet'; run: number; model: number }[] = [];
      input.columns!.points.forEach(([lat0, lon0], i) => {
        const what = says(input.columns!.columns[i], age);
        if (!what) return;
        const where = carry(lat0, lon0, age);
        if (!where) return;
        const n = nodeOf(grid, where[0], where[1]);
        const run = runNode(runs[k], n);
        if (!run || !Number.isFinite(keys[k].central[n * 4 + 2])) return;
        at.push({ says: what, run: wetOf(run), model: Math.log(Math.max(0.05, keys[k].central[n * 4 + 2])) });
      });
      const dry = at.filter((u) => u.says === 'dry');
      const wet = at.filter((u) => u.says === 'wet');
      sum.dry += dry.length;
      sum.wet += wet.length;
      for (const u of dry) {
        sum.runDry += u.run;
        sum.modelDry += u.model;
        if (u.run < dryBelow) sum.runDrySide++;
        if (u.model < dryBelow) sum.modelDrySide++;
      }
      for (const u of wet) {
        sum.runWet += u.run;
        sum.modelWet += u.model;
        if (u.run >= dryBelow) sum.runWetSide++;
        if (u.model >= dryBelow) sum.modelWetSide++;
      }
      // Of every pair of a dry and a wet unit of the keyframe, whether the dry one lies where the land is drier: a tie is half.
      const ordered = (of: 'run' | 'model') => {
        let right = 0;
        for (const d of dry) for (const w of wet) right += d[of] < w[of] ? 1 : d[of] === w[of] ? 0.5 : 0;
        return right;
      };
      const pairs = dry.length * wet.length;
      const [r, m] = [ordered('run'), ordered('model')];
      sum.pairs += pairs;
      sum.run += r;
      sum.model += m;
      const t = columnsIn.get(stretchOf[k])!;
      t.dry += dry.length;
      t.wet += wet.length;
      t.pairs += pairs;
      t.run += r;
      t.model += m;
    });
    columns = { dry: sum.dry, wet: sum.wet, run: { dry: round(sum.runDry / Math.max(1, sum.dry)), wet: round(sum.runWet / Math.max(1, sum.wet)) }, model: { dry: round(sum.modelDry / Math.max(1, sum.dry)), wet: round(sum.modelWet / Math.max(1, sum.wet)) }, ordered: { run: pct(sum.run, sum.pairs), model: pct(sum.model, sum.pairs) }, sides: { run: { dry: pct(sum.runDrySide, sum.dry), wet: pct(sum.runWetSide, sum.wet) }, model: { dry: pct(sum.modelDrySide, sum.dry), wet: pct(sum.modelWetSide, sum.wet) } } };
    log(`climate-chance   the columns of rock, which it does not read: of ${sum.pairs.toLocaleString('en-US')} pairs of a unit with salt and one with coal at a keyframe, the salt lies where the land is drier in ${Math.round(columns.ordered.model * 100)}% by the model, ${Math.round(columns.ordered.run * 100)}% by the run; ${Math.round(columns.sides.model.dry * 100)}% of the units with salt lie on ground the model has arid and ${Math.round(columns.sides.model.wet * 100)}% of those with coal on ground it has not, ${Math.round(columns.sides.run.dry * 100)}% and ${Math.round(columns.sides.run.wet * 100)}% by the run`);
  }

  // ---- The fossil forests, each against what the model makes of its place without it
  const chancesAt = (k: number, n: number) => Array.from(keys[k].chances.subarray(n * CLASSES.length, (n + 1) * CLASSES.length));
  const forests: ForestCheck[] | undefined = input.forests
    ? forestsAt.flatMap((here, k) =>
        here.map(({ f, node }) => {
          const cls = climateClass(runNode(runs[k], node)!, rule);
          return { id: f.id, ageMa: f.ageMa, keyframeMa: f.keyframeMa, lat: f.lat, lon: f.lon, run: cls, runTrees: TREES.includes(cls), trees: round(heldOut.get(f.id) ?? 0), read: round(treesOf(chancesAt(k, node))) };
        }),
      )
    : undefined;
  if (forests?.length) log(`climate-chance   ${forests.length} fossil forests: held out, each is given ${Math.round((forests.reduce((s, f) => s + f.trees, 0) / forests.length) * 100)}% for a climate that bears trees on average, and ${Math.round((forests.reduce((s, f) => s + f.read, 0) / forests.length) * 100)}% once read; the run's class bears trees at ${forests.filter((f) => f.runTrees).length}`);

  // ---- Held to the present, where the climate is measured
  const presentCheck = ((): PresentCheck => {
    const sums = { area: 0, sameRun: 0, sameBeds: 0, sameModel: 0, point: 0, spread: 0, beds: 0, model: 0, hot: 0, cold: 0, wet: 0, wetArea: 0 };
    const sq = { hot: [0, 0, 0], cold: [0, 0, 0], wet: [0, 0, 0] };
    const likeliest = (cs: number[]) => CLASSES[cs.indexOf(Math.max(...cs))];
    const byBlock = new Map<number, Now[]>();
    for (const q of nows) byBlock.set(q.block, [...(byBlock.get(q.block) ?? []), q]);
    for (const [b, inside] of byBlock) {
      // The run's spread told from the other blocks, and how often the run's class is the measured one there.
      const others = nows.filter((q) => q.block !== b);
      const e = errorOver(others);
      const s: Spreads = { warm: Math.hypot(e.mean_bias, e.mean_sd), swing: Math.hypot(e.swing_bias, e.swing_sd), wet: Math.hypot(e.wet_bias, e.wet_sd) };
      const right = others.reduce((t, q) => t + (climateClass(q.run, rule) === climateClass(q.seen, rule) ? q.area : 0), 0) / others.reduce((t, q) => t + q.area, 0);
      for (const q of inside) {
        const truth = climateClass(q.seen, rule);
        const runClass = climateClass(q.run, rule);
        // The run with its spread and nothing else: no bed read, and the warmth the run's own, which here is the measured one.
        const cs = classChances(q.run, s, rule);
        // The same with the beds of the youngest keyframe read: the run moved by what they say, its spread narrowed by as much.
        const narrowed = (before: number, after: number, all: number) => (before > 0 ? (all * after) / before : all);
        const bc = nudged(q.run, local[0].warmMean[q.node], local[0].wetMean[q.node]);
        const beds = classChances(bc, { warm: narrowed(sdOf.warm, local[0].warmSd[q.node], s.warm), swing: s.swing, wet: narrowed(sdOf.wet, local[0].wetSd[q.node], s.wet) }, rule);
        const model = chancesAt(0, q.node);
        const a = q.area;
        sums.area += a;
        if (runClass === truth) sums.sameRun += a;
        if (likeliest(beds) === truth) sums.sameBeds += a;
        if (likeliest(model) === truth) sums.sameModel += a;
        sums.point += a * Math.log(runClass === truth ? right : (1 - right) / (CLASSES.length - 1));
        sums.spread += a * Math.log(Math.max(0.001, cs[CLASSES.indexOf(truth)]));
        sums.beds += a * Math.log(Math.max(0.001, beds[CLASSES.indexOf(truth)]));
        sums.model += a * Math.log(Math.max(0.001, model[CLASSES.indexOf(truth)]));
        const inBand = (x: number, [lo, hi]: [number, number]) => x >= lo && x <= hi;
        if (inBand(q.seen.hot, band(q.run.hot, monthSd(s)))) sums.hot += a;
        if (inBand(q.seen.cold, band(q.run.cold, monthSd(s)))) sums.cold += a;
        const mc: Central = { hot: keys[0].central[q.node * 4], cold: keys[0].central[q.node * 4 + 1], aridity: keys[0].central[q.node * 4 + 2], margin: keys[0].central[q.node * 4 + 3] };
        sq.hot[0] += a * (q.run.hot - q.seen.hot) ** 2;
        sq.hot[1] += a * (bc.hot - q.seen.hot) ** 2;
        sq.hot[2] += a * (mc.hot - q.seen.hot) ** 2;
        sq.cold[0] += a * (q.run.cold - q.seen.cold) ** 2;
        sq.cold[1] += a * (bc.cold - q.seen.cold) ** 2;
        sq.cold[2] += a * (mc.cold - q.seen.cold) ** 2;
        if (!capped(q.run) && !capped(q.seen)) {
          sums.wetArea += a;
          if (inBand(wetOf(q.seen), band(wetOf(q.run), s.wet))) sums.wet += a;
          sq.wet[0] += a * (wetOf(q.run) - wetOf(q.seen)) ** 2;
          sq.wet[1] += a * (Math.log(Math.max(0.05, bc.aridity)) - wetOf(q.seen)) ** 2;
          sq.wet[2] += a * (Math.log(Math.max(0.05, mc.aridity)) - wetOf(q.seen)) ** 2;
        }
      }
    }
    const root = (xs: number[], area: number) => xs.map((x) => round(Math.sqrt(x / area))) as [number, number, number];
    return {
      nodes: nows.length,
      same: { run: pct(sums.sameRun, sums.area), beds: pct(sums.sameBeds, sums.area), model: pct(sums.sameModel, sums.area) },
      lpd: { point: round(sums.point / sums.area, 4), spread: round(sums.spread / sums.area, 4), beds: round(sums.beds / sums.area, 4), model: round(sums.model / sums.area, 4) },
      within: { hot: pct(sums.hot, sums.area), cold: pct(sums.cold, sums.area), aridity: pct(sums.wet, sums.wetArea) },
      rms: { hot: root(sq.hot, sums.area), cold: root(sq.cold, sums.area), wet: root(sq.wet, sums.wetArea) },
    };
  })();
  log(`climate-chance   held to the present, each block's spread told from the others: the measured warmest month lies in the band nine members in ten do at ${Math.round(presentCheck.within.hot * 100)}% of the land, the coldest at ${Math.round(presentCheck.within.cold * 100)}%, the aridity at ${Math.round(presentCheck.within.aridity * 100)}%; the measured class is given ${presentCheck.lpd.spread} (log of its chance, on average) by the run with its spread, ${presentCheck.lpd.point} by the run's class as a point, ${presentCheck.lpd.beds} with the beds of its span read, and ${presentCheck.lpd.model} by the model with the warmth of the span too; the likeliest class is the measured one on ${Math.round(presentCheck.same.run * 100)}% of the land by the run, ${Math.round(presentCheck.same.beds * 100)}% with the beds and ${Math.round(presentCheck.same.model * 100)}% by the model`);

  // ---- How much of the land it reaches, and moves
  const land = { area: 0, reached: 0, changed: 0, sure: 0 };
  const perKey = ages.map((_, k) => {
    const s = { area: 0, reached: 0, changed: 0 };
    for (let n = 0; n < N; n++) {
      if (!(runs[k].plate[n] & LAND_BIT) || !Number.isFinite(keys[k].central[n * 4])) continue;
      const a = areaOf(n);
      const cs = chancesAt(k, n);
      const top = Math.max(...cs);
      const run = runNode(runs[k], n)!;
      s.area += a;
      if (restsOnBeds(Math.max(keys[k].toldWarm[n], keys[k].toldWet[n]))) s.reached += a;
      if (CLASSES[cs.indexOf(top)] !== climateClass(run, rule)) s.changed += a;
      land.sure += a * top;
    }
    land.area += s.area;
    land.reached += s.reached;
    land.changed += s.changed;
    return { reached: pct(s.reached, s.area), changed: pct(s.changed, s.area) };
  });

  // ---- Stretches of time: a hundred million years of keyframes each
  const mean = (gs: Guess[]) => {
    const s = scoreOf(gs);
    return s.n ? s.lpd : 0;
  };
  const through: ChanceStretch[] = stretches.map((s) => {
    const ks = ages.map((_, k) => k).filter((k) => stretchOf[k] === s);
    const t = columnsIn.get(s)!;
    const area = { all: 0, reached: 0 };
    for (const k of ks) {
      for (let n = 0; n < N; n++) {
        if (!(runs[k].plate[n] & LAND_BIT) || !Number.isFinite(keys[k].central[n * 4])) continue;
        area.all += areaOf(n);
        if (restsOnBeds(Math.max(keys[k].toldWarm[n], keys[k].toldWet[n]))) area.reached += areaOf(n);
      }
    }
    return {
      olderMa: Math.max(...ks.map((k) => ages[k])),
      youngerMa: Math.min(...ks.map((k) => ages[k])),
      keyframes: ks.length,
      pairs: Object.fromEntries(
        PAIRS.map((pair) => {
          const of = (which: 'model' | 'smoother' | 'alone') => mean(ks.flatMap((k) => tileScore[pair][which][k]));
          const all = ks.flatMap((k) => (tolds[pair][k] ? byKeyOf[pair][k] : []));
          return [pair, { more: Math.round(all.reduce((a, r) => a + (r.more ? r.w : 0), 0)), less: Math.round(all.reduce((a, r) => a + (r.more ? 0 : r.w), 0)), model: of('model'), smoother: of('smoother'), alone: of('alone') }];
        }),
      ) as ChanceStretch['pairs'],
      ...(input.columns ? { columns: { dry: t.dry, wet: t.wet, run: pct(t.run, t.pairs), model: pct(t.model, t.pairs) } } : {}),
      reached: pct(area.reached, area.all),
    };
  });

  // ---- The files
  const files = new Map<string, Uint8Array | string>();
  const gridOut = { lon0: -180, lat0: 90, step: grid.step, nx: grid.nx, ny: grid.ny, wrap: true };
  const keyframes: ChanceKeyframe[] = keys.map((key, k) => {
    const central = new Uint8Array(N * 4);
    const spread = new Uint8Array(N * 2);
    const chances = new Uint8Array(N * CLASSES.length);
    const found = new Uint8Array(N * PAIRS.length * 2);
    const told = new Uint8Array(N * 2);
    for (let n = 0; n < N; n++) {
      if (!Number.isFinite(key.central[n * 4])) continue;
      central.set(encodeNode({ hot: key.central[n * 4], cold: key.central[n * 4 + 1], aridity: key.central[n * 4 + 2], margin: key.central[n * 4 + 3] }), n * 4);
      spread[n * 2] = warmSdByte(key.warmSd[n]);
      spread[n * 2 + 1] = wetSdByte(key.wetSd[n]);
      // The chances as bytes that add to 255: the largest takes what rounding leaves.
      let top = 0;
      let sum = 0;
      for (let c = 0; c < CLASSES.length; c++) {
        const b = chanceByte(key.chances[n * CLASSES.length + c]);
        chances[n * CLASSES.length + c] = b;
        sum += b;
        if (key.chances[n * CLASSES.length + c] > key.chances[n * CLASSES.length + top]) top = c;
      }
      chances[n * CLASSES.length + top] = Math.max(0, Math.min(255, chances[n * CLASSES.length + top] + 255 - sum));
      PAIRS.forEach((pair, i) => {
        found[n * PAIRS.length * 2 + i * 2] = tolds[pair][k] ? findsByte(key.found[pair].more[n]) : 0;
        found[n * PAIRS.length * 2 + i * 2 + 1] = tolds[pair][k] ? findsByte(key.found[pair].less[n]) : 0;
      });
      told[n * 2] = chanceByte(key.toldWarm[n]);
      told[n * 2 + 1] = chanceByte(key.toldWet[n]);
    }
    const file = `climate-chance/${key.ageMa}.lwt`;
    files.set(file, encodeTile({ format: 'lightworld-climate-chance-key@1', ageMa: key.ageMa, grid: gridOut, central: 0, spread: 1, chances: 2, found: 3, told: 4, plate: 5 }, [central, spread, chances, found, told, runs[k].plate], stableStringify));
    const weigh = (pair: Pair, more: boolean) => Math.round(beds[k][pair].reduce((s, b) => s + (b.more === more ? b.w : 0), 0) * 10) / 10;
    return {
      ageMa: key.ageMa,
      olderMa: key.olderMa,
      youngerMa: key.youngerMa,
      file,
      warmth: key.warmth,
      members: key.members,
      pairs: Object.fromEntries(PAIRS.map((pair) => [pair, { level: tolds[pair][k] ? round(fits[pair].levels[k], 4) : 0, told: tolds[pair][k], more: weigh(pair, true), less: weigh(pair, false) }])) as ChanceKeyframe['pairs'],
      ...perKey[k],
    };
  });
  const index: ChanceIndex = {
    format: 'lightworld-climate-chance@1',
    field: about.field,
    title: about.title,
    description: about.description,
    beds: about.beds,
    climate: about.climate,
    source: about.source,
    sourceRecord: about.sourceRecord,
    grid: gridOut,
    coverage: [fromMa(Math.max(...ages)), fromMa(Math.min(...ages))],
    rule: ruleOut,
    classes: [...CLASSES],
    thresholds: rule,
    keyframes,
    warmth: warmthScore,
    scores,
    ...(columns ? { columns } : {}),
    ...(forests ? { forests } : {}),
    present: presentCheck,
    through,
    globe: { reached: pct(land.reached, land.area), changed: pct(land.changed, land.area), sure: pct(land.sure, land.area) },
  };
  files.set('climate-chance/index.json', stableStringify(index));
  log(`climate-chance   over all keyframes what was found has told a quarter or more of the square of a spread on ${(index.globe.reached * 100).toFixed(1)}% of the land; the likeliest class is not the run's on ${(index.globe.changed * 100).toFixed(1)}%; built in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return { index, files, keys };
}
