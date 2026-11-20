// The planet at the time shown: its state (the phase of its record, and any ice), then each
// global series' value there, beside its value today. A series with no value then has no row then,
// and neither has one with a finer series of the same quantity that has a value. The readings fold
// behind a button, until a reader asks for them. Clicking a row opens how it is known.
import type { Look } from '../../../core/planet.ts';
import type { SeriesRecord } from '../../../core/records.ts';
import { PRESENT_YEAR } from '../../../core/time.ts';
import { fmtValue, type SeriesValue } from './inspect.ts';

/** A series' value at time t, in a picture, interpolated between its points; null outside its span. */
export function valueAt(s: SeriesRecord, t: number, alts: readonly string[] = []): SeriesValue | null {
  const p = alts.map((a) => s.variants?.[a]).find(Boolean) ?? s.points;
  if (!p.length || t < p[0][0] || t > p[p.length - 1][0]) return null;
  let lo = 0;
  let hi = p.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p[m][0] <= t) lo = m;
    else hi = m;
  }
  const [a, b] = [p[lo], p[hi]];
  if (s.interpolation === 'step' || a[0] === b[0] || t <= a[0]) return { value: a[1], lo: a[2], hi: a[3] };
  const f = (t - a[0]) / (b[0] - a[0]);
  const lerp = (x: number | null, y: number | null) => (x === null || y === null ? null : x + (y - x) * f);
  return { value: a[1] + (b[1] - a[1]) * f, lo: lerp(a[2], b[2]), hi: lerp(a[3], b[3]) };
}

const GAUGE = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 11.8a6 6 0 1 1 10.8 0"/><path d="M8 10.2l2.6-3.4"/></svg>';
const CHEVRON = '<svg class="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3"/></svg>';

export class PlanetPanel {
  readonly el: HTMLElement;
  private rows = new Map<string, { value: HTMLElement; today: HTMLElement; row: HTMLElement }>();
  private phase: { row: HTMLButtonElement; value: HTMLElement } | null = null;
  /** what lets out the readings, and says how many there are */
  private toggle: HTMLButtonElement;
  private count: HTMLElement;
  private readings: HTMLElement;
  private ice: { row: HTMLButtonElement; title: HTMLElement; value: HTMLElement } | null = null;
  /** the records the state rows open */
  private open = { phase: '', ice: '' };
  /** a series was chosen */
  onOpen: (id: string) => void = () => {};
  /** a record was chosen: the planet's, or a glaciation's */
  onRecord: (id: string) => void = () => {};

  constructor(private series: SeriesRecord[], planetLabel?: string) {
    this.el = document.createElement('section');
    this.el.className = 'planet';
    this.el.hidden = series.length === 0 && !planetLabel;
    this.el.setAttribute('aria-label', 'The planet at this time');
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'planet-toggle';
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.setAttribute('aria-controls', 'planet-readings');
    this.toggle.innerHTML = `${GAUGE}<span>The planet then</span><span class="planet-count"></span>${CHEVRON}`;
    this.count = this.toggle.querySelector('.planet-count')!;
    this.toggle.onclick = () => this.unfold(this.toggle.getAttribute('aria-expanded') !== 'true');
    this.readings = document.createElement('div');
    this.readings.className = 'planet-readings';
    this.readings.id = 'planet-readings';
    this.readings.hidden = true;
    this.readings.innerHTML = '<div class="planet-head" aria-hidden="true"><span></span><span>then</span><span>today</span></div>';
    this.el.append(this.toggle, this.readings);
    const stateRow = (cls: string, title: string, which: 'phase' | 'ice') => {
      const row = document.createElement('button');
      row.className = `planet-row ${cls}`;
      row.innerHTML = `<span class="planet-title"></span><span class="planet-value"></span>`;
      row.querySelector('.planet-title')!.textContent = title;
      row.onclick = () => this.open[which] && this.onRecord(this.open[which]);
      this.readings.appendChild(row);
      return { row, title: row.querySelector<HTMLElement>('.planet-title')!, value: row.querySelector<HTMLElement>('.planet-value')! };
    };
    if (planetLabel) {
      this.phase = stateRow('planet-phase', planetLabel, 'phase');
      this.ice = stateRow('planet-ice', 'Ice', 'ice');
    }
    for (const s of series) {
      const row = document.createElement('button');
      row.className = 'planet-row';
      row.dataset.series = s.id;
      row.innerHTML = `<span class="planet-title"></span><span class="planet-value"></span><span class="planet-today"></span>`;
      row.querySelector('.planet-title')!.textContent = s.title;
      row.onclick = () => this.onOpen(s.id);
      this.readings.appendChild(row);
      this.rows.set(s.id, { value: row.querySelector('.planet-value')!, today: row.querySelector('.planet-today')!, row });
    }
  }

  /** Let the readings out, or fold them away. */
  unfold(open: boolean): void {
    this.readings.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }

  update(t: number, look?: Look, alts: readonly string[] = []): void {
    if (this.phase && this.ice) {
      const phase = look && !look.formed ? 'not formed yet' : (look?.phase?.label ?? '—');
      if (this.phase.value.textContent !== phase) this.phase.value.textContent = phase;
      // A phase that is a passage says what it is passing into, and how far it has gone.
      const passing = look?.into ? `Passing little by little into ${look.into.label}: ${Math.round(look.passed * 100)}% of the way` : '';
      if (this.phase.row.title !== passing) this.phase.row.title = passing;
      this.phase.row.classList.toggle('empty', !look?.phase);
      this.open.phase = look?.phase ? look.phase.subject.split('@')[0] : '';
      const ice = look?.ice;
      this.ice.row.hidden = !ice;
      this.open.ice = ice?.subject ?? '';
      if (ice) {
        const reach = look!.iceReach <= 0 ? 'to the equator' : `to ${look!.iceReach}°`;
        if (this.ice.value.textContent !== reach) this.ice.value.textContent = reach;
        if (this.ice.title.textContent !== ice.label) this.ice.title.textContent = ice.label;
      }
    }
    // Then beside today: the same series, read at the present in the same picture. At the present there is nothing to set beside.
    this.el.classList.toggle('at-present', t === PRESENT_YEAR);
    const at = this.series.map((s) => valueAt(s, t, alts));
    const refined = new Set(this.series.flatMap((s, i) => (s.refines && at[i] ? [s.refines] : [])));
    this.series.forEach((s, i) => {
      const r = this.rows.get(s.id)!;
      const v = at[i];
      r.row.hidden = !v || refined.has(s.id);
      if (!v) return;
      const text = `${fmtValue(v.value)}${s.unit ? ` ${s.unit}` : ''}`;
      if (r.value.textContent !== text) r.value.textContent = text;
      // A series that ends before the present gives way, today, to a finer one of the same quantity that reaches it.
      const now = t === PRESENT_YEAR ? null : [s, ...this.series.filter((x) => x.refines === s.id && x.unit === s.unit)].map((x) => valueAt(x, PRESENT_YEAR, alts)).find(Boolean);
      const today = now ? fmtValue(now.value) : '—';
      if (r.today.textContent !== today) r.today.textContent = today;
      r.row.classList.toggle('projection', s.projectedAfter !== undefined && t > s.projectedAfter);
    });
    const shown = this.readings.querySelectorAll('.planet-row:not([hidden])').length;
    const count = `${shown} ${shown === 1 ? 'reading' : 'readings'}`;
    if (this.count.textContent !== count) this.count.textContent = count;
  }
}
