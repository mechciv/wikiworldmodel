// The atlas of leaves as the viewer draws it (viewer/src/gl/leafatlas.ts): every tile has leaves in it, clear of its
// edges enough to be a spray, and keeps as much of itself leaf at every size; a tile of what lies fallen repeats
// without a seam; and it is the same drawn twice.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LEAF_CARD_TILES, LEAF_TILE, LEAF_TILES, tileKind, tileLitter } from '../../../core/leaves.ts';
import { makeLeafAtlas } from '../../../viewer/src/gl/leafatlas.ts';

const atlas = makeLeafAtlas();
const digest = (a: typeof atlas) => {
  const h = createHash('sha256');
  for (const l of a.levels) h.update(l);
  return h.digest('hex');
};

describe('the atlas of leaves, drawn', () => {
  it('is one layer for each tile, with every smaller level down to a texel', () => {
    expect(atlas.width).toBe(LEAF_TILE.across);
    expect(atlas.height).toBe(LEAF_TILE.along);
    expect(atlas.layers).toBe(LEAF_TILES);
    expect(atlas.levels.length).toBe(Math.floor(Math.log2(Math.max(atlas.width, atlas.height))) + 1);
    atlas.levels.forEach((l, k) => expect(l.length, `level ${k}`).toBe(Math.max(1, atlas.width >> k) * Math.max(1, atlas.height >> k) * 4 * LEAF_TILES));
  });

  it('has leaves in every tile: neither empty nor a solid card', () => {
    const texels = atlas.width * atlas.height;
    for (let tile = 0; tile < LEAF_TILES; tile++) {
      let leaf = 0;
      for (let k = 0; k < texels; k++) if (atlas.levels[0][(tile * texels + k) * 4 + 3] >= 128) leaf++;
      const share = leaf / texels;
      const litter = tileLitter(tile);
      if (litter) {
        // What lies fallen covers much of its ground, and leaves some of the earth to show.
        expect(share, `${litter} litter`).toBeGreaterThan(0.3);
        expect(share, `${litter} litter`).toBeLessThan(0.97);
        continue;
      }
      const { kind, bough } = tileKind(tile);
      expect(share, `${kind}${bough ? ' bough' : ''}`).toBeGreaterThan(0.025);
      expect(share, `${kind}${bough ? ' bough' : ''}`).toBeLessThan(0.9);
    }
  });

  it('strews a tile of litter so that it repeats without a seam: texels either side of an edge are as alike as neighbours inside it', () => {
    const w = atlas.width;
    const h = atlas.height;
    for (let tile = LEAF_CARD_TILES; tile < LEAF_TILES; tile++) {
      const at = (i: number, j: number) => atlas.levels[0][(tile * w * h + j * w + i) * 4 + 3] / 255;
      // The texels either side of a seam are as alike as any two neighbours inside the tile are.
      let seam = 0;
      let inside = 0;
      for (let j = 0; j < h; j++) {
        seam += Math.abs(at(0, j) - at(w - 1, j));
        inside += Math.abs(at(w >> 1, j) - at((w >> 1) - 1, j));
      }
      for (let i = 0; i < w; i++) {
        seam += Math.abs(at(i, 0) - at(i, h - 1));
        inside += Math.abs(at(i, h >> 1) - at(i, (h >> 1) - 1));
      }
      expect(seam, `${tileLitter(tile)} litter`).toBeLessThan(inside * 1.6 + 4);
    }
  });

  it('keeps a tile as much leaf from far off as close by, so that a spray keeps its mass', () => {
    const share = (level: number, tile: number) => {
      const texels = Math.max(1, atlas.width >> level) * Math.max(1, atlas.height >> level);
      let leaf = 0;
      for (let k = 0; k < texels; k++) if (atlas.levels[level][(tile * texels + k) * 4 + 3] >= 128) leaf++;
      return leaf / texels;
    };
    for (let tile = 0; tile < LEAF_TILES; tile += 3) {
      const first = share(0, tile);
      // Four levels down, a sixteenth the size each way: within a tenth of the first.
      expect(Math.abs(share(4, tile) - first), `tile ${tile}`).toBeLessThan(0.1);
    }
  });

  it('is the same drawn again', () => {
    expect(digest(makeLeafAtlas())).toBe(digest(atlas));
  });
});
