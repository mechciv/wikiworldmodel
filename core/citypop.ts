// A settlement's people through time (model:people/city-population; docs/plans/CITIES.md, The models): every figure
// the lists and the settlement's record give, as members of one band. Member 0 is the central reading: the record's own
// figures where it has them, and the lists' elsewhere. The other members are the same reading higher and lower by the
// doubt the lists' figures carry, and each other source's own reading where it has one. Between two figures the people
// change by a constant rate, as growth.ts reads them; before the first and after the last they come from and go to a
// settlement's founding size over the years to its start and end, and they are held where it has none.
//
// The settlement stands from its record's start to its end, where it has a record that says; else from a list's first
// figure, less the years the list holds a figure for, to its last, plus those years. Nothing here is a claim: the
// figures are the sources', and the rest is the model's, said so in its record.

import type { PeopleSeries } from './growth.ts';
import { PRESENT_YEAR } from './time.ts';

/** One source's figures for a settlement. */
export interface PopulationSource {
  /** the dataset or the record they are from */
  source: string;
  /** [year, people], in order */
  pops: [number, number][];
  /** how many years either side of a figure the source holds it for */
  hold: number;
  /** a record's own figures: they are preferred over a list's */
  record?: boolean;
}

export interface PopulationParams {
  /** how many people a settlement had when it was founded, and when it was left */
  founding: number;
  /** how many times higher or lower the band's other members read the people */
  doubt: number;
  /** within this many years of a preferred figure, a list's figure gives way to it */
  near: number;
  /** a span's end this far out stands for no bound */
  open: number;
}

export const POPULATION_DEFAULTS: PopulationParams = { founding: 1000, doubt: 1.6, near: 25, open: 1e8 };

export interface Population {
  /** when the settlement stood, years */
  span: [number, number];
  /** member 0 is the central reading */
  members: PeopleSeries[];
  /** the sources of each member, for the panel */
  from: string[];
}

/** Knots of one reading: figures in time order, one to a year. */
function knots(pops: [number, number][]): [number, number][] {
  const m = new Map<number, number>();
  for (const [t, p] of pops) if (p > 0 && Number.isFinite(t)) m.set(t, p);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/** A reading from figures, ramped from a founding size at the start and to it at the end. */
function series(figs: [number, number][], span: [number, number], p: PopulationParams, endOpen: boolean): PeopleSeries {
  const t: number[] = [];
  const people: number[] = [];
  const [a, b] = span;
  if (figs.length === 0) return { t: [a, b], people: [p.founding, p.founding] };
  const first = figs[0];
  const last = figs[figs.length - 1];
  if (a < first[0]) {
    t.push(a);
    people.push(Math.min(first[1], p.founding));
  }
  for (const [y, n] of figs) {
    if (y < a || y > b) continue;
    t.push(y);
    people.push(n);
  }
  if (b > last[0]) {
    t.push(b);
    people.push(endOpen ? last[1] : Math.min(last[1], p.founding));
  }
  if (t.length === 0) return { t: [a, b], people: [first[1], last[1]] };
  return { t, people };
}

/** The settlement's people through time, as members. */
export function cityPopulation(sources: PopulationSource[], recordSpan?: [number, number], params?: Partial<PopulationParams>): Population {
  const p = { ...POPULATION_DEFAULTS, ...params };
  const ordered = [...sources].sort((x, y) => Number(!!y.record) - Number(!!x.record) || (x.source < y.source ? -1 : x.source > y.source ? 1 : 0));
  const all = ordered.flatMap((s) => knots(s.pops).map(([t]) => ({ t, hold: s.hold })));
  // The span: the record's where it bounds it, else the figures' reach.
  const lo = all.length ? Math.min(...all.map((k) => k.t - k.hold)) : 0;
  const hi = all.length ? Math.max(...all.map((k) => k.t + k.hold)) : 0;
  const open = (v: number) => !Number.isFinite(v) || Math.abs(v) >= p.open;
  const start = recordSpan && !open(recordSpan[0]) ? recordSpan[0] : lo;
  // A record with no end stands to the present, on the axis's present (core/time.ts), and holds its last figure.
  const end = recordSpan ? (open(recordSpan[1]) ? Math.max(hi, PRESENT_YEAR) : recordSpan[1]) : hi;
  const span: [number, number] = [Math.min(start, end), Math.max(start, end)];
  // The central reading: each source's figures, a preferred one's taking the place of others' within `near` years.
  const central: [number, number][] = [];
  for (const s of ordered) {
    for (const [t, n] of knots(s.pops)) {
      if (central.some(([u]) => Math.abs(u - t) <= p.near && u !== t)) continue;
      if (central.some(([u]) => u === t)) continue;
      central.push([t, n]);
    }
  }
  central.sort((x, y) => x[0] - y[0]);
  // A record that runs on to the present holds its last figure, where its end is open.
  const runsOn = !!recordSpan && open(recordSpan[1]);
  const c = series(central, span, p, runsOn);
  const members: PeopleSeries[] = [c, { t: c.t, people: c.people.map((n) => n * p.doubt) }, { t: c.t, people: c.people.map((n) => n / p.doubt) }];
  const from = ['central', 'higher', 'lower'];
  // Each other source's own reading, where it has figures of its own the central one passed over.
  for (const s of ordered.slice(1)) {
    const own = knots(s.pops);
    if (!own.length || own.every(([t, n]) => central.some(([u, m]) => u === t && m === n))) continue;
    members.push(series(own, span, p, runsOn));
    from.push(s.source);
  }
  return { span, members, from };
}
