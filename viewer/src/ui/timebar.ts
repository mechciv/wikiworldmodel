// The time control: a strip that zooms like a map, along a scale that gives the recent past far
// more room than the deep past (see core/timescale.ts). A window is a stretch of that scale, so
// zooming and panning are even along it, and a narrow window is close to linear. Under its ruler,
// two muted rows of the chart show the named periods, the finest two that can be told apart at
// the zoom; a track under them shows the world's dated records, and a band along its foot the
// planet's states. The moment shown is read large in the corner of the view (`readout`).
import type { PeriodRecord, SearchEntry } from '../../../core/records.ts';
import { lookup, type Scenario } from '../../../core/scenario.ts';
import { formatTime, historical, PRESENT_YEAR } from '../../../core/time.ts';
import { positionOf, timeAt } from '../../../core/timescale.ts';

type Win = [number, number];

export function xOf(t: number, win: Win, width: number): number {
  const p0 = positionOf(win[0]);
  return (width * (positionOf(t) - p0)) / (positionOf(win[1]) - p0);
}

export function tOf(x: number, win: Win, width: number): number {
  const p0 = positionOf(win[0]);
  return timeAt(p0 + (x / width) * (positionOf(win[1]) - p0));
}

/** The narrowest window the time control zooms to, in years: a few years, so days can be told apart. */
export const MIN_SPAN = 4;

/** The window of `span` along the scale that starts at `p0`, moved along it if it runs over `limits`. */
function windowAlong(p0: number, span: number, limits: Win): Win {
  const lo = positionOf(limits[0]);
  const hi = positionOf(limits[1]);
  if (span >= hi - lo) return [limits[0], limits[1]];
  if (p0 <= lo) return [limits[0], timeAt(lo + span)];
  if (p0 + span >= hi) return [timeAt(hi - span), limits[1]];
  return [timeAt(p0), timeAt(p0 + span)];
}

/** Zoom by `factor` (>1 zooms in) keeping time `tp` at screen fraction `s`; keep within `limits`. */
export function zoomAround(win: Win, tp: number, s: number, factor: number, limits: Win, minSpan = MIN_SPAN): Win {
  const span = (positionOf(win[1]) - positionOf(win[0])) / factor;
  const next = windowAlong(positionOf(tp) - s * span, span, limits);
  // At a few years the scale is as good as linear.
  return next[1] - next[0] < minSpan ? clampWindow([tp - s * minSpan, tp + (1 - s) * minSpan], limits) : next;
}

/** Move a window by `dx` pixels of a strip `width` wide, as a drag does. */
export function panWindow(win: Win, dx: number, width: number, limits: Win, minSpan = MIN_SPAN): Win {
  const p0 = positionOf(win[0]);
  const span = positionOf(win[1]) - p0;
  const [o, n] = windowAlong(p0 - (dx / width) * span, span, limits);
  // Moved toward the present, the same stretch of the scale holds fewer years.
  return n - o < minSpan ? clampWindow([(o + n - minSpan) / 2, (o + n + minSpan) / 2], limits) : [o, n];
}

/** Keep a window within `limits`, moving it along the scale if it runs over. */
export function clampWindow(win: Win, limits: Win): Win {
  const p0 = positionOf(win[0]);
  const span = positionOf(win[1]) - p0;
  if (p0 >= positionOf(limits[0]) && p0 + span <= positionOf(limits[1])) return win;
  return windowAlong(p0, span, limits);
}

/** A window that shows a stretch of time with a margin either side, a share of its length along the scale. */
export function fitWindow(a: number, b: number, limits: Win, margin = 0.06): Win {
  const p0 = positionOf(a);
  const span = positionOf(b) - p0;
  return windowAlong(p0 - span * margin, span * (1 + 2 * margin), limits);
}

/**
 * The strip's rows, top to bottom: a ruler, two rows of the named periods, the track of records, and the planet's
 * states along its foot. A short screen, a phone on its side, has thinner ones, so that the view keeps room above them.
 */
interface Rows {
  ruler: number;
  /** each row of periods, the room above the first, between the two, and below the second */
  band: number;
  above: number;
  between: number;
  below: number;
  track: number;
  pad: number;
  /** the size of the ruler's numbers and of the time on its flag */
  tick: number;
  flag: number;
}
const TALL: Rows = { ruler: 22, band: 8, above: 6, between: 3, below: 8, track: 16, pad: 5, tick: 10.5, flag: 11 };
const SHORT: Rows = { ruler: 18, band: 6, above: 4, between: 2, below: 5, track: 14, pad: 4, tick: 9.5, flag: 10 };
/** A short screen, as style.css has it. */
const SHORT_SCREEN = '(max-height: 500px)';

/** Steps worth a tick, finest first: 1, 2 and 5 times a power of ten, from a year to 5 Gyr. */
const STEPS: number[] = [];
for (let e = 0; e <= 9; e++) for (const m of [1, 2, 5]) STEPS.push(m * 10 ** e);

/** How far from the present the calendar's years are used. Beyond it, round ages. */
const CALENDAR = 1e4;

/**
 * The first round time after t for a step. Within reach of the calendar these are years that
 * are multiples of the step, BCE and CE counted apart (there is no year 0), with 1 CE between
 * them; beyond it, multiples of the step away from the present.
 */
function roundAfter(t: number, step: number): number {
  const age = PRESENT_YEAR - t;
  if (age > CALENDAR) {
    const a = (Math.ceil(age / step) - 1) * step;
    if (a >= CALENDAR) return PRESENT_YEAR - a;
    t = PRESENT_YEAR - CALENDAR;
  }
  if (t < 1) {
    const k = Math.ceil((1 - t) / step) - 1;
    return k > 0 ? 1 - k * step : 1;
  }
  const year = (Math.floor(t / step) + 1) * step;
  if (year - PRESENT_YEAR < CALENDAR) return year;
  return PRESENT_YEAR + Math.max(1, Math.floor((t - PRESENT_YEAR) / step) + 1) * step;
}

/**
 * A tick's label. The strip runs through several scales, so each names its own: the calendar's
 * years, then ages in ka, Ma and Ga, and times from now.
 */
function tickLabel(t: number, step: number): string {
  if (historical(t)) return formatTime(t);
  const d = Math.abs(PRESENT_YEAR - t);
  const div = d >= 1e9 ? 1e9 : d >= 1e6 ? 1e6 : 1e3;
  const v = +(d / div).toFixed(Math.max(0, Math.ceil(Math.log10(div / step))));
  return t > PRESENT_YEAR ? `+${v} ${div === 1e9 ? 'Gyr' : div === 1e6 ? 'Myr' : 'kyr'}` : `${v} ${div === 1e9 ? 'Ga' : div === 1e6 ? 'Ma' : 'ka'}`;
}

/**
 * The ruler's ticks. Walking along the strip, each is the first round time at least `gap` pixels
 * past the last, in the finest step whose ticks fall that far apart there, so they stay evenly
 * spaced and the step changes along the strip as the scale does. Where the scale runs so fast
 * that no step will do, as across billions of years, it is the roundest time within reach.
 */
export function rulerTicks(win: Win, x: (t: number) => number, at: (x: number) => number, gap: number): { t: number; label: string }[] {
  const ticks: { t: number; label: string }[] = [];
  let last = -gap;
  for (;;) {
    const from = at(last + gap);
    const past = (s: number) => x(roundAfter(from, s)) - x(from);
    const even = (s: number) => {
      const a = roundAfter(from, s);
      return past(s) <= 3 * gap && x(roundAfter(a, s)) - x(a) >= gap;
    };
    const step = STEPS.find(even) ?? STEPS.filter((s) => past(s) <= gap).pop() ?? STEPS[0];
    const t = roundAfter(from, step);
    if (t > win[1]) return ticks;
    ticks.push({ t, label: tickLabel(t, step) });
    last = x(t);
  }
}

/** The chart's ranks, coarsest first, and what a row of each is called. */
const RANKS = ['eon', 'era', 'period', 'epoch', 'stage'];
const PLURAL: Record<string, string> = { eon: 'eons', era: 'eras', period: 'periods', epoch: 'epochs', stage: 'stages' };
/** How wide, in pixels, the middle one of a rank's periods in view must be for a row of that rank to be drawn. */
const LEGIBLE = 10;

/** The strip's colours and type, as tokens.css has them. */
const INK = { text: '#e9ecf2', faint: '#7a8496', accent: '#f4b860', onAccent: '#1a1205', sky: [3, 4, 11] };
const MONO = "'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "'Geist Variable', system-ui, -apple-system, 'Segoe UI', sans-serif";

/** A period's chart colour, muted toward the sky: the rows are a quiet chart under the ruler, not its loudest part. */
const mutedColors = new Map<string, string>();
function muted(hex = '#888888'): string {
  let m = mutedColors.get(hex);
  if (!m) {
    const [r, g, b] = [1, 3, 5].map((i, k) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.55 + INK.sky[k] * 0.45));
    m = `rgb(${r}, ${g}, ${b})`;
    mutedColors.set(hex, m);
  }
  return m;
}

/** A time's label with its number apart from its unit, as the headline sets them: "66.038" and "Ma". */
export function splitLabel(label: string): [string, string] {
  const m = /^(.*\d)\s+(Ma|Ga|ka|BP|BCE|CE|[GMk]yr from now)$/.exec(label);
  return m ? [m[1], m[2]] : [label, ''];
}

/** Beyond the calendar's reach, the moment in words: "66 million years before present". */
export function gloss(t: number): string {
  if (historical(t)) return '';
  const age = PRESENT_YEAR - t;
  const a = Math.abs(age);
  const three = (x: number) => Number(x.toPrecision(3)).toLocaleString('en-US');
  const words = a >= 1e9 ? `${three(a / 1e9)} billion` : a >= 1e6 ? `${three(a / 1e6)} million` : three(a);
  return `${words} years ${age < 0 ? 'from now' : 'before present'}`;
}

const PLAY = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.6l7.4 4.4L3 10.4z" fill="currentColor"/></svg>';
const PAUSE = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5H5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor"/></svg>';

/** A dated record on the track: where it starts, and where it ends if it ended. */
interface TrackItem {
  entry: SearchEntry;
  start: number;
  end: number | null;
}

/**
 * A state of the planet along the time control, drawn as a thin band under the track: a
 * phase of the planet's record, or an episode such as a glaciation drawn over the phases.
 */
export interface StateBand {
  /** the record it opens */
  id: string;
  label: string;
  start: number;
  end: number;
  color: string;
  /** an episode, drawn over the phases */
  over: boolean;
}

export interface TimebarCallbacks {
  onTime(t: number): void;
  onWindow(w: Win): void;
  onPlay(): void;
  /** a record on the track was chosen */
  onRecord(id: string): void;
  /** a state of the planet was chosen, on the band under the track */
  onState(b: StateBand): void;
}

export class Timebar {
  readonly el: HTMLElement;
  /** the moment shown, read large: its number and unit, in words, and the periods it falls in (main.ts places it) */
  readonly readout: HTMLElement;
  private canvas: HTMLCanvasElement;
  private playBtn: HTMLButtonElement;
  private tip: HTMLElement;
  private rowsCaption: HTMLElement;
  private t = 0;
  private win: Win;
  private drag: { mode: 'scrub' | 'pan'; x: number; win: Win } | null = null;
  /** the pointers down on the strip, where each is along it */
  private pointers = new Map<number, number>();
  /** two fingers on the strip: the window, where they were and how far apart when they came down, and the time before the first scrubbed it */
  private pinch: { win: Win; mid: number; span: number } | null = null;
  private before: number | null = null;
  private keyframes: number[] = [];
  private track: TrackItem[] = [];
  private states: StateBand[] = [];
  private hovered: TrackItem | StateBand | PeriodRecord | null = null;
  /** times lit up on the track: the fossils of the group chosen in the tree of life */
  private lit: number[] = [];
  /** the ranks of the two rows, as last drawn for the window */
  private strata: [string, string] = ['era', 'period'];
  /** what the cursor's flag says */
  private flag = '';
  private playing: boolean | null = null;
  /** the periods the readout names, by their ids */
  private named = '';
  private hatch: CanvasPattern | null = null;

  /** the periods as the current scenario dates them */
  private periods: PeriodRecord[];
  /** whether the screen is short, and the strip's rows are a short screen's */
  private short: MediaQueryList;

  constructor(
    private all: PeriodRecord[],
    private limits: Win,
    /** the time span the build has data for */
    private dataRange: Win,
    private cb: TimebarCallbacks,
  ) {
    this.win = limits;
    this.periods = all;
    this.short = matchMedia(SHORT_SCREEN);
    this.short.addEventListener('change', () => this.draw());
    this.el = document.createElement('div');
    this.el.className = 'timebar';
    this.el.innerHTML = `
      <div class="tb-main">
        <button class="tb-play" aria-label="Play"></button>
        <div class="tb-strip">
          <canvas class="tb-canvas" aria-label="Time control: drag to move through time, scroll to zoom, drag the ruler to pan; the rows under the ruler are the named periods, and the track under them the dated records"></canvas>
          <div class="tb-tip" hidden></div>
        </div>
        <div class="tb-foot"><span class="tb-rows"></span><span><span class="fine">Scroll to zoom</span><span class="coarse">Pinch to zoom</span> · drag to move through time</span></div>
        <div class="tb-zoom">
          <button class="tb-zoom-in" aria-label="Zoom in on time" title="Zoom in (or scroll on the strip)"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8"/></svg></button>
          <button class="tb-zoom-out" aria-label="Zoom out on time" title="Zoom out"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8"/></svg></button>
          <button class="tb-reset" aria-label="Show the whole time range" title="Whole range"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 4.2V1.5h2.7M7.8 1.5h2.7v2.7M10.5 7.8v2.7H7.8M4.2 10.5H1.5V7.8"/></svg></button>
        </div>
      </div>`;
    this.canvas = this.el.querySelector('canvas')!;
    this.playBtn = this.el.querySelector('.tb-play')!;
    this.tip = this.el.querySelector('.tb-tip')!;
    this.rowsCaption = this.el.querySelector('.tb-rows')!;
    this.readout = document.createElement('div');
    this.readout.className = 'tb-readout';
    this.readout.setAttribute('aria-live', 'polite');
    this.readout.innerHTML = '<strong><span class="value"></span> <span class="unit"></span></strong><p class="tb-gloss"></p><div class="tb-periods"></div>';
    this.playBtn.onclick = () => this.cb.onPlay();
    this.el.querySelector<HTMLButtonElement>('.tb-zoom-in')!.onclick = () => this.zoom(2, this.t);
    this.el.querySelector<HTMLButtonElement>('.tb-zoom-out')!.onclick = () => this.zoom(0.5, this.t);
    this.el.querySelector<HTMLButtonElement>('.tb-reset')!.onclick = () => this.cb.onWindow(this.limits);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.up(e));
    this.canvas.addEventListener('pointerleave', () => this.hover(null));
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const x = e.offsetX;
      this.zoom(Math.exp(-e.deltaY * 0.0015), tOf(x, this.win, this.width()), x / this.width());
    }, { passive: false });
    this.canvas.addEventListener('dblclick', (e) => this.dbl(e));
    // The strip's numbers are drawn in the viewer's type, which may arrive after the first drawing.
    document.fonts?.load(`${TALL.tick}px ${MONO}`).then(() => this.draw(), () => {});
  }

  setKeyframes(years: number[]): void {
    this.keyframes = years;
  }

  /** The records on the track, each at its start in the default picture. */
  setRecords(entries: SearchEntry[]): void {
    this.track = entries
      .filter((e) => e.time.start.best !== null && Number.isFinite(e.time.start.best))
      .map((e) => ({ entry: e, start: e.time.start.best!, end: e.time.instant ? null : e.time.end.best }))
      .sort((a, b) => a.start - b.start);
  }

  /** Times to light up on the track. */
  setLit(times: number[]): void {
    this.lit = times;
    this.draw();
  }

  /** The planet's states, under the track. */
  setStates(bands: StateBand[]): void {
    this.states = bands;
    this.draw();
  }

  /** Date the periods as a scenario's alternatives do (period boundaries are claims too). */
  setScenario(s: Scenario): void {
    this.periods = this.all.map((p) => ({ ...p, ...lookup(p.variants, { alts: s.alts }, { start: p.start, end: p.end }) }));
  }

  /** How many years `px` pixels of the strip span at time t. */
  yearsPerPixels(t: number, px: number): number {
    const w = this.width();
    return Math.abs(tOf(Math.min(w, xOf(t, this.win, w) + px), this.win, w) - t) || Math.abs(t - tOf(Math.max(0, xOf(t, this.win, w) - px), this.win, w));
  }

  /** The time a fraction of the strip's width after t (before it, if negative), within the data. */
  stepFrom(t: number, fraction: number): number {
    const w = this.width();
    const next = tOf(xOf(t, this.win, w) + fraction * w, this.win, w);
    return Math.max(this.dataRange[0], Math.min(this.dataRange[1], next));
  }

  private width(): number {
    return this.canvas.clientWidth || 1;
  }

  private get rows(): Rows {
    return this.short.matches ? SHORT : TALL;
  }

  private height(): number {
    const r = this.rows;
    return r.ruler + r.above + 2 * r.band + r.between + r.below + r.track + r.pad;
  }

  /** Where each row of periods starts, down the strip. */
  private bandTops(): [number, number] {
    const r = this.rows;
    return [r.ruler + r.above, r.ruler + r.above + r.band + r.between];
  }

  private zoom(factor: number, tp: number, s?: number): void {
    const frac = s ?? Math.min(1, Math.max(0, xOf(tp, this.win, this.width()) / this.width()));
    this.cb.onWindow(zoomAround(this.win, tp, frac, factor, this.limits));
  }

  /** The track item under a point of the strip, if any: above the band of the planet's states, within `reach` pixels of the point. */
  private itemAt(x: number, y: number, reach = 7): TrackItem | null {
    const { track: TRACK, pad: PAD } = this.rows;
    const top = this.height() - PAD - TRACK;
    if (y < top - 2 || y >= top + TRACK - 5) return null;
    let best: TrackItem | null = null;
    let bestD = reach;
    for (const it of this.track) {
      const d = Math.abs(xOf(it.start, this.win, this.width()) - x);
      if (d < bestD) (best = it), (bestD = d);
    }
    return best;
  }

  /** The planet's state under a point of its band, if any: an episode before the phase it is in. */
  private stateAt(x: number, y: number): StateBand | null {
    const { track: TRACK, pad: PAD } = this.rows;
    const top = this.height() - PAD - TRACK;
    if (y < top + TRACK - 5 || y > top + TRACK + PAD) return null;
    const t = tOf(x, this.win, this.width());
    const here = this.states.filter((b) => b.start <= t && t < b.end);
    return here.find((b) => b.over) ?? here[0] ?? null;
  }

  /** The named period under a point of the rows of periods: of the row's rank, or the coarser one drawn where it has none. */
  private bandAt(x: number, y: number): PeriodRecord | undefined {
    const tops = this.bandTops();
    const row = tops.findIndex((top) => y >= top - 2 && y < top + this.rows.band + 2);
    if (row < 0) return undefined;
    const t = tOf(x, this.win, this.width());
    if (t > PRESENT_YEAR) return undefined;
    for (let k = RANKS.indexOf(this.strata[row]); k >= 0; k--) {
      const p = this.periodAt(t, RANKS[k]);
      if (p) return p;
    }
    return undefined;
  }

  private hover(it: TrackItem | StateBand | PeriodRecord | null, px = 0): void {
    if (it === this.hovered) return;
    this.hovered = it;
    this.canvas.style.cursor = it && !('rank' in it) ? 'pointer' : '';
    if (!it) {
      this.tip.hidden = true;
    } else {
      let x = px;
      if ('entry' in it) {
        const when = it.end !== null && it.end !== it.start ? `${formatTime(it.start)} – ${formatTime(it.end)}` : formatTime(it.start);
        this.tip.textContent = `${it.entry.label} · ${when}`;
        x = xOf(it.start, this.win, this.width());
      } else if ('rank' in it) {
        const end = Number.isFinite(it.end) && it.end < PRESENT_YEAR ? formatTime(it.end) : 'today';
        this.tip.textContent = `${it.name}, ${it.rank} · ${formatTime(it.start)} – ${end}`;
      } else {
        const when = Number.isFinite(it.end) ? `${formatTime(it.start)} – ${formatTime(it.end)}` : `from ${formatTime(it.start)}`;
        this.tip.textContent = `${it.label} · ${when}`;
      }
      this.tip.hidden = false;
      this.tip.style.left = `${Math.max(4, Math.min(this.width() - 220, x - 40))}px`;
    }
    this.draw();
  }

  private down(e: PointerEvent): void {
    // The first pointer down starts afresh, whatever was missed of the last gesture. A mouse has no second finger.
    if (e.isPrimary) {
      this.pointers.clear();
      this.pinch = null;
    }
    if (e.pointerType !== 'mouse') this.pointers.set(e.pointerId, e.offsetX);
    if (this.pointers.size === 2) {
      // A second finger: the two zoom the window between them, and the time goes back to where it was before the first moved it.
      if (this.drag?.mode === 'scrub' && this.before !== null) this.cb.onTime(this.before);
      this.drag = null;
      this.canvas.setPointerCapture(e.pointerId);
      const [a, b] = [...this.pointers.values()];
      this.pinch = { win: this.win, mid: (a + b) / 2, span: Math.abs(b - a) };
      return;
    }
    if (this.pointers.size > 2) return;
    // A finger is broader than a pointer: the record nearest it is reached from further off.
    const it = this.itemAt(e.offsetX, e.offsetY, e.pointerType === 'touch' ? 14 : 7);
    if (it) {
      this.cb.onRecord(it.entry.id);
      return;
    }
    const st = this.stateAt(e.offsetX, e.offsetY);
    if (st) {
      this.cb.onState(st);
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    const mode = e.offsetY < this.rows.ruler || e.shiftKey ? 'pan' : 'scrub';
    this.drag = { mode, x: e.offsetX, win: this.win };
    this.before = this.t;
    if (mode === 'scrub') this.scrubTo(e.offsetX);
  }

  private move(e: PointerEvent): void {
    const pressed = this.pointers.has(e.pointerId);
    if (pressed) this.pointers.set(e.pointerId, e.offsetX);
    if (this.pinch) {
      if (this.pointers.size < 2) return;
      // The time between the fingers when they came down stays between them, and the window grows or shrinks with their spread.
      const [a, b] = [...this.pointers.values()];
      const p = this.pinch;
      const w = this.width();
      const zoomed = zoomAround(p.win, tOf(p.mid, p.win, w), p.mid / w, Math.max(8, Math.abs(b - a)) / Math.max(8, p.span), this.limits);
      this.cb.onWindow(panWindow(zoomed, (a + b) / 2 - p.mid, w, this.limits));
      return;
    }
    if (!this.drag) {
      if (!pressed) this.hover(this.itemAt(e.offsetX, e.offsetY) ?? this.stateAt(e.offsetX, e.offsetY) ?? this.bandAt(e.offsetX, e.offsetY) ?? null, e.offsetX);
      return;
    }
    if (this.drag.mode === 'scrub') this.scrubTo(e.offsetX);
    else {
      this.cb.onWindow(panWindow(this.drag.win, e.offsetX - this.drag.x, this.width(), this.limits));
    }
  }

  private up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    // A finger left after two does nothing more until it lifts.
    if (this.pinch && this.pointers.size < 2) this.pinch = null;
    this.drag = null;
  }

  private scrubTo(x: number): void {
    const t = tOf(Math.max(0, Math.min(this.width(), x)), this.win, this.width());
    this.cb.onTime(Math.max(this.dataRange[0], Math.min(this.dataRange[1], t)));
  }

  /** Fit the window to a named period, and move into it if the time shown is outside it. */
  private fit(p: PeriodRecord): void {
    this.cb.onWindow(fitWindow(p.start, Math.min(p.end, PRESENT_YEAR), this.limits));
    if (this.t < p.start || this.t > p.end) this.cb.onTime(Math.max(this.dataRange[0], Math.min(this.dataRange[1], (p.start + Math.min(p.end, PRESENT_YEAR)) / 2)));
  }

  private dbl(e: MouseEvent): void {
    const p = this.bandAt(e.offsetX, e.offsetY);
    if (p) this.fit(p);
  }

  /** The named period of a rank at time t. */
  periodAt(t: number, rank: string): PeriodRecord | undefined {
    return this.periods.find((p) => p.rank === rank && p.start <= t && t <= p.end);
  }

  set(t: number, win: Win, playing: boolean): void {
    this.t = t;
    this.win = win;
    if (this.playing !== playing) {
      this.playing = playing;
      this.playBtn.innerHTML = playing ? PAUSE : PLAY;
      this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    const label = t === PRESENT_YEAR ? 'Today' : formatTime(t, this.yearsPerPixels(t, 1));
    // The periods it falls in: the finest named, its period, and its era (or eon), at most three.
    const at = (rank: string) => this.periodAt(t, rank);
    const finest = ['stage', 'epoch', 'period', 'era', 'eon'].map(at).find(Boolean);
    const named = [finest, at('period'), at('era') ?? at('eon'), at('eon')].filter((p, i, all): p is PeriodRecord => !!p && all.indexOf(p) === i).slice(0, 3);
    this.showReadout(label, gloss(t), named);
    this.flag = finest ? `${label} · ${finest.name}` : label;
    this.draw();
  }

  /** The headline: written only where it changed, so that its buttons keep the pointer and the focus. */
  private showReadout(label: string, words: string, named: PeriodRecord[]): void {
    const [value, unit] = splitLabel(label);
    const set = (sel: string, text: string) => {
      const el = this.readout.querySelector<HTMLElement>(sel)!;
      if (el.textContent !== text) el.textContent = text;
    };
    set('.value', value);
    set('.unit', unit);
    set('.tb-gloss', words);
    // A long date is set smaller, so that the headline keeps to its corner.
    this.readout.classList.toggle('mid', value.length > 7 && value.length <= 11);
    this.readout.classList.toggle('long', value.length > 11);
    const key = named.map((p) => p.id).join(' ');
    if (key === this.named) return;
    this.named = key;
    this.readout.querySelector('.tb-periods')!.replaceChildren(
      ...named.map((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tb-period';
        b.style.setProperty('--c', p.color ?? '');
        const end = Number.isFinite(p.end) && p.end < PRESENT_YEAR ? formatTime(p.end) : 'today';
        b.title = `${p.name}, ${p.rank}: ${formatTime(p.start)} – ${end}. Fit the time control to it`;
        b.append(document.createElement('i'), p.name);
        b.onclick = () => this.fit(p);
        return b;
      }),
    );
  }

  /**
   * The ranks of the two rows for the window: the finest whose periods in view are mostly wide enough to tell apart, and
   * the rank above it. Zoomed out, eras and periods; zoomed in, epochs and stages.
   */
  private chooseStrata(w: number): [string, string] {
    const end = Math.min(this.win[1], PRESENT_YEAR);
    for (let i = RANKS.length - 1; i > 0; i--) {
      const widths = this.periods
        .filter((p) => p.rank === RANKS[i] && p.end > this.win[0] && p.start < end)
        .map((p) => Math.min(w, xOf(Math.min(p.end, PRESENT_YEAR), this.win, w)) - Math.max(0, xOf(p.start, this.win, w)))
        .sort((a, b) => a - b);
      if (widths.length && widths[widths.length >> 1] >= LEGIBLE) return [RANKS[i - 1], RANKS[i]];
    }
    return [RANKS[0], RANKS[1]];
  }

  /** After the present nothing is charted: a hatch in the colour of what is projected. */
  private hatchOf(g: CanvasRenderingContext2D): CanvasPattern | string {
    if (!this.hatch) {
      const c = document.createElement('canvas');
      c.width = c.height = 6;
      const p = c.getContext('2d')!;
      p.strokeStyle = 'rgba(234, 68, 191, 0.55)';
      p.lineWidth = 1.4;
      p.beginPath();
      for (const d of [-6, 0, 6]) {
        p.moveTo(d, 6);
        p.lineTo(d + 6, 0);
      }
      p.stroke();
      this.hatch = g.createPattern(c, 'repeat');
    }
    return this.hatch ?? 'rgba(234, 68, 191, 0.25)';
  }

  draw(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.width();
    const h = this.height();
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.height = `${h}px`;
    }
    const g = this.canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const x = (t: number) => xOf(t, this.win, w);
    const R = this.rows;

    // Two rows of the chart, muted: each of its rank, over the coarser ranks where it has no period (the Hadean has no eras).
    this.strata = this.chooseStrata(w);
    const tops = this.bandTops();
    this.strata.forEach((rank, row) => {
      for (let k = 0; k <= RANKS.indexOf(rank); k++) {
        for (const p of this.periods) {
          if (p.rank !== RANKS[k] || p.end < this.win[0] || p.start > this.win[1]) continue;
          const x0 = Math.max(0, x(p.start));
          const x1 = Math.min(w, x(Math.min(p.end, PRESENT_YEAR)));
          if (x1 - x0 < 0.5) continue;
          g.fillStyle = p === this.hovered ? (p.color ?? '#888') : muted(p.color);
          g.fillRect(x0, tops[row], x1 - x0, R.band);
        }
      }
      if (this.win[1] > PRESENT_YEAR) {
        const px = Math.max(0, x(PRESENT_YEAR));
        g.fillStyle = this.hatchOf(g);
        g.fillRect(px, tops[row], w - px, R.band);
      }
    });
    const caption = `${PLURAL[this.strata[0]].replace(/^./, (c) => c.toUpperCase())} and ${PLURAL[this.strata[1]]}`;
    if (this.rowsCaption.textContent !== caption) this.rowsCaption.textContent = caption;

    // The track: dated records, a dot at each start and a line to the end of what has ended.
    const top = h - R.pad - R.track;
    const ty = top + R.track / 2;
    for (const it of this.track) {
      const x0 = x(it.start);
      const x1 = it.end !== null && it.end > it.start ? Math.min(w, x(it.end)) : x0;
      if (x1 < -4 || x0 > w + 4) continue;
      const on = it === this.hovered;
      if (x1 > x0) {
        g.fillStyle = on ? INK.text : 'rgba(233, 236, 242, 0.18)';
        g.fillRect(Math.max(0, x0), ty - 1, Math.max(1, x1 - Math.max(0, x0)), 2);
      }
      g.fillStyle = on ? INK.text : 'rgba(233, 236, 242, 0.32)';
      g.beginPath();
      g.arc(x0, ty, on ? 4 : 2, 0, 2 * Math.PI);
      g.fill();
    }
    g.fillStyle = '#ffc45c';
    for (const lit of this.lit) {
      const px = x(lit);
      if (px >= -2 && px <= w + 2) g.fillRect(px - 1, ty - 5, 2, 10);
    }

    // The planet's states, a thin band under the track: its phases, then episodes over them.
    for (const b of [...this.states.filter((s) => !s.over), ...this.states.filter((s) => s.over)]) {
      if (b.end < this.win[0] || b.start > this.win[1]) continue;
      const x0 = Math.max(0, x(b.start));
      const x1 = Math.min(w, Number.isFinite(b.end) ? x(b.end) : w);
      if (x1 - x0 < 0.5) continue;
      g.fillStyle = b.color;
      g.globalAlpha = b === this.hovered ? 1 : 0.75;
      g.fillRect(x0, top + R.track - 4, Math.max(1, x1 - x0), 3);
    }
    g.globalAlpha = 1;

    // Outside the data range: dim it.
    g.fillStyle = 'rgba(3, 4, 11, 0.7)';
    if (this.win[0] < this.dataRange[0]) g.fillRect(0, R.ruler, Math.max(0, x(this.dataRange[0])), h - R.ruler);
    if (this.win[1] > this.dataRange[1]) {
      const x1 = Math.min(w, x(this.dataRange[1]));
      g.fillRect(x1, R.ruler, w - x1, h - R.ruler);
    }

    // The cursor's flag, first, so that the ruler's numbers keep clear of it.
    const cx = x(this.t);
    const showCursor = cx >= -1 && cx <= w + 1;
    const flagH = R.ruler - 5;
    g.font = `600 ${R.flag}px ${SANS}`;
    const fw = g.measureText(this.flag).width + 14;
    const fx = Math.max(0, Math.min(w - fw, cx - fw / 2));
    const clear: [number, number][] = showCursor ? [[fx - 8, fx + fw + 8]] : [];

    // The ruler: its line, the fields' keyframes, then ticks and their numbers; and now, where the window is wide.
    g.fillStyle = 'rgba(233, 236, 242, 0.2)';
    g.fillRect(0, R.ruler - 1, w, 1);
    g.fillStyle = 'rgba(233, 236, 242, 0.3)';
    const kx = this.keyframes.map(x).filter((v) => v >= 0 && v <= w);
    if (kx.length < 2 || kx.every((v, i) => i === 0 || Math.abs(v - kx[i - 1]) > 4)) for (const v of kx) g.fillRect(v - 0.5, R.ruler - 4, 1, 3);
    g.font = `500 ${R.tick}px ${MONO}`;
    g.textBaseline = 'middle';
    const labelY = (R.ruler - 4) / 2;
    const free = (a: number, b: number) => !clear.some(([c, d]) => a < d && c < b);
    const nx = x(PRESENT_YEAR);
    if (this.win[1] - this.win[0] > 2e4 && nx >= 0 && nx <= w) {
      const tw = g.measureText('now').width;
      const lx = Math.min(w - tw - 2, Math.max(2, nx - tw / 2));
      g.fillStyle = INK.text;
      g.fillRect(nx, R.ruler - 6, 1, 5);
      if (free(lx, lx + tw)) {
        g.fillText('now', lx, labelY);
        clear.push([lx - 6, lx + tw + 6]);
      }
    }
    g.fillStyle = INK.faint;
    for (const { t, label } of rulerTicks(this.win, x, (v) => tOf(v, this.win, w), 72)) {
      const rx = x(t);
      const tw = g.measureText(label).width;
      const lx = Math.min(w - tw - 2, Math.max(2, rx - tw / 2));
      g.fillRect(rx, R.ruler - 5, 1, 4);
      if (free(lx, lx + tw)) g.fillText(label, lx, labelY);
    }

    // The cursor: an amber line down the strip from its flag, which reads the time and the period.
    if (showCursor) {
      g.fillStyle = INK.accent;
      g.fillRect(cx - 0.75, flagH, 1.5, h - flagH);
      g.beginPath();
      if (g.roundRect) g.roundRect(fx, 0, fw, flagH, 5);
      else g.rect(fx, 0, fw, flagH);
      g.fill();
      g.font = `600 ${R.flag}px ${SANS}`;
      g.fillStyle = INK.onAccent;
      g.fillText(this.flag, fx + 7, flagH / 2 + 0.5);
    }
  }
}
