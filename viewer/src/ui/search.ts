// Search entities and named periods; choosing a result flies there.
import type { PeriodRecord, SearchFile } from '../../../core/records.ts';
import { nameFound } from '../../../core/timemachine.ts';
import { esc } from './html.ts';

export type SearchHit =
  | { type: 'entity'; id: string; label: string; detail: string; located: boolean }
  | { type: 'period'; id: string; label: string; detail: string; start: number; end: number };

export class Search {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLUListElement;
  private hits: SearchHit[] = [];
  private active = 0;
  onChoose: (h: SearchHit) => void = () => {};

  constructor(private index: SearchFile, private periods: PeriodRecord[], kindLabel: (k: string) => string) {
    this.el = document.createElement('div');
    this.el.className = 'search';
    this.el.innerHTML = `<label class="search-box"><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><input type="search" placeholder="Go to a place, an event or a period" aria-label="Search" autocomplete="off"><kbd title="Press / to search">/</kbd></label><ul role="listbox" hidden></ul>`;
    this.input = this.el.querySelector('input')!;
    this.list = this.el.querySelector('ul')!;
    this.input.addEventListener('input', () => this.run(kindLabel));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') this.move(1);
      else if (e.key === 'ArrowUp') this.move(-1);
      else if (e.key === 'Enter' && this.hits[this.active]) this.choose(this.hits[this.active]);
      else if (e.key === 'Escape') this.close();
      else return;
      e.preventDefault();
    });
    // Closed a moment after the box loses focus, unless it has it again by then: a search begun just after a choice
    // keeps its list.
    this.input.addEventListener('blur', () => setTimeout(() => document.activeElement !== this.input && this.close(), 150));
  }

  private run(kindLabel: (k: string) => string): void {
    const q = this.input.value.trim().toLowerCase();
    if (!q) return this.close();
    const words = q.split(/\s+/);
    const match = (s: string) => words.every((w) => s.toLowerCase().includes(w));
    // Records found by a name they went by come before those that match only in their summary or id, and rows of
    // datasets, found by their name alone, after records. A name not the label says what it is a name of.
    const named = [...this.index.entities, ...(this.index.rows ?? [])]
      .map((e) => ({ e, name: nameFound(e, q) }))
      .filter(({ e, name }) => name || (!e.dataset && match(`${e.summary ?? ''} ${e.id}`)))
      .sort((a, b) => Number(!!b.name) - Number(!!a.name) || Number(!!a.e.dataset) - Number(!!b.e.dataset));
    const ents: SearchHit[] = named.map(({ e, name }) => ({
      type: 'entity',
      id: e.id,
      label: name ?? e.label,
      detail: `${name && name !== e.label ? `${e.label} · ` : ''}${kindLabel(e.kind)}${e.dataset ? ', a dataset’s rows' : ''}`,
      located: e.located,
    }));
    const pers: SearchHit[] = this.periods
      .filter((p) => match(p.name))
      .map((p) => ({ type: 'period', id: p.id, label: p.name, detail: p.rank, start: p.start, end: p.end }));
    this.hits = [...ents, ...pers].slice(0, 12);
    this.active = 0;
    this.render();
  }

  private render(): void {
    this.list.innerHTML = this.hits
      .map((h, i) => `<li role="option" data-i="${i}" class="${i === this.active ? 'active' : ''}"><span>${esc(h.label)}</span><small>${esc(h.detail)}</small></li>`)
      .join('');
    this.list.hidden = this.hits.length === 0;
    for (const li of this.list.querySelectorAll('li')) li.onmousedown = () => this.choose(this.hits[Number(li.dataset.i)]);
  }

  private move(d: number): void {
    if (!this.hits.length) return;
    this.active = (this.active + d + this.hits.length) % this.hits.length;
    this.render();
  }

  private choose(h: SearchHit): void {
    this.close();
    this.input.value = '';
    // On a touch screen the keyboard goes, so that what was chosen can be seen.
    if (matchMedia('(pointer: coarse)').matches) this.input.blur();
    this.onChoose(h);
  }

  private close(): void {
    this.list.hidden = true;
  }

  focus(): void {
    this.input.focus();
  }
}
