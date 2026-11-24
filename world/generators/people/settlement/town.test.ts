import { describe, expect, it } from 'vitest';
import type { GrowthGround } from '../../../../core/growth.ts';
import { planTown, townAt, type TownInput } from './town.ts';

/** Level ground, with a river 40 m wide running north to south 400 m east of the town's point. */
const ground: GrowthGround = {
  height: (x) => (Math.abs(x - 400) < 20 ? -2 : 6),
  above: (x) => (Math.abs(x - 400) < 20 ? -2 : 6),
};
const input = (over: Partial<TownInput> = {}): TownInput => ({
  key: 'test/town',
  span: [-200, 800],
  members: [{ t: [-200, 0, 300, 600, 800], people: [1000, 8000, 30000, 12000, 6000] }],
  toward: [0, Math.PI / 2],
  ground,
  streets: 'lanes',
  sizes: { block: 55, lane: 4, front: [7, 12], depth: [16, 26] },
  main: 8,
  ...over,
});

describe('a town through its life', () => {
  it('keeps its streets and plots where they are as it grows: a later time only adds to them', () => {
    const plan = planTown(input());
    const a = townAt(plan, 0);
    const b = townAt(plan, 300);
    expect(a.plots.length).toBeGreaterThan(20);
    expect(b.plots.length).toBeGreaterThan(a.plots.length);
    const later = new Map(b.plots.map((p) => [p.id, p]));
    for (const p of a.plots) {
      const q = later.get(p.id);
      expect(q).toBeDefined();
      expect(q!.x).toBe(p.x);
      expect(q!.y).toBe(p.y);
    }
    const lanes = new Map(b.lanes.map((l) => [l.id, l.line.join()]));
    for (const l of a.lanes) expect(lanes.get(l.id)).toBe(l.line.join());
  });

  it('gives up its outer plots first as its people fall', () => {
    const plan = planTown(input());
    const peak = townAt(plan, 300);
    const late = townAt(plan, 700);
    expect(late.plots.length).toBeLessThan(peak.plots.length);
    const mean = (ps: { x: number; y: number }[]) => ps.reduce((s, p) => s + Math.hypot(p.x, p.y), 0) / ps.length;
    expect(mean(late.plots)).toBeLessThan(mean(peak.plots));
  });

  it('builds nothing in its river', () => {
    const plan = planTown(input());
    for (const p of townAt(plan, 300).plots) expect(Math.abs(p.x - 400)).toBeGreaterThan(15);
  });

  it('is the same town every time it is planned', () => {
    const a = townAt(planTown(input()), 300);
    const b = townAt(planTown(input()), 300);
    expect(b.plots.map((p) => p.id)).toEqual(a.plots.map((p) => p.id));
    expect(b.plots.map((p) => p.x)).toEqual(a.plots.map((p) => p.x));
  });

  it('lays its routes out towards the places it dealt with, and its wall round it as it stood, with a gate on each route', () => {
    const plan = planTown(input({ wall: { from: 100, to: 800, thickness: 4 } }));
    expect(plan.routes.length).toBeGreaterThanOrEqual(3);
    // The first route leaves eastwards, towards the first place named.
    const [x, y] = plan.routes[0].line.slice(-2);
    expect(Math.abs(Math.atan2(y, x))).toBeLessThan(0.5);
    expect(plan.wall).toBeDefined();
    expect(plan.wall!.gates.length).toBeGreaterThanOrEqual(plan.routes.length - 1);
    // Every plot built while the wall stood is inside it.
    const ring = plan.wall!.ring;
    const inside = (px: number, py: number) => {
      let c = false;
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2)
        if (ring[i + 1] > py !== ring[j + 1] > py && px < ((ring[j] - ring[i]) * (py - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) c = !c;
      return c;
    };
    const at = townAt(plan, 150);
    const out = at.plots.filter((p) => !inside(p.x, p.y)).length;
    expect(out / at.plots.length).toBeLessThan(0.05);
  });

  it('lays a planned town on a grid turned as its record says', () => {
    const plan = planTown(input({ streets: 'grid', angle: 0.26 }));
    const { lanes } = townAt(plan, 300);
    expect(lanes.length).toBeGreaterThan(10);
    for (const l of lanes) {
      const [ax, ay, bx, by] = l.line;
      const a = Math.atan2(by - ay, bx - ax) - 0.26;
      expect(Math.min(Math.abs(Math.sin(a)), Math.abs(Math.cos(a)))).toBeLessThan(1e-6);
    }
  });
});
