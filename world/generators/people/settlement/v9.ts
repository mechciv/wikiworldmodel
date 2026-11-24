// The settlement generator, version 9 (docs/HUMAN-LANDSCAPE.md): the anonymous human landscape of a scene. From the
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
// Version 4:
//   - People go about, and the animals they kept feed and move on (life/routines.ts): each has a way of its own, to a
//     place or two near where it stands and back, which the renderer moves it along by the visit's clock. A person makes
//     for the door of another house of the settlement or for something the settlement had of its own, a well or an oven,
//     and keeps clear of every house and of the yards that are enclosed; one who stands in such a yard leaves it by its
//     front, where its way in is. A herd keeps together, and out from among the houses. Where each stands as the clock
//     starts is what version 3 made. No record says anything of any of it: who walks, where to, how fast and how long
//     they stay are the generator's.
//
// Version 5 (docs/plans/RENDERING.md, the fidelity pass): a figure's body and dress, and what houses are built of, are
// drawn afresh, on the legs and arms that version 4 set walking; where everything stands is what version 4 made.
//
// Version 6 (docs/plans/RENDERING.md, the fidelity pass):
//   - A house close by has the relief its claims support (dwellings.ts): a wall that is built up is as thick as its
//     kind where a door or a window is cut through it, with a lintel, a sill and a threshold; a wall of earth, turf or
//     dry stone leans in as it rises; a flat roof's walls rise past its deck as its parapet, under a coping, with the
//     ends of its beams through them. From a way off a house is what version 5 drew.
//   - A field under a crop has the crop standing on it close by, in rows along its plot (crops.ts): one plain stand,
//     the same everywhere, which names no crop. The plots are laid out by core/plots.ts, for the ground's colour and for
//     what is sown alike.
//   - A figure in a robe has feet under its hem, close by, which stride with it as it walks.
//   Where every house, work, animal and path stands, and every way that is walked, is what version 5 made.
//
// Version 7 gives settled farmers connected lanes, compact or dispersed lots, field entrances and enclosures
// following the occupied parcels. Builds made before it carry no lane widths and are drawn without lanes. Since
// version 9 every build is drawn with version 9's siting and fields, whatever its own version.
//
// Version 9 (sites.ts):
//   - A cell's settlements stand where people looked for a place to live, and no longer on a grid over the cell: near
//     fresh water and above its floods, on level ground a little up from the bottom of its valley, on the better soil
//     and near a town, by chance in proportion to how good the place is, gathered loosely round a few of them, and no
//     two nearer than the cell's spacing allows, across a cell's edge as within it. A cell's settlements lean toward its
//     more crowded neighbours, so that a cell's edge does not show as a step.
//   - A cell's settlements are of many sizes within the range its tradition or pattern gives, the smaller oftener, and
//     the larger take the better places; version 8 drew every settlement of a cell the same size.
//   - Fields are no longer a disc about each settlement: they spread from its houses over the land nearest it by the
//     effort of walking there, through level, dry and better ground first and along the land's grain, and stop at the
//     water, at ground too steep, at a neighbour's fields and at the most its people farmed. Settlements just beyond
//     the scene's edge grow theirs too, so that fields reach into the scene from beyond it.
//
// Version 8 (docs/plans/HUMAN-LANDSCAPE-REALISM.md):
//   - Continuous terrain-conforming perimeter walls, enclosures, watchtowers and roofed gatehouses (walls.ts),
//     following each farming settlement's occupied boundary polygon (with gatehouses where its through-lane exits)
//     and each walled town's circuit, replacing disconnected stacked wall blocks.
//   - Two-level domain-oriented seasonal fields grounded in `tradition/agriculture` records (core/plots.ts),
//     slope- and riparian-gated land use, 3D fieldworks and hillside terraces (fieldworks.ts), and 7 botanical
//     crop archetypes (crops.ts).
//   - Everyday procedural settlement and field activity: market stalls, civic altars, pottery/charcoal kilns,
//     animated hearth/kiln smoke plumes, grain stooks, ploughs, carts/barrows on streets and lanes, river jetties,
//     and working figures.
//
// Everything is seeded by the world's 5′ cells and the anthromes' step, not by the scene, so two scenes that overlap put
// their settlements in the same places: only the ground they stand on, which is the scene's, can move one a little.
import { fillDwelling, homesteadOf, houseSize, HOUSE_VARIANTS, outbuildingSpec, type Homestead, type HouseDims, type OutbuildingParams } from '../dwellings.ts';
import { agricultureAt, genericCropsFor, husbandryAt, mid, OUTBUILDING_LABEL, OUTBUILDING_ROOFED, outbuildingText, prevalenceOf, townText, traditionFor, within, type CropEntry, type DwellingSpec, type EnclosureWord, type FieldSpec, type LifewayWord, type OutbuildingUse, type TownSpec, type Tradition } from '../../../../core/dwelling.ts';
import { anthromeOf, lifewayOf, LIFEWAY_OF, type CityNear, type FieldUse, type Lifeway, type Pattern } from '../../../../core/landscape.ts';
import { buildFieldPalette, FIELD_SLOPE, PLOT, plotAt, plotSlotIndex, plotStyle, type FieldPalette } from '../../../../core/plots.ts';
import type { ClimateClass } from '../../../../core/climate.ts';
import type { SceneSpec } from '../../../../core/scene.ts';
import { dcos, hash2, hash3, PI, Rng, TAU } from '../../city/math.ts';
import { POSE } from '../../life/forms.ts';
import { fbm, noise } from '../../life/land.ts';
import { routineOf, WAY, wayBeside, wayFor, type Pace, type RoutineParams } from '../../life/routines.ts';
import { personGoes, PERSON_HIP } from '../figures.ts';
import { PIECE, towered, WORK_VARIANTS, type WallWord, type WorkSpec } from '../works.ts';
import { ENCLOSURE_SIZE } from '../yard.ts';
import type { CropParams } from '../crops.ts';
import type { FieldBoundKind } from '../fieldworks.ts';
import type { GateOpening, PerimeterSpec } from '../walls.ts';
import { farmLanes, LaneGround, type FarmLayout, type Lane, type LaneWidths, type Point } from './lanes.ts';
import { earthOf, FIELD_USE, growFields, GROWTH, nodeOf, siteCells, SITING, SiteWorth, sizesOf, USE_OF, type FieldGrid, type FieldSource, type GrowthParams, type SiteCell, type SitingParams, type WaterNear } from './sites.ts';
import { MAT } from '../../city/kit.ts';

export { peopleReach, waterNear, type WaterNear } from './sites.ts';

export const GENERATOR = 'gen:people/settlement';
export const VERSION = 9;

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
  lanes?: LaneWidths;
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
    /** how far above the water a house of a city of a list or a record stands at least, in metres */
    city_above_water: number;
  };
  /** where in its cell a settlement stands (sites.ts) */
  siting?: SitingParams;
  /** how its fields spread over the land about it (sites.ts) */
  growth?: GrowthParams;
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
  /**
   * `walk`: how the people go about once they are drawn (life/routines.ts): how fast, m/s; how long one takes to get
   * going, s; how far each leg of a way is, m; how long one stays at each place, s; how far the ground may lie off the
   * straight line of a leg, m; and how many places are tried before one stays put. Unsaid, they stay where they stand.
   */
  figures?: { per_house: number; most_in_settlement: number; most: number; height: number; walk?: { speed: number; go: number; range: [number, number]; stay: [number, number]; sag: number; tries: number } };
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
  /**
   * The crop of the fields, drawn close by as plants in rows along each plot (crops.ts). Which crop grew is nobody's
   * record here, and none is named: these say only how the one plain stand is drawn; without them none is
   */
  crops?: CropParams;
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
  /** where its way starts among the plan's ways, if it goes one (life/routines.ts) */
  way?: number;
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

/** A piece of a settlement's works: a canal, person, boat, market stall, kiln, grain stook, cart, plough, jetty, altar, etc. */
export interface Work {
  x: number;
  y: number;
  z: number;
  /** the way its outside faces, radians clockwise from north; it runs across that */
  face: number;
  /** which piece it is, in the plan's list, and its settlement */
  form: number;
  settlement: number;
  /** optional explicit pose/style variant override (otherwise index % WORK_VARIANTS) */
  variant?: number;
  /** true for agricultural workers placed out in fields rather than beside houses */
  field?: boolean;
  /** for a person or cart that moves: where their way starts among the plan's ways (life/routines.ts) */
  way?: number;
}

/** A kind of piece the plan draws, and what says the town had it: a tradition's id, a record's, or `generic`. */
export interface WorkForm {
  key: string;
  spec: WorkSpec;
  label: string;
  from: string;
}

/** An internal settlement street, lane, or gate approach draped on terrain. */
export interface Street {
  /** flat [x0, y0, x1, y1, …] in scene metres */
  line: number[];
  width: number;
  /** paved stone/flagstone main street vs compacted earth residential lane */
  paved: boolean;
  settlement: number;
}

/** A continuous terrain-conforming settlement wall/enclosure circuit with provenance metadata. */
export interface PlanPerimeter extends Omit<PerimeterSpec, 'entity'> {
  settlement: number;
  label: string;
  from: string;
  gateFrom: string;
  moatFrom?: string;
}

/** A hearth chimney, cooking roof, or kiln emitting animated rising smoke. */
export interface SmokeSource {
  x: number;
  y: number;
  z: number;
  /** relative intensity 0.3–1.2 (kilns strongest) */
  strength: number;
  seed: number;
  settlement: number;
}

/** The regional agricultural tradition (or climate-aware generic fallback) and seasonal crop palette of the scene. */
export interface SettlementAgriculture {
  id?: string;
  label: string;
  from: 'tradition' | 'generic';
  crops: CropEntry[];
  palette: FieldPalette;
  bounds: FieldBoundKind;
}

export interface Settlement {
  /** The compact farming settlement’s occupied ground, including its shared space. */
  boundary?: Point[];
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
  /** the works of its settlements (canals, stalls, kilns, stooks, carts, ploughs, jetties, altars, people, boats, yard works) */
  works: Work[];
  workForms: WorkForm[];
  /** continuous terrain-conforming walls, village enclosures, corner watchtowers, gatehouses and moats */
  perimeters: PlanPerimeter[];
  /** internal settlement streets, lanes and plaza approaches */
  streets: Street[];
  /** hearth and kiln smoke plume emitters */
  smokes: SmokeSource[];
  /** the animals its people kept, where a husbandry tradition names them */
  animals: Kept[];
  /** the ways its people, carts and animals go, ROUTE numbers each (life/routines.ts) */
  ways: number[];
  /** the paths between its settlements: each a line of points, flat [x, y, …] in the scene's metres; and how wide they are */
  paths: number[][];
  /** Local field tracks, lanes and the turnoffs serving individual compounds. */
  lanes: Lane[];
  pathWidth: number;
  /** people the plan's houses hold, and the people the world puts in the land it covers */
  drawn: number;
  expected: number;
  /** people one house stands for, on average; more than a household where the scene would hold more houses than it may draw */
  perHouse: number;
  /** the field system of the place itself, which the ground's plots are drawn in */
  style: { kind: NonNullable<FieldSpec['kind']>; plot: number; from: 'tradition' | 'generic'; tradition?: string };
  /** the regional crops, seasonal FieldPalette and physical field-bound style of the scene */
  agriculture: SettlementAgriculture;
  /** the lifeway at the place */
  lifeway: Lifeway;
  /** what each node of a grid over the scene is farmed as, and by which settlement (sites.ts) */
  fields: FieldGrid;
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
 * house stands in a river or on a cliff. The climate class picks the generic house where no tradition holds. `beasts` is
 * how the animals its people kept go about once they are drawn: the living scene's own parameters for its wild ones
 * (gen:life/scene, animals.routines), handed over by whoever draws both. Without it they stay where they stand. `near` is
 * how far a place is from fresh water (sites.ts, waterNear), which people settled by; without it no place is nearer than
 * another.
 */
export function makeSettlement(spec: SceneSpec, ground: Ground, water: (x: number, y: number) => number, extent: number, beasts?: RoutineParams, near?: WaterNear): SettlementPlan {
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
    const clustered = p.lanes && pattern === 'farmsteads' && ['walled', 'nucleated', 'hamlet'].includes(t?.settlement.pattern ?? '');
    if (!(stated > 0) && !t?.settlement.layout && !clustered) return p.patterns[pattern].lot;
    const size = houseSize(t && Object.keys(t.dwelling).length ? fillDwelling(t.dwelling, genericFor(p, pattern, climate).spec) : genericFor(p, pattern, climate).spec);
    const long = Math.max(size.w, size.l);
    if (stated > 0) return (stated >= long + 1 ? stated : stated + long) ** 2;
    if (clustered) return Math.min(p.patterns.villages.lot, Math.max(11, long * 1.65) ** 2);
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
  const farms = new Map<Settlement, Pick<FarmLayout, 'lanes' | 'boundary' | 'exits'>>();
  const lanes: Lane[] = [];
  const houses: House[] = [];
  const perimeters: PlanPerimeter[] = [];
  const streets: Street[] = [];
  const smokes: SmokeSource[] = [];
  const gatesOf = new Map<number, GateOpening[]>();
  const axisOf = new Map<number, number>();
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
  // The place's own field system and regional agricultural tradition (or climate-aware generic fallback), compiled into
  // the shared 8-slot seasonal FieldPalette for ground shading, crop stands, 3D fieldworks, farm lane edges, and activity.
  const centre = cellAt(P.grid, origin.lat, origin.lon);
  const centreRegion = centre >= 0 ? P.grid.region[centre] : undefined;
  const tc = centreRegion !== undefined && P.lifeway.pattern !== 'none' ? traditionOf(centreRegion, P.lifeway.pattern)?.tradition : undefined;
  const ag = P.lifeway.pattern !== 'none' ? agricultureAt(P.agriculture ?? [], centreRegion, P.t, LIFEWAY_OF[P.lifeway.pattern]) : undefined;
  const use = P.lifeway.fields === 'none' ? 'rainfed' : P.lifeway.fields;
  const genericPlot = p.plots[use];
  const styleKind = tc?.fields.kind ?? ag?.fields.kind;
  const style = styleKind
    ? { kind: styleKind, plot: mid(tc?.fields.plot ?? ag?.fields.plot, genericPlot.plot), from: 'tradition' as const, tradition: tc?.fields.kind ? tc.id : ag!.id }
    : { kind: genericPlot.kind, plot: genericPlot.plot, from: 'generic' as const };
  const plots = plotStyle(style);
  const pStyle = plots;
  const month = spec.climate?.month ?? 6;
  const cropsList: CropEntry[] = ag?.crops.length ? ag.crops : genericCropsFor(use, climate);
  const boundsWord = (tc?.fields.bounds ?? ag?.fields.bounds ?? 'none') as FieldBoundKind;
  const palette = buildFieldPalette(cropsList, month, origin.lat, pStyle.kind, use, climate);
  const agriculture: SettlementAgriculture = {
    ...(ag ? { id: ag.id } : {}),
    label: ag ? ag.label : `Generic ${use} crops`,
    from: ag ? 'tradition' : 'generic',
    crops: cropsList,
    palette,
    bounds: boundsWord,
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
  // Then each 5′ cell the scene reaches, as its anthrome and region say (sites.ts): the cells within the scene, whose
  // settlements are drawn; those within `growth.margin` of its edge, whose settlements are not drawn but whose fields
  // reach into it; and a ring of cells about them all, whose settlements are only weighed, so that a place near the
  // edge of those comes out as it would in a scene centred on it.
  const g = P.grid;
  const side = g.res * EARTH * DEG;
  // A build made before version 9 has neither: its scenes take the record's, as a build made now would.
  const S = p.siting ?? SITING;
  const G = p.growth ?? GROWTH;
  const margin = extent + G.margin;
  // What a cell holds: its way of life and tradition, its people, and the sizes of its settlements, largest first.
  interface CellPeople {
    k: number;
    region: number;
    life: Lifeway & { pattern: Exclude<Pattern, 'none'> };
    gr: number;
    gc: number;
    seed: number;
    found: ReturnType<typeof traditionOf>;
    pp: PatternParams;
    household: number;
    area: number;
    houses: number;
    lot: number;
    site: SiteCell;
    /** how far outside the scene it lies, m, each way: 0 within it */
    out: number;
  }
  const crowdOf = (row: number, col: number): number => {
    if (row < 0 || col < 0 || row >= g.ny || col >= g.nx) return -1;
    const i = row * g.nx + col;
    // A cell with no class is the sea or no land the world knows of: it says nothing of crowding, and is left out, so
    // that a coast does not push settlements off it. Land of a class with no people is empty, and counts so.
    if (!g.anthrome[i]) return -1;
    return g.density[i] > 0 ? g.density[i] : 0;
  };
  const cellsOf: CellPeople[] = [];
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
      const out = Math.max(0, x0 - extent, -extent - x1, y0 - extent, -extent - y1);
      if (out > G.margin + Math.max(x1 - x0, y1 - y0)) continue;
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
      if (out === 0) {
        // The part of the cell inside the scene, for what the world expects of it.
        const inside = (Math.max(0, Math.min(x1, extent) - Math.max(x0, -extent)) * Math.max(0, Math.min(y1, extent) - Math.max(y0, -extent))) / ((x1 - x0) * (y1 - y0));
        expected += d * area * inside;
      }
      const houses = (d * area) / household;
      const range = t?.settlement.houses ?? { lo: pp.houses[0], hi: pp.houses[1] };
      const span = typeof range === 'number' ? { lo: range, hi: range } : range;
      const sizes = sizesOf(houses, span, S.sizes, seed);
      const lot = lotOf(life.pattern, t);
      // How near two of its settlements may stand: a share of their mean spacing, and no nearer than its largest two
      // would need to keep their houses apart.
      const widest = Math.sqrt(((sizes[0] ?? 1) * lot) / PI);
      const spacing = Math.max(S.spacing * Math.sqrt((area * 1e6) / Math.max(1, sizes.length)), 2 * widest + S.gap);
      // Its people to the km² at a place, as the cells about it share theirs, over its own: where its neighbours are more
      // crowded its settlements stand oftener toward them, so that a cell's edge shows no step.
      const crowd = (x: number, y: number): number => {
        const cx = col + (x - x0) / (x1 - x0) - 0.5;
        const cy = row + (y1 - y) / (y1 - y0) - 0.5;
        const c0 = Math.floor(cx);
        const r0 = Math.floor(cy);
        const fx = cx - c0;
        const fy = cy - r0;
        let sum = 0;
        let wsum = 0;
        for (const [dr, dc, w] of [[0, 0, (1 - fx) * (1 - fy)], [0, 1, fx * (1 - fy)], [1, 0, (1 - fx) * fy], [1, 1, fx * fy]] as [number, number, number][]) {
          const v = crowdOf(r0 + dr, c0 + dc);
          if (v < 0) continue;
          sum += v * w;
          wsum += w;
        }
        return Math.max(0.5, Math.min(2, (wsum > 0 ? sum / wsum : d) / d));
      };
      cellsOf.push({ k, region, life: life as CellPeople['life'], gr, gc, seed, found, pp, household, area, houses, lot, out, site: { x0, x1, y0, y1, north, west, res: g.res, seed, sizes, spacing, lot, crowd } });
    }
  }
  const earth = earthOf(origin);
  // The mean height about a place is kept as far as the ring of weighed cells reaches: a cell's width past the margin's.
  const worth = new SiteWorth(S, ground, near, ok, cityHere, seedOf(hash2(0x50, 0x11, 0x5017)), margin + side * 2.2);
  const places = siteCells(cellsOf.map((c) => c.site), worth, S);
  // The fields of settlements beyond the scene's edge that reach into it, and of those drawn: grown together, below.
  const sources: FieldSource[] = [];
  cellsOf.forEach((c, ci) => {
    if (c.out > G.margin) return;
    const t = c.found?.tradition;
    const town = c.life.pattern === 'city' || c.life.pattern === 'towns' ? townOf(t) : undefined;
    const perHouse = (c.area * 1e6) / Math.max(1, c.houses);
    // Its settlements' fields: each its houses' share of the cell's, the less where its neighbours crowd it, and all of
    // them together the share of the cell its pattern gives, whatever the crowding where they happened to stand.
    let held = 0;
    let weighed = 0;
    places[ci].forEach(([x, y], n) => {
      held += c.site.sizes[n];
      weighed += c.site.sizes[n] / c.site.crowd(x, y);
    });
    const even = weighed > 0 ? held / weighed : 1;
    places[ci].forEach(([x, y, k], n) => {
      const size = c.site.sizes[n];
      const r = Math.sqrt((size * c.lot) / PI);
      const fieldR = Math.sqrt(r * r + (c.pp.fields * size * perHouse * even) / c.site.crowd(x, y) / PI);
      // A settlement beyond the scene, or in a city's ground, is not drawn here; it has its spot all the same, and one
      // beyond the scene its fields.
      if (cityHere.some((h) => (x - h.x) ** 2 + (y - h.y) ** 2 < h.r * h.r)) return;
      if (!inScene(x, y)) {
        if (c.life.fields !== 'none') sources.push({ starts: [[x, y]], r, x, y, area: PI * fieldR * fieldR, use: c.life.fields, settlement: -1 });
        return;
      }
      // A house stands in its yard where it is not on the lots of a town's streets.
      const form = formOf(c.life.pattern, t, c.found?.kin, 1, town && c.lot <= p.towns.open_lot ? undefined : c.lot);
      // Seeded by its place, which its cell's seed fixes, not by its rank among the places taken, which their worth decides
      // and two scenes' grounds may order a little differently.
      const own = seedOf(hash3(k, c.gr, c.gc, c.seed ^ 0x51d));
      const s = settlements.push({ x, y, r, fieldR, pattern: c.life.pattern, fields: c.life.fields, houses: 0, people: size * c.household, anthrome: c.k, region: c.region, form, tier: c.life.tier, seed: own }) - 1;
      const first = houses.length;
      layOut(settlements[s], s, size, c.lot, own, t, town, (gw) => formOf(c.life.pattern, t, c.found?.kin, gw));
      housesOf[s] = [first, houses.length];
    });
  });
  // The fields of every settlement drawn, a city's among them, grown from its houses; then those beyond the edge.
  const drawnSources: FieldSource[] = [];
  settlements.forEach((s, si) => {
    if (s.fields === 'none') return;
    const [h0, h1] = housesOf[si] ?? [0, 0];
    const starts: [number, number][] = [];
    for (let h = h0; h < h1; h++) starts.push([houses[h].x, houses[h].y]);
    if (!starts.length) starts.push([s.x, s.y]);
    drawnSources.push({ starts, r: s.r, x: s.x, y: s.y, area: PI * s.fieldR * s.fieldR, use: s.fields, settlement: si });
  });
  const fieldGrid = growFields([...drawnSources, ...sources], ground, water, near, earth, G, margin, seedOf(hash2(0x50, 0x12, 0x5017)));
  // Whether a place is well inside a settlement's own fields: the node nearest it and those about it all its own, so
  // that the fields are drawn there whole (LandUseMap reads the nodes about a place, its edge a little moved).
  const inOwnFields = (x: number, y: number, si: number): boolean => {
    const k = nodeOf(fieldGrid, x, y);
    if (k < 0) return false;
    const n = fieldGrid.nx;
    const i = k % n;
    if (i < 1 || i >= n - 1 || k < n || k >= fieldGrid.owner.length - n) return false;
    for (let dj = -n; dj <= n; dj += n) for (let di = -1; di <= 1; di++) if (fieldGrid.owner[k + dj + di] !== si) return false;
    return true;
  };
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
      const farm = farms.get(s);
      const streets = farm && new LaneGround(farm.lanes);
      const civic: { x: number; y: number; radius: number }[] = [];
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
          if (streets) {
            // Place shared buildings and ponds beside the circulation space, clear of lots and one another.
            const radius = across * 0.65 + 0.7;
            const free = (x: number, y: number) => {
              if (!fit(x, y) || onAnothers(x, y, s) || streets.near(x, y, radius)) return false;
              if (civic.some(c => Math.hypot(c.x - x, c.y - y) < radius + c.radius)) return false;
              for (let h = h0; h < h1; h++) {
                const home = houses[h], sz = sizeOf(home);
                if (Math.hypot(home.x - x, home.y - y) < radius + Math.hypot(sz.w, sz.l) / 2) return false;
              }
              return true;
            };
            for (let tr = 0; tr < 36 && !free(x, y); tr++) {
              const angle = face + tr * 2.399963;
              const r = middle ? radius + 5 + tr : far + radius + 4;
              x = s.x + Math.sin(angle) * r;
              y = s.y + Math.cos(angle) * r;
            }
            if (!free(x, y)) continue;
            civic.push({ x, y, radius });
          } else if (!(s.city ? fitCity(x, y) : fit(x, y))) continue;
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
  // Continuous terrain-conforming enclosures round villages, where their tradition says: a fence, hedge, palisade,
  // bank, ditch, or rammed-earth/stone/brick wall hugging either the farm layout's occupied boundary polygon (with
  // gatehouses where the main through-lane crosses it) or the built block footprint.
  const segHit = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): [number, number] | undefined => {
    const rx = bx - ax;
    const ry = by - ay;
    const sx = dx - cx;
    const sy = dy - cy;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-9) return undefined;
    const qpx = cx - ax;
    const qpy = cy - ay;
    const t = (qpx * sy - qpy * sx) / denom;
    const u = (qpx * ry - qpy * rx) / denom;
    if (t >= -1e-4 && t <= 1 + 1e-4 && u >= -1e-4 && u <= 1 + 1e-4) {
      return [ax + t * rx, ay + t * ry];
    }
    return undefined;
  };
  const E = p.enclosures;
  if (E) {
    let laid = 0;
    const order = settlements.map((_, i) => i).sort((a, b) => Math.hypot(settlements[a].x, settlements[a].y) - Math.hypot(settlements[b].x, settlements[b].y));
    for (const si of order) {
      if (laid >= 40) break;
      const s = settlements[si];
      const f = forms[s.form];
      const t = f.tradition ? traditionById.get(f.tradition) : undefined;
      const [h0, h1] = housesOf[si] ?? [0, 0];
      // A town has its own wall, or none, by its town form.
      if (!t || h1 <= h0 || s.town) continue;
      const word = t.settlement.enclosure ?? (t.settlement.pattern === 'walled' ? E.unstated : undefined);
      if (!word || word === 'none') continue;
      if (!inScene(s.x, s.y)) continue;
      const from = t.settlement.enclosure ? (t.from['settlement.enclosure'] ?? t.id) : 'generic';
      const farm = farms.get(s);
      const ring: [number, number][] = [];
      const gates: GateOpening[] = [];
      const gateWidth = word === 'wall' ? 5.2 : 4.2;

      if (farm && farm.boundary.length >= 3) {
        // Use the farming layout's occupied convex boundary polygon directly, orienting CCW so outward edge normals are (dy, -dx)/len.
        let area = 0;
        for (let j = 0; j < farm.boundary.length; j++) {
          const a = farm.boundary[j];
          const b = farm.boundary[(j + 1) % farm.boundary.length];
          area += a[0] * b[1] - b[0] * a[1];
        }
        const poly: [number, number][] = area >= 0 ? farm.boundary.map((pt) => [pt[0], pt[1]]) : [...farm.boundary].reverse().map((pt) => [pt[0], pt[1]]);
        for (const pt of poly) ring.push(pt);
        const road = farm.lanes.find((l) => l.width === p.lanes!.main);
        if (road && road.line.length >= 4) {
          for (let j = 0; j < poly.length; j++) {
            const a = poly[j];
            const b = poly[(j + 1) % poly.length];
            const edx = b[0] - a[0];
            const edy = b[1] - a[1];
            const elen = Math.hypot(edx, edy);
            if (elen < 1e-4) continue;
            const nx = edy / elen;
            const ny = -edx / elen;
            for (let q = 0; q + 3 < road.line.length; q += 2) {
              const hit = segHit(a[0], a[1], b[0], b[1], road.line[q], road.line[q + 1], road.line[q + 2], road.line[q + 3]);
              if (!hit) continue;
              if (gates.some((g2) => Math.hypot(g2.x - hit[0], g2.y - hit[1]) < 8)) continue;
              gates.push({ x: hit[0], y: hit[1], dx: nx, dy: ny, width: Math.max(gateWidth, road.width + 1.0) });
            }
          }
        }
        // Fallback if a tiny settlement's through-lane did not cross the boundary: open gates closest to its exits.
        if (!gates.length) {
          const targets = farm.exits.length ? farm.exits : [[s.x, s.y - 10] as Point];
          for (const ex of targets.slice(0, 2)) {
            let bestX = poly[0][0];
            let bestY = poly[0][1];
            let bestNx = 0;
            let bestNy = -1;
            let bestD = Infinity;
            for (let j = 0; j < poly.length; j++) {
              const a = poly[j];
              const b = poly[(j + 1) % poly.length];
              const edx = b[0] - a[0];
              const edy = b[1] - a[1];
              const elen = Math.hypot(edx, edy) || 1;
              const tProj = Math.max(0.15, Math.min(0.85, ((ex[0] - a[0]) * edx + (ex[1] - a[1]) * edy) / (elen * elen)));
              const px = a[0] + edx * tProj;
              const py = a[1] + edy * tProj;
              const d = Math.hypot(px - ex[0], py - ex[1]);
              if (d < bestD) {
                bestD = d;
                bestX = px;
                bestY = py;
                bestNx = edy / elen;
                bestNy = -edx / elen;
              }
            }
            if (!gates.some((g2) => Math.hypot(g2.x - bestX, g2.y - bestY) < 8)) {
              gates.push({ x: bestX, y: bestY, dx: bestNx, dy: bestNy, width: gateWidth });
            }
          }
        }
      } else {
        const size = sizeOf(houses[h0]);
        const axis = axisOf.get(si) ?? hash2(1, 7, s.seed) * TAU;
        const ca = Math.cos(axis);
        const sa = Math.sin(axis);
        const toW = (lx: number, ly: number): [number, number] => [s.x + ca * lx + sa * ly, s.y - sa * lx + ca * ly];

        // Measure actual house envelope in the settlement's street axis frame so the wall hugs blocks tightly.
        const pad = Math.max(size.w, size.l) * 0.5 + (f.home ? Math.min(4.5, f.home.lot * 0.22) : 2.8) + 2.5;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let maxR = 0;
        for (let hi = h0; hi < h1; hi++) {
          const dx = houses[hi].x - s.x;
          const dy = houses[hi].y - s.y;
          const lx = ca * dx - sa * dy;
          const ly = sa * dx + ca * dy;
          if (lx < minX) minX = lx;
          if (lx > maxX) maxX = lx;
          if (ly < minY) minY = ly;
          if (ly > maxY) maxY = ly;
          maxR = Math.max(maxR, Math.hypot(dx, dy));
        }

        const gateCount = word === 'wall' && s.houses >= 20 ? 4 : Math.max(2, Math.min(4, Math.round(E.gates)));
        if (t.settlement.layout === 'ring') {
          const R = maxR + pad;
          const segs = 20;
          for (let i = 0; i < segs; i++) {
            const a = (TAU * i) / segs;
            ring.push(toW(Math.cos(a) * R, Math.sin(a) * R));
          }
          for (let i = 0; i < gateCount; i++) {
            const a = (TAU * i) / gateCount;
            const [gx, gy] = toW(Math.cos(a) * R, Math.sin(a) * R);
            gates.push({ x: gx, y: gy, dx: ca * Math.cos(a) + sa * Math.sin(a), dy: -sa * Math.cos(a) + ca * Math.sin(a), width: 4.4 });
          }
        } else {
          // Chamfered rectangular fortified compound circuit hugging the village street blocks.
          const x0 = minX - pad;
          const x1 = maxX + pad;
          const y0 = minY - pad;
          const y1 = maxY + pad;
          const ch = Math.min(10, Math.min(x1 - x0, y1 - y0) * 0.14);
          const corners: [number, number][] = [
            [x0 + ch, y0],
            [x1 - ch, y0],
            [x1, y0 + ch],
            [x1, y1 - ch],
            [x1 - ch, y1],
            [x0 + ch, y1],
            [x0, y1 - ch],
            [x0, y0 + ch],
          ];
          for (const [lx, ly] of corners) ring.push(toW(lx, ly));
          const mx = (x0 + x1) * 0.5;
          const my = (y0 + y1) * 0.5;
          // Main road gates centered on the settlement's cardinal street exits (South/North first, then East/West).
          const candGates: [number, number, number, number][] = [
            [mx, y0, 0, -1],
            [mx, y1, 0, 1],
            [x1, my, 1, 0],
            [x0, my, -1, 0],
          ];
          for (const [lx, ly, nx, ny] of candGates.slice(0, gateCount)) {
            const [gx, gy] = toW(lx, ly);
            gates.push({ x: gx, y: gy, dx: ca * nx + sa * ny, dy: -sa * nx + ca * ny, width: gateWidth });
          }
        }
      }

      const wallKind: PerimeterSpec['kind'] =
        word === 'wall'
          ? f.spec.walls === 'stone'
            ? 'stone'
            : f.spec.walls === 'fired-brick'
              ? 'brick'
              : f.spec.walls === 'mudbrick'
                ? 'mudbrick'
                : 'rammed-earth'
          : word;
      const stuff = f.spec.walls === 'stone' ? MAT.rubble : f.spec.walls === 'fired-brick' ? MAT.brick : f.spec.walls === 'mudbrick' ? MAT.adobe : MAT.mud;
      const height = word === 'wall' ? 3.8 : ENCLOSURE_SIZE[word].height;
      const thickness = word === 'wall' ? 2.4 : ENCLOSURE_SIZE[word].thickness;
      const roofMat = f.spec.roof_material === 'tile' ? MAT.claytile : MAT.thatch;

      perimeters.push({
        settlement: si,
        ring,
        gates,
        kind: wallKind,
        height,
        thickness,
        ...(word === 'wall' ? { stuff } : {}),
        roofMat,
        towers: word === 'wall',
        seed: s.seed ^ 0x41a7,
        label: ENCLOSURE_LABEL[word],
        from,
        gateFrom: from,
      });
      gatesOf.set(si, gates);
      // For non-farmLanes villages, extend main internal street cleanly out to each gate.
      if (!farm) {
        for (const gt of gates) {
          streets.push({
            line: [s.x, s.y, gt.x + gt.dx * 3, gt.y + gt.dy * 3],
            width: word === 'wall' ? 4.6 : 3.6,
            paved: word === 'wall',
            settlement: si,
          });
        }
      }
      laid++;
    }
  }
  // The animals its people kept, where a husbandry tradition of the region and time names them for their way of life:
  // those that graze in herds, on the pasture of people who herd and at the edge of the houses of people who farm; the
  // rest about the houses. Which animals is the tradition's; how many, and where each stands, is invented.
  const animals: Kept[] = [];
  /** which herd each animal is of, in step with them; −1 for one kept about the houses, which is its own */
  const herdOf: number[] = [];
  let herdNow = -1;
  let herds = 0;
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
        herdOf.push(herdNow);
        return true;
      };
      mine.forEach((k, j) => {
        // Each kind alike, the odd ones going to the first.
        let left = Math.floor(total / mine.length) + (j < total % mine.length ? 1 : 0);
        const long = keptList[k].length ?? 1;
        const poses = posesOf[k];
        if (!grazes[k]) {
          // About the houses: before one of them, a few steps out from its walls. Each is its own.
          herdNow = -1;
          for (; left > 0 && h1 > h0; left--) {
            const [x, y] = before(houses[h0 + rng.int(0, h1 - h0 - 1)], 1.5 + 4 * rng.next(), rng.next() - 0.5, 4);
            const still = poses.filter((x) => x !== POSE.graze);
            stand(x, y, k, (still.length ? still : poses)[rng.int(0, (still.length || poses.length) - 1)], 0.75 + 0.25 * rng.next(), rng.next() * TAU);
          }
          return;
        }
        for (let herd = 0; left > 0 && herd < 64; herd++) {
          herdNow = herds++;
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
  /** which piece of the works a person is, and the house each stands before */
  let person = -1;
  const homeOf = new Map<number, number>();
  if (F) {
    const who = workOf({ kind: 'person', height: F.height, thickness: 0.5 }, 'A person', 'generic');
    person = who;
    let stood = 0;
    settlements.forEach((s, si) => {
      const [h0, h1] = housesOf[si] ?? [0, 0];
      if (h1 <= h0 || stood >= F.most) return;
      const rng = new Rng((s.seed ^ 0x2c9277b5) >>> 0);
      const n = Math.min(F.most_in_settlement, F.most - stood, Math.floor((h1 - h0) * F.per_house + rng.next()));
      for (let q = 0; q < n; q++) {
        // Before the door of one of its houses, a step or two out: never within its walls.
        const home = h0 + rng.int(0, h1 - h0 - 1);
        const [x, y] = before(houses[home], 0.8 + 1.7 * rng.next(), rng.next() - 0.5, 0);
        if (!fit(x, y)) continue;
        homeOf.set(works.length, home);
        works.push({ x, y, z: ground.at(x, y), face: rng.next() * TAU, form: who, settlement: si });
        stood++;
      }
    });
  }
  const B = p.boats;
  if (B) {
    const boat = workOf({ kind: 'boat', height: B.side, thickness: B.length, opening: B.beam }, 'A boat', 'generic');
    const jetty = workOf({ kind: 'jetty', height: 1.2, thickness: 7.0, opening: 2.5 }, 'A river landing jetty', 'generic');
    settlements.forEach((s, si) => {
      if (!s.houses) return;
      const rng = new Rng((s.seed ^ 0x51a3c6d1) >>> 0);
      let afloat = 0;
      let builtJetty = false;
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
        // Place one timber landing jetty along the bank pointing toward the first moored boat.
        if (!builtJetty && Math.hypot(s.x, s.y) < 1600) {
          for (let step = 0.25; step <= 0.95; step += 0.05) {
            const jx = s.x + (x - s.x) * step;
            const jy = s.y + (y - s.y) * step;
            const dH = ground.at(jx, jy) - water(jx, jy);
            if (dH <= 0.55 && dH >= -0.35 && inScene(jx, jy)) {
              works.push({ x: jx, y: jy, z: water(jx, jy) + 0.05, face: Math.atan2(x - s.x, y - s.y), form: jetty, settlement: si });
              builtJetty = true;
              break;
            }
          }
        }
      }
    });
  }

  // Paths between the settlements of people who stayed in one place: connected directly into farming through-lane
  // exits or walled town gates so country roads link seamlessly into every settlement's street network.
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
    const entryOf = (si: number, tx: number, ty: number): [number, number, number, number] | undefined => {
      const s = settlements[si];
      const d = Math.hypot(tx - s.x, ty - s.y) || 1;
      const vx = (tx - s.x) / d;
      const vy = (ty - s.y) / d;
      const farm = farms.get(s);
      if (farm) {
        if (!farm.exits.length) return undefined;
        let nearest = farm.exits[0];
        let best = Infinity;
        for (const pt of farm.exits) {
          const dist = Math.hypot(pt[0] - tx, pt[1] - ty);
          if (dist < best) {
            best = dist;
            nearest = pt;
          }
        }
        // Outward tangent of the through-lane leaving this exit (or radial fallback).
        let dx = nearest[0] - s.x;
        let dy = nearest[1] - s.y;
        const road = farm.lanes.find((l) => l.width === p.lanes!.main);
        if (road && road.line.length >= 4) {
          const n = road.line.length;
          if (Math.hypot(road.line[0] - nearest[0], road.line[1] - nearest[1]) < 1e-3) {
            dx = road.line[0] - road.line[2];
            dy = road.line[1] - road.line[3];
          } else if (Math.hypot(road.line[n - 2] - nearest[0], road.line[n - 1] - nearest[1]) < 1e-3) {
            dx = road.line[n - 2] - road.line[n - 4];
            dy = road.line[n - 1] - road.line[n - 3];
          }
        }
        const dl = Math.hypot(dx, dy) || 1;
        return [nearest[0], nearest[1], dx / dl, dy / dl];
      }
      const gs = gatesOf.get(si);
      if (gs?.length) {
        let best = gs[0];
        let bestScore = -Infinity;
        for (const gt of gs) {
          const align = gt.dx * vx + gt.dy * vy;
          const distPen = Math.hypot(tx - gt.x, ty - gt.y) / (d + 1);
          const sc = align - distPen * 0.35;
          if (sc > bestScore) {
            bestScore = sc;
            best = gt;
          }
        }
        return [best.x + best.dx * 1.5, best.y + best.dy * 1.5, best.dx, best.dy];
      }
      const from = Math.min(s.r * 0.85, d * 0.35);
      return [s.x + vx * from, s.y + vy * from, vx, vy];
    };
    // From the middle of the scene outward, where a visitor arrives, until the most the scene draws is laid.
    const order = joined.map((_, j) => j).sort((a, b) => Math.hypot(joined[a].s.x, joined[a].s.y) - Math.hypot(joined[b].s.x, joined[b].s.y));
    for (const j of order) {
      if (total > W.most_km * 1000) break;
      const a = joined[j].s;
      const ai = joined[j].i;
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
      for (const { j: o } of near.slice(0, W.each)) {
        if (total >= W.most_km * 1000) break;
        const key = j < o ? `${j}-${o}` : `${o}-${j}`;
        if (done.has(key)) continue;
        done.add(key);
        const b = joined[o].s;
        const bi = joined[o].i;
        const eA = entryOf(ai, b.x, b.y);
        const eB = entryOf(bi, a.x, a.y);
        if (!eA || !eB) continue;
        const [ax, ay, adx, ady] = eA;
        const [bx, by, bdx, bdy] = eB;
        const length = Math.hypot(bx - ax, by - ay);
        if (length < 20) continue;
        const ux = (bx - ax) / length;
        const uy = (by - ay) / length;
        const seed = (a.seed ^ Math.imul(b.seed, 0x9e3779b1)) >>> 0;
        const bow = (hash2(1, 41, seed) - 0.5) * 2 * W.wander * length;
        const steps = Math.max(2, Math.ceil(length / 20));
        const alignA = Math.max(0, adx * ux + ady * uy);
        const alignB = Math.max(0, -(bdx * ux + bdy * uy));
        const leadA = Math.min(length * 0.2, 26) * (0.25 + 0.75 * alignA);
        const leadB = Math.min(length * 0.2, 26) * (0.25 + 0.75 * alignB);
        const tx0 = (adx * alignA + ux * (1 - alignA)) * leadA;
        const ty0 = (ady * alignA + uy * (1 - alignA)) * leadA;
        const tx1 = (-bdx * alignB + ux * (1 - alignB)) * leadB;
        const ty1 = (-bdy * alignB + uy * (1 - alignB)) * leadB;
        const line: number[] = [];
        for (let q = 0; q <= steps; q++) {
          const f = q / steps;
          const along = length * f;
          const h00 = 2 * f * f * f - 3 * f * f + 1;
          const h10 = f * f * f - 2 * f * f + f;
          const h01 = -2 * f * f * f + 3 * f * f;
          const h11 = f * f * f - f * f;
          const env = Math.sin(PI * f);
          const side = env * env * (bow + (fbm(along / 180, 3.7, seed | 0) - 0.5) * 2 * W.wander * Math.min(length, 600));
          line.push(
            h00 * ax + h10 * tx0 + h01 * bx + h11 * tx1 - uy * side,
            h00 * ay + h10 * ty0 + h01 * by + h11 * ty1 + ux * side,
          );
        }
        paths.push(line);
        total += length;
      }
    }
  }

  // What its people, carts and animals do once they are drawn (life/routines.ts): spatial house obstacle grid + living
  // agricultural, economic and cultural activity (market stalls, altars, kilns, stooks, ploughs, carts, field workers, smoke).
  const ways: number[] = [];
  const walk = F?.walk;
  const GRID = 24;
  const cellOfGrid = (x: number, y: number) => (Math.floor(x / GRID) + 32768) * 65536 + Math.floor(y / GRID) + 32768;
  const nearby = new Map<number, number[]>();
  const yardOf = (h: House): { across: number; front: number; back: number } | undefined => {
    const f = forms[h.form];
    if (!f.home?.yard || f.spec.plan === 'courtyard' || f.spec.court) return undefined;
    const sz = sizeOf(h);
    const most = f.home.lot / 2 - 0.3;
    return { across: Math.min(most, sz.w / 2 + 5.5), front: Math.min(most, sz.l / 2 + 3.2), back: most };
  };
  houses.forEach((h, hi) => {
    const sz = sizeOf(h);
    const yard = yardOf(h);
    const r = Math.max(Math.sqrt(sz.w * sz.w + sz.l * sz.l) / 2, yard ? Math.sqrt(yard.across * yard.across + yard.back * yard.back) + 2.5 : 0) + 2;
    for (let j = Math.floor((h.y - r) / GRID); j <= Math.floor((h.y + r) / GRID); j++) {
      for (let i = Math.floor((h.x - r) / GRID); i <= Math.floor((h.x + r) / GRID); i++) {
        const k = (i + 32768) * 65536 + j + 32768;
        (nearby.get(k) ?? nearby.set(k, []).get(k)!).push(hi);
      }
    }
  });
  const clearOfHouses = (x: number, y: number, own: number, pad = 0.6): boolean => {
    for (const hi of nearby.get(cellOfGrid(x, y)) ?? []) {
      const h = houses[hi];
      const sz = sizeOf(h);
      const sf = Math.sin(h.face);
      const cf = Math.cos(h.face);
      const along = (x - h.x) * sf + (y - h.y) * cf;
      const across = Math.abs((x - h.x) * cf - (y - h.y) * sf);
      if (Math.abs(along) < sz.l / 2 + pad && across < sz.w / 2 + pad) return false;
      const yard = yardOf(h);
      if (!yard) continue;
      if (hi !== own) {
        if (across < yard.across + 0.4 && along < yard.front + 0.4 && along > -yard.back - 0.4) return false;
      } else {
        const beside = across >= yard.across - 0.4 && across < yard.across + 2.5 && along < yard.front && along > -yard.back - 2.5;
        const behind = along <= -yard.back + 0.4 && along > -yard.back - 2.5 && across < yard.across + 2.5;
        if (beside || behind) return false;
      }
    }
    return true;
  };
  const reaches = settlements.map((_, si) => reachOf(si));
  const insideOf = (si: number, x: number, y: number, r: number) => (x - settlements[si].x) * (x - settlements[si].x) + (y - settlements[si].y) * (y - settlements[si].y) < r * r;
  const groundAt = (x: number, y: number) => ground.at(x, y);

  // Build a simple straight-leg shuttle route between (x0, y0) and (x1, y1) along a road or street for carts/barrows.
  const lineRoute = (x0: number, y0: number, x1: number, y1: number, speed: number, stay: number, phase: number): number[] => {
    const z0 = ground.at(x0, y0);
    const z1 = ground.at(x1, y1);
    const xm = (x0 + x1) * 0.5;
    const ym = (y0 + y1) * 0.5;
    const zm = ground.at(xm, ym);
    return [xm - x0, ym - y0, zm - z0, stay * phase, x1 - x0, y1 - y0, z1 - z0, stay, speed, stay * (1 - phase), 2.2, WAY.walk + phase * 0.99];
  };

  // Living agricultural, economic, and cultural activity around settlements near the viewer (<= 1600 m from focus).
  // Kept strictly procedural & labelled generic so historical provenance remains crystal clear.
  const activeSettlements = settlements
    .map((s, si) => ({ s, si, d: Math.hypot(s.x, s.y) }))
    .filter(({ s, d }) => d < 1600 && s.houses > 0 && s.pattern !== 'foragers' && s.pattern !== 'herders')
    .sort((a, b) => a.d - b.d)
    .slice(0, 12);

  if (activeSettlements.length) {
    const stallForm = workOf({ kind: 'stall', height: 2.55, thickness: 3.4, opening: 2.2 }, 'A market stall', 'generic');
    const altarForm = workOf({ kind: 'altar', height: 1.75, thickness: 5.0 }, 'A civic altar platform', 'generic');
    const kilnForm = workOf({ kind: 'kiln', height: 2.6, thickness: 3.2 }, 'A pottery or charcoal kiln', 'generic');
    const stookForm = workOf({ kind: 'stook', height: 1.5, thickness: 1.45 }, 'Harvested grain stooks', 'generic');
    const ploughForm = workOf({ kind: 'plough', height: 1.1, thickness: 2.4 }, 'A wooden plough and yoke', 'generic');
    const cartForm = workOf({ kind: 'cart', height: 1.65, thickness: 2.2, opening: 1.25 }, 'A two-wheeled farm cart', 'generic');
    const barrowForm = workOf({ kind: 'barrow', height: 1.1, thickness: 1.4 }, 'A wooden wheelbarrow', 'generic');
    const floorForm = workOf({ kind: 'floor', height: 0, thickness: 8.5 }, 'A village threshing floor', 'generic');
    const stackForm = workOf({ kind: 'stack', height: 2.8, thickness: 2.8 }, 'A straw rick', 'generic');

    for (const { s, si } of activeSettlements) {
      const [h0, h1] = housesOf[si] ?? [0, 0];
      const rng = new Rng((s.seed ^ 0x91e10da5) >>> 0);
      const axis = axisOf.get(si) ?? 0;
      const ca = Math.cos(axis);
      const sa = Math.sin(axis);
      const toW = (lx: number, ly: number): [number, number] => [s.x + ca * lx + sa * ly, s.y - sa * lx + ca * ly];
      const farm = farms.get(s);
      const laneAvoid = farm ? new LaneGround(farm.lanes) : undefined;

      // 1. Hearth smoke plumes from ~28% of roofs (capped to 64 total across the scene).
      for (let hi = h0; hi < h1 && smokes.length < 64; hi++) {
        const h = houses[hi];
        if (hash2(hi, 91, s.seed) > 0.28) continue;
        const sz = sizeOf(h);
        smokes.push({ x: h.x, y: h.y, z: h.z + sz.top + 0.15, strength: 0.45 + 0.35 * hash2(hi, 92, s.seed), seed: (s.seed ^ (hi * 2654435761)) >>> 0, settlement: si });
      }

      // 2. Market plaza & civic/sacred hub (villages >= 8 houses, towns, cities).
      if (s.houses >= 8) {
        const stallCount = Math.min(12, Math.max(4, Math.floor(s.houses / 7)));
        if (farm && laneAvoid) {
          // Along a farming lane layout, flank the main through-lane cleanly without blocking any lane or house.
          const road = farm.lanes.find((l) => l.width === p.lanes!.main);
          const placed: { x: number; y: number; r: number }[] = [];
          const spotFree = (x: number, y: number, r: number): boolean =>
            fit(x, y) &&
            clearOfHouses(x, y, -1, r * 0.75) &&
            !laneAvoid.near(x, y, r * 0.6) &&
            placed.every((o) => Math.hypot(o.x - x, o.y - y) >= o.r + r);
          let altarPlaced = false;
          let stallsPlaced = 0;
          if (road && road.line.length >= 4) {
            const halfW = road.width * 0.5;
            // Sample spots flanking the interior segments of the through-lane, sorted closest to village centre first.
            const cands: { x: number; y: number; face: number; d: number }[] = [];
            for (let q = 0; q + 3 < road.line.length; q += 2) {
              const ax = road.line[q];
              const ay = road.line[q + 1];
              const bx = road.line[q + 2];
              const by = road.line[q + 3];
              const segLen = Math.hypot(bx - ax, by - ay);
              if (segLen < 3) continue;
              const ux = (bx - ax) / segLen;
              const uy = (by - ay) / segLen;
              const nx = -uy;
              const ny = ux;
              const samples = Math.max(1, Math.floor(segLen / 5.5));
              for (let k = 0; k < samples; k++) {
                const f = (k + 0.5) / samples;
                const mx = ax + (bx - ax) * f;
                const my = ay + (by - ay) * f;
                const dC = Math.hypot(mx - s.x, my - s.y);
                if (dC > s.r * 0.78) continue;
                for (const side of [-1, 1]) {
                  const off = halfW + 2.6;
                  const sx = mx + nx * side * off;
                  const sy = my + ny * side * off;
                  const face = Math.atan2(-nx * side, -ny * side);
                  cands.push({ x: sx, y: sy, face, d: dC });
                }
              }
            }
            cands.sort((a, b) => a.d - b.d);
            for (const c of cands) {
              if (!altarPlaced && spotFree(c.x, c.y, 2.4)) {
                works.push({ x: c.x, y: c.y, z: ground.at(c.x, c.y), face: c.face, form: altarForm, settlement: si });
                placed.push({ x: c.x, y: c.y, r: 3.0 });
                altarPlaced = true;
                continue;
              }
              if (stallsPlaced < stallCount && spotFree(c.x, c.y, 1.9)) {
                works.push({ x: c.x, y: c.y, z: ground.at(c.x, c.y), face: c.face, form: stallForm, settlement: si, variant: (stallsPlaced + si) % WORK_VARIANTS });
                placed.push({ x: c.x, y: c.y, r: 2.3 });
                if (person >= 0 && rng.next() < 0.75) {
                  const px = c.x + Math.sin(c.face) * 2.0;
                  const py = c.y + Math.cos(c.face) * 2.0;
                  if (fit(px, py) && clearOfHouses(px, py, -1, 0.5)) {
                    works.push({ x: px, y: py, z: ground.at(px, py), face: c.face + PI + (rng.next() - 0.5) * 0.7, form: person, settlement: si, variant: rng.next() < 0.5 ? 11 : 7, field: true });
                  }
                }
                stallsPlaced++;
              }
              if (altarPlaced && stallsPlaced >= stallCount) break;
            }
          }
          // Fallback search around village centre if a tight lane pocket had no room for the altar.
          if (!altarPlaced) {
            for (let tr = 0; tr < 24; tr++) {
              const a = axis + tr * 2.399963;
              const r = 6 + tr * 1.6;
              const ax = s.x + Math.sin(a) * r;
              const ay = s.y + Math.cos(a) * r;
              if (spotFree(ax, ay, 2.4)) {
                works.push({ x: ax, y: ay, z: ground.at(ax, ay), face: a + PI, form: altarForm, settlement: si });
                placed.push({ x: ax, y: ay, r: 3.0 });
                altarPlaced = true;
                break;
              }
            }
          }
        } else {
          // Place civic altar near the central square if clear of houses.
          if (fit(s.x, s.y) && clearOfHouses(s.x, s.y, -1, 2.2)) {
            works.push({ x: s.x, y: s.y, z: ground.at(s.x, s.y), face: axis, form: altarForm, settlement: si });
          }
          // Line the central square / main avenue with colorful market stalls.
          for (let k = 0; k < stallCount; k++) {
            const side = k % 2 === 0 ? -1 : 1;
            const row = Math.floor(k / 2);
            const lx = side * (4.6 + (row % 2) * 0.7);
            const ly = (row - (stallCount / 4 - 0.5)) * 4.6;
            const [sx, sy] = toW(lx, ly);
            if (!fit(sx, sy) || !clearOfHouses(sx, sy, -1, 1.4)) continue;
            const face = axis + (side > 0 ? -PI / 2 : PI / 2);
            works.push({ x: sx, y: sy, z: ground.at(sx, sy), face, form: stallForm, settlement: si, variant: (k + si) % WORK_VARIANTS });
            // Shopper / vendor conversing before the stall.
            if (person >= 0 && rng.next() < 0.75) {
              const px = sx + Math.sin(face) * 2.1;
              const py = sy + Math.cos(face) * 2.1;
              if (fit(px, py) && clearOfHouses(px, py, -1, 0.5)) {
                works.push({ x: px, y: py, z: ground.at(px, py), face: face + PI + (rng.next() - 0.5) * 0.7, form: person, settlement: si, variant: rng.next() < 0.5 ? 11 : 7, field: true });
              }
            }
          }
        }
      }

      // 3. Craft edge: pottery/charcoal kiln(s) with vigorous smoke + communal threshing floor & straw rick.
      if (s.houses >= 10) {
        const edgeR = reaches[si] + 14;
        for (let tr = 0; tr < 6; tr++) {
          const kAng = axis + PI * 0.35 + (rng.next() - 0.5) * 0.6 + tr * 0.55;
          const kx = s.x + Math.sin(kAng) * edgeR;
          const ky = s.y + Math.cos(kAng) * edgeR;
          if (!fit(kx, ky) || !clearOfHouses(kx, ky, -1, 2.2) || laneAvoid?.near(kx, ky, 2.8)) continue;
          works.push({ x: kx, y: ky, z: ground.at(kx, ky), face: kAng + PI, form: kilnForm, settlement: si, variant: si % WORK_VARIANTS });
          if (smokes.length < 72) smokes.push({ x: kx, y: ky, z: ground.at(kx, ky) + 3.0, strength: 1.15, seed: (s.seed ^ 0x4b11) >>> 0, settlement: si });
          break;
        }
        // Edge threshing floor & straw rick for farming settlements.
        if (s.fields !== 'none' && s.fields !== 'pasture') {
          for (let tr = 0; tr < 6; tr++) {
            const fAng = axis - PI * 0.65 + tr * 0.55;
            const fx = s.x + Math.sin(fAng) * (edgeR + 4);
            const fy = s.y + Math.cos(fAng) * (edgeR + 4);
            if (!fit(fx, fy) || !clearOfHouses(fx, fy, -1, 4) || laneAvoid?.near(fx, fy, 4.5)) continue;
            works.push({ x: fx, y: fy, z: ground.at(fx, fy), face: fAng, form: floorForm, settlement: si });
            const rx = fx + Math.cos(fAng) * 6.5;
            const ry = fy - Math.sin(fAng) * 6.5;
            if (fit(rx, ry) && !laneAvoid?.near(rx, ry, 2.0)) works.push({ x: rx, y: ry, z: ground.at(rx, ry), face: 0, form: stackForm, settlement: si });
            break;
          }
        }
      }

      // 4. Moving carts & wheelbarrows along settlement main streets and farming lanes!
      const myRoutes: number[][] = streets.filter((st) => st.settlement === si && st.line.length >= 4).map((st) => st.line);
      if (farm) {
        const minW = p.lanes?.side ?? 2.8;
        for (const lane of farm.lanes) {
          if (lane.width >= minW && lane.line.length >= 4) myRoutes.push(lane.line);
        }
      }
      let cartsAdded = 0;
      for (let rIdx = 0; rIdx < myRoutes.length && cartsAdded < 3; rIdx++) {
        const ln = myRoutes[rIdx];
        // Pick the longest straight segment of the polyline so the cart rides strictly on the lane.
        let bestQ = -1;
        let bestLen = 18;
        for (let q = 0; q + 3 < ln.length; q += 2) {
          const segLen = Math.hypot(ln[q + 2] - ln[q], ln[q + 3] - ln[q + 1]);
          if (segLen > bestLen) {
            bestLen = segLen;
            bestQ = q;
          }
        }
        if (bestQ < 0) continue;
        const x0 = ln[bestQ];
        const y0 = ln[bestQ + 1];
        const x1 = ln[bestQ + 2];
        const y1 = ln[bestQ + 3];
        const ux = (x1 - x0) / bestLen;
        const uy = (y1 - y0) / bestLen;
        const inset = Math.min(6, bestLen * 0.18);
        const sx = x0 + ux * inset;
        const sy = y0 + uy * inset;
        const ex = x1 - ux * inset;
        const ey = y1 - uy * inset;
        if (!fit(sx, sy) || !fit(ex, ey)) continue;
        const isCart = cartsAdded % 2 === 0;
        const wIdx = ways.length;
        ways.push(...lineRoute(sx, sy, ex, ey, isCart ? 1.15 : 0.85, 4 + rng.next() * 5, rng.next()));
        works.push({ x: sx, y: sy, z: ground.at(sx, sy), face: Math.atan2(ux, uy), form: isCart ? cartForm : barrowForm, settlement: si, variant: (si + cartsAdded) % WORK_VARIANTS, way: wIdx });
        cartsAdded++;
      }

      // 5. Seasonal field activity in surrounding parcels (stooks on stubble/ripe, ploughs on ploughed, hoeing/reaping farmers).
      if (s.fields !== 'none' && s.fields !== 'pasture') {
        const innerR = Math.max(reaches[si] + 18, s.r + 14);
        const outerR = Math.min(Math.max(innerR + 60, s.fieldR * 0.78), innerR + 180);
        let stookClusters = 0;
        let ploughsAdded = 0;
        let fieldHands = 0;
        for (let q = 0; q < 48 && (stookClusters < 6 || ploughsAdded < 2 || fieldHands < 6); q++) {
          const a = rng.next() * TAU;
          const rr = Math.sqrt(innerR * innerR + (outerR * outerR - innerR * innerR) * rng.next());
          const x = s.x + Math.sin(a) * rr;
          const y = s.y + Math.cos(a) * rr;
          if (!fit(x, y) || !clearOfHouses(x, y, -1, 4) || laneAvoid?.near(x, y, 2.5)) continue;
          // Work goes on well inside the settlement's own fields, where they are drawn whole, and not at their ragged edge.
          if (!inOwnFields(x, y, si)) continue;
          const at = plotAt(x, y, pStyle);
          if (at.edge < 3.5) continue;
          const slot = palette.slots[plotSlotIndex(at.pick, palette)];
          const rowFace = Math.atan2(at.rowDx, at.rowDy);

          if ((slot.state === PLOT.stubble || slot.state === PLOT.ripe) && stookClusters < 6) {
            // Cluster 3–4 grain stooks neatly along the harvested parcel row!
            const nStooks = 3 + rng.int(0, 1);
            for (let k = 0; k < nStooks; k++) {
              const sx = x + at.rowDx * (k - 1) * 3.6 + (rng.next() - 0.5) * 0.6;
              const sy = y + at.rowDy * (k - 1) * 3.6 + (rng.next() - 0.5) * 0.6;
              if (fit(sx, sy)) works.push({ x: sx, y: sy, z: ground.at(sx, sy), face: rng.next() * TAU, form: stookForm, settlement: si, variant: (q + k) % WORK_VARIANTS });
            }
            // Reaping villager beside the harvest stooks (variant 9 = reaping).
            if (person >= 0 && fieldHands < 6) {
              const wx = x - at.rowDy * 2.4;
              const wy = y + at.rowDx * 2.4;
              if (fit(wx, wy)) {
                works.push({ x: wx, y: wy, z: ground.at(wx, wy), face: rowFace, form: person, settlement: si, variant: 9, field: true });
                fieldHands++;
              }
            }
            // Occasional parked harvest cart beside the first stook cluster.
            if (stookClusters === 0) {
              const cx = x + at.rowDy * 3.8;
              const cy = y - at.rowDx * 3.8;
              if (fit(cx, cy)) works.push({ x: cx, y: cy, z: ground.at(cx, cy), face: rowFace, form: cartForm, settlement: si, variant: 1 });
            }
            stookClusters++;
          } else if (slot.state === PLOT.ploughed && ploughsAdded < 2) {
            works.push({ x, y, z: ground.at(x, y), face: rowFace, form: ploughForm, settlement: si });
            if (person >= 0) {
              const wx = x - at.rowDx * 1.1;
              const wy = y - at.rowDy * 1.1;
              if (fit(wx, wy)) {
                works.push({ x: wx, y: wy, z: ground.at(wx, wy), face: rowFace, form: person, settlement: si, variant: 8, field: true });
                fieldHands++;
              }
            }
            ploughsAdded++;
          } else if ((slot.state === PLOT.green || slot.state === PLOT.sprouting) && person >= 0 && fieldHands < 6 && rng.next() < 0.4) {
            works.push({ x, y, z: ground.at(x, y), face: rowFace + (rng.next() - 0.5) * 0.6, form: person, settlement: si, variant: 8, field: true });
            fieldHands++;
          }
        }
      }
    }
  }

  // Carts travelling on nearby inter-settlement roads too (gives life outside village gates!).
  if (paths.length) {
    const roadCart = workOf({ kind: 'cart', height: 1.65, thickness: 2.2, opening: 1.25 }, 'A travelling cart', 'generic');
    let roadCarts = 0;
    for (let pi = 0; pi < paths.length && roadCarts < 6; pi++) {
      const ln = paths[pi];
      if (ln.length < 6) continue;
      const midI = Math.floor(ln.length / 4) * 2;
      const mx = ln[midI];
      const my = ln[midI + 1];
      if (Math.hypot(mx, my) > 1200) continue;
      const nx = ln[Math.min(ln.length - 2, midI + 2)];
      const ny = ln[Math.min(ln.length - 1, midI + 3)];
      const len = Math.hypot(nx - mx, ny - my);
      if (len < 12 || !fit(mx, my) || !fit(nx, ny)) continue;
      const wIdx = ways.length;
      ways.push(...lineRoute(mx, my, nx, ny, 1.25, 2, (pi * 0.27) % 1));
      works.push({ x: mx, y: my, z: ground.at(mx, my), face: Math.atan2(nx - mx, ny - my), form: roadCart, settlement: 0, variant: pi % WORK_VARIANTS, way: wIdx });
      roadCarts++;
    }
  }

  if ((beasts && animals.length) || (walk && person >= 0)) {
    if (beasts) {
      const leads = new Map<number, number[]>();
      animals.forEach((a, ai) => {
        const k = keptList[a.kind];
        const form = P.keptForms?.[k.form];
        const routine = routineOf(form?.behave);
        // One that lies resting stays where it lies; and what flies or swims is no one's herd.
        if (routine === 'none' || routine === 'circle' || a.pose === POSE.rest) return;
        const s = settlements[a.settlement];
        const L = (k.length ?? 1) * a.size;
        const H = (k.hip ?? (k.length ?? 1) * (form?.hip ?? 0.3)) * a.size;
        // A herd grazes out from the houses, and stays out; what is kept about the houses stays among them.
        const herd = !insideOf(a.settlement, a.x, a.y, reaches[a.settlement] + 6);
        const free = (x: number, y: number) => fit(x, y) && clearOfHouses(x, y, -1) && (herd ? !insideOf(a.settlement, x, y, reaches[a.settlement] + 4) : insideOf(a.settlement, x, y, reaches[a.settlement] + 8));
        const body = { x: a.x, y: a.y, z: a.z, fx: Math.sin(a.face), fy: Math.cos(a.face), L, H, going: a.pose === POSE.walk };
        const rng = new Rng((s.seed ^ Math.imul(ai + 1, 0x9e3779b1) ^ 0x3a1f) >>> 0);
        // A herd keeps together: the first of it that goes anywhere leads, and the rest go its way beside it.
        const lead = herdOf[ai] >= 0 ? leads.get(herdOf[ai]) : undefined;
        const way = (lead && wayBeside(lead, body, { ground: groundAt, free }, beasts, rng)) ?? wayFor(routine === 'stalk' ? 'wander' : routine, body, { ground: groundAt, free }, beasts, rng);
        if (!way) return;
        if (!lead && herdOf[ai] >= 0) leads.set(herdOf[ai], way);
        a.way = ways.length;
        ways.push(...way);
      });
    }
    if (walk && F && person >= 0) {
      // What each settlement had of its own that people went to (wells, ovens, floors, stalls, altars, streets & lanes).
      const draws = new Map<number, [number, number][]>();
      works.forEach((w) => {
        const kind = workForms[w.form].spec.kind;
        if (kind !== 'well' && kind !== 'oven' && kind !== 'floor' && kind !== 'rack' && kind !== 'stack' && kind !== 'pond' && kind !== 'stall' && kind !== 'altar') return;
        (draws.get(w.settlement) ?? draws.set(w.settlement, []).get(w.settlement)!).push([w.x, w.y]);
      });
      // Add street and farming lane midpoints as natural walking destinations so villagers walk along real lanes!
      streets.forEach((st) => {
        if (st.line.length < 4) return;
        const mx = (st.line[0] + st.line[st.line.length - 2]) * 0.5;
        const my = (st.line[1] + st.line[st.line.length - 1]) * 0.5;
        (draws.get(st.settlement) ?? draws.set(st.settlement, []).get(st.settlement)!).push([mx, my]);
      });
      settlements.forEach((s, si) => {
        const farm = farms.get(s);
        if (!farm) return;
        const minW = p.lanes?.side ?? 2.8;
        for (const lane of farm.lanes) {
          if (lane.width < minW || lane.line.length < 4) continue;
          const midI = Math.floor(lane.line.length / 4) * 2;
          (draws.get(si) ?? draws.set(si, []).get(si)!).push([lane.line[midI], lane.line[midI + 1]]);
        }
      });
      works.forEach((w, wi) => {
        if (w.form !== person || w.field) return;
        const variant = w.variant ?? wi % WORK_VARIANTS;
        const goes = personGoes(variant);
        if (goes === 'stays') return;
        const si = w.settlement;
        const s = settlements[si];
        const own = homeOf.get(wi) ?? -1;
        const rng = new Rng((s.seed ^ Math.imul(wi + 1, 0x9e3779b1) ^ 0x77c1) >>> 0);
        const tall = F.height * (variant === 6 ? 0.68 : 1);
        const hips = tall * PERSON_HIP;
        const pace: Pace = { range: [walk.range[0] / tall, walk.range[1] / tall], stay: walk.stay, pace: 1 };
        const params: RoutineParams = { froude: (walk.speed * walk.speed) / (9.81 * hips), go: [walk.go, 0], sag: [0, walk.sag], tries: walk.tries, feed: pace, wander: pace, patrol: pace, stalk: { ...pace, reach: 0, hold: [0, 0], round: 0 }, circle: { radius: [0, 0], least: 0, fly: 0, swim: 0 } };
        const farm = farms.has(s);
        const free = (x: number, y: number) => fit(x, y) && clearOfHouses(x, y, own) && insideOf(si, x, y, reaches[si] + 6) && (!farm || Math.hypot(x - w.x, y - w.y) <= walk.range[1]);
        const goals: [number, number][] = [];
        const [h0, h1] = housesOf[si] ?? [0, 0];
        for (let q = 0; q < 2 && h1 - h0 > 1; q++) {
          const other = h0 + rng.int(0, h1 - h0 - 1);
          if (other !== own && !forms[houses[other].form].outbuilding) goals.push(before(houses[other], (yardOf(houses[other]) ? 3.8 : 1) + 1.5 * rng.next(), yardOf(houses[other]) ? 0 : rng.next() - 0.5, 0));
        }
        const drawn = draws.get(si);
        if (drawn?.length) {
          const [dx, dy] = drawn[rng.int(0, drawn.length - 1)];
          const d = Math.sqrt((dx - w.x) * (dx - w.x) + (dy - w.y) * (dy - w.y));
          if (d > 3) goals.splice(rng.int(0, goals.length), 0, [dx + ((w.x - dx) / d) * 1.6, dy + ((w.y - dy) / d) * 1.6]);
        }
        const near = goals.filter(([gx, gy]) => (gx - w.x) * (gx - w.x) + (gy - w.y) * (gy - w.y) < walk.range[1] * walk.range[1] * 4);
        const way = wayFor('wander', { x: w.x, y: w.y, z: w.z, fx: Math.sin(w.face), fy: Math.cos(w.face), L: tall, H: hips, going: goes === 'going' }, { ground: groundAt, free, goals: near }, params, rng);
        if (!way) return;
        w.way = ways.length;
        ways.push(...way);
      });
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
  return {
    settlements,
    forms,
    houses: kept,
    works,
    workForms,
    perimeters,
    streets,
    lanes,
    smokes,
    animals,
    ways,
    paths,
    pathWidth: W?.width ?? 0,
    drawn: Math.round(drawn),
    expected: Math.round(expected),
    perHouse: Math.round(perHouse * 10) / 10,
    style,
    agriculture,
    lifeway: P.lifeway,
    fields: fieldGrid,
  };

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
    const farm = s.pattern === 'hamlets' || s.pattern === 'villages' || s.pattern === 'farmsteads';
    if (p.lanes && farm && !st.layout && ['walled', 'nucleated', 'dispersed', 'hamlet'].includes(pattern)) {
      const f = forms[s.form];
      const sizes = Array.from({ length: HOUSE_VARIANTS }, (_, i) => houseSize(f.spec, i));
      const yard = f.home?.yard && !f.spec.court && f.spec.plan !== 'courtyard' ? f.home.lot / 2 - 0.3 : 0;
      const footprints = sizes.map(z => ({ w: Math.max(z.w, Math.min(2 * yard, z.w + 11)), l: Math.max(z.l, 2 * yard), door: z.l / 2 }));
      const dispersed = pattern === 'dispersed';
      const fits = (x: number, y: number) => fit(x, y) && !onAnothers(x, y, s);
      const riseX = ground.at(s.x + 25, s.y) - ground.at(s.x - 25, s.y);
      const riseY = ground.at(s.x, s.y + 25) - ground.at(s.x, s.y - 25);
      const contour = Math.hypot(riseX, riseY) > 1 ? Math.atan2(-riseY, riseX) : undefined;
      const layout = farmLanes([s.x, s.y], n, seed, Math.sqrt(lot), footprints,
        f.spec.faces === undefined ? undefined : COMPASS[f.spec.faces], dispersed, p.lanes, p.enclosures?.gates ?? 2, s.fieldR, plots, fits, contour);
      farms.set(s, { lanes: layout.lanes, boundary: layout.boundary, exits: layout.exits });
      if (layout.exits.length >= 2) {
        axisOf.set(si, Math.atan2(layout.exits[1][0] - layout.exits[0][0], layout.exits[1][1] - layout.exits[0][1]));
      }
      for (const lane of layout.lanes) lanes.push(lane);
      for (const h of layout.lots) {
        const [x, y] = h.at;
        houses.push({ x, y, z: ground.at(x, y), face: h.face, form: s.form, settlement: si, size: 1, variant: h.variant, rank: h.rank });
      }
      s.houses = layout.lots.length;
      s.fieldR = Math.sqrt(Math.max(0, s.fieldR ** 2 - s.r ** 2) + layout.radius ** 2);
      s.r = layout.radius;
      s.loose = dispersed;
      if (!dispersed && layout.lots.length) s.boundary = layout.boundary;
      return;
    }
    const spacing = Math.sqrt(lot);
    const stated = forms[s.form].spec.faces;
    const facing = stated !== undefined ? COMPASS[stated] : undefined;
    // Align street axis cleanly to stated house compass facing (with subtle organic village twist), else seeded bearing.
    const axis = facing !== undefined ? facing + (hash2(1, 7, seed) - 0.5) * 0.22 : hash2(1, 7, seed) * TAU;
    axisOf.set(si, axis);
    const ca = Math.cos(axis);
    const sa = Math.sin(axis);
    const toW = (lx: number, ly: number): [number, number] => [s.x + ca * lx + sa * ly, s.y - sa * lx + ca * ly];

    // A room block is the rectangle it was built as: rows of rooms either side of lanes, on the settlement's axis.
    const block = pattern === 'room-block';
    const layout = block || pattern === 'linear' ? undefined : (st.layout ?? (pattern === 'camp' ? 'ring' : undefined));
    // What the settlement keeps at its middle clears the houses from it.
    const middle = (t?.outbuildings ?? []).some((o) => o.per === 'settlement');
    const clear = st.plaza ? Math.max(spacing * 1.6, 12) : middle && !layout ? Math.max(spacing * 0.9, 9) : 0;

    // Road-first connected village layout for nucleated, walled, and compound settlements with >= 4 houses:
    // replaces loose Poisson-disc scatter with real internal streets, central plaza, and tightly packed street-fronting lots.
    const roadVillage = !layout && !block && pattern !== 'linear' && pattern !== 'dispersed' && pattern !== 'camp' && n >= 4 && lot <= p.towns.open_lot;
    if (roadVillage) {
      const hsz = houseSize(forms[s.form].spec, 0, forms[s.form].grow ?? 1);
      const isCourtyard = forms[s.form].spec.plan === 'courtyard' || !!forms[s.form].spec.court;
      const planned = st.pattern === 'walled' || !!st.enclosure || isCourtyard || n >= 20;
      const lotW = Math.max(hsz.w + 2.4, Math.min(spacing * 0.85, hsz.w + (isCourtyard ? 3.4 : 4.8)));
      const lotD = Math.max(hsz.l + 3.0, Math.min(spacing * 0.95, hsz.l + (isCourtyard ? 3.8 : 5.6)));
      const mainW = Math.max(5.6, hsz.w * 0.45);
      const laneW = Math.max(4.4, hsz.l * 0.35);
      const plazaR = Math.max(clear, n >= 12 ? 9.5 : 6.5);
      const placedLots: { lx: number; ly: number; face: number; sx0: number; sx1: number; sy: number }[] = [];

      if (planned) {
        // Cross-axial street network: main N–S avenue + E–W cross street meeting at central plaza + parallel residential lanes.
        const pitchY = 2 * lotD + laneW;
        const rowsN = Math.max(2, Math.ceil(Math.sqrt(n) * 0.9) + 2);
        const colsN = Math.max(3, Math.ceil(Math.sqrt(n) * 1.2) + 2);
        const cands: { lx: number; ly: number; face: number; d: number; rowY: number; streetY: number }[] = [];
        const warpAmp = st.pattern === 'walled' ? 0.5 : 1.8;

        for (let br = -rowsN; br <= rowsN; br++) {
          const streetY = br === 0 ? 0 : br > 0 ? mainW * 0.5 + (br - 0.5) * pitchY : -mainW * 0.5 + (br + 0.5) * pitchY;
          for (const side of [-1, 1]) {
            // Skip duplicate middle rows around the main cross-street.
            if (br === 0) continue;
            const halfGap = Math.abs(br) === 1 && side === -Math.sign(br) ? mainW * 0.5 : laneW * 0.5;
            const rowY = streetY + side * (halfGap + lotD * 0.5);
            const rowFace = side > 0 ? axis + PI : axis;
            for (let bc = -colsN; bc <= colsN; bc++) {
              if (bc === 0) continue; // keep central main avenue clear
              const signC = bc > 0 ? 1 : -1;
              const idxC = Math.abs(bc) - 1;
              const lxBase = signC * (mainW * 0.5 + (idxC + 0.5) * lotW);
              const wobX = (hash3(bc, br, 11, seed) - 0.5) * warpAmp;
              const wobY = (hash3(bc, br, 13, seed) - 0.5) * warpAmp * 0.6;
              const lx = lxBase + wobX;
              const ly = rowY + wobY;
              if (Math.hypot(lx, ly) < plazaR + Math.max(hsz.w, hsz.l) * 0.35) continue;
              // Organic slightly rounded square outline weighted by seed so no two villages look identical.
              const sq = Math.max(Math.abs(lx), Math.abs(ly)) * 0.72 + Math.hypot(lx, ly) * 0.28;
              const jitter = (hash3(bc, br, 17, seed) - 0.5) * lotW * 1.1;
              cands.push({ lx, ly, face: rowFace + (hash3(bc, br, 19, seed) - 0.5) * 0.08, d: sq + jitter, rowY, streetY: side > 0 ? streetY : streetY });
            }
          }
        }
        cands.sort((a, b) => a.d - b.d);
        const usedStreets = new Map<number, [number, number]>();
        let minY = 0;
        let maxY = 0;
        let minX = 0;
        let maxX = 0;
        for (const c of cands) {
          if (placedLots.length >= n) break;
          // Ensure clean clearance against already-placed lots (especially if warp nudged neighbors).
          const minSep = Math.max(hsz.w, hsz.l) * 0.92 + 1.2;
          if (placedLots.some((o) => Math.abs(o.lx - c.lx) < hsz.w + 1.2 && Math.abs(o.ly - c.ly) < hsz.l + 1.2 && Math.hypot(o.lx - c.lx, o.ly - c.ly) < minSep)) continue;
          const [wx, wy] = toW(c.lx, c.ly);
          const groundOk = s.city ? ground.at(wx, wy) - water(wx, wy) > p.site.city_above_water && slope(wx, wy) < p.site.steep : ok(wx, wy);
          if (!groundOk || onAnothers(wx, wy, s)) continue;
          const h = placedLots.length;
          let face = c.face;
          if (facing !== undefined) face = facing + (hash2(h, 13, seed) - 0.5) * 0.14;
          placedLots.push({ lx: c.lx, ly: c.ly, face, sx0: c.lx, sx1: c.lx, sy: c.streetY });
          if (inScene(wx, wy)) {
            houses.push({ x: wx, y: wy, z: ground.at(wx, wy), face, form: s.form, settlement: si, size: 1, variant: Math.floor(hash2(h, 12, seed) * HOUSE_VARIANTS), rank: Math.floor(hash2(h, 9, seed) * 256) });
            s.houses++;
          }
          minX = Math.min(minX, c.lx - lotW * 0.5);
          maxX = Math.max(maxX, c.lx + lotW * 0.5);
          minY = Math.min(minY, c.ly - lotD * 0.5);
          maxY = Math.max(maxY, c.ly + lotD * 0.5);
          const key = Math.round(c.streetY);
          const ext = usedStreets.get(key);
          if (!ext) usedStreets.set(key, [c.lx, c.lx]);
          else {
            ext[0] = Math.min(ext[0], c.lx);
            ext[1] = Math.max(ext[1], c.lx);
          }
        }
        // Emit the main vertical avenue, main horizontal cross-street, and each residential lane into plan.streets!
        if (placedLots.length) {
          const [ax0, ay0] = toW(0, minY - 4);
          const [ax1, ay1] = toW(0, maxY + 4);
          streets.push({ line: [ax0, ay0, ax1, ay1], width: mainW * 0.82, paved: true, settlement: si });
          const [bx0, by0] = toW(minX - 4, 0);
          const [bx1, by1] = toW(maxX + 4, 0);
          streets.push({ line: [bx0, by0, bx1, by1], width: mainW * 0.75, paved: true, settlement: si });
          for (const [syKey, [x0, x1]] of usedStreets) {
            if (Math.abs(syKey) < 2 || x1 - x0 < lotW) continue;
            const [lx0, ly0] = toW(x0 - lotW * 0.4, syKey);
            const [lx1, ly1] = toW(x1 + lotW * 0.4, syKey);
            streets.push({ line: [lx0, ly0, lx1, ly1], width: laneW * 0.72, paved: false, settlement: si });
          }
        }
      } else {
        // Organic curved-spine village: curving main road + short branching side lanes with houses fronting the lanes.
        const spineLen = Math.max(36, Math.min(180, n * lotW * 0.46));
        const bow = (hash2(3, 19, seed) - 0.5) * spineLen * 0.24;
        const spineAt = (t: number): [number, number, number, number] => {
          const u = (t - 0.5) * spineLen;
          const v = Math.sin(PI * t) * bow + Math.sin(TAU * t + hash2(4, 19, seed) * TAU) * 3.5;
          const dt = 0.01;
          const u2 = (t + dt - 0.5) * spineLen;
          const v2 = Math.sin(PI * (t + dt)) * bow + Math.sin(TAU * (t + dt) + hash2(4, 19, seed) * TAU) * 3.5;
          const dl = Math.hypot(u2 - u, v2 - v) || 1;
          return [u, v, (u2 - u) / dl, (v2 - v) / dl];
        };
        const spineLine: number[] = [];
        for (let q = 0; q <= 8; q++) {
          const [lx, ly] = spineAt(q / 8);
          const [wx, wy] = toW(lx, ly);
          spineLine.push(wx, wy);
        }
        streets.push({ line: spineLine, width: 4.2, paved: false, settlement: si });

        const cands: { lx: number; ly: number; face: number; d: number }[] = [];
        const steps = Math.max(4, Math.ceil(spineLen / lotW));
        for (let k = 0; k <= steps; k++) {
          const t = (k + 0.5) / (steps + 1);
          const [sx, sy, tx, ty] = spineAt(t);
          const nx = -ty;
          const ny = tx;
          for (const side of [-1, 1]) {
            const off = laneW * 0.55 + lotD * 0.5 + (hash2(k, side + 5, seed) - 0.5) * 2.2;
            const lx = sx + nx * side * off;
            const ly = sy + ny * side * off;
            if (Math.hypot(lx, ly) < plazaR) continue;
            const face = Math.atan2(ca * (-nx * side) + sa * (-ny * side), -sa * (-nx * side) + ca * (-ny * side));
            cands.push({ lx, ly, face, d: Math.hypot(lx, ly) + (hash2(k, side + 9, seed) - 0.5) * 6 });
            // Second row back along a short branching side lane for larger hamlets.
            if (n > 8 && k % 2 === 1) {
              const off2 = off + lotD + 1.8;
              cands.push({ lx: sx + nx * side * off2, ly: sy + ny * side * off2, face: face + (side > 0 ? PI / 2 : -PI / 2), d: Math.hypot(sx + nx * side * off2, sy + ny * side * off2) + 8 });
            }
          }
        }
        cands.sort((a, b) => a.d - b.d);
        for (const c of cands) {
          if (placedLots.length >= n) break;
          const minSep = Math.max(hsz.w, hsz.l) + 1.6;
          if (placedLots.some((o) => Math.hypot(o.lx - c.lx, o.ly - c.ly) < minSep)) continue;
          const [wx, wy] = toW(c.lx, c.ly);
          const groundOk = s.city ? ground.at(wx, wy) - water(wx, wy) > p.site.city_above_water && slope(wx, wy) < p.site.steep : ok(wx, wy);
          if (!groundOk || onAnothers(wx, wy, s)) continue;
          const h = placedLots.length;
          let face = c.face;
          if (facing !== undefined) face = facing + (hash2(h, 13, seed) - 0.5) * 0.25;
          placedLots.push({ lx: c.lx, ly: c.ly, face, sx0: c.lx, sx1: c.lx, sy: c.ly });
          if (inScene(wx, wy)) {
            houses.push({ x: wx, y: wy, z: ground.at(wx, wy), face, form: s.form, settlement: si, size: 1, variant: Math.floor(hash2(h, 12, seed) * HOUSE_VARIANTS), rank: Math.floor(hash2(h, 9, seed) * 256) });
            s.houses++;
          }
        }
      }

      // Sync settlement radius `s.r` cleanly to the tight actual footprint (never an inflated empty disc!).
      let maxR = 12;
      for (const pl of placedLots) maxR = Math.max(maxR, Math.hypot(pl.lx, pl.ly) + Math.max(hsz.w, hsz.l) * 0.55);
      s.r = Math.max(14, maxR);
      if (s.fieldR < s.r + 30) s.fieldR = s.r + 45;
      return;
    }

    // Ring, rows, linear, room-block, camp, or dispersed farmsteads: honor the tradition's explicit geometry.
    const per = spacing * 0.95;
    const firstRing = Math.min(n, 44);
    const R0 = st.layout === 'ring' ? Math.max(spacing * 1.3, clear, (firstRing * per) / TAU) : Math.max(clear, spacing * (0.4 + 0.25 * Math.sqrt(n)));
    const loose = st.layout === 'ring' ? 0.06 : 0.3;
    let ring = 0;
    let onRing = 0;
    let holds = firstRing;
    const perRow = Math.max(2, Math.round(Math.sqrt(n * 2.2)));
    const rows = Math.ceil(n / perRow);
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
        const ly = (Math.floor(r / 2) - (Math.ceil(rows / 2) - 1) / 2) * spacing * 2.3 + (r % 2 ? 0.5 : -0.5) * spacing * 0.95;
        dx = ca * lx + sa * ly;
        dy = -sa * lx + ca * ly;
        face = axis + (r % 2 ? PI : 0);
      } else if (pattern === 'linear') {
        const along = (h - n / 2) * spacing * 1.1;
        const side = h % 2 ? 1 : -1;
        dx = sa * along + ca * side * spacing * 0.6;
        dy = ca * along - sa * side * spacing * 0.6;
        face = axis + (side > 0 ? -PI / 2 : PI / 2);
      } else if (block) {
        const w = Math.ceil(Math.sqrt(n));
        const gx = (h % w) - Math.floor(w / 2);
        const gy = Math.floor(h / w) - Math.floor(w / 2);
        const lx = (gx + 0.5) * spacing + Math.floor(gx / 4) * spacing * 0.35;
        const ly = (gy + 0.5) * spacing + Math.floor(gy / 2) * spacing * 0.35;
        dx = ca * lx + sa * ly;
        dy = -sa * lx + ca * ly;
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
    // Emit streets between paired rows or along a linear settlement.
    if (layout === 'rows' && s.houses > 1) {
      const halfSpan = (perRow * spacing * 0.95) / 2 + 2;
      for (let pair = 0; pair < Math.ceil(rows / 2); pair++) {
        const ly = (pair - (Math.ceil(rows / 2) - 1) / 2) * spacing * 2.3;
        const [x0, y0] = toW(-halfSpan, ly);
        const [x1, y1] = toW(halfSpan, ly);
        streets.push({ line: [x0, y0, x1, y1], width: 3.6, paved: false, settlement: si });
      }
    } else if (pattern === 'linear' && s.houses > 1) {
      const halfSpan = (n * spacing * 1.1) / 2;
      streets.push({ line: [s.x - sa * halfSpan, s.y - ca * halfSpan, s.x + sa * halfSpan, s.y + ca * halfSpan], width: 4.0, paved: false, settlement: si });
    }
    if (pattern === 'dispersed' && n > 1) s.loose = true;
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
    const streetKind = form.streets ?? 'lanes';
    const planned = streetKind !== 'lanes';
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
    const C = streetKind === 'canals' ? T.canal : 0;
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
    const q = clamp01(T.outline[streetKind] ?? 0);
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
    // Emit the town's main avenues and cross-streets for continuous terrain-draped street rendering & trodden masks.
    axisOf.set(si, axis);
    const townExt = D + sideL * 0.8;
    const [mAx0, mAy0] = toScene(-townExt, 0);
    const [mAx1, mAy1] = toScene(townExt, 0);
    const [mBx0, mBy0] = toScene(0, -townExt);
    const [mBx1, mBy1] = toScene(0, townExt);
    streets.push({ line: [mAx0, mAy0, mAx1, mAy1], width: Math.max(4.5, M * 0.85), paved: planned, settlement: si });
    streets.push({ line: [mBx0, mBy0, mBx1, mBy1], width: Math.max(4.5, M * 0.85), paved: planned, settlement: si });
    for (let bj = -NB; bj < NB - 1; bj++) {
      if (bj === -1 || canalAfter(bj)) continue;
      const a = rowExt.get(bj);
      const b = rowExt.get(bj + 1);
      if (!a && !b) continue;
      const x0 = Math.min(a?.[0] ?? Infinity, b?.[0] ?? Infinity) - fX * 0.5;
      const x1 = Math.max(a?.[1] ?? -Infinity, b?.[1] ?? -Infinity) + fX * 0.5;
      if (x1 - x0 < fX) continue;
      const y = yLo[NB + bj] + 2 * fY + w * 0.5;
      const [sx0, sy0] = toScene(x0, y);
      const [sx1, sy1] = toScene(x1, y);
      streets.push({ line: [sx0, sy0, sx1, sy1], width: Math.max(2.6, w * 0.85), paved: false, settlement: si });
    }
    // Its continuous terrain-conforming wall, of what its form says; or, where the form gives a wall's height, thickness
    // or gates and not what it was made of, of the generator's plain wall, which says so.
    const said = form.wall_height !== undefined || form.wall_thickness !== undefined || form.gates !== undefined || form.moat === true;
    const material = (town.from.wall ?? 'generic') !== 'generic' || !said;
    const wall = material ? (form.wall && form.wall !== 'none' ? form.wall : undefined) : T.unstated_wall;
    if (!wall) return;
    const height = mid(form.wall_height, T.walls[wall].height);
    const thick = mid(form.wall_thickness, T.walls[wall].thickness);
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
    const ringCurve = line(margin);
    const named = material ? WALL_LABEL[wall] : 'A town wall, of what is not said';
    const who = (material ? town.from.wall : town.from.wall_height ?? town.from.wall_thickness ?? town.from.gates ?? town.from.moat) ?? 'generic';
    const opening = Math.max(3.6, planned ? M : w * 1.5);
    const G = Math.max(1, Math.round(mid(form.gates, T.gates)));
    const gatePositions = Array.from({ length: G }, (_, j) => (ringCurve.length * (planned ? j : j + 0.6 * hash2(j, 21, seed))) / G).sort((a, b) => a - b);
    const worldGates: GateOpening[] = gatePositions.map((at) => {
      const [gx, gy, nx, ny] = along(ringCurve, at);
      const [wx, wy] = toScene(gx, gy);
      const dx = ca * nx + sa * ny;
      const dy = -sa * nx + ca * ny;
      const dl = Math.hypot(dx, dy) || 1;
      return { x: wx, y: wy, dx: dx / dl, dy: dy / dl, width: opening };
    });
    // Sample a clean closed polygon ring (48 vertices for organic lanes, crisp corners for planned grids) in world coords.
    const polyN = planned ? 32 : 48;
    const worldRing: [number, number][] = [];
    for (let j = 0; j < polyN; j++) {
      const [lx, ly] = along(ringCurve, (ringCurve.length * j) / polyN);
      worldRing.push(toScene(lx, ly));
    }
    const roofMat = forms[s.form].spec.roof_material === 'tile' ? MAT.claytile : MAT.thatch;
    perimeters.push({
      settlement: si,
      ring: worldRing,
      gates: worldGates,
      kind: wall,
      height,
      thickness: thick,
      roofMat,
      towers: towered(wall),
      ...(form.moat ? { moat: T.moat, moatFrom: town.from.moat ?? who } : {}),
      seed: seed ^ 0x517a,
      label: named,
      from: who,
      gateFrom: town.from.gates ?? who,
    });
    gatesOf.set(si, worldGates);
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

/**
 * What the far land (farLand) takes on the average for what LandUseMap works out at each place from the ground there: the
 * share of a shifting cultivator's fields cleared at a time, which LandUseMap draws where a noise passes a threshold; and
 * the share of a rice or irrigated field flooded as a paddy, which it draws on low, gentle ground near the water (all of
 * it for rice, half for irrigated land). The first is held to LandUseMap's by a test (settlement/v9.test.ts); the second
 * hangs on how much of a cell lies low by its water, which no far cell says, and is the generator's guess.
 */
export const FAR_AVERAGE = { swiddenCleared: 0.4, paddy: { rice: 0.6, irrigated: 0.25 } };

/** A plan's settlements by where they are, so that the ground can ask which are near. */
export class LandUseMap {
  /** whether anything of people's is within each square of `OCC` m: where nothing is, nothing need be looked up */
  private occupied: Uint8Array;
  private occN: number;
  private occX0: number;
  private static OCC = 400;
  /** what the nodes about a place are farmed as, weighed; and the weights of each axis: reused, to make no garbage */
  private share = new Float64Array(USE_OF.length);
  private bu = new Float64Array(4);
  private bv = new Float64Array(4);
  private lanes: LaneGround;
  /** how trodden the ground is along streets, plazas, occupied boundaries, and house yards, 0–255 */
  private yards: Uint8Array;
  private step: number;
  private across: number;
  constructor(private plan: SettlementPlan, private ground: Ground, private water: (x: number, y: number) => number, private seed: number) {
    this.lanes = new LaneGround(plan.lanes);
    if (plan.lanes.length || plan.streets.length) {
      for (const line of plan.paths) this.lanes.add(line, plan.pathWidth);
      for (const st of plan.streets) this.lanes.add(st.line, st.width);
    }
    let reach = 64;
    for (const h of plan.houses) reach = Math.max(reach, Math.abs(h.x) + 48, Math.abs(h.y) + 48);
    // Keep grid memory crisp (8 m up to 4 km, 16 m for huge multi-km cities).
    this.step = reach > 4000 ? 16 : 8;
    this.across = Math.ceil((2 * reach) / this.step);
    this.yards = new Uint8Array(this.across * this.across);
    const half = (this.across * this.step) / 2;

    const stampDisc = (cx: number, cy: number, rIn: number, rOut: number, strength = 1) => {
      const i0 = Math.floor((cx - rOut + half) / this.step);
      const i1 = Math.floor((cx + rOut + half) / this.step);
      const j0 = Math.floor((cy - rOut + half) / this.step);
      const j1 = Math.floor((cy + rOut + half) / this.step);
      for (let j = Math.max(0, j0); j <= Math.min(this.across - 1, j1); j++) {
        const py = (j + 0.5) * this.step - half;
        for (let i = Math.max(0, i0); i <= Math.min(this.across - 1, i1); i++) {
          const px = (i + 0.5) * this.step - half;
          const d = Math.hypot(px - cx, py - cy);
          const v = Math.round(255 * strength * (1 - smooth(rIn, rOut, d)));
          const at = j * this.across + i;
          if (v > this.yards[at]) this.yards[at] = v;
        }
      }
    };

    const stampLine = (line: number[], width: number, strength = 0.92) => {
      const rIn = Math.max(2.5, width * 0.55);
      const rOut = rIn + this.step * 0.95;
      for (let q = 0; q + 3 < line.length; q += 2) {
        const ax = line[q];
        const ay = line[q + 1];
        const bx = line[q + 2];
        const by = line[q + 3];
        const segLen = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(1, Math.ceil(segLen / (this.step * 0.7)));
        for (let k = 0; k <= steps; k++) {
          const f = k / steps;
          stampDisc(ax + (bx - ax) * f, ay + (by - ay) * f, rIn, rOut, strength);
        }
      }
    };

    // Tight per-house yard footprint (lets greenery, shade trees and gardens breathe between blocks!).
    for (const h of plan.houses) {
      const f = plan.forms[h.form];
      const r = Math.max(5.5, Math.min(12.5, (f.home?.lot ?? 12) * 0.42));
      stampDisc(h.x, h.y, r * 0.45, r * 1.05, 0.85);
    }
    // Internal town/planned streets, central plazas, and inter-settlement paths.
    for (const st of plan.streets) stampLine(st.line, st.width, st.paved ? 0.96 : 0.84);
    for (const s of plan.settlements) {
      if (!s.loose && !s.boundary && s.houses >= 8) stampDisc(s.x, s.y, Math.min(8, s.r * 0.16), Math.min(15, s.r * 0.28), 0.88);
    }
    for (const ln of plan.paths) stampLine(ln, Math.max(3, plan.pathWidth), 0.75);
    // Fill only the occupied polygon for compact lane-based farming settlements so crops come right up to the
    // enclosure wall while dispersed holdings clear only their own yards and turnoffs.
    for (const { boundary } of plan.settlements) {
      if (!boundary?.length) continue;
      const ys = boundary.map((pt) => pt[1]);
      const first = Math.max(0, Math.ceil((Math.min(...ys) + half) / this.step - 0.5));
      const last = Math.min(this.across - 1, Math.floor((Math.max(...ys) + half) / this.step - 0.5));
      for (let j = first; j <= last; j++) {
        const y = (j + 0.5) * this.step - half;
        let left = Infinity;
        let right = -Infinity;
        for (let v = 0; v < boundary.length; v++) {
          const a = boundary[v];
          const b = boundary[(v + 1) % boundary.length];
          if ((a[1] > y) === (b[1] > y)) continue;
          const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
        const x0 = Math.max(0, Math.ceil((left + half) / this.step - 0.5));
        const x1 = Math.min(this.across - 1, Math.floor((right + half) / this.step - 0.5));
        for (let i = x0; i <= x1; i++) {
          const at = j * this.across + i;
          this.yards[at] = Math.max(this.yards[at], 205);
        }
      }
    }
    // Where there is anything to look up: the fields, the trodden ground and the lanes, each square and those about it.
    const O = LandUseMap.OCC;
    const f = plan.fields;
    this.occX0 = Math.min(f.x0, -half);
    this.occN = Math.ceil((Math.max(f.x0 + f.nx * f.cell, half) - this.occX0) / O) + 1;
    const occ = new Uint8Array(this.occN * this.occN);
    const mark = (x: number, y: number) => {
      const i = Math.floor((x - this.occX0) / O);
      const j = Math.floor((y - this.occX0) / O);
      if (i >= 0 && j >= 0 && i < this.occN && j < this.occN) occ[j * this.occN + i] = 1;
    };
    for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) if (f.use[j * f.nx + i]) mark(f.x0 + i * f.cell, f.y0 + j * f.cell);
    for (let j = 0; j < this.across; j++) for (let i = 0; i < this.across; i++) if (this.yards[j * this.across + i]) mark((i + 0.5) * this.step - half, (j + 0.5) * this.step - half);
    // Along each lane, not at its corners only: a straight one may run far between them.
    for (const l of plan.lanes) {
      for (let q = 0; q + 3 < l.line.length; q += 2) {
        const steps = Math.max(1, Math.ceil(Math.hypot(l.line[q + 2] - l.line[q], l.line[q + 3] - l.line[q + 1]) / (O / 2)));
        for (let s = 0; s <= steps; s++) mark(l.line[q] + ((l.line[q + 2] - l.line[q]) * s) / steps, l.line[q + 1] + ((l.line[q + 3] - l.line[q + 1]) * s) / steps);
      }
      if (l.line.length === 2) mark(l.line[0], l.line[1]);
    }
    this.occupied = new Uint8Array(occ.length);
    for (let j = 0; j < this.occN; j++) {
      for (let i = 0; i < this.occN; i++) {
        if (!occ[j * this.occN + i]) continue;
        for (let b = Math.max(0, j - 1); b <= Math.min(this.occN - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(this.occN - 1, i + 1); a++) this.occupied[b * this.occN + a] = 1;
      }
    }
  }
  /** Whether anything of people's may be at a place. */
  private near(x: number, y: number): boolean {
    const i = Math.floor((x - this.occX0) / LandUseMap.OCC);
    const j = Math.floor((y - this.occX0) / LandUseMap.OCC);
    return i >= 0 && j >= 0 && i < this.occN && j < this.occN && this.occupied[j * this.occN + i] === 1;
  }
  /** How trodden the ground is along streets, plazas and house yards near a place, 0 to 1. */
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
  /** What covers the ground at a place, gated by terrain slope, lanes, and natural riparian margins. */
  at(x: number, y: number, out: LandUse = { crop: 0, pasture: 0, yard: 0, paddy: 0 }): LandUse {
    out.crop = out.pasture = out.yard = out.paddy = 0;
    if (!this.near(x, y)) return out;
    const z = this.ground.at(x, y);
    const above = z - this.water(x, y);
    if (above < 0.5) return out;
    if (this.lanes.contains(x, y)) {
      out.yard = 1;
      return out;
    }
    // Local slope (≈ sin θ): steep hillsides drop out of arable crops into grazed pasture / wild scrub.
    const sd = 8;
    const gx = (this.ground.at(x + sd, y) - this.ground.at(x - sd, y)) / (2 * sd);
    const gy = (this.ground.at(x, y + sd) - this.ground.at(x, y - sd)) / (2 * sd);
    const g2 = gx * gx + gy * gy;
    const sl = Math.sqrt(g2 / (1 + g2));
    const slopeCrop = 1 - smooth(FIELD_SLOPE.cropFadeLo, FIELD_SLOPE.cropFadeHi, sl);
    // How near the water the fields come the growth has said (sites.ts), node by node: here only what is at the water's
    // own level is left unsown.
    const riparianDry = smooth(0.5, 0.8, above);

    // The fields as they grew (sites.ts): each node of the grid is in one settlement's fields or in nobody's. A place is in
    // them as far as the nodes about it are, weighed smoothly over four nodes each way so that an edge runs as a curve and
    // not as a row of the grid's steps; and moved a little this way and that, so that it is not too smooth either.
    const f = this.plan.fields;
    const wx = (noise(x / 70, y / 70, this.seed + 405) - 0.5) * f.cell;
    const wy = (noise(x / 70, y / 70, this.seed + 406) - 0.5) * f.cell;
    const fx = (x + wx - f.x0) / f.cell;
    const fy = (y + wy - f.y0) / f.cell;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    if (i >= 1 && j >= 1 && i < f.nx - 2 && j < f.ny - 2) {
      const share = this.share;
      share.fill(0);
      const bu = spline(fx - i, this.bu);
      const bv = spline(fy - j, this.bv);
      for (let b = 0; b < 4; b++) {
        const row = (j - 1 + b) * f.nx + i - 1;
        for (let a = 0; a < 4; a++) share[f.use[row + a]] += bu[a] * bv[b];
      }
      // Crisper than the weighing's ramp: a field ends at a bank or a ditch, not over a hundred metres.
      const edge = (s: number) => smooth(0.38, 0.62, s);
      const rainfed = edge(share[FIELD_USE.rainfed]);
      const wet = edge(share[FIELD_USE.rice] + share[FIELD_USE.irrigated]);
      const swidden = edge(share[FIELD_USE.swidden]);
      out.pasture = edge(share[FIELD_USE.pasture]);
      // Of a swidden's ground only some plots are cleared at a time: the rest is growing back.
      const cleared = swidden > 0 ? swidden * smooth(0.55, 0.62, noise(x / 160, y / 160, this.seed + 403)) : 0;
      out.crop = Math.max((rainfed + cleared) * riparianDry, wet) * slopeCrop;
      // Steep margins round the fields of a valley are grazed.
      const arable = Math.max(rainfed, wet, swidden);
      if (arable > 0 && sl > 0.18 && sl < 0.42) out.pasture = Math.max(out.pasture, arable * smooth(0.18, 0.28, sl) * (1 - smooth(0.35, 0.44, sl)) * 0.7);
      if (wet > 0) {
        const rice = share[FIELD_USE.rice] / Math.max(1e-6, share[FIELD_USE.rice] + share[FIELD_USE.irrigated]);
        out.paddy = wet * (0.5 + 0.5 * rice) * (1 - smooth(4, 14, above)) * (1 - smooth(0.08, 0.16, sl));
      }
    }
    const own = this.yardAt(x, y);
    if (own > out.yard) out.yard = own;
    out.crop *= 1 - out.yard * 0.85;
    return out;
  }
}

/** The weights of the four nodes about a place along one axis, at `t` past the second of them: a cubic B-spline's. */
function spline(t: number, out: Float64Array): Float64Array {
  const s = 1 - t;
  const t2 = t * t;
  const t3 = t2 * t;
  out[0] = (s * s * s) / 6;
  out[1] = (3 * t3 - 6 * t2 + 4) / 6;
  out[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
  out[3] = t3 / 6;
  return out;
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

/**
 * How much of the land in each of the 5′ cells around a scene was worked, as its spec's far cells give it (ScenePeople,
 * far): the shares of a cell in crops, in pasture, and in crops flooded as paddies. It is what the settlements of the cell
 * would lay out if the scene reached it, on the average and with none of them placed: each the fields of its pattern
 * (PatternParams.fields) where the cell has a settlement, and the houses' own ground; in a cell of towns or a city, the
 * houses' lots as built ground, and only its fields worked. Drawn beyond the scene's own settlements and across a band
 * at their edge, so that the worked land does not stop where the scene does. The cities of the lists and of records are
 * left out: they are few, and drawn where the scene reaches them. What LandUseMap works out from the ground at a place,
 * the far land takes on the average (FAR_AVERAGE).
 */
export interface FarLand {
  north: number;
  west: number;
  nx: number;
  ny: number;
  res: number;
  crop: Float32Array;
  pasture: Float32Array;
  paddy: Float32Array;
  /** the share of a town's or a city's cell its houses' lots take: drawn as trodden ground, and none of it worked */
  built: Float32Array;
}

export function farLand(spec: SceneSpec): FarLand | undefined {
  const P = spec.people;
  const g = P?.far;
  if (!P || !g) return undefined;
  const p = P.generator.params as unknown as SettlementParams;
  const assessed = new Map(g.assessments.map((x) => [x.id, x.assessment]));
  const n = g.nx * g.ny;
  const out: FarLand = { north: g.north, west: g.west, nx: g.nx, ny: g.ny, res: g.res, crop: new Float32Array(n), pasture: new Float32Array(n), paddy: new Float32Array(n), built: new Float32Array(n) };
  const side = g.res * EARTH * DEG;
  for (let row = 0; row < g.ny; row++) {
    const north = g.north - row * g.res;
    const m2 = side * side * dcos(((north - g.res / 2) * PI) / 180);
    for (let col = 0; col < g.nx; col++) {
      const i = row * g.nx + col;
      const k = g.anthrome[i];
      const d = g.density[i];
      if (!k || d <= 0) continue;
      const life = lifewayOf(P.classes, k, d, assessed.get(g.region[i]));
      if (life.pattern === 'none') continue;
      const pp = p.patterns[life.pattern];
      // A settlement's houses, by their middle on the scale its range is drawn on (`within`), and how many settlements the
      // cell's people make: the cell has one at least as often as it has a share of one.
      const per = Math.sqrt(pp.houses[0] * pp.houses[1]);
      const houses = (d * m2 * 1e-6) / p.household;
      const settlements = houses / per;
      const lots = (houses * pp.lot) / m2;
      // A town's or a city's houses stand on its streets' lots, and are its built ground, which its fields do not take.
      const town = life.pattern === 'city' || life.pattern === 'towns';
      if (town) out.built[i] = Math.min(1, lots);
      if (life.fields === 'none') continue;
      const share = Math.min(1 - out.built[i], Math.min(1, settlements) * pp.fields + (town ? 0 : lots));
      if (life.fields === 'pasture') out.pasture[i] = share;
      else {
        // Shifting cultivators have only some of their plots cleared at a time (LandUseMap).
        out.crop[i] = life.fields === 'swidden' ? share * FAR_AVERAGE.swiddenCleared : share;
        out.paddy[i] = life.fields === 'rice' || life.fields === 'irrigated' ? out.crop[i] * FAR_AVERAGE.paddy[life.fields] : 0;
      }
    }
  }
  return out;
}

/**
 * How far what a plan works is from what farLand says of the same cells: the plan's worked share over farLand's, in the
 * cells the plan holds whole (within `extent` metres of its middle each way, less `margin`, where all of their settlements
 * are laid out) and that no city's ground reaches, as farLand leaves the cities of the lists and of records out. 1 where no cell counts or nothing is
 * worked in them; at most 1.6 and at least 0.4 otherwise. The far land is scaled by it (farLandMask), so that the plan's
 * worked land and the far land agree on the average where they meet.
 */
export function farScale(far: FarLand, plan: SettlementPlan, use: LandUseMap, origin: { lat: number; lon: number }, extent: number, margin = 600): number {
  const cities = plan.settlements.filter((s) => s.city);
  // A city's fields grow over the land (sites.ts) and may reach past its field radius: the nodes they hold say where.
  const f = plan.fields;
  const cityNodes: [number, number][] = [];
  const isCity = new Set(plan.settlements.flatMap((s, si) => (s.city ? [si] : [])));
  if (isCity.size) for (let k = 0; k < f.owner.length; k++) if (isCity.has(f.owner[k])) cityNodes.push([f.x0 + (k % f.nx) * f.cell, f.y0 + Math.floor(k / f.nx) * f.cell]);
  const u: LandUse = { crop: 0, pasture: 0, yard: 0, paddy: 0 };
  const N = 12;
  const inner = extent - margin;
  let made = 0;
  let said = 0;
  for (let row = 0; row < far.ny; row++) {
    for (let col = 0; col < far.nx; col++) {
      const i = row * far.nx + col;
      const north = far.north - row * far.res;
      const west = far.west + col * far.res;
      const [x0, y1] = toLocal(origin, north, west);
      const [x1, y0] = toLocal(origin, north - far.res, west + far.res);
      if (x0 < -inner || x1 > inner || y0 < -inner || y1 > inner) continue;
      // A city's fields reach as far as the larger of its ground and its fields.
      const near = (c: Settlement) => {
        const r = Math.max(c.r, c.fieldR);
        const dx = Math.max(x0 - c.x, 0, c.x - x1);
        const dy = Math.max(y0 - c.y, 0, c.y - y1);
        return dx * dx + dy * dy < r * r;
      };
      if (cities.some(near) || cityNodes.some(([x, y]) => x >= x0 - f.cell && x <= x1 + f.cell && y >= y0 - f.cell && y <= y1 + f.cell)) continue;
      let got = 0;
      for (let a = 0; a < N; a++) {
        for (let b = 0; b < N; b++) {
          use.at(x0 + ((a + 0.5) / N) * (x1 - x0), y0 + ((b + 0.5) / N) * (y1 - y0), u);
          got += u.crop + u.pasture;
        }
      }
      made += got / (N * N);
      said += far.crop[i] + far.pasture[i];
    }
  }
  return said > 0.05 && made > 0 ? Math.max(0.4, Math.min(1.6, made / said)) : 1;
}

/**
 * The far land as an image about the scene's middle, `half` metres each way: R crops, G pasture, B built ground,
 * A paddies, as shares of the ground, read between the cells' middles so that no cell's edge shows. `scale` is how far
 * the worked shares of this scene's own settlements are from what the cells say of them (farScale), which the far land's
 * worked shares are made to agree with; its built ground is as the cells say.
 */
export function farLandMask(far: FarLand, origin: { lat: number; lon: number }, size: number, half: number, scale = 1): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const step = (half * 2) / size;
  const at = (a: Float32Array, r: number, c: number) => (r < 0 || c < 0 || r >= far.ny || c >= far.nx ? 0 : a[r * far.nx + c]);
  const read = (a: Float32Array, u: number, v: number) => {
    const r = Math.floor(v);
    const c = Math.floor(u);
    const fr = v - r;
    const fc = u - c;
    return (at(a, r, c) * (1 - fc) + at(a, r, c + 1) * fc) * (1 - fr) + (at(a, r + 1, c) * (1 - fc) + at(a, r + 1, c + 1) * fc) * fr;
  };
  const cosLat = dcos(origin.lat * DEG);
  for (let j = 0; j < size; j++) {
    const lat = origin.lat + (-half + (j + 0.5) * step) / (EARTH * DEG);
    // The cells' rows from the north, between their middles.
    const v = (far.north - lat) / far.res - 0.5;
    for (let i = 0; i < size; i++) {
      const lon = origin.lon + (-half + (i + 0.5) * step) / (EARTH * DEG * cosLat);
      let dl = lon - far.west;
      dl -= 360 * Math.floor(dl / 360);
      const u = dl / far.res - 0.5;
      const o = (j * size + i) * 4;
      const crop = clamp01(read(far.crop, u, v) * scale);
      data[o] = Math.round(crop * 255);
      data[o + 1] = Math.round(clamp01(read(far.pasture, u, v) * scale) * 255);
      data[o + 2] = Math.round(clamp01(read(far.built, u, v)) * 255);
      data[o + 3] = Math.round(clamp01(read(far.paddy, u, v) * scale) * 255);
    }
  }
  return data;
}

/** The anthrome classes a plan draws on, for a panel: its own name for what is there. */
export function anthromeLabel(spec: SceneSpec, k: number): string | undefined {
  return spec.people ? anthromeOf(spec.people.classes, k)?.label : undefined;
}
