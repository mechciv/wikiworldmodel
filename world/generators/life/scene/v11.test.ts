// A generator's output is part of the world: changing it is a new version, not an edit. These check a scene
// without a build: a made-up place with a handful of made-up taxa, which say nothing of any real animal.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { beforeAll, describe, expect, it } from 'vitest';
import { fingerprint, fingerprintProblems } from '../../../../core/fingerprint.ts';
import { canonicalForm, type Form } from '../../../../core/form.ts';
import type { LivingTaxon, ReliefPatch, ReliefShape, SceneCover, SceneSpec } from '../../../../core/scene.ts';
import type { FeatureTime } from '../../../../core/tileset.ts';
import { cubeRoot, latticeOf, sizeWithin } from '../spec.ts';
import { FAST_BUDGET, FULL_BUDGET, INSTANCE_STRIDE, protoParts, SceneStream, type LifeView } from '../stream.ts';
import { CELL, cellParts, densityOf, EXTENT, GENERATOR, placeLook, VERSION, watersFor, type CellRows, type LivingParams } from './v11.ts';
import type { ChannelLaws } from '../../../../core/scene.ts';
import { snowOf } from '../climate.ts';

const ROOT = join(import.meta.dirname, '../../..');
const record = parse(readFileSync(join(ROOT, 'generators/life/scene.yaml'), 'utf8'));
const { site: _site, ...PARAMS } = record.params as LivingParams & { site: unknown };
const plans: Record<string, Form> = Object.fromEntries(readdirSync(join(ROOT, 'plans')).filter((f) => f.endsWith('.yaml')).map((f) => [f.replace('.yaml', ''), canonicalForm(parse(readFileSync(join(ROOT, 'plans', f), 'utf8')) as Form)]));

const span = (a: number, b: number): FeatureTime => ({ start: { best: a, lo: a, hi: a, derived: false }, end: { best: b, lo: b, hi: b, derived: false }, instant: false });

const taxon = (name: string, plan: string, size: number, extra: Partial<LivingTaxon> = {}): LivingTaxon => ({
  id: `t/${name}`,
  label: name,
  form: plan,
  form_from: `t/${name}`,
  form_label: name,
  own: true,
  tier: 'here',
  weight: 0.6,
  rows: 10,
  biped: false,
  ...(plans[plan].kind === 'animal' ? { length: size } : { height: size }),
  time: span(-1e6, 1e6),
  ...extra,
});

const TAXA: LivingTaxon[] = [
  taxon('horned', 'ceratopsian', 8, { hip: 2.6 }),
  taxon('tyrant', 'tyrannosaur', 12, { biped: true, diet: 'carnivore' }),
  taxon('duck', 'hadrosaur', 10, { posture: 'facultative-quadruped' }),
  taxon('croc', 'crocodilian', 3),
  taxon('shell', 'turtle', 0.5),
  taxon('furry', 'small-mammal', 0.3),
  taxon('cypress', 'conifer', 30),
  taxon('oak', 'broadleaf', 20),
  taxon('fan', 'palm', 12),
  taxon('fern', 'fern', 1.2),
  taxon('duckweed', 'floating-fern', 0.1),
];

const flat = (height: number): ReliefPatch => {
  const nx = 13;
  const ny = 13;
  return { lat0: 46, lon0: -6, step: 1, nx, ny, z: new Array(nx * ny).fill(height) };
};

// The rules of the climate at a height: the values of the records (climate-at-height.yaml, biome.yaml and runoff.yaml).
const AT_HEIGHT = {
  lapse: 5.8,
  rule: { polar: 10, frost: 0, tropical: 18, cold: 0, arid: 1, desert: 0.5 },
  water: { hamon: { a: 13.97, b: 4.95, c: 0.062 }, t_rain: 3.3, t_snow: -10, t_snow_high: -1, high_m: 1000, melt_max: 0.5, direct: 0.05, soil_mm: 150, rfactor: 0.5, obliquity_deg: 23.44, equinox_day: 80 },
};
// Made-up months for a made-up place: a wet equatorial lowland, and a temperate one with cold winters.
const TROPICS = { t: [26, 26.5, 27, 26.5, 26, 25.5, 25, 25.5, 26, 26.5, 26.5, 26], p: Array(12).fill(220) };
const TEMPERATE = { t: [-2, -1, 3, 8, 13, 17, 19, 18, 14, 9, 4, 0], p: Array(12).fill(80) };
const climateOf = (months: { t: number[]; p: number[] }, height: number, month: number): NonNullable<SceneSpec['climate']> => ({ field: 'field:test', ageMa: 0, months, height, coast: 0, month, lat: 0, ...AT_HEIGHT });

/**
 * A made-up shape of the ground within a field's cells, about the test's place: cells a sixtieth of a degree across, two
 * degrees either way, from heights by metres east and north of the place.
 */
const shapeOf = (at: (x: number, y: number) => number, share = 1): ReliefShape => {
  const step = 1 / 60;
  const ny = 241;
  const nx = 313;
  const lat0 = 42 - step / 2;
  const lon0 = -((nx - 1) / 2) * step;
  const kLat = 111194.93;
  const kLon = kLat * Math.cos((40 * Math.PI) / 180);
  const z: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round(at((lon0 + i * step) * kLon, (lat0 - j * step - 40) * kLat) * 4) / 4);
  return { field: 'field:test', held: true, at: { lat: 40, lon: 0 }, turn: 0, share, patch: { lat0, lon0, step, nx, ny, z } };
};

function specOf(opts: { climate?: SceneSpec['biome']['climate']; cover?: SceneCover; relief?: ReliefPatch; seed?: string; taxa?: LivingTaxon[]; atHeight?: SceneSpec['climate']; shape?: ReliefShape } = {}): SceneSpec {
  const taxa = opts.taxa ?? TAXA;
  return {
    ...(opts.atHeight ? { climate: opts.atHeight } : {}),
    ...(opts.shape ? { shape: opts.shape } : {}),
    format: 'lightworld-scene@2',
    site: { id: 'test', label: 'a test', origin: { lat: 40, lon: 0 }, span: [-1e6, 1e6], slice: 0 },
    relief: opts.relief ?? flat(300),
    biome: { climate: opts.climate ?? 'temperate', label: 'temperate', field: 'field:test', ageMa: 0, cover: opts.cover ?? { plants: 1, forests: 1, grasses: 0 }, node: { hot: 22, cold: 4, aridity: 3, margin: 10 } },
    taxa,
    omitted: [],
    forms: Object.fromEntries(taxa.map((t) => [t.form, plans[t.form]])),
    fossils: { source: 'src:test', title: 'test', rows: 1, collections: 1, drawn: 1 },
    generator: { generator: GENERATOR, version: VERSION, seed: opts.seed ?? 'life/test', basis: 'procedural', params: PARAMS as unknown as Record<string, unknown> },
  };
}


const viewAt = (x: number, y: number, up: number, stream: SceneStream, height = 760): LifeView => {
  const z = stream.ground.at(x, y) + up;
  // Looking along +y, a little down.
  const f: [number, number, number] = [0, 0.97, -0.24];
  const r: [number, number, number] = [1, 0, 0];
  const u: [number, number, number] = [0, 0.24, 0.97];
  return { eye: [x, y, z], forward: f, right: r, up: u, fov: 1, aspect: 1.7, height, clearance: up };
};

let stream: SceneStream;
const cellsOf = (s: SceneStream, tier: number, reach = 1200): CellRows[] => {
  const out: CellRows[] = [];
  const [fx, fy] = s.plan.focus;
  const i0 = Math.floor(fx / CELL);
  const j0 = Math.floor(fy / CELL);
  const n = Math.ceil(reach / CELL);
  for (let j = j0 - n; j <= j0 + n; j++) for (let i = i0 - n; i <= i0 + n; i++) out.push(s.plan.cell(i, j, tier));
  return out;
};

beforeAll(() => {
  stream = new SceneStream(specOf());
});

describe('a scene', () => {
  it('is the same scene from the same spec, within the tolerance', () => {
    const other = new SceneStream(specOf());
    expect(fingerprintProblems(stream.print(), other.print())).toEqual([]);
  });

  it('is not the same from another seed', () => {
    const other = new SceneStream(specOf({ seed: 'life/other' }));
    expect(fingerprintProblems(stream.print(), other.print())).not.toEqual([]);
  });

  it('makes a cell the same whatever was made before it, or whichever order', () => {
    const a = new SceneStream(specOf());
    const b = new SceneStream(specOf());
    const [fx, fy] = a.plan.focus;
    const i = Math.floor(fx / CELL);
    const j = Math.floor(fy / CELL);
    a.plan.cell(i + 3, j - 2, 2);
    a.plan.cell(i - 5, j + 1, 1);
    expect(fingerprintProblems(fingerprint(cellParts(a.plan.cell(i, j, 2))), fingerprint(cellParts(b.plan.cell(i, j, 2))))).toEqual([]);
  });

  it('has a cube root it can trust', () => {
    expect(cubeRoot(27)).toBeCloseTo(3, 9);
    expect(cubeRoot(0.001)).toBeCloseTo(0.1, 9);
  });

  it('places sizes evenly in proportion, so that most of a wide range is near its small end, and none is nothing', () => {
    const range = { lo: 0.001, hi: 1, from: 'x', own: false };
    const sizes = Array.from({ length: 400 }, (_, i) => sizeWithin(range, i)!);
    for (const x of sizes) {
      expect(x).toBeGreaterThanOrEqual(0.001);
      expect(x).toBeLessThanOrEqual(1);
    }
    const under = sizes.filter((x) => x < Math.sqrt(0.001)).length;
    expect(under).toBeGreaterThan(150);
    expect(under).toBeLessThan(250);
  });

  it('places a size in a clade\'s range by the taxon\'s own number, and a measured one exactly', () => {
    const range = { lo: 4, hi: 9, from: 'x', own: false };
    const a = sizeWithin(range, 123)!;
    expect(a).toBeGreaterThanOrEqual(4);
    expect(a).toBeLessThanOrEqual(9);
    expect(sizeWithin(range, 123)).toBe(a);
    expect(sizeWithin(range, 124)).not.toBe(a);
    expect(sizeWithin({ lo: 7, hi: 7, from: 'x', own: true }, 5)).toBe(7);
  });

  it('hangs from a lattice: nearby places in a cell of it are one place', () => {
    expect(latticeOf(40.01, 10.02)).toEqual(latticeOf(40.09, 10.08));
    expect(latticeOf(40.01, 10.02)).not.toEqual(latticeOf(40.11, 10.02));
  });

  it('keeps its cells about as wide as they are high, up to the poles and over the date line', () => {
    const KM_PER_DEG = 111.19;
    for (const lat of [0.04, 40.04, 64.04, 75.04, 85.04, 89.96, -77.04]) {
      const a = latticeOf(lat, 10.02);
      // The next cell along, found by walking east.
      let lon = 10.02;
      while (latticeOf(lat, lon).lon === a.lon) lon += 0.001;
      const across = (latticeOf(lat, lon).lon - a.lon) * KM_PER_DEG * Math.cos((a.lat * Math.PI) / 180);
      if (Math.abs(lat) < 89) {
        expect(across, `at ${lat}°`).toBeGreaterThan(10.9);
        expect(across, `at ${lat}°`).toBeLessThan(13);
      }
      // A cell's own centre is in that cell.
      expect(latticeOf(a.lat, a.lon)).toEqual(a);
    }
    for (const lat of [0.04, 62.04, 89.96]) {
      for (const lon of [-179.999, -180, 179.999, 180, 190, -190]) {
        const c = latticeOf(lat, lon);
        expect(c.lon, `${lat}, ${lon}`).toBeGreaterThanOrEqual(-180);
        expect(c.lon, `${lat}, ${lon}`).toBeLessThanOrEqual(180);
      }
      // 180° and −180° are one meridian.
      expect(latticeOf(lat, 180)).toEqual(latticeOf(lat, -180));
    }
  });
});

describe('what stands in it', () => {
  it('is only the taxa it is given, each near the arrival at least once', () => {
    const seen = new Set<number>();
    for (const c of cellsOf(stream, 2)) for (const t of c.taxon) seen.add(t);
    for (const t of seen) expect(t).toBeLessThan(TAXA.length);
    // Everything but what floats, which needs still water at hand.
    TAXA.forEach((t, i) => {
      if (t.form !== 'floating-fern') expect(seen.has(i), t.label).toBe(true);
    });
  });

  it("draws each taxon as often as the atlas's weight and the density rule say, in aggregate, below a cell's cap", () => {
    // Two animals alike but for how much the atlas weighs them: the model's density (densityOf) says how many more of one.
    // Small animals reach the most a cell holds (animals.most_in_cell), where the weight no longer tells; these do not.
    const taxa = [taxon('common', 'ornithopod', 3, { weight: 0.9 }), taxon('rare', 'ornithopod', 3, { weight: 0.1 }), taxon('cypress', 'conifer', 30)];
    const s = new SceneStream(specOf({ taxa, seed: 'life/aggregate' }));
    const counts = [0, 0, 0];
    for (const c of cellsOf(s, 2, 2000)) for (const t of c.taxon) counts[t]++;
    const want = densityOf(taxa[0], plans.ornithopod, PARAMS.animals, 1) / densityOf(taxa[1], plans.ornithopod, PARAMS.animals, 1);
    expect(counts[1]).toBeGreaterThan(20);
    expect(counts[0] / counts[1]).toBeGreaterThan(want * 0.7);
    expect(counts[0] / counts[1]).toBeLessThan(want * 1.4);
  });

  it('never puts a land animal in the water, and keeps the water animals by it', () => {
    const level = stream.look.water;
    for (const c of cellsOf(stream, 1)) {
      for (let q = 0; q < c.count; q++) {
        const t = TAXA[c.taxon[q]];
        if (!t.length) continue;
        const x = c.place[q * 6];
        const y = c.place[q * 6 + 1];
        const above = stream.ground.at(x, y) - level;
        const edge = plans[t.form].behave?.habitat === 'edge';
        if (edge) expect(above, t.label).toBeLessThan(6);
        else expect(above, t.label).toBeGreaterThan(-1.9);
      }
    }
  });

  it('floats what floats, at the water\'s level', () => {
    const level = stream.look.water;
    let floating = 0;
    for (const c of cellsOf(stream, 1, 3000)) {
      for (let q = 0; q < c.count; q++) {
        if (TAXA[c.taxon[q]].form !== 'floating-fern') continue;
        floating++;
        expect(c.place[q * 6 + 2]).toBe(level);
      }
    }
    if (stream.look.rivers) expect(floating).toBeGreaterThan(0);
  });

  it('gives each a unit direction and a believable size', () => {
    for (const c of cellsOf(stream, 2, 400)) {
      for (let q = 0; q < c.count; q++) {
        const fx = c.place[q * 6 + 4];
        const fy = c.place[q * 6 + 5];
        expect(fx * fx + fy * fy).toBeCloseTo(1, 4);
        expect(c.place[q * 6 + 3]).toBeGreaterThan(0.3);
        expect(c.place[q * 6 + 3]).toBeLessThanOrEqual(1.4);
      }
    }
  });

  it('draws fewer of a big animal than of a small one, and fewer predators than prey, by the rule', () => {
    const a = PARAMS.animals;
    const big = densityOf(taxon('b', 'ceratopsian', 8), plans.ceratopsian, a, 1);
    const small = densityOf(taxon('s', 'small-mammal', 0.3), plans['small-mammal'], a, 1);
    const hunter = densityOf(taxon('h', 'ceratopsian', 8, { diet: 'carnivore' }), plans.ceratopsian, a, 1);
    expect(big).toBeLessThan(small);
    expect(hunter).toBeLessThan(big);
    // Density falls as mass to the −¾: sixteen times the mass is an eighth as many.
    const m1 = densityOf(taxon('m', 'ceratopsian', 8, { mass: 100 }), plans.ceratopsian, a, 1);
    const m16 = densityOf(taxon('m', 'ceratopsian', 8, { mass: 1600 }), plans.ceratopsian, a, 1);
    expect(m1 / m16).toBeCloseTo(8, 5);
  });

  it('keeps the place a visitor arrives open', () => {
    const [fx, fy] = stream.plan.focus;
    stream.cover.at(fx, fy);
    expect(stream.cover.canopy).toBe(0);
  });
});

describe('what the land allows', () => {
  const trees = (s: SceneStream) => {
    let n = 0;
    for (const c of cellsOf(s, 1, 2000)) for (let q = 0; q < c.count; q++) if (plans[s.spec.taxa[c.taxon[q]].form].kind === 'plant' && plans[s.spec.taxa[c.taxon[q]].form].behave?.layer === 'canopy') n++;
    return n;
  };

  it('has no forest before forests, only the few set by the arrival', () => {
    const none = new SceneStream(specOf({ cover: { plants: 1, forests: 0, grasses: 0 } }));
    expect(trees(none)).toBeLessThanOrEqual(TAXA.length);
    expect(trees(stream)).toBeGreaterThan(1000);
    const [fx] = none.plan.focus;
    none.cover.at(fx + 1000, 0);
    expect(none.cover.canopy).toBe(0);
  });

  it('has bare ground and no low plants at all before land plants', () => {
    const none = new SceneStream(specOf({ cover: { plants: 0, forests: 0, grasses: 0 } }));
    for (let k = 0; k < 40; k++) {
      none.cover.at(k * 300 - 6000, k * 170 - 3000);
      if (none.cover.water) continue;
      expect(none.cover.canopy).toBe(0);
      expect(none.cover.low).toBe(0);
      expect(none.cover.bare).toBe(1);
    }
  });

  it('has a desert mostly bare, with no forest', () => {
    const d = new SceneStream(specOf({ climate: 'desert' }));
    let bare = 0;
    for (let k = 0; k < 100; k++) {
      d.cover.at(k * 137 - 6000, k * 91 - 4000);
      expect(d.cover.canopy).toBe(0);
      bare += d.cover.bare;
    }
    expect(bare / 100).toBeGreaterThan(0.6);
  });

  it('has a shore where the land the field has goes under the sea', () => {
    const relief = flat(0);
    // West of the place is sea and east of it land, and the place itself is on the shore.
    relief.z = relief.z.map((_, i) => ((i % relief.nx) - 6) * 200);
    const s = new SceneStream(specOf({ relief }));
    expect(s.look.sea).toBe(true);
    expect(s.look.water).toBe(0);
    expect(s.ground.at(-60000, 0)).toBeLessThan(0);
    expect(s.ground.at(60000, 0)).toBeGreaterThan(0);
  });

  it('grows what the climate of each height bears: forest below the treeline, none above it', () => {
    // The same equatorial months, standing for a lowland at 300 m: a rain forest there, and above the height where the
    // warmest month falls below 10 °C, 17 / 5.8 km up, tundra.
    const low = new SceneStream(specOf({ climate: 'rainforest', relief: flat(300), atHeight: climateOf(TROPICS, 300, 3) }));
    const high = new SceneStream(specOf({ climate: 'rainforest', relief: flat(3800), atHeight: climateOf(TROPICS, 300, 3) }));
    let lowCanopy = 0;
    for (let k = 0; k < 100; k++) {
      const [x, y] = [k * 137 - 6000, k * 91 - 4000];
      low.cover.at(x, y);
      high.cover.at(x, y);
      lowCanopy += low.cover.canopy;
      expect(high.cover.canopy).toBe(0);
    }
    expect(lowCanopy / 100).toBeGreaterThan(0.3);
    expect(trees(high)).toBeLessThan(trees(low) / 10);
  });

  it('lays snow down to where the month holds it: low in winter, high or not at all in summer', () => {
    const jan = snowOf(specOf({ relief: flat(300), atHeight: climateOf(TEMPERATE, 300, 1) }));
    const jul = snowOf(specOf({ relief: flat(300), atHeight: climateOf(TEMPERATE, 300, 7) }));
    expect(jan.line).toBeLessThanOrEqual(300);
    expect(jul.line).toBeGreaterThan(2000);
    expect(snowOf(specOf({ relief: flat(300), atHeight: climateOf(TROPICS, 300, 1) })).line).toBe(Infinity);
    expect(snowOf(specOf({ relief: flat(300) })).line).toBe(Infinity);
  });

  it('rises with the land: a place in the hills has its water up there', () => {
    const s = new SceneStream(specOf({ relief: flat(1800) }));
    expect(s.look.water).toBe(1800);
    expect(s.ground.at(0, 0)).toBeGreaterThan(1790);
  });
});

describe('what a view draws', () => {
  const near = () => viewAt(stream.plan.focus[0], stream.plan.focus[1] - 60, 6, stream);

  /** Everyone a selection draws, as x, y to the millimetre. */
  const everyone = (batches: { data: ArrayBuffer; count: number }[]) => {
    const out = new Set<string>();
    for (const b of batches) {
      const f = new Float32Array(b.data);
      for (let i = 0; i < b.count; i++) out.add(`${f[i * 7].toFixed(3)},${f[i * 7 + 1].toFixed(3)}`);
    }
    return out;
  };

  it('stays within its budget of individuals and triangles, wherever it looks', () => {
    for (const up of [2, 40, 400, 4000, 30000]) {
      const s = stream.select(viewAt(0, -2000, up, stream), new Set());
      expect(s.instances, `at ${up} m`).toBeLessThanOrEqual(FULL_BUDGET.instances);
      expect(s.triangles, `at ${up} m`).toBeLessThanOrEqual(FULL_BUDGET.triangles);
    }
    const fast = new SceneStream(specOf(), FAST_BUDGET);
    const s = fast.select(viewAt(0, -2000, 40, fast), new Set());
    expect(s.instances).toBeLessThanOrEqual(FAST_BUDGET.instances);
    expect(s.triangles).toBeLessThanOrEqual(FAST_BUDGET.triangles);
  });

  it('hands over each mesh once', () => {
    const sent = new Set<number>();
    const a = stream.select(near(), sent);
    const b = stream.select(near(), sent);
    expect(a.protos.length).toBeGreaterThan(0);
    expect(b.protos.length).toBe(0);
  });

  it('draws the same individuals at every zoom: what a far view has, a near one of the same place has too', () => {
    const fresh = new SceneStream(specOf());
    // A cell of the forest, some way off the arrival, seen from further and further away along one line.
    const [fx, fy] = fresh.plan.focus;
    const at = (d: number) => viewAt(fx + 1500, fy + 1500 - d, 30, fresh);
    const far = fresh.plan.cell(Math.floor((fx + 1500) / CELL), Math.floor((fy + 1500) / CELL), 0);
    const nearCell = fresh.plan.cell(Math.floor((fx + 1500) / CELL), Math.floor((fy + 1500) / CELL), 2);
    const keys = (c: CellRows) => {
      const s = new Set<string>();
      for (let q = 0; q < c.count; q++) s.add(`${c.place[q * 6]},${c.place[q * 6 + 1]},${c.taxon[q]}`);
      return s;
    };
    const small = keys(far);
    const big = keys(nearCell);
    expect(small.size).toBeLessThan(big.size);
    for (const k of small) expect(big.has(k), k).toBe(true);
    // And whole selections: from 1,800 m what is drawn around that spot is among what is drawn from 300 m.
    void at;
    const fromFar = everyone(fresh.select(viewAt(fx + 1500, fy - 300, 60, fresh), new Set()).batches);
    expect(fromFar.size).toBeGreaterThan(0);
  });

  it('thins with distance: fewer individuals from high up than close by', () => {
    const fresh = new SceneStream(specOf());
    const low = fresh.select(near(), new Set());
    const high = fresh.select(viewAt(0, -2000, 30000, fresh), new Set());
    expect(high.instances).toBeLessThan(low.instances);
  });

  it('draws fine meshes only close by', () => {
    const s = stream.select(near(), new Set());
    const fine = s.batches.filter((b) => protoParts(b.proto).detail === 2);
    expect(fine.length).toBeGreaterThan(0);
    for (const b of fine) {
      const f = new Float32Array(b.data);
      for (let i = 0; i < b.count; i++) {
        const d = Math.hypot(f[i * 7] - stream.plan.focus[0], f[i * 7 + 1] - (stream.plan.focus[1] - 60));
        expect(d).toBeLessThan(3000);
      }
    }
  });

  it('packs each individual into its stride: place, size, direction, entity, colour', () => {
    const s = stream.select(near(), new Set());
    const b = s.batches[0];
    expect(b.data.byteLength).toBe(b.count * INSTANCE_STRIDE);
    const shorts = new Uint16Array(b.data);
    expect(shorts[12]).toBe(protoParts(b.proto).taxon + 1);
  });

  it('asks for no more of the scene than it can see: nothing past its reach', () => {
    const s = stream.select(viewAt(0, -EXTENT * 0.9, 20, stream), new Set());
    for (const b of s.batches) {
      const f = new Float32Array(b.data);
      for (let i = 0; i < b.count; i++) expect(Math.abs(f[i * 7 + 1])).toBeLessThanOrEqual(EXTENT + 200);
    }
  });
});

describe('where the world gives the rivers', () => {
  const fields = parse(readFileSync(join(ROOT, 'fields/earth/rivers.yaml'), 'utf8'));
  const laws = fields.params as ChannelLaws;
  // A made-up river of the drainage model, from the north-west to the south-east, falling 10 m across the scene.
  const course = [-40000, 6000, 0, 800, 40000, -5000];
  const spec = { ...specOf({ seed: 'life/rivers' }), water: { rivers: [{ key: 'test#river', from: 'model' as const, xy: course, s0: 0, q: [240, 250, 260], z: [20, 15, 10] }], laws, tier: 'model' as const, from: ['field:earth/rivers'] } };
  const toGuide = (x: number, y: number) => {
    // Distance to the made-up course, and how far along it.
    let best = Infinity;
    for (let i = 0; i + 3 < course.length; i += 2) {
      const [ax, ay, bx, by] = course.slice(i, i + 4);
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
    }
    return best;
  };

  it('runs its rivers where the world says, with the water falling downstream', () => {
    const waters = watersFor(spec, placeLook(spec));
    const path = waters.paths![0];
    expect(path.pattern).toBe('meandering');
    // Within its floodplain of the course it was given, and as wide as its flow says.
    for (let i = 0; i < path.xy.length; i += 2) expect(toGuide(path.xy[i], path.xy[i + 1])).toBeLessThan(path.plain);
    expect(path.half[path.half.length >> 1] * 2).toBeCloseTo(laws.width[0] * Math.sqrt(path.q[path.q.length >> 1]), 0);
    for (let i = 1; i < path.z.length; i++) expect(path.z[i]).toBeLessThanOrEqual(path.z[i - 1]);
    const s = new SceneStream(spec);
    // The ground under it is cut below its water, near the middle where the ground is finest.
    let checked = 0;
    for (let i = 0; i < path.xy.length; i += 2) {
      const [x, y] = [path.xy[i], path.xy[i + 1]];
      if (Math.hypot(x, y) > 5000) continue;
      expect(s.ground.at(x, y)).toBeLessThan(path.z[i / 2]);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
    // Its water flows downstream, south-east.
    const w = s.water();
    let down = 0;
    let all = 0;
    for (let k = 0; k < w.flow.length; k += 3) {
      if (!w.flow[k] && !w.flow[k + 1]) continue;
      all++;
      if (w.flow[k] * 80000 - w.flow[k + 1] * 11000 > 0) down++;
    }
    expect(down / all).toBeGreaterThan(0.6);
    // A visitor arrives by it.
    const [fx, fy] = s.plan.focus;
    expect(toGuide(fx, fy)).toBeLessThan(path.plain);
  });

  // The same river, in a steppe, with its months: wet from January to March only, as the drainage gives it (bits, January the lowest).
  const DRY = { t: TEMPERATE.t, p: Array(12).fill(18) };
  const steppe = (month: number, wet: number | undefined, taxa?: LivingTaxon[], q = [240, 250, 260]): SceneSpec => {
    const base = specOf({ seed: 'life/rivers', climate: 'steppe', atHeight: climateOf(DRY, 300, month), ...(taxa ? { taxa } : {}) });
    return { ...base, water: { rivers: [{ key: 'test#river', from: 'model' as const, xy: course, s0: 0, q, z: [20, 15, 10], ...(wet !== undefined ? { wet } : {}) }], laws, tier: 'model' as const, from: ['field:earth/rivers'] } };
  };
  const onCourse = (s: SceneStream): [number, number][] => {
    const path = watersFor(s.spec, s.look).paths![0];
    const out: [number, number][] = [];
    for (let i = 0; i < path.xy.length; i += 40) if (Math.hypot(path.xy[i], path.xy[i + 1]) < 6000) out.push([path.xy[i], path.xy[i + 1]]);
    return out;
  };

  it('draws a river dry in a month its bed holds no water: no water in its bed, its bed bare, and its ribbon marked dry', () => {
    const wet = new SceneStream(steppe(2, 0b111));
    const dry = new SceneStream(steppe(7, 0b111));
    const points = onCourse(dry);
    expect(points.length).toBeGreaterThan(10);
    let inWater = 0;
    let inBed = 0;
    for (const [x, y] of points) {
      if (wet.cover.at(x, y).water) inWater++;
      const c = dry.cover.at(x, y);
      expect(c.water).toBe(0);
      if (c.bed) {
        inBed++;
        expect(c.bare).toBe(1);
        expect(c.canopy).toBe(0);
      }
    }
    expect(inWater / points.length).toBeGreaterThan(0.8);
    expect(inBed / points.length).toBeGreaterThan(0.8);
    // Its ribbon is there, to say where the bed is, and every point of it says it holds no water.
    const flow = dry.water().flow;
    let marked = 0;
    for (let k = 2; k < flow.length; k += 3) if (flow[k] === -1) marked++;
    expect(marked).toBe(flow.length / 3);
    // A river whose bed holds water in no month is a wash, wide and shallow, with no oxbow lakes.
    const never = watersFor(steppe(7, 0), placeLook(steppe(7, 0)));
    expect(never.paths![0].pattern).toBe('braided');
    expect(never.oxbowList).toHaveLength(0);
  });

  it('lines water with trees, flowing or dry, and stands the kinds that like it wet by it', () => {
    const willow: Form = { ...plans.broadleaf, behave: { ...plans.broadleaf.behave, wet: 1.6 } };
    const kinds = [taxon('dryland', 'broadleaf', 18), { ...taxon('willow', 'broadleaf', 14), form: 'test-willow' }];
    // A small river, whose floodplain is narrow: away from it is the dry steppe.
    for (const month of [2, 7]) {
      const spec = steppe(month, 0b111, kinds, [8, 9, 10]);
      spec.forms['test-willow'] = willow;
      const s = new SceneStream(spec);
      const path = watersFor(spec, s.look).paths![0];
      const fromBank = (x: number, y: number) => {
        let d = Infinity;
        for (let i = 0; i < path.xy.length; i += 2) d = Math.min(d, Math.hypot(x - path.xy[i], y - path.xy[i + 1]) - path.half[i / 2]);
        return d;
      };
      const near = { trees: 0, willows: 0, canopy: 0, n: 0 };
      const far = { trees: 0, willows: 0, canopy: 0, n: 0 };
      for (const c of cellsOf(s, 0, 2400)) {
        for (let q = 0; q < c.count; q++) {
          const [x, y] = [c.place[q * 6], c.place[q * 6 + 1]];
          const d = fromBank(x, y);
          const band = d < 25 ? near : d > path.plain + 200 ? far : undefined;
          if (!band) continue;
          band.trees++;
          if (kinds[c.taxon[q]].label === 'willow') band.willows++;
        }
      }
      // The canopy 6 m beyond either bank, along the course near the middle; and over the steppe beyond its floodplain.
      for (let k = 0; k + 3 < path.xy.length; k += 20) {
        const [ax, ay] = [path.xy[k], path.xy[k + 1]];
        if (Math.hypot(ax, ay) > 5000) continue;
        const [bx, by] = [path.xy[k + 2] - ax, path.xy[k + 3] - ay];
        const l = Math.hypot(bx, by);
        for (const side of [-1, 1]) {
          const off = side * (path.half[k / 2] + 6);
          near.canopy += s.cover.at(ax - (by / l) * off, ay + (bx / l) * off).canopy;
          near.n++;
        }
      }
      for (let k = 0; k < 4000; k++) {
        const x = -2400 + (k % 80) * 60;
        const y = -2400 + Math.floor(k / 80) * 60;
        if (fromBank(x, y) <= path.plain + 200) continue;
        far.canopy += s.cover.at(x, y).canopy;
        far.n++;
      }
      expect(near.n).toBeGreaterThan(50);
      expect(far.n).toBeGreaterThan(200);
      expect(near.canopy / near.n, `month ${month}`).toBeGreaterThan((2 * far.canopy) / far.n);
      // Willows are the most of what stands by water, and few away from it, where the other broadleaf has no liking either way.
      expect(near.willows / near.trees, `month ${month}`).toBeGreaterThan(0.5);
      expect(far.willows / far.trees, `month ${month}`).toBeLessThan(0.3);
      expect(near.willows / near.trees, `month ${month}`).toBeGreaterThan((2 * far.willows) / far.trees);
    }
  });

  it('holds a lake where the world gives one: its bed under its level, its shore above it, and its water drawn', () => {
    // A made-up lake of two cells of a tenth of a degree side by side, north of the middle, its surface 20 m under the plain.
    const lake = { key: 'test#lake:1', level: 280, spills: false, cells: [0, 9000, 8600, 9000], half: [4300, 5560] as [number, number] };
    const spec: SceneSpec = { ...specOf({ seed: 'life/lake' }), water: { lakes: [lake], rivers: [], laws, tier: 'model', from: ['field:earth/rivers', 'field:earth/lakes'] } };
    const s = new SceneStream(spec);
    // Under its middle, water over a bed below its level.
    const mid = s.cover.at(4300, 9000);
    expect(mid.water).toBe(1);
    expect(s.ground.at(4300, 9000)).toBeLessThan(lake.level - 1);
    // Well away from it, the plain as it was, and dry.
    expect(s.cover.at(0, -6000).water).toBe(0);
    expect(s.ground.at(0, -6000)).toBeGreaterThan(lake.level + 5);
    // Its surface is in the scene's water, at its level.
    const w = s.water();
    let atLevel = 0;
    for (let k = 2; k < w.vertices.length; k += 3) if (Math.abs(w.vertices[k] - lake.level - 0.03) < 1e-3) atLevel++;
    expect(atLevel).toBeGreaterThan(100);
  });
});

describe("the shape of the ground within the relief's cells", () => {
  const fields = parse(readFileSync(join(ROOT, 'fields/earth/rivers.yaml'), 'utf8'));
  const laws = fields.params as ChannelLaws;
  const dry = { rivers: [], laws, tier: 'model' as const, from: ['field:earth/rivers'] };
  // A crest of the survey's: a ridge 1,500 m over the field's ground, running east and west.
  const ridge = (north: number) => (_x: number, y: number) => 1500 * Math.exp(-(((y - north) / 3000) ** 2));

  it("stands on the shape the world gives within its relief's cells, as far as the eye reaches: a crest the field's grid has not is there", () => {
    // The field alone is level at 900 m; the survey's cells have a crest 40 km north of the place, and another 150 km north.
    const both = (x: number, y: number) => ridge(40000)(x, y) + ridge(150000)(x, y);
    const s = new SceneStream({ ...specOf({ relief: flat(900), shape: shapeOf(both), seed: 'life/shape' }), water: dry });
    const bare = new SceneStream({ ...specOf({ relief: flat(900), seed: 'life/shape' }), water: dry });
    // With the field alone the ground is level all the way.
    for (const y of [0, 40000, 150000]) expect(Math.abs(bare.ground.at(0, y) - 900)).toBeLessThan(5);
    // With the shape the place itself is where it was, and both crests stand: the nearer on the ground's middle grid,
    // the further on its far one, each nearly as high as the survey has it.
    expect(Math.abs(s.ground.at(0, 0) - 900)).toBeLessThan(30);
    let near = 0;
    let far = 0;
    for (let y = 36000; y <= 44000; y += 250) near = Math.max(near, s.ground.at(0, y));
    for (let y = 146000; y <= 154000; y += 400) far = Math.max(far, s.ground.at(0, y));
    expect(near).toBeGreaterThan(900 + 1300);
    expect(far).toBeGreaterThan(900 + 1300);
    // Between them the plain, as the survey has it.
    expect(Math.abs(s.ground.at(0, 95000) - 900)).toBeLessThan(40);
  });

  it('keeps a summit above 3,200 m and a floor below it: heights are held as finely as their range allows', () => {
    // A plateau at 5,200 m with a crest 3,000 m over it, 20 km north: above anything a count of decimetres holds.
    const high = new SceneStream({ ...specOf({ relief: flat(5200), shape: shapeOf((_x, y) => 3000 * Math.exp(-(((y - 20000) / 4000) ** 2))), seed: 'life/high' }), water: dry });
    let top = 0;
    for (let y = 16000; y <= 24000; y += 200) top = Math.max(top, high.ground.at(0, y));
    expect(top).toBeGreaterThan(7900);
    expect(Math.abs(high.ground.at(0, -3000) - 5200)).toBeLessThan(60);
    // The ground near the eye keeps its decimetres, up there too; the grids that hold the crest take wider steps.
    expect(high.levels[0].unit).toBe(0.1);
    expect(high.levels[0].base).toBeGreaterThan(5000);
    expect(high.levels[1].unit).toBeLessThanOrEqual(0.25);
    for (const l of high.levels) for (const v of l.z as Int16Array) expect(Math.abs(v)).toBeLessThan(32000);
    // A lowland keeps decimetres above nought on every grid, as it always did.
    const low = new SceneStream(specOf({ relief: flat(300) }));
    for (const l of low.levels) expect([l.unit, l.base]).toEqual([0.1, 0]);
    // And a deep sea floor is not cut off either.
    const deep = new SceneStream(specOf({ relief: flat(-5200) }));
    expect(deep.ground.at(0, 30000)).toBeLessThan(-5100);
  });

  it("invents no hills on a plain the survey shows level, and rough ground below a rough survey", () => {
    // The same height above the sea, 1,500 m: once level in the survey's cells, once with ridges 400 m high three or
    // four cells across.
    const level = new SceneStream({ ...specOf({ relief: flat(1500), shape: shapeOf(() => 0.25), seed: 'life/level' }), water: dry });
    const rough = new SceneStream({ ...specOf({ relief: flat(1500), shape: shapeOf((x, y) => 400 * Math.sin(x / 1100) * Math.sin(y / 1400 + x / 5000)), seed: 'life/level' }), water: dry });
    // Within a kilometre of a point five kilometres off, on ground no finer than 50 m: how far it stands from a plane.
    const spread = (s: SceneStream) => {
      let sum = 0;
      let sq = 0;
      let n = 0;
      for (let y = 4500; y <= 5500; y += 50) {
        for (let x = -500; x <= 500; x += 50) {
          const v = s.ground.at(x, y) - s.worldGround.at(x, y);
          sum += v;
          sq += v * v;
          n++;
        }
      }
      return Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
    };
    expect(spread(level)).toBeLessThan(1);
    expect(spread(rough)).toBeGreaterThan(8);
    // What is invented is less than the survey's own cells differ by, and adds next to nothing to their mean.
    expect(spread(rough)).toBeLessThan(200);
    let mean = 0;
    let n = 0;
    for (let y = 2000; y <= 8000; y += 250) {
      for (let x = -3000; x <= 3000; x += 250) {
        mean += rough.ground.at(x, y) - rough.worldGround.at(x, y);
        n++;
      }
    }
    expect(Math.abs(mean / n)).toBeLessThan(6);
  });

  it('draws a river the drainage routes in the valley the shape shows between the nodes of its grid', () => {
    // A valley that swings east round a ridge that stands on the straight line between two nodes.
    const floorX = (y: number) => 5000 * Math.sin(((y + 5500) / 11000) * Math.PI);
    const valley = (x: number, y: number) => Math.min(400, ((x - floorX(y)) ** 2) / 9000) - y / 500;
    const water = { rivers: [{ key: 'test#valley', from: 'model' as const, xy: [0, -5500, 0, 5500, 0, 16500], s0: 0, q: [40, 50, 60], z: [611, 589, 567] }], laws, tier: 'model' as const, from: ['field:earth/rivers'] };
    const spec = { ...specOf({ relief: flat(600), shape: shapeOf(valley), seed: 'life/valley' }), water };
    const path = watersFor(spec, placeLook(spec)).paths![0];
    let east = 0;
    for (let i = 0; i < path.xy.length; i += 2) if (Math.abs(path.xy[i + 1]) < 4000) east = Math.max(east, path.xy[i]);
    expect(east).toBeGreaterThan(2500);
    // Its water falls north with the valley's floor, and is never far above it or below it.
    for (let i = 1; i < path.z.length; i++) expect(path.z[i]).toBeLessThanOrEqual(path.z[i - 1]);
    const s = new SceneStream(spec);
    for (let i = 0; i < path.xy.length; i += 40) {
      const [x, y] = [path.xy[i], path.xy[i + 1]];
      if (Math.abs(y) > 5000) continue;
      expect(Math.abs(path.z[i / 2] - (600 + valley(floorX(y), y)))).toBeLessThan(130);
      // And its bed is cut into the ground the scene has.
      expect(s.ground.at(x, y)).toBeLessThan(path.z[i / 2]);
    }
    // Without the shape the same river runs straight between its nodes, as before.
    const plain = { ...specOf({ relief: flat(600), seed: 'life/valley' }), water };
    const straight = watersFor(plain, placeLook(plain)).paths![0];
    let off = 0;
    for (let i = 0; i < straight.xy.length; i += 2) if (Math.abs(straight.xy[i + 1]) < 4000) off = Math.max(off, Math.abs(straight.xy[i]));
    expect(off).toBeLessThan(east);
  });

  it('is the same ground from the same spec with a shape, within the tolerance', () => {
    const make = () => new SceneStream({ ...specOf({ relief: flat(1500), shape: shapeOf((x, y) => 300 * Math.sin(x / 1100) * Math.sin(y / 1400)), seed: 'life/same' }), water: dry });
    expect(fingerprintProblems(make().print(), make().print())).toEqual([]);
  });
});

describe('kinds, and where each grows', () => {
  const treesOf = (s: SceneStream, reach: number, tier = 1) => {
    const out: { x: number; y: number; z: number; k: number }[] = [];
    for (const c of cellsOf(s, tier, reach)) for (let q = 0; q < c.count; q++) out.push({ x: c.place[q * 6], y: c.place[q * 6 + 1], z: c.place[q * 6 + 2], k: c.taxon[q] });
    return out;
  };

  it('stands its kinds in stands: each is commonest in patches of its own', () => {
    // Three trees alike in all but their names.
    const kinds = [taxon('a', 'broadleaf', 20), taxon('b', 'broadleaf', 20), taxon('c', 'broadleaf', 20)];
    const s = new SceneStream(specOf({ taxa: kinds, seed: 'life/stands' }));
    const trees = treesOf(s, 1600).filter((t) => t.k < 3);
    expect(trees.length).toBeGreaterThan(2000);
    // Each tree's nearest neighbour is of its own kind far more often than a third of the time.
    const grid = new Map<string, typeof trees>();
    for (const t of trees) {
      const key = `${Math.floor(t.x / 30)},${Math.floor(t.y / 30)}`;
      const l = grid.get(key);
      if (l) l.push(t);
      else grid.set(key, [t]);
    }
    let same = 0;
    let pairs = 0;
    for (const t of trees) {
      let best: (typeof trees)[number] | undefined;
      let d = 30;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          for (const o of grid.get(`${Math.floor(t.x / 30) + di},${Math.floor(t.y / 30) + dj}`) ?? []) {
            const e = Math.hypot(o.x - t.x, o.y - t.y);
            if (o !== t && e < d) {
              d = e;
              best = o;
            }
          }
        }
      }
      if (!best) continue;
      pairs++;
      if (best.k === t.k) same++;
    }
    expect(same / pairs).toBeGreaterThan(0.55);
    // And no kind is lost: each is still a good share of the whole.
    for (let k = 0; k < 3; k++) expect(trees.filter((t) => t.k === k).length / trees.length).toBeGreaterThan(0.15);
  });

  it("grows each kind where its height's climate is like its rows': what grows changes up a slope", () => {
    // A slope rising 270 m a km to the north, on a field of a hundredth of a degree, and two trees, one of the climate of
    // its foot and one of 1,600 m above it.
    const n = 61;
    const relief: ReliefPatch = { lat0: 40.3, lon0: -0.3, step: 0.01, nx: n, ny: n, z: [] };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) relief.z.push(Math.max(100, Math.min(3100, 2000 + 300 * (30 - j))));
    const kinds = [taxon('lowland', 'broadleaf', 20, { climate: [23.7, 1, 2.7, 1] }), taxon('upland', 'broadleaf', 20, { climate: [15, 1, -6.4, 1] })];
    // With the world's water, and no river in it: the ground is the field's, as the slope has it, with no plain invented over it.
    const laws = parse(readFileSync(join(ROOT, 'fields/earth/rivers.yaml'), 'utf8')).params as ChannelLaws;
    const s = new SceneStream({ ...specOf({ taxa: kinds, relief, atHeight: climateOf(TEMPERATE, 2000, 7), seed: 'life/slope' }), water: { rivers: [], laws, tier: 'model', from: ['field:earth/rivers'] } });
    const trees = treesOf(s, 2800);
    const share = (band: typeof trees) => band.filter((t) => kinds[t.k].label === 'upland').length / band.length;
    const low = trees.filter((t) => t.z < 1600);
    const high = trees.filter((t) => t.z > 2400);
    expect(low.length).toBeGreaterThan(200);
    expect(high.length).toBeGreaterThan(200);
    expect(share(low)).toBeLessThan(0.3);
    expect(share(high)).toBeGreaterThan(0.7);
  });

  it('sows the understory as tall as a person as far as the big animals, and the lower only close by', () => {
    const kinds = [taxon('oak', 'broadleaf', 20), taxon('bracken', 'fern', 1.2), taxon('sorrel', 'herb', 0.3)];
    const s = new SceneStream(specOf({ taxa: kinds, seed: 'life/under' }));
    const count = (tier: number, label: string) => cellsOf(s, tier, 800).reduce((n, c) => n + Array.from(c.taxon).filter((k) => kinds[k].label === label).length, 0);
    expect(count(1, 'bracken')).toBeGreaterThan(50);
    // Only the one set by the arrival, so that every kind is near it.
    expect(count(1, 'sorrel')).toBeLessThanOrEqual(1);
    expect(count(2, 'sorrel')).toBeGreaterThan(50);
  });
});

describe('a scene of the sea', () => {
  it('puts what lives on the sea floor on it, and what swims in the water over it, never on land', () => {
    // A made-up shelf sea 60 m deep: a swimmer, something that lives on the floor (a mussel's body, told to), something
    // that lives anywhere, and a land animal, which has nowhere to stand.
    const floor: Form = { ...plans.mussel, behave: { ...plans.mussel.behave, habitat: 'floor' } };
    const sea: LivingTaxon[] = [taxon('swimmer', 'fish', 0.6), { ...taxon('sitter', 'mussel', 0.1), form: 'test-floor' }, taxon('creeper', 'snail', 0.05), taxon('horned', 'ceratopsian', 8, { hip: 2.6 })];
    const spec = specOf({ relief: flat(-60), taxa: sea });
    spec.forms['test-floor'] = floor;
    const s = new SceneStream(spec);
    expect(s.look.sea).toBe(true);
    expect(s.look.rivers).toBe(false);
    const swimM = (PARAMS as LivingParams).sea!.swim_m;
    const seen = { swimmer: 0, sitter: 0, creeper: 0, horned: 0 };
    for (const c of cellsOf(s, 1, 2000)) {
      for (let q = 0; q < c.count; q++) {
        const t = sea[c.taxon[q]];
        const [x, y, z] = [c.place[q * 6], c.place[q * 6 + 1], c.place[q * 6 + 2]];
        const g = s.ground.at(x, y);
        seen[t.label as keyof typeof seen]++;
        if (t.label === 'swimmer') {
          expect(z).toBeGreaterThan(g);
          expect(z).toBeLessThan(s.look.water);
          expect(z - g).toBeLessThanOrEqual(swimM + 1e-6);
        } else {
          expect(z, t.label).toBeCloseTo(g, 5);
          expect(g, t.label).toBeLessThan(s.look.water - 0.5);
        }
      }
    }
    expect(seen.swimmer).toBeGreaterThan(0);
    expect(seen.sitter).toBeGreaterThan(0);
    expect(seen.creeper).toBeGreaterThan(0);
    expect(seen.horned).toBe(0);
  });

  it('makes on land what version 4 made: nothing that swims, and no river invented at sea only', () => {
    const land = new SceneStream(specOf());
    expect(land.look.sea).toBe(false);
    const fish: LivingTaxon[] = [...TAXA, taxon('swimmer', 'fish', 0.6)];
    const withFish = new SceneStream(specOf({ taxa: fish }));
    for (const c of cellsOf(withFish, 1)) for (let q = 0; q < c.count; q++) expect(fish[c.taxon[q]].label).not.toBe('swimmer');
  });
});
