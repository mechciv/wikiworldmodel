// The field a ground's materials are sorted by, read here as the renderer reads it: each material lies over the share
// of the ground its sources give it, and what a ground bears follows from what it is made of.
import { describe, expect, it } from 'vitest';
import { GROUND_MATERIALS, type GroundMaterial, type SceneSubstrate } from '../../../core/substrate.ts';
import { GroundSort, meanBears, NOISE_SIZE, noiseByte, SORT_EDGE, sorting, sortingBands, type Bears } from './sorting.ts';

const ground = (materials: [GroundMaterial, number][], from: SceneSubstrate['from'] = 'rocks', marks: SceneSubstrate['marks'] = [], weight = 1): SceneSubstrate => ({ tier: 'evidence', from, weight, materials, colours: [], marks, source: 'src:test', rows: [], sites: 1, km: 0 });
const BEARS: Bears = { evaporite: 0.03, cracked: 0.1 };

/** The field over a square of ground some hundreds of metres across, every metre and a bit. */
const samples = (): number[] => {
  const out: number[] = [];
  for (let y = -300; y < 300; y += 1.3) for (let x = -300; x < 300; x += 1.3) out.push(sorting(x, y));
  return out;
};

describe('the sorting of a ground', () => {
  it('reads a noise that repeats, each value a byte', () => {
    for (const [x, y, z, c] of [[0, 0, 0, 0], [63, 63, 63, 3], [17, 40, 20, 1]]) {
      const b = noiseByte(x, y, z, c);
      expect(Number.isInteger(b) && b >= 0 && b <= 255).toBe(true);
    }
    expect(NOISE_SIZE).toBe(64);
    // The same place gives the same value, and the field stays between 0 and 1.
    expect(sorting(12.5, -7.25)).toBe(sorting(12.5, -7.25));
    for (const u of samples().slice(0, 5000)) expect(u >= 0 && u <= 1).toBe(true);
  });

  it('gives each material the share of the ground its sources give it', () => {
    const want: [GroundMaterial, number][] = [['gravel', 0.15], ['sand', 0.45], ['mud', 0.3], ['evaporite', 0.1]];
    const shares = new Float32Array(GROUND_MATERIALS.length);
    for (const [m, s] of want) shares[GROUND_MATERIALS.indexOf(m)] = s;
    const bands = sortingBands(shares);
    const all = samples();
    for (const [m, share] of want) {
      const i = GROUND_MATERIALS.indexOf(m);
      const got = all.filter((u) => u >= bands[i * 2] && u < bands[i * 2 + 1]).length / all.length;
      // The field as it lies over one square of ground, against its quantiles as they were drawn: within a few hundredths.
      expect(Math.abs(got - share)).toBeLessThan(0.04);
    }
  });

  it('says how stony a place is: all of it on a sheet of gravel, none off it, and nothing where no gravel is', () => {
    const sheet = new GroundSort(ground([['gravel', 0.25], ['sand', 0.75]]), BEARS);
    expect(sheet.stones).toBe(true);
    let on = 0;
    let n = 0;
    for (let y = -200; y < 200; y += 1.7) {
      for (let x = -200; x < 200; x += 1.7) {
        const s = sheet.stonyAt(x, y);
        expect(s >= 0 && s <= 1).toBe(true);
        on += s;
        n++;
      }
    }
    expect(Math.abs(on / n - 0.25)).toBeLessThan(0.04);
    // A topsoil from a map: its stones scattered through it, about their share of the ground in all, never all of it.
    const soil = new GroundSort(ground([['gravel', 0.2], ['sand', 0.5], ['mud', 0.3]], 'soil'), BEARS);
    let most = 0;
    on = 0;
    n = 0;
    for (let y = -200; y < 200; y += 1.7) {
      for (let x = -200; x < 200; x += 1.7) {
        const s = soil.stonyAt(x, y);
        on += s;
        most = Math.max(most, s);
        n++;
      }
    }
    expect(Math.abs(on / n - 0.2)).toBeLessThan(0.04);
    expect(most).toBeCloseTo(0.4, 6);
    const none = new GroundSort(ground([['sand', 1]]), BEARS);
    expect(none.stones).toBe(false);
    expect(none.stonyAt(3, 4)).toBe(0);
    expect(new GroundSort(undefined, BEARS).stonyAt(3, 4)).toBe(0);
  });

  it('says what a ground bears: all its climate grows, unless what it is made of bears less', () => {
    expect(meanBears(undefined, BEARS)).toBe(1);
    expect(meanBears(ground([['sand', 0.6], ['mud', 0.4]]), BEARS)).toBe(1);
    expect(meanBears(ground([['evaporite', 1]]), BEARS)).toBeCloseTo(0.03, 6);
    expect(meanBears(ground([['evaporite', 1]]), undefined)).toBe(1);
    // A mud bears as a cracked one as far as it is drawn cracked: all of it once a third of what was said names cracks.
    expect(meanBears(ground([['mud', 1]], 'rocks', [['cracks', 1]]), BEARS)).toBeCloseTo(0.1, 6);
    expect(meanBears(ground([['mud', 1]], 'rocks', [['cracks', 1 / 6]]), BEARS)).toBeCloseTo(0.55, 6);
    expect(meanBears(ground([['lime', 0.5], ['sand', 0.5]], 'rocks', [['cracks', 0.5]]), BEARS)).toBeCloseTo(0.55, 6);
    // A ground that decides only part of what is drawn takes only that part of it.
    expect(meanBears(ground([['evaporite', 1]], 'rocks', [], 0.5), BEARS)).toBeCloseTo(0.515, 6);
    // Each material bears its own where it lies, and the mean of that over the ground is the ground's.
    const mixed = new GroundSort(ground([['sand', 0.5], ['evaporite', 0.5]]), BEARS);
    expect(mixed.barren).toBe(true);
    let sum = 0;
    let n = 0;
    let low = 0;
    let high = 0;
    for (let y = -200; y < 200; y += 1.7) {
      for (let x = -200; x < 200; x += 1.7) {
        const b = mixed.bearsAt(x, y);
        sum += b;
        if (b < 0.04) low++;
        if (b > 0.99) high++;
        n++;
      }
    }
    expect(Math.abs(sum / n - mixed.bears)).toBeLessThan(0.04);
    // Nearly all of the ground is one or the other: the edge between them is narrow.
    expect((low + high) / n).toBeGreaterThan(0.85);
    expect(SORT_EDGE).toBeLessThan(0.05);
  });
});
