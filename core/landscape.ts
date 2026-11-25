// The anonymous human landscape (docs/HUMAN-LANDSCAPE.md): what kind of place any piece of land was at any time since
// 10,000 BCE, as three things say it, in the build and the viewer alike.
//
//   anthromes     Anthromes 12K's class of each 5′ cell at each of its 73 steps: urban, villages, croplands,
//                 rangelands, woodlands or wild, by thresholds on HYDE 3.2's people and land use. A model.
//   assessments   ArchaeoGLOBE's archaeologists on how widespread foraging, pastoralism and extensive and
//                 intensive farming were in each of 146 regions at ten times, and whether it had cities. Evidence,
//                 of the kind an expert's reading of the evidence is.
//   population    HYDE 3.2.1's people in each 1° cell, shared out over its 5′ cells by their classes.
//
// model:people/lifeways joins them into what a scene draws: a pattern of settlement (camps, hamlets, villages,
// towns), how many people, what they did on the land, and how sure each part is. Nothing here is a fact about any
// place: the classes' thresholds are the classification's own, quoted in the field's record.
import type { Agriculture, Husbandry, LifewayWord, TownSpec, Tradition } from './dwelling.ts';
import type { Form } from './form.ts';
import type { LivingTaxon, ScenePeople } from './scene.ts';
import { centralAt, cityPopulation, densityPrior, dispersedAt, populationSpan, type DensityAnchor, type Figure, type Observation, type PeopleModel, type Population, type PopulationInput } from './citypop.ts';
import { peopleAt as peopleAtSeries, type PeopleSeries } from './growth.ts';

/** A class of Anthromes 12K: its code in the grids, its name and broader level, the legend's colour, and what it means. */
export interface AnthromeClass {
  code: number;
  label: string;
  level: 'Dense settlements' | 'Villages' | 'Croplands' | 'Rangelands' | 'Seminatural' | 'Wildlands' | 'No data';
  rgb: [number, number, number];
  /** people to the km² of land the class requires, as the classification's thresholds set them: [at least, below] */
  density: [number, number];
  /** what at least a fifth of its land is used for, where the class says */
  use?: 'urban' | 'rice' | 'irrigated' | 'rainfed' | 'crops' | 'pastoral';
  /** whether its potential vegetation is woody, where the class says */
  woody?: boolean;
}

/** The classes as the field's record lists them (field:people/anthromes, params.classes), numbered from 1 by the build; 0 is no land. */
export const anthromeOf = (classes: AnthromeClass[], i: number): AnthromeClass | undefined => (i > 0 ? classes[i - 1] : undefined);

// ——— Time ———

/** The step nearest a time, of steps in order; the earlier where two are as near. -1 outside them. */
export function nearestStep(steps: number[], t: number): number {
  if (!steps.length || t < steps[0] - stepHalf(steps, 0) || t > steps.at(-1)! + stepHalf(steps, steps.length - 1)) return -1;
  let lo = 0;
  let hi = steps.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (steps[m] < t) lo = m + 1;
    else hi = m;
  }
  if (lo > 0 && t - steps[lo - 1] <= steps[lo] - t) return lo - 1;
  return lo;
}

/** Half the gap to a step's neighbour, at the ends: how far beyond its first and last step a field is held. */
function stepHalf(steps: number[], i: number): number {
  if (steps.length < 2) return 0;
  return i === 0 ? (steps[1] - steps[0]) / 2 : (steps[i] - steps[i - 1]) / 2;
}

// ——— The anthromes' tiles ———

/** A square of 5′ cells and each cell's classes through time, as runs: the class, and the step it begins at. */
export interface AnthromeTileHeader {
  format: 'lightworld-anthromes@1';
  /** the north-west corner, in degrees, how many cells across and down, and how many degrees each is */
  north: number;
  west: number;
  nx: number;
  ny: number;
  res: number;
  steps: number[];
}

export interface AnthromeTile extends AnthromeTileHeader {
  /** for each cell, by row from the north: how many runs it has; 0 is no land at any step */
  counts: Uint8Array;
  /** where each cell's runs begin in `runs`, in pairs */
  offsets: Uint32Array;
  /** pairs: a class's number, and the step its run begins at */
  runs: Uint8Array;
  /** for each cell, the ArchaeoGLOBE region it is in; 0 for none */
  region: Uint8Array;
}

/** A tile from its arrays: counts, runs and regions. */
export function anthromeTile(header: AnthromeTileHeader, counts: Uint8Array, runs: Uint8Array, region: Uint8Array): AnthromeTile {
  const offsets = new Uint32Array(counts.length + 1);
  for (let i = 0; i < counts.length; i++) offsets[i + 1] = offsets[i] + counts[i];
  if (offsets[counts.length] * 2 !== runs.length) throw new Error(`an anthromes tile has ${runs.length / 2} runs where its counts add up to ${offsets[counts.length]}`);
  return { ...header, counts, offsets, runs, region };
}

/** A cell's class at a step: the run that holds it. */
export function classAtStep(tile: AnthromeTile, cell: number, step: number): number {
  const a = tile.offsets[cell];
  const b = tile.offsets[cell + 1];
  let out = 0;
  for (let k = a; k < b; k++) {
    if (tile.runs[2 * k + 1] > step) break;
    out = tile.runs[2 * k];
  }
  return out;
}

/** The cell of a tile a place falls in, or -1. */
export function cellOf(tile: Pick<AnthromeTileHeader, 'north' | 'west' | 'nx' | 'ny' | 'res'>, lat: number, lon: number): number {
  let row = Math.floor((tile.north - lat) / tile.res + 1e-9);
  if (row === tile.ny && lat <= -90 + 1e-9 && tile.north - tile.ny * tile.res <= -90 + 1e-9) row = tile.ny - 1;
  let dl = lon - tile.west;
  dl -= 360 * Math.floor(dl / 360);
  const col = Math.floor(dl / tile.res + 1e-9);
  if (row < 0 || row >= tile.ny || col < 0 || col >= tile.nx) return -1;
  return row * tile.nx + col;
}

/** The tile a place falls in: its north-west corner, on a grid of tiles `deg` wide. */
export function tileKey(lat: number, lon: number, deg: number): { north: number; west: number; key: string } {
  // A place on a tile's northern edge is in that tile, as its cells count rows from the north.
  const north = Math.max(-90 + deg, Math.min(90, Math.ceil(lat / deg) * deg));
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  const west = Math.floor(l / deg) * deg;
  return { north, west, key: `${north}_${west}` };
}

// ——— ArchaeoGLOBE ———

export const LEVEL_WORDS = ['None', 'Minimal', 'Common', 'Widespread'] as const;
export type Level = 0 | 1 | 2 | 3;
export const USES = ['foraging', 'extensive', 'intensive', 'pastoral'] as const;
export type Use = (typeof USES)[number];

export const USE_LABEL: Record<Use, string> = {
  foraging: 'foraging, hunting and fishing',
  extensive: 'shifting cultivation',
  intensive: 'continuous farming',
  pastoral: 'herding',
};

/** One region at one time: each use as its consensus, least, median and most answer; cities; how well it is known. */
export interface Assessment {
  /** foraging, extensive, intensive, pastoral: [consensus, least, median, most], each a level 0–3 */
  use: [number, number, number, number][];
  /** the consensus on dense urban centres, and the median answer: 1 present, 0 absent, 2 split */
  urban: number;
  urbanMedian: number;
  /** median data quality, 0–2, and mean expertise, 0–2 */
  quality: number;
  expertise: number;
}

export interface AssessmentsFile {
  format: 'lightworld-assessments@1';
  source: string;
  title: string;
  /** the survey's times, on the axis, with their labels */
  slices: { year: number; label: string }[];
  regions: { id: number; label: string }[];
  /** by region id, then by slice */
  rows: Record<string, Assessment[]>;
}

/** The region's assessment at the slice nearest a time; undefined before half a slice's gap ahead of the first, or for no region. */
export function assessmentAt(f: AssessmentsFile, region: number, t: number): { a: Assessment; slice: number } | undefined {
  const rows = f.rows[String(region)];
  if (!rows) return undefined;
  const years = f.slices.map((s) => s.year);
  const i = nearestStep(years, t);
  // The last slice, 1850 CE, holds to the present: the survey asked nothing later.
  const k = i >= 0 ? i : t > years.at(-1)! ? years.length - 1 : -1;
  return k >= 0 ? { a: rows[k], slice: k } : undefined;
}

// ——— The lifeway: what a scene draws ———

/** How people lived on a piece of land, as the generator draws it. */
export type Pattern = 'none' | 'foragers' | 'herders' | 'shifting' | 'farmsteads' | 'hamlets' | 'villages' | 'towns' | 'city';

export const PATTERN_LABEL: Record<Pattern, string> = {
  none: 'No one lived here',
  foragers: "Foragers' camps",
  herders: "Herders' camps",
  shifting: 'Shifting cultivators',
  farmsteads: 'Scattered farmsteads',
  hamlets: 'Farming hamlets',
  villages: 'Farming villages',
  towns: 'Towns',
  city: 'A city',
};

/**
 * The way of life of each pattern of settlement, as a building tradition's `lifeway` claim names it (core/dwelling.ts):
 * whose house a tradition's is. Farmsteads, hamlets and villages are all farmers'; towns and cities, townspeople's.
 */
export const LIFEWAY_OF: Record<Exclude<Pattern, 'none'>, LifewayWord> = {
  foragers: 'foragers',
  herders: 'herders',
  shifting: 'shifting-cultivators',
  farmsteads: 'farmers',
  hamlets: 'farmers',
  villages: 'farmers',
  towns: 'townspeople',
  city: 'townspeople',
};

/** What the fields are, where there are any. */
export type FieldUse = 'none' | 'swidden' | 'rainfed' | 'irrigated' | 'rice' | 'pasture';

export interface Lifeway {
  pattern: Pattern;
  fields: FieldUse;
  /** the anthrome it rests on, by the build's number, and the people to the km² the generator draws */
  anthrome: number;
  density: number;
  /** evidence where the region's archaeologists say this way of life was there then; model where only HYDE does */
  tier: 'evidence' | 'model' | 'generic' | 'unknown';
  /** in a sentence each: why this pattern, and where the archaeologists and HYDE disagree */
  why: string;
  disagrees?: string;
}

const level = (a: Assessment | undefined, u: Use): number => (a ? a.use[USES.indexOf(u)][0] : -1);

/**
 * The lifeway at a place: the anthrome's density and land use say where people were and how many; the region's
 * assessment says which way of life it was where the anthrome has no use of the land, and is the evidence the pattern
 * rests on where it agrees. The rules are the model's choices (model:people/lifeways), and say so.
 */
export function lifewayOf(classes: AnthromeClass[], anthrome: number, density: number, a: Assessment | undefined): Lifeway {
  const c = anthromeOf(classes, anthrome);
  const out = (pattern: Pattern, fields: FieldUse, why: string): Lifeway => ({ pattern, fields, anthrome, density, tier: 'model', why });
  if (!c || c.code === 70) return { pattern: 'none', fields: 'none', anthrome, density: 0, tier: 'unknown', why: 'No land is classified here.' };
  const forage = level(a, 'foraging');
  const swidden = level(a, 'extensive');
  const farm = level(a, 'intensive');
  const herd = level(a, 'pastoral');
  const farming = Math.max(swidden, farm);
  let l: Lifeway;
  if (c.use === 'urban') l = out('city', 'none', 'HYDE puts so many people here, or so much built up, that the cell is urban.');
  else if (c.code === 12) l = out('towns', farm >= 1 ? 'rainfed' : 'none', 'Over 100 people to the km² with no one use of the land, where HYDE has no villages: dense settlement.');
  else if (c.level === 'Villages')
    l = out('villages', c.use === 'rice' ? 'rice' : c.use === 'irrigated' ? 'irrigated' : c.use === 'pastoral' ? 'pasture' : 'rainfed', `Over 100 people to the km², with a fifth of the land ${c.use === 'pastoral' ? 'grazed' : c.use === 'rice' ? 'in rice' : c.use === 'irrigated' ? 'irrigated' : 'in rainfed crops'}.`);
  else if (c.level === 'Croplands') {
    const use: FieldUse = c.use === 'irrigated' ? 'irrigated' : swidden > farm ? 'swidden' : 'rainfed';
    l = out(c.code === 31 || c.code === 32 ? 'hamlets' : 'farmsteads', use, `A fifth of the land in crops, with ${c.density[0]}–${c.density[1]} people to the km².`);
  } else if (c.level === 'Rangelands') l = out(c.code === 41 ? 'hamlets' : 'herders', 'pasture', 'A fifth of the land grazed, and few people.');
  else if (c.level === 'Wildlands') l = { ...out('none', 'none', 'HYDE puts no one here, and no use of the land.'), tier: 'model' };
  else {
    // Seminatural: people, but no use of a fifth of the land. The region's archaeologists say which way of life: the most
    // widespread of foraging, herding, shifting cultivation and continuous farming then. Where two are as widespread, a
    // cell with a person to the km² or more is taken for farmers, and a remote one for foragers or herders.
    const settled = c.density[0] >= 1;
    const order: [Pattern, FieldUse, number][] = settled
      ? [['farmsteads', 'rainfed', farm], ['shifting', 'swidden', swidden], ['herders', 'pasture', herd], ['foragers', 'none', forage]]
      : [['foragers', 'none', forage], ['herders', 'pasture', herd], ['shifting', 'swidden', swidden], ['farmsteads', 'rainfed', farm]];
    let pick = order[0];
    for (const o of order) if (o[2] > pick[2]) pick = o;
    const words: Record<string, string> = { farmsteads: 'continuous farming', shifting: 'shifting cultivation', herders: 'herding', foragers: 'foraging' };
    if (pick[2] <= 0) l = { ...out('foragers', 'none', 'People, and no use of the land HYDE can see; nothing more is known, so foragers stand in.'), tier: a ? 'model' : 'generic' };
    else l = out(pick[0], pick[1], `People in ${c.woody === false ? 'open country' : 'woodland'}, and the region's archaeologists say ${words[pick[0]]} was as widespread as anything then.`);
  }
  if (!a) return l.tier === 'model' && l.pattern !== 'none' && !c.use ? { ...l, tier: 'generic' } : l;
  // Where the archaeologists of the region agree with the pattern, it rests on them; where they do not, say so.
  const says: Record<Pattern, number> = { none: Math.max(-1, 3 - Math.max(forage, farming, herd)), foragers: forage, herders: herd, shifting: swidden, farmsteads: farming, hamlets: farming, villages: farming, towns: Math.max(farming, a.urban ? 2 : 0), city: a.urban === 1 ? 3 : 0 };
  if (l.pattern === 'none') {
    if (farming >= 2 || herd >= 2 || forage >= 2) l.disagrees = `HYDE puts no one here, but the region's archaeologists say ${[forage >= 2 && 'foraging', farming >= 2 && 'farming', herd >= 2 && 'herding'].filter(Boolean).join(' and ')} was common or widespread then.`;
    return l;
  }
  if (says[l.pattern] >= 1) l.tier = 'evidence';
  if (l.fields !== 'none' && l.fields !== 'pasture' && farming === 0) l.disagrees = 'HYDE has fields here, but the region\'s archaeologists found no farming there then.';
  else if (l.pattern === 'city' && a.urban === 0) l.disagrees = 'HYDE has a city here, but the region\'s archaeologists say it had no dense urban centres then.';
  else if (l.fields === 'pasture' && herd === 0) l.disagrees = 'HYDE has grazing here, but the region\'s archaeologists found no herding there then.';
  if (l.disagrees) l.tier = 'model';
  return l;
}

/**
 * HYDE's people of a 1° cell shared over its 5′ cells: each takes a share in proportion to the middle of its class's band
 * of density (geometric, for a band that spans a factor), times its land. A cell of a class with no people takes none. The
 * shares add up to the 1° cell's people, so the generator's houses add up to HYDE's total.
 */
export function shareDensity(table: AnthromeClass[], classes: number[], land: number[], people: number): number[] {
  const weight = classes.map((k, i) => {
    const c = anthromeOf(table, k);
    if (!c || c.density[1] <= 0.0001) return 0;
    const lo = Math.max(c.density[0], 0.01);
    const hi = Math.min(c.density[1], 10000);
    return Math.sqrt(lo * hi) * land[i];
  });
  const total = weight.reduce((s, w) => s + w, 0);
  return classes.map((_, i) => (total > 0 && land[i] > 0 ? (people * weight[i]) / total / land[i] : 0));
}

// ——— Whose houses rest on a tradition ———

/**
 * At a time: HYDE's people as the model places them, by the pattern of settlement it gives their 5′ cell, and how many of
 * each are drawn in a house of a building tradition written for their way of life, region and time. The rest are drawn
 * in the generator's generic house (docs/plans/LIFEWAY-RENDERINGS.md).
 */
export interface HousingCount {
  t: number;
  /** HYDE's people the model places, and how many of them a tradition houses */
  people: number;
  housed: number;
  /** of those housed, how many in the house of a way of life kin to theirs, standing in (core/dwelling.ts, LIFEWAY_KIN) */
  standIn?: number;
  /** by pattern of settlement: [people, housed] */
  by: Partial<Record<Exclude<Pattern, 'none'>, [number, number]>>;
  /** the regions with people, and those where a tradition houses any of them */
  regions: [number, number];
  /** the lists' cities standing then, their people, and the people of those a townspeople's tradition houses */
  cities: [number, number, number];
}

// ——— Cities ———

/** A city of a compiler's list: where it is placed, and its people at the years the list gives, on the axis. */
export interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** how sure the placing is, as the file gives it */
  certainty: number;
  /** the dataset and the field it comes from */
  source: string;
  field: string;
  /** [year, people], in order */
  pops: [number, number][];
}

/**
 * A settlement the world has a record of, as the landscape reads it (docs/plans/LIFEWAY-RENDERINGS.md, step 4): where and
 * when it stood, and what its own claims say of its people, its houses, the ground it covered and how it was laid out. A
 * scene draws it from these, and from a list's figure only where its record gives none.
 */
export interface CityRecord {
  id: string;
  name: string;
  /** its names in turn, where they have their times: each with when it was in use */
  names?: { text: string; span: [number, number] }[];
  lat: number;
  lon: number;
  /** when it stood, on the axis: [start, end]; a billion years either way stands for no bound */
  span: [number, number];
  /**
   * Its claims of its people, its ground and its houses, each with the ground it counts and the years it is for, as the
   * population model reads them (core/citypop.ts). A build made before version 11 of the settlement generator gives
   * `pops`, `areas` and `houses` instead, one figure to a time (figuresOf reads either).
   */
  figures?: Figure[];
  pops?: [number, number][];
  areas?: [number, number][];
  houses?: [number, number][];
  /** HYDE's people within its region's ground, [year, people], where its record gives a region: the build's */
  hyde?: [number, number][];
  /**
   * The places it was centred on, each while it was (a `core` claim's point and years): its town is ranked from those that
   * stood at a time (model:people/settlement-growth). None, and it is centred on its own point.
   */
  cores?: { lat: number; lon: number; span: [number, number] }[];
  /** how it was laid out: its `town_form` claim, and when that held, where the claim says */
  town?: TownSpec;
  townSpan?: [number, number];
}

/** A record's figures: those its build gives, or, from a build made before them, its figures of the settlement one to a time. */
export function figuresOf(r: Pick<CityRecord, 'id' | 'figures' | 'pops' | 'areas' | 'houses'>): Figure[] {
  if (r.figures) return r.figures;
  const old = (prop: Figure['prop'], points: [number, number][] | undefined): Figure[] => (points ?? []).map(([t, v]) => ({ prop, ground: 'settlement', t: [t, t], v, source: r.id, preferred: true }));
  return [...old('population', r.pops), ...old('settlement_area', r.areas), ...old('houses', r.houses)];
}

/** A record's figures of one property of the settlement itself, [year, value] at the middle of the years each is for. */
export const ownFigures = (r: Pick<CityRecord, 'id' | 'figures' | 'pops' | 'areas' | 'houses'>, prop: Figure['prop']): [number, number][] =>
  figuresOf(r)
    .filter((f) => f.prop === prop && f.ground === 'settlement' && f.t)
    .map((f): [number, number] => [(f.t![0] + f.t![1]) / 2, f.v])
    .sort((a, b) => a[0] - b[0]);

export interface CitiesFile {
  format: 'lightworld-cities@1';
  /**
   * each list: its dataset, field and title; how long a city is held either side of a figure; and the longest gap between
   * two figures across which it is taken to have stood all along, its people straight between them
   */
  lists: { source: string; field: string; title: string; hold: number; gap: number }[];
  cities: City[];
  /** the settlements the world has records of, with a place */
  records?: CityRecord[];
  /**
   * The population model as the build fitted it (core/citypop.ts, model:people/density): its parameters, and the
   * settlements whose own figures say how densely they lived, which the others' density scales are pulled towards.
   * Absent from a build made before version 11 of the settlement generator, which then takes the model's defaults.
   */
  model?: { params?: Partial<PeopleModel>; anchors?: DensityAnchor[] };
}

/** A record's name at a time: the one in use then, where its names have their times; else its name. */
export const nameAt = (r: Pick<CityRecord, 'name' | 'names'>, t: number): string => r.names?.find((n) => t >= n.span[0] && t <= n.span[1])?.text ?? r.name;

/**
 * A figure of a record at a time: straight between two times its claims are for, and the nearest one's before the first
 * and after the last, while the record stands. Undefined where it has no such claims.
 */
export function figureAt(points: [number, number][], t: number): number | undefined {
  if (!points.length) return undefined;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, va] = points[i];
    const [b, vb] = points[i + 1];
    if (t <= b) return b > a ? va + ((vb - va) * (t - a)) / (b - a) : vb;
  }
  return points.at(-1)![1];
}

/** A city a scene draws: a list's, a record's, or both as one. */
export interface CityNear {
  name: string;
  country: string;
  lat: number;
  lon: number;
  people: number;
  km: number;
  /** the list its people are from, where they are a list's: its field and dataset */
  field?: string;
  source?: string;
  /** what the other list says of it */
  also: { people: number; field: string; source: string }[];
  /** the record it has, and what the record's own claims give at the time: its people, its houses, its ground in hectares, its layout */
  record?: string;
  /**
   * What its people rest on (model:people/city-population): its record's own figures of them, the lists' alone, or, with
   * neither, its record's ground or houses and the density of the settlements near it
   */
  from: 'record' | 'list' | 'guess';
  houses?: number;
  area?: number;
  town?: TownSpec;
  /** the band about its people at the time, as the model gives it: [lower, higher] */
  band?: [number, number];
  /** what the settlement generator lays the city out from through the whole of its life (docs/plans/CITIES.md) */
  life?: CityLife;
}

/** A figure as the population model read it, for the panel: what it says, whether it was read, and what the model gives for it. */
export type CityObservation = Pick<Observation, 'source' | 'claim' | 'list' | 'prop' | 'ground' | 't' | 'v' | 'lo' | 'hi' | 'use' | 'by' | 'fit' | 'loo'>;

/**
 * A city through the whole of its life, as the settlement generator lays it out (world/generators/people/settlement/
 * town.ts): a stable name to seed it by, when it stood, its people as members of a band (core/citypop.ts), the areas its
 * record gives, the directions of the places it dealt with, and when its own record's town form held.
 */
export interface CityLife {
  key: string;
  span: [number, number];
  members: PeopleSeries[];
  areas: { t: number; ha: number }[];
  /**
   * The density it is laid out at, people to the hectare at 10,000 people, as the population model gives it from its own
   * figures and its neighbours' (core/citypop.ts); absent, the growth model sets it from `areas` as before version 11
   */
  at10k?: number;
  /** its density scale's log prior and posterior, mean and sd, for the panel */
  density?: { prior: [number, number]; post: [number, number] };
  /** its region, where its record gives one: its ground in hectares, and its people through time as members */
  region?: { ha: number; members: PeopleSeries[] };
  /** the places it was centred on, in its own metres about its point, each with the years it was */
  cores?: { x: number; y: number; from: number; to: number }[];
  /** every figure the model read of it, and how */
  observations?: CityObservation[];
  /** radians from east, the most important first */
  toward: number[];
  /** how its record says it was laid out (its `town_form`), whatever the time, and the years that held */
  town?: TownSpec;
  townSpan?: [number, number];
  /**
   * Its recorded walls and roads, where a map of the city gives them (a dataset's `import.site`), in the city's own metres
   * about its point: a wall's ring and the years it stood, a road's line. They take the place of a generated wall and
   * stand beside the generated routes in its frame.
   */
  walls?: { ring: number[]; from: number; to: number }[];
  roads?: number[][];
  /** its districts' label points, in its own metres, and how many buildings a record counts in each */
  districts?: { at: [number, number]; buildings: number }[];
}

/** How far the places a city dealt with are looked for, km, and how many of them its routes lead to at most. */
export const TOWARD = { km: 90, most: 6, merge: 5 };

/** The bearing from one place to another, radians from east, on a plane about the first. */
function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dx = (lon2 - lon1) * Math.cos((lat1 * Math.PI) / 180);
  const dy = lat2 - lat1;
  return Math.atan2(dy, dx);
}

/**
 * The directions of the places a city dealt with: the other cities of the lists and the records within reach of it,
 * the largest and nearest first, by the most people each ever had over how far off it is. They are the same whatever
 * the time, so a city's routes are the same through its life.
 */
export function towardOf(f: Pick<CitiesFile, 'cities' | 'records'>, lat: number, lon: number): number[] {
  const found: { b: number; score: number }[] = [];
  const dLat = TOWARD.km / 111;
  const consider = (la: number, lo: number, pops: [number, number][]) => {
    if (Math.abs(la - lat) > dLat) return;
    const d = kmBetween(lat, lon, la, lo);
    if (d > TOWARD.km || d < TOWARD.merge) return;
    const most = Math.max(0, ...pops.map(([, p]) => p));
    if (!(most > 0)) return;
    found.push({ b: bearing(lat, lon, la, lo), score: most / d });
  };
  for (const c of f.cities) consider(c.lat, c.lon, c.pops);
  // A record with no people of its own counts by its houses, at six to a house, or its ground, at a hundred to the hectare.
  for (const r of f.records ?? []) {
    const pops = ownFigures(r, 'population');
    consider(r.lat, r.lon, pops.length ? pops : ownFigures(r, 'houses').length ? ownFigures(r, 'houses').map(([t, h]) => [t, h * 6]) : ownFigures(r, 'settlement_area').map(([t, ha]) => [t, ha * 100]));
  }
  found.sort((a, b) => b.score - a.score || a.b - b.b);
  return found.slice(0, TOWARD.most).map((x) => x.b);
}

/** Metres east and north of a place, on a plane about it. */
function metresFrom(lat0: number, lon0: number, lat: number, lon: number): [number, number] {
  const perDeg = 111194.93;
  return [(lon - lon0) * perDeg * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * perDeg];
}

/** The middle of when a settlement stood, for the density of the settlements near it then. */
const middleOf = (span: [number, number]) => (span[0] + span[1]) / 2;

/**
 * What the population model reads of a city (core/citypop.ts): its lists' rows, its record's figures and span, HYDE's
 * people in its region, the parameters the build fitted, and the prior of its density from the settlements near it
 * then, its own anchor left out so that it is pulled only by its neighbours.
 */
export function populationInput(f: Pick<CitiesFile, 'lists' | 'model'>, lat: number, lon: number, rows: City[], r: CityRecord | undefined, guess: { hold: number }, model?: Partial<PeopleModel>): PopulationInput {
  const list = new Map(f.lists.map((l) => [l.source, l]));
  const lists = rows.map((c) => ({ source: c.source, pops: c.pops, hold: list.get(c.source)?.hold ?? guess.hold }));
  const params = model ?? f.model?.params;
  const input: PopulationInput = { lists, ...(r ? { figures: figuresOf(r), span: r.span } : {}), ...(r?.hyde ? { hyde: r.hyde } : {}), ...(params ? { model: params } : {}) };
  return { ...input, density: densityPrior(f.model?.anchors, lat, lon, middleOf(populationSpan(input)), params, r?.id) };
}

/** A city's people through its life, as the population model gives them from its lists' rows and its record. */
export const populationOf = (f: Pick<CitiesFile, 'lists' | 'model'>, lat: number, lon: number, rows: City[], r: CityRecord | undefined, guess: { hold: number }): Population =>
  cityPopulation(populationInput(f, lat, lon, rows, r, guess));

/** What its people rest on: its record's own figures of them, the lists' alone, or its record's ground or houses. */
function restsOn(pop: Population, rows: City[]): CityNear['from'] {
  const own = pop.observations.filter((o) => !o.list && o.use === 'used');
  if (own.some((o) => o.prop === 'population' && o.ground !== 'region')) return 'record';
  if (rows.length || !own.length) return 'list';
  return 'guess';
}

/** A city's life from its lists' rows and its record. */
function lifeOf(f: CitiesFile, lat: number, lon: number, rows: City[], r: CityRecord | undefined, pop: Population): CityLife {
  const row = rows[0];
  // Its cores, where its record gives them, in its own metres about its point.
  const cores = (r?.cores ?? []).map((c) => {
    const [x, y] = metresFrom(lat, lon, c.lat, c.lon);
    return { x, y, from: c.span[0], to: c.span[1] };
  });
  return {
    key: r ? r.id : `${row.source}#${row.name}@${row.lat.toFixed(3)},${row.lon.toFixed(3)}`,
    span: pop.span,
    members: pop.members,
    areas: r ? ownFigures(r, 'settlement_area').map(([t, ha]) => ({ t, ha })) : [],
    at10k: pop.at10k,
    density: pop.density,
    ...(pop.region ? { region: pop.region } : {}),
    ...(cores.length ? { cores } : {}),
    observations: pop.observations.map(({ source, claim, list, prop, ground, t, v, lo, hi, use, by, fit, loo }) => ({ source, ...(claim ? { claim } : {}), ...(list ? { list } : {}), prop, ground, ...(t ? { t } : {}), v, ...(lo !== undefined ? { lo } : {}), ...(hi !== undefined ? { hi } : {}), use, ...(by ? { by } : {}), ...(fit ? { fit } : {}), ...(loo ? { loo } : {}) })),
    toward: towardOf(f, lat, lon),
    ...(r?.town ? { town: r.town } : {}),
    ...(r?.townSpan ? { townSpan: r.townSpan } : {}),
  };
}


/**
 * A city's people at a time: straight between two years its list gives that are no more than `gap` apart, and held `hold`
 * years either side of any figure; undefined at other times. A longer gap is a silence, not a city standing through it.
 */
export function cityPeople(c: Pick<City, 'pops'>, t: number, hold: number, gap = Infinity): number | undefined {
  const p = c.pops;
  for (let i = 0; i < p.length; i++) {
    const [a, pa] = p[i];
    if (t <= a) return a - t <= hold ? pa : undefined;
    if (i + 1 < p.length) {
      const [b, pb] = p[i + 1];
      if (t <= b) {
        if (b - a <= gap) return Math.round(pa + ((pb - pa) * (t - a)) / (b - a));
        const da = t - a;
        const db = b - t;
        if (db < da && db <= hold) return pb;
        if (da <= hold) return pa;
        if (db <= hold) return pb;
        return undefined;
      }
    } else if (t - a <= hold) return pa;
  }
  return undefined;
}

/** Great-circle distance in km. */
export function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The cities that stand within `km` of a place at a time, nearest first, each with its people then and how far it is.
 * Two lists' figures for one city, within `merge_km` of each other, are one city, drawn with the larger, the other kept
 * beside it as what the other list says.
 */
export function citiesNear(f: Pick<CitiesFile, 'lists' | 'cities'>, lat: number, lon: number, t: number, km: number, mergeKm = 5): { city: City; people: number; km: number; also: { city: City; people: number }[] }[] {
  const list = new Map(f.lists.map((l) => [l.source, l]));
  const found: { city: City; people: number; km: number; also: { city: City; people: number }[] }[] = [];
  const dLat = km / 111;
  for (const c of f.cities) {
    if (Math.abs(c.lat - lat) > dLat) continue;
    const d = kmBetween(lat, lon, c.lat, c.lon);
    if (d > km) continue;
    const l = list.get(c.source);
    const people = cityPeople(c, t, l?.hold ?? 0, l?.gap ?? Infinity);
    if (people !== undefined && people > 0) found.push({ city: c, people, km: Math.round(d * 10) / 10, also: [] });
  }
  found.sort((a, b) => b.people - a.people || (a.city.source < b.city.source ? -1 : a.city.source > b.city.source ? 1 : 0));
  const out: typeof found = [];
  for (const x of found) {
    const same = out.find(
      (y) =>
        y.city.source !== x.city.source &&
        !y.also.some((a) => a.city.source === x.city.source) &&
        kmBetween(x.city.lat, x.city.lon, y.city.lat, y.city.lon) <= mergeKm,
    );
    if (same) same.also.push({ city: x.city, people: x.people });
    else out.push(x);
  }
  return out.sort((a, b) => a.km - b.km || b.people - a.people);
}

/**
 * The cities a scene draws near a place at a time: the lists' (citiesNear), and the settlements the world has records
 * of that stood then. A record within `recordKm` of a list's city is that city: it is drawn where the record puts it, with
 * the record's houses, ground and layout. Every city's people are the population model's (populationOf), from its
 * lists' rows and its record's figures together; a record no list has then is drawn while its record says it stood, if
 * any of its figures can be read, and left out where none can.
 */
export function citiesAround(f: CitiesFile, lat: number, lon: number, t: number, km: number, guess: { perHouse: number; lot: number; hold: number; gap: number }, recordKm = 12): CityNear[] {
  const near = citiesNear(f, lat, lon, t, km);
  const out: CityNear[] = near.map(({ city, people, km: d, also }) => ({ name: city.name, country: city.country, lat: city.lat, lon: city.lon, people, km: d, field: city.field, source: city.source, also: also.map((a) => ({ people: a.people, field: a.city.field, source: a.city.source })), from: 'list' as const }));
  // Each entry's rows of the lists and its record, for its life.
  const rowsOf = new Map<CityNear, City[]>(out.map((c, i) => [c, [near[i].city, ...near[i].also.map((a) => a.city)]]));
  const recordOf = new Map<CityNear, CityRecord>();
  const popOf = new Map<CityNear, Population>();
  const dLat = km / 111;
  for (const r of f.records ?? []) {
    if (t < r.span[0] || t > r.span[1] || Math.abs(r.lat - lat) > dLat) continue;
    const d = kmBetween(lat, lon, r.lat, r.lon);
    if (d > km) continue;
    const houses = figureAt(ownFigures(r, 'houses'), t);
    const area = figureAt(ownFigures(r, 'settlement_area'), t);
    const laid = r.town && (!r.townSpan || (t >= r.townSpan[0] && t <= r.townSpan[1])) ? r.town : undefined;
    const own = { record: r.id, ...(houses !== undefined ? { houses: Math.round(houses) } : {}), ...(area !== undefined ? { area } : {}), ...(laid ? { town: laid } : {}) };
    // The list's city nearest the record, if one stands within reach of it.
    let best = -1;
    let bestKm = recordKm;
    out.forEach((c, i) => {
      const k = c.record ? Infinity : kmBetween(r.lat, r.lon, c.lat, c.lon);
      if (k <= bestKm) {
        best = i;
        bestKm = k;
      }
    });
    // Its lists' rows near its point, whatever their times, so that its people are the same at every time.
    const rows = rowsNear(f, r.lat, r.lon, recordKm);
    const pop = populationOf(f, r.lat, r.lon, rows, r, guess);
    const people = centralAt(pop, t);
    const from = restsOn(pop, rows);
    if (best >= 0) {
      const c = out[best];
      // The list's figure stays beside the model's, as what the list says, where the record's own figures are read too.
      out[best] = { ...c, ...own, name: nameAt(r, t), lat: r.lat, lon: r.lon, km: Math.round(d * 10) / 10, ...(people > 0 ? { people: Math.round(people) } : {}), from, ...(from !== 'list' ? { also: [{ people: c.people, field: c.field!, source: c.source! }, ...c.also] } : {}) };
      if (from !== 'list') {
        delete out[best].field;
        delete out[best].source;
      }
      rowsOf.set(out[best], rows);
      recordOf.set(out[best], r);
      popOf.set(out[best], pop);
      continue;
    }
    // No list has it then: the model's reading of its own figures, while its record says it stood.
    if (!(people > 0)) continue;
    const entry: CityNear = { name: nameAt(r, t), country: '', lat: r.lat, lon: r.lon, people: Math.round(people), km: Math.round(d * 10) / 10, also: [], from, ...own };
    out.push(entry);
    rowsOf.set(entry, []);
    recordOf.set(entry, r);
    popOf.set(entry, pop);
  }
  for (const c of out) {
    const rows = rowsOf.get(c) ?? [];
    const r = recordOf.get(c);
    if (!rows.length && !r) continue;
    const pop = popOf.get(c) ?? populationOf(f, c.lat, c.lon, rows, r, guess);
    if (!pop.members.length) continue;
    c.life = lifeOf(f, c.lat, c.lon, rows, r, pop);
    const central = centralAt(pop, t);
    if (central > 0) {
      c.people = Math.round(central);
      c.band = [Math.round(peopleAtSeries(pop.members[2], t)), Math.round(peopleAtSeries(pop.members[1], t))];
    }
  }
  return out.sort((a, b) => a.km - b.km || b.people - a.people);
}

/** The lists' rows within `km` of a place whatever their times, the nearest of each list: a record's, for its people. */
export function rowsNear(f: Pick<CitiesFile, 'cities'>, lat: number, lon: number, km: number): City[] {
  const best = new Map<string, { c: City; d: number }>();
  const dLat = km / 111;
  for (const c of f.cities) {
    if (Math.abs(c.lat - lat) > dLat) continue;
    const d = kmBetween(lat, lon, c.lat, c.lon);
    if (d > km) continue;
    const b = best.get(c.source);
    if (!b || d < b.d) best.set(c.source, { c, d });
  }
  return [...best.values()].sort((a, b) => a.d - b.d || (a.c.source < b.c.source ? -1 : 1)).map((x) => x.c);
}

/** How far a record's region reaches from its point, km: the radius of a disc of the region's ground; undefined where it has none. */
export function regionReach(r: CityRecord): number | undefined {
  const ha = figuresOf(r).find((x) => x.prop === 'settlement_area' && x.ground === 'region' && x.preferred)?.v ?? figuresOf(r).find((x) => x.prop === 'settlement_area' && x.ground === 'region')?.v;
  return ha && ha > 0 ? Math.sqrt((ha * 1e4) / Math.PI) / 1000 : undefined;
}

/** A grid of 5′ cells' people to the km², rows from the north, as a scene has them. */
interface DensityGrid {
  north: number;
  west: number;
  nx: number;
  ny: number;
  res: number;
  anthrome: number[];
  density: number[];
}

/**
 * The regions about settlements whose records count the region's people (core/citypop.ts, dispersedAt), spread over
 * their ground in a scene's grids: each cell of land within a region's disc is as many times more crowded than HYDE has
 * it as the model's people beyond the town's are than HYDE's in the part of the disc the grids cover.
 */
export function regionsInto(d: Pick<LandscapeData, 'cities'>, lat: number, lon: number, t: number, grids: DensityGrid[]): void {
  const recs = (d.cities.records ?? []).filter((r) => r.hyde && t >= r.span[0] && t <= r.span[1]);
  if (!recs.length) return;
  const wide = grids.reduce((a, g) => Math.max(a, g.ny * g.res * 111 / 2), 0);
  for (const r of recs) {
    const reach = regionReach(r);
    if (!reach || kmBetween(lat, lon, r.lat, r.lon) > wide * 1.5 + reach) continue;
    const pop = populationOf(d.cities, r.lat, r.lon, rowsNear(d.cities, r.lat, r.lon, 12), r, { hold: 50 });
    const extra = dispersedAt(pop, t);
    if (extra === undefined) continue;
    const ha = pop.region!.ha;
    // HYDE's people in the part of the disc the widest grid covers, and that part's land.
    const g = grids.reduce((a, b) => (b.nx * b.ny > a.nx * a.ny ? b : a));
    let people = 0;
    let land = 0;
    let all = 0;
    const inDisc = (gr: DensityGrid, i: number) => {
      const row = Math.floor(i / gr.nx);
      const col = i % gr.nx;
      const la = gr.north - (row + 0.5) * gr.res;
      const lo = gr.west + (col + 0.5) * gr.res;
      return kmBetween(r.lat, r.lon, la, lo) <= reach ? Math.cos((la * Math.PI) / 180) * (gr.res * 111.195) ** 2 : 0;
    };
    for (let i = 0; i < g.density.length; i++) {
      const a = inDisc(g, i);
      if (!a) continue;
      all += a;
      if (!g.anthrome[i]) continue;
      people += g.density[i] * a;
      land += a;
    }
    if (!(land > 0)) continue;
    // People to the km² of land beyond the town's, against HYDE's: the region's ground less its water, in the share of
    // land the grid finds in the part of the disc it covers.
    const regionLand = (ha / 100) * (land / all);
    const factor = people > 0 ? extra / regionLand / (people / land) : 1;
    if (!(factor > 0) || !Number.isFinite(factor)) continue;
    for (const gr of grids)
      for (let i = 0; i < gr.density.length; i++) if (gr.anthrome[i] && inDisc(gr, i)) gr.density[i] = Math.round(gr.density[i] * factor * 1000) / 1000;
  }
}

/** What citiesAround reads of the settlement generator's parameters (world/generators/people/settlement.yaml, cities). */
export function cityGuess(params: Record<string, unknown> | undefined): { perHouse: number; lot: number; hold: number; gap: number } {
  const p = (params ?? {}) as { household?: number; cities?: { household?: number; lot?: number; record_hold?: number; record_gap?: number } };
  return { perHouse: p.cities?.household ?? p.household ?? 5, lot: p.cities?.lot ?? 200, hold: p.cities?.record_hold ?? 50, gap: p.cities?.record_gap ?? 600 };
}

// ——— A scene's people ———

/** What a scene's people are put together from: the human landscape's files, as the build or a browser has them. */
export interface LandscapeData {
  steps: number[];
  /** a 5′ cell's side, and a tile's, in degrees */
  res: number;
  tileDeg: number;
  classes: AnthromeClass[];
  /** a tile by its key, if it is loaded and holds land; undefined for a tile of sea */
  tile: (key: string) => AnthromeTile | undefined;
  assessments: AssessmentsFile;
  traditions: Tradition[];
  /** the husbandry traditions, the animals they name and those animals' forms, where the world has any */
  husbandry?: Husbandry[];
  kept?: LivingTaxon[];
  keptForms?: Record<string, Form>;
  /** the agricultural traditions, where the world has any */
  agriculture?: Agriculture[];
  cities: CitiesFile;
  /** HYDE's people in the 1° cell that holds a place, at a time; undefined where it has none */
  people: (lat: number, lon: number, t: number) => number | undefined;
  fields: ScenePeople['fields'];
  generator: ScenePeople['generator'];
  /** how far around a place the scene's cells and cities reach, in degrees of latitude and km */
  reach_deg: number;
  reach_km: number;
}

/**
 * How far around a place, in degrees of latitude, a scene is told how its land was used, coarsely, beyond the reach of
 * its own settlements: far enough that from the highest a scene is looked at, the worked land runs on past what is seen.
 */
export const FAR_REACH_DEG = 1;

/** The tiles a scene of a place reads: the keys of those under its reach. */
export function sceneTiles(d: Pick<LandscapeData, 'tileDeg' | 'reach_deg'>, lat: number, lon: number): string[] {
  const out = new Set<string>();
  const deg = d.tileDeg;
  const latLo = Math.max(-89.99, lat - d.reach_deg);
  const latHi = Math.min(89.99, lat + d.reach_deg);
  const maxAbsLat = Math.max(Math.abs(latLo), Math.abs(latHi));
  const fullRing = maxAbsLat >= 89.99 - 1e-6;
  const dLon = fullRing ? 180 : Math.min(180, d.reach_deg / Math.max(0.1, Math.cos((maxAbsLat * Math.PI) / 180)));
  const lats: number[] = [];
  for (let la = latLo; la < latHi - 1e-9; la += deg) lats.push(la);
  lats.push(latHi);
  const lons: number[] = [];
  if (fullRing || dLon >= 180) {
    for (let lo = -180; lo < 180 - 1e-9; lo += deg) lons.push(lo);
  } else {
    for (let lo = lon - dLon; lo < lon + dLon - 1e-9; lo += deg) lons.push(lo);
    lons.push(lon + dLon);
  }
  for (const la of lats) for (const lo of lons) out.add(tileKey(la, lo, deg).key);
  return [...out].sort();
}

/**
 * The people of a scene: the 5′ cells within reach of a place with their anthromes at the step nearest the time, HYDE's
 * people of each 1° cell shared over its 5′ cells, the regions' assessments, the cities standing near and the traditions
 * holding there. Undefined outside the anthromes' span, or where the place itself is no land.
 */
export function scenePeople(d: LandscapeData, lat: number, lon: number, t: number): ScenePeople | undefined {
  const step = nearestStep(d.steps, t);
  if (step < 0) return undefined;
  const res = d.res;
  const per = Math.round(1 / res);
  const classAt = (gr: number, gc: number): { k: number; region: number } => {
    const cLat = 90 - (gr + 0.5) * res;
    const cLon = -180 + (((gc % (360 * per)) + 360 * per) % (360 * per) + 0.5) * res;
    const tile = d.tile(tileKey(cLat, cLon, d.tileDeg).key);
    if (!tile) return { k: 0, region: 0 };
    const cell = cellOf(tile, cLat, cLon);
    return cell < 0 ? { k: 0, region: 0 } : { k: classAtStep(tile, cell, step), region: tile.region[cell] };
  };
  const gr = Math.min(180 * per - 1, Math.max(0, Math.floor((90 - lat) / res)));
  const gc = Math.floor((lon + 180) / res);
  if (!classAt(gr, gc).k) return undefined;
  // Each 1° cell's people, shared over its 5′ cells by their classes, once per 1° cell.
  const shared = new Map<string, number[]>();
  const shareOf = (R: number, C: number): number[] => {
    const key = `${R}_${C}`;
    let s = shared.get(key);
    if (s) return s;
    const ks: number[] = [];
    const land: number[] = [];
    for (let a = 0; a < per; a++) for (let b = 0; b < per; b++) {
      const k = classAt(R * per + a, C * per + b).k;
      ks.push(k);
      land.push(k ? Math.cos(((90 - (R * per + a + 0.5) * res) * Math.PI) / 180) * (res * 111.195) ** 2 : 0);
    }
    const people = d.people(90 - (R + 0.5), -180 + (((C % 360) + 360) % 360) + 0.5, t) ?? 0;
    s = shareDensity(d.classes, ks, land, people);
    shared.set(key, s);
    return s;
  };
  // The 5′ cells within a reach of the place, in degrees of latitude, rows from the north.
  const cellsWithin = (reach: number) => {
    const span = Math.ceil(reach / res);
    const spanLon = Math.ceil(reach / Math.max(0.1, Math.cos((lat * Math.PI) / 180)) / res);
    const r0 = Math.max(0, gr - span);
    const r1 = Math.min(180 * per - 1, gr + span);
    const c0 = gc - spanLon;
    const c1 = gc + spanLon;
    const anthrome: number[] = [];
    const density: number[] = [];
    const region: number[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const { k, region: g } = classAt(r, c);
        anthrome.push(k);
        region.push(g);
        const R = Math.floor(r / per);
        const C = Math.floor(c / per);
        density.push(k ? Math.round(shareOf(R, C)[(r - R * per) * per + (c - C * per)] * 1000) / 1000 : 0);
      }
    }
    return { r0, c0, nx: c1 - c0 + 1, ny: r1 - r0 + 1, anthrome, density, region };
  };
  const { r0, c0, nx, anthrome, density, region, ny } = cellsWithin(d.reach_deg);
  const ids = [...new Set(region.filter((x) => x > 0))].sort((a, b) => a - b);
  const regions = ids.flatMap((id) => {
    const at = assessmentAt(d.assessments, id, t);
    const label = d.assessments.regions.find((x) => x.id === id)?.label ?? String(id);
    return at ? [{ id, label, slice: d.assessments.slices[at.slice].label, assessment: at.a }] : [];
  });
  const centre = (gr - r0) * nx + (gc - c0);
  // The same cells further out, for how much of the land beyond the scene's own was worked (gen:people/settlement, farLand).
  const wide = cellsWithin(Math.max(d.reach_deg, FAR_REACH_DEG));
  const farIds = [...new Set(wide.region.filter((x) => x > 0))].sort((a, b) => a - b);
  const far: NonNullable<ScenePeople['far']> = {
    north: 90 - wide.r0 * res,
    west: -180 + wide.c0 * res,
    nx: wide.nx,
    ny: wide.ny,
    res,
    anthrome: wide.anthrome,
    density: wide.density,
    region: wide.region,
    assessments: farIds.flatMap((id) => {
      const at = assessmentAt(d.assessments, id, t);
      return at ? [{ id, assessment: at.a }] : [];
    }),
  };
  // A region about a settlement whose record counts its people (model:people/city-population): the people beyond the
  // town's are spread over the region's ground as densely as the model has them, in place of HYDE's alone.
  regionsInto(d, lat, lon, t, [
    { north: 90 - r0 * res, west: -180 + c0 * res, nx, ny, res, anthrome, density },
    { north: far.north, west: far.west, nx: far.nx, ny: far.ny, res, anthrome: far.anthrome, density: far.density },
  ]);
  const lifeway = lifewayOf(d.classes, anthrome[centre], density[centre], regions.find((x) => x.id === region[centre])?.assessment);
  const cities = citiesAround(d.cities, lat, lon, t, d.reach_km, cityGuess(d.generator.params)).map(({ km: _km, also, ...c }) => ({ ...c, ...(also.length ? { also } : {}) }));
  const traditions = d.traditions.filter((x) => t >= x.span[0] && t <= x.span[1] && x.regions.some((g) => ids.includes(g)));
  // The husbandry that holds there then, and of the animals the world can draw, those it names.
  const husbandry = (d.husbandry ?? []).filter((x) => t >= x.span[0] && t <= x.span[1] && x.regions.some((g) => ids.includes(g)));
  const named = new Set(husbandry.flatMap((x) => x.animals));
  const kept = (d.kept ?? []).filter((x) => named.has(x.id));
  const keptForms = Object.fromEntries(kept.map((x) => [x.form, d.keptForms?.[x.form]]).filter((x): x is [string, Form] => !!x[1]));
  const agriculture = (d.agriculture ?? []).filter((x) => t >= x.span[0] && t <= x.span[1] && x.regions.some((g) => ids.includes(g)));
  return {
    t,
    step: d.steps[step],
    grid: { north: 90 - r0 * res, west: -180 + c0 * res, nx, ny, res, anthrome, density, region },
    far,
    classes: d.classes,
    regions,
    lifeway,
    cities,
    traditions,
    ...(kept.length ? { husbandry, kept, keptForms } : {}),
    ...(agriculture.length ? { agriculture } : {}),
    fields: d.fields,
    generator: d.generator,
  };
}

// ——— The build's files ———

/** The index the viewer reads first. */
export interface LandscapeIndex {
  format: 'lightworld-landscape@1';
  title: string;
  source: string;
  steps: number[];
  classes: AnthromeClass[];
  tile_deg: number;
  res: number;
  /** the tiles that hold land, by their key `north_west` */
  tiles: string[];
  globe: { file: string; res: number };
  assessments: string;
  traditions: string;
  cities: string;
  /** the fields it answers for */
  fields: { anthromes: string; assessment: string; lifeways: string; population: string };
  /** the settlement generator a scene draws its people with */
  generator?: { generator: string; version: number; params: Record<string, unknown> };
  /** how far around a place the scene's cells and cities reach, in degrees of latitude and km */
  reach_deg: number;
  reach_km: number;
}

export interface TraditionsFile {
  format: 'lightworld-traditions@1';
  /** the regions' dataset its extents name */
  regions: string;
  traditions: Tradition[];
  /** the husbandry traditions, the animals they name as a scene draws them, and those animals' forms by their keys */
  husbandry?: Husbandry[];
  kept?: LivingTaxon[];
  forms?: Record<string, Form>;
  /** the agricultural traditions compiled for the build */
  agriculture?: Agriculture[];
}

