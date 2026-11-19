// The city's generators, off the main thread: the plan once, then a cell's mesh at a time. They
// are the same code as the build's, so what they make agrees with it within the tolerance of core/fingerprint.ts.
import type { CityFile, GroundLevel } from '../../../core/city.ts';
import { cellBox, CityBuilder } from '../../../world/generators/city/cells.ts';
import type { Fingerprint } from '../../../core/fingerprint.ts';
import { planPrint } from '../../../world/generators/rome/fabric/v1.ts';

export type ToWorker =
  | { type: 'init'; city: CityFile; levels: GroundLevel[]; heights: Int16Array[] }
  | { type: 'cell'; key: number; detail: number; serial: number }
  /** where the eye is, on the city's grid: the nearest cells asked for are made first */
  | { type: 'eye'; at: [number, number] };

export type FromWorker =
  | { type: 'plan'; print: Fingerprint; cells: number[]; entities: Float32Array; mask: Uint8Array; maskSize: number; maskBox: [number, number, number, number]; water: { vertices: Float32Array; indices: Uint32Array }; lots: number; lotEntity: number; treeEntity: number; crowdEntity: number; lotRegion: Uint8Array; lotType: Uint8Array; lotOffset: Int32Array; lotPoints: Float32Array; lotTop: Float32Array; tops: Float32Array }
  | { type: 'cell'; key: number; detail: number; serial: number; vertices: ArrayBuffer; indices: Uint32Array; ms: number };

let builder: CityBuilder | null = null;
const post = (m: FromWorker, transfer: Transferable[]) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'init') {
    builder = new CityBuilder(m.city, m.levels.map((g, i) => ({ ...g, z: m.heights[i] })));
    const entities = builder.entities();
    const { data, box } = builder.mask(2048);
    const water = builder.water();
    const print = planPrint(builder.plan);
    const copy = (a: Uint8Array) => a.slice();
    const lotRegion = copy(builder.plan.region);
    const lotType = copy(builder.plan.type);
    const lotOffset = builder.plan.offset.slice();
    const lotPoints = builder.plan.points.slice();
    const lotTop = builder.plan.top.slice();
    const tops = builder.tops();
    post(
      { type: 'plan', print, cells: builder.cells(), entities, mask: data, maskSize: 2048, maskBox: box, water, lots: builder.plan.lots, lotEntity: builder.lotEntity, treeEntity: builder.treeEntity, crowdEntity: builder.crowdEntity, lotRegion, lotType, lotOffset, lotPoints, lotTop, tops },
      [entities.buffer as ArrayBuffer, data.buffer as ArrayBuffer, water.vertices.buffer as ArrayBuffer, water.indices.buffer as ArrayBuffer, lotRegion.buffer as ArrayBuffer, lotType.buffer as ArrayBuffer, lotOffset.buffer as ArrayBuffer, lotPoints.buffer as ArrayBuffer, lotTop.buffer as ArrayBuffer, tops.buffer as ArrayBuffer],
    );
    return;
  }
  if (m.type === 'eye') {
    eye = m.at;
    return;
  }
  if (!builder) return;
  asked.set(m.key * 2 + m.detail, m);
  if (!making) {
    making = true;
    setTimeout(makeNext, 0);
  }
};

/** The cells asked for and not yet made, by key and detail; and where the eye is. */
const asked = new Map<number, { key: number; detail: number; serial: number }>();
let eye: [number, number] = [0, 0];
let making = false;

/**
 * Make the cell most wanted of those asked for, a fine one before any coarse and then the nearest, and come back for the
 * next once what was asked meanwhile has been heard. The scene asks for every cell it wants at once: a frame that takes
 * long, as one drawn in software does, then never keeps this waiting, and a cell newly wanted near the eye waits for
 * one other at most.
 */
function makeNext(): void {
  making = false;
  if (!builder || !asked.size) return;
  let best: { key: number; detail: number; serial: number } | null = null;
  let bestD = Infinity;
  for (const r of asked.values()) {
    const b = cellBox(r.key);
    const d = Math.hypot((b[0] + b[2]) / 2 - eye[0], (b[1] + b[3]) / 2 - eye[1]) - r.detail * 1e5;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  const m = best!;
  asked.delete(m.key * 2 + m.detail);
  const t0 = performance.now();
  const mesh = builder.build(m.key, m.detail);
  const { vertices, indices } = mesh.arrays();
  post({ type: 'cell', key: m.key, detail: m.detail, serial: m.serial, vertices, indices, ms: performance.now() - t0 }, [vertices, indices.buffer as ArrayBuffer]);
  if (asked.size) {
    making = true;
    setTimeout(makeNext, 0);
  }
}
