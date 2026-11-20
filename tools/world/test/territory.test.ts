// Pass criteria: a polity's territory at a time is the rows of its chosen claim that hold
// then, only while the polity exists, and a click resolves inside its polygons, holes out.
import { describe, expect, it } from 'vitest';
import { statesAt, type PolitiesFile, type PolityRow } from '../../../core/layers.ts';
import { contains, drawnFirst, territoriesAt, type Territory, type TerritoryRow } from '../../../core/territory.ts';
import type { FeatureTime } from '../../../core/tileset.ts';

const span = (start: number, end: number): FeatureTime => ({
  start: { best: start, lo: start, hi: start, derived: false },
  end: { best: end, lo: end, hi: end, derived: false },
  instant: false,
});

/** A square from (x0, y0) to (x1, y1) in degrees, as a ring in hundredths. */
const square = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0].map((v) => v * 100);

const row = (name: string, from: number, to: number, rings: number[][]): TerritoryRow => ({ name, from, to, area: 1, at: [0, 0], rings });

const rome: Territory = {
  subject: 'x/rome',
  label: 'Rome',
  time: span(-752, 1453),
  variants: { 'x/rome#end-late': span(-752, 1461) },
  claims: [
    {
      claim: 'x/rome#territory',
      value: 'A, B',
      rank: 'preferred',
      basis: 'reconstruction',
      source: 'src:d',
      rows: [row('A', -800, -400, [square(10, 40, 14, 44)]), row('B', -420, 1470, [square(0, 30, 40, 50), square(10, 40, 14, 44)])],
    },
    { claim: 'x/rome#territory-other', value: 'C', rank: 'normal', basis: 'reconstruction', source: 'src:e', rows: [row('C', -800, 1470, [square(-5, -5, 5, 5)])] },
  ],
};

describe('territory', () => {
  it('fills even-odd: inside a ring, outside its hole', () => {
    const r = row('B', 0, 1, [square(0, 30, 40, 50), square(10, 40, 14, 44)]);
    expect(contains(r, 5, 35)).toBe(true);
    expect(contains(r, 12, 42)).toBe(false);
    expect(contains(r, 45, 35)).toBe(false);
  });

  it('holds the rows of the chosen claim for their years, only while the polity exists', () => {
    const file = { territories: [rome] };
    expect(territoriesAt(file, -900, {})).toEqual([]);
    // Before its start the polity does not exist, though its row does.
    expect(territoriesAt(file, -760, {})).toEqual([]);
    expect(territoriesAt(file, -500, {})[0].rows.map((r) => r.name)).toEqual(['A']);
    // Rows that overlap in time both hold.
    expect(territoriesAt(file, -410, {})[0].rows.map((r) => r.name)).toEqual(['A', 'B']);
    expect(territoriesAt(file, 1455, {})).toEqual([]);
  });

  it('never drops a state for want of a colour: three take the colours, the open record first and then the largest, and the rest are left to the states', () => {
    const state = (subject: string, area: number): Territory => ({
      subject,
      label: subject,
      time: span(0, 100),
      claims: [{ claim: `${subject}#territory`, value: subject, rank: 'normal', basis: 'reconstruction', source: 'src:d', rows: [{ ...row(subject, 0, 100, [square(0, 0, 1, 1)]), area }] }],
    });
    const all = territoriesAt({ territories: [state('x/a', 5), state('x/b', 50), state('x/c', 1), state('x/d', 20), state('x/e', 10)] }, 50, {});
    const names = (list: { territory: Territory }[]) => list.map((a) => a.territory.subject);
    const { drawn, rest } = drawnFirst(all, null, 3);
    expect(names(drawn)).toEqual(['x/b', 'x/d', 'x/e']);
    expect(names(rest)).toEqual(['x/a', 'x/c']);
    // The record that is open has a colour, however small it is.
    expect(names(drawnFirst(all, 'x/c', 3).drawn)).toEqual(['x/b', 'x/c', 'x/d']);
    // With three or fewer, all are drawn, in the order they came in.
    expect(names(drawnFirst(all.slice(0, 3), null, 3).drawn)).toEqual(['x/a', 'x/b', 'x/c']);
    expect(drawnFirst(all.slice(0, 3), null, 3).rest).toEqual([]);
  });

  it('a row a record claims is the dataset’s again whenever the record does not hold: before it begins in the scenario shown, and after it ends', () => {
    const state = (name: string, from: number, to: number, claimedBy?: string[]): PolityRow => ({ name, from, to, area: 1, at: [0, 0], rings: [square(0, 0, 1, 1)], ...(claimedBy ? { claimedBy } : {}) });
    // An empire that began in 800 by one reckoning and in 962 by another claims the rows from 922 on.
    const file = { format: 'lightworld-polities@1', title: 'States', source: 'src:d', rows: [state('Empire', 922, 962, ['x/empire']), state('Empire', 962, 1260, ['x/empire']), state('Kingdom', 911, 962)] } as PolitiesFile;
    const names = (t: number, holding: string[]) => statesAt(file, t, new Set(holding)).map((r) => r.name);
    // Under the early start the empire holds in 940 and draws its row itself.
    expect(names(940, ['x/empire'])).toEqual(['Kingdom']);
    // Under the late start it does not hold yet, and the row is what the dataset says.
    expect(names(940, [])).toEqual(['Empire', 'Kingdom']);
    expect(names(1000, ['x/empire'])).toEqual([]);
    // Another record's holding does not take it.
    expect(names(1000, ['x/other'])).toEqual(['Empire']);
  });

  it('follows the picks: another claim, or a lifetime that a competing date moves', () => {
    const file = { territories: [rome] };
    expect(territoriesAt(file, 100, { picks: ['x/rome#territory-other'] })[0].rows.map((r) => r.name)).toEqual(['C']);
    expect(territoriesAt(file, 1455, { picks: ['x/rome#end-late'] })[0].rows.map((r) => r.name)).toEqual(['B']);
  });
});

describe('an outline written in a claim (docs/STRUCTURE.md section 5)', () => {
  it('covers about the area it encloses on the sphere', async () => {
    const { areaKm2 } = await import('../src/build/territory.ts');
    const { TERRITORY_SCALE } = await import('../../../core/territory.ts');
    const square = (lat: number) => [[0, lat, 1, lat, 1, lat + 1, 0, lat + 1].map((x) => x * TERRITORY_SCALE)];
    // A degree square is about 111 km on a side at the equator, and half as wide at 60°.
    expect(areaKm2(square(0))).toBeCloseTo(12392, -2);
    expect(areaKm2(square(60)) / areaKm2(square(0))).toBeCloseTo(0.49, 1);
  });
});
