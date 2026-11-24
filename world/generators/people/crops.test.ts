// Regional, seasonal crops as plants (crops.ts): sown along macro-domain angled rows, matched to FieldPalette slots,
// clear of balks and domain headlands, with distinct botanical archetypes.
import { describe, expect, it } from 'vitest';
import { buildFieldPalette, PLOT, PLOT_LOOK, plotAt, plotSlotIndex, plotStyle, type FieldPalette } from '../../../core/plots.ts';
import { MAT, Mesh, STRIDE } from '../city/kit.ts';
import { CROP_LONG, CROP_VARIANTS, drawCrop, sow, type CropParams, type Sown } from './crops.ts';

const P: CropParams = { row: 0.7, apart: 0.42, wide: 0.5, green: [0.35, 0.75], ripe: [0.7, 1.1], length: 1.7 };
const STYLE = plotStyle({ kind: 'blocks', plot: 0.5 });

const HAN_JUNE: FieldPalette = buildFieldPalette(
  [
    { kind: 'millet', name: 'Foxtail millet', season: 'summer', share: 'staple' },
    { kind: 'wheat', name: 'Winter wheat', season: 'winter', share: 'secondary' },
    { kind: 'soybean', name: 'Soybeans', season: 'summer', share: 'minor' },
    { kind: 'hemp', name: 'Hemp', season: 'summer', share: 'minor' },
  ],
  6,
  36.5,
  STYLE.kind,
);

function sown(x0: number, y0: number, x1: number, y1: number, long = false, palette = HAN_JUNE): Sown[] {
  const out: Sown[] = [];
  sow(x0, y0, x1, y1, STYLE, P, long, 77, (s) => out.push(s), palette);
  return out;
}

describe("a field's crop, as plants", () => {
  it('stands in angled domain rows, only on cropped/stubble slots, clear of balks and domain edges', () => {
    const all = sown(-60, -60, 60, 60);
    expect(all.length).toBeGreaterThan(5000);
    const archetypes = new Set<string>();
    for (const s of all) {
      expect(s.x >= -60 && s.x < 60 && s.y >= -60 && s.y < 60).toBe(true);
      const at = plotAt(s.x, s.y, STYLE);
      const slotIdx = plotSlotIndex(at.pick, HAN_JUNE);
      expect(s.slot).toBe(slotIdx);
      expect(HAN_JUNE.slots[slotIdx].state).not.toBe(PLOT.ploughed);
      expect(HAN_JUNE.slots[slotIdx].state).not.toBe(PLOT.fallow);
      expect(at.edge).toBeGreaterThan(PLOT_LOOK.balk - 0.05);
      // Encoded slot in upper 3 bits of tint matches slotIdx.
      expect(s.tint >> 5).toBe(slotIdx);
      expect(s.tint).toBeLessThan(255);
      expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1, 5);
      archetypes.add(s.archetype);
    }
    // Han June landscape produces multiple distinct botanical archetypes (millet, cereal, stubble, broadleaf/cane).
    expect(archetypes.size).toBeGreaterThanOrEqual(2);
  });

  it('sows no place twice and leaves none out, whichever squares of ground are asked for', () => {
    const whole = sown(-30, -20, 30, 20);
    const parts = [...sown(-30, -20, 0, 20), ...sown(0, -20, 30, 0), ...sown(0, 0, 30, 20)];
    const key = (s: Sown) => `${s.x.toFixed(4)},${s.y.toFixed(4)}`;
    expect(parts.length).toBe(whole.length);
    expect(new Set(parts.map(key))).toEqual(new Set(whole.map(key)));
    expect(new Set(whole.map(key)).size).toBe(whole.length);
    expect(sown(-30, -20, 30, 20)).toEqual(whole);
  });

  it('is a length of row at a time from a way off, no nearer a balk than half its length', () => {
    const lengths = sown(-60, -60, 60, 60, true);
    const plants = sown(-60, -60, 60, 60);
    expect(lengths.length).toBeGreaterThan(0);
    expect(lengths.length).toBeLessThan(plants.length * 0.5);
    for (const s of lengths) {
      expect(s.variant & CROP_LONG).toBe(CROP_LONG);
      expect(s.archetype).not.toBe('stubble');
      expect(plotAt(s.x, s.y, STYLE).edge).toBeGreaterThan(PLOT_LOOK.balk + P.length * 0.5 - 0.08);
    }
    for (const s of plants) expect(s.variant).toBeLessThan(CROP_VARIANTS);
  });

  it('draws distinct botanical stands for every crop archetype and stubble within a tight triangle budget', () => {
    for (const arch of ['millet', 'cereal', 'cane', 'paddy', 'broadleaf', 'vine', 'orchard', 'stubble'] as const) {
      for (const variant of [0, CROP_LONG]) {
        const m = new Mesh(256);
        drawCrop(m, P, variant, arch);
        const { vertices, indices } = m.arrays();
        const b = new Uint8Array(vertices);
        const n = vertices.byteLength / STRIDE;
        expect(indices.length, `${arch} v=${variant}`).toBeGreaterThan(0);
        let hasCropCard = false;
        for (let i = 0; i < n; i++) {
          if (b[i * STRIDE + 24] === MAT.cropCard) hasCropCard = true;
        }
        expect(hasCropCard, `${arch} should emit cropCard foliage`).toBe(true);
        if (arch !== 'orchard' && arch !== 'vine') {
          expect(indices.length / 3).toBeLessThanOrEqual(variant & CROP_LONG ? 16 : 6);
        }
      }
    }
  });
});
