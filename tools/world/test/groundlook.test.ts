// How the viewer turns what the world says of a ground into what the renderer draws (viewer/src/city/groundlook.ts):
// each material over the share of the ground its sources give it, a mapped topsoil in its climate's colours, and the
// rock under it in a colour of its kind.
import { describe, expect, it } from 'vitest';
import { GROUND_MATERIALS, type SceneBedrock, type SceneSubstrate } from '../../../core/substrate.ts';
import { groundLook, groundTones, rockLook, sortingBands } from '../../../viewer/src/city/groundlook.ts';

const at = (m: (typeof GROUND_MATERIALS)[number]) => GROUND_MATERIALS.indexOf(m);
const shares = (o: Partial<Record<(typeof GROUND_MATERIALS)[number], number>>) => GROUND_MATERIALS.map((m) => o[m] ?? 0);
const ground = (o: Partial<SceneSubstrate>): SceneSubstrate => ({ tier: 'evidence', from: 'rocks', weight: 1, materials: [], colours: [], marks: [], source: 'src:x', rows: [], sites: 1, km: 1, ...o });
const bedrock = (rock?: SceneBedrock['rock']): SceneBedrock => ({ tier: 'model', code: 'xx', label: 'A class', ...(rock ? { rock } : {}), field: 'field:x', source: 'src:y' });

describe('where each material of a ground lies', () => {
  it('gives each a stretch of the sorting field, the coarsest first, with no gap between them', () => {
    const b = sortingBands(shares({ sand: 0.5, gravel: 0.25, mud: 0.25 }));
    const band = (m: (typeof GROUND_MATERIALS)[number]) => [b[at(m) * 2], b[at(m) * 2 + 1]];
    // Gravel, then sand, then mud; the first has no lower edge and the last no upper one.
    expect(band('gravel')[0]).toBe(-1);
    expect(band('gravel')[1]).toBe(band('sand')[0]);
    expect(band('sand')[1]).toBe(band('mud')[0]);
    expect(band('mud')[1]).toBe(2);
    expect(band('gravel')[1]).toBeLessThan(0.5);
    expect(band('sand')[1]).toBeGreaterThan(0.5);
    // A material with no share has no stretch, and one alone has all of it.
    expect(band('silt')).toEqual([0, 0]);
    const alone = sortingBands(shares({ lime: 1 }));
    expect([alone[at('lime') * 2], alone[at('lime') * 2 + 1]]).toEqual([-1, 2]);
  });

  it("covers the share of the ground the sources give it: the field's own values, drawn afresh, fall in each stretch that often", () => {
    const want = { gravel: 0.285, sand: 0.358, silt: 0.222, mud: 0.135 };
    const b = sortingBands(shares(want));
    // The field as the shader has it: six tenths of one noise read between four values, four tenths of another, the
    // step between two values eased.
    let seed = 12345;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    const ease = (f: number) => f * f * (3 - 2 * f);
    const noise = () => {
      const [fx, fy, p, q, r, s] = [ease(random()), ease(random()), random(), random(), random(), random()];
      return (p + (q - p) * fx) * (1 - fy) + (r + (s - r) * fx) * fy;
    };
    const n = 100_000;
    const got: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const u = 0.6 * noise() + 0.4 * noise();
      for (const m of Object.keys(want) as (keyof typeof want)[]) if (u >= b[at(m) * 2] && u < b[at(m) * 2 + 1]) got[m] = (got[m] ?? 0) + 1;
    }
    for (const [m, share] of Object.entries(want)) expect(got[m] / n, m).toBeCloseTo(share, 1.7);
  });
});

describe('the look of a ground', () => {
  it("draws a mapped topsoil as a shade of the ground its climate gives it, with its stones' colour for their share", () => {
    const land = Array.from({ length: 30 }, (_, i) => 0.1 + i * 0.01);
    const look = groundLook(ground({ tier: 'model', from: 'soil', materials: [['sand', 0.6], ['gravel', 0.2], ['mud', 0.2]] }), null)!;
    // All of the ground, the earth under plants too; its fine earth one shade: three parts sand to one of clay, paler.
    expect(look.weight).toBe(1);
    expect(look.soil).toBe(1);
    expect(look.shade).toBeGreaterThan(1);
    expect(look.shade).toBeLessThan(1.14);
    // A clay soil is darker than its climate's ground, and a loam of silt alone is the ground itself.
    expect(groundLook(ground({ tier: 'model', from: 'soil', materials: [['mud', 0.7], ['sand', 0.3]] }), null)!.shade).toBeLessThan(1);
    expect(groundLook(ground({ tier: 'model', from: 'soil', materials: [['silt', 1]] }), null)!.shade).toBe(1);
    // From afar the soil and the bare ground keep their own colours in that shade, less the stones' share, which is the
    // stones' colour; what grows on it is as it was.
    const toned = groundTones(land, look);
    const stone = (k: number) => look.tones[at('gravel') * 6 + k];
    for (const from of [0, 12]) for (let k = 0; k < 6; k++) expect(toned[from + k]).toBeCloseTo(land[from + k] * look.shade * 0.8 + stone(k) * 0.2, 6);
    expect(toned.slice(6, 12)).toEqual(land.slice(6, 12));
    expect(toned.slice(18)).toEqual(land.slice(18));
    // The same shares read from rock have their own colours: no shade, and half of the earth under plants.
    const rocks = groundLook(ground({ materials: [['sand', 0.6], ['gravel', 0.2], ['mud', 0.2]] }), null)!;
    expect(rocks.shade).toBe(0);
    expect(rocks.soil).toBe(0.5);
    const far = groundTones(land, rocks);
    for (let k = 0; k < 3; k++) {
      expect(far[12 + k]).toBeCloseTo(rocks.mean[0][k], 6);
      expect(far[k]).toBeCloseTo((land[k] + rocks.mean[0][k]) / 2, 6);
    }
    // Nothing said, nothing drawn.
    expect(groundLook(undefined, null)).toBeNull();
    expect(groundTones(land, null)).toBe(land);
  });

  it('draws outcrops and stones in the colour of the rock under the place, where the world says what kind it is', () => {
    const basalt = rockLook(bedrock('basic-volcanic'))!;
    const limestone = rockLook(bedrock('carbonate'))!;
    const sum = (c: number[]) => c[0] + c[1] + c[2];
    expect(sum(basalt.rock)).toBeLessThan(sum(limestone.rock) / 2);
    expect(sum(basalt.stones)).toBeLessThan(sum(basalt.rock));
    // Loose sediment is no rock, and no map is no rock: the renderer keeps its own.
    expect(rockLook(bedrock())).toBeNull();
    expect(rockLook(undefined)).toBeNull();
    // A ground's gravel is stones of that rock, whatever colour is said of its mud.
    const red = ground({ materials: [['mud', 0.5], ['gravel', 0.5]], colours: [['red', 1]] });
    const over = groundLook(red, basalt)!;
    expect([...over.tones.slice(at('gravel') * 6 + 3, at('gravel') * 6 + 6)]).toEqual([...Float32Array.from(basalt.rock)]);
    const plain = groundLook(red, null)!;
    expect(plain.tones[at('gravel') * 6]).toBeGreaterThan(over.tones[at('gravel') * 6]);
    // Its mud is red either way: more red than green.
    expect(over.tones[at('mud') * 6]).toBeGreaterThan(over.tones[at('mud') * 6 + 1] * 1.5);
  });
});
