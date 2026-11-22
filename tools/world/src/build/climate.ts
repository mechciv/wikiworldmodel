// The climate field (climate.lwt): from the months of a model's runs, a keyframe per run on a grid
// the globe can warp with the plates. The model has land where it has it; a node it has no land at
// takes the nearest land's climate, so that the field's own coasts, drawn from the elevation, always
// find a climate under them. Those nodes are marked, and land wins where warping folds them together.
import { encodeTile } from '../../../../core/container.ts';
import { encodeNode, LAND_BIT, reduceMonths, type ClimateHeader, type ClimateNode, type ClimateRule } from '../../../../core/climate.ts';
import { climateClass, CLIMATE_LABEL, type ClimateClass } from '../../../../core/climate.ts';
import { conj, rotate, toLatLon, unitVector } from '../../../../core/quat.ts';
import { toMa } from '../../../../core/time.ts';
import { waterYear, type WaterParams } from '../../../../core/water.ts';
import { cellOf, encodeRain, MONTHS_PARTS, PARTS, T_OFFSET, T_SCALE, tileKey, type MonthsPart, type MonthsTileHeader, type PartsTileHeader } from '../../../../core/months.ts';
import type { FieldGrid } from '../../../../core/tileset.ts';
import { claimOf, subjectTime, type Solved } from './records.ts';
import { datasetFile } from '../manifest.ts';
import { openNetcdf } from '../netcdf.ts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stableStringify } from '../util.ts';
import type { Field, World } from '../world.ts';
import type { Snapshot } from './fields.ts';

const SRC_W = 360;

/** Every grid the keyframes share: nodes every 2°, the first at 90°N and 180°W, wrapping east. */
export function climateGrid(step: number): FieldGrid {
  return { lon0: -180, lat0: 90, step, nx: 360 / step, ny: 180 / step + 1, wrap: true };
}

export interface ClimateKeyframe {
  ageMa: number;
  /** the age whose coordinates its nodes are on, if not its own: 0 for a field measured on today's Earth */
  frameMa?: number;
  /** four bytes per node */
  values: Uint8Array;
  /** the plate's index, with LAND_BIT where the model has land */
  plate: Uint16Array;
  /** the same nodes as numbers, for the build's checks; NaN where the model has no land near */
  nodes: Float32Array;
  /** what its months give the rivers at each node (field:earth/runoff), where the water balance was asked for */
  water?: NodeWater;
  /** its months at each node with land, and the height they stand for (field:earth/climate-at-height), where asked for */
  months?: NodeMonths;
  /** what else its source says of each of those nodes (core/months.ts PARTS), where fields read it `as: months` */
  parts?: NodeParts;
}

/** A keyframe's months at each node where the model has land: the land cells averaged into it, as the tiles keep them. */
export interface NodeMonths {
  /** the nodes, as indices into the grid */
  node: Uint32Array;
  /** per node, twelve months: temperature and precipitation, as the tiles keep them (core/months.ts) */
  t: Uint8Array;
  p: Uint8Array;
  /** per node, the height above the sea the months stand for, m: the mean of the land cells' */
  z: Int16Array;
}

/**
 * The months of one run at each node: its land cells' months and heights averaged into the node they fall in, as
 * nodesOfRun averages their classes. `height` is the height of a cell, by its row and column in the run's grid.
 */
export function monthsOfRun(grid: FieldGrid, lat: ArrayLike<number>, lon: ArrayLike<number>, land: ArrayLike<number>, t: ArrayLike<number>, p: ArrayLike<number>, height: (j: number, i: number) => number): NodeMonths {
  const nlat = lat.length;
  const nlon = lon.length;
  const n = grid.nx * grid.ny;
  const sum = new Float64Array(n * 25);
  const count = new Float64Array(n);
  for (let j = 0; j < nlat; j++) {
    const row = Math.round((grid.lat0 - lat[j]) / grid.step);
    if (row < 0 || row >= grid.ny) continue;
    for (let i = 0; i < nlon; i++) {
      if (land[j * nlon + i] < 0.5) continue;
      const lo = ((lon[i] + 180) % 360) - 180;
      const col = ((Math.round((lo - grid.lon0) / grid.step) % grid.nx) + grid.nx) % grid.nx;
      const k = row * grid.nx + col;
      for (let m = 0; m < 12; m++) {
        const at = (m * nlat + j) * nlon + i;
        sum[k * 25 + m] += t[at];
        sum[k * 25 + 12 + m] += p[at];
      }
      sum[k * 25 + 24] += height(j, i);
      count[k]++;
    }
  }
  const nodes: number[] = [];
  for (let k = 0; k < n; k++) if (count[k]) nodes.push(k);
  const out: NodeMonths = { node: Uint32Array.from(nodes), t: new Uint8Array(nodes.length * 12), p: new Uint8Array(nodes.length * 12), z: new Int16Array(nodes.length) };
  nodes.forEach((k, q) => {
    const c = count[k];
    for (let m = 0; m < 12; m++) {
      out.t[q * 12 + m] = Math.max(0, Math.min(255, Math.round((sum[k * 25 + m] / c) * T_SCALE) + T_OFFSET));
      out.p[q * 12 + m] = encodeRain(sum[k * 25 + 12 + m] / c);
    }
    out.z[q] = Math.max(-32768, Math.min(32767, Math.round(sum[k * 25 + 24] / c)));
  });
  return out;
}

/** A keyframe's parts at each node where the model has land: the nodes of its months, in their order, and each part as the tiles keep it. */
export interface NodeParts {
  node: Uint32Array;
  values: Partial<Record<MonthsPart, Uint8Array | Uint16Array>>;
}

/**
 * One part of a run on the run's own grid: by month, twelve values a cell, month by month and row by row as the
 * temperature is; by year, one a cell. NaN where the source gives none.
 */
export interface PartOfRun {
  part: MonthsPart;
  values: ArrayLike<number>;
}

/**
 * The parts of one run at each node (core/months.ts PARTS), over the same land cells and nodes as monthsOfRun. A part
 * by month is the mean of the node's land cells that have a value in that month, and none where none has. A part by
 * year is kept cell by cell, each cell in the quarter of the node it lies in: a run with more than four cells to a
 * node cannot be kept so, and stops the build.
 */
export function partsOfRun(grid: FieldGrid, lat: ArrayLike<number>, lon: ArrayLike<number>, land: ArrayLike<number>, parts: PartOfRun[]): NodeParts {
  const nlat = lat.length;
  const nlon = lon.length;
  const n = grid.nx * grid.ny;
  // Each land cell's node, and the nodes with land in the order monthsOfRun lists them.
  const nodeOf = new Int32Array(nlat * nlon).fill(-1);
  const has = new Uint8Array(n);
  for (let j = 0; j < nlat; j++) {
    const row = Math.round((grid.lat0 - lat[j]) / grid.step);
    if (row < 0 || row >= grid.ny) continue;
    for (let i = 0; i < nlon; i++) {
      if (land[j * nlon + i] < 0.5) continue;
      const lo = ((lon[i] + 180) % 360) - 180;
      const col = ((Math.round((lo - grid.lon0) / grid.step) % grid.nx) + grid.nx) % grid.nx;
      nodeOf[j * nlon + i] = row * grid.nx + col;
      has[row * grid.nx + col] = 1;
    }
  }
  const nodes: number[] = [];
  const index = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k++) {
    if (!has[k]) continue;
    index[k] = nodes.length;
    nodes.push(k);
  }
  const out: NodeParts = { node: Uint32Array.from(nodes), values: {} };
  for (const { part, values } of parts) {
    const pack = PARTS[part];
    const codes = pack.type === 'uint8' ? new Uint8Array(nodes.length * pack.per).fill(pack.none) : new Uint16Array(nodes.length * pack.per).fill(pack.none);
    if (pack.per === 12) {
      const sum = new Float64Array(nodes.length * 12);
      const count = new Uint16Array(nodes.length * 12);
      for (let j = 0; j < nlat; j++) {
        for (let i = 0; i < nlon; i++) {
          const k = nodeOf[j * nlon + i];
          if (k < 0) continue;
          const q = index[k];
          for (let m = 0; m < 12; m++) {
            const x = values[(m * nlat + j) * nlon + i];
            if (Number.isNaN(x)) continue;
            sum[q * 12 + m] += x;
            count[q * 12 + m]++;
          }
        }
      }
      for (let e = 0; e < codes.length; e++) if (count[e]) codes[e] = pack.encode(sum[e] / count[e]);
    } else {
      const taken = new Uint8Array(nodes.length * 4);
      for (let j = 0; j < nlat; j++) {
        for (let i = 0; i < nlon; i++) {
          const k = nodeOf[j * nlon + i];
          if (k < 0) continue;
          const q = index[k];
          const c = cellOf(grid.lat0 - Math.floor(k / grid.nx) * grid.step, grid.lon0 + (k % grid.nx) * grid.step, lat[j], lon[i]);
          if (taken[q * 4 + c]) throw new Error(`${part}: more than four cells of the run fall to a node of a ${grid.step}° grid, so they cannot be kept cell by cell`);
          taken[q * 4 + c] = 1;
          const x = values[j * nlon + i];
          if (!Number.isNaN(x)) codes[q * 4 + c] = pack.encode(x);
        }
      }
    }
    out.values[part] = codes;
  }
  return out;
}

/** How many bytes of arrays a tile of parts may hold, which sets how many keyframes it spans: with its header, a file stays under 128 kB. */
export const PARTS_TILE_BYTES = 120_000;

/**
 * A climate field's parts in tiles of `deg` degrees (core/months.ts PartsTile), beside its months' and with the same
 * keys: each a span of the keyframes, youngest first, as many as keep a full tile within PARTS_TILE_BYTES. Every tile
 * of the months has a file in every span, even one with no land in it then, so a file's name follows from its span
 * and its key. `chunks` lists each span's keyframes.
 */
export function partsFiles(field: string, base: string, grid: FieldGrid, keys: ClimateKeyframe[], deg: number, tileKeys: string[]): { files: Map<string, Uint8Array>; chunks: number[][]; parts: MonthsPart[] } {
  const across = Math.round(deg / grid.step);
  const box = (i: number, j: number) => ({ lat0: 90 - j * deg, lon0: -180 + i * deg, nx: across, ny: across + 1 });
  const present = MONTHS_PARTS.filter((p) => keys.some((k) => k.parts?.values[p]));
  // What a node weighs at a keyframe: its index, and each part.
  const weight = 2 + present.reduce((n, p) => n + PARTS[p].per * (PARTS[p].type === 'uint8' ? 1 : 2), 0);
  const span = Math.max(1, Math.floor(PARTS_TILE_BYTES / (across * (across + 1) * weight)));
  const files = new Map<string, Uint8Array>();
  const chunks: number[][] = [];
  for (let from = 0; from < keys.length; from += span) {
    const part = keys.slice(from, from + span);
    // Each tile's nodes at each keyframe of the span, as monthsFiles finds them: where in the keyframe, and where in the tile.
    const tiles = new Map<string, Map<number, number[]>>();
    part.forEach((k, kf) => {
      k.parts?.node.forEach((node, q) => {
        const la = grid.lat0 - Math.floor(node / grid.nx) * grid.step;
        const lo = grid.lon0 + (node % grid.nx) * grid.step;
        const key = tileKey(lo, la, deg);
        const [i, j] = key.split('_').map(Number);
        const b = box(i, j);
        let tile = tiles.get(key);
        if (!tile) tiles.set(key, (tile = new Map()));
        let list = tile.get(kf);
        if (!list) tile.set(kf, (list = []));
        list.push(q, Math.round((b.lat0 - la) / grid.step) * b.nx + Math.round(((((lo - b.lon0) % 360) + 360) % 360) / grid.step));
      });
    });
    for (const key of [...tiles.keys()]) if (!tileKeys.includes(key)) throw new Error(`${field}: its parts have land in tile ${key}, where its months have none`);
    for (const key of [...tileKeys].sort()) {
      const tile = tiles.get(key);
      const arrays: (Uint8Array | Uint16Array)[] = [];
      const keyframes: PartsTileHeader['keyframes'] = [];
      part.forEach((k, kf) => {
        const list = tile?.get(kf);
        if (!list || !k.parts) return;
        const count = list.length / 2;
        const node = new Uint16Array(count);
        for (let e = 0; e < count; e++) node[e] = list[e * 2 + 1];
        arrays.push(node);
        const at: PartsTileHeader['keyframes'][number] = { ageMa: k.ageMa, frameMa: k.frameMa ?? k.ageMa, node: arrays.length - 1, parts: {} };
        for (const p of present) {
          const from = k.parts.values[p];
          if (!from) continue;
          const per = PARTS[p].per;
          const to = PARTS[p].type === 'uint8' ? new Uint8Array(count * per) : new Uint16Array(count * per);
          for (let e = 0; e < count; e++) to.set(from.subarray(list[e * 2] * per, list[e * 2] * per + per), e * per);
          arrays.push(to);
          at.parts[p] = arrays.length - 1;
        }
        keyframes.push(at);
      });
      const [i, j] = key.split('_').map(Number);
      const b = box(i, j);
      const header: PartsTileHeader = { format: 'lightworld-months-parts@1', field, grid: { lat0: b.lat0, lon0: b.lon0, step: grid.step, nx: b.nx, ny: b.ny }, keyframes };
      files.set(`${base}/${chunks.length}/${key}.lwt`, encodeTile(header as unknown as Record<string, unknown>, arrays, stableStringify));
    }
    chunks.push(part.map((k) => k.ageMa));
  }
  return { files, chunks, parts: present };
}

/** A climate field's months in tiles of `deg` degrees, each with every keyframe's land nodes in it (core/months.ts tileKey). */
export function monthsFiles(field: string, base: string, grid: FieldGrid, keys: ClimateKeyframe[], deg: number): { files: Map<string, Uint8Array>; tiles: Record<string, string> } {
  const across = Math.round(deg / grid.step);
  const tiles = new Map<string, { i: number; j: number; parts: Map<number, number[]> }>();
  const box = (i: number, j: number) => ({ lat0: 90 - j * deg, lon0: -180 + i * deg, nx: across, ny: across + 1 });
  keys.forEach((k, kf) => {
    const m = k.months;
    if (!m) return;
    m.node.forEach((node, q) => {
      const la = grid.lat0 - Math.floor(node / grid.nx) * grid.step;
      const lo = grid.lon0 + (node % grid.nx) * grid.step;
      const key = tileKey(lo, la, deg);
      const [i, j] = key.split('_').map(Number);
      const b = box(i, j);
      let tile = tiles.get(key);
      if (!tile) tiles.set(key, (tile = { i, j, parts: new Map() }));
      let part = tile.parts.get(kf);
      if (!part) tile.parts.set(kf, (part = []));
      part.push(q, Math.round((b.lat0 - la) / grid.step) * b.nx + Math.round(((((lo - b.lon0) % 360) + 360) % 360) / grid.step));
    });
  });
  const files = new Map<string, Uint8Array>();
  const index: Record<string, string> = {};
  for (const key of [...tiles.keys()].sort()) {
    const tile = tiles.get(key)!;
    const arrays: (Uint8Array | Uint16Array | Int16Array)[] = [];
    const keyframes: MonthsTileHeader['keyframes'] = [];
    keys.forEach((k, kf) => {
      const part = tile.parts.get(kf);
      if (!part) return;
      const m = k.months!;
      const count = part.length / 2;
      const node = new Uint16Array(count);
      const t = new Uint8Array(count * 12);
      const p = new Uint8Array(count * 12);
      const z = new Int16Array(count);
      for (let e = 0; e < count; e++) {
        const q = part[e * 2];
        node[e] = part[e * 2 + 1];
        t.set(m.t.subarray(q * 12, q * 12 + 12), e * 12);
        p.set(m.p.subarray(q * 12, q * 12 + 12), e * 12);
        z[e] = m.z[q];
      }
      arrays.push(node, t, p, z);
      const at = arrays.length - 4;
      keyframes.push({ ageMa: k.ageMa, frameMa: k.frameMa ?? k.ageMa, node: at, t: at + 1, p: at + 2, z: at + 3 });
    });
    const b = box(tile.i, tile.j);
    const header: MonthsTileHeader = { format: 'lightworld-months@1', field, grid: { lat0: b.lat0, lon0: b.lon0, step: grid.step, nx: b.nx, ny: b.ny }, keyframes };
    const file = `${base}/${key}.lwt`;
    files.set(file, encodeTile(header as unknown as Record<string, unknown>, arrays, stableStringify));
    index[key] = file;
  }
  return { files, tiles: index };
}

/** The water balance's parameters (field:earth/runoff), and the height of a place at an age, which sets its snow threshold. */
export interface WaterOptions {
  params: WaterParams & { lake_factor: number };
  height: (ageMa: number) => (lat: number, lon: number) => number;
}

/** A month's runoff of the soil's surplus, as a keyframe keeps it: tenths of a millimetre, in a 16-bit number. */
export const SLOW_STEP_MM = 0.1;

/** What the water balance gives the rivers at each node of a keyframe (field:earth/runoff). */
export interface NodeWater {
  /** the runoff of its land, and what a lake's surface would lose to evaporation beyond the rain on it, mm in a year */
  runoff: Float32Array;
  loss: Float32Array;
  /**
   * each month's runoff of the soil's surplus, in steps of SLOW_STEP_MM, month by month: January's at every node, then
   * February's. The part of the runoff that comes in the months after the soil fills, and not with the rain.
   */
  slow: Uint16Array;
}

/**
 * What a run's months give the rivers at each node: the runoff of its land, and what a lake's surface would lose to
 * evaporation beyond the rain on it, mm in a year, and each month's runoff of the soil's surplus (model:earth/water-
 * balance). Each land cell of the run is balanced on its own and the cells averaged into each node, then spread out over
 * the sea as the climate is.
 */
export function waterOfRun(grid: FieldGrid, lat: ArrayLike<number>, lon: ArrayLike<number>, land: ArrayLike<number>, t: ArrayLike<number>, p: ArrayLike<number>, w: WaterOptions['params'], height: (lat: number, lon: number) => number): NodeWater {
  const nlat = lat.length;
  const nlon = lon.length;
  const n = grid.nx * grid.ny;
  const sum = new Float64Array(n * 2);
  const slowSum = new Float64Array(n * 12);
  const count = new Float64Array(n);
  const months = new Float64Array(12);
  const rains = new Float64Array(12);
  const slowOf: number[] = new Array(12).fill(0);
  for (let j = 0; j < nlat; j++) {
    const row = Math.round((grid.lat0 - lat[j]) / grid.step);
    if (row < 0 || row >= grid.ny) continue;
    for (let i = 0; i < nlon; i++) {
      if (land[j * nlon + i] < 0.5) continue;
      for (let m = 0; m < 12; m++) {
        const at = (m * nlat + j) * nlon + i;
        months[m] = t[at];
        rains[m] = p[at];
      }
      const lo = ((lon[i] + 180) % 360) - 180;
      const y = waterYear(months, rains, lat[j], height(lat[j], lo), w, 5, undefined, slowOf);
      const col = ((Math.round((lo - grid.lon0) / grid.step) % grid.nx) + grid.nx) % grid.nx;
      const k = row * grid.nx + col;
      sum[k * 2] += y.runoff;
      sum[k * 2 + 1] += w.lake_factor * y.pet - y.precip;
      for (let m = 0; m < 12; m++) slowSum[k * 12 + m] += slowOf[m];
      count[k]++;
    }
  }
  // Spread over the sea together, fourteen values a node: the year's runoff and loss, then the months' slow water.
  const C = 14;
  const packed = new Float32Array(n * C).fill(NaN);
  for (let k = 0; k < n; k++) {
    if (!count[k]) continue;
    packed[k * C] = sum[k * 2] / count[k];
    packed[k * C + 1] = sum[k * 2 + 1] / count[k];
    for (let m = 0; m < 12; m++) packed[k * C + 2 + m] = slowSum[k * 12 + m] / count[k];
  }
  const spread = spreadOverSea(grid, packed, 16, C);
  const runoff = new Float32Array(n);
  const loss = new Float32Array(n);
  const slow = new Uint16Array(n * 12);
  for (let k = 0; k < n; k++) {
    runoff[k] = Number.isNaN(spread[k * C]) ? 0 : spread[k * C];
    loss[k] = Number.isNaN(spread[k * C + 1]) ? 0 : spread[k * C + 1];
    for (let m = 0; m < 12; m++) {
      const v = spread[k * C + 2 + m];
      slow[m * n + k] = Number.isNaN(v) ? 0 : Math.min(65535, Math.round(Math.max(0, v) / SLOW_STEP_MM));
    }
  }
  return { runoff, loss, slow };
}

/** The water balance's parameters as field:earth/runoff writes them, one per value so each can say where it comes from. */
export function waterParamsOf(p: Record<string, unknown>): WaterOptions['params'] {
  const n = (k: string) => {
    if (typeof p[k] !== 'number') throw new Error(`field:earth/runoff: params.${k} is not a number`);
    return p[k] as number;
  };
  return {
    hamon: { a: n('hamon_a'), b: n('hamon_b'), c: n('hamon_c') },
    t_rain: n('t_rain'),
    t_snow: n('t_snow'),
    t_snow_high: n('t_snow_high'),
    high_m: n('high_m'),
    melt_max: n('melt_max'),
    direct: n('direct'),
    soil_mm: n('soil_mm'),
    rfactor: n('rfactor'),
    obliquity_deg: n('obliquity_deg'),
    equinox_day: n('equinox_day'),
    lake_factor: n('lake_factor'),
  };
}

/** The height of a place on a 1° snapshot, in metres. */
export function heightOn(s: Snapshot): (lat: number, lon: number) => number {
  return (la, lo) => s.elev[(90 - Math.round(la)) * SRC_W + ((((Math.round(lo) + 180) % 360) + 360) % 360)];
}

/** The nodes of one run: land cells of the model averaged into each node, then spread out over the sea. */
export function nodesOfRun(grid: FieldGrid, lat: ArrayLike<number>, lon: ArrayLike<number>, land: ArrayLike<number>, t: ArrayLike<number>, p: ArrayLike<number>): Float32Array {
  const nlat = lat.length;
  const nlon = lon.length;
  const n = grid.nx * grid.ny;
  const sum = new Float64Array(n * 4);
  const count = new Float64Array(n);
  const months = new Float64Array(12);
  const rains = new Float64Array(12);
  for (let j = 0; j < nlat; j++) {
    const row = Math.round((grid.lat0 - lat[j]) / grid.step);
    if (row < 0 || row >= grid.ny) continue;
    for (let i = 0; i < nlon; i++) {
      if (land[j * nlon + i] < 0.5) continue;
      for (let m = 0; m < 12; m++) {
        const at = (m * nlat + j) * nlon + i;
        months[m] = t[at];
        rains[m] = p[at];
      }
      const c = reduceMonths(months, rains);
      const lo = ((lon[i] + 180) % 360) - 180;
      const col = ((Math.round((lo - grid.lon0) / grid.step) % grid.nx) + grid.nx) % grid.nx;
      const k = row * grid.nx + col;
      sum[k * 4] += c.hot;
      sum[k * 4 + 1] += c.cold;
      sum[k * 4 + 2] += c.aridity;
      sum[k * 4 + 3] += c.margin;
      count[k]++;
    }
  }
  const out = new Float32Array(n * 4).fill(NaN);
  for (let k = 0; k < n; k++) if (count[k]) for (let q = 0; q < 4; q++) out[k * 4 + q] = sum[k * 4 + q] / count[k];
  return out;
}

/** Spread the land's climate out over the sea, a ring of nodes at a time: `channels` values a node, NaN where it has none. */
export function spreadOverSea(grid: FieldGrid, nodes: Float32Array, rings: number, channels = 4): Float32Array {
  const out = nodes.slice();
  const { nx, ny } = grid;
  const C = channels;
  const s = new Float64Array(C);
  for (let r = 0; r < rings; r++) {
    const prev = out.slice();
    let changed = false;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!Number.isNaN(prev[k * C])) continue;
        s.fill(0);
        let c = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= ny) continue;
          for (let di = -1; di <= 1; di++) {
            const q = jj * nx + ((i + di + nx) % nx);
            if (Number.isNaN(prev[q * C])) continue;
            for (let e = 0; e < C; e++) s[e] += prev[q * C + e];
            c++;
          }
        }
        if (!c) continue;
        for (let e = 0; e < C; e++) out[k * C + e] = s[e] / c;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

/**
 * A part of what the tiles keep beside a climate's months, as a field reads it `as: months` from the climate's
 * dataset: the variable of the file, the unit the file must give it, and the value the file gives where it has none.
 */
export interface PartRead {
  part: MonthsPart;
  field: string;
  variable: string;
  unit?: string;
  none?: number;
}

/** A part's values with the file's value for none made NaN, in place. */
function withoutNone<T extends Float32Array | Float64Array>(values: T, none: number | undefined): T {
  if (none !== undefined) for (let i = 0; i < values.length; i++) if (values[i] === none) values[i] = NaN;
  return values;
}

/** Every keyframe of a climate field, oldest run first in the dataset, youngest first here. */
export async function climateKeyframes(world: World, f: Field, snapshots: Snapshot[], plateIndex: Map<number, number>, log: (s: string) => void, water?: WaterOptions, months?: { g0: number }, parts: PartRead[] = []): Promise<ClimateKeyframe[]> {
  const d = world.manifest.datasets[f.data!.from];
  const nc = await openNetcdf(datasetFile(d.id, d));
  // Each part is a variable of the file by run, month, latitude and longitude, in the unit its field says the file gives.
  for (const r of parts) {
    const v = nc.variables.get(r.variable);
    if (!v) throw new Error(`${r.field}: ${d.id} has no variable "${r.variable}"`);
    const dims = v.dims.map((x) => x.name).join(', ');
    if (PARTS[r.part].per !== 12 || dims !== nc.variables.get('T')!.dims.map((x) => x.name).join(', ')) throw new Error(`${r.field}: "${r.variable}" is by ${dims}, which is not read as ${r.part}`);
    if (r.unit !== undefined && v.attrs.units !== r.unit) throw new Error(`${r.field}: the file gives "${r.variable}" in "${String(v.attrs.units)}", not "${r.unit}"`);
  }
  const grid = climateGrid((f.grid as { res_deg: number }).res_deg);
  const lat = await nc.read('lat');
  const lon = await nc.read('lon');
  const runs = nc.variables.get('T')!.dims[0].size;
  const out: ClimateKeyframe[] = [];
  const step = f.time!.step!;
  const stepMyr = Number(/^(\d+)/.exec(step)![1]);
  for (let run = runs - 1; run >= 0; run--) {
    // The runs go from 540 Ma to the pre-industrial, one every 10 Myr.
    const ageMa = (runs - 1 - run) * stepMyr;
    const t = await nc.read('T', run, 1);
    const p = await nc.read('P', run, 1);
    const land = await nc.read('LANDFRAC', run, 1);
    const raw = nodesOfRun(grid, lat, lon, land, t, p);
    const nodes = spreadOverSea(grid, raw, 16);
    const snap = snapshots.find((s) => s.ageMa === ageMa);
    if (!snap) throw new Error(`${f.id}: no elevation snapshot at ${ageMa} Ma to take its plates from`);
    const n = grid.nx * grid.ny;
    const values = new Uint8Array(n * 4);
    const plate = new Uint16Array(n);
    for (let k = 0; k < n; k++) {
      const c: ClimateNode = Number.isNaN(nodes[k * 4]) ? { hot: 0, cold: 0, aridity: 1, margin: 0 } : { hot: nodes[k * 4], cold: nodes[k * 4 + 1], aridity: nodes[k * 4 + 2], margin: nodes[k * 4 + 3] };
      values.set(encodeNode(c), k * 4);
      const row = Math.floor(k / grid.nx);
      const col = k % grid.nx;
      const la = grid.lat0 - row * grid.step;
      const lo = grid.lon0 + col * grid.step;
      const at = (90 - la) * SRC_W + (((lo + 180) % 360) + 360) % 360;
      plate[k] = (plateIndex.get(snap.plate[at]) ?? 0) | (Number.isNaN(raw[k * 4]) ? 0 : LAND_BIT);
    }
    let nodeMonths: NodeMonths | undefined;
    if (months) {
      // The months stand for the model's own ground: its surface geopotential, as a height.
      const phis = await nc.read('PHIS', run, 1);
      const nlon = lon.length;
      nodeMonths = monthsOfRun(grid, lat, lon, land, t, p, (j, i) => phis[j * nlon + i] / months.g0);
    }
    let nodeParts: NodeParts | undefined;
    if (months && parts.length) {
      const read: PartOfRun[] = [];
      for (const r of parts) read.push({ part: r.part, values: withoutNone(await nc.read(r.variable, run, 1), r.none) });
      nodeParts = partsOfRun(grid, lat, lon, land, read);
    }
    out.push({ ageMa, values, plate, nodes, ...(water ? { water: waterOfRun(grid, lat, lon, land, t, p, water.params, water.height(ageMa)) } : {}), ...(nodeMonths ? { months: nodeMonths } : {}), ...(nodeParts ? { parts: nodeParts } : {}) });
  }
  await nc.close();
  log(`climate: ${out.length} keyframes on a ${grid.step}° grid, from ${d.id}`);
  return out;
}

export function encodeClimate(grid: FieldGrid, keys: ClimateKeyframe[], rule: ClimateRule): Uint8Array {
  const arrays: (Uint8Array | Uint16Array)[] = [];
  const keyframes = keys.map((k) => {
    arrays.push(k.values, k.plate);
    return { ageMa: k.ageMa, values: arrays.length - 2, plate: arrays.length - 1, ...(k.frameMa !== undefined ? { frameMa: k.frameMa } : {}) };
  });
  const header: ClimateHeader = { format: 'lightworld-climate@1', grid, keyframes, rule };
  return encodeTile(header as unknown as Record<string, unknown>, arrays, stableStringify);
}

/** What the months importer (tools/world/importers/months.py) writes beside its arrays. */
interface MonthsMeta {
  grid: { latitudes: number[]; longitudes: number[] };
  units: { temperature: string; precipitation: string; time: string };
  slices: { index: number; time: number; cells: number }[];
  /** the other variables kept for the same cells, by the name each is kept under: what the file says of it, and how it was kept */
  more?: Record<string, { variable: string; per: 'month' | 'year'; scale: number; min: number | null; max: number | null; whole: boolean; attributes: Record<string, string> }>;
}

/**
 * The names of a part's classes, by their numbers, as the file of an import gives them: the attributes of its variable
 * that are named after it and a number (`biome_3`). Undefined where it has none.
 */
export async function partClasses(dir: string, part: MonthsPart): Promise<Record<string, string> | undefined> {
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as MonthsMeta;
  const m = meta.more?.[part];
  if (!m) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.attributes)) {
    const n = new RegExp(`^${m.variable.replace(/[^A-Za-z0-9_]/g, '')}_(\\d+)$`).exec(k);
    if (n) out[String(Number(n[1]))] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Every keyframe of a climate field read as months (importMonths): a run of a model at each of its times, on today's
 * coordinates, carried by the plates under them today. Its nodes beyond the latitudes the runs reach are left without a
 * climate, as nodes far from any land are, rather than given the nearest land's.
 */
export async function monthsKeyframes(f: Field, dir: string, present: Snapshot, plateIndex: Map<number, number>, log: (s: string) => void, water?: WaterOptions, months?: { height: (ageMa: number) => (lat: number, lon: number, half: number) => number }, parts: PartRead[] = []): Promise<ClimateKeyframe[]> {
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as MonthsMeta;
  if (meta.units.temperature !== 'degrees celsius' || meta.units.precipitation !== 'millimetres per month' || meta.units.time !== 'years since present') throw new Error(`${f.id}: units ${JSON.stringify(meta.units)} are not read`);
  // Each part was imported under its own name, by month or by year as it is kept, in the unit its field says the file gives.
  for (const r of parts) {
    const m = meta.more?.[r.part];
    if (!m || m.variable !== r.variable) throw new Error(`${r.field}: the import has no "${r.variable}" kept as ${r.part}`);
    if ((m.per === 'month') !== (PARTS[r.part].per === 12)) throw new Error(`${r.field}: "${r.variable}" is by ${m.per}, which is not read as ${r.part}`);
    if (r.unit !== undefined && m.attributes.units !== r.unit) throw new Error(`${r.field}: the file gives "${r.variable}" in "${m.attributes.units}", not "${r.unit}"`);
    // A class is a whole number: a file whose classes were not would have been rounded on the way in.
    if (PARTS[r.part].tolerance(0) === 0 && !m.whole) throw new Error(`${r.field}: "${r.variable}" has values that are not whole numbers, which are not classes`);
  }
  const grid = climateGrid((f.grid as { res_deg: number }).res_deg);
  const lat = meta.grid.latitudes;
  const lon = meta.grid.longitudes;
  const nlat = lat.length;
  const nlon = lon.length;
  const cells = nlat * nlon;
  const [south, north] = [Math.min(...lat), Math.max(...lat)];
  const read = async <T>(path: string, C: { new (b: ArrayBuffer): T }) => {
    const b = await readFile(join(dir, path));
    return new C(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  };
  const out: ClimateKeyframe[] = [];
  for (const sl of meta.slices) {
    const land = await read(`land/${sl.index}.u32`, Uint32Array);
    const t10 = await read(`t/${sl.index}.i16`, Int16Array);
    const p10 = await read(`p/${sl.index}.u16`, Uint16Array);
    // The months on the file's whole grid, as nodesOfRun reads them: month by month, row by row.
    const mask = new Float32Array(cells);
    const t = new Float32Array(12 * cells);
    const p = new Float32Array(12 * cells);
    land.forEach((c, i) => {
      mask[c] = 1;
      for (let m = 0; m < 12; m++) {
        t[m * cells + c] = t10[i * 12 + m] / 10;
        p[m * cells + c] = p10[i * 12 + m] / 10;
      }
    });
    const raw = nodesOfRun(grid, lat, lon, mask, t, p);
    const nodes = spreadOverSea(grid, raw, 16);
    const n = grid.nx * grid.ny;
    const values = new Uint8Array(n * 4);
    const plate = new Uint16Array(n);
    for (let k = 0; k < n; k++) {
      const row = Math.floor(k / grid.nx);
      const la = grid.lat0 - row * grid.step;
      if (la < south - grid.step / 2 || la > north + grid.step / 2) nodes.fill(NaN, k * 4, k * 4 + 4);
      const c: ClimateNode = Number.isNaN(nodes[k * 4]) ? { hot: 0, cold: 0, aridity: 1, margin: 0 } : { hot: nodes[k * 4], cold: nodes[k * 4 + 1], aridity: nodes[k * 4 + 2], margin: nodes[k * 4 + 3] };
      values.set(encodeNode(c), k * 4);
      const lo = grid.lon0 + (k % grid.nx) * grid.step;
      const at = (90 - la) * SRC_W + ((((lo + 180) % 360) + 360) % 360);
      plate[k] = (plateIndex.get(present.plate[at]) ?? 0) | (Number.isNaN(raw[k * 4]) ? 0 : LAND_BIT);
    }
    // Years before the present, as the file counts them.
    const ageMa = Math.round(-sl.time) / 1e6;
    let nodeMonths: NodeMonths | undefined;
    if (months) {
      // The months stand for the land of each cell, as the observed climate they were corrected to does.
      const h = months.height(ageMa);
      const half = Math.abs(lat[1] - lat[0]) / 2;
      nodeMonths = monthsOfRun(grid, lat, lon, mask, t, p, (j, i) => h(lat[j], ((lon[i] + 180) % 360) - 180, half));
    }
    let nodeParts: NodeParts | undefined;
    if (months && parts.length) {
      const readParts: PartOfRun[] = [];
      for (const r of parts) {
        const m = meta.more![r.part];
        const raw = await read(`${r.part}/${sl.index}.u16`, Uint16Array);
        // On the file's whole grid, as its months are: NaN where the file has no land.
        const per = m.per === 'month' ? 12 : 1;
        const v = new Float32Array(per * cells).fill(NaN);
        land.forEach((c, i) => {
          for (let q = 0; q < per; q++) v[q * cells + c] = raw[i * per + q] / m.scale;
        });
        readParts.push({ part: r.part, values: withoutNone(v, r.none) });
      }
      nodeParts = partsOfRun(grid, lat, lon, mask, readParts);
    }
    out.push({ ageMa, frameMa: 0, values, plate, nodes, ...(water ? { water: waterOfRun(grid, lat, lon, mask, t, p, water.params, water.height(ageMa)) } : {}), ...(nodeMonths ? { months: nodeMonths } : {}), ...(nodeParts ? { parts: nodeParts } : {}) });
  }
  out.sort((a, b) => a.ageMa - b.ageMa);
  log(`climate: ${out.length} keyframes on a ${grid.step}° grid, from ${f.data!.from}, ${(out.at(-1)!.ageMa * 1e3).toFixed(0)} ka to the present`);
  return out;
}

/** A fossil forest, against the climate the field gives its place at its time. */
export interface ForestCheck {
  id: string;
  ageMa: number;
  /** the keyframe read, and where the place stood then */
  keyframeMa: number;
  lat: number;
  lon: number;
  climate: ClimateClass | null;
  label: string;
}

/**
 * The outline's check of the biomes: no forest fossil falls in a reconstructed desert. Every record
 * whose evidence is a forest in place, read at its best age and carried there by its plate.
 */
export function forestChecks(s: Solved, keys: ClimateKeyframe[], grid: FieldGrid, rule: ClimateRule): ForestCheck[] {
  const out: ForestCheck[] = [];
  const w = s.world;
  for (const e of w.entities) {
    if (claimOf(s, e.id, 'evidence')?.value !== 'in-situ-forest') continue;
    const loc = claimOf(s, e.id, 'location')?.value as { lat: number; lon: number } | undefined;
    const frame = claimOf(s, e.id, 'frame')?.value as string | undefined;
    const plate = frame ? w.frame.get(frame)?.transform?.plate : undefined;
    const { start } = subjectTime(s, e.id).time;
    // Dated between two bounds, it is read at the middle of them.
    const best = start.best ?? (start.lo !== null && start.hi !== null ? (start.lo + start.hi) / 2 : null);
    if (!loc || !plate || best === null) continue;
    const ageMa = toMa(best);
    const key = [...keys].sort((a, b) => Math.abs(a.ageMa - ageMa) - Math.abs(b.ageMa - ageMa))[0];
    const [lat, lon] = toLatLon(rotate(s.model.total(plate, key.ageMa), rotate(conj(s.model.total(plate, 0)), unitVector(loc.lat, loc.lon))));
    const row = Math.round((grid.lat0 - lat) / grid.step);
    const col = ((Math.round((lon - grid.lon0) / grid.step) % grid.nx) + grid.nx) % grid.nx;
    const k = (row * grid.nx + col) * 4;
    const node = { hot: key.nodes[k], cold: key.nodes[k + 1], aridity: key.nodes[k + 2], margin: key.nodes[k + 3] };
    const climate = Number.isFinite(node.hot) ? climateClass(node, rule) : null;
    out.push({ id: e.id, ageMa: Math.round(ageMa * 1000) / 1000, keyframeMa: key.ageMa, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, climate, label: climate ? CLIMATE_LABEL[climate] : 'no reading' });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
