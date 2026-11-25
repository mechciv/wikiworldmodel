import { describe, expect, it } from 'vitest';
import type { SearchEntry } from '../../../core/records.ts';
import { catalog, regionAt } from '../../../viewer/src/history/catalog.ts';

const estimate = (best: number | null) => ({ best, lo: -Infinity, hi: Infinity, derived: false });
const egypt: SearchEntry = {
  id: 'people/polities/egypt-old-kingdom',
  kind: 'polity',
  label: 'Old Kingdom of Egypt',
  located: false,
  time: { start: estimate(-2666), end: estimate(null), instant: false },
};
describe('the world history atlas', () => {
  it('joins a reference to its explicit record once and keeps its chronology when the build lacks that record', () => {
    const current = catalog({ entities: [egypt] });
    const oldKingdom = current.filter((e) => e.reference?.modelId === egypt.id);
    expect(oldKingdom).toHaveLength(1);
    expect(oldKingdom[0]).toMatchObject({ id: egypt.id, status: 'record', start: -2674, end: -2189 });
    const old = catalog({ entities: [] }).find((e) => e.reference?.modelId === egypt.id);
    expect(old).toMatchObject({ status: 'reference', start: -2674, end: -2189 });
  });

  it('preserves gaps in border observations and leaves undated records undated', () => {
    const row: SearchEntry = {
      ...egypt,
      id: 'src:borders#one',
      label: 'Example',
      dataset: 'src:borders',
      time: { start: estimate(1), end: estimate(20), instant: false },
      places: [
        [15, 20, 30, 30, 1],
        [1, 4, 30, 30, 2],
        [4, 10, 30, 30, 2],
      ],
    };
    const unknown: SearchEntry = { ...egypt, id: 'test', time: { start: estimate(null), end: estimate(null), instant: false } };
    const entries = catalog({ entities: [unknown], rows: [row] });
    expect(entries.find((e) => e.id === row.id)).toMatchObject({
      status: 'border',
      ranges: [
        [1, 10],
        [15, 20],
      ],
    });
    expect(entries.find((e) => e.id === 'test')).toMatchObject({ start: null, end: null });
    expect(regionAt(178, -18)).toBe('Oceania');
    expect(regionAt(-71, -13)).toBe('South America');
  });
});
