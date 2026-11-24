// Forms on the real tree: what the world's taxa inherit, and what the validator says of the plans and records.
import { beforeAll, describe, expect, it } from 'vitest';
import { MAT, Mesh, STRIDE } from '../../../world/generators/city/kit.ts';
import { checkForm, drawAnimal, POSE, unitStance } from '../../../world/generators/life/forms.ts';
import { canonicalForm } from '../../../core/form.ts';
import { classify, type AtlasParams } from '../src/build/atlas.ts';
import { keptAnimals } from '../src/build/landscape.ts';
import { changeProblems, FormTree, planForm } from '../src/forms.ts';
import { formsWanted } from '../src/formsWanted.ts';
import { loadWorld, type World } from '../src/world.ts';

let world: World;
let tree: FormTree;

beforeAll(async () => {
  world = await loadWorld();
  tree = new FormTree(world);
});

describe('the tree of life, for forms', () => {
  it('gives a taxon its own plan', () => {
    const s = tree.source('life/taxa/triceratops')!;
    expect(s.plan).toBeTruthy();
    expect(tree.form('life/taxa/triceratops')!.kind).toBe('animal');
  });

  it('walks every taxon up its parents to the root', () => {
    const p = tree.path('life/taxa/triceratops');
    expect(p[0]).toBe('life/taxa/triceratops');
    expect(p).toContain('life/taxa/dinosauria');
    expect(p.length).toBeGreaterThan(3);
  });

  it('has every plan in the vocabulary, each drawable', () => {
    const values = world.vocab.properties.body_plan.values!;
    for (const name of Object.keys(world.plans)) {
      expect(values[name], name).toBeTruthy();
      expect(checkForm(planForm(world, name)!), name).toEqual([]);
    }
  });

  it('has every taxon that says anything of its body draw, whichever node it comes from', () => {
    for (const e of world.entities) {
      if (e.kind !== 'taxon') continue;
      if (!e.claims.some((c) => c.prop === 'body_plan' || c.prop === 'body_form')) continue;
      const f = tree.form(e.id);
      expect(f, e.id).toBeDefined();
      expect(checkForm(canonicalForm(f!)), e.id).toEqual([]);
    }
  });

  it("gives an animal people kept its taxon's body and the middle of its size, and leaves out one with no size above it", () => {
    const said: string[] = [];
    const { kept, forms } = keptAnimals(world, ['life/taxa/equus', 'life/taxa/bison', 'life/taxa/mammalia', 'life/taxa/equus'], (s) => said.push(s));
    expect(kept.map((k) => k.id)).toEqual(['life/taxa/bison', 'life/taxa/equus']);
    const horse = kept[1];
    const length = tree.size('life/taxa/equus', 'body_length')!;
    expect(horse.tier).toBe('kept');
    expect(horse.length).toBeGreaterThan(length.lo);
    expect(horse.length).toBeLessThan(length.hi);
    expect(horse.length! ** 2 / (length.lo * length.hi)).toBeCloseTo(1, 1);
    expect(forms[horse.form]).toEqual(canonicalForm(tree.form('life/taxa/equus')!));
    expect(checkForm(forms[horse.form])).toEqual([]);
    // Mammals as such have a plan and no size: a size is inherited, never guessed.
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/life\/taxa\/mammalia .* no record at or above it gives a size/);
  });

  it("sets a turtle's eyes on its head and a crocodile's jaw line on its snout, whichever neck or skull a family below has", () => {
    // The vertices of one material in a body a metre long, each [x, y, z].
    const points = (id: string, mat: number): number[][] => {
      const f = canonicalForm(tree.form(id)!);
      const m = new Mesh(4096);
      drawAnimal(m, f, unitStance(f, POSE.stand, 2));
      const { vertices } = m.arrays();
      const v = new Float32Array(vertices);
      const b = new Uint8Array(vertices);
      const out: number[][] = [];
      for (let i = 0; i < m.verts; i++) if (b[i * STRIDE + 24] === mat) out.push([v[i * 7], v[i * 7 + 1], v[i * 7 + 2]]);
      return out;
    };
    // How far a point is from a line of joints, each [x, y, z, radius], less the radius there.
    const off = (q: number[], joints: number[][]): number => {
      let least = Infinity;
      for (let i = 0; i + 1 < joints.length; i++) {
        const [a, e] = [joints[i], joints[i + 1]];
        const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
        const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1] + (q[2] - a[2]) * d[2]) / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2])));
        const r = a[3] + (e[3] - a[3]) * t;
        least = Math.min(least, Math.hypot(q[0] - a[0] - d[0] * t, q[1] - a[1] - d[1] * t, q[2] - a[2] - d[2] * t) - r);
      }
      return least;
    };
    for (const id of ['life/taxa/testudinata', 'life/taxa/testudinidae', 'life/taxa/chelydridae', 'life/taxa/trionychidae']) {
      const f = tree.form(id)!;
      // The neck's joints are shares of the length, the body a metre long.
      const neck = f.parts.neck!.points as number[][];
      const eyes = points(id, MAT.eye);
      expect(eyes.length, id).toBeGreaterThan(0);
      // Each eye is on the skin of the neck's far end: its middle a hair under it, and none of it further off than it is big.
      for (const q of eyes) expect(Math.abs(off(q, neck)), `${id}: an eye ${JSON.stringify(q)}`).toBeLessThan(0.012);
      expect(Math.min(...eyes.map((q) => q[1])), id).toBeGreaterThan(neck[0][1] + (neck[neck.length - 1][1] - neck[0][1]) * 0.6);
    }
    for (const id of ['life/taxa/crocodylomorpha', 'life/taxa/gavialidae', 'life/taxa/alligatoridae']) {
      const f = tree.form(id)!;
      const rings = f.parts.body!.rings as number[][];
      const tip = rings[rings.length - 1][0];
      const dark = points(id, MAT.dark).filter((q) => q[1] > 0.24);
      // The jaw's line reaches the tip of the snout, however long it is, and is nowhere wider than the snout is there.
      expect(Math.max(...dark.map((q) => q[1])), id).toBeGreaterThan(tip - 0.01);
      const widest = Math.max(...rings.filter((r) => r[0] > 0.24).map((r) => r[3]));
      expect(Math.max(...dark.filter((q) => q[2] < 0.095).map((q) => Math.abs(q[0]))), id).toBeLessThan(widest + 0.004);
    }
  });

  it('keeps every claim a machine made of a body as proposed', () => {
    for (const e of world.entities) {
      for (const c of e.claims) {
        if (c.prop !== 'body_plan' && c.prop !== 'body_form') continue;
        expect(c.status, `${e.id} ${c.key}`).toBe('proposed');
        expect(c.author, `${e.id} ${c.key}`).toMatch(/^machine:/);
      }
    }
  });

  it('refuses a body_form with fields it does not know', () => {
    expect(changeProblems({ wings: 2 }).join()).toContain('no field "wings"');
    expect(changeProblems('tall').length).toBeGreaterThan(0);
    expect(changeProblems({ parts: { a: { r: 1 } }, hip: 0.3 })).toEqual([]);
  });
});

describe('the atlas\'s taxa', () => {
  const params = () => world.fields.find((f) => f.data?.as === 'community')!.params as unknown as AtlasParams;

  it('draw only what some node above them can draw, with a size', () => {
    const snap = [...world.landFossils.values()][0];
    const known = classify(world, snap, params());
    expect(known.size).toBeGreaterThan(100);
    for (const k of known.values()) {
      expect(known.forms.has(k.taxon.form)).toBe(true);
      expect(k.taxon.length ?? k.taxon.mass ?? k.taxon.height ?? known.forms.get(k.taxon.form)?.behave?.layer, k.taxon.label).toBeTruthy();
    }
  });

  it('say whose form it is: a genus with none of its own names the node above it', () => {
    const snap = [...world.landFossils.values()][0];
    const known = classify(world, snap, params());
    const inherited = [...known.values()].filter((k) => !k.taxon.own);
    expect(inherited.length).toBeGreaterThan(0);
    for (const k of inherited.slice(0, 200)) {
      expect(k.taxon.form_from).toBeTruthy();
      expect(k.taxon.form_from).not.toBe(k.taxon.id);
    }
  });

  it('list what most wants a form', () => {
    const out = formsWanted(world, ['--n', '5']);
    expect(out).toContain('rows');
    expect(out).toContain('txn:');
  });

  it('strips null deletions recursively in canonicalForm', () => {
    const f = canonicalForm({
      kind: 'plant',
      parts: {
        trunk: { type: 'trunk', taper: 0.5, dead: null } as never,
        removed: null as never,
      },
    } as never);
    expect('removed' in f.parts).toBe(false);
    expect('dead' in (f.parts.trunk as Record<string, unknown>)).toBe(false);
  });
});
