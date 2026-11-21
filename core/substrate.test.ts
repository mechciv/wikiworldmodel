import { describe, expect, it } from 'vitest';
import type { RockSite } from './rocks.ts';
import type { StrataColumn, StrataUnit } from './strata.ts';
import { bedrockAt, bedrockWords, firstGround, firstRock, groundAnswer, groundHeld, groundOfStrata, laidDownAs, soilAt, substrateOfSites, substrateOfSoil, substrateWords, unitLaidDownAs, unitRock, type GroundMaps, type SubstrateRule } from './substrate.ts';

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

// A column of rock with ages, in a vocabulary like Macrostrat's: each lithology has a type, a group and a class, and
// each environment a class. From the top: sands still being laid down; old gravels; a granite; a flood of basalt with a
// little tuff; river beds, with a marine limestone laid down beside them in their first half; a shore's sand, marine
// only; and an old marine limestone.
const said: { lithologies: Record<string, { type: string; group: string; cls: string }>; environments: Record<string, string> } = {
  lithologies: {
    sandstone: { type: 'siliciclastic', group: 'sandstones', cls: 'sedimentary' },
    arkose: { type: 'siliciclastic', group: 'sandstones', cls: 'sedimentary' },
    shale: { type: 'siliciclastic', group: 'mudrocks', cls: 'sedimentary' },
    alluvium: { type: 'siliciclastic', group: 'unconsolidated', cls: 'sedimentary' },
    sand: { type: 'siliciclastic', group: 'unconsolidated', cls: 'sedimentary' },
    gravel: { type: 'siliciclastic', group: 'unconsolidated', cls: 'sedimentary' },
    limestone: { type: 'carbonate', group: '', cls: 'sedimentary' },
    chert: { type: 'chemical', group: '', cls: 'sedimentary' },
    basalt: { type: 'volcanic', group: 'mafic', cls: 'igneous' },
    tuff: { type: 'volcanic', group: '', cls: 'igneous' },
    granite: { type: 'plutonic', group: 'felsic', cls: 'igneous' },
    quartzite: { type: 'metasedimentary', group: 'sandstones', cls: 'metamorphic' },
  },
  environments: { 'fluvial indet.': 'non-marine', 'inferred marine': 'marine', shoreface: 'marine' },
};
const unitsRule: SubstrateRule = {
  ...rule,
  lithologies: { ...rule.lithologies, sand: { sand: 1 }, gravel: { gravel: 1 }, tuff: { ash: 1 } },
  groups: { sandstones: { sand: 1 }, mudrocks: { mud: 1 } },
  strata: {
    sea_class: 'marine',
    laid_class: 'sedimentary',
    surface_types: ['volcanic'],
    rocks: {
      lithologies: { tuff: 'pyroclastic' },
      groups: { 'volcanic mafic': 'basic-volcanic', 'plutonic felsic': 'acid-plutonic', 'siliciclastic unconsolidated': 'loose' },
      types: { siliciclastic: 'siliciclastic', carbonate: 'carbonate' },
      classes: { metamorphic: 'metamorphic' },
    },
  },
};
// A unit's lithologies and environments each carry what the vocabulary says of them.
const unit = (n: number, name: string, older: number, younger: number, lithologies: [string, number, ...string[]][], environments: string[] = []): StrataUnit => ({
  unit: n,
  name,
  older,
  younger,
  environments: environments.map((e) => ({ name: e, cls: said.environments[e] })),
  lithologies: lithologies.map(([l, share, ...attributes]) => ({ name: l, ...said.lithologies[l], share, attributes })),
});
const column: StrataColumn = {
  column: 7,
  name: 'Red Basin',
  refs: ['A. Author, 1985, A chart.'],
  units: [
    unit(6, 'Young Sands', 2, 0, [['sand', 0.5], ['gravel', 0.5]], ['fluvial indet.']),
    unit(8, 'Old Gravels', 30, 20, [['gravel', 1]], ['fluvial indet.']),
    unit(5, 'The Granite', 80, 70, [['granite', 1]]),
    unit(4, 'Flood Basalt', 100, 99, [['basalt', 0.9], ['tuff', 0.1]]),
    unit(1, 'River Beds', 160, 150, [['sandstone', 0.6, 'red'], ['shale', 0.3], ['chert', 0.1]], ['fluvial indet.']),
    unit(2, 'Sea Lime', 160, 155, [['limestone', 1]], ['inferred marine']),
    unit(7, 'Shore Sand', 200, 195, [['sandstone', 1]], ['shoreface']),
    unit(3, 'Old Lime', 300, 290, [['limestone', 0.7], ['shale', 0.3]], ['inferred marine']),
  ],
};
const of = { field: 'field:strata', source: 'src:columns', credit: 'Rock units of a dataset' };
const at = (ageMa: number) => groundOfStrata(column, ageMa, of, unitsRule);

describe('what a rock of a unit was laid down as, and what kind of rock it is', () => {
  it('goes by its name, then its group, then its type, for a rock laid down as loose ground', () => {
    expect(unitLaidDownAs('sandstone', said.lithologies.sandstone, unitsRule)).toEqual({ sand: 1 });
    expect(unitLaidDownAs('arkose', said.lithologies.arkose, unitsRule)).toEqual({ sand: 1 });
    expect(unitLaidDownAs('shale', said.lithologies.shale, unitsRule)).toEqual({ mud: 1 });
    // A sediment of no stated grain goes by its type: half sand and half mud.
    expect(unitLaidDownAs('alluvium', said.lithologies.alluvium, unitsRule)).toEqual({ sand: 0.5, mud: 0.5 });
    expect(unitLaidDownAs('limestone', said.lithologies.limestone, unitsRule)).toEqual({ lime: 1 });
    expect(unitLaidDownAs('chert', said.lithologies.chert, unitsRule)).toBeUndefined();
  });

  it('lets an igneous or a metamorphic rock say so only by its name', () => {
    expect(unitLaidDownAs('tuff', said.lithologies.tuff, unitsRule)).toEqual({ ash: 1 });
    // A lava is of a type some rule may read as ash, and a quartzite of a group that is sand: neither is asked.
    const loose: SubstrateRule = { ...unitsRule, types: { ...unitsRule.types, volcanic: { ash: 1 } } };
    expect(unitLaidDownAs('basalt', said.lithologies.basalt, loose)).toBeUndefined();
    expect(unitLaidDownAs('quartzite', said.lithologies.quartzite, loose)).toBeUndefined();
    expect(unitLaidDownAs('granite', said.lithologies.granite, loose)).toBeUndefined();
    expect(unitLaidDownAs('a rock nobody listed', undefined, loose)).toBeUndefined();
    // Without the rule for units, only names speak.
    expect(unitLaidDownAs('arkose', said.lithologies.arkose, rule)).toBeUndefined();
  });

  it('names its kind of rock by its name, its type and group, its type, then its class', () => {
    const r = unitsRule.strata!;
    expect(unitRock('tuff', said.lithologies.tuff, r)).toBe('pyroclastic');
    expect(unitRock('basalt', said.lithologies.basalt, r)).toBe('basic-volcanic');
    expect(unitRock('granite', said.lithologies.granite, r)).toBe('acid-plutonic');
    expect(unitRock('sandstone', said.lithologies.sandstone, r)).toBe('siliciclastic');
    expect(unitRock('limestone', said.lithologies.limestone, r)).toBe('carbonate');
    expect(unitRock('quartzite', said.lithologies.quartzite, r)).toBe('metamorphic');
    expect(unitRock('sand', said.lithologies.sand, r)).toBe('loose');
    expect(unitRock('chert', said.lithologies.chert, r)).toBeUndefined();
    expect(unitRock('a rock nobody listed', undefined, r)).toBeUndefined();
  });
});

describe('the ground of a place, from the units of its column of rock', () => {
  it('is the unit being laid down then: its rocks by their shares, and as much of the ground as says what it was', () => {
    const { substrate: s, bedrock } = at(152);
    expect(bedrock).toBeUndefined();
    expect(s).toMatchObject({ tier: 'model', from: 'strata', source: 'src:columns', rows: ['src:columns#unit:1'], sites: 1, km: 0, column: 'Red Basin' });
    // Six tenths sandstone and three shale; the chert says nothing, so nine tenths of the ground is decided.
    expect(s!.weight).toBe(0.9);
    expect(s!.materials).toEqual([
      ['sand', 0.667],
      ['mud', 0.333],
    ]);
    // Red is said of the sandstone: two thirds of what was said.
    expect(s!.colours).toEqual([['red', 0.667]]);
    expect(s!.units).toEqual([{ name: 'River Beds', older: 160, younger: 150 }]);
    // The column's own reference goes with it.
    expect(s!.credit).toBe('Rock units of a dataset; this column from A. Author, 1985, A chart.');
    expect(substrateWords(s!)).toBe('Ground of sand, mud, red: River Beds, 160 to 150 Ma, the unit being laid down then in the column of rock for Red Basin');
    expect(groundAnswer(s, bedrock)).toEqual({ tier: 'model', words: 'sand and mud', from: 'strata' });
  });

  it('leaves out a unit laid down under the sea, and says nothing where every unit of the time is one', () => {
    // A marine limestone laid down beside the river beds: the land's ground is the river beds' alone.
    expect(at(157).substrate).toEqual(at(152).substrate);
    // A shore's sand, marine only: nothing of a land's ground, nor of the rock under it.
    expect(at(197)).toEqual({});
    expect(at(295)).toEqual({});
    // The class is each environment's own, not its name's: a vocabulary may call two environments a delta plain, one
    // of the sea and one of the land.
    const delta = (cls: string): StrataColumn => ({ ...column, units: [{ ...unit(9, 'Delta Sand', 60, 50, [['sandstone', 1]]), environments: [{ name: 'delta plain', cls }] }] });
    expect(groundOfStrata(delta('marine'), 55, of, unitsRule)).toEqual({});
    expect(groundOfStrata(delta('non-marine'), 55, of, unitsRule).substrate!.materials).toEqual([['sand', 1]]);
  });

  it('takes the youngest units from before a gap as the rock under the ground', () => {
    const { substrate, bedrock: b } = at(250);
    expect(substrate).toBeUndefined();
    expect(b).toMatchObject({ tier: 'model', from: 'strata', code: 'unit:3', label: 'limestone', rock: 'carbonate', field: 'field:strata', source: 'src:columns', rows: ['src:columns#unit:3'], column: 'Red Basin', laid: false });
    expect(b!.units).toEqual([{ name: 'Old Lime', older: 300, younger: 290 }]);
    expect(bedrockWords(b!)).toBe('Over limestone: Old Lime, 300 to 290 Ma, the youngest unit from before this time in the column of rock for Red Basin');
    expect(groundAnswer(undefined, b)).toEqual({ tier: 'model', words: 'over limestone', from: 'strata-under' });
    // Loose sediment from before is no rock.
    const gravels = at(10).bedrock!;
    expect(gravels.rock).toBeUndefined();
    expect(gravels.label).toBe('gravel');
    expect(bedrockWords(gravels)).toBe('On gravel: Old Gravels, 30 to 20 Ma, the youngest unit from before this time in the column of rock for Red Basin');
    // Before the column's oldest unit, and so with nothing from before, there is no answer.
    expect(at(400)).toEqual({});
  });

  it('takes a lava being laid down as the rock at the surface, and its ash as part of the ground', () => {
    const { substrate: s, bedrock: b } = at(99.5);
    expect(b).toMatchObject({ from: 'strata', label: 'basalt', rock: 'basic-volcanic', laid: true });
    expect(bedrockWords(b!)).toBe('Over basalt: Flood Basalt, 100 to 99 Ma, being laid down then in the column of rock for Red Basin');
    // A tenth of the unit is tuff: a tenth of the ground is ash, and the rest stays the climate's.
    expect(s).toMatchObject({ from: 'strata', weight: 0.1, materials: [['ash', 1]] });
    expect(substrateWords(s!)).toMatch(/^Ground partly of ash: Flood Basalt/);
  });

  it('reads through rock that formed at depth: a granite of the time is no ground, and the rock under it is what was there before', () => {
    // While the granite was emplaced, the youngest unit laid down before is the basalt.
    expect(at(75).bedrock).toMatchObject({ label: 'basalt', rock: 'basic-volcanic', laid: false });
    expect(at(75).substrate).toBeUndefined();
    // After it, the granite is the youngest the column has: the rock that lay over it then is in no column.
    expect(at(50).bedrock).toMatchObject({ label: 'granite', rock: 'acid-plutonic', laid: false, units: [{ name: 'The Granite', older: 80, younger: 70 }] });
  });

  it('reaches the present, and says nothing without the rule for units', () => {
    const now = at(0).substrate!;
    expect(now.materials).toEqual([
      ['gravel', 0.5],
      ['sand', 0.5],
    ]);
    expect(now.weight).toBe(1);
    expect(substrateWords(now)).toBe('Ground of gravel, sand: Young Sands, 2 Ma to the present, the unit being laid down then in the column of rock for Red Basin');
    expect(groundOfStrata(column, 152, of, rule)).toEqual({});
  });

  it('comes after a collection at the place and after the topsoil, and before the rocks of the country round', () => {
    const units = () => at(152).substrate;
    const soil = () => substrateOfSoil(maps, mapRule, 45, -135);
    const here = substrateOfSites([site(1, 12, [{ name: 'sandstone', adjectives: [] }])], index, rule)!;
    const near = substrateOfSites([site(1, 60, [{ name: 'mudstone', adjectives: [] }])], index, rule)!;
    expect(firstGround(here, soil, units)).toBe(here);
    expect(firstGround(near, soil, units)!.from).toBe('soil');
    expect(firstGround(near, () => undefined, units)!.from).toBe('strata');
    expect(firstGround(undefined, () => undefined, units)!.from).toBe('strata');
    expect(firstGround(near, () => undefined, () => undefined)).toBe(near);
    // The rock under the ground: today's map where it is held, and failing that the column's units.
    const map = bedrockAt(maps, mapRule, 45, -45)!;
    const under = () => at(250).bedrock;
    expect(firstRock(map, under)).toBe(map);
    expect(firstRock(undefined, under)!.from).toBe('strata');
    expect(firstRock(undefined, () => undefined)).toBeUndefined();
  });
});
