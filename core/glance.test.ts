// How much is known, at a glance (core/glance.ts): shares counted from a hand-made coverage chart, and from a made-up
// human landscape, so each can be worked out by hand.
import { describe, expect, it } from 'vitest';
import type { CoverageMatrix } from './coverage.ts';
import { glance, landShares, layerShare } from './glance.ts';
import type { ResolveWorld } from './resolve.ts';

/** A chart of three columns, ending at 0; each cell's shares are evidence, model, generic, unknown. */
function chart(cells: Record<string, number[][]>): CoverageMatrix {
  return {
    format: 'lightworld-coverage@1',
    columns: [
      [-300, -200],
      [-200, -100],
      [-100, 0],
      [0, 100],
    ],
    step: 10,
    samples: 1,
    whys: [],
    layers: Object.entries(cells).map(([layer, shares]) => ({ layer: layer as never, cells: shares.map((share) => ({ share, why: [], map: '' })) })),
    sources: [],
  };
}

describe('the glance', () => {
  it('counts what a layer draws from the first column it draws anything in, up to the present', () => {
    const m = chart({
      climate: [
        [0, 0, 0, 1], // nothing drawn: before the window
        [0, 0.5, 0.5, 0], // half known
        [0.25, 0.5, 0, 0.25], // three quarters drawn, all of it known
        [0, 1, 0, 0], // the future: left out
      ],
    });
    // (0.5 + 0.75) known of (1 + 0.75) drawn
    expect(layerShare(m, 'climate', 0)).toEqual({ share: Math.round((1.25 / 1.75) * 1e4) / 1e4, from: -200 });
    expect(layerShare(m, 'ice', 0)).toBeNull();
    expect(layerShare(chart({ ice: [[0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [1, 0, 0, 0]] }), 'ice', 0)).toBeNull();
  });

  it('counts ways of life and states over the land the landscape knows, where each reaches', () => {
    const w = {
      landscape: {
        span: [-1000, 0],
        // Land north of the equator; known east of the meridian, foragers standing in to the west.
        at: (lat: number, lon: number) => (lat > 0 ? { tier: lon > 0 ? 'evidence' : 'generic', pattern: 'x' } : undefined),
      },
      polities: [-120, 0],
      polity: (_lat: number, lon: number) => (lon > 90 ? 'a state' : undefined),
    } as unknown as ResolveWorld;
    const cols: [number, number][] = [
      [-2000, -1500], // before the landscape
      [-400, -200],
      [-200, -100],
      [-100, 0],
      [0, 100], // the future
    ];
    const s = landShares(w, cols, 10, 0)!;
    expect(s.from).toBe(-300);
    expect(s.lifeways).toBeCloseTo(0.5, 4);
    // Only the last column's middle (-50) is within the states' span; the one before, at -150, is not.
    expect(s.statesFrom).toBe(-50);
    expect(s.states).toBeCloseTo(0.25, 4);
    expect(landShares({ ...w, landscape: undefined }, cols, 10, 0)).toBeNull();
  });

  it('makes the bars, and says where nothing measures one', () => {
    const g = glance({
      matrix: chart({ geography: [[0, 1, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 1, 0]] }),
      until: 0,
      land: { lifeways: 0.9, from: -300 },
      forms: { taxa: 1000, own_form: 2 },
      ladder: { unchecked: 98, quoted: 2, 're-read': 0, audited: 0, accepted: 0 },
      formatTime: (t) => `${-t} yr ago`,
    });
    const row = (id: string) => g.groups.flatMap((x) => x.rows).find((r) => r.id === id)!;
    expect(g.groups.map((x) => x.id)).toEqual(['earth', 'life', 'people', 'record']);
    expect(row('land').share).toBeCloseTo(2 / 3, 4);
    expect(row('land').of).toBe('of the globe since 300 yr ago');
    expect(row('climate')).toEqual({ id: 'climate', label: 'Climate', share: null, of: 'not drawn yet' });
    expect(row('bodies').share).toBe(0.002);
    expect(row('lifeways').of).toBe('of inhabited land since 300 yr ago');
    expect(row('states')).toMatchObject({ share: null, of: 'not drawn yet' });
    expect(row('checked')).toMatchObject({ share: 0.02, of: 'of 100 claims, against their sources' });
    expect(row('history')).toMatchObject({ share: null, of: 'not measured yet' });
  });
});
