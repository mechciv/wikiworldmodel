// The things of lists, and one identity across them (docs/plans/ENTITIES.md, steps 2 and 4). A field whose `rows:` give
// a scheme reads its dataset as a list of things: each row is the thing <scheme>:<key>. Two lists of one scheme are two
// readings of one catalogue, such as two snapshots of the Paleobiology Database, and a thing in both is one thing with a
// row in each. What is one thing across schemes and records is told by ids: a record's same_as, a row's columns that
// give another scheme's id, and an overlay that ties a row to a record. A name alone never joins two: where a list
// says what besides a name must agree (`rows.match`), the build joins a thing of it to the one thing of another scheme
// that agrees, and says so.
//
// A list may hold millions of rows (step 5), so a thing is made from its rows when it is asked for, and not kept.
import { splitThing, thingId } from '../../../core/things.ts';
import { ColumnRows, rowKey, readTable, toValue, type RowsSpec, type Table } from './tables.ts';
import type { Field, World } from './world.ts';

/** A list: a field that reads its dataset as things, and its rows by key. */
export interface List {
  field: Field;
  spec: RowsSpec & { scheme: string };
  dataset: string;
  table: Table;
  /** the properties its rows give, in the order a thing's values are kept */
  props: string[];
}

/** One row of a list, as a thing has it. */
export interface ThingRow {
  /** the list, by its place among the lists */
  list: number;
  /** what the row says, by the list's properties; null where it says nothing */
  values: unknown[];
}

/** Another name a list gives a thing: a synonym, a common name. */
export interface ThingName {
  text: string;
  /** what the name is, as the field says (rows.names) */
  note: string;
  lang?: string;
}

export interface Thing {
  id: string;
  scheme: string;
  key: string;
  /** its name: the first of its rows' that gives one */
  label: string;
  /** its rows, in the order of the lists */
  rows: ThingRow[];
  /** the thing it hangs from, by id, in its first row's list that gives one */
  parent?: string;
  /** its ids in other schemes, as its rows' columns give them */
  same_as: Record<string, string>;
  /** its other names, as its lists give them */
  names: ThingName[];
}

/** The things of the lists by id, each made from its rows when asked for. */
export interface ThingMap {
  readonly size: number;
  has(id: string): boolean;
  get(id: string): Thing | undefined;
  /** every thing's id, in the order of the lists and of their rows */
  keys(): Iterable<string>;
  values(): Iterable<Thing>;
}

export interface Things {
  lists: List[];
  /** by id */
  things: ThingMap;
  /** the schemes that lists are of, each with the kind of its first list's things (kindOf gives a thing's own) */
  schemes: Map<string, string>;
}

/** The lists of a world: its fields that give their rows a scheme, read where their datasets are here. */
export async function readLists(world: World): Promise<List[]> {
  const out: List[] = [];
  for (const field of world.fields) {
    const spec = field.rows;
    if (!spec?.scheme || !field.data) continue;
    const table = await readTable(world, field);
    if (!table) continue;
    out.push({ field, spec: spec as List['spec'], dataset: field.data.from, table, props: Object.keys(spec.claims) });
  }
  return out;
}

const textOf = (v: unknown) => (v && typeof v === 'object' ? (Object.values(v as Record<string, string>)[0] ?? '') : v === undefined || v === null ? '' : String(v));

/** The key of the row a row hangs from: the first of the list's templates that names another row of it. */
export function parentKey(list: List, key: string, columns: Record<string, unknown>): string | undefined {
  if (!list.spec.parent) return undefined;
  for (const template of [list.spec.parent.key].flat()) {
    const k = rowKey(template, columns, -1);
    if (k !== key && list.table.rows.has(k)) return k;
  }
  return undefined;
}

/** A list's other names, by the place of the row each names: where each row's start in `order`. */
interface NameIndex {
  start: Int32Array;
  order: Int32Array;
}

function nameIndex(table: Table): NameIndex | undefined {
  const names = table.names;
  if (!names || !(table.rows instanceof ColumnRows)) return undefined;
  const n = table.rows.size;
  const start = new Int32Array(n + 1);
  for (const at of names.at) start[at + 1]++;
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const fill = start.slice(0, n);
  const order = new Int32Array(names.at.length);
  names.at.forEach((at, j) => (order[fill[at]++] = j));
  return { start, order };
}

/** The things of lists, made from their rows when asked for: a list of millions is never held a thing at a time. */
class LazyThings implements ThingMap {
  private readonly bySchemes = new Map<string, number[]>();
  private readonly names: (NameIndex | undefined)[];
  private count?: number;

  constructor(private readonly lists: List[]) {
    lists.forEach((l, i) => {
      const ls = this.bySchemes.get(l.spec.scheme);
      if (ls) ls.push(i);
      else this.bySchemes.set(l.spec.scheme, [i]);
    });
    this.names = lists.map((l) => nameIndex(l.table));
  }

  get size(): number {
    if (this.count === undefined) {
      let n = 0;
      for (const _ of this.keys()) n++;
      this.count = n;
    }
    return this.count;
  }

  has(id: string): boolean {
    const s = splitThing(id);
    return !!s && (this.bySchemes.get(s.scheme) ?? []).some((li) => this.lists[li].table.rows.has(s.key));
  }

  get(id: string): Thing | undefined {
    const s = splitThing(id);
    return s ? this.make(s.scheme, s.key) : undefined;
  }

  *keys(): Iterable<string> {
    for (const [li, list] of this.lists.entries()) {
      const earlier = this.bySchemes.get(list.spec.scheme)!.filter((x) => x < li);
      for (const key of list.table.rows.keys()) {
        // A thing in an earlier list of its scheme was given there.
        if (earlier.some((x) => this.lists[x].table.rows.has(key))) continue;
        yield thingId(list.spec.scheme, key);
      }
    }
  }

  *values(): Iterable<Thing> {
    for (const id of this.keys()) yield this.get(id)!;
  }

  private make(scheme: string, key: string): Thing | undefined {
    let t: Thing | undefined;
    for (const li of this.bySchemes.get(scheme) ?? []) {
      const list = this.lists[li];
      const columns = list.table.rows.get(key);
      if (!columns) continue;
      t ??= { id: thingId(scheme, key), scheme, key, label: '', rows: [], same_as: {}, names: [] };
      const values = list.props.map((p) => toValue(list.spec.claims[p], columns) ?? null);
      t.rows.push({ list: li, values });
      if (!t.label) {
        const i = list.props.indexOf('name');
        if (i >= 0) t.label = textOf(values[i]);
      }
      if (!t.parent) {
        const k = parentKey(list, key, columns);
        if (k !== undefined) t.parent = thingId(scheme, k);
      }
      for (const [other, column] of Object.entries(list.spec.same_as ?? {})) {
        const v = columns[column];
        if (v !== undefined && v !== null && v !== '') t.same_as[other] ??= String(v);
      }
      const ni = this.names[li];
      const names = list.table.names;
      if (ni && names) {
        const row = (list.table.rows as ColumnRows).index.get(key)!;
        for (let j = ni.start[row]; j < ni.start[row + 1]; j++) {
          const n = ni.order[j];
          const spec = list.spec.names![names.set[n]];
          // A name given twice, as two rows of a gazetteer may give one, is one name.
          if (t.names.some((x) => x.text === names.text[n] && x.note === spec.note)) continue;
          t.names.push({ text: names.text[n], note: spec.note, ...(spec.lang ? { lang: spec.lang } : {}) });
        }
      }
    }
    // A thing with no name is known by its id.
    if (t && !t.label) t.label = t.id;
    return t;
  }
}

/**
 * The kind of a thing: its first list's. A scheme is an id space, and one catalogue may give things of several kinds
 * ids of one space, as a map gives its cities and its seas, each layer a list of its own.
 */
export function kindOf(things: Things, id: string): string | undefined {
  const s = splitThing(id);
  if (!s) return undefined;
  for (const l of things.lists) if (l.spec.scheme === s.scheme && l.table.rows.has(s.key)) return l.spec.kind;
  return undefined;
}

/** The things of the lists: each row of each list, joined with the rows of the same id in the others of its scheme. */
export function thingsOf(lists: List[]): Things {
  const schemes = new Map<string, string>();
  for (const l of lists) if (!schemes.has(l.spec.scheme)) schemes.set(l.spec.scheme, l.spec.kind);
  return { lists, things: new LazyThings(lists), schemes };
}

/** Which record is each thing, and what else is: what the ids join (docs/plans/ENTITIES.md, step 4). */
export interface Identity {
  /** a thing's id → the record that is it: one written by hand, or else one an import made */
  record: Map<string, string>;
  /** a thing's id → the things of other schemes that are it */
  also: Map<string, string[]>;
  /** a record an import made → the written record that is the same thing */
  same: Map<string, string>;
  /** a record → the things that are it */
  rowsOf: Map<string, string[]>;
  /**
   * a thing that is one thing with others → the thing that stands for them all, in search and the tree: of a record's
   * things, the first of their ids; of others, the thing of a list the others were matched to, or else of the first list
   */
  face: Map<string, string>;
  /** a thing → the things it was joined to by a match of names and not by an id (rows.match) */
  matched: Map<string, string[]>;
}

/** The names above a thing in its list, nearest first, to a depth. */
function ancestorNames(list: List, key: string, depth = 40): string[] {
  const out: string[] = [];
  const name = list.props.indexOf('name');
  let k: string | undefined = key;
  for (let d = 0; d < depth && k !== undefined; d++) {
    const columns = list.table.rows.get(k);
    if (!columns) break;
    const p = parentKey(list, k, columns);
    if (p === undefined) break;
    const pc = list.table.rows.get(p);
    if (name >= 0 && pc) out.push(textOf(toValue(list.spec.claims[list.props[name]], pc)));
    k = p;
  }
  return out;
}

/**
 * The pairs of things a list's `match` joins: one of the list and one of the other scheme, each the only thing of its
 * scheme with those values of the properties named, where the parent of one has the name of a thing above the other, or
 * one of them is at the top of its list.
 */
export function matches(lists: List[]): [string, string][] {
  const out: [string, string][] = [];
  for (const list of lists) {
    const m = list.spec.match;
    if (!m) continue;
    const signature = (l: List, columns: Record<string, unknown>) => {
      const parts: string[] = [];
      for (const prop of m.by) {
        const map = l.spec.claims[prop];
        const v = map ? toValue(map, columns) : undefined;
        if (v === undefined || v === null) return undefined;
        parts.push(textOf(v));
      }
      return parts.join('\u0001');
    };
    // The other scheme's things by their values, each value held by one thing or by several (null).
    const others = lists.filter((l) => l.spec.scheme === m.scheme);
    const theirs = new Map<string, { list: List; key: string } | null>();
    for (const l of others) {
      for (const [key, columns] of l.table.rows) {
        const sig = signature(l, columns);
        if (sig === undefined) continue;
        const had = theirs.get(sig);
        if (had === undefined) theirs.set(sig, { list: l, key });
        else if (had && had.key !== key) theirs.set(sig, null);
      }
    }
    // This list's things by the same values, where the other scheme has one: each held by one thing, or by several.
    const ours = new Map<string, string | null>();
    for (const [key, columns] of list.table.rows) {
      const sig = signature(list, columns);
      if (sig === undefined || !theirs.get(sig)) continue;
      ours.set(sig, ours.has(sig) ? null : key);
    }
    for (const [sig, key] of ours) {
      const other = theirs.get(sig);
      if (!key || !other) continue;
      const up = ancestorNames(list, key);
      const otherUp = ancestorNames(other.list, other.key);
      // The parent of one is above the other, so they sit in the same place of both trees as far as each goes; or one is
      // at the top of its list, where there is nothing above it to agree.
      if (up.length && otherUp.length && !otherUp.includes(up[0]) && !up.includes(otherUp[0])) continue;
      out.push([thingId(list.spec.scheme, key), thingId(m.scheme, other.key)]);
    }
  }
  return out;
}

/** One thing, by the ids that name it: a record, the things of lists, and the external ids of either. */
export function identity(world: World, things: Things): Identity {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    // Shorten the path walked, so that a long chain is walked once.
    for (let y = x; y !== r; ) {
      const next = parent.get(y)!;
      parent.set(y, r);
      y = next;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    for (const x of [a, b]) if (!parent.has(x)) parent.set(x, x);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const e of world.entities) for (const [scheme, v] of Object.entries(e.same_as ?? {})) union(e.id, `${scheme}:${v}`);
  // The ids a list's rows give of other schemes: only the lists whose fields name some are read for them.
  for (const list of things.lists) {
    const cols = Object.entries(list.spec.same_as ?? {});
    if (!cols.length) continue;
    for (const [key, columns] of list.table.rows)
      for (const [scheme, column] of cols) {
        const v = columns[column];
        if (v !== undefined && v !== null && v !== '') union(thingId(list.spec.scheme, key), `${scheme}:${v}`);
      }
  }
  // An overlay that ties a row of a list to a record says the thing is the record.
  const schemeOf = new Map(things.lists.map((l) => [l.dataset, l.spec.scheme]));
  for (const o of world.overlays) {
    const scheme = schemeOf.get(o.dataset);
    if (scheme && o.same_as) union(o.same_as, thingId(scheme, o.key));
  }
  // Matches of names where a list says what else must agree: never by a name alone.
  const matched = new Map<string, string[]>();
  for (const [a, b] of matches(things.lists)) {
    union(a, b);
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const list = matched.get(x);
      if (list) list.push(y);
      else matched.set(x, [y]);
    }
  }
  const groups = new Map<string, { written: string[]; imported: string[]; things: string[] }>();
  const group = (x: string) => {
    const r = find(x);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = { written: [], imported: [], things: [] }));
    return g;
  };
  for (const e of world.entities) if (parent.has(e.id)) (e.imported ? group(e.id).imported : group(e.id).written).push(e.id);
  for (const id of parent.keys()) if (things.things.has(id)) group(id).things.push(id);
  // Which list's thing stands for others: one that another list's things are matched to, then the first of the lists.
  const firstList = new Map<string, number>();
  things.lists.forEach((l, i) => firstList.has(l.spec.scheme) || firstList.set(l.spec.scheme, i));
  const matchedTo = new Set(things.lists.flatMap((l) => (l.spec.match ? [l.spec.match.scheme] : [])));
  const precedence = (id: string) => {
    const scheme = splitThing(id)!.scheme;
    return (matchedTo.has(scheme) ? 0 : 1) * 1e6 + (firstList.get(scheme) ?? 1e5);
  };
  const out: Identity = { record: new Map(), also: new Map(), same: new Map(), rowsOf: new Map(), face: new Map(), matched };
  for (const g of groups.values()) {
    const record = g.written[0] ?? g.imported[0];
    if (g.written.length) for (const i of g.imported) out.same.set(i, g.written[0]);
    g.things.sort();
    const face = record ? g.things[0] : [...g.things].sort((a, b) => precedence(a) - precedence(b) || (a < b ? -1 : 1))[0];
    for (const t of g.things) {
      if (record) out.record.set(t, record);
      const others = g.things.filter((x) => x !== t);
      if (others.length) out.also.set(t, others);
      if (g.things.length > 1) out.face.set(t, face);
    }
    if (record && g.things.length) out.rowsOf.set(record, [...g.things]);
  }
  return out;
}

/** The lists, their things and who is who, for a world: what search, pages, references and the tree read. */
export async function worldThings(world: World): Promise<{ things: Things; identity: Identity }> {
  const things = thingsOf(await readLists(world));
  return { things, identity: identity(world, things) };
}
