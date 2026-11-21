// Macrostrat's columns and their units, read as a pinned snapshot (section 8.1: databases that change continuously are
// pinned as dated snapshots). A column is Macrostrat's record of the rock succession of an area, a few tens of km
// across: its units, each with the ages it was laid down between, its lithologies with their shares and attributes, and
// the environments it was laid down in. It is rock with ages: what a scene's ground and the rock under it can be read
// from at any time (field:earth/strata, core/strata.ts), where a map of today's bedrock has no ages to be carried back by.
//
// Only the columns and units are read, which the service states are under CC BY 4.0. Its geologic map is another
// matter and is not read: many of the maps it gathers state no licence of their own, or one that does not let them be
// used here. Each column and unit names the reference it was compiled from, and the snapshot keeps those, so that they
// are credited beside Macrostrat. Kept as tables with few repeated strings, as the Paleobiology Database's rocks are.

const SERVICE = 'https://macrostrat.org/api/v2';

/**
 * What the service says of every column of its core set and of every unit in them, with its own vocabularies: what a
 * shale or a fluvial environment is, and which group and type each belongs to, is the database's to say.
 */
export interface ColumnsSnapshot {
  format: 'lightworld-macrostrat-columns@1';
  snapshot: string;
  /** the licence each answer states, and what the service's /meta says of the licence, of how to cite it and of its version */
  license: string;
  meta: { license: string; citation: string; version: string };
  /** what the service was asked, with the date it answered */
  query: ColumnsQuery;
  /** the words the tables below refer to by number */
  words: string[];
  /** the references the columns and units name: the service's number, the year, and as words the author, the title, the DOI and the address */
  refs: RefRow[];
  /** the service's projects that have a column here: the number, and as words the name and what the service says of it */
  projects: [project: number, name: number, description: number][];
  /** its vocabulary of lithologies: the number, and as words the name, the type, the group and the class */
  lithologies: [lithology: number, name: number, type: number, group: number, cls: number][];
  /** of the attributes of a lithology: the number, and as words the name and the type */
  attributes: [attribute: number, name: number, type: number][];
  /** of environments: the number, and as words the name, the type and the class */
  environments: [environment: number, name: number, type: number, cls: number][];
  columns: ColumnRow[];
  units: UnitRow[];
}

export type ColumnsQuery = { meta: string; columns: string; units: string; lithologies: string; attributes: string; environments: string; refs: string; projects: string };

export type RefRow = [ref: number, year: number | null, author: number, title: number, doi: number, url: number];

/**
 * A column: its number; as words its name and its group's; its project; the point the service gives it and the area of
 * its footprint in km²; the references it names; and its footprint, as polygons of rings, each ring a flat list of
 * longitudes and latitudes.
 */
export type ColumnRow = [column: number, name: number, group: number, project: number, lat: number, lng: number, area: number, refs: number[], outline: number[][][]];

/**
 * A unit: its number, its column's and its section's (the gap-bound package it is in); as words its name and its
 * name in full; the ages it began and stopped being laid down at, in Ma, each with the interval of the timescale its
 * boundary is placed in, as a word, and how far through that interval; its greatest and least thickness in m; as words
 * where it is exposed and the service's notes; the references it names; its lithologies, each the lithology's number,
 * its share of the unit and its attributes as words; and its environments' numbers.
 */
export type UnitRow = [unit: number, column: number, section: number, name: number, fullName: number, older: number, younger: number, olderInterval: number, olderShare: number, youngerInterval: number, youngerShare: number, thickest: number, thinnest: number, outcrop: number, notes: number, refs: number[], lithologies: [lithology: number, share: number, ...attributes: number[]][], environments: number[]];

/** The service's answers, as it gives them. */
interface Answer<T> {
  success: { v: number; license?: string; data: T; refs?: Record<string, string> };
}
export interface RawColumn {
  col_id: number;
  col_name: string;
  col_group: string | null;
  lat: string | number;
  lng: string | number;
  col_area: string | number;
  project_id: number;
  col_type?: string;
  status_code?: string;
  refs: number[];
}
export interface RawFootprint {
  geometry: { type: string; coordinates: unknown } | null;
  properties: RawColumn;
}
export interface RawUnit {
  unit_id: number;
  section_id: number;
  col_id: number;
  unit_name: string | null;
  strat_name_long: string | null;
  t_age: number;
  b_age: number;
  t_int_name: string | null;
  t_prop: number | null;
  b_int_name: string | null;
  b_prop: number | null;
  max_thick: number | string | null;
  min_thick: number | string | null;
  outcrop: string | null;
  notes: string | null;
  refs: number[];
  lith: { lith_id: number; prop: number; atts?: string[] }[];
  environ: { environ_id: number }[];
}
export interface ColumnsAnswers {
  meta: { license: string; citation: string; version: string };
  /** the licence the answer for the columns states, and the one for the units */
  licenses: (string | undefined)[];
  footprints: RawFootprint[];
  units: RawUnit[];
  lithologies: { lith_id: number; name: string; type: string | null; group: string | null; class: string | null }[];
  attributes: { lith_att_id: number; name: string; type: string | null }[];
  environments: { environ_id: number; name: string; type: string | null; class: string | null }[];
  refs: { ref_id: number; pub_year: number | null; author: string | null; ref: string | null; doi: string | null; url: string | null }[];
  projects: { project_id: number; project: string; descrip: string | null }[];
}

/**
 * A word the service sends with its accents encoded twice ("SÃ£o Paulo" for São Paulo), read back; any other word as
 * it is. Such a word is one whose every character is a byte's worth and whose bytes are whole UTF-8 with an accent in
 * it: "Neuquén", sent whole, is not, since its é alone is no UTF-8.
 */
export function readBack(s: string): string {
  let accented = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xff) return s;
    if (c > 0x7f) accented = true;
  }
  if (!accented) return s;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
  } catch {
    return s;
  }
}

/** A footprint's polygons, each its rings, each ring a flat list of longitudes and latitudes as the service gives them. */
function outlineOf(g: RawFootprint['geometry'], column: number): number[][][] {
  if (!g) throw new Error(`column ${column} has no footprint`);
  const polygons = g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : undefined;
  if (!polygons?.length) throw new Error(`column ${column}'s footprint is a ${g.type}, not a polygon`);
  return polygons.map((rings) =>
    rings.map((ring) => {
      if (ring.length < 4) throw new Error(`a ring of column ${column}'s footprint has ${ring.length} points`);
      return ring.flatMap(([lng, lat]) => {
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(`column ${column}'s footprint has a point at ${lng}, ${lat}`);
        return [lng, lat];
      });
    }),
  );
}

/**
 * A snapshot from the service's answers. Columns and units are kept in the order of their numbers, and the words in the
 * order they are first met in, so that the same rows make the same bytes whatever order the service sends them in. It
 * refuses an answer it cannot read whole: a unit of no column here, a lithology or an environment its vocabulary lacks,
 * a reference it does not give, an age that is no number, a unit that stops before it starts.
 */
export function columnsFrom(date: string, query: ColumnsQuery, a: ColumnsAnswers): ColumnsSnapshot {
  const words = new Map<string, number>([['', 0]]);
  const word = (w: string | null | undefined): number => {
    const key = readBack((w ?? '').trim());
    let k = words.get(key);
    if (k === undefined) {
      k = words.size;
      words.set(key, k);
    }
    return k;
  };
  const license = a.licenses[0];
  if (!license || a.licenses.some((l) => l !== license)) throw new Error(`the service's answers state their licence as ${a.licenses.map((l) => JSON.stringify(l)).join(' and ')}: read what changed before taking a snapshot`);
  const byNumber = <T>(rows: T[], no: (r: T) => number): T[] => [...rows].sort((x, y) => no(x) - no(y));

  const footprints = byNumber(a.footprints, (f) => f.properties.col_id);
  const columnNos = new Set(footprints.map((f) => f.properties.col_id));
  if (columnNos.size !== footprints.length) throw new Error('the service gives a column twice');
  const units = byNumber(a.units, (u) => u.unit_id);
  if (new Set(units.map((u) => u.unit_id)).size !== units.length) throw new Error('the service gives a unit twice');

  // The references named, by the service's own table of them.
  const named = new Set<number>([...footprints.flatMap((f) => f.properties.refs ?? []), ...units.flatMap((u) => u.refs ?? [])]);
  const given = new Map(a.refs.map((r) => [r.ref_id, r]));
  const refs: RefRow[] = [...named]
    .sort((x, y) => x - y)
    .map((id) => {
      const r = given.get(id);
      if (!r) throw new Error(`a column or a unit names reference ${id}, which the service's references do not give`);
      return [id, r.pub_year ?? null, word(r.author), word(r.ref), word(r.doi), word(r.url)];
    });

  const projectNos = new Set(footprints.map((f) => f.properties.project_id));
  const projects = byNumber(a.projects.filter((p) => projectNos.has(p.project_id)), (p) => p.project_id).map((p): [number, number, number] => [p.project_id, word(p.project), word(p.descrip)]);
  for (const p of projectNos) if (!projects.some((x) => x[0] === p)) throw new Error(`a column is of project ${p}, which the service's projects do not give`);

  const lithologies = byNumber(a.lithologies, (l) => l.lith_id).map((l): [number, number, number, number, number] => [l.lith_id, word(l.name), word(l.type), word(l.group), word(l.class)]);
  const attributes = byNumber(a.attributes, (x) => x.lith_att_id).map((x): [number, number, number] => [x.lith_att_id, word(x.name), word(x.type)]);
  const environments = byNumber(a.environments, (e) => e.environ_id).map((e): [number, number, number, number] => [e.environ_id, word(e.name), word(e.type), word(e.class)]);
  const lithologyNos = new Set(lithologies.map((l) => l[0]));
  const environmentNos = new Set(environments.map((e) => e[0]));

  const columns = footprints.map((f): ColumnRow => {
    const c = f.properties;
    // The service gives its core set as active columns; anything else would be a different thing to read.
    if ((c.status_code ?? 'active') !== 'active' || (c.col_type ?? 'column') !== 'column') throw new Error(`column ${c.col_id} is ${c.status_code} and a ${c.col_type}: only active columns are read`);
    const [lat, lng, area] = [Number(c.lat), Number(c.lng), Number(c.col_area)];
    if (![lat, lng, area].every(Number.isFinite)) throw new Error(`column ${c.col_id} has no place or no area`);
    return [c.col_id, word(c.col_name), word(c.col_group), c.project_id, lat, lng, area, [...(c.refs ?? [])], outlineOf(f.geometry, c.col_id)];
  });

  const rows = units.map((u): UnitRow => {
    if (!columnNos.has(u.col_id)) throw new Error(`unit ${u.unit_id} is of column ${u.col_id}, which is not among the columns`);
    if (!Number.isFinite(u.b_age) || !Number.isFinite(u.t_age) || u.b_age < u.t_age) throw new Error(`unit ${u.unit_id} runs from ${u.b_age} to ${u.t_age} Ma`);
    const lith = u.lith.map((l): [number, number, ...number[]] => {
      if (!lithologyNos.has(l.lith_id)) throw new Error(`unit ${u.unit_id} has lithology ${l.lith_id}, which the service's vocabulary does not give`);
      if (!Number.isFinite(l.prop)) throw new Error(`unit ${u.unit_id} gives lithology ${l.lith_id} no share`);
      return [l.lith_id, l.prop, ...(l.atts ?? []).map(word)];
    });
    const environ = u.environ.map((e) => {
      if (!environmentNos.has(e.environ_id)) throw new Error(`unit ${u.unit_id} has environment ${e.environ_id}, which the service's vocabulary does not give`);
      return e.environ_id;
    });
    const number = (v: number | string | null) => (v === null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));
    return [u.unit_id, u.col_id, u.section_id, word(u.unit_name), word(u.strat_name_long), u.b_age, u.t_age, word(u.b_int_name), number(u.b_prop), word(u.t_int_name), number(u.t_prop), number(u.max_thick), number(u.min_thick), word(u.outcrop), word(u.notes), [...(u.refs ?? [])], lith, environ];
  });

  return { format: 'lightworld-macrostrat-columns@1', snapshot: date, license, meta: a.meta, query, words: [...words.keys()], refs, projects, lithologies, attributes, environments, columns, units: rows };
}

/** The columns and units of the service's core set, from the service. `log` says how far it has got. */
export async function exportColumns(date: string, log: (m: string) => void): Promise<ColumnsSnapshot> {
  const get = async <T>(url: string): Promise<Answer<T>['success']> => {
    log(`asking ${url}`);
    const res = await fetch(url, { headers: { 'User-Agent': 'wikiworldmodel-world-tools' } });
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
    const body = (await res.json()) as Answer<T>;
    if (!body.success) throw new Error(`GET ${url}: the service did not answer with success`);
    return body.success;
  };
  // `all` is the service's core set: the columns it calls the best available, composited from its regional projects.
  const query: ColumnsQuery = {
    meta: `${SERVICE}/meta`,
    columns: `${SERVICE}/columns?all&response=long&format=geojson`,
    units: `${SERVICE}/units?all&response=long`,
    lithologies: `${SERVICE}/defs/lithologies?all`,
    attributes: `${SERVICE}/defs/lithology_attributes?all`,
    environments: `${SERVICE}/defs/environments?all`,
    refs: `${SERVICE}/defs/refs?all`,
    projects: `${SERVICE}/defs/projects?all`,
  };
  const meta = await get<ColumnsAnswers['meta']>(query.meta);
  const columns = await get<{ features: RawFootprint[] }>(query.columns);
  const units = await get<RawUnit[]>(query.units);
  const snap = columnsFrom(date, query, {
    meta: { license: meta.data.license, citation: meta.data.citation, version: meta.data.version },
    licenses: [columns.license, units.license],
    footprints: columns.data.features,
    units: units.data,
    lithologies: (await get<ColumnsAnswers['lithologies']>(query.lithologies)).data,
    attributes: (await get<ColumnsAnswers['attributes']>(query.attributes)).data,
    environments: (await get<ColumnsAnswers['environments']>(query.environments)).data,
    refs: (await get<ColumnsAnswers['refs']>(query.refs)).data,
    projects: (await get<ColumnsAnswers['projects']>(query.projects)).data,
  });
  log(`${snap.columns.length} columns of ${snap.projects.length} projects, ${snap.units.length} units, ${snap.refs.length} references, ${snap.words.length} words; ${snap.license}`);
  return snap;
}

/** A reference as a line: who, when, what, and where it can be found. */
export function refLine(snap: Pick<ColumnsSnapshot, 'words'>, r: RefRow): string {
  const w = (k: number) => snap.words[k] ?? '';
  const where = w(r[4]) ? ` doi:${w(r[4])}` : w(r[5]) ? ` ${w(r[5])}` : '';
  const title = w(r[3]);
  return `${[w(r[2]), r[1] === null ? '' : String(r[1]), title].filter(Boolean).join(', ')}${/[.?!]$/.test(title) ? '' : '.'}${where}`;
}

/**
 * A unit's words, read out of the snapshot's tables: what a row of it says, as columns. Its lithologies are in the
 * service's own words, each with its share of the unit and its attributes, and its place is its column's point.
 */
export function unitRows(snap: ColumnsSnapshot): Record<string, unknown>[] {
  const w = (k: number) => snap.words[k] ?? '';
  const columns = new Map(snap.columns.map((c) => [c[0], c]));
  const lithology = new Map(snap.lithologies.map((l) => [l[0], w(l[1])]));
  const environment = new Map(snap.environments.map((e) => [e[0], w(e[1])]));
  const refs = new Map(snap.refs.map((r) => [r[0], refLine(snap, r)]));
  return snap.units.map((u) => {
    const c = columns.get(u[1])!;
    return {
      unit: u[0],
      column: u[1],
      column_name: w(c[1]),
      section: u[2],
      name: w(u[3]),
      full_name: w(u[4]),
      // What it goes by: its name in full where the service gives one, and its short name where it does not.
      label: w(u[4]) || w(u[3]),
      older_ma: u[5],
      younger_ma: u[6],
      older_interval: w(u[7]),
      younger_interval: w(u[9]),
      thickest_m: u[11],
      thinnest_m: u[12],
      outcrop: w(u[13]),
      notes: w(u[14]),
      lithologies: u[16].map(([l, share, ...atts]) => `${lithology.get(l)}${atts.length ? ` (${atts.map(w).join(', ')})` : ''} ${share}`).join('; '),
      environments: u[17].map((e) => environment.get(e)).join('; '),
      lat: c[4],
      lng: c[5],
      reference: u[15].map((r) => refs.get(r)).join(' '),
    };
  });
}
