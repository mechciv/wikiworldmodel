// A city's records, raised off the main thread a cell at a time (world/generators/city/cells.ts), for a living scene
// that draws them among its own houses (structures.ts): their first entity follows the scene's own, and every cell's
// mesh is moved from the city's metres into the scene's.
import type { CityFile, GroundLevel } from '../../../core/city.ts';
import { cellBox, CityBuilder, macroBox } from '../../../world/generators/city/cells.ts';
import { STRIDE } from '../../../world/generators/city/kit.ts';

export type ToWorker =
  /** a city's records: their first entity, and where the city's point lies in the scene's metres */
  | { type: 'structures'; city: CityFile; levels: GroundLevel[]; heights: Int16Array[]; entityBase: number; offset: [number, number] }
  | { type: 'cell'; key: number; detail: number; serial: number }
  | { type: 'macro'; key: number; serial: number }
  /** where the eye is, on the city's grid: the nearest cells asked for are made first */
  | { type: 'eye'; at: [number, number] };

export type FromWorker =
  | { type: 'structures'; cells: number[]; macros: number[]; tops: Float32Array }
  | { type: 'cell'; key: number; detail: number; serial: number; vertices: ArrayBuffer; indices: Uint32Array; ms: number }
  | { type: 'macro'; key: number; serial: number; vertices: ArrayBuffer; indices: Uint32Array; ms: number };

let builder: CityBuilder | null = null;
/** where the city's point lies in the metres of the scene drawing it */
let offset: [number, number] = [0, 0];
const post = (m: FromWorker, transfer: Transferable[]) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(m, transfer);

interface QueuedBuild {
  kind: 'cell' | 'macro';
  key: number;
  detail: number;
  serial: number;
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'structures') {
    builder = new CityBuilder(m.city, m.levels.map((g, i) => ({ ...g, z: m.heights[i] })), { entityBase: m.entityBase });
    offset = m.offset;
    const tops = builder.tops();
    post({ type: 'structures', cells: builder.cells(), macros: builder.macroCells(), tops }, [tops.buffer as ArrayBuffer]);
    return;
  }
  if (m.type === 'eye') {
    eye = m.at;
    return;
  }
  if (!builder) return;
  if (m.type === 'macro') {
    asked.set(m.key * 3 + 2, { kind: 'macro', key: m.key, detail: 2, serial: m.serial });
  } else {
    asked.set(m.key * 3 + m.detail, { kind: 'cell', key: m.key, detail: m.detail, serial: m.serial });
  }
  if (!making) {
    making = true;
    setTimeout(makeNext, 0);
  }
};

/** The cells and macro HLOD tiles asked for and not yet made; and where the eye is. */
const asked = new Map<number, QueuedBuild>();
let eye: [number, number] = [0, 0];
let making = false;

function shiftVertices(vertices: ArrayBuffer): void {
  if (offset[0] === 0 && offset[1] === 0) return;
  const f = new Float32Array(vertices);
  const step = STRIDE / 4;
  for (let i = 0; i < f.length; i += step) {
    f[i] += offset[0];
    f[i + 1] += offset[1];
  }
}

/**
 * Make the chunk most wanted of those asked for: fine cells near the eye first, then macro HLOD
 * tiles so distant skylines fill in immediately, then mid-range coarse leaf cells.
 */
function makeNext(): void {
  making = false;
  if (!builder || !asked.size) return;
  let best: QueuedBuild | null = null;
  let bestKey = 0;
  let bestD = Infinity;
  for (const [mapKey, r] of asked) {
    const b = r.kind === 'macro' ? macroBox(r.key) : cellBox(r.key);
    const bias = r.kind === 'macro' ? 1e5 : r.detail * 2e5;
    const d = Math.hypot((b[0] + b[2]) / 2 - eye[0], (b[1] + b[3]) / 2 - eye[1]) - bias;
    if (d < bestD) {
      bestD = d;
      best = r;
      bestKey = mapKey;
    }
  }
  const m = best!;
  asked.delete(bestKey);
  const t0 = performance.now();
  if (m.kind === 'macro') {
    const { vertices, indices } = builder.buildMacro(m.key);
    shiftVertices(vertices);
    post({ type: 'macro', key: m.key, serial: m.serial, vertices, indices, ms: performance.now() - t0 }, [vertices, indices.buffer as ArrayBuffer]);
  } else {
    const mesh = builder.build(m.key, m.detail);
    const { vertices, indices } = mesh.arrays();
    shiftVertices(vertices);
    post({ type: 'cell', key: m.key, detail: m.detail, serial: m.serial, vertices, indices, ms: performance.now() - t0 }, [vertices, indices.buffer as ArrayBuffer]);
  }
  if (asked.size) {
    making = true;
    setTimeout(makeNext, 0);
  }
}
