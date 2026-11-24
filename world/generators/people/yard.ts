// What stands in a yard and round one: a length of fence, hedge, palisade, bank, ditch or wall; a well, an oven, a
// rack, a stack, a threshing floor, a pond, a pole. Each is one small thing, drawn where the settlement generator or a
// house's own yard (dwellings.ts) puts it. That a household or a settlement had one is its tradition's claim
// (`outbuildings`, `settlement_form`); what one looked like is drawn plainly, as a type, and is no claim about any.
// A length of enclosure runs along x, its outside towards +y; a thing stands at the origin, its front towards +y.
import type { EnclosureWord } from '../../../core/dwelling.ts';
import { box, cap, limb, MAT, type Mesh } from '../city/kit.ts';
import { dcos, dsin, PI, TAU } from '../city/math.ts';
import { enter, leave, post, quad, ring, turn } from './parts.ts';

/** How finely a thing is drawn: 0 up close, 1 at a middle distance, 2 far off. */
type Detail = 0 | 1 | 2;

/** How high each kind of enclosure stands and how thick it is where nothing says, in metres: the generator's look. */
export const ENCLOSURE_SIZE: Record<Exclude<EnclosureWord, 'none'>, { height: number; thickness: number }> = {
  fence: { height: 1.25, thickness: 0.08 },
  hedge: { height: 1.5, thickness: 1.3 },
  palisade: { height: 2.6, thickness: 0.3 },
  bank: { height: 1.3, thickness: 4.5 },
  ditch: { height: 0.35, thickness: 2.2 },
  wall: { height: 1.8, thickness: 0.45 },
};

/**
 * A length of enclosure along x, from −run/2 to run/2, its outside towards +y. `wallMat` is what a wall is built of,
 * the stuff of the houses it stands by.
 */
export function enclosurePiece(m: Mesh, word: Exclude<EnclosureWord, 'none'>, run: number, detail: Detail, variant = 0, wallMat: number = MAT.mud, height?: number): void {
  const half = run / 2;
  const { thickness } = ENCLOSURE_SIZE[word];
  const h = height ?? ENCLOSURE_SIZE[word].height;
  if (word === 'fence') {
    // Hurdles of woven rods between stakes.
    m.mat = MAT.wattle;
    box(m, -half, -0.03, 0.08, half, 0.03, h, true, true);
    if (detail > 0) return;
    m.mat = MAT.wood;
    const keep = m.tint;
    m.tint = 96;
    const n = Math.max(2, Math.round(run / 1.4) + 1);
    for (let i = 0; i < n; i++) post(m, -half + (run * i) / (n - 1), 0, -0.3, h + 0.12 + ((i * 7 + variant) % 3) * 0.05, 0.045);
    m.tint = keep;
    return;
  }
  if (word === 'hedge') {
    // A bank of thorn and brush, cut or growing: lumps of it, no two alike.
    m.mat = MAT.brushwood;
    const lumps = detail === 0 ? Math.max(2, Math.round(run / 1.5)) : Math.max(1, Math.round(run / 3));
    const n = detail === 0 ? 7 : 5;
    for (let i = 0; i < lumps; i++) {
      const x = -half + ((i + 0.5) * run) / lumps;
      const k = ((i * 13 + variant * 7) % 5) / 5;
      const k2 = ((i * 7 + variant * 11) % 7) / 7;
      // Each lump runs into the next, so that the hedge is a band and not a row of bushes; none is as high or as wide
      // as the next.
      const r = (run / lumps) * (0.75 + 0.3 * k2);
      enter(m, x + (k2 - 0.5) * 0.4, (k - 0.5) * 0.5, 0, 0, 1);
      turn(m, [[1, -0.2], [1.05, 0.35], [0.8, 0.75], [0.3, 1]].map(([q, t]) => [q * r, t * h * (0.65 + 0.6 * k)]), n, 1, (thickness / 2 / r) * (0.8 + 0.5 * k2));
      leave(m);
    }
    return;
  }
  if (word === 'palisade') {
    m.mat = MAT.wood;
    if (detail === 0) {
      // Posts side by side, each a little taller or shorter than the next, their tops cut to points.
      const w = 0.3;
      let k = variant;
      for (let x = -half; x < half - 1e-6; x += w, k++) box(m, x, -w / 2, -0.6, x + w - 0.03, w / 2, h + ((k * 7) % 5) * 0.07, true);
    } else box(m, -half, -0.15, -0.6, half, 0.15, h, true);
    return;
  }
  if (word === 'bank' || word === 'ditch') {
    // A bank of earth; a ditch is drawn as the dark of its cut, with what was dug from it banked along its inside.
    const foot = word === 'bank' ? thickness : thickness * 0.5;
    const y0 = word === 'bank' ? -foot / 2 : -foot;
    const crest = Math.min(foot * 0.3, 1.2);
    const c0 = y0 + (foot - crest) / 2;
    m.mat = MAT.earth;
    quad(m, [half, y0 + foot, -0.3], [-half, y0 + foot, -0.3], [-half, c0 + crest, h], [half, c0 + crest, h]);
    quad(m, [-half, y0, -0.3], [half, y0, -0.3], [half, c0, h], [-half, c0, h]);
    quad(m, [-half, c0, h], [half, c0, h], [half, c0 + crest, h], [-half, c0 + crest, h]);
    if (word === 'ditch') {
      const keep = m.light;
      m.light = keep * 0.4;
      m.mat = MAT.mud;
      quad(m, [-half, 0.05, 0.05], [half, 0.05, 0.05], [half, thickness * 0.5, 0.05], [-half, thickness * 0.5, 0.05]);
      m.light = keep;
    }
    return;
  }
  // A wall of the houses' own stuff, with a coping close by.
  m.mat = wallMat;
  box(m, -half, -thickness / 2, -0.4, half, thickness / 2, h, true);
  if (detail === 0) box(m, -half, -thickness / 2 - 0.05, h - 0.12, half, thickness / 2 + 0.05, h + 0.04, true, true);
}

/** A ring of enclosure round the origin, of radius r, with a gap for a way in towards +y: a pen, a fold. */
export function penRing(m: Mesh, word: Exclude<EnclosureWord, 'none'>, r: number, detail: Detail, variant = 0, wallMat: number = MAT.mud): void {
  const want = word === 'hedge' ? 2.4 : word === 'palisade' ? 3 : 2.2;
  const n = Math.max(6, Math.round((TAU * r) / want));
  const run = 2 * r * Math.sin(PI / n) + 0.06;
  const h = word === 'wall' ? 1.3 : word === 'palisade' ? 1.8 : undefined;
  for (let i = 0; i < n; i++) {
    const a = (TAU * (i + 0.5)) / n;
    // The way in, at the front.
    if (Math.abs(a - PI / 2) < PI / n + 0.02) continue;
    const c = dcos(a);
    const s = dsin(a);
    enter(m, c * r * Math.cos(PI / n), s * r * Math.cos(PI / n), 0, c, s);
    enclosurePiece(m, word, run, detail, variant + i, wallMat, h);
    leave(m);
  }
}

/** A well: a ring of stones round its shaft, and close by the posts and the beam its bucket hangs from. */
export function drawWell(m: Mesh, detail: Detail): void {
  const n = detail === 0 ? 12 : 8;
  m.mat = MAT.rubble;
  turn(m, [[0.78, -0.2], [0.78, 0.75]], n);
  turn(m, [[0.78, 0.75], [0.55, 0.75]], n);
  if (detail === 2) return;
  const keep = m.light;
  m.light = keep * 0.5;
  turn(m, [[0.55, 0.1], [0.55, 0.75]], n, 1, 1, 0, TAU, true);
  m.light = keep;
  m.mat = MAT.dark;
  cap(m, ring(0.55, n), 0.12);
  if (detail > 0) return;
  m.mat = MAT.wood;
  const tint = m.tint;
  m.tint = 96;
  post(m, -0.95, 0, -0.3, 1.9, 0.06);
  post(m, 0.95, 0, -0.3, 1.9, 0.06);
  limb(m, -1.1, 0, 1.85, 1.1, 0, 1.85, 0.05, 0.05, 5);
  m.mat = MAT.rope;
  limb(m, 0.1, 0, 1.85, 0.1, 0, 0.9, 0.012, 0.012, 3);
  m.tint = tint;
}

/** An oven or a kiln of clay: a dome with a mouth at its front, the clay above the mouth blackened. */
export function drawOven(m: Mesh, detail: Detail, across: number): void {
  const r = across / 2;
  const n = detail === 0 ? 12 : 7;
  m.mat = MAT.mud;
  turn(m, [[1.04, -0.2], [1, 0.3], [0.82, 0.68], [0.45, 0.94], [0.04, 1]].map(([q, t]) => [q * r, t * r * 1.05]), n);
  if (detail === 2) return;
  m.mat = MAT.dark;
  const half = r * 0.3;
  const h = r * 0.46;
  enter(m, 0, r * 0.99, 0, 0, 1);
  box(m, -half, -0.12, 0, half, 0.03, h, true);
  if (detail === 0) box(m, -half * 0.8, -0.1, h, half * 0.8, 0.02, h + r * 0.22, true);
  leave(m);
}

/** A rack or a scaffold: posts, the poles across them, and what hangs drying from the poles. */
export function drawRack(m: Mesh, detail: Detail, wide: number, high: number, variant = 0): void {
  m.mat = MAT.wood;
  const tint = m.tint;
  m.tint = 100;
  const hx = wide / 2;
  const hy = 0.45;
  for (const [x, y] of [[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]] as const) post(m, x, y, -0.3, high + 0.15, 0.05);
  if (detail < 2) {
    for (const y of [-hy, 0, hy]) limb(m, -hx - 0.2, y, high, hx + 0.2, y, high, 0.03, 0.03, 4);
    if (detail === 0) {
      limb(m, -hx, -hy, high * 0.55, -hx, hy, high * 0.55, 0.025, 0.025, 3);
      limb(m, hx, -hy, high * 0.55, hx, hy, high * 0.55, 0.025, 0.025, 3);
      // What dries on it: strips, each hung over a pole.
      m.mat = MAT.tanned;
      const n = Math.max(3, Math.round(wide / 0.4));
      for (let i = 0; i < n; i++) {
        if ((i * 5 + variant) % 4 === 0) continue;
        const x = -hx + ((i + 0.5) * wide) / n;
        const y = [-hy, 0, hy][(i + variant) % 3];
        const drop = 0.35 + (((i * 7 + variant) % 5) / 5) * 0.4;
        quad(m, [x - 0.07, y + 0.02, high - drop], [x + 0.07, y + 0.02, high - drop], [x + 0.07, y + 0.02, high], [x - 0.07, y + 0.02, high]);
        quad(m, [x + 0.07, y - 0.02, high - drop], [x - 0.07, y - 0.02, high - drop], [x - 0.07, y - 0.02, high], [x + 0.07, y - 0.02, high]);
      }
    }
  }
  m.tint = tint;
}

/** A stack or a rick: straw or hay heaped round a pole and combed down. */
export function drawStack(m: Mesh, detail: Detail, across: number, high: number): void {
  const r = across / 2;
  const n = detail === 0 ? 12 : 7;
  m.mat = MAT.thatch;
  turn(m, [[0.86, -0.1], [1, 0.3], [0.96, 0.52], [0.5, 0.86], [0.05, 1]].map(([q, t]) => [q * r, t * high]), n);
  if (detail === 0) {
    m.mat = MAT.wood;
    limb(m, 0, 0, high - 0.1, 0, 0, high + 0.45, 0.04, 0.03, 4);
  }
}

/** A floor for threshing: earth beaten hard and swept, a little above the ground round it. */
export function drawFloor(m: Mesh, detail: Detail, across: number): void {
  const n = detail === 0 ? 20 : 10;
  m.mat = MAT.sand;
  cap(m, ring(across / 2, n), 0.05);
}

/** A pond or a tank dug for water: the water, and the earth thrown up round it. */
export function drawPond(m: Mesh, detail: Detail, across: number): void {
  const r = across / 2;
  const n = detail === 0 ? 20 : 10;
  m.mat = MAT.earth;
  turn(m, [[r + 1.4, -0.1], [r + 0.5, 0.3], [r, 0.1]], n, 1, 0.8);
  m.mat = MAT.pool;
  cap(m, ring(r + 0.05, n, 1, 0.8), 0.1);
}

/** A pole: a tall post, carved or painted in bands, with a cross-piece near its top; or a stone set on end. */
export function drawPole(m: Mesh, detail: Detail, high: number, stone = false): void {
  if (stone) {
    m.mat = MAT.rubble;
    turn(m, [[0.42, -0.3], [0.38, high * 0.6], [0.2, high]], detail === 0 ? 7 : 5, 1, 0.6);
    return;
  }
  m.mat = MAT.wood;
  limb(m, 0, 0, -0.5, 0, 0, high, 0.16, 0.1, detail === 0 ? 7 : 4);
  if (detail === 2) return;
  limb(m, -0.7, 0, high * 0.86, 0.7, 0, high * 0.86, 0.07, 0.07, 4);
  if (detail === 0) {
    m.mat = MAT.painted;
    for (const t of [0.3, 0.52, 0.72]) turn(m, [[0.175 - t * 0.06, high * t - 0.12], [0.175 - t * 0.06, high * t + 0.12]], 7);
  }
}
