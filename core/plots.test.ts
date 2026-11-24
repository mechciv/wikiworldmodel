// The plots of people's fields (core/plots.ts): one layout for the ground's colour, close-up crops, and 3D fieldworks.
import { describe, expect, it } from 'vitest';
import {
  buildFieldPalette,
  cropPhenology,
  domainOf,
  domainSpan,
  FIELD_SLOTS,
  PLOT,
  PLOT_LOOK,
  PLOTS_GLSL,
  plotAt,
  plotDomainAt,
  plotDomainsInBox,
  plotNearInDomain,
  plotNumber,
  plotOfInDomain,
  plotPlaceInDomain,
  plotReach,
  plotSlotIndex,
  plotState,
  plotStyle,
} from './plots.ts';

const BLOCKS = plotStyle({ kind: 'blocks', plot: 0.5 });
const SWIDDEN = plotStyle({ kind: 'swidden', plot: 0.8 });

describe("the plots of people's fields", () => {
  it('finds a place again inside its macro-domain from where it lies across and along its plot', () => {
    for (const style of [BLOCKS, SWIDDEN, plotStyle({ kind: 'strips', plot: 0.2 })]) {
      const span = domainSpan(style);
      for (let k = 0; k < 400; k++) {
        const x = Math.sin(k * 12.9898) * 9000;
        const y = Math.cos(k * 78.233) * 9000;
        const at = plotAt(x, y, style);
        const dom = domainOf(at.di, at.dj, span);
        const [bx, by] = plotPlaceInDomain(at.across, at.along, dom, style);
        expect(Math.hypot(bx - x, by - y)).toBeLessThan(0.02);
        const again = plotOfInDomain(at.across, at.along, dom, style, at.domainEdge);
        expect(again).toEqual(at);
        // The quick approximate inverse lies well within plotReach of the exact place.
        const [nx, ny] = plotNearInDomain(at.across, at.along, dom, style);
        expect(Math.hypot(nx - x, ny - y)).toBeLessThan(plotReach(style) * 0.45);
      }
    }
  });

  it('varies parcel orientation across macro-domains and finds every overlapping domain in a box', () => {
    const angles = new Set<number>();
    for (let k = 0; k < 25; k++) {
      const { domain } = plotDomainAt(k * 310 - 2000, k * 270 - 1500, BLOCKS);
      angles.add(Math.round(domain.angle * 100));
    }
    expect(angles.size).toBeGreaterThan(8);
    // Every point inside a query box belongs to one of the domains returned by plotDomainsInBox.
    const box = plotDomainsInBox(-200, -200, 200, 200, BLOCKS);
    const keys = new Set(box.map((d) => `${d.di},${d.dj}`));
    for (let x = -200; x <= 200; x += 40) {
      for (let y = -200; y <= 200; y += 40) {
        const { domain } = plotDomainAt(x, y, BLOCKS);
        expect(keys.has(`${domain.di},${domain.dj}`)).toBe(true);
      }
    }
  });

  it('puts each plot under a crop, the plough or fallow by its own number, in the shares it says', () => {
    const counts = new Map<number, number>();
    const n = 120;
    for (let i = -n; i < n; i++) {
      for (let j = -n; j < n; j++) {
        const st = plotState(plotNumber(i, j), 0);
        counts.set(st, (counts.get(st) ?? 0) + 1);
      }
    }
    const all = 4 * n * n;
    const s = PLOT_LOOK.shares;
    expect((counts.get(PLOT.ripe) ?? 0) / all).toBeCloseTo(s.ripe, 1);
    expect((counts.get(PLOT.green) ?? 0) / all).toBeCloseTo(s.green - s.ripe, 1);
    expect((counts.get(PLOT.ploughed) ?? 0) / all).toBeCloseTo(s.ploughed - s.green, 1);
    expect((counts.get(PLOT.fallow) ?? 0) / all).toBeCloseTo(1 - s.ploughed, 1);
    // Plots cleared from woodland are bare or green, and nothing else.
    for (let k = 0; k < 200; k++) expect([PLOT.ploughed, PLOT.green]).toContain(plotState(k / 200, SWIDDEN.kind));
    // A plot's number is one of 65,536, so that a shader's float holds it exactly; and each `k` gives another.
    expect(Number.isInteger(plotNumber(3, -7) * 65536)).toBe(true);
    expect(plotNumber(3, -7, 3)).not.toBe(plotNumber(3, -7));
  });

  it('keeps a place within its plot, its edge non-negative and bounded by half the parcel width', () => {
    for (let k = 0; k < 300; k++) {
      const at = plotAt(k * 37.1 - 5000, k * -19.7 + 800, BLOCKS);
      expect(at.edge).toBeGreaterThanOrEqual(0);
      expect(at.edge).toBeLessThanOrEqual(Math.min(at.sx, at.sy) / 2 + 1e-6);
    }
  });

  it('drives seasonal phenology and shared 8-slot FieldPalette from regional crops, month and hemisphere', () => {
    const hanCrops = [
      { kind: 'millet' as const, name: 'Foxtail millet', season: 'summer' as const, share: 'staple' as const },
      { kind: 'wheat' as const, name: 'Winter wheat', season: 'winter' as const, share: 'secondary' as const },
      { kind: 'soybean' as const, name: 'Soybeans', season: 'summer' as const, share: 'minor' as const },
    ];
    // June in North China (36.5°N): winter wheat is ripe / harvested stubble, while summer millet & soybeans are lush green.
    const june = buildFieldPalette(hanCrops, 6, 36.5, 0);
    expect(june.slots).toHaveLength(FIELD_SLOTS);
    expect(june.slotColor).toHaveLength(FIELD_SLOTS * 4);
    expect(june.slots.some((s) => s.crop?.kind === 'wheat' && s.state === PLOT.ripe)).toBe(true);
    expect(june.slots.some((s) => s.crop?.kind === 'wheat' && s.state === PLOT.stubble)).toBe(true);
    expect(june.slots.some((s) => s.crop?.kind === 'millet' && s.state === PLOT.green)).toBe(true);
    expect(june.slots.some((s) => s.state === PLOT.ploughed)).toBe(true);
    expect(june.slots.some((s) => s.state === PLOT.fallow)).toBe(true);
    expect(june.slots[FIELD_SLOTS - 1].upto).toBe(1);

    // September in North China: summer millet ripens while winter wheat parcels are freshly ploughed.
    const sept = buildFieldPalette(hanCrops, 9, 36.5, 0);
    expect(sept.slots.some((s) => s.crop?.kind === 'millet' && s.state === PLOT.ripe)).toBe(true);
    expect(cropPhenology(hanCrops[1], 9, 36.5)[0].state).toBe(PLOT.ploughed);

    // Southern hemisphere flips the seasonal calendar by 6 months.
    expect(cropPhenology(hanCrops[0], 12, -35)[0].state).toBe(PLOT.green);
    expect(cropPhenology(hanCrops[0], 3, -35)[0].state).toBe(PLOT.ripe);

    // Every hash maps cleanly into a valid slot index.
    for (let u = 0; u < 1; u += 0.05) {
      const idx = plotSlotIndex(u, june);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(FIELD_SLOTS);
    }
  });

  it('hands the shader the same layout: its seed, its shares of wander, domains and tones', () => {
    expect(PLOTS_GLSL).toContain('0x27d4eb2du');
    expect(PLOTS_GLSL).toContain('TERRACE_STEP');
    expect(PLOTS_GLSL).toContain(String(PLOT_LOOK.warp.irregular));
    expect(PLOTS_GLSL).toContain(`vec3(${PLOT_LOOK.ripe[0].join(', ')})`);
    expect(PLOTS_GLSL).not.toContain('`');
  });
});
