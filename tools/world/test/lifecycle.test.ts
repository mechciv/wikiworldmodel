// Unit tests for living-scene lifecycle stability (spatial hysteresis, context matching,
// LRU standby caching) and damped stream budget / staggered LOD transitions.
import { describe, expect, it } from 'vitest';
import { lifeKeepRadius, sameLifeContext, SceneCache } from '../../../viewer/src/city/lifecycle.ts';
import { lodDetail, stepKeepBudget } from '../../../world/generators/life/stream.ts';

describe('living-scene spatial hysteresis and context matching', () => {
  it('keeps an active scene continuously past a 0.1° lattice border across all altitudes', () => {
    // Half a 0.1° latitude cell is ~5.55 km; the keep radius must strictly exceed it even at ground level.
    expect(lifeKeepRadius(0)).toBe(7_500);
    expect(lifeKeepRadius(1_000)).toBe(7_500);
    expect(lifeKeepRadius(5_000)).toBe(7_500);
    expect(lifeKeepRadius(-200)).toBe(7_500);
    expect(lifeKeepRadius(Number.NaN)).toBe(7_500);

    // Scales smoothly with altitude and caps inside the scene extent.
    expect(lifeKeepRadius(20_000)).toBe(10_000);
    expect(lifeKeepRadius(30_000)).toBe(15_000);
    expect(lifeKeepRadius(48_000)).toBe(24_000);
    expect(lifeKeepRadius(100_000)).toBe(24_000);

    // Strictly monotonic, with no abrupt cliff around 30 km.
    let prev = lifeKeepRadius(0);
    for (let r = 1_000; r <= 80_000; r += 1_000) {
      const cur = lifeKeepRadius(r);
      expect(cur).toBeGreaterThanOrEqual(prev);
      expect(cur - prev).toBeLessThanOrEqual(500);
      prev = cur;
    }
  });

  it('matches context across spatial lattice neighbors while rejecting temporal, seasonal, anthrome, or shore changes', () => {
    const base = '-500|33.60|117.50|7|-200|shore-a';
    expect(sameLifeContext(base, '-500|33.70|117.60|7|-200|shore-a')).toBe(true);
    expect(sameLifeContext(base, '-500|33.60|117.50|7|-200|shore-a')).toBe(true);
    // Different time bin, month, anthrome step, or shore breaks context match.
    expect(sameLifeContext(base, '-1000|33.60|117.50|7|-200|shore-a')).toBe(false);
    expect(sameLifeContext(base, '-500|33.60|117.50|1|-200|shore-a')).toBe(false);
    expect(sameLifeContext(base, '-500|33.60|117.50|7|1000|shore-a')).toBe(false);
    expect(sameLifeContext(base, '-500|33.60|117.50|7|-200|shore-b')).toBe(false);
    // Malformed keys fall back to exact equality.
    expect(sameLifeContext('short', 'short')).toBe(true);
    expect(sameLifeContext('short', 'other')).toBe(false);
  });
});

describe('SceneCache LRU standby cache', () => {
  it('evicts least-recently-used entries, refreshes recency on get, and promotes without eviction on take', () => {
    const evicted: string[] = [];
    const cache = new SceneCache<string>(3, (v, k) => evicted.push(`${k}:${v}`));

    cache.set('a', 'A');
    cache.set('b', 'B');
    cache.set('c', 'C');
    expect(cache.size).toBe(3);
    expect(evicted).toEqual([]);

    // Touch 'a' so 'b' becomes the oldest entry.
    expect(cache.get('a')).toBe('A');
    cache.set('d', 'D');
    expect(evicted).toEqual(['b:B']);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);

    // take() removes and returns without triggering onEvict.
    expect(cache.take('c')).toBe('C');
    expect(cache.has('c')).toBe(false);
    expect(cache.size).toBe(2);
    expect(evicted).toEqual(['b:B']);

    // Overwriting an existing key with a new object evicts the previous value.
    cache.set('a', 'A2');
    expect(evicted).toEqual(['b:B', 'a:A']);
    expect(cache.get('a')).toBe('A2');

    // Re-inserting the exact same object reference refreshes recency without evicting it.
    cache.set('a', 'A2');
    expect(evicted).toEqual(['b:B', 'a:A']);

    // clear() evicts all remaining entries.
    cache.clear();
    expect(cache.size).toBe(0);
    expect(evicted).toEqual(['b:B', 'a:A', 'd:D', 'a:A2']);
  });

  it('handles zero-capacity cache and invalid negative capacity', () => {
    const evicted: string[] = [];
    const zero = new SceneCache<number>(0, (_v, k) => evicted.push(k));
    zero.set('x', 1);
    expect(zero.size).toBe(0);
    expect(evicted).toEqual(['x']);
    expect(() => new SceneCache(-1)).toThrow();
  });
});

describe('SceneStream damped budget controller and staggered LOD', () => {
  it('never mutates keep during incomplete time-sliced passes', () => {
    const start = { keep: 0.7, belowStreak: 2, unsettled: 1 };
    // Even if usage is way below 55% or above 100%, an incomplete slice must not change keep.
    const low = stepKeepBudget(start, 100, 1_000, 50_000, 1_000_000, true);
    expect(low.keep).toBe(0.7);
    expect(low.belowStreak).toBe(0);
    expect(low.needsPass).toBe(false);

    const high = stepKeepBudget(start, 90_000, 2_000_000, 50_000, 1_000_000, true);
    expect(high.keep).toBe(0.7);
    expect(high.needsPass).toBe(false);
  });

  it('eliminates limit-cycle oscillation with a 55%..95% deadband and 3-pass relaxation hysteresis', () => {
    // Simulate a dense scene whose raw load at keep=1 is 120% of cap (scales linearly with keep).
    const capI = 50_000;
    const capT = 1_000_000;
    let state = { keep: 1, belowStreak: 0, unsettled: 0 };
    const history: number[] = [];
    for (let step = 0; step < 40; step++) {
      const instances = Math.round(capI * 1.2 * state.keep);
      const triangles = Math.round(capT * 0.8 * state.keep);
      const next = stepKeepBudget(state, instances, triangles, capI, capT, false);
      state = { keep: next.keep, belowStreak: next.belowStreak, unsettled: next.unsettled };
      history.push(state.keep);
    }
    // Should tighten monotonically into the deadband (~0.729) and stay rock-steady thereafter.
    expect(history[0]).toBeLessThan(1);
    const tail = history.slice(10);
    expect(new Set(tail).size).toBe(1);
    expect(tail[0]).toBeGreaterThanOrEqual(0.2);
    expect(tail[0]).toBeLessThan(0.8);

    // When load drops well below 55%, keep waits 3 settled passes before relaxing gently (* 1.06).
    const relaxedStart = state.keep;
    const p1 = stepKeepBudget(state, 10_000, 100_000, capI, capT, false);
    expect(p1.keep).toBe(relaxedStart);
    expect(p1.belowStreak).toBe(1);
    expect(p1.needsPass).toBe(false);

    const p2 = stepKeepBudget(p1, 10_000, 100_000, capI, capT, false);
    expect(p2.keep).toBe(relaxedStart);
    expect(p2.belowStreak).toBe(2);
    expect(p2.needsPass).toBe(false);

    const p3 = stepKeepBudget(p2, 10_000, 100_000, capI, capT, false);
    expect(p3.keep).toBeGreaterThan(relaxedStart);
    expect(p3.keep).toBeLessThanOrEqual(1);
    expect(p3.belowStreak).toBe(0);
    expect(p3.needsPass).toBe(true);
  });

  it('staggers LOD tier thresholds across a deterministic ±15% band instead of a single cliff', () => {
    // Right at the nominal high threshold (70 px), low-jitter instances have already upgraded to
    // detail 2 while high-jitter instances remain at detail 1.
    expect(lodDetail(70, 0.0, false, false)).toBe(2);
    expect(lodDetail(70, 1.0, false, false)).toBe(1);
    // Well below 70 * 0.85 = 59.5 -> all instances are <= 1; well above 70 * 1.15 = 80.5 -> all are 2.
    expect(lodDetail(58, 0.0, false, false)).toBe(1);
    expect(lodDetail(82, 1.0, false, false)).toBe(2);

    // Around nominal mid threshold (9 px): staggered between detail 0 and 1.
    expect(lodDetail(9, 0.0, false, false)).toBe(1);
    expect(lodDetail(9, 1.0, false, false)).toBe(0);
    expect(lodDetail(7, 0.0, false, false)).toBe(0);
    expect(lodDetail(11, 1.0, false, false)).toBe(1);

    // Fast mode caps at detail 1 and staggers around fastMid (26 px).
    expect(lodDetail(120, 0.0, true, false)).toBe(1);
    expect(lodDetail(26, 0.0, true, false)).toBe(1);
    expect(lodDetail(26, 1.0, true, false)).toBe(0);

    // Rich (still) mode shifts thresholds lower.
    expect(lodDetail(40, 0.5, false, true)).toBe(2);
    expect(lodDetail(40, 0.5, false, false)).toBe(1);
  });
});
