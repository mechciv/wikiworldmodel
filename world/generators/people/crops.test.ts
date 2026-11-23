// The crop of the fields, as plants (crops.ts): sown in rows along each plot that is under a crop, clear of its balks,
// the same from whichever square of ground is asked for; one plain stand, which names no crop.
import { describe, expect, it } from 'vitest';
import { PLOT, PLOT_LOOK, plotAt, plotStyle } from '../../../core/plots.ts';
import { MAT, Mesh, STRIDE } from '../city/kit.ts';
import { CROP_LONG, CROP_VARIANTS, drawCrop, sow, type CropParams, type Sown } from './crops.ts';

const P: CropParams = { row: 0.7, apart: 0.42, wide: 0.5, green: [0.35, 0.75], ripe: [0.7, 1.1], length: 1.7 };
const STYLE = plotStyle({ kind: 'blocks', plot: 0.5 });

function sown(x0: number, y0: number, x1: number, y1: number, long = false): Sown[] {
  const out: Sown[] = [];
  sow(x0, y0, x1, y1, STYLE, P, long, 77, (s) => out.push(s));
  return out;
}

describe("a field's crop, as plants", () => {
  it('stands in rows along its plot, in plots under a crop only, clear of their balks', () => {
    const all = sown(-60, -60, 60, 60);
    expect(all.length).toBeGreaterThan(10000);
    const rows = new Set<number>();
    for (const s of all) {
      expect(s.x >= -60 && s.x < 60 && s.y >= -60 && s.y < 60).toBe(true);
      const at = plotAt(s.x, s.y, STYLE);
      expect([PLOT.ripe, PLOT.green]).toContain(at.state);
      expect(at.edge).toBeGreaterThan(PLOT_LOOK.balk - 0.03);
      // On a row: a tenth of the way to the next at most, as a hand sows.
      const off = at.across / P.row - 0.5;
      expect(Math.abs(off - Math.round(off))).toBeLessThan(0.1);
      rows.add(Math.round(off));
      // As tall as its plot's stand, ripe or green; its tint says which, with the plot's tone.
      const range = at.state === PLOT.ripe ? P.ripe : P.green;
      expect(s.tall).toBeGreaterThan(range[0] * 0.85);
      expect(s.tall).toBeLessThan(range[1] * 1.15);
      expect(s.tint >= 128).toBe(at.state === PLOT.ripe);
      expect(s.tint).toBeLessThan(255);
      expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1, 6);
      // Its row runs along the plot's longer side, north and south, as far as the plots' lines wander.
      expect(Math.abs(s.dy)).toBeGreaterThan(0.9);
    }
    // Rows 0.7 m apart across 120 m of ground, less what is ploughed or fallow.
    expect(rows.size).toBeGreaterThan(100);
    // About as many as its rows and their plants give, in the three plots in four that are under a crop.
    const under = PLOT_LOOK.shares.green;
    expect(all.length).toBeGreaterThan(((120 * 120) / (P.row * P.apart)) * under * 0.6);
    expect(all.length).toBeLessThan(((120 * 120) / (P.row * P.apart)) * under * 1.2);
  });

  it('sows no place twice and leaves none out, whichever squares of ground are asked for', () => {
    const whole = sown(-30, -20, 30, 20);
    const parts = [...sown(-30, -20, 0, 20), ...sown(0, -20, 30, 0), ...sown(0, 0, 30, 20)];
    const key = (s: Sown) => `${s.x.toFixed(4)},${s.y.toFixed(4)}`;
    expect(parts.length).toBe(whole.length);
    expect(new Set(parts.map(key))).toEqual(new Set(whole.map(key)));
    expect(new Set(whole.map(key)).size).toBe(whole.length);
    // And the same again, asked again.
    expect(sown(-30, -20, 30, 20)).toEqual(whole);
  });

  it('is a length of row at a time from a way off, each along its row, no nearer a balk than half its length', () => {
    const lengths = sown(-60, -60, 60, 60, true);
    const plants = sown(-60, -60, 60, 60);
    expect(lengths.length).toBeGreaterThan(plants.length / ((P.length / P.apart) * 1.6));
    expect(lengths.length).toBeLessThan(plants.length / ((P.length / P.apart) * 0.7));
    for (const s of lengths) {
      expect(s.variant & CROP_LONG).toBe(CROP_LONG);
      expect(plotAt(s.x, s.y, STYLE).edge).toBeGreaterThan(PLOT_LOOK.balk + P.length * 0.5 - 0.05);
    }
    for (const s of plants) expect(s.variant).toBeLessThan(CROP_VARIANTS);
  });

  it('is one plain stand a metre tall, of cards of blades in a material of its own: a clump, or a length of row along y', () => {
    for (let variant = 0; variant < 2 * CROP_VARIANTS; variant++) {
      const m = new Mesh(64);
      drawCrop(m, P, variant);
      const { vertices, indices } = m.arrays();
      const f = new Float32Array(vertices);
      const b = new Uint8Array(vertices);
      const n = vertices.byteLength / STRIDE;
      expect(indices.length).toBeGreaterThan(0);
      let far = 0;
      for (let i = 0; i < n; i++) {
        expect(b[i * STRIDE + 24]).toBe(MAT.cropCard);
        // Its tint is each plant's own to give: the mesh has none.
        expect(b[i * STRIDE + 25]).toBe(0);
        expect(f[i * 7 + 2]).toBeGreaterThanOrEqual(0);
        expect(f[i * 7 + 2]).toBeLessThanOrEqual(1.01);
        expect(Math.abs(f[i * 7])).toBeLessThan(P.wide);
        far = Math.max(far, Math.abs(f[i * 7 + 1]));
      }
      if (variant & CROP_LONG) {
        expect(far).toBeGreaterThan(P.length * 0.45);
        expect(far).toBeLessThan(P.length * 0.75);
      } else expect(far).toBeLessThan(P.wide);
      // A few cards: it is drawn by the ten thousand.
      expect(indices.length / 3).toBeLessThanOrEqual(variant & CROP_LONG ? 16 : 6);
    }
  });
});
