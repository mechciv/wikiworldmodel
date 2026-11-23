// Forms: what a body is made of, as data. These check the language and the plans without a build.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { applyChange, canonicalForm, formSource, resolveForm, type Form, type TreeStep } from '../../../core/form.ts';
import { defaultLeaf, LEAF_CARD_TILES, tileKind } from '../../../core/leaves.ts';
import { MAT, Mesh, STRIDE } from '../city/kit.ts';
import { BONE, bone, checkForm, drawAnimal, drawPlant, meshBounds, POSE, unitStance, type Stance } from './forms.ts';

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

  it('changes one row of a list by its number, and leaves the others as they were', () => {
    const rings = base.parts.body!.rings as number[][];
    const child = applyChange(base, { parts: { body: { rings: { 6: [-0.02, 1.2, 0.3, 0.122] } } } });
    const now = child.parts.body!.rings as number[][];
    expect(now).toHaveLength(rings.length);
    expect(now[6]).toEqual([-0.02, 1.2, 0.3, 0.122]);
    expect(now.filter((_, i) => i !== 6)).toEqual(rings.filter((_, i) => i !== 6));
    // And one number of one row, by the same rule a level down.
    const one = applyChange(base, { parts: { body: { rings: { 6: { 1: 1.2 } } } } });
    expect((one.parts.body!.rings as number[][])[6]).toEqual([rings[6][0], 1.2, rings[6][2], rings[6][3]]);
  });

  it('takes a row away with null, and adds one between two rows or past the last', () => {
    const rings = base.parts.body!.rings as number[][];
    const child = applyChange(base, { parts: { body: { rings: { 0: null, 5.5: [-0.06, 1.1, 0.31, 0.12], [rings.length]: [0.29, 0.7, 0.45, 0.04] } } } });
    const now = child.parts.body!.rings as number[][];
    expect(now).toHaveLength(rings.length + 1);
    expect(now[0]).toEqual(rings[1]);
    expect(now[5]).toEqual([-0.06, 1.1, 0.31, 0.12]);
    expect(now[4]).toEqual(rings[5]);
    expect(now[6]).toEqual(rings[6]);
    expect(now[now.length - 1]).toEqual([0.29, 0.7, 0.45, 0.04]);
    // A whole list still replaces a whole list, and what a later child changes is the list as it then is.
    const twice = applyChange(child, { parts: { body: { rings: { 0: [-0.5, 0.4, 0.3, 0.01] } } } });
    expect((twice.parts.body!.rings as number[][])[0]).toEqual([-0.5, 0.4, 0.3, 0.01]);
    expect((twice.parts.body!.rings as number[][]).slice(1)).toEqual(now.slice(1));
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

  it('say how far each point of a leg goes with its stride: not at all at the hip, wholly at the foot, half its legs against the other half', () => {
    // What each vertex moves with, and how far, with where it is: its side, how far along the body, and how high.
    const legs = (n: string, pose: number = POSE.stand) => {
      const f = canonicalForm(plans[n]);
      const m = new Mesh(4096);
      drawAnimal(m, f, unitStance(f, pose, 2));
      const { vertices } = m.arrays();
      const at = new Float32Array(vertices);
      const code = new Uint16Array(vertices);
      const out: { bone: number; w: number; x: number; y: number; z: number }[] = [];
      for (let i = 0; i < m.verts; i++) {
        const c = code[i * 14 + 13];
        if ((c & 15) === BONE.stride || (c & 15) === BONE.counter) out.push({ bone: c & 15, w: (c >> 4) / 255, x: at[i * 7], y: at[i * 7 + 1], z: at[i * 7 + 2] });
      }
      return out;
    };
    for (const n of ['ceratopsian', 'tyrannosaur', 'hadrosaur', 'lizard', 'ox']) {
      const pts = legs(n);
      expect(pts.length, n).toBeGreaterThan(50);
      // The further down, the more: what goes least with a stride is high on the body, what goes wholly is on the ground.
      const top = Math.max(...pts.map((p) => p.z));
      expect(Math.max(...pts.filter((p) => p.w < 0.1).map((p) => p.z)), n).toBeGreaterThan(top * 0.7);
      for (const p of pts.filter((q) => q.w > 0.98)) expect(p.z, n).toBeLessThan(top * 0.2);
      // The left and the right of each pair of legs stride against each other: of the feet that stand side by side,
      // those on one side go with one stride and those on the other with the other.
      const feet = pts.filter((p) => p.w > 0.98);
      const pairs = new Map<number, { left: Set<number>; right: Set<number> }>();
      for (const p of feet) {
        const k = Math.round(p.y / 0.1);
        const pair = pairs.get(k) ?? pairs.set(k, { left: new Set(), right: new Set() }).get(k)!;
        (p.x < 0 ? pair.left : pair.right).add(p.bone);
      }
      let both = 0;
      for (const { left, right } of pairs.values()) {
        if (!left.size || !right.size) continue;
        both++;
        expect([left.size, right.size], n).toEqual([1, 1]);
        expect([...left][0], n).not.toBe([...right][0]);
      }
      expect(both, n).toBeGreaterThan(0);
    }
    // What has no legs strides with nothing; and a head, a trunk and a tail still move with what they did.
    expect(legs('fish')).toEqual([]);
    expect(legs('snake')).toEqual([]);
  });
});

// What the vertices of one material are, so that a test can look at one part of a body: [x, y, z] each.
const points = (m: Mesh, mat: number): number[][] => {
  const { vertices } = m.arrays();
  const f = new Float32Array(vertices);
  const b = new Uint8Array(vertices);
  const out: number[][] = [];
  for (let i = 0; i < m.verts; i++) if (b[i * STRIDE + 24] === mat) out.push([f[i * 7], f[i * 7 + 1], f[i * 7 + 2]]);
  return out;
};
const span = (pts: number[][], axis: number): [number, number] => [Math.min(...pts.map((q) => q[axis])), Math.max(...pts.map((q) => q[axis]))];
const middle = (pts: number[][]): number[] => [0, 1, 2].map((a) => (span(pts, a)[0] + span(pts, a)[1]) / 2);
/** What each vertex of one material moves with. */
const bones = (m: Mesh, mat: number): Set<number> => {
  const { vertices } = m.arrays();
  const b = new Uint8Array(vertices);
  const e = new Uint16Array(vertices);
  const out = new Set<number>();
  for (let i = 0; i < m.verts; i++) if (b[i * STRIDE + 24] === mat) out.add(e[i * 14 + 13]);
  return out;
};

describe('what a plan can say of a shape', () => {
  // A plain body to try each field on: a level tube of a trunk, a metre long with its hips half a metre up.
  const plain = (parts: Form['parts'] = {}): Form => ({
    kind: 'animal',
    hip: 0.5,
    parts: {
      body: { type: 'trunk', sides: [16, 8], rings: [[-0.4, 1, 0.6, 0.02], [-0.3, 1, 0.6, 0.1], [0, 1, 0.6, 0.1], [0.3, 1, 0.6, 0.1], [0.4, 1, 0.6, 0.02]] },
      ...parts,
    },
  });
  const stance = (f: Form, pose: number = POSE.stand, more: Partial<Stance> = {}): Stance => ({ ...unitStance(f, pose, 2), ...more });
  const draw = (f: Form, pose: number = POSE.stand, more: Partial<Stance> = {}): Mesh => {
    expect(checkForm(canonicalForm(f))).toEqual([]);
    const m = new Mesh(4096);
    drawAnimal(m, f, stance(f, pose, more));
    return m;
  };
  const withBody = (over: Record<string, unknown>): Form => {
    const f = plain();
    f.parts.body = { ...f.parts.body!, ...over };
    return f;
  };
  /** The body's vertices about its middle ring, where its section is its own. */
  const section = (f: Form) => points(draw(f), MAT.hide).filter((q) => Math.abs(q[1]) < 0.001);

  it('draws a section that says nothing of its shape as the ellipse it was, to the byte', () => {
    expect(bytes(draw(withBody({ widest: 0, under: 0, over: 0 })))).toBe(bytes(draw(plain())));
    expect(bytes(draw(withBody({ widest: [[-0.4, 0], [0.4, 0]] })))).toBe(bytes(draw(plain())));
  });

  it('puts a section\'s widest line where the part says, between its bottom and its top, which stay where they were', () => {
    const widestAt = (f: Form) => {
      const ring = section(f);
      const w = Math.max(...ring.map((q) => q[0]));
      return { z: ring.find((q) => q[0] === w)![2], w, z0: span(ring, 2)[0], z1: span(ring, 2)[1] };
    };
    const even = widestAt(plain());
    const low = widestAt(withBody({ widest: -0.5 }));
    const high = widestAt(withBody({ widest: 0.5 }));
    expect(even.z).toBeCloseTo(0.4, 5);
    // The section is 0.2 tall, from 0.3 to 0.5: half way down its lower half is at 0.35, and up its upper at 0.45.
    expect(low.z).toBeCloseTo(0.35, 5);
    expect(high.z).toBeCloseTo(0.45, 5);
    for (const s of [low, high]) {
      expect(s.w).toBeCloseTo(even.w, 5);
      expect(s.z0).toBeCloseTo(even.z0, 5);
      expect(s.z1).toBeCloseTo(even.z1, 5);
    }
  });

  it('squares a section\'s underside or its top, and leaves the other half round', () => {
    // How far out the skin is a little under the top and a little over the bottom: a square's corner is further out.
    const corners = (f: Form) => {
      const ring = section(f);
      const at = (z: number) => Math.max(...ring.filter((q) => Math.abs(q[2] - z) < 0.012).map((q) => q[0]));
      return { top: at(0.48), bottom: at(0.32) };
    };
    const round = corners(plain());
    const flat = corners(withBody({ under: 1 }));
    const boxed = corners(withBody({ over: 1 }));
    expect(flat.bottom).toBeGreaterThan(round.bottom * 1.25);
    expect(flat.top).toBeCloseTo(round.top, 5);
    expect(boxed.top).toBeGreaterThan(round.top * 1.25);
    expect(boxed.bottom).toBeCloseTo(round.bottom, 5);
    // It is no wider and no deeper for it.
    expect(span(section(withBody({ under: 1, over: 1 })), 0)[1]).toBeCloseTo(0.1, 5);
    expect(span(section(withBody({ under: 1, over: 1 })), 2)).toEqual(span(section(plain()), 2));
  });

  it('shapes a section by where it is along the part, and rounds it off along a neck', () => {
    const f = withBody({ under: [[-0.3, 0], [0, 1], [0.3, 0]] });
    const at = (y: number) => {
      const ring = points(draw(f), MAT.hide).filter((q) => Math.abs(q[1] - y) < 0.001);
      return Math.max(...ring.filter((q) => Math.abs(q[2] - 0.32) < 0.012).map((q) => q[0]));
    };
    const round = Math.max(...section(plain()).filter((q) => Math.abs(q[2] - 0.32) < 0.012).map((q) => q[0]));
    expect(at(0)).toBeGreaterThan(round * 1.25);
    expect(at(0.3)).toBeCloseTo(round, 5);
    expect(at(-0.3)).toBeCloseTo(round, 5);
    // A head's or a tube's sections take the same fields, by the place along it that its rings are written at.
    const tube = plain({ pipe: { type: 'tube', mat: 'horn', zl: true, thin: false, sides: [16, 8], rings: [[0.5, 0.3, 0.05, 0.05], [0.6, 0.3, 0.05, 0.05], [0.7, 0.3, 0.05, 0.05]], widest: -0.5 } });
    const ring = points(draw(tube), MAT.horn).filter((q) => Math.abs(q[1] - 0.6) < 0.001);
    const w = Math.max(...ring.map((q) => q[0]));
    expect(ring.find((q) => q[0] === w)![2]).toBeCloseTo(0.275, 5);
  });

  it('makes a leg narrower across than its radius, as its top and its foot say, and no thinner fore and aft', () => {
    const legs = (over: Record<string, unknown>, type = 'pillar') => {
      const f = plain({ leg: { type, mat: 'horn', y: 0, x: 0.2, top: 0.5, r: 0.04, muscle: 0, ...(type === 'digitigrade' ? { knee: 0.3, ankle: 0.12, toes: false } : {}), ...over } });
      return points(draw(f), MAT.horn).filter((q) => q[0] > 0);
    };
    for (const type of ['pillar', 'digitigrade']) {
      const whole = legs({}, type);
      const narrow = legs({ across: 0.5 }, type);
      const thigh = legs({ across: [0.5, 1] }, type);
      const wide = (pts: number[][], z0: number, z1: number) => { const part = pts.filter((q) => q[2] >= z0 && q[2] <= z1); return span(part, 0)[1] - span(part, 0)[0]; };
      const deep = (pts: number[][]) => span(pts, 1)[1] - span(pts, 1)[0];
      // Its top joint, and its foot.
      expect(wide(narrow, 0.24, 0.26), type).toBeCloseTo(wide(whole, 0.24, 0.26) / 2, 4);
      expect(wide(narrow, 0, 0.015), type).toBeCloseTo(wide(whole, 0, 0.015) / 2, 4);
      expect(deep(narrow), type).toBeCloseTo(deep(whole), 6);
      // Narrow at the top only: the foot is as wide as it was.
      expect(wide(thigh, 0.24, 0.26), type).toBeCloseTo(wide(whole, 0.24, 0.26) / 2, 4);
      expect(wide(thigh, 0, 0.015), type).toBeCloseTo(wide(whole, 0, 0.015), 4);
      expect(bytes(draw(plain({ leg: { type, y: 0, x: 0.2, top: 0.5, r: 0.04, across: 1 } }))), type).toBe(bytes(draw(plain({ leg: { type, y: 0, x: 0.2, top: 0.5, r: 0.04 } }))));
    }
  });

  it('keeps a straight leg as thick all the way down as a column, by as much as it says', () => {
    const thinnest = (column: number) => {
      const f = plain({ leg: { type: 'pillar', mat: 'horn', y: 0, x: 0.2, top: 0.5, r: 0.04, muscle: 0, column } });
      const leg = points(draw(f), MAT.horn).filter((q) => q[0] > 0);
      // How wide it is across at its cannon, the joint three quarters of the way down, where it is thinnest.
      const cannon = leg.filter((q) => q[2] > 0.05 && q[2] < 0.08);
      return span(cannon, 0)[1] - span(cannon, 0)[0];
    };
    expect(thinnest(0)).toBeCloseTo(0.08 * 0.6, 2);
    expect(thinnest(1)).toBeCloseTo(0.08, 2);
    expect(thinnest(0.5)).toBeGreaterThan(thinnest(0));
    expect(thinnest(0.5)).toBeLessThan(thinnest(1));
    expect(bytes(draw(plain({ leg: { type: 'pillar', y: 0, x: 0.2, top: 0.5, r: 0.04, column: 0 } })))).toBe(bytes(draw(plain({ leg: { type: 'pillar', y: 0, x: 0.2, top: 0.5, r: 0.04 } }))));
    // A bent leg thins from its knee to its hock, and as a column does not.
    const hock = (column: number) => {
      const f = plain({ leg: { type: 'digitigrade', mat: 'horn', y: 0, x: 0.2, top: 0.5, knee: 0.3, ankle: 0.12, r: 0.04, muscle: 0, toes: false, column } });
      const leg = points(draw(f), MAT.horn).filter((q) => q[0] > 0 && q[2] > 0.05 && q[2] < 0.07);
      return span(leg, 0)[1] - span(leg, 0)[0];
    };
    expect(hock(0)).toBeCloseTo(0.08 * 0.27, 2);
    expect(hock(1)).toBeCloseTo(0.08, 2);
    expect(bytes(draw(plain({ leg: { type: 'digitigrade', y: 0, x: 0.2, top: 0.5, knee: 0.3, ankle: 0.12, r: 0.04, column: 0 } })))).toBe(bytes(draw(plain({ leg: { type: 'digitigrade', y: 0, x: 0.2, top: 0.5, knee: 0.3, ankle: 0.12, r: 0.04 } }))));
  });

  it('hangs a part on another part\'s end, so that it goes where the end goes, on each side of the body', () => {
    const f = (reach: number) =>
      plain({
        arm: { type: 'chain', mirror: true, zl: true, points: [[0.1, 0.3, 0.4, 0.02], [0.2, 0.4, 0.4, 0.02], [0.2 + reach, 0.4 + reach, 0.4, 0.02]] },
        hand: { type: 'lump', mat: 'horn', mirror: true, on: 'arm', at: [0, 0.05, 0], r: [0.01, 0.01, 0.01] },
      });
    for (const reach of [0.1, 0.3]) {
      const hands = points(draw(f(reach)), MAT.horn);
      for (const side of [-1, 1]) {
        const hand = middle(hands.filter((q) => q[0] * side > 0));
        // 0.05 on along the arm's run from its end, which runs out and forward at half a right angle.
        expect(hand[0]).toBeCloseTo(side * (0.2 + reach + 0.05 * Math.SQRT1_2), 5);
        expect(hand[1]).toBeCloseTo(0.4 + reach + 0.05 * Math.SQRT1_2, 5);
        expect(hand[2]).toBeCloseTo(0.4, 5);
      }
    }
    // Across and up are square to the run: a point up from a tube's end that runs up and forward leans back.
    const g = plain({
      stalk: { type: 'tube', zl: true, thin: false, rings: [[0.4, 0.4, 0.02, 0.02], [0.5, 0.5, 0.02, 0.02]] },
      knob: { type: 'lump', mat: 'horn', on: 'stalk', at: [0.03, 0, 0.1], r: [0.01, 0.01, 0.01] },
    });
    const knob = middle(points(draw(g), MAT.horn));
    expect(knob[0]).toBeCloseTo(0.03, 5);
    expect(knob[1]).toBeCloseTo(0.5 - 0.1 * Math.SQRT1_2, 5);
    expect(knob[2]).toBeCloseTo(0.5 + 0.1 * Math.SQRT1_2, 5);
  });

  it('hangs a part on a part that itself hangs, moves it with what that moves with, and draws it only where that is drawn', () => {
    const f = plain({
      arm: { type: 'chain', zl: true, poses: ['stand'], points: [[0, 0.4, 0.4, 0.02], [0, 0.5, 0.4, 0.02]] },
      wrist: { type: 'spike', mat: 'shell', on: 'arm', from: [0, 0, 0], to: [0, 0.1, 0], r: 0.01 },
      eyes: { type: 'eyes', on: 'wrist', at: [0.02, 0.05, 0], r: 0.01 },
      tip: { type: 'lump', mat: 'horn', on: 'body', at: [0, 0.02, 0], r: [0.01, 0.01, 0.01] },
    });
    const m = draw(f);
    const eyes = points(m, MAT.eye);
    expect(middle(eyes)[1]).toBeCloseTo(0.5 + 0.1 + 0.05, 5);
    expect(span(eyes, 0)[0]).toBeLessThan(-0.01);
    expect(span(eyes, 0)[1]).toBeGreaterThan(0.01);
    // A chain moves with nothing, and so does what hangs on it, eyes and all; what hangs on a trunk breathes with it.
    expect([...bones(m, MAT.eye)]).toEqual([bone(BONE.none)]);
    expect([...bones(m, MAT.shell)]).toEqual([bone(BONE.none)]);
    expect([...bones(m, MAT.horn)]).toEqual([bone(BONE.body)]);
    // On the trunk's end: its last ring, the way it runs there.
    expect(middle(points(m, MAT.horn))[1]).toBeCloseTo(0.42, 5);
    const walking = draw(f, POSE.walk);
    expect(points(walking, MAT.eye)).toHaveLength(0);
    expect(points(walking, MAT.shell)).toHaveLength(0);
    expect(points(walking, MAT.horn).length).toBeGreaterThan(0);
  });

  it('strides what a leg bears with the leg: a claw on its foot wholly, a cuff half way down it by half', () => {
    // A pair of legs that swing, as a lizard's: out from the body and down to the ground.
    const f = plain({
      leg: { type: 'chain', mirror: true, zl: true, swing: 0.04, points: [[0.1, 0.2, 0.4, 0.02], [0.2, 0.2, 0.2, 0.02], [0.2, 0.2, 0, 0.02]] },
      claw: { type: 'spike', mat: 'horn', mirror: true, on: 'leg', from: [0, 0, 0], to: [0, 0.03, 0], r: 0.005 },
      cuff: { type: 'lump', mat: 'shell', mirror: true, ride: 'leg', at: [0, 0.5, 0], r: [0.004, 0.004, 0.004] },
    });
    const m = draw(f);
    const { vertices } = m.arrays();
    const fl = new Float32Array(vertices);
    const b = new Uint8Array(vertices);
    const e = new Uint16Array(vertices);
    const codes = (mat: number, side: number) => {
      const out = new Set<number>();
      for (let i = 0; i < m.verts; i++) if (b[i * STRIDE + 24] === mat && fl[i * 7] * side > 0) out.add(e[i * 14 + 13]);
      return [...out];
    };
    // The legs of the two sides stride against each other, and each claw goes with its own foot, all the way.
    const right = codes(MAT.horn, 1);
    const left = codes(MAT.horn, -1);
    expect(right).toHaveLength(1);
    expect(left).toHaveLength(1);
    expect(new Set([right[0] & 15, left[0] & 15])).toEqual(new Set([BONE.stride, BONE.counter]));
    expect(right[0] >> 4).toBe(255);
    expect(left[0] >> 4).toBe(255);
    // The foot's own vertices have the same code as the claw on it.
    const legs = codes(MAT.hide, 1).filter((c) => (c & 15) === (right[0] & 15));
    expect(legs).toContain(right[0]);
    // Half way along the leg's length is its knee, half way down: the cuff goes half as far.
    for (const side of [-1, 1]) {
      const [cuff] = codes(MAT.shell, side);
      expect(cuff & 15).toBe((side > 0 ? right[0] : left[0]) & 15);
      expect((cuff >> 4) / 255).toBeCloseTo(0.5, 1);
    }
    // What hangs on a part that does not stride moves as it did: with nothing, on a chain that is no leg.
    const still = plain({
      neck: { type: 'chain', zl: true, points: [[0, 0.4, 0.4, 0.02], [0, 0.6, 0.4, 0.02]] },
      nose: { type: 'spike', mat: 'horn', on: 'neck', from: [0, 0, 0], to: [0, 0.03, 0], r: 0.005 },
    });
    expect([...bones(draw(still), MAT.horn)]).toEqual([bone(BONE.none)]);
  });

  it('sets what rides a body on its skin: on its back, round its flank and under it, wherever its rings put them', () => {
    const rider = (round: number, y: number, off = 0) => plain({ stud: { type: 'lump', mat: 'horn', ride: 'body', at: [round, y, off], r: [0.004, 0.004, 0.004] } });
    const at = (f: Form) => middle(points(draw(f), MAT.horn));
    // The level trunk is 0.1 wide each way and 0.1 deep each way about 0.4.
    for (const [round, x, z] of [[0, 0, 0.5], [1, 0.1, 0.4], [-1, -0.1, 0.4], [2, 0, 0.3], [0.5, 0.1 * Math.SQRT1_2, 0.4 + 0.1 * Math.SQRT1_2]]) {
      const q = at(rider(round, 0.1));
      expect(q[0], `round ${round}`).toBeCloseTo(x, 4);
      expect(q[1], `round ${round}`).toBeCloseTo(0.1, 4);
      expect(q[2], `round ${round}`).toBeCloseTo(z, 4);
    }
    // Off the skin is the way the skin faces: up on the back, out on the flank.
    expect(at(rider(0, 0.1, 0.05))[2]).toBeCloseTo(0.55, 4);
    expect(at(rider(1, 0.1, 0.05))[0]).toBeCloseTo(0.15, 4);
    // A back that is arched carries it up, and a section that is not an ellipse carries it out.
    const arched = rider(0, 0);
    arched.parts.body = { ...arched.parts.body!, rings: { 2: [0, 1.4, 0.6, 0.1] } } as never;
    expect(at(applyChange(canonicalForm(plain()), { parts: { stud: arched.parts.stud, body: { rings: { 2: [0, 1.4, 0.6, 0.1] } } } }))[2]).toBeCloseTo(0.7, 4);
    const boxed = rider(0.5, 0.1);
    boxed.parts.body = { ...boxed.parts.body!, over: 1 };
    expect(at(boxed)[0]).toBeGreaterThan(0.1 * Math.SQRT1_2 * 1.15);
    // Past the trunk's ends it stays on its last ring.
    expect(at(rider(0, 0.9))[1]).toBeCloseTo(0.4, 4);
  });

  it('sets what rides a chain, a tube or a head on its skin by the share of its length, wherever a child puts it', () => {
    // A neck that runs level and forward, then one twice as long that rises: eyes ride it four fifths of the way along.
    const necked = (joints: number[][]) =>
      plain({
        neck: { type: 'chain', zl: true, points: joints },
        eyes: { type: 'eyes', ride: 'neck', at: [1, 0.8, 0], r: 0.004 },
      });
    const short = points(draw(necked([[0, 0.4, 0.4, 0.03], [0, 0.5, 0.4, 0.03], [0, 0.6, 0.4, 0.03]])), MAT.eye);
    expect(middle(short)[1]).toBeCloseTo(0.56, 4);
    expect(middle(short)[2]).toBeCloseTo(0.4, 4);
    // One on each flank, at the neck's own radius.
    expect(span(short, 0)[0]).toBeCloseTo(-0.03 - 0.004 * 0.7, 4);
    expect(span(short, 0)[1]).toBeCloseTo(0.03 + 0.004 * 0.7, 4);
    const long = points(draw(necked([[0, 0.4, 0.4, 0.03], [0, 0.6, 0.6, 0.02], [0, 0.8, 0.8, 0.01]])), MAT.eye);
    expect(middle(long)[1]).toBeCloseTo(0.72, 4);
    expect(middle(long)[2]).toBeCloseTo(0.72, 4);
    // Thinner there, and the eyes closer in for it: still on the skin.
    expect(span(long, 0)[1]).toBeLessThan(0.02);
    expect(span(long, 0)[1]).toBeGreaterThan(0.014);
    // On a mirrored chain, each side's rider is on that side's chain; and it moves with what the chain moves with.
    const arms = plain({
      arm: { type: 'chain', mirror: true, zl: true, points: [[0.1, 0.3, 0.4, 0.02], [0.3, 0.3, 0.4, 0.02]] },
      cuff: { type: 'lump', mat: 'horn', mirror: true, ride: 'arm', at: [0, 0.5, 0], r: [0.005, 0.005, 0.005] },
    });
    const m = draw(arms);
    const cuffs = points(m, MAT.horn);
    for (const side of [-1, 1]) {
      const cuff = middle(cuffs.filter((q) => q[0] * side > 0));
      expect(cuff[0]).toBeCloseTo(side * 0.2, 4);
      expect(cuff[2]).toBeCloseTo(0.42, 4);
    }
    expect([...bones(m, MAT.horn)]).toEqual([bone(BONE.none)]);
    // The way round is counted level whichever way a part runs: 0 is on top and 1 on the body's right, on a tail that runs back too.
    const tail = (round: number) => plain({ tail: { type: 'chain', zl: true, points: [[0, -0.4, 0.4, 0.02], [0, -0.6, 0.4, 0.02]] }, stud: { type: 'lump', mat: 'horn', ride: 'tail', at: [round, 0.5, 0], r: [0.004, 0.004, 0.004] } });
    expect(middle(points(draw(tail(0)), MAT.horn))[2]).toBeCloseTo(0.42, 4);
    expect(middle(points(draw(tail(1)), MAT.horn))[0]).toBeCloseTo(0.02, 4);
    expect(middle(points(draw(tail(-1)), MAT.horn))[0]).toBeCloseTo(-0.02, 4);
    expect(middle(points(draw(tail(2)), MAT.horn))[2]).toBeCloseTo(0.38, 4);
    // A head's skin, as it is drawn: half way along it, on its top.
    const headed = plain({
      head: { type: 'head', at: { stand: { y: 0.5, z: 0.8, pitch: 0 } }, thin: false, rings: [[0, 0, 0.03, 0.03], [0.1, 0, 0.03, 0.03], [0.2, 0, 0.03, 0.03]] },
      stud: { type: 'lump', mat: 'horn', ride: 'head', at: [0, 0.5, 0], r: [0.004, 0.004, 0.004] },
    });
    const h = draw(headed);
    expect(middle(points(h, MAT.horn))[1]).toBeCloseTo(0.6, 4);
    expect(middle(points(h, MAT.horn))[2]).toBeCloseTo(0.4 + 0.03, 4);
    expect([...bones(h, MAT.horn)]).toEqual([bone(BONE.head)]);
  });

  it('runs a row along a back\'s curve, and leans its plates out from the body\'s middle', () => {
    const f = (more: Record<string, unknown>) => {
      const g = applyChange(canonicalForm(plain()), { parts: { body: { rings: { 2: [0, 1.4, 0.6, 0.1] } } } });
      g.parts.plates = { type: 'row', mat: 'horn', n: 7, item: 'plate', from: [0.2, -0.3, 0], to: [0.2, 0.3, 0], r: [0, 0.02, 0.05], ...more };
      return g;
    };
    // A plate is five points, drawn on each of its two faces: the seven of the row, in turn.
    const plate = (pts: number[][], k: number) => pts.slice(k * 10, k * 10 + 10);
    const plates = points(draw(f({ ride: 'body' })), MAT.horn);
    expect(plates).toHaveLength(70);
    // Each plate's foot is on the skin: the middle one high on the arch, the end ones low on the level back.
    const foot = (k: number) => span(plate(plates, k), 2)[0];
    expect(foot(3)).toBeGreaterThan(foot(0) + 0.15);
    expect(foot(6)).toBeCloseTo(foot(0), 2);
    expect(foot(3)).toBeCloseTo(0.5 + 0.2 * Math.sin(0.4 * Math.PI), 2);
    // Riding to one side of the back, a plate stands off the skin as it faces, a little outward; leaning, further out.
    const tip = (pts: number[][]) => { const z = span(pts, 2)[1]; return pts.find((q) => q[2] === z)![0]; };
    const upright = tip(plate(plates, 3));
    const leaning = tip(plate(points(draw(f({ ride: 'body', lean: 0.5 })), MAT.horn), 3));
    expect(upright).toBeGreaterThan(span(plate(plates, 3), 0)[0] + 0.005);
    expect(leaning).toBeGreaterThan(upright + 0.015);
    // In the body's own frame a plate stands straight up, and leans out by its share of its height: on the left, to the left.
    const level = points(draw(f({ zl: true, from: [-0.05, -0.3, 0.6], to: [-0.05, 0.3, 0.6], lean: 0.4 })), MAT.horn);
    expect(tip(level)).toBeCloseTo(-0.05 - 0.4 * 0.05, 2);
    const straight = points(draw(f({ zl: true, from: [-0.05, -0.3, 0.6], to: [-0.05, 0.3, 0.6] })), MAT.horn);
    expect(span(straight, 0)[1] - span(straight, 0)[0]).toBeLessThan(0.02);
  });

  it('gives a frill an edge as thick as its rim says, and none where it says nothing', () => {
    const f = (more: Record<string, unknown>) =>
      plain({
        head: { type: 'head', at: { stand: { y: 0.5, z: 0.8, pitch: 0 } }, rings: [[0, 0, 0.03, 0.03], [0.1, 0, 0.03, 0.03]] },
        frill: { type: 'fan', mat: 'horn', on: 'head', at: [0, 0], dir: [0, 1], r: 0.2, gap: 0.001, ...more },
      });
    const bare = points(draw(f({})), MAT.horn);
    const rimmed = points(draw(f({ rim: 0.02 })), MAT.horn);
    // The fan stands across the body: its thickness is along it.
    const thick = (pts: number[][]) => span(pts, 1)[1] - span(pts, 1)[0];
    expect(thick(bare)).toBeLessThan(0.004);
    expect(thick(rimmed)).toBeCloseTo(0.04, 2);
    expect(rimmed.length).toBeGreaterThan(bare.length);
    expect(bytes(draw(f({ rim: 0 })))).toBe(bytes(draw(f({}))));
    // A sheet has one along its free edge: from its second point round to its last, not along the two edges at its first.
    const sail = (more: Record<string, unknown>) => plain({ sail: { type: 'sheet', mat: 'horn', zl: true, gap: 0.001, points: [[0, 0, 0.5], [0, 0, 0.8], [0, 0.2, 0.8], [0, 0.2, 0.5]], ...more } });
    const wide = (pts: number[][]) => span(pts, 0)[1] - span(pts, 0)[0];
    const edged = points(draw(sail({ rim: 0.02 })), MAT.horn);
    expect(wide(points(draw(sail({})), MAT.horn))).toBeLessThan(0.004);
    expect(wide(edged)).toBeCloseTo(0.04, 2);
    // The roll is at the top and the front, and the foot of the sail, between its last point and its first, has none.
    expect(wide(edged.filter((q) => q[2] > 0.75))).toBeCloseTo(0.04, 2);
    expect(wide(edged.filter((q) => q[1] > 0.05 && q[1] < 0.15 && q[2] < 0.6))).toBeLessThan(0.004);
    expect(bytes(draw(sail({ rim: 0 })))).toBe(bytes(draw(sail({}))));
  });

  it('turns a lump with the head it is on if it says so, and leaves it level if not', () => {
    const f = (turn: boolean) =>
      plain({
        head: { type: 'head', at: { stand: { y: 0.5, z: 0.8, pitch: 0 }, low: { y: 0.5, z: 0.8, pitch: 1.2 } }, rings: [[0, 0, 0.03, 0.03], [0.1, 0, 0.03, 0.03]] },
        crest: { type: 'lump', mat: 'horn', sides: [12, 6], on: 'head', at: [0, 0.05, 0.05], r: [0.01, 0.08, 0.01], ...(turn ? { turn: true } : {}) },
      });
    const long = (m: Mesh) => { const c = points(m, MAT.horn); return { along: span(c, 1)[1] - span(c, 1)[0], up: span(c, 2)[1] - span(c, 2)[0] }; };
    // Level, both draw the same crest: long fore and aft.
    expect(long(draw(f(true))).along).toBeCloseTo(0.16, 3);
    expect(long(draw(f(true))).up).toBeCloseTo(0.02, 3);
    // With the head pitched down to graze, the one that turns is long down the face, and the other still fore and aft.
    const turned = long(draw(f(true), POSE.graze));
    const still = long(draw(f(false), POSE.graze));
    expect(turned.up).toBeGreaterThan(turned.along * 2);
    expect(still.along).toBeCloseTo(0.16, 3);
    expect(still.up).toBeCloseTo(0.02, 3);
  });
});

describe('the validator', () => {
  const good = () => canonicalForm(plans.ceratopsian);

  it('refuses a routine there is not', () => {
    const f = good();
    (f.behave as Record<string, unknown>).routine = 'dance';
    expect(checkForm(f).join()).toContain('no routine "dance"');
    f.behave!.routine = 'stalk';
    expect(checkForm(f)).toEqual([]);
  });

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

  it('refuses a part that hangs on nothing, on a part with no end, on itself by any way round, or on two frames', () => {
    const f = good();
    f.parts.a = { type: 'lump', on: 'nothing', at: [0, 0, 0], r: [0.01, 0.01, 0.01] };
    expect(checkForm(f).join()).toContain('there is no such part');
    f.parts.a = { type: 'lump', on: 'cheeks', at: [0, 0, 0], r: [0.01, 0.01, 0.01] };
    expect(checkForm(f).join()).toContain('has no end to hang on');
    f.parts.a = { type: 'spike', on: 'b', from: [0, 0, 0], to: [0, 0.1, 0] };
    f.parts.b = { type: 'spike', on: 'a', from: [0, 0, 0], to: [0, 0.1, 0] };
    expect(checkForm(f).join()).toContain('hangs on or rides it in turn');
    f.parts.a = { type: 'pillar', on: 'body', y: 0, x: 0.1, top: 0.5, r: 0.03 };
    delete f.parts.b;
    expect(checkForm(f).join()).toContain("cannot hang on another part's end");
    f.parts.a = { type: 'lump', ride: 'cheeks', at: [0, 0, 0], r: [0.01, 0.01, 0.01] };
    expect(checkForm(f).join()).toContain('with a skin to ride');
    f.parts.a = { type: 'lump', ride: 'body', on: 'body', at: [0, 0, 0], r: [0.01, 0.01, 0.01] };
    expect(checkForm(f).join()).toContain('a part has one frame');
    f.parts.a = { type: 'lump', ride: 'b', at: [0, 0, 0], r: [0.01, 0.01, 0.01] };
    f.parts.b = { type: 'chain', on: 'a', points: [[0, 0, 0, 0.01], [0, 0.1, 0, 0.01]] };
    expect(checkForm(f).join()).toContain('hangs on or rides it in turn');
    delete f.parts.b;
    f.parts.a = { type: 'lump', ride: 'body', at: [0, 0, 0], r: [0.01, 0.01, 0.01] };
    expect(checkForm(f)).toEqual([]);
    f.parts.a = { type: 'lump', ride: 'head', at: [0, 0.5, 0], r: [0.01, 0.01, 0.01] };
    expect(checkForm(f)).toEqual([]);
  });

  it('refuses rows changed by number where no list above was there to change', () => {
    const f = applyChange(good(), { parts: { crest: { type: 'tube', rings: { 1: [0, 0, 0.01, 0.01] } } } });
    expect(checkForm(f).join()).toContain('changes rows by their numbers');
  });

  it('refuses a body past its budget', () => {
    const f = good();
    f.parts.fuzz = { type: 'row', n: 400, from: [0, -0.5, 1], to: [0, 0.5, 1], item: 'lump', r: [0.01, 0.01, 0.01], mirror: true };
    f.parts.fuzz2 = { type: 'lump', at: [0, 0, 1], r: [0.1, 0.1, 0.1], sides: [200, 100], bands: [200, 100] };
    expect(checkForm(f).join()).toContain('over the budget');
  });
});
