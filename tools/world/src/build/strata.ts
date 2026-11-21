// The columns of rock with ages, as a build gives them to a viewer (strata.lwt, strata/columns/<n>.json; core/strata.ts):
// a grid of which column each place of today's Earth lies in, by the columns' footprints, and each column's units a
// few columns to a file, so that a scene sends for the grid once and for the units of its own column. And what a
// column says against the land and sea of the elevation field, which reads none of it.
import { conj, rotate, toLatLon, unitVector, type Quat } from '../../../../core/quat.ts';
import type { PeriodRecord } from '../../../../core/records.ts';
import { strataAt, type StrataOf, type SubstrateRule } from '../../../../core/substrate.ts';
import { strataCell, strataColumn, strataColumns, strataRuns, type StrataAgreement, type StrataColumn, type StrataColumns, type StrataFile, type StrataFileRef, type StrataHeader, type StrataUnitRow } from '../../../../core/strata.ts';
import { fromMa, toMa } from '../../../../core/time.ts';
import { refLine, type ColumnRow, type ColumnsSnapshot } from '../macrostrat.ts';
import { stableStringify } from '../util.ts';
import { atlasBins } from './atlas.ts';
import { SRC_W, type Snapshot } from './fields.ts';
import { sourceRecord, type Solved } from './records.ts';

export interface StrataParams {
  /** the cell of the grid of column numbers, in degrees */
  cell_deg: number;
  /** the atlases' stages, which the columns are held against the elevation field on */
  longest_bin: number;
  shortest_bin: number;
}

export interface StrataOut {
  header: StrataHeader;
  /** the grid's runs: where each row's begin, and the runs */
  rows: Uint32Array;
  runs: Uint16Array;
  /** the columns' files, by path */
  files: Map<string, string>;
  /** in memory, for the build's own questions: every column, as the files give them, with what the vocabulary says of their words */
  columns: StrataColumns;
  /** where the units come from, for what is read of them */
  of: StrataOf;
  /** how many cells of the grid lie in a footprint */
  cells: number;
  /** columns whose footprint holds no cell of the grid, by their numbers in the dataset */
  lost: number[];
  agreement?: StrataAgreement;
}

/** How many units a file of columns holds at the least, before the next column starts another: about what one stage's rock sites take. */
const UNITS_A_FILE = 1500;

/** Whether a point is inside a ring, a flat list of longitudes and latitudes: by how many of its sides a line east from the point crosses. */
function inRing(ring: number[], x: number, y: number): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2];
    const yi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const yj = ring[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether a place is inside a footprint: in the first ring of one of its polygons, and in none of that polygon's holes. */
export function inOutline(outline: number[][][], lng: number, lat: number): boolean {
  return outline.some((rings) => inRing(rings[0], lng, lat) && !rings.slice(1).some((hole) => inRing(hole, lng, lat)));
}

/**
 * The grid of column numbers: each cell has the column whose footprint holds its middle, numbered by its place in
 * `columns` from 1, and 0 where none does. Where footprints overlap, as the buffers round two drill sites close
 * together do, the smaller has the cell. A column too small to hold the middle of any cell takes the cell its own point
 * lies in, where that leaves the column it takes it from a cell: those that get none are `lost`.
 */
export function columnCells(columns: ColumnRow[], res: number): { nx: number; ny: number; cells: Uint16Array; lost: number[] } {
  const nx = Math.round(360 / res);
  const ny = Math.round(180 / res);
  if (columns.length > 0xffff) throw new Error(`${columns.length} columns are too many for a grid of 16-bit numbers`);
  const cells = new Uint16Array(nx * ny);
  const counts = new Uint32Array(columns.length);
  const boxes = columns.map((c) => {
    let [west, south, east, north] = [180, 90, -180, -90];
    for (const rings of c[8]) {
      const ring = rings[0];
      for (let k = 0; k < ring.length; k += 2) {
        west = Math.min(west, ring[k]);
        east = Math.max(east, ring[k]);
        south = Math.min(south, ring[k + 1]);
        north = Math.max(north, ring[k + 1]);
      }
    }
    return { west, south, east, north };
  });
  for (let j = 0; j < ny; j++) {
    const lat = 90 - (j + 0.5) * res;
    const row: number[] = [];
    boxes.forEach((b, k) => {
      if (lat >= b.south && lat <= b.north) row.push(k);
    });
    if (!row.length) continue;
    const from = Math.max(0, Math.floor((Math.min(...row.map((k) => boxes[k].west)) + 180) / res));
    const to = Math.min(nx - 1, Math.floor((Math.max(...row.map((k) => boxes[k].east)) + 180) / res));
    for (let i = from; i <= to; i++) {
      const lng = -180 + (i + 0.5) * res;
      let best = -1;
      for (const k of row) {
        if (lng < boxes[k].west || lng > boxes[k].east) continue;
        if (best >= 0 && columns[k][6] >= columns[best][6]) continue;
        if (inOutline(columns[k][8], lng, lat)) best = k;
      }
      if (best < 0) continue;
      cells[j * nx + i] = best + 1;
      counts[best]++;
    }
  }
  const lost: number[] = [];
  columns.forEach((c, k) => {
    if (counts[k]) return;
    const at = Math.min(ny - 1, Math.max(0, Math.floor((90 - c[4]) / res))) * nx + Math.min(nx - 1, Math.max(0, Math.floor((c[5] + 180) / res)));
    const there = cells[at];
    if (there && counts[there - 1] < 2) {
      lost.push(c[0]);
      return;
    }
    if (there) counts[there - 1]--;
    cells[at] = k + 1;
    counts[k] = 1;
  });
  return { nx, ny, cells, lost };
}

/** Some columns as a file: their words kept once, the lithologies and environments they name each with what the vocabulary says of it, and the references they name as lines. */
function fileOf(snap: ColumnsSnapshot, first: number, columns: ColumnRow[], units: Map<number, ColumnsSnapshot['units']>): StrataFile {
  const w = (k: number) => snap.words[k] ?? '';
  const words = new Map<string, number>([['', 0]]);
  const word = (s: string): number => {
    let k = words.get(s);
    if (k === undefined) {
      k = words.size;
      words.set(s, k);
    }
    return k;
  };
  const lithology = new Map(snap.lithologies.map((l) => [l[0], l]));
  const environment = new Map(snap.environments.map((e) => [e[0], e]));
  const reference = new Map(snap.refs.map((r) => [r[0], r]));
  // The lithologies and environments the columns name, each once, by the dataset's own numbers for them: a name
  // would not do, since its vocabulary has two environments called a delta plain, one of the sea and one of the land.
  const lithologies: StrataFile['lithologies'] = [];
  const lithologyAt = new Map<number, number>();
  const environments: StrataFile['environments'] = [];
  const environmentAt = new Map<number, number>();
  const refs = new Map<number, StrataFile['refs'][number]>();
  const out: StrataFile['columns'] = columns.map((c) => {
    for (const r of c[7]) if (!refs.has(r)) refs.set(r, [r, word(refLine(snap, reference.get(r)!))]);
    const rows = (units.get(c[0]) ?? []).map((u): StrataUnitRow => {
      const liths = u[16].map(([l, share, ...atts]): [number, number, ...number[]] => {
        let at = lithologyAt.get(l);
        if (at === undefined) {
          const v = lithology.get(l)!;
          at = lithologies.push([word(w(v[1])), word(w(v[2])), word(w(v[3])), word(w(v[4]))]) - 1;
          lithologyAt.set(l, at);
        }
        return [at, Math.round(share * 1000), ...atts.map((a) => word(w(a)))];
      });
      const envs = u[17].map((e) => {
        let at = environmentAt.get(e);
        if (at === undefined) {
          const v = environment.get(e)!;
          at = environments.push([word(w(v[1])), word(w(v[3]))]) - 1;
          environmentAt.set(e, at);
        }
        return at;
      });
      // A unit goes by its name in full where the dataset gives one, and by its short name where it does not.
      return [u[0], word(w(u[4]) || w(u[3])), u[5], u[6], envs, liths];
    });
    return [c[0], word(w(c[1])), [...c[7]], rows];
  });
  return { format: 'lightworld-strata-columns@1', first, last: first + columns.length - 1, words: [...words.keys()], lithologies, environments, refs: [...refs.values()], columns: out };
}

/**
 * The columns of a snapshot as a build gives them. `elevation`, `periods` and `rule` are for holding the columns
 * against the elevation field's land and sea, stage by stage: without them that is left out.
 */
export function buildStrata(s: Solved | undefined, snap: ColumnsSnapshot, dataset: string, field: { id: string; title: string; description?: string }, p: StrataParams, credit: string | undefined, log: (m: string) => void, against?: { periods: PeriodRecord[]; elevation: Snapshot[]; isoline: number; rule: SubstrateRule }): StrataOut {
  const { nx, ny, cells, lost } = columnCells(snap.columns, p.cell_deg);
  const { rows, runs } = strataRuns(cells, nx, ny);
  const units = new Map<number, ColumnsSnapshot['units']>();
  for (const u of snap.units) {
    const list = units.get(u[1]);
    if (list) list.push(u);
    else units.set(u[1], [u]);
  }
  // A few columns to a file, in the order of the grid's numbers.
  const files = new Map<string, string>();
  const refs: StrataFileRef[] = [];
  const all: StrataColumns = { first: 1, last: snap.columns.length, columns: [] };
  let from = 0;
  let held = 0;
  snap.columns.forEach((c, k) => {
    held += units.get(c[0])?.length ?? 0;
    if (held < UNITS_A_FILE && k < snap.columns.length - 1) return;
    const file = fileOf(snap, from + 1, snap.columns.slice(from, k + 1), units);
    const path = `strata/columns/${refs.length}.json`;
    files.set(path, stableStringify(file));
    refs.push({ first: file.first, last: file.last, file: path });
    // What the build reads is what a viewer will: the file, read back.
    all.columns.push(...strataColumns(file).columns);
    from = k + 1;
    held = 0;
  });
  const older = Math.max(...snap.units.map((u) => u[5]));
  const younger = Math.min(...snap.units.map((u) => u[6]));
  const header: StrataHeader = {
    format: 'lightworld-strata@1',
    field: field.id,
    title: field.title,
    description: field.description,
    source: dataset,
    sourceRecord: s?.world.source.get(dataset) ? sourceRecord(s.world.source.get(dataset)!) : undefined,
    ...(credit ? { credit } : {}),
    grid: { res: p.cell_deg, nx, ny, rows: 0, runs: 1 },
    columns: snap.columns.length,
    files: refs,
    span: [fromMa(older), fromMa(younger)],
  };
  const of: StrataOf = { field: field.id, source: dataset, ...(credit ? { credit } : {}) };
  let inFootprints = 0;
  for (let k = 0; k < cells.length; k++) if (cells[k]) inFootprints++;
  const out: StrataOut = { header, rows, runs, files, columns: all, of, cells: inFootprints, lost };
  log(`strata  ${snap.columns.length} columns and ${snap.units.length} units in ${refs.length} files; ${inFootprints.toLocaleString('en-US')} cells of ${p.cell_deg}° in a footprint, in ${(runs.length / 2).toLocaleString('en-US')} runs${lost.length ? `; ${lost.length} column${lost.length === 1 ? '' : 's'} too small for a cell of ${lost.length === 1 ? 'its' : 'their'} own` : ''}`);
  if (s && against) {
    out.agreement = agreement(s, snap, all, against, p);
    const a = out.agreement;
    const pct = (x: number, of: number) => (of ? `${Math.round((x / of) * 100)}%` : 'none');
    log(`strata  on the elevation field's land at a stage's middle, a column has a unit laid down on land ${pct(a.land_land, a.land)} of the time, a gap ${pct(a.land_gap, a.land)}, and only units laid down under the sea ${pct(a.land_sea, a.land)}; in its sea, only such units ${pct(a.sea_sea, a.sea)}, a gap ${pct(a.sea_gap, a.sea)}, and a unit laid down on land ${pct(a.sea_land, a.sea)}`);
  }
  return out;
}

/** The plate under a place of today's Earth, by the plates of today's land: searching out a few degrees for one, as the rock record's sites are placed. */
function plateFinder(now: Snapshot): (lat: number, lon: number) => number {
  return (lat, lon) => {
    const j0 = Math.round(90 - lat);
    const i0 = Math.round(lon + 180);
    for (let r = 0; r <= 3; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(dj), Math.abs(di)) !== r) continue;
          const j = Math.max(0, Math.min(180, j0 + dj));
          const i = (((i0 + di) % SRC_W) + SRC_W) % SRC_W;
          const q = now.plate[j * SRC_W + i];
          if (q) return q;
        }
      }
    }
    return 0;
  };
}

/** Each column asked at the middle of each stage, where its own point stood then, against the elevation field's land and sea there. */
function agreement(s: Solved, snap: ColumnsSnapshot, all: StrataColumns, against: { periods: PeriodRecord[]; elevation: Snapshot[]; isoline: number; rule: SubstrateRule }, p: StrataParams): StrataAgreement {
  const a: StrataAgreement = { land: 0, land_land: 0, land_gap: 0, land_sea: 0, land_nothing: 0, sea: 0, sea_land: 0, sea_gap: 0, sea_sea: 0, sea_nothing: 0 };
  const r = against.rule.strata;
  if (!r) return a;
  const now = [...against.elevation].sort((x, y) => x.ageMa - y.ageMa)[0];
  const plateOf = plateFinder(now);
  const places = snap.columns.map((c) => {
    const plate = plateOf(c[4], c[5]);
    const back: Quat | null = plate && s.model.reaches(plate, 0) ? conj(s.model.total(plate, 0)) : null;
    return { plate, back, v: unitVector(c[4], c[5]) };
  });
  for (const bin of atlasBins(against.periods, p.longest_bin, p.shortest_bin)) {
    const midMa = (toMa(bin.from) + toMa(bin.to)) / 2;
    const key = [...against.elevation].sort((x, y) => Math.abs(x.ageMa - midMa) - Math.abs(y.ageMa - midMa))[0];
    if (Math.abs(key.ageMa - midMa) > 12) continue;
    const forth = new Map<number, Quat | null>();
    places.forEach((place, k) => {
      if (!place.back) return;
      let to = forth.get(place.plate);
      if (to === undefined) {
        to = s.model.reaches(place.plate, midMa) ? s.model.total(place.plate, midMa) : null;
        forth.set(place.plate, to);
      }
      if (!to) return;
      const [la, lo] = toLatLon(rotate(to, rotate(place.back, place.v)));
      const e = key.elev[Math.max(0, Math.min(180, Math.round(90 - la))) * SRC_W + (((Math.round(lo + 180) % SRC_W) + SRC_W) % SRC_W)];
      const side = e >= against.isoline ? 'land' : 'sea';
      const says = strataAt(all.columns[k], midMa, r).says;
      a[side]++;
      a[`${side}_${says}`]++;
    });
  }
  return a;
}

/** The column a place of today's Earth lies in, of a build's columns. */
export function columnAt(out: Pick<StrataOut, 'header' | 'rows' | 'runs' | 'columns'>, lat: number, lon: number): StrataColumn | undefined {
  const k = strataCell(out.header.grid, out.rows, out.runs, lat, lon);
  return k ? strataColumn(out.columns, k) : undefined;
}

/**
 * Where a place of some time stands today, by the plate the elevation field has under it at the snapshot nearest that
 * time: undefined where the field has no plate there, or the plate model does not carry it to the present.
 */
export function todayOf(s: Solved, elevation: Snapshot[]): (lat: number, lon: number, ageMa: number) => [number, number] | undefined {
  const sorted = [...elevation].sort((x, y) => x.ageMa - y.ageMa);
  return (lat, lon, ageMa) => {
    let key = sorted[0];
    for (const x of sorted) if (Math.abs(x.ageMa - ageMa) < Math.abs(key.ageMa - ageMa)) key = x;
    const plate = key.plate[Math.max(0, Math.min(180, Math.round(90 - lat))) * SRC_W + (((Math.round(lon + 180) % SRC_W) + SRC_W) % SRC_W)];
    if (!plate || !s.model.reaches(plate, ageMa) || !s.model.reaches(plate, 0)) return undefined;
    return toLatLon(rotate(s.model.total(plate, 0), rotate(conj(s.model.total(plate, ageMa)), unitVector(lat, lon))));
  };
}
