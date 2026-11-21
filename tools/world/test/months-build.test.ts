// What the build keeps beside each climate's months (core/months.ts PARTS): that its tiles give back what the datasets
// themselves hold, within the packing's tolerance; where each part answers and where it does not; and what the tiles
// weigh. It reads the latest build as a browser does (tools/world/src/monthsat.ts), and the datasets directly: the deep
// past's runs with the build's own reader, and the last 120,000 years' NetCDF-4 file through Python, as the importer does.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cellOf, PARTS, partsFile, type MonthsPart } from '../../../core/months.ts';
import { parsePoint } from '../../../core/time.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { PARTS_TILE_BYTES } from '../src/build/climate.ts';
import { python } from '../src/importer.ts';
import { monthsAt, monthsText } from '../src/monthsat.ts';
import { openNetcdf } from '../src/netcdf.ts';
import { REPO } from '../src/paths.ts';
import { loadWorld } from '../src/world.ts';
import { dataset, latestBuild } from './helpers.ts';

const dir = latestBuild();
const ts = JSON.parse(readFileSync(join(dir, 'tileset.json'), 'utf8')) as Tileset;
const info = ts.months!;
const recent = info.sets.find((x) => x.field === 'field:earth/climate-late-quaternary')!;
const deep = info.sets.find((x) => x.field === 'field:earth/climate')!;
const year = (text: string) => parsePoint(text).t;

// The first round of visual gaps' views of the Tihama in July of 1887 and of the Sahara in August of 475, and its view
// of a salt lake's shore in what is now Brazil at 123.7 Ma (docs/plans/PARITY.md): places on the globe of their times.
const TIHAMA = { lat: 14.105, lon: 43.335, t: year('1887 CE'), month: 7 };
const SAHARA = { lat: 18.79, lon: 2.9, t: year('475 CE'), month: 8 };
const CODO = { lat: -3.48924, lon: -10.72343, t: year('123.68 Ma'), month: 7 };

const tmp = mkdtempSync(join(tmpdir(), 'wikiworldmodel-months-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** What the NetCDF-4 file of the last 120,000 years holds at cells, by their centres, at the time whose index is given. */
async function fileAt(time: number, cells: [number, number][], variables: string[]): Promise<{ cells: [number, number][]; values: Record<string, (number | null)[][]> }> {
  const request = join(tmp, `request-${time}.json`);
  writeFileSync(request, JSON.stringify({ file: await dataset('src:beyer-2020-late-quaternary'), latitude: 'latitude', longitude: 'longitude', time, cells, variables }));
  return JSON.parse(execFileSync(python(), [join(REPO, 'tools/world/importers/months_at.py'), request], { encoding: 'utf8' }));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('the parts kept beside the months', () => {
  it('lists each part with its field, its unit and its source, and has a tile of them for every tile of the months, in every span', async () => {
    const world = await loadWorld();
    expect(recent.parts!.list.map((p) => [p.part, p.field])).toEqual([
      ['cloud', 'field:earth/cloudiness'],
      ['humidity', 'field:earth/relative-humidity'],
      ['wind_speed', 'field:earth/wind-speed'],
      ['biome', 'field:earth/biome-late-quaternary'],
      ['leaf', 'field:earth/leaf-area'],
      ['npp', 'field:earth/net-primary-production'],
    ]);
    expect(deep.parts!.list.map((p) => [p.part, p.field])).toEqual([
      ['u', 'field:earth/wind'],
      ['v', 'field:earth/wind'],
      ['albedo', 'field:earth/surface-albedo'],
    ]);
    for (const set of info.sets) {
      for (const p of set.parts!.list) {
        const f = world.fields.find((x) => x.id === p.field)!;
        expect([p.title, p.unit, p.source]).toEqual([f.title, f.unit, f.data!.from]);
      }
      // Every keyframe is in one span, and every tile has a file in each, within what a tile of parts may weigh.
      expect(set.parts!.chunks.flat().sort((a, b) => a - b)).toEqual(set.keyframesMa);
      for (const ks of set.parts!.chunks) for (const key of Object.keys(set.tiles)) expect(statSync(join(dir, partsFile(set, ks[0], key)!)).size).toBeLessThan(PARTS_TILE_BYTES + 8000);
    }
    // The file's own names for its classes, and what one of its numbers of leaf area is.
    const classes = recent.parts!.list.find((p) => p.part === 'biome')!.classes!;
    expect(Object.keys(classes)).toHaveLength(29);
    expect([classes['0'], classes['1'], classes['21'], classes['28']]).toEqual(['Water bodies', 'Tropical evergreen forest', 'Desert', 'Land ice']);
    expect(recent.parts!.list.find((p) => p.part === 'leaf')!.scale).toBe(0.01);
  });

  it('gives back the cloudiness, humidity, wind speed and vegetation of the last 120,000 years as their file has them, at two places', async () => {
    for (const [place, timeIndex, keyframeMa] of [[TIHAMA, 71, 0], [SAHARA, 70, 0.001]] as const) {
      const a = monthsAt(dir, place.lat, place.lon, place.t)!;
      console.log(monthsText(place.lat, place.lon, place.t, a, place.month));
      expect([a.field, a.ageMa, a.frameMa]).toEqual(['field:earth/climate-late-quaternary', keyframeMa, 0]);
      // The node is the mean of the half-degree cells around it that are land: all four in the Sahara, and the eastern
      // two in the Tihama, whose western ones are the Red Sea.
      const centres: [number, number][] = [[a.node.lat + 0.25, a.node.lon - 0.25], [a.node.lat + 0.25, a.node.lon + 0.25], [a.node.lat - 0.25, a.node.lon - 0.25], [a.node.lat - 0.25, a.node.lon + 0.25]];
      const file = await fileAt(timeIndex, centres, ['temperature', 'cloudiness', 'relative_humidity', 'wind_speed', 'biome', 'lai', 'npp']);
      file.cells.forEach((c, i) => {
        expect(c[0]).toBeCloseTo(centres[i][0], 4);
        expect(c[1]).toBeCloseTo(centres[i][1], 4);
        expect(cellOf(a.node.lat, a.node.lon, c[0], c[1])).toBe(i);
      });
      const land = centres.map((_, i) => i).filter((i) => file.values.temperature[i].every((x) => x !== null));
      expect(land).toEqual(place === TIHAMA ? [1, 3] : [0, 1, 2, 3]);
      const p = a.parts!;
      for (const [part, variable] of [['cloud', 'cloudiness'], ['humidity', 'relative_humidity'], ['wind_speed', 'wind_speed']] as const) {
        for (let m = 0; m < 12; m++) {
          const source = mean(land.map((i) => file.values[variable][i][m]!));
          // The packing's tolerance, and the hundredth of the unit each cell is kept to on its way in.
          expect(Math.abs(p[part]![m]! - source), `${part} of month ${m + 1}`).toBeLessThanOrEqual(PARTS[part].tolerance(source) + 0.005 + 1e-9);
        }
      }
      // The year's vegetation, cell by cell, is the file's own numbers; a scene is given its leaf area in its field's unit.
      p.vegetation!.cells.forEach((cell, i) => {
        if (!land.includes(i)) return expect(cell).toBeNull();
        expect(cell!.biome).toBe(file.values.biome[i][0]);
        expect(cell!.leaf).toBeCloseTo(file.values.lai[i][0]! * 0.01, 9);
        expect(cell!.npp).toBe(file.values.npp[i][0]);
      });
      expect(p.vegetation!.biome).toBe(file.values.biome[cellOf(a.node.lat, a.node.lon, a.place.lat, a.place.lon)][0]);
      // The dataset has no wind as a vector and no albedo.
      expect(p.wind).toBeUndefined();
      expect(p.albedo).toBeUndefined();
    }
  });

  it("gives back the wind and the albedo of the deep past's runs as their file has them, at one place", async () => {
    const a = monthsAt(dir, CODO.lat, CODO.lon, CODO.t)!;
    console.log(monthsText(CODO.lat, CODO.lon, CODO.t, a, CODO.month));
    expect([a.field, a.ageMa, a.frameMa]).toEqual(['field:earth/climate', 120, 120]);
    const nc = await openNetcdf(await dataset('src:li-2022-phanerozoic-climate'));
    const lat = await nc.read('lat');
    const lon = await nc.read('lon');
    const run = nc.variables.get('T')!.dims[0].size - 1 - a.ageMa / 10;
    const land = await nc.read('LANDFRAC', run, 1);
    const cells: number[] = [];
    // The land cells of the run that fall to the node, as the nearest node to each: on the 2° grid the tiles keep.
    for (let j = 0; j < lat.length; j++) {
      for (let i = 0; i < lon.length; i++) {
        const lo = ((lon[i] + 180) % 360) - 180;
        if (land[j * lon.length + i] >= 0.5 && Math.round((90 - lat[j]) / 2) === Math.round((90 - a.node.lat) / 2) && (((Math.round((lo + 180) / 2) % 180) + 180) % 180) === Math.round((a.node.lon + 180) / 2) % 180) cells.push(j * lon.length + i);
      }
    }
    expect(cells.length).toBeGreaterThan(0);
    const per = lat.length * lon.length;
    const p = a.parts!;
    for (const [values, variable] of [[p.wind!.u, 'U'], [p.wind!.v, 'V'], [p.albedo!, 'SALB']] as const) {
      const part: MonthsPart = variable === 'U' ? 'u' : variable === 'V' ? 'v' : 'albedo';
      const v = await nc.read(variable, run, 1);
      for (let m = 0; m < 12; m++) {
        // An albedo of 0 is a month without sunlight, which has none.
        const has = cells.map((c) => v[m * per + c]).filter((x) => variable !== 'SALB' || x !== 0);
        if (!has.length) expect(values[m]).toBeNull();
        else expect(Math.abs(values[m]! - mean(has)), `${variable} of month ${m + 1}`).toBeLessThanOrEqual(PARTS[part].tolerance(mean(has)) + 1e-4);
      }
    }
    await nc.close();
    // These runs have no cloudiness, humidity or wind speed, and no vegetation.
    expect([p.cloud, p.humidity, p.wind_speed, p.vegetation]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('answers where its sources do, and says nothing where they do not', () => {
    // Between the last 120,000 years and the deep past's runs of 10 Ma and older, the pre-industrial run answers: wind and albedo only.
    const pleistocene = monthsAt(dir, 35.85822, 113.7445, year('1.83 Ma'))!;
    expect([pleistocene.field, pleistocene.ageMa]).toEqual(['field:earth/climate', 0]);
    expect(pleistocene.parts!.cloud).toBeUndefined();
    expect(pleistocene.parts!.wind!.u).toHaveLength(12);
    // The last 120,000 years' climate has nothing south of 60°S: Antarctica reads no months at all then.
    expect(monthsAt(dir, -78.5, 106.8, year('21 ka'))).toBeUndefined();
    // No climate's months reach before the oldest run.
    expect(monthsAt(dir, 45.79, -4.2, year('2258.3 Ma'))).toBeUndefined();
    // In the polar night a month has no albedo: at 80°N in the pre-industrial run's January, and one again in July.
    const svalbard = monthsAt(dir, 78.9, 16, year('2 Ma'))!;
    expect(svalbard.parts!.albedo![0]).toBeNull();
    expect(svalbard.parts!.albedo![6]).toBeGreaterThan(0.05);
    // On the shelf the low sea bared, the dataset's vegetation is its class 0, with no leaf: the Sunda shelf at 21 ka.
    const sunda = monthsAt(dir, 4, 108, year('21 ka'))!;
    expect(sunda.field).toBe('field:earth/climate-late-quaternary');
    expect(sunda.parts!.vegetation).toMatchObject({ biome: 0, name: 'Water bodies', leaf: 0, npp: 0 });
    expect(sunda.parts!.cloud![0]).toBeGreaterThan(0);
  });

  it('weighs what it says: the months of a tile as before, and its parts in files a scene fetches one of', () => {
    const size = (file: string) => statSync(join(dir, file)).size;
    for (const set of info.sets) {
      const months = Object.values(set.tiles).map(size);
      const keys = Object.keys(set.tiles);
      const spans = set.parts!.chunks.map((ks) => keys.map((key) => size(partsFile(set, ks[0], key)!)));
      const parts = spans.flat();
      const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
      // The heaviest tile of months, and the same tile's parts.
      const heavy = keys[months.indexOf(Math.max(...months))];
      const heavyParts = set.parts!.chunks.map((ks) => size(partsFile(set, ks[0], heavy)!));
      console.log(
        `${set.field}: months ${keys.length} tiles, ${(total(months) / 1e6).toFixed(1)} MB, the heaviest (${heavy}) ${Math.max(...months)} bytes; parts ${parts.length} files in ${spans.length} span${spans.length === 1 ? '' : 's'}, ${(total(parts) / 1e6).toFixed(1)} MB, the heaviest ${Math.max(...parts)} bytes; tile ${heavy} with its parts ${Math.max(...months) + total(heavyParts)} bytes, of which a scene fetches ${Math.max(...months)} + ${Math.max(...heavyParts)}`,
      );
      // A scene's fetch for one tile stays within what a tile of months alone was allowed.
      expect(Math.max(...months) + Math.max(...parts)).toBeLessThan(4e5);
    }
  });
});
