import { describe, expect, it } from 'vitest';
import type { PolitiesFile, PolityRow } from '../../../core/layers.ts';
import type { SearchEntry } from '../../../core/records.ts';
import type { TerritoryFile } from '../../../core/territory.ts';
import { runsOf, searchRows } from '../src/build/searchrows.ts';

const row = (name: string, from: number, to: number, area = 100): PolityRow => ({ name, from, to, area, at: [10, 20], rings: [], row: `src:states#${encodeURIComponent(name)}@${from}` });
const file = (rows: PolityRow[]): PolitiesFile => ({ format: 'lightworld-polities@1', title: 'States', source: 'src:states', rows });
const at = (t: number) => ({ best: t, lo: t, hi: t, derived: false });
const record = (id: string, label: string, from: number, to: number): SearchEntry => ({ id, label, kind: 'polity', time: { start: at(from), end: at(to), instant: false }, located: false });
const none: TerritoryFile = { territories: [] };

describe('runsOf', () => {
  it('keeps a name as one state while it runs on, and splits it where it is out of use too long', () => {
    const runs = runsOf([row('Han', -400, -300), row('Han', -300, -230), row('Han', 120, 200)], 50);
    expect(runs.map((r) => r.map((x) => x.from))).toEqual([[-400, -300], [120]]);
  });
});

describe('searchRows', () => {
  const rows = [row('Han Dynasty', -201, -100), row('Han Dynasty', -100, 238), row('Qin', -749, -217), row('Qin Dynasty', -217, -207), row('Kush', -1000, -500), row('(Allegiance of A to B)', -300, -200)];
  const adopted = new Map([
    ['src:states#Han%20Dynasty@-201', 'people/polities/han'],
    ['src:states#Han%20Dynasty@-100', 'people/polities/han'],
    ['src:states#Qin@-749', 'people/polities/qin'],
    ['src:states#Qin%20Dynasty@-217', 'people/polities/qin'],
  ]);
  const found = { entities: [record('people/polities/han', 'Han dynasty', -201, 238), record('people/polities/qin', 'Qin', -748, -207)] };
  const out = searchRows(found, file(rows), 'polity', 50, adopted, none);

  it('finds a row a record adopts as the record, with where the row was drawn', () => {
    const han = out.entities.find((e) => e.id === 'people/polities/han')!;
    expect(han.places?.map((p) => p[0])).toEqual([-201, -100]);
    // Its label already says it, but for case.
    expect(han.names).toBeUndefined();
    expect(out.rows?.some((r) => r.label === 'Han Dynasty')).toBe(false);
  });
  it('gives a record the names of its rows, with when each was in use', () => {
    const qin = out.entities.find((e) => e.id === 'people/polities/qin')!;
    expect(qin.names).toEqual([{ text: 'Qin Dynasty', valid: [-217, -207] }]);
  });
  it('finds the rows no record adopts by their name, and leaves out relations between states', () => {
    expect(out.rows?.map((r) => [r.label, r.id, r.dataset, r.time.start.best, r.time.end.best])).toEqual([['Kush', 'src:states#Kush@-1000', 'src:states', -1000, -500]]);
  });
  it('names a record by the rows of its own territory', () => {
    const rome = record('people/polities/rome', 'Rome', -752, 1453);
    const territory = { territories: [{ subject: 'people/polities/rome', label: 'Rome', time: rome.time, claims: [{ source: 'src:states', rows: [{ name: 'Roman Republic', from: -508, to: -26, area: 1, at: [12, 42], rings: [] }, { name: 'Roman Empire', from: -26, to: 395, area: 1, at: [12, 42], rings: [] }] }] }] } as unknown as TerritoryFile;
    const named = searchRows({ entities: [rome] }, undefined, 'polity', 50, new Map(), territory).entities[0];
    expect(named.names?.map((n) => n.text)).toEqual(['Roman Republic', 'Roman Empire']);
    expect(named.places).toBeUndefined();
  });
});
