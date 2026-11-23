// The settlement generator, version 3 (docs/HUMAN-LANDSCAPE.md): the anonymous human landscape of a scene. From the
// people part of a scene's spec it lays out where people lived, how many houses, of what kind, and the fields and
// pastures around them, in the scene's local metres. Nobody recorded any of these houses: how many there are follows
// HYDE's people through the anthromes, and the cities of the lists and of the world's records where they name one; what
// way of life, the anthromes and the archaeologists of the region; what the houses were like, the building tradition the
// world records for the region and the time for that way of life, or where there is none, a generic house for the way of
// life and the climate, which says so.
//
// Version 2 (docs/plans/LIFEWAY-RENDERINGS.md):
//   - A tradition says whom it housed, and its house is drawn for those ways of life only, the camps of foragers and
//     herders among them. Version 1 gave a camp no tradition's house, and gave every farmer and townsman of a region the
//     one tradition written there, whoever it had housed.
//   - A town or a city has streets: blocks of lots on a grid or along lanes that wander, a square, canals, and a wall with
//     its gates and towers, as the tradition of its townspeople or its own record says (`town_form`), or as the generic
//     town where neither does. Version 1 drew every town as one cluster of lots.
//   - A city the world has a record of is drawn from the record's own claims: its people, its houses, the ground it
//     covered. Version 1 knew only the lists' cities.
//   - Seeds are whole numbers. Version 1 seeded each cell and each settlement with a number between 0 and 1, which the
//     hashes read as 0: every cell laid its settlements out alike, and every village its houses.
//
// Version 3 (docs/slices/SEVENTEENTH-SLICE.md):
//   - A house is drawn in one of several shapes of its dwelling, each with sizes of its own within the ranges its
//     tradition's claims give, and as big as they say: version 2 drew one shape, shrunk or swollen by a share. A house
//     that stands for several households is drawn wider and longer, its storeys and doors as they were.
//   - A house stands in its yard: what its tradition says enclosed each yard, and what it says stood by each house, are
//     drawn with the house as one thing (dwellings.ts, Homestead).
//   - Houses stand in a ring or in rows, round open ground, and face the way they all faced, where their tradition's
//     claims say so; a fence, a hedge, a palisade, a bank, a ditch or a wall stands round a settlement where its
//     tradition says one did; and what a settlement had of its own, a hall, a shrine, a well, a pen, stands among its
//     houses or at their edge.
//   - What a tradition leaves unsaid of its house is taken from the generator's own house only as far as that fits
//     what it does say (dwellings.ts, fillDwelling): a round house takes no gable, a court no farmhouse's width.
//   - The ground is trodden round each house, and no longer in a disc at the middle of houses that stand far apart.
//
// Everything is seeded by the world's 5′ cells and the anthromes' step, not by the scene, so two scenes that overlap put
// their settlements in the same places: only the ground they stand on, which is the scene's, can move one a little.
import { fillDwelling, homesteadOf, houseSize, HOUSE_VARIANTS, outbuildingSpec, type Homestead, type HouseDims, type OutbuildingParams } from '../dwellings.ts';
import { husbandryAt, mid, OUTBUILDING_LABEL, OUTBUILDING_ROOFED, outbuildingText, prevalenceOf, townText, traditionFor, within, type DwellingSpec, type EnclosureWord, type FieldSpec, type LifewayWord, type OutbuildingUse, type TownSpec, type Tradition } from '../../../../core/dwelling.ts';
import { anthromeOf, lifewayOf, LIFEWAY_OF, type CityNear, type FieldUse, type Lifeway, type Pattern } from '../../../../core/landscape.ts';
import type { ClimateClass } from '../../../../core/climate.ts';
import type { SceneSpec } from '../../../../core/scene.ts';
import { dcos, hash2, hash3, PI, Rng, TAU } from '../../city/math.ts';
import { POSE } from '../../life/forms.ts';
import { fbm, noise } from '../../life/land.ts';
import { PIECE, towered, towerSide, type WallWord, type WorkSpec } from '../works.ts';
import { ENCLOSURE_SIZE } from '../yard.ts';
import { MAT } from '../../city/kit.ts';

export const GENERATOR = 'gen:people/settlement';
export const VERSION = 4;

const EARTH = 6371000;
const DEG = PI / 180;

/** How a pattern of settlement is laid out where no tradition says: houses in one settlement, ground a house takes, fields. */
export interface PatternParams {
  /** houses in one settlement, least and most */
  houses: [number, number];
  /** square metres of ground one house and its yard take within its settlement */
  lot: number;
  /** the share of a settlement's land in fields (or pasture, for herders) */
  fields: number;
  /** how many storeys a house of the pattern has where its dwelling says none */
  storeys?: number;
}

/** How a town is laid out where no tradition or record says, and what its works are drawn as. */
export interface TownParams {
  /** the town drawn where nothing says how it was laid out */
  generic: TownSpec;
  /** the side of a block, and how wide a street and a main street are, where none is stated, m */
  block: number;
  street: number;
  main_street: number;
  /** how square a town's outline is, by its streets: 0 round, with an edge that wanders; 1 a square */
  outline: Record<NonNullable<TownSpec['streets']>, number>;
  /** a wall's height and thickness by what it is made of, where none is stated, m */
  walls: Record<WallWord, { height: number; thickness: number }>;
  /** how many gates a walled town has where none is stated, and how far apart the towers of a wall stand, m */
  gates: number;
  tower_every: number;
  /** the share of a town's ground an open square takes, where it has one */
  square: number;
  /** what a wall is drawn as where a form gives its height, its thickness or its gates and not what it was made of */
  unstated_wall: WallWord;
  /** how wide a canal and a moat are, m; and every which street between the rows of a town of canals is one */
  canal: number;
  moat: number;
  canal_every: number;
  /** more ground than this to a house, m², and a city is too thin on the ground for streets: its houses stand apart */
  open_lot: number;
  /** how many times deeper than wide a lot may be, where a house is narrower than its ground: its yard lies behind it */
  deep: number;
}

/**
 * How the animals a husbandry tradition names are drawn among its people. Which animals they kept is the tradition's;
 * how many is nobody's: these only say how full a scene is drawn.
 */
export interface LivestockParams {
  /** animals to a house, by the way of life of its people */
  per_household: Record<LifewayWord, number>;
  /** animals in one herd, least and most */
  herd: [number, number];
  /** lighter than this, kg, an animal is kept about the houses and not in a herd */
  graze_kg: number;
  /** the most animals one settlement is drawn with, and a scene */
  most_in_settlement: number;
  most: number;
}

export interface SettlementParams {
  /** people to a house where no tradition says */
  household: number;
  /**
   * how far apart houses set in a ring or in rows stand, where their tradition says they stood so and not how far
   * apart: in lengths of a house, from the middle of one to the middle of the next
   */
  compact: number;
  patterns: Record<Exclude<Pattern, 'none'>, PatternParams>;
  /** the houses drawn where no tradition holds: for foragers and herders, for towns and cities, and for farmers by climate */
  /** town and city change the farmer's house of the climate: more storeys, a rectangular plan */
  generic: { foragers: DwellingSpec; herders: DwellingSpec; town: DwellingSpec; city: DwellingSpec; farm: Record<ClimateClass, DwellingSpec> };
  /** the plots of each use of the land where no tradition says, and their size in hectares */
  plots: Record<Exclude<FieldUse, 'none'>, { kind: NonNullable<FieldSpec['kind']>; plot: number }>;
  site: {
    /** the steepest ground, as rise over run, a house stands on */
    steep: number;
    /** how far above the water a house stands at least, in metres */
    above_water: number;
    /** how many places near its spot a settlement tries before it is left out */
    tries: number;
    /** how far above the water a house of a city of a list or a record stands at least, in metres */
    city_above_water: number;
  };
  cities: {
    /** how far from the scene's middle a city is looked for, km */
    reach_km: number;
    /** square metres a house of a city takes, streets and courts included; a town's */
    lot: number;
    town_lot: number;
    /** people in a house of a city */
    household: number;
    /** fewer people than this, and a city of the lists is drawn as a town */
    city_from: number;
    /** the most houses one city is drawn with: past it, each stands for several households, and is that much bigger */
    most_houses: number;
    /**
     * how long a record's own figure of its people is held either side of the time it is for, and the longest gap
     * between two across which it is read straight between them, years: beyond, a list's figure stands (core/landscape.ts)
     */
    record_hold: number;
    record_gap: number;
  };
  towns: TownParams;
  /**
   * the part of a region's settlements of a way of life drawn in a tradition's house, where the tradition says its
   * people were a few, some or most of them and not all (its `prevalence`); without it such a tradition draws none
   */
  prevalence?: Record<'few' | 'some' | 'most', number>;
  /** how the animals people kept are drawn among them; without it none are */
  livestock?: LivestockParams;
  /**
   * People by the houses, boats on the water beside a settlement, and paths between settlements: drawn so that a scene
   * has its scale and its ways. No record says anything of any of them; without these parameters none are drawn.
   */
  figures?: { per_house: number; most_in_settlement: number; most: number; height: number };
  /**
   * What stood by the houses, where a tradition's `outbuildings` name it: how many where none is counted, and the plain
   * one of each use (dwellings.ts, OutbuildingParams); and the most of a settlement's own things a scene draws
   */
  outbuildings?: OutbuildingParams & { most: number };
  /**
   * What stood round a settlement, where its tradition's `settlement_form` says: how long one length of it is drawn, m;
   * how many ways in it has; what is drawn round a settlement its tradition calls walled and says no more of; and the
   * most lengths a scene draws, laid from its middle outward
   */
  enclosures?: { run: number; gates: number; unstated: Exclude<EnclosureWord, 'none'>; most: number };
  boats?: { length: number; beam: number; side: number; reach: number; depth: number; most_in_settlement: number };
  paths?: { width: number; reach: number; each: number; most_km: number; wander: number; patterns: Pattern[] };
  /** the most houses a scene draws: past it, each house stands for more people, and the plan says how many */
  most_houses: number;
}

/** An animal its people kept, where it stands: one of the scene's kept animals (ScenePeople.kept), in a herd or about a house. */
export interface Kept {
  x: number;
  y: number;
  z: number;
  /** the way it faces, radians clockwise from north */
  face: number;
  /** which animal, in the scene's list of those kept; and its settlement */
  kind: number;
  settlement: number;
  /** how it stands (world/generators/life/forms.ts, POSE), a share of its kind's size, and what varies it: 0–255 each */
  pose: number;
  size: number;
  shade: number;
  phase: number;
  /** 0–255: lower ones stay in view from further off */
  rank: number;
}

/** A house: where it stands, which way it faces, which dwelling it is, and its rank for the view. */
export interface House {
  x: number;
  y: number;
  z: number;
  /** the way its front faces, radians clockwise from north */
  face: number;
  /** its dwelling, in the plan's list, and its settlement */
  form: number;
  settlement: number;
  /** a share of its dwelling's size: 1, as a house is drawn as big as its claims say */
  size: number;
  /** which of its dwelling's shapes it is drawn in (dwellings.ts, HOUSE_VARIANTS) */
  variant: number;
  /** 0–255: lower ones stay in view from further off */
  rank: number;
}

/** A dwelling the plan draws: from a tradition, with whose each part is, or the generator's generic one. */
export interface PlanForm {
  key: string;
  spec: DwellingSpec;
  from: 'tradition' | 'generic';
  tradition?: string;
  label: string;
  /** whose house it is drawn as: the way of life of the settlements it stands in */
  whose: LifewayWord;
  /** the way of life its tradition was written for, where that is another, kin to it: the house stands in */
  kin?: LifewayWord;
  /** which tradition gave each part, where it is a tradition's */
  parts?: Record<string, string>;
  /** how much wider and longer it is drawn, where one house stands for several households */
  grow?: number;
  /** its yard, drawn with it: what encloses it, and what of its household's stands in it (dwellings.ts) */
  home?: Homestead;
  /** what its tradition says stood by each house and what enclosed each yard, in words, and whose claims those are */
  by?: { text: string; from: string }[];
  /** where it is no house but something its settlement had: what, in words, and that it was the settlement's */
  outbuilding?: { use: OutbuildingUse; text: string };
}

/** A piece of a town's works: a length of wall, a tower, a gate, a length of a canal or a moat (works.ts). */
export interface Work {
  x: number;
  y: number;
  z: number;
  /** the way its outside faces, radians clockwise from north; it runs across that */
  face: number;
  /** which piece it is, in the plan's list, and its settlement */
  form: number;
  settlement: number;
}

/** A kind of piece the plan draws, and what says the town had it: a tradition's id, a record's, or `generic`. */
export interface WorkForm {
  key: string;
  spec: WorkSpec;
  label: string;
  from: string;
}

export interface Settlement {
  x: number;
  y: number;
  /** how far its houses reach, and its fields, in metres */
  r: number;
  fieldR: number;
  pattern: Pattern;
  fields: FieldUse;
  houses: number;
  people: number;
  /** a city of the lists or of a record, by name; or the anthrome it stands for */
  city?: string;
  /** the record it has, and whose its people are: its record's claim, a list's figure, or a guess from its ground or houses */
  record?: string;
  from?: CityNear['from'];
  anthrome: number;
  region: number;
  form: number;
  tier: Lifeway['tier'];
  /** a town's layout as it is drawn, in words, and what says each part of it: a tradition's id, a record's, or `generic` */
  town?: { text: string; from: Record<string, string> };
  /** the husbandry tradition whose animals are drawn about it, if one holds for its people */
  husbandry?: string;
  /** what everything invented of it is seeded by: its cell and its place in it, or a city's place */
  seed: number;
  /** its houses stand far apart, each on its own ground: the ground between them is not trodden bare */
  loose?: boolean;
}

export interface SettlementPlan {
  settlements: Settlement[];
  forms: PlanForm[];
  houses: House[];
  /** the walls, gates, towers and water of its towns, and the kinds of piece they are drawn from */
  works: Work[];
  workForms: WorkForm[];
  /** the animals its people kept, where a husbandry tradition names them */
  animals: Kept[];
  /** the paths between its settlements: each a line of points, flat [x, y, …] in the scene's metres; and how wide they are */
  paths: number[][];
  pathWidth: number;
  /** people the plan's houses hold, and the people the world puts in the land it covers */
  drawn: number;
  expected: number;
  /** people one house stands for, on average; more than a household where the scene would hold more houses than it may draw */
  perHouse: number;
  /** the field system of the place itself, which the ground's plots are drawn in */
  style: { kind: NonNullable<FieldSpec['kind']>; plot: number; from: 'tradition' | 'generic'; tradition?: string };
  /** the lifeway at the place */
  lifeway: Lifeway;
}

/** Local metres of a place, on the scene's grid. */
export function toLocal(origin: { lat: number; lon: number }, lat: number, lon: number): [number, number] {
  let dl = lon - origin.lon;
  dl -= 360 * Math.round(dl / 360);
  return [dl * EARTH * dcos(origin.lat * DEG) * DEG, (lat - origin.lat) * EARTH * DEG];
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** A whole number to seed with, from a number in [0, 1): the hashes take whole seeds, and a fraction is none. */
const seedOf = (u: number): number => Math.floor(u * 4294967296) >>> 0;

/** What the ground is, for a settlement: whether a house may stand at a place. */
export interface Ground {
  at(x: number, y: number): number;
}

/** The generic dwelling for a way of life and a climate. */
function genericFor(p: SettlementParams, pattern: Pattern, climate: ClimateClass): { key: string; spec: DwellingSpec; label: string } {
  if (pattern === 'foragers') return { key: 'generic:foragers', spec: p.generic.foragers, label: "A forager's shelter" };
  if (pattern === 'herders') return { key: 'generic:herders', spec: p.generic.herders, label: "A herder's tent" };
  const spec = p.generic.farm[climate] ?? p.generic.farm.temperate;
  const square = (d: DwellingSpec): DwellingSpec => (d.plan === 'round' || d.plan === 'oval' ? { ...d, plan: 'rectangular', diameter: undefined } : d);
  if (pattern === 'city') return { key: `generic:city:${climate}`, spec: { ...square(spec), ...p.generic.city }, label: 'A house of a city' };
  if (pattern === 'towns') return { key: `generic:town:${climate}`, spec: { ...square(spec), ...p.generic.town }, label: 'A house of a town' };
  return { key: `generic:farm:${climate}`, spec, label: "A farmer's house" };
}

/** A town's layout as it is drawn, and what says each part of it. */
interface TownOf {
  spec: TownSpec;
  from: Record<string, string>;
}

/**
 * The plan of a scene's people. `ground` gives the height at a place and `water` the level of the water there, so that no
 * house stands in a river or on a cliff. The climate class picks the generic house where no tradition holds.
 */
export function makeSettlement(spec: SceneSpec, ground: Ground, water: (x: number, y: number) => number, extent: number): SettlementPlan {
  const P = spec.people!;
  const p = P.generator.params as unknown as SettlementParams;
  const origin = spec.site.origin;
  const climate = spec.biome.climate;
  const forms: PlanForm[] = [];
  const formIndex = new Map<string, number>();
  // The tradition of a way of life in a region at the scene's time: the one written for it, or for one kin to it. Where
  // several share the region's people, a number of a cell's or a city's own says which it falls to; with none, the one
  // most of them lived in.
  const parts = prevalenceOf(P.generator.params);
  const traditionOf = (region: number, pattern: Exclude<Pattern, 'none'>, u?: number) => traditionFor(P.traditions, region, P.t, LIFEWAY_OF[pattern], parts, u);
  // The side of the ground one house has to itself: what a tradition says of how far apart its houses stood, as the
  // distance from one to the next where that is more than a house, and as the gap between them where it is less.
  const lotOf = (pattern: Exclude<Pattern, 'none'>, t: Tradition | undefined): number => {
    const stated = mid(t?.settlement.spacing, 0);
    if (!(stated > 0) && !t?.settlement.layout) return p.patterns[pattern].lot;
    const size = houseSize(t && Object.keys(t.dwelling).length ? fillDwelling(t.dwelling, genericFor(p, pattern, climate).spec) : genericFor(p, pattern, climate).spec);
    const long = Math.max(size.w, size.l);
    if (stated > 0) return (stated >= long + 1 ? stated : stated + long) ** 2;
    // Houses set in a ring or in rows stood close, a house and its yard apart: no nearer than the generator's own
    // ground for a house of their pattern, where that is less.
    return Math.min(p.patterns[pattern].lot, Math.max(long * p.compact, 11) ** 2);
  };
  const formOf = (pattern: Pattern, t: Tradition | undefined, kin?: LifewayWord, grow = 1, lot?: number): number => {
    const g = genericFor(p, pattern, climate);
    // A tradition's house for the way of life it says it housed, or for one kin to it; the generic one where none holds.
    const use = t && Object.keys(t.dwelling).length;
    // What a tradition leaves unsaid is the generic house's of the same way of life, as far as that fits what it says
    // (fillDwelling), so a tradition's house in a town is not its house in a village: each is a form of its own.
    // A house that stands for several households is a form of its own, as wide and long as they would take; and so is
    // a house with its yard, by the ground it has.
    const yard = lot !== undefined && t && (t.settlement.yard || t.outbuildings?.some((o) => o.per === 'house')) ? Math.round(Math.sqrt(lot)) : 0;
    const key = (use ? `tradition:${t!.id}|${g.key}` : g.key) + (grow !== 1 ? `|x${grow}` : '') + (yard ? `|yard${yard}` : '');
    const whose = LIFEWAY_OF[pattern as Exclude<Pattern, 'none'>];
    let k = formIndex.get(key);
    if (k === undefined) {
      k = forms.length;
      formIndex.set(key, k);
      const spec = use ? fillDwelling(t!.dwelling, g.spec) : g.spec;
      const home = yard ? homesteadOf(t, spec, yard, p.outbuildings) : undefined;
      // In words, for a panel: what stood by each house, and what enclosed its yard, each with whose claim it is.
      const by = yard
        ? [
            ...(t!.outbuildings ?? []).filter((o) => o.per === 'house').map((o) => ({ text: outbuildingText(o), from: t!.from.outbuildings ?? t!.id })),
            ...(home?.yard ? [{ text: `its yard within ${home.yard === 'wall' ? 'a wall' : home.yard === 'ditch' ? 'a ditch' : home.yard === 'bank' ? 'a bank' : home.yard === 'hedge' ? 'a hedge' : home.yard === 'palisade' ? 'a palisade' : 'a fence'}`, from: t!.from['settlement.yard'] ?? t!.id }] : []),
          ]
        : [];
      const more = { ...(grow !== 1 ? { grow } : {}), ...(home && (home.yard || home.out.length) ? { home } : {}), ...(by.length ? { by } : {}) };
      forms.push(
        use
          ? { key, spec, from: 'tradition', tradition: t!.id, label: t!.label, whose, ...(kin ? { kin } : {}), parts: Object.fromEntries(Object.entries(t!.from).filter(([k2]) => k2.startsWith('dwelling.')).map(([k2, v]) => [k2.slice(9), v])), ...more }
          : { key, spec, from: 'generic', label: g.label, whose, ...more },
      );
    }
    return k;
  };
  // Something a settlement had of its own that is a roofed building: a form like a house's, drawn as one.
  const thingOf = (t: Tradition, i: number, pattern: Exclude<Pattern, 'none'>): number => {
    const key = `thing:${t.id}:${i}`;
    let k = formIndex.get(key);
    if (k === undefined) {
      const o = t.outbuildings![i];
      const g = genericFor(p, pattern, climate);
      k = forms.length;
      formIndex.set(key, k);
      const label = OUTBUILDING_LABEL[o.use];
      forms.push({ key, spec: outbuildingSpec(o, p.outbuildings, fillDwelling(t.dwelling, g.spec)), from: 'tradition', tradition: t.from.outbuildings ?? t.id, label: label[0].toUpperCase() + label.slice(1).replace(/^(A|An) /, (x) => x), whose: LIFEWAY_OF[pattern], outbuilding: { use: o.use, text: outbuildingText(o) } });
    }
    return k;
  };
  const works: Work[] = [];
  const workForms: WorkForm[] = [];
  const workIndex = new Map<string, number>();
  const workOf = (w: WorkSpec, label: string, from: string): number => {
    const key = `${w.kind}:${w.material ?? ''}:${w.height}:${w.thickness}:${w.opening ?? ''}:${w.word ?? ''}:${w.run ?? ''}:${w.stuff ?? ''}|${label}|${from}`;
    let k = workIndex.get(key);
    if (k === undefined) {
      k = workForms.length;
      workIndex.set(key, k);
      workForms.push({ key, spec: w, label, from });
    }
    return k;
  };
  // A town's layout: what its own record says, over what the tradition of its townspeople says, over the generic town.
  const townOf = (t: Tradition | undefined, own?: TownSpec, record?: string): TownOf => {
    const out: Record<string, unknown> = { ...p.towns.generic };
    const from: Record<string, string> = Object.fromEntries(Object.keys(out).map((k) => [k, 'generic']));
    // A tradition's town form holds for the time its claim says, where it says one.
    const held = t && (!t.townSpan || (P.t >= t.townSpan[0] && P.t <= t.townSpan[1])) ? t.town : {};
    for (const [k, v] of Object.entries(held)) {
      out[k] = v;
      from[k] = t!.from[`town.${k}`] ?? t!.id;
    }
    for (const [k, v] of Object.entries(own ?? {})) {
      out[k] = v;
      from[k] = record ?? 'record';
    }
    return { spec: out as TownSpec, from };
  };
  const regionOf = (id: number) => P.regions.find((r) => r.id === id);
  const slope = (x: number, y: number) => {
    const d = 12;
    const zx = ground.at(x + d, y) - ground.at(x - d, y);
    const zy = ground.at(x, y + d) - ground.at(x, y - d);
    return Math.sqrt(zx * zx + zy * zy) / (2 * d);
  };
  // Whether the ground takes a house: above the water and not too steep. Where the scene ends is a separate question, so
  // that which spot a settlement takes does not depend on which scene is drawing it.
  const ok = (x: number, y: number) => ground.at(x, y) - water(x, y) > p.site.above_water && slope(x, y) < p.site.steep;
  const inScene = (x: number, y: number) => Math.abs(x) < extent && Math.abs(y) < extent;
  const fit = (x: number, y: number) => inScene(x, y) && ok(x, y);
  // A city a list or a record puts at a place stood there, on whatever of its ground is dry: a village keeps well above
  // the water, but the level of a scene's river is the scene's, and a city on a river's plain is no less a city for it.
  const fitCity = (x: number, y: number) => inScene(x, y) && ground.at(x, y) - water(x, y) > p.site.city_above_water && slope(x, y) < p.site.steep;
  const settlements: Settlement[] = [];
  const houses: House[] = [];
  // Where each settlement's houses lie in the list, as they are laid out one settlement after another.
  const housesOf: [number, number][] = [];
  let expected = 0;
  // The cities first, the lists' and the records': each takes the land within its reach, and no settlement of the
  // anthromes stands in it.
  const cityHere: { x: number; y: number; r: number }[] = [];
  // Whether a place is on the ground of a city that is not this settlement: an earlier city keeps its ground against a
  // later one, and any city against a settlement that is none, so that no house of one stands among another's.
  const cityOf = new Map<Settlement, number>();
  const onAnothers = (x: number, y: number, s: Settlement): boolean => {
    const own = cityOf.get(s);
    for (let i = 0; i < (own ?? cityHere.length); i++) {
      const c = cityHere[i];
      const r = c.r / 1.15;
      if ((x - c.x) ** 2 + (y - c.y) ** 2 < r * r) return true;
    }
    return false;
  };
  for (const c of P.cities) {
    const [cx, cy] = toLocal(origin, c.lat, c.lon);
    if (Math.abs(cx) > extent + 4000 || Math.abs(cy) > extent + 4000) continue;
    const city = c.people >= p.cities.city_from;
    const pattern: Pattern = city ? 'city' : 'towns';
    // Its houses as its record counts them, where it does; else its people by the household of a city.
    const households = Math.max(1, Math.round(c.houses ?? c.people / p.cities.household));
    const n = Math.min(households, p.cities.most_houses);
    // A house standing for several households takes their ground, so the city covers as much as its people would: the
    // ground its record says it covered, where it does, shared among its houses.
    const lot = c.area ? (c.area * 1e4) / n : ((city ? p.cities.lot : p.cities.town_lot) * households) / n;
    const r = Math.sqrt((n * lot) / PI);
    // Its houses, of the tradition of its region's townspeople where there is one.
    const lat = c.lat;
    const lon = c.lon;
    const cell = cellAt(P.grid, lat, lon);
    const region = cell >= 0 ? P.grid.region[cell] : 0;
    const found = traditionOf(region, pattern, hash2(Math.round(lat * 1000), Math.round(lon * 1000), 0x7ad1));
    const t = found?.tradition;
    // A house that stands for several households is drawn as wide and long as they would take, to a quarter.
    const grow = Math.round(Math.min(2.5, Math.sqrt(households / n)) * 4) / 4;
    const form = formOf(pattern, t, found?.kin, grow);
    const citySeed = seedOf(hash2(Math.round(lat * 1000), Math.round(lon * 1000), 0x51c1));
    const s = settlements.push({ x: cx, y: cy, r, fieldR: r * 1.6, pattern, fields: 'rainfed', houses: 0, people: c.people, city: c.name, ...(c.record ? { record: c.record } : {}), from: c.from, anthrome: cell >= 0 ? P.grid.anthrome[cell] : 0, region, form, tier: 'evidence', seed: citySeed }) - 1;
    cityHere.push({ x: cx, y: cy, r: r * 1.15 });
    cityOf.set(settlements[s], cityHere.length - 1);
    const first = houses.length;
    layOut(settlements[s], s, n, lot, citySeed, t, townOf(t, c.town, c.record), (g) => formOf(pattern, t, found?.kin, g));
    housesOf[s] = [first, houses.length];
  }
  // Then each 5′ cell the scene reaches, as its anthrome and region say.
  const g = P.grid;
  const side = g.res * EARTH * DEG;
  for (let row = 0; row < g.ny; row++) {
    for (let col = 0; col < g.nx; col++) {
      const i = row * g.nx + col;
      const k = g.anthrome[i];
      const d = g.density[i];
      if (!k || d <= 0) continue;
      const north = g.north - row * g.res;
      const west = g.west + col * g.res;
      const [x0, y1] = toLocal(origin, north, west);
      const [x1, y0] = toLocal(origin, north - g.res, west + g.res);
      if (x1 < -extent || x0 > extent || y1 < -extent || y0 > extent) continue;
      const region = g.region[i];
      const a = regionOf(region)?.assessment;
      const life = lifewayOf(P.classes, k, d, a);
      if (life.pattern === 'none') continue;
      // The cell's place on the world's grid seeds everything in it.
      const gr = Math.round((90 - north) / g.res);
      const gc = Math.round((west + 180) / g.res);
      const seed = seedOf(hash3(gr, gc, Math.round(P.step), 0x5e7));
      // A cell's settlements are all of one tradition: where several share the region's people, the cell falls to one.
      const found = traditionOf(region, life.pattern, hash2(gc, gr, seed ^ 0x7ad1));
      const t = found?.tradition;
      const pp = p.patterns[life.pattern];
      const household = mid(t?.settlement.household, p.household);
      const area = side * side * dcos(((north - g.res / 2) * PI) / 180) * 1e-6;
      // The part of the cell inside the scene, for what the world expects of it.
      const inside = (Math.max(0, Math.min(x1, extent) - Math.max(x0, -extent)) * Math.max(0, Math.min(y1, extent) - Math.max(y0, -extent))) / ((x1 - x0) * (y1 - y0));
      expected += d * area * inside;
      const people = d * area;
      const perSettlement = Math.max(1, Math.round(within(t?.settlement.houses ?? { lo: pp.houses[0], hi: pp.houses[1] }, pp.houses[0], hash2(gr, gc, seed))));
      const housesInCell = people / household;
      const count = Math.floor(housesInCell / perSettlement + hash2(gc, gr, seed ^ 0x3a));
      if (!count) continue;
      const lot = lotOf(life.pattern, t);
      const catchment = (area * 1e6) / count;
      const grid = Math.ceil(Math.sqrt(count));
      const town = life.pattern === 'city' || life.pattern === 'towns' ? townOf(t) : undefined;
      // A house stands in its yard where it is not on the lots of a town's streets.
      const form = formOf(life.pattern, t, found?.kin, 1, town && lot <= p.towns.open_lot ? undefined : lot);
      for (let n = 0; n < count; n++) {
        // A jittered grid over the whole cell, so that the same settlement is in the same place whichever scene draws it.
        const gx = n % grid;
        const gy = Math.floor(n / grid);
        let placed = false;
        for (let tr = 0; tr < p.site.tries && !placed; tr++) {
          const u = (gx + 0.15 + 0.7 * hash3(n, tr, 1, seed)) / grid;
          const v = (gy + 0.15 + 0.7 * hash3(n, tr, 2, seed)) / grid;
          const x = x0 + (x1 - x0) * u;
          const y = y1 - (y1 - y0) * v;
          if (!ok(x, y)) continue;
          placed = true;
          // A settlement beyond the scene, or in a city's ground, is not drawn here; it has its spot all the same.
          if (!inScene(x, y) || cityHere.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r)) continue;
          const r = Math.sqrt((perSettlement * lot) / PI);
          const fieldR = Math.sqrt(r * r + (pp.fields * catchment) / PI);
          const own = seedOf(hash3(n, gr, gc, seed));
          const s = settlements.push({ x, y, r, fieldR, pattern: life.pattern, fields: life.fields, houses: 0, people: perSettlement * household, anthrome: k, region, form, tier: life.tier, seed: own }) - 1;
          const first = houses.length;
          layOut(settlements[s], s, perSettlement, lot, own, t, town, (g) => formOf(life.pattern, t, found?.kin, g));
          housesOf[s] = [first, houses.length];
        }
      }
    }
  }
  // A spot before a house: `out` metres clear of its front wall, and `across` of its width (and `more` metres) to one
  // side of its door. A house's front faces the way it is turned, and its length runs that way (dwellings.ts).
  const sizes = new Map<number, HouseDims>();
  const sizeOf = (h: House): HouseDims => {
    const k = h.form * HOUSE_VARIANTS + h.variant;
    let sz = sizes.get(k);
    if (!sz) sizes.set(k, (sz = houseSize(forms[h.form].spec, h.variant, forms[h.form].grow ?? 1)));
    return sz;
  };
  const before = (h: House, out: number, across: number, more: number): [number, number] => {
    const sz = sizeOf(h);
    const d = sz.l / 2 + out;
    const a = across * (sz.w + more);
    const sf = Math.sin(h.face);
    const cf = Math.cos(h.face);
    return [h.x + sf * d + cf * a, h.y + cf * d - sf * a];
  };
  // What each settlement had of its own, where its tradition's `outbuildings` say: a hall, a shrine, a well, a pen. A
  // roofed one is drawn as a house is, from its own form; the rest as works. That it had them is the tradition's claim;
  // how many where none is counted (one), and where each stands, is the generator's: what people met at or drew water
  // from at its middle, what smoked, smelt or needed room at its edge.
  const traditionById = new Map(P.traditions.map((t) => [t.id, t]));
  const reachOf = (si: number): number => {
    const [h0, h1] = housesOf[si] ?? [0, 0];
    const s = settlements[si];
    let far = 0;
    for (let i = h0; i < h1; i++) far = Math.max(far, Math.hypot(houses[i].x - s.x, houses[i].y - s.y));
    return far;
  };
  const O = p.outbuildings;
  const MIDDLE = new Set<OutbuildingUse>(['hall', 'shrine', 'well', 'pole', 'granary', 'store', 'bath']);
  let things = 0;
  if (O) {
    settlements.forEach((s, si) => {
      const f = forms[s.form];
      const t = f.tradition ? traditionById.get(f.tradition) : undefined;
      const [h0, h1] = housesOf[si] ?? [0, 0];
      if (!t?.outbuildings?.length || h1 <= h0 || s.pattern === 'none' || things >= O.most) return;
      const st = t.settlement;
      const open = !!st.plaza || st.layout === 'ring';
      const far = reachOf(si);
      const rng = new Rng((s.seed ^ 0x3f1c9a5b) >>> 0);
      let mid0 = 0;
      let edge = 0;
      t.outbuildings.forEach((o, i) => {
        if (o.per !== 'settlement') return;
        const count = Math.max(1, Math.min(8, Math.round(o.count !== undefined ? within(o.count, 1, rng.next()) : 1)));
        const spec = outbuildingSpec(o, O, f.spec);
        const across = OUTBUILDING_ROOFED[o.use] ? Math.max(houseSize(spec).w, houseSize(spec).l) : mid(spec.diameter ?? spec.width, 3);
        // A pen stands at the middle of a ring of houses, as a fold does; else at the edge with what needs room.
        const middle = MIDDLE.has(o.use) || (o.use === 'pen' && open);
        for (let q = 0; q < count && things < O.most; q++) {
          let x: number;
          let y: number;
          let face: number;
          if (middle) {
            // Round the middle: the first at it, where the ground is open; the rest about it.
            const k = mid0++;
            const rr = k === 0 && open ? 0 : across * 0.5 + 4 + 5 * Math.floor(k / 5);
            const a = hash2(1, 7, s.seed) * TAU + k * 2.399963;
            x = s.x + Math.sin(a) * rr;
            y = s.y + Math.cos(a) * rr;
            face = rr === 0 ? hash2(2, 7, s.seed) * TAU : a + PI;
          } else {
            const a = hash2(3, 7, s.seed) * TAU + edge++ * 2.399963;
            const rr = far + across * 0.5 + 6 + 3 * rng.next();
            x = s.x + Math.sin(a) * rr;
            y = s.y + Math.cos(a) * rr;
            face = a + PI;
          }
          if (!(s.city ? fitCity(x, y) : fit(x, y))) continue;
          things++;
          if (OUTBUILDING_ROOFED[o.use]) {
            houses.push({ x, y, z: ground.at(x, y), face, form: thingOf(t, i, s.pattern as Exclude<Pattern, 'none'>), settlement: si, size: 1, variant: rng.int(0, HOUSE_VARIANTS - 1), rank: rng.int(0, 40) });
            continue;
          }
          const label = OUTBUILDING_LABEL[o.use];
          const named = label[0].toUpperCase() + label.slice(1);
          const from = t.from.outbuildings ?? t.id;
          const stuff = f.spec.walls === 'stone' ? MAT.rubble : MAT.mud;
          const w: WorkSpec =
            o.use === 'pen'
              ? { kind: 'pen', height: 0, thickness: across, word: o.enclosure && o.enclosure !== 'none' ? o.enclosure : 'fence', stuff }
              : o.use === 'well'
                ? { kind: 'well', height: 0, thickness: across }
                : o.use === 'oven'
                  ? { kind: 'oven', height: 0, thickness: across }
                  : o.use === 'rack'
                    ? { kind: 'rack', height: mid(spec.height, 1.8), thickness: mid(spec.width ?? spec.length, 2.6) }
                    : o.use === 'stack'
                      ? { kind: 'stack', height: mid(spec.height, 2.8), thickness: across }
                      : o.use === 'pond'
                        ? { kind: 'pond', height: 0, thickness: across }
                        : o.use === 'pole'
                          ? { kind: 'pole', height: mid(spec.height, 5), thickness: 0.4, ...(spec.walls === 'stone' ? { stuff: MAT.rubble } : {}) }
                          : { kind: 'floor', height: 0, thickness: across };
          works.push({ x, y, z: ground.at(x, y), face, form: workOf(w, named, from), settlement: si });
        }
      });
    });
  }
  // What stood round a settlement, where its tradition says: a fence, a hedge, a palisade, a bank, a ditch, a wall, in
  // lengths round its outermost houses with a way in or two. From the middle of the scene outward, where a visitor
  // arrives, until the most a scene draws are laid.
  const E = p.enclosures;
  if (E) {
    let laid = 0;
    const order = settlements.map((_, i) => i).sort((a, b) => Math.hypot(settlements[a].x, settlements[a].y) - Math.hypot(settlements[b].x, settlements[b].y));
    for (const si of order) {
      if (laid >= E.most) break;
      const s = settlements[si];
      const f = forms[s.form];
      const t = f.tradition ? traditionById.get(f.tradition) : undefined;
      const [h0, h1] = housesOf[si] ?? [0, 0];
      // A town has its own wall, or none, by its town form.
      if (!t || h1 <= h0 || s.town) continue;
      const word = t.settlement.enclosure ?? (t.settlement.pattern === 'walled' ? E.unstated : undefined);
      if (!word || word === 'none') continue;
      const from = t.settlement.enclosure ? (t.from['settlement.enclosure'] ?? t.id) : 'generic';
      const size = sizeOf(houses[h0]);
      const want = reachOf(si) + Math.max(size.w, size.l) * 0.5 + (f.home ? f.home.lot * 0.35 : 3) + ENCLOSURE_SIZE[word].thickness * 0.5 + 1.5;
      // Lengths of one size, as many as go round: the ring is as wide as that many make, so that one kind of piece
      // serves every settlement of a tradition.
      const count = Math.max(8, Math.round((TAU * want) / E.run));
      const R = E.run / (2 * Math.sin(PI / count));
      const run = E.run + 0.05;
      const stuff = f.spec.walls === 'stone' ? MAT.rubble : f.spec.walls === 'fired-brick' ? MAT.brick : f.spec.walls === 'mudbrick' ? MAT.adobe : MAT.mud;
      const piece = workOf({ kind: 'enclosure', height: 0, thickness: ENCLOSURE_SIZE[word].thickness, word, run, ...(word === 'wall' ? { stuff } : {}) }, ENCLOSURE_LABEL[word], from);
      const gates = Math.max(1, Math.round(E.gates));
      const turn = hash2(4, 7, s.seed) * TAU;
      for (let i = 0; i < count; i++) {
        // A way in is a length left out.
        if (gates > 0 && (i * gates) % count < gates) continue;
        const a = turn + (TAU * (i + 0.5)) / count;
        const x = s.x + Math.sin(a) * R * Math.cos(PI / count);
        const y = s.y + Math.cos(a) * R * Math.cos(PI / count);
        if (!inScene(x, y) || ground.at(x, y) - water(x, y) < 0.2) continue;
        works.push({ x, y, z: ground.at(x, y), face: a, form: piece, settlement: si });
        laid++;
      }
    }
  }
  // The animals its people kept, where a husbandry tradition of the region and time names them for their way of life:
  // those that graze in herds, on the pasture of people who herd and at the edge of the houses of people who farm; the
  // rest about the houses. Which animals is the tradition's; how many, and where each stands, is invented.
  const animals: Kept[] = [];
  const keptList = P.kept ?? [];
  const L = p.livestock;
  if (L && keptList.length && P.husbandry?.length) {
    const index = new Map(keptList.map((k, i) => [k.id, i]));
    const posesOf = keptList.map((k) => {
      const poses = (P.keptForms?.[k.form]?.behave?.poses ?? ['stand', 'walk', 'graze']).map((x) => POSE[x] as number | undefined).filter((x): x is number => x !== undefined && x !== POSE.fly);
      return poses.length ? poses : [POSE.stand];
    });
    const grazes = keptList.map((k) => {
      const f = P.keptForms?.[k.form];
      return (f?.behave?.habitat ?? 'open') === 'open' && (k.mass ?? (k.length ?? 1) ** 3 * (f?.mass_length ?? 20)) >= L.graze_kg;
    });
    settlements.forEach((s, si) => {
      if (s.pattern === 'none' || animals.length >= L.most) return;
      const whose = LIFEWAY_OF[s.pattern];
      const h = husbandryAt(P.husbandry!, s.region, P.t, whose);
      const mine = (h?.animals ?? []).map((id) => index.get(id)).filter((k): k is number => k !== undefined);
      if (!h || !mine.length) return;
      s.husbandry = h.id;
      const [h0, h1] = housesOf[si] ?? [0, 0];
      const total = Math.min(L.most_in_settlement, L.most - animals.length, Math.floor((h1 - h0) * L.per_household[whose] + hash2(si, 31, s.seed)));
      if (total <= 0) return;
      const rng = new Rng((s.seed ^ 0x6b43a9b5) >>> 0);
      const stand = (x: number, y: number, kind: number, pose: number, size: number, face: number): boolean => {
        if (!fit(x, y)) return false;
        animals.push({ x, y, z: ground.at(x, y), face, kind, settlement: si, pose, size, shade: rng.int(0, 255), phase: rng.int(0, 255), rank: rng.int(0, 255) });
        return true;
      };
      mine.forEach((k, j) => {
        // Each kind alike, the odd ones going to the first.
        let left = Math.floor(total / mine.length) + (j < total % mine.length ? 1 : 0);
        const long = keptList[k].length ?? 1;
        const poses = posesOf[k];
        if (!grazes[k]) {
          // About the houses: before one of them, a few steps out from its walls.
          for (; left > 0 && h1 > h0; left--) {
            const [x, y] = before(houses[h0 + rng.int(0, h1 - h0 - 1)], 1.5 + 4 * rng.next(), rng.next() - 0.5, 4);
            const still = poses.filter((x) => x !== POSE.graze);
            stand(x, y, k, (still.length ? still : poses)[rng.int(0, (still.length || poses.length) - 1)], 0.75 + 0.25 * rng.next(), rng.next() * TAU);
          }
          return;
        }
        for (let herd = 0; left > 0 && herd < 64; herd++) {
          const size = Math.min(left, L.herd[0] + rng.int(0, L.herd[1] - L.herd[0]));
          left -= size;
          const r0 = s.r * 1.15 + 15;
          const r1 = s.fields === 'pasture' ? Math.max(r0 + 60, s.fieldR * 0.9) : r0 + 90;
          const rr = Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * rng.next());
          const at = rng.next() * TAU;
          const cx = s.x + Math.sin(at) * rr;
          const cy = s.y + Math.cos(at) * rr;
          const turn = rng.next() * TAU;
          const spread = long * (1.6 + 1.1 * Math.sqrt(size));
          let drawn = 0;
          for (let q = 0; q < size * 5 && drawn < size; q++) {
            const b = rng.next() * TAU;
            const d = drawn === 0 ? 0 : spread * Math.sqrt(rng.next());
            if (stand(cx + Math.sin(b) * d, cy + Math.cos(b) * d, k, poses[rng.int(0, poses.length - 1)], drawn === 0 ? 1 : 0.7 + 0.3 * rng.next(), turn + (rng.next() - 0.5) * 1.2)) drawn++;
          }
        }
      });
    });
  }
  // People by the houses, and boats on the water beside a settlement: no record says anything of them. They are the
  // plainest figures there are, the same everywhere, there so that a scene has its scale.
  const F = p.figures;
  if (F) {
    const who = workOf({ kind: 'person', height: F.height, thickness: 0.5 }, 'A person', 'generic');
    let stood = 0;
    settlements.forEach((s, si) => {
      const [h0, h1] = housesOf[si] ?? [0, 0];
      if (h1 <= h0 || stood >= F.most) return;
      const rng = new Rng((s.seed ^ 0x2c9277b5) >>> 0);
      const n = Math.min(F.most_in_settlement, F.most - stood, Math.floor((h1 - h0) * F.per_house + rng.next()));
      for (let q = 0; q < n; q++) {
        // Before the door of one of its houses, a step or two out: never within its walls.
        const [x, y] = before(houses[h0 + rng.int(0, h1 - h0 - 1)], 0.8 + 1.7 * rng.next(), rng.next() - 0.5, 0);
        if (!fit(x, y)) continue;
        works.push({ x, y, z: ground.at(x, y), face: rng.next() * TAU, form: who, settlement: si });
        stood++;
      }
    });
  }
  const B = p.boats;
  if (B) {
    const boat = workOf({ kind: 'boat', height: B.side, thickness: B.length, opening: B.beam }, 'A boat', 'generic');
    settlements.forEach((s, si) => {
      if (!s.houses) return;
      const rng = new Rng((s.seed ^ 0x51a3c6d1) >>> 0);
      let afloat = 0;
      for (let q = 0; q < 16 && afloat < B.most_in_settlement; q++) {
        const b = rng.next() * TAU;
        const d = s.r + 10 + B.reach * rng.next();
        const x = s.x + Math.sin(b) * d;
        const y = s.y + Math.cos(b) * d;
        const level = water(x, y);
        // Afloat only where the water is deep enough to float it, in the scene.
        if (!inScene(x, y) || level - ground.at(x, y) < B.depth) continue;
        works.push({ x, y, z: level - 0.05, face: rng.next() * TAU, form: boat, settlement: si });
        afloat++;
      }
    });
  }
  // Paths between the settlements of people who stayed in one place: each to the nearest few within reach, by a line
  // that wanders a little. No record gives any of them; they say only that neighbours went to and fro.
  const paths: number[][] = [];
  const W = p.paths;
  if (W) {
    const joined = settlements.map((s, i) => ({ s, i })).filter(({ s }) => W.patterns.includes(s.pattern) && s.houses > 0);
    const size = W.reach;
    const cells = new Map<string, number[]>();
    joined.forEach(({ s }, j) => {
      const k = `${Math.floor(s.x / size)},${Math.floor(s.y / size)}`;
      (cells.get(k) ?? cells.set(k, []).get(k)!).push(j);
    });
    const done = new Set<string>();
    let total = 0;
    // From the middle of the scene outward, where a visitor arrives, until the most the scene draws is laid.
    const order = joined.map((_, j) => j).sort((a, b) => Math.hypot(joined[a].s.x, joined[a].s.y) - Math.hypot(joined[b].s.x, joined[b].s.y));
    for (const j of order) {
      if (total > W.most_km * 1000) break;
      const a = joined[j].s;
      const near: { d: number; j: number }[] = [];
      const cx = Math.floor(a.x / size);
      const cy = Math.floor(a.y / size);
      for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
        for (const o of cells.get(`${cx + u},${cy + v}`) ?? []) {
          if (o === j) continue;
          const d = Math.hypot(joined[o].s.x - a.x, joined[o].s.y - a.y);
          if (d <= W.reach && d > a.r + joined[o].s.r) near.push({ d, j: o });
        }
      }
      near.sort((x, y) => x.d - y.d || x.j - y.j);
      for (const { d, j: o } of near.slice(0, W.each)) {
        const key = j < o ? `${j}-${o}` : `${o}-${j}`;
        if (done.has(key)) continue;
        done.add(key);
        const b = joined[o].s;
        const ux = (b.x - a.x) / d;
        const uy = (b.y - a.y) / d;
        // From the edge of one's houses to the edge of the other's, bowed a little to one side and wandering.
        const from = a.r * 0.9;
        const length = d - a.r * 0.9 - b.r * 0.9;
        if (length < 20) continue;
        const seed = (a.seed ^ Math.imul(b.seed, 0x9e3779b1)) >>> 0;
        const bow = (hash2(1, 41, seed) - 0.5) * 2 * W.wander * length;
        const steps = Math.max(2, Math.ceil(length / 25));
        const line: number[] = [];
        for (let q = 0; q <= steps; q++) {
          const f = q / steps;
          const along = from + length * f;
          const side = Math.sin(PI * f) * (bow + (fbm(along / 180, 3.7, seed | 0) - 0.5) * 2 * W.wander * Math.min(length, 600));
          line.push(a.x + ux * along - uy * side, a.y + uy * along + ux * side);
        }
        paths.push(line);
        total += length;
      }
    }
  }
  // Houses past the most a scene draws stand for more people each: the plan keeps the people, and says so.
  let perHouse = 0;
  let drawn = 0;
  for (const s of settlements) drawn += s.people;
  let kept = houses;
  if (houses.length > p.most_houses) {
    kept = houses.filter((h) => h.rank < (256 * p.most_houses) / houses.length);
    const counts = new Map<number, number>();
    for (const h of kept) if (!forms[h.form].outbuilding) counts.set(h.settlement, (counts.get(h.settlement) ?? 0) + 1);
    settlements.forEach((x, i) => (x.houses = counts.get(i) ?? 0));
  }
  perHouse = kept.length ? drawn / kept.length : 0;
  // The place's own field system: its tradition's, or the generic one for its use of the land.
  const centre = cellAt(g, origin.lat, origin.lon);
  const tc = centre >= 0 && P.lifeway.pattern !== 'none' ? traditionOf(g.region[centre], P.lifeway.pattern)?.tradition : undefined;
  const use = P.lifeway.fields === 'none' ? 'rainfed' : P.lifeway.fields;
  const generic = p.plots[use];
  const style = tc?.fields.kind ? { kind: tc.fields.kind, plot: mid(tc.fields.plot, generic.plot), from: 'tradition' as const, tradition: tc.id } : { kind: generic.kind, plot: generic.plot, from: 'generic' as const };
  return { settlements, forms, houses: kept, works, workForms, animals, paths, pathWidth: W?.width ?? 0, drawn: Math.round(drawn), expected: Math.round(expected), perHouse: Math.round(perHouse * 10) / 10, style, lifeway: P.lifeway };

  /**
   * Houses of a settlement, as its tradition's pattern sets them out: clustered, in a ring, in rows, along a line or
   * apart; round open ground where its tradition says there was some; each facing the way its tradition says they all
   * faced, where it says. A town or a city, given how it is laid out, takes the lots of its streets (layOutTown),
   * unless it is one block of rooms or too thin on the ground for streets.
   */
  function layOut(s: Settlement, si: number, n: number, lot: number, seed: number, t: Tradition | undefined, town?: TownOf, sized?: (grow: number) => number): void {
    const st = t?.settlement ?? {};
    const pattern = st.pattern ?? (s.pattern === 'foragers' || s.pattern === 'herders' ? 'camp' : s.pattern === 'farmsteads' ? 'dispersed' : 'nucleated');
    if (town && pattern !== 'room-block' && lot <= p.towns.open_lot) return layOutTown(s, si, n, lot, seed, town, sized);
    const spacing = Math.sqrt(lot);
    const axis = hash2(1, 7, seed) * TAU;
    // A room block is the rectangle it was built as: rows of rooms either side of lanes, on the settlement's axis.
    const block = pattern === 'room-block';
    const layout = block || pattern === 'linear' ? undefined : (st.layout ?? (pattern === 'camp' ? 'ring' : undefined));
    // The way every house faced, where its tradition says they all faced one way: a little off it, each.
    const stated = forms[s.form].spec.faces;
    const facing = stated !== undefined ? COMPASS[stated] : undefined;
    // What the settlement keeps at its middle clears the houses from it.
    const middle = (t?.outbuildings ?? []).some((o) => o.per === 'settlement');
    const clear = st.plaza ? Math.max(spacing * 1.6, 12) : middle && !layout ? Math.max(spacing * 0.9, 9) : 0;
    // A ring: as many as one ring holds a house's ground apart, then another outside it.
    const per = spacing * 0.95;
    const firstRing = Math.min(n, 44);
    // A camp nobody says stood in a ring is a loose one, as wide as its shelters need; a ring its tradition names is
    // as wide as its houses take, side by side.
    const R0 = st.layout === 'ring' ? Math.max(spacing * 1.3, clear, (firstRing * per) / TAU) : Math.max(clear, spacing * (0.4 + 0.25 * Math.sqrt(n)));
    const loose = st.layout === 'ring' ? 0.06 : 0.3;
    let ring = 0;
    let onRing = 0;
    let holds = firstRing;
    // Rows: houses side by side, the rows in pairs that face each other across a way.
    const perRow = Math.max(2, Math.round(Math.sqrt(n * 2.2)));
    const rows = Math.ceil(n / perRow);
    // A cluster: its houses thrown on the ground they would take, none nearer another than a house and its yard need,
    // and none on the open ground at its middle.
    const loosely = pattern === 'dispersed' ? 2.2 : pattern === 'compound' ? 0.8 : 0.62;
    const spots = layout || block || pattern === 'linear' ? undefined : scatter(n, spacing * loosely, clear, seed);
    for (let h = 0; h < n; h++) {
      let dx: number;
      let dy: number;
      let face: number;
      if (layout === 'ring') {
        if (onRing >= holds) {
          ring++;
          onRing = 0;
          holds = Math.max(6, Math.floor((TAU * (R0 + ring * spacing * 1.3)) / per));
        }
        const left = Math.min(holds, n - (h - onRing));
        const a = axis + (TAU * (onRing + (ring % 2) * 0.5)) / left + (hash2(h, 1, seed) - 0.5) * loose * 0.8;
        const rr = (R0 + ring * spacing * 1.3) * (1 + (hash2(h, 2, seed) - 0.5) * loose);
        onRing++;
        dx = Math.sin(a) * rr;
        dy = Math.cos(a) * rr;
        face = a + PI;
      } else if (layout === 'rows') {
        const r = Math.floor(h / perRow);
        const i = h % perRow;
        const lx = (i - (Math.min(perRow, n - r * perRow) - 1) / 2) * spacing * 0.95 + (hash2(h, 3, seed) - 0.5) * spacing * 0.08;
        // Rows in pairs: a way between the two of a pair, their backs to the next pair.
        const ly = (Math.floor(r / 2) - (Math.ceil(rows / 2) - 1) / 2) * spacing * 2.3 + (r % 2 ? 0.5 : -0.5) * spacing * 0.95;
        dx = Math.cos(axis) * lx + Math.sin(axis) * ly;
        dy = -Math.sin(axis) * lx + Math.cos(axis) * ly;
        face = axis + (r % 2 ? PI : 0);
      } else if (pattern === 'linear') {
        const along = (h - n / 2) * spacing * 1.1;
        const side = h % 2 ? 1 : -1;
        dx = Math.sin(axis) * along + Math.cos(axis) * side * spacing * 0.6;
        dy = Math.cos(axis) * along - Math.sin(axis) * side * spacing * 0.6;
        face = axis + (side > 0 ? -PI / 2 : PI / 2);
      } else if (block) {
        const w = Math.ceil(Math.sqrt(n));
        const gx = (h % w) - Math.floor(w / 2);
        const gy = Math.floor(h / w) - Math.floor(w / 2);
        const lx = (gx + 0.5) * spacing + Math.floor(gx / 4) * spacing * 0.35;
        const ly = (gy + 0.5) * spacing + Math.floor(gy / 2) * spacing * 0.35;
        dx = Math.cos(axis) * lx + Math.sin(axis) * ly;
        dy = -Math.sin(axis) * lx + Math.cos(axis) * ly;
        face = axis + (gy % 2 ? PI : 0);
      } else {
        [dx, dy] = spots![h];
        const a = Math.atan2(dx, dy);
        face = pattern === 'compound' || clear > 0 ? a + PI + (hash2(h, 6, seed) - 0.5) * 0.5 : axis + (hash2(h, 5, seed) < 0.5 ? 0 : PI / 2) + (hash2(h, 6, seed) - 0.5) * 0.5;
      }
      if (facing !== undefined) face = facing + (hash2(h, 13, seed) - 0.5) * 0.3;
      const x = s.x + dx;
      const y = s.y + dy;
      if (!(s.city ? fitCity(x, y) : fit(x, y)) || onAnothers(x, y, s)) continue;
      houses.push({ x, y, z: ground.at(x, y), face, form: s.form, settlement: si, size: 1, variant: Math.floor(hash2(h, 12, seed) * HOUSE_VARIANTS), rank: Math.floor(hash2(h, 9, seed) * 256) });
      s.houses++;
    }
    // Houses standing apart, each among its own fields, leave the ground between them as it was.
    if (pattern === 'dispersed' && n > 1) s.loose = true;
    // Its houses reach as far as they were set: a ring or rows take more ground than a cluster of as many.
    if (layout) {
      const far = layout === 'ring' ? R0 + ring * spacing * 1.3 : Math.hypot((perRow * spacing * 0.95) / 2, (Math.ceil(rows / 2) * spacing * 2.3) / 2);
      if (far + spacing * 0.5 > s.r) {
        s.fieldR = Math.sqrt(Math.max(0, s.fieldR * s.fieldR - s.r * s.r) + (far + spacing * 0.5) ** 2);
        s.r = far + spacing * 0.5;
      }
    }
  }

  /**
   * The houses of a town or a city on the lots of its streets (core/dwelling.ts, TownSpec), and its works. Lots stand
   * back to back in blocks between streets: on a grid, with a main street each way through the middle, or along lanes
   * that wander, their blocks out of step. The `n` lots nearest the middle are taken, so the town is round, its edge
   * wandering by its seed, or square where its streets are planned. A square is left open at its middle, water runs in
   * some streets of a town of canals, and a wall with its gates and towers, and a moat, stand round it, where its form
   * says so. What a tradition or a record says is drawn; the rest is the generic town's, and the plan says which.
   * `sized` gives the town's house as a form drawn so many times as wide and long: a house wider than the ground its
   * town gives it is drawn as small as its lot, so that no house stands in its neighbour.
   */
  function layOutTown(s: Settlement, si: number, n: number, lot: number, seed: number, town: TownOf, sized?: (grow: number) => number): void {
    const T = p.towns;
    const form = town.spec;
    const streets = form.streets ?? 'lanes';
    const planned = streets !== 'lanes';
    const axis = hash2(1, 7, seed) * TAU;
    const ca = Math.cos(axis);
    const sa = Math.sin(axis);
    // The town's own frame, its streets along x and y, to the scene's metres; and the way a thing of the frame faces.
    const toScene = (lx: number, ly: number): [number, number] => [s.x + ca * lx + sa * ly, s.y - sa * lx + ca * ly];
    const faceOf = (nx: number, ny: number) => Math.atan2(ca * nx + sa * ny, -sa * nx + ca * ny);
    const w = mid(form.street, T.street);
    const M = planned ? Math.max(w, mid(form.main_street, T.main_street)) : w;
    const side0 = Math.sqrt(lot);
    // A lot is as wide along its street as its house and a way past it, and as much deeper as its ground allows, to
    // three times: a town's houses line its streets, their yards behind them.
    let house = houseSize(forms[s.form].spec, 0, forms[s.form].grow ?? 1);
    const deep = Math.min(T.deep, Math.max(1, lot / (house.w + 1.2) ** 2));
    // Lots to a block's long side; and a lot's width, so that a house with its share of the streets takes the ground
    // the town's people give it: (k·wide + w)(2·deep·wide + w) = 2k·lot.
    const k = Math.max(2, Math.round((mid(form.block, T.block) * Math.sqrt(deep)) / side0));
    const qa = 2 * deep * k;
    const qb = k * w + 2 * deep * w;
    const fX = Math.max(side0 * 0.4, (-qb + Math.sqrt(qb * qb - 4 * qa * (w * w - 2 * k * lot))) / (2 * qa));
    const fY = fX * deep;
    // How far a house may be turned from the way its lane runs, radians: along lanes houses do not stand squarely.
    const turned = planned ? 0 : 0.08;
    // A house wider or deeper than its lot, turned so, is drawn as small as the lot: to a twentieth, and no less than
    // two fifths.
    const fits = Math.min((fX - 0.1) / (house.w * Math.cos(turned) + house.l * Math.sin(turned)), (fY - 0.5) / (house.l * Math.cos(turned) + house.w * Math.sin(turned)));
    if (fits < 1 && sized) {
      s.form = sized(Math.max(0.4, Math.floor((forms[s.form].grow ?? 1) * fits * 20) / 20));
      house = houseSize(forms[s.form].spec, 0, forms[s.form].grow ?? 1);
    }
    // A lot's size, where it is not its width or its depth that is meant.
    const sideL = Math.sqrt(fX * fY);
    // How far a house stands forward of its lot's middle: at its front, a step back from the street.
    const forward = Math.max(0, fY / 2 - house.l / 2 - 0.7);
    const C = streets === 'canals' ? T.canal : 0;
    const every = Math.max(1, Math.round(T.canal_every));
    const canalAfter = (bj: number) => C > 0 && bj !== -1 && ((bj % every) + every) % every === 0;
    const gapAfter = (bj: number) => (bj === -1 ? M : canalAfter(bj) ? C : w);
    // How far out lots are looked for: the disc the town would be, and half as far again.
    const R = Math.sqrt((n * lot) / PI);
    const reach = R * 1.6 + 4 * sideL;
    const pitchX = k * fX + w;
    const NA = Math.ceil(reach / pitchX) + 1;
    const NB = Math.ceil(reach / (2 * fY + w)) + 1;
    // Where each row of blocks begins, either side of the main street.
    const yLo = new Float64Array(2 * NB);
    yLo[NB] = M / 2;
    for (let bj = 1; bj < NB; bj++) yLo[NB + bj] = yLo[NB + bj - 1] + 2 * fY + gapAfter(bj - 1);
    yLo[NB - 1] = -M / 2 - 2 * fY;
    for (let bj = -2; bj >= -NB; bj--) yLo[NB + bj] = yLo[NB + bj + 1] - gapAfter(bj) - 2 * fY;
    const xLo = (bi: number) => (bi >= 0 ? M / 2 + bi * pitchX : -M / 2 + bi * pitchX + w);
    // Its outline: round with an edge that wanders, or squared, as its streets are.
    const q = clamp01(T.outline[streets] ?? 0);
    const ph = [hash2(1, 11, seed) * TAU, hash2(2, 11, seed) * TAU, hash2(3, 11, seed) * TAU];
    const edge = (a: number) => 1 + (1 - q) * (0.16 * Math.sin(2 * a + ph[0]) + 0.1 * Math.sin(3 * a + ph[1]) + 0.06 * Math.sin(5 * a + ph[2]));
    const across = (a: number) => 1 - q + q * 1.128 * Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const sq = form.square ? Math.sqrt(T.square * n * lot) / 2 : 0;
    const lots: { x: number; y: number; d: number; r: number; bj: number }[] = [];
    for (let bj = -NB; bj < NB; bj++) {
      // Along lanes the blocks of one row are out of step with the next, so no street runs straight through.
      const shift = planned ? 0 : (hash2(bj, 17, seed) - 0.5) * pitchX;
      for (let r = 0; r < 2; r++) {
        const y = yLo[NB + bj] + (r + 0.5) * fY;
        for (let bi = -NA; bi < NA; bi++) {
          for (let i = 0; i < k; i++) {
            const x = xLo(bi) + (i + 0.5) * fX + shift;
            if (Math.abs(x) < sq && Math.abs(y) < sq) continue;
            const a = Math.atan2(y, x);
            const d = (Math.hypot(x, y) * across(a)) / edge(a) + hash3(bi * k + i, bj * 2 + r, 5, seed) * 0.8 * sideL * (1 - q);
            if (d <= reach) lots.push({ x, y, d, r, bj });
          }
        }
      }
    }
    lots.sort((u, v) => u.d - v.d || u.y - v.y || u.x - v.x);
    // Lanes wander: every lot is carried a little by a slow noise, its neighbours with it.
    const lam = 14 * sideL;
    const amp = planned ? 0 : 2.2 * sideL;
    const warp = (x: number, y: number): [number, number] => (amp ? [x + (fbm(x / lam + 31, y / lam + 17, seed | 0) - 0.5) * 2 * amp, y + (fbm(x / lam - 12, y / lam + 45, (seed + 7) | 0) - 0.5) * 2 * amp] : [x, y]);
    // Where a house stands in the town's frame, and the way its front looks: at the front of its lot, on the street its
    // row is on. Along lanes it fronts its lane as the lane runs there, and not squarely.
    type Stand = { x: number; y: number; fx: number; fy: number };
    const stand = (l: { x: number; y: number; r: number }, h: number): Stand => {
      const ly = l.y + (l.r === 0 ? -forward : forward);
      const [x, y] = warp(l.x, ly);
      if (planned) return { x, y, fx: 0, fy: l.r === 0 ? -1 : 1 };
      const [ax, ay] = warp(l.x - fX / 2, ly);
      const [bx, by] = warp(l.x + fX / 2, ly);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const tx = (bx - ax) / len;
      const ty = (by - ay) / len;
      const fx = l.r === 0 ? ty : -ty;
      const fy = l.r === 0 ? -tx : tx;
      const j = (hash2(h, 6, seed) - 0.5) * 2 * turned;
      return { x, y, fx: fx * Math.cos(j) + fy * Math.sin(j), fy: fy * Math.cos(j) - fx * Math.sin(j) };
    };
    // Whether two houses would stand in one another, or closer than a step apart: no line parts them.
    const clash = (a: Stand, b: Stand): boolean => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      for (const [nx, ny] of [[a.fx, a.fy], [a.fy, -a.fx], [b.fx, b.fy], [b.fy, -b.fx]]) {
        const ra = (house.l / 2) * Math.abs(nx * a.fx + ny * a.fy) + (house.w / 2) * Math.abs(nx * a.fy - ny * a.fx);
        const rb = (house.l / 2) * Math.abs(nx * b.fx + ny * b.fy) + (house.w / 2) * Math.abs(nx * b.fy - ny * b.fx);
        if (Math.abs(nx * dx + ny * dy) >= ra + rb + 0.3) return false;
      }
      return true;
    };
    // The town takes its lots from its middle outward. Along lanes the wandering squeezes some lots against their
    // neighbours: a lot whose house would stand in one already taken is passed over, and the town takes the next.
    const taken: typeof lots = [];
    const stands: Stand[] = [];
    const cell = Math.hypot(house.w, house.l) + 0.5;
    const cells = new Map<number, number[]>();
    const cellOf = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
    for (const l of lots) {
      if (taken.length >= n) break;
      const st = stand(l, taken.length);
      if (!planned) {
        const ci = Math.floor(st.x / cell);
        const cj = Math.floor(st.y / cell);
        let hit = false;
        for (let j = cj - 1; j <= cj + 1 && !hit; j++) for (let i = ci - 1; i <= ci + 1 && !hit; i++) hit = (cells.get(cellOf(i, j)) ?? []).some((o) => clash(st, stands[o]));
        if (hit) continue;
        const own = cells.get(cellOf(ci, cj));
        if (own) own.push(stands.length);
        else cells.set(cellOf(ci, cj), [stands.length]);
      }
      taken.push(l);
      stands.push(st);
    }
    if (!taken.length) return;
    const D = taken[taken.length - 1].d;
    const rowExt = new Map<number, [number, number]>();
    taken.forEach((l, h) => {
      const e = rowExt.get(l.bj);
      if (!e) rowExt.set(l.bj, [l.x, l.x]);
      else {
        e[0] = Math.min(e[0], l.x);
        e[1] = Math.max(e[1], l.x);
      }
      const st = stands[h];
      const [x, y] = toScene(st.x, st.y);
      if (!(s.city ? fitCity(x, y) : fit(x, y)) || onAnothers(x, y, s)) return;
      const face = planned ? axis + (l.r === 0 ? PI : 0) : faceOf(st.fx, st.fy);
      houses.push({ x, y, z: ground.at(x, y), face, form: s.form, settlement: si, size: 1, variant: Math.floor(hash2(h, 12, seed) * HOUSE_VARIANTS), rank: Math.floor(hash2(h, 9, seed) * 256) });
      s.houses++;
    });
    // In words: the generic town's "no wall" is left out where a record states a wall's height or gates.
    const { wall: _generic, ...walled } = form;
    const stated = (town.from.wall ?? 'generic') !== 'generic' || !(form.wall_height !== undefined || form.wall_thickness !== undefined || form.gates !== undefined || form.moat === true);
    s.town = { text: townText(stated ? form : walled), from: stated ? town.from : Object.fromEntries(Object.entries(town.from).filter(([k]) => k !== 'wall')) };
    // A piece of its works, where the ground is in the scene and above the water.
    const put = (lx: number, ly: number, nx: number, ny: number, kind: number): void => {
      const [x, y] = toScene(lx, ly);
      if (!inScene(x, y)) return;
      const z = ground.at(x, y);
      if (z - water(x, y) < 0.2) return;
      works.push({ x, y, z, face: faceOf(nx, ny), form: kind, settlement: si });
    };
    // Water in the streets between some rows of a town of canals, as far as its houses reach.
    if (C > 0) {
      const canal = workOf({ kind: 'canal', height: 0, thickness: C }, 'A canal', town.from.streets ?? 'generic');
      for (let bj = -NB; bj < NB - 1; bj++) {
        if (!canalAfter(bj)) continue;
        const a = rowExt.get(bj);
        const b = rowExt.get(bj + 1);
        if (!a && !b) continue;
        const x0 = Math.min(a?.[0] ?? Infinity, b?.[0] ?? Infinity) - fX;
        const x1 = Math.max(a?.[1] ?? -Infinity, b?.[1] ?? -Infinity) + fX;
        const y = yLo[NB + bj] + 2 * fY + C / 2;
        const count = Math.max(1, Math.ceil((x1 - x0) / PIECE));
        for (let j = 0; j < count; j++) put(x0 + ((j + 0.5) * (x1 - x0)) / count, y, 0, 1, canal);
      }
    }
    // Its wall, of what its form says; or, where the form gives a wall's height, thickness or gates and not what it was
    // made of, of the generator's plain wall, which says so.
    const said = form.wall_height !== undefined || form.wall_thickness !== undefined || form.gates !== undefined || form.moat === true;
    // Whether a tradition or a record says what the wall was made of, or that there was none: the generic town's word
    // gives way to a wall whose height or gates a record states.
    const material = (town.from.wall ?? 'generic') !== 'generic' || !said;
    const wall = material ? (form.wall && form.wall !== 'none' ? form.wall : undefined) : T.unstated_wall;
    if (!wall) return;
    const height = mid(form.wall_height, T.walls[wall].height);
    const thick = mid(form.wall_thickness, T.walls[wall].thickness);
    // The line of the wall: the town's outline, a lot and a street clear of its outermost houses.
    const margin = sideL * 0.9 + thick / 2 + w + amp;
    const NP = 360;
    const line = (out: number): { xy: Float64Array; at: Float64Array; length: number } => {
      const xy = new Float64Array((NP + 1) * 2);
      const at = new Float64Array(NP + 1);
      for (let j = 0; j <= NP; j++) {
        const a = (TAU * j) / NP;
        const r = (D * edge(a)) / across(a) + out;
        xy[2 * j] = Math.cos(a) * r;
        xy[2 * j + 1] = Math.sin(a) * r;
        if (j) at[j] = at[j - 1] + Math.hypot(xy[2 * j] - xy[2 * j - 2], xy[2 * j + 1] - xy[2 * j - 1]);
      }
      return { xy, at, length: at[NP] };
    };
    // The point a distance along a line, and the way out from it.
    const along = (l: ReturnType<typeof line>, d: number): [number, number, number, number] => {
      const dd = ((d % l.length) + l.length) % l.length;
      let lo = 0;
      let hi = NP;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (l.at[m] <= dd) lo = m;
        else hi = m;
      }
      const span = l.at[lo + 1] - l.at[lo] || 1;
      const f = (dd - l.at[lo]) / span;
      const tx = (l.xy[2 * lo + 2] - l.xy[2 * lo]) / span;
      const ty = (l.xy[2 * lo + 3] - l.xy[2 * lo + 1]) / span;
      return [l.xy[2 * lo] + (l.xy[2 * lo + 2] - l.xy[2 * lo]) * f, l.xy[2 * lo + 1] + (l.xy[2 * lo + 3] - l.xy[2 * lo + 1]) * f, ty, -tx];
    };
    const ring = line(margin);
    // What says it had a wall: its `wall`, or whatever of the wall it states where it does not say what it was made of.
    const named = material ? WALL_LABEL[wall] : 'A town wall, of what is not said';
    const who = (material ? town.from.wall : town.from.wall_height ?? town.from.wall_thickness ?? town.from.gates ?? town.from.moat) ?? 'generic';
    const piece = workOf({ kind: 'wall', material: wall, height, thickness: thick }, named, who);
    const opening = Math.max(3, planned ? M : w * 1.5);
    const gateSpec: WorkSpec = { kind: 'gate', material: wall, height, thickness: thick, opening };
    const gate = workOf(gateSpec, `A gate in ${named.replace(/^A /, 'a ')}`, town.from.gates ?? who);
    const towers = towered(wall);
    const tower = towers ? workOf({ kind: 'tower', material: wall, height, thickness: thick }, `A tower of ${named.replace(/^A /, 'a ')}`, who) : -1;
    // Its gates: where the main streets leave a planned town, and round a town of lanes about evenly.
    const G = Math.max(1, Math.round(mid(form.gates, T.gates)));
    const gates = Array.from({ length: G }, (_, j) => (ring.length * (planned ? j : j + 0.6 * hash2(j, 21, seed))) / G).sort((a, b) => a - b);
    const pad = opening / 2 + (towers ? towerSide(gateSpec) * 0.5 : 2);
    gates.forEach((at, j) => {
      const [gx, gy, nx, ny] = along(ring, at);
      put(gx, gy, nx, ny, gate);
      // The run of wall from this gate to the next, its pieces overlapping a little so that they fill it.
      const from = at + pad;
      const to = (j + 1 < G ? gates[j + 1] : gates[0] + ring.length) - pad;
      if (to <= from) return;
      const count = Math.max(1, Math.ceil((to - from) / PIECE));
      for (let i = 0; i < count; i++) {
        const [x, y, ox, oy] = along(ring, from + ((i + 0.5) * (to - from)) / count);
        put(x, y, ox, oy, piece);
      }
      if (tower >= 0) {
        const stand = Math.max(1, Math.round((to - from) / T.tower_every));
        for (let i = 1; i < stand; i++) {
          const [x, y, ox, oy] = along(ring, from + (i * (to - from)) / stand);
          put(x, y, ox, oy, tower);
        }
      }
    });
    if (form.moat) {
      const moat = workOf({ kind: 'moat', height: 0, thickness: T.moat }, 'A moat', town.from.moat ?? who);
      const outer = line(margin + thick / 2 + 4 + T.moat / 2);
      const count = Math.max(1, Math.ceil(outer.length / PIECE));
      for (let i = 0; i < count; i++) {
        const d = ((i + 0.5) * outer.length) / count;
        // A causeway is left before each gate.
        const share = d / outer.length;
        if (gates.some((at) => Math.abs(((share - at / ring.length + 1.5) % 1) - 0.5) * outer.length < opening / 2 + 3)) continue;
        const [x, y, ox, oy] = along(outer, d);
        put(x, y, ox, oy, moat);
      }
    }
  }
}

/** The way a house faces by each word of the compass, in radians clockwise from north. */
const COMPASS: Record<NonNullable<DwellingSpec['faces']>, number> = {
  north: 0,
  'north-east': PI / 4,
  east: PI / 2,
  'south-east': (3 * PI) / 4,
  south: PI,
  'south-west': (5 * PI) / 4,
  west: (3 * PI) / 2,
  'north-west': (7 * PI) / 4,
};

const ENCLOSURE_LABEL: Record<Exclude<EnclosureWord, 'none'>, string> = {
  fence: 'A fence round a settlement',
  hedge: 'A hedge round a settlement',
  palisade: 'A palisade round a settlement',
  bank: 'A bank round a settlement',
  ditch: 'A ditch round a settlement',
  wall: 'A wall round a settlement',
};

/**
 * Places for the houses of a cluster: thrown at random on the round of ground they would take at `step` to a house,
 * none nearer another than most of a step, none within `clear` of the middle. As dense at the edge as at the middle,
 * with no rows and no spiral; the same for the same seed.
 */
function scatter(n: number, step: number, clear: number, seed: number): [number, number][] {
  const rng = new Rng((seed ^ 0x5ca77e2) >>> 0);
  const apart = step * 1.25;
  const out: [number, number][] = [];
  const cells = new Map<number, number[]>();
  const key = (x: number, y: number) => Math.floor(x / apart) * 65536 + Math.floor(y / apart);
  // The ground: the round n houses take, and the open middle besides.
  let reach = Math.sqrt(step * step * n + clear * clear);
  for (let tries = 0; out.length < n && tries < n * 60 + 200; tries++) {
    const a = rng.next() * TAU;
    const rr = Math.sqrt(clear * clear + (reach * reach - clear * clear) * rng.next());
    const x = Math.sin(a) * rr;
    const y = Math.cos(a) * rr;
    let free = true;
    for (let i = -1; i <= 1 && free; i++) {
      for (let j = -1; j <= 1 && free; j++) {
        for (const o of cells.get(key(x + i * apart, y + j * apart)) ?? []) {
          if ((out[o][0] - x) ** 2 + (out[o][1] - y) ** 2 < apart * apart) {
            free = false;
            break;
          }
        }
      }
    }
    if (!free) {
      // Too full to take another: a little more ground.
      if (tries % 40 === 39) reach *= 1.06;
      continue;
    }
    const k = key(x, y);
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(out.length);
    out.push([x, y]);
  }
  // Whatever found no place stands at the edge, so that every house has one.
  while (out.length < n) {
    const a = rng.next() * TAU;
    out.push([Math.sin(a) * reach, Math.cos(a) * reach]);
  }
  return out;
}

const WALL_LABEL: Record<WallWord, string> = {
  earth: 'A rampart of earth',
  'rammed-earth': 'A wall of rammed earth',
  timber: 'A palisade',
  mudbrick: 'A wall of mudbrick',
  stone: 'A wall of stone',
  brick: 'A wall of brick',
};

/** The cell of the people's grid a place is in, or -1. */
export function cellAt(g: { north: number; west: number; nx: number; ny: number; res: number }, lat: number, lon: number): number {
  const row = Math.floor((g.north - lat) / g.res + 1e-9);
  let dl = lon - g.west;
  dl -= 360 * Math.floor(dl / 360);
  const col = Math.floor(dl / g.res + 1e-9);
  return row < 0 || row >= g.ny || col < 0 || col >= g.nx ? -1 : row * g.nx + col;
}

/** What people made of the ground at a place: fields, pasture, yards and paddies, each 0–1. */
export interface LandUse {
  crop: number;
  pasture: number;
  yard: number;
  paddy: number;
}

/** A plan's settlements by where they are, so that the ground can ask which are near. */
export class LandUseMap {
  private buckets = new Map<number, number[]>();
  private size = 2000;
  /** how trodden the ground is round each house, 0–255, on a grid of `step` metres about the scene's middle */
  private yards: Uint8Array;
  private step = 16;
  private across: number;
  constructor(private plan: SettlementPlan, private ground: Ground, private water: (x: number, y: number) => number, private seed: number) {
    // Every house's own ground: its yard, or a few steps round its walls.
    let reach = 64;
    for (const h of plan.houses) reach = Math.max(reach, Math.abs(h.x) + 48, Math.abs(h.y) + 48);
    this.across = Math.ceil((2 * reach) / this.step);
    this.yards = new Uint8Array(this.across * this.across);
    const half = (this.across * this.step) / 2;
    for (const h of plan.houses) {
      const f = plan.forms[h.form];
      const r = Math.max(7, Math.min(18, (f.home?.lot ?? 14) * 0.5));
      const i0 = Math.floor((h.x - r * 1.2 + half) / this.step);
      const i1 = Math.floor((h.x + r * 1.2 + half) / this.step);
      const j0 = Math.floor((h.y - r * 1.2 + half) / this.step);
      const j1 = Math.floor((h.y + r * 1.2 + half) / this.step);
      for (let j = Math.max(0, j0); j <= Math.min(this.across - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(this.across - 1, i1); i++) {
          const d = Math.hypot((i + 0.5) * this.step - half - h.x, (j + 0.5) * this.step - half - h.y);
          const v = Math.round(255 * (1 - smooth(r * 0.5, r * 1.2, d)));
          const at = j * this.across + i;
          if (v > this.yards[at]) this.yards[at] = v;
        }
      }
    }
    plan.settlements.forEach((s, i) => {
      const reach = Math.max(s.fieldR, s.r);
      const b0 = Math.floor((s.x - reach) / this.size);
      const b1 = Math.floor((s.x + reach) / this.size);
      const c0 = Math.floor((s.y - reach) / this.size);
      const c1 = Math.floor((s.y + reach) / this.size);
      for (let b = b0; b <= b1; b++) for (let c = c0; c <= c1; c++) {
        const k = b * 65536 + c;
        let list = this.buckets.get(k);
        if (!list) this.buckets.set(k, (list = []));
        list.push(i);
      }
    });
  }
  /** How trodden the ground is by the houses near a place, 0 to 1: read between the grid's points. */
  private yardAt(x: number, y: number): number {
    const half = (this.across * this.step) / 2;
    const u = (x + half) / this.step - 0.5;
    const v = (y + half) / this.step - 0.5;
    const i = Math.floor(u);
    const j = Math.floor(v);
    if (i < 0 || j < 0 || i >= this.across - 1 || j >= this.across - 1) return 0;
    const a = u - i;
    const b = v - j;
    const k = j * this.across + i;
    return ((this.yards[k] * (1 - a) + this.yards[k + 1] * a) * (1 - b) + (this.yards[k + this.across] * (1 - a) + this.yards[k + this.across + 1] * a) * b) / 255;
  }
  /** What covers the ground at a place. */
  at(x: number, y: number, out: LandUse = { crop: 0, pasture: 0, yard: 0, paddy: 0 }): LandUse {
    out.crop = out.pasture = out.yard = out.paddy = 0;
    const list = this.buckets.get(Math.floor(x / this.size) * 65536 + Math.floor(y / this.size));
    if (!list) return out;
    const z = this.ground.at(x, y);
    const above = z - this.water(x, y);
    if (above < 0.5) return out;
    // Irregular edges, the same wherever they are asked for.
    const wob = fbm(x / 420, y / 420, this.seed + 401) - 0.5;
    for (const i of list) {
      const s = this.plan.settlements[i];
      const d = Math.sqrt((x - s.x) ** 2 + (y - s.y) ** 2);
      // Among houses that stand together the ground is trodden; where they stand apart, only round each of them.
      const yard = s.loose ? 0 : 1 - smooth(s.r * 0.75, s.r * 1.1, d + wob * s.r * 0.6);
      if (yard > out.yard) out.yard = yard;
      if (s.fields === 'none') continue;
      const edge = s.fieldR * (1 + wob * 0.45);
      const inField = 1 - smooth(edge * 0.92, edge * 1.05, d);
      if (inField <= 0) continue;
      if (s.fields === 'pasture') out.pasture = Math.max(out.pasture, inField);
      else if (s.fields === 'swidden') {
        // Only some plots are cleared at a time: the rest is growing back.
        const plot = noise(x / 160, y / 160, this.seed + 403);
        out.crop = Math.max(out.crop, inField * smooth(0.55, 0.62, plot));
      } else {
        out.crop = Math.max(out.crop, inField);
        if (s.fields === 'rice' || s.fields === 'irrigated') out.paddy = Math.max(out.paddy, inField * (s.fields === 'rice' ? 1 : 0.5) * (1 - smooth(4, 14, above)));
      }
    }
    const own = this.yardAt(x, y);
    if (own > out.yard) out.yard = own;
    out.crop *= 1 - out.yard * 0.8;
    return out;
  }
}

/** The plan's land use as an image: R crops, G pasture, B yards and lanes, A flooded paddies. */
export function landUseMask(map: LandUseMap, size: number, half: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const scale = (half * 2) / size;
  const u: LandUse = { crop: 0, pasture: 0, yard: 0, paddy: 0 };
  for (let j = 0; j < size; j++) {
    const y = -half + (j + 0.5) * scale;
    for (let i = 0; i < size; i++) {
      const x = -half + (i + 0.5) * scale;
      map.at(x, y, u);
      const at = (j * size + i) * 4;
      data[at] = (u.crop * 255) | 0;
      data[at + 1] = (u.pasture * 255) | 0;
      data[at + 2] = (u.yard * 255) | 0;
      data[at + 3] = (u.paddy * 255) | 0;
    }
  }
  return data;
}

/** The anthrome classes a plan draws on, for a panel: its own name for what is there. */
export function anthromeLabel(spec: SceneSpec, k: number): string | undefined {
  return spec.people ? anthromeOf(spec.people.classes, k)?.label : undefined;
}
