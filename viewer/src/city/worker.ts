// A city's records, raised off the main thread a cell at a time (world/generators/city/cells.ts), for a living scene
// that draws them among its own houses (structures.ts): their first entity follows the scene's own, and every cell's
// mesh is moved from the city's metres into the scene's.
import type { CityFile, GroundLevel } from '../../../core/city.ts';
import { cellBox, CityBuilder } from '../../../world/generators/city/cells.ts';
import { STRIDE } from '../../../world/generators/city/kit.ts';

export type ToWorker =
  /** a city's records: their first entity, and where the city's point lies in the scene's metres */
  | { type: 'structures'; city: CityFile; levels: GroundLevel[]; heights: Int16Array[]; entityBase: number; offset: [number, number] }
  | { type: 'cell'; key: number; detail: number; serial: number }
  /** where the eye is, on the city's grid: the nearest cells asked for are made first */
  | { type: 'eye'; at: [number, number] };

export type FromWorker =
  | { type: 'structures'; cells: number[]; tops: Float32Array }
  | { type: 'cell'; key: number; detail: number; serial: number; vertices: ArrayBuffer; indices: Uint32Array; ms: number };

let builder: CityBuilder | null = null;
/** where the city's point lies in the metres of the scene drawing it */
let offset: [number, number] = [0, 0];
const post = (m: FromWorker, transfer: Transferable[]) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'structures') {
    builder = new CityBuilder(m.city, m.levels.map((g, i) => ({ ...g, z: m.heights[i] })), { entityBase: m.entityBase });
    offset = m.offset;
    const tops = builder.tops();
    post({ type: 'structures', cells: builder.cells(), tops }, [tops.buffer as ArrayBuffer]);
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
  // Into the scene's metres: a vertex's position is its first three floats.
  if (offset[0] !== 0 || offset[1] !== 0) {
    const f = new Float32Array(vertices);
    const step = STRIDE / 4;
    for (let i = 0; i < f.length; i += step) {
      f[i] += offset[0];
      f[i + 1] += offset[1];
    }
  }
  post({ type: 'cell', key: m.key, detail: m.detail, serial: m.serial, vertices, indices, ms: performance.now() - t0 }, [vertices, indices.buffer as ArrayBuffer]);
  if (asked.size) {
    making = true;
    setTimeout(makeNext, 0);
  }
}
