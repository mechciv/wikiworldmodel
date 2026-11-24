// Rows are claims (docs/STRUCTURE.md section 3.1). A dataset read as rows is a source whose rows are
// claims: the same meaning as a record's claims, stored in bulk. Each row has an address,
// src:<dataset>#<key>, made from its own columns by the field's `rows.key` template; the field's
// `rows.claims` says which column is which property, read how, with which method and basis.
//
// A record cannot be written into a dataset, so an overlay (world/overlays/) names a row as its subject
// and corrects it, ranks it, corroborates it or ties it to an entity. The row stays as the dataset gives
// it; a correction is a competing claim, ranked preferred, and the build reads the row with it applied.
// Storage is unchanged: the pinned files are read as they are, and only the meaning is shared.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { bounds, parsePoint, parseTime, toMa, type TimeInput } from '../../../core/time.ts';
import type { Basis } from '../../../core/tileset.ts';
export { rowRef } from '../../../core/refs.ts';
import { parseTable } from './build/series.ts';
import { pointOf, solveScenario } from './chronology.ts';
import { datasetFile } from './manifest.ts';
import type { Citation, Field, World } from './world.ts';
import { rockRows, type LandSnapshot, type RockRow, type RocksSnapshot } from './pbdb.ts';
import { unitRows, type ColumnsSnapshot, type UnitRow } from './macrostrat.ts';

/** How a column's raw value becomes a claim's value, and back. */
export type Conversion = 'string' | 'number' | 'text' | 'year' | 'year-end' | 'ma' | 'ma-range' | 'point';

export interface ColumnMap {
  /** the column; for a point its latitude and longitude columns, for a range of ages its older and younger */
  column: string | [string, string];
  as?: Conversion;
  /** raw values that mean the dataset gives none */
  none?: (string | number)[];
  method?: string;
  basis?: Basis;
}

export interface RowsSpec {
  /** what kind of thing a row is, for the properties that apply to it */
  kind: string;
  /** how a row's key is made from its columns: {Column} for a column, {#} for its place in the file */
  key: string;
  /** which property each column gives */
  claims: Record<string, ColumnMap>;
}

export interface Table {
  dataset: string;
  field: string;
  spec: RowsSpec;
  /** each row's columns, by key, in the dataset's order */
  rows: Map<string, Record<string, unknown>>;
}

/** A claim a row makes, as the world's claims are: its value, and where in the dataset it comes from. */
export interface RowClaim {
  prop: string;
  value: unknown;
  source: Citation;
  method?: string;
  basis: Basis;
}

export class RowKeyError extends Error {}

/** A row's key from its columns by the template, e.g. "{Name}@{FromYear}" or "occ:{occurrence}". */
export function rowKey(template: string, columns: Record<string, unknown>, index: number): string {
  return template.replace(/\{([^}]+)\}/g, (_, c: string) => {
    if (c === '#') return String(index);
    if (missing(columns[c])) throw new RowKeyError(`row ${index}: missing key column ${c} in ${template}`);
    return String(columns[c]);
  });
}

const missing = (v: unknown, none?: (string | number)[]) => v === undefined || v === null || v === '' || (none ?? []).includes(v as string | number);

/** A column's raw value as a claim's value; undefined where the dataset gives none. */
export function toValue(map: ColumnMap, columns: Record<string, unknown>): unknown {
  const as = map.as ?? 'string';
  if (as === 'point') {
    const [la, lo] = map.column as [string, string];
    if (missing(columns[la], map.none) || missing(columns[lo], map.none)) return undefined;
    return { lat: Number(columns[la]), lon: Number(columns[lo]), frame: 'frame:earth/present-day' };
  }
  // Ages in millions of years: one, or the range between the older and the younger.
  if (as === 'ma-range') {
    const [older, younger] = map.column as [string, string];
    if (missing(columns[older], map.none) || missing(columns[younger], map.none)) return undefined;
    const a = Number(columns[older]);
    const b = Number(columns[younger]);
    return a === b ? `${a} Ma` : { lo: `${a} Ma`, hi: `${b} Ma` };
  }
  const raw = columns[map.column as string];
  if (missing(raw, map.none)) return undefined;
  switch (as) {
    case 'string':
      return String(raw);
    case 'number':
      return Number(raw);
    case 'text':
      return { en: String(raw) };
    // A year as datasets count them, with no year 0 (a stray 0 is read as 1 BCE), on the world's axis.
    case 'year':
      return Number(raw) < 0 ? Number(raw) + 1 : Number(raw);
    // The same, holding to the end of the year.
    case 'year-end':
      return (Number(raw) < 0 ? Number(raw) + 1 : Number(raw)) + 1;
    case 'ma':
      return `${Number(raw)} Ma`;
  }
}

/** A scalar time column stores a point on the world's axis. */
function scalarDate(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`expected a single date, got ${JSON.stringify(value)}`);
  const point = parsePoint(value);
  if (!Number.isFinite(point.t)) throw new Error(`date is outside the finite time axis: ${value}`);
  return point;
}

/** Project referenced fossil ages in the default picture. Only the build's row copy gets the bounds. */
export function rowValueProjector(world: World) {
  let solution: ReturnType<typeof solveScenario> | undefined;
  return (map: ColumnMap | undefined, value: unknown): unknown => {
    if (map?.as !== 'ma-range' || !value || typeof value !== 'object' || !('ref' in value)) return value;
    const date = parseTime(value as TimeInput);
    if (date.kind !== 'ref' || date.lagDays) return undefined;
    solution ??= solveScenario(world);
    if (!solution.ok) return undefined;
    const start = solution.bounds.get(pointOf(world, date.ref, date.edge ?? 'start'));
    const end = solution.bounds.get(pointOf(world, date.ref, date.edge ?? 'end'));
    if (!start || !end) return undefined;
    const lo = start.lo + date.lag[0];
    const hi = end.hi + date.lag[1];
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
    return { lo: `${toMa(lo)} Ma`, hi: `${toMa(hi)} Ma` };
  };
}

/** A claim's value written back into the columns it comes from: how a correction reaches the build. */
export function fromValue(map: ColumnMap, value: unknown, columns: Record<string, unknown>): void {
  const as = map.as ?? 'string';
  if (as === 'point') {
    const p = value as { lat: number; lon: number };
    const [la, lo] = map.column as [string, string];
    columns[la] = p.lat;
    columns[lo] = p.lon;
    return;
  }
  if (as === 'ma-range') {
    const [older, younger] = map.column as [string, string];
    const t = parseTime(value as TimeInput);
    const [lo, hi] = bounds(t);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('a fossil age needs finite bounds');
    columns[older] = toMa(lo);
    columns[younger] = toMa(hi);
    return;
  }
  const c = map.column as string;
  switch (as) {
    case 'string':
      columns[c] = String(value);
      return;
    case 'number':
      columns[c] = Number(value);
      return;
    case 'text':
      columns[c] = Object.values(value as Record<string, string>)[0];
      return;
    case 'year':
    case 'year-end': {
      const { t, whole } = scalarDate(value);
      // A named calendar year, month or day belongs to its containing year.
      // A numeric end is an exclusive axis boundary, including at the BCE/CE transition.
      const y = as === 'year-end' && !(typeof value === 'string' && whole > 0) ? Math.ceil(t) - 1 : Math.floor(t);
      columns[c] = y <= 0 ? y - 1 : y;
      return;
    }
    case 'ma':
      columns[c] = toMa(scalarDate(value).t);
      return;
  }
}

/** What a row says, property by property. */
export function rowClaims(table: Table, key: string, columns = table.rows.get(key)): RowClaim[] {
  if (!columns) return [];
  const out: RowClaim[] = [];
  for (const [prop, map] of Object.entries(table.spec.claims)) {
    const value = toValue(map, columns);
    if (value === undefined) continue;
    out.push({ prop, value, source: { ref: table.dataset, loc: `row ${key}` }, method: map.method, basis: map.basis ?? 'evidence' });
  }
  return out;
}

/** The column a GeoJSON feature's geometry is kept in. */
export const GEOMETRY = '__geometry';

/** The raw rows of a dataset, as columns, by how the field reads it. */
export async function rawRows(world: World, field: Field): Promise<Record<string, unknown>[] | undefined> {
  const id = field.data!.from;
  const d = world.manifest.datasets[id];
  if (!d) return undefined;
  if (field.data!.as === 'community') {
    const snap = world.landFossils.get(id);
    return snap ? fossilRows(snap) : undefined;
  }
  if (field.data!.as === 'rock-record') {
    const path = datasetFile(id, d, field.data!.file ?? (d.fetch.files ? Object.keys(d.fetch.files)[0] : undefined));
    return existsSync(path) ? rockRows(JSON.parse(await readFile(path, 'utf8')) as RocksSnapshot) : undefined;
  }
  if (field.data!.as === 'strata') {
    const path = datasetFile(id, d, field.data!.file ?? (d.fetch.files ? Object.keys(d.fetch.files)[0] : undefined));
    return existsSync(path) ? unitRows(JSON.parse(await readFile(path, 'utf8')) as ColumnsSnapshot) : undefined;
  }
  const member = field.data!.file ?? (d.fetch.files ? Object.keys(d.fetch.files)[0] : undefined);
  const path = datasetFile(id, d, member);
  if (!existsSync(path)) return undefined;
  const text = await readFile(path, 'utf8');
  if (d.fetch.format === 'csv' || d.fetch.format === 'tsv') return parseTable(text);
  if (field.data!.as === 'community-sea') return fossilRows(JSON.parse(text) as LandSnapshot);
  const doc = JSON.parse(text) as { features?: { properties: Record<string, unknown>; geometry?: unknown }[]; rows?: Record<string, unknown>[] };
  // A feature's geometry rides along as a column of its own, for what draws it; no property reads it.
  if (doc.features) return doc.features.map((f) => ({ ...f.properties, [GEOMETRY]: f.geometry ?? null }));
  return doc.rows;
}

/** Read an occurrence from a compact land or marine snapshot, joined to its collection and taxon. */
function occurrenceReader(snap: LandSnapshot) {
  const names = new Map(snap.taxa.map((t) => [t[0], t[1]]));
  return ([occurrence, site, taxon]: LandSnapshot['rows'][number]): Record<string, unknown> => {
    const s = snap.sites[site];
    return { occurrence, collection: s[0], lat: s[1], lng: s[2], max_ma: s[3], min_ma: s[4], formation: snap.words[s[5]] ?? '', taxon: `txn:${taxon}`, taxon_name: names.get(taxon) ?? '' };
  };
}

export function fossilRows(snap: LandSnapshot): Record<string, unknown>[] {
  return snap.rows.map(occurrenceReader(snap));
}

/** A field's dataset as a table of rows by key, if the field says how its rows are keyed and the dataset is here. */
export async function readTable(world: World, field: Field): Promise<Table | undefined> {
  if (!field.rows || !field.data) return undefined;
  const raw = await rawRows(world, field);
  if (!raw) return undefined;
  const rows = new Map<string, Record<string, unknown>>();
  raw.forEach((columns, i) => {
    const key = rowKey(field.rows!.key, columns, i);
    if (rows.has(key)) throw new RowKeyError(`${field.id}: duplicate row key "${key}" at row ${i}`);
    rows.set(key, columns);
  });
  return { dataset: field.data.from, field: field.id, spec: field.rows, rows };
}

/** Every table the world's fields declare, by dataset; a dataset not fetched here has none. */
export async function readTables(world: World): Promise<Map<string, Table>> {
  const out = new Map<string, Table>();
  for (const f of world.fields) {
    const t = await readTable(world, f);
    if (t) out.set(t.dataset, t);
  }
  return out;
}

/** A row's columns with the overlays' preferred claims written into them, and what was changed. */
export function correctedColumns(table: Table, key: string, corrections: { prop: string; value: unknown }[]): { columns: Record<string, unknown>; changed: string[] } | undefined {
  const base = table.rows.get(key);
  if (!base) return undefined;
  return applyCorrections(table.spec, base, corrections);
}

function applyCorrections<T extends Record<string, unknown>>(spec: RowsSpec, base: T, corrections: Fix[]): { columns: T; changed: string[] } {
  const columns = { ...base };
  const changed: string[] = [];
  for (const c of corrections) {
    const map = spec.claims[c.prop];
    if (!map) continue;
    fromValue(map, c.value, columns);
    changed.push(c.prop);
  }
  return { columns, changed };
}

export type Fix = { prop: string; value: unknown };

/**
 * A dataset's raw rows with the overlays' corrections written into their columns: each row's key, the rows (a
 * corrected one is a copy; the rest are as they were), and what was changed in which.
 */
export function correctRows<T extends Record<string, unknown>>(spec: RowsSpec, rows: T[], fixes: Map<string, Fix[]>): { keys: string[]; rows: T[]; changed: Map<number, string[]> } {
  const keys: string[] = [];
  const changed = new Map<number, string[]>();
  const out = rows.map((columns, i) => {
    const key = rowKey(spec.key, columns, i);
    keys.push(key);
    const fix = fixes.get(key);
    if (!fix?.length) return columns;
    const updated = applyCorrections(spec, columns, fix);
    if (updated.changed.length) changed.set(i, updated.changed);
    return updated.columns;
  });
  return { keys, rows: out, changed };
}

/**
 * The rocks of the collections with corrections applied: a corrected place, age, environment, lithology or formation
 * written into the collection's own row. Returns the snapshot itself where no overlay names a row of it.
 */
export function correctRocks(snap: RocksSnapshot, spec: RowsSpec, fixes: Map<string, Fix[]>): RocksSnapshot {
  if (!fixes.size) return snap;
  const { rows, changed } = correctRows(spec, rockRows(snap), fixes);
  if (!changed.size) return snap;
  const words = [...snap.words];
  const at = new Map(words.map((w, i) => [w, i]));
  const word = (w: unknown): number => {
    const key = String(w ?? '');
    let k = at.get(key);
    if (k === undefined) {
      k = words.length;
      words.push(key);
      at.set(key, k);
    }
    return k;
  };
  const collections = [...snap.collections];
  for (const i of changed.keys()) {
    const r = rows[i];
    const c = [...collections[i]] as RockRow;
    c[1] = Number(r.lat);
    c[2] = Number(r.lng);
    c[3] = Number(r.max_ma);
    c[4] = Number(r.min_ma);
    c[5] = word(r.environment);
    c[7] = word(r.formation);
    c[8] = word(r.lithology);
    c[9] = word(r.lithology_adjectives);
    c[12] = word(r.lithology2);
    c[13] = word(r.lithology2_adjectives);
    collections[i] = c;
  }
  return { ...snap, words, collections };
}

/**
 * The units of the columns of rock with corrections applied: a corrected name, or a corrected age of its start or its
 * end, written into the unit's own row. What a correction says of a unit's lithologies, its environments or its place
 * cannot be written back, since a row gives those as its dataset's own lists and its column's point: such corrections
 * are returned as unapplied, and so is one that would end a unit before it began. Returns the snapshot itself where no
 * overlay names a row of it.
 */
export function correctUnits(snap: ColumnsSnapshot, spec: RowsSpec, fixes: Map<string, Fix[]>): { snap: ColumnsSnapshot; unapplied: string[] } {
  if (!fixes.size) return { snap, unapplied: [] };
  const { keys, rows, changed } = correctRows(spec, unitRows(snap), fixes);
  if (!changed.size) return { snap, unapplied: [] };
  const words = [...snap.words];
  const at = new Map(words.map((w, i) => [w, i]));
  const word = (w: unknown): number => {
    const key = String(w ?? '');
    let k = at.get(key);
    if (k === undefined) {
      k = words.length;
      words.push(key);
      at.set(key, k);
    }
    return k;
  };
  const units = [...snap.units];
  const unapplied: string[] = [];
  for (const [i, props] of changed) {
    const r = rows[i];
    const u = [...units[i]] as UnitRow;
    for (const p of props) {
      for (const column of [spec.claims[p].column].flat()) {
        if (column === 'label') u[4] = word(r.label);
        else if (column === 'older_ma') u[5] = Number(r.older_ma);
        else if (column === 'younger_ma') u[6] = Number(r.younger_ma);
        else unapplied.push(`${keys[i]}: a corrected ${p} cannot be written into a unit's row`);
      }
    }
    if (!Number.isFinite(u[5]) || !Number.isFinite(u[6]) || u[5] < u[6]) unapplied.push(`${keys[i]}: corrected, it would run from ${u[5]} to ${u[6]} Ma`);
    else units[i] = u;
  }
  return { snap: { ...snap, words, units }, unapplied };
}

/**
 * Land or marine fossils with corrections applied: a corrected place, formation or age gives the occurrence a site of its own,
 * and a corrected name the taxon the snapshot has by that name, if it has one. Returns the corrected snapshot and
 * what could not be applied.
 */
export function correctFossils(snap: LandSnapshot, spec: RowsSpec, fixes: Map<string, Fix[]>): { snap: LandSnapshot; unapplied: string[] } {
  if (!fixes.size) return { snap, unapplied: [] };
  const read = occurrenceReader(snap);
  const sites = [...snap.sites];
  const out = [...snap.rows];
  const words = [...snap.words];
  const byName = new Map<string, number>();
  for (const t of snap.taxa) if (!byName.has(t[1])) byName.set(t[1], t[0]);
  const unapplied: string[] = [];
  for (const [i, row] of snap.rows.entries()) {
    const columns = read(row);
    const fix = fixes.get(rowKey(spec.key, columns, i));
    if (!fix?.length) continue;
    const { columns: r } = applyCorrections(spec, columns, fix);
    const [occ, site, taxon] = row;
    let s = site;
    let x = taxon;
    if (['lat', 'lng', 'max_ma', 'min_ma', 'formation'].some((c) => r[c] !== columns[c])) {
      const old = snap.sites[site];
      let formation = old[5];
      if (r.formation !== columns.formation) {
        formation = words.indexOf(String(r.formation));
        if (formation === -1) formation = words.push(String(r.formation)) - 1;
      }
      sites.push([old[0], Number(r.lat), Number(r.lng), Number(r.max_ma), Number(r.min_ma), formation]);
      s = sites.length - 1;
    }
    if (r.taxon_name !== columns.taxon_name) {
      const no = byName.get(String(r.taxon_name));
      if (no === undefined) unapplied.push(`occ:${occ}: the snapshot has no taxon named ${String(r.taxon_name)}`);
      else x = no;
    }
    out[i] = [occ, s, x];
  }
  return { snap: { ...snap, sites, rows: out, words }, unapplied };
}
