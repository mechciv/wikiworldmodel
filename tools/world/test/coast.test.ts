// The twenty-first slice's pass criteria that a build answers for itself (docs/slices/TWENTY-FIRST-SLICE.md): the
// chance of sea is there at every node of every keyframe of the elevation field; localities held out fall on the side
// their kind is of more often than against the field's coast; the model beats a smoother with no causes, and by more
// the more is held out; its chances mean what they say; it agrees with the columns of rock, which it does not read;
// and the geography answers in the evidence tier where the finds outweigh the map.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { byteChance, byteFinds, expit, restsOnFinds, type CoastIndex } from '../../../core/coast.ts';
import { TIERS } from '../../../core/resolve.ts';
import type { CoverageFile } from '../../../core/records.ts';
import { fromMa, parsePoint, toMa } from '../../../core/time.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { coastIndexOf, coastKeyOf, coastOfBuild, coastScoresText, coastText } from '../src/coastat.ts';
import { latestBuild } from './helpers.ts';

const json = <T>(name: string): T => JSON.parse(readFileSync(join(latestBuild(), name), 'utf8')) as T;

let ts: Tileset;
let index: CoastIndex;
let coverage: CoverageFile;

beforeAll(() => {
  ts = json<Tileset>('tileset.json');
  expect(ts.files.coast).toBe('coast/index.json');
  index = coastIndexOf(latestBuild())!;
  coverage = json<CoverageFile>('coverage.json');
});

describe("the sea's chance, built", () => {
  it("gives a chance of sea at every node of every keyframe of the elevation field, and no more than the field's where nothing was found near", () => {
    const elevation = ts.fields.find((f) => f.id === index.elevation)!;
    expect(index.keyframes.map((k) => k.ageMa).sort((a, b) => a - b)).toEqual([...elevation.keyframesMa].sort((a, b) => a - b));
    expect(index.grid).toMatchObject({ nx: 360, ny: 181, step: 1 });
    const floor = expit(-index.rule.cap) - 0.003;
    const ceiling = expit(index.rule.cap) + 0.003;
    for (const ageMa of [5, 100, 300, 500]) {
      const key = coastKeyOf(latestBuild(), index, ageMa);
      expect(key.chance.length).toBe(360 * 181);
      let beyond = 0;
      let found = 0;
      for (let n = 0; n < key.chance.length; n++) {
        const chance = byteChance(key.chance[n]);
        if (key.marine[n] === 0 && key.land[n] === 0) {
          // The field alone never says more than its cap.
          expect(chance).toBeGreaterThanOrEqual(floor);
          expect(chance).toBeLessThanOrEqual(ceiling);
        } else {
          found++;
          if (chance < floor || chance > ceiling) beyond++;
        }
      }
      // Finds are near some of the globe and not most of it, and where they are many they say more than the field can.
      expect(found).toBeGreaterThan(500);
      expect(found).toBeLessThan(key.chance.length / 2);
      expect(beyond).toBeGreaterThan(20);
    }
    // Each keyframe's span runs half way to its neighbours, and its localities are those of the span.
    const k100 = index.keyframes.find((k) => k.ageMa === 100)!;
    expect([k100.olderMa, k100.youngerMa]).toEqual([102.5, 97.5]);
    expect(k100.localities[0]).toBeGreaterThan(100);
    expect(k100.localities[1]).toBeGreaterThan(20);
  });

  it('fits a yield for each keyframe since the land had life, a few marine localities for one of the land, and holds the oldest of them before', () => {
    const at = (ageMa: number) => index.keyframes.find((k) => k.ageMa === ageMa)!.yield;
    for (const ageMa of [20, 60, 100, 150, 250, 300]) {
      expect(at(ageMa)).toBeGreaterThan(1);
      expect(at(ageMa)).toBeLessThan(60);
    }
    // Before the land had life it left too few localities to set the sea's against: those keyframes are the oldest,
    // and each takes the yield of the oldest keyframe whose rocks can tell one.
    const told = index.keyframes.filter((k) => k.told);
    const untold = index.keyframes.filter((k) => !k.told);
    expect(told.length).toBeGreaterThan(70);
    expect(untold.length).toBeGreaterThan(10);
    const oldest = told.reduce((a, b) => (a.ageMa > b.ageMa ? a : b));
    expect(oldest.ageMa).toBeGreaterThan(380);
    expect(oldest.ageMa).toBeLessThan(450);
    for (const k of untold) {
      expect(k.ageMa).toBeGreaterThan(oldest.ageMa);
      expect(k.yield).toBe(oldest.yield);
      expect(k.localities[1]).toBeLessThan(index.rule.yield_land_min);
    }
    expect(coverage.coast!.scored).toBe(told.length);
    // The rule the build fitted is in the range it was let move in, and the bell is one of those the field offers.
    expect(index.rule.slope_in).toBeGreaterThan(0.1);
    expect(index.rule.slope_in).toBeLessThan(1.5);
    expect(index.rule.slope_off).toBeGreaterThan(0.1);
    expect(index.rule.slope_off).toBeLessThan(1.5);
    expect(index.rule.strength).toBeGreaterThan(0.02);
    expect(index.rule.strength).toBeLessThan(5);
    expect(index.tried.map((t) => t.km)).toContain(index.rule.kernel_km);
  });

  it('puts localities held out on the side their kind is of more often than the field\'s coast does', () => {
    const s = index.sides;
    expect(s.localities.marine).toBeGreaterThan(30000);
    expect(s.localities.land).toBeGreaterThan(10000);
    // With the others of its own node held out, a marine locality lies in the model's sea far more often than in the field's,
    // and a land one on its land at least as often.
    expect(s.node.marine_in_sea).toBeGreaterThan(s.field.marine_in_sea + 0.15);
    expect(s.node.land_on_land).toBeGreaterThanOrEqual(s.field.land_on_land);
    // With its whole tile held out it still does better for the sea's, and not much worse for the land's.
    expect(s.tile.marine_in_sea).toBeGreaterThan(s.field.marine_in_sea + 0.1);
    expect(s.tile.land_on_land).toBeGreaterThan(s.field.land_on_land - 0.03);
    // With a whole region held out there is little left but the field read softly: no worse than the field by much.
    expect(s.block.marine_in_sea).toBeGreaterThan(s.field.marine_in_sea);
    expect(s.block.land_on_land).toBeGreaterThan(s.field.land_on_land - 0.05);
  });

  it('beats the smoother with no causes where a tile, a region or an era is held out, by more the more is held out, and matches it at a node', () => {
    const { model, smoother, field } = index.scores;
    const gain = (k: 'node' | 'tile' | 'block' | 'span') => model[k].lpd - smoother[k].lpd;
    // At the range of the finds' own bell a smoother does as well: with only its node held out the two are within a
    // hundredth. The field tells more the more is held out.
    expect(Math.abs(gain('node'))).toBeLessThan(0.01);
    expect(gain('tile')).toBeGreaterThan(0.005);
    expect(gain('block')).toBeGreaterThan(gain('tile') + 0.02);
    expect(gain('span')).toBeGreaterThan(gain('block'));
    // The field's coast read as sure does worse than a coin, and read softly worse than the model wherever finds are near.
    expect(field.sure.lpd).toBeLessThan(Math.log(0.5));
    for (const k of ['node', 'tile', 'block'] as const) expect(model[k].lpd).toBeGreaterThan(field.soft.lpd);
    expect(field.soft.lpd).toBeGreaterThan(field.sure.lpd + 0.3);
    // Every locality of the keyframes whose yield the rocks can tell is scored, each way: by weight, each keyframe's
    // rounded on its own. Before the land had life a locality's kind tests nothing, and none is scored.
    const scored = index.keyframes.filter((k) => k.told).reduce((n, k) => n + k.localities[0] + k.localities[1], 0);
    expect(Math.abs(model.node.n - scored)).toBeLessThan(12);
    expect(model.node.n).toBeLessThan(index.sides.localities.marine + index.sides.localities.land - 5000);
    expect(model.block.n).toBe(model.node.n);
    expect(model.span.n).toBeGreaterThan(model.node.n / 8);
  });

  it('says what it means: of the localities given a chance of being marine, about that share were', () => {
    const { model, field } = index.scores;
    for (const s of [model.node, model.tile, model.block, field.soft]) {
      for (const fifth of s.held) {
        if (fifth.n < 1000) continue;
        expect(Math.abs(fifth.given - fifth.were)).toBeLessThan(0.06);
      }
    }
    // The field read as sure does not: of those it calls land, most were marine.
    expect(field.sure.held[0].were - field.sure.held[0].given).toBeGreaterThan(0.3);
  });

  it('agrees with the columns of rock, which it does not read, more often than the field\'s coast does', () => {
    const c = index.columns!;
    expect(c.sea.n).toBeGreaterThan(10000);
    expect(c.land.n).toBeGreaterThan(3000);
    expect(c.right.model).toBeGreaterThan(c.right.field + 0.05);
    expect(c.sea.model).toBeGreaterThan(c.sea.field + 0.08);
    // The land's units it reads a little worse than the field does, which its record says (disagrees).
    expect(c.land.model).toBeGreaterThan(c.land.field - 0.08);
    // The chance tells the two apart: far higher where a column has the sea's unit than where it has the land's.
    expect(c.sea.chance).toBeGreaterThan(c.land.chance + 0.35);
  });

  it('answers the geography in the evidence tier where the finds outweigh the map, and only on the elevation of the deep past', () => {
    const matrix = coverage.matrix!;
    const layer = matrix.layers.find((l) => l.layer === 'geography')!;
    const evidence = TIERS.indexOf('evidence');
    // The answer the rocks give is known by its words: the planet's own state is evidence too, before there was a map.
    const why = matrix.whys.findIndex((w) => w.startsWith('Fossil localities of the time lie near'));
    expect(why).toBeGreaterThanOrEqual(0);
    const source = matrix.sources.find((s) => s.id === index.field)!;
    expect(source).toMatchObject({ layer: 'geography', tier: 'evidence', res_deg: 1, lane: 'coast' });
    // It answers from the oldest keyframe until today's relief takes the elevation's place, and not to the present.
    expect(source.span[0]).toBe(fromMa(Math.max(...index.keyframes.map((k) => k.ageMa))));
    expect(toMa(source.span[1])).toBeGreaterThan(0.1);
    expect(toMa(source.span[1])).toBeLessThan(6);
    const some: number[] = [];
    matrix.columns.forEach(([older, younger], i) => {
      const share = layer.cells[i].why.find(([k]) => k === why)?.[1] ?? 0;
      if (younger <= source.span[0] || older >= source.span[1]) expect(share, `column ${i}`).toBe(0);
      else if (older >= source.span[0] && younger <= source.span[1]) {
        // Inside its span it is all the evidence there is of land and sea.
        expect(layer.cells[i].share[evidence]).toBeCloseTo(share, 3);
        some.push(share);
      }
    });
    expect(some.length).toBeGreaterThan(40);
    // Some of the globe in every column, and nowhere most of it; more of it the younger the rocks.
    for (const share of some) {
      expect(share).toBeGreaterThan(0.01);
      expect(share).toBeLessThan(0.5);
    }
    expect(some.at(-1)!).toBeGreaterThan(some[0]);
    // The share of the globe the finds outweigh the field on is counted the same way by the model itself.
    expect(index.globe.reached).toBeGreaterThan(0.03);
    expect(index.globe.reached).toBeLessThan(0.3);
    expect(index.globe.band).toBeLessThan(0.5);
    expect(coverage.coast).toMatchObject({ field: index.field, keyframes: index.keyframes.length, scores: index.scores, sides: index.sides, globe: index.globe });
  });

  it('says how it does through time: every stretch of keyframes, with its localities and the units of the columns', () => {
    const through = index.through;
    expect(through.reduce((n, t) => n + t.keyframes, 0)).toBe(index.keyframes.length);
    expect(through.reduce((n, t) => n + t.localities.marine + t.localities.land, 0)).toBeGreaterThan(index.sides.localities.marine + index.sides.localities.land - through.length);
    // Youngest first, a hundred million years each, and the keyframes before the land had life as the last.
    for (let i = 1; i < through.length; i++) expect(through[i].youngerMa).toBeGreaterThan(through[i - 1].olderMa);
    expect(through.filter((t) => !t.told)).toHaveLength(1);
    expect(through.at(-1)!.told).toBe(false);
    for (const t of through) {
      // In every stretch more of the marine localities lie in the model's sea, their own node held out, than in the field's.
      expect(t.node.marine_in_sea, `${t.olderMa}–${t.youngerMa} Ma`).toBeGreaterThan(t.field.marine_in_sea);
      // And of the columns' units, of both kinds together, no fewer on the model's likelier side than on the field's.
      expect(t.columns!.right.model, `${t.olderMa}–${t.youngerMa} Ma`).toBeGreaterThan(t.columns!.right.field - 0.01);
    }
    expect(index.columns!.sea.n).toBe(through.reduce((n, t) => n + t.columns!.sea.n, 0));
    expect(coverage.coast!.through).toEqual(through);
  });

  it('held to the present, where the coast is measured, moves it over less than a tenth of the globe, and little of the sea to land', () => {
    // The youngest keyframe's elevation is today's. Its localities are of the last 2.5 Myr, in which the sea stood up
    // to some 120 m lower and at times higher, so not all the model moves there is wrong. But it has no way to know
    // that this map is measured, and what it moves here is a measure of how far its coast can be trusted anywhere.
    const now = index.keyframes.find((k) => k.ageMa === 0)!;
    expect(now.told).toBe(true);
    expect(now.to_sea + now.to_land).toBeGreaterThan(0.02);
    expect(now.to_sea + now.to_land).toBeLessThan(0.09);
    // Over the ocean's floor a locality speaks for its own node only, so the islands' land sites, which are many,
    // do not turn the ocean round them to land.
    expect(now.to_land).toBeLessThan(0.035);
    // The land it has is about the land there is.
    expect(now.land).toBeGreaterThan(0.25);
    expect(now.land).toBeLessThan(0.31);
    expect(Math.abs(now.to_land - now.to_sea)).toBeLessThan(0.03);
  });

  it('answers at a place of today carried to the keyframe, in words', () => {
    // The Niobrara's chalk in Kansas, laid down under the Western Interior Seaway.
    const kansas = coastOfBuild(latestBuild(), 38.9, -100.5, parsePoint('85 Ma').t)!;
    expect(kansas.keyframe.ageMa).toBe(85);
    expect(kansas.marine).toBeGreaterThan(1);
    expect(kansas.chance).toBeGreaterThan(0.8);
    expect(kansas.rests).toBe(restsOnFinds(kansas.marine, kansas.land, index.rule));
    expect(coastText(kansas)).toContain('sea in');
    // Cincinnati's limestones, from before the land had life: the keyframe's yield is a younger one's, and a hundred
    // marine localities near still say sea.
    const cincinnati = coastOfBuild(latestBuild(), 39.1, -84.5, parsePoint('450 Ma').t)!;
    expect(cincinnati.keyframe.told).toBe(false);
    expect(cincinnati.marine).toBeGreaterThan(50);
    expect(cincinnati.chance).toBeGreaterThan(0.95);
    expect(coastText(cincinnati)).toContain('the land left too few localities');
    // The middle of the Pacific's floor: nothing found, and as surely sea as the field can say.
    const pacific = coastOfBuild(latestBuild(), 0, -150, parsePoint('20 Ma').t)!;
    expect(byteFinds(0)).toBe(0);
    expect(pacific.marine + pacific.land).toBeLessThan(0.05);
    expect(pacific.chance).toBeGreaterThan(0.97);
    expect(pacific.rests).toBe(false);
    expect(coastScoresText(index)).toContain('the columns of rock, which it does not read');
  });
});
