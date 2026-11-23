// The ground below the relief's grid (core/relief.ts): the finer level of today's relief, cut from the survey into
// tiles a scene sends for; and what the records say of when each range stood, which carries today's shape back before
// the times the relief is held for (model:earth/relief-carried).
import { deflateSync } from 'node:zlib';
import { encodeTile } from '../../../../core/container.ts';
import { encodeShape, fineKey, fineRows, type ReliefFineHeader, type ReliefInfo, type ReliefRange } from '../../../../core/relief.ts';
import { toMa } from '../../../../core/time.ts';
import { pointOf } from '../chronology.ts';
import { rasterRows } from '../tiff.ts';
import { stableStringify } from '../util.ts';
import type { Field } from '../world.ts';
import { claimOf, type Solved } from './records.ts';

/** How a field's finer level is kept: the field's own parameters (field:earth/relief, `fine`). */
export interface FineParams {
  /** the survey's cell, in seconds of arc, which the build checks against the file */
  res_arcsec: number;
  /** a tile's side, and how far from its place a scene reads them, in degrees */
  tile_deg: number;
  reach_deg: number;
  /** a tile is kept where some of its ground stands above this, m, and departs from the field's grid by at least `least_m` */
  floor_m: number;
  least_m: number;
}

/** The finer level as made: which tiles there are, and each tile's codes by its key, rows from the north. */
export interface FineLevel {
  step: number;
  tile_deg: number;
  reach_deg: number;
  rows: string[];
  tiles: Map<string, Int8Array>;
}

/**
 * The finer level of a relief: for each cell of the survey, what it has less what the field's grid of means makes of
 * the place, read straight between the grid's nodes, as one byte (core/relief.ts). Kept in tiles, and only those with
 * ground above the floor that the field's grid does not already give.
 */
export async function fineLevel(path: string, mean: { nx: number; ny: number; step: number; data: Float32Array }, p: FineParams): Promise<FineLevel> {
  const step = p.res_arcsec / 3600;
  const per = Math.round(p.tile_deg / step);
  const across = Math.round(360 / p.tile_deg);
  const down = Math.round(180 / p.tile_deg);
  let codes: Int8Array | undefined;
  let highest: Float32Array | undefined;
  let most: Uint8Array | undefined;
  let cols: { i: Int32Array; i1: Int32Array; u: Float32Array; tile: Int32Array } | undefined;
  let width = 0;
  let dy = 0;
  const raster = await rasterRows(
    path,
    (y, x0, values) => {
      const W = width;
      const c = cols!;
      const fy = Math.min(mean.ny - 1.0001, ((y + 0.5) * dy) / mean.step);
      const j = Math.floor(fy);
      const v = fy - j;
      const a = j * mean.nx;
      const b = a + mean.nx;
      const trow = Math.min(down - 1, Math.floor(y / per)) * across;
      const m = mean.data;
      for (let k = 0; k < values.length; k++) {
        const x = x0 + k;
        const z = values[k];
        const i = c.i[x];
        const i1 = c.i1[x];
        const u = c.u[x];
        const code = encodeShape(z - ((m[a + i] * (1 - u) + m[a + i1] * u) * (1 - v) + (m[b + i] * (1 - u) + m[b + i1] * u) * v));
        codes![y * W + x] = code;
        const t = trow + c.tile[x];
        if (z > highest![t]) highest![t] = z;
        const size = code < 0 ? -code : code;
        if (size > most![t]) most![t] = size;
      }
    },
    (r) => {
      if (Math.abs(r.dx - step) > 1e-9 || Math.abs(r.dy - step) > 1e-9) throw new Error(`${path}: cells of ${r.dx * 3600}″, where the field's finer level says ${p.res_arcsec}″`);
      if (Math.abs(r.x0 + 180) > r.dx / 2 || Math.abs(r.y0 - 90) > r.dy / 2 || Math.abs(r.width * r.dx - 360) > r.dx || Math.abs(r.height * r.dy - 180) > r.dy) throw new Error(`${path}: not a global grid from 90°N and 180°W`);
      width = r.width;
      dy = r.dy;
      codes = new Int8Array(r.width * r.height);
      highest = new Float32Array(across * down).fill(-Infinity);
      most = new Uint8Array(across * down);
      const i = new Int32Array(r.width);
      const i1 = new Int32Array(r.width);
      const u = new Float32Array(r.width);
      const tile = new Int32Array(r.width);
      for (let x = 0; x < r.width; x++) {
        const fx = ((x + 0.5) * r.dx) / mean.step;
        const f = Math.floor(fx);
        i[x] = ((f % mean.nx) + mean.nx) % mean.nx;
        i1[x] = (i[x] + 1) % mean.nx;
        u[x] = fx - f;
        tile[x] = Math.min(across - 1, Math.floor(x / per));
      }
      cols = { i, i1, u, tile };
    },
  );
  const least = encodeShape(p.least_m);
  const kept = (tx: number, ty: number) => highest![ty * across + tx] > p.floor_m && most![ty * across + tx] >= least;
  const tiles = new Map<string, Int8Array>();
  for (let ty = 0; ty < down; ty++) {
    for (let tx = 0; tx < across; tx++) {
      if (!kept(tx, ty)) continue;
      const t = new Int8Array(per * per);
      for (let j = 0; j < per; j++) {
        const from = (ty * per + j) * raster.width + tx * per;
        t.set(codes!.subarray(from, from + per), j * per);
      }
      tiles.set(fineKey(p.tile_deg, tx, ty), t);
    }
  }
  return { step, tile_deg: p.tile_deg, reach_deg: p.reach_deg, rows: fineRows(kept, p.tile_deg), tiles };
}

/** A tile of the finer level as a file: its codes, deflated. */
export function encodeFineTile(key: string, codes: Int8Array, level: Pick<FineLevel, 'step' | 'tile_deg'>): Uint8Array {
  const [north, west] = key.split('_').map(Number);
  const packed = deflateSync(new Uint8Array(codes.buffer, codes.byteOffset, codes.byteLength), { level: 9 });
  const header: ReliefFineHeader = { format: 'lightworld-relief-fine@1', north, west, n: Math.round(level.tile_deg / level.step), step: level.step, coding: 'sqrt4', packed: 'deflate', codes: 0 };
  return encodeTile(header as unknown as Record<string, unknown>, [new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength)], stableStringify);
}

/** What the carried-back relief's field says of its rule: the records whose starts it follows (field:earth/relief-carried, params). */
export interface CarriedParams {
  /** all of today's shape is held through this record's span, and none of it before this one's begins */
  held_through: string;
  gone_before: string;
  /** the phase of a range in which it stands at about its present height */
  standing_phase: string;
  /** how far another plate may have moved against a place's own since the elevation's keyframe, in nodes of the relief's grid, before its ground has none of its shape */
  other_plates: number;
  /** the least share of the height the elevation gives the land of a place that ground dry today keeps above the coast there */
  valley_floor: number;
}

/**
 * The ranges whose records say when they stood (kind landform/mountain-range with an outline and a phase in which
 * they stand at about their present height): each with its outline on today's Earth, by when it stood, and when its
 * growth began, where its record or what raised it says. A range with no evidence of when it stood is left to the rule.
 */
export function rangesOf(s: Solved, phase: string): ReliefRange[] {
  const w = s.world;
  const centres = s.centres.ok ? s.centres.bounds : undefined;
  const mid = (b: { lo: number; hi: number } | undefined) => (b && Number.isFinite(b.lo) && Number.isFinite(b.hi) ? (b.lo + b.hi) / 2 : undefined);
  const out: ReliefRange[] = [];
  for (const e of w.entities) {
    if (!e.kind.startsWith('landform/mountain-range') || !e.phases.some((p) => p.id === phase)) continue;
    const extent = claimOf(s, e.id, 'extent')?.value as { type?: string; coordinates?: unknown } | undefined;
    if (!extent || (extent.type !== 'Polygon' && extent.type !== 'MultiPolygon')) continue;
    const subject = `${e.id}@${phase}`;
    const point = pointOf(w, subject, 'start');
    const b = s.sol.bounds.get(point);
    if (!b) continue;
    // By when it stood: the latest time the evidence allows its standing to have begun. A date's own younger end, or
    // the time of the oldest measurement that shows it standing so, whichever is the earlier; today's shape is carried
    // no further back than that.
    const stood = Number.isFinite(b.hi) ? b.hi : undefined;
    if (stood === undefined) continue;
    // Its growth began where a claim dates it; else no earlier than what raised it; else by the time a bound says it
    // had begun, which is the latest the evidence allows.
    const sp = pointOf(w, e.id, 'start');
    const sb = s.sol.bounds.get(sp);
    const sc = centres?.get(sp);
    const began = claimOf(s, e.id, 'start')
      ? mid(sc) ?? mid(sb)
      : sc && Number.isFinite(sc.lo)
        ? sc.lo
        : sb && Number.isFinite(sb.lo)
          ? sb.lo
          : claimOf(s, e.id, 'start_before') && sb && Number.isFinite(sb.hi)
            ? sb.hi
            : undefined;
    const name = claimOf(s, e.id, 'name')?.value as { en?: string } | undefined;
    const round = (ma: number) => Math.round(ma * 1000) / 1000;
    const outline = (extent.type === 'Polygon' ? [extent.coordinates] : extent.coordinates) as number[][][][];
    out.push({ id: e.id, label: name?.en ?? e.id, outline, standingMa: round(toMa(stood)), ...(began !== undefined && toMa(began) > toMa(stood) ? { startMa: round(toMa(began)) } : {}) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** The carried-back relief as the index gives it: the rule's two ages from the records it follows, and the ranges. */
export function carriedInfo(s: Solved, field: Field, model: string): ReliefInfo['carried'] | undefined {
  const p = field.params as unknown as CarriedParams | undefined;
  if (!p?.held_through || !p.gone_before) return undefined;
  const startOf = (id: string): number | undefined => {
    const b = (s.centres.ok ? s.centres.bounds : s.sol.bounds).get(pointOf(s.world, id, 'start'));
    return b && Number.isFinite(b.lo) && Number.isFinite(b.hi) ? toMa((b.lo + b.hi) / 2) : undefined;
  };
  const fullMa = startOf(p.held_through);
  const goneMa = startOf(p.gone_before);
  if (fullMa === undefined || goneMa === undefined || !(goneMa > fullMa)) throw new Error(`${field.id}: ${p.held_through} must begin after ${p.gone_before}, and both be dated`);
  if (!(p.other_plates > 0)) throw new Error(`${field.id}: other_plates must say how far another plate may have moved, in nodes of the relief's grid`);
  if (!(p.valley_floor > 0)) throw new Error(`${field.id}: valley_floor must say how far above the coast dry ground is held, as a share of the land's height`);
  return { field: field.id, title: field.title, model, fullMa: Math.round(fullMa * 1000) / 1000, goneMa: Math.round(goneMa * 1000) / 1000, apart: p.other_plates, floor: p.valley_floor, ranges: rangesOf(s, p.standing_phase) };
}
