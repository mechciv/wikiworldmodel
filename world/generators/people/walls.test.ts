// Continuous terrain-conforming perimeter walls and gatehouses (walls.ts).
import { describe, expect, it } from 'vitest';
import { MAT, Mesh, STRIDE } from '../city/kit.ts';
import type { GroundHeight } from './fieldworks.ts';
import { buildPerimeterMesh, type PerimeterSpec } from './walls.ts';

// Sloping foothill ground: 15% gradient across the walled compound.
const slopedGround: GroundHeight = { at: (x, y) => 40 + x * 0.14 + y * 0.06 };

describe('continuous terrain-conforming walls and gatehouses', () => {
  it('extrudes a continuous rammed-earth perimeter with deep skirts, watchtowers, and roofed gatehouses on sloping hills', () => {
    const ring: [number, number][] = [
      [-60, -50],
      [60, -50],
      [60, 50],
      [-60, 50],
    ];
    const spec: PerimeterSpec = {
      ring,
      gates: [
        { x: 0, y: -50, dx: 0, dy: -1, width: 6 },
        { x: 0, y: 50, dx: 0, dy: 1, width: 6 },
      ],
      kind: 'rammed-earth',
      height: 5.5,
      thickness: 3.6,
      roofMat: MAT.claytile,
      entity: 17,
      seed: 101,
    };
    const m = new Mesh(8192);
    const res = buildPerimeterMesh(m, spec, slopedGround);
    expect(res.runs).toBe(2); // 2 gates split the closed loop into 2 continuous runs
    expect(res.towers).toBeGreaterThanOrEqual(4); // at least the 4 corners
    expect(res.gates).toBe(2);

    const { vertices, indices } = m.arrays();
    expect(indices.length).toBeGreaterThan(500);
    const f = new Float32Array(vertices);
    const b = new Uint8Array(vertices);
    const s = new Uint16Array(vertices);
    const n = vertices.byteLength / STRIDE;
    let hasMud = false;
    let hasRoof = false;
    let maxBaseGap = -Infinity;
    for (let i = 0; i < n; i++) {
      expect(s[i * 14 + 13]).toBe(17);
      const mat = b[i * STRIDE + 24];
      if (mat === MAT.mud) hasMud = true;
      if (mat === MAT.claytile) hasRoof = true;
      const x = f[i * 7];
      const y = f[i * 7 + 1];
      const z = f[i * 7 + 2];
      const gz = slopedGround.at(x, y);
      // Every vertex lies within reasonable vertical bounds around local ground (skirt to tower pavilion roof).
      expect(z).toBeGreaterThan(gz - 6);
      expect(z).toBeLessThan(gz + 18);
      if (z < gz) maxBaseGap = Math.max(maxBaseGap, gz - z);
    }
    expect(hasMud).toBe(true);
    expect(hasRoof).toBe(true);
    // Deep foundation skirt goes at least 1.5 m below local terrain so slopes never leave floating undersides.
    expect(maxBaseGap).toBeGreaterThan(1.5);
  });

  it('handles village enclosures (fence, hedge, palisade, bank) and optional outer moats', () => {
    const ring: [number, number][] = [
      [-35, -30],
      [35, -30],
      [35, 30],
      [-35, 30],
    ];
    for (const kind of ['fence', 'hedge', 'palisade', 'bank'] as const) {
      const m = new Mesh(4096);
      const res = buildPerimeterMesh(
        m,
        { ring, gates: [{ x: 0, y: -30, dx: 0, dy: -1, width: 4 }], kind, height: 2.2, thickness: 1.2, moat: kind === 'bank' ? 4 : undefined, entity: 5, seed: 3 },
        slopedGround,
      );
      expect(res.runs, kind).toBe(1);
      expect(res.gates, kind).toBe(1);
      expect(m.arrays().indices.length, kind).toBeGreaterThan(50);
    }
  });
});
