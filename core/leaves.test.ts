// The kinds of leaves a plant's cards show (core/leaves.ts): every kind has its tiles in the atlas, one after
// another, and a card's coordinates never run from one tile into the next.
import { describe, expect, it } from 'vitest';
import { boughTile, defaultLeaf, LEAF_CARD_TILES, LEAF_KIND_NAMES, LEAF_KINDS, LEAF_TILES, LITTER_KINDS, LITTER_NAMES, LITTER_SPAN, litterTile, sprayTile, tileKind, tileLitter, tileU, type LeafKind } from './leaves.ts';

describe('the atlas of leaves', () => {
  it('has a tile for every spray and bough of every kind, each once', () => {
    const seen = new Set<number>();
    for (const name of LEAF_KIND_NAMES) {
      const k: LeafKind = LEAF_KINDS[name];
      expect(k.sprays, name).toBeGreaterThan(0);
      expect(k.spray[0], name).toBeGreaterThan(0);
      expect(k.spray[1], name).toBeGreaterThan(0);
      for (let q = 0; q < k.sprays; q++) {
        const t = sprayTile(name, q);
        expect(seen.has(t), `${name} spray ${q}`).toBe(false);
        seen.add(t);
        expect(tileKind(t)).toEqual({ kind: name, bough: false, nth: q });
      }
      for (let q = 0; q < k.boughs; q++) {
        const t = boughTile(name, q);
        expect(seen.has(t), `${name} bough ${q}`).toBe(false);
        seen.add(t);
        expect(tileKind(t)).toEqual({ kind: name, bough: true, nth: q });
        // A bough is clothed in sprays: it is longer than one.
        expect(k.bough[0], name).toBeGreaterThan(k.spray[0]);
      }
    }
    expect(seen.size).toBe(LEAF_CARD_TILES);
    expect(Math.max(...seen)).toBe(LEAF_CARD_TILES - 1);
  });

  it('has a tile of litter for every kind of it, after the sprays and boughs, and every kind of leaf falls as one', () => {
    const seen = new Set<number>();
    for (const name of LITTER_NAMES) {
      const t = litterTile(name);
      expect(t, name).toBeGreaterThanOrEqual(LEAF_CARD_TILES);
      expect(t, name).toBeLessThan(LEAF_TILES);
      expect(seen.has(t), name).toBe(false);
      seen.add(t);
      expect(tileLitter(t)).toBe(name);
      expect(() => tileKind(t), name).toThrow();
    }
    expect(seen.size).toBe(LEAF_TILES - LEAF_CARD_TILES);
    for (let t = 0; t < LEAF_CARD_TILES; t++) expect(tileLitter(t)).toBeUndefined();
    for (const name of LEAF_KIND_NAMES) expect(LITTER_KINDS[LEAF_KINDS[name].falls], name).toBeDefined();
    // A tile of litter is as much ground as a tile is texels: the same number of them to a metre each way.
    expect(LITTER_SPAN[1] / LITTER_SPAN[0]).toBeCloseTo(2, 6);
  });

  it('picks one of a kind\'s tiles by any whole number, and a spray where a kind has no bough', () => {
    for (const name of LEAF_KIND_NAMES) {
      const k: LeafKind = LEAF_KINDS[name];
      for (const pick of [-7, -1, 0, 1, 5, 12345, 0x9e37 * 3]) {
        expect(tileKind(sprayTile(name, pick)).kind).toBe(name);
        const b = tileKind(boughTile(name, pick));
        expect(b.kind).toBe(name);
        expect(b.bough).toBe(k.boughs > 0);
      }
    }
  });

  it('keeps a card within its own tile from one edge to the other', () => {
    for (const tile of [0, 7, LEAF_TILES - 1]) {
      for (const u of [-1, 0, 0.5, 1, 2]) {
        const x = tileU(tile, u);
        expect(Math.floor(x)).toBe(tile);
        expect(x - tile).toBeGreaterThan(0.005);
        expect(x - tile).toBeLessThan(0.995);
      }
      expect(tileU(tile, 0)).toBeLessThan(tileU(tile, 1));
    }
  });

  it('gives every type of a plant\'s part a kind of leaf where its form says none', () => {
    for (const type of ['conifer', 'broadleaf', 'palm', 'fern', 'whorled', 'scale-tree', 'tuft', 'shrub', 'mat']) {
      for (const mat of [undefined, 'needle', 'frond', 'broad']) expect(LEAF_KINDS[defaultLeaf(type, mat)], `${type} of ${mat}`).toBeDefined();
    }
    // What the plans rely on: a cordaite's straps, a glossopterid's tongues, a grass's blades, a herb's soft leaves.
    expect(defaultLeaf('broadleaf', 'frond')).toBe('broad-strap');
    expect(defaultLeaf('conifer', 'broad')).toBe('broad-tongue');
    expect(defaultLeaf('tuft', undefined)).toBe('blade-grass');
    expect(defaultLeaf('tuft', 'broad')).toBe('herb');
    expect(defaultLeaf('conifer', undefined)).toBe('needle-flat');
  });
});
