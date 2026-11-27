// The things of lists as the build keeps them and the viewer reads them (docs/plans/ENTITIES.md, steps 2 to 4): one
// hash for where a page is, one rule for which shard a word is in, and a page made the same from the same row.
import { describe, expect, it } from 'vitest';
import { chunkOf, hashId, matchHits, nameMatches, shardForText, shardKey, splitThing, thingPage, thingTime, wordsOf, type ThingHit, type ThingList, type ThingsIndex } from './things.ts';

const SOURCE = { id: 'src:test/db', type: 'dataset', kind: 'compilation', citation: 'A fixture database.' };
const list = (over: Partial<ThingList> = {}): ThingList => ({
  field: 'field:test/taxa',
  dataset: 'src:test/db',
  scheme: 'db',
  kind: 'taxon',
  kindLabel: 'Taxon',
  name: 'The test database',
  title: 'The taxa of the test',
  sourceRecord: SOURCE,
  props: [
    { prop: 'name', type: 'text', basis: 'evidence' },
    { prop: 'taxon_rank', type: 'string', basis: 'evidence' },
    { prop: 'start', type: 'time', basis: 'evidence', method: 'stratigraphic' },
    { prop: 'end', type: 'time', basis: 'evidence', method: 'stratigraphic' },
  ],
  parentRel: 'descends-from',
  parentFamily: 'lineage',
  startLatest: true,
  endLatest: true,
  count: 2,
  ...over,
});
const index = (lists: ThingList[]): ThingsIndex => ({ format: 'lightworld-things@2', lists, chunks: 4, split: [], cap: 4000, treeChunks: 0 });

describe('a thing of a list', () => {
  it('is known by its scheme and key, and no record type is a scheme', () => {
    expect(splitThing('pbdb:txn:38613')).toEqual({ scheme: 'pbdb', key: 'txn:38613' });
    expect(splitThing('glottolog:stan1293')).toEqual({ scheme: 'glottolog', key: 'stan1293' });
    expect(splitThing('src:pbdb-land#txn:1')).toBeUndefined();
    expect(splitThing('life/taxa/tyrannosaurus')).toBeUndefined();
  });

  it('is kept in the chunk its id hashes to, the same in the build and the viewer', () => {
    // FNV-1a of "a": a fixed number, so a chunk never moves between two machines.
    expect(hashId('a')).toBe(0xe40c292c);
    for (const id of ['pbdb:txn:1', 'pbdb:txn:2', 'glottolog:stan1293']) {
      const n = chunkOf(id, 7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
      expect(chunkOf(id, 7)).toBe(n);
    }
  });

  it('lasts from the latest its first record allows to the latest its last allows, as a taxon does', () => {
    const t = thingTime(list(), [{ la: 'Tyrannosaurus' }, 'genus', { lo: '83.6 Ma', hi: '72.2 Ma' }, { lo: '72.2 Ma', hi: '66 Ma' }]);
    expect(t.instant).toBe(false);
    expect(t.start.best).toBe(t.start.hi);
    expect(t.end.best).toBe(t.end.hi);
    expect(t.start.lo).toBeLessThan(t.start.hi);
  });

  it('is a moment where its row gives a date', () => {
    const l = list({ kind: 'event/hazard', props: [{ prop: 'name', type: 'text', basis: 'evidence' }, { prop: 'date', type: 'time', basis: 'evidence' }], moment: true });
    const t = thingTime(l, [{ en: 'Etna' }, 1669]);
    expect(t.instant).toBe(true);
    expect(t.start).toEqual(t.end);
  });

  it("has a page of its row's claims, its parent, and its rows in other snapshots beside them", () => {
    const a = list();
    const b = list({ dataset: 'src:test/db2', field: 'field:test/taxa2', sourceRecord: { ...SOURCE, id: 'src:test/db2' }, preferred: ['end'] });
    const page = thingPage(index([a, b]), {
      k: 'txn:7',
      l: 0,
      n: 'Tyrannosaurus',
      v: [{ la: 'Tyrannosaurus' }, 'genus', { lo: '83.6 Ma', hi: '72.2 Ma' }, { lo: '72.2 Ma', hi: '66 Ma' }],
      o: [[1, [{ la: 'Tyrannosaurus' }, 'genus', { lo: '83.6 Ma', hi: '72.2 Ma' }, { lo: '70 Ma', hi: '66 Ma' }]]],
      p: 'db:txn:6',
      pn: 'Tyrannosaurini',
      s: { wikidata: 'Q14332' },
    });
    expect(page.id).toBe('db:txn:7');
    expect(page.thing).toEqual({ list: 'The test database', dataset: 'src:test/db', key: 'txn:7', children: 0 });
    expect(Object.keys(page.sources).sort()).toEqual(['src:test/db', 'src:test/db2']);
    // What both snapshots give alike is one claim with two sources; where they differ, two claims compete.
    const name = page.claims.filter((c) => c.prop === 'name');
    expect(name).toHaveLength(1);
    expect(name[0].sources.map((s) => s.ref)).toEqual(['src:test/db', 'src:test/db2']);
    const end = page.claims.filter((c) => c.prop === 'end');
    expect(end.map((c) => [c.competing, c.chosen, c.rank])).toEqual([
      [true, false, 'normal'],
      [true, true, 'preferred'],
    ]);
    expect(page.relations).toEqual([expect.objectContaining({ rel: 'descends-from', to: 'db:txn:6', toLabel: 'Tyrannosaurini', wanted: false })]);
    expect(page.same_as).toEqual({ db: 'txn:7', wikidata: 'Q14332' });
  });

  it("names it by its own other names and those of another list's thing that is it, and says how that was joined", () => {
    const a = list();
    const names = list({ scheme: 'col', dataset: 'src:test/names', field: 'field:test/names', sourceRecord: { ...SOURCE, id: 'src:test/names' } });
    const lion = { la: 'Panthera leo' };
    const page = thingPage(index([a, names]), { k: 'txn:9', l: 0, n: 'Panthera leo', v: [lion, 'species', null, null], am: ['col:4CGXP'], x: [['Leo leo', 'synonym', 'la']] }, [
      { k: '4CGXP', l: 1, n: 'Panthera leo', v: [lion, 'species', null, null], x: [['Felis leo', 'synonym', 'la'], ['Lion', 'common name', 'en'], ['Leo leo', 'synonym', 'la']] },
    ]);
    expect(page.thing?.names).toEqual([
      { text: 'Leo leo', note: 'synonym', lang: 'la' },
      { text: 'Felis leo', note: 'synonym', lang: 'la' },
      { text: 'Lion', note: 'common name', lang: 'en' },
    ]);
    expect(page.thing?.matched).toEqual(['col:4CGXP']);
    expect(page.same_as).toMatchObject({ db: 'txn:9', col: '4CGXP' });
  });
});

describe('search of the things', () => {
  it('reads words as words, whatever their marks and case', () => {
    expect(wordsOf('Çatalhöyük, Konya')).toEqual(['catalhoyuk', 'konya']);
    expect(nameMatches('Tyrannosaurus rex', 'rex tyr')).toBe(true);
    expect(nameMatches('Tyrannosaurus rex', 'saurus')).toBe(false);
  });

  it('keeps a word in the shard of the shortest of its beginnings not cut finer', () => {
    const split = new Set(['fo', 'for']);
    expect(shardKey('tyrannosaurus', split)).toBe('ty');
    expect(shardKey('formation', split)).toBe('form');
    expect(shardKey('fossil', split)).toBe('fos');
    expect(shardKey('for', split)).toBe('for$');
    expect(shardKey('fo', split)).toBe('fo$');
    expect(shardKey('x', split)).toBe('x');
  });

  it("reads the rarest of a text's shards, and none where a word has none", () => {
    const ix = { split: ['fo', 'for'], shards: { form: 2000, mo: 12 } };
    expect(shardForText('Morrison Formation', ix)).toBe('mo');
    expect(shardForText('Formation', ix)).toBe('form');
    expect(shardForText('Zzyzx Formation', ix)).toBeUndefined();
  });

  it('puts a name that is the text first, then one that begins with it, then the rest', () => {
    const hits: ThingHit[] = [
      ['db:3', 'Allosaurus fragilis', 0, 'species'],
      ['db:2', 'Allosaurus', 0, 'genus'],
      ['db:4', 'Allosauridae', 0, 'family'],
      ['db:5', 'Saurophaganax', 0, 'genus'],
    ];
    expect(matchHits(hits, 'allosaurus').map((h) => h[0])).toEqual(['db:2', 'db:3']);
    expect(matchHits(hits, 'allosaur').map((h) => h[0])).toEqual(['db:2', 'db:4', 'db:3']);
  });

  it("ranks a name that holds the text's words whole with one that begins with them, and a thing's own name before its others", () => {
    const hits: ThingHit[] = [
      ['col:1', 'Kilimanjaro Shrew', 5, 'common name of Crocidura monax', 1],
      ['col:2', 'Kilimanjaro Mouse Shrew', 5, 'common name of Myosorex zinki', 1],
      ['natural-earth:1', 'Mount Kilimanjaro', 2, 'mountain'],
      ['glottolog:1', 'Kilimanjaro-Taita', 1, 'family'],
      ['natural-earth:2', 'Kilimanjaroish Plains', 2, 'plain'],
    ];
    expect(matchHits(hits, 'Kilimanjaro').map((h) => h[0])).toEqual(['glottolog:1', 'natural-earth:1', 'natural-earth:2', 'col:1', 'col:2']);
  });
});
