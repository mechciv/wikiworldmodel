// What a build can answer of the rock record of fossil sites (model:earth/rock-record): its stages are the atlases', a
// place's tier is true to the snapshot, the Codó Formation's lake beds lie beside the point where the first round of
// visual gaps found the viewer drawing a rainforest (docs/plans/VISUAL-GAPS.md), and the collections agree with the
// land and sea of the elevation field, which reads none of them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AtlasIndex } from '../../../core/atlas.ts';
import { kmBetween } from '../../../core/landscape.ts';
import type { CoverageFile } from '../../../core/records.ts';
import { ROCK_SITE, rockBoxes, rocksAt, rocksBinAt, rocksNear, rockSite, type RocksBin, type RocksIndex } from '../../../core/rocks.ts';
import type { SceneFileV2 } from '../../../core/scene.ts';
import { substrateOfRocks, type SubstrateFile } from '../../../core/substrate.ts';
import { fromMa, toMa } from '../../../core/time.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { rowShare } from '../src/build/atlas.ts';
import type { RocksParams } from '../src/build/rocks.ts';
import type { RocksSnapshot } from '../src/pbdb.ts';
import { placesOf, rocksOfBuild, rocksText } from '../src/rocksnear.ts';
import { loadWorld, type World } from '../src/world.ts';
import { dataset, latestBuild } from './helpers.ts';

const json = <T>(name: string): T => JSON.parse(readFileSync(join(latestBuild(), name), 'utf8')) as T;

let world: World;
let ts: Tileset;
let index: RocksIndex;
let snap: RocksSnapshot;
let params: RocksParams;
/** Where a place of today stood at a moment, by the build's tiles of the present and its frames: not by the build's own placing of a site. */
let placeAt: (lat: number, lon: number, t: number) => [number, number] | undefined;

beforeAll(async () => {
  world = await loadWorld();
  ts = json<Tileset>('tileset.json');
  index = json<RocksIndex>(ts.files.rocks!);
  snap = JSON.parse(readFileSync(await dataset(index.source, 'snapshot'), 'utf8')) as RocksSnapshot;
  params = world.fields.find((f) => f.data?.as === 'rock-record')!.params as unknown as RocksParams;
  placeAt = placesOf(latestBuild());
});

describe('the rock record of fossil sites', () => {
  it('is on the stages of the atlas of who lived where, oldest first', () => {
    const atlas = json<AtlasIndex>(ts.files.atlas!);
    expect(index.bins.map((b) => [b.from, b.to, b.slice, b.name])).toEqual(atlas.bins.map((b) => [b.from, b.to, b.slice, b.name]));
    expect(index.bins.length).toBeGreaterThan(40);
    expect(index.here_km).toBe(params.here_km);
    expect(index.near_km).toBe(params.near_km);
    expect(index.here_km).toBeLessThan(index.near_km);
  });

  it('has a tier that is true: *here* has a collection of the stage within here_km, recounted from the snapshot', () => {
    const byNo = new Map(snap.collections.map((c) => [c[0], c]));
    const none = new Set(['not reported']);
    let checked = 0;
    for (const ref of index.bins.filter((_, i) => i % 9 === 0)) {
      const bin = json<RocksBin>(ref.file);
      const older = toMa(bin.from);
      const younger = toMa(bin.to);
      expect(bin.sites.length).toBe(ref.sites * ROCK_SITE);
      const n = bin.sites.length / ROCK_SITE;
      for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 40))) {
        const site = rockSite(bin, index.classes, i);
        const c = byNo.get(site.collection)!;
        expect(c, `collection ${site.collection} of ${bin.name}`).toBeDefined();
        // It is of the stage: the stage holds a share of its span, as the build weighed it.
        const share = rowShare(c[3], c[4], older, younger, params);
        expect(share).toBeGreaterThan(0);
        expect(Math.abs(site.share - share)).toBeLessThan(0.01);
        // It says what the snapshot says, but for the database's word for no lithology.
        expect(site.environment).toBe(snap.words[c[5]]);
        expect(site.lithologies.map((l) => l.name)).toEqual([snap.words[c[8]], snap.words[c[12]]].filter((w) => w && !none.has(w)));
        // It stands where its plate stood at the stage's slice, to the hundredth of a degree it is kept to.
        const at = placeAt(c[1], c[2], bin.slice)!;
        expect(at, `collection ${site.collection} on its plate at ${bin.name}`).toBeDefined();
        expect(kmBetween(at[0], at[1], site.lat, site.lon)).toBeLessThan(2);
        // Asked at its own place, the rock is here.
        const answer = rocksAt(bin, index, at[0], at[1]);
        expect(answer.tier).toBe('here');
        expect(answer.here.nearest).toBeLessThanOrEqual(index.here_km);
        expect(rocksNear(bin, index.classes, at[0], at[1], index.here_km).some((s) => s.collection === site.collection)).toBe(true);
        checked++;
      }
      // And somewhere with no site within near_km, there is nothing.
      let empty: [number, number] | undefined;
      for (let lat = -80; lat <= 80 && !empty; lat += 20) for (let lon = -170; lon <= 170 && !empty; lon += 20) if (!rocksNear(bin, index.classes, lat, lon, index.near_km).length) empty = [lat, lon];
      expect(empty, `a place far from every site of ${bin.name}`).toBeDefined();
      const nothing = rocksAt(bin, index, empty![0], empty![1]);
      expect(nothing.tier).toBe('nothing');
      expect(nothing.here.sites + nothing.near.sites).toBe(0);
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('keeps no word the field says means nothing was given', () => {
    for (const ref of index.bins.filter((_, i) => i % 6 === 0)) expect(json<RocksBin>(ref.file).words).not.toContain('not reported');
    expect(Object.keys(index.lithologies)).not.toContain('not reported');
    // The types are the database's own: gypsum is an evaporite and a sandstone a siliciclastic rock, by its vocabulary.
    expect(index.lithologies.gypsum).toBe('evaporite');
    expect(index.lithologies.sandstone).toBe('siliciclastic');
  });

  it('finds the Codó Formation\'s lake beds beside the first round\'s Aptian point', () => {
    // The round's fourth point: 123.7 Ma, today about 4.04° S, 43.18° W, in Maranhão (tools/gaps/rounds/1).
    const t = fromMa(123.7);
    const ref = rocksBinAt(index, t)!;
    expect(ref).toBeDefined();
    const bin = json<RocksBin>(ref.file);
    const at = placeAt(-4.04, -43.18, bin.slice)!;
    const answer = rocksAt(bin, index, at[0], at[1]);
    expect(answer.tier).toBe('here');
    // A lake's beds within a scene's reach, by the database's own class and word.
    expect(answer.here.environments[0][0]).toBe('lacustrine indet.');
    expect(answer.here.classes.map(([c]) => c)).toContain('lacustrine');
    expect(answer.here.nearest).toBeLessThan(25);
    const near = rocksNear(bin, index.classes, at[0], at[1], index.near_km);
    const formations = new Set(near.map((s) => snap.words[snap.collections.find((c) => c[0] === s.collection)![7]]));
    expect([...formations].some((f) => /^Cod[oó]$/.test(f))).toBe(true);
    // No collection of the stage within reach is of a forest's ground: the country round is lake, river plain and shore.
    expect(near.filter((s) => s.environment === 'mire/swamp').length).toBe(0);
    // What `npm run world -- rocks -4.04 -43.18 123.7 Ma` prints is the same answer, with each site's row.
    const told = rocksOfBuild(latestBuild(), -4.04, -43.18, t)!;
    expect(told.answer).toEqual(answer);
    expect(rocksText(told)).toMatch(new RegExp(`${index.source}#coll:${near[0].collection}`));
  });

  it('makes the ground at the first round\'s Aptian point of the lake beds beside it, and the build\'s own scene\'s of its formation\'s', () => {
    const file = json<SubstrateFile>(ts.files.substrate!);
    expect(file.rocks).toBe(ts.files.rocks);
    const ref = rocksBinAt(index, fromMa(123.7))!;
    const bin = json<RocksBin>(ref.file);
    const at = placeAt(-4.04, -43.18, bin.slice)!;
    const ground = substrateOfRocks(bin, index, file.rule, at[0], at[1])!;
    // The one collection within a scene's reach is the Codó Formation's yellow "shale": mud, and evidence of the place.
    expect(ground.tier).toBe('evidence');
    expect(ground.weight).toBe(1);
    expect(ground.materials).toEqual([['mud', 1]]);
    expect(ground.colours).toEqual([['yellow', 1]]);
    expect(ground.rows[0]).toBe(`${index.source}#coll:31170`);
    // Through the stage's boxes the answer is the same.
    expect(substrateOfRocks(bin, index, file.rule, at[0], at[1], rockBoxes(bin))).toEqual(ground);
    // The build's own scene, of the Hell Creek, has a ground from the rocks of its formation's collections.
    const site = ts.sites!.find((s) => s.kind === 'life')!;
    const scene = json<SceneFileV2>(site.file).spec;
    expect(scene.substrate).toBeDefined();
    expect(scene.substrate!.materials.reduce((n, [, w]) => n + w, 0)).toBeCloseTo(1, 2);
    expect(scene.substrate!.rows.every((r) => r.startsWith(`${index.source}#coll:`))).toBe(true);
    // And every layer's answer for the ground is one of its tiers, with the rocks or with nothing.
    const coverage = json<CoverageFile>(ts.files.coverage);
    const tiers = coverage.tiers!.map((x) => x.layers.substrate);
    expect(tiers.every((x) => x)).toBe(true);
    expect(tiers.some((x) => x.evidence > 0)).toBe(true);
    expect(tiers.every((x) => x.unknown === 0 || x.evidence + x.model + x.generic === 0)).toBe(true);
  });

  it('stands most terrestrial collections on the elevation field\'s land at their stage, and lays most marine ones in its sea', () => {
    const a = index.agreement;
    expect(a.land).toBeGreaterThan(20000);
    expect(a.sea).toBeGreaterThan(100000);
    expect(a.land_on_land / a.land).toBeGreaterThan(0.5);
    expect(a.sea_in_sea / a.sea).toBeGreaterThan(0.5);
    const coverage = json<CoverageFile>(ts.files.coverage);
    expect(coverage.rocks?.agreement).toEqual(a);
    expect(coverage.rocks?.measured.collections).toBe(new Set(snap.ages.map((x) => x[0])).size);
    expect(coverage.rocks?.collections).toBe(snap.collections.length);
  });
});
