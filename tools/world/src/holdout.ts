// The population model's scores on figures it did not see (docs/plans/MODELS.md, decision 7), and the parameters the
// build fits to them (core/citypop.ts, model:people/city-population).
//
//   npm run world -- holdout [<record id> …] [--fit]
//
// Every settlement is read as a scene reads it: the lists' rows of one place, and a record within reach of them. Three
// kinds of score are kept:
//
//   - each list's figure, predicted from the other figures of its city, the lists' and the record's: one fit a city, the
//     prediction of every figure from all the others following from it in closed form;
//   - each record's own figures, predicted with all of them left out at once, from the lists and the world's prior
//     alone: how well the model would have done had the record never been written;
//   - the places of judging (PLACES), each one figure held out so, its prediction set beside what it says.
//
// A score is the log of the predictive density of what the figure says, on the log of the people, and whether it fell
// within the band, which 90% of figures should. The build fits the random walk's variance and the spread of a list's
// bias by the first score, over a grid of each, and writes what it fitted, with the anchors of the density model, into
// the cities file the browser reads.

import { densityAnchor, holdOut, leaveOneOut, peopleModel, type DensityAnchor, type PeopleModel, type PeopleScores, type PlaceScore, type Score, type ScoreSummary } from '../../../core/citypop.ts';
import { figuresOf, kmBetween, populationInput, rowsNear, type CitiesFile, type City, type CityRecord } from '../../../core/landscape.ts';

/** A settlement as the model reads it: the lists' rows of one place, and its record where it has one within reach. */
export interface Settlement {
  key: string;
  name: string;
  lat: number;
  lon: number;
  rows: City[];
  record?: CityRecord;
}

/**
 * Each settlement of the file once: a list's rows within `merge` km of one another are one place, as a scene merges
 * them, and a record takes the lists' rows nearest its point within `recordKm`, whatever their times, as a scene reads
 * them (core/landscape.ts, rowsNear).
 */
export function settlementsOf(f: Pick<CitiesFile, 'cities' | 'records'>, recordKm = 12, merge = 5): Settlement[] {
  // One row of each list to a place: a row joins a place within `merge` km that has none of its own list's, as a
  // scene joins two lists' figures for one city (core/landscape.ts, citiesNear).
  const groups: City[][] = [];
  for (const c of f.cities) {
    const g = groups.find((x) => !x.some((r) => r.source === c.source) && x.some((r) => kmBetween(r.lat, r.lon, c.lat, c.lon) <= merge));
    if (g) g.push(c);
    else groups.push([c]);
  }
  const out: Settlement[] = [];
  const taken = new Set<City[]>();
  for (const r of f.records ?? []) {
    const rows = rowsNear(f, r.lat, r.lon, recordKm);
    for (const g of groups) if (g.some((c) => rows.includes(c))) taken.add(g);
    out.push({ key: r.id, name: r.name, lat: r.lat, lon: r.lon, rows, record: r });
  }
  for (const g of groups) {
    if (taken.has(g)) continue;
    const c = g[0];
    out.push({ key: `${c.source}#${c.name}@${c.lat.toFixed(3)},${c.lon.toFixed(3)}`, name: c.name, lat: c.lat, lon: c.lon, rows: g });
  }
  return out;
}

/** The anchors of the density model: the settlements whose own figures give both their ground and their people. */
export function anchorsOf(f: Pick<CitiesFile, 'lists'>, places: Settlement[], model?: Partial<PeopleModel>): DensityAnchor[] {
  const out: DensityAnchor[] = [];
  for (const s of places) {
    if (!s.record) continue;
    const input = populationInput({ lists: f.lists }, s.lat, s.lon, s.rows, s.record, { hold: 50 }, model);
    const { density: _prior, ...rest } = input;
    const a = densityAnchor(s.key, s.lat, s.lon, rest);
    if (a) out.push(a);
  }
  return out;
}


export const summary = (scores: Score[]): ScoreSummary => ({
  n: scores.length,
  lpd: scores.length ? scores.reduce((a, s) => a + s.lpd, 0) / scores.length : 0,
  within: scores.length ? scores.filter((s) => s.within).length / scores.length : 0,
});

/** The places of judging (docs/plans/MODELS.md): a record's figure held out with all its record's, or a list's from its city's others. */
export const PLACES: { name: string; record?: string; claim?: string; list?: { name: string; lat: number; lon: number }; t?: number }[] = [
  { name: "Angkor's region in 770–888 (Klassen et al. 2021, Table 1)", record: 'people/first-cities/angkor', claim: 'people/first-cities/angkor#population-region-770' },
  { name: "Angkor's civic-ceremonial centres in 770–888 (Klassen et al. 2021, Table 1)", record: 'people/first-cities/angkor', claim: 'people/first-cities/angkor#population-centres-770' },
  { name: 'Tenochtitlan in 1519 (Calnek, as the record prefers)', record: 'people/cities/tenochtitlan', claim: 'people/cities/tenochtitlan#population-calnek' },
  { name: 'Rome in 100 CE (the lists)', list: { name: 'Rome', lat: 41.9, lon: 12.5 }, t: 100 },
];



/** The grid the build fits the walk and a list's bias over. */
export const WALKS = [0.002, 0.004, 0.008, 0.016, 0.032, 0.064];
export const LIST_BIAS = [0.15, 0.22, 0.286, 0.4, 0.55];
/** And the grid a work's bias is fitted over, to the records' figures held out. */
export const WORK_BIAS = [0.2, 0.286, 0.4, 0.55, 0.75, 1];

/** Each list's figure predicted from its city's others, at one setting of the parameters. */
function listScores(f: Pick<CitiesFile, 'lists' | 'model'>, places: Settlement[], model: Partial<PeopleModel>): Score[] {
  const out: Score[] = [];
  for (const s of places) {
    if (!s.rows.length) continue;
    out.push(...leaveOneOut(populationInput(f, s.lat, s.lon, s.rows, s.record, { hold: 50 }, model), (o) => !!o.list));
  }
  return out;
}

/** The walk's variance and a list's bias that predict the lists' figures best, held out one at a time. */
export function fitPeople(f: Pick<CitiesFile, 'lists' | 'model'>, places: Settlement[]): { params: Partial<PeopleModel>; grid: PeopleScores['grid']; works: PeopleScores['works'] } {
  const grid: PeopleScores['grid'] = [];
  for (const walk of WALKS)
    for (const list of LIST_BIAS) {
      const s = summary(listScores(f, places, { walk, bias: { list, work: peopleModel().bias.work } }));
      grid.push({ walk, list, lpd: Math.round(s.lpd * 1e4) / 1e4 });
    }
  const best = grid.reduce((a, b) => (b.lpd > a.lpd ? b : a));
  // A work's bias, then, by the records' own figures, each predicted with all of its record's held out.
  const works: PeopleScores['works'] = [];
  for (const work of WORK_BIAS) {
    const model = { walk: best.walk, bias: { list: best.list, work } };
    const scores = places.filter((s) => s.record).flatMap((s) => holdOut(populationInput(f, s.lat, s.lon, s.rows, s.record, { hold: 50 }, model), (o) => !o.list));
    works.push({ work, lpd: Math.round(summary(scores).lpd * 1e4) / 1e4 });
  }
  const bestWork = works.reduce((a, b) => (b.lpd > a.lpd ? b : a));
  return { params: { walk: best.walk, bias: { list: best.list, work: bestWork.work } }, grid, works };
}

/** Every score, with the parameters and anchors the file carries. */
export function peopleScores(f: CitiesFile, places: Settlement[], fit?: { params: Partial<PeopleModel>; grid: PeopleScores['grid']; works: PeopleScores['works'] }): PeopleScores {
  const params = fit?.params ?? f.model?.params ?? {};
  const m = peopleModel(params);
  const lists = summary(listScores(f, places, params));
  const by: PeopleScores['records']['by'] = [];
  for (const s of places) {
    if (!s.record) continue;
    const scores = holdOut(populationInput(f, s.lat, s.lon, s.rows, s.record, { hold: 50 }, params), (o) => !o.list);
    if (scores.length) by.push({ id: s.record.id, summary: summary(scores), scores });
  }
  const all = by.flatMap((x) => x.scores);
  const out: PlaceScore[] = [];
  for (const p of PLACES) {
    let score: Score | undefined;
    let range: [number, number] | undefined;
    if (p.record) {
      score = by.find((x) => x.id === p.record)?.scores.find((x) => x.claim === p.claim);
      const fig = figuresOf(places.find((s) => s.key === p.record)?.record ?? { id: '', figures: [] }).find((x) => x.claim === p.claim);
      if (fig?.lo !== undefined && fig.hi !== undefined) range = [fig.lo, fig.hi];
    } else if (p.list) {
      const s = places.find((x) => x.rows.some((c) => c.name === p.list!.name && kmBetween(c.lat, c.lon, p.list!.lat, p.list!.lon) < 25));
      if (s) {
        const nearest = s.rows.flatMap((c) => c.pops.map(([t, v]) => ({ t, v, source: c.source }))).sort((a, b) => Math.abs(a.t - p.t!) - Math.abs(b.t - p.t!))[0];
        if (nearest) {
          const scores = leaveOneOut(populationInput(f, s.lat, s.lon, s.rows, s.record, { hold: 50 }, params), (o) => !!o.list && o.source === nearest.source && o.t![0] === nearest.t);
          score = scores[0];
        }
      }
    }
    if (!score) continue;
    // In the figure's own units: a core's figure as the core's people, not the settlement's it is read as.
    const o = score.offset;
    const band: [number, number, number] = [Math.exp(score.mean - o), Math.exp(score.mean - o - m.band * score.sd), Math.exp(score.mean - o + m.band * score.sd)];
    const says = Math.exp(score.y - o);
    const [lo, hi] = range ?? [says, says];
    out.push({ name: p.name, says: Math.round(says), ...(range ? { range } : {}), predicted: band.map((x) => Math.round(x)) as [number, number, number], within: score.within, overlaps: band[2] >= lo && band[1] <= hi });
  }
  return { params, grid: fit?.grid ?? [], works: fit?.works ?? [], lists, records: { ...summary(all), by }, places: out, anchors: f.model?.anchors?.length ?? 0 };
}

/** The fitted model a build writes into its cities file: the parameters, then the anchors read with them. */
export function fitCitiesModel(f: CitiesFile, log: (s: string) => void = () => {}): PeopleScores {
  const places = settlementsOf(f);
  const started = Date.now();
  const fit = fitPeople(f, places);
  const anchors = anchorsOf(f, places, fit.params);
  f.model = { params: fit.params, anchors };
  const scores = peopleScores(f, places, fit);
  log(`people     the population model fitted in ${((Date.now() - started) / 1000).toFixed(1)} s over ${places.length} settlements: walk ${fit.params.walk}, a list's bias ${fit.params.bias?.list}, a work's ${fit.params.bias?.work}; ${anchors.length} density anchors`);
  log(`people     the lists' figures held out one at a time: ${scores.lists.n}, mean log density ${scores.lists.lpd.toFixed(3)}, ${(scores.lists.within * 100).toFixed(0)}% within the band`);
  log(`people     the records' figures held out with their record's: ${scores.records.n}, mean log density ${scores.records.lpd.toFixed(3)}, ${(scores.records.within * 100).toFixed(0)}% within the band`);
  for (const p of scores.places) log(`people     ${p.name}: says ${p.range ? `${p.range[0].toLocaleString('en-US')} to ${p.range[1].toLocaleString('en-US')}` : p.says.toLocaleString('en-US')}; predicted without it ${p.predicted[0].toLocaleString('en-US')} (${p.predicted[1].toLocaleString('en-US')} to ${p.predicted[2].toLocaleString('en-US')})${p.overlaps ? '' : ', which does not reach it'}`);
  return scores;
}

/** The scores as text, for the command line. */
export function scoresText(s: PeopleScores, ids: string[] = []): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const lines = [
    `The population model (model:people/city-population), with walk ${s.params.walk ?? peopleModel().walk}, a list's bias ${s.params.bias?.list ?? peopleModel().bias.list} and a work's ${s.params.bias?.work ?? peopleModel().bias.work}:`,
    `  the lists' figures, each from its city's others: ${s.lists.n}, mean log density ${s.lists.lpd.toFixed(3)}, ${pct(s.lists.within)} within the band`,
    `  the records' figures, with all of their record's held out: ${s.records.n}, mean log density ${s.records.lpd.toFixed(3)}, ${pct(s.records.within)} within the band`,
    '',
    'The places of judging, each held out:',
    ...s.places.map((p) => `  ${p.name}: says ${p.range ? `${p.range[0].toLocaleString('en-US')} to ${p.range[1].toLocaleString('en-US')}` : p.says.toLocaleString('en-US')}; predicted ${p.predicted[0].toLocaleString('en-US')}, 90% between ${p.predicted[1].toLocaleString('en-US')} and ${p.predicted[2].toLocaleString('en-US')}${p.overlaps ? '' : ' (does not reach it)'}`),
    '',
    'The records, worst first:',
    ...[...s.records.by].sort((a, b) => a.summary.lpd - b.summary.lpd).map((r) => `  ${r.id}: ${r.summary.n} figures, mean log density ${r.summary.lpd.toFixed(2)}, ${pct(r.summary.within)} within`),
  ];
  for (const id of ids) {
    const r = s.records.by.find((x) => x.id === id);
    if (!r) {
      lines.push('', `${id}: no figures of its own to hold out`);
      continue;
    }
    lines.push('', `${id}, each figure predicted with all of its record's held out:`);
    const z = peopleModel(s.params).band;
    const v = (x: number, o: number) => Math.round(Math.exp(x - o)).toLocaleString('en-US');
    for (const x of r.scores) lines.push(`  ${x.claim ?? x.source} (${x.prop}, ${x.ground}): says ${v(x.y, x.offset)}; predicted ${v(x.mean, x.offset)}, 90% between ${v(x.mean - z * x.sd, x.offset)} and ${v(x.mean + z * x.sd, x.offset)}${x.within ? '' : ' (outside)'}`);
  }
  return lines.join('\n');
}

