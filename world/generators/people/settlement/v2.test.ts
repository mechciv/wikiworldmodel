// The settlement generator held, in aggregate, to what it samples (docs/STRUCTURE.md section 3.4): the people the world
// puts in the land, the way of life, the traditions, the cities; and to the ground it stands on. On a made-up world.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { compileHusbandry, compileTraditions, type TownSpec, type Tradition } from '../../../../core/dwelling.ts';
import type { Form } from '../../../../core/form.ts';
import { lifewayOf, type AnthromeClass, type Assessment } from '../../../../core/landscape.ts';
import type { LivingTaxon, SceneSpec, ScenePeople } from '../../../../core/scene.ts';
import { houseSize } from '../dwellings.ts';
import { LandUseMap, makeSettlement, toLocal, type Ground } from './v2.ts';

const ROOT = join(import.meta.dirname, '../../../..');
const classes = (parse(readFileSync(join(ROOT, 'world/fields/people/anthromes.yaml'), 'utf8')) as { params: { classes: AnthromeClass[] } }).params.classes;
const gen = parse(readFileSync(join(ROOT, 'world/generators/people/settlement.yaml'), 'utf8')) as { id: string; version: number; params: Record<string, unknown> };
const number = (code: number) => classes.findIndex((c) => c.code === code) + 1;

const assess = (forage: number, swidden: number, farm: number, herd: number, urban = 0): Assessment => ({
  use: [forage, swidden, farm, herd].map((l) => [l, l, l, l] as [number, number, number, number]),
  urban,
  urbanMedian: urban,
  quality: 2,
  expertise: 2,
});

/** A world of 5′ cells, 2° on a side around the equator and the prime meridian, each of one class and density and region. */
function world(cell: (row: number, col: number) => { code: number; density: number; region: number }, regions: { id: number; a: Assessment }[], extra: Partial<ScenePeople> = {}): ScenePeople {
  const nx = 24;
  const ny = 24;
  const anthrome: number[] = [];
  const density: number[] = [];
  const region: number[] = [];
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const x = cell(r, c);
    anthrome.push(number(x.code));
    density.push(x.density);
    region.push(x.region);
  }
  const centre = cell(12, 12);
  const a = regions.find((g) => g.id === centre.region)?.a;
  return {
    t: 100,
    step: 100,
    grid: { north: 1, west: -1, nx, ny, res: 1 / 12, anthrome, density, region },
    classes,
    regions: regions.map((g) => ({ id: g.id, label: `Region ${g.id}`, slice: '2,000 BP', assessment: g.a })),
    lifeway: lifewayOf(classes, number(centre.code), centre.density, a),
    cities: [],
    traditions: [],
    fields: { anthromes: 'field:people/anthromes', assessment: 'field:people/land-use-assessment', population: 'field:earth/population', lifeways: 'field:people/lifeways' },
    generator: { generator: gen.id, version: gen.version, params: gen.params },
    ...extra,
  };
}

const spec = (people: ScenePeople, origin = { lat: 0, lon: 0 }): SceneSpec => ({ site: { origin }, biome: { climate: 'temperate' }, people }) as unknown as SceneSpec;
const flat: Ground = { at: () => 40 };
const dry = () => 0;
const EXTENT = 16000;

describe('the settlement generator', () => {
  it('holds as many people as the world puts in the land it draws', () => {
    for (const [code, density] of [[32, 40], [23, 260], [33, 4], [42, 3]] as [number, number][]) {
      const p = world(() => ({ code, density, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }]);
      const plan = makeSettlement(spec(p), flat, dry, EXTENT);
      expect(plan.expected).toBeGreaterThan(0);
      // A tenth either way: settlements are whole, and one either side of the scene's edge is in or out whole.
      expect(Math.abs(plan.drawn - plan.expected) / plan.expected, `class ${code} at ${density} to the km²`).toBeLessThan(0.1);
    }
  });

  it('stands no house in the water or on a cliff', () => {
    // A river 600 m wide along y, its water at 0 m; and a cliff, rising 1 in 2, east of 6 km.
    const ground: Ground = { at: (x) => (Math.abs(x) < 300 ? -4 : x > 6000 ? 40 + (x - 6000) * 0.5 : 40) };
    const p = world(() => ({ code: 23, density: 300, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }]);
    const plan = makeSettlement(spec(p), ground, dry, EXTENT);
    expect(plan.houses.length).toBeGreaterThan(1000);
    for (const h of plan.houses) {
      expect(Math.abs(h.x) >= 300 - 13).toBe(true);
      expect(h.x <= 6000 + 13).toBe(true);
    }
  });

  it('draws fields where people farmed, pasture where they herded, and neither for foragers', () => {
    const sample = (code: number, density: number, a: Assessment) => {
      const p = world(() => ({ code, density, region: 1 }), [{ id: 1, a }]);
      const plan = makeSettlement(spec(p), flat, dry, EXTENT);
      const use = new LandUseMap(plan, flat, dry, 7);
      let crop = 0;
      let pasture = 0;
      for (let x = -15000; x <= 15000; x += 500) for (let y = -15000; y <= 15000; y += 500) {
        const u = use.at(x, y);
        crop += u.crop;
        pasture += u.pasture;
      }
      return { crop, pasture, plan };
    };
    const farmers = sample(23, 260, assess(1, 1, 3, 2));
    expect(farmers.crop).toBeGreaterThan(100);
    expect(farmers.pasture).toBe(0);
    const herders = sample(42, 3, assess(1, 0, 0, 3));
    expect(herders.pasture).toBeGreaterThan(1);
    expect(herders.crop).toBe(0);
    // Remote woodland, where the region's archaeologists say foraging was the way of life.
    const foragers = sample(53, 0.5, assess(3, 0, 0, 0));
    expect(foragers.plan.settlements.every((s) => s.pattern === 'foragers')).toBe(true);
    expect(foragers.crop + foragers.pasture).toBe(0);
  });

  it("draws a tradition's house where it holds, and the generic one where none does", () => {
    const traditions: Tradition[] = compileTraditions([{ id: 'test/round-house', label: 'A round house', regions: [1], span: [-500, 500], lifeways: ['farmers'], dwelling: { plan: 'round', diameter: 8, walls: 'stone', roof: 'conical', roof_material: 'thatch' } }]);
    // The west half of the world is region 1, where the tradition holds; the east half region 2, where none does.
    const p = world((_, c) => ({ code: 23, density: 260, region: c < 12 ? 1 : 2 }), [{ id: 1, a: assess(1, 1, 3, 2) }, { id: 2, a: assess(1, 1, 3, 2) }], { traditions });
    const plan = makeSettlement(spec(p), flat, dry, EXTENT);
    const of = (west: boolean) => new Set(plan.houses.filter((h) => (h.x < -500) === west && Math.abs(h.x) > 500).map((h) => plan.forms[h.form].from));
    expect(of(true)).toEqual(new Set(['tradition']));
    expect(of(false)).toEqual(new Set(['generic']));
    const t = plan.forms.find((f) => f.from === 'tradition')!;
    expect(t.spec).toMatchObject({ plan: 'round', walls: 'stone', roof_material: 'thatch' });
    expect(t.parts).toMatchObject({ walls: 'test/round-house' });
  });

  it("draws a camp's shelter from the tradition that housed its way of life, and no farmer's house from a herder's tent", () => {
    const traditions: Tradition[] = compileTraditions([
      { id: 'test/tent', label: 'A felt tent', regions: [1], span: [-500, 500], lifeways: ['herders'], dwelling: { plan: 'round', diameter: 6, walls: 'felt', roof: 'tent', roof_material: 'felt' }, settlement: { pattern: 'camp', household: 4 } },
      { id: 'test/pit-house', label: 'A pit house', regions: [1], span: [-500, 500], lifeways: ['foragers'], dwelling: { plan: 'round', diameter: 5, floor: 'sunken' } },
    ]);
    const drawn = (code: number, density: number, a: Assessment) => {
      const plan = makeSettlement(spec(world(() => ({ code, density, region: 1 }), [{ id: 1, a }], { traditions })), flat, dry, EXTENT);
      expect(plan.houses.length).toBeGreaterThan(10);
      return { patterns: new Set(plan.settlements.map((s) => s.pattern)), from: new Set(plan.houses.map((h) => plan.forms[h.form].tradition ?? plan.forms[h.form].key)), plan };
    };
    // Rangeland with few people, where the archaeologists say herding was the way of life: the herders' tent.
    const herders = drawn(42, 3, assess(1, 0, 0, 3));
    expect(herders.patterns).toEqual(new Set(['herders']));
    expect(herders.from).toEqual(new Set(['test/tent']));
    // A tent holds the household its tradition gives, so the camps still hold the people the world puts there.
    expect(Math.abs(herders.plan.drawn - herders.plan.expected) / herders.plan.expected).toBeLessThan(0.1);
    // Remote woodland of foragers: the foragers' pit house, with the generic shelter's roof where it says nothing of one.
    const foragers = drawn(53, 0.5, assess(3, 0, 0, 0));
    expect(foragers.patterns).toEqual(new Set(['foragers']));
    expect(foragers.from).toEqual(new Set(['test/pit-house']));
    expect(foragers.plan.forms[0].spec).toMatchObject({ floor: 'sunken', diameter: 5, roof: 'dome' });
    // The farmers of the same region: neither tradition says it housed them, so theirs is the generic house.
    const farmers = drawn(23, 260, assess(1, 1, 3, 2));
    expect(farmers.from).toEqual(new Set(['generic:farm:temperate']));
  });

  it("draws shifting cultivators in the house of their region's farmers where none is written for them, and says it stands in", () => {
    const traditions: Tradition[] = compileTraditions([{ id: 'test/farmhouse', label: 'A farmhouse', regions: [1], span: [-500, 500], lifeways: ['farmers'], dwelling: { plan: 'rectangular', walls: 'timber' } }]);
    // Populated woodland where the archaeologists say shifting cultivation was the way of life.
    const plan = makeSettlement(spec(world(() => ({ code: 52, density: 4, region: 1 }), [{ id: 1, a: assess(1, 3, 1, 0) }], { traditions })), flat, dry, EXTENT);
    expect(new Set(plan.settlements.map((s) => s.pattern))).toEqual(new Set(['shifting']));
    expect(plan.forms).toHaveLength(1);
    expect(plan.forms[0]).toMatchObject({ from: 'tradition', tradition: 'test/farmhouse', whose: 'shifting-cultivators', kin: 'farmers' });
    expect(plan.forms[0].spec).toMatchObject({ walls: 'timber' });
  });

  it('draws a house that some lived in for that part of the cells of its region, each cell all of one house, and alike from two scenes', () => {
    const traditions: Tradition[] = compileTraditions([
      { id: 'test/farmhouse', label: 'A farmhouse', regions: [1], span: [-500, 500], lifeways: ['farmers'], dwelling: { plan: 'rectangular', walls: 'timber' } },
      { id: 'test/tower', label: 'A tower', regions: [1], span: [-500, 500], lifeways: ['farmers'], prevalence: 'some', dwelling: { plan: 'round', walls: 'rammed-earth' } },
    ]);
    const p = world(() => ({ code: 32, density: 40, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }], { traditions });
    // A scene wide enough for a hundred cells and more: the part is of many.
    const wide = 60000;
    const plan = makeSettlement(spec(p), flat, dry, wide);
    const whose = (pl: typeof plan, s: (typeof plan.settlements)[number]) => pl.forms[s.form].tradition;
    // The 5′ cell a settlement is in, on the world's grid.
    const cellOf = (x: number, y: number) => `${Math.floor((1 - y / 111194.93) * 12)},${Math.floor((x / 111194.93 + 1) * 12)}`;
    const cells = new Map<string, Set<string | undefined>>();
    for (const s of plan.settlements) (cells.get(cellOf(s.x, s.y)) ?? cells.set(cellOf(s.x, s.y), new Set()).get(cellOf(s.x, s.y))!).add(whose(plan, s));
    expect(cells.size).toBeGreaterThan(100);
    // Every settlement is in one house or the other, and no cell has both.
    for (const set of cells.values()) expect(set.size).toBe(1);
    const towers = [...cells.values()].filter((set) => set.has('test/tower')).length;
    const part = (gen.params.prevalence as { some: number }).some;
    // The part its word stands for, within what a hundred and more cells allow.
    expect(Math.abs(towers / cells.size - part)).toBeLessThan(0.12);
    expect([...cells.values()].filter((set) => set.has('test/farmhouse')).length).toBe(cells.size - towers);
    // The same cell is the same house from a scene beside this one.
    const other = makeSettlement(spec(p, { lat: 0.2, lon: 0.15 }), flat, dry, wide);
    const [bx, by] = toLocal({ lat: 0, lon: 0 }, 0.2, 0.15);
    let matched = 0;
    for (const s of other.settlements) {
      const mine = cells.get(cellOf(s.x + bx, s.y + by));
      if (!mine) continue;
      matched++;
      expect(mine.has(whose(other, s))).toBe(true);
    }
    expect(matched).toBeGreaterThan(200);
  });

  describe('the animals people kept', () => {
    const always = { best: null, lo: -Infinity, hi: Infinity, derived: true };
    const animal = (id: string, label: string, length: number, mass: number): LivingTaxon => ({ id, label, form: id, form_from: id, form_label: label, own: true, tier: 'kept', weight: 1, rows: 0, biped: false, length, mass, time: { start: always, end: always, instant: false } });
    const kept = [animal('test/cattle', 'Cattle', 2.4, 500), animal('test/hens', 'Chickens', 0.4, 2)];
    const keptForms = Object.fromEntries(kept.map((k) => [k.form, { kind: 'animal', behave: { habitat: 'open', poses: k.mass! > 100 ? ['graze', 'stand', 'walk'] : ['stand', 'walk'] } }])) as unknown as Record<string, Form>;
    const husbandry = compileHusbandry([{ id: 'test/herding', label: 'Herding', regions: [1], span: [-500, 500], lifeways: ['herders'], animals: ['test/cattle', 'test/hens', 'test/unknown'] }]);
    const plan = (code: number, density: number, a: Assessment, extra: Partial<ScenePeople> = { husbandry, kept, keptForms }) => makeSettlement(spec(world(() => ({ code, density, region: 1 }), [{ id: 1, a }], extra)), flat, dry, EXTENT);

    it('are drawn where a husbandry tradition names them for that way of life: herds on the pasture, the rest about the houses', () => {
      const p = plan(42, 3, assess(1, 0, 0, 3));
      expect(p.animals.length).toBeGreaterThan(200);
      expect(new Set(p.settlements.map((s) => s.husbandry))).toEqual(new Set(['test/herding']));
      // About six to a house, as the generator's parameters say for herders, and both kinds alike.
      expect(p.animals.length / p.houses.length).toBeGreaterThan(4.5);
      expect(p.animals.length / p.houses.length).toBeLessThan(6.6);
      const of = (kind: number) => p.animals.filter((a) => a.kind === kind);
      expect(of(0).length / of(1).length).toBeGreaterThan(0.8);
      expect(of(0).length / of(1).length).toBeLessThan(1.25);
      // The cattle graze in herds beyond the tents, within their camp's pasture; the hens stay by a tent.
      for (const a of of(0)) {
        const s = p.settlements[a.settlement];
        const d = Math.hypot(a.x - s.x, a.y - s.y);
        expect(d).toBeGreaterThan(s.r);
        expect(d).toBeLessThan(Math.max(s.r * 1.15 + 75, s.fieldR * 0.9) + 40);
      }
      const tents = new Map<number, { x: number; y: number }[]>();
      for (const h of p.houses) (tents.get(h.settlement) ?? tents.set(h.settlement, []).get(h.settlement)!).push(h);
      for (const a of of(1)) expect(Math.min(...tents.get(a.settlement)!.map((h) => Math.hypot(a.x - h.x, a.y - h.y)))).toBeLessThan(10.01);
      // Cattle graze, mostly; hens do not.
      expect(of(0).some((a) => a.pose === 2)).toBe(true);
      expect(of(1).every((a) => a.pose !== 2)).toBe(true);
    });

    it('are not drawn for people whose way of life no husbandry names, nor where the world gives none', () => {
      // Farmers of the same region: the herding tradition is the herders'.
      const farmers = plan(23, 260, assess(1, 1, 3, 2));
      expect(farmers.animals).toEqual([]);
      expect(farmers.settlements.every((s) => s.husbandry === undefined)).toBe(true);
      expect(plan(42, 3, assess(1, 0, 0, 3), {}).animals).toEqual([]);
      // The same herd from two scenes: an animal of a camp well inside both stands in the same place.
      const a = plan(42, 3, assess(1, 0, 0, 3));
      const b = makeSettlement(spec(world(() => ({ code: 42, density: 3, region: 1 }), [{ id: 1, a: assess(1, 0, 0, 3) }], { husbandry, kept, keptForms }), { lat: 0.03, lon: 0.02 }), flat, dry, EXTENT);
      const [bx, by] = toLocal({ lat: 0, lon: 0 }, 0.03, 0.02);
      const spots = new Set(b.animals.map((x) => `${Math.round(x.x + bx)},${Math.round(x.y + by)}`));
      const inner = a.animals.filter((x) => Math.abs(x.x) < 6000 && Math.abs(x.y) < 6000);
      expect(inner.length).toBeGreaterThan(50);
      expect(inner.filter((x) => spots.has(`${Math.round(x.x)},${Math.round(x.y)}`)).length / inner.length).toBeGreaterThan(0.9);
    });
  });

  it('draws a city of the lists where the anthromes have none', () => {
    const cities = [{ name: 'Testopolis', country: 'Nowhere', lat: 0.02, lon: 0.03, people: 40000, field: 'field:people/cities-ancient', source: 'src:test', from: 'list' as const }];
    const p = world(() => ({ code: 54, density: 2, region: 1 }), [{ id: 1, a: assess(1, 0, 1, 3, 1) }], { cities });
    const plan = makeSettlement(spec(p), flat, dry, EXTENT);
    const city = plan.settlements.find((s) => s.city === 'Testopolis');
    expect(city).toBeDefined();
    expect(city!.pattern).toBe('city');
    expect(city!.people).toBe(40000);
    const [cx, cy] = toLocal({ lat: 0, lon: 0 }, 0.02, 0.03);
    expect(Math.hypot(city!.x - cx, city!.y - cy)).toBeLessThan(1);
    const near = plan.houses.filter((h) => Math.hypot(h.x - cx, h.y - cy) < city!.r * 1.2);
    expect(near.length).toBeGreaterThan(1000);
    // No herders' camp stands inside the city.
    expect(plan.settlements.filter((s) => !s.city && Math.hypot(s.x - cx, s.y - cy) < city!.r)).toEqual([]);
    // Round, not a square: the houses reach about as far in every direction, and no further than its radius allows.
    const mine = plan.houses.filter((h) => h.settlement === plan.settlements.indexOf(city!));
    const far = Math.max(...mine.map((h) => Math.hypot(h.x - cx, h.y - cy)));
    expect(far).toBeLessThan(city!.r * 1.6);
    const quarter = [0, 1, 2, 3].map((q) => mine.filter((h) => Math.floor(((Math.atan2(h.y - cy, h.x - cx) + Math.PI) / (Math.PI / 2)) % 4) === q).length / mine.length);
    for (const share of quarter) expect(share).toBeGreaterThan(0.15);
  });

  describe('a town', () => {
    // A city of 30,000 at the middle of a land of few herders, with the tradition of its region's townspeople, if any.
    const town = (form?: TownSpec, city: Partial<ScenePeople['cities'][number]> = {}) => {
      const traditions: Tradition[] = form ? compileTraditions([{ id: 'test/town-house', label: 'A town house', regions: [1], span: [-500, 500], lifeways: ['townspeople'], dwelling: { plan: 'courtyard', walls: 'mudbrick', roof: 'flat' }, town: form }]) : [];
      const cities = [{ name: 'Testopolis', country: 'Nowhere', lat: 0, lon: 0, people: 30000, field: 'field:people/cities-ancient', source: 'src:test', from: 'list' as const, ...city }];
      const plan = makeSettlement(spec(world(() => ({ code: 54, density: 2, region: 1 }), [{ id: 1, a: assess(1, 0, 1, 3, 1) }], { cities, traditions })), flat, dry, EXTENT);
      const s = plan.settlements.find((x) => x.city === 'Testopolis')!;
      const si = plan.settlements.indexOf(s);
      const mine = plan.houses.filter((h) => h.settlement === si);
      const all = plan.works.filter((w) => w.settlement === si);
      const kind = (k: string) => all.filter((w) => plan.workForms[w.form].spec.kind === k);
      // Its works: its wall and its water. The people by its houses and the boats on its water are counted apart.
      const works = all.filter((w) => !['person', 'boat'].includes(plan.workForms[w.form].spec.kind));
      const built = plan.workForms.filter((f) => !['person', 'boat'].includes(f.spec.kind));
      return { plan, s, mine, works, kind, built };
    };
    // How far the houses reach from the town's middle in each of `n` directions.
    const reach = (hs: { x: number; y: number }[], n: number) => Array.from({ length: n }, (_, k) => Math.max(0, ...hs.filter((h) => Math.floor(((Math.atan2(h.y, h.x) + Math.PI) / (2 * Math.PI)) * n) % n === k).map((h) => Math.hypot(h.x, h.y))));

    it('of no stated form is the generic town: lanes that wander, round with a wandering edge, and no wall', () => {
      const { plan, s, mine, works } = town();
      expect(mine.length).toBe(5000);
      expect(works).toEqual([]);
      expect(s.town).toEqual({ text: 'winding lanes, no wall', from: { streets: 'generic', wall: 'generic' } });
      // Every house on its own ground, none on another.
      const spots = new Set(mine.map((h) => `${Math.round(h.x / 4)},${Math.round(h.y / 4)}`));
      expect(spots.size).toBeGreaterThan(mine.length * 0.97);
      // Round: within the disc its people's ground makes, give or take its edge; and the edge wanders.
      const far = reach(mine, 8);
      expect(Math.max(...far)).toBeLessThan(s.r * 1.6);
      expect(Math.min(...far)).toBeGreaterThan(s.r * 0.6);
      expect(Math.max(...far) / Math.min(...far)).toBeGreaterThan(1.08);
      // Along lanes the houses do not all face one of two ways, as the rows of a planned town do.
      expect(new Set(mine.map((h) => Math.round(h.face * 100))).size).toBeGreaterThan(40);
      expect(plan.forms[s.form].whose).toBe('townspeople');
    });

    it('on a grid is square, its houses in rows that face their streets, and a main street each way through its middle', () => {
      const { s, mine } = town({ streets: 'grid', block: 80, street: 4, main_street: 12 });
      expect(s.town!.from).toMatchObject({ streets: 'test/town-house', block: 'test/town-house', wall: 'generic' });
      // The rows face one of two ways, back to back: the town's axis is the way they face.
      const faces = [...new Set(mine.map((h) => Math.round((((h.face % Math.PI) + Math.PI) % Math.PI) * 1000)))];
      expect(faces.length).toBeLessThanOrEqual(2);
      const axis = mine[0].face;
      const inFrame = mine.map((h) => ({ x: Math.cos(axis) * h.x - Math.sin(axis) * h.y, y: Math.sin(axis) * h.x + Math.cos(axis) * h.y }));
      // Square: houses stand in its corners, where a round town of the same ground has none.
      const half = Math.max(...inFrame.map((h) => Math.max(Math.abs(h.x), Math.abs(h.y))));
      expect(half).toBeLessThan(s.r * 1.05);
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) expect(inFrame.filter((h) => h.x * sx > half * 0.82 && h.y * sy > half * 0.82).length).toBeGreaterThan(20);
      // The main streets: no house within 6 m of either axis through the middle.
      expect(inFrame.filter((h) => Math.abs(h.x) < 6 || Math.abs(h.y) < 6)).toEqual([]);
      // As many houses as its people make, on about the ground they are given.
      expect(mine.length).toBe(5000);
      expect((2 * half) ** 2 / (5000 * 160)).toBeGreaterThan(0.85);
      expect((2 * half) ** 2 / (5000 * 160)).toBeLessThan(1.3);
    });

    it('has the wall its tradition says, round its houses, with gates where its main streets leave it, and towers', () => {
      const { s, mine, kind, built } = town({ streets: 'grid', wall: 'stone', wall_height: 9, gates: 4 });
      const wall = kind('wall');
      const gates = kind('gate');
      expect(gates.length).toBe(4);
      expect(kind('tower').length).toBeGreaterThan(8);
      expect(wall.length).toBeGreaterThan(200);
      expect(built.map((f) => `${f.spec.kind} ${f.spec.material} ${f.spec.height} ${f.from}`)).toEqual(['wall stone 9 test/town-house', 'gate stone 9 test/town-house', 'tower stone 9 test/town-house']);
      expect(s.town!.text).toBe('streets on a grid, a wall of stone 9 m high, 4 gates');
      // Every house is inside the wall: in each direction the wall stands further out than the furthest house.
      const out = reach(wall, 180);
      const houses = reach(mine, 180);
      out.forEach((r, k) => r > 0 && expect(r, `direction ${k}`).toBeGreaterThan(houses[k] + 2));
      // The wall is whole: a piece every few metres all the way round, but for its gates.
      expect(out.filter((r) => r === 0).length).toBeLessThanOrEqual(4);
      // Its pieces face out, and each gate stands at the end of a main street, clear of the wall's pieces.
      for (const w of wall) expect(Math.sin(w.face) * w.x + Math.cos(w.face) * w.y).toBeGreaterThan(0);
      const axis = mine[0].face;
      for (const g of gates) {
        const along = Math.cos(axis) * g.x - Math.sin(axis) * g.y;
        const across = Math.sin(axis) * g.x + Math.cos(axis) * g.y;
        expect(Math.min(Math.abs(along), Math.abs(across))).toBeLessThan(1);
        expect(wall.filter((w) => Math.hypot(w.x - g.x, w.y - g.y) < 4)).toEqual([]);
      }
    });

    it('has a wall of the plain kind where its form gives the wall and not what it was made of, and none before its claim holds', () => {
      // A wall twelve metres high, of what the source does not say: drawn, as the generator's plain wall, and said to be.
      const { plan, s, kind } = town({ streets: 'grid', wall_height: 12, wall_thickness: 3.4 });
      expect(kind('wall').length).toBeGreaterThan(100);
      expect(plan.workForms[kind('wall')[0].form]).toMatchObject({ label: 'A town wall, of what is not said', from: 'test/town-house', spec: { material: 'mudbrick', height: 12, thickness: 3.4 } });
      expect(s.town!.text).toBe('streets on a grid, a wall 12 m high, 3.4 m thick');
      // A palisade that the tradition's towns had only from a later time: none at the scene's.
      const traditions = compileTraditions([{ id: 'test/town-house', label: 'A town house', regions: [1], span: [-500, 500], lifeways: ['townspeople'], dwelling: { plan: 'long' }, town: { wall: 'timber' }, townSpan: [300, 500] }]);
      const cities = [{ name: 'Testopolis', country: 'Nowhere', lat: 0, lon: 0, people: 30000, field: 'field:people/cities-ancient', source: 'src:test', from: 'list' as const }];
      const early = makeSettlement(spec(world(() => ({ code: 54, density: 2, region: 1 }), [{ id: 1, a: assess(1, 0, 1, 3, 1) }], { cities, traditions })), flat, dry, EXTENT);
      expect(early.workForms.filter((f) => f.spec.kind === 'wall')).toEqual([]);
      expect(early.settlements[0].town!.from).toEqual({ streets: 'generic', wall: 'generic' });
    });

    it('has a rampart or a palisade with no towers, and a moat with a way across before each gate', () => {
      const earth = town({ wall: 'earth', moat: true, gates: 3 });
      expect(earth.kind('tower')).toEqual([]);
      expect(earth.kind('gate').length).toBe(3);
      expect(earth.kind('moat').length).toBeGreaterThan(100);
      // The moat lies outside the wall, and is broken before the gates.
      const wall = reach(earth.kind('wall'), 90);
      reach(earth.kind('moat'), 90).forEach((r, k) => r > 0 && wall[k] > 0 && expect(r).toBeGreaterThan(wall[k] + 8));
      for (const g of earth.kind('gate')) expect(earth.kind('moat').filter((m) => Math.hypot(m.x - g.x, m.y - g.y) < 12)).toEqual([]);
      expect(earth.s.town!.text).toBe('winding lanes, a rampart of earth, 3 gates, a moat outside it');
      expect(town({ wall: 'timber' }).kind('tower')).toEqual([]);
    });

    it('of canals has water in some of its streets, and no house in it', () => {
      const { mine, kind, plan } = town({ streets: 'canals' });
      const water = kind('canal');
      expect(water.length).toBeGreaterThan(100);
      expect(plan.workForms[water[0].form].from).toBe('test/town-house');
      // No house stands within a canal's width of its water.
      const cells = new Map<string, { x: number; y: number }[]>();
      for (const w of water) {
        const k = `${Math.floor(w.x / 40)},${Math.floor(w.y / 40)}`;
        (cells.get(k) ?? cells.set(k, []).get(k)!).push(w);
      }
      for (const h of mine) {
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          for (const w of cells.get(`${Math.floor(h.x / 40) + i},${Math.floor(h.y / 40) + j}`) ?? []) expect(Math.hypot(h.x - w.x, h.y - w.y)).toBeGreaterThan(3);
        }
      }
    });

    it("of a record is drawn from the record's own people, houses, ground and layout", () => {
      // 2,400 houses a source counted, on 100 hectares, behind a wall of mudbrick: none of it the list's or the generator's.
      const { plan, s, mine, kind } = town(undefined, { people: 12000, from: 'record', record: 'people/cities/recordia', houses: 2400, area: 100, town: { streets: 'grid', wall: 'mudbrick' } });
      expect(s).toMatchObject({ people: 12000, record: 'people/cities/recordia', from: 'record', pattern: 'city' });
      expect(mine.length).toBe(2400);
      const axis = mine[0].face;
      const half = Math.max(...mine.map((h) => Math.max(Math.abs(Math.cos(axis) * h.x - Math.sin(axis) * h.y), Math.abs(Math.sin(axis) * h.x + Math.cos(axis) * h.y))));
      expect((2 * half) ** 2 / 1e6).toBeGreaterThan(0.85);
      expect((2 * half) ** 2 / 1e6).toBeLessThan(1.25);
      expect(s.town!.from).toEqual({ streets: 'people/cities/recordia', wall: 'people/cities/recordia' });
      expect(kind('wall').length).toBeGreaterThan(100);
      expect(plan.workForms[kind('wall')[0].form]).toMatchObject({ from: 'people/cities/recordia', label: 'A wall of mudbrick' });
      // A record's layout stands over its tradition's, part by part.
      const both = town({ streets: 'lanes', wall: 'stone', gates: 6 }, { record: 'people/cities/recordia', from: 'record', town: { wall: 'brick' } });
      expect(both.s.town!.from).toEqual({ streets: 'test/town-house', wall: 'people/cities/recordia', gates: 'test/town-house' });
      expect(both.kind('gate').length).toBe(6);
      expect(both.built.every((f) => f.spec.material === 'brick')).toBe(true);
    });

    it('too thin on the ground for streets has none: its houses stand apart, as many as its people make', () => {
      // 12,000 people on 2,000 hectares: a hectare to a house.
      const { s, mine, works } = town({ streets: 'grid', wall: 'stone' }, { people: 12000, from: 'record', record: 'people/cities/gardens', area: 2000 });
      expect(mine.length).toBe(2000);
      expect(works).toEqual([]);
      expect(s.town).toBeUndefined();
      expect(Math.max(...mine.map((h) => Math.hypot(h.x, h.y)))).toBeGreaterThan(2000);
    });
  });

  describe('people, boats and paths', () => {
    const villages = () => world(() => ({ code: 23, density: 260, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }]);
    const of = (plan: ReturnType<typeof makeSettlement>, kind: string) => plan.works.filter((w) => plan.workForms[w.form].spec.kind === kind);
    /** Of some people standing: how far each is from the nearest house of its settlement, and how many stand within a house's walls. */
    const standing = (plan: ReturnType<typeof makeSettlement>, people: { x: number; y: number; settlement: number }[]) => {
      const byPlace = new Map<number, (typeof plan.houses)[number][]>();
      for (const h of plan.houses) (byPlace.get(h.settlement) ?? byPlace.set(h.settlement, []).get(h.settlement)!).push(h);
      const sizes = plan.forms.map((f) => houseSize(f.spec));
      let inside = 0;
      const near: number[] = [];
      for (const p of people) {
        const mine = byPlace.get(p.settlement)!;
        near.push(Math.min(...mine.map((h) => Math.hypot(p.x - h.x, p.y - h.y))));
        // In a house's own frame: its front faces the way it is turned, its length along that.
        if (mine.some((h) => {
          const dx = p.x - h.x;
          const dy = p.y - h.y;
          const along = dx * Math.sin(h.face) + dy * Math.cos(h.face);
          const across = dx * Math.cos(h.face) - dy * Math.sin(h.face);
          return Math.abs(along) < (sizes[h.form].l / 2) * h.size - 0.05 && Math.abs(across) < (sizes[h.form].w / 2) * h.size - 0.05;
        })) inside++;
      }
      return { near, inside };
    };

    it('stands a few plain people by the houses of each settlement, and says they are generic', () => {
      const plan = makeSettlement(spec(villages()), flat, dry, EXTENT);
      const people = of(plan, 'person');
      expect(people.length / plan.houses.length).toBeGreaterThan(0.3);
      expect(people.length / plan.houses.length).toBeLessThan(0.6);
      expect(plan.workForms.find((f) => f.spec.kind === 'person')).toMatchObject({ label: 'A person', from: 'generic' });
      // Each a few steps from a house of its own settlement, and outside the walls of every one of them.
      const { near, inside } = standing(plan, people.slice(0, 400));
      expect(Math.max(...near)).toBeLessThan(9);
      expect(inside).toBe(0);
    });

    it('stands them outside the walls of a house however big it is, and in the street of a town', () => {
      // A courtyard house twelve metres across: nobody stands in its court or under its roof.
      const traditions = compileTraditions([{ id: 'test/courtyard', label: 'A courtyard house', regions: [1], span: [-500, 500], lifeways: ['farmers', 'townspeople'], dwelling: { plan: 'courtyard', width: 12, length: 12, walls: 'mudbrick', roof: 'flat' } }]);
      const plan = makeSettlement(spec(world(() => ({ code: 23, density: 260, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }], { traditions })), flat, dry, EXTENT);
      const village = standing(plan, of(plan, 'person').slice(0, 400));
      expect(village.inside).toBe(0);
      expect(Math.max(...village.near)).toBeLessThan(13);
      // A town on a grid: its houses stand wall to wall, and its people in the streets before them.
      const cities = [{ name: 'Testopolis', country: 'Nowhere', lat: 0, lon: 0, people: 30000, field: 'field:people/cities-ancient', source: 'src:test', from: 'list' as const }];
      const town = makeSettlement(spec(world(() => ({ code: 54, density: 2, region: 1 }), [{ id: 1, a: assess(1, 0, 1, 3, 1) }], { cities, traditions: compileTraditions([{ id: 'test/town-house', label: 'A town house', regions: [1], span: [-500, 500], lifeways: ['townspeople'], dwelling: { plan: 'rectangular' }, town: { streets: 'grid' } }]) })), flat, dry, EXTENT);
      const folk = of(town, 'person').filter((w) => town.settlements[w.settlement].city);
      expect(folk.length).toBeGreaterThan(100);
      // A few in a hundred may stand where a street narrows to a neighbour's wall.
      expect(standing(town, folk).inside / folk.length).toBeLessThan(0.03);
    });

    it('floats boats only on water deep enough, beside a settlement, and none on dry land', () => {
      expect(of(makeSettlement(spec(villages()), flat, dry, EXTENT), 'boat')).toEqual([]);
      // A river 400 m wide and 3 m deep along y, its water at 37 m: boats ride on it, at its level.
      const ground: Ground = { at: (x) => (Math.abs(x) < 200 ? 34 : 40) };
      const river = () => 37;
      const plan = makeSettlement(spec(villages()), ground, river, EXTENT);
      const boats = of(plan, 'boat');
      expect(boats.length).toBeGreaterThan(5);
      for (const b of boats) {
        expect(Math.abs(b.x)).toBeLessThan(200);
        expect(b.z).toBeCloseTo(36.95, 5);
        const s = plan.settlements[b.settlement];
        expect(Math.hypot(b.x - s.x, b.y - s.y)).toBeLessThan(s.r + 261);
      }
    });

    it('joins each settlement to its nearest neighbours by a path that ends at the edge of their houses', () => {
      const plan = makeSettlement(spec(villages()), flat, dry, EXTENT);
      expect(plan.pathWidth).toBeGreaterThan(1);
      expect(plan.paths.length).toBeGreaterThan(50);
      const near = (x: number, y: number) => plan.settlements.reduce((best, s) => Math.min(best, Math.hypot(x - s.x, y - s.y) - s.r), Infinity);
      let length = 0;
      for (const line of plan.paths) {
        expect(line.length).toBeGreaterThanOrEqual(6);
        // Each end at the edge of a settlement's houses; no step of it long enough to cut a corner of the ground.
        expect(near(line[0], line[1])).toBeLessThan(1);
        expect(near(line.at(-2)!, line.at(-1)!)).toBeLessThan(1);
        for (let q = 2; q < line.length; q += 2) {
          const d = Math.hypot(line[q] - line[q - 2], line[q + 1] - line[q - 1]);
          expect(d).toBeLessThan(40);
          length += d;
        }
      }
      // No more than the most the scene lays, give or take the last path.
      expect(length).toBeLessThan(302_500);
      // Herders' and foragers' camps are joined by none.
      const camps = makeSettlement(spec(world(() => ({ code: 42, density: 3, region: 1 }), [{ id: 1, a: assess(1, 0, 0, 3) }])), flat, dry, EXTENT);
      expect(camps.paths).toEqual([]);
    });
  });

  it('seeds each cell and each settlement apart, and each alike from two scenes', () => {
    const p = world(() => ({ code: 23, density: 260, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }]);
    const plan = makeSettlement(spec(p), flat, dry, EXTENT);
    // The houses of a settlement, from its middle, as a set.
    const shape = (pl: typeof plan, si: number) => pl.houses.filter((h) => h.settlement === si).map((h) => `${Math.round(h.x - pl.settlements[si].x)},${Math.round(h.y - pl.settlements[si].y)}`).sort().join(' ');
    const whole = plan.settlements.map((s, i) => ({ s, i })).filter(({ s }) => Math.abs(s.x) < EXTENT - 3000 && Math.abs(s.y) < EXTENT - 3000);
    // No two villages are laid out alike.
    const shapes = new Set(whole.slice(0, 40).map(({ i }) => shape(plan, i)));
    expect(shapes.size).toBe(40);
    // Nor do two cells put their villages on the same spots within the cell: the offsets from each cell's corner differ.
    const cell = 111194.93 / 12;
    const within = new Set(whole.map(({ s }) => `${Math.round((((s.x % cell) + cell) % cell) / 50)},${Math.round((((s.y % cell) + cell) % cell) / 50)}`));
    expect(within.size).toBeGreaterThan(whole.length * 0.5);
    // The same village is the same village from a scene beside this one.
    const other = makeSettlement(spec(p, { lat: 0.05, lon: 0.04 }), flat, dry, EXTENT);
    const [bx, by] = toLocal({ lat: 0, lon: 0 }, 0.05, 0.04);
    let matched = 0;
    // Those whole in both scenes: a village at a scene's edge is drawn as far as the scene reaches.
    for (const { s, i } of whole.filter(({ s }) => Math.abs(s.x - bx) < EXTENT - 3000 && Math.abs(s.y - by) < EXTENT - 3000).slice(0, 40)) {
      const j = other.settlements.findIndex((o) => Math.hypot(o.x + bx - s.x, o.y + by - s.y) < 3);
      if (j < 0) continue;
      matched++;
      expect(shape(other, j)).toBe(shape(plan, i));
    }
    expect(matched).toBeGreaterThan(20);
  });

  it('puts a settlement in the same place from two scenes that overlap', () => {
    const p = world((r, c) => ({ code: (r + c) % 3 ? 32 : 23, density: (r + c) % 3 ? 40 : 260, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }]);
    const a = { lat: 0, lon: 0 };
    const b = { lat: 0.06, lon: 0.05 };
    const pa = makeSettlement(spec(p, a), flat, dry, EXTENT);
    const pb = makeSettlement(spec(p, b), flat, dry, EXTENT);
    // Back to degrees, each from its own scene's origin.
    const deg = (o: { lat: number; lon: number }, x: number, y: number) => [o.lat + y / 111194.93, o.lon + x / (111194.93 * Math.cos((o.lat * Math.PI) / 180))];
    const [bx, by] = toLocal(a, b.lat, b.lon);
    const shared = pa.settlements.filter((s) => Math.abs(s.x - bx) < EXTENT - 2000 && Math.abs(s.y - by) < EXTENT - 2000 && Math.abs(s.x) < EXTENT - 2000 && Math.abs(s.y) < EXTENT - 2000);
    expect(shared.length).toBeGreaterThan(50);
    const others = pb.settlements.map((s) => deg(b, s.x, s.y));
    for (const s of shared) {
      const [la, lo] = deg(a, s.x, s.y);
      const best = Math.min(...others.map(([lb, ob]) => Math.hypot((la - lb) * 111194.93, (lo - ob) * 111194.93)));
      expect(best).toBeLessThan(2);
    }
  });
});
