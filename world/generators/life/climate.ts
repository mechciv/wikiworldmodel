// What a scene's climate does at its heights and in its month, apart from the generator that draws it, so the page can
// light and paint a scene without loading the generator: where snow lies (field:earth/climate-at-height).
import { monthsKeyframe, nearestNode, nearestParts, snowLine, type CellVegetation, type MonthsInfo, type MonthsSet, type MonthsTile, type NodeParts, type PartsSet, type PartsTile } from '../../../core/months.ts';
import type { SceneParts, SceneSpec, SceneVegetation } from '../../../core/scene.ts';
import { latticeOf, plateUnder, type PlaceWorld } from './spec.ts';

/** How the climate is brought to a scene's heights: the generator's choices. */
export interface ClimateChoices {
  /** how far, in °C, the edge between two classes wanders: as height, this over the lapse rate */
  band_c: number;
  /** the least snow drawn, mm of water; the height over which it thickens to cover the ground; the slope it slips off */
  snow_mm: number;
  snow_band_m: number;
  snow_slope: number;
  /** how finely the heights are read, m */
  step_m: number;
}

/**
 * Where snow lies in a scene's month, in metres above the coast: from `line`, thickening over `band` of height, and
 * none on slopes steeper than `slope`. The line is Infinity where no snow lies in the scene's heights, or where the world
 * gives no climate at a height.
 */
export function snowOf(spec: SceneSpec): { line: number; band: number; slope: number } {
  const p = (spec.generator.params as { climate?: ClimateChoices }).climate;
  const c = spec.climate;
  if (!c || !p) return { line: Infinity, band: 1, slope: 1 };
  let lo = Infinity;
  let hi = -Infinity;
  for (const z of spec.relief.z) {
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  // The shape of the ground within the field's cells stands above the field's heights, where the scene has one.
  if (spec.shape) {
    let top = 0;
    for (const z of spec.shape.patch.z) if (z > top) top = z;
    hi += top;
  }
  // The hills a scene adds stand above those: look a kilometre higher.
  const line = snowLine(c.months, c.month, c.lat, c.coast + c.height, c.water, c.lapse, p.snow_mm, Math.max(0, lo) - c.height, hi + 1000 - c.height, p.step_m * 2.5);
  return { line: line === Infinity ? Infinity : Math.round(line + c.height), band: p.snow_band_m, slope: p.snow_slope };
}

/** Where a place's months are: the set and keyframe of the finest climate that covers its time, and the place then. */
export interface MonthsPlace {
  set: MonthsSet;
  ageMa: number;
  frameMa: number;
  lat: number;
  lon: number;
}

/** Which months a place at a time reads, and where it stood in their coordinates: one answer for a browser and the build. */
export function monthsPlace(info: MonthsInfo, w: Pick<PlaceWorld, 'plate' | 'carry' | 'keyAge' | 'step' | 'plateNow'>, lat: number, lon: number, ageMa: number): MonthsPlace | undefined {
  const mk = monthsKeyframe(info, ageMa);
  if (!mk) return undefined;
  const frameMa = mk.set.frameMa ?? mk.ageMa;
  const origin = latticeOf(lat, lon);
  const plate = plateUnder(w, origin.lat, origin.lon, ageMa);
  const [ml, mo] = plate ? w.carry(plate, origin.lat, origin.lon, ageMa, frameMa) : [origin.lat, origin.lon];
  return { set: mk.set, ageMa: mk.ageMa, frameMa, lat: ml, lon: mo };
}

/**
 * What a place's spec reads of its months, once the tiles near it (core/months.ts tilesNear) have come; and of what else
 * the climate's source says of its node, where the tiles of its parts (partsFile) have come too.
 */
export function placeMonths(info: MonthsInfo, at: MonthsPlace, tiles: MonthsTile[], month?: number, parts: PartsTile[] = []): NonNullable<PlaceWorld['months']> {
  const set = at.set.parts;
  return {
    field: at.set.field,
    ageMa: at.ageMa,
    frameMa: at.frameMa,
    at: (la, lo) => {
      const node = nearestNode(tiles, at.ageMa, la, lo);
      if (!node || !set || !parts.length) return node;
      // The two kinds of tile keep the same nodes: parts of any other node are not this place's.
      const p = nearestParts(parts, at.ageMa, la, lo);
      return p && p.lat === node.lat && p.lon === node.lon ? { ...node, parts: sceneParts(p.parts, set) } : node;
    },
    lapse: info.lapse,
    water: info.water,
    ...(month ? { month } : {}),
  };
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** A node's parts as a scene's spec carries them: in their fields' units, each class with its name, and the field each is. */
export function sceneParts(p: NodeParts, set: PartsSet): SceneParts {
  const info = (part: string) => set.list.find((x) => x.part === part);
  const months = (v: (number | null)[]) => v.map((x) => (x === null ? null : round4(x)));
  const scaled = (part: string, x: number | undefined) => (x === undefined ? undefined : round4(x * (info(part)?.scale ?? 1)));
  const cell = (c: CellVegetation): SceneVegetation => {
    const name = info('biome')?.classes?.[String(c.biome)];
    const leaf = scaled('leaf', c.leaf);
    const npp = scaled('npp', c.npp);
    return { biome: c.biome, ...(name !== undefined ? { name } : {}), ...(leaf !== undefined ? { leaf } : {}), ...(npp !== undefined ? { npp } : {}) };
  };
  const out: SceneParts = { fields: Object.fromEntries(set.list.map((x) => [x.part, x.field])) };
  for (const part of ['cloud', 'humidity', 'wind_speed', 'albedo'] as const) if (p[part]) out[part] = months(p[part]!);
  if (p.wind) out.wind = { u: months(p.wind.u), v: months(p.wind.v) };
  if (p.vegetation) out.vegetation = { ...cell(p.vegetation), cells: p.vegetation.cells.map((c) => (c ? cell(c) : null)) };
  return out;
}
