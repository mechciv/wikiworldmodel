// What lies strewn on the ground, as meshes: stones a metre across to be sized where they are sown, and the wood a tree
// sheds, in metres from its own height. These check their shapes, not any place's stones or trees.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { canonicalForm, type Form } from '../../../core/form.ts';
import { MAT, Mesh, STRIDE } from '../city/kit.ts';
import { MAX_VERTICES } from './forms.ts';
import { trunkOf } from './plants.ts';
import { drawStone, drawWood, shedsWood, STONE_FINE, STONE_VARIANTS, WOOD, WOOD_SHAPES, woodLength } from './strewn.ts';

const ROOT = join(import.meta.dirname, '../..');
const plans: Record<string, Form> = Object.fromEntries(readdirSync(join(ROOT, 'plans')).filter((f) => f.endsWith('.yaml')).map((f) => [f.replace('.yaml', ''), canonicalForm(parse(readFileSync(join(ROOT, 'plans', f), 'utf8')) as Form)]));

/** A mesh's box, its materials, and how many of its normals point out from its middle. */
function measure(m: Mesh): { lo: number[]; hi: number[]; mats: Set<number>; verts: number; tris: number; outward: number } {
  const { vertices, indices } = m.arrays();
  const f = new Float32Array(vertices);
  const b = new Uint8Array(vertices);
  const n = vertices.byteLength / STRIDE;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const mats = new Set<number>();
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], f[i * 7 + k]);
      hi[k] = Math.max(hi[k], f[i * 7 + k]);
    }
    mats.add(b[i * STRIDE + 24]);
  }
  const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  let outward = 0;
  for (let i = 0; i < n; i++) {
    const d = (f[i * 7] - mid[0]) * (b[i * STRIDE + 12] - 128) + (f[i * 7 + 1] - mid[1]) * (b[i * STRIDE + 13] - 128) + (f[i * 7 + 2] - mid[2]) * (b[i * STRIDE + 14] - 128);
    if (d > 0) outward++;
  }
  return { lo, hi, mats, verts: n, tris: indices.length / 3, outward: outward / n };
}

describe('a stone', () => {
  it('is a metre across, part of it in the ground, its faces looking out, in every shape', () => {
    const seen = new Set<string>();
    for (const fine of [0, STONE_FINE]) {
      for (let v = 0; v < STONE_VARIANTS; v++) {
        const m = new Mesh(256);
        drawStone(m, v | fine);
        const s = measure(m);
        expect(s.hi[0] - s.lo[0]).toBeCloseTo(1, 5);
        // No wider across than along, give or take; and lower than it is wide.
        expect(s.hi[1] - s.lo[1]).toBeLessThan(1.25);
        expect(s.hi[2] - s.lo[2]).toBeLessThan(1.1);
        // Some of it under the ground, and more of it above.
        expect(s.lo[2]).toBeLessThan(-0.04);
        expect(s.hi[2]).toBeGreaterThan(0.08);
        expect(s.hi[2]).toBeGreaterThan(-s.lo[2]);
        expect(s.outward).toBeGreaterThan(0.97);
        expect([...s.mats]).toEqual([MAT.stone]);
        // A stone is cheap: a hundred triangles or so, and a few hundred where it is looked at.
        expect(s.tris).toBeLessThanOrEqual(fine ? 320 : 80);
        expect(s.tris).toBeGreaterThan(fine ? 150 : 40);
        seen.add(`${fine}:${(s.hi[1] - s.lo[1]).toFixed(4)}:${(s.hi[2] - s.lo[2]).toFixed(4)}`);
      }
    }
    // No two alike.
    expect(seen.size).toBe(STONE_VARIANTS * 2);
  });

  it('is the same stone whenever it is drawn', () => {
    const a = new Mesh(256);
    const b = new Mesh(256);
    drawStone(a, 5);
    drawStone(b, 5);
    expect(new Uint8Array(a.arrays().vertices)).toEqual(new Uint8Array(b.arrays().vertices));
  });
});

describe('fallen wood', () => {
  it('is shed by what has a trunk, and its branches by what branches', () => {
    expect(shedsWood(plans.conifer)).toEqual({ trunks: true, branches: true });
    expect(shedsWood(plans.broadleaf)).toEqual({ trunks: true, branches: true });
    // A palm sheds its trunk, and fronds, which are no wood.
    expect(shedsWood(plans.palm)).toEqual({ trunks: true, branches: false });
    // A fern at the ground has no trunk to shed; nor has an animal.
    expect(shedsWood(plans.fern)).toEqual({ trunks: false, branches: false });
    expect(shedsWood(plans.ceratopsian)).toEqual({ trunks: false, branches: false });
  });

  it('lies along the ground in its tree\'s own bark, as long as it says, part of it in the ground', () => {
    for (const plan of ['conifer', 'broadleaf', 'palm']) {
      const form = plans[plan];
      const h = 24;
      const R = h * trunkOf(form)!.r;
      for (let shape = 0; shape < WOOD_SHAPES; shape++) {
        if (shape >= WOOD.branch && !shedsWood(form).branches) continue;
        for (const seed of [0x51f3, 0xa3e6]) {
          const m = new Mesh(512);
          drawWood(m, form, h, shape, seed, 140);
          const s = measure(m);
          const len = woodLength(form, h, shape, seed);
          expect(s.verts).toBeGreaterThan(20);
          expect(s.verts).toBeLessThan(MAX_VERTICES);
          expect(s.mats.has(MAT.fallenBark)).toBe(true);
          // Never a standing tree's bark, which sways in the wind.
          expect(s.mats.has(MAT.bark)).toBe(false);
          for (const mat of s.mats) expect([MAT.fallenBark, MAT.heartwood]).toContain(mat);
          // In the ground a little, so that it meets a ground that is not level.
          expect(s.lo[2]).toBeLessThan(0);
          if (shape === WOOD.stump) {
            // A stump stands: as tall as a few of its own thicknesses, and no taller than a person.
            expect(s.hi[2]).toBeGreaterThan(0.25);
            expect(s.hi[2]).toBeLessThan(2.4);
            expect(s.hi[0] - s.lo[0]).toBeLessThan(R * 4.2);
          } else {
            // It lies: along +y about as long as it says, and low.
            expect(s.hi[1] - s.lo[1]).toBeGreaterThan(len * 0.75);
            expect(s.hi[1] - s.lo[1]).toBeLessThan(len * 1.25 + 4 * R);
            expect(s.hi[2]).toBeLessThan(shape === WOOD.log || shape === WOOD.broken ? R * 4.5 : len * 0.5);
            expect(Math.abs((s.lo[1] + s.hi[1]) / 2)).toBeLessThan(len * 0.2 + R);
          }
        }
      }
    }
  });
});
