// What the globe draws of the planet's state, as numbers a test can compare from one moment to the next: how much
// of the disc each thing covers, and the colours of the sky and the clouds. A surface that molten rock or rock
// vapour hides counts for nothing, so a change under them is no change.
import type { GlobeLook } from '../../../viewer/src/gl/globe.ts';

export function drawn(g: GlobeLook): number[] {
  if (!g.formed) return new Array(22).fill(0);
  const molten = (1 - g.ember) * g.molten;
  const under = (1 - g.ember) * (1 - g.molten);
  const plain = (k: number) => under * ((g.surface === k ? 1 - g.surfaceMix : 0) + (g.surfaceTo === k ? g.surfaceMix : 0));
  const c = g.clouds;
  const amount = c ? Math.min(1, c.opacity + c.base) : 0;
  return [
    g.ember,
    molten,
    molten * g.crust,
    plain(0),
    plain(1),
    plain(4),
    ...g.rim,
    ...g.halo,
    c?.opacity ?? 0,
    c?.base ?? 0,
    ...(c ? c.tint.map((x) => x * amount) : [0, 0, 0]),
    ...(c?.glow ?? [0, 0, 0]),
  ];
}

/** The greatest difference between two moments' drawings, in any one of their numbers. */
export const apart = (a: number[], b: number[]): number => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
