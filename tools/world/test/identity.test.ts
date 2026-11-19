// Identity over time (docs/slices/TWELFTH-SLICE.md): lineage between records, relations that hold for a span,
// wars that last and have parts, and dates in a count of days whose zero day is a claim. Each test is one of
// the hard cases, on a small world written for it; the first of each pair is what the engine could not say.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dayNumberAt, dayOnAxis, formatTime, formatTimeValue, parseTime, TimeError } from '../../../core/time.ts';
import { countDays, inTurn, relationsIn, rivalsIn, scenariosOf, solveScenario, solveVariants, spanOf } from '../src/chronology.ts';
import { identityOf, lineageOf, lineageText } from '../src/lineage.ts';
import { validateWorld, type Issue } from '../src/validate/index.ts';
import { loadWorld, type World } from '../src/world.ts';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const SOURCE = `id: src:test/report\ntype: publication\nkind: measurement\ncitation: A fixture source, not a real publication.\n`;
const cite = `source: { ref: src:test/report, loc: p. 1 }`;

/** A world of a source plus the given files. */
async function world(files: Record<string, string>): Promise<World> {
  const root = mkdtempSync(join(tmpdir(), 'wikiworldmodel-identity-'));
  dirs.push(root);
  for (const [path, text] of Object.entries({ 'sources/report.yaml': SOURCE, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorld(root);
}

const check = async (files: Record<string, string>): Promise<Issue[]> => (await validateWorld(await world(files), { frames: false })).issues;
const errors = (issues: Issue[]) => issues.filter((i) => i.level === 'error');

/** An entity file: its kind, then phases, claims and relations as YAML. */
const entity = (id: string, kind: string, body: string) => `id: ${id}\nkind: ${kind}\nauthor: fixture\n${body}`;
/** A lasting record with a start and, if given, an end. */
const lasting = (id: string, kind: string, start: string, end?: string, more = '') =>
  entity(id, kind, `claims:\n  start: { prop: start, value: ${start}, ${cite} }\n${end ? `  end: { prop: end, value: ${end}, ${cite} }\n` : ''}${more}`);
const polity = (id: string, start: string, end?: string, more = '') => lasting(id, 'polity', start, end, more);

/** The day a point of the solved default picture falls on, or the days its bounds run from and to. */
function days(w: World, point: string, s = solveScenario(w)): string {
  if (!s.ok) throw new Error('the world does not hold');
  const b = s.bounds.get(point)!;
  const lo = formatTime(b.lo, 1 / 365);
  const hi = formatTime(b.hi - 1e-6, 1 / 365);
  return lo === hi ? lo : `${lo} to ${hi}`;
}

describe('days by number', () => {
  it('reads a Julian Day Number as that day, across the reform of 1582 without a gap', () => {
    expect(formatTimeValue(parseTime('JDN 584283'))).toBe('6 September 3114 BCE');
    expect(formatTimeValue(parseTime('JDN 2299160'))).toBe('4 October 1582 CE');
    expect(formatTimeValue(parseTime('JDN 2299161'))).toBe('15 October 1582 CE');
    // 1 January 2000 at noon is JD 2451545.0.
    expect(formatTimeValue(parseTime('JDN 2451545'))).toBe('1 January 2000 CE');
  });

  it('counts days on the calendar, day for day: a day number and its place on the axis go back and forth', () => {
    for (const j of [0, 584283, 1721424, 1970761, 2299160, 2299161, 2451545, 2460000]) {
      const day = dayOnAxis(j);
      expect(dayNumberAt(day.t)).toBe(j);
      expect(dayNumberAt(day.t + day.whole / 2)).toBe(j);
      expect(dayOnAxis(j + 1).t).toBeCloseTo(day.t + day.whole, 9);
    }
  });
});

describe('a date in a count of days', () => {
  it('reads the Long Count in its five places, and refuses what is not one', () => {
    // 9 b'ak'tun, 12 k'atun, 11 tun, 5 winal, 18 k'in.
    expect(parseTime('9.12.11.5.18 Long Count')).toEqual({ kind: 'count', calendar: 'long-count', days: 9 * 144000 + 12 * 7200 + 11 * 360 + 5 * 20 + 18, text: '9.12.11.5.18 Long Count' });
    expect(parseTime('13.0.0.0.0 Long Count')).toMatchObject({ days: 1872000 });
    expect(formatTimeValue(parseTime('9.12.11.5.18 Long Count'))).toBe('9.12.11.5.18 Long Count');
    expect(() => parseTime('9.12.11.5 Long Count')).toThrow(TimeError);
    expect(() => parseTime('9.12.11.18.18 Long Count')).toThrow(/place 4 .* counts to 17/);
    expect(() => parseTime({ lo: '9.12.11.5.18 Long Count', hi: '700 CE' } as never)).toThrow(/stands alone/);
  });

  const zero = (dates: string) => entity('test/zero', 'event/epoch', `claims:\n  calendar: { prop: calendar, value: long-count, ${cite} }\n${dates}`);
  const death = entity('test/death', 'event/political', `claims:\n  date: { prop: date, value: 9.12.11.5.18 Long Count, ${cite} }\n`);
  const birth = entity('test/birth', 'event/political', `claims:\n  date: { prop: date, value: 9.8.9.13.0 Long Count, ${cite} }\n`);

  it('cannot be placed until the world says which day the count starts from', async () => {
    const issues = await check({ 'entities/death.yaml': death });
    expect(errors(issues).map((i) => i.message)).toEqual([expect.stringContaining('no record is the zero day of the Long Count')]);
  });

  it('is that many days after the zero day, to the day', async () => {
    const w = await world({ 'entities/zero.yaml': zero(`  date: { prop: date, value: JDN 584283, ${cite} }\n`), 'entities/death.yaml': death, 'entities/birth.yaml': birth });
    expect(errors((await validateWorld(w, { frames: false })).issues)).toEqual([]);
    // 584283 + 1,386,478 = JDN 1970761, which is 26 August 683 in the Julian calendar.
    expect(days(w, 'test/death|date')).toBe('26 August 683 CE');
    expect(days(w, 'test/birth|date')).toBe('21 March 603 CE');
    expect(countDays(w, { calendar: 'long-count', days: 0 })).toEqual([dayOnAxis(584283).t, dayOnAxis(584284).t]);
  });

  it('follows the correlation chosen: every date in the count moves with a competing date of the zero day', async () => {
    const w = await world({
      'entities/zero.yaml': zero(`  gmt: { prop: date, value: JDN 584283, rank: preferred, note: The default, ${cite} }\n  lounsbury: { prop: date, value: JDN 584285, ${cite} }\n`),
      'entities/death.yaml': death,
      'entities/birth.yaml': birth,
    });
    expect(errors((await validateWorld(w, { frames: false })).issues)).toEqual([]);
    const variants = solveVariants(w);
    const picked = variants.find((v) => v.scenario.picks?.includes('test/zero#lounsbury'))!;
    expect(picked.solution.ok).toBe(true);
    expect(days(w, 'test/death|date', variants[0].solution)).toBe('26 August 683 CE');
    expect(days(w, 'test/death|date', picked.solution)).toBe('28 August 683 CE');
    expect(days(w, 'test/birth|date', picked.solution)).toBe('23 March 603 CE');
    expect(days(w, 'test/zero|date', picked.solution)).toBe('8 September 3114 BCE');
  });

  it('counts across the change of calendar in 1582, and a lag in days from a dated day counts the same', async () => {
    // 13.0.0.0.0, the end of the thirteenth b'ak'tun: 584283 + 1,872,000 = JDN 2456283, 21 December 2012.
    const w = await world({
      'entities/zero.yaml': zero(`  date: { prop: date, value: JDN 584283, ${cite} }\n`),
      'entities/turn.yaml': entity('test/turn', 'event/political', `claims:\n  date: { prop: date, value: 13.0.0.0.0 Long Count, ${cite} }\n`),
      'entities/lag.yaml': entity('test/lag', 'event/political', `claims:\n  date: { prop: date, value: { ref: test/zero, edge: start, lag: 1872000 days }, ${cite} }\n`),
      'entities/loose.yaml': entity('test/loose', 'event/political', `claims:\n  date: { prop: date, value: { ref: test/vague, edge: start, lag: 1872000 days }, ${cite} }\n`),
      'entities/vague.yaml': entity('test/vague', 'event/political', `claims:\n  date: { prop: date, value: 3114 BCE, ${cite} }\n`),
    });
    expect(days(w, 'test/turn|date')).toBe('21 December 2012 CE');
    // The same count written as a lag in days from the day is counted on the calendar too (docs/slices/FIFTEENTH-SLICE.md):
    // carried as years of 365.25 days, as it was, it landed days away.
    expect(days(w, 'test/lag|date')).toBe('21 December 2012 CE');
    // From a thing dated only to its year there is no day to count from, and the lag is carried in years.
    expect(days(w, 'test/loose|date')).toMatch(/2012 CE to .* 2013 CE/);
  });

  it('dates the era before the zero day from its end, where an unmarked date would land thirteen b’ak’tuns late', async () => {
    // The inscriptions write the zero day as 13.0.0.0.0, the end of the era before it.
    expect(parseTime('13.0.0.0.0 Long Count of the era before')).toMatchObject({ kind: 'count', days: 0 });
    expect(parseTime('12.19.13.4.0 Long Count of the era before')).toMatchObject({ days: -2440, text: '12.19.13.4.0 Long Count of the era before' });
    expect(() => parseTime('13.0.0.0.1 Long Count of the era before')).toThrow(/ended on 13.0.0.0.0/);
    const w = await world({
      'entities/zero.yaml': zero(`  date: { prop: date, value: JDN 584283, ${cite} }\n`),
      'entities/myth.yaml': entity('test/myth', 'event/political', `claims:\n  date: { prop: date, value: 12.19.13.4.0 Long Count of the era before, ${cite} }\n`),
      'entities/late.yaml': entity('test/late', 'event/political', `claims:\n  date: { prop: date, value: 12.19.13.4.0 Long Count, ${cite} }\n`),
    });
    expect(errors((await validateWorld(w, { frames: false })).issues)).toEqual([]);
    // 2,440 days before 6 September 3114 BCE: six years back is 2,191 days, with one leap day (3117 BCE), and 6 September
    // is the 249th day of 3120 BCE. Unmarked, the same places are a day of 2006.
    expect(days(w, 'test/myth|date')).toBe('31 December 3121 BCE');
    expect(days(w, 'test/late|date')).toBe('17 April 2006 CE');
  });

  it('is copied from the source as it stands: a quote that does not have it is a warning', async () => {
    const quoted = (value: string) => entity('test/birth', 'event/political', `claims:\n  date: { prop: date, value: ${value}, source: { ref: src:test/report, loc: p. 2, quote: "his birthdate was 9.8.9.13.0 8 Ahau 13 Pop" } }\n`);
    const z = { 'entities/zero.yaml': zero(`  date: { prop: date, value: JDN 584283, ${cite} }\n`) };
    expect(await check({ ...z, 'entities/birth.yaml': quoted('9.8.9.13.0 Long Count') })).toEqual([]);
    // Two places exchanged, as one page of the source itself has it.
    const slip = await check({ ...z, 'entities/birth.yaml': quoted('9.9.8.13.0 Long Count') });
    expect(slip.map((i) => [i.level, i.message])).toEqual([['warning', 'none of its quotes has 9.9.8.13.0: a date in a count of days is copied from the source as it stands']]);
  });

  it('may bound the span of a relation, as an office held from one carved date to another', async () => {
    const w = await world({
      'entities/zero.yaml': zero(`  gmt: { prop: date, value: JDN 584283, rank: preferred, note: The default, ${cite} }\n  lounsbury: { prop: date, value: JDN 584285, ${cite} }\n`),
      'entities/city.yaml': polity('test/city', '400 CE', '800 CE'),
      'entities/lord.yaml': entity('test/lord', 'person', `claims:\n  start: { prop: start, value: 9.8.9.13.0 Long Count, ${cite} }\n  end: { prop: end, value: 9.12.11.5.18 Long Count, ${cite} }\nrelations:\n  office: { rel: held-office, to: test/city, valid: { lo: 9.9.2.4.8 Long Count, hi: 9.12.11.5.18 Long Count }, ${cite} }\n`),
    });
    expect(errors((await validateWorld(w, { frames: false })).issues)).toEqual([]);
    expect(days(w, 'test/lord#office|start')).toBe('24 July 615 CE');
    // The span moves with the correlation, as the dates do.
    const picked = solveVariants(w).find((v) => v.scenario.picks?.includes('test/zero#lounsbury'))!;
    expect(days(w, 'test/lord#office|start', picked.solution)).toBe('26 July 615 CE');
    // A span that begins before the life does is still a contradiction.
    const early = await check({
      'entities/zero.yaml': zero(`  date: { prop: date, value: JDN 584283, ${cite} }\n`),
      'entities/city.yaml': polity('test/city', '400 CE', '800 CE'),
      'entities/lord.yaml': entity('test/lord', 'person', `claims:\n  start: { prop: start, value: 9.8.9.13.0 Long Count, ${cite} }\nrelations:\n  office: { rel: held-office, to: test/city, valid: { lo: 9.8.0.0.0 Long Count }, ${cite} }\n`),
    });
    expect(errors(early).map((i) => i.check)).toEqual(['chronology']);
  });

  it('wants its zero day a day, not a range: a range would unfix the days between two dates', async () => {
    const issues = await check({ 'entities/zero.yaml': zero(`  date: { prop: date, value: { lo: JDN 584280, hi: JDN 584285 }, ${cite} }\n`), 'entities/death.yaml': death });
    expect(issues.map((i) => [i.level, i.message.split(':')[0]])).toEqual([['warning', 'a zero day given as a range of days makes every date in the count a range of its own, and unfixes the days between them']]);
  });

  it('has one zero day', async () => {
    const issues = await check({
      'entities/a.yaml': zero(`  date: { prop: date, value: JDN 584283, ${cite} }\n`),
      'entities/b.yaml': zero(`  date: { prop: date, value: JDN 584285, ${cite} }\n`).replace('test/zero', 'test/zero-again'),
    });
    expect(errors(issues).map((i) => i.message)).toEqual([expect.stringContaining('both say they are the zero day of "long-count"')]);
  });
});

describe('a relation that holds for a span', () => {
  // A kingdom from 1806 to 1918, inside an empire that began in 1871.
  const empire = polity('test/empire', '1871 CE', '1918 CE');
  const kingdom = (rel: string) => polity('test/kingdom', '1806 CE', '1918 CE', `relations:\n  in: { rel: part-of, to: test/empire${rel}, ${cite} }\n`);

  it('without the span, a part must lie within its whole for its whole life: a kingdom older than its empire contradicts it', async () => {
    const issues = await check({ 'entities/empire.yaml': empire, 'entities/kingdom.yaml': kingdom('') });
    expect(errors(issues)).toHaveLength(1);
    expect(errors(issues)[0]).toMatchObject({ check: 'chronology' });
    expect(errors(issues)[0].message).toContain('entities/kingdom.yaml relations.in');
  });

  it('with it, only the span must lie within both', async () => {
    const w = await world({ 'entities/empire.yaml': empire, 'entities/kingdom.yaml': kingdom(', valid: { lo: 1871 CE, hi: 1918 CE }') });
    expect((await validateWorld(w, { frames: false })).issues).toEqual([]);
    expect(days(w, 'test/kingdom|start')).toBe('1 January 1806 CE to 31 December 1806 CE');
  });

  it('a span that reaches outside either lifetime is a contradiction, and says which relation', async () => {
    const issues = await check({ 'entities/empire.yaml': empire, 'entities/kingdom.yaml': kingdom(', valid: { lo: 1850 CE, hi: 1918 CE }') });
    expect(errors(issues)).toHaveLength(1);
    expect(errors(issues)[0].message).toContain('entities/kingdom.yaml relations.in');
    expect(errors(issues)[0].message).toContain('both were there while it held');
    // A conflict within history is told in days of the calendar, not in millions of years.
    expect(errors(issues)[0].message).toContain('test/empire (start) between 1 January 1871 CE and 1 January 1872 CE');
  });

  it('bounds what has no date of its own: a whole lasted at least as long as its part was part of it', async () => {
    const w = await world({ 'entities/empire.yaml': polity('test/empire', '1871 CE'), 'entities/kingdom.yaml': kingdom(', valid: { lo: 1871 CE, hi: 1918 CE }') });
    const s = solveScenario(w);
    expect(s.ok && s.bounds.get('test/empire|end')!.lo).toBe(1918);
  });

  it('reads a bound that names a year as some day of that year, not its first', async () => {
    // Founded in March 1938 and a member from 1938: the membership did not begin before the founding.
    const issues = await check({
      'entities/league.yaml': polity('test/league', '1920 CE', '1946 CE'),
      'entities/state.yaml': polity('test/state', '12 March 1938 CE', undefined, `relations:\n  in: { rel: member-of, to: test/league, valid: { lo: 1938 CE, hi: 1940 CE }, ${cite} }\n`),
    });
    expect(issues).toEqual([]);
  });

  it('reads one time as a time at which it held, and an open end as still holding', () => {
    expect(spanOf('1707 CE')).toEqual({ at: { t: 1707, whole: 1 } });
    expect(spanOf({ lo: '1922 CE' })).toEqual({ lo: { t: 1922, whole: 1 }, hi: undefined });
    expect(spanOf({ lo: '1991 CE', hi: '1922 CE' })).toBeUndefined();
    expect(spanOf({ mean: '1900 CE', sd: 5 })).toBeUndefined();
  });

  it('lets one person hold two offices at once, which phases cannot say', async () => {
    const kingdoms = { 'entities/north.yaml': polity('test/north', '843 CE', '1707 CE'), 'entities/south.yaml': polity('test/south', '927 CE', '1707 CE') };
    const king = (body: string) => entity('test/king', 'person', body);
    // As phases, the two reigns must follow one another, so a king of both from 1603 to 1625 cannot be written.
    const phases = await check({
      ...kingdoms,
      'entities/king.yaml': king(
        `phases:\n  - id: north\n  - id: south\nclaims:\n  start: { prop: start, value: 1566 CE, ${cite} }\n  n: { prop: start, subject: "@north", value: 1567 CE, ${cite} }\n  s: { prop: start, subject: "@south", value: 1603 CE, ${cite} }\n  ne: { prop: end, subject: "@north", value: 1625 CE, ${cite} }\n  end: { prop: end, value: 1625 CE, ${cite} }\nrelations:\n  o1: { rel: held-office, subject: "@north", to: test/north, ${cite} }\n  o2: { rel: held-office, subject: "@south", to: test/south, ${cite} }\n`,
      ),
    });
    expect(errors(phases).map((i) => i.check)).toEqual(['chronology']);
    // As two relations of the person, each with its span, he can.
    const spans = await check({
      ...kingdoms,
      'entities/king.yaml': king(
        `claims:\n  start: { prop: start, value: 1566 CE, ${cite} }\n  end: { prop: end, value: 27 March 1625 CE, ${cite} }\nrelations:\n  o1: { rel: held-office, to: test/north, valid: { lo: 24 July 1567 CE, hi: 27 March 1625 CE }, ${cite} }\n  o2: { rel: held-office, to: test/south, valid: { lo: 24 March 1603 CE, hi: 27 March 1625 CE }, ${cite} }\n`,
      ),
    });
    expect(spans).toEqual([]);
  });

  it('is only for relations that hold over a span, written as one', async () => {
    const issues = await check({
      'entities/a.yaml': polity('test/a', '1707 CE', undefined, `relations:\n  from: { rel: arose-from, to: test/b, valid: { lo: 1707 CE }, ${cite} }\n  in: { rel: part-of, to: test/b, valid: { mean: 1800 CE, sd: 5 }, ${cite} }\n`),
      'entities/b.yaml': polity('test/b', '927 CE'),
    });
    // (The schema refuses the second too, in its own words.)
    expect(errors(issues).filter((i) => i.check !== 'schema').map((i) => [i.where, i.message.split(':')[0]])).toEqual([
      ['relations.from.valid', '"arose-from" does not hold over a span, so it has no valid time'],
      ['relations.in.valid', 'when it holds is { lo, hi }, either left open, each a year, a month, a day or a point, or the start or end of another record ({ ref, edge }), lo no later than hi; or one time at which it held'],
    ]);
  });
});

describe('lineage', () => {
  it('a union: one state that arose from two, which ended as it began', async () => {
    const w = await world({
      'entities/south.yaml': polity('test/south', '927 CE', '{ ref: test/union, edge: start }'),
      'entities/north.yaml': polity('test/north', '843 CE', '{ ref: test/union, edge: start }'),
      'entities/union.yaml': polity('test/union', '1 May 1707 CE Julian', undefined, `relations:\n  a: { rel: arose-from, to: test/south, ${cite} }\n  b: { rel: arose-from, to: test/north, ${cite} }\n`),
    });
    expect((await validateWorld(w, { frames: false })).issues).toEqual([]);
    // The kingdoms' ends are not written twice: they follow the union's start. 1 May 1707 in the Julian calendar is 12 May.
    expect(days(w, 'test/south|end')).toBe('12 May 1707 CE');
    expect(days(w, 'test/north|end')).toBe('12 May 1707 CE');
  });

  it('a secession: what arose from a state that went on beside it', async () => {
    expect(await check({ 'entities/parent.yaml': polity('test/parent', '1801 CE'), 'entities/child.yaml': polity('test/child', '6 December 1922 CE', undefined, `relations:\n  a: { rel: arose-from, to: test/parent, ${cite} }\n`) })).toEqual([]);
  });

  it('nothing arises from what was not yet there', async () => {
    const issues = await check({ 'entities/parent.yaml': polity('test/parent', '1801 CE'), 'entities/child.yaml': polity('test/child', '1700 CE', undefined, `relations:\n  a: { rel: arose-from, to: test/parent, ${cite} }\n`) });
    expect(errors(issues)).toHaveLength(1);
    expect(errors(issues)[0].message).toContain('entities/child.yaml relations.a');
  });

  it('a successor began no earlier than what it replaced began, and outlasted it', async () => {
    const old = polity('test/old', '1299 CE', '1453 CE');
    expect(await check({ 'entities/old.yaml': old, 'entities/new.yaml': polity('test/new', '1453 CE', '1922 CE', `relations:\n  s: { rel: succeeds, to: test/old, ${cite} }\n`) })).toEqual([]);
    const early = await check({ 'entities/old.yaml': old, 'entities/new.yaml': polity('test/new', '1200 CE', '1922 CE', `relations:\n  s: { rel: succeeds, to: test/old, ${cite} }\n`) });
    expect(errors(early).map((i) => i.check)).toEqual(['chronology']);
    const brief = await check({ 'entities/old.yaml': old, 'entities/new.yaml': polity('test/new', '1400 CE', '1420 CE', `relations:\n  s: { rel: succeeds, to: test/old, ${cite} }\n`) });
    expect(errors(brief).map((i) => i.check)).toEqual(['chronology']);
    // What it replaced, if nothing dates its end, ended no later than the successor did.
    const w = await world({ 'entities/old.yaml': polity('test/old', '1299 CE'), 'entities/new.yaml': polity('test/new', '1453 CE', '1922 CE', `relations:\n  s: { rel: succeeds, to: test/old, ${cite} }\n`) });
    const s = solveScenario(w);
    expect(s.ok && s.bounds.get('test/old|end')!.hi).toBe(1923);
  });

  it('an accession: the state that took the other in may be the older or the younger, but was there and outlasted it', async () => {
    const joined = (start: string) => polity('test/east', start, '3 October 1990 CE', `relations:\n  m: { rel: merged-into, to: test/west, ${cite} }\n`);
    expect(await check({ 'entities/west.yaml': polity('test/west', '23 May 1949 CE'), 'entities/east.yaml': joined('7 October 1949 CE') })).toEqual([]);
    expect(await check({ 'entities/west.yaml': polity('test/west', '23 May 1949 CE'), 'entities/east.yaml': joined('1 January 1900 CE') })).toEqual([]);
    // A successor in the new-thing sense could not be older than what it replaced; an accession says something else.
    const asSuccessor = await check({ 'entities/west.yaml': polity('test/west', '23 May 1949 CE', undefined, `relations:\n  s: { rel: succeeds, to: test/east, ${cite} }\n`), 'entities/east.yaml': polity('test/east', '7 October 1949 CE', '3 October 1990 CE') });
    expect(errors(asSuccessor).map((i) => i.check)).toEqual(['chronology']);
    const gone = await check({ 'entities/west.yaml': polity('test/west', '23 May 1949 CE', '1 January 1980 CE'), 'entities/east.yaml': joined('7 October 1949 CE') });
    expect(errors(gone).map((i) => i.check)).toEqual(['chronology']);
    const notYet = await check({ 'entities/west.yaml': polity('test/west', '1 January 1995 CE'), 'entities/east.yaml': joined('7 October 1949 CE') });
    expect(errors(notYet).map((i) => i.check)).toEqual(['chronology']);
  });

  const ALT = {
    'alternatives/succession.yaml': `id: alt:succession\ntype: group\ntitle: Who carried the old empire on\nshow: [alt:succession/transfer]\ndefault: null\n`,
    'alternatives/succession/transfer.yaml': `id: alt:succession/transfer\ntype: alternative\nkind: perspective\ngroup: alt:succession\ntitle: The empire was transferred\n`,
  };

  it('a claim of identity that only one side makes holds only in that side’s picture', async () => {
    const w = await world({
      ...ALT,
      'entities/old.yaml': polity('test/old', '753 BCE', '1453 CE'),
      'entities/new.yaml': polity('test/new', '800 CE', '1806 CE', `relations:\n  c: { rel: continues, to: test/old, alt: alt:succession/transfer, ${cite} }\n`),
    });
    expect((await validateWorld(w, { frames: false })).issues).toEqual([]);
    expect(relationsIn(w, {}).map((r) => r.rel)).toEqual([]);
    expect(relationsIn(w, { alts: ['alt:succession/transfer'] }).map((r) => r.rel)).toEqual(['continues']);
  });

  it('and a picture that cannot hold is named as that picture’s, while the default stands', async () => {
    const issues = await check({
      ...ALT,
      'entities/old.yaml': polity('test/old', '753 BCE', '1453 CE'),
      // What carries a thing on outlasts it: one that ended first cannot have.
      'entities/new.yaml': polity('test/new', '800 CE', '1400 CE', `relations:\n  c: { rel: continues, to: test/old, alt: alt:succession/transfer, ${cite} }\n`),
    });
    expect(errors(issues)).toHaveLength(1);
    expect(errors(issues)[0].message).toMatch(/^with alt:succession\/transfer, these constraints cannot all hold/);
  });

  it('what carries a thing on may be the older of the two: a republic older than the union it was part of', async () => {
    expect(
      await check({
        'entities/union.yaml': polity('test/union', '30 December 1922 CE', '26 December 1991 CE'),
        'entities/republic.yaml': polity('test/republic', '7 November 1917 CE', undefined, `relations:\n  in: { rel: part-of, to: test/union, valid: { lo: 30 December 1922 CE, hi: 26 December 1991 CE }, ${cite} }\n  c: { rel: continues, to: test/union, ${cite} }\n`),
      }),
    ).toEqual([]);
  });

  it('a claim of identity that was given up is kept, set aside, and binds nothing', async () => {
    const w = await world({
      'entities/old.yaml': polity('test/old', '1945 CE', '1992 CE'),
      'entities/new.yaml': polity('test/new', '27 April 1992 CE', undefined, `relations:\n  a: { rel: arose-from, to: test/old, ${cite} }\n  c: { rel: continues, to: test/old, rank: deprecated, note: Given up in 2000., ${cite} }\n`),
    });
    expect((await validateWorld(w, { frames: false })).issues).toEqual([]);
    expect(relationsIn(w, {}).map((r) => r.rel)).toEqual(['arose-from']);
  });
});

describe('a span that ends where another record does', () => {
  const king = (death: string, valid: string) =>
    entity('test/king', 'person', `claims:\n  start: { prop: start, value: 19 June 1566 CE, ${cite} }\n${death}relations:\n  o: { rel: held-office, to: test/realm, valid: ${valid}, ${cite} }\n`);
  const realm = { 'entities/realm.yaml': polity('test/realm', '843 CE', '1707 CE') };

  it('"until his death" is his death, whichever date of it is chosen, and is not written twice', async () => {
    const w = await world({
      ...realm,
      'entities/king.yaml': king(
        `  end-a: { prop: end, value: 27 March 1625 CE Julian, rank: preferred, note: The better source., ${cite} }\n  end-b: { prop: end, value: 5 March 1625 CE Julian, ${cite} }\n`,
        '{ lo: 24 July 1567 CE, hi: { ref: test/king, edge: end } }',
      ),
    });
    expect((await validateWorld(w, { frames: false })).issues).toEqual([]);
    // 27 March 1625 in the Julian calendar is 6 April in the Gregorian.
    expect(days(w, 'test/king#o|end')).toBe('6 April 1625 CE');
    const other = solveVariants(w).find((v) => v.scenario.picks?.includes('test/king#end-b'))!;
    expect(days(w, 'test/king#o|end', other.solution)).toBe('15 March 1625 CE');
  });

  it('with the date copied instead, a competing date of the death contradicts the reign', async () => {
    const issues = await check({
      ...realm,
      'entities/king.yaml': king(
        `  end-a: { prop: end, value: 27 March 1625 CE Julian, rank: preferred, note: The better source., ${cite} }\n  end-b: { prop: end, value: 5 March 1625 CE Julian, ${cite} }\n`,
        '{ lo: 24 July 1567 CE, hi: 27 March 1625 CE Julian }',
      ),
    });
    expect(issues.map((i) => [i.level, i.where])).toEqual([['warning', 'claims.end-b']]);
    // From the end of 5 March to the start of 27 March.
    expect(issues[0].message).toContain('together they are 21 days short');
    expect(issues[0].message).toContain('test/king (end) between 15 March 1625 CE and 16 March 1625 CE');
  });

  it('a membership "until it ended" follows the whole’s end, and a local phase may be named', async () => {
    const w = await world({
      'entities/union.yaml': polity('test/union', '30 December 1922 CE', '26 December 1991 CE'),
      'entities/republic.yaml': entity(
        'test/republic',
        'polity',
        `phases:\n  - id: soviet\n  - id: after\nclaims:\n  start: { prop: start, value: 7 November 1917 CE, ${cite} }\n  s: { prop: end, subject: "@soviet", value: 25 December 1991 CE, ${cite} }\nrelations:\n  in: { rel: part-of, to: test/union, valid: { lo: { ref: test/union, edge: start }, hi: { ref: test/union, edge: end } }, ${cite} }\n  phase: { rel: member-of, to: test/union, valid: { lo: 1924 CE, hi: { ref: "@soviet", edge: end } }, ${cite} }\n`,
      ),
    });
    expect((await validateWorld(w, { frames: false })).issues).toEqual([]);
    expect([days(w, 'test/republic#in|start'), days(w, 'test/republic#in|end')]).toEqual(['30 December 1922 CE', '26 December 1991 CE']);
    expect(days(w, 'test/republic#phase|end')).toBe('25 December 1991 CE');
  });

  it('names a record that exists, by its start or its end', async () => {
    const issues = await check({ ...realm, 'entities/king.yaml': king('', '{ lo: 1567 CE, hi: { ref: test/realm } }') });
    expect(errors(issues).filter((i) => i.check !== 'schema').map((i) => [i.where, i.message.slice(0, 16)])).toEqual([['relations.o.valid', 'when it holds is']]);
    const wanted = await check({ ...realm, 'entities/king.yaml': king('', '{ lo: 1567 CE, hi: { ref: test/nobody, edge: end } }') });
    expect(wanted.map((i) => [i.level, i.check])).toEqual([['info', 'wanted']]);
  });
});

describe('what denies a claim', () => {
  it('is cited apart from what speaks for it, and both must name works of the world', async () => {
    const w = await world({
      'sources/refusal.yaml': `id: src:test/refusal\ntype: document\nkind: act\ncitation: A fixture resolution, not a real document.\n`,
      'entities/old.yaml': polity('test/old', '1945 CE', '1992 CE'),
      'entities/new.yaml': polity(
        'test/new',
        '27 April 1992 CE',
        undefined,
        `relations:\n  c:\n    rel: continues\n    to: test/old\n    rank: deprecated\n    source: { ref: src:test/report, loc: p. 1, quote: "continuing the State" }\n    against:\n      - { ref: src:test/refusal, loc: para. 1, quote: "cannot continue automatically" }\n    note: Asserted in 1992, refused, and given up in 2000.\n`,
      ),
    });
    expect((await validateWorld(w, { frames: false })).issues).toEqual([]);
    const r = w.entity.get('test/new')!.relations[0];
    expect([r.sources.map((x) => x.ref), r.against.map((x) => x.ref)]).toEqual([['src:test/report'], ['src:test/refusal']]);
    const unknown = await check({ 'entities/a.yaml': polity('test/a', '1 CE', undefined, '').replace(`, ${cite} }`, `, ${cite}, against: { ref: src:test/nowhere, loc: p. 2 } }`) });
    expect(unknown.map((i) => [i.level, i.check, i.message.split(' is wanted')[0]])).toEqual([['info', 'wanted', 'src:test/nowhere']]);
  });
});

describe('a bound on an end', () => {
  it('holds beside the end’s date in every picture, where a competing end would be one reading among others', async () => {
    const state = (more: string) =>
      entity('test/state', 'polity', `claims:\n  start: { prop: start, value: 1945 CE, ${cite} }\n  end-span: { prop: end, value: { lo: 29 November 1991 CE, hi: 4 July 1992 CE }, rank: preferred, note: The commission's span., ${cite} }\n  end-late: { prop: end, value: 1 December 1992 CE, ${cite} }\n${more}`);
    // As a bound, the resolution that says the state has ceased to exist rules out the later reading.
    const bounded = await check({ 'entities/state.yaml': state(`  gone: { prop: end_before, value: 19 September 1992 CE, ${cite} }\n`) });
    expect(bounded.map((i) => [i.level, i.where])).toEqual([['warning', 'claims.end-late']]);
    expect(await check({ 'entities/state.yaml': state('') })).toEqual([]);
    const w = await world({ 'entities/state.yaml': entity('test/state', 'polity', `claims:\n  start: { prop: start, value: 1945 CE, ${cite} }\n  gone: { prop: end_before, value: 19 September 1992 CE, ${cite} }\n`) });
    const s = solveScenario(w);
    expect(s.ok && formatTime(s.bounds.get('test/state|end')!.hi - 1e-6, 1 / 365)).toBe('19 September 1992 CE');
  });
});

describe('names in turn', () => {
  const named = (names: string) => entity('test/state', 'polity', `claims:\n  start: { prop: start, value: 1917 CE, ${cite} }\n${names}`);
  it('do not compete: each holds for its own span, and none need be preferred', async () => {
    expect(
      await check({
        'entities/state.yaml': named(
          `  n1: { prop: official_name, value: { en: First Republic }, valid: { lo: 1918 CE, hi: 21 January 1937 CE }, ${cite} }\n  n2: { prop: official_name, value: { en: Second Republic }, valid: { lo: 21 January 1937 CE, hi: 25 December 1991 CE }, ${cite} }\n  n3: { prop: official_name, value: { en: Federation }, valid: { lo: 25 December 1991 CE }, ${cite} }\n`,
        ),
      }),
    ).toEqual([]);
  });
  it('but two that hold at once do', async () => {
    const issues = await check({
      'entities/state.yaml': named(`  n1: { prop: official_name, value: { en: First Republic }, valid: { lo: 1918 CE, hi: 1940 CE }, ${cite} }\n  n2: { prop: official_name, value: { en: Second Republic }, valid: { lo: 1937 CE }, ${cite} }\n`),
    });
    expect(errors(issues).map((i) => i.check)).toEqual(['ranks']);
  });
  it('are told from claims that compete by their spans alone: a name with no span, or one whose span names a record, has no turn', () => {
    const first = { valid: { lo: '1918 CE', hi: '21 January 1937 CE' } };
    const second = { valid: { lo: '21 January 1937 CE', hi: '25 December 1991 CE' } };
    const third = { valid: { lo: '25 December 1991 CE' } };
    expect(inTurn([first, second, third])).toBe(true);
    // The order they are written in does not matter, and one claim alone has nobody to take turns with.
    expect(inTurn([third, first, second])).toBe(true);
    expect(inTurn([first])).toBe(false);
    expect(inTurn([first, { valid: { lo: '1930 CE' } }])).toBe(false);
    expect(inTurn([first, {}])).toBe(false);
    // A span that ends where a record does is placed only by the solver, so such names are still ranked.
    expect(inTurn([first, { valid: { lo: { ref: 'test/state@second', edge: 'start' } } }])).toBe(false);
  });
});

describe('rival readings', () => {
  const script = (id: string, start: string, more = '') => lasting(id, 'development/script', start, undefined, more);
  const parents = { 'entities/a.yaml': script('test/a', '1050 BCE'), 'entities/b.yaml': script('test/b', '1500 BCE') };

  it('two relations of a kind both hold, as a union’s two parents do, unless one is preferred: then the other is a rival', async () => {
    const union = await world({ ...parents, 'entities/child.yaml': script('test/child', '800 BCE', `relations:\n  a: { rel: arose-from, to: test/a, ${cite} }\n  b: { rel: arose-from, to: test/b, ${cite} }\n`) });
    expect(relationsIn(union, {}).map((r) => r.key)).toEqual(['a', 'b']);
    expect(rivalsIn(union)).toEqual([]);
    const rivals = await world({
      ...parents,
      'entities/child.yaml': script('test/child', '800 BCE', `relations:\n  a: { rel: arose-from, to: test/a, rank: preferred, note: The general view., ${cite} }\n  b: { rel: arose-from, to: test/b, ${cite} }\n`),
    });
    expect((await validateWorld(rivals, { frames: false })).issues).toEqual([]);
    expect(relationsIn(rivals, {}).map((r) => r.key)).toEqual(['a']);
    expect(rivalsIn(rivals).map((r) => r.key)).toEqual(['b']);
    // Picked, the rival holds in the preferred one's place.
    expect(relationsIn(rivals, { picks: ['test/child#b'] }).map((r) => r.key)).toEqual(['b']);
    expect([...scenariosOf(rivals)].map((x) => x.picks ?? [])).toEqual([[], ['test/child#b']]);
    expect(lineageOf(rivals, 'test/child').before.map((x) => x.id)).toEqual(['test/a']);
    expect(lineageText(rivals, 'test/child')).toBe(['test/child (800 BCE – …), in the default picture', '  arose from test/a (1050 BCE – …)', '  another reading: arose from test/b (1500 BCE – …)'].join('\n'));
    expect(lineageText(rivals, 'test/b')).toContain('another reading: gave rise to test/child');
  });

  it('a rival that the dates rule out is a warning on it, as a competing claim is, and the default picture stands', async () => {
    const issues = await check({
      ...parents,
      // The rival parent begins after the child does.
      'entities/c.yaml': script('test/c', '500 BCE'),
      'entities/child.yaml': script('test/child', '800 BCE', `relations:\n  a: { rel: arose-from, to: test/a, rank: preferred, note: The general view., ${cite} }\n  c: { rel: arose-from, to: test/c, ${cite} }\n`),
    });
    expect(errors(issues)).toEqual([]);
    expect(issues.map((i) => [i.level, i.where, i.message.split(':')[0]])).toEqual([['warning', 'relations.c', 'this rival "arose-from" relation (rank normal) contradicts the rest of the world in the default picture']]);
  });

  it('preferred is over a rival: over nothing, it is a warning', async () => {
    const issues = await check({ ...parents, 'entities/child.yaml': script('test/child', '800 BCE', `relations:\n  a: { rel: arose-from, to: test/a, rank: preferred, ${cite} }\n`) });
    expect(issues.map((i) => [i.level, i.message])).toEqual([['warning', 'preferred over nothing: no other "arose-from" relation of test/child is its rival']]);
  });

  it('lineage runs between things of a kind', async () => {
    const issues = await check({ 'entities/state.yaml': polity('test/state', '1000 BCE'), 'entities/child.yaml': script('test/child', '800 BCE', `relations:\n  a: { rel: arose-from, to: test/state, ${cite} }\n`) });
    expect(errors(issues).map((i) => i.message)).toEqual(['"arose-from" joins two records of one kind: a development/script and a polity are not']);
  });
});

describe('a picture that does not hold', () => {
  it('is said once, and not again on every competing claim of the world', async () => {
    const issues = await check({
      'alternatives/g.yaml': `id: alt:g\ntype: group\ntitle: A group\nshow: [alt:g/one]\ndefault: null\n`,
      'alternatives/g/one.yaml': `id: alt:g/one\ntype: alternative\nkind: perspective\ngroup: alt:g\ntitle: One\n`,
      'entities/old.yaml': polity('test/old', '753 BCE', '1453 CE'),
      // In the perspective it carries on a state that outlasted it: that picture cannot hold.
      'entities/new.yaml': polity('test/new', '800 CE', '1400 CE', `relations:\n  c: { rel: continues, to: test/old, alt: alt:g/one, ${cite} }\n`),
      // Elsewhere in the world, a record with competing dates, which has nothing to do with it.
      'entities/far.yaml': entity('test/far', 'event/political', `claims:\n  a: { prop: date, value: 100 CE, rank: preferred, note: Why., ${cite} }\n  b: { prop: date, value: 101 CE, ${cite} }\n`),
    });
    expect(issues.map((i) => [i.level, i.check])).toEqual([['error', 'chronology']]);
  });
});

describe('what is one thing', () => {
  const files = {
    'alternatives/succession.yaml': `id: alt:succession\ntype: group\ntitle: Who carried the old empire on\nshow: [alt:succession/transfer]\ndefault: null\n`,
    'alternatives/succession/transfer.yaml': `id: alt:succession/transfer\ntype: alternative\nkind: perspective\ngroup: alt:succession\ntitle: The empire was transferred\n`,
    'entities/old.yaml': polity('test/old', '753 BCE', '1453 CE'),
    'entities/west.yaml': polity('test/west', '800 CE', '1806 CE', `relations:\n  c: { rel: continues, to: test/old, alt: alt:succession/transfer, ${cite} }\n`),
    'entities/union.yaml': polity('test/union', '1922 CE', '1991 CE'),
    'entities/heir.yaml': polity('test/heir', '1917 CE', undefined, `relations:\n  c: { rel: continues, to: test/union, ${cite} }\n  p: { rel: part-of, to: test/union, valid: { lo: 1922 CE, hi: 1991 CE }, ${cite} }\n`),
    'entities/other.yaml': polity('test/other', '1991 CE', undefined, `relations:\n  a: { rel: arose-from, to: test/union, ${cite} }\n`),
    'entities/joined.yaml': polity('test/joined', '1949 CE', '1990 CE', `relations:\n  m: { rel: merged-into, to: test/heir, ${cite} }\n`),
  };

  it('depends on the picture: records joined by a claim of identity are one thing where the claim holds', async () => {
    const w = await world(files);
    expect((await validateWorld(w, { frames: false })).issues).toEqual([]);
    expect(identityOf(w, 'test/old')).toEqual(['test/old']);
    expect(identityOf(w, 'test/old', { alts: ['alt:succession/transfer'] })).toEqual(['test/old', 'test/west']);
    // An accepted continuity joins them in every picture, whichever end is asked, the earlier first.
    expect(identityOf(w, 'test/heir')).toEqual(['test/union', 'test/heir']);
    expect(identityOf(w, 'test/union')).toEqual(['test/union', 'test/heir']);
    // What merely arose from it is another thing.
    expect(identityOf(w, 'test/other')).toEqual(['test/other']);
  });

  it('a record says what it came from and what came of it, seen from either end', async () => {
    const w = await world(files);
    expect(lineageOf(w, 'test/union')).toEqual({
      same: ['test/union', 'test/heir'],
      before: [],
      after: [
        { rel: 'continued-by', id: 'test/heir', via: 'test/heir#c' },
        { rel: 'gave-rise-to', id: 'test/other', via: 'test/other#a' },
      ],
    });
    // What merged into a record came before it; part-of is not lineage.
    expect(lineageOf(w, 'test/heir')).toMatchObject({
      before: [
        { rel: 'absorbed', id: 'test/joined' },
        { rel: 'continues', id: 'test/union' },
      ],
      after: [],
    });
    expect(lineageOf(w, 'test/joined').after).toEqual([{ rel: 'merged-into', id: 'test/heir', via: 'test/joined#m' }]);
    expect(lineageText(w, 'test/old', { alts: ['alt:succession/transfer'] })).toBe(
      ['test/old (753 BCE – 1453 CE), with alt:succession/transfer', '  one thing with: test/west (800 CE – 1806 CE)', '  continued by test/west (800 CE – 1806 CE)'].join('\n'),
    );
  });
});

describe('another database’s cut', () => {
  it('a phase may carry the id of the item that is that state, where the record as a whole has none', async () => {
    const w = await world({
      'entities/state.yaml': entity(
        'test/state',
        'polity',
        `phases:\n  - id: kingdom\n    same_as: { wikidata: Q201038 }\n  - id: republic\nclaims:\n  start: { prop: start, value: 753 BCE, ${cite} }\n  k: { prop: end, subject: "@kingdom", value: 509 BCE, ${cite} }\n`,
      ),
    });
    expect((await validateWorld(w, { frames: false })).issues).toEqual([]);
    expect(w.entity.get('test/state')!.phases).toEqual([{ id: 'kingdom', label: undefined, gap: undefined, same_as: { wikidata: 'Q201038' } }, { id: 'republic', label: undefined, gap: undefined }]);
  });
});

describe('a missing link', () => {
  it('is noted where a record arose from one that ended long before it began', async () => {
    const issues = await check({
      'entities/old.yaml': polity('test/old', '462 CE', '849 CE'),
      'entities/new.yaml': polity('test/new', '2 February 962 CE', '1806 CE', `relations:\n  a: { rel: arose-from, to: test/old, ${cite} }\n`),
    });
    expect(issues.map((i) => [i.level, i.check, i.message])).toEqual([['info', 'lineage', 'test/new began at least 112.1 yr after test/old ended: what lay between them is not written']]);
  });
});

describe('checks that did not run', () => {
  it('are named, so that a report with errors is not read as a clean chronology', async () => {
    const w = await world({ 'entities/a.yaml': polity('test/a', '1000 CE', '900 CE', `relations:\n  r: { rel: no-such-relation, to: test/a, ${cite} }\n`) });
    const report = await validateWorld(w);
    expect(report.issues.filter((i) => i.level === 'error').map((i) => i.check)).toEqual(['vocab']);
    expect(report.skipped).toEqual(['the chronology', 'the plate frames']);
    expect((await validateWorld(await world({ 'entities/a.yaml': polity('test/a', '900 CE', '1000 CE') }), { frames: false })).skipped).toEqual([]);
  });
});

describe('nothing is its own ancestor', () => {
  it('a loop of lineage is an error, naming the relations that make it', async () => {
    const issues = await check({
      'entities/a.yaml': polity('test/a', '1000 CE', undefined, `relations:\n  r: { rel: arose-from, to: test/c, ${cite} }\n`),
      'entities/b.yaml': polity('test/b', '1000 CE', undefined, `relations:\n  r: { rel: succeeds, to: test/a, ${cite} }\n`),
      'entities/c.yaml': polity('test/c', '1000 CE', undefined, `relations:\n  r: { rel: arose-from, to: test/b, ${cite} }\n`),
    });
    // a arose from c, b succeeds a, c arose from b: round. Their dates allow it, since all begin in the same year.
    const lineage = errors(issues).filter((i) => i.check === 'lineage');
    expect(lineage).toHaveLength(1);
    expect(lineage[0].message).toContain('make a record its own ancestor');
    for (const rel of ['test/a arose-from test/c', 'test/b succeeds test/a', 'test/c arose-from test/b']) expect(lineage[0].message).toContain(rel);
  });

  it('what merged into a record came before it, so two records cannot have merged into each other', async () => {
    const issues = await check({
      'entities/a.yaml': polity('test/a', '1000 CE', '1500 CE', `relations:\n  r: { rel: merged-into, to: test/b, ${cite} }\n`),
      'entities/b.yaml': polity('test/b', '1000 CE', '1500 CE', `relations:\n  r: { rel: merged-into, to: test/a, ${cite} }\n`),
    });
    expect(errors(issues).map((i) => i.check)).toEqual(['lineage']);
  });

  it('to carry a thing on is not to come after it: a union may have arisen from the republic that carries it on', async () => {
    expect(
      await check({
        'entities/union.yaml': polity('test/union', '30 December 1922 CE', '26 December 1991 CE', `relations:\n  a: { rel: arose-from, to: test/republic, ${cite} }\n`),
        'entities/republic.yaml': polity('test/republic', '7 November 1917 CE', undefined, `relations:\n  c: { rel: continues, to: test/union, ${cite} }\n`),
      }),
    ).toEqual([]);
  });

  it('a record may arise from, continue and be part of the same record without a loop', async () => {
    expect(
      await check({
        'entities/union.yaml': polity('test/union', '1922 CE', '1991 CE'),
        'entities/heir.yaml': polity('test/heir', '1917 CE', undefined, `relations:\n  c: { rel: continues, to: test/union, ${cite} }\n  p: { rel: part-of, to: test/union, valid: { lo: 1922 CE, hi: 1991 CE }, ${cite} }\n`),
        'entities/other.yaml': polity('test/other', '1991 CE', undefined, `relations:\n  a: { rel: arose-from, to: test/union, ${cite} }\n  s: { rel: succeeds, to: test/union, ${cite} }\n`),
      }),
    ).toEqual([]);
  });
});

describe('a war', () => {
  const war = (extra = '', more = '') => lasting('test/war', 'event/war', '1 September 1939 CE', '2 September 1945 CE', `${extra}${more}`);

  it('lasts, and holds the battles that are part of it', async () => {
    const battle = (date: string) => entity('test/battle', 'event/battle', `claims:\n  date: { prop: date, value: ${date}, ${cite} }\nrelations:\n  in: { rel: part-of, to: test/war, ${cite} }\n`);
    expect(await check({ 'entities/war.yaml': war(), 'entities/battle.yaml': battle('7 December 1941 CE') })).toEqual([]);
    const outside = await check({ 'entities/war.yaml': war(), 'entities/battle.yaml': battle('7 December 1946 CE') });
    expect(errors(outside).map((i) => i.check)).toEqual(['chronology']);
  });

  it('may take in a war that began before it, for the years it was part of it', async () => {
    const older = (rel: string) => lasting('test/older', 'event/war', '7 July 1937 CE', '2 September 1945 CE', `relations:\n  in: { rel: part-of, to: test/war${rel}, ${cite} }\n`);
    // Whole, an earlier war cannot be part of a later one.
    const whole = await check({ 'entities/war.yaml': war(), 'entities/older.yaml': older('') });
    expect(errors(whole).map((i) => i.check)).toEqual(['chronology']);
    // From the day it joined, it can.
    expect(await check({ 'entities/war.yaml': war(), 'entities/older.yaml': older(', valid: { lo: 9 December 1941 CE }') })).toEqual([]);
  });

  it('or be part of it throughout, where the larger war is dated from the earlier one: the two readings are competing starts', async () => {
    const w = await world({
      'entities/war.yaml': entity(
        'test/war',
        'event/war',
        `claims:\n  start-1939: { prop: start, value: 1 September 1939 CE, rank: preferred, note: The usual date., ${cite} }\n  start-1937: { prop: start, value: 7 July 1937 CE, ${cite} }\n  end: { prop: end, value: 2 September 1945 CE, ${cite} }\n`,
      ),
      'entities/older.yaml': lasting('test/older', 'event/war', '7 July 1937 CE', '2 September 1945 CE', `relations:\n  in: { rel: part-of, to: test/war, ${cite} }\n`),
    });
    const variants = solveVariants(w);
    // The default picture, from 1939, cannot hold the earlier war whole; the picture from 1937 can.
    expect(variants[0].solution.ok).toBe(false);
    expect(variants.find((v) => v.scenario.picks?.includes('test/war#start-1937'))!.solution.ok).toBe(true);
  });

  it('names who took part, each for the span it did', async () => {
    const states = { 'entities/a.yaml': polity('test/a', '1707 CE'), 'entities/b.yaml': polity('test/b', '1776 CE') };
    const withParticipants = (b: string) => war('', `relations:\n  a: { rel: participant, to: test/a, valid: { lo: 3 September 1939 CE, hi: 2 September 1945 CE }, note: One side., ${cite} }\n  b: { rel: participant, to: test/b, valid: ${b}, note: The same side., ${cite} }\n`);
    expect(await check({ ...states, 'entities/war.yaml': withParticipants('{ lo: 8 December 1941 CE, hi: 2 September 1945 CE }') })).toEqual([]);
    const outside = await check({ ...states, 'entities/war.yaml': withParticipants('{ lo: 8 December 1941 CE, hi: 2 September 1950 CE }') });
    expect(errors(outside).map((i) => i.check)).toEqual(['chronology']);
    expect(errors(outside)[0].message).toContain('entities/war.yaml relations.b');
  });

  it('is where its participants are written: a state does not list its wars', async () => {
    const issues = await check({ 'entities/war.yaml': war(), 'entities/a.yaml': polity('test/a', '1707 CE', undefined, `relations:\n  w: { rel: participant, to: test/war, ${cite} }\n`) });
    expect(errors(issues).map((i) => i.message)).toEqual(['"participant" joins an event, not a polity']);
  });
});
