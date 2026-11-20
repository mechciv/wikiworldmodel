// The atlas's rules, on a made-up Earth: two continents with a deep sea between them, a chain of islands, and
// made-up taxa, so that what should reach what is plain. Nothing here is about any real place.
import { describe, expect, it } from 'vitest';
import { atlasKey, atlasList, TIER, type AtlasBin } from '../../../core/atlas.ts';
import type { ClimateRule } from '../../../core/climate.ts';
import type { Form } from '../../../core/form.ts';
import type { PeriodRecord } from '../../../core/records.ts';
import { toMa } from '../../../core/time.ts';
import { atlasBins, buildAtlas, rowShare, type AtlasParams } from '../src/build/atlas.ts';
import { SRC_W, type Snapshot } from '../src/build/fields.ts';
import type { ClimateKeyframe } from '../src/build/climate.ts';
import type { Solved } from '../src/build/records.ts';
import type { LandSnapshot, LandTaxon } from '../src/pbdb.ts';
import type { Claim, Entity, World } from '../src/world.ts';

const PARAMS: AtlasParams = { grid_deg: 4, graph_deg: 2, here_km: 350, region_km: 2200, kernel_km: 900, shallow_cost: 4, deep_cost: 14, shallow_m: 220, longest_span: 30, longest_span_in_stages: 10, tight_span: 10, longest_bin: 8, shortest_bin: 0.01, quotas: { canopy: 8, under: 4, float: 2, big: 10, middle: 10, small: 6, air: 4, tiny: 4 }, standins: { canopy: 2, under: 1, big: 2, middle: 2, small: 1, air: 1, tiny: 1 }, big_m: 3, small_m: 0.5, tiny_m: 0.1 };

const claim = (entity: string, prop: string, value: unknown): Claim => ({ key: prop, entity, ref: `${entity}#${prop}`, subject: entity, sources: [], basis: 'evidence', author: 'machine:test', status: 'proposed', rank: 'normal', file: 'test', where: prop, prop, value } as unknown as Claim);
const taxonRecord = (id: string, no: number, claims: [string, unknown][]): Entity => ({ id, kind: 'taxon', summary: '', same_as: { pbdb: `txn:${no}` }, phases: [], claims: [claim(id, 'name', { la: id }), ...claims.map(([p, v]) => claim(id, p, v))], relations: [], file: 'test' } as unknown as Entity);

const animal: Form = { kind: 'animal', hip: 0.3, description: 'a test', parts: { body: { type: 'trunk', rings: [[-0.5, 1, 0.8, 0.02], [0, 1.2, 0.6, 0.1], [0.4, 1, 0.8, 0.05]] }, legs: { type: 'pillar', y: 0, x: 0.1, top: 0.7, r: 0.04 } } };
const tree: Form = { kind: 'plant', description: 'a test', behave: { layer: 'canopy' }, parts: { tree: { type: 'conifer' } } };

// Land from 30°W to 0° (the west continent), and from 60°E to 90°E (the east one), both from 40°S to 40°N. Deep sea between.
const elevAt = (lat: number, lon: number) => {
  if (lat > 40 || lat < -40) return -4000;
  if (lon >= -30 && lon <= 0) return 200;
  if (lon >= 60 && lon <= 90) return 200;
  return -4000;
};

function snapshot(): Snapshot {
  const elev = new Int16Array(SRC_W * 181);
  const plate = new Uint16Array(SRC_W * 181);
  for (let j = 0; j <= 180; j++) {
    for (let i = 0; i < SRC_W; i++) {
      const lat = 90 - j;
      const lon = i - 180;
      elev[j * SRC_W + i] = elevAt(lat, lon);
      plate[j * SRC_W + i] = 1;
    }
  }
  return { ageMa: 0, elev, plate };
}

const taxa: LandTaxon[] = [
  [1, 'Life', 1, 0, 1, null, null, null, null, 0, 0, 0, 0],
  [10, 'Beasts', 1, 1, 0, null, null, null, null, 0, 0, 0, 0],
  [11, 'Westbeast', 2, 10, 0, null, null, null, null, 0, 0, 0, 0],
  [12, 'Eastbeast', 2, 10, 0, null, null, null, null, 0, 0, 0, 0],
  [13, 'Oldbeast', 2, 10, 0, null, null, null, null, 0, 0, 0, 0],
  [14, 'Vaguebeast', 2, 10, 0, null, null, null, null, 0, 0, 0, 0],
  [15, 'Westbeast major', 3, 11, 0, null, null, null, null, 0, 0, 0, 0],
  [20, 'Trees', 1, 1, 1, null, null, null, null, 0, 0, 0, 0],
  [21, 'Westtree', 2, 20, 1, null, null, null, null, 0, 0, 0, 0],
];
const land: LandSnapshot = {
  format: 'lightworld-pbdb-land@1',
  snapshot: 'test',
  license: 'test',
  query: { occurrences: '', taxa: '' },
  words: ['', 'clade', 'genus', 'species'],
  taxa,
  // A site on the west continent, one on the east, one long before, and one dated to a span too long to say anything.
  sites: [
    [1, 10, -15, 5, 0, 0],
    [2, 10, 75, 5, 0, 0],
    [3, 10, -15, 30, 25, 0],
    [4, 10, -15, 60, 0, 0],
    [5, 10, -15, 40, 20, 0],
  ],
  rows: [
    [100, 0, 11],
    [101, 0, 11],
    [102, 0, 21],
    [103, 1, 12],
    [104, 2, 13],
    [105, 3, 14],
    [106, 0, 15],
    [107, 4, 11],
  ],
};

function makeWorld(snap: LandSnapshot = land): World {
  const entities = [taxonRecord('t/beasts', 10, [['body_plan', 'beast'], ['body_length', { lo: 2, hi: 6 }]]), taxonRecord('t/trees', 20, [['body_plan', 'tree'], ['plant_height', { lo: 10, hi: 20 }]])];
  return {
    entities,
    entity: new Map(entities.map((e) => [e.id, e])),
    plans: { beast: animal, tree },
    fields: [{ id: 'field:life/community', title: 'Who lived where', data: { as: 'community', from: 'src:land' }, params: PARAMS }, { id: 'field:earth/coastline', isoline_m: 20 }],
    landFossils: new Map([['src:land', snap]]),
    source: new Map(),
    generators: [{ id: 'gen:life/scene', version: 2, params: {} }],
  } as unknown as World;
}

const periods: Pick<PeriodRecord, 'rank' | 'start' | 'end' | 'name' | 'id'>[] = [
  { id: 'a', rank: 'stage', name: 'Young', start: 1950 - 5e6, end: 1950 },
  { id: 'b', rank: 'stage', name: 'Old', start: 1950 - 32e6, end: 1950 - 24e6 },
];

const rule: ClimateRule = { polar: 10, frost: 0, tropical: 18, cold: -3, arid: 1, desert: 0.5 };
const key: ClimateKeyframe = { ageMa: 0, values: new Uint8Array(0), plate: new Uint16Array(0), nodes: new Float32Array(181 * 91 * 4).fill(NaN) } as unknown as ClimateKeyframe;

const model = { reaches: () => true, total: () => [1, 0, 0, 0] };

// `recordEnd` says when a record's taxon died out, in Ma, as the world's solved records would: by default none did.
function atlas(snap: LandSnapshot = land, chart: Pick<PeriodRecord, 'rank' | 'start' | 'end' | 'name' | 'id'>[] = periods, recordEnd: (id: string) => number | undefined = () => undefined) {
  const out = buildAtlas({ world: makeWorld(snap), model } as unknown as Solved, chart as PeriodRecord[], [snapshot(), { ...snapshot(), ageMa: 28 }], [key], { step: 2, nx: 180, lon0: -180, lat0: 90 }, rule, () => {}, recordEnd);
  if (!out) throw new Error('no atlas');
  return out;
}

const binNamed = (o: ReturnType<typeof atlas>, name: string) => JSON.parse(o.files.get(o.index.bins.find((b) => b.name === name)!.file)!) as AtlasBin;

describe('the atlas', () => {
  it('has what is recorded nearby as here, with the distance to its nearest row', () => {
    const o = atlas();
    const list = atlasList(binNamed(o, 'Young'), o.index.grid, 10, -15);
    const west = list.find((e) => e.taxon.label === 'Westbeast')!;
    expect(west.tier).toBe(TIER.here);
    expect(west.km).toBeLessThanOrEqual(PARAMS.here_km);
  });

  it('has it as in the region further off over land, and only a guess', () => {
    const o = atlas();
    const list = atlasList(binNamed(o, 'Young'), o.index.grid, -5, -15);
    const west = list.find((e) => e.taxon.label === 'Westbeast')!;
    expect(west.tier).toBe(TIER.region);
    expect(west.km).toBeGreaterThan(PARAMS.here_km);
    expect(west.km).toBeLessThanOrEqual(PARAMS.region_km);
  });

  it('does not let a taxon cross the sea as here or in the region, though it is not so far as the crow flies', () => {
    const o = atlas();
    const onWest = atlasList(binNamed(o, 'Young'), o.index.grid, 10, -2);
    expect(onWest.some((e) => e.taxon.label === 'Eastbeast')).toBe(false);
    const onEast = atlasList(binNamed(o, 'Young'), o.index.grid, 10, 62);
    expect(onEast.some((e) => e.taxon.label === 'Westbeast')).toBe(false);
    expect(onEast.some((e) => e.taxon.label === 'Eastbeast')).toBe(true);
  });

  it('has nothing for the open sea', () => {
    const o = atlas();
    expect(atlasList(binNamed(o, 'Young'), o.index.grid, 10, 30)).toEqual([]);
    expect(binNamed(o, 'Young').nodes[String(atlasKey(o.index.grid, 10, 30))]).toBeUndefined();
  });

  it('keeps to its own time: what lived long before is not on a young list, nor the young on an old one', () => {
    const o = atlas();
    const young = atlasList(binNamed(o, 'Young'), o.index.grid, 10, -15);
    expect(young.some((e) => e.taxon.label === 'Oldbeast')).toBe(false);
    const old = atlasList(binNamed(o, 'Old'), o.index.grid, 10, -15);
    expect(old.some((e) => e.taxon.label === 'Oldbeast')).toBe(true);
    expect(old.some((e) => e.taxon.label === 'Westbeast')).toBe(false);
  });

  it('leaves out a row dated too loosely to say anything of a stage', () => {
    const o = atlas();
    const young = atlasList(binNamed(o, 'Young'), o.index.grid, 10, -15);
    expect(young.some((e) => e.taxon.label === 'Vaguebeast')).toBe(false);
  });

  it('has a stand-in for a kind of thing nothing near has, as a clade, saying how far the nearest is', () => {
    const o = atlas();
    // Trees are known only on the west continent: on the east, they stand in, and the clade is what is named.
    const onEast = atlasList(binNamed(o, 'Young'), o.index.grid, 10, 75);
    const stand = onEast.find((e) => e.tier === TIER.standin)!;
    expect(stand).toBeDefined();
    expect(stand.taxon.standin).toBe(true);
    expect(stand.taxon.label).toBe('t/trees');
    expect(stand.km).toBeLessThan(500);
  });

  it('draws a genus from the node above it, and says so', () => {
    const o = atlas();
    const west = atlasList(binNamed(o, 'Young'), o.index.grid, 10, -15).find((e) => e.taxon.label === 'Westbeast')!;
    expect(west.taxon.own).toBe(false);
    expect(west.taxon.form_from).toBe('t/beasts');
    expect(west.taxon.length).toMatchObject({ lo: 2, hi: 6, own: false });
    expect(JSON.parse(o.files.get(o.index.forms)!)[west.taxon.form].kind).toBe('animal');
  });

  it('knows where to go to see a record\'s taxon: where the most rows of it and all below it are', () => {
    const o = atlas();
    const where = JSON.parse(o.files.get(o.index.where)!) as Record<string, { t: number; lat: number; lon: number; rows: number }>;
    // Three Westbeast rows on the west continent beat one Eastbeast on the east, and all are beasts.
    expect(where['t/beasts'].lon).toBeLessThan(0);
    expect(where['t/beasts'].rows).toBe(3);
    expect(where['t/trees'].lon).toBeLessThan(0);
  });

  it('has a species on the list as its genus, so that it takes up one place', () => {
    const o = atlas();
    const list = atlasList(binNamed(o, 'Young'), o.index.grid, 10, -15);
    expect(list.some((e) => e.taxon.label === 'Westbeast major')).toBe(false);
    expect(list.find((e) => e.taxon.label === 'Westbeast')!.taxon.rows).toBe(3);
  });

  it('leaves out a taxon\'s loosely dated row where it has rows dated better', () => {
    const o = atlas();
    // A row of 40–20 Ma overlaps the old stage; but Westbeast has rows dated well, of 5–0 Ma, so it stays out of it.
    const old = atlasList(binNamed(o, 'Old'), o.index.grid, 10, -15);
    expect(old.some((e) => e.taxon.label === 'Westbeast')).toBe(false);
  });

  it('counts how far forms reach, and lists what most wants one', () => {
    const o = atlas();
    expect(o.index.coverage.inherited_form).toBeGreaterThan(0);
    expect(o.wanted[0].name).toBe('Westbeast');
  });

  it('is the same bytes each time', () => {
    const a = atlas();
    const b = atlas();
    expect([...a.files.entries()]).toEqual([...b.files.entries()]);
  });
});

// The young end of a made-up chart, as short as the real one's: a long stage, a shorter one, and three that the rows do
// not tell apart, which make up an epoch. Rows dated to the epoch as a whole, to the stage before it, and loosely, to
// spans that take in both.
describe('a stage near the present', () => {
  const ago = (ma: number) => 1950 - ma * 1e6;
  const chart: Pick<PeriodRecord, 'rank' | 'start' | 'end' | 'name' | 'id'>[] = [
    { id: 'before', rank: 'stage', name: 'Before', start: ago(0.774), end: ago(0.129) },
    { id: 'late', rank: 'stage', name: 'Late', start: ago(0.129), end: ago(0.0117) },
    { id: 'first', rank: 'stage', name: 'First', start: ago(0.0117), end: ago(0.0082) },
    { id: 'second', rank: 'stage', name: 'Second', start: ago(0.0082), end: ago(0.0042) },
    { id: 'third', rank: 'stage', name: 'Third', start: ago(0.0042), end: Infinity },
    { id: 'recent', rank: 'epoch', name: 'Recent', start: ago(0.0117), end: Infinity },
    { id: 'all', rank: 'period', name: 'All of it', start: ago(0.774), end: Infinity },
  ];
  const recent: LandSnapshot = {
    ...land,
    taxa: [
      [1, 'Life', 1, 0, 1, null, null, null, null, 0, 0, 0, 0],
      [10, 'Beasts', 1, 1, 0, null, null, null, null, 0, 0, 0, 0],
      [31, 'Lastbeast', 2, 10, 0, null, null, null, null, 0, 0, 0, 0],
      [32, 'Nowbeast', 2, 10, 1, null, null, null, null, 0, 0, 0, 0],
      [33, 'Quatbeast', 2, 10, 0, null, null, null, null, 0, 0, 0, 0],
    ],
    // All on the west continent: the stage before the epoch, the stage and the epoch together, all of both and more, and the epoch.
    sites: [
      [1, 10, -15, 0.129, 0.0117, 0],
      [2, 10, -15, 0.129, 0, 0],
      [3, 10, -15, 2.58, 0, 0],
      [4, 10, -15, 0.0117, 0, 0],
    ],
    rows: [
      [200, 0, 31],
      [201, 0, 31],
      [202, 1, 31],
      [203, 2, 31],
      [204, 2, 33],
      [205, 3, 32],
      [206, 3, 32],
    ],
  };
  const names = (o: ReturnType<typeof atlas>, bin: string) => atlasList(binNamed(o, bin), o.index.grid, 10, -15).map((e) => e.taxon.label);

  it('counts a row for its share of a stage, and not at all where it is many times as long as the stage', () => {
    expect(rowShare(0.0117, 0, 0.0117, 0, PARAMS)).toBe(1);
    // Eleven times the stage: too loose to say anything of it, though it takes it in.
    expect(rowShare(0.129, 0, 0.0117, 0, PARAMS)).toBe(0);
    expect(rowShare(0.1, 0, 0.0117, 0, PARAMS)).toBeCloseTo(0.117, 6);
    // In deep time, as near the present: ten times a stage counts, for a tenth.
    expect(rowShare(20, 0, 2, 0, PARAMS)).toBeCloseTo(0.1, 9);
    expect(rowShare(20.1, 0, 2, 0, PARAMS)).toBe(0);
    expect(rowShare(40, 5, 72, 66, PARAMS)).toBe(0);
    // A row that ends where the stage begins is not in it.
    expect(rowShare(70, 66, 66, 60, PARAMS)).toBe(0);
  });

  it('keeps the epoch the rows are dated to as one stage, named for it, and the stages before it as their own', () => {
    const o = atlas(recent, chart);
    expect(o.index.bins.map((b) => b.name)).toEqual(['Before', 'Late', 'Recent']);
    const r = o.index.bins.find((b) => b.name === 'Recent')!;
    expect(toMa(r.from)).toBeCloseTo(0.0117, 9);
    expect(r.to).toBe(1950);
  });

  it('lists in the epoch only what its own rows put there: not what lived before it and has only loose rows that reach it', () => {
    const o = atlas(recent, chart);
    const now = names(o, 'Recent');
    expect(now).toContain('Nowbeast');
    expect(now).not.toContain('Lastbeast');
    expect(now).not.toContain('Quatbeast');
    // What lived before it is listed in its own stage, from the rows dated to it and the stage and the epoch together.
    const late = names(o, 'Late');
    expect(late).toContain('Lastbeast');
    expect(late).not.toContain('Nowbeast');
    expect(late).not.toContain('Quatbeast');
    // A row of more than two million years is not too loose for a stage of more than half a million.
    expect(names(o, 'Before')).toEqual(expect.arrayContaining(['Lastbeast', 'Quatbeast']));
  });

  it('ends a taxon where a record of it, or of a clade above it, says it died out: its span stops there, and rows dated after are left out', () => {
    // The beasts died out 5,000 years ago, as a record of their clade says: Nowbeast's rows of the epoch run past that.
    const o = atlas(recent, chart, (id) => (id === 't/beasts' ? 0.005 : undefined));
    const now = atlasList(binNamed(o, 'Recent'), o.index.grid, 10, -15).find((e) => e.taxon.label === 'Nowbeast')!;
    expect(now.taxon.span).toEqual([0.0117, 0.005]);
    // Had they died out before the epoch, nothing of them is listed in it, though a row says otherwise, nor stands in for it.
    const gone = atlas(recent, chart, (id) => (id === 't/beasts' ? 0.02 : undefined));
    expect(names(gone, 'Recent')).toEqual([]);
    const late = atlasList(binNamed(gone, 'Late'), gone.index.grid, 10, -15).find((e) => e.taxon.label === 'Lastbeast')!;
    expect(late.taxon.span[1]).toBe(0.02);
    // On the other continent the clade stands in, and stops where its record does.
    const stand = atlasList(binNamed(o, 'Recent'), o.index.grid, 10, 75).find((e) => e.tier === TIER.standin)!;
    expect(stand.taxon.label).toBe('t/beasts');
    expect(stand.taxon.span).toEqual([0.0117, 0.005]);
  });

  it('says how long its taxa\'s rows in the epoch reach, which is to the present', () => {
    const o = atlas(recent, chart);
    const now = atlasList(binNamed(o, 'Recent'), o.index.grid, 10, -15).find((e) => e.taxon.label === 'Nowbeast')!;
    expect(now.tier).toBe(TIER.here);
    // Kept to the year, as a scene near the present hides a taxon while its rows do not reach the time shown.
    expect(now.taxon.span).toEqual([0.0117, 0]);
  });
});

describe('its stages', () => {
  const stages = [
    { rank: 'stage', name: 'A', start: 1950 - 66e6, end: 1950 - 50e6 },
    { rank: 'stage', name: 'B', start: 1950 - 50e6, end: 1950 - 44e6 },
    { rank: 'stage', name: 'B2', start: 1950 - 44e6, end: 1950 - 0.6e6 },
    { rank: 'stage', name: 'C', start: 1950 - 0.6e6, end: 1950 - 0.1e6 },
    { rank: 'stage', name: 'D', start: 1950 - 0.1e6, end: 1950 },
    { rank: 'period', name: 'Not one', start: 1950 - 66e6, end: 1950 },
  ];

  it('names stages it joins for the unit of the chart they make up, and a stage it keeps whole for itself', () => {
    const chart = [...stages, { rank: 'epoch', name: 'Late epoch', start: 1950 - 0.6e6, end: 1950 }, { rank: 'epoch', name: 'Same as B', start: 1950 - 50e6, end: 1950 - 44e6 }];
    const bins = atlasBins(chart, 8, 0.5);
    expect(bins.map((b) => b.name)).toContain('Late epoch');
    expect(bins.some((b) => b.name.includes('C to D'))).toBe(false);
    expect(bins.map((b) => b.name)).toContain('B');
    expect(bins.map((b) => b.name)).not.toContain('Same as B');
  });

  it('cuts a long stage, and keeps a short one whole', () => {
    const bins = atlasBins(stages, 8, 0.5);
    expect(bins.filter((b) => b.name.startsWith('A')).length).toBe(2);
    expect(bins.filter((b) => b.name === 'B').length).toBe(1);
  });

  it('joins the shortest to the next up the chart', () => {
    const bins = atlasBins(stages, 8, 0.5);
    expect(bins.some((b) => b.name === 'D')).toBe(false);
    expect(bins.some((b) => b.name.includes('C to D') || b.name.includes('to D'))).toBe(true);
  });

  it('runs oldest first, each ending where it ends, and takes only the chart\'s stages', () => {
    const bins = atlasBins(stages, 8, 0.5);
    for (let i = 1; i < bins.length; i++) expect(bins[i].from).toBeGreaterThanOrEqual(bins[i - 1].from);
    expect(bins.some((b) => b.name === 'Not one')).toBe(false);
  });
});
