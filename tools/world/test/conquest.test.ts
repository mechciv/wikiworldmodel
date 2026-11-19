// A probe outside Europe (docs/slices/FIFTEENTH-SLICE.md): Tenochtitlan from 1519 to 1521, told by two sides whose
// sources were written down at different times, in two calendars. Each test is a case the probe found, on a small
// world written for it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cycleDays, dayNumberAt, dayOnAxis, formatTime, formatTimeValue, parseCycle, parsePoint, parseTime, TimeError } from '../../../core/time.ts';
import { claimGroup, cycleAnchor, resolveCycle, scenariosOf, solveScenario, solveVariants } from '../src/chronology.ts';
import { validateWorld, type Issue } from '../src/validate/index.ts';
import { writtenAfter } from '../src/build/records.ts';
import { loadWorld, type World } from '../src/world.ts';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const SOURCE = `id: src:test/report\ntype: publication\nkind: measurement\ncitation: A fixture source, not a real publication.\n`;
const cite = `source: { ref: src:test/report, loc: p. 1 }`;

/** A world of a source plus the given files. */
async function world(files: Record<string, string>): Promise<World> {
  const root = mkdtempSync(join(tmpdir(), 'wikiworldmodel-conquest-'));
  dirs.push(root);
  for (const [path, text] of Object.entries({ 'sources/report.yaml': SOURCE, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorld(root);
}

const check = async (files: Record<string, string>): Promise<Issue[]> => (await validateWorld(await world(files), { frames: false })).issues;
const errors = (issues: Issue[]) => issues.filter((i) => i.level === 'error');
const said = (issues: Issue[]) => issues.filter((i) => i.level !== 'info').map((i) => `${i.level}: ${i.message}`);

/** An entity file: its kind, then phases, claims and relations as YAML. */
const entity = (id: string, kind: string, body: string) => `id: ${id}\nkind: ${kind}\nauthor: fixture\n${body}`;
const lasting = (id: string, kind: string, start: string, end?: string, more = '') =>
  entity(id, kind, `claims:\n  start: { prop: start, value: ${start}, ${cite} }\n${end ? `  end: { prop: end, value: ${end}, ${cite} }\n` : ''}${more}`);

/** The day a point of a solution falls on, or the days its bounds run from and to. */
function days(w: World, point: string, s = solveScenario(w)): string {
  if (!s.ok) throw new Error('the world does not hold');
  const b = s.bounds.get(point)!;
  const lo = formatTime(b.lo, 1 / 365);
  const hi = formatTime(b.hi - 1e-6, 1 / 365);
  return lo === hi ? lo : `${lo} to ${hi}`;
}

const jdn = (date: string) => dayNumberAt(parsePoint(date).t)!;
const dayText = ([a, b]: [number, number]) => formatTimeValue({ kind: 'interval', lo: dayOnAxis(a).t, hi: dayOnAxis(b).t + dayOnAxis(b).whole });

/** The records that anchor the two Mexica cycles: a day of the 260-day count, and the first day of a year. */
const dayAnchor = (dates: string) => entity('test/day-anchor', 'event/epoch', `claims:\n  calendar: { prop: calendar, value: tonalpohualli, ${cite} }\n  day-name: { prop: day_name, value: 1 Coatl, ${cite} }\n${dates}`);
const yearAnchor = (dates: string) => entity('test/year-anchor', 'event/epoch', `claims:\n  calendar: { prop: calendar, value: xiuhpohualli, ${cite} }\n  day-name: { prop: day_name, value: the year 3 Calli, ${cite} }\n${dates}`);
const anchors = {
  'entities/day-anchor.yaml': dayAnchor(`  date: { prop: date, value: 13 August 1521 CE, ${cite} }\n`),
  'entities/year-anchor.yaml': yearAnchor(`  date: { prop: date, value: 2 February 1521 CE, ${cite} }\n`),
};

describe('a day named in cycles', () => {
  it('reads a day of the 260-day count, a year by its bearer, or both, and refuses what is not one', () => {
    expect(parseTime('1 Coatl')).toEqual({ kind: 'cycle', day: { cycle: 'tonalpohualli', place: 104 }, text: '1 Coatl' });
    expect(parseTime('the year 3 Calli')).toEqual({ kind: 'cycle', year: { cycle: 'xiuhpohualli', place: 15 }, text: 'the year 3 Calli' });
    expect(parseTime('1 Coatl in the year 3 Calli')).toMatchObject({ kind: 'cycle', day: { place: 104 }, year: { place: 15 } });
    expect(formatTimeValue(parseTime('1 Coatl in the year 3 Calli'))).toBe('1 Coatl in the year 3 Calli');
    // The years take the next number and the next bearer: 1 Acatl, 2 Tecpatl, 3 Calli, 4 Tochtli.
    expect(['the year 1 Acatl', 'the year 2 Tecpatl', 'the year 3 Calli', 'the year 4 Tochtli'].map((y) => parseCycle(y)!.year!.place)).toEqual([13, 14, 15, 16]);
    expect(() => parseTime('14 Coatl')).toThrow(/numbers its days from 1 to 13/);
    // Calli bears years; Coatl does not.
    expect(() => parseTime('the year 3 Coatl')).toThrow(TimeError);
    expect(() => parseTime({ lo: '1 Coatl', hi: '1522 CE' } as never)).toThrow(/names many days/);
  });

  it('names a set of days, one in every turn of its cycles, which only an anchor places', () => {
    const anchor = { day: { jdn: jdn('13 August 1521 CE'), place: 104 }, year: { jdn: jdn('2 February 1521 CE'), place: 15 } };
    const within = (v: string) => cycleDays(parseCycle(v)!, anchor, jdn('1 January 1519 CE'), jdn('31 December 1522 CE'))!.map(dayText);
    // A day of the 260-day count comes round every 260 days.
    expect(within('1 Coatl')).toEqual(['25 June 1519 CE', '11 March 1520 CE', '26 November 1520 CE', '13 August 1521 CE', '30 April 1522 CE']);
    // In a year of 365 days a day's name comes once or twice.
    expect(within('1 Coatl in the year 3 Calli')).toEqual(['13 August 1521 CE']);
    expect(within('1 Coatl in the year 2 Tecpatl')).toEqual(['11 March 1520 CE', '26 November 1520 CE']);
    // A year named alone is the whole year; 1520 had a leap day, the Mexica year none.
    expect(within('the year 2 Tecpatl')).toEqual(['3 February 1520 CE – 1 February 1521 CE']);
    expect(within('1 Coatl in the year 3 Tecpatl')).toEqual([]);
    // Without an anchor, nothing.
    expect(cycleDays(parseCycle('1 Coatl')!, {}, 0, 1000)).toBeUndefined();
  });

  it('cannot be placed until the world says where each of its cycles meets our days', async () => {
    const fall = entity('test/fall', 'event/conquest', `claims:\n  date: { prop: date, value: 13 August 1521 CE, ${cite} }\n  date-mexica: { prop: date, value: 1 Coatl in the year 3 Calli, ${cite} }\n`);
    const issues = await check({ 'entities/fall.yaml': fall });
    expect(errors(issues).map((i) => i.message)).toEqual([expect.stringContaining('no record anchors the tonalpohualli'), expect.stringContaining('no record anchors the xiuhpohualli')]);
    // An anchor names its day in its own cycle.
    const nameless = await check({ 'entities/day-anchor.yaml': entity('test/day-anchor', 'event/epoch', `claims:\n  calendar: { prop: calendar, value: tonalpohualli, ${cite} }\n  date: { prop: date, value: 13 August 1521 CE, ${cite} }\n`) });
    expect(errors(nameless).map((i) => i.message)).toEqual([expect.stringContaining('needs a day_name claim that names its day')]);
  });

  it('holds beside the date the other side gives, and does not compete with it', async () => {
    const w = await world({ ...anchors, 'entities/fall.yaml': entity('test/fall', 'event/conquest', `claims:\n  date: { prop: date, value: 13 August 1521 CE, ${cite} }\n  date-mexica: { prop: date, value: 1 Coatl in the year 3 Calli, ${cite} }\n`) });
    // Two date claims, no rank, and no error: the one in cycles narrows the other, it is not a choice.
    expect(said((await validateWorld(w, { frames: false })).issues)).toEqual([]);
    expect(claimGroup(w, 'test/fall', 'date')!.claims.map((c) => c.key)).toEqual(['date']);
    expect([...scenariosOf(w)].filter((s) => s.picks?.length)).toEqual([]);
    expect(days(w, 'test/fall|date')).toBe('13 August 1521 CE');
    expect(resolveCycle(w, w.entity.get('test/fall')!.claims[1])!.days.map(dayText)).toEqual(['13 August 1521 CE']);
  });

  it('dates what the other side does not, within the span the rest of the evidence gives', async () => {
    const w = await world({
      ...anchors,
      'entities/war.yaml': lasting('test/war', 'event/war', '22 April 1519 CE', '13 August 1521 CE'),
      // Dated only in cycles: in the war, the one day 1 Coatl of the year 2 Tecpatl that falls after the year began.
      'entities/raid.yaml': entity('test/raid', 'event/battle', `claims:\n  date: { prop: date, value: 1 Coatl in the year 2 Tecpatl, ${cite} }\nrelations:\n  war: { rel: part-of, to: test/war, ${cite} }\n`),
    });
    const issues = (await validateWorld(w, { frames: false })).issues;
    expect(said(issues)).toEqual([]);
    // Two days of that name lie in the war: the evidence does not say which, and the validator notes it.
    expect(days(w, 'test/raid|date')).toBe('11 March 1520 CE to 26 November 1520 CE');
    expect(issues.filter((i) => i.level === 'info').map((i) => i.message)).toContain('"1 Coatl in the year 2 Tecpatl" names 2 days that the rest of the evidence allows test/raid: 11 March 1520 CE, 26 November 1520 CE');
  });

  it('says so where nothing else dates the thing closely enough to name one day', async () => {
    const issues = await check({ ...anchors, 'entities/omen.yaml': entity('test/omen', 'event/political', `claims:\n  date: { prop: date, value: 1 Coatl, ${cite} }\n`) });
    expect(said(issues)).toEqual([expect.stringContaining('warning: test/omen is not dated closely enough by anything else for "1 Coatl" to name one day')]);
  });

  it('holds two sides’ dates for one event against each other: where they disagree, the world does not hold', async () => {
    // A native date one day off the Spanish one, as a day of the same name a day later would be.
    const issues = await check({ ...anchors, 'entities/entry.yaml': entity('test/entry', 'event/political', `claims:\n  date: { prop: date, value: 8 November 1519 CE, ${cite} }\n  date-mexica: { prop: date, value: 8 Ehecatl in the year 1 Acatl, ${cite} }\n`) });
    const e = errors(issues);
    expect(e).toHaveLength(1);
    // The day held at its middle: two days that touch at midnight would otherwise share an instant, and agree.
    expect(e[0].message).toContain('test/entry (date) between 8 November 1519 CE and 9 November 1519 CE');
    expect(e[0].message).toContain('test/entry (date) = 9 November 1519 CE (the nearest day of that name)');
  });

  const correlations = {
    'entities/day-anchor.yaml': dayAnchor(`  caso: { prop: date, value: 13 August 1521 CE, rank: preferred, note: The default, ${cite} }\n  later: { prop: date, value: 14 August 1521 CE, ${cite} }\n`),
    'entities/year-anchor.yaml': anchors['entities/year-anchor.yaml'],
  };

  it('follows the correlation chosen: what only a native date dates moves with it', async () => {
    const w = await world({
      ...correlations,
      'entities/raid.yaml': entity('test/raid', 'event/battle', `claims:\n  date: { prop: date, value: 1 Coatl in the year 3 Calli, ${cite} }\n  later: { prop: later_than, value: 1 January 1521 CE, ${cite} }\n  earlier: { prop: earlier_than, value: 1 January 1522 CE, ${cite} }\n`),
    });
    expect(said((await validateWorld(w, { frames: false })).issues)).toEqual([]);
    expect(cycleAnchor(w, 'tonalpohualli')).toEqual({ jdn: jdn('13 August 1521 CE'), place: 104 });
    const later = solveVariants(w).find((v) => v.scenario.picks?.includes('test/day-anchor#later'))!;
    expect(days(w, 'test/raid|date')).toBe('13 August 1521 CE');
    expect(days(w, 'test/raid|date', later.solution)).toBe('14 August 1521 CE');
  });

  it('bears on the correlation: a correlation that a double date contradicts is said to contradict the world', async () => {
    // Evidence ran only from a zero day to the dates written from it (docs/slices/TWELFTH-SLICE.md, Limitations).
    // A thing dated by both sides holds the two calendars to each other, and so tests each correlation.
    const w = await world({ ...correlations, 'entities/fall.yaml': entity('test/fall', 'event/conquest', `claims:\n  date: { prop: date, value: 13 August 1521 CE, ${cite} }\n  date-mexica: { prop: date, value: 1 Coatl in the year 3 Calli, ${cite} }\n`) });
    const later = solveVariants(w).find((v) => v.scenario.picks?.includes('test/day-anchor#later'))!;
    expect(later.solution.ok).toBe(false);
    const issues = (await validateWorld(w, { frames: false })).issues;
    expect(issues.filter((i) => i.level === 'warning').map((i) => [i.where, i.message.split(':')[0]])).toEqual([
      ['claims.later', 'this competing "date" claim (rank normal) contradicts the rest of the world in the default picture'],
    ]);
  });

  it('is copied from the source as it stands: a quote that names none of its signs is a warning', async () => {
    const quoted = (value: string) => entity('test/fall', 'event/conquest', `claims:\n  date: { prop: date, value: 13 August 1521 CE, ${cite} }\n  date-mexica: { prop: date, value: ${value}, source: { ref: src:test/report, loc: f. 81r, quote: "in ipan ce coatl, in xiuitl ei calli" } }\n`);
    expect(said(await check({ ...anchors, 'entities/fall.yaml': quoted('1 Coatl in the year 3 Calli') }))).toEqual([]);
    expect(said(await check({ ...anchors, 'entities/fall.yaml': quoted('1 Coatl in the year 3 Tochtli') }))).toEqual([
      'warning: none of its quotes names Tochtli: a day named in cycles is copied from the source as it stands',
      expect.stringContaining('error: in the default picture, these constraints cannot all hold'),
    ]);
  });

  it('dates a moment, a start or an end, and nothing else', async () => {
    const issues = await check({ ...anchors, 'entities/omen.yaml': entity('test/omen', 'event/political', `claims:\n  date: { prop: date, value: 13 August 1521 CE, ${cite} }\n  before: { prop: earlier_than, value: 1 Coatl, ${cite} }\n`) });
    expect(errors(issues).map((i) => i.message)).toEqual([expect.stringContaining('"earlier_than" cannot take one')]);
  });
});

describe('who held a perspective, and when', () => {
  const group = `id: alt:test/accounts\ntype: group\ntitle: Whose account\nshow: [alt:test/accounts/told-later, alt:test/accounts/a-reading]\ndefault: null\n`;
  const member = (id: string, kind: string) => `id: alt:test/accounts/${id}\ntype: alternative\nkind: ${kind}\ngroup: alt:test/accounts\ntitle: ${id}\n`;
  const files = {
    'alternatives/accounts.yaml': group,
    'alternatives/accounts/told-later.yaml': member('told-later', 'perspective'),
    'alternatives/accounts/a-reading.yaml': member('a-reading', 'reading'),
  };
  const town = (relations: string) => lasting('test/town', 'polity', '1337 CE', '1900 CE', `relations:\n${relations}`);

  it('is a relation of the holder, sourced and spanned like any, that binds no dates', async () => {
    const w = await world({ ...files, 'entities/town.yaml': town(`  told: { rel: holds, to: alt:test/accounts/told-later, valid: { lo: 1550 CE, hi: 1555 CE }, ${cite} }\n`) });
    expect(said((await validateWorld(w, { frames: false })).issues)).toEqual([]);
    // It names a picture, not a record of the world: nothing in the network comes of it.
    const sol = solveScenario(w);
    expect(sol.ok && [...sol.bounds.keys()].some((p) => p.includes('#told'))).toBe(false);
  });

  it('names a perspective, and holds in every picture', async () => {
    const reading = await check({ ...files, 'entities/town.yaml': town(`  told: { rel: holds, to: alt:test/accounts/a-reading, ${cite} }\n`) });
    expect(errors(reading).map((i) => i.message)).toEqual([expect.stringContaining('"holds" points to an alternative of kind perspective')]);
    const inside = await check({ ...files, 'entities/town.yaml': town(`  told: { rel: holds, to: alt:test/accounts/told-later, alt: alt:test/accounts/told-later, ${cite} }\n`) });
    expect(errors(inside).map((i) => i.message)).toEqual([expect.stringContaining('who held a perspective is so in every picture')]);
  });
});

describe('when a source was written, against what it tells of', () => {
  const at = parsePoint('13 August 1521 CE').t + 0.5 / 365;
  it('says how long after: weeks, months or years, and a range for a text written over years', () => {
    expect(writtenAfter('15 May 1522 CE', at)).toBe('written 9 months after');
    expect(writtenAfter('1568 CE', at)).toBe('written 47 years after');
    expect(writtenAfter({ lo: '1555 CE', hi: '1577 CE' }, at)).toBe('written 33 to 56 years after');
    expect(writtenAfter('20 August 1521 CE', at)).toBe('written weeks after');
    // Cortés's letter of 30 October 1520, of the entry of 8 November 1519: a year, not "12 months".
    expect(writtenAfter('30 October 1520 CE', parsePoint('8 November 1519 CE').t)).toBe('written 1 year after');
  });
  it('says so of a text written before, or while it went on, and nothing where it cannot', () => {
    expect(writtenAfter('1500 CE', at)).toBe('written 21 years before');
    expect(writtenAfter({ lo: '1519 CE', hi: '1556 CE' }, at)).toBe('written at the time');
    expect(writtenAfter(undefined, at)).toBeUndefined();
    expect(writtenAfter('1568 CE', parsePoint('66 Ma').t)).toBeUndefined();
  });
});

describe('allegiance, alliances, massacres and companies', () => {
  const polity = (id: string, more = '') => lasting(id, 'polity', '1300 CE', '1600 CE', more);
  it('holds a subject to its lord for the span it was one, and not for its whole life', async () => {
    const issues = await check({
      'entities/lord.yaml': polity('test/lord'),
      'entities/town.yaml': polity('test/town', `relations:\n  tribute: { rel: subject-to, to: test/lord, valid: { lo: 1473 CE, hi: 1521 CE }, ${cite} }\n`),
    });
    expect(said(issues)).toEqual([]);
    // A span outside the lord's lifetime does not hold.
    const late = await check({
      'entities/lord.yaml': polity('test/lord'),
      'entities/town.yaml': polity('test/town', `relations:\n  tribute: { rel: subject-to, to: test/lord, valid: { lo: 1473 CE, hi: 1650 CE }, ${cite} }\n`),
    });
    expect(errors(late).map((i) => i.message)).toEqual([expect.stringContaining('cannot all hold')]);
  });
  it('knows an alliance as a polity with members, a massacre as a moment, and a company as an organization', async () => {
    const issues = await check({
      'entities/league.yaml': lasting('test/league', 'polity/alliance', '1428 CE', '1521 CE'),
      'entities/city.yaml': polity('test/city', `relations:\n  member: { rel: member-of, to: test/league, valid: { lo: 1428 CE }, ${cite} }\n`),
      'entities/killing.yaml': entity('test/killing', 'event/massacre', `claims:\n  date: { prop: date, value: May 1520 CE, ${cite} }\n`),
      'entities/company.yaml': lasting('test/company', 'organization', '10 February 1519 CE', undefined, `relations:\n  crown: { rel: subject-to, to: test/city, ${cite} }\n`),
    });
    expect(said(issues)).toEqual([]);
    const moment = await check({ 'entities/killing.yaml': entity('test/killing', 'event/massacre', `claims:\n  start: { prop: start, value: May 1520 CE, ${cite} }\n`) });
    expect(errors(moment).map((i) => i.message)).toEqual([expect.stringContaining('"start" does not apply to an event/massacre')]);
  });
});
