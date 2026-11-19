import { describe, expect, it } from 'vitest';
import type { SearchEntry } from './records.ts';
import { heldAt, holdsAt, nameAt, nameFound, nameMatches, placeIn, readQuery, readTime } from './timemachine.ts';
import { PRESENT_YEAR } from './time.ts';

const at = (best: number | null) => ({ best, lo: best ?? -Infinity, hi: best ?? Infinity, derived: false });
const entry = (id: string, kind: string, start: number, end: number | null, instant = false): SearchEntry => ({
  id,
  label: id,
  kind,
  time: { start: at(start), end: at(instant ? start : end), instant },
  located: true,
});

describe('readTime', () => {
  it('reads years of the era as people write them', () => {
    expect(readTime('1200')).toBe(1200);
    expect(readTime('100 CE')).toBe(100);
    expect(readTime('AD 79')).toBe(79);
    expect(readTime('79 AD')).toBe(79);
    expect(readTime('44 BC')).toBe(-43);
    expect(readTime('44 BCE')).toBe(-43);
    expect(readTime('44bc')).toBe(-43);
    expect(readTime('c. 3000 BC')).toBe(-2999);
  });
  it('reads ages', () => {
    expect(readTime('66 Ma')).toBe(PRESENT_YEAR - 66e6);
    expect(readTime('66mya')).toBe(PRESENT_YEAR - 66e6);
    expect(readTime('66 million years ago')).toBe(PRESENT_YEAR - 66e6);
    expect(readTime('2.4 Ga')).toBe(PRESENT_YEAR - 2.4e9);
    expect(readTime('20 ka')).toBe(PRESENT_YEAR - 20e3);
    expect(readTime('10,000 years ago')).toBe(PRESENT_YEAR - 10e3);
  });
  it('reads a date', () => {
    const t = readTime('15 March 44 BC');
    // 44 BCE is the astronomical year -43, and the Ides of March a fifth of the way through it.
    expect(t).toBeGreaterThan(-43);
    expect(t).toBeLessThan(-42.7);
  });
  it('is not fooled by words', () => {
    expect(readTime('Rome')).toBeUndefined();
    expect(readTime('Rome 100 CE')).toBeUndefined();
    expect(readTime('1200 apples')).toBeUndefined();
    expect(readTime('')).toBeUndefined();
  });
});

describe('readQuery', () => {
  it('splits a place from a time at either end', () => {
    expect(readQuery('Rome 100 CE')).toEqual({ place: 'Rome', t: 100 });
    expect(readQuery('Rome, 44 BC')).toEqual({ place: 'Rome', t: -43 });
    expect(readQuery('100 CE in Rome')).toEqual({ place: 'Rome', t: 100 });
    expect(readQuery('66 Ma')).toEqual({ place: '', t: PRESENT_YEAR - 66e6 });
    expect(readQuery('Teotihuacan')).toEqual({ place: 'Teotihuacan' });
  });
});

describe('heldAt', () => {
  const world = [
    entry('rome', 'settlement', -753, null),
    entry('han', 'polity', -202, 220),
    entry('augustus', 'person', -62, 14),
    entry('caesar-killed', 'event/political', -43, null, true),
    entry('wolf', 'taxon', -1e6, null),
    entry('chicxulub', 'event/impact', PRESENT_YEAR - 66e6, null, true),
  ];
  it('lists what holds at a time, places and states first', () => {
    expect(heldAt(world, 0, () => false).map((e) => e.id)).toEqual(['rome', 'han', 'augustus', 'caesar-killed', 'wolf']);
  });
  it('counts a moment as then when it is near, as a share of how long ago', () => {
    expect(heldAt(world, PRESENT_YEAR - 65.5e6, () => false).map((e) => e.id)).toEqual(['chicxulub']);
    expect(heldAt(world, PRESENT_YEAR - 60e6, () => false)).toEqual([]);
  });
  it('says whether one record holds', () => {
    expect(holdsAt(world[1], 100)).toBe(true);
    expect(holdsAt(world[1], 400)).toBe(false);
    expect(holdsAt(world[0], 1900)).toBe(true);
    // An end no claim gives is closed by the last row of a dataset that is a row of it.
    const kingdom = { ...entry('new-kingdom', 'polity', -1477, null), places: [[-1499, -799, 31, 26, 1000]] as [number, number, number, number, number][] };
    expect(holdsAt(kingdom, -1000)).toBe(true);
    expect(holdsAt(kingdom, 1200)).toBe(false);
  });
});

describe('nameMatches', () => {
  it('finds a name by the starts of its words, in any order', () => {
    expect(nameMatches('Rome', 'rome')).toBe(true);
    expect(nameMatches('Andromeda', 'rome')).toBe(false);
    expect(nameMatches('Battle of Actium', 'actium bat')).toBe(true);
    expect(nameMatches('Battle of Actium', 'actium sea')).toBe(false);
  });
  it('splits what is typed into words as it splits the name, so that a hyphen typed finds one written', () => {
    expect(nameMatches('south-central Africa', 'south-central')).toBe(true);
    expect(nameMatches('south-central Africa', 'South-Central Af')).toBe(true);
    expect(nameMatches('South Africa', 'south-central')).toBe(false);
    expect(nameMatches("Xi'an", "xi'an")).toBe(true);
  });
  it('finds nothing where nothing is typed', () => {
    expect(nameMatches('Rome', '')).toBe(false);
    expect(nameMatches('Rome', ' - ')).toBe(false);
  });
});

describe('names and places', () => {
  const rome: SearchEntry = {
    ...entry('places/constantinople', 'settlement', -660, null),
    label: 'Istanbul',
    names: [{ text: 'Byzantium', valid: [null, 330] }, { text: 'Constantinople', valid: [330, 1950] }, { text: 'Istanbul' }],
  };
  it('finds a thing by any name it went by, and says which', () => {
    expect(nameFound(rome, 'constantin')).toBe('Constantinople');
    expect(nameFound(rome, 'istanbul')).toBe('Istanbul');
    expect(nameFound(rome, 'tanbul')).toBeUndefined();
  });
  it('names it as it was named at a time', () => {
    expect(nameAt(rome, 100)).toBe('Byzantium');
    expect(nameAt(rome, 1200)).toBe('Constantinople');
    expect(nameAt(rome, 1990)).toBe('Istanbul');
  });
  it('finds where a state was drawn then, or nearest then', () => {
    const places: [number, number, number, number, number][] = [[-200, -100, 1, 1, 10], [-150, 0, 2, 2, 50], [100, 200, 3, 3, 5]];
    expect(placeIn(places, -120)?.[2]).toBe(2);
    expect(placeIn(places, 60)?.[2]).toBe(3);
    expect(placeIn(undefined, 0)).toBeUndefined();
  });
  it('lists the largest states of a dataset after the records', () => {
    const small = { ...entry('src:states#A@0', 'polity', 0, 100), dataset: 'src:states', places: [[0, 100, 0, 0, 10]] as [number, number, number, number, number][] };
    const big = { ...entry('src:states#B@0', 'polity', 0, 100), dataset: 'src:states', places: [[0, 100, 0, 0, 900]] as [number, number, number, number, number][] };
    const han = entry('han', 'polity', -202, 220);
    expect(heldAt([small, big, han], 50, () => false).map((e) => e.id)).toEqual(['han', 'src:states#B@0', 'src:states#A@0']);
  });
});
