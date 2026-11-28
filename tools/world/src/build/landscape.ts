// The anonymous human landscape (docs/HUMAN-LANDSCAPE.md), built: what kind of place every 5′ cell of land was at each
// of Anthromes 12K's 73 times, the ArchaeoGLOBE region it lies in, what the region's archaeologists said of it, and the
// building traditions the world records. The viewer and the scenes read them; resolve answers the people's layer from
// them; the coverage counts where HYDE and the archaeologists disagree.
//
//   people/landscape.json            the index: steps, classes, tiles, the assessments' file and the traditions'
//   people/anthromes/<n>_<w>.lwt     a 10° tile of 5′ cells: each cell's classes through time as runs, and its region
//   people/anthromes/globe.lwt       the same at 0.25°, each cell the commonest class of its nine, for the globe
//   people/assessments.json          ArchaeoGLOBE's rows, by region and time
//   people/traditions.json           the building traditions, each with what it inherits
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { decodeTile, encodeTile } from '../../../../core/container.ts';
import { compileAgriculture, compileHusbandry, compileTraditions, prevalenceOf, traditionAt, traditionsFor, type Agriculture, type AgricultureInput, type CropEntry, type PrevalenceWord, type DwellingSpec, type FieldSpec, type Husbandry, type HusbandryInput, type LifewayWord, type OutbuildingSpec, type SettlementSpec, type TownSpec, type Tradition, type TraditionInput } from '../../../../core/dwelling.ts';
import { aliveAt, centralAt, peopleModel, type Figure } from '../../../../core/citypop.ts';
import { canonicalForm, type Form } from '../../../../core/form.ts';
import type { LivingTaxon } from '../../../../core/scene.ts';
import { GENERATOR as SETTLEMENT, peopleReach, VERSION as SETTLEMENT_VERSION } from '../../../../world/generators/people/settlement/v12.ts';
import { EXTENT } from '../../../../world/generators/life/scene/current.ts';
import { FormTree } from '../forms.ts';
import type { LandscapeIndex, TraditionsFile } from '../../../../core/landscape.ts';
export type { LandscapeIndex, TraditionsFile };
import { anthromeTile, assessmentAt, cityNamesMatch, cityPeople, classAtStep, cellOf, figuresOf, groupCityRows, kmBetween, LEVEL_WORDS, LIFEWAY_OF, lifewayOf, modernMatchesHistorical, nameAt, nearestStep, populationOf, recordNamesOf, rowsNear, shareDensity, tileKey, type AnthromeClass, type City, type CityRecord, type CitiesFile, type AnthromeTile, type AnthromeTileHeader, type Assessment, type AssessmentsFile, type HousingCount, type Pattern } from '../../../../core/landscape.ts';
import { cellAt, gridSize, peopleAt, type PeopleFile } from '../../../../core/layers.ts';
import { datasetFile } from '../manifest.ts';
import { CACHE } from '../paths.ts';
import { sha256, stableStringify } from '../util.ts';
import { insideOutline } from '../../../../core/relief.ts';
import { elementKey, type LatLon } from '../ohm.ts';
import { kindIs, type Entity, type Field, type World } from '../world.ts';
import { claimOf, subjectTime, validSpan, type Solved } from './records.ts';

const NX = 4320;
const NY = 2160;
const RES = 1 / 12;

// ——— Reading the grids ———

/** An Arc ASCII grid of small whole numbers, as the build's class numbers: anything not in `index`, nodata included, is 0. */
export function parseClassGrid(b: Uint8Array, out: Uint8Array, index: Int16Array): void {
  let p = 0;
  for (let lines = 0; lines < 6; p++) if (b[p] === 10) lines++;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    while (b[p] <= 32) p++;
    if (p >= b.length) throw new Error(`the grid ends after ${i} of ${n} cells`);
    let neg = false;
    if (b[p] === 45) {
      neg = true;
      p++;
    }
    let v = 0;
    while (p < b.length && b[p] > 32) v = v * 10 + (b[p++] - 48);
    out[i] = neg || v >= index.length || index[v] < 0 ? 0 : index[v];
  }
}

/** The year a grid of Anthromes 12K is labelled with, as the axis reads it: 10000BC is −10000, 0AD is 0. */
export function stepOfName(name: string): number | undefined {
  const m = /(?:^|\/)(\d+)(AD|BC)_anthromes\.zip$/.exec(name);
  return m ? (m[2] === 'BC' ? -Number(m[1]) : Number(m[1])) : undefined;
}

// ——— The regions ———

/** Eckert IV, back to latitude and longitude, on a sphere of the WGS84 semi-major axis, as the regions' shapes were projected. */
export function eckert4Inverse(x: number, y: number, R = 6378137): [number, number] {
  const cx = 2 / Math.sqrt(Math.PI * (4 + Math.PI));
  const cy = 2 * Math.sqrt(Math.PI / (4 + Math.PI));
  const s = Math.max(-1, Math.min(1, y / (cy * R)));
  const theta = Math.asin(s);
  const lat = Math.asin(Math.max(-1, Math.min(1, (theta + Math.sin(theta) * Math.cos(theta) + 2 * Math.sin(theta)) / (2 + Math.PI / 2))));
  const c = 1 + Math.cos(theta);
  const lon = c > 1e-12 ? x / (cx * R * c) : 0;
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

/** A shapefile's polygons, each a list of rings of [x, y]. */
export function readPolygons(shp: Uint8Array): number[][][][] {
  const v = new DataView(shp.buffer, shp.byteOffset, shp.byteLength);
  if (v.getInt32(0, false) !== 9994) throw new Error('not a shapefile');
  const out: number[][][][] = [];
  for (let p = 100; p + 8 <= shp.length; ) {
    const len = v.getInt32(p + 4, false) * 2;
    const at = p + 8;
    const type = v.getInt32(at, true);
    if (type === 5) {
      const parts = v.getInt32(at + 36, true);
      const points = v.getInt32(at + 40, true);
      const starts = Array.from({ length: parts }, (_, i) => v.getInt32(at + 44 + 4 * i, true));
      const base = at + 44 + 4 * parts;
      const rings: number[][][] = [];
      for (let i = 0; i < parts; i++) {
        const a = starts[i];
        const b = i + 1 < parts ? starts[i + 1] : points;
        const ring: number[][] = [];
        for (let k = a; k < b; k++) ring.push([v.getFloat64(base + 16 * k, true), v.getFloat64(base + 16 * k + 8, true)]);
        rings.push(ring);
      }
      out.push(rings);
    } else out.push([]);
    p = at + len;
  }
  return out;
}

/** A dBASE table's rows, each by field name, as text. */
export function readDbf(dbf: Uint8Array): Record<string, string>[] {
  const v = new DataView(dbf.buffer, dbf.byteOffset, dbf.byteLength);
  const n = v.getUint32(4, true);
  const headerLength = v.getUint16(8, true);
  const recordLength = v.getUint16(10, true);
  const fields: { name: string; length: number }[] = [];
  for (let p = 32; dbf[p] !== 0x0d; p += 32) {
    const name = new TextDecoder('latin1').decode(dbf.subarray(p, p + 11)).replace(/\0.*$/, '');
    fields.push({ name, length: dbf[p + 16] });
  }
  const out: Record<string, string>[] = [];
  for (let r = 0; r < n; r++) {
    let p = headerLength + r * recordLength + 1;
    const row: Record<string, string> = {};
    for (const f of fields) {
      row[f.name] = new TextDecoder('latin1').decode(dbf.subarray(p, p + f.length)).trim();
      p += f.length;
    }
    out.push(row);
  }
  return out;
}

/**
 * Each region's outline filled into a grid of cells `res` degrees across, by row from the north: a cell takes the region
 * whose rings cross a line through its centre around it an odd number of times. Later regions win where outlines overlap.
 */
export function rasterizeRegions(polys: { id: number; rings: number[][][] }[], nx: number, ny: number, res: number): Uint8Array {
  const out = new Uint8Array(nx * ny);
  for (const { id, rings } of polys) {
    let south = 90;
    let north = -90;
    for (const r of rings) for (const [, lat] of r) {
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
    const r0 = Math.max(0, Math.floor((90 - north) / res));
    const r1 = Math.min(ny - 1, Math.ceil((90 - south) / res));
    const xs: number[] = [];
    for (let row = r0; row <= r1; row++) {
      const lat = 90 - (row + 0.5) * res;
      xs.length = 0;
      for (const ring of rings) {
        for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
          const [x0, y0] = ring[j];
          const [x1, y1] = ring[k];
          if (y0 > lat !== y1 > lat) xs.push(x0 + ((lat - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] + 180) / res - 0.5));
        const c1 = Math.min(nx - 1, Math.floor((xs[k + 1] + 180) / res - 0.5));
        for (let c = c0; c <= c1; c++) out[row * nx + c] = id;
      }
    }
  }
  return out;
}

/** A cell of land that no outline holds takes the region of the nearest cell that one does, within `reach` cells, by rings of growing distance. */
export function fillGaps(region: Uint8Array, land: (i: number) => boolean, nx: number, ny: number, reach: number): number {
  let filled = 0;
  const src = region.slice();
  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      const i = row * nx + col;
      if (src[i] || !land(i)) continue;
      let best = 0;
      let bestD = Infinity;
      for (let d = 1; d <= reach && !best; d++) {
        for (let dr = -d; dr <= d; dr++) {
          const r = row + dr;
          if (r < 0 || r >= ny) continue;
          for (let dc = -d; dc <= d; dc++) {
            if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
            const c = (((col + dc) % nx) + nx) % nx;
            const v = src[r * nx + c];
            if (!v) continue;
            const dd = dr * dr + dc * dc;
            if (dd < bestD || (dd === bestD && v < best)) {
              best = v;
              bestD = dd;
            }
          }
        }
      }
      if (best) {
        region[i] = best;
        filled++;
      }
    }
  }
  return filled;
}

// ——— The anthromes, as runs ———

interface Runs {
  steps: number[];
  /** for each cell of the 5′ grid, its runs: counts, and pairs of class and first step */
  counts: Uint8Array;
  offsets: Uint32Array;
  runs: Uint8Array;
  /** the same at the globe's resolution */
  globe: { nx: number; ny: number; counts: Uint8Array; offsets: Uint32Array; runs: Uint8Array };
}

/** Growing arrays of changes: the cell, its new class and the step. */
class Changes {
  cell = new Uint32Array(1 << 20);
  cls = new Uint8Array(1 << 20);
  step = new Uint8Array(1 << 20);
  n = 0;
  add(c: number, k: number, s: number): void {
    if (this.n === this.cell.length) {
      const grow = <T extends Uint32Array | Uint8Array>(a: T): T => {
        const b = new (a.constructor as new (n: number) => T)(a.length * 2);
        b.set(a);
        return b;
      };
      this.cell = grow(this.cell);
      this.cls = grow(this.cls);
      this.step = grow(this.step);
    }
    this.cell[this.n] = c;
    this.cls[this.n] = k;
    this.step[this.n] = s;
    this.n++;
  }
  /** By cell, in the order of steps: counts, offsets and runs. */
  sort(cells: number): { counts: Uint8Array; offsets: Uint32Array; runs: Uint8Array } {
    const counts = new Uint8Array(cells);
    for (let i = 0; i < this.n; i++) counts[this.cell[i]]++;
    const offsets = new Uint32Array(cells + 1);
    for (let i = 0; i < cells; i++) offsets[i + 1] = offsets[i] + counts[i];
    const at = offsets.slice(0, cells);
    const runs = new Uint8Array(this.n * 2);
    for (let i = 0; i < this.n; i++) {
      const k = at[this.cell[i]]++;
      runs[2 * k] = this.cls[i];
      runs[2 * k + 1] = this.step[i];
    }
    return { counts, offsets, runs };
  }
}

/** The commonest class of a block of cells, ignoring no land; a tie goes to the lower number, the more intensive use. */
function commonest(grid: Uint8Array, nx: number, row: number, col: number, f: number, tally: Uint16Array): number {
  tally.fill(0);
  for (let r = 0; r < f; r++) for (let c = 0; c < f; c++) tally[grid[(row * f + r) * nx + col * f + c]]++;
  let best = 0;
  for (let k = 1; k < tally.length; k++) if (tally[k] > tally[best] || (best === 0 && tally[k] > 0)) best = k;
  return tally[best] > 0 ? best : 0;
}

/** Every grid of the archive, read one at a time into runs of each cell's classes, and the globe's picture with them. */
export function anthromeRuns(zip: Uint8Array, classes: AnthromeClass[], globeFactor: number, log: (s: string) => void): Runs {
  const outer = unzipSync(zip);
  const members = Object.keys(outer)
    .map((name) => ({ name, step: stepOfName(name) }))
    .filter((m): m is { name: string; step: number } => m.step !== undefined)
    .sort((a, b) => a.step - b.step);
  if (!members.length) throw new Error('the anthromes archive has no grids');
  if (members.length > 255) throw new Error('more steps than a byte holds');
  const index = new Int16Array(100).fill(-1);
  classes.forEach((c, i) => (index[c.code] = i + 1));
  const N = NX * NY;
  const gx = NX / globeFactor;
  const gy = NY / globeFactor;
  const grid = new Uint8Array(N);
  const prev = new Uint8Array(N);
  const gridG = new Uint8Array(gx * gy);
  const prevG = new Uint8Array(gx * gy);
  const fine = new Changes();
  const coarse = new Changes();
  const tally = new Uint16Array(classes.length + 1);
  members.forEach((m, s) => {
    const inner = unzipSync(outer[m.name]);
    const asc = Object.entries(inner).find(([k]) => k.endsWith('.asc'));
    if (!asc) throw new Error(`${m.name} holds no grid`);
    parseClassGrid(asc[1], grid, index);
    for (let i = 0; i < N; i++) if (grid[i] !== prev[i]) fine.add(i, grid[i], s);
    prev.set(grid);
    for (let r = 0; r < gy; r++) for (let c = 0; c < gx; c++) gridG[r * gx + c] = commonest(grid, NX, r, c, globeFactor, tally);
    for (let i = 0; i < gridG.length; i++) if (gridG[i] !== prevG[i]) coarse.add(i, gridG[i], s);
    prevG.set(gridG);
  });
  log(`landscape  ${members.length} grids of anthromes read, ${fine.n.toLocaleString('en-US')} runs at 5′, ${coarse.n.toLocaleString('en-US')} at ${globeFactor * 5}′`);
  return { steps: members.map((m) => m.step), ...fine.sort(N), globe: { nx: gx, ny: gy, ...coarse.sort(gx * gy) } };
}

// ——— ArchaeoGLOBE ———

/** Split one CSV line, honouring double-quoted fields and escaped quotes. */
function splitCsvLine(l: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) {
      if (ch === '"' && l[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** The snapshot's rows, as the viewer reads them. */
export function assessmentsFile(csv: string, source: string, title: string): AssessmentsFile {
  const lines = csv.split('\n').filter((l) => l && !l.startsWith('#'));
  const head = splitCsvLine(lines[0]);
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`the assessments have no column ${name}`);
    return i;
  };
  const level = (v: string) => {
    const k = (LEVEL_WORDS as readonly string[]).indexOf(v);
    if (k < 0) throw new Error(`"${v}" is not a level`);
    return k;
  };
  const slices: { year: number; label: string }[] = [];
  const regions = new Map<number, string>();
  const rows: Record<string, Assessment[]> = {};
  const SLICE_LABEL: Record<string, string> = { '10K': '10,000 BP', '8K': '8,000 BP', '6K': '6,000 BP', '4K': '4,000 BP', '3K': '3,000 BP', '2K': '2,000 BP', '1K': '1,000 BP', '1500CE': '1500 CE', '1750CE': '1750 CE', '1850CE': '1850 CE' };
  for (const l of lines.slice(1)) {
    const c = splitCsvLine(l);
    const id = Number(c[col('region')]);
    const year = Number(c[col('year')]);
    if (!slices.some((s) => s.year === year)) slices.push({ year, label: SLICE_LABEL[c[col('slice')]] ?? c[col('slice')] });
    regions.set(id, c[col('label')]);
    const use = (u: string): [number, number, number, number] => [level(c[col(u)]), level(c[col(`${u}_min`)]), level(c[col(`${u}_median`)]), level(c[col(`${u}_max`)])];
    const urban = (v: string) => (v === 'Present' ? 1 : v === 'Split' ? 2 : 0);
    (rows[String(id)] ??= []).push({
      use: [use('foraging'), use('extensive'), use('intensive'), use('pastoral')],
      urban: urban(c[col('urban')]),
      urbanMedian: urban(c[col('urban_median')]),
      quality: Number(c[col('quality')]),
      expertise: Number(c[col('expertise')]),
    });
  }
  slices.sort((a, b) => a.year - b.year);
  return { format: 'lightworld-assessments@1', source, title, slices, regions: [...regions.entries()].sort((a, b) => a[0] - b[0]).map(([id, label]) => ({ id, label })), rows };
}

// ——— Cities ———

/** A column of a city list, as the axis reads it: BC_3000 is −2999, AD_100 is 100. */
export function cityYear(column: string): number | undefined {
  const m = /^(BC|AD)_(\d+)$/.exec(column);
  return m ? (m[1] === 'BC' ? 1 - Number(m[2]) : Number(m[2])) : undefined;
}

export interface CityLeftOut {
  city: string;
  country?: string;
  columns: string[];
}

/** The rows of a list of cities, each with its people at the years it gives, less the cells a field leaves out. */
export function citiesOf(csv: string, source: string, field: string, leftOut: CityLeftOut[]): City[] {
  const lines = csv.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const head = splitCsvLine(lines[0]);
  const latIdx = head.indexOf('Latitude');
  const lonIdx = head.indexOf('Longitude');
  const countryIdx = head.indexOf('Country');
  const certIdx = head.indexOf('Certainty');
  const out: City[] = [];
  for (const l of lines.slice(1)) {
    const c = splitCsvLine(l);
    const name = c[0].trim();
    const country = countryIdx >= 0 ? (c[countryIdx] ?? '').trim() : '';
    const skip = new Set(leftOut.filter((x) => x.city === name && (!x.country || x.country === country)).flatMap((x) => x.columns));
    const pops: [number, number][] = [];
    head.forEach((h, i) => {
      const y = cityYear(h);
      const v = Number(c[i]);
      if (y !== undefined && c[i] && c[i].trim() && Number.isFinite(v) && v > 0 && !skip.has(h)) pops.push([y, v]);
    });
    const lat = Number(c[latIdx]);
    const lon = Number(c[lonIdx]);
    if (!pops.length || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    pops.sort((a, b) => a[0] - b[0]);
    out.push({ name, country, lat, lon, certainty: Number(c[certIdx]) || 0, source, field, pops });
  }
  return out;
}

/** One row of the GHSL Urban Centre Database (GHS_STAT_UCDB2015MT_GLOBE_R2019A). */
export interface GhslRow {
  QA2_1V?: number | string | null;
  UC_NM_MN?: string | null;
  UC_NM_LST?: string | null;
  CTR_MN_NM?: string | null;
  GCPNT_LAT?: number | string | null;
  GCPNT_LON?: number | string | null;
  P75?: number | string | null;
  P90?: number | string | null;
  P00?: number | string | null;
  P15?: number | string | null;
}

const cleanModernName = (s: string | null | undefined): string => {
  const t = (s ?? '').trim();
  if (!t || t === 'N/A' || /^\?+$/.test(t) || !/[\p{L}\p{N}]/u.test(t)) return '';
  return t;
};

const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** Parse validated GHSL UCDB R2019A rows (QA2_1V === 1) into modern City anchors (1975, 1990, 2000, 2015). */
export function ghslRowsOf(rows: Iterable<GhslRow>, source: string, field: string): City[] {
  const out: City[] = [];
  for (const r of rows) {
    if (Number(r.QA2_1V) !== 1) continue;
    const name = cleanModernName(r.UC_NM_MN);
    if (!name) continue;
    const lat = Number(r.GCPNT_LAT);
    const lon = Number(r.GCPNT_LON);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const pops: [number, number][] = [];
    for (const [y, raw] of [
      [1975, r.P75],
      [1990, r.P90],
      [2000, r.P00],
      [2015, r.P15],
    ] as const) {
      const v = Number(raw);
      if (Number.isFinite(v) && v >= 1000) pops.push([y, Math.round(v)]);
    }
    if (!pops.length) continue;
    const alts: string[] = [];
    if (r.UC_NM_LST) {
      for (const raw of r.UC_NM_LST.split(';')) {
        const a = cleanModernName(raw);
        if (a && a !== name && !alts.includes(a)) alts.push(a);
      }
    }
    out.push({
      name,
      ...(alts.length ? { alts } : {}),
      country: cleanModernName(r.CTR_MN_NM),
      lat: round4(lat),
      lon: round4(lon),
      certainty: 1,
      source,
      field,
      pops,
    });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.lat - b.lat || a.lon - b.lon));
}

/** Parse GHSL UCDB R2019A CSV text into modern City anchors. */
export function ghslCitiesOf(csv: string, source: string, field: string): City[] {
  const lines = csv.replace(/\r/g, '').split('\n');
  const first = lines.findIndex((l) => l.trim().length > 0);
  if (first < 0) return [];
  const head = splitCsvLine(lines[first]);
  const col = (name: string) => head.indexOf(name);
  const iQa = col('QA2_1V');
  const iNm = col('UC_NM_MN');
  const iLst = col('UC_NM_LST');
  const iCtr = col('CTR_MN_NM');
  const iLat = col('GCPNT_LAT');
  const iLon = col('GCPNT_LON');
  const i75 = col('P75');
  const i90 = col('P90');
  const i00 = col('P00');
  const i15 = col('P15');
  const rows: GhslRow[] = [];
  for (let idx = first + 1; idx < lines.length; idx++) {
    const l = lines[idx];
    if (!l || l[0] === ',' || !l.trim()) continue;
    const c = splitCsvLine(l);
    rows.push({
      QA2_1V: iQa >= 0 ? c[iQa] : undefined,
      UC_NM_MN: iNm >= 0 ? c[iNm] : undefined,
      UC_NM_LST: iLst >= 0 ? c[iLst] : undefined,
      CTR_MN_NM: iCtr >= 0 ? c[iCtr] : undefined,
      GCPNT_LAT: iLat >= 0 ? c[iLat] : undefined,
      GCPNT_LON: iLon >= 0 ? c[iLon] : undefined,
      P75: i75 >= 0 ? c[i75] : undefined,
      P90: i90 >= 0 ? c[i90] : undefined,
      P00: i00 >= 0 ? c[i00] : undefined,
      P15: i15 >= 0 ? c[i15] : undefined,
    });
  }
  return ghslRowsOf(rows, source, field);
}

/** Read GHSL UCDB R2019A from either its UTF-8 GeoPackage (.gpkg) or CSV (.csv). */
export async function readGhslCities(filePath: string, source: string, field: string): Promise<City[]> {
  if (filePath.endsWith('.gpkg')) {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(filePath, { readOnly: true });
    try {
      const meta = db.prepare('SELECT table_name FROM gpkg_contents LIMIT 1').get() as { table_name?: string } | undefined;
      const table = meta?.table_name ?? 'GHS_STAT_UCDB2015MT_GLOBE_R2019A_V1_2';
      if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error(`unexpected GeoPackage table name "${table}"`);
      const rows = db
        .prepare(`SELECT QA2_1V, UC_NM_MN, UC_NM_LST, CTR_MN_NM, GCPNT_LAT, GCPNT_LON, P75, P90, P00, P15 FROM "${table}" WHERE QA2_1V = 1`)
        .all() as GhslRow[];
      return ghslRowsOf(rows, source, field);
    } finally {
      db.close();
    }
  }
  return ghslCitiesOf(await readFile(filePath, 'utf8'), source, field);
}

/** Parse Natural Earth 1:10m populated places GeoJSON into modern City anchors (fallback for surviving smaller towns). */
export function nePlacesOf(geojson: string, source: string, field: string, year = 2015): City[] {
  const fc = JSON.parse(geojson) as { features?: { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }[] };
  const out: City[] = [];
  for (const feat of fc.features ?? []) {
    if (feat.geometry?.type !== 'Point' || !Array.isArray(feat.geometry.coordinates)) continue;
    const [lon, lat] = feat.geometry.coordinates as [number, number];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const props = feat.properties ?? {};
    const name = cleanModernName(String(props.name ?? props.NAME ?? ''));
    if (!name) continue;
    const pop = Number(props.pop_max ?? props.POP_MAX ?? props.pop_min ?? props.POP_MIN ?? 0);
    if (!(Number.isFinite(pop) && pop >= 1000)) continue;
    const alts: string[] = [];
    const addAlt = (raw: unknown) => {
      if (typeof raw !== 'string' || !raw.trim()) return;
      for (const part of raw.split(/[|;,]+/)) {
        const a = cleanModernName(part);
        if (a && a !== name && !alts.includes(a)) alts.push(a);
      }
    };
    addAlt(props.nameascii ?? props.NAMEASCII);
    addAlt(props.namealt ?? props.NAMEALT);
    out.push({
      name,
      ...(alts.length ? { alts } : {}),
      country: cleanModernName(String(props.adm0name ?? props.ADM0NAME ?? '')),
      lat: round4(lat),
      lon: round4(lon),
      certainty: 1,
      source,
      field,
      pops: [[year, Math.round(pop)]],
    });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.lat - b.lat || a.lon - b.lon));
}

/**
 * Global benchmark columns of a historical city list: [year, cutoffPeople] for columns covering broad global
 * geography (filtering out single-country census columns such as Chandler's 1530, 1841, 1851, 1872), deduplicated
 * within `dedupeYr` windows by keeping the column with the most cities. The cutoff is the empirical `quantile`
 * (default 25th percentile) of listed populations in that column.
 */
export function benchmarkCutoffs(
  cities: City[],
  opts: { minCountries?: number; minEarly?: number; earlyUntil?: number; quantile?: number; dedupeYr?: number } = {},
): [number, number][] {
  const minCountries = opts.minCountries ?? 15;
  const minEarly = opts.minEarly ?? 15;
  const earlyUntil = opts.earlyUntil ?? 650;
  const quantile = opts.quantile ?? 0.25;
  const dedupeYr = opts.dedupeYr ?? 20;
  const byYear = new Map<number, { vals: number[]; countries: Set<string> }>();
  for (const c of cities) {
    for (const [y, v] of c.pops) {
      if (!(v > 0)) continue;
      let b = byYear.get(y);
      if (!b) {
        b = { vals: [], countries: new Set() };
        byYear.set(y, b);
      }
      b.vals.push(v);
      if (c.country) b.countries.add(c.country);
    }
  }
  const raw: { y: number; n: number; cut: number }[] = [];
  for (const [y, b] of [...byYear].sort((a, c) => a[0] - c[0])) {
    if (b.countries.size < minCountries && !(y <= earlyUntil && b.vals.length >= minEarly)) continue;
    b.vals.sort((a, c) => a - c);
    const idx = Math.max(0, Math.min(b.vals.length - 1, Math.floor(b.vals.length * quantile)));
    raw.push({ y, n: b.vals.length, cut: Math.round(b.vals[idx]) });
  }
  const kept: typeof raw = [];
  for (const col of raw) {
    const prev = kept.at(-1);
    if (prev && col.y - prev.y < dedupeYr) {
      if (col.n > prev.n) kept[kept.length - 1] = col;
    } else {
      kept.push(col);
    }
  }
  return kept.map((x) => [x.y, x.cut]);
}

/**
 * Compact Gaussian-smoothed 3°×3° local regional HYDE population series [year, people] about `(lat, lon)` from
 * `fromYear - 500` to the last HYDE step, used as the regional demographic drift prior in model:people/city-population.
 */
export function cityHyde(people: PeopleFile, lat: number, lon: number, fromYear: number): [number, number][] {
  const n = people.cell.length;
  if (!n || !people.steps.length) return [];
  const res = people.res;
  const cells: { idx: number; w: number }[] = [];
  let wSum = 0;
  for (let dr = -1; dr <= 1; dr++) {
    const la = lat + dr * res;
    if (la < -90 || la > 90) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const lo = ((((lon + dc * res + 180) % 360) + 360) % 360) - 180;
      const w = Math.exp(-0.5 * (dr * dr + dc * dc));
      wSum += w;
      const hit = cellAt(people, lo, la);
      if (hit.index >= 0) cells.push({ idx: hit.index, w });
    }
  }
  if (!cells.length || !(wSum > 0)) return [];
  const startYear = fromYear - 500;
  const steps = people.steps;
  const out: [number, number][] = [];
  let lastT = -Infinity;
  for (let si = 0; si < steps.length; si++) {
    const t = steps[si];
    if (t < startYear && si + 1 < steps.length && steps[si + 1] < startYear) continue;
    const isEnd = si === steps.length - 1;
    if (out.length > 0 && !isEnd && t !== 1975 && t - lastT < 50) continue;
    let sum = 0;
    const base = si * n;
    for (const c of cells) sum += people.people[base + c.idx] * c.w;
    // Scale by total kernel weight (9 cells' equivalent area) so the regional total is comparable across latitudes.
    out.push([t, Math.round(figures3((sum / wSum) * 9))]);
    lastT = t;
  }
  return out;
}

// ——— The traditions ———

/** When a record's town form held, where its claim says: [from, to] on the axis, a billion years either way for no bound. */
function townSpan(s: Solved, id: string): [number, number] | undefined {
  const c = claimOf(s, id, 'town_form');
  const v = c ? validSpan(s, c.valid, id) : undefined;
  return v ? [v[0] ?? -1e9, v[1] ?? 1e9] : undefined;
}

/** Each building tradition the world records, with its own claims, before inheritance. */
export function traditionInputs(s: Solved, regionsSource: string): TraditionInput[] {
  const w = s.world;
  const out: TraditionInput[] = [];
  for (const e of w.entities) {
    if (e.kind !== 'tradition/building' && e.kind !== 'tradition') continue;
    const value = <T>(prop: string): T | undefined => claimOf(s, e.id, prop)?.value as T | undefined;
    const extent = value<{ from: string; names: string[] }>('extent');
    const regions = extent && extent.from === regionsSource ? extent.names.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    const { time } = subjectTime(s, e.id);
    // A tradition holds from its best start to its best end; an end no claim gives is the present, and one known to be
    // unknown is the latest the evidence allows.
    const best = (e: { best: number | null; lo: number; hi: number }, or: number) => (e.best !== null && Number.isFinite(e.best) ? e.best : Number.isFinite(or) ? or : NaN);
    const start = best(time.start, time.start.lo);
    const end = time.endUnknown ? best(time.end, time.end.hi) : best(time.end, Infinity);
    const name = value<Record<string, string>>('name');
    const parent = e.relations.find((r) => r.rel === 'member-of')?.to;
    out.push({
      id: e.id,
      label: name?.en ?? Object.values(name ?? {})[0] ?? e.id,
      ...(parent ? { parent } : {}),
      regions,
      // A billion years either way stands for no bound, as JSON has no infinity.
      span: [Number.isFinite(start) ? start : -1e9, Number.isFinite(end) ? end : 1e9],
      ...(value<LifewayWord[]>('lifeway') ? { lifeways: value<LifewayWord[]>('lifeway') } : {}),
      ...(value<PrevalenceWord>('prevalence') ? { prevalence: value<PrevalenceWord>('prevalence') } : {}),
      ...(value<DwellingSpec>('dwelling') ? { dwelling: value<DwellingSpec>('dwelling') } : {}),
      ...(value<SettlementSpec>('settlement_form') ? { settlement: value<SettlementSpec>('settlement_form') } : {}),
      ...(value<FieldSpec>('field_system') ? { fields: value<FieldSpec>('field_system') } : {}),
      ...(value<TownSpec>('town_form') ? { town: value<TownSpec>('town_form') } : {}),
      ...(townSpan(s, e.id) ? { townSpan: townSpan(s, e.id) } : {}),
      ...(value<OutbuildingSpec[]>('outbuildings') ? { outbuildings: value<OutbuildingSpec[]>('outbuildings') } : {}),
    });
  }
  return out;
}

// ——— Husbandry ———

/** Each husbandry tradition the world records, with its own claims, before inheritance. */
export function husbandryInputs(s: Solved, regionsSource: string): HusbandryInput[] {
  const out: HusbandryInput[] = [];
  for (const e of s.world.entities) {
    if (e.kind !== 'tradition/husbandry') continue;
    const value = <T>(prop: string): T | undefined => claimOf(s, e.id, prop)?.value as T | undefined;
    const extent = value<{ from: string; names: string[] }>('extent');
    const regions = extent && extent.from === regionsSource ? extent.names.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    const { time } = subjectTime(s, e.id);
    const best = (x: { best: number | null; lo: number; hi: number }, or: number) => (x.best !== null && Number.isFinite(x.best) ? x.best : Number.isFinite(or) ? or : NaN);
    const start = best(time.start, time.start.lo);
    const end = time.endUnknown ? best(time.end, time.end.hi) : best(time.end, Infinity);
    const name = value<Record<string, string>>('name');
    const parent = e.relations.find((r) => r.rel === 'member-of')?.to;
    out.push({
      id: e.id,
      label: name?.en ?? Object.values(name ?? {})[0] ?? e.id,
      ...(parent ? { parent } : {}),
      regions,
      span: [Number.isFinite(start) ? start : -1e9, Number.isFinite(end) ? end : 1e9],
      ...(value<LifewayWord[]>('lifeway') ? { lifeways: value<LifewayWord[]>('lifeway') } : {}),
      ...(value<string[]>('livestock') ? { animals: value<string[]>('livestock') } : {}),
    });
  }
  return out;
}

// ——— Agriculture ———

/** Each agricultural tradition the world records, with its own claims, before inheritance. */
export function agricultureInputs(s: Solved, regionsSource: string): AgricultureInput[] {
  const out: AgricultureInput[] = [];
  for (const e of s.world.entities) {
    if (e.kind !== 'tradition/agriculture') continue;
    const value = <T>(prop: string): T | undefined => claimOf(s, e.id, prop)?.value as T | undefined;
    const extent = value<{ from: string; names: string[] }>('extent');
    const regions = extent && extent.from === regionsSource ? extent.names.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    const { time } = subjectTime(s, e.id);
    const best = (x: { best: number | null; lo: number; hi: number }, or: number) => (x.best !== null && Number.isFinite(x.best) ? x.best : Number.isFinite(or) ? or : NaN);
    const start = best(time.start, time.start.lo);
    const end = time.endUnknown ? best(time.end, time.end.hi) : best(time.end, Infinity);
    const name = value<Record<string, string>>('name');
    const parent = e.relations.find((r) => r.rel === 'member-of')?.to;
    out.push({
      id: e.id,
      label: name?.en ?? Object.values(name ?? {})[0] ?? e.id,
      ...(parent ? { parent } : {}),
      regions,
      span: [Number.isFinite(start) ? start : -1e9, Number.isFinite(end) ? end : 1e9],
      ...(value<LifewayWord[]>('lifeway') ? { lifeways: value<LifewayWord[]>('lifeway') } : {}),
      ...(value<CropEntry[]>('crops') ? { crops: value<CropEntry[]>('crops') } : {}),
      ...(value<FieldSpec>('field_system') ? { fields: value<FieldSpec>('field_system') } : {}),
    });
  }
  return out;
}

/** To three figures, as the atlas rounds a size. */
const figures3 = (x: number): number => {
  if (!Number.isFinite(x) || x <= 0) return 0;
  let k = 1;
  while (x * k < 100) k *= 10;
  while (x * k >= 1000) k /= 10;
  return Math.floor(x * k + 0.5) / k;
};

/**
 * The animals the husbandry traditions name, each as a scene draws it: the body its taxon's records give it, up the
 * tree to the nearest that has one, and its size, the middle of the range its nearest claim gives (the atlas's taxa
 * take theirs the same way, core/form.ts and tools/world/src/forms.ts). One with no body or no size above it is left
 * out, and said: a size is inherited, never guessed.
 */
export function keptAnimals(w: World, ids: string[], log: (s: string) => void = () => {}): { kept: LivingTaxon[]; forms: Record<string, Form> } {
  const tree = new FormTree(w);
  const kept: LivingTaxon[] = [];
  const forms: Record<string, Form> = {};
  const labelOf = (id: string) => {
    const name = w.entity.get(id)?.claims.find((c) => c.prop === 'name')?.value as { en?: string; la?: string } | undefined;
    return name?.en ?? name?.la ?? id;
  };
  const always = { best: null, lo: -Infinity, hi: Infinity, derived: true };
  for (const id of [...new Set(ids)].sort()) {
    const source = tree.source(id);
    const form = tree.form(id);
    const length = tree.size(id, 'body_length');
    const mass = tree.size(id, 'body_mass');
    const hip = tree.size(id, 'hip_height');
    if (!source || !form || form.kind !== 'animal' || (!length && !mass)) {
      log(`landscape  ${id} is kept by a husbandry tradition and cannot be drawn: ${!source || !form ? 'no record above it has a body plan' : form.kind !== 'animal' ? 'its body is no animal\'s' : 'no record at or above it gives a size'}`);
      continue;
    }
    const canon = canonicalForm(form);
    const key = sha256(stableStringify(canon)).slice(0, 16);
    forms[key] = canon;
    const middle = (q: { lo: number; hi: number }) => figures3(Math.sqrt(q.lo * q.hi));
    const m = mass ? middle(mass) : undefined;
    const fromMass = !length && m !== undefined;
    const l = length ? middle(length) : figures3(Math.cbrt(m! / (form.mass_length ?? 20)));
    const size = length ?? mass!;
    const posture = tree.posture(id);
    kept.push({
      id,
      label: labelOf(id),
      form: key,
      form_from: source.from,
      form_label: labelOf(source.from),
      own: source.from === id,
      tier: 'kept',
      weight: 1,
      rows: 0,
      ...(posture ? { posture } : {}),
      biped: posture === 'biped',
      length: l,
      ...(hip && hip.own ? { hip: middle(hip) } : {}),
      ...(m !== undefined ? { mass: m } : {}),
      ...(!size.own ? { size_from: labelOf(size.from) } : {}),
      ...(fromMass ? { fromMass: true } : {}),
      // It stands for as long as its keepers' tradition does: the scene asks the tradition, not the taxon.
      time: { start: always, end: always, instant: false },
    });
  }
  return { kept, forms };
}

// ——— The settlements with records ———

/** The properties whose figures the population model reads (core/citypop.ts). */
const FIGURE_PROPS: Figure['prop'][] = ['population', 'settlement_area', 'houses'];

/**
 * The records the landscape reads, of which its stage's key in the build's cache is made (build/index.ts): the
 * traditions and the taxa they keep, anything with figures of people, animals or crops, and every settlement, figures of
 * its own or none. cityRecords reads them all, and one whose people only the lists give still sets its place, its span
 * and its plan: left out of the key, a change to it would leave the cities of an earlier build in place.
 */
export function landscapeEntities(w: World): Entity[] {
  return w.entities.filter(
    (e) =>
      e.kind.startsWith('tradition/') ||
      e.kind.startsWith('place/') ||
      kindIs(e.kind, 'settlement') ||
      e.kind === 'taxon' ||
      e.claims.some((c) => c.prop === 'population' || c.prop === 'livestock' || c.prop === 'crops'),
  );
}

/** Measured outlines in geographic degrees, retaining holes and separate enclosures. */
export function settlementOutline(world: Pick<World, 'snapshots'>, value: unknown): number[][][][] {
  const g = value as { type?: string; coordinates?: number[][][] | number[][][][]; from?: string; elements?: string[] };
  if (g.type === 'Polygon') return [g.coordinates as number[][][]];
  if (g.type === 'MultiPolygon') return g.coordinates as number[][][][];
  const snapshot = g.from && world.snapshots.get(g.from);
  if (!snapshot || snapshot.format !== 'lightworld-ohm-snapshot@1' || !g.elements) return [];
  const ids = new Set(g.elements);
  const polygons: number[][][][] = [];
  const closed = (r: LatLon[]) => r.length >= 4 && r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1];
  const ring = (r: LatLon[]) => r.map(([lat, lon]) => [lon, lat]);
  for (const el of snapshot.elements) {
    if (!ids.has(elementKey(el))) continue;
    const outer = (el.outer ?? (el.line ? [el.line] : [])).filter(closed).map((r) => [ring(r)]);
    for (const hole of (el.inner ?? []).filter(closed)) {
      const [lat, lon] = hole[0];
      outer.find((p) => insideOutline([p], lon, lat))?.push(ring(hole));
    }
    polygons.push(...outer);
  }
  return polygons;
}

/**
 * The settlements the world has records of, as the landscape reads them (core/landscape.ts, CityRecord): each with a
 * place, with every claim of its people, its houses and its ground but those deprecated, each with the ground it counts
 * and the years it is for, which the population model reads together (core/citypop.ts), with its cores while they
 * stood, and how it was laid out.
 */
export function cityRecords(s: Solved): CityRecord[] {
  const out: CityRecord[] = [];
  for (const e of s.world.entities) {
    if (!kindIs(e.kind, 'settlement')) continue;
    const at = claimOf(s, e.id, 'location')?.value as { lat?: number; lon?: number } | undefined;
    if (!at || typeof at.lat !== 'number' || typeof at.lon !== 'number') continue;
    const { time } = subjectTime(s, e.id);
    const best = (x: { best: number | null; lo: number; hi: number }, or: number) => (x.best !== null && Number.isFinite(x.best) ? x.best : Number.isFinite(or) ? or : NaN);
    const start = best(time.start, time.start.lo);
    const end = time.endUnknown ? best(time.end, time.end.hi) : best(time.end, Infinity);
    const span: [number, number] = [Number.isFinite(start) ? start : -1e9, Number.isFinite(end) ? end : 1e9];
    // The years a claim is for: a span over more than a year, else the moment it names; none where it names none.
    const yearsOf = (c: { valid?: unknown }): [number, number] | undefined => {
      const valid = validSpan(s, c.valid as never, e.id);
      if (!valid) return undefined;
      if (valid[0] !== null && valid[1] !== null && valid[1] - valid[0] > 1) return [valid[0], valid[1]];
      const p = valid[0] ?? valid[1];
      return p !== null && Number.isFinite(p) ? [p, p] : undefined;
    };
    const figures: Figure[] = [];
    for (const c of e.claims) {
      if (c.subject !== e.id || !FIGURE_PROPS.includes(c.prop as Figure['prop']) || c.alt || c.status === 'deprecated' || c.rank === 'deprecated') continue;
      const q = c.value as number | { mean?: number; lo?: number; hi?: number };
      const range = typeof q === 'object' && q !== null && typeof q.lo === 'number' && typeof q.hi === 'number' && q.lo > 0 && q.hi > q.lo ? { lo: q.lo, hi: q.hi } : undefined;
      const v = typeof q === 'number' ? q : typeof q?.mean === 'number' ? q.mean : range ? Math.sqrt(range.lo * range.hi) : NaN;
      if (!(v > 0)) continue;
      const t = yearsOf(c);
      figures.push({
        prop: c.prop as Figure['prop'],
        ground: (c.ground ?? 'settlement') as Figure['ground'],
        ...(t ? { t } : {}),
        v: Math.round(v * 100) / 100,
        ...(range ?? {}),
        source: c.sources[0]?.ref ?? 'unsourced',
        claim: `${e.id}#${c.key}`,
        ...(c.rank === 'preferred' ? { preferred: true } : {}),
      });
    }
    // The places it was centred on, while each was.
    const siteClaim = (c: Entity['claims'][number]) => {
      const v = validSpan(s, c.valid, e.id);
      return { ref: c.ref, span: [v?.[0] ?? span[0], v?.[1] ?? span[1]] as [number, number], rank: c.rank, ...(c.alt ? { alt: c.alt } : {}) };
    };
    const extents = e.claims
      .filter((c) => c.subject === e.id && c.prop === 'extent' && c.status !== 'deprecated' && (!c.ground || c.ground === 'settlement' || c.ground === 'core'))
      .flatMap((c) => {
        const polygons = settlementOutline(s.world, c.value);
        if (!polygons.length) return [];
        return [{ ...siteClaim(c), basis: c.basis, ...(c.sources[0] ? { source: c.sources[0].ref } : {}), polygons }];
      });
    const cores = e.claims
      .filter((c) => c.subject === e.id && c.prop === 'core' && c.status !== 'deprecated')
      .flatMap((c) => {
        const p = c.value as { lat?: number; lon?: number };
        if (typeof p?.lat !== 'number' || typeof p?.lon !== 'number') return [];
        const name = claimOf(s, c.ref, 'name')?.value as Record<string, string> | undefined;
        const label = name?.en ?? Object.values(name ?? {})[0];
        return [{ lat: p.lat, lon: p.lon, ...(label ? { label } : {}), ...siteClaim(c) }];
      });
    const name = claimOf(s, e.id, 'name')?.value as Record<string, string> | undefined;
    // Its names in turn, where they have their times: a scene of 1500 names Tenochtitlan, not Mexico City.
    const names = e.claims
      .filter((c) => c.subject === e.id && c.prop === 'name' && !c.alt && c.status !== 'deprecated' && c.rank !== 'deprecated' && c.valid !== undefined)
      .flatMap((c) => {
        const v = validSpan(s, c.valid, e.id);
        const text = (c.value as Record<string, string>)?.en ?? Object.values((c.value ?? {}) as Record<string, string>)[0];
        return v && text ? [{ text, span: [v[0] ?? -1e9, v[1] ?? 1e9] as [number, number] }] : [];
      });
    const town = claimOf(s, e.id, 'town_form')?.value as TownSpec | undefined;
    out.push({
      id: e.id,
      name: name?.en ?? Object.values(name ?? {})[0] ?? e.id,
      ...(names.length ? { names } : {}),
      lat: at.lat,
      lon: at.lon,
      span,
      figures,
      ...(cores.length ? { cores } : {}),
      ...(extents.length ? { extents } : {}),
      ...(town ? { town } : {}),
      ...(town && townSpan(s, e.id) ? { townSpan: townSpan(s, e.id) } : {}),
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ——— The build ———

export interface LandscapeBuilt {
  files: Map<string, Uint8Array | string>;
  index: LandscapeIndex;
  assessments: AssessmentsFile;
  traditions: Tradition[];
  husbandry: Husbandry[];
  agriculture: Agriculture[];
  cities: CitiesFile;
  /** the span the anthromes hold, and the assessments' */
  span: [number, number];
  assessed: [number, number];
  /** the class and the region at a place and time, from the built tiles */
  at: (lat: number, lon: number, t: number) => { anthrome: number; region: number } | undefined;
  /** a built tile by its key `north_west`, or undefined where it holds no land */
  tile: (key: string) => AnthromeTile | undefined;
  classes: AnthromeClass[];
}

const fieldOf = (w: World, as: string): Field | undefined => w.fields.find((f) => f.data?.as === as);

/** Everything the human landscape needs, made from its datasets and records; undefined if the world has no anthromes field. */
export async function buildLandscape(s: Solved, log: (s: string) => void): Promise<LandscapeBuilt | undefined> {
  const w = s.world;
  const af = fieldOf(w, 'anthromes');
  const lf = fieldOf(w, 'land-use-assessment');
  const lifeways = w.fields.find((f) => f.rule === 'lifeways');
  if (!af || !lf) return undefined;
  const params = af.params as unknown as { tile_deg: number; globe_deg: number; classes: AnthromeClass[] };
  const lparams = lf.params as unknown as { res_deg: number; reach_cells: number };
  const classes = params.classes;
  const globeFactor = Math.round(params.globe_deg / RES);
  const tileCells = Math.round(params.tile_deg / RES);
  const ds = w.manifest.datasets;
  const zipPath = datasetFile(af.data!.from, ds[af.data!.from]);
  const regionsId = lf.data!.regions!;
  const shp = datasetFile(regionsId, ds[regionsId], 'shapes');
  const dbf = datasetFile(regionsId, ds[regionsId], 'table');
  for (const p of [zipPath, shp, dbf]) if (!existsSync(p)) throw new Error(`missing ${p}; run \`npm run fetch\` first`);
  // The tiles take a minute to make and change only with their inputs, so they are kept between builds.
  const key = sha256(stableStringify({ zip: ds[af.data!.from].fetch.sha256, regions: ds[regionsId].fetch.sha256, params, lparams, code: 1 })).slice(0, 16);
  const cache = join(CACHE, 'import', `landscape@${key}`);
  const files = new Map<string, Uint8Array | string>();
  if (existsSync(join(cache, 'done'))) {
    log(`landscape  cached (${key})`);
    for (const name of await readdir(cache)) if (name.endsWith('.lwt')) files.set(`people/anthromes/${name}`, new Uint8Array(await readFile(join(cache, name))));
  } else {
    const runs = anthromeRuns(new Uint8Array(await readFile(zipPath)), classes, globeFactor, log);
    // The regions, into the same grid: their shapes back from Eckert IV, then filled, then gaps of the coast closed.
    const rows = readDbf(new Uint8Array(await readFile(dbf)));
    const polys = readPolygons(new Uint8Array(await readFile(shp))).map((rings, i) => ({ id: Number(rows[i].Archaeo_ID), rings: rings.map((r) => r.map(([x, y]) => eckert4Inverse(x, y))) }));
    if (Math.abs(lparams.res_deg - RES) > 1e-4) throw new Error('the regions are drawn on the anthromes\' grid');
    const region = rasterizeRegions(polys, NX, NY, RES);
    const filled = fillGaps(region, (i) => runs.counts[i] > 0, NX, NY, lparams.reach_cells);
    let landNoRegion = 0;
    for (let i = 0; i < region.length; i++) if (runs.counts[i] > 0 && !region[i]) landNoRegion++;
    log(`landscape  ${polys.length} regions drawn at 5′; ${filled.toLocaleString('en-US')} cells of land outside every outline took the nearest region, ${landNoRegion.toLocaleString('en-US')} are too far from one`);
    await mkdir(cache, { recursive: true });
    const header = (north: number, west: number, nx: number, ny: number, res: number): AnthromeTileHeader => ({ format: 'lightworld-anthromes@1', north, west, nx, ny, res, steps: runs.steps });
    for (let tr = 0; tr < NY / tileCells; tr++) {
      for (let tc = 0; tc < NX / tileCells; tc++) {
        const n = tileCells * tileCells;
        const counts = new Uint8Array(n);
        const reg = new Uint8Array(n);
        let total = 0;
        for (let r = 0; r < tileCells; r++) for (let c = 0; c < tileCells; c++) {
          const g = (tr * tileCells + r) * NX + tc * tileCells + c;
          counts[r * tileCells + c] = runs.counts[g];
          reg[r * tileCells + c] = region[g];
          total += runs.counts[g];
        }
        if (!total) continue;
        const pairs = new Uint8Array(total * 2);
        let k = 0;
        for (let r = 0; r < tileCells; r++) for (let c = 0; c < tileCells; c++) {
          const g = (tr * tileCells + r) * NX + tc * tileCells + c;
          pairs.set(runs.runs.subarray(2 * runs.offsets[g], 2 * runs.offsets[g + 1]), k);
          k += 2 * runs.counts[g];
        }
        const north = 90 - tr * params.tile_deg;
        const west = -180 + tc * params.tile_deg;
        const name = `${north}_${west}.lwt`;
        const bytes = encodeTile(header(north, west, tileCells, tileCells, RES) as unknown as Record<string, unknown>, [counts, pairs, reg], stableStringify);
        files.set(`people/anthromes/${name}`, bytes);
        await writeFile(join(cache, name), bytes);
      }
    }
    // The globe's picture: each cell the commonest class of its nine, and the commonest region of its land.
    const g = runs.globe;
    const greg = new Uint8Array(g.nx * g.ny);
    const tally = new Uint16Array(256);
    for (let r = 0; r < g.ny; r++) for (let c = 0; c < g.nx; c++) {
      tally.fill(0);
      for (let a = 0; a < globeFactor; a++) for (let b = 0; b < globeFactor; b++) tally[region[(r * globeFactor + a) * NX + c * globeFactor + b]]++;
      let best = 0;
      for (let k = 1; k < 256; k++) if (tally[k] > (best ? tally[best] : 0)) best = k;
      greg[r * g.nx + c] = best;
    }
    const globe = encodeTile(header(90, -180, g.nx, g.ny, params.globe_deg) as unknown as Record<string, unknown>, [g.counts, g.runs, greg], stableStringify);
    files.set('people/anthromes/globe.lwt', globe);
    await writeFile(join(cache, 'globe.lwt'), globe);
    await writeFile(join(cache, 'done'), '');
  }
  // The assessments and the traditions are small, and follow the records: made every build.
  const csv = await readFile(datasetFile(lf.data!.from, ds[lf.data!.from]), 'utf8');
  const assessments = assessmentsFile(csv, lf.data!.from, lf.title);
  files.set('people/assessments.json', stableStringify(assessments));
  const cityFields = w.fields.filter((f) => f.data?.as === 'cities');
  const cities: CitiesFile = { format: 'lightworld-cities@1', lists: [], cities: [] };
  const histFields = cityFields.filter((f) => (f.params as { role?: string } | undefined)?.role !== 'modern');
  const modernFields = cityFields.filter((f) => (f.params as { role?: string } | undefined)?.role === 'modern');
  for (const f of histFields) {
    const p = (f.params ?? {}) as { left_out?: CityLeftOut[]; hold_yr?: number; gap_yr?: number };
    const text = new TextDecoder('latin1').decode(await readFile(datasetFile(f.data!.from, ds[f.data!.from])));
    const rows = citiesOf(text, f.data!.from, f.id, p.left_out ?? []);
    const cutoffs = benchmarkCutoffs(rows);
    cities.lists.push({
      source: f.data!.from,
      field: f.id,
      title: f.title,
      hold: p.hold_yr ?? 0,
      gap: p.gap_yr ?? 1e9,
      role: 'historical',
      ...(cutoffs.length ? { cutoffs } : {}),
    });
    cities.cities.push(...rows);
  }
  // The settlements the world has records of: a scene draws one from its own claims, beside or in place of a list's figure.
  cities.records = cityRecords(s);
  if (modernFields.length) {
    const histCities = [...cities.cities];
    const livingRecords = (cities.records ?? []).filter((r) => r.span[1] >= 1900);
    const targets: { lat: number; lon: number; names: string[] }[] = [
      ...histCities.map((c) => ({ lat: c.lat, lon: c.lon, names: [c.name] })),
      ...livingRecords.map((r) => ({ lat: r.lat, lon: r.lon, names: recordNamesOf(r) })),
    ];
    const tBuckets = new Map<string, typeof targets>();
    for (const t of targets) {
      const k = `${Math.floor(t.lat)}_${Math.floor(t.lon)}`;
      (tBuckets.get(k) ?? tBuckets.set(k, []).get(k)!).push(t);
    }
    const pruneAlts = (rows: City[]) => {
      for (const m of rows) {
        if (!m.alts?.length) continue;
        const rLat = Math.floor(m.lat);
        const rLon = Math.floor(m.lon);
        const nearNames: string[] = [];
        for (let dl = -1; dl <= 1; dl++) {
          for (let dn = -1; dn <= 1; dn++) {
            const lonWrap = ((((rLon + dn + 180) % 360) + 360) % 360) - 180;
            for (const t of tBuckets.get(`${rLat + dl}_${lonWrap}`) ?? []) {
              if (kmBetween(m.lat, m.lon, t.lat, t.lon) <= 6) nearNames.push(...t.names);
            }
          }
        }
        const kept = nearNames.length ? m.alts.filter((a) => nearNames.some((n) => cityNamesMatch(n, a))) : [];
        if (kept.length) m.alts = kept;
        else delete m.alts;
      }
    };
    for (const f of modernFields) {
      const p = (f.params ?? {}) as { format?: string; hold_yr?: number; gap_yr?: number };
      const primaryPath = datasetFile(f.data!.from, ds[f.data!.from], f.data!.file);
      if (!existsSync(primaryPath)) throw new Error(`missing ${primaryPath}; run \`npm run fetch\` first`);
      const primaryRows =
        p.format === 'ghsl-ucdb'
          ? await readGhslCities(primaryPath, f.data!.from, f.id)
          : nePlacesOf(await readFile(primaryPath, 'utf8'), f.data!.from, f.id);
      pruneAlts(primaryRows);
      cities.lists.push({
        source: f.data!.from,
        field: f.id,
        title: f.title,
        hold: p.hold_yr ?? 25,
        gap: p.gap_yr ?? 100,
        role: 'modern',
        bias: [0, 0.65],
      });
      cities.cities.push(...primaryRows);
      // Optional gazetteer fallback (e.g. Natural Earth 1:10m): keep ONLY rows that strictly match surviving smaller
      // historical towns / living records not already anchored by the primary urban-centre dataset.
      if (f.data?.places) {
        const placesPath = datasetFile(f.data.places, ds[f.data.places]);
        if (!existsSync(placesPath)) throw new Error(`missing ${placesPath}; run \`npm run fetch\` first`);
        const neRows = nePlacesOf(await readFile(placesPath, 'utf8'), f.data.places, f.id);
        const modSources = new Set(cities.lists.filter((l) => l.role === 'modern').map((l) => l.source));
        const grouped = groupCityRows(cities.cities, cities.lists);
        const unmatched: { lat: number; lon: number; names: string[] }[] = [];
        for (const g of grouped) {
          if (g.some((c) => modSources.has(c.source))) continue;
          const ref = [...g].sort((a, b) => (b.pops.at(-1)?.[0] ?? -1e9) - (a.pops.at(-1)?.[0] ?? -1e9))[0];
          unmatched.push({ lat: ref.lat, lon: ref.lon, names: [...new Set(g.map((c) => c.name))] });
        }
        for (const r of livingRecords) {
          const hit = rowsNear(cities, r.lat, r.lon, 25, recordNamesOf(r), r.span).some((c) => modSources.has(c.source));
          if (!hit) unmatched.push({ lat: r.lat, lon: r.lon, names: recordNamesOf(r) });
        }
        const neBuckets = new Map<string, number[]>();
        for (let i = 0; i < neRows.length; i++) {
          const k = `${Math.floor(neRows[i].lat)}_${Math.floor(neRows[i].lon)}`;
          (neBuckets.get(k) ?? neBuckets.set(k, []).get(k)!).push(i);
        }
        const keptIdx = new Set<number>();
        for (const u of unmatched) {
          let bestIdx = -1;
          let bestPri = 9;
          let bestD = Infinity;
          const rLat = Math.floor(u.lat);
          const rLon = Math.floor(u.lon);
          for (let dl = -1; dl <= 1; dl++) {
            for (let dn = -1; dn <= 1; dn++) {
              const lonWrap = ((((rLon + dn + 180) % 360) + 360) % 360) - 180;
              for (const i of neBuckets.get(`${rLat + dl}_${lonWrap}`) ?? []) {
                const hit = modernMatchesHistorical(neRows[i], u.names, u.lat, u.lon);
                if (hit && (hit.pri < bestPri || (hit.pri === bestPri && hit.d < bestD))) {
                  bestIdx = i;
                  bestPri = hit.pri;
                  bestD = hit.d;
                }
              }
            }
          }
          if (bestIdx >= 0) keptIdx.add(bestIdx);
        }
        const fallback = [...keptIdx].sort((a, b) => a - b).map((i) => neRows[i]);
        pruneAlts(fallback);
        cities.lists.push({
          source: f.data.places,
          field: f.id,
          title: ds[f.data.places]?.title ?? f.title,
          hold: p.hold_yr ?? 25,
          gap: p.gap_yr ?? 100,
          role: 'modern',
          bias: [0, 0.7],
        });
        cities.cities.push(...fallback);
      }
    }
  }
  files.set('people/cities.json', stableStringify(cities));
  const traditions = compileTraditions(traditionInputs(s, regionsId));
  // The animals people kept: the husbandry traditions, and each animal they name with its body and size.
  const husbandry = compileHusbandry(husbandryInputs(s, regionsId));
  const animals = keptAnimals(w, husbandry.flatMap((h) => h.animals), log);
  // The crops people grew: the agricultural traditions.
  const agriculture = compileAgriculture(agricultureInputs(s, regionsId));
  files.set('people/traditions.json', stableStringify({ format: 'lightworld-traditions@1', regions: regionsId, traditions, ...(husbandry.length ? { husbandry, kept: animals.kept, forms: animals.forms } : {}), ...(agriculture.length ? { agriculture } : {}) } satisfies TraditionsFile));
  const globe = decodeTile<AnthromeTileHeader>(toBuffer(files.get('people/anthromes/globe.lwt') as Uint8Array));
  const steps = globe.header.steps;
  const tiles = [...files.keys()].filter((k) => /^people\/anthromes\/-?\d+_-?\d+\.lwt$/.test(k)).map((k) => k.slice('people/anthromes/'.length, -4)).sort();
  const gen = w.generators.find((g) => g.id === SETTLEMENT);
  // The record and the code are one version: a browser draws with the code, and says the record's.
  if (gen && gen.version !== SETTLEMENT_VERSION) throw new Error(`${SETTLEMENT} is version ${gen.version} in its record and ${SETTLEMENT_VERSION} in its code`);
  const index: LandscapeIndex = {
    format: 'lightworld-landscape@1',
    title: af.title,
    source: af.data!.from,
    steps,
    classes,
    tile_deg: params.tile_deg,
    res: RES,
    tiles,
    globe: { file: 'people/anthromes/globe.lwt', res: params.globe_deg },
    assessments: 'people/assessments.json',
    traditions: 'people/traditions.json',
    cities: 'people/cities.json',
    fields: { anthromes: af.id, assessment: lf.id, lifeways: lifeways?.id ?? 'field:people/lifeways', population: w.fields.find((f) => f.data?.as === 'people')?.id ?? 'field:earth/population' },
    ...(gen ? { generator: { generator: gen.id, version: gen.version, params: gen.params as Record<string, unknown> } } : {}),
    // As far as the settlement generator weighs cells about a scene (peopleReach).
    reach_deg: peopleReach(gen?.params as Record<string, unknown> | undefined, EXTENT),
    reach_km: (gen?.params as { cities?: { reach_km?: number } } | undefined)?.cities?.reach_km ?? 30,
  };
  files.set('people/landscape.json', stableStringify(index));
  log(`landscape  ${tiles.length} tiles of 5′ cells over ${steps.length} steps, ${assessments.regions.length} regions assessed at ${assessments.slices.length} times, ${cities.cities.length} cities of the lists and ${cities.records.length} with records, ${traditions.length} building traditions, ${husbandry.length} husbandry traditions keeping ${animals.kept.length} kinds of animal, ${agriculture.length} agricultural traditions`);
  // Lookups at a place and time, from the tiles as the viewer reads them.
  const decoded = new Map<string, AnthromeTile>();
  const tileOf = (name: string): AnthromeTile | undefined => {
    if (decoded.has(name)) return decoded.get(name);
    const bytes = files.get(`people/anthromes/${name}.lwt`) as Uint8Array | undefined;
    if (!bytes) return undefined;
    const { header, arrays } = decodeTile<AnthromeTileHeader>(toBuffer(bytes));
    const t = anthromeTile(header, arrays[0] as Uint8Array, arrays[1] as Uint8Array, arrays[2] as Uint8Array);
    decoded.set(name, t);
    return t;
  };
  const at = (lat: number, lon: number, t: number) => {
    const step = nearestStep(steps, t);
    if (step < 0) return undefined;
    const tile = tileOf(tileKey(lat, lon, params.tile_deg).key);
    if (!tile) return { anthrome: 0, region: 0 };
    const cell = cellOf(tile, lat, lon);
    if (cell < 0) return { anthrome: 0, region: 0 };
    return { anthrome: classAtStep(tile, cell, step), region: tile.region[cell] };
  };
  const span: [number, number] = [steps[0], steps.at(-1)!];
  const assessed: [number, number] = [assessments.slices[0].year, assessments.slices.at(-1)!.year];
  return { files, index, assessments, traditions, husbandry, agriculture, cities, span, assessed, at, tile: tileOf, classes };
}

const toBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/** What resolve reads of the human landscape (core/resolve.ts): the lifeway's tier at a place and time, and a city near it. */
export function landscapeResolve(b: LandscapeBuilt): NonNullable<import('../../../../core/resolve.ts').ResolveWorld['landscape']> {
  const reach = b.index.reach_km;
  const lists = new Map(b.cities.lists.map((l) => [l.source, l]));
  const continuity = b.cities.lists.some((l) => l.role === 'modern' || !!l.cutoffs?.length);
  const thr = peopleModel(b.cities.model?.params).occupancy.threshold;
  // The cities by whole degree, so that a grid of places asks only the few near each.
  type BucketEntry =
    | { kind: 'legacy'; c: City }
    | { kind: 'group'; head: City; rows: City[]; pureModern: boolean; minStart: number; recordSpan?: [number, number]; pop?: ReturnType<typeof populationOf> };
  const buckets = new Map<string, BucketEntry[]>();
  const addBucket = (lat: number, lon: number, entry: BucketEntry) => {
    const k = `${Math.floor(lat)}_${Math.floor(lon)}`;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(entry);
  };
  if (!continuity) {
    for (const c of b.cities.cities) addBucket(c.lat, c.lon, { kind: 'legacy', c });
  } else {
    const claimedSpan = new Map<City, [number, number]>();
    for (const r of b.cities.records ?? []) {
      for (const c of rowsNear(b.cities, r.lat, r.lon, 12, recordNamesOf(r), r.span)) claimedSpan.set(c, r.span);
    }
    for (const g of groupCityRows(b.cities.cities, b.cities.lists)) {
      const head = g.find((c) => lists.get(c.source)?.role !== 'modern') ?? g[0];
      const pureModern = g.every((c) => lists.get(c.source)?.role === 'modern');
      const minStart = Math.min(...g.map((c) => (c.pops[0]?.[0] ?? 0) - (lists.get(c.source)?.hold ?? 50)));
      const recordSpan = g.map((c) => claimedSpan.get(c)).find((s): s is [number, number] => !!s);
      addBucket(head.lat, head.lon, { kind: 'group', head, rows: g, pureModern, minStart, ...(recordSpan ? { recordSpan } : {}) });
    }
  }
  // The settlements with records, the same way: one that stood then, and says how big it was, is a city a scene draws.
  const records = new Map<string, CityRecord[]>();
  for (const r of b.cities.records ?? []) {
    const k = `${Math.floor(r.lat)}_${Math.floor(r.lon)}`;
    (records.get(k) ?? records.set(k, []).get(k)!).push(r);
  }
  return {
    span: b.span,
    at: (lat, lon, t) => {
      const here = b.at(lat, lon, t);
      if (!here || !here.anthrome) return undefined;
      for (let dl = -1; dl <= 1; dl++) for (let dn = -1; dn <= 1; dn++) {
        const key = `${Math.floor(lat) + dl}_${Math.floor(lon) + dn}`;
        for (const e of buckets.get(key) ?? []) {
          if (e.kind === 'legacy') {
            const l = lists.get(e.c.source);
            if (kmBetween(lat, lon, e.c.lat, e.c.lon) <= reach && (cityPeople(e.c, t, l?.hold ?? 0, l?.gap ?? Infinity) ?? 0) > 0) return { tier: 'evidence', pattern: 'city', city: e.c.name };
          } else {
            if (t < e.minStart || kmBetween(lat, lon, e.head.lat, e.head.lon) > reach) continue;
            if (e.recordSpan && (t < e.recordSpan[0] || t > e.recordSpan[1])) continue;
            if (e.pureModern) {
              const l = lists.get(e.head.source);
              if ((cityPeople(e.head, t, l?.hold ?? 25, l?.gap ?? 100) ?? 0) > 0) return { tier: 'evidence', pattern: 'city', city: e.head.name };
            } else {
              e.pop ??= populationOf(b.cities, e.head.lat, e.head.lon, e.rows, undefined, { hold: 50 });
              if (aliveAt(e.pop, t, thr)) return { tier: 'evidence', pattern: 'city', city: e.head.name };
            }
          }
        }
        for (const r of records.get(key) ?? []) {
          if (t >= r.span[0] && t <= r.span[1] && figuresOf(r).some((x) => x.ground !== 'site' && x.ground !== 'region') && kmBetween(lat, lon, r.lat, r.lon) <= reach) return { tier: 'evidence', pattern: 'city', city: nameAt(r, t) };
        }
      }
      const a = here.region ? assessmentAt(b.assessments, here.region, t)?.a : undefined;
      const l = lifewayOf(b.classes, here.anthrome, 0, a);
      return { tier: l.tier, pattern: l.pattern };
    },
  };
}

// ——— Whose houses rest on a tradition ———

/**
 * The times the houses are counted at: every 2,000 years from the anthromes' first step, every 500 from 3000 BCE to
 * 1500 CE, and the survey's last times. The world after 1850 is not counted: its houses want records of another kind
 * (docs/plans/LIFEWAY-RENDERINGS.md).
 */
export const HOUSING_TIMES = [-9999, -7999, -5999, -3999, ...Array.from({ length: 6 }, (_, i) => -2999 + i * 500), 1, 500, 1000, 1500, 1750, 1850];

/**
 * The people of one region who lived one way at a time, and the tradition that draws their houses, if one is written.
 * Where several traditions share them (`prevalence`), there is a row for each one's part, and one for those left to the
 * generic house.
 */
export interface HousingRow {
  t: number;
  region: number;
  pattern: Exclude<Pattern, 'none'>;
  people: number;
  tradition?: string;
  /** the way of life the tradition was written for, where that is another, kin to theirs: its house stands in */
  kin?: LifewayWord;
}

/**
 * Where HYDE's people lived at each of some times, as a scene shares them (scenePeople, core/landscape.ts): each 1°
 * cell's people over its 5′ cells by their classes, each 5′ cell with the pattern of settlement the model gives it
 * (model:people/lifeways). Added up by region and pattern, each with the building tradition that houses that way of
 * life in the region then, if any. People HYDE puts in a 1° cell none of whose 5′ cells is peopled are left out, as a
 * scene draws none of them.
 */
export function housing(b: LandscapeBuilt, people: PeopleFile, times: number[]): HousingRow[] {
  const per = Math.round(1 / RES);
  const { nx } = gridSize(people.res);
  if (Math.abs(people.res - 1) > 1e-9) throw new Error('the people are shared over 5′ cells from cells of 1°');
  const now = new Float64Array(people.cell.length);
  const n = per * per;
  const ks = new Array<number>(n).fill(0);
  const land = new Array<number>(n).fill(0);
  const reg = new Array<number>(n).fill(0);
  const patterns = Object.keys(LIFEWAY_OF) as Exclude<Pattern, 'none'>[];
  // The part of a region's settlements a tradition is drawn for, where it says it was not all: the generator's.
  const parts = prevalenceOf(b.index.generator?.params);
  const rows: HousingRow[] = [];
  for (const t of times) {
    const step = nearestStep(b.index.steps, t);
    if (step < 0 || !peopleAt(people, t, now)) continue;
    const sum = new Map<number, number>();
    const assessed = new Map<number, Assessment | undefined>();
    for (let i = 0; i < now.length; i++) {
      const p = now[i];
      if (!(p > 0)) continue;
      const place = people.cell[i];
      const north = 90 - Math.floor(place / nx);
      const west = -180 + (place % nx);
      const tile = b.tile(tileKey(north - 0.5, west + 0.5, b.index.tile_deg).key);
      if (!tile) continue;
      for (let r = 0; r < per; r++) {
        const lat = north - (r + 0.5) * RES;
        const area = Math.cos((lat * Math.PI) / 180) * (RES * 111.195) ** 2;
        for (let c = 0; c < per; c++) {
          const cell = cellOf(tile, lat, west + (c + 0.5) * RES);
          const k = cell < 0 ? 0 : classAtStep(tile, cell, step);
          ks[r * per + c] = k;
          land[r * per + c] = k ? area : 0;
          reg[r * per + c] = cell < 0 ? 0 : tile.region[cell];
        }
      }
      const d = shareDensity(b.classes, ks, land, p);
      for (let q = 0; q < n; q++) {
        if (!(d[q] > 0)) continue;
        const g = reg[q];
        if (!assessed.has(g)) assessed.set(g, g ? assessmentAt(b.assessments, g, t)?.a : undefined);
        const l = lifewayOf(b.classes, ks[q], d[q], assessed.get(g));
        if (l.pattern === 'none') continue;
        const key = g * 16 + patterns.indexOf(l.pattern);
        sum.set(key, (sum.get(key) ?? 0) + d[q] * land[q]);
      }
    }
    for (const [key, count] of [...sum].sort((x, y) => x[0] - y[0])) {
      const region = Math.floor(key / 16);
      const pattern = patterns[key % 16];
      const found = traditionsFor(b.traditions, region, t, LIFEWAY_OF[pattern], parts);
      const all = Math.round(count);
      const whole = found.reduce((s, f) => s + f.share, 0) > 1 - 1e-9;
      let left = all;
      found.forEach((f, i) => {
        // The last of those that between them house everyone takes whoever the rounding left.
        const n = whole && i === found.length - 1 ? left : Math.min(left, Math.round(count * f.share));
        if (n <= 0) return;
        rows.push({ t, region, pattern, people: n, tradition: f.tradition.id, ...(f.kin ? { kin: f.kin } : {}) });
        left -= n;
      });
      if (left > 0 || !found.length) rows.push({ t, region, pattern, people: left });
    }
  }
  return rows;
}

/**
 * HYDE's people within a record's region at each of HYDE's steps while the record stood, as a scene shares a 1° cell's
 * people over its 5′ cells by their classes (core/landscape.ts, regionsInto): the prior of the region's people beside
 * the settlement's own (core/citypop.ts). The region is a disc of its ground about the record's point.
 */
export function regionHyde(b: LandscapeBuilt, people: PeopleFile, r: CityRecord, km: number): [number, number][] {
  const per = Math.round(1 / RES);
  if (Math.abs(people.res - 1) > 1e-9) throw new Error('the people are shared over 5′ cells from cells of 1°');
  const now = new Float64Array(people.cell.length);
  const out: [number, number][] = [];
  const dLat = km / 111.195;
  const dLon = dLat / Math.max(0.05, Math.cos((r.lat * Math.PI) / 180));
  const ks = new Array<number>(per * per).fill(0);
  const land = new Array<number>(per * per).fill(0);
  for (const t of people.steps) {
    if (t < r.span[0] - 200 || t > r.span[1] + 200) continue;
    const step = nearestStep(b.index.steps, t);
    if (step < 0 || !peopleAt(people, t, now)) continue;
    let sum = 0;
    for (let north = Math.ceil(r.lat + dLat); north > r.lat - dLat - 1; north--) {
      for (let west = Math.floor(r.lon - dLon); west < r.lon + dLon; west++) {
        const at = cellAt(people, west + 0.5, north - 0.5);
        const p = at.index >= 0 ? now[at.index] : 0;
        if (!(p > 0)) continue;
        const tile = b.tile(tileKey(north - 0.5, west + 0.5, b.index.tile_deg).key);
        if (!tile) continue;
        for (let i = 0; i < per; i++) {
          const lat = north - (i + 0.5) * RES;
          const area = Math.cos((lat * Math.PI) / 180) * (RES * 111.195) ** 2;
          for (let j = 0; j < per; j++) {
            const cell = cellOf(tile, lat, west + (j + 0.5) * RES);
            const k = cell < 0 ? 0 : classAtStep(tile, cell, step);
            ks[i * per + j] = k;
            land[i * per + j] = k ? area : 0;
          }
        }
        const d = shareDensity(b.classes, ks, land, p);
        for (let i = 0; i < per; i++)
          for (let j = 0; j < per; j++) {
            const q = i * per + j;
            if (!(d[q] > 0) || !land[q]) continue;
            if (kmBetween(r.lat, r.lon, north - (i + 0.5) * RES, west + (j + 0.5) * RES) <= km) sum += d[q] * land[q];
          }
      }
    }
    out.push([t, Math.round(sum)]);
  }
  return out;
}

/**
 * The same, counted for the coverage (coverage.json, landscape.housing): at each time, the people by pattern and how many
 * a tradition houses, the regions with people and those with any tradition that houses some, and the lists' cities.
 */
export function housingCounts(b: LandscapeBuilt, rows: HousingRow[]): HousingCount[] {
  const lists = new Map(b.cities.lists.map((l) => [l.source, l]));
  const continuity = b.cities.lists.some((l) => l.role === 'modern' || !!l.cutoffs?.length);
  const thr = peopleModel(b.cities.model?.params).occupancy.threshold;
  const groups = continuity
    ? groupCityRows(b.cities.cities, b.cities.lists).map((g) => {
        const head = g.find((c) => lists.get(c.source)?.role !== 'modern') ?? g[0];
        const pureModern = g.every((c) => lists.get(c.source)?.role === 'modern');
        const minStart = Math.min(...g.map((c) => (c.pops[0]?.[0] ?? 0) - (lists.get(c.source)?.hold ?? 50)));
        return { head, rows: g, pureModern, minStart, pop: pureModern ? undefined : populationOf(b.cities, head.lat, head.lon, g, undefined, { hold: 50 }) };
      })
    : undefined;
  return [...new Set(rows.map((r) => r.t))].map((t) => {
    const mine = rows.filter((r) => r.t === t);
    const by: HousingCount['by'] = {};
    const regions = new Map<number, boolean>();
    let people = 0;
    let housed = 0;
    let standIn = 0;
    for (const r of mine) {
      const x = (by[r.pattern] ??= [0, 0]);
      x[0] += r.people;
      people += r.people;
      if (r.tradition) {
        x[1] += r.people;
        housed += r.people;
        if (r.kin) standIn += r.people;
      }
      if (r.region) regions.set(r.region, (regions.get(r.region) ?? false) || !!r.tradition);
    }
    const cities: [number, number, number] = [0, 0, 0];
    if (groups) {
      for (const g of groups) {
        if (t < g.minStart) continue;
        let n = 0;
        if (g.pureModern) {
          const l = lists.get(g.head.source);
          n = cityPeople(g.head, t, l?.hold ?? 25, l?.gap ?? 100) ?? 0;
        } else if (g.pop && aliveAt(g.pop, t, thr)) {
          n = Math.round(centralAt(g.pop, t));
        }
        if (!(n > 0)) continue;
        cities[0]++;
        cities[1] += n;
        if (traditionAt(b.traditions, b.at(g.head.lat, g.head.lon, t)?.region || undefined, t, 'townspeople')) cities[2] += n;
      }
    } else {
      // Legacy builds/tests without continuity metadata: two lists' figures for one place are one city, with the larger.
      const standing = new Map<string, { people: number; housed: boolean }>();
      for (const c of b.cities.cities) {
        const l = lists.get(c.source);
        const n = cityPeople(c, t, l?.hold ?? 0, l?.gap ?? Infinity);
        if (!n || n <= 0) continue;
        const key = `${Math.round(c.lat * 20)}_${Math.round(c.lon * 20)}`;
        if ((standing.get(key)?.people ?? 0) >= n) continue;
        standing.set(key, { people: n, housed: !!traditionAt(b.traditions, b.at(c.lat, c.lon, t)?.region || undefined, t, 'townspeople') });
      }
      cities[0] = standing.size;
      for (const c of standing.values()) {
        cities[1] += c.people;
        if (c.housed) cities[2] += c.people;
      }
    }
    return { t, people, housed, ...(standIn ? { standIn } : {}), by, regions: [regions.size, [...regions.values()].filter(Boolean).length], cities };
  });
}

/** How much of the land, at each of some times, HYDE and the archaeologists disagree on: the share of cells of land whose lifeway says so. */
export function disagreement(b: LandscapeBuilt, times: number[], step = 1): { t: number; land: number; disagree: number; evidence: number }[] {
  return times.map((t) => {
    let land = 0;
    let disagree = 0;
    let evidence = 0;
    for (let lat = -60 + step / 2; lat < 84; lat += step) {
      for (let lon = -180 + step / 2; lon < 180; lon += step) {
        const here = b.at(lat, lon, t);
        if (!here || !here.anthrome) continue;
        const a = here.region ? assessmentAt(b.assessments, here.region, t)?.a : undefined;
        const l = lifewayOf(b.classes, here.anthrome, 0, a);
        // The cosine weights a cell by its area.
        const w = Math.cos((lat * Math.PI) / 180);
        land += w;
        if (l.disagrees) disagree += w;
        if (l.tier === 'evidence') evidence += w;
      }
    }
    return { t, land: Math.round(land * 100) / 100, disagree: land ? Math.round((disagree / land) * 1e4) / 1e4 : 0, evidence: land ? Math.round((evidence / land) * 1e4) / 1e4 : 0 };
  });
}


/**
 * How HYDE's anthromes and the archaeologists agree on farming, region by region, at each of the survey's times: of the
 * regions where the archaeologists found no farming, how many the anthromes farm less than a hundredth of; and of those
 * where they call it widespread (over a fifth of the land), how many the anthromes farm at all, and more than a twentieth.
 * A farmed cell is one of a class of croplands, villages or dense settlements.
 */
export function farmingAgreement(b: LandscapeBuilt): { slice: string; year: number; none: [number, number]; widespread: [number, number, number] }[] {
  const farmed = new Set(b.classes.flatMap((c, i) => (c.level === 'Villages' || c.level === 'Croplands' || c.level === 'Dense settlements' ? [i + 1] : [])));
  const tiles: AnthromeTile[] = [];
  for (const [k, v] of b.files) {
    if (!/^people\/anthromes\/-?\d+_-?\d+\.lwt$/.test(k)) continue;
    const { header, arrays } = decodeTile<AnthromeTileHeader>(toBuffer(v as Uint8Array));
    tiles.push(anthromeTile(header, arrays[0] as Uint8Array, arrays[1] as Uint8Array, arrays[2] as Uint8Array));
  }
  return b.assessments.slices.map((sl, si) => {
    const step = nearestStep(b.index.steps, sl.year);
    const land = new Map<number, number>();
    const farm = new Map<number, number>();
    for (const t of tiles) {
      for (let c = 0; c < t.counts.length; c++) {
        const g = t.region[c];
        if (!t.counts[c] || !g) continue;
        const k = classAtStep(t, c, step);
        if (!k) continue;
        land.set(g, (land.get(g) ?? 0) + 1);
        if (farmed.has(k)) farm.set(g, (farm.get(g) ?? 0) + 1);
      }
    }
    const none: [number, number] = [0, 0];
    const wide: [number, number, number] = [0, 0, 0];
    for (const r of b.assessments.regions) {
      const a = b.assessments.rows[String(r.id)]?.[si];
      if (!a || !land.get(r.id)) continue;
      const level = Math.max(a.use[1][0], a.use[2][0]);
      const share = (farm.get(r.id) ?? 0) / land.get(r.id)!;
      if (level === 0) {
        none[1]++;
        if (share < 0.01) none[0]++;
      } else if (level === 3) {
        wide[2]++;
        if (share > 0) wide[0]++;
        if (share > 0.05) wide[1]++;
      }
    }
    return { slice: sl.label, year: sl.year, none, widespread: wide };
  });
}
