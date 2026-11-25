// A city's records cut into cells, so that what is near can be drawn finely and what is far coarsely, and the forms
// can be raised a cell at a time. A living scene draws them so among its own houses (viewer/src/city/structures.ts):
// every structure of the build's city file, raised by forms.ts on the city's surveyed ground. The houses between them
// are the settlement generator's, as every town's are (docs/plans/CITIES.md, decision 1).
import type { CityFile, CityStructure } from '../../../core/city.ts';
import { raise, LINE_FORMS, type FormContext } from './forms.ts';
import { GroundSampler, type GroundGridData } from './ground.ts';
import { MAT, Mesh, STRIDE } from './kit.ts';

export const CELL = 400;
export const CELLS = 34;
const HALF = (CELL * CELLS) / 2;

/** Macro HLOD tile span in leaf cells (4 x 4 = 1600 m x 1600 m merged proxy tile). */
export const MACRO_SPAN = 4;
export const MACRO_CELL = CELL * MACRO_SPAN;
export const MACRO_CELLS = Math.ceil(CELLS / MACRO_SPAN);

export const cellOf = (x: number, y: number) => {
  const i = Math.floor((x + HALF) / CELL);
  const j = Math.floor((y + HALF) / CELL);
  return i < 0 || j < 0 || i >= CELLS || j >= CELLS ? -1 : j * CELLS + i;
};

export const cellBox = (key: number): [number, number, number, number] => {
  const i = key % CELLS;
  const j = Math.floor(key / CELLS);
  return [-HALF + i * CELL, -HALF + j * CELL, -HALF + (i + 1) * CELL, -HALF + (j + 1) * CELL];
};

/** Map a leaf cell key into its parent macro HLOD tile key. */
export const macroKeyOf = (cellKey: number): number => {
  const i = cellKey % CELLS;
  const j = Math.floor(cellKey / CELLS);
  return Math.floor(j / MACRO_SPAN) * MACRO_CELLS + Math.floor(i / MACRO_SPAN);
};

/** World-local XY bounding box of a macro HLOD tile, clamped to the leaf grid extent. */
export const macroBox = (macroKey: number): [number, number, number, number] => {
  const mi = macroKey % MACRO_CELLS;
  const mj = Math.floor(macroKey / MACRO_CELLS);
  const i0 = mi * MACRO_SPAN;
  const j0 = mj * MACRO_SPAN;
  const i1 = Math.min(CELLS, i0 + MACRO_SPAN);
  const j1 = Math.min(CELLS, j0 + MACRO_SPAN);
  return [-HALF + i0 * CELL, -HALF + j0 * CELL, -HALF + i1 * CELL, -HALF + j1 * CELL];
};

/** All valid leaf cell keys covered by a macro HLOD tile. */
export const macroChildren = (macroKey: number): number[] => {
  const mi = macroKey % MACRO_CELLS;
  const mj = Math.floor(macroKey / MACRO_CELLS);
  const i0 = mi * MACRO_SPAN;
  const j0 = mj * MACRO_SPAN;
  const i1 = Math.min(CELLS, i0 + MACRO_SPAN);
  const j1 = Math.min(CELLS, j0 + MACRO_SPAN);
  const out: number[] = [];
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) out.push(j * CELLS + i);
  }
  return out;
};

/**
 * Drop triangles smaller than `minAreaM2` (m²) and compact away unreferenced vertices to produce
 * lightweight macro HLOD proxy geometry without altering generator leaf meshes.
 */
export function simplifyMacroMesh(vertices: ArrayBuffer, indices: Uint32Array, minAreaM2: number): { vertices: ArrayBuffer; indices: Uint32Array } {
  if (minAreaM2 <= 0 || indices.length === 0 || vertices.byteLength === 0) {
    return { vertices, indices };
  }
  const vCount = Math.floor(vertices.byteLength / STRIDE);
  const f = new Float32Array(vertices);
  const minDoubleArea2 = (2 * minAreaM2) * (2 * minAreaM2);
  const kept = new Uint32Array(indices.length);
  let kn = 0;
  for (let k = 0; k + 2 < indices.length; k += 3) {
    const a = indices[k];
    const b = indices[k + 1];
    const c = indices[k + 2];
    const ao = a * 7;
    const bo = b * 7;
    const co = c * 7;
    const e1x = f[bo] - f[ao];
    const e1y = f[bo + 1] - f[ao + 1];
    const e1z = f[bo + 2] - f[ao + 2];
    const e2x = f[co] - f[ao];
    const e2y = f[co + 1] - f[ao + 1];
    const e2z = f[co + 2] - f[ao + 2];
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    if (cx * cx + cy * cy + cz * cz >= minDoubleArea2) {
      kept[kn++] = a;
      kept[kn++] = b;
      kept[kn++] = c;
    }
  }
  if (kn === indices.length) return { vertices, indices };
  if (kn === 0) return { vertices: new ArrayBuffer(0), indices: new Uint32Array(0) };

  const remap = new Int32Array(vCount);
  remap.fill(-1);
  let used = 0;
  const outIdx = new Uint32Array(kn);
  for (let k = 0; k < kn; k++) {
    const oldV = kept[k];
    let newV = remap[oldV];
    if (newV < 0) {
      newV = used++;
      remap[oldV] = newV;
    }
    outIdx[k] = newV;
  }
  const srcU32 = new Uint32Array(vertices);
  const outVerts = new ArrayBuffer(used * STRIDE);
  const dstU32 = new Uint32Array(outVerts);
  const words = STRIDE >> 2;
  for (let oldV = 0; oldV < vCount; oldV++) {
    const newV = remap[oldV];
    if (newV < 0) continue;
    const s = oldV * words;
    const d = newV * words;
    for (let w = 0; w < words; w++) dstU32[d + w] = srcU32[s + w];
  }
  return { vertices: outVerts, indices: outIdx };
}

/** Whether a structure is visually significant at macro HLOD distance (> 1.5 km) or in Cascade 2 shadows. */
function macroWorthy(s: CityStructure): boolean {
  if (s.rank <= 1 || s.curated) return true;
  if (s.kind === 'works/road') return false;
  if (LINE_FORMS.has(s.form.type)) return true;
  if (s.form.type !== 'generic' && s.form.type !== 'fountain' && s.form.type !== 'statue') return true;
  if ((s.height ?? 0) >= 8) return true;
  let r2 = 0;
  const ax = s.at[0];
  const ay = s.at[1];
  for (const ring of s.rings) {
    for (let i = 0; i + 1 < ring.length; i += 2) {
      const dx = ring[i] - ax;
      const dy = ring[i + 1] - ay;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) r2 = d2;
    }
  }
  return r2 >= 7 * 7;
}

export class CityBuilder {
  readonly ground: GroundSampler;
  private cellStructures = new Map<number, number[]>();
  private cellLines = new Map<number, number[]>();
  private ctx: FormContext;
  /** the entity of the first structure: the rest follow it in the file's order */
  readonly first: number;

  /** `opts.entityBase` is the entity of its first structure, where they follow a scene's own. */
  constructor(readonly city: CityFile, grounds: GroundGridData[], opts: { entityBase?: number } = {}) {
    this.ground = new GroundSampler(grounds);
    this.first = opts.entityBase ?? 1;
    const push = (m: Map<number, number[]>, k: number, v: number) => {
      if (k < 0) return;
      const l = m.get(k);
      if (l) {
        if (l[l.length - 1] !== v) l.push(v);
      } else m.set(k, [v]);
    };
    // Streets and walls, to find which way a temple faces and how a gate is set.
    const roads: number[][] = [];
    const walls: number[][] = [];
    city.structures.forEach((s, i) => {
      if (s.kind === 'works/road' || LINE_FORMS.has(s.form.type)) {
        for (const l of [...(s.lines ?? []), ...s.rings]) {
          for (let k = 0; k + 3 < l.length; k += 2) {
            const steps = Math.max(1, Math.ceil(Math.hypot(l[k + 2] - l[k], l[k + 3] - l[k + 1]) / 60));
            for (let t = 0; t <= steps; t++) push(this.cellLines, cellOf(l[k] + ((l[k + 2] - l[k]) * t) / steps, l[k + 1] + ((l[k + 3] - l[k + 1]) * t) / steps), i);
          }
        }
        if (s.kind === 'works/road') roads.push(...(s.lines ?? []));
        if (s.form.type === 'wall') walls.push(...(s.lines ?? []));
      } else push(this.cellStructures, cellOf(s.at[0], s.at[1]), i);
    });
    const nearest = (lines: number[][], x: number, y: number): { d: number; dx: number; dy: number } | undefined => {
      let best: { d: number; dx: number; dy: number } | undefined;
      for (const l of lines) {
        for (let k = 0; k + 3 < l.length; k += 2) {
          const ex = l[k + 2] - l[k];
          const ey = l[k + 3] - l[k + 1];
          const q = ex * ex + ey * ey;
          const t = q > 0 ? Math.max(0, Math.min(1, ((x - l[k]) * ex + (y - l[k + 1]) * ey) / q)) : 0;
          const ax = l[k] + ex * t - x;
          const ay = l[k + 1] + ey * t - y;
          const d = ax * ax + ay * ay;
          if (!best || d < best.d) best = { d, dx: ex, dy: ey };
        }
      }
      return best;
    };
    this.ctx = {
      ground: this.ground,
      detail: 0,
      water: city.site.water_level,
      streetDistance: (x, y) => Math.sqrt(nearest(roads, x, y)?.d ?? 1e12),
      wallDirection: (x, y) => {
        const n = nearest(walls, x, y);
        if (!n) return undefined;
        const l = Math.hypot(n.dx, n.dy) || 1;
        return [n.dx / l, n.dy / l];
      },
    };
  }

  /** Every cell with anything in it. */
  cells(): number[] {
    return [...new Set([...this.cellStructures.keys(), ...this.cellLines.keys()])].sort((a, b) => a - b);
  }

  /** Every macro HLOD tile (4 x 4 leaf cells) with at least one populated leaf cell. */
  macroCells(): number[] {
    const out = new Set<number>();
    for (const k of this.cellStructures.keys()) out.add(macroKeyOf(k));
    for (const k of this.cellLines.keys()) out.add(macroKeyOf(k));
    return [...out].sort((a, b) => a - b);
  }

  /** How high each structure stands as raised, above sea level: 0 for one drawn along a line. */
  tops(): Float32Array {
    const c = this.city;
    const out = new Float32Array(c.structures.length);
    c.structures.forEach((s, i) => {
      if (s.kind === 'works/road' || LINE_FORMS.has(s.form.type)) return;
      const m = new Mesh(2048);
      raise(m, s, { ...this.ctx, detail: 0, clip: undefined });
      if (m.verts) out[i] = m.top();
    });
    return out;
  }

  /** The mesh of one cell, at a level of detail: 0 from afar, 1 close by. */
  build(key: number, detail: number): Mesh {
    const m = new Mesh(detail ? 65536 : 16384);
    const c = this.city;
    const ctx: FormContext = { ...this.ctx, detail };
    for (const i of this.cellStructures.get(key) ?? []) {
      m.entity = this.first + i;
      raise(m, c.structures[i], { ...ctx, clip: undefined });
    }
    const clip = cellBox(key);
    for (const i of this.cellLines.get(key) ?? []) {
      m.entity = this.first + i;
      raise(m, c.structures[i], { ...ctx, clip });
    }
    return m;
  }

  /**
   * Merged macro HLOD proxy mesh for a 4 x 4 tile (1600 m): raises prominent structures and walls
   * across all child cells at coarse detail and strips sub-1.5 m² sliver triangles.
   */
  buildMacro(macroKey: number): { vertices: ArrayBuffer; indices: Uint32Array } {
    const m = new Mesh(32768);
    const c = this.city;
    const ctx: FormContext = { ...this.ctx, detail: 0 };
    const structs = new Set<number>();
    const lines = new Set<number>();
    for (const child of macroChildren(macroKey)) {
      for (const i of this.cellStructures.get(child) ?? []) structs.add(i);
      for (const i of this.cellLines.get(child) ?? []) lines.add(i);
    }
    for (const i of structs) {
      const s = c.structures[i];
      if (!macroWorthy(s)) continue;
      m.entity = this.first + i;
      raise(m, s, { ...ctx, clip: undefined });
    }
    const clip = macroBox(macroKey);
    for (const i of lines) {
      const s = c.structures[i];
      if (!macroWorthy(s)) continue;
      m.entity = this.first + i;
      raise(m, s, { ...ctx, clip });
    }
    const raw = m.arrays();
    return simplifyMacroMesh(raw.vertices, raw.indices, 1.5);
  }
}

export { MAT };
