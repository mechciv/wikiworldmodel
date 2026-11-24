// A city's records cut into cells, so that what is near can be drawn finely and what is far coarsely, and the forms
// can be raised a cell at a time. A living scene draws them so among its own houses (viewer/src/city/structures.ts):
// every structure of the build's city file, raised by forms.ts on the city's surveyed ground. The houses between them
// are the settlement generator's, as every town's are (docs/plans/CITIES.md, decision 1).
import type { CityFile } from '../../../core/city.ts';
import { raise, LINE_FORMS, type FormContext } from './forms.ts';
import { GroundSampler, type GroundGridData } from './ground.ts';
import { MAT, Mesh } from './kit.ts';

export const CELL = 400;
export const CELLS = 34;
const HALF = (CELL * CELLS) / 2;

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
}

export { MAT };
