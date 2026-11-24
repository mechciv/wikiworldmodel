// A surveyed ground laid over a scene's (docs/plans/CITIES.md, The models: the ground itself). Where a settlement has a
// survey finer than the world's, as Rome has TINITALY at 10 m with its river carved in and its plots levelled, the scene
// stands on it: on the survey's grids where they reach, eased into the scene's own ground across the survey's outer edge,
// so that what the settlement's records raise on the survey's ground stands on what the scene draws. Where the survey
// gives its water, as Rome's map gives the Tiber, the scene's water there is the survey's, and the river the scene would
// have run from the world's drainage is not drawn within the survey's ground: there is one Tiber, the mapped one.
//
// Nothing here is a claim: the survey is a dataset, read as the build read it, and how it is eased into the scene's
// ground is a choice of this code.

import { ccw, convexHull, triangulate } from '../city/math.ts';
import { GroundSampler, type GroundGridData } from '../city/ground.ts';
import type { SceneSurvey } from '../../../core/scene.ts';
import type { Waters } from './land.ts';
import type { RiverPath } from './rivers.ts';


/** A survey placed in a scene: its ground, its water, and where it reaches, in the scene's metres. */
export interface PlacedSurvey {
  sampler: GroundSampler;
  /** where the survey's own point lies in the scene's metres */
  ox: number;
  oy: number;
  /** the reach of its finest grid, and of its widest but one, x0, y0, x1, y1 in the scene's metres */
  fine: [number, number, number, number];
  outer: [number, number, number, number];
  level: number;
  rings: number[][];
  islands: number[][];
  /** whether a point of the scene lies in the survey's water */
  wet(x: number, y: number): boolean;
  /** whether a point lies on ground a recorded structure takes at the scene's time, where nothing grows */
  built(x: number, y: number): boolean;
  /** whether a point lies where no house stands: in water, on or within a street of a structure's ground, or in a garden */
  reserved(x: number, y: number): boolean;
}

/** How far into the survey's outer grid the scene's ground gives way to it, m. */
const EASE = 3000;
/** How fine the map of the survey's water is, m. */
const WET_CELL = 5;
/**
 * How far a house keeps from a recorded structure, m: a street's width all round its convex hull, as Rome's own
 * generator kept its blocks, so that a monument stands clear of the houses and its courts and recesses are not built in.
 */
const CLEAR = 5;

/** A ring's convex hull grown by `m` all round: the hull of its corners each set about with an octagon. */
function hullAround(r: number[], m: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i + 1 < r.length; i += 2) for (let k = 0; k < 8; k++) pts.push(r[i] + m * Math.cos((k * Math.PI) / 4), r[i + 1] + m * Math.sin((k * Math.PI) / 4));
  return convexHull(pts);
}

const EARTH = 6371000;

/** Where a survey's point lies in a scene's metres: east and north on the plane about the scene's point. */
export function surveyOffset(site: { lat: number; lon: number }, origin: { lat: number; lon: number }): [number, number] {
  const r = Math.PI / 180;
  return [(origin.lon - site.lon) * r * EARTH * Math.cos(site.lat * r), (origin.lat - site.lat) * r * EARTH];
}

const extent = (g: GroundGridData, ox: number, oy: number): [number, number, number, number] => [g.x0 + ox, g.y0 + oy, g.x0 + ox + (g.nx - 1) * g.cell, g.y0 + oy + (g.ny - 1) * g.cell];

/** Place a survey in a scene about `site`. */
export function placeSurvey(site: { lat: number; lon: number }, s: SceneSurvey): PlacedSurvey {
  const [ox, oy] = surveyOffset(site, s.origin);
  const sampler = new GroundSampler(s.levels);
  const fine = extent(s.levels[0], ox, oy);
  const outer = extent(s.levels[Math.max(0, s.levels.length - 2)], ox, oy);
  const rings = (s.water?.rings ?? []).map((r) => r.map((v, i) => v + (i % 2 ? oy : ox)));
  const islands = (s.water?.islands ?? []).map((r) => r.map((v, i) => v + (i % 2 ? oy : ox)));
  const built = (s.built ?? []).map((r) => r.map((v, i) => v + (i % 2 ? oy : ox)));
  const gardens = (s.gardens ?? []).map((r) => r.map((v, i) => v + (i % 2 ? oy : ox)));
  const clear = (s.clear ?? []).map((r) => hullAround(r.map((v, i) => v + (i % 2 ? oy : ox)), CLEAR));
  // The water, the structures' ground and the gardens as one map on the finest grid's ground, a bit each, filled by
  // scanlines over each outline's own rows: an island crossed leaves its ground dry.
  const nx = Math.ceil((fine[2] - fine[0]) / WET_CELL);
  const ny = Math.ceil((fine[3] - fine[1]) / WET_CELL);
  const any = rings.length || built.length || gardens.length || clear.length;
  const map = new Uint8Array(any ? nx * ny : 0);
  const fill = (r: number[], bit: number, on: boolean) => {
    let ylo = Infinity;
    let yhi = -Infinity;
    for (let i = 1; i < r.length; i += 2) {
      ylo = Math.min(ylo, r[i]);
      yhi = Math.max(yhi, r[i]);
    }
    const j0 = Math.max(0, Math.floor((ylo - fine[1]) / WET_CELL - 0.5));
    const j1 = Math.min(ny - 1, Math.ceil((yhi - fine[1]) / WET_CELL - 0.5));
    for (let j = j0; j <= j1; j++) {
      const y = fine[1] + (j + 0.5) * WET_CELL;
      const xs: number[] = [];
      for (let i = 0, k = r.length - 2; i < r.length; k = i, i += 2) {
        const yi = r[i + 1];
        const yk = r[k + 1];
        if (yi > y !== yk > y) xs.push(r[i] + ((y - yi) * (r[k] - r[i])) / (yk - yi));
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.max(0, Math.ceil((xs[q] - fine[0]) / WET_CELL - 0.5));
        const i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - fine[0]) / WET_CELL - 0.5));
        for (let i = i0; i <= i1; i++) map[j * nx + i] = on ? map[j * nx + i] | bit : map[j * nx + i] & ~bit;
      }
    }
  };
  // Each outline on its own, so that two that overlap are both filled; then the islands taken out of the water.
  for (const r of rings) fill(r, 1, true);
  for (const r of islands) fill(r, 1, false);
  for (const r of built) fill(r, 2, true);
  for (const r of gardens) fill(r, 4, true);
  for (const r of clear) fill(r, 8, true);
  const bits = (x: number, y: number) => {
    if (!map.length) return 0;
    const i = Math.floor((x - fine[0]) / WET_CELL);
    const j = Math.floor((y - fine[1]) / WET_CELL);
    return i >= 0 && j >= 0 && i < nx && j < ny ? map[j * nx + i] : 0;
  };
  return {
    sampler,
    ox,
    oy,
    fine,
    outer,
    level: s.water?.level ?? -Infinity,
    rings,
    islands,
    wet: (x, y) => (bits(x, y) & 1) !== 0,
    built: (x, y) => (bits(x, y) & 2) !== 0,
    reserved: (x, y) => bits(x, y) !== 0,
  };
}

const smooth = (t: number) => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/** How much a point of the scene takes the survey's ground: all of it well inside its outer grid, none outside. */
export function surveyWeight(p: PlacedSurvey, x: number, y: number): number {
  const [x0, y0, x1, y1] = p.outer;
  return smooth(Math.min(x - x0, x1 - x, y - y0, y1 - y) / EASE);
}

/**
 * Lay the survey's ground over a scene's finest grids, in place: `levels` of them, the scene's own coarsest left as it
 * is, being the world's survey of the same ground.
 */
export function overlaySurvey(levels: GroundGridData[], p: PlacedSurvey, count = 2): void {
  for (let k = 0; k < Math.min(count, levels.length); k++) {
    const g = levels[k];
    const unit = g.z instanceof Int16Array ? (g.unit ?? 0.1) : 1;
    const base = g.z instanceof Int16Array ? (g.base ?? 0) : 0;
    for (let j = 0; j < g.ny; j++) {
      const y = g.y0 + j * g.cell;
      for (let i = 0; i < g.nx; i++) {
        const x = g.x0 + i * g.cell;
        const w = surveyWeight(p, x, y);
        if (!(w > 0)) continue;
        const at = j * g.nx + i;
        const z0 = g.z[at] * unit + base;
        const z = z0 + (p.sampler.at(x - p.ox, y - p.oy) - z0) * w;
        g.z[at] = g.z instanceof Int16Array ? Math.max(-32768, Math.min(32767, Math.round((z - base) / unit))) : z;
      }
    }
  }
}

/** The scene's waters with every river run inside the survey's finest grid taken out: the survey's own water stands there. */
export function clipWaters(w: Waters, p: PlacedSurvey): Waters {
  const [x0, y0, x1, y1] = p.fine;
  const inside = (x: number, y: number) => x > x0 && x < x1 && y > y0 && y < y1;
  const runs = (path: RiverPath): RiverPath[] => {
    const out: RiverPath[] = [];
    const n = path.xy.length / 2;
    let from = -1;
    const flush = (to: number) => {
      if (from >= 0 && to - from >= 2) {
        const pick = <T extends Float32Array | Float64Array>(a: T, k = 1) => a.slice(from * k, to * k) as T;
        out.push({ ...path, key: `${path.key}~${out.length}`, xy: pick(path.xy, 2), z: pick(path.z), half: pick(path.half), depth: pick(path.depth), q: pick(path.q), ...(path.end !== undefined && to === n ? { end: path.end } : {}) });
      }
      from = -1;
    };
    for (let i = 0; i < n; i++) {
      const out_ = !inside(path.xy[i * 2], path.xy[i * 2 + 1]);
      if (out_ && from < 0) from = i;
      if (!out_) flush(i);
    }
    flush(n);
    return out;
  };
  const keepLine = (l: number[]) => l.some((_, i) => i % 2 === 0 && !inside(l[i], l[i + 1]));
  const river: number[] = [];
  for (let i = 0; i + 1 < w.river.length; i += 2) if (!inside(w.river[i], w.river[i + 1])) river.push(w.river[i], w.river[i + 1]);
  const ponds: number[] = [];
  for (let i = 0; i + 3 < w.ponds.length; i += 4) if (!inside(w.ponds[i], w.ponds[i + 1])) ponds.push(w.ponds[i], w.ponds[i + 1], w.ponds[i + 2], w.ponds[i + 3]);
  return {
    ...w,
    river,
    oxbows: w.oxbows.filter(keepLine),
    ponds,
    ...(w.paths ? { paths: w.paths.flatMap(runs) } : {}),
    ...(w.oxbowList ? { oxbowList: w.oxbowList.filter((o) => !inside(o.xy[0], o.xy[1])) } : {}),
  };
}

/** The level of the water at a point, the survey's within its water and the scene's elsewhere. */
export const withSurveyWater = (level: (x: number, y: number) => number, p: PlacedSurvey) => (x: number, y: number) => (p.wet(x, y) ? p.level : level(x, y));

/** The survey's water as a mesh at its level, to be drawn with the scene's: positions x, y, z, and no flow. */
export function surveyWaterMesh(p: PlacedSurvey): { vertices: Float32Array; indices: Uint32Array; flow: Float32Array } {
  const verts: number[] = [];
  const idx: number[] = [];
  for (const r of p.rings) {
    if (r.length < 6) continue;
    const holes = p.islands.filter((h) => h.length >= 6 && inRing(r, h[0], h[1]));
    const { points, tris } = triangulate(ccw(r), holes);
    const base = verts.length / 3;
    for (let i = 0; i < points.length; i += 2) verts.push(points[i], points[i + 1], p.level);
    for (const t of tris) idx.push(base + t);
  }
  return { vertices: Float32Array.from(verts), indices: Uint32Array.from(idx), flow: new Float32Array(verts.length) };
}

function inRing(r: number[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const yi = r[i + 1];
    const yj = r[j + 1];
    if (yi > y !== yj > y && x < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) c = !c;
  }
  return c;
}

/** Join two water meshes into one. */
export function joinWater(a: { vertices: Float32Array; indices: Uint32Array; flow: Float32Array }, b: { vertices: Float32Array; indices: Uint32Array; flow: Float32Array }) {
  const base = a.vertices.length / 3;
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices);
  for (let i = 0; i < b.indices.length; i++) indices[a.indices.length + i] = b.indices[i] + base;
  const vertices = new Float32Array(a.vertices.length + b.vertices.length);
  vertices.set(a.vertices);
  vertices.set(b.vertices, a.vertices.length);
  const flow = new Float32Array(a.flow.length + b.flow.length);
  flow.set(a.flow);
  flow.set(b.flow, a.flow.length);
  return { vertices, indices, flow };
}
