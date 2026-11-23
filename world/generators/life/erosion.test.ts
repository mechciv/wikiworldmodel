// Water run over a grid of heights (erosion.ts): on made-up ground, which says nothing of any valley.
import { describe, expect, it } from 'vitest';
import { hash2 } from '../city/math.ts';
import { boxMean, cubicAt, drainedCells, erode, routeGrid, type ErosionChoices } from './erosion.ts';

const CHOICES: ErosionChoices = { steps: 10, power: 0.06, area_exp: 0.45, creep: 0.15 };

/** Rough ground on a slope: n nodes a side, falling to the south, with bumps of a few sizes. */
function rough(n: number, seed: number, bumps = 40): Float32Array {
  const z = new Float32Array(n * n);
  const smoothAt = (x: number, y: number, s: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = x - i;
    const v = y - j;
    const a = hash2(i, j, s);
    const b = hash2(i + 1, j, s);
    const c = hash2(i, j + 1, s);
    const d = hash2(i + 1, j + 1, s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = 200 + j * 1.5 + bumps * (smoothAt(i / 12, j / 12, seed) + 0.5 * smoothAt(i / 5, j / 5, seed + 1) + 0.25 * smoothAt(i / 2, j / 2, seed + 2));
  return z;
}

/** Follow each node down to its outlet: how many nodes never arrive, and the most any step climbs. */
function descent(z: Float32Array, down: Int32Array): { lost: number; climb: number } {
  let lost = 0;
  let climb = 0;
  for (let k = 0; k < z.length; k++) {
    let at = k;
    let steps = 0;
    while (down[at] >= 0 && steps++ < z.length) {
      climb = Math.max(climb, z[down[at]] - z[at]);
      at = down[at];
    }
    if (down[at] >= 0) lost++;
  }
  return { lost, climb };
}

describe('water run over a grid', () => {
  it('drains every node to an outlet, and out of every hollow over its lowest pass', () => {
    const n = 48;
    const z = rough(n, 7);
    // A hollow in the middle: its floor 30 m under the ground about it.
    for (let j = 20; j < 28; j++) for (let i = 20; i < 28; i++) z[j * n + i] -= 30;
    const r = routeGrid(z, n, n);
    // Every node is reached, the edge first; and each drains to a node reached before it.
    const place = new Int32Array(n * n).fill(-1);
    r.order.forEach((k, i) => (place[k] = i));
    expect([...place].every((p) => p >= 0)).toBe(true);
    for (let k = 0; k < n * n; k++) {
      const edge = k % n === 0 || k % n === n - 1 || k < n || k >= n * (n - 1);
      expect(r.down[k] < 0).toBe(edge);
      if (r.down[k] >= 0) {
        expect(place[r.down[k]]).toBeLessThan(place[k]);
        // Its water rests no lower than where it drains to, and no lower than its own ground.
        expect(r.level[k]).toBeGreaterThan(r.level[r.down[k]]);
        expect(r.level[k]).toBeGreaterThanOrEqual(z[k]);
      }
    }
    expect(descent(r.level, r.down)).toEqual({ lost: 0, climb: expect.any(Number) });
    expect(descent(r.level, r.down).climb).toBeLessThanOrEqual(0);
    // The hollow's floor rests at its pass, well above its own ground.
    const floor = 24 * n + 24;
    expect(r.level[floor] - z[floor]).toBeGreaterThan(10);
  });

  it('gathers water as rivers do: what drains through a node is its own cell and all those above it', () => {
    const n = 40;
    const r = routeGrid(rough(n, 3), n, n);
    const cells = drainedCells(r, n * n);
    let out = 0;
    for (let k = 0; k < n * n; k++) {
      if (r.down[k] < 0) out += cells[k];
      expect(cells[k]).toBeGreaterThanOrEqual(1);
    }
    // Nothing is made and nothing lost: all the grid's cells leave by its outlets.
    expect(out).toBe(n * n);
    // And they gather: a few nodes carry a great many cells, and most carry few.
    const sorted = [...cells].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(6);
    expect(sorted.at(-1)!).toBeGreaterThan(60);
  });

  it('cuts valleys that lead to what drains them, deepest where most water gathers, and leaves no hollow', () => {
    const n = 96;
    const before = rough(n, 11);
    const z = before.slice();
    // A river the world gives, along the grid's middle column, falling south to north... to the low edge.
    const fixed = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      const k = j * n + 48;
      fixed[k] = 1;
      z[k] = 150 + j * 0.5;
    }
    const given = z.slice();
    const { routed, cells } = erode(z, n, n, CHOICES, fixed);
    // What the world gives is where it was.
    for (let k = 0; k < n * n; k++) if (fixed[k]) expect(z[k]).toBe(given[k]);
    // Every node's ground falls all the way to an outlet: no hollow is left.
    const d = descent(z, routed.down);
    expect(d.lost).toBe(0);
    expect(d.climb).toBeLessThanOrEqual(1e-3);
    // Water cut where it gathered: the nodes many cells drain through have been lowered far more than the ridges.
    let cutBig = 0;
    let nBig = 0;
    let cutSmall = 0;
    let nSmall = 0;
    for (let k = 0; k < n * n; k++) {
      if (routed.down[k] < 0) continue;
      if (cells[k] > 40) {
        cutBig += given[k] - z[k];
        nBig++;
      } else if (cells[k] <= 2) {
        cutSmall += given[k] - z[k];
        nSmall++;
      }
    }
    expect(nBig).toBeGreaterThan(20);
    expect(cutBig / nBig).toBeGreaterThan(1.5 * Math.max(0.5, cutSmall / nSmall));
    // So where water gathers is a valley, below the mean of the ground about it, and where none does a ridge above it.
    const about = boxMean(z, n, n, 3);
    let valley = 0;
    let ridge = 0;
    for (let k = 0; k < n * n; k++) {
      if (routed.down[k] < 0) continue;
      if (cells[k] > 40) valley += (z[k] - about[k]) / nBig;
      else if (cells[k] <= 2) ridge += (z[k] - about[k]) / nSmall;
    }
    expect(valley).toBeLessThan(-1);
    expect(ridge).toBeGreaterThan(0.3);
    // And a valley's floor is gentler the more it carries: a graded river, steep at its head.
    const fall = (k: number) => z[k] - z[routed.down[k]];
    let steep = 0;
    let gentle = 0;
    for (let k = 0; k < n * n; k++) {
      if (routed.down[k] < 0 || fixed[routed.down[k]]) continue;
      if (cells[k] > 40) gentle += fall(k) / nBig;
      else if (cells[k] <= 2) steep += fall(k) / nSmall;
    }
    expect(gentle).toBeLessThan(steep / 2);
    // Ground beside the river drains to it: from ten nodes either side, down to the river and not past it.
    for (const i of [38, 58]) {
      let at = 40 * n + i;
      while (routed.down[at] >= 0) at = routed.down[at];
      expect(at % n).toBe(48);
    }
  });

  it('is the same ground from the same ground, and cuts none where none is rough', () => {
    const n = 40;
    const a = rough(n, 5);
    const b = rough(n, 5);
    erode(a, n, n, CHOICES);
    erode(b, n, n, CHOICES);
    expect([...a]).toEqual([...b]);
    // A level plain has nothing to cut: it stays within the tilt that carries water across a flat.
    const flat = new Float32Array(n * n).fill(300);
    erode(flat, n, n, CHOICES);
    for (const v of flat) expect(Math.abs(v - 300)).toBeLessThan(0.2);
  });
});

describe('a grid read between its nodes', () => {
  it('passes through its nodes by a cubic, and is the plane where the grid is one', () => {
    const n = 9;
    const a = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) a[j * n + i] = 3 * i - 2 * j + 10;
    expect(cubicAt(a, n, n, 4, 4)).toBeCloseTo(a[4 * n + 4], 5);
    expect(cubicAt(a, n, n, 3.25, 5.5)).toBeCloseTo(3 * 3.25 - 2 * 5.5 + 10, 4);
    // Beyond its edge, its edge.
    expect(cubicAt(a, n, n, -3, 4)).toBeCloseTo(a[4 * n], 5);
    const bumpy = Float32Array.from({ length: n * n }, (_, k) => hash2(k % n, Math.floor(k / n), 9) * 50);
    for (const [i, j] of [[2, 3], [5, 5], [7, 1]]) expect(cubicAt(bumpy, n, n, i, j)).toBeCloseTo(bumpy[j * n + i], 4);
  });

  it('takes the mean over a square about each node, clipped at the edge', () => {
    const n = 7;
    const a = Float32Array.from({ length: n * n }, (_, k) => k % n);
    const m = boxMean(a, n, n, 1);
    expect(m[3 * n + 3]).toBeCloseTo(3, 6);
    expect(m[3 * n]).toBeCloseTo(0.5, 6);
    expect(m[3 * n + 6]).toBeCloseTo(5.5, 6);
    expect([...boxMean(a, n, n, 0)]).toEqual([...a]);
  });
});
