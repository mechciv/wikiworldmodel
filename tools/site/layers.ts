// The landing page's drawing of how the world is made (site/index.html, "How it works"): one square of the Hell Creek
// floodplain at 66.5 Ma, pulled apart into five plates, the view, the generators, the models, the evidence and the
// sources, with a line dropped through one tyrannosaur from the top plate to the bottom. It is a diagram, and reads
// nothing from the world: its trees, animals, fossils and cells stand for what each layer holds, not for real ones.
//
//   npx tsx tools/site/layers.ts
//
// writes the plates to site/img/layers.svg, and into site/index.html, between its layers:start and layers:end marks,
// the stack that places them and the spacing its labels are set by. The page stacks the plates with <use>, each in a
// group of its own, so that its stylesheet can close them up and spread them apart (main.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Point = [number, number];
/** A place on a plate, u across and v front to back, both from 0 to 1, raised h above it, on the drawing. */
type At = (u: number, v: number, h?: number) => Point;
/** What stands up from a plate, to be drawn back to front. */
interface Upright {
  u: number;
  v: number;
  svg: string;
}
interface Layer {
  id: string;
  /** The plate's edges: the side to the right, and the front to the left. */
  side: string;
  front: string;
  /** The ring round the line where it passes the plate. */
  ring: string;
  flat(): string;
  up?(): Upright[];
  /** What is drawn at the line's crossing, under what stands on the plate. */
  mark?(x: number, y: number): string;
  /** What is written beside the crossing, over everything. */
  note?(x: number, y: number): string;
}

// The projection: an isometric plate, flattened, with the camera a little lower than true isometric.
const W = 250;
const C = Math.cos(Math.PI / 6);
const S = 0.34;
const THICK = 6;
/** How far apart the plates are drawn, and how far apart they are when closed up. */
const GAP = 118;
const CLOSED = 14;
/** Room above the back corner of the top plate for its trees and its note. */
const TOP = 18;
const OX = W * C + 4;
const WIDTH = OX + W * C + 4;
const HEIGHT = TOP + 4 * GAP + 2 * W * S + THICK + 4;

const r1 = (n: number): string => String(Math.round(n * 10) / 10);
const pts = (list: Point[]): string => list.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
const poly = (list: Point[], a: string): string => `<polygon points="${pts(list)}" ${a}/>`;
const pline = (list: Point[], a: string): string => `<polyline points="${pts(list)}" fill="none" ${a}/>`;
const circle = (x: number, y: number, r: number, a: string): string => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" ${a}/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, a: string): string =>
  `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" ${a}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, a: string): string =>
  `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" ${a}/>`;
/** A circle of radius rho on a plate, as the projection draws it. */
const ring = (x: number, y: number, rho: number, a: string): string => ellipse(x, y, Math.SQRT2 * rho * C, Math.SQRT2 * rho * S, a);
const MONO = 'font-family="IBM Plex Mono, ui-monospace, Menlo, monospace"';

/** A plate's top, with its back corner at (OX, TOP). */
const at: At = (u, v, h = 0) => [OX + (u - v) * W * C, TOP + (u + v) * W * S - h];
const square = (): Point[] => [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];

/** Text lying flat on a plate, along u. */
function flatText(u: number, v: number, text: string, size: number, a: string): string {
  const [x, y] = at(u, v);
  const m = [C, S, -C, S, x, y].map((n) => String(Math.round(n * 1e4) / 1e4));
  return `<text transform="matrix(${m.join(' ')})" font-size="${size}" ${a}>${text}</text>`;
}

/** A small seeded random number generator (mulberry32), so the drawing is the same each time it is made. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The place: a square of floodplain with a river running through it from back to front.
/** The models' line of the drainage, smooth. */
const valley = (v: number): number => 0.5 + 0.12 * Math.sin(v * 4.6 + 0.8);
/** The river a generator draws along it, meandering. */
const river = (v: number): number => valley(v) + 0.035 * Math.sin(v * 12.5 + 1.7);
const HALF = 0.04;

interface Animal {
  u: number;
  v: number;
  size: number;
  tone: string;
}
const ANIMALS: Animal[] = [
  { v: 0.6, du: 0.12, size: 1.3, tone: '#463a2d' }, // the tyrannosaur the line drops through
  { v: 0.27, du: -0.13, size: 1.05, tone: '#6e5a43' },
  { v: 0.79, du: 0.11, size: 0.75, tone: '#7a6650' },
  { v: 0.845, du: 0.16, size: 0.75, tone: '#7a6650' },
  { v: 0.75, du: 0.17, size: 0.75, tone: '#7a6650' },
  { v: 0.43, du: 0.1, size: 0.5, tone: '#8a7458' },
].map(({ v, du, size, tone }) => ({ u: river(v) + du, v, size, tone }));
const REX = ANIMALS[0];

interface Tree {
  u: number;
  v: number;
  conifer: boolean;
  h: number;
}
const TREES: Tree[] = (() => {
  const r = rng(66500);
  const out: Tree[] = [];
  for (let i = 0; i < 1200 && out.length < 150; i++) {
    const u = 0.03 + r() * 0.94;
    const v = 0.03 + r() * 0.94;
    const d = Math.abs(u - river(v));
    if (d < HALF + 0.03) continue;
    if (d < 0.2 && r() < 0.7) continue; // open floodplain by the water
    if (ANIMALS.some((a) => Math.hypot(a.u - u, a.v - v) < 0.075)) continue;
    out.push({ u, v, conifer: r() < (d > 0.22 ? 0.8 : 0.3), h: 0.8 + r() * 0.5 });
  }
  return out;
})();

/** Where the evidence puts a fossil: few, and none of them under an animal. */
const FOSSILS: Point[] = [
  [river(0.7) + 0.25, 0.7],
  [river(0.17) - 0.24, 0.17],
  [river(0.91) + 0.3, 0.91],
  [0.12, 0.52],
  [0.88, 0.33],
  [0.22, 0.86],
  [0.27, 0.735],
  [0.86, 0.765],
];

/** The works the evidence was read from, as cards on the bottom plate; the line lands on the first. */
const CARDS = [
  { u: 0.44, v: 0.52, w: 0.3, h: 0.17, title: 'PBDB, 4 Nov 2026' },
  { u: 0.08, v: 0.2, w: 0.27, h: 0.16, title: 'PALEOMAP' },
  { u: 0.6, v: 0.12, w: 0.3, h: 0.16, title: 'Li et al. 2022' },
  { u: 0.1, v: 0.62, w: 0.3, h: 0.15, title: 'Hutchinson 2011' },
  { u: 0.56, v: 0.78, w: 0.3, h: 0.15, title: '' },
];

const along = (f: (v: number) => number, offset = 0): Point[] => {
  const out: Point[] = [];
  for (let i = 0; i <= 48; i++) out.push(at(f(i / 48) + offset, i / 48));
  return out;
};
const MAGENTA = '#d446a1';
const BLUE = '#259ed6';
const SHADOW = 'fill="#14200a" fill-opacity=".25"';

function conifer([x, y]: Point, h: number, outline?: string): string {
  const k = 0.8;
  const H = 12 * h * k;
  const w = 5 * k * (0.85 + h * 0.2);
  if (outline) return poly([[x, y - H], [x + w / 2, y], [x - w / 2, y]], `fill="#fdf6fa" stroke="${outline}" stroke-width=".8" stroke-linejoin="round"`);
  return (
    ellipse(x + 3 * k, y, 3.6 * k, 1.4 * k, SHADOW) +
    poly([[x, y - H], [x - w / 2, y - k], [x, y - 0.3 * k]], 'fill="#2b5135"') +
    poly([[x, y - H], [x + w / 2, y - k], [x, y - 0.3 * k]], 'fill="#3d6c45"')
  );
}
function broadleaf([x, y]: Point, h: number, outline?: string): string {
  const k = 0.8;
  const r = 3.2 * k * h;
  const cy = y - 3 * k - r;
  if (outline) return line(x, y, x, cy + r, `stroke="${outline}" stroke-width=".8"`) + circle(x, cy, r, `fill="#fdf6fa" stroke="${outline}" stroke-width=".8"`);
  return (
    ellipse(x + 3 * k, y, 3.8 * k, 1.5 * k, SHADOW) +
    line(x, y, x, cy, `stroke="#5a4a35" stroke-width="${r1(k)}"`) +
    circle(x, cy, r, 'fill="#4b773a"') +
    circle(x - r * 0.3, cy - r * 0.3, r * 0.55, 'fill="#5f8d48"')
  );
}
function beast([x, y]: Point, a: Animal, fill: string, shadow: boolean): string {
  const L = 3.7 * a.size;
  const H = 2.1 * a.size;
  let s = shadow ? ellipse(x + 2, y, L * 1.15, L * 0.32, SHADOW) : '';
  for (const dx of [-0.4, 0.35]) s += line(x + dx * L, y, x + dx * L, y - H, `stroke="${fill}" stroke-width=".9"`);
  return s + ellipse(x, y - H, L, L * 0.4, `fill="${fill}"`) + circle(x + L * 0.95, y - H - L * 0.28, L * 0.3, `fill="${fill}"`);
}
const trees = (outline?: string): Upright[] =>
  TREES.map((t) => ({ u: t.u, v: t.v, svg: (t.conifer ? conifer : broadleaf)(at(t.u, t.v), t.h, outline) }));

/** A card lying on the bottom plate: a page with a few lines on it, and the work's name. */
function card(c: (typeof CARDS)[number]): string {
  const q = [at(c.u, c.v), at(c.u + c.w, c.v), at(c.u + c.w, c.v + c.h), at(c.u, c.v + c.h)];
  let s = poly(q.map(([x, y]): Point => [x + 1.6, y + 1.6]), 'fill="#3c321e" fill-opacity=".2"');
  s += poly(q, 'fill="#fffdf7" stroke="#b7ae98" stroke-width=".6"');
  for (let i = 0; i < 4; i++) {
    const v = c.v + c.h * (0.42 + i * 0.15);
    if (v > c.v + c.h - 0.012) break;
    s += pline([at(c.u + c.w * 0.1, v), at(c.u + c.w * (i === 3 ? 0.5 : 0.88), v)], 'stroke="#cdc5b1" stroke-width=".9"');
  }
  if (c.title) s += flatText(c.u + c.w * 0.1, c.v + c.h * 0.3, c.title, 8, `${MONO} fill="#3b372c"`);
  return s;
}

const LAYERS: Layer[] = [
  {
    id: 'view',
    side: '#1c2420',
    front: '#2a332e',
    ring: '#ffffff',
    flat: () =>
      poly(square(), 'fill="#8da45b"') +
      poly([...along(() => 0), ...along(valley, -0.2).reverse()], 'fill="#7a9450"') +
      poly([...along(valley, 0.2), ...along(() => 1).reverse()], 'fill="#7a9450"') +
      poly([...along(river, -HALF), ...along(river, HALF).reverse()], 'fill="#7fb2cc"') +
      pline(along(river, -HALF), 'stroke="#d6e3d6" stroke-width=".9"') +
      pline(along(river, HALF), 'stroke="#d6e3d6" stroke-width=".9"'),
    up: () => [...trees(), ...ANIMALS.map((a) => ({ u: a.u, v: a.v, svg: beast(at(a.u, a.v), a, a.tone, true) }))],
    note: (x, y) =>
      `<text x="${r1(x - 18)}" y="${r1(y - 16)}" text-anchor="end" font-size="10.5" ${MONO} fill="#fff" stroke="#1c2420" stroke-opacity=".45" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke">follow it down ↓</text>`,
  },
  {
    id: 'generators',
    side: '#d98fbd',
    front: '#eab1d3',
    ring: MAGENTA,
    flat() {
      let s = poly(square(), 'fill="#fdf6fa"');
      // The slots a generator fills, each from its own seed.
      for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) {
        const [x, y] = at((i + 0.5) / 14, (j + 0.5) / 14);
        s += circle(x, y, 0.7, `fill="${MAGENTA}" fill-opacity=".35"`);
      }
      s += pline(along(river, -HALF), `stroke="${MAGENTA}" stroke-width=".9" stroke-dasharray="2.5 2"`);
      return s + pline(along(river, HALF), `stroke="${MAGENTA}" stroke-width=".9" stroke-dasharray="2.5 2"`);
    },
    up: () => [...trees(MAGENTA), ...ANIMALS.map((a) => ({ u: a.u, v: a.v, svg: beast(at(a.u, a.v), a, MAGENTA, false) }))],
  },
  {
    id: 'models',
    side: '#e0aa66',
    front: '#f0c68e',
    ring: '#7a4100',
    flat() {
      // A field over the plate, in cells, with the lie of the land and the line its water takes.
      let s = '';
      const N = 12;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const d = Math.abs((i + 0.5) / N - valley((j + 0.5) / N));
        const fill = d < 0.12 ? '#f8e4c6' : d < 0.27 ? '#f1c992' : '#e8b06a';
        s += poly([at(i / N, j / N), at((i + 1) / N, j / N), at((i + 1) / N, (j + 1) / N), at(i / N, (j + 1) / N)], `fill="${fill}" stroke="#fbf3e6" stroke-width=".6"`);
      }
      for (const k of [-3, -2, -1, 1, 2, 3]) s += pline(along(valley, k * 0.1), 'stroke="#9a5a0a" stroke-opacity=".4" stroke-width=".7"');
      return s + pline(along(valley), 'stroke="#b86a06" stroke-width="1.7"');
    },
    mark() {
      const N = 12;
      const i = Math.floor(REX.u * N);
      const j = Math.floor(REX.v * N);
      return poly([at(i / N, j / N), at((i + 1) / N, j / N), at((i + 1) / N, (j + 1) / N), at(i / N, (j + 1) / N)], 'fill="none" stroke="#7a4100" stroke-width="1.4"');
    },
  },
  {
    id: 'evidence',
    side: '#86c0e1',
    front: '#acd6ee',
    ring: '#1b7fb0',
    flat() {
      let s = poly(square(), 'fill="#f8fbfd"');
      for (const t of [0.25, 0.5, 0.75]) {
        s += pline([at(t, 0), at(t, 1)], `stroke="${BLUE}" stroke-opacity=".2" stroke-width=".6"`);
        s += pline([at(0, t), at(1, t)], `stroke="${BLUE}" stroke-opacity=".2" stroke-width=".6"`);
      }
      for (const [u, v] of FOSSILS) {
        const [x, y] = at(u, v);
        s += ellipse(x, y, 3.4, 1.4, `fill="${BLUE}" fill-opacity=".3"`);
      }
      return s;
    },
    up: () =>
      FOSSILS.map(([u, v]) => {
        const [x, y] = at(u, v);
        return { u, v, svg: line(x, y, x, y - 12, 'stroke="#1b7fb0" stroke-width="1"') + circle(x, y - 12, 2.6, `fill="${BLUE}" stroke="#fff" stroke-width="1"`) };
      }),
    // Not a fossil under the animal: the ones near it.
    mark: (x, y) => ring(x, y, 0.16 * W, `fill="${BLUE}" fill-opacity=".07" stroke="${BLUE}" stroke-width="1" stroke-dasharray="3 2.5"`),
  },
  {
    id: 'sources',
    side: '#b6af9c',
    front: '#cfc9b9',
    ring: '#5b5440',
    flat: () => poly(square(), 'fill="#ddd7c8"') + CARDS.map(card).join(''),
  },
];

/** One plate, drawn with its back corner at (OX, TOP). */
function plate(l: Layer, top: boolean): string {
  const edge = 'stroke="#161d1b" stroke-opacity=".35" stroke-width=".7" stroke-linejoin="round"';
  const down = (p: Point): Point => [p[0], p[1] + THICK];
  let s = poly([at(1, 0), at(1, 1), down(at(1, 1)), down(at(1, 0))], `fill="${l.side}" ${edge}`);
  s += poly([at(0, 1), at(1, 1), down(at(1, 1)), down(at(0, 1))], `fill="${l.front}" ${edge}`);
  s += l.flat() + poly(square(), `fill="none" ${edge}`);
  const [x, y] = at(REX.u, REX.v);
  if (l.mark) s += l.mark(x, y);
  if (l.up) s += l.up().sort((a, b) => a.u + a.v - (b.u + b.v)).map((it) => it.svg).join('');
  s += ring(x, y - (top ? 3 : 0), top ? 11 : 7, `fill="none" stroke="${l.ring}" stroke-width="1.5"`);
  if (l.note) s += l.note(x, y);
  return s;
}

/** The stack: the plates bottom first, each with the stretch of the line above it, which the plate over it hides. */
function stack(href: string, lineStyle = ''): string[] {
  const [x, y] = at(REX.u, REX.v);
  const out: string[] = [];
  for (let k = LAYERS.length - 1; k >= 0; k--) {
    if (k < LAYERS.length - 1) out.push(`<line class="drill" x1="${r1(x)}" y1="${r1(y + k * GAP)}" x2="${r1(x)}" y2="${r1(y + (k + 1) * GAP)}"${lineStyle} />`);
    out.push(`<g class="plate" style="--k: ${k}"><use href="${href}#layer-${LAYERS[k].id}" y="${k * GAP}" /></g>`);
  }
  return out;
}

export interface Drawn {
  /** site/img/layers.svg: the plates, and the stack drawn spread, to look at on its own. */
  file: string;
  /** The page's drawing, between <!-- layers:start --> and <!-- layers:end -->. */
  html: string;
  /** Where the page sets each plate's label, and how far the plates close up, between the CSS marks. */
  css: string;
}

export function drawLayers(): Drawn {
  const viewBox = `0 0 ${r1(WIDTH)} ${r1(HEIGHT)}`;
  const plates = LAYERS.map((l, k) => `<g id="layer-${l.id}">${plate(l, k === 0)}</g>`).join('\n');
  const file =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n` +
    `<!-- Made by tools/site/layers.ts: the landing page's five layers, a diagram of one place, the Hell Creek at 66.5 Ma. -->\n` +
    `<defs>\n${plates}\n</defs>\n` +
    `${stack('', ' stroke="#161d1b" stroke-dasharray="3 3"').join('\n')}\n</svg>\n`;
  const indent = ' '.repeat(10);
  const html = [
    `<svg class="layers-art" viewBox="${viewBox}" aria-hidden="true" focusable="false">`,
    ...stack('img/layers.svg').map((l) => `  ${l}`),
    `</svg>`,
  ]
    .map((l) => indent + l)
    .join('\n');
  const pct = (n: number): string => `${Math.round(n * 1e4) / 100}%`;
  const css = `      .layers { --first: ${pct((TOP + W * S) / HEIGHT)}; --step: ${pct(GAP / HEIGHT)}; --closed: ${GAP - CLOSED}px; }`;
  return { file, html, css };
}

/** Puts text between two marks in a file's text, keeping the marks' own lines. */
export function splice(text: string, start: string, end: string, inner: string): string {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error(`the page has no ${start} … ${end}`);
  const from = text.indexOf('\n', a) + 1;
  const to = text.lastIndexOf('\n', b) + 1;
  return text.slice(0, from) + inner + '\n' + text.slice(to);
}

export const SITE = join(import.meta.dirname, '../../site');

export function pageWith(page: string, d: Drawn): string {
  return splice(splice(page, '<!-- layers:start -->', '<!-- layers:end -->', d.html), '/* layers:start */', '/* layers:end */', d.css);
}

if (process.argv[1] === import.meta.filename) {
  const d = drawLayers();
  writeFileSync(join(SITE, 'img/layers.svg'), d.file);
  const page = join(SITE, 'index.html');
  writeFileSync(page, pageWith(readFileSync(page, 'utf8'), d));
  console.log(`layers: ${(d.file.length / 1024).toFixed(0)} kB → site/img/layers.svg, and the stack into site/index.html`);
}
