// A living scene on the GPU. A worker makes the ground once, and for each view which cells it needs and who to
// draw; each kind of mesh goes up once, and everyone drawn with it is a few numbers. What it costs depends on the
// screen. Each taxon is one entity, dated by its rows or its record, so that a taxon the time on the slider does
// not reach is not drawn; and the ground, one cell and one mesh are hashed here, to match the build's where it has one.
import type { CityStructure } from '../../../core/city.ts';
import { printCheck, settlePrint, type Fingerprint, type PrintCheck } from '../../../core/fingerprint.ts';
import { defaultLeaf, LEAF_KINDS, type LeafKindName } from '../../../core/leaves.ts';
import { lookup, type Scenario } from '../../../core/scenario.ts';
import type { LivingTaxon, SceneSpec } from '../../../core/scene.ts';
import { GroundSampler } from '../../../world/generators/city/ground.ts';
import { Heights, placeLook, type LivingParams } from '../../../world/generators/life/scene/v14.ts';
import { snowOf } from '../../../world/generators/life/climate.ts';
import { declination, MID_DAY } from '../../../core/water.ts';
import { FIELD_SLOTS } from '../../../core/plots.ts';
import { meanBears } from '../../../world/generators/life/sorting.ts';
import { HOUSE, KEPT, protoParts, STREWN, type NamedGroup, type ProtoMesh } from '../../../world/generators/life/stream.ts';
import { ROUTE, wayAt } from '../../../world/generators/life/routines.ts';
import { CityRenderer, SHARE_STEPS, type CityFrame, type LocalRenderer, type MeshHandle } from '../gl/city.ts';
import type { GL } from '../gl/context.ts';
import type { V3 } from '../mat.ts';
import { groundLook, groundTones, rockLook } from './groundlook.ts';
import { fieldStyle, type FromLifeWorker, type PeopleSummary, type ToLifeWorker } from './lifeworker.ts';
import { Skyline } from './skyline.ts';
import { shadowFocusFor, type LocalView } from './view.ts';

const TIMELESS = 2e7;

/** One renderer per quality mode for all of a viewer's living scenes: a new place should not compile its shaders again. */
const renderersFull = new WeakMap<GL, Promise<LocalRenderer>>();
const renderersFast = new WeakMap<GL, Promise<LocalRenderer>>();
/** Which scene has the renderer now. */
const owners = new WeakMap<LocalRenderer, LifeScene>();

/** The leaves a plant's part holds when its form does not say: as the part types draw them (world/generators/life/forms.ts). */
const LEAVES_OF: Record<string, string> = { conifer: 'needle', whorled: 'needle', 'scale-tree': 'needle', broadleaf: 'broad', shrub: 'broad', palm: 'frond', fern: 'frond', tuft: 'frond', mat: 'frond' };

/**
 * What covers the ground close by, from the scene's taxa: the share of its canopy, by weight, whose leaves are needles,
 * for the colour of what lies under its trees; whether it has any low plants, whose clumps then cover the ground near
 * the eye; and its canopy's two commonest kinds of leaf, by weight, which are what lies fallen under it.
 */
function groundCover(spec: SceneSpec): [number, boolean, { first: LeafKindName; next: LeafKindName; share: number } | undefined] {
  let needles = 0;
  let all = 0;
  let under = false;
  const kinds = new Map<LeafKindName, number>();
  for (const t of spec.taxa) {
    const form = spec.forms[t.form];
    if (form?.kind !== 'plant' || t.height === undefined) continue;
    const layer = form.behave?.layer ?? 'canopy';
    if (layer === 'under') under = true;
    if (layer !== 'canopy') continue;
    const w = 0.1 + t.weight;
    all += w;
    const part = Object.values(form.parts).find((p) => p && LEAVES_OF[p.type]);
    if (!part) continue;
    if (((part.mat as string | undefined) ?? LEAVES_OF[part.type]) === 'needle') needles += w;
    const said = part.leaf as string | undefined;
    const kind = said && said in LEAF_KINDS ? (said as LeafKindName) : defaultLeaf(part.type, part.mat as string | undefined);
    kinds.set(kind, (kinds.get(kind) ?? 0) + w);
  }
  const most = [...kinds.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const fallen = most.length ? { first: most[0][0], next: (most[1] ?? most[0])[0], share: most[1] ? most[1][1] / (most[0][1] + most[1][1]) : 0 } : undefined;
  return [all > 0 ? needles / all : 0, under, fallen];
}

/**
 * What the land bears at each of a run of heights, from the lowest ground of a scene's widest grid to its highest, where
 * the world gives the climate at a height: the shares of forest, low plants and bare ground of each height's own
 * climate, as the generator has them (Heights), for the ground beyond the plan's map.
 */
function sharesByHeight(spec: SceneSpec, far: { z: Int16Array; unit?: number; base?: number }, bears = 1): { from: number; step: number; band: number; shares: Float32Array } | undefined {
  const params = spec.generator.params as unknown as LivingParams;
  if (!spec.climate || !params.climate) return undefined;
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < far.z.length; k++) {
    const v = far.z[k];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const from = Math.max(0, lo * (far.unit ?? 0.1) + (far.base ?? 0));
  const top = hi * (far.unit ?? 0.1) + (far.base ?? 0);
  if (!(top > from + 1)) return undefined;
  const step = (top - from) / (SHARE_STEPS - 1);
  const heights = new Heights(spec);
  const shares = new Float32Array(SHARE_STEPS * 3);
  for (let k = 0; k < SHARE_STEPS; k++) {
    const g = heights.at(from + k * step);
    // As far as what the scene's ground is made of bears them (`bears`): bare ground has the rest.
    shares[k * 3] = g.forest * bears;
    shares[k * 3 + 1] = g.herb * bears;
    shares[k * 3 + 2] = 1 - (1 - g.bare) * bears;
  }
  return { from, step, band: heights.band, shares };
}

/** What a camera or a name stands on on land: the ground, or the top of the sea over it. In a scene of the sea, the ground. */
class SurfaceSampler extends GroundSampler {
  override at(x: number, y: number): number {
    const z = super.at(x, y);
    return z > 0 ? z : 0;
  }
}

export class LifeScene {
  ground!: GroundSampler;
  ready = false;
  /** the ground, a cell and a mesh, as fingerprints made here and by the build if it was there */
  plan: PrintCheck = printCheck();
  skyline = new Skyline();
  tops: Float32Array = new Float32Array(0);
  private names: CityStructure[] = [];
  /** which names are new: labels are remade only when they change */
  labelSerial = 0;
  spec!: SceneSpec;
  /** the sun's declination in the scene's month, radians, where it has one */
  get declination(): number | undefined {
    const c = this.spec?.climate;
    return c ? declination(MID_DAY[c.month - 1], c.water) : undefined;
  }
  focus: [number, number] = [0, 0];
  toRiver: [number, number] = [0, 1];
  /** the people of the scene, where it has any: what its settlements and houses are, and what they rest on */
  people?: PeopleSummary;
  waterLevel = 0;
  onChange: () => void = () => {};
  /** what the last view drew; and how many of them go a way of their own, by the visit's clock (world/generators/life/routines.ts) */
  last = { instances: 0, triangles: 0, meshes: 0, pending: 0, ms: 0, going: 0 };
  /** how long the ground took, in ms */
  groundMs = 0;
  movingInstances = false;
  private worker: Worker | null = null;
  private selected = 0;
  private waiting = false;
  private lastSent: LocalView | null = null;
  private serial = 0;
  private validSerial = 0;
  private want: LocalView | null = null;
  /** whether the last view sent asked for a still's richer frame */
  private sentRich = false;
  private active = false;
  private needsReset = false;
  private hasComplete = false;
  private partialSince = 0;
  private scenario: Scenario = {};

  /**
   * Whether the scene is of the sea, as its generator says of its place: then its floor is drawn at its depth under the
   * water, and a visitor may go down to it.
   */
  readonly sea: boolean;

  static async create(gl: GL, source: SceneSpec, expected: Fingerprint | null, opts: { fast?: boolean } = {}): Promise<LifeScene> {
    const cache = opts.fast ? renderersFast : renderersFull;
    let renderer = cache.get(gl);
    if (!renderer) {
      renderer = CityRenderer.create(gl, opts).catch(err => {
        cache.delete(gl);
        throw err;
      });
      cache.set(gl, renderer);
    }
    return new LifeScene(await renderer, source, expected, opts);
  }

  private constructor(readonly renderer: LocalRenderer, source: SceneSpec, expected: Fingerprint | null, private opts: { fast?: boolean }) {
    this.spec = source;
    this.plan.expected = expected;
    this.renderer.wild = true;
    this.sea = placeLook(source).sea;
  }

  get named(): CityStructure[] {
    return this.names;
  }

  get settled(): boolean {
    return this.ready && !this.waiting && this.last.pending === 0 && !this.moved();
  }

  /** Make the ground, and be ready to take over the renderer. */
  async load(onPreview?: () => void): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.worker = new Worker(new URL('./lifeworker.ts', import.meta.url), { type: 'module' });
      this.worker.onerror = (e) => reject(new Error(`the scene's generators failed: ${e.message} (${e.filename}:${e.lineno})`));
      this.worker.onmessage = (e: MessageEvent<FromLifeWorker>) => {
        const m = e.data;
        if (m.type === 'preview' || m.type === 'ground') {
          this.groundData = m;
          this.ground = this.sea ? new GroundSampler(m.levels) : new SurfaceSampler(m.levels);
          this.waterLevel = m.waterLevel;
          this.active = false;
          if (m.type === 'preview') {
            onPreview?.();
          } else {
            this.groundMs = m.ms;
            this.focus = m.focus;
            this.toRiver = m.toRiver;
            this.people = m.people;
            const problems = settlePrint(this.plan, m.print);
            if (problems.length) console.error(`the scene's generator made something different from the build: ${problems.join('; ')}`);
            this.ready = true;
            resolve();
          }
          this.onChange();
        } else if (m.type === 'mask') {
          this.maskData = m;
          if (this.active) {
            this.renderer.setMask(m.mask, m.maskSize, m.maskBox);
            if (m.fields && this.people) this.renderer.setFields(m.fields, m.maskSize, m.maskBox, this.fieldLook());
          }
          this.onChange();
        } else this.selection(m);
      };
      const msg: ToLifeWorker = { type: 'init', spec: this.spec, fast: !!this.opts.fast, preview: !!onPreview };
      this.worker.postMessage(msg);
    });
  }

  private groundData: Extract<FromLifeWorker, { type: 'ground' | 'preview' }> | null = null;
  private maskData: Extract<FromLifeWorker, { type: 'mask' }> | null = null;
  /** static terrain-draped meshes on the GPU: farming lanes, streets, inter-settlement paths, perimeter walls, and 3D fieldworks */
  private pathsGpu: MeshHandle | null = null;
  private wallsGpu: MeshHandle | null = null;
  private fieldworksGpu: MeshHandle | null = null;
  private heldProtos: ProtoMesh[] = [];
  private held: Extract<FromLifeWorker, { type: 'selection' }> | null = null;
  private warmWaiters: (() => void)[] = [];

  /**
   * Pre-populate an inactive scene's worker selection (protos + instance batches) for `v` before
   * swapping it onto the renderer, so the first activated frame already has its trees and settlements.
   */
  warm(v: LocalView, timeoutMs = 350): Promise<void> {
    if (!this.ready || !this.worker || this.active) return Promise.resolve();
    if (this.needsReset) {
      const reset: ToLifeWorker = { type: 'reset' };
      this.worker.postMessage(reset);
      this.validSerial = this.serial;
      this.needsReset = false;
      this.heldProtos = [];
      this.held = null;
      this.lastSent = null;
    }
    this.want = v;
    this.send();
    if (!this.waiting && this.held && this.last.pending === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const idx = this.warmWaiters.indexOf(finish);
        if (idx >= 0) this.warmWaiters.splice(idx, 1);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      this.warmWaiters.push(finish);
    });
  }

  private flushWarmWaiters(): void {
    if (!this.warmWaiters.length) return;
    const list = this.warmWaiters.slice();
    for (const fn of list) fn();
  }

  /** This scene takes over the renderer: its ground, its colours and whatever has been made for it. */
  activate(): void {
    if (this.active || !this.groundData) return;
    const r = this.renderer;
    const before = owners.get(r);
    if (before && before !== this) {
      before.active = false;
      before.needsReset = true;
      before.hasComplete = false;
      before.partialSince = 0;
    }
    owners.set(r, this);
    // Whatever meshes it handed over before have gone with the last scene: it must hand them over again
    // unless `warm()` already reset the worker and buffered fresh protos.
    if (this.needsReset) {
      const reset: ToLifeWorker = { type: 'reset' };
      this.worker?.postMessage(reset);
      this.validSerial = this.serial;
      this.needsReset = false;
      this.lastSent = null;
      this.heldProtos = [];
      this.held = null;
    }
    this.active = true;
    this.hasComplete = false;
    this.partialSince = 0;
    const g = this.groundData;
    r.sea = this.sea;
    r.clearGround();
    r.clearInstanced();
    const detail = g.type === 'ground' ? g : undefined;
    r.setGround(g.levels.map((l) => ({ ...l, url: '' })), g.levels.map((l) => l.z), detail?.normals);
    const mask = this.maskData ?? detail;
    // Outside the mask the shader uses the biome's broad cover. Let it do so everywhere during the preview.
    const box: [number, number, number, number] = mask?.maskBox ?? [0, 0, 1, 1];
    r.setMask(mask?.mask ?? new Uint8Array(4), mask?.maskSize ?? 1, box);
    // What people made of the ground, or nothing where there are no people.
    const fields = mask?.fields;
    r.setFields(fields && this.people ? fields : null, mask?.maskSize ?? 1, box, this.fieldLook());
    r.setFarFields(detail?.far && this.people ? detail.far.data : null, detail?.far?.size ?? 1, detail?.far?.box ?? [0, 0, 0, 0]);
    r.setSmokes(detail?.smokes ?? null);
    const params = this.spec.generator.params as unknown as LivingParams;
    const clim = params.cover.climates[this.spec.biome.climate];
    const cover = this.spec.biome.cover;
    // A land before plants has none of its climate's colours: only rock.
    const tones = params.cover.tones[cover.plants > 0 ? clim?.tones ?? 'plain' : 'barren'] ?? params.cover.tones.plain;
    // Where the world gives the rivers their water falls downstream, and no one level bands the banks.
    r.setWater(detail?.water.vertices ?? new Float32Array(0), detail?.water.indices ?? new Uint32Array(0), this.spec.water ? -1e4 : g.waterLevel, detail?.water.flow, tones.water);
    // What the ground is made of, where the world says: its own materials close by, and their colour in the land's from
    // afar. And the rock under it: what its outcrops and its stones are drawn of.
    const rock = rockLook(this.spec.bedrock);
    const ground = groundLook(this.spec.substrate, rock);
    // The land's shares are its climate's, as far as what its ground is made of bears them: bare ground has the rest
    // (world/generators/life/scene/v14.ts, LandCover).
    const bears = meanBears(this.spec.substrate, params.cover.bears);
    r.setLand(Float32Array.from(groundTones(['soil', 'herb', 'bare', 'canopy', 'distant'].flatMap((k) => tones[k]), ground)), [Math.min(clim?.forest ?? 0, cover.forests) * bears, Math.min(clim?.herb ?? 0, cover.plants) * bears, 1 - cover.plants * (1 - (clim?.bare ?? 1)) * bears], snowOf(this.spec), sharesByHeight(this.spec, g.levels[g.levels.length - 1], bears));
    r.setSubstrate(ground);
    r.setRock(rock);
    r.setGroundCover(...groundCover(this.spec));
    // Entities: taxa, houses, works, kept animals, paths/streets (1), crop palette slots (FIELD_SLOTS),
    // continuous perimeters (P), 3D fieldworks (1), and strewn stones (1).
    const houseKinds = (this.people?.forms.length ?? 0) + (this.people?.works.length ?? 0) + (this.people?.kept ?? 0) + 1 + FIELD_SLOTS + (this.people?.perimeters.length ?? 0) + 2;
    if (detail?.paths && !this.pathsGpu) this.pathsGpu = r.upload(detail.paths.vertices, detail.paths.indices);
    if (detail?.walls && !this.wallsGpu) this.wallsGpu = r.upload(detail.walls.vertices, detail.walls.indices);
    if (detail?.fieldworks && !this.fieldworksGpu) this.fieldworksGpu = r.upload(detail.fieldworks.vertices, detail.fieldworks.indices);
    // Continuous walls, watchtowers, gatehouses, terraces, and field walls cast crisp shadows into the shadow cascades.
    r.shadowCells = () => {
      const casters: MeshHandle[] = [];
      if (this.wallsGpu) casters.push(this.wallsGpu);
      if (this.fieldworksGpu) casters.push(this.fieldworksGpu);
      return casters;
    };
    const out = new Float32Array((this.spec.taxa.length + 1 + houseKinds) * 4);
    for (let f = 0; f < houseKinds; f++) {
      const k = (this.spec.taxa.length + 1 + f) * 4;
      out[k] = -TIMELESS;
      out[k + 1] = TIMELESS;
      out[k + 2] = 3;
      out[k + 3] = g.waterLevel;
    }
    const clamp = (x: number | null | undefined, d: number) => (x === null || x === undefined || !Number.isFinite(x) ? d : Math.max(-TIMELESS, Math.min(TIMELESS, x - this.spec.site.slice)));
    this.spec.taxa.forEach((t, i) => {
      const k = (i + 1) * 4;
      const time = lookup(t.variants, this.scenario, t.time);
      out[k] = clamp(time.start.best, -TIMELESS);
      out[k + 1] = clamp(time.end.best, TIMELESS);
      out[k + 2] = 3;
      out[k + 3] = g.waterLevel;
    });
    r.setEntities(out);
    this.selected = 0;
    if (this.heldProtos.length) {
      this.uploadProtos(this.heldProtos);
      this.heldProtos = [];
    }
    if (this.held) {
      r.setInstances(this.held.batches);
      this.hasComplete = this.held.pending === 0;
      this.held = null;
    }
  }

  private updateNames(groups: NamedGroup[]): void {
    const taxa = this.spec.taxa;
    this.names = groups.map((g) => {
      const t = taxa[g.taxon];
      return { id: t.id, label: t.label, kind: 'taxon', form: { type: 'generic' }, rings: [], at: g.at, base: g.base, time: t.time, basis: 'procedural', curated: true, rank: (t.length ?? 0) >= 2 ? 2 : 3 } as CityStructure;
    });
    this.tops = Float32Array.from(groups, (g) => g.top);
    this.homes = groups;
    this.follow(this.clock);
    this.labelSerial++;
  }

  private selection(m: Extract<FromLifeWorker, { type: 'selection' }>): void {
    this.waiting = false;
    if (m.serial <= this.validSerial) {
      if (this.active || this.warmWaiters.length > 0) this.send();
      return;
    }
    // Those among them that go somewhere: a way's ninth number is how fast.
    let going = 0;
    for (const b of m.batches) {
      if (!b.ways) continue;
      const w = new Float32Array(b.ways);
      for (let i = 8; i < w.length; i += ROUTE) if (w[i] > 0) going++;
    }
    this.movingInstances = m.batches.some(b => {
      const { taxon } = protoParts(b.proto);
      return b.count > 0 && (taxon < HOUSE || (taxon >= KEPT && taxon < STREWN) || !!b.ways);
    });
    this.last = { instances: m.instances, triangles: m.triangles, meshes: m.batches.length, pending: m.pending, ms: m.ms, going };
    if (this.active) {
      // Always upload new prototype meshes immediately so impostor baking can begin right away.
      if (m.protos.length) this.uploadProtos(m.protos);
      // When a complete selection is already on the GPU, hold off wiping batches during brief
      // time-sliced intermediate passes (`pending > 0`) so distant cells do not flash out.
      const now = performance.now();
      const defer = m.pending > 0 && this.hasComplete && (this.partialSince === 0 || now - this.partialSince < 160);
      if (defer) {
        if (this.partialSince === 0) this.partialSince = now;
      } else {
        this.renderer.setInstances(m.batches);
        if (m.pending === 0) {
          this.hasComplete = true;
          this.partialSince = 0;
        } else {
          this.partialSince = now;
        }
        this.updateNames(m.groups);
      }
      this.onChange();
      this.send();
    } else {
      // Always retain prototypes and the latest selection while inactive (even after warm() times
      // out or while parked in lifeCache), because the worker marks sent prototypes as already
      // delivered and a never-activated scene will not be reset before its first activate().
      if (m.protos.length) this.heldProtos.push(...m.protos);
      this.held = m;
      this.updateNames(m.groups);
      if (this.warmWaiters.length > 0) {
        if (m.pending === 0) this.flushWarmWaiters();
        else this.send();
      }
    }
  }

  /** the groups named, as the scene put them: where each one's first stands, and the way it goes, if it goes one */
  private homes: NamedGroup[] = [];
  /** the second of the visit's clock the last frame was drawn at */
  private clock = 0;

  /** Each name goes with the first of its group as that one goes its way, by the visit's clock (world/generators/life/routines.ts). */
  private follow(clock: number): void {
    this.clock = clock;
    for (let i = 0; i < this.homes.length && i < this.names.length; i++) {
      const g = this.homes[i];
      if (!g.way || !g.face) continue;
      const at = wayAt(g.way, 0, g.face[0], g.face[1], clock);
      const name = this.names[i];
      name.at = [g.at[0] + at.x, g.at[1] + at.y];
      name.base = g.base + at.z;
      this.tops[i] = g.top + at.z;
    }
  }

  private uploadProtos(protos: ProtoMesh[]): void {
    for (const p of protos) {
      const { taxon, variant, detail } = protoParts(p.proto);
      let treeKey: number | undefined;
      if (taxon < HOUSE && detail <= 2) {
        const t = this.spec.taxa[taxon];
        const form = t ? this.spec.forms[t.form] : undefined;
        if (form?.kind === 'plant' && (form.behave?.layer ?? 'canopy') === 'canopy') {
          treeKey = (taxon << 2) | (variant & 3);
        }
      }
      this.renderer.addInstanced(p.proto, p.vertices, p.indices, detail >= 1, p.idle, treeKey !== undefined ? { treeKey, detail } : { detail });
    }
  }

  /** Whether the view has moved enough since the last was sent to need another. */
  private moved(): boolean {
    const a = this.want;
    const b = this.lastSent;
    if (!a) return false;
    if (!b) return true;
    const dx = a.eye[0] - b.eye[0];
    const dy = a.eye[1] - b.eye[1];
    const dz = a.eye[2] - b.eye[2];
    const far = Math.max(3, a.clearance * 0.03);
    if (dx * dx + dy * dy + dz * dz > far * far) return true;
    const turn = a.forward[0] * b.forward[0] + a.forward[1] * b.forward[1] + a.forward[2] * b.forward[2];
    return turn < 0.9995 || a.height !== b.height || a.fov !== b.fov || this.renderer.still !== this.sentRich;
  }

  private send(): void {
    if (!this.ready || this.waiting || !this.worker || !this.want) return;
    if (!this.moved() && !this.last.pending) return;
    const v = this.want;
    this.lastSent = v;
    this.waiting = true;
    // A still asks for more of the scene than a live frame can afford (step 8).
    this.sentRich = this.renderer.still;
    const msg: ToLifeWorker = { type: 'view', serial: ++this.serial, view: { eye: [v.eye[0], v.eye[1], v.eye[2]], forward: [v.forward[0], v.forward[1], v.forward[2]], right: [v.right[0], v.right[1], v.right[2]], up: [v.up[0], v.up[1], v.up[2]], fov: v.fov, aspect: v.aspect, height: v.height, clearance: v.clearance, rich: this.sentRich } };
    this.worker.postMessage(msg);
  }

  /** Draw a frame. */
  render(v: LocalView, sun: V3, time: number, evidence: boolean, alpha: number, solid: boolean, outW: number, outH: number, clock = 0, renderScale = 1): void {
    if (!this.groundData) return;
    this.activate();
    this.want = v;
    this.send();
    const f: CityFrame = {
      eye: v.gpuEye,
      focus: shadowFocusFor(v),
      view: v.view,
      proj: v.proj,
      farProj: v.farProj,
      fov: v.fov,
      aspect: v.aspect,
      near: v.near,
      far: v.far,
      sun,
      time: time - this.spec.site.slice,
      evidence,
      alpha,
      solid,
      clearance: v.clearance,
      clock,
      width: outW,
      height: outH,
      renderScale,
      cssHeight: v.height,
    };
    this.follow(clock);
    const staticMeshes: MeshHandle[] = [];
    if (this.pathsGpu) staticMeshes.push(this.pathsGpu);
    if (this.wallsGpu) staticMeshes.push(this.wallsGpu);
    if (this.fieldworksGpu) staticMeshes.push(this.fieldworksGpu);
    this.renderer.render(f, staticMeshes, outW, outH);
  }

  /**
   * How the plots of the scene's fields are drawn, and how far from the eye their crop stands plant by plant (`sown`):
   * as far as the cover's own grid reaches, where the settlement generator says how a crop is drawn. Within that the
   * ground between a crop's rows is earth; beyond it, under the lengths of row the wider grid draws, the crop's colour.
   */
  private fieldLook(): { plot: number; aspect: number; kind: number; sown?: number; palette?: { slotColor: Float32Array; slotColor2: Float32Array; slotMeta: Float32Array } } {
    if (!this.people) return { plot: 0, aspect: 1, kind: 0 };
    const clumps = (this.spec.generator.params as unknown as LivingParams).plants.clumps;
    const pal = this.people.agriculture.palette;
    return { ...fieldStyle(this.people.style), sown: this.people.crops && clumps ? clumps.reach : 0, palette: { slotColor: pal.slotColor, slotColor2: pal.slotColor2, slotMeta: pal.slotMeta } };
  }

  /**
   * What is at a screen position: a taxon, a kind of house or work, a kept animal, a road/street, a regional crop slot,
   * a continuous perimeter wall/gatehouse, 3D fieldworks, or nothing.
   */
  pick(x: number, y: number): { taxon?: LivingTaxon; house?: number; work?: number; kept?: LivingTaxon; path?: boolean; crop?: boolean; cropSlot?: number; perimeter?: number; fieldworks?: boolean } {
    const e = this.renderer.pick(x, y);
    if (!e) return {};
    const made = e - this.spec.taxa.length - 1;
    const forms = this.people?.forms.length ?? 0;
    const works = this.people?.works.length ?? 0;
    const kept = this.people?.kept ?? 0;
    const perims = this.people?.perimeters.length ?? 0;
    const pathId = forms + works + kept;
    const cropBase = pathId + 1;
    const perimBase = cropBase + FIELD_SLOTS;
    const fwId = perimBase + perims;
    // A stone is the ground's own: a click on one is a click on the ground.
    if (made > fwId) return {};
    if (made === fwId) return { fieldworks: true };
    if (made >= perimBase) return { perimeter: made - perimBase };
    if (made >= cropBase) return { crop: true, cropSlot: made - cropBase };
    if (made === pathId) return { path: true };
    if (made >= forms + works) return { kept: this.spec.people?.kept?.[made - forms - works] };
    if (made >= forms) return { work: made - forms };
    if (made >= 0) return { house: made };
    return { taxon: this.spec.taxa[e - 1] };
  }

  /** Date the taxa as a scenario does: a competing claim for a first appearance moves them. */
  setScenario(s: Scenario): void {
    this.scenario = s;
    if (!this.active) return;
    const clamp = (x: number | null, d: number) => (x === null || !Number.isFinite(x) ? d : Math.max(-TIMELESS, Math.min(TIMELESS, x - this.spec.site.slice)));
    this.spec.taxa.forEach((t, i) => {
      if (!t.variants) return;
      const v = lookup(t.variants, s, t.time);
      this.renderer.setEntityTime(i + 1, clamp(v.start.best, -TIMELESS), clamp(v.end.best, TIMELESS));
    });
  }

  /** Light up every one of the taxon whose record is open. */
  select(id: string | null): void {
    if (!this.active) return;
    if (this.selected) this.renderer.setEntityFlags(this.selected, 3);
    this.selected = 0;
    if (!id) return;
    const i = this.spec.taxa.findIndex((t) => t.id === id);
    if (i >= 0) {
      this.selected = i + 1;
      this.renderer.setEntityFlags(this.selected, 3 + 8);
    }
  }

  /** The scene's taxon of a record, if it is drawn here. */
  taxonOf(id: string): LivingTaxon | undefined {
    return this.spec.taxa.find((t) => t.id === id);
  }

  stats(): { cells: number; coarse: number; fine: number; megabytes: number; instances: number; triangles: number; meshes: number; renderWidth: number; renderHeight: number; targetAllocations: number } {
    const s = this.renderer.instancedStats();
    const [renderWidth, renderHeight] = this.renderer.renderSize;
    return { cells: 0, coarse: s.meshes, fine: 0, megabytes: 0, instances: s.instances, triangles: s.triangles, meshes: s.meshes, renderWidth, renderHeight, targetAllocations: this.renderer.targetAllocations };
  }

  /** The scene is no longer wanted. */
  dispose(): void {
    this.flushWarmWaiters();
    this.worker?.terminate();
    this.worker = null;
    this.heldProtos = [];
    this.held = null;
    if (owners.get(this.renderer) === this) {
      this.renderer.setSmokes(null);
      this.renderer.shadowCells = () => [];
      this.renderer.clearGround();
      this.renderer.clearInstanced();
      owners.delete(this.renderer);
    }
    this.active = false;
    this.hasComplete = false;
    if (this.pathsGpu) this.renderer.remove(this.pathsGpu);
    if (this.wallsGpu) this.renderer.remove(this.wallsGpu);
    if (this.fieldworksGpu) this.renderer.remove(this.fieldworksGpu);
    this.pathsGpu = null;
    this.wallsGpu = null;
    this.fieldworksGpu = null;
  }
}
