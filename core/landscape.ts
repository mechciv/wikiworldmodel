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
  const row = Math.floor((tile.north - lat) / tile.res + 1e-9);
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
  /** [year, people], in order: its `population` claims, one for each time they are for */
  pops: [number, number][];
  /** [year, hectares]: its `settlement_area` claims */
  areas: [number, number][];
  /** [year, houses]: its `houses` claims */
  houses: [number, number][];
  /** how it was laid out: its `town_form` claim, and when that held, where the claim says */
  town?: TownSpec;
  townSpan?: [number, number];
}

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
  /** whose the people are: the record's own claim, a list's figure, or the generator's guess from the record's ground or houses */
  from: 'record' | 'list' | 'guess';
  houses?: number;
  area?: number;
  town?: TownSpec;
}


/**
 * A city's people at a time: straight between two years its list gives that are no more than `gap` apart, and held `hold`
 * years either side of any figure; undefined at other times. A longer gap is a silence, not a city standing through it.
 */
export function cityPeople(c: Pick<City, 'pops'>, t: number, hold: number, gap = Infinity): number | undefined {
  const p = c.pops;
  for (let i = 0; i < p.length; i++) {
    const [a, pa] = p[i];
    if (Math.abs(t - a) <= hold && (i + 1 >= p.length || t <= a || p[i + 1][0] - a > gap)) return pa;
    if (i + 1 < p.length && t > a && t <= p[i + 1][0]) {
      const [b, pb] = p[i + 1];
      if (b - a <= gap) return Math.round(pa + ((pb - pa) * (t - a)) / (b - a));
      if (b - t <= hold) return pb;
    }
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
  found.sort((a, b) => b.people - a.people || (a.city.source < b.city.source ? -1 : 1));
  const out: typeof found = [];
  for (const x of found) {
    const same = out.find((y) => kmBetween(x.city.lat, x.city.lon, y.city.lat, y.city.lon) <= mergeKm);
    if (same) same.also.push({ city: x.city, people: x.people });
    else out.push(x);
  }
  return out.sort((a, b) => a.km - b.km || b.people - a.people);
}

/**
 * The cities a scene draws near a place at a time: the lists' (citiesNear), and the settlements the world has records
 * of that stood then. A record within `recordKm` of a list's city is that city: it is drawn where the record puts it, with
 * the record's houses, ground and layout, and with the record's own people where a claim gives them for about that time
 * (within `hold` years of a figure, or between two no more than `gap` apart, as a list's are read) and the list's where
 * none does. A record no list has then is drawn with its own nearest figure, or with its houses or its ground to guess
 * its people from (`perHouse` people to a house, `lot` square metres to a house); one that says none of these is left out.
 */
export function citiesAround(f: CitiesFile, lat: number, lon: number, t: number, km: number, guess: { perHouse: number; lot: number; hold: number; gap: number }, recordKm = 12): CityNear[] {
  const out: CityNear[] = citiesNear(f, lat, lon, t, km).map(({ city, people, km: d, also }) => ({ name: city.name, country: city.country, lat: city.lat, lon: city.lon, people, km: d, field: city.field, source: city.source, also: also.map((a) => ({ people: a.people, field: a.city.field, source: a.city.source })), from: 'list' as const }));
  const dLat = km / 111;
  for (const r of f.records ?? []) {
    if (t < r.span[0] || t > r.span[1] || Math.abs(r.lat - lat) > dLat) continue;
    const d = kmBetween(lat, lon, r.lat, r.lon);
    if (d > km) continue;
    const people = cityPeople({ pops: r.pops }, t, guess.hold, guess.gap);
    const houses = figureAt(r.houses, t);
    const area = figureAt(r.areas, t);
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
    if (best >= 0) {
      const c = out[best];
      // The list's figure stays beside the record's own, as what the list says.
      out[best] = { ...c, ...own, name: nameAt(r, t), lat: r.lat, lon: r.lon, km: Math.round(d * 10) / 10, ...(people !== undefined ? { people: Math.round(people), from: 'record' as const, also: [{ people: c.people, field: c.field!, source: c.source! }, ...c.also] } : {}) };
      if (people !== undefined) {
        delete out[best].field;
        delete out[best].source;
      }
      continue;
    }
    // No list has it then: its own nearest figure, whenever that is for, or a guess from its houses or its ground.
    const own2 = people ?? figureAt(r.pops, t);
    const guessed = own2 ?? (houses !== undefined ? houses * guess.perHouse : area !== undefined ? ((area * 1e4) / guess.lot) * guess.perHouse : undefined);
    if (guessed === undefined || !(guessed > 0)) continue;
    out.push({ name: nameAt(r, t), country: '', lat: r.lat, lon: r.lon, people: Math.round(guessed), km: Math.round(d * 10) / 10, also: [], from: own2 !== undefined ? 'record' : 'guess', ...own });
  }
  return out.sort((a, b) => a.km - b.km || b.people - a.people);
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

/** The tiles a scene of a place reads: the keys of those under its reach. */
export function sceneTiles(d: Pick<LandscapeData, 'tileDeg' | 'reach_deg'>, lat: number, lon: number): string[] {
  const out = new Set<string>();
  const dLon = d.reach_deg / Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  for (const la of [lat - d.reach_deg, lat, lat + d.reach_deg]) for (const lo of [lon - dLon, lon, lon + dLon]) out.add(tileKey(Math.max(-89.99, Math.min(89.99, la)), lo, d.tileDeg).key);
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
  const gr = Math.floor((90 - lat) / res);
  const gc = Math.floor((lon + 180) / res);
  if (!classAt(gr, gc).k) return undefined;
  const span = Math.ceil(d.reach_deg / res);
  const spanLon = Math.ceil(d.reach_deg / Math.max(0.1, Math.cos((lat * Math.PI) / 180)) / res);
  const r0 = Math.max(0, gr - span);
  const r1 = Math.min(180 * per - 1, gr + span);
  const c0 = gc - spanLon;
  const c1 = gc + spanLon;
  const nx = c1 - c0 + 1;
  const ny = r1 - r0 + 1;
  const anthrome: number[] = [];
  const density: number[] = [];
  const region: number[] = [];
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
  const ids = [...new Set(region.filter((x) => x > 0))].sort((a, b) => a - b);
  const regions = ids.flatMap((id) => {
    const at = assessmentAt(d.assessments, id, t);
    const label = d.assessments.regions.find((x) => x.id === id)?.label ?? String(id);
    return at ? [{ id, label, slice: d.assessments.slices[at.slice].label, assessment: at.a }] : [];
  });
  const centre = (gr - r0) * nx + (gc - c0);
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

