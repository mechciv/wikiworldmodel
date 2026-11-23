// Crops as plants: where the settlement generator's land use says a field is under a crop, a stand of it in rows along
// its plot, drawn through the ground's cover close by (world/generators/life/stream.ts) as the wild land's low plants
// are. Which plot is under a crop this year, ripe or green, and where its rows run, is the plots' own layout
// (core/plots.ts), which the ground's colour follows too: a crop stands where the ground is its colour from afar.
//
// Nothing here is a fact. Which crop grew in any field is not known where no record says, and none is named: the stand
// is the same plain one everywhere, upright blades as nearly any grain is from a few steps off, and no taxon of the
// world's. That it stands in rows, how far apart, and how tall, are the generator's look (its params.crops), and a click
// on it says so.
import { PLOT, PLOT_LOOK, plotNear, plotOf, plotPlace, plotReach, type PlotStyle } from '../../../core/plots.ts';
import type { Mesh } from '../city/kit.ts';
import { hash2 } from '../city/math.ts';
import { drawCropStand } from '../life/plants.ts';

/** How the crop nobody names is drawn (params.crops of gen:people/settlement). Metres. */
export interface CropParams {
  /** how far apart its rows are, and its plants along a row */
  row: number;
  apart: number;
  /** how wide one plant's clump is */
  wide: number;
  /** how tall a green stand is and a ripe one, each plot's own between the two */
  green: [number, number];
  ripe: [number, number];
  /** how long a length of row is that is drawn as one thing, from a way off */
  length: number;
}

/** How many ways a clump of it is drawn, and as many again for a length of row. */
export const CROP_VARIANTS = 4;
/** The bit of its variant that says it is a length of row. */
export const CROP_LONG = 4;

/** One mesh of the crop, a metre tall: a clump, or a length of row along y. */
export function drawCrop(m: Mesh, p: CropParams, variant: number): void {
  const long = (variant & CROP_LONG) !== 0;
  drawCropStand(m, p.wide, long ? p.length : 0, ((variant & 3) + 1) * 0x51d3);
}

/** One thing sown: where it stands, how tall, which way its row runs there, which mesh, and its tint. */
export interface Sown {
  x: number;
  y: number;
  tall: number;
  /** its row's direction there */
  dx: number;
  dy: number;
  variant: number;
  /** what the renderer colours it by: ripe from 128, its plot's tone in sixteenths, and its own shade in the rest */
  tint: number;
  /** a number of its own, 0–1, for whatever thins it */
  u: number;
}

/**
 * What is sown in a square of ground, [x0, x1) by [y0, y1) in the scene's metres: along every row of every plot under
 * a crop, clear of the plot's balks, a plant every `apart`, or, with `long`, a length of row every `length`. Each
 * stands where its own numbers put it whichever square is asked for, so that squares side by side sow no place twice.
 */
export function sow(x0: number, y0: number, x1: number, y1: number, style: PlotStyle, p: CropParams, long: boolean, seed: number, each: (s: Sown) => void): void {
  const step = long ? p.length : p.apart;
  // The square in the plots' own lines, which lie no further from the scene's than they wander.
  const reach = plotReach(style);
  const k0 = Math.floor(x0 / p.row);
  const k1 = Math.ceil((x1 + reach) / p.row);
  const l0 = Math.floor(y0 / step);
  const l1 = Math.ceil((y1 + reach) / step);
  const salt = seed + (long ? 977 : 0);
  const near = reach * 0.25 + 0.1;
  for (let k = k0; k <= k1; k++) {
    for (let l = l0; l <= l1; l++) {
      // A little off its row's line, as a hand sows; anywhere in its own length of the row.
      const across = (k + 0.5 + (hash2(k, l, salt + 1) - 0.5) * 0.16) * p.row;
      const along = (l + (long ? 0.5 + (hash2(k, l, salt + 2) - 0.5) * 0.2 : hash2(k, l, salt + 2))) * step;
      const plot = plotOf(across, along, style);
      if (plot.state !== PLOT.ripe && plot.state !== PLOT.green) continue;
      if (plot.edge < PLOT_LOOK.balk + (long ? p.length * 0.5 : 0)) continue;
      // Plainly in another square: left to that square, before its place is worked out to the finger's breadth.
      const [nx, ny] = plotNear(across, along, style);
      if (nx < x0 - near || nx >= x1 + near || ny < y0 - near || ny >= y1 + near) continue;
      const [x, y] = plotPlace(across, along, style);
      if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
      // Its row's direction there: the plots' lines wander, and the rows with them.
      const [ax, ay] = plotPlace(across, along + 0.5, style);
      const d = Math.hypot(ax - x, ay - y) || 1;
      const ripe = plot.state === PLOT.ripe;
      const range = ripe ? p.ripe : p.green;
      // Each plot's stand is as tall as its own number says, and each plant a little more or less.
      const tall = (range[0] + (range[1] - range[0]) * hash2(plot.i, plot.j, seed + 5)) * (0.86 + 0.28 * hash2(k, l, salt + 3));
      const tint = Math.min(254, (ripe ? 128 : 0) + Math.min(15, Math.floor(plot.tone * 16)) * 8 + Math.floor(hash2(k, l, salt + 4) * 8));
      each({ x, y, tall, dx: (ax - x) / d, dy: (ay - y) / d, variant: (Math.floor(hash2(k, l, salt + 6) * CROP_VARIANTS) & 3) | (long ? CROP_LONG : 0), tint, u: hash2(k, l, salt + 7) });
    }
  }
}
