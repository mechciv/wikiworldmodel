// The ground of a scene before its waters are cut into it (relief.ts): on made-up ground, which says nothing of any place.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ShapeReader } from '../../../core/relief.ts';
import type { ReliefPatch, ReliefShape, SceneRiver } from '../../../core/scene.ts';
import { routeGrid } from './erosion.ts';
import { Invented, Tracer, WorldGround, type InventChoices, type TraceChoices } from './relief.ts';

const record = parse(readFileSync(join(import.meta.dirname, '..', 'life/scene.yaml'), 'utf8'));
const GROUND = record.params.ground as InventChoices & { trace: TraceChoices };
const ORIGIN = { lat: 40, lon: 0 };
const KM_LAT = 111.19493;
const KM_LON = KM_LAT * Math.cos((40 * Math.PI) / 180);

/** A field about the test's place, its nodes `step` degrees apart, from heights by latitude and longitude. */
function field(step: number, at: (lat: number, lon: number) => number, half = 7): ReliefPatch {
  const n = Math.round((2 * half) / step) + 1;
  const z: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z.push(at(40 + half - j * step, -half + i * step));
  return { lat0: 40 + half, lon0: -half, step, nx: n, ny: n, z };
}

/** A shape about the test's place: cells a sixtieth of a degree across, two degrees either way, from heights by metres east and north. */
function shape(at: (x: number, y: number) => number, share = 1): ReliefShape {
  const step = 1 / 60;
  const ny = 241;
  const nx = 313;
  const lat0 = 42 - step / 2;
  const lon0 = -((nx - 1) / 2) * step;
  const z: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(at((lon0 + i * step) * KM_LON * 1000, (lat0 - j * step - 40) * KM_LAT * 1000));
  return { field: 'field:test', held: true, at: ORIGIN, turn: 0, share, patch: { lat0, lon0, step, nx, ny, z } };
}

/** The mean and the spread of a function over a square of the ground. */
function stats(f: (x: number, y: number) => number, cx: number, cy: number, half: number, step: number): { mean: number; sd: number } {
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = cy - half; y <= cy + half; y += step) {
    for (let x = cx - half; x <= cx + half; x += step) {
      const v = f(x, y);
      sum += v;
      sq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

// Ridges and valleys three or four of the survey's cells across: 60 m either way on the plain south of the place, and
// 500 m in a range that rises eighteen kilometres north of it.
const rangeAt = (y: number) => Math.exp(-(((y - 18000) / 8000) ** 2));
const ridged = (x: number, y: number) => (60 + 440 * rangeAt(y)) * Math.sin(x / 1100) * Math.sin(y / 1400 + x / 5000);

describe("the world's ground under a scene", () => {
  it("is the field read between its nodes, and over it the shape within its cells where the world gives one", () => {
    const plane = field(0.1, (lat, lon) => 500 + 300 * (lat - 40) + 100 * lon);
    const bare = new WorldGround(plane, ORIGIN);
    expect(bare.shaped).toBe(false);
    expect(bare.share).toBe(0);
    expect(bare.at(0, 0)).toBeCloseTo(500, 3);
    expect(bare.at(0, KM_LAT * 1000)).toBeCloseTo(800, 0);
    expect(bare.at(KM_LON * 1000, 0)).toBeCloseTo(600, 0);
    const shaped = new WorldGround(plane, ORIGIN, shape(ridged));
    expect(shaped.shaped).toBe(true);
    expect(shaped.share).toBe(1);
    expect(shaped.fineM).toBeCloseTo(1853.2, 0);
    for (const [x, y] of [[3000, 2000], [-41000, 18000], [20000, -90000]]) {
      expect(shaped.field(x, y)).toBeCloseTo(bare.at(x, y), 6);
      // Between the survey's cells, near enough what the cells were made from.
      expect(Math.abs(shaped.shape(x, y) - ridged(x, y))).toBeLessThan(0.45 * (60 + 440 * rangeAt(y)));
      expect(shaped.at(x, y)).toBeCloseTo(shaped.field(x, y) + shaped.shape(x, y), 6);
    }
    // As far as the shape reaches, all of it stood; beyond it, the field alone.
    expect(shaped.shareAt(0, 0)).toBe(1);
    expect(shaped.shareAt(0, 400000)).toBe(0);
    expect(shaped.at(0, 400000)).toBeCloseTo(bare.at(0, 400000), 6);
  });

  it("reads its ground straight between the survey's cells, so that a corner of the field's own grid leaves no crease in it", () => {
    // A field with a sharp crest along a row of its nodes, 900 m high at 40.3°N: read between its nodes it is a tent.
    const tent = field(0.1, (lat) => 2000 + 900 * Math.max(0, 1 - Math.abs(lat - 40.3) / 0.1));
    const bare = new WorldGround(tent, ORIGIN);
    // The survey's ground is smooth across that row; its cells keep what it has less what the field makes of it there.
    const survey = (x: number, y: number) => 2300 + 200 * Math.sin(y / 9000) + 100 * Math.cos(x / 7000);
    const cells = shape((x, y) => survey(x, y) - bare.at(x, y));
    const ground = new WorldGround(tent, ORIGIN, cells);
    // The cells' part read on its own and laid on the field keeps the tent's corner, which lies between two cells.
    const apart = new ShapeReader(cells);
    const crest = 0.3 * KM_LAT * 1000;
    let worst = 0;
    let creased = 0;
    for (let y = crest - 3000; y <= crest + 3000; y += 100) {
      for (const x of [-5000, 0, 3300, 12000]) {
        worst = Math.max(worst, Math.abs(ground.at(x, y) - survey(x, y)));
        creased = Math.max(creased, Math.abs(bare.at(x, y) + apart.at(x, y) - survey(x, y)));
      }
    }
    expect(creased).toBeGreaterThan(50);
    expect(worst).toBeLessThan(3);
    // What it stands above the field by is still its shape, and the two together its ground.
    expect(ground.at(700, crest)).toBeCloseTo(ground.field(700, crest) + ground.shape(700, crest), 6);
  });

  it('holds ground that is dry today above the coast where the elevation of its time has land, and no higher than it stands today', () => {
    // An elevation that has the land 300 m above its coast, and today's shape carried back over it. West of the place
    // a valley whose floor stands 40 m above the sea today lies 500 m under that elevation's own picture of today: laid
    // over this lower land it would be 200 m under the coast. East of it a bay, 30 m under today's sea, and beyond
    // that a low shore, 3 m above it. Elsewhere today's ground stands 600 m high, a hundred above that picture.
    const land = field(1, () => 300);
    const valley = (x: number) => x < -20000 && x > -40000;
    const bay = (x: number) => x > 20000 && x < 40000;
    const shore = (x: number) => x > 60000 && x < 80000;
    const carried = shape((x) => (valley(x) ? -500 : bay(x) ? -400 : shore(x) ? -299 : 100));
    const today = shape((x) => (valley(x) ? 40 : bay(x) ? -30 : shore(x) ? 3 : 600)).patch.z;
    const back: ReliefShape = { ...carried, held: false, today, floor: 0.02 };
    const ground = new WorldGround(land, ORIGIN, back);
    // Away from all three, the land with the shape on it.
    expect(ground.at(0, 5000)).toBeCloseTo(400, 3);
    // The valley's floor is held at a fiftieth of the land's height, and is not the sea's; the bay is still under it.
    expect(ground.at(-30000, 5000)).toBeCloseTo(6, 3);
    expect(ground.at(30000, 5000)).toBeCloseTo(-100, 3);
    // The shore, which would stand a metre above the coast, is held no higher than it stands today.
    expect(ground.at(70000, 5000)).toBeCloseTo(3, 3);
    // Without today's ground to go by, or where today's relief is held, nothing is held: the shape is laid as it is.
    expect(new WorldGround(land, ORIGIN, { ...carried, held: false }).at(-30000, 5000)).toBeCloseTo(-200, 3);
    expect(new WorldGround(land, ORIGIN, { ...carried, today, floor: 0.02 }).at(-30000, 5000)).toBeCloseTo(-200, 3);
    // And where the elevation itself has sea, today's dry ground is not raised out of it.
    const sea = new WorldGround(field(1, () => -50), ORIGIN, back);
    expect(sea.at(-30000, 5000)).toBeCloseTo(-550, 3);
  });
});

describe('the ground a scene invents below the world\'s', () => {
  it("invents nothing on ground the world shows level, and more the rougher the world's ground is at its grain", () => {
    // A plane has no roughness at any grain: there is nothing to carry on below it.
    const level = new Invented(new WorldGround(field(0.1, (lat) => 400 + 200 * (lat - 40)), ORIGIN), GROUND, 77);
    for (const [x, y] of [[0, 0], [900, -3000], [20000, 9000], [-150000, 60000]]) expect(Math.abs(level.at(x, y, 0))).toBeLessThan(0.5);
    // Under the survey's shape: little on the plain, where its cells differ by tens of metres, and several times as
    // much in the range, where they differ by hundreds.
    const ground = new WorldGround(field(0.1, () => 900), ORIGIN, shape(ridged));
    const made = new Invented(ground, GROUND, 77);
    expect(made.any).toBe(true);
    const plain = stats((x, y) => made.at(x, y, 1), 0, -18000, 4000, 250).sd;
    const range = stats((x, y) => made.at(x, y, 1), 0, 18000, 4000, 250).sd;
    expect(plain).toBeGreaterThan(1);
    expect(range).toBeGreaterThan(2.5 * plain);
    // And less than the survey's own cells differ by: it goes on from them, a feature half as long less than as high.
    expect(range).toBeLessThan(stats((x, y) => ground.shape(x, y), 0, 18000, 4000, 250).sd);
  });

  it("invents only below the grain of the world's ground: under a degree's field wide hills, under the survey's cells none wider than a cell", () => {
    // A field of a degree, rough at its grain: hills tens of kilometres across, which the far grid holds.
    const coarse = new WorldGround(field(1, (lat, lon) => 1500 + 900 * Math.sin(lat * 2.1) * Math.cos(lon * 1.7)), ORIGIN);
    const wide = new Invented(coarse, GROUND, 5);
    expect(stats((x, y) => wide.at(x, y, 2), 100000, 100000, 60000, 4000).sd).toBeGreaterThan(40);
    // The same with the survey's shape over it: what is invented is shorter than the survey's cells, so the far grid,
    // whose nodes are no nearer than those, has none of it.
    const fine = new Invented(new WorldGround(field(1, (lat, lon) => 1500 + 900 * Math.sin(lat * 2.1) * Math.cos(lon * 1.7)), ORIGIN, shape(ridged)), GROUND, 5);
    expect(stats((x, y) => fine.at(x, y, 2), 0, 18000, 15000, 1000).sd).toBeLessThan(1);
    expect(stats((x, y) => fine.at(x, y, 0), 0, 3000, 2500, 50).sd).toBeGreaterThan(2);
    // Each grid of the ground has what its nodes can hold: the near one all of it, the middle one less, the far one least.
    const near = stats((x, y) => wide.at(x, y, 0), 0, 0, 5000, 100).sd;
    const far = stats((x, y) => wide.at(x, y, 2), 0, 0, 5000, 100).sd;
    expect(near).toBeGreaterThan(far);
  });

  it("adds nothing to the mean of a cell of the world's ground", () => {
    const made = new Invented(new WorldGround(field(0.1, () => 900), ORIGIN, shape(ridged)), GROUND, 91);
    // Over squares several of the survey's cells across, in the range: what is invented comes to next to nothing beside its size.
    for (const [x, y] of [[0, 20000], [-8000, 16000], [9000, 12000]]) {
      const s = stats((a, b) => made.at(a, b, 1), x, y, 4000, 250);
      expect(s.sd).toBeGreaterThan(3);
      expect(Math.abs(s.mean)).toBeLessThan(0.35 * s.sd);
    }
  });

  it('leads its valleys to the water the world gives, and leaves that water where it is', () => {
    // A valley of the world's ground, rough at its grain, that falls to the meridian of the place from either side; and
    // in it the river the world gives, running along that meridian a little below the ground.
    const ground = new WorldGround(field(0.1, (lat, lon) => 800 + 600 * Math.abs(lon) + 150 * Math.sin(lat * 40) * Math.cos(lon * 35)), ORIGIN);
    const xy: number[] = [];
    const z: number[] = [];
    const half: number[] = [];
    for (let y = -30000; y <= 30000; y += 500) {
      xy.push(0, y);
      z.push(ground.at(0, y) - 10);
      half.push(40);
    }
    const made = new Invented(ground, GROUND, 13, { courses: [{ xy, z, half }] });
    const at = (x: number, y: number) => ground.at(x, y) + made.at(x, y, 1);
    // Water run over the ground it makes, with the river as the place it runs to: of the ground within three
    // kilometres either side, most drains into the river, and little of it lies in a hollow it would first have to fill.
    const n = 161;
    const cell = 250;
    const x0 = -20000;
    const grid = new Float32Array(n * n);
    const fixed = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        grid[j * n + i] = at(x0 + i * cell, x0 + j * cell);
        if (i === 80) fixed[j * n + i] = 1;
      }
    }
    const r = routeGrid(grid, n, n, fixed);
    let near = 0;
    let toRiver = 0;
    let hollow = 0;
    for (let j = 12; j < n - 12; j++) {
      for (let i = 80 - 12; i <= 80 + 12; i++) {
        if (i === 80) continue;
        const k = j * n + i;
        near++;
        let end = k;
        while (r.down[end] >= 0) end = r.down[end];
        if (end % n === 80) toRiver++;
        if (r.level[k] - grid[k] > 3) hollow++;
      }
    }
    expect(toRiver / near).toBeGreaterThan(0.75);
    expect(hollow / near).toBeLessThan(0.1);
  });

  it('is the same ground from the same seed, and other ground from another', () => {
    const ground = () => new WorldGround(field(0.1, () => 900), ORIGIN, shape(ridged));
    const a = new Invented(ground(), GROUND, 3);
    const b = new Invented(ground(), GROUND, 3);
    const c = new Invented(ground(), GROUND, 4);
    let same = true;
    let other = false;
    for (const [x, y] of [[100, 200], [2500, -900], [-12000, 26000]]) {
      if (a.at(x, y, 0) !== b.at(x, y, 0)) same = false;
      if (Math.abs(a.at(x, y, 0) - c.at(x, y, 0)) > 0.5) other = true;
    }
    expect(same).toBe(true);
    expect(other).toBe(true);
    // Laid over a grid at once, it is what it is point by point.
    const gs = { nx: 41, ny: 41, x0: -2000, y0: 24000, cell: 100 };
    const over = a.over(gs, 0);
    for (const [i, j] of [[0, 0], [17, 30], [40, 40]]) expect(over[j * gs.nx + i]).toBeCloseTo(a.at(gs.x0 + i * gs.cell, gs.y0 + j * gs.cell, 0), 2);
  });
});

describe('a river run down the finer ground', () => {
  // A valley that swings east between two nodes of the drainage's grid: its floor falls gently north, a ridge 400 m high
  // stands on the straight line between the nodes, and the valley goes round it by the east.
  const floorX = (y: number) => 5000 * Math.sin(((y + 5500) / 11000) * Math.PI);
  const valley = (x: number, y: number) => {
    const off = x - floorX(y);
    return Math.min(400, (off * off) / 9000) - y / 500 + 300;
  };
  const ground = new WorldGround(field(0.1, () => 0), ORIGIN, shape(valley));
  const river = (from: 'model' | 'observed'): SceneRiver => ({ key: 'test#1', from, xy: [0, -5500, 0, 5500, 0, 16500], s0: 0, q: [40, 50, 60], z: [311, 289, 267] });

  it("runs a river the drainage routes down the valley between the nodes of its grid, its water at the ground's height", () => {
    const tracer = new Tracer(ground, GROUND.trace, 36000);
    const traced = tracer.trace(river('model'));
    const pts = traced.xy.length / 2;
    expect(pts).toBeGreaterThan(8);
    // It still starts and ends at the nodes' valley floor, and its flow grows from one to the next.
    // It starts on the valley's floor within the first node's cell, where that cell's river lies.
    expect(Math.hypot(traced.xy[0], traced.xy[1] + 5500)).toBeLessThan(6000);
    expect(Math.abs(traced.xy[0] - floorX(traced.xy[1]))).toBeLessThan(1800);
    expect(traced.q![0]).toBe(40);
    expect(traced.q!.at(-1)).toBe(60);
    for (let i = 1; i < pts; i++) expect(traced.q![i]).toBeGreaterThanOrEqual(traced.q![i - 1]);
    // Between the first two nodes it goes round by the east, with the valley, and not over the ridge on the straight line.
    let east = 0;
    let high = 0;
    for (let i = 0; i < pts; i++) {
      const [x, y] = [traced.xy[i * 2], traced.xy[i * 2 + 1]];
      if (y > -5000 && y < 5000) {
        east = Math.max(east, x);
        high = Math.max(high, ground.at(x, y) - (300 - y / 500));
        // On the valley's floor, to within what the survey's cells show of it.
        expect(Math.abs(x - floorX(y))).toBeLessThan(1800);
      }
    }
    expect(east).toBeGreaterThan(3000);
    expect(high).toBeLessThan(250);
    // Its water is at the ground's height under it: falling north, as the valley does.
    expect(traced.z![0]).toBeGreaterThan(traced.z!.at(-1)! + 20);
    for (let i = 0; i < pts; i++) expect(Math.abs(traced.z![i] - ground.at(traced.xy[i * 2], traced.xy[i * 2 + 1]))).toBeLessThan(1);
  });

  it('leaves a river that was measured as it is, and one beyond its reach as the drainage gives it', () => {
    const tracer = new Tracer(ground, GROUND.trace, 36000);
    expect(tracer.trace(river('observed'))).toEqual(river('observed'));
    const far: SceneRiver = { key: 'test#2', from: 'model', xy: [60000, 0, 60000, 11000], s0: 0, q: [5, 6], z: [100, 90] };
    const traced = tracer.trace(far);
    expect(traced.xy).toEqual(far.xy);
    expect(traced.z).toEqual(far.z);
  });

  it('brings two rivers that meet at a node to one point', () => {
    const tracer = new Tracer(ground, GROUND.trace, 36000);
    const a = tracer.trace({ key: 'a', from: 'model', xy: [0, -5500, 0, 5500], s0: 0, q: [40, 50], z: [311, 289] });
    const b = tracer.trace({ key: 'b', from: 'model', xy: [-11000, 5500, 0, 5500], s0: 0, q: [5, 6], z: [320, 289] });
    expect(b.xy.at(-2)).toBe(a.xy.at(-2));
    expect(b.xy.at(-1)).toBe(a.xy.at(-1));
  });
});
