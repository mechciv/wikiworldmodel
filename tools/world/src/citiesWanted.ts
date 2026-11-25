// What most wants a city's records (docs/plans/CITIES.md, The evidence a city can have, and step 7): every city of the
// lists and the records, with the tier of what is known of it and how many people lived in it, summed over the years it
// stood up to 1850, as the model of a settlement's people reads them (core/citypop.ts). The top of the list is where most
// lives were lived in a city drawn from little more than its figure: a plan's skeleton there (its outline at dated
// times, its walls and gates, its grid's direction, its main streets) does the most.
import { peopleAt } from '../../../core/growth.ts';
import { kmBetween, populationOf, type CitiesFile, type City, type CityRecord } from '../../../core/landscape.ts';
import { formatTime } from '../../../core/time.ts';

/** The tiers of what is known of a city (docs/plans/CITIES.md). */
export const TIERS = ['a point and its people', 'a record', "a plan's skeleton", 'its fabric mapped'] as const;

export interface CityWanted {
  name: string;
  lat: number;
  lon: number;
  /** its record, where it has one */
  record?: string;
  /** 0 a point and its people, 1 a record, 2 a plan's skeleton, 3 its fabric mapped */
  tier: 0 | 1 | 2 | 3;
  /** people times years, up to the year the list is counted to */
  peopleYears: number;
  /** when it stood, and its most people */
  span: [number, number];
  most: number;
  /** what would raise it a tier */
  wants: string;
}

/** The last year counted: housing after it wants evidence of another kind (docs/plans/CITIES.md, What it will not do). */
export const UNTIL = 1850;

/** People times years over a span, by the model's central reading, in steps of a decade. */
function peopleYears(members: { t: number[]; people: number[] }[], span: [number, number]): number {
  const m = members[0];
  if (!m) return 0;
  const a = span[0];
  const b = Math.min(span[1], UNTIL);
  let sum = 0;
  for (let t = a; t < b; t += 10) sum += peopleAt(m, Math.min(b, t + 5)) * Math.min(10, b - t);
  return sum;
}

/**
 * Each city of the file once: a list's rows within `merge` km of one another, and a record within `recordKm` of them,
 * are one city. `mapped` names the settlements whose fabric a map of the world gives (a dataset's `import.site`).
 */
export function citiesWanted(f: CitiesFile, mapped: Set<string>, recordKm = 12, merge = 5): CityWanted[] {
  const groups: { rows: City[]; record?: CityRecord }[] = [];
  for (const c of f.cities) {
    const g = groups.find((x) => x.rows.some((r) => kmBetween(r.lat, r.lon, c.lat, c.lon) <= merge));
    if (g) g.rows.push(c);
    else groups.push({ rows: [c] });
  }
  for (const r of f.records ?? []) {
    let best: (typeof groups)[number] | undefined;
    let bestKm = recordKm;
    for (const g of groups) {
      if (g.record) continue;
      const k = Math.min(...g.rows.map((c) => kmBetween(r.lat, r.lon, c.lat, c.lon)));
      if (k <= bestKm) {
        best = g;
        bestKm = k;
      }
    }
    if (best) best.record = r;
    else groups.push({ rows: [], record: r });
  }
  const out: CityWanted[] = [];
  for (const g of groups) {
    const r = g.record;
    if (!g.rows.length && !r) continue;
    const pop = populationOf(f, r?.lat ?? g.rows[0].lat, r?.lon ?? g.rows[0].lon, g.rows, r, { hold: 50 });
    if (!pop.members.length) continue;
    const span = pop.span;
    if (span[0] > UNTIL) continue;
    const most = Math.max(...pop.members[0].people);
    const skeleton = !!r && (r.town?.orientation !== undefined || (r.town?.wall !== undefined && r.town.wall !== 'none'));
    const tier: CityWanted['tier'] = r && mapped.has(r.id) ? 3 : skeleton ? 2 : r ? 1 : 0;
    const head = g.rows[0];
    const wants =
      tier === 0
        ? 'a record: its names, its founding and its end, its areas'
        : tier === 1
          ? "a plan's skeleton: its outline at dated times, its walls and gates, its grid's direction, its main streets"
          : tier === 2
            ? 'its fabric mapped in OpenHistoricalMap, with dates'
            : 'nothing more of its plan';
    out.push({ name: r?.name ?? head.name, lat: r?.lat ?? head.lat, lon: r?.lon ?? head.lon, ...(r ? { record: r.id } : {}), tier, peopleYears: peopleYears(pop.members, span), span, most, wants });
  }
  return out.sort((a, b) => b.peopleYears - a.peopleYears || (a.name < b.name ? -1 : 1));
}

/** The list as text: the cities below a tier, the most people-years first; and each tier's share of them all. */
export function citiesWantedText(rows: CityWanted[], n: number, below = 2): string {
  const total = rows.reduce((s, r) => s + r.peopleYears, 0) || 1;
  const share = TIERS.map((label, k) => {
    const py = rows.filter((r) => r.tier === k).reduce((s, r) => s + r.peopleYears, 0);
    return `  tier ${k}, ${label}: ${rows.filter((r) => r.tier === k).length} cities, ${((py / total) * 100).toFixed(1)}% of the people-years`;
  });
  const wanted = rows.filter((r) => r.tier < below).slice(0, n);
  const lines = wanted.map((r, i) => `${String(i + 1).padStart(3)}. ${r.name}${r.record ? ` (${r.record})` : ''}, ${formatTime(r.span[0])} to ${r.span[1] >= UNTIL ? 'past 1850' : formatTime(r.span[1])}, at most ${Math.round(r.most).toLocaleString('en-US')} people: tier ${r.tier}; wants ${r.wants}`);
  return [`The cities of the lists and the records, to ${UNTIL}, by tier:`, ...share, '', `Below tier ${below}, the most people-years first:`, ...lines].join('\n');
}
