// The pieces the people's generators draw with, on the city's kit: frames inside frames, flat pieces by their corners,
// surfaces turned about an axis, posts. A house (dwellings.ts) and what stands in its yard or round its settlement
// (yard.ts, works.ts) are drawn with them.
import { box, type Mesh } from '../city/kit.ts';
import { dcos, dsin, TAU, type Poly } from '../city/math.ts';

export type V3 = [number, number, number];

// ——— Frames ———

// A frame inside a frame: the kit places a mesh's coordinates by one origin and one direction, so the frames a house
// is drawn in (its body turned so that its door is in front, a wall with its outside towards +y) are kept here.
let frames: [number, number, number, number, number][] = [[0, 0, 0, 0, 1]];

/** Begin a mesh's drawing at its own frame: nothing entered, the mesh placed at its origin. */
export function reset(m: Mesh): void {
  frames = [[0, 0, 0, 0, 1]];
  m.place(0, 0, 0, 0, 1);
}

/** Draw from now on in a frame whose origin is at (x, y, z) of the current one, its +y pointing along (gx, gy). */
export function enter(m: Mesh, x: number, y: number, z: number, gx: number, gy: number): void {
  const [ox, oy, oz, fx, fy] = frames[frames.length - 1];
  const f: [number, number, number, number, number] = [ox + x * fy + y * fx, oy - x * fx + y * fy, oz + z, gx * fy + gy * fx, -gx * fx + gy * fy];
  frames.push(f);
  m.place(f[0], f[1], f[2], f[3], f[4]);
}

export function leave(m: Mesh): void {
  if (frames.length > 1) frames.pop();
  const f = frames[frames.length - 1];
  m.place(f[0], f[1], f[2], f[3], f[4]);
}

// ——— Flat pieces ———

/** A flat piece through four corners, in order round it as seen from outside: its uv in metres along its first edge and up it. */
export function quad(m: Mesh, a: V3, b: V3, c: V3, d: V3, u0 = 0, v0 = 0): void {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = d[0] - a[0];
  const vy = d[1] - a[1];
  const vz = d[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const lu = Math.hypot(ux, uy, uz);
  const lv = Math.hypot(vx, vy, vz);
  // How far along the first edge the upper corners stand, so that a piece that narrows keeps its courses level.
  const along = (p: V3) => (lu > 1e-9 ? ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy + (p[2] - a[2]) * uz) / lu : 0);
  const p0 = m.v(a[0], a[1], a[2], nx, ny, nz, u0, v0);
  const p1 = m.v(b[0], b[1], b[2], nx, ny, nz, u0 + lu, v0);
  const p2 = m.v(c[0], c[1], c[2], nx, ny, nz, u0 + along(c), v0 + lv);
  const p3 = m.v(d[0], d[1], d[2], nx, ny, nz, u0 + along(d), v0 + lv);
  m.quad(p0, p1, p2, p3);
}

/** A flat triangle, its corners in order round it as seen from outside. */
export function tri(m: Mesh, a: V3, b: V3, c: V3): void {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const lu = Math.hypot(ux, uy, uz) || 1;
  const along = ((c[0] - a[0]) * ux + (c[1] - a[1]) * uy + (c[2] - a[2]) * uz) / lu;
  const up = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - along * along));
  const p0 = m.v(a[0], a[1], a[2], nx, ny, nz, 0, 0);
  const p1 = m.v(b[0], b[1], b[2], nx, ny, nz, lu, 0);
  const p2 = m.v(c[0], c[1], c[2], nx, ny, nz, along, up);
  m.tri(p0, p1, p2);
}

/** A flat piece seen from both sides: its inside darker, as what is under a cloth or a mat is. */
export function sheet(m: Mesh, a: V3, b: V3, c: V3, d: V3): void {
  quad(m, a, b, c, d);
  const keep = m.light;
  m.light = keep * 0.5;
  quad(m, b, a, d, c);
  m.light = keep;
}

/** A surface turned about the origin and stretched to an ellipse: a profile of [radius, z] from the bottom up. */
export function turn(m: Mesh, profile: number[][], n: number, sx = 1, sy = 1, a0 = 0, a1 = TAU, inside = false): void {
  let reach = 0.5;
  for (const p of profile) reach = Math.max(reach, p[0]);
  reach *= (sx + sy) / 2;
  let up = 0;
  for (let r = 0; r + 1 < profile.length; r++) {
    const [r0, z0] = profile[r];
    const [r1, z1] = profile[r + 1];
    const dr = r1 - r0;
    const dz = z1 - z0;
    const l = Math.hypot(dr, dz) || 1;
    const flip = inside ? -1 : 1;
    const nr = (dz / l) * flip;
    const nz = (-dr / l) * flip;
    const base = m.verts;
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      const c = dcos(t);
      const s = dsin(t);
      // The normal of an ellipse leans towards its short axis.
      let nx = (c * nr) / sx;
      let ny = (s * nr) / sy;
      const q = Math.hypot(nx, ny, nz) || 1;
      nx /= q;
      ny /= q;
      m.v(c * r0 * sx, s * r0 * sy, z0, nx, ny, nz / q, t * reach, up);
      m.v(c * r1 * sx, s * r1 * sy, z1, nx, ny, nz / q, t * reach, up + l);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      m.quad(a, a + 2, a + 3, a + 1);
    }
    up += l;
  }
}

/** A post from the ground up: square, as a block from afar would be. */
export function post(m: Mesh, x: number, y: number, z0: number, z1: number, r: number): void {
  box(m, x - r, y - r, z0, x + r, y + r, z1, true);
}

/** A ring of points round the origin, stretched to an ellipse: a polygon to cap. */
export function ring(r: number, n: number, sx = 1, sy = 1): Poly {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(dcos((TAU * i) / n) * r * sx, dsin((TAU * i) / n) * r * sy);
  return out;
}
