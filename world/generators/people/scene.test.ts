// The people of a scene as the scene's stream draws them (world/generators/life/stream.ts): houses, the pieces of a
// town's works, the animals people kept and the paths between settlements, each a kind of its own that a click can tell
// apart. On a made-up place: a walled town of a list at the middle of a farming country whose husbandry names an animal.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { compileHusbandry, compileTraditions } from '../../../core/dwelling.ts';
import { canonicalForm, type Form } from '../../../core/form.ts';
import { lifewayOf, type AnthromeClass, type Assessment } from '../../../core/landscape.ts';
import type { LivingTaxon, ScenePeople, SceneSpec } from '../../../core/scene.ts';
import type { FeatureTime } from '../../../core/tileset.ts';
import { STRIDE } from '../city/kit.ts';
import { houseSize } from './dwellings.ts';
import { GENERATOR, VERSION, type LivingParams } from '../life/scene/v10.ts';
import { CROP, HOUSE, INSTANCE_STRIDE, KEPT, protoParts, SceneStream, WORK, type LifeView } from '../life/stream.ts';

const ROOT = join(import.meta.dirname, '../..');
const yaml = <T>(path: string): T => parse(readFileSync(join(ROOT, path), 'utf8')) as T;
const { site: _site, ...PARAMS } = yaml<{ params: LivingParams & { site: unknown } }>('generators/life/scene.yaml').params;
const plans: Record<string, Form> = Object.fromEntries(readdirSync(join(ROOT, 'plans')).filter((f) => f.endsWith('.yaml')).map((f) => [f.replace('.yaml', ''), canonicalForm(yaml<Form>(`plans/${f}`))]));
const classes = yaml<{ params: { classes: AnthromeClass[] } }>('fields/people/anthromes.yaml').params.classes;
const settlement = yaml<{ id: string; version: number; params: Record<string, unknown> }>('generators/people/settlement.yaml');
const number = (code: number) => classes.findIndex((c) => c.code === code) + 1;

const always: FeatureTime = { start: { best: null, lo: -Infinity, hi: Infinity, derived: true }, end: { best: null, lo: -Infinity, hi: Infinity, derived: true }, instant: false };
const oak: LivingTaxon = { id: 't/oak', label: 'oak', form: 'broadleaf', form_from: 't/oak', form_label: 'oak', own: true, tier: 'here', weight: 0.6, rows: 10, biped: false, height: 18, time: always };
const cattle: LivingTaxon = { id: 't/cattle', label: 'Cattle', form: 'ungulate', form_from: 't/cattle', form_label: 'Cattle', own: true, tier: 'kept', weight: 1, rows: 0, biped: false, length: 2.4, mass: 500, time: always };

/** Rainfed villages all round, region 1, and a town of a list at the middle whose tradition walls it. */
function people(): ScenePeople {
  const nx = 24;
  const a: Assessment = { use: [1, 1, 3, 2].map((l) => [l, l, l, l] as [number, number, number, number]), urban: 1, urbanMedian: 1, quality: 2, expertise: 2 };
  const k = number(23);
  return {
    t: 100,
    step: 100,
    grid: { north: 1, west: -1, nx, ny: nx, res: 1 / 12, anthrome: new Array(nx * nx).fill(k), density: new Array(nx * nx).fill(180), region: new Array(nx * nx).fill(1) },
    classes,
    regions: [{ id: 1, label: 'Region 1', slice: '2,000 BP', assessment: a }],
    lifeway: lifewayOf(classes, k, 180, a),
    cities: [{ name: 'Testopolis', country: 'Nowhere', lat: 0, lon: 0, people: 9000, field: 'field:test', source: 'src:test', from: 'list' }],
    traditions: compileTraditions([{ id: 'test/town-house', label: 'A town house', regions: [1], span: [-500, 500], lifeways: ['townspeople'], dwelling: { plan: 'courtyard', walls: 'mudbrick', roof: 'flat' }, town: { streets: 'grid', wall: 'stone' } }]),
    husbandry: compileHusbandry([{ id: 'test/farm-animals', label: 'Farm animals', regions: [1], span: [-500, 500], lifeways: ['farmers'], animals: ['t/cattle'] }]),
    kept: [cattle],
    keptForms: { ungulate: plans.ungulate },
    fields: { anthromes: 'field:people/anthromes', assessment: 'field:people/land-use-assessment', population: 'field:earth/population', lifeways: 'field:people/lifeways' },
    generator: { generator: settlement.id, version: settlement.version, params: settlement.params },
  };
}

const spec: SceneSpec = {
  format: 'lightworld-scene@2',
  site: { id: 'test', label: 'a test', origin: { lat: 0, lon: 0 }, span: [-1e6, 1e6], slice: 0 },
  relief: { lat0: 6, lon0: -6, step: 1, nx: 13, ny: 13, z: new Array(169).fill(300) },
  biome: { climate: 'temperate', label: 'temperate', field: 'field:test', ageMa: 0, cover: { plants: 1, forests: 1, grasses: 1 }, node: { hot: 22, cold: 4, aridity: 3, margin: 10 } },
  people: people(),
  taxa: [oak],
  omitted: [],
  forms: { broadleaf: plans.broadleaf },
  fossils: { source: 'src:test', title: 'test', rows: 1, collections: 1, drawn: 1 },
  generator: { generator: GENERATOR, version: VERSION, seed: 'life/people', basis: 'procedural', params: PARAMS as unknown as Record<string, unknown> },
};

describe('the people of a scene, drawn', () => {
  const stream = new SceneStream(spec);
  const plan = stream.people!;
  const town = plan.settlements.find((s) => s.city === 'Testopolis')!;

  it('has its houses, a wall round its town, the animals its farmers kept and paths between its villages', () => {
    expect(plan.houses.length).toBeGreaterThan(1000);
    expect(town.town?.from.wall).toBe('test/town-house');
    expect(plan.workForms.map((f) => f.spec.kind)).toEqual(expect.arrayContaining(['wall', 'gate', 'tower', 'person']));
    expect(plan.animals.length).toBeGreaterThan(100);
    expect(plan.animals.every((a) => a.kind === 0)).toBe(true);
    // The townspeople keep none: the husbandry is the farmers'.
    expect(plan.animals.some((a) => a.settlement === plan.settlements.indexOf(town))).toBe(false);
    expect(plan.paths.length).toBeGreaterThan(20);
  });

  it("hands a view each kind as its own entity: taxa, then houses, then works, then kept animals, then the fields' crop", () => {
    const T = spec.taxa.length;
    const H = plan.forms.length;
    const W = plan.workForms.length;
    const sent = new Set<number>();
    // What a view from a point draws, looking north and a little down, by kind; each instance's entity is its kind's.
    const look = (x: number, y: number, up: number) => {
      const view: LifeView = { eye: [x, y, stream.ground.at(x, y) + up], forward: [0, 0.94, -0.34], right: [1, 0, 0], up: [0, 0.34, 0.94], fov: 1, aspect: 1.7, height: 760, clearance: up };
      // Until nothing is left to make for the view.
      let sel = stream.select(view, sent);
      for (let i = 0; i < 40 && sel.pending; i++) sel = stream.select(view, sent);
      const seen = { taxa: 0, houses: 0, works: 0, kept: 0, crops: 0 };
      for (const b of sel.batches) {
        const { taxon } = protoParts(b.proto);
        const entities = new Uint16Array(b.data);
        for (let i = 0; i < b.count; i++) {
          const e = entities[(i * INSTANCE_STRIDE) / 2 + 12];
          if (taxon >= CROP) {
            // One entity for the crop of every field, after the kept animals and the paths.
            expect(e).toBe(T + 1 + H + W + (spec.people!.kept?.length ?? 0) + 1);
            expect(e).toBe(stream.cropEntity());
            seen.crops++;
          } else if (taxon >= KEPT) {
            expect(e).toBe(T + 1 + H + W + (taxon - KEPT));
            seen.kept++;
          } else if (taxon >= WORK) {
            expect(e).toBe(T + 1 + H + (taxon - WORK));
            seen.works++;
          } else if (taxon >= HOUSE) {
            expect(e).toBe(T + 1 + (taxon - HOUSE));
            seen.houses++;
          } else {
            expect(e).toBe(taxon + 1);
            seen.taxa++;
          }
        }
      }
      return seen;
    };
    // From outside the town, a little up, looking across it: its houses and its wall.
    const across = look(town.x, town.y - town.r - 250, 120);
    expect(across.houses).toBeGreaterThan(100);
    expect(across.works).toBeGreaterThan(20);
    // From just south of a herd, low down: the cattle.
    const cow = plan.animals[0];
    expect(look(cow.x, cow.y - 60, 25).kept).toBeGreaterThan(0);
    // From the edge of a village's houses, low down, looking over its fields: their crop, standing as plants.
    const farm = plan.settlements.find((s) => !s.city && s.fields === 'rainfed' && s.houses > 3)!;
    expect(look(farm.x, farm.y + farm.r * 1.2, 6).crops).toBeGreaterThan(200);
    // A kept animal's mesh is an animal's: it idles, as the wild ones do; a wall's, a house's and a crop's do not.
    const kinds = new Set<string>();
    for (const proto of sent) {
      const m = stream.mesh(proto);
      const { taxon } = protoParts(proto);
      expect(m.indices.length, String(proto)).toBeGreaterThan(0);
      if (taxon >= CROP) {
        expect(m.idle).toBeUndefined();
        kinds.add('crop');
      } else if (taxon >= KEPT) {
        expect(m.idle).toHaveLength(16);
        kinds.add('kept');
      } else if (taxon >= HOUSE) {
        expect(m.idle).toBeUndefined();
        kinds.add(taxon >= WORK ? 'work' : 'house');
      }
    }
    expect(kinds).toEqual(new Set(['house', 'work', 'kept', 'crop']));
  });

  it("keeps a town's low houses in sight from far off, where each is wider than a pixel though not as tall as one", () => {
    // From two and a half kilometres, looking down on the town at a fifth of a right angle, as a visitor first sees it.
    const low = compileTraditions([{ id: 'test/low-house', label: 'A low house', regions: [1], span: [-500, 500], lifeways: ['townspeople'], dwelling: { plan: 'courtyard', court: true, storeys: 1, walls: 'mudbrick', roof: 'flat' }, town: { streets: 'grid' } }]);
    const stream = new SceneStream({ ...spec, people: { ...people(), traditions: low } });
    const plan = stream.people!;
    const town = plan.settlements.find((s) => s.city === 'Testopolis')!;
    const up = 855;
    const view: LifeView = { eye: [town.x, town.y - 2350, stream.ground.at(town.x, town.y) + up], forward: [0, 0.94, -0.34], right: [1, 0, 0], up: [0, 0.34, 0.94], fov: 1, aspect: 1.7, height: 760, clearance: up };
    const sent = new Set<number>();
    let sel = stream.select(view, sent);
    for (let i = 0; i < 40 && sel.pending; i++) sel = stream.select(view, sent);
    const si = plan.settlements.indexOf(town);
    const form = plan.forms[town.form];
    // Its houses are of one storey round a court: a pixel there is three and a half metres, more than they are tall.
    expect(houseSize(form.spec, 0, form.grow ?? 1).top).toBeLessThan(3.5);
    let seen = 0;
    for (const b of sel.batches) {
      const { taxon } = protoParts(b.proto);
      if (taxon >= HOUSE && taxon < WORK && taxon - HOUSE === town.form) seen += b.count;
    }
    expect(seen).toBeGreaterThan(plan.houses.filter((h) => h.settlement === si).length * 0.5);
  });

  it('lays the paths on the ground as one mesh of their own entity, a hand above it and never under water', () => {
    const mesh = stream.paths()!;
    expect(mesh.indices.length).toBeGreaterThan(300);
    const f = new Float32Array(mesh.vertices);
    const s = new Uint16Array(mesh.vertices);
    const n = mesh.vertices.byteLength / STRIDE;
    for (let i = 0; i < n; i += 7) {
      const [x, y, z] = [f[i * 7], f[i * 7 + 1], f[i * 7 + 2]];
      expect(z - stream.ground.at(x, y)).toBeGreaterThan(0.05);
      expect(z - stream.ground.at(x, y)).toBeLessThan(0.2);
      expect(z).toBeGreaterThan(stream.look.water);
      expect(s[i * 14 + 13]).toBe(stream.pathEntity());
    }
    expect(stream.pathEntity()).toBe(spec.taxa.length + 1 + plan.forms.length + plan.workForms.length + 1);
  });
});
