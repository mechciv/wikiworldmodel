// The sea's level and the height of the land, piece by piece (core/heights.ts; docs/slices/TWENTY-THIRD-SLICE.md):
// what the level is read from and what it is not, how it is carried through time, what a height is with nothing known
// of it, and what a shore bed, a range's record and the kinds of beds each do to it.
import { describe, expect, it } from 'vitest';
import { memberLevel, type SeaGrid } from './coast.ts';
import {
  addBeds,
  bedsOf,
  bellAt,
  bellBelow,
  between,
  chanceBefore,
  chanceBelow,
  chanceFrom,
  HEIGHT_BAND,
  heightAt,
  heightOf,
  levelGiven,
  levelsWithout,
  mapHeight,
  marineAmong,
  memberHeight,
  nothingNear,
  shoreLine,
  smoothLevels,
  spreadOf,
  withRange,
  withShore,
  type BedSite,
  type ShorePoint,
} from './heights.ts';

const GRID: SeaGrid = { nx: 360, ny: 181, step: 1 };

/** Numbers that repeat: a small generator with a fixed seed. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

describe("the sea's level, from the beds laid down at the shore", () => {
  it("reads the level off the beds laid down at the shore, where their ground stands at today's sea level, however many beds of each kind there are", () => {
    // Shore beds the map has 60 m above its coast, on ground that follows today's by six tenths.
    const rnd = noise(7);
    const points: ShorePoint[] = Array.from({ length: 400 }, (_, i) => {
      const t = (i % 40) * 20;
      return { m: 60 + 0.6 * t + 80 * rnd(), t, w: 1 };
    });
    const line = shoreLine(points);
    expect(line.follow).toBeCloseTo(0.6, 1);
    expect(Math.abs(line.level - 60)).toBeLessThan(8);
    // The level is read from where the shore beds stand, and nothing counts beds of the sea or of the land: there is
    // no yield in it to be wrong about. Twice the beds, at the same places, give the same level.
    const twice = shoreLine([...points, ...points]);
    expect(twice.level).toBeCloseTo(line.level, 6);
    expect(twice.follow).toBeCloseTo(line.follow, 6);
    // A map that does not follow today's ground at all: the level is the middle of where it has the beds.
    const flat = points.map((p) => ({ ...p, m: -30 + 50 * rnd() }));
    expect(shoreLine(flat).follow).toBeLessThan(0.02);
    expect(Math.abs(shoreLine(flat).level + 30)).toBeLessThan(6);
    expect(levelGiven(flat, 0).scale).toBeGreaterThan(5);
  });

  it("tells how far the map follows today's height of a bed's ground, and is not pulled by a few beds the map has far off", () => {
    const rnd = noise(11);
    const points: ShorePoint[] = Array.from({ length: 300 }, (_, i) => {
      const t = (i % 30) * 30;
      return { m: 20 + 0.8 * t + 40 * rnd(), t, w: 1 };
    });
    const clean = shoreLine(points);
    // One bed in ten on ground the map has a kilometre too high: a mean would move by a hundred metres.
    const withFar = points.map((p, i) => (i % 10 === 0 ? { ...p, m: p.m + 1000 } : p));
    const pulled = shoreLine(withFar);
    expect(Math.abs(pulled.level - clean.level)).toBeLessThan(15);
    expect(Math.abs(pulled.follow - clean.follow)).toBeLessThan(0.05);
    // The slope is a share: never less than nothing nor more than all of today's height.
    expect(shoreLine(points.map((p) => ({ ...p, m: 2 * p.t }))).follow).toBeLessThanOrEqual(1);
    expect(shoreLine(points.map((p) => ({ ...p, m: -p.t }))).follow).toBeGreaterThanOrEqual(0);
  });

  it("carries the level between keyframes as a walk pulled back to the map's coast, wider where no bed tells it", () => {
    const seen = [{ value: 40, sd: 10 }, { value: 50, sd: 10 }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { value: -20, sd: 10 }];
    const levels = smoothLevels(seen, 0.7, 50);
    // Where beds tell, the level is near what they say, and surer than they are alone, since the keyframe beside agrees.
    expect(Math.abs(levels[0].mean - 40)).toBeLessThan(6);
    expect(levels[0].sd).toBeLessThan(10);
    // With none, it falls back towards the map's own coast the further the beds are, and its band widens to the stray.
    expect(Math.abs(levels[5].mean)).toBeLessThan(Math.abs(levels[2].mean));
    expect(Math.abs(levels[5].mean)).toBeLessThan(12);
    expect(levels[5].sd).toBeGreaterThan(levels[2].sd);
    expect(levels[5].sd).toBeGreaterThan(40);
    expect(levels[5].sd).toBeLessThanOrEqual(50);
    // With nothing seen anywhere, every keyframe is the map's coast, give or take the stray.
    for (const l of smoothLevels([undefined, undefined, undefined], 0.7, 50)) {
      expect(l.mean).toBe(0);
      expect(l.sd).toBeCloseTo(50, 6);
    }
    // A keyframe told from the others alone does not read its own beds.
    const without = levelsWithout(seen, 0.7, 50);
    expect(without[10].mean).toBeGreaterThan(-5);
    expect(without[0].mean).toBeGreaterThan(20);
    expect(without[0].mean).toBeLessThan(40);
  });
});

describe('the height of the land', () => {
  const miss = { base: 100, high: 0.4, deep: 0.1 };

  it("leaves ground with no bed near and no range at the map's height less the level, with the map's miss for a spread", () => {
    const h = mapHeight(300, miss, 20);
    expect(h.mean).toBe(300);
    expect(h.sd).toBeCloseTo(Math.sqrt(100 * 100 + 120 * 120 + 20 * 20), 6);
    // Over the sea it is the share of the depth that widens it.
    expect(mapHeight(-3000, miss, 0).sd).toBeCloseTo(Math.sqrt(100 * 100 + 300 * 300), 6);
    // With nothing found, the chance of sea is the bell's own, and the middle height the map's.
    const c = chanceBelow(h);
    expect(heightAt(h, c, 0.5)).toBeCloseTo(300, 6);
    expect(withShore(h, 0, 0, 1)).toEqual(h);
    const { lo, hi, middle } = heightOf(h, c);
    expect(middle).toBeCloseTo(300, 6);
    expect(hi - middle).toBeCloseTo(middle - lo, 6);
    expect(hi - lo).toBeCloseTo(2 * 1.6449 * h.sd, 0);
    // A spread is as wide as holds nine misses in ten, and long misses do not make it endless.
    const misses = Array.from({ length: 100 }, (_, i) => (i < 90 ? (i % 2 ? 50 : -50) : 5000));
    expect(spreadOf(misses, misses.map(() => 1))).toBeCloseTo(50 / 1.6449, 6);
  });

  it("puts a shore bed's ground at the level, and carries the map's miss there to ground of like height and no other", () => {
    // The map has a shore bed's ground 240 m above the level: with many such beds at the place, the height comes to the level.
    const h = mapHeight(240, miss, 0);
    const at = withShore(h, 50, 50 * 240, 0.5);
    expect(Math.abs(at.mean)).toBeLessThan(5);
    expect(at.sd).toBeLessThan(h.sd / 5);
    // One bed and a map as sure as a bed: half way.
    expect(withShore(h, 1, 240, 1).mean).toBeCloseTo(120, 6);
    // A bed in a sea the map draws too deep raises the ground about it.
    expect(withShore(mapHeight(-180, miss, 0), 10, 10 * -180, 0.5).mean).toBeGreaterThan(-20);

    // Carried to the nodes about: whole to ground the map has as high as the bed, hardly at all to ground far higher.
    const sites: BedSite[] = [{ lat: 10.02, lon: 20.03, lat0: 10, lon0: 20, sea: true, shore: true, share: 1 }];
    const beds = bedsOf(sites, 0.1, GRID);
    expect(beds).toHaveLength(1);
    expect(beds[0].shore).toBe(1);
    const node = new Float32Array(GRID.nx * GRID.ny).fill(200);
    const own = (90 - 10) * GRID.nx + (20 + 180);
    const beside = own + 1;
    node[beside] = 1500;
    const near = nothingNear(GRID);
    addBeds(near, beds, () => 200, GRID, 150, [], undefined, { node, bed: [200], m: 100, kinds_m: 300 });
    expect(near.shore[own]).toBeGreaterThan(0.9);
    expect(near.miss[own] / near.shore[own]).toBeCloseTo(200, 3);
    expect(near.shore[beside]).toBeLessThan(1e-6);
    // The kind of a bed is counted by distance alone for the chance of sea, and for the heights only so far as the
    // ground is of like height on the map: a bed of the sea at a range's foot is no word on its crest.
    expect(near.marine[beside]).toBeGreaterThan(0.5);
    expect(near.marineLike[own]).toBeCloseTo(near.marine[own], 6);
    expect(near.marineLike[beside]).toBeLessThan(near.marine[beside] / 1000);
    expect(near.land[own]).toBe(0);
    expect(near.landLike[own]).toBe(0);
    // Read between the nodes, the map's height at a bed's own place.
    expect(between(node, GRID, 10, 20.5)).toBeCloseTo(850, 3);
  });

  it("raises a range the map has low to about today's height, the more surely the further the map is from it", () => {
    // The map has ground at 600 m that a range's record says stood at about 2,500 m.
    const low = mapHeight(600, miss, 0);
    const raised = withRange(low, 2500, 500);
    expect(raised.mean).toBeGreaterThan(2200);
    expect(raised.mean).toBeLessThan(2500);
    expect(raised.sd).toBeLessThan(500);
    // A map near the record keeps its say: the two are averaged by how sure each is.
    const near = mapHeight(2300, { base: 100, high: 0.1, deep: 0 }, 0);
    const both = withRange(near, 2500, 500);
    expect(both.mean).toBeGreaterThan(2300);
    expect(both.mean).toBeLessThan(2400);
    // And a map far above its record comes down as surely as one far below goes up.
    expect(withRange(mapHeight(6000, { base: 100, high: 0.1, deep: 0 }, 0), 3000, 600).mean).toBeLessThan(3200);
  });

  it('cuts the bell at the level and weighs its sides by the chance of sea: ground the rocks say was sea lies below it', () => {
    const h = mapHeight(150, { base: 100, high: 0, deep: 0 }, 0);
    const own = chanceBelow(h);
    expect(own).toBeGreaterThan(0.05);
    expect(own).toBeLessThan(0.08);
    // The rocks say sea: the middle height is below the level, and not far below, since the map had the ground just above it.
    const sea = heightOf(h, 0.9);
    expect(sea.middle).toBeLessThan(0);
    expect(sea.middle).toBeGreaterThan(-120);
    expect(sea.lo).toBeLessThan(sea.middle);
    expect(sea.hi).toBeGreaterThan(0);
    // The rocks say land, of ground the map has in its sea: above the level.
    const drowned = mapHeight(-160, { base: 100, high: 0, deep: 0 }, 0);
    expect(heightOf(drowned, 0.05).middle).toBeGreaterThan(0);
    // The share of chances below the level is the chance of sea, whatever the bell.
    for (const c of [0.02, 0.3, 0.5, 0.77, 0.98]) {
      expect(heightAt(h, c, c - 0.005)).toBeLessThanOrEqual(0);
      expect(heightAt(h, c, c + 0.005)).toBeGreaterThanOrEqual(0);
    }
    // The chance itself: what the bell would yield, averaged with the beds near, and turned back by the yield.
    const before = chanceBefore(h, 4);
    expect(chanceFrom(marineAmong(before, 0, 0, 1.2, 0.3), 1.2)).toBeCloseTo(before, 6);
    expect(chanceFrom(marineAmong(before, 8, 0, 1.2, 0.3), 1.2)).toBeGreaterThan(0.8);
    expect(chanceFrom(marineAmong(before, 0, 8, 1.2, 0.3), 1.2)).toBeLessThan(before);
    // Before any bed is read the map is never surer than the cap, however far its ground is from the level.
    expect(chanceBefore(mapHeight(4000, { base: 100, high: 0, deep: 0 }, 0), 4)).toBeCloseTo(1 / (1 + Math.exp(4)), 9);
    expect(chanceBefore(mapHeight(-4000, { base: 100, high: 0, deep: 0 }, 0), 4)).toBeCloseTo(1 / (1 + Math.exp(-4)), 9);
  });

  it("moves the chance by a trace of a bed's share of one and no more, where the map's word alone would give way to it", () => {
    // A plateau the map has two kilometres up, and a fifth of one bed of the sea counted near it.
    const high = chanceBefore(mapHeight(2400, { base: 100, high: 0.23, deep: 0 }, 0), 4);
    expect(high).toBeLessThan(0.02);
    const y = Math.log(2);
    // With the map's word counting for the small part of a bed it is fitted to, the trace outweighs it.
    expect(chanceFrom(marineAmong(high, 0.2, 0, y, 0.08), y)).toBeGreaterThan(0.5);
    // Counting against the map only so far as it comes to a bed, it moves the chance by about its fifth.
    const traced = chanceFrom(marineAmong(high, 0.2, 0, y, 0.08, 1), y);
    expect(traced).toBeGreaterThan(high);
    expect(traced).toBeLessThan(0.2);
    // A bed's worth or more is read as it was: the fitted strength stands.
    expect(marineAmong(high, 3, 1, y, 0.08, 1)).toBeCloseTo(marineAmong(high, 3, 1, y, 0.08), 9);
    expect(chanceFrom(marineAmong(high, 3, 0, y, 0.08, 1), y)).toBeGreaterThan(0.9);
    // And nothing near leaves the chance the map's own.
    expect(chanceFrom(marineAmong(high, 0, 0, y, 0.08, 1), y)).toBeCloseTo(high, 6);
  });

  it("draws a member's height as one share of every node's chances, the middle member's the middle, and its sea where the chance is above its share", () => {
    const bells = [mapHeight(-400, miss, 0), mapHeight(-20, miss, 0), mapHeight(60, miss, 0), mapHeight(900, miss, 0)];
    const chances = [0.97, 0.7, 0.2, 0.03];
    expect(memberLevel(0)).toBe(0.5);
    for (let m = 0; m < 16; m++) {
      bells.forEach((h, i) => {
        const height = memberHeight(h, chances[i], m);
        // A member has sea exactly where the chance of sea is above its share: the same members as the chance of sea's.
        expect(height < 0 || (height === 0 && memberLevel(m) < chances[i])).toBe(chances[i] > memberLevel(m));
      });
    }
    bells.forEach((h, i) => expect(memberHeight(h, chances[i], 0)).toBe(heightAt(h, chances[i], 0.5)));
    // A greater share is never a lower height: one member's sea lies inside another's.
    for (const [i, h] of bells.entries()) {
      let last = -Infinity;
      for (let u = 0.02; u < 1; u += 0.02) {
        const x = heightAt(h, chances[i], u);
        expect(x).toBeGreaterThanOrEqual(last);
        last = x;
      }
      expect(heightAt(h, chances[i], HEIGHT_BAND[0])).toBeLessThan(heightAt(h, chances[i], HEIGHT_BAND[1]));
    }
    // The bell's own arithmetic.
    expect(bellBelow(0)).toBeCloseTo(0.5, 6);
    expect(bellBelow(1.6449)).toBeCloseTo(0.95, 4);
    expect(bellAt(0.95)).toBeCloseTo(1.6449, 3);
    expect(bellAt(bellBelow(-0.7))).toBeCloseTo(-0.7, 5);
  });
});
