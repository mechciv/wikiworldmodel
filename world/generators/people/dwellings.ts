// Houses from a dwelling's parameters (core/dwelling.ts), on the city's kit. A house is drawn from every part its
// tradition's claims state: its plan and size, what its walls and roof were made of and how they were finished, its
// floor on the ground, sunk into it or raised on posts, where its door was, its windows, how its smoke left it, a
// porch, a veranda, a byre under its roof. What the claims leave open is drawn plainly, as a type, by the proportions
// below, which are the generator's look and no claim about any house.
//
// No two houses of a tradition are drawn alike: a dwelling is drawn in several shapes (HOUSE_VARIANTS), each with
// sizes of its own within the ranges the claims give, its door and windows a little elsewhere, its door open or shut.
// Which shape a house has is the settlement generator's; that they differ is invented, and the panel says so.
//
// The front of a house faces +y; the frame places it.
import { mid, OUTBUILDING_ROOFED, within, type DwellingSpec, type EnclosureWord, type OutbuildingSpec, type OutbuildingUse, type Span, type Tradition } from '../../../core/dwelling.ts';
import { barrel, box, cap, limb, MAT, prism, wall, type Mesh } from '../city/kit.ts';
import { dcos, dsin, hash2, PI, TAU, type Poly } from '../city/math.ts';
import { enter, leave, post, quad, reset, ring, sheet, tri, turn, type V3 } from './parts.ts';
import { drawFloor, drawOven, drawPole, drawPond, drawRack, drawStack, drawWell, enclosurePiece, penRing } from './yard.ts';

/** How finely a house is drawn: 0 up close, 1 at a middle distance, 2 far off, as a block. */
export type HouseDetail = 0 | 1 | 2;

/** How many shapes one dwelling is drawn in. */
export const HOUSE_VARIANTS = 8;

type Walls = NonNullable<DwellingSpec['walls']>;
type RoofWord = NonNullable<DwellingSpec['roof']>;
type RoofMaterial = NonNullable<DwellingSpec['roof_material']>;

/** What each wall is drawn as, left as built. */
const WALL: Record<Walls, number> = {
  mudbrick: MAT.adobe,
  'fired-brick': MAT.brick,
  stone: MAT.rubble,
  timber: MAT.planks,
  log: MAT.logs,
  plank: MAT.planks,
  'timber-frame': MAT.halftimber,
  wattle: MAT.wattle,
  mat: MAT.matting,
  'wattle-and-daub': MAT.mud,
  'pole-and-thatch': MAT.thatch,
  reed: MAT.reedwork,
  'rammed-earth': MAT.mud,
  cob: MAT.mud,
  hide: MAT.tanned,
  felt: MAT.felt,
  cloth: MAT.haircloth,
  bark: MAT.bark,
  sod: MAT.sod,
  snow: MAT.snow,
  'earth-cut': MAT.mud,
  none: MAT.thatch,
};

/** A roof's covering as it is drawn: how thick it shows at its edge, how far it overhangs, and how steep it is where nothing says. */
interface Skin {
  mat: number;
  thick: number;
  over: number;
  /** degrees from the level */
  pitch: number;
  ridge: 'roll' | 'tiles' | 'none';
}

const SKIN: Record<RoofMaterial, Skin> = {
  thatch: { mat: MAT.thatch, thick: 0.32, over: 0.6, pitch: 45, ridge: 'roll' },
  leaves: { mat: MAT.leafthatch, thick: 0.2, over: 0.6, pitch: 42, ridge: 'roll' },
  brush: { mat: MAT.brushwood, thick: 0.3, over: 0.4, pitch: 40, ridge: 'none' },
  reed: { mat: MAT.reedwork, thick: 0.22, over: 0.5, pitch: 45, ridge: 'roll' },
  mat: { mat: MAT.matting, thick: 0.05, over: 0.3, pitch: 35, ridge: 'none' },
  tile: { mat: MAT.claytile, thick: 0.1, over: 0.5, pitch: 27, ridge: 'tiles' },
  timber: { mat: MAT.shingle, thick: 0.07, over: 0.45, pitch: 38, ridge: 'none' },
  bark: { mat: MAT.bark, thick: 0.05, over: 0.3, pitch: 35, ridge: 'none' },
  earth: { mat: MAT.earthroof, thick: 0.3, over: 0.2, pitch: 16, ridge: 'none' },
  turf: { mat: MAT.sod, thick: 0.35, over: 0.25, pitch: 30, ridge: 'none' },
  stone: { mat: MAT.rubble, thick: 0.14, over: 0.25, pitch: 35, ridge: 'none' },
  hide: { mat: MAT.tanned, thick: 0, over: 0, pitch: 58, ridge: 'none' },
  felt: { mat: MAT.felt, thick: 0, over: 0.04, pitch: 30, ridge: 'none' },
  cloth: { mat: MAT.haircloth, thick: 0, over: 0, pitch: 22, ridge: 'none' },
  snow: { mat: MAT.snow, thick: 0.3, over: 0, pitch: 45, ridge: 'none' },
};

/** Walls that are a covering on a frame, and have no door of boards in a frame of timber. */
const SOFT = new Set<number>([MAT.thatch, MAT.matting, MAT.reedwork, MAT.tanned, MAT.felt, MAT.haircloth, MAT.bark, MAT.wattle, MAT.snow, MAT.leafthatch, MAT.brushwood]);

// ——— What a house is, before it is drawn ———

/** A house's footprint as it stands, across its front and from front to back, its height to the eaves and the top, and whether it is round. */
export interface HouseDims {
  w: number;
  l: number;
  eaves: number;
  top: number;
  round: boolean;
}

interface Body {
  d: DwellingSpec;
  detail: HouseDetail;
  /** a number in [0, 1) that is this shape's own, by what it is for */
  u: (k: number) => number;
  round: boolean;
  /** half its width across the ridge and half its length along it; of a round house, half across its front and half from front to back */
  hw: number;
  hl: number;
  /** how high its floor stands above the ground, and how far below it where it is sunken */
  base: number;
  sink: number;
  /** one storey, how many, and so the eaves; then the roof's rise to its top */
  wallH: number;
  storeys: number;
  eaves: number;
  rise: number;
  top: number;
  roof: RoofWord;
  skin: Skin;
  wallMat: number;
  entrance: NonNullable<DwellingSpec['entrance']>;
  /** whether its body is turned so that a long side is its front */
  turned: boolean;
  /** a roof on posts, with no walls under it; and a round hut whose wall and roof are one */
  open: boolean;
  hive: boolean;
  /** how much wider and longer than one house it is drawn, where it stands for several households */
  grow: number;
  tint: number;
}

const tentLike = (d: DwellingSpec) => d.walls === 'felt' || d.walls === 'hide' || d.walls === 'cloth';
const isRound = (d: DwellingSpec) => d.plan === 'round' || d.plan === 'oval' || d.plan === 'polygonal' || d.plan === 'semicircular' || d.plan === 'figure-of-eight';

function wallMaterial(d: DwellingSpec): number {
  // A frame of timber shows through whatever its panels are finished with.
  if (d.walls === 'timber-frame' && d.finish !== 'painted') return MAT.halftimber;
  if (d.finish === 'lime') return MAT.limewash;
  if (d.finish === 'painted') return MAT.painted;
  if (d.finish === 'mud' && d.walls !== 'mudbrick') return MAT.mud;
  return WALL[d.walls ?? 'wattle-and-daub'];
}

/** A dwelling as one of its shapes: its sizes within the ranges its claims give, and the generator's where they give none. */
function bodyOf(d: DwellingSpec, variant: number, grow: number, detail: HouseDetail): Body {
  const u = (k: number) => hash2(variant, k, 0x5d1f);
  // A stated range is drawn from; a size nobody states varies a little round the generator's.
  const size = (s: Span | undefined, or: number, k: number) => (s === undefined ? or * (0.92 + 0.16 * u(k)) : within(s, or, u(k)));
  const plan = d.plan ?? 'rectangular';
  const round = isRound(d);
  const tent = tentLike(d);
  const courted = plan === 'courtyard' || !!d.court;
  let hw: number;
  let hl: number;
  if (round) {
    const across = size(d.diameter ?? (plan === 'oval' ? d.width : undefined), plan === 'oval' && d.length !== undefined ? mid(d.length, 7) / 1.4 : 5, 1);
    // An oval house stands with its long side to the front.
    hw = (plan === 'oval' ? size(d.length, across * 1.4, 2) : across) / 2;
    hl = across / 2;
  } else {
    const w0 = size(d.width, plan === 'long' ? 6 : courted ? 12 : plan === 'room-block' ? 9 : d.walls === 'earth-cut' ? 3.4 : 5, 1);
    const l0 = d.length === undefined && (plan === 'square' || courted || plan === 'room-block') ? w0 : size(d.length, plan === 'long' ? Math.max(w0 * 4, 20) : w0 * 1.6, 2);
    // The ridge runs along the longer way.
    hw = Math.min(w0, l0) / 2;
    hl = Math.max(w0, l0) / 2;
  }
  hw *= grow;
  hl *= grow;
  const storeys = Math.max(1, Math.round(size(d.storeys, 1, 3)));
  const floor = d.floor ?? 'ground';
  const base = floor === 'stilts' ? size(d.floor_height, 1.6, 5) : floor === 'platform' ? size(d.floor_height, 1, 5) : floor === 'raised' ? size(d.floor_height, 0.4, 5) : 0;
  const sink = floor === 'sunken' ? size(d.floor_height, 0.8, 5) : 0;
  const roof: RoofWord = d.roof ?? (round ? (d.roof_material === 'earth' || d.walls === 'snow' || d.walls === 'sod' ? 'dome' : tent && d.walls !== 'hide' ? 'dome' : d.walls === 'hide' ? 'tent' : 'conical') : d.roof_material === 'earth' ? 'flat' : tent ? 'tent' : 'gable');
  const skin = SKIN[d.roof_material ?? (roof === 'flat' ? 'earth' : d.walls === 'felt' ? 'felt' : d.walls === 'hide' ? 'hide' : d.walls === 'cloth' ? 'cloth' : d.walls === 'snow' ? 'snow' : d.walls === 'sod' ? 'turf' : 'thatch')];
  const half = round ? Math.min(hw, hl) : hw;
  const steep = Math.tan((size(d.pitch, skin.pitch, 6) * PI) / 180);
  // Its whole height, where a claim gives it: its walls are then no more than that leaves under its roof.
  const whole = d.height !== undefined ? size(d.height, 3, 7) : undefined;
  // A roof with no walls under it stands on posts where a claim gives the posts' height; and a round hut of poles and
  // thatch, of snow, or a dome of turf, mats or bark with no wall of its own height stated, is all one from the ground up.
  const open = d.walls === 'none' && d.wall_height !== undefined;
  const hive = round && d.wall_height === undefined && (d.walls === 'pole-and-thatch' || d.walls === 'snow' || (roof === 'dome' && (d.walls === 'sod' || d.walls === 'reed' || d.walls === 'mat' || d.walls === 'bark' || d.walls === 'wattle')));
  let wallH: number;
  if ((d.walls === 'none' && !open) || hive) wallH = 0;
  else if (d.wall_height !== undefined) wallH = size(d.wall_height, 2.3, 4);
  // A floor dug down brings its eaves near the ground.
  else if (floor === 'sunken') wallH = (sink + 0.45 * (0.9 + 0.2 * u(4))) / storeys;
  else {
    wallH = (tent ? 1.5 : 2.3) * (0.92 + 0.16 * u(4));
    if (whole !== undefined) wallH = Math.min(wallH, Math.max(0.3, roof === 'flat' ? whole - 0.3 : whole * 0.6) / storeys);
  }
  const eaves = Math.max(base + (wallH === 0 ? 0.15 : 0.3), base + wallH * storeys - sink);
  let rise: number;
  if (roof === 'flat') rise = 0.3;
  else if (whole !== undefined) rise = whole + base - sink - eaves;
  else if (d.pitch !== undefined) rise = steep * (roof === 'shed' ? half * 2 : half);
  else if (roof === 'dome') rise = half * (round ? 0.9 : 0.8);
  else if (roof === 'vault') rise = half * 0.95;
  else if (roof === 'shed') rise = half * 2 * Math.tan((14 * PI) / 180);
  else rise = steep * half;
  rise = Math.max(roof === 'flat' ? 0.3 : 0.35, rise);
  // The eaves of a steep roof come no lower than a person can walk under.
  const slope = rise / (roof === 'shed' ? half * 2 : half);
  const over = d.walls === 'none' || wallH * storeys < 1.9 ? skin.over : Math.min(skin.over, Math.max(0.2, (eaves - base - 1.6) / Math.max(0.05, slope)));
  const entrance = d.entrance ?? (round || plan === 'long' || plan === 'apsidal' || roof === 'vault' || d.walls === 'none' ? 'end' : 'side');
  const turned = !round && !courted && plan !== 'room-block' && plan !== 'l-shaped' && d.walls !== 'earth-cut' && entrance === 'side';
  // A block of rooms steps up towards its back, a storey to a row, to three at most (drawBlock).
  const cells = Math.max(2, Math.round(within(d.rooms, 6, u(8))));
  const tiers = plan === 'room-block' ? Math.min(3, Math.ceil(cells / Math.ceil(Math.sqrt(cells)))) : 1;
  const top = plan === 'room-block' ? base + wallH * tiers + 0.3 : eaves + rise + (roof === 'flat' ? 0 : skin.thick);
  return { d, detail, u, round, hw, hl, base, sink, wallH, storeys, eaves, rise, top, roof, skin: { ...skin, over }, wallMat: wallMaterial(d), entrance, turned, open, hive, grow, tint: 112 + ((variant * 13) & 31) };
}

const SIZES = ['diameter', 'width', 'length', 'height', 'wall_height'];
/** Walls whose roof, where nothing says, is of their own kind: a tent's covering, snow, turf. */
const ROOFED_AS_WALLED = new Set<string>(['felt', 'hide', 'cloth', 'snow', 'sod', 'earth-cut']);

/**
 * A tradition's house with what it leaves unsaid taken from the generator's own house for its people's way of life and
 * the climate, as far as that fits what the tradition does say. A size is the generator's only where the tradition
 * gives no size at all and its plan is the generator's or unstated: a court is not squeezed into a farmhouse's width.
 * A roof is the generator's only where the tradition says nothing of its roof and is of the same kind of plan, round
 * or cornered: a round house takes no gable. A court is the generator's only where no plan is stated.
 */
export function fillDwelling(own: DwellingSpec, generic: DwellingSpec): DwellingSpec {
  const out = { ...own } as Record<string, unknown>;
  const samePlan = own.plan === undefined || own.plan === generic.plan;
  const sameKind = own.plan === undefined || isRound(own) === isRound(generic);
  const sized = SIZES.some((k) => k in own);
  const cornered = own.width !== undefined || own.length !== undefined;
  for (const [k, v] of Object.entries(generic)) {
    if (k in own || v === undefined) continue;
    if (k === 'plan') {
      // A house whose width or length is given has corners; one whose diameter is given is round.
      if ((cornered && isRound(generic)) || (own.diameter !== undefined && !isRound(generic))) continue;
    } else if (SIZES.includes(k)) {
      if (!samePlan || sized) continue;
    } else if (k === 'court') {
      if (own.plan !== undefined) continue;
    } else if (k === 'roof' || k === 'roof_material') {
      if (own.roof !== undefined || own.roof_material !== undefined || !sameKind || (own.walls !== undefined && ROOFED_AS_WALLED.has(own.walls))) continue;
    }
    out[k] = v;
  }
  return out as DwellingSpec;
}

/**
 * The size of a house of a dwelling, in metres, as the generator draws it: across its front, from front to back, to
 * the eaves and to the top. `variant` is which of its shapes, and `grow` how much wider and longer it is drawn where
 * it stands for several households.
 */
export function houseSize(d: DwellingSpec, variant = 0, grow = 1): HouseDims {
  const b = bodyOf(d, variant, grow, 2);
  if (d.walls === 'earth-cut') {
    const f = caveFront(b);
    return { w: f.width, l: f.depth, eaves: f.height, top: f.height, round: false };
  }
  return { w: 2 * (b.turned ? b.hl : b.hw), l: 2 * (b.turned ? b.hw : b.hl), eaves: Math.max(0.2, b.eaves), top: b.top, round: b.round };
}

// ——— Roofs ———

/** How one end of a ridged roof is: a wall up to `a` of its rise, then a slope back to `b`, then a small gable to the ridge. */
interface RoofEnd {
  a: number;
  b: number;
}

const ENDS: Partial<Record<RoofWord, RoofEnd>> = {
  gable: { a: 1, b: 1 },
  'half-hip': { a: 0.55, b: 1 },
  hip: { a: 0, b: 1 },
  'hip-and-gable': { a: 0, b: 0.5 },
};

interface RidgeOptions {
  /** what the walls under the gables are drawn as, and what a small gable above a slope is */
  gableMat: number;
  gabletMat: number;
  /** whether the roof's own edges are drawn thick, and its ridge capped */
  fine: boolean;
}

/**
 * A ridged roof over a rectangle, its ridge along y: two slopes, and at each end a gable, a slope, or a slope under a
 * small gable (RoofEnd). Drawn thick at its eaves and verges, with a ridge of its covering's own kind.
 */
function ridgeRoof(m: Mesh, hw: number, hl: number, z: number, rise: number, skin: Skin, front: RoofEnd, back: RoofEnd, o: RidgeOptions): void {
  const over = skin.over;
  const og = Math.min(over, 0.35);
  const he = -over / hw;
  const up = Math.hypot(hw, rise);
  // The covering lies on the roof's frame: its top is its thickness above the frame, whose underside the eaves show.
  const t = skin.thick;
  const zAt = (h: number) => z + t + h * rise;
  const under = (h: number) => z + h * rise;
  const xAt = (h: number) => hw * (1 - h);
  // Each end as the roof's edge runs up it: how far up, and how far along the ridge's way.
  const edge = (e: RoofEnd): [number, number][] => {
    const b = Math.max(e.a, Math.min(e.b, e.a + hl / hw));
    const yb = hl - (b - e.a) * hw;
    if (e.a >= 1) return [[he, hl + og], [1, hl + og]];
    if (e.a > 0) return [[he, hl + og], [e.a, hl + og], [b, yb], ...(b < 1 ? [[1, yb] as [number, number]] : [])];
    return [[he, hl + over], [b, hl - b * hw], ...(b < 1 ? [[1, hl - b * hw] as [number, number]] : [])];
  };
  const f = edge(front);
  const k = edge(back);
  // The heights at which either end turns, so that the two slopes are strips between them.
  const hs = [...new Set([...f, ...k].map((p) => p[0]))].sort((p, q) => p - q);
  const yOn = (e: [number, number][], h: number): number => {
    for (let i = 0; i + 1 < e.length; i++) {
      if (h >= e[i][0] - 1e-9 && h <= e[i + 1][0] + 1e-9) {
        const t = e[i + 1][0] - e[i][0] > 1e-9 ? (h - e[i][0]) / (e[i + 1][0] - e[i][0]) : 0;
        return e[i][1] + (e[i + 1][1] - e[i][1]) * t;
      }
    }
    return e[e.length - 1][1];
  };
  m.mat = skin.mat;
  for (const side of [1, -1]) {
    const nx = (side * rise) / up;
    const nz = hw / up;
    for (let i = 0; i + 1 < hs.length; i++) {
      const h0 = hs[i];
      const h1 = hs[i + 1];
      const corners: [number, number][] = [[h0, -yOn(k, h0)], [h0, yOn(f, h0)], [h1, yOn(f, h1)], [h1, -yOn(k, h1)]];
      const ids = corners.map(([h, y]) => m.v(side * xAt(h), y, zAt(h), nx, 0, nz, y, (h - he) * up));
      m.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }
  // The ends: the wall under a gable, the slope of a hip, and a small gable above it.
  for (const [e, pts, dir] of [[front, f, 1], [back, k, -1]] as const) {
    const b = Math.max(e.a, Math.min(e.b, e.a + hl / hw));
    if (e.a > 0) {
      m.mat = o.gableMat;
      const top = Math.min(1, e.a);
      // The wall under a gable goes up to the covering's underside; from far off, where no edge is drawn, to its top.
      const zg = o.fine ? under : zAt;
      const p: V3[] = [[-dir * hw, dir * hl, z], [dir * hw, dir * hl, z], [dir * xAt(top), dir * hl, zg(top)], [-dir * xAt(top), dir * hl, zg(top)]];
      if (top >= 1) tri(m, p[0], p[1], [0, dir * hl, zg(1)]);
      else quad(m, p[0], p[1], p[2], p[3]);
    }
    m.mat = skin.mat;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [h0, y0] = pts[i];
      const [h1, y1] = pts[i + 1];
      if (y1 >= y0 - 1e-6) continue;
      const lo: V3[] = [[-dir * xAt(h0), dir * y0, zAt(h0)], [dir * xAt(h0), dir * y0, zAt(h0)]];
      if (xAt(h1) < 1e-6) tri(m, lo[0], lo[1], [0, dir * y1, zAt(h1)]);
      else quad(m, lo[0], lo[1], [dir * xAt(h1), dir * y1, zAt(h1)], [-dir * xAt(h1), dir * y1, zAt(h1)]);
    }
    if (b < 1 && e.a < 1) {
      m.mat = o.gabletMat;
      const yb = pts[pts.length - 1][1];
      tri(m, [-dir * xAt(b), dir * yb, zAt(b)], [dir * xAt(b), dir * yb, zAt(b)], [0, dir * yb, zAt(1)]);
    }
  }
  if (!o.fine) return;
  // Its thickness, where its edge is seen: at the eaves, with its underside back to the wall, and along a gable's verge.
  const ze = zAt(he);
  const zu = under(he);
  if (t > 0 || over > 0) {
    m.mat = skin.mat;
    const keep = m.light;
    for (const side of [1, -1]) {
      const x = side * (hw + over);
      const y0 = -yOn(k, he);
      const y1 = yOn(f, he);
      if (t > 0) {
        m.light = keep * 0.8;
        if (side > 0) quad(m, [x, y0, zu], [x, y1, zu], [x, y1, ze], [x, y0, ze]);
        else quad(m, [x, y1, zu], [x, y0, zu], [x, y0, ze], [x, y1, ze]);
      }
      m.light = keep * 0.45;
      if (side > 0) quad(m, [hw, y0, z], [hw, y1, z], [x, y1, zu], [x, y0, zu]);
      else quad(m, [-hw, y1, z], [-hw, y0, z], [x, y0, zu], [x, y1, zu]);
    }
    for (const [e, pts, dir] of [[front, f, 1], [back, k, -1]] as const) {
      const y = dir * pts[0][1];
      m.light = keep * 0.8;
      if (e.a > 0) {
        // A verge: the roof's edge up the gable.
        if (!(t > 0)) continue;
        const top = Math.min(1, e.a);
        for (const side of [1, -1]) {
          const lo: V3 = [side * (hw + over), y, ze];
          const hi: V3 = [side * xAt(top), y, zAt(top)];
          if (side * dir > 0) quad(m, [hi[0], y, hi[2] - t], [lo[0], y, lo[2] - t], lo, hi);
          else quad(m, [lo[0], y, lo[2] - t], [hi[0], y, hi[2] - t], hi, lo);
        }
      } else {
        // A hip's own eaves, and their underside.
        if (t > 0) {
          if (dir > 0) quad(m, [hw + over, y, zu], [-hw - over, y, zu], [-hw - over, y, ze], [hw + over, y, ze]);
          else quad(m, [-hw - over, y, zu], [hw + over, y, zu], [hw + over, y, ze], [-hw - over, y, ze]);
        }
        m.light = keep * 0.45;
        if (dir > 0) quad(m, [hw, hl, z], [-hw, hl, z], [-hw - over, y, zu], [hw + over, y, zu]);
        else quad(m, [-hw, -hl, z], [hw, -hl, z], [hw + over, y, zu], [-hw - over, y, zu]);
      }
    }
    m.light = keep;
  }
  // The ridge: a roll of thatch bound along it, or a line of tiles.
  const r0 = -k[k.length - 1][1];
  const r1 = f[f.length - 1][1];
  if (skin.ridge !== 'none' && r1 - r0 > 0.2) {
    m.mat = skin.mat;
    if (skin.ridge === 'roll') limb(m, 0, r0 - 0.1, zAt(1) - 0.02, 0, r1 + 0.1, zAt(1) - 0.02, 0.17, 0.17, 5);
    else box(m, -0.13, r0, zAt(1) - 0.06, 0.13, r1, zAt(1) + 0.1, true);
  }
}

/** A roof whose ridge and eaves curve down towards its ends, as the thatch of Bengal does; with the tops of its walls, which follow it. */
function curvedRoof(m: Mesh, b: Body, z0: number): void {
  const { hw, hl, rise, skin } = b;
  const fine = b.detail < 2;
  const n = b.detail === 0 ? 10 : b.detail === 1 ? 6 : 4;
  const drop = Math.min(1.1, hl * 0.2);
  const sag = (y: number) => -drop * (y / hl) * (y / hl);
  const over = skin.over;
  const up = Math.hypot(hw, rise);
  const ze = (-over / hw) * rise;
  // The long walls, their tops under the curve; then the gables.
  m.mat = b.wallMat;
  for (let i = 0; i < n; i++) {
    const y0 = -hl + (2 * hl * i) / n;
    const y1 = -hl + (2 * hl * (i + 1)) / n;
    quad(m, [hw, y0, z0], [hw, y1, z0], [hw, y1, b.eaves + sag(y1)], [hw, y0, b.eaves + sag(y0)], y0 + hl);
    quad(m, [-hw, y1, z0], [-hw, y0, z0], [-hw, y0, b.eaves + sag(y0)], [-hw, y1, b.eaves + sag(y1)], hl - y1);
  }
  const end = b.eaves + sag(hl);
  for (const dir of [1, -1]) {
    quad(m, [-dir * hw, dir * hl, z0], [dir * hw, dir * hl, z0], [dir * hw, dir * hl, end], [-dir * hw, dir * hl, end]);
    tri(m, [-dir * hw, dir * hl, end], [dir * hw, dir * hl, end], [0, dir * hl, end + rise]);
  }
  m.mat = skin.mat;
  const og = Math.min(over, 0.35);
  for (const side of [1, -1]) {
    const nx = (side * rise) / up;
    const nz = hw / up;
    for (let i = 0; i < n; i++) {
      const y0 = -hl - og + ((2 * hl + 2 * og) * i) / n;
      const y1 = -hl - og + ((2 * hl + 2 * og) * (i + 1)) / n;
      const s0 = sag(Math.max(-hl, Math.min(hl, y0)));
      const s1 = sag(Math.max(-hl, Math.min(hl, y1)));
      const t = skin.thick;
      const a = m.v(side * (hw + over), y0, b.eaves + ze + s0 + t, nx, 0, nz, y0, 0);
      const c = m.v(side * (hw + over), y1, b.eaves + ze + s1 + t, nx, 0, nz, y1, 0);
      const e = m.v(0, y1, b.eaves + rise + s1 + t, nx, 0, nz, y1, up + over);
      const g = m.v(0, y0, b.eaves + rise + s0 + t, nx, 0, nz, y0, up + over);
      m.quad(a, c, e, g);
      if (fine) {
        const x = side * (hw + over);
        const keep = m.light;
        if (t > 0) {
          m.light = keep * 0.8;
          if (side > 0) quad(m, [x, y0, b.eaves + ze + s0], [x, y1, b.eaves + ze + s1], [x, y1, b.eaves + ze + s1 + t], [x, y0, b.eaves + ze + s0 + t]);
          else quad(m, [x, y1, b.eaves + ze + s1], [x, y0, b.eaves + ze + s0], [x, y0, b.eaves + ze + s0 + t], [x, y1, b.eaves + ze + s1 + t]);
        }
        // Its underside, from the wall's top out to the eave.
        m.light = keep * 0.45;
        if (side > 0) quad(m, [hw, y0, b.eaves + s0], [hw, y1, b.eaves + s1], [x, y1, b.eaves + ze + s1], [x, y0, b.eaves + ze + s0]);
        else quad(m, [-hw, y1, b.eaves + s1], [-hw, y0, b.eaves + s0], [x, y0, b.eaves + ze + s0], [x, y1, b.eaves + ze + s1]);
        m.light = keep;
      }
    }
  }
}

/** A roof of one slope, from a high wall at the body's +x down to a low one, with the walls under it. */
function shedRoof(m: Mesh, b: Body, z0: number): void {
  const { hw, hl, rise, skin } = b;
  const lo = b.eaves;
  const hi = b.eaves + rise;
  m.mat = b.wallMat;
  quad(m, [hw, -hl, z0], [hw, hl, z0], [hw, hl, hi], [hw, -hl, hi]);
  quad(m, [-hw, hl, z0], [-hw, -hl, z0], [-hw, -hl, lo], [-hw, hl, lo]);
  quad(m, [hw, hl, z0], [-hw, hl, z0], [-hw, hl, lo], [hw, hl, hi]);
  quad(m, [-hw, -hl, z0], [hw, -hl, z0], [hw, -hl, hi], [-hw, -hl, lo]);
  m.mat = skin.mat;
  const over = skin.over;
  const s = rise / (2 * hw);
  const t = skin.thick;
  const a: V3 = [-hw - over, -hl - over, lo - over * s + t];
  const c: V3 = [-hw - over, hl + over, lo - over * s + t];
  const e: V3 = [hw + over, hl + over, hi + over * s + t];
  const g: V3 = [hw + over, -hl - over, hi + over * s + t];
  quad(m, c, a, g, e);
  if (b.detail < 2 && t > 0) {
    quad(m, [a[0], a[1], a[2] - t], [c[0], c[1], c[2] - t], c, a);
    quad(m, [e[0], e[1], e[2] - t], [g[0], g[1], g[2] - t], g, e);
    quad(m, [c[0], c[1], c[2] - t], [e[0], e[1], e[2] - t], e, c);
    quad(m, [g[0], g[1], g[2] - t], [a[0], a[1], a[2] - t], a, g);
  }
}

/** A flat roof of earth on beams: a slab that stands a little proud, a low parapet, and the ends of its beams close by. */
function flatRoof(m: Mesh, b: Body, hw: number, hl: number, z: number): void {
  const out = b.detail === 2 ? 0 : 0.12;
  m.mat = b.skin.mat;
  box(m, -hw - out, -hl - out, z, hw + out, hl + out, z + 0.26, true);
  if (b.detail === 2) return;
  // A parapet round it, of the walls' own stuff, where the walls are of earth, brick or stone.
  if (!SOFT.has(b.wallMat) && b.wallMat !== MAT.planks && b.wallMat !== MAT.logs && b.wallH >= 1.8) {
    m.mat = b.wallMat;
    const p = 0.22;
    const h = z + 0.26 + 0.32;
    box(m, -hw - out, -hl - out, z + 0.26, hw + out, -hl - out + p, h, true);
    box(m, -hw - out, hl + out - p, z + 0.26, hw + out, hl + out, h, true);
    box(m, -hw - out, -hl - out + p, z + 0.26, -hw - out + p, hl + out - p, h, true);
    box(m, hw + out - p, -hl - out + p, z + 0.26, hw + out, hl + out - p, h, true);
  }
  if (b.detail === 0) {
    // The ends of the roof's beams, through the long walls.
    m.mat = MAT.wood;
    const n = Math.max(2, Math.round((2 * hl) / 0.9));
    for (let i = 0; i < n; i++) {
      const y = -hl + ((i + 0.5) * 2 * hl) / n;
      box(m, hw, y - 0.07, z - 0.2, hw + 0.32, y + 0.07, z - 0.06, true, true);
      box(m, -hw - 0.32, y - 0.07, z - 0.2, -hw, y + 0.07, z - 0.06, true, true);
    }
  }
}

/** A cone or a dome over a round or an oval wall, thick at its eaves. */
function roundRoof(m: Mesh, b: Body, z: number, n: number, over: number): void {
  const { skin } = b;
  const r = Math.min(b.hw, b.hl);
  const sx = b.hw / r;
  const sy = b.hl / r;
  const t = skin.thick;
  const top = z + t + b.rise;
  m.mat = skin.mat;
  const fine = b.detail < 2;
  // The covering's top is its thickness above the frame it lies on, whose underside runs out from the wall's top.
  const zu = z - over * (b.rise / r) * (b.roof === 'dome' ? 0.6 : 1);
  const ze = zu + t;
  if (b.roof === 'flat') {
    m.mat = skin.mat;
    turn(m, [[r + 0.1, z], [r + 0.1, z + 0.26]], n, sx, sy);
    cap(m, ring(r + 0.1, n, sx, sy), z + 0.26);
    return;
  }
  // Where the smoke leaves by a hole, the roof stops short of its top.
  const hole = b.d.smoke === 'hole' ? Math.max(0.22, r * 0.09) : 0;
  let profile: number[][];
  if (b.roof === 'dome') {
    const steps = b.detail === 0 ? 6 : b.detail === 1 ? 4 : 3;
    profile = [];
    for (let i = 0; i <= steps; i++) {
      const a = (PI / 2) * (i / steps);
      profile.push([(r + over) * dcos(a) + hole * dsin(a) * 0.0, ze + (top - ze) * dsin(a)]);
    }
    if (hole) profile[profile.length - 1] = [hole, top - 0.02];
    else profile[profile.length - 1] = [0.04, top];
  } else {
    // A cone: a tent's slopes hollow a little, a thatched one's swell.
    const bow = b.roof === 'tent' ? -0.05 : 0.04;
    profile = [[r + over, ze], [(r + over) * 0.5 + r * bow, ze + (top - ze) * 0.5], [Math.max(hole, 0.05), top - (hole ? 0.05 : 0)]];
  }
  turn(m, profile, n, sx, sy);
  if (hole && fine) {
    m.mat = MAT.dark;
    cap(m, ring(hole, Math.min(n, 8), sx, sy), top - 0.06);
  }
  if (!fine || over <= 0) return;
  m.mat = skin.mat;
  const keep = m.light;
  if (t > 0) {
    m.light = keep * 0.8;
    turn(m, [[r + over, zu], [r + over, ze]], n, sx, sy);
  }
  m.light = keep * 0.45;
  turn(m, [[r, z], [r + over, zu]], n, sx, sy);
  m.light = keep;
}


// ——— Doors and windows ———

/** A way in, in a wall's own frame (x along it, y out of it, z up from the floor): the dark of it, its frame, its door. */
function doorway(m: Mesh, b: Body, x: number, half: number, h: number, k: number, wide = false): void {
  if (b.detail === 2 || h < 0.5) return;
  // The dark of it stands a little proud of the wall, and further from a way off, where two faces so near would flicker.
  const e = b.detail === 0 ? 0.03 : 0.07;
  m.mat = MAT.dark;
  wall(m, x + half, e, x - half, e, 0, h);
  if (b.detail > 0) return;
  const soft = SOFT.has(b.wallMat);
  if (!soft) {
    m.mat = MAT.wood;
    m.tint = 96;
    box(m, x - half - 0.08, 0, 0, x - half, 0.09, h, true);
    box(m, x + half, 0, 0, x + half + 0.08, 0.09, h, true);
    box(m, x - half - 0.18, 0, h, x + half + 0.18, 0.11, h + 0.14, true, true);
  }
  // A door of boards, shut or standing open; a flap of the wall's own stuff where the wall is a covering.
  const state = b.u(k);
  m.mat = soft ? b.wallMat : MAT.planks;
  m.tint = soft ? b.tint : 84;
  if (state < 0.3) wall(m, x + half, e + 0.02, x - half, e + 0.02, 0, h * 0.98);
  else if (state < 0.7) {
    const leaves = wide ? [-1, 1] : [-1];
    for (const side of leaves) {
      const hx = x + side * half;
      const across = wide ? half : 2 * half;
      const ex = hx - side * across * 0.26;
      const ey = e + across * 0.96;
      wall(m, hx, e, ex, ey, 0, h * 0.98);
      wall(m, ex, ey, hx, e, 0, h * 0.98);
    }
  }
  m.tint = b.tint;
}

/** A window in a wall's frame: its dark, and close by its shutters, or a lattice with paper behind it. */
function windowAt(m: Mesh, b: Body, x: number, sill: number, half: number, h: number, large: boolean): void {
  if (b.detail === 2) return;
  const e = b.detail === 0 ? 0.03 : 0.07;
  if (large) {
    m.mat = MAT.limewash;
    m.tint = 40;
    wall(m, x + half, e, x - half, e, sill, sill + h);
    m.tint = b.tint;
    if (b.detail === 0) {
      m.mat = MAT.wood;
      m.tint = 70;
      for (const dx of [-0.5, 0, 0.5]) box(m, x + dx * half - 0.02, e, sill, x + dx * half + 0.02, e + 0.03, sill + h, false);
      for (const dz of [0.33, 0.66]) box(m, x - half, e, sill + dz * h - 0.02, x + half, e + 0.03, sill + dz * h + 0.02, true, true);
      box(m, x - half - 0.05, 0, sill - 0.05, x + half + 0.05, 0.07, sill, true, true);
      box(m, x - half - 0.05, 0, sill + h, x + half + 0.05, 0.07, sill + h + 0.06, true, true);
      m.tint = b.tint;
    }
    return;
  }
  m.mat = MAT.dark;
  wall(m, x + half, e, x - half, e, sill, sill + h);
  if (b.detail > 0 || SOFT.has(b.wallMat)) return;
  m.mat = MAT.wood;
  m.tint = 92;
  box(m, x - half - 0.06, 0, sill - 0.05, x + half + 0.06, 0.08, sill, true, true);
  box(m, x - half - 0.06, 0, sill + h, x + half + 0.06, 0.08, sill + h + 0.06, true, true);
  // A shutter, folded back against the wall.
  if (b.u(40 + Math.round(x * 3)) < 0.6) {
    m.mat = MAT.planks;
    m.tint = 84;
    wall(m, x + half + 0.06 + 2 * half * 0.92, 0.03, x + half + 0.06, 0.03, sill, sill + h);
  }
  m.tint = b.tint;
}

/** How a house's windows are drawn where its claims do not say: `few` is one or none, in the wall its door is in. */
function windowsOf(b: Body): 'none' | 'few' | 'small' | 'large' {
  if (b.d.windows) return b.d.windows;
  if (SOFT.has(b.wallMat) || b.wallH < 1.9) return 'none';
  return b.storeys > 1 ? 'small' : 'few';
}

/** What is in one wall, in the wall's frame: a door, and windows on each storey between the wall's ends. */
function openings(m: Mesh, b: Body, half: number, door: 'door' | 'byre' | 'gate' | undefined, k: number): void {
  if (b.detail === 2) return;
  // One door; or, where the house stands for several, a door to each share of its wall.
  const doors = door ? Math.max(1, Math.round(b.grow)) : 0;
  const part = half / Math.max(1, doors);
  const dw = door === 'byre' ? Math.min(1, part * 0.6) : door === 'gate' ? Math.min(0.8, part * 0.5) : Math.min(0.46, part * 0.5);
  const dh = Math.min(door === 'door' ? 1.85 : 2.15, b.wallH - 0.15);
  const at: number[] = [];
  for (let i = 0; i < doors; i++) {
    const dx = -half + (2 * i + 1) * part + (door !== 'gate' ? (b.u(k + i * 3) - 0.5) * 2 * Math.max(0, part - dw - 0.7) * 0.7 : 0);
    at.push(dx);
    doorway(m, b, dx, dw, dh, k + 1 + i, door !== 'door');
  }
  const kind = windowsOf(b);
  if (kind === 'none' || b.wallH < 1.9) return;
  const large = kind === 'large';
  const ww = large ? 0.45 : 0.2;
  const wh = large ? 0.95 : 0.42;
  const sill = large ? 0.85 : 1.3;
  const gap = large ? 2.2 : 2.7;
  const n = Math.max(0, Math.floor((2 * half - 1) / gap));
  for (let s = 0; s < b.storeys; s++) {
    for (let i = 0; i < n; i++) {
      const x = -half + ((i + 0.5) * 2 * half) / n;
      if (s === 0 && at.some((dx) => Math.abs(x - dx) < dw + ww + 0.35)) continue;
      // Where nothing says, a house of one storey has a window or none, by its door.
      if (kind === 'few' && (!door || b.u(k + 7 + i) > 0.4)) continue;
      windowAt(m, b, x, s * b.wallH + sill, ww, wh, large);
    }
  }
}

/** Draw in the frame of one wall of a body: `front` its +y, `back` its −y, `right` its +x, `left` its −x. */
function onWall(m: Mesh, b: Body, which: 'front' | 'back' | 'right' | 'left', hw: number, hl: number, z: number, draw: (half: number) => void): void {
  if (which === 'front') enter(m, 0, hl, z, 0, 1);
  else if (which === 'back') enter(m, 0, -hl, z, 0, -1);
  else if (which === 'right') enter(m, hw, 0, z, 1, 0);
  else enter(m, -hw, 0, z, -1, 0);
  draw(which === 'front' || which === 'back' ? hw : hl);
  leave(m);
  m.tint = b.tint;
}

// ——— What a house stands on ———

/** Steps up to a floor, in a wall's frame: from the ground before the door to the floor. */
function steps(m: Mesh, x: number, half: number, rise: number, out: number): void {
  const n = Math.max(1, Math.round(rise / 0.22));
  for (let i = 0; i < n; i++) box(m, x - half, out + i * 0.3, -rise - 0.3, x + half, out + (i + 1) * 0.3, -rise + ((n - i) * rise) / (n + 1), true);
}

/** A ladder from the ground to a floor or a roof, in a wall's frame: two poles and their rungs. */
function ladder(m: Mesh, b: Body, x: number, y0: number, z0: number, y1: number, z1: number, more = 0.5): void {
  m.mat = MAT.wood;
  m.tint = 100;
  const l = Math.hypot(y1 - y0, z1 - z0) || 1;
  const ey = y1 + ((y1 - y0) / l) * more;
  const ez = z1 + ((z1 - z0) / l) * more;
  if (b.detail === 1) {
    limb(m, x, y0, z0, x, ey, ez, 0.07, 0.07, 4);
  } else if (b.detail === 0) {
    for (const side of [-1, 1]) limb(m, x + side * 0.22, y0, z0, x + side * 0.22, ey, ez, 0.035, 0.03, 4);
    const n = Math.max(2, Math.round(l / 0.32));
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      limb(m, x - 0.24, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, x + 0.24, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, 0.022, 0.022, 3);
    }
  }
  m.tint = b.tint;
}

/** What a body of corners stands on: a base of earth or stone, a platform, or posts under a deck; or the upcast round a floor dug down. */
function standing(m: Mesh, b: Body, hw: number, hl: number): void {
  const floor = b.d.floor ?? 'ground';
  const stone = b.wallMat === MAT.rubble || b.wallMat === MAT.brick || b.wallMat === MAT.halftimber || b.wallMat === MAT.planks || b.wallMat === MAT.logs || b.wallMat === MAT.limewash;
  if (floor === 'raised' || floor === 'platform') {
    const out = floor === 'platform' ? 1 : 0.35;
    m.mat = floor === 'platform' || stone ? MAT.rubble : MAT.mud;
    box(m, -hw - out, -hl - out, -0.6, hw + out, hl + out, b.base, true);
  } else if (floor === 'stilts') {
    m.mat = MAT.wood;
    m.tint = 104;
    const r = 0.11;
    const nx = b.detail === 2 ? 2 : Math.max(2, Math.round((2 * hw) / 2.8) + 1);
    const ny = b.detail === 2 ? 2 : Math.max(2, Math.round((2 * hl) / 2.8) + 1);
    const keep = m.light;
    m.light = keep * 0.75;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        // From a way off, only the posts round its edge.
        if (b.detail === 1 && i > 0 && i < nx - 1 && j > 0 && j < ny - 1) continue;
        post(m, -hw + r + ((2 * hw - 2 * r) * i) / (nx - 1), -hl + r + ((2 * hl - 2 * r) * j) / (ny - 1), -0.5, b.base, r);
      }
    }
    m.light = keep;
    box(m, -hw - 0.15, -hl - 0.15, b.base - 0.16, hw + 0.15, hl + 0.15, b.base, true, true);
    m.tint = b.tint;
  } else if (floor === 'sunken' && b.detail < 2) {
    // The earth dug out of it, banked against the foot of its walls.
    m.mat = MAT.earth;
    const keep = m.light;
    m.light = keep * 0.9;
    const o = 0.5;
    const h = 0.3;
    quad(m, [hw + o, -hl - o, -0.1], [hw + o, hl + o, -0.1], [hw, hl, h], [hw, -hl, h]);
    quad(m, [-hw - o, hl + o, -0.1], [-hw - o, -hl - o, -0.1], [-hw, -hl, h], [-hw, hl, h]);
    quad(m, [hw + o, hl + o, -0.1], [-hw - o, hl + o, -0.1], [-hw, hl, h], [hw, hl, h]);
    quad(m, [-hw - o, -hl - o, -0.1], [hw + o, -hl - o, -0.1], [hw, -hl, h], [-hw, -hl, h]);
    m.light = keep;
  }
}

/** A hood over a way in through a roof that comes down to the ground, in a wall's frame: its top, its cheeks and the dark under it. */
function hood(m: Mesh, b: Body, half: number, h: number, depth: number, mat: number): void {
  if (b.detail === 2) return;
  m.mat = mat;
  quad(m, [-half, 0, h], [half, 0, h], [half, -depth, h + depth * 0.25], [-half, -depth, h + depth * 0.25]);
  quad(m, [half, 0, -0.2], [half, -depth, -0.2], [half, -depth, h + depth * 0.25], [half, 0, h]);
  quad(m, [-half, -depth, -0.2], [-half, 0, -0.2], [-half, 0, h], [-half, -depth, h + depth * 0.25]);
  m.mat = MAT.dark;
  wall(m, half - 0.06, 0.01, -half + 0.06, 0.01, 0, h - 0.08);
  if (b.detail === 0 && !SOFT.has(mat)) {
    m.mat = MAT.wood;
    m.tint = 96;
    post(m, -half, 0.02, -0.2, h, 0.05);
    post(m, half, 0.02, -0.2, h, 0.05);
    box(m, -half - 0.05, -0.03, h - 0.05, half + 0.05, 0.07, h + 0.05, true, true);
    m.tint = b.tint;
  }
}

/** A low covered passage to a door, in a wall's frame: as a house of snow or of sod is entered. */
function tunnel(m: Mesh, b: Body, length: number): void {
  if (b.detail === 2) return;
  const half = 0.55;
  const h = 0.95;
  m.mat = b.wallMat;
  enter(m, 0, 0, -0.2, 0, 1);
  barrel(m, -half, -0.2, half, length, 0, b.detail === 0 ? 6 : 4, h + 0.2, MAT.dark);
  leave(m);
}

/** A porch before a door, in a wall's frame: two posts and a small roof of the house's own covering. */
function porch(m: Mesh, b: Body, x: number, h: number): void {
  if (b.detail === 2) return;
  const half = 0.85;
  const depth = 1.3;
  m.mat = MAT.wood;
  m.tint = 100;
  post(m, x - half + 0.08, depth, -b.base - 0.3, h + 0.1, 0.07);
  post(m, x + half - 0.08, depth, -b.base - 0.3, h + 0.1, 0.07);
  m.tint = b.tint;
  const skin = { ...b.skin, over: Math.min(b.skin.over, 0.25) };
  enter(m, x, depth / 2, 0, 0, 1);
  ridgeRoof(m, half, depth / 2 + 0.1, h + 0.1, Math.max(0.35, half * Math.min(1, b.rise / Math.max(0.5, b.round ? Math.min(b.hw, b.hl) : b.hw))), skin, { a: 1, b: 1 }, { a: 1, b: 1 }, { gableMat: skin.mat, gabletMat: skin.mat, fine: b.detail === 0 });
  leave(m);
}

/** A veranda along a wall, in the wall's frame: a roof leaning on posts, and its floor where the house is raised. */
function veranda(m: Mesh, b: Body, half: number, top: number): void {
  if (b.detail === 2) return;
  const depth = 1.8;
  const lo = Math.max(1.7, top - depth * 0.42);
  m.mat = b.skin.mat;
  const a: V3 = [half + 0.3, depth + 0.3, lo - 0.12];
  const c: V3 = [-half - 0.3, depth + 0.3, lo - 0.12];
  quad(m, a, c, [-half - 0.3, 0, top], [half + 0.3, 0, top]);
  if (b.skin.thick > 0) quad(m, [a[0], a[1], a[2] - b.skin.thick * 0.7], [c[0], c[1], c[2] - b.skin.thick * 0.7], c, a);
  const keep = m.light;
  m.light = keep * 0.45;
  quad(m, [-half - 0.3, depth + 0.3, lo - 0.14], [half + 0.3, depth + 0.3, lo - 0.14], [half + 0.3, 0, top - 0.02], [-half - 0.3, 0, top - 0.02]);
  m.light = keep;
  m.mat = MAT.wood;
  m.tint = 100;
  const n = Math.max(2, Math.round((2 * half) / 2.3) + 1);
  for (let i = 0; i < n; i++) post(m, -half + (2 * half * i) / (n - 1), depth, -b.base - 0.3, lo, b.detail === 0 ? 0.07 : 0.09);
  if (b.base > 0.2) {
    m.mat = (b.d.floor ?? 'ground') === 'stilts' ? MAT.wood : MAT.mud;
    box(m, -half - 0.2, 0, (b.d.floor ?? 'ground') === 'stilts' ? -0.16 : -b.base - 0.4, half + 0.2, depth + 0.2, 0, true, true);
  }
  m.tint = b.tint;
}

/** A chimney through a roof: a stack of the walls' stuff where they are of brick or stone, of mud otherwise. */
function chimney(m: Mesh, b: Body, x: number, y: number, z0: number, z1: number): void {
  m.mat = b.wallMat === MAT.brick || b.wallMat === MAT.rubble || b.wallMat === MAT.adobe ? b.wallMat : b.wallMat === MAT.halftimber || b.wallMat === MAT.limewash ? MAT.brick : MAT.mud;
  const r = 0.34;
  box(m, x - r, y - r, z0, x + r, y + r, z1, true);
  if (b.detail === 0) {
    box(m, x - r - 0.05, y - r - 0.05, z1 - 0.14, x + r + 0.05, y + r + 0.05, z1 - 0.04, true, true);
    m.mat = MAT.dark;
    box(m, x - r * 0.55, y - r * 0.55, z1 - 0.02, x + r * 0.55, y + r * 0.55, z1 + 0.01, true);
  }
}

// ——— Houses of corners ———

/** How the ends of a roof are, by its word: a plan with a rounded end has a slope over it. */
function endsOf(b: Body): [RoofEnd, RoofEnd] {
  const e = ENDS[b.roof] ?? ENDS.gable!;
  return [e, b.d.plan === 'apsidal' ? { a: 0, b: 1 } : e];
}

/** The roof of a body of corners, over its walls' tops, and what of its walls the roof decides. */
function roofOver(m: Mesh, b: Body, hw: number, hl: number, z0: number): void {
  const fine = b.detail < 2;
  if (b.roof === 'flat') return flatRoof(m, b, hw, hl, b.eaves);
  if (b.roof === 'vault') {
    m.mat = b.skin.mat;
    barrel(m, -hw - 0.08, -hl, hw + 0.08, hl, b.eaves, b.detail === 0 ? 10 : b.detail === 1 ? 6 : 4, b.rise, b.d.walls === 'none' ? b.skin.mat : b.wallMat);
    return;
  }
  if (b.roof === 'dome') {
    m.mat = b.skin.mat;
    const steps = b.detail === 0 ? 5 : 3;
    const n = b.detail === 0 ? 14 : b.detail === 1 ? 10 : 6;
    const profile: number[][] = [];
    for (let i = 0; i <= steps; i++) profile.push([Math.max(0.04, dcos((PI / 2) * (i / steps))), b.eaves + b.rise * dsin((PI / 2) * (i / steps))]);
    turn(m, profile, n, hw * 1.02, hl * 1.02);
    return;
  }
  const [front, back] = endsOf(b);
  // A gable's top is dark where the smoke leaves under the ridge; a small gable over a slope is of boards.
  const gablet = b.d.smoke === 'gable' ? MAT.dark : MAT.planks;
  ridgeRoof(m, hw, hl, b.eaves, b.rise, b.skin, front, back, { gableMat: b.d.walls === 'none' ? b.skin.mat : b.wallMat, gabletMat: gablet, fine });
  if (b.d.smoke === 'gable' && fine && front.a >= 1) {
    // Under the ridge of a plain gable: the opening the smoke leaves by.
    m.mat = MAT.dark;
    for (const dir of [1, -1]) {
      const h = 0.72;
      const y = dir * (hl + 0.02);
      tri(m, [-dir * hw * (1 - h), y, b.eaves + h * b.rise], [dir * hw * (1 - h), y, b.eaves + h * b.rise], [0, y, b.eaves + b.rise - 0.05]);
    }
  }
  void z0;
}

/** A hole in a ridged roof for the smoke, or its chimney. */
function smokeOf(m: Mesh, b: Body, hw: number, hl: number): void {
  if (b.detail === 2) return;
  if (b.d.smoke === 'chimney') {
    const y = (b.u(21) < 0.5 ? -1 : 1) * hl * (b.roof === 'gable' ? 0.82 : 0.4);
    chimney(m, b, 0, y, b.eaves, b.top + 0.75);
    return;
  }
  if (b.d.smoke !== 'hole' || b.roof === 'flat' || b.roof === 'dome' || b.roof === 'vault') {
    if (b.d.smoke === 'hole' && (b.roof === 'flat' || b.roof === 'vault' || b.roof === 'dome')) {
      m.mat = MAT.dark;
      const z = b.roof === 'flat' ? b.eaves + 0.27 : b.top + 0.005;
      const n = Math.max(1, Math.round((2 * hl) / 7));
      for (let i = 0; i < n; i++) {
        const y = -hl + ((i + 0.5) * 2 * hl) / n;
        box(m, -0.3, y - 0.3, z - 0.02, 0.3, y + 0.3, z + 0.01, true);
      }
    }
    return;
  }
  // Along the ridge, one to every few metres: a gap in the covering, dark, on both slopes.
  const n = Math.max(1, Math.round((2 * hl) / 7));
  const up = Math.hypot(hw, b.rise);
  m.mat = MAT.dark;
  for (let i = 0; i < n; i++) {
    const y = -hl + ((i + 0.5) * 2 * hl) / n;
    for (const side of [1, -1]) {
      const d = 0.5 / up;
      const x0 = side * hw * d;
      const z0 = b.eaves + (1 - d) * b.rise + 0.03;
      const lift = 0.04;
      if (side > 0) quad(m, [x0, y - 0.35, z0 + lift], [x0, y + 0.35, z0 + lift], [0, y + 0.35, b.top + lift + 0.03], [0, y - 0.35, b.top + lift + 0.03]);
      else quad(m, [x0, y + 0.35, z0 + lift], [x0, y - 0.35, z0 + lift], [0, y - 0.35, b.top + lift + 0.03], [0, y + 0.35, b.top + lift + 0.03]);
    }
  }
}

/** A house of four walls under one roof: rectangular, square, long, or with a rounded end. */
function drawRect(m: Mesh, b: Body): void {
  const { hw, hl, d } = b;
  const floor = d.floor ?? 'ground';
  if (b.turned) enter(m, 0, 0, 0, -1, 0);
  standing(m, b, hw, hl);
  const z0 = b.base > 0 ? b.base : -0.4;
  m.tint = b.tint;
  // The walls; a roof that comes down to the ground has none, and one that curves or leans draws its own.
  if (b.roof === 'curved') curvedRoof(m, b, z0);
  else if (b.roof === 'shed') shedRoof(m, b, z0);
  else {
    if (b.open) {
      // A roof on posts, open on every side.
      m.mat = MAT.wood;
      m.tint = 100;
      const nx = b.detail === 2 ? 2 : Math.max(2, Math.round((2 * hw) / 2.2) + 1);
      const ny = b.detail === 2 ? 2 : Math.max(2, Math.round((2 * hl) / 2.2) + 1);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) post(m, -hw + 0.1 + ((2 * hw - 0.2) * i) / (nx - 1), -hl + 0.1 + ((2 * hl - 0.2) * j) / (ny - 1), z0, b.eaves, 0.09);
      m.tint = b.tint;
    } else if (d.walls !== 'none' || b.eaves - z0 > 0.5) {
      m.mat = d.walls === 'none' ? b.skin.mat : b.wallMat;
      box(m, -hw, -hl, z0, hw, hl, b.eaves, false);
      if (d.plan === 'apsidal' && b.detail < 2) {
        enter(m, 0, -hl, 0, 0, 1);
        turn(m, [[hw, z0], [hw, b.eaves]], b.detail === 0 ? 10 : 6, 1, 1, PI, TAU);
        leave(m);
      }
    }
    // An upper storey of timber stands out over the one below.
    if (b.storeys > 1 && b.detail < 2 && (b.wallMat === MAT.halftimber || b.wallMat === MAT.planks)) {
      m.mat = MAT.wood;
      m.tint = 92;
      for (let s = 1; s < b.storeys; s++) box(m, -hw - 0.05, -hl - 0.05, b.base + s * b.wallH - 0.1, hw + 0.05, hl + 0.05, b.base + s * b.wallH + 0.06, true, true);
      m.tint = b.tint;
    }
    roofOver(m, b, hw, hl, z0);
  }
  smokeOf(m, b, hw, hl);
  // The floor the doors stand on: the house's own, or the ground where it is dug in.
  const fz = b.base;
  const low = b.wallH * b.storeys - b.sink < 1.3;
  const doorWall = b.turned ? 'right' : 'front';
  const farWall = b.turned ? 'left' : 'back';
  const doorEnd = b.turned ? hw : hl;
  if (b.open) {
    // Open on every side: nothing to come in by.
  } else if (b.entrance === 'roof') {
    // In by the roof: a hatch, and the poles of its ladder standing out of it.
    if (b.detail < 2) {
      m.mat = MAT.dark;
      const z = b.roof === 'flat' ? b.eaves + 0.27 : b.top + 0.01;
      box(m, -0.4, hl * 0.3 - 0.4, z - 0.02, 0.4, hl * 0.3 + 0.4, z + 0.012, true);
      enter(m, 0, hl * 0.3, z, 0, 1);
      ladder(m, b, 0, -0.25, -1.2, 0.15, 0, 1.3);
      leave(m);
    }
  } else if (b.entrance === 'tunnel') {
    onWall(m, b, doorWall, hw, hl, 0, () => tunnel(m, b, 2.6 + 1.2 * b.u(11)));
  } else if ((low || d.walls === 'none') && !b.turned && (b.roof === 'vault' || b.roof === 'gable' || b.roof === 'curved')) {
    // A roof to the ground with an upright end: the way in is through the end.
    onWall(m, b, 'front', hw, hl, b.base, () => doorway(m, b, 0, Math.min(0.45, hw * 0.5), Math.min(1.7, (b.top - b.base) * 0.62), 13));
  } else if (low || d.walls === 'none') {
    // A roof to the ground, or walls too low to walk through: a hood over the way in.
    onWall(m, b, doorWall, hw, hl, 0, () => {
      const h = Math.min(1.45, Math.max(0.6, (b.top - b.base) * 0.5));
      enter(m, 0, 0.5 + h * 0.3, 0, 0, 1);
      hood(m, b, Math.min(0.55, (b.turned ? hl : hw) * 0.4), h, 0.5 + h * 0.3 + doorEnd * 0.35, b.skin.mat);
      leave(m);
    });
  } else {
    onWall(m, b, doorWall, hw, hl, fz, (half) => {
      openings(m, b, half, 'door', 12);
      const dx = (b.u(12) - 0.5) * 2 * Math.max(0, half - 0.46 - 0.7) * 0.7;
      if (floor === 'stilts') ladder(m, b, dx, 0.25 + b.base * 0.55, -b.base, 0.02, 0, 0.6);
      else if (b.base > 0.15 && b.detail < 2) {
        m.mat = floor === 'platform' ? MAT.rubble : MAT.mud;
        steps(m, dx, 0.7, b.base, floor === 'platform' ? 1 : 0.35);
      }
      if (d.porch) porch(m, b, dx, Math.min(1.95, b.wallH - 0.1));
      if (d.veranda) veranda(m, b, half, Math.min(b.wallH - 0.05, 2.6));
    });
    // The other walls: windows, and at the far end the wide door of a byre.
    onWall(m, b, farWall, hw, hl, fz, (half) => openings(m, b, half, undefined, 14));
    const sides: ('front' | 'back' | 'right' | 'left')[] = b.turned ? ['front', 'back'] : ['right', 'left'];
    onWall(m, b, sides[0], hw, hl, fz, (half) => openings(m, b, half, undefined, 16));
    onWall(m, b, sides[1], hw, hl, fz, (half) => openings(m, b, half, d.byre ? 'byre' : undefined, 18));
  }
  if (b.turned) leave(m);
}

/** A house of two ranges meeting at a corner, its yard in the angle between them, before its front. */
function drawEll(m: Mesh, b: Body): void {
  const depth = 2 * b.hw;
  const L = 2 * b.hl;
  const W = Math.max(depth * 1.6, L * 0.72);
  const z0 = b.base > 0 ? b.base : -0.4;
  standing(m, b, W / 2, L / 2);
  m.tint = b.tint;
  // One range along the back, the other down the left: each a house of its own under its own ridge.
  const wings: [number, number, number, number, number, number][] = [
    [0, -L / 2 + depth / 2, 1, 0, depth / 2, W / 2],
    [-W / 2 + depth / 2, 0, 0, 1, depth / 2, L / 2],
  ];
  for (const [x, y, gx, gy, hw, hl] of wings) {
    enter(m, x, y, 0, gx, gy);
    m.mat = b.wallMat;
    box(m, -hw, -hl, z0, hw, hl, b.eaves, false);
    roofOver(m, b, hw, hl, z0);
    leave(m);
  }
  // Doors and windows on the two faces that look into the yard.
  enter(m, depth / 2, -L / 2 + depth, b.base, 0, 1);
  openings(m, b, W / 2 - depth / 2, 'door', 12);
  if (b.d.veranda) veranda(m, b, W / 2 - depth / 2, Math.min(b.wallH - 0.05, 2.6));
  leave(m);
  enter(m, -W / 2 + depth, depth / 2, b.base, 1, 0);
  openings(m, b, L / 2 - depth / 2, 'door', 15);
  leave(m);
  if (b.d.smoke === 'chimney' && b.detail < 2) chimney(m, b, -W / 2 + depth / 2, L / 2 - 0.5, b.eaves, b.top + 0.6);
}

/** Ranges of rooms round an open court, entered by a gate in the front. */
function drawCourt(m: Mesh, b: Body): void {
  const { d } = b;
  const w = 2 * b.hw;
  const l = 2 * b.hl;
  const hw = w / 2;
  const hl = l / 2;
  // Its ranges are as deep as rooms are, and deeper where it stands for several houses: its court keeps its share.
  const depth = Math.max(2.4, Math.min(5 * Math.max(1, b.grow), Math.min(w, l) * 0.28));
  const z0 = b.base > 0 ? b.base : -0.4;
  standing(m, b, hw, hl);
  m.tint = b.tint;
  const outer: Poly = [-hw, -hl, hw, -hl, hw, hl, -hw, hl];
  const inner: Poly = [-hw + depth, -hl + depth, hw - depth, -hl + depth, hw - depth, hl - depth, -hw + depth, hl - depth];
  m.mat = b.wallMat;
  prism(m, outer, z0, b.eaves, false);
  // A court keeps its walls from far off where it is wide enough to see into: it is what tells the house from a slab.
  const open = b.detail < 2 || Math.min(hw, hl) - depth > 1.6;
  if (open) {
    // The walls that look into the court.
    const keep = m.light;
    m.light = keep * 0.8;
    const ix = hw - depth;
    const iy = hl - depth;
    quad(m, [ix, -iy, z0], [-ix, -iy, z0], [-ix, -iy, b.eaves], [ix, -iy, b.eaves]);
    quad(m, [-ix, iy, z0], [ix, iy, z0], [ix, iy, b.eaves], [-ix, iy, b.eaves]);
    quad(m, [ix, iy, z0], [ix, -iy, z0], [ix, -iy, b.eaves], [ix, iy, b.eaves]);
    quad(m, [-ix, -iy, z0], [-ix, iy, z0], [-ix, iy, b.eaves], [-ix, -iy, b.eaves]);
    m.light = keep;
  }
  if (b.roof === 'flat') {
    m.mat = b.skin.mat;
    cap(m, outer, b.eaves + 0.26, open ? [inner] : []);
    prism(m, outer, b.eaves, b.eaves + 0.26, false);
    if (b.detail < 2) {
      m.mat = b.wallMat;
      const p = 0.22;
      const h = b.eaves + 0.58;
      box(m, -hw, -hl, b.eaves + 0.26, hw, -hl + p, h, true);
      box(m, -hw, hl - p, b.eaves + 0.26, hw, hl, h, true);
      box(m, -hw, -hl + p, b.eaves + 0.26, -hw + p, hl - p, h, true);
      box(m, hw - p, -hl + p, b.eaves + 0.26, hw, hl - p, h, true);
    }
  } else {
    // A roof to each range, its ridge along the range.
    const rise = Math.max(0.4, Math.tan((b.skin.pitch * PI) / 180) * (depth / 2));
    const ends: RoofEnd = b.roof === 'hip' || b.roof === 'hip-and-gable' ? { a: 0, b: 1 } : { a: 1, b: 1 };
    const o = { gableMat: b.wallMat, gabletMat: MAT.planks, fine: b.detail < 2 };
    const skin = b.detail === 2 ? { ...b.skin, over: 0.1 } : b.skin;
    for (const [x, y, gx, gy, half] of [[0, hl - depth / 2, 1, 0, hw], [0, -hl + depth / 2, 1, 0, hw], [hw - depth / 2, 0, 0, 1, hl], [-hw + depth / 2, 0, 0, 1, hl]] as const) {
      enter(m, x, y, 0, gx, gy);
      ridgeRoof(m, depth / 2, half, b.eaves, rise, skin, ends, ends, o);
      leave(m);
    }
  }
  if (b.detail === 2) return;
  // The gate in the front, and windows only where its claims say there were: such a house turns its back on the street.
  onWall(m, b, 'front', hw, hl, b.base, (half) => {
    // One gate; or, where it stands for several houses, a gate to each along its front.
    const gates = Math.max(1, Math.round(b.grow));
    for (let i = 0; i < gates; i++) {
      const x = -half + ((i + 0.5) * 2 * half) / gates;
      doorway(m, b, x, Math.min(0.8, (half / gates) * 0.4), Math.min(2.15, b.wallH - 0.15), 13 + i, true);
      if (b.base > 0.15) {
        m.mat = MAT.rubble;
        steps(m, x, 1, b.base, 0.35);
      }
    }
  });
  if (d.windows && d.windows !== 'none') {
    for (const which of ['front', 'back', 'right', 'left'] as const) onWall(m, b, which, hw, hl, b.base, (half) => openings(m, b, half, undefined, 20));
  }
  if (b.detail === 0) {
    // Doors from the court into the ranges.
    for (const [x, y, gx, gy, half] of [[0, hl - depth, 0, -1, hw - depth], [0, -hl + depth, 0, 1, hw - depth], [hw - depth, 0, -1, 0, hl - depth], [-hw + depth, 0, 1, 0, hl - depth]] as const) {
      enter(m, x, y, b.base, gx, gy);
      const n = Math.max(1, Math.round((2 * half) / 4));
      for (let i = 0; i < n; i++) doorway(m, b, -half + ((i + 0.5) * 2 * half) / n, 0.42, Math.min(1.85, b.wallH - 0.15), 24 + i);
      leave(m);
    }
  }
  if (d.smoke === 'chimney') chimney(m, b, hw - depth / 2, -hl + depth / 2, b.eaves, b.eaves + (b.roof === 'flat' ? 1.1 : b.rise + 0.9));
}

/** A ring of rooms round an open court, under one roof that slopes out and in: a house many families share. */
function drawRing(m: Mesh, b: Body): void {
  const R = Math.min(b.hw, b.hl);
  const depth = Math.max(2.6, Math.min(5.5, R * 0.3));
  const n = b.detail === 0 ? 40 : b.detail === 1 ? 24 : 12;
  const z0 = -0.4;
  m.tint = b.tint;
  m.mat = b.wallMat;
  turn(m, [[R, z0], [R, b.eaves]], n);
  if (b.detail < 2) {
    // The galleries that look into the court are of timber.
    m.mat = MAT.planks;
    const keep = m.light;
    m.light = keep * 0.8;
    turn(m, [[R - depth, z0], [R - depth, b.eaves - 0.3]], n, 1, 1, 0, TAU, true);
    m.light = keep;
  }
  const rise = Math.max(0.5, Math.tan((b.skin.pitch * PI) / 180) * (depth / 2));
  const over = b.detail === 2 ? 0.2 : b.skin.over + 0.4;
  const pitch = rise / (depth / 2);
  m.mat = b.skin.mat;
  turn(m, [[R + over, b.eaves - over * pitch], [R - depth / 2, b.eaves + rise]], n);
  turn(m, [[R - depth - over, b.eaves - over * pitch], [R - depth / 2, b.eaves + rise]], n, 1, 1, 0, TAU, true);
  if (b.detail === 2) return;
  if (b.skin.thick > 0) turn(m, [[R + over, b.eaves - over * pitch - b.skin.thick], [R + over, b.eaves - over * pitch]], n);
  // One gate, in the front; and windows only high up, as the claims of such a house say.
  enter(m, 0, R - 0.02, 0, 0, 1);
  doorway(m, b, 0, 0.9, Math.min(2.4, b.wallH - 0.1), 13, true);
  leave(m);
  const kind = windowsOf(b);
  if (kind === 'none') return;
  const around = Math.max(6, Math.round((TAU * R) / 3.2));
  for (let s = Math.max(1, b.storeys - 2); s < b.storeys; s++) {
    for (let i = 0; i < around; i++) {
      const a = (TAU * (i + 0.5)) / around;
      enter(m, dcos(a) * (R - 0.02), dsin(a) * (R - 0.02), 0, dcos(a), dsin(a));
      windowAt(m, b, 0, s * b.wallH + 1.2, 0.22, 0.45, false);
      leave(m);
    }
  }
}

/** Many rooms joined wall to wall and stacked, each row back a storey higher than the one before it. */
function drawBlock(m: Mesh, b: Body): void {
  const w = 2 * b.hw;
  const l = 2 * b.hl;
  const cells = Math.max(2, Math.round(within(b.d.rooms, 6, b.u(8))));
  const across = Math.ceil(Math.sqrt(cells));
  const rows = Math.ceil(cells / across);
  const cw = w / across;
  const cl = l / rows;
  m.tint = b.tint;
  const fine = b.detail === 0;
  for (let c = 0; c < cells; c++) {
    const i = c % across;
    // The first row is at the front, the last at the back and highest.
    const j = Math.floor(c / across);
    const tiers = Math.min(3, 1 + Math.floor((j / Math.max(1, rows - 1)) * Math.min(2, rows - 1) + 0.001));
    const h = b.wallH * tiers;
    const x0 = -w / 2 + i * cw;
    const y1 = l / 2 - j * cl;
    m.mat = b.wallMat;
    box(m, x0, y1 - cl, -0.4, x0 + cw, y1, h, false);
    m.mat = b.skin.mat;
    box(m, x0 - 0.04, y1 - cl - 0.04, h, x0 + cw + 0.04, y1 + 0.04, h + 0.24, true);
    if (b.detail === 2) continue;
    // Its front, where it stands clear of the row before it: a door, or a hatch in its roof with a ladder to it.
    enter(m, x0 + cw / 2, y1, h - b.wallH, 0, 1);
    if (b.entrance === 'roof') {
      if (fine) {
        m.mat = MAT.dark;
        box(m, -0.35, -cl * 0.5 - 0.35, b.wallH + 0.23, 0.35, -cl * 0.5 + 0.35, b.wallH + 0.252, true);
        if ((c + (b.u(9) < 0.5 ? 0 : 1)) % 2 === 0) ladder(m, b, cw * 0.25, 0.9, tiers > 1 ? 0.24 : 0, 0.06, b.wallH + 0.24, 0.8);
      }
    } else {
      doorway(m, b, (b.u(30 + c) - 0.5) * cw * 0.4, 0.36, Math.min(1.5, b.wallH - 0.3), 30 + c);
      if (fine && tiers > 1 && c % 2 === 0) ladder(m, b, cw * 0.3, 0.9, 0.24, 0.06, b.wallH + 0.24, 0.8);
    }
    if (fine) {
      m.mat = MAT.wood;
      m.tint = 100;
      const beams = Math.max(2, Math.round(cw / 0.9));
      for (let q = 0; q < beams; q++) box(m, -cw / 2 + ((q + 0.5) * cw) / beams - 0.06, 0, b.wallH - 0.2, -cw / 2 + ((q + 0.5) * cw) / beams + 0.06, 0.3, b.wallH - 0.07, true, true);
      m.tint = b.tint;
    }
    leave(m);
  }
}

/** A front cut into the ground: rooms dug back into a slope of earth, each behind an arch with its door and its window. */
function caveFront(b: Body): { width: number; depth: number; height: number; rooms: number; bay: number } {
  const rooms = Math.max(1, Math.round(within(b.d.rooms, 3, b.u(8))));
  const bay = Math.max(3.2, 2 * b.hw + 0.6);
  return { width: rooms * bay + 1.6, depth: 2 * b.hl + 3, height: Math.max(3.6, b.wallH + 1.6), rooms, bay };
}

function drawCave(m: Mesh, b: Body): void {
  const f = caveFront(b);
  const hw = f.width / 2;
  const y1 = f.depth / 2;
  const y0 = -f.depth / 2;
  m.tint = b.tint;
  // The cut face, and the ground rising behind it and falling away at its sides.
  m.mat = MAT.mud;
  quad(m, [-hw, y1, -0.4], [hw, y1, -0.4], [hw, y1, f.height], [-hw, y1, f.height]);
  quad(m, [hw, y1, -0.4], [hw, y0, -0.4], [hw, y0, 0.2], [hw, y1, f.height]);
  quad(m, [-hw, y0, -0.4], [-hw, y1, -0.4], [-hw, y1, f.height], [-hw, y0, 0.2]);
  m.mat = MAT.earthroof;
  quad(m, [hw, y1, f.height], [hw, y0, 0.2], [-hw, y0, 0.2], [-hw, y1, f.height]);
  if (b.detail === 2) return;
  const half = Math.min(1.5, f.bay / 2 - 0.35);
  const spring = Math.max(1.5, f.height * 0.42);
  enter(m, 0, y1, 0, 0, 1);
  for (let r = 0; r < f.rooms; r++) {
    const x = -hw + 0.8 + (r + 0.5) * f.bay;
    // The arch: dark from a way off; close by, filled with a screen of lattice and paper, its door at one side.
    const e = 0.03;
    const steps = b.detail === 0 ? 7 : 4;
    m.mat = b.detail === 0 ? MAT.limewash : MAT.dark;
    m.tint = b.detail === 0 ? 48 : b.tint;
    wall(m, x + half, e, x - half, e, 0, spring);
    const c = m.v(x, e, spring, 0, 1, 0, x, spring);
    const base = m.verts;
    for (let i = 0; i <= steps; i++) {
      const a = (PI * i) / steps;
      m.v(x + dcos(a) * half, e, spring + dsin(a) * half, 0, 1, 0, x + dcos(a) * half, spring + dsin(a) * half);
    }
    for (let i = 0; i < steps; i++) m.tri(c, base + i, base + i + 1);
    m.tint = b.tint;
    if (b.detail === 0) {
      const side = b.u(50 + r) < 0.5 ? -1 : 1;
      enter(m, 0, 0.02, 0, 0, 1);
      doorway(m, b, x + side * half * 0.45, 0.4, 1.8, 51 + r);
      m.mat = MAT.wood;
      m.tint = 76;
      for (let q = -2; q <= 2; q++) box(m, x + (q * half) / 3 - 0.02, 0.01, 1.85, x + (q * half) / 3 + 0.02, 0.04, spring + half * 0.86, false);
      box(m, x - half, 0.01, 1.82, x + half, 0.05, 1.9, true, true);
      m.tint = b.tint;
      leave(m);
    }
  }
  leave(m);
  if (b.d.smoke === 'chimney' || b.d.smoke === 'hole') {
    m.mat = MAT.mud;
    for (let r = 0; r < f.rooms; r++) post(m, -hw + 0.8 + (r + 0.5) * f.bay + 0.9, y1 - 2.2, f.height * 0.5, f.height * 0.72 + 0.9, 0.2);
  }
}

// ——— Round houses ———

/** A round or an oval house: a wall and a roof over it, or a roof to the ground. */
function drawRound(m: Mesh, b: Body): void {
  const { d } = b;
  const r = Math.min(b.hw, b.hl);
  const sx = b.hw / r;
  const sy = b.hl / r;
  const n = d.plan === 'polygonal' ? 6 : b.detail === 0 ? 20 : b.detail === 1 ? 12 : 7;
  const floor = d.floor ?? 'ground';
  m.tint = b.tint;
  const walled = b.wallH > 0 && !b.open && b.eaves - b.base > 0.55;
  // What it stands on.
  if (floor === 'raised' || floor === 'platform') {
    const out = floor === 'platform' ? 0.9 : 0.4;
    m.mat = floor === 'platform' || b.wallMat === MAT.rubble ? MAT.rubble : MAT.mud;
    turn(m, [[r + out, -0.5], [r + out, b.base]], n, sx, sy);
    cap(m, ring(r + out, n, sx, sy), b.base);
  } else if (floor === 'stilts') {
    m.mat = MAT.wood;
    m.tint = 104;
    const posts = b.detail === 2 ? 4 : Math.max(6, Math.round((TAU * r) / 2.6));
    for (let i = 0; i < posts; i++) post(m, dcos((TAU * i) / posts) * (r - 0.15) * sx, dsin((TAU * i) / posts) * (r - 0.15) * sy, -0.5, b.base, 0.1);
    turn(m, [[r + 0.15, b.base - 0.16], [r + 0.15, b.base]], n, sx, sy);
    cap(m, ring(r + 0.15, n, sx, sy), b.base);
    m.tint = b.tint;
  } else if (floor === 'sunken' && b.detail < 2) {
    m.mat = MAT.earth;
    turn(m, [[r + 0.55, -0.1], [r - 0.08, 0.32]], n, sx, sy);
  }
  const z0 = b.base > 0 ? b.base : -0.4;
  if (walled) {
    m.mat = b.wallMat;
    turn(m, [[r, z0], [r, b.eaves]], n, sx, sy);
  } else if (b.open) {
    // A roof on posts, open all round.
    m.mat = MAT.wood;
    m.tint = 100;
    const posts = b.detail === 2 ? 6 : Math.max(8, Math.round((TAU * r * ((sx + sy) / 2)) / 1.6));
    for (let i = 0; i < posts; i++) post(m, dcos((TAU * (i + 0.5)) / posts) * (r - 0.12) * sx, dsin((TAU * (i + 0.5)) / posts) * (r - 0.12) * sy, z0, b.eaves, 0.08);
    m.tint = b.tint;
  }
  // The roof: over the wall or the posts, or from the ground where there are neither.
  const over = b.open ? b.skin.over : !walled ? 0 : d.veranda ? 1.5 : b.skin.over;
  const hut = !walled && !b.open && (b.hive || b.roof === 'dome' || d.walls === 'pole-and-thatch' || d.walls === 'none');
  if (hut && b.roof !== 'conical' && b.roof !== 'tent' && b.roof !== 'flat') {
    // A hut that is all roof: a hive of thatch, leaves or mats on bent poles.
    m.mat = d.walls === 'snow' ? MAT.snow : b.skin.mat;
    const h = b.top - b.base;
    const hole = d.smoke === 'hole' ? 0.2 : 0.02;
    turn(m, [[1, 0], [0.98, 0.3], [0.84, 0.62], [0.52, 0.88], [hole / r, 1]].map(([q, t]) => [q * r, b.base + t * h]), n, sx, sy);
    if (b.detail === 0 && (b.skin.mat === MAT.matting || b.skin.mat === MAT.reedwork)) {
      // The ropes that bind its mats.
      m.mat = MAT.rope;
      for (const t of [0.3, 0.62]) turn(m, [[(t < 0.5 ? 0.985 : 0.845) * r + 0.02, b.base + t * h - 0.03], [(t < 0.5 ? 0.98 : 0.83) * r + 0.02, b.base + t * h + 0.03]], n, sx, sy);
    }
  } else {
    const zr = walled || b.open ? b.eaves : b.base;
    roundRoof(m, { ...b, rise: Math.max(0.3, b.top - b.skin.thick - zr) }, zr, n, over);
  }
  if (b.open) return;
  if (d.veranda && walled && b.detail < 2) {
    m.mat = MAT.wood;
    m.tint = 100;
    const posts = Math.max(6, Math.round((TAU * (r + 1.2)) / 2.4));
    for (let i = 0; i < posts; i++) post(m, dcos((TAU * (i + 0.5)) / posts) * (r + 1.25) * sx, dsin((TAU * (i + 0.5)) / posts) * (r + 1.25) * sy, -0.3, b.eaves - 1.4 * (b.rise / r), 0.07);
    m.tint = b.tint;
  }
  if (d.smoke === 'chimney' && b.detail < 2) chimney(m, b, 0, -r * sy * 0.5, b.eaves, b.top + 0.3);
  // The way in, at the front.
  if (b.entrance === 'roof') {
    if (b.detail < 2) {
      enter(m, 0, 0, b.top, 0, 1);
      m.mat = MAT.dark;
      box(m, -0.38, -0.38, -0.12, 0.38, 0.38, 0.02, true);
      ladder(m, b, 0, -0.25, -1.3, 0.12, 0, 1.2);
      leave(m);
    }
    return;
  }
  const front = r * sy;
  if (b.entrance === 'tunnel') {
    enter(m, 0, front - 0.25, 0, 0, 1);
    tunnel(m, b, 2.4 + 1.6 * b.u(11));
    leave(m);
    if (d.walls === 'snow' && b.detail === 0) {
      // A pane of ice over the way in.
      m.mat = MAT.pool;
      enter(m, 0, front * 0.86, b.base + (b.top - b.base) * 0.5, 0, 1);
      wall(m, 0.3, 0.02, -0.3, 0.02, 0, 0.4);
      leave(m);
    }
    return;
  }
  if (!walled || b.eaves - b.base < 1.3) {
    const h = Math.min(1.35, Math.max(0.55, (b.top - b.base) * 0.5));
    enter(m, 0, front + 0.1 + h * 0.12, 0, 0, 1);
    hood(m, b, Math.min(0.5, r * 0.4), h, 0.1 + h * 0.12 + r * sy * 0.42, !walled ? (d.walls === 'snow' ? MAT.snow : b.skin.mat) : b.wallMat);
    leave(m);
    return;
  }
  enter(m, 0, front - 0.02, b.base, 0, 1);
  doorway(m, b, 0, Math.min(0.46, r * 0.3), Math.min(1.8, b.eaves - b.base - 0.12), 13);
  if (floor === 'stilts') ladder(m, b, 0, 0.3 + b.base * 0.55, -b.base, 0.04, 0, 0.6);
  else if (b.base > 0.15 && b.detail < 2) {
    m.mat = MAT.mud;
    steps(m, 0, 0.7, b.base, floor === 'platform' ? 0.9 : 0.4);
  }
  if (d.porch) porch(m, b, 0, Math.min(1.9, b.eaves - b.base - 0.05));
  leave(m);
  // Windows, where its claims say it had them.
  if (d.windows && d.windows !== 'none' && b.detail < 2) {
    for (const a of [0, PI, (3 * PI) / 2]) {
      enter(m, dcos(a) * (r - 0.02) * sx, dsin(a) * (r - 0.02) * sy, b.base, dcos(a), dsin(a));
      windowAt(m, b, 0, 1.25, d.windows === 'large' ? 0.4 : 0.2, d.windows === 'large' ? 0.9 : 0.42, d.windows === 'large');
      leave(m);
    }
  }
}

/** Two round rooms joined, the smaller before the larger. */
function drawEight(m: Mesh, b: Body): void {
  const r = Math.min(b.hw, b.hl);
  const small = { ...b, hw: r * 0.68, hl: r * 0.68, top: b.eaves + b.rise * 0.68, rise: b.rise * 0.68 };
  enter(m, 0, -r * 0.5, 0, 0, 1);
  drawRound(m, { ...b, entrance: 'roof', detail: b.detail === 0 ? 1 : b.detail, d: { ...b.d, porch: false, smoke: b.d.smoke === 'hole' ? 'hole' : 'none' } });
  leave(m);
  enter(m, 0, r * 0.82, 0, 0, 1);
  drawRound(m, small);
  leave(m);
}

/** A half circle open to the front: a windbreak of boughs, or a low curved wall with a roof leaning from it. */
function drawHalf(m: Mesh, b: Body): void {
  const r = Math.min(b.hw, b.hl);
  const n = b.detail === 0 ? 10 : 6;
  m.tint = b.tint;
  const solid = !!b.d.walls && b.d.walls !== 'none' && b.d.walls !== 'pole-and-thatch' && !SOFT.has(b.wallMat);
  const wall = solid ? Math.min(b.d.wall_height !== undefined ? b.wallH : 0.9, 1.6) : 0;
  const h = Math.max(wall + 0.6, Math.min(b.top - b.base, r * 1.3));
  if (solid) {
    // The wall, round the back and the sides.
    m.mat = b.wallMat;
    turn(m, [[r, -0.2], [r, wall]], n, 1, 1, PI, TAU);
    turn(m, [[r - 0.35, wall], [r, wall]], n, 1, 1, PI, TAU);
    const keep = m.light;
    m.light = keep * 0.7;
    turn(m, [[r - 0.35, -0.2], [r - 0.35, wall]], n, 1, 1, PI, TAU, true);
    m.light = keep;
  }
  // Its roof, or the whole of it where it has no wall: the half of a hive, its back to the wind, open towards the front.
  m.mat = b.skin.mat;
  const profile = (solid ? [[1, 0], [0.8, 0.5], [0.3, 1]] : [[1, 0], [0.96, 0.4], [0.74, 0.78], [0.3, 1]]).map(([q, t]) => [q * r, wall + t * (h - wall)]);
  turn(m, profile, n, 1, 1, PI, TAU);
  const keep = m.light;
  m.light = keep * 0.5;
  turn(m, profile.map(([q, z]) => [q * 0.97, z]), n, 1, 1, PI, TAU, true);
  m.light = keep;
  if (b.detail === 0) {
    m.mat = MAT.wood;
    m.tint = 100;
    for (const side of [-1, 1]) limb(m, side * r * 0.96, 0, 0, side * r * 0.25, -r * 0.1, h, 0.04, 0.03, 4);
    m.tint = b.tint;
  }
}

// ——— Tents ———

/** A round tent of felt on a lattice: its wall, its roof poles' cone or dome up to the ring the smoke leaves by, its bands and its door. */
function drawFelt(m: Mesh, b: Body): void {
  const r = Math.min(b.hw, b.hl);
  const n = b.detail === 0 ? 22 : b.detail === 1 ? 12 : 7;
  m.tint = b.tint;
  m.mat = MAT.felt;
  const wallTop = b.base + Math.max(1.2, b.wallH);
  turn(m, [[r, -0.2], [r, wallTop]], n);
  const crown = Math.max(0.35, r * 0.14);
  const top = Math.max(wallTop + 0.5, b.top);
  if (b.roof === 'dome') turn(m, [[r + 0.04, wallTop - 0.03], [r * 0.82, wallTop + (top - wallTop) * 0.5], [r * 0.5, wallTop + (top - wallTop) * 0.84], [crown, top]], n);
  else turn(m, [[r + 0.04, wallTop - 0.03], [crown, top]], n);
  if (b.detail === 2) return;
  // The ring at the top, where the smoke leaves and the light comes in, with its flap half over it.
  m.mat = MAT.dark;
  cap(m, ring(crown, 8), top - 0.01);
  m.mat = MAT.felt;
  quad(m, [-crown, -crown * 0.2, top + 0.02], [crown, -crown * 0.2, top + 0.02], [crown, -crown, top + 0.015], [-crown, -crown, top + 0.015]);
  if (b.detail === 0) {
    // The bands that bind the wall, and the ropes over the roof.
    m.mat = MAT.rope;
    for (const t of [0.3, 0.62, 0.92]) turn(m, [[r + 0.015, b.base + t * (wallTop - b.base) - 0.035], [r + 0.015, b.base + t * (wallTop - b.base) + 0.035]], n);
    for (let i = 0; i < 6; i++) {
      const a = (TAU * (i + 0.5)) / 6;
      limb(m, dcos(a) * (r + 0.05), dsin(a) * (r + 0.05), wallTop - 0.1, dcos(a) * crown, dsin(a) * crown, top + 0.01, 0.018, 0.018, 3);
    }
  }
  // Its door: a frame of wood, and a door of boards or a felt hung in it.
  enter(m, 0, r - 0.03, b.base, 0, 1);
  const h = Math.min(1.5, wallTop - b.base - 0.05);
  m.mat = MAT.wood;
  m.tint = 92;
  box(m, -0.52, 0, 0, -0.42, 0.1, h, true);
  box(m, 0.42, 0, 0, 0.52, 0.1, h, true);
  box(m, -0.56, 0, h, 0.56, 0.12, h + 0.1, true, true);
  const shut = b.u(13) < 0.5;
  m.mat = shut ? MAT.planks : MAT.dark;
  m.tint = shut ? 150 : b.tint;
  wall(m, 0.42, 0.05, -0.42, 0.05, 0, h);
  m.tint = b.tint;
  leave(m);
}

/** A cone of hides on poles that cross at its top and stand out above it, its flaps for the smoke, its door. */
function drawTipi(m: Mesh, b: Body): void {
  const r = Math.min(b.hw, b.hl);
  const n = b.detail === 0 ? 14 : b.detail === 1 ? 9 : 6;
  const top = Math.max(2, b.top - b.base);
  const cross = top * 0.9;
  m.tint = b.tint;
  m.mat = b.skin.mat;
  turn(m, [[r, 0], [r * 0.48, cross * 0.52], [0.12, cross]], n);
  if (b.detail === 2) return;
  // The poles, past where they cross.
  m.mat = MAT.wood;
  m.tint = 86;
  const poles = b.detail === 0 ? 9 : 4;
  for (let i = 0; i < poles; i++) {
    const a = (TAU * i) / poles + 0.3;
    limb(m, dcos(a) * 0.1, dsin(a) * 0.1, cross - 0.1, -dcos(a) * 0.42, -dsin(a) * 0.42, top + 0.55, 0.028, 0.016, 3);
  }
  m.tint = b.tint;
  // The flaps either side of the smoke's way out, and the door below them.
  m.mat = b.skin.mat;
  const at = (z: number) => r * (1 - z / cross) * 0.985 + 0.02;
  for (const side of [-1, 1]) sheet(m, [side * 0.1, at(cross * 0.72), cross * 0.72], [side * 0.75, at(cross * 0.8) + 0.35, cross * 0.82], [side * 0.55, at(cross * 0.96) + 0.3, cross * 0.98], [side * 0.06, at(cross * 0.96), cross * 0.96]);
  m.mat = MAT.dark;
  const zs = [0.12, 0.5, 0.9, 1.25];
  const half = [0.34, 0.4, 0.3, 0.1];
  for (let i = 0; i + 1 < zs.length; i++) quad(m, [half[i], at(zs[i]) + 0.012, zs[i]], [-half[i], at(zs[i]) + 0.012, zs[i]], [-half[i + 1], at(zs[i + 1]) + 0.012, zs[i + 1]], [half[i + 1], at(zs[i + 1]) + 0.012, zs[i + 1]]);
}

/** A tent of cloth on poles and ropes: a long low roof, its back and ends closed, its front open, a curtain across it within. */
function drawBlackTent(m: Mesh, b: Body): void {
  // Its long side is its front.
  const hx = Math.max(b.hw, b.hl);
  const hy = Math.min(b.hw, b.hl);
  const side = Math.max(1.1, b.wallH);
  const top = Math.max(side + 0.4, b.top - b.base);
  m.tint = b.tint;
  m.mat = MAT.haircloth;
  const poles = Math.max(2, Math.round((2 * hx) / 3.4));
  const xs: number[] = [];
  for (let i = 0; i <= 2 * poles; i++) xs.push(-hx + (2 * hx * i) / (2 * poles));
  // The roof: high at its poles, slack between them, down to its front and back edges.
  const ridge = (i: number) => (i % 2 === 1 ? top : top - 0.22);
  const edge = (i: number) => (i % 2 === 1 ? side : side - 0.12);
  for (let i = 0; i + 1 < xs.length; i++) {
    sheet(m, [xs[i], hy, edge(i) + 0.15], [xs[i + 1], hy, edge(i + 1) + 0.15], [xs[i + 1], 0, ridge(i + 1)], [xs[i], 0, ridge(i)]);
    sheet(m, [xs[i + 1], -hy, edge(i + 1)], [xs[i], -hy, edge(i)], [xs[i], 0, ridge(i)], [xs[i + 1], 0, ridge(i + 1)]);
  }
  // The back and the two ends, hung to the ground.
  sheet(m, [hx, -hy, 0], [-hx, -hy, 0], [-hx, -hy, side - 0.12], [hx, -hy, side - 0.12]);
  for (const s of [-1, 1]) {
    if (s > 0) sheet(m, [hx, hy, 0], [hx, -hy, 0], [hx, -hy, side - 0.12], [hx, hy, side + 0.03]);
    else sheet(m, [-hx, -hy, 0], [-hx, hy, 0], [-hx, hy, side + 0.03], [-hx, -hy, side - 0.12]);
    tri(m, s > 0 ? [hx, hy, side + 0.03] : [-hx, -hy, side - 0.12], s > 0 ? [hx, -hy, side - 0.12] : [-hx, hy, side + 0.03], [s * hx, 0, top - 0.22]);
  }
  if (b.detail === 2) return;
  // The curtain that parts its two halves, and a length of the front hung closed.
  const part = (b.u(14) < 0.5 ? -1 : 1) * hx * 0.2;
  sheet(m, [part, hy * 0.9, 0], [part, -hy, 0], [part, -hy, side], [part, hy * 0.9, side]);
  sheet(m, [-hx, hy, 0], [-hx + hx * 0.5, hy, 0], [-hx + hx * 0.5, hy, side], [-hx, hy, side + 0.03]);
  // Its poles, and the ropes that hold it out, each to its peg.
  m.mat = MAT.wood;
  m.tint = 90;
  for (let i = 1; i < xs.length; i += 2) {
    limb(m, xs[i], 0, 0, xs[i], 0, top + 0.05, 0.045, 0.04, 4);
    limb(m, xs[i], hy, 0, xs[i], hy, side + 0.15, 0.035, 0.03, 4);
  }
  if (b.detail === 0) {
    m.mat = MAT.rope;
    for (let i = 1; i < xs.length; i += 2) {
      limb(m, xs[i], hy, side + 0.15, xs[i], hy + 2.4, 0.02, 0.014, 0.014, 3);
      limb(m, xs[i], -hy, side, xs[i], -hy - 2.4, 0.02, 0.014, 0.014, 3);
    }
    for (const s of [-1, 1]) for (const y of [-hy, 0, hy]) limb(m, s * hx, y, y === 0 ? top - 0.22 : side, s * (hx + 2.2), y, 0.02, 0.014, 0.014, 3);
  }
  m.tint = b.tint;
}

// ——— A dwelling ———

/** A dwelling drawn in the frame it is entered in: one of its shapes, by its plan and what it is built of. */
function drawSpec(m: Mesh, d: DwellingSpec, detail: HouseDetail, variant: number, grow: number): Body {
  const b = bodyOf(d, variant, grow, detail);
  m.tint = b.tint;
  m.light = 1;
  const plan = d.plan ?? 'rectangular';
  if (d.walls === 'earth-cut') drawCave(m, b);
  else if (d.walls === 'felt' && b.round) drawFelt(m, b);
  else if (d.walls === 'hide' && b.round && (b.roof === 'tent' || b.roof === 'conical')) drawTipi(m, b);
  else if (tentLike(d) && !b.round) drawBlackTent(m, b);
  else if (plan === 'figure-of-eight') drawEight(m, b);
  else if (plan === 'semicircular') drawHalf(m, b);
  else if (b.round && d.court) drawRing(m, b);
  else if (b.round) drawRound(m, b);
  else if (plan === 'courtyard' || d.court) drawCourt(m, b);
  else if (plan === 'room-block') drawBlock(m, b);
  else if (plan === 'l-shaped') drawEll(m, b);
  else drawRect(m, b);
  m.tint = b.tint;
  return b;
}

/**
 * What a household had besides its house, drawn with the house as one thing: what enclosed its yard (a tradition's
 * `settlement_form`), and what stood in it (its `outbuildings` that were a household's), each filled out as a
 * dwelling is. That they stood there is the tradition's claim; where in the yard each stands is the generator's.
 */
export interface Homestead {
  /** the side of the ground one household has to itself, in metres: its yard keeps within it */
  lot: number;
  /** what encloses its yard */
  yard?: Exclude<EnclosureWord, 'none'>;
  /** what stands by the house, with how many to a household: below one, the share of households that had one */
  out: { use: OutbuildingUse; spec: DwellingSpec; count: number; enclosure?: EnclosureWord }[];
}

/** How the generator draws what stood by the houses where a tradition leaves it unsaid (its params.outbuildings). */
export interface OutbuildingParams {
  /** the share of households drawn with a thing that was a household's, where no source counts them */
  share: number;
  /** the plain one of each use: its shape and size, for whatever a tradition leaves unsaid of its own */
  generic: Partial<Record<OutbuildingUse, DwellingSpec>>;
}

/**
 * One outbuilding as it is drawn: what its tradition says of it; then the generator's plain one of its use, for its
 * shape and size; then, for a roofed one whose walls, roof covering or finish nothing states, those of the tradition's
 * own house, as a household built its granary of what it built its house of.
 */
export function outbuildingSpec(o: OutbuildingSpec, p: OutbuildingParams | undefined, house: DwellingSpec): DwellingSpec {
  const { use, per: _per, count: _count, enclosure: _enclosure, ...own } = o;
  const spec = fillDwelling(own, p?.generic[use] ?? {}) as Record<string, unknown>;
  if (!OUTBUILDING_ROOFED[use]) return spec as DwellingSpec;
  const soft = house.walls === 'felt' || house.walls === 'hide' || house.walls === 'cloth' || house.walls === 'snow' || house.walls === 'earth-cut';
  if (spec.walls === undefined && house.walls && !soft) spec.walls = house.walls;
  if (spec.roof_material === undefined && house.roof_material && !soft && (spec.roof === undefined || (spec.roof === 'flat') === (house.roof === 'flat'))) spec.roof_material = house.roof_material;
  if (spec.finish === undefined && house.finish && spec.walls === house.walls) spec.finish = house.finish;
  return spec as DwellingSpec;
}

/**
 * A tradition's homestead on a lot of a given side: what encloses each yard (its `settlement_form`), and its
 * outbuildings that were a household's, each as it is drawn and with how many to a household: a source's count, or
 * the generator's share where none is counted.
 */
export function homesteadOf(t: Pick<Tradition, 'settlement' | 'outbuildings'> | undefined, house: DwellingSpec, lot: number, p: OutbuildingParams | undefined): Homestead {
  const yard = t?.settlement.yard;
  const out = (t?.outbuildings ?? [])
    .filter((o) => o.per === 'house')
    .map((o) => ({ use: o.use, spec: outbuildingSpec(o, p, house), count: o.count !== undefined ? mid(o.count, 1) : p?.share ?? 0, ...(o.enclosure ? { enclosure: o.enclosure } : {}) }));
  return { lot, ...(yard && yard !== 'none' ? { yard } : {}), out };
}

/** The ground a thing of a yard takes, across and back, in metres. */
function groundOf(use: OutbuildingUse, spec: DwellingSpec, variant: number): [number, number] {
  const across = mid(spec.diameter ?? spec.width, 2.5);
  if (use === 'well') return [2.4, 2.4];
  if (use === 'oven' || use === 'stack' || use === 'threshing-floor' || use === 'pen') return [across, across];
  if (use === 'pond') return [across, across * 0.8];
  if (use === 'rack') return [mid(spec.width ?? spec.length, 2.6) + 0.4, 1.4];
  if (use === 'pole') return [1.2, 1.2];
  const size = houseSize(spec, variant);
  return [size.w + 1, size.l + 1];
}

/** One thing of a yard, at the origin of the frame it is entered in, its front towards +y. */
function drawYardThing(m: Mesh, use: OutbuildingUse, spec: DwellingSpec, detail: HouseDetail, variant: number, enclosure: EnclosureWord | undefined, wallMat: number): void {
  const across = mid(spec.diameter ?? spec.width, 2.5);
  if (use === 'well') drawWell(m, detail);
  else if (use === 'oven') drawOven(m, detail, across);
  else if (use === 'stack') drawStack(m, detail, across, mid(spec.height, 2.8));
  else if (use === 'threshing-floor') drawFloor(m, detail, across);
  else if (use === 'pond') drawPond(m, detail, across);
  else if (use === 'rack') drawRack(m, detail, mid(spec.width ?? spec.length, 2.6), mid(spec.height, 1.8), variant);
  else if (use === 'pole') drawPole(m, detail, mid(spec.height, 5), spec.walls === 'stone');
  else if (use === 'pen') {
    if (detail < 2) penRing(m, enclosure && enclosure !== 'none' ? enclosure : 'fence', across / 2, detail, variant, wallMat);
  } else drawSpec(m, spec, detail, variant, 1);
}

/** The kit's material a yard's wall is drawn as: of the house's own stuff where that is earth, brick or stone. */
const yardWall = (b: Body): number => (b.wallMat === MAT.rubble || b.wallMat === MAT.brick || b.wallMat === MAT.adobe ? b.wallMat : MAT.mud);

/** The yard of a house: its enclosure, with a way in at the front, and the things that stand in it, behind the house and beside it. */
function drawYard(m: Mesh, b: Body, home: Homestead, variant: number): void {
  if (b.detail === 2) return;
  const size = { w: 2 * (b.turned ? b.hl : b.hw), l: 2 * (b.turned ? b.hw : b.hl) };
  const most = home.lot / 2 - 0.3;
  const u = (k: number) => hash2(variant, k, 0x7a3d);
  // Which of its things this household has: all of a count, and one more by its odd share.
  const things: { use: OutbuildingUse; spec: DwellingSpec; enclosure?: EnclosureWord; ground: [number, number] }[] = [];
  home.out.forEach((o, i) => {
    const n = Math.floor(o.count) + (u(20 + i) < o.count - Math.floor(o.count) ? 1 : 0);
    for (let q = 0; q < Math.min(n, 3); q++) things.push({ use: o.use, spec: o.spec, ...(o.enclosure ? { enclosure: o.enclosure } : {}), ground: groundOf(o.use, o.spec, variant * 5 + i + q) });
  });
  // The yard: as wide and deep as its things need, within the household's ground.
  const need = things.reduce((a, t) => Math.max(a, t.ground[1]), 0);
  const X = Math.min(most, size.w / 2 + 3 + (things.length > 2 ? 2.5 : 0));
  const front = Math.min(most, size.l / 2 + 3.2);
  const back = Math.min(most, size.l / 2 + (things.length ? Math.max(3, need + 1.6) : 2.4));
  if (X < size.w / 2 + 0.6 || back < size.l / 2 + 0.6) return;
  // Its things, behind the house from one side to the other, then beside it; one that finds no room is left out.
  let x = -X + 0.5;
  let side = 0;
  things.forEach((t, i) => {
    const [gw, gl] = t.ground;
    let at: [number, number, number, number] | undefined;
    if (x + gw <= X - 0.5 && size.l / 2 + 0.8 + gl <= back - 0.3) {
      at = [x + gw / 2, -(size.l / 2 + 0.8 + gl / 2), 0, 1];
      x += gw + 0.7;
    } else if (side < 2 && size.w / 2 + 0.8 + gl <= X - 0.3 && gw <= size.l + 1.5) {
      const s = side === 0 ? 1 : -1;
      at = [s * (size.w / 2 + 0.8 + gl / 2), 0, -s, 0];
      side++;
    }
    if (!at) return;
    enter(m, at[0], at[1], 0, at[2], at[3]);
    drawYardThing(m, t.use, t.spec, b.detail, variant * 5 + i, t.enclosure, yardWall(b));
    leave(m);
    m.tint = b.tint;
  });
  // A house built round its own court is its yard's enclosure: no second one stands round it.
  if (!home.yard || b.d.plan === 'courtyard' || b.d.court) return;
  // Its enclosure, in lengths along each side, with a way in before the door.
  const gate = 1.7;
  const sides: [number, number, number, number, number, boolean][] = [
    [0, -back, 0, -1, X, false],
    [X, (front - back) / 2, 1, 0, (front + back) / 2, false],
    [-X, (front - back) / 2, -1, 0, (front + back) / 2, false],
    [0, front, 0, 1, X, true],
  ];
  const mat = yardWall(b);
  for (const [cx, cy, gx, gy, half, gated] of sides) {
    enter(m, cx, cy, 0, gx, gy);
    const runs: [number, number][] = gated ? [[-half, -gate / 2], [gate / 2, half]] : [[-half, half]];
    for (const [x0, x1] of runs) {
      const n = Math.max(1, Math.round((x1 - x0) / 4));
      const run = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        enter(m, x0 + (i + 0.5) * run, 0, 0, 0, 1);
        enclosurePiece(m, home.yard, run + 0.04, b.detail, variant + i, mat);
        leave(m);
      }
    }
    leave(m);
  }
  m.tint = b.tint;
}

/**
 * A house of a dwelling, drawn into a mesh at the frame's origin, its front towards +y. `variant` is which of the
 * dwelling's shapes it is (0 to HOUSE_VARIANTS − 1), and `grow` how much wider and longer it is drawn where one house
 * stands for several households: its storeys, its doors and its windows stay the size they were. With `home`, its yard
 * is drawn with it: what encloses it and what stands in it.
 */
export function drawDwelling(m: Mesh, d: DwellingSpec, detail: HouseDetail, variant = 0, grow = 1, home?: Homestead): void {
  reset(m);
  const b = drawSpec(m, d, detail, variant, grow);
  if (home && (home.yard || home.out.length)) drawYard(m, b, home, variant);
  reset(m);
}
