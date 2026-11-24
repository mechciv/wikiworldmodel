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
import { houseSize, HOUSE_VARIANTS } from '../dwellings.ts';
import { ROUTE, roundOf, wayAt, type RoutineParams } from '../../life/routines.ts';
import { personGoes } from '../figures.ts';
import { WORK_VARIANTS } from '../works.ts';
import { farLand, farLandMask, farScale, LandUseMap, makeSettlement, toLocal, type Ground } from './v9.ts';
import { FIELD_USE, GROWTH, SITING, type WaterNear } from './sites.ts';

const ROOT = join(import.meta.dirname, '../../../..');
// How the living scene's animals go about: the settlement's kept ones go by the same parameters.
const beasts = (parse(readFileSync(join(ROOT, 'world/generators/life/scene.yaml'), 'utf8')) as { params: { animals: { routines: RoutineParams } } }).params.animals.routines;
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

    it('feed and move on once they are drawn: a herd keeps out from among the houses, and what is kept by them stays among them', () => {
      const still = plan(42, 3, assess(1, 0, 0, 3));
      const p = makeSettlement(spec(world(() => ({ code: 42, density: 3, region: 1 }), [{ id: 1, a: assess(1, 0, 0, 3) }], { husbandry, kept, keptForms })), flat, dry, EXTENT, beasts);
      // Without the living scene's parameters they stay where they stand; with them each starts from the same place.
      expect(still.animals.every((a) => a.way === undefined)).toBe(true);
      expect(p.animals.map((a) => [a.x, a.y, a.face])).toEqual(still.animals.map((a) => [a.x, a.y, a.face]));
      expect(p.ways.length % ROUTE).toBe(0);
      const goers = p.animals.filter((a) => a.way !== undefined);
      expect(goers.length / p.animals.length).toBeGreaterThan(0.5);
      // How far each settlement's houses reach from its middle.
      const reach = p.settlements.map(() => 0);
      for (const h of p.houses) reach[h.settlement] = Math.max(reach[h.settlement], Math.hypot(h.x - p.settlements[h.settlement].x, h.y - p.settlements[h.settlement].y));
      for (const a of goers.slice(0, 400)) {
        const s = p.settlements[a.settlement];
        const T = roundOf(p.ways, a.way!);
        expect(T).toBeGreaterThan(1);
        for (let k = 0; k < 16; k++) {
          const at = wayAt(p.ways, a.way!, Math.sin(a.face), Math.cos(a.face), (T * k) / 16);
          const d = Math.hypot(a.x + at.x - s.x, a.y + at.y - s.y);
          // The cattle stay out on the pasture; the hens stay among the tents.
          if (a.kind === 0) expect(d).toBeGreaterThan(reach[a.settlement]);
          else expect(d).toBeLessThan(reach[a.settlement] + 8.01);
        }
      }
      // Cattle feed, and stay a while where they do; hens wander, and stop only briefly.
      const stay = (kind: number) => goers.filter((a) => a.kind === kind).map((a) => p.ways[a.way! + 7]);
      // One that goes beside its leader sets out a little after it, and stays that much less at the first place.
      expect(Math.min(...stay(0))).toBeGreaterThanOrEqual(beasts.feed.stay[0] * 0.6);
      expect(Math.max(...stay(1))).toBeLessThanOrEqual(beasts.wander.stay[1]);
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
    const ACTIVITY = new Set(['person', 'boat', 'stall', 'altar', 'kiln', 'stook', 'plough', 'cart', 'barrow', 'jetty', 'floor', 'rack', 'stack']);
    const town = (form?: TownSpec, city: Partial<ScenePeople['cities'][number]> = {}) => {
      const traditions: Tradition[] = form ? compileTraditions([{ id: 'test/town-house', label: 'A town house', regions: [1], span: [-500, 500], lifeways: ['townspeople'], dwelling: { plan: 'courtyard', walls: 'mudbrick', roof: 'flat' }, town: form }]) : [];
      const cities = [{ name: 'Testopolis', country: 'Nowhere', lat: 0, lon: 0, people: 30000, field: 'field:people/cities-ancient', source: 'src:test', from: 'list' as const, ...city }];
      const plan = makeSettlement(spec(world(() => ({ code: 54, density: 2, region: 1 }), [{ id: 1, a: assess(1, 0, 1, 3, 1) }], { cities, traditions })), flat, dry, EXTENT);
      const s = plan.settlements.find((x) => x.city === 'Testopolis')!;
      const si = plan.settlements.indexOf(s);
      const mine = plan.houses.filter((h) => h.settlement === si);
      const all = plan.works.filter((w) => w.settlement === si);
      const kind = (k: string) => all.filter((w) => plan.workForms[w.form].spec.kind === k);
      // Its structural works (e.g. canals) and continuous perimeter (wall, gates, towers, moat), apart from everyday living activity.
      const works = all.filter((w) => !ACTIVITY.has(plan.workForms[w.form].spec.kind));
      const perimeter = plan.perimeters.find((pr) => pr.settlement === si);
      const townStreets = plan.streets.filter((st) => st.settlement === si);
      return { plan, s, mine, works, kind, perimeter, townStreets };
    };
    // How far the houses reach from the town's middle in each of `n` directions.
    const reach = (hs: { x: number; y: number }[], n: number) => Array.from({ length: n }, (_, k) => Math.max(0, ...hs.filter((h) => Math.floor(((Math.atan2(h.y, h.x) + Math.PI) / (2 * Math.PI)) * n) % n === k).map((h) => Math.hypot(h.x, h.y))));

    it('of no stated form is the generic town: lanes that wander, round with a wandering edge, and no wall', () => {
      const { plan, s, mine, works, perimeter } = town();
      expect(mine.length).toBe(5000);
      expect(works).toEqual([]);
      expect(perimeter).toBeUndefined();
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
      const { s, mine, townStreets } = town({ streets: 'grid', block: 80, street: 4, main_street: 12 });
      expect(s.town!.from).toMatchObject({ streets: 'test/town-house', block: 'test/town-house', wall: 'generic' });
      expect(townStreets.filter((st) => st.paved).length).toBeGreaterThanOrEqual(2);
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
      const { s, mine, perimeter } = town({ streets: 'grid', wall: 'stone', wall_height: 9, gates: 4 });
      expect(perimeter).toBeDefined();
      expect(perimeter!).toMatchObject({ kind: 'stone', height: 9, towers: true, from: 'test/town-house', gateFrom: 'test/town-house' });
      expect(perimeter!.gates.length).toBe(4);
      expect(perimeter!.ring.length).toBeGreaterThanOrEqual(16);
      expect(s.town!.text).toBe('streets on a grid, a wall of stone 9 m high, 4 gates');
      // Every house is inside the continuous wall ring: the ring stands further out than every house.
      const ringPts = perimeter!.ring.map(([x, y]) => ({ x, y }));
      const out = reach(ringPts, 16);
      const houses = reach(mine, 16);
      out.forEach((r, k) => r > 0 && expect(r, `sector ${k}`).toBeGreaterThan(houses[k] + 2));
      // Each gate faces outward and stands at the end of a main street.
      const axis = mine[0].face;
      for (const g of perimeter!.gates) {
        expect(g.dx * g.x + g.dy * g.y).toBeGreaterThan(0);
        const along = Math.cos(axis) * g.x - Math.sin(axis) * g.y;
        const across = Math.sin(axis) * g.x + Math.cos(axis) * g.y;
        expect(Math.min(Math.abs(along), Math.abs(across))).toBeLessThan(2);
      }
    });

    it('has a wall of the plain kind where its form gives the wall and not what it was made of, and none before its claim holds', () => {
      // A wall twelve metres high, of what the source does not say: drawn, as the generator's plain wall, and said to be.
      const { s, perimeter } = town({ streets: 'grid', wall_height: 12, wall_thickness: 3.4 });
      expect(perimeter).toBeDefined();
      expect(perimeter!).toMatchObject({ label: 'A town wall, of what is not said', from: 'test/town-house', kind: 'mudbrick', height: 12, thickness: 3.4 });
      expect(s.town!.text).toBe('streets on a grid, a wall 12 m high, 3.4 m thick');
      // A palisade that the tradition's towns had only from a later time: none at the scene's.
      const traditions = compileTraditions([{ id: 'test/town-house', label: 'A town house', regions: [1], span: [-500, 500], lifeways: ['townspeople'], dwelling: { plan: 'long' }, town: { wall: 'timber' }, townSpan: [300, 500] }]);
      const cities = [{ name: 'Testopolis', country: 'Nowhere', lat: 0, lon: 0, people: 30000, field: 'field:people/cities-ancient', source: 'src:test', from: 'list' as const }];
      const early = makeSettlement(spec(world(() => ({ code: 54, density: 2, region: 1 }), [{ id: 1, a: assess(1, 0, 1, 3, 1) }], { cities, traditions })), flat, dry, EXTENT);
      expect(early.perimeters).toEqual([]);
      expect(early.settlements[0].town!.from).toEqual({ streets: 'generic', wall: 'generic' });
    });

    it('has a rampart or a palisade with no towers, and a moat with a way across before each gate', () => {
      const earth = town({ wall: 'earth', moat: true, gates: 3 });
      expect(earth.perimeter).toBeDefined();
      expect(earth.perimeter!.kind).toBe('earth');
      expect(earth.perimeter!.towers).toBe(false);
      expect(earth.perimeter!.gates.length).toBe(3);
      expect(earth.perimeter!.moat).toBeGreaterThan(0);
      expect(earth.s.town!.text).toBe('winding lanes, a rampart of earth, 3 gates, a moat outside it');
      expect(town({ wall: 'timber' }).perimeter!.towers).toBe(false);
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
      const { s, mine, perimeter } = town(undefined, { people: 12000, from: 'record', record: 'people/cities/recordia', houses: 2400, area: 100, town: { streets: 'grid', wall: 'mudbrick' } });
      expect(s).toMatchObject({ people: 12000, record: 'people/cities/recordia', from: 'record', pattern: 'city' });
      expect(mine.length).toBe(2400);
      const axis = mine[0].face;
      const half = Math.max(...mine.map((h) => Math.max(Math.abs(Math.cos(axis) * h.x - Math.sin(axis) * h.y), Math.abs(Math.sin(axis) * h.x + Math.cos(axis) * h.y))));
      expect((2 * half) ** 2 / 1e6).toBeGreaterThan(0.85);
      expect((2 * half) ** 2 / 1e6).toBeLessThan(1.25);
      expect(s.town!.from).toEqual({ streets: 'people/cities/recordia', wall: 'people/cities/recordia' });
      expect(perimeter).toMatchObject({ kind: 'mudbrick', from: 'people/cities/recordia', label: 'A wall of mudbrick' });
      // A record's layout stands over its tradition's, part by part.
      const both = town({ streets: 'lanes', wall: 'stone', gates: 6 }, { record: 'people/cities/recordia', from: 'record', town: { wall: 'brick' } });
      expect(both.s.town!.from).toEqual({ streets: 'test/town-house', wall: 'people/cities/recordia', gates: 'test/town-house' });
      expect(both.perimeter!.gates.length).toBe(6);
      expect(both.perimeter!.kind).toBe('brick');
      expect(both.perimeter!.from).toBe('people/cities/recordia');
    });

    it('too thin on the ground for streets has none: its houses stand apart, as many as its people make', () => {
      // 12,000 people on 2,000 hectares: a hectare to a house.
      const { s, mine, works, perimeter } = town({ streets: 'grid', wall: 'stone' }, { people: 12000, from: 'record', record: 'people/cities/gardens', area: 2000 });
      expect(mine.length).toBe(2000);
      expect(works).toEqual([]);
      expect(perimeter).toBeUndefined();
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

    it('sends those who stand, walk or carry about, between places clear of every house; those who sit or kneel stay', () => {
      const plan = makeSettlement(spec(villages()), flat, dry, EXTENT);
      const people = plan.works.map((w, wi) => ({ w, wi })).filter(({ w }) => plan.workForms[w.form].spec.kind === 'person');
      expect(plan.ways.length % ROUTE).toBe(0);
      const goers = people.filter(({ w }) => w.way !== undefined);
      expect(goers.length / people.length).toBeGreaterThan(0.4);
      for (const { w, wi } of people) if (personGoes(wi % WORK_VARIANTS) === 'stays') expect(w.way).toBeUndefined();
      // Wherever one is on the way, at any moment of the round: outside the walls of every house of the settlement,
      // and no further from its houses than an errand goes.
      const byPlace = new Map<number, (typeof plan.houses)[number][]>();
      for (const h of plan.houses) (byPlace.get(h.settlement) ?? byPlace.set(h.settlement, []).get(h.settlement)!).push(h);
      let inside = 0;
      let far = 0;
      let checked = 0;
      let underWay = 0;
      for (const { w, wi } of goers.slice(0, 300)) {
        const T = roundOf(plan.ways, w.way!);
        expect(T).toBeGreaterThan(5);
        // One drawn walking or carrying is on the way as the clock starts.
        if (personGoes(wi % WORK_VARIANTS) === 'going' && wayAt(plan.ways, w.way!, Math.sin(w.face), Math.cos(w.face), 0).going > 0.9) underWay++;
        for (let k = 0; k < 20; k++) {
          const at = wayAt(plan.ways, w.way!, Math.sin(w.face), Math.cos(w.face), (T * k) / 20);
          const x = w.x + at.x;
          const y = w.y + at.y;
          expect(at.z).toBe(0);
          checked++;
          let near = Infinity;
          for (const h of byPlace.get(w.settlement)!) {
            const f = plan.forms[h.form];
            const sz = houseSize(f.spec, h.variant, f.grow ?? 1);
            const along = (x - h.x) * Math.sin(h.face) + (y - h.y) * Math.cos(h.face);
            const across = (x - h.x) * Math.cos(h.face) - (y - h.y) * Math.sin(h.face);
            if (Math.abs(along) < sz.l / 2 && Math.abs(across) < sz.w / 2) inside++;
            near = Math.min(near, Math.hypot(x - h.x, y - h.y));
          }
          if (near > 60) far++;
        }
      }
      expect(checked).toBeGreaterThan(2000);
      expect(inside).toBe(0);
      expect(far).toBe(0);
      expect(underWay).toBeGreaterThan(10);
      // The same people, from the same places: version 3's, with somewhere to go.
      expect(people.every(({ w }) => Number.isFinite(w.x) && Number.isFinite(w.face))).toBe(true);
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

    it('joins neighbouring farming settlements at the ends of their through lanes', () => {
      const plan = makeSettlement(spec(villages()), flat, dry, EXTENT);
      expect(plan.pathWidth).toBeGreaterThan(1);
      expect(plan.paths.length).toBeGreaterThan(50);
      const ends = plan.lanes.filter(l => l.width === (gen.params.lanes as { main: number }).main)
        .flatMap(l => [l.line.slice(0, 2), l.line.slice(-2)]);
      const meets = (x: number, y: number) => ends.some(([ex, ey]) => Math.hypot(x - ex, y - ey) < 1e-6);
      let length = 0;
      for (const line of plan.paths) {
        expect(line.length).toBeGreaterThanOrEqual(6);
        // Each end meets the through lane in the fields; no step of it long enough to cut a corner of the ground.
        expect(meets(line[0], line[1])).toBe(true);
        expect(meets(line.at(-2)!, line.at(-1)!)).toBe(true);
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

describe('where settlements stand, and what they farm (sites.ts)', () => {
  // A river along the meridian, its water at 0 m, in a plain that rises gently from it; and steep hills east of 9 km,
  // rising 1 in 2, where neither a house nor a field can be.
  const plain: Ground = { at: (x) => (Math.abs(x) < 60 ? -2 : 3 + Math.abs(x) * 0.002 + (x > 9000 ? (x - 9000) * 0.5 : 0)) };
  const near: WaterNear = { at: (x) => Math.abs(x) };
  const p = world(() => ({ code: 32, density: 40, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }]);
  const plan = makeSettlement(spec(p), plain, dry, EXTENT, undefined, near);
  const drawn = plan.settlements.filter((s) => s.houses > 0);
  // The 5′ cells' edges, in the scene's metres: the world's grid starts at 1°N 1°W, and the scene's middle is on an edge.
  const CELL = 111194.93 / 12;
  const toEdge = (v: number) => Math.min(((v % CELL) + CELL) % CELL, CELL - (((v % CELL) + CELL) % CELL));

  it('draws the scenes of a build made before it had its siting as a build made now would', () => {
    expect(gen.params.siting).toEqual(SITING);
    expect(gen.params.growth).toEqual(GROWTH);
    const { siting: _s, growth: _g, ...older } = gen.params;
    const old = makeSettlement(spec({ ...p, generator: { ...p.generator, version: 8, params: older } }), plain, dry, EXTENT, undefined, near);
    expect(old.settlements.map((s) => [s.x, s.y])).toEqual(plan.settlements.map((s) => [s.x, s.y]));
  });

  it('stands its settlements near water and on level ground, more than the land there would', () => {
    // The ground a house may stand on, and how much of it is within 2 km of the river.
    let land = 0;
    let landNear = 0;
    for (let x = -EXTENT; x < EXTENT; x += 100) {
      const z = plain.at(x, 0);
      const steep = Math.abs(plain.at(x + 12, 0) - plain.at(x - 12, 0)) / 24;
      if (z > 1.5 && steep < 0.25) {
        land++;
        if (Math.abs(x) < 2000) landNear++;
      }
    }
    expect(drawn.length).toBeGreaterThan(200);
    const share = drawn.filter((s) => Math.abs(s.x) < 2000).length / drawn.length;
    expect(share).toBeGreaterThan((1.5 * landNear) / land);
    // And none on the steep hills.
    expect(drawn.every((s) => s.x < 9000)).toBe(true);
  });

  it('draws its settlements in many sizes within their range, the larger on the better ground', () => {
    const range = gen.params.patterns as Record<string, { houses: [number, number] }>;
    const sizes = new Set(drawn.map((s) => Math.round(s.people / 5)));
    expect(sizes.size).toBeGreaterThan(4);
    const [lo, hi] = range[drawn[0].pattern].houses;
    for (const s of drawn) {
      expect(s.people / 5).toBeGreaterThanOrEqual(lo - 0.01);
      expect(s.people / 5).toBeLessThanOrEqual(hi + 0.01);
    }
    // In the two cells either side of the river, the larger half stand nearer it than the smaller.
    const by = drawn.filter((s) => Math.abs(s.x) < CELL).sort((a, b) => b.people - a.people);
    const mean = (l: typeof by) => l.reduce((a, s) => a + Math.abs(s.x), 0) / l.length;
    expect(mean(by.slice(0, by.length >> 1))).toBeLessThan(mean(by.slice(by.length >> 1)));
  });

  it("shows no step at a cell's edge, and stands no two settlements nearer than its spacing allows", () => {
    const flatPlan = makeSettlement(spec(p), flat, dry, EXTENT);
    const s = flatPlan.settlements.filter((x) => x.houses > 0 && Math.abs(x.x) < EXTENT - 500 && Math.abs(x.y) < EXTENT - 500);
    // As many stand within 500 m of a cell's edge as the ground there would hold, give or take what chance and
    // their gathering allow: a cell's edge is no line on the land.
    const band = 1 - ((CELL - 1000) / CELL) ** 2;
    const edge = s.filter((x) => Math.min(toEdge(x.x), toEdge(x.y)) < 500).length / s.length;
    expect(edge / band).toBeGreaterThan(0.7);
    expect(edge / band).toBeLessThan(1.3);
    // No two nearer than a share of how far apart they stand on average, across a cell's edge as within it.
    const apart = Math.sqrt(((2 * EXTENT) * (2 * EXTENT)) / flatPlan.settlements.length);
    let nearest = Infinity;
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) nearest = Math.min(nearest, Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y));
    expect(nearest).toBeGreaterThan(0.3 * apart);
  });

  it("grows each settlement's fields over the land, not in the water or on the steep, until they are as large as its people farmed, up to its neighbours'", () => {
    const f = plan.fields;
    let neighbours = 0;
    const own = new Map<number, number[]>();
    for (let j = 0; j < f.ny; j++) {
      for (let i = 0; i < f.nx; i++) {
        const k = j * f.nx + i;
        if (!f.use[k]) continue;
        const x = f.x0 + i * f.cell;
        // Not in the river, nor on the hills.
        expect(Math.abs(x) >= 60 && x < 9000 + f.cell).toBe(true);
        expect(f.use[k]).toBe(FIELD_USE.rainfed);
        if (f.owner[k] >= 0) (own.get(f.owner[k]) ?? own.set(f.owner[k], []).get(f.owner[k])!).push(k);
        if (i + 1 < f.nx && f.use[k + 1] && f.owner[k + 1] !== f.owner[k]) neighbours++;
      }
    }
    // Two settlements' fields meet in many places.
    expect(neighbours).toBeGreaterThan(100);
    // Each has about as much as its people farmed, where the land and its neighbours leave it room; and its fields are
    // not a disc about it: some lie further from it than a disc as large would reach.
    const ratio: number[] = [];
    const outside: number[] = [];
    plan.settlements.forEach((s, si) => {
      const nodes = own.get(si);
      if (!nodes || s.x > 6000 || Math.abs(s.x) < 3000) return;
      // Its fields and its houses' own ground, as the far land counts them.
      const area = Math.PI * s.fieldR * s.fieldR;
      ratio.push((nodes.length * f.cell * f.cell) / area);
      const disc = Math.sqrt((nodes.length * f.cell * f.cell) / Math.PI + s.r * s.r);
      outside.push(nodes.filter((k) => Math.hypot(f.x0 + (k % f.nx) * f.cell - s.x, f.y0 + Math.floor(k / f.nx) * f.cell - s.y) > disc).length / nodes.length);
    });
    const median = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
    expect(ratio.length).toBeGreaterThan(50);
    expect(median(ratio)).toBeGreaterThan(0.6);
    expect(median(ratio)).toBeLessThan(1.05);
    expect(median(outside)).toBeGreaterThan(0.1);
  });
});

describe('how a tradition sets its houses out', () => {
  const farmland = (traditions: Tradition[], density = 260) => makeSettlement(spec(world(() => ({ code: 23, density, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }], { traditions })), flat, dry, EXTENT);
  const house = { plan: 'rectangular', width: 5, length: 8, walls: 'wattle-and-daub', roof: 'gable', roof_material: 'thatch' } as const;
  const base = { regions: [1], span: [-500, 500] as [number, number], lifeways: ['farmers' as const] };
  /** The houses of each settlement that are dwellings: what a settlement has of its own is told by its form. */
  const dwellings = (plan: ReturnType<typeof farmland>, si: number) => plan.houses.filter((h) => h.settlement === si && !plan.forms[h.form].outbuilding);

  it('draws each house in one of its shapes, and no bigger than its claims say', () => {
    const plan = farmland(compileTraditions([{ id: 'test/house', label: 'A house', ...base, dwelling: { ...house, length: { lo: 7, hi: 12 } } }]));
    expect(plan.houses.length).toBeGreaterThan(1000);
    expect(new Set(plan.houses.map((h) => h.variant))).toEqual(new Set(Array.from({ length: HOUSE_VARIANTS }, (_, k) => k)));
    expect(plan.houses.every((h) => h.size === 1)).toBe(true);
  });

  it('sets houses in a ring round open ground, their doors to the middle, where its tradition says so', () => {
    const plan = farmland(compileTraditions([{ id: 'test/ring', label: 'A ring of houses', ...base, dwelling: house, settlement: { layout: 'ring', plaza: true, houses: 16, spacing: 14 } }]));
    let seen = 0;
    plan.settlements.forEach((s, si) => {
      const mine = dwellings(plan, si);
      if (mine.length < 16) return;
      seen++;
      const far = mine.map((h) => Math.hypot(h.x - s.x, h.y - s.y));
      // All about as far from the middle, which is left open.
      expect(Math.min(...far)).toBeGreaterThan(12);
      expect(Math.max(...far) / Math.min(...far)).toBeLessThan(1.25);
      for (const h of mine) {
        // Its front points at the middle.
        const d = Math.hypot(s.x - h.x, s.y - h.y);
        expect((Math.sin(h.face) * (s.x - h.x) + Math.cos(h.face) * (s.y - h.y)) / d).toBeGreaterThan(0.95);
      }
    });
    expect(seen).toBeGreaterThan(20);
  });

  it('sets houses in rows, and turns every house the way its tradition says they all faced', () => {
    const rows = farmland(compileTraditions([{ id: 'test/rows', label: 'Rows of houses', ...base, dwelling: house, settlement: { layout: 'rows', houses: 24, spacing: 12 } }]));
    let seen = 0;
    rows.settlements.forEach((s, si) => {
      const mine = dwellings(rows, si);
      if (mine.length < 24) return;
      seen++;
      // Two ways only: a row faces the row across the way from it.
      const ways = new Set(mine.map((h) => Math.round((((h.face % TAU) + TAU) % TAU) * 20)));
      expect(ways.size).toBe(2);
      void s;
    });
    expect(seen).toBeGreaterThan(20);
    const south = farmland(compileTraditions([{ id: 'test/south', label: 'Houses that face south', ...base, dwelling: { ...house, faces: 'south' } }]));
    expect(south.houses.length).toBeGreaterThan(1000);
    for (const h of south.houses) expect(Math.abs(h.face - Math.PI)).toBeLessThan(0.16);
  });

  it("draws round a settlement what its tradition says enclosed it, and the generator's plain wall where it says only that one did", () => {
    const palisaded = farmland(compileTraditions([{ id: 'test/palisade', label: 'A palisaded village', ...base, dwelling: house, settlement: { enclosure: 'palisade', houses: 20 } }]));
    expect(palisaded.perimeters.length).toBeGreaterThan(5);
    expect(palisaded.perimeters[0]).toMatchObject({ kind: 'palisade', from: 'test/palisade' });
    let seen = 0;
    for (const pr of palisaded.perimeters) {
      const s = palisaded.settlements[pr.settlement];
      const mine = dwellings(palisaded, pr.settlement);
      if (mine.length < 20) continue;
      seen++;
      // The continuous convex perimeter surrounds every home with gate openings where the through-lane crosses it.
      expect(pr.ring.length).toBeGreaterThanOrEqual(6);
      expect(pr.gates.length).toBeGreaterThanOrEqual(2);
      const edges = pr.ring.map((a, i) => ({ a, b: pr.ring[(i + 1) % pr.ring.length] }));
      for (const h of mine) expect(edges.every(({ a, b }) => (b[0] - a[0]) * (h.y - a[1]) > (b[1] - a[1]) * (h.x - a[0]))).toBe(true);
      void s;
    }
    expect(seen).toBeGreaterThan(5);
    const walled = farmland(compileTraditions([{ id: 'test/walled', label: 'A walled village', ...base, dwelling: house, settlement: { pattern: 'walled', houses: 20 } }]));
    expect(walled.perimeters.length).toBeGreaterThan(5);
    expect(walled.perimeters[0]).toMatchObject({ kind: 'rammed-earth', from: 'generic', towers: true });
    // A tradition that says nothing of an enclosure has none.
    expect(farmland(compileTraditions([{ id: 'test/open', label: 'An open village', ...base, dwelling: house }])).perimeters).toEqual([]);
  });

  it('lays out connected farming lanes, seasonal regional agriculture, living activity, and slope-gated land use', () => {
    const traditions = compileTraditions([
      {
        id: 'test/han-courtyard',
        label: 'A Han courtyard village',
        ...base,
        dwelling: { plan: 'courtyard', court: true, width: 12, length: 14, walls: 'rammed-earth', roof: 'gable', roof_material: 'tile' },
        settlement: { pattern: 'walled', houses: 24 },
      },
    ]);
    const agriculture = [
      {
        id: 'test/han-dryland',
        label: 'North China Han dryland farming',
        regions: [1],
        span: [-202, 220] as [number, number],
        lifeways: ['farmers' as const],
        fields: { kind: 'blocks' as const, plot: 0.45, bounds: 'banks' as const },
        crops: [
          { kind: 'millet' as const, name: 'Foxtail millet', season: 'summer' as const, share: 'staple' as const },
          { kind: 'wheat' as const, name: 'Winter wheat', season: 'winter' as const, share: 'staple' as const },
          { kind: 'legume' as const, name: 'Soybeans', season: 'summer' as const, share: 'minor' as const },
        ],
        from: { crops: 'test/han-dryland' },
        depth: 0,
      },
    ];
    const w = world(() => ({ code: 23, density: 260, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }], { traditions, agriculture });
    w.grid.north = 37.5;
    w.grid.west = 113.1;
    const s = { ...spec(w, { lat: 36.5, lon: 114.1 }), climate: { month: 6 } } as unknown as SceneSpec;
    // Flat valley near origin rising into a steep 0.45 slope hill east of 2000 m.
    const hilly: Ground = { at: (x) => (x > 2000 ? 40 + (x - 2000) * 0.45 : 40) };
    const plan = makeSettlement(s, hilly, dry, EXTENT);
    expect(plan.lanes.length).toBeGreaterThan(20);
    expect(plan.perimeters.length).toBeGreaterThan(5);
    expect(plan.smokes.length).toBeGreaterThan(10);
    expect(plan.agriculture.from).toBe('tradition');
    expect(plan.agriculture.id).toBe('test/han-dryland');
    expect(plan.agriculture.bounds).toBe('banks');
    // In June at 36.5°N, winter wheat is ripe and foxtail millet is green!
    expect(plan.agriculture.palette.slots.some((sl) => sl.crop?.name === 'Winter wheat' && sl.state === 0)).toBe(true);
    expect(plan.agriculture.palette.slots.some((sl) => sl.crop?.name === 'Foxtail millet' && sl.state === 1)).toBe(true);
    // Living activity near the viewer: stalls, kilns, altars, stooks, ploughs, carts/barrows, and field workers.
    const kinds = new Set(plan.works.map((w) => plan.workForms[w.form].spec.kind));
    expect(kinds.has('stall')).toBe(true);
    expect(kinds.has('kiln')).toBe(true);
    expect(kinds.has('altar')).toBe(true);
    expect(kinds.has('stook')).toBe(true);
    expect(kinds.has('cart') || kinds.has('barrow')).toBe(true);
    expect(plan.works.some((w) => w.field)).toBe(true);
    // Slope gating: steep hillside (slope 0.45 > 0.36) suppresses cropland completely.
    const lu = new LandUseMap(plan, hilly, dry, 7);
    expect(lu.at(2600, 0).crop).toBe(0);
  });

  it("draws what a settlement had of its own among its houses, and a household's things with its house", () => {
    const traditions = compileTraditions([
      {
        id: 'test/village',
        label: 'A village with a hall',
        ...base,
        dwelling: house,
        settlement: { houses: 30, yard: 'fence' },
        outbuildings: [
          { use: 'hall', per: 'settlement', plan: 'rectangular', length: 16, width: 7 },
          { use: 'well', per: 'settlement' },
          { use: 'granary', per: 'house', count: 1 },
        ],
      },
    ]);
    const plan = farmland(traditions);
    const hall = plan.forms.findIndex((f) => f.outbuilding?.use === 'hall');
    expect(plan.forms[hall]).toMatchObject({ from: 'tradition', tradition: 'test/village', label: 'A meeting house', spec: { length: 16, width: 7, walls: 'wattle-and-daub' } });
    const well = plan.workForms.findIndex((f) => f.spec.kind === 'well');
    expect(plan.workForms[well]).toMatchObject({ label: 'A well', from: 'test/village' });
    let seen = 0;
    plan.settlements.forEach((s, si) => {
      const mine = dwellings(plan, si);
      if (mine.length < 30) return;
      seen++;
      // One hall and one well, near its middle; and no house counted that is none.
      const halls = plan.houses.filter((h) => h.settlement === si && h.form === hall);
      expect(halls.length).toBe(1);
      expect(Math.hypot(halls[0].x - s.x, halls[0].y - s.y)).toBeLessThan(s.r);
      expect(plan.works.filter((w) => w.settlement === si && w.form === well).length).toBe(1);
      expect(s.houses).toBe(mine.length);
    });
    expect(seen).toBeGreaterThan(20);
    // Each house has its yard: fenced, with its granary in it; and the panel can say whose claim that is.
    const home = plan.forms.find((f) => f.tradition === 'test/village' && !f.outbuilding)!;
    expect(home.home).toMatchObject({ yard: 'fence', out: [{ use: 'granary', count: 1 }] });
    expect(home.by!.map((x) => x.from)).toEqual(['test/village', 'test/village']);
    expect(home.by![0].text).toMatch(/^a granary/);
  });

  it("draws a town's house no wider than the ground its town gives it, so that none stands in its neighbour", () => {
    const traditions = compileTraditions([{ id: 'test/great-house', label: 'A great house', regions: [1], span: [-500, 500], lifeways: ['townspeople'], dwelling: { plan: 'courtyard', court: true, width: 30, length: 30, walls: 'mudbrick', roof: 'flat' }, town: { streets: 'grid' } }]);
    const p = world(() => ({ code: 23, density: 100, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }], { traditions, cities: [{ name: 'Tight Town', country: 'Nowhere', lat: 0, lon: 0, people: 6000, field: 'field:test', source: 'src:test', from: 'list' }] });
    const plan = makeSettlement(spec(p), flat, dry, EXTENT);
    const town = plan.settlements.findIndex((s) => s.city === 'Tight Town');
    const form = plan.forms[plan.settlements[town].form];
    // Thirty metres of house on a few hundred square metres of ground: drawn smaller, and said to be.
    expect(form.grow).toBeLessThan(1);
    const size = houseSize(form.spec, 0, form.grow);
    const mine = plan.houses.filter((h) => h.settlement === town);
    expect(mine.length).toBeGreaterThan(500);
    for (const h of mine.slice(0, 150)) {
      const near = Math.min(...mine.filter((o) => o !== h).map((o) => Math.hypot(o.x - h.x, o.y - h.y)));
      expect(near).toBeGreaterThanOrEqual(Math.min(size.w, size.l) - 0.05);
    }
  });

  it('lets no house of a town of winding lanes stand in its neighbour, and still houses the town', () => {
    const town = (streets: 'grid' | 'lanes') => {
      const traditions = compileTraditions([{ id: 'test/great-house', label: 'A great house', regions: [1], span: [-500, 500], lifeways: ['townspeople'], dwelling: { plan: 'courtyard', court: true, width: 30, length: 30, walls: 'mudbrick', roof: 'flat' }, town: { streets } }]);
      const p = world(() => ({ code: 23, density: 100, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }], { traditions, cities: [{ name: 'Tight Town', country: 'Nowhere', lat: 0, lon: 0, people: 6000, field: 'field:test', source: 'src:test', from: 'list' }] });
      const plan = makeSettlement(spec(p), flat, dry, EXTENT);
      const si = plan.settlements.findIndex((s) => s.city === 'Tight Town');
      const form = plan.forms[plan.settlements[si].form];
      return { size: houseSize(form.spec, 0, form.grow), houses: plan.houses.filter((h) => h.settlement === si) };
    };
    const { size, houses } = town('lanes');
    // Two houses stand apart where a line parts them: along the front or the side of either.
    const apart = (a: (typeof houses)[0], b: (typeof houses)[0]): boolean => {
      for (const f of [a.face, a.face + Math.PI / 2, b.face, b.face + Math.PI / 2]) {
        const nx = Math.sin(f);
        const ny = Math.cos(f);
        const reach = (h: (typeof houses)[0]) => (size.l / 2) * Math.abs(nx * Math.sin(h.face) + ny * Math.cos(h.face)) + (size.w / 2) * Math.abs(nx * Math.cos(h.face) - ny * Math.sin(h.face));
        if (Math.abs(nx * (b.x - a.x) + ny * (b.y - a.y)) >= reach(a) + reach(b)) return true;
      }
      return false;
    };
    let turned = 0;
    for (let i = 0; i < houses.length; i++) {
      for (let j = i + 1; j < houses.length; j++) {
        if (Math.hypot(houses[j].x - houses[i].x, houses[j].y - houses[i].y) > Math.hypot(size.w, size.l)) continue;
        expect(apart(houses[i], houses[j])).toBe(true);
      }
      if (Math.abs(Math.sin(houses[i].face - houses[0].face)) > 0.1 && Math.abs(Math.cos(houses[i].face - houses[0].face)) > 0.1) turned++;
    }
    // Its lanes wander, and its houses front them as they run; and it has the houses a town of straight streets has.
    expect(turned).toBeGreaterThan(houses.length * 0.2);
    expect(houses.length).toBe(town('grid').houses.length);
  });

  it("keeps a city's houses off the ground of a city that adjoins it", () => {
    const city = (name: string, lat: number) => ({ name, country: 'Nowhere', lat, lon: 0, people: 6000, field: 'field:test', source: 'src:test', from: 'list' as const });
    const p = world(() => ({ code: 23, density: 100, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }], { cities: [city('Old Town', 0), city('New Town', 0.0015)] });
    const plan = makeSettlement(spec(p), flat, dry, EXTENT);
    const old = plan.settlements.findIndex((s) => s.city === 'Old Town');
    const young = plan.settlements.findIndex((s) => s.city === 'New Town');
    const A = plan.settlements[old];
    const B = plan.settlements[young];
    // The two would take some of the same ground: the one that comes first keeps it.
    expect(Math.hypot(B.x - A.x, B.y - A.y)).toBeLessThan((A.r + B.r) * 0.8);
    const theirs = plan.houses.filter((h) => h.settlement === young);
    expect(theirs.length).toBeGreaterThan(200);
    for (const h of theirs) expect(Math.hypot(h.x - A.x, h.y - A.y)).toBeGreaterThanOrEqual(A.r);
    expect(plan.houses.filter((h) => h.settlement === old).length).toBeGreaterThan(theirs.length);
  });

  it('draws a house that stands for several households wider and longer, and not as a bigger copy of itself', () => {
    const traditions = compileTraditions([{ id: 'test/town-house', label: 'A town house', regions: [1], span: [-500, 500], lifeways: ['townspeople'], dwelling: { plan: 'rectangular', width: 5, length: 9, walls: 'mudbrick', roof: 'flat' }, town: { streets: 'grid' } }]);
    const p = world(() => ({ code: 23, density: 100, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }], { traditions, cities: [{ name: 'Great City', country: 'Nowhere', lat: 0, lon: 0, people: 600000, field: 'field:test', source: 'src:test', from: 'list' }] });
    const plan = makeSettlement(spec(p), flat, dry, EXTENT);
    const city = plan.settlements.findIndex((s) => s.city === 'Great City');
    const form = plan.forms[plan.settlements[city].form];
    expect(form.grow).toBeGreaterThan(1);
    expect(houseSize(form.spec, 0, form.grow).w).toBeCloseTo(houseSize(form.spec, 0).w * form.grow!, 6);
    expect(plan.houses.filter((h) => h.settlement === city).every((h) => h.size === 1)).toBe(true);
  });
});

describe('the land worked beyond the scene', () => {
  /** A world whose far cells are its own cells, told of as the scene's spec tells of them (ScenePeople, far). */
  const farWorld = (code: number, density: number, a: Assessment) => {
    const p = world(() => ({ code, density, region: 1 }), [{ id: 1, a }]);
    return { ...p, far: { ...p.grid, assessments: [{ id: 1, assessment: a }] } };
  };

  it('works as much of a cell as its settlements would, on the average', () => {
    // The last are shifting cultivators, of whose fields only some are cleared at a time (FAR_AVERAGE.swiddenCleared).
    for (const [code, density, a] of [[32, 40, assess(1, 1, 3, 2)], [23, 260, assess(1, 1, 3, 2)], [31, 120, assess(1, 1, 3, 2)], [32, 40, assess(1, 3, 1, 1)]] as [number, number, Assessment][]) {
      const p = farWorld(code, density, a);
      const far = farLand(spec(p))!;
      const plan = makeSettlement(spec(p), flat, dry, EXTENT);
      const use = new LandUseMap(plan, flat, dry, 7);
      // What the plan lays out over the middle of the scene, where every settlement whose fields reach it is drawn.
      let made = 0;
      let n = 0;
      for (let x = -9000; x <= 9000; x += 150) for (let y = -9000; y <= 9000; y += 150) {
        made += use.at(x, y).crop;
        n++;
      }
      const said = far.crop[12 * far.nx + 12];
      expect(said, `class ${code}`).toBeGreaterThan(0);
      // Where no tradition changes the settlements, the estimate is the plan's to a fifth; SceneStream.farFields scales
      // it to the plan's of the scene where one does.
      expect(made / n / said, `class ${code} at ${density} to the km²`).toBeGreaterThan(0.8);
      expect(made / n / said, `class ${code} at ${density} to the km²`).toBeLessThan(1.25);
    }
  });

  it("scales the far land to the plan's by its own settlements, and not by a city's fields", () => {
    const a = assess(1, 1, 3, 2);
    const without = farWorld(32, 40, a);
    // A city in the middle of one of the cells the scene holds whole, whose fields take most of that cell and no other.
    const cities = [{ name: 'Testopolis', country: 'Nowhere', lat: 0.042, lon: 0.042, people: 800000, field: 'field:people/cities-ancient', source: 'src:test', from: 'list' as const }];
    const withCity = { ...without, cities };
    const scaleOf = (p: ScenePeople, origin: { lat: number; lon: number }) => {
      const plan = makeSettlement(spec(p, origin), flat, dry, EXTENT);
      return { scale: farScale(farLand(spec(p, origin))!, plan, new LandUseMap(plan, flat, dry, 7), origin, EXTENT), plan };
    };
    // Since version 9 a cell's settlements are not spread evenly over it (sites.ts), so leaving one cell out of the few a
    // scene holds whole moves the scale a little of itself: the scales are averaged over scenes in a few places about the
    // city, each holding it.
    const origins = [{ lat: 0, lon: 0 }, { lat: 0.02, lon: -0.01 }, { lat: -0.015, lon: 0.02 }, { lat: 0.03, lon: 0.035 }];
    const plains = origins.map((o) => scaleOf(without, o));
    const cityScenes = origins.map((o) => scaleOf(withCity, o));
    for (const c of cityScenes) expect(c.plan.settlements.some((s) => s.city === 'Testopolis')).toBe(true);
    const mean = (l: { scale: number }[]) => l.reduce((a, x) => a + x.scale, 0) / l.length;
    // Where no tradition changes the settlements, the plan and the estimate agree, and the scale is about 1.
    for (const p of plains) {
      expect(p.scale).toBeGreaterThan(0.8);
      expect(p.scale).toBeLessThan(1.25);
    }
    // The cell the city's fields reach is left out, so the city moves the scale little. Counted, it would raise it by
    // about a fifth.
    expect(Math.abs(mean(cityScenes) - mean(plains)) / mean(plains)).toBeLessThan(0.05);
  });

  it('works fields where people farmed, pasture where they herded, and nothing for foragers, and builds where towns stood', () => {
    const farmers = farLand(spec(farWorld(23, 260, assess(1, 1, 3, 2))))!;
    expect(Math.max(...farmers.crop)).toBeGreaterThan(0.2);
    expect(Math.max(...farmers.pasture)).toBe(0);
    const herders = farLand(spec(farWorld(42, 3, assess(1, 0, 0, 3))))!;
    expect(Math.max(...herders.pasture)).toBeGreaterThan(0);
    expect(Math.max(...herders.crop)).toBe(0);
    const foragers = farLand(spec(farWorld(53, 0.5, assess(3, 0, 0, 0))))!;
    expect(Math.max(...foragers.crop, ...foragers.pasture)).toBe(0);
    // A city's cell is its houses' built ground, unworked, as the plan lays it out; a cell of towns among fields has both.
    const city = farLand(spec(farWorld(11, 5000, assess(1, 1, 3, 2, 1))))!;
    expect(Math.max(...city.built)).toBeGreaterThan(0.05);
    expect(Math.max(...city.crop, ...city.pasture)).toBe(0);
    const towns = farLand(spec(farWorld(12, 600, assess(1, 1, 3, 2))))!;
    expect(Math.max(...towns.built)).toBeGreaterThan(0);
    expect(Math.max(...towns.crop)).toBeGreaterThan(0.2);
    expect(Math.max(...farmers.built)).toBe(0);
    // Without far cells in its spec, a scene is told of nothing beyond its own.
    expect(farLand(spec(world(() => ({ code: 23, density: 260, region: 1 }), [{ id: 1, a: assess(1, 1, 3, 2) }])))).toBeUndefined();
  });

  it('draws the far land with no step at a cell\'s edge, and none beyond the cells it is told of', () => {
    // Every other column of cells farmed, so that a step at their edges would show.
    const a = assess(1, 1, 3, 2);
    const p = world((_r, c) => ({ code: c % 2 ? 23 : 62, density: c % 2 ? 260 : 0, region: 1 }), [{ id: 1, a }]);
    const far = farLand(spec({ ...p, far: { ...p.grid, assessments: [{ id: 1, assessment: a }] } }))!;
    const size = 256;
    const half = 150000;
    const mask = farLandMask(far, { lat: 0, lon: 0 }, size, half);
    const crop = (i: number, j: number) => mask[(j * size + i) * 4];
    let most = 0;
    for (let i = 1; i < size; i++) most = Math.max(most, Math.abs(crop(i, size / 2) - crop(i - 1, size / 2)));
    // A texel is about 1.2 km, a cell about 9 km: read between the cells' middles, no neighbours differ by a quarter.
    expect(Math.max(...Array.from({ length: size }, (_, i) => crop(i, size / 2)))).toBeGreaterThan(100);
    expect(most).toBeLessThan(64);
    // The cells reach a degree each way, about 111 km: past them, nothing is worked.
    expect(crop(2, size / 2)).toBe(0);
    expect(crop(size / 2, size - 2)).toBe(0);
  });
});

const TAU = 2 * Math.PI;
