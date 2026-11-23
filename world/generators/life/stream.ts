// A scene as it is looked at: the ground, then whichever cells a view needs, then which individuals to draw
// and at what detail. The same code runs in a browser's worker, in the build and in the tests. A frame's cost
// depends on what is on the screen and is bounded by a budget, not on how much lives in the scene.
import type { Form } from '../../../core/form.ts';
import type { LivingTaxon, SceneSpec } from '../../../core/scene.ts';
import { GroundSampler, type GroundGridData } from '../city/ground.ts';
import { fingerprint, type Fingerprint, type Part } from '../../../core/fingerprint.ts';
import { MAT, Mesh, meshParts } from '../city/kit.ts';
import { hash2, hashString, TAU } from '../city/math.ts';
import { drawAnimal, drawClump, drawPlant, POSE, type Detail, type Stance } from './forms.ts';
import { banksOf, CELL, CELLS, cellParts, cellKey, coverMask, EXTENT, groundGrids, LandCover, makePlan, placeLook, waterLevels, waterRibbons, waterSheet, watersFor, type CellRows, type LivingParams, type LivingPlan, type PlaceLook } from './scene/v9.ts';
import { freshOf, type Waters } from './land.ts';
import { drawDwelling, HOUSE_VARIANTS, houseSize, type HouseDetail } from '../people/dwellings.ts';
import { LandUseMap, landUseMask, makeSettlement, type SettlementPlan } from '../people/settlement/v3.ts';
import { drawWork, smallWork, WORK_VARIANTS, workTop } from '../people/works.ts';

/** Where houses start among a scene's kinds of mesh: a taxon's number is below it, a house's dwelling above. */
export const HOUSE = 0x4000;
/** Where the pieces of a town's works start, above the houses: a length of wall, a tower, a gate, a length of water. */
export const WORK = 0x6000;
/** Where the animals people kept start, above the works: each kind the scene's husbandry names (ScenePeople.kept). */
export const KEPT = 0x7000;

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
  /** each cell's kept animals, by their place in the plan; and each kind's tone */
  private keptCells = new Map<number, number[]>();
  private keptTones: number[] = [];

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
    // a few metres above the sea, a delta or a lower plain, is a scene of the sea (scene/v9.ts, sea_below), and among the
    // most crowded land there was.
    let clearing: ((x: number, y: number) => number) | undefined;
    if (spec.people) {
      // People keep their houses and fields out of a river's bed, dry in the month or not: its floods come down it.
      const water = (waters.paths?.some((p) => p.dry) ? waterLevels(waters, true) : levelAt) ?? (() => this.look.water);
      this.people = makeSettlement(spec, this.ground, water, EXTENT);
      const use = new LandUseMap(this.people, this.ground, water, this.look.seed);
      this.landUse = use;
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
    if (form.kind === 'plant') drawPlant(m, form, t.height ?? 1, (variant + 1) * 0x9e37, detail, this.tones[taxon], !this.budget.fast);
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

  /** Which mesh an individual is drawn with. */
  private variantOf(t: LivingTaxon, form: Form, pose: number, phase: number, shade: number, detail: Detail): number {
    if (form.kind === 'plant') return shade & 3;
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
        const proto = protoOf(k, this.variantOf(t0, form, pose[q], phase[q], shade[q], detail), detail);
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
    const clumps = this.cover && !this.budget.fast ? this.groundCover(v, buckets) : 0;
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
   * one of the understory the atlas has here, on a grid that stays put as the eye moves, its place shaken by a hash; fewer
   * over the last third of the way out, until the ground's own colour for low plants is all there is; and no more than
   * the clumps' own budget. A scene whose atlas has no understory has none.
   */
  private groundCover(v: LifeView, buckets: Map<number, { f: Float32Array; s: Uint16Array; n: number }>): number {
    const c = this.params.plants.clumps;
    if (!c) return 0;
    const [ex, ey, ez] = v.eye;
    const gz = this.ground.at(ex, ey);
    // From high enough up the clumps would be too small to see.
    if (ez - gz > c.reach * 0.6) return 0;
    const R = c.reach;
    const step = c.step;
    const t = Math.tan(v.fov / 2);
    const side = t * v.aspect;
    const seed = this.look.seed;
    const i0 = Math.floor((ex - R) / step);
    const i1 = Math.ceil((ex + R) / step);
    const j0 = Math.floor((ey - R) / step);
    const j1 = Math.ceil((ey + R) / step);
    let n = 0;
    for (let j = j0; j <= j1 && n < c.most; j++) {
      for (let i = i0; i <= i1 && n < c.most; i++) {
        const x = (i + hash2(i, j, seed + 71)) * step;
        const y = (j + hash2(i, j, seed + 72)) * step;
        const dx = x - ex;
        const dy = y - ey;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        // In view, with a clump's width to spare.
        const dz = gz - ez;
        const fw = dx * v.forward[0] + dy * v.forward[1] + dz * v.forward[2];
        if (fw < -2) continue;
        const rt = dx * v.right[0] + dy * v.right[1] + dz * v.right[2];
        const up = dx * v.up[0] + dy * v.up[1] + dz * v.up[2];
        if (Math.abs(rt) > fw * side + 2 || Math.abs(up) > fw * t + 2) continue;
        const keep = d < R * 0.66 ? 1 : 1 - (d - R * 0.66) / (R * 0.34);
        const u = hash2(i, j, seed + 73);
        const cover = this.cover.at(x, y);
        if (cover.water || u >= cover.low * keep) continue;
        // Among the houses the ground is trodden: little grows where feet go.
        if (this.landUse && hash2(i, j, seed + 78) < this.landUse.at(x, y).yard * 0.9) continue;
        const k = this.plan.underAt(x, y, cover, hash2(i, j, seed + 74));
        // None at all in the scene, or none that suits this ground: the ground's own colour for low plants is all there is.
        if (k === -1) return 0;
        if (k < 0) continue;
        const shade = (hash2(i, j, seed + 75) * 256) | 0;
        const proto = protoOf(k, shade & 3, CLUMP);
        let b = buckets.get(proto);
        if (!b) {
          const buf = new ArrayBuffer(INSTANCE_STRIDE * 256);
          b = { f: new Float32Array(buf), s: new Uint16Array(buf), n: 0 };
          buckets.set(proto, b);
        }
        if ((b.n + 1) * INSTANCE_STRIDE > b.f.byteLength) {
          const buf = new ArrayBuffer(b.f.byteLength * 2);
          new Uint8Array(buf).set(new Uint8Array(b.f.buffer));
          b.f = new Float32Array(buf);
          b.s = new Uint16Array(buf);
        }
        const a = hash2(i, j, seed + 76) * TAU;
        const o = b.n * 7;
        b.f[o] = x;
        b.f[o + 1] = y;
        b.f[o + 2] = this.ground.at(x, y);
        b.f[o + 3] = 0.45 + 0.55 * hash2(i, j, seed + 77);
        b.f[o + 4] = Math.sin(a);
        b.f[o + 5] = Math.cos(a);
        b.s[b.n * 14 + 12] = k + 1;
        b.s[b.n * 14 + 13] = shade >> 2;
        b.n++;
        n++;
      }
    }
    return n;
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

