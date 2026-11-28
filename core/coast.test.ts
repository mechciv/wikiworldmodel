import { describe, expect, it } from 'vitest';
import { addFinds, BAND, byteChance, byteFinds, chanceByte, chanceWords, coastDistance, findsByte, localitiesOf, marineShare, memberLevel, noFinds, nodeOf, placeOf, priorLogit, restsOnFinds, scoreOf, seaChance, seaIn, type SeaGrid, type SeaRule } from './coast.ts';

const GRID: SeaGrid = { nx: 360, ny: 181, step: 1 };
const RULE: SeaRule = { slope_in: 0.45, slope_off: 0.36, cap: 4, strength: 0.25 };
/** The log of a yield: the sea leaves five localities for each one the land leaves. */
const FIVE = Math.log(5);

/** A grid with sea everywhere but a belt of land between two latitudes. */
function belt(south: number, north: number): Uint8Array {
  const sea = new Uint8Array(GRID.nx * GRID.ny).fill(1);
  for (let k = 0; k < sea.length; k++) {
    const [lat] = placeOf(GRID, k);
    if (lat >= south && lat <= north) sea[k] = 0;
  }
  return sea;
}

describe("the sea's chance (model:earth/sea-chance)", () => {
  it('measures each node from the coast along the grid: positive in the sea, negative on land, half a step at the shore', () => {
    const d = coastDistance(belt(-10, 10), GRID);
    // The land's last row is half a degree from the coast, and so is the sea's first.
    expect(d[nodeOf(GRID, 10, 20)]).toBeCloseTo(-0.5, 5);
    expect(d[nodeOf(GRID, 11, 20)]).toBeCloseTo(0.5, 5);
    // Along a meridian the grid's way is the arc itself.
    expect(d[nodeOf(GRID, 0, 20)]).toBeCloseTo(-10.5, 5);
    expect(d[nodeOf(GRID, 40, -150)]).toBeCloseTo(29.5, 5);
    // It is the same all round a belt, across the date line as anywhere.
    expect(d[nodeOf(GRID, 25, 180)]).toBeCloseTo(d[nodeOf(GRID, 25, 0)], 5);
    // One kind everywhere has no coast.
    expect(coastDistance(new Uint8Array(GRID.nx * GRID.ny).fill(1), GRID)[1000]).toBe(Infinity);
  });

  it('measures a slanting way within a twelfth of the true arc', () => {
    // An island of one node at the equator: the true arc to a node 30° east and 30° north of it is 41.4°.
    const sea = new Uint8Array(GRID.nx * GRID.ny).fill(1);
    sea[nodeOf(GRID, 0, 0)] = 0;
    const d = coastDistance(sea, GRID);
    const arc = (Math.acos(Math.cos((30 * Math.PI) / 180) * Math.cos((30 * Math.PI) / 180)) * 180) / Math.PI;
    expect(d[nodeOf(GRID, 30, 30)]).toBeGreaterThan(arc - 1);
    expect(d[nodeOf(GRID, 30, 30)]).toBeLessThan(arc * (1 + 1 / 12));
  });

  it('gathers collections of one kind in one box into one locality, by the chance that one of them is of the span', () => {
    const locs = localitiesOf(
      [
        { lat: 40.01, lon: -100.02, sea: true, share: 0.5 },
        { lat: 40.03, lon: -100.04, sea: true, share: 0.5 },
        { lat: 40.02, lon: -100.01, sea: false, share: 1 },
        { lat: 41.5, lon: -100, sea: true, share: 0 },
      ],
      0.1,
      GRID,
    );
    expect(locs).toHaveLength(2);
    const marine = locs.find((l) => l.sea)!;
    // Two collections, each as likely as not of the span: three chances in four that one of them is.
    expect(marine.w).toBeCloseTo(0.75, 10);
    expect([marine.lat, marine.lon]).toEqual([40, -100]);
    expect(marine.node).toBe(nodeOf(GRID, 40, -100));
    expect(locs.find((l) => !l.sea)!.w).toBe(1);
  });

  it("counts a locality whole at its own place and less with distance, and keeps a group's own apart", () => {
    const here = { lat: 0, lon: 0, sea: true, w: 1, node: nodeOf(GRID, 0, 0) };
    const there = { lat: 0, lon: 2, sea: false, w: 0.5, node: nodeOf(GRID, 0, 2) };
    const all = noFinds(GRID);
    const own = { group: (n: number) => n, into: noFinds(GRID) };
    addFinds(all, [here, there], GRID, 150, 1, [own]);
    const at = (lat: number, lon: number) => nodeOf(GRID, lat, lon);
    expect(all.marine[at(0, 0)]).toBeCloseTo(1, 6);
    // One width of the bell off, a locality counts for e^-½.
    const off = 150 / 111.195;
    expect(all.marine[at(0, 1)]).toBeCloseTo(Math.exp(-0.5 * (1 / off) ** 2), 2);
    // Beyond three widths, not at all.
    expect(all.marine[at(0, 5)]).toBe(0);
    expect(all.land[at(0, 2)]).toBeCloseTo(0.5, 6);
    // What a node has from its own localities is kept apart, so that it can be taken out.
    expect(own.into.marine[at(0, 0)]).toBeCloseTo(1, 6);
    expect(own.into.marine[at(0, 1)]).toBe(0);
    expect(all.land[at(0, 0)] - own.into.land[at(0, 0)]).toBeGreaterThan(0);
  });

  it("counts a locality over the ocean's floor at its own node and at no other, and one beside the floor not on it", () => {
    // The floor everywhere east of the prime meridian; an island's locality on it, and a shore's locality just west.
    const floor = new Uint8Array(GRID.nx * GRID.ny);
    for (let k = 0; k < floor.length; k++) if (placeOf(GRID, k)[1] > 0) floor[k] = 1;
    const at = (lat: number, lon: number) => nodeOf(GRID, lat, lon);
    const island = { lat: 0, lon: 6, sea: false, w: 1, node: at(0, 6) };
    const shore = { lat: 0, lon: 0, sea: false, w: 1, node: at(0, 0) };
    const found = noFinds(GRID);
    addFinds(found, [island, shore], GRID, 150, 1, [], floor);
    // The island is found on its own node, and says nothing of the ocean round it.
    expect(found.land[at(0, 6)]).toBeCloseTo(1, 6);
    expect(found.land[at(0, 5)]).toBe(0);
    expect(found.land[at(0, 7)]).toBe(0);
    expect(found.land[at(1, 6)]).toBe(0);
    // The shore's locality counts on the ground about it that is not the floor, and not on the floor beside it.
    expect(found.land[at(0, 0)]).toBeCloseTo(1, 6);
    expect(found.land[at(0, -1)]).toBeGreaterThan(0.7);
    expect(found.land[at(0, 1)]).toBe(0);
    // With no floor given, as the smoother counts, both spread alike.
    const plain = noFinds(GRID);
    addFinds(plain, [island, shore], GRID, 150);
    expect(plain.land[at(0, 5)]).toBeGreaterThan(0.7);
    expect(plain.land[at(0, 1)]).toBeGreaterThan(0.7);
  });

  it("leaves a place with no find near at the field's chance: a half at the coast, less inland, more offshore, surest over the ocean's floor", () => {
    const chance = (d: number) => seaChance(d, 0, 0, FIVE, RULE);
    expect(chance(0)).toBeCloseTo(0.5, 10);
    expect(chance(-3)).toBeCloseTo(1 / (1 + Math.exp(0.45 * 3)), 10);
    expect(chance(3)).toBeCloseTo(1 / (1 + Math.exp(-0.36 * 3)), 10);
    expect(chance(-1)).toBeGreaterThan(chance(-5));
    // Distance says no more beyond the cap, and the ocean's floor, infinitely far from a coast, is at it.
    expect(chance(-40)).toBeCloseTo(1 / (1 + Math.exp(4)), 10);
    expect(chance(Infinity)).toBeCloseTo(1 / (1 + Math.exp(-4)), 10);
    // Whatever the yield: with nothing found, it cancels.
    expect(seaChance(-3, 0, 0, Math.log(900), RULE)).toBeCloseTo(chance(-3), 9);
    expect(priorLogit(-3, RULE)).toBeCloseTo(-1.35, 10);
  });

  it("takes a place where marine and land localities are found in the yield's proportion to be as likely sea as land", () => {
    // Fifty marine localities and ten of the land, where the sea leaves five for each one of the land's.
    expect(seaChance(-6, 50, 10, FIVE, RULE)).toBeCloseTo(0.5, 1);
    expect(seaChance(6, 50, 10, FIVE, RULE)).toBeCloseTo(0.5, 1);
    // The same finds where the sea leaves twenty for one say land; where it leaves as many as the land, sea.
    expect(seaChance(0, 50, 10, Math.log(20), RULE)).toBeLessThan(0.25);
    expect(seaChance(0, 50, 10, 0, RULE)).toBeGreaterThan(0.8);
  });

  it('moves towards the sea with marine localities and towards the land with land ones, a land one for more where the sea leaves more', () => {
    const inland = seaChance(-4, 0, 0, FIVE, RULE);
    expect(seaChance(-4, 1, 0, FIVE, RULE)).toBeGreaterThan(inland);
    expect(seaChance(-4, 10, 0, FIVE, RULE)).toBeGreaterThan(seaChance(-4, 1, 0, FIVE, RULE));
    const offshore = seaChance(4, 0, 0, FIVE, RULE);
    expect(seaChance(4, 0, 1, FIVE, RULE)).toBeLessThan(offshore);
    // One land locality at the coast says more where land localities are rare: before the land had life to leave any.
    expect(seaChance(0, 0, 1, Math.log(900), RULE)).toBeLessThan(seaChance(0, 0, 1, FIVE, RULE));
    // And marine ones alone go on saying sea however rare the land's are: ten of them, six times the odds or more.
    const odds = (p: number) => p / (1 - p);
    expect(odds(seaChance(-4, 10, 0, Math.log(900), RULE)) / odds(seaChance(-4, 0, 0, Math.log(900), RULE))).toBeGreaterThan(6);
    // The share of marine expected among what is found there is what a locality held out is given.
    expect(marineShare(0, 0, 0, FIVE, RULE)).toBeCloseTo(5 / 6, 10);
    expect(marineShare(0, 3, 1, FIVE, RULE)).toBeCloseTo((0.25 * (5 / 6) + 3) / 4.25, 10);
  });

  it('says its land and sea rest on the rocks where the finds near weigh more than the field', () => {
    expect(restsOnFinds(0, 0, RULE)).toBe(false);
    expect(restsOnFinds(0.1, 0.1, RULE)).toBe(false);
    expect(restsOnFinds(0.2, 0.1, RULE)).toBe(true);
  });

  it("draws a member's sea wherever the chance is above its level: the median member's at a half, and one sea inside another", () => {
    expect(memberLevel(0)).toBe(0.5);
    const levels = Array.from({ length: 16 }, (_, m) => memberLevel(m));
    for (const l of levels) expect(l > 0 && l < 1).toBe(true);
    // Spread over the whole range, not bunched: some in every quarter.
    for (const q of [0, 0.25, 0.5, 0.75]) expect(levels.some((l) => l >= q && l < q + 0.25)).toBe(true);
    expect(new Set(levels.map((l) => l.toFixed(6))).size).toBe(16);
    // A member with sea at a chance has it at every higher chance: the members' seas are nested.
    for (let m = 0; m < 16; m++) {
      expect(seaIn(0.99999, m)).toBe(true);
      expect(seaIn(0.00001, m)).toBe(false);
      if (seaIn(0.4, m)) expect(seaIn(0.6, m)).toBe(true);
    }
    expect(seaIn(0.51, 0)).toBe(true);
    expect(seaIn(0.49, 0)).toBe(false);
  });

  it('scores chances by the kinds they were given for, and says how they held', () => {
    const s = scoreOf([
      { marine: 0.9, was: true, w: 3 },
      { marine: 0.9, was: false, w: 1 },
      { marine: 0.1, was: false, w: 4 },
    ]);
    expect(s.n).toBe(8);
    expect(s.lpd).toBeCloseTo((3 * Math.log(0.9) + Math.log(0.1) + 4 * Math.log(0.9)) / 8, 4);
    expect(s.brier).toBeCloseTo((3 * 0.01 + 0.81 + 4 * 0.01) / 8, 4);
    // Of those given nine chances in ten of being marine, three in four were.
    expect(s.held[4]).toEqual({ n: 4, given: 0.9, were: 0.75 });
    expect(s.held[0]).toEqual({ n: 4, given: 0.1, were: 0 });
    // One sure and wrong is a great surprise, not an endless one.
    expect(scoreOf([{ marine: 1, was: false, w: 1 }]).lpd).toBeCloseTo(Math.log(0.001), 3);
  });

  it('keeps a chance and a count of finds in a byte each', () => {
    for (const p of [0, 0.05, 0.5, 0.95, 1]) expect(byteChance(chanceByte(p))).toBeCloseTo(p, 2);
    expect(findsByte(0)).toBe(0);
    expect(findsByte(1)).toBe(16);
    for (const n of [0.25, 1, 7, 120, 3000]) expect(byteFinds(findsByte(n)) / n).toBeCloseTo(1, 1);
    expect(findsByte(1e9)).toBe(255);
  });

  it('puts a chance in words, by the band', () => {
    expect(chanceWords(0.99)).toContain('almost surely under the sea');
    expect(chanceWords(0.7)).toBe('more likely sea than land (70%)');
    expect(chanceWords(0.3)).toBe('more likely land than sea (30% for the sea)');
    // Within half a point of even, neither is the likelier.
    expect(chanceWords(0.498)).toBe('as likely sea as land (50%)');
    expect(chanceWords(0.504)).toBe('as likely sea as land (50%)');
    expect(chanceWords(0.01)).toContain('almost surely land');
    expect(BAND).toEqual([0.05, 0.95]);
  });
});
