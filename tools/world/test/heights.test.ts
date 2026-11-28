// The twenty-third slice's pass criteria that a build answers for itself (docs/slices/TWENTY-THIRD-SLICE.md): there is
// a level of the sea with a band at every keyframe of the elevation field, told by the beds laid down at the shore
// where they can tell it; it holds on shore beds, on keyframes and at the present as far as it does; there is a height
// with a band at every node; the ranges stand where their records say; and the kinds of beds held out are told as
// well, and as badly, as the slice's document says. The criteria that do not hold are tested as they are found, so
// that a change which mends one is noticed and the document changed with it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { byteChance, expit } from '../../../core/coast.ts';
import { byteSd, heightOf, heightsStats, RESTS, type HeightsIndex } from '../../../core/heights.ts';
import type { CoverageFile, SeriesFile } from '../../../core/records.ts';
import { fromMa, parsePoint } from '../../../core/time.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { heightsIndexOf, heightsKeyOf, heightsOfBuild, heightsScoresText, heightsText } from '../src/heightsat.ts';
import { latestBuild } from './helpers.ts';

const json = <T>(name: string): T => JSON.parse(readFileSync(join(latestBuild(), name), 'utf8')) as T;
const HELD = ['node', 'tile', 'block', 'span'] as const;
const OUT = ['tile', 'block', 'span'] as const;

let ts: Tileset;
let index: HeightsIndex;
let coverage: CoverageFile;

beforeAll(() => {
  ts = json<Tileset>('tileset.json');
  expect(ts.files.heights).toBe('heights/index.json');
  index = heightsIndexOf(latestBuild())!;
  coverage = json<CoverageFile>('coverage.json');
});

describe("the sea's level, built", () => {
  it('gives a level with a band at every keyframe, and says where the shore beds could not tell it', () => {
    const elevation = ts.fields.find((f) => f.id === index.elevation)!;
    expect(index.keyframes.map((k) => k.ageMa).sort((a, b) => a - b)).toEqual([...elevation.keyframesMa].sort((a, b) => a - b));
    for (const k of index.keyframes) {
      expect(k.lo, `${k.ageMa} Ma`).toBeLessThanOrEqual(k.level);
      expect(k.hi, `${k.ageMa} Ma`).toBeGreaterThanOrEqual(k.level);
      expect(k.hi - k.lo, `${k.ageMa} Ma`).toBeGreaterThan(5);
      expect(k.follow).toBeGreaterThanOrEqual(0);
      expect(k.follow).toBeLessThanOrEqual(1);
      // A keyframe is told by its own beds only where they count for enough.
      if (k.told) expect(k.read).toBeGreaterThanOrEqual(index.rule.shore_min);
      expect(!!k.own).toBe(k.told);
      // What the reading leaves open is kept beside it: the level if the old shore stands as high as the middle bed found.
      expect(Math.abs(k.with_stands - (k.level + k.follow * k.stands)), `${k.ageMa} Ma`).toBeLessThan(2);
    }
    const told = index.keyframes.filter((k) => k.told);
    expect(told.length).toBeGreaterThan(20);
    expect(told.length).toBeLessThan(60);
    // Before the land had life the map draws its shelf seas at one depth and the shore beds lie in them: no level is
    // read, it is the map's own coast, and its band is as wide as a level nothing tells.
    for (const k of index.keyframes.filter((x) => x.ageMa >= 430)) {
      expect(k.told, `${k.ageMa} Ma`).toBe(false);
      expect(Math.abs(k.level)).toBeLessThan(5);
      expect(k.hi - k.lo).toBeGreaterThan(2.5 * index.rule.stray_m);
    }
    // Every map of the last sixty million years follows today's ground nearly whole, where that ground stands near
    // today's sea: on low ground the map is today's, carried back.
    const at = (ageMa: number) => index.keyframes.find((k) => k.ageMa === ageMa)!;
    for (const k of index.keyframes.filter((x) => x.ageMa <= 60)) expect(k.follow, `${k.ageMa} Ma`).toBeGreaterThan(0.85);
    // In those maps the level, read with the old shore at today's sea, is within some tens of metres of the map's
    // coast, and furthest above it at 35 and 40 Ma, when their own beds tell it.
    const recent = index.keyframes.filter((k) => k.ageMa >= 5 && k.ageMa <= 70);
    expect(recent.every((k) => k.told)).toBe(true);
    for (const k of recent) expect(Math.abs(k.level), `${k.ageMa} Ma`).toBeLessThan(80);
    expect(at(40).level).toBeGreaterThan(30);
    expect(at(40).lo).toBeGreaterThan(0);
    // The level's series, for the planet's readings: every keyframe, oldest first, with its band.
    const series = index.level.series;
    expect(series.id).toBe(index.level.field);
    expect(series.points).toHaveLength(index.keyframes.length);
    for (let i = 1; i < series.points.length; i++) expect(series.points[i][0]).toBeGreaterThan(series.points[i - 1][0]);
    const p = series.points.find((x) => x[0] === Math.round(fromMa(40)))!;
    expect(p.slice(1)).toEqual([at(40).level, at(40).lo, at(40).hi]);
    // It is kept with the heights, and not among the series made before the elevation is read.
    expect(json<SeriesFile>(ts.files.series).series.some((s) => s.id === series.id)).toBe(false);
  });

  it('held to the present, where the level is known, has nothing inside its band and puts the level within a few metres of it', () => {
    const now = index.present;
    expect(now.ageMa).toBe(0);
    // The map of the present is today's ground and its coast today's: the level there is nothing. The youngest
    // keyframe's own beds are not told so, and are read as any other's.
    expect(now.lo).toBeLessThanOrEqual(0);
    expect(now.hi).toBeGreaterThanOrEqual(0);
    expect(Math.abs(now.level)).toBeLessThan(10);
    expect(now.hi - now.lo).toBeLessThan(60);
    // And the map of the present is found to be today's ground: it follows it whole, and has ground that stands at today's sea at its own coast.
    const k = index.keyframes.find((x) => x.ageMa === 0)!;
    expect(k.follow).toBeGreaterThan(0.95);
    expect(Math.abs(k.raised)).toBeLessThan(15);
    // Its beds are of the last two and a half million years, through which the sea stood well below today's on
    // average by the stack of the last 800,000: the level they give is the high stands', whose shores lie on land.
    const stack = json<SeriesFile>(ts.files.series).series.find((s) => s.id === 'field:earth/sea-level-stack')!;
    const mean = stack.points.reduce((sum, x) => sum + x[1], 0) / stack.points.length;
    expect(mean).toBeLessThan(-40);
    expect(now.level).toBeGreaterThan(mean);
  });

  it("tells where the map puts a shore bed held out better than the map's own coast does and than the shore beds near with no level, the more so the more is held out", () => {
    const s = index.scores.shore;
    expect(s.level.tile.n).toBeGreaterThan(1000);
    for (const held of OUT) {
      expect(s.level[held].mean, held).toBeLessThan(s.map[held].mean - 10);
      expect(s.level[held].middle, held).toBeLessThan(s.map[held].middle);
      expect(s.level[held].mean, held).toBeLessThan(s.smoother[held].mean);
      expect(s.level[held].middle, held).toBeLessThanOrEqual(s.smoother[held].middle);
    }
    // The shore beds near have less to go on the more is held out, and with a keyframe nothing: they are then the map's own coast.
    expect(s.smoother.span).toEqual(s.map.span);
    expect(s.smoother.block.mean - s.level.block.mean).toBeGreaterThan(s.smoother.tile.mean - s.level.tile.mean);
    expect(s.smoother.span.mean - s.level.span.mean).toBeGreaterThan(s.smoother.block.mean - s.level.block.mean);
  });

  it("is set beside van der Meer's curve, which it never reads: what the curve would make the level, and how many of the shore beds found stand below it today", () => {
    expect(index.rival?.field).toBe('field:earth/sea-level');
    expect(index.rival!.at).toHaveLength(index.keyframes.length);
    const key = (ageMa: number) => index.keyframes.find((x) => x.ageMa === ageMa)!;
    const other = (ageMa: number) => index.rival!.at.find((x) => x.ageMa === ageMa)!;
    // If the old shore stands today where the curve has it, the level is higher by the curve's value times the map's following.
    expect(other(20).value).toBeGreaterThan(80);
    expect(Math.abs(other(20).level - (key(20).level + key(20).follow * other(20).value))).toBeLessThan(2);
    // The two cannot be told apart by where the map puts the shore beds: each tells that alike. What differs is where
    // the beds stand today. From 10 to 20 Ma about half of those found stand below the curve's level, as they would
    // if ground had gone up as often as down; from 25 to 50 Ma well over half do.
    for (const ageMa of [10, 15, 20]) {
      expect(other(ageMa).below, `${ageMa} Ma`).toBeGreaterThan(0.35);
      expect(other(ageMa).below, `${ageMa} Ma`).toBeLessThan(0.6);
    }
    for (const ageMa of [25, 30, 35, 40, 45, 50]) {
      expect(other(ageMa).below, `${ageMa} Ma`).toBeGreaterThan(0.5);
      // And the middle bed found stands lower today than the curve has the sea of its time.
      expect(key(ageMa).stands, `${ageMa} Ma`).toBeLessThan(other(ageMa).value);
      expect(key(ageMa).with_stands, `${ageMa} Ma`).toBeLessThan(other(ageMa).level);
    }
    // The curve's own level lies above the band of the level as read, wherever the map follows today's ground: the band is of the reading, and the reading takes the old shore to stand at today's sea.
    expect(other(40).level).toBeGreaterThan(key(40).hi);
    // Through time the stretches say the same of the beds.
    const young = index.through[0];
    expect(young.youngerMa).toBe(0);
    expect(young.shore.stands).toBeGreaterThan(50);
    expect(young.shore.below!).toBeGreaterThan(0.3);
    expect(young.shore.below!).toBeLessThan(0.6);
  });

  it("has a keyframe's own level inside the band told from the others about nine times in ten", () => {
    const b = index.scores.level_band;
    expect(b.n).toBe(index.keyframes.filter((k) => k.told).length);
    expect(b.inside).toBeGreaterThan(0.8);
    expect(b.inside).toBeLessThanOrEqual(1);
    // The walk kept is one of those tried, and the best of them.
    const best = index.tried.reduce((a, t) => (t.lpd > a.lpd ? t : a));
    expect(best.hold).toBe(index.rule.hold);
    expect(best.stray_m).toBe(index.rule.stray_m);
  });
});

describe('the height of the land, built', () => {
  it("gives a height with a band at every node of every keyframe, the map's less the level where nothing else is known", () => {
    expect(index.grid).toMatchObject({ nx: 360, ny: 181, step: 1 });
    const floor = expit(-index.rule.cap) - 0.003;
    const ceiling = expit(index.rule.cap) + 0.003;
    for (const ageMa of [5, 100, 300, 500]) {
      const k = index.keyframes.find((x) => x.ageMa === ageMa)!;
      const key = heightsKeyOf(latestBuild(), index, ageMa);
      expect(key.mean.length).toBe(360 * 181);
      let alone = 0;
      let off = 0;
      let shifted = 0;
      for (let n = 0; n < key.mean.length; n++) {
        expect(key.sd[n]).toBeGreaterThan(0);
        if (key.rests[n]) continue;
        alone++;
        // Nothing but the map: its own height above its coast, less the level.
        if (Math.abs(key.mean[n] - (key.map[n] - k.level)) > 1.5) off++;
        // Where no bed outweighs the map the chance is the bell's own, or near it, and the middle height the bell's
        // middle: a trace of a bed moves it by its share of one.
        const chance = byteChance(key.chance[n]);
        const h = heightOf({ mean: key.mean[n], sd: byteSd(key.sd[n]) }, chance);
        expect(h.lo).toBeLessThanOrEqual(h.middle);
        expect(h.hi).toBeGreaterThanOrEqual(h.middle);
        if (Math.abs(h.middle - key.mean[n]) > 0.5 * byteSd(key.sd[n]) + 4) shifted++;
        if (chance < floor || chance > ceiling) shifted++;
      }
      expect(alone, `${ageMa} Ma`).toBeGreaterThan(40000);
      // A node with a shore bed near that does not outweigh the map is moved a little all the same: few are.
      expect(off / alone, `${ageMa} Ma`).toBeLessThan(0.12);
      expect(shifted / alone, `${ageMa} Ma`).toBeLessThan(0.05);
    }
    // Something besides the map is read on a small part of the globe, and less changes side of the level.
    expect(index.globe.reached).toBeGreaterThan(0.02);
    expect(index.globe.reached).toBeLessThan(0.15);
    expect(index.globe.changed).toBeLessThan(index.globe.reached);
  });

  it("puts marine localities below the level and land ones above it more often than the map's coast does, at every hold-out", () => {
    const s = index.sides;
    expect(s.localities.marine + s.localities.land).toBeGreaterThan(80000);
    // The map: 45% of marine localities on its land.
    expect(1 - s.map.marine_below).toBeGreaterThan(0.4);
    for (const held of ['node', 'tile', 'block', 'all'] as const) {
      expect(s[held].marine_below, held).toBeGreaterThan(s.map.marine_below + 0.03);
      expect(s[held].land_above, held).toBeGreaterThan(s.map.land_above);
    }
    expect(1 - s.node.marine_below).toBeLessThan(0.3);
    expect(s.node.marine_below).toBeGreaterThan(s.tile.marine_below);
    expect(s.tile.marine_below).toBeGreaterThan(s.block.marine_below);
    // Through time: in every stretch since the land had life more land localities lie above the level than above the map's coast.
    expect(index.through.filter((t) => !t.told)).toHaveLength(1);
    for (const t of index.through.filter((x) => x.told)) expect(t.node.land_above, `${t.olderMa}–${t.youngerMa} Ma`).toBeGreaterThan(t.map.land_above);
    // And more marine ones below it in the last 300 Myr. Before that the map has most of them in its sea already, and
    // the heights move a few out: its shelf seas are raised to the level at the shore beds found in them.
    for (const t of index.through.filter((x) => x.told && x.olderMa < 300)) expect(t.node.marine_below, `${t.olderMa}–${t.youngerMa} Ma`).toBeGreaterThan(t.map.marine_below + 0.1);
    const old = index.through.find((t) => t.told && t.olderMa > 300 && t.olderMa < 400)!;
    expect(old.node.marine_below).toBeLessThan(old.map.marine_below + 0.02);
  });

  it("tells the kind of a locality held out worse than the distance from the map's coast does, and the two together no worse than the distance", () => {
    const k = index.scores.kinds;
    expect(k.height.node.n).toBeGreaterThan(70000);
    for (const held of HELD) {
      // The criterion does not hold: the height above the level tells kinds worse, by more the more is held out.
      expect(k.height[held].lpd, held).toBeLessThan(k.distance[held].lpd);
      expect(k.both[held].lpd, held).toBeGreaterThan(k.distance[held].lpd - 0.002);
      expect(k.both[held].lpd, held).toBeGreaterThan(k.height[held].lpd);
    }
    expect(k.distance.block.lpd - k.height.block.lpd).toBeGreaterThan(k.distance.node.lpd - k.height.node.lpd);
    // From the map alone, no bed read: the distance tells far better, both together a little better still, and the level adds nothing to the height.
    const a = index.scores.alone;
    expect(a.distance.lpd - a.height.lpd).toBeGreaterThan(0.05);
    expect(a.both.lpd).toBeGreaterThan(a.distance.lpd);
    expect(Math.abs(a.height.lpd - a.no_level.lpd)).toBeLessThan(0.01);
    // Read together, the height's own odds count for a part only.
    expect(index.rule.both.height).toBeGreaterThan(0.05);
    expect(index.rule.both.height).toBeLessThan(0.7);
  });

  it("does not beat the smoother with no causes on the kinds of localities held out, where the distance from the map's coast and the two read together do", () => {
    const k = index.scores.kinds;
    // The criterion does not hold: the same beds with no map tell the kind of a bed held out better than the height
    // above the level does, at every hold-out. With a keyframe held out the smoother has nothing but how many more
    // beds the sea leaves, and that even chance is nearer than a map that is sure of ground it has wrong.
    for (const held of HELD) expect(k.height[held].lpd, held).toBeLessThan(k.smoother[held].lpd);
    expect(k.smoother.tile.lpd - k.height.tile.lpd).toBeLessThan(0.05);
    expect(k.smoother.span.lpd - k.height.span.lpd).toBeLessThan(0.02);
    // What beats it is the distance from the map's coast, and the two read together, wherever a tile or more is held
    // out, and by more the more is.
    for (const held of OUT) {
      expect(k.distance[held].lpd, held).toBeGreaterThan(k.smoother[held].lpd);
      expect(k.both[held].lpd, held).toBeGreaterThan(k.smoother[held].lpd);
    }
    expect(k.both.block.lpd - k.smoother.block.lpd).toBeGreaterThan(k.both.tile.lpd - k.smoother.tile.lpd);
    expect(k.both.span.lpd - k.smoother.span.lpd).toBeGreaterThan(k.both.block.lpd - k.smoother.block.lpd);
    expect(k.both.node.lpd).toBeLessThan(k.smoother.node.lpd);
    // Its chances mean what they say with a node held out, within a fifteenth; with a block or a keyframe they are too
    // sure of the land: of the beds given the least chance of being marine, more were.
    for (const b of k.height.node.held) if (b.n > 500) expect(Math.abs(b.given - b.were)).toBeLessThan(0.07);
    expect(k.height.block.held[0].were - k.height.block.held[0].given).toBeGreaterThan(0.05);
    expect(k.height.span.held[0].were - k.height.span.held[0].given).toBeGreaterThan(0.05);
  });

  it('puts a shore bed held out nearer the level than the map does, with the level in its band about nine times in ten', () => {
    for (const held of ['node', 'tile', 'block'] as const) {
      const s = index.scores.shore_height[held];
      expect(s.n).toBeGreaterThan(8000);
      // With a block held out nothing near is left to tell the map's miss there, and the height is the map's.
      if (held === 'block') expect(s.height, held).toBeLessThanOrEqual(s.map);
      else expect(s.height, held).toBeLessThan(s.map);
      expect(s.inside, held).toBeGreaterThan(0.85);
      expect(s.inside, held).toBeLessThan(0.99);
    }
    expect(index.scores.shore_height.node.height).toBeLessThan(index.scores.shore_height.node.map * 0.75);
    expect(index.scores.shore_height.node.height).toBeLessThan(index.scores.shore_height.tile.height);
    expect(index.scores.shore_height.tile.height).toBeLessThan(index.scores.shore_height.block.height);
    // What is found near is carried to ground of like height only, and counts against the map by no more than it comes to.
    expect(index.rule.like_kinds_m).toBeGreaterThan(index.rule.like_m);
    expect(index.rule.least_beds).toBe(1);
    expect(index.rule.strength).toBeLessThan(index.rule.least_beds);
  });

  it("has the ranges at about today's height from when their records say they stood: the Alps at 20 Ma, the Himalaya at 10 and at 5 Ma", () => {
    expect(index.ranges.map((r) => r.id).sort()).toEqual(['earth/orogens/alps', 'earth/orogens/altiplano', 'earth/orogens/front-range', 'earth/orogens/himalaya', 'earth/orogens/sierra-nevada-california', 'earth/orogens/southern-alps', 'earth/orogens/tibetan-plateau', 'earth/orogens/western-cordillera-central-andes']);
    for (const r of index.ranges) {
      expect(r.nodes, r.label).toBeGreaterThan(0);
      expect(r.keyframes[0]).toBe(0);
      expect(Math.max(...r.keyframes)).toBeLessThanOrEqual(r.standingMa);
      // The height is nearer today's than the map is, and within the doubt given a range's "about today's height".
      expect(r.height.abs, r.label).toBeLessThan(r.map.abs);
      expect(r.height.abs, r.label).toBeLessThan(Math.max(index.rule.range_doubt_m, index.rule.range_doubt * r.today) + 60);
    }
    const of = (id: string, ageMa: number) => index.ranges.find((r) => r.id === id)!.through.find((t) => t.ageMa === ageMa)!;
    // The map has the Alps most of a kilometre low at 20 Ma, by when their record says they stood.
    const alps = of('earth/orogens/alps', 20);
    expect(alps.today - alps.map).toBeGreaterThan(500);
    expect(Math.abs(alps.height - alps.today)).toBeLessThan(250);
    // The map has the Himalaya's ground half a kilometre higher at 10 Ma than at 5 Ma; the heights have it level.
    const ten = of('earth/orogens/himalaya', 10);
    const five = of('earth/orogens/himalaya', 5);
    expect(ten.map - five.map).toBeGreaterThan(250);
    expect(Math.abs(ten.height - five.height)).toBeLessThan(150);
    expect(Math.abs(ten.height - ten.today)).toBeLessThan(0.1 * ten.today);
    // The Front Range, which the map has more than a kilometre low for most of 30 Myr.
    const front = index.ranges.find((r) => r.id === 'earth/orogens/front-range')!;
    expect(front.map.abs).toBeGreaterThan(800);
    expect(front.height.abs).toBeLessThan(350);
  });

  it('says how each range fares with its own record left out', () => {
    const scored = index.ranges.filter((r) => r.without.inside !== undefined);
    // A range that stood at the present's keyframe alone is not scored: the map there is measured.
    expect(index.ranges.filter((r) => r.without.inside === undefined).map((r) => r.keyframes)).toEqual([[0]]);
    for (const r of scored) {
      expect(r.without.high, r.label).toBeGreaterThan(0.2);
      expect(r.without.high, r.label).toBeLessThan(0.8);
    }
    // The criterion holds for some and not for others: a spread that is a share of the map's height cannot hold a range the map has low.
    expect(scored.filter((r) => r.without.inside! >= 0.85).length).toBeGreaterThanOrEqual(3);
    expect(scored.filter((r) => r.without.inside! < 0.75).length).toBeGreaterThanOrEqual(2);
    expect(index.ranges.find((r) => r.id === 'earth/orogens/front-range')!.without.inside!).toBeLessThan(0.6);
  });

  it("held to the present, keeps today's height in its band at about nine nodes in ten, and moves the measured coast over less than a tenth of the globe", () => {
    const now = index.present;
    expect(now.inside).toBeGreaterThan(0.85);
    expect(now.inside).toBeLessThan(0.97);
    // The map of the present is today's ground: it has the measured coast nearly where it is.
    expect(now.map.to_sea + now.map.to_land).toBeLessThan(0.02);
    // The criterion does not hold: the heights, which do not know the present is measured, move the coast over several hundredths of the globe.
    expect(now.height.to_sea + now.height.to_land).toBeGreaterThan(0.03);
    expect(now.height.to_sea + now.height.to_land).toBeLessThan(0.1);
    // And their middle is further from today's ground than the map's own, by less than a quarter.
    expect(now.miss.height).toBeGreaterThan(now.miss.map);
    expect(now.miss.height).toBeLessThan(1.25 * now.miss.map);
    // What the present measures of the map: tens of metres on low ground, a fifth or so of the height on high ground.
    expect(index.rule.now_m).toBeGreaterThan(40);
    expect(index.rule.now_m).toBeLessThan(200);
    expect(index.rule.now_high).toBeGreaterThan(0.1);
    expect(index.rule.now_high).toBeLessThan(index.rule.ranges_high);
  });

  it('answers for a place of today carried to the keyframe, in words, and keeps its scores in the coverage file', () => {
    // The Niobrara's chalk in Kansas, laid down under the Western Interior Seaway.
    const kansas = heightsOfBuild(latestBuild(), 38.9, -100.5, parsePoint('85 Ma').t)!;
    expect(kansas.keyframe.ageMa).toBe(85);
    expect(kansas.chance).toBeGreaterThan(0.6);
    expect(kansas.middle).toBeLessThan(0);
    expect(kansas.rests & RESTS.kinds).toBeTruthy();
    expect(heightsText(kansas)).toContain('in nine chances of ten');
    // Cincinnati's limestones: the map has their sea some 400 m deep, and the shore beds found there say it was shallow.
    const cincinnati = heightsOfBuild(latestBuild(), 39.1, -84.5, parsePoint('450 Ma').t)!;
    expect(cincinnati.keyframe.told).toBe(false);
    expect(cincinnati.map).toBeLessThan(-200);
    expect(cincinnati.rests & RESTS.shore).toBeTruthy();
    expect(cincinnati.middle).toBeLessThan(0);
    expect(cincinnati.middle).toBeGreaterThan(-150);
    expect(heightsText(cincinnati)).toContain('carried from the keyframes either side');
    // Between Mont Blanc and Monte Rosa at 20 Ma: the Alps' record speaks, and the beds of the sea at their foot do not.
    const alps = heightsOfBuild(latestBuild(), 45.9, 7.4, parsePoint('20 Ma').t)!;
    expect(alps.rests & RESTS.range).toBeTruthy();
    expect(alps.rests & RESTS.kinds).toBeFalsy();
    expect(alps.middle).toBeGreaterThan(900);
    expect(alps.chance).toBeLessThan(0.05);
    expect(heightsText(alps)).toContain("a range's record");
    // The middle of the Pacific's floor: nothing found, the map's depth less the level, and a band about it.
    const pacific = heightsOfBuild(latestBuild(), 0, -150, parsePoint('20 Ma').t)!;
    expect(pacific.rests).toBe(0);
    expect(Math.abs(pacific.middle - (pacific.map - pacific.keyframe.level))).toBeLessThan(40);
    expect(pacific.hi).toBeLessThan(0);
    expect(heightsText(pacific)).toContain('the map alone');
    const text = heightsScoresText(index);
    expect(text).toContain('held to the present');
    expect(text).toContain('the ranges whose records say when they stood');
    expect(coverage.heights).toEqual(heightsStats(index));
    expect(coverage.heights!.levels).toHaveLength(index.keyframes.length);
  });
});
