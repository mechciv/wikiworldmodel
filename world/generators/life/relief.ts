// The ground of a scene, before its waters are cut into it (docs/SCENES.md, "The ground's shape"). Two things, and only
// the first is the world's:
//
//   the world's ground   the elevation field read straight between its nodes, and over it the shape of today's ground
//                        within its cells, where the world gives a scene one (core/relief.ts): the survey's own where
//                        today's relief is held for the time, today's carried back on its plate before that.
//   what is invented     below the grain of that, hills and valleys nobody surveyed. They go on from the roughness the
//                        world's ground shows at its own grain, smaller the smaller they are, and are then cut by
//                        water run over them (erosion.ts), which drains to the sea, to the rivers and lakes the world
//                        gives and to the edge: so their valleys lead to what drains them. Over a cell of the world's
//                        ground they add nothing to its mean.
//
// And a river the drainage routes from node to node of its grid is run down the finer ground between them, where the
// world's ground is finer than that grid.
import { ShapeReader } from '../../../core/relief.ts';
import type { ReliefPatch, ReliefShape, SceneRiver } from '../../../core/scene.ts';
import { dcos, dsin, PI } from '../city/math.ts';
import { boxMean, cubicAt, erode, type ErosionChoices } from './erosion.ts';
import { noise } from './land.ts';

export const EARTH = 6371000;
const DEG = PI / 180;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The world's ground at a local point: the field's, read straight between its nodes, and the shape within its cells where the world gives one. */
export class WorldGround {
  private kx: number;
  private shapeAt?: ShapeReader;
  /** the world's ground at the middle of each cell of the shape, where there is one */
  private whole?: Float32Array;
  /** how much of today's shape stood at the scene's place and time: none where the world gives the scene no shape */
  readonly share: number;
  /** the grain of the shape, in metres on the ground, where there is one */
  readonly fineM: number;
  constructor(private p: ReliefPatch, private origin: { lat: number; lon: number }, shape?: ReliefShape) {
    this.kx = 1 / (EARTH * dcos(origin.lat * DEG) * DEG);
    if (shape) {
      // The world's ground at the middle of each of the shape's cells: the field there with the cell's own part. The
      // ground between them is read straight from one to the next, so that the corners the field's own grid has
      // between its nodes, which the cells know nothing of, leave no crease in it.
      const reader = new ShapeReader(shape, dsin, dcos, EARTH);
      const { nx, ny, z } = shape.patch;
      const whole = new Float32Array(nx * ny);
      // A shape carried back comes with today's ground at each cell. Where the elevation of the time has the land
      // lower than today, today's valleys would lie under its sea; but a valley is cut no lower than the sea it
      // drains to. So ground that is dry today is held above the coast wherever that elevation has land: at a share
      // of the height it gives the land there, and no higher than the ground stands today.
      const today = shape.held ? undefined : shape.today;
      const floor = shape.floor ?? 0;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          const [x, y] = reader.place(i, j);
          const f = this.field(x, y);
          let g = f + z[k];
          if (today && floor > 0 && f > 0 && today[k] > 0) {
            const least = Math.min(today[k], f * floor);
            if (g < least) g = least;
          }
          whole[k] = g;
        }
      }
      this.shapeAt = reader;
      this.whole = whole;
    }
    this.share = shape ? shape.share : 0;
    this.fineM = shape ? shape.patch.step * EARTH * DEG : 0;
  }
  /** the spacing of the field, in degrees and in metres on the ground */
  get step(): number {
    return this.p.step;
  }
  get stepM(): number {
    return this.p.step * EARTH * DEG;
  }
  /** Whether the world gives the scene the shape of the ground within the field's cells. */
  get shaped(): boolean {
    return !!this.shapeAt;
  }
  /** Whether the cell of the field a point is in has the coast through it: land at one of its corners and sea at another. */
  coastal(x: number, y: number): boolean {
    const { p } = this;
    const lat = this.origin.lat + y / (EARTH * DEG);
    const lon = this.origin.lon + x * this.kx;
    const cy = Math.min(p.ny - 1.001, Math.max(0, (p.lat0 - lat) / p.step));
    const cx = Math.min(p.nx - 1.001, Math.max(0, (lon - p.lon0) / p.step));
    const at = Math.floor(cy) * p.nx + Math.floor(cx);
    const c = [p.z[at], p.z[at + 1], p.z[at + p.nx], p.z[at + p.nx + 1]];
    return Math.min(...c) <= 0 && Math.max(...c) > 0;
  }
  /** The field alone. */
  field(x: number, y: number): number {
    const { p } = this;
    const lat = this.origin.lat + y / (EARTH * DEG);
    const lon = this.origin.lon + x * this.kx;
    const fy = (p.lat0 - lat) / p.step;
    const fx = (lon - p.lon0) / p.step;
    const cy = fy < 0 ? 0 : fy > p.ny - 1.001 ? p.ny - 1.001 : fy;
    const cx = fx < 0 ? 0 : fx > p.nx - 1.001 ? p.nx - 1.001 : fx;
    const j = Math.floor(cy);
    const i = Math.floor(cx);
    const u = cx - i;
    const v = cy - j;
    const at = j * p.nx + i;
    const z = p.z;
    return (z[at] * (1 - u) + z[at + 1] * u) * (1 - v) + (z[at + p.nx] * (1 - u) + z[at + p.nx + 1] * u) * v;
  }
  /** The shape within the field's cells, where the world gives one: what the world's ground stands above the field's by. */
  shape(x: number, y: number): number {
    if (!this.shapeAt) return 0;
    const b = this.field(x, y);
    return this.shapeAt.lay(this.whole!, x, y, b) - b;
  }
  /** How much of today's shape stood at a point of the scene: the scene's share of it, as far as the shape reaches. */
  shareAt(x: number, y: number): number {
    return this.shapeAt ? this.share * this.shapeAt.weight(x, y) : 0;
  }
  /** The world's ground: the field, and within its cells the survey's ground, read straight between the survey's cells. */
  at(x: number, y: number): number {
    const b = this.field(x, y);
    return this.shapeAt ? this.shapeAt.lay(this.whole!, x, y, b) : b;
  }
}

// ——— What is invented below the world's ground ———

/** How the ground below the world's is invented: the generator's choices (gen:life/scene, `ground`). */
export interface InventChoices {
  /** how much of the roughness the world's ground shows at its own grain goes on below it, as a share */
  rugged: number;
  /** how fast it falls with the size of a feature: a feature half as long stands 2^-hurst as high */
  hurst: number;
  /** the height above the coast below which nothing is invented, and by which all of it is, m */
  lowland: [number, number];
  erosion: ErosionChoices;
}

/** One grid the invented ground is made on: its nodes and how far apart, and the lengths of the features made on it, m. */
interface LevelSpec {
  cell: number;
  n: number;
  waves: number[];
}

/**
 * Far, middle and near: each as wide as the ground's grid it is for (scene's GRIDS), on fewer nodes; and the features
 * each makes, by their length from one rise to the next, none shorter than four of its nodes can hold.
 */
const LEVELS: LevelSpec[] = [
  { cell: 4000, n: 241, waves: [64000, 32000, 16000] },
  { cell: 125, n: 513, waves: [8000, 4000, 2000, 1000, 500] },
  { cell: 40, n: 321, waves: [250, 160] },
];

interface Level {
  spec: LevelSpec;
  x0: number;
  /** what this level adds, m */
  d: Float32Array;
  /** the roughness of the field alone at its grain, where this level could measure it */
  rough?: Float32Array;
}

/** The root-mean-square of `noise` about its middle, measured: what turns it into a wave of unit size. */
const NOISE_RMS = 0.2;

/** Water the world gives, which the invented ground drains to and does not cut: a course with its water's height, or a lake. */
export interface FixedWater {
  courses: { xy: ArrayLike<number>; z: ArrayLike<number>; half: ArrayLike<number> }[];
  /** the level of a lake at a point, where one lies there */
  lake?: (x: number, y: number) => number | undefined;
}

/**
 * The ground a scene invents below the world's, on three grids from far to near, each adding the features its nodes can
 * hold to what the one before made, and each then cut by water (erosion.ts). How high its features stand follows the
 * world's ground: the roughness that ground shows at its own grain (how far each node of it stands from the mean of the
 * nodes a grain away either side), carried on below the grain, a feature half as long 2^-hurst as high. Where the scene
 * has a shape, that grain is the shape's as far as the shape stood, and the field's for the rest.
 */
export class Invented {
  private levels: (Level | undefined)[] = [];
  constructor(ground: WorldGround, c: InventChoices, seed: number, water?: FixedWater) {
    const fine = ground.fineM;
    const coarse = ground.stepM;
    // Each grain's share of the features of every length, so that all of them together stand `rugged` of its roughness.
    const all = LEVELS.flatMap((l) => l.waves);
    // Only features shorter than the grain: what is as long is the world's ground's to hold.
    const part = (wave: number, grain: number) => (grain > 0 ? (1 - smooth(0.5 * grain, grain, wave)) * Math.pow(wave / grain, c.hurst) : 0);
    const norm = (grain: number) => Math.sqrt(all.reduce((s, w) => s + part(w, grain) ** 2, 0)) || 1;
    const fineNorm = norm(fine);
    const coarseNorm = norm(coarse);
    let roughFrom: Level | undefined;
    LEVELS.forEach((spec, li) => {
      const { n, cell } = spec;
      const x0 = (-(n - 1) / 2) * cell;
      // How much of today's shape stood over this grid, at the least and at the most: where all of it did, the grain is
      // the shape's alone, and where none did, the field's.
      let least = 1;
      let most = 0;
      for (let j = 0; j <= 8; j++) {
        for (let i = 0; i <= 8; i++) {
          const share = ground.shareAt(x0 + (i / 8) * (n - 1) * cell, x0 + (j / 8) * (n - 1) * cell);
          if (share < least) least = share;
          if (share > most) most = share;
        }
      }
      const fineOn = most > 0 && spec.waves.some((w) => part(w, fine) > 0);
      const coarseOn = least < 1 && spec.waves.some((w) => part(w, coarse) > 0);
      if (!fineOn && !coarseOn) {
        this.levels.push(undefined);
        return;
      }
      const base = new Float32Array(n * n);
      const field = new Float32Array(n * n);
      for (let j = 0; j < n; j++) {
        const y = x0 + j * cell;
        for (let i = 0; i < n; i++) {
          const x = x0 + i * cell;
          field[j * n + i] = ground.field(x, y);
          base[j * n + i] = ground.at(x, y);
        }
      }
      // The roughness of the world's ground at each grain, on this grid where its nodes are near enough together and
      // the grid wide enough to measure it; else as the grid before this one had it.
      const roughOf = (a: Float32Array, grain: number): Float32Array | undefined => {
        const lag = Math.round(grain / cell);
        if (lag < 1 || lag * 3 > n) return undefined;
        const res = new Float32Array(n * n);
        for (let j = 0; j < n; j++) {
          const rows = j - lag >= 0 && j + lag < n;
          for (let i = 0; i < n; i++) {
            // How far the node stands from the mean of the nodes a grain away: either side of it, along each way the
            // grid reaches a grain both ways, so that a slope counts for nothing at the grid's edge either.
            const k = j * n + i;
            let sum = 0;
            let count = 0;
            if (i - lag >= 0 && i + lag < n) {
              sum += a[k - lag] + a[k + lag];
              count += 2;
            }
            if (rows) {
              sum += a[k - lag * n] + a[k + lag * n];
              count += 2;
            }
            const r = count ? a[k] - sum / count : 0;
            res[k] = r * r;
          }
        }
        const mean = boxMean(res, n, n, lag);
        for (let k = 0; k < mean.length; k++) mean[k] = Math.sqrt(mean[k]);
        return mean;
      };
      const fineRough = fineOn ? roughOf(base, fine) : undefined;
      const coarseRough = coarseOn ? roughOf(field, coarse) : undefined;
      const from = roughFrom;
      const coarseAt = (k: number, x: number, y: number): number => {
        if (coarseRough) return coarseRough[k];
        if (!from?.rough) return 0;
        const s = from.spec;
        return cubicAt(from.rough, s.n, s.n, (x - from.x0) / s.cell, (y - from.x0) / s.cell);
      };
      // What the grids before this one made, and this grid's own features over it.
      const z = new Float32Array(n * n);
      const before = new Float32Array(n * n);
      const fixed = new Uint8Array(n * n);
      let added = false;
      for (let j = 0; j < n; j++) {
        const y = x0 + j * cell;
        for (let i = 0; i < n; i++) {
          const x = x0 + i * cell;
          const k = j * n + i;
          let d = 0;
          for (let q = 0; q < li; q++) d += this.read(q, x, y);
          before[k] = d;
          const b = base[k];
          const gate = smooth(c.lowland[0], c.lowland[1], b);
          let add = 0;
          if (gate > 0) {
            const share = ground.shareAt(x, y);
            const rf = fineRough ? fineRough[k] * share : 0;
            const rc = coarseOn ? Math.max(0, coarseAt(k, x, y)) * (1 - share) : 0;
            spec.waves.forEach((wave, wi) => {
              const a = (rf * part(wave, fine)) / fineNorm + (rc * part(wave, coarse)) / coarseNorm;
              // A rise and a fall of the noise are two of its cells: half the feature's length each.
              if (a > 0) add += a * ((noise((x * 2) / wave, (y * 2) / wave, seed + 301 + li * 16 + wi) - 0.5) / NOISE_RMS);
            });
          }
          const up = c.rugged * gate * add;
          // Less than a centimetre is the arithmetic's, and no roughness of the ground's.
          if (up > 0.01 || up < -0.01) added = true;
          z[k] = b + d + up;
          // The sea is not the ground's to cut, and what runs to it has arrived.
          if (z[k] <= 0) fixed[k] = 1;
        }
      }
      // Level ground with no water of the world's on it has nothing to cut, and nothing is made of it here.
      if (!added && !(water && (water.courses.length || water.lake))) {
        this.levels.push(undefined);
        if (coarseRough) roughFrom = { spec, x0, d: new Float32Array(0), rough: coarseRough };
        return;
      }
      if (water) this.pin(z, fixed, n, x0, cell, water);
      erode(z, n, n, c.erosion, fixed);
      // What this grid adds is what is left of that over the world's ground and the grids before it, less its own mean
      // over the longest feature made here: so it adds nothing to the mean of a cell of the world's ground, and water
      // cuts valleys into that ground without wearing down its broad slopes, which are the world's. Nothing where
      // nothing of this size is invented, and nothing at the grid's own edge, where the grid beyond it takes over.
      const d = new Float32Array(n * n);
      for (let k = 0; k < d.length; k++) d[k] = z[k] - base[k] - before[k];
      const longest = Math.max(...spec.waves.filter((w) => (fineOn && part(w, fine) > 0) || (coarseOn && part(w, coarse) > 0)));
      const mean = boxMean(d, n, n, Math.min((n - 1) / 2, Math.max(2, longest / cell / 2)));
      const ease = Math.round(n * 0.12);
      for (let j = 0; j < n; j++) {
        const y = x0 + j * cell;
        for (let i = 0; i < n; i++) {
          const edge = Math.min(i, j, n - 1 - i, n - 1 - j);
          const k = j * n + i;
          const share = ground.shareAt(x0 + i * cell, y);
          const here = (fineOn ? share : 0) + (coarseOn ? 1 - share : 0);
          d[k] = (d[k] - mean[k]) * smooth(0, ease, edge) * (here > 1 ? 1 : here);
        }
      }
      const level: Level = { spec, x0, d, ...(coarseRough ? { rough: coarseRough } : {}) };
      if (coarseRough) roughFrom = level;
      this.levels.push(level);
    });
  }

  /** Hold the invented ground to the water the world gives: under a course at its water's height, and under a lake at its level. */
  private pin(z: Float32Array, fixed: Uint8Array, n: number, x0: number, cell: number, water: FixedWater): void {
    for (const c of water.courses) {
      const pts = c.xy.length / 2;
      for (let s = 0; s + 1 < pts; s++) {
        const ax = c.xy[s * 2];
        const ay = c.xy[s * 2 + 1];
        const bx = c.xy[s * 2 + 2];
        const by = c.xy[s * 2 + 3];
        const len = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(1, Math.ceil(len / (cell * 0.5)));
        for (let t = 0; t <= steps; t++) {
          const f = t / steps;
          const i = Math.round((ax + (bx - ax) * f - x0) / cell);
          const j = Math.round((ay + (by - ay) * f - x0) / cell);
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const k = j * n + i;
          const level = c.z[s] + (c.z[s + 1] - c.z[s]) * f;
          if (!fixed[k] || level < z[k]) z[k] = level;
          fixed[k] = 1;
        }
      }
    }
    if (water.lake) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const level = water.lake(x0 + i * cell, x0 + j * cell);
          if (level === undefined) continue;
          z[j * n + i] = level;
          fixed[j * n + i] = 1;
        }
      }
    }
  }

  private read(q: number, x: number, y: number): number {
    const l = this.levels[q];
    if (!l) return 0;
    const s = l.spec;
    const fx = (x - l.x0) / s.cell;
    const fy = (y - l.x0) / s.cell;
    if (fx <= 0 || fy <= 0 || fx >= s.n - 1 || fy >= s.n - 1) return 0;
    return cubicAt(l.d, s.n, s.n, fx, fy);
  }

  /** What is invented at a point, m, for the ground's grid `q`: 0 the near one, which has all of it, 1 the middle, 2 the far, which has only the widest. */
  at(x: number, y: number, q: number): number {
    let d = this.read(0, x, y);
    if (q <= 1) d += this.read(1, x, y);
    if (q <= 0) d += this.read(2, x, y);
    return d;
  }

  /**
   * What is invented at every node of one of the ground's grids, m: `q` as for `at`. Each of the grids it was made on is
   * read by a cubic along the rows and then along the columns, which is what `at` reads at a point, made once for all.
   */
  over(gs: { nx: number; ny: number; x0: number; y0: number; cell: number }, q: number): Float32Array {
    const out = new Float32Array(gs.nx * gs.ny);
    for (let li = 0; li < this.levels.length; li++) {
      const l = this.levels[li];
      if (!l || (li === 1 && q > 1) || (li === 2 && q > 0)) continue;
      const n = l.spec.n;
      // For each node along one way of the ground's grid: the four nodes of this grid about it, and their weights.
      const taps = (count: number, from: number) => {
        const idx = new Int32Array(count * 4);
        const w = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
          const f = (from + i * gs.cell - l.x0) / l.spec.cell;
          if (f <= 0 || f >= n - 1) continue;
          const k = Math.min(n - 2, Math.floor(f));
          const u = f - k;
          const u2 = u * u;
          const u3 = u2 * u;
          idx[i * 4] = k > 0 ? k - 1 : 0;
          idx[i * 4 + 1] = k;
          idx[i * 4 + 2] = k + 1;
          idx[i * 4 + 3] = k + 2 < n ? k + 2 : n - 1;
          w[i * 4] = -0.5 * u3 + u2 - 0.5 * u;
          w[i * 4 + 1] = 1.5 * u3 - 2.5 * u2 + 1;
          w[i * 4 + 2] = -1.5 * u3 + 2 * u2 + 0.5 * u;
          w[i * 4 + 3] = 0.5 * u3 - 0.5 * u2;
        }
        return { idx, w };
      };
      const cols = taps(gs.nx, gs.x0);
      const rows = taps(gs.ny, gs.y0);
      const along = new Float32Array(n * gs.nx);
      for (let j = 0; j < n; j++) {
        const from = j * n;
        const to = j * gs.nx;
        for (let i = 0; i < gs.nx; i++) {
          const t = i * 4;
          along[to + i] = l.d[from + cols.idx[t]] * cols.w[t] + l.d[from + cols.idx[t + 1]] * cols.w[t + 1] + l.d[from + cols.idx[t + 2]] * cols.w[t + 2] + l.d[from + cols.idx[t + 3]] * cols.w[t + 3];
        }
      }
      for (let j = 0; j < gs.ny; j++) {
        const t = j * 4;
        const w0 = rows.w[t];
        const w1 = rows.w[t + 1];
        const w2 = rows.w[t + 2];
        const w3 = rows.w[t + 3];
        if (!w0 && !w1 && !w2 && !w3) continue;
        const a = rows.idx[t] * gs.nx;
        const b = rows.idx[t + 1] * gs.nx;
        const c = rows.idx[t + 2] * gs.nx;
        const d = rows.idx[t + 3] * gs.nx;
        const to = j * gs.nx;
        for (let i = 0; i < gs.nx; i++) out[to + i] += along[a + i] * w0 + along[b + i] * w1 + along[c + i] * w2 + along[d + i] * w3;
      }
    }
    return out;
  }

  /** Whether anything is invented at all. */
  get any(): boolean {
    return this.levels.some((l) => !!l);
  }
}

// ——— A river run down the finer ground ———

/** How a modelled river is run down the world's ground between the nodes of the drainage's grid (gen:life/scene, `ground.trace`). */
export interface TraceChoices {
  /** the spacing of the grid its course is found on, and how far apart its points are kept, m */
  cell: number;
  keep: number;
  /** how far from a node of the drainage's grid its course may start: to the lowest ground within this, m */
  snap: number;
  /** climbing this far costs a course as much as going its own length again, m */
  height: number;
}

class Queue {
  private cost: Float32Array;
  private node: Int32Array;
  size = 0;
  top = 0;
  constructor(capacity: number) {
    this.cost = new Float32Array(capacity);
    this.node = new Int32Array(capacity);
  }
  push(cost: number, node: number): void {
    if (this.size >= this.cost.length) {
      const c = new Float32Array(this.cost.length * 2);
      c.set(this.cost);
      this.cost = c;
      const nn = new Int32Array(this.node.length * 2);
      nn.set(this.node);
      this.node = nn;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cost[p] <= cost) break;
      this.cost[i] = this.cost[p];
      this.node[i] = this.node[p];
      i = p;
    }
    this.cost[i] = cost;
    this.node[i] = node;
  }
  pop(): number {
    const out = this.node[0];
    this.top = this.cost[0];
    const cost = this.cost[--this.size];
    const node = this.node[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.cost[c + 1] < this.cost[c]) c++;
      if (this.cost[c] >= cost) break;
      this.cost[i] = this.cost[c];
      this.node[i] = this.node[c];
      i = c;
    }
    this.cost[i] = cost;
    this.node[i] = node;
    return out;
  }
}

/**
 * Runs the rivers the drainage routes down the world's ground. The drainage gives a river as the nodes of its grid it
 * passes; between two of them its course is not known. Here it is the way from one to the next that keeps lowest: each
 * node is moved to the lowest ground near it, where its cell's river lies, and the course between is the one that costs
 * least, where a step costs its length and the height it stands above the lowest ground about. The water's height is
 * then the ground's under the course. What it finds is keyed by the ground alone, so two rivers that meet at a node
 * meet at one point.
 */
export class Tracer {
  private n: number;
  private x0: number;
  private h: Float32Array;
  private cost: Float32Array;
  private back: Int32Array;
  private stamp: Int32Array;
  private run = 0;
  constructor(ground: WorldGround, private c: TraceChoices, reach: number) {
    const half = Math.ceil(reach / c.cell);
    this.n = half * 2 + 1;
    this.x0 = -half * c.cell;
    const n = this.n;
    this.h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.h[j * n + i] = ground.at(this.x0 + i * c.cell, this.x0 + j * c.cell);
    this.cost = new Float32Array(n * n);
    this.back = new Int32Array(n * n);
    this.stamp = new Int32Array(n * n);
  }

  /** The node of the grid nearest a point, or -1 beyond it. */
  private cellOf(x: number, y: number): number {
    const i = Math.round((x - this.x0) / this.c.cell);
    const j = Math.round((y - this.x0) / this.c.cell);
    return i < 1 || j < 1 || i >= this.n - 1 || j >= this.n - 1 ? -1 : j * this.n + i;
  }

  /** The lowest node within `snap` of a node. */
  private lowest(k: number, snap: number): number {
    const n = this.n;
    const r = Math.max(0, Math.floor(snap / this.c.cell));
    const i0 = k % n;
    const j0 = (k - i0) / n;
    let best = k;
    for (let j = Math.max(1, j0 - r); j <= Math.min(n - 2, j0 + r); j++) {
      for (let i = Math.max(1, i0 - r); i <= Math.min(n - 2, i0 + r); i++) {
        if ((i - i0) * (i - i0) + (j - j0) * (j - j0) > r * r) continue;
        const q = j * n + i;
        if (this.h[q] < this.h[best]) best = q;
      }
    }
    return best;
  }

  /** The way from one node to another that keeps lowest, as nodes, the first left out. */
  private way(a: number, b: number): number[] {
    const n = this.n;
    const ai = a % n;
    const aj = (a - ai) / n;
    const bi = b % n;
    const bj = (b - bi) / n;
    // Within the box about the two, and as far again beyond it as half their distance, and no less than 2 km.
    const pad = Math.max(Math.ceil(2000 / this.c.cell), Math.ceil(Math.hypot(bi - ai, bj - aj) / 2));
    const i0 = Math.max(0, Math.min(ai, bi) - pad);
    const i1 = Math.min(n - 1, Math.max(ai, bi) + pad);
    const j0 = Math.max(0, Math.min(aj, bj) - pad);
    const j1 = Math.min(n - 1, Math.max(aj, bj) + pad);
    let low = Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) low = Math.min(low, this.h[j * n + i]);
    const run = ++this.run;
    const queue = new Queue(4096);
    this.stamp[a] = run;
    this.cost[a] = 0;
    this.back[a] = -1;
    queue.push(0, a);
    while (queue.size) {
      const k = queue.pop();
      if (queue.top > this.cost[k]) continue;
      if (k === b) break;
      const i = k % n;
      const j = (k - i) / n;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj;
        if (jj < j0 || jj > j1) continue;
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          if ((!di && !dj) || ii < i0 || ii > i1) continue;
          const q = jj * n + ii;
          const cost = this.cost[k] + (di && dj ? 1.4142 : 1) * (1 + (this.h[q] - low) / this.c.height);
          if (this.stamp[q] === run && this.cost[q] <= cost) continue;
          this.stamp[q] = run;
          this.cost[q] = cost;
          this.back[q] = k;
          queue.push(cost, q);
        }
      }
    }
    const out: number[] = [];
    if (this.stamp[b] !== run) return [b];
    for (let k = b; k !== a && k >= 0; k = this.back[k]) out.push(k);
    return out.reverse();
  }

  /** A modelled river with its course run down the ground: its points where the ground is lowest, its flow at each, and its water at the ground's height there. */
  trace(r: SceneRiver): SceneRiver {
    if (r.from !== 'model' || !r.q) return r;
    const pts = r.xy.length / 2;
    const n = this.n;
    const c = this.c;
    // How far apart the drainage's nodes are: a node is moved no further than half of that.
    const spacing = pts > 1 ? Math.hypot(r.xy[2] - r.xy[0], r.xy[3] - r.xy[1]) : c.snap;
    const snap = Math.min(c.snap, spacing / 2);
    const at: number[] = [];
    for (let p = 0; p < pts; p++) {
      const k = this.cellOf(r.xy[p * 2], r.xy[p * 2 + 1]);
      at.push(k < 0 ? -1 : this.lowest(k, snap));
    }
    const xy: number[] = [];
    const q: number[] = [];
    const z: number[] = [];
    const every = Math.max(1, Math.round(c.keep / c.cell));
    const put = (k: number, flow: number) => {
      xy.push(this.x0 + (k % n) * c.cell, this.x0 + Math.floor(k / n) * c.cell);
      q.push(flow);
      z.push(Math.round(this.h[k] * 10) / 10);
    };
    for (let p = 0; p < pts; p++) {
      const a = at[p];
      if (a < 0) {
        // Beyond the grid it is as the drainage gives it.
        xy.push(r.xy[p * 2], r.xy[p * 2 + 1]);
        q.push(r.q[p]);
        z.push(r.z ? r.z[p] : 0);
      } else put(a, r.q[p]);
      const b = p + 1 < pts ? at[p + 1] : -1;
      if (a < 0 || b < 0 || a === b) continue;
      const way = this.way(a, b);
      // Its points along the way, every so many nodes, the next node's own left to the next turn of the loop.
      for (let w = every - 1; w < way.length - Math.ceil(every / 2); w += every) put(way[w], r.q[p] + ((r.q[p + 1] - r.q[p]) * (w + 1)) / way.length);
    }
    return { ...r, xy, q, z };
  }
}
