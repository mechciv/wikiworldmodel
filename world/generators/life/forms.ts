// Forms into meshes: what core/form.ts holds as data, drawn on the city's mesh. Each body is written
// in its own frame, its front towards +y and the ground at z = 0. Lengths along and across the body are
// shares of its length L, and heights shares of its hip height H unless a part says `zl`; in a head's
// frame everything is a share of L. Written with only + − × ÷, square roots and integers; the build and the
// browser are held to agree within the tolerance of core/fingerprint.ts. Which parts there are, and the numbers in them,
// are data: what a taxon looks like is never in this file.
import type { Form, Part, Pose } from '../../../core/form.ts';
import { LEAF_KINDS } from '../../../core/leaves.ts';
import { MAT, Mesh, limb } from '../city/kit.ts';
import { dcos, dsin, PI, TAU } from '../city/math.ts';
import { drawPlant } from './plants.ts';

// ——— Tubes and lumps ———

/** A section of a tube: its centre, and its half-width and half-height. */
export interface Ring {
  x?: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

/** A tube's end, rounded off: two smaller rings past its last, so nothing is left open. */
function rounded(rings: Ring[], flatEnd: boolean): Ring[] {
  const end = (a: Ring, b: Ring, reach = 1): Ring[] => {
    const dx = (a.x ?? 0) - (b.x ?? 0);
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const r = a.w > a.h ? a.w : a.h;
    const at = (k: number, q: number): Ring => ({ x: (a.x ?? 0) + (dx / l) * r * k * reach, y: a.y + (dy / l) * r * k * reach, z: a.z + (dz / l) * r * k * reach, w: a.w * q, h: a.h * q });
    return [at(0.5, 0.72), at(0.8, 0.3)];
  };
  const n = rings.length;
  const head = end(rings[0], rings[1]);
  return [head[1], head[0], ...rings, ...end(rings[n - 1], rings[n - 2], flatEnd ? 0.02 : 1)];
}

/**
 * A skin through rings, each an ellipse square to the line through its neighbours, its ends closed: flat at the last, if
 * it stands on it. `codes`, if given, is what each ring of `section` moves with (see `bone`), its rounded ends with it.
 */
export function loft(m: Mesh, section: Ring[], n: number, flatEnd = false, codes?: number[]): void {
  const rings = rounded(section, flatEnd);
  const base = m.verts;
  let arc = 0;
  const count = rings.length;
  const keep = m.entity;
  for (let r = 0; r < count; r++) {
    if (codes) m.entity = codes[Math.max(0, Math.min(codes.length - 1, r - 2))];
    const a = rings[r > 0 ? r - 1 : 0];
    const b = rings[r < count - 1 ? r + 1 : count - 1];
    const c = rings[r];
    let tx = (b.x ?? 0) - (a.x ?? 0);
    let ty = b.y - a.y;
    let tz = b.z - a.z;
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    // Across: x made square to the tangent; if the tube runs along x, then y.
    let rx = 1 - tx * tx;
    let ry = -tx * ty;
    let rz = -tx * tz;
    let rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rl < 0.05) {
      rx = -ty * tx;
      ry = 1 - ty * ty;
      rz = -ty * tz;
      rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    }
    rx /= rl;
    ry /= rl;
    rz /= rl;
    // Up: across × along, so that a tube running along +y has its up towards +z.
    const ux = ry * tz - rz * ty;
    const uy = rz * tx - rx * tz;
    const uz = rx * ty - ry * tx;
    const cx = c.x ?? 0;
    for (let i = 0; i <= n; i++) {
      const t = (TAU * i) / n;
      const co = dcos(t);
      const si = dsin(t);
      const px = rx * co * c.w + ux * si * c.h;
      const py = ry * co * c.w + uy * si * c.h;
      const pz = rz * co * c.w + uz * si * c.h;
      // An ellipse's normal leans towards its flatter side.
      let nx = rx * co * c.h + ux * si * c.w;
      let ny = ry * co * c.h + uy * si * c.w;
      let nz = rz * co * c.h + uz * si * c.w;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      m.v(cx + px, c.y + py, c.z + pz, nx, ny, nz, i, arc);
    }
    if (r < count - 1) {
      const dx = (rings[r + 1].x ?? 0) - cx;
      const dy = rings[r + 1].y - c.y;
      const dz = rings[r + 1].z - c.z;
      arc += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }
  m.entity = keep;
  for (let r = 0; r < count - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = base + r * (n + 1) + i;
      const d = a + n + 1;
      m.quad(a, a + 1, d + 1, d);
    }
  }
}

/** A flattened ball. */
export function lump(m: Mesh, x: number, y: number, z: number, rx: number, ry: number, rz: number, n: number, rings: number): void {
  const base = m.verts;
  for (let j = 0; j <= rings; j++) {
    const a = -PI / 2 + (PI * j) / rings;
    const ca = dcos(a);
    const sa = dsin(a);
    for (let i = 0; i <= n; i++) {
      const t = (TAU * i) / n;
      const c = dcos(t);
      const s = dsin(t);
      let nx = c * ca * ry * rz;
      let ny = s * ca * rx * rz;
      let nz = sa * rx * ry;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      m.v(x + c * ca * rx, y + s * ca * ry, z + sa * rz, nx, ny, nz, i, j);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < n; i++) {
      const a = base + j * (n + 1) + i;
      const d = a + n + 1;
      m.quad(a, a + 1, d + 1, d);
    }
  }
}

/** A point standing out of a body: a horn, a spike. */
function horn(m: Mesh, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, n: number): void {
  limb(m, ax, ay, az, bx, by, bz, r, r * 0.06, n);
}

/** A chain of joints, thick and thin: a leg or an arm. */
function chain(m: Mesh, pts: number[][], n: number, flatEnd = false): void {
  loft(
    m,
    pts.map(([x, y, z, r]) => ({ x, y, z, w: r, h: r })),
    n,
    flatEnd,
  );
}

/**
 * A leg through joints, each [x, y, z, radius, depth]: `depth` is how much deeper it is fore and aft than it is wide,
 * as a thigh is and a shank is not. It stands on its last joint.
 */
function leg(m: Mesh, pts: number[][], n: number): void {
  loft(
    m,
    pts.map(([x, y, z, r, deep]) => ({ x, y, z, w: r, h: r * (deep ?? 1) })),
    n,
    true,
  );
}

/** A flat outline, drawn as two faces a little apart, each lit for the side it faces. Points are [x, y, z], a fan from the first. */
function sheet(m: Mesh, pts: number[][], gap: number): void {
  const [ax, ay, az] = pts[0];
  // The normal of the whole outline, from the sum of its triangles' areas.
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const ex = pts[i][0] - ax;
    const ey = pts[i][1] - ay;
    const ez = pts[i][2] - az;
    const fx = pts[i + 1][0] - ax;
    const fy = pts[i + 1][1] - ay;
    const fz = pts[i + 1][2] - az;
    nx += ey * fz - ez * fy;
    ny += ez * fx - ex * fz;
    nz += ex * fy - ey * fx;
  }
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  for (const face of [-1, 1]) {
    const start = m.verts;
    for (let i = 0; i < pts.length; i++) {
      const [x, y, z] = pts[i];
      m.v(x + nx * gap * face, y + ny * gap * face, z + nz * gap * face, nx * face, ny * face, nz * face, i, 0);
    }
    for (let i = 1; i + 1 < pts.length; i++) m.tri(start, start + i, start + i + 1);
  }
}

// ——— How a body stands ———

export const POSE = { stand: 0, walk: 1, graze: 2, drink: 3, alert: 4, rest: 5, fly: 6 } as const satisfies Record<Pose, number>;

/**
 * What a point of an animal moves with, as the renderer idles it (docs/plans/RENDERING.md, step 5): nothing, its head,
 * its neck, its tail, or the trunk that breathes. A mesh drawn many times keeps it in each vertex's entity, which such a
 * mesh does not otherwise use: the bone in the low four bits, and how far the point goes with it, 0–255, above them.
 */
export const BONE = { none: 0, head: 1, neck: 2, tail: 3, body: 4 } as const;
export const bone = (b: number, weight = 1): number => b | (Math.max(0, Math.min(255, Math.round(weight * 255))) << 4);

/** The joints an animal idles about, in its own frame: where its neck leaves its shoulders, its hips, and its middle. */
export interface Joints {
  neck: [number, number, number];
  hip: [number, number, number];
  middle: [number, number, number];
}

/** Detail: 2 close by, 1 from a way off, and 0 only a shape. */
export type Detail = 0 | 1 | 2;

/** What the plan says of one body. */
export interface Stance {
  /** snout to tail, and the height of the hips, in metres */
  L: number;
  H: number;
  pose: number;
  /** where in its stride it is, 0–1; and which way its tail is swung */
  phase: number;
  sway: number;
  detail: Detail;
  /** colour, 0–255 */
  tint: number;
  biped: boolean;
}

const LOW = (p: number) => p === POSE.graze || p === POSE.drink;

export const MATERIALS: Record<string, number> = { hide: MAT.hide, horn: MAT.horn, shell: MAT.shell, fur: MAT.fur, feather: MAT.feather, membrane: MAT.membrane, chitin: MAT.chitin, dark: MAT.dark, bark: MAT.bark, needle: MAT.needle, frond: MAT.frond, broad: MAT.broad };

/** The head's frame: its joint in the body, and how far it is pitched down. */
interface HeadPlace {
  jy: number;
  jz: number;
  pitch: number;
}

const has = (p: Part, k: string) => p[k] !== undefined && p[k] !== null;
const num = (p: Part, k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
const list = (p: Part, k: string) => p[k] as number[];
const table = (p: Part, k: string) => p[k] as number[][];
/** How many sides a part's tubes have: close by, a body's trunk, head and tubes half as many again, so that its outline is round (step 6). */
const sides = (p: Part, d: [number, number], detail: Detail): number => {
  const s = (p.sides as [number, number] | undefined) ?? d;
  const round = p.type === 'trunk' || p.type === 'head' || p.type === 'tube';
  return detail >= 2 ? (round ? Math.round(s[0] * 1.5) : s[0]) : detail === 1 ? s[1] : Math.max(3, s[1] >> 1);
};

/**
 * A head's or a tube's rings, close by: one more between each two, on a smooth curve through them (Catmull and Rom),
 * so that it is round along its length as well as across (docs/plans/RENDERING.md, step 6).
 */
function finer(rings: Ring[]): Ring[] {
  if (rings.length < 3) return rings;
  const out: Ring[] = [];
  const at = (i: number) => rings[Math.max(0, Math.min(rings.length - 1, i))];
  // Held between the two rings it falls between, so that it never bulges past them, nor below the ground.
  const cr = (a: number, b: number, c: number, d: number) => {
    const v = 0.5 * (b + c) + 0.125 * (b - a + c - d);
    return v < Math.min(b, c) ? Math.min(b, c) : v > Math.max(b, c) ? Math.max(b, c) : v;
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    out.push(b);
    out.push({ x: cr(a.x ?? 0, b.x ?? 0, c.x ?? 0, d.x ?? 0), y: cr(a.y, b.y, c.y, d.y), z: cr(a.z, b.z, c.z, d.z), w: cr(a.w, b.w, c.w, d.w), h: cr(a.h, b.h, c.h, d.h) });
  }
  out.push(rings[rings.length - 1]);
  return out;
}

/** Is a part drawn in this stance, at this detail? */
function drawn(p: Part, s: Stance, upright: boolean): boolean {
  if (p.near && s.detail < 2) return false;
  if (p.far && s.detail >= 2) return false;
  if (s.detail === 0 && !TINY.has(p.type) && !p.far) return false;
  const poses = p.poses as Pose[] | undefined;
  if (poses && !poses.some((x) => POSE[x] === s.pose)) return false;
  const not = p.not as Pose[] | undefined;
  if (not && not.some((x) => POSE[x] === s.pose)) return false;
  if (p.stance === 'upright' && !upright) return false;
  if (p.stance === 'four' && upright) return false;
  return true;
}

/** What is still worth drawing when a body is only a shape. */
const TINY = new Set(['trunk', 'head', 'lump', 'pillar', 'digitigrade', 'shell', 'wing', 'tube', 'chain']);

/** The material and colour a part takes. */
function dress(m: Mesh, p: Part, s: Stance, standard: string): void {
  m.mat = MATERIALS[(p.mat as string) ?? standard] ?? MAT.hide;
  if (has(p, 'tint')) m.tint = p.tint as number;
  else if (has(p, 'tint_add')) m.tint = (s.tint + (p.tint_add as number)) & 255;
  else m.tint = s.tint;
}

/** Rings from a table of [y/L, top/H, bottom/H, half-width/L], with the tail swung. */
function trunkRings(s: Stance, rows: number[][]): Ring[] {
  const { L, H, sway } = s;
  const rings: Ring[] = [];
  const tailEnd = rows[0][0];
  for (const [y, top, bottom, w] of rows) {
    // Only behind the hips does the tail swing, more towards its tip.
    const behind = y < -0.14 ? (-0.14 - y) / (-0.14 - tailEnd) : 0;
    rings.push({ x: sway * L * behind * behind, y: y * L, z: ((top + bottom) * H) / 2, w: w * L, h: ((top - bottom) * H) / 2 });
  }
  return rings;
}

/** The rings of a neck, along a curve from the shoulder to the back of the head. */
function neckRings(from: Ring, jy: number, jz: number, r1: number, steps: number): Ring[] {
  const out: Ring[] = [];
  // The curve leaves the shoulder level and comes into the head from behind.
  const cy = from.y + (jy - from.y) * 0.6;
  const cz = from.z + (jz - from.z) * 0.15;
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const u = 1 - t;
    const y = u * u * from.y + 2 * u * t * cy + t * t * jy;
    const z = u * u * from.z + 2 * u * t * cz + t * t * jz;
    const w = from.w + (r1 - from.w) * t;
    const h = from.h + (r1 - from.h) * t;
    out.push({ y, z, w, h });
  }
  return out;
}

/** Fewer rings from afar: every other one, keeping the ends; and fewer still if it is only a shape. */
function thin(rings: Ring[], detail: Detail): Ring[] {
  if (detail >= 2) return rings;
  const half = rings.filter((_, i) => i % 2 === 0 || i === rings.length - 1);
  if (detail === 1 || half.length < 4) return half;
  return half.filter((_, i) => i % 2 === 0 || i === half.length - 1);
}

/** Where a head is, for a pose: reaching down, the end of a head `reach` long comes to the ground and no further. */
function headPlace(head: Part | null | undefined, s: Stance, upright: boolean): HeadPlace {
  const poses = (head?.at ?? {}) as Record<string, { y: number; z?: number; reach?: number; clear?: number; pitch: number }>;
  const stand = poses.stand ?? { y: 0, z: 0, pitch: 0 };
  let q = stand;
  if (LOW(s.pose) && poses.low) q = poses.low;
  else if (upright && poses.upright) q = poses.upright;
  else if (s.pose === POSE.fly && poses.fly) q = poses.fly;
  else if (s.pose === POSE.alert && poses.alert) q = poses.alert;
  const jz = q.reach !== undefined ? q.reach * s.L * dsin(q.pitch) + (q.clear ?? 0.04) * s.H : (q.z ?? 0) * s.H;
  return { jy: q.y * s.L, jz, pitch: q.pitch };
}

const swings = (s: Stance, amp: number): [number, number] => {
  if (s.pose !== POSE.walk && s.pose !== POSE.fly) return [0, 0];
  const a = dsin(TAU * s.phase);
  return [a * amp, -a * amp];
};

/** A hind leg that bends at the knee and runs up on its toes. */
function digitigrade(m: Mesh, side: number, s: Stance, p: Part, swing: number): void {
  const { L, H, detail } = s;
  const y0 = num(p, 'y', 0) * L;
  const x0 = num(p, 'x', 0) * L;
  const top = num(p, 'top', 1);
  const knee = num(p, 'knee', 0.6);
  const ankle = num(p, 'ankle', 0.25);
  const r0 = num(p, 'r', 0.04);
  const n = sides(p, [8, 4], detail);
  const ky = y0 + (0.055 + swing * 0.55) * L;
  const ay = y0 + (-0.035 + swing * 0.8) * L;
  const fy = y0 + (0.008 + swing) * L;
  const lift = swing > 0.02 ? swing * 0.25 * H : 0;
  const kz = knee * H + lift;
  const az = ankle * H + lift;
  const fz = 0.022 * H + lift;
  const x = x0 * side;
  const r = r0 * L;
  // A thigh deep fore and aft, a knee, a shank with its calf behind it, a narrow hock, a foot that spreads on the ground.
  const pts = [
    [x, y0, top * H, r * 0.9, 1.5],
    [x * 1.04, y0 + (ky - y0) * 0.45, (top * H + kz) * 0.5, r * 1.02, 1.45],
    [x * 1.07, y0 + (ky - y0) * 0.86, kz + (top * H - kz) * 0.14, r * 0.72, 1.2],
    [x * 1.08, ky, kz, r * 0.56, 1.05],
    [x * 1.08, ky + (ay - ky) * 0.3, kz + (az - kz) * 0.3, r * 0.5, 1.25],
    [x * 1.07, ky + (ay - ky) * 0.72, kz + (az - kz) * 0.72, r * 0.36, 1.1],
    [x * 1.04, ay, az, r * 0.27, 1],
    [x * 1.02, ay + (fy - ay) * 0.6, az + (fz - az) * 0.6, r * 0.22, 1],
    [x, fy, fz + r * 0.2, r * 0.25, 1.1],
    [x, fy + r * 0.12, fz * 0.3, r * 0.34, 1.3],
  ];
  leg(m, pts, n);
  // Where it leaves the body, the muscle of the haunch.
  if (detail >= 2) {
    // No higher than the hip itself: it rounds the flank, and stands out of the back nowhere.
    const rz = Math.min(r * 1.9, top * H * 0.3);
    lump(m, x, y0 + (ky - y0) * 0.14, top * H - rz * 0.9, r * 0.78, r * 1.5, rz, 9, 5);
  }
  if (p.toes !== false && detail >= 2) {
    for (const k of [-1, 0, 1]) {
      const tx = x + k * r0 * L * 0.42;
      horn(m, x, fy, fz, tx + k * r0 * L * 0.5, fy + r0 * L * (1.5 - Math.abs(k) * 0.3), fz * 0.4 - lift * 0.3, r0 * L * 0.2, 4);
    }
  }
}

/** A leg held straight under the body. */
function pillar(m: Mesh, side: number, s: Stance, p: Part, swing: number): void {
  const { L, H, detail } = s;
  const n = sides(p, [8, 4], detail);
  const y0 = num(p, 'y', 0) * L;
  const x = num(p, 'x', 0) * L * side;
  const top = num(p, 'top', 0.7);
  const r0 = num(p, 'r', 0.05);
  const fy = y0 + swing * L;
  const lift = swing > 0.02 ? swing * 0.25 * H : 0;
  const r = r0 * L;
  // Deep at the shoulder, a knee half way down, a slender cannon, and a foot that spreads where it stands.
  const pts = [
    [x, y0, top * H, r, 1.4],
    [x * 1.02, y0 + (fy - y0) * 0.2, (top * 0.78 + 0.02) * H + lift * 0.2, r * 0.9, 1.3],
    [x * 1.03, y0 + (fy - y0) * 0.4, (top * 0.55 + 0.04) * H + lift * 0.4, r * 0.76, 1.05],
    [x * 1.04, y0 + (fy - y0) * 0.5, (top * 0.47 + 0.035) * H + lift * 0.5, r * 0.8, 1.15],
    [x * 1.05, y0 + (fy - y0) * 0.75, (top * 0.22 + 0.02) * H + lift, r * 0.6, 1],
    [x * 1.05, y0 + (fy - y0) * 0.92, (top * 0.08 + 0.01) * H + lift, r * 0.58, 1],
    [x * 1.05, fy, lift + r * 0.5, r * 0.7, 1.1],
    [x * 1.05, fy + r * 0.1, lift, r * 0.82, 1.2],
  ];
  leg(m, pts, n);
  if (detail >= 2) {
    const rz = Math.min(r * 2, top * H * 0.28);
    lump(m, x, y0, top * H - rz * 0.9, r * 0.8, r * 1.5, rz, 9, 5);
  }
}

/** A wing: spread when flying, as a membrane or feathers from the shoulder out; folded along the flank otherwise. */
function wing(m: Mesh, side: number, s: Stance, p: Part): void {
  const { L, H, detail } = s;
  const [sx, sy, sz] = list(p, 'shoulder');
  const x0 = sx * L * side;
  const y0 = sy * L;
  const z0 = sz * H;
  if (s.pose === POSE.fly) {
    const span = num(p, 'span', 0.8) * L;
    const chord = num(p, 'chord', 0.25) * L;
    const sweep = num(p, 'sweep', 0.2) * L;
    // Beating: the tip rises and falls with the stride.
    const beat = dsin(TAU * s.phase) * num(p, 'beat', 0.25) * span;
    const mid: number[] = [x0 + side * span * 0.5, y0 + chord * 0.1, z0 + beat * 0.35];
    const tip: number[] = [x0 + side * span, y0 - sweep, z0 + beat];
    const back: number[] = [x0 + side * span * 0.5, y0 - chord, z0 + beat * 0.2];
    const root: number[] = [x0, y0 - chord * 0.9, z0];
    sheet(m, [[x0, y0, z0], mid, tip, back, root], 0.002 * L);
    if (detail >= 2) {
      const arm = num(p, 'arm', 0.012) * L;
      chain(m, [[x0, y0, z0, arm], [mid[0], mid[1], mid[2], arm * 0.7], [tip[0], tip[1], tip[2], arm * 0.2]], 5);
    }
    return;
  }
  // Folded: a long narrow leaf along the flank.
  const len = num(p, 'folded', 0.3) * L;
  const drop = num(p, 'drop', 0.12) * H;
  const chord = num(p, 'chord', 0.25) * L * 0.35;
  sheet(m, [[x0, y0, z0], [x0 + side * chord * 0.12, y0 - len * 0.3, z0 - drop * 0.1], [x0 + side * chord * 0.06, y0 - len, z0 - drop], [x0 + side * chord * 0.18, y0 - len * 0.4, z0 - drop * 0.9]], 0.003 * L);
}

// ——— The parts of an animal ———

/** Draw one part of an animal, in the mesh's current frame. */
function drawPart(m: Mesh, p: Part, s: Stance, head: HeadPlace, tailEnd: number): void {
  const { L, H, detail } = s;
  // What the part moves with: a head, or what is on it, with the head; legs with nothing; the rest with the trunk, or
  // with the tail where it lies behind the hips.
  const at = (p.at as number[] | undefined) ?? (p.from as number[] | undefined);
  const y0 = typeof p.y === 'number' ? (p.y as number) : at ? at[1] : 0;
  m.entity = p.type === 'head' || p.on === 'head' || p.type === 'eyes' ? bone(BONE.head) : p.type === 'pillar' || p.type === 'digitigrade' || p.type === 'chain' || p.type === 'wing' ? bone(BONE.none) : y0 < -0.14 && tailEnd < -0.14 ? bone(BONE.tail, Math.min(1, (-0.14 - y0) / (-0.14 - tailEnd))) : bone(BONE.body);
  const c = dcos(head.pitch);
  const sn = dsin(head.pitch);
  const onHead = p.on === 'head';
  const zk = p.zl ? L : H;
  /** How far a tail has swung at a place along the body: whatever is on it goes with it. */
  const swung = (y: number) => {
    if (!s.sway || y >= -0.14 || tailEnd >= -0.14) return 0;
    const behind = (-0.14 - y) / (-0.14 - tailEnd);
    return s.sway * L * (behind > 1 ? 1 : behind) * (behind > 1 ? 1 : behind);
  };
  /** A point of the part's frame: across, along and up. */
  const pt = (x: number, y: number, z: number): [number, number, number] => (onHead ? [x * L, head.jy + y * L * c + z * L * sn, head.jz - y * L * sn + z * L * c] : [x * L + swung(y), y * L, z * zk]);
  const mirrored = (draw: (side: number) => void) => {
    if (p.mirror) for (const side of [-1, 1]) draw(side);
    else draw(1);
  };
  switch (p.type) {
    case 'trunk': {
      dress(m, p, s, 'hide');
      const body = trunkRings(s, table(p, 'rings'));
      const neck = p.neck as { r: number; steps?: [number, number] } | undefined;
      const necked = neck ? neckRings(body[body.length - 1], head.jy, head.jz, neck.r * L, detail >= 2 ? (neck.steps?.[0] ?? 3) : (neck.steps?.[1] ?? 1)) : [];
      // Close by, one more ring between each two of the body's, on a smooth curve through them, as a head has (step 6).
      const rings = detail >= 2 ? [...finer(body), ...necked] : thin([...body, ...necked], detail);
      // Behind the hips the tail swings, the more the further back; the neck goes with the head, the more the nearer it;
      // the rest breathes.
      const tailEnd = body[0].y;
      const codes = rings.map((r) => {
        if (necked.includes(r)) return bone(BONE.neck, (necked.indexOf(r) + 1) / (necked.length + 1));
        if (r.y < -0.14 * L && tailEnd < -0.14 * L) return bone(BONE.tail, (-0.14 * L - r.y) / (-0.14 * L - tailEnd));
        return bone(BONE.body);
      });
      loft(m, rings, sides(p, [14, 6], detail), false, codes);
      return;
    }
    case 'head':
    case 'tube': {
      dress(m, p, s, 'hide');
      // A head's rings are always in its own frame, and all in shares of L.
      const inHead = p.type === 'head' || onHead;
      const rings: Ring[] = table(p, 'rings').map((r) => {
        const [x, y, z, w, h] = r.length === 4 ? [0, r[0], r[1], r[2], r[3]] : r;
        const q: [number, number, number] = inHead ? [x * L, head.jy + y * L * c + z * L * sn, head.jz - y * L * sn + z * L * c] : [x * L, y * L, z * zk];
        return { x: q[0], y: q[1], z: q[2], w: w * L, h: h * (inHead ? L : zk) };
      });
      loft(m, p.thin === false ? rings : detail >= 2 ? finer(rings) : thin(rings, detail), sides(p, [14, 6], detail), !!p.flat);
      return;
    }
    case 'chain': {
      dress(m, p, s, 'hide');
      // A chain may walk: it swings from its first joint out to its last, each side against the other.
      const amp = num(p, 'swing', 0);
      const list0 = table(p, 'points');
      mirrored((side) => {
        const [a, b] = swings(s, amp);
        const stride = (side < 0) === !!p.phase ? a : b;
        const pts = list0.map(([x, y, z, r], k) => {
          const f = list0.length > 1 ? k / (list0.length - 1) : 0;
          const q = pt(x * side, y + stride * f, z);
          return [q[0], q[1], q[2] + (stride > 0.02 ? stride * f * (1 - f) * 2 * L : 0), r * L];
        });
        chain(m, pts, sides(p, [6, 4], detail), !!p.flat);
      });
      return;
    }
    case 'lump': {
      dress(m, p, s, 'hide');
      const [x, y, z] = list(p, 'at');
      const [rx, ry, rz] = list(p, 'r');
      const bands = (p.bands as [number, number] | undefined) ?? [6, 3];
      const sway = num(p, 'sway', 0) * s.sway * L;
      mirrored((side) => {
        const q = pt(x * side, y, z);
        lump(m, q[0] + sway, q[1], q[2], rx * L, ry * L, rz * L, sides(p, [10, 5], detail), detail >= 2 ? bands[0] : Math.max(2, bands[1]));
      });
      return;
    }
    case 'spike': {
      dress(m, p, s, 'horn');
      const [ax, ay, az] = list(p, 'from');
      const [bx, by, bz] = list(p, 'to');
      const sway = num(p, 'sway', 0) * s.sway * L;
      mirrored((side) => {
        const a = pt(ax * side, ay, az);
        const b = pt(bx * side, by, bz);
        horn(m, a[0], a[1], a[2], b[0] + sway, b[1], b[2], num(p, 'r', 0.01) * L, sides(p, [7, 4], detail));
      });
      return;
    }
    case 'pillar':
    case 'digitigrade': {
      dress(m, p, s, 'hide');
      const [a, b] = swings(s, num(p, 'swing', 0.05));
      for (const side of [-1, 1]) {
        const left = side < 0 ? a : b;
        const right = side < 0 ? b : a;
        const swing = p.phase ? right : left;
        if (p.type === 'pillar') pillar(m, side, s, p, swing);
        else digitigrade(m, side, s, p, swing);
      }
      return;
    }
    case 'fan': {
      dress(m, p, s, 'hide');
      const [along, up] = list(p, 'at');
      const [dirA, dirU] = list(p, 'dir');
      const [, cy, cz] = pt(0, along, up);
      // Up and back along its plane, and its normal, forward and up.
      const vy = dirA * c + dirU * sn;
      const vz = -dirA * sn + dirU * c;
      const ny = -vz;
      const nz = vy;
      const R = num(p, 'r', 0.2) * L;
      const rim = sides(p, [18, 7], detail);
      const across = num(p, 'across', 0.92);
      const tall = num(p, 'tall', 0.92);
      const raise = num(p, 'raise', 0.18);
      const scallop = num(p, 'scallop', 0);
      const count = num(p, 'scallops', 18);
      const arc = (p.arc as [number, number] | undefined) ?? [-0.5, PI + 0.5];
      const thick = num(p, 'gap', 0.009) * L;
      // Two sheets a little apart, each lit for the side it faces.
      for (const face of [-1, 1]) {
        const gap = face * thick;
        const hub = m.v(0, cy + ny * gap, cz + nz * gap, 0, ny * face, nz * face, 0, 0);
        const start = m.verts;
        for (let i = 0; i <= rim; i++) {
          const a = arc[0] + ((arc[1] - arc[0]) * i) / rim;
          const wave = detail >= 2 ? 1 + scallop * dcos(a * count) : 1;
          const rx = dcos(a) * R * across * wave;
          const rv = (dsin(a) * tall + raise) * R * wave;
          m.v(rx, cy + vy * rv + ny * gap * 0.3, cz + vz * rv + nz * gap * 0.3, 0, ny * face, nz * face, i, rv);
        }
        for (let i = 0; i < rim; i++) m.tri(hub, start + i, start + i + 1);
      }
      return;
    }
    case 'eyes': {
      const keep = m.mat;
      m.mat = MAT.eye;
      const [x, y, z] = list(p, 'at');
      const r = num(p, 'r', 0.01) * L;
      for (const side of [-1, 1]) {
        const q = pt(x * side, y, z);
        lump(m, q[0], q[1], q[2], r * 0.7, r, r, 6, 4);
      }
      m.mat = keep;
      return;
    }
    case 'bands': {
      // Bands of armour over a back, the outer ones spiked.
      dress(m, p, s, 'horn');
      const rows = num(p, 'rows', 8);
      const y0 = num(p, 'y', -0.2);
      const step = num(p, 'step', 0.06);
      const middle = num(p, 'middle', 3.2);
      const fall = num(p, 'fall', 20);
      const wide = num(p, 'wide', 0.15);
      const [t0, t1] = (p.top as [number, number] | undefined) ?? [0.96, 0.2];
      const low = num(p, 'low', 0.5);
      const out = num(p, 'out', 1.36);
      const big = num(p, 'spike', 0.016);
      const [lx, ly, lz] = (p.scute as [number, number, number] | undefined) ?? [0.014, 0.018, 0.008];
      for (let row = 0; row < rows; row++) {
        const y = (y0 + row * step) * L;
        const k = 1 - ((row - middle) * (row - middle)) / fall;
        const w = wide * k * L;
        const top = (t0 + t1 * k) * H;
        for (let i = -3; i <= 3; i++) {
          const u = i / 3.2;
          const x = u * w;
          const z = (low + (top / H - low) * Math.sqrt(Math.max(0.04, 1 - u * u))) * H;
          if (i === -3 || i === 3) horn(m, x, y, z - 0.02 * H, x * out, y - 0.01 * L, z - 0.06 * H, big * L, 5);
          else lump(m, x, y, z, lx * L, ly * L, lz * L, 6, 3);
        }
      }
      return;
    }
    case 'row': {
      // Things in a line down a body: plates, spikes, scutes, each sized by where it is.
      dress(m, p, s, 'horn');
      const n = num(p, 'n', 8);
      const [ax, ay, az] = list(p, 'from');
      const [bx, by, bz] = list(p, 'to');
      const size = p.size as number[] | undefined;
      const item = (p.item as string) ?? 'lump';
      const r = (p.r as number[]) ?? [0.01, 0.01, 0.01];
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0;
        const k = size ? (() => {
          const f = t * (size.length - 1);
          const q = Math.min(size.length - 2, Math.floor(f));
          return size[q] + (size[q + 1] - size[q]) * (f - q);
        })() : 1;
        mirrored((side) => {
          const q = pt((ax + (bx - ax) * t) * side, ay + (by - ay) * t, az + (bz - az) * t);
          if (item === 'lump') lump(m, q[0], q[1], q[2], r[0] * L * k, r[1] * L * k, r[2] * L * k, sides(p, [5, 5], detail), num(p, 'bands', 2));
          else if (item === 'spike') horn(m, q[0], q[1], q[2], q[0] + side * r[0] * L * k, q[1] + r[1] * L * k, q[2] + r[2] * L * k, num(p, 'thick', 0.01) * L * k, 4);
          else {
            // A plate: a kite standing on the line, r[1] long and r[2] tall.
            const len = r[1] * L * k;
            const tall = r[2] * L * k;
            sheet(m, [[q[0], q[1] - len * 0.5, q[2]], [q[0], q[1] - len * 0.3, q[2] + tall * 0.7], [q[0], q[1], q[2] + tall], [q[0], q[1] + len * 0.3, q[2] + tall * 0.6], [q[0], q[1] + len * 0.5, q[2]]], 0.004 * L);
          }
        });
      }
      return;
    }
    case 'knobs': {
      // Small knobs in a ring around a head.
      dress(m, p, s, 'horn');
      const n = num(p, 'n', 9);
      const [along, up] = list(p, 'at');
      const [ra, rx, rout] = list(p, 'r');
      const len = num(p, 'length', 0.008);
      const thick = num(p, 'thick', 0.004) * L;
      for (let i = 0; i < n; i++) {
        const t = (TAU * i) / n;
        const [, ky, kz] = pt(0, along + dcos(t) * ra, up);
        horn(m, dsin(t) * rx * L, ky, kz, dsin(t) * rout * L, ky + dcos(t) * len * L, kz + len * L, thick, 4);
      }
      return;
    }
    case 'shell': {
      // A dome over a flat plastron. Its uv is metres on its own plan, for the scutes.
      dress(m, p, s, 'shell');
      const [srx, sry, srz] = list(p, 'r');
      const lift = num(p, 'lift', 0.07) * L;
      const n = sides(p, [14, 6], detail);
      const bandsOf = (p.bands as [number, number] | undefined) ?? [6, 3];
      const bands = detail >= 2 ? bandsOf[0] : bandsOf[1];
      const rx = srx * L;
      const ry = sry * L;
      const rz = srz * L;
      const base = m.verts;
      for (let j = 0; j <= bands; j++) {
        const a = (PI / 2) * (j / bands);
        const ca = dcos(a);
        const sa = dsin(a);
        for (let i = 0; i <= n; i++) {
          const t = (TAU * i) / n;
          const co = dcos(t);
          const e = dsin(t);
          let nx = co * ca * ry * rz;
          let ny = e * ca * rx * rz;
          let nz = sa * rx * ry;
          const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nx /= l;
          ny /= l;
          nz /= l;
          m.v(co * ca * rx, e * ca * ry, lift + sa * rz, nx, ny, nz, co * ca * rx, e * ca * ry);
        }
      }
      for (let j = 0; j < bands; j++) {
        for (let i = 0; i < n; i++) {
          const a = base + j * (n + 1) + i;
          const d = a + n + 1;
          m.quad(a, a + 1, d + 1, d);
        }
      }
      return;
    }
    case 'sheet': {
      dress(m, p, s, 'membrane');
      mirrored((side) => {
        const pts = table(p, 'points').map(([x, y, z]) => pt(x * side, y, z));
        sheet(m, pts, num(p, 'gap', 0.003) * L);
      });
      return;
    }
    case 'wing': {
      dress(m, p, s, 'feather');
      for (const side of [-1, 1]) wing(m, side, s, p);
      return;
    }
    default:
      throw new Error(`no part of type "${p.type}" in an animal`);
  }
}

/** Draw an animal in the mesh's current frame. */
export function drawAnimal(m: Mesh, form: Form, s: Stance): Joints {
  m.light = 1;
  m.tint = s.tint;
  const keep = m.entity;
  const upright = s.biped && !LOW(s.pose);
  const head = headPlace(form.parts.head, s, upright);
  // Where the tail ends: a trunk's first ring, and whatever is on it swings with it.
  let tailEnd = 0;
  let shoulder: Ring | null = null;
  let hips: Ring | null = null;
  for (const name of Object.keys(form.parts)) {
    const p = form.parts[name];
    if (p?.type === 'trunk' && Array.isArray(p.rings)) {
      tailEnd = Math.min(tailEnd, (p.rings as number[][])[0][0]);
      const rings = trunkRings(s, p.rings as number[][]);
      shoulder = rings[rings.length - 1];
      hips = rings.reduce((a, r) => (Math.abs(r.y + 0.14 * s.L) < Math.abs(a.y + 0.14 * s.L) ? r : a), rings[0]);
    }
  }
  for (const name of Object.keys(form.parts)) {
    const p = form.parts[name];
    if (!p || !drawn(p, s, upright)) continue;
    drawPart(m, p, s, head, tailEnd);
  }
  m.entity = keep;
  const neck: [number, number, number] = shoulder ? [0, shoulder.y, shoulder.z] : [0, head.jy * 0.6, head.jz];
  const hip: [number, number, number] = hips ? [0, hips.y, hips.z] : [0, -0.14 * s.L, s.H];
  return { neck, hip, middle: [0, (neck[1] + hip[1]) / 2, (neck[2] + hip[2]) / 2] };
}

// ——— The parts of a plant ———
//
// A plant's parts are drawn by plants.ts: each part type grows a skeleton by its own rule and holds its leaves on cards,
// each showing a spray or a bough of the part's kind of leaf (core/leaves.ts).
export { clumpWidth, drawClump, drawPlant } from './plants.ts';

// ——— What may be written ———

const COMMON = new Set(['type', 'mat', 'tint', 'tint_add', 'on', 'mirror', 'near', 'far', 'poses', 'not', 'stance', 'zl', 'sides', 'note']);
/** What any part of a plant may say besides: the kind of leaf it has (core/leaves.ts). */
const PLANT_COMMON = new Set(['leaf']);

/** Every part a form may have, and the fields each may hold; the fields listed second are required. */
export const PART_TYPES: Record<string, { kind: 'animal' | 'plant'; fields: string[]; needs: string[] }> = {
  trunk: { kind: 'animal', fields: ['rings', 'neck'], needs: ['rings'] },
  head: { kind: 'animal', fields: ['rings', 'at', 'thin', 'flat'], needs: ['rings', 'at'] },
  tube: { kind: 'animal', fields: ['rings', 'thin', 'flat'], needs: ['rings'] },
  chain: { kind: 'animal', fields: ['points', 'flat', 'swing', 'phase'], needs: ['points'] },
  lump: { kind: 'animal', fields: ['at', 'r', 'bands', 'sway'], needs: ['at', 'r'] },
  spike: { kind: 'animal', fields: ['from', 'to', 'r', 'sway'], needs: ['from', 'to'] },
  pillar: { kind: 'animal', fields: ['y', 'x', 'top', 'r', 'swing', 'phase'], needs: ['y', 'x', 'top', 'r'] },
  digitigrade: { kind: 'animal', fields: ['y', 'x', 'top', 'knee', 'ankle', 'r', 'swing', 'phase', 'toes'], needs: ['y', 'x', 'top', 'r'] },
  fan: { kind: 'animal', fields: ['at', 'dir', 'r', 'across', 'tall', 'raise', 'scallop', 'scallops', 'arc', 'gap'], needs: ['at', 'dir', 'r'] },
  eyes: { kind: 'animal', fields: ['at', 'r'], needs: ['at', 'r'] },
  bands: { kind: 'animal', fields: ['rows', 'y', 'step', 'middle', 'fall', 'wide', 'top', 'low', 'out', 'spike', 'scute'], needs: [] },
  row: { kind: 'animal', fields: ['n', 'from', 'to', 'size', 'item', 'r', 'thick', 'bands'], needs: ['n', 'from', 'to', 'r'] },
  knobs: { kind: 'animal', fields: ['n', 'at', 'r', 'length', 'thick'], needs: ['at', 'r'] },
  shell: { kind: 'animal', fields: ['r', 'lift', 'bands'], needs: ['r'] },
  sheet: { kind: 'animal', fields: ['points', 'gap'], needs: ['points'] },
  wing: { kind: 'animal', fields: ['shoulder', 'span', 'chord', 'sweep', 'beat', 'arm', 'folded', 'drop'], needs: ['shoulder'] },
  conifer: { kind: 'plant', fields: ['reach', 'trunk', 'flare', 'tiers', 'start', 'drop'], needs: [] },
  broadleaf: { kind: 'plant', fields: ['crown', 'fork', 'trunk', 'limbs', 'flare'], needs: [] },
  palm: { kind: 'plant', fields: ['trunk', 'lean', 'head', 'size', 'fronds'], needs: [] },
  fern: { kind: 'plant', fields: ['on_stem', 'stem', 'reach', 'fronds', 'across', 'arch', 'steps'], needs: [] },
  mat: { kind: 'plant', fields: ['radius'], needs: [] },
  whorled: { kind: 'plant', fields: ['trunk', 'reach', 'nodes', 'around', 'start', 'stem_mat'], needs: [] },
  'scale-tree': { kind: 'plant', fields: ['trunk', 'fork_at', 'spread', 'forks'], needs: [] },
  tuft: { kind: 'plant', fields: ['blades', 'spread', 'wide'], needs: [] },
  shrub: { kind: 'plant', fields: ['wide', 'lumps'], needs: [] },
};

/** What a fine mesh of one body may hold: a form that needs more is too fine to draw by the thousand. */
export const MAX_VERTICES = 30000;

/** The stance a form is checked and drawn in by default: a metre long, as its hips say. */
export const unitStance = (f: Form, pose: number, detail: Detail, phase = 0.25): Stance => ({ L: 1, H: f.hip ?? 0.3, pose, phase, sway: 0, detail, tint: 128, biped: false });

/** Everything wrong with a form, as sentences. */
export function checkForm(f: Form): string[] {
  const out: string[] = [];
  if (f.kind !== 'animal' && f.kind !== 'plant') return [`a form's kind is animal or plant, not "${String(f.kind)}"`];
  if (!f.parts || typeof f.parts !== 'object') return ['a form has parts'];
  for (const [name, p] of Object.entries(f.parts)) {
    if (!p) continue;
    const def = PART_TYPES[p.type];
    if (!def) {
      out.push(`part "${name}": no type "${p.type}"; the types are ${Object.keys(PART_TYPES).join(', ')}`);
      continue;
    }
    if (def.kind !== f.kind) out.push(`part "${name}": a ${p.type} belongs to a ${def.kind}, and this is a ${f.kind}`);
    for (const k of Object.keys(p)) if (!COMMON.has(k) && !(def.kind === 'plant' && PLANT_COMMON.has(k)) && !def.fields.includes(k)) out.push(`part "${name}": a ${p.type} has no field "${k}"; it has ${def.fields.join(', ')}`);
    if (p.leaf !== undefined && !(String(p.leaf) in LEAF_KINDS)) out.push(`part "${name}": no kind of leaf "${String(p.leaf)}"; there are ${Object.keys(LEAF_KINDS).join(', ')}`);
    for (const k of def.needs) if (p[k] === undefined) out.push(`part "${name}": a ${p.type} needs "${k}"`);
    if (p.mat !== undefined && MATERIALS[p.mat as string] === undefined) out.push(`part "${name}": no material "${String(p.mat)}"; there are ${Object.keys(MATERIALS).join(', ')}`);
  }
  if (out.length) return out;
  try {
    if (f.kind === 'animal') {
      // Only what has wings is ever in the air.
      const flies = Object.values(f.parts).some((p) => p?.type === 'wing');
      for (const pose of [POSE.stand, POSE.walk, POSE.graze, POSE.alert, ...(flies ? [POSE.fly] : [])]) {
        const m = new Mesh(4096);
        drawAnimal(m, f, unitStance(f, pose, 2));
        const { low, verts } = meshBounds(m);
        if (verts > MAX_VERTICES) out.push(`a fine mesh of it has ${verts} vertices in pose ${pose}, over the budget of ${MAX_VERTICES}`);
        const allowed = pose === POSE.graze ? 0.08 : 0.05;
        if (low < -allowed) out.push(`its body goes ${low.toFixed(3)} of its length below the ground in pose ${pose}`);
      }
    } else {
      const m = new Mesh(4096);
      drawPlant(m, f, 10, 1, 2, 128);
      const { verts, low } = meshBounds(m);
      if (verts > MAX_VERTICES) out.push(`a fine mesh of it has ${verts} vertices, over the budget of ${MAX_VERTICES}`);
      if (low < -1.5) out.push(`it goes ${low.toFixed(2)} m below the ground at 10 m tall`);
    }
  } catch (e) {
    out.push(`it cannot be drawn: ${e instanceof Error ? e.message : String(e)}`);
  }
  return out;
}

/** The lowest point of a mesh and how many vertices it has. */
export function meshBounds(m: Mesh): { low: number; high: number; verts: number } {
  const { vertices } = m.arrays();
  const f = new Float32Array(vertices);
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < m.verts; i++) {
    const z = f[i * 7 + 2];
    if (z < low) low = z;
    if (z > high) high = z;
  }
  return { low, high, verts: m.verts };
}
