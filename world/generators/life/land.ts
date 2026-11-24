// The land under a living scene: noise, a river's course and its old bends, and the height of the plain they cut.
// Where the world gives a place no river and the scene invents one, the river is a channel that has migrated
// (meander.ts): its bends are what migration left, its oxbows the loops it cut off, and the bars inside its bends the
// ground it has swept, lower and barer the more lately it left. Written with only + − × ÷, square roots and integer
// operations, as generators were before any arithmetic was allowed; what the build and a browser make is now held to
// agree within the tolerance of core/fingerprint.ts.
import { dsin, hash2, Rng, TAU } from '../city/math.ts';
import { decay, migrate, place, resample, type Migration } from './meander.ts';
import type { LakeMap } from './lakes.ts';
import type { Oxbow, RiverPath } from './rivers.ts';

/** How a river and its plain are drawn. Nothing here is a claim about any river. */
export interface PlainParams {
  /** the bearing the river runs towards, and how wide and deep it is */
  flow: number;
  width: number;
  depth: number;
  /**
   * How its channel migrated to the bends it has (meander.ts), and what that leaves on the plain: how many steps a bar
   * takes to rise most of the way to the plain, trees standing on it again after four times as many; the height of the
   * scrolls across it, m, and how many steps lie between two; and how many steps a cut-off loop holds water for before
   * it has silted up.
   */
  migration: Migration & { heal: number; scroll: [number, number]; lake: number };
  /** how far a bank runs from the water to the plain, least and most */
  bank: [number, number];
  /** how high the plain stands over the water, how much it varies, and over what distance */
  rise: number;
  roughness: number;
  size: number;
  /** a raised bank along the river: its height and its width */
  levee: [number, number];
  /** ponds in the back swamps, and their radius */
  ponds: number;
  pond_radius: [number, number];
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Smooth noise, 0–1, its features about a unit across. */
export function noise(x: number, y: number, seed: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = x - i;
  const v = y - j;
  const a = hash2(i, j, seed);
  const b = hash2(i + 1, j, seed);
  const c = hash2(i, j + 1, seed);
  const d = hash2(i + 1, j + 1, seed);
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

/** Noise in three octaves, 0–1. */
export function fbm(x: number, y: number, seed: number): number {
  return (noise(x, y, seed) * 4 + noise(x * 2.03, y * 2.03, seed + 1) * 2 + noise(x * 4.1, y * 4.1, seed + 2)) / 7;
}

// ——— The river and its plain ———

/** How many steps ago the channel last lay at a place it has not lain at in the time kept: never, as far as is known. */
export const NEVER = 1e9;

/** How long a valley an invented river is migrated down, m: past the edge of the plain it is drawn on, either way. */
const VALLEY = 76000;

/** The grids the swept ground is worked out on: the ground's own fine and middle grids (scene/v14.ts). */
const SWEPT_GRIDS: GridSpec[] = [
  { nx: 1281, ny: 1281, x0: -6400, y0: -6400, cell: 10 },
  { nx: 1281, ny: 1281, x0: -32000, y0: -32000, cell: 50 },
];

/**
 * For each node of a grid, how many steps ago a channel last lay over it, from its centreline at each step kept, oldest
 * first; NEVER where it has not. A node the channel left between two lines left it part of the way from one to the
 * next: as far as it was inside the channel at the first and is outside it at the second.
 */
function ageGrid(gs: GridSpec, lines: { ago: number; xy: Float64Array }[], half: number): Float32Array {
  const { nx, ny, x0, y0, cell } = gs;
  const n = nx * ny;
  const age = new Float32Array(n).fill(NEVER);
  // How far from the centreline a node was the last time it was in the channel, and which line that was: −2 once it
  // has been seen to have left.
  const within = new Float32Array(n);
  const last = new Int16Array(n).fill(-1);
  const d = new Float32Array(n);
  const seen = new Int16Array(n).fill(-1);
  const touched = new Int32Array(n);
  // A node is held against a line as far off as a channel moves between two lines, and its own width.
  const reach = half * 3 + cell;
  const r2 = reach * reach;
  const k = Math.ceil(reach / cell);
  lines.forEach((line, li) => {
    const xy = line.xy;
    let count = 0;
    for (let s = 0; s + 3 < xy.length; s += 2) {
      const ax = xy[s];
      const ay = xy[s + 1];
      const ex = xy[s + 2] - ax;
      const ey = xy[s + 3] - ay;
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + ex) - x0) / cell) - k);
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, ax + ex) - x0) / cell) + k);
      const j0 = Math.max(0, Math.floor((Math.min(ay, ay + ey) - y0) / cell) - k);
      const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, ay + ey) - y0) / cell) + k);
      if (i0 > i1 || j0 > j1) continue;
      const q = ex * ex + ey * ey || 1;
      for (let j = j0; j <= j1; j++) {
        const py = y0 + j * cell - ay;
        for (let i = i0; i <= i1; i++) {
          const px = x0 + i * cell - ax;
          const t0 = (px * ex + py * ey) / q;
          const t = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
          const fx = px - ex * t;
          const fy = py - ey * t;
          const v = fx * fx + fy * fy;
          if (v > r2) continue;
          const at = j * nx + i;
          const dist = Math.sqrt(v);
          if (seen[at] !== li) {
            seen[at] = li;
            d[at] = dist;
            touched[count++] = at;
          } else if (dist < d[at]) d[at] = dist;
        }
      }
    }
    const ago = line.ago;
    const before = li > 0 ? lines[li - 1].ago : ago;
    for (let c = 0; c < count; c++) {
      const at = touched[c];
      if (d[at] <= half) {
        last[at] = li;
        within[at] = d[at];
        age[at] = ago;
      } else if (li > 0 && last[at] === li - 1) {
        age[at] = before - ((before - ago) * (half - within[at])) / (d[at] - within[at]);
        last[at] = -2;
      }
    }
  });
  return age;
}

/**
 * The ground an invented river has swept: at any point, how many steps ago its channel last lay there. Worked out on
 * two grids when first asked, from where the channel lay at each step kept.
 */
export class Swept {
  private grids: { gs: GridSpec; age: Float32Array }[] | undefined;
  /** `lines`: the channel's centreline at each step kept, oldest first, each with how many steps ago it was; `half`: half its width */
  constructor(private lines: { ago: number; xy: Float64Array }[], private half: number) {}
  /** how many steps ago the channel last lay at a point: 0 in the channel now, NEVER where it has not been */
  age(x: number, y: number): number {
    this.grids ??= SWEPT_GRIDS.map((gs) => ({ gs, age: ageGrid(gs, this.lines, this.half) }));
    for (const { gs, age } of this.grids) {
      const u = (x - gs.x0) / gs.cell;
      const v = (y - gs.y0) / gs.cell;
      if (u < 0 || v < 0 || u > gs.nx - 1 || v > gs.ny - 1) continue;
      const i = Math.min(gs.nx - 2, Math.floor(u));
      const j = Math.min(gs.ny - 2, Math.floor(v));
      const fu = u - i;
      const fv = v - j;
      const at = j * gs.nx + i;
      return (age[at] * (1 - fu) + age[at + 1] * fu) * (1 - fv) + (age[at + gs.nx] * (1 - fu) + age[at + gs.nx + 1] * fu) * fv;
    }
    return NEVER;
  }
}

/** The distance from each node of a grid to a set of lines: exact near them, stepped further off. */
export function distanceField(nx: number, ny: number, x0: number, y0: number, cell: number, lines: number[][], reach: number): Float32Array {
  const d = new Float32Array(nx * ny).fill(1e9);
  const k = Math.ceil(reach / cell);
  for (const l of lines) {
    for (let s = 0; s + 3 < l.length; s += 2) {
      const ax = l[s];
      const ay = l[s + 1];
      const ex = l[s + 2] - ax;
      const ey = l[s + 3] - ay;
      const q = ex * ex + ey * ey || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + ex) - x0) / cell) - k);
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, ax + ex) - x0) / cell) + k);
      const j0 = Math.max(0, Math.floor((Math.min(ay, ay + ey) - y0) / cell) - k);
      const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, ay + ey) - y0) / cell) + k);
      for (let j = j0; j <= j1; j++) {
        const py = y0 + j * cell - ay;
        for (let i = i0; i <= i1; i++) {
          const px = x0 + i * cell - ax;
          const t0 = (px * ex + py * ey) / q;
          const t = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
          const fx = px - ex * t;
          const fy = py - ey * t;
          const v = fx * fx + fy * fy;
          const at = j * nx + i;
          if (v < d[at] * d[at]) d[at] = Math.sqrt(v);
        }
      }
    }
  }
  chamfer(d, nx, ny, cell);
  return d;
}

/** Two sweeps that carry each node's distance on to its neighbours, across and along and on the diagonals. In place. */
export function chamfer(d: Float32Array, nx: number, ny: number, cell: number): void {
  const diag = cell * Math.SQRT2;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const at = j * nx + i;
      let v = d[at];
      if (i > 0 && d[at - 1] + cell < v) v = d[at - 1] + cell;
      if (j > 0) {
        if (d[at - nx] + cell < v) v = d[at - nx] + cell;
        if (i > 0 && d[at - nx - 1] + diag < v) v = d[at - nx - 1] + diag;
        if (i < nx - 1 && d[at - nx + 1] + diag < v) v = d[at - nx + 1] + diag;
      }
      d[at] = v;
    }
  }
  for (let j = ny - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const at = j * nx + i;
      let v = d[at];
      if (i < nx - 1 && d[at + 1] + cell < v) v = d[at + 1] + cell;
      if (j < ny - 1) {
        if (d[at + nx] + cell < v) v = d[at + nx] + cell;
        if (i < nx - 1 && d[at + nx + 1] + diag < v) v = d[at + nx + 1] + diag;
        if (i > 0 && d[at + nx - 1] + diag < v) v = d[at + nx - 1] + diag;
      }
      d[at] = v;
    }
  }
}

/**
 * How far each node of a grid stands outside a set of old bends, m, negative inside one: each a line drawn widest at
 * its middle, `half(k)` either side for the kth, and narrowing to its ends, as a loop silts from its ends inward.
 * Beyond `reach` of them all, far off.
 */
export function outsideOf(gs: GridSpec, lines: number[][], half: (k: number) => number, reach: number): Float32Array {
  const { nx, ny, x0, y0, cell } = gs;
  const out = new Float32Array(nx * ny).fill(1e9);
  lines.forEach((l, li) => {
    const n = l.length / 2;
    const widest = half(li);
    // Half its width at each point: a third of it at the ends, all of it by a fifth of the way along.
    const at = (i: number) => widest * (0.34 + 0.66 * smooth(0, 0.2, Math.min(i, n - 1 - i) / (n - 1)));
    const k = Math.ceil((reach + widest) / cell);
    for (let s = 0; s + 3 < l.length; s += 2) {
      const ax = l[s];
      const ay = l[s + 1];
      const ex = l[s + 2] - ax;
      const ey = l[s + 3] - ay;
      const q = ex * ex + ey * ey || 1;
      const ha = at(s / 2);
      const hb = at(s / 2 + 1);
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + ex) - x0) / cell) - k);
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, ax + ex) - x0) / cell) + k);
      const j0 = Math.max(0, Math.floor((Math.min(ay, ay + ey) - y0) / cell) - k);
      const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, ay + ey) - y0) / cell) + k);
      for (let j = j0; j <= j1; j++) {
        const py = y0 + j * cell - ay;
        for (let i = i0; i <= i1; i++) {
          const px = x0 + i * cell - ax;
          const t0 = (px * ex + py * ey) / q;
          const t = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
          const fx = px - ex * t;
          const fy = py - ey * t;
          const off = Math.sqrt(fx * fx + fy * fy) - (ha + (hb - ha) * t);
          if (off < out[j * nx + i]) out[j * nx + i] = off;
        }
      }
    }
  });
  return out;
}

export interface Waters {
  river: number[];
  /** the old bends that still hold water, as lines; and, for an invented river's, how far each has silted up, 0–1 */
  oxbows: number[][];
  silted?: number[];
  /** ponds: x, y, radius across, radius along, in fours */
  ponds: number[];
  /** an invented river's older bends, silted up: hollows on the plain, as lines; and the ground it has swept */
  scars?: number[][];
  swept?: Swept;
  /** where the world says where its lakes stand: a map of how far each point lies inside a shore */
  lakes?: LakeMap;
  /** where the world says where the rivers run: each drawn, and the oxbows of their older courses */
  paths?: RiverPath[];
  oxbowList?: Oxbow[];
}

/** How far apart the points of a river and its old bends are drawn, m. */
const DRAWN = 20;

/**
 * The waters of a plain whose river the scene invents: a river that has migrated to its bends (meander.ts), running
 * to the plain's bearing through the middle; the loops it cut off, those cut lately still holding water and the older
 * ones silted to hollows, each without what the channel has crossed since and without its ends, which silt first; the
 * ground it has swept; and ponds in the back swamps, off that ground.
 */
export function watersOf(g: PlainParams, seed: number, reach: number): Waters {
  const mg = g.migration;
  const made = migrate(VALLEY, g.width, g.depth, mg, seed ^ 0x2f6b);
  // The point of it nearest the middle of its valley is the middle of the scene.
  let cx = VALLEY / 2;
  let cy = 0;
  let best = Infinity;
  for (let i = 0; i < made.xy.length; i += 2) {
    const dx = made.xy[i] - VALLEY / 2;
    const dy = made.xy[i + 1];
    const v = dx * dx + dy * dy;
    if (v < best) {
      best = v;
      cx = made.xy[i];
      cy = made.xy[i + 1];
    }
  }
  const put = (xy: Float64Array) => place(xy, cx, cy, g.flow);
  const river = Array.from(resample(put(made.xy), DRAWN));
  const swept = new Swept(
    made.past.map((p) => ({ ago: made.steps - p.step, xy: put(p.xy) })),
    g.width / 2,
  );
  const oxbows: number[][] = [];
  const silted: number[] = [];
  const scars: number[][] = [];
  for (const loop of made.loops) {
    const ago = made.steps - loop.step;
    const xy = resample(put(loop.xy), DRAWN);
    const n = xy.length / 2;
    // Its ends silt up first, and further the older it is.
    const plug = Math.round((g.width * (1.2 + (1.8 * ago) / mg.lake)) / DRAWN);
    const keep = (from: number, to: number) => {
      const a = from + plug;
      const b = to - plug;
      if ((b - a) * DRAWN < g.width * 3) return;
      const line = Array.from(xy.subarray(a * 2, b * 2 + 2));
      if (ago < mg.lake) {
        oxbows.push(line);
        silted.push(ago / mg.lake);
      } else scars.push(line);
    };
    // What the channel has lain over since it was cut is gone.
    let from = -1;
    for (let i = 0; i <= n; i++) {
      const gone = i === n || swept.age(xy[i * 2], xy[i * 2 + 1]) < ago - mg.every * 2;
      if (!gone && from < 0) from = i;
      else if (gone && from >= 0) {
        keep(from, i - 1);
        from = -1;
      }
    }
  }
  const rng = new Rng(seed ^ 0x51ed27);
  const near = (x: number, y: number, far: number) => {
    let closest = 1e18;
    for (let s = 0; s < river.length; s += 8) {
      const dx = river[s] - x;
      const dy = river[s + 1] - y;
      const v = dx * dx + dy * dy;
      if (v < closest) closest = v;
    }
    return Math.sqrt(closest) < far;
  };
  const ponds: number[] = [];
  for (let k = 0, tries = 0; k < g.ponds && tries < 400; tries++) {
    const x = rng.range(-reach, reach);
    const y = rng.range(-reach, reach);
    const a = rng.range(g.pond_radius[0], g.pond_radius[1]);
    if (near(x, y, a * 2 + g.width) || swept.age(x, y) < NEVER / 2) continue;
    ponds.push(x, y, a, a * rng.range(0.55, 1));
    k++;
  }
  return { river, oxbows, silted, ponds, scars, swept };
}

/**
 * How bare of trees the ground an invented river has swept still is, 0–1, at a point: wholly where the channel left
 * lately, and not at all once a bar has had four times the `heal` steps it takes to rise to the plain; and for long
 * after, barer in the swales between its scrolls than on them, so that trees stand in rows along the old banks.
 * Nothing where no river was invented.
 */
export function freshOf(w: Waters, mg: PlainParams['migration']): ((x: number, y: number) => number) | undefined {
  const swept = w.swept;
  if (!swept) return undefined;
  return (x, y) => {
    const ago = swept.age(x, y);
    if (ago > NEVER / 2) return 0;
    const young = 1 - smooth(mg.heal, mg.heal * 4, ago);
    const swale = 0.85 * smooth(0.1, 0.6, -dsin((TAU * ago) / mg.scroll[1])) * decay(ago / (mg.heal * 6));
    return young > swale ? young : swale;
  };
}

export interface GridSpec {
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  cell: number;
}

/** The height of the plain over one grid, in metres, with its waters cut in. */
export function plainGrid(spec: GridSpec, g: PlainParams, water: number, seed: number, w: Waters): Float32Array {
  const { nx, ny, x0, y0, cell } = spec;
  const toRiver = distanceField(nx, ny, x0, y0, cell, [w.river], 320);
  // An old bend is narrower than the river that left it, and narrower the further it has silted up.
  const toOxbow = w.oxbows.length ? outsideOf(spec, w.oxbows, (k) => Math.max(g.width * (0.46 - 0.2 * (w.silted?.[k] ?? 0)), cell * 0.8), 90) : null;
  const toScar = w.scars?.length ? outsideOf(spec, w.scars, () => Math.max(g.width * 0.3, cell * 0.8), 50) : null;
  const mg = g.migration;
  const z = new Float32Array(nx * ny);
  const half0 = Math.max(g.width / 2, cell * 1.1);
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * cell;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * cell;
      const at = j * nx + i;
      const d = toRiver[at];
      // The plain: low swells, and back swamps where it sags.
      const swell = fbm(x / g.size, y / g.size, seed + 21);
      const sag = smooth(0.58, 0.74, noise(x / (g.size * 3.1), y / (g.size * 3.1), seed + 22));
      let plain = water + g.rise + (swell - 0.5) * 2 * g.roughness - sag * g.rise * 0.72;
      const half = half0 * (0.84 + 0.32 * noise(x / 1400, y / 1400, seed + 23));
      const off = d - half;
      // A raised bank along the river.
      const lk = off / g.levee[1];
      plain += g.levee[0] / (1 + lk * lk);
      // Ground the channel has swept is a bar: at the water where it has only just left, risen to the plain where it
      // left long ago, and crossed by scrolls, a ridge and a swale for every so many steps of its going. So the inside
      // of a bend shelves, and the outside, which the river is cutting into, is a bank of the old plain.
      const ago = w.swept ? w.swept.age(x, y) : NEVER;
      if (ago < NEVER / 2) {
        const bar = (plain - water) * (1 - decay(ago / mg.heal));
        plain = water + bar;
        // No swale of a scroll lies deeper than the bar stands over the water; and a grid too coarse to hold a scroll draws none.
        if (cell * 4 < g.width) plain += Math.min(mg.scroll[0], bar * 0.6) * decay(ago / (mg.heal * 6)) * dsin((TAU * ago) / mg.scroll[1]);
      }
      let h: number;
      if (off < 0) {
        const f = d / half;
        h = water - g.depth * (1 - f * f);
      } else {
        const bank = g.bank[0] + (g.bank[1] - g.bank[0]) * smooth(0.36, 0.72, noise(x / 620, y / 620, seed + 24));
        const t = clamp01(off / bank);
        h = water + (plain - water) * (t * t * (3 - 2 * t));
      }
      if (toOxbow) {
        const off2 = toOxbow[at];
        if (off2 < 90) {
          if (off2 < 0) {
            const f = clamp01(-off2 / 22);
            h = Math.min(h, water - 2.2 * f * (2 - f));
          } else {
            const t = clamp01(off2 / 60);
            h = Math.min(h, water + (h - water) * (t * t * (3 - 2 * t)));
          }
        }
      }
      // A silted bend: a hollow, damp at its floor, with no water standing in it.
      if (toScar) {
        const off2 = toScar[at];
        if (off2 < 50) {
          const floor = water + g.rise * 0.22;
          const t = clamp01(off2 / 50);
          h = Math.min(h, floor + (h - floor) * (t * t * (3 - 2 * t)));
        }
      }
      for (let k = 0; k < w.ponds.length; k += 4) {
        const dx = (x - w.ponds[k]) / w.ponds[k + 2];
        const dy = (y - w.ponds[k + 1]) / w.ponds[k + 3];
        const e = dx * dx + dy * dy;
        if (e < 2.4) {
          if (e < 1) h = Math.min(h, water - 1.3 * (1 - e));
          else {
            const t = clamp01((Math.sqrt(e) - 1) / 0.5);
            h = Math.min(h, water + (h - water) * (t * t * (3 - 2 * t)));
          }
        }
      }
      z[at] = h;
    }
  }
  return z;
}

/**
 * Where a visitor arrives: the inside of the sharpest bend near the origin, a little back from the water; and the
 * direction from there to the river. Of a river the scene invented, the sharpest bend that has firm ground there.
 */
export function arrival(w: Waters, reach: number, inset: number, firm?: (x: number, y: number) => boolean): { at: [number, number]; toRiver: [number, number] } {
  const r = w.river;
  const n = r.length >> 1;
  let best = -1;
  let bestK = 0;
  const span = 14;
  // Inside a bend of a river that has migrated, but not so far in as to stand by the bend's other limb or by an old
  // bend that holds water, nor on the bare sand of a bar the channel has only just left: on `firm` ground.
  const clear = inset * inset * 0.72;
  const dry = (px: number, py: number) => {
    if (!w.swept) return true;
    if (firm && !firm(px, py)) return false;
    for (const line of [r, ...w.oxbows]) {
      for (let k = 0; k < line.length; k += 2) {
        const dx = line[k] - px;
        const dy = line[k + 1] - py;
        if (dx * dx + dy * dy < clear) return false;
      }
    }
    return true;
  };
  for (let i = span; i < n - span; i++) {
    const x = r[i * 2];
    const y = r[i * 2 + 1];
    if (x * x + y * y > reach * reach) continue;
    const ax = r[(i - span) * 2];
    const ay = r[(i - span) * 2 + 1];
    const bx = r[(i + span) * 2];
    const by = r[(i + span) * 2 + 1];
    // How far the bend stands off its chord.
    const mx = (ax + bx) / 2 - x;
    const my = (ay + by) / 2 - y;
    const k = mx * mx + my * my;
    if (k > best && dry(x + (mx / (Math.sqrt(k) || 1)) * inset, y + (my / (Math.sqrt(k) || 1)) * inset)) {
      best = k;
      bestK = i;
    }
  }
  if (best < 0) {
    // No bend near the middle: the river's nearest point, come to from the middle.
    let near = 0;
    let d = Infinity;
    for (let k = 0; k < n; k++) {
      const e = r[k * 2] * r[k * 2] + r[k * 2 + 1] * r[k * 2 + 1];
      if (e < d) {
        d = e;
        near = k;
      }
    }
    const x = r[near * 2];
    const y = r[near * 2 + 1];
    const l = Math.sqrt(d) || 1;
    return { at: [x - (x / l) * inset, y - (y / l) * inset], toRiver: [x / l, y / l] };
  }
  const i = bestK;
  const x = r[i * 2];
  const y = r[i * 2 + 1];
  const mx = (r[(i - span) * 2] + r[(i + span) * 2]) / 2 - x;
  const my = (r[(i - span) * 2 + 1] + r[(i + span) * 2 + 1]) / 2 - y;
  const l = Math.sqrt(mx * mx + my * my) || 1;
  return { at: [x + (mx / l) * inset, y + (my / l) * inset], toRiver: [-mx / l, -my / l] };
}

