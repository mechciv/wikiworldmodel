// What most wants a building tradition (docs/DWELLINGS.md): the people of each ArchaeoGLOBE region who lived each way of
// life at each of a run of times, as HYDE and the model of how people lived place them, and whether any tradition the
// world records for that way of life draws their houses. The top of the list is where most houses are drawn as generic.
import { claimGroups, solveScenario } from './chronology.ts';
import { buildLandscape, housing, HOUSING_TIMES, type HousingRow } from './build/landscape.ts';
import { peopleLayer } from './build/layers.ts';
import { lifewayText, type LifewayWord, type Tradition } from '../../../core/dwelling.ts';
import { LIFEWAY_OF } from '../../../core/landscape.ts';
import type { PeopleFile } from '../../../core/layers.ts';
import { formatTime } from '../../../core/time.ts';
import { loadWorld } from './world.ts';

export interface Wanted {
  region: number;
  label: string;
  t: number;
  /** whose houses: the way of life, as a tradition's `lifeway` claim names it */
  lifeway: LifewayWord;
  people: number;
  /** the tradition that draws their houses then, if any; and the way of life it was written for, where its house stands in */
  tradition?: string;
  kin?: LifewayWord;
}

/** The times the list is counted at: the build's (coverage.json, landscape.housing). */
export const WANTED_TIMES = HOUSING_TIMES;

/** The patterns of settlement of a region and time, added up by the way of life whose house they are drawn in. */
export function wantedRows(rows: HousingRow[], labels: Map<number, string>): Wanted[] {
  const out = new Map<string, Wanted>();
  for (const r of rows) {
    const lifeway = LIFEWAY_OF[r.pattern];
    // People of one way of life whom several traditions share are a row for each, and one for those none houses.
    const key = `${r.t}|${r.region}|${lifeway}|${r.tradition ?? ''}`;
    const have = out.get(key);
    if (have) have.people += r.people;
    else out.set(key, { region: r.region, label: labels.get(r.region) ?? (r.region ? String(r.region) : 'no region'), t: r.t, lifeway, people: r.people, ...(r.tradition ? { tradition: r.tradition } : {}), ...(r.kin ? { kin: r.kin } : {}) });
  }
  return [...out.values()];
}

/** Every region at every time and way of life, with its people and its tradition. */
export async function dwellingsWanted(times: number[]): Promise<{ rows: Wanted[]; traditions: Tradition[]; regions: { id: number; label: string }[] }> {
  const world = await loadWorld();
  const sol = solveScenario(world);
  if (!sol.ok) throw new Error('the world has no solution: run `npm run validate`');
  const solved = { world, sol, centres: solveScenario(world, {}, true), variants: [], groups: claimGroups(world), model: undefined as never };
  const b = await buildLandscape(solved as never, () => {});
  if (!b) throw new Error('the world has no anthromes field');
  const pl = await peopleLayer(world);
  if (!pl) throw new Error('the world has no grid of people');
  const pf = { ...pl.header, cell: pl.arrays[0], land: pl.arrays[1], people: pl.arrays[2] } as unknown as PeopleFile;
  const labels = new Map(b.assessments.regions.map((r) => [r.id, r.label]));
  return { rows: wantedRows(housing(b, pf, times), labels), traditions: b.traditions, regions: b.assessments.regions };
}

const fmt = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)} million` : x.toLocaleString('en-US'));

/** The list as printed: the most people drawn with generic houses first; or one region's times; or one way of life's. */
export function wantedText(rows: Wanted[], n: number, opts: { region?: number; lifeway?: LifewayWord } = {}): string {
  if (opts.region !== undefined) {
    const mine = rows.filter((r) => r.region === opts.region && (!opts.lifeway || r.lifeway === opts.lifeway)).sort((a, b) => a.t - b.t || b.people - a.people);
    if (!mine.length) return `No region ${opts.region}.`;
    return [`${mine[0].label} (region ${opts.region}):`, ...mine.map((r) => `  ${formatTime(r.t).padEnd(12)} ${lifewayText([r.lifeway]).padEnd(22)} ${fmt(r.people).padStart(14)} people  ${r.tradition ? `${r.tradition}${r.kin ? ` (the house of its ${lifewayText([r.kin])}, standing in)` : ''}` : '— generic houses'}`)].join('\n');
  }
  const open = rows.filter((r) => !r.tradition && r.people > 0 && (!opts.lifeway || r.lifeway === opts.lifeway)).sort((a, b) => b.people - a.people).slice(0, n);
  const whose = opts.lifeway ? `${lifewayText([opts.lifeway])} ` : 'people ';
  return [
    `The regions, times and ways of life with the most ${whose}drawn in generic houses (ArchaeoGLOBE region, time, way of life, HYDE's people):`,
    ...open.map((r) => `  ${String(r.region).padStart(3)} ${r.label.padEnd(44)} ${formatTime(r.t).padEnd(12)} ${lifewayText([r.lifeway]).padEnd(22)} ${fmt(r.people).padStart(14)}`),
  ].join('\n');
}

/** How many people each way of life had at each time, and how many of them a tradition houses: the list's totals. */
export function wantedTotals(rows: Wanted[]): string {
  const times = [...new Set(rows.map((r) => r.t))].sort((a, b) => a - b);
  const ways = [...new Set(Object.values(LIFEWAY_OF))];
  const pct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(a / b < 0.1 ? 1 : 0)}%` : '–');
  const lines = [
    `People in a house of a tradition written for their way of life, region and time, of HYDE's people:`,
    `  ${'time'.padEnd(12)} ${'people'.padStart(14)} ${'housed'.padStart(7)}   ${ways.map((w) => lifewayText([w]).padStart(22)).join(' ')}`,
  ];
  for (const t of times) {
    const mine = rows.filter((r) => r.t === t);
    const sum = (f: (r: Wanted) => boolean) => mine.filter(f).reduce((s, r) => s + r.people, 0);
    const all = sum(() => true);
    const each = ways.map((w) => `${pct(sum((r) => r.lifeway === w), all)} (${pct(sum((r) => r.lifeway === w && !!r.tradition), sum((r) => r.lifeway === w))})`.padStart(22));
    lines.push(`  ${formatTime(t).padEnd(12)} ${fmt(all).padStart(14)} ${pct(sum((r) => !!r.tradition), all).padStart(7)}   ${each.join(' ')}`);
  }
  lines.push('  Each way of life: its share of the people, and in brackets the share of them a tradition houses.');
  return lines.join('\n');
}
