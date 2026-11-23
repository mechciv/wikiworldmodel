// The lakes the world gives a scene (field:earth/lakes; docs/slices/EIGHTH-SLICE.md): the drainage's grid says which of
// its cells a lake covers and where its surface stands, and a scene draws it below that grid. Its shore wanders through
// the cells along its edge, its bed falls away from the shore, and the land just beyond rises from it, so that the water
// stays where the world put it. Shore and bed are invented, keyed by the place, and marked so.
import type { SceneLake } from '../../../core/scene.ts';
import { fbm } from './land.ts';
import type { GridSpec } from './land.ts';

/** How the generator draws a lake's shore and bed: its parameters' meaning is in LivingParams['lakes'] (scene/v13.ts). */
export interface LakeChoices {
  wander: number;
  scale: number;
  slope: number;
  deepest: number;
  rise: number;
  band: number;
}

/** The grid a scene's lakes are mapped on: 100 m, out as far as a scene draws the world's rivers. */
const GRID: GridSpec = { nx: 681, ny: 681, x0: -34000, y0: -34000, cell: 100 };

/**
 * A scene's lakes as a map: at every point, how far it lies inside the nearest lake's shore, m (under the water positive,
 * on land negative), and that lake. The cells' edges are the drainage's grid's; the shore is moved off them by a noise
 * keyed by the place, up to `wander` either way.
 */
export class LakeMap {
  readonly lakes: SceneLake[];
  private inside: Float32Array;
  private which: Int16Array;
  constructor(lakes: SceneLake[], readonly c: LakeChoices, private seed: number, readonly gs: GridSpec = GRID) {
    this.lakes = lakes;
    const { nx, ny, x0, y0, cell } = gs;
    const n = nx * ny;
    // Which lake covers each node, if any: a node lies in a cell where it is within its half widths of the cell's middle.
    const of = new Int16Array(n).fill(-1);
    lakes.forEach((l, li) => {
      for (let k = 0; k + 1 < l.cells.length; k += 2) {
        const cx = l.cells[k];
        const cy = l.cells[k + 1];
        const i0 = Math.max(0, Math.ceil((cx - l.half[0] - x0) / cell));
        const i1 = Math.min(nx - 1, Math.floor((cx + l.half[0] - x0) / cell));
        const j0 = Math.max(0, Math.ceil((cy - l.half[1] - y0) / cell));
        const j1 = Math.min(ny - 1, Math.floor((cy + l.half[1] - y0) / cell));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) of[j * nx + i] = li;
      }
    });
    // How far each node is from the nodes of the other kind, by a chamfer's two sweeps, carrying the nearest lake with it.
    const INF = 1e9;
    const d = new Float32Array(n).fill(INF);
    const near = Int16Array.from(of);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const a = of[k] >= 0;
        const edge = (i > 0 && of[k - 1] >= 0 !== a) || (i < nx - 1 && of[k + 1] >= 0 !== a) || (j > 0 && of[k - nx] >= 0 !== a) || (j < ny - 1 && of[k + nx] >= 0 !== a);
        if (edge) {
          d[k] = cell / 2;
          if (!a) for (const q of [k - 1, k + 1, k - nx, k + nx]) if (q >= 0 && q < n && of[q] >= 0) near[k] = of[q];
        }
      }
    }
    const D = cell * Math.SQRT2;
    const relax = (k: number, q: number, w: number) => {
      if (d[q] + w < d[k] && (of[q] >= 0) === (of[k] >= 0)) {
        d[k] = d[q] + w;
        if (of[k] < 0) near[k] = near[q];
      }
    };
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (i > 0) relax(k, k - 1, cell);
        if (j > 0) {
          relax(k, k - nx, cell);
          if (i > 0) relax(k, k - nx - 1, D);
          if (i < nx - 1) relax(k, k - nx + 1, D);
        }
      }
    }
    for (let j = ny - 1; j >= 0; j--) {
      for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i;
        if (i < nx - 1) relax(k, k + 1, cell);
        if (j < ny - 1) {
          relax(k, k + nx, cell);
          if (i < nx - 1) relax(k, k + nx + 1, D);
          if (i > 0) relax(k, k + nx - 1, D);
        }
      }
    }
    this.inside = new Float32Array(n);
    for (let k = 0; k < n; k++) this.inside[k] = of[k] >= 0 ? d[k] : -d[k];
    this.which = near;
  }

  get empty(): boolean {
    return this.lakes.length === 0;
  }

  /** How far a point lies inside the nearest lake's shore, m: positive under its water, negative on land. Far off, very negative. */
  signed(x: number, y: number): number {
    const { nx, ny, x0, y0, cell } = this.gs;
    const fx = (x - x0) / cell;
    const fy = (y - y0) / cell;
    if (fx < 0 || fy < 0 || fx > nx - 1.001 || fy > ny - 1.001) return -1e9;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const k = j * nx + i;
    const a = this.inside;
    const s = (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + nx] * (1 - u) + a[k + nx + 1] * u) * v;
    if (s < -this.c.wander * 2 - this.c.band) return s;
    // The shore off the drainage's grid: a wander of a few turns, the larger the coarser.
    return s + this.c.wander * (fbm(x / this.c.scale, y / this.c.scale, this.seed + 91) - 0.5) * 2.6;
  }

  /** The level of the lake nearest a point, m above the coast; undefined where none is near. */
  levelNear(x: number, y: number): number | undefined {
    const { nx, ny, x0, y0, cell } = this.gs;
    const i = Math.round((x - x0) / cell);
    const j = Math.round((y - y0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return undefined;
    const l = this.which[j * nx + i];
    return l >= 0 ? this.lakes[l].level : undefined;
  }

  /**
   * The ground at a point under and by a lake, from the ground the scene would have without it: under the water, its bed
   * falling from the shore; just beyond the shore, never lower than the water and rising from it; elsewhere as it was.
   */
  ground(x: number, y: number, z: number): number {
    const s = this.signed(x, y);
    if (s < -this.c.band) return z;
    const level = this.levelNear(x, y);
    if (level === undefined) return z;
    if (s > 0) return Math.min(z, level - Math.min(this.c.deepest, 0.3 + s * this.c.slope));
    const t = -s / this.c.band;
    return Math.max(z, level + 0.15 + this.c.rise * t * t * (3 - 2 * t));
  }

  /** The water's level at a point, if a lake lies over it or its shore is close: what its banks are wetted to. */
  levelAt(x: number, y: number): number | undefined {
    if (this.signed(x, y) < -this.c.band * 0.5) return undefined;
    return this.levelNear(x, y);
  }
}

/**
 * The lakes' surfaces, as quads of `step` metres at each lake's level wherever its water reaches, a little past its
 * shore so that the ground cuts it there: flat, still, with the depth under each corner.
 */
export function lakeSheets(map: LakeMap, step: number, verts: number[], flow: number[], idx: number[]): void {
  if (map.empty) return;
  const { x0, y0, nx, cell } = map.gs;
  const span = (nx - 1) * cell;
  const n = Math.floor(span / step);
  const c = map.c;
  const corner = new Int32Array((n + 1) * (n + 1)).fill(-1);
  const at = (i: number, j: number): number => {
    const q = j * (n + 1) + i;
    if (corner[q] >= 0) return corner[q];
    const x = x0 + i * step;
    const y = y0 + j * step;
    const s = map.signed(x, y);
    const level = map.levelNear(x, y) ?? 0;
    corner[q] = verts.length / 3;
    verts.push(x, y, level + 0.03);
    flow.push(0, 0, Math.max(0.2, Math.min(c.deepest, s * c.slope)));
    return corner[q];
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * step;
      const y = y0 + (j + 0.5) * step;
      if (map.signed(x, y) < -step) continue;
      const a = at(i, j);
      const b = at(i + 1, j);
      const d = at(i, j + 1);
      const e = at(i + 1, j + 1);
      idx.push(a, b, e, a, e, d);
    }
  }
}
