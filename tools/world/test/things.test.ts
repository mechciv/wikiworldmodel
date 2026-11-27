// The things of lists (docs/plans/ENTITIES.md, steps 2 to 5): a row of a list is a thing known by its scheme's id, two
// snapshots of one catalogue are one thing, a record that names a thing's id is it, and nothing is joined by a name
// alone: two catalogues are joined where a name, a rank and the trees above them agree.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chunkOf, dirOf, matchHits, shardForText, shardKey, thingPagePath, thingSearchDirPath, thingSearchPath, thingTreePath, type ThingChunk, type ThingShard, type ThingTreeChunk } from '../../../core/things.ts';
import { buildThings, SHARD_CAP, splitsOf } from '../src/build/things.ts';
import type { RowsSpec, Table } from '../src/tables.ts';
import { identity, matches, thingsOf, type List } from '../src/things.ts';
import { validateWorld } from '../src/validate/index.ts';
import { loadWorld, type Entity, type Field, type World } from '../src/world.ts';

const TAXA: RowsSpec & { scheme: string } = {
  kind: 'taxon',
  key: 'txn:{no}',
  scheme: 'pbdb',
  parent: { key: 'txn:{parent}', rel: 'descends-from' },
  claims: { name: { column: 'name', as: 'text', lang: 'la' }, taxon_rank: { column: 'rank' }, start: { column: ['first_max', 'first_min'], as: 'ma-range' } },
};
/** A list of a real dataset of the world, its rows written here: the build needs its source record, not its file. */
function list(dataset: string, spec: RowsSpec & { scheme: string }, rows: Record<string, unknown>[], id = `field:test/${dataset.slice(4)}`): List {
  const table: Table = { dataset, field: id, spec, rows: new Map(rows.map((r, i) => [spec.key.replace(/\{([^}]+)\}/g, (_, c: string) => (c === '#' ? String(i) : String(r[c] ?? ''))), r])) };
  return { field: { id, title: `The rows of ${dataset}`, file: 'fields/test.yaml' } as Field, spec, dataset, table, props: Object.keys(spec.claims) };
}
const land = list('src:pbdb-land-2026-11-05', TAXA, [
  { no: 1, name: 'Dinosauria', rank: 'unranked clade', parent: 0, first_max: 237, first_min: 228 },
  { no: 2, name: 'Tyrannosaurus', rank: 'genus', parent: 1, first_max: 83.6, first_min: 72.2 },
  { no: 3, name: 'Tyrannosaurus rex', rank: 'species', parent: 2, first_max: 72.2, first_min: 66 },
  { no: 4, name: 'Unplaced', rank: 'genus', parent: 999, first_max: 10, first_min: 5 },
]);
const sea = list('src:pbdb-sea-2026-11-06', TAXA, [
  { no: 2, name: 'Tyrannosaurus', rank: 'genus', parent: 1, first_max: 83.6, first_min: 72.2 },
  { no: 5, name: 'Mosasaurus', rank: 'genus', parent: 0, first_max: 72.1, first_min: 66 },
]);
const LANGS: RowsSpec & { scheme: string } = {
  kind: 'language',
  key: '{Glottocode}',
  scheme: 'glottolog',
  parent: { key: ['{Language_ID}', '{Family_ID}'], rel: 'member-of' },
  same_as: { 'iso639-3': 'ISO639P3code' },
  claims: { name: { column: 'Name', as: 'text' }, language_level: { column: 'Level' } },
};
const langs = list('src:glottolog-5.3', LANGS, [
  { Glottocode: 'indo1319', Name: 'Indo-European', Level: 'family', Family_ID: '', Language_ID: '', ISO639P3code: '' },
  { Glottocode: 'stan1293', Name: 'English', Level: 'language', Family_ID: 'indo1319', Language_ID: '', ISO639P3code: 'eng' },
  { Glottocode: 'york1234', Name: 'Yorkshire', Level: 'dialect', Family_ID: 'indo1319', Language_ID: 'stan1293', ISO639P3code: '' },
]);

const entity = (id: string, over: Partial<Entity> = {}): Entity => ({ id, kind: 'taxon', phases: [], claims: [], relations: [], file: `entities/${id}.yaml`, ...over });

describe('the things of lists', () => {
  const t = thingsOf([land, sea, langs]);

  it('are the rows of every list, known by the scheme and the key their dataset gives them', () => {
    expect([...t.things.keys()].sort()).toEqual(['glottolog:indo1319', 'glottolog:stan1293', 'glottolog:york1234', 'pbdb:txn:1', 'pbdb:txn:2', 'pbdb:txn:3', 'pbdb:txn:4', 'pbdb:txn:5']);
    expect(t.schemes).toEqual(new Map([['pbdb', 'taxon'], ['glottolog', 'language']]));
  });

  it('are one thing where two snapshots of one catalogue have the same row, with a row from each', () => {
    const rex = t.things.get('pbdb:txn:2')!;
    expect(rex.rows.map((r) => r.list)).toEqual([0, 1]);
    expect(rex.label).toBe('Tyrannosaurus');
  });

  it('hang from the first row their templates name that the list has, and are roots where none does', () => {
    expect(t.things.get('pbdb:txn:3')!.parent).toBe('pbdb:txn:2');
    expect(t.things.get('pbdb:txn:1')!.parent).toBeUndefined();
    expect(t.things.get('pbdb:txn:4')!.parent).toBeUndefined();
    expect(t.things.get('glottolog:york1234')!.parent).toBe('glottolog:stan1293');
    expect(t.things.get('glottolog:stan1293')!.parent).toBe('glottolog:indo1319');
    expect(t.things.get('glottolog:stan1293')!.same_as).toEqual({ 'iso639-3': 'eng' });
  });
});

describe('one identity across records and lists', () => {
  const t = thingsOf([land, sea, langs]);
  const world = {
    entities: [
      entity('life/taxa/tyrannosaurus', { same_as: { pbdb: 'txn:2' } }),
      entity('civilization/languages/english', { kind: 'language', same_as: { 'iso639-3': 'eng' } }),
      // Named like a thing of a list, and naming no id of it: not that thing.
      entity('life/taxa/mosasaurus'),
      entity('civilization/artefacts/obelisk', { kind: 'artefact', same_as: { wikidata: 'Q1' } }),
      entity('rome/ohm/way-1', { kind: 'monument/obelisk', same_as: { ohm: 'way/1', wikidata: 'Q1' }, imported: 'src:ohm-rome-2026-11-01' }),
    ],
    overlays: [],
  } as unknown as World;
  const id = identity(world, t);

  it('makes a thing the record that names its id, by its own scheme or another that its row gives', () => {
    expect(id.record.get('pbdb:txn:2')).toBe('life/taxa/tyrannosaurus');
    expect(id.record.get('glottolog:stan1293')).toBe('civilization/languages/english');
    expect(id.rowsOf.get('life/taxa/tyrannosaurus')).toEqual(['pbdb:txn:2']);
  });

  it('never joins by a name alone', () => {
    expect(id.record.get('pbdb:txn:5')).toBeUndefined();
  });

  it('finds a record an import made as the written record that gives an id it gives', () => {
    expect(id.same.get('rome/ohm/way-1')).toBe('civilization/artefacts/obelisk');
    expect(id.same.has('civilization/artefacts/obelisk')).toBe(false);
  });
});

describe('two catalogues of one kind', () => {
  // The fossils' catalogue, and a catalogue of names that says its taxa are the fossils' where name, rank and tree agree.
  const fossils = list('src:pbdb-land-2026-11-05', TAXA, [
    { no: 1, name: 'Life', rank: 'unranked clade', parent: 0 },
    { no: 2, name: 'Dinosauria', rank: 'unranked clade', parent: 1 },
    { no: 3, name: 'Tyrannosaurus', rank: 'genus', parent: 2, first_max: 83.6, first_min: 72.2 },
    { no: 4, name: 'Tyrannosaurus rex', rank: 'species', parent: 3, first_max: 72.2, first_min: 66 },
    { no: 5, name: 'Morus', rank: 'genus', parent: 6 },
    { no: 6, name: 'Sulidae', rank: 'family', parent: 1 },
    { no: 7, name: 'Felidae', rank: 'family', parent: 1 },
    { no: 8, name: 'Panthera', rank: 'genus', parent: 7 },
  ]);
  const NAMES: RowsSpec & { scheme: string } = {
    kind: 'taxon',
    key: '{ID}',
    scheme: 'col',
    parent: { key: '{parentID}', rel: 'descends-from' },
    match: { scheme: 'pbdb', by: ['name', 'taxon_rank'] },
    claims: { name: { column: 'scientificName', as: 'text', lang: 'la' }, taxon_rank: { column: 'rank' }, authorship: { column: 'authorship' } },
  };
  const names = list('src:col-2026-11-11', NAMES, [
    // At the top of its list, with nothing above it to agree or disagree.
    { ID: 'A', parentID: '', scientificName: 'Dinosauria', rank: 'unranked clade' },
    { ID: 'B', parentID: 'A', scientificName: 'Tyrannosaurus', rank: 'genus', authorship: 'Osborn, 1905' },
    { ID: 'C', parentID: 'B', scientificName: 'Tyrannosaurus rex', rank: 'species', authorship: 'Osborn, 1905' },
    // The mulberries, which share a name with the gannets: their parents disagree.
    { ID: 'E', parentID: '', scientificName: 'Moraceae', rank: 'family' },
    { ID: 'D', parentID: 'E', scientificName: 'Morus', rank: 'genus', authorship: 'L.' },
    { ID: 'G', parentID: '', scientificName: 'Felidae', rank: 'family' },
    // Two of a name and rank in one list: neither is joined.
    { ID: 'F', parentID: 'G', scientificName: 'Panthera', rank: 'genus', authorship: 'Oken, 1816' },
    { ID: 'F2', parentID: 'G', scientificName: 'Panthera', rank: 'genus', authorship: 'Pocock, 1916' },
    { ID: 'H', parentID: 'F', scientificName: 'Panthera leo', rank: 'species' },
  ]);
  const t = thingsOf([fossils, names]);
  const world = { entities: [], overlays: [] } as unknown as World;
  const id = identity(world, t);

  it('are joined where one thing of each has the name and rank, and the parent of one is above the other', () => {
    expect(matches([fossils, names]).map(([a, b]) => `${a}=${b}`).sort()).toEqual(['col:A=pbdb:txn:2', 'col:B=pbdb:txn:3', 'col:C=pbdb:txn:4', 'col:G=pbdb:txn:7']);
    expect(id.also.get('col:B')).toEqual(['pbdb:txn:3']);
    expect(id.matched.get('pbdb:txn:3')).toEqual(['col:B']);
  });

  it('are not joined where the trees disagree, nor where a name and rank are two things in one list', () => {
    expect(id.also.has('col:D')).toBe(false);
    expect(id.also.has('col:F')).toBe(false);
    expect(id.also.has('pbdb:txn:8')).toBe(false);
  });

  it("are found once, as the thing of the list the other is matched to, and hang where it does with both lists' children", async () => {
    expect(id.face.get('col:B')).toBe('pbdb:txn:3');
    const b = buildThings(await loadWorld(), t, id, (x) => x);
    const find = (text: string) => {
      const key = shardForText(text, { split: b.index.split, shards: b.shards });
      return key ? matchHits((JSON.parse(b.files.get(thingSearchPath(key))!) as ThingShard).entries, text).map((e) => e[0]) : [];
    };
    expect(find('Tyrannosaurus rex')).toEqual(['pbdb:txn:4']);
    expect(find('Morus').sort()).toEqual(['col:D', 'pbdb:txn:5']);
    const kids = (x: string) => (JSON.parse(b.files.get(thingTreePath(chunkOf(x, b.index.treeChunks)))!) as ThingTreeChunk).children[x]?.map((k) => k[0]) ?? [];
    expect(kids('pbdb:txn:3')).toEqual(['pbdb:txn:4']);
    expect(kids('pbdb:txn:7').sort()).toEqual(['col:F', 'col:F2', 'pbdb:txn:8']);
    const page = (x: string) => (JSON.parse(b.files.get(thingPagePath(chunkOf(x, b.index.chunks)))!) as ThingChunk).things[x];
    expect(page('col:B')).toMatchObject({ a: ['pbdb:txn:3'], am: ['pbdb:txn:3'] });
  });
});

describe("the build's files of the things", () => {
  let world: World;
  beforeAll(async () => {
    world = await loadWorld();
  });
  const t = thingsOf([land, sea, langs]);
  const labels = (x: string) => ({ 'life/taxa/tyrannosaurus': 'Tyrannosaurus' })[x] ?? x;

  it('keep every thing in the chunk of its id, and open a thing a record is as the record', () => {
    const id = identity({ entities: [entity('life/taxa/tyrannosaurus', { same_as: { pbdb: 'txn:2' } })], overlays: [] } as unknown as World, t);
    const b = buildThings(world, t, id, labels);
    for (const x of t.things.keys()) {
      const chunk = JSON.parse(b.files.get(thingPagePath(chunkOf(x, b.index.chunks)))!) as ThingChunk;
      expect(chunk.things[x], x).toBeDefined();
    }
    const rex = (JSON.parse(b.files.get(thingPagePath(chunkOf('pbdb:txn:2', b.index.chunks)))!) as ThingChunk).things['pbdb:txn:2'];
    expect(rex).toMatchObject({ r: 'life/taxa/tyrannosaurus', rl: 'Tyrannosaurus', o: [[1, expect.any(Array)]], p: 'pbdb:txn:1', pn: 'Dinosauria' });
  });

  it("find a thing by any word of its name, but not a thing a record is: that is found as the record", () => {
    const id = identity({ entities: [entity('life/taxa/tyrannosaurus', { same_as: { pbdb: 'txn:2' } })], overlays: [] } as unknown as World, t);
    const b = buildThings(world, t, id, labels);
    const find = (text: string) => {
      const key = shardForText(text, { split: b.index.split, shards: b.shards });
      return key ? (JSON.parse(b.files.get(thingSearchPath(key))!) as ThingShard).entries.map((e) => e[0]) : [];
    };
    expect(find('rex')).toContain('pbdb:txn:3');
    expect(find('Yorkshire')).toEqual(['glottolog:york1234']);
    expect(find('Tyrannosaurus')).not.toContain('pbdb:txn:2');
  });

  it('hang the things no record is from their parents, and open a record of the tree onto them', () => {
    const id = identity({ entities: [entity('life/taxa/tyrannosaurus', { same_as: { pbdb: 'txn:2' } })], overlays: [] } as unknown as World, t);
    const b = buildThings(world, t, id, labels);
    const kids = (x: string) => (JSON.parse(b.files.get(thingTreePath(chunkOf(x, b.index.treeChunks)))!) as ThingTreeChunk).children[x] ?? [];
    expect(kids('pbdb:txn:2').map((k) => k[0])).toEqual(['pbdb:txn:3']);
    // A record's own thing is in the records' tree, and not among its parent's listed children.
    expect(kids('pbdb:txn:1').map((k) => k[0])).toEqual([]);
    expect(b.listedChildren.get('life/taxa/tyrannosaurus')).toEqual({ thing: 'pbdb:txn:2', count: 1 });
  });

  it('keep the shortest names in a shard of a word too many share, and count them all', () => {
    const many = list('src:glottolog-5.3', LANGS, [
      ...Array.from({ length: SHARD_CAP + 50 }, (_, i) => ({ Glottocode: `d${String(i).padStart(5, '0')}`, Name: `Variety ${'x'.repeat(i % 9)}${i}`, Level: 'dialect', Family_ID: '', Language_ID: '', ISO639P3code: '' })),
      { Glottocode: 'shrt0001', Name: 'Variety', Level: 'language', Family_ID: '', Language_ID: '', ISO639P3code: '' },
    ]);
    const tt = thingsOf([many]);
    const b = buildThings(world, tt, identity({ entities: [], overlays: [] } as unknown as World, tt), labels);
    const key = shardForText('Variety', { split: b.index.split, shards: b.shards })!;
    expect(b.shards[key]).toBe(SHARD_CAP + 51);
    const kept = (JSON.parse(b.files.get(thingSearchPath(key))!) as ThingShard).entries;
    expect(kept.length).toBe(SHARD_CAP);
    expect(kept.map((e) => e[0])).toContain('glottolog:shrt0001');
    expect(Math.max(...kept.map((e) => e[1].length))).toBeLessThanOrEqual(Math.min(...[...tt.things.values()].filter((x) => !kept.some((e) => e[0] === x.id)).map((x) => x.label.length)));
    // The counts are in the directories, not the index, which grows with the vocabulary and not the things.
    expect(JSON.parse(b.files.get(thingSearchDirPath(dirOf(key)))!).shards[key]).toBe(SHARD_CAP + 51);
    expect(b.index).not.toHaveProperty('shards');
  });

  it('cut a shard finer where too many words begin alike, and read it by the same rule', () => {
    const words = Array.from({ length: 30 }, (_, i) => [`form${String.fromCharCode(97 + (i % 26))}${i}`]);
    words.push(['fo'], ['tyrannosaurus']);
    const split = splitsOf(words, 10);
    expect([...split].sort()).toEqual(['fo', 'for', 'form']);
    expect(shardKey('forma0', split)).toBe('forma');
    expect(shardKey('fo', split)).toBe('fo$');
    expect(shardKey('tyrannosaurus', split)).toBe('ty');
  });
});

describe('references to the things of lists', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  const SOURCE = `id: src:test/report\ntype: publication\nkind: measurement\ncitation: A fixture source, not a real publication.\n`;
  async function check(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'wikiworldmodel-things-'));
    dirs.push(root);
    for (const [path, text] of Object.entries({ 'sources/report.yaml': SOURCE, ...files })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return (await validateWorld(await loadWorld(root), { frames: false, things: thingsOf([land, sea, langs]) })).issues;
  }
  const cite = `source: { ref: src:test/report, loc: p. 1 }`;

  it("may stand where a record does, and are held to their list's kind", async () => {
    const issues = await check({
      'entities/a.yaml': `id: test/rex\nkind: taxon\nauthor: fixture\nrelations:\n  parent: { rel: descends-from, to: "pbdb:txn:2", ${cite} }\n`,
      'entities/b.yaml': `id: test/wrong\nkind: taxon\nauthor: fixture\nrelations:\n  parent: { rel: descends-from, to: "glottolog:stan1293", ${cite} }\n`,
    });
    expect(issues.filter((i) => i.level === 'error').map((i) => `${i.file} ${i.message}`)).toEqual(['entities/b.yaml "descends-from" points to a taxon, not a language']);
  });

  it('are known by the ids their dataset gives them, never by their place in its file', async () => {
    const field = (rows: string) => `id: field:test/places\ntype: field\ntitle: Places\ngrid: { kind: rows }\ntime: { lo: 1950 CE, hi: 2100 CE }\ndata: { from: src:natural-earth-places-5.1.2, as: places }\nbasis: evidence\nspread: unknown\nrows:\n${rows}`;
    const issues = await check({
      'fields/a.yaml': field(`  kind: settlement\n  key: "{#}"\n  scheme: test-places\n  claims:\n    name: { column: name, as: text }\n`),
      'fields/b.yaml': field(`  kind: settlement\n  key: "{ne_id}"\n  parent: { key: "{parent}", rel: part-of }\n  claims:\n    name: { column: name, as: text }\n`).replace('field:test/places', 'field:test/other'),
    });
    expect(issues.filter((i) => i.check === 'rows').map((i) => `${i.file} ${i.where}`)).toEqual(['fields/a.yaml rows.key', 'fields/b.yaml rows.parent']);
  });

  it('give other names from a delimited table, and are matched to another list of their kind by a name and more', async () => {
    const field = (id: string, data: string, rows: string) => `id: ${id}\ntype: field\ntitle: A list\ngrid: { kind: rows }\ntime: { lo: 1950 CE, hi: 2100 CE }\ndata: ${data}\nbasis: evidence\nspread: unknown\nrows:\n${rows}`;
    const dataset = (id: string, url: string, format: string) => `  ${id}:\n    type: dataset\n    kind: compilation\n    citation: A fixture.\n    version: "1"\n    credit: A fixture\n    license: CC0-1.0\n    fetch: { url: "${url}", sha256: "${'0'.repeat(64)}", bytes: 1, format: ${format} }\n`;
    const manifest = `publish:\n  licenses: [CC0-1.0]\ndatasets:\n${dataset('src:test/names', 'https://example.org/names.zip', 'zip')}${dataset('src:test/map', 'https://example.org/map.geojson', 'json')}${dataset('src:test/taxa', 'https://example.org/taxa.csv', 'csv')}`;
    const issues = await check({
      'manifest.yaml': manifest,
      'sources/names.yaml': 'id: src:test/names\ntype: dataset\nkind: compilation\ncitation: A fixture.\n',
      // The list the good one is matched to: taxa, with names and ranks.
      'fields/taxa.yaml': field('field:test/taxa', '{ from: src:test/taxa }', `  kind: taxon\n  key: "{no}"\n  scheme: test-taxa\n  claims:\n    name: { column: name, as: text }\n    taxon_rank: { column: rank }\n`),
      // Names from a table read as it comes, and a match to a scheme of the same kind by a name and a rank: as it should be.
      'fields/good.yaml': field('field:test/good', '{ from: src:test/names, file: NameUsage.tsv }', `  kind: taxon\n  key: "{col:ID}"\n  scheme: good\n  match: { scheme: test-taxa, by: [name, taxon_rank] }\n  names:\n    - { of: "{col:parentID}", name: col:scientificName, note: synonym }\n    - { file: VernacularName.tsv, of: "{col:taxonID}", name: col:name, note: common name }\n  claims:\n    name: { column: col:scientificName, as: text }\n    taxon_rank: { column: col:rank }\n`),
      // Names from a map's GeoJSON, which is not read as it comes; a match by a rank alone, to a scheme of another kind.
      'fields/bad.yaml': field('field:test/bad', '{ from: src:test/map }', `  kind: settlement\n  key: "{ne_id}"\n  scheme: bad\n  match: { scheme: test-taxa, by: [taxon_rank, language_level] }\n  names:\n    - { of: "{ne_id}", name: namealt, note: other name }\n  claims:\n    name: { column: name, as: text }\n`),
    });
    expect(issues.filter((i) => i.check === 'rows').map((i) => `${i.file} ${i.where}: ${i.message}`)).toEqual([
      'fields/bad.yaml rows.names: other names are read from a delimited table, a csv or tsv file or a member of a zip',
      'fields/bad.yaml rows.match.scheme: the things of test-taxa are of another kind than settlement: a match joins things of one kind',
      'fields/bad.yaml rows.match.by: a match is by a name and what else must agree with it',
      'fields/bad.yaml rows.match.by: its rows give no "taxon_rank"',
      'fields/bad.yaml rows.match.by: its rows give no "language_level"',
      'fields/bad.yaml rows.match.by: field:test/taxa\'s rows give no "language_level"',
    ]);
  });

  it('warn at an id of a scheme that no list read here has', async () => {
    const issues = await check({ 'entities/a.yaml': `id: test/rex\nkind: taxon\nauthor: fixture\nrelations:\n  parent: { rel: descends-from, to: "pbdb:txn:404", ${cite} }\n` });
    expect(issues.filter((i) => i.level !== 'info')).toEqual([expect.objectContaining({ level: 'warning', check: 'refs', message: expect.stringContaining('pbdb:txn:404 is in none of the lists of pbdb read here') })]);
  });
});
