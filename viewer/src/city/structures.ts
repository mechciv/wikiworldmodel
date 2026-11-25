// A settlement's recorded structures in a living scene (docs/plans/CITIES.md, decisions 1 and 10): its monuments, walls,
// roads and buildings, each from its own record or a map's element, raised by the forms of world/generators/city/forms.ts
// as Rome's were, and drawn among the scene's own houses, plants and people. The city's file and its surveyed ground
// come from the build; the meshes are made in a worker a cell at a time, fine near the eye and coarse beyond, and moved
// into the scene's metres there. Their entities follow the scene's own, each dated by its record, so moving the time
// strip raises and lowers them as it did in Rome's own scene.

import type { CityFile, CityStructure } from '../../../core/city.ts';
import { cellBox, CELL, MACRO_CELL, macroBox, macroKeyOf } from '../../../world/generators/city/cells.ts';
import type { MeshBounds2D } from '../gl/culling.ts';
import type { LocalRenderer, MeshHandle } from '../gl/renderer.ts';
import type { V3 } from '../mat.ts';
import { RefCountedPool } from './lifecycle.ts';
import { Skyline } from './skyline.ts';
import type { LocalView } from './view.ts';
import type { FromWorker, ToWorker } from './worker.ts';

/** A leaf cell (400 m) of the city's grid, with its meshes at the details made so far. */
interface Cell {
  key: number;
  box: [number, number, number, number];
  coarse?: MeshHandle;
  fine?: MeshHandle;
  /** a request is out for this detail */
  asked: [boolean, boolean];
  usedAt: number;
}

/** A quadtree macro HLOD tile (1600 m = 4 x 4 leaf cells) covering distant views and Cascade 2 shadows. */
interface MacroCell {
  key: number;
  box: [number, number, number, number];
  children: Cell[];
  gpu?: MeshHandle;
  asked: boolean;
}

type PendingUpload =
  | Extract<FromWorker, { type: 'cell' }>
  | Extract<FromWorker, { type: 'macro' }>;

/** Within this distance of the eye a leaf cell is drawn finely. */
const FINE_DISTANCE = 620;
/** Beyond this distance from a macro tile's AABB, the merged 1600 m macro HLOD replaces all 16 leaf cells. */
const MACRO_DISTANCE = 1500;
const MACRO_DISTANCE_INTERACTIVE = 1100;
/** Only build and keep leaf coarse cells within this radius of the eye; beyond it, macro HLODs cover the skyline. */
const LEAF_LOAD_DISTANCE = 2000;
/** Shadow cascades wider than this radius use macro HLOD tiles directly (Cascade 2). */
const SHADOW_MACRO_RADIUS = 2400;
/** Finely drawn cells kept, once out of range, before the oldest is let go. */
const FINE_BUDGET_BYTES = 600e6;
/** How far the eye goes before the worker is told, for which cells to make first. */
const EYE_STEP = 50;
const TIMELESS = 1e5;
const BASIS: Record<string, number> = { evidence: 0, reconstruction: 1, projection: 2, procedural: 3 };

export interface StructureBundle {
  file: CityFile;
  heights: Int16Array[];
}

/** Stable pool key for a settlement's static structure geometry at a given scene offset and quality tier. */
export function structureLayerKey(siteId: string, offset: [number, number], fast: boolean): string {
  return `${siteId}|${offset[0].toFixed(1)}|${offset[1].toFixed(1)}|${fast ? 1 : 0}`;
}

/** Minimum 2D Euclidean distance from point `(x, y)` to axis-aligned box `[x0, y0, x1, y1]`. */
function boxDist2D(box: [number, number, number, number], x: number, y: number): number {
  const dx = x < box[0] ? box[0] - x : x > box[2] ? x - box[2] : 0;
  const dy = y < box[1] ? box[1] - y : y > box[3] ? y - box[3] : 0;
  return Math.hypot(dx, dy);
}

export class StructureLayer {
  ready = false;
  /** Fixed entity base baked into vertex buffers so pooled cells can serve scenes with any `entityBase` via `uEntityOffset`. */
  readonly builtBase = 1;
  /** the structures as the scene names them: their places moved into its metres */
  named: CityStructure[] = [];
  /** how high each stands as raised, above sea level */
  tops: Float32Array = new Float32Array(0);
  /** cached wall-occlusion grid built once from `named` and `tops` */
  skyline = new Skyline();
  private cells = new Map<number, Cell>();
  private macros = new Map<number, MacroCell>();
  private worker: Worker | null = null;
  private loadPromise: Promise<void> | null = null;
  private inflight = 0;
  private frame = 0;
  private serial = 0;
  private fineBytes = 0;
  private queue: ({ kind: 'cell'; key: number; detail: number } | { kind: 'macro'; key: number })[] = [];
  private pendingUploads: PendingUpload[] = [];
  private eyeTold: [number, number] | null = null;
  private listeners = new Set<() => void>();
  onChange: () => void = () => {};

  /**
   * `offset` is where the city's point lies in the scene's metres; `first` the default entity of its first structure,
   * after the scene's own.
   */
  constructor(
    private renderer: LocalRenderer,
    readonly bundle: StructureBundle,
    readonly offset: [number, number],
    readonly first: number,
    private fast: boolean,
  ) {
    const move = (r: number[]) => r.map((v, i) => v + offset[i % 2]);
    this.named = bundle.file.structures.map((s) => ({
      ...s,
      at: [s.at[0] + offset[0], s.at[1] + offset[1]] as [number, number],
      rings: s.rings.map(move),
      ...(s.lines ? { lines: s.lines.map(move) } : {}),
    }));
  }

  get count(): number {
    return this.bundle.file.structures.length;
  }

  addListener(fn: () => void): void {
    this.listeners.add(fn);
  }

  removeListener(fn: () => void): void {
    this.listeners.delete(fn);
  }

  private notify(): void {
    this.onChange();
    for (const fn of this.listeners) fn();
  }

  load(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = new Promise<void>((resolve, reject) => {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onerror = (e) => {
        this.loadPromise = null;
        reject(new Error(`a city's structures failed: ${e.message}`));
      };
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === 'structures') {
          this.tops = m.tops;
          for (const mk of m.macros) {
            this.macros.set(mk, { key: mk, box: macroBox(mk), children: [], asked: false });
          }
          for (const key of m.cells) {
            const cell: Cell = { key, box: cellBox(key), asked: [false, false], usedAt: 0 };
            this.cells.set(key, cell);
            const mk = macroKeyOf(key);
            let macro = this.macros.get(mk);
            if (!macro) {
              macro = { key: mk, box: macroBox(mk), children: [], asked: false };
              this.macros.set(mk, macro);
            }
            macro.children.push(cell);
          }
          this.skyline = Skyline.of(this.named, this.tops, { offset: new Int32Array(1), points: new Float32Array(0), top: new Float32Array(0), valid: [0, 0] });
          this.ready = true;
          resolve();
          this.notify();
        } else if (m.type === 'cell' || m.type === 'macro') this.received(m);
      };
      const f = this.bundle.file;
      const msg: ToWorker = { type: 'structures', city: f, levels: f.ground, heights: this.bundle.heights, entityBase: this.builtBase, offset: this.offset };
      this.worker.postMessage(msg);
    });
    return this.loadPromise;
  }

  /** When each structure stood, from the scene's moment, and what it rests on: rows for the scene's entity texture. */
  entities(slice: number): Float32Array {
    const out = new Float32Array(this.count * 4);
    const clamp = (x: number | null, d: number) => (x === null || !Number.isFinite(x) ? d : Math.max(-TIMELESS, Math.min(TIMELESS, x - slice)));
    this.bundle.file.structures.forEach((s, i) => {
      out[i * 4] = clamp(s.time.start.best, -TIMELESS);
      out[i * 4 + 1] = clamp(s.time.end.best, TIMELESS);
      out[i * 4 + 2] = BASIS[s.basis] ?? 1;
      out[i * 4 + 3] = s.base;
    });
    return out;
  }

  /** The structure an entity is, if it is one of these. */
  structureOf(entity: number, first = this.first): CityStructure | undefined {
    const i = entity - first;
    return i >= 0 && i < this.count ? this.bundle.file.structures[i] : undefined;
  }

  /** The entity of a structure's record, if it is drawn here. */
  entityOf(id: string, first = this.first): number | undefined {
    const i = this.bundle.file.structures.findIndex((s) => s.id === id);
    return i >= 0 ? first + i : undefined;
  }

  private received(m: PendingUpload): void {
    this.inflight--;
    const existing = this.pendingUploads.findIndex(
      (p) => p.type === m.type && p.key === m.key && (m.type === 'macro' || (p.type === 'cell' && p.detail === m.detail)),
    );
    if (existing >= 0) this.pendingUploads[existing] = m;
    else this.pendingUploads.push(m);
    this.pump();
    this.notify();
  }

  /** Upload queued cell and macro HLOD meshes to the GPU within a per-frame time budget (always at least one). */
  private flushUploads(budgetMs: number): void {
    if (!this.pendingUploads.length) return;
    const t0 = performance.now();
    let uploaded = 0;
    while (this.pendingUploads.length > 0 && (uploaded === 0 || performance.now() - t0 < budgetMs)) {
      const m = this.pendingUploads.shift()!;
      if (m.type === 'macro') {
        const mc = this.macros.get(m.key);
        if (!mc) continue;
        const bounds: MeshBounds2D = {
          minX: mc.box[0] + this.offset[0],
          minY: mc.box[1] + this.offset[1],
          maxX: mc.box[2] + this.offset[0],
          maxY: mc.box[3] + this.offset[1],
        };
        const gpu = this.renderer.upload(m.vertices, m.indices, bounds);
        gpu.macro = true;
        if (mc.gpu) this.renderer.remove(mc.gpu);
        mc.gpu = gpu;
        uploaded++;
        continue;
      }
      const c = this.cells.get(m.key);
      if (!c) continue;
      const bounds: MeshBounds2D = {
        minX: c.box[0] + this.offset[0],
        minY: c.box[1] + this.offset[1],
        maxX: c.box[2] + this.offset[0],
        maxY: c.box[3] + this.offset[1],
      };
      const gpu = this.renderer.upload(m.vertices, m.indices, bounds);
      if (m.detail === 1) {
        if (c.fine) {
          this.fineBytes -= c.fine.bytes;
          this.renderer.remove(c.fine);
        }
        c.fine = gpu;
        this.fineBytes += gpu.bytes;
      } else {
        if (c.coarse) this.renderer.remove(c.coarse);
        c.coarse = gpu;
      }
      uploaded++;
    }
    if (this.pendingUploads.length > 0) this.notify();
  }

  private pump(): void {
    while (this.queue.length) {
      const q = this.queue.shift()!;
      this.inflight++;
      if (q.kind === 'macro') {
        this.worker!.postMessage({ type: 'macro', key: q.key, serial: ++this.serial } satisfies ToWorker);
      } else {
        this.worker!.postMessage({ type: 'cell', key: q.key, detail: q.detail, serial: ++this.serial } satisfies ToWorker);
      }
    }
  }

  /** The eye in the city's own metres. */
  private local(v: LocalView): [number, number] {
    return [v.eye[0] - this.offset[0], v.eye[1] - this.offset[1]];
  }

  /** Ask for the macro HLOD tiles and nearby leaf cells a view wants, nearest first. */
  update(v: LocalView): void {
    if (!this.ready) return;
    this.frame++;
    const [ex, ey] = this.local(v);
    const told = this.eyeTold;
    if (!told || Math.hypot(ex - told[0], ey - told[1]) > EYE_STEP) {
      this.eyeTold = [ex, ey];
      this.worker!.postMessage({ type: 'eye', at: this.eyeTold } satisfies ToWorker);
    }
    const clearance = Math.max(v.clearance, 0);
    const want: ({ kind: 'cell'; key: number; detail: number; d: number } | { kind: 'macro'; key: number; d: number })[] = [];
    for (const m of this.macros.values()) {
      const md = Math.hypot(boxDist2D(m.box, ex, ey), clearance);
      if (!m.gpu && !m.asked) {
        want.push({ kind: 'macro', key: m.key, d: md - 1e5 });
      }
      if (md > LEAF_LOAD_DISTANCE) continue;
      for (const c of m.children) {
        const d = Math.hypot((c.box[0] + c.box[2]) / 2 - ex, (c.box[1] + c.box[3]) / 2 - ey, clearance);
        if (!c.coarse && !c.asked[0]) {
          want.push({ kind: 'cell', key: c.key, detail: 0, d });
        }
        if (!this.fast && d < FINE_DISTANCE + CELL * 0.71 && !c.fine && !c.asked[1]) {
          want.push({ kind: 'cell', key: c.key, detail: 1, d: d - 2e5 });
        }
      }
    }
    want.sort((a, b) => a.d - b.d);
    for (const w of want) {
      if (w.kind === 'macro') {
        this.macros.get(w.key)!.asked = true;
        this.queue.push({ kind: 'macro', key: w.key });
      } else {
        this.cells.get(w.key)!.asked[w.detail as 0 | 1] = true;
        this.queue.push({ kind: 'cell', key: w.key, detail: w.detail });
      }
    }
    this.pump();
    this.evict();
  }

  private evict(): void {
    if (this.fineBytes < FINE_BUDGET_BYTES) return;
    const fine = [...this.cells.values()].filter((c) => c.fine).sort((a, b) => a.usedAt - b.usedAt);
    for (const c of fine) {
      if (this.fineBytes < FINE_BUDGET_BYTES * 0.8) break;
      if (c.usedAt === this.frame) continue;
      this.fineBytes -= c.fine!.bytes;
      this.renderer.remove(c.fine!);
      c.fine = undefined;
      c.asked[1] = false;
    }
  }

  /**
   * The meshes within a radius of a point of the scene, for a shadow cascade.
   * Cascade 2 (`radius >= 2400 m`) uses merged 1600 m macro HLOD tiles directly, cutting distant
   * shadow draw counts and triangles dramatically while Cascades 0/1 use fine/coarse leaf cells.
   */
  near(focus: V3, radius: number, first = this.first): MeshHandle[] {
    const out: MeshHandle[] = [];
    const fx = focus[0] - this.offset[0];
    const fy = focus[1] - this.offset[1];
    const entityOffset = first - this.builtBase;
    const useMacro = radius >= SHADOW_MACRO_RADIUS;
    const mr = radius + MACRO_CELL * 0.75;
    const lr = radius + CELL;

    for (const m of this.macros.values()) {
      const mcx = (m.box[0] + m.box[2]) / 2;
      const mcy = (m.box[1] + m.box[3]) / 2;
      if (Math.abs(mcx - fx) > mr || Math.abs(mcy - fy) > mr) continue;
      if (useMacro && m.gpu) {
        if (m.gpu.count > 0) {
          m.gpu.entityOffset = entityOffset;
          out.push(m.gpu);
        }
        continue;
      }
      let missingChild = false;
      const childOut: MeshHandle[] = [];
      for (const c of m.children) {
        const cx = (c.box[0] + c.box[2]) / 2;
        const cy = (c.box[1] + c.box[3]) / 2;
        if (Math.abs(cx - fx) > lr || Math.abs(cy - fy) > lr) continue;
        const g = radius < 1200 ? (c.fine ?? c.coarse) : (c.coarse ?? c.fine);
        if (g) {
          if (g.count > 0) {
            g.entityOffset = entityOffset;
            childOut.push(g);
          }
        } else {
          missingChild = true;
        }
      }
      if (missingChild && m.gpu) {
        if (m.gpu.count > 0) {
          m.gpu.entityOffset = entityOffset;
          out.push(m.gpu);
        }
      } else {
        for (const g of childOut) out.push(g);
      }
    }
    return out;
  }

  /**
   * The meshes in view via a 2-tier quadtree pyramid: frustum-culls 1600 m macro HLOD tiles first,
   * substituting a single macro proxy beyond `MACRO_DISTANCE` (or while child leaf cells stream in)
   * and descending to 400 m fine/coarse leaf cells close to the eye.
   */
  visible(v: LocalView, ground: (x: number, y: number) => number, first = this.first, interactive = false): MeshHandle[] {
    if (!this.ready) return [];
    this.flushUploads(interactive ? 3 : 10);
    this.update(v);
    const out: MeshHandle[] = [];
    const t = Math.tan(v.fov / 2);
    const side = t * v.aspect;
    const sSide = Math.sqrt(1 + side * side);
    const sUp = Math.sqrt(1 + t * t);
    const entityOffset = first - this.builtBase;
    const [exLocal, eyLocal] = this.local(v);
    const clearance = Math.max(0, v.clearance);
    const macroDist = interactive ? MACRO_DISTANCE_INTERACTIVE : MACRO_DISTANCE;

    for (const m of this.macros.values()) {
      const mcx = (m.box[0] + m.box[2]) / 2 + this.offset[0];
      const mcy = (m.box[1] + m.box[3]) / 2 + this.offset[1];
      const mdx = mcx - v.eye[0];
      const mdy = mcy - v.eye[1];
      const mdz = ground(mcx, mcy) + 40 - v.eye[2];
      const mfw = mdx * v.forward[0] + mdy * v.forward[1] + mdz * v.forward[2];
      const mr = MACRO_CELL * 0.75 + 90;
      if (mfw < -mr) continue;
      const mrt = mdx * v.right[0] + mdy * v.right[1] + mdz * v.right[2];
      const mup = mdx * v.up[0] + mdy * v.up[1] + mdz * v.up[2];
      if (Math.abs(mrt) > mfw * side + mr * sSide) continue;
      if (Math.abs(mup) > mfw * t + mr * sUp) continue;

      const dMin = Math.hypot(boxDist2D(m.box, exLocal, eyLocal), clearance);
      if (dMin > macroDist && m.gpu) {
        if (m.gpu.count > 0) {
          m.gpu.entityOffset = entityOffset;
          out.push(m.gpu);
        }
        continue;
      }

      // Close enough for leaf cells: check visible children, falling back cleanly to the macro tile
      // if any visible child has not finished streaming yet so zooming in never shows empty holes.
      const childOut: MeshHandle[] = [];
      let missingChild = false;
      for (const c of m.children) {
        const cx = (c.box[0] + c.box[2]) / 2 + this.offset[0];
        const cy = (c.box[1] + c.box[3]) / 2 + this.offset[1];
        const dx = cx - v.eye[0];
        const dy = cy - v.eye[1];
        const dz = ground(cx, cy) + 30 - v.eye[2];
        const fw = dx * v.forward[0] + dy * v.forward[1] + dz * v.forward[2];
        const r = CELL * 0.75 + 70;
        if (fw < -r) continue;
        const rt = dx * v.right[0] + dy * v.right[1] + dz * v.right[2];
        const up = dx * v.up[0] + dy * v.up[1] + dz * v.up[2];
        if (Math.abs(rt) > fw * side + r * sSide) continue;
        if (Math.abs(up) > fw * t + r * sUp) continue;
        const d = Math.hypot(dx, dy, clearance);
        const g = d < FINE_DISTANCE + CELL * 0.71 ? (c.fine ?? c.coarse) : (c.coarse ?? c.fine);
        if (g) {
          c.usedAt = this.frame;
          if (g.count > 0) {
            g.entityOffset = entityOffset;
            childOut.push(g);
          }
        } else {
          missingChild = true;
        }
      }
      if (missingChild && m.gpu) {
        if (m.gpu.count > 0) {
          m.gpu.entityOffset = entityOffset;
          out.push(m.gpu);
        }
      } else {
        for (const g of childOut) out.push(g);
      }
    }
    return out;
  }

  /** Everything this layer put on the GPU goes, and its worker with it. */
  dispose(): void {
    this.pendingUploads = [];
    for (const m of this.macros.values()) {
      if (m.gpu) this.renderer.remove(m.gpu);
    }
    this.macros.clear();
    for (const c of this.cells.values()) {
      if (c.coarse) this.renderer.remove(c.coarse);
      if (c.fine) this.renderer.remove(c.fine);
    }
    this.cells.clear();
    this.worker?.terminate();
    this.worker = null;
    this.loadPromise = null;
    this.listeners.clear();
    this.ready = false;
  }

  /** Whether every requested macro tile and nearby leaf cell is uploaded to the GPU. */
  get settled(): boolean {
    return this.ready && this.inflight === 0 && this.queue.length === 0 && this.pendingUploads.length === 0;
  }
}

/**
 * Per-renderer pool of `StructureLayer` instances, keyed by city + offset + quality.
 * Reuses already-built and uploaded settlement cells across time-step, month, and cached-scene swaps.
 */
export class StructureLayerPool {
  private pool = new RefCountedPool<StructureLayer>(2, (layer) => layer.dispose());

  acquire(
    renderer: LocalRenderer,
    bundle: StructureBundle,
    offset: [number, number],
    first: number,
    fast: boolean,
  ): { key: string; layer: StructureLayer } {
    const key = structureLayerKey(bundle.file.site.id, offset, fast);
    const layer = this.pool.acquire(key, () => new StructureLayer(renderer, bundle, offset, first, fast));
    return { key, layer };
  }

  release(key: string): void {
    this.pool.release(key);
  }

  dispose(): void {
    this.pool.dispose();
  }
}
