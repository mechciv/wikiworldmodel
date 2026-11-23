// Plants into meshes (docs/plans/RENDERING.md, step 1): what a form says of a plant, drawn on the city's mesh. A plant
// stands at the mesh's origin, the ground at z = 0, and is `h` metres tall; every length a part gives is a share of
// that height. Which parts a plant has, and the numbers in them, are its form's: what a taxon looks like is never in
// this file. How a part's type grows is: each grows a skeleton by its own rule, a trunk, its limbs and their branches
// down to twigs, and its leaves are held on cards, each showing a tile of the atlas of leaves (core/leaves.ts): a spray
// of the part's kind of leaf, or from further off a bough of such sprays.
//
// A plant is drawn four ways, each made of the same skeleton from the same seed, so that it keeps its shape as it comes
// nearer:
//   close by (detail 2):           the skeleton to its twigs, and a spray at every twig;
//   a little way off (detail 2, coarse): its limbs, and boughs in place of each branch's sprays;
//   from a way off (detail 1):     its trunk, the mass of its crown, and a few boughs for its ragged edge;
//   far off (detail 0):            a plain shape.
// On the lighter way to draw (`cards` false) a plant from a way off is the plain shapes it always was.
import type { Form, Part } from '../../../core/form.ts';
import { boughTile, defaultLeaf, LEAF_KINDS, sprayTile, tileU, type LeafKind, type LeafKindName } from '../../../core/leaves.ts';
import { MAT, Mesh, limb } from '../city/kit.ts';
import { dcos, dsin, hash2, PI, TAU } from '../city/math.ts';

/** Detail: 2 close by, 1 from a way off, and 0 only a shape. */
type Detail = 0 | 1 | 2;

const num = (p: Part, k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);

/** The materials a plant's parts may be of, by name: bark, and what its leaves are. */
const LEAF_MATS: Record<string, number> = { needle: MAT.needle, frond: MAT.frond, broad: MAT.broad, bark: MAT.bark };
/** The leaves a plant's material holds on cards. */
const CARDS: Record<number, number> = { [MAT.needle]: MAT.needleCard, [MAT.frond]: MAT.frondCard, [MAT.broad]: MAT.broadCard };
const cardOf = (mat: number): number => CARDS[mat] ?? MAT.broadCard;
/** Whose colour a kind of leaf takes, where its part does not say what its leaves are. */
const matOfKind = (kind: LeafKindName): string => (kind.startsWith('needle') ? 'needle' : kind.startsWith('broad') || kind === 'herb' ? 'broad' : 'frond');

/** The kind of leaf a part has: what its form says, or what follows from its type and material. */
function leafOf(p: Part): LeafKindName {
  const said = p.leaf as string | undefined;
  return said && said in LEAF_KINDS ? (said as LeafKindName) : defaultLeaf(p.type, p.mat as string | undefined);
}

/** The material a part's leaves are of: what it says, or its kind of leaf's. */
const leavesOf = (p: Part, kind: LeafKindName): number => LEAF_MATS[(p.mat as string) ?? matOfKind(kind)] ?? MAT.broad;

/** A crown's middle and how far its leaves reach from it. */
interface Crown {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** A unit vector, and two more square to it and to each other, turned by `twist` turns about it. */
function frame(ax: number, ay: number, az: number, twist: number): number[] {
  const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
  ax /= l;
  ay /= l;
  az /= l;
  // Across: square to the vertical, unless the vector is nearly vertical itself.
  let ux = -ay;
  let uy = ax;
  let ul = Math.sqrt(ux * ux + uy * uy);
  if (ul < 0.1) {
    ux = 1;
    uy = 0;
    ul = 1;
  }
  ux /= ul;
  uy /= ul;
  const wx = -az * uy;
  const wy = az * ux;
  const wz = ax * uy - ay * ux;
  const c = dcos(TAU * twist);
  const s = dsin(TAU * twist);
  return [ax, ay, az, ux * c + wx * s, uy * c + wy * s, wz * s];
}

/**
 * A card of leaves: a quad from its foot at (px, py, pz) along (ax, ay, az) for `len`, `wide` across, turned by `twist`
 * turns about its length, showing a tile of the atlas from the twig's foot to its tip. Its normal is bent out from the
 * crown's middle and a little towards the sky, so that a crown is lit as a mass, and it sees less of the sky the deeper
 * in the crown it is. `flip` mirrors the tile across its twig.
 */
function card(m: Mesh, tile: number, px: number, py: number, pz: number, ax: number, ay: number, az: number, len: number, wide: number, twist: number, crown: Crown, flip = false): void {
  const [dx, dy, dz, bx, by, bz] = frame(ax, ay, az, twist);
  const hw = wide / 2;
  const mx = px + (dx * len) / 2 - crown.x;
  const my = py + (dy * len) / 2 - crown.y;
  const mz = pz + (dz * len) / 2 - crown.z;
  const d = Math.sqrt(mx * mx + my * my + mz * mz);
  const out = d > 1e-6 ? 1 / d : 0;
  let nx = mx * out;
  let ny = my * out;
  let nz = mz * out + 0.45;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  const deep = crown.r > 0 ? d / crown.r : 1;
  const light = 0.3 + 0.7 * (deep > 1 ? 1 : deep);
  const u0 = tileU(tile, flip ? 1 : 0);
  const u1 = tileU(tile, flip ? 0 : 1);
  const a = m.v(px - bx * hw, py - by * hw, pz - bz * hw, nx, ny, nz, u0, 0, light);
  const b = m.v(px + bx * hw, py + by * hw, pz + bz * hw, nx, ny, nz, u1, 0, light);
  const c = m.v(px + bx * hw + dx * len, py + by * hw + dy * len, pz + bz * hw + dz * len, nx, ny, nz, u1, 1, light);
  const e = m.v(px - bx * hw + dx * len, py - by * hw + dy * len, pz - bz * hw + dz * len, nx, ny, nz, u0, 1, light);
  m.quad(a, b, c, e);
}

/**
 * The barks the renderer can draw (viewer/src/gl/cityShaders.ts, BARK): which a part's limbs have follows from its
 * type, and is no claim about any plant.
 */
export const BARK = { furrowed: 0, smooth: 1, scaly: 2, cushioned: 3, ringed: 4, jointed: 5 } as const;

/**
 * A length of trunk or limb through points, each [x, y, z, radius]: round, its sides smooth. Its uv is for bark: u
 * counts ridges round it, a whole number of them; v is metres along it, and its thousands say which bark it is.
 */
export function tube(m: Mesh, pts: number[][], n: number, bark: number = BARK.furrowed): void {
  const count = pts.length;
  if (count < 2) return;
  let mean = 0;
  for (const p of pts) mean += p[3];
  mean /= count;
  const ridges = Math.max(3, Math.round((TAU * mean) / 0.075));
  const base = m.verts;
  let ux = 1;
  let uy = 0;
  let uz = 0;
  let arc = 0;
  for (let r = 0; r < count; r++) {
    const a = pts[r > 0 ? r - 1 : 0];
    const b = pts[r < count - 1 ? r + 1 : count - 1];
    const c = pts[r];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    let tz = b[2] - a[2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    // Across: the last ring's, made square to this ring's direction, so that the tube does not twist along its length.
    const along = ux * tx + uy * ty + uz * tz;
    ux -= tx * along;
    uy -= ty * along;
    uz -= tz * along;
    let ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (ul < 1e-4) {
      ux = -ty;
      uy = tx;
      uz = 0;
      ul = Math.sqrt(ux * ux + uy * uy);
      if (ul < 1e-4) {
        ux = 1;
        uy = 0;
        ul = 1;
      }
    }
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const wx = ty * uz - tz * uy;
    const wy = tz * ux - tx * uz;
    const wz = tx * uy - ty * ux;
    if (r > 0) {
      const dx = c[0] - pts[r - 1][0];
      const dy = c[1] - pts[r - 1][1];
      const dz = c[2] - pts[r - 1][2];
      arc += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    for (let i = 0; i <= n; i++) {
      const t = (TAU * i) / n;
      const co = dcos(t);
      const si = dsin(t);
      const nx = ux * co + wx * si;
      const ny = uy * co + wy * si;
      const nz = uz * co + wz * si;
      m.v(c[0] + nx * c[3], c[1] + ny * c[3], c[2] + nz * c[3], nx, ny, nz, (i / n) * ridges, arc + bark * 1000);
    }
  }
  for (let r = 0; r < count - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = base + r * (n + 1) + i;
      const d = a + n + 1;
      m.quad(a, a + 1, d + 1, d);
    }
  }
}

/** Points along a curve from a to b that bows towards c, thinning from r0 to r1: a limb's path. */
function bowed(a: number[], c: number[], b: number[], r0: number, r1: number, steps: number): number[][] {
  const out: number[][] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2], r0 + (r1 - r0) * t]);
  }
  return out;
}

/** One crown of leaves, lumpy up close, a plain ball from afar. */
function foliage(m: Mesh, x: number, y: number, z: number, r: number, zr: number, n: number, rings: number, seed: number, rough: number, light = -1): void {
  const base = m.verts;
  for (let j = 0; j <= rings; j++) {
    const a = -PI / 2 + (PI * j) / rings;
    const ca = dcos(a);
    const sa = dsin(a);
    for (let i = 0; i <= n; i++) {
      const t = (TAU * i) / n;
      const c = dcos(t);
      const e = dsin(t);
      const w = 1 + (hash2(i % n, j, seed) - 0.5) * rough;
      m.v(x + c * ca * r * w, y + e * ca * r * w, z + sa * zr * w, c * ca, e * ca, sa, i, j, light >= 0 ? light : 0.5 + 0.5 * (sa * 0.5 + 0.5));
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

/**
 * The mass of leaves inside a crown from a way off: what shows between its boughs, as the leaves behind them would;
 * seeing `light` of the sky.
 */
function leafMass(m: Mesh, x: number, y: number, z: number, r: number, zr: number, n: number, rings: number, seed: number, light = 0.3): void {
  const keep = m.mat;
  m.mat = MAT.leafMass;
  foliage(m, x, y, z, r, zr, n, rings, seed, 0.3, light);
  m.mat = keep;
}

/** A cone of leaves from a ring at z0 up to a point at z1: a conifer's shape from afar. */
function cone(m: Mesh, wide: number, z0: number, z1: number, ring: number, offset: number, light0: number, light1: number): void {
  const base = m.verts;
  for (let i = 0; i <= ring; i++) {
    const t = (TAU * (i + offset)) / ring;
    const c = dcos(t);
    const s = dsin(t);
    m.v(c * wide, s * wide, z0, c, s, 0.3, i, 0, light0);
    m.v(c * 0.01, s * 0.01, z1, c, s, 0.5, i, z1 - z0, light1);
  }
  for (let i = 0; i < ring; i++) {
    const a = base + i * 2;
    m.quad(a, a + 2, a + 3, a + 1);
  }
}

/** A trunk from under the ground to `top`, flared at its foot, leaning by (lx, ly) at its top, with a slight bow. */
function trunk(m: Mesh, top: number, r: number, rTop: number, flare: number, lx: number, ly: number, sides: number, rings: number, seed: number, bark: number = BARK.furrowed): void {
  const pts: number[][] = [[0, 0, -0.35, r * flare * 1.15]];
  for (let k = 0; k <= rings; k++) {
    const f = k / rings;
    const z = top * f;
    // Flared over its lowest part, then tapering evenly.
    const foot = 1 + (flare - 1) * (1 - f * 9 < 0 ? 0 : (1 - f * 9) * (1 - f * 9));
    const bow = dsin(PI * f) * top * 0.012 * (hash2(3, 5, seed) - 0.5) * 2;
    pts.push([lx * f * f + bow, ly * f * f + bow * 0.6, z, (r + (rTop - r) * f) * foot]);
  }
  tube(m, pts, sides, bark);
}

/** A rosette of sprays at a twig's end: cards of a kind's sprays, out and round the way the twig points. */
function rosette(m: Mesh, kind: LeafKindName, x: number, y: number, z: number, ox: number, oy: number, oz: number, n: number, size: number, crown: Crown, seed: number, spread = 1): void {
  const k: LeafKind = LEAF_KINDS[kind];
  const len = k.spray[0] * size;
  const wide = k.spray[1] * size;
  for (let i = 0; i < n; i++) {
    // Round the twig's own way, by the golden angle, each a little off its place: none straight back along the twig.
    const t = i * 2.399963 + hash2(i, 1, seed) * 0.8;
    const lean = spread * (0.35 + 0.75 * hash2(i, 2, seed)) * (i === 0 ? 0.25 : 1);
    const [dx, dy, dz, bx, by, bz] = frame(ox, oy, oz, 0);
    const cx = by * dz - bz * dy;
    const cy = bz * dx - bx * dz;
    const cz = bx * dy - by * dx;
    const c = dcos(t) * lean;
    const s = dsin(t) * lean;
    const ax = dx + bx * c + cx * s;
    const ay = dy + by * c + cy * s;
    const az = dz + bz * c + cz * s + 0.12;
    const al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    const scale = 0.8 + 0.4 * hash2(i, 3, seed);
    // Back along itself a little, so that the sprays' twigs meet about the twig's end.
    const back = (len * scale * 0.12) / al;
    card(m, sprayTile(kind, seed + i), x - ax * back, y - ay * back, z - az * back, ax, ay, az, len * scale, wide * scale, hash2(i, 4, seed), crown, (hash2(i, 5, seed) < 0.5));
  }
}

/**
 * A card of leaves laid as a shingle on a crown: its middle at (x, y, z), its length along (ax, ay, az) and its face
 * turned towards (fx, fy, fz), as nearly as its length allows. A bough so laid shows its face to whoever looks at the
 * crown from outside, wherever they stand.
 */
function shingle(m: Mesh, tile: number, x: number, y: number, z: number, ax: number, ay: number, az: number, fx: number, fy: number, fz: number, len: number, wide: number, crown: Crown, flip: boolean, lit = -1): void {
  const al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
  ax /= al;
  ay /= al;
  az /= al;
  // Across: square to its length and to the way it faces.
  let bx = fy * az - fz * ay;
  let by = fz * ax - fx * az;
  let bz = fx * ay - fy * ax;
  const bl = Math.sqrt(bx * bx + by * by + bz * bz);
  if (bl < 1e-4) {
    const f = frame(ax, ay, az, 0);
    bx = f[3];
    by = f[4];
    bz = f[5];
  } else {
    bx /= bl;
    by /= bl;
    bz /= bl;
  }
  const hw = wide / 2;
  const px = x - (ax * len) / 2;
  const py = y - (ay * len) / 2;
  const pz = z - (az * len) / 2;
  const mx = x - crown.x;
  const my = y - crown.y;
  const mz = z - crown.z;
  const d = Math.sqrt(mx * mx + my * my + mz * mz);
  const out = d > 1e-6 ? 1 / d : 0;
  let nx = mx * out;
  let ny = my * out;
  let nz = mz * out + 0.45;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  const deep = crown.r > 0 ? d / crown.r : 1;
  const light = lit >= 0 ? lit : 0.3 + 0.7 * (deep > 1 ? 1 : deep);
  const u0 = tileU(tile, flip ? 1 : 0);
  const u1 = tileU(tile, flip ? 0 : 1);
  const a = m.v(px - bx * hw, py - by * hw, pz - bz * hw, nx, ny, nz, u0, 0, light);
  const b = m.v(px + bx * hw, py + by * hw, pz + bz * hw, nx, ny, nz, u1, 0, light);
  const c = m.v(px + bx * hw + ax * len, py + by * hw + ay * len, pz + bz * hw + az * len, nx, ny, nz, u1, 1, light);
  const e = m.v(px - bx * hw + ax * len, py - by * hw + ay * len, pz - bz * hw + az * len, nx, ny, nz, u0, 1, light);
  m.quad(a, b, c, e);
}

/**
 * Boughs about a place in a crown: cards of a kind's bough, each laid as a shingle a little way out from the place,
 * facing out from the crown's middle and pointing up and out along it, no two the same way, so that together they
 * close into a mass of leaves with a ragged edge.
 */
function boughs(m: Mesh, kind: LeafKindName, x: number, y: number, z: number, n: number, len: number, crown: Crown, seed: number, spread = 0.5): void {
  const k: LeafKind = LEAF_KINDS[kind];
  const wide = k.boughs ? (len * k.bough[1]) / k.bough[0] : (len * k.spray[1]) / k.spray[0];
  let ox = x - crown.x;
  let oy = y - crown.y;
  let oz = z - crown.z;
  const ol = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
  ox /= ol;
  oy /= ol;
  oz /= ol;
  for (let i = 0; i < n; i++) {
    // Each faces its own way off the outward: round it by the golden angle, the first straight out.
    const t = i * 2.399963 + TAU * hash2(i, 6, seed);
    const lean = i === 0 ? 0.15 : 0.55 + 0.6 * hash2(i, 7, seed);
    const [, , , ux, uy, uz] = frame(ox, oy, oz, 0);
    const vx = oy * uz - oz * uy;
    const vy = oz * ux - ox * uz;
    const vz = ox * uy - oy * ux;
    const c = dcos(t) * lean;
    const sn = dsin(t) * lean;
    const fx = ox + ux * c + vx * sn;
    const fy = oy + uy * c + vy * sn;
    const fz = oz + uz * c + vz * sn;
    // Its length along the crown's own surface: upwards where that is a side of it, any way round on its top, and a
    // little outwards, as a branch's end.
    const turn = TAU * hash2(i, 8, seed);
    const side = 1 - oz * oz;
    const rx = ux * dcos(turn) + vx * dsin(turn);
    const ry = uy * dcos(turn) + vy * dsin(turn);
    const rz = uz * dcos(turn) + vz * dsin(turn);
    const ax = ox * 0.3 + rx * (1 - 0.6 * side) - oz * ox * side * 0.9;
    const ay = oy * 0.3 + ry * (1 - 0.6 * side) - oz * oy * side * 0.9;
    const az = oz * 0.3 + rz * (1 - 0.6 * side) + side * side * 0.9;
    const s = 0.85 + 0.3 * hash2(i, 9, seed);
    const off = len * spread * (i === 0 ? 0.2 : 0.35 + 0.4 * hash2(i, 10, seed));
    shingle(m, boughTile(kind, seed + i), x + (fx - ox * 0.4) * off, y + (fy - oy * 0.4) * off, z + (fz - oz * 0.4) * off, ax, ay, az, fx, fy, fz, len * s, wide * s, crown, hash2(i, 11, seed) < 0.5);
  }
}

// ——— A conifer: a straight trunk, and branches in whorls up it ———

function conifer(m: Mesh, p: Part, h: number, seed: number, detail: Detail, tint: number, cards: boolean, coarse: boolean): void {
  const kind = leafOf(p);
  const k: LeafKind = LEAF_KINDS[kind];
  const leaves = leavesOf(p, kind);
  const r = h * num(p, 'reach', 0.15);
  const low = num(p, 'start', 0.24) * 0.58;
  m.tint = tint;
  if (detail === 0 || (detail === 1 && !cards)) {
    m.mat = leaves;
    m.light = 0.9;
    // From a way off, three cones one on another, narrowing; and only a shape, one.
    const stack = detail === 1 ? 3 : 1;
    for (let q = 0; q < stack; q++) {
      const f0 = q / stack;
      const f1 = stack === 1 ? 1 : (q + 1.25) / stack;
      cone(m, r * 1.1 * (1 - f0 * 0.72), h * (low + (1 - low) * f0), h * (low + (1 - low) * (f1 > 1 ? 1 : f1)), detail === 1 ? 6 : 4, (q & 1) * 0.5, 0.45 + 0.2 * f0, 1);
    }
    return;
  }
  const crown: Crown = { x: 0, y: 0, z: h * (low + (1 - low) * 0.42), r: Math.max(r * 1.1, h * (1 - low) * 0.55) };
  const tr = h * num(p, 'trunk', 0.022);
  const cardMat = cardOf(leaves);
  if (detail === 1) {
    // Its trunk, three cones of the mass of its leaves, and a ragged edge of boughs round each.
    m.mat = MAT.bark;
    m.light = 0.8;
    limb(m, 0, 0, -0.2, 0, 0, h * 0.9, tr, tr * 0.2, 3);
    const len = Math.min(Math.max(r * 0.95, 0.8), k.bough[0] * 2.2);
    for (let q = 0; q < 4; q++) {
      const f0 = q / 4;
      const f1 = (q + 1.3) / 4;
      const wide = r * 1.05 * (1 - f0 * 0.74);
      const z0 = h * (low + (1 - low) * f0);
      const z1 = h * (low + (1 - low) * (f1 > 1 ? 1 : f1));
      m.mat = MAT.leafMass;
      cone(m, wide * 0.7, z0, z1, 6, (q & 1) * 0.5, 0.5, 0.9);
      m.mat = cardMat;
      // Boughs round each, as its branches hang: out and down from the trunk, their faces to whoever looks.
      const n = 7 - q;
      for (let i = 0; i < n; i++) {
        const t = (TAU * (i + (q & 1) * 0.5 + 0.4 * hash2(i, q, seed))) / n;
        const c = dcos(t);
        const s = dsin(t);
        const l = Math.max(len * (1 - f0 * 0.5), wide * 1.1);
        const zc = z0 + (z1 - z0) * (0.2 + 0.2 * hash2(i, q + 3, seed));
        shingle(m, boughTile(kind, i + q), c * wide * 0.5, s * wide * 0.5, zc, c, s, -0.45 - 0.3 * hash2(i, q + 5, seed), c * 0.5, s * 0.5, 0.85, l, (l * k.bough[1]) / k.bough[0], crown, (i & 1) === 1);
        shingle(m, boughTile(kind, i + q + 1), c * wide * 0.42, s * wide * 0.42, zc - l * 0.12, c * 0.5, s * 0.5, -1, c, s, 0.15, l * 0.8, (l * 0.7 * k.bough[1]) / k.bough[0], crown, (i & 1) === 0);
      }
    }
    m.mat = cardMat;
    card(m, boughTile(kind, 3), 0, 0, h * 0.8, 0, 0.1, 1, len * 0.75, len * 0.5, 0, crown);
    card(m, boughTile(kind, 4), 0, 0, h * 0.8, 0.1, 0, 1, len * 0.75, len * 0.5, 0.25, crown);
    return;
  }
  // Close by: the trunk, flared and buttressed at its foot, tapering all the way up.
  const flare = num(p, 'flare', 2.4);
  const leanX = (hash2(1, 2, seed) - 0.5) * h * 0.03;
  const leanY = (hash2(2, 2, seed) - 0.5) * h * 0.03;
  m.mat = MAT.bark;
  m.light = 0.8;
  trunk(m, h, tr, tr * 0.05, flare, leanX, leanY, coarse ? 6 : 10, coarse ? 5 : 9, seed);
  const tiers = Math.max(3, Math.round(num(p, 'tiers', 13)));
  const start = num(p, 'start', 0.24);
  const drop = num(p, 'drop', 0.075);
  // Sprays lie flat along a branch, either side of it, where the kind's sprays are flat; otherwise all round it.
  const flat = kind === 'needle-flat' || kind === 'needle-scale' || !kind.startsWith('needle');
  // A big tree's sprays are drawn larger, so that it has no more of them than a mesh can hold.
  const size = Math.max(1, Math.min(2.4, (h * num(p, 'reach', 0.15)) / 2.2));
  const sprayLen = k.spray[0] * size;
  const sprayWide = k.spray[1] * size;
  // A few dead stubs below the crown, where its lowest branches were shed.
  if (!coarse) {
    m.light = 0.6;
    for (let i = 0; i < 5; i++) {
      const z = h * start * (0.45 + 0.5 * hash2(i, 61, seed));
      const t = TAU * hash2(i, 62, seed);
      const f = z / h;
      const l = r * 0.16 * (0.5 + hash2(i, 63, seed));
      limb(m, leanX * f * f, leanY * f * f, z, leanX * f * f + dcos(t) * (tr + l), leanY * f * f + dsin(t) * (tr + l), z - l * 0.2, Math.max(0.012, tr * 0.12), 0.006, 3);
    }
  }
  for (let q = 0; q < tiers; q++) {
    const f = q / tiers;
    const zf = start + (1 - start) * (f + 0.3 * (hash2(q, 51, seed) - 0.5) / tiers);
    const z1 = h * zf;
    const bx0 = leanX * zf * zf;
    const by0 = leanY * zf * zf;
    const reach = r * (1.18 - f) * (0.72 + 0.46 * hash2(q, 1, seed));
    const around = 5 + ((seed + q) & 1) + (f < 0.4 ? 1 : 0);
    for (let i = 0; i < around; i++) {
      const t = (TAU * (i + (q & 1) * 0.5 + 0.4 * hash2(i, q + 21, seed))) / around;
      const c = dcos(t);
      const s = dsin(t);
      const out = reach * (0.62 + 0.5 * hash2(i, q + 3, seed));
      if (out < 0.25) continue;
      // It leaves the trunk rising a little, the more the higher it is, and sags along its length; its tip turns up.
      const rise = out * (-0.1 + 0.55 * f);
      const fall = h * drop * (1.2 - f * 0.6) * (0.6 + 0.8 * hash2(i, q + 11, seed));
      const at = (g: number): number[] => [bx0 + c * out * g, by0 + s * out * g, z1 + rise * g - fall * g * g + fall * 0.22 * g * g * g * g];
      const rb = Math.max(tr * 0.2 * (1 - f * 0.7), 0.014);
      m.mat = MAT.bark;
      m.light = 0.7;
      const steps = coarse ? 2 : 4;
      const path: number[][] = [];
      for (let g = 0; g <= steps; g++) {
        const [x, y, z] = at(g / steps);
        path.push([x, y, z, rb * (1 - (0.82 * g) / steps)]);
      }
      tube(m, path, coarse ? 3 : 5);
      m.mat = cardMat;
      const tip = at(1);
      const before = at(0.9);
      const tx = tip[0] - before[0];
      const ty = tip[1] - before[1];
      const tz = tip[2] - before[2];
      if (coarse) {
        // A bough along the branch, lying as it lies; another hanging under it; and a third across its end, which
        // whoever looks along the branch sees.
        const from = at(0.1);
        const len = Math.max(out * 1.02, 0.5);
        const wide = Math.min(len * 0.86, (len * k.bough[1]) / k.bough[0] * 1.25);
        card(m, boughTile(kind, i + q), from[0], from[1], from[2], tip[0] - from[0], tip[1] - from[1], tip[2] - from[2], len, wide, 0.04 * (hash2(i, q + 31, seed) - 0.5), crown, (i & 1) === 1);
        card(m, boughTile(kind, i + q + 1), from[0], from[1], from[2] - wide * 0.05, tip[0] - from[0], tip[1] - from[1], tip[2] - from[2] - out * 0.16, len * 0.95, wide * 0.7, 0.25 + 0.06 * (hash2(i, q + 33, seed) - 0.5), crown, (i & 1) === 0);
        const mid = at(0.72);
        shingle(m, boughTile(kind, i + q + 2), mid[0], mid[1], mid[2] - wide * 0.12, -s, c, -0.25, c, s, 0.2, wide * 1.15, wide * 0.8, crown, (i & 1) === 1);
        continue;
      }
      // Stations along its outer part, sprays at each: either side of it and lying flat, or all round it.
      const stations = Math.max(1, Math.min(12, Math.round((out * 0.8) / (sprayLen * 0.42))));
      for (let g = 0; g < stations; g++) {
        const along = 0.22 + (0.78 * (g + 0.5)) / stations;
        const [px, py, pz] = at(along);
        const salt = g + i * 13 + q * 131;
        if (flat) {
          for (const side of [-1, 1]) {
            const spread = 0.75 + 0.35 * hash2(salt, side + 2, seed);
            card(m, sprayTile(kind, salt + side), px, py, pz, c - s * side * spread, s + c * side * spread, -0.12 - 0.2 * hash2(salt, side + 4, seed), sprayLen * (0.85 + 0.3 * hash2(salt, 6, seed)), sprayWide, 0.06 * (hash2(salt, side + 7, seed) - 0.5), crown, side < 0);
          }
          // And one hanging under the branch, as its older shoots do.
          if ((salt & 1) === 0) card(m, sprayTile(kind, salt + 5), px, py, pz, c * 0.5, s * 0.5, -0.9, sprayLen * 0.9, sprayWide * 0.9, 0.25 + 0.1 * (hash2(salt, 9, seed) - 0.5), crown);
        } else {
          for (let w = 0; w < 3; w++) {
            const turn = TAU * (w / 3 + hash2(salt, w + 2, seed) * 0.3);
            const up = dcos(turn);
            const side = dsin(turn);
            card(m, sprayTile(kind, salt + w), px, py, pz, c * 0.7 - s * side * 0.8, s * 0.7 + c * side * 0.8, up * 0.7 + 0.15, sprayLen * (0.85 + 0.3 * hash2(salt, w + 6, seed)), sprayWide, hash2(salt, w + 7, seed), crown, w === 1);
          }
        }
      }
      card(m, sprayTile(kind, i + q), tip[0], tip[1], tip[2], tx, ty, tz, sprayLen, sprayWide, 0.03, crown);
    }
  }
  // The leader at the top.
  m.mat = cardMat;
  const top = [leanX, leanY, h];
  if (coarse) {
    for (let i = 0; i < 2; i++) card(m, boughTile(kind, i), top[0], top[1], h * 0.86, 0.1 * (i ? 1 : -1), 0.08, 1, Math.max(h * 0.13, 0.6), Math.max(h * 0.09, 0.4), 0.25 * i, crown);
  } else for (let i = 0; i < 5; i++) {
    const t = (TAU * (i + hash2(i, 41, seed))) / 5;
    card(m, sprayTile(kind, i), top[0], top[1], h * 0.955, dcos(t) * 0.4, dsin(t) * 0.4, 1, sprayLen * 0.9, sprayWide * 0.8, 0.1 * i, crown);
  }
}

// ——— A broad-leaved tree: a trunk that forks into limbs, each branching to twigs over a rounded crown ———

function broadleaf(m: Mesh, p: Part, h: number, seed: number, detail: Detail, tint: number, cards: boolean, coarse: boolean): void {
  const kind = leafOf(p);
  const k: LeafKind = LEAF_KINDS[kind];
  const leaves = leavesOf(p, kind);
  const R = h * num(p, 'crown', 0.34);
  const [fork0, forkVar] = (p.fork as [number, number] | undefined) ?? [0.36, 0.14];
  const fork = h * (fork0 + forkVar * hash2(1, 9, seed));
  const tr = h * num(p, 'trunk', 0.022);
  m.tint = tint;
  if (detail === 0 || (detail === 1 && !cards)) {
    m.mat = leaves;
    m.light = 1;
    foliage(m, 0, 0, fork + R * 0.62, R, R * 0.76, detail === 1 ? 7 : 4, detail === 1 ? 4 : 2, seed, detail === 1 ? 0.22 : 0);
    if (detail === 1) {
      m.mat = MAT.bark;
      m.light = 0.8;
      limb(m, 0, 0, -0.2, 0, 0, fork + R * 0.1, tr, tr * 0.7, 3);
    }
    return;
  }
  // The crown: an egg of leaves over the fork, off to one side a little, as no tree grows evenly.
  const zr = R * 0.76;
  const cx = (hash2(2, 9, seed) - 0.5) * R * 0.3;
  const cy = (hash2(3, 9, seed) - 0.5) * R * 0.3;
  const cz = fork + R * 0.62;
  const crown: Crown = { x: cx, y: cy, z: cz, r: R * 1.05 };
  const cardMat = cardOf(leaves);
  if (detail === 1) {
    m.mat = MAT.bark;
    m.light = 0.8;
    limb(m, 0, 0, -0.2, cx * 0.3, cy * 0.3, fork + R * 0.1, tr, tr * 0.7, 3);
    leafMass(m, cx, cy, cz, R * 0.62, zr * 0.62, 7, 4, seed, 0.6);
    m.mat = cardMat;
    const len = Math.min(Math.max(R * 1.1, 0.7), k.bough[0] * 2.8);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const uz = 1 - 1.5 * f;
      const ring = Math.sqrt(Math.max(0, 1 - uz * uz));
      const t = i * 2.399963 + hash2(i, 1, seed) * 0.6;
      boughs(m, kind, cx + dcos(t) * ring * R * 0.72, cy + dsin(t) * ring * R * 0.72, cz + uz * zr * 0.72, 3, len, crown, seed + i * 13, 0.3);
    }
    return;
  }
  // Close by. Its twigs' ends first: evenly over the crown's shell and through its outer part, each a little off its
  // place, none in the hollow under the crown.
  const tips = Math.max(40, Math.min(coarse ? 90 : 170, Math.round(30 + R * R * 4.2)));
  const ends: number[][] = [];
  for (let i = 0; i < tips; i++) {
    const f = (i + 0.5) / tips;
    const uz = 1 - 1.5 * f;
    const ring = Math.sqrt(Math.max(0, 1 - uz * uz));
    const t = i * 2.399963 + hash2(i, 1, seed) * 0.7;
    // Lobes: the crown stands out further some ways than others.
    const lobe = 0.86 + 0.2 * hash2(Math.floor((t / TAU) * 5) % 5, Math.floor(uz * 2 + 2), seed);
    const depth = (i % 4 === 3 ? 0.52 + 0.2 * hash2(i, 2, seed) : 0.82 + 0.18 * hash2(i, 2, seed)) * lobe;
    ends.push([cx + dcos(t) * ring * R * depth, cy + dsin(t) * ring * R * depth, cz + uz * zr * depth, depth]);
  }
  // Its limbs: from the fork out and up, one to each quarter, and a leader up the middle.
  const limbs = Math.max(2, Math.round(num(p, 'limbs', 4))) + ((seed >> 3) & 1);
  const heads: number[][] = [[cx * 0.7, cy * 0.7, cz + zr * 0.3]];
  for (let q = 0; q < limbs; q++) {
    const t = (TAU * (q + hash2(q, 3, seed) * 0.6)) / limbs;
    const out = R * (0.5 + 0.16 * hash2(q, 4, seed));
    heads.push([cx + dcos(t) * out, cy + dsin(t) * out, cz + zr * (-0.25 + 0.4 * hash2(q, 5, seed))]);
  }
  // Each twig's end belongs to the limb whose head is nearest it.
  const owned: number[][] = heads.map(() => []);
  ends.forEach((e, i) => {
    let best = 0;
    let bd = Infinity;
    heads.forEach((hd, q) => {
      const d = (e[0] - hd[0]) * (e[0] - hd[0]) + (e[1] - hd[1]) * (e[1] - hd[1]) + (e[2] - hd[2]) * (e[2] - hd[2]) * 1.4;
      if (d < bd) {
        bd = d;
        best = q;
      }
    });
    owned[best].push(i);
  });
  m.mat = MAT.bark;
  m.light = 0.8;
  const leanX = cx * 0.25;
  const leanY = cy * 0.25;
  trunk(m, fork, tr, tr * 0.74, num(p, 'flare', 1.5), leanX, leanY, coarse ? 6 : 10, coarse ? 3 : 6, seed);
  const size = Math.max(1.15, Math.min(1.9, R / 2.6));
  const boughLen = Math.min(Math.max(R * 0.66, 0.9), k.bough[0] * 2.2);
  // What shows between a crown's boughs from a little way off: the leaves behind them, as a mass well inside it.
  if (coarse) leafMass(m, cx, cy, cz, R * 0.5, zr * 0.5, 7, 4, seed, 0.45);
  heads.forEach((hd, q) => {
    const mine = owned[q];
    if (!mine.length) return;
    // The limb: from the trunk's top, bowing up, to its head.
    const from = [leanX, leanY, fork * (q === 0 ? 1 : 0.86 + 0.14 * hash2(q, 6, seed))];
    const rl = tr * (q === 0 ? 0.62 : 0.5) * Math.sqrt(Math.min(1, mine.length / (tips / heads.length)) * 0.6 + 0.4);
    const mid = [(from[0] + hd[0]) * 0.5 + (hd[0] - from[0]) * 0.12, (from[1] + hd[1]) * 0.5 + (hd[1] - from[1]) * 0.12, from[2] + (hd[2] - from[2]) * 0.72];
    m.mat = MAT.bark;
    m.light = 0.75;
    const path = bowed(from, mid, hd, rl, rl * 0.42, coarse ? 2 : 4);
    tube(m, path, coarse ? 4 : 6);
    // Its branches: the twigs' ends it owns, in groups of neighbours round it; one branch to each group.
    const sorted = mine
      .map((i) => ({ i, a: Math.atan2(ends[i][1] - hd[1], ends[i][0] - hd[0]), z: ends[i][2] }))
      .sort((u, v) => (Math.floor((u.z - cz) / (zr * 0.7)) - Math.floor((v.z - cz) / (zr * 0.7))) || u.a - v.a);
    const per = coarse ? 7 : 6;
    for (let g = 0; g < sorted.length; g += per) {
      const group = sorted.slice(g, g + per).map((u) => u.i);
      let gx = 0;
      let gy = 0;
      let gz = 0;
      for (const i of group) {
        gx += ends[i][0];
        gy += ends[i][1];
        gz += ends[i][2];
      }
      gx /= group.length;
      gy /= group.length;
      gz /= group.length;
      // It leaves the limb part of the way along it, and stops short of its group's middle, where its twigs part.
      const along = 0.45 + 0.5 * hash2(g, q + 11, seed);
      const leave = path[Math.min(path.length - 1, Math.round(along * (path.length - 1)))];
      const knot = [leave[0] + (gx - leave[0]) * 0.74, leave[1] + (gy - leave[1]) * 0.74, leave[2] + (gz - leave[2]) * 0.74 + R * 0.03];
      const rb = Math.max(rl * 0.34, 0.014);
      m.mat = MAT.bark;
      m.light = 0.7;
      tube(m, bowed(leave, [(leave[0] + knot[0]) / 2, (leave[1] + knot[1]) / 2, (leave[2] + knot[2]) / 2 + R * 0.05], knot, rb, rb * 0.5, coarse ? 1 : 2), coarse ? 3 : 4);
      // Boughs about the group's middle: the mass of the crown, behind its twigs and their sprays close by, and in
      // their place from a little way off.
      m.mat = cardMat;
      boughs(m, kind, gx, gy, gz, coarse ? 6 : 3, boughLen, crown, seed + g * 7 + q * 131, coarse ? 0.5 : 0.3);
      if (coarse) continue;
      for (const i of group) {
        const e = ends[i];
        m.mat = MAT.bark;
        m.light = 0.65;
        // The twig to its end: as thick at its foot as its length asks, never thicker than the branch it leaves, and
        // bowed, out from the crown's middle and up or down a little: a long straight one is a wire against the sky.
        const tl = Math.sqrt((e[0] - knot[0]) * (e[0] - knot[0]) + (e[1] - knot[1]) * (e[1] - knot[1]) + (e[2] - knot[2]) * (e[2] - knot[2]));
        const rt = Math.min(rb * 0.8, Math.max(rb * 0.4, 0.008, tl * 0.011));
        const bow = tl * (0.05 + 0.09 * hash2(i, 21, seed));
        const side = (hash2(i, 22, seed) - 0.5) * 2 * bow;
        const lift = (hash2(i, 23, seed) - 0.35) * 1.5 * bow;
        const ol = Math.sqrt((e[0] - cx) * (e[0] - cx) + (e[1] - cy) * (e[1] - cy)) || 1;
        const bend = [(knot[0] + e[0]) / 2 - ((e[1] - cy) / ol) * side, (knot[1] + e[1]) / 2 + ((e[0] - cx) / ol) * side, (knot[2] + e[2]) / 2 + lift];
        tube(m, bowed(knot, bend, e, rt, 0.004, tl > 1.2 ? 3 : 2), 3);
        m.mat = cardMat;
        // Sprays round the twig's end, and a pair along it: more of them at the crown's edge, where the light is.
        const n = e[3] > 0.78 ? 8 : 5;
        const tx = e[0] - knot[0];
        const ty = e[1] - knot[1];
        const tz = e[2] - knot[2];
        rosette(m, kind, e[0], e[1], e[2], tx + (e[0] - cx) * 0.5, ty + (e[1] - cy) * 0.5, tz + (e[2] - cz) * 0.5, n, size, crown, seed + i * 17);
        // And a few part of the way along it, on the bow it has.
        const on = (c: number) => 0.2025 * knot[c] + 0.495 * bend[c] + 0.3025 * e[c];
        rosette(m, kind, on(0), on(1), on(2), tx, ty, tz, 3, size, crown, seed + i * 17 + 5, 1.3);
      }
    }
  });
}

// ——— A palm: a straight stem with a head of fans or feathers ———

/**
 * A frond as a strip along an arching stalk, three points across at each step: its two edges and its stalk, which lies
 * a little under them, so that it is troughed. Its tile runs from its foot to its tip.
 */
function frond(m: Mesh, tile: number, px: number, py: number, pz: number, dx: number, dy: number, len: number, half: number, rise: number, droop: number, steps: number, crown: Crown, light0: number, flip: boolean): void {
  const base = m.verts;
  const mx = px - crown.x;
  const my = py - crown.y;
  const ml = Math.sqrt(mx * mx + my * my) || 1;
  // Its normal out from the plant's middle and up, so that the fronds are lit as one.
  const nx = (ml > 1e-3 ? mx / ml : dx) * 0.5 + dx * 0.15;
  const ny = (ml > 1e-3 ? my / ml : dy) * 0.5 + dy * 0.15;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    // Out and up, then bending over: the further out, the more it hangs.
    const out = len * (f - 0.18 * f * f * droop);
    const z = pz + len * (rise * f * (2 - f) - droop * f * f * f * 0.9);
    const x = px + dx * out;
    const y = py + dy * out;
    const w = half * (0.25 + 0.75 * dsin(PI * (0.08 + 0.84 * f)));
    const light = light0 + (1 - light0) * f;
    const u0 = tileU(tile, flip ? 1 : 0);
    const u1 = tileU(tile, flip ? 0 : 1);
    m.v(x - dy * w, y + dx * w, z + w * 0.16, nx, ny, 0.84, u0, f, light);
    m.v(x, y, z, nx, ny, 0.84, tileU(tile, 0.5), f, light);
    m.v(x + dy * w, y - dx * w, z + w * 0.16, nx, ny, 0.84, u1, f, light);
  }
  for (let i = 0; i < steps; i++) {
    const a = base + i * 3;
    m.quad(a, a + 1, a + 4, a + 3);
    m.quad(a + 1, a + 2, a + 5, a + 4);
  }
}

function palm(m: Mesh, p: Part, h: number, seed: number, detail: Detail, tint: number, cards: boolean, coarse: boolean): void {
  const kind = leafOf(p);
  const k: LeafKind = LEAF_KINDS[kind];
  const tr = h * num(p, 'trunk', 0.03);
  const leanBy = num(p, 'lean', 0.12);
  const lean = (hash2(1, 2, seed) - 0.5) * h * leanBy;
  const lean2 = (hash2(2, 2, seed) - 0.5) * h * leanBy;
  const leaves = leavesOf(p, kind);
  const head = num(p, 'head', 0.88);
  const size = h * num(p, 'size', 0.34);
  m.tint = tint;
  if (detail === 0 || (detail === 1 && !cards)) {
    m.mat = leaves;
    m.light = 1;
    foliage(m, lean, lean2, h * (head + 0.02), size * 0.76, size * 0.38, detail === 1 ? 7 : 4, detail === 1 ? 3 : 2, seed, detail === 1 ? 0.3 : 0);
    if (detail === 1) {
      m.mat = MAT.bark;
      m.tint = 200;
      m.light = 0.85;
      limb(m, 0, 0, -0.2, lean, lean2, h * head, tr * 0.9, tr * 0.8, 3);
    }
    return;
  }
  m.mat = MAT.bark;
  m.tint = 200;
  m.light = 0.85;
  if (detail === 1) limb(m, 0, 0, -0.2, lean, lean2, h * head, tr * 0.9, tr * 0.8, 3);
  else {
    // A stem of even thickness, swollen a little at its foot, leaning as it rises.
    const pts: number[][] = [[0, 0, -0.3, tr * 1.35]];
    const rings = coarse ? 4 : 8;
    for (let i = 0; i <= rings; i++) {
      const f = i / rings;
      pts.push([lean * f * f, lean2 * f * f, h * head * f, tr * (0.82 + 0.4 * (1 - f) * (1 - f) * (1 - f))]);
    }
    tube(m, pts, coarse ? 6 : 9, BARK.ringed);
  }
  const crown: Crown = { x: lean, y: lean2, z: h * head, r: size };
  m.tint = tint;
  m.mat = cardOf(leaves);
  const fronds = Math.max(4, Math.round(num(p, 'fronds', 11) * (detail === 1 ? 0.6 : coarse ? 1 : 1.5)));
  const steps = detail === 1 ? 2 : coarse ? 3 : 6;
  const z0 = h * head;
  for (let q = 0; q < fronds; q++) {
    const t = (TAU * (q + hash2(q, 7, seed) * 0.6)) / fronds + q * 2.4;
    // The youngest stand up in the middle, the oldest hang below the head.
    const age = (q + 0.5) / fronds;
    const rise = 0.95 - 1.5 * age + (hash2(q, 8, seed) - 0.5) * 0.25;
    const len = size * (0.85 + 0.3 * hash2(q, 9, seed)) * (1 - 0.25 * (age - 0.5) * (age - 0.5) * 4);
    const half = (len * k.spray[1]) / k.spray[0] / 2;
    frond(m, sprayTile(kind, q + seed), lean, lean2, z0, dcos(t), dsin(t), len, half, rise * 0.55, 0.35 + 0.45 * age, steps, crown, 0.55, (q & 1) === 1);
  }
}

// ——— A fern: a rosette of arching fronds, at the ground or on top of a stem ———

function fern(m: Mesh, p: Part, h: number, seed: number, detail: Detail, tint: number, cards: boolean, coarse: boolean): void {
  const kind = leafOf(p);
  const k: LeafKind = LEAF_KINDS[kind];
  const z0 = h * num(p, 'on_stem', 0);
  const tr = h * num(p, 'stem', 0.04);
  const reach = h * num(p, 'reach', 0.95);
  m.tint = tint;
  const leaves = leavesOf(p, kind);
  if (detail === 0 || (detail === 1 && !cards)) {
    // From afar the ground's colour stands in for a low fern, and a ball for one on a stem.
    if (z0 <= 0) return;
    m.mat = leaves;
    m.light = 1;
    foliage(m, 0, 0, z0 + reach * 0.15, reach * 0.8, reach * 0.45, detail === 1 ? 7 : 4, detail === 1 ? 3 : 2, seed, detail === 1 ? 0.3 : 0);
    // On its stem, or it would float.
    m.mat = MAT.bark;
    m.light = 0.85;
    limb(m, 0, 0, -0.2, 0, 0, z0 + reach * 0.1, tr, tr * 0.8, detail === 1 ? 4 : 3);
    return;
  }
  if (detail === 1 && z0 <= 0) return;
  if (z0 > 0) {
    m.mat = MAT.bark;
    m.light = 0.85;
    if (detail === 1) limb(m, 0, 0, -0.2, 0, 0, z0 + reach * 0.05, tr, tr * 0.8, 4);
    else {
      // A stem as thick at its top as at its foot, clothed in the stubs of old fronds: rough, not ridged.
      const pts: number[][] = [[0, 0, -0.2, tr * 1.3]];
      const rings = coarse ? 3 : 6;
      const bend = (hash2(4, 4, seed) - 0.5) * z0 * 0.08;
      for (let i = 0; i <= rings; i++) {
        const f = i / rings;
        pts.push([bend * f * f, bend * 0.5 * f, z0 * f, tr * (1.05 - 0.1 * f + 0.25 * (1 - f) * (1 - f) * (1 - f))]);
      }
      tube(m, pts, coarse ? 6 : 9, BARK.scaly);
    }
    m.tint = tint;
  }
  m.mat = cardOf(leaves);
  const fronds = Math.max(3, Math.round(num(p, 'fronds', 7) * (detail === 1 ? 0.6 : coarse ? 1 : 1.3)));
  const across0 = num(p, 'across', 0.07);
  const [arch0, archVar] = (p.arch as [number, number] | undefined) ?? [0.72, 0.4];
  const steps = detail === 1 ? 2 : coarse ? 3 : Math.max(6, num(p, 'steps', 4));
  const crown: Crown = { x: 0, y: 0, z: z0, r: reach };
  for (let q = 0; q < fronds; q++) {
    const t = (TAU * (q + hash2(q, 1, seed) * 0.5)) / fronds + (q % 2) * 0.35;
    // As wide as its part says, where its kind's own shape is nearly that; wider fronds than their kind are drawn as their kind.
    const half = Math.max(across0 * reach * 1.25, ((reach * k.spray[1]) / k.spray[0]) * 0.32) * (0.85 + 0.3 * hash2(q, 2, seed));
    const arch = (z0 > 0 ? reach : h) * (arch0 + archVar * hash2(q, 3, seed));
    const len = reach * (0.82 + 0.25 * hash2(q, 4, seed));
    frond(m, sprayTile(kind, q + seed), 0, 0, z0, dcos(t), dsin(t), len, half, (arch / len) * 0.72, kind === 'frond-cycad' ? 0.45 : 0.7, steps, crown, 0.5, (q & 1) === 1);
  }
}

/** A mat of floating leaves, on the water. */
function floatingMat(m: Mesh, p: Part, seed: number, detail: Detail, tint: number): void {
  m.mat = LEAF_MATS[(p.mat as string) ?? 'frond'];
  m.tint = tint;
  m.light = 1;
  const r = num(p, 'radius', 2.4);
  const n = detail >= 2 ? 12 : detail === 1 ? 6 : 4;
  const hub = m.v(0, 0, 0.012, 0, 0, 1, 0, 0);
  const rim = m.verts;
  for (let i = 0; i <= n; i++) {
    const t = (TAU * (i % n)) / n;
    const w = r * (0.6 + 0.6 * hash2(i % n, 1, seed));
    m.v(dcos(t) * w, dsin(t) * w, 0.012, 0, 0, 1, i, w);
  }
  for (let i = 0; i < n; i++) m.tri(hub, rim + i, rim + i + 1);
}

// ——— A horsetail or a calamite: a jointed stem with a ring of branches at each joint ———

function whorled(m: Mesh, p: Part, h: number, seed: number, detail: Detail, tint: number, cards: boolean, coarse: boolean): void {
  const tr = h * num(p, 'trunk', 0.018);
  const reach = h * num(p, 'reach', 0.1);
  const leaves = LEAF_MATS[(p.mat as string) ?? 'needle'] ?? MAT.needle;
  m.tint = tint;
  if (detail < 2) {
    // From a way off, a slim cone, as on the lighter way: its branches are too thin to show.
    m.mat = detail === 1 && cards ? MAT.leafMass : leaves;
    m.light = 0.9;
    cone(m, reach * 0.7, h * 0.1, h, detail === 1 ? 5 : 3, 0, 0.5, 1);
    return;
  }
  const nodes = Math.max(2, Math.round(num(p, 'nodes', 12)));
  const around = Math.max(3, Math.round(num(p, 'around', 8)));
  const start = num(p, 'start', 0.12);
  const crown: Crown = { x: 0, y: 0, z: h * (start + (1 - start) * 0.5), r: Math.max(reach, h * 0.5) };
  m.mat = LEAF_MATS[(p.stem_mat as string) ?? 'bark'] ?? MAT.bark;
  m.light = 0.85;
  // The stem, swollen a little at each joint.
  const pts: number[][] = [[0, 0, -0.1, tr * 1.2]];
  const rings = coarse ? 3 : Math.min(nodes, 10);
  for (let i = 0; i <= rings; i++) {
    const f = i / rings;
    pts.push([0, 0, h * f, tr * (1 - 0.82 * f)]);
  }
  tube(m, pts, coarse ? 5 : 7, BARK.jointed);
  m.mat = cardOf(leaves);
  // A tree of it has leafy branches; a herb's are bare and thin, and the whole plant is on two cards that cross.
  if (h < 2.5) {
    crossed(m, 'whorl', h, Math.max(reach * 2.2, h * 0.3), 2, seed, 0.02);
    return;
  }
  const kind = leafOf(p) === 'whorl' ? 'needle-awl' : leafOf(p);
  const k: LeafKind = LEAF_KINDS[kind];
  for (let q = 0; q < nodes; q++) {
    const f = q / nodes;
    const z = h * (start + (1 - start) * f);
    const len = reach * (1.15 - f) * (0.8 + 0.4 * hash2(q, 4, seed));
    const n = coarse ? Math.max(3, around >> 1) : around;
    for (let i = 0; i < n; i++) {
      const t = (TAU * (i + (q & 1) * 0.5)) / n;
      const wide = Math.max(len * 0.34, ((len * k.spray[1]) / k.spray[0]) * 0.7) * (coarse ? 1.5 : 1);
      card(m, sprayTile(kind, i + q), 0, 0, z, dcos(t), dsin(t), 0.35, len * 1.1, wide, 0.06 + 0.12 * (hash2(i, q, seed) - 0.5), crown, (i & 1) === 1);
    }
  }
}

// ——— A scale tree: a tall pole that forks over and over at its top ———

function scaleTree(m: Mesh, p: Part, h: number, seed: number, detail: Detail, tint: number, cards: boolean, coarse: boolean): void {
  const kind = leafOf(p);
  const k: LeafKind = LEAF_KINDS[kind];
  const tr = h * num(p, 'trunk', 0.025);
  const at = h * num(p, 'fork_at', 0.72);
  const spread = h * num(p, 'spread', 0.14);
  const leaves = leavesOf(p, kind);
  m.tint = tint;
  if (detail === 0 || (detail === 1 && !cards)) {
    m.mat = leaves;
    m.light = 1;
    foliage(m, 0, 0, at + (h - at) * 0.55, spread * 1.1, (h - at) * 0.55, detail === 1 ? 6 : 4, detail === 1 ? 3 : 2, seed, detail === 1 ? 0.2 : 0);
    if (detail === 1) {
      m.mat = MAT.bark;
      m.light = 0.8;
      limb(m, 0, 0, -0.2, 0, 0, at, tr, tr * 0.6, 4);
    }
    return;
  }
  const crown: Crown = { x: 0, y: 0, z: at + (h - at) * 0.55, r: Math.max(spread * 1.2, (h - at) * 0.6) };
  const cardMat = cardOf(leaves);
  if (detail === 1) {
    m.mat = MAT.bark;
    m.light = 0.8;
    limb(m, 0, 0, -0.2, 0, 0, at, tr, tr * 0.6, 4);
    leafMass(m, 0, 0, at + (h - at) * 0.55, spread * 0.8, (h - at) * 0.42, 6, 3, seed, 0.6);
    m.mat = cardMat;
    const len = Math.min(Math.max(spread * 1.3, 0.7), k.bough[0] * 2.2);
    boughs(m, kind, 0, 0, at + (h - at) * 0.5, 12, len, { ...crown, z: at }, seed, 0.5);
    return;
  }
  m.mat = MAT.bark;
  m.light = 0.8;
  trunk(m, at, tr, tr * 0.62, 1.6, (hash2(1, 2, seed) - 0.5) * h * 0.02, 0, coarse ? 6 : 10, coarse ? 3 : 7, seed, BARK.cushioned);
  const lx = (hash2(1, 2, seed) - 0.5) * h * 0.02;
  const forks = Math.max(1, Math.round(num(p, 'forks', 2)));
  const size = Math.max(1, Math.min(2.5, spread / 1.6));
  const fork = (x: number, y: number, z: number, dirx: number, diry: number, len: number, r: number, depth: number, salt: number): void => {
    const a = TAU * hash2(depth, salt, seed) * 0.15;
    for (const side of [-1, 1]) {
      const ca = dcos(side * 0.62 + a);
      const sa = dsin(side * 0.62 + a);
      const nx = dirx * ca - diry * sa;
      const ny = dirx * sa + diry * ca;
      const ex = x + nx * len;
      const ey = y + ny * len;
      const ez = z + len * 0.72;
      m.mat = MAT.bark;
      m.light = 0.8;
      tube(m, [[x, y, z, r], [x + nx * len * 0.5, y + ny * len * 0.5, z + len * 0.42, r * 0.84], [ex, ey, ez, r * 0.68]], coarse ? 4 : 6, BARK.cushioned);
      if (depth > 0) fork(ex, ey, ez, nx, ny, len * 0.7, r * 0.68, depth - 1, salt * 2 + side + 3);
      else {
        m.mat = cardMat;
        if (coarse) {
          boughs(m, kind, ex, ey, ez, 3, Math.max(len * 1.5, 0.8), { ...crown, x, y, z }, seed + salt, 0.1);
          continue;
        }
        // Leafy shoots at the tips of the last forks, all round and drooping below: bottle brushes.
        const n = 9;
        const leaf = Math.max(len * 0.75, k.spray[0] * size * 0.8);
        for (let i = 0; i < n; i++) {
          const t = (TAU * (i + hash2(i, salt, seed) * 0.5)) / n;
          const up = 0.9 - (1.7 * i) / n;
          card(m, sprayTile(kind, i + salt), ex, ey, ez, dcos(t) + nx * 0.6, dsin(t) + ny * 0.6, up, leaf, (leaf * k.spray[1]) / k.spray[0] * 1.3, 0.25 + 0.2 * (hash2(i, salt + 1, seed) - 0.5), crown, (i & 1) === 1);
        }
      }
    }
  };
  fork(lx, 0, at, 1, 0, spread, tr * 0.5, forks, 1);
}

// ——— A tuft: blades from the ground, or soft leaves ———

/** Whose colour a tuft's blades take close by, by its material: a frond's, a needle's or a broad leaf's. */
const BLADES: Record<number, number> = { [MAT.frond]: 1, [MAT.needle]: 2, [MAT.broad]: 3 };

/** A card standing at a plant's foot, `turn` turns about the vertical, its top leaning out by `lean` of its height. */
function standing(m: Mesh, tile: number, x: number, y: number, turn: number, wide: number, tall: number, lean: number, flip: boolean): void {
  const c = dcos(TAU * turn);
  const s = dsin(TAU * turn);
  const hw = wide / 2;
  const tx = -s * lean * tall;
  const ty = c * lean * tall;
  const u0 = tileU(tile, flip ? 1 : 0);
  const u1 = tileU(tile, flip ? 0 : 1);
  // Lit as a low mass: its normal is mostly up, whichever side of it is seen.
  const a = m.v(x - c * hw, y - s * hw, 0, -s * 0.3, c * 0.3, 0.95, u0, 0, 0.55);
  const b = m.v(x + c * hw, y + s * hw, 0, -s * 0.3, c * 0.3, 0.95, u1, 0, 0.55);
  const d = m.v(x + c * hw + tx, y + s * hw + ty, tall, -s * 0.3, c * 0.3, 0.95, u1, 1, 1);
  const e = m.v(x - c * hw + tx, y - s * hw + ty, tall, -s * 0.3, c * 0.3, 0.95, u0, 1, 1);
  m.quad(a, b, d, e);
}

/** A low plant as cards that cross at its foot, at (x, y), each showing a whole tuft of its kind. */
function crossed(m: Mesh, kind: LeafKindName, h: number, wide: number, n: number, seed: number, lean = 0.06, x = 0, y = 0): void {
  const t0 = hash2(1, 3, seed);
  for (let i = 0; i < n; i++) standing(m, sprayTile(kind, seed + i), x, y, t0 + i / (2 * n) + 0.04 * hash2(i, 5, seed), wide, h * (0.88 + 0.12 * hash2(i, 6, seed)), lean * (i % 2 ? 1 : -1), hash2(i, 7, seed) < 0.5);
}

/**
 * A tuft of thin blades: a grass, a sedge or a rush, or a low clump of anything. Close by its blades are its own: thin
 * leaves, each bent over as it rises and narrowing to its tip, lit as the mass they make and with the sun through them.
 * Each vertex's normal is the tuft's, up and out from its foot. Its uv is across a blade from −1 to 1, and in v's whole
 * part the family of its colour by eight and the blade's own number, with the way up the blade in the fraction. A
 * soft-leaved herb is cards of its leaves; and so is any tuft from a little way off.
 */
function tuft(m: Mesh, p: Part, h: number, seed: number, detail: Detail, tint: number, cards: boolean, coarse: boolean): void {
  if (detail < 1) return;
  const kind = leafOf(p);
  const leaves = leavesOf(p, kind);
  const spread = h * num(p, 'spread', 0.5);
  m.tint = tint;
  if (detail === 1 && !cards) {
    // On the lighter way a tall tuft from a way off is what it always was: a third of its blades, each in two pieces,
    // a little wider so that the clump keeps its mass.
    m.mat = MAT.blade;
    m.light = 0.85;
    const family = BLADES[LEAF_MATS[(p.mat as string) ?? 'frond']] ?? 1;
    const blades = Math.max(4, Math.round(num(p, 'blades', 12) / 3));
    const wide = h * num(p, 'wide', 0.025) * 1.7;
    for (let k = 0; k < blades; k++) {
      const t = TAU * hash2(k, 1, seed);
      const out = spread * (0.3 + 0.7 * hash2(k, 2, seed));
      const tall = h * (0.55 + 0.45 * hash2(k, 3, seed));
      const dx = dcos(t);
      const dy = dsin(t);
      const v0 = 8 * family + ((seed + k) & 7);
      const base = m.verts;
      for (let i = 0; i <= 2; i++) {
        const f = i / 2;
        const w = wide * (1 - f);
        const r = out * f * f;
        m.v(dx * r - dy * w, dy * r + dx * w, tall * f, dx * 0.3, dy * 0.3, 0.9, -1, v0 + 0.999 * f, 0.5 + 0.5 * f);
        m.v(dx * r + dy * w, dy * r - dx * w, tall * f, dx * 0.3, dy * 0.3, 0.9, 1, v0 + 0.999 * f, 0.5 + 0.5 * f);
      }
      for (let i = 0; i < 2; i++) {
        const a = base + i * 2;
        m.quad(a, a + 1, a + 3, a + 2);
      }
    }
    return;
  }
  // Only blades are drawn one by one: a tuft of anything else is cards of its kind of leaf, at any distance.
  if (!kind.startsWith('blade') || detail === 1 || coarse) {
    m.light = 0.9;
    m.mat = cardOf(leaves);
    crossed(m, kind, h, Math.max(spread * 2.3, h * 0.45), detail === 1 ? 2 : 3, seed);
    return;
  }
  m.mat = MAT.blade;
  m.light = 0.85;
  const family = BLADES[leaves] ?? 1;
  const blades = Math.round(num(p, 'blades', 12) * 1.6);
  const wide = h * num(p, 'wide', 0.025) * 0.62;
  const steps = 4;
  for (let q = 0; q < blades; q++) {
    const t = TAU * hash2(q, 1, seed);
    const out = spread * (0.25 + 0.75 * hash2(q, 2, seed));
    const tall = h * (0.5 + 0.5 * hash2(q, 3, seed));
    const foot = spread * 0.14 * hash2(q, 4, seed);
    const dx = dcos(t);
    const dy = dsin(t);
    // A blade turned a little about its own length, so that the tuft has no two alike.
    const tw = (hash2(q, 5, seed) - 0.5) * 1.2;
    const wx = -dy * dcos(tw) + dx * dsin(tw) * 0.5;
    const wy = dx * dcos(tw) + dy * dsin(tw) * 0.5;
    const v0 = 8 * family + ((seed + q) & 7);
    const base = m.verts;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      // Widest a little way up, to a point at its tip; bending out, the more the higher, and its tip hanging.
      const w = wide * (i === 0 ? 0.7 : (1 - f) * 1.15 + 0.05);
      const r = foot + out * f * f * (0.7 + 0.5 * f);
      const z = tall * (f - 0.22 * f * f * f * (out / (tall + 1e-6)));
      m.v(dx * r - wx * w, dy * r - wy * w, z, dx * 0.3, dy * 0.3, 0.9, -1, v0 + 0.999 * f, 0.5 + 0.5 * f);
      m.v(dx * r + wx * w, dy * r + wy * w, z, dx * 0.3, dy * 0.3, 0.9, 1, v0 + 0.999 * f, 0.5 + 0.5 * f);
    }
    for (let i = 0; i < steps; i++) {
      const a = base + i * 2;
      m.quad(a, a + 1, a + 3, a + 2);
    }
  }
}

// ——— A shrub: stems from the ground that fork, with sprays at their ends ———

function shrub(m: Mesh, p: Part, h: number, seed: number, detail: Detail, tint: number, cards: boolean, coarse: boolean): void {
  const kind = leafOf(p);
  const k: LeafKind = LEAF_KINDS[kind];
  const leaves = leavesOf(p, kind);
  m.tint = tint;
  m.light = 1;
  const wideBy = num(p, 'wide', 0.6);
  if (detail === 0 || (detail === 1 && !cards)) {
    m.mat = leaves;
    foliage(m, 0, 0, h * 0.5, h * wideBy, h * 0.5, detail === 1 ? 6 : 4, detail === 1 ? 3 : 2, seed, detail === 1 ? 0.25 : 0);
    return;
  }
  const crown: Crown = { x: 0, y: 0, z: h * 0.35, r: Math.max(h * wideBy, h * 0.6) };
  const cardMat = cardOf(leaves);
  // A cushion close to the ground has no stems to speak of: cards of its kind, crossing, over each of its lumps.
  if (kind === 'moss' || h < 0.25) {
    m.mat = cardMat;
    const lumps = Math.max(1, Math.round(num(p, 'lumps', 5) * (detail === 1 ? 0.5 : 1)));
    for (let q = 0; q < lumps; q++) {
      const t = TAU * hash2(q, 1, seed);
      const out = h * wideBy * (q === 0 ? 0 : 0.35 + 0.5 * hash2(q, 2, seed));
      const size = h * (q === 0 ? 1 : 0.6 + 0.35 * hash2(q, 3, seed));
      crossed(m, kind === 'moss' ? 'moss' : kind, size, Math.max(size * 1.6, h * wideBy * 0.9), 2, seed + q * 7, 0.02, dcos(t) * out, dsin(t) * out);
    }
    return;
  }
  // A small plant's sprays are smaller; a big one's no bigger than the kind's.
  const size = Math.max(0.3, Math.min(1.25, (h * 0.42) / k.spray[0]));
  if (detail === 1) {
    m.mat = cardMat;
    boughs(m, kind, 0, 0, h * 0.5, 7, Math.max(h * 0.95, 0.3), { ...crown, z: 0 }, seed, 0.3);
    return;
  }
  const stems = Math.max(2, Math.round(num(p, 'lumps', 5) * (coarse ? 1 : 1.6)));
  for (let q = 0; q < stems; q++) {
    const t = TAU * (q / stems + 0.4 * hash2(q, 1, seed));
    const out = h * wideBy * (0.25 + 0.7 * hash2(q, 2, seed));
    const top = h * (0.55 + 0.45 * hash2(q, 3, seed)) * (1 - 0.3 * (out / (h * wideBy + 1e-6)) * (out / (h * wideBy + 1e-6)));
    const fx = dcos(t) * out * 0.08;
    const fy = dsin(t) * out * 0.08;
    const kx = dcos(t) * out * 0.6;
    const ky = dsin(t) * out * 0.6;
    const kz = top * 0.6;
    const rs = Math.max(h * 0.014, 0.006);
    m.mat = MAT.bark;
    m.light = 0.6;
    tube(m, bowed([fx, fy, -0.05], [kx * 0.4, ky * 0.4, kz * 0.6], [kx, ky, kz], rs, rs * 0.6, coarse ? 1 : 2), coarse ? 3 : 4);
    if (coarse) {
      m.mat = cardMat;
      boughs(m, kind, dcos(t) * out, dsin(t) * out, top * 0.8, 3, Math.max(h * 0.7, 0.3), { ...crown, z: 0 }, seed + q * 5, 0.3);
      continue;
    }
    const twigs = 3;
    for (let i = 0; i < twigs; i++) {
      const a = t + (i - 1) * 0.7 + (hash2(q, i + 4, seed) - 0.5) * 0.5;
      const ex = dcos(a) * out * (0.85 + 0.3 * hash2(q, i + 7, seed));
      const ey = dsin(a) * out * (0.85 + 0.3 * hash2(q, i + 7, seed));
      const ez = top * (0.8 + 0.2 * hash2(q, i + 9, seed));
      m.mat = MAT.bark;
      m.light = 0.6;
      limb(m, kx, ky, kz, ex, ey, ez, rs * 0.55, 0.003, 3);
      m.mat = cardMat;
      rosette(m, kind, ex, ey, ez, ex - kx, ey - ky, ez - kz + h * 0.1, 7, size, crown, seed + q * 31 + i * 7, 1.2);
      rosette(m, kind, (kx + ex) / 2, (ky + ey) / 2, (kz + ez) / 2, ex - kx, ey - ky, ez - kz, 3, size, crown, seed + q * 31 + i * 7 + 3, 1.4);
    }
  }
}

/**
 * A tree's trunk, as its form's first part with one gives it: how thick it is at breast height, as a share of the
 * tree's height, and which bark its limbs have, as its part's type draws it standing. Undefined for a plant with no
 * trunk. What a tree sheds lies under it in this bark (strewn.ts).
 */
export function trunkOf(form: Form): { r: number; bark: number } | undefined {
  for (const name of Object.keys(form.parts)) {
    const p = form.parts[name];
    if (!p) continue;
    switch (p.type) {
      case 'conifer':
      case 'broadleaf':
        return { r: num(p, 'trunk', 0.022), bark: BARK.furrowed };
      case 'palm':
        return { r: num(p, 'trunk', 0.03), bark: BARK.ringed };
      case 'fern':
        // A fern has a trunk only where it stands on a stem.
        if (num(p, 'on_stem', 0) > 0) return { r: num(p, 'stem', 0.04), bark: BARK.scaly };
        break;
      case 'whorled':
        return { r: num(p, 'trunk', 0.018), bark: BARK.jointed };
      case 'scale-tree':
        return { r: num(p, 'trunk', 0.025), bark: BARK.cushioned };
    }
  }
  return undefined;
}

/**
 * How wide a clump of a low plant stands on the ground, in metres: by it a sward of small tufts is sown closer than a
 * bed of ferns.
 */
export function clumpWidth(form: Form, h: number): number {
  let wide = 0.2;
  for (const name of Object.keys(form.parts)) {
    const p = form.parts[name];
    if (!p) continue;
    const w = p.type === 'tuft' ? Math.max(h * num(p, 'spread', 0.5) * 2.3, h * 0.45) : p.type === 'fern' ? h * num(p, 'reach', 0.95) * 1.5 : p.type === 'whorled' ? Math.max(h * num(p, 'reach', 0.1) * 2.2, h * 0.3) : p.type === 'shrub' ? h * num(p, 'wide', 0.6) * 2 : h * 0.9;
    if (w > wide) wide = w;
  }
  return wide;
}

/**
 * A clump of a low plant, as the ground's cover close by is drawn (docs/plans/RENDERING.md, step 2): a few cards of its
 * leaves, standing in for the plant at a small share of the cost of its mesh. A tuft is cards of its blades that cross
 * at its foot; a fern a few fronds; a horsetail two cards of its whorls; anything else a few sprays of its leaves.
 */
export function drawClump(m: Mesh, form: Form, h: number, seed: number, tint: number): void {
  m.tint = tint;
  m.light = 1;
  for (const name of Object.keys(form.parts)) {
    const p = form.parts[name];
    if (!p) continue;
    const kind = leafOf(p);
    const k: LeafKind = LEAF_KINDS[kind];
    const leaves = leavesOf(p, kind);
    switch (p.type) {
      case 'tuft': {
        m.mat = cardOf(leaves);
        crossed(m, kind, h, Math.max(h * num(p, 'spread', 0.5) * 2.3, h * 0.45), 3, seed);
        break;
      }
      case 'fern': {
        m.mat = cardOf(leaves);
        const z0 = h * num(p, 'on_stem', 0);
        const reach = h * num(p, 'reach', 0.95);
        const crown: Crown = { x: 0, y: 0, z: z0, r: reach };
        const t0 = hash2(1, 3, seed);
        const half = Math.max(num(p, 'across', 0.07) * reach * 1.25, ((reach * k.spray[1]) / k.spray[0]) * 0.32);
        for (let i = 0; i < 4; i++) {
          const t = TAU * (t0 + i / 4 + 0.08 * hash2(i, 7, seed));
          frond(m, sprayTile(kind, seed + i), 0, 0, z0, dcos(t), dsin(t), reach * (0.8 + 0.25 * hash2(i, 8, seed)), half, 0.55, 0.7, 2, crown, 0.55, (i & 1) === 1);
        }
        break;
      }
      case 'whorled': {
        m.mat = cardOf(LEAF_MATS[(p.mat as string) ?? 'needle'] ?? MAT.needle);
        crossed(m, 'whorl', h, Math.max(h * num(p, 'reach', 0.1) * 2.2, h * 0.3), 2, seed, 0.03);
        break;
      }
      default: {
        // Anything else: a few sprays of its leaves, each the size a spray is, round a ball as wide as the plant.
        m.mat = cardOf(leaves);
        const r = h * (p.type === 'shrub' ? num(p, 'wide', 0.6) : 0.45);
        const crown: Crown = { x: 0, y: 0, z: h * 0.4, r };
        if (kind === 'moss' || h < 0.25) crossed(m, kind === 'moss' ? 'moss' : kind, h, Math.max(r * 2, h), 2, seed, 0.02);
        else rosette(m, kind, 0, 0, h * 0.35, 0, 0, 1, Math.max(5, Math.min(9, Math.round(3 + h * 5))), Math.max(0.3, Math.min(1.2, (h * 0.6) / k.spray[0])), crown, seed, 1.7);
      }
    }
  }
}

/**
 * Draw a plant `h` metres tall, in the mesh's current frame. `cards`: from a way off, its leaves are on cards over the
 * mass of them, as close by; without, the plain shapes the lighter way to draw has always drawn. `coarse`: close by, but
 * a little way off: its limbs, with boughs in place of its twigs and their sprays.
 */
export function drawPlant(m: Mesh, form: Form, h: number, seed: number, detail: Detail, tint: number, cards = true, coarse = false): void {
  m.light = 1;
  for (const name of Object.keys(form.parts)) {
    const p = form.parts[name];
    if (!p) continue;
    if (p.near && (detail < 2 || coarse)) continue;
    switch (p.type) {
      case 'conifer':
        conifer(m, p, h, seed, detail, tint, cards, coarse);
        break;
      case 'broadleaf':
        broadleaf(m, p, h, seed, detail, tint, cards, coarse);
        break;
      case 'palm':
        palm(m, p, h, seed, detail, tint, cards, coarse);
        break;
      case 'fern':
        fern(m, p, h, seed, detail, tint, cards, coarse);
        break;
      case 'mat':
        floatingMat(m, p, seed, detail, tint);
        break;
      case 'whorled':
        whorled(m, p, h, seed, detail, tint, cards, coarse);
        break;
      case 'scale-tree':
        scaleTree(m, p, h, seed, detail, tint, cards, coarse);
        break;
      case 'tuft':
        tuft(m, p, h, seed, detail, tint, cards, coarse);
        break;
      case 'shrub':
        shrub(m, p, h, seed, detail, tint, cards, coarse);
        break;
      default:
        throw new Error(`no part of type "${p.type}" in a plant`);
    }
  }
}
