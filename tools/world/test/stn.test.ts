import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { conflictChanged, conflictSplice, ORIGIN, Pieces, solve, solveChanged, solveSplice, type Bounds, type Constraint } from '../../../core/stn.ts';

const c = (source: string, from: string, to: string, lo: number, hi: number): Constraint => ({ source, from, to, lo, hi });

describe('simple temporal network', () => {
  it('derives the tightest bounds', () => {
    const s = solve(['a', 'b'], [c('a-date', ORIGIN, 'a', 10, 20), c('b-after-a', 'a', 'b', 5, 7)]);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.bounds.get('b')).toMatchObject({ lo: 15, hi: 27 });
    expect(s.bounds.get('b')!.loBy).toEqual(['a-date', 'b-after-a']);
  });
  it('reports a minimal conflict: exactly the constraints on the negative cycle', () => {
    const s = solve(['a', 'b', 'c'], [
      c('a-date', ORIGIN, 'a', 100, 100),
      c('b-date', ORIGIN, 'b', 50, 60),
      c('b-after-a', 'a', 'b', 0, Infinity),
      c('c-unrelated', ORIGIN, 'c', 0, 1000),
    ]);
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(s.conflict.constraints.map((x) => x.source).sort()).toEqual(['a-date', 'b-after-a', 'b-date']);
    expect(s.conflict.slack).toBe(-40);
  });
  it('accepts equalities and zero-length cycles', () => {
    const s = solve(['a', 'b'], [c('eq', 'a', 'b', 0, 0), c('a', ORIGIN, 'a', 5, 5)]);
    expect(s.ok && s.bounds.get('b')).toMatchObject({ lo: 5, hi: 5 });
  });
});

/** A seeded network of several pieces that holds: each point has a hidden date, and every constraint allows it. */
function network(seed: number) {
  let x = seed;
  const rand = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const points = Array.from({ length: 40 }, (_, i) => `p${i}`);
  const date = new Map(points.map((p) => [p, Math.round(rand() * 1000)]));
  const constraints: Constraint[] = [];
  for (const p of points) if (rand() < 0.4) constraints.push(c(`${p}-date`, ORIGIN, p, date.get(p)! - Math.round(rand() * 50), date.get(p)! + Math.round(rand() * 50)));
  // Links within each of four pieces, so that a change reaches only its own.
  for (let k = 0; k < 60; k++) {
    const piece = Math.floor(rand() * 4);
    const [a, b] = [0, 1].map(() => points[piece * 10 + Math.floor(rand() * 10)]);
    if (a === b) continue;
    const gap = date.get(b)! - date.get(a)!;
    constraints.push(c(`link-${k}`, a, b, gap - Math.round(rand() * 30), rand() < 0.3 ? Infinity : gap + Math.round(rand() * 30)));
  }
  return { points, constraints, rand };
}

describe('a network changed in a few constraints', () => {
  it('solves as the whole network does, whether the change is made in place or whole, and whether or not parts are kept', () => {
    const pieces = new Pieces((d) => createHash('sha256').update(d).digest('base64'));
    let conflicts = 0;
    let held = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const base = network(seed);
      const sol = solve(base.points, base.constraints);
      expect(sol.ok).toBe(true);
      if (!sol.ok) continue;
      // Put new constraints where one of the base's stood: some hold, some do not.
      const at = Math.floor(base.rand() * base.constraints.length);
      const was = base.constraints[at];
      const shift = Math.round((base.rand() - 0.5) * 400);
      // Some join two pieces, which are then walked as one.
      const other = base.points[(base.points.indexOf(was.to) + 10) % base.points.length];
      const mine = [
        c(`${was.source}-picked`, was.from, was.to, was.lo + shift, was.hi + shift),
        ...(base.rand() < 0.5 ? [c('another', ORIGIN, was.to, -Infinity, 2000)] : []),
        ...(base.rand() < 0.3 ? [c('across', was.to, other, -5000, 5000)] : []),
      ];
      const splice = { at, count: 1, constraints: mine };
      const whole = [...base.constraints.slice(0, at), ...mine, ...base.constraints.slice(at + 1)];
      const fresh = solve(base.points, whole);
      const net = { points: base.points, constraints: base.constraints, bounds: sol.bounds };
      for (const changed of [solveChanged(net, base.points, whole), solveSplice(net, splice), solveSplice(net, splice, pieces), solveChanged(net, base.points, whole, pieces)]) {
        expect(changed!.ok).toBe(fresh.ok);
        if (!changed!.ok || !fresh.ok) {
          conflicts++;
          continue;
        }
        held++;
        const now: Bounds = new Map([...sol.bounds, ...changed!.changed]);
        expect(now).toEqual(fresh.bounds);
      }
      const conflict = conflictChanged(net, base.points, whole);
      expect(conflict === undefined).toBe(fresh.ok);
      expect(conflictSplice(net, splice)).toEqual(conflict);
      expect(conflictSplice(net, splice, pieces)).toEqual(conflict);
      // A copy of the network, made of other objects, holds the same parts: they are not worked out again.
      const copy = { ...net, constraints: base.constraints.map((x) => ({ ...x })) };
      const misses = pieces.misses;
      expect(solveSplice(copy, { ...splice, constraints: mine.map((x) => ({ ...x })) }, pieces)).toEqual(solveSplice(net, splice));
      expect(conflictSplice(copy, splice, pieces)).toEqual(conflict);
      expect(pieces.misses).toBe(misses);
    }
    // Both kinds were met.
    expect(conflicts).toBeGreaterThan(0);
    expect(held).toBeGreaterThan(0);
    expect(pieces.hits).toBeGreaterThan(0);
  });

  it('detects tight sub-day conflicts while keeping near-equal real-world rounding cycles consistent', async () => {
    const { dayNumberAt, dayOnAxis, parsePoint } = await import('../../../core/time.ts');
    // Sub-day contradiction (~53 minutes) must be reported rather than forgiven.
    const clash = solve(
      [ORIGIN, 'a', 'b'],
      [
        c('c1', ORIGIN, 'a', 100, 100),
        c('c2', ORIGIN, 'b', 100.0001, 100.0001),
        c('c3', 'a', 'b', -Infinity, -0.0002),
      ],
    );
    expect(clash.ok).toBe(false);
    if (!clash.ok) {
      const srcs = clash.conflict.constraints.map((x) => x.source);
      expect(srcs).toContain('c1');
      expect(srcs).toContain('c3');
    }

    // A cycle of exact-day calendar dates across leap and non-leap years accumulates float64 rounding
    // across 1/365 and 1/366 fractions, and must still hold as consistent.
    const d0 = parsePoint('28 February 1520 CE');
    const jdn0 = dayNumberAt(d0.t)!;
    const days = Array.from({ length: 12 }, (_, k) => dayOnAxis(jdn0 + k * 31));
    const dayPoints = days.map((_, k) => `d${k}`);
    const dayConstraints: Constraint[] = [c('anchor', ORIGIN, 'd0', days[0].t, days[0].t)];
    for (let k = 0; k < days.length - 1; k++) {
      const step = days[k + 1].t - days[k].t;
      dayConstraints.push(c(`step-${k}`, `d${k}`, `d${k + 1}`, step, step));
    }
    const close = days[days.length - 1].t - days[0].t;
    dayConstraints.push(c('close', 'd0', `d${days.length - 1}`, close, close));
    expect(solve(dayPoints, dayConstraints).ok).toBe(true);

    // Same for a near-equal cycle at deep-time Gyr scale where float64 ULP is ~1e-6 yr.
    const t0 = -4.567e9;
    const step = 1e5 / 3;
    const deep = solve(
      ['g0', 'g1', 'g2', 'g3'],
      [
        c('g0', ORIGIN, 'g0', t0, t0),
        c('g01', 'g0', 'g1', step, step),
        c('g12', 'g1', 'g2', step, step),
        c('g23', 'g2', 'g3', step, step),
        c('g30', 'g0', 'g3', 1e5, 1e5),
      ],
    );
    expect(deep.ok).toBe(true);
  });
});
