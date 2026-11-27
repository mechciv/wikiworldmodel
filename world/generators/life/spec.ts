// What a living scene is made from: a spec, put together the same way in the build and in the browser from
// the atlas's list for a place, the land and the climate there, and the forms. A taxon whose size is a clade's
// range takes a size within it, by its own number, so that it is always the same size.
import { TIER, type AtlasEntry, type AtlasIndex, type AtlasSize } from '../../../core/atlas.ts';
import { climateClass, CLIMATE_LABEL, reduceMonths, type ClimateNode, type ClimateRule } from '../../../core/climate.ts';
import { warmestMonth, type Months } from '../../../core/months.ts';
import type { WaterParams } from '../../../core/water.ts';
import type { Form } from '../../../core/form.ts';
import { arcBetween, turnOf } from '../../../core/relief.ts';
import type { LivingTaxon, ReliefPatch, ReliefShape, SceneCover, SceneParts, SceneSpec, SceneTier } from '../../../core/scene.ts';
import { firstGround, firstRock, type SceneBedrock, type SceneSubstrate } from '../../../core/substrate.ts';
import { fromMa, toMa } from '../../../core/time.ts';
import type { FeatureTime } from '../../../core/tileset.ts';
import { dcos, hash2, hashString, PI } from '../city/math.ts';

/** A cube root by Newton's method, with nothing that could differ between machines. */
export function cubeRoot(x: number): number {
  if (x <= 0) return 0;
  let r = x > 1 ? x / 3 : 1;
  for (let i = 0; i < 40; i++) r = (2 * r + x / (r * r)) / 3;
  return r;
}

const round3 = (x: number) => Math.floor(x * 1000 + 0.5) / 1000;

/** To three figures, however small: a mite is not nothing. */
const figures3 = (x: number) => {
  let k = 1;
  while (x * k < 100) k *= 10;
  while (x * k >= 1000) k /= 10;
  return Math.floor(x * k + 0.5) / k;
};

/**
 * A size within what a claim says: a measured one is itself, and a range takes a place in it by its number. The place
 * is even in proportion, not in metres, as most of a clade is near its small end: a tenth of the way along a range
 * from 1 mm to 1 m is 2 mm, not 10 cm. Square roots only, for the bytes to agree.
 */
export function sizeWithin(s: AtlasSize | undefined, salt: number): number | undefined {
  if (!s) return undefined;
  if (s.lo === s.hi) return s.lo;
  let u = hash2(salt, 17, 0x51ed2);
  let r = s.hi / s.lo;
  let out = s.lo;
  let bit = 0.5;
  for (let k = 0; k < 14; k++) {
    r = Math.sqrt(r);
    if (u >= bit) {
      out *= r;
      u -= bit;
    }
    bit /= 2;
  }
  return figures3(out);
}

const timeOf = (older: number, younger: number): FeatureTime => {
  const est = (t: number) => ({ best: t, lo: t, hi: t, derived: true });
  return { start: est(fromMa(older)), end: est(fromMa(younger)), instant: false };
};

const TIER_NAME: Record<number, SceneTier> = { [TIER.here]: 'here', [TIER.region]: 'region', [TIER.standin]: 'standin' };

/** One entry of the atlas's list, as a taxon of a scene. */
export function livingTaxon(e: AtlasEntry, forms: Record<string, Form>): LivingTaxon | undefined {
  const t = e.taxon;
  const form = forms[t.form];
  if (!form) return undefined;
  const animal = form.kind === 'animal';
  const massClaim = sizeWithin(t.mass, t.no);
  let length = animal ? sizeWithin(t.length, t.no) : undefined;
  let fromMass = false;
  if (animal && length === undefined && massClaim !== undefined) {
    length = round3(cubeRoot(massClaim / (form.mass_length ?? 20)));
    fromMass = true;
  }
  const height = animal ? undefined : sizeWithin(t.height, t.no);
  if (animal ? length === undefined : height === undefined && form.behave?.layer !== 'float') return undefined;
  const claimedHip = animal ? t.hip && t.hip.own ? sizeWithin(t.hip, t.no) : undefined : undefined;
  const size = animal ? t.length ?? t.mass : t.height;
  return {
    id: t.id ?? `txn:${t.no}`,
    label: t.label,
    form: t.form,
    form_from: t.form_from,
    form_label: t.form_label,
    own: t.own,
    tier: TIER_NAME[e.tier],
    km: e.km,
    weight: e.weight / 255,
    rows: t.rows,
    ...(t.posture ? { posture: t.posture } : {}),
    biped: t.posture === 'biped',
    ...(length !== undefined ? { length } : {}),
    ...(claimedHip !== undefined ? { hip: claimedHip } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(massClaim !== undefined ? { mass: massClaim } : {}),
    ...(size && !size.own ? { size_from: size.from } : {}),
    ...(fromMass ? { fromMass: true } : {}),
    ...(t.diet ? { diet: t.diet } : {}),
    ...(t.habit ? { habit: t.habit } : {}),
    ...(t.climate ? { climate: t.climate } : {}),
    time: timeOf(t.span[0], t.span[1]),
  };
}

/** The lattice a place's scene hangs from: the same place at the same stage is always the same scene. */
export const LATTICE_DEG = 0.1;
export function latticeOf(lat: number, lon: number): { lat: number; lon: number } {
  const row = (Math.floor(lat / LATTICE_DEG) + 0.5) * LATTICE_DEG;
  // About as wide as it is high at any latitude, and a whole number of them around, so the last meets the first.
  const around = Math.max(1, Math.floor((360 / LATTICE_DEG) * dcos((row * PI) / 180)));
  const wide = 360 / around;
  const col = Math.min(around - 1, Math.floor((lon + 180 - 360 * Math.floor((lon + 180) / 360)) / wide));
  return { lat: row, lon: (col + 0.5) * wide - 180 };
}

/** How much of the 1° field a scene wants: enough for its far grid, however far north it is. */
export function reliefBox(lat: number, lon: number): { lat0: number; lat1: number; lon0: number; lon1: number } {
  const dLat = 6;
  const c = dcos((lat * PI) / 180);
  const dLon = Math.min(60, 6 / (c > 0.1 ? c : 0.1));
  return { lat0: Math.min(90, Math.ceil(lat + dLat)), lat1: Math.max(-90, Math.floor(lat - dLat)), lon0: Math.floor(lon - dLon), lon1: Math.ceil(lon + dLon) };
}

/** The patch of the field a scene wants, read from anything that can say a height at every `step` degrees. */
export function reliefPatch(lat: number, lon: number, at: (lat: number, lon: number) => number, isoline: number, step = 1): ReliefPatch {
  const box = reliefBox(lat, lon);
  const nx = Math.round((box.lon1 - box.lon0) / step) + 1;
  const ny = Math.round((box.lat0 - box.lat1) / step) + 1;
  const z = new Array<number>(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = at(box.lat0 - j * step, ((box.lon0 + i * step + 540) % 360) - 180) - isoline;
  return { lat0: box.lat0, lon0: box.lon0, step, nx, ny, z };
}

export interface SpecInput {
  atlas: Pick<AtlasIndex, 'source' | 'title'>;
  bin: { from: number; to: number; slice: number; name: string };
  origin: { lat: number; lon: number };
  list: AtlasEntry[];
  forms: Record<string, Form>;
  relief: ReliefPatch;
  node: ClimateNode;
  rule: ClimateRule;
  climateField: string;
  climateAge: number;
  cover: SceneCover;
  generator: { id: string; version: number; params: Record<string, unknown> };
}

/** A scene's spec for a place the atlas has a list for. Undefined if nothing there can be drawn. */
export function specFor(i: SpecInput): SceneSpec {
  const seed = `life:${i.bin.from}:${i.origin.lat.toFixed(2)}:${i.origin.lon.toFixed(2)}`;
  const taxa: LivingTaxon[] = [];
  const forms: Record<string, Form> = {};
  for (const e of i.list) {
    const t = livingTaxon(e, i.forms);
    if (!t) continue;
    taxa.push(t);
    forms[t.form] = i.forms[t.form];
  }
  const climate = climateClass(i.node, i.rule);
  return {
    format: 'lightworld-scene@2',
    site: { id: `${hashString(seed).toString(36)}`, label: i.bin.name, origin: i.origin, span: [i.bin.from, i.bin.to], slice: i.bin.slice, stage: i.bin.name },
    relief: i.relief,
    biome: { climate, label: CLIMATE_LABEL[climate], field: i.climateField, ageMa: i.climateAge, cover: i.cover, node: i.node },
    taxa,
    omitted: [],
    forms,
    fossils: { source: i.atlas.source, title: i.atlas.title, rows: taxa.reduce((n, t) => n + t.rows, 0), collections: 0, drawn: taxa.length },
    generator: { generator: i.generator.id, version: i.generator.version, seed, basis: 'procedural', params: i.generator.params },
  };
}

/** What a place's spec needs from wherever it is being made: the same questions, answered from the build's files or a browser's. */
export interface PlaceWorld {
  atlas: Pick<AtlasIndex, 'source' | 'title'>;
  bin: { from: number; to: number; slice: number; name: string };
  /** the list for a place; undefined if there is no land there */
  list: (lat: number, lon: number) => AtlasEntry[] | undefined;
  /** where there is no land, the sea's list for the place: the genera it can draw, as the land's atlas lists a taxon; undefined if there is no sea there either */
  seaList?: (lat: number, lon: number) => AtlasEntry[] | undefined;
  /** the sea's atlas, whose fossils a scene from its list rests on */
  seaAtlas?: Pick<AtlasIndex, 'source' | 'title'>;
  forms: Record<string, Form>;
  /** the keyframe of the elevation nearest the time, its height every `step` degrees (a whole degree if not said), and its plate at a place */
  keyAge: number;
  step?: number;
  elevation: (lat: number, lon: number) => number;
  plate: (lat: number, lon: number) => number;
  /** the plate under a place of today's Earth, where the world has today's plates more finely than the keyframe's */
  plateNow?: (lat: number, lon: number) => number;
  /** carry a point on a plate from one age to another */
  carry: (plate: number, lat: number, lon: number, fromAge: number, toAge: number) => [number, number];
  /** the keyframe of the climate nearest the time, and its node nearest a place */
  climateAge: number;
  climate: (lat: number, lon: number) => ClimateNode | undefined;
  rule: ClimateRule;
  climateField: string;
  cover: SceneCover;
  isoline: number;
  /**
   * The climate at a height, where the world has it (field:earth/climate-at-height): the finest climate's keyframe
   * nearest the time, its node nearest a place in that keyframe's coordinates, and what brings it to other heights.
   */
  months?: {
    field: string;
    ageMa: number;
    /** the age whose coordinates its nodes are on */
    frameMa: number;
    at: (lat: number, lon: number) => { months: Months; height: number; lat: number; lon: number; parts?: SceneParts } | undefined;
    lapse: number;
    water: WaterParams;
    /** the month to draw, 1–12; the place's warmest if not said */
    month?: number;
  };
  /**
   * The shape of today's ground within the relief's cells (core/relief.ts), asked where the place stands today.
   * `held` says the scene's relief is today's, held for its time: then the shape is the survey's own, laid over that
   * relief. If not, it is carried back (model:earth/relief-carried), and is asked with the scene's age, the bearing
   * today of the scene's north, which is its elevation's keyframe's, and how far the ground of any plate has moved
   * against the scene's own since that keyframe, in degrees.
   */
  shape?: (today: { lat: number; lon: number }, back?: { ageMa: number; turn: number; apart: (plate: number, lat: number, lon: number) => number }) => ReliefShape | undefined;
  held?: boolean;
  /**
   * What the ground of a place of land is made of, where the world says (field:earth/substrate): asked where the place
   * stood at the stage's slice, as the rock record's sites are placed. The generator does not read it: the renderer does.
   */
  substrate?: (lat: number, lon: number) => SceneSubstrate | undefined;
  /**
   * The same from today's maps, where the time is one they are held for: the ground a map of today's topsoil makes, and
   * the rock a map of today's bedrock puts under it. Both are asked where the place stands today.
   */
  soil?: (lat: number, lon: number) => SceneSubstrate | undefined;
  bedrock?: (lat: number, lon: number) => SceneBedrock | undefined;
  /**
   * And from the units of the column of rock the place lies in (field:earth/strata), at the time shown: the ground a
   * unit being laid down then makes, and the rock under it. Asked where the place stands today, where the columns are.
   */
  strata?: (lat: number, lon: number) => { substrate?: SceneSubstrate; bedrock?: SceneBedrock };
  generator: { id: string; version: number; params: Record<string, unknown> };
}

const round5 = (x: number) => Math.floor(x * 1e5 + 0.5) / 1e5;
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * How far round a place the plates of the ground about it are tried, and how far apart, in degrees. A bound on the
 * search and no fact about any plate: a place whose plate's ground lies further off at the keyframe keeps the
 * keyframe's own answer.
 */
const PLATE_REACH = 3;
const PLATE_STEP = 0.5;

/**
 * The plates a place may be on: the one its elevation's keyframe has at its own coordinates, and then those of the
 * ground round about, nearest first. None twice, and no plate at all only where the keyframe has none at the place.
 */
export function platesNear(w: Pick<PlaceWorld, 'plate'>, lat: number, lon: number): number[] {
  const out = [w.plate(lat, lon)];
  const c = dcos((lat * PI) / 180);
  const wide = 1 / (c > 0.2 ? c : 0.2);
  const rings = Math.round(PLATE_REACH / PLATE_STEP);
  for (let ring = 1; ring <= rings; ring++) {
    for (let dj = -ring; dj <= ring; dj++) {
      const la = lat + dj * PLATE_STEP;
      if (la > 90 || la < -90) continue;
      for (let di = -ring; di <= ring; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const p = w.plate(la, ((lon + di * PLATE_STEP * wide + 540) % 360) - 180);
        if (p && !out.includes(p)) out.push(p);
      }
    }
  }
  return out;
}

/**
 * The plate under a place at an age: the one that carries the place to ground of its own. Away from a plate's edge
 * that is the plate the elevation's keyframe has at the place's own coordinates. By an edge it may not be: the edge
 * has moved between the keyframe and the age, the keyframe may have no plate there where two had not yet met or have
 * since parted, and its grid is coarser than an edge is sharp. So the keyframe's plate and those of the ground round
 * about are tried, nearest first, and the first is taken that
 *
 *   - carries the place to ground of its own today, on today's plates, where the world has those more finely
 *     (`plateNow`): the plates are outlines of today's Earth, and that is the finest picture of them;
 *   - or, failing that, carries it onto a node of its own on the keyframe;
 *   - or, failing that, carries it into a cell of the keyframe with a node of its own at a corner.
 *
 * Where none does, the keyframe's own answer stands. Where the ground of two plates lay over the same place, as that
 * of blocks that have since pulled apart did, the first tried is taken: the keyframe's own, if it is one of them.
 */
export function plateUnder(w: Pick<PlaceWorld, 'plate' | 'carry' | 'keyAge' | 'step' | 'plateNow'>, lat: number, lon: number, ageMa: number): number {
  const here = w.plate(lat, lon);
  const now = w.plateNow;
  if (!now && ageMa === w.keyAge && here) return here;
  const tried = platesNear(w, lat, lon);
  if (now) {
    for (const p of tried) {
      if (!p) continue;
      const [la, lo] = w.carry(p, lat, lon, ageMa, 0);
      if (now(la, lo) === p) return p;
    }
  }
  if (ageMa === w.keyAge && here) return here;
  for (const p of tried) {
    if (!p) continue;
    const [la, lo] = w.carry(p, lat, lon, ageMa, w.keyAge);
    if (w.plate(la, lo) === p) return p;
  }
  const step = w.step ?? 1;
  for (const p of tried) {
    if (!p) continue;
    const [la, lo] = w.carry(p, lat, lon, ageMa, w.keyAge);
    const south = Math.floor(la / step) * step;
    const west = Math.floor(lo / step) * step;
    for (const y of [south, south + step]) {
      if (y > 90 || y < -90) continue;
      for (const x of [west, west + step]) if (w.plate(y, ((x + 540) % 360) - 180) === p) return p;
    }
  }
  return here;
}

/**
 * The scene of a place at an age, on the lattice: undefined if neither atlas has a list there. A land with an empty list
 * has a scene, of bare ground; a sea with nothing it can draw, of an empty sea.
 */
export function placeSpec(w: PlaceWorld, lat: number, lon: number, ageMa: number): SceneSpec | undefined {
  const origin = latticeOf(lat, lon);
  const plate = plateUnder(w, origin.lat, origin.lon, ageMa);
  const [rl, ro] = plate ? w.carry(plate, origin.lat, origin.lon, ageMa, w.keyAge) : [origin.lat, origin.lon];
  const relief_at = { lat: round5(rl), lon: round5(ro) };
  // A submerged sea site inside a coastal 4° patch should draw from the sea atlas rather than the land atlas.
  const inSea = w.elevation(relief_at.lat, relief_at.lon) < w.isoline;
  const land = w.list(origin.lat, origin.lon);
  const sea = w.seaList?.(origin.lat, origin.lon);
  const fromSea = inSea && !!sea;
  const list = fromSea ? sea : land ?? sea;
  if (!list) return undefined;
  // A scene from the sea's list rests on the sea's fossils.
  const atlas = (fromSea || !land) && w.seaAtlas ? w.seaAtlas : w.atlas;
  // The months of the finest climate where there are some, and the deep past's runs' numbers where not.
  const m = w.months;
  const [ml, mo] = m && plate ? w.carry(plate, origin.lat, origin.lon, ageMa, m.frameMa) : [origin.lat, origin.lon];
  const here = m?.at(ml, mo);
  const [cl, co] = plate ? w.carry(plate, origin.lat, origin.lon, ageMa, w.climateAge) : [origin.lat, origin.lon];
  const node = here ? reduceMonths(here.months.t, here.months.p) : w.climate(cl, co);
  if (!node) return undefined;
  const relief = reliefPatch(relief_at.lat, relief_at.lon, w.elevation, w.isoline, w.step);
  const field = here ? m!.field : w.climateField;
  const age = here ? m!.ageMa : w.climateAge;
  const spec = specFor({ atlas, bin: w.bin, origin: { lat: round5(origin.lat), lon: round5(origin.lon) }, list, forms: w.forms, relief, node, rule: w.rule, climateField: field, climateAge: age, cover: w.cover, generator: w.generator });
  spec.site.relief_at = relief_at;
  // The shape of the ground within the relief's cells: the survey's, where today's relief is held; else today's carried back.
  if (w.shape) {
    const [tl, to] = plate ? w.carry(plate, origin.lat, origin.lon, ageMa, 0) : [origin.lat, origin.lon];
    // A scene's ground is laid out on its elevation's keyframe, north as that keyframe has it: the shape is turned as
    // the plate has turned since that keyframe, so that the two lie the same way.
    const fromKey = (la: number, lo: number): [number, number] => (plate ? w.carry(plate, la, lo, w.keyAge, 0) : [la, lo]);
    // And how far another plate's ground has moved against the scene's own since that keyframe: where each would
    // carry a place of today back to, apart.
    const toKey = (p: number, la: number, lo: number): [number, number] => (p ? w.carry(p, la, lo, 0, w.keyAge) : [la, lo]);
    const apart = (p: number, la: number, lo: number): number => (p === plate ? 0 : arcBetween(toKey(plate, la, lo), toKey(p, la, lo)));
    const shape = w.held ? w.shape({ lat: tl, lon: to }) : w.shape({ lat: tl, lon: to }, { ageMa, turn: turnOf(fromKey, relief_at.lat, relief_at.lon), apart });
    if (shape) spec.shape = shape;
  }
  if (here) {
    const months: Months = { t: here.months.t.map(round2), p: here.months.p.map(round2) };
    spec.climate = { field, ageMa: age, months, height: Math.round(here.height - w.isoline), coast: Math.round(w.isoline), lapse: m!.lapse, rule: w.rule, water: m!.water, month: m!.month ?? warmestMonth(months), lat: round5(here.lat), ...(here.parts ? { parts: here.parts } : {}) };
  }
  // The ground of a place of land, where the world says what it was made of, and the rock under it.
  if (!fromSea && land && (w.substrate || w.soil || w.bedrock || w.strata)) {
    const carried = (toAge: number): [number, number] => (plate ? w.carry(plate, origin.lat, origin.lon, ageMa, toAge) : [origin.lat, origin.lon]);
    const [sl, so] = w.substrate ? carried(toMa(w.bin.slice)) : [0, 0];
    const [tl, to] = w.soil || w.bedrock || w.strata ? carried(0) : [0, 0];
    let units: { substrate?: SceneSubstrate; bedrock?: SceneBedrock } | undefined;
    const unitsHere = () => (units ??= w.strata?.(tl, to) ?? {});
    const ground = firstGround(w.substrate?.(sl, so), () => w.soil?.(tl, to), () => unitsHere().substrate);
    if (ground) spec.substrate = ground;
    const rock = firstRock(w.bedrock?.(tl, to), () => unitsHere().bedrock);
    if (rock) spec.bedrock = rock;
  }
  return spec;
}
