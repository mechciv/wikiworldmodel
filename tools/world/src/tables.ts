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
import type { Basis } from '../../../core/tileset.ts';
import { parsePoint, toMa, type TimePointInput } from '../../../core/time.ts';
export { rowRef } from '../../../core/refs.ts';
import { parseTable } from './build/series.ts';
import { datasetPath, resolveDatasetFile } from './manifest.ts';
import { delimitedOf, eachRow, type Delimited, type TableSource } from './rowstream.ts';
import type { Citation, Field, World } from './world.ts';
import { rockRows, type LandSnapshot, type RockRow, type RocksSnapshot } from './pbdb.ts';
import { unitRows, type ColumnsSnapshot, type UnitRow } from './macrostrat.ts';

function toMaValue(v: TimePointInput): number {
  if (typeof v === 'number') return v;
  const trimmed = String(v).trim();
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return Math.round(toMa(parsePoint(trimmed).t) * 1e9) / 1e9;
}

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
  /** for a text: the language it is in, by its code (en by default; la for a taxon's name) */
  lang?: string;
}

export interface RowsSpec {
  /** what kind of thing a row is, for the properties that apply to it */
  kind: string;
  /** how a row's key is made from its columns: {Column} for a column, {#} for its place in the file */
  key: string;
  /** which property each column gives */
  claims: Record<string, ColumnMap>;
  /**
   * A list of things (core/things.ts): each row is the thing <scheme>:<key>, known by the id its dataset gives it, the same
   * in every snapshot. Only a key made from the dataset's own ids can have one: never {#}.
   */
  scheme?: string;
  /** for a list that is a tree: the key of the row each hangs from, the first of the templates that gives one, and the relation */
  parent?: { key: string | string[]; rel: string };
  /** the ids of other schemes that its columns give, by scheme: the column */
  same_as?: Record<string, string>;
  /** the properties for which this list's value is preferred over another list's, of a thing that is in both */
  preferred?: string[];
  /** which rows are rows of the list: a row is one only where each of these columns holds one of the values given */
  where?: Record<string, string | string[]>;
  /** other names of the list's things, from rows that name them: in the list's own table, or another of its dataset's */
  names?: NamesSpec[];
  /**
   * A thing of this list is the thing of another scheme with the same values of these properties, where no id says so
   * (docs/plans/ENTITIES.md, step 4): where exactly one thing of each list has them, and the parent of one is above the
   * other in its list, or one is at the top of its list. Never by a name alone. The page says it was matched so, and the
   * other scheme's thing stands for both.
   */
  match?: { scheme: string; by: string[] };
}

/** Rows that give another name of a thing of the list: its synonyms, its common names. */
export interface NamesSpec {
  /** another dataset they are in, where they are not in the list's own: a gazetteer's table of names beside its places */
  from?: string;
  /** the dataset's file or archive member they are in, where it is not the list's own */
  file?: string;
  /** which rows give one */
  where?: Record<string, string | string[]>;
  /** the key of the thing a row names, as a template of its columns */
  of: string;
  /** the column of the name */
  name: string;
  /** the language the names are in, by its code */
  lang?: string;
  /** what such a name is, in a word or two: a synonym, a common name */
  note: string;
}

/** A table's rows by key, as a Map holds them or as a list of millions is kept (ColumnRows). */
export interface RowMap {
  readonly size: number;
  has(key: string): boolean;
  get(key: string): Record<string, unknown> | undefined;
  keys(): Iterable<string>;
  [Symbol.iterator](): Iterator<[string, Record<string, unknown>]>;
}

export interface Table {
  dataset: string;
  field: string;
  spec: RowsSpec;
  /** each row's columns, by key, in the dataset's order */
  rows: RowMap;
  /** other names of its rows, where the field reads some (spec.names) */
  names?: TableNames;
}

/** The other names of a list's rows: each the row it names, by its place, its text, and which of the field's names it is. */
export interface TableNames {
  at: Int32Array;
  text: string[];
  set: Uint8Array;
}

/** A claim a row makes, as the world's claims are: its value, and where in the dataset it comes from. */
export interface RowClaim {
  prop: string;
  value: unknown;
  source: Citation;
  method?: string;
  basis: Basis;
}

/** A row's key from its columns by the template, e.g. "{Name}@{FromYear}" or "occ:{occurrence}". */
export function rowKey(template: string, columns: Record<string, unknown>, index: number): string {
  return template.replace(/\{([^}]+)\}/g, (_, c: string) => (c === '#' ? String(index) : String(columns[c] ?? '')));
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
      return { [map.lang ?? 'en']: String(raw) };
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
    const r = typeof value === 'object' && value !== null ? (value as { lo: TimePointInput; hi: TimePointInput }) : { lo: value as TimePointInput, hi: value as TimePointInput };
    columns[older] = toMaValue(r.lo);
    columns[younger] = toMaValue(r.hi);
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
      const yr = typeof value === 'number' ? value : parsePoint(value as TimePointInput).t;
      const y = yr - (as === 'year-end' ? 1 : 0);
      columns[c] = y <= 0 ? y - 1 : y;
      return;
    }
    case 'ma':
      columns[c] = toMaValue(value as TimePointInput);
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
    return snap ? landRows(snap) : undefined;
  }
  if (field.data!.as === 'taxa') {
    const snap = world.landFossils.get(id) ?? (await snapshotOf<LandSnapshot>(id, d, field.data!.file));
    return snap ? taxaRows(snap) : undefined;
  }
  if (field.data!.as === 'rock-record') {
    const path = resolveDatasetFile(id, d, field.data!.file ?? (d.fetch.files ? Object.keys(d.fetch.files)[0] : undefined));
    return existsSync(path) ? rockRows(JSON.parse(await readFile(path, 'utf8')) as RocksSnapshot) : undefined;
  }
  if (field.data!.as === 'strata') {
    const path = resolveDatasetFile(id, d, field.data!.file ?? (d.fetch.files ? Object.keys(d.fetch.files)[0] : undefined));
    return existsSync(path) ? unitRows(JSON.parse(await readFile(path, 'utf8')) as ColumnsSnapshot) : undefined;
  }
  const member = field.data!.file ?? (d.fetch.files ? Object.keys(d.fetch.files)[0] : undefined);
  const path = resolveDatasetFile(id, d, member);
  if (!existsSync(path)) return undefined;
  const text = await readFile(path, 'utf8');
  if (d.fetch.format === 'csv' || d.fetch.format === 'tsv') return parseTable(text);
  const doc = JSON.parse(text) as { features?: { properties: Record<string, unknown>; geometry?: unknown }[]; rows?: Record<string, unknown>[] };
  // A feature's geometry rides along as a column of its own, for what draws it; no property reads it.
  if (doc.features) return doc.features.map((f) => ({ ...f.properties, [GEOMETRY]: f.geometry ?? null }));
  return doc.rows;
}

/** A dataset's snapshot, read whole from its file, where nothing loaded it with the world. */
async function snapshotOf<T>(id: string, d: World['manifest']['datasets'][string], member?: string): Promise<T | undefined> {
  const path = resolveDatasetFile(id, d, member ?? (d.fetch.files ? Object.keys(d.fetch.files)[0] : undefined));
  return existsSync(path) ? (JSON.parse(await readFile(path, 'utf8')) as T) : undefined;
}

/**
 * A fossil snapshot's taxa as rows, one each, with the words its numbers stand for: the database's classification, with
 * every taxon an occurrence names and all their parents. A taxon still living has no last appearance: the youngest
 * occurrence of a living one is not its end.
 */
export function taxaRows(snap: LandSnapshot): Record<string, unknown>[] {
  const w = (i: number) => snap.words[i] ?? '';
  return snap.taxa.map(([no, name, rank, parent, extant, firstMax, firstMin, lastMax, lastMin, environment, diet, habit, motility]) => ({
    no,
    name,
    rank: w(rank),
    parent,
    extant: extant === 1 ? 'yes' : extant === 0 ? 'no' : '',
    first_max: firstMax,
    first_min: firstMin,
    last_max: extant === 1 ? null : lastMax,
    last_min: extant === 1 ? null : lastMin,
    environment: w(environment),
    diet: w(diet),
    habit: w(habit),
    motility: w(motility),
  }));
}

/** The land's fossils as one row per occurrence: its collection's place and ages joined in, and its taxon's number and name. */
export function landRows(snap: LandSnapshot): Record<string, unknown>[] {
  const names = new Map(snap.taxa.map((t) => [t[0], t[1]]));
  return snap.rows.map(([occurrence, site, taxon]) => {
    const s = snap.sites[site];
    return { occurrence, collection: s[0], lat: s[1], lng: s[2], max_ma: s[3], min_ma: s[4], formation: snap.words[s[5]] ?? '', taxon: `txn:${taxon}`, taxon_name: names.get(taxon) ?? '' };
  });
}

/** Does a row hold, in each column named, one of the values given? */
export function rowWhere(where: Record<string, string | string[]> | undefined, columns: Record<string, unknown>): boolean {
  if (!where) return true;
  for (const [column, allowed] of Object.entries(where)) {
    const v = columns[column];
    const s = v === undefined || v === null ? '' : String(v);
    if (Array.isArray(allowed) ? !allowed.includes(s) : allowed !== s) return false;
  }
  return true;
}

/** A field's dataset as a table of rows by key, if the field says how its rows are keyed and the dataset is here. */
export async function readTable(world: World, field: Field): Promise<Table | undefined> {
  if (!field.rows || !field.data) return undefined;
  // A delimited table is read as it comes, and kept by column: a list of millions is one.
  const delimited = delimitedSource(field.data.from, world.manifest.datasets[field.data.from], field.data.file);
  if (delimited) {
    if (!existsSync(delimited.source.path)) return undefined;
    const d = world.manifest.datasets[field.data.from];
    return readColumns(field.data.from, field.id, field.rows, delimited, (file, from) => {
      const other = from ? delimitedSource(from, world.manifest.datasets[from], file) : delimitedSource(field.data!.from, d, file);
      return other && existsSync(other.source.path) ? other : undefined;
    });
  }
  const raw = await rawRows(world, field);
  if (!raw) return undefined;
  const rows = new Map<string, Record<string, unknown>>();
  raw.forEach((columns, i) => {
    if (!rowWhere(field.rows!.where, columns)) return;
    const key = rowKey(field.rows!.key, columns, i);
    if (!rows.has(key)) rows.set(key, columns);
  });
  return { dataset: field.data.from, field: field.id, spec: field.rows, rows };
}

/** Where a dataset's table is, if it is a delimited one: a file, an archive's member unpacked, or one read from the archive. */
export function delimitedSource(id: string, d: World['manifest']['datasets'][string] | undefined, member?: string): { source: TableSource; format: Delimited } | undefined {
  if (!d) return undefined;
  const format = d.fetch.format;
  if (format === 'csv' || format === 'tsv') return { source: { path: resolveDatasetFile(id, d, member) }, format };
  if (format !== 'zip' || !member) return undefined;
  const unpacked = d.fetch.files?.[member];
  const name = unpacked ? unpacked.path : member;
  const as = delimitedOf(name);
  if (!as) return undefined;
  return unpacked ? { source: { path: resolveDatasetFile(id, d, member) }, format: as } : { source: { path: datasetPath(id, d), member }, format: as };
}

/** A template of columns, made ready to fill from a row's values: {Column} for a column, {#} for the row's place. */
function templateOf(template: string, columns: string[]): (values: string[], index: number) => string {
  const parts: (string | number)[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{([^}]+)\}/g)) {
    parts.push(template.slice(last, m.index));
    parts.push(m[1] === '#' ? -1 : columns.indexOf(m[1]));
    last = m.index! + m[0].length;
  }
  parts.push(template.slice(last));
  return (values, index) => {
    let s = '';
    for (const p of parts) s += typeof p === 'string' ? p : p < 0 ? String(index) : (values[p] ?? '');
    return s;
  };
}

/** The columns a template names. */
const templateColumns = (template: string) => [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).filter((c) => c !== '#');

/** The columns a field's rows read from the list's own table: its key, parent, other ids, claims, which rows, names. */
export function columnsOf(spec: RowsSpec): string[] {
  const out = new Set<string>();
  for (const c of templateColumns(spec.key)) out.add(c);
  if (spec.parent) for (const t of [spec.parent.key].flat()) for (const c of templateColumns(t)) out.add(c);
  for (const c of Object.values(spec.same_as ?? {})) out.add(c);
  for (const m of Object.values(spec.claims)) for (const c of [m.column].flat()) out.add(c);
  for (const c of Object.keys(spec.where ?? {})) out.add(c);
  for (const n of spec.names ?? []) if (!n.file && !n.from) for (const c of [...templateColumns(n.of), n.name, ...Object.keys(n.where ?? {})]) out.add(c);
  return [...out];
}

/** A test of a row's values against a `where`, by the columns' places. */
function whereOf(where: Record<string, string | string[]> | undefined, columns: string[]): (values: string[]) => boolean {
  const tests = Object.entries(where ?? {}).map(([c, allowed]) => [columns.indexOf(c), new Set([allowed].flat())] as const);
  return (values) => tests.every(([i, allowed]) => allowed.has(values[i] ?? ''));
}

/** A column of a list as it is kept: its values, or, for a column of few values, those values once and each row's. */
type Column = (string | null)[] | { words: string[]; at: Uint32Array };
const NONE = 0xffffffff;
const cellOf = (c: Column, i: number): string | null => (Array.isArray(c) ? c[i] : c.at[i] === NONE ? null : c.words[c.at[i]]);

/** A column as rows are added to it: each value of a few kinds kept once, until there are too many kinds for that to pay. */
class ColumnBuilder {
  private words: string[] = [];
  private codes = new Map<string, number>();
  private at: number[] = [];
  private plain?: (string | null)[];
  add(v: string): void {
    const x = v === '' ? null : v;
    if (this.plain) return void this.plain.push(x);
    if (x === null) return void this.at.push(NONE);
    let code = this.codes.get(x);
    if (code === undefined) {
      if (this.words.length >= 4096) {
        this.plain = this.at.map((i) => (i === NONE ? null : this.words[i]));
        this.plain.push(x);
        this.at = [];
        this.codes.clear();
        return;
      }
      code = this.words.length;
      this.words.push(x);
      this.codes.set(x, code);
    }
    this.at.push(code);
  }
  done(): Column {
    return this.plain ?? { words: this.words, at: Uint32Array.from(this.at) };
  }
}

/**
 * The rows of a list kept by column (docs/plans/ENTITIES.md, step 5): only the columns its field reads, and a row's
 * record made only when it is asked for. A list of millions, held as a record a row, would not fit in memory.
 */
export class ColumnRows implements RowMap {
  /** each row's place, by its key */
  readonly index = new Map<string, number>();
  constructor(
    readonly rowKeys: string[],
    readonly names: string[],
    private readonly columns: Column[],
  ) {
    rowKeys.forEach((k, i) => this.index.set(k, i));
  }
  get size(): number {
    return this.rowKeys.length;
  }
  has(key: string): boolean {
    return this.index.has(key);
  }
  get(key: string): Record<string, unknown> | undefined {
    const i = this.index.get(key);
    return i === undefined ? undefined : this.at(i);
  }
  /** The row at a place, as its columns. */
  at(i: number): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (let c = 0; c < this.names.length; c++) {
      const v = cellOf(this.columns[c], i);
      if (v !== null) out[this.names[c]] = v;
    }
    return out;
  }
  /** One column's value at a place, without the rest of the row. */
  cell(i: number, column: string): string | null {
    const c = this.names.indexOf(column);
    return c < 0 ? null : cellOf(this.columns[c], i);
  }
  keys(): Iterable<string> {
    return this.rowKeys;
  }
  *[Symbol.iterator](): Iterator<[string, Record<string, unknown>]> {
    for (let i = 0; i < this.rowKeys.length; i++) yield [this.rowKeys[i], this.at(i)];
  }
}

/**
 * A list's delimited table, read as it comes into columns, with the other names its field reads (spec.names), whose
 * other files `fileOf` finds in the same dataset.
 */
export async function readColumns(
  id: string,
  fieldId: string,
  spec: RowsSpec,
  at: { source: TableSource; format: Delimited },
  fileOf: (file: string | undefined, from: string | undefined) => { source: TableSource; format: Delimited } | undefined,
): Promise<Table> {
  const cols = columnsOf(spec);
  const key = templateOf(spec.key, cols);
  const isRow = whereOf(spec.where, cols);
  const ownNames = (spec.names ?? []).map((n, set) => ({ n, set })).filter(({ n }) => !n.file && !n.from);
  const nameTests = ownNames.map(({ n, set }) => ({ set, test: whereOf(n.where, cols), of: templateOf(n.of, cols), name: cols.indexOf(n.name) }));
  const keys: string[] = [];
  const seen = new Set<string>();
  const builders = cols.map(() => new ColumnBuilder());
  // The names, as they come: whom each names, by key, its text, and which of the field's names it is.
  const namedOf: string[] = [];
  const namedText: string[] = [];
  const namedSet: number[] = [];
  const name = (of: string, text: string, set: number) => {
    namedOf.push(of);
    namedText.push(text);
    namedSet.push(set);
  };
  let index = 0;
  await eachRow(at.source, at.format, cols, (values) => {
    const i = index++;
    for (const t of nameTests) if (t.test(values) && values[t.name]) name(t.of(values, i), values[t.name], t.set);
    if (!isRow(values)) return;
    const k = key(values, i);
    if (seen.has(k)) return;
    seen.add(k);
    keys.push(k);
    for (let c = 0; c < cols.length; c++) builders[c].add(values[c]);
  });
  seen.clear();
  const rows = new ColumnRows(keys, cols, builders.map((b) => b.done()));
  // Names from the dataset's other tables, such as a catalogue's common names, or from another dataset beside it.
  for (const [set, n] of (spec.names ?? []).entries()) {
    if (!n.file && !n.from) continue;
    const other = fileOf(n.file, n.from);
    if (!other) continue;
    const ncols = [...new Set([...templateColumns(n.of), n.name, ...Object.keys(n.where ?? {})])];
    const of = templateOf(n.of, ncols);
    const test = whereOf(n.where, ncols);
    const col = ncols.indexOf(n.name);
    let j = 0;
    await eachRow(other.source, other.format, ncols, (values) => {
      const i = j++;
      if (test(values) && values[col]) name(of(values, i), values[col], set);
    });
  }
  let names: TableNames | undefined;
  if (spec.names?.length) {
    // A name of no row of the list names nothing here: a synonym of a name the list leaves out.
    const kept: number[] = [];
    for (let i = 0; i < namedOf.length; i++) if (rows.index.has(namedOf[i])) kept.push(i);
    names = { at: Int32Array.from(kept, (i) => rows.index.get(namedOf[i])!), text: kept.map((i) => namedText[i]), set: Uint8Array.from(kept, (i) => namedSet[i]) };
  }
  return { dataset: id, field: fieldId, spec, rows, ...(names ? { names } : {}) };
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
  const columns = { ...base };
  const changed: string[] = [];
  for (const c of corrections) {
    const map = table.spec.claims[c.prop];
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
    const copy = { ...columns } as T;
    const props: string[] = [];
    for (const f of fix) {
      const map = spec.claims[f.prop];
      if (!map) continue;
      fromValue(map, f.value, copy as Record<string, unknown>);
      props.push(f.prop);
    }
    if (props.length) changed.set(i, props);
    return copy;
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
 * The land's fossils with corrections applied: a corrected place or age gives the occurrence a site of its own,
 * and a corrected name the taxon the snapshot has by that name, if it has one. Returns the corrected snapshot and
 * what could not be applied.
 */
export function correctLand(snap: LandSnapshot, spec: RowsSpec, fixes: Map<string, Fix[]>): { snap: LandSnapshot; unapplied: string[] } {
  if (!fixes.size) return { snap, unapplied: [] };
  const raw = landRows(snap);
  const { rows, changed } = correctRows(spec, raw, fixes);
  const sites = [...snap.sites];
  const out = [...snap.rows];
  const byName = new Map<string, number>();
  for (const t of snap.taxa) if (!byName.has(t[1])) byName.set(t[1], t[0]);
  const unapplied: string[] = [];
  for (const [i, props] of changed) {
    const r = rows[i];
    const [occ, site, taxon] = out[i];
    let s = site;
    let x = taxon;
    if (props.some((p) => spec.claims[p] && ['lat', 'lng', 'max_ma', 'min_ma'].some((c) => [spec.claims[p].column].flat().includes(c)))) {
      const old = snap.sites[site];
      sites.push([old[0], Number(r.lat), Number(r.lng), Number(r.max_ma), Number(r.min_ma), old[5]]);
      s = sites.length - 1;
    }
    if (props.includes('identified_as')) {
      const no = byName.get(String(r.taxon_name));
      if (no === undefined) unapplied.push(`occ:${occ}: the snapshot has no taxon named ${String(r.taxon_name)}`);
      else x = no;
    }
    out[i] = [occ, s, x];
  }
  return { snap: { ...snap, sites, rows: out }, unapplied };
}
