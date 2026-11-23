// The atlas of leaves (core/leaves.ts; docs/plans/RENDERING.md, step 1): for each kind of leaf, a few sprays of it on
// their twigs and a bough clothed in such sprays, drawn here once, when the first scene is made, into the layers of one
// array of textures. A plant's cards show them. Nothing here is a photograph, and nothing is any plant's record: a
// spray of a kind is drawn from what the kind is in words, leaf by leaf, by a small rasterizer, and is the same for
// every plant of the kind, at every place and time. What a card shows of it: how light each point of a leaf is, from 0
// to 1, which the shader turns into the plant's own greens; how much of the point is twig; how the leaf's face leans
// across its card, so that the two sides of its fold catch the light apart; and how much of the point is leaf at all.
import { boughTile, LEAF_KINDS, LEAF_KIND_NAMES, LEAF_TILE, LEAF_TILES, sprayTile, type LeafKind, type LeafKindName } from '../../../core/leaves.ts';

const W = LEAF_TILE.across;
const H = LEAF_TILE.along;
const TAU = Math.PI * 2;

/** A small generator of numbers from 0 to 1, the same in every browser. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** How a leaf is painted: how light, how far its two halves fold apart and it rolls as a whole, and its veins. */
interface Paint {
  light: number;
  /** the tilt of each half of the leaf, either side of its midrib; and of the whole leaf */
  fold?: number;
  roll?: number;
  /** how much lighter its midrib is, and how strongly its side veins show */
  rib?: number;
  vein?: number;
  /** how many side veins it has along its length */
  veins?: number;
  /** how much it darkens what lies under its edge */
  shadow?: number;
  /** how much of it is twig, not leaf */
  wood?: number;
}

/** A tile as it is drawn: in metres, across from −wide/2 to wide/2 and along from 0 at its twig's foot to its length. */
class Tile {
  readonly light = new Float32Array(W * H);
  readonly wood = new Float32Array(W * H);
  readonly tilt = new Float32Array(W * H);
  readonly cover = new Float32Array(W * H);
  /** texels to a metre, across and along; and their mean, by which an edge's distance becomes a share of a texel */
  readonly sx: number;
  readonly sy: number;
  readonly s: number;
  constructor(readonly len: number, readonly wide: number) {
    this.sx = W / wide;
    this.sy = H / len;
    this.s = Math.sqrt(this.sx * this.sy);
  }

  private put(k: number, a: number, light: number, wood: number, tilt: number): void {
    const b = 1 - a;
    this.light[k] = this.light[k] * b + light * a;
    this.wood[k] = this.wood[k] * b + wood * a;
    this.tilt[k] = this.tilt[k] * b + tilt * a;
    this.cover[k] += (1 - this.cover[k]) * a;
  }

  /**
   * A leaf from its foot at (bx, by), `len` long along a direction `ang` round from the tile's length towards its right,
   * and `wid` across at its widest: `outline` gives its half-width at each share of its length, 0 to 1.
   */
  leaf(bx: number, by: number, ang: number, len: number, wid: number, outline: (x: number) => number, p: Paint): void {
    const ax = Math.sin(ang);
    const ay = Math.cos(ang);
    const hw = wid / 2;
    const halo = 0.004 + 2 / this.s;
    const m = hw + halo;
    const x0 = Math.min(bx - m, bx + ax * len - m) - Math.abs(ax) * halo;
    const x1 = Math.max(bx + m, bx + ax * len + m) + Math.abs(ax) * halo;
    const y0 = Math.min(by - m, by + ay * len - m) - Math.abs(ay) * halo;
    const y1 = Math.max(by + m, by + ay * len + m) + Math.abs(ay) * halo;
    const i0 = Math.max(0, Math.floor((x0 + this.wide / 2) * this.sx));
    const i1 = Math.min(W - 1, Math.ceil((x1 + this.wide / 2) * this.sx));
    const j0 = Math.max(0, Math.floor(y0 * this.sy));
    const j1 = Math.min(H - 1, Math.ceil(y1 * this.sy));
    const shadow = p.shadow ?? 0.32;
    const fold = p.fold ?? 0.3;
    const roll = p.roll ?? 0;
    const rib = p.rib ?? 0.1;
    const vein = p.vein ?? 0.03;
    const veins = p.veins ?? 7;
    const wood = p.wood ?? 0;
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) / this.sy - by;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) / this.sx - this.wide / 2 - bx;
        const lx = (x * ax + y * ay) / len;
        const across = x * ay - y * ax;
        const w = lx < 0 || lx > 1 ? 0 : outline(lx);
        // Beyond its foot or its tip, as far as that point is; beside it, as far as its edge.
        const d = lx < 0 ? Math.hypot(lx * len, across) : lx > 1 ? Math.hypot((lx - 1) * len, across) : Math.abs(across) - w * hw;
        if (d > halo) continue;
        const k = j * W + i;
        const a = clamp(0.5 - d * this.s);
        if (shadow > 0 && this.cover[k] > 0) this.light[k] *= 1 - shadow * (1 - a) * smooth(halo, 0, d);
        if (a <= 0) continue;
        const ly = across / hw;
        const side = across < 0 ? -1 : 1;
        // Lighter towards its edge and its tip, its midrib paler, its side veins faint, running out and forwards.
        const u = Math.abs(ly) / Math.max(w, 1e-3);
        let l = p.light + 0.07 * (u - 0.5) + 0.06 * (lx - 0.5);
        if (rib > 0) l += rib * (1 - smooth(0, 0.09 + 0.6 / (hw * this.s), Math.abs(ly)));
        if (vein > 0) l += vein * Math.cos((lx * veins - u * 0.7) * TAU);
        this.put(k, a, clamp(l), wood, side * fold * (0.4 + 0.6 * u) + roll);
      }
    }
  }

  /** A length of twig or stalk, or of a blade: from one point to another, as thick as given at each end. */
  stem(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, light: number, wood = 1, fold = 0, shadow = 0.2): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy || 1e-12;
    const halo = 0.003 + 1.5 / this.s;
    const m = Math.max(r0, r1) + halo;
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - m + this.wide / 2) * this.sx));
    const i1 = Math.min(W - 1, Math.ceil((Math.max(x0, x1) + m + this.wide / 2) * this.sx));
    const j0 = Math.max(0, Math.floor((Math.min(y0, y1) - m) * this.sy));
    const j1 = Math.min(H - 1, Math.ceil((Math.max(y0, y1) + m) * this.sy));
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) / this.sy - y0;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) / this.sx - this.wide / 2 - x0;
        const t = clamp((x * dx + y * dy) / l2);
        const ex = x - dx * t;
        const ey = y - dy * t;
        const r = r0 + (r1 - r0) * t;
        const dist = Math.sqrt(ex * ex + ey * ey);
        const d = dist - r;
        if (d > halo) continue;
        const k = j * W + i;
        // Thinner than a texel, it covers its share of one.
        const a = clamp(0.5 - d * this.s) * Math.min(1, 2 * r * this.s + 0.4);
        if (shadow > 0 && this.cover[k] > 0) this.light[k] *= 1 - shadow * (1 - a) * smooth(halo, 0, d);
        if (a <= 0) continue;
        const side = x * dy - y * dx < 0 ? -1 : 1;
        const u = r > 0 ? clamp(dist / r) : 0;
        this.put(k, a, clamp(light - 0.1 * u * u * wood + 0.05 * (1 - u) * (1 - wood)), wood, side * fold * u);
      }
    }
  }

  /** A stalk or a blade along a curve: from `a` towards `c` and on to `b`, thinning from r0 to r1. */
  curve(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, r0: number, r1: number, light: number, wood = 1, fold = 0, lighten = 0, steps = 10): void {
    let px = ax;
    let py = ay;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      const x = u * u * ax + 2 * u * t * cx + t * t * bx;
      const y = u * u * ay + 2 * u * t * cy + t * t * by;
      const t0 = (k - 1) / steps;
      this.stem(px, py, x, y, r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t, light + lighten * t0, wood, fold, k === 1 ? 0.2 : 0);
      px = x;
      py = y;
    }
  }

  /** A quarter-size copy of the tile, for a bough to be made of it without the fine leaves breaking up. */
  small(): { light: Float32Array; wood: Float32Array; tilt: Float32Array; cover: Float32Array; w: number; h: number } {
    const w = W >> 2;
    const h = H >> 2;
    const out = { light: new Float32Array(w * h), wood: new Float32Array(w * h), tilt: new Float32Array(w * h), cover: new Float32Array(w * h), w, h };
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let a = 0;
        let l = 0;
        let g = 0;
        let t = 0;
        for (let q = 0; q < 4; q++) {
          for (let r = 0; r < 4; r++) {
            const k = (j * 4 + q) * W + i * 4 + r;
            const c = this.cover[k];
            a += c;
            l += this.light[k] * c;
            g += this.wood[k] * c;
            t += this.tilt[k] * c;
          }
        }
        const k = j * w + i;
        out.cover[k] = a / 16;
        if (a > 0) {
          out.light[k] = l / a;
          out.wood[k] = g / a;
          out.tilt[k] = t / a;
        }
      }
    }
    return out;
  }

  /**
   * Another tile laid into this one, small: its twig's foot at (bx, by), its length along `ang`, drawn `scale` times its
   * own size, `flip` −1 to mirror it. What is under it is darkened round it, and it is a little lighter or darker as a
   * whole, as `shade` says.
   */
  stamp(src: Tile, from: ReturnType<Tile['small']>, bx: number, by: number, ang: number, scale: number, flip: number, shade: number): void {
    const ax = Math.sin(ang);
    const ay = Math.cos(ang);
    const len = src.len * scale;
    const hw = (src.wide * scale) / 2;
    const xs = [bx - ay * hw, bx + ay * hw, bx + ax * len - ay * hw, bx + ax * len + ay * hw];
    const ys = [by + ax * hw, by - ax * hw, by + ay * len + ax * hw, by + ay * len - ax * hw];
    const i0 = Math.max(0, Math.floor((Math.min(...xs) + this.wide / 2) * this.sx));
    const i1 = Math.min(W - 1, Math.ceil((Math.max(...xs) + this.wide / 2) * this.sx));
    const j0 = Math.max(0, Math.floor(Math.min(...ys) * this.sy));
    const j1 = Math.min(H - 1, Math.ceil(Math.max(...ys) * this.sy));
    const { w, h } = from;
    const read = (buf: Float32Array, fx: number, fy: number): number => {
      const x = clamp(fx - 0.5, 0, w - 1.001);
      const y = clamp(fy - 0.5, 0, h - 1.001);
      const i = Math.floor(x);
      const j = Math.floor(y);
      const u = x - i;
      const v = y - j;
      const k = j * w + i;
      return (buf[k] * (1 - u) + buf[k + 1] * u) * (1 - v) + (buf[k + w] * (1 - u) + buf[k + w + 1] * u) * v;
    };
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) / this.sy - by;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) / this.sx - this.wide / 2 - bx;
        const along = (x * ax + y * ay) / len;
        const across = ((x * ay - y * ax) / hw) * flip;
        if (along < 0 || along > 1 || across < -1 || across > 1) continue;
        const fx = (across * 0.5 + 0.5) * w;
        const fy = along * h;
        const a = read(from.cover, fx, fy);
        const k = j * W + i;
        // What lies under is in its shade, a little way round it.
        if (this.cover[k] > 0) {
          const near = Math.max(read(from.cover, fx + 3, fy + 3), read(from.cover, fx - 3, fy + 3), read(from.cover, fx, fy - 4));
          this.light[k] *= 1 - 0.3 * (1 - a) * near;
        }
        if (a <= 0.004) continue;
        this.put(k, a, clamp(read(from.light, fx, fy) / Math.max(a, 1e-3) * a + shade), read(from.wood, fx, fy), read(from.tilt, fx, fy) * flip);
      }
    }
  }
}

// ——— The outlines of leaves: half the width at each share of the length, 0 to 1 ———

/** An oval leaf, widest before its middle, coming to a point. */
const oval = (x: number) => Math.pow(Math.sin(Math.PI * Math.pow(x, 0.72)), 0.85) * (1 - 0.35 * x * x * x);
/** A narrow leaf, widest a third of the way out. */
const lance = (x: number) => Math.pow(Math.sin(Math.PI * Math.pow(x, 0.6)), 1.25);
/** A tongue: widest beyond its middle, its end rounded. */
const tongue = (x: number) => Math.pow(Math.sin(Math.PI * Math.pow(x, 1.25)), 0.55);
/** A needle. */
const needle = (x: number) => Math.min(1, x * 12) * Math.pow(clamp((1 - x) * 5), 0.6);
/** A small round leaflet. */
const round = (x: number) => Math.sqrt(Math.max(0, 1 - (2 * x - 1) * (2 * x - 1)));
/** A leaflet with a scalloped edge, as a fern's is cut. */
const cut = (n: number) => (x: number) => lance(x) * (0.72 + 0.28 * Math.abs(Math.sin(x * n * Math.PI)));

// ——— Sprays ———

type Draw = (t: Tile, r: () => number) => void;

/** A twig along the tile from its foot, wandering a little: the points along it, each with how far round it has turned. */
function twig(t: Tile, r: () => number, to: number, thick: number, wander = 0.05, light = 0.3): { x: number; y: number; ang: number }[] {
  const pts: { x: number; y: number; ang: number }[] = [];
  const n = 14;
  let x = 0;
  let ang = (r() - 0.5) * wander;
  let px = 0;
  let py = 0;
  for (let k = 0; k <= n; k++) {
    const y = (to * k) / n;
    pts.push({ x, y, ang });
    if (k > 0) t.stem(px, py, x, y, thick * (1 - (0.75 * (k - 1)) / n), thick * (1 - (0.75 * k) / n), light, 1);
    px = x;
    py = y;
    ang += (r() - 0.5) * wander * 1.6 - ang * 0.25;
    x += Math.sin(ang) * (to / n);
  }
  return pts;
}

/** Where a twig is at a share of its length. */
function at(pts: { x: number; y: number; ang: number }[], f: number): { x: number; y: number; ang: number } {
  const g = clamp(f) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(g));
  const u = g - i;
  return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * u, y: pts[i].y + (pts[i + 1].y - pts[i].y) * u, ang: pts[i].ang + (pts[i + 1].ang - pts[i].ang) * u };
}

/** Leaves alternate along a twig, on stalks, with one at its end. */
function alternate(t: Tile, r: () => number, pts: { x: number; y: number; ang: number }[], n: number, len: number, wid: number, outline: (x: number) => number, from = 0.08, paint: Partial<Paint> = {}): void {
  const order = Array.from({ length: n + 1 }, (_, i) => i).sort(() => r() - 0.5);
  for (const i of order) {
    const end = i === n;
    const f = end ? 1 : from + ((1 - from) * (i + 0.3 + 0.4 * r())) / n;
    const p = at(pts, f);
    const side = i % 2 ? 1 : -1;
    const ang = end ? p.ang + (r() - 0.5) * 0.4 : p.ang + side * (0.75 + 0.5 * r());
    const l = len * (0.72 + 0.4 * r()) * (end ? 1 : 0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, f * 1.15)));
    const stalk = l * 0.12;
    const sx = p.x + Math.sin(ang) * stalk;
    const sy = p.y + Math.cos(ang) * stalk;
    t.stem(p.x, p.y, sx, sy, 0.0012, 0.001, 0.4, 0.7, 0, 0);
    t.leaf(sx, sy, ang + (r() - 0.5) * 0.25, l, l * wid * (0.85 + 0.3 * r()), outline, { light: 0.34 + 0.4 * r(), fold: 0.25 + 0.3 * r(), roll: (r() - 0.5) * 0.5, ...paint });
  }
}

const SPRAYS: Record<LeafKindName, Draw> = {
  'needle-flat': (t, r) => {
    // A shoot with side shoots either side of it, each with needles in two flat ranks, shorter towards its end.
    const pts = twig(t, r, t.len * 0.97, 0.0022);
    const ranks = (bx: number, by: number, ang: number, len: number, size: number) => {
      const n = Math.max(4, Math.round(len / 0.0045));
      t.stem(bx, by, bx + Math.sin(ang) * len, by + Math.cos(ang) * len, 0.0011, 0.0006, 0.34, 0.8, 0, 0.15);
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        const l = size * (0.55 + 0.45 * Math.sin(Math.PI * Math.pow(f, 0.7))) * (0.85 + 0.3 * r());
        for (const side of [-1, 1]) {
          const a = ang + side * (1.05 + 0.2 * r());
          t.leaf(bx + Math.sin(ang) * len * f, by + Math.cos(ang) * len * f, a, l, 0.0016 + 0.0008 * r(), needle, { light: 0.3 + 0.45 * r(), fold: 0.15, rib: 0.06, vein: 0, shadow: 0.12 });
        }
      }
    };
    const shoots = 9 + Math.floor(r() * 3);
    for (let i = 0; i < shoots; i++) {
      const f = 0.1 + (0.82 * (i + 0.5 * r())) / shoots;
      const p = at(pts, f);
      const side = i % 2 ? 1 : -1;
      const len = t.wide * (0.2 + 0.26 * Math.sin(Math.PI * Math.pow(f, 0.8))) * (0.8 + 0.4 * r());
      ranks(p.x, p.y, p.ang + side * (0.85 + 0.25 * r()), len, 0.016);
    }
    const tip = at(pts, 0.86);
    ranks(tip.x, tip.y, tip.ang, t.len * 0.13, 0.014);
  },
  'needle-tuft': (t, r) => {
    // A twig with a few short side twigs: at the end of each a brush of long needles, and older ones thinly behind it.
    const brush = (bx: number, by: number, ang: number, size: number, n: number) => {
      for (let k = 0; k < n; k++) {
        const a = ang + (r() - 0.5) * 2.1 * (0.4 + 0.6 * r());
        const l = size * (0.7 + 0.45 * r());
        const bend = (r() - 0.5) * 0.35;
        const ex = bx + Math.sin(a) * l;
        const ey = by + Math.cos(a) * l;
        t.curve(bx, by, bx + Math.sin(a + bend) * l * 0.55, by + Math.cos(a + bend) * l * 0.55, ex, ey, 0.00075, 0.00035, 0.26 + 0.42 * r(), 0, 0.1, 0.12, 5);
      }
    };
    const pts = twig(t, r, t.len * 0.62, 0.003);
    const ends: { x: number; y: number; ang: number }[] = [at(pts, 1)];
    const sides = 2 + Math.floor(r() * 2);
    for (let i = 0; i < sides; i++) {
      const p = at(pts, 0.3 + 0.45 * (i / sides) + 0.1 * r());
      const a = p.ang + (i % 2 ? 1 : -1) * (0.7 + 0.3 * r());
      const l = t.len * (0.14 + 0.1 * r());
      t.stem(p.x, p.y, p.x + Math.sin(a) * l, p.y + Math.cos(a) * l, 0.0022, 0.0016, 0.3, 1);
      ends.push({ x: p.x + Math.sin(a) * l, y: p.y + Math.cos(a) * l, ang: a });
    }
    for (const e of ends.reverse()) {
      // Older needles along the twig below the brush, sparser.
      brush(e.x - Math.sin(e.ang) * 0.05, e.y - Math.cos(e.ang) * 0.05, e.ang, t.len * 0.2, 16);
      brush(e.x, e.y, e.ang, t.len * 0.3, 44);
    }
  },
  'needle-scale': (t, r) => {
    // Shoots clothed in scale leaves, as cords, branching three times in one plane, each branch leaning forward: a
    // flattened spray, close, its edge lacy.
    const cord = (bx: number, by: number, ang: number, len: number, depth: number) => {
      const gap = depth === 0 ? 0.017 : depth === 1 ? 0.01 : 0.0065;
      const n = Math.max(2, Math.round(len / gap));
      const thick = depth === 0 ? 0.0024 : 0.0018;
      let x = bx;
      let y = by;
      let a = ang;
      for (let k = 0; k < n; k++) {
        const nx = x + (Math.sin(a) * len) / n;
        const ny = y + (Math.cos(a) * len) / n;
        // Each scale a little lighter at its tip: the cord is beaded along its length.
        t.stem(x, y, nx, ny, thick, thick * (k === n - 1 ? 0.6 : 1), 0.26 + 0.34 * r() + (k % 2) * 0.1, depth === 0 ? 0.2 : 0, 0.25, depth < 2 ? 0.2 : 0.08);
        if (depth < 3 && k > 0) {
          const f = k / n;
          const side = (k + depth) % 2 ? 1 : -1;
          const reach = depth === 0 ? t.wide * 0.7 * Math.pow(Math.sin(Math.PI * Math.pow(f, 0.6)), 0.7) : len * 0.45 * (1 - 0.55 * f);
          if (reach > 0.007) cord(nx, ny, a + side * (0.5 + 0.16 * r()), reach * (0.8 + 0.3 * r()), depth + 1);
        }
        x = nx;
        y = ny;
        a += (r() - 0.5) * 0.08;
      }
    };
    cord(0, 0, (r() - 0.5) * 0.1, t.len * 0.97, 0);
  },
  'needle-awl': (t, r) => {
    // Short stiff leaves all round a shoot: seen from the side, a brush, densest along the shoot's middle.
    const brush = (pts: { x: number; y: number; ang: number }[], size: number, n: number) => {
      for (let k = 0; k < n; k++) {
        const f = r();
        const p = at(pts, f);
        const side = r() < 0.5 ? -1 : 1;
        // Those that point at the eye are short on the card, and lie over the shoot.
        const turn = r();
        const a = p.ang + side * (0.45 + 0.75 * turn);
        const l = size * (0.35 + 0.65 * turn) * (0.8 + 0.4 * r()) * (f > 0.9 ? 0.7 : 1);
        t.leaf(p.x, p.y, a, l, 0.0022 + 0.001 * r(), needle, { light: 0.24 + 0.5 * r() - 0.12 * (1 - turn), fold: 0.2, rib: 0.05, vein: 0, shadow: 0.14 });
      }
    };
    const pts = twig(t, r, t.len * 0.94, 0.0028, 0.08);
    brush(pts, t.wide * 0.42, 420);
    const tip = at(pts, 1);
    for (let k = 0; k < 14; k++) t.leaf(tip.x, tip.y, tip.ang + (r() - 0.5) * 1.1, t.wide * 0.3 * (0.6 + 0.5 * r()), 0.0024, needle, { light: 0.4 + 0.4 * r(), fold: 0.2, vein: 0, rib: 0.05, shadow: 0.1 });
  },
  'frond-fern': (t, r) => {
    // A stalk, bare at its foot, with leaflets either side: longest a third of the way out, each cut at its edge.
    t.curve(0, 0, 0, t.len * 0.5, 0, t.len * 0.99, 0.0045, 0.0012, 0.36, 0.6, 0, 0, 16);
    const n = 26;
    for (let i = 0; i < n; i++) {
      const f = 0.1 + (0.88 * i) / n;
      const env = Math.pow(Math.sin(Math.PI * Math.pow((f - 0.08) / 0.92, 0.62)), 0.8);
      for (const side of [-1, 1]) {
        const l = (t.wide / 2) * 0.98 * env * (0.92 + 0.12 * r());
        if (l < 0.006) continue;
        const y = t.len * (f + (side > 0 ? 0 : 0.5 / n));
        t.leaf(0, y, side * (1.18 - 0.3 * f + 0.08 * (r() - 0.5)), l, Math.min(0.03, (t.len / n) * 0.9), cut(9), { light: 0.32 + 0.3 * r(), fold: 0.3, roll: side * 0.15, rib: 0.1, vein: 0.02, veins: 9, shadow: 0.25 });
      }
    }
    t.leaf(0, t.len * 0.95, 0, t.len * 0.05, 0.012, lance, { light: 0.5 });
  },
  'frond-cycad': (t, r) => {
    // A stout stalk with narrow stiff leaflets close together, straight, each to a point.
    t.curve(0, 0, 0, t.len * 0.5, 0, t.len * 0.99, 0.006, 0.002, 0.38, 0.5, 0, 0, 12);
    const n = 38;
    for (let i = 0; i < n; i++) {
      const f = 0.12 + (0.86 * i) / n;
      const env = Math.pow(Math.sin(Math.PI * Math.pow((f - 0.1) / 0.9, 0.7)), 0.6);
      for (const side of [-1, 1]) {
        const l = (t.wide / 2) * 0.98 * env * (0.94 + 0.08 * r());
        if (l < 0.01) continue;
        t.leaf(0, t.len * f, side * (1.02 - 0.35 * f + 0.05 * (r() - 0.5)), l, 0.011 + 0.003 * r(), lance, { light: 0.26 + 0.28 * r(), fold: 0.35, roll: side * 0.2, rib: 0.12, vein: 0, shadow: 0.3 });
      }
    }
  },
  'frond-feather': (t, r) => {
    // A long arching stalk with long narrow leaflets, drooping, those of one side a little apart in their set.
    t.curve(0, 0, 0, t.len * 0.5, 0, t.len * 0.99, 0.007, 0.0015, 0.36, 0.5, 0, 0, 12);
    const n = 44;
    for (let i = 0; i < n; i++) {
      const f = 0.14 + (0.85 * i) / n;
      const env = Math.pow(Math.sin(Math.PI * Math.pow((f - 0.12) / 0.88, 0.75)), 0.5);
      for (const side of [-1, 1]) {
        const l = (t.wide / 2) * 0.98 * env * (0.86 + 0.16 * r());
        if (l < 0.015) continue;
        t.leaf(0, t.len * (f + 0.01 * (r() - 0.5)), side * (0.95 - 0.3 * f + 0.14 * (r() - 0.5)), l, 0.013 + 0.004 * r(), lance, { light: 0.24 + 0.34 * r(), fold: 0.4, roll: side * 0.25 + (r() - 0.5) * 0.4, rib: 0.1, vein: 0, shadow: 0.28 });
      }
    }
  },
  'frond-fan': (t, r) => {
    // A stalk to a hub, and from the hub a fan of segments, joined for half their length and parted beyond it.
    const hub = t.len * 0.3;
    t.stem(0, 0, 0, hub, 0.008, 0.006, 0.36, 0.5);
    const n = 30;
    const reach = Math.min(t.len - hub, t.wide / 2) * 0.98;
    const order = Array.from({ length: n }, (_, i) => i).sort(() => r() - 0.5);
    for (const i of order) {
      const a = (-1 + (2 * (i + 0.5)) / n) * 1.9;
      const l = reach * (0.86 + 0.14 * Math.cos(a * 0.7)) * (0.95 + 0.08 * r());
      // Wide where the segments are joined, then narrowing to a point.
      t.leaf(0, hub, a, l, l * 0.17, (x) => Math.min(1, x * 5) * (x < 0.5 ? 1 : Math.pow(clamp((1 - x) / 0.5), 0.8)), { light: 0.28 + 0.26 * r() + 0.08 * Math.cos(a), fold: 0.45 * (i % 2 ? 1 : -1), rib: 0.1, vein: 0, shadow: 0.12 });
    }
  },
  'frond-seed': (t, r) => {
    // A frond twice divided: side stalks either side of its own, each with small rounded leaflets.
    t.curve(0, 0, 0, t.len * 0.5, 0, t.len * 0.99, 0.0055, 0.0012, 0.34, 0.6, 0, 0, 14);
    const n = 13;
    for (let i = 0; i < n; i++) {
      const f = 0.12 + (0.84 * i) / n;
      const env = Math.pow(Math.sin(Math.PI * Math.pow((f - 0.1) / 0.9, 0.6)), 0.75);
      for (const side of [-1, 1]) {
        const l = (t.wide / 2) * 0.97 * env * (0.9 + 0.14 * r());
        if (l < 0.02) continue;
        const a = side * (1.1 - 0.35 * f + 0.1 * (r() - 0.5));
        const by = t.len * (f + (side > 0 ? 0 : 0.5 / n));
        t.stem(0, by, Math.sin(a) * l, by + Math.cos(a) * l, 0.0018, 0.0007, 0.36, 0.5, 0, 0.1);
        const m = Math.max(3, Math.round(l / 0.016));
        for (let k = 0; k < m; k++) {
          const g = (k + 0.5) / m;
          const size = 0.02 * (0.6 + 0.4 * Math.sin(Math.PI * Math.pow(g, 0.6))) * (0.85 + 0.3 * r());
          for (const s2 of [-1, 1]) t.leaf(Math.sin(a) * l * g, by + Math.cos(a) * l * g, a + s2 * (1.0 + 0.25 * r()), size, size * 0.62, round, { light: 0.3 + 0.34 * r(), fold: 0.25, roll: (r() - 0.5) * 0.4, rib: 0.07, vein: 0, shadow: 0.2 });
        }
      }
    }
  },
  'broad-oval': (t, r) => {
    const pts = twig(t, r, t.len * 0.86, 0.0024, 0.12);
    alternate(t, r, pts, 14 + Math.floor(r() * 4), t.len * 0.21, 0.5, oval);
  },
  'broad-lobed': (t, r) => {
    // Leaves of five lobes spread like a hand, on long stalks, alternate along a twig.
    const pts = twig(t, r, t.len * 0.8, 0.0026, 0.12);
    const n = 6 + Math.floor(r() * 2);
    const order = Array.from({ length: n + 1 }, (_, i) => i).sort(() => r() - 0.5);
    for (const i of order) {
      const end = i === n;
      const f = end ? 1 : 0.1 + (0.86 * (i + 0.3 + 0.4 * r())) / n;
      const p = at(pts, f);
      const ang = end ? p.ang + (r() - 0.5) * 0.4 : p.ang + (i % 2 ? 1 : -1) * (0.8 + 0.45 * r());
      const size = t.len * 0.25 * (0.75 + 0.4 * r());
      const stalk = size * 0.45;
      const hx = p.x + Math.sin(ang) * stalk;
      const hy = p.y + Math.cos(ang) * stalk;
      t.stem(p.x, p.y, hx, hy, 0.0012, 0.001, 0.42, 0.6, 0, 0);
      const light = 0.34 + 0.38 * r();
      const roll = (r() - 0.5) * 0.5;
      // The lobes are one leaf: none shades another, and all are of one green.
      [[-1.25, 0.56], [1.25, 0.56], [-0.62, 0.84], [0.62, 0.84], [0, 1]].forEach(([a, l], q) => t.leaf(hx, hy, ang + a, size * l, size * l * 0.52, (x) => Math.min(1, x * 3.2 + 0.25) * oval(clamp(x * 0.9 + 0.1)), { light, fold: 0.22, roll: roll + a * 0.15, rib: 0.1, vein: 0.03, shadow: q === 0 ? 0.3 : 0 }));
    }
  },
  'broad-fan': (t, r) => {
    // Short spurs along a twig, each with a cluster of fan-shaped leaves on long stalks, notched at their outer edge.
    const pts = twig(t, r, t.len * 0.82, 0.0028, 0.1);
    const spurs = 5 + Math.floor(r() * 2);
    for (let i = 0; i <= spurs; i++) {
      const end = i === spurs;
      const p = at(pts, end ? 1 : 0.1 + (0.84 * (i + 0.5 * r())) / spurs);
      const out = end ? p.ang : p.ang + (i % 2 ? 1 : -1) * (1.0 + 0.3 * r());
      const sx = p.x + Math.sin(out) * 0.012;
      const sy = p.y + Math.cos(out) * 0.012;
      t.stem(p.x, p.y, sx, sy, 0.0024, 0.002, 0.3, 1, 0, 0);
      const leaves = 2 + Math.floor(r() * 2);
      for (let k = 0; k < leaves; k++) {
        const a = out + ((k + 0.5) / leaves - 0.5) * 1.9 + (r() - 0.5) * 0.3;
        const stalk = t.len * (0.08 + 0.05 * r());
        const hx = sx + Math.sin(a) * stalk;
        const hy = sy + Math.cos(a) * stalk;
        t.stem(sx, sy, hx, hy, 0.0009, 0.0008, 0.44, 0.5, 0, 0);
        const size = t.len * 0.115 * (0.8 + 0.4 * r());
        // A wedge opening from its stalk to a rounded, wavy edge, cut at its middle.
        t.leaf(hx, hy, a, size, size * 1.15, (x) => (x < 0.74 ? 0.06 + x * 1.27 : Math.sqrt(Math.max(0, 1 - Math.pow((x - 0.74) / 0.26, 2))) * (0.94 + 0.06 * Math.cos(x * 60))), { light: 0.36 + 0.36 * r(), fold: 0.2, roll: (r() - 0.5) * 0.5, rib: 0, vein: 0.03, veins: 0.01, shadow: 0.3 });
      }
    }
  },
  'broad-tongue': (t, r) => {
    // A twig with tufts of tongue-shaped leaves, each with a strong midrib: one tuft at its end, one or two below.
    const pts = twig(t, r, t.len * 0.6, 0.003, 0.1);
    const tufts = [1, 0.5 + 0.2 * r(), ...(r() < 0.6 ? [0.2 + 0.15 * r()] : [])];
    for (const f of tufts.reverse()) {
      const p = at(pts, f);
      const n = 7 + Math.floor(r() * 3);
      const order = Array.from({ length: n }, (_, i) => i).sort(() => r() - 0.5);
      for (const i of order) {
        const a = p.ang + ((i + 0.5) / n - 0.5) * (f === 1 ? 3.0 : 3.8) + (r() - 0.5) * 0.25;
        const l = t.len * (f === 1 ? 0.36 : 0.26) * (0.7 + 0.4 * r());
        t.leaf(p.x, p.y, a, l, l * 0.3, tongue, { light: 0.3 + 0.4 * r(), fold: 0.3, roll: (r() - 0.5) * 0.5, rib: 0.16, vein: 0.03, veins: 14, shadow: 0.34 });
      }
    }
  },
  'broad-strap': (t, r) => {
    // Long strap leaves from the end of a twig, spreading and arching: each drawn in two lengths, the outer bent down.
    const pts = twig(t, r, t.len * 0.3, 0.004, 0.08);
    const p = at(pts, 1);
    const n = 11 + Math.floor(r() * 4);
    const order = Array.from({ length: n }, (_, i) => i).sort(() => r() - 0.5);
    for (const i of order) {
      const a = p.ang + ((i + 0.5) / n - 0.5) * 2.5 + (r() - 0.5) * 0.2;
      const l = t.len * 0.66 * (0.65 + 0.4 * r());
      const bend = (a - p.ang) * 0.25 + (r() - 0.5) * 0.2;
      const light = 0.28 + 0.4 * r();
      const mx = p.x + Math.sin(a) * l * 0.55;
      const my = p.y + Math.cos(a) * l * 0.55;
      t.leaf(p.x, p.y, a, l * 0.6, 0.042, (x) => Math.min(1, x * 9), { light, fold: 0.3, rib: 0.08, vein: 0.02, veins: 0.01, shadow: 0.34 });
      t.leaf(mx, my, a + bend, l * 0.46, 0.042, (x) => Math.pow(clamp((1 - x) * 2.2), 0.5), { light: light + 0.06, fold: 0.3, rib: 0.08, vein: 0.02, veins: 0.01, shadow: 0.2 });
    }
  },
  'broad-small': (t, r) => {
    // Wiry twigs, branching, with many small leaves.
    const main = twig(t, r, t.len * 0.9, 0.0016, 0.16);
    alternate(t, r, main, 18, t.len * 0.075, 0.5, oval, 0.1, { rib: 0.05, vein: 0, shadow: 0.2 });
    const sides = 4 + Math.floor(r() * 2);
    for (let i = 0; i < sides; i++) {
      const p = at(main, 0.12 + (0.6 * i) / sides + 0.08 * r());
      const a = p.ang + (i % 2 ? 1 : -1) * (0.55 + 0.35 * r());
      const l = t.len * (0.3 + 0.2 * r());
      const pts: { x: number; y: number; ang: number }[] = [];
      for (let k = 0; k <= 8; k++) pts.push({ x: p.x + (Math.sin(a) * l * k) / 8, y: p.y + (Math.cos(a) * l * k) / 8, ang: a });
      t.stem(p.x, p.y, pts[8].x, pts[8].y, 0.0012, 0.0006, 0.32, 1, 0, 0.1);
      alternate(t, r, pts, 10, t.len * 0.07, 0.5, oval, 0.1, { rib: 0.05, vein: 0, shadow: 0.2 });
    }
  },
  'broad-compound': (t, r) => {
    // Leaves of many small leaflets either side of a stalk, alternate along a twig.
    const pts = twig(t, r, t.len * 0.8, 0.0022, 0.12);
    const n = 6 + Math.floor(r() * 2);
    const order = Array.from({ length: n + 1 }, (_, i) => i).sort(() => r() - 0.5);
    for (const i of order) {
      const end = i === n;
      const p = at(pts, end ? 1 : 0.08 + (0.88 * (i + 0.3 + 0.4 * r())) / n);
      const a = end ? p.ang + (r() - 0.5) * 0.4 : p.ang + (i % 2 ? 1 : -1) * (0.8 + 0.4 * r());
      const l = t.len * 0.3 * (0.75 + 0.4 * r());
      t.stem(p.x, p.y, p.x + Math.sin(a) * l, p.y + Math.cos(a) * l, 0.001, 0.0005, 0.42, 0.5, 0, 0.1);
      const pairs = 9 + Math.floor(r() * 4);
      const light = 0.32 + 0.3 * r();
      for (let k = 0; k < pairs; k++) {
        const g = 0.12 + (0.86 * k) / pairs;
        const size = l * 0.17 * (0.7 + 0.3 * Math.sin(Math.PI * g));
        for (const side of [-1, 1]) t.leaf(p.x + Math.sin(a) * l * g, p.y + Math.cos(a) * l * g, a + side * (1.15 + 0.15 * r()), size, size * 0.42, oval, { light: light + 0.14 * (r() - 0.5), fold: 0.2, roll: side * 0.2, rib: 0.05, vein: 0, shadow: 0.18 });
      }
    }
  },
  'blade-grass': (t, r) => {
    // Many narrow blades from a foot a hand wide, fanning out, the outer ones bent over; a few stalks with heads.
    const n = 70 + Math.floor(r() * 30);
    const blades: { x: number; a: number; l: number; z: number }[] = [];
    for (let k = 0; k < n; k++) blades.push({ x: (r() - 0.5) * t.wide * 0.16, a: (r() - 0.5) * 1.5 * (0.35 + 0.65 * r()), l: t.len * (0.42 + 0.56 * r()), z: r() });
    blades.sort((p, q) => p.z - q.z);
    for (const b of blades) {
      const over = Math.abs(b.a) * 0.55 + (r() - 0.3) * 0.35;
      const ex = b.x + Math.sin(b.a + Math.sign(b.a || 1) * over) * b.l;
      const ey = Math.max(t.len * 0.12, Math.cos(b.a + Math.sign(b.a || 1) * over) * b.l);
      t.curve(b.x, 0, b.x + Math.sin(b.a) * b.l * 0.6, Math.cos(b.a) * b.l * 0.62, clamp(ex, -t.wide * 0.49, t.wide * 0.49), Math.min(t.len * 0.985, ey), t.wide * (0.0045 + 0.0035 * r()), t.wide * 0.0008, 0.2 + 0.3 * b.z + 0.14 * r(), 0, 0.35, 0.22, 9);
    }
    const heads = Math.floor(r() * 4);
    for (let k = 0; k < heads; k++) {
      const x = (r() - 0.5) * t.wide * 0.1;
      const a = (r() - 0.5) * 0.4;
      const l = t.len * (0.8 + 0.18 * r());
      const ex = x + Math.sin(a) * l;
      const ey = Math.cos(a) * l;
      t.curve(x, 0, x + Math.sin(a) * l * 0.5, l * 0.52, ex, ey, t.wide * 0.0028, t.wide * 0.0016, 0.5, 0.35, 0, 0.1, 8);
      // A head of seed at its end: paler, feathery.
      for (let q = 0; q < 16; q++) t.leaf(ex - Math.sin(a) * l * 0.12 * (q / 16), ey - Math.cos(a) * l * 0.12 * (q / 16), a + (q % 2 ? 1 : -1) * (0.45 + 0.3 * r()), t.len * 0.035, t.wide * 0.007, needle, { light: 0.62 + 0.2 * r(), wood: 0.45, fold: 0, rib: 0, vein: 0, shadow: 0.05 });
    }
  },
  'blade-reed': (t, r) => {
    // A few tall strap leaves, upright, and a stem or two with a dark head.
    const n = 13 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const x = (r() - 0.5) * t.wide * 0.22;
      const a = (r() - 0.5) * 0.5;
      const l = t.len * (0.55 + 0.42 * r());
      const over = (r() - 0.35) * 0.5 * Math.sign(a || 1);
      t.curve(x, 0, x + Math.sin(a) * l * 0.6, Math.cos(a) * l * 0.6, clamp(x + Math.sin(a + over) * l, -t.wide * 0.48, t.wide * 0.48), Math.min(t.len * 0.985, Math.cos(a + over) * l), t.wide * 0.02, t.wide * 0.002, 0.24 + 0.4 * r(), 0, 0.4, 0.15, 12);
    }
    for (let k = 0; k < 2; k++) {
      const x = (r() - 0.5) * t.wide * 0.12;
      const top = t.len * (0.8 + 0.15 * r());
      t.stem(x, 0, x + 0.01, top, t.wide * 0.008, t.wide * 0.006, 0.42, 0.3);
      t.stem(x + 0.01, top - t.len * 0.13, x + 0.01, top - t.len * 0.01, t.wide * 0.022, t.wide * 0.02, 0.2, 1);
    }
  },
  'blade-rush': (t, r) => {
    // Thin bare stems, upright and a little spread, forking once or not at all, pale at their tips.
    const n = 46 + Math.floor(r() * 16);
    for (let k = 0; k < n; k++) {
      const x = (r() - 0.5) * t.wide * 0.3;
      const a = (r() - 0.5) * 0.7 * (0.3 + 0.7 * r());
      const l = t.len * (0.5 + 0.48 * r());
      const mx = x + Math.sin(a) * l * 0.6;
      const my = Math.cos(a) * l * 0.6;
      t.stem(x, 0, mx, my, t.wide * 0.0055, t.wide * 0.004, 0.26 + 0.3 * r(), 0.1, 0, 0.12);
      const forks = r() < 0.45 ? 2 : 1;
      for (let q = 0; q < forks; q++) {
        const b = a + (forks === 2 ? (q ? 0.25 : -0.25) : 0) + (r() - 0.5) * 0.15;
        t.stem(mx, my, clamp(mx + Math.sin(b) * l * 0.4, -t.wide * 0.49, t.wide * 0.49), Math.min(t.len * 0.985, my + Math.cos(b) * l * 0.4), t.wide * 0.004, t.wide * 0.0022, 0.42 + 0.3 * r(), 0.15, 0, 0);
      }
    }
  },
  whorl: (t, r) => {
    // A jointed stem, a dark sheath at each joint, and from each a ring of thin branches reaching up and out.
    const joints = 15;
    const lean = (r() - 0.5) * 0.06;
    for (let k = joints - 1; k >= 0; k--) {
      const f = (k + 1) / (joints + 1);
      const x = lean * t.len * f;
      const y = t.len * f * 0.97;
      const reach = (t.wide / 2) * 0.96 * Math.pow(Math.sin(Math.PI * Math.pow(f, 0.85)), 0.7);
      const n = 9;
      for (let q = 0; q < n; q++) {
        // Those towards the eye and away from it are short on the card.
        const turn = Math.cos((Math.PI * (q + 0.5)) / n);
        const l = reach * (0.35 + 0.65 * Math.abs(turn)) * (0.9 + 0.2 * r());
        const a = Math.sign(turn) * (0.75 + 0.25 * r());
        t.curve(x, y, x + Math.sin(a) * l * 0.6, y + Math.cos(a) * l * 0.45, x + Math.sin(a * 0.8) * l, y + Math.cos(a * 0.8) * l * 0.95, 0.0012, 0.0006, 0.3 + 0.36 * r(), 0, 0, 0.1, 5);
      }
    }
    for (let k = 0; k <= joints; k++) {
      const f0 = k / (joints + 1);
      const f1 = (k + 1) / (joints + 1);
      t.stem(lean * t.len * f0, t.len * f0 * 0.97, lean * t.len * f1, t.len * f1 * 0.97, 0.0048 * (1 - 0.7 * f0), 0.0048 * (1 - 0.7 * f1), 0.42, 0.1, 0.2);
      t.stem(lean * t.len * f1, t.len * f1 * 0.97 - 0.006, lean * t.len * f1, t.len * f1 * 0.97, 0.0052 * (1 - 0.7 * f1), 0.0052 * (1 - 0.7 * f1), 0.2, 0.6, 0, 0);
    }
  },
  herb: (t, r) => {
    // A few soft stems from the ground, each with broad leaves alternate along it: a low leafy dome.
    const stems = 10 + Math.floor(r() * 5);
    const order = Array.from({ length: stems }, (_, i) => i).sort(() => r() - 0.5);
    for (const i of order) {
      const a = ((i + 0.5) / stems - 0.5) * 1.9 + (r() - 0.5) * 0.2;
      const l = t.len * (0.55 + 0.4 * r()) * (1 - 0.25 * Math.abs(a));
      const pts: { x: number; y: number; ang: number }[] = [];
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        const bend = a * (0.5 + 0.5 * f);
        pts.push({ x: clamp(Math.sin(bend) * l * f, -t.wide * 0.46, t.wide * 0.46), y: Math.cos(bend) * l * f, ang: bend });
      }
      for (let k = 0; k < 8; k++) t.stem(pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y, 0.006 * (1 - 0.08 * k), 0.006 * (1 - 0.08 * (k + 1)), 0.4, 0.15, 0, 0.15);
      alternate(t, r, pts, 9, t.len * 0.15, 0.55, oval, 0.15, { rib: 0.12, vein: 0.04, shadow: 0.34 });
    }
  },
  moss: (t, r) => {
    // A cushion: tiny leaves on short upright shoots, close together, over a dome.
    const n = 900;
    const shoots: { x: number; y: number; z: number }[] = [];
    for (let k = 0; k < n; k++) {
      const x = (r() - 0.5) * 0.96;
      const top = Math.sqrt(Math.max(0, 1 - x * x * 4)) * 0.9;
      shoots.push({ x: x * t.wide, y: r() * top * t.len, z: r() });
    }
    shoots.sort((p, q) => q.y - p.y);
    for (const s of shoots) {
      const a = (r() - 0.5) * 0.9 + (s.x / t.wide) * 1.2;
      t.leaf(s.x, s.y, a, t.len * (0.05 + 0.04 * r()), t.wide * 0.02, lance, { light: 0.22 + 0.5 * r() + 0.2 * (s.y / t.len), fold: 0.25, rib: 0, vein: 0, shadow: 0.16 });
    }
  },
};

/** A bough: a branch with side branches, clothed in sprays of its kind, as a tree's are seen from a way off. */
function bough(kind: LeafKindName, sprays: Tile[], smalls: ReturnType<Tile['small']>[], r: () => number): Tile {
  const k: LeafKind = LEAF_KINDS[kind];
  const t = new Tile(k.bough[0], k.bough[1]);
  const main = twig(t, r, t.len * 0.8, 0.014, 0.12, 0.26);
  const place = (x: number, y: number, ang: number) => {
    const q = Math.floor(r() * sprays.length);
    t.stamp(sprays[q], smalls[q], x, y, ang, 0.9 + 0.3 * r(), r() < 0.5 ? -1 : 1, (r() - 0.5) * 0.16);
  };
  // Side branches either side, longest about the middle, each with sprays along it and at its end; then the leader's own.
  const sides = 6 + Math.floor(r() * 3);
  const todo: (() => void)[] = [];
  for (let i = 0; i < sides; i++) {
    const f = 0.12 + (0.76 * (i + 0.5 * r())) / sides;
    const p = at(main, f);
    const a = p.ang + (i % 2 ? 1 : -1) * (0.75 + 0.35 * r());
    const l = t.wide * (0.2 + 0.2 * Math.sin(Math.PI * Math.pow(f, 0.7))) * (0.8 + 0.4 * r());
    const ex = p.x + Math.sin(a) * l;
    const ey = p.y + Math.cos(a) * l;
    t.stem(p.x, p.y, ex, ey, 0.007, 0.003, 0.26, 1);
    const n = Math.max(1, Math.round(l / (k.spray[0] * 0.5)));
    for (let q = 0; q < n; q++) {
      const g = (q + 0.6) / (n + 0.6);
      todo.push(() => place(p.x + Math.sin(a) * l * g, p.y + Math.cos(a) * l * g, a + (q % 2 ? 1 : -1) * (0.5 + 0.4 * r())));
    }
    todo.push(() => place(ex - Math.sin(a) * 0.04, ey - Math.cos(a) * 0.04, a + (r() - 0.5) * 0.3));
  }
  for (let q = 0; q < 5; q++) {
    const p = at(main, 0.35 + 0.13 * q);
    todo.push(() => place(p.x, p.y, p.ang + (q % 2 ? 1 : -1) * (0.3 + 0.5 * r())));
  }
  const tip = at(main, 0.97);
  todo.push(() => place(tip.x, tip.y - 0.05, tip.ang + (r() - 0.5) * 0.2));
  // Laid in no order, so that sprays lie over one another either way.
  todo.sort(() => r() - 0.5);
  for (const f of todo) f();
  return t;
}

export interface LeafAtlas {
  width: number;
  height: number;
  layers: number;
  /** each level's texels, the largest first: red how light, green how much is twig, blue how the leaf leans, alpha how much is leaf */
  levels: Uint8Array[];
}

/** One tile's four parts as bytes, its colour spread a little way into the empty texels round its leaves. */
function bytes(t: Tile): Uint8Array {
  const n = W * H;
  const out = new Uint8Array(n * 4);
  const light = Float32Array.from(t.light);
  const wood = Float32Array.from(t.wood);
  const tilt = Float32Array.from(t.tilt);
  const have = new Uint8Array(n);
  for (let k = 0; k < n; k++) have[k] = t.cover[k] > 0.02 ? 1 : 0;
  // Spread outwards, a texel a pass: where a card is drawn larger than its tile, the edge of a leaf is read between a
  // texel of it and an empty one, which must then be of the leaf's own colour.
  for (let pass = 0; pass < 6; pass++) {
    const next = Uint8Array.from(have);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (have[k]) continue;
        let c = 0;
        let l = 0;
        let g = 0;
        let s = 0;
        for (let side = 0; side < 4; side++) {
          const x = i + (side === 0 ? 1 : side === 1 ? -1 : 0);
          const y = j + (side === 2 ? 1 : side === 3 ? -1 : 0);
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const q = y * W + x;
          if (!have[q]) continue;
          c++;
          l += light[q];
          g += wood[q];
          s += tilt[q];
        }
        if (!c) continue;
        light[k] = l / c;
        wood[k] = g / c;
        tilt[k] = s / c;
        next[k] = 1;
      }
    }
    have.set(next);
  }
  for (let k = 0; k < n; k++) {
    out[k * 4] = Math.round(clamp(light[k]) * 255);
    out[k * 4 + 1] = Math.round(clamp(wood[k]) * 255);
    out[k * 4 + 2] = Math.round(clamp(tilt[k] * 0.5 + 0.5) * 255);
    out[k * 4 + 3] = Math.round(clamp(t.cover[k]) * 255);
  }
  return out;
}

/**
 * The smaller levels of a tile, each half the last: its colours weighed by how much of each texel is leaf, and what is
 * leaf scaled so that as much of the tile stays leaf at every level as at the first. A spray far off then keeps its
 * mass, where a plain halving would thin it to nothing.
 */
function shrink(level0: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let covered = 0;
  for (let k = 3; k < level0.length; k += 4) covered += level0[k] >= 128 ? 1 : 0;
  const share = covered / (level0.length / 4);
  let src = level0;
  let w: number = W;
  let h: number = H;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1);
    const nh = Math.max(1, h >> 1);
    const dst = new Uint8Array(nw * nh * 4);
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < nw; i++) {
        let a = 0;
        let c0 = 0;
        let c1 = 0;
        let c2 = 0;
        let n = 0;
        for (let q = 0; q < 2; q++) {
          for (let p = 0; p < 2; p++) {
            const x = Math.min(w - 1, i * 2 + p);
            const y = Math.min(h - 1, j * 2 + q);
            const k = (y * w + x) * 4;
            const al = src[k + 3] + 1;
            a += src[k + 3];
            n += al;
            c0 += src[k] * al;
            c1 += src[k + 1] * al;
            c2 += src[k + 2] * al;
          }
        }
        const k = (j * nw + i) * 4;
        dst[k] = Math.round(c0 / n);
        dst[k + 1] = Math.round(c1 / n);
        dst[k + 2] = Math.round(c2 / n);
        dst[k + 3] = Math.round(a / 4);
      }
    }
    // Scaled so that the same share of it is leaf: found by halving the range the scale lies in.
    if (share > 0 && nw * nh >= 16) {
      let lo = 1;
      let hi = 8;
      for (let it = 0; it < 12; it++) {
        const mid = (lo + hi) / 2;
        let c = 0;
        for (let k = 3; k < dst.length; k += 4) c += dst[k] * mid >= 128 ? 1 : 0;
        if (c / (dst.length / 4) < share) lo = mid;
        else hi = mid;
      }
      for (let k = 3; k < dst.length; k += 4) dst[k] = Math.min(255, Math.round(dst[k] * hi));
    }
    out.push(dst);
    src = dst;
    w = nw;
    h = nh;
  }
  return out;
}

/** The whole atlas, drawn: the same in every browser. */
export function makeLeafAtlas(): LeafAtlas {
  const levels0: Uint8Array[] = new Array(LEAF_TILES);
  LEAF_KIND_NAMES.forEach((kind, ki) => {
    const k: LeafKind = LEAF_KINDS[kind];
    const sprays: Tile[] = [];
    for (let q = 0; q < k.sprays; q++) {
      const t = new Tile(k.spray[0], k.spray[1]);
      SPRAYS[kind](t, random(0x51ed + ki * 977 + q * 131));
      sprays.push(t);
      levels0[sprayTile(kind, q)] = bytes(t);
    }
    if (k.boughs) {
      const smalls = sprays.map((s) => s.small());
      for (let q = 0; q < k.boughs; q++) levels0[boughTile(kind, q)] = bytes(bough(kind, sprays, smalls, random(0xb0a9 + ki * 613 + q * 71)));
    }
  });
  // Level by level, every tile's texels one after another, as an array of textures is filled.
  const chains = levels0.map((l) => [l, ...shrink(l)]);
  const count = chains[0].length;
  const levels: Uint8Array[] = [];
  for (let level = 0; level < count; level++) {
    const size = chains[0][level].length;
    const all = new Uint8Array(size * LEAF_TILES);
    chains.forEach((c, q) => all.set(c[level], q * size));
    levels.push(all);
  }
  return { width: W, height: H, layers: LEAF_TILES, levels };
}
