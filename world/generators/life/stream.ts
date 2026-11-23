// A scene as it is looked at: the ground, then whichever cells a view needs, then which individuals to draw
// and at what detail. The same code runs in a browser's worker, in the build and in the tests. A frame's cost
// depends on what is on the screen and is bounded by a budget, not on how much lives in the scene.
import type { Form } from '../../../core/form.ts';
import type { LivingTaxon, SceneSpec } from '../../../core/scene.ts';
import { GroundSampler, type GroundGridData } from '../city/ground.ts';
import { fingerprint, type Fingerprint, type Part } from '../../../core/fingerprint.ts';
import { MAT, Mesh, meshParts } from '../city/kit.ts';
import { hash2, hashString, TAU } from '../city/math.ts';
import { clumpWidth, drawAnimal, drawClump, drawPlant, POSE, type Detail, type Stance } from './forms.ts';
import { banksOf, CELL, CELLS, cellParts, cellKey, coverMask, EXTENT, groundGrids, LandCover, makePlan, placeLook, waterLevels, waterRibbons, waterSheet, watersFor, type CellRows, type LivingParams, type LivingPlan, type PlaceLook } from './scene/v10.ts';
import { freshOf, noise, type Waters } from './land.ts';
import { drawDwelling, HOUSE_VARIANTS, houseSize, type HouseDetail } from '../people/dwellings.ts';
import { LandUseMap, landUseMask, makeSettlement, type LandUse, type SettlementParams, type SettlementPlan } from '../people/settlement/v5.ts';
import { drawCrop, sow, type CropParams } from '../people/crops.ts';
import { PLOT, PLOT_LOOK, plotAt, plotStyle, type PlotStyle } from '../../../core/plots.ts';
import { drawWork, smallWork, WORK_VARIANTS, workTop } from '../people/works.ts';

/** Where houses start among a scene's kinds of mesh: a taxon's number is below it, a house's dwelling above. */
export const HOUSE = 0x4000;
/** Where the pieces of a town's works start, above the houses: a length of wall, a tower, a gate, a length of water. */
export const WORK = 0x6000;
/** Where the animals people kept start, above the works: each kind the scene's husbandry names (ScenePeople.kept). */
export const KEPT = 0x7000;
/** The crop of the fields, above the kept animals: one kind, which nobody names (world/generators/people/crops.ts). */
export const CROP = 0x7800;

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
}

export interface ProtoMesh {
  proto: number;
  vertices: ArrayBuffer;
  indices: Uint32Array;
  /**
   * How an animal's mesh idles (docs/plans/RENDERING.md, step 5): where its neck leaves its shoulders, its hips and its
   * middle, in its own frame, each followed by 0; then how far its head swings up or down from its pose and its tail from
   * side to side, in radians, and how fast it idles, in radians a second. Its vertices say what moves with what.
   */
  idle?: number[];
}

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
  /** how many clumps of low plants cover the ground close by, apart from the instances */
  clumps: number;
  /** the nearest groups, to name */
  groups: { taxon: number; at: [number, number]; base: number; top: number }[];
}

export const protoOf = (taxon: number, variant: number, detail: Detail | typeof CLUMP) => (taxon << 8) | (variant << 2) | detail;
/** A mesh's detail that is a clump of a low plant, as the ground's cover close by is drawn. */
export const CLUMP = 3;
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

/** The clumps of one tile of a grid of the ground's cover: each one's place, size, facing and place in the thinning; its mesh; its tint. */
interface CoverTile {
  f: Float32Array;
  proto: Uint32Array;
  tint: Uint16Array;
  count: number;
  used: number;
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
  readonly plan: LivingPlan;
  readonly params: LivingParams;
  readonly cover: LandCover;
  /** every cell made so far, at the most it was made */
  private cells = new Map<number, CellRows>();
  private meshes = new Map<number, { tris: number }>();
  private tones: number[];
  private keep = 1;
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
  /** the ground's cover, made a tile at a time and kept; a count of the views it was made for; and whether the scene has none */
  private coverTiles = new Map<string, CoverTile>();
  private coverClock = 0;
  private bare = false;
  private clumpWides: number[] = [];
  /** each cell's kept animals, by their place in the plan; and each kind's tone */
  private keptCells = new Map<number, number[]>();
  private keptTones: number[] = [];
  /** how the fields' crop is drawn, where the scene's people have fields and their generator says how; and their plots */
  readonly crops?: CropParams;
  private plots?: PlotStyle;

  constructor(readonly spec: SceneSpec, private budget: Budget = FULL_BUDGET) {
    this.params = spec.generator.params as unknown as LivingParams;
    this.look = placeLook(spec);
    const waters = watersFor(spec, this.look);
    this.waters = waters;
    this.levels = groundGrids(spec, this.look, waters);
    this.ground = new GroundSampler(this.levels);
    // Where the world gives the rivers, the water's level varies over the scene; otherwise it is the place's one level.
    const levelAt = waters.paths ? waterLevels(waters) : undefined;
    // The people, where the scene has any: their houses and fields, on this ground and away from this water. Where they
    // cleared the land no tree stands. A scene of the sea has them too, on whatever ground stands above its water: a place
    // a few metres above the sea, a delta or a lower plain, is a scene of the sea (scene/v10.ts, sea_below), and among the
    // most crowded land there was.
    let clearing: ((x: number, y: number) => number) | undefined;
    if (spec.people) {
      // People keep their houses and fields out of a river's bed, dry in the month or not: its floods come down it.
      const water = (waters.paths?.some((p) => p.dry) ? waterLevels(waters, true) : levelAt) ?? (() => this.look.water);
      this.people = makeSettlement(spec, this.ground, water, EXTENT);
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
    const treeless = clearing && fresh ? (x: number, y: number) => Math.max(clearing(x, y), fresh(x, y)) : (clearing ?? fresh);
    // How far each point is from the banks of the water the world gives, flowing, still or dry: what grows by water.
    const banks = banksOf(spec, waters);
    this.plan = makePlan(spec, this.ground, this.look, waters, levelAt, treeless, banks);
    this.cover = new LandCover(spec, this.ground, this.look.water, this.plan.focus, levelAt, treeless, banks);
    this.tones = spec.taxa.map((t) => hashString(t.id) & 255);
    this.fullReach = this.params.reach.full;
    this.nearReach = this.params.reach.near;
    this.shrubFrom = this.params.plants.shrubs?.least_m ?? Infinity;
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
   * The paths between the people's settlements, as one mesh laid on the ground: a ribbon along each, a hand above the
   * ground at every few metres of its way, broken where it would cross water. Undefined where the scene has none. Its
   * entity comes after the kept animals' (pathEntity).
   */
  paths(): { vertices: ArrayBuffer; indices: Uint32Array } | undefined {
    const plan = this.people;
    if (!plan?.paths.length || !(plan.pathWidth > 0)) return undefined;
    const levelAt = this.waters.paths ? waterLevels(this.waters) : undefined;
    const water = levelAt ?? (() => this.look.water);
    const half = plan.pathWidth / 2;
    const step = 4;
    const lift = 0.12;
    const m = new Mesh(4096);
    m.entity = this.pathEntity();
    // Beaten pale, and of a material the renderer lays on the ground at any distance.
    m.mat = MAT.sand;
    m.tint = 118;
    for (const line of plan.paths) {
      // Its points every few metres, then a strip between each pair that stands on dry ground.
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
    }
    const { vertices, indices } = m.arrays();
    return indices.length ? { vertices, indices } : undefined;
  }

  /** The entity of the paths: after the taxa, the houses' forms, the works' pieces and the kept animals. */
  pathEntity(): number {
    return this.keptBase() + (this.spec.people?.kept?.length ?? 0);
  }

  /** The entity of the fields' crop: after the paths. */
  cropEntity(): number {
    return this.pathEntity() + 1;
  }

  /** The water: ribbons along the world's rivers, or the place's one sheet; with each vertex's flow and depth. */
  water(): { vertices: Float32Array; indices: Uint32Array; flow: Float32Array } {
    if (this.waters.paths) return waterRibbons(this.waters);
    const sheet = waterSheet(this.spec, this.look);
    return { ...sheet, flow: new Float32Array((sheet.vertices.length / 3) * 3) };
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
    if (taxon >= CROP) {
      // The crop of the fields: a clump of it, or a length of a row, the same wherever it stands.
      const m = new Mesh(64);
      m.entity = this.cropEntity();
      drawCrop(m, this.crops!, variant);
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
      return { proto, vertices, indices, idle: [...j.neck, 0, ...j.hip, 0, ...j.middle, 0, ...idling(stance.pose, stance.L), 0] };
    }
    if (taxon >= WORK) {
      const f = this.people!.workForms[taxon - WORK];
      const m = new Mesh(detail >= 2 ? 1024 : 256);
      m.entity = this.spec.taxa.length + 1 + this.people!.forms.length + (taxon - WORK);
      drawWork(m, f.spec, (2 - detail) as HouseDetail, variant);
      const { vertices, indices } = m.arrays();
      this.meshes.set(proto, { tris: indices.length / 3 });
      return { proto, vertices, indices };
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
      drawClump(m, form, t.height ?? 1, (variant + 1) * 0x9e37, this.tones[taxon]);
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
      return { proto, vertices, indices, idle: [...j.neck, 0, ...j.hip, 0, ...j.middle, 0, ...idling(stance.pose, stance.L), 0] };
    }
    const { vertices, indices } = m.arrays();
    this.meshes.set(proto, { tris: indices.length / 3 });
    return { proto, vertices, indices };
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

  /** Which mesh an individual is drawn with. `coarse`: a plant close by, but not so close that its twigs show. */
  private variantOf(t: LivingTaxon, form: Form, pose: number, phase: number, shade: number, detail: Detail, coarse = false): number {
    if (form.kind === 'plant') return (shade & 3) | (coarse ? COARSE : 0);
    const biped = t.biped || (t.posture === 'facultative-quadruped' && pose !== POSE.graze && pose !== POSE.drink && (shade & 1) === 1);
    // From afar only how it stands shows; the far shape has only one.
    if (detail === 0) return (POSE.stand << 3) | (biped ? 1 : 0);
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
    const buckets = new Map<number, { f: Float32Array; s: Uint16Array; n: number }>();
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
      const { place, taxon, pose, shade, phase, rank, count } = c;
      for (let q = 0; q < count; q++) {
        if (instances >= cap) break;
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
        const detail: Detail = this.budget.fast ? (pxs >= 26 ? 1 : 0) : pxs >= (rich ? 36 : 70) ? 2 : pxs >= (rich ? 4 : 9) ? 1 : 0;
        const t0 = taxa[k];
        const form = this.spec.forms[t0.form];
        // A low plant is a mesh only close by; one as tall as a person or more, a shrub or a fern, from a way off too.
        if (form.kind === 'plant' && form.behave?.layer === 'under' && detail < (heights[k] >= this.shrubFrom ? 1 : 2)) continue;
        // A plant's twigs and their sprays are drawn only where they can be told apart: within some tens of metres.
        const coarse = form.kind === 'plant' && detail === 2 && pxs < (rich ? TWIGS_FROM / 2 : TWIGS_FROM);
        const proto = protoOf(k, this.variantOf(t0, form, pose[q], phase[q], shade[q], detail, coarse), detail);
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
          const detail: Detail = this.budget.fast ? (pxs >= 30 ? 1 : 0) : pxs >= 80 ? 2 : pxs >= 10 ? 1 : 0;
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
          // A wall is drawn as far as it can be made out; a person or a boat only once it is a few pixels tall.
          const small = smallWork(this.people.workForms[w.form].spec.kind);
          if (pxs2 < (small ? 16 : 1)) continue;
          const pxs = Math.sqrt(pxs2);
          const detail: Detail = this.budget.fast ? (pxs >= 30 ? 1 : 0) : pxs >= 80 ? 2 : pxs >= 10 ? 1 : 0;
          const proto = protoOf(WORK + w.form, wi % WORK_VARIANTS, detail);
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
          const detail: Detail = this.budget.fast ? (pxs >= 26 ? 1 : 0) : pxs >= (rich ? 36 : 70) ? 2 : pxs >= (rich ? 4 : 9) ? 1 : 0;
          const proto = protoOf(KEPT + a.kind, this.variantOf(t0, form, a.pose, a.phase, a.shade, detail), detail);
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
          b.n++;
          instances++;
        }
      }
      // Names for what is close: the first of each group.
      if (d < this.fullReach * 0.6) {
        for (let g = 0; g + 3 < c.groups.length; g += 4) {
          const k = c.groups[g + 3];
          const hip = taxa[k].hip ?? (taxa[k].length ?? 1) * 0.3;
          groups.push({ taxon: k, at: [c.groups[g], c.groups[g + 1]], base: c.groups[g + 2], top: c.groups[g + 2] + hip * 1.5 });
        }
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
      batches.push({ proto, count: b.n, data: b.f.buffer.slice(0, b.n * INSTANCE_STRIDE) as ArrayBuffer });
    }
    // A still's richer frame says nothing of what the live one can afford.
    if (!rich) {
      const kept = this.keep;
      if (instances >= cap || triangles > this.budget.triangles) this.keep = Math.max(0.2, this.keep * 0.8);
      else if (instances < cap * 0.6 && triangles < this.budget.triangles * 0.6) this.keep = Math.min(1, this.keep * 1.1);
      // A view the far share was changed for is not yet what it comes to rest at: the next selection of the same view
      // would draw another. It is left pending, so that a view at rest is asked for again until the share holds, and
      // what is drawn at rest does not depend on how often it was asked for. Not for ever, should the share never hold.
      if (this.keep !== kept && this.unsettled < 16) {
        this.unsettled++;
        pending++;
      } else if (this.keep === kept) this.unsettled = 0;
    }
    groups.sort((a, b) => Math.hypot(a.at[0] - ex, a.at[1] - ey) - Math.hypot(b.at[0] - ex, b.at[1] - ey));
    return { batches, protos, instances, triangles, pending, clumps, groups: groups.slice(0, 64) };
  }

  /**
   * The ground's cover close by (docs/plans/RENDERING.md, step 2): where the cover's share of low plants says, a clump of
   * one of the understory the atlas has here, on grids that stay put as the eye moves, each clump's place shaken by a
   * hash. There are up to three grids, one laid over another: the scene's own, a finer one close to the eye, where a
   * sward must close, and a coarser one of larger clumps that carries the cover on into the distance. Each thins over
   * the last third of its reach, until the ground's own colour for low plants is all there is; and there are no more
   * clumps in a view than their budget. A scene whose atlas has no understory has none.
   *
   * A grid's clumps are made a tile at a time and kept, the least lately used let go, so that a view that moves pays
   * only for the ground it comes to.
   */
  private groundCover(v: LifeView, buckets: Map<number, { f: Float32Array; s: Uint16Array; n: number }>, spendMs: () => boolean): { clumps: number; pending: number } {
    const c = this.params.plants.clumps;
    // A scene with no low plants has no cover but its fields' crop, where it has fields.
    const sows = !!this.crops && !!this.landUse;
    if (!c || (this.bare && !sows)) return { clumps: 0, pending: 0 };
    const cropEntity = this.cropEntity();
    const [ex, ey, ez] = v.eye;
    const gz = this.ground.at(ex, ey);
    const t = Math.tan(v.fov / 2);
    const side = t * v.aspect;
    const rings: { step: number; reach: number; size: number }[] = [{ step: c.step, reach: c.reach, size: 1 }];
    if (c.fine) rings.push({ step: c.fine.step, reach: c.fine.reach, size: 1 });
    if (c.far) rings.push({ step: c.far.step, reach: c.far.reach, size: c.far.size });
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
            if (this.bare && !sows) return { clumps: 0, pending: 0 };
            this.coverTiles.set(key, made);
          }
          made.used = this.coverClock;
          const { f, proto, tint, count } = made;
          for (let q = 0; q < count && n < c.most; q++) {
            const o7 = q * 7;
            const x = f[o7];
            const y = f[o7 + 1];
            const dx = x - ex;
            const dy = y - ey;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > R) continue;
            // Where the eye stands the ground is trodden: none within half a pace of it, and small ones just beyond.
            const trodden = d < COVER_TROD[1] ? (d - COVER_TROD[0]) / (COVER_TROD[1] - COVER_TROD[0]) : 1;
            if (trodden <= 0) continue;
            // Fewer over the last third of the way out: each clump has its own place in that thinning.
            const keep = d < R * 0.66 ? 1 : 1 - (d - R * 0.66) / (R * 0.34);
            if (f[o7 + 6] >= keep) continue;
            // A length of a crop's row stands where the plants of the scene's own grid do not: beyond them, and among
            // them as they thin.
            const crop = proto[q] >> 8 >= CROP;
            if (crop && ring > 0 && ownOn && d < R0 && f[o7 + 6] < (d < R0 * 0.66 ? 1 : 1 - (d - R0 * 0.66) / (R0 * 0.34))) continue;
            const dz = f[o7 + 2] - ez;
            const fwd = dx * v.forward[0] + dy * v.forward[1] + dz * v.forward[2];
            if (fwd < -2) continue;
            const rgt = dx * v.right[0] + dy * v.right[1] + dz * v.right[2];
            const upw = dx * v.up[0] + dy * v.up[1] + dz * v.up[2];
            if (Math.abs(rgt) > fwd * side + 2 || Math.abs(upw) > fwd * t + 2) continue;
            let b = buckets.get(proto[q]);
            if (!b) {
              const buf = new ArrayBuffer(INSTANCE_STRIDE * 256);
              b = { f: new Float32Array(buf), s: new Uint16Array(buf), n: 0 };
              buckets.set(proto[q], b);
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
            b.f[o + 2] = f[o7 + 2];
            b.f[o + 3] = f[o7 + 3] * trodden;
            b.f[o + 4] = f[o7 + 4];
            b.f[o + 5] = f[o7 + 5];
            b.s[b.n * 14 + 12] = crop ? cropEntity : (proto[q] >> 8) + 1;
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
   * One tile of a grid of the ground's cover: every clump that stands in it, wherever the eye is. Where the scene's
   * people have fields, a plot under a crop or the plough has none of what grows wild, and the crop itself in rows
   * (world/generators/people/crops.ts): a plant at a time on the scene's own grid, a length of row at a time on the wider
   * one, and none on the finest, which is there to close a sward.
   */
  private coverTile(ring: number, grid: { step: number; size: number }, ti: number, tj: number): CoverTile {
    const { step, size } = grid;
    // Each grid has its own hashes, so that no two sow the same places.
    const seed = this.look.seed + ring * 97;
    const f: number[] = [];
    const proto: number[] = [];
    const tint: number[] = [];
    const fields = this.crops && this.plots && this.landUse ? { crop: this.crops, plots: this.plots, use: this.landUse } : undefined;
    const use: LandUse = { crop: 0, pasture: 0, yard: 0, paddy: 0 };
    wild: for (let j = tj * COVER_TILE; j < (tj + 1) * COVER_TILE && !this.bare; j++) {
      for (let i = ti * COVER_TILE; i < (ti + 1) * COVER_TILE; i++) {
        const x = (i + hash2(i, j, seed + 71)) * step;
        const y = (j + hash2(i, j, seed + 72)) * step;
        const u = hash2(i, j, seed + 73);
        const cover = this.cover.at(x, y);
        if (cover.water || u >= cover.low) continue;
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
            if (plot.state !== PLOT.fallow && plot.edge > PLOT_LOOK.balk * 0.5) continue;
          }
        }
        // Most of a patch is of its own kind, the same on every grid, and the rest whatever else grows here.
        const own = hash2(i, j, seed + 80) < COVER_PATCH.own;
        const k = this.plan.underAt(x, y, cover, own ? patch.kind : hash2(i, j, seed + 74));
        // None at all in the scene: the ground's own colour for low plants is all there is, here and everywhere.
        if (k === -1) {
          this.bare = true;
          f.length = proto.length = tint.length = 0;
          break wild;
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
        const a = hash2(i, j, seed + 76) * TAU;
        // The last is where it stands in the thinning at its grid's edge: kept while this is under what is kept there.
        f.push(x, y, this.ground.at(x, y), scale, Math.sin(a), Math.cos(a), u / low);
        proto.push(protoOf(k, shade & 3, CLUMP));
        tint.push(shade >> 2);
      }
    }
    // The fields' crop: wherever it stands, the same from every grid's tiles; as tall as its plot's stand, its mesh's
    // own length along its row, and as wide whatever its height.
    const far = size > 1;
    if (fields && (ring === 0 || far)) {
      const tile = step * COVER_TILE;
      sow(ti * tile, tj * tile, (ti + 1) * tile, (tj + 1) * tile, fields.plots, fields.crop, far, this.look.seed + 131, (s) => {
        fields.use.at(s.x, s.y, use);
        // The crop thins out where the fields do, at their edge; among the houses, where the ground is trodden and
        // little of it is field, none stands.
        const share = (use.crop - CROP_FROM[0]) / (CROP_FROM[1] - CROP_FROM[0]);
        if (!(share > 0) || s.u >= share) return;
        f.push(s.x, s.y, this.ground.at(s.x, s.y), s.tall, s.dx / s.tall, s.dy / s.tall, s.u / Math.min(1, share));
        proto.push(protoOf(CROP, s.variant, CLUMP));
        tint.push(s.tint);
      });
    }
    return { f: Float32Array.from(f), proto: Uint32Array.from(proto), tint: Uint16Array.from(tint), count: proto.length, used: 0 };
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

