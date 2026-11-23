// The pieces of a town's works (works.ts): each is drawn, at every detail, the size its spec says.
import { describe, expect, it } from 'vitest';
import { MAT, Mesh, STRIDE } from '../city/kit.ts';
import { PERSON_VARIANTS } from './figures.ts';
import { drawWork, PIECE, smallWork, towered, towerSide, WORK_VARIANTS, workTop, type WallWord, type WorkKind, type WorkSpec } from './works.ts';
import { ENCLOSURE_SIZE } from './yard.ts';

const WALLS: WallWord[] = ['earth', 'rammed-earth', 'timber', 'mudbrick', 'stone', 'brick'];

/** A piece's vertices, as [x, y, z]. */
function drawn(s: WorkSpec, detail: 0 | 1 | 2, variant = 0): [number, number, number][] {
  const m = new Mesh(256);
  drawWork(m, s, detail, variant);
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

  it('draws each length of enclosure as long as it is asked to be, and about as high as its kind stands', () => {
    for (const word of ['fence', 'hedge', 'palisade', 'bank', 'ditch', 'wall'] as const) {
      const s: WorkSpec = { kind: 'enclosure', height: 0, thickness: ENCLOSURE_SIZE[word].thickness, word, run: 6 };
      for (const detail of [0, 1, 2] as const) {
        for (const variant of [0, 5]) {
          const v = drawn(s, detail, variant);
          // Its lengths meet: each runs the whole of its run, within the lumps of a hedge.
          expect(Math.min(...v.map((p) => p[0])), `${word} at ${detail}`).toBeLessThanOrEqual(-3 + 0.6);
          expect(Math.max(...v.map((p) => p[0])), `${word} at ${detail}`).toBeGreaterThanOrEqual(3 - 0.6);
          expect(Math.max(...v.map((p) => p[2])), `${word} at ${detail}`).toBeLessThanOrEqual(workTop(s) + 0.6);
          expect(Math.max(...v.map((p) => p[2]))).toBeGreaterThanOrEqual(ENCLOSURE_SIZE[word].height * 0.7);
        }
      }
    }
  });

  it('draws a pen round its ground with a way in, and each thing of a yard about the size it says', () => {
    const pen: WorkSpec = { kind: 'pen', height: 0, thickness: 8, word: 'hedge' };
    const v = drawn(pen, 0);
    for (const p of v) expect(Math.hypot(p[0], p[1])).toBeLessThanOrEqual(4 + 1.6);
    // The way in is at its front: nothing stands across it.
    expect(v.filter((p) => Math.abs(p[0]) < 0.5 && p[1] > 3)).toEqual([]);
    const things: WorkSpec[] = [
      { kind: 'well', height: 0, thickness: 1.6 },
      { kind: 'oven', height: 0, thickness: 1.4 },
      { kind: 'rack', height: 1.8, thickness: 2.6 },
      { kind: 'stack', height: 2.8, thickness: 2.6 },
      { kind: 'floor', height: 0, thickness: 8 },
      { kind: 'pond', height: 0, thickness: 8 },
      { kind: 'pole', height: 5, thickness: 0.4 },
    ];
    for (const s of things) {
      for (const detail of [0, 1, 2] as const) {
        const w = drawn(s, detail);
        expect(Math.max(...w.map((p) => p[2])), `${s.kind} at ${detail}`).toBeLessThanOrEqual(Math.max(workTop(s), s.height) + 0.6);
        expect(Math.max(...w.map((p) => Math.hypot(p[0], p[1]))), `${s.kind} at ${detail}`).toBeLessThanOrEqual(Math.max(s.thickness / 2 + 1.5, 1.6));
      }
      // Water and a floor lie on the ground; the rest stand on it.
      const top = Math.max(...drawn(s, 0).map((p) => p[2]));
      if (s.kind === 'floor' || s.kind === 'pond') expect(top).toBeLessThan(0.5);
      else expect(top).toBeGreaterThan(0.7);
      expect(smallWork(s.kind)).toBe(s.kind !== 'floor' && s.kind !== 'pond');
    }
  });

  it('draws a person in each of its ways, a grown one as tall as it says and a child shorter', () => {
    expect(WORK_VARIANTS).toBe(PERSON_VARIANTS);
    const s: WorkSpec = { kind: 'person', height: 1.62, thickness: 0.5 };
    const tops = Array.from({ length: PERSON_VARIANTS }, (_, k) => Math.max(...drawn(s, 0, k).map((p) => p[2])));
    // Standing, with a staff, walking: about its height. Carrying on its head: more. Sitting, kneeling, a child: less.
    for (const k of [0, 2, 7]) expect(tops[k]).toBeCloseTo(1.62, 0);
    expect(tops[3]).toBeGreaterThan(1.7);
    for (const k of [4, 5]) expect(tops[k]).toBeLessThan(1.1);
    expect(tops[6]).toBeGreaterThan(0.95);
    expect(tops[6]).toBeLessThan(1.25);
    for (let k = 0; k < PERSON_VARIANTS; k++) {
      for (const detail of [0, 1, 2] as const) {
        const v = drawn(s, detail, k);
        // On the ground, and no wider than a person with what it carries.
        expect(Math.min(...v.map((p) => p[2]))).toBeGreaterThanOrEqual(-0.05);
        expect(Math.max(...v.map((p) => Math.hypot(p[0], p[1])))).toBeLessThan(1.1);
      }
    }
  });

  it('stands a figure in a robe on feet, close by: under its hem, on the ground', () => {
    const s: WorkSpec = { kind: 'person', height: 1.62, thickness: 0.5 };
    // Each vertex with its material: skin below the ankle is a foot.
    const skin = (detail: 0 | 1, k: number): [number, number, number][] => {
      const m = new Mesh(256);
      drawWork(m, s, detail, k);
      const { vertices } = m.arrays();
      const f = new Float32Array(vertices);
      const b = new Uint8Array(vertices);
      const out: [number, number, number][] = [];
      for (let i = 0; i < vertices.byteLength / STRIDE; i++) if (b[i * STRIDE + 24] === MAT.skin) out.push([f[i * 7], f[i * 7 + 1], f[i * 7 + 2]]);
      return out;
    };
    // The two drawn in a robe: with a staff, and holding a basket.
    for (const k of [1, 7]) {
      const feet = skin(0, k).filter((p) => p[2] < 0.1 * 1.62);
      expect(feet.length, `variant ${k}`).toBeGreaterThan(20);
      // Both of them, either side of its middle, down to the ground and no more than a finger under it.
      expect(feet.some((p) => p[0] > 0.05)).toBe(true);
      expect(feet.some((p) => p[0] < -0.05)).toBe(true);
      expect(Math.min(...feet.map((p) => p[2]))).toBeLessThan(0.01);
      expect(Math.min(...feet.map((p) => p[2]))).toBeGreaterThan(-0.03);
      // From a way off it has none, and its robe reaches the ground, as before.
      expect(skin(1, k).filter((p) => p[2] < 0.3 * 1.62)).toEqual([]);
    }
  });
});
