// The anonymous human landscape, in its parts: reading the anthromes' grids and the regions' shapes, ArchaeoGLOBE's
// snapshot, the lists of cities, the building traditions and their dwellings, and model:people/lifeways's rules. None
// needs a build; the snapshots are the repository's.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { agricultureAt, compileAgriculture, compileHusbandry, compileTraditions, cropProblems, cropsText, genericCropsFor, husbandryAt, dwellingProblems, fieldProblems, lifewayProblems, lifewayText, OUTBUILDING_LABEL, OUTBUILDING_ROOFED, OUTBUILDING_WORDS, outbuildingProblems, outbuildingsText, prevalenceOf, PREVALENCE_WORDS, settlementProblems, specText, traditionAt, traditionFor, traditionsFor, type LifewayWord, type Prevalence, type Tradition } from '../../../core/dwelling.ts';
import { anthromeTile, assessmentAt, cityPeople, citiesAround, citiesNear, classAtStep, figureAt, nameAt, LIFEWAY_OF, lifewayOf, nearestStep, shareDensity, tileKey, cellOf, type AnthromeClass, type Assessment, type CitiesFile, type City } from '../../../core/landscape.ts';
import type { PeopleFile } from '../../../core/layers.ts';
import { assessmentsFile, cityYear, citiesOf, eckert4Inverse, housing, housingCounts, parseClassGrid, rasterizeRegions, stepOfName, type LandscapeBuilt } from '../src/build/landscape.ts';
import { wantedRows, wantedText, wantedTotals } from '../src/dwellingsWanted.ts';
import { readTable, snapshotText, SLICES } from '../src/archaeoglobe.ts';
import { loadManifest } from '../src/manifest.ts';
import { REPO } from '../src/paths.ts';

const classes = (parse(readFileSync(join(REPO, 'world/fields/people/anthromes.yaml'), 'utf8')) as { params: { classes: AnthromeClass[] } }).params.classes;
const number = (code: number) => classes.findIndex((c) => c.code === code) + 1;
// The part of a region's settlements each word of a prevalence is drawn for, as a generator's parameters would give it.
const PARTS: Prevalence = { few: 0.1, some: 0.3, most: 0.75 };
const assess = (forage: number, swidden: number, farm: number, herd: number, urban = 0): Assessment => ({
  use: [forage, swidden, farm, herd].map((l) => [l, l, l, l] as [number, number, number, number]),
  urban,
  urbanMedian: urban,
  quality: 2,
  expertise: 2,
});

describe('the anthromes, read', () => {
  it('reads a grid of classes, nodata and unknown codes as no land', () => {
    const text = 'ncols 4\nnrows 2\nxllcorner -180\nyllcorner -90\ncellsize 0.0833333\nNODATA_value -9999\n11 23 -9999 70\n63 99 21 12\n';
    const out = new Uint8Array(8);
    const index = new Int16Array(100).fill(-1);
    classes.forEach((c, i) => (index[c.code] = i + 1));
    parseClassGrid(new TextEncoder().encode(text), out, index);
    expect([...out]).toEqual([number(11), number(23), 0, number(70), number(63), 0, number(21), number(12)]);
  });

  it('names its steps as HYDE does: 10000BC is −10000 and 0AD is 0', () => {
    expect(stepOfName('10000BC_anthromes.zip')).toBe(-10000);
    expect(stepOfName('0AD_anthromes.zip')).toBe(0);
    expect(stepOfName('2015AD_anthromes.zip')).toBe(2015);
    expect(stepOfName('Readme.txt')).toBeUndefined();
  });

  it('takes the step nearest a time, the earlier where two are as near, and none far outside them', () => {
    const steps = [-3000, -2000, -1000, 0, 100];
    expect(nearestStep(steps, -2600)).toBe(0);
    expect(nearestStep(steps, -2500)).toBe(0);
    expect(nearestStep(steps, -2400)).toBe(1);
    expect(nearestStep(steps, 60)).toBe(4);
    expect(nearestStep(steps, 151)).toBe(-1);
    expect(nearestStep(steps, -3600)).toBe(-1);
  });

  it('finds a place\'s tile and cell, a place on a tile\'s northern edge in that tile', () => {
    expect(tileKey(33.3, 44.4, 10).key).toBe('40_40');
    expect(tileKey(40, 44.4, 10).key).toBe('40_40');
    expect(tileKey(-90, -180, 10).key).toBe('-80_-180');
    expect(tileKey(10, 181, 10).key).toBe('10_-180');
    const tile = { north: 40, west: 40, nx: 120, ny: 120, res: 1 / 12 };
    expect(cellOf(tile, 40, 40)).toBe(0);
    expect(cellOf(tile, 39.95, 40.05)).toBe(0);
    expect(cellOf(tile, 30.01, 49.99)).toBe(119 * 120 + 119);
    expect(cellOf(tile, 29.99, 45)).toBe(-1);
  });
});

describe('the regions, read', () => {
  it('turns Eckert IV back into latitude and longitude', () => {
    // Forward, by the projection's formulas, then back.
    const R = 6378137;
    const forward = (lon: number, lat: number) => {
      const phi = (lat * Math.PI) / 180;
      let th = phi / 2;
      for (let i = 0; i < 40; i++) th -= (th + Math.sin(th) * Math.cos(th) + 2 * Math.sin(th) - (2 + Math.PI / 2) * Math.sin(phi)) / (2 * Math.cos(th) * (1 + Math.cos(th)));
      return [(2 / Math.sqrt(Math.PI * (4 + Math.PI))) * R * ((lon * Math.PI) / 180) * (1 + Math.cos(th)), 2 * Math.sqrt(Math.PI / (4 + Math.PI)) * R * Math.sin(th)];
    };
    for (const [lon, lat] of [[44.4, 33.3], [-77.04, -12.05], [151.2, -33.87], [-0.12, 51.5], [179, 80], [0, 0]]) {
      const [x, y] = forward(lon, lat);
      const [lo, la] = eckert4Inverse(x, y, R);
      expect(lo).toBeCloseTo(lon, 6);
      expect(la).toBeCloseTo(lat, 6);
    }
  });

  it('fills an outline into the grid, a hole left out', () => {
    const res = 1;
    const square = [[-10, 10], [10, 10], [10, -10], [-10, -10], [-10, 10]];
    const hole = [[-3, 3], [3, 3], [3, -3], [-3, -3], [-3, 3]];
    const grid = rasterizeRegions([{ id: 7, rings: [square, hole] }], 360, 180, res);
    const at = (lat: number, lon: number) => grid[Math.floor(90 - lat) * 360 + Math.floor(lon + 180)];
    expect(at(5, 5)).toBe(7);
    expect(at(-9.5, -9.5)).toBe(7);
    expect(at(0.5, 0.5)).toBe(0);
    expect(at(11, 0)).toBe(0);
  });
});

describe('ArchaeoGLOBE\'s snapshot', () => {
  const text = readFileSync(join(REPO, 'world/snapshots/archaeoglobe-2019-assessments.csv'), 'utf8');

  it('is the file the manifest pins', async () => {
    const d = (await loadManifest()).datasets['src:archaeoglobe-2019-assessments'];
    expect(createHash('sha256').update(text).digest('hex')).toBe(d.fetch.sha256);
    expect(Buffer.byteLength(text)).toBe(d.fetch.bytes);
  });

  it('has a row for each of the 146 regions at each of the ten times, as the build reads it', () => {
    const f = assessmentsFile(text, 'src:archaeoglobe-2019-assessments', 'test');
    expect(f.regions).toHaveLength(146);
    expect(f.slices.map((s) => s.year)).toEqual(SLICES.map((s) => s.year));
    for (const r of f.regions) expect(f.rows[String(r.id)]).toHaveLength(10);
    // Iraq at 4,000 BP: continuous farming and herding widespread, and cities.
    const iraq = f.rows['59'][3];
    expect(iraq.use[2][0]).toBe(3);
    expect(iraq.use[3][0]).toBe(3);
    expect(iraq.urban).toBe(1);
    // The least answer is never above the consensus' most.
    for (const rows of Object.values(f.rows)) for (const a of rows) for (const u of a.use) expect(u[1]).toBeLessThanOrEqual(u[3]);
  });

  it('joins tables whose columns are spelt more than one way, and refuses a level that is not one', () => {
    const head = 'Region,Label,FHG_10KBP,EXAGR_10KBP,INAG_10KBP,PAS_10KBP,URBAN_10kbp';
    const lower = 'Region,Label,FHG_10kbp,EXAG_10kbp,INAG_10kbp,PAS_10kbp';
    const one = (h: string, row: string) => `${h}\n${row}\n`;
    const tables = {
      consensus: one(head, '1,"Somewhere, else",Widespread,None,Minimal,Common,Absent'),
      minimum: one(lower, '1,"Somewhere, else",Common,None,None,Minimal'),
      median: one(lower, '1,"Somewhere, else",Widespread,None,Minimal,Common'),
      maximum: one(lower, '1,"Somewhere, else",Widespread,Minimal,Common,Widespread'),
      urban: one('Region,Label,URBAN_10kbp', '1,"Somewhere, else",Absent'),
      quality: one('Region,Label,DQ_10kbp', '1,"Somewhere, else",1.5'),
      expertise: one('Region,Label,EXPERTISE_10kbp', '1,"Somewhere, else",2'),
      excavations: one('Region,Label,SITES', '1,"Somewhere, else",50-249'),
    };
    const md5 = Object.fromEntries(Object.keys(tables).map((k) => [k, 'x'])) as never;
    // Only the first time is in these tables: the others are asked for and are missing.
    expect(() => snapshotText(tables, md5, md5)).toThrow(/no column/);
    expect(readTable(tables.consensus).get(1)!.Label).toBe('Somewhere, else');
    const bad = { ...tables, consensus: one(head, '1,x,Lots,None,Minimal,Common,Absent') };
    expect(() => snapshotText(bad, md5, md5)).toThrow(/not one of/);
  });

  it('takes the survey\'s time nearest, and holds its last time to the present', () => {
    const f = assessmentsFile(text, 'src:archaeoglobe-2019-assessments', 'test');
    expect(assessmentAt(f, 59, -2100)!.slice).toBe(3);
    expect(assessmentAt(f, 59, 1700)!.slice).toBe(8);
    expect(assessmentAt(f, 59, 2015)!.slice).toBe(9);
    expect(assessmentAt(f, 999, 0)).toBeUndefined();
  });
});

describe('the lists of cities', () => {
  const read = (file: string, field: string, leftOut: { city: string; columns: string[] }[] = []) =>
    citiesOf(new TextDecoder('latin1').decode(readFileSync(join(REPO, 'world/snapshots', file))), 'src:x', field, leftOut);

  it('reads a column as the axis does: BC_3000 is −2999 and AD_100 is 100', () => {
    expect(cityYear('BC_3000')).toBe(-2999);
    expect(cityYear('AD_1')).toBe(1);
    expect(cityYear('Latitude')).toBeUndefined();
  });

  it('reads Modelski\'s Uruk, and leaves out the cells its field says to', () => {
    const left = (parse(readFileSync(join(REPO, 'world/fields/people/cities-ancient.yaml'), 'utf8')) as { params: { left_out: { city: string; columns: string[] }[] } }).params.left_out;
    const cities = read('reba-2016-modelski-ancient-v2.csv', 'field:people/cities-ancient', left);
    const uruk = cities.find((c) => c.name === 'Uruk')!;
    expect(uruk.pops[0]).toEqual([-3499, 14000]);
    expect(uruk.pops).toContainEqual([-3299, 40000]);
    const teo = cities.find((c) => c.name === 'Teotihuacan')!;
    expect(teo.pops.every(([y]) => y > 0)).toBe(true);
  });

  it('stands a city between its figures, but not across a long silence', () => {
    const c: City = { name: 'X', country: 'Y', lat: 0, lon: 0, certainty: 1, source: 's', field: 'f', pops: [[1000, 15000], [1800, 925], [1850, 77000]] };
    expect(cityPeople(c, 1000, 50, 600)).toBe(15000);
    expect(cityPeople(c, 1040, 50, 600)).toBe(15000);
    expect(cityPeople(c, 1100, 50, 600)).toBeUndefined();
    expect(cityPeople(c, 1760, 50, 600)).toBe(925);
    expect(cityPeople(c, 1825, 50, 600)).toBe(Math.round(925 + (77000 - 925) / 2));
    expect(cityPeople(c, 1900, 50, 600)).toBe(77000);
    expect(cityPeople(c, 1901, 50, 600)).toBeUndefined();
  });

  it('makes one city of two lists\' figures for it, drawn with the larger, the other kept beside it', () => {
    const at = (name: string, source: string, people: number, lat = 41.89, lon = 12.48): City => ({ name, country: 'Italy', lat, lon, certainty: 1, source, field: source, pops: [[100, people]] });
    const f: CitiesFile = { format: 'lightworld-cities@1', lists: [{ source: 'a', field: 'a', title: 'A', hold: 50, gap: 600 }, { source: 'b', field: 'b', title: 'B', hold: 50, gap: 600 }], cities: [at('Rome', 'a', 450000), at('Rome', 'b', 1000000, 41.895, 12.484), at('Ostia', 'a', 50000, 41.75, 12.29)] };
    const near = citiesNear(f, 41.9, 12.5, 100, 40);
    expect(near.map((x) => [x.city.name, x.people])).toEqual([['Rome', 1000000], ['Ostia', 50000]]);
    expect(near[0].also.map((x) => x.people)).toEqual([450000]);
  });
});

describe('the lifeway, model:people/lifeways', () => {
  it('shares a 1° cell\'s people over its 5′ cells to the same total', () => {
    const ks = [number(23), number(32), number(52), number(61), 0, number(11)];
    const land = [80, 80, 80, 80, 0, 40];
    const d = shareDensity(classes, ks, land, 123456);
    expect(d.reduce((s, x, i) => s + x * land[i], 0)).toBeCloseTo(123456, 3);
    // Denser classes take more, wild land none.
    expect(d[0]).toBeGreaterThan(d[1]);
    expect(d[1]).toBeGreaterThan(d[2]);
    expect(d[3]).toBe(0);
    expect(d[5]).toBeGreaterThan(d[0]);
  });

  it('takes a village\'s use of the land from its class, and rests it on the archaeologists who say people farmed', () => {
    const l = lifewayOf(classes, number(21), 400, assess(1, 1, 3, 2));
    expect(l).toMatchObject({ pattern: 'villages', fields: 'rice', tier: 'evidence' });
    expect(lifewayOf(classes, number(22), 400, undefined)).toMatchObject({ pattern: 'villages', fields: 'irrigated', tier: 'model' });
  });

  it('asks the archaeologists which way of life it was, where the anthrome names no use of the land', () => {
    expect(lifewayOf(classes, number(52), 5, assess(1, 1, 3, 1))).toMatchObject({ pattern: 'farmsteads', fields: 'rainfed', tier: 'evidence' });
    expect(lifewayOf(classes, number(52), 5, assess(1, 3, 1, 1))).toMatchObject({ pattern: 'shifting', fields: 'swidden' });
    expect(lifewayOf(classes, number(54), 0.5, assess(1, 0, 0, 3))).toMatchObject({ pattern: 'herders', fields: 'pasture' });
    expect(lifewayOf(classes, number(53), 0.5, assess(3, 2, 2, 0))).toMatchObject({ pattern: 'foragers', tier: 'evidence' });
    // Nothing known of the region: foragers stand in, and say so.
    expect(lifewayOf(classes, number(53), 0.5, undefined)).toMatchObject({ pattern: 'foragers', tier: 'generic' });
  });

  it('says where HYDE and the archaeologists disagree, and rests the pattern on HYDE alone there', () => {
    const fields = lifewayOf(classes, number(32), 40, assess(3, 0, 0, 1));
    expect(fields.disagrees).toMatch(/no farming/);
    expect(fields.tier).toBe('model');
    const empty = lifewayOf(classes, number(61), 0, assess(3, 2, 2, 0));
    expect(empty.pattern).toBe('none');
    expect(empty.disagrees).toMatch(/foraging and farming was common or widespread/);
  });
});

describe('building traditions', () => {
  it('checks a dwelling, a settlement form and a field system word by word', () => {
    expect(dwellingProblems({ plan: 'round', diameter: { lo: 5, hi: 15 }, walls: 'wattle-and-daub', roof: 'conical', roof_material: 'thatch', court: false })).toEqual([]);
    expect(dwellingProblems({ plan: 'hexagonal' })).toEqual([expect.stringMatching(/^plan is one of/)]);
    expect(dwellingProblems({ width: -1 })).toEqual([expect.stringMatching(/positive number/)]);
    expect(dwellingProblems({ colour: 'red' })).toEqual([expect.stringMatching(/has no "colour"/)]);
    expect(dwellingProblems({})).toEqual(['a dwelling says something']);
    expect(settlementProblems({ pattern: 'nucleated', houses: { lo: 20, hi: 10 } })).toEqual([expect.stringMatching(/houses is/)]);
    expect(fieldProblems({ kind: 'paddies', plot: 0.1, bounds: 'dikes' })).toEqual([]);
    expect(specText({ plan: 'round', diameter: { lo: 5, hi: 15 }, roof: 'conical', roof_material: 'thatch' })).toBe('round plan, 5–15 m across, conical roof, roofed with thatch');
  });

  it('checks the house in detail: its door, its windows, its smoke, its finish, and what stood against it', () => {
    expect(dwellingProblems({ entrance: 'end', faces: 'south-east', windows: 'none', smoke: 'hole', finish: 'lime', porch: true, veranda: false, byre: true, floor: 'stilts', floor_height: { lo: 2.4, hi: 3.7 }, pitch: 50 })).toEqual([]);
    expect(dwellingProblems({ walls: 'timber-frame', roof: 'hip-and-gable', roof_material: 'leaves', plan: 'l-shaped' })).toEqual([]);
    expect(dwellingProblems({ faces: 'up' })).toEqual([expect.stringMatching(/^faces is one of north, north-east/)]);
    expect(dwellingProblems({ porch: 'yes' })).toEqual(['porch is true or false']);
    expect(dwellingProblems({ pitch: 95 })).toEqual([expect.stringMatching(/less than 90/)]);
    expect(dwellingProblems({ smoke: 'louvre' })).toEqual([expect.stringMatching(/^smoke is one of none, hole, gable, chimney/)]);
    expect(settlementProblems({ layout: 'ring', enclosure: 'hedge', yard: 'fence', plaza: true })).toEqual([]);
    expect(settlementProblems({ enclosure: 'moat' })).toEqual([expect.stringMatching(/^enclosure is one of none, fence, hedge, palisade, bank, ditch, wall/)]);
    expect(specText({ plan: 'long', entrance: 'end', faces: 'south', windows: 'none', smoke: 'hole', byre: true, floor: 'stilts', floor_height: { lo: 2.4, hi: 3.7 }, pitch: 50 })).toBe(
      'long plan, its door in an end, its entrance to the south, no windows, a smoke hole in the roof, animals under its roof, stilts floor, its floor 2.4–3.7 m above the ground, its roof pitched at 50°',
    );
    expect(specText({ floor: 'sunken', floor_height: 1.2 })).toBe('sunken floor, its floor 1.2 m below the ground');
    expect(specText({ layout: 'ring', enclosure: 'hedge', yard: 'fence', plaza: true })).toBe('in a ring, within a hedge, yards fenced, round open ground at its middle');
  });

  it('checks what stood by the houses: each with its use and whose it was, in the words of a dwelling', () => {
    expect(outbuildingProblems([{ use: 'granary', per: 'house', plan: 'round', diameter: 2, floor: 'stilts' }, { use: 'pen', per: 'settlement', enclosure: 'hedge', diameter: { lo: 20, hi: 30 } }, { use: 'shrine', per: 'settlement', count: { lo: 16, hi: 23 } }])).toEqual([]);
    expect(outbuildingProblems([])).toEqual([expect.stringMatching(/a list of one or more/)]);
    expect(outbuildingProblems({ use: 'granary', per: 'house' })).toEqual([expect.stringMatching(/a list of one or more/)]);
    expect(outbuildingProblems([{ per: 'house' }])).toEqual([expect.stringMatching(/outbuilding 1: it says its use/)]);
    expect(outbuildingProblems([{ use: 'granary' }])).toEqual([expect.stringMatching(/outbuilding 1: it says whose it was/)]);
    expect(outbuildingProblems([{ use: 'barn', per: 'house' }])).toEqual([expect.stringMatching(/outbuilding 1: use is one of granary, store, byre/)]);
    expect(outbuildingProblems([{ use: 'well', per: 'village' }])).toEqual([expect.stringMatching(/outbuilding 1: per is one of house, settlement/)]);
    expect(outbuildingProblems([{ use: 'well', per: 'house', count: 0 }])).toEqual([expect.stringMatching(/count is a positive number/)]);
    expect(outbuildingsText([{ use: 'granary', per: 'house', count: { lo: 0.2, hi: 0.25 }, plan: 'round', floor: 'stilts' }, { use: 'pen', per: 'settlement', enclosure: 'hedge' }, { use: 'hall', per: 'settlement', count: 3 }])).toBe(
      'a granary, 0.2–0.25 to a household (round plan, stilts floor); a pen of the settlement (of hedging); a meeting house, 3 in a settlement',
    );
    // Every use has its name, and is roofed or not.
    for (const use of Object.keys(OUTBUILDING_WORDS.use)) {
      expect(OUTBUILDING_LABEL[use as keyof typeof OUTBUILDING_LABEL]).toMatch(/^an? /);
      expect(typeof OUTBUILDING_ROOFED[use as keyof typeof OUTBUILDING_ROOFED]).toBe('boolean');
    }
  });

  it("takes a member's list of outbuildings whole where it gives one, and its parent's where it gives none", () => {
    const list = compileTraditions([
      { id: 'a', label: 'Parent', regions: [1], span: [-3000, 500], lifeways: ['farmers'], dwelling: { plan: 'round' }, settlement: { enclosure: 'hedge', yard: 'fence' }, outbuildings: [{ use: 'granary', per: 'house' }, { use: 'pen', per: 'settlement' }] },
      { id: 'b', label: 'Takes its parent\'s', parent: 'a', regions: [], span: [-100, 100], dwelling: { walls: 'stone' } },
      { id: 'c', label: 'Gives its own', parent: 'a', regions: [], span: [-100, 100], settlement: { enclosure: 'wall' }, outbuildings: [{ use: 'well', per: 'settlement' }] },
      { id: 'd', label: 'Has none', regions: [2], span: [-100, 100], dwelling: { plan: 'round' } },
    ]);
    const of = (id: string) => list.find((x) => x.id === id)!;
    expect(of('b').outbuildings).toEqual(of('a').outbuildings);
    expect(of('b').from.outbuildings).toBe('a');
    expect(of('b').settlement).toEqual({ enclosure: 'hedge', yard: 'fence' });
    expect(of('c').outbuildings).toEqual([{ use: 'well', per: 'settlement' }]);
    expect(of('c').from).toMatchObject({ outbuildings: 'c', 'settlement.enclosure': 'c', 'settlement.yard': 'a' });
    expect(of('d').outbuildings).toBeUndefined();
  });

  it('inherits what a member does not say from the tradition it is a member of, and says whose each part is', () => {
    const [child, parent] = compileTraditions([
      { id: 'b', label: 'Child', parent: 'a', regions: [], span: [-100, 100], dwelling: { roof: 'flat' } },
      { id: 'a', label: 'Parent', regions: [59, 61], span: [-3000, 500], lifeways: ['farmers', 'townspeople'], dwelling: { plan: 'courtyard', walls: 'mudbrick', roof: 'gable' }, settlement: { household: 6 } },
    ]).sort((x, y) => (x.id < y.id ? 1 : -1));
    expect(child.dwelling).toEqual({ plan: 'courtyard', walls: 'mudbrick', roof: 'flat' });
    expect(child.from).toMatchObject({ 'dwelling.roof': 'b', 'dwelling.walls': 'a', 'settlement.household': 'a' });
    expect(child.regions).toEqual([59, 61]);
    expect(child.depth).toBe(1);
    expect(parent.depth).toBe(0);
    // Whom it housed is its parent's to say where it does not, and its own, whole, where it does.
    expect(child.lifeways).toEqual(['farmers', 'townspeople']);
    expect(child.from.lifeway).toBe('a');
    const [own] = compileTraditions([
      { id: 'c', label: 'Its own', parent: 'a', regions: [], span: [-100, 100], lifeways: ['herders'], dwelling: { walls: 'felt' } },
      { id: 'a', label: 'Parent', regions: [59], span: [-3000, 500], lifeways: ['farmers'], dwelling: { plan: 'courtyard' } },
    ]).sort((x, y) => (x.id < y.id ? 1 : -1));
    expect(own.lifeways).toEqual(['herders']);
    expect(own.from.lifeway).toBe('c');
  });

  it("keeps a husbandry tradition's animals, with whose they were, and gives the most particular for a way of life", () => {
    const list = compileHusbandry([
      { id: 'broad', label: 'Farm animals', regions: [1, 2], span: [-3000, 1500], lifeways: ['farmers', 'townspeople'], animals: ['cattle', 'pigs'] },
      { id: 'narrow', label: 'Later farm animals', parent: 'broad', regions: [1], span: [0, 1500], animals: ['cattle', 'pigs', 'hens'] },
      { id: 'steppe', label: 'Herds', regions: [1], span: [-3000, 1500], lifeways: ['herders'], animals: ['horses', 'sheep'] },
      { id: 'empty', label: 'Says nothing', regions: [1], span: [-3000, 1500], lifeways: ['foragers'] },
    ]);
    const narrow = list.find((x) => x.id === 'narrow')!;
    // A member takes whose it was from its parent, and says its animals whole.
    expect(narrow).toMatchObject({ lifeways: ['farmers', 'townspeople'], animals: ['cattle', 'pigs', 'hens'], depth: 1, from: { lifeway: 'broad', livestock: 'narrow' } });
    expect(husbandryAt(list, 1, 500, 'farmers')!.id).toBe('narrow');
    expect(husbandryAt(list, 1, -500, 'farmers')!.id).toBe('broad');
    expect(husbandryAt(list, 2, 500, 'townspeople')!.id).toBe('broad');
    expect(husbandryAt(list, 1, 500, 'herders')!.id).toBe('steppe');
    // No animals for a way of life none names, nor from a tradition that names none.
    expect(husbandryAt(list, 1, 500, 'shifting-cultivators')).toBeUndefined();
    expect(husbandryAt(list, 1, 500, 'foragers')).toBeUndefined();
    expect(husbandryAt(list, 3, 500, 'farmers')).toBeUndefined();
  });

  it('checks crop lists, compiles agricultural traditions with inheritance, and selects crops by region, time and lifeway', () => {
    expect(cropProblems([{ kind: 'millet', name: 'Foxtail millet', season: 'summer', share: 'staple' }, { kind: 'wheat', season: 'winter', share: 'secondary' }])).toEqual([]);
    expect(cropProblems([])).toEqual([expect.stringMatching(/one or more entries/)]);
    expect(cropProblems([{ kind: 'turnip' }])).toEqual([expect.stringMatching(/not one of/)]);
    expect(cropProblems([{ kind: 'millet', season: 'spring' }])).toEqual([expect.stringMatching(/season "spring"/)]);
    expect(cropProblems([{ kind: 'millet', share: 'half' }])).toEqual([expect.stringMatching(/share "half"/)]);
    expect(cropProblems([{ kind: 'millet', extra: 1 }])).toEqual([expect.stringMatching(/unknown crop parameter/)]);
    expect(cropsText([{ kind: 'millet', name: 'Foxtail millet', season: 'summer' }, { kind: 'wheat', season: 'summer' }])).toBe('Foxtail millet, Wheat (summer)');

    const list = compileAgriculture([
      {
        id: 'broad',
        label: 'Northern China dryland',
        regions: [119, 120],
        span: [-4000, 1e9],
        lifeways: ['farmers'],
        crops: [{ kind: 'millet', name: 'Foxtail millet', season: 'summer', share: 'staple' }, { kind: 'soybean', season: 'summer', share: 'secondary' }],
        fields: { kind: 'blocks', bounds: 'banks' },
      },
      {
        id: 'han',
        label: 'Han dryland',
        parent: 'broad',
        regions: [],
        span: [-202, 220],
        crops: [{ kind: 'millet', name: 'Foxtail millet', season: 'summer', share: 'staple' }, { kind: 'wheat', name: 'Winter wheat', season: 'winter', share: 'secondary' }],
      },
    ]);
    const han = list.find((x) => x.id === 'han')!;
    expect(han).toMatchObject({ depth: 1, regions: [119, 120], lifeways: ['farmers'], fields: { kind: 'blocks', bounds: 'banks' }, from: { lifeway: 'broad', crops: 'han', 'fields.kind': 'broad' } });
    // Han overrides broad inside its span, and applies to townspeople's surrounding fields as well as farmers.
    expect(agricultureAt(list, 120, 147, 'farmers')!.id).toBe('han');
    expect(agricultureAt(list, 120, 147, 'townspeople')!.id).toBe('han');
    expect(agricultureAt(list, 120, -1000, 'farmers')!.id).toBe('broad');
    expect(agricultureAt(list, 120, 147, 'herders')).toBeUndefined();
    expect(agricultureAt(list, 999, 147, 'farmers')).toBeUndefined();

    // Generic fallback picks rice for wetland rice, roots for swidden/rainforest, millet for steppe, wheat/barley for temperate.
    expect(genericCropsFor('rice', 'temperate')[0].kind).toBe('rice');
    expect(genericCropsFor('swidden', 'temperate')[0].kind).toBe('root');
    expect(genericCropsFor('rainfed', 'steppe')[0].kind).toBe('millet');
    expect(genericCropsFor('rainfed', 'temperate')[0].kind).toBe('wheat');
  });

  it('checks whom a tradition housed word by word', () => {
    expect(lifewayProblems(['foragers'])).toEqual([]);
    expect(lifewayProblems(['farmers', 'townspeople'])).toEqual([]);
    expect(lifewayProblems('farmers')).toEqual([expect.stringMatching(/a list of one or more/)]);
    expect(lifewayProblems([])).toEqual([expect.stringMatching(/a list of one or more/)]);
    expect(lifewayProblems(['peasants'])).toEqual([expect.stringMatching(/"peasants" is not a way of life/)]);
    expect(lifewayProblems(['farmers', 'farmers'])).toEqual([expect.stringMatching(/each way of life once/)]);
    expect(lifewayText(['shifting-cultivators', 'farmers', 'townspeople'])).toBe('shifting cultivators, farmers and townspeople');
    // Every pattern of settlement the model draws has a way of life a tradition can name.
    for (const word of Object.values(LIFEWAY_OF)) expect(lifewayProblems([word])).toEqual([]);
  });

  it('draws a place\'s houses from the most particular tradition that holds there and then', () => {
    const list = compileTraditions([
      { id: 'broad', label: 'Broad', regions: [1, 2, 3], span: [-3000, 1500], lifeways: ['farmers'], dwelling: { walls: 'mudbrick' } },
      { id: 'narrow', label: 'Narrow', regions: [1], span: [-2000, -1000], lifeways: ['farmers'], dwelling: { walls: 'stone' } },
      { id: 'member', label: 'Member', parent: 'broad', regions: [2], span: [0, 500], dwelling: { roof: 'flat' } },
    ]);
    expect(traditionAt(list, 1, -1500, 'farmers')!.id).toBe('narrow');
    expect(traditionAt(list, 1, -500, 'farmers')!.id).toBe('broad');
    expect(traditionAt(list, 2, 100, 'farmers')!.id).toBe('member');
    expect(traditionAt(list, 3, 100, 'farmers')!.id).toBe('broad');
    expect(traditionAt(list, 4, 100, 'farmers')).toBeUndefined();
    expect(traditionAt(list, 1, 1600, 'farmers')).toBeUndefined();
  });

  it('draws a tradition\'s house only for the ways of life it says it housed', () => {
    const list = compileTraditions([
      { id: 'tent', label: 'A tent', regions: [1], span: [-3000, 1500], lifeways: ['herders'], dwelling: { walls: 'felt' } },
      { id: 'house', label: 'A house', regions: [1], span: [-3000, 1500], lifeways: ['farmers', 'townspeople'], dwelling: { walls: 'mudbrick' } },
      { id: 'silent', label: 'It does not say', regions: [1], span: [-3000, 1500], dwelling: { walls: 'stone' } },
    ]);
    expect(traditionAt(list, 1, 0, 'herders')!.id).toBe('tent');
    expect(traditionAt(list, 1, 0, 'farmers')!.id).toBe('house');
    expect(traditionAt(list, 1, 0, 'townspeople')!.id).toBe('house');
    // No tradition of the region houses its foragers or its shifting cultivators; and one that does not say houses no one.
    expect(traditionAt(list, 1, 0, 'foragers')).toBeUndefined();
    expect(traditionAt(list, 1, 0, 'shifting-cultivators')).toBeUndefined();
    expect(list.find((x) => x.id === 'silent')!.lifeways).toEqual([]);
  });

  it('lets the house of farmers stand in for shifting cultivators who have none, and says so; a tent for no one else', () => {
    const list = compileTraditions([
      { id: 'tent', label: 'A tent', regions: [1], span: [-3000, 1500], lifeways: ['herders'], dwelling: { walls: 'felt' } },
      { id: 'house', label: 'A house', regions: [1], span: [-3000, 1500], lifeways: ['farmers', 'townspeople'], dwelling: { walls: 'mudbrick' } },
      { id: 'swidden', label: 'A swidden house', regions: [2], span: [-3000, 1500], lifeways: ['shifting-cultivators'], dwelling: { walls: 'pole-and-thatch' } },
    ]);
    expect(traditionFor(list, 1, 0, 'farmers', PARTS)).toEqual({ tradition: expect.objectContaining({ id: 'house' }), share: 1 });
    expect(traditionFor(list, 1, 0, 'shifting-cultivators', PARTS)).toEqual({ tradition: expect.objectContaining({ id: 'house' }), kin: 'farmers', share: 1 });
    expect(traditionFor(list, 2, 0, 'farmers', PARTS)).toEqual({ tradition: expect.objectContaining({ id: 'swidden' }), kin: 'shifting-cultivators', share: 1 });
    // Townspeople, herders and foragers take only a house written for them.
    expect(traditionFor(list, 2, 0, 'townspeople', PARTS)).toBeUndefined();
    expect(traditionFor(list, 1, 0, 'foragers', PARTS)).toBeUndefined();
    expect(traditionFor(list, 2, 0, 'herders', PARTS)).toBeUndefined();
  });

  it('draws a house that a few lived in for a part of them, and the rest in the house of the region', () => {
    const list = compileTraditions([
      { id: 'house', label: 'A house', regions: [1, 2], span: [-3000, 1500], lifeways: ['farmers'], dwelling: { walls: 'mudbrick' } },
      // Later in the list of the most particular than the house, by its id alone: it takes its part all the same.
      { id: 'tower', label: 'A tower', regions: [1, 2], span: [-3000, 1500], lifeways: ['farmers'], prevalence: 'few', dwelling: { walls: 'rammed-earth' } },
      { id: 'cave', label: 'A cave house', regions: [1], span: [-3000, 1500], lifeways: ['farmers'], prevalence: 'some', dwelling: { walls: 'earth-cut' } },
      { id: 'hall', label: 'A hall', regions: [3], span: [-3000, 1500], lifeways: ['farmers'], prevalence: 'most', dwelling: { walls: 'timber' } },
      { id: 'hut', label: 'A hut', regions: [3], span: [-3000, 1500], lifeways: ['shifting-cultivators'], dwelling: { walls: 'pole-and-thatch' } },
      // A member of a tradition that says a few lived so does not take the word from it.
      { id: 'tower/late', label: 'A late tower', parent: 'tower', regions: [4], span: [-3000, 1500], dwelling: { storeys: 4 } },
    ]);
    const shares = (region: number, way: LifewayWord) => traditionsFor(list, region, 0, way, PARTS).map((x) => [x.tradition.id, Math.round(x.share * 100) / 100, ...(x.kin ? [x.kin] : [])]);
    // Those that say how many take their parts, the most particular first; the house of the region takes the rest.
    expect(shares(1, 'farmers')).toEqual([['cave', 0.3], ['tower', 0.1], ['house', 0.6]]);
    expect(shares(2, 'farmers')).toEqual([['tower', 0.1], ['house', 0.9]]);
    // Where none is the house of them all, a house written for a way of life kin to theirs stands in for the rest.
    expect(shares(3, 'farmers')).toEqual([['hall', 0.75], ['hut', 0.25, 'shifting-cultivators']]);
    expect(shares(3, 'shifting-cultivators')).toEqual([['hut', 1]]);
    expect(shares(4, 'farmers')).toEqual([['tower/late', 1]]);
    // The house of most of them is the region's, for a panel; a settlement falls to one by a number of its own.
    expect(traditionFor(list, 1, 0, 'farmers', PARTS)!.tradition.id).toBe('house');
    expect([0, 0.29, 0.3, 0.39, 0.4, 0.99].map((u) => traditionFor(list, 1, 0, 'farmers', PARTS, u)!.tradition.id)).toEqual(['cave', 'cave', 'tower', 'tower', 'house', 'house']);
    // With no parts given, a tradition that says a few lived so draws none of them; and what nobody houses is generic.
    expect(traditionsFor(list, 1, 0, 'farmers', prevalenceOf(undefined)).map((x) => x.tradition.id)).toEqual(['house']);
    const alone = compileTraditions([{ id: 'tower', label: 'A tower', regions: [1], span: [-3000, 1500], lifeways: ['farmers'], prevalence: 'few', dwelling: { walls: 'rammed-earth' } }]);
    expect(traditionFor(alone, 1, 0, 'farmers', PARTS, 0.05)!.tradition.id).toBe('tower');
    expect(traditionFor(alone, 1, 0, 'farmers', PARTS, 0.5)).toBeUndefined();
  });

  it('has the words of a prevalence the vocabulary declares', () => {
    const vocab = parse(readFileSync(join(REPO, 'world/schema/vocab/properties.yaml'), 'utf8')) as { properties: Record<string, { values?: Record<string, string> }> };
    expect(Object.keys(vocab.properties.prevalence.values!)).toEqual([...PREVALENCE_WORDS]);
  });
});

describe('whose houses rest on a tradition', () => {
  // A made-up world of one 10° tile, north of the equator and east of the meridian, at two steps. Two 1° cells hold
  // people: one of rainfed villages in region 1, one half populated rangeland and half wild, in region 2.
  const steps = [0, 1000];
  const side = 120;
  const village = { north: 5, west: 3 };
  const range = { north: 5, west: 6 };
  const counts = new Uint8Array(side * side);
  const runs: number[] = [];
  const region = new Uint8Array(side * side);
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) {
    const lat = 10 - (r + 0.5) / 12;
    const lon = (c + 0.5) / 12;
    const inCell = (x: { north: number; west: number }) => lat < x.north && lat > x.north - 1 && lon > x.west && lon < x.west + 1;
    const k = inCell(village) ? number(23) : inCell(range) ? (lon < range.west + 0.5 ? number(42) : number(62)) : 0;
    if (!k) continue;
    counts[r * side + c] = 1;
    runs.push(k, 0);
    region[r * side + c] = inCell(village) ? 1 : 2;
  }
  const tile = anthromeTile({ format: 'lightworld-anthromes@1', north: 10, west: 0, nx: side, ny: side, res: 1 / 12, steps }, counts, new Uint8Array(runs), region);
  const a = (forage: number, swidden: number, farm: number, herd: number, urban = 0): Assessment => ({ use: [forage, swidden, farm, herd].map((l) => [l, l, l, l] as [number, number, number, number]), urban, urbanMedian: urban, quality: 2, expertise: 2 });
  const place = (x: { north: number; west: number }) => (90 - x.north) * 360 + (x.west + 180);
  // 144,000 villagers and 7,200 herders at the first step; twice as many at the second.
  const people = { res: 1, steps, cell: new Uint32Array([place(village), place(range)]), land: new Uint32Array([12000, 12000]), people: new Uint32Array([144000, 7200, 288000, 14400]) } as unknown as PeopleFile;
  const built = (traditions: Tradition[]) =>
    ({
      index: { steps, tile_deg: 10, generator: { generator: 'gen:test', version: 1, params: { prevalence: PARTS } } },
      classes,
      tile: (key: string) => (key === '10_0' ? tile : undefined),
      at: (lat: number, lon: number) => {
        const cell = cellOf(tile, lat, lon);
        return cell < 0 ? { anthrome: 0, region: 0 } : { anthrome: classAtStep(tile, cell, 0), region: tile.region[cell] };
      },
      assessments: { format: 'lightworld-assessments@1', source: 'src:test', title: 'Test', slices: [{ year: 0, label: 'then' }], regions: [{ id: 1, label: 'One' }, { id: 2, label: 'Two' }], rows: { '1': [a(1, 1, 3, 1, 1)], '2': [a(1, 0, 0, 3)] } },
      traditions,
      cities: { format: 'lightworld-cities@1', lists: [{ source: 'src:list', field: 'field:test', title: 'A list', hold: 50, gap: 600 }], cities: [{ name: 'Testopolis', country: 'Nowhere', lat: 4.5, lon: 3.5, certainty: 1, source: 'src:list', field: 'field:test', pops: [[0, 30000]] }] },
    }) as unknown as LandscapeBuilt;
  const house = { id: 'house', label: 'A house', regions: [1], span: [-500, 500] as [number, number], lifeways: ['farmers', 'townspeople'] as LifewayWord[], dwelling: { walls: 'mudbrick' as const } };

  it('counts the people of each region by how they lived, as a scene shares them, with the tradition that houses them', () => {
    const rows = housing(built(compileTraditions([house])), people, [0, 1000, 5000]);
    // The villagers are all villagers, and the tradition written for the farmers of their region houses them while it holds.
    expect(rows.filter((r) => r.t === 0)).toEqual([
      { t: 0, region: 1, pattern: 'villages', people: 144000, tradition: 'house' },
      { t: 0, region: 2, pattern: 'herders', people: 7200 },
    ]);
    // At the second step the tradition has ended; beyond the people's steps nothing is counted.
    expect(rows.filter((r) => r.t === 1000)).toEqual([
      { t: 1000, region: 1, pattern: 'villages', people: 288000 },
      { t: 1000, region: 2, pattern: 'herders', people: 14400 },
    ]);
    expect(rows.filter((r) => r.t === 5000)).toEqual([]);
  });

  it('houses the herders only once a tradition says it housed herders', () => {
    const tent = { id: 'tent', label: 'A tent', regions: [2], span: [-500, 500] as [number, number], lifeways: ['herders'] as LifewayWord[], dwelling: { walls: 'felt' as const } };
    const farmhouse = { id: 'farmhouse', label: 'A farmhouse', regions: [2], span: [-500, 500] as [number, number], lifeways: ['farmers'] as LifewayWord[], dwelling: { walls: 'timber' as const } };
    expect(housing(built(compileTraditions([house, farmhouse])), people, [0]).find((r) => r.region === 2)!.tradition).toBeUndefined();
    expect(housing(built(compileTraditions([house, tent])), people, [0]).find((r) => r.region === 2)!.tradition).toBe('tent');
  });

  it("counts shifting cultivators in the house of their region's farmers as housed, by a stand-in", () => {
    // The herders' region has only a farmhouse: no tent, so no house for them. A region of shifting cultivators would take it.
    const swidden = { id: 'farm', label: 'A farm', regions: [2], span: [-500, 500] as [number, number], lifeways: ['shifting-cultivators'] as LifewayWord[], dwelling: { walls: 'timber' as const } };
    const b = built(compileTraditions([swidden, { ...house, regions: [9] }]));
    // The villagers of region 1 have no tradition of their own region; those of a region with a swidden house take it.
    const moved = built(compileTraditions([{ ...swidden, regions: [1] }]));
    expect(housing(b, people, [0]).find((r) => r.region === 1)!.tradition).toBeUndefined();
    const row = housing(moved, people, [0]).find((r) => r.region === 1)!;
    expect(row).toMatchObject({ pattern: 'villages', tradition: 'farm', kin: 'shifting-cultivators' });
    expect(housingCounts(moved, housing(moved, people, [0]))[0]).toMatchObject({ housed: 144000, standIn: 144000 });
  });

  it('shares the people of a region among the traditions that say how many lived in their houses', () => {
    const tower = { id: 'tower', label: 'A tower', regions: [1], span: [-500, 500] as [number, number], lifeways: ['farmers'] as LifewayWord[], prevalence: 'few' as const, dwelling: { walls: 'rammed-earth' as const } };
    const both = built(compileTraditions([house, tower]));
    expect(housing(both, people, [0]).filter((r) => r.region === 1)).toEqual([
      { t: 0, region: 1, pattern: 'villages', people: 14400, tradition: 'tower' },
      { t: 0, region: 1, pattern: 'villages', people: 129600, tradition: 'house' },
    ]);
    // A house of a few, alone: the rest are in generic houses, and counted so.
    const alone = built(compileTraditions([tower]));
    expect(housing(alone, people, [0]).filter((r) => r.region === 1)).toEqual([
      { t: 0, region: 1, pattern: 'villages', people: 14400, tradition: 'tower' },
      { t: 0, region: 1, pattern: 'villages', people: 129600 },
    ]);
    expect(housingCounts(alone, housing(alone, people, [0]))[0]).toMatchObject({ people: 151200, housed: 14400, by: { villages: [144000, 14400] }, regions: [2, 1] });
    const rows = wantedRows(housing(alone, people, [0]), new Map([[1, 'One'], [2, 'Two']]));
    expect(rows.filter((r) => r.region === 1)).toEqual([
      { region: 1, label: 'One', t: 0, lifeway: 'farmers', people: 14400, tradition: 'tower' },
      { region: 1, label: 'One', t: 0, lifeway: 'farmers', people: 129600 },
    ]);
  });

  it('adds them up for the coverage: people and those housed, by pattern, the regions, and the cities of the lists', () => {
    const b = built(compileTraditions([house]));
    const [then, later] = housingCounts(b, housing(b, people, [0, 1000]));
    expect(then).toEqual({ t: 0, people: 151200, housed: 144000, by: { villages: [144000, 144000], herders: [7200, 0] }, regions: [2, 1], cities: [1, 30000, 30000] });
    // Later no tradition holds, and the list is silent about its city.
    expect(later).toEqual({ t: 1000, people: 302400, housed: 0, by: { villages: [288000, 0], herders: [14400, 0] }, regions: [2, 0], cities: [0, 0, 0] });
  });

  it('lists what most wants a tradition by region, time and way of life', () => {
    const b = built(compileTraditions([house]));
    const rows = wantedRows(housing(b, people, [0, 1000]), new Map([[1, 'One'], [2, 'Two']]));
    expect(rows.find((r) => r.t === 0 && r.region === 1)).toEqual({ region: 1, label: 'One', t: 0, lifeway: 'farmers', people: 144000, tradition: 'house' });
    const text = wantedText(rows, 10);
    // The most people in generic houses first; the villagers a tradition houses are not listed.
    expect(text.split('\n').slice(1).map((l) => l.trim().split(/\s{2,}/).slice(0, 3).join(' | '))).toEqual(['1 One | 1000 CE | farmers', '2 Two | 1000 CE | herders', '2 Two | 1 BCE | herders']);
    expect(wantedText(rows, 10, { lifeway: 'herders' })).not.toContain('farmers');
    expect(wantedText(rows, 10, { region: 1 })).toContain('house');
    expect(wantedTotals(rows)).toContain('95%');
  });
});

describe('the cities a scene draws', () => {
  // A list with one city, and three records: one of the list's city, one of a town no list has, one that says nothing.
  const file: CitiesFile = {
    format: 'lightworld-cities@1',
    lists: [{ source: 'src:list', field: 'field:list', title: 'A list', hold: 50, gap: 600 }],
    cities: [{ name: 'Listed', country: 'Nowhere', lat: 10, lon: 20, certainty: 1, source: 'src:list', field: 'field:list', pops: [[-500, 20000], [0, 60000]] }],
    records: [
      { id: 'people/cities/listed', name: 'Listed', names: [{ text: 'Listed of old', span: [-1e9, -100] }], lat: 10.03, lon: 20.02, span: [-800, 400], pops: [[-480, 35000]], areas: [[-600, 150], [-300, 150]], houses: [], town: { streets: 'grid' } },
      { id: 'people/cities/unlisted', name: 'Unlisted', lat: 10.2, lon: 20.1, span: [-900, -200], pops: [], areas: [[-700, 40]], houses: [] },
      { id: 'people/cities/silent', name: 'Silent', lat: 10.1, lon: 20.1, span: [-900, -200], pops: [], areas: [], houses: [] },
    ],
  };
  const guess = { perHouse: 6, lot: 200, hold: 50, gap: 600 };
  const at = (t: number) => citiesAround(file, 10, 20, t, 40, guess);

  it("draws a list's city that has a record where the record puts it, with the record's own people about the time they are for", () => {
    const [c, ...rest] = at(-480);
    expect(c).toMatchObject({ name: 'Listed of old', lat: 10.03, lon: 20.02, people: 35000, from: 'record', record: 'people/cities/listed', area: 150, town: { streets: 'grid' } });
    // The list's figure stays beside it, and the record's people are no list's.
    expect(c.also).toEqual([{ people: 21600, field: 'field:list', source: 'src:list' }]);
    expect(c.field).toBeUndefined();
    expect(rest.map((x) => x.name)).toEqual(['Unlisted']);
  });

  it("draws a record's layout only while its claim says it held", () => {
    const walled: CitiesFile = { ...file, records: [{ ...file.records![0], town: { wall: 'timber' }, townSpan: [-300, 400] }] };
    expect(citiesAround(walled, 10, 20, -480, 40, guess)[0].town).toBeUndefined();
    expect(citiesAround(walled, 10, 20, 0, 40, guess)[0].town).toEqual({ wall: 'timber' });
  });

  it("keeps the list's figure at a time the record gives none for, and the record's name of that time", () => {
    const then = at(-100)[0];
    expect(then).toMatchObject({ name: 'Listed of old', people: 52000, from: 'list', field: 'field:list', record: 'people/cities/listed' });
    // Its ground is held past the last time a claim is for, while it stands; its old name is not.
    expect(at(-50)[0]).toMatchObject({ name: 'Listed', area: 150 });
  });

  it("draws a record's city no list has then with its own nearest figure, or a guess from its ground, and leaves out one that says nothing", () => {
    // The list falls silent fifty years after its last figure; the record stands until 400.
    expect(at(300)).toEqual([expect.objectContaining({ name: 'Listed', people: 35000, from: 'record', also: [] })]);
    expect(at(500)).toEqual([]);
    // Forty hectares at 200 m² to a house and six to a house.
    expect(at(-480).find((x) => x.name === 'Unlisted')).toMatchObject({ people: 12000, from: 'guess', area: 40, record: 'people/cities/unlisted' });
    expect(at(-480).some((x) => x.name === 'Silent')).toBe(false);
    expect(nameAt(file.records![0], 0)).toBe('Listed');
  });

  it('reads a figure straight between the times its claims are for, and holds it before and after', () => {
    const points: [number, number][] = [[-600, 100], [-400, 300]];
    expect(figureAt(points, -700)).toBe(100);
    expect(figureAt(points, -500)).toBe(200);
    expect(figureAt(points, 0)).toBe(300);
    expect(figureAt([], 0)).toBeUndefined();
  });
});
