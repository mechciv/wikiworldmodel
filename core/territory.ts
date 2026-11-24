// Polities' territory (territory.json): for each record with a territory claim, the rows of a
// borders dataset that the claim names, each a set of polygons holding for the years it gives.
// Competing claims are chosen as the chronology chooses (chosenClaim), and a row shows only
// while its polity exists, in the scenario shown. Which rows make one polity is the claim's
// business; the dataset's own names are kept, so the viewer can say which row it draws.
import { chosenClaim, spanOf, type StateClaim } from './planet.ts';
import type { Scenario } from './scenario.ts';
import type { FeatureTime } from './tileset.ts';

/** Coordinates are stored in hundredths of a degree. */
export const TERRITORY_SCALE = 100;

export interface TerritoryRow {
  /** the dataset's name for the row */
  name: string;
  /** [from, to) in astronomical years */
  from: number;
  to: number;
  /** km², as the dataset gives it */
  area: number;
  /** where a label goes, [lon, lat] in degrees */
  at: [number, number];
  /** rings, outer and inner alike, each [lon0, lat0, lon1, lat1, …]; filled even-odd */
  rings: number[][];
}

export interface TerritoryClaim extends StateClaim {
  /** the dataset the rows come from */
  source: string;
  rows: TerritoryRow[];
}

export interface Territory {
  /** the entity, or entity@phase */
  subject: string;
  label: string;
  time: FeatureTime;
  /** its interval under other scenarios (keyed by scenario key), where it differs */
  variants?: Record<string, FeatureTime>;
  /** several compete */
  claims: TerritoryClaim[];
  /** the subject's phases, for naming it at a time: "Rome · Republic" */
  phases?: { label: string; time: FeatureTime; variants?: Record<string, FeatureTime> }[];
}

export interface TerritoryFile {
  territories: Territory[];
}

export interface TerritoryAt {
  territory: Territory;
  claim: TerritoryClaim;
  /** the rows that hold: usually one, two where the dataset's polities overlap in time */
  rows: TerritoryRow[];
}

/** What each polity held at time t, in a scenario: the rows of its chosen claim that hold then. */
export function territoriesAt(file: TerritoryFile, t: number, s: Scenario): TerritoryAt[] {
  const out: TerritoryAt[] = [];
  for (const territory of file.territories) {
    const [a, b] = spanOf(territory, s);
    if (t < a || t >= b) continue;
    const claim = chosenClaim(territory.claims, s) as TerritoryClaim | undefined;
    const rows = claim?.rows.filter((r) => r.from <= t && t < r.to) ?? [];
    if (claim && rows.length) out.push({ territory, claim, rows });
  }
  return out;
}

/**
 * Of the territories that hold at a time, which are drawn in a colour of their own, and which are left to be
 * drawn as states among the states: at most `max` in colour, the record that is open first, then the largest.
 * None is dropped: the more records have land of their own, the more are drawn among the states.
 */
export function drawnFirst(all: TerritoryAt[], selected: string | null, max: number): { drawn: TerritoryAt[]; rest: TerritoryAt[] } {
  const area = (a: TerritoryAt) => a.rows.reduce((n, r) => n + r.area, 0);
  const order = [...all].sort((a, b) => Number(b.territory.subject === selected) - Number(a.territory.subject === selected) || area(b) - area(a) || (a.territory.subject < b.territory.subject ? -1 : a.territory.subject > b.territory.subject ? 1 : 0));
  // Kept in the order they came in, so a polity's colour does not depend on the others'.
  const first = new Set(order.slice(0, max));
  return { drawn: all.filter((a) => first.has(a)), rest: all.filter((a) => !first.has(a)) };
}

/** Whether a point lies inside a row's polygons (even-odd, as they are filled), handling antimeridian crossings. */
export function contains(row: TerritoryRow, lon: number, lat: number): boolean {
  const nlon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const x0 = nlon * TERRITORY_SCALE;
  const y = lat * TERRITORY_SCALE;
  const wrap = 360 * TERRITORY_SCALE;
  const half = 180 * TERRITORY_SCALE;
  let inside = false;
  for (const r of row.rings) {
    if (r.length < 6) continue;
    let crosses = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      if (Math.abs(r[i] - r[j]) > half) {
        crosses = true;
        break;
      }
    }
    if (!crosses) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const yi = r[i + 1];
        const yj = r[j + 1];
        if (yi > y !== yj > y && x0 < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) inside = !inside;
      }
      continue;
    }
    const n = r.length >> 1;
    const ux = new Float64Array(n);
    ux[0] = r[0];
    let minX = ux[0];
    let maxX = ux[0];
    for (let k = 1; k < n; k++) {
      let d = r[k * 2] - ux[k - 1];
      d -= wrap * Math.round(d / wrap);
      ux[k] = ux[k - 1] + d;
      if (ux[k] < minX) minX = ux[k];
      if (ux[k] > maxX) maxX = ux[k];
    }
    // Polar ring wrapping 360° around a pole does not close in unwrapped longitude: use standard planar check.
    if (Math.abs(ux[n - 1] - ux[0]) > half) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const yi = r[i + 1];
        const yj = r[j + 1];
        if (yi > y !== yj > y && x0 < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) inside = !inside;
      }
      continue;
    }
    for (const shift of [-wrap, 0, wrap]) {
      const x = x0 + shift;
      if (x < minX || x > maxX) continue;
      for (let k = 0, p = n - 1; k < n; p = k++) {
        const yi = r[k * 2 + 1];
        const yj = r[p * 2 + 1];
        if (yi > y !== yj > y && x < ((ux[p] - ux[k]) * (y - yi)) / (yj - yi) + ux[k]) inside = !inside;
      }
    }
  }
  return inside;
}
