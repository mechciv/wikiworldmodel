// The rocks the fossils lie in, as a snapshot: how the service's answers are read, which collections are kept, and how
// an overlay corrects one.
import { describe, expect, it } from 'vitest';
import { csvRecords, rockRows, rocksFrom } from '../src/pbdb.ts';
import { correctRocks, type RowsSpec } from '../src/tables.ts';

const records = (text: string): string[][] => {
  const out: string[][] = [];
  csvRecords(text, (r) => out.push(r));
  return out;
};

describe('the service\'s CSV', () => {
  it('reads quoted fields with commas, doubled quotes and line breaks in them', () => {
    expect(records('"a","b,c","say ""hello""","two\r\nlines"\r\n"1","2","3","4"\n')).toEqual([
      ['a', 'b,c', 'say "hello"', 'two\r\nlines'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('reads bare fields, empty ones, a comma at a line\'s end and a last line with no break', () => {
    expect(records('a,,c\nd,e,\nf,g')).toEqual([
      ['a', '', 'c'],
      ['d', 'e', ''],
      ['f', 'g'],
    ]);
    expect(records('a,b,')).toEqual([['a', 'b', '']]);
  });
});

const HEAD = ['collection_no', 'lng', 'lat', 'max_ma', 'min_ma', 'lithdescript', 'lithology1', 'lithadj1', 'lithification1', 'minor_lithology1', 'lithology2', 'lithadj2', 'lithification2', 'minor_lithology2', 'environment', 'tectonic_setting', 'direct_ma_value', 'direct_ma_error', 'direct_ma_unit', 'direct_ma_method', 'max_ma_value', 'max_ma_error', 'max_ma_unit', 'max_ma_method', 'min_ma_value', 'min_ma_error', 'min_ma_unit', 'min_ma_method', 'formation'];
const line = (cells: Record<string, string>) => HEAD.map((h) => `"${(cells[h] ?? '').replace(/"/g, '""')}"`).join(',');
const answer = (rows: Record<string, string>[]) => ['"Data Provider","The Paleobiology Database"', '"Data License","Creative Commons CC0"', '"Records:"', HEAD.map((h) => `"${h}"`).join(','), ...rows.map(line)].join('\r\n') + '\r\n';
// The service asked for a class with no `datainfo`: the header comes first.
const members = (...nos: number[]) => ['"collection_no","lng","lat"', ...nos.map((n) => `"${n}","0","0"`)].join('\r\n') + '\r\n';

const lake = { collection_no: '31170', lng: '-43.0', lat: '-4.0', max_ma: '121.4', min_ma: '113.2', lithdescript: 'a "varved" bed,\r\nwith gypsum', lithology1: '"shale"', lithadj1: 'yellow,desiccation cracks', minor_lithology1: 'calcareous', lithology2: 'gypsum', environment: 'lacustrine indet.', formation: 'Codo' };
const channel = { collection_no: '67219', lng: '-44.36', lat: '-3.40', max_ma: '119.57', min_ma: '106.3', lithology1: 'sandstone', lithadj1: 'current ripples,fine', lithology2: 'mudstone', lithadj2: 'planar lamination,red', environment: 'fluvial-deltaic indet.', tectonic_setting: 'rift', formation: 'Itapecuru', direct_ma_value: '118.2', direct_ma_error: '0.4', direct_ma_unit: 'Ma', direct_ma_method: 'U/Pb', max_ma_value: '7700', max_ma_unit: 'YBP', max_ma_method: '14C' };
const nowhere = { collection_no: '5', lng: '', lat: '', max_ma: '120', min_ma: '119', lithology1: 'sandstone', environment: 'dune' };
const silent = { collection_no: '9', lng: '10', lat: '20', max_ma: '120', min_ma: '119', lithology1: 'not reported', environment: 'marine indet.' };

const snapshot = () =>
  rocksFrom(
    '2026-11-20',
    { collections: 'colls', classes: 'classes', vocabulary: 'vocab' },
    [answer([channel, lake, nowhere]), answer([lake, silent])],
    new Map([
      ['terrestrial', members(31170, 67219, 5)],
      ['lacustrine', members(31170)],
      ['marine', members(9, 67219, 12345)],
    ]),
    [
      { config_section: 'lth', lithology: 'not reported' },
      { config_section: 'lth', lithology: 'sandstone', lith_type: 'siliciclastic' },
      { config_section: 'lth', lithology: 'gypsum', lith_type: 'evaporite' },
      { config_section: 'env', environment: 'dune' },
    ],
  );

describe('a snapshot of the rocks', () => {
  it('keeps each collection once, in number order, and none that has no place', () => {
    const snap = snapshot();
    expect(snap.license).toBe('Creative Commons CC0');
    expect(snap.collections.map((c) => c[0])).toEqual([9, 31170, 67219]);
    expect(snap.classes).toEqual(['terrestrial', 'lacustrine', 'marine']);
  });

  it('says of a collection what the database says: its rocks, their adjectives, its environment and its classes', () => {
    const rows = rockRows(snapshot());
    expect(rows[1]).toMatchObject({
      collection: 31170,
      lat: -4,
      lng: -43,
      max_ma: 121.4,
      min_ma: 113.2,
      environment: 'lacustrine indet.',
      formation: 'Codo',
      lithology: '"shale"',
      lithology_adjectives: 'yellow,desiccation cracks',
      minor_lithology: 'calcareous',
      lithology2: 'gypsum',
      environment_classes: 'terrestrial, lacustrine',
      measured_ages: '',
    });
    // A collection the service puts in two classes of the two realms has both.
    expect(rows[2]).toMatchObject({ collection: 67219, tectonic_setting: 'rift', environment_classes: 'terrestrial, marine', lithology2_adjectives: 'planar lamination,red' });
    expect(rows[0]).toMatchObject({ collection: 9, lithology: 'not reported', environment_classes: 'marine' });
  });

  it('keeps an age measured for a collection, with its uncertainty, unit and method', () => {
    const snap = snapshot();
    expect(snap.ages.map((a) => [a[0], a[1], a[2], a[3], snap.words[a[4]], snap.words[a[5]]])).toEqual([
      [67219, 0, 118.2, 0.4, 'Ma', 'U/Pb'],
      [67219, 1, 7700, null, 'YBP', '14C'],
    ]);
    expect(rockRows(snap)[2].measured_ages).toBe('direct 118.2 ± 0.4 Ma (U/Pb); oldest 7700 YBP (14C)');
  });

  it('keeps the type the database\'s own vocabulary gives a lithology', () => {
    const snap = snapshot();
    expect(snap.lithologies.map(([l, t]) => [snap.words[l], snap.words[t]])).toEqual([
      ['sandstone', 'siliciclastic'],
      ['gypsum', 'evaporite'],
    ]);
  });
});

describe('a correction of a collection', () => {
  const spec: RowsSpec = {
    kind: 'sample',
    key: 'coll:{collection}',
    claims: {
      depositional_environment: { column: 'environment' },
      lithology: { column: 'lithology', none: ['not reported'] },
      location: { column: ['lat', 'lng'], as: 'point' },
      date: { column: ['max_ma', 'min_ma'], as: 'ma-range' },
    },
  };

  it('is written into its own row, and leaves the others as they were', () => {
    const snap = snapshot();
    const out = correctRocks(
      snap,
      spec,
      new Map([
        [
          'coll:9',
          [
            { prop: 'depositional_environment', value: 'lagoonal' },
            { prop: 'location', value: { lat: 21.5, lon: 11.5 } },
            { prop: 'date', value: { lo: '121 Ma', hi: '120 Ma' } },
          ],
        ],
      ]),
    );
    const rows = rockRows(out);
    expect(rows[0]).toMatchObject({ collection: 9, environment: 'lagoonal', lat: 21.5, lng: 11.5, max_ma: 121, min_ma: 120, lithology: 'not reported' });
    expect(rows[1]).toEqual(rockRows(snap)[1]);
    // The snapshot it was made from is untouched.
    expect(rockRows(snap)[0]).toMatchObject({ environment: 'marine indet.', lat: 20 });
  });

  it('gives back the snapshot itself where no overlay names a row of it', () => {
    const snap = snapshot();
    expect(correctRocks(snap, spec, new Map())).toBe(snap);
    expect(correctRocks(snap, spec, new Map([['coll:404', [{ prop: 'lithology', value: 'chalk' }]]]))).toBe(snap);
  });
});
