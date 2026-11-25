// A settlement's people through time (model:people/city-population; docs/plans/MODELS.md): every figure the world has
// of it, the lists' and its record's, each read as an observation of what it counts, and all of them conditioned on
// together. Nothing here is a claim: the figures are the sources', and the rest is the model's, said so in its record.
//
// The model works on the logarithm of the people, which wanders through time as a random walk: between two figures it
// changes at a constant rate, as the town's growth model reads it (growth.ts), and its doubt grows with the years
// from the nearest figure. Each figure observes the ground it counts over the years it is for:
//
//   - a figure of the settlement's people observes their mean over its years; one that gives no years observes its
//     whole span, weakly, and is never a point at its founding;
//   - a figure of its core (a walled city within its suburbs, the civic-ceremonial centres of a dispersed city) observes
//     the settlement's people less a share of them, the settlement being larger by a ratio with a spread;
//   - a count of houses observes the people less a household's size;
//   - its ground observes the people over the density they lived at: people to the hectare grow with a settlement's
//     size as a power of it, scaled by a density of its own (`at10k`, the people to the hectare at 10,000 people),
//     whose prior comes from the settlements near it in space and time that have both figures (densityPrior);
//   - a figure of its region (the settlement with the land about it) observes the region's people, whose prior is the
//     settlement's people and HYDE's in the region's ground besides, and which the scene spreads over that ground;
//   - the bounds of a site today (a protected property, a survey's area) observe nothing of its people.
//
// Each source's figures for a settlement share a bias, a factor by which they may all be high or low, with a spread
// fitted at build to how well the figures are predicted when held out (holdOut). A list's figure has no noise of its
// own, so a settlement with one list is drawn through its figures exactly, as before; a range a figure gives is a
// spread of its own. A preferred figure passes over its rivals: a record's figures for the same ground at about the
// same time, and a list's within `near` years of it.
//
// Before the first figure the people rise from a founding size at the settlement's start, and after the last they
// fall to it at its end; a settlement whose record runs on to the present holds its last figure.

import { condition, logNormalPdf, type Row } from './gauss.ts';
import type { PeopleSeries } from './growth.ts';
import { PRESENT_YEAR } from './time.ts';

/** What a figure counts: the settlement, its dense core, its region with the land about it, or a site's bounds today. */
export type Ground = 'settlement' | 'core' | 'region' | 'site';
export const GROUNDS: readonly Ground[] = ['settlement', 'core', 'region', 'site'];
export type FigureProp = 'population' | 'settlement_area' | 'houses';

/** One figure a record's claim gives of a settlement. */
export interface Figure {
  prop: FigureProp;
  ground: Ground;
  /** the years it is for, [lo, hi], equal for a moment; absent where its claim gives none */
  t?: [number, number];
  /** its value, and the range it gives, where it gives one */
  v: number;
  lo?: number;
  hi?: number;
  /** the work it is from, and the claim it is (entity#key) */
  source: string;
  claim?: string;
  preferred?: boolean;
}

/** A list's figures for a settlement, and how many years either side of a figure the list holds it for. */
export interface ListRows {
  source: string;
  pops: [number, number][];
  hold: number;
}

/** The model's parameters: chosen, or fitted at build to figures held out (docs/plans/MODELS.md, decision 7). */
export interface PeopleModel {
  /** how far the log of a settlement's people wanders in a year: the variance of a random walk */
  walk: number;
  /** the spread of a source's bias for one settlement, log: a list's, and a work's */
  bias: { list: number; work: number };
  /**
   * the spread of one figure's own error besides its source's bias, log, where it gives no range: small, but never
   * none, so that two sources whose figures for two times disagree in their trend do not each pin it
   */
  point: number;
  /** the log of how many times larger a settlement is than its core, in people and in ground: mean and spread */
  core: [number, number];
  /** the log of the people to a house: mean and spread */
  household: [number, number];
  /**
   * The density scale: people to the hectare in a settlement of 10,000, where nothing near says otherwise, and the
   * spread of its log; how far it varies between neighbours; how density grows with size (density ∝ people^beta);
   * and how far in km and in years a settlement's density speaks for another's.
   */
  density: { at10k: number; spread: number; between: number; beta: number; km: number; years: number };
  /** the spread of the log of HYDE's people in a region, where a region's figures are set against it */
  hyde: number;
  /** the people a settlement had at its founding and when it was left, where no figure says */
  founding: number;
  /** a record's preferred figure passes over a list's within this many years of it */
  near: number;
  /** two of a record's figures for one ground within this many years of each other are rivals */
  rivals: number;
  /** how many years either side of a record's figure a settlement with no span of its own is taken to have stood */
  hold: number;
  /** how many standard deviations either side of the central reading the band's members lie: 1.645 for 90% */
  band: number;
}

/**
 * The defaults: every one a choice, said so in the model's records, until the build fits `walk` and `bias` to the
 * figures it holds out (tools/world/src/holdout.ts). A list's bias of 0.286 makes its band 1.6 times higher and lower
 * at a figure, the band this model drew before it read its figures as observations.
 */
export const PEOPLE_MODEL: PeopleModel = {
  walk: 0.004,
  bias: { list: 0.286, work: 0.286 },
  point: 0.05,
  core: [Math.log(1.25), 0.35],
  household: [Math.log(5), 0.25],
  density: { at10k: 100, spread: 0.5, between: 0.4, beta: 0.2, km: 800, years: 800 },
  hyde: 0.34,
  founding: 1000,
  near: 25,
  rivals: 50,
  hold: 50,
  band: 1.645,
};

export const peopleModel = (m?: Partial<PeopleModel>): PeopleModel => ({
  ...PEOPLE_MODEL,
  ...m,
  bias: { ...PEOPLE_MODEL.bias, ...m?.bias },
  density: { ...PEOPLE_MODEL.density, ...m?.density },
});

/** How an observation was read, and if not, why not. */
export type Use = 'used' | 'passed' | 'outside' | 'undated' | 'site' | 'no-region' | 'held';

/** A figure as the model read it: for the panel, and for the scores. */
export interface Observation {
  /** the list or the work it is from, and the claim it is, where it is a record's */
  source: string;
  claim?: string;
  list?: boolean;
  prop: FigureProp;
  ground: Ground;
  /** the years it is for, as given; absent where it gives none */
  t?: [number, number];
  v: number;
  lo?: number;
  hi?: number;
  use: Use;
  /** the claim that passed over it */
  by?: string;
  /** the years it was read for, within the settlement's span */
  at?: [number, number];
  /** what it says, as the model reads it (log), and what the model gives for it with everything else: log mean and sd */
  y?: number;
  fit?: [number, number];
  /** what the model gives for it from all the other figures, without it: log mean and sd (its own spread included) */
  loo?: [number, number];
}

export interface Population {
  /** when the settlement stood, years */
  span: [number, number];
  /** member 0 is the central reading; members 1 and 2 are the band's higher and lower edges */
  members: PeopleSeries[];
  from: string[];
  /** the density scale it is laid out at: people to the hectare at 10,000 people; and its log prior and posterior */
  at10k: number;
  density: { prior: [number, number]; post: [number, number] };
  /** its region, where its record gives one: its ground, and its people through time as members */
  region?: { ha: number; members: PeopleSeries[] };
  observations: Observation[];
}

export interface PopulationInput {
  /** the lists' rows for the settlement */
  lists?: ListRows[];
  /** its record's figures, and when its record says it stood: a billion years either way for no bound */
  figures?: Figure[];
  span?: [number, number];
  /** the prior of its density scale here: the log of people to the hectare at 10,000 people, mean and sd */
  density?: [number, number];
  /** HYDE's people within its region's ground, [year, people], where its record gives a region */
  hyde?: [number, number][];
  model?: Partial<PeopleModel>;
  /** figures to leave out of the fit, and predict: for the scores */
  without?: (o: Observation) => boolean;
}

const OPEN = 1e8;
const open = (v: number) => !Number.isFinite(v) || Math.abs(v) >= OPEN;
const LN1E4 = Math.log(1e4);

/** A figure's central value and its own spread, log: a range is read as even on a log scale between its ends. */
function valueOf(o: Pick<Observation, 'v' | 'lo' | 'hi'>): { y: number; r: number } {
  if (o.lo !== undefined && o.hi !== undefined && o.lo > 0 && o.hi > o.lo) {
    const a = Math.log(o.lo);
    const b = Math.log(o.hi);
    return { y: (a + b) / 2, r: ((b - a) * (b - a)) / 12 };
  }
  return { y: Math.log(o.v), r: 0 };
}

/** The years a figure is read for: its own within the span, the whole span where it gives none; undefined if none. */
function windowIn(t: [number, number] | undefined, span: [number, number]): [number, number] | undefined {
  if (!t) return span;
  const a = Math.max(t[0], span[0]);
  const b = Math.min(t[1], span[1]);
  return a <= b ? [a, b] : undefined;
}

/** Are two figures for about the same time? Two moments within `years`; else their windows widened by half that, overlapping by half the shorter. */
function rivalsAt(a: [number, number], b: [number, number], years: number): boolean {
  if (a[0] === a[1] && b[0] === b[1]) return Math.abs(a[0] - b[0]) <= years;
  const h = years / 2;
  const lo = Math.max(a[0] - h, b[0] - h);
  const hi = Math.min(a[1] + h, b[1] + h);
  const shorter = Math.min(a[1] - a[0], b[1] - b[0]) + years;
  return hi - lo >= shorter / 2;
}

/** How far apart two windows are, in years: 0 where they overlap. */
const apart = (a: [number, number], b: [number, number]) => Math.max(0, a[0] - b[1], b[0] - a[1]);

/** People at a time on a series of knots, changing at a constant rate between them; 0 outside. */
function at(s: PeopleSeries, t: number): number {
  const n = s.t.length;
  if (!n || t < s.t[0] || t > s.t[n - 1]) return 0;
  let i = 0;
  while (i + 1 < n && s.t[i + 1] < t) i++;
  if (i + 1 >= n || s.t[i + 1] === s.t[i]) return s.people[i];
  const u = (t - s.t[i]) / (s.t[i + 1] - s.t[i]);
  const a = Math.max(s.people[i], 1e-9);
  const b = Math.max(s.people[i + 1], 1e-9);
  return Math.exp(Math.log(a) + u * (Math.log(b) - Math.log(a)));
}

/** A value of a series [year, value] at a time: straight between, held beyond. */
function seriesAt(points: [number, number][] | undefined, t: number): number {
  if (!points?.length) return 0;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, va] = points[i];
    const [b, vb] = points[i + 1];
    if (t <= b) return b > a ? va + ((vb - va) * (t - a)) / (b - a) : vb;
  }
  return points.at(-1)![1];
}

/** The span a settlement stood for: its record's where it bounds it, else its figures' reach. */
function spanOf(input: PopulationInput, m: PeopleModel): { span: [number, number]; runsOn: boolean } {
  const reach: number[] = [];
  for (const l of input.lists ?? []) for (const [t] of l.pops) if (Number.isFinite(t)) reach.push(t - l.hold, t + l.hold);
  for (const f of input.figures ?? []) if (f.t && f.ground !== 'site') reach.push(f.t[0] - m.hold, f.t[1] + m.hold);
  const lo = reach.length ? Math.min(...reach) : 0;
  const hi = reach.length ? Math.max(...reach) : 0;
  const s = input.span;
  const start = s && !open(s[0]) ? s[0] : lo;
  // A record with no end stands to the present, on the axis's present (core/time.ts), and holds its last figure.
  const end = s ? (open(s[1]) ? Math.max(hi, PRESENT_YEAR) : s[1]) : hi;
  return { span: [Math.min(start, end), Math.max(start, end)], runsOn: !!s && open(s[1]) };
}

/** When a settlement stood, as the model reads it: its record's span where it bounds it, else its figures' reach. */
export const populationSpan = (input: PopulationInput): [number, number] => spanOf(input, peopleModel(input.model)).span;

/** The observations a settlement's figures make, each with how it is read: in time order of its source, as given. */
function observe(input: PopulationInput, span: [number, number], m: PeopleModel): Observation[] {
  const out: Observation[] = [];
  const figures = input.figures ?? [];
  for (const f of figures) {
    const o: Observation = { source: f.source, ...(f.claim ? { claim: f.claim } : {}), prop: f.prop, ground: f.ground, ...(f.t ? { t: f.t } : {}), v: f.v, ...(f.lo !== undefined ? { lo: f.lo } : {}), ...(f.hi !== undefined ? { hi: f.hi } : {}), use: 'used' };
    if (f.ground === 'site') o.use = 'site';
    else if (!f.t && !(span[1] > span[0])) o.use = 'undated';
    else {
      const w = windowIn(f.t, span);
      if (!w) o.use = 'outside';
      else o.at = w;
    }
    out.push(o);
  }
  // Figures left out of the fit, for the scores, are left out of everything else too: they pass over nothing, and a
  // list's figure that one of them gives too still stands.
  if (input.without) for (const o of out) if (o.use === 'used' && input.without(o)) o.use = 'held';
  // A preferred figure passes over its rivals: of the same property and ground, at about the same time. A count of
  // houses is a rival of a preferred figure of the people too, which most such estimates rest on (docs/RECORDS.md).
  const pref = out.filter((o, i) => o.use === 'used' && figures[i].preferred);
  out.forEach((o, i) => {
    if (o.use !== 'used') return;
    const by = pref.find((p) => p !== o && p.ground === o.ground && rivalsAt(p.at!, o.at!, m.rivals) && ((p.prop === o.prop && !figures[i].preferred) || (o.prop === 'houses' && p.prop === 'population')));
    if (by) {
      o.use = 'passed';
      o.by = by.claim ?? by.source;
    }
  });
  // The lists' figures, but those a record's own figure gives too, or a preferred one passes over.
  const ownPeople = out.filter((o) => o.prop === 'population' && o.ground === 'settlement' && o.at && o.use !== 'held');
  for (const l of input.lists ?? []) {
    for (const [t, v] of l.pops) {
      if (!(v > 0) || !Number.isFinite(t)) continue;
      if (ownPeople.some((o) => o.at![0] === o.at![1] && Math.abs(o.at![0] - t) <= 1 && Math.abs(o.v - v) <= 0.01 * v)) continue;
      const o: Observation = { source: l.source, list: true, prop: 'population', ground: 'settlement', t: [t, t], v, use: 'used' };
      const w = windowIn([t, t], span);
      if (!w) o.use = 'outside';
      else {
        o.at = w;
        if (input.without?.(o)) o.use = 'held';
        else {
          const by = ownPeople.find((p) => p.use === 'used' && figures[out.indexOf(p)]?.preferred && apart(p.at!, w) <= m.near);
          if (by) {
            o.use = 'passed';
            o.by = by.claim ?? by.source;
          }
        }
      }
      out.push(o);
    }
  }
  return out;
}

/** Knots: the span's ends, and the ends and the middle of every window read, in order, none within half a year of another. */
function knotsOf(span: [number, number], obs: Observation[]): number[] {
  const ts = [span[0], span[1], ...obs.filter((o) => o.at).flatMap((o) => [o.at![0], (o.at![0] + o.at![1]) / 2, o.at![1]])].sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of ts) if (!out.length || t - out[out.length - 1] > 0.5) out.push(t);
  return out;
}
const knotIndex = (knots: number[], t: number) => {
  let best = 0;
  for (let i = 1; i < knots.length; i++) if (Math.abs(knots[i] - t) < Math.abs(knots[best] - t)) best = i;
  return best;
};

/** A random walk's covariance on knots: an initial spread, and `walk` more per year. */
function walkCov(knots: number[], initial: number, walk: number, into: Float64Array, dim: number, offset = 0) {
  for (let i = 0; i < knots.length; i++)
    for (let j = 0; j < knots.length; j++) into[(offset + i) * dim + offset + j] = initial + walk * (Math.min(knots[i], knots[j]) - knots[0]);
}

interface Built {
  rows: Row[];
  /** the observation each row is */
  of: Observation[];
}

/** The settlement's own observations as rows over its state: knots, then its density scale, then the sources' biases. */
function settlementRows(obs: Observation[], knots: number[], m: PeopleModel, biasAt: (o: Observation) => number): Built {
  const rows: Row[] = [];
  const of: Observation[] = [];
  const u = knots.length;
  const beta = m.density.beta;
  for (const o of obs) {
    if (o.ground === 'region' || o.ground === 'site' || !o.at) continue;
    const k = knotIndex(knots, (o.at[0] + o.at[1]) / 2);
    const len = o.at[1] - o.at[0];
    const own = valueOf(o);
    const core = o.ground === 'core';
    let y = own.y + (core ? m.core[0] : 0);
    let r = own.r + m.point ** 2 + (core ? m.core[1] ** 2 : 0);
    const b = biasAt(o);
    if (o.prop === 'settlement_area') {
      // ln area = ln people − ln density = (1 − β) ln people − ln at10k + β ln 10,000.
      y -= beta * LN1E4;
      r += (1 - beta) ** 2 * ((m.walk * len) / 12);
      rows.push({ at: [k, u, b], w: [1 - beta, -1, 1], y, r });
    } else {
      if (o.prop === 'houses') {
        y += m.household[0];
        r += m.household[1] ** 2;
      }
      r += (m.walk * len) / 12;
      rows.push({ at: [k, b], w: [1, 1], y, r });
    }
    of.push(o);
  }
  return { rows, of };
}

/** The prediction of a row from a posterior: log mean and variance, its own noise included. */
function predict(row: Row, mean: Float64Array, cov: Float64Array, dim: number): [number, number] {
  let mu = 0;
  let v = row.r;
  for (let a = 0; a < row.at.length; a++) {
    mu += row.w[a] * mean[row.at[a]];
    for (let b = 0; b < row.at.length; b++) v += row.w[a] * row.w[b] * cov[row.at[a] * dim + row.at[b]];
  }
  return [mu, v];
}

/** Members from a posterior on knots: the central reading and the band's edges, ramped to a founding size outside the figures. */
function membersOf(knots: number[], mean: Float64Array, cov: Float64Array, dim: number, first: number, last: number, span: [number, number], m: PeopleModel, ramp: { from: boolean; to: boolean }, offset = 0, shift: (t: number) => number = () => 0): PeopleSeries[] {
  const make = (z: number): PeopleSeries => {
    const t: number[] = [];
    const people: number[] = [];
    for (let i = 0; i < knots.length; i++) {
      const k = knots[i];
      if (k < first - 1e-9 || k > last + 1e-9) continue;
      t.push(k);
      people.push(Math.exp(mean[offset + i] + shift(k) + z * Math.sqrt(Math.max(0, cov[(offset + i) * dim + offset + i]))));
    }
    if (!t.length) return { t: [span[0], span[1]], people: [m.founding, m.founding] };
    if (span[0] < t[0]) {
      const p0 = people[0];
      t.unshift(span[0]);
      people.unshift(ramp.from ? Math.min(p0, m.founding) : p0);
    }
    if (span[1] > t[t.length - 1]) {
      const p1 = people[people.length - 1];
      t.push(span[1]);
      people.push(ramp.to ? Math.min(p1, m.founding) : p1);
    }
    return { t, people };
  };
  return [make(0), make(m.band), make(-m.band)];
}

/** The settlement's people through time, its density scale and its region's people, from every figure it has. */
export function cityPopulation(input: PopulationInput): Population {
  const m = peopleModel(input.model);
  const { span, runsOn } = spanOf(input, m);
  const obs = observe(input, span, m);
  const dPrior: [number, number] = input.density ?? [Math.log(m.density.at10k), Math.hypot(m.density.spread, m.density.between)];
  // The sources' biases: one for each list, and one for each work's figures of the settlement and its core, whatever
  // they count. A work that drew a city's ground wide counted its people over it: its ground and its people err
  // together, and how densely they lived is what it says most surely. Its figures of the region have one of their own.
  const biasKeys: string[] = [];
  const biasKind: ('list' | 'work')[] = [];
  const keyOf = (o: Observation) => (o.list ? o.source : `${o.source}|${o.ground === 'region' ? 'region' : 'own'}`);
  const settlementObs = obs.filter((o) => o.ground !== 'region' && o.ground !== 'site' && o.at);
  for (const o of settlementObs) {
    const k = keyOf(o);
    if (!biasKeys.includes(k)) {
      biasKeys.push(k);
      biasKind.push(o.list ? 'list' : 'work');
    }
  }
  const knots = knotsOf(span, settlementObs);
  const K = knots.length;
  const dim = K + 1 + biasKeys.length;
  const used = (o: Observation) => o.use === 'used';
  const built = settlementRows(settlementObs, knots, m, (o) => K + 1 + biasKeys.indexOf(keyOf(o)));
  // A figure's own error is what reconciles two sources' figures. A settlement whose figures read are all one source's
  // has its error all in that source's bias: its figures are read exactly, as they were before this model, and two of
  // them can never disagree, being for different times.
  const fitAll = built.of.filter(used);
  const oneSource = new Set(fitAll.map(keyOf)).size <= 1 && new Set(built.rows.filter((_, i) => used(built.of[i])).map((r) => r.at[0])).size === fitAll.length;
  if (oneSource) built.rows.forEach((r) => (r.r = Math.max(0, r.r - m.point ** 2)));
  const fitRows = built.rows.filter((_, i) => used(built.of[i]));
  const fitOf = built.of.filter(used);
  let members: PeopleSeries[] = [];
  let post: [number, number] = dPrior;
  if (fitRows.length) {
    // The prior: a level so wide it says nothing, round the figures' own; the density scale's; and each source's bias.
    const level = fitRows.filter((r) => r.w.length === 2).map((r) => r.y);
    const mu = new Float64Array(dim);
    const S = new Float64Array(dim * dim);
    const m0 = level.length ? level.reduce((a, b) => a + b, 0) / level.length : LN1E4;
    for (let i = 0; i < K; i++) mu[i] = m0;
    walkCov(knots, 1e4, m.walk, S, dim);
    mu[K] = dPrior[0];
    S[K * dim + K] = dPrior[1] ** 2;
    biasKind.forEach((kind, j) => (S[(K + 1 + j) * dim + K + 1 + j] = m.bias[kind] ** 2));
    const p = condition(mu, S, fitRows);
    fitOf.forEach((o, i) => {
      o.y = fitRows[i].y;
      o.loo = [p.loo[i].mean, Math.sqrt(p.loo[i].v)];
    });
    // Every figure that can be placed, read or not, against what the model gives for it.
    built.of.forEach((o, i) => {
      const [f, v] = predict(built.rows[i], p.mean, p.cov, dim);
      o.y = built.rows[i].y;
      o.fit = [f, Math.sqrt(v)];
    });
    post = [p.mean[K], Math.sqrt(Math.max(0, p.cov[K * dim + K]))];
    // The founding size stands only before the first figure's years begin, and the end's after the last's end: a figure
    // for 770–888 says the people were there all through those years, its start included.
    members = membersOf(knots, p.mean, p.cov, dim, Math.min(...fitOf.map((o) => o.at![0])), Math.max(...fitOf.map((o) => o.at![1])), span, m, { from: true, to: !runsOn });
  }
  const pop: Population = {
    span,
    members,
    from: members.length ? ['central', 'higher', 'lower'] : [],
    at10k: Math.exp(post[0]),
    density: { prior: dPrior, post },
    observations: obs,
  };
  const region = regionOf(input, obs, span, m, members[0]);
  if (region) pop.region = region;
  return pop;
}

/** The region's ground, in hectares: its preferred figure's, else the one nearest the middle of the span. */
function regionGround(input: PopulationInput, span: [number, number]): number | undefined {
  const areas = (input.figures ?? []).filter((f) => f.prop === 'settlement_area' && f.ground === 'region' && f.v > 0);
  if (!areas.length) return undefined;
  const mid = (span[0] + span[1]) / 2;
  const pick = areas.find((f) => f.preferred) ?? [...areas].sort((a, b) => Math.abs((a.t ? (a.t[0] + a.t[1]) / 2 : mid) - mid) - Math.abs((b.t ? (b.t[0] + b.t[1]) / 2 : mid) - mid))[0];
  return pick.v;
}

/**
 * The region's people: the settlement's and HYDE's within the region's ground, as a prior wandering as the settlement's
 * people do from there, conditioned on the region's own figures. Only where the record gives the region's ground and a
 * figure of its people; its figures with no ground to count over are said so.
 */
function regionOf(input: PopulationInput, obs: Observation[], span: [number, number], m: PeopleModel, settlement: PeopleSeries | undefined): Population['region'] {
  const regionObs = obs.filter((o) => o.ground === 'region' && o.prop === 'population' && o.at);
  const ha = regionGround(input, span);
  if (!ha) {
    for (const o of regionObs) if (o.use === 'used' || o.use === 'held') o.use = 'no-region';
    return undefined;
  }
  if (!regionObs.some((o) => o.use === 'used' || o.use === 'held')) return undefined;
  const steps = (input.hyde ?? []).map(([t]) => t).filter((t) => t > span[0] && t < span[1]);
  const knots = knotsOf(span, regionObs);
  for (const t of steps) if (!knots.some((k) => Math.abs(k - t) <= 0.5)) knots.push(t);
  knots.sort((a, b) => a - b);
  const K = knots.length;
  const prior = (t: number) => Math.log(Math.max(1, (settlement ? at(settlement, t) : 0) + Math.max(0, seriesAt(input.hyde, t))));
  const keys: string[] = [];
  for (const o of regionObs) if (!keys.includes(o.source)) keys.push(o.source);
  const dim = K + keys.length;
  const rows: Row[] = [];
  const of: Observation[] = [];
  for (const o of regionObs) {
    const k = knotIndex(knots, (o.at![0] + o.at![1]) / 2);
    const own = valueOf(o);
    rows.push({ at: [k, K + keys.indexOf(o.source)], w: [1, 1], y: own.y - prior(knots[k]), r: own.r + m.point ** 2 + (m.walk * (o.at![1] - o.at![0])) / 12 });
    of.push(o);
  }
  const mu = new Float64Array(dim);
  const S = new Float64Array(dim * dim);
  walkCov(knots, m.hyde ** 2, m.walk, S, dim);
  keys.forEach((_, j) => (S[(K + j) * dim + K + j] = m.bias.work ** 2));
  const fit = rows.filter((_, i) => of[i].use === 'used');
  const fitOf = of.filter((o) => o.use === 'used');
  const p = condition(mu, S, fit);
  fitOf.forEach((o, i) => (o.loo = [p.loo[i].mean + prior(knots[fit[i].at[0]]), Math.sqrt(p.loo[i].v)]));
  of.forEach((o, i) => {
    const [f, v] = predict(rows[i], p.mean, p.cov, dim);
    const base = prior(knots[rows[i].at[0]]);
    o.y = rows[i].y + base;
    o.fit = [f + base, Math.sqrt(v)];
  });
  const members = membersOf(knots, p.mean, p.cov, dim, knots[0], knots[K - 1], span, m, { from: false, to: false }, 0, prior);
  return { ha, members };
}

/** A settlement's people at a time, on its central reading: 0 outside its span. */
export const centralAt = (p: Pick<Population, 'members'>, t: number): number => (p.members[0] ? at(p.members[0], t) : 0);

/**
 * How many people a region holds about its settlement at a time, beyond the settlement's own: the region's central
 * reading less the settlement's, never below none; undefined where the record gives no region.
 */
export function dispersedAt(p: Pick<Population, 'members' | 'region'>, t: number): number | undefined {
  if (!p.region?.members[0]) return undefined;
  const r = at(p.region.members[0], t);
  if (!(r > 0)) return undefined;
  return Math.max(0, r - centralAt(p, t));
}

// ——— The density scale, from the settlements near ———

/** A settlement whose own figures say how densely it lived: where, about when, and its posterior log density scale. */
export interface DensityAnchor {
  key: string;
  lat: number;
  lon: number;
  t: number;
  /** log people to the hectare at 10,000 people: mean and variance */
  u: number;
  v: number;
}

function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The prior of a settlement's density scale where it stood (docs/plans/MODELS.md, decision 4): the world's, pulled
 * towards those of the settlements near it in space and time whose own figures say how densely they lived, each by
 * how near it is and how sure its own is, and spread by how far neighbours differ. Its own anchor is left out.
 */
export function densityPrior(anchors: DensityAnchor[] | undefined, lat: number, lon: number, t: number, model?: Partial<PeopleModel>, self?: string): [number, number] {
  const d = peopleModel(model).density;
  let P = 1 / (d.spread * d.spread);
  let S = Math.log(d.at10k) * P;
  for (const a of anchors ?? []) {
    if (a.key === self) continue;
    const w = Math.exp(-0.5 * ((km(lat, lon, a.lat, a.lon) / d.km) ** 2 + ((t - a.t) / d.years) ** 2));
    if (w < 1e-4) continue;
    const p = w / (a.v + d.between * d.between);
    P += p;
    S += a.u * p;
  }
  return [S / P, Math.sqrt(1 / P + d.between * d.between)];
}

/**
 * The anchor a settlement's figures make, where they say how densely it lived: a ground of its own, read with its people.
 * Its density scale is fitted from the world's prior alone, so that it speaks for its neighbours by its own figures.
 */
export function densityAnchor(key: string, lat: number, lon: number, input: Omit<PopulationInput, 'density'>): DensityAnchor | undefined {
  const p = cityPopulation(input);
  const areas = p.observations.filter((o) => o.use === 'used' && o.prop === 'settlement_area' && o.ground !== 'region' && o.at);
  // Its ground says how densely it lived only beside a figure of its people: a ground alone gives back the prior.
  const people = p.observations.some((o) => o.use === 'used' && o.prop !== 'settlement_area' && o.ground !== 'region');
  if (!areas.length || !people || !p.members.length) return undefined;
  const t = areas.reduce((s, o) => s + (o.at![0] + o.at![1]) / 2, 0) / areas.length;
  return { key, lat, lon, t, u: p.density.post[0], v: p.density.post[1] ** 2 };
}

// ——— Scores on figures held out ———

/** How well a figure was predicted without it: the log density of what it says under the prediction, and whether it fell in the band. */
export interface Score {
  source: string;
  claim?: string;
  prop: FigureProp;
  ground: Ground;
  /** what it says and what was predicted, log, as the model reads it; the prediction's sd */
  y: number;
  mean: number;
  sd: number;
  /** what the model adds to the log of the figure's own value to read it (a core's share, a household, a density's power): taken off, a log of the figure's own units */
  offset: number;
  lpd: number;
  within: boolean;
}

/** How a set of scores reads: how many, their mean log predictive density, and the share within the band. */
export interface ScoreSummary {
  n: number;
  lpd: number;
  within: number;
}
/** A place of judging: what its figure says, and the band the model predicts for it without it, as people. */
export interface PlaceScore {
  name: string;
  /** what the figure says, and its own range where it gives one */
  says: number;
  range?: [number, number];
  /** the model's prediction without it: the central reading and the band's edges */
  predicted: [number, number, number];
  within: boolean;
  /** whether the band overlaps the figure's own range */
  overlaps: boolean;
}
/** The model's scores on figures it did not see, as a build counts them (tools/world/src/holdout.ts; coverage.json). */
export interface PeopleScores {
  /** the parameters fitted, and the grid each was chosen from with the mean score at each */
  params: Partial<PeopleModel>;
  grid: { walk: number; list: number; lpd: number }[];
  /** and a work's bias, fitted after, by the records' figures held out */
  works: { work: number; lpd: number }[];
  /** each list's figure from its city's others, with the parameters fitted */
  lists: ScoreSummary;
  /** each record's own figures with all of them held out */
  records: ScoreSummary & { by: { id: string; summary: ScoreSummary; scores: Score[] }[] };
  places: PlaceScore[];
  /** how many anchors the density model has */
  anchors: number;
}

/** An observation's identity across two fits of one settlement. */
const idOf = (o: Observation) => `${o.claim ?? o.source}|${o.prop}|${o.ground}|${o.t?.[0] ?? ''}|${o.v}`;

/**
 * Scores of the figures `which` picks, each predicted from the others with every one of them left out of the fit at
 * once. Only those the model reads with them all in are scored: a figure its record passes over for a preferred one is
 * no figure the model would have to predict.
 */
export function holdOut(input: Omit<PopulationInput, 'without'>, which: (o: Observation) => boolean): Score[] {
  const m = peopleModel(input.model);
  const read = new Set(cityPopulation(input).observations.filter((o) => o.use === 'used').map(idOf));
  const p = cityPopulation({ ...input, without: which });
  const out: Score[] = [];
  for (const o of p.observations) {
    if (o.use !== 'held' || o.y === undefined || !o.fit || !read.has(idOf(o))) continue;
    const [mean, sd] = o.fit;
    out.push({ source: o.source, ...(o.claim ? { claim: o.claim } : {}), prop: o.prop, ground: o.ground, y: o.y, mean, sd, offset: o.y - valueOf(o).y, lpd: logNormalPdf(o.y, mean, sd * sd), within: Math.abs(o.y - mean) <= m.band * sd });
  }
  return out;
}

/** Scores of every figure a settlement's fit reads, each predicted from all the others: one fit, no refitting. */
export function leaveOneOut(input: Omit<PopulationInput, 'without'>, which: (o: Observation) => boolean = () => true): Score[] {
  const m = peopleModel(input.model);
  const p = cityPopulation(input);
  const out: Score[] = [];
  for (const o of p.observations) {
    if (o.use !== 'used' || o.y === undefined || !o.loo || !which(o)) continue;
    const [mean, sd] = o.loo;
    if (!(sd > 0) || !Number.isFinite(mean)) continue;
    out.push({ source: o.source, ...(o.claim ? { claim: o.claim } : {}), prop: o.prop, ground: o.ground, y: o.y, mean, sd, offset: o.y - valueOf(o).y, lpd: logNormalPdf(o.y, mean, sd * sd), within: Math.abs(o.y - mean) <= m.band * sd });
  }
  return out;
}
