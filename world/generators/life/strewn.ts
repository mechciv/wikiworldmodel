// What lies strewn on the ground, as things that stand on it (docs/plans/RENDERING.md, the fidelity pass): stones,
// where the ground has them, and under trees the wood they shed, lengths of fallen trunk, stumps and fallen branches.
// Whether a ground has stones is its substrate's to say (core/substrate.ts), and which trees stand over a place is the
// scene's; what a stone or a fallen trunk looks like is decided here, and is nobody's record. A stone is drawn one
// metre across, to be sized where it is sown; fallen wood is drawn in metres, from its tree's own height, the thickness
// its form gives its trunk and the bark its part's type has standing (plants.ts). Each lies partly in the ground, so
// that it meets a ground that is not level.
import type { Form } from '../../../core/form.ts';
import { MAT, Mesh } from '../city/kit.ts';
import { dcos, dsin, hash2, TAU } from '../city/math.ts';
import { BARK, trunkOf, tube } from './plants.ts';

// ——— Stones ———

/** The shapes a stone is drawn in: a rounded cobble, an angular block, a slab and a pointed stone. */
const STONES = [
  { half: [0.5, 0.4, 0.3], round: 0.8, cuts: 3, lumps: 0.16, sunk: 0.38 },
  { half: [0.5, 0.43, 0.36], round: 0.12, cuts: 10, lumps: 0.2, sunk: 0.3 },
  { half: [0.5, 0.4, 0.15], round: 0.25, cuts: 7, lumps: 0.12, sunk: 0.3 },
  { half: [0.5, 0.34, 0.44], round: 0.3, cuts: 8, lumps: 0.22, sunk: 0.42 },
] as const;
/** Each shape is drawn from two seeds; and again finer, for a stone big enough to be looked at. */
export const STONE_SEEDS = 2;
export const STONE_VARIANTS = STONES.length * STONE_SEEDS;
/** The bit of a stone's variant that says it is drawn finer. */
export const STONE_FINE = 8;

/** A ball of triangles, each corner one from the middle: twenty faces, each split in four `level` times. */
function ball(level: number): { v: number[][]; f: number[][] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const l = Math.sqrt(1 + t * t);
  const a = 1 / l;
  const b = t / l;
  const v: number[][] = [[-a, b, 0], [a, b, 0], [-a, -b, 0], [a, -b, 0], [0, -a, b], [0, a, b], [0, -a, -b], [0, a, -b], [b, 0, -a], [b, 0, a], [-b, 0, -a], [-b, 0, a]];
  let f: number[][] = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let k = 0; k < level; k++) {
    const mid = new Map<number, number>();
    const between = (i: number, j: number): number => {
      const key = i < j ? i * 65536 + j : j * 65536 + i;
      let m = mid.get(key);
      if (m === undefined) {
        const x = v[i][0] + v[j][0];
        const y = v[i][1] + v[j][1];
        const z = v[i][2] + v[j][2];
        const d = Math.sqrt(x * x + y * y + z * z);
        m = v.length;
        v.push([x / d, y / d, z / d]);
        mid.set(key, m);
      }
      return m;
    };
    const next: number[][] = [];
    for (const [i, j, q] of f) {
      const ij = between(i, j);
      const jq = between(j, q);
      const qi = between(q, i);
      next.push([i, ij, qi], [j, jq, ij], [q, qi, jq], [ij, jq, qi]);
    }
    f = next;
  }
  return { v, f };
}

/** A direction, by two numbers of a hash: any, each as likely as another. */
function direction(i: number, seed: number): number[] {
  const z = hash2(i, 1, seed) * 2 - 1;
  const t = hash2(i, 2, seed) * TAU;
  const r = Math.sqrt(1 - z * z);
  return [r * dcos(t), r * dsin(t), z];
}

/**
 * A stone, one metre across at its widest, lying at the mesh's origin with the ground at z = 0 and part of it below:
 * a ball, swollen and hollowed in a few places, cut flat by planes where it broke, and squashed to its shape. Its
 * faces are flat where it is angular and run into one another where it is worn round. `variant`: which shape, which of
 * its seeds, and whether it is drawn finer.
 */
export function drawStone(m: Mesh, variant: number): void {
  const shape = STONES[variant % STONES.length];
  const seed = 0x51ed + ((variant & (STONE_FINE - 1)) + 1) * 7919;
  const { v, f } = ball(variant & STONE_FINE ? 2 : 1);
  const lumps = Array.from({ length: 6 }, (_, k) => ({ n: direction(k, seed), by: (hash2(k, 3, seed) - 0.5) * 2 * shape.lumps }));
  // A worn stone is cut little, an angular one deep, so that its faces are broad and meet at edges.
  const cuts = Array.from({ length: shape.cuts }, (_, k) => ({ n: direction(k + 20, seed), at: (shape.round > 0.5 ? 0.82 : 0.48) + (shape.round > 0.5 ? 0.3 : 0.38) * hash2(k, 4, seed) }));
  // Each seed's stone is a little longer or squatter than its shape.
  const half = [shape.half[0], shape.half[1] * (0.82 + 0.36 * hash2(1, 5, seed)), shape.half[2] * (0.8 + 0.4 * hash2(2, 5, seed))];
  const pts = v.map(([x, y, z]) => {
    let r = 1;
    for (const l of lumps) {
      const d = x * l.n[0] + y * l.n[1] + z * l.n[2];
      if (d > 0.2) {
        const t = (d - 0.2) / 0.8;
        r += l.by * t * t * (3 - 2 * t);
      }
    }
    let p = [x * r, y * r, z * r];
    for (const c of cuts) {
      const d = p[0] * c.n[0] + p[1] * c.n[1] + p[2] * c.n[2] - c.at;
      if (d > 0) p = [p[0] - c.n[0] * d, p[1] - c.n[1] * d, p[2] - c.n[2] * d];
    }
    return [p[0] * half[0], p[1] * half[1], p[2] * half[2]];
  });
  // One metre across, and as much of its height as its shape says under the ground.
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[2] < z0) z0 = p[2];
    if (p[2] > z1) z1 = p[2];
  }
  const k = 1 / (x1 - x0);
  const down = z0 + shape.sunk * (z1 - z0);
  for (const p of pts) {
    p[0] = (p[0] - (x0 + x1) / 2) * k;
    p[1] *= k;
    p[2] = (p[2] - down) * k;
  }
  const top = (z1 - down) * k;
  // Each corner's own normal: its faces', by their size.
  const smooth = pts.map(() => [0, 0, 0]);
  const flat = f.map(([a, b, c]) => {
    const ex = pts[b][0] - pts[a][0];
    const ey = pts[b][1] - pts[a][1];
    const ez = pts[b][2] - pts[a][2];
    const gx = pts[c][0] - pts[a][0];
    const gy = pts[c][1] - pts[a][1];
    const gz = pts[c][2] - pts[a][2];
    const n = [ey * gz - ez * gy, ez * gx - ex * gz, ex * gy - ey * gx];
    for (const i of [a, b, c]) {
      smooth[i][0] += n[0];
      smooth[i][1] += n[1];
      smooth[i][2] += n[2];
    }
    const l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  });
  for (const n of smooth) {
    const l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
    n[0] /= l;
    n[1] /= l;
    n[2] /= l;
  }
  m.mat = MAT.stone;
  m.tint = 128;
  f.forEach((face, q) => {
    // What lies well under the ground is never seen, on any slope a stone lies on.
    if (pts[face[0]][2] < -0.22 && pts[face[1]][2] < -0.22 && pts[face[2]][2] < -0.22) return;
    const at = face.map((i) => {
      const p = pts[i];
      let nx = flat[q][0] * (1 - shape.round) + smooth[i][0] * shape.round;
      let ny = flat[q][1] * (1 - shape.round) + smooth[i][1] * shape.round;
      let nz = flat[q][2] * (1 - shape.round) + smooth[i][2] * shape.round;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      // Its foot sees less of the sky than its top.
      const up = p[2] / (top * 0.35);
      return m.v(p[0], p[1], p[2], nx, ny, nz, p[0], p[1], 0.5 + 0.5 * (up < 0 ? 0 : up > 1 ? 1 : up));
    });
    m.tri(at[0], at[1], at[2]);
  });
}

// ——— Fallen wood ———

/** What of a tree lies under it: a length of its trunk, one broken in two, its stump, a fallen branch and a fallen bough. */
export const WOOD = { log: 0, broken: 1, stump: 2, branch: 3, bough: 4 } as const;
export const WOOD_SHAPES = 5;
/** Each is drawn from two seeds. */
export const WOOD_SEEDS = 2;

/**
 * What a tree of a form sheds: fallen trunks and stumps, if it has a trunk at all; and branches, if its limbs branch,
 * as a conifer's, a broad-leaved tree's and a scale tree's do. A palm, a tree fern and a calamite shed fronds and
 * stems, which are not drawn as wood.
 */
export function shedsWood(form: Form): { trunks: boolean; branches: boolean } {
  const t = form.kind === 'plant' ? trunkOf(form) : undefined;
  return { trunks: !!t, branches: !!t && (t.bark === BARK.furrowed || t.bark === BARK.cushioned) };
}

/** How long a piece of fallen wood of a tree `h` metres tall lies, end to end, in metres: what room it needs. */
export function woodLength(form: Form, h: number, shape: number, seed: number): number {
  const t = trunkOf(form);
  if (!t) return 0;
  const R = h * t.r;
  if (shape === WOOD.log || shape === WOOD.broken) return Math.min(14, h * (0.22 + 0.2 * hash2(1, 1, seed)));
  if (shape === WOOD.stump) return R * 3.2;
  if (shape === WOOD.branch) return Math.max(0.8, Math.min(3.2, h * (0.07 + 0.05 * hash2(1, 1, seed))));
  return Math.max(1.6, Math.min(6, h * (0.14 + 0.08 * hash2(1, 1, seed))));
}

/**
 * Where a trunk or a limb broke: a ragged ring of splinters round its edge, and the wood between them, at `c` with the
 * limb's way out of the break along `d`. Its uv is across the break in metres from its middle, for the wood's rings.
 */
function brokenEnd(m: Mesh, c: number[], d: number[], r: number, n: number, seed: number): void {
  const keep = m.mat;
  m.mat = MAT.heartwood;
  const l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
  const ax = d[0] / l;
  const ay = d[1] / l;
  const az = d[2] / l;
  // Two directions across it.
  let ux = -ay;
  let uy = ax;
  let uz = 0;
  let ul = Math.sqrt(ux * ux + uy * uy);
  if (ul < 0.1) {
    ux = 1;
    uy = 0;
    ul = 1;
  }
  ux /= ul;
  uy /= ul;
  const wx = ay * uz - az * uy;
  const wy = az * ux - ax * uz;
  const wz = ax * uy - ay * ux;
  // The middle stands in or out of the break, and each splinter at the edge out of it by its own length.
  const mid = (hash2(1, 9, seed) - 0.3) * r * 0.5;
  const o = m.v(c[0] + ax * mid, c[1] + ay * mid, c[2] + az * mid, ax, ay, az, 0, 0);
  const ring: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (TAU * i) / n;
    const co = dcos(t);
    const si = dsin(t);
    const out = (hash2(i, 10, seed) - 0.4) * r * 0.45;
    const ex = ux * co + wx * si;
    const ey = uy * co + wy * si;
    const ez = uz * co + wz * si;
    // A splinter's face leans out from the middle.
    let nx = ax + ex * 0.5;
    let ny = ay + ey * 0.5;
    let nz = az + ez * 0.5;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    ring.push(m.v(c[0] + ex * r + ax * out, c[1] + ey * r + ay * out, c[2] + ez * r + az * out, nx, ny, nz, co * r, si * r));
  }
  for (let i = 0; i < n; i++) m.tri(o, ring[i], ring[(i + 1) % n]);
  m.mat = keep;
}

/** A length of trunk lying along +y from y0 to y1, thinning from r0 to r1, bowed a little, part of it in the ground; broken at both ends. */
function lying(m: Mesh, x: number, y0: number, y1: number, r0: number, r1: number, turn: number, bark: number, sides: number, seed: number): void {
  const len = y1 - y0;
  const steps = Math.max(3, Math.min(9, Math.ceil(len / 1.4)));
  const bow = (hash2(2, 1, seed) - 0.5) * len * 0.04;
  const c = dcos(turn);
  const s = dsin(turn);
  const pts: number[][] = [];
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    const r = r0 + (r1 - r0) * f;
    const along = (f - 0.5) * len;
    const aside = bow * (1 - (2 * f - 1) * (2 * f - 1)) + (hash2(k, 2, seed) - 0.5) * r * 0.25;
    // Turned about its middle, in the plane of the ground; its axis four fifths of its radius above it.
    pts.push([x + aside * c - along * s, (y0 + y1) / 2 + aside * s + along * c, r * 0.8, r]);
  }
  tube(m, pts, sides, bark);
  const a = pts[0];
  const b = pts[1];
  brokenEnd(m, a, [a[0] - b[0], a[1] - b[1], a[2] - b[2]], a[3], sides, seed + 1);
  const e = pts[steps];
  const g = pts[steps - 1];
  brokenEnd(m, e, [e[0] - g[0], e[1] - g[1], e[2] - g[2]], e[3], sides, seed + 2);
  // The stubs of its branches, where a tree of its kind has branches: broken short, on its upper side.
  if (bark === BARK.furrowed) {
    const stubs = 2 + Math.floor(hash2(3, 1, seed) * 3);
    for (let q = 0; q < stubs; q++) {
      const f = 0.25 + 0.7 * hash2(q, 3, seed);
      const k = Math.min(steps - 1, Math.floor(f * steps));
      const p = pts[k];
      const t = (hash2(q, 4, seed) - 0.5) * 2.4;
      const rs = p[3] * (0.1 + 0.1 * hash2(q, 5, seed));
      const ls = p[3] * (0.35 + 0.9 * hash2(q, 6, seed));
      const ox = dsin(t) * c;
      const oy = dsin(t) * s;
      const oz = dcos(t);
      const tip = [p[0] + ox * (p[3] + ls), p[1] + oy * (p[3] + ls), p[2] + oz * (p[3] + ls)];
      tube(m, [[p[0] + ox * p[3] * 0.6, p[1] + oy * p[3] * 0.6, p[2] + oz * p[3] * 0.6, rs], [tip[0], tip[1], tip[2], rs * 0.8]], 5, bark);
      brokenEnd(m, tip, [ox, oy, oz], rs * 0.8, 5, seed + 10 + q);
    }
  }
}

/** A limb along the ground from `a`, `len` long towards `turn`, forking `depth` times: thin, bowed, its twigs rising a little. */
function limbDown(m: Mesh, a: number[], turn: number, len: number, r: number, depth: number, lift: number, bark: number, sides: number, seed: number): void {
  const c = dsin(turn);
  const s = dcos(turn);
  const bend = (hash2(1, depth, seed) - 0.5) * 0.7;
  const steps = len > 1.6 ? 5 : 3;
  const pts: number[][] = [];
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    // Bowed, and crooked at each of its joints, as a branch that grew towards the light is.
    const side = bend * len * f * f + (k > 0 && k < steps ? (hash2(k, 20 + depth, seed) - 0.5) * len * 0.07 : 0);
    pts.push([a[0] + c * len * f + s * side, a[1] + s * len * f - c * side, a[2] + lift * len * f * f, r * (1 - 0.72 * f)]);
  }
  tube(m, pts, sides, bark);
  if (depth <= 0) return;
  const forks = 2 + (hash2(2, depth, seed) < 0.5 ? 0 : 1);
  for (let q = 0; q < forks; q++) {
    const f = 0.3 + 0.5 * ((q + hash2(q, 3 + depth, seed)) / forks);
    const k = Math.min(steps - 1, Math.floor(f * steps));
    const p = pts[k];
    const way = turn + (q % 2 ? 1 : -1) * (0.5 + 0.5 * hash2(q, 5 + depth, seed));
    limbDown(m, [p[0], p[1], p[2]], way, len * (0.3 + 0.2 * hash2(q, 7 + depth, seed)), p[3] * 0.62, depth - 1, lift + 0.12 * hash2(q, 9 + depth, seed), bark, Math.max(3, sides - 1), seed + 31 * (q + 1));
  }
}

/**
 * A piece of the wood a tree `h` metres tall sheds, lying at the mesh's origin along +y, the ground at z = 0: a length
 * of its trunk, one broken in two, the stump it broke from, a branch or a bough. In its tree's own bark, and its own
 * tone.
 */
export function drawWood(m: Mesh, form: Form, h: number, shape: number, seed: number, tint: number): void {
  const t = trunkOf(form);
  if (!t) return;
  m.light = 0.85;
  m.tint = tint;
  m.mat = MAT.fallenBark;
  const R = h * t.r;
  const len = woodLength(form, h, shape, seed);
  switch (shape) {
    case WOOD.log: {
      // A length from somewhere up the trunk, which is thinner than its foot.
      const r0 = R * (0.45 + 0.35 * hash2(2, 2, seed));
      lying(m, 0, -len / 2, len / 2, r0, r0 * (0.6 + 0.2 * hash2(3, 2, seed)), 0, t.bark, r0 > 0.16 ? 10 : 8, seed);
      break;
    }
    case WOOD.broken: {
      // Two lengths of one trunk, the further thinner and knocked a little out of line.
      const r0 = R * (0.45 + 0.35 * hash2(2, 2, seed));
      const rm = r0 * 0.82;
      const gap = len * (0.03 + 0.04 * hash2(4, 2, seed));
      const cut = len * (0.05 * (hash2(5, 2, seed) - 0.5));
      lying(m, 0, -len / 2, cut - gap / 2, r0, rm, 0, t.bark, r0 > 0.16 ? 10 : 8, seed);
      lying(m, (hash2(6, 2, seed) - 0.5) * r0 * 3, cut + gap / 2, len / 2, rm * 0.98, rm * (0.62 + 0.2 * hash2(7, 2, seed)), (hash2(8, 2, seed) - 0.5) * 0.4, t.bark, rm > 0.16 ? 10 : 8, seed + 50);
      break;
    }
    case WOOD.stump: {
      // The foot of a trunk that broke: flared where it meets the ground, as tall as a few of its own thicknesses.
      const tall = Math.max(0.3, Math.min(1.7, R * (2.4 + 4 * hash2(2, 2, seed))));
      const flare = t.bark === BARK.furrowed ? 1.5 : 1.15;
      const lean = (hash2(3, 2, seed) - 0.5) * 0.12 * tall;
      const sides = R > 0.16 ? 10 : 8;
      tube(m, [[0, 0, -0.35, R * flare * 1.1], [0, 0, 0.03, R * flare], [lean * 0.2, 0, tall * 0.3, R * (1 + (flare - 1) * 0.3)], [lean * 0.6, 0, tall * 0.7, R], [lean, 0, tall, R * 0.95]], sides, t.bark);
      // Where it broke, the splinters stand up.
      brokenEnd(m, [lean, 0, tall], [0.05, 0, 1], R * 0.95, sides, seed + 3);
      break;
    }
    case WOOD.branch: {
      const r = Math.max(0.01, Math.min(0.034, R * 0.085));
      limbDown(m, [0, -len / 2, r * 0.8], 0, len, r, 2, 0.02, t.bark, 5, seed);
      break;
    }
    default: {
      const r = Math.max(0.03, Math.min(0.1, R * 0.22));
      limbDown(m, [0, -len / 2, r * 0.8], 0, len, r, 3, 0.03, t.bark, 6, seed);
      brokenEnd(m, [0, -len / 2, r * 0.8], [0, -1, 0], r, 6, seed + 4);
    }
  }
}
