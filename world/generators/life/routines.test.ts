// What a body does once it is drawn: its way, and where it is on it at any second of the visit. The renderer's shader
// does the sums of wayAt for every vertex; these hold the sums themselves, on made-up ground with made-up bodies.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { Rng } from '../city/math.ts';
import { DUTY, gait, STRIDE_HIPS } from './forms.ts';
import { ROUTE, roundOf, routineOf, walkSpeed, WAY, wayAt, wayBeside, wayFor, type Around, type Body, type RoutineParams } from './routines.ts';

const ROOT = join(import.meta.dirname, '../..');
const P = (parse(readFileSync(join(ROOT, 'generators/life/scene.yaml'), 'utf8')) as { params: { animals: { routines: RoutineParams } } }).params.animals.routines;

const level: Around = { ground: () => 12, free: () => true };
const body = (extra: Partial<Body> = {}): Body => ({ x: 100, y: -40, z: 12, fx: Math.sin(0.7), fy: Math.cos(0.7), L: 8, H: 2.6, going: false, ...extra });
/** Ways for many seeds: whatever each test says holds for all of them. */
const many = (routine: Parameters<typeof wayFor>[0], b: Body, around: Around, n = 60, flies = false) => Array.from({ length: n }, (_, k) => wayFor(routine, b, around, P, new Rng(1000 + k * 7919), flies)).filter((w): w is number[] => !!w);

describe('what a body plan does', () => {
  it('is what its behave says, or what its habitat and its poses suggest', () => {
    expect(routineOf({ routine: 'stalk', poses: ['graze'] })).toBe('stalk');
    expect(routineOf({ poses: ['graze', 'stand', 'walk'] })).toBe('feed');
    expect(routineOf({ poses: ['stand', 'walk', 'alert'] })).toBe('wander');
    expect(routineOf({ poses: ['rest', 'stand'] })).toBe('none');
    expect(routineOf({ habitat: 'air', poses: ['fly'], flies: [3, 40] })).toBe('circle');
    expect(routineOf({ habitat: 'water', poses: ['stand', 'walk'] })).toBe('circle');
    expect(routineOf({ habitat: 'floor', poses: ['stand', 'walk'] })).toBe('none');
    expect(routineOf(undefined)).toBe('none');
  });
});

describe('a way that is walked', () => {
  it('starts where the body was put, facing as it was put; and one put walking is a first step on, the way it faced', () => {
    for (const w of many('feed', body(), level)) {
      expect(w).toHaveLength(ROUTE);
      expect(Math.floor(w[11])).toBe(WAY.walk);
      const b = body();
      const at = wayAt(w, 0, b.fx, b.fy, 0);
      expect([at.x, at.y, at.z, at.going, at.walked]).toEqual([0, 0, 0, 0, 0]);
      expect([at.fx, at.fy]).toEqual([b.fx, b.fy]);
    }
    const walker = body({ going: true });
    const ways = many('wander', walker, level);
    expect(ways.length).toBeGreaterThan(50);
    for (const w of ways) {
      expect(w[3]).toBeLessThan(0);
      const at = wayAt(w, 0, walker.fx, walker.fy, 0);
      // Under way, a step from where it was put, along the way it faced.
      expect(at.going).toBeCloseTo(1, 6);
      const d = Math.hypot(at.x, at.y);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(walker.L * 0.3);
      expect(at.x / d).toBeCloseTo(walker.fx, 6);
      expect(at.y / d).toBeCloseTo(walker.fy, 6);
      expect(at.fx).toBeCloseTo(walker.fx, 6);
    }
  });

  it('comes round to where it started, and goes round again alike', () => {
    const b = body();
    for (const w of many('wander', b, level, 20)) {
      const T = roundOf(w);
      expect(T).toBeGreaterThan(5);
      for (const c of [0.3 * T, 0.71 * T, 0.999 * T]) {
        const a = wayAt(w, 0, b.fx, b.fy, c);
        const again = wayAt(w, 0, b.fx, b.fy, c + 3 * T);
        expect(again.x).toBeCloseTo(a.x, 4);
        expect(again.y).toBeCloseTo(a.y, 4);
        expect(again.fx).toBeCloseTo(a.fx, 4);
      }
      // As the round ends it is home again, turned the way it was put.
      const end = wayAt(w, 0, b.fx, b.fy, T - 1e-4);
      expect(Math.hypot(end.x, end.y)).toBeLessThan(0.01);
      expect(end.fx).toBeCloseTo(b.fx, 3);
      expect(end.fy).toBeCloseTo(b.fy, 3);
    }
  });

  it('moves without a jump, no faster than its speed, and faces the way it goes once it is going', () => {
    const b = body();
    for (const routine of ['feed', 'wander', 'patrol'] as const) {
      for (const w of many(routine, b, level, 12)) {
        const T = roundOf(w);
        const dt = 0.05;
        let last = wayAt(w, 0, b.fx, b.fy, 0);
        let moved = 0;
        for (let c = dt; c < T * 1.5; c += dt) {
          const at = wayAt(w, 0, b.fx, b.fy, c);
          const dx = at.x - last.x;
          const dy = at.y - last.y;
          const d = Math.hypot(dx, dy);
          expect(d).toBeLessThanOrEqual(w[8] * dt * 1.001 + 1e-9);
          moved += d;
          // Its heading turns by a little at a time: no more than it could in getting going.
          const turn = Math.abs(Math.atan2(at.fx * last.fy - at.fy * last.fx, at.fx * last.fx + at.fy * last.fy));
          expect(turn).toBeLessThan((Math.PI * 1.6 * dt) / Math.min(w[10], 1) + 1e-6);
          if (at.going > 0.999 && last.going > 0.999 && d > 1e-6) {
            expect(dx / d).toBeCloseTo(at.fx, 1);
            expect(dy / d).toBeCloseTo(at.fy, 1);
          }
          last = at;
        }
        expect(moved).toBeGreaterThan(b.L);
      }
    }
  });

  it('goes as fast as a slow walk for its hips, and stays as long as its routine says', () => {
    const b = body();
    const v = walkSpeed(P, b.H);
    // A body with hips 2.6 m high walks at about a metre and a half a second.
    expect(v).toBeGreaterThan(1.2);
    expect(v).toBeLessThan(1.7);
    for (const w of many('feed', b, level)) {
      expect(w[8]).toBeGreaterThanOrEqual(v * P.feed.pace * 0.85 - 1e-9);
      expect(w[8]).toBeLessThanOrEqual(v * P.feed.pace * 1.15 + 1e-9);
      expect(w[7]).toBeGreaterThanOrEqual(P.feed.stay[0]);
      expect(w[7]).toBeLessThanOrEqual(P.feed.stay[1]);
      const far = Math.hypot(w[0], w[1]);
      expect(far).toBeGreaterThanOrEqual(b.L * P.feed.range[0] - 1e-6);
      expect(far).toBeLessThanOrEqual(b.L * P.feed.range[1] + 1e-6);
    }
    for (const w of many('patrol', b, level)) expect([w[7], w[9]]).toEqual([0, 0]);
  });

  it('keeps to ground the body may stand on, along lines the ground lies near; and stays put where there is none', () => {
    // A strip of firm ground 40 m wide; beyond it, none. The ground rolls gently along it and falls away steeply at x > 130.
    const ground = (x: number, y: number) => 12 + 0.4 * Math.sin(y / 60) + (x > 130 ? (x - 130) * 0.8 : 0);
    const strip: Around = { ground, free: (x) => Math.abs(x - 100) < 20 };
    const b = body({ z: ground(100, -40) });
    const ways = many('wander', b, strip, 80);
    expect(ways.length).toBeGreaterThan(40);
    const sag = Math.max(P.sag[1], P.sag[0] * b.H);
    for (const w of ways) {
      const T = roundOf(w);
      for (let c = 0; c < T; c += 0.5) {
        const at = wayAt(w, 0, b.fx, b.fy, c);
        expect(Math.abs(b.x + at.x - 100)).toBeLessThan(20.001);
        // Carried along the line between two places, it is never further off the ground than the generator allows.
        expect(Math.abs(b.z + at.z - ground(b.x + at.x, b.y + at.y))).toBeLessThan(sag + 0.02);
      }
    }
    // Nowhere to go at all; and a body that does not stand on the ground, as one afloat, is left where it is.
    expect(many('wander', b, { ground, free: () => false })).toEqual([]);
    expect(many('wander', body({ z: 13 }), level)).toEqual([]);
    expect(many('none', b, level)).toEqual([]);
  });

  it('makes for the places it is given before anywhere else', () => {
    const b = body();
    const goals: [number, number][] = [[b.x + 9, b.y + 3], [b.x - 4, b.y + 11]];
    for (const w of many('wander', b, { ...level, goals }, 20)) {
      expect([w[0], w[1]]).toEqual([9, 3]);
      expect(w[4]).toBeCloseTo(-4, 5);
      expect(w[5]).toBeCloseTo(11, 5);
    }
  });
});

describe('one of a group', () => {
  it("goes its leader's way from where it stands itself: the same legs, speed and round, a little after, so that the group keeps together", () => {
    const leader = body();
    for (const routine of ['feed', 'wander', 'patrol'] as const) {
      const lead = many(routine, leader, level, 1)[0];
      const T = roundOf(lead);
      for (let k = 0; k < 20; k++) {
        const h = 0.7 + (k - 10) * 0.05;
        const b = body({ x: leader.x + 6 + k, y: leader.y - 9 + k * 0.5, fx: Math.sin(h), fy: Math.cos(h) });
        const w = wayBeside(lead, b, level, P, new Rng(77 + k))!;
        expect(w).toBeDefined();
        expect(roundOf(w)).toBeCloseTo(T, 6);
        expect([w[0], w[1], w[4], w[5], w[8], w[10]]).toEqual([lead[0], lead[1], lead[4], lead[5], lead[8], lead[10]]);
        expect(w[3]).toBeGreaterThanOrEqual(lead[3]);
        // It starts where it was put, as it was put; and is never further from its place beside its leader than a
        // few seconds' walk, at any moment of any round.
        const start = wayAt(w, 0, b.fx, b.fy, 0);
        expect([start.x, start.y]).toEqual([0, 0]);
        expect(start.fx).toBeCloseTo(b.fx, 9);
        expect(start.fy).toBeCloseTo(b.fy, 9);
        for (let c = 0; c < 3 * T; c += 0.7) {
          const a = wayAt(lead, 0, leader.fx, leader.fy, c);
          const m = wayAt(w, 0, b.fx, b.fy, c);
          expect(Math.hypot(a.x - m.x, a.y - m.y)).toBeLessThanOrEqual(lead[8] * 3 * lead[10] + 1e-6);
        }
      }
    }
    // Where the ground would not have it, it does not go so; whoever asked finds it a way of its own.
    const lead = many('feed', leader, level, 1)[0];
    expect(wayBeside(lead, body({ x: leader.x + 5 }), { ground: () => 12, free: () => false }, P, new Rng(1))).toBeUndefined();
    expect(wayBeside(lead, body({ x: leader.x + 5, z: 14 }), level, P, new Rng(1))).toBeUndefined();
  });

  it("goes round its leader's circle, the same way round and as fast, turned to the way it faces itself", () => {
    const leader = body({ L: 0.5, H: 0.1, z: 40 });
    const lead = many('circle', leader, level, 1, true)[0];
    for (let k = 0; k < 12; k++) {
      const h = 0.7 + (k - 6) * 0.09;
      const b = body({ L: 0.5, H: 0.1, z: 40 + k, x: leader.x + 2 * k, fx: Math.sin(h), fy: Math.cos(h) });
      const w = wayBeside(lead, b, level, P, new Rng(5 + k), true)!;
      expect(Math.hypot(w[0], w[1])).toBeCloseTo(Math.hypot(lead[0], lead[1]), 9);
      expect([w[4], w[8]]).toEqual([lead[4], lead[8]]);
      const start = wayAt(w, 0, b.fx, b.fy, 0);
      expect(Math.hypot(start.x, start.y)).toBeLessThan(1e-9);
      expect(start.fx).toBeCloseTo(b.fx, 9);
      // And it turns the way its leader turns.
      const cross = (u: ReturnType<typeof wayAt>, v: ReturnType<typeof wayAt>) => u.fx * v.fy - u.fy * v.fx;
      expect(Math.sign(cross(start, wayAt(w, 0, b.fx, b.fy, 1)))).toBe(Math.sign(cross(wayAt(lead, 0, leader.fx, leader.fy, 0), wayAt(lead, 0, leader.fx, leader.fy, 1))));
    }
  });
});

describe('one that stalks', () => {
  it('goes slowly up to the group, holds off it, goes a way round it and comes back', () => {
    const b = body({ L: 12, H: 3 });
    const prey = { x: b.x + 120, y: b.y + 50, r: 14 };
    const ways = many('stalk', b, { ...level, prey });
    expect(ways.length).toBeGreaterThan(50);
    for (const w of ways) {
      const from = (o: number) => Math.hypot(b.x + w[o] - prey.x, b.y + w[o + 1] - prey.y);
      // Both places are as far off the group as a stalker holds: clear of it, and nearer than it stood.
      for (const o of [0, 4]) {
        expect(from(o)).toBeGreaterThanOrEqual(prey.r + b.L * P.stalk.hold[0] - 1e-6);
        expect(from(o)).toBeLessThanOrEqual(prey.r + b.L * P.stalk.hold[1] + 1e-6);
      }
      expect(Math.hypot(w[4] - w[0], w[5] - w[1])).toBeGreaterThan(5);
      expect(w[8]).toBeLessThan(walkSpeed(P, b.H) * 0.5);
      expect(w[7]).toBeGreaterThanOrEqual(P.stalk.stay[0]);
      // Never nearer the group than it holds off, at any moment of its round.
      const T = roundOf(w);
      for (let c = 0; c < T; c += 1) {
        const at = wayAt(w, 0, b.fx, b.fy, c);
        expect(Math.hypot(b.x + at.x - prey.x, b.y + at.y - prey.y)).toBeGreaterThan(prey.r + b.L * 1.2);
      }
    }
    // A group too far off is no one's to stalk: it goes a way of its own, and watches from there.
    const none = many('stalk', b, { ...level, prey: { x: b.x + 2000, y: b.y, r: 14 } });
    for (const w of none) expect(Math.hypot(w[0], w[1])).toBeLessThanOrEqual(b.L * P.stalk.range[1] + 1e-6);
  });
});

describe('a way round a circle', () => {
  it('sets out the way the body was put, keeps its distance from its middle, and is flown faster than swum', () => {
    const b = body({ L: 0.5, H: 0.1, z: 40 });
    const ways = many('circle', b, level, 40, true);
    expect(ways.length).toBe(40);
    for (const w of ways) {
      expect(Math.floor(w[11])).toBe(WAY.circle);
      const r = Math.hypot(w[0], w[1]);
      expect(r).toBeGreaterThanOrEqual(P.circle.least);
      const start = wayAt(w, 0, b.fx, b.fy, 0);
      expect(Math.hypot(start.x, start.y)).toBeLessThan(1e-9);
      expect(start.fx).toBeCloseTo(b.fx, 9);
      expect(start.fy).toBeCloseTo(b.fy, 9);
      const T = roundOf(w);
      let last = start;
      for (let k = 1; k <= 40; k++) {
        const at = wayAt(w, 0, b.fx, b.fy, (T * k) / 40);
        expect(Math.hypot(at.x - w[0], at.y - w[1])).toBeCloseTo(r, 6);
        expect(at.z).toBe(0);
        // It faces along its way.
        const d = Math.hypot(at.x - last.x, at.y - last.y);
        expect(((at.x - last.x) / d) * at.fx + ((at.y - last.y) / d) * at.fy).toBeGreaterThan(0.98);
        last = at;
      }
      expect(Math.hypot(last.x, last.y)).toBeLessThan(1e-6);
    }
    const flown = many('circle', b, level, 20, true).reduce((a, w) => a + w[8], 0);
    const swum = many('circle', body({ L: 0.5, H: 0.1, z: 40 }), level, 20, false).reduce((a, w) => a + w[8], 0);
    expect(flown).toBeGreaterThan(swum * 5);
    // Into a hillside, or out of the water, there is no way round.
    const byIt = (x: number, y: number) => Math.hypot(x - b.x, y - b.y) < 5;
    expect(many('circle', b, { ground: (x, y) => (byIt(x, y) ? 12 : 60), free: () => true }, 20, true)).toEqual([]);
    expect(many('circle', b, { ground: () => 12, free: byIt }, 20, false)).toEqual([]);
  });
});

describe('a stride', () => {
  it('keeps a foot where it was put down for as long as it is on the ground, then lifts it and swings it forward', () => {
    const stride = STRIDE_HIPS * 2.6;
    // Where a foot is over the ground as its body goes forward: the body's place, and the foot's from its hip.
    const foot = (walked: number) => walked + (DUTY / 2) * stride * gait(walked / stride)[0];
    for (let n = 0; n < 4; n++) {
      const down = foot(n * stride);
      for (let k = 0; k < 20; k++) {
        const walked = (n + (DUTY * k) / 20) * stride;
        expect(foot(walked)).toBeCloseTo(down, 9);
        expect(gait(walked / stride)[1]).toBe(0);
      }
      // Then it is off the ground, and comes down a stride on.
      expect(gait(n + DUTY + (1 - DUTY) / 2)[1]).toBeCloseTo(1, 6);
      expect(foot((n + 1) * stride - 1e-9)).toBeCloseTo(down + stride, 6);
    }
  });
});
