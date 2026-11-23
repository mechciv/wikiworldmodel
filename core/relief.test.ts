// The ground below the relief's grid, and today's shape carried back (core/relief.ts): on made-up ground, which says
// nothing of any real place.
import { describe, expect, it } from 'vitest';
import { arcBetween, between, carriedNear, carriedReach, decodeShape, encodeShape, fineBox, fineHas, fineKey, fineRows, fineTile, fineTilesNear, heldShare, insideOutline, presentRead, rangeShare, sceneShape, shareAt, ShapeReader, turnOf, type ReliefInfo, type ReliefRange } from './relief.ts';

const RULE = { fullMa: 2.58, goneMa: 5.333, apart: 1, floor: 0.02 };
const FINE = { step: 1 / 60, tile_deg: 2, dir: 'relief/fine', reach_deg: 2 };
const PER = 120;

/** A range of the test: a box of today's Earth, said to have stood by 20 Ma and to have begun to grow at 50 Ma. */
const RANGE: ReliefRange = { id: 'test/range', label: 'Test Range', outline: [[[[9, 39], [13, 39], [13, 43], [9, 43], [9, 39]]]], standingMa: 20, startMa: 50 };

const info = (rows: string[], ranges: ReliefRange[] = []): ReliefInfo => ({
  format: 'lightworld-relief@1',
  field: 'field:test/relief',
  title: 'test',
  source: 'src:test',
  fine: { ...FINE, rows },
  carried: { field: 'field:test/carried', title: 'test', model: 'model:test', ...RULE, ranges },
});

/** Every tile there is, each cell's code given by where the cell is. */
const everywhere = fineRows(() => true, FINE.tile_deg);
const tilesOf = (code: (lat: number, lon: number) => number) => (key: string) => {
  const [north, west] = key.split('_').map(Number);
  const t = new Int8Array(PER * PER);
  for (let j = 0; j < PER; j++) for (let i = 0; i < PER; i++) t[j * PER + i] = code(north - (j + 0.5) / 60, west + (i + 0.5) / 60);
  return t;
};

describe('the finer level of a relief', () => {
  it('tells a metre from none, and holds a wall of four kilometres to within thirty-two metres', () => {
    expect(decodeShape(encodeShape(0))).toBe(0);
    expect(decodeShape(encodeShape(1))).toBe(1);
    expect(decodeShape(encodeShape(-1))).toBe(-1);
    expect(encodeShape(0.2)).toBe(1);
    for (const m of [0.3, 2, 7.5, 40, 333, 1200, 3900]) {
      for (const v of [m, -m]) {
        const back = decodeShape(encodeShape(v));
        expect(Math.sign(back)).toBe(Math.sign(v));
        // Its steps are as wide as the root of the height: half of one is the most it is out by.
        expect(Math.abs(back - v)).toBeLessThanOrEqual(Math.sqrt(Math.abs(v)) / 2 + 0.07);
      }
    }
    // Beyond what a byte holds, the most it holds.
    expect(decodeShape(encodeShape(9000))).toBe(4032.25);
    expect(encodeShape(-9000)).toBe(-127);
  });

  it('says which tiles there are, a hex digit for every four, and finds those a scene of a place reads', () => {
    const has = (tx: number, ty: number) => (tx + ty) % 3 === 0;
    const rows = fineRows(has, 2);
    expect(rows).toHaveLength(90);
    expect(rows[0]).toHaveLength(45);
    for (const [tx, ty] of [[0, 0], [1, 0], [2, 1], [179, 89], [90, 45], [91, 45]]) expect(fineHas({ rows }, tx, ty)).toBe(has(tx, ty));
    expect(fineTile(FINE, 41.3, 12.7)).toEqual({ tx: 96, ty: 24, key: '42_12' });
    expect(fineKey(2, 0, 0)).toBe('90_-180');
    // Two degrees either way on the ground: three tiles down, and as many across as the latitude asks.
    const near = fineTilesNear({ ...FINE, rows: everywhere }, 41, 13);
    expect(near).toContain('42_12');
    expect(near).toContain('44_10');
    expect(near).toContain('40_14');
    expect(near.every((k) => Math.abs(Number(k.split('_')[0]) - 42) <= 2)).toBe(true);
    // By the line where longitude wraps, the tiles of both sides of it.
    const edge = fineTilesNear({ ...FINE, rows: everywhere }, 0, 179.5);
    expect(edge).toContain('2_178');
    expect(edge).toContain('2_-180');
    // No further east and west than six degrees, however far north.
    const b = fineBox(FINE, 85, 0);
    expect((b.i1 - b.i0 + 1) / 60).toBeLessThanOrEqual(12.1);
  });

  it("lays the survey's cells over the relief's grid where today's relief is held: each cell where it lies, all of it", () => {
    // A cell is 40 m up where its latitude and longitude, in sixtieths, are both even; and 10 m down elsewhere.
    const code = (lat: number, lon: number) => (Math.floor(lat * 60) % 2 === 0 && Math.floor(lon * 60) % 2 === 0 ? encodeShape(40) : encodeShape(-10));
    const shape = sceneShape({ info: info(everywhere), tile: tilesOf(code), at: { lat: 40.5, lon: 11.25 } })!;
    expect(shape.field).toBe('field:test/relief');
    expect(shape.held).toBe(true);
    expect(shape.share).toBe(1);
    expect(shape.turn).toBe(0);
    const p = shape.patch;
    expect(p.step).toBeCloseTo(1 / 60, 9);
    expect(p.ny).toBe(241);
    for (const [j, i] of [[0, 0], [17, 200], [240, p.nx - 1], [120, 121]]) {
      const lat = p.lat0 - j * p.step;
      const lon = p.lon0 + i * p.step;
      expect(p.z[j * p.nx + i]).toBe(decodeShape(code(lat, lon)));
    }
    // Read at the scene's own ground: the cell under a point of it, 30 km north and 12 km east of its origin.
    const read = new ShapeReader(shape);
    const lat = 40.5 + 30000 / 111194.9;
    const lon = 11.25 + 12000 / (111194.9 * Math.cos((40.5 * Math.PI) / 180));
    const j = Math.round((p.lat0 - lat) / p.step);
    const i = Math.round((lon - p.lon0) / p.step);
    const corners = [p.z[j * p.nx + i], p.z[j * p.nx + i + 1], p.z[j * p.nx + i - 1], p.z[(j + 1) * p.nx + i], p.z[(j - 1) * p.nx + i], p.z[(j + 1) * p.nx + i + 1], p.z[(j - 1) * p.nx + i - 1], p.z[(j + 1) * p.nx + i - 1], p.z[(j - 1) * p.nx + i + 1]];
    const z = read.at(12000, 30000);
    expect(z).toBeGreaterThanOrEqual(Math.min(...corners));
    expect(z).toBeLessThanOrEqual(Math.max(...corners));
    // And nothing beyond its patch, to which it eases.
    expect(read.at(0, 400000)).toBe(0);
    expect(Math.abs(read.at(0, 221000))).toBeLessThan(5);
  });

  it("has no shape where the level has no tile near: the relief's grid is the ground", () => {
    expect(sceneShape({ info: info(fineRows(() => false, 2)), tile: () => undefined, at: { lat: 10, lon: 10 } })).toBeUndefined();
  });
});

describe("today's shape, carried back", () => {
  it("holds all of today's shape through the Quaternary, lets go of it evenly to the Pliocene, and keeps none before", () => {
    expect(heldShare(0.9, RULE)).toBe(1);
    expect(heldShare(2.58, RULE)).toBe(1);
    expect(heldShare((2.58 + 5.333) / 2, RULE)).toBeCloseTo(0.5, 9);
    expect(heldShare(5.333, RULE)).toBe(0);
    expect(heldShare(66, RULE)).toBe(0);
    for (let a = 2.6; a < 5.3; a += 0.3) expect(heldShare(a, RULE)).toBeGreaterThan(heldShare(a + 0.3, RULE));
    expect(carriedReach({ field: 'f', title: 't', model: 'm', ...RULE, ranges: [] })).toBe(5.333);
    expect(carriedReach({ field: 'f', title: 't', model: 'm', ...RULE, ranges: [RANGE] })).toBe(50);
  });

  it("carries a range's shape back to when its record says it stood, and before that as far as it had risen", () => {
    expect(rangeShare(10, RANGE, RULE)).toBe(1);
    expect(rangeShare(20, RANGE, RULE)).toBe(1);
    expect(rangeShare(35, RANGE, RULE)).toBeCloseTo(0.5, 9);
    expect(rangeShare(50, RANGE, RULE)).toBe(0);
    expect(rangeShare(66, RANGE, RULE)).toBe(0);
    // A range whose record gives no start is let go over as long as the rule takes to let go of any ground.
    const undated = { standingMa: 20 };
    expect(rangeShare(20, undated, RULE)).toBe(1);
    expect(rangeShare(20 + (5.333 - 2.58) / 2, undated, RULE)).toBeCloseTo(0.5, 9);
    expect(rangeShare(20 + 5.333 - 2.58, undated, RULE)).toBe(0);
    // Inside its outline the record speaks, and outside it only the rule.
    const c = { field: 'f', title: 't', model: 'm', ...RULE, ranges: [RANGE] };
    expect(insideOutline(RANGE.outline, 11, 41)).toBe(true);
    expect(insideOutline(RANGE.outline, 14, 41)).toBe(false);
    expect(shareAt(c, 41, 11, 15)).toEqual({ share: 1, range: RANGE });
    expect(shareAt(c, 41, 14, 15)).toEqual({ share: 0 });
    expect(shareAt(c, 41, 11, 35).share).toBeCloseTo(0.5, 9);
    // In the Quaternary the rule already holds all of it, and no range is named for what it adds nothing to.
    expect(shareAt(c, 41, 11, 1)).toEqual({ share: 1 });
    // A scene asks whether any of it may stand within its reach before it sends for anything: by the rule anywhere,
    // and after that only within reach of a range that still stands.
    expect(carriedNear(c, -30, 150, 3, 2)).toBe(true);
    expect(carriedNear(c, -30, 150, 15, 2)).toBe(false);
    expect(carriedNear(c, 41, 11, 15, 2)).toBe(true);
    expect(carriedNear(c, 44.5, 11, 15, 2)).toBe(true);
    expect(carriedNear(c, 46, 11, 15, 2)).toBe(false);
    expect(carriedNear(c, 41, 11, 60, 2)).toBe(false);
  });

  // Made-up ground: a slope of the land a degree's grid can hold, ridges two tenths of a degree apart, and in the
  // survey's cells a ripple a few cells long.
  const broad = (lat: number, lon: number) => 800 + 60 * (lat - 41) + 45 * (lon - 11);
  const ridges = (lat: number, lon: number) => 300 * Math.sin((lon * Math.PI) / 0.2) * Math.cos((lat * Math.PI) / 0.3);
  const ground01 = (lat: number, lon: number) => broad(lat, lon) + ridges(lat, lon);
  const ripple = (lat: number, lon: number) => 25 * Math.sin(lat * 60 * 1.1) * Math.sin(lon * 60 * 0.9);
  const today = (plate: (lat: number, lon: number) => number = () => 7) => ({ step: 0.1, elevation: ground01, plate });

  // What a coarser elevation makes of today, on its nodes of whole degrees: not a mean of that ground, but lower on
  // the slope and with a rise of its own, as such a grid may be.
  const coarse = (lat: number, lon: number) => 700 + 40 * (lat - 41) + 70 * (lon - 11) + 120 * Math.sin(lat) * Math.cos(lon);
  const base = between(coarse, 1);

  it('reads a grid straight between its nodes, round the line where longitude wraps and up to the poles', () => {
    const grid = (lat: number, lon: number) => lat * 10 + ((((lon + 180) % 360) + 360) % 360);
    const read = between(grid, 1);
    expect(read(41, 11)).toBeCloseTo(grid(41, 11), 9);
    expect(read(41.5, 11.5)).toBeCloseTo((grid(41, 11) + grid(42, 11) + grid(41, 12) + grid(42, 12)) / 4, 9);
    expect(read(41.25, 11)).toBeCloseTo(grid(41, 11) * 0.75 + grid(42, 11) * 0.25, 9);
    // Half a degree short of the line: between the last node west of it and the first one east of it.
    expect(read(0, 179.5)).toBeCloseTo((grid(0, 179) + grid(0, 180)) / 2, 9);
    expect(read(90, 30)).toBeCloseTo(grid(90, 30), 9);
    expect(read(-90, 30)).toBeCloseTo(grid(-90, 30), 9);
    // A finer grid, at a node and between two.
    const fine = between(grid, 0.1);
    expect(fine(41.3, 11.7)).toBeCloseTo(grid(41.3, 11.7), 6);
    expect(fine(41.35, 11.7)).toBeCloseTo((grid(41.3, 11.7) + grid(41.4, 11.7)) / 2, 6);
  });

  it('measures the arc between two places', () => {
    expect(arcBetween([0, 0], [0, 90])).toBeCloseTo(90, 9);
    expect(arcBetween([10, 20], [10, 20])).toBe(0);
    expect(arcBetween([89, 0], [89, 180])).toBeCloseTo(2, 9);
    expect(arcBetween([41, 11], [41.1, 11])).toBeCloseTo(0.1, 9);
  });

  it('finds the latest time a scene reads an elevation at its keyframe of the present', () => {
    const deep = { coverage: [-540e6, 11950] as [number, number], keyframesMa: [0, 5, 10] };
    const finer = { coverage: [-796050, 11950] as [number, number] };
    // Where a finer field answers for the latest times, the year before its own begin; where none does, the field's last.
    expect(presentRead(deep, [finer])).toBe(-796051);
    expect(presentRead(deep, [])).toBe(11950);
    // A field a finer one covers whole is never read; and one last read at another keyframe has no picture of today.
    expect(presentRead({ coverage: [-700000, 0], keyframesMa: [0] }, [finer])).toBeUndefined();
    expect(presentRead({ coverage: [-540e6, -3e6], keyframesMa: [0, 5, 10] }, [])).toBeUndefined();
  });

  it("takes what the elevation makes of today out of today's ground: laid back over that, it is today's ground", () => {
    const shape = sceneShape({ info: info(everywhere), tile: tilesOf((la, lo) => encodeShape(ripple(la, lo))), at: { lat: 41, lon: 11 }, carried: { ageMa: 1.2, turn: 0, apart: () => 0, today: today(), base, grain: 1 } })!;
    expect(shape.field).toBe('field:test/carried');
    expect(shape.held).toBe(false);
    expect(shape.share).toBe(1);
    const p = shape.patch;
    // It is what today's ground stands above that elevation by, the broad difference between the two with the ridges
    // and the ripple: so over a degree its mean is that difference, and no mean of nothing.
    let sum = 0;
    let off = 0;
    let n = 0;
    for (let j = 60; j < 180; j++) {
      for (let i = Math.floor(p.nx / 2) - 60; i < Math.floor(p.nx / 2) + 60; i++) {
        const lat = p.lat0 - j * p.step;
        const lon = p.lon0 + i * p.step;
        sum += p.z[j * p.nx + i];
        off += broad(lat, lon) - base(lat, lon);
        n++;
      }
    }
    expect(Math.abs(off / n)).toBeGreaterThan(40);
    expect(Math.abs(sum / n - off / n)).toBeLessThan(5);
    // And with that elevation laid back under it, it is today's ground: the relief's grid read straight between its
    // nodes, and the survey's ripple on it. Wherever the elevation of a time is its picture of today, so is the scene's.
    const relief = between(ground01, 0.1);
    let worst = 0;
    for (const [j, i] of [[100, 100], [121, 140], [77, 160], [150, 90], [33, 201], [60, 60], [200, 30]]) {
      const lat = p.lat0 - j * p.step;
      const lon = p.lon0 + i * p.step;
      const whole = p.z[j * p.nx + i] + base(lat, lon);
      worst = Math.max(worst, Math.abs(whole - (relief(lat, lon) + decodeShape(encodeShape(ripple(lat, lon))))));
    }
    expect(worst).toBeLessThan(0.2);
    // It comes with today's ground at each cell, a little under rather than over, and with the rule's floor: what a
    // scene holds ground that is dry today above the coast by.
    expect(shape.floor).toBe(0.02);
    expect(shape.today!.length).toBe(p.z.length);
    for (const [j, i] of [[100, 100], [121, 140], [77, 160], [150, 90], [33, 201]]) {
      const lat = p.lat0 - j * p.step;
      const lon = p.lon0 + i * p.step;
      const ground = relief(lat, lon) + decodeShape(encodeShape(ripple(lat, lon)));
      expect(shape.today![j * p.nx + i]).toBeLessThanOrEqual(ground + 0.001);
      expect(shape.today![j * p.nx + i]).toBeGreaterThan(ground - 0.11);
    }
    // A shape of today's relief where it is held has neither: its ground is the survey's as it is.
    const held = sceneShape({ info: info(everywhere), tile: tilesOf((la, lo) => encodeShape(ripple(la, lo))), at: { lat: 41, lon: 11 } })!;
    expect(held.today).toBeUndefined();
    expect(held.floor).toBeUndefined();
  });

  it("gives ground on another plate its shape only as far as that plate has not moved against the scene's own", () => {
    // Another plate begins at 11.5°E.
    const plate = (_lat: number, lon: number) => (lon < 11.5 ? 7 : 9);
    const most = (moved: number) => {
      const shape = sceneShape({ info: info(everywhere), tile: tilesOf((la, lo) => encodeShape(ripple(la, lo))), at: { lat: 41, lon: 11 }, carried: { ageMa: 1.2, turn: 0, apart: (id) => (id === 7 ? 0 : moved), today: today(plate), base, grain: 1 } })!;
      const p = shape.patch;
      const col = (lon: number) => Math.round((lon - p.lon0) / p.step);
      let own = 0;
      let other = 0;
      for (let j = 0; j < p.ny; j++) {
        own = Math.max(own, Math.abs(p.z[j * p.nx + col(10.7)]));
        other = Math.max(other, Math.abs(p.z[j * p.nx + col(12.3)]));
      }
      return { own, other };
    };
    // One that has moved five degrees since the scene's keyframe has none of it.
    const far = most(5);
    expect(far.own).toBeGreaterThan(100);
    expect(far.other).toBe(0);
    // One that has not moved, as none has at the elevation's picture of today, has all of it.
    const still = most(0);
    expect(still.own).toBe(far.own);
    expect(still.other).toBeGreaterThan(100);
    // One that has moved half a node of the relief's grid has half; and a whole node, none.
    const half = most(0.05);
    expect(half.other / still.other).toBeGreaterThan(0.45);
    expect(half.other / still.other).toBeLessThan(0.55);
    expect(most(0.1).other).toBe(0);
  });

  it("lets go of today's shape with age, but for a range that stood; and has none where none stood", () => {
    const tile = tilesOf((la, lo) => encodeShape(ripple(la, lo)));
    const at = (ageMa: number, ranges: ReliefRange[], lon = 11) => sceneShape({ info: info(everywhere, ranges), tile, at: { lat: 41, lon }, carried: { ageMa, turn: 0, apart: () => 0, today: today(), base, grain: 1 } });
    const size = (s: ReturnType<typeof at>) => (s ? s.patch.z.reduce((m, v) => m + Math.abs(v), 0) / s.patch.z.length : 0);
    const whole = size(at(1, []));
    expect(size(at(4, []))).toBeGreaterThan(0.3 * whole);
    expect(size(at(4, []))).toBeLessThan(0.7 * whole);
    expect(at(4, [])!.share).toBeCloseTo(heldShare(4, RULE), 3);
    expect(at(12, [])).toBeUndefined();
    // Within the range's outline, all of it at 12 Ma, with the range named. Outside the outline none of its hills
    // and valleys: half a degree out, only the last of what today's ground stands above the elevation's picture of
    // today by on the whole, which falls away over that elevation's grain.
    const held = at(12, [RANGE])!;
    expect(held.share).toBe(1);
    expect(held.range).toEqual({ id: 'test/range', label: 'Test Range' });
    const p = held.patch;
    const col = (lon: number) => Math.round((lon - p.lon0) / p.step);
    let inside = 0;
    let outside = 0;
    for (let j = 0; j < p.ny; j++) {
      inside = Math.max(inside, Math.abs(p.z[j * p.nx + col(11.1)]));
      outside = Math.max(outside, Math.abs(p.z[j * p.nx + col(13.5)]));
    }
    expect(inside).toBeGreaterThan(100);
    expect(outside).toBeLessThan(5);
    // A scene outside the outline but within sight of it is given the range's shape, and none of its own; and more
    // than a degree outside the outline there is nothing of it at all.
    const beside = at(12, [RANGE], 13.6)!;
    expect(beside.share).toBe(0);
    expect(beside.range).toBeUndefined();
    expect(size(beside)).toBeGreaterThan(0);
    const q = beside.patch;
    let far = 0;
    for (let j = 0; j < q.ny; j++) far = Math.max(far, Math.abs(q.z[j * q.nx + Math.round((14.6 - q.lon0) / q.step)]));
    expect(far).toBe(0);
  });

  it('leaves no trench where the outlines of two ranges that both stood do not quite meet', () => {
    // Two ranges side by side, with a tenth of a degree between their outlines: one row of the relief's nodes that
    // neither record speaks for, at a time only their records reach.
    const west: ReliefRange = { id: 'test/west', label: 'West', outline: [[[[9, 39], [10.85, 39], [10.85, 43], [9, 43], [9, 39]]]], standingMa: 20 };
    const east: ReliefRange = { id: 'test/east', label: 'East', outline: [[[[10.95, 39], [13, 39], [13, 43], [10.95, 43], [10.95, 39]]]], standingMa: 20 };
    const shape = sceneShape({ info: info(everywhere, [west, east]), tile: tilesOf((la, lo) => encodeShape(ripple(la, lo))), at: { lat: 41, lon: 11 }, carried: { ageMa: 12, turn: 0, apart: () => 0, today: today(), base, grain: 1 } })!;
    const p = shape.patch;
    const col = (lon: number) => Math.round((lon - p.lon0) / p.step);
    // Along the gap the ground still stands above the elevation's picture of today by nearly what today's does on the
    // whole, as its neighbours do: without that it would lie that far below them, in a trench a node wide.
    let gap = 0;
    let whole = 0;
    let n = 0;
    for (let j = 60; j < 180; j++) {
      const lat = p.lat0 - j * p.step;
      gap += p.z[j * p.nx + col(10.9)];
      whole += broad(lat, 10.9) - base(lat, 10.9);
      n++;
    }
    expect(Math.abs(whole / n)).toBeGreaterThan(40);
    expect(Math.abs(gap / n - whole / n)).toBeLessThan(0.25 * Math.abs(whole / n));
  });

  it("turns the shape as the plate has turned: a scene's north is where it pointed then", () => {
    // A carry that leaves north where it is, and one that turns the globe a quarter about the point at 0°, 0°.
    expect(turnOf((la, lo) => [la, lo + 30], 20, 40)).toBeCloseTo(0, 6);
    const quarter = (lat: number, lon: number): [number, number] => {
      const r = Math.PI / 180;
      const [x, y, z] = [Math.cos(lat * r) * Math.cos(lon * r), Math.cos(lat * r) * Math.sin(lon * r), Math.sin(lat * r)];
      // North at 0°, 0° goes to east.
      const [x2, y2, z2] = [x, z, -y];
      return [Math.asin(z2) / r, Math.atan2(y2, x2) / r];
    };
    expect(turnOf(quarter, 0, 0)).toBeCloseTo(Math.PI / 2, 4);
    // Ridges that run north and south today run east and west in a scene whose north points to today's east.
    const stripes = tilesOf((_la, lo) => encodeShape(Math.floor(lo * 6) % 2 === 0 ? 100 : -100));
    const make = (turn: number) => new ShapeReader(sceneShape({ info: info(everywhere), tile: stripes, at: { lat: 0.5, lon: 0.5 }, carried: { ageMa: 1, turn, apart: () => 0, today: { step: 0.1, elevation: () => 0, plate: () => 7 }, base: () => 0, grain: 1 } })!);
    const spread = (r: ShapeReader, dx: number, dy: number) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = -20; k <= 20; k++) {
        const v = r.at(dx * k * 2000, dy * k * 2000);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return hi - lo;
    };
    const straight = make(0);
    expect(spread(straight, 1, 0)).toBeGreaterThan(150);
    expect(spread(straight, 0, 1)).toBeLessThan(20);
    const turned = make(Math.PI / 2);
    expect(spread(turned, 1, 0)).toBeLessThan(20);
    expect(spread(turned, 0, 1)).toBeGreaterThan(150);
  });
});
