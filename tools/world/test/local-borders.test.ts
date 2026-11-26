import { describe, expect, it } from 'vitest';
import { LocalBorders } from '../../../viewer/src/city/local-borders.ts';
import { toLocal } from '../../../core/city.ts';

describe('local political map', () => {
  it('clips the work to nearby borders and picks the same polygons on either side, including holes', () => {
    const row = {
      name: 'State',
      from: 100,
      to: 200,
      area: 2000,
      at: [0, 0] as [number, number],
      rings: [
        [-200, -200, 200, -200, 200, 200, -200, 200],
        [-50, -50, -50, 50, 50, 50, 50, -50],
      ],
    };
    const map = new LocalBorders({ lat: 0, lon: 0 }, [row]);
    expect(map.at(1, 0)).toBe(row);
    expect(map.at(0, 0)).toBeUndefined();
    expect(map.at(2.01, 0)).toBeUndefined();
    expect(map.segments).toContainEqual({ row, coords: [...toLocal({ lat: 0, lon: 0 }, -2, 2), ...toLocal({ lat: 0, lon: 0 }, 2, 2)] });
  });
});
