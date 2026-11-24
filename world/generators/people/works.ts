// What stands in a settlement besides its houses: the pieces of a town's wall, its towers and its gates, the water of
// its canals and its moat (core/dwelling.ts, TownSpec); what stood round a village and in it, a fence, a hedge, a
// palisade, a bank, a ditch, a pen, a well, an oven, a rack, a stack, a threshing floor, a pond, a pole (yard.ts); and,
// of any settlement, the people by its houses and the boats on its water. Each is one small thing drawn many times
// where the settlement generator puts it, as a house is drawn many times over a village. Nothing here is a fact about
// any town: what a wall was made of, how high it stood and how many gates it had come from the claims, and what they
// leave open is drawn plainly, as a type; the people and the boats rest on no claim at all. A piece runs along x, its
// outside facing +y; the frame places it.
import type { EnclosureWord, TownSpec } from '../../../core/dwelling.ts';
import { box, cap, dome, limb, MAT, prism, type Mesh } from '../city/kit.ts';
import { dcos, dsin, PI, TAU, type Poly } from '../city/math.ts';
import type { HouseDetail } from './dwellings.ts';
import { drawPerson, PERSON_VARIANTS } from './figures.ts';
import { enter, leave, reset, turn } from './parts.ts';
import { drawFloor, drawOven, drawPole, drawPond, drawRack, drawStack, drawWell, enclosurePiece, ENCLOSURE_SIZE, penRing } from './yard.ts';

/** What a wall is made of, where a town has one. */
export type WallWord = Exclude<NonNullable<TownSpec['wall']>, 'none'>;

export type WorkKind =
  | 'wall'
  | 'tower'
  | 'gate'
  | 'canal'
  | 'moat'
  | 'person'
  | 'boat'
  | 'enclosure'
  | 'pen'
  | 'well'
  | 'oven'
  | 'rack'
  | 'stack'
  | 'floor'
  | 'pond'
  | 'pole'
  | 'stook'
  | 'cart'
  | 'barrow'
  | 'plough'
  | 'stall'
  | 'kiln'
  | 'jetty'
  | 'altar';

/** One kind of piece: a length of wall, a tower, a gate, a length of water, a person, a boat, or a living activity work. Metres. */
export interface WorkSpec {
  kind: WorkKind;
  /** what a wall, a tower or a gate is made of */
  material?: WallWord;
  /** how high a wall, person, stall, kiln, altar, rack, stack or pole stands; nothing for flat works */
  height: number;
  /** base thickness, width or span, m */
  thickness: number;
  /** gate opening, boat beam, or secondary span */
  opening?: number;
  /** enclosure or pen word, run length, and kit material override */
  word?: Exclude<EnclosureWord, 'none'>;
  run?: number;
  stuff?: number;
}

/** The kinds too small to be made out from very far off: larger civic/market/kiln/agricultural landmarks remain legible from the air. */
export const smallWork = (k: WorkKind): boolean =>
  k !== 'wall' &&
  k !== 'tower' &&
  k !== 'gate' &&
  k !== 'canal' &&
  k !== 'moat' &&
  k !== 'floor' &&
  k !== 'pond' &&
  k !== 'stall' &&
  k !== 'kiln' &&
  k !== 'jetty' &&
  k !== 'altar' &&
  k !== 'cart' &&
  k !== 'stook' &&
  k !== 'plough';

/** How long one piece of wall or of water is: a run that does not divide by it has its pieces overlap a little. */
export const PIECE = 8;

const WALL_MAT: Record<WallWord, number> = { earth: MAT.mud, 'rammed-earth': MAT.mud, timber: MAT.wood, mudbrick: MAT.mud, stone: MAT.granite, brick: MAT.brick };

/** Whether a wall of this kind has towers along it: a bank of earth and a palisade have none. */
export const towered = (w: WallWord): boolean => w !== 'earth' && w !== 'timber';

/** How far out from its wall a tower stands, and how wide it is. */
export const towerSide = (s: WorkSpec): number => Math.max(4.5, s.thickness * 1.5);

/** The top of a piece, for how big it comes out on the screen: flat/wide works are taken by their span. */
export function workTop(s: WorkSpec): number {
  if (s.kind === 'canal' || s.kind === 'moat' || s.kind === 'floor' || s.kind === 'pond' || s.kind === 'jetty') return Math.max(1.5, s.thickness * 0.5);
  if (s.kind === 'person' || s.kind === 'rack' || s.kind === 'stack' || s.kind === 'pole' || s.kind === 'stook' || s.kind === 'stall' || s.kind === 'kiln' || s.kind === 'altar') return Math.max(1.2, s.height);
  if (s.kind === 'cart' || s.kind === 'barrow' || s.kind === 'plough') return Math.max(1.3, s.height || 1.5);
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

/** How many ways one kind of piece is drawn (matches PERSON_VARIANTS). */
export const WORK_VARIANTS = PERSON_VARIANTS;

/** A wooden spoked wheel standing upright at x along the y-z plane, radius r. */
function drawWheel(m: Mesh, x: number, y: number, r: number, detail: HouseDetail): void {
  const segs = detail === 0 ? 10 : 6;
  const thick = 0.055;
  m.mat = MAT.wood;
  m.tint = 92;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * TAU;
    const a1 = ((i + 1) / segs) * TAU;
    limb(m, x, y + dcos(a0) * r, r + dsin(a0) * r, x, y + dcos(a1) * r, r + dsin(a1) * r, thick, thick, 4);
  }
  if (detail === 0) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      limb(m, x, y, r, x, y + dcos(a) * r, r + dsin(a) * r, 0.025, 0.022, 4);
    }
  }
  limb(m, x - 0.08, y, r, x + 0.08, y, r, 0.075, 0.075, 5);
}

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
    // Someone by the houses or in the fields: how they stand and what they wear is the generator's, and no record's.
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
  if (s.kind === 'stook') {
    // Harvested grain stook: 3 leaning bundled golden sheaves tied near the crown, clearly readable from 240 m.
    const h = Math.max(1.2, s.height || 1.45);
    const r = Math.max(0.55, s.thickness * 0.45);
    const n = detail === 0 ? 7 : 5;
    m.mat = MAT.thatch;
    m.tint = 148 + (variant & 3) * 6;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + (variant & 3) * 0.35;
      const sx = dcos(a) * r * 0.42;
      const sy = dsin(a) * r * 0.42;
      limb(m, sx, sy, -0.05, sx * 0.12, sy * 0.12, h, r * 0.44, r * 0.16, n);
    }
    if (detail < 2) {
      // Straw waist tie and splayed golden seed heads crowning the stook.
      m.mat = MAT.rope;
      m.tint = 112;
      enter(m, 0, 0, h * 0.62, 0, 1);
      turn(m, [[r * 0.36, 0], [r * 0.38, 0.08], [r * 0.35, 0.12]], n);
      leave(m);
    }
    return;
  }
  if (s.kind === 'cart') {
    // Two-wheeled wooden farm/market cart facing +y, laden with sacks or grain sheaves.
    const w = Math.max(1.1, s.opening ?? 1.25);
    const l = Math.max(1.9, s.thickness || 2.2);
    const wr = 0.56;
    drawWheel(m, -w * 0.52, -0.1, wr, detail);
    drawWheel(m, w * 0.52, -0.1, wr, detail);
    m.mat = MAT.wood;
    m.tint = 104;
    // Axle + timber bed + side rails + twin draught shafts extending forward (+y).
    limb(m, -w * 0.58, -0.1, wr, w * 0.58, -0.1, wr, 0.055, 0.055, 5);
    box(m, -w * 0.44, -l * 0.52, wr + 0.04, w * 0.44, l * 0.34, wr + 0.14, true, true);
    for (const side of [-1, 1]) {
      const sx = side * w * 0.42;
      box(m, sx - 0.04, -l * 0.52, wr + 0.14, sx + 0.04, l * 0.34, wr + 0.52, true);
      // Forward draught shafts.
      limb(m, sx * 0.78, l * 0.25, wr + 0.12, sx * 0.62, l * 0.95, wr + 0.32, 0.042, 0.036, 4);
    }
    // Cargo mound inside bed: cloth sacks or bundled harvest straw.
    if ((variant & 1) === 0) {
      m.mat = MAT.matting;
      m.tint = 136;
      box(m, -w * 0.36, -l * 0.44, wr + 0.14, w * 0.36, l * 0.24, wr + 0.72, true);
    } else {
      m.mat = MAT.thatch;
      m.tint = 152;
      dome(m, 0, -l * 0.1, w * 0.46, wr + 0.28, detail === 0 ? 7 : 5, 3, 0, PI / 2);
    }
    // Curved woven canopy hood on every third cart (Han / caravan covered cart!).
    if (variant % 3 === 0 && detail < 2) {
      m.mat = MAT.awning;
      m.tint = 132 + (variant & 3) * 14;
      dome(m, 0, -l * 0.1, w * 0.48, wr + 0.55, 6, 3, 0, PI / 2);
    }
    return;
  }
  if (s.kind === 'barrow') {
    // Traditional single-wheel wooden wheelbarrow (central high wheel with side load frames & rear handles).
    const r = 0.42;
    drawWheel(m, 0, 0.15, r, detail);
    m.mat = MAT.wood;
    m.tint = 102;
    for (const side of [-1, 1]) {
      limb(m, side * 0.24, -0.78, 0.74, side * 0.14, 0.56, r + 0.06, 0.035, 0.03, 4);
      limb(m, side * 0.22, -0.45, 0.55, side * 0.22, -0.45, 0, 0.028, 0.024, 4);
    }
    m.mat = MAT.matting;
    m.tint = 134;
    box(m, -0.34, -0.25, r * 0.65, -0.08, 0.38, r + 0.36, true);
    box(m, 0.08, -0.25, r * 0.65, 0.34, 0.38, r + 0.36, true);
    return;
  }
  if (s.kind === 'plough') {
    // Working wooden ard/plough with curved beam, rear handle, share, and forward ox yoke.
    m.mat = MAT.wood;
    m.tint = 96;
    // Sole & share gliding in the furrow.
    box(m, -0.07, -0.35, -0.04, 0.07, 0.45, 0.12, true);
    // Rising handle stilt at rear.
    limb(m, 0, -0.3, 0.08, 0, -0.82, 0.92, 0.036, 0.03, 4);
    // Long curved draught beam extending forward (+y) to the yoke.
    limb(m, 0, -0.1, 0.12, 0, 1.45, 0.72, 0.045, 0.038, 5);
    // Wooden ox yoke cross-bar.
    limb(m, -0.72, 1.45, 0.76, 0.72, 1.45, 0.76, 0.055, 0.055, 5);
    return;
  }
  if (s.kind === 'stall') {
    // Market stall: 4 timber posts, brightly tinted draped linen awning, wooden counter, pottery jars & baskets.
    const w = Math.max(2.6, s.thickness || 3.4);
    const d = Math.max(1.8, s.opening ?? 2.2);
    const h = Math.max(2.2, s.height || 2.55);
    const hw = w * 0.5;
    const hd = d * 0.5;
    m.mat = MAT.wood;
    m.tint = 96;
    for (const sx of [-hw + 0.1, hw - 0.1]) {
      limb(m, sx, hd - 0.1, -0.2, sx, hd - 0.1, h, 0.065, 0.055, 4);
      limb(m, sx, -hd + 0.1, -0.2, sx, -hd + 0.1, h * 0.84, 0.065, 0.055, 4);
    }
    // Display counter table along the front.
    m.mat = MAT.planks;
    m.tint = 114;
    box(m, -hw + 0.08, 0, 0.65, hw - 0.08, hd - 0.08, 0.82, true, true);
    box(m, -hw + 0.16, 0.08, -0.15, hw - 0.16, hd - 0.16, 0.65, false);
    // Sloped vibrant cloth awning (warm ochre, madder red, indigo, undyed linen by variant).
    m.mat = MAT.awning;
    m.tint = (variant * 47 + 30) & 255;
    const over = 0.25;
    const a = m.v(-hw - over, -hd - over, h * 0.82, 0, -0.25, 0.96, 0, 0, 1);
    const b = m.v(hw + over, -hd - over, h * 0.82, 0, -0.25, 0.96, w, 0, 1);
    const c = m.v(hw + over, hd + over, h + 0.12, 0, -0.25, 0.96, w, d, 1);
    const e = m.v(-hw - over, hd + over, h + 0.12, 0, -0.25, 0.96, 0, d, 1);
    m.quad(a, b, c, e);
    // Hanging front valance flap for crisp market silhouette.
    box(m, -hw - over, hd + over - 0.04, h - 0.22, hw + over, hd + over, h + 0.12, false);
    if (detail < 2) {
      // Pottery jars and woven grain baskets on and beside the stall counter.
      m.mat = MAT.claytile;
      m.tint = 136;
      const jar = [[0.14, 0], [0.22, 0.18], [0.2, 0.34], [0.11, 0.46], [0.14, 0.5]];
      enter(m, -hw * 0.55, hd * 0.45, 0.82, 0, 1);
      turn(m, jar, 6);
      leave(m);
      enter(m, hw * 0.48, -hd * 0.3, 0, 0, 1);
      turn(m, jar.map(([r, z]) => [r * 1.35, z * 1.35]), 6);
      leave(m);
      m.mat = MAT.matting;
      m.tint = 142;
      box(m, 0.05, 0.15, 0.82, 0.65, 0.65, 1.12, true);
    }
    return;
  }
  if (s.kind === 'kiln') {
    // Domed brick/earthen pottery or charcoal kiln with stoking arch, glowing ember hearth, and short flue chimney.
    const r = Math.max(1.2, (s.thickness || 3.2) * 0.5);
    const h = Math.max(1.8, s.height || 2.6);
    m.mat = s.stuff ?? MAT.brick;
    m.tint = 118 + (variant & 3) * 8;
    // Lower skirted cylindrical base + vaulted dome chamber.
    const n = detail === 0 ? 12 : 7;
    enter(m, 0, 0, -0.5, 0, 1);
    turn(m, [[r * 1.08, 0], [r * 1.04, 0.55], [r, 1.2], [r * 0.84, 1.2 + h * 0.35], [r * 0.52, 1.2 + h * 0.62], [r * 0.24, 1.2 + h * 0.72]], n);
    leave(m);
    // Squat chimney flue rising from crown.
    limb(m, 0, 0, h * 0.8, 0, 0, h * 1.15, r * 0.24, r * 0.2, 6);
    // Projecting firebox stoking tunnel facing +y.
    box(m, -0.52, r * 0.72, -0.4, 0.52, r * 1.35, 0.95, true);
    // Dark/warm ember mouth opening inside firebox.
    m.mat = MAT.gilt;
    m.tint = 220;
    box(m, -0.32, r * 1.32, 0.08, 0.32, r * 1.38, 0.62, false);
    if (detail < 2) {
      // Stacked firewood beside the kiln.
      m.mat = MAT.logs;
      m.tint = 98;
      box(m, r * 0.95, -0.65, -0.2, r * 1.55, 0.45, 0.65, true);
    }
    return;
  }
  if (s.kind === 'jetty') {
    // Timber river landing jetty extending along +y over bank/water with pilings & bollards.
    const l = Math.max(4.5, s.thickness || 7.5);
    const w = Math.max(2.0, s.opening ?? 2.6);
    const deckZ = 0.65;
    m.mat = MAT.planks;
    m.tint = 108;
    box(m, -w * 0.5, -l * 0.35, deckZ - 0.14, w * 0.5, l * 0.65, deckZ, true, true);
    m.mat = MAT.logs;
    m.tint = 86;
    const bays = Math.max(2, Math.round(l / 2.4));
    for (let i = 0; i <= bays; i++) {
      const py = -l * 0.32 + (l * 0.94 * i) / bays;
      for (const side of [-1, 1]) {
        const px = side * (w * 0.44);
        limb(m, px, py, -2.2, px, py, i === bays || i === 0 ? deckZ + 0.55 : deckZ, 0.12, 0.11, 5);
      }
    }
    return;
  }
  if (s.kind === 'altar') {
    // Stepped civic/sacred altar terrace (two-tiered stone/earth platform with central shrine stele or offering table).
    const side = Math.max(3.6, s.thickness || 5.4);
    const hs = side * 0.5;
    const h = Math.max(1.2, s.height || 1.6);
    m.mat = s.stuff ?? MAT.granite;
    m.tint = 128;
    // Lower and upper stepped terraces seated into slopes.
    box(m, -hs, -hs, -0.8, hs, hs, h * 0.42, true);
    box(m, -hs * 0.74, -hs * 0.74, h * 0.4, hs * 0.74, hs * 0.74, h * 0.78, true);
    // Front access steps facing +y.
    box(m, -hs * 0.28, hs * 0.72, -0.4, hs * 0.28, hs + 0.45, h * 0.42, true);
    // Central stone offering table / stele monument.
    m.mat = MAT.rubble;
    m.tint = 142;
    box(m, -0.6, -0.35, h * 0.78, 0.6, 0.35, h * 1.18, true);
    if (detail < 2) {
      // Corner ceremonial stone braziers / posts.
      m.mat = MAT.bronze;
      m.tint = 120;
      limb(m, 0, 0, h * 1.18, 0, 0, h * 1.55, 0.24, 0.3, 6);
    }
    return;
  }
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
