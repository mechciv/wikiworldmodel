// How much of the world is known, at a glance: a handful of shares, each a bar on the landing page. They are counted
// from what the coverage chart counts (core/coverage.ts) and from the claims' ladder (core/ladder.ts), so the glance
// and the chart can never tell different stories; the chart says where and when, the glance only how much.
//
// A layer's share is the part of what the viewer draws for it that rests on evidence or a model rather than a generic
// stand-in, over the globe's area and the time control's columns, from the first column where the layer draws anything
// to the present. Where a layer answers `unknown` it draws nothing, and that part is left out of the count: the window
// it is counted over says so instead ("since 541 Ma").
import type { CoverageMatrix, Span } from './coverage.ts';
import { coveragePlaces } from './coverage.ts';
import type { LayerId, ResolveWorld } from './resolve.ts';
import { TIERS } from './resolve.ts';

export interface GlanceRow {
  id: string;
  /** what the bar is of, in a few words */
  label: string;
  /** the share known, 0 to 1; null where nothing measures it yet */
  share: number | null;
  /** what the share is of, in a few words: "of the globe since 541 Ma" */
  of: string;
}

export interface Glance {
  format: 'lightworld-glance@1';
  groups: { id: string; label: string; rows: GlanceRow[] }[];
}

const round = (x: number) => Math.round(x * 1e4) / 1e4;
const E = TIERS.indexOf('evidence');
const M = TIERS.indexOf('model');
const U = TIERS.indexOf('unknown');

/**
 * The share of what a layer draws that rests on evidence or a model, over the columns that end by `until`, from the
 * first in which it draws anything; with the oldest time of that window. Null where it draws nothing then.
 */
export function layerShare(m: CoverageMatrix, layer: LayerId, until: number): { share: number; from: number } | null {
  const cells = m.layers.find((l) => l.layer === layer)?.cells;
  if (!cells) return null;
  let known = 0;
  let drawn = 0;
  let from: number | undefined;
  m.columns.forEach((col, i) => {
    if (col[0] >= until) return;
    const s = cells[i].share;
    const here = 1 - s[U];
    if (here <= 0) return;
    from ??= col[0];
    drawn += here;
    known += s[E] + s[M];
  });
  return from === undefined || drawn === 0 ? null : { share: round(known / drawn), from };
}

/**
 * Over the land the human landscape knows (core/landscape.ts), at the middle of each column it reaches up to `until`:
 * the share whose way of life rests on evidence or a model, and the share a state of the polities' dataset is drawn on.
 * Null where the landscape reaches none of the columns.
 */
export function landShares(w: ResolveWorld, columns: Span[], step: number, until: number): LandShares | null {
  const ls = w.landscape;
  if (!ls) return null;
  const places = coveragePlaces(step);
  let land = 0;
  let known = 0;
  let statesLand = 0;
  let states = 0;
  let from: number | undefined;
  let statesFrom: number | undefined;
  for (const col of columns) {
    const t = (col[0] + col[1]) / 2;
    if (t > until || t < ls.span[0] || t > ls.span[1]) continue;
    const politiesThen = !!w.polities && !!w.polity && t >= w.polities[0] && t <= w.polities[1];
    for (const p of places) {
      const here = ls.at(p.lat, p.lon, t);
      if (!here) continue;
      from ??= t;
      land += p.area;
      if (here.tier === 'evidence' || here.tier === 'model') known += p.area;
      if (politiesThen) {
        statesFrom ??= t;
        statesLand += p.area;
        if (w.polity!(p.lat, p.lon, t)) states += p.area;
      }
    }
  }
  if (from === undefined || land === 0) return null;
  return { lifeways: round(known / land), from, ...(statesLand ? { states: round(states / statesLand), statesFrom } : {}) };
}

export interface LandShares {
  lifeways: number;
  from: number;
  states?: number;
  statesFrom?: number;
}

/** What the glance is made from: the build's coverage chart and counts, and how to write a time. */
export interface GlanceInputs {
  matrix: CoverageMatrix;
  /** the present, on the axis: columns after it are the future, which no evidence reaches */
  until: number;
  land?: LandShares | null;
  /** how many taxa with fossil rows have a body of their own (coverage.json's forms) */
  forms?: { taxa: number; own_form: number };
  /** at some times, how many people there were and how many are drawn in a house of a building tradition (coverage.json's landscape.housing) */
  housing?: { t: number; people: number; housed: number }[];
  /** how many claims stand at each step of checking (core/ladder.ts) */
  ladder: Record<string, number>;
  formatTime: (t: number) => string;
}

export function glance({ matrix, until, land, forms, housing, ladder, formatTime }: GlanceInputs): Glance {
  const layer = (id: string, label: string, l: LayerId, what = 'of the globe'): GlanceRow => {
    const s = layerShare(matrix, l, until);
    return { id, label, share: s?.share ?? null, of: s ? `${what} since ${formatTime(s.from)}` : 'not drawn yet' };
  };
  // Each time counts the same, however many lived then: the first farmers' houses weigh as much as the last century's.
  const counted = (housing ?? []).filter((h) => h.people > 0);
  const housed = counted.length ? round(counted.reduce((s, h) => s + h.housed / h.people, 0) / counted.length) : null;
  const claims = Object.values(ladder).reduce((a, b) => a + b, 0);
  const checked = claims - (ladder.unchecked ?? 0);
  return {
    format: 'lightworld-glance@1',
    groups: [
      {
        id: 'earth',
        label: 'Earth',
        rows: [layer('land', 'Land and sea', 'geography'), layer('climate', 'Climate', 'climate'), layer('ice', 'Ice', 'ice'), layer('water', 'Rivers', 'water')],
      },
      {
        id: 'life',
        label: 'Life',
        rows: [
          layer('life', 'Who lived where', 'life', 'of land and sea'),
          { id: 'bodies', label: 'Bodies drawn', share: forms?.taxa ? round(forms.own_form / forms.taxa) : null, of: forms?.taxa ? `of ${forms.taxa.toLocaleString('en')} taxa with fossils` : 'not counted in this build' },
        ],
      },
      {
        id: 'people',
        label: 'People',
        rows: [
          { id: 'lifeways', label: 'Ways of life', share: land?.lifeways ?? null, of: land ? `of inhabited land since ${formatTime(land.from)}` : 'not drawn yet' },
          { id: 'states', label: 'States drawn', share: land?.states ?? null, of: land?.statesFrom !== undefined ? `of inhabited land since ${formatTime(land.statesFrom)}` : 'not drawn yet' },
          { id: 'houses', label: 'Houses of a tradition', share: housed, of: counted.length ? `of people, at ${counted.length} times since ${formatTime(counted[0].t)}` : 'not counted in this build' },
        ],
      },
      {
        id: 'record',
        label: 'The record',
        rows: [
          { id: 'checked', label: 'Claims checked', share: claims ? round(checked / claims) : null, of: `of ${claims.toLocaleString('en')} claims, against their sources` },
          { id: 'history', label: 'Written history', share: null, of: 'not measured yet' },
        ],
      },
    ],
  };
}
