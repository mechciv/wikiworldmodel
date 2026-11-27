// The things of lists as a build keeps them (docs/plans/ENTITIES.md, steps 2 to 5): what each step said it would be done
// when, held to the world build `npm run build:world` made.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AtlasBin, AtlasIndex } from '../../../core/atlas.ts';
import type { EntityRecord, SearchFile } from '../../../core/records.ts';
import { chunkOf, dirsForText, matchHits, shardForText, thingPagePath, thingSearchDirPath, thingSearchPath, type ThingChunk, type ThingSearchDir, type ThingShard, type ThingsIndex } from '../../../core/things.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { latestBuild } from './helpers.ts';

describe('the things of lists, as the build keeps them', () => {
  let dir_: string;
  let ts: Tileset;
  let index: ThingsIndex;
  const json = <T>(path: string) => JSON.parse(readFileSync(join(dir_, path), 'utf8')) as T;
  const chunks = new Map<number, ThingChunk>();
  const entry = (id: string) => {
    const n = chunkOf(id, index.chunks);
    if (!chunks.has(n)) chunks.set(n, json<ThingChunk>(thingPagePath(n)));
    return chunks.get(n)!.things[id];
  };
  const dir = (two: string) => {
    try {
      return json<ThingSearchDir>(thingSearchDirPath(two)).shards;
    } catch {
      return {};
    }
  };
  // As the viewer finds a text: the counts of its words' shards from their directories, then the rarest shard.
  const find = (text: string) => {
    const split = new Set(index.split);
    const key = shardForText(text, { split: index.split, shards: Object.assign({}, ...dirsForText(text, split).map(dir)) }, split);
    return key ? matchHits(json<ThingShard>(thingSearchPath(key)).entries, text, 50) : [];
  };
  /** Every shard of search, by the directories that list them. */
  const allShards = () => {
    const out: Record<string, number> = {};
    for (const f of readdirSync(join(dir_, 'things/search-dir'))) Object.assign(out, json<ThingSearchDir>(`things/search-dir/${f}`).shards);
    return out;
  };
  beforeAll(() => {
    dir_ = latestBuild();
    ts = json<Tileset>('tileset.json');
    index = json<ThingsIndex>(ts.files.things!);
  });

  it('makes more than a hundred thousand things findable from the lists the world already read', () => {
    const counts = Object.fromEntries(index.lists.map((l) => [l.field, l.count]));
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(100_000);
    expect(Object.keys(counts)).toEqual(expect.arrayContaining(['field:life/taxa-land', 'field:life/taxa-sea', 'field:earth/languages', 'field:earth/hazards']));
    expect(Object.values(allShards()).reduce((a, b) => a + b, 0)).toBeGreaterThan(100_000);
  });

  it('finds any taxon the atlas can draw, and opens a page for it, or the record that is it', () => {
    const atlas = json<AtlasIndex>(ts.files.atlas!);
    const nos = new Set<number>();
    for (const ref of atlas.bins) for (const t of json<AtlasBin>(ref.file).taxa) nos.add(t.no);
    expect(nos.size).toBeGreaterThan(1000);
    const missing = [...nos].filter((no) => !entry(`pbdb:txn:${no}`));
    expect(missing).toEqual([]);
    // One no record is, found by its name.
    const someone = [...nos].map((no) => entry(`pbdb:txn:${no}`)).find((e) => !e.r && /^[A-Z][a-z]+$/.test(e.n))!;
    expect(find(someone.n).map((h) => h[0])).toContain(`pbdb:${someone.k}`);
  });

  it('makes Tyrannosaurus one page, its record, naming its taxon in the database and what the database says of it', () => {
    expect(entry('pbdb:txn:38613')).toMatchObject({ r: 'life/taxa/tyrannosaurus', n: 'Tyrannosaurus' });
    const r = json<EntityRecord>('records/life/taxa/tyrannosaurus.json');
    expect(r.same_as).toMatchObject({ pbdb: 'txn:38613' });
    expect(r.rows?.map((x) => x.id)).toEqual(['pbdb:txn:38613', 'pbdb:txn:38613']);
    expect(r.rows?.[0].claims.find((c) => c.prop === 'taxon_rank')?.value).toBe('genus');
  });

  it('shows no thing in search twice by any id the lists or the records give', () => {
    const { entities } = json<SearchFile>(ts.files.search);
    // A record an import made that is a written one's thing names it, and search shows the written one.
    expect(entities.filter((e) => e.same).every((e) => entities.some((x) => x.id === e.same && !x.same))).toBe(true);
    // A thing a record is is found as the record, never as a thing of its list.
    const listed = new Set<string>();
    for (const key of Object.keys(allShards())) for (const [id] of json<ThingShard>(thingSearchPath(key)).entries) listed.add(id);
    const adopted = [...listed].filter((id) => entry(id)?.r);
    expect(adopted).toEqual([]);
  });

  it('finds the living by their names and their common names, a fossil taxon of the same name and tree once', () => {
    const lists = index.lists.map((l) => l.field);
    if (!lists.includes('field:life/catalogue-of-life')) return; // the Catalogue was not fetched for this build
    // The lion: the Catalogue's taxon, joined to the fossils' by its name, rank and the trees above it, stands as theirs.
    const lion = find('Panthera leo').filter((h) => h[1] === 'Panthera leo');
    expect(lion.length).toBe(1);
    expect(lion[0][0]).toMatch(/^pbdb:txn:/);
    expect(entry(lion[0][0]).am?.some((x) => x.startsWith('col:'))).toBe(true);
    // Its common name and an old name of it find it too.
    expect(find('lion').some((h) => h[0] === lion[0][0] && h[3] === 'common name of Panthera leo')).toBe(true);
    expect(find('Felis leo').some((h) => h[0] === lion[0][0])).toBe(true);
    // A living species no fossil names is a thing of the Catalogue alone, and opens its own page.
    const oak = find('Quercus alba').find((h) => h[1] === 'Quercus alba');
    expect(oak?.[0]).toBeDefined();
  });

  it('makes a record that gives a gazetteer’s id that place, with the names the gazetteer gives it', () => {
    if (!index.lists.some((l) => l.field === 'field:people/ancient-places')) return;
    const rome = json<EntityRecord>('records/places/rome.json');
    expect(rome.rows?.map((x) => x.id)).toEqual(expect.arrayContaining(['pleiades:423025', 'natural-earth:1159151593']));
    expect(rome.rows?.find((x) => x.id === 'pleiades:423025')?.names?.map((n) => n.text)).toContain('Rome');
  });

  it("finds a mountain by its name, before the species named after it by others' common names", () => {
    if (!index.lists.some((l) => l.field === 'field:earth/peaks')) return;
    const hits = find('Kilimanjaro');
    const mountain = hits.findIndex((h) => h[1] === 'Mount Kilimanjaro');
    expect(mountain).toBeGreaterThanOrEqual(0);
    expect(mountain).toBeLessThan(hits.findIndex((h) => h[4] === 1));
  });

  it('keeps every shard of search small enough to fetch as a reader types', () => {
    for (const f of readdirSync(join(dir_, 'things/search'))) expect(statSync(join(dir_, 'things/search', f)).size, f).toBeLessThan(1_000_000);
  });

  it('loads nothing at first that grows with the number of things', () => {
    const { entities } = json<SearchFile>(ts.files.search);
    // search.json holds the records, and the things of lists only through the records that are them.
    expect(entities.some((e) => /^[a-z][a-z0-9-]*:/.test(e.id))).toBe(false);
    expect(statSync(join(dir_, ts.files.search)).size).toBeLessThan(3_000_000);
    // The index of the things, which is read when first searched, grows with the vocabulary of names, not with the things.
    expect(statSync(join(dir_, ts.files.things!)).size).toBeLessThan(150_000);
  });
});
