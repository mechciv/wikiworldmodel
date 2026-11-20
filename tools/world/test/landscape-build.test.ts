// The eleventh slice's pass criteria that a build answers for itself (docs/slices/ELEVENTH-SLICE.md): the anthromes'
// tiles say what the dataset's grids say, cell by cell; each region is drawn where its outline is; HYDE's farming agrees
// with the archaeologists' where they found none; and a scene of a city the lists name has that city in it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTile } from '../../../core/container.ts';
import { anthromeTile, classAtStep, cellOf, nearestStep, scenePeople, tileKey, type AnthromeTile, type AnthromeTileHeader, type AssessmentsFile, type CitiesFile, type LandscapeIndex, type TraditionsFile } from '../../../core/landscape.ts';
import { cellAt, stepsAround, type PeopleFile, type PeopleHeader } from '../../../core/layers.ts';
import type { CoverageFile } from '../../../core/records.ts';
import type { SceneSpec } from '../../../core/scene.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { makeSettlement } from '../../../world/generators/people/settlement/v2.ts';
import { HOUSING_TIMES, parseClassGrid } from '../src/build/landscape.ts';
import { dataset, latestBuild } from './helpers.ts';

const file = (name: string) => readFileSync(join(latestBuild(), name));
const json = <T>(name: string): T => JSON.parse(file(name).toString('utf8')) as T;
const buffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

let index: LandscapeIndex;
const tiles = new Map<string, AnthromeTile | undefined>();
const tile = (key: string): AnthromeTile | undefined => {
  if (!tiles.has(key)) {
    if (!index.tiles.includes(key)) tiles.set(key, undefined);
    else {
      const { header, arrays } = decodeTile<AnthromeTileHeader>(buffer(file(`people/anthromes/${key}.lwt`)));
      tiles.set(key, anthromeTile(header, arrays[0] as Uint8Array, arrays[1] as Uint8Array, arrays[2] as Uint8Array));
    }
  }
  return tiles.get(key);
};

beforeAll(() => {
  const ts = json<Tileset>('tileset.json');
  expect(ts.files.landscape).toBe('people/landscape.json');
  index = json<LandscapeIndex>(ts.files.landscape!);
});

describe('the human landscape, built', () => {
  it('says what the dataset\'s grid says, cell by cell, at a step', async () => {
    const zip = unzipSync(new Uint8Array(readFileSync(await dataset('src:anthromes-12k'))));
    const inner = unzipSync(zip['1000AD_anthromes.zip']);
    const asc = Object.values(inner)[0];
    const grid = new Uint8Array(4320 * 2160);
    const ix = new Int16Array(100).fill(-1);
    index.classes.forEach((c, i) => (ix[c.code] = i + 1));
    parseClassGrid(asc, grid, ix);
    const step = index.steps.indexOf(1000);
    expect(step).toBeGreaterThan(0);
    let land = 0;
    for (let r = 0; r < 2160; r += 3) {
      for (let c = 0; c < 4320; c += 3) {
        const lat = 90 - (r + 0.5) / 12;
        const lon = -180 + (c + 0.5) / 12;
        const t = tile(tileKey(lat, lon, index.tile_deg).key);
        const got = t ? classAtStep(t, cellOf(t, lat, lon), step) : 0;
        expect(got, `${lat}, ${lon}`).toBe(grid[r * 4320 + c]);
        if (got) land++;
      }
    }
    expect(land).toBeGreaterThan(200000);
  });

  it('draws each region where its outline is', () => {
    const regionAt = (lat: number, lon: number) => {
      const t = tile(tileKey(lat, lon, index.tile_deg).key)!;
      return t.region[cellOf(t, lat, lon)];
    };
    const places: [string, number, number, number][] = [
      ['Baghdad', 33.3, 44.4, 59],
      ['Cairo', 30.04, 31.24, 72],
      ['London', 51.5, -0.12, 38],
      ['Lima', -12.05, -77.04, 32],
      ['Sydney', -33.87, 151.2, 140],
      ['Mohenjo-daro', 27.33, 68.14, 105],
      ["Xi'an", 34.34, 108.94, 119],
      ['Tikal', 17.22, -89.62, 24],
      ['Rome', 41.9, 12.5, 44],
      ['Ulaanbaatar', 47.9, 106.9, 115],
      ['Djenné', 13.9, -4.55, 76],
      ['Honolulu', 21.3, -157.85, 146],
    ];
    for (const [name, lat, lon, id] of places) expect(regionAt(lat, lon), name).toBe(id);
  });

  it("farms nowhere the region's archaeologists found no farming", () => {
    const c = json<CoverageFile>('coverage.json');
    const farming = c.landscape!.farming;
    expect(farming).toHaveLength(10);
    for (const f of farming) if (f.none[1]) expect(f.none[0] / f.none[1], f.slice).toBeGreaterThanOrEqual(0.95);
  });

  it('counts whose houses rest on a tradition, at each time, by pattern of settlement, and they add up', () => {
    const c = json<CoverageFile>('coverage.json');
    const counts = c.landscape!.housing!;
    expect(counts.map((x) => x.t)).toEqual(HOUSING_TIMES);
    const traditions = json<TraditionsFile>(index.traditions).traditions;
    for (const x of counts) {
      const sum = Object.values(x.by).reduce((s, v) => [s[0] + v![0], s[1] + v![1]], [0, 0]);
      expect(sum, String(x.t)).toEqual([x.people, x.housed]);
      for (const v of Object.values(x.by)) expect(v![1]).toBeLessThanOrEqual(v![0]);
      expect(x.regions[1]).toBeLessThanOrEqual(x.regions[0]);
      expect(x.cities[2]).toBeLessThanOrEqual(x.cities[1]);
      // No one is housed by a tradition at a time none holds.
      if (!traditions.some((t) => t.lifeways.length && x.t >= t.span[0] && x.t <= t.span[1])) expect(x.housed, String(x.t)).toBe(0);
    }
    // The people are HYDE's: nearly all foragers at the anthromes' first step, over a billion in 1850, most of them farmers.
    expect(counts[0].by.foragers![0] / counts[0].people).toBeGreaterThan(0.9);
    const last = counts.at(-1)!;
    expect(last.people).toBeGreaterThan(1.1e9);
    expect((last.by.villages![0] + last.by.hamlets![0] + last.by.farmsteads![0]) / last.people).toBeGreaterThan(0.6);
    expect(last.cities[0]).toBeGreaterThan(1000);
    // Every tradition written says whom it housed, and some house people at some time.
    expect(traditions.filter((t) => !t.lifeways.length).map((t) => t.id)).toEqual([]);
    expect(counts.some((x) => x.housed > 0)).toBe(true);
    // The glance's bar is the same count: each time's share, each time alike.
    const peopled = counts.filter((x) => x.people > 0);
    const share = peopled.reduce((s, x) => s + x.housed / x.people, 0) / peopled.length;
    expect(c.glance!.groups.flatMap((g) => g.rows).find((r) => r.id === 'houses')!.share).toBeCloseTo(share, 3);
  });

  it('puts the city of the lists in a scene of it: Uruk in 3000 BCE, which HYDE does not have', () => {
    const assessments = json<AssessmentsFile>(index.assessments);
    const traditions = json<TraditionsFile>(index.traditions).traditions;
    const cities = json<CitiesFile>(index.cities);
    const { header, arrays } = decodeTile<PeopleHeader>(buffer(file('people.lwt')));
    const people = { ...header, cell: arrays[0], land: arrays[1], people: arrays[2] } as unknown as PeopleFile;
    const p = scenePeople(
      {
        steps: index.steps,
        res: index.res,
        tileDeg: index.tile_deg,
        classes: index.classes,
        tile,
        assessments,
        traditions,
        cities,
        people: (lat, lon, t) => {
          const c = cellAt(people, lon, lat);
          const s = stepsAround(people.steps, t);
          if (c.index < 0 || !s) return undefined;
          const n = people.cell.length;
          return people.people[s.a * n + c.index] + (people.people[s.b * n + c.index] - people.people[s.a * n + c.index]) * s.mix;
        },
        fields: index.fields,
        generator: index.generator!,
        reach_deg: index.reach_deg,
        reach_km: index.reach_km,
      },
      31.32,
      45.64,
      -2999,
    )!;
    expect(p.step).toBe(index.steps[nearestStep(index.steps, -2999)]);
    expect(p.regions.map((r) => r.id)).toContain(59);
    const uruk = p.cities.find((c) => c.name === 'Uruk')!;
    expect(uruk.people).toBeGreaterThan(30000);
    const plan = makeSettlement({ site: { origin: { lat: 31.32, lon: 45.64 } }, biome: { climate: 'desert' }, people: p } as unknown as SceneSpec, { at: () => 10 }, () => 0, 16000);
    const city = plan.settlements.find((s) => s.city === 'Uruk')!;
    expect(city.pattern).toBe('city');
    expect(plan.houses.filter((h) => h.settlement === plan.settlements.indexOf(city)).length).toBeGreaterThan(1000);
  });
});
