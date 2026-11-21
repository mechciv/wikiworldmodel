import { describe, expect, it } from 'vitest';
import { ROCK_SITE, rockBoxes, rocksAt, rocksBinAt, rocksNear, rockSite, type RocksBin } from './rocks.ts';

const CLASSES = ['terrestrial', 'lacustrine', 'marine'];
// Three sites of one stage: a lake's beds at the equator, a channel's a little over 50 km east of them, and a reef far off.
const bin: RocksBin = {
  format: 'lightworld-rocks-bin@1',
  from: -125e6,
  to: -119e6,
  slice: -122e6,
  name: 'a stage',
  words: ['', 'lacustrine indet.', '"shale"', 'yellow,desiccation cracks', 'gypsum', 'fluvial indet.', 'sandstone', 'red,coarse', 'reef, buildup or bioherm', '"limestone"'],
  sites: [
    // lat, lon, collection, share, classes, environment, lithology, its adjectives, second lithology, its adjectives
    0, 0, 31170, 255, 0b011, 1, 2, 3, 4, 0,
    0, 50, 67219, 128, 0b001, 5, 6, 7, 0, 0,
    2000, 9000, 9, 255, 0b100, 8, 9, 0, 0, 0,
  ],
};
const index = { classes: CLASSES, here_km: 30, near_km: 200 };

describe('the rock record near a place', () => {
  it('reads a site out of its numbers, with its classes and each lithology\'s adjectives', () => {
    expect(bin.sites.length % ROCK_SITE).toBe(0);
    expect(rockSite(bin, CLASSES, 0)).toEqual({
      lat: 0,
      lon: 0,
      collection: 31170,
      share: 1,
      classes: ['terrestrial', 'lacustrine'],
      environment: 'lacustrine indet.',
      lithologies: [
        { name: '"shale"', adjectives: ['yellow', 'desiccation cracks'] },
        { name: 'gypsum', adjectives: [] },
      ],
    });
    expect(rockSite(bin, CLASSES, 2).lithologies).toEqual([{ name: '"limestone"', adjectives: [] }]);
  });

  it('finds the sites within a distance, the nearest first, with how far each is', () => {
    const near = rocksNear(bin, CLASSES, 0, 0.1, 100);
    expect(near.map((s) => s.collection)).toEqual([31170, 67219]);
    expect(near[0].km).toBeCloseTo(11.1, 0);
    expect(near[1].km).toBeCloseTo(44.5, 0);
    expect(rocksNear(bin, CLASSES, 0, 0.1, 20).map((s) => s.collection)).toEqual([31170]);
  });

  it('answers in tiers: here within here_km, near out to near_km, and nothing beyond', () => {
    const at = rocksAt(bin, index, 0, 0.1);
    expect(at.tier).toBe('here');
    expect(at.here.sites).toBe(1);
    expect(at.here.nearest).toBe(11);
    expect(at.here.environments).toEqual([['lacustrine indet.', 1]]);
    // A collection's two lithologies share its weight, and an adjective counts with the lithology it describes.
    expect(at.here.lithologies).toEqual([
      ['"shale"', 0.5],
      ['gypsum', 0.5],
    ]);
    expect(at.here.adjectives).toEqual([
      ['desiccation cracks', 0.5],
      ['yellow', 0.5],
    ]);
    expect(at.here.classes).toEqual([
      ['lacustrine', 1],
      ['terrestrial', 1],
    ]);
    expect(at.near.sites).toBe(1);
    expect(at.near.environments).toEqual([['fluvial indet.', 1]]);
    // From 100 km west of the lake's beds, both are near and neither is here.
    const west = rocksAt(bin, index, 0, -0.9);
    expect(west.tier).toBe('near');
    expect(west.here.sites).toBe(0);
    expect(west.here.nearest).toBeNull();
    expect(west.near.sites).toBe(2);
    // The lake's beds are wholly of the stage and the channel's half: two thirds of the weight is the lake's.
    expect(west.near.environments).toEqual([
      ['lacustrine indet.', 0.666],
      ['fluvial indet.', 0.334],
    ]);
    expect(rocksAt(bin, index, -40, -120).tier).toBe('nothing');
  });

  it('finds the same sites through its boxes as by reading them all, by the poles and across the date line too', () => {
    const sites: number[] = [];
    let n = 0;
    for (let la = -88; la <= 88; la += 4) for (let lo = -179; lo <= 179; lo += 7) sites.push(Math.round((la + (n % 3) * 0.7) * 100), Math.round((lo + (n % 5) * 0.9) * 100), ++n, 255, 1, 0, 0, 0, 0, 0);
    const many: RocksBin = { ...bin, sites };
    const boxes = rockBoxes(many);
    let found = 0;
    for (const [la, lo, km] of [[0, 0, 300], [89, 10, 400], [-89.5, -170, 500], [10, 179.5, 300], [-45, -179.9, 250], [60, 30, 200], [0.2, 0.3, 20], [75, -179, 900]]) {
      const all = rocksNear(many, CLASSES, la, lo, km).map((s) => s.collection);
      expect(rocksNear(many, CLASSES, la, lo, km, boxes).map((s) => s.collection)).toEqual(all);
      found += all.length;
    }
    expect(found).toBeGreaterThan(40);
  });

  it('finds the stage that holds a time', () => {
    const bins = [{ from: -125e6, to: -119e6, slice: -122e6, name: 'a', file: 'a.json', sites: 3 }];
    expect(rocksBinAt({ bins }, -123.7e6)?.name).toBe('a');
    expect(rocksBinAt({ bins }, -100e6)).toBeUndefined();
  });
});
