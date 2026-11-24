import { describe, expect, it } from 'vitest';
import { plotStyle } from '../../../../core/plots.ts';
import { farmLanes, LaneGround, type Point } from './lanes.ts';

const widths = { main: 4, side: 2.8, foot: 1.4 };
const shapes = [{ w: 12, l: 12, door: 6 }, { w: 11, l: 14, door: 7 }];
const fields = plotStyle({ kind: 'blocks', plot: 0.5 });
const dry = () => true;
const layout = (seed: number, facing: number | undefined, dispersed = false, fits: (x: number, y: number) => boolean = dry) =>
  farmLanes([0, 0], 100, seed, dispersed ? 50 : 20, shapes, facing, dispersed, widths, 2, 1400, fields, fits);

describe('routes through a farming settlement', () => {
  it('connects every threshold to field access without crossing another house', () => {
    for (let seed = 0; seed < 8; seed++) {
      const farm = layout(seed, seed % 2 ? undefined : Math.PI);
      const graph = new Map<string, string[]>();
      for (const { line } of farm.lanes) {
        for (let i = 2; i < line.length; i += 2) {
          const a = line.slice(i - 2, i).join(), b = line.slice(i, i + 2).join();
          (graph.get(a) ?? graph.set(a, []).get(a)!).push(b);
          (graph.get(b) ?? graph.set(b, []).get(b)!).push(a);
        }
      }
      expect(farm.lots).toHaveLength(100);
      expect(farm.exits).toHaveLength(2);
      const stack = [farm.exits[0].join()], reached = new Set<string>();
      while (stack.length) {
        const at = stack.pop()!;
        if (reached.has(at)) continue;
        reached.add(at);
        stack.push(...graph.get(at)!);
      }
      expect(reached.size).toBe(graph.size);
      const roads = new LaneGround(farm.lanes);
      for (const h of farm.lots) {
        const shape = shapes[h.variant];
        const door: Point = [h.at[0] + Math.sin(h.face) * shape.door, h.at[1] + Math.cos(h.face) * shape.door];
        expect(reached.has(door.join())).toBe(true);
        // The route may meet the threshold. None of its width may cover the middle of this house.
        expect(roads.contains(...h.at)).toBe(false);
        for (const lane of farm.lanes) {
          for (let i = 2; i < lane.line.length; i += 2) {
            const [ax, ay, bx, by] = lane.line.slice(i - 2, i + 2);
            const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
            for (let j = 0; j <= steps; j++) {
              const x = ax + (bx - ax) * j / steps - h.at[0], y = ay + (by - ay) * j / steps - h.at[1];
              const along = x * Math.sin(h.face) + y * Math.cos(h.face), across = x * Math.cos(h.face) - y * Math.sin(h.face);
              if (Math.abs(across) < shape.w / 2 - 0.1 && Math.abs(along) < shape.l / 2 - 0.1)
                throw new Error(`Lane crosses a house in settlement ${seed}`);
            }
          }
        }
      }
    }
  });
  it('keeps its lanes on the accessible side of a watercourse', () => {
    const westBank = (x: number) => x < 24 || x > 42;
    const farm = layout(17, 0, false, westBank);
    expect(farm.lots.length).toBeGreaterThan(25);
    expect(farm.lanes.every(l => l.line.every((v, i) => i % 2 || v < 24))).toBe(true);
  });
  it('keeps a lone farm at its seeded site with a turnoff to the field track', () => {
    const farm = farmLanes([510, 100], 1, 32, 50, shapes, Math.PI, true, widths, 2, 600, fields, dry);
    expect(farm.lots.map(h => h.at)).toEqual([[510, 100]]);
    expect(farm.exits).toHaveLength(2);
    expect(farm.lanes.some(l => l.width === widths.main)).toBe(true);
  });
  it('leaves fields between dispersed holdings and repeats the same layout for the same seed', () => {
    const compact = layout(14, Math.PI);
    const spread = layout(14, Math.PI, true);
    expect(spread.radius).toBeGreaterThan(compact.radius * 2);
    expect(layout(14, Math.PI).lots).toEqual(compact.lots);
  });
});
