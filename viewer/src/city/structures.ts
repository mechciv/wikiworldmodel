// A settlement's recorded structures in a living scene (docs/plans/CITIES.md, decisions 1 and 10): its monuments, walls,
// roads and buildings, each from its own record or a map's element, raised by the forms of world/generators/city/forms.ts
// as Rome's were, and drawn among the scene's own houses, plants and people. The city's file and its surveyed ground
// come from the build; the meshes are made in a worker a cell at a time, fine near the eye and coarse beyond, and moved
// into the scene's metres there. Their entities follow the scene's own, each dated by its record, so moving the time
// strip raises and lowers them as it did in Rome's own scene.

import type { CityFile, CityStructure } from '../../../core/city.ts';
import { cellBox, CELL } from '../../../world/generators/city/cells.ts';
import type { MeshBounds2D } from '../gl/culling.ts';
import type { LocalRenderer, MeshHandle } from '../gl/renderer.ts';
import type { V3 } from '../mat.ts';
import { RefCountedPool } from './lifecycle.ts';
import { Skyline } from './skyline.ts';
import type { LocalView } from './view.ts';
import type { FromWorker, ToWorker } from './worker.ts';

/** A cell of the city's grid, with its meshes at the details made so far. */
interface Cell {
  key: number;
  box: [number, number, number, number];
  coarse?: MeshHandle;
  fine?: MeshHandle;
  /** a request is out for this detail */
  asked: [boolean, boolean];
  usedAt: number;
}

/** Within this distance of the eye a cell is drawn finely. */
const FINE_DISTANCE = 620;
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
  private worker: Worker | null = null;
  private loadPromise: Promise<void> | null = null;
  private inflight = 0;
  private frame = 0;
  private serial = 0;
  private fineBytes = 0;
  private queue: { key: number; detail: number }[] = [];
  private pendingUploads: Extract<FromWorker, { type: 'cell' }>[] = [];
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
          for (const key of m.cells) this.cells.set(key, { key, box: cellBox(key), asked: [false, false], usedAt: 0 });
          this.skyline = Skyline.of(this.named, this.tops, { offset: new Int32Array(1), points: new Float32Array(0), top: new Float32Array(0), valid: [0, 0] });
          this.ready = true;
          resolve();
          this.notify();
        } else if (m.type === 'cell') this.received(m);
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

  private received(m: Extract<FromWorker, { type: 'cell' }>): void {
    this.inflight--;
    const existing = this.pendingUploads.findIndex((p) => p.key === m.key && p.detail === m.detail);
    if (existing >= 0) this.pendingUploads[existing] = m;
    else this.pendingUploads.push(m);
    this.pump();
    this.notify();
  }

  /** Upload queued cell meshes to the GPU within a per-frame time budget (always at least one cell). */
  private flushUploads(budgetMs: number): void {
    if (!this.pendingUploads.length) return;
    const t0 = performance.now();
    let uploaded = 0;
    while (this.pendingUploads.length > 0 && (uploaded === 0 || performance.now() - t0 < budgetMs)) {
      const m = this.pendingUploads.shift()!;
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
      this.worker!.postMessage({ type: 'cell', key: q.key, detail: q.detail, serial: ++this.serial } satisfies ToWorker);
    }
  }

  /** The eye in the city's own metres. */
  private local(v: LocalView): [number, number] {
    return [v.eye[0] - this.offset[0], v.eye[1] - this.offset[1]];
  }

  /** Ask for the cells a view wants, the nearest first. */
  update(v: LocalView): void {
    if (!this.ready) return;
    this.frame++;
    const [ex, ey] = this.local(v);
    const told = this.eyeTold;
    if (!told || Math.hypot(ex - told[0], ey - told[1]) > EYE_STEP) {
      this.eyeTold = [ex, ey];
      this.worker!.postMessage({ type: 'eye', at: this.eyeTold } satisfies ToWorker);
    }
    const want: { key: number; detail: number; d: number }[] = [];
    for (const c of this.cells.values()) {
      const d = Math.hypot((c.box[0] + c.box[2]) / 2 - ex, (c.box[1] + c.box[3]) / 2 - ey, Math.max(v.clearance, 0));
      if (!c.coarse && !c.asked[0]) want.push({ key: c.key, detail: 0, d });
      if (!this.fast && d < FINE_DISTANCE + CELL * 0.71 && !c.fine && !c.asked[1]) want.push({ key: c.key, detail: 1, d: d - 1e5 });
    }
    want.sort((a, b) => a.d - b.d);
    for (const w of want) {
      this.cells.get(w.key)!.asked[w.detail as 0 | 1] = true;
      this.queue.push({ key: w.key, detail: w.detail });
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

  /** The meshes within a radius of a point of the scene, for a shadow's cascade. */
  near(focus: V3, radius: number, first = this.first): MeshHandle[] {
    const out: MeshHandle[] = [];
    const r = radius + CELL;
    const fx = focus[0] - this.offset[0];
    const fy = focus[1] - this.offset[1];
    const entityOffset = first - this.builtBase;
    for (const c of this.cells.values()) {
      const cx = (c.box[0] + c.box[2]) / 2;
      const cy = (c.box[1] + c.box[3]) / 2;
      if (Math.abs(cx - fx) > r || Math.abs(cy - fy) > r) continue;
      const g = radius < 1200 ? (c.fine ?? c.coarse) : (c.coarse ?? c.fine);
      if (g) {
        g.entityOffset = entityOffset;
        out.push(g);
      }
    }
    return out;
  }

  /** The meshes in view: fine near the eye, coarse beyond. `ground` is the scene's, in its own metres. */
  visible(v: LocalView, ground: (x: number, y: number) => number, first = this.first, interactive = false): MeshHandle[] {
    if (!this.ready) return [];
    this.flushUploads(interactive ? 3 : 10);
    this.update(v);
    const out: MeshHandle[] = [];
    const t = Math.tan(v.fov / 2);
    const side = t * v.aspect;
    const entityOffset = first - this.builtBase;
    for (const c of this.cells.values()) {
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
      if (Math.abs(rt) > fw * side + r * Math.sqrt(1 + side * side)) continue;
      if (Math.abs(up) > fw * t + r * Math.sqrt(1 + t * t)) continue;
      const d = Math.hypot(dx, dy, Math.max(0, v.clearance));
      const g = d < FINE_DISTANCE + CELL * 0.71 ? (c.fine ?? c.coarse) : (c.coarse ?? c.fine);
      if (g) {
        c.usedAt = this.frame;
        g.entityOffset = entityOffset;
        out.push(g);
      }
    }
    return out;
  }

  /** Everything this layer put on the GPU goes, and its worker with it. */
  dispose(): void {
    this.pendingUploads = [];
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

  /** Whether every cell has its coarse mesh, and every near one its fine mesh, uploaded to the GPU. */
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
