// The months of a climate at a place and a height (model:earth/lapse-rate). Each climate field's keyframes keep, at
// every node where the model has land, its twelve months of temperature and rain, and the height those months stand
// for: the model's own ground under the node. The build writes them in tiles of a few degrees (months/…), and a scene
// reads the node it stands on, of the finest climate that covers its time. Brought to any other height by the air's
// lapse rate, the months say what the climate is there: its class, so where the trees stop and the ice begins, and in
// any month how much snow lies, by the water balance's own rules (core/water.ts).
//
// What else a climate's source says of a node, its cloudiness, humidity, wind and albedo by month and its vegetation by
// year, is kept beside the months in tiles of parts (`PartsTile`), each part a field of its own.
import { climateClass, reduceMonths, type ClimateClass, type ClimateNode, type ClimateRule } from './climate.ts';
import { waterYear, type WaterParams } from './water.ts';

/** Twelve months, January first: mean temperature, °C, and precipitation, mm. */
export interface Months {
  t: number[];
  p: number[];
}

/** One tile's nodes: the box they are on, and each keyframe's land nodes in it, as indices into the arrays after it. */
export interface MonthsTileHeader {
  format: 'lightworld-months@1';
  field: string;
  /** the box: its first node's latitude and longitude, the grid's step, and how many nodes across and down; its rains as `encodeRain` keeps them */
  grid: { lat0: number; lon0: number; step: number; nx: number; ny: number };
  /** each keyframe: its age, the age whose coordinates its nodes are on, and the arrays of its land nodes */
  keyframes: { ageMa: number; frameMa: number; node: number; t: number; p: number; z: number }[];
}

/** A climate field's months, as the tileset lists them. */
export interface MonthsSet {
  field: string;
  title: string;
  /** every keyframe's age, Ma, youngest first */
  keyframesMa: number[];
  /** the age whose coordinates every keyframe's nodes are on, where they share one (0 for today's); each its own if not */
  frameMa?: number;
  /** the grid's step and the tiles' size, degrees, and each tile's file by its key (`tileKey`) */
  step: number;
  tile_deg: number;
  tiles: Record<string, string>;
  /** what else its source says of each node, in tiles of their own beside these (`PartsTile`) */
  parts?: PartsSet;
}


/** What a scene reads of the climate at a height (field:earth/climate-at-height): the sets, finest in time first. */
export interface MonthsInfo {
  field: string;
  title: string;
  model?: string;
  /** how fast the air cools upward, °C a kilometre */
  lapse: number;
  /** the water balance's rules (field:earth/runoff), by which snow falls, lies and melts */
  water: WaterParams;
  sets: MonthsSet[];
}

/**
 * Temperatures are kept in half degrees above -64 °C; rains by their square root, in quarters, which keeps a dry month
 * to a fraction of a millimetre and a monsoon's to a few per cent, up to 4 m a month; heights in metres.
 */
export const T_SCALE = 2;
export const T_OFFSET = 128;
export const P_ROOT = 4;
export const encodeRain = (mm: number) => Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, mm)) * P_ROOT)));
export const decodeRain = (code: number) => (code / P_ROOT) ** 2;

/**
 * What else a climate's source says of a node, beside its months of temperature and rain. Each is a field of its own
 * (world/fields/earth, read `as: months`), kept where its source has it, and nothing brings it to another height.
 * By month, January first, as the mean of the source's land cells at the node:
 *
 *   cloud       cloudiness, % of the sky
 *   humidity    relative humidity, %
 *   wind_speed  wind speed, m/s: the mean of the speed, whichever way it blew
 *   u, v        the wind, m/s toward the east and toward the north: the mean of the wind as a vector, whose speed is no
 *               more than the mean speed, and far less where the wind turns
 *   albedo      the share of sunlight the surface sends back, 0–1
 *
 * and by year, for each of the four cells of its source that a node is the mean of (north-west, north-east, south-west
 * and south-east of it), since a class cannot be averaged and the numbers that go with it should not be:
 *
 *   biome       the class of vegetation, as its source numbers the classes
 *   leaf        leaf area index, in its source's numbers
 *   npp         net primary production, in its source's numbers
 */
export const MONTHS_PARTS = ['cloud', 'humidity', 'wind_speed', 'u', 'v', 'albedo', 'biome', 'leaf', 'npp'] as const;
export type MonthsPart = (typeof MONTHS_PARTS)[number];

/** How a part is kept: how many values a node has, in what, the code of no value, and the codes of the others. */
export interface PartPacking {
  /** twelve months, or the four cells of the source at a node */
  per: 12 | 4;
  type: 'uint8' | 'uint16';
  none: number;
  /** a value's code; a value the codes cannot hold throws, so that none is quietly bent to fit */
  encode: (x: number) => number;
  decode: (code: number) => number;
  /** how far a value read back may be from the value kept */
  tolerance: (x: number) => number;
}

const within = (x: number, lo: number, hi: number, what: string): number => {
  if (!(x >= lo && x <= hi)) throw new Error(`${what} ${x} is outside ${lo} to ${hi}, which is all its code holds`);
  return x;
};

/** A share out of `whole` (100 for per cents, 1 for a fraction), in half per cents: 0 to 200, and 255 for none. */
const halfPercents = (whole: number, what: string): PartPacking => ({
  per: 12,
  type: 'uint8',
  none: 255,
  // The sources cap their shares at the bounds; a hair beyond one is rounding, and anything more is not a share.
  encode: (x) => Math.round((Math.max(0, Math.min(whole, within(x, -1e-4 * whole, whole * (1 + 1e-4), what))) / whole) * 200),
  decode: (c) => (c * whole) / 200,
  tolerance: () => whole / 400,
});

/**
 * A component of the wind is kept by its square root, as the rain is, with its sign: to a tenth of a metre a second in a
 * light wind and a third in a gale. Its codes reach ±178 m/s, far beyond any wind, because one source's winds are given
 * on a pressure level that lies under high ground, and are kept as given (field:earth/wind).
 */
export const WIND_ROOT = 9.5;

/** A whole number as its source gives it, in sixteen bits: 65535 for none. */
const wholeNumber = (what: string): PartPacking => ({
  per: 4,
  type: 'uint16',
  none: 65535,
  encode: (x) => Math.round(within(x, 0, 65534, what)),
  decode: (c) => c,
  tolerance: () => 0.5,
});

/**
 * How each part is kept. Shares in half per cents; a wind's speed in tenths of a metre a second, to 25.4; its components
 * by their square roots (`WIND_ROOT`); a class as its number, to 254; leaf area and production as whole numbers.
 */
export const PARTS: Record<MonthsPart, PartPacking> = {
  cloud: halfPercents(100, 'a cloudiness of'),
  humidity: halfPercents(100, 'a relative humidity of'),
  wind_speed: { per: 12, type: 'uint8', none: 255, encode: (x) => Math.round(within(x, 0, 25.4, 'a wind speed of') * 10), decode: (c) => c / 10, tolerance: () => 0.05 },
  u: windComponent(),
  v: windComponent(),
  albedo: halfPercents(1, 'an albedo of'),
  biome: { per: 4, type: 'uint8', none: 255, encode: wholeClass, decode: (c) => c, tolerance: () => 0 },
  leaf: wholeNumber('a leaf area of'),
  npp: wholeNumber('a production of'),
};

function wholeClass(x: number): number {
  if (Math.round(x) !== x) throw new Error(`a class numbered ${x} is not a whole number`);
  return within(x, 0, 254, 'a class numbered');
}

function windComponent(): PartPacking {
  const most = (127 / WIND_ROOT) ** 2;
  return {
    per: 12,
    type: 'uint8',
    none: 0,
    encode: (x) => 128 + Math.sign(x) * Math.round(Math.sqrt(Math.abs(within(x, -most, most, 'a wind of'))) * WIND_ROOT),
    decode: (c) => Math.sign(c - 128) * ((c - 128) / WIND_ROOT) ** 2,
    // Half a step of the square root, either way.
    tolerance: (x) => Math.sqrt(Math.abs(x)) / WIND_ROOT + 0.25 / WIND_ROOT ** 2,
  };
}

/** A part as a tileset describes it: the field it is, and what its numbers are. */
export interface PartInfo {
  part: MonthsPart;
  field: string;
  title: string;
  quantity?: string;
  unit?: string;
  /** the dataset it is read from */
  source: string;
  /** for a part of classes: each class's name by its number, as its source names them */
  classes?: Record<string, string>;
  /** what one of its source's numbers is in the unit, where they are not in it (the field's `params.scale`) */
  scale?: number;
}

/**
 * The parts of a climate's months, as the tileset lists them: which there are, and where their tiles are. A tile of
 * parts holds a span of the keyframes only, so that a scene, which reads one keyframe, fetches a file within the size a
 * tile of months was already allowed. Every tile of the months has a file in every span: `<dir>/<span>/<key>.lwt`.
 */
export interface PartsSet {
  /** each part its tiles keep, in the order of `MONTHS_PARTS` */
  list: PartInfo[];
  dir: string;
  /** each span's keyframes, Ma: the youngest span first */
  chunks: number[][];
}

/** The file of a set's parts that holds a keyframe of a tile: undefined if the set has no parts, no such keyframe or no such tile. */
export function partsFile(set: MonthsSet, ageMa: number, key: string): string | undefined {
  const c = set.parts?.chunks.findIndex((ks) => ks.some((k) => Math.abs(k - ageMa) < 1e-9)) ?? -1;
  return c < 0 || !set.tiles[key] ? undefined : `${set.parts!.dir}/${c}/${key}.lwt`;
}

/** One tile of parts: the box its nodes are on, as a tile of months has it, and each keyframe's parts as indices into the arrays. */
export interface PartsTileHeader {
  format: 'lightworld-months-parts@1';
  field: string;
  grid: MonthsTileHeader['grid'];
  /** each keyframe of the tile's span: its land nodes, as its months' tile has them, and each part's array */
  keyframes: { ageMa: number; frameMa: number; node: number; parts: Partial<Record<MonthsPart, number>> }[];
}

/** The year's vegetation in one cell of the source, in its source's numbers. */
export interface CellVegetation {
  biome: number;
  leaf?: number;
  npp?: number;
}

/**
 * What a node's parts say at a place: each month's value, null where the source gives none for it; and the vegetation of
 * the source's cell the place is in, or of the nearest of the node's cells that has one, with all four (`cells`:
 * north-west, north-east, south-west, south-east; null where the source has no land).
 */
export interface NodeParts {
  cloud?: (number | null)[];
  humidity?: (number | null)[];
  wind_speed?: (number | null)[];
  wind?: { u: (number | null)[]; v: (number | null)[] };
  albedo?: (number | null)[];
  vegetation?: CellVegetation & { cells: (CellVegetation | null)[] };
}

/** The tile a node is in, by its own latitude and longitude. */
export function tileKey(lon: number, lat: number, deg: number): string {
  const i = Math.floor((((lon + 180) % 360) + 360) % 360 / deg);
  const j = Math.max(0, Math.min(Math.floor((90 - lat) / deg), Math.ceil(180 / deg) - 1));
  return `${i}_${j}`;
}

/** How far from a place its node is looked for, in steps of the grid. */
export const NEAR_STEPS = 1.5;

/** Every tile a node within `NEAR_STEPS` of a place could be in. */
export function tilesNear(lat: number, lon: number, set: Pick<MonthsSet, 'step' | 'tile_deg'>): string[] {
  const r = set.step * NEAR_STEPS;
  const deg = set.tile_deg;
  const latLo = Math.max(-90, lat - r);
  const latHi = Math.min(90, lat + r);
  const maxAbsLat = Math.max(Math.abs(latLo), Math.abs(latHi));
  const fullRing = maxAbsLat >= 90 - 1e-6;
  const rl = fullRing ? 180 : Math.min(180, r / Math.max(1e-6, Math.cos((maxAbsLat * Math.PI) / 180)));
  const out = new Set<string>();
  const lats: number[] = [];
  for (let la = latLo; la < latHi - 1e-9; la += deg) lats.push(la);
  lats.push(latHi);
  const lons: number[] = [];
  if (fullRing || rl >= 180) {
    for (let lo = -180; lo < 180 - 1e-9; lo += deg) lons.push(lo);
  } else {
    for (let lo = lon - rl; lo < lon + rl - 1e-9; lo += deg) lons.push(lo);
    lons.push(lon + rl);
  }
  for (const la of lats) for (const lo of lons) out.add(tileKey(lo, la, deg));
  return [...out].sort();
}

/** Spherical angular distance squared (in degrees²) between two (lat, lon) points. */
function arcDegSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const sLat = Math.sin(dLat / 2);
  const sLon = Math.sin(dLon / 2);
  const h = sLat * sLat + Math.cos(lat1 * r) * Math.cos(lat2 * r) * sLon * sLon;
  const deg = (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / r;
  return deg * deg;
}

/** The nearest land node to a place among some tiles, at a keyframe. */
export function nearestNode(tiles: MonthsTile[], ageMa: number, lat: number, lon: number): ReturnType<MonthsTile['at']> {
  let best: ReturnType<MonthsTile['at']>;
  let bestD = Infinity;
  for (const t of tiles) {
    const a = t.at(ageMa, lat, lon);
    if (a && a.d < bestD) {
      bestD = a.d;
      best = a;
    }
  }
  return best;
}

/** The set of the finest climate that covers an age, and its keyframe nearest it. */
export function monthsKeyframe(info: MonthsInfo, ageMa: number): { set: MonthsSet; ageMa: number } | undefined {
  for (const set of info.sets) {
    const ks = set.keyframesMa;
    if (!ks.length) continue;
    const young = Math.min(...ks);
    const old = Math.max(...ks);
    if (ageMa > old + 1e-9 && set !== info.sets[info.sets.length - 1]) continue;
    const a = Math.max(young, Math.min(old, ageMa));
    return { set, ageMa: ks.reduce((x, y) => (Math.abs(y - a) < Math.abs(x - a) ? y : x)) };
  }
  return undefined;
}

/** The node of a place, from a decoded tile: the months there, and the height above the sea they stand for. */
export class MonthsTile {
  constructor(
    readonly header: MonthsTileHeader,
    private arrays: ArrayLike<number>[],
  ) {}

  /** The nearest land node of the tile within `NEAR_STEPS` of a place, at a keyframe, and how far (in degrees, squared); undefined if there is none. */
  at(ageMa: number, lat: number, lon: number): { months: Months; height: number; lat: number; lon: number; d: number } | undefined {
    const k = this.header.keyframes.find((x) => Math.abs(x.ageMa - ageMa) < 1e-9);
    if (!k) return undefined;
    const g = this.header.grid;
    const node = this.arrays[k.node];
    const { q: best, d: bestD } = nearestOf(g, node, lat, lon);
    if (best < 0) return undefined;
    const t = this.arrays[k.t];
    const p = this.arrays[k.p];
    const months: Months = { t: [], p: [] };
    for (let m = 0; m < 12; m++) {
      months.t.push((t[best * 12 + m] - T_OFFSET) / T_SCALE);
      months.p.push(decodeRain(p[best * 12 + m]));
    }
    return { months, height: this.arrays[k.z][best], lat: g.lat0 - Math.floor(node[best] / g.nx) * g.step, lon: g.lon0 + (node[best] % g.nx) * g.step, d: bestD };
  }
}

/** The nearest of a keyframe's nodes to a place within `NEAR_STEPS` of it, and how far (in degrees, squared): -1 if there is none. */
function nearestOf(g: MonthsTileHeader['grid'], node: ArrayLike<number>, lat: number, lon: number): { q: number; d: number } {
  let best = -1;
  let bestD = (g.step * NEAR_STEPS) ** 2;
  for (let q = 0; q < node.length; q++) {
    const la = g.lat0 - Math.floor(node[q] / g.nx) * g.step;
    const lo = g.lon0 + (node[q] % g.nx) * g.step;
    const d = arcDegSq(lat, lon, la, lo);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return { q: best, d: bestD };
}

/** A decoded tile of parts: what a climate's source says of the node of a place, beside its months. */
export class PartsTile {
  constructor(
    readonly header: PartsTileHeader,
    private arrays: ArrayLike<number>[],
  ) {}

  /**
   * The parts of the nearest land node of the tile within `NEAR_STEPS` of a place, at a keyframe: the same node as its
   * months' tile gives, since both keep the same nodes. Undefined if the tile has none, or not that keyframe.
   */
  at(ageMa: number, lat: number, lon: number): { parts: NodeParts; lat: number; lon: number; d: number } | undefined {
    const k = this.header.keyframes.find((x) => Math.abs(x.ageMa - ageMa) < 1e-9);
    if (!k) return undefined;
    const g = this.header.grid;
    const node = this.arrays[k.node];
    const { q, d } = nearestOf(g, node, lat, lon);
    if (q < 0) return undefined;
    const nodeLat = g.lat0 - Math.floor(node[q] / g.nx) * g.step;
    const nodeLon = g.lon0 + (node[q] % g.nx) * g.step;
    const value = (part: MonthsPart, i: number): number | null => {
      const code = this.arrays[k.parts[part]!][i];
      return code === PARTS[part].none ? null : PARTS[part].decode(code);
    };
    const months = (part: MonthsPart) => Array.from({ length: 12 }, (_, m) => value(part, q * 12 + m));
    const parts: NodeParts = {};
    for (const part of ['cloud', 'humidity', 'wind_speed', 'albedo'] as const) if (k.parts[part] !== undefined) parts[part] = months(part);
    if (k.parts.u !== undefined && k.parts.v !== undefined) parts.wind = { u: months('u'), v: months('v') };
    if (k.parts.biome !== undefined) {
      const cells = [0, 1, 2, 3].map((c): CellVegetation | null => {
        const biome = value('biome', q * 4 + c);
        if (biome === null) return null;
        const leaf = k.parts.leaf !== undefined ? value('leaf', q * 4 + c) : null;
        const npp = k.parts.npp !== undefined ? value('npp', q * 4 + c) : null;
        return { biome, ...(leaf !== null ? { leaf } : {}), ...(npp !== null ? { npp } : {}) };
      });
      const here = cellNear(cells, g.step, nodeLat, nodeLon, lat, lon);
      if (here) parts.vegetation = { ...here, cells };
    }
    return { parts, lat: nodeLat, lon: nodeLon, d };
  }
}

/** Which of a node's four cells a cell of the source is: 0 north-west, 1 north-east, 2 south-west, 3 south-east of the node. */
export function cellOf(nodeLat: number, nodeLon: number, lat: number, lon: number): number {
  let dl = (lon - nodeLon) % 360;
  if (dl > 180) dl -= 360;
  if (dl < -180) dl += 360;
  return (lat >= nodeLat ? 0 : 2) + (dl >= 0 ? 1 : 0);
}

/** Of a node's four cells, the one a place is in if the source has land there, and otherwise the nearest that has. */
function cellNear<T>(cells: (T | null)[], step: number, nodeLat: number, nodeLon: number, lat: number, lon: number): T | undefined {
  const own = cells[cellOf(nodeLat, nodeLon, lat, lon)];
  if (own) return own;
  let best: T | undefined;
  let bestD = Infinity;
  cells.forEach((c, i) => {
    if (!c) return;
    // The middle of the cell: a quarter of a step from the node, each way.
    const la = Math.max(-90, Math.min(90, nodeLat + (i < 2 ? step / 4 : -step / 4)));
    const lo = nodeLon + (i % 2 ? step / 4 : -step / 4);
    const d = arcDegSq(lat, lon, la, lo);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  });
  return best;
}

/** The parts of the nearest land node to a place among some tiles of parts, at a keyframe. */
export function nearestParts(tiles: PartsTile[], ageMa: number, lat: number, lon: number): ReturnType<PartsTile['at']> {
  let best: ReturnType<PartsTile['at']>;
  let bestD = Infinity;
  for (const t of tiles) {
    const a = t.at(ageMa, lat, lon);
    if (a && a.d < bestD) {
      bestD = a.d;
      best = a;
    }
  }
  return best;
}

/** The months `dz` metres above the height they stand for: the same rain, the air colder by the lapse rate. */
export function atHeight(m: Months, dz: number, lapse: number): Months {
  const d = (lapse * dz) / 1000;
  return { t: m.t.map((x) => x - d), p: m.p };
}

/** The climate's numbers at a height, as the Köppen–Geiger classes read them. */
export function nodeAtHeight(m: Months, dz: number, lapse: number): ClimateNode {
  const h = atHeight(m, dz, lapse);
  return reduceMonths(h.t, h.p);
}

/** The class at a height. */
export function classAtHeight(m: Months, dz: number, lapse: number, rule: ClimateRule): ClimateClass {
  return climateClass(nodeAtHeight(m, dz, lapse), rule);
}

/** The warmest month, 1–12. */
export function warmestMonth(m: Months): number {
  let best = 0;
  for (let i = 1; i < 12; i++) if (m.t[i] > m.t[best]) best = i;
  return best + 1;
}

/**
 * The snow lying in the middle of a month, mm of water: the mean of what lay at the end of the month before and at its
 * own end, in a year the water balance has run until it comes round. `elevation` is the height above the sea, which
 * sets the snow's threshold.
 */
export function snowInMonth(m: Months, month: number, lat: number, elevation: number, w: WaterParams): number {
  const end: number[] = new Array(12).fill(0);
  waterYear(m.t, m.p, lat, elevation, w, 5, end);
  const i = month - 1;
  return (end[(i + 11) % 12] + end[i]) / 2;
}

/**
 * Whether snow covers the ground at a height in a month: at least `mm` of it lies, and the month is colder than the
 * water balance's threshold for rain alone. The model melts at most a share of the snow in a month, so a trace of the
 * winter's lasts into a summer far too warm to hold it; a month that warm is drawn bare.
 */
export function snowCovers(m: Months, month: number, lat: number, elevation: number, w: WaterParams, mm: number): boolean {
  return m.t[month - 1] < w.t_rain && snowInMonth(m, month, lat, elevation, w) >= mm;
}

/**
 * The lowest height, in `step`s from `lo` to `hi` above the height the months stand for, at which snow covers the ground
 * in a month (`snowCovers`): Infinity if it does nowhere in that range. The elevation above the sea of a height is `sea`
 * more.
 */
export function snowLine(m: Months, month: number, lat: number, sea: number, w: WaterParams, lapse: number, mm: number, lo: number, hi: number, step: number): number {
  let prev = -Infinity;
  for (let dz = lo; dz <= hi + 1e-9; dz += step) {
    if (snowCovers(atHeight(m, dz, lapse), month, lat, dz + sea, w, mm)) {
      if (prev === -Infinity) return dz;
      // Between the last height without and the first with, to a metre.
      let a = prev;
      let b = dz;
      while (b - a > 1) {
        const c = (a + b) / 2;
        if (snowCovers(atHeight(m, c, lapse), month, lat, c + sea, w, mm)) b = c;
        else a = c;
      }
      return b;
    }
    prev = dz;
  }
  return Infinity;
}
