// The time machine: "Go to…" A reader types a place, a time or both, or picks a trip, and goes
// there. A place chosen alone opens its stretch of time, to pick a moment along it, with what
// happened near it marked. Every time it shows is a record's; it holds no facts of its own.
import type { PeriodRecord, SearchEntry } from '../../../core/records.ts';
import { heldAt, holdsAt, nameAt, nameFound, nameMatches, readQuery, spanOfEntry } from '../../../core/timemachine.ts';
import { formatTime, historical, PRESENT_YEAR } from '../../../core/time.ts';
import { esc } from './html.ts';

/**
 * The trips offered before anything is typed: records only, by id, so that every time shown is
 * the record's own and follows it when a date in the world changes. One the build lacks is left out.
 */
export const TRIPS = [
  'places/rome',
  'life/hell-creek/ecosystem',
  'earth/events/chicxulub-impact',
  'earth/ice-ages/last-glacial-maximum',
  'people/first-cities/teotihuacan',
  'people/first-cities/angkor',
  'space/events/apollo-11-landing',
  'earth/events/moon-forming-impact',
];

/** Something dated near a place, marked along its stretch of time. */
export interface Mark {
  id: string;
  label: string;
  t: number;
}

export interface TimeMachineHost {
  entries: SearchEntry[];
  periods: PeriodRecord[];
  /** the times the world reaches, [older, younger] */
  range: [number, number];
  kindLabel(kind: string): string;
  /** whether a record is offered as somewhere to be "then": not a plate, nor a building inside a city */
  offered(e: SearchEntry): boolean;
  /** the time a site's scene describes, if the record has one to walk in */
  sceneTime(id: string): number | undefined;
  /** things dated near a record, within a stretch of time */
  marks(id: string, span: [number, number]): Promise<Mark[]>;
  /** go to a record, at a time if one is given */
  go(id: string, t?: number): void;
  /** go to a time, staying over the globe */
  goTime(t: number): void;
  goPeriod(p: PeriodRecord): void;
}

interface Row {
  key: string;
  label: string;
  detail: string;
  when?: string;
  note?: string;
  run: () => void;
}

/** A slider along a stretch of time: by the year in the calendar's span, by the logarithm of the age beyond it. */
interface Scale {
  toT(x: number): number;
  toX(t: number): number;
}

function scaleOf(a: number, b: number): Scale {
  const ageA = PRESENT_YEAR - a;
  const ageB = Math.max(1, PRESENT_YEAR - b);
  if (b <= PRESENT_YEAR && ageA / ageB > 20) {
    const la = Math.log(ageA);
    const lb = Math.log(ageB);
    return {
      toT: (x) => PRESENT_YEAR - Math.exp(la + (lb - la) * x),
      toX: (t) => (Math.log(Math.max(1, PRESENT_YEAR - t)) - la) / (lb - la),
    };
  }
  return { toT: (x) => a + (b - a) * x, toX: (t) => (b === a ? 0 : (t - a) / (b - a)) };
}

/** A moment as the slider shows it: a whole year in the calendar's span, and coarser further back. */
const roundTime = (t: number) => (historical(t) ? Math.round(t) : t);

export class TimeMachine {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private hint: HTMLElement;
  private body: HTMLElement;
  private rows: Row[] = [];
  private active = 0;
  /** what was open before, for the button that brings the panel back */
  private opener: HTMLElement | null = null;

  constructor(private host: TimeMachineHost) {
    this.el = document.createElement('div');
    this.el.className = 'timemachine';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="tm-dialog" role="dialog" aria-modal="true" aria-labelledby="tm-title">
        <header>
          <h1 id="tm-title">Go to…</h1>
          <button class="tm-close" aria-label="Close">×</button>
        </header>
        <input type="search" class="tm-input" placeholder="Rome 100 CE, 66 Ma, Angkor…" aria-label="A place, a time, or both" autocomplete="off" spellcheck="false">
        <p class="tm-hint" aria-live="polite"></p>
        <div class="tm-body"></div>
        <footer><button class="tm-look">Just look around</button><span>Every date here is a sourced claim. Click anything to see how we know.</span></footer>
      </div>`;
    this.input = this.el.querySelector('.tm-input')!;
    this.hint = this.el.querySelector('.tm-hint')!;
    this.body = this.el.querySelector('.tm-body')!;
    this.el.querySelector<HTMLButtonElement>('.tm-close')!.onclick = () => this.close();
    this.el.querySelector<HTMLButtonElement>('.tm-look')!.onclick = () => this.close();
    // A click on the dimmed world around the panel closes it.
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.input.addEventListener('input', () => this.home());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') this.move(1);
      else if (e.key === 'ArrowUp') this.move(-1);
      else if (e.key === 'Enter' && this.rows[this.active]) this.rows[this.active].run();
      else return;
      e.preventDefault();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.opener = document.activeElement as HTMLElement | null;
    this.el.hidden = false;
    this.input.value = '';
    this.home();
    // On a touch screen the keyboard would cover the trips: it comes when the field is tapped.
    if (!matchMedia('(pointer: coarse)').matches) this.input.focus();
  }

  close(): void {
    this.el.hidden = true;
    this.opener?.focus?.();
  }

  private entry(id: string): SearchEntry | undefined {
    return this.host.entries.find((e) => e.id === id);
  }

  /** The panel's first page: trips, or what the text typed finds. */
  private home(): void {
    this.el.querySelector('.tm-dialog')!.classList.remove('tm-on-trip');
    this.input.hidden = false;
    const text = this.input.value.trim();
    if (!text) {
      this.hint.textContent = '';
      return this.showTrips();
    }
    const q = readQuery(text);
    const t = q.t === undefined ? undefined : Math.max(this.host.range[0], Math.min(this.host.range[1], q.t));
    // Deep time is named by its period too; the calendar's years need no stage of the Holocene beside them.
    const period = t === undefined || historical(t) ? undefined : this.periodAt(t);
    this.hint.innerHTML = t === undefined ? '' : `→ <strong>${esc(formatTime(t))}</strong>${period ? `, in the ${esc(period)}` : ''}${t !== q.t ? ' (as near as the world reaches)' : ''}`;
    const rows: Row[] = [];
    // The whole text as a name first, so that "Apollo 11" is a landing and not Apollo in 11 CE.
    for (const f of this.find(text)) rows.push(this.placeRow(f.e, undefined, f.name));
    if (t !== undefined && q.place) {
      // What holds then before what does not.
      const found = this.find(q.place).filter((f) => !rows.some((r) => r.key === f.e.id));
      for (const f of [...found.filter((f) => holdsAt(f.e, t)), ...found.filter((f) => !holdsAt(f.e, t))]) rows.push(this.placeRow(f.e, t, f.name));
    } else if (t !== undefined) {
      rows.push({ key: '', label: 'The whole Earth', detail: 'the globe', when: formatTime(t), run: () => this.done(() => this.host.goTime(t)) });
      for (const e of heldAt(this.host.entries, t, (x) => !this.host.offered(x), 11)) {
        const own = e.time.instant ? e.time.start.best! : t;
        rows.push({ key: e.id, label: nameAt(e, own), detail: this.detail(e, nameAt(e, own)), when: formatTime(own), note: 'then', run: () => this.done(() => this.host.go(e.id, own)) });
      }
    }
    if (t === undefined) {
      for (const p of this.host.periods.filter((p) => nameMatches(p.name, text)).slice(0, 4)) {
        rows.push({ key: p.id, label: p.name, detail: p.rank, when: `${formatTime(p.start)} – ${formatTime(p.end)}`, run: () => this.done(() => this.host.goPeriod(p)) });
      }
    }
    this.rows = rows.slice(0, 12);
    this.active = 0;
    this.renderRows(rows.length ? '' : `<p class="tm-empty">Nothing in the world goes by that name yet. Try a place and a year, such as <em>Rome 100 CE</em>, or an age, such as <em>300 Ma</em>.</p>`);
  }

  /**
   * What the text names, by any name it went by, and that name: a name that starts with the text first,
   * records before rows of datasets, places and states before the rest.
   */
  private find(text: string): { e: SearchEntry; name: string }[] {
    if (!text) return [];
    const named = this.host.entries.flatMap((e) => {
      const name = e.kind === 'plate' ? undefined : nameFound(e, text);
      return name ? [{ e, name }] : [];
    });
    const lead = ({ e, name }: { e: SearchEntry; name: string }) => (name.toLowerCase().startsWith(text.toLowerCase()) ? 0 : 2) + (e.dataset ? 1 : 0) + (e.bulk ? 4 : 0) + (/^(settlement|polity)/.test(e.kind) ? 0 : 1);
    return named.sort((a, b) => lead(a) - lead(b) || a.name.length - b.name.length).slice(0, 8);
  }

  /** What a thing is, and, where it is named otherwise than by its label, what it is called today. */
  private detail(e: SearchEntry, shown: string): string {
    return `${shown !== e.label ? `${e.label} · ` : ''}${this.host.kindLabel(e.kind)}${e.dataset ? ', a dataset’s rows' : ''}`;
  }

  /** The finest named period at a time. */
  private periodAt(t: number): string | undefined {
    return this.host.periods.filter((p) => p.start <= t && t <= p.end).sort((a, b) => a.end - a.start - (b.end - b.start))[0]?.name;
  }

  private spanText(e: SearchEntry): string {
    const span = spanOfEntry(e);
    if (!span) return 'undated';
    if (e.time.instant) return formatTime(span[0]);
    // A dataset's rows hold to the end of their last year: the year shown is that one.
    const end = span[1] >= PRESENT_YEAR && e.time.end.best === null && !e.time.endUnknown ? 'today' : formatTime(e.dataset ? span[1] - 1 : span[1]);
    return `${formatTime(span[0])} – ${end}`;
  }

  /** A record as a row: with a time, it goes there then; without, a stretch of time opens to choose along. */
  private placeRow(e: SearchEntry, t?: number, found?: string): Row {
    // Named as it was then, where a time is given, else by the name the text found.
    const shown = t !== undefined && found === e.label ? nameAt(e, t) : (found ?? e.label);
    const detail = this.detail(e, shown);
    const label = shown;
    if (t !== undefined) {
      const span = spanOfEntry(e);
      // A moment is gone to at its own time, whatever was typed.
      if (span && e.time.instant) return { key: e.id, label, detail, when: formatTime(span[0]), note: holdsAt(e, t) ? 'then' : undefined, run: () => this.done(() => this.host.go(e.id, span[0])) };
      const note = holdsAt(e, t) ? 'then' : span && t < span[0] ? 'not yet' : 'no longer';
      return { key: e.id, label, detail, when: formatTime(t), note, run: () => this.done(() => this.host.go(e.id, t)) };
    }
    const span = spanOfEntry(e);
    const run = !span || e.time.instant ? () => this.done(() => this.host.go(e.id)) : () => this.trip(e);
    return { key: e.id, label, detail, when: this.spanText(e), run };
  }

  private showTrips(): void {
    const trips = TRIPS.map((id) => this.entry(id)).filter((e): e is SearchEntry => !!e);
    this.rows = trips.map((e) => {
      const scene = this.host.sceneTime(e.id);
      const at = scene ?? spanOfEntry(e)?.[0];
      return {
        key: e.id,
        label: e.label,
        detail: scene !== undefined ? `${this.host.kindLabel(e.kind)}, to walk in` : this.host.kindLabel(e.kind),
        when: at === undefined ? '' : formatTime(at),
        run: () => this.done(() => this.host.go(e.id, at)),
      };
    });
    this.active = -1;
    this.body.innerHTML = `<h2>Or take a trip</h2><div class="tm-trips">${this.rows
      .map((r, i) => `<button class="tm-trip" data-i="${i}"><span class="tm-when">${esc(r.when ?? '')}</span><span class="tm-label">${esc(r.label)}</span><small>${esc(r.detail)}</small></button>`)
      .join('')}</div>`;
    for (const b of this.body.querySelectorAll<HTMLButtonElement>('.tm-trip')) b.onclick = () => this.rows[Number(b.dataset.i)].run();
  }

  private renderRows(empty: string): void {
    this.body.innerHTML = empty || `<ul class="tm-rows" role="listbox">${this.rows
      .map((r, i) => `<li role="option" data-i="${i}" class="${i === this.active ? 'active' : ''}"><span class="tm-label">${esc(r.label)}<small>${esc(r.detail)}</small></span><span class="tm-when">${esc(r.when ?? '')}${r.note ? `<small class="tm-note tm-${r.note.replace(' ', '-')}">${r.note}</small>` : ''}</span></li>`)
      .join('')}</ul>`;
    for (const li of this.body.querySelectorAll<HTMLElement>('li')) li.onclick = () => this.rows[Number(li.dataset.i)].run();
  }

  private move(d: number): void {
    if (!this.rows.length || !this.body.querySelector('.tm-rows')) return;
    this.active = (this.active + d + this.rows.length) % this.rows.length;
    for (const li of this.body.querySelectorAll<HTMLElement>('li')) li.classList.toggle('active', Number(li.dataset.i) === this.active);
    this.body.querySelector('li.active')?.scrollIntoView({ block: 'nearest' });
  }

  /** A record's stretch of time, to choose a moment along, with what happened near it marked. */
  private trip(e: SearchEntry): void {
    const [a0, b0] = spanOfEntry(e)!;
    const a = Math.max(this.host.range[0], a0);
    const b = Math.min(this.host.range[1], b0);
    const scale = scaleOf(a, b);
    const scene = this.host.sceneTime(e.id);
    // The scene's own time, or the start, as the record gives it: only the slider rounds.
    let t = scene !== undefined && scene >= a && scene <= b ? scene : a;
    this.el.querySelector('.tm-dialog')!.classList.add('tm-on-trip');
    this.hint.textContent = '';
    this.rows = [];
    this.body.innerHTML = `
      <div class="tm-place">
        <button class="tm-back" aria-label="Back">←</button>
        <div><h2>${esc(e.label)}</h2><small>${esc(this.host.kindLabel(e.kind))}, ${esc(this.spanText(e))}</small></div>
      </div>
      <output class="tm-at"></output>
      <div class="tm-track"><div class="tm-marks"></div><input type="range" min="0" max="1000" step="1" aria-label="When"></div>
      <div class="tm-ends"><span>${esc(formatTime(a))}</span><span>${esc(b >= PRESENT_YEAR && b0 >= PRESENT_YEAR ? 'today' : formatTime(e.dataset ? b - 1 : b))}</span></div>
      <div class="tm-chips"></div>
      <button class="tm-go"></button>`;
    const slider = this.body.querySelector<HTMLInputElement>('input[type=range]')!;
    const out = this.body.querySelector<HTMLOutputElement>('.tm-at')!;
    const go = this.body.querySelector<HTMLButtonElement>('.tm-go')!;
    const chips = this.body.querySelector<HTMLElement>('.tm-chips')!;
    const set = (x: number) => {
      t = x;
      slider.value = String(Math.round(scale.toX(t) * 1000));
      out.textContent = formatTime(t);
      go.textContent = `Go to ${nameAt(e, t)}, ${formatTime(t)}`;
    };
    set(t);
    slider.oninput = () => set(roundTime(scale.toT(Number(slider.value) / 1000)));
    go.onclick = () => this.done(() => this.host.go(e.id, t));
    this.body.querySelector<HTMLButtonElement>('.tm-back')!.onclick = () => {
      this.home();
      this.input.focus();
    };
    const chip = (label: string, at: number, cls = '') => {
      const c = document.createElement('button');
      c.className = `tm-chip ${cls}`;
      c.innerHTML = `${esc(label)} <small>${esc(formatTime(at))}</small>`;
      c.onclick = () => set(at);
      chips.append(c);
    };
    if (scene !== undefined && scene >= a && scene <= b) chip('Its streets, as drawn', scene, 'tm-chip-scene');
    slider.focus();
    void this.host.marks(e.id, [a, b]).then((marks) => {
      if (!this.body.contains(slider)) return;
      const lane = this.body.querySelector<HTMLElement>('.tm-marks')!;
      for (const m of marks) {
        const tick = document.createElement('button');
        tick.className = 'tm-tick';
        tick.style.left = `${Math.max(0, Math.min(1, scale.toX(m.t))) * 100}%`;
        tick.title = `${m.label}, ${formatTime(m.t)}`;
        tick.setAttribute('aria-label', tick.title);
        tick.onclick = () => set(m.t);
        lane.append(tick);
      }
      for (const m of marks.slice(0, 10)) chip(m.label, m.t);
    });
  }

  private done(act: () => void): void {
    this.opener = null;
    this.close();
    act();
  }
}
