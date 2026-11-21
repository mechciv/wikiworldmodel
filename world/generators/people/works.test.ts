// The pieces of a town's works (works.ts): each is drawn, at every detail, the size its spec says.
import { describe, expect, it } from 'vitest';
import { Mesh, STRIDE } from '../city/kit.ts';
import { drawWork, PIECE, towered, towerSide, workTop, type WallWord, type WorkKind, type WorkSpec } from './works.ts';

const WALLS: WallWord[] = ['earth', 'rammed-earth', 'timber', 'mudbrick', 'stone', 'brick'];

/** A piece's vertices, as [x, y, z]. */
function drawn(s: WorkSpec, detail: 0 | 1 | 2): [number, number, number][] {
  const m = new Mesh(256);
  drawWork(m, s, detail);
  const { vertices, indices } = m.arrays();
  expect(indices.length).toBeGreaterThan(0);
  expect(indices.length % 3).toBe(0);
  const f = new Float32Array(vertices);
  return Array.from({ length: vertices.byteLength / STRIDE }, (_, i) => [f[i * 7], f[i * 7 + 1], f[i * 7 + 2]]);
}

describe("a town's works", () => {
  it('draws every kind of piece of every kind of wall, at every detail, no higher than it says', () => {
    for (const material of WALLS) {
      for (const kind of ['wall', 'tower', 'gate'] as WorkKind[]) {
        const s: WorkSpec = { kind, material, height: 8, thickness: material === 'timber' ? 0.4 : 3, opening: 6 };
        for (const detail of [0, 1, 2] as const) {
          const v = drawn(s, detail);
          const top = Math.max(...v.map((p) => p[2]));
          expect(top, `${kind} of ${material} at ${detail}`).toBeLessThanOrEqual(workTop(s) + 1.2);
          expect(top).toBeGreaterThanOrEqual(8);
          // It goes into the ground, so that it stands on a slope.
          expect(Math.min(...v.map((p) => p[2]))).toBeLessThanOrEqual(-0.5);
        }
      }
    }
  });

  it('runs a length of wall the whole of a piece, so that pieces set a piece apart meet', () => {
    for (const material of WALLS) {
      const v = drawn({ kind: 'wall', material, height: 6, thickness: 2.5 }, 2);
      expect(Math.min(...v.map((p) => p[0]))).toBeLessThanOrEqual(-PIECE / 2 + 0.05);
      expect(Math.max(...v.map((p) => p[0]))).toBeGreaterThanOrEqual(PIECE / 2 - 0.4);
    }
  });

  it('leaves a gate its way through, and gives a wall of masonry its towers', () => {
    for (const material of WALLS) {
      const s: WorkSpec = { kind: 'gate', material, height: 8, thickness: 3, opening: 6 };
      // Nothing stands in the way through below head height, but the leaves of a gate drawn close up.
      const v = drawn(s, 1).filter(([x, , z]) => Math.abs(x) < 2.9 && z < 3 && z > 0.1);
      expect(v, material).toEqual([]);
    }
    expect(WALLS.filter(towered)).toEqual(['rammed-earth', 'mudbrick', 'stone', 'brick']);
    expect(towerSide({ kind: 'tower', material: 'stone', height: 8, thickness: 2.5 })).toBeGreaterThanOrEqual(4.5);
  });

  it('draws water as wide as it says, lying on the ground', () => {
    for (const kind of ['canal', 'moat'] as WorkKind[]) {
      const v = drawn({ kind, height: 0, thickness: 10 }, 1);
      expect(Math.max(...v.map((p) => p[2]))).toBeLessThan(0.5);
      expect(Math.max(...v.map((p) => Math.abs(p[1])))).toBeCloseTo(5.5, 5);
      expect(workTop({ kind, height: 0, thickness: 10 })).toBe(5);
    }
  });
});
