// A scene as it is looked at: the ground, then whichever cells a view needs, then which individuals to draw
// and at what detail. The same code runs in a browser's worker, in the build and in the tests. A frame's cost
// depends on what is on the screen and is bounded by a budget, not on how much lives in the scene.
import type { Form } from '../../../core/form.ts';
import type { LivingTaxon, SceneSpec } from '../../../core/scene.ts';
import { GroundSampler, type GroundGridData } from '../city/ground.ts';
import { fingerprint, type Fingerprint, type Part } from '../../../core/fingerprint.ts';
import { MAT, Mesh, meshParts } from '../city/kit.ts';
import { hash2, hashString, TAU } from '../city/math.ts';
import { clumpWidth, drawAnimal, drawClump, drawPlant, POSE, STRIDE_HIPS, type Detail, type Stance } from './forms.ts';
import { ROUTE, WAY } from './routines.ts';
import { banksOf, CELL, CELLS, cellParts, cellKey, coverMask, EXTENT, groundGrids, LandCover, makePlan, placeLook, REACH, waterLevels, waterRibbons, waterSheet, watersFor, worldGround, type CellRows, type LivingParams, type LivingPlan, type PlaceLook } from './scene/v14.ts';
import type { WorldGround } from './relief.ts';
import { freshOf, noise, type Waters } from './land.ts';
import { GroundSort } from './sorting.ts';
import { drawStone, drawWood, shedsWood, STONE_FINE, STONE_VARIANTS, WOOD, WOOD_SEEDS, woodLength } from './strewn.ts';
import { drawDwelling, HOUSE_VARIANTS, houseSize, type HouseDetail } from '../people/dwellings.ts';
import { clipWaters, joinWater, overlaySurvey, placeSurvey, surveyWaterMesh, withSurveyWater, type PlacedSurvey } from './survey.ts';
import { farLand, farLandMask, farScale, LandUseMap, landUseMask, makeSettlement, waterNear, type LandUse, type SettlementParams, type SettlementPlan } from '../people/settlement/v11.ts';
import { LaneGround } from '../people/settlement/lanes.ts';
import { drawCrop, slotArchetype, sow, type CropParams } from '../people/crops.ts';
import { buildFieldworks, type FieldTreeSpot } from '../people/fieldworks.ts';
import { buildPerimeterMesh } from '../people/walls.ts';
import { FIELD_SLOTS, PLOT, PLOT_LOOK, plotAt, plotSlotIndex, plotStyle, type PlotStyle } from '../../../core/plots.ts';
import { drawWork, smallWork, WORK_VARIANTS, workTop } from '../people/works.ts';
import { personStride } from '../people/figures.ts';

/** Where houses start among a scene's kinds of mesh: a taxon's number is below it, a house's dwelling above. */
export const HOUSE = 0x4000;
/** Where the pieces of a town's works start, above the houses: a length of wall, a tower, a gate, a length of water. */
export const WORK = 0x6000;
/** Where the animals people kept start, above the works: each kind the scene's husbandry names (ScenePeople.kept). */
export const KEPT = 0x7000;
/** The crop of the fields, above the kept animals: one kind, which nobody names (world/generators/people/crops.ts). */
export const CROP = 0x7800;
/** Where what lies strewn on the ground starts, above the fields' crop: a stone, in each of its shapes (strewn.ts). */
export const STREWN = 0x7c00;

export const INSTANCE_STRIDE = 28;

/** A view: where the eye is, which way it looks, and how big things come out on the screen. */
export interface LifeView {
  eye: [number, number, number];
  forward: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  fov: number;
  aspect: number;
  /** the frame's height in pixels */
  height: number;
  clearance: number;
  /**
   * A still is being made (docs/plans/RENDERING.md, step 8): twice the budget, and the far drawn as the near is, a step
   * finer at each distance.
   */
  rich?: boolean;
}

export interface Budget {
  /** the most individuals a frame draws */
  instances: number;
  /** the most triangles, as the meshes say */
  triangles: number;
  /** on the slowest machines, only coarse meshes */
  fast: boolean;
}

export const FULL_BUDGET: Budget = { instances: 220000, triangles: 9000000, fast: false };
export const FAST_BUDGET: Budget = { instances: 16000, triangles: 400000, fast: true };

/** One kind of mesh and everyone drawn with it this frame. */
export interface Batch {
  proto: number;
  count: number;
  /** INSTANCE_STRIDE bytes each: x, y, z, scale, fx, fy as floats, then entity and tint as shorts */
  data: ArrayBuffer;
  /**
   * Where any of them goes a way of its own (routines.ts): each one's way, ROUTE floats, in step with `data`; all
   * noughts for one that stays where it is. The renderer moves each along its way by the visit's clock.
   */
  ways?: ArrayBuffer;
}

export interface ProtoMesh {
  proto: number;
  vertices: ArrayBuffer;
  indices: Uint32Array;
  /**
   * How an animal's mesh idles (docs/plans/RENDERING.md, step 5): where its neck leaves its shoulders, its hips and its
   * middle, in its own frame, each followed by 0; then how far its head swings up or down from its pose and its tail from
   * side to side, in radians, how fast it idles, in radians a second, and how long a stride of its legs is as it walks,
   * in its own metres. Its vertices say what moves with what. A person's mesh has only the last two.
   */
  idle?: number[];
}

/** Everyone drawn with one mesh this frame, as they are gathered: their places, and their ways where any has one. */
interface Bucket {
  f: Float32Array;
  s: Uint16Array;
  n: number;
  w?: Float32Array;
}

/** Keep a way with the body about to be put in a bucket: its ROUTE numbers, in step with the bucket's bodies. */
function keepWay(b: Bucket, ways: ArrayLike<number>, o: number): void {
  const room = (b.f.byteLength / INSTANCE_STRIDE) * ROUTE;
  if (!b.w || b.w.length < room) {
    const w = new Float32Array(room);
    if (b.w) w.set(b.w);
    b.w = w;
  }
  for (let k = 0; k < ROUTE; k++) b.w[b.n * ROUTE + k] = ways[o + k];
}

/** Whether a way is walked: then its body is drawn standing, and the renderer strides its legs. */
const walked = (ways: ArrayLike<number>, o: number): boolean => Math.floor(ways[o + 11]) === WAY.walk;

/**
 * How an animal idles, from how it stands: a head lowered to graze is raised now and then and lowered again, a head held
 * up dips; a tail swings, more as it walks; and the pace is slower the bigger the body. These are the generator's look,
 * no claim about any animal.
 */
function idling(pose: number, L: number): [number, number, number] {
  const low = pose === POSE.graze || pose === POSE.drink;
  // Up is positive: a grazing head comes up, a head held up dips.
  const head = low ? 0.45 : pose === POSE.alert ? -0.06 : pose === POSE.rest ? -0.04 : pose === POSE.fly ? 0 : -0.14;
  const tail = pose === POSE.walk ? 0.22 : pose === POSE.fly ? 0.05 : 0.12;
  return [head, tail, (2 * Math.PI) / (2.2 * Math.sqrt(Math.max(L, 0.05)) + 0.8)];
}

export interface Selection {
  batches: Batch[];
  /** meshes the batches use that have not been handed out before */
  protos: ProtoMesh[];
  instances: number;
  triangles: number;
  /** how much is still to come for this view: cells to be made, and one more where its far share has yet to hold */
  pending: number;
  /** how much stands or lies on the ground close by, apart from the instances: clumps of low plants, stones and fallen wood */
  clumps: number;
  /** the nearest groups, to name */
  groups: NamedGroup[];
}

/**
 * A group to name: its taxon, where its first stands and how high its name goes; and, where that one goes a way of its
 * own (routines.ts), its way and the way it was put, so that the name goes with it.
 */
export interface NamedGroup {
  taxon: number;
  at: [number, number];
  base: number;
  top: number;
  way?: number[];
  face?: [number, number];
}

export const protoOf = (taxon: number, variant: number, detail: Detail | typeof CLUMP) => (taxon << 8) | (variant << 2) | detail;

/** Budget-controller state for `SceneStream`'s far-distance retention factor. */
export interface KeepBudgetState {
  keep: number;
  belowStreak: number;
  unsettled: number;
}

/**
 * Damped deadband controller for `SceneStream`'s far-distance retention factor `keep`.
 * - Never changes `keep` during an incomplete time-sliced pass (`incomplete === true`), so missing
 *   cells never trick the controller into relaxing and then overshooting.
 * - Tightens gently (`* 0.90`, floor `0.2`) above 95% of either instance or triangle budget.
 * - Relaxes gently (`* 1.06`, cap `1.0`) only after 3 consecutive settled passes below 55% of both
 *   budgets, eliminating limit-cycle blinking at steady views.
 */
export function stepKeepBudget(
  state: KeepBudgetState,
  instances: number,
  triangles: number,
  capInstances: number,
  capTriangles: number,
  incomplete: boolean,
): { keep: number; belowStreak: number; unsettled: number; needsPass: boolean } {
  if (incomplete) {
    return { keep: state.keep, belowStreak: 0, unsettled: state.unsettled, needsPass: false };
  }
  const over = instances >= capInstances || triangles > capTriangles;
  const nearOver = instances >= capInstances * 0.95 || triangles > capTriangles * 0.95;
  const wellUnder = instances < capInstances * 0.55 && triangles < capTriangles * 0.55;
  let keep = state.keep;
  let belowStreak = state.belowStreak;
  if (over || nearOver) {
    belowStreak = 0;
    keep = Math.max(0.2, Math.round(state.keep * 0.9 * 1000) / 1000);
  } else if (wellUnder && state.keep < 1) {
    belowStreak = state.belowStreak + 1;
    if (belowStreak >= 3) {
      keep = Math.min(1, Math.round(state.keep * 1.06 * 1000) / 1000);
      belowStreak = 0;
    }
  } else {
    belowStreak = 0;
  }
  const changed = keep !== state.keep;
  if (changed && state.unsettled < 16) {
    return { keep, belowStreak, unsettled: state.unsettled + 1, needsPass: true };
  }
  return { keep, belowStreak, unsettled: changed ? state.unsettled : 0, needsPass: false };
}

/**
 * Choose mesh detail tier (0 far, 1 mid, 2 close) from apparent screen height `pxs`, staggered
 * deterministically across a ±15% band by per-instance `jitter01` in [0, 1] so dense forests and
 * towns transition gradually instead of flipping in a single hard concentric ring.
 */
export function lodDetail(pxs: number, jitter01: number, fast: boolean, rich: boolean, high = 70, mid = 9, fastMid = 26): Detail {
  const spread = 0.85 + 0.3 * Math.max(0, Math.min(1, jitter01));
  if (fast) return pxs >= fastMid * spread ? 1 : 0;
  const hi = (rich ? high * (36 / 70) : high) * spread;
  const lo = (rich ? mid * (4 / 9) : mid) * spread;
  return pxs >= hi ? 2 : pxs >= lo ? 1 : 0;
}
/** A mesh's detail that is a clump of a low plant, as the ground's cover close by is drawn. */
export const CLUMP = 3;
/**
 * With that detail, a taxon's variants from here on are the wood it sheds, which lies under its trees as its clumps
 * stand: which piece (strewn.ts, WOOD), and which of its seeds.
 */
export const FALLEN = 8;
/** The seed a piece of fallen wood is drawn from. */
const woodSeed = (which: number): number => (which + 1) * 0x51f3;
/**
 * How wide a stone must be, in metres, to have a finer mesh at all, and how wide on the screen, in pixels, for that one
 * to be drawn: wide enough to be looked at. How it is drawn, and no fact.
 */
const STONE_FINE_FROM = 0.2;
const STONE_FINE_PX = 44;
export const protoParts = (p: number): { taxon: number; variant: number; detail: Detail } => ({ taxon: p >> 8, variant: (p >> 2) & 63, detail: (p & 3) as Detail });

const WALKING = new Set<number>([POSE.walk, POSE.fly]);

/** How many clumps across a tile of the ground's cover is, and how many tiles are kept before the least lately used are let go. */
const COVER_TILE = 24;
const COVER_KEPT = 900;
/** How much of its own width, squared, a clump keeps clear of its neighbours: under it a grid sows fewer of them. */
const COVER_CROWD = 0.4;
/** How many of the clumps their share of the cover would sow are sown where that share is next to nothing; all of them where it is the whole. */
const COVER_THIN = 0.25;
/** How near the eye a clump of the ground's cover may stand, m: none nearer than the first, and full grown from the second. */
const COVER_TROD = [0.45, 1.5];
/**
 * Low plants grow in patches, one kind spreading where it took hold: how far across a patch is, m; how many of a
 * patch's clumps are of its own kind, the rest any of the understory; how many of the patches are openings, where
 * little grows; how much of its cover a patch keeps at its edge; and between which shares of low plants in the land's
 * cover a sward goes from patchy to closed. All the generator's choices, and nobody's record.
 */
const COVER_PATCH = { across: 4.2, own: 0.78, open: 0.14, edge: 0.4, sward: [0.5, 0.9] };
/**
 * How much the ground may fall along a piece of fallen wood, as a share of its length: it lies level, part of it in
 * the ground, and where the ground falls more than this from one of its ends to the other it is not laid.
 */
const WOOD_LEVEL = 0.05;
/** How far from a standing trunk's middle fallen wood keeps, in metres, at each place along it that is tried. */
const WOOD_ROOM = 0.7;

/** How many numbers a thing of a tile has: its place, size, facing, its place in the thinning, and how far it reaches from its middle. */
const COVER_ROW = 8;

/**
 * What stands or lies in one tile of a grid of the ground's cover, clumps of low plants, stones and fallen wood: each
 * one's place, size, facing, place in the thinning and reach; its mesh; its tint.
 */
interface CoverTile {
  f: Float32Array;
  proto: Uint32Array;
  tint: Uint16Array;
  count: number;
  used: number;
}

/** One of the grids the ground's cover is sown on: how far apart its nodes are, how far from the eye it reaches, and how much larger its clumps are. */
interface CoverGrid {
  step: number;
  reach: number;
  size: number;
  /** the stones it is sown with: how wide, from the least to the most, and how many to the square metre of ground that is all stones */
  stones?: { lo: number; hi: number; per: number };
  /** whether fallen trunks and stumps lie on it, and whether fallen branches do */
  trunks: boolean;
  branches: boolean;
}

/** A tile's rows as they are made: they grow as they are added to. */
class TileRows {
  f = new Float32Array(256 * COVER_ROW);
  proto = new Uint32Array(256);
  tint = new Uint16Array(256);
  count = 0;
  /** A thing turned by `turn` radians about the vertical. */
  add(x: number, y: number, z: number, scale: number, turn: number, keep: number, reach: number, proto: number, tint: number): void {
    this.put(x, y, z, scale, Math.sin(turn), Math.cos(turn), keep, reach, proto, tint);
  }
  /** A thing whose own +y goes to (fx, fy): not a unit's length for a crop, whose mesh is stretched along its row by it. */
  put(x: number, y: number, z: number, scale: number, fx: number, fy: number, keep: number, reach: number, proto: number, tint: number): void {
    if (this.count === this.proto.length) {
      const f = new Float32Array(this.f.length * 2);
      f.set(this.f);
      this.f = f;
      const p = new Uint32Array(this.proto.length * 2);
      p.set(this.proto);
      this.proto = p;
      const t = new Uint16Array(this.tint.length * 2);
      t.set(this.tint);
      this.tint = t;
    }
    const o = this.count * COVER_ROW;
    this.f[o] = x;
    this.f[o + 1] = y;
    this.f[o + 2] = z;
    this.f[o + 3] = scale;
    this.f[o + 4] = fx;
    this.f[o + 5] = fy;
    this.f[o + 6] = keep;
    this.f[o + 7] = reach;
    this.proto[this.count] = proto;
    this.tint[this.count] = tint;
    this.count++;
  }
  tile(): CoverTile {
    return { f: this.f.slice(0, this.count * COVER_ROW), proto: this.proto.slice(0, this.count), tint: this.tint.slice(0, this.count), count: this.count, used: 0 };
  }
}

/** Between which shares of field in the land's use a crop goes from none standing to all of it: the generator's choice. */
const CROP_FROM = [0.45, 0.8];

/** The bit of a plant's variant that says it is drawn a little way off (plants.ts, `coarse`). */
const COARSE = 4;
/** How tall on the screen, in pixels, a plant must stand for its twigs and their sprays to be drawn. */
const TWIGS_FROM = 300;

export class SceneStream {
  readonly look: PlaceLook;
  private waters: Waters;
  readonly levels: GroundGridData[];
  readonly ground: GroundSampler;
  /** the world's ground under the scene: the field's and the shape within its cells, before anything is invented or cut */
  readonly worldGround: WorldGround;
  /** a settlement's own survey, where the scene has one: its ground and water (survey.ts) */
  readonly survey?: PlacedSurvey;
  readonly plan: LivingPlan;
  readonly params: LivingParams;
  readonly cover: LandCover;
  /** every cell made so far, at the most it was made */
  private cells = new Map<number, CellRows>();
  private meshes = new Map<number, { tris: number }>();
  private tones: number[];
  private keep = 1;
  /** how many consecutive completed passes stayed well below budget before relaxing `keep` */
  private belowStreak = 0;
  /** how many selections running the far share has been changed after */
  private unsettled = 0;
  private fullReach: number;
  private nearReach: number;
  /** how tall an understory plant must be to be drawn as a mesh from a way off */
  private shrubFrom: number;
  /** the people's houses, settlements and fields, where the scene has people */
  readonly people?: SettlementPlan;
  private landUse?: LandUseMap;
  /** each cell's houses, by their place in the plan */
  private houseCells = new Map<number, number[]>();
  /** how tall a house of each form is in each of its shapes, and how wide or long, whichever is more: form × shape */
  private houseTops: number[] = [];
  private houseWide: number[] = [];
  /** each cell's pieces of its towns' works, by their place in the plan */
  private workCells = new Map<number, number[]>();
  private workTops: number[] = [];
  /** the ground's cover, made a tile at a time and kept; a count of the views it was made for; and whether the scene has no low plants */
  private coverTiles = new Map<string, CoverTile>();
  private coverClock = 0;
  private noUnder = false;
  private clumpWides: number[] = [];
  /** the grids the cover is sown on, with what besides low plants each is sown with */
  private grids: CoverGrid[] = [];
  /** the scene's ground as its substrate sorts it: where it is stony, and what it bears */
  readonly sort: GroundSort;
  /** what each taxon sheds, as wood: nothing for one that is no tree */
  private sheds: { trunks: boolean; branches: boolean }[] = [];
  /** each cell's kept animals, by their place in the plan; and each kind's tone */
  private keptCells = new Map<number, number[]>();
  private keptTones: number[] = [];
  /** how the fields' crop is drawn, where the scene's people have fields and their generator says how; and their plots */
  readonly crops?: CropParams;
  private plots?: PlotStyle;
  /** native broadleaf canopy taxon index used for field-margin & headland trees, or -1 if none in the scene */
  private fieldTreeTaxon = -1;
  /** field-corner and headland tree placements emitted by buildFieldworks() */
  private fieldTrees: FieldTreeSpot[] = [];
  /** cached water level lookup for wet paths, built once per SceneStream */
  private levelAt?: (x: number, y: number) => number;

  constructor(readonly spec: SceneSpec, private budget: Budget = FULL_BUDGET) {
    this.params = spec.generator.params as unknown as LivingParams;
    this.look = placeLook(spec);
    // A settlement's own survey, where the scene has one (survey.ts): its ground and its water stand in for the scene's
    // where they reach, and the river the scene would run from the world's drainage is not drawn over its own.
    const survey = spec.survey ? placeSurvey(spec.site.origin, spec.survey) : undefined;
    this.survey = survey;
    const made = watersFor(spec, this.look);
    const waters = survey ? clipWaters(made, survey) : made;
    this.waters = waters;
    this.levels = groundGrids(spec, this.look, waters);
    if (survey) overlaySurvey(this.levels, survey);
    this.ground = new GroundSampler(this.levels);
    this.worldGround = worldGround(spec);
    // Where the world gives the rivers, the water's level varies over the scene; otherwise it is the place's one level.
    const ownLevel = waters.paths ? waterLevels(waters) : undefined;
    const levelAt = survey?.rings.length ? withSurveyWater(ownLevel ?? (() => this.look.water), survey) : ownLevel;
    this.levelAt = levelAt;
    // The people, where the scene has any: their houses and fields, on this ground and away from this water. Where they
    // cleared the land no tree stands. A scene of the sea has them too, on whatever ground stands above its water: a place
    // a few metres above the sea, a delta or a lower plain, is a scene of the sea (scene/v14.ts, sea_below), and among the
    // most crowded land there was.
    let clearing: ((x: number, y: number) => number) | undefined;
    if (spec.people) {
      // People keep their houses and fields out of a river's bed, dry in the month or not: its floods come down it.
      const settled = (waters.paths?.some((p) => p.dry) ? waterLevels(waters, true) : ownLevel) ?? (() => this.look.water);
      const water = survey?.rings.length ? withSurveyWater(settled, survey) : settled;
      // And they settled by fresh water, wet in the month or not: a river that ran some months was still where wells were dug.
      this.people = makeSettlement(spec, this.ground, water, EXTENT, this.params.animals.routines, waterNear(waters, REACH), (x, y) => this.worldGround.at(x, y), survey?.reserved);
      const use = new LandUseMap(this.people, this.ground, water, this.look.seed);
      this.landUse = use;
      this.crops = (spec.people.generator.params as unknown as SettlementParams).crops;
      this.plots = plotStyle(this.people.style);
      clearing = (x, y) => {
        const u = use.at(x, y);
        return Math.max(u.crop, u.pasture * 0.85, u.yard);
      };
      this.houseTops = [];
      this.houseWide = [];
      for (const f of this.people.forms) {
        for (let v = 0; v < HOUSE_VARIANTS; v++) {
          const size = houseSize(f.spec, v, f.grow ?? 1);
          this.houseTops.push(size.top);
          this.houseWide.push(Math.max(size.w, size.l));
        }
      }
      this.people.houses.forEach((h, i) => {
        const k = cellKey(Math.floor(h.x / CELL), Math.floor(h.y / CELL));
        let list = this.houseCells.get(k);
        if (!list) this.houseCells.set(k, (list = []));
        list.push(i);
      });
      this.keptTones = (spec.people.kept ?? []).map((t) => hashString(t.id) & 255);
      this.people.animals.forEach((a, i) => {
        const k = cellKey(Math.floor(a.x / CELL), Math.floor(a.y / CELL));
        let list = this.keptCells.get(k);
        if (!list) this.keptCells.set(k, (list = []));
        list.push(i);
      });
      this.workTops = this.people.workForms.map((f) => workTop(f.spec));
      this.people.works.forEach((w, i) => {
        const k = cellKey(Math.floor(w.x / CELL), Math.floor(w.y / CELL));
        let list = this.workCells.get(k);
        if (!list) this.workCells.set(k, (list = []));
        list.push(i);
      });
    }
    // Nor does a tree stand yet on the bars an invented river has lately left.
    const fresh = freshOf(waters, this.params.ground.migration);
    const loose = clearing && fresh ? (x: number, y: number) => Math.max(clearing(x, y), fresh(x, y)) : (clearing ?? fresh);
    // Nothing grows on the ground a city's recorded structures take.
    const treeless = survey ? (x: number, y: number) => (survey.built(x, y) ? 1 : (loose?.(x, y) ?? 0)) : loose;
    // How far each point is from the banks of the water the world gives, flowing, still or dry: what grows by water.
    const banks = banksOf(spec, waters);
    this.plan = makePlan(spec, this.ground, this.look, waters, levelAt, treeless, banks);
    this.cover = new LandCover(spec, this.ground, this.look.water, this.plan.focus, levelAt, treeless, banks);
    this.sort = new GroundSort(spec.substrate, this.params.cover.bears);
    this.sheds = spec.taxa.map((t) => (spec.forms[t.form].kind === 'plant' && t.height !== undefined && (spec.forms[t.form].behave?.layer ?? 'canopy') === 'canopy' ? shedsWood(spec.forms[t.form]) : { trunks: false, branches: false }));
    this.grids = this.coverGrids();
    this.tones = spec.taxa.map((t) => hashString(t.id) & 255);
    this.fullReach = this.params.reach.full;
    this.nearReach = this.params.reach.near;
    this.shrubFrom = this.params.plants.shrubs?.least_m ?? Infinity;
    // Pick a native canopy tree (preferring broadleaf) for field corners & hedgerows when people farm here.
    let bestTree = -1;
    let bestScore = -1;
    spec.taxa.forEach((t, idx) => {
      const form = spec.forms[t.form];
      if (!form || form.kind !== 'plant' || (form.behave?.layer ?? 'canopy') !== 'canopy') return;
      const h = t.height ?? 10;
      if (h < 3 || h > 35) return;
      const broad = Object.values(form.parts).some((pt) => pt && (pt.type === 'broadleaf' || pt.type === 'shrub')) ? 2 : 1;
      const score = broad * (0.5 + t.weight);
      if (score > bestScore) {
        bestScore = score;
        bestTree = idx;
      }
    });
    this.fieldTreeTaxon = bestTree;
  }

  /** What the ground is, as an image: as fine as asked for. */
  mask(size: number): { data: Uint8Array; box: [number, number, number, number] } {
    return { data: coverMask(this.cover, size, EXTENT), box: [-EXTENT, -EXTENT, EXTENT, EXTENT] };
  }

  /** What people made of the ground, as an image: R crops, G pasture, B yards, A paddies. Undefined where there are no people. */
  fields(size: number): { data: Uint8Array; box: [number, number, number, number] } | undefined {
    return this.landUse ? { data: landUseMask(this.landUse, size, EXTENT), box: [-EXTENT, -EXTENT, EXTENT, EXTENT] } : undefined;
  }

  /**
   * How much of the land was worked beyond the scene's own settlements, coarsely, as an image `half` metres each way about
   * its middle: R crops, G pasture, A paddies, as shares (settlement/v11.ts, farLand). The shader lays it out in patches
   * beyond the plan's own map and across a band at its edge. Its shares are scaled to agree, on the average, with what the
   * plan lays out in the cells the scene holds whole, so that the two meet without a step in how much is worked.
   * Undefined where the scene has no people, or its spec no far cells.
   */
  farFields(size: number, half: number): { data: Uint8Array; box: [number, number, number, number]; scale: number } | undefined {
    const far = this.spec.people && farLand(this.spec);
    if (!far || !this.landUse || !this.people) return undefined;
    const origin = this.spec.site.origin;
    const scale = farScale(far, this.people, this.landUse, origin, EXTENT);
    return { data: farLandMask(far, origin, size, half, scale), box: [-half, -half, half, half], scale };
  }

  /**
   * Country paths between settlements, internal village/town streets (paved avenues and dirt lanes), and central market
   * plazas, as one terrain-draped mesh laid slightly above the ground, broken where it would cross water.
   */
  paths(): { vertices: ArrayBuffer; indices: Uint32Array } | undefined {
    const plan = this.people;
    if (!plan || (!plan.paths.length && !plan.streets.length && !plan.lanes.length)) return undefined;
    const water = this.levelAt ?? (() => this.look.water);
    const m = new Mesh(8192);
    m.entity = this.pathEntity();
    const ribbon = (line: number[], width: number, lift: number, step: number, mat: number, tint: number): void => {
      const half = width * 0.5;
      m.mat = mat;
      m.tint = tint;
      let last: [number, number] | undefined;
      let along = 0;
      for (let q = 0; q + 3 < line.length; q += 2) {
        const ax = line[q];
        const ay = line[q + 1];
        const dx = line[q + 2] - ax;
        const dy = line[q + 3] - ay;
        const d = Math.hypot(dx, dy);
        if (!(d > 0)) continue;
        const nx = -dy / d;
        const ny = dx / d;
        const n = Math.max(1, Math.ceil(d / step));
        for (let k = q ? 1 : 0; k <= n; k++) {
          const x = ax + (dx * k) / n;
          const y = ay + (dy * k) / n;
          const lx = x + nx * half;
          const ly = y + ny * half;
          const rx = x - nx * half;
          const ry = y - ny * half;
          const lz = this.ground.at(lx, ly);
          const rz = this.ground.at(rx, ry);
          const dry = Math.abs(x) < EXTENT && Math.abs(y) < EXTENT && Math.min(lz, rz) - water(x, y) > 0.25;
          const w = along + (d * k) / n;
          if (!dry) {
            last = undefined;
            continue;
          }
          const a = m.v(lx, ly, lz + lift, 0, 0, 1, -half, w);
          const b = m.v(rx, ry, rz + lift, 0, 0, 1, half, w);
          if (last) m.quad(last[0], last[1], b, a);
          last = [a, b];
        }
        along += d;
      }
    };
    // 1. Inter-settlement country roads: warm compacted earth/loess.
    if (plan.pathWidth > 0) {
      for (const line of plan.paths) ribbon(line, plan.pathWidth, 0.12, 4, MAT.sand, 92);
    }
    // 2. Farming settlement lanes: main through-lanes, branching side lanes, and courtyard footways.
    for (const lane of plan.lanes) {
      if (lane.line.length < 4) continue;
      const isMain = lane.width >= 3.5;
      const isSide = !isMain && lane.width >= 2.2;
      ribbon(lane.line, lane.width, isMain ? 0.115 : isSide ? 0.108 : 0.1, isMain ? 3.5 : 2.8, MAT.sand, isMain ? 92 : isSide ? 82 : 74);
    }
    // 3. Internal town & planned streets: weathered stone avenues and compacted earth lanes within 9 km of scene centre,
    //    as many as a great city has.
    let streetCount = 0;
    for (const st of plan.streets) {
      if (st.line.length < 4 || streetCount >= 30000) continue;
      if (Math.hypot(st.line[0], st.line[1]) > 9000 && plan.streets.length > 600) continue;
      ribbon(st.line, st.width, st.paved ? 0.11 : 0.1, 3.5, st.paved ? MAT.paving : MAT.sand, st.paved ? 92 : 76);
      streetCount++;
    }
    // 4. Paved central market/civic square pads in nearby towns and non-lane nucleated settlements.
    m.mat = MAT.paving;
    m.tint = 86;
    for (const s of plan.settlements) {
      if (s.boundary || s.houses < 8 || s.pattern === 'foragers' || s.pattern === 'herders' || Math.hypot(s.x, s.y) > 2400) continue;
      const cz = this.ground.at(s.x, s.y);
      if (cz - water(s.x, s.y) <= 0.35) continue;
      const rad = Math.min(9.5, 5.5 + Math.sqrt(s.houses) * 0.35);
      const sides = 8;
      const lift = 0.095;
      let allDry = true;
      const pts: [number, number, number][] = [];
      for (let i = 0; i < sides; i++) {
        const a = (TAU * i) / sides;
        const px = s.x + Math.cos(a) * rad;
        const py = s.y + Math.sin(a) * rad;
        const pz = this.ground.at(px, py);
        if (Math.abs(px) >= EXTENT || Math.abs(py) >= EXTENT || pz - water(px, py) <= 0.25) {
          allDry = false;
          break;
        }
        pts.push([px, py, pz]);
      }
      if (!allDry) continue;
      const cIdx = m.v(s.x, s.y, cz + lift, 0, 0, 1, 0, 0);
      const ring = pts.map(([px, py, pz]) => m.v(px, py, pz + lift, 0, 0, 1, px - s.x, py - s.y));
      for (let i = 0; i < sides; i++) m.tri(cIdx, ring[i], ring[(i + 1) % sides]);
    }
    const { vertices, indices } = m.arrays();
    return indices.length ? { vertices, indices } : undefined;
  }

  /**
   * Continuous terrain-conforming perimeter walls, battlements, watchtowers, roofed gatehouses, and moats for all
   * walled/enclosed villages and towns in the scene. Each perimeter carries its own entity ID for provenance picking.
   */
  walls(): { vertices: ArrayBuffer; indices: Uint32Array } | undefined {
    const plan = this.people;
    if (!plan?.perimeters.length) return undefined;
    const m = new Mesh(8192);
    const base = this.perimeterBase();
    plan.perimeters.forEach((pr, pi) => {
      buildPerimeterMesh(m, { ...pr, entity: base + pi }, this.ground);
    });
    const { vertices, indices } = m.arrays();
    return indices.length ? { vertices, indices } : undefined;
  }

  /**
   * Physical 3D fieldworks draped on terrain around the scene focus: earthen bunds, stone walls, hedges, dikes,
   * irrigation ditches, and contour-following hillside terrace retaining risers, plus field-edge & village shade trees.
   */
  fieldworks(radius = 800): { vertices: ArrayBuffer; indices: Uint32Array } | undefined {
    const plan = this.people;
    if (!plan || !this.landUse || !this.plots || plan.lifeway.fields === 'none' || plan.lifeway.fields === 'pasture') return undefined;
    const water = this.levelAt ?? (() => this.look.water);
    // Centre around the nearest farming settlement to the scene origin (0, 0) within 1600 m, else (0, 0).
    let cx = 0;
    let cy = 0;
    let bestD = 1600;
    for (const s of plan.settlements) {
      if (s.fields === 'none' || s.fields === 'pasture' || s.houses <= 0) continue;
      const d = Math.hypot(s.x, s.y);
      if (d < bestD) {
        bestD = d;
        cx = s.x;
        cy = s.y;
      }
    }
    // Avoid placing 3D fieldworks inside settlement built cores, on paved roads/paths/lanes, or in water.
    const nearSett = plan.settlements.filter((s) => Math.hypot(s.x - cx, s.y - cy) < radius + s.r + 30);
    const nearLines = plan.paths.filter((ln) => ln.length >= 4 && Math.hypot(ln[0] - cx, ln[1] - cy) < radius + 1200);
    const laneGround = new LaneGround(plan.lanes);
    const avoid = (x: number, y: number): boolean => {
      if (this.ground.at(x, y) - water(x, y) < 0.4) return true;
      if (laneGround.near(x, y, 2.5)) return true;
      for (const s of nearSett) {
        const rr = s.r + 6;
        if ((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) < rr * rr) return true;
      }
      for (const ln of nearLines) {
        for (let q = 0; q + 3 < ln.length; q += 2) {
          const ax = ln[q];
          const ay = ln[q + 1];
          const bx = ln[q + 2];
          const by = ln[q + 3];
          const dx = bx - ax;
          const dy = by - ay;
          const l2 = dx * dx + dy * dy;
          if (l2 < 1e-4) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
          const px = ax + dx * t - x;
          const py = ay + dy * t - y;
          if (px * px + py * py < 16) return true;
        }
      }
      return false;
    };
    const m = new Mesh(8192);
    m.entity = this.fieldworksEntity();
    const res = buildFieldworks(
      m,
      {
        style: this.plots,
        bounds: plan.agriculture.bounds,
        radius,
        cx,
        cy,
        seed: this.look.seed + 509,
        avoid,
      },
      this.ground,
      this.landUse,
    );
    // Keep field-margin trees on dry ground clear of houses and roads, then add village shade trees across the nearby valley!
    const allTrees: FieldTreeSpot[] = res.trees.filter((t) => !avoid(t.x, t.y));
    const housesBySett = new Map<number, typeof plan.houses>();
    for (const h of plan.houses) {
      let list = housesBySett.get(h.settlement);
      if (!list) {
        list = [];
        housesBySett.set(h.settlement, list);
      }
      list.push(h);
    }
    const houseClear = (x: number, y: number, si: number, pad: number): boolean => {
      const list = housesBySett.get(si);
      if (!list) return true;
      for (const h of list) {
        const wide = this.houseWide[h.form * HOUSE_VARIANTS + h.variant] ?? 0;
        const r = wide * 0.55 + pad;
        if ((x - h.x) * (x - h.x) + (y - h.y) * (y - h.y) < r * r) return false;
      }
      return true;
    };
    const streetClear = (x: number, y: number, si: number, pad: number): boolean => {
      if (laneGround.near(x, y, pad)) return false;
      for (const st of plan.streets) {
        if (st.settlement !== si) continue;
        const ln = st.line;
        const thr = st.width * 0.5 + pad;
        const thr2 = thr * thr;
        for (let q = 0; q + 3 < ln.length; q += 2) {
          const ax = ln[q];
          const ay = ln[q + 1];
          const dx = ln[q + 2] - ax;
          const dy = ln[q + 3] - ay;
          const l2 = dx * dx + dy * dy;
          if (l2 < 1e-4) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
          const px = ax + dx * t - x;
          const py = ay + dy * t - y;
          if (px * px + py * py < thr2) return false;
        }
      }
      return true;
    };
    const tryVillageTree = (x: number, y: number, si: number, scale: number, u: number) => {
      if (this.ground.at(x, y) - water(x, y) < 0.5) return;
      if (!houseClear(x, y, si, 2.8) || !streetClear(x, y, si, 1.8)) return;
      allTrees.push({ x, y, scale, u });
    };
    plan.settlements.forEach((s, si) => {
      if (s.houses < 6 || s.pattern === 'foragers' || s.pattern === 'herders') return;
      if (Math.hypot(s.x, s.y) > 3000) return;
      // 4 mature shade trees framing the central plaza / civic altar corners.
      for (let k = 0; k < 4; k++) {
        const a = (k + 0.5) * (TAU / 4) + hash2(si, k, 711) * 0.25;
        const pr = 9.5 + hash2(si, k, 719) * 3.5;
        tryVillageTree(s.x + Math.cos(a) * pr, s.y + Math.sin(a) * pr, si, 0.72 + 0.3 * hash2(si, k, 727), hash2(si, k, 733));
      }
      // Scattered shade trees in open lane edges & inside/outside the village wall.
      const ringCount = Math.min(18, 6 + Math.floor(s.houses / 7));
      for (let k = 0; k < ringCount; k++) {
        const a = (TAU * (k + 0.3 * hash2(si, k, 743))) / ringCount;
        const inside = k % 3 === 0;
        const rr = inside ? s.r * (0.45 + 0.42 * hash2(si, k, 751)) : s.r + 12 + 22 * hash2(si, k, 757);
        tryVillageTree(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr, si, 0.65 + 0.5 * hash2(si, k, 761), hash2(si, k, 769));
      }
      // Flanking guardian trees just outside settlement gates.
      const pr = plan.perimeters.find((p) => p.settlement === si);
      if (pr) {
        pr.gates.forEach((gt, gi) => {
          const tx = -gt.dy;
          const ty = gt.dx;
          for (const side of [-1, 1]) {
            const gx = gt.x + gt.dx * 8.5 + tx * side * 6.5;
            const gy = gt.y + gt.dy * 8.5 + ty * side * 6.5;
            tryVillageTree(gx, gy, si, 0.78 + 0.35 * hash2(si, gi * 2 + (side > 0 ? 1 : 0), 773), hash2(si, gi, 787));
          }
        });
      }
    });
    this.fieldTrees = allTrees;
    const { vertices, indices } = m.arrays();
    return indices.length ? { vertices, indices } : undefined;
  }

  /** Packed hearth & kiln smoke plume emitters: 5 floats each [x, y, z, strength, seed]. */
  smokes(): Float32Array | undefined {
    const list = this.people?.smokes;
    if (!list?.length) return undefined;
    const out = new Float32Array(list.length * 5);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const o = i * 5;
      out[o] = s.x;
      out[o + 1] = s.y;
      out[o + 2] = s.z;
      out[o + 3] = s.strength;
      out[o + 4] = (s.seed & 0xffff) / 65536;
    }
    return out;
  }

  /** The entity of the paths and streets: after the taxa, the houses' forms, the works' pieces and the kept animals. */
  pathEntity(): number {
    return this.keptBase() + (this.spec.people?.kept?.length ?? 0);
  }

  /** The first entity of the fields' crop palette (FIELD_SLOTS consecutive IDs: cropEntity() + slotIdx). */
  cropEntity(): number {
    return this.pathEntity() + 1;
  }

  /** The first entity of the scene's continuous settlement perimeters (walls, enclosures, gatehouses). */
  perimeterBase(): number {
    return this.cropEntity() + FIELD_SLOTS;
  }

  /** The entity of physical 3D fieldworks (terraces, bunds, field walls, hedges, ditches). */
  fieldworksEntity(): number {
    return this.perimeterBase() + (this.people?.perimeters.length ?? 0);
  }

  /** The water: ribbons along the world's rivers, or the place's one sheet; with each vertex's flow and depth. */
  water(): { vertices: Float32Array; indices: Uint32Array; flow: Float32Array } {
    const own = (() => {
      if (this.waters.paths) return waterRibbons(this.waters);
      const sheet = waterSheet(this.spec, this.look);
      return { ...sheet, flow: new Float32Array((sheet.vertices.length / 3) * 3) };
    })();
    // A survey's own water, the mapped river of a settlement, is drawn with the scene's.
    return this.survey?.rings.length ? joinWater(own, surveyWaterMesh(this.survey)) : own;
  }

  /** A cell's rows, made at least to this tier. */
  cell(i: number, j: number, tier: number): CellRows {
    const k = cellKey(i, j);
    const have = this.cells.get(k);
    if (have && have.tier >= tier) return have;
    const c = this.plan.cell(i, j, tier);
    this.cells.set(k, c);
    return c;
  }

  /** A mesh of one kind of body or plant, or of a house: the same everywhere, within the tolerance. */
  mesh(proto: number): ProtoMesh {
    const { taxon, variant, detail } = protoParts(proto);
    if (taxon >= STREWN) {
      // A stone: one metre across, sized where it is sown. It is the ground's own, and the same in every scene.
      const m = new Mesh(variant & STONE_FINE ? 1024 : 256);
      m.entity = this.strewnEntity();
      drawStone(m, variant);
      const { vertices, indices } = m.arrays();
      this.meshes.set(proto, { tris: indices.length / 3 });
      return { proto, vertices, indices };
    }
    if (taxon >= CROP) {
      // One botanical archetype of the scene's seasonal crop palette, normalized to 1 m tall.
      const slotIdx = Math.min(FIELD_SLOTS - 1, Math.max(0, taxon - CROP));
      const slot = this.people?.agriculture.palette.slots[slotIdx];
      const arch = slot ? slotArchetype(slot) ?? 'cereal' : 'cereal';
      const m = new Mesh(arch === 'orchard' ? 192 : 96);
      m.entity = this.cropEntity() + slotIdx;
      drawCrop(m, this.crops!, variant, arch);
      const { vertices, indices } = m.arrays();
      this.meshes.set(proto, { tris: indices.length / 3 });
      return { proto, vertices, indices };
    }
    if (taxon >= KEPT) {
      // An animal its people kept: its taxon's body, drawn as the wild ones are.
      const t = this.spec.people!.kept![taxon - KEPT];
      const form = this.spec.people!.keptForms![t.form];
      const m = new Mesh(detail >= 2 ? 4096 : 512);
      m.entity = this.keptBase() + (taxon - KEPT);
      const stance = this.stance(t, form, variant, detail, this.keptTones[taxon - KEPT]);
      const j = drawAnimal(m, form, stance);
      const { vertices, indices } = m.arrays();
      this.meshes.set(proto, { tris: indices.length / 3 });
      return { proto, vertices, indices, idle: [...j.neck, 0, ...j.hip, 0, ...j.middle, 0, ...idling(stance.pose, stance.L), STRIDE_HIPS * stance.H] };
    }
    if (taxon >= WORK) {
      const f = this.people!.workForms[taxon - WORK];
      const m = new Mesh(detail >= 2 ? 1024 : 256);
      m.entity = this.spec.taxa.length + 1 + this.people!.forms.length + (taxon - WORK);
      // A person's limbs say how far they go with a stride, as an animal's legs do: one who walks is walked by the renderer.
      const person = f.spec.kind === 'person';
      drawWork(m, f.spec, (2 - detail) as HouseDetail, variant, person);
      const { vertices, indices } = m.arrays();
      this.meshes.set(proto, { tris: indices.length / 3 });
      return { proto, vertices, indices, ...(person ? { idle: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, personStride(f.spec.height, variant)] } : {}) };
    }
    if (taxon >= HOUSE) {
      const f = this.people!.forms[taxon - HOUSE];
      const m = new Mesh(detail >= 2 ? 2048 : 256);
      m.entity = this.spec.taxa.length + 1 + (taxon - HOUSE);
      // Detail 2 is the finest, as for bodies; a house's own scale runs the other way. A house is drawn in the shape
      // its variant picks, as wide and long as it stands for, and with its yard where it has one.
      drawDwelling(m, f.spec, (2 - detail) as HouseDetail, variant, f.grow ?? 1, f.home);
      const { vertices, indices } = m.arrays();
      this.meshes.set(proto, { tris: indices.length / 3 });
      return { proto, vertices, indices };
    }
    const t = this.spec.taxa[taxon];
    const form = this.spec.forms[t.form];
    const m = new Mesh(detail >= 2 ? 4096 : 512);
    m.entity = taxon + 1;
    if ((detail as number) === CLUMP) {
      // A clump of a low plant; or, of a tree, a piece of the wood it sheds.
      if (variant >= FALLEN) drawWood(m, form, t.height ?? 1, Math.floor((variant - FALLEN) / WOOD_SEEDS), woodSeed((variant - FALLEN) % WOOD_SEEDS), this.tones[taxon]);
      else drawClump(m, form, t.height ?? 1, (variant + 1) * 0x9e37, this.tones[taxon]);
      const { vertices, indices } = m.arrays();
      this.meshes.set(proto, { tris: indices.length / 3 });
      return { proto, vertices, indices };
    }
    // On the lighter way, a plant from a way off is the plain shapes it always was; otherwise its leaves are on cards.
    // A plant's variant is which of four it is and, above that, whether it is drawn a little way off: the same plant,
    // from the same seed, with boughs in place of its twigs and their sprays.
    if (form.kind === 'plant') drawPlant(m, form, t.height ?? 1, ((variant & 3) + 1) * 0x9e37, detail, this.tones[taxon], !this.budget.fast, (variant & COARSE) !== 0);
    else {
      const stance = this.stance(t, form, variant, detail, this.tones[taxon]);
      const j = drawAnimal(m, form, stance);
      const { vertices, indices } = m.arrays();
      this.meshes.set(proto, { tris: indices.length / 3 });
      return { proto, vertices, indices, idle: [...j.neck, 0, ...j.hip, 0, ...j.middle, 0, ...idling(stance.pose, stance.L), STRIDE_HIPS * stance.H] };
    }
    const { vertices, indices } = m.arrays();
    this.meshes.set(proto, { tris: indices.length / 3 });
    return { proto, vertices, indices };
  }

  /** The entity of what lies strewn on the ground and is no taxon's, its stones: after the fieldworks. */
  strewnEntity(): number {
    return this.fieldworksEntity() + 1;
  }

  /** The entity of the first kind of kept animal: after the taxa, the houses' forms and the works' pieces. */
  private keptBase(): number {
    return this.spec.taxa.length + 1 + (this.people?.forms.length ?? 0) + (this.people?.workForms.length ?? 0);
  }

  private stance(t: LivingTaxon, form: Form, variant: number, detail: Detail, tint: number): Stance {
    const pose = variant >> 3;
    const stride = (variant >> 1) & 3;
    return { L: t.length ?? 1, H: t.hip ?? (t.length ?? 1) * (form.hip ?? 0.3), pose, phase: (stride + 0.5) / 4, sway: (stride - 1.5) * 0.07, detail, tint, biped: (variant & 1) === 1 };
  }

  /**
   * Which mesh an individual is drawn with. One that walks a way of its own (`walks`) and was put walking is drawn
   * standing: the renderer strides its legs as it goes, where a body that stays put is caught in a stride. `coarse`:
   * a plant close by, but not so close that its twigs show.
   */
  private variantOf(t: LivingTaxon, form: Form, pose: number, phase: number, shade: number, detail: Detail, walks = false, coarse = false): number {
    if (form.kind === 'plant') return (shade & 3) | (coarse ? COARSE : 0);
    const biped = t.biped || (t.posture === 'facultative-quadruped' && pose !== POSE.graze && pose !== POSE.drink && (shade & 1) === 1);
    // From afar only how it stands shows; the far shape has only one.
    if (detail === 0) return (POSE.stand << 3) | (biped ? 1 : 0);
    if (walks && pose === POSE.walk) return (POSE.stand << 3) | (biped ? 1 : 0);
    const stride = WALKING.has(pose) ? phase >> 6 : 0;
    return (pose << 3) | (stride << 1) | (biped ? 1 : 0);
  }

  /** What to draw for a view: this is what a frame costs, and it stays within the budget. */
  select(v: LifeView, sent: Set<number>, spendMs: () => boolean = () => true): Selection {
    const taxa = this.spec.taxa;
    const K = v.height / (2 * Math.tan(v.fov / 2));
    const t = Math.tan(v.fov / 2);
    const side = t * v.aspect;
    const [ex, ey, ez] = v.eye;
    const [fx, fy, fz] = v.forward;
    const groundZ = this.ground.at(ex, ey);
    const heights = taxa.map((x) => (x.height ?? x.length ?? 1));
    const buckets = new Map<number, Bucket>();
    let pending = 0;
    let instances = 0;
    const rich = !!v.rich && !this.budget.fast;
    const cap = this.budget.instances * (rich ? 2 : 1);
    const keepR = 1400 * (rich ? 1 : this.keep);
    const R0 = keepR * keepR;
    const reachOut = Math.min(EXTENT * 1.4, Math.max(5000, v.clearance * 8 + 6000));
    const span = Math.ceil(reachOut / CELL);
    const ci = Math.floor(ex / CELL);
    const cj = Math.floor(ey / CELL);
    // Nearest first, so that a budget spent falls on what is far.
    const order: { i: number; j: number; d: number }[] = [];
    for (let j = cj - span; j <= cj + span; j++) {
      if (j < -CELLS / 2 || j >= CELLS / 2) continue;
      for (let i = ci - span; i <= ci + span; i++) {
        if (i < -CELLS / 2 || i >= CELLS / 2) continue;
        const cx = (i + 0.5) * CELL;
        const cy = (j + 0.5) * CELL;
        const dx = cx - ex;
        const dy = cy - ey;
        const dz = groundZ - ez;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > reachOut) continue;
        const r = CELL * 0.75 + 90;
        const fw = dx * fx + dy * fy + dz * fz;
        // Behind the eye, it casts no shadow worth keeping unless it is close.
        if (fw < -r && d > this.nearReach * 2) continue;
        const rt = dx * v.right[0] + dy * v.right[1] + dz * v.right[2];
        const up = dx * v.up[0] + dy * v.up[1] + dz * v.up[2];
        if (d > this.nearReach * 2) {
          if (Math.abs(rt) > fw * side + r * Math.sqrt(1 + side * side)) continue;
          if (Math.abs(up) > fw * t + r * Math.sqrt(1 + t * t)) continue;
        }
        order.push({ i, j, d });
      }
    }
    order.sort((a, b) => a.d - b.d);
    const groups: Selection['groups'] = [];
    for (const { i, j, d } of order) {
      const want = this.budget.fast ? (d < this.fullReach * 0.6 ? 1 : 0) : d < this.nearReach ? 2 : d < this.fullReach ? 1 : 0;
      const have = this.cells.get(cellKey(i, j));
      let c = have;
      if (!have || have.tier < want) {
        if (spendMs()) c = this.cell(i, j, want);
        else pending++;
      }
      if (!c) continue;
      const { place, taxon, pose, shade, phase, rank, count, movers, ways } = c;
      // The cell's animals that go a way of their own, in the order of its rows.
      let mv = 0;
      for (let q = 0; q < count; q++) {
        if (instances >= cap) break;
        while (mv < movers.length && movers[mv] < q) mv++;
        const goes = mv < movers.length && movers[mv] === q;
        const a = q * 6;
        const px = place[a];
        const py = place[a + 1];
        const pz = place[a + 2];
        const size = place[a + 3];
        const k = taxon[q];
        const dx = px - ex;
        const dy = py - ey;
        const dz = pz - ez;
        const dd = dx * dx + dy * dy + dz * dz;
        const tall = heights[k] * size;
        const pxs2 = (tall * tall * K * K) / dd;
        // Under about a pixel and a half it is left to the eye, and the ground's colour.
        if (pxs2 < 2.25) continue;
        // The same individuals at every distance: further off, only the lowest ranks.
        if (dd > R0 && rank[q] * dd > 256 * R0) continue;
        const pxs = Math.sqrt(pxs2);
        const detail: Detail = lodDetail(pxs, rank[q] / 255, this.budget.fast, rich);
        const t0 = taxa[k];
        const form = this.spec.forms[t0.form];
        // A low plant is a mesh only close by; one as tall as a person or more, a shrub or a fern, from a way off too.
        if (form.kind === 'plant' && form.behave?.layer === 'under' && detail < (heights[k] >= this.shrubFrom ? 1 : 2)) continue;
        // A plant's twigs and their sprays are drawn only where they can be told apart: within some tens of metres.
        const coarse = form.kind === 'plant' && detail === 2 && pxs < (rich ? TWIGS_FROM / 2 : TWIGS_FROM);
        const proto = protoOf(k, this.variantOf(t0, form, pose[q], phase[q], shade[q], detail, goes && walked(ways, mv * ROUTE), coarse), detail);
        let b = buckets.get(proto);
        if (!b) {
          const buf = new ArrayBuffer(INSTANCE_STRIDE * 64);
          b = { f: new Float32Array(buf), s: new Uint16Array(buf), n: 0 };
          buckets.set(proto, b);
        }
        if ((b.n + 1) * INSTANCE_STRIDE > b.f.byteLength) {
          const buf = new ArrayBuffer(b.f.byteLength * 2);
          new Uint8Array(buf).set(new Uint8Array(b.f.buffer));
          b.f = new Float32Array(buf);
          b.s = new Uint16Array(buf);
        }
        const o = b.n * 7;
        b.f[o] = px;
        b.f[o + 1] = py;
        b.f[o + 2] = pz;
        b.f[o + 3] = size;
        b.f[o + 4] = place[a + 4];
        b.f[o + 5] = place[a + 5];
        b.s[b.n * 14 + 12] = k + 1;
        b.s[b.n * 14 + 13] = form.kind === 'plant' ? shade[q] >> 2 : shade[q] >> 3;
        if (goes) keepWay(b, ways, mv * ROUTE);
        b.n++;
        instances++;
      }
      // The houses of the cell: the same at every distance, as the bodies are, further off only the lowest ranks.
      const hs = this.houseCells.get(cellKey(i, j));
      if (hs && this.people) {
        for (const hi of hs) {
          if (instances >= cap) break;
          const h = this.people.houses[hi];
          const dx = h.x - ex;
          const dy = h.y - ey;
          const dz = h.z - ez;
          const dd = dx * dx + dy * dy + dz * dz;
          const shape = h.form * HOUSE_VARIANTS + h.variant;
          const tall = this.houseTops[shape] * h.size;
          const pxs2 = (tall * tall * K * K) / dd;
          // A house is left out where it is too small to see: less than a pixel tall and, as its roof shows from above,
          // less than a pixel across half its width. A low house round a court is wider than tall many times over.
          const wide = 0.5 * this.houseWide[shape] * h.size;
          if (pxs2 < 1 && (wide * wide * K * K) / dd < 1) continue;
          if (dd > R0 * 4 && h.rank * dd > 1024 * R0) continue;
          const pxs = Math.sqrt(pxs2);
          const detail: Detail = lodDetail(pxs, h.rank / 255, this.budget.fast, false, 80, 10, 30);
          const proto = protoOf(HOUSE + h.form, h.variant, detail);
          let b = buckets.get(proto);
          if (!b) {
            const buf = new ArrayBuffer(INSTANCE_STRIDE * 64);
            b = { f: new Float32Array(buf), s: new Uint16Array(buf), n: 0 };
            buckets.set(proto, b);
          }
          if ((b.n + 1) * INSTANCE_STRIDE > b.f.byteLength) {
            const buf = new ArrayBuffer(b.f.byteLength * 2);
            new Uint8Array(buf).set(new Uint8Array(b.f.buffer));
            b.f = new Float32Array(buf);
            b.s = new Uint16Array(buf);
          }
          const o = b.n * 7;
          b.f[o] = h.x;
          b.f[o + 1] = h.y;
          b.f[o + 2] = h.z;
          b.f[o + 3] = h.size;
          b.f[o + 4] = Math.sin(h.face);
          b.f[o + 5] = Math.cos(h.face);
          b.s[b.n * 14 + 12] = this.spec.taxa.length + 1 + h.form;
          b.s[b.n * 14 + 13] = h.rank >> 3;
          b.n++;
          instances++;
        }
      }
      // The pieces of the towns' works in the cell: walls, gates and towers stay in view as far as they can be made out.
      const ws = this.workCells.get(cellKey(i, j));
      if (ws && this.people) {
        for (const wi of ws) {
          if (instances >= cap) break;
          const w = this.people.works[wi];
          const dx = w.x - ex;
          const dy = w.y - ey;
          const dz = w.z - ez;
          const dd = dx * dx + dy * dy + dz * dz;
          const tall = this.workTops[w.form];
          const pxs2 = (tall * tall * K * K) / dd;
          // A landmark or activity prop is kept as far as it makes out a readable silhouette (~1.8 px for people/boats).
          const small = smallWork(this.people.workForms[w.form].spec.kind);
          if (pxs2 < (small ? 3.24 : 1)) continue;
          const pxs = Math.sqrt(pxs2);
          const detail: Detail = lodDetail(pxs, ((wi * 37) & 255) / 255, this.budget.fast, false, 80, 10, 30);
          const variant = w.variant ?? wi % WORK_VARIANTS;
          const proto = protoOf(WORK + w.form, variant, detail);
          let b = buckets.get(proto);
          if (!b) {
            const buf = new ArrayBuffer(INSTANCE_STRIDE * 64);
            b = { f: new Float32Array(buf), s: new Uint16Array(buf), n: 0 };
            buckets.set(proto, b);
          }
          if ((b.n + 1) * INSTANCE_STRIDE > b.f.byteLength) {
            const buf = new ArrayBuffer(b.f.byteLength * 2);
            new Uint8Array(buf).set(new Uint8Array(b.f.buffer));
            b.f = new Float32Array(buf);
            b.s = new Uint16Array(buf);
          }
          const o = b.n * 7;
          b.f[o] = w.x;
          b.f[o + 1] = w.y;
          b.f[o + 2] = w.z;
          b.f[o + 3] = 1;
          b.f[o + 4] = Math.sin(w.face);
          b.f[o + 5] = Math.cos(w.face);
          b.s[b.n * 14 + 12] = this.spec.taxa.length + 1 + this.people.forms.length + w.form;
          b.s[b.n * 14 + 13] = (wi * 37) & 31;
          // A person who goes about goes a way of their own.
          if (w.way !== undefined) keepWay(b, this.people.ways, w.way);
          b.n++;
          instances++;
        }
      }
      // The animals people kept, in the cell: drawn as the wild ones are, the same at every distance, fewer further off.
      const ks = this.keptCells.get(cellKey(i, j));
      const kept = this.spec.people?.kept;
      if (ks && this.people && kept) {
        const base = this.keptBase();
        for (const ai of ks) {
          if (instances >= cap) break;
          const a = this.people.animals[ai];
          const t0 = kept[a.kind];
          const form = this.spec.people!.keptForms![t0.form];
          const dx = a.x - ex;
          const dy = a.y - ey;
          const dz = a.z - ez;
          const dd = dx * dx + dy * dy + dz * dz;
          const tall = (t0.length ?? 1) * a.size;
          const pxs2 = (tall * tall * K * K) / dd;
          if (pxs2 < 2.25) continue;
          if (dd > R0 && a.rank * dd > 256 * R0) continue;
          const pxs = Math.sqrt(pxs2);
          const detail: Detail = lodDetail(pxs, a.rank / 255, this.budget.fast, rich);
          const proto = protoOf(KEPT + a.kind, this.variantOf(t0, form, a.pose, a.phase, a.shade, detail, a.way !== undefined && walked(this.people.ways, a.way)), detail);
          let b = buckets.get(proto);
          if (!b) {
            const buf = new ArrayBuffer(INSTANCE_STRIDE * 64);
            b = { f: new Float32Array(buf), s: new Uint16Array(buf), n: 0 };
            buckets.set(proto, b);
          }
          if ((b.n + 1) * INSTANCE_STRIDE > b.f.byteLength) {
            const buf = new ArrayBuffer(b.f.byteLength * 2);
            new Uint8Array(buf).set(new Uint8Array(b.f.buffer));
            b.f = new Float32Array(buf);
            b.s = new Uint16Array(buf);
          }
          const o = b.n * 7;
          b.f[o] = a.x;
          b.f[o + 1] = a.y;
          b.f[o + 2] = a.z;
          b.f[o + 3] = a.size;
          b.f[o + 4] = Math.sin(a.face);
          b.f[o + 5] = Math.cos(a.face);
          b.s[b.n * 14 + 12] = base + a.kind;
          b.s[b.n * 14 + 13] = a.shade >> 3;
          if (a.way !== undefined) keepWay(b, this.people.ways, a.way);
          b.n++;
          instances++;
        }
      }
      // Names for what is close: the first of each group.
      if (d < this.fullReach * 0.6) {
        for (let g = 0; g + 3 < c.groups.length; g += 4) {
          const k = c.groups[g + 3];
          const hip = taxa[k].hip ?? (taxa[k].length ?? 1) * 0.3;
          const named: NamedGroup = { taxon: k, at: [c.groups[g], c.groups[g + 1]], base: c.groups[g + 2], top: c.groups[g + 2] + hip * 1.5 };
          // Its first one's way, if it goes one: found among the cell's movers, which are in the order of its rows.
          const row = c.leaders[g >> 2];
          let lo = 0;
          let hi: number = c.movers.length - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (c.movers[mid] === row) {
              named.way = Array.from(c.ways.subarray(mid * ROUTE, (mid + 1) * ROUTE));
              named.face = [c.place[row * 6 + 4], c.place[row * 6 + 5]];
              break;
            }
            if (c.movers[mid] < row) lo = mid + 1;
            else hi = mid - 1;
          }
          groups.push(named);
        }
      }
    }
    // Field-corner and hedgerow trees: scattered native canopy trees framing farmed parcel boundaries.
    if (this.fieldTreeTaxon >= 0 && this.fieldTrees.length) {
      const k = this.fieldTreeTaxon;
      const t0 = taxa[k];
      const form = this.spec.forms[t0.form];
      const baseH = heights[k];
      for (let ti = 0; ti < this.fieldTrees.length && instances < cap; ti++) {
        const ft = this.fieldTrees[ti];
        const pz = this.ground.at(ft.x, ft.y);
        const dx = ft.x - ex;
        const dy = ft.y - ey;
        const dz = pz - ez;
        const dd = dx * dx + dy * dy + dz * dz;
        const size = ft.scale * (0.55 + 0.3 * ft.u);
        const tall = baseH * size;
        const pxs2 = (tall * tall * K * K) / dd;
        if (pxs2 < 2.25) continue;
        const fw = dx * fx + dy * fy + dz * fz;
        if (fw < -tall) continue;
        const pxs = Math.sqrt(pxs2);
        const detail: Detail = lodDetail(pxs, ft.u, this.budget.fast, rich);
        const coarse = detail === 2 && pxs < (rich ? TWIGS_FROM / 2 : TWIGS_FROM);
        const shade = Math.floor(ft.u * 255);
        const proto = protoOf(k, this.variantOf(t0, form, 0, 0, shade, detail, false, coarse), detail);
        let b = buckets.get(proto);
        if (!b) {
          const buf = new ArrayBuffer(INSTANCE_STRIDE * 64);
          b = { f: new Float32Array(buf), s: new Uint16Array(buf), n: 0 };
          buckets.set(proto, b);
        }
        if ((b.n + 1) * INSTANCE_STRIDE > b.f.byteLength) {
          const buf = new ArrayBuffer(b.f.byteLength * 2);
          new Uint8Array(buf).set(new Uint8Array(b.f.buffer));
          b.f = new Float32Array(buf);
          b.s = new Uint16Array(buf);
        }
        const o = b.n * 7;
        const ang = ft.u * TAU;
        b.f[o] = ft.x;
        b.f[o + 1] = ft.y;
        b.f[o + 2] = pz;
        b.f[o + 3] = size;
        b.f[o + 4] = Math.sin(ang);
        b.f[o + 5] = Math.cos(ang);
        b.s[b.n * 14 + 12] = k + 1;
        b.s[b.n * 14 + 13] = shade >> 2;
        b.n++;
        instances++;
      }
    }
    let clumps = 0;
    if (this.cover && !this.budget.fast) {
      const cover = this.groundCover(v, buckets, spendMs);
      clumps = cover.clumps;
      pending += cover.pending;
    }
    // Pay for meshes, and keep within the budget of triangles: the far share thins next time if it did not.
    const batches: Batch[] = [];
    const protos: ProtoMesh[] = [];
    let triangles = 0;
    for (const proto of [...buckets.keys()].sort((a, b) => a - b)) {
      const b = buckets.get(proto)!;
      if (!sent.has(proto)) {
        protos.push(this.mesh(proto));
        sent.add(proto);
      } else if (!this.meshes.has(proto)) this.mesh(proto);
      triangles += b.n * this.meshes.get(proto)!.tris;
      const batch: Batch = { proto, count: b.n, data: b.f.buffer.slice(0, b.n * INSTANCE_STRIDE) as ArrayBuffer };
      if (b.w) {
        // As many ways as bodies: one put in after the last way was kept has none, and stays put.
        const w = new Float32Array(b.n * ROUTE);
        w.set(b.w.subarray(0, Math.min(b.w.length, w.length)));
        batch.ways = w.buffer as ArrayBuffer;
      }
      batches.push(batch);
    }
    // A still's richer frame says nothing of what the live one can afford.
    if (!rich) {
      const next = stepKeepBudget({ keep: this.keep, belowStreak: this.belowStreak, unsettled: this.unsettled }, instances, triangles, cap, this.budget.triangles, pending > 0);
      this.keep = next.keep;
      this.belowStreak = next.belowStreak;
      this.unsettled = next.unsettled;
      if (next.needsPass) pending++;
    }
    groups.sort((a, b) => Math.hypot(a.at[0] - ex, a.at[1] - ey) - Math.hypot(b.at[0] - ex, b.at[1] - ey));
    return { batches, protos, instances, triangles, pending, clumps, groups: groups.slice(0, 64) };
  }

  /**
   * The grids the ground's cover is sown on (docs/plans/RENDERING.md, step 2): the scene's own, a finer one close to the
   * eye and a wider one that carries the cover on into the distance; and what each is sown with besides low plants. A
   * stone is sown on the grid that reaches as far as it is still drawn: the small on the one nearest the eye, the big
   * on the one that reaches furthest. A scene's stones are the more the more of its ground is gravel, and the wider the
   * coarser its sources name its grain (core/substrate.ts): how many stones a share of gravel comes to is the
   * generator's choice (scene.yaml, strewn.stones). Fallen trunks and stumps lie on the widest grid, and fallen
   * branches on the scene's own.
   */
  private coverGrids(): CoverGrid[] {
    const c = this.params.plants.clumps;
    if (!c) return [];
    const wood = !!this.params.strewn?.wood && this.sheds.some((s) => s.trunks);
    const grids: CoverGrid[] = [{ step: c.step, reach: c.reach, size: 1, trunks: wood && !c.far, branches: wood }];
    if (c.fine) grids.push({ step: c.fine.step, reach: c.fine.reach, size: 1, trunks: false, branches: false });
    if (c.far) grids.push({ step: c.far.step, reach: c.far.reach, size: c.far.size, trunks: wood, branches: false });
    const P = this.params.strewn?.stones;
    if (P && this.sort.stones && P.cover > 0) {
      const least = P.across[0];
      const most = Math.max(least, P.across[1] * Math.pow(P.coarse, this.sort.grain));
      const k = P.rarer;
      // Stones wider than d, to the square metre of ground that is all stones: C / d^k, with C such that those between
      // the least and the most cover their share of it, each about six tenths of the square of its width.
      const span = Math.abs(k - 2) < 1e-6 ? Math.log(most / least) : (Math.pow(most, 2 - k) - Math.pow(least, 2 - k)) / (2 - k);
      const C = span > 0 ? P.cover / (0.6 * k * span) : 0;
      let lo = least;
      [...grids].sort((g, h) => g.reach - h.reach).forEach((g, i, near) => {
        const hi = i === near.length - 1 ? most : Math.min(most, Math.max(lo, g.reach / P.seen));
        if (hi > lo && C > 0) g.stones = { lo, hi, per: C * (Math.pow(lo, -k) - Math.pow(hi, -k)) };
        lo = hi;
      });
    }
    return grids;
  }

  /**
   * The ground's cover close by (docs/plans/RENDERING.md, step 2): where the cover's share of low plants says, a clump of
   * one of the understory the atlas has here, on grids that stay put as the eye moves, each clump's place shaken by a
   * hash. There are up to three grids, one laid over another: the scene's own, a finer one close to the eye, where a
   * sward must close, and a coarser one of larger clumps that carries the cover on into the distance. Each thins over
   * the last third of its reach, until the ground's own colour for low plants is all there is; and there are no more
   * clumps in a view than their budget. A scene whose atlas has no understory has none.
   *
   * On the same grids, and within the same budget, stand the ground's stones, where its substrate has gravel, and under
   * trees lies the wood they shed (coverGrids).
   *
   * A grid's clumps are made a tile at a time and kept, the least lately used let go, so that a view that moves pays
   * only for the ground it comes to.
   */
  private groundCover(v: LifeView, buckets: Map<number, Bucket>, spendMs: () => boolean): { clumps: number; pending: number } {
    const c = this.params.plants.clumps;
    const rings = this.grids;
    // Nothing to sow: no low plants in the scene, no crop in its fields, no stones in its ground and no wood under its
    // trees.
    const sows = !!this.crops && !!this.landUse;
    if (!c || (this.noUnder && !sows && !rings.some((g) => g.stones || g.trunks || g.branches))) return { clumps: 0, pending: 0 };
    const cropEntity = this.cropEntity();
    const [ex, ey, ez] = v.eye;
    const gz = this.ground.at(ex, ey);
    const t = Math.tan(v.fov / 2);
    const side = t * v.aspect;
    const strewn = this.strewnEntity();
    const K = v.height / (2 * t);
    let n = 0;
    let pending = 0;
    this.coverClock++;
    // Whether the scene's own grid is drawn: from high up it is not, and the wider grid's lengths of a crop's rows
    // then stand everywhere; with it, they take over from its plants where those thin.
    const R0 = rings[0].reach;
    const ownOn = ez - gz <= R0 * 0.6;
    for (let ring = 0; ring < rings.length && n < c.most; ring++) {
      const { step, reach: R } = rings[ring];
      // From high enough up the clumps would be too small to see.
      if (ez - gz > R * 0.6) continue;
      const tile = step * COVER_TILE;
      const reachOut = R + tile * 0.71;
      const i0 = Math.floor((ex - R) / tile);
      const i1 = Math.floor((ex + R) / tile);
      const j0 = Math.floor((ey - R) / tile);
      const j1 = Math.floor((ey + R) / tile);
      for (let tj = j0; tj <= j1 && n < c.most; tj++) {
        for (let ti = i0; ti <= i1 && n < c.most; ti++) {
          // The tile: in reach, and in view with its own half-width to spare.
          const cx = (ti + 0.5) * tile - ex;
          const cy = (tj + 0.5) * tile - ey;
          if (cx * cx + cy * cy > reachOut * reachOut) continue;
          const cz = gz - ez;
          const spare = tile * 0.71 + 2;
          const fw = cx * v.forward[0] + cy * v.forward[1] + cz * v.forward[2];
          if (fw < -spare) continue;
          const rt = cx * v.right[0] + cy * v.right[1] + cz * v.right[2];
          const up = cx * v.up[0] + cy * v.up[1] + cz * v.up[2];
          if (Math.abs(rt) > fw * side + spare * Math.sqrt(1 + side * side) || Math.abs(up) > fw * t + spare * Math.sqrt(1 + t * t)) continue;
          const key = `${ring}:${ti}:${tj}`;
          let made = this.coverTiles.get(key);
          if (!made) {
            if (!spendMs()) {
              pending = 1;
              continue;
            }
            made = this.coverTile(ring, rings[ring], ti, tj);
            this.coverTiles.set(key, made);
          }
          made.used = this.coverClock;
          const { f, proto, tint, count } = made;
          for (let q = 0; q < count && n < c.most; q++) {
            const o8 = q * COVER_ROW;
            const x = f[o8];
            const y = f[o8 + 1];
            const dx = x - ex;
            const dy = y - ey;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > R) continue;
            const kind = proto[q] >> 8;
            let size = f[o8 + 3];
            let mesh = proto[q];
            if (kind >= STREWN) {
              // The eye does not stand inside a stone; and a big one has its finer mesh only where it is big on the screen.
              if (d < size) continue;
              if (mesh & (STONE_FINE << 2) && size * K < STONE_FINE_PX * Math.sqrt(d * d + (f[o8 + 2] - ez) * (f[o8 + 2] - ez))) mesh &= ~(STONE_FINE << 2);
            } else if (kind >= CROP || ((proto[q] >> 2) & 63) < FALLEN) {
              // Where the eye stands the ground is trodden: no clump within half a pace of it, and small ones just beyond.
              const trodden = d < COVER_TROD[1] ? (d - COVER_TROD[0]) / (COVER_TROD[1] - COVER_TROD[0]) : 1;
              if (trodden <= 0) continue;
              size *= trodden;
            }
            // Fewer over the last third of the way out: each has its own place in that thinning.
            const keep = d < R * 0.66 ? 1 : 1 - (d - R * 0.66) / (R * 0.34);
            if (f[o8 + 6] >= keep) continue;
            // A length of a crop's row stands where the plants of the scene's own grid do not: beyond them, and among
            // them as they thin.
            const crop = kind >= CROP && kind < STREWN;
            if (crop && ring > 0 && ownOn && d < R0 && f[o8 + 6] < (d < R0 * 0.66 ? 1 : 1 - (d - R0 * 0.66) / (R0 * 0.34))) continue;
            const reach = f[o8 + 7];
            const dz = f[o8 + 2] - ez;
            const fwd = dx * v.forward[0] + dy * v.forward[1] + dz * v.forward[2];
            if (fwd < -reach) continue;
            const rgt = dx * v.right[0] + dy * v.right[1] + dz * v.right[2];
            const upw = dx * v.up[0] + dy * v.up[1] + dz * v.up[2];
            if (Math.abs(rgt) > fwd * side + reach || Math.abs(upw) > fwd * t + reach) continue;
            let b = buckets.get(mesh);
            if (!b) {
              const buf = new ArrayBuffer(INSTANCE_STRIDE * 256);
              b = { f: new Float32Array(buf), s: new Uint16Array(buf), n: 0 };
              buckets.set(mesh, b);
            }
            if ((b.n + 1) * INSTANCE_STRIDE > b.f.byteLength) {
              const buf = new ArrayBuffer(b.f.byteLength * 2);
              new Uint8Array(buf).set(new Uint8Array(b.f.buffer));
              b.f = new Float32Array(buf);
              b.s = new Uint16Array(buf);
            }
            const o = b.n * 7;
            b.f[o] = x;
            b.f[o + 1] = y;
            b.f[o + 2] = f[o8 + 2];
            b.f[o + 3] = size;
            b.f[o + 4] = f[o8 + 4];
            b.f[o + 5] = f[o8 + 5];
            // A stone is the ground's own, and a crop belongs to its palette slot; a clump, and fallen wood, its taxon's.
            b.s[b.n * 14 + 12] = kind >= STREWN ? strewn : crop ? cropEntity + (kind - CROP) : kind + 1;
            b.s[b.n * 14 + 13] = tint[q];
            b.n++;
            n++;
          }
        }
      }
    }
    // The tiles least lately used are let go.
    if (this.coverTiles.size > COVER_KEPT) {
      const old = [...this.coverTiles.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let q = 0; q < old.length - COVER_KEPT * 0.75; q++) this.coverTiles.delete(old[q][0]);
    }
    return { clumps: n, pending };
  }

  /** How wide a clump of a taxon stands at its full size (plants.ts, clumpWidth). */
  private clumpWide(k: number): number {
    let w = this.clumpWides[k];
    if (w === undefined) {
      const t = this.spec.taxa[k];
      w = clumpWidth(this.spec.forms[t.form], t.height ?? 1);
      this.clumpWides[k] = w;
    }
    return w;
  }

  /**
   * The patch of low plants a place is in. Patches are the cells nearest to points scattered a patch apart, their edges
   * shaken so that none runs straight; every grid of the cover reads the same ones. A patch has a number that picks its
   * kind among the understory, how rank it grows, its tone, and how thick it stands here: thinner towards its edge,
   * and thin throughout where it is an opening.
   */
  private patch(x: number, y: number): { kind: number; grown: number; tone: number; thick: number; open: boolean } {
    const seed = this.look.seed + 311;
    const P = COVER_PATCH.across;
    const qx = (x + (noise(x / 1.9, y / 1.9, seed) - 0.5) * 0.6 * P) / P;
    const qy = (y + (noise(x / 1.9, y / 1.9, seed + 1) - 0.5) * 0.6 * P) / P;
    const i0 = Math.floor(qx);
    const j0 = Math.floor(qy);
    let d1 = Infinity;
    let d2 = Infinity;
    let pi = 0;
    let pj = 0;
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        const dx = i + hash2(i, j, seed + 2) - qx;
        const dy = j + hash2(i, j, seed + 3) - qy;
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          pi = i;
          pj = j;
        } else if (d < d2) d2 = d;
      }
    }
    // How far inside its patch the place is: nothing at the edge, where the next patch's point is as near.
    const inside = Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) / 0.45);
    const open = hash2(pi, pj, seed + 4) < COVER_PATCH.open;
    const thick = open ? 0.12 + 0.2 * (1 - inside) : COVER_PATCH.edge + (1 - COVER_PATCH.edge) * inside * (2 - inside);
    return { kind: hash2(pi, pj, seed + 5), grown: hash2(pi, pj, seed + 6), tone: hash2(pi, pj, seed + 7), thick, open };
  }

  /**
   * A stone at a node of a grid, if one lies there: as likely as the grid's share of the ground's stones and how stony
   * the ground is at its place say, and as wide as its number says, the small far commoner than the big.
   */
  private sowStone(rows: TileRows, stones: NonNullable<CoverGrid['stones']>, i: number, j: number, seed: number, step: number): void {
    const u = hash2(i, j, seed + 90);
    const most = stones.per * step * step;
    if (u >= most) return;
    const x = (i + hash2(i, j, seed + 91)) * step;
    const y = (j + hash2(i, j, seed + 92)) * step;
    if (u >= most * this.sort.stonyAt(x, y)) return;
    // People clear the stones from their fields and their yards.
    if (this.landUse) {
      const use = this.landUse.at(x, y);
      if (hash2(i, j, seed + 93) < Math.max(use.crop, use.yard)) return;
    }
    const k = this.params.strewn!.stones!.rarer;
    const a = Math.pow(stones.lo, -k);
    const wide = Math.pow(a - hash2(i, j, seed + 94) * (a - Math.pow(stones.hi, -k)), -1 / k);
    const variant = Math.floor(hash2(i, j, seed + 95) * STONE_VARIANTS) | (wide >= STONE_FINE_FROM ? STONE_FINE : 0);
    rows.add(x, y, this.ground.at(x, y), wide, hash2(i, j, seed + 96) * TAU, hash2(i, j, seed + 97), 2, protoOf(STREWN, variant, 2), (hash2(i, j, seed + 98) * 256) | 0);
  }

  /**
   * A piece of fallen wood at a node of a grid, if one lies there: under trees, as many to the hectare as the rule says
   * where the canopy is closed, of the kind of tree that stands over the place, where there is room for it between the
   * trunks that stand, and turned the way the ground is most level under its two ends.
   */
  private sowWood(rows: TileRows, grid: CoverGrid, cover: LandCover, x: number, y: number, i: number, j: number, seed: number): void {
    const wood = this.params.strewn!.wood!;
    const share = ((grid.step * grid.step) / 10000) * cover.canopy;
    let shape = -1;
    if (grid.trunks) {
      const u = hash2(i, j, seed + 100);
      if (u < wood.logs * share) shape = hash2(i, j, seed + 101) < 0.4 ? WOOD.broken : WOOD.log;
      else if (u < (wood.logs + wood.stumps) * share) shape = WOOD.stump;
    }
    if (shape < 0 && grid.branches && hash2(i, j, seed + 102) < wood.branches * share) shape = hash2(i, j, seed + 103) < 0.22 ? WOOD.bough : WOOD.branch;
    if (shape < 0) return;
    const k = this.plan.canopyAt(x, y, cover, hash2(i, j, seed + 104));
    if (k < 0) return;
    const trunk = shape === WOOD.log || shape === WOOD.broken || shape === WOOD.stump;
    if (trunk ? !this.sheds[k].trunks : !this.sheds[k].branches) return;
    const t = this.spec.taxa[k];
    const which = hash2(i, j, seed + 105) < 0.5 ? 0 : 1;
    const scale = 0.7 + 0.45 * hash2(i, j, seed + 106);
    const half = (woodLength(this.spec.forms[t.form], t.height ?? 1, shape, woodSeed(which)) * scale) / 2;
    // A stump stands clear of the trees that stand; a branch lies anywhere; and a trunk or a bough is tried below, each
    // way it might lie.
    // People take the wood from their fields and their yards, and burn it.
    if (this.landUse) {
      const use = this.landUse.at(x, y);
      if (hash2(i, j, seed + 110) < Math.max(use.crop, use.yard, use.pasture * 0.5)) return;
    }
    let turn = hash2(i, j, seed + 107) * TAU;
    let z = this.ground.at(x, y);
    if (shape === WOOD.stump) {
      if (!this.plan.clearOfTrees(x, y, WOOD_ROOM * 2)) return;
    } else {
      // Of four ways it might lie, an eighth of a turn apart, the one whose two ends are nearest level; and nowhere
      // that the ground falls too much along it, since it lies level whatever the ground does.
      const first = turn;
      let least = Infinity;
      for (let q = 0; q < 4; q++) {
        const a = first + (q * Math.PI) / 4;
        const dx = Math.sin(a) * half;
        const dy = Math.cos(a) * half;
        // No way that would lay it through a standing trunk: at its middle, its ends and half way to each.
        if (shape !== WOOD.branch) {
          let room = true;
          for (let e = -2; e <= 2 && room; e++) room = this.plan.clearOfTrees(x + (dx * e) / 2, y + (dy * e) / 2, WOOD_ROOM);
          if (!room) continue;
        }
        const za = this.ground.at(x + dx, y + dy);
        const zb = this.ground.at(x - dx, y - dy);
        const d = Math.abs(za - zb);
        if (d < least) {
          least = d;
          turn = a;
          z = (za + zb) / 2;
        }
      }
      if (least > WOOD_LEVEL * half * 2 + 0.05) return;
    }
    rows.add(x, y, z, scale, turn, hash2(i, j, seed + 108), half + 1, protoOf(k, FALLEN + shape * WOOD_SEEDS + which, CLUMP), (hash2(i, j, seed + 109) * 256) | 0);
  }

  /**
   * One tile of a grid of the ground's cover: every clump that stands in it, and every stone and piece of fallen wood
   * that lies in it, wherever the eye is. Where the scene's people have fields, a plot under a crop or the plough has
   * none of what grows wild, and the crop itself in rows (world/generators/people/crops.ts): a plant at a time on the
   * scene's own grid, a length of row at a time on the wider one, and none on the finest, which is there to close a
   * sward.
   */
  private coverTile(ring: number, grid: CoverGrid, ti: number, tj: number): CoverTile {
    const { step, size } = grid;
    // Each grid has its own hashes, so that no two sow the same places.
    const seed = this.look.seed + ring * 97;
    const rows = new TileRows();
    const sort = this.sort;
    const fields = this.crops && this.plots && this.landUse && this.people ? { crop: this.crops, plots: this.plots, use: this.landUse, palette: this.people.agriculture.palette } : undefined;
    const use: LandUse = { crop: 0, pasture: 0, yard: 0, paddy: 0 };
    const wood = grid.trunks || grid.branches ? this.params.strewn?.wood : undefined;
    for (let j = tj * COVER_TILE; j < (tj + 1) * COVER_TILE; j++) {
      for (let i = ti * COVER_TILE; i < (ti + 1) * COVER_TILE; i++) {
        const x = (i + hash2(i, j, seed + 71)) * step;
        const y = (j + hash2(i, j, seed + 72)) * step;
        const u = hash2(i, j, seed + 73);
        // Close by, each of the ground's materials lies in its own place, and bears there what it bears: next to
        // nothing on a crust of salt, and the climate's all on the sand beside it.
        const cover = sort.barren ? this.cover.at(x, y, sort.bearsAt(x, y)) : this.cover.at(x, y);
        if (cover.water) continue;
        // A stone, where the ground is stony: none in the bed of a dry river, whose ground is what its floods left.
        if (grid.stones && !cover.bed) this.sowStone(rows, grid.stones, i, j, seed, step);
        // Wood, where the land's cover says forest.
        if (wood && cover.canopy >= wood.canopy) this.sowWood(rows, grid, cover, x, y, i, j, seed);
        if (this.noUnder || u >= cover.low) continue;
        // A clump covers more ground than its own share of a grid, so where low plants are few there are fewer still:
        // a thin cover stays thin when the grids are fine, and a full one still closes.
        const share = cover.low * (COVER_THIN + (1 - COVER_THIN) * cover.low);
        // The patch it stands in: thick in its middle and thinner at its edge, or an opening. Where low plants have
        // most of the ground, as on a grassland, the sward closes: a patch thins little, and an opening is only thinner.
        const patch = this.patch(x, y);
        const closed = (cover.low - COVER_PATCH.sward[0]) / (COVER_PATCH.sward[1] - COVER_PATCH.sward[0]);
        const sward = closed < 0 ? 0 : closed > 1 ? 1 : closed;
        const low = share * (patch.thick + (1 - patch.thick) * sward * (patch.open ? 0.5 : 0.85));
        if (u >= low) continue;
        if (this.landUse) {
          this.landUse.at(x, y, use);
          // Among the houses the ground is trodden: little grows where feet go.
          if (hash2(i, j, seed + 78) < use.yard * 0.9) continue;
          // In a plot under a crop or the plough what grows wild is weeded out: it keeps the balks and the fallow.
          if (fields && hash2(i, j, seed + 82) < (use.crop - CROP_FROM[0]) / (CROP_FROM[1] - CROP_FROM[0])) {
            const plot = plotAt(x, y, fields.plots);
            const slot = fields.palette.slots[plotSlotIndex(plot.pick, fields.palette)];
            if (slot.state !== PLOT.fallow && plot.edge > PLOT_LOOK.balk * 0.5) continue;
          }
        }
        // Most of a patch is of its own kind, the same on every grid, and the rest whatever else grows here.
        const own = hash2(i, j, seed + 80) < COVER_PATCH.own;
        const k = this.plan.underAt(x, y, cover, own ? patch.kind : hash2(i, j, seed + 74));
        // None at all in the scene: the ground's own colour for low plants is all there is, here and everywhere.
        if (k === -1) {
          this.noUnder = true;
          continue;
        }
        // None that suits this ground.
        if (k < 0) continue;
        // A wide plant stands further from its neighbours than a grid finer than itself would sow it.
        // Each its own size, and a patch's own growth on top: ranker here, shorter there.
        const scale = (0.45 + 0.55 * hash2(i, j, seed + 77)) * size * (own ? 0.78 + 0.44 * patch.grown : 1);
        const wide = this.clumpWide(k) * scale;
        if (hash2(i, j, seed + 79) * wide * wide * COVER_CROWD > step * step) continue;
        // Its shade is half its own and half its patch's: a patch is a little greener or yellower than the next.
        const shade = Math.min(255, ((hash2(i, j, seed + 75) * 0.55 + (own ? patch.tone : hash2(i, j, seed + 81)) * 0.45) * 256) | 0);
        // Where it stands in the thinning at its grid's edge: kept while this is under what is kept there.
        rows.add(x, y, this.ground.at(x, y), scale, hash2(i, j, seed + 76) * TAU, u / low, 2, protoOf(k, shade & 3, CLUMP), shade >> 2);
      }
    }
    // The fields' crop: regional seasonal species & archetypes following each macro-domain's angled parcel rows.
    const far = size > 1;
    if (fields && (ring === 0 || far)) {
      const tile = step * COVER_TILE;
      sow(
        ti * tile,
        tj * tile,
        (ti + 1) * tile,
        (tj + 1) * tile,
        fields.plots,
        fields.crop,
        far,
        this.look.seed + 131,
        (s) => {
          fields.use.at(s.x, s.y, use);
          // The crop thins out where the fields do, at their edge; among the houses, where the ground is trodden and
          // little of it is field, none stands.
          const share = (use.crop - CROP_FROM[0]) / (CROP_FROM[1] - CROP_FROM[0]);
          if (!(share > 0) || s.u >= share) return;
          rows.put(s.x, s.y, this.ground.at(s.x, s.y), s.tall, s.dx / s.tall, s.dy / s.tall, s.u / Math.min(1, share), 2, protoOf(CROP + s.slot, s.variant, CLUMP), s.tint);
        },
        fields.palette,
      );
    }
    return rows.tile();
  }

  /**
   * What proves a scene is the same scene: its ground, who stands in the cell it is arrived at, and a mesh of its
   * first taxon. Who and which are matched exactly; where, how high and how big within the tolerance.
   */
  print(): Fingerprint {
    const parts: Part[] = this.levels.map((l, i) => ({ name: `ground.${i}`, values: l.z }));
    const [fx, fy] = this.plan.focus;
    parts.push(...cellParts(this.cell(Math.floor(fx / CELL), Math.floor(fy / CELL), 2)));
    if (this.spec.taxa.length) {
      const t = this.spec.forms[this.spec.taxa[0].form];
      const m = this.mesh(protoOf(0, t.kind === 'plant' ? 0 : POSE.stand << 3, 2));
      parts.push(...meshParts(m.vertices, m.indices));
    }
    return fingerprint(parts);
  }
}

