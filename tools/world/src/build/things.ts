// The build's files of the things of lists (core/things.ts; docs/plans/ENTITIES.md, steps 2 to 5): their index, the
// chunks their pages are made from, the shards search reads, and the trees' children. A thing a record is is kept with
// the record's id, so that whatever names it, a scene's taxon or a parent on another page, opens the record; and of
// things that are one thing, the one that stands for them (identity.face) is the one search finds and the tree shows.
//
// The lists may hold millions of things, so the files are made one at a time (thingFiles) and each is put as it is
// made: nothing holds them all.
import { dirOf, shardKey, thingTime, type ThingChild, type ThingEntry, type ThingList, type ThingProp, type ThingsIndex, type ThingTreeChunk, chunkOf, THINGS_INDEX, thingPagePath, thingSearchDirPath, thingSearchPath, thingTreePath, valueText, wordsOf } from '../../../../core/things.ts';
import { stableStringify } from '../util.ts';
import type { Identity, Thing, Things } from '../things.ts';
import type { World } from '../world.ts';
import { sourceRecord } from './records.ts';

/** How many things a chunk of pages holds, and a shard of search at most before it is cut by one more letter. */
export const PAGE_CHUNK = 400;
export const SHARD_LIMIT = 3000;
/**
 * How many entries a shard keeps at most. A word that more names share than this, such as a rank's marker in a plant's
 * name ("subsp."), cannot be cut finer: its shard keeps the shortest names, which a word typed alone most likely means,
 * and its count says how many there were, so that a text with a rarer word reads that word's shard instead.
 */
export const SHARD_CAP = 4000;
/** A shard is cut no finer than this many letters. */
const SHARD_DEPTH = 6;
const TREE_CHUNK = 300;
/** How many of a thing's other names its page keeps: search keeps them all. */
const PAGE_NAMES = 30;

/** The lists as the index tells them: what each is of, and how each property of its rows is known. */
export function thingLists(world: World, things: Things): ThingList[] {
  return things.lists.map((list) => {
    const kind = world.vocab.kinds[list.spec.kind];
    const source = world.source.get(list.dataset);
    const props: ThingProp[] = list.props.map((prop) => {
      const map = list.spec.claims[prop];
      const p = world.vocab.properties[prop];
      return {
        prop,
        type: p?.type ?? 'string',
        ...(p?.unit ? { unit: p.unit } : {}),
        ...(map.method ? { method: map.method, methodLabel: world.vocab.methods[map.method]?.label ?? map.method } : {}),
        basis: map.basis ?? 'evidence',
      };
    });
    const rel = list.spec.parent?.rel;
    return {
      field: list.field.id,
      dataset: list.dataset,
      scheme: list.spec.scheme,
      kind: list.spec.kind,
      kindLabel: kind?.label ?? list.spec.kind,
      name: (source as { container?: string } | undefined)?.container ?? source?.title ?? list.dataset,
      title: list.field.title,
      ...(list.field.description ? { description: list.field.description } : {}),
      sourceRecord: sourceRecord(source!),
      props,
      ...(rel ? { parentRel: rel, parentFamily: world.vocab.relations[rel]?.family ?? 'structural' } : {}),
      ...(list.spec.preferred?.length ? { preferred: list.spec.preferred } : {}),
      ...(kind?.start === 'latest' ? { startLatest: true } : {}),
      ...(kind?.end === 'latest' ? { endLatest: true } : {}),
      ...(kind?.moment ? { moment: true } : {}),
      count: list.table.rows.size,
    };
  });
}

/** A few words that tell a thing from others of its name: its rank or level, and when it was. */
export function detailOf(list: ThingList, values: unknown[]): string {
  const at = (prop: string) => {
    const i = list.props.findIndex((p) => p.prop === prop);
    return i >= 0 ? values[i] : null;
  };
  const rank = at('taxon_rank') ?? at('language_level');
  const when = at('date') ?? at('start');
  const whenText = when === null || when === undefined ? '' : valueText(when, 'time');
  return [typeof rank === 'string' ? rank : '', whenText].filter(Boolean).join(', ');
}

/** The beginnings of words a name holds, from two letters to one short of the depth, each counted once a name. */
function countBeginnings(words: string[], count: Map<string, number>, depth = SHARD_DEPTH): void {
  const seen = new Set<string>();
  for (const w of words) {
    const letters = Array.from(w);
    // Only a word longer than a beginning is cut by it: a word that is the beginning is kept in its own shard.
    for (let n = 2; n < Math.min(depth, letters.length); n++) seen.add(letters.slice(0, n).join(''));
  }
  for (const p of seen) count.set(p, (count.get(p) ?? 0) + 1);
}

/** Which beginnings are cut finer: those more than the limit of names begin a word with, each of whose shorter ones is cut. */
function splitsOfCounts(count: Map<string, number>, limit: number): Set<string> {
  const split = new Set<string>();
  const byLength = [...count.keys()].filter((p) => count.get(p)! > limit).sort((a, b) => Array.from(a).length - Array.from(b).length || (a < b ? -1 : 1));
  for (const p of byLength) {
    const letters = Array.from(p);
    let reach = true;
    for (let k = 2; k < letters.length; k++) if (!split.has(letters.slice(0, k).join(''))) reach = false;
    if (reach) split.add(p);
  }
  return split;
}

/** Which beginnings are cut finer: those that more than the limit of words begin with, to the depth allowed. */
export function splitsOf(words: string[][], limit = SHARD_LIMIT, depth = SHARD_DEPTH): Set<string> {
  const count = new Map<string, number>();
  for (const ws of words) countBeginnings(ws, count, depth);
  return splitsOfCounts(count, limit);
}

export interface ThingsBuild {
  index: ThingsIndex;
  /** each shard of search, with how many entries it would hold, uncapped */
  shards: Record<string, number>;
  files: Map<string, string>;
  /** a tree's record → the thing it is, and how many things hang from that */
  listedChildren: Map<string, { thing: string; count: number }>;
}

export interface ThingsWritten {
  index: ThingsIndex;
  shards: Record<string, number>;
  files: number;
  listedChildren: Map<string, { thing: string; count: number }>;
}

/** The files of the things, all in memory: for a world small enough to hold them, as the tests' are. */
export function buildThings(world: World, things: Things, identity: Identity, labelOf: (id: string) => string): ThingsBuild {
  const files = new Map<string, string>();
  const gen = thingFiles(world, things, identity, labelOf);
  let r = gen.next();
  for (; !r.done; r = gen.next()) files.set(r.value[0], r.value[1]);
  return { index: r.value.index, shards: r.value.shards, files, listedChildren: r.value.listedChildren };
}

/**
 * The files of the things, one at a time, each as a path and its text: the pages' chunks, search's shards, the trees'
 * children and, last, the index. Returns what the index says and which records open onto things of the lists.
 */
export function* thingFiles(world: World, things: Things, identity: Identity, labelOf: (id: string) => string): Generator<[string, string], ThingsWritten> {
  const lists = thingLists(world, things);
  // The thing that stands for a thing, and what opens for it: the record that is it, or else that thing.
  const faceOf = (id: string) => identity.face.get(id) ?? id;
  const opens = (id: string) => identity.record.get(id) ?? faceOf(id);
  const labels = new Map<string, string>();
  const labelOfThing = (id: string) => {
    const r = identity.record.get(id);
    if (r) return labelOf(r);
    let l = labels.get(id);
    if (l === undefined) labels.set(id, (l = things.things.get(id)?.label ?? id));
    return l;
  };

  // One walk over the things: which chunk keeps each page, whose children each is, and what search finds it by.
  const chunks = Math.max(1, Math.ceil(things.things.size / PAGE_CHUNK));
  const inChunk: string[][] = Array.from({ length: chunks }, () => []);
  const children = new Map<string, string[]>();
  // Each entry of search as its text in a shard, and the name it is found by, whose words are read again for its shards.
  const hitJson: string[] = [];
  const hitLabel: string[] = [];
  const count = new Map<string, number>();
  const hit = (id: string, label: string, list: number, detail: string, other = false) => {
    const words = [...new Set(wordsOf(label))];
    if (!words.length) return;
    hitJson.push(JSON.stringify(other ? [id, label, list, detail, 1] : [id, label, list, detail]));
    hitLabel.push(label);
    countBeginnings(words, count);
  };
  for (const t of things.things.values()) {
    inChunk[chunkOf(t.id, chunks)].push(t.id);
    const record = identity.record.get(t.id);
    const own = faceOf(t.id) === t.id;
    // A thing hangs from the one that stands for its parent; a thing a record is is in the records' tree, and a thing
    // another stands for hangs where that one does.
    if (t.parent && !record && own) {
      const up = faceOf(t.parent);
      let list = children.get(up);
      if (!list) children.set(up, (list = []));
      list.push(t.id);
    }
    const first = t.rows[0];
    // Search finds a thing a record is as the record, in search.json, and a thing another stands for as that one.
    // A thing with no name is known by its id, which search does not find it by.
    if (!record && own && t.label !== t.id) hit(t.id, t.label, first.list, detailOf(lists[first.list], first.values));
    // Its other names find what opens for it.
    if (t.names.length) {
      const target = opens(t.id);
      const of = record ? labelOf(record) : labelOfThing(target);
      for (const n of t.names) if (n.text !== t.label) hit(target, n.text, first.list, `${n.note} of ${of}`, true);
    }
  }

  // Pages.
  for (let c = 0; c < chunks; c++) {
    const page: Record<string, ThingEntry> = {};
    for (const id of inChunk[c]) page[id] = entryOf(things.things.get(id)!);
    yield [thingPagePath(c), stableStringify({ things: page })];
    inChunk[c] = [];
  }

  function entryOf(t: Thing): ThingEntry {
    const [first, ...rest] = t.rows;
    const e: ThingEntry = { k: t.key, l: first.list, n: t.label, v: first.values };
    if (rest.length) e.o = rest.map((r) => [r.list, r.values]);
    if (t.parent) {
      e.p = t.parent;
      e.pn = labelOfThing(t.parent);
    }
    const kids = children.get(faceOf(t.id))?.length;
    if (kids) e.c = kids;
    if (Object.keys(t.same_as).length) e.s = t.same_as;
    const record = identity.record.get(t.id);
    if (record) {
      e.r = record;
      e.rl = labelOf(record);
    }
    const also = identity.also.get(t.id);
    if (also?.length) e.a = also;
    const matched = identity.matched.get(t.id);
    if (matched?.length) e.am = matched;
    const names = t.names.filter((n) => n.text !== t.label).slice(0, PAGE_NAMES);
    if (names.length) e.x = names.map((n) => (n.lang ? [n.text, n.note, n.lang] : [n.text, n.note]));
    return e;
  }

  // Search: every name a thing is known by, by the beginnings of its words.
  const split = splitsOfCounts(count, SHARD_LIMIT);
  count.clear();
  const shards = new Map<string, number[]>();
  for (let i = 0; i < hitJson.length; i++) {
    for (const key of new Set(wordsOf(hitLabel[i]).map((w) => shardKey(w, split)))) {
      let list = shards.get(key);
      if (!list) shards.set(key, (list = []));
      list.push(i);
    }
  }
  const shardCounts: Record<string, number> = {};
  const dirs = new Map<string, Record<string, number>>();
  for (const key of [...shards.keys()].sort()) {
    let list = shards.get(key)!;
    shardCounts[key] = list.length;
    const dir = dirOf(key);
    let d = dirs.get(dir);
    if (!d) dirs.set(dir, (d = {}));
    d[key] = list.length;
    // In the order the lists give them, which is the same in every build of the same lists; a shard too full keeps the
    // shortest names.
    if (list.length > SHARD_CAP) list = [...list].sort((a, b) => hitLabel[a].length - hitLabel[b].length || (hitLabel[a] < hitLabel[b] ? -1 : hitLabel[a] > hitLabel[b] ? 1 : a - b)).slice(0, SHARD_CAP).sort((a, b) => a - b);
    yield [thingSearchPath(key), `{"entries":[${list.map((i) => hitJson[i]).join(',')}]}`];
    shards.delete(key);
  }
  for (const [dir, counts] of [...dirs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) yield [thingSearchDirPath(dir), stableStringify({ shards: counts })];
  hitJson.length = 0;
  hitLabel.length = 0;

  // Trees: the children of each thing that has any, by the hash of its id.
  const parents = [...children.keys()].sort();
  const treeChunks = parents.length ? Math.max(1, Math.ceil(parents.length / TREE_CHUNK)) : 0;
  const inTree: string[][] = Array.from({ length: treeChunks }, () => []);
  for (const p of parents) inTree[chunkOf(p, treeChunks)].push(p);
  for (let c = 0; c < treeChunks; c++) {
    const chunk: ThingTreeChunk = { children: {} };
    for (const p of inTree[c]) {
      const kids: ThingChild[] = children.get(p)!.map((id) => {
        const t = things.things.get(id)!;
        const list = lists[t.rows[0].list];
        const rankAt = list.props.findIndex((x) => x.prop === 'taxon_rank' || x.prop === 'language_level');
        const time = thingTime(list, t.rows[0].values);
        return [id, t.label, rankAt >= 0 && typeof t.rows[0].values[rankAt] === 'string' ? (t.rows[0].values[rankAt] as string) : '', time.start.best, time.end.best, children.get(id)?.length ?? 0];
      });
      kids.sort((a, b) => (a[3] ?? Infinity) - (b[3] ?? Infinity) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : 1));
      chunk.children[p] = kids;
    }
    yield [thingTreePath(c), stableStringify(chunk)];
  }

  // The records whose things have children of no record's: the tree's nodes that open onto the lists.
  const listedChildren = new Map<string, { thing: string; count: number }>();
  for (const [record, ids] of identity.rowsOf) {
    const id = faceOf(ids[0]);
    const kids = children.get(id);
    if (kids) listedChildren.set(record, { thing: id, count: kids.length });
  }

  const index: ThingsIndex = { format: 'lightworld-things@2', lists, chunks, split: [...split].sort(), cap: SHARD_CAP, treeChunks };
  yield [THINGS_INDEX, stableStringify(index)];
  return { index, shards: shardCounts, files: chunks + Object.keys(shardCounts).length + dirs.size + treeChunks + 1, listedChildren };
}
