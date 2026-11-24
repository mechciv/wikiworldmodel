// Things at places, drawn over the globe for the times they hold: today's borders and cities, and
// the hazards of the last few thousand years. They are rows of a dataset, not records, because there
// are thousands of them; each carries what the panel shows and the dataset that says so.
import type { SourceRecord } from './records.ts';

export interface PresentPlace {
  name: string;
  country: string;
  lon: number;
  lat: number;
  /** the population Natural Earth gives its city at its largest extent */
  pop: number;
  capital: boolean;
}

export interface PresentFile {
  format: 'lightworld-present@1';
  title: string;
  description?: string;
  /** when it starts to be drawn: the years it describes, as near as a single map can */
  since: number;
  until: number;
  source: string;
  sourceRecord?: SourceRecord;
  placesSource: string;
  placesSourceRecord?: SourceRecord;
  /** lines, flat [lon, lat, lon, lat, …], in hundredths of a degree */
  borders: number[][];
  /** the indices of the lines the map marks as disputed */
  disputed: number[];
  /** the largest first */
  places: PresentPlace[];
}

export const HAZARD_KINDS = ['eruption', 'earthquake', 'tsunami'] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

export interface HazardRow {
  kind: HazardKind;
  /** on the world's axis: a year, with its month and day if the database gives them */
  t: number;
  /** when, as the database gives it */
  when: string;
  lat: number;
  lon: number;
  name: string;
  /** VEI of an eruption, magnitude of an earthquake, intensity of a tsunami; absent if it gives none */
  size?: number;
  /** deaths, where it gives a number */
  deaths?: number;
  /** its address in the dataset, src:<dataset>#<key>: what an overlay names to correct it */
  row?: string;
  /** what overlays changed, by property, if any did */
  corrected?: string[];
  /**
   * the records that draw this row as their territory (a subject each: an entity, or entity@phase). While one of
   * them holds, at the time and in the scenario shown, the row is that record's, and is not drawn among the states;
   * when none does, it is the dataset's row again.
   */
  claimedBy?: string[];
  /** for a row a record draws as its territory, where it is drawn among the states: the record, and its name */
  record?: string;
  label?: string;
}

export interface HazardFile {
  format: 'lightworld-hazards@1';
  title: string;
  description?: string;
  source: string;
  sourceRecord?: SourceRecord;
  /** oldest first */
  rows: HazardRow[];
}

/** The rows within `halo` years of a time, oldest first. */
export function hazardsNear(file: HazardFile, t: number, halo: number): HazardRow[] {
  const rows = file.rows;
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (rows[m].t < t - halo) lo = m + 1;
    else hi = m;
  }
  const out: HazardRow[] = [];
  for (let i = lo; i < rows.length && rows[i].t <= t + halo; i++) out.push(rows[i]);
  return out;
}

/** A row of a borders dataset: a polity as it is drawn for some years. */
export interface PolityRow {
  name: string;
  /** [from, to) on the world's axis */
  from: number;
  to: number;
  /** km², as the dataset gives it */
  area: number;
  /** where a label goes, [lon, lat] in degrees */
  at: [number, number];
  /** rings, outer and inner alike, each [lon0, lat0, lon1, lat1, …] in hundredths of a degree; filled even-odd */
  rings: number[][];
  wikipedia?: string;
  /** its address in the dataset, src:<dataset>#<key>: what an overlay names to correct it */
  row?: string;
  /** what overlays changed, by property, if any did */
  corrected?: string[];
  /**
   * the records that draw this row as their territory (a subject each: an entity, or entity@phase). While one of
   * them holds, at the time and in the scenario shown, the row is that record's, and is not drawn among the states;
   * when none does, it is the dataset's row again.
   */
  claimedBy?: string[];
  /** for a row a record draws as its territory, where it is drawn among the states: the record, and its name */
  record?: string;
  label?: string;
}

export interface PolitiesFile {
  format: 'lightworld-polities@1';
  title: string;
  description?: string;
  source: string;
  sourceRecord?: import('./records.ts').SourceRecord;
  /** by when they start */
  rows: PolityRow[];
}

/** The rows that hold at a time. */
export const politiesAt = (file: PolitiesFile, t: number): PolityRow[] => file.rows.filter((r) => r.from <= t && t < r.to);

/**
 * The rows that are drawn among the states at a time: those that hold, less those that a record draws as its
 * own territory then. `holding` is the records whose territory holds, at that time and in the scenario shown: a
 * row claimed only by records that do not hold there, because they ended earlier or begin later in that scenario,
 * is still what the dataset says, and is drawn.
 */
export const statesAt = (file: PolitiesFile, t: number, holding: ReadonlySet<string>): PolityRow[] => politiesAt(file, t).filter((r) => !r.claimedBy?.some((id) => holding.has(id)));

/** Is a point inside a row's rings, by the even-odd rule? Degrees, handling antimeridian crossings. */
export function insideRow(r: PolityRow, lon: number, lat: number): boolean {
  const nlon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const x0 = nlon * 100;
  const y = lat * 100;
  const wrap = 36000;
  const half = 18000;
  let inside = false;
  for (const ring of r.rings) {
    if (ring.length < 6) continue;
    let crosses = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      if (Math.abs(ring[i] - ring[j]) > half) {
        crosses = true;
        break;
      }
    }
    if (!crosses) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const yi = ring[i + 1];
        const yj = ring[j + 1];
        if (yi > y !== yj > y && x0 < ((ring[j] - ring[i]) * (y - yi)) / (yj - yi) + ring[i]) inside = !inside;
      }
      continue;
    }
    const n = ring.length >> 1;
    const ux = new Float64Array(n);
    ux[0] = ring[0];
    let minX = ux[0];
    let maxX = ux[0];
    for (let k = 1; k < n; k++) {
      let d = ring[k * 2] - ux[k - 1];
      d -= wrap * Math.round(d / wrap);
      ux[k] = ux[k - 1] + d;
      if (ux[k] < minX) minX = ux[k];
      if (ux[k] > maxX) maxX = ux[k];
    }
    if (Math.abs(ux[n - 1] - ux[0]) > half) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const yi = ring[i + 1];
        const yj = ring[j + 1];
        if (yi > y !== yj > y && x0 < ((ring[j] - ring[i]) * (y - yi)) / (yj - yi) + ring[i]) inside = !inside;
      }
      continue;
    }
    for (const shift of [-wrap, 0, wrap]) {
      const x = x0 + shift;
      if (x < minX || x > maxX) continue;
      for (let k = 0, p = n - 1; k < n; p = k++) {
        const yi = ring[k * 2 + 1];
        const yj = ring[p * 2 + 1];
        if (yi > y !== yj > y && x < ((ux[p] - ux[k]) * (y - yi)) / (yj - yi) + ux[k]) inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * People on a grid: how many in each cell, at each time step a reconstruction gives. It is drawn as a
 * picture of the surface, not as rows at places. The numbers are the file's typed arrays: a million of them.
 */
export interface PeopleHeader {
  format: 'lightworld-people@1';
  title: string;
  description?: string;
  source: string;
  sourceRecord?: SourceRecord;
  /** how wide a cell is, in degrees; column 0 starts at 180°W and row 0 at the north pole */
  res: number;
  /** the time steps, on the world's axis, oldest first */
  steps: number[];
  /** where the viewer's colours start and end, in people per km² of land: a choice of how to show it, not a fact */
  scale: { lo: number; hi: number };
  /** the range the authors give for their numbers, in percent either way: [time, percent], oldest first, straight between */
  range: [number, number][];
}

export interface PeopleFile extends PeopleHeader {
  /** the cells that ever hold anyone, by their place in the grid (row × columns + column), in order */
  cell: Uint32Array;
  /** each one's land, in km² */
  land: Uint32Array;
  /** how many people, a whole row of cells for each step */
  people: Uint32Array;
}

/** The two steps around a time, and how far it is from the first to the second; nothing outside them. */
export function stepsAround(steps: number[], t: number): { a: number; b: number; mix: number } | undefined {
  if (!steps.length || t < steps[0] || t > steps[steps.length - 1]) return undefined;
  let a = 0;
  let b = steps.length - 1;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (steps[m] <= t) a = m;
    else b = m;
  }
  if (steps[a] === t) b = a;
  else if (steps[b] === t) a = b;
  return { a, b, mix: a === b ? 0 : (t - steps[a]) / (steps[b] - steps[a]) };
}

/** How many people each cell holds at a time, straight between steps; false, and nothing written, outside them. */
export function peopleAt(f: PeopleFile, t: number, out: Float64Array): boolean {
  const s = stepsAround(f.steps, t);
  if (!s) return false;
  const n = f.cell.length;
  const a = f.people.subarray(s.a * n, (s.a + 1) * n);
  const b = f.people.subarray(s.b * n, (s.b + 1) * n);
  for (let i = 0; i < n; i++) out[i] = a[i] + (b[i] - a[i]) * s.mix;
  return true;
}

/** The size of a grid of cells `res` degrees wide. */
export const gridSize = (res: number) => ({ nx: Math.round(360 / res), ny: Math.round(180 / res) });

/** Where a point falls in the grid: its row, its column, and which of the file's cells that is, or −1. */
export function cellAt(f: Pick<PeopleFile, 'res' | 'cell'>, lon: number, lat: number): { row: number; col: number; index: number } {
  const { nx, ny } = gridSize(f.res);
  const nlon = lon >= -180 && lon <= 180 ? lon + 180 : (((lon + 180) % 360) + 360) % 360;
  const col = Math.max(0, Math.min(nx - 1, Math.floor(nlon / f.res)));
  const row = Math.max(0, Math.min(ny - 1, Math.floor((90 - lat) / f.res)));
  const place = row * nx + col;
  let lo = 0;
  let hi = f.cell.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (f.cell[m] === place) return { row, col, index: m };
    if (f.cell[m] < place) lo = m + 1;
    else hi = m - 1;
  }
  return { row, col, index: -1 };
}

/** The range the authors give at a time: straight between the years they name, and held beyond them. */
export function rangeAt(points: [number, number][], t: number): number | undefined {
  if (!points.length) return undefined;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, p1] = points[i];
    if (t <= t1) {
      const [t0, p0] = points[i - 1];
      return t1 === t0 ? p1 : p0 + ((p1 - p0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

/** Where a density falls on the viewer's scale, from 0 to 1, in its logarithm: nothing below the scale. */
export function levelOf(density: number, scale: PeopleHeader['scale']): number {
  if (!(scale.lo > 0) || !(scale.hi > scale.lo) || !(density > scale.lo)) return 0;
  return Math.min(1, Math.log(density / scale.lo) / Math.log(scale.hi / scale.lo));
}
