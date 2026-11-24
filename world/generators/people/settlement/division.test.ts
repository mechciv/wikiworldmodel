import { describe, expect, it } from 'vitest';
import { area } from '../../city/math.ts';
import { divideFace, splitPiece, type DivisionInput } from './division.ts';

const square = (s: number) => [0, 0, s, 0, s, s, 0, s];
const sizes = { block: 60, lane: 4, front: [8, 14] as [number, number], depth: [18, 30] as [number, number] };
const input = (over: Partial<DivisionInput> = {}): DivisionInput => ({
  ring: square(300),
  open: [true, true, true, true],
  seed: 'face-a',
  sizes,
  ...over,
});

const inRing = (r: number[], x: number, y: number) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2)
    if (r[i + 1] > y !== r[j + 1] > y && x < ((r[j] - r[i]) * (y - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
  return c;
};

describe('cutting a polygon by a line', () => {
  it('cuts a concave polygon into every piece on either side', () => {
    // A U shape, open at the top: a line across its arms makes three pieces.
    const u = [0, 0, 30, 0, 30, 30, 20, 30, 20, 10, 10, 10, 10, 30, 0, 30];
    const s = splitPiece({ p: u, open: u.map(() => false).slice(0, 8) }, 0, 1, 20, true);
    expect(s.pos.length).toBe(2);
    expect(s.neg.length).toBe(1);
    const total = [...s.pos, ...s.neg].reduce((a, q) => a + area(q.p), 0);
    expect(total).toBeCloseTo(area(u), 6);
    // The sides along the cut are open; the others keep what they were.
    for (const q of s.pos) expect(q.open.filter((o) => o).length).toBe(1);
  });
});

describe('the division of a face', () => {
  it('cuts the face into blocks near its size, and plots that each have a front', () => {
    const d = divideFace(input());
    const mean = d.blocks.reduce((a, b) => a + b.area, 0) / d.blocks.length;
    expect(mean).toBeGreaterThan(60 * 60 * 0.4);
    expect(mean).toBeLessThan(60 * 60 * 1.6);
    expect(d.lanes.length).toBeGreaterThan(5);
    expect(d.plots.length).toBeGreaterThan(50);
    for (const p of d.plots) {
      expect(p.area).toBeGreaterThan(20);
      expect(inRing(square(300), p.x, p.y)).toBe(true);
    }
  });

  it('lays no plot over another', () => {
    const d = divideFace(input());
    let over = 0;
    for (let x = 2.5; x < 300; x += 5)
      for (let y = 2.5; y < 300; y += 5) {
        let n = 0;
        for (const p of d.plots) if (inRing(p.ring, x, y)) n++;
        if (n > 1) over++;
      }
    expect(over).toBe(0);
    expect(d.plots.reduce((a, p) => a + p.area, 0)).toBeLessThanOrEqual(300 * 300);
  });

  it('is the same face every time, and another face where the seed is another', () => {
    const a = divideFace(input());
    const b = divideFace(input());
    expect(b.plots.map((p) => p.id)).toEqual(a.plots.map((p) => p.id));
    expect(b.plots.map((p) => p.x)).toEqual(a.plots.map((p) => p.x));
    const c = divideFace(input({ seed: 'face-b' }));
    expect(c.plots.map((p) => p.x)).not.toEqual(a.plots.map((p) => p.x));
  });

  it('runs a planned grid on across faces, street for street', () => {
    const grid = { angle: 0.3, ox: 0, oy: 0, block: [70, 45] as [number, number], street: 6 };
    const left = divideFace(input({ ring: [0, 0, 150, 0, 150, 300, 0, 300], seed: 'l', grid }));
    const right = divideFace(input({ ring: [150, 0, 300, 0, 300, 300, 150, 300], seed: 'r', grid }));
    // Every street of the grid lies on a line of one family: its offset from the grid's origin is a whole step.
    for (const l of [...left.lanes, ...right.lanes]) {
      const [x0, y0, x1, y1] = l.line;
      const dir = Math.atan2(y1 - y0, x1 - x0);
      const off = (a: number) => Math.abs(Math.sin(a - grid.angle));
      expect(Math.min(off(dir), Math.abs(Math.cos(dir - grid.angle)))).toBeLessThan(1e-6);
    }
    const onLine = (l: { line: number[] }) => {
      const [x0, y0] = l.line;
      const nx = -Math.sin(grid.angle);
      const ny = Math.cos(grid.angle);
      return (x0 * nx + y0 * ny) / (grid.block[1] + grid.street);
    };
    const offsets = (d: typeof left) =>
      new Set(d.lanes.filter((l) => Math.abs(Math.sin(Math.atan2(l.line[3] - l.line[1], l.line[2] - l.line[0]) - grid.angle)) < 1e-6).map((l) => Math.round(onLine(l) * 1e6) / 1e6));
    const shared = [...offsets(left)].filter((o) => offsets(right).has(o));
    expect(shared.length).toBeGreaterThan(2);
    // Streets run between the blocks, half a step off the grid's origin.
    for (const o of shared) expect(Math.abs(o - Math.floor(o) - 0.5)).toBeLessThan(1e-6);
    // Blocks keep clear of the streets, and are about the grid's size.
    const full = left.blocks.filter((b) => Math.abs(b.area - 70 * 45) < 1);
    expect(full.length).toBeGreaterThan(3);
  });

  it('divides only what is wanted, and the same way as when all of it is', () => {
    const all = divideFace(input());
    const some = divideFace(input({ need: (x0, y0) => x0 < 150 && y0 < 150 }));
    expect(some.plots.length).toBeLessThan(all.plots.length);
    expect(some.plots.length).toBeGreaterThan(0);
    const ids = new Map(all.plots.map((p) => [p.id, p.x]));
    for (const p of some.plots) expect(ids.get(p.id)).toBe(p.x);
  });

  it('lays its lanes along the contours where the ground is steep', () => {
    // The ground rises to the north: contours run east to west.
    const d = divideFace(input({ gradient: () => [0, 0.3], steep: 0.08 }));
    let along = 0;
    for (const l of d.lanes) {
      const [x0, y0, x1, y1] = l.line;
      if (Math.abs(y1 - y0) < Math.abs(x1 - x0) * 0.58) along++;
    }
    expect(along / d.lanes.length).toBeGreaterThan(0.6);
  });

  it('leaves the ground a footprint takes to it', () => {
    const footprint = [100, 100, 180, 100, 180, 170, 100, 170];
    const d = divideFace(input({ reserved: [footprint] }));
    for (const p of d.plots) expect(inRing(footprint, p.x, p.y)).toBe(false);
  });

  it('gives no plot in a face nobody can reach', () => {
    const d = divideFace(input({ ring: square(50), open: [false, false, false, false] }));
    expect(d.plots.length).toBe(0);
    expect(d.blocks.length).toBe(1);
  });
});
