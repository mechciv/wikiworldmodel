// A living scene: what it is made from, by the build and by the browser alike. A place at a moment, the land
// around it, and the taxa the records put there. Positions are metres on a local grid, as a city's are: x east
// and y north of the site's origin, which is where the place stood then, not where it is today. Which taxa, how
// big and when come from the records; where each animal and plant stands, how many, what it is doing and what
// colour it is come from the generator.
import type { ClimateClass, ClimateNode, ClimateRule } from './climate.ts';
import type { Months } from './months.ts';
import type { WaterParams } from './water.ts';
import type { Fingerprint } from './fingerprint.ts';
import type { Form } from './form.ts';
import type { FeatureTime } from './tileset.ts';
import type { Agriculture, Husbandry, Tradition } from './dwelling.ts';
import type { AnthromeClass, Assessment, CityNear, Lifeway } from './landscape.ts';
import type { SceneBedrock, SceneSubstrate } from './substrate.ts';

/** A taxon of the formation that is not drawn, and why not. */
export interface SceneOmission {
  id: string;
  label: string;
  why: string;
}

/** The land's cover, as the world's transitions give it at the slice. */
export interface SceneCover {
  plants: number;
  forests: number;
  grasses: number;
}

/**
 * How a taxon in a scene rests on evidence. A site's own taxa come from its formation's rows. An animal the people of
 * the scene kept is `kept`: a husbandry tradition of its region and time names it (ScenePeople.kept).
 */
export type SceneTier = 'formation' | 'here' | 'region' | 'standin' | 'kept';

export interface LivingTaxon {
  /** a record's id, or the database's number as `txn:123` where no record adopts it */
  id: string;
  label: string;
  /** a key in the scene's forms; and whose form that is */
  form: string;
  form_from: string;
  form_label: string;
  /** whether the form is the taxon's own: if not, it is its nearest node's, and it says so */
  own: boolean;
  tier: SceneTier;
  /** to the nearest of its rows, in km */
  km?: number;
  /** how common it is in the list it comes from, 0–1 */
  weight: number;
  /** the rows of its stage, or its formation */
  rows: number;
  collections?: number;
  posture?: string;
  biped: boolean;
  /** how big it grew, in metres or kg: what the generator draws, within any range a claim gives */
  length?: number;
  hip?: number;
  height?: number;
  mass?: number;
  /** where its length or height comes from, if not its own measurement */
  size_from?: string;
  /** its length follows from a claimed mass */
  fromMass?: boolean;
  diet?: string;
  /**
   * the climate its rows lived in, as the atlas gives it: the mean and the spread of the warmest month and of the
   * coldest, °C. A scene grows a plant where the climate of its own heights is most like it.
   */
  climate?: [number, number, number, number];
  time: FeatureTime;
  variants?: Record<string, FeatureTime>;
}

/**
 * Whether a taxon of a scene stands at a time: within the span its record gives it, or its rows in the stage. A scene's
 * renderer draws it only then, so a scene at a time its rows do not reach does not draw it.
 */
export const standsAt = (time: FeatureTime, t: number): boolean => (time.start.best ?? -Infinity) <= t && t <= (time.end.best ?? Infinity);

/** The elevation field around a place, at the keyframe nearest its time: rows from the north, in metres above the coast. */
export interface ReliefPatch {
  lat0: number;
  lon0: number;
  step: number;
  nx: number;
  ny: number;
  z: number[];
}

/**
 * The shape of today's ground within the cells of a scene's relief (core/relief.ts): the cells of the survey that
 * today's relief is read from, around where the scene's origin stands today. Where today's relief is held for the
 * scene's time, each is what the survey has there less what the relief's grid makes of it, and the two together are the
 * survey's ground. Before that it is carried back on its plate (model:earth/relief-carried): today's ground less
 * what the elevation of the scene's time makes of today, as much of it as the model says stood at each place, laid
 * over that elevation.
 */
export interface ReliefShape {
  /** the field it is: today's relief, or today's relief carried back; and whether today's relief is held for the scene's time, so that it is the survey's own */
  field: string;
  held: boolean;
  /** where the scene's origin stands today, and the bearing there of the scene's north, radians clockwise: how far its plate has turned since */
  at: { lat: number; lon: number };
  turn: number;
  /** how much of today's shape stood at the scene's place and time, 0–1: all of it where today's relief is held */
  share: number;
  /** the range whose record says so, where one says more than the model's rule */
  range?: { id: string; label: string };
  /** the survey's cells, rows from the north, in metres: `lat0` and `lon0` are the middle of the first */
  patch: ReliefPatch;
  /**
   * For a shape carried back: today's ground at each of those cells, in metres above today's sea; and the least share
   * of the height the scene's elevation gives the land of a place that ground above today's sea keeps above the coast
   * there. Where that elevation has the land lower than today, today's valleys would lie under its sea, and a valley
   * is cut no lower than the sea it drains to: so ground that is dry today is held above the coast wherever that
   * elevation has land, and no higher than it stands today.
   */
  today?: number[];
  floor?: number;
}

/** A river as a scene's spec gives it: its course in local metres, upstream first (world/generators/life/rivers.ts draws it). */
export interface SceneRiver {
  /** what names it: its set and reach, or its dataset's row; what is invented of it is keyed by this */
  key: string;
  from: 'observed' | 'model';
  /** flat [x, y, …], upstream first */
  xy: number[];
  /** the distance along it to its first point from where its reach begins, m */
  s0: number;
  /** its mean flow at each point, m³/s; or its measured width at each point, m */
  q?: number[];
  width?: number[];
  /** the height of its water at each point, m above the coast, where the world gives it */
  z?: number[];
  /**
   * the months its bed holds water in, as bits, January the lowest (field:earth/rivers, `wet_share`); undefined where the
   * world does not say, as for a river Landsat saw, which holds water in every month. In a month without its bit the
   * river is a dry bed, with only the floods of a storm.
   */
  wet?: number;
}

/** The laws a channel is drawn by: the rivers field's parameters (field:earth/rivers). */
export interface ChannelLaws {
  width: [number, number];
  depth: [number, number];
  wavelength_widths: [number, number];
  radius_widths: [number, number];
  braided_cfs: [number, number];
  sinuosity_least: number;
  sinuosity_most: number;
  deflection_most: number;
}

/**
 * A lake in scene metres. A drainage-grid lake gives its cells; a mapped lake gives its shore and island rings.
 */
export type SceneLake = {
  /** Its drainage set and first node, or the address of its mapped row. */
  key: string;
  /** its surface, m above the coast */
  level: number;
  /** whether it spills over its pass, or holds only what its surface does not evaporate */
  spills?: boolean;
} & ({
  rings?: undefined;
  /** the middles of the cells it covers, flat [x, y, …], and each cell's half width east and north, m */
  cells: number[];
  half: [number, number];
} | {
  /** Reconstructed shoreline, including islands, as closed rings in scene metres. */
  rings: number[][];
  field: string;
});

/** The water the world gives a place: its rivers, the laws their channels are drawn by, and what they rest on. */
export interface SceneWater {
  /** the lakes of the time near it, where the world has them */
  lakes?: SceneLake[];
  rivers: SceneRiver[];
  laws: ChannelLaws;
  /** evidence where a dataset measured a river here, model where only the drainage routes one */
  tier: 'evidence' | 'model';
  /** the fields its rivers come from */
  from: string[];
}

/** The year's vegetation in one cell of a climate's source: its class and the class's name, its leaf area index and its production, in their fields' units. */
export interface SceneVegetation {
  biome: number;
  name?: string;
  leaf?: number;
  npp?: number;
}

/**
 * What else the climate's source says of a scene's node, beside its temperature and rain (core/months.ts PARTS): each
 * where the source has it, and null in a month it gives nothing for. No generator reads these yet.
 */
export interface SceneParts {
  /** by month, January first: cloudiness, % of the sky; relative humidity, %; and the mean speed of the wind, m/s */
  cloud?: (number | null)[];
  humidity?: (number | null)[];
  wind_speed?: (number | null)[];
  /** the mean wind as a vector, m/s toward the east and the north of the climate's keyframe, where its source gives that and not the mean speed */
  wind?: { u: (number | null)[]; v: (number | null)[] };
  /** the share of sunlight the surface sends back, 0–1 */
  albedo?: (number | null)[];
  /** the year's vegetation in the source's cell the place is in, or the nearest of its node's that has one; and in each of the node's four cells, north-west, north-east, south-west, south-east */
  vegetation?: SceneVegetation & { cells: (SceneVegetation | null)[] };
  /** the field each is, by its part: cloud, humidity, wind_speed, u, v, albedo, biome, leaf, npp */
  fields: Record<string, string>;
}

/**
 * The climate a scene stands in, at its own heights (field:earth/climate-at-height): the months of the node it stands
 * on, of the finest climate that covers its time, the height they stand for, and what brings them to any other height
 * and month.
 */
export interface SceneClimate {
  /** the climate field read, and its keyframe */
  field: string;
  ageMa: number;
  /** the node's twelve months, January first: °C and mm */
  months: Months;
  /** the height those months stand for, m above the coast the scene's relief is measured from, and that coast above the sea */
  height: number;
  coast: number;
  /** how fast the air cools upward, °C a kilometre */
  lapse: number;
  /** the thresholds that class the climate at a height */
  rule: ClimateRule;
  /** the water balance's rules, by which snow falls, lies and melts */
  water: WaterParams;
  /** the month drawn, 1–12, and the latitude of the node then, which sets its daylight */
  month: number;
  lat: number;
  /** what else the climate's source says of the node, where the build keeps it */
  parts?: SceneParts;
}

/**
 * The people of a scene's place and time, as the human landscape gives them (docs/HUMAN-LANDSCAPE.md): the 5′ cells
 * around it with their anthromes, people and regions, the cities standing near, what each region's archaeologists said,
 * and the building traditions that hold there. gen:people/settlement draws its houses, fields and pastures from it.
 */
export interface ScenePeople {
  /** the time drawn, the step of the anthromes nearest it, and the survey's time nearest it */
  t: number;
  step: number;
  /** the 5′ cells around the place, rows from the north: the build's class numbers, people to the km² and regions */
  grid: { north: number; west: number; nx: number; ny: number; res: number; anthrome: number[]; density: number[]; region: number[] };
  /**
   * the same 5′ cells further out (core/landscape.ts, FAR_REACH_DEG), and their regions' assessments: how much of the land
   * beyond the scene's own settlements was worked, drawn coarsely so that the fields do not stop at the scene's edge
   */
  far?: { north: number; west: number; nx: number; ny: number; res: number; anthrome: number[]; density: number[]; region: number[]; assessments: { id: number; assessment: Assessment }[] };
  /** the anthromes' classes, as their field lists them */
  classes: AnthromeClass[];
  /** each region of the grid: its name, and what its archaeologists said at the survey's time nearest */
  regions: { id: number; label: string; slice: string; assessment: Assessment }[];
  /** the lifeway at the place itself */
  lifeway: Lifeway;
  /**
   * the cities standing within reach of the scene then: the lists', and the settlements the world has records of, a
   * record's city with what its own claims say of its people, houses, ground and layout (core/landscape.ts, citiesAround)
   */
  cities: (Omit<CityNear, 'km' | 'also'> & { also?: CityNear['also'] })[];
  /** the building traditions that hold in the grid's regions at the time, merged down their tree */
  traditions: Tradition[];
  /**
   * the husbandry traditions that hold there then, and the animals they name, each with its body and its size as its
   * taxon's records give them, and their forms: gen:people/settlement draws them in the pastures and about the yards
   */
  husbandry?: Husbandry[];
  kept?: LivingTaxon[];
  keptForms?: Record<string, Form>;
  /** the agricultural traditions that hold there then: which crops people grew and how their fields were laid out */
  agriculture?: Agriculture[];
  /** what it rests on: the fields read */
  fields: { anthromes: string; assessment: string; population: string; lifeways: string };
  /** the generator that draws it, and its parameters */
  generator: { generator: string; version: number; params: Record<string, unknown> };
}

/** Everything a scene is made from: nothing else about the world goes in, and the same spec makes the same scene. */
/** A surveyed ground: grids laid out in metres about its own point, finest first, and the water it gives. */
export interface SceneSurvey {
  /** what it is of: a settlement's record */
  of: string;
  origin: { lat: number; lon: number };
  /** heights in whole steps of `unit` metres (a tenth where not said) above `base` */
  levels: { nx: number; ny: number; x0: number; y0: number; cell: number; z: Int16Array; unit?: number; base?: number }[];
  /** outlines of its water in its metres, the islands in them, and the water's level, m */
  water?: { rings: number[][]; islands: number[][]; level: number };
  /**
   * The ground the settlement's recorded structures take at the scene's time, in its metres: `built`, where no house
   * stands and nothing grows, and `gardens`, where no house stands and trees may
   */
  built?: number[][];
  gardens?: number[][];
  /** outlines of the structures that houses keep a street's width from, all round their convex hulls */
  clear?: number[][];
}

export interface SceneSpec {
  format: 'lightworld-scene@2';
  site: {
    id: string;
    label: string;
    /** the record the scene belongs to, if it is a place with a record */
    place?: string;
    /** the local grid's origin: where the place stood at the slice, in the globe's coordinates at that time */
    origin: { lat: number; lon: number };
    /** where that is in the coordinates of the relief's keyframe, as the plate had carried it */
    relief_at?: { lat: number; lon: number };
    /** the times it is drawn for, and the moment it describes */
    span: [number, number];
    slice: number;
    /** what its stage is called */
    stage?: string;
  };
  relief: ReliefPatch;
  /** the shape of today's ground within the relief's cells, where the world has it for the place and the time */
  shape?: ReliefShape;
  /** where the world says the rivers run; without it a scene invents its river */
  water?: SceneWater;
  biome: { climate: ClimateClass; label: string; field: string; ageMa: number; cover: SceneCover; node: ClimateNode };
  /** the climate at its heights and in its month; without it, the one class of the biome holds everywhere */
  climate?: SceneClimate;
  /** the people of the place and time, where the human landscape reaches it */
  people?: ScenePeople;
  /**
   * A settlement's own survey of its ground, finer than the world's, and its water, laid over the scene's where they
   * reach (world/generators/life/survey.ts; docs/plans/CITIES.md, The models)
   */
  survey?: SceneSurvey;
  /** what its ground is made of, where the world says (core/substrate.ts); without it the climate's class decides, generically */
  substrate?: SceneSubstrate;
  /** the rock under its ground, where a map of today's bedrock is held for its time: what its outcrops and stones are drawn of */
  bedrock?: SceneBedrock;
  taxa: LivingTaxon[];
  omitted: SceneOmission[];
  forms: Record<string, Form>;
  /** what the taxa rest on */
  fossils: { source: string; title: string; rows: number; collections: number; drawn: number };
  generator: { generator: string; version: number; seed: string; basis: 'procedural'; params: Record<string, unknown> };
}

/** A scene the build wrote, with what proves a browser made the same one. */
export interface SceneFileV2 {
  format: 'lightworld-scene-file@2';
  spec: SceneSpec;
  /** the fingerprint of its ground, the cell it is arrived at and one mesh */
  print: Fingerprint;
  focus: [number, number];
  to_river: [number, number];
  water_level: number;
}
