// How people lived, as data: the house a building tradition put up, the settlement those houses stood in, and the
// fields around it (docs/DWELLINGS.md). Like a taxon's body, a tradition's dwelling is a few named parameters, each a
// sourced claim; a tradition says only what differs from the broader one it is a member of, and inherits the rest;
// and where no tradition is written for a place and a time, the settlement generator's generic dwelling for the way of
// life and the climate stands in, and says so. Nothing here is a fact about any place: the facts are in the records.

/** A number, or a range of them as a source gives it. */
export type Span = number | { lo: number; hi: number };

/** The words each parameter may take, each with what it means. A claim that needs a new one adds it here, with its meaning. */
export const DWELLING_WORDS = {
  plan: {
    round: 'Circular in plan.',
    oval: 'Oval or elliptical in plan.',
    rectangular: 'Rectangular in plan, longer than wide.',
    square: 'About as wide as it is long.',
    apsidal: 'Rectangular with one or both ends rounded.',
    long: 'A longhouse: many times longer than it is wide, often for several households or for people and animals together.',
    courtyard: 'Rooms around an open court, which the house encloses.',
    'room-block': 'Many rooms joined wall to wall and often stacked, so that houses are cells of one block.',
    'l-shaped': 'Two ranges of rooms meeting at a corner.',
    'figure-of-eight': 'Two round rooms joined.',
    polygonal: 'Five, six or more straight sides.',
    semicircular: 'A half circle, open or straight along one side: a windbreak or a lean-to shelter.',
  },
  walls: {
    mudbrick: 'Sun-dried mud bricks.',
    'fired-brick': 'Bricks fired in a kiln.',
    stone: 'Stone, dry or set in mortar or mud.',
    timber: 'Logs, planks or a timber frame filled with timber.',
    log: 'Logs laid one on another and notched together at the corners.',
    plank: 'Planks, set upright or laid along, on a frame of posts.',
    'timber-frame': 'A frame of timber whose panels are filled with wattle and daub, earth or brick.',
    wattle: 'Woven branches or split bamboo, with no daub.',
    mat: 'Mats woven of bamboo, palm leaf, grass or reed, tied to a frame.',
    'wattle-and-daub': 'Woven branches plastered with mud or clay.',
    'pole-and-thatch': 'Poles with thatch or leaves tied to them, so that wall and roof are one.',
    reed: 'Bundled or woven reeds.',
    'rammed-earth': 'Earth rammed between boards.',
    cob: 'Solid earth built up by hand in courses, with no frame: cob, daga or puddled mud.',
    hide: 'Hides over a frame.',
    felt: 'Felt over a frame.',
    cloth: 'Cloth woven of hair or wool over poles and ropes, as a black tent is.',
    bark: 'Bark sheets over a frame.',
    sod: 'Cut turf or sod.',
    snow: 'Blocks of snow.',
    'earth-cut': 'Cut into loess, soft rock or a hillside, the ground itself its walls: a cave dwelling.',
    none: 'No walls: the roof comes down to the ground.',
  },
  roof: {
    flat: 'Flat.',
    gable: 'Two slopes meeting at a ridge.',
    hip: 'Sloping on all sides.',
    conical: 'A cone, over a round plan.',
    dome: 'A dome or a rounded vault of the whole house.',
    tent: 'A tent: a covering on poles.',
    vault: 'A barrel vault.',
    'hip-and-gable': 'Slopes on all four sides, the two at the ends stopping short of the ridge under a small gable.',
    'half-hip': 'A gable whose top is cut back in a short slope.',
    curved: 'Slopes whose ridge and eaves curve down towards the ends, as the roofs of Bengal do.',
    shed: 'One slope.',
  },
  roof_material: {
    earth: 'Earth or mud over beams and matting.',
    thatch: 'Thatch of straw, grass, reeds or leaves.',
    leaves: 'Leaves, where a source says so and not straw or grass: laid like tiles or tied on in bunches.',
    brush: 'Brushwood, boughs or bundled stalks.',
    mat: 'Woven mats.',
    tile: 'Fired tiles.',
    timber: 'Planks or shingles.',
    bark: 'Bark sheets.',
    hide: 'Hides.',
    felt: 'Felt.',
    cloth: 'Cloth woven of hair or wool.',
    reed: 'Reed mats.',
    stone: 'Stone slabs or corbelled stone.',
    turf: 'Turf.',
    snow: 'Snow.',
  },
  floor: {
    ground: 'At the level of the ground.',
    sunken: 'Dug below the ground: a pit house.',
    raised: 'On a low earth or stone base.',
    platform: 'On a built platform, a metre or more high.',
    stilts: 'On posts, above the ground or water.',
  },
  entrance: {
    end: 'In a short side, or under a gable.',
    side: 'In a long side.',
    roof: 'Through the roof, by a ladder.',
    tunnel: 'By a low covered passage, as a snow house or a winter house of sod has.',
  },
  faces: {
    north: 'Its entrance faces north.',
    'north-east': 'Its entrance faces north-east.',
    east: 'Its entrance faces east.',
    'south-east': 'Its entrance faces south-east.',
    south: 'Its entrance faces south.',
    'south-west': 'Its entrance faces south-west.',
    west: 'Its entrance faces west.',
    'north-west': 'Its entrance faces north-west.',
  },
  windows: {
    none: 'No windows: light came by the door and the smoke hole.',
    small: 'Small openings, unglazed, shuttered or barred.',
    large: 'Large windows, of lattice, paper or glass.',
  },
  smoke: {
    none: 'No opening for it: smoke found its way out through the roof or by the door.',
    hole: 'A hole in the roof, at its top or along its ridge.',
    gable: 'Openings under the ridge at the gable ends.',
    chimney: 'A built chimney.',
  },
  finish: {
    plain: 'Left as built.',
    mud: 'Plastered with mud, clay or dung.',
    lime: 'Plastered or washed with lime: white.',
    painted: 'Painted or patterned in colours.',
  },
} as const;

/** What stood round a settlement, a compound or a yard. */
const ENCLOSURE_WORDS = {
  none: 'Open: nothing stood round it.',
  fence: 'A fence of posts and rails, of wattle or of reeds.',
  hedge: 'A hedge, live or of cut thorn.',
  palisade: 'A palisade of upright posts.',
  bank: 'A bank of earth, with or without its ditch.',
  ditch: 'A ditch.',
  wall: 'A wall of stone, brick or earth.',
} as const;

export type EnclosureWord = keyof typeof ENCLOSURE_WORDS;

export const SETTLEMENT_WORDS = {
  pattern: {
    nucleated: 'Houses clustered in a village, with fields around it.',
    dispersed: 'Houses or farmsteads standing apart, each among its own fields.',
    hamlet: 'A few houses together, the hamlets spread over the land.',
    compound: 'Houses of a household or a lineage inside one enclosure, the compounds spread or clustered.',
    linear: 'Houses in a row along a road, a river or a shore.',
    camp: 'Shelters of a mobile group, put up and left.',
    'room-block': 'One block of rooms holds the whole settlement, or most of it.',
    walled: 'A settlement inside a wall.',
  },
  layout: {
    ring: 'Houses in a ring round an open middle.',
    rows: 'Houses in straight rows.',
  },
  /** what stood round the whole settlement, or round a compound */
  enclosure: ENCLOSURE_WORDS,
  /** what stood round each house's own yard */
  yard: ENCLOSURE_WORDS,
} as const;

/**
 * What a household or a settlement had besides its houses: a granary, a pen, a well, a house to meet in. A tradition's
 * `outbuildings` claim lists them, each with whose it was and, as far as its sources say, what it was like, in the
 * words and sizes of a dwelling. The settlement generator draws them by the houses or among them.
 */
export const OUTBUILDING_WORDS = {
  use: {
    granary: 'A store for grain or other crops: a granary, a crib, a raised storehouse.',
    store: 'A storehouse for other goods, or a cache.',
    byre: 'A house for animals: a byre, a stable, a sty, a sheepcote.',
    pen: 'An open enclosure for animals: a pen, a fold, a kraal, a corral.',
    kitchen: 'A cookhouse apart from the house.',
    oven: 'An oven or a kiln standing in the open.',
    well: 'A well.',
    pond: 'A pond or a tank dug for water.',
    rack: 'A rack or a scaffold for drying fish, meat, hides or crops.',
    stack: 'A stack or a rick of hay, straw or fodder.',
    'threshing-floor': 'A floor for threshing, in the open.',
    workshop: "A hut to work in: a weaving hut, a smithy, a potter's shed.",
    bath: 'A bath house or a sweat house.',
    shrine: 'A shrine, a temple or a church.',
    hall: "A house to meet in: a men's house, a council house, a chief's hall, a kiva.",
    pole: 'A carved or painted pole, or a standing stone.',
  },
  per: {
    house: "A household's: it stood by a house.",
    settlement: "The settlement's: it stood among the houses, or at their middle.",
  },
} as const;

export type OutbuildingUse = keyof typeof OUTBUILDING_WORDS.use;

/** The uses that are roofed buildings, drawn as a house is from the words of a dwelling; the rest are drawn as works. */
export const OUTBUILDING_ROOFED: Record<OutbuildingUse, boolean> = {
  granary: true,
  store: true,
  byre: true,
  pen: false,
  kitchen: true,
  oven: false,
  well: false,
  pond: false,
  rack: false,
  stack: false,
  'threshing-floor': false,
  workshop: true,
  bath: true,
  shrine: true,
  hall: true,
  pole: false,
};

export const FIELD_WORDS = {
  kind: {
    blocks: 'Rectangular fields, about as wide as long.',
    strips: 'Long narrow strips, ploughed in one direction.',
    irregular: 'Small fields of no regular shape.',
    terraces: 'Fields levelled into a slope, in steps.',
    paddies: 'Flooded fields within low banks, for rice.',
    basins: 'Fields watered from canals or a flood, in basins or plots along the channels.',
    raised: 'Raised beds or ridged fields in wet ground.',
    swidden: 'Plots cleared and burnt in woodland, cropped for a few years and left to grow back.',
    gardens: 'Gardens and orchards worked by hand around the houses.',
    none: 'No fields: the people of the tradition did not farm.',
  },
  bounds: {
    none: 'Open: nothing divides the fields.',
    banks: 'Earth banks or balks.',
    walls: 'Stone walls.',
    hedges: 'Hedges.',
    ditches: 'Ditches.',
    dikes: 'Dikes or levees, as around flooded fields.',
  },
} as const;

/**
 * How a town or a city was laid out: its streets, and what enclosed it. A tradition that housed townspeople states it
 * for the towns of its region and time, and a settlement's own record for that city (`town_form`). The settlement
 * generator lays a town's houses out by it; where neither says, by its generic town, which says so.
 */
export const TOWN_WORDS = {
  /**
   * How its houses stood on its ground (model:people/settlement-form): packed together, as the city system draws every
   * town where nothing says otherwise; or its tradition's own settlements set apart among their fields
   */
  fabric: {
    compact: 'Its houses packed together along its streets and lanes: the town one built-up mass.',
    dispersed: "Its people's own settlements, each with its houses, set apart among fields, gardens and water: a low-density town.",
  },
  streets: {
    grid: 'Straight streets crossing at right angles, the houses in blocks between them.',
    lanes: 'Winding lanes and alleys that follow no plan, the houses packed between them.',
    canals: 'Streets of water among the streets of earth, the houses on the ground between them.',
  },
  wall: {
    none: 'Open: nothing enclosed it.',
    earth: 'A bank or rampart of earth.',
    'rammed-earth': 'A wall of earth rammed between boards.',
    timber: 'A palisade of posts.',
    mudbrick: 'A wall of sun-dried brick.',
    stone: 'A wall of stone.',
    brick: 'A wall of fired brick.',
  },
} as const;

/**
 * Whom a tradition housed: the ways of life the model of how people lived tells apart (model:people/lifeways). A
 * tradition's `lifeway` claim names one or more of them, and its house is drawn only for those: a herder's tent for
 * the camps of herders, not for the farmers of the same region.
 */
export const LIFEWAY_WORDS = {
  foragers: 'People who lived by hunting, fishing and gathering, in camps or in settled villages.',
  herders: 'People who lived mainly by their herds, in camps moved with them or on farms among their pastures.',
  'shifting-cultivators': 'People who cleared plots in woodland, cropped them for a few years and moved on.',
  farmers: 'People who farmed the same fields year after year, in farmsteads, hamlets and villages.',
  townspeople: 'People of towns and cities.',
} as const;

export type LifewayWord = keyof typeof LIFEWAY_WORDS;

/**
 * Ways of life near enough that the house of one stands in for the other's where none is written for it. The model
 * tells shifting cultivators from farmers by a survey's answer for a whole region, non-continuous against continuous
 * farming (model:people/lifeways), and the same villages are often both to their excavators. A stand-in says it is one.
 */
export const LIFEWAY_KIN: Partial<Record<LifewayWord, LifewayWord[]>> = { 'shifting-cultivators': ['farmers'], farmers: ['shifting-cultivators'] };

/** What is wrong with a `lifeway` claim's value: a list of one or more of the ways of life, each once. */
export function lifewayProblems(v: unknown): string[] {
  const words = Object.keys(LIFEWAY_WORDS);
  if (!Array.isArray(v) || !v.length) return [`a lifeway is a list of one or more of ${words.join(', ')}`];
  const out: string[] = [];
  for (const x of v) if (typeof x !== 'string' || !Object.hasOwn(LIFEWAY_WORDS, x)) out.push(`"${String(x)}" is not a way of life: one of ${words.join(', ')}`);
  if (new Set(v).size !== v.length) out.push('a lifeway names each way of life once');
  return out;
}

/** Whom a tradition housed, in words, for a panel: "foragers", "farmers and townspeople". */
export function lifewayText(v: LifewayWord[]): string {
  const words = v.map((w) => w.replace('-', ' '));
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? '');
}

/**
 * How many of the people a tradition could house lived in its houses, where its `prevalence` claim says they were not
 * all of them: a word, as sources say that a house was rare or common far more often than they count. The part of the
 * settlements each word is drawn for is the settlement generator's (its params.prevalence), not a fact.
 */
export const PREVALENCE_WORDS = ['few', 'some', 'most'] as const;
export type PrevalenceWord = (typeof PREVALENCE_WORDS)[number];
/** The part of a region's settlements of a way of life each word is drawn for, of one. */
export type Prevalence = Record<PrevalenceWord, number>;

/** The parts the settlement generator's parameters give each word; none, where they give none. */
export function prevalenceOf(params: Record<string, unknown> | undefined): Prevalence {
  const given = (params?.prevalence ?? {}) as Partial<Prevalence>;
  return { few: given.few ?? 0, some: given.some ?? 0, most: given.most ?? 0 };
}

type Words<T extends Record<string, object>> = { [K in keyof T]?: keyof T[K] & string };

/** A dwelling as a claim states it: whichever parameters are known. Lengths in metres. */
export interface DwellingSpec extends Words<typeof DWELLING_WORDS> {
  /** across a round house, or the width and length of another */
  diameter?: Span;
  width?: Span;
  length?: Span;
  /** from the floor to the eaves, and to the top of the roof */
  wall_height?: Span;
  height?: Span;
  storeys?: Span;
  rooms?: Span;
  /** how far its floor stood above the ground, raised, on a platform or on stilts; or below it, sunken */
  floor_height?: Span;
  /** how steeply its roof sloped, in degrees from the level */
  pitch?: Span;
  /** whether its rooms stand around an open court */
  court?: boolean;
  /** whether a porch stood out before its door */
  porch?: boolean;
  /** whether a veranda or an open gallery ran under its eaves */
  veranda?: boolean;
  /** whether animals were stalled under its roof, at one end */
  byre?: boolean;
}

/** How the houses stood together. */
export interface SettlementSpec extends Words<typeof SETTLEMENT_WORDS> {
  /** houses in one settlement */
  houses?: Span;
  /** metres from one house to the next */
  spacing?: Span;
  /** people in one house */
  household?: Span;
  /** whether open ground lay at its middle: a green, a dance ground, a plaza */
  plaza?: boolean;
}

/** One thing a household or a settlement had besides its houses (OUTBUILDING_WORDS), in the words and sizes of a dwelling. */
export interface OutbuildingSpec extends DwellingSpec {
  use: OutbuildingUse;
  /** whose it was: a household's, by its house; or the settlement's */
  per: keyof typeof OUTBUILDING_WORDS.per;
  /** how many to a household, or in a settlement; less than one where some households had one */
  count?: Span;
  /** what a pen was made of */
  enclosure?: EnclosureWord;
}

/** The fields around them. Plots in hectares. */
export interface FieldSpec extends Words<typeof FIELD_WORDS> {
  plot?: Span;
}

/** A town's layout. Lengths in metres. */
export interface TownSpec extends Words<typeof TOWN_WORDS> {
  /** the side of a block between streets */
  block?: Span;
  /** how wide a street was, and a main street */
  street?: Span;
  main_street?: Span;
  /** the wall: how high and how thick it stood, and how many gates it had */
  wall_height?: Span;
  wall_thickness?: Span;
  gates?: Span;
  /** whether a ditch or a moat ran outside the wall */
  moat?: boolean;
  /** whether an open place, a square or a market, lay at its middle */
  square?: boolean;
  /**
   * which way its grid or its main street ran: the bearing of the axis, in degrees east of north, from more than 0 to 180
   * (an axis has two ends, so 15.5 and 195.5 are one; a grid of north and east is 90, or 180)
   */
  orientation?: Span;
}

const DWELLING_NUMBERS = ['diameter', 'width', 'length', 'wall_height', 'height', 'storeys', 'rooms', 'floor_height', 'pitch'] as const;
const DWELLING_FLAGS = ['court', 'porch', 'veranda', 'byre'] as const;
const SETTLEMENT_NUMBERS = ['houses', 'spacing', 'household'] as const;
const FIELD_NUMBERS = ['plot'] as const;
const TOWN_NUMBERS = ['block', 'street', 'main_street', 'wall_height', 'wall_thickness', 'gates', 'orientation'] as const;

/** What is wrong with a span: a positive number, or { lo, hi } of them with lo ≤ hi. */
export function spanProblem(v: unknown): string | undefined {
  const pos = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0;
  if (pos(v)) return undefined;
  const r = v as { lo?: unknown; hi?: unknown } | null;
  if (r && typeof r === 'object' && Object.keys(r).length === 2 && pos(r.lo) && pos(r.hi) && (r.lo as number) <= (r.hi as number)) return undefined;
  return 'a positive number, or { lo, hi } of them';
}

function problemsOf(v: unknown, what: string, words: Record<string, Record<string, string>>, numbers: readonly string[], flags: readonly string[] = []): string[] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [`a ${what} is a mapping of its parameters`];
  const out: string[] = [];
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length) out.push(`a ${what} says something`);
  for (const [k, x] of entries) {
    if (flags.includes(k)) {
      if (typeof x !== 'boolean') out.push(`${k} is true or false`);
      continue;
    }
    if (Object.hasOwn(words, k)) {
      if (typeof x !== 'string' || !Object.hasOwn(words[k], x)) out.push(`${k} is one of ${Object.keys(words[k]).join(', ')}`);
      continue;
    }
    if (numbers.includes(k)) {
      const p = spanProblem(x);
      if (p) out.push(`${k} is ${p}`);
      continue;
    }
    out.push(`a ${what} has no "${k}": it may have ${[...Object.keys(words), ...numbers, ...flags].join(', ')}`);
  }
  return out;
}

export const dwellingProblems = (v: unknown) => {
  const out = problemsOf(v, 'dwelling', DWELLING_WORDS, DWELLING_NUMBERS, DWELLING_FLAGS);
  const pitch = (v as { pitch?: Span } | null)?.pitch;
  if (pitch !== undefined && !spanProblem(pitch) && (typeof pitch === 'number' ? pitch : pitch.hi) >= 90) out.push('pitch is in degrees from the level, less than 90');
  return out;
};
export const settlementProblems = (v: unknown) => problemsOf(v, 'settlement form', SETTLEMENT_WORDS, SETTLEMENT_NUMBERS, ['plaza']);

/** What is wrong with an `outbuildings` claim's value: a list of one or more, each with its use and whose it was. */
export function outbuildingProblems(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length) return ['outbuildings are a list of one or more, each a mapping with its use and whose it was'];
  const out: string[] = [];
  const words = { ...DWELLING_WORDS, ...OUTBUILDING_WORDS, enclosure: ENCLOSURE_WORDS };
  v.forEach((x, i) => {
    const at = `outbuilding ${i + 1}`;
    for (const p of problemsOf(x, 'outbuilding', words, [...DWELLING_NUMBERS, 'count'], DWELLING_FLAGS)) out.push(`${at}: ${p}`);
    const r = x as { use?: unknown; per?: unknown; pitch?: Span } | null;
    if (!r || typeof r !== 'object') return;
    if (r.pitch !== undefined && !spanProblem(r.pitch) && (typeof r.pitch === 'number' ? r.pitch : r.pitch.hi) >= 90) out.push(`${at}: pitch is in degrees from the level, less than 90`);
    if (r.use === undefined) out.push(`${at}: it says its use, one of ${Object.keys(OUTBUILDING_WORDS.use).join(', ')}`);
    if (r.per === undefined) out.push(`${at}: it says whose it was (per), one of ${Object.keys(OUTBUILDING_WORDS.per).join(', ')}`);
  });
  return out;
}
export const fieldProblems = (v: unknown) => problemsOf(v, 'field system', FIELD_WORDS, FIELD_NUMBERS);
export const townProblems = (v: unknown) => problemsOf(v, 'town form', TOWN_WORDS, TOWN_NUMBERS, ['moat', 'square']);

/** Where each inherited parameter came from: the tradition whose claim gave it. */
export type From = Record<string, string>;

/** A tradition as the build compiles it: what it says, merged down from the traditions it is a member of. */
export interface Tradition {
  id: string;
  label: string;
  /** the tradition it is a member of, if any, and how many above it */
  parent?: string;
  depth: number;
  /** the regions of the dataset its extent names */
  regions: number[];
  /** when it holds, on the axis: [start, end]; an end it does not give is the present */
  span: [number, number];
  /** whom it housed: its own `lifeway` claim, or its nearest ancestor's; empty where neither says, and then it houses no one */
  lifeways: LifewayWord[];
  /** how many of them lived so, where its own `prevalence` claim says they were not all */
  prevalence?: PrevalenceWord;
  dwelling: DwellingSpec;
  settlement: SettlementSpec;
  fields: FieldSpec;
  /** how its towns were laid out, where it housed townspeople and says; and when, where its claim holds for part of its span */
  town: TownSpec;
  townSpan?: [number, number];
  /** what its households and settlements had besides their houses: its own list, whole, or its nearest ancestor's that has one */
  outbuildings?: OutbuildingSpec[];
  /**
   * which tradition gave each parameter: `dwelling.walls` → its id; `lifeway`, whose claim says whom it housed; and
   * `outbuildings`, whose list they are
   */
  from: From;
  /** whether it says anything of the dwelling itself, rather than inheriting it all */
  own: boolean;
}

/** A tradition's own claims, before inheritance. */
export interface TraditionInput {
  id: string;
  label: string;
  parent?: string;
  regions: number[];
  span: [number, number];
  lifeways?: LifewayWord[];
  prevalence?: PrevalenceWord;
  dwelling?: DwellingSpec;
  settlement?: SettlementSpec;
  fields?: FieldSpec;
  town?: TownSpec;
  /** when its town form held, where the claim says: [from, to] on the axis */
  townSpan?: [number, number];
  outbuildings?: OutbuildingSpec[];
}

/**
 * Each tradition with what it inherits: a parameter it does not state is its nearest ancestor's that does. A
 * tradition with no regions of its own takes its parent's. A cycle, or a parent nobody wrote, ends the walk.
 */
export function compileTraditions(inputs: TraditionInput[]): Tradition[] {
  const byId = new Map(inputs.map((t) => [t.id, t]));
  const done = new Map<string, Tradition>();
  const visit = (t: TraditionInput, seen: Set<string>): Tradition => {
    const have = done.get(t.id);
    if (have) return have;
    const up = t.parent && byId.has(t.parent) && !seen.has(t.parent) ? visit(byId.get(t.parent)!, new Set([...seen, t.id])) : undefined;
    const from: From = { ...(up?.from ?? {}) };
    const merge = <T extends object>(mine: T | undefined, theirs: T | undefined, prefix: string): T => {
      const out = { ...(theirs ?? {}) } as Record<string, unknown>;
      for (const [k, v] of Object.entries(mine ?? {})) {
        out[k] = v;
        from[`${prefix}.${k}`] = t.id;
      }
      return out as T;
    };
    // Whom it housed is its own to say, whole: a member that says so does not add to its parent's.
    const own = t.lifeways?.length ? [...t.lifeways] : undefined;
    if (own) from.lifeway = t.id;
    // What stood by its houses is a list of its own, whole: a member that gives one does not add to its parent's.
    const outbuildings = t.outbuildings?.length ? t.outbuildings : up?.outbuildings;
    if (t.outbuildings?.length) from.outbuildings = t.id;
    const townSpan = t.townSpan ?? up?.townSpan;
    const out: Tradition = {
      id: t.id,
      label: t.label,
      ...(up ? { parent: up.id } : {}),
      depth: up ? up.depth + 1 : 0,
      regions: t.regions.length ? [...t.regions].sort((a, b) => a - b) : up?.regions ?? [],
      span: t.span,
      lifeways: own ?? up?.lifeways ?? [],
      // How many lived so is its own to say: a member is not as rare as the tradition it belongs to.
      ...(t.prevalence ? { prevalence: t.prevalence } : {}),
      dwelling: merge(t.dwelling, up?.dwelling, 'dwelling'),
      settlement: merge(t.settlement, up?.settlement, 'settlement'),
      fields: merge(t.fields, up?.fields, 'fields'),
      town: merge(t.town, up?.town, 'town'),
      ...(townSpan ? { townSpan } : {}),
      ...(outbuildings?.length ? { outbuildings } : {}),
      from,
      own: !!t.dwelling && Object.keys(t.dwelling).length > 0,
    };
    done.set(t.id, out);
    return out;
  };
  return inputs.map((t) => visit(t, new Set())).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The traditions that house a way of life at a region and a time, the most particular first: those whose extent names
 * the region, whose span holds the time and whose `lifeway` names the way of life; the deepest in the tree first, then
 * the one that names the fewest regions, then the latest to start, then by id. A herder's tent is no farmer's house, so
 * a tradition of another way of life in the same region is not among them.
 */
export function traditionsAt(list: Tradition[], region: number | undefined, t: number, lifeway: LifewayWord): Tradition[] {
  if (region === undefined) return [];
  return list
    .filter((x) => t >= x.span[0] && t <= x.span[1] && x.regions.includes(region) && x.lifeways.includes(lifeway) && (x.own || Object.keys(x.dwelling).length > 0))
    .sort((a, b) => b.depth - a.depth || a.regions.length - b.regions.length || b.span[0] - a.span[0] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The most particular tradition that houses a way of life at a region and a time (traditionsAt). Undefined where none does. */
export function traditionAt(list: Tradition[], region: number | undefined, t: number, lifeway: LifewayWord): Tradition | undefined {
  return traditionsAt(list, region, t, lifeway)[0];
}

/** A town's layout in words, for a panel: "streets on a grid, in blocks of 60–100 m, a wall of stone 8 m high, 4 gates". */
export function townText(v: TownSpec): string {
  const parts: string[] = [];
  // A dispersed town is its people's own settlements, each laid out as its tradition's are: the words for a compact
  // town's streets, blocks, square and axis say nothing of how it was drawn (COMPACT_WORDS).
  const compact = v.fabric !== 'dispersed';
  if (!compact) parts.push('its own settlements set apart among their fields');
  if (compact && v.streets) parts.push(v.streets === 'grid' ? 'streets on a grid' : v.streets === 'lanes' ? 'winding lanes' : 'streets of water and of earth');
  if (compact && v.block !== undefined) parts.push(`blocks of ${spanText(v.block, ' m')}`);
  if (compact && v.street !== undefined) parts.push(`streets ${spanText(v.street, ' m')} wide`);
  if (compact && v.main_street !== undefined) parts.push(`main streets ${spanText(v.main_street, ' m')} wide`);
  if (v.wall === 'none') parts.push('no wall');
  else if (!v.wall && (v.wall_height !== undefined || v.wall_thickness !== undefined)) parts.push(`a wall${v.wall_height !== undefined ? ` ${spanText(v.wall_height, ' m')} high` : ''}${v.wall_thickness !== undefined ? `${v.wall_height !== undefined ? ',' : ''} ${spanText(v.wall_thickness, ' m')} thick` : ''}`);
  else if (v.wall) parts.push(`${v.wall === 'earth' ? 'a rampart of earth' : v.wall === 'timber' ? 'a palisade' : `a wall of ${v.wall === 'rammed-earth' ? 'rammed earth' : v.wall}`}${v.wall_height !== undefined ? ` ${spanText(v.wall_height, ' m')} high` : ''}${v.wall_thickness !== undefined ? `, ${spanText(v.wall_thickness, ' m')} thick` : ''}`);
  if (v.gates !== undefined) parts.push(`${spanText(v.gates)} gates`);
  if (v.moat !== undefined) parts.push(v.moat ? 'a moat outside it' : 'no moat');
  if (compact && v.square !== undefined) parts.push(v.square ? 'an open square at its middle' : 'no open square');
  if (compact && v.orientation !== undefined) parts.push(`laid out ${spanText(v.orientation, '°')} east of north`);
  return parts.join(', ');
}

/** The words of a town form that say how a compact town's streets were laid out, and nothing of a dispersed one. */
export const COMPACT_WORDS: ReadonlySet<string> = new Set(['streets', 'block', 'street', 'main_street', 'square', 'orientation']);

// ——— Husbandry ———

/**
 * A way of keeping animals (a `tradition/husbandry` record), as the build compiles it: whose way it was, where and when
 * it held, and which animals its people kept, as taxon records. Like a building tradition, a narrower one is a member
 * of a broader one and takes what it does not say from it.
 */
export interface Husbandry {
  id: string;
  label: string;
  parent?: string;
  depth: number;
  regions: number[];
  span: [number, number];
  lifeways: LifewayWord[];
  /** the animals kept: the ids of their taxon records */
  animals: string[];
  /** which tradition said whose it was, and which animals: `lifeway` and `livestock` → its id */
  from: From;
}

export interface HusbandryInput {
  id: string;
  label: string;
  parent?: string;
  regions: number[];
  span: [number, number];
  lifeways?: LifewayWord[];
  animals?: string[];
}

/** Each husbandry tradition with what it inherits: its regions, whose it was and its animals, each whole, from the nearest that says. */
export function compileHusbandry(inputs: HusbandryInput[]): Husbandry[] {
  const byId = new Map(inputs.map((t) => [t.id, t]));
  const done = new Map<string, Husbandry>();
  const visit = (t: HusbandryInput, seen: Set<string>): Husbandry => {
    const have = done.get(t.id);
    if (have) return have;
    const up = t.parent && byId.has(t.parent) && !seen.has(t.parent) ? visit(byId.get(t.parent)!, new Set([...seen, t.id])) : undefined;
    const from: From = { ...(up?.from ?? {}) };
    if (t.lifeways?.length) from.lifeway = t.id;
    if (t.animals?.length) from.livestock = t.id;
    const out: Husbandry = {
      id: t.id,
      label: t.label,
      ...(up ? { parent: up.id } : {}),
      depth: up ? up.depth + 1 : 0,
      regions: t.regions.length ? [...t.regions].sort((a, b) => a - b) : up?.regions ?? [],
      span: t.span,
      lifeways: t.lifeways?.length ? [...t.lifeways] : up?.lifeways ?? [],
      animals: t.animals?.length ? [...t.animals] : up?.animals ?? [],
      from,
    };
    done.set(t.id, out);
    return out;
  };
  return inputs.map((t) => visit(t, new Set())).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The husbandry of a way of life at a region and a time: the most particular tradition that names the region, holds
 * then and was that way of life's, as a building tradition is chosen (traditionAt). Undefined where none does: no
 * animals are drawn, as nothing says which were kept.
 */
export function husbandryAt(list: Husbandry[], region: number | undefined, t: number, lifeway: LifewayWord): Husbandry | undefined {
  if (region === undefined) return undefined;
  let best: Husbandry | undefined;
  for (const x of list) {
    if (t < x.span[0] || t > x.span[1] || !x.regions.includes(region) || !x.lifeways.includes(lifeway) || !x.animals.length) continue;
    if (!best) {
      best = x;
      continue;
    }
    const better =
      x.depth !== best.depth ? x.depth > best.depth : x.regions.length !== best.regions.length ? x.regions.length < best.regions.length : x.span[0] !== best.span[0] ? x.span[0] > best.span[0] : x.id < best.id;
    if (better) best = x;
  }
  return best;
}

// ——— Agriculture ———

/** The words an agricultural tradition's `crops` entries may take, each with what it means. */
export const CROP_WORDS = {
  kind: {
    millet: 'Foxtail, broomcorn or pearl millet: narrow arching blades topped with heavy nodding seed panicles.',
    wheat: 'Wheat (emmer, einkorn, bread or durum): dense upright culms with bearded ears.',
    barley: 'Barley: dense upright culms with long-awned spikes.',
    oat: 'Oats: upright culms with loose nodding panicles.',
    rye: 'Rye: tall slender small-grain cereal.',
    rice: 'Wet or upland rice: bright green tufted stalks grown in flooded paddies or rainfed plots.',
    sorghum: 'Sorghum: tall cane-like stalks with broad ribbon leaves and heavy terminal panicles.',
    maize: 'Maize: tall jointed stalks with broad arching leaves, tassels and ears.',
    sugarcane: 'Sugarcane: tall dense jointed cane stalks.',
    hemp: 'Hemp: tall upright bast-fibre stalks with palmate foliage.',
    soybean: 'Soybean: low bushy rows of trifoliate leaves.',
    legume: 'Pulses and legumes (beans, peas, lentils, chickpeas, cowpeas): leafy low rows.',
    flax: 'Flax: slender upright stems grown for fibre or linseed.',
    cotton: 'Cotton: woody bushy rows with broad leaves and pale bolls.',
    root: 'Root and tuber crops (potato, yam, taro, cassava, turnip): mounded leafy rows.',
    squash: 'Cucurbits (squash, pumpkin, gourd, melon): broad trailing vines over mounds.',
    vine: 'Grapevines and trellised climbers, trained in ordered rows.',
    mulberry: 'Mulberry groves, pruned small trees in ordered rows for sericulture or fruit.',
    olive: 'Olive groves, silvery-green orchard trees spaced over bare or grassy earth.',
    palm: 'Date or coconut palm groves in ordered rows.',
    orchard: 'Fruit, nut or tea orchards: ordered rows of small trees.',
  },
  season: {
    summer: 'Sown in spring, growing through summer and harvested in late summer or autumn.',
    winter: 'Sown in autumn, overwintering green and ripening for late-spring or early-summer harvest.',
    perennial: 'Standing year-round as trees, vines or perennial canes.',
    'year-round': 'Cropped across most of the year in warm tropical or irrigated climates.',
  },
  share: {
    staple: 'A main staple occupying the largest share of plots.',
    secondary: 'An important field crop grown beside the staple.',
    minor: 'A specialist or subsidiary crop taking a smaller share of plots.',
  },
} as const;

export type CropKind = keyof typeof CROP_WORDS.kind;
export type CropSeason = keyof typeof CROP_WORDS.season;
export type CropShare = keyof typeof CROP_WORDS.share;

/** The seven botanical growth archetypes the renderer and crop generator draw. */
export type CropArchetype = 'millet' | 'cereal' | 'cane' | 'paddy' | 'broadleaf' | 'vine' | 'orchard';

/** One crop named in an agricultural tradition's `crops` claim. */
export interface CropEntry {
  kind: CropKind;
  /** optional display name, e.g. "Foxtail millet" or "Winter wheat" */
  name?: string;
  /** optional taxon record id (`life/taxa/…`) */
  taxon?: string;
  season?: CropSeason;
  share?: CropShare;
}

/** Which botanical archetype draws each crop kind. */
export const CROP_ARCHETYPE_OF: Record<CropKind, CropArchetype> = {
  millet: 'millet',
  wheat: 'cereal',
  barley: 'cereal',
  oat: 'cereal',
  rye: 'cereal',
  rice: 'paddy',
  sorghum: 'cane',
  maize: 'cane',
  sugarcane: 'cane',
  hemp: 'cane',
  soybean: 'broadleaf',
  legume: 'broadleaf',
  flax: 'broadleaf',
  cotton: 'broadleaf',
  root: 'broadleaf',
  squash: 'vine',
  vine: 'vine',
  mulberry: 'orchard',
  olive: 'orchard',
  palm: 'orchard',
  orchard: 'orchard',
};

/** Default display label for each crop kind when an entry gives no custom name. */
export const CROP_LABEL: Record<CropKind, string> = {
  millet: 'Millet',
  wheat: 'Wheat',
  barley: 'Barley',
  oat: 'Oats',
  rye: 'Rye',
  rice: 'Rice',
  sorghum: 'Sorghum',
  maize: 'Maize',
  sugarcane: 'Sugarcane',
  hemp: 'Hemp',
  soybean: 'Soybeans',
  legume: 'Legumes',
  flax: 'Flax',
  cotton: 'Cotton',
  root: 'Root crops',
  squash: 'Squash and gourds',
  vine: 'Grapevines',
  mulberry: 'Mulberry grove',
  olive: 'Olive grove',
  palm: 'Palm grove',
  orchard: 'Orchard',
};

/** Default botanical profile of each archetype: mature height range (m), row spacing, step along row, card width, and linear RGB tones [green, ripe]. */
export const CROP_PROFILE: Record<CropArchetype, { greenH: [number, number]; ripeH: [number, number]; row: number; apart: number; wide: number; green: [[number, number, number], [number, number, number]]; ripe: [[number, number, number], [number, number, number]]; defaultSeason: CropSeason }> = {
  millet: { greenH: [0.55, 1.05], ripeH: [1.05, 1.5], row: 0.65, apart: 0.42, wide: 0.56, green: [[0.11, 0.16, 0.045], [0.16, 0.20, 0.06]], ripe: [[0.38, 0.28, 0.10], [0.30, 0.22, 0.08]], defaultSeason: 'summer' },
  cereal: { greenH: [0.42, 0.85], ripeH: [0.8, 1.2], row: 0.55, apart: 0.38, wide: 0.54, green: [[0.09, 0.15, 0.04], [0.14, 0.19, 0.055]], ripe: [[0.42, 0.32, 0.12], [0.33, 0.25, 0.10]], defaultSeason: 'winter' },
  cane: { greenH: [1.15, 2.05], ripeH: [1.85, 2.7], row: 0.9, apart: 0.55, wide: 0.72, green: [[0.07, 0.14, 0.035], [0.11, 0.18, 0.048]], ripe: [[0.32, 0.26, 0.11], [0.25, 0.20, 0.09]], defaultSeason: 'summer' },
  paddy: { greenH: [0.45, 0.8], ripeH: [0.75, 1.05], row: 0.5, apart: 0.36, wide: 0.48, green: [[0.09, 0.20, 0.04], [0.14, 0.24, 0.055]], ripe: [[0.37, 0.30, 0.10], [0.29, 0.24, 0.08]], defaultSeason: 'summer' },
  broadleaf: { greenH: [0.35, 0.68], ripeH: [0.55, 0.85], row: 0.75, apart: 0.48, wide: 0.58, green: [[0.08, 0.14, 0.038], [0.13, 0.18, 0.052]], ripe: [[0.26, 0.21, 0.09], [0.20, 0.16, 0.075]], defaultSeason: 'summer' },
  vine: { greenH: [0.65, 1.2], ripeH: [0.85, 1.45], row: 1.5, apart: 0.85, wide: 0.8, green: [[0.085, 0.14, 0.04], [0.13, 0.17, 0.052]], ripe: [[0.24, 0.19, 0.075], [0.18, 0.14, 0.06]], defaultSeason: 'perennial' },
  orchard: { greenH: [2.2, 3.8], ripeH: [2.4, 4.0], row: 4.5, apart: 4.5, wide: 2.2, green: [[0.08, 0.13, 0.042], [0.12, 0.16, 0.055]], ripe: [[0.16, 0.16, 0.065], [0.20, 0.15, 0.07]], defaultSeason: 'perennial' },
};

/** Relative plot-selection weight of a crop's share word. */
export const CROP_SHARE_WEIGHT: Record<CropShare, number> = { staple: 3, secondary: 1.5, minor: 0.7 };

/** What is wrong with a `crops` claim's value: a non-empty list of crop entries. */
export function cropProblems(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length) return ['crops are a list of one or more entries, each naming at least a crop kind'];
  const out: string[] = [];
  const allowedKeys = new Set(['kind', 'name', 'taxon', 'season', 'share']);
  v.forEach((x, i) => {
    const at = `crop ${i + 1}`;
    if (!x || typeof x !== 'object' || Array.isArray(x)) {
      out.push(`${at}: a crop entry is a mapping of named parameters`);
      return;
    }
    const r = x as Record<string, unknown>;
    for (const k of Object.keys(r)) if (!allowedKeys.has(k)) out.push(`${at}: unknown crop parameter "${k}"`);
    if (r.kind === undefined) out.push(`${at}: it says its kind, one of ${Object.keys(CROP_WORDS.kind).join(', ')}`);
    else if (typeof r.kind !== 'string' || !Object.hasOwn(CROP_WORDS.kind, r.kind)) out.push(`${at}: kind "${String(r.kind)}" is not one of ${Object.keys(CROP_WORDS.kind).join(', ')}`);
    if (r.season !== undefined && (typeof r.season !== 'string' || !Object.hasOwn(CROP_WORDS.season, r.season))) out.push(`${at}: season "${String(r.season)}" is not one of ${Object.keys(CROP_WORDS.season).join(', ')}`);
    if (r.share !== undefined && (typeof r.share !== 'string' || !Object.hasOwn(CROP_WORDS.share, r.share))) out.push(`${at}: share "${String(r.share)}" is not one of ${Object.keys(CROP_WORDS.share).join(', ')}`);
    if (r.name !== undefined && (typeof r.name !== 'string' || !r.name.trim())) out.push(`${at}: name must be a non-empty string`);
    if (r.taxon !== undefined && (typeof r.taxon !== 'string' || !r.taxon.trim())) out.push(`${at}: taxon must be a taxon record id`);
  });
  return out;
}

/** A crop list in words, for a panel. */
export const cropsText = (v: CropEntry[]): string =>
  v.map((c) => `${c.name ?? CROP_LABEL[c.kind]}${c.season && c.season !== CROP_PROFILE[CROP_ARCHETYPE_OF[c.kind]].defaultSeason ? ` (${c.season})` : ''}`).join(', ');

/**
 * A way of farming crops (a `tradition/agriculture` record), as the build compiles it: whose way it was, where and
 * when it held, which crops its people grew, and optionally how their fields were laid out.
 */
export interface Agriculture {
  id: string;
  label: string;
  parent?: string;
  depth: number;
  regions: number[];
  span: [number, number];
  lifeways: LifewayWord[];
  crops: CropEntry[];
  fields: FieldSpec;
  from: From;
}

export interface AgricultureInput {
  id: string;
  label: string;
  parent?: string;
  regions: number[];
  span: [number, number];
  lifeways?: LifewayWord[];
  crops?: CropEntry[];
  fields?: FieldSpec;
}

/** Each agricultural tradition with what it inherits: regions, lifeways, crops (whole), and field system (merged). */
export function compileAgriculture(inputs: AgricultureInput[]): Agriculture[] {
  const byId = new Map(inputs.map((t) => [t.id, t]));
  const done = new Map<string, Agriculture>();
  const visit = (t: AgricultureInput, seen: Set<string>): Agriculture => {
    const have = done.get(t.id);
    if (have) return have;
    const up = t.parent && byId.has(t.parent) && !seen.has(t.parent) ? visit(byId.get(t.parent)!, new Set([...seen, t.id])) : undefined;
    const from: From = { ...(up?.from ?? {}) };
    if (t.lifeways?.length) from.lifeway = t.id;
    if (t.crops?.length) from.crops = t.id;
    const fields = { ...(up?.fields ?? {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(t.fields ?? {})) {
      fields[k] = v;
      from[`fields.${k}`] = t.id;
    }
    const out: Agriculture = {
      id: t.id,
      label: t.label,
      ...(up ? { parent: up.id } : {}),
      depth: up ? up.depth + 1 : 0,
      regions: t.regions.length ? [...t.regions].sort((a, b) => a - b) : up?.regions ?? [],
      span: t.span,
      lifeways: t.lifeways?.length ? [...t.lifeways] : up?.lifeways ?? [],
      crops: t.crops?.length ? t.crops.map((c) => ({ ...c })) : up?.crops ?? [],
      fields: fields as FieldSpec,
      from,
    };
    done.set(t.id, out);
    return out;
  };
  return inputs.map((t) => visit(t, new Set())).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The agricultural tradition of a way of life at a region and time: the most particular tradition that names the
 * region, holds then, and was that way of life's (falling back to kin lifeways, e.g. farmers ↔ shifting-cultivators,
 * or farmers for townspeople's surrounding fields).
 */
export function agricultureAt(list: Agriculture[], region: number | undefined, t: number, lifeway: LifewayWord): Agriculture | undefined {
  if (region === undefined) return undefined;
  const tries: LifewayWord[] = lifeway === 'townspeople' ? ['townspeople', 'farmers'] : [lifeway, ...(LIFEWAY_KIN[lifeway] ?? [])];
  for (const way of tries) {
    let best: Agriculture | undefined;
    for (const x of list) {
      if (t < x.span[0] || t > x.span[1] || !x.regions.includes(region) || !x.lifeways.includes(way) || !x.crops.length) continue;
      if (!best) {
        best = x;
        continue;
      }
      const better =
        x.depth !== best.depth ? x.depth > best.depth : x.regions.length !== best.regions.length ? x.regions.length < best.regions.length : x.span[0] !== best.span[0] ? x.span[0] > best.span[0] : x.id < best.id;
      if (better) best = x;
    }
    if (best) return best;
  }
  return undefined;
}

/**
 * Climate- and land-use-aware generic crops drawn where no agricultural tradition record holds: plainly marked generic
 * in inspection. Never attributed to any historical record.
 */
export function genericCropsFor(use: string, climate: string): CropEntry[] {
  if (use === 'rice') return [{ kind: 'rice', name: 'Wetland rice', season: 'summer', share: 'staple' }, { kind: 'legume', name: 'Field legumes', season: 'summer', share: 'minor' }];
  if (use === 'swidden') return [{ kind: 'root', name: 'Swidden roots', season: 'year-round', share: 'staple' }, { kind: 'millet', name: 'Dryland grain', season: 'summer', share: 'secondary' }];
  if (climate === 'rainforest') return [{ kind: 'root', name: 'Tropical tubers', season: 'year-round', share: 'staple' }, { kind: 'rice', name: 'Upland grain', season: 'year-round', share: 'secondary' }];
  if (climate === 'savanna' || climate === 'desert' || climate === 'steppe') {
    return [
      { kind: 'millet', name: 'Dryland millet', season: 'summer', share: 'staple' },
      { kind: 'wheat', name: 'Winter grain', season: 'winter', share: 'secondary' },
      { kind: 'legume', name: 'Dryland pulses', season: 'summer', share: 'minor' },
    ];
  }
  return [
    { kind: 'wheat', name: 'Small-grain cereal', season: 'winter', share: 'staple' },
    { kind: 'barley', name: 'Spring grain', season: 'summer', share: 'secondary' },
    { kind: 'legume', name: 'Field legumes', season: 'summer', share: 'minor' },
  ];
}

/** A tradition that draws houses of a way of life at a region and a time: whose it was written for, where that is a way of life kin to theirs, and the part of their settlements it draws. */
export interface Housed {
  tradition: Tradition;
  /** the way of life it was written for, where that is another, kin to theirs: its house stands in */
  kin?: LifewayWord;
  /** the part of the region's settlements of that way of life drawn in its house, of one */
  share: number;
}

/**
 * The traditions that draw the houses of a way of life at a region and a time, each with its part of them. The ones
 * written for that way of life come first, then those written for a way of life kin to it (LIFEWAY_KIN), which stand
 * in. Of each, the ones that say how many lived so (`prevalence`) take their parts first, as the generator's parameters
 * size the word, the most particular first (traditionsAt); then the most particular of those that do not say takes
 * everyone left. What is left when all have taken their parts is drawn in the generator's generic house.
 */
export function traditionsFor(list: Tradition[], region: number | undefined, t: number, lifeway: LifewayWord, parts: Prevalence): Housed[] {
  const out: Housed[] = [];
  let left = 1;
  for (const way of [lifeway, ...(LIFEWAY_KIN[lifeway] ?? [])]) {
    const at = traditionsAt(list, region, t, way);
    for (const x of [...at.filter((y) => y.prevalence), ...at.filter((y) => !y.prevalence)]) {
      if (left <= 1e-9) return out;
      // One written for both ways of life is theirs, and does not stand in a second time.
      if (out.some((o) => o.tradition === x)) continue;
      const share = Math.min(left, x.prevalence ? parts[x.prevalence] : 1);
      if (!(share > 0)) continue;
      out.push({ tradition: x, ...(way !== lifeway ? { kin: way } : {}), share });
      left -= share;
    }
  }
  return out;
}

/**
 * The tradition that draws the houses of a way of life at a region and a time: the one written for it, or where none
 * is, one written for a way of life kin to it, with whose it is (traditionsFor). Where several share the region's
 * people, the one most of them lived in; or, given a number in [0, 1) that is a settlement's own, the one that
 * settlement falls to, each taking its part of that range in turn. Undefined where none holds, or the number falls
 * past them all: the generator's generic dwelling stands in.
 */
export function traditionFor(list: Tradition[], region: number | undefined, t: number, lifeway: LifewayWord, parts: Prevalence, u?: number): Housed | undefined {
  const found = traditionsFor(list, region, t, lifeway, parts);
  if (u === undefined) return found.reduce<Housed | undefined>((best, x) => (!best || x.share > best.share ? x : best), undefined);
  let upTo = 0;
  for (const x of found) {
    upTo += x.share;
    if (u < upTo) return x;
  }
  return undefined;
}

/** A span's middle, or the number itself. */
export const mid = (s: Span | undefined, or: number): number => (s === undefined ? or : typeof s === 'number' ? s : (s.lo + s.hi) / 2);

/** A value within a span by a number in [0, 1): evenly in proportion, as a range of sizes is mostly near its small end. */
export function within(s: Span | undefined, or: number, u: number): number {
  if (s === undefined) return or;
  if (typeof s === 'number') return s;
  return s.lo * Math.pow(s.hi / s.lo, u);
}

const spanText = (s: Span, unit = '') => (typeof s === 'number' ? `${s}${unit}` : `${s.lo}–${s.hi}${unit}`);

/** How each word of some parameters is said in a panel, where the word alone would not read. */
const SAID: Record<string, Record<string, string>> = {
  entrance: { end: 'its door in an end', side: 'its door in a long side', roof: 'entered through the roof', tunnel: 'entered by a low passage' },
  windows: { none: 'no windows', small: 'small windows', large: 'large windows' },
  smoke: { none: 'no opening for the smoke', hole: 'a smoke hole in the roof', gable: 'smoke openings under the ridge', chimney: 'a chimney' },
  finish: { plain: 'walls left plain', mud: 'plastered with mud', lime: 'limewashed', painted: 'painted' },
  layout: { ring: 'in a ring', rows: 'in rows' },
  enclosure: { none: 'open', fence: 'within a fence', hedge: 'within a hedge', palisade: 'within a palisade', bank: 'within a bank', ditch: 'within a ditch', wall: 'within a wall' },
  yard: { none: 'yards open', fence: 'yards fenced', hedge: 'yards hedged', palisade: 'yards within palisades', bank: 'yards within banks', ditch: 'yards ditched', wall: 'yards walled' },
};
/** What a flag says, set and unset. */
const FLAG_SAID: Record<string, [string, string]> = {
  court: ['around a court', 'without a court'],
  porch: ['with a porch', 'without a porch'],
  veranda: ['with a veranda', 'without a veranda'],
  byre: ['animals under its roof', 'no animals under its roof'],
  plaza: ['round open ground at its middle', 'with no open ground at its middle'],
};

/** A dwelling, settlement form or field system in words, for a panel: its parameters as a source would say them. */
export function specText(v: DwellingSpec | SettlementSpec | FieldSpec): string {
  const parts: string[] = [];
  const r = v as Record<string, unknown>;
  const unit: Record<string, string> = { diameter: ' m across', width: ' m wide', length: ' m long', wall_height: ' m to the eaves', height: ' m high', storeys: ' storeys', rooms: ' rooms', houses: ' houses', spacing: ' m apart', household: ' people to a house', plot: ' ha a plot' };
  const word: Record<string, string> = { plan: 'plan', walls: 'walls of', roof: 'roof', roof_material: 'roofed with', floor: 'floor', pattern: '', kind: '', bounds: 'divided by' };
  for (const [k, x] of Object.entries(r)) {
    if (FLAG_SAID[k]) parts.push(FLAG_SAID[k][x ? 0 : 1]);
    else if (k === 'faces') parts.push(`its entrance to the ${String(x)}`);
    else if (typeof x === 'string' && SAID[k]) parts.push(SAID[k][x] ?? x);
    else if (typeof x === 'string') parts.push(k === 'plan' || k === 'roof' || k === 'floor' ? `${x} ${word[k]}` : word[k] ? `${word[k]} ${x}` : x);
    else if (k === 'floor_height' && x !== undefined) parts.push(`its floor ${spanText(x as Span, ' m')} ${r.floor === 'sunken' ? 'below' : 'above'} the ground`);
    else if (k === 'pitch' && x !== undefined) parts.push(`its roof pitched at ${spanText(x as Span, '°')}`);
    else if (x !== undefined) parts.push(spanText(x as Span, unit[k] ?? ''));
  }
  return parts.join(', ');
}

/** What each outbuilding is called, for a panel and a label. */
export const OUTBUILDING_LABEL: Record<OutbuildingUse, string> = {
  granary: 'a granary',
  store: 'a storehouse',
  byre: 'a byre',
  pen: 'a pen',
  kitchen: 'a cookhouse',
  oven: 'an oven',
  well: 'a well',
  pond: 'a pond',
  rack: 'a drying rack',
  stack: 'a stack',
  'threshing-floor': 'a threshing floor',
  workshop: 'a work hut',
  bath: 'a bath house',
  shrine: 'a shrine',
  hall: 'a meeting house',
  pole: 'a pole',
};

/** One outbuilding in words: "a granary by a house (round plan, floor on stilts)". */
export function outbuildingText(o: OutbuildingSpec): string {
  const { use, per, count, enclosure, ...rest } = o;
  const what = [enclosure && enclosure !== 'none' ? `of ${enclosure === 'wall' ? 'walling' : enclosure === 'bank' ? 'a bank' : enclosure === 'ditch' ? 'a ditch' : enclosure === 'fence' ? 'fencing' : enclosure === 'hedge' ? 'hedging' : 'posts'}` : '', specText(rest as DwellingSpec)].filter(Boolean).join(', ');
  const whose = per === 'house' ? (count !== undefined ? `, ${spanText(count)} to a household` : ' by a house') : count !== undefined ? `, ${spanText(count)} in a settlement` : ' of the settlement';
  return `${OUTBUILDING_LABEL[use] ?? String(use)}${whose}${what ? ` (${what})` : ''}`;
}

/** A tradition's outbuildings in words, for a panel. */
export const outbuildingsText = (v: OutbuildingSpec[]): string => v.map(outbuildingText).join('; ');
