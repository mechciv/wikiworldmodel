// How a settlement's people stood on its ground (model:people/settlement-form; docs/plans/MODELS.md, The settlement's
// form). A town is compact, its houses packed together along its lanes, or dispersed: its people's own settlements,
// each with its houses about its middle, set apart among the fields, gardens and water they worked. Which it was is the
// evidence's word, a town form's `fabric`, its record's or its townspeople's tradition's: neither the density nor a
// village pattern tells the two apart, since a city of houses on their own mounds and a city of courtyard houses packed
// in their blocks can take about the same share of their ground.
//
// A dispersed town is made of units, each one of its tradition's settlements: as many households as the tradition says
// one held, each on the ground it says lay between one house and the next. The units are as far apart as the town's
// density (model:people/density) leaves room for, so that the households they hold add up to its people, and the rest
// of its ground is open between them. Where the density leaves too little open ground for units to stand apart, the
// town is compact after all, whatever its form says.

import { mid, type Span } from './dwelling.ts';

export type Fabric = 'compact' | 'dispersed';

export interface FabricInput {
  /** its town form's word, where one says */
  fabric?: Fabric;
  /** its tradition's settlement form: houses in one settlement, metres from one house to the next, people to a house */
  houses?: Span;
  spacing?: Span;
  household?: Span;
  /** people to the hectare of its built ground at its height */
  density: number;
}

/** What the model takes where a tradition says nothing: every number a choice, said so in the model's record. */
export interface FabricModel {
  /** households in a unit */
  houses: number;
  /** metres from one house to the next in a unit */
  spacing: number;
  /** people to a household */
  household: number;
  /** the least share of the town's ground left open between its units for it to be drawn as units at all */
  open: number;
}

export const FABRIC_MODEL: FabricModel = { houses: 30, spacing: 20, household: 5, open: 0.15 };

/** A dispersed town's units. */
export interface Units {
  fabric: 'dispersed';
  /** households in a unit, metres from one house to the next in it, and people to a household */
  houses: number;
  spacing: number;
  household: number;
  /** the ground a unit takes at the town's density, m², and the distance from one unit's middle to the next, m */
  area: number;
  apart: number;
  /** the shares of the town's ground its units' houses take, and that left open between them */
  built: number;
  open: number;
}

export type FabricOf = { fabric: 'compact'; why: 'said' | 'unsaid' | 'crowded' } | Units;

/** A town's fabric and, where it is dispersed, its units. */
export function fabricOf(i: FabricInput, model?: Partial<FabricModel>): FabricOf {
  const m = { ...FABRIC_MODEL, ...model };
  if (i.fabric !== 'dispersed') return { fabric: 'compact', why: i.fabric === 'compact' ? 'said' : 'unsaid' };
  const houses = Math.max(1, mid(i.houses, m.houses));
  const spacing = Math.max(1, mid(i.spacing, m.spacing));
  const household = Math.max(1, mid(i.household, m.household));
  if (!(i.density > 0)) return { fabric: 'compact', why: 'crowded' };
  // Each unit takes the ground its people need at the town's density; its houses take a square of the spacing each.
  const area = ((houses * household) / i.density) * 1e4;
  const built = Math.min(1, (houses * spacing * spacing) / area);
  const open = 1 - built;
  if (open < m.open) return { fabric: 'compact', why: 'crowded' };
  // On a lattice of triangles, the distance between neighbours for that much ground to each.
  const apart = Math.sqrt((2 * area) / Math.sqrt(3));
  return { fabric: 'dispersed', houses, spacing, household, area, apart, built, open };
}

/** A unit's place in a dispersed town: its name, where it stands in the town's own metres, and how many households it held. */
export interface UnitSlot {
  id: string;
  x: number;
  y: number;
  houses: number;
}

/**
 * The places of a dispersed town's units within a square of its own metres: a lattice of triangles, each point moved a
 * little by a number of its own, named by its place in the lattice. The same town gives the same places whatever the time
 * or the scene, so a unit keeps its place, and a link to it, through the town's life. `rand` gives a number in [0, 1) for
 * a name.
 */
export function unitSlots(key: string, half: number, u: Pick<Units, 'apart' | 'houses'>, rand: (name: string) => number): UnitSlot[] {
  const out: UnitSlot[] = [];
  const dx = u.apart;
  const dy = (u.apart * Math.sqrt(3)) / 2;
  const nj = Math.ceil(half / dy);
  const ni = Math.ceil(half / dx) + 1;
  for (let j = -nj; j <= nj; j++) {
    for (let i = -ni; i <= ni; i++) {
      const id = `${key}/unit:${i}:${j}`;
      const x = i * dx + (j & 1 ? dx / 2 : 0) + (rand(`${id}/x`) - 0.5) * 0.4 * dx;
      const y = j * dy + (rand(`${id}/y`) - 0.5) * 0.4 * dy;
      if (Math.abs(x) > half || Math.abs(y) > half) continue;
      out.push({ id, x, y, houses: u.houses });
    }
  }
  return out;
}
