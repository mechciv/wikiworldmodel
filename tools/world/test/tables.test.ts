// Rows are claims (docs/STRUCTURE.md section 3.1): a dataset's columns read as properties by its field's mapping,
// each row keyed from its own columns, and an overlay's corrections written back into the columns the build reads.
import { describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { ClaimIndex } from '../src/claimindex.ts';
import * as manifest from '../src/manifest.ts';
import { overlayTables, type Issue } from '../src/validate/index.ts';
import type { LandSnapshot } from '../src/pbdb.ts';
import type { Field, World } from '../src/world.ts';
import { correctFossils, correctRows, fromValue, fossilRows, rowClaims, rowKey, toValue, type ColumnMap, type RowsSpec, type Table } from '../src/tables.ts';

const POLITIES: RowsSpec = {
  kind: 'polity',
  key: '{Name}@{FromYear}',
  claims: { name: { column: 'Name', as: 'text' }, start: { column: 'FromYear', as: 'year' }, end: { column: 'ToYear', as: 'year-end' } },
};

describe('a row', () => {
  it('is keyed from its own columns, or its place in the file', () => {
    expect(rowKey('{Name}@{FromYear}', { Name: 'Roman Empire', FromYear: -27 }, 5)).toBe('Roman Empire@-27');
    expect(rowKey('{#}', {}, 5)).toBe('5');
    expect(rowKey('occ:{occurrence}', { occurrence: 820351 }, 0)).toBe('occ:820351');
    expect(() => rowKey('occ:{occurrence}', {}, 1)).toThrow('missing key column occurrence');
  });

  it('reads each column as its property says, and a correction writes back what it reads', () => {
    const cases: [ColumnMap, Record<string, unknown>, unknown][] = [
      [{ column: 'Name', as: 'text' }, { Name: 'Rome' }, { en: 'Rome' }],
      [{ column: 'FromYear', as: 'year' }, { FromYear: -27 }, -26],
      [{ column: 'FromYear', as: 'year' }, { FromYear: 14 }, 14],
      [{ column: 'ToYear', as: 'year-end' }, { ToYear: -1 }, 1],
      [{ column: 'ToYear', as: 'year-end' }, { ToYear: 1453 }, 1454],
      [{ column: 'age', as: 'ma' }, { age: 66.04 }, '66.04 Ma'],
      [{ column: ['max', 'min'], as: 'ma-range' }, { max: 72.1, min: 66 }, { lo: '72.1 Ma', hi: '66 Ma' }],
      [{ column: ['lat', 'lon'], as: 'point' }, { lat: 41.9, lon: 12.5 }, { lat: 41.9, lon: 12.5, frame: 'frame:earth/present-day' }],
    ];
    for (const [map, columns, value] of cases) {
      expect(toValue(map, columns), JSON.stringify(columns)).toEqual(value);
      const back: Record<string, unknown> = {};
      fromValue(map, value, back);
      expect(toValue(map, back), JSON.stringify(columns)).toEqual(value);
    }
  });

  it('gives no claim where the dataset gives no value', () => {
    expect(toValue({ column: 'Lower_Date', as: 'year', none: [9999] }, { Lower_Date: 9999 })).toBeUndefined();
    expect(toValue({ column: 'Name', as: 'text' }, { Name: '' })).toBeUndefined();
  });

  it('converts time units and BCE years to the units the dataset stores', () => {
    const age: ColumnMap = { column: 'age', as: 'ma' };
    const columns = {};
    fromValue(age, '1.2 Ga', columns);
    expect(toValue(age, columns)).toBe('1200 Ma');
    fromValue(POLITIES.claims.start, '44 BCE', columns);
    expect(columns).toMatchObject({ FromYear: -44 });
    expect(toValue(POLITIES.claims.start, columns)).toBe(-43);
    fromValue(POLITIES.claims.end, '1 CE', columns);
    expect(columns).toMatchObject({ ToYear: -1 });
    expect(toValue(POLITIES.claims.end, columns)).toBe(1);
  });

  it('rejects an unrepresentable range before changing either column', () => {
    const map: ColumnMap = { column: ['max', 'min'], as: 'ma-range' };
    const columns = { max: 68, min: 66 };
    expect(() => fromValue(map, { ref: 'ics/maastrichtian' }, columns)).toThrow('explicit Ma bounds');
    for (const v of [{ lo: '120 ka' }, { lo: '80 ka', hi: '120 ka' }, { mean: '120 ka', sd: '1 kyr' }, 'unknown']) {
      expect(() => fromValue(map, v, columns)).toThrow();
      expect(columns).toEqual({ max: 68, min: 66 });
    }
  });

  it('makes claims that cite the dataset at the row', () => {
    const table: Table = { dataset: 'src:test/states', field: 'field:test/states', spec: POLITIES, rows: new Map([['Rome@-27', { Name: 'Rome', FromYear: -27, ToYear: 14 }]]) };
    expect(rowClaims(table, 'Rome@-27')).toEqual([
      { prop: 'name', value: { en: 'Rome' }, source: { ref: 'src:test/states', loc: 'row Rome@-27' }, basis: 'evidence', method: undefined },
      { prop: 'start', value: -26, source: { ref: 'src:test/states', loc: 'row Rome@-27' }, basis: 'evidence', method: undefined },
      { prop: 'end', value: 15, source: { ref: 'src:test/states', loc: 'row Rome@-27' }, basis: 'evidence', method: undefined },
    ]);
  });
});

describe('corrections', () => {
  it('are written into a copy of the rows they name, and no other', () => {
    const rows = [
      { Name: 'Rome', FromYear: -27, ToYear: 14 },
      { Name: 'Carthage', FromYear: -500, ToYear: -146 },
    ];
    const { keys, rows: out, changed } = correctRows(POLITIES, rows, new Map([['Carthage@-500', [{ prop: 'end', value: -145 }]]]));
    expect(keys).toEqual(['Rome@-27', 'Carthage@-500']);
    expect(out[0]).toBe(rows[0]);
    expect(out[1]).toEqual({ Name: 'Carthage', FromYear: -500, ToYear: -147 });
    expect(rows[1].ToYear).toBe(-146);
    expect([...changed]).toEqual([[1, ['end']]]);
  });

  it('give a fossil corrected in place or age a site of its own, and a corrected name the taxon of that name', () => {
    const snap: LandSnapshot = {
      format: 'lightworld-pbdb-land@1',
      snapshot: '2026-11-05',
      license: 'CC0',
      query: { occurrences: '', taxa: '' },
      words: ['Hell Creek'],
      taxa: [[1, 'Triceratops', 0, 0, 0, null, null, null, null, 0, 0, 0, 0], [2, 'Torosaurus', 0, 0, 0, null, null, null, null, 0, 0, 0, 0]],
      sites: [[100, 47, -106, 68, 66, 0]],
      rows: [[11, 0, 1], [12, 0, 1]],
    };
    const spec: RowsSpec = { kind: 'occurrence', key: 'occ:{occurrence}', claims: { identified_as: { column: 'taxon_name' }, date: { column: ['max_ma', 'min_ma'], as: 'ma-range' }, formation: { column: 'formation' } } };
    expect(fossilRows(snap)[0]).toMatchObject({ occurrence: 11, lat: 47, max_ma: 68, taxon: 'txn:1', taxon_name: 'Triceratops', formation: 'Hell Creek' });
    const fixes = new Map([['occ:12', [{ prop: 'date', value: { lo: '120 ka', hi: '80000 BP' } }, { prop: 'identified_as', value: 'Torosaurus' }, { prop: 'formation', value: 'Corrected formation' }]]]);
    const { snap: out, unapplied } = correctFossils(snap, spec, fixes);
    expect(unapplied).toEqual([]);
    expect(out.rows).toEqual([[11, 0, 1], [12, 1, 2]]);
    expect(out.sites[1]).toEqual([100, 47, -106, 0.12, 0.08, 1]);
    expect(out.words).toEqual(['Hell Creek', 'Corrected formation']);
    expect(snap.words).toEqual(['Hell Creek']);
    expect(snap.sites).toHaveLength(1);
    expect(correctFossils(snap, spec, new Map([['occ:11', [{ prop: 'identified_as', value: 'Nobody' }]]])).unapplied).toEqual(['occ:11: the snapshot has no taxon named Nobody']);
  });
});

describe('marine occurrence tables', () => {
  it('indexes marine snapshot tuples by occurrence and refuses ambiguous row addresses', async () => {
    const id = 'src:test-sea';
    const d: manifest.Dataset = { id, type: 'dataset', kind: 'compilation', file: '', citation: '', fetch: { url: 'snapshot.json', format: 'json', sha256: 'test', bytes: 0 } };
    const field: Field = {
      id: 'field:test/sea', file: '', title: 'Sea', data: { from: id, as: 'community-sea' },
      rows: {
        kind: 'occurrence', key: 'occ:{occurrence}',
        claims: { identified_as: { column: 'taxon_name' }, date: { column: ['max_ma', 'min_ma'], as: 'ma-range' } },
      },
    };
    const world = { fields: [field], overlays: [], manifest: { datasets: { [id]: d } } } as unknown as World;
    const snap = { words: ['Shelf'], taxa: [[90, 'A'], [80, 'B']], sites: [[17, 30, 40, 68, 66, 0]], rows: [[1, 0, 90], [209, 0, 80]] };
    const dir = await mkdtemp(join(tmpdir(), 'world-sea-'));
    const file = join(dir, 'snapshot.json');
    const path = vi.spyOn(manifest, 'datasetFile').mockReturnValue(file);
    try {
      await writeFile(file, JSON.stringify(snap));
      const index = await ClaimIndex.of(world);
      expect([...index.tables.get(id)!.rows.keys()]).toEqual(['occ:1', 'occ:209']);
      expect(index.of(`${id}#occ:209`)).toMatchObject([
        { value: 'B', sources: [{ ref: id, loc: 'row occ:209' }] },
        { value: { lo: '68 Ma', hi: '66 Ma' } },
      ]);
      snap.rows.push([1, 0, 80]);
      await writeFile(file, JSON.stringify(snap));
      await expect(ClaimIndex.of(world)).rejects.toThrow('duplicate row key "occ:1"');
      const overlays = [{ dataset: id }] as World['overlays'];
      for (const [key, problem] of [['occ:{occurrence}', 'duplicate row key'], ['occ:{absent}', 'missing key column absent']]) {
        const issues: Issue[] = [];
        const fields = [{ ...field, rows: { ...field.rows!, key } }];
        const tables = await overlayTables({ ...world, overlays, fields }, issues);
        expect(tables.get(id)).toBeNull();
        expect(issues).toMatchObject([{ level: 'error', check: 'rows', where: 'rows.key', message: expect.stringContaining(problem) }]);
      }
    } finally {
      path.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
