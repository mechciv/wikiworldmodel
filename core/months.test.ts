// The climate at a height (model:earth/lapse-rate): months moved up a mountain by the lapse rate, the classes they give
// there, the snow lying in each month, and the tiles a scene reads them from.
import { describe, expect, it } from 'vitest';
import { atHeight, cellOf, classAtHeight, decodeRain, encodeRain, MONTHS_PARTS, MonthsTile, nearestNode, nearestParts, PARTS, partsFile, PartsTile, snowInMonth, snowLine, tileKey, tilesNear, warmestMonth, WIND_ROOT, type Months, type MonthsSet, type MonthsTileHeader, type PartsSet, type PartsTileHeader } from './months.ts';
import type { ClimateRule } from './climate.ts';
import type { WaterParams } from './water.ts';
import { decodeTile } from './container.ts';
import { monthsFiles, monthsOfRun, PARTS_TILE_BYTES, partsFiles, partsOfRun, type ClimateKeyframe, type PartOfRun } from '../tools/world/src/build/climate.ts';
import { climateGrid } from '../tools/world/src/build/climate.ts';
import { sceneParts } from '../world/generators/life/climate.ts';

// The values of the records: world/fields/earth/climate-at-height.yaml, biome.yaml and runoff.yaml.
const LAPSE = 5.8;
const RULE: ClimateRule = { polar: 10, frost: 0, tropical: 18, cold: 0, arid: 1, desert: 0.5 };
const W: WaterParams = { hamon: { a: 13.97, b: 4.95, c: 0.062 }, t_rain: 3.3, t_snow: -10, t_snow_high: -1, high_m: 1000, melt_max: 0.5, direct: 0.05, soil_mm: 150, rfactor: 0.5, obliquity_deg: 23.44, equinox_day: 80 };

// A wet equatorial lowland, and a temperate one with cold winters (both made up, to test the rules).
const TROPICS: Months = { t: [26, 26.5, 27, 26.5, 26, 25.5, 25, 25.5, 26, 26.5, 26.5, 26], p: Array(12).fill(220) };
const TEMPERATE: Months = { t: [-2, -1, 3, 8, 13, 17, 19, 18, 14, 9, 4, 0], p: Array(12).fill(80) };

describe('the climate at a height', () => {
  it('cools the months up a mountain by the lapse rate, with the same rain', () => {
    const up = atHeight(TEMPERATE, 1000, LAPSE);
    up.t.forEach((t, m) => expect(t).toBeCloseTo(TEMPERATE.t[m] - 5.8, 9));
    expect(up.p).toEqual(TEMPERATE.p);
    expect(atHeight(TEMPERATE, -500, LAPSE).t[6]).toBeCloseTo(19 + 2.9, 9);
    expect(warmestMonth(TEMPERATE)).toBe(7);
    // The tiles keep a month's rain to within a few per cent, and a dry one to a fraction of a millimetre.
    for (const mm of [20, 90, 400, 1500, 3500]) expect(Math.abs(decodeRain(encodeRain(mm)) - mm) / mm).toBeLessThan(0.06);
    expect(decodeRain(encodeRain(0))).toBe(0);
    expect(Math.abs(decodeRain(encodeRain(1.2)) - 1.2)).toBeLessThan(0.3);
    expect(warmestMonth({ t: [20, 21, 19, 15, 10, 6, 5, 7, 10, 14, 17, 19], p: Array(12).fill(50) })).toBe(2);
  });

  it('brings a tropical mountain to tundra and then ice where the Köppen thresholds say', () => {
    expect(classAtHeight(TROPICS, 0, LAPSE, RULE)).toBe('rainforest');
    // The warmest month, 27 °C, falls to 10 °C after 17 / 5.8 km, and to 0 °C after 27 / 5.8 km.
    expect(classAtHeight(TROPICS, 2800, LAPSE, RULE)).not.toBe('tundra');
    expect(classAtHeight(TROPICS, 3000, LAPSE, RULE)).toBe('tundra');
    expect(classAtHeight(TROPICS, 4600, LAPSE, RULE)).not.toBe('ice');
    expect(classAtHeight(TROPICS, 4700, LAPSE, RULE)).toBe('ice');
  });

  it('lays snow lower in winter than in summer', () => {
    // January's snow lies on the lowland itself, below freezing all winter; in July, only high up. The lowland keeps a
    // trace of it into the summer, as the model melts at most half the snow in a month, but less than is drawn.
    expect(snowInMonth(TEMPERATE, 1, 45, 200, W)).toBeGreaterThan(10);
    expect(snowInMonth(TEMPERATE, 7, 45, 200, W)).toBeLessThan(10);
    const jan = snowLine(TEMPERATE, 1, 45, 200, W, LAPSE, 10, 0, 5000, 25);
    const jul = snowLine(TEMPERATE, 7, 45, 200, W, LAPSE, 10, 0, 5000, 25);
    expect(jan).toBeLessThan(200);
    expect(jul).toBeGreaterThan(2000);
    expect(jul).toBeLessThan(5000);
    // And none on a tropical lowland, in any month.
    for (let m = 1; m <= 12; m++) expect(snowLine(TROPICS, m, 0, 0, W, LAPSE, 10, 0, 1000, 25)).toBe(Infinity);
  });

  it('reads back a node from its tile, near its edge, as the build wrote it', () => {
    // A run on a 1° grid with land only at two cells, at 9°E and 10°E: one each side of a tile's edge at 10°E.
    const grid = climateGrid(1);
    const lat = [5];
    const lon = [8.8, 10.4];
    const land = [1, 1];
    const t: number[] = [];
    const p: number[] = [];
    for (let m = 0; m < 12; m++) {
      t.push(TEMPERATE.t[m], TEMPERATE.t[m] + 1);
      p.push(TEMPERATE.p[m], 90);
    }
    const months = monthsOfRun(grid, lat, lon, land, t, p, (_j, i) => [400, 900][i]);
    const keys = [{ ageMa: 0, frameMa: 0, values: new Uint8Array(0), plate: new Uint16Array(0), nodes: new Float32Array(0), months }] as ClimateKeyframe[];
    const out = monthsFiles('field:test', 'months/test', grid, keys, 10);
    expect(Object.keys(out.tiles)).toEqual([tileKey(9, 5, 10), tileKey(10, 5, 10)].sort());
    // A place just west of the edge reads the tiles on both sides of it, and finds the east node nearer.
    const set = { step: 1, tile_deg: 10 };
    const tiles = tilesNear(5, 9.8, set).filter((k) => out.tiles[k]).map((k) => {
      const { header, arrays } = decodeTile<MonthsTileHeader>(out.files.get(out.tiles[k])!.slice().buffer as ArrayBuffer);
      return new MonthsTile(header, arrays as unknown as ArrayLike<number>[]);
    });
    expect(tiles).toHaveLength(2);
    const a = nearestNode(tiles, 0, 5, 9.8)!;
    expect(a.lon).toBe(10);
    expect(a.height).toBe(900);
    expect(a.months.t[6]).toBe(20);
    // Rain as the tiles keep it: to a few per cent.
    expect(a.months.p[0]).toBeCloseTo(90, -0.5);
    expect(nearestNode(tiles, 0, 5, 9.2)!.height).toBe(400);
    expect(nearestNode(tiles, 0, 20, 9.4)).toBeUndefined();
  });
});

// What else a climate's source says of a node (core/months.ts PARTS): how each part is kept, how a run's cells become a
// node's parts, and the tiles a scene reads them from. Every number here is made up, to test the packing and the reading.
describe('the parts kept beside the months', () => {
  it('keeps each part within its tolerance, and says none where there is none', () => {
    const back = (part: (typeof MONTHS_PARTS)[number], x: number) => PARTS[part].decode(PARTS[part].encode(x));
    for (const x of [0, 0.2, 13.37, 50, 61.26, 99.9, 100]) {
      expect(Math.abs(back('cloud', x) - x)).toBeLessThanOrEqual(PARTS.cloud.tolerance(x) + 1e-12);
      expect(Math.abs(back('humidity', x) - x)).toBeLessThanOrEqual(0.25 + 1e-12);
    }
    for (const x of [0, 0.04, 0.115, 0.404, 0.8984, 1]) expect(Math.abs(back('albedo', x) - x)).toBeLessThanOrEqual(0.0025 + 1e-12);
    for (const x of [0, 0.31, 3.54, 9.99, 18.04, 25.4]) expect(Math.abs(back('wind_speed', x) - x)).toBeLessThanOrEqual(0.05 + 1e-12);
    // A component of the wind by its square root: a calm to a hundredth, a breeze to a tenth, a gale to a third.
    for (const x of [0, 0.03, -0.4, 1, -2.78, 5.32, -8.1, 14.5, -31, 92.8, -176.58]) {
      for (const part of ['u', 'v'] as const) {
        expect(Math.abs(back(part, x) - x)).toBeLessThanOrEqual(PARTS[part].tolerance(x) + 1e-12);
        expect(Math.sign(back(part, x))).toBe(Math.abs(x) < 0.003 ? 0 : Math.sign(x));
      }
    }
    expect(PARTS.u.tolerance(1)).toBeLessThan(0.11);
    expect(PARTS.u.tolerance(10)).toBeLessThan(0.34);
    expect((127 / WIND_ROOT) ** 2).toBeGreaterThan(176.58);
    // A class and a whole number come back as they went in.
    for (const x of [0, 1, 13, 28, 254]) expect(back('biome', x)).toBe(x);
    for (const x of [0, 32, 414, 626, 2380, 65534]) {
      expect(back('leaf', x)).toBe(x);
      expect(back('npp', x)).toBe(x);
    }
    // No value's code is the code of none; and a value its code cannot hold is refused, not bent to fit.
    const ends: Record<(typeof MONTHS_PARTS)[number], number[]> = { cloud: [0, 100], humidity: [0, 100], wind_speed: [0, 25.4], u: [-178, 178], v: [-178, 178], albedo: [0, 1], biome: [0, 254], leaf: [0, 65534], npp: [0, 65534] };
    for (const part of MONTHS_PARTS) expect(ends[part].map((x) => PARTS[part].encode(x))).not.toContain(PARTS[part].none);
    expect(() => PARTS.cloud.encode(120)).toThrow(/outside/);
    expect(() => PARTS.humidity.encode(-3)).toThrow(/outside/);
    expect(() => PARTS.albedo.encode(1.2)).toThrow(/outside/);
    expect(() => PARTS.wind_speed.encode(30)).toThrow(/outside/);
    expect(() => PARTS.u.encode(200)).toThrow(/outside/);
    expect(() => PARTS.biome.encode(3.5)).toThrow(/whole/);
    expect(() => PARTS.biome.encode(255)).toThrow(/outside/);
    expect(() => PARTS.npp.encode(NaN)).toThrow(/outside/);
    // A share a hair beyond its bound, as rounding leaves it, is the bound.
    expect(PARTS.cloud.decode(PARTS.cloud.encode(100.000001))).toBe(100);
  });

  // A run on half-degree cells, as the last 120,000 years' is: the node at 5°N 10°E has four cells of land around it,
  // the node at 5°N 9°E only its two eastern ones, and the node at 6°N 12°E only its south-western one.
  const grid = climateGrid(1);
  const lat = [4.75, 5.25, 5.75];
  const lon = [9.25, 9.75, 10.25, 11.75];
  const cells = lat.length * lon.length;
  const at = (j: number, i: number) => j * lon.length + i;
  const land = new Array(cells).fill(0);
  for (const [j, i] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [2, 3]]) land[at(j, i)] = 1;
  const monthly = (f: (m: number, j: number, i: number) => number) => Float64Array.from({ length: 12 * cells }, (_, k) => f(Math.floor(k / cells), Math.floor((k % cells) / lon.length), k % lon.length));
  const yearly = (f: (j: number, i: number) => number) => Float64Array.from({ length: cells }, (_, k) => f(Math.floor(k / lon.length), k % lon.length));
  // Cloudiness differs by cell and month; the albedo has no value in January anywhere, nor in February in the northern row.
  const cloud = monthly((m, j, i) => 10 + 5 * m + 2 * j + i);
  const u = monthly((m, j, i) => (m - 5.5) * (1 + i) - j);
  const v = monthly((m) => 0.25 * m - 1);
  const albedo = monthly((m, j, i) => (m === 0 || (m === 1 && j === 1) ? NaN : 0.1 + 0.05 * i + 0.01 * m));
  const biome = yearly((j, i) => 1 + j * 4 + i);
  const leaf = yearly((j, i) => 100 * (1 + j) + i);
  const npp = yearly((j, i) => 500 + 10 * j + i);
  const run = (shift = 0): PartOfRun[] => [
    { part: 'cloud', values: cloud.map((x) => x + shift) },
    { part: 'u', values: u },
    { part: 'v', values: v },
    { part: 'albedo', values: albedo },
    { part: 'biome', values: biome },
    { part: 'leaf', values: leaf },
    { part: 'npp', values: npp },
  ];
  const months = monthsOfRun(grid, lat, lon, land, cloud, cloud, () => 0);

  it('makes a node of the mean of its land cells by month, and keeps the year cell by cell', () => {
    const parts = partsOfRun(grid, lat, lon, land, run());
    // The same nodes as the months, in their order.
    expect([...parts.node]).toEqual([...months.node]);
    const q = [...parts.node].indexOf((90 - 5) * grid.nx + (10 + 180));
    expect(q).toBeGreaterThanOrEqual(0);
    // July's cloudiness at the node: the mean of its four cells.
    const july = [at(0, 1), at(1, 1), at(0, 2), at(1, 2)].reduce((n, c) => n + cloud[6 * cells + c], 0) / 4;
    expect(Math.abs(PARTS.cloud.decode(parts.values.cloud![q * 12 + 6]) - july)).toBeLessThanOrEqual(0.25);
    // A month with no value in any cell has none; one with a value in some is the mean of those.
    expect(parts.values.albedo![q * 12]).toBe(PARTS.albedo.none);
    const feb = (albedo[cells + at(0, 1)] + albedo[cells + at(0, 2)]) / 2;
    expect(Math.abs(PARTS.albedo.decode(parts.values.albedo![q * 12 + 1]) - feb)).toBeLessThanOrEqual(0.0025);
    // The year's classes: north-west, north-east, south-west, south-east of the node, each its own cell's.
    expect([...parts.values.biome!.subarray(q * 4, q * 4 + 4)]).toEqual([biome[at(1, 1)], biome[at(1, 2)], biome[at(0, 1)], biome[at(0, 2)]]);
    expect([...parts.values.leaf!.subarray(q * 4, q * 4 + 4)]).toEqual([leaf[at(1, 1)], leaf[at(1, 2)], leaf[at(0, 1)], leaf[at(0, 2)]]);
    // A node with land in one cell only has none in the other three.
    const lone = [...parts.node].indexOf((90 - 6) * grid.nx + (12 + 180));
    expect([...parts.values.biome!.subarray(lone * 4, lone * 4 + 4)]).toEqual([255, 255, biome[at(2, 3)], 255]);
    expect(cellOf(6, 12, 5.75, 11.75)).toBe(2);
    expect(cellOf(0, -180, 0.25, 179.75)).toBe(0);
  });

  it('refuses a run with more than four cells to a node, which it could not keep cell by cell', () => {
    const fine = [5.1, 5.2, 5.3];
    expect(() => partsOfRun(grid, fine, [10.1, 10.2], [1, 1, 1, 1, 1, 1], [{ part: 'biome', values: [1, 2, 3, 4, 5, 6] }])).toThrow(/more than four cells/);
    // By month it is a mean, of however many cells.
    expect(() => partsOfRun(grid, fine, [10.1, 10.2], [1, 1, 1, 1, 1, 1], [{ part: 'cloud', values: new Array(72).fill(40) }])).not.toThrow();
  });

  it('reads a node back from the tile of the span its keyframe is in, as the build wrote it', () => {
    // Twenty keyframes, the cloudiness of each a per cent above the one before: more than one tile of parts may hold.
    const keys = Array.from({ length: 20 }, (_, k) => ({ ageMa: k / 1000, frameMa: 0, values: new Uint8Array(0), plate: new Uint16Array(0), nodes: new Float32Array(0), months, parts: partsOfRun(grid, lat, lon, land, run(k)) })) as ClimateKeyframe[];
    const main = monthsFiles('field:test', 'months/test', grid, keys, 10);
    const made = partsFiles('field:test', 'months/test/parts', grid, keys, 10, Object.keys(main.tiles));
    expect(made.parts).toEqual(['cloud', 'u', 'v', 'albedo', 'biome', 'leaf', 'npp']);
    expect(made.chunks.length).toBeGreaterThan(1);
    expect(made.chunks.flat()).toEqual(keys.map((k) => k.ageMa));
    // Every tile of the months has a file in every span, each within the bytes a tile of parts may weigh.
    expect([...made.files.keys()].sort()).toEqual(made.chunks.flatMap((_, c) => Object.keys(main.tiles).map((key) => `months/test/parts/${c}/${key}.lwt`)).sort());
    for (const file of made.files.values()) expect(file.byteLength).toBeLessThan(PARTS_TILE_BYTES + 8000);
    const info: PartsSet = { list: made.parts.map((part) => ({ part, field: `field:test/${part}`, title: part, source: 'src:test', ...(part === 'leaf' ? { scale: 0.01 } : {}), ...(part === 'biome' ? { classes: { '6': 'the sixth class', '7': 'the seventh' } } : {}) })), dir: 'months/test/parts', chunks: made.chunks };
    const set: MonthsSet = { field: 'field:test', title: 'test', keyframesMa: keys.map((k) => k.ageMa), frameMa: 0, step: 1, tile_deg: 10, tiles: main.tiles, parts: info };
    const read = (ageMa: number, la: number, lo: number) => {
      const tiles = tilesNear(la, lo, set).map((k) => partsFile(set, ageMa, k)).filter((f): f is string => !!f).map((f) => {
        const { header, arrays } = decodeTile<PartsTileHeader>(made.files.get(f)!.slice().buffer as ArrayBuffer);
        return new PartsTile(header, arrays as unknown as ArrayLike<number>[]);
      });
      return nearestParts(tiles, ageMa, la, lo);
    };
    // The last keyframe is in the last span: its July is nineteen per cent cloudier than the first's.
    expect(partsFile(set, 0.019, tileKey(10, 5, 10))).toBe(`months/test/parts/${made.chunks.length - 1}/${tileKey(10, 5, 10)}.lwt`);
    expect(partsFile(set, 0.5, tileKey(10, 5, 10))).toBeUndefined();
    expect(partsFile(set, 0, tileKey(100, 5, 10))).toBeUndefined();
    const first = read(0, 5.1, 10.1)!;
    const last = read(0.019, 5.1, 10.1)!;
    expect([first.lat, first.lon]).toEqual([5, 10]);
    expect(last.parts.cloud![6]! - first.parts.cloud![6]!).toBeCloseTo(19, 6);
    // The wind as it went in, to the packing's tolerance; no albedo in January, and one in March.
    const uJuly = [at(0, 1), at(1, 1), at(0, 2), at(1, 2)].reduce((n, c) => n + u[6 * cells + c], 0) / 4;
    expect(Math.abs(first.parts.wind!.u[6]! - uJuly)).toBeLessThanOrEqual(PARTS.u.tolerance(uJuly));
    expect(first.parts.wind!.v[6]).toBeCloseTo(0.5, 1);
    expect(first.parts.albedo![0]).toBeNull();
    expect(first.parts.albedo![2]).not.toBeNull();
    expect(first.parts.humidity).toBeUndefined();
    // A place north-east of the node is in its north-east cell; all four are given, north-west first.
    expect(first.parts.vegetation).toMatchObject({ biome: biome[at(1, 2)], leaf: leaf[at(1, 2)], npp: npp[at(1, 2)] });
    expect(first.parts.vegetation!.cells.map((c) => c?.biome)).toEqual([biome[at(1, 1)], biome[at(1, 2)], biome[at(0, 1)], biome[at(0, 2)]]);
    expect(read(0, 4.9, 9.9)!.parts.vegetation!.biome).toBe(biome[at(0, 1)]);
    // West of the node at 9°E the source has no land: a place there takes the nearest cell that has, the one to its east.
    const west = read(0, 5.1, 8.8)!;
    expect(west.lon).toBe(9);
    expect(west.parts.vegetation!.cells.map((c) => c?.biome ?? null)).toEqual([null, biome[at(1, 0)], null, biome[at(0, 0)]]);
    expect(west.parts.vegetation!.biome).toBe(biome[at(1, 0)]);
    // And nothing where no node is near.
    expect(read(0, 20, 10)).toBeUndefined();
    // As a scene's spec carries them: leaf area in its field's unit, each class with its name, and each part's field.
    const scene = sceneParts(first.parts, info);
    expect(scene.vegetation).toMatchObject({ biome: 7, name: 'the seventh', leaf: leaf[at(1, 2)] / 100, npp: npp[at(1, 2)] });
    expect(scene.vegetation!.cells[0]).toMatchObject({ biome: 6, name: 'the sixth class' });
    expect(scene.fields).toMatchObject({ cloud: 'field:test/cloud', u: 'field:test/u', npp: 'field:test/npp' });
    expect(scene.cloud).toEqual(first.parts.cloud);
  });

  it('covers all intermediate longitude tiles at high latitude and the full ring at the pole', () => {
    const near88 = tilesNear(88, 0, { step: 0.5, tile_deg: 10 });
    expect(near88.length).toBeGreaterThanOrEqual(8);
    const pole = tilesNear(89.5, 0, { step: 0.5, tile_deg: 10 });
    expect(pole.length).toBe(36);
  });
});
