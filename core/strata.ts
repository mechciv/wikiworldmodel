// Rock with ages, by column (field:earth/strata; docs/SCENES.md, "What the ground is made of"). A column is a dataset's
// record of the rock succession of an area of today's Earth, some tens of km to a couple of hundred across: its units,
// each with the ages it was laid down between, its lithologies with their shares and attributes, and the environments
// it was laid down in. A place is in the column whose footprint holds it where it stands today, so a place of the past
// is carried there on its plate first. What a column's units make of a ground is the substrate's to say
// (core/substrate.ts); this is the columns as a build gives them, and which units a column has at an age.
import type { SourceRecord } from './records.ts';

/** A grid of column numbers on today's Earth, rows from the north and columns from 180° W, kept as runs along each row. */
export interface StrataGrid {
  /** degrees a cell */
  res: number;
  nx: number;
  ny: number;
  /** which of the file's arrays is where each row's runs begin (and, last, where they all end), and which the runs: a length and a column number each */
  rows: number;
  runs: number;
}

export interface StrataFileRef {
  /** the columns it holds, by their numbers in the grid */
  first: number;
  last: number;
  file: string;
}

/**
 * What a build gives of the columns to begin with (strata.lwt): the grid of which column a place of today's Earth
 * lies in, and where each column's units are. A column's number here is its place in the build's list, from 1; 0 is no
 * column.
 */
export interface StrataHeader {
  format: 'lightworld-strata@1';
  field: string;
  title: string;
  description?: string;
  source: string;
  sourceRecord?: SourceRecord;
  /** what the dataset is credited as, for a panel: each column's own reference goes with it besides */
  credit?: string;
  grid: StrataGrid;
  columns: number;
  files: StrataFileRef[];
  /** the oldest and the youngest time a unit has, on the axis */
  span: [number, number];
}

/**
 * A lithology of a unit, in the dataset's words: its name, with the type, the group and the class the dataset's
 * vocabulary gives it, each empty where it gives none; its share of the unit, 0–1; and what the dataset says of it
 * besides.
 */
export interface StrataLithology {
  name: string;
  type: string;
  group: string;
  cls: string;
  share: number;
  attributes: string[];
}

/**
 * An environment a unit was laid down in, in the dataset's words, with the class its vocabulary gives it. The class
 * goes with each one, and not with the name: a vocabulary may use one name twice, as Macrostrat's has a delta plain of
 * the sea and another of the land.
 */
export interface StrataEnvironment {
  name: string;
  cls: string;
}

/**
 * Some of the columns, as written (strata/columns/<n>.json). Words are kept once and named by number, and so are the
 * lithologies and the environments the columns name, each with what the vocabulary says of it: a unit names them by
 * their places in those lists. A column is its number in the dataset, its name, the references it names by the
 * dataset's numbers, and its units; a unit its number in the dataset, its name, the ages it was laid down between in
 * Ma, the older first, its environments, and its lithologies: each one of the list, a share of the unit in
 * thousandths, and its attributes as words.
 */
export interface StrataFile {
  format: 'lightworld-strata-columns@1';
  first: number;
  last: number;
  words: string[];
  /** each lithology the columns name: its name, type, group and class, all as words */
  lithologies: [name: number, type: number, group: number, cls: number][];
  /** each environment they name: its name and its class, as words */
  environments: [name: number, cls: number][];
  /** each reference they name, by the dataset's number, as a line */
  refs: [ref: number, line: number][];
  columns: [column: number, name: number, refs: number[], units: StrataUnitRow[]][];
}

export type StrataUnitRow = [unit: number, name: number, older: number, younger: number, environments: number[], lithologies: [lithology: number, share: number, ...attributes: number[]][]];

export interface StrataUnit {
  /** its number in the dataset: its row is src:<dataset>#unit:<number> */
  unit: number;
  name: string;
  /** when it began to be laid down and when it stopped, in Ma */
  older: number;
  younger: number;
  /** the environments it was laid down in: none where the dataset gives none */
  environments: StrataEnvironment[];
  /** what it is made of */
  lithologies: StrataLithology[];
}

export interface StrataColumn {
  /** its number in the dataset */
  column: number;
  name: string;
  /** the references it was compiled from, each as a line */
  refs: string[];
  units: StrataUnit[];
}

/** Some columns read out of their file: those numbered first to last in the grid, in that order. */
export interface StrataColumns {
  first: number;
  last: number;
  columns: StrataColumn[];
}

/**
 * How the columns agree with the land and sea of the elevation field, which does not read them: each column asked at
 * the middle of each stage, where its own point stood then. On the field's land: how many times the column has a unit
 * laid down on land, a gap, only units laid down under the sea, or nothing that old. In its sea likewise.
 */
export interface StrataAgreement {
  land: number;
  land_land: number;
  land_gap: number;
  land_sea: number;
  land_nothing: number;
  sea: number;
  sea_land: number;
  sea_gap: number;
  sea_sea: number;
  sea_nothing: number;
}

/** The runs of a grid of column numbers: where each row's begin, and each run's length and number. */
export function strataRuns(cells: Uint16Array, nx: number, ny: number): { rows: Uint32Array; runs: Uint16Array } {
  if (cells.length !== nx * ny) throw new Error(`a grid of ${nx} × ${ny} has ${cells.length} cells`);
  if (nx > 0xffff) throw new Error('a row is too long for its runs');
  const rows = new Uint32Array(ny + 1);
  const runs: number[] = [];
  for (let j = 0; j < ny; j++) {
    rows[j] = runs.length / 2;
    let from = 0;
    for (let i = 1; i <= nx; i++) {
      if (i < nx && cells[j * nx + i] === cells[j * nx + from]) continue;
      runs.push(i - from, cells[j * nx + from]);
      from = i;
    }
  }
  rows[ny] = runs.length / 2;
  return { rows, runs: Uint16Array.from(runs) };
}

/** The column a place of today's Earth lies in, by its number in the grid: 0 where it lies in none. */
export function strataCell(g: Pick<StrataGrid, 'res' | 'nx' | 'ny'>, rows: Uint32Array, runs: Uint16Array, lat: number, lon: number): number {
  const j = Math.min(g.ny - 1, Math.max(0, Math.floor((90 - lat) / g.res)));
  const i = Math.min(g.nx - 1, Math.floor((lon + 180 - 360 * Math.floor((lon + 180) / 360)) / g.res));
  let end = 0;
  for (let k = rows[j]; k < rows[j + 1]; k++) {
    end += runs[k * 2];
    if (i < end) return runs[k * 2 + 1];
  }
  return 0;
}

/** The file that holds a column, by its number in the grid. */
export function strataFileOf(files: StrataFileRef[], column: number): StrataFileRef | undefined {
  return files.find((f) => column >= f.first && column <= f.last);
}

/** A file's columns, read out of its numbers. */
export function strataColumns(file: StrataFile): StrataColumns {
  const w = (k: number) => file.words[k] ?? '';
  const refs = new Map(file.refs.map(([ref, line]) => [ref, w(line)]));
  const lithology = file.lithologies.map(([name, type, group, cls]) => ({ name: w(name), type: w(type), group: w(group), cls: w(cls) }));
  const environment = file.environments.map(([name, cls]): StrataEnvironment => ({ name: w(name), cls: w(cls) }));
  return {
    first: file.first,
    last: file.last,
    columns: file.columns.map(([column, name, named, units]) => ({
      column,
      name: w(name),
      refs: named.map((r) => refs.get(r) ?? '').filter(Boolean),
      units: units.map(([unit, unitName, older, younger, environments, lithologies]) => ({
        unit,
        name: w(unitName),
        older,
        younger,
        environments: environments.map((e) => environment[e]),
        lithologies: lithologies.map(([l, share, ...attributes]): StrataLithology => ({ ...lithology[l], share: share / 1000, attributes: attributes.map(w) })),
      })),
    })),
  };
}

/** The column of a file, by its number in the grid. */
export function strataColumn(columns: StrataColumns, column: number): StrataColumn | undefined {
  return column >= columns.first && column <= columns.last ? columns.columns[column - columns.first] : undefined;
}

/**
 * The units of a column at an age, in Ma: those being laid down then, whose span holds the age; and the youngest it
 * has from wholly before, which are several where they stopped together. A column has a gap at an age none of its
 * units holds.
 */
export function unitsAt(column: Pick<StrataColumn, 'units'>, ageMa: number): { laid: StrataUnit[]; before: StrataUnit[] } {
  const laid: StrataUnit[] = [];
  let before: StrataUnit[] = [];
  for (const u of column.units) {
    if (u.older >= ageMa && u.younger <= ageMa) laid.push(u);
    else if (u.younger > ageMa) {
      if (!before.length || u.younger < before[0].younger) before = [u];
      else if (u.younger === before[0].younger) before.push(u);
    }
  }
  return { laid, before };
}
