// What the ground of a place is made of (field:earth/substrate; docs/SCENES.md, "Substrate"): the loose material a
// scene's ground is drawn as, with the colours and the marks its sources name, and the rock under it. In deep time it
// is read from the rock record near the place (core/rocks.ts): a sandstone was laid down as sand, and what a
// collection says of its rock's colour and cracks it says of the ground the rock was. Nearer the present it is read
// from today's maps, held back in time and carried on the plate under them: the topsoil's sand, silt, clay and stones
// (field:earth/soil), and the class of rock under it (field:earth/bedrock). Which rock is which ground is the model's,
// as data (world/fields/earth/substrate.yaml); how sand, a crust of salt or a basalt looks is the renderer's.
import { rocksNear, type RockBoxes, type RockSite, type RocksBin, type RocksIndex } from './rocks.ts';

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
  /** what an adjective of a lithology says: a colour, a mark, or that a share of it was another material */
  adjectives: Record<string, { colour?: string; mark?: string; material?: string; share?: number }>;
  /** which material each part of a topsoil is drawn as, where the world has a map of today's (field:earth/soil) */
  soil?: Record<SoilPart, GroundMaterial>;
  /** what kind of rock each class of a map of today's bedrock is, by the class's code (field:earth/bedrock): a class with no kind is loose sediment, and one with no entry says nothing of the ground */
  bedrock?: Record<string, { rock?: RockKind }>;
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

/** The rock under a scene's ground, where a map of today's bedrock says, the place carried on its plate to where it is today. */
export interface SceneBedrock {
  /** always a model: today's map, held back in time */
  tier: 'model';
  /** the class as the map names it, and its code */
  code: string;
  label: string;
  /** the kind of rock, for one that is rock: loose sediment has none */
  rock?: RockKind;
  field: string;
  source: string;
  /** what the map is credited as, and the name of the span it is held for */
  credit?: string;
  held?: string;
}

/** The ground of a scene, where something says what it was. Without one, the climate's class decides, generically. */
export interface SceneSubstrate {
  /** evidence where a source says it of the place itself; model where it is carried from the country round, or from today */
  tier: 'evidence' | 'model';
  /** what it is read from: the rocks of the stage's fossil collections, or a map of today's topsoil held back in time */
  from: 'rocks' | 'soil';
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
  /** for a map of today's held back in time: what it is credited as, and the name of the span it is held for */
  credit?: string;
  held?: string;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const isMaterial = (m: string): m is GroundMaterial => (GROUND_MATERIALS as readonly string[]).includes(m);
const isMark = (m: string): m is GroundMark => (GROUND_MARKS as readonly string[]).includes(m);

/** What a lithology was laid down as, by the rule: by its own name, or its type's; undefined where neither says. */
export function laidDownAs(lithology: string, type: string | undefined, rule: Pick<SubstrateRule, 'lithologies' | 'types'>): MaterialShares | undefined {
  return rule.lithologies[lithology] ?? (type ? rule.types[type] : undefined);
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
  const material = new Map<GroundMaterial, number>();
  const colour = new Map<string, number>();
  const mark = new Map<GroundMark, number>();
  const add = <K>(m: Map<K, number>, k: K, w: number) => m.set(k, (m.get(k) ?? 0) + w);
  let said = 0;
  const telling: (RockSite & { km: number })[] = [];
  for (const s of used) {
    let any = false;
    for (const l of s.lithologies) {
      const base = laidDownAs(l.name, index.lithologies[l.name], rule);
      if (!base) continue;
      any = true;
      const w = s.share / s.lithologies.length;
      said += w;
      // What its adjectives make of it: some of it another material, and the rest as its name says. Two adjectives
      // that say one thing, "fine" and "very fine", say it once.
      let other = 0;
      const told = new Set<string>();
      const once = (k: string) => !told.has(k) && !!told.add(k);
      for (const a of l.adjectives) {
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
    }
    if (any) telling.push(s);
  }
  const total = [...material.values()].reduce((a, b) => a + b, 0);
  if (!total || !said) return undefined;
  const sorted = <K extends string>(m: Map<K, number>, of: number): [K, number][] => [...m].map(([k, w]): [K, number] => [k, round(w / of)]).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return {
    tier: here.length ? 'evidence' : 'model',
    from: 'rocks',
    weight: here.length ? 1 : rule.near_weight,
    materials: sorted(material, total),
    colours: sorted(colour, said),
    marks: sorted(mark, said),
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
  return { tier: 'model', code: c.code, label: c.label, ...(read.rock ? { rock: read.rock } : {}), field: g.field, source: g.source, ...(g.credit ? { credit: g.credit } : {}), ...(g.held ? { held: g.held } : {}) };
}

/**
 * Which of two answers a place's ground takes: the rocks of the stage where a collection lies at the place itself,
 * which is evidence; failing that today's topsoil, where the time is one it is held for, a model of the place itself;
 * and failing that the rocks of the country round, a model of its surroundings.
 */
export function firstGround(rocks: SceneSubstrate | undefined, soil: () => SceneSubstrate | undefined): SceneSubstrate | undefined {
  return rocks?.tier === 'evidence' ? rocks : soil() ?? rocks;
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
  const from = `${s.sites} fossil collection${s.sites === 1 ? '' : 's'}`;
  return s.tier === 'evidence' ? `Ground of ${what}: the rock of ${from} within ${s.km} km` : `Ground partly of ${what}: the rock of ${from} of the country round, the nearest ${s.km} km off`;
}

/** The rock under a ground in a few words, as its map names its class. */
export const bedrockShort = (b: SceneBedrock): string => b.label.toLowerCase();

/**
 * What the layer answers at a place (core/resolve.ts), from a scene's ground and the rock under it: the loose ground
 * where something says what it is, and failing that the rock.
 */
export function groundAnswer(s: SceneSubstrate | undefined, b: SceneBedrock | undefined): { tier: 'evidence' | 'model'; words: string; from: 'rocks' | 'soil' | 'bedrock'; held?: string } | undefined {
  if (s) return { tier: s.tier, words: substrateShort(s), from: s.from, ...(s.held ? { held: s.held } : {}) };
  if (b) return { tier: 'model', words: b.rock ? `over ${bedrockShort(b)}` : bedrockShort(b), from: 'bedrock', ...(b.held ? { held: b.held } : {}) };
  return undefined;
}

/** And in a sentence, for a panel. */
export function bedrockWords(b: SceneBedrock): string {
  const what = b.rock ? `Over ${bedrockShort(b)}` : `On ${bedrockShort(b)}`;
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
