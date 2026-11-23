// The plots of people's fields (core/plots.ts): one layout for the ground's colour and for what is sown on it.
import { describe, expect, it } from 'vitest';
import { PLOT, PLOT_LOOK, PLOTS_GLSL, plotAt, plotNear, plotNumber, plotOf, plotPlace, plotReach, plotState, plotStyle } from './plots.ts';

const BLOCKS = plotStyle({ kind: 'blocks', plot: 0.5 });
const SWIDDEN = plotStyle({ kind: 'swidden', plot: 0.8 });

describe("the plots of people's fields", () => {
  it('finds a place again from where it lies across and along its plot', () => {
    for (const style of [BLOCKS, SWIDDEN, plotStyle({ kind: 'strips', plot: 0.2 })]) {
      for (let k = 0; k < 400; k++) {
        const x = Math.sin(k * 12.9898) * 9000;
        const y = Math.cos(k * 78.233) * 9000;
        const at = plotAt(x, y, style);
        const [bx, by] = plotPlace(at.across, at.along, style);
        expect(Math.hypot(bx - x, by - y)).toBeLessThan(0.02);
        // The plots' lines lie no further from the scene's than they are said to wander.
        expect(at.across - x).toBeGreaterThanOrEqual(0);
        expect(at.across - x).toBeLessThanOrEqual(plotReach(style) + 1e-9);
        expect(plotOf(at.across, at.along, style)).toEqual(at);
        // The quick guess of where it lies is within a quarter of that reach, as what leaves places out by it trusts.
        const [nx, ny] = plotNear(at.across, at.along, style);
        expect(Math.max(Math.abs(nx - x), Math.abs(ny - y))).toBeLessThan(plotReach(style) * 0.25);
      }
    }
  });

  it('puts each plot under a crop, the plough or fallow by its own number, in the shares it says', () => {
    const counts = [0, 0, 0, 0];
    const n = 120;
    for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) counts[plotState(plotNumber(i, j), 0)]++;
    const all = 4 * n * n;
    const s = PLOT_LOOK.shares;
    expect(counts[PLOT.ripe] / all).toBeCloseTo(s.ripe, 1);
    expect(counts[PLOT.green] / all).toBeCloseTo(s.green - s.ripe, 1);
    expect(counts[PLOT.ploughed] / all).toBeCloseTo(s.ploughed - s.green, 1);
    expect(counts[PLOT.fallow] / all).toBeCloseTo(1 - s.ploughed, 1);
    // Plots cleared from woodland are bare or green, and nothing else.
    for (let k = 0; k < 200; k++) expect([PLOT.ploughed, PLOT.green]).toContain(plotState(k / 200, SWIDDEN.kind));
    // A plot's number is one of 65,536, so that a shader's float holds it exactly; and each `k` gives another.
    expect(Number.isInteger(plotNumber(3, -7) * 65536)).toBe(true);
    expect(plotNumber(3, -7, 3)).not.toBe(plotNumber(3, -7));
  });

  it('keeps a place within its plot, its edge no further than half the plot is wide', () => {
    for (let k = 0; k < 300; k++) {
      const at = plotAt(k * 37.1 - 5000, k * -19.7 + 800, BLOCKS);
      expect(at.edge).toBeGreaterThanOrEqual(0);
      expect(at.edge).toBeLessThanOrEqual(BLOCKS.plot / Math.sqrt(BLOCKS.aspect) / 2 + 1e-6);
    }
  });

  it('hands the shader the same layout: its seed, its shares of wander and its tones', () => {
    expect(PLOTS_GLSL).toContain('0x27d4eb2du');
    expect(PLOTS_GLSL).toContain(String(PLOT_LOOK.warp.irregular));
    expect(PLOTS_GLSL).toContain(`vec3(${PLOT_LOOK.ripe[0].join(', ')})`);
    expect(PLOTS_GLSL).not.toContain('`');
  });
});
