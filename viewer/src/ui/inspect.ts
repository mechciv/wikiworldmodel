import { isFootprint } from '../../../core/footprint.ts';
import { inspectFootprint } from './footprint.ts';
// The inspect panel: what something is, when and where, every claim with its sources and
// locators, the competing claims (which can be picked), its relations and the ones other
// records make to it, and what the derived dates rest on.
import type { ClimateClass } from '../../../core/climate.ts';
import type { Cover } from '../../../core/planet.ts';
import type { LivingTaxon, SceneSpec } from '../../../core/scene.ts';
import type { CitationRecord, ClaimRecord, EntityRecord, OverlaysFile, SeriesRecord, SourceRecord } from '../../../core/records.ts';
import { LEVEL_LABEL } from '../../../core/ladder.ts';
import { SPREAD_TEXT, type FieldSpread } from '../../../core/samples.ts';
import type { Answer } from '../../../core/resolve.ts';
import { bedrockWords, substrateWords } from '../../../core/substrate.ts';
import { splitRef } from '../../../core/refs.ts';
import { lookup, scenarioKey, type Scenario } from '../../../core/scenario.ts';
import type { Estimate, FeatureTime } from '../../../core/tileset.ts';
import { formatTime, fromMa, historical, parseTime, PRESENT_YEAR, type TimeInput } from '../../../core/time.ts';
import { PATTERN_LABEL } from '../../../core/landscape.ts';
import { stageWords, thinWords } from './lifewords.ts';
import type { PlaceLandscape } from '../city/landscape.ts';

const PATTERN_WORDS: Record<string, string> = PATTERN_LABEL;

import { esc, safeHref } from './html.ts';

export function short(s: SourceRecord | undefined, ref: string): string {
  if (!s) return ref;
  const names = (s.authors ?? []).map((a) => a.split(',')[0]);
  const who = names.length === 0 ? s.container ?? s.title ?? s.id : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} et al.`;
  // A text is cited by its author, as classicists do; its edition's year is not when it was written.
  return s.published && s.type !== 'text' ? `${who} ${s.published}` : who;
}

const finite = (x: number) => Number.isFinite(x);

/** The precision an estimate supports: a day or a month where its bounds are that close, else a year (or the age's). */
const resolutionOf = (e: Estimate) => (finite(e.lo) && finite(e.hi) && historical(e.lo) && e.hi - e.lo < 1 ? Math.max(e.hi - e.lo, 1e-6) : 1e3);

function fmtEstimate(e: Estimate, open: 'start' | 'end', unknown = false): string {
  const res = resolutionOf(e);
  // An upper bound is where the last unit inside it ends: 16 March for a moment on 15 March.
  const upper = (x: number) => formatTime(historical(x) ? x - 1e-7 : x, res);
  if (e.best === null && open === 'end') return unknown ? 'end unknown' : 'still exists';
  if (e.best === null) return finite(e.lo) ? `unknown, no earlier than ${formatTime(e.lo, res)}` : finite(e.hi) ? `unknown, no later than ${upper(e.hi)}` : 'unknown';
  const main = formatTime(e.best, res);
  const lo = finite(e.lo) ? formatTime(e.lo, res) : null;
  const hi = finite(e.hi) ? upper(e.hi) : null;
  let range = '';
  if (lo && hi && lo !== hi) range = ` (${lo} – ${hi})`;
  else if (lo && !hi && lo !== main) range = ` (no earlier than ${lo})`;
  else if (!lo && hi && hi !== main) range = ` (no later than ${hi})`;
  return `${main}${range}`;
}

export function fmtTime(t: FeatureTime): string {
  if (t.instant) return fmtEstimate(t.start, 'start');
  return `${fmtEstimate(t.start, 'start')} → ${fmtEstimate(t.end, 'end', t.endUnknown)}`;
}

const PROP_LABEL: Record<string, string> = {
  name: 'Name',
  date: 'Date',
  start: 'Start',
  end: 'End',
  earlier_than: 'Earlier than',
  later_than: 'Later than',
  location: 'Location',
  frame: 'Frame',
  identified_as: 'Identified as',
  formation: 'Formation',
  diameter: 'Diameter',
  area: 'Area',
  color: 'Chart colour',
  surface: 'Surface',
  atmosphere: 'Atmosphere',
  ice_reach: 'Ice reached',
  territory: 'Territory',
};

/** A property with no label of its own, in words: sea_level as "Sea level". */
const words = (prop: string) => prop.charAt(0).toUpperCase() + prop.slice(1).replace(/_/g, ' ');

const REL_LABEL: Record<string, string> = {
  before: 'before',
  after: 'after',
  during: 'during',
  contains: 'contains',
  'part-of': 'part of',
  'has-part': 'has part',
  'member-of': 'member of',
  'has-member': 'has member',
  'caused-by': 'caused by',
  caused: 'caused',
  'descends-from': 'descends from',
  'gave-rise-to': 'gave rise to',
  carries: 'carries',
};

export interface InspectCallbacks {
  /** pick a competing claim over its group's default (null: back to the default) */
  onPick(group: string[], claim: string | null): void;
  onClose(): void;
  onOpen(entityId: string): void;
  labelOf(ref: string): string;
  altTitle(id: string): string;
  /** who held a perspective, and when, if the records say */
  altHeld?(id: string): { id: string; label: string; held?: string }[] | undefined;
}

/** Who held a perspective, in words: "held by Tlatelolco (1550 CE – 1555 CE) and …". */
export function heldText(held: { label: string; held?: string }[] | undefined): string {
  if (!held?.length) return '';
  const each = held.map((h) => `${h.label}${h.held ? ` (${h.held})` : ''}`);
  return `held by ${each.length > 1 ? `${each.slice(0, -1).join(', ')} and ${each.at(-1)}` : each[0]}`;
}

export interface TerrainInfo {
  /** elevation: metres of the time; blocks: positive inside a continental block */
  mode: 'elevation' | 'blocks';
  lat: number;
  lon: number;
  elevation: number;
  plate: number | null;
  plateLabel?: string;
  keyframes: [number, number];
  mix: number;
  t: number;
  source: SourceRecord | undefined;
  fieldTitle: string;
  fieldDescription?: string;
  /** how the field carries its uncertainty */
  fieldSpread?: FieldSpread;
  coastline?: string;
  datum?: string;
  /** for a field of today's ground: the sea level of the time, relative to today's, and the series it is read from */
  seaLevel?: { m: number; title: string };
  state?: PlanetStateInfo;
  /** what covers the land here: the class the climate field gives, and which transitions have happened */
  biome?: BiomeHere;
  /** the state a borders dataset draws here, at this time */
  polity?: { name: string; from: number; to: number; area: number; wikipedia?: string; source?: SourceRecord; row?: RowInfo };
  /** what a grid of people gives for the cell here, at this time, if it is drawn */
  people?: PeopleHere;
  /** what the ice-sheet field gives here, where it has any ice near */
  ice?: IceHere;
  /** how people lived here, as the human landscape has it at this time */
  landscape?: LandscapeHere;
}

/** How people lived where a click fell, at the time shown (docs/HUMAN-LANDSCAPE.md). */
export interface LandscapeHere {
  place: PlaceLandscape;
  /** the anthromes' class there, and their field's title */
  className: string;
  title: string;
  /** the step read, and the people per km² a scene draws there */
  density?: number;
  regionUses?: string[];
  cities: { name: string; people: number; km: number; list: string; also: { people: number; list: string }[]; record?: string; band?: [number, number] }[];
  /** whose houses a scene draws here, in words: "herders", "townspeople"; and whose house stands in for theirs, if one does */
  whose?: string;
  kin?: string;
  tradition?: { id: string; label: string; dwelling: string };
}

/** The ice-sheet field at a place and time: what it gives, and how far to trust it. */
export interface IceHere {
  title: string;
  /** the globe draws ice here at this time */
  drawn: boolean;
  /** between its keyframes, in metres */
  thickness: number;
  marginM: number;
  /** the keyframes read, and their thickness here */
  at: { ageMa: number; thickness: number }[];
  /** where the dataset gives several for this time: the scenario drawn, and the others */
  scenario?: { id: string; title: string };
  others: { id: string; title: string; thickness: number; drawn: boolean }[];
  uncertainty?: string;
  /** after the present: why the youngest keyframe is held */
  held?: string;
  source?: SourceRecord;
}

/** What a grid of people gives for the cell a click fell in, at the time shown. */
export interface PeopleHere {
  t: number;
  /** the cell's south-west corner, and how wide it is, in degrees */
  south: number;
  west: number;
  res: number;
  /** how many people it holds at this time */
  people: number;
  /** its land in km², which may be none */
  land: number;
  /** the two time steps it lies between, the same one if it is on a step, and what the dataset gives at each */
  from: { step: number; people: number };
  to: { step: number; people: number };
  /** the range the authors give for their numbers at this time, in percent either way */
  range?: number;
  description?: string;
  source?: SourceRecord;
}

/** A time step of the grid, as the dataset labels it. The axis reads the labels as they stand, so it would call 0 AD 1 BCE. */
export const stepName = (step: number) => (step < 0 ? `${(-step).toLocaleString('en-US')} BC` : `${step} AD`);

/** The land's cover at a place and time, and what it rests on. */
export interface BiomeHere {
  climate: ClimateClass;
  label: string;
  cover: Cover;
  /** a field says where the ice sheets are at this time, and the climate's own reading of ice gives way to it */
  sheets?: boolean;
  title: string;
  /** the transitions that have happened by this time, and the next that has not */
  transitions: { id: string; label: string }[];
  next?: { id: string; label: string };
  rule: string;
  ruleSource?: SourceRecord;
}

/** In words, what the globe paints: the climate's class, as far as the transitions have gone. */
export function coverWords(b: Pick<BiomeHere, 'climate' | 'cover' | 'sheets'>): string {
  const { climate, cover } = b;
  if (climate === 'ice') return b.sheets ? 'Bare ground that never thaws' : 'Ice';
  if (cover.plants <= 0) return cover.crust > 0 ? 'Bare ground, under microbial crusts' : 'Bare rock and sand';
  if (climate === 'desert') return 'Desert';
  if (climate === 'tundra') return cover.plants < 0.5 ? 'Bare ground and the first low plants' : 'Tundra';
  if (climate === 'steppe') return cover.grasses > 0.5 ? 'Grassland' : 'Low plants and scrub';
  if (climate === 'savanna') return cover.grasses > 0.5 ? 'Savanna: grass and scattered trees' : cover.forests > 0.5 ? 'Dry woodland' : 'Low plants';
  if (cover.forests < 0.5) return 'Low plants, without forests yet';
  return climate === 'rainforest' ? 'Tropical rain forest' : climate === 'cold' ? 'Cold-winter forest' : 'Temperate forest';
}

/** The planet's phase and ice at the time shown, and the records that say so. */
export interface PlanetStateInfo {
  planet: string;
  phase: string;
  /** the state the phase is passing into, where its record says the change was gradual, and how far it has gone, 0–1 */
  into?: { label: string; passed: number };
  ice?: { id: string; label: string; reach: string };
}

/** A taxon as a living scene draws it. */
export interface OrganismHere {
  taxon: LivingTaxon;
  site: string;
  slice: number;
  /** the stage of the chart it is drawn for, if it is a place with no scene of its own */
  stage?: string;
  fossils: SceneSpec['fossils'];
  generator: string;
  /** it is on the sea's list: its fossils are near or far by sea, and those of the region in a like belt of latitude */
  sea?: boolean;
}

const fmt = (x: number) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2));

/** Where a click on the globe fell inside a polity's territory: the dataset's row drawn there. */
export interface TerritoryHere {
  t: number;
  /** the dataset's name for the row, and the years it holds */
  name: string;
  from: number;
  to: number;
  area: number;
  source: SourceRecord | undefined;
}

/** A series' value at a time, with its band, interpolated between its points. */
export interface SeriesValue {
  value: number;
  lo: number | null;
  hi: number | null;
}

/** A number to three significant figures, as people write it. */
export const fmtValue = (x: number): string => {
  // Three significant figures however small: a pressure of 0.0000113 bar is not 0. A fraction is written as it is; the
  // locale's own formatter, which is quick, is kept for the rest, for its thousands.
  const three = (v: number) => {
    const r = Number(v.toPrecision(3));
    return Math.abs(r) < 1 ? String(r) : r.toLocaleString('en-US');
  };
  const size = Math.abs(x);
  return size >= 1e9 ? `${three(x / 1e9)} billion` : size >= 1e6 ? `${three(x / 1e6)} million` : three(x);
};

/** A row of a dataset, as a click finds it (docs/STRUCTURE.md section 3.1): its address, and what overlays say of it. */
export interface RowInfo {
  ref?: string;
  /** what overlays changed in it, by property */
  corrected?: string[];
  overlay?: OverlaysFile['rows'][string];
}

/** A row's address, for an overlay to name, and the overlay's claims on it beside the row's own. */
function rowSection(row: RowInfo | undefined): string {
  if (!row?.ref) return '';
  const claims = (row.overlay?.claims ?? [])
    .map((c) => `<li><span class="badge">${esc(c.origin === 'row' ? 'the row' : 'overlay')}</span> ${esc(words(c.prop))}: ${esc(typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value))}${c.rank !== 'normal' ? ` <span class="badge rank">${esc(c.rank)}</span>` : ''}${c.origin === 'overlay' ? ` <span class="author">${esc(c.author)}</span>` : ''}${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}${c.origin === 'overlay' ? c.sources.filter((x) => x.quote).map((x) => `<blockquote>${esc(x.quote!)}</blockquote>`).join('') : ''}</li>`)
    .join('');
  return `<section class="row"><h3>The row</h3><p class="method">Its address in the dataset, which an overlay names to correct it or tie it to a record: <code>${esc(row.ref)}</code></p>${row.corrected ? `<p class="note">An overlay corrects its ${esc(row.corrected.map(words).join(', '))}.</p>` : ''}${row.overlay?.same_as ? `<p class="method">It is a row of ${esc(row.overlay.same_as)}.</p>` : ''}${claims ? `<ul class="row-claims">${claims}</ul>` : ''}</section>`;
}

/** What a claim's checking badge says on hover: its level, then each step with who did it and how. */
function checkedTitle(c: ClaimRecord): string {
  return [LEVEL_LABEL[c.level], ...(c.checked ?? []).map((s) => `${s.step} by ${s.by}${s.on ? ` on ${s.on}` : ''}: ${s.how}`)].join('\n');
}

const CLOSE = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg>';

/** The properties whose values are times, which competing claims of can be set on a line. */
const TIME_PROPS = new Set(['date', 'start', 'end', 'earlier_than', 'later_than', 'end_before', 'start_before']);

/**
 * Competing claims of a time, as points on a line: each where it puts the time, with a bar for its spread (its 1σ, or the
 * span it gives), the one shown filled, the rest hollow. Nothing where fewer than two of them can be placed.
 */
export function dateLine(claims: { ref: string; value: unknown }[], shown: string | undefined, deprecated: (ref: string) => boolean): string {
  const placed = claims.flatMap((c) => {
    try {
      const v = parseTime(c.value as TimeInput);
      if (v.kind === 'normal') return [{ ref: c.ref, at: v.mean, lo: v.mean - v.sd, hi: v.mean + v.sd }];
      if (v.kind === 'instant') return [{ ref: c.ref, at: v.t, lo: v.t, hi: v.t }];
      if (v.kind === 'interval' && Number.isFinite(v.lo) && Number.isFinite(v.hi)) return [{ ref: c.ref, at: (v.lo + v.hi) / 2, lo: v.lo, hi: v.hi }];
    } catch {
      // A value the line cannot place (a period's name, a count of days) is left off it.
    }
    return [];
  });
  if (placed.length < 2) return '';
  let a = Math.min(...placed.map((p) => p.lo));
  let b = Math.max(...placed.map((p) => p.hi));
  const pad = (b - a) * 0.12 || 1;
  [a, b] = [a - pad, b + pad];
  const W = 336;
  const x = (t: number) => 8 + ((t - a) / (b - a)) * (W - 16);
  // Ticks at round steps, in the unit the times are read in: three to five of them.
  const deep = !historical(a) || !historical(b);
  const span = deep ? (b - a) / 1e6 : b - a;
  const mag = 10 ** Math.floor(Math.log10(Math.max(span, 1e-6)));
  const step = [0.2, 0.5, 1, 2, 5].map((m) => m * mag).find((st) => span / st <= 5) ?? 5 * mag;
  const ticks: number[] = [];
  if (deep) for (let ma = Math.ceil((PRESENT_YEAR - b) / 1e6 / step) * step; ma <= (PRESENT_YEAR - a) / 1e6 + 1e-9; ma += step) ticks.push(PRESENT_YEAR - ma * 1e6);
  else for (let y = Math.ceil(a / step) * step; y <= b; y += step) ticks.push(y);
  const label = (t: number) => (deep ? `${+((PRESENT_YEAR - t) / 1e6).toFixed(Math.max(0, -Math.floor(Math.log10(step))))}` : formatTime(t));
  const tickMarks = ticks
    .map((t) => `<line x1="${x(t).toFixed(1)}" y1="31" x2="${x(t).toFixed(1)}" y2="37" stroke="rgba(233,236,242,0.35)"/><text x="${x(t).toFixed(1)}" y="52" text-anchor="middle">${esc(label(t))}${deep && t === Math.max(...ticks) ? ' Ma' : ''}</text>`)
    .join('');
  const points = placed
    .sort((p, q) => Number(p.ref === shown) - Number(q.ref === shown))
    .map((p) => {
      const on = p.ref === shown;
      const ink = on ? 'var(--accent)' : 'var(--faint)';
      const bar = p.hi > p.lo ? `<line x1="${x(p.lo).toFixed(1)}" y1="34" x2="${x(p.hi).toFixed(1)}" y2="34" stroke="${ink}" stroke-width="${on ? 2 : 1.5}"/><line x1="${x(p.lo).toFixed(1)}" y1="29" x2="${x(p.lo).toFixed(1)}" y2="39" stroke="${ink}" stroke-width="1.5"/><line x1="${x(p.hi).toFixed(1)}" y1="29" x2="${x(p.hi).toFixed(1)}" y2="39" stroke="${ink}" stroke-width="1.5"/>` : '';
      const dot = on ? `<circle cx="${x(p.at).toFixed(1)}" cy="34" r="4.5" fill="var(--accent)"/>` : `<circle cx="${x(p.at).toFixed(1)}" cy="34" r="4" fill="var(--panel-solid)" stroke="var(--faint)" stroke-width="1.5"${deprecated(p.ref) ? ' stroke-dasharray="2 1.5"' : ''}/>`;
      return bar + dot;
    })
    .join('');
  const said = placed.map((p) => `${p.ref === shown ? 'shown: ' : ''}${formatTime(p.at)}`).join('; ');
  return `<svg class="dateline" viewBox="0 0 ${W} 58" role="img" aria-label="${esc(`The claims on a line of time: ${said}`)}"><line x1="8" y1="34" x2="${W - 8}" y2="34" stroke="rgba(233,236,242,0.22)"/>${tickMarks}${points}</svg>`;
}

/** A phone held upright, where the panel is a sheet over the foot of the view (style.css lays it out so). */
const UPRIGHT = '(max-width: 640px) and (min-height: 501px)';

export class InspectPanel {
  readonly el: HTMLElement;

  constructor(private cb: InspectCallbacks) {
    this.el = document.createElement('aside');
    this.el.className = 'inspect';
    this.el.hidden = true;
    this.el.setAttribute('aria-live', 'polite');
    // As a sheet, a tap on its head makes it as tall as the view or brings it back down, a drag leaves it where it is let
    // go, and a drag well down closes it.
    let held: { y: number; h: number; moved: boolean } | null = null;
    this.el.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (!matchMedia(UPRIGHT).matches || !t.closest('header') || t.closest('button, a, input, select, label')) return;
      held = { y: e.clientY, h: this.el.getBoundingClientRect().height, moved: false };
      t.setPointerCapture(e.pointerId);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!held) return;
      const dy = e.clientY - held.y;
      if (!held.moved && Math.abs(dy) < 6) return;
      held.moved = true;
      this.el.style.height = `${Math.max(64, held.h - dy)}px`;
    });
    const letGo = () => {
      if (!held) return;
      const { h, moved } = held;
      held = null;
      const now = this.el.getBoundingClientRect().height;
      this.el.style.height = '';
      if (!moved) return void this.el.classList.toggle('full');
      const room = this.el.parentElement?.clientHeight ?? now;
      if (now < Math.min(h, room / 2) * 0.6) return this.cb.onClose();
      this.el.classList.toggle('full', now > room * 0.62);
    };
    this.el.addEventListener('pointerup', letGo);
    this.el.addEventListener('pointercancel', letGo);
  }

  hide(): void {
    this.el.hidden = true;
    this.el.innerHTML = '';
    this.el.classList.remove('full');
  }

  private frame(title: string, body: string, kind?: string): void {
    this.el.innerHTML = `<header><div>${kind ? `<p class="eyebrow kind">${esc(kind)}</p>` : ''}<h2>${esc(title)}</h2></div><button class="close" aria-label="Close">${CLOSE}</button></header>${body}`;
    this.el.querySelector<HTMLButtonElement>('.close')!.onclick = () => this.cb.onClose();
    for (const a of this.el.querySelectorAll<HTMLAnchorElement>('a.open')) {
      a.onclick = (e) => {
        e.preventDefault();
        this.cb.onOpen(a.dataset.entity!);
      };
    }
    this.el.hidden = false;
  }

  /** The planet's state at the time, with links to the records it comes from. */
  private stateSection(s: PlanetStateInfo | undefined): string {
    if (!s) return '';
    // A passage is drawn part of the way to the next state: say so, and that its even pace is the drawing's and no record's.
    const passing = s.into ? `<p class="note passing">Passing little by little into the next state, ${esc(s.into.label)}: ${Math.round(s.into.passed * 100)}% of the way, drawn as if the change ran evenly.</p>` : '';
    return `<section class="planet-state"><h3>The planet then</h3><p>${this.link(s.planet, s.phase)}${s.ice ? `, with ice to ${esc(s.ice.reach)} during the ${this.link(s.ice.id, s.ice.label)}` : ''}.</p>${passing}</section>`;
  }

  private cites(r: EntityRecord, cs: CitationRecord[], unsourced?: string): string {
    if (unsourced) return `<span class="cites"><span class="cite unsourced">No source: ${esc(unsourced)}</span></span>`;
    // When a source was written, against what it tells of: an account written down decades after is said to be. Two
    // quotes from one place of one work are one citation; their quotes are shown apart below it.
    const shown = cs.map((c) => `<span class="cite">${esc(short(r.sources[c.ref], c.ref))}${c.loc ? `, ${esc(c.loc)}` : ''}${c.after ? ` <span class="after">(${esc(c.after)})</span>` : ''}</span>`);
    return `<span class="cites">${[...new Set(shown)].join('<span class="cite">; </span>')}</span>`;
  }

  private link(ref: string, label: string, wanted = false): string {
    if (wanted) return `<span class="wanted" title="Not written yet">${esc(label)} <span class="badge">wanted</span></span>`;
    const id = splitRef(ref).record;
    return `<a href="#" class="open" data-entity="${esc(id)}">${esc(label)}</a>`;
  }

  /** How to go and see a taxon where it lived, if there is somewhere to go: what the panel offers. */
  seeIt: ((id: string, local: boolean) => { label: string; go: () => void } | undefined) | null = null;

  private siteRecord?: EntityRecord;

  siteDetails(
    cores: { lat: number; lon: number; ref?: string; label?: string }[],
    extent: { description: string; generated: boolean; visible: boolean } | undefined,
    toggle: (show: boolean) => void,
  ): void {
    const details = this.el.querySelector<HTMLElement>('.site-details');
    if (!details || !this.siteRecord) return;
    const key = JSON.stringify([cores, extent?.description, extent?.generated]);
    if (details.dataset.view === key) {
      const checkbox = details.querySelector('input');
      if (checkbox) checkbox.checked = !!extent?.visible;
      return;
    }
    details.dataset.view = key;
    details.replaceChildren();
    for (const core of cores) {
      // Older catalogues lack claim references. Match the point to the open record to recover its source.
      const claim = this.siteRecord.claims.find(
        (c) =>
          c.ref === core.ref ||
          (!core.ref && c.prop === 'core' && (c.value as { lat: number }).lat === core.lat && (c.value as { lon: number }).lon === core.lon),
      );
      if (!claim) continue;
      const link = document.createElement('button');
      link.type = 'button';
      link.textContent = core.label ? 'Centre · ' + core.label : 'Historical centre';
      link.title = claim.note ?? claim.valueText;
      link.onclick = () => this.el.querySelector(`[data-claim="${CSS.escape(claim.ref)}"]`)?.scrollIntoView({ block: 'center' });
      details.append(link);
    }
    if (extent?.generated) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = extent.visible;
      checkbox.onchange = () => toggle(checkbox.checked);
      label.append(checkbox, ' Show reconstructed housing clusters');
      const legend = document.createElement('span');
      legend.className = 'cluster-legend';
      legend.id = 'cluster-legend';
      legend.textContent = 'Each loop follows the outer houses of one modelled cluster.';
      checkbox.setAttribute('aria-describedby', legend.id);
      details.append(label, legend);
    } else if (extent) {
      const info = document.createElement('span');
      info.textContent = extent.description.split(' · ')[0];
      info.title = extent.description;
      details.append(info);
    }
  }

  showEntity(r: EntityRecord, scenario: Scenario, time: FeatureTime, here?: TerritoryHere, organism?: OrganismHere): void {
    this.siteRecord = r;
    const status = r.claims.length > 0 && r.claims.every((c) => c.status === 'accepted') ? 'accepted' : r.claims.some((c) => c.status === 'disputed') ? 'disputed' : 'proposed';
    const machine = r.claims.some((c) => c.author.startsWith('machine:'));
    const alts = new Set(scenario.alts ?? []);
    const picks = new Set(scenario.picks ?? []);
    const groups = new Map<string, ClaimRecord[]>();
    for (const c of r.claims) {
      let list = groups.get(c.group);
      if (!list) { list = []; groups.set(c.group, list); }
      list.push(c);
    }
    const variant = (pick: string) => r.variants.find((v) => v.key === scenarioKey({ alts: scenario.alts, picks: [pick] }));
    const derivation = (refs: string[]) =>
      refs
        .filter((x) => x.includes('#'))
        .map((x) => {
          const { record: entity, part: key } = splitRef(x);
          return `<li>${entity === r.id ? esc(r.label) : this.link(entity, this.cb.labelOf(entity))} · <code>${esc(key)}</code></li>`;
        })
        .join('');
    const derivedRefs = [...new Set([...(time.start.derived ? r.derivedBy.start : []), ...(!time.instant && time.end.derived ? r.derivedBy.end : [])])];

    // What denies a claim or a relation: said apart from what speaks for it, with the words of each.
    const denied = (x: { against?: EntityRecord['claims'][number]['against'] }) =>
      x.against?.length ? `<p class="method">Denied by ${this.cites(r, x.against)}</p>${x.against.filter((s) => s.quote).map((s) => `<blockquote class="against">${esc(s.quote)}</blockquote>`).join('')}` : '';

    let claims = '';
    let footprintClaim: ClaimRecord | undefined;
    for (const [group, all] of groups) {
      // A claim of an alternative shows when that alternative is chosen; it replaces the
      // default picture's claims of its group.
      const own = all.filter((c) => c.alt && alts.has(c.alt));
      const cs = own.length ? own : all.filter((c) => !c.alt);
      const others = all.filter((c) => !cs.includes(c));
      const prop = cs[0]?.prop ?? all[0].prop;
      // A date named in cycles holds beside the others and narrows them: it is not one of the choices.
      const choice = cs.filter((c) => !c.beside);
      // Claims that each hold for a span of their own, as a state's names do in turn, are not a choice to make.
      const turns = choice.length > 1 && choice.every((c) => c.turn);
      const competing = choice.length > 1 && !turns;
      const def = choice.find((c) => c.rank === 'preferred') ?? (choice.filter((c) => c.rank !== 'deprecated').length === 1 ? choice.find((c) => c.rank !== 'deprecated') : undefined);
      const chosen = choice.find((c) => picks.has(c.ref)) ?? def;
      if (chosen?.prop === 'footprint_form' && isFootprint(chosen.value)) footprintClaim = chosen;
      const phaseId = cs[0] ? splitRef(cs[0].subject).phase : undefined;
      const phase = phaseId ? r.phases.find((p) => p.id === phaseId) : undefined;
      claims += `<div class="claim-group${competing ? ' competing' : ''}"><h4>${esc(PROP_LABEL[prop] ?? words(prop))}${phase ? ` <span class="phase">· ${esc(phase.label)}</span>` : ''}${competing ? ' <span class="badge">competing claims</span>' : turns ? ' <span class="badge">in turn</span>' : ''}</h4>`;
      if (competing && TIME_PROPS.has(prop)) claims += dateLine(cs, chosen?.ref, (ref) => cs.find((c) => c.ref === ref)?.rank === 'deprecated');
      for (const c of cs) {
        const v = competing && !c.beside && c !== def ? variant(c.ref) : undefined;
        const inconsistent = v && !v.consistent;
        const radio = competing && !c.beside
          ? `<input type="radio" name="${esc(group)}" value="${esc(c.ref)}" data-default="${esc(def?.ref ?? '')}" data-members="${esc(all.filter((x) => !x.beside).map((x) => x.ref).join(' '))}" ${c === chosen ? 'checked' : ''} ${inconsistent ? 'disabled' : ''} aria-label="Use this claim">`
          : '';
        const conf = c.confidence !== undefined ? `confidence: ${typeof c.confidence === 'number' ? c.confidence : `${c.confidence}${c.confidenceRange ? ` (${c.confidenceRange[0]}–${c.confidenceRange[1]})` : ''}`}` : '';
        claims += `<div class="claim rank-${esc(c.rank)}${inconsistent ? ' inconsistent' : ''}" data-claim="${esc(c.ref)}">
          <label>${radio}<span class="value${/^[-−±<>~≈]?\d/.test(c.valueText) ? ' num' : ''}">${esc([...picks].map((p) => c.valueTexts?.[p]).find((x) => x !== undefined) ?? c.valueText)}</span>${this.cites(r, c.sources, c.unsourced)}</label>
          <div class="claim-meta">${c.beside ? '<span class="badge beside" title="A day named in a calendar of cycles: one of the days that bear these names, read against the rest of the evidence. It narrows the other claims and is not a choice between them.">named in cycles</span>' : ''}<span class="badge rank">${esc(c.rank)}</span><span class="badge status-${esc(c.status)}">${esc(c.status)}</span>${c.level && c.level !== 'unchecked' && c.level !== 'accepted' ? `<span class="badge ladder" title="${esc(checkedTitle(c))}">checked: ${esc(c.level)}</span>` : ''}${c.basis !== 'evidence' ? `<span class="badge basis-${esc(c.basis)}">${esc(c.basis)}</span>` : ''}${c.alt ? `<span class="badge alt">${esc(this.cb.altTitle(c.alt))}</span>` : ''}${conf ? `<span class="badge">${esc(conf)}</span>` : ''}${c.methodLabel ? `<span class="badge">${esc(c.methodLabel)}</span>` : ''}<span class="author">${esc(c.author)}</span></div>
          ${c.validText ? `<p class="method">Holds: ${esc(c.validText)}</p>` : ''}
          ${c.sources.filter((s) => s.quote).map((s) => `<blockquote>${esc(s.quote)}</blockquote>`).join('')}
          ${denied(c)}
          ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
          ${inconsistent ? `<p class="conflict">Contradicts the rest of the world, so it cannot be shown. Conflicting with:</p><ul class="conflict">${derivation(v!.conflict!.filter((x) => x !== c.ref))}</ul>` : ''}
        </div>`;
      }
      if (others.length) claims += `<p class="method">${others.length} more in ${esc([...new Set(others.map((c) => (c.alt ? this.cb.altTitle(c.alt) : 'the default picture')))].join(', '))}.</p>`;
      claims += `</div>`;
    }
    // A relation says when it held, if it held for a span; one set aside (given up, or superseded) says so, and one that
    // belongs to an alternative shows only in that picture, from either end.
    const held = (x: { validText?: string; rank: string; alt?: string; rival?: true }) =>
      `${x.validText ? ` <span class="muted">(${esc(x.validText)})</span>` : ''}${x.rank === 'deprecated' ? ' <span class="badge">set aside</span>' : ''}${x.rival ? ' <span class="badge">another reading</span>' : ''}${x.alt ? ` <span class="badge">${esc(this.cb.altTitle(x.alt))}</span>` : ''}`;
    // A perspective held is named, not opened: it is a picture of the world to choose, not a record.
    const target = (x: { to: string; toLabel: string; wanted: boolean }) => (x.to.startsWith('alt:') ? `the perspective “${esc(this.cb.altTitle(x.to))}”` : this.link(x.to, x.toLabel, x.wanted));
    const relations = r.relations
      .filter((x) => !x.alt || alts.has(x.alt))
      .map((x) => `<li><strong>${esc(REL_LABEL[x.rel] ?? x.rel.replace(/-/g, ' '))}</strong> ${target(x)}${held(x)}${x.lagText ? ` <span class="muted">(${esc(x.lagText)})</span>` : ''} <span class="cite">${this.cites(r, x.sources, x.unsourced)}</span>${x.sources.filter((s) => s.quote).map((s) => `<blockquote>${esc(s.quote)}</blockquote>`).join('')}${denied(x)}${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}</li>`)
      .join('');
    const inverse = r.inverse
      .filter((x) => !x.alt || alts.has(x.alt))
      .map((x) => `<li><strong>${esc(REL_LABEL[x.rel] ?? x.rel.replace(/-/g, ' '))}</strong> ${this.link(x.from, x.fromLabel)}${held(x)} <span class="muted">(stated by that record)</span></li>`)
      .join('');
    const sources = Object.values(r.sources)
      .map((s) => {
        const href = safeHref(s.url);
        return `<li id="src-${esc(s.id)}"><p>${esc(s.citation)}</p>${s.doi ? `<a href="https://doi.org/${esc(encodeURI(s.doi))}" target="_blank" rel="noopener">doi:${esc(s.doi)}</a>` : href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(s.url)}</a>` : s.url ? `<span>${esc(s.url)}</span>` : ''} <span class="badge">${esc(s.kind)}</span>${s.license ? ` <span class="badge">${esc(s.license)}</span>` : ''}${s.written ? `<p class="written">Written ${esc(s.written)}.</p>` : ''}${s.type === 'text' && s.reliability ? `<p class="note">${esc(s.reliability)}</p>` : ''}${s.verified ? `<p class="verified">Checked: ${esc(s.verified.how)}</p>` : ''}</li>`;
      })
      .join('');
    const f = r.frame;
    const where = !f
      ? r.claims.some((c) => c.prop === 'territory')
        ? 'Its territory is drawn on the globe, from the rows of a borders dataset, for the years each row gives.'
        : 'No location: shown through what it is related to.'
      : f.plate !== undefined
        ? `Moves with ${f.entity ? this.link(f.entity, f.entityLabel ?? f.entity) : esc(f.title)} (plate ${f.plate} of the PALEOMAP model); its position at other times is reconstructed by the plate model.`
        : esc(f.title);
    const phases = r.phases.map((p) => `<li>${esc(p.label)}${p.gap ? ' <span class="badge">gap</span>' : ''}: ${esc(fmtTime(lookup(p.variants, scenario, p.time)))}</li>`).join('');
    const chosenAlts = [...alts].filter((a) => r.claims.some((c) => c.alt === a) || r.variants.some((v) => v.key.split(' ').includes(a)));
    const nSources = Object.keys(r.sources).length;
    this.frame(
      r.label,
      `${r.summary ? `<p class="summary">${esc(r.summary)}</p>` : ''}
      <div class="meta"><span class="badge basis-${esc(r.basis.time)}" title="How directly its dates rest on evidence">${esc(r.basis.time)}</span><span class="badge status-${status}">${status}${machine && status === 'proposed' ? ' · machine-made, needs review' : ''}</span>${nSources ? `<span class="badge">${nSources} ${nSources === 1 ? 'source' : 'sources'}</span>` : ''}</div>
      ${here ? this.hereSection(here) : ''}
      ${organism ? this.organismSection(organism) : ''}
      <dl class="facts"><dt>When</dt><dd><p class="when">${esc(fmtTime(time))}${picks.size || chosenAlts.length ? ' <span class="badge">with your choices</span>' : ''}</p>
      ${chosenAlts.map((a) => `<p class="method alt-held">In the alternative “${esc(this.cb.altTitle(a))}”${heldText(this.cb.altHeld?.(a)) ? `, ${esc(heldText(this.cb.altHeld?.(a)))}` : ''}.</p>`).join('')}
      ${phases ? `<ul class="phases">${phases}</ul>` : ''}
      ${derivedRefs.length ? `<p class="derived">Derived by the chronology solver from:</p><ul class="derived">${derivation(derivedRefs)}</ul>` : ''}</dd>
      <dt>Where</dt><dd>${where}</dd></dl>
      <section><h3>Claims</h3>${claims}</section>
      ${relations ? `<section><h3>Relations</h3><ul class="relations">${relations}</ul></section>` : ''}
      ${inverse ? `<section><h3>Related records</h3><ul class="relations inverse">${inverse}</ul></section>` : ''}
      ${r.wanted.length ? `<section><h3>Wanted</h3><p class="method">Referred to here but not written yet: ${r.wanted.map((w) => `<code>${esc(w)}</code>`).join(', ')}.</p></section>` : ''}
      <section><h3>Sources</h3><ol class="sources">${sources}</ol></section>`,
      r.kindLabel,
    );
    if (footprintClaim && isFootprint(footprintClaim.value)) {
      const form = footprintClaim.value;
      const ref = footprintClaim.ref;
      const button = document.createElement('button');
      button.className = 'see-it';
      button.textContent = 'Inspect footprint';
      button.onclick = () => inspectFootprint(form, r.label, () => {
        this.el.querySelector(`[data-claim="${CSS.escape(ref)}"]`)?.scrollIntoView({ block: 'center' });
      });
      this.el.querySelector('.meta')?.after(button);
    }
    // A taxon can be gone and seen, where the most of its fossils are.
    const see = this.seeIt?.(r.id, !!organism);
    if (see) {
      const button = document.createElement('button');
      button.className = 'see-it';
      button.textContent = see.label;
      button.onclick = see.go;
      if (r.kind.split('/')[0] === 'settlement') {
        const details = document.createElement('div');
        details.className = 'site-details';
        this.el.querySelector('header')?.after(button, details);
      } else this.el.querySelector('.meta')?.after(button);
    }
    for (const input of this.el.querySelectorAll<HTMLInputElement>('input[type=radio]')) {
      input.onchange = () => this.cb.onPick(input.dataset.members!.split(' '), input.value === input.dataset.default ? null : input.value);
    }
  }

  /** In a living scene: what puts this taxon there, from the records; and what the generator made up. */
  private organismSection(o: OrganismHere): string {
    const t = o.taxon;
    const sizes = [t.fromMass ? `${fmt(t.mass!)} kg` : t.length !== undefined ? `${fmt(t.length)} m long` : '', t.hip !== undefined ? `${fmt(t.hip)} m at the hips` : '', t.height !== undefined ? `${fmt(t.height)} m tall` : ''].filter(Boolean).join(', ');
    const rows = `${t.rows} ${t.rows === 1 ? 'occurrence' : 'occurrences'}`;
    const where = (km: number) => (km < 20 ? 'close by' : `about ${(Math.round(km / 10) * 10).toLocaleString('en-US')} km from here, ${o.sea ? 'by sea' : 'over land'}`);
    const recorded =
      t.tier === 'formation'
        ? `<strong>Recorded:</strong> ${rows} in ${t.collections} ${t.collections === 1 ? 'collection' : 'collections'} of ${esc(o.fossils.title)}${sizes && !t.size_from ? `; grown, ${esc(sizes)}, as the claims below say` : ''}.`
        : t.tier === 'here'
          ? `<strong>Recorded here:</strong> ${rows} of ${esc(o.fossils.title)} in this stage, the nearest ${where(t.km ?? 0)}.`
          : t.tier === 'region'
            ? `<strong>Inferred:</strong> the nearest of its ${rows} in this stage is ${where(t.km ?? 0)}, and no fossil puts it at this spot. ${o.sea ? 'That it lived here too is a guess from the sea between, in a like belt of latitude.' : 'That it lived here too is a guess from the land and the climate between.'}`
            : o.sea
              ? `<strong>A stand-in:</strong> nothing is recorded in the sea within reach: the nearest fossil of any kind is ${where(t.km ?? 0)}. ${esc(t.label)} is among the commonest of this stage in a like belt of latitude, and stands for what sort of thing may have lived here; it is no claim that it did.`
              : `<strong>A stand-in:</strong> nothing of this kind is recorded within reach: the nearest fossil of any kind is ${where(t.km ?? 0)}. ${esc(t.label)} stands for what sort of thing may have lived here, and is no claim that it did.`;
    const body = t.own ? `<p><strong>Its body:</strong> its own form, as the claims below say.</p>` : `<p><strong>Its body:</strong> drawn from the form of ${esc(t.form_label)}, the nearest node of the tree with one. No one has written its own yet.</p>`;
    const size = t.size_from ? `<p><strong>Its size:</strong> ${esc(sizes)}, within the range the record of ${esc(t.size_from)} gives. No one has measured it here.</p>` : '';
    return `<section class="here organism"><h3>In ${esc(o.site)}, ${esc(o.stage ?? formatTime(o.slice))}</h3>
      <p>${recorded}</p>${body}${size}
      <p><strong>Generated:</strong> where each stands, how many there are, what each is doing, how old it is and its colour${t.fromMass ? ', and its length, from its mass and the shape of the plan' : ''}. Nobody recorded these. <span class="method">${esc(o.generator)}, shown in magenta in evidence mode.</span></p></section>`;
  }

  /**
   * What the records say lived at this place and time, in tiers, and what was made of it. `list` is the atlas the taxa
   * are from, the land's or the sea's; `sea` that the scene is of the sea. `at` is the time shown and what of the list
   * stands then, which is what the scene draws; without it, the whole list.
   */
  showLifeHere(spec: SceneSpec, note?: string, where: { list: 'land' | 'sea'; sea: boolean } = { list: 'land', sea: false }, at?: { t: number; taxa: LivingTaxon[] }): void {
    const taxa = at?.taxa ?? spec.taxa;
    const group = (tier: string, title: string, say: string) => {
      const list = taxa.filter((t) => t.tier === tier);
      if (!list.length) return '';
      const items = list.map((t) => {
        const name = t.id.startsWith('txn:') ? esc(t.label) : this.link(t.id, t.label);
        const size = t.length !== undefined ? `${fmt(t.length)} m` : t.height !== undefined ? `${fmt(t.height)} m tall` : '';
        const own = t.own ? '' : `, drawn as ${esc(t.form_label)}`;
        return `<li>${name}${size ? ` <span class="method">${esc(size)}${own}</span>` : own ? ` <span class="method">${own.slice(2)}</span>` : ''}</li>`;
      });
      return `<section class="here organism"><h3>${esc(title)}</h3><p class="note">${esc(say)}</p><ul>${items.join('')}</ul></section>`;
    };
    const b = spec.biome;
    // What of the stage's list is not drawn at the time shown: its fossils in the stage, or a record of when it died out, end
    // before it, or begin after.
    const hidden = at ? spec.taxa.length - taxa.length : 0;
    const shown = at ? formatTime(at.t) : '';
    const none = taxa.length
      ? ''
      : hidden
        ? `<section class="here organism"><h3>Nothing at ${esc(shown)}</h3><p>Nothing on this stage’s list here stands at ${esc(shown)}: the fossils of each in the stage, and the records of when taxa died out, do not carry it to then.</p></section>`
        : where.sea
          ? '<section class="here organism"><h3>Nothing of the sea drawn</h3><p>None of what the atlas of the sea lists here, if it lists anything, has a body to draw it with yet. The sea is drawn empty: its floor, and the water over it.</p></section>'
          : '<section class="here organism"><h3>Nothing on land</h3><p>No fossil of anything living on land is known from this stage, anywhere within reach. The land is drawn bare.</p></section>';
    // An atlas's scene says what its list is of, and where the record near the place is thin, says so first.
    const atlas = !spec.site.place;
    const historic = !!at && historical(at.t);
    const later = hidden && taxa.length ? ` ${hidden} more on the stage’s list ${hidden === 1 ? 'is' : 'are'} not drawn at ${shown}: ${hidden === 1 ? 'its' : 'their'} fossils in the stage, and the records of when taxa died out, do not carry ${hidden === 1 ? 'it' : 'them'} to then.` : '';
    const when = atlas ? `<section class="here when"><h3>When</h3><p>${esc(`${stageWords(spec)}.${historic ? ` The list is the stage’s, not ${shown}’s.` : ''}${later}`)}</p></section>` : '';
    const thinSaid = atlas && taxa.length ? thinWords(taxa, spec.site.stage ?? 'stage') : '';
    const thin = thinSaid ? `<section class="here thin"><h3>Little is recorded near here</h3><p>${esc(thinSaid)}</p></section>` : '';
    const tiers =
      where.list === 'sea'
        ? `${group('here', 'Recorded here', 'A fossil of it within a few hundred km by sea, from this stage.')}${group('region', 'Recorded in the region', 'A fossil of it can be reached by sea, in a like belt of latitude. That it lived at this spot is an inference.')}${group('standin', 'Stand-ins', 'Nothing is recorded in the sea within reach. These are among the commonest of the stage in a like belt of latitude, and stand for what sort of thing may have lived here; they are no claim that it did.')}`
        : `${group('here', 'Recorded here', 'A fossil of it within a few hundred km, from this stage.')}${group('region', 'Recorded in the region', 'A fossil of it can be reached overland, in a like climate. That it lived at this spot is an inference.')}${group('standin', 'Stand-ins', 'Nothing of this kind is known within reach. These stand for what sort of thing may have lived here, and are no claim that it did.')}`;
    const summary = where.sea
      ? 'A sea, drawn at the depth the elevation field gives it. Every animal you see is placed by a generator: only who could be here comes from fossils.'
      : `Where the climate field reads the land at ${esc(String(b.ageMa))} Ma it is ${esc(b.label.toLowerCase())}, and the transitions allow forest over ${Math.round(b.cover.forests * 100)}% of it and grass over ${Math.round(b.cover.grasses * 100)}%. Every plant and animal you see is placed by a generator: only who could be here comes from fossils.`;
    const formation = group('formation', 'Recorded in the formation', 'Fossils from this formation identify these organisms. Their positions in the scene are generated.');
    // What the ground is made of and the rock under it, and what says so; or that nothing does. A sea's floor is the
    // renderer's alone.
    const g = spec.substrate;
    const under = spec.bedrock;
    const drawn = !g ? '' : g.from === 'soil' ? 'Its fine earth is drawn as one mixture, a shade of the ground its climate gives it, since the map names no colour, and its stones scattered through it.' : g.weight >= 1 ? 'The bare ground is drawn as that.' : `${Math.round(g.weight * 100)}% of the bare ground is drawn as that, and the rest by the climate.`;
    // What it rests on: its rows, where it has them, and what its dataset is credited as, which for a column of rock
    // names the work the column was compiled from.
    const rows = (list: string[], all: number) => `${esc(list.join(', '))}${all > list.length ? ` and ${all - list.length} more` : ''}`;
    const rests = !g ? '' : g.rows.length ? `${rows(g.rows, g.sites)}${g.credit ? ` · ${esc(g.credit)}` : ''}` : esc(g.credit ?? g.source);
    const made = g
      ? `<p>${esc(substrateWords(g))}. ${drawn} How each material looks is the renderer’s.</p><p class="note">${rests}</p>`
      : `<p>Nothing says what the loose ground was made of here: it is drawn by the climate’s class alone.</p>`;
    // A column holds the rock that is there today: what lay over a unit and has since worn away is in none.
    const stripped = under?.from === 'strata' && !under.laid ? ' Rock since worn away from over it is in no column.' : '';
    const under_rests = !under ? '' : under.rows?.length ? `${rows(under.rows, under.units?.length ?? under.rows.length)}${under.credit ? ` · ${esc(under.credit)}` : ''}` : esc(under.credit ?? under.source);
    const rock = under
      ? `<p>${esc(bedrockWords(under))}.${stripped} ${under.rock ? 'Its outcrops and its stones are drawn as that rock; how the rock looks is the renderer’s.' : 'That it is loose says nothing of its grain, and nothing is drawn from it.'}</p><p class="note">${under_rests}</p>`
      : '';
    // The shape of the ground: the elevation's own grid; what the world gives within its cells, the survey's own or
    // today's carried back; and what is invented below that.
    const sh = spec.shape;
    const cell = sh ? `${Math.round(sh.patch.step * 3600)}″` : '';
    const invented = 'are invented: as rough as the ground about them is at its own grain, and cut by water run over them.';
    const shaped = !sh
      ? `<p>Its shape is the elevation field’s alone, on a grid of ${esc(String(spec.relief.step))}°. The hills and valleys within a cell ${invented}</p>`
      : sh.held
        ? `<p>Its shape is the survey’s of today’s Earth, cell by cell of ${esc(cell)} about the place, laid over the relief’s grid. Hills and valleys smaller than a cell ${invented}</p>`
        : `<p>Its shape is today’s, carried back on its plate and laid over the elevation of the time, a grid of ${esc(String(spec.relief.step))}°: ${
            sh.share >= 1 ? 'all of it stood here then' : sh.share > 0 ? `${Math.round(sh.share * 100)}% of it stood here then` : 'none of it stood at this place then, and a range within sight keeps its own'
          }, ${sh.range ? `as the record of ${this.link(sh.range.id, sh.range.label)} says` : 'by the model’s rule'}. A model’s answer: its valleys are today’s, and it stands higher or lower than today by as much as that elevation says the land has risen or sunk since. What is left, and everything smaller than the survey’s cells of ${esc(cell)}, ${invented.replace('are invented', 'is invented')}</p>`;
    const shape = `<section class="here shape"><h3>The ground’s shape</h3>${shaped}${sh ? `<p class="note">${esc(sh.field)}</p>` : ''}</section>`;
    const ground = where.sea ? '' : `${shape}<section class="here ground"><h3>The ground</h3>${made}${rock}</section>`;
    this.frame(spec.site.place ? spec.site.label : spec.site.stage ?? 'This place', `<p class="summary">${summary}</p>
      <div class="meta"><span class="badge basis-procedural">procedural</span></div>
      ${when}${thin}${none}${formation}${tiers}${ground}
      ${note ? `<section><p class="note">${esc(note)}</p></section>` : ''}`, 'What lived here');
  }

  /** A living thing that is only a row of a database: what the row says, and what was made of it. */
  showOrganism(t: LivingTaxon, o: OrganismHere, src: SourceRecord | undefined): void {
    const source = `<section><h3>Source</h3><ol class="sources"><li><p>${esc(src?.citation ?? '')}</p></li></ol></section>`;
    this.frame(t.label, `<div class="meta"><span class="badge basis-procedural">procedural</span></div>${this.organismSection(o)}${source}`, 'Taxon, in the Paleobiology Database');
  }

  /** Inside a polity's territory: which of the dataset's rows is drawn there, and for what years. */
  private hereSection(h: TerritoryHere): string {
    const years = formatTime(h.from) === formatTime(h.to - 1) ? formatTime(h.from) : `${formatTime(h.from)} – ${formatTime(h.to - 1)}`;
    const area = h.area >= 1e6 ? `${fmtValue(h.area / 1e6)} million km²` : `${fmtValue(h.area)} km²`;
    const who = h.source ? short(h.source, h.source.id) : 'its dataset';
    return `<section class="here"><h3>Here, at ${esc(formatTime(h.t))}</h3><p>Inside its territory, as ${esc(who)} draws it for ${esc(years)}: the row named “${esc(h.name)}”, ${esc(area)}.</p>${h.source?.reliability ? `<p class="note">${esc(h.source.reliability)}</p>` : ''}</section>`;
  }

  showTerrain(info: TerrainInfo): void {
    const lat = `${Math.abs(info.lat).toFixed(2)}°${info.lat >= 0 ? 'N' : 'S'}`;
    const lon = `${Math.abs(info.lon).toFixed(2)}°${info.lon >= 0 ? 'E' : 'W'}`;
    const [k0, k1] = info.keyframes;
    const blend = k0 === k1 ? `the ${k0} Ma snapshot` : `the ${k0} and ${k1} Ma snapshots (${Math.round(info.mix * 100)}% of the way to ${k1} Ma)`;
    const s = info.source;
    const source = `<section><h3>Source</h3><ol class="sources"><li><p>${esc(s?.citation ?? '')}</p>${s?.doi ? `<a href="https://doi.org/${encodeURI(s.doi)}" target="_blank" rel="noopener">doi:${esc(s.doi)}</a>` : ''}${s?.reliability ? `<p class="note">${esc(s.reliability)}</p>` : ''}</li></ol></section>`;
    if (info.mode === 'blocks') {
      const inside = info.elevation > 0;
      this.frame(
        inside ? 'Continental block' : 'Between the blocks',
        `<div class="meta"><span class="badge basis-reconstruction">reconstruction</span></div>
        <section><h3>Here, at ${esc(formatTime(info.t, 1e4))}</h3>
        <p class="big">${inside ? 'Inside a continental block' : 'Outside the continental blocks'}</p>
        <p>${lat}, ${lon} in the geographic frame of this time${info.plate ? `, on plate ${info.plate}${info.plateLabel ? ` (${esc(info.plateLabel)})` : ''}` : ''}.</p>
        ${info.fieldDescription ? `<p class="note">${esc(info.fieldDescription)}</p>` : ''}
        <p class="method">Interpolated between ${esc(blend)}, each moved with its plates to this time.</p></section>${this.stateSection(info.state)}${source}`,
        info.fieldTitle,
      );
      return;
    }
    // A cell can hold people where the click fell on its sea, and there it should still say so.
    const people = (info.landscape && info.elevation >= 0 ? this.landscapeSection(info.landscape) : '') + (info.people && (info.people.people >= 0.5 || info.elevation >= 0) ? this.peopleSection(info.people) : '');
    const underIce = !!info.ice?.drawn;
    this.frame(
      underIce ? 'Ice sheet' : info.elevation >= 0 ? 'Land surface' : 'Sea floor',
      `<div class="meta"><span class="badge basis-reconstruction">reconstruction</span></div>
      ${people}
      <section><h3>Here, at ${esc(formatTime(info.t, 1e4))}</h3>
      ${underIce ? this.iceSection(info.ice!) : ''}
      ${underIce
        ? `<p>The ground beneath it is ${Math.abs(Math.round(info.elevation)).toLocaleString('en-US')} m ${info.elevation >= 0 ? 'above' : 'below'} the sea level of the time, as ${esc(info.fieldTitle.toLowerCase())} has it.</p>`
        : `<p class="big">${info.elevation >= 0 ? '' : '−'}${Math.abs(Math.round(info.elevation)).toLocaleString('en-US')} m <span class="muted">${info.elevation >= 0 ? 'above' : 'below'} the sea level of the time</span></p>`}
      <p>${lat}, ${lon} in the geographic frame of this time${info.plate ? `, on plate ${info.plate}${info.plateLabel ? ` (${esc(info.plateLabel)})` : ''}` : ', on no plate polygon (ocean floor the model does not track)'}.</p>
      ${info.ice && !underIce ? this.iceSection(info.ice) : ''}
      ${info.polity && info.elevation >= 0 ? this.politySection(info.polity) : ''}
      ${info.biome && info.elevation >= 0 && !underIce ? this.biomeSection(info.biome) : ''}
      <p class="method">${info.seaLevel ? this.seaLevelMethod(info.seaLevel, info.coastline) : `Interpolated between ${esc(blend)}, each moved with its plates to this time. The ${esc((info.coastline ?? 'coastline').toLowerCase())} is derived, not stored: the ${esc(info.datum === 'contemporaneous-sea-level' ? '0 m' : 'sea-level')} isoline of this field.`}${info.fieldSpread ? ` ${esc(SPREAD_TEXT[info.fieldSpread])}` : ''}</p></section>${this.stateSection(info.state)}${source}`,
      underIce ? info.ice!.title : info.fieldTitle,
    );
  }

  /** How a coast is drawn on today's ground: where it meets the sea level of the time. */
  private seaLevelMethod(level: { m: number; title: string }, coastline: string | undefined): string {
    const m = Math.round(level.m);
    const where = m === 0 ? 'at today\'s' : `${Math.abs(m).toLocaleString('en-US')} m ${m < 0 ? 'below' : 'above'} today's`;
    return `Today's ground, moved with its plates to this time, under the sea of the time: ${where}, as ${esc(level.title.toLowerCase())} has it. The ${esc((coastline ?? 'coastline').toLowerCase())} is derived, not stored: where today's ground meets that level.`;
  }

  /** What the ice-sheet field gives here, in the dataset's own terms, and how far to trust it. */
  private iceSection(i: IceHere): string {
    // Each is known to a few metres at best on these grids, and the panel reads them from a byte.
    const metres = (m: number) => `${(Math.round(m / 10) * 10).toLocaleString('en-US')} m`;
    const when = (ageMa: number) => (ageMa === 0 ? 'the present' : formatTime(fromMa(ageMa)));
    const given = i.at.map((k) => `${k.thickness < 1 ? 'none' : metres(k.thickness)} at ${when(k.ageMa)}`).join(' and ');
    const s = i.source;
    return `<div class="ice"><h3>${i.drawn ? 'Ice here' : 'Beyond the ice sheets, at this time'}</h3>
      ${i.drawn ? `<p class="big">About ${metres(i.thickness)} <span class="muted">of ice</span></p>` : ''}
      <p>${esc(short(s, s?.id ?? 'The dataset'))} gives ${esc(given)}.${i.scenario ? ` Drawn here: ${esc(i.scenario.title)}.` : ''}</p>
      ${i.others.map((o) => `<p>In its other scenario here, ${esc(o.title)}: ${o.drawn ? `about ${metres(o.thickness)}` : 'none'}.</p>`).join('')}
      ${i.held ? `<p class="note">${esc(i.held)}</p>` : ''}
      ${i.uncertainty ? `<p class="note">${esc(i.uncertainty)}</p>` : ''}
      <p class="method">The edge drawn is the ${esc(i.marginM)} m contour of the dataset's grid, and between keyframes it moves evenly from one to the next, as the thickness does: no one reconstructed those years. <span class="badge basis-reconstruction">reconstruction</span></p>
      <p class="method">${esc(s?.citation ?? '')}${s?.doi ? ` <a href="https://doi.org/${encodeURI(s.doi)}" target="_blank" rel="noopener">doi:${esc(s.doi)}</a>` : ''}</p></div>`;
  }

  /** How people lived here: the anthrome, the way of life and how sure it is, the region's archaeologists, cities, houses. */
  private landscapeSection(h: LandscapeHere): string {
    const p = h.place;
    const l = p.lifeway;
    const tier = l.tier === 'evidence' ? 'evidence' : l.tier === 'model' ? 'reconstruction' : 'procedural';
    const dense = h.density !== undefined && h.density > 0 ? `About ${fmtValue(h.density)} people to the km², as HYDE's people of the 1° cell are shared over its 5′ cells by their classes.` : '';
    const region = p.region
      ? `<p><strong>The archaeologists of ${esc(p.region.label)}</strong>, at ${esc(p.region.slice)} (ArchaeoGLOBE, their consensus): ${esc((h.regionUses ?? []).join('; '))}.</p>`
      : '<p>No region of the archaeologists\' survey holds this place.</p>';
    const cities = h.cities.length
      ? `<p><strong>Cities near</strong>: ${h.cities.map((c) => `${esc(c.name)}, about ${fmtValue(c.people)} people${c.band ? ` (90% between ${fmtValue(c.band[0])} and ${fmtValue(c.band[1])})` : ''}, ${c.km} km away (${esc(c.list)}${c.also.length ? `; ${c.also.map((a) => `${esc(a.list)} gives ${fmtValue(a.people)}`).join('; ')}` : ''})`).join('; ')}.</p>`
      : '';
    const whose = h.whose ? `the ${h.whose}` : 'the people';
    const houses = !h.whose
      ? ''
      : h.tradition
        ? `<p><strong>Houses</strong> of ${esc(whose)} here are drawn as those of ${esc(h.tradition.label)}${h.kin ? `, the house of the region's ${esc(h.kin)}, standing in: no tradition is recorded for ${esc(whose)} themselves` : ''}: ${esc(h.tradition.dwelling)}.</p>`
        : `<p><strong>Houses</strong> of ${esc(whose)} here are generic: no building tradition is recorded for them in this region at this time, so a scene draws a plain house for the way of life and the climate, and says so.</p>`;
    return `<section class="landscape"><h3>How people lived here, at ${esc(formatTime(p.t, 1e4))} <span class="badge basis-${tier}">${esc(l.tier)}</span></h3>
      <p class="big">${esc(PATTERN_WORDS[l.pattern] ?? l.pattern)}</p>
      <p>${esc(h.className)}, in ${esc(h.title.toLowerCase())} at their step ${esc(stepName(p.step))}. ${esc(dense)}</p>
      <p>${esc(l.why)}</p>
      ${l.disagrees ? `<p class="note"><strong>Where they disagree:</strong> ${esc(l.disagrees)}</p>` : ''}
      ${region}${cities}${houses}
      <p class="method">The anthromes are Anthromes 12K's classes of HYDE 3.2; the archaeologists' assessments are ArchaeoGLOBE's; the cities are Chandler's and Modelski's lists as Reba, Reitsma & Seto placed them. How they join is model:people/lifeways.</p></section>`;
  }

  /** What a grid of people gives for this cell, and how far to trust it. */
  private peopleSection(p: PeopleHere): string {
    const ns = (x: number) => `${Math.abs(x)}°${x >= 0 ? 'N' : 'S'}`;
    const ew = (x: number) => `${Math.abs(x)}°${x >= 0 ? 'E' : 'W'}`;
    const someone = p.people >= 0.5;
    const count = someone ? `About ${fmtValue(p.people)} ${p.people < 1.5 ? 'person' : 'people'}` : 'Nobody';
    const cell = `the ${p.res}° cell from ${ns(p.south)} to ${ns(p.south + p.res)} and ${ew(p.west)} to ${ew(p.west + p.res)}`;
    const dense = someone && p.land > 0 ? `: about ${fmtValue(p.people / p.land)} per km² of its ${p.land.toLocaleString('en-US')} km² of land` : '';
    const given = (s: PeopleHere['from']) => `${Math.round(s.people).toLocaleString('en-US')} at its step ${esc(stepName(s.step))}`;
    const steps = p.from.step === p.to.step ? `The dataset gives ${given(p.from)}.` : `The dataset gives ${given(p.from)} and ${given(p.to)}. Between its steps the line is simply straight, not an estimate.`;
    const range = p.range === undefined ? '' : `<p><strong>How sure:</strong> a reconstruction, not a count. Its authors put the range of their numbers at about ±${Math.round(p.range)}% at this time, partly on their own judgement, and give no range for a single place.</p>`;
    return `<section class="people"><h3>People here, at ${esc(formatTime(p.t, 1e4))} <span class="badge basis-reconstruction">reconstruction</span></h3>
      <p class="big">${count}</p>
      <p>In ${cell}${dense}.</p>
      <p>${steps}</p>
      ${range}
      ${p.description ? `<p class="note">${esc(p.description)}</p>` : ''}
      <p class="method">${esc(p.source?.citation ?? '')}${p.source?.doi ? ` <a href="https://doi.org/${encodeURI(p.source.doi)}" target="_blank" rel="noopener">doi:${esc(p.source.doi)}</a>` : ''}</p></section>`;
  }

  /** Which state a borders dataset draws here. */
  private politySection(p: NonNullable<TerrainInfo['polity']>): string {
    return `<div class="polity"><h3>Held by</h3><p class="big">${esc(p.name)}</p>
      <p>As drawn for ${esc(formatTime(p.from))} to ${esc(formatTime(p.to - 1))}, at about ${p.area.toLocaleString('en-US')} km².${p.wikipedia ? ` <span class="muted">Wikipedia: ${esc(p.wikipedia)}.</span>` : ''}</p>
      <p class="method">A row of ${esc(short(p.source, 'the borders dataset'))}, not a record of ours: its name, its years and its outline are as that dataset gives them, thinned for the globe${p.row?.corrected ? ', except where an overlay corrects them' : ''}.</p>${rowSection(p.row)}</div>`;
  }

  /** What covers the land here: the climate field's class, what the transitions allow by now, and what is generated. */
  private biomeSection(b: BiomeHere): string {
    const by = b.transitions.map((t) => this.link(t.id, t.label)).join(', ');
    return `<div class="biome"><h3>Covered with</h3><p class="big">${esc(coverWords(b))}</p>
      <p>The climate here is ${esc(b.label.toLowerCase())}, in ${esc(b.title)}.${by ? ` So far: ${by}.` : ' No transition has happened yet.'}${b.next ? ` Not yet: ${this.link(b.next.id, b.next.label)}.` : ''}</p>
      <p class="method">${esc(b.rule)}${b.ruleSource ? ` The climate is from ${esc(short(b.ruleSource, b.ruleSource.id))}.` : ''} The pattern within it is generated: <span class="badge basis-procedural">procedural</span></p></div>`;
  }

  /** The globe where no field covers the time shown: what is not known, and why; and the planet's state, if it has one. */
  showUnknown(t: number, why: string, state?: PlanetStateInfo, here?: Answer): void {
    const generic = here?.tier === 'generic' && (here.value === 'land' || here.value === 'sea');
    const note = generic
      ? `Nothing records where the land was, so generic land is drawn: a placeholder, flat and muted under a graticule. Where it stands and its shape are invented, and how much of the planet it covers is a stated placeholder, not a reconstruction. Here it is ${here!.value === 'land' ? 'generic land' : 'generic sea'}. What covers the planet, and any ice, follows its states; the patterns they are drawn with are procedural.`
      : state
        ? 'Where the land was is not known, so none is drawn. What covers the planet, and any ice, follows its states; the patterns they are drawn with are procedural.'
        : 'The globe is drawn plain on purpose: nothing here rests on evidence, a reconstruction or a projection.';
    this.frame(
      'Geography unknown',
      `${generic ? '<div class="meta"><span class="badge basis-procedural">generic</span></div>' : ''}<section><h3>At ${esc(formatTime(t, 1e4))}</h3><p>${esc(why)}</p>
      <p class="note">${esc(note)}</p></section>${this.stateSection(state)}`,
      generic ? 'Generic land' : undefined,
    );
  }

  /** A global series: its value at a time, how it is known, and its source. */
  /** Something generated rather than recorded: what it is, and what it is made to fit. */
  /** A row of a dataset drawn on the globe: what it says, and the dataset it comes from. */
  showRow(title: string, kind: string, lines: string[], src: SourceRecord | undefined, note?: string, row?: RowInfo): void {
    const source = `<section><h3>Source</h3><ol class="sources"><li><p>${esc(src?.citation ?? '')}</p>${src?.doi ? `<a href="https://doi.org/${encodeURI(src.doi)}" target="_blank" rel="noopener">doi:${esc(src.doi)}</a>` : ''}</li></ol></section>`;
    this.frame(title, `<div class="meta"><span class="badge basis-evidence">evidence</span>${row?.corrected ? '<span class="badge corrected">corrected</span>' : ''}</div>
      <section>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}${note ? `<p class="note">${esc(note)}</p>` : ''}</section>${rowSection(row)}${source}`, kind);
  }

  showGenerated(title: string, kind: string, text: string, why: string): void {
    this.frame(title, `<p class="summary">${esc(text)}</p>
      <div class="meta"><span class="badge basis-procedural">procedural</span></div>
      <h3>How we know</h3><p class="muted">${esc(why)}</p>`, kind);
  }

  showSeries(s: SeriesRecord, t: number, v: SeriesValue | null): void {
    const src = s.sourceRecord;
    const projected = s.projectedAfter !== undefined && t > s.projectedAfter;
    const basis = projected ? 'projection' : s.basis;
    const band = v && v.lo !== null && v.hi !== null ? `<p>${fmtValue(v.lo)} – ${fmtValue(v.hi)} ${esc(s.unit ?? '')}${s.band ? `: ${esc(s.band)}` : ''}</p>` : '';
    const when = (t: number) => (t === PRESENT_YEAR ? 'the present' : formatTime(t));
    const span = `${when(s.points[0][0])} to ${when(s.points.at(-1)![0])}`;
    this.frame(
      s.title,
      `${s.description ? `<p class="summary">${esc(s.description)}</p>` : ''}
      <div class="meta"><span class="badge basis-${esc(basis)}">${esc(basis)}</span></div>
      <section><h3>At ${esc(formatTime(t, 1e4))}</h3>
      <p class="big">${v ? `${fmtValue(v.value)} ${esc(s.unit ?? '')}` : '<span class="muted">No value at this time</span>'}</p>${band}${s.spread && s.spread !== 'band' ? `<p class="method">${esc(SPREAD_TEXT[s.spread])}</p>` : ''}
      <p class="method">${s.rule ? `Computed with ${esc(s.rule.name)}${Object.keys(s.rule.params).length ? ` (${Object.entries(s.rule.params).map(([k, x]) => `${esc(k)} ${esc(String(x))}`).join(', ')})` : ''}, every step from ${esc(span)}` : `Read from the dataset's table, from ${esc(span)}`}; between its ${s.points.length.toLocaleString('en-US')} points the value is interpolated (${esc(s.interpolation)}).${projected ? ' After the present it is a projection.' : ''}</p></section>
      <section><h3>Source</h3><ol class="sources"><li><p>${esc(src?.citation ?? s.source.ref)}${s.source.loc ? `, ${esc(s.source.loc)}` : ''}</p>${src?.doi ? `<a href="https://doi.org/${encodeURI(src.doi)}" target="_blank" rel="noopener">doi:${esc(src.doi)}</a>` : ''}${src?.reliability ? `<p class="note">${esc(src.reliability)}</p>` : ''}${src?.verified ? `<p class="verified">Checked: ${esc(src.verified.how)}</p>` : ''}</li></ol></section>`,
      s.quantity ?? 'Global series',
    );
  }
}
