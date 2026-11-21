// What the ground of a place is made of (field:earth/substrate; docs/SCENES.md, "Substrate"): the loose material a
// scene's ground is drawn as, with the colours and the marks its sources name, and the rock under it. In deep time it
// is read from the rock record near the place (core/rocks.ts): a sandstone was laid down as sand, and what a
// collection says of its rock's colour and cracks it says of the ground the rock was. Nearer the present it is read
// from today's maps, held back in time and carried on the plate under them: the topsoil's sand, silt, clay and stones
// (field:earth/soil), and the class of rock under it (field:earth/bedrock). And at any time it is read from the units
// of the column of rock the place lies in, which have ages (field:earth/strata, core/strata.ts): the unit being laid
// down then is the ground, and in a gap the youngest unit from before it is the rock under the ground. Which rock is
// which ground is the model's, as data (world/fields/earth/substrate.yaml); how sand, a crust of salt or a basalt looks
// is the renderer's.
import { rocksNear, type RockBoxes, type RockSite, type RocksBin, type RocksIndex } from './rocks.ts';
import { unitsAt, type StrataColumn, type StrataUnit } from './strata.ts';

/** The loose materials a ground is made of: what the renderer has a look for. */
export const GROUND_MATERIALS = ['sand', 'gravel', 'silt', 'mud', 'lime', 'evaporite', 'organic', 'ash'] as const;
export type GroundMaterial = (typeof GROUND_MATERIALS)[number];

/** Marks on a ground's surface that its sources name. */
export const GROUND_MARKS = ['cracks', 'ripples', 'soil', 'nodules', 'burrows', 'fine', 'coarse'] as const;
export type GroundMark = (typeof GROUND_MARKS)[number];

export type MaterialShares = Partial<Record<GroundMaterial, number>>;

/** The kinds of rock a ground lies on: what the renderer has a look for. The rule reads a map's classes as these. */
export const ROCK_KINDS = ['siliciclastic', 'mixed-sedimentary', 'carbonate', 'evaporite', 'pyroclastic', 'acid-volcanic', 'intermediate-volcanic', 'basic-volcanic', 'acid-plutonic', 'intermediate-plutonic', 'basic-plutonic', 'metamorphic'] as const;
export type RockKind = (typeof ROCK_KINDS)[number];

/** The parts a map of topsoil gives: three fractions of its fine earth, and the coarse fragments in its volume. */
export const SOIL_PARTS = ['sand', 'silt', 'clay', 'coarse'] as const;
export type SoilPart = (typeof SOIL_PARTS)[number];

/** How a source's words are read as ground: the parameters of field:earth/substrate. */
export interface SubstrateRule {
  /** the class of environment a collection must be in for its rock to be a land's ground */
  land_class: string;
  /** how much of the ground the rock of the country round decides, where none lies within here_km */
  near_weight: number;
  /** what each lithology was laid down as, by its name */
  lithologies: Record<string, MaterialShares>;
  /** and by the type its database gives it, for a lithology with no entry of its own */
  types: Record<string, MaterialShares>;
  /** and, before its type, by the group its database gives it, where it gives one: a dataset of rock units does */
  groups?: Record<string, MaterialShares>;
  /** what an adjective of a lithology says: a colour, a mark, or that a share of it was another material */
  adjectives: Record<string, { colour?: string; mark?: string; material?: string; share?: number }>;
  /** how the units of a column of rock with ages are read, where the world has them (field:earth/strata) */
  strata?: StrataRule;
  /** which material each part of a topsoil is drawn as, where the world has a map of today's (field:earth/soil) */
  soil?: Record<SoilPart, GroundMaterial>;
  /** what kind of rock each class of a map of today's bedrock is, by the class's code (field:earth/bedrock): a class with no kind is loose sediment, and one with no entry says nothing of the ground */
  bedrock?: Record<string, { rock?: RockKind }>;
}

/** What a kind of rock, or none, a lithology is: `loose` is sediment not turned to stone, which is no rock. */
export type RockRead = RockKind | 'loose';

/** How the units of a column of rock are read, in the words of the dataset's own vocabulary. */
export interface StrataRule {
  /** the class of environment that is the sea's: a unit all of whose environments are of it was laid down under the sea, and says nothing of a land */
  sea_class: string;
  /** the class of lithology that is laid down as loose ground: its group and its type say what it was, where its name does not. A rock of another class says so only by its name */
  laid_class: string;
  /** the types of lithology that are laid down at the surface besides that class: a lava or an ash, which is the rock at the surface while it is laid down */
  surface_types: string[];
  /** the kind of rock a lithology is, for the rock under a ground: by its name; failing that by its type and group together ("volcanic mafic"), by its type, by its class */
  rocks: { lithologies: Record<string, RockRead>; groups: Record<string, RockRead>; types: Record<string, RockRead>; classes: Record<string, RockRead> };
}

/** What a build gives a viewer to read a place's ground by (substrate.json): the rule, and where its sources are. */
export interface SubstrateFile {
  format: 'lightworld-substrate@1';
  field: string;
  title: string;
  description?: string;
  rule: SubstrateRule;
  /** the rock record's index, where the build has one */
  rocks?: string;
  /** today's maps of the ground, where the build has them (ground.lwt) */
  ground?: string;
  /** the spans those maps are held for, [older, younger] each, so that a viewer sends for them only at a time one covers */
  held?: [number, number][];
  /** the columns of rock with ages, where the build has them (strata.lwt) */
  strata?: string;
}

/**
 * Today's maps of the ground, as a build gives them (ground.lwt): each a grid of latitude and longitude on today's
 * Earth, rows from the north and columns from 180° W, with the span of time it is held for.
 */
export interface GroundHeader {
  format: 'lightworld-ground@1';
  /** the topsoil: four bytes a cell, its sand, silt and clay and its coarse fragments in half percents, all nothing where the map has no soil */
  soil?: GroundMap;
  /** the bedrock: a byte a cell, the number its map gives the class, and nothing where it has none; the classes by that number */
  bedrock?: GroundMap & { classes: Record<string, { code: string; label: string }> };
}

export interface GroundMap {
  field: string;
  title: string;
  source: string;
  /** what the dataset is credited as, for a panel */
  credit?: string;
  /** the name of the span it is held for, as its field gives it */
  held?: string;
  /** [older, younger] on the axis */
  span: [number, number];
  /** degrees a cell */
  res: number;
  nx: number;
  ny: number;
  /** which of the file's arrays it is */
  array: number;
}

/** The maps as read: the header and each grid's bytes. */
export interface GroundMaps {
  header: GroundHeader;
  soil?: Uint8Array;
  bedrock?: Uint8Array;
}

/** A unit of a column of rock, as a scene names it: its name, and the ages it was laid down between, in Ma. */
export interface SceneUnit {
  name: string;
  older: number;
  younger: number;
}

/**
 * The rock under a scene's ground, the place carried on its plate to where it is today: where a map of today's bedrock
 * says, or the units of the column of rock it lies in.
 */
export interface SceneBedrock {
  /** always a model: today's map held back in time, or a column that stands for an area */
  tier: 'model';
  /** what it is read from: a map of today's bedrock, which it is where this is not said, or the units of a column of rock */
  from?: 'map' | 'strata';
  /** the class as the map names it, and its code; for a unit its lithologies, as its dataset names them, and its row's key */
  code: string;
  label: string;
  /** the kind of rock, for one that is rock: loose sediment has none */
  rock?: RockKind;
  field: string;
  source: string;
  /** what the map or the columns are credited as, and for a map the name of the span it is held for */
  credit?: string;
  held?: string;
  /** for a column's units: which they are, their rows, and the column's name */
  units?: SceneUnit[];
  rows?: string[];
  column?: string;
  /** and whether they were being laid down at the time, as a lava is, or are the youngest the column has from before it */
  laid?: boolean;
}

/** The ground of a scene, where something says what it was. Without one, the climate's class decides, generically. */
export interface SceneSubstrate {
  /** evidence where a source says it of the place itself; model where it is carried from the country round, from today, or from a column that stands for an area */
  tier: 'evidence' | 'model';
  /** what it is read from: the rocks of the stage's fossil collections, a map of today's topsoil held back in time, or the units a column of rock has being laid down at the time */
  from: 'rocks' | 'soil' | 'strata';
  /** how much of the ground it decides, 0–1: all of it where it is evidence */
  weight: number;
  /** the materials, in shares that add up to 1, the largest first */
  materials: [GroundMaterial, number][];
  /** the colours the sources name, each with the share of what was said that names it, the largest first */
  colours: [string, number][];
  /** the marks they name, each with its share likewise */
  marks: [GroundMark, number][];
  /** what it rests on: the dataset, its nearest rows, how many there are in all, and how far off the nearest is, in km */
  source: string;
  rows: string[];
  sites: number;
  km: number;
  /** for a map of today's held back in time, or a column's units: what it is credited as; and for a map the name of the span it is held for */
  credit?: string;
  held?: string;
  /** for a column's units: which they are, and the column's name */
  units?: SceneUnit[];
  column?: string;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const isMaterial = (m: string): m is GroundMaterial => (GROUND_MATERIALS as readonly string[]).includes(m);
const isMark = (m: string): m is GroundMark => (GROUND_MARKS as readonly string[]).includes(m);

/** What a lithology was laid down as, by the rule: by its own name, or its type's; undefined where neither says. */
export function laidDownAs(lithology: string, type: string | undefined, rule: Pick<SubstrateRule, 'lithologies' | 'types'>): MaterialShares | undefined {
  return rule.lithologies[lithology] ?? (type ? rule.types[type] : undefined);
}

/**
 * What rocks say of a ground, added up: each rock that says what it was laid down as, by a weight, with what its
 * adjectives say of it besides.
 */
function groundTally(rule: Pick<SubstrateRule, 'adjectives'>) {
  const material = new Map<GroundMaterial, number>();
  const colour = new Map<string, number>();
  const mark = new Map<GroundMark, number>();
  const add = <K>(m: Map<K, number>, k: K, w: number) => m.set(k, (m.get(k) ?? 0) + w);
  let said = 0;
  return {
    add(base: MaterialShares, adjectives: string[], w: number): void {
      said += w;
      // What its adjectives make of it: some of it another material, and the rest as its name says. Two adjectives
      // that say one thing, "fine" and "very fine", say it once.
      let other = 0;
      const told = new Set<string>();
      const once = (k: string) => !told.has(k) && !!told.add(k);
      for (const a of adjectives) {
        const r = rule.adjectives[a];
        if (!r) continue;
        if (r.colour && once(`colour ${r.colour}`)) add(colour, r.colour, w);
        if (r.mark && isMark(r.mark) && once(`mark ${r.mark}`)) add(mark, r.mark, w);
        if (r.material && isMaterial(r.material) && r.share) {
          const part = Math.min(r.share, 1 - other);
          add(material, r.material, w * part);
          other += part;
        }
      }
      for (const [m, share] of Object.entries(base)) if (isMaterial(m)) add(material, m, w * share * (1 - other));
    },
    /** how much was said in all, by weight */
    said: () => said,
    /** The materials, in shares that add up to 1, and the colours and the marks, each by the share of what was said that names it: nothing where no material was said. */
    made(): Pick<SceneSubstrate, 'materials' | 'colours' | 'marks'> | undefined {
      const total = [...material.values()].reduce((a, b) => a + b, 0);
      if (!total || !said) return undefined;
      const sorted = <K extends string>(m: Map<K, number>, of: number): [K, number][] => [...m].map(([k, w]): [K, number] => [k, round(w / of)]).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      return { materials: sorted(material, total), colours: sorted(colour, said), marks: sorted(mark, said) };
    },
  };
}

/**
 * The ground the rock sites of a stage make at a place: those within `here_km`, or failing any, those out to `near_km`.
 * Each site counts by how much of its span the stage holds, and its lithologies share that. Undefined where no site of
 * the land's class is in reach, or none says what its rock is.
 */
export function substrateOfSites(sites: (RockSite & { km: number })[], index: Pick<RocksIndex, 'here_km' | 'lithologies' | 'source'>, rule: SubstrateRule): SceneSubstrate | undefined {
  const land = sites.filter((s) => s.classes.includes(rule.land_class));
  const here = land.filter((s) => s.km <= index.here_km);
  const used = here.length ? here : land;
  const tally = groundTally(rule);
  const telling: (RockSite & { km: number })[] = [];
  for (const s of used) {
    let any = false;
    for (const l of s.lithologies) {
      const base = laidDownAs(l.name, index.lithologies[l.name], rule);
      if (!base) continue;
      any = true;
      tally.add(base, l.adjectives, s.share / s.lithologies.length);
    }
    if (any) telling.push(s);
  }
  const made = tally.made();
  if (!made) return undefined;
  return {
    tier: here.length ? 'evidence' : 'model',
    from: 'rocks',
    weight: here.length ? 1 : rule.near_weight,
    ...made,
    source: index.source,
    rows: telling.slice(0, 6).map((s) => `${index.source}#coll:${s.collection}`),
    sites: telling.length,
    km: Math.round(telling[0].km),
  };
}

/** The ground at a place in a stage, from its rock sites: the place as it stood at the stage's slice. `boxes` are the stage's, for one asked of many places. */
export function substrateOfRocks(bin: RocksBin, index: Pick<RocksIndex, 'classes' | 'here_km' | 'near_km' | 'lithologies' | 'source'>, rule: SubstrateRule, lat: number, lon: number, boxes?: RockBoxes): SceneSubstrate | undefined {
  return substrateOfSites(rocksNear(bin, index.classes, lat, lon, index.near_km, boxes), index, rule);
}

/** The cell of a grid a place of today's Earth is in. */
function cellOf(g: Pick<GroundMap, 'res' | 'nx' | 'ny'>, lat: number, lon: number): number {
  const row = Math.min(g.ny - 1, Math.max(0, Math.floor((90 - lat) / g.res)));
  const col = Math.min(g.nx - 1, Math.floor((lon + 180 - 360 * Math.floor((lon + 180) / 360)) / g.res));
  return row * g.nx + col;
}

/** Whether a time is one a map of today's ground is held for. */
export const groundHeld = (g: Pick<GroundMap, 'span'> | undefined, t: number): boolean => !!g && t >= g.span[0] && t <= g.span[1];

/** A topsoil's parts at a place of today's Earth, in percent: undefined where the map has no soil. */
export function soilAt(maps: GroundMaps, lat: number, lon: number): Record<SoilPart, number> | undefined {
  const g = maps.header.soil;
  if (!g || !maps.soil) return undefined;
  const k = cellOf(g, lat, lon) * 4;
  const [sand, silt, clay, coarse] = [maps.soil[k] / 2, maps.soil[k + 1] / 2, maps.soil[k + 2] / 2, maps.soil[k + 3] / 2];
  return sand + silt + clay > 0 ? { sand, silt, clay, coarse } : undefined;
}

/**
 * The ground a map of today's topsoil makes at a place, as it stands today: its coarse fragments take their share of
 * its volume, and the three fractions of its fine earth share the rest. A model, and of the place itself, so it decides
 * all of the ground. It names no colour: a topsoil's colour stays its climate's. Undefined where the map has no soil
 * or the rule does not read one.
 */
export function substrateOfSoil(maps: GroundMaps, rule: SubstrateRule, lat: number, lon: number): SceneSubstrate | undefined {
  const g = maps.header.soil;
  const parts = rule.soil && soilAt(maps, lat, lon);
  if (!g || !parts || !rule.soil) return undefined;
  const fine = parts.sand + parts.silt + parts.clay;
  const stones = Math.min(1, parts.coarse / 100);
  const material = new Map<GroundMaterial, number>();
  const add = (m: GroundMaterial, w: number) => material.set(m, (material.get(m) ?? 0) + w);
  add(rule.soil.coarse, stones);
  for (const p of ['sand', 'silt', 'clay'] as const) add(rule.soil[p], ((1 - stones) * parts[p]) / fine);
  return {
    tier: 'model',
    from: 'soil',
    weight: 1,
    materials: [...material].map(([m, w]): [GroundMaterial, number] => [m, round(w)]).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
    colours: [],
    marks: [],
    source: g.source,
    rows: [],
    sites: 0,
    km: 0,
    ...(g.credit ? { credit: g.credit } : {}),
    ...(g.held ? { held: g.held } : {}),
  };
}

/** The rock under a place of today's Earth, by the map of today's bedrock: undefined where the map has none, or its class says nothing of the ground. */
export function bedrockAt(maps: GroundMaps, rule: SubstrateRule, lat: number, lon: number): SceneBedrock | undefined {
  const g = maps.header.bedrock;
  if (!g || !maps.bedrock || !rule.bedrock) return undefined;
  const c = g.classes[String(maps.bedrock[cellOf(g, lat, lon)])];
  const read = c && rule.bedrock[c.code];
  if (!c || !read) return undefined;
  return { tier: 'model', from: 'map', code: c.code, label: c.label, ...(read.rock ? { rock: read.rock } : {}), field: g.field, source: g.source, ...(g.credit ? { credit: g.credit } : {}), ...(g.held ? { held: g.held } : {}) };
}

/** Where a column's units come from: the field that reads them, their dataset, and what it is credited as. */
export interface StrataOf {
  field: string;
  source: string;
  credit?: string;
}

/**
 * What a lithology of a column's unit was laid down as: by its name; or, for a rock of the class that is laid down as
 * loose ground, by the group and then the type its dataset's vocabulary gives it. An igneous or a metamorphic rock
 * says so only by its name: an ash was laid down as ash, and a lava, a granite or a schist as no loose ground.
 */
export function unitLaidDownAs(lithology: string, said: { type: string; group: string; cls: string } | undefined, rule: SubstrateRule): MaterialShares | undefined {
  const own = rule.lithologies[lithology];
  if (own) return own;
  if (!said || !rule.strata || said.cls !== rule.strata.laid_class) return undefined;
  return rule.groups?.[said.group] ?? rule.types[said.type];
}

/** The kind of rock a lithology of a unit is: by its name, by its type and group together, by its type, by its class. */
export function unitRock(lithology: string, said: { type: string; group: string; cls: string } | undefined, rule: StrataRule): RockRead | undefined {
  return rule.rocks.lithologies[lithology] ?? (said ? rule.rocks.groups[`${said.type} ${said.group}`] ?? rule.rocks.types[said.type] ?? rule.rocks.classes[said.cls] : undefined);
}

const whole = (u: StrataUnit) => u.lithologies.reduce((n, l) => n + l.share, 0);

/**
 * What a column says of its surface at an age, in Ma. `land`: it has a unit being laid down at the surface then that
 * was not laid down under the sea alone, and those units are given. `sea`: every unit being laid down at the surface
 * then was laid down under the sea. `gap`: none is being laid down at the surface, and the youngest from wholly before
 * are given. `nothing`: it has no unit that old.
 *
 * A unit is of the surface where the greater part of it is rock that is laid down there: a sediment, a lava, an ash.
 * A unit is the sea's where it has environments and all are of the sea's class.
 */
export function strataAt(column: Pick<StrataColumn, 'units'>, ageMa: number, r: StrataRule): { says: 'land' | 'sea' | 'gap' | 'nothing'; land: StrataUnit[]; before: StrataUnit[] } {
  const { laid, before } = unitsAt(column, ageMa);
  const atSurface = (l: { type: string; cls: string }) => l.cls === r.laid_class || r.surface_types.includes(l.type);
  const surface = laid.filter((u) => u.lithologies.reduce((n, l) => n + (atSurface(l) ? l.share : 0), 0) * 2 > whole(u));
  if (!surface.length) return { says: before.length ? 'gap' : 'nothing', land: [], before };
  const sea = (u: StrataUnit) => u.environments.length > 0 && u.environments.every((e) => e.cls === r.sea_class);
  const land = surface.filter((u) => !sea(u));
  return { says: land.length ? 'land' : 'sea', land, before };
}

/**
 * The ground a column's units make at an age, in Ma, and the rock under it.
 *
 * The units being laid down at the age are the ground: each counts alike, its lithologies by their shares of it, and
 * each is read as what it was laid down as, with what its attributes say besides. It decides as much of the ground as
 * the share of that rock that says what it was. A unit laid down under the sea alone says nothing of a land, and where
 * every unit of the age is such, neither does the column. A lava or an ash being laid down is itself the rock at the
 * surface.
 *
 * Where the column has a gap at the age, or only rock that formed at depth, a granite or a gneiss, the youngest units
 * it has from wholly before are the rock under the ground. That is a model, and wrong where rock since worn away lay
 * over them, which no column holds.
 */
export function groundOfStrata(column: StrataColumn, ageMa: number, of: StrataOf, rule: SubstrateRule): { substrate?: SceneSubstrate; bedrock?: SceneBedrock } {
  const r = rule.strata;
  if (!r) return {};
  const { land, before, says } = strataAt(column, ageMa, r);
  const credit = [of.credit, ...column.refs.map((x) => `this column from ${x}`)].filter(Boolean).join('; ');
  const named = (units: StrataUnit[]): SceneUnit[] => units.map((u) => ({ name: u.name, older: u.older, younger: u.younger }));
  const rowsOf = (units: StrataUnit[]) => units.slice(0, 6).map((u) => `${of.source}#unit:${u.unit}`);

  /** The rock some units are: the kind that makes most of them, each unit counting alike; with `only`, of the lithologies it lets through. */
  const rock = (units: StrataUnit[], laidThen: boolean, only?: (l: { type: string }) => boolean): SceneBedrock | undefined => {
    const kinds = new Map<RockRead, { share: number; names: Map<string, number>; units: Set<StrataUnit> }>();
    for (const u of units) {
      const all = whole(u);
      if (!all) continue;
      for (const l of u.lithologies) {
        if (only && !only(l)) continue;
        const kind = unitRock(l.name, l, r);
        if (!kind) continue;
        const k = kinds.get(kind) ?? { share: 0, names: new Map<string, number>(), units: new Set<StrataUnit>() };
        const w = l.share / all / units.length;
        k.share += w;
        k.names.set(l.name, (k.names.get(l.name) ?? 0) + w);
        k.units.add(u);
        kinds.set(kind, k);
      }
    }
    if (!kinds.size) return undefined;
    const [kind, most] = [...kinds].sort((a, b) => b[1].share - a[1].share || (a[0] < b[0] ? -1 : 1))[0];
    const label = [...most.names]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .filter(([, w], i) => i === 0 || w >= most.share / 4)
      .slice(0, 2)
      .map(([n]) => n)
      .join(' and ');
    const telling = units.filter((u) => most.units.has(u));
    return { tier: 'model', from: 'strata', code: `unit:${telling[0].unit}`, label, ...(kind === 'loose' ? {} : { rock: kind }), field: of.field, source: of.source, ...(credit ? { credit } : {}), units: named(telling), rows: rowsOf(telling), column: column.name, laid: laidThen };
  };

  if (says === 'gap') {
    const under = rock(before, false);
    return under ? { bedrock: under } : {};
  }
  if (says !== 'land') return {};
  const tally = groundTally(rule);
  const telling: StrataUnit[] = [];
  for (const u of land) {
    const all = whole(u);
    let any = false;
    for (const l of u.lithologies) {
      const base = unitLaidDownAs(l.name, l, rule);
      if (!base || !Object.keys(base).length) continue;
      any = true;
      tally.add(base, l.attributes, l.share / all / land.length);
    }
    if (any) telling.push(u);
  }
  const made = tally.made();
  const substrate: SceneSubstrate | undefined = made ? { tier: 'model', from: 'strata', weight: round(Math.min(1, tally.said())), ...made, source: of.source, rows: rowsOf(telling), sites: telling.length, km: 0, ...(credit ? { credit } : {}), units: named(telling), column: column.name } : undefined;
  const lava = rock(land, true, (l) => r.surface_types.includes(l.type));
  return { ...(substrate ? { substrate } : {}), ...(lava ? { bedrock: lava } : {}) };
}

/**
 * Which answer a place's ground takes, of those it has.
 *
 * First the rocks of the stage where a fossil collection lies at the place itself: a rock described there, in its
 * describer's own words for its colour and its cracks, and so evidence of the place. Then today's topsoil, where the
 * time is one it is held for: a model, of the place's very surface. Then the unit its column of rock has being laid
 * down at the time. Then the rocks of the country round, a model of the place's surroundings.
 *
 * A column's unit comes after a collection at the place because a column is put together for a whole area, and does
 * not say where in it each rock lies: it is a model of the area, and the collection is of the spot. It comes after
 * the topsoil because the topsoil is the surface itself and a column's youngest unit is whatever was last laid down in
 * its area, over a span far longer than the Holocene. And it comes before the rocks of the country round because its
 * footprint holds the place and its unit is dated to the time, where those collections lie as far as a couple of
 * hundred km off, and decide part of the ground only.
 */
export function firstGround(rocks: SceneSubstrate | undefined, soil: () => SceneSubstrate | undefined, strata: () => SceneSubstrate | undefined = () => undefined): SceneSubstrate | undefined {
  return rocks?.tier === 'evidence' ? rocks : soil() ?? strata() ?? rocks;
}

/**
 * Which answer the rock under a place's ground takes: today's map of bedrock, where the time is one it is held for,
 * and failing that the units of the place's column of rock. Through the Quaternary the map comes first: it is of the
 * surface itself, it is finer than most columns, and it is the same map on both sides of a column's edge. Before the
 * Quaternary the map has no ages to be carried back by, and only the columns answer.
 */
export function firstRock(map: SceneBedrock | undefined, strata: () => SceneBedrock | undefined): SceneBedrock | undefined {
  return map ?? strata();
}

/** What a material is called in a ground: a soil's finest part is its clay, and its coarse fragments its stones. */
const wordOf = (s: SceneSubstrate, m: GroundMaterial): string => (s.from === 'soil' ? SOIL_WORDS[m] : undefined) ?? MATERIAL_WORDS[m];

/** A ground in a word or two: its main materials. */
export function substrateShort(s: SceneSubstrate): string {
  return s.materials
    .filter(([, w], i) => i === 0 || w >= 0.25)
    .slice(0, 2)
    .map(([m]) => wordOf(s, m))
    .join(' and ');
}

/** A ground in a sentence, for a panel: what it is made of and what says so. */
export function substrateWords(s: SceneSubstrate): string {
  const made = s.materials
    .filter(([, w]) => w >= 0.1)
    .slice(0, 3)
    .map(([m]) => wordOf(s, m))
    .join(', ');
  if (s.from === 'soil') return `Ground of ${made}: today's topsoil here${s.held ? `, held as it is through the ${s.held}` : ''}`;
  const coloured = s.colours.filter(([, w]) => w >= 0.2).slice(0, 2).map(([c]) => c);
  const what = `${made}${coloured.length ? `, ${coloured.join(' and ')}` : ''}`;
  if (s.from === 'strata') {
    const units = s.units ?? [];
    return `${s.weight >= 0.5 ? 'Ground of' : 'Ground partly of'} ${what}: ${unitsWords(units)}, the unit${units.length === 1 ? '' : 's'} being laid down then in the column of rock for ${s.column ?? 'this place'}`;
  }
  const from = `${s.sites} fossil collection${s.sites === 1 ? '' : 's'}`;
  return s.tier === 'evidence' ? `Ground of ${what}: the rock of ${from} within ${s.km} km` : `Ground partly of ${what}: the rock of ${from} of the country round, the nearest ${s.km} km off`;
}

/** An age in Ma as it is written: to a tenth of a million years, or finer where it is young. */
const ma = (x: number): string => {
  const s = x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

/** Some units by their names, with the ages they were laid down between: the oldest of their starts and the youngest of their ends. */
function unitsWords(units: SceneUnit[]): string {
  const names = [...new Set(units.map((u) => u.name || 'a unit with no name'))];
  const called = names.length <= 2 ? names.join(' and ') : `${names[0]}, ${names[1]} and ${names.length - 2} more`;
  if (!units.length) return 'a unit';
  const older = Math.max(...units.map((u) => u.older));
  const younger = Math.min(...units.map((u) => u.younger));
  return `${called}, ${younger > 0 ? `${ma(older)} to ${ma(younger)} Ma` : `${ma(older)} Ma to the present`}`;
}

/** The rock under a ground in a few words: as its map names its class, or as its unit's dataset names its lithologies. */
export const bedrockShort = (b: SceneBedrock): string => b.label.toLowerCase();

/**
 * What the layer answers at a place (core/resolve.ts), from a scene's ground and the rock under it: the loose ground
 * where something says what it is, and failing that the rock. `from` says what answered: for the rock, a map of
 * today's bedrock or, as `strata-under`, the units of a column.
 */
export function groundAnswer(s: SceneSubstrate | undefined, b: SceneBedrock | undefined): { tier: 'evidence' | 'model'; words: string; from: 'rocks' | 'soil' | 'strata' | 'bedrock' | 'strata-under'; held?: string } | undefined {
  if (s) return { tier: s.tier, words: substrateShort(s), from: s.from, ...(s.held ? { held: s.held } : {}) };
  if (b) return { tier: 'model', words: b.rock ? `over ${bedrockShort(b)}` : bedrockShort(b), from: b.from === 'strata' ? 'strata-under' : 'bedrock', ...(b.held ? { held: b.held } : {}) };
  return undefined;
}

/** And in a sentence, for a panel. */
export function bedrockWords(b: SceneBedrock): string {
  const what = b.rock ? `Over ${bedrockShort(b)}` : `On ${bedrockShort(b)}`;
  if (b.from === 'strata') {
    const units = b.units ?? [];
    const column = `the column of rock for ${b.column ?? 'this place'}`;
    return `${what}: ${unitsWords(units)}, ${b.laid ? `being laid down then in ${column}` : `the youngest unit${units.length === 1 ? '' : 's'} from before this time in ${column}`}`;
  }
  return `${what}: today's map of the rock at the surface${b.held ? `, carried back on its plate through the ${b.held}` : ''}`;
}

/** What each material is called in a sentence. */
export const MATERIAL_WORDS: Record<GroundMaterial, string> = {
  sand: 'sand',
  gravel: 'gravel',
  silt: 'silt',
  mud: 'mud',
  lime: 'lime mud',
  evaporite: 'salt crust',
  organic: 'peat',
  ash: 'ash',
};

/** And in a soil read from a map, where they differ: its mud is its clay, and its gravel the stones in it. */
const SOIL_WORDS: Partial<Record<GroundMaterial, string>> = { mud: 'clay', gravel: 'stones' };
