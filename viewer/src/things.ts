// The things of lists, as the viewer reads them (core/things.ts; docs/plans/ENTITIES.md, steps 2 to 5): the index when
// first asked for, then only the chunk a search, a page or a tree needs. Nothing of it is loaded with the build.
import type { EntityRecord } from '../../core/records.ts';
import { chunkOf, dirsForText, matchHits, shardForText, splitThing, thingPage, thingPagePath, thingSearchDirPath, thingSearchPath, thingTreePath, type ThingChild, type ThingChunk, type ThingEntry, type ThingHit, type ThingList, type ThingsIndex, type ThingSearchDir, type ThingShard, type ThingTreeChunk } from '../../core/things.ts';
import type { BuildFetch } from './data.ts';

/** What an id opens: the record that is the thing, or the thing's own page. */
export type Opened = { record: string } | { page: EntityRecord; entry: ThingEntry };

export class ThingsReader {
  private index?: Promise<ThingsIndex | undefined>;
  private split?: Set<string>;
  private schemes?: Set<string>;
  private pages = new Map<number, Promise<ThingChunk>>();
  private shards = new Map<string, Promise<ThingShard>>();
  private dirs = new Map<string, Promise<ThingSearchDir>>();
  private trees = new Map<number, Promise<ThingTreeChunk>>();

  constructor(
    private io: Pick<BuildFetch, 'getJSON'>,
    /** the index's path in the build, if the build has things */
    private path: string | undefined,
  ) {}

  /** The index: the lists, and how the chunks are cut. */
  load(): Promise<ThingsIndex | undefined> {
    if (!this.path) return Promise.resolve(undefined);
    this.index ??= this.io
      .getJSON<ThingsIndex>(this.path)
      .then((ix) => {
        this.split = new Set(ix.split);
        this.schemes = new Set(ix.lists.map((l) => l.scheme));
        return ix;
      })
      .catch(() => {
        this.index = undefined;
        return undefined;
      });
    return this.index;
  }

  /** Is an id a thing's, of a scheme some list of the build is of? Known only once the index is loaded. */
  async isThing(id: string): Promise<boolean> {
    const s = splitThing(id);
    if (!s) return false;
    await this.load();
    return !!this.schemes?.has(s.scheme);
  }

  /** The list a thing is of, by the scheme of its id: the first list of that scheme. */
  async listOf(id: string): Promise<ThingList | undefined> {
    const ix = await this.load();
    const s = splitThing(id);
    return s ? ix?.lists.find((l) => l.scheme === s.scheme) : undefined;
  }

  private chunk<T>(cache: Map<string | number, Promise<T>>, key: string | number, path: string): Promise<T> {
    let p = cache.get(key);
    if (!p) {
      p = this.io.getJSON<T>(path).catch((err) => {
        cache.delete(key);
        throw err;
      });
      cache.set(key, p);
    }
    return p;
  }

  /** A thing's entry, as its chunk keeps it; undefined if no list has it. */
  async entry(id: string): Promise<ThingEntry | undefined> {
    const ix = await this.load();
    if (!ix || !(await this.isThing(id))) return undefined;
    const n = chunkOf(id, ix.chunks);
    const chunk = await this.chunk(this.pages as Map<string | number, Promise<ThingChunk>>, n, thingPagePath(n));
    return chunk.things[id];
  }

  /** What an id opens: the record that is the thing, where one is, or else its page with the rows of other lists that are it. */
  async open(id: string): Promise<Opened | undefined> {
    const ix = await this.load();
    const e = await this.entry(id);
    if (!ix || !e) return undefined;
    if (e.r) return { record: e.r };
    const others = (await Promise.all((e.a ?? []).map((x) => this.entry(x)))).filter((x): x is ThingEntry => !!x);
    return { page: thingPage(ix, e, others), entry: e };
  }

  /** The things a text finds, best first, with their lists. */
  async search(text: string, limit = 12): Promise<{ hit: ThingHit; list: ThingList }[]> {
    const ix = await this.load();
    if (!ix) return [];
    // The counts of the shards its words are in, from their directories: the rarest word narrows most.
    const dirs = await Promise.all(dirsForText(text, this.split!).map((d) => this.chunk(this.dirs as Map<string | number, Promise<ThingSearchDir>>, d, thingSearchDirPath(d)).catch(() => ({ shards: {} }))));
    const key = shardForText(text, { split: ix.split, shards: Object.assign({}, ...dirs.map((d) => d.shards)) }, this.split);
    if (!key) return [];
    const shard = await this.chunk(this.shards as Map<string | number, Promise<ThingShard>>, key, thingSearchPath(key)).catch(() => ({ entries: [] }));
    return matchHits(shard.entries, text, limit).map((hit) => ({ hit, list: ix.lists[hit[2]] }));
  }

  /** The things of a list that hang from a thing, that no record is. */
  async children(id: string): Promise<ThingChild[]> {
    const ix = await this.load();
    if (!ix?.treeChunks) return [];
    const n = chunkOf(id, ix.treeChunks);
    const chunk = await this.chunk(this.trees as Map<string | number, Promise<ThingTreeChunk>>, n, thingTreePath(n));
    return chunk.children[id] ?? [];
  }
}
