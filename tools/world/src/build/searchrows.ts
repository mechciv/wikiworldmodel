// What search finds of the rows of datasets (docs/STRUCTURE.md section 3.1): the states Cliopatria
// names, gathered under each name while they run on in time, and the names and places a record takes
// from the rows that are rows of it. A row tied to a record by an overlay is found as the record.
import type { PolitiesFile, PolityRow } from '../../../../core/layers.ts';
import { splitRef } from '../../../../core/refs.ts';
import type { SearchEntry, SearchFile } from '../../../../core/records.ts';
import type { TerritoryFile } from '../../../../core/territory.ts';
import type { FeatureName, FeatureTime } from '../../../../core/tileset.ts';

type Place = NonNullable<SearchEntry['places']>[number];

const at = (t: number) => ({ best: t, lo: t, hi: t, derived: false });
const span = (from: number, to: number): FeatureTime => ({ start: at(from), end: at(to), instant: false });
const placeOf = (r: PolityRow): Place => [r.from, r.to, r.at[0], r.at[1], r.area];

/**
 * A dataset's rows of one name, split where the name is out of use for longer than `gap` years: a
 * name taken up again centuries later is another state.
 */
export function runsOf(rows: PolityRow[], gap: number): PolityRow[][] {
  const runs: PolityRow[][] = [];
  let end = -Infinity;
  for (const r of [...rows].sort((a, b) => a.from - b.from || a.to - b.to)) {
    if (!runs.length || r.from - end > gap) runs.push([]);
    runs.at(-1)!.push(r);
    end = Math.max(end, r.to);
  }
  return runs;
}

/** Names as they were in use, one per text: from the first row of it to the last. */
function namesFrom(rows: { name: string; from: number; to: number }[]): FeatureName[] {
  const by = new Map<string, [number, number]>();
  for (const r of rows) {
    const v = by.get(r.name);
    by.set(r.name, v ? [Math.min(v[0], r.from), Math.max(v[1], r.to)] : [r.from, r.to]);
  }
  return [...by].sort((a, b) => a[1][0] - b[1][0]).map(([text, valid]) => ({ text, valid }));
}

/** A record's names with those of its rows that it does not already go by, ignoring case. */
function withNames(e: SearchEntry, more: FeatureName[]): FeatureName[] | undefined {
  const all = [...(e.names ?? [])];
  const has = (t: string) => t.toLowerCase() === e.label.toLowerCase() || all.some((n) => n.text.toLowerCase() === t.toLowerCase());
  for (const n of more) if (!has(n.text)) all.push(n);
  return all.length ? all : undefined;
}

/**
 * Search's rows of the states, and the records' names and places from the rows they adopt: by an
 * overlay's same_as (a row of the record), or by a record's territory, drawn from rows of its own.
 * Names in brackets are relations between states, not states, and are left out.
 */
export function searchRows(found: SearchFile, polities: PolitiesFile | undefined, kind: string, gap: number, adopted: ReadonlyMap<string, string>, territory: TerritoryFile): SearchFile {
  const byId = new Map(found.entities.map((e) => [e.id, e]));
  const adopt = new Map<string, PolityRow[]>();
  const loose = new Map<string, PolityRow[]>();
  for (const r of polities?.rows ?? []) {
    const owner = r.row ? adopted.get(r.row) : undefined;
    if (owner && byId.has(owner)) adopt.set(owner, [...(adopt.get(owner) ?? []), r]);
    // A row a record draws as its territory is that record's: found by the record, named by its territory.
    else if (r.claimedBy?.some((c) => byId.has(splitRef(c).record))) continue;
    else if (!r.name.startsWith('(')) loose.set(r.name, [...(loose.get(r.name) ?? []), r]);
  }
  const entities = found.entities.map((e) => {
    const own = adopt.get(e.id) ?? [];
    const drawn = territory.territories.filter((t) => splitRef(t.subject).record === e.id).flatMap((t) => t.claims.flatMap((c) => c.rows));
    if (!own.length && !drawn.length) return e;
    const names = withNames(e, namesFrom([...own, ...drawn]));
    return { ...e, ...(names ? { names } : {}), ...(own.length ? { places: own.sort((a, b) => a.from - b.from).map(placeOf) } : {}) };
  });
  const rows: SearchEntry[] = [];
  for (const [name, all] of [...loose].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    for (const run of runsOf(all, gap)) {
      if (!run[0].row) continue;
      rows.push({
        id: run[0].row,
        label: name,
        kind,
        time: span(run[0].from, Math.max(...run.map((r) => r.to))),
        located: false,
        places: run.map(placeOf),
        dataset: polities!.source,
      });
    }
  }
  return { entities, ...(rows.length ? { rows } : {}) };
}
