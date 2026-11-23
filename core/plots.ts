// The plots of people's fields: how a field system's ground is cut into plots, what each plot is under, and where its
// rows run. The settlement generator (gen:people/settlement) says where there are fields and of what system; this lays
// them out, the same for the renderer, which colours the ground by it (viewer/src/gl/cityShaders.ts, plots), and for
// what is sown on it (world/generators/people/crops.ts), so that a crop stands in its own plot, in rows along the
// plot, clear of its balks. Nothing here is a fact about any field: nobody recorded where one plot ended and the next
// began, what any was under in any year, or which way it was ploughed. The shares and the colours are the generator's
// look.
//
// Everything a shader must reckon alike is made of whole-number hashes and sines, which a GPU and a worker give alike:
// PLOTS_GLSL is the same layout in the shader's language, made from the numbers here.

/** How a field system's plots are drawn: a plot's side in metres, how much longer than wide it is, and its kind's code. */
export interface PlotStyle {
  plot: number;
  aspect: number;
  kind: number;
}

/** Each kind of field system's code, and how much longer than wide its plots are drawn. */
export const PLOT_KINDS: Record<string, [number, number]> = { blocks: [0, 1.5], strips: [1, 6], irregular: [2, 1.2], terraces: [3, 4], paddies: [4, 1.3], basins: [5, 2], raised: [6, 3], swidden: [7, 1.2], gardens: [8, 1.2], none: [0, 1] };

/** A field system as its plots are drawn: `plot` in hectares. */
export function plotStyle(s: { kind: string; plot: number }): PlotStyle {
  const [kind, aspect] = PLOT_KINDS[s.kind] ?? [0, 1.5];
  return { plot: Math.sqrt(s.plot * 10000), aspect, kind };
}

/** What a plot is under: a crop that has ripened, one still green, ploughed earth, or fallow, where what grows wild comes back. */
export const PLOT = { ripe: 0, green: 1, ploughed: 2, fallow: 3 } as const;
export type PlotState = (typeof PLOT)[keyof typeof PLOT];

/**
 * The plots' look, which the ground and what stands on it share. `shares`: below which of a plot's number it is ripe,
 * green and ploughed, the rest fallow; and, where plots are cleared from woodland and burnt, below which it is bare.
 * `warp`: how far the plots' lines wander, as a share of a plot's side, where a system's plots are irregular and where
 * they are not. `balk`: how far from a plot's edge its crop stops, m. `furrow`: how far apart the furrows the ground is
 * drawn with are, m. The tones are a ripe crop's and a green one's, each from one to another by the plot.
 */
export const PLOT_LOOK = {
  shares: { ripe: 0.4, green: 0.72, ploughed: 0.88, cleared: 0.5 },
  warp: { irregular: 0.55, regular: 0.18 },
  balk: 0.7,
  furrow: 1.3,
  ripe: [[0.5, 0.42, 0.21], [0.42, 0.36, 0.17]],
  green: [[0.2, 0.27, 0.1], [0.28, 0.32, 0.13]],
} as const;

/** What the plots are numbered by: a whole number, so that every scene and every machine numbers them alike. */
const SEED = 0x51ed27;

function mixHash(h: number): number {
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A plot's number, 0–1 in steps of 1/65536, by `k`: the same in the shader (plotNumber). */
export const plotNumber = (i: number, j: number, k = 0): number => (mixHash((SEED + k) ^ Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1)) >>> 16) / 65536;

/** How far the plots' lines are shifted at a place, each way, as a share of the most they are: 0–1. */
function wander(x: number, y: number, side: number): [number, number] {
  const k = 1 / (side * 1.7);
  return [0.5 + 0.25 * (Math.sin((x * 0.83 + y * 0.56) * k + 1.3) + Math.sin((y * 0.91 - x * 0.42) * k * 1.9 + 4.1)), 0.5 + 0.25 * (Math.sin((y * 0.79 - x * 0.61) * k + 2.7) + Math.sin((x * 0.88 + y * 0.47) * k * 1.9 + 0.6))];
}

/** A place in the fields: which plot it is in, what the plot is under, its tone, and where the place is in it. */
export interface PlotAt {
  i: number;
  j: number;
  state: PlotState;
  /** the plot's own number for its tone, 0–1 */
  tone: number;
  /** how far the place is from the plot's nearest edge, m */
  edge: number;
  /** where it is across the plot's rows and along them, m, in the plots' own lines */
  across: number;
  along: number;
}

const sizes = (s: PlotStyle): { side: number; sx: number; sy: number; warp: number } => {
  const side = Math.max(8, s.plot);
  const aspect = Math.max(1, s.aspect);
  const irregular = s.kind === 2 || s.kind === 7;
  return { side, sx: side / Math.sqrt(aspect), sy: side * Math.sqrt(aspect), warp: side * (irregular ? PLOT_LOOK.warp.irregular : PLOT_LOOK.warp.regular) };
};

/** What a plot of a number is under, in a field system of a kind. */
export function plotState(h: number, kind: number): PlotState {
  const s = PLOT_LOOK.shares;
  if (kind === 7) return h < s.cleared ? PLOT.ploughed : PLOT.green;
  return h < s.ripe ? PLOT.ripe : h < s.green ? PLOT.green : h < s.ploughed ? PLOT.ploughed : PLOT.fallow;
}

/** The plot at a place across and along the plots' own lines. */
export function plotOf(across: number, along: number, s: PlotStyle): PlotAt {
  const { sx, sy } = sizes(s);
  const i = Math.floor(across / sx);
  const j = Math.floor(along / sy);
  const fx = across / sx - i;
  const fy = along / sy - j;
  return { i, j, state: plotState(plotNumber(i, j), s.kind), tone: plotNumber(i, j, 3), edge: Math.min(Math.min(fx, 1 - fx) * sx, Math.min(fy, 1 - fy) * sy), across, along };
}

/** The plot a place is in, in the scene's metres. Its rows run along the plot's longer side. */
export function plotAt(x: number, y: number, s: PlotStyle): PlotAt {
  const { side, warp } = sizes(s);
  const [wx, wy] = wander(x, y, side);
  return plotOf(x + wx * warp, y + wy * warp, s);
}

/** How far the plots' lines are shifted from the scene's at most, m: a square of ground lies within that of its own lines. */
export const plotReach = (s: PlotStyle): number => sizes(s).warp;

/** The place, in the scene's metres, that lies at a place across and along the plots' own lines: plotAt, the other way. */
export function plotPlace(across: number, along: number, s: PlotStyle): [number, number] {
  const { side, warp } = sizes(s);
  // The lines wander slowly, so that a few steps find it to less than a finger's breadth.
  let x = across;
  let y = along;
  for (let k = 0; k < 9; k++) {
    const [wx, wy] = wander(x, y, side);
    x = across - wx * warp;
    y = along - wy * warp;
  }
  return [x, y];
}

const f = (x: number): string => (Number.isInteger(x) ? `${x}.0` : String(x));
const v3 = (c: readonly number[]): string => `vec3(${c.map(f).join(', ')})`;

/**
 * The same layout for a fragment shader: `plotNumber`, and `plotAt`, which gives a point's plot (xy), its place in the
 * plot as shares of its sides (zw), and the plot's sizes and the place across its rows through `size` and `across`.
 * It reads the style from a vec4: a plot's side, how much longer than wide, its kind.
 */
export const PLOTS_GLSL = `
highp uint plotMix(highp uint h) {
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  return h ^ (h >> 16u);
}
float plotNumber(highp ivec2 c, highp int k) {
  highp uint h = plotMix(uint(${SEED} + k) ^ (uint(c.x) * 0x27d4eb2du) ^ (uint(c.y) * 0x165667b1u));
  return float(h >> 16u) / 65536.0;
}
vec2 plotWander(vec2 p, float side) {
  float k = 1.0 / (side * 1.7);
  return vec2(0.5 + 0.25 * (sin((p.x * 0.83 + p.y * 0.56) * k + 1.3) + sin((p.y * 0.91 - p.x * 0.42) * k * 1.9 + 4.1)), 0.5 + 0.25 * (sin((p.y * 0.79 - p.x * 0.61) * k + 2.7) + sin((p.x * 0.88 + p.y * 0.47) * k * 1.9 + 0.6)));
}
vec4 plotAt(vec2 p, vec4 style, out vec2 size, out float across) {
  float side = max(8.0, style.x);
  float aspect = max(1.0, style.y);
  bool irregular = (style.z > 1.5 && style.z < 2.5) || (style.z > 6.5 && style.z < 7.5);
  vec2 q = p + plotWander(p, side) * side * (irregular ? ${f(PLOT_LOOK.warp.irregular)} : ${f(PLOT_LOOK.warp.regular)});
  size = vec2(side / sqrt(aspect), side * sqrt(aspect));
  vec2 cell = floor(q / size);
  across = q.x;
  return vec4(cell, q / size - cell);
}
const vec3 PLOT_RIPE0 = ${v3(PLOT_LOOK.ripe[0])};
const vec3 PLOT_RIPE1 = ${v3(PLOT_LOOK.ripe[1])};
const vec3 PLOT_GREEN0 = ${v3(PLOT_LOOK.green[0])};
const vec3 PLOT_GREEN1 = ${v3(PLOT_LOOK.green[1])};
`;
