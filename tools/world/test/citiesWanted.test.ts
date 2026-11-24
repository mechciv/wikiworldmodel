import { describe, expect, it } from 'vitest';
import type { CitiesFile } from '../../../core/landscape.ts';
import { citiesWanted, citiesWantedText } from '../src/citiesWanted.ts';

const file: CitiesFile = {
  format: 'lightworld-cities@1',
  lists: [
    { source: 'src:a', field: 'field:a', title: 'A', hold: 50, gap: 600 },
    { source: 'src:b', field: 'field:b', title: 'B', hold: 50, gap: 600 },
  ],
  cities: [
    // One great city in two lists, a few km apart; a small one far off.
    { name: 'Great', country: '', lat: 10, lon: 20, certainty: 1, source: 'src:a', field: 'field:a', pops: [[0, 100000], [500, 300000]] },
    { name: 'Great', country: '', lat: 10.02, lon: 20.01, certainty: 1, source: 'src:b', field: 'field:b', pops: [[1000, 200000]] },
    { name: 'Small', country: '', lat: 30, lon: 40, certainty: 1, source: 'src:a', field: 'field:a', pops: [[0, 10000], [500, 12000]] },
    { name: 'Walled', country: '', lat: 50, lon: 60, certainty: 1, source: 'src:a', field: 'field:a', pops: [[0, 40000], [500, 40000]] },
  ],
  records: [
    { id: 'people/cities/walled', name: 'Walled', lat: 50.01, lon: 60, span: [-200, 900], pops: [], areas: [], houses: [], town: { wall: 'stone' } },
    { id: 'places/mapped', name: 'Mapped', lat: 0, lon: 0, span: [-500, 1e9], pops: [[0, 50000]], areas: [], houses: [] },
  ],
};

describe('what most wants a city’s records', () => {
  it('counts each city once, joins its record, gives its tier, and puts the most lives first', () => {
    const rows = citiesWanted(file, new Set(['places/mapped']));
    expect(rows.map((r) => r.name)).toEqual(['Great', 'Mapped', 'Walled', 'Small']);
    const by = new Map(rows.map((r) => [r.name, r]));
    expect(by.get('Great')!.tier).toBe(0);
    expect(by.get('Walled')!.tier).toBe(2);
    expect(by.get('Walled')!.record).toBe('people/cities/walled');
    expect(by.get('Mapped')!.tier).toBe(3);
    expect(by.get('Small')!.tier).toBe(0);
    // Its life runs from the first figure of either list, less the years they hold one, to the last, plus them.
    expect(by.get('Great')!.span).toEqual([-50, 1050]);
    // A record that runs on stands to the present.
    expect(by.get('Mapped')!.span[1]).toBe(1950);
    expect(by.get('Great')!.peopleYears).toBeGreaterThan(by.get('Small')!.peopleYears * 10);
  });

  it('lists the cities below a tier, with the share of the people-years each tier holds', () => {
    const text = citiesWantedText(citiesWanted(file, new Set(['places/mapped'])), 10);
    expect(text).toContain('tier 0, a point and its people: 2 cities');
    expect(text).toMatch(/1\. Great, 51 BCE to 1050 CE/);
    expect(text).not.toContain('Walled,');
  });
});
