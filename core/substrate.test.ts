import { describe, expect, it } from 'vitest';
import type { RockSite } from './rocks.ts';
import { bedrockAt, bedrockWords, firstGround, groundAnswer, groundHeld, laidDownAs, soilAt, substrateOfSites, substrateOfSoil, substrateWords, type GroundMaps, type SubstrateRule } from './substrate.ts';

const rule: SubstrateRule = {
  land_class: 'terrestrial',
  near_weight: 0.5,
  lithologies: { sandstone: { sand: 1 }, mudstone: { mud: 1 }, '"shale"': { mud: 1 }, conglomerate: { gravel: 1 } },
  types: { siliciclastic: { sand: 0.5, mud: 0.5 }, carbonate: { lime: 1 }, evaporite: { evaporite: 1 } },
  adjectives: {
    red: { colour: 'red' },
    yellow: { colour: 'yellow' },
    'desiccation cracks': { mark: 'cracks' },
    pebbly: { material: 'gravel', share: 0.25 },
    gypsiferous: { material: 'evaporite', share: 0.25 },
  },
};
const index = { here_km: 30, near_km: 200, source: 'src:rocks', lithologies: { sandstone: 'siliciclastic', mudstone: 'siliciclastic', '"limestone"': 'carbonate', gypsum: 'evaporite', '"siliciclastic"': 'siliciclastic', amber: 'other' } };
const site = (collection: number, km: number, lithologies: RockSite['lithologies'], more: Partial<RockSite> = {}): RockSite & { km: number } => ({ lat: 0, lon: 0, collection, share: 1, classes: ['terrestrial'], environment: '', lithologies, km, ...more });

describe('what a rock was laid down as', () => {
  it('goes by its name, then by its type, and says nothing where neither does', () => {
    expect(laidDownAs('sandstone', 'siliciclastic', rule)).toEqual({ sand: 1 });
    expect(laidDownAs('"siliciclastic"', 'siliciclastic', rule)).toEqual({ sand: 0.5, mud: 0.5 });
    expect(laidDownAs('"limestone"', 'carbonate', rule)).toEqual({ lime: 1 });
    expect(laidDownAs('amber', 'other', rule)).toBeUndefined();
    expect(laidDownAs('a rock nobody listed', undefined, rule)).toBeUndefined();
  });
});

describe('the ground of a place, from the rocks near it', () => {
  it('is evidence where a collection lies here, and takes only those: the country round says nothing more', () => {
    const s = substrateOfSites([site(1, 12, [{ name: 'sandstone', adjectives: ['red'] }]), site(2, 150, [{ name: 'mudstone', adjectives: [] }])], index, rule)!;
    expect(s.tier).toBe('evidence');
    expect(s.weight).toBe(1);
    expect(s.materials).toEqual([['sand', 1]]);
    expect(s.colours).toEqual([['red', 1]]);
    expect(s.rows).toEqual(['src:rocks#coll:1']);
    expect(s.sites).toBe(1);
    expect(s.km).toBe(12);
  });

  it('is a model where the nearest are of the country round, and decides part of the ground only', () => {
    const s = substrateOfSites(
      [
        site(1, 60, [
          { name: 'sandstone', adjectives: [] },
          { name: 'mudstone', adjectives: ['red', 'desiccation cracks'] },
        ]),
        site(2, 150, [{ name: '"limestone"', adjectives: [] }], { share: 0.5 }),
      ],
      index,
      rule,
    )!;
    expect(s.tier).toBe('model');
    expect(s.weight).toBe(0.5);
    // The first counts whole, its two rocks half each; the second half: sand 0.5, mud 0.5, lime 0.5, of 1.5.
    expect(s.materials).toEqual([
      ['lime', 0.333],
      ['mud', 0.333],
      ['sand', 0.333],
    ]);
    // A third of what was said names red, and cracks.
    expect(s.colours).toEqual([['red', 0.333]]);
    expect(s.marks).toEqual([['cracks', 0.333]]);
    expect(s.km).toBe(60);
  });

  it('lets an adjective make part of a rock another material', () => {
    const s = substrateOfSites([site(1, 5, [{ name: 'mudstone', adjectives: ['gypsiferous', 'pebbly'] }])], index, rule)!;
    expect(s.materials).toEqual([
      ['mud', 0.5],
      ['evaporite', 0.25],
      ['gravel', 0.25],
    ]);
  });

  it('counts a colour or a mark once for a rock, however many of its adjectives say it', () => {
    const twice: SubstrateRule = { ...rule, adjectives: { ...rule.adjectives, ferruginous: { colour: 'red' }, 'mud cracks': { mark: 'cracks' } } };
    const s = substrateOfSites([site(1, 5, [{ name: 'mudstone', adjectives: ['red', 'ferruginous', 'desiccation cracks', 'mud cracks'] }])], index, twice)!;
    expect(s.colours).toEqual([['red', 1]]);
    expect(s.marks).toEqual([['cracks', 1]]);
  });

  it('counts only collections of the land, and only rocks that say what they were', () => {
    // A reef's limestone is no land's ground, and amber says nothing of the ground it lay in.
    expect(substrateOfSites([site(1, 5, [{ name: '"limestone"', adjectives: [] }], { classes: ['marine'] })], index, rule)).toBeUndefined();
    expect(substrateOfSites([site(1, 5, [{ name: 'amber', adjectives: ['yellow'] }])], index, rule)).toBeUndefined();
    expect(substrateOfSites([], index, rule)).toBeUndefined();
    // One that says nothing does not stand in the way of one that does, nor count among the rows.
    const s = substrateOfSites([site(1, 5, [{ name: 'amber', adjectives: [] }]), site(2, 9, [{ name: 'conglomerate', adjectives: [] }])], index, rule)!;
    expect(s.materials).toEqual([['gravel', 1]]);
    expect(s.rows).toEqual(['src:rocks#coll:2']);
    expect(s.km).toBe(9);
  });

  it('says in a sentence what the ground is and what says so', () => {
    const here = substrateOfSites([site(1, 12, [{ name: 'sandstone', adjectives: ['red'] }])], index, rule)!;
    expect(substrateWords(here)).toBe('Ground of sand, red: the rock of 1 fossil collection within 12 km');
    const near = substrateOfSites([site(1, 60, [{ name: 'mudstone', adjectives: [] }]), site(2, 80, [{ name: 'mudstone', adjectives: [] }])], index, rule)!;
    expect(substrateWords(near)).toBe('Ground partly of mud: the rock of 2 fossil collections of the country round, the nearest 60 km off');
  });
});

// Two maps of today's ground on a grid of 90°: two rows of four cells. The topsoil has a soil in the north-west cell
// and in the cell east of it; the bedrock has a class in each cell of the northern row.
const held = (span: [number, number], array: number) => ({ field: 'field:x', title: 'A map', source: 'src:map', credit: 'A map of today', held: 'Holocene', span, res: 90, nx: 4, ny: 2, array });
const maps: GroundMaps = {
  header: {
    format: 'lightworld-ground@1',
    soil: held([-9700, 2000], 0),
    bedrock: { ...held([-2_580_000, 2000], 1), classes: { 1: { code: 'su', label: 'Unconsolidated Sediments' }, 2: { code: 'vb', label: 'Basic Volcanic Rocks' }, 3: { code: 'wb', label: 'Water Bodies' }, 4: { code: 'ig', label: 'Ice and Glaciers' } } },
  },
  // Half percents: 40% sand, 40% silt, 20% clay with a quarter of its volume stones; then 90% sand with none.
  soil: Uint8Array.of(80, 80, 40, 50, 180, 12, 8, 0, ...new Array(24).fill(0)),
  bedrock: Uint8Array.of(1, 2, 3, 4, 0, 0, 0, 0),
};
const mapRule: SubstrateRule = { ...rule, soil: { sand: 'sand', silt: 'silt', clay: 'mud', coarse: 'gravel' }, bedrock: { su: {}, vb: { rock: 'basic-volcanic' } } };

describe('the ground of a place, from maps of today', () => {
  it("makes a topsoil's ground of its stones by volume, and of its fine earth in what they leave", () => {
    const s = substrateOfSoil(maps, mapRule, 45, -135)!;
    expect(s.tier).toBe('model');
    expect(s.from).toBe('soil');
    expect(s.weight).toBe(1);
    // A quarter stones; of the rest, 40% sand, 40% silt and 20% clay.
    expect(s.materials).toEqual([
      ['sand', 0.3],
      ['silt', 0.3],
      ['gravel', 0.25],
      ['mud', 0.15],
    ]);
    expect(s.colours).toEqual([]);
    expect(s.materials.reduce((n, [, w]) => n + w, 0)).toBeCloseTo(1, 6);
    expect(substrateOfSoil(maps, mapRule, 45, -45)!.materials).toEqual([
      ['sand', 0.9],
      ['silt', 0.06],
      ['mud', 0.04],
    ]);
    expect(soilAt(maps, 45, -45)).toEqual({ sand: 90, silt: 6, clay: 4, coarse: 0 });
    // No soil in the map there, and none read without the rule for it.
    expect(substrateOfSoil(maps, mapRule, -45, -135)).toBeUndefined();
    expect(substrateOfSoil(maps, rule, 45, -135)).toBeUndefined();
    // In a soil the gravel is its stones, and the mud its clay.
    expect(substrateWords(s)).toBe("Ground of sand, silt, stones: today's topsoil here, held as it is through the Holocene");
    expect(substrateWords(substrateOfSoil(maps, { ...mapRule, soil: { sand: 'mud', silt: 'mud', clay: 'mud', coarse: 'mud' } }, 45, -45)!)).toMatch(/^Ground of clay:/);
  });

  it("takes today's topsoil before the rocks of the country round, and after a collection at the place", () => {
    const soil = () => substrateOfSoil(maps, mapRule, 45, -135);
    const here = substrateOfSites([site(1, 12, [{ name: 'sandstone', adjectives: [] }])], index, rule)!;
    const near = substrateOfSites([site(1, 60, [{ name: 'mudstone', adjectives: [] }])], index, rule)!;
    expect(firstGround(here, soil)).toBe(here);
    expect(firstGround(near, soil)!.from).toBe('soil');
    expect(firstGround(undefined, soil)!.from).toBe('soil');
    // Where the map has no soil, or the time is not one it is held for, the country round's rocks stand.
    expect(firstGround(near, () => undefined)).toBe(near);
    expect(firstGround(undefined, () => undefined)).toBeUndefined();
    expect(groundHeld(maps.header.soil, -5000)).toBe(true);
    expect(groundHeld(maps.header.soil, -20000)).toBe(false);
    expect(groundHeld(undefined, 0)).toBe(false);
  });

  it('reads a class of bedrock as its kind of rock, and says nothing where the map has water or ice', () => {
    const basalt = bedrockAt(maps, mapRule, 45, -45)!;
    expect(basalt).toMatchObject({ tier: 'model', code: 'vb', label: 'Basic Volcanic Rocks', rock: 'basic-volcanic', source: 'src:map' });
    expect(bedrockWords(basalt)).toBe("Over basic volcanic rocks: today's map of the rock at the surface, carried back on its plate through the Holocene");
    // Loose sediment is no rock, and says only that.
    const loose = bedrockAt(maps, mapRule, 45, -135)!;
    expect(loose.rock).toBeUndefined();
    expect(bedrockWords(loose)).toMatch(/^On unconsolidated sediments/);
    expect(bedrockAt(maps, mapRule, 45, 45)).toBeUndefined();
    expect(bedrockAt(maps, mapRule, 45, 135)).toBeUndefined();
    expect(bedrockAt(maps, mapRule, -45, 0)).toBeUndefined();
    expect(bedrockAt(maps, rule, 45, -45)).toBeUndefined();
    // What the layer answers: the loose ground where something says what it is, and failing that the rock.
    expect(groundAnswer(substrateOfSoil(maps, mapRule, 45, -45), basalt)).toEqual({ tier: 'model', words: 'sand', from: 'soil', held: 'Holocene' });
    expect(groundAnswer(undefined, basalt)).toEqual({ tier: 'model', words: 'over basic volcanic rocks', from: 'bedrock', held: 'Holocene' });
    expect(groundAnswer(undefined, loose)).toEqual({ tier: 'model', words: 'unconsolidated sediments', from: 'bedrock', held: 'Holocene' });
    expect(groundAnswer(undefined, undefined)).toBeUndefined();
  });
});
