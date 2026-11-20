// The river a scene invents: a channel that has migrated to its bends, the loops it cut off, and the ground it swept,
// lower inside a bend than outside it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { hashString } from '../city/math.ts';
import { arrival, NEVER, plainGrid, watersOf, type GridSpec, type PlainParams } from './land.ts';
import { migrate, resample } from './meander.ts';

const record = parse(readFileSync(join(import.meta.dirname, 'scene.yaml'), 'utf8'));
const G: PlainParams = { ...record.params.ground, flow: record.params.site.flow };
const M = G.migration;
const W = G.width;
const VALLEY = 30000;

const lengthOf = (xy: ArrayLike<number>) => {
  let s = 0;
  for (let i = 2; i < xy.length; i += 2) s += Math.hypot(xy[i] - xy[i - 2], xy[i + 1] - xy[i - 1]);
  return s;
};
const nearest = (xy: ArrayLike<number>, x: number, y: number) => {
  let d = Infinity;
  for (let i = 0; i < xy.length; i += 2) d = Math.min(d, Math.hypot(xy[i] - x, xy[i + 1] - y));
  return d;
};

describe('a river that has migrated', () => {
  const made = migrate(VALLEY, W, G.depth, M, 4321);

  it('winds as a meandering river does, its bends of many sizes, and never comes within a neck of itself', () => {
    const xy = made.xy;
    const n = xy.length / 2;
    const sinuosity = lengthOf(xy) / VALLEY;
    expect(sinuosity).toBeGreaterThan(1.5);
    expect(sinuosity).toBeLessThan(3.2);
    // Its bends: the stretches between the points where it stops turning one way and turns the other.
    const bends: number[] = [];
    let from = 0;
    let turn = 0;
    for (let i = 1; i < n - 1; i++) {
      const cross = (xy[i * 2] - xy[i * 2 - 2]) * (xy[i * 2 + 3] - xy[i * 2 + 1]) - (xy[i * 2 + 1] - xy[i * 2 - 1]) * (xy[i * 2 + 2] - xy[i * 2]);
      const now = Math.sign(cross);
      if (now && now !== turn) {
        if (turn && i - from > 4) bends.push(((i - from) * W) / 2);
        from = i;
        turn = now;
      }
    }
    expect(bends.length).toBeGreaterThan(20);
    const mean = bends.reduce((a, b) => a + b, 0) / bends.length;
    const sd = Math.sqrt(bends.reduce((a, b) => a + (b - mean) ** 2, 0) / bends.length);
    // A bend is some widths long, and no two are alike: a sine's would all be one size.
    expect(mean / W).toBeGreaterThan(3);
    expect(mean / W).toBeLessThan(20);
    expect(sd / mean).toBeGreaterThan(0.3);
    // No two stretches of it, apart along it, lie within a neck of each other: such a loop was cut.
    const apart = Math.ceil((M.neck * W) / (W / 2)) + 20;
    for (let i = 0; i < n; i += 3) {
      for (let j = i + apart; j < n; j += 3) expect(Math.hypot(xy[i * 2] - xy[j * 2], xy[i * 2 + 1] - xy[j * 2 + 1])).toBeGreaterThanOrEqual(M.neck * W * 0.9);
    }
  });

  it('cuts off loops where a neck closes, and keeps where it lay', () => {
    expect(made.loops.length).toBeGreaterThan(5);
    for (const loop of made.loops) {
      const k = loop.xy.length;
      // Its ends were a neck apart, and it was longer than its neck was wide.
      expect(Math.hypot(loop.xy[0] - loop.xy[k - 2], loop.xy[1] - loop.xy[k - 1])).toBeLessThan(M.neck * W);
      expect(lengthOf(loop.xy)).toBeGreaterThan(M.neck * W * 2);
      expect(loop.step).toBeGreaterThan(0);
      expect(loop.step).toBeLessThanOrEqual(M.steps);
    }
    // Where it lay, one step in `every` of the last `kept`, ending with where it lies now.
    expect(made.past.length).toBe(M.kept / M.every);
    expect(made.past.at(-1)!.step).toBe(M.steps);
    expect(Array.from(made.past.at(-1)!.xy)).toEqual(Array.from(made.xy));
    // Between two lines kept it has moved, and by less than its own width.
    const a = made.past.at(-2)!.xy;
    let most = 0;
    for (let i = 0; i < made.xy.length; i += 40) most = Math.max(most, nearest(a, made.xy[i], made.xy[i + 1]));
    expect(most).toBeGreaterThan(1);
    expect(most).toBeLessThan(W * 1.5);
  });

  it('is the same river from the same seed, to the last bit, and another river from another', () => {
    const again = migrate(VALLEY, W, G.depth, M, 4321);
    expect(Array.from(again.xy)).toEqual(Array.from(made.xy));
    expect(again.loops.map((l) => l.step)).toEqual(made.loops.map((l) => l.step));
    const other = migrate(VALLEY, W, G.depth, M, 4322);
    expect(other.xy.length === made.xy.length && Array.from(other.xy).every((v, i) => v === made.xy[i])).toBe(false);
  });

  it('resamples a line to even steps along it, keeping its ends', () => {
    const line = resample([0, 0, 100, 0, 100, 100], 10);
    expect(line.length / 2).toBe(21);
    expect([line[0], line[1], line[40], line[41]]).toEqual([0, 0, 100, 100]);
    for (let i = 2; i < line.length; i += 2) expect(Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1])).toBeLessThan(14);
  });
});

describe('the plain of an invented river', () => {
  const seed = hashString('life/test');
  const waters = watersOf(G, seed, 6000);
  const gs: GridSpec = { nx: 641, ny: 641, x0: -6400, y0: -6400, cell: 20 };
  const WATER = 12;
  const z = plainGrid(gs, G, WATER, seed, waters);
  const heightAt = (x: number, y: number) => z[Math.round((y - gs.y0) / gs.cell) * gs.nx + Math.round((x - gs.x0) / gs.cell)];

  it('runs through the middle to its bearing, with its old bends off the channel and its ponds off the ground it swept', () => {
    const r = waters.river;
    expect(nearest(r, 0, 0)).toBeLessThan(20);
    // Downstream is the bearing: from its first point to its last.
    const dx = r[r.length - 2] - r[0];
    const dy = r[r.length - 1] - r[1];
    expect(Math.atan2(dx, dy)).toBeCloseTo(G.flow, 1);
    expect(waters.oxbows.length).toBeGreaterThan(0);
    expect(waters.scars!.length).toBeGreaterThan(0);
    const near = waters.river.filter((_, i) => Math.abs(waters.river[i - (i % 2)]) < 9000 && Math.abs(waters.river[i - (i % 2) + 1]) < 9000);
    for (const o of waters.oxbows) {
      if (Math.abs(o[0]) > 6000 || Math.abs(o[1]) > 6000) continue;
      // Water stands in it, apart from the river's.
      for (let i = 0; i < o.length; i += 2) expect(nearest(near, o[i], o[i + 1])).toBeGreaterThan(W * 0.9);
    }
    expect(waters.silted!.every((s) => s >= 0 && s < 1)).toBe(true);
    for (let k = 0; k < waters.ponds.length; k += 4) expect(waters.swept!.age(waters.ponds[k], waters.ponds[k + 1])).toBeGreaterThan(NEVER / 2);
  });

  it('has swept the inside of its bends, which shelves to the water, and cuts into the old plain outside them', () => {
    const r = waters.river;
    const span = 8;
    let inner = 0;
    let outer = 0;
    let fresh = 0;
    let old = 0;
    let bends = 0;
    for (let i = span; i < r.length / 2 - span; i += 5) {
      const x = r[i * 2];
      const y = r[i * 2 + 1];
      if (Math.abs(x) > 5500 || Math.abs(y) > 5500) continue;
      // Toward the middle of its chord is the inside of the bend, where it is a bend.
      const mx = (r[(i - span) * 2] + r[(i + span) * 2]) / 2 - x;
      const my = (r[(i - span) * 2 + 1] + r[(i + span) * 2 + 1]) / 2 - y;
      const sag = Math.hypot(mx, my);
      if (sag < 25) continue;
      const off = W / 2 + 40;
      const ix = x + (mx / sag) * off;
      const iy = y + (my / sag) * off;
      const ox = x - (mx / sag) * off;
      const oy = y - (my / sag) * off;
      // Only where neither side is by another stretch of the river or an old bend.
      if (heightAt(ix, iy) < WATER || heightAt(ox, oy) < WATER) continue;
      bends++;
      inner += heightAt(ix, iy);
      outer += heightAt(ox, oy);
      if (waters.swept!.age(ix, iy) < M.heal * 2) fresh++;
      if (waters.swept!.age(ox, oy) > M.heal * 2) old++;
    }
    expect(bends).toBeGreaterThan(40);
    // The bar inside stands lower than the bank outside, by a good part of the plain's height over the water.
    expect(outer / bends - inner / bends).toBeGreaterThan(G.rise * 0.3);
    expect(fresh / bends).toBeGreaterThan(0.7);
    expect(old / bends).toBeGreaterThan(0.7);
    // In the channel now, no time has passed; far from the river, it never came.
    expect(waters.swept!.age(r[0], r[1])).toBe(NEVER);
    const mid = (r.length >> 2) * 2;
    expect(waters.swept!.age(r[mid], r[mid + 1])).toBeLessThan(M.every);
    expect(waters.swept!.age(6000, 6000) === NEVER || waters.swept!.age(-6000, 6000) === NEVER).toBe(true);
  });

  it('brings a visitor to dry ground inside a bend, off its other limb and off the old bends', () => {
    const inset = 108;
    const a = arrival(waters, 2600, inset, (x, y) => heightAt(x, y) > WATER + 1);
    expect(Math.hypot(a.at[0], a.at[1])).toBeLessThan(2600 + inset);
    expect(heightAt(a.at[0], a.at[1])).toBeGreaterThan(WATER + 1);
    expect(nearest(waters.river, a.at[0], a.at[1])).toBeGreaterThan(inset * 0.84);
    for (const o of waters.oxbows) expect(nearest(o, a.at[0], a.at[1])).toBeGreaterThan(inset * 0.84);
  });
});
