// What stands in a settlement besides its houses: the pieces of a town's wall, its towers and its gates, the water of
// its canals and its moat (core/dwelling.ts, TownSpec); what stood round a village and in it, a fence, a hedge, a
// palisade, a bank, a ditch, a pen, a well, an oven, a rack, a stack, a threshing floor, a pond, a pole (yard.ts); and,
// of any settlement, the people by its houses and the boats on its water. Each is one small thing drawn many times
// where the settlement generator puts it, as a house is drawn many times over a village. Nothing here is a fact about
// any town: what a wall was made of, how high it stood and how many gates it had come from the claims, and what they
// leave open is drawn plainly, as a type; the people and the boats rest on no claim at all. A piece runs along x, its
// outside facing +y; the frame places it.
import type { EnclosureWord, TownSpec } from '../../../core/dwelling.ts';
import { box, cap, MAT, prism, type Mesh } from '../city/kit.ts';
import type { Poly } from '../city/math.ts';
import type { HouseDetail } from './dwellings.ts';
import { drawPerson } from './figures.ts';
import { reset } from './parts.ts';
import { drawFloor, drawOven, drawPole, drawPond, drawRack, drawStack, drawWell, enclosurePiece, ENCLOSURE_SIZE, penRing } from './yard.ts';

/** What a wall is made of, where a town has one. */
export type WallWord = Exclude<NonNullable<TownSpec['wall']>, 'none'>;

export type WorkKind = 'wall' | 'tower' | 'gate' | 'canal' | 'moat' | 'person' | 'boat' | 'enclosure' | 'pen' | 'well' | 'oven' | 'rack' | 'stack' | 'floor' | 'pond' | 'pole';

/** One kind of piece: a length of wall, a tower, a gate, a length of water, a person, a boat, or something of a yard. Metres. */
export interface WorkSpec {
  kind: WorkKind;
  /** what a wall, a tower or a gate is made of */
  material?: WallWord;
  /** how high a wall stands, a person is, a boat's side rises, or a rack, a stack or a pole stands; nothing for water */
  height: number;
  /** how thick a wall is at its foot, how wide the water is, how long a boat is, or how far across a pen, an oven, a floor or a pond is */
  thickness: number;
  /** how wide a gate's way through is, or a boat's beam */
  opening?: number;
  /** what a length of enclosure or a pen is of, how long one length is, and what a wall of it is drawn as (a material of the kit) */
  word?: Exclude<EnclosureWord, 'none'>;
  run?: number;
  stuff?: number;
}

/** The kinds too small to be made out from far off: drawn only once they are a few pixels tall. */
export const smallWork = (k: WorkKind): boolean => k !== 'wall' && k !== 'tower' && k !== 'gate' && k !== 'canal' && k !== 'moat' && k !== 'floor' && k !== 'pond';

/** How long one piece of wall or of water is: a run that does not divide by it has its pieces overlap a little. */
export const PIECE = 8;

const WALL_MAT: Record<WallWord, number> = { earth: MAT.mud, 'rammed-earth': MAT.mud, timber: MAT.wood, mudbrick: MAT.mud, stone: MAT.granite, brick: MAT.brick };

/** Whether a wall of this kind has towers along it: a bank of earth and a palisade have none. */
export const towered = (w: WallWord): boolean => w !== 'earth' && w !== 'timber';

/** How far out from its wall a tower stands, and how wide it is. */
export const towerSide = (s: WorkSpec): number => Math.max(4.5, s.thickness * 1.5);

/** The top of a piece, for how big it comes out on the screen: water is taken by its width. */
export function workTop(s: WorkSpec): number {
  if (s.kind === 'canal' || s.kind === 'moat' || s.kind === 'floor' || s.kind === 'pond') return Math.max(1.5, s.thickness * 0.5);
  if (s.kind === 'person' || s.kind === 'rack' || s.kind === 'stack' || s.kind === 'pole') return s.height;
  if (s.kind === 'boat') return Math.max(1, s.thickness * 0.3);
  if (s.kind === 'enclosure') return (s.height || ENCLOSURE_SIZE[s.word ?? 'fence'].height) + 0.3;
  if (s.kind === 'pen') return Math.max(2, s.thickness * 0.35);
  if (s.kind === 'well') return 2;
  if (s.kind === 'oven') return Math.max(1, s.thickness * 0.6);
  if (s.kind === 'wall') return s.height + 1;
  return s.height * 1.35 + 1;
}

/** A bank along x: a foot `foot` wide narrowing to a crest `crest` wide, from z0 up to z1. */
function bank(m: Mesh, x0: number, x1: number, foot: number, crest: number, z0: number, z1: number): void {
  const a = foot / 2;
  const b = crest / 2;
  const run = a - b;
  const rise = z1 - z0;
  const l = Math.sqrt(run * run + rise * rise) || 1;
  const ny = rise / l;
  const nz = run / l;
  // The outer slope, then the inner, the crest and the two ends.
  for (const s of [1, -1]) {
    const p = m.v(x0, s * a, z0, 0, s * ny, nz, x0, 0, 0.75);
    const q = m.v(x1, s * a, z0, 0, s * ny, nz, x1, 0, 0.75);
    const r = m.v(x1, s * b, z1, 0, s * ny, nz, x1, l);
    const t = m.v(x0, s * b, z1, 0, s * ny, nz, x0, l);
    m.quad(p, q, r, t);
  }
  const c0 = m.v(x0, -b, z1, 0, 0, 1, x0, -b);
  const c1 = m.v(x1, -b, z1, 0, 0, 1, x1, -b);
  const c2 = m.v(x1, b, z1, 0, 0, 1, x1, b);
  const c3 = m.v(x0, b, z1, 0, 0, 1, x0, b);
  m.quad(c0, c1, c2, c3);
  for (const [x, nx] of [[x0, -1], [x1, 1]] as const) {
    const p = m.v(x, -a, z0, nx, 0, 0, -a, z0, 0.75);
    const q = m.v(x, a, z0, nx, 0, 0, a, z0, 0.75);
    const r = m.v(x, b, z1, nx, 0, 0, b, z1);
    const t = m.v(x, -b, z1, nx, 0, 0, -b, z1);
    m.quad(p, q, r, t);
  }
}

/** Merlons along the outer edge of a wall's top, from x0 to x1: close up, each apart; from further off, one low parapet. */
function parapet(m: Mesh, x0: number, x1: number, y: number, z: number, detail: HouseDetail): void {
  if (detail === 2) return;
  if (detail === 1) {
    box(m, x0, y - 0.45, z, x1, y, z + 0.7, true);
    return;
  }
  for (let x = x0; x + 1.1 <= x1 + 1e-6; x += 1.9) box(m, x, y - 0.45, z, x + 1.1, y, z + 1.1, true);
  box(m, x0, y - 0.45, z, x1, y, z + 0.45, true);
}

/** A square tower standing out from the line of a wall, its top above the wall's. */
function tower(m: Mesh, s: WorkSpec, x: number, detail: HouseDetail): void {
  const side = towerSide(s);
  const h = s.height * 1.35;
  const y0 = -s.thickness / 2;
  const y1 = s.thickness / 2 + side * 0.45;
  box(m, x - side / 2, y0, -1.5, x + side / 2, y1, h, true);
  parapet(m, x - side / 2, x + side / 2, y1, h, detail);
}

/** How many ways one kind of piece is drawn. */
export const WORK_VARIANTS = 8;

/**
 * A piece of a settlement's works, drawn into a mesh at the frame's origin. `variant` is which of its shapes it is.
 * With `walks`, a person's mesh is one the renderer may walk (figures.ts).
 */
export function drawWork(m: Mesh, s: WorkSpec, detail: HouseDetail, variant = 0, walks = false): void {
  reset(m);
  const tint = 118 + (variant & 3) * 6;
  m.tint = tint;
  m.light = 1;
  const half = PIECE / 2;
  if (s.kind === 'person') {
    // Someone by the houses: how they stand and what they wear is the generator's, and no record's.
    drawPerson(m, s.height, variant, detail, (variant * 53 + 40) & 255, 128 + (variant & 3), walks);
    return;
  }
  if (s.kind === 'enclosure') return enclosurePiece(m, s.word ?? 'fence', s.run ?? PIECE, detail, variant, s.stuff ?? MAT.mud, s.height || undefined);
  if (s.kind === 'pen') return penRing(m, s.word ?? 'fence', s.thickness / 2, detail, variant, s.stuff ?? MAT.mud);
  if (s.kind === 'well') return drawWell(m, detail);
  if (s.kind === 'oven') return drawOven(m, detail, s.thickness);
  if (s.kind === 'rack') return drawRack(m, detail, s.thickness, s.height, variant);
  if (s.kind === 'stack') return drawStack(m, detail, s.thickness, s.height);
  if (s.kind === 'floor') return drawFloor(m, detail, s.thickness);
  if (s.kind === 'pond') return drawPond(m, detail, s.thickness);
  if (s.kind === 'pole') return drawPole(m, detail, s.height, s.stuff === MAT.rubble);
  if (s.kind === 'boat') {
    // A plain open hull of wood, pointed at both ends, afloat with its floor under the water's line.
    const l = s.thickness / 2;
    const b = (s.opening ?? s.thickness * 0.18) / 2;
    const hull: Poly = [-l, 0, -l * 0.55, -b, l * 0.55, -b, l, 0, l * 0.55, b, -l * 0.55, b];
    m.mat = MAT.wood;
    prism(m, hull, -0.3, s.height, false);
    if (detail < 2) cap(m, hull, s.height * 0.25);
    return;
  }
  if (s.kind === 'canal' || s.kind === 'moat') {
    // Water lying a little above the ground it is drawn on, between low banks of earth.
    const w = s.thickness / 2;
    m.mat = MAT.mud;
    box(m, -half, -w - 0.5, -1, half, -w, 0.3, true);
    box(m, -half, w, -1, half, w + 0.5, 0.3, true);
    m.mat = MAT.pool;
    box(m, -half, -w, -1, half, w, 0.12, true);
    return;
  }
  const material = s.material ?? 'stone';
  m.mat = WALL_MAT[material];
  const h = s.height;
  const t = s.thickness;
  if (s.kind === 'tower') {
    tower(m, s, 0, detail);
    return;
  }
  if (s.kind === 'gate') {
    const open = (s.opening ?? 4) / 2;
    if (material === 'earth') {
      // A gap through the bank, its ends turned in.
      bank(m, -open - 3, -open, t, Math.min(t * 0.3, 2), -1, h);
      bank(m, open, open + 3, t, Math.min(t * 0.3, 2), -1, h);
      return;
    }
    if (material === 'timber') {
      // Two tall posts and a beam over the way through.
      box(m, -open - 0.5, -0.25, -1, -open, 0.25, h * 1.25, true);
      box(m, open, -0.25, -1, open + 0.5, 0.25, h * 1.25, true);
      box(m, -open - 0.5, -0.2, h * 1.05, open + 0.5, 0.2, h * 1.25, true, true);
      return;
    }
    // Two towers either side of the way through, and the wall carried over it.
    const side = towerSide(s);
    tower(m, s, -open - side / 2, detail);
    tower(m, s, open + side / 2, detail);
    const lintel = Math.min(h * 0.7, 5.5);
    box(m, -open, -t / 2, lintel, open, t / 2, h, true, true);
    parapet(m, -open, open, t / 2, h, detail);
    if (detail === 0) {
      m.mat = MAT.dark;
      box(m, -open, -0.1, -0.5, open, 0.1, lintel, false);
    }
    return;
  }
  // A length of wall.
  if (material === 'earth') {
    bank(m, -half, half, t, Math.min(t * 0.3, 2), -1, h);
    return;
  }
  if (material === 'timber') {
    if (detail === 0) {
      // Posts side by side, each a little taller or shorter than the next.
      const post = 0.32;
      let k = 0;
      for (let x = -half; x < half - 1e-6; x += post, k++) box(m, x, -post / 2, -1, x + post - 0.03, post / 2, h + ((k * 7) % 5) * 0.06, true);
    } else box(m, -half, -0.16, -1, half, 0.16, h, true);
    return;
  }
  if (material === 'rammed-earth') {
    // Battered faces, as a wall of rammed earth is built, with a walk along its top.
    bank(m, -half, half, t, t * 0.62, -1.5, h);
    parapet(m, -half, half, t * 0.31, h, detail === 0 ? 1 : detail);
    return;
  }
  box(m, -half, -t / 2, -1.5, half, t / 2, h, true);
  parapet(m, -half, half, t / 2, h, detail);
}
