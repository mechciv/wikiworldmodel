// The twenty-fourth slice's pass criteria that a build answers for itself (docs/slices/TWENTY-FOURTH-SLICE.md): a
// climate with its spread at every node of every keyframe of the climate field; the pattern answering to the Earth's
// mean warmth more towards the poles; the energy balance against the rocks' curve with an era held out; beds held out
// told beside a smoother with no causes; chances that mean what they say; the columns of rock and the fossil forests,
// held apart; the present, where the climate is measured; and the Hell Creek.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { LAND_BIT } from '../../../core/climate.ts';
import { band, CLASSES, monthSd, PAIRS, RESTS_FROM, type ChanceIndex } from '../../../core/climatechance.ts';
import { TIERS } from '../../../core/resolve.ts';
import type { CoverageFile } from '../../../core/records.ts';
import { parsePoint } from '../../../core/time.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { chanceIndexOf, chanceKeyOf, chanceOfBuild, chanceScoresText, chanceText } from '../src/climateat.ts';
import { latestBuild } from './helpers.ts';

const json = <T>(name: string): T => JSON.parse(readFileSync(join(latestBuild(), name), 'utf8')) as T;
const at = (lat: number, lon: number, when: string) => chanceOfBuild(latestBuild(), lat, lon, parsePoint(when as never).t);

let ts: Tileset;
let index: ChanceIndex;
let coverage: CoverageFile;

beforeAll(() => {
  ts = json<Tileset>('tileset.json');
  expect(ts.files.climateChance).toBe('climate-chance/index.json');
  index = chanceIndexOf(latestBuild())!;
  coverage = json<CoverageFile>('coverage.json');
});

describe('the climate conditioned, built', () => {
  it('gives a climate with its spread at every node the run has one, the chances adding to one', () => {
    expect(index.field).toBe('field:earth/climate-chance');
    expect(index.beds.field).toBe('field:earth/climate-beds');
    expect(index.classes).toEqual([...CLASSES]);
    // A keyframe for each run of the climate field, ten million years apart, each with its span.
    expect(index.keyframes.map((k) => k.ageMa)).toEqual(Array.from({ length: 55 }, (_, i) => i * 10));
    expect(index.grid).toMatchObject({ nx: 180, ny: 91, step: 2 });
    const k100 = index.keyframes.find((k) => k.ageMa === 100)!;
    expect([k100.olderMa, k100.youngerMa]).toEqual([105, 95]);
    for (const ageMa of [0, 70, 250, 500]) {
      const key = chanceKeyOf(latestBuild(), index, ageMa);
      const n = index.grid.nx * index.grid.ny;
      expect(key.chances.length).toBe(n * CLASSES.length);
      let land = 0;
      let none = 0;
      for (let k = 0; k < n; k++) {
        let sum = 0;
        for (let c = 0; c < CLASSES.length; c++) sum += key.chances[k * CLASSES.length + c];
        if (key.plate[k] & LAND_BIT) {
          // Every node where the run has land has a climate: its chances add to one, as bytes to 255.
          land++;
          expect(sum).toBe(255);
          // And a spread: the run's error at the least, which no bed takes away whole.
          expect(key.spread[k * 2]).toBeGreaterThan(10);
          expect(key.spread[k * 2 + 1]).toBeGreaterThan(30);
        } else if (sum === 0) none++;
        else expect(sum).toBe(255);
      }
      expect(land).toBeGreaterThan(1500);
      // The run's climate is spread out over the sea from its land; furthest from any land it has none, and neither has this.
      expect(none).toBeGreaterThan(100);
      expect(none).toBeLessThan(n / 2);
    }
    // Sixteen members at each keyframe, member 0 the central one.
    for (const k of index.keyframes) {
      expect(k.members).toHaveLength(16);
      expect(k.members[0]).toBeCloseTo(k.warmth.mean, 3);
    }
  });

  it('reads from the runs that the poles answer to the Earth\'s mean warmth more than the equator', () => {
    const r = index.rule.response;
    expect(r.belt_deg).toBe(10);
    expect(r.warm).toHaveLength(9);
    // Under a degree for a degree on the land of the equator, more than two near the poles, and more with each belt.
    expect(r.warm[0]).toBeGreaterThan(0.6);
    expect(r.warm[0]).toBeLessThan(1.1);
    expect(r.warm[8]).toBeGreaterThan(2);
    for (let b = 1; b < r.warm.length; b++) expect(r.warm[b]).toBeGreaterThan(r.warm[b - 1] - 0.05);
    // The land of the middle latitudes is a little drier in a warmer world, as the runs have it.
    expect(Math.min(...r.wet)).toBeLessThan(-0.01);
    expect(Math.max(...r.wet.map(Math.abs))).toBeLessThan(0.1);
  });

  it('tells an era of the rocks\' curve held out better than the mean of the other eras once brought to its level, and worse as it is', () => {
    const w = index.warmth;
    expect(w.keyframes).toBeGreaterThan(35);
    expect(w.eras).toBeGreaterThanOrEqual(4);
    // The balance is colder than the curve by several degrees on average.
    expect(w.bias).toBeLessThan(-3);
    // As it is, it tells the curve worse than the mean of the other eras does: the criterion does not hold for it.
    expect(w.balance).toBeGreaterThan(w.baseline);
    // Brought to the curve's level by the other eras, better.
    expect(w.shifted).toBeLessThan(w.baseline);
    // Its own error is what it then has left, and the keyframes before the CO₂ have no prior from it.
    expect(index.rule.balance_sd).toBeCloseTo(w.shifted, 6);
    const with_ = index.keyframes.filter((k) => k.warmth.prior);
    expect(with_.length).toBe(w.keyframes);
    expect(Math.max(...with_.map((k) => k.ageMa))).toBeLessThan(430);
    for (const k of index.keyframes) {
      expect(k.warmth.seen, `${k.ageMa} Ma`).toBeDefined();
      // The two together are surer than either, and lie between them where no forest moved them.
      if (k.warmth.prior && !k.warmth.forests) {
        expect(k.warmth.sd).toBeLessThan(Math.min(k.warmth.prior.sd, k.warmth.seen!.sd) + 0.01);
        expect(k.warmth.mean).toBeGreaterThanOrEqual(Math.min(k.warmth.prior.mean, k.warmth.seen!.mean) - 0.01);
        expect(k.warmth.mean).toBeLessThanOrEqual(Math.max(k.warmth.prior.mean, k.warmth.seen!.mean) + 0.01);
      }
    }
    // A forest near a pole asks for a warm Earth: at the keyframe of the Permian's end the warmth moves up.
    const k250 = index.keyframes.find((k) => k.ageMa === 250)!;
    expect(k250.warmth.forests?.n).toBe(1);
    expect(k250.warmth.mean).toBeGreaterThan(k250.warmth.forests!.mean);
  });

  it('tells wet and dry beds held out better than the smoother with no causes, and reefs no better', () => {
    const wet = index.scores.wet;
    // With its node's others held out, its tile's, its block's and its era's: the model tells a wet bed from a dry
    // one at least as well as the latitude and the time do, and by the most with a block held out.
    expect(wet.model.node.n).toBeGreaterThan(800);
    expect(wet.model.node.lpd).toBeGreaterThan(wet.smoother.node.lpd - 0.002);
    expect(wet.model.tile.lpd).toBeGreaterThan(wet.smoother.tile.lpd);
    expect(wet.model.block.lpd - wet.smoother.block.lpd).toBeGreaterThan(0.02);
    expect(wet.model.block.lpd - wet.smoother.block.lpd).toBeGreaterThan(wet.model.tile.lpd - wet.smoother.tile.lpd);
    expect(wet.model.span.lpd).toBeGreaterThan(wet.smoother.span.lpd - 0.02);
    // The beds near tell more than the members alone do, and less the more is held out.
    expect(wet.model.node.lpd).toBeGreaterThan(wet.model.tile.lpd);
    expect(wet.model.tile.lpd).toBeGreaterThan(wet.model.block.lpd);
    expect(wet.model.block.lpd).toBeGreaterThan(wet.alone.lpd);
    // Reefs: the run's warmth tells where they lie no better than the latitude does, at any hold-out.
    const reef = index.scores.reef;
    expect(reef.model.node.n).toBeGreaterThan(30000);
    for (const h of ['node', 'tile', 'block', 'span'] as const) expect(Math.abs(reef.model[h].lpd - reef.smoother[h].lpd), h).toBeLessThan(0.006);
    // Tills are of the youngest keyframes only: with a block held out the model tells them better than the smoother,
    // and no era of them can be held out.
    const ice = index.scores.ice;
    expect(ice.model.block.lpd).toBeGreaterThan(ice.smoother.block.lpd);
    expect(ice.model.span.n).toBe(0);
    // The links run the way their kinds say: more coal where it is wetter, more reefs where it is warmer, fewer tills.
    for (const pair of PAIRS) expect(index.rule.links[pair].slope, pair).toBeGreaterThan(0);
    expect(index.rule.links.wet.slope).toBeGreaterThan(1);
    // Wet and dry beds are read from the first coals on; reefs at every keyframe.
    expect(index.keyframes.filter((k) => k.pairs.reef.told).length).toBe(55);
    const wetKeys = index.keyframes.filter((k) => k.pairs.wet.told);
    expect(wetKeys.length).toBeGreaterThan(25);
    expect(Math.max(...wetKeys.map((k) => k.ageMa))).toBeLessThan(400);
    expect(Math.max(...index.keyframes.filter((k) => k.pairs.ice.told).map((k) => k.ageMa))).toBeLessThan(40);
  });

  it('says what it means: of the beds given a chance of being of a kind, about that share were', () => {
    for (const pair of ['wet', 'reef'] as const) {
      for (const h of ['node', 'tile', 'block'] as const) {
        for (const b of index.scores[pair].model[h].held) {
          if (b.n < (pair === 'wet' ? 100 : 300)) continue;
          expect(Math.abs(b.given - b.were), `${pair}, its ${h} held out, of those given ${b.given}`).toBeLessThan(0.13);
        }
      }
    }
  });

  it('orders the columns\' units with salt and with coal, which it does not read, at least as well as the run does', () => {
    const c = index.columns!;
    expect(c.dry).toBeGreaterThan(200);
    expect(c.wet).toBeGreaterThan(200);
    // Of every pair of a unit with salt and one with coal at a keyframe, the salt lies on the drier ground far more
    // often than not, by the run already, and by the model at least as often.
    expect(c.ordered.run).toBeGreaterThan(0.75);
    expect(c.ordered.model).toBeGreaterThanOrEqual(c.ordered.run);
    // The units with salt lie on drier ground than those with coal, by both.
    expect(c.run.dry).toBeLessThan(c.run.wet);
    expect(c.model.dry).toBeLessThan(c.model.wet);
    // But half of the units with salt lie on ground whose central climate is not arid, by the model as by the run.
    expect(c.sides.model.dry).toBeLessThan(0.7);
    expect(c.sides.model.dry).toBeGreaterThanOrEqual(c.sides.run.dry - 0.02);
    expect(c.sides.model.wet).toBeGreaterThan(0.85);
  });

  it('gives the fossil forests, each held out, a climate that bears trees more often than not, and more once read', () => {
    const f = index.forests!;
    expect(f.length).toBeGreaterThanOrEqual(15);
    const mean = (of: (x: (typeof f)[number]) => number) => f.reduce((s, x) => s + of(x), 0) / f.length;
    // Held out, each forest is told from all else: four times in five on average, and none under a third.
    expect(mean((x) => x.trees)).toBeGreaterThan(0.7);
    for (const x of f) expect(x.trees, x.id).toBeGreaterThan(0.33);
    // Read, each is surer of its trees, and none less sure.
    expect(mean((x) => x.read)).toBeGreaterThan(mean((x) => x.trees));
    for (const x of f) expect(x.read, x.id).toBeGreaterThanOrEqual(x.trees - 0.01);
    // The run's own class bears trees at all of them but one: taken as a point it does better than the model does
    // with each forest held out, which is the criterion that does not hold.
    expect(f.filter((x) => x.runTrees).length).toBeGreaterThanOrEqual(f.length - 2);
  });

  it('held to the present, has the measured climate in its band about nine times in ten, and gives the measured class more chance than the run\'s class as a point', () => {
    const p = index.present!;
    expect(p.nodes).toBeGreaterThan(3000);
    // The band nine members in ten lie in holds the measured month and aridity at about nine land nodes in ten, with
    // each block's spread told from the other blocks.
    for (const share of [p.within.hot, p.within.cold, p.within.aridity]) {
      expect(share).toBeGreaterThan(0.85);
      expect(share).toBeLessThan(0.95);
    }
    // The run with its spread gives the measured class more chance than the run's class taken as a point.
    expect(p.lpd.spread).toBeGreaterThan(p.lpd.point + 0.2);
    // With the beds of the youngest keyframe's span read, the measured class gets no less chance, and the aridity lies nearer.
    expect(p.lpd.beds).toBeGreaterThan(p.lpd.spread - 0.01);
    expect(p.same.beds).toBeGreaterThan(p.same.run - 0.01);
    expect(p.rms.wet[1]).toBeLessThan(p.rms.wet[0] + 0.005);
    // And the model, with the warmth of that span too, no less than the run with its spread by much.
    expect(p.lpd.model).toBeGreaterThan(p.lpd.spread - 0.05);
    expect(p.same.model).toBeGreaterThan(p.same.run - 0.03);
    // What it has read at the present: how far the run is out, and how far its errors reach.
    const e = index.rule.error;
    expect(e.mean_sd).toBeGreaterThan(1.5);
    expect(e.mean_sd).toBeLessThan(4);
    expect(e.swing_sd).toBeGreaterThan(Math.abs(e.swing_bias));
    expect(e.wet_sd).toBeGreaterThan(0.4);
    expect(e.warm_km).toBeGreaterThan(300);
    expect(e.wet_km).toBeGreaterThan(300);
  });

  it('holds the Hell Creek\'s leaves against its band: the year\'s mean within reach of them, and winters that freeze where they did not', () => {
    const c = at(47.55, -106.86, '66.5 Ma')!;
    expect(c.keyframe.ageMa).toBe(70);
    // The run has the year's mean inside the leaves' 12 to 20 °C, and the coldest month below freezing.
    const runMean = (c.run!.hot + c.run!.cold) / 2;
    expect(runMean).toBeGreaterThan(12);
    expect(runMean).toBeLessThan(20);
    expect(c.run!.cold).toBeLessThan(0);
    // The model is colder: its band for the year's mean takes in the lower part of the leaves' range and not its middle.
    const mean = band((c.central.hot + c.central.cold) / 2, c.spreads.warm);
    expect(mean[1]).toBeGreaterThan(12);
    expect(mean[0]).toBeLessThan(12);
    expect((c.central.hot + c.central.cold) / 2).toBeLessThan(runMean);
    // And its coldest month is below freezing in nearly every member, where the crocodilians say it did not freeze.
    expect(band(c.central.cold, monthSd(c.spreads))[1]).toBeLessThan(5);
    // Coals lie near, and no salt to speak of: the beds say wet, and the aridity is the run's or above it.
    expect(c.found.wet[0]).toBeGreaterThan(5);
    expect(c.found.wet[0]).toBeGreaterThan(3 * c.found.wet[1]);
    expect(c.central.aridity).toBeGreaterThan(c.run!.aridity * 0.95);
  });

  it('answers for well-known places, and says so in lines', () => {
    // The coal swamps of the Carboniferous at the equator: wet all year, with coals near.
    const pittsburgh = at(40.4, -80, '305 Ma')!;
    expect(pittsburgh.found.wet[0]).toBeGreaterThan(3);
    expect(byRank(pittsburgh.chances)[0]).toBe('rainforest');
    // The sand sea of the Jurassic in Utah: a desert, with dunes near.
    const zion = at(37.2, -113, '185 Ma')!;
    expect(zion.found.wet[1]).toBeGreaterThan(3);
    expect(byRank(zion.chances)[0]).toBe('desert');
    // Today: the ice of Greenland, the desert of the Sahara, the cold of Siberia.
    expect(byRank(at(72.6, -38.5, '1950 CE')!.chances)[0]).toBe('ice');
    expect(byRank(at(22.8, 5.5, '1950 CE')!.chances)[0]).toBe('desert');
    expect(byRank(at(62, 129.7, '1950 CE')!.chances)[0]).toBe('cold');
    const text = chanceText(at(47.55, -106.86, '66.5 Ma')!);
    expect(text).toContain('the keyframe of 70 Ma');
    expect(text).toContain("the Earth's mean warmth");
    expect(text).toContain('coals and mires');
    const scores = chanceScoresText(index);
    expect(scores).toContain('the columns of rock, which it does not read');
    expect(scores).toContain('held to the present');
    expect(scores).toContain('the fossil forests');
    // Ground that no plate carries back to the time has no climate then: the floor of today's Pacific, in the Carboniferous.
    expect(at(0, -150, '300 Ma')).toBeUndefined();
  });

  it('answers the climate in the evidence tier only where what was found near has told a quarter of the square of a spread', () => {
    // What a keyframe's file says of a node, and what the coverage counts.
    const key = chanceKeyOf(latestBuild(), index, 0);
    let rests = 0;
    let land = 0;
    for (let n = 0; n < key.plate.length; n++) {
      if (!(key.plate[n] & LAND_BIT)) continue;
      land++;
      if (Math.max(key.told[n * 2], key.told[n * 2 + 1]) / 255 >= RESTS_FROM) rests++;
    }
    // Some of the land of the youngest keyframe, and not most of it.
    expect(rests).toBeGreaterThan(50);
    expect(rests).toBeLessThan(land / 2);
    expect(index.globe.reached).toBeGreaterThan(0.005);
    expect(index.globe.reached).toBeLessThan(0.3);
    // The beds never take half of a spread's square: for the warmth they take next to nothing.
    let most = 0;
    let warmest = 0;
    for (let n = 0; n < key.plate.length; n++) {
      most = Math.max(most, key.told[n * 2 + 1]);
      warmest = Math.max(warmest, key.told[n * 2]);
    }
    expect(most / 255).toBeLessThan(0.6);
    expect(warmest / 255).toBeLessThan(0.15);
    // The coverage chart has a lane for it on the climate's layer, in the evidence tier, and the layer answers in a tier everywhere.
    const m = coverage.matrix!;
    expect(m.sources.find((s) => s.id === index.field)).toMatchObject({ layer: 'climate', tier: 'evidence', res_deg: 2, lane: 'climate-chance' });
    const tiers = coverage.tiers!.flatMap((t) => Object.entries(t.layers.climate));
    for (const [tier] of tiers) expect(TIERS).toContain(tier);
    const evidence = coverage.tiers!.reduce((s, t) => s + (t.layers.climate.evidence ?? 0), 0);
    expect(evidence).toBeGreaterThan(0);
  });

  it('writes what it found into the coverage file, as the index has it', () => {
    const c = coverage.climateChance!;
    expect(c.field).toBe(index.field);
    expect(c.keyframes).toBe(index.keyframes.length);
    expect(c.rule).toEqual(index.rule);
    expect(c.scores).toEqual(index.scores);
    expect(c.balance).toEqual(index.warmth);
    expect(c.present).toEqual(index.present);
    expect(c.columns).toEqual(index.columns);
    expect(c.forests).toEqual(index.forests);
    expect(c.through).toEqual(index.through);
    expect(c.warmth.map((k) => k.ageMa)).toEqual(index.keyframes.map((k) => k.ageMa));
    expect(c.beds).toBeGreaterThan(50000);
    // Through time: six stretches of a hundred million years, each with what was read in it.
    expect(index.through).toHaveLength(6);
    expect(index.through[0]).toMatchObject({ youngerMa: 0, olderMa: 90, keyframes: 10 });
  });
});

/** The classes of a place, likeliest first. */
function byRank(chances: number[]): string[] {
  return CLASSES.map((c, i) => [c, chances[i]] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
}

