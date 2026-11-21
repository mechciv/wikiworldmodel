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
  },
  walls: {
    mudbrick: 'Sun-dried mud bricks.',
    'fired-brick': 'Bricks fired in a kiln.',
    stone: 'Stone, dry or set in mortar or mud.',
    timber: 'Logs, planks or a timber frame filled with timber.',
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
  },
  roof_material: {
    earth: 'Earth or mud over beams and matting.',
    thatch: 'Thatch of straw, grass, reeds or leaves.',
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
} as const;

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
} as const;

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
  /** whether its rooms stand around an open court */
  court?: boolean;
}

/** How the houses stood together. */
export interface SettlementSpec extends Words<typeof SETTLEMENT_WORDS> {
  /** houses in one settlement */
  houses?: Span;
  /** metres from one house to the next */
  spacing?: Span;
  /** people in one house */
  household?: Span;
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
}

const DWELLING_NUMBERS = ['diameter', 'width', 'length', 'wall_height', 'height', 'storeys', 'rooms'] as const;
const SETTLEMENT_NUMBERS = ['houses', 'spacing', 'household'] as const;
const FIELD_NUMBERS = ['plot'] as const;
const TOWN_NUMBERS = ['block', 'street', 'main_street', 'wall_height', 'wall_thickness', 'gates'] as const;

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
    if (words[k]) {
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

export const dwellingProblems = (v: unknown) => problemsOf(v, 'dwelling', DWELLING_WORDS, DWELLING_NUMBERS, ['court']);
export const settlementProblems = (v: unknown) => problemsOf(v, 'settlement form', SETTLEMENT_WORDS, SETTLEMENT_NUMBERS);
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
  /** which tradition gave each parameter: `dwelling.walls` → its id; and `lifeway`, whose claim says whom it housed */
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
      // A town form that holds for part of a span is its own claim's; a member that says none keeps its parent's.
      ...((t.town ? t.townSpan : up?.townSpan) ? { townSpan: t.town ? t.townSpan : up!.townSpan } : {}),
      from,
      own: !!t.dwelling && Object.keys(t.dwelling).length > 0,
    };
    done.set(t.id, out);
    return out;
  };
  return inputs.map((t) => visit(t, new Set())).sort((a, b) => (a.id < b.id ? -1 : 1));
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
  if (v.streets) parts.push(v.streets === 'grid' ? 'streets on a grid' : v.streets === 'lanes' ? 'winding lanes' : 'streets of water and of earth');
  if (v.block !== undefined) parts.push(`blocks of ${spanText(v.block, ' m')}`);
  if (v.street !== undefined) parts.push(`streets ${spanText(v.street, ' m')} wide`);
  if (v.main_street !== undefined) parts.push(`main streets ${spanText(v.main_street, ' m')} wide`);
  if (v.wall === 'none') parts.push('no wall');
  else if (!v.wall && (v.wall_height !== undefined || v.wall_thickness !== undefined)) parts.push(`a wall${v.wall_height !== undefined ? ` ${spanText(v.wall_height, ' m')} high` : ''}${v.wall_thickness !== undefined ? `${v.wall_height !== undefined ? ',' : ''} ${spanText(v.wall_thickness, ' m')} thick` : ''}`);
  else if (v.wall) parts.push(`${v.wall === 'earth' ? 'a rampart of earth' : v.wall === 'timber' ? 'a palisade' : `a wall of ${v.wall === 'rammed-earth' ? 'rammed earth' : v.wall}`}${v.wall_height !== undefined ? ` ${spanText(v.wall_height, ' m')} high` : ''}${v.wall_thickness !== undefined ? `, ${spanText(v.wall_thickness, ' m')} thick` : ''}`);
  if (v.gates !== undefined) parts.push(`${spanText(v.gates)} gates`);
  if (v.moat !== undefined) parts.push(v.moat ? 'a moat outside it' : 'no moat');
  if (v.square !== undefined) parts.push(v.square ? 'an open square at its middle' : 'no open square');
  return parts.join(', ');
}

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
  return inputs.map((t) => visit(t, new Set())).sort((a, b) => (a.id < b.id ? -1 : 1));
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

/** A dwelling, settlement form or field system in words, for a panel: its parameters as a source would say them. */
export function specText(v: DwellingSpec | SettlementSpec | FieldSpec): string {
  const parts: string[] = [];
  const r = v as Record<string, unknown>;
  const unit: Record<string, string> = { diameter: ' m across', width: ' m wide', length: ' m long', wall_height: ' m to the eaves', height: ' m high', storeys: ' storeys', rooms: ' rooms', houses: ' houses', spacing: ' m apart', household: ' people to a house', plot: ' ha a plot' };
  const word: Record<string, string> = { plan: 'plan', walls: 'walls of', roof: 'roof', roof_material: 'roofed with', floor: 'floor', pattern: '', kind: '', bounds: 'divided by' };
  for (const [k, x] of Object.entries(r)) {
    if (k === 'court') parts.push(x ? 'around a court' : 'without a court');
    else if (typeof x === 'string') parts.push(k === 'plan' || k === 'roof' || k === 'floor' ? `${x} ${word[k]}` : word[k] ? `${word[k]} ${x}` : x);
    else if (x !== undefined) parts.push(spanText(x as Span, unit[k] ?? ''));
  }
  return parts.join(', ');
}
