// Physical 3D fieldworks draped on terrain (fieldworks.ts): parcel bunds, walls, hedges, contour terrace risers,
// and field-margin tree placements.
import { describe, expect, it } from 'vitest';
import { plotStyle } from '../../../core/plots.ts';
import { MAT, Mesh, STRIDE } from '../city/kit.ts';
import { buildFieldworks, type FieldUseSampler, type GroundHeight } from './fieldworks.ts';

const flatGround: GroundHeight = { at: () => 10 };
// A smooth foothill slope (~18% grade -> slope ≈ 0.177, right inside terrace band).
const hillGround: GroundHeight = { at: (x, y) => 20 + x * 0.16 + Math.sin(y * 0.015) * 4 };

const allCrops: FieldUseSampler = {
  at(_x, _y, out) {
    out.crop = 0.9;
    out.pasture = 0;
    out.yard = 0;
    out.paddy = 0;
  },
};

const mixedUse: FieldUseSampler = {
  at(x, y, out) {
    // Yard disc at origin: no fieldworks should appear inside it.
    const inYard = Math.hypot(x, y) < 35;
    out.crop = inYard ? 0 : 0.85;
    out.pasture = 0;
    out.yard = inYard ? 0.9 : 0;
    out.paddy = 0;
  },
};

describe('3D terrain-draped fieldworks', () => {
  it('extrudes earthen bunds, stone walls, hedges and dikes on flat cropland with skirts below terrain', () => {
    const style = plotStyle({ kind: 'blocks', plot: 0.4 });
    for (const [bounds, expectMat] of [
      ['banks', MAT.earth],
      ['walls', MAT.rubble],
      ['hedges', MAT.broad],
      ['dikes', MAT.earth],
    ] as const) {
      const m = new Mesh(4096);
      const res = buildFieldworks(m, { style, bounds, radius: 140, seed: 42 }, flatGround, allCrops);
      expect(res.runs, bounds).toBeGreaterThan(0);
      const { vertices, indices } = m.arrays();
      expect(indices.length, bounds).toBeGreaterThan(0);
      const f = new Float32Array(vertices);
      const b = new Uint8Array(vertices);
      const n = vertices.byteLength / STRIDE;
      let hasMat = false;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        const z = f[i * 7 + 2];
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
        if (b[i * STRIDE + 24] === expectMat) hasMat = true;
      }
      expect(hasMat, bounds).toBe(true);
      // Skirt goes below flat ground (10 m) and crest rises cleanly above it.
      expect(minZ, bounds).toBeLessThan(9.7);
      expect(maxZ, bounds).toBeGreaterThan(10.2);
    }
  });

  it('builds contour-following 3D terrace retaining risers on moderate hillside cropland and keeps clear of yards', () => {
    const style = plotStyle({ kind: 'blocks', plot: 0.5 });
    const m = new Mesh(4096);
    const res = buildFieldworks(m, { style, bounds: 'banks', radius: 140, seed: 99 }, hillGround, mixedUse);
    expect(res.runs).toBeGreaterThan(2);
    const { vertices, indices } = m.arrays();
    expect(indices.length).toBeGreaterThan(100);
    const f = new Float32Array(vertices);
    const n = vertices.byteLength / STRIDE;
    for (let i = 0; i < n; i++) {
      const x = f[i * 7];
      const y = f[i * 7 + 1];
      // No vertices generated inside the central yard core (allowing 1 cell margin).
      expect(Math.hypot(x, y)).toBeGreaterThan(24);
    }
  });

  it('places deterministic boundary trees along hedge/bank field margins', () => {
    const style = plotStyle({ kind: 'blocks', plot: 0.4 });
    const m1 = new Mesh(2048);
    const m2 = new Mesh(2048);
    const r1 = buildFieldworks(m1, { style, bounds: 'hedges', radius: 160, seed: 7 }, flatGround, allCrops);
    const r2 = buildFieldworks(m2, { style, bounds: 'hedges', radius: 160, seed: 7 }, flatGround, allCrops);
    expect(r1.trees.length).toBeGreaterThan(0);
    expect(r1.trees).toEqual(r2.trees);
  });
});
