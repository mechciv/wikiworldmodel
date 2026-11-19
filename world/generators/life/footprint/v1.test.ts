import { describe, expect, it } from 'vitest';
import { isFootprint, type Footprint } from '../../../../core/footprint.ts';
import { footprintDepth, footprintSection } from './v1.ts';

const f: Footprint = { specimen: 'synthetic', side: 'right', length_mm: 200, width_mm: 100, heel_width_mm: 65 };
describe('a measured footprint', () => {
  it('fits the heel and forefoot to their measured widths and stops at the measured length', () => {
    expect(footprintSection(f, .16 * f.length_mm)[1] * 2).toBeCloseTo(f.heel_width_mm);
    expect(footprintSection(f, .68 * f.length_mm)[1] * 2).toBeCloseTo(f.width_mm);
    for (const y of [-1, 0, f.length_mm, f.length_mm + 1]) expect(footprintSection(f, y)[1]).toBe(0);
    for (let i = 0; i <= 100; i++) expect(footprintSection(f, i * f.length_mm / 100)[1] * 2).toBeLessThanOrEqual(f.width_mm);
    expect(footprintDepth(.18, 0)).toBeGreaterThan(footprintDepth(.4, 0));
    expect(footprintDepth(.18, 1)).toBe(0);
  });
  it('mirrors handedness and rejects missing or impossible measurements', () => {
    const right = footprintSection(f, 70);
    expect(footprintSection({ ...f, side: 'left' }, 70)).toEqual([-right[0], right[1]]);
    expect(isFootprint(f)).toBe(true);
    for (const change of [{ specimen: '' }, { length_mm: 0 }, { heel_width_mm: 110 }, { width_mm: NaN }, { side: 'unknown' }])
      expect(isFootprint({ ...f, ...change })).toBe(false);
  });
});
