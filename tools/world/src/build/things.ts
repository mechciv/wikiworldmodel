// The build's files of the things of lists (core/things.ts; docs/plans/ENTITIES.md, steps 2 to 4): their index, the
// chunks their pages are made from, the shards search reads, and the trees' children. A thing a record is is kept with
// the record's id, so that whatever names it, a scene's taxon or a parent on another page, opens the record.
import { shardKey, thingTime, type ThingChild, type ThingChunk, type ThingEntry, type ThingHit, type ThingList, type ThingProp, type ThingsIndex, type ThingShard, type ThingTreeChunk, chunkOf, THINGS_INDEX, thingPagePath, thingSearchPath, thingTreePath, valueText, wordsOf } from '../../../../core/things.ts';
import { stableStringify } from '../util.ts';
import type { Identity, Things } from '../things.ts';
import type { World } from '../world.ts';
import { sourceRecord } from './records.ts';

/** How many things a chunk of pages holds, and a shard of search at most before it is cut by one more letter. */
export const PAGE_CHUNK = 400;
export const SHARD_LIMIT = 3000;
/** A shard is cut no finer than this many letters. */
const SHARD_DEPTH = 6;
const TREE_CHUNK = 300;

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

/** Which beginnings are cut finer: those that more than the limit of words begin with, to the depth allowed. */
export function splitsOf(words: string[][], limit = SHARD_LIMIT, depth = SHARD_DEPTH): Set<string> {
  const split = new Set<string>();
  for (let n = 2; n < depth; n++) {
    const count = new Map<string, number>();
    for (const ws of words) {
      const seen = new Set<string>();
      for (const w of ws) {
        const letters = Array.from(w);
        if (letters.length <= n) continue;
        // Only words whose shorter beginnings are all cut reach this depth.
        let reach = true;
        for (let k = 2; k < n; k++) if (!split.has(letters.slice(0, k).join(''))) reach = false;
        if (!reach) continue;
        const p = letters.slice(0, n).join('');
        if (!seen.has(p)) {
          seen.add(p);
          count.set(p, (count.get(p) ?? 0) + 1);
        }
      }
    }
    let cut = false;
    for (const [p, c] of count) if (c > limit) split.add(p), (cut = true);
    if (!cut) break;
  }
  return split;
}

export interface ThingsBuild {
  index: ThingsIndex;
  files: Map<string, string>;
  /** a tree's record → the thing it is, and how many things hang from that */
  listedChildren: Map<string, { thing: string; count: number }>;
}

/** The files of the things: the index, the pages' chunks, search's shards and the trees' children. */
export function buildThings(world: World, things: Things, identity: Identity, labelOf: (id: string) => string): ThingsBuild {
  const lists = thingLists(world, things);
  const all = [...things.things.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // How many things hang from each, of those no record is: a record's own children are in the records' tree.
  const children = new Map<string, string[]>();
  for (const t of all) {
    if (!t.parent || identity.record.has(t.id)) continue;
    let list = children.get(t.parent);
    if (!list) children.set(t.parent, (list = []));
    list.push(t.id);
  }
  const labelOfThing = (id: string) => {
    const r = identity.record.get(id);
    return r ? labelOf(r) : (things.things.get(id)?.label ?? id);
  };

  const files = new Map<string, string>();
  // Pages.
  const chunks = Math.max(1, Math.ceil(all.length / PAGE_CHUNK));
  const pages: ThingChunk[] = Array.from({ length: chunks }, () => ({ things: {} }));
  for (const t of all) {
    const [first, ...rest] = t.rows;
    const e: ThingEntry = { k: t.key, l: first.list, n: t.label, v: first.values };
    if (rest.length) e.o = rest.map((r) => [r.list, r.values]);
    if (t.parent) {
      e.p = t.parent;
      e.pn = labelOfThing(t.parent);
    }
    const kids = children.get(t.id)?.length;
    if (kids) e.c = kids;
    if (Object.keys(t.same_as).length) e.s = t.same_as;
    const record = identity.record.get(t.id);
    if (record) {
      e.r = record;
      e.rl = labelOf(record);
    }
    const also = identity.also.get(t.id);
    if (also?.length) e.a = also;
    pages[chunkOf(t.id, chunks)].things[t.id] = e;
  }
  pages.forEach((p, i) => files.set(thingPagePath(i), stableStringify(p)));

  // Search: every thing no record is, by the words of its name.
  const hits: { hit: ThingHit; words: string[] }[] = [];
  for (const t of all) {
    if (identity.record.has(t.id)) continue;
    const first = t.rows[0];
    hits.push({ hit: [t.id, t.label, first.list, detailOf(lists[first.list], first.values)], words: [...new Set(wordsOf(t.label))] });
  }
  const split = splitsOf(hits.map((h) => h.words));
  const shards = new Map<string, ThingHit[]>();
  for (const { hit, words } of hits) {
    for (const key of new Set(words.map((w) => shardKey(w, split)))) {
      let list = shards.get(key);
      if (!list) shards.set(key, (list = []));
      list.push(hit);
    }
  }
  const shardCounts: Record<string, number> = {};
  for (const [key, list] of [...shards].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    list.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : 1));
    shardCounts[key] = list.length;
    files.set(thingSearchPath(key), stableStringify({ entries: list } satisfies ThingShard));
  }

  // Trees: the children of each thing that has any, by the hash of its id.
  const parents = [...children.keys()].sort();
  const treeChunks = parents.length ? Math.max(1, Math.ceil(parents.length / TREE_CHUNK)) : 0;
  const trees: ThingTreeChunk[] = Array.from({ length: treeChunks }, () => ({ children: {} }));
  for (const p of parents) {
    const kids: ThingChild[] = children.get(p)!.map((id) => {
      const t = things.things.get(id)!;
      const list = lists[t.rows[0].list];
      const rankAt = list.props.findIndex((x) => x.prop === 'taxon_rank' || x.prop === 'language_level');
      const time = thingTime(list, t.rows[0].values);
      return [id, t.label, rankAt >= 0 && typeof t.rows[0].values[rankAt] === 'string' ? (t.rows[0].values[rankAt] as string) : '', time.start.best, time.end.best, children.get(id)?.length ?? 0];
    });
    kids.sort((a, b) => (a[3] ?? Infinity) - (b[3] ?? Infinity) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    trees[chunkOf(p, treeChunks)].children[p] = kids;
  }
  trees.forEach((c, i) => files.set(thingTreePath(i), stableStringify(c)));

  // The records whose things have children of no record's: the tree's nodes that open onto the lists.
  const listedChildren = new Map<string, { thing: string; count: number }>();
  for (const [record, ids] of identity.rowsOf) {
    const id = ids.find((x) => children.has(x));
    if (id) listedChildren.set(record, { thing: id, count: children.get(id)!.length });
  }

  const index: ThingsIndex = { format: 'lightworld-things@1', lists, chunks, shards: shardCounts, split: [...split].sort(), treeChunks };
  files.set(THINGS_INDEX, stableStringify(index));
  return { index, files, listedChildren };
}
