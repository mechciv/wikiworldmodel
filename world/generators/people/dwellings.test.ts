// A house as its tradition's claims describe it (dwellings.ts): every word a claim may use is drawn, at every detail,
// about as big as it says; a dwelling is drawn in several shapes within the ranges its claims give; its door is in its
// front; and its yard, with what stood in it, is drawn with it and within its own ground.
import { describe, expect, it } from 'vitest';
import { DWELLING_WORDS, type DwellingSpec, type OutbuildingSpec } from '../../../core/dwelling.ts';
import { MAT, Mesh, STRIDE } from '../city/kit.ts';
import { drawDwelling, fillDwelling, homesteadOf, houseSize, HOUSE_VARIANTS, outbuildingSpec, type Homestead, type HouseDetail, type OutbuildingParams } from './dwellings.ts';

interface Drawn {
  /** each vertex: x, y, z and its material */
  v: [number, number, number, number][];
  tris: number;
  bytes: Uint8Array;
}

function drawn(d: DwellingSpec, detail: HouseDetail, variant = 0, grow = 1, home?: Homestead): Drawn {
  const m = new Mesh(512);
  drawDwelling(m, d, detail, variant, grow, home);
  const { vertices, indices } = m.arrays();
  const f = new Float32Array(vertices);
  const b = new Uint8Array(vertices);
  return { v: Array.from({ length: vertices.byteLength / STRIDE }, (_, i) => [f[i * 7], f[i * 7 + 1], f[i * 7 + 2], b[i * STRIDE + 24]]), tris: indices.length / 3, bytes: b };
}

const HOUSE: DwellingSpec = { plan: 'rectangular', width: 5, length: 9, walls: 'wattle-and-daub', roof: 'gable', roof_material: 'thatch' };

/** Houses that no one word makes: the tents, a ring round a court, a front cut in the earth, a roof on posts. */
const KINDS: Record<string, DwellingSpec> = {
  'a felt tent': { plan: 'round', diameter: 5.6, walls: 'felt', roof_material: 'felt', faces: 'south' },
  'a tent of hides': { plan: 'round', diameter: 4.6, height: 5.2, walls: 'hide', roof: 'tent', roof_material: 'hide' },
  'a tent of cloth': { plan: 'rectangular', length: 8, width: 3, wall_height: 1.5, height: 2.1, walls: 'cloth', roof: 'tent', roof_material: 'cloth' },
  'a ring round a court': { plan: 'round', court: true, diameter: 40, storeys: 3, walls: 'rammed-earth', roof: 'hip-and-gable', roof_material: 'tile', windows: 'small' },
  'a front cut in the earth': { plan: 'rectangular', length: 8, rooms: 3, walls: 'earth-cut', roof: 'vault', roof_material: 'earth', smoke: 'chimney' },
  'a house on posts with a veranda': { ...HOUSE, floor: 'stilts', floor_height: 2, veranda: true, entrance: 'end' },
  'a pit house entered by its roof': { plan: 'round', diameter: 5, floor: 'sunken', walls: 'wattle-and-daub', roof_material: 'earth', entrance: 'roof', smoke: 'hole' },
  'a house of snow': { plan: 'round', diameter: 4, height: 3, walls: 'snow', roof: 'dome', roof_material: 'snow', entrance: 'tunnel', windows: 'small' },
  'a block of rooms': { plan: 'room-block', rooms: 9, walls: 'stone', roof: 'flat', entrance: 'roof' },
  'a roof on posts': { plan: 'oval', length: 10, wall_height: 1.5, walls: 'none', roof: 'hip', roof_material: 'thatch', floor: 'raised' },
  'a windbreak behind a low wall': { plan: 'semicircular', diameter: 3, walls: 'stone', roof_material: 'bark' },
  'a courtyard house of two storeys': { plan: 'courtyard', court: true, width: 12, length: 14, storeys: 2, walls: 'fired-brick', roof_material: 'tile', finish: 'lime', smoke: 'chimney', windows: 'large' },
  'a long house with a byre': { plan: 'long', width: 6, length: 30, walls: 'timber-frame', byre: true, smoke: 'gable', porch: true },
  'a hut of mats': { plan: 'round', diameter: 1.8, height: 1.5, walls: 'none', roof: 'dome', roof_material: 'mat' },
};

/** Whatever of a house may stand out past its walls and above its roof: eaves, a porch, a veranda, a tent's ropes, a passage in, a chimney, poles. */
const OUT = 4.2;
const UP = 1.8;

function check(d: DwellingSpec, what: string): void {
  for (const variant of [0, 3, 7]) {
    const size = houseSize(d, variant);
    for (const x of [size.w, size.l, size.eaves, size.top]) expect(Number.isFinite(x) && x > 0, what).toBe(true);
    for (const detail of [0, 1, 2] as const) {
      const { v, tris } = drawn(d, detail, variant);
      expect(tris, `${what} at ${detail}`).toBeGreaterThan(0);
      expect(v.every((p) => p.every(Number.isFinite)), what).toBe(true);
      expect(Math.max(...v.map((p) => p[2])), `${what} at ${detail}: its top`).toBeLessThanOrEqual(size.top + UP);
      expect(Math.max(...v.map((p) => Math.abs(p[0]))), `${what} at ${detail}: across`).toBeLessThanOrEqual(size.w / 2 + OUT);
      expect(Math.max(...v.map((p) => Math.abs(p[1]))), `${what} at ${detail}: back and front`).toBeLessThanOrEqual(size.l / 2 + OUT + 1);
      // Far off it is a block; close by, no more than a few thousand triangles, as it is drawn by the hundred.
      if (detail === 2) expect(tris, `${what}, far off`).toBeLessThanOrEqual(d.plan === 'room-block' ? 240 : 140);
      else expect(tris, `${what} at ${detail}`).toBeLessThanOrEqual(detail === 1 ? 2500 : 9000);
    }
  }
}

describe('a house, from its dwelling', () => {
  it('draws every word a claim may use, at every detail, about as big as it says', () => {
    for (const [param, words] of Object.entries(DWELLING_WORDS)) {
      for (const word of Object.keys(words)) check({ ...HOUSE, [param]: word } as DwellingSpec, `${param}: ${word}`);
    }
    for (const flag of ['court', 'porch', 'veranda', 'byre'] as const) check({ ...HOUSE, [flag]: true }, flag);
    for (const [what, d] of Object.entries(KINDS)) check(d, what);
  });

  it('draws a dwelling in several shapes, each within the ranges its claims give, and each the same every time', () => {
    const d: DwellingSpec = { ...HOUSE, width: { lo: 4, hi: 6 }, length: { lo: 8, hi: 14 }, storeys: { lo: 1, hi: 2 }, entrance: 'end' };
    const sizes = Array.from({ length: HOUSE_VARIANTS }, (_, k) => houseSize(d, k));
    for (const s of sizes) {
      expect(s.w).toBeGreaterThanOrEqual(4);
      expect(s.w).toBeLessThanOrEqual(6);
      expect(s.l).toBeGreaterThanOrEqual(8);
      expect(s.l).toBeLessThanOrEqual(14);
    }
    expect(new Set(sizes.map((s) => s.l.toFixed(2))).size).toBe(HOUSE_VARIANTS);
    // Some of one storey and some of two.
    expect(new Set(sizes.map((s) => Math.round(s.eaves / 2.3))).size).toBe(2);
    for (const k of [0, 5]) expect(drawn(d, 0, k).bytes).toEqual(drawn(d, 0, k).bytes);
    expect(drawn(d, 0, 1).bytes).not.toEqual(drawn(d, 0, 2).bytes);
  });

  it('turns a house so that its door is in its front', () => {
    const end = houseSize({ ...HOUSE, entrance: 'end' });
    const side = houseSize({ ...HOUSE, entrance: 'side' });
    expect([end.w, end.l]).toEqual([5, 9]);
    expect([side.w, side.l]).toEqual([9, 5]);
    for (const [d, size] of [[{ ...HOUSE, entrance: 'end' }, end], [{ ...HOUSE, entrance: 'side' }, side]] as const) {
      // The dark of its doorway is in the wall that faces +y, and nowhere else at the foot of its walls.
      const doors = drawn(d as DwellingSpec, 1).v.filter((p) => p[3] === MAT.dark && p[2] < 0.3);
      expect(doors.length).toBeGreaterThan(0);
      for (const p of doors) expect(p[1]).toBeCloseTo(size.l / 2 + 0.03, 1);
    }
  });

  it('grows a house that stands for several households wider and longer, and no taller', () => {
    const one = houseSize(HOUSE, 2);
    const many = houseSize(HOUSE, 2, 2);
    expect(many.w).toBeCloseTo(one.w * 2, 6);
    expect(many.l).toBeCloseTo(one.l * 2, 6);
    expect(many.eaves).toBeCloseTo(one.eaves, 6);
  });

  it('lifts a floor on posts, sinks one that is dug, and keeps the eaves of a walled house above a head', () => {
    expect(houseSize({ ...HOUSE, floor: 'stilts', floor_height: 2 }).eaves).toBeGreaterThan(4);
    expect(houseSize({ ...HOUSE, floor: 'sunken' }).eaves).toBeLessThan(0.8);
    const { v } = drawn({ ...HOUSE, pitch: 55 }, 1);
    // The lowest edge of its thatch.
    const thatch = v.filter((p) => p[3] === MAT.thatch);
    expect(Math.min(...thatch.map((p) => p[2]))).toBeGreaterThanOrEqual(1.55);
  });

  it("takes from the generator's house only what fits what a tradition says", () => {
    const farm: DwellingSpec = { plan: 'rectangular', width: 5, length: 10, walls: 'wattle-and-daub', roof: 'gable', roof_material: 'thatch' };
    // Nothing said: the generator's house.
    expect(fillDwelling({}, farm)).toEqual(farm);
    // A round house takes no gable and no farmhouse's width; it keeps the generator's walls.
    expect(fillDwelling({ plan: 'round' }, farm)).toEqual({ plan: 'round', walls: 'wattle-and-daub' });
    // A courtyard house is not squeezed into a farmhouse's width; a roof of earth is not drawn as a gable.
    expect(fillDwelling({ plan: 'courtyard', court: true, roof_material: 'earth' }, farm)).toEqual({ plan: 'courtyard', court: true, roof_material: 'earth', walls: 'wattle-and-daub' });
    // A size of its own is all its sizes; a diameter makes it no cornered house.
    expect(fillDwelling({ length: 12 }, farm)).toMatchObject({ plan: 'rectangular', length: 12, roof: 'gable' });
    expect(fillDwelling({ length: 12 }, farm).width).toBeUndefined();
    expect(fillDwelling({ diameter: 4 }, farm).plan).toBeUndefined();
    // A tent's roof is of its walls' stuff, whatever the generator's house is roofed with.
    expect(fillDwelling({ walls: 'felt' }, farm).roof_material).toBeUndefined();
    // A court comes from the generator only where no plan is stated.
    expect(fillDwelling({ plan: 'rectangular' }, { ...farm, court: true }).court).toBeUndefined();
    expect(fillDwelling({ walls: 'stone' }, { ...farm, court: true }).court).toBe(true);
  });
});

describe('a house in its yard', () => {
  const params: OutbuildingParams = { share: 0.6, generic: { granary: { plan: 'round', diameter: 2.2, wall_height: 1.5, roof: 'conical', floor: 'raised' }, well: { diameter: 1.6 }, pen: { diameter: 5 } } };
  const out: OutbuildingSpec[] = [
    { use: 'granary', per: 'house', count: 1 },
    { use: 'well', per: 'house', count: 1 },
    { use: 'hall', per: 'settlement' },
  ];

  it("builds a household's outbuilding of what its house is built of, where nothing says", () => {
    const granary = outbuildingSpec(out[0], params, { ...HOUSE, walls: 'stone', roof_material: 'tile', finish: 'lime' });
    expect(granary).toMatchObject({ plan: 'round', diameter: 2.2, roof: 'conical', walls: 'stone', roof_material: 'tile', finish: 'lime' });
    // What its tradition says of it stands over both.
    expect(outbuildingSpec({ ...out[0], walls: 'wattle', diameter: 3 }, params, { ...HOUSE, walls: 'stone' })).toMatchObject({ walls: 'wattle', diameter: 3 });
    // A tent's people do not build a granary of felt.
    expect(outbuildingSpec(out[0], params, { plan: 'round', walls: 'felt' }).walls).toBeUndefined();
  });

  it("takes a household's things and its yard's enclosure from its tradition, and leaves the settlement's to the settlement", () => {
    const home = homesteadOf({ settlement: { yard: 'fence' }, outbuildings: out }, HOUSE, 24, params);
    expect(home.yard).toBe('fence');
    expect(home.out.map((o) => o.use)).toEqual(['granary', 'well']);
    expect(home.out.map((o) => o.count)).toEqual([1, 1]);
    // Where no source counts them, the generator's share of households has one.
    expect(homesteadOf({ settlement: {}, outbuildings: [{ use: 'granary', per: 'house' }] }, HOUSE, 24, params).out[0].count).toBe(0.6);
    expect(homesteadOf({ settlement: { yard: 'none' }, outbuildings: [] }, HOUSE, 24, params).yard).toBeUndefined();
  });

  it('draws the yard with the house, within its own ground, and not from far off', () => {
    const home = homesteadOf({ settlement: { yard: 'fence' }, outbuildings: out }, HOUSE, 24, params);
    for (const variant of [0, 1, 4]) {
      const alone = drawn(HOUSE, 0, variant);
      const yard = drawn(HOUSE, 0, variant, 1, home);
      expect(yard.tris).toBeGreaterThan(alone.tris + 100);
      // Its fence is of woven rods, and stands within the household's ground.
      const fence = yard.v.filter((p) => p[3] === MAT.wattle);
      expect(fence.length).toBeGreaterThan(40);
      for (const p of fence) expect(Math.max(Math.abs(p[0]), Math.abs(p[1]))).toBeLessThanOrEqual(12 + 0.1);
      // Its granary and its well stand behind the house or beside it, never before its door.
      const stone = yard.v.filter((p) => p[3] === MAT.rubble);
      expect(stone.length).toBeGreaterThan(0);
      const size = houseSize(HOUSE, variant);
      for (const p of stone) expect(p[1] < -size.l / 2 || Math.abs(p[0]) > size.w / 2).toBe(true);
      expect(drawn(HOUSE, 2, variant, 1, home).tris).toBe(drawn(HOUSE, 2, variant).tris);
    }
    // A household with no room for a yard has none.
    expect(drawn(HOUSE, 0, 0, 1, { ...home, lot: 9 }).v.filter((p) => p[3] === MAT.wattle)).toEqual([]);
  });
});
