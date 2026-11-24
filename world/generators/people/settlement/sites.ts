// Where a scene's settlements stand, and which land each farms (gen:people/settlement, from version 9). The world says
// how many people a 5′ cell held and how they lived; nobody recorded where in the cell any of their settlements stood, or
// where one's fields ended and the next one's began. This chooses, as the generator's guess and as no claim, by what people
// looked for in a place to live: fresh water within reach, dry ground above the floods, level ground, the better soil, and
// a town near. A settlement takes the best of the places weighed for its cell, by chance in proportion to their worth, and
// no two stand closer than the cell's settlements stand on average allow; the larger ones take the better places. Its
// fields then spread from its houses over the land nearest it by the effort of walking there, through level, dry and
// better ground first, until they are as large as its people farmed, and stop at the water, the steep, and a neighbour's.
//
// Everything is seeded and weighed by where it is on the Earth, not by the scene that draws it, so that two scenes that
// overlap put a settlement in the same place, and give it the same fields, as far as the ground they draw agrees.
import type { FieldUse } from '../../../../core/landscape.ts';
import { FIELD_SLOPE } from '../../../../core/plots.ts';
import { hash2, hash3 } from '../../city/math.ts';
import { chamfer, distanceField, type Waters } from '../../life/land.ts';

/** A metre on the ground, as a degree of latitude. */
const M_PER_DEG = 111194.93;
const DEG = Math.PI / 180;

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * How the generator weighs a place for a settlement. None of these numbers is a claim about any place or people: they
 * say how strongly each thing people looked for counts, and how far it reaches.
 */
export interface SitingParams {
  /** places weighed for each settlement of a cell, and the fewest and the most weighed in one cell */
  candidates: [number, number, number];
  /** how near two settlements may stand, as a share of how far apart a cell's settlements stand on average */
  spacing: number;
  /** m kept between two settlements' houses at least, whatever their spacing */
  gap: number;
  /** how much a place's worth counts against chance: the worth is raised to this power */
  sharpness: number;
  /**
   * fresh water: within `best` m of it a place lacks nothing; beyond, its worth falls off over `falloff` m, to `floor`,
   * where people dug wells or carried water; and on the banks of any water, a river's course, an old bend, a pond or a
   * lake's shore, it keeps only 0.3 of that within `bank[0]` m and climbs back to the full by `bank[1]` m, for a river's
   * floods and a still water's wet ground
   */
  water: { best: number; falloff: number; floor: number; bank: [number, number] };
  /** level ground: the slope, as rise over run across `over` m, at which a place keeps `floor` of its worth */
  level: { over: number; steep: number; floor: number };
  /**
   * how a place stands among the ground within `reach` m: best `best` m above its mean, a little up from the wet bottom,
   * falling off over `spread` m higher or lower to `floor`
   */
  relief: { reach: number; best: number; spread: number; floor: number };
  /** the better and the worse soils: a noise over the Earth at these two scales, m, and how far it moves a place's worth */
  soil: { scales: [number, number]; weight: number };
  /** how much more a place is worth near a town or a city, and over how many m beyond its edge that falls off */
  city: { weight: number; reach: number };
  /** how much more often a pattern's smaller settlements stand than its larger ones, within its range: 1 evenly */
  sizes: number;
  /**
   * how settlements gather: about one in `per` of a cell's is a place others gather round, those places as far apart as
   * they can be; and a place's worth falls off with how far it is from the nearest of them, over `reach` of their mean
   * spacing, to `floor`
   */
  gather: { per: number; reach: number; floor: number };
}

/** How the fields of the settlements grow over the land. Again no claim: how far people walked to a field is the generator's. */
export interface GrowthParams {
  /** the side of the grid the fields grow over, m; and how far past the scene's edge settlements are weighed for theirs */
  cell: number;
  margin: number;
  /**
   * the longest walk to a field, in effort, as a share of the radius of a disc as big as the settlement's fields and houses
   * with its houses' own ground added again: the walk starts at the edge of its houses, not at its middle
   */
  reach: number;
  /** the better and the worse soils at the fields' own scale, m, and how far that moves the effort of farming a place */
  soil: { scale: number; weight: number };
  /** how much the effort varies from one node of the grid to the next, so that a field's edge is ragged */
  rough: number;
  /**
   * the land's grain: how much more effort it is to spread a field across the grain than along it. The grain runs along
   * the contours where the ground slopes more than `slope`, along the water within `water` m of it, and elsewhere as a
   * noise over the Earth at `scale` m turns it
   */
  grain: { across: number; slope: number; water: number; scale: number };
}

/**
 * The record's siting and growth (world/generators/people/settlement.yaml), for a build made before it had them: its
 * scenes are still drawn, and as a build made now would draw them. A test holds these to the record.
 */
export const SITING: SitingParams = {
  candidates: [10, 48, 6000],
  spacing: 0.4,
  gap: 30,
  sharpness: 2,
  water: { best: 900, falloff: 1500, floor: 0.3, bank: [60, 220] },
  level: { over: 60, steep: 0.12, floor: 0.25 },
  relief: { reach: 1000, best: 2, spread: 25, floor: 0.55 },
  soil: { scales: [5200, 1600], weight: 0.75 },
  city: { weight: 1.5, reach: 3000 },
  sizes: 1.2,
  gather: { per: 8, reach: 0.5, floor: 0.05 },
};
export const GROWTH: GrowthParams = { cell: 50, margin: 2500, reach: 2.4, soil: { scale: 900, weight: 0.85 }, rough: 0.35, grain: { across: 0.8, slope: 0.06, water: 900, scale: 9000 } };

/**
 * How far from a scene's middle, in degrees of latitude, the world must give it the 5′ cells of its people: as far as the
 * cells its settlements are weighed in reach (the scene's `extent`, the growth's margin and a ring of cells beyond, see
 * makeSettlement in v9.ts), and a cell further, which the outermost cells' crowding reads. The build asks for this much
 * (people/landscape.json, `reach_deg`), so that the ring is never cut short by a reach set apart from it.
 */
export function peopleReach(params: Record<string, unknown> | undefined, extent: number): number {
  const G = (params as { growth?: GrowthParams } | undefined)?.growth ?? GROWTH;
  const cell = M_PER_DEG / 12;
  // The ring's outermost cells begin a cell past the margin and end a cell further; their neighbours lie a cell beyond.
  return Math.ceil(((extent + G.margin + 3 * cell) / M_PER_DEG) * 100) / 100;
}

/** How far a place is from fresh water, m: a river's course, an old bend that holds water, a pond or a lake's shore. */
export interface WaterNear {
  at(x: number, y: number): number;
}

/**
 * The scene's fresh water as a distance from it, on a grid of `cell` m reaching `half` m from the middle each way: every
 * river the scene draws, wet in the month or dry, as people settled by a river that ran only in some months too; the old
 * bends and ponds; and the lakes. Undefined where the scene has no water at all: then no place is nearer than another.
 */
export function waterNear(w: Waters, half: number, cell = 100): WaterNear | undefined {
  const lines: number[][] = [];
  for (const p of w.paths ?? []) if (p.xy.length >= 4) lines.push(Array.from(p.xy));
  if (w.river.length >= 4) lines.push(w.river);
  for (const o of w.oxbows) if (o.length >= 4) lines.push(o);
  // A pond by its shore: a ring as wide as the mean of its two radii.
  for (let k = 0; k + 3 < w.ponds.length; k += 4) {
    const r = (w.ponds[k + 2] + w.ponds[k + 3]) / 2;
    const ring: number[] = [];
    for (let a = 0; a <= 12; a++) ring.push(w.ponds[k] + r * Math.cos((a * Math.PI) / 6), w.ponds[k + 1] + r * Math.sin((a * Math.PI) / 6));
    lines.push(ring);
  }
  const lakes = w.lakes && !w.lakes.empty ? w.lakes : undefined;
  if (!lines.length && !lakes) return undefined;
  const n = Math.ceil((2 * half) / cell) + 1;
  const x0 = -half;
  const d = distanceField(n, n, x0, x0, cell, lines, cell * 3);
  if (lakes) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const b = Math.max(0, -lakes.signed(x0 + i * cell, x0 + j * cell));
        if (b < d[k]) d[k] = b;
      }
    }
    // Carried on from the shores, as the courses were.
    chamfer(d, n, n, cell);
  }
  return {
    at(x: number, y: number): number {
      const fx = (x - x0) / cell;
      const fy = (y - x0) / cell;
      if (fx < 0 || fy < 0 || fx > n - 1.001 || fy > n - 1.001) return 1e6;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const u = fx - i;
      const v = fy - j;
      const k = j * n + i;
      return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + n] * (1 - u) + d[k + n + 1] * u) * v;
    },
  };
}

/** A place on the Earth, as a point of a sphere as large as it, in metres: the same for every scene, and even every way. */
export type Earth = [number, number, number];

/** A place given in degrees, on the Earth. */
export const earthAt = (lat: number, lon: number): Earth => {
  const R = M_PER_DEG / DEG;
  const c = Math.cos(lat * DEG);
  return [R * c * Math.cos(lon * DEG), R * c * Math.sin(lon * DEG), R * Math.sin(lat * DEG)];
};

/** Where a place in the scene's metres is on the Earth. */
export function earthOf(origin: { lat: number; lon: number }): (x: number, y: number) => Earth {
  const east = M_PER_DEG * Math.cos(origin.lat * DEG);
  return (x, y) => earthAt(origin.lat + y / M_PER_DEG, origin.lon + x / east);
}

/** Noise in three dimensions, 0–1: the corners of a unit lattice, hashed, read smoothly between. */
function noise3(x: number, y: number, z: number, seed: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const k = Math.floor(z);
  const u = x - i;
  const v = y - j;
  const w = z - k;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const sw = w * w * (3 - 2 * w);
  const at = (a: number, b: number, c: number) => hash3(i + a, j + b, k + c, seed);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return lerp(lerp(lerp(at(0, 0, 0), at(1, 0, 0), su), lerp(at(0, 1, 0), at(1, 1, 0), su), sv), lerp(lerp(at(0, 0, 1), at(1, 0, 1), su), lerp(at(0, 1, 1), at(1, 1, 1), su), sv), sw);
}

/** Noise in three octaves over the Earth, 0–1, at a scale of `scale` metres. */
export function fbmEarth(e: Earth, scale: number, seed: number): number {
  const x = e[0] / scale;
  const y = e[1] / scale;
  const z = e[2] / scale;
  return (noise3(x, y, z, seed) * 4 + noise3(x * 2.03, y * 2.03, z * 2.03, seed + 1) * 2 + noise3(x * 4.1, y * 4.1, z * 4.1, seed + 2)) / 7;
}

/** How good the soil is at a place on the Earth, about 1, by two scales of noise. */
export function soilAt(e: Earth, scales: [number, number], weight: number, seed: number): number {
  const n = 0.65 * fbmEarth(e, scales[0], seed) + 0.35 * fbmEarth(e, scales[1], seed + 17);
  // fbm's three octaves rarely reach their ends: stretch the middle of its range over the whole.
  return clamp(1 + weight * (2 * smooth(0.25, 0.75, n) - 1), 0.1, 3);
}

/**
 * The sizes of a cell's settlements, in houses, largest first: drawn from the range a tradition or a pattern gives, the
 * smaller oftener, until they hold the cell's houses. The last is kept by the part of it the cell still has room for, so
 * that a cell holds as many houses as it should on average.
 */
export function sizesOf(houses: number, range: { lo: number; hi: number }, skew: number, seed: number): number[] {
  const out: number[] = [];
  let total = 0;
  const lo = Math.max(1, range.lo);
  const hi = Math.max(lo, range.hi);
  for (let k = 0; total < houses && k < 200000; k++) {
    const size = Math.max(1, Math.round(lo * Math.pow(hi / lo, Math.pow(hash2(k, 0x5153, seed), skew))));
    if (total + size > houses && hash2(k, 0x5154, seed) >= (houses - total) / size) break;
    out.push(size);
    total += size;
  }
  return out.sort((a, b) => b - a);
}

/** A 5′ cell of the world as it is sited: where it lies in the scene, what seeds it, and the settlements it must hold. */
export interface SiteCell {
  /** its corners in the scene's metres: x0 west, x1 east, y0 south, y1 north */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** its northern and western edges, degrees, and its side */
  north: number;
  west: number;
  res: number;
  seed: number;
  /** its settlements' sizes in houses, largest first; and how near two of them may stand, m */
  sizes: number[];
  spacing: number;
  /** m² of ground one house takes: a settlement's houses spread over a disc as large as its houses' ground */
  lot: number;
  /** how a place in it is weighed besides by the ground: its people to the km² near the place, over its own; about 1 */
  crowd: (x: number, y: number) => number;
}

/** A place weighed for a settlement, and how much it is worth against chance: the larger `key`, the sooner it is taken. */
interface Candidate {
  x: number;
  y: number;
  key: number;
  cell: number;
  /** its number among the places its cell weighs, fixed by the cell's seed: what a settlement standing there is seeded by */
  k: number;
}

/**
 * How a place is weighed by its ground, water and soil, 0 where nobody would stand a house there. `ok` says whether a
 * house may stand there at all (dry, not too steep).
 */
export class SiteWorth {
  private mean?: { x0: number; cell: number; n: number; z: Float32Array };
  constructor(
    private p: SitingParams,
    private ground: { at(x: number, y: number): number },
    private near: WaterNear | undefined,
    private ok: (x: number, y: number) => boolean,
    private cities: { x: number; y: number; r: number }[],
    private seed: number,
    half: number,
  ) {
    // The mean height of the ground about each place, on a coarse grid: a sum over boxes of it.
    const cell = Math.max(100, p.relief.reach / 6);
    const n = Math.ceil((2 * half) / cell) + 1;
    const x0 = -half;
    const z = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = ground.at(x0 + i * cell, x0 + j * cell);
    const sum = new Float64Array((n + 1) * (n + 1));
    for (let j = 0; j < n; j++) {
      let row = 0;
      for (let i = 0; i < n; i++) {
        row += z[j * n + i];
        sum[(j + 1) * (n + 1) + i + 1] = sum[j * (n + 1) + i + 1] + row;
      }
    }
    const k = Math.max(1, Math.round(p.relief.reach / cell));
    const mean = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - k);
        const b = Math.min(n - 1, i + k);
        const c = Math.max(0, j - k);
        const d = Math.min(n - 1, j + k);
        const s = sum[(d + 1) * (n + 1) + b + 1] - sum[c * (n + 1) + b + 1] - sum[(d + 1) * (n + 1) + a] + sum[c * (n + 1) + a];
        mean[j * n + i] = s / ((b - a + 1) * (d - c + 1));
      }
    }
    this.mean = { x0, cell, n, z: mean };
  }
  /** The mean height of the ground about a place; its own height where the grid does not reach. */
  private around(x: number, y: number, z: number): number {
    const m = this.mean!;
    const fx = (x - m.x0) / m.cell;
    const fy = (y - m.x0) / m.cell;
    if (fx < 0 || fy < 0 || fx > m.n - 1.001 || fy > m.n - 1.001) return z;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const k = j * m.n + i;
    const a = m.z;
    return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + m.n] * (1 - u) + a[k + m.n + 1] * u) * v;
  }
  /** What a place is worth for a settlement, about 1 where it is as good as most; `e` its place on the Earth. */
  at(x: number, y: number, e: Earth): number {
    if (!this.ok(x, y)) return 0;
    const p = this.p;
    const z = this.ground.at(x, y);
    const o = p.level.over / 2;
    const gx = (this.ground.at(x + o, y) - this.ground.at(x - o, y)) / p.level.over;
    const gy = (this.ground.at(x, y + o) - this.ground.at(x, y - o)) / p.level.over;
    const level = 1 - (1 - p.level.floor) * smooth(0, p.level.steep, Math.sqrt(gx * gx + gy * gy));
    const rise = z - this.around(x, y, z) - p.relief.best;
    const relief = p.relief.floor + (1 - p.relief.floor) * Math.exp(-(rise * rise) / (p.relief.spread * p.relief.spread));
    let water = 1;
    if (this.near) {
      const d = this.near.at(x, y);
      const W = p.water;
      water = (d <= W.best ? 1 : W.floor + (1 - W.floor) * Math.exp(-(d - W.best) / W.falloff)) * (0.3 + 0.7 * smooth(W.bank[0], W.bank[1], d));
    }
    let town = 1;
    for (const c of this.cities) {
      // A city's own ground is its houses': nobody else's settlement stands on it.
      if (Math.hypot(x - c.x, y - c.y) < c.r) return 0;
      const d = Math.max(0, Math.hypot(x - c.x, y - c.y) - c.r);
      town = Math.max(town, 1 + p.city.weight * Math.exp(-d / p.city.reach));
    }
    return level * relief * water * town * soilAt(e, p.soil.scales, p.soil.weight, this.seed);
  }
}

/**
 * The places of the settlements of a set of cells: for each cell, as many places as it has settlements, in the order of
 * its sizes, the largest first; fewer only where its ground takes no more houses.
 *
 * Each cell weighs places spread over it by chance and takes them by worth and chance together (each place's key is a
 * draw raised to one over its worth). No place is taken within its cell's spacing of a place taken before it, across a
 * cell's edge as within it, where two cells' spacings differ the nearer: so a cell's places depend on its neighbours'.
 * Every cell's places are weighed, and the cells the scene draws should have a ring of cells about them in the list,
 * so that those near the edge of the scene come out as a scene centred on them would have them.
 *
 * The places taken first are many more than a cell needs, and a cell then keeps the best of its own. Those it does not
 * keep still kept others from standing near them, its neighbours' among them. That is meant: what is taken is then the
 * same kind of spread on both sides of a cell's edge, and which of a cell's places it keeps is its own business, so that
 * a cell's edge shows no band. Were a full cell to stop keeping others away, its neighbours' places would crowd its
 * edge while its own did not.
 */
export function siteCells(cells: SiteCell[], worth: SiteWorth, p: SitingParams): [number, number, number][][] {
  // Each cell's places, weighed by their ground and by how crowded the cell is about them.
  const weighed: { x: number; y: number; w: number; k: number }[][] = cells.map((c) => {
    const out: { x: number; y: number; w: number; k: number }[] = [];
    if (!c.sizes.length) return out;
    const n = clamp(Math.round(p.candidates[0] * c.sizes.length), p.candidates[1], p.candidates[2]);
    const side = Math.ceil(Math.sqrt(n));
    // Not on the cell's very edge, where two scenes' metres could put a place in the cell beside it.
    const inset = 3 / Math.max(1, c.x1 - c.x0);
    for (let k = 0; k < side * side; k++) {
      const u = clamp(((k % side) + hash3(k, 1, 0x51e, c.seed)) / side, inset, 1 - inset);
      const v = clamp((Math.floor(k / side) + hash3(k, 2, 0x51e, c.seed)) / side, inset, 1 - inset);
      const x = c.x0 + (c.x1 - c.x0) * u;
      const y = c.y1 - (c.y1 - c.y0) * v;
      const w = worth.at(x, y, earthAt(c.north - v * c.res, c.west + u * c.res)) * c.crowd(x, y);
      if (w > 0) out.push({ x, y, w, k });
    }
    return out;
  });
  // The places a cell's settlements gather round: the best of its places by worth and chance, as far apart as their number
  // lets them be. They are a cell's own, and the cells about it see them too.
  const G = p.gather;
  const reachOf = cells.map((c) => G.reach * Math.sqrt(((c.x1 - c.x0) * (c.y1 - c.y0)) / Math.max(1, Math.round(c.sizes.length / G.per))));
  const hubs: { x: number; y: number; r: number }[] = [];
  cells.forEach((c, ci) => {
    if (!c.sizes.length || !weighed[ci].length) return;
    const k = Math.max(1, Math.round(c.sizes.length / G.per));
    const apart = 0.6 * Math.sqrt(((c.x1 - c.x0) * (c.y1 - c.y0)) / k);
    const order = weighed[ci].map((q) => ({ q, key: Math.log(Math.max(1e-12, hash3(q.k, 4, 0x51e, c.seed))) / Math.pow(q.w, p.sharpness) })).sort((a, b) => b.key - a.key || a.q.k - b.q.k);
    const own: { x: number; y: number }[] = [];
    for (const { q } of order) {
      if (own.length >= k) break;
      if (own.some((h) => (h.x - q.x) ** 2 + (h.y - q.y) ** 2 < apart * apart)) continue;
      own.push(q);
    }
    for (const h of own) hubs.push({ x: h.x, y: h.y, r: reachOf[ci] });
  });
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cells) {
    x0 = Math.min(x0, c.x0);
    y0 = Math.min(y0, c.y0);
    x1 = Math.max(x1, c.x1);
    y1 = Math.max(y1, c.y1);
  }
  if (!(x1 > x0)) return cells.map(() => []);
  const hubGrid = new PointGrid(x0, y0, x1, y1, 1024);
  let far = 0;
  hubs.forEach((h, i) => {
    hubGrid.add(h.x, h.y, i);
    far = Math.max(far, h.r * 3);
  });
  /** How much a place is worth by how near it is to a place settlements gather round, `floor` to 1. */
  const gathered = (x: number, y: number): number => {
    let best = 0;
    hubGrid.within(x, y, far, (i) => {
      const h = hubs[hubGrid.tag[i]];
      best = Math.max(best, Math.exp(-Math.hypot(h.x - x, h.y - y) / h.r));
      return false;
    });
    return G.floor + (1 - G.floor) * best;
  };
  const cands: Candidate[] = [];
  cells.forEach((c, ci) => {
    for (const q of weighed[ci]) {
      const w = q.w * gathered(q.x, q.y);
      const draw = Math.max(1e-12, hash3(q.k, 3, 0x51e, c.seed));
      cands.push({ x: q.x, y: q.y, key: Math.log(draw) / Math.pow(w, p.sharpness), cell: ci, k: q.k });
    }
  });
  cands.sort((a, b) => b.key - a.key || a.cell - b.cell || a.x - b.x || a.y - b.y);
  // Taken in turn, each where none taken before it stands within the nearer of their cells' spacings.
  const spacing = cells.map((c) => c.spacing);
  const blocked = (grid: PointGrid, c: Candidate, factor: number) => {
    const own = spacing[c.cell] * factor;
    return grid.within(c.x, c.y, own, (i) => {
      const d = Math.min(own, spacing[grid.tag[i]] * factor);
      return (grid.xs[i] - c.x) ** 2 + (grid.ys[i] - c.y) ** 2 < d * d;
    });
  };
  const taken = new PointGrid(x0, y0, x1, y1, 256);
  const takenK: number[] = [];
  const rest: Candidate[] = [];
  for (const c of cands) {
    if (blocked(taken, c, 1)) rest.push(c);
    else {
      takenK[taken.n] = c.k;
      taken.add(c.x, c.y, c.cell);
    }
  }
  const out: [number, number, number][][] = cells.map(() => []);
  const chosen = new PointGrid(x0, y0, x1, y1, 256);
  // How far each chosen settlement's houses spread: its size is the next of its cell's, as they are taken in turn.
  const reach: number[] = [];
  const choose = (x: number, y: number, ci: number, k: number) => {
    const c = cells[ci];
    reach[chosen.n] = Math.sqrt((c.sizes[out[ci].length] * c.lot) / Math.PI);
    chosen.add(x, y, ci);
    out[ci].push([x, y, k]);
  };
  for (let i = 0; i < taken.n; i++) {
    const ci = taken.tag[i];
    if (out[ci].length >= cells[ci].sizes.length) continue;
    choose(taken.xs[i], taken.ys[i], ci, takenK[i]);
  }
  // Whether a settlement of a cell's next size would keep its ground, a disc as large as its houses' lots, its gap from
  // every other settlement's there. A layout may spread its houses a little past that disc (layOut), and no further check
  // is made of it here.
  let widest = 0;
  for (const r of reach) widest = Math.max(widest, r);
  const room = (c: Candidate): number => {
    const cell = cells[c.cell];
    const own = Math.sqrt((cell.sizes[out[c.cell].length] * cell.lot) / Math.PI);
    const crowded = chosen.within(c.x, c.y, own + widest + p.gap, (i) => {
      const d = own + reach[i] + p.gap;
      return (chosen.xs[i] - c.x) ** 2 + (chosen.ys[i] - c.y) ** 2 < d * d;
    });
    return crowded ? -1 : own;
  };
  // A cell whose ground had too few places for its settlements at its spacing takes more at half of it, from those passed
  // over, and then any where its houses keep their gap from every other settlement's. Where even those run out, the cell
  // has no more room for houses, and its last settlements are not drawn.
  const short = (ci: number) => out[ci].length < cells[ci].sizes.length;
  if (cells.some((_, ci) => short(ci))) {
    const left: Candidate[] = [];
    for (const c of rest) {
      if (!short(c.cell)) continue;
      const own = blocked(chosen, c, 0.5) ? -1 : room(c);
      if (own < 0) {
        left.push(c);
        continue;
      }
      choose(c.x, c.y, c.cell, c.k);
      widest = Math.max(widest, own);
    }
    for (const c of left) {
      if (!short(c.cell)) continue;
      const own = room(c);
      if (own < 0) continue;
      choose(c.x, c.y, c.cell, c.k);
      widest = Math.max(widest, own);
    }
  }
  return out;
}

/** Points kept in a flat grid of square buckets over a box, each with a whole number of its own, for finding those near a place. */
class PointGrid {
  private head: Int32Array;
  private next = new Int32Array(1024);
  xs = new Float64Array(1024);
  ys = new Float64Array(1024);
  tag = new Int32Array(1024);
  n = 0;
  private nx: number;
  private ny: number;
  constructor(private x0: number, private y0: number, x1: number, y1: number, private b: number) {
    this.nx = Math.max(1, Math.ceil((x1 - x0) / b) + 1);
    this.ny = Math.max(1, Math.ceil((y1 - y0) / b) + 1);
    this.head = new Int32Array(this.nx * this.ny).fill(-1);
  }
  private bucket(x: number, y: number): number {
    const i = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.x0) / this.b)));
    const j = Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.y0) / this.b)));
    return j * this.nx + i;
  }
  add(x: number, y: number, tag: number): void {
    if (this.n === this.xs.length) {
      const grow = <T extends Float64Array | Int32Array>(a: T): T => {
        const c = new (a.constructor as new (n: number) => T)(a.length * 2);
        c.set(a);
        return c;
      };
      this.next = grow(this.next);
      this.xs = grow(this.xs);
      this.ys = grow(this.ys);
      this.tag = grow(this.tag);
    }
    const k = this.bucket(x, y);
    this.xs[this.n] = x;
    this.ys[this.n] = y;
    this.tag[this.n] = tag;
    this.next[this.n] = this.head[k];
    this.head[k] = this.n++;
  }
  /** Calls `f` with each point within the square of `r` about a place, until it returns true; and says whether it did. */
  within(x: number, y: number, r: number, f: (i: number) => boolean): boolean {
    const i0 = Math.max(0, Math.floor((x - r - this.x0) / this.b));
    const i1 = Math.min(this.nx - 1, Math.floor((x + r - this.x0) / this.b));
    const j0 = Math.max(0, Math.floor((y - r - this.y0) / this.b));
    const j1 = Math.min(this.ny - 1, Math.floor((y + r - this.y0) / this.b));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (let k = this.head[j * this.nx + i]; k >= 0; k = this.next[k]) if (f(k)) return true;
      }
    }
    return false;
  }
}

/** What a settlement farms, as its fields grow: where they start, how much ground they take, and what is grown. */
export interface FieldSource {
  /** where its fields start: its houses, or its middle where none are drawn */
  starts: [number, number][];
  /** the radius of its houses' ground, m: its fields are walked to from its edge */
  r: number;
  x: number;
  y: number;
  /** m² of fields or pasture */
  area: number;
  use: FieldUse;
  /** its place in the plan's settlements, or -1 for one beyond the scene's edge, whose fields reach into it */
  settlement: number;
}

/** What each node of a grid over the scene is farmed as, and by whom. */
export interface FieldGrid {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  /** the settlement whose fields a node is in: its place in the plan; -1 none; -2 one beyond the scene */
  owner: Int32Array;
  /** what a node is farmed as: FIELD_USE's code of its settlement's use, 0 where it is not */
  use: Uint8Array;
}

/** The codes of the uses of the land in a field grid. */
export const FIELD_USE: Record<FieldUse, number> = { none: 0, rainfed: 1, irrigated: 2, rice: 3, swidden: 4, pasture: 5 };
export const USE_OF: FieldUse[] = ['none', 'rainfed', 'irrigated', 'rice', 'swidden', 'pasture'];

/**
 * The nodes reached, the cheapest first, in buckets of `width` of effort: within a bucket, the last reached is taken
 * first. Each reach is an entry of its own; an entry is never reached again once taken, so a bucket behind the one
 * being taken is never added to.
 */
class Frontier {
  cost = new Float64Array(1 << 16);
  node = new Int32Array(1 << 16);
  src = new Int32Array(1 << 16);
  private next = new Int32Array(1 << 16);
  private head: Int32Array;
  private entries = 0;
  private at = 0;
  n = 0;
  /** the entry taken last */
  top = -1;
  constructor(private width: number, most: number) {
    this.head = new Int32Array(Math.ceil(most / width) + 2).fill(-1);
  }
  push(cost: number, node: number, src: number) {
    if (this.entries === this.cost.length) {
      const grow = <T extends Float64Array | Int32Array>(a: T): T => {
        const b = new (a.constructor as new (n: number) => T)(a.length * 2);
        b.set(a);
        return b;
      };
      this.cost = grow(this.cost);
      this.node = grow(this.node);
      this.src = grow(this.src);
      this.next = grow(this.next);
    }
    const e = this.entries++;
    this.cost[e] = cost;
    this.node[e] = node;
    this.src[e] = src;
    const b = Math.max(this.at, Math.min(this.head.length - 1, Math.floor(cost / this.width)));
    this.next[e] = this.head[b];
    this.head[b] = e;
    this.n++;
  }
  /** Takes the cheapest entry as `top`, and returns false when there is none. */
  pop(): boolean {
    if (!this.n) return false;
    while (this.head[this.at] < 0) this.at++;
    const e = this.head[this.at];
    this.head[this.at] = this.next[e];
    this.top = e;
    this.n--;
    return true;
  }
}

/**
 * The fields of the settlements, grown over a grid of `half` m each way from the scene's middle: each settlement's from its
 * houses outward, the node that is least effort to reach from any settlement still short of its fields taken first, so
 * that two settlements' fields meet where walking to either is as far. The effort of a node is how far it is, over how
 * good it is to farm: level, dry and better soil are good, too steep and in the water are not farmed at all; pasture
 * takes steeper ground than a field, and a paddy wetter. A settlement's fields stop at the most its people farmed, or at
 * the longest walk to a field, whichever comes first.
 */
export function growFields(
  sources: FieldSource[],
  ground: { at(x: number, y: number): number },
  water: (x: number, y: number) => number,
  near: WaterNear | undefined,
  earth: (x: number, y: number) => Earth,
  p: GrowthParams,
  half: number,
  seed: number,
): FieldGrid {
  // A scene far wider than a living scene, as a test's, has its fields on a coarser grid.
  const cell = Math.max(p.cell, (2 * half) / 1600);
  const n = Math.ceil((2 * half) / cell) + 1;
  const x0 = -half;
  const N = n * n;
  // Each node is worked out when the fields first reach it, and most of a scene's are never reached.
  const z = new Float32Array(N).fill(NaN);
  const heightAt = (i: number, j: number): number => {
    const k = j * n + i;
    let v = z[k];
    if (v !== v) v = z[k] = ground.at(x0 + i * cell, x0 + j * cell);
    return v;
  };
  // The soil and the land's grain change slowly: they are worked out on a coarser lattice, every LAT nodes, and read
  // between its points.
  const LAT = 4;
  const nl = Math.ceil((n - 1) / LAT) + 2;
  const latSoil = new Float32Array(nl * nl).fill(NaN);
  const latC = new Float32Array(nl * nl);
  const latS = new Float32Array(nl * nl);
  const GR = p.grain;
  const lattice = (a: number, b: number): number => {
    const k = b * nl + a;
    if (latSoil[k] !== latSoil[k]) {
      const e = earth(x0 + a * LAT * cell, x0 + b * LAT * cell);
      latSoil[k] = soilAt(e, [p.soil.scale, p.soil.scale * 0.37], p.soil.weight, seed + 29);
      const turn = 4 * Math.PI * fbmEarth(e, GR.scale, seed + 37);
      latC[k] = Math.cos(turn);
      latS[k] = Math.sin(turn);
    }
    return k;
  };
  // How easy each node is to farm, for a field, for pasture and for a paddy: 0 where it is not farmed at all. And the way
  // the land's grain runs there, as the cosine and sine of twice its bearing, since a grain has no head and tail.
  const crop = new Float32Array(N);
  // Pasture and paddies are worked out only where some settlement keeps them.
  const graze = sources.some((s) => s.use === 'pasture') ? new Float32Array(N) : crop;
  const wet = sources.some((s) => s.use === 'rice' || s.use === 'irrigated') ? new Float32Array(N) : crop;
  const grainC = new Float32Array(N);
  const grainS = new Float32Array(N);
  const ready = new Uint8Array(N);
  const prepare = (k: number): void => {
    ready[k] = 1;
    const i = k % n;
    const j = (k - i) / n;
    const x = x0 + i * cell;
    const y = x0 + j * cell;
    const above = heightAt(i, j) - water(x, y);
    if (above < 0.5) return;
    const dw = near ? near.at(x, y) : 1e6;
    if (dw < 15) return;
    const ia = Math.max(0, i - 1);
    const ib = Math.min(n - 1, i + 1);
    const ja = Math.max(0, j - 1);
    const jb = Math.min(n - 1, j + 1);
    const gx = (heightAt(ib, j) - heightAt(ia, j)) / ((ib - ia) * cell);
    const gy = (heightAt(i, jb) - heightAt(i, ja)) / ((jb - ja) * cell);
    const g2 = gx * gx + gy * gy;
    const sin = Math.sqrt(g2 / (1 + g2));
    const fa = i / LAT;
    const fb = j / LAT;
    const a = Math.floor(fa);
    const b = Math.floor(fb);
    const u = fa - a;
    const v = fb - b;
    const k00 = lattice(a, b);
    const k10 = lattice(a + 1, b);
    const k01 = lattice(a, b + 1);
    const k11 = lattice(a + 1, b + 1);
    const w00 = (1 - u) * (1 - v);
    const w10 = u * (1 - v);
    const w01 = (1 - u) * v;
    const w11 = u * v;
    const soil = latSoil[k00] * w00 + latSoil[k10] * w10 + latSoil[k01] * w01 + latSoil[k11] * w11;
    // Along the contours on a slope; along the water near it; elsewhere as the noise turns it.
    let c2 = latC[k00] * w00 + latC[k10] * w10 + latC[k01] * w01 + latC[k11] * w11;
    let s2 = latS[k00] * w00 + latS[k10] * w10 + latS[k01] * w01 + latS[k11] * w11;
    {
      const e = earth(x, y);
      if (near && dw < GR.water * 3) {
        const wx = near.at(x + cell, y) - near.at(x - cell, y);
        const wy = near.at(x, y + cell) - near.at(x, y - cell);
        if (Math.hypot(wx, wy) > 1e-6) {
          // The water's course runs across the way its distance grows.
          const bearing = Math.atan2(wx, -wy);
          const w = Math.exp(-dw / GR.water);
          c2 = c2 * (1 - w) + Math.cos(2 * bearing) * w;
          s2 = s2 * (1 - w) + Math.sin(2 * bearing) * w;
        }
      }
      if (g2 > 1e-8) {
        const bearing = Math.atan2(gx, -gy);
        const w = smooth(GR.slope * 0.3, GR.slope, Math.sqrt(g2));
        c2 = c2 * (1 - w) + Math.cos(2 * bearing) * w;
        s2 = s2 * (1 - w) + Math.sin(2 * bearing) * w;
      }
      const l2 = Math.hypot(c2, s2) || 1;
      grainC[k] = c2 / l2;
      grainS[k] = s2 / l2;
      const rough = 1 + p.rough * (hash3(Math.round(e[0] / cell), Math.round(e[1] / cell), Math.round(e[2] / cell), seed + 31) - 0.5) * 2;
      const base = soil * rough;
      // A field on a river's plain is farmed where it lies a little above the river, at the risk of a flood.
      crop[k] = above < 0.6 ? 0 : base * (1 - smooth(FIELD_SLOPE.cropFadeLo, FIELD_SLOPE.cropFadeHi, sin)) * (0.45 + 0.55 * smooth(0.8, 2.5, above));
      if (graze !== crop) graze[k] = base * (1 - smooth(0.35, 0.6, sin)) * smooth(0.5, 1.2, above);
      if (wet !== crop) wet[k] = base * (1 - smooth(FIELD_SLOPE.cropFadeLo, FIELD_SLOPE.cropFadeHi, sin)) * (0.55 + 0.9 * (1 - smooth(2, 12, above)));
    }
  };
  const owner = new Int32Array(N).fill(-1);
  const use = new Uint8Array(N);
  const left = new Float64Array(sources.length);
  const most = new Float64Array(sources.length);
  const ease = sources.map((s) => (s.use === 'pasture' ? graze : s.use === 'rice' || s.use === 'irrigated' ? wet : crop));
  let longest = 0;
  sources.forEach((s, si) => {
    if (s.use === 'none' || !(s.area > 0)) return;
    left[si] = s.area / (cell * cell);
    most[si] = p.reach * Math.sqrt(s.area / Math.PI + s.r * s.r);
    longest = Math.max(longest, most[si]);
  });
  // Effort is told apart to a sixteenth of a step of the grid.
  const heap = new Frontier(cell / 16, longest);
  sources.forEach((s, si) => {
    if (!(left[si] > 0)) return;
    for (const [x, y] of s.starts) {
      const i = Math.round((x - x0) / cell);
      const j = Math.round((y - x0) / cell);
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      heap.push(0, j * n + i, si);
    }
  });
  const STEP = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1];
  // Each step's bearing, as the cosine and sine of twice it: east and west, north and south, then the diagonals.
  const TWICE = [1, 0, 1, 0, -1, 0, -1, 0, 0, 1, 0, -1, 0, -1, 0, 1];
  // The cheapest reach of each node so far, and by whom: a settlement need not reach a node again at a greater cost.
  const best = new Float32Array(N).fill(Infinity);
  const bestBy = new Int32Array(N).fill(-1);
  while (heap.pop()) {
    const at = heap.top;
    const k = heap.node[at];
    const si = heap.src[at];
    const c = heap.cost[at];
    if (owner[k] !== -1 || left[si] <= 0) continue;
    if (!ready[k]) prepare(k);
    const e = ease[si];
    // A house by a river or on a slope may stand where nothing is farmed: its fields start from the nodes about it.
    const farmed = e[k] > 0.02;
    if (!farmed && c > 0) continue;
    if (farmed) {
      owner[k] = sources[si].settlement >= 0 ? sources[si].settlement : -2;
      use[k] = FIELD_USE[sources[si].use];
      left[si]--;
    }
    const i = k % n;
    const j = (k - i) / n;
    for (let q = 0; q < 16; q += 2) {
      const a = i + STEP[q];
      const b = j + STEP[q + 1];
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const m = b * n + a;
      if (owner[m] !== -1) continue;
      if (!ready[m]) prepare(m);
      if (!(e[m] > 0.02)) continue;
      const len = q < 8 ? cell : cell * Math.SQRT2;
      // Across the grain is more effort than along it.
      const across = 0.5 * (1 - (TWICE[q] * grainC[k] + TWICE[q + 1] * grainS[k]));
      const next = c + len * (1 + GR.across * across) * 0.5 * ((farmed ? 1 / e[k] : 1 / e[m]) + 1 / e[m]);
      if (next > most[si]) continue;
      if (bestBy[m] === si && next >= best[m]) continue;
      if (next < best[m]) {
        best[m] = next;
        bestBy[m] = si;
      }
      heap.push(next, m, si);
    }
  }
  return { x0, y0: x0, cell, nx: n, ny: n, owner, use };
}

/** The node of a field grid nearest a place, or -1 off it. */
export function nodeOf(g: FieldGrid, x: number, y: number): number {
  const i = Math.round((x - g.x0) / g.cell);
  const j = Math.round((y - g.y0) / g.cell);
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i;
}
