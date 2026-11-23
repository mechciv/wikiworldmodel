// Forms: what a body is made of, as data. These check the language and the plans without a build.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { applyChange, canonicalForm, formSource, resolveForm, type Form, type TreeStep } from '../../../core/form.ts';
import { defaultLeaf, LEAF_CARD_TILES, tileKind } from '../../../core/leaves.ts';
import { MAT, Mesh, STRIDE } from '../city/kit.ts';
import { checkForm, drawAnimal, drawPlant, meshBounds, POSE, unitStance } from './forms.ts';

const PLANS = join(import.meta.dirname, '../../plans');
const plans: Record<string, Form> = Object.fromEntries(readdirSync(PLANS).filter((f) => f.endsWith('.yaml')).map((f) => [f.replace('.yaml', ''), parse(readFileSync(join(PLANS, f), 'utf8')) as Form]));

const bytes = (m: Mesh) => {
  const { vertices, indices } = m.arrays();
  return Buffer.concat([Buffer.from(vertices), Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength)]).toString('base64');
};

describe('a child form', () => {
  const base = canonicalForm(plans.ceratopsian);

  it('changes only what it names: everything else is its parent\'s', () => {
    const child = applyChange(base, { parts: { brow: { r: 0.05 } } });
    expect(child.parts.brow!.r).toBe(0.05);
    expect(child.parts.brow!.from).toEqual(base.parts.brow!.from);
    const { brow: _a, ...restChild } = child.parts;
    const { brow: _b, ...restBase } = base.parts;
    expect(restChild).toEqual(restBase);
    expect(child.behave).toEqual(base.behave);
  });

  it('takes a part away with null, and adds one by a new name', () => {
    const child = applyChange(base, { parts: { nose: null, crest: { type: 'lump', at: [0, 0, 1], r: [0.1, 0.1, 0.1] } } });
    expect(child.parts.nose).toBeUndefined();
    expect(child.parts.crest!.type).toBe('lump');
  });

  it('replaces a list whole', () => {
    const child = applyChange(base, { parts: { brow: { to: [0.1, 0.2, 0.3] } } });
    expect(child.parts.brow!.to).toEqual([0.1, 0.2, 0.3]);
  });

  it('comes out the same whichever way its keys were written', () => {
    const a = applyChange(base, { hip: 0.4, parts: { brow: { r: 0.05, tint: 3 } } });
    const b = applyChange(base, { parts: { brow: { tint: 3, r: 0.05 } }, hip: 0.4 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('the walk up the tree', () => {
  const path = (own: boolean, family: boolean): TreeStep[] => [
    { id: 'species', ...(own ? { change: { parts: { brow: { r: 0.05 } } } } : {}) },
    { id: 'genus' },
    { id: 'family', ...(family ? { change: { parts: { nose: null } } } : {}), plan: 'ceratopsian' },
    { id: 'order', plan: 'hadrosaur' },
  ];

  it('stops at the nearest plan', () => {
    expect(formSource(path(false, false))!.plan).toBe('ceratopsian');
  });

  it('says whose form it is: its own, or the nearest node that has one', () => {
    expect(formSource(path(true, false))).toMatchObject({ from: 'species', own: true });
    expect(formSource(path(false, true))).toMatchObject({ from: 'family', own: false });
    expect(formSource(path(false, false))).toMatchObject({ from: 'family', own: false });
  });

  it('with its form taken away, falls back to the node above, and nothing else changes', () => {
    const withOwn = resolveForm(plans, formSource(path(true, true))!);
    const without = resolveForm(plans, formSource(path(false, true))!);
    expect(withOwn.parts.brow!.r).toBe(0.05);
    expect(without.parts.brow!.r).toBe(canonicalForm(plans.ceratopsian).parts.brow!.r);
    expect(without.parts.nose).toBeUndefined();
    expect(withOwn.parts.nose).toBeUndefined();
  });

  it('has nothing to draw if no node above has a plan', () => {
    expect(formSource([{ id: 'a' }, { id: 'b', change: { hip: 0.2 } }])).toBeUndefined();
  });
});

describe('the plans', () => {
  const names = Object.keys(plans);

  it('are many, and each one is written to the rules', () => {
    expect(names.length).toBeGreaterThanOrEqual(15);
    for (const n of names) expect(checkForm(canonicalForm(plans[n])), n).toEqual([]);
  });

  it('say what they are', () => {
    for (const n of names) expect(plans[n].description, n).toBeTruthy();
  });

  it('draw the same bytes each time', () => {
    for (const n of names) {
      const f = canonicalForm(plans[n]);
      const draw = () => {
        const m = new Mesh(4096);
        if (f.kind === 'animal') drawAnimal(m, f, unitStance(f, POSE.walk, 2));
        else drawPlant(m, f, 12, 7, 2, 90);
        return bytes(m);
      };
      expect(draw(), n).toBe(draw());
    }
  });

  it('get smaller with distance', () => {
    for (const n of names) {
      const f = canonicalForm(plans[n]);
      const size = (d: 0 | 1 | 2) => {
        const m = new Mesh(4096);
        if (f.kind === 'animal') drawAnimal(m, f, unitStance(f, POSE.stand, d));
        else drawPlant(m, f, 12, 7, d, 90);
        return m.verts;
      };
      expect(size(1), n).toBeLessThanOrEqual(size(2));
      expect(size(0), n).toBeLessThanOrEqual(size(1));
    }
  });

  it('hold a plant\'s leaves on cards close by, on fewer from a little way off and fewer still from a way off, and never on the lighter way', () => {
    // The materials of leaves on cards (world/generators/city/kit.ts).
    const onCards = new Set<number>([MAT.needleCard, MAT.frondCard, MAT.broadCard, MAT.fanCard]);
    const cards = (m: Mesh) => {
      const { vertices } = m.arrays();
      const b = new Uint8Array(vertices);
      let n = 0;
      for (let i = 0; i < m.verts; i++) if (onCards.has(b[i * STRIDE + 24])) n++;
      return n;
    };
    for (const n of names) {
      const f = canonicalForm(plans[n]);
      if (f.kind !== 'plant') continue;
      const draw = (d: 0 | 1 | 2, withCards: boolean, coarse = false) => {
        const m = new Mesh(4096);
        drawPlant(m, f, 12, 7, d, 90, withCards, coarse);
        return m;
      };
      // A tuft's blades are its own close by, and a mat floats: neither has leaves on cards there.
      const leafy = Object.values(f.parts).some((p) => p && p.type !== 'tuft' && p.type !== 'mat');
      if (leafy) {
        expect(cards(draw(2, true)), n).toBeGreaterThan(0);
        // The same plant a little way off, with boughs for its sprays: no more of it, and still in leaf.
        expect(cards(draw(2, true, true)), n).toBeGreaterThan(0);
        expect(draw(2, true, true).verts, n).toBeLessThanOrEqual(draw(2, true).verts);
        expect(cards(draw(1, true)), n).toBeLessThanOrEqual(cards(draw(2, true, true)));
      }
      expect(cards(draw(1, false)), n).toBe(0);
      expect(cards(draw(0, true)), n).toBe(0);
    }
  });

  it('show a tile of the atlas of leaves on every card: one of its part\'s kind, from the twig\'s foot to its tip', () => {
    const onCards = new Set<number>([MAT.needleCard, MAT.frondCard, MAT.broadCard, MAT.fanCard]);
    for (const n of names) {
      const f = canonicalForm(plans[n]);
      if (f.kind !== 'plant') continue;
      const kinds = new Set(Object.values(f.parts).flatMap((p) => (p ? [(p.leaf as string | undefined) ?? defaultLeaf(p.type, p.mat as string | undefined)] : [])));
      for (const coarse of [false, true]) {
        const m = new Mesh(4096);
        drawPlant(m, f, 12, 7, 2, 90, true, coarse);
        const { vertices } = m.arrays();
        const b = new Uint8Array(vertices);
        const fl = new Float32Array(vertices);
        for (let i = 0; i < m.verts; i++) {
          if (!onCards.has(b[i * STRIDE + 24])) continue;
          const u = fl[i * 7 + 4];
          const v = fl[i * 7 + 5];
          const tile = Math.floor(u);
          expect(tile, n).toBeGreaterThanOrEqual(0);
          expect(tile, n).toBeLessThan(LEAF_CARD_TILES);
          // Within its tile, clear of the next; and along it from 0 to 1.
          expect(u - tile, n).toBeGreaterThan(0.005);
          expect(u - tile, n).toBeLessThan(0.995);
          expect(v, n).toBeGreaterThanOrEqual(0);
          expect(v, n).toBeLessThanOrEqual(1);
          // A horsetail's own tile stands for the whole plant; a tree of it has leafy branches, as bottle brushes.
          const kind = tileKind(tile).kind;
          expect(kinds.has(kind) || (kinds.has('whorl') && kind === 'needle-awl'), `${n}: a card of ${kind}`).toBe(true);
        }
      }
    }
  });

  it('make a tuft\'s blades thin leaves, each the colour of its material in a shade of its own, as on a card of blades', () => {
    // Whose colour a blade takes, by its material: as a card of blades has it.
    const family: Record<string, number> = { frond: 1, needle: 2, broad: 3 };
    let tufts = 0;
    for (const n of names) {
      const f = canonicalForm(plans[n]);
      const parts = Object.values(f.parts).filter((p) => !!p);
      if (!parts.length || !parts.every((p) => p!.type === 'tuft')) continue;
      // Only blades are drawn one by one: a tuft of soft leaves, or of leafy stems, is cards of them.
      if (!parts.every((p) => ((p!.leaf as string | undefined) ?? defaultLeaf('tuft', p!.mat as string | undefined)).startsWith('blade'))) continue;
      tufts++;
      const m = new Mesh(4096);
      drawPlant(m, f, 1, 7, 2, 90);
      const { vertices } = m.arrays();
      const b = new Uint8Array(vertices);
      const fl = new Float32Array(vertices);
      const shades = new Set<number>();
      for (let i = 0; i < m.verts; i++) {
        expect(b[i * STRIDE + 24], n).toBe(MAT.blade);
        // u across the blade; v's whole part the family by eight and the blade's own number, its fraction the way up.
        expect(Math.abs(fl[i * 7 + 4]), n).toBe(1);
        const k = Math.floor(fl[i * 7 + 5]);
        expect(Math.floor(k / 8), n).toBe(family[(parts[0]!.mat as string) ?? 'frond']);
        shades.add(k % 8);
      }
      expect(shades.size, n).toBeGreaterThan(4);
    }
    expect(tufts).toBeGreaterThanOrEqual(3);
  });

  it('stand on the ground', () => {
    for (const n of names) {
      const f = canonicalForm(plans[n]);
      if (f.kind !== 'animal') continue;
      const m = new Mesh(4096);
      drawAnimal(m, f, unitStance(f, POSE.stand, 2));
      const { low, high } = meshBounds(m);
      expect(low, n).toBeGreaterThan(-0.06);
      expect(high, n).toBeGreaterThan(0);
    }
  });
});

describe('the validator', () => {
  const good = () => canonicalForm(plans.ceratopsian);

  it('refuses a part it does not know', () => {
    const f = good();
    f.parts.wings = { type: 'propeller' };
    expect(checkForm(f).join()).toContain('no type "propeller"');
  });

  it('refuses a field a part does not have', () => {
    const f = good();
    f.parts.brow = { ...f.parts.brow!, curl: 3 };
    expect(checkForm(f).join()).toContain('no field "curl"');
  });

  it('refuses a part with something it needs missing', () => {
    const f = good();
    f.parts.brow = { type: 'spike', from: [0, 0, 0] };
    expect(checkForm(f).join()).toContain('needs "to"');
  });

  it('refuses a material there is not', () => {
    const f = good();
    f.parts.brow = { ...f.parts.brow!, mat: 'chrome' };
    expect(checkForm(f).join()).toContain('no material "chrome"');
  });

  it('refuses a plant\'s part on an animal', () => {
    const f = good();
    f.parts.crown = { type: 'palm' };
    expect(checkForm(f).join()).toContain('belongs to a plant');
  });

  it('refuses a body below the ground', () => {
    const f = good();
    f.parts.anchor = { type: 'lump', at: [0, 0, -2], r: [0.1, 0.1, 0.1] };
    expect(checkForm(f).join()).toContain('below the ground');
  });

  it('refuses a body past its budget', () => {
    const f = good();
    f.parts.fuzz = { type: 'row', n: 400, from: [0, -0.5, 1], to: [0, 0.5, 1], item: 'lump', r: [0.01, 0.01, 0.01], mirror: true };
    f.parts.fuzz2 = { type: 'lump', at: [0, 0, 1], r: [0.1, 0.1, 0.1], sides: [200, 100], bands: [200, 100] };
    expect(checkForm(f).join()).toContain('over the budget');
  });
});
