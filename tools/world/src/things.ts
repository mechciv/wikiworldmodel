// The things of lists, and one identity across them (docs/plans/ENTITIES.md, steps 2 and 4). A field whose `rows:` give
// a scheme reads its dataset as a list of things: each row is the thing <scheme>:<key>. Two lists of one scheme are two
// readings of one catalogue, such as two snapshots of the Paleobiology Database, and a thing in both is one thing with a
// row in each. What is one thing across schemes and records is told only by ids: a record's same_as, a row's columns that
// give another scheme's id, and an overlay that ties a row to a record. Never by a name.
import { thingId } from '../../../core/things.ts';
import { rowKey, readTable, toValue, type RowsSpec, type Table } from './tables.ts';
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
}

export interface Things {
  lists: List[];
  /** by id */
  things: Map<string, Thing>;
  /** the schemes that lists are of, with the kind of thing each is */
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

/** The things of the lists: each row of each list, joined with the rows of the same id in the others of its scheme. */
export function thingsOf(lists: List[]): Things {
  const things = new Map<string, Thing>();
  const schemes = new Map<string, string>();
  lists.forEach((list, li) => {
    schemes.set(list.spec.scheme, list.spec.kind);
    const parents = list.spec.parent ? [list.spec.parent.key].flat() : [];
    let index = 0;
    for (const [key, columns] of list.table.rows) {
      const id = thingId(list.spec.scheme, key);
      const values = list.props.map((p) => toValue(list.spec.claims[p], columns) ?? null);
      let t = things.get(id);
      if (!t) {
        t = { id, scheme: list.spec.scheme, key, label: '', rows: [], same_as: {} };
        things.set(id, t);
      }
      t.rows.push({ list: li, values });
      if (!t.label) {
        const i = list.props.indexOf('name');
        if (i >= 0) t.label = textOf(values[i]);
      }
      if (!t.parent && parents.length) {
        // The first template that names another row of the list: one whose columns are empty, or that names a row the
        // list does not have, gives none, and a thing with none is a root.
        for (const template of parents) {
          const k = rowKey(template, columns, index);
          if (k !== key && list.table.rows.has(k)) {
            t.parent = thingId(list.spec.scheme, k);
            break;
          }
        }
      }
      for (const [scheme, column] of Object.entries(list.spec.same_as ?? {})) {
        const v = columns[column];
        if (v !== undefined && v !== null && v !== '') t.same_as[scheme] ??= String(v);
      }
      index++;
    }
  });
  // A thing with no name is known by its id.
  for (const t of things.values()) if (!t.label) t.label = t.id;
  return { lists, things, schemes };
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
  for (const t of things.things.values()) for (const [scheme, v] of Object.entries(t.same_as)) union(t.id, `${scheme}:${v}`);
  // An overlay that ties a row of a list to a record says the thing is the record.
  const schemeOf = new Map(things.lists.map((l) => [l.dataset, l.spec.scheme]));
  for (const o of world.overlays) {
    const scheme = schemeOf.get(o.dataset);
    if (scheme && o.same_as) union(o.same_as, thingId(scheme, o.key));
  }
  const groups = new Map<string, { written: string[]; imported: string[]; things: string[] }>();
  const group = (x: string) => {
    const r = find(x);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = { written: [], imported: [], things: [] }));
    return g;
  };
  for (const e of world.entities) if (parent.has(e.id)) (e.imported ? group(e.id).imported : group(e.id).written).push(e.id);
  for (const t of things.things.values()) if (parent.has(t.id)) group(t.id).things.push(t.id);
  const out: Identity = { record: new Map(), also: new Map(), same: new Map(), rowsOf: new Map() };
  for (const g of groups.values()) {
    const record = g.written[0] ?? g.imported[0];
    if (g.written.length) for (const i of g.imported) out.same.set(i, g.written[0]);
    for (const t of g.things) {
      if (record) out.record.set(t, record);
      const others = g.things.filter((x) => x !== t);
      if (others.length) out.also.set(t, others);
    }
    if (record && g.things.length) out.rowsOf.set(record, [...g.things].sort());
  }
  return out;
}

/** The lists, their things and who is who, for a world: what search, pages, references and the tree read. */
export async function worldThings(world: World): Promise<{ things: Things; identity: Identity }> {
  const things = thingsOf(await readLists(world));
  return { things, identity: identity(world, things) };
}
