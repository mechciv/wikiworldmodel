// A list of millions read as it comes (docs/plans/ENTITIES.md, step 5): a table cut into only the columns asked for, a
// member of a zip read where it lies, and the rows kept by column, with the other names its field reads.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';
import { eachRow, zipMembers } from '../src/rowstream.ts';
import { ColumnRows, columnsOf, readColumns, type RowsSpec } from '../src/tables.ts';

const dir = mkdtempSync(join(tmpdir(), 'rowstream-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const file = (name: string, text: string | Uint8Array) => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};
const rows = async (path: string, format: 'tsv' | 'csv', columns: string[], member?: string) => {
  const out: string[][] = [];
  const header = await eachRow({ path, member }, format, columns, (v) => out.push(v));
  return { header, out };
};

describe('a table read as it comes', () => {
  it('cuts a tab-separated line into the columns asked for, trimmed, in their order, and skips blank lines', async () => {
    const p = file('t.tsv', '﻿id\tname\trank\textra\r\n1\t Tyrannosaurus \tgenus\tx\r\n\r\n2\tTyrannosaurus rex\tspecies\n3\tshort');
    const { header, out } = await rows(p, 'tsv', ['rank', 'id', 'missing', 'name']);
    expect(header).toEqual(['id', 'name', 'rank', 'extra']);
    expect(out).toEqual([
      ['genus', '1', '', 'Tyrannosaurus'],
      ['species', '2', '', 'Tyrannosaurus rex'],
      ['', '3', '', 'short'],
    ]);
  });

  it('reads a comma-separated field in quotes whole: its commas, its doubled quotes and its new lines', async () => {
    const p = file('t.csv', 'Glottocode,Name,Note\nstan1293,English,"spoken, widely"\nyork1234,"Yorkshire ""Tyke""","two\nlines"\n');
    const { out } = await rows(p, 'csv', ['Glottocode', 'Name', 'Note']);
    expect(out).toEqual([
      ['stan1293', 'English', 'spoken, widely'],
      ['york1234', 'Yorkshire "Tyke"', 'two\nlines'],
    ]);
  });

  it('reads a member of a zip where it lies, inflated as it is read', async () => {
    const big = ['id\tname', ...Array.from({ length: 20000 }, (_, i) => `${i}\tname ${i} ${'é'.repeat(i % 7)}`)].join('\n');
    const p = file('a.zip', zipSync({ 'NameUsage.tsv': strToU8(big), 'other.txt': strToU8('nothing') }, { level: 6 }));
    expect((await zipMembers(p)).map((m) => m.name).sort()).toEqual(['NameUsage.tsv', 'other.txt']);
    const { out } = await rows(p, 'tsv', ['name'], 'NameUsage.tsv');
    expect(out.length).toBe(20000);
    // Six two-byte letters, which a chunk of the stream may cut in half.
    expect(out[19998]).toEqual([`name 19998 ${'é'.repeat(19998 % 7)}`]);
  });
});

describe('a list kept by column', () => {
  const SPEC: RowsSpec = {
    kind: 'taxon',
    key: '{ID}',
    scheme: 'col',
    where: { status: ['accepted', 'provisionally accepted'] },
    parent: { key: '{parentID}', rel: 'descends-from' },
    names: [
      { where: { status: ['synonym'] }, of: '{parentID}', name: 'scientificName', lang: 'la', note: 'synonym' },
      { file: 'Vernacular.tsv', where: { language: 'eng' }, of: '{taxonID}', name: 'name', lang: 'en', note: 'common name' },
    ],
    claims: { name: { column: 'scientificName', as: 'text', lang: 'la' }, taxon_rank: { column: 'rank' } },
  };
  const usage = ['ID\tparentID\tstatus\tscientificName\trank\tauthorship', 'P\t\taccepted\tPanthera\tgenus\tOken', 'L\tP\taccepted\tPanthera leo\tspecies\tL.', 'S\tL\tsynonym\tFelis leo\tspecies\tL.', 'X\tQ\tsynonym\tFelis nemo\tspecies\t', 'M\tP\tmisapplied\tPanthera wrong\tspecies\t', 'O\tP\tprovisionally accepted\tPanthera onca\tspecies\t'].join('\n');
  const vernacular = ['taxonID\tname\tlanguage', 'L\tLion\teng', 'L\tLöwe\tdeu', 'O\tJaguar\teng', 'Z\tNobody\teng'].join('\n');
  const zip = file('col.zip', zipSync({ 'NameUsage.tsv': strToU8(usage), 'Vernacular.tsv': strToU8(vernacular) }));

  it('reads only the columns its field reads', () => {
    expect(columnsOf(SPEC).sort()).toEqual(['ID', 'parentID', 'rank', 'scientificName', 'status']);
  });

  it("keeps the rows its `where` chooses, and the names its other rows and files give, of the rows it keeps", async () => {
    const t = await readColumns('src:col', 'field:col', SPEC, { source: { path: zip, member: 'NameUsage.tsv' }, format: 'tsv' }, (f) => ({ source: { path: zip, member: f! }, format: 'tsv' }));
    expect([...t.rows.keys()]).toEqual(['P', 'L', 'O']);
    expect(t.rows.get('L')).toEqual({ ID: 'L', parentID: 'P', status: 'accepted', scientificName: 'Panthera leo', rank: 'species' });
    // An empty cell is no value.
    expect(t.rows.get('P')).not.toHaveProperty('parentID');
    const names = [...t.names!.text.keys()].map((i) => [(t.rows as ColumnRows).rowKeys[t.names!.at[i]], t.names!.text[i], SPEC.names![t.names!.set[i]].note]);
    // A synonym of a name the list leaves out, and a common name of none of its rows, name nothing here.
    expect(names).toEqual([
      ['L', 'Felis leo', 'synonym'],
      ['L', 'Lion', 'common name'],
      ['O', 'Jaguar', 'common name'],
    ]);
  });

  it('keeps a column of few values once, and each value of a column of many', () => {
    const many = Array.from({ length: 5000 }, (_, i) => `name ${i}`);
    const r = new ColumnRows(
      many.map((_, i) => String(i)),
      ['name', 'rank'],
      [many, { words: ['species', 'genus'], at: Uint32Array.from(many, (_, i) => (i % 3 === 0 ? 0xffffffff : i % 2)) }],
    );
    expect(r.get('4')).toEqual({ name: 'name 4', rank: 'species' });
    expect(r.get('3')).toEqual({ name: 'name 3' });
    expect(r.cell(5, 'rank')).toBe('genus');
    expect(r.size).toBe(5000);
  });
});
