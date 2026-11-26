import { PRESENT_YEAR, timeToParam } from '../../../core/time.ts';
import { loadAtlas } from './load.ts';
import { esc } from '../ui/html.ts';
import { catalog, REGIONS, shapes, STATUS, type Entry, type Region, type Status } from './catalog.ts';
import './history.css';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const count = (n: number) => n.toLocaleString('en-US');
const swatch = (s: Status) => `<i class="swatch ${s}" aria-hidden="true"></i>`;
const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const first = <T>(values: T[]): T | undefined => values[0];
function date(t: number): string {
  const y = Math.floor(t);
  if (y < -99999) return `${Number(((PRESENT_YEAR - t) / 1e6).toPrecision(3))} Ma`;
  return y <= 0 ? `${count(1 - y)} BCE` : `${count(y).replace(',', '')} CE`;
}
const dated = (a: number | null, b: number | null) =>
  a == null ? 'Date unknown' : b == null || date(a) === date(b) ? date(a) : `${date(a)} – ${date(b)}`;
const rangeText = (e: Entry) => dated(e.start, e.status === 'border' && e.end != null ? e.end - 1 : e.end);
const current = new URL(location.href);
const region = byId<HTMLSelectElement>('region'),
  status = byId<HTMLSelectElement>('status'),
  era = byId<HTMLSelectElement>('era');
const query = byId<HTMLInputElement>('search'),
  chart = byId('chart'),
  dialog = byId<HTMLDialogElement>('inspector');
const measure = document.createElement('canvas').getContext('2d')!;
let entries: Entry[] = [],
  buildId = '',
  view = 'timeline',
  page = 0,
  viewerRoot = new URL('./', location.href);
let allStart = -3298050,
  allEnd = 2025;
const windows = [
  ['all', 'All time'],
  ['early', 'Deep prehistory'],
  ['settled', '12,000–3400 BCE'],
  ['ancient', '3400–500 BCE'],
  ['classical', '500 BCE–500 CE'],
  ['medieval', '500–1500 CE'],
  ['modern', '1500 CE onward'],
];
interface Scale {
  limits: number[];
  stops: number[];
  ticks: number[];
}
function scale(): Scale {
  const cuts = [allStart, -11999, -3399, -499, 500, 1500, allEnd];
  const i = windows.findIndex((w) => w[0] === era.value);
  if (i <= 0) return { limits: cuts, stops: [0, 0.105, 0.28, 0.47, 0.63, 0.83, 1], ticks: [allStart, -3399, -499, 500, 1500, allEnd] };
  const [a, b] = cuts.slice(i - 1, i + 1);
  const step = [0, 500000, 2000, 500, 200, 200, 100][i];
  const ticks = [a];
  for (let t = Math.ceil(a / step) * step; t < b; t += step) if (t > a + 0.1 * (b - a) && t < b - 0.1 * (b - a)) ticks.push(t);
  return { limits: [a, b], stops: [0, 1], ticks: [...ticks, b] };
}
function position(t: number, s: Scale): number {
  const i = s.limits.findIndex((v) => v > t);
  if (i === 0) return 0;
  if (i < 0) return 1;
  return s.stops[i - 1] + ((s.stops[i] - s.stops[i - 1]) * (t - s.limits[i - 1])) / (s.limits[i] - s.limits[i - 1]);
}
function tick(t: number): string {
  return t === allEnd ? date(t - 1) : date(t);
}

type Segment = { a: number; b: number; status: Status };
function segments(e: Entry): Segment[] {
  const out: Segment[] = [];
  if (e.reference) out.push({ a: e.reference.start, b: e.reference.end, status: 'reference' });
  for (const [a, b] of e.ranges) out.push({ a, b, status: 'border' });
  if (e.status === 'record' && e.source) {
    const { start, end } = e.source.time;
    const a = start.best ?? end.best,
      b = end.best ?? a;
    if (a != null && b != null) out.push({ a, b, status: 'record' });
  } else if (!out.length && e.start != null && e.end != null) out.push({ a: e.start, b: e.end, status: e.status });
  return out;
}
function intersects(v: Segment, a: number, b: number): boolean {
  return v.a < b && (v.b > a || (v.b === a && v.status !== 'border'));
}
function visible(s: Scale): Entry[] {
  const q = normalize(query.value.trim());
  return entries.filter(
    (e) =>
      (!region.value || e.region === region.value) &&
      (!status.value || e.status === status.value) &&
      (era.value === 'all' || segments(e).some((v) => intersects(v, s.limits[0], s.limits.at(-1)!))) &&
      (!q || normalize([e.label, ...(e.source?.names ?? []).map((n) => n.text), e.reference?.name ?? '', e.region].join(' ')).includes(q)),
  );
}
function updateUrl(): void {
  for (const [key, val] of [
    ['region', region.value],
    ['coverage', status.value],
    ['era', era.value === 'all' ? '' : era.value],
    ['q', query.value],
    ['view', view === 'index' ? view : ''],
  ]) {
    if (val) current.searchParams.set(key, val);
    else current.searchParams.delete(key);
  }
  if (location.protocol === 'https:' || location.protocol === 'http:') history.replaceState(null, '', current);
}
function reset(): void {
  region.value = '';
  status.value = '';
  era.value = 'all';
  query.value = '';
  page = 0;
  drawMap();
  render();
}

function drawMap(): void {
  const map = byId('map');
  const paths = REGIONS.map((r) => {
    const d = shapes[r].map((ring) => ring.map(([lon, lat], i) => `${i ? 'L' : 'M'}${lon + 180},${85 - lat}`).join('') + 'Z').join('');
    return `<path d="${d}" fill="${!region.value || region.value === r ? '#93ad98' : '#d4dbcf'}" stroke="#faf9f5" stroke-width=".5"/>`;
  });
  const points = entries.filter((e) => e.source?.places?.length && (!region.value || e.region === region.value));
  // Use one mark per occupied two-degree cell, so frequently redrawn borders do not dominate the map.
  const cells = new Set<string>();
  for (const e of points) {
    const [, , lon, lat] = e.source!.places![0];
    cells.add(`${Math.round(lon / 2) * 2 + 180},${85 - Math.round(lat / 2) * 2}`);
  }
  const dots = [...cells].map((k) => {
    const [x, y] = k.split(',');
    return `<circle cx="${x}" cy="${y}" r="1.05"/>`;
  });
  map.innerHTML = `<svg viewBox="-4 -2 368 156" preserveAspectRatio="xMidYMid meet" role="presentation"><defs><pattern id="grid-pattern" width="30" height="30" patternUnits="userSpaceOnUse" y="25"><path d="M30 0H0V30" fill="none" stroke="#bdc8b9" stroke-width=".45" stroke-dasharray="2.5 2"/></pattern></defs><rect width="360" height="152" fill="url(#grid-pattern)"/>${paths.join('')}<g fill="#376951" opacity=".78">${dots.join('')}</g></svg>`;
}

const shortNames: Record<string, string> = {
  'Pit dwelling of the Jōmon': 'Jōmon pit dwellings',
  'Mudbrick house of Neolithic Mehrgarh': 'Mehrgarh houses',
  'Old Kingdom of Egypt': 'Old Kingdom',
  'New Kingdom of Egypt': 'New Kingdom',
  'Northern Iroquoian longhouse village': 'Iroquoian longhouses',
  'House on latte stones': 'Latte houses',
};
function timeline(items: Entry[], s: Scale): void {
  const axis = s.ticks.map((t) => `<span class="tick" style="left:${100 * position(t, s)}%">${tick(t)}</span>`).join('');
  chart.innerHTML = `<div class="timeline-grid"><div class="axis"><div class="axis-name">Region</div><div class="axis-track">${axis}</div></div></div>`;
  const grid = chart.firstElementChild!;
  const width = grid.querySelector('.axis-track')!.getBoundingClientRect().width;
  measure.font = Number.parseFloat(getComputedStyle(document.body).fontSize) * 0.86 + 'px Plex, sans-serif';
  const guides = s.ticks.map((t) => `<span class="guide" style="left:${100 * position(t, s)}%"></span>`).join('');
  const groups = [...REGIONS, 'Unplaced'] as Region[];
  for (const r of groups) {
    const group = items.filter((e) => e.region === r);
    if (!group.length) continue;
    const lanes: number[] = [];
    const marks: string[] = [];
    for (const e of group) {
      const parts = segments(e).filter((v) => intersects(v, s.limits[0], s.limits.at(-1)!));
      if (!parts.length) continue;
      const spanLeft = Math.min(...parts.map((v) => position(v.a, s))) * width;
      const spanRight = Math.max(...parts.map((v) => position(v.b, s))) * width;
      const name = shortNames[e.label] ?? e.label,
        labelWidth = Math.min(163, Math.ceil(measure.measureText(name).width + 6));
      const left = Math.max(0, Math.min(spanLeft, width - labelWidth));
      const right = Math.min(width, Math.max(left + labelWidth, spanRight, spanLeft + 5));
      let lane = lanes.findIndex((end) => end + 7 < left);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = right;
      const bands = parts
        .map((v) => {
          const x = position(v.a, s) * width,
            y = position(v.b, s) * width;
          return `<span class="band ${v.status}${v.a === v.b ? ' point' : ''}" style="left:${Math.min(x - left, right - left - 3)}px;width:${Math.max(2, y - x)}px"></span>`;
        })
        .join('');
      marks.push(
        `<button class="mark" data-entry="${esc(e.id)}" style="top:${8 + lane * 33}px;left:${left}px;width:${right - left}px" title="${esc(e.label + ' · ' + rangeText(e) + ' · ' + STATUS[e.status])}" aria-label="${esc(e.label + ', ' + STATUS[e.status])}"><span class="mark-label" style="width:${labelWidth}px">${esc(name)}</span>${bands}</button>`,
      );
    }
    if (!marks.length) continue;
    grid.insertAdjacentHTML(
      'beforeend',
      `<div class="region-row"><button class="region-name" data-region="${esc(r)}" title="Browse the full index for ${esc(r)}"><strong>${esc(r)}</strong><small>${marks.length} shown</small></button><div class="track" style="height:${Math.max(65, 16 + lanes.length * 33)}px">${guides}${marks.join('')}</div></div>`,
    );
  }
}
function list(items: Entry[]): void {
  const rows = items.map(
    (e) =>
      `<button class="list-row" data-entry="${esc(e.id)}"><strong>${esc(e.label)}</strong><span>${esc(e.region)}</span><span>${esc(rangeText(e))}</span><span>${swatch(e.status)}${STATUS[e.status]}</span></button>`,
  );
  chart.innerHTML = `<div class="table-wrap"><div class="list-head"><span>Entry</span><span>Region</span><span>Dates in the atlas</span><span>Coverage</span></div>${rows.join('')}</div>`;
}
function render(): void {
  if (!entries.length) return;
  const s = scale(),
    matches = visible(s);
  const highlights = view === 'timeline' && !query.value.trim() && !region.value && !status.value;
  let items = highlights ? matches.filter((e) => e.highlight) : matches;
  if (view === 'timeline') items = items.filter((e) => segments(e).length);
  items.sort((a, b) =>
    view === 'index'
      ? a.label.localeCompare(b.label) || (a.start ?? Infinity) - (b.start ?? Infinity)
      : (a.start ?? Infinity) - (b.start ?? Infinity) || a.label.localeCompare(b.label),
  );
  const size = highlights ? Math.max(1, items.length) : 40,
    pages = Math.ceil(items.length / size);
  page = Math.max(0, Math.min(page, pages - 1));
  const slice = items.slice(page * size, (page + 1) * size);
  byId('timeline').setAttribute('aria-pressed', String(view === 'timeline'));
  byId('index').setAttribute('aria-pressed', String(view === 'index'));
  byId('chart-title').textContent = view === 'timeline' ? 'Civilization timeline' : 'Historical index';
  byId('chart-sub').textContent = highlights
    ? `${count(items.length)} highlights from ${count(matches.length)} entries · Select a mark to inspect its evidence.`
    : `${count(items.length)} ${items.length === 1 ? 'entry' : 'entries'}${region.value ? ' in ' + region.value : ''}${query.value.trim() ? ' matching “' + query.value.trim() + '”' : ''}`;
  const foot = byId('chart-foot');
  const note =
    view === 'timeline'
      ? era.value === 'all'
        ? 'Overview uses a segmented time scale.'
        : 'Years are spaced evenly in this time window.'
      : 'Entries are sorted by name.';
  foot.innerHTML = `<span>${note} <a href="#method" id="method-link">Reading the atlas</a></span>`;
  byId('method-link').onclick = () => {
    byId<HTMLDetailsElement>('method').open = true;
  };
  if (!items.length)
    chart.innerHTML = '<div class="empty">No entries match this view.<button class="secondary" id="clear">Clear filters</button></div>';
  else if (view === 'timeline') timeline(slice, s);
  else list(slice);
  if (!items.length) byId('clear').onclick = reset;
  if (pages > 1) {
    foot.insertAdjacentHTML(
      'beforeend',
      `<span class="page-controls"><button id="prev" ${page ? '' : 'disabled'}>Previous</button>Page ${page + 1} of ${pages}<button id="next" ${page + 1 < pages ? '' : 'disabled'}>Next</button></span>`,
    );
    byId('prev').onclick = () => {
      page--;
      render();
    };
    byId('next').onclick = () => {
      page++;
      render();
    };
  }
  updateUrl();
}

function recordUrl(id: string, t?: number, place?: number[]): string {
  const globe = new URL('./', viewerRoot);
  if (buildId) globe.searchParams.set('b', buildId);
  if (id) globe.searchParams.set('sel', id);
  if (t != null) globe.searchParams.set('t', timeToParam(t));
  if (place) {
    globe.searchParams.set('lon', String(place[2]));
    globe.searchParams.set('lat', String(place[3]));
    globe.searchParams.set('d', '1.8');
  }
  return globe.href;
}
function inspect(e: Entry): void {
  let body = `<h2 id="detail-title">${esc(e.label)}</h2><p class="detail-meta">${esc(e.region)} · ${esc(e.kind.replaceAll('/', ' / '))}</p><hr class="detail-rule"><span class="status-label">${swatch(e.status)}${STATUS[e.status]}</span>`;
  if (e.source && !e.source.dataset) {
    body += `<h3>Record chronology</h3><p>${dated(e.source.time.start.best ?? e.source.time.end.best, e.source.time.end.best)}${e.source.time.start.best != null && e.source.time.end.best == null ? ' · only the start is dated' : e.source.time.start.best == null && e.source.time.end.best != null ? ' · only the end is dated' : ''}</p>`;
    if (e.source.summary) body += `<p>${esc(e.source.summary)}</p>`;
  }
  if (e.ranges.length)
    body += `<h3>Mapped borders</h3><p class="detail-ranges">${e.ranges.map(([a, b]) => dated(a, b - 1)).join(' · ')}</p><p>${count(e.source!.places!.length)} dated border observations in <a href="https://doi.org/10.1038/s41597-025-04516-9">Cliopatria</a>.</p>`;
  if (e.reference) {
    const r = e.reference;
    body += `<h3>Reference chronology</h3><p>${dated(r.start, r.end)} · ${esc(r.place)}</p><p>“${esc(r.name)}” in <i>${esc(r.source)}</i>${r.locator ? ', ' + esc(r.locator) : ''}.</p><a href="https://n2t.net/ark:/99152/${esc(r.id)}">PeriodO definition</a>`;
    if (e.status === 'reference') body += '<p>This period has no direct model record linked in the atlas.</p>';
  }
  if (e.source) {
    const place = first(e.source.places ?? []);
    const t = e.status === 'border' ? e.start : (e.source.time.start.best ?? e.start);
    body += `<div><a class="primary" href="${esc(recordUrl(e.status === 'record' ? e.id : '', t ?? undefined, place))}">${e.status === 'record' ? 'Open model record' : 'View borders on the globe'}</a></div>`;
  }
  byId('detail').innerHTML = body;
  dialog.showModal();
}

async function main() {
  const data = await loadAtlas(viewerRoot, current.searchParams.get('b'));
  entries = catalog(data.search);
  buildId = data.buildId;
  viewerRoot = data.root;
  const dates = entries.flatMap((e) => [e.start, e.end]).filter((x): x is number => x != null);
  allStart = Math.min(-11999 - 1, ...dates);
  allEnd = Math.max(2025, Math.ceil(Math.max(...dates)));
  for (const a of document.querySelectorAll<HTMLAnchorElement>('[data-dest]')) {
    const url = new URL(a.dataset.dest === 'coverage' ? 'coverage.html' : './', viewerRoot);
    if (buildId) url.searchParams.set('b', buildId);
    a.href = url.href;
  }
  const metrics: [number, string, Status?][] = [
    [entries.length, 'Atlas entries'],
    [entries.filter((e) => e.status === 'record').length, 'Model records', 'record'],
    [entries.filter((e) => e.status === 'border').length, 'Border entries', 'border'],
    [entries.filter((e) => e.status === 'reference').length, 'Reference only', 'reference'],
  ];
  byId('summary').innerHTML = metrics
    .map(([n, name, s]) => `<div class="metric"><strong>${count(n)}</strong><span>${s ? swatch(s) : ''}${name}</span></div>`)
    .join('');
  byId('build-label').textContent = data.label;
  for (const r of [...REGIONS, 'Unplaced']) if (entries.some((e) => e.region === r)) region.add(new Option(r, r));
  for (const [key, label] of windows) era.add(new Option(label, key));
  for (const [input, key] of [
    [region, 'region'],
    [status, 'coverage'],
    [era, 'era'],
  ] as const) {
    const value = current.searchParams.get(key);
    input.value = value && [...input.options].some((o) => o.value === value) ? value : input === era ? 'all' : '';
    input.onchange = () => {
      page = 0;
      if (input === region) drawMap();
      render();
    };
  }
  query.value = current.searchParams.get('q') ?? '';
  view = current.searchParams.get('view') === 'index' ? 'index' : 'timeline';
  query.oninput = () => {
    page = 0;
    render();
  };
  for (const v of ['timeline', 'index'])
    byId(v).onclick = () => {
      view = v;
      page = 0;
      render();
    };
  chart.onclick = (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (b?.dataset.entry) {
      const item = entries.find((x) => x.id === b.dataset.entry);
      if (item) inspect(item);
    }
    if (b?.dataset.region) {
      region.value = b.dataset.region;
      view = 'index';
      page = 0;
      drawMap();
      render();
    }
  };
  byId('close-detail').onclick = () => dialog.close();
  dialog.onclick = (e) => {
    if (e.target === dialog && !(e.offsetX >= 0 && e.offsetX <= dialog.clientWidth && e.offsetY >= 0 && e.offsetY <= dialog.clientHeight))
      dialog.close();
  };
  drawMap();
  render();
  chart.setAttribute('aria-busy', 'false');
  let lastWidth = chart.clientWidth;
  new ResizeObserver(() => {
    if (lastWidth !== chart.clientWidth) {
      lastWidth = chart.clientWidth;
      render();
    }
  }).observe(chart);
  await document.fonts?.ready;
  if (view === 'timeline') render();
}
main().catch((err: unknown) => {
  byId('chart-sub').textContent = 'The historical index could not be loaded.';
  chart.setAttribute('aria-busy', 'false');
  chart.innerHTML = `<div class="empty">${esc(err instanceof Error ? err.message : String(err))}<button class="secondary" id="retry">Try again</button></div>`;
  byId('retry').onclick = () => location.reload();
});
