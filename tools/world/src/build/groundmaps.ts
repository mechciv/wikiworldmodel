// Today's maps of the ground, as a build gives them to a viewer (ground.lwt; core/substrate.ts): the topsoil and the
// rock under it, each on its own grid of today's Earth, with the span of time its field holds it for. And what resolve
// reads of the ground (core/resolve.ts), from these and from the rock record together.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { PeriodRecord } from '../../../../core/records.ts';
import type { ResolveWorld } from '../../../../core/resolve.ts';
import { rockBoxes, type RockBoxes } from '../../../../core/rocks.ts';
import { bedrockAt, firstGround, groundAnswer, groundHeld, substrateOfRocks, substrateOfSoil, type GroundHeader, type GroundMap, type GroundMaps, type SceneSubstrate, type SubstrateRule } from '../../../../core/substrate.ts';
import { parsePoint, type TimePointInput } from '../../../../core/time.ts';
import { datasetFile } from '../manifest.ts';
import { parseTopsoil } from '../soilgrids.ts';
import type { Field, World } from '../world.ts';
import type { RocksOut } from './rocks.ts';

export interface GroundBuilt {
  header: GroundHeader;
  arrays: Uint8Array[];
  maps: GroundMaps;
}

/** What a field of today's ground says of itself: the span it is held for, and the period of the chart that names it. */
function mapOf(world: World, periods: PeriodRecord[], f: Field, res: number, array: number): GroundMap {
  const lo = parsePoint(f.time!.lo as TimePointInput).t;
  const hi = f.projection ? parsePoint(f.projection.until as TimePointInput).t : parsePoint(f.time!.hi as TimePointInput).t;
  const heldId = (f.params as { held?: string } | undefined)?.held;
  const held = heldId ? periods.find((p) => p.id === heldId) : undefined;
  if (heldId && !held) throw new Error(`${f.id}: it is held for ${heldId}, which is no period of the world`);
  // The field's time is a date written twice: it must be the period's own.
  if (held && Math.abs(held.start - lo) > 1e-6 * Math.max(1, Math.abs(lo))) throw new Error(`${f.id}: its time begins at ${lo}, and ${held.id} begins at ${held.start}`);
  const d = world.manifest.datasets[f.data!.from];
  return { field: f.id, title: f.title, source: f.data!.from, ...(d?.credit ? { credit: d.credit } : {}), ...(held ? { held: held.name } : {}), span: [lo, hi], res, nx: Math.round(360 / res), ny: Math.round(180 / res), array };
}

/** The topsoil's grid from its snapshot: four bytes a cell, each part in half percents. */
export function soilBytes(text: string, res: number): Uint8Array {
  const nx = Math.round(360 / res);
  const ny = Math.round(180 / res);
  const out = new Uint8Array(nx * ny * 4);
  const half = (v: number) => Math.max(0, Math.min(255, Math.round(v * 2)));
  for (const c of parseTopsoil(text)) {
    // A row's latitude and longitude are its south-west corner.
    const row = (90 - c.lat) / res - 1;
    const col = (c.lon + 180) / res;
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= ny || col < 0 || col >= nx) throw new Error(`a cell of the topsoil is at ${c.lat}, ${c.lon}: not a corner of a grid of ${res}°`);
    out.set([half(c.sand), half(c.silt), half(c.clay), half(c.coarse)], (row * nx + col) * 4);
  }
  return out;
}

/** A grid in Esri's ASCII form, as the lithological map is given: its header, then rows from the north. */
export function ascGrid(text: string): { nx: number; ny: number; res: number; west: number; south: number; nodata: number; values: Int32Array } {
  const lines = text.split(/\r?\n/);
  const head: Record<string, number> = {};
  let at = 0;
  for (; at < lines.length; at++) {
    const m = /^\s*([A-Za-z_]+)\s+(-?[\d.]+)\s*$/.exec(lines[at]);
    if (!m) break;
    head[m[1].toLowerCase()] = Number(m[2]);
  }
  const nx = head.ncols;
  const ny = head.nrows;
  if (!nx || !ny || !head.cellsize) throw new Error('an ASCII grid has no ncols, nrows or cellsize');
  const values = new Int32Array(nx * ny);
  let k = 0;
  for (; at < lines.length; at++) for (const v of lines[at].trim().split(/\s+/)) if (v) values[k++] = Number(v);
  if (k !== nx * ny) throw new Error(`an ASCII grid of ${nx} × ${ny} has ${k} values`);
  return { nx, ny, res: head.cellsize, west: head.xllcorner, south: head.yllcorner, nodata: head.nodata_value, values };
}

/** The classes' numbers and codes, from the table that comes with the lithological map. */
export function classTable(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const rows = text.split(/\r?\n/).filter((l) => l.trim());
  const head = rows[0].split(';').map((h) => h.replace(/"/g, ''));
  const value = head.indexOf('Value_');
  const code = head.indexOf('xx');
  if (value < 0 || code < 0) throw new Error('the table of classes has no Value_ or xx column');
  for (const r of rows.slice(1)) {
    const f = r.split(';').map((v) => v.replace(/"/g, ''));
    out.set(Number(f[value]), f[code]);
  }
  return out;
}

/**
 * Today's maps of the ground, for the fields the world has of them: undefined where it has neither, or neither's
 * dataset has been fetched.
 */
export async function buildGround(world: World, periods: PeriodRecord[], log: (m: string) => void): Promise<GroundBuilt | undefined> {
  const header: GroundHeader = { format: 'lightworld-ground@1' };
  const arrays: Uint8Array[] = [];
  const maps: GroundMaps = { header };
  const soilField = world.fields.find((f) => f.data?.as === 'topsoil');
  if (soilField) {
    const id = soilField.data!.from;
    const path = datasetFile(id, world.manifest.datasets[id], soilField.data!.file);
    if (existsSync(path)) {
      const res = (soilField.grid as { res_deg: number }).res_deg;
      maps.soil = soilBytes(await readFile(path, 'utf8'), res);
      header.soil = mapOf(world, periods, soilField, res, arrays.length);
      arrays.push(maps.soil);
      let n = 0;
      for (let k = 0; k < maps.soil.length; k += 4) if (maps.soil[k] + maps.soil[k + 1] + maps.soil[k + 2] > 0) n++;
      log(`ground  ${soilField.id}: ${n.toLocaleString('en-US')} cells of ${res}° with a soil, held${header.soil.held ? ` through the ${header.soil.held}` : ''}`);
    } else log(`ground  ${soilField.id} not built: no dataset ${id} yet`);
  }
  const rockField = world.fields.find((f) => f.data?.as === 'bedrock');
  if (rockField) {
    const id = rockField.data!.from;
    const d = world.manifest.datasets[id];
    const path = datasetFile(id, d, rockField.data!.file);
    const p = rockField.params as unknown as { table?: string; classes: { value: number; code: string; label: string }[] };
    if (existsSync(path)) {
      const res = (rockField.grid as { res_deg: number }).res_deg;
      const g = ascGrid(await readFile(path, 'utf8'));
      if (g.res !== res || g.west !== -180 || g.south !== -90 || g.nx !== Math.round(360 / res) || g.ny !== Math.round(180 / res)) throw new Error(`${rockField.id}: its grid is ${g.nx} × ${g.ny} cells of ${g.res}° from ${g.west}, ${g.south}, and the field says ${res}° over the whole Earth`);
      // The field's classes are the dataset's own, number for number and code for code.
      if (p.table) {
        const own = classTable(await readFile(datasetFile(id, d, p.table), 'utf8'));
        for (const c of p.classes) if (own.get(c.value) !== c.code) throw new Error(`${rockField.id}: class ${c.value} is ${c.code} here and ${own.get(c.value) ?? 'not'} in the dataset's table`);
        for (const [v, code] of own) if (!p.classes.some((c) => c.value === v)) throw new Error(`${rockField.id}: the dataset's class ${v} (${code}) is not among the field's`);
      }
      const known = new Set(p.classes.map((c) => c.value));
      maps.bedrock = new Uint8Array(g.nx * g.ny);
      let n = 0;
      for (let k = 0; k < g.values.length; k++) {
        const v = g.values[k];
        if (v === g.nodata) continue;
        if (!known.has(v)) throw new Error(`${rockField.id}: its grid has a value ${v} that is no class of the field's`);
        maps.bedrock[k] = v;
        n++;
      }
      header.bedrock = { ...mapOf(world, periods, rockField, res, arrays.length), classes: Object.fromEntries(p.classes.map((c) => [String(c.value), { code: c.code, label: c.label }])) };
      arrays.push(maps.bedrock);
      log(`ground  ${rockField.id}: ${n.toLocaleString('en-US')} cells of ${res}° with a class, held${header.bedrock.held ? ` through the ${header.bedrock.held}` : ''}`);
    } else log(`ground  ${rockField.id} not built: no dataset ${id} yet`);
  }
  return arrays.length ? { header, arrays, maps } : undefined;
}

/**
 * What resolve reads of the ground: the rocks of the stage at the place itself, then today's topsoil, then the rocks of
 * the country round, and where none says what the loose ground is, the rock under it. A place is asked where it stands
 * at the time: within the spans the maps are held for, its plate has carried it a few cells of them at most.
 */
export function groundResolve(rocks: RocksOut | undefined, ground: GroundBuilt | undefined, rule: SubstrateRule): NonNullable<ResolveWorld['substrate']> {
  const refs = rocks?.index.bins ?? [];
  const boxes = new Map<number, RockBoxes>();
  const h = ground?.header;
  const spans: [number, number][] = [...refs.map((b): [number, number] => [b.from, b.to]), ...(h?.soil ? [h.soil.span] : []), ...(h?.bedrock ? [h.bedrock.span] : [])];
  return {
    span: [Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))],
    at: (lat, lon, t) => {
      const k = refs.findIndex((b) => t >= b.from && t <= b.to);
      let rock: SceneSubstrate | undefined;
      if (rocks && k >= 0) {
        let bx = boxes.get(k);
        if (!bx) {
          bx = rockBoxes(rocks.bins[k]);
          boxes.set(k, bx);
        }
        rock = substrateOfRocks(rocks.bins[k], rocks.index, rule, lat, lon, bx);
      }
      const s = firstGround(rock, () => (ground && groundHeld(h?.soil, t) ? substrateOfSoil(ground.maps, rule, lat, lon) : undefined));
      if (s) return groundAnswer(s, undefined);
      return groundAnswer(undefined, ground && groundHeld(h?.bedrock, t) ? bedrockAt(ground.maps, rule, lat, lon) : undefined);
    },
  };
}
