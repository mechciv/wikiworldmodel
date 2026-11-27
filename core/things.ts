// The things of lists (docs/plans/ENTITIES.md, steps 2 to 4). A dataset whose field gives its rows a scheme is a list
// of things: each row is the thing <scheme>:<key>, known by the id the dataset gives it, the same in every snapshot,
// as a record is known by its id. A thing is found by search, opens a page, can be referred to and hangs in a tree,
// as a record does, without a file of its own: the build keeps what its row says in chunks, and the viewer makes its
// page from them. A record that names a thing's id in `same_as` is that thing, and its page is the record's.
//
// The build writes, beside the records:
//   things/index.json          the lists, and how the rest is cut;
//   things/pages/<n>.json      the things, by the hash of their ids (chunkOf), for their pages;
//   things/search/<p>.json     search: every thing a name is known by, by the first letters of each word of it;
//   things/tree/<n>.json       the things of a list that is a tree, as the children of each, by the hash of its id.
// What the viewer loads at first is the index alone, which does not grow with the number of things.
import type { ClaimRecord, EntityRecord, RelationRecord, SourceRecord } from './records.ts';
import type { Basis, Estimate, FeatureTime } from './tileset.ts';
import { formatTimeValue, parseTime, PRESENT_YEAR, type TimeInput } from './time.ts';

export const THINGS_INDEX = 'things/index.json';
export const thingPagePath = (chunk: number) => `things/pages/${chunk}.json`;
/** A shard's file: its letters as they are where they are a-z or 0-9, and any other as its code point, _hex_, so that no host decodes a name. */
export const thingSearchPath = (prefix: string) => `things/search/${Array.from(prefix, (c) => (/[a-z0-9]/.test(c) ? c : `_${c.codePointAt(0)!.toString(16)}_`)).join('')}.json`;
export const thingTreePath = (chunk: number) => `things/tree/${chunk}.json`;

/** What a row's value is, as the vocabulary types its property: how a page writes it out. */
export type ValueType = 'time' | 'point' | 'text' | 'string' | 'quantity' | 'ref' | string;

export interface ThingProp {
  prop: string;
  type: ValueType;
  unit?: string;
  method?: string;
  methodLabel?: string;
  basis: Basis;
}

/** A list: a dataset read as things, by the field that says how. */
export interface ThingList {
  field: string;
  dataset: string;
  /** what its things are known as: <scheme>:<key> */
  scheme: string;
  kind: string;
  kindLabel: string;
  /** what a reader calls the list: the database it is of */
  name: string;
  title: string;
  description?: string;
  sourceRecord: SourceRecord;
  /** the properties its rows give, in the order of each thing's values */
  props: ThingProp[];
  /** the relation a thing has to the one it hangs from, for a list that is a tree */
  parentRel?: string;
  parentFamily?: string;
  /** a property for which this list's value is preferred over another list's, of a thing in both */
  preferred?: string[];
  /** the kind's rules for a time given as a range (kinds.yaml): shown at the latest it allows */
  startLatest?: boolean;
  endLatest?: boolean;
  moment?: boolean;
  count: number;
}

export interface ThingsIndex {
  format: 'lightworld-things@1';
  lists: ThingList[];
  /** how many chunks the pages are kept in */
  chunks: number;
  /** the shards of search, by prefix, with how many entries each holds */
  shards: Record<string, number>;
  /** prefixes of two letters too full to be one shard: cut by their third letter */
  split: string[];
  /** how many chunks the trees' children are kept in; 0 if no list is a tree */
  treeChunks: number;
}

/** One thing, as the chunk of its page keeps it. */
export interface ThingEntry {
  /** its key in its list's dataset: its id is `<scheme>:<key>` */
  k: string;
  /** its list, by its place in the index */
  l: number;
  /** its name */
  n: string;
  /** what its row says, by the list's properties in order; null where it says nothing */
  v: unknown[];
  /** its rows in the other lists of its scheme, each its list and what it says: another snapshot of one catalogue */
  o?: [list: number, values: unknown[]][];
  /** the thing it hangs from, by id, and its name */
  p?: string;
  pn?: string;
  /** how many things hang from it */
  c?: number;
  /** its ids in other schemes, as its row gives them */
  s?: Record<string, string>;
  /** the record that is this thing, by its id, and its name: its page is the record's */
  r?: string;
  rl?: string;
  /** what else is this thing: rows of other lists, by id (docs/plans/ENTITIES.md, step 4) */
  a?: string[];
}

export interface ThingChunk {
  things: Record<string, ThingEntry>;
}

/** A search entry: id, name, list, and a few words to tell it from others of its name. */
export type ThingHit = [id: string, label: string, list: number, detail: string];

export interface ThingShard {
  entries: ThingHit[];
}

/** A child in a tree: id, name, rank or level, when it began and ended (the axis's years), how many hang from it. */
export type ThingChild = [id: string, label: string, rank: string, start: number | null, end: number | null, children: number];

export interface ThingTreeChunk {
  children: Record<string, ThingChild[]>;
}

/** A thing's id: its scheme and its key. */
export const thingId = (scheme: string, key: string) => `${scheme}:${key}`;

/** The scheme and key of an id, if it is written as a thing's: scheme:key, with a scheme that is a word. */
export function splitThing(id: string): { scheme: string; key: string } | undefined {
  const m = /^([a-z][a-z0-9-]*):(.+)$/.exec(id);
  return m && !['src', 'frame', 'field', 'model', 'gen', 'tour', 'alt'].includes(m[1]) ? { scheme: m[1], key: m[2] } : undefined;
}

/** FNV-1a over the id's UTF-16 code units: the same in the build and the viewer. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The chunk an id's page (or its children) is kept in. */
export const chunkOf = (id: string, chunks: number) => (chunks > 0 ? hashId(id) % chunks : 0);

/** A name folded for matching: no marks, lower case. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The words of a name, folded. */
export const wordsOf = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * The shard a word is kept in: the shortest of its beginnings, from two letters, that is not cut finer. A word that is
 * itself a beginning cut finer has a shard of its own words alone, `<word>$`.
 */
export function shardKey(word: string, split: ReadonlySet<string>): string {
  const letters = Array.from(word);
  let n = Math.min(2, letters.length);
  while (n < letters.length && split.has(letters.slice(0, n).join(''))) n++;
  const p = letters.slice(0, n).join('');
  return split.has(p) ? `${p}$` : p;
}

/** Does a name hold every word of the text, each as the start of one of its words? */
export function nameMatches(name: string, text: string): boolean {
  const words = wordsOf(text);
  const starts = wordsOf(name);
  return words.length > 0 && words.every((w) => starts.some((x) => x.startsWith(w)));
}

/**
 * The shard to read for a text: of the shards its words are in, the one that holds fewest entries, since every hit has
 * all the words and the rarest narrows most. Undefined where some word's shard does not exist: nothing has that word.
 */
export function shardForText(text: string, index: Pick<ThingsIndex, 'split' | 'shards'>, split: ReadonlySet<string> = new Set(index.split)): string | undefined {
  const words = wordsOf(text);
  if (!words.length) return undefined;
  let best: string | undefined;
  for (const w of words) {
    const key = shardKey(w, split);
    // A word typed so far is the start of words: its shard is that of its beginning, which holds them.
    const n = index.shards[key];
    if (n === undefined) return undefined;
    if (best === undefined || n < index.shards[best]) best = key;
  }
  return best;
}

/**
 * The hits of a shard for a text, best first: a name that is the text, then one that begins with it, then the rest,
 * each in the order of the lists, then the shorter name first.
 */
export function matchHits(entries: ThingHit[], text: string, limit = 12): ThingHit[] {
  const q = wordsOf(text).join(' ');
  const rank = (h: ThingHit) => {
    const name = wordsOf(h[1]).join(' ');
    return name === q ? 0 : name.startsWith(q) ? 1 : 2;
  };
  return entries
    .filter((h) => nameMatches(h[1], text))
    .map((h) => ({ h, r: rank(h) }))
    .sort((a, b) => a.r - b.r || a.h[2] - b.h[2] || a.h[1].length - b.h[1].length || (a.h[1] < b.h[1] ? -1 : a.h[1] > b.h[1] ? 1 : 0))
    .slice(0, limit)
    .map((x) => x.h);
}

/** A value of a row in words. */
export function valueText(v: unknown, type: ValueType, unit?: string): string {
  if (v === null || v === undefined) return '';
  if (type === 'time') {
    try {
      return formatTimeValue(parseTime(v as TimeInput));
    } catch {
      return String(v);
    }
  }
  if (type === 'point' && typeof v === 'object') {
    const p = v as { lat: number; lon: number };
    const f = (x: number) => +Math.abs(x).toFixed(4);
    return `${f(p.lat)}° ${p.lat < 0 ? 'S' : 'N'}, ${f(p.lon)}° ${p.lon < 0 ? 'W' : 'E'}`;
  }
  if (type === 'text' && typeof v === 'object') return Object.values(v as Record<string, string>)[0] ?? '';
  if (typeof v === 'number') return `${v.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

const OPEN: Estimate = { best: null, lo: -Infinity, hi: Infinity, derived: false };

/** An estimate of a time as a row gives it: a range is shown at its middle, or at its latest where the kind says so. */
export function estimateOf(v: unknown, latest = false): Estimate {
  if (v === null || v === undefined) return OPEN;
  try {
    const t = parseTime(v as TimeInput);
    if (t.kind === 'instant') return { best: t.t, lo: t.t, hi: t.t, derived: false };
    if (t.kind === 'interval') {
      const best = latest && Number.isFinite(t.hi) ? t.hi : Number.isFinite(t.lo) && Number.isFinite(t.hi) ? (t.lo + t.hi) / 2 : Number.isFinite(t.lo) ? t.lo : Number.isFinite(t.hi) ? t.hi : null;
      return { best, lo: t.lo, hi: t.hi, derived: false };
    }
    if (t.kind === 'normal') return { best: t.mean, lo: t.mean - 2 * t.sd, hi: t.mean + 2 * t.sd, derived: false };
  } catch {
    // a value the page cannot place is shown as given, and dated nowhere
  }
  return OPEN;
}

/** When a thing was, from its row's date, or its start and end. */
export function thingTime(list: Pick<ThingList, 'props' | 'startLatest' | 'endLatest' | 'moment'>, values: unknown[]): FeatureTime {
  const at = (prop: string) => {
    const i = list.props.findIndex((p) => p.prop === prop);
    return i >= 0 ? values[i] : undefined;
  };
  const date = at('date');
  if (date !== undefined && date !== null) {
    const e = estimateOf(date, false);
    return { start: e, end: e, instant: true };
  }
  const start = estimateOf(at('start'), !!list.startLatest);
  // A thing still here, such as a living taxon, has no end.
  const end = estimateOf(at('end'), !!list.endLatest);
  return { start, end, instant: !!list.moment };
}

/** A thing's claims, as a record's are on its page: each sourced to its list's dataset, at its row. */
export function thingClaims(list: ThingList, entry: Pick<ThingEntry, 'k' | 'v'>, subject: string, chosen = true): ClaimRecord[] {
  const out: ClaimRecord[] = [];
  list.props.forEach((p, i) => {
    const value = entry.v[i];
    if (value === null || value === undefined) return;
    out.push({
      ref: `${subject}#${p.prop}`,
      key: p.prop,
      subject,
      sources: [{ ref: list.dataset, loc: `row ${entry.k}` }],
      basis: p.basis,
      author: 'machine:dataset',
      status: 'proposed',
      rank: list.preferred?.includes(p.prop) ? 'preferred' : 'normal',
      level: 'unchecked',
      prop: p.prop,
      value,
      valueText: valueText(value, p.type, p.unit),
      ...(p.method ? { method: p.method, methodLabel: p.methodLabel ?? p.method } : {}),
      group: `${subject}|${p.prop}`,
      competing: false,
      chosen,
    });
  });
  return out;
}

/** A sentence on what a thing is: what its list calls it, and what hangs from it. */
function summaryOf(list: ThingList, entry: ThingEntry): string {
  const i = list.props.findIndex((p) => p.prop === 'taxon_rank' || p.prop === 'language_level');
  const what = i >= 0 && typeof entry.v[i] === 'string' ? (entry.v[i] as string) : list.kindLabel.toLowerCase();
  const kids = entry.c ? ` ${entry.c.toLocaleString('en-US')} of its things hang from it.` : '';
  return `${/^[aeiou]/i.test(what) ? 'An' : 'A'} ${what} in ${list.name}: a row of the dataset, not a record written here.${kids}`;
}

/**
 * The page of a thing, as an entity's record: its row's claims, the thing it hangs from, its other ids. `others` are
 * the rows of other lists that are this thing too (step 4), whose claims stand beside its own as competing ones where
 * they differ.
 */
export function thingPage(index: ThingsIndex, entry: ThingEntry, others: ThingEntry[] = []): EntityRecord {
  const list = index.lists[entry.l];
  const id = thingId(list.scheme, entry.k);
  const sources: Record<string, SourceRecord> = { [list.dataset]: list.sourceRecord };
  const claims = thingClaims(list, entry, id);
  // Its rows in other snapshots of its catalogue, then the rows of other lists that are it.
  const rows: { l: number; k: string; v: unknown[] }[] = [...(entry.o ?? []).map(([l, v]) => ({ l, k: entry.k, v })), ...others];
  for (const o of rows) {
    const ol = index.lists[o.l];
    sources[ol.dataset] = ol.sourceRecord;
    for (const c of thingClaims(ol, o, id, false)) {
      const same = claims.find((x) => x.prop === c.prop && JSON.stringify(x.value) === JSON.stringify(c.value));
      if (same) same.sources.push(...c.sources);
      else claims.push(c);
    }
  }
  // Where two lists give a property differently, the claims compete, and the preferred one, or else the first, is chosen.
  for (const c of claims) {
    const group = claims.filter((x) => x.prop === c.prop);
    c.competing = group.length > 1;
    c.chosen = group.length === 1 || c === (group.find((x) => x.rank === 'preferred') ?? group[0]);
  }
  const relations: RelationRecord[] = [];
  if (entry.p && list.parentRel) {
    relations.push({
      ref: `${id}#parent`,
      key: 'parent',
      subject: id,
      sources: [{ ref: list.dataset, loc: `row ${entry.k}` }],
      basis: 'evidence',
      author: 'machine:dataset',
      status: 'proposed',
      rank: 'normal',
      level: 'unchecked',
      rel: list.parentRel,
      family: list.parentFamily ?? 'structural',
      to: entry.p,
      toLabel: entry.pn ?? entry.p,
      wanted: false,
    });
  }
  const basisOf = (props: string[]): Basis => list.props.find((p) => props.includes(p.prop))?.basis ?? 'evidence';
  const same_as: Record<string, string> = { [list.scheme]: entry.k, ...entry.s };
  for (const o of others) same_as[index.lists[o.l].scheme] = o.k;
  return {
    id,
    kind: list.kind,
    kindLabel: list.kindLabel,
    label: entry.n,
    names: [{ text: entry.n }],
    summary: summaryOf(list, entry),
    basis: { time: basisOf(['date', 'start', 'end']), place: basisOf(['location']), placeNow: basisOf(['location']) },
    same_as,
    phases: [],
    time: thingTime(list, entry.v),
    claims,
    relations,
    inverse: [],
    variants: [],
    derivedBy: { start: [], end: [] },
    sources,
    wanted: [],
    thing: { list: list.name, dataset: list.dataset, key: entry.k, children: entry.c ?? 0 },
  };
}

/** The axis's present, for a thing still here: a tree's lineage runs to it. */
export const THING_PRESENT = PRESENT_YEAR;
