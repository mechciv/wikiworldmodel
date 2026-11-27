// The sea's atlas (tools/world/src/build/sea.ts): what it takes a like sea to be, and how it gates coastal/amphibious taxa and dates.
import { describe, expect, it } from 'vitest';
import { seaDrawList, seaList, TIER, type SeaBin } from '../../../core/atlas.ts';
import type { Form } from '../../../core/form.ts';
import type { PeriodRecord } from '../../../core/records.ts';
import { beltOf, buildSeaAtlas, isCoastalSeaTaxon, type SeaParams } from '../src/build/sea.ts';
import type { RocksAgeData } from '../src/build/atlas.ts';
import { SRC_W, type Snapshot } from '../src/build/fields.ts';
import type { Solved } from '../src/build/records.ts';
import type { LandSnapshot, LandTaxon } from '../src/pbdb.ts';
import type { Claim, Entity, World } from '../src/world.ts';

const SEA_PARAMS: SeaParams = {
  grid_deg: 4,
  graph_deg: 2,
  here_km: 350,
  region_km: 2200,
  kernel_km: 900,
  here_share: 0.5,
  land_cost: 14,
  deep_cost: 4,
  shallow_m: 220,
  longest_span: 30,
  longest_span_in_stages: 10,
  tight_span: 10,
  longest_bin: 8,
  shortest_bin: 0.01,
  list_size: 10,
  standins: 5,
  drawn_size: 10,
  per_class: 4,
  belts: [30, 60],
  other_belt: 0.25,
};

const claim = (entity: string, prop: string, value: unknown): Claim =>
  ({ key: prop, entity, ref: `${entity}#${prop}`, subject: entity, sources: [], basis: 'evidence', author: 'machine:test', status: 'proposed', rank: 'normal', file: 'test', where: prop, prop, value }) as unknown as Claim;
const taxonRec = (id: string, no: number, claims: [string, unknown][]): Entity =>
  ({ id, kind: 'taxon', summary: '', same_as: { pbdb: `txn:${no}` }, phases: [], claims: [claim(id, 'name', { la: id }), ...claims.map(([p, v]) => claim(id, p, v))], relations: [], file: 'test' }) as unknown as Entity;

const whaleForm: Form = { kind: 'animal', description: 'test whale', behave: { habitat: 'water' }, parts: { body: { type: 'trunk', rings: [[-0.5, 1, 0.5, 0.05], [0.5, 1, 0.5, 0.05]] } } };
const otterForm: Form = { kind: 'animal', description: 'test carnivoran', behave: { habitat: 'any' }, parts: { body: { type: 'trunk', rings: [[-0.5, 1, 0.5, 0.05], [0.5, 1, 0.5, 0.05]] } } };
const birdForm: Form = { kind: 'animal', description: 'test seabird', behave: { habitat: 'air' }, parts: { body: { type: 'trunk', rings: [[-0.5, 1, 0.5, 0.05], [0.5, 1, 0.5, 0.05]] } } };

function seaSnapshot(): Snapshot {
  const elev = new Int16Array(SRC_W * 181);
  const plate = new Uint16Array(SRC_W * 181);
  for (let j = 0; j <= 180; j++) {
    for (let i = 0; i < SRC_W; i++) {
      const lat = 90 - j;
      const lon = i - 180;
      // Shallow shelf (-60 m) at lon [-20, -10], lat [-10, 20]; deep ocean (-3500 m) everywhere else.
      elev[j * SRC_W + i] = lat >= -10 && lat <= 20 && lon >= -20 && lon <= -10 ? -60 : -3500;
      plate[j * SRC_W + i] = 1;
    }
  }
  return { ageMa: 0, elev, plate };
}

describe("the belts of latitude the sea's atlas likens places by", () => {
  it('counts a belt from the equator out, either side alike', () => {
    expect([0, 29.9, 30, -45, 60, -89].map((lat) => beltOf(lat, [30, 60]))).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe("habitat and date gating in the sea's atlas", () => {
  const words = ['', 'clade', 'genus', 'marine', 'coastal', 'amphibious', 'aquatic, depth=surface', 'nektonic'];
  const taxa: LandTaxon[] = [
    [1, 'Life', 1, 0, 1, null, null, null, null, 0, 0, 0, 0],
    [10, 'Cetacea', 1, 1, 1, null, null, null, null, 3, 0, 6, 0],
    [11, 'Pelagicwhale', 2, 10, 1, null, null, null, null, 3, 0, 6, 0],
    [20, 'Carnivora', 1, 1, 1, null, null, null, null, 0, 0, 0, 0],
    [21, 'Seaotter', 2, 20, 1, null, null, null, null, 3, 0, 5, 0],
    [30, 'Procellariiformes', 1, 1, 1, null, null, null, null, 3, 0, 0, 0],
    [31, 'Albatross', 2, 30, 1, null, null, null, null, 3, 0, 0, 0],
    [40, 'Loosewhale', 2, 10, 1, null, null, null, null, 3, 0, 7, 0],
  ];
  const snap: LandSnapshot = {
    format: 'lightworld-pbdb-land@1',
    snapshot: 'test',
    license: 'test',
    query: { occurrences: '', taxa: '' },
    words,
    taxa,
    sites: [
      // Site 0 on shallow shelf (-14° lon, 6° lat), full Holocene
      [101, 6, -14, 0.0117, 0, 0],
      // Site 1 on shallow shelf, loose span (0.04..0 Ma -> 29% overlap with Holocene < here_share 0.5)
      [102, 6, -14, 0.04, 0, 0],
    ],
    rows: [
      [1, 0, 11],
      [2, 0, 21],
      [3, 0, 31],
      [4, 1, 40],
    ],
  };
  const entities = [
    taxonRec('t/cetacea', 10, [['body_plan', 'whale'], ['body_length', { lo: 4, hi: 6 }]]),
    taxonRec('t/carnivora', 20, [['body_plan', 'otter'], ['body_length', { lo: 1, hi: 1.5 }]]),
    taxonRec('t/seabirds', 30, [['body_plan', 'bird'], ['body_length', { lo: 0.8, hi: 1.2 }]]),
  ];
  const world = {
    entities,
    entity: new Map(entities.map((e) => [e.id, e])),
    plans: { whale: whaleForm, otter: otterForm, bird: birdForm },
    fields: [{ id: 'field:life/community-sea', title: 'Sea', data: { as: 'community-sea', from: 'src:sea' }, params: SEA_PARAMS }],
    source: new Map(),
  } as unknown as World;
  const model = { reaches: () => true, total: () => [1, 0, 0, 0] };
  const periods: Pick<PeriodRecord, 'rank' | 'start' | 'end' | 'name' | 'id'>[] = [
    { id: 'holo', rank: 'stage', name: 'Holocene', start: 1950 - 0.0117e6, end: 1950 },
  ];

  it('excludes coastal and amphibious taxa from deep ocean patches while keeping them on shallow shelves and pelagic taxa in deep water', () => {
    expect(isCoastalSeaTaxon('amphibious', 'marine', 'any')).toBe(true);
    expect(isCoastalSeaTaxon('intertidal', 'marine', 'floor')).toBe(true);
    expect(isCoastalSeaTaxon('', 'coastal', 'water')).toBe(true);
    expect(isCoastalSeaTaxon('aquatic, depth=surface', 'marine', 'water')).toBe(false);
    expect(isCoastalSeaTaxon('amphibious', 'coastal', 'air')).toBe(false);

    const out = buildSeaAtlas({ world, model } as unknown as Solved, periods as PeriodRecord[], [seaSnapshot()], snap, 'src:sea', SEA_PARAMS, 20, () => {}, () => undefined);
    const bin = JSON.parse(out.files.get(out.index.bins[0].file)!) as SeaBin;
    // On the shallow shelf (-60 m): otter, whale, and albatross all appear.
    const shelf = (seaDrawList(bin, out.index.grid, 6, -14) ?? []).map((e) => e.taxon.label);
    expect(shelf).toContain('Seaotter');
    expect(shelf).toContain('Pelagicwhale');
    expect(shelf).toContain('Albatross');
    // In nearby deep ocean (-3500 m, within regional reach): otter is gated out, whale and albatross remain.
    const deepNear = (seaDrawList(bin, out.index.grid, 6, -6) ?? []).map((e) => e.taxon.label);
    expect(deepNear).not.toContain('Seaotter');
    expect(deepNear).toContain('Pelagicwhale');
    expect(deepNear).toContain('Albatross');
    // Far deep ocean (stand-in pool): otter never stands in over deep water, pelagic whale does.
    const deepFar = (seaDrawList(bin, out.index.grid, 6, 80) ?? []).map((e) => e.taxon.label);
    expect(deepFar).not.toContain('Seaotter');
    expect(deepFar).toContain('Pelagicwhale');
  });

  it('tightens sea site spans with measured ages and requires here_share for direct local tier', () => {
    const rocks: RocksAgeData = {
      words: ['YBP'],
      ages: [
        [101, 1, 7000, 0, 0, 0], // max 7000 YBP
        [101, 2, 4000, 0, 0, 0], // min 4000 YBP
      ],
    };
    const out = buildSeaAtlas({ world, model } as unknown as Solved, periods as PeriodRecord[], [seaSnapshot()], snap, 'src:sea', SEA_PARAMS, 20, () => {}, () => undefined, rocks);
    const bin = JSON.parse(out.files.get(out.index.bins[0].file)!) as SeaBin;
    const shelf = seaList(bin, out.index.grid, 6, -14) ?? [];
    const whale = shelf.find((e) => e.taxon.label === 'Pelagicwhale')!;
    expect(whale.tier).toBe(TIER.here);
    expect(whale.taxon.span).toEqual([0.007, 0.004]);
    // Loosewhale is at the same shelf node (km = 0), but only 29% of its span lies in Holocene (< here_share 0.5).
    const loose = shelf.find((e) => e.taxon.label === 'Loosewhale')!;
    expect(loose.tier).toBe(TIER.region);
    // Adding a distant Holocene row of Pelagicwhale reaching 0 Ma widens the shelf patch's span past the local
    // 7000..4000 YBP record, so the extended entry must be demoted to TIER.region.
    const wideSnap: LandSnapshot = {
      ...snap,
      sites: [...snap.sites, [103, 6, -6, 0.0117, 0, 0]],
      rows: [...snap.rows, [4, 2, 11]],
    };
    const wideOut = buildSeaAtlas({ world, model } as unknown as Solved, periods as PeriodRecord[], [seaSnapshot()], wideSnap, 'src:sea', SEA_PARAMS, 20, () => {}, () => undefined, rocks);
    const wideBin = JSON.parse(wideOut.files.get(wideOut.index.bins[0].file)!) as SeaBin;
    const wideWhale = (seaList(wideBin, wideOut.index.grid, 6, -14) ?? []).find((e) => e.taxon.label === 'Pelagicwhale')!;
    expect(wideWhale.taxon.span).toEqual([0.0117, 0]);
    expect(wideWhale.tier).toBe(TIER.region);
  });
});
