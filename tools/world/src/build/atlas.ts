// The atlas of who lived where: the land's fossils, reduced to a list for each patch of land in each stage
// (life/atlas.json, life/bins/<i>.json). A taxon reaches a place by its rows: within a few hundred km it
// is recorded here; within reach overland, in a like climate, in the region; and where nothing is near, the
// nearest kind of thing stands in, as a clade, and says so. The sea costs far more than the land, so that
// a dinosaur of Mongolia does not walk into the Hell Creek.
import { TIER, type AtlasBin, type AtlasBinRef, type AtlasGrid, type AtlasIndex, type AtlasSize, type AtlasTaxon, type AtlasWhere } from '../../../../core/atlas.ts';
import { canonicalForm, type Form } from '../../../../core/form.ts';
import type { PeriodRecord } from '../../../../core/records.ts';
import { rotate, toLatLon, conj, unitVector } from '../../../../core/quat.ts';
import { climateClass, type ClimateClass, type ClimateNode, type ClimateRule } from '../../../../core/climate.ts';
import { fromMa, toMa } from '../../../../core/time.ts';
import { FormTree } from '../forms.ts';
import { pbdbNumber, type LandSite, type LandSnapshot, type RockAge, type RocksSnapshot } from '../pbdb.ts';
import { sha256, stableStringify } from '../util.ts';
import type { World } from '../world.ts';
import type { ClimateKeyframe } from './climate.ts';
import { SRC_W, type Snapshot } from './fields.ts';
import { claimOf, sourceRecord, subjectTime, type Solved } from './records.ts';

export type RocksAgeData = Pick<RocksSnapshot, 'ages' | 'words'>;

export interface RecentClimateSource {
  keys: ClimateKeyframe[];
  grid: { step: number; nx: number; lon0: number; lat0: number };
  maxAgeMa: number;
}

export interface AtlasParams {
  /** the grid of the lists, and of the distances, in degrees */
  grid_deg: number;
  graph_deg: number;
  /** how far a row counts as here, and as in the region, in km over land */
  here_km: number;
  region_km: number;
  /** how quickly a row's weight falls off with distance, in km */
  kernel_km: number;
  /** how much of a row's span must lie in the stage for it to count as recorded here */
  here_share?: number;
  /** how many extra km of overland distance each 1,000 m of vertical climb along the path counts as */
  climb_cost?: number;
  /** maximum elevation difference between a site and a patch (m), and its e-folding scale (m) */
  max_elev_diff_m?: number;
  elev_scale_m?: number;
  /** minimum climate similarity (0–1) for a row to reach a patch as in the region */
  min_climate_like?: number;
  /** how much further a km of shallow sea and of deep sea counts */
  shallow_cost: number;
  deep_cost: number;
  /** how deep the shallow sea goes, in m below the coast */
  shallow_m: number;
  /** a row dated to a span longer than this says too little of any stage, in Myr */
  longest_span: number;
  /** and one longer than this many times a stage too little of that stage: a row of the whole Pleistocene, of the Holocene */
  longest_span_in_stages: number;
  /** and one longer than this is left out for a taxon that has rows dated better than it, which say more */
  tight_span: number;
  /** a stage is cut if it is longer than this, and joined to the next if shorter, in Myr */
  longest_bin: number;
  shortest_bin: number;
  /** how many of each kind of thing a list holds */
  quotas: Record<string, number>;
  /** how many stand-ins a kind of thing gets when nothing nearer is known */
  standins: Record<string, number>;
  /** what counts as a big, a small and a tiny animal, by length in metres */
  big_m: number;
  small_m: number;
  tiny_m: number;
}

/** What a taxon of the snapshot is, to the atlas: how it is drawn, and which kind of thing on a list it is. */
interface Known {
  no: number;
  /** its form's node, adopted by a record: the node a stand-in is drawn as */
  node: string;
  nodeNo: number;
  bucket: string;
  /** true when PBDB places the taxon solely in marine/coastal waters (e.g. oceanic seabirds, marine crocs) */
  strictlySea?: boolean;
  taxon: Omit<AtlasTaxon, 'rows' | 'span' | 'standin'>;
}

/** The kind of thing on a list: so that what is many and small does not crowd out what is few and large. */
export function bucketOf(form: Form, lengthM: number | undefined, p: Pick<AtlasParams, 'big_m' | 'small_m' | 'tiny_m'>): string {
  if (form.kind === 'plant') return form.behave?.layer ?? 'canopy';
  if (form.behave?.habitat === 'water') return 'water';
  const l = lengthM ?? 1;
  if (l < p.tiny_m) return 'tiny';
  if (form.behave?.habitat === 'air') return 'air';
  return l >= p.big_m ? 'big' : l >= p.small_m ? 'middle' : 'small';
}

/** Min-heap of [cost, node], for walking the land. */
export class Heap {
  private c: number[] = [];
  private n: number[] = [];
  get size(): number {
    return this.c.length;
  }
  push(cost: number, node: number): void {
    const { c, n } = this;
    let i = c.length;
    c.push(cost);
    n.push(node);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (c[p] <= cost) break;
      c[i] = c[p];
      n[i] = n[p];
      i = p;
    }
    c[i] = cost;
    n[i] = node;
  }
  pop(): [number, number] {
    const { c, n } = this;
    const top: [number, number] = [c[0], n[0]];
    const lc = c.pop()!;
    const ln = n.pop()!;
    const size = c.length;
    if (size) {
      let i = 0;
      for (;;) {
        let k = i * 2 + 1;
        if (k >= size) break;
        if (k + 1 < size && c[k + 1] < c[k]) k++;
        if (c[k] >= lc) break;
        c[i] = c[k];
        n[i] = n[k];
        i = k;
      }
      c[i] = lc;
      n[i] = ln;
    }
    return top;
  }
}

/**
 * The land of a moment as a graph: each node's cost per km to cross, on a lat/lon grid. The land's walkers cross the land
 * for a km a km and the sea dearly; `costOf` turns that round for the sea's (sea.ts).
 */
export class LandGraph {
  readonly nx: number;
  readonly ny: number;
  readonly cost: Float32Array;
  readonly land: Uint8Array;
  readonly elev: Int16Array;
  private climbCost: number;
  private cosines: Float64Array;
  constructor(readonly step: number, snap: Snapshot, isoline: number, p: Pick<AtlasParams, 'shallow_m' | 'shallow_cost' | 'deep_cost' | 'climb_cost'>, costOf?: (elevation: number) => number) {
    this.nx = Math.round(360 / step);
    this.ny = Math.round(180 / step) + 1;
    const n = this.nx * this.ny;
    this.cost = new Float32Array(n);
    this.land = new Uint8Array(n);
    this.elev = new Int16Array(n);
    this.climbCost = costOf ? 0 : p.climb_cost ?? 0;
    this.cosines = new Float64Array(this.ny);
    for (let j = 0; j < this.ny; j++) {
      const lat = 90 - j * step;
      this.cosines[j] = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
      for (let i = 0; i < this.nx; i++) {
        const lon = -180 + i * step;
        const e = snap.elev[(90 - lat) * SRC_W + (lon + 180)];
        const k = j * this.nx + i;
        this.elev[k] = e;
        this.land[k] = e >= isoline ? 1 : 0;
        this.cost[k] = costOf ? costOf(e) : e >= isoline ? 1 : e >= isoline - p.shallow_m ? p.shallow_cost : p.deep_cost;
      }
    }
  }
  nodeAt(lat: number, lon: number): number {
    const j = Math.max(0, Math.min(this.ny - 1, Math.round((90 - lat) / this.step)));
    const i = ((Math.round((lon + 180) / this.step) % this.nx) + this.nx) % this.nx;
    return j * this.nx + i;
  }
  /** Cost in km over land from some nodes, out to a limit; the nodes reached go in `reached`, if given. */
  walk(sources: number[], limit: number, out: Float32Array, reached?: number[]): void {
    out.fill(Infinity);
    const heap = new Heap();
    for (const s of sources) {
      out[s] = 0;
      heap.push(0, s);
    }
    const { nx, ny, step, cost, land, elev, climbCost, cosines } = this;
    const km = step * 111.2;
    // Each node is settled once: many paths over a grid cost the same to within rounding.
    const done = new Uint8Array(out.length);
    while (heap.size) {
      const [d, k] = heap.pop();
      if (done[k]) continue;
      done[k] = 1;
      reached?.push(k);
      const j = Math.floor(k / nx);
      const i = k - j * nx;
      for (let dj = -1; dj <= 1; dj++) {
        const v = j + dj;
        if (v < 0 || v >= ny) continue;
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const u = (i + di + nx) % nx;
          const m = v * nx + u;
          const ex = di * km * cosines[j];
          const ey = dj * km;
          const step2 = Math.sqrt(ex * ex + ey * ey) * (cost[k] + cost[m]) * 0.5;
          const climb = climbCost && land[k] && land[m] ? (Math.abs(elev[m] - elev[k]) / 1000) * climbCost : 0;
          const nd = d + step2 + climb;
          if (nd < out[m] && nd <= limit) {
            out[m] = nd;
            heap.push(nd, m);
          }
        }
      }
    }
  }
}

const AGE_UNIT_MA: Record<string, number> = { Ma: 1, Ka: 1e-3, YBP: 1e-6 };

/**
 * Each site's effective [max, min] age span in Ma: its stratigraphic interval tightened by any valid measured ages for
 * its collection in the rock record that overlap the stratigraphic interval. Single direct dates without a stated error
 * receive a small symmetric uncertainty (±5%, at least 50 yr) so they remain a span rather than a zero-width instant.
 */
export function siteSpans(sites: LandSite[], rocks?: RocksAgeData): [number, number][] {
  if (!rocks?.ages.length) return sites.map((s) => [s[3], s[4]]);
  const byColl = new Map<number, RockAge[]>();
  for (const a of rocks.ages) {
    let list = byColl.get(a[0]);
    if (!list) byColl.set(a[0], (list = []));
    list.push(a);
  }
  return sites.map((s) => {
    const [coll, , , sMax, sMin] = s;
    const ages = byColl.get(coll);
    if (!ages) return [sMax, sMin];
    let hi = -Infinity;
    let lo = Infinity;
    let hasMax = false;
    let hasMin = false;
    for (const [, which, value, error, unitIdx] of ages) {
      const scale = AGE_UNIT_MA[rocks.words[unitIdx] ?? ''];
      if (!scale || !Number.isFinite(value) || value < 0) continue;
      const v = value * scale;
      const err = error !== null && Number.isFinite(error) && error > 0 ? error * scale : null;
      if (which === 0) {
        const pad = err ?? Math.max(v * 0.05, 5e-5);
        hi = Math.max(hi, v + pad);
        lo = Math.min(lo, Math.max(0, v - pad));
        hasMax = true;
        hasMin = true;
      } else if (which === 1) {
        hi = Math.max(hi, v + (err ?? 0));
        hasMax = true;
      } else if (which === 2) {
        lo = Math.min(lo, Math.max(0, v - (err ?? 0)));
        hasMin = true;
      }
    }
    if (!hasMax && !hasMin) return [sMax, sMin];
    const mMax = hasMax ? hi : sMax;
    const mMin = hasMin ? lo : sMin;
    if (mMax < mMin) return [sMax, sMin];
    const cMax = Math.min(sMax, mMax);
    const cMin = Math.max(sMin, mMin);
    if (cMax < cMin) return [sMax, sMin];
    return [cMax, cMin];
  });
}

/**
 * How much of a row a stage holds: the share of the row's span that lies in it, or 0 where the row says too little of the
 * stage to count at all. A row dated to a span longer than `longest_span` says too little of any stage, and one longer than
 * `longest_span_in_stages` times the stage too little of that stage: a row of the whole Pleistocene says next to nothing of
 * the Holocene, though its span takes the Holocene in.
 */
export function rowShare(max: number, min: number, olderMa: number, youngerMa: number, p: Pick<AtlasParams, 'longest_span' | 'longest_span_in_stages'>): number {
  const span = max - min;
  if (span === 0) return max > youngerMa && max < olderMa ? 1 : 0;
  if (max <= youngerMa || min >= olderMa) return 0;
  if (span > p.longest_span || span > p.longest_span_in_stages * (olderMa - youngerMa)) return 0;
  return (Math.min(max, olderMa) - Math.max(min, youngerMa)) / span;
}

/** When a record says its taxon died out, as an age in Ma, at the latest its end may be: undefined where it gives no end. */
export function recordEndMa(s: Solved, id: string): number | undefined {
  const c = claimOf(s, id, 'end');
  if (!c || c.value === 'unknown') return undefined;
  const best = subjectTime(s, id).time.end.best;
  return best === null || !Number.isFinite(best) ? undefined : toMa(best);
}

/**
 * When each taxon of a snapshot died out, as the world's records say, as an age in Ma: the earliest end of the records that
 * adopt it and the clades above it, as nothing outlives its clade. Undefined where none of them gives an end.
 */
export function endsOf(snap: Pick<LandSnapshot, 'taxa'>, adoptedAt: Map<number, string>, recordEnd: (id: string) => number | undefined): (no: number) => number | undefined {
  const byNo = new Map(snap.taxa.map((t) => [t[0], t]));
  const ends = new Map<string, number | undefined>();
  const memo = new Map<number, number | undefined>();
  return (no) => {
    if (memo.has(no)) return memo.get(no);
    let out: number | undefined;
    for (let x = no, g = 0; x && byNo.has(x) && g < 200; x = byNo.get(x)![3], g++) {
      const id = adoptedAt.get(x);
      if (!id) continue;
      if (!ends.has(id)) ends.set(id, recordEnd(id));
      const e = ends.get(id);
      if (e !== undefined && (out === undefined || e > out)) out = e;
    }
    memo.set(no, out);
    return out;
  };
}

/**
 * Stages from the world's chart, cut or joined to a usable length. Youngest last. A run of stages joined into one is named
 * for the unit of the chart it makes up, where it makes one up: the Holocene's three stages are the Holocene.
 */
export function atlasBins(periods: Pick<PeriodRecord, 'rank' | 'start' | 'end' | 'name'>[], longest: number, shortest: number, oldest = 541): { from: number; to: number; name: string }[] {
  const span = (p: Pick<PeriodRecord, 'start' | 'end'>) => ({ older: toMa(p.start), younger: Math.max(0, toMa(p.end)) });
  const stages = periods
    .filter((p) => p.rank === 'stage')
    .map((p) => ({ ...span(p), name: p.name }))
    .filter((p) => p.older <= oldest + 0.5)
    .sort((a, b) => a.younger - b.younger);
  const out: { older: number; younger: number; name: string; joined?: boolean }[] = [];
  for (const s of stages) {
    // The shortest are the youngest: joined to the next, up the chart, until they are long enough.
    const prev = out[out.length - 1];
    if (prev && prev.older - prev.younger < shortest) {
      prev.older = s.older;
      prev.name = `${s.name} to ${prev.name}`;
      prev.joined = true;
      continue;
    }
    out.push({ ...s });
  }
  const units = periods.filter((p) => p.rank !== 'stage').map((p) => ({ ...span(p), name: p.name }));
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  for (const s of out) {
    if (!s.joined) continue;
    const unit = units.filter((u) => same(u.older, s.older) && same(u.younger, s.younger)).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0];
    if (unit) s.name = unit.name;
  }
  const cut: { from: number; to: number; name: string }[] = [];
  for (const s of out) {
    const n = Math.max(1, Math.ceil((s.older - s.younger) / longest - 1e-9));
    for (let k = 0; k < n; k++) {
      const a = s.older - ((s.older - s.younger) * k) / n;
      const b = s.older - ((s.older - s.younger) * (k + 1)) / n;
      cut.push({ from: fromMa(a), to: fromMa(b), name: n === 1 ? s.name : `${s.name}, part ${k + 1} of ${n}` });
    }
  }
  return cut.sort((a, b) => a.from - b.from);
}

const round = (x: number, k = 1000) => Math.round(x * k) / k;
/** A span in Ma to the year: a scene draws a taxon only while its rows reach the time shown, which near the present is a year. */
export const YEAR = 1e6;

export interface AtlasOut {
  index: AtlasIndex;
  files: Map<string, string>;
  /** what most wants a form, by the rows of the world it would draw */
  wanted: { no: number; name: string; rows: number; node: string | null }[];
}

/** `recordEnd` says when a record's taxon died out; the world's solved records unless a test says otherwise. */
export function buildAtlas(
  s: Solved,
  periods: PeriodRecord[],
  elevation: Snapshot[],
  climate: ClimateKeyframe[],
  climateGridInfo: { step: number; nx: number; lon0: number; lat0: number },
  rule: ClimateRule,
  log: (m: string) => void,
  recordEnd: (id: string) => number | undefined = (id) => recordEndMa(s, id),
  recentClimates?: RecentClimateSource[],
  rocks?: RocksAgeData,
): AtlasOut | undefined {
  const w = s.world;
  const field = w.fields.find((f) => f.data?.as === 'community');
  if (!field) return undefined;
  const dataset = field.data!.from as string;
  const snap = w.landFossils.get(dataset);
  if (!snap) {
    log(`atlas   not built: no snapshot ${dataset} yet`);
    return undefined;
  }
  const p = field.params as unknown as AtlasParams;
  const hereShare = p.here_share ?? 0.5;
  const maxElevDiff = p.max_elev_diff_m ?? Infinity;
  const elevScale = p.elev_scale_m ?? 0;
  const minClimateLike = p.min_climate_like ?? 0;
  const isoline = (w.fields.find((f) => f.id === 'field:earth/coastline') as unknown as { isoline_m?: number } | undefined)?.isoline_m ?? 20;
  const known = classify(w, snap, p);
  const spans = siteSpans(snap.sites, rocks);

  // Where each site was: its plate, from the plates of today's land.
  const now = [...elevation].sort((a, b) => a.ageMa - b.ageMa)[0];
  const plateNear = (lat: number, lon: number): number => {
    const j0 = Math.round(90 - lat);
    const i0 = Math.round(lon + 180);
    for (let r = 0; r <= 3; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(dj), Math.abs(di)) !== r) continue;
          const j = Math.max(0, Math.min(180, j0 + dj));
          const i = ((i0 + di) % SRC_W + SRC_W) % SRC_W;
          const q = now.plate[j * SRC_W + i];
          if (q) return q;
        }
      }
    }
    return 0;
  };
  const sitePlate = snap.sites.map(([, lat, lng]) => plateNear(lat, lng));
  const adoptedAt = new Map<number, string>();
  for (const e of w.entities) {
    const no = e.kind === 'taxon' ? pbdbNumber(e) : undefined;
    if (no !== undefined) adoptedAt.set(no, e.id);
  }
  const byNo = new Map(snap.taxa.map((t) => [t[0], t]));
  // A species is on a list as its genus, unless someone has written something of the species itself: two names for the
  // same animal should not take up two places on a list.
  const SPECIES = new Set(['species', 'subspecies', 'subgenus']);
  const rolled = new Map<number, number>();
  const rollup = (no: number): number => {
    const seen = rolled.get(no);
    if (seen !== undefined) return seen;
    let x = no;
    for (let g = 0; g < 8; g++) {
      const t = byNo.get(x);
      if (!t || adoptedAt.has(x) || !SPECIES.has(snap.words[t[2]]) || !known.has(t[3])) break;
      x = t[3];
    }
    rolled.set(no, x);
    return x;
  };
  const rowsBySite: number[][] = snap.sites.map(() => []);
  // Which taxa have a row dated well enough that a loose one has nothing to add.
  const tight = new Set<number>();
  for (const [, site, taxon] of snap.rows) {
    if (!known.has(taxon)) continue;
    const t = rollup(taxon);
    rowsBySite[site].push(t);
    if (spans[site][0] - spans[site][1] <= p.tight_span) tight.add(t);
  }
  // Where a record says when a taxon, or a clade above it, died out, nothing of it is drawn after: a row dated wholly after
  // that end says what the record denies, and is left out, and the taxon's span in a stage ends there.
  const endOf = endsOf(snap, adoptedAt, recordEnd);

  const bins = atlasBins(periods, p.longest_bin, p.shortest_bin);
  const grid: AtlasGrid = { step: p.grid_deg, nx: Math.round(360 / p.grid_deg), ny: Math.round(180 / p.grid_deg) };
  const files = new Map<string, string>();
  const refs: AtlasBinRef[] = [];
  const exampleOf = new Map<string, Known>();
  for (const kn of known.values()) if (!exampleOf.has(kn.node)) exampleOf.set(kn.node, kn);
  // Where to go to see a record's taxon: the place and stage with the most rows of it or anything below it.
  const recordsOf = new Map<number, string[]>();
  const recordsAbove = (no: number): string[] => {
    const known0 = recordsOf.get(no);
    if (known0) return known0;
    const out: string[] = [];
    for (let x = no, g = 0; x && byNo.has(x) && g < 200; x = byNo.get(x)![3], g++) {
      const id = adoptedAt.get(x);
      if (id) out.push(id);
    }
    recordsOf.set(no, out);
    return out;
  };
  const where: Record<string, AtlasWhere> = {};
  bins.forEach((bin, binIndex) => {
    const olderMa = toMa(bin.from);
    const youngerMa = toMa(bin.to);
    const midMa = (olderMa + youngerMa) / 2;
    const slice = fromMa(midMa);
    const key = [...elevation].sort((a, b) => Math.abs(a.ageMa - midMa) - Math.abs(b.ageMa - midMa))[0];
    if (Math.abs(key.ageMa - midMa) > 12) return;
    const graph = new LandGraph(p.graph_deg, key, isoline, p);
    // Each site in the stage, where it was, on the graph.
    const atNode = new Map<number, Map<number, { w: number; rows: number; older: number; younger: number; hOlder: number; hYounger: number }>>();
    let rowsHere = 0;
    snap.sites.forEach((site, i) => {
      const [, lat, lng] = site;
      const [max, min] = spans[i];
      const share = rowShare(max, min, olderMa, youngerMa, p);
      if (!share) return;
      const plate = sitePlate[i];
      if (!plate || !s.model.reaches(plate, midMa) || !s.model.reaches(plate, 0)) return;
      const list = rowsBySite[i];
      if (!list.length) return;
      const [la, lo] = toLatLon(rotate(s.model.total(plate, midMa), rotate(conj(s.model.total(plate, 0)), unitVector(lat, lng))));
      const node = graph.nodeAt(la, lo);
      let here = atNode.get(node);
      if (!here) {
        here = new Map();
        atNode.set(node, here);
      }
      const qualHere = share >= hereShare;
      for (const t of list) {
        if (max - min > p.tight_span && tight.has(t)) continue;
        const end = endOf(t);
        if (end !== undefined && max <= end) continue;
        rowsHere++;
        const e = here.get(t);
        if (e) {
          e.w += share;
          e.rows++;
          e.older = Math.max(e.older, max);
          e.younger = Math.min(e.younger, min);
          if (qualHere) {
            e.hOlder = Math.max(e.hOlder, max);
            e.hYounger = Math.min(e.hYounger, min);
          }
        } else here.set(t, { w: share, rows: 1, older: max, younger: min, hOlder: qualHere ? max : -Infinity, hYounger: qualHere ? min : Infinity });
      }
    });
    // The most of each record's taxon in one place in this stage.
    for (const node of [...atNode.keys()].sort((a, b) => a - b)) {
      const count = new Map<string, number>();
      for (const [t, e] of atNode.get(node)!) for (const id of recordsAbove(t)) count.set(id, (count.get(id) ?? 0) + e.w);
      const lat = 90 - Math.floor(node / graph.nx) * graph.step;
      const lon = -180 + (node % graph.nx) * graph.step;
      for (const [id, rows] of count) if (!where[id] || rows > where[id].rows) where[id] = { t: slice, lat, lon, rows: round(rows) };
    }
    // Their climates, for how like a place each is: prefer the finest recent climate covering this stage, falling back to deep-time climate.
    const ck = [...climate].sort((a, b) => Math.abs(a.ageMa - midMa) - Math.abs(b.ageMa - midMa))[0];
    const recent = (recentClimates ?? [])
      .filter((rc) => rc.keys.length && midMa <= rc.maxAgeMa)
      .map((rc) => ({ grid: rc.grid, key: [...rc.keys].sort((a, b) => Math.abs(a.ageMa - midMa) - Math.abs(b.ageMa - midMa))[0] }));
    const sampleClimate = (k: ClimateKeyframe | undefined, g: { step: number; nx: number; lon0: number; lat0: number }, lat: number, lon: number): ClimateNode | undefined => {
      if (!k) return undefined;
      const row = Math.round((g.lat0 - lat) / g.step);
      const col = ((Math.round((lon - g.lon0) / g.step) % g.nx) + g.nx) % g.nx;
      const idx = (row * g.nx + col) * 4;
      if (idx < 0 || idx + 3 >= k.nodes.length) return undefined;
      const c = { hot: k.nodes[idx], cold: k.nodes[idx + 1], aridity: k.nodes[idx + 2], margin: k.nodes[idx + 3] };
      return Number.isNaN(c.hot) ? undefined : c;
    };
    const climateAt = (lat: number, lon: number): ClimateNode | undefined => {
      for (const r of recent) {
        const c = sampleClimate(r.key, r.grid, lat, lon);
        if (c) return c;
      }
      return sampleClimate(ck, climateGridInfo, lat, lon);
    };
    const nodeLat = (k: number) => 90 - Math.floor(k / graph.nx) * graph.step;
    const nodeLon = (k: number) => -180 + (k % graph.nx) * graph.step;
    const occupied = [...atNode.keys()].sort((a, b) => a - b);
    const occClimate = new Map(occupied.map((k) => [k, climateAt(nodeLat(k), nodeLon(k))]));
    // What each taxon's rows say of the climate it lived in this stage: the mean and the spread of the warmest and the
    // coldest month at their places, weighted as the rows are. A scene grows each where its own heights' climate is like it.
    const climateOf = new Map<number, [number, number, number, number]>();
    {
      const acc = new Map<number, Float64Array>();
      for (const o of occupied) {
        const c = occClimate.get(o);
        if (!c) continue;
        for (const [t, e] of atNode.get(o)!) {
          let a = acc.get(t);
          if (!a) acc.set(t, (a = new Float64Array(5)));
          a[0] += e.w;
          a[1] += e.w * c.hot;
          a[2] += e.w * c.hot * c.hot;
          a[3] += e.w * c.cold;
          a[4] += e.w * c.cold * c.cold;
        }
      }
      for (const [t, a] of acc) {
        if (!(a[0] > 0)) continue;
        const hot = a[1] / a[0];
        const cold = a[3] / a[0];
        climateOf.set(t, [round(hot, 10), round(Math.sqrt(Math.max(0, a[2] / a[0] - hot * hot)), 10), round(cold, 10), round(Math.sqrt(Math.max(0, a[4] / a[0] - cold * cold)), 10)]);
      }
    }

    // The patches: each is read at its land node nearest its middle, if it has any land.
    const patchOf = new Map<number, { k: number; lo: number; hi: number; coastal: boolean; clims: ClimateNode[] }>();
    const hasSeaNeighbor = (k: number): boolean => {
      const j = Math.floor(k / graph.nx);
      const i = k - j * graph.nx;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= graph.ny) continue;
        for (let di = -1; di <= 1; di++) {
          if (!dj && !di) continue;
          const ii = (i + di + graph.nx) % graph.nx;
          if (!graph.land[jj * graph.nx + ii]) return true;
        }
      }
      return false;
    };
    for (let row = 0; row < grid.ny; row++) {
      for (let col = 0; col < grid.nx; col++) {
        const lat = 90 - (row + 0.5) * grid.step;
        const lon = -180 + (col + 0.5) * grid.step;
        let best = -1;
        let bestD = Infinity;
        let loE = Infinity;
        let hiE = -Infinity;
        let coastal = false;
        const clims: ClimateNode[] = [];
        const span = Math.ceil(grid.step / graph.step / 2) + 1;
        const c0 = graph.nodeAt(lat, lon);
        const cj = Math.floor(c0 / graph.nx);
        const ci = c0 - cj * graph.nx;
        for (let dj = -span; dj <= span; dj++) {
          const j = cj + dj;
          if (j < 0 || j >= graph.ny) continue;
          for (let di = -span; di <= span; di++) {
            const i = (ci + di + graph.nx) % graph.nx;
            const k = j * graph.nx + i;
            if (!graph.land[k]) continue;
            const la = nodeLat(k);
            const lo = nodeLon(k);
            if (la > 90 - row * grid.step + 1e-9 || la < 90 - (row + 1) * grid.step - 1e-9) continue;
            const dLon = Math.abs(((lo - lon + 540) % 360) - 180);
            if (dLon > grid.step / 2 + 1e-9) continue;
            const e = graph.elev[k];
            if (e < loE) loE = e;
            if (e > hiE) hiE = e;
            if (!coastal && hasSeaNeighbor(k)) coastal = true;
            const nc = climateAt(la, lo);
            if (nc) clims.push(nc);
            const d = (la - lat) * (la - lat) + dLon * dLon;
            if (d < bestD) {
              bestD = d;
              best = k;
            }
          }
        }
        if (best >= 0) patchOf.set(row * grid.nx + col, { k: best, lo: loE, hi: hiE, coastal, clims });
      }
    }
    const reach = p.region_km;
    const dist = new Float32Array(graph.nx * graph.ny);
    // For each patch: every occupied node it can reach, and how far.
    const reachOf = new Map<number, { node: number; km: number }[]>();
    const patches = [...patchOf.entries()];
    for (const o of occupied) {
      graph.walk([o], reach, dist);
      for (const [patch, info] of patches) {
        const d = dist[info.k];
        if (d === Infinity) continue;
        const l = reachOf.get(patch);
        if (l) l.push({ node: o, km: d });
        else reachOf.set(patch, [{ node: o, km: d }]);
      }
    }
    // The nearest of anything, however far, for what a stand-in says.
    const nearest = new Float32Array(graph.nx * graph.ny);
    graph.walk(occupied, Infinity, nearest);
    // What is known of the stage, by kind and by climate: what stand-ins are drawn from.
    const worldwide = new Map<string, Map<string, { w: number; node: string; nodeNo: number }>>();
    const classAt = new Map<number, ClimateClass | null>();
    for (const o of occupied) {
      const c = occClimate.get(o);
      const cls = c ? climateClass(c, rule) : null;
      classAt.set(o, cls);
      for (const [t, e] of atNode.get(o)!) {
        const kn = known.get(t)!;
        for (const key of [`${kn.bucket}|${cls ?? 'any'}`, `${kn.bucket}|any`]) {
          let m = worldwide.get(key);
          if (!m) {
            m = new Map();
            worldwide.set(key, m);
          }
          const q = m.get(kn.node);
          if (q) q.w += e.w;
          else m.set(kn.node, { w: e.w, node: kn.node, nodeNo: kn.nodeNo });
        }
      }
    }
    const taxa: AtlasTaxon[] = [];
    const taxonIndex = new Map<string, number>();
    const nodes: Record<string, number[]> = {};
    const entry = (keyOf: string, make: () => AtlasTaxon) => {
      let i = taxonIndex.get(keyOf);
      if (i === undefined) {
        i = taxa.length;
        taxa.push(make());
        taxonIndex.set(keyOf, i);
      }
      return i;
    };
    // The total row count of each taxon in the stage.
    const rowsOf = new Map<number, number>();
    for (const here of atNode.values()) {
      for (const [t, e] of here) rowsOf.set(t, (rowsOf.get(t) ?? 0) + e.rows);
    }
    const climateSim = (a: ClimateNode, b: ClimateNode): number => {
      const ratio = Math.log(Math.max(a.aridity, 0.2) / Math.max(b.aridity, 0.2));
      return Math.exp(-(Math.abs(a.hot - b.hot) / 15 + Math.abs(a.cold - b.cold) / 20 + Math.abs(ratio) / 1.5));
    };
    for (const [patch, info] of patches.sort((a, b) => a[0] - b[0])) {
      const { k, lo: pLo, hi: pHi, coastal, clims } = info;
      const c = climateAt(nodeLat(k), nodeLon(k));
      const cls = c ? climateClass(c, rule) : null;
      const score = new Map<number, { s: number; km: number; older: number; younger: number; hOlder: number; hYounger: number }>();
      for (const { node, km } of reachOf.get(patch) ?? []) {
        if (km > p.region_km) continue;
        const sElev = graph.elev[node];
        const dElev = sElev < pLo ? pLo - sElev : sElev > pHi ? sElev - pHi : 0;
        if (km > 0 && dElev > maxElevDiff) continue;
        const oc = occClimate.get(node);
        let like = 1;
        if (clims.length && oc) {
          like = 0;
          for (const pc of clims) {
            const v = climateSim(pc, oc);
            if (v > like) like = v;
          }
          if (km > p.here_km && like < minClimateLike) continue;
        }
        const elevLike = elevScale > 0 ? Math.exp(-dElev / elevScale) : 1;
        const fall = Math.exp(-km / p.kernel_km);
        for (const [t, e] of atNode.get(node)!) {
          if (km > p.here_km && !coastal && known.get(t)!.strictlySea) continue;
          const isHere = km <= p.here_km && e.hOlder >= e.hYounger;
          const add = e.w * fall * like * elevLike;
          const q = score.get(t);
          if (q) {
            q.s += add;
            if (km < q.km) q.km = km;
            if (e.older > q.older) q.older = e.older;
            if (e.younger < q.younger) q.younger = e.younger;
            if (isHere) {
              if (e.hOlder > q.hOlder) q.hOlder = e.hOlder;
              if (e.hYounger < q.hYounger) q.hYounger = e.hYounger;
            }
          } else score.set(t, { s: add, km, older: e.older, younger: e.younger, hOlder: isHere ? e.hOlder : -Infinity, hYounger: isHere ? e.hYounger : Infinity });
        }
      }
      // Local direct evidence (`here`) ahead of regional inference (`region`), then heaviest first, up to each bucket's quota.
      // A taxon only receives `TIER.here` if local rows (`km <= here_km`, `share >= here_share`) cover the full in-stage span
      // emitted for this patch; when distant regional rows extend the span past what local rows attest, the entry is `TIER.region`.
      const byBucket = new Map<string, { t: number; s: number; km: number; here: boolean; olderR: number; youngerR: number }[]>();
      for (const [t, v] of score) {
        const end = endOf(t);
        const olderR = round(v.older, YEAR);
        const youngerR = round(Math.max(v.younger, end ?? -Infinity), YEAR);
        const hOlderR = round(v.hOlder, YEAR);
        const hYoungerR = round(Math.max(v.hYounger, end ?? -Infinity), YEAR);
        const here =
          v.hOlder >= v.hYounger &&
          Math.min(hOlderR, olderMa) >= Math.min(olderR, olderMa) - 1e-9 &&
          Math.max(hYoungerR, youngerMa) <= Math.max(youngerR, youngerMa) + 1e-9;
        const b = known.get(t)!.bucket;
        const l = byBucket.get(b);
        const item = { t, s: v.s, km: v.km, here, olderR, youngerR };
        if (l) l.push(item);
        else byBucket.set(b, [item]);
      }
      const flat: number[] = [];
      const far = Math.round(Math.min(65535, (nearest[k] === Infinity ? 20000 : nearest[k]) / 10));
      for (const bucket of Object.keys(p.quotas).sort()) {
        const list = (byBucket.get(bucket) ?? [])
          .sort((a, b) => (b.here ? 1 : 0) - (a.here ? 1 : 0) || b.s - a.s || a.t - b.t)
          .slice(0, p.quotas[bucket]);
        if (list.length) {
          const top = list.reduce((m, x) => (x.s > m ? x.s : m), 0) || 1;
          for (const { t, s: sc, km, here: isHere, olderR, youngerR } of list) {
            const i = entry(`t${t}|${olderR}|${youngerR}`, () => {
              const kn = known.get(t)!;
              const climate = climateOf.get(t);
              return { ...kn.taxon, rows: rowsOf.get(t) ?? 0, ...(climate ? { climate } : {}), span: [olderR, youngerR] };
            });
            flat.push(i, Math.min(255, Math.max(1, Math.round((sc / top) * 255))), isHere ? TIER.here : TIER.region, Math.round(Math.min(65535, km / 10)));
          }
          continue;
        }
        // Nothing of this kind within reach: the nearest kind of thing stands in, as its clade.
        const n = p.standins[bucket] ?? 0;
        if (!n) continue;
        const pool = worldwide.get(`${bucket}|${cls ?? 'any'}`) ?? worldwide.get(`${bucket}|any`);
        if (!pool) continue;
        // A stage with no fossils of a kind has nothing to draw for it, here or anywhere.
        const best = [...pool.values()].sort((a, b) => b.w - a.w || (a.node < b.node ? -1 : 1)).slice(0, n);
        const top = best.length ? best[0].w : 1;
        for (const b of best) {
          const example = exampleOf.get(b.node)!;
          const i = entry(`n${b.node}`, () => {
            // Drawn as the clade: its span is the stage's, as all that is known is that its kind was somewhere, up to the
            // clade's end where a record gives one. Strip any individual taxon's habit so a clade stand-in is generic.
            const { habit: _habit, ...base } = example.taxon;
            const label = example.taxon.form_label;
            return { ...base, label, no: b.nodeNo, id: b.node, rank: '', own: true, rows: 0, span: [round(olderMa, YEAR), round(Math.max(youngerMa, endOf(b.nodeNo) ?? -Infinity), YEAR)], standin: true };
          });
          flat.push(i, Math.max(1, Math.round((b.w / top) * 255)), TIER.standin, far);
        }
      }
      // An empty list is a land with no record of life on it: it still has a scene, of bare ground.
      nodes[String(patch)] = flat;
    }
    const file = `life/bins/${binIndex}.json`;
    const out: AtlasBin = { format: 'lightworld-atlas-bin@1', from: bin.from, to: bin.to, slice, name: bin.name, taxa, nodes };
    files.set(file, stableStringify(out));
    refs.push({ from: bin.from, to: bin.to, slice, name: bin.name, file, rows: rowsHere, nodes: Object.keys(nodes).length });
    if (binIndex % 20 === 0) log(`atlas   ${bin.name}: ${rowsHere} rows, ${atNode.size} places, ${taxa.length} taxa on ${Object.keys(nodes).length} lists`);
  });
  // The forms the lists use, whole.
  const forms: Record<string, Form> = {};
  for (const kn of known.values()) forms[kn.taxon.form] ??= known.forms.get(kn.taxon.form)!;
  files.set('life/forms.json', stableStringify(forms));
  files.set('life/where.json', stableStringify(where));
  const allRows = new Map<number, number>();
  for (const [, , t] of snap.rows) allRows.set(t, (allRows.get(t) ?? 0) + 1);
  let own = 0;
  let inherited = 0;
  let none = 0;
  let drawable = 0;
  const wanted = new Map<number, { no: number; name: string; rows: number; node: string | null }>();
  for (const t of snap.taxa) {
    const rows = allRows.get(t[0]) ?? 0;
    if (!rows) continue;
    const kn = known.get(t[0]);
    if (!kn) none++;
    else if (kn.taxon.own) own++;
    else inherited++;
    if (kn) drawable += rows;
    if (!kn?.taxon.own) wanted.set(t[0], { no: t[0], name: t[1], rows, node: kn?.node ?? null });
  }
  const totalRows = snap.rows.length;
  const index: AtlasIndex = {
    format: 'lightworld-atlas@1',
    title: field.title,
    description: field.description,
    source: dataset,
    sourceRecord: w.source.get(dataset) ? sourceRecord(w.source.get(dataset)!) : undefined,
    grid,
    here_km: p.here_km,
    region_km: p.region_km,
    forms: 'life/forms.json',
    where: 'life/where.json',
    generator: (() => {
      const gen = w.generators.find((g) => g.id === 'gen:life/scene')!;
      const { site: _site, ...rest } = gen.params as unknown as { site: unknown };
      return { id: gen.id, version: gen.version, params: rest as Record<string, unknown> };
    })(),
    bins: refs,
    coverage: { taxa: own + inherited + none, own_form: own, inherited_form: inherited, no_form: none, rows_drawable: drawable, rows_total: totalRows },
  };
  files.set('life/atlas.json', stableStringify(index));
  log(`atlas   ${refs.length} stages; of ${own + inherited + none} taxa with rows ${own} have their own form, ${inherited} inherit one and ${none} have none, which is ${Math.round((drawable / totalRows) * 100)}% of the rows drawable; ${Object.keys(forms).length} whole forms`);
  return { index, files, wanted: [...wanted.values()].sort((a, b) => b.rows - a.rows || a.no - b.no) };
}

/**
 * Where a body may be drawn in the sea, as its plan says outright: swimming, on the floor, anywhere, at the water's edge
 * (drawn on the floor, as a bivalve or a crab), or in the air above it. Never a body whose plan says nothing, nor a land
 * animal's, nor a plant's.
 */
const SEA_HABITATS = new Set(['water', 'floor', 'any', 'edge', 'air']);
/** An environment the database gives a taxon that is some water of the sea, as against land or fresh water alone. */
const SEA_WATERS = /marine|brackish|coastal|shelf|oceanic|lagoonal|hypersaline/;

/**
 * What the snapshot's taxa are, to the atlas: only those that can be drawn, because some node above them has a plan. For
 * the land's atlas, nothing the database calls marine that would have to swim; for the sea's (`sea`), only what can be
 * drawn in the sea.
 */
export function classify(w: World, snap: LandSnapshot, p: Pick<AtlasParams, 'big_m' | 'small_m' | 'tiny_m'>, mode: 'land' | 'sea' = 'land'): Map<number, Known> & { forms: Map<string, Form> } {
  const tree = new FormTree(w);
  const adopted = new Map<number, string>();
  for (const e of w.entities) {
    if (e.kind !== 'taxon') continue;
    const no = pbdbNumber(e);
    if (no !== undefined) adopted.set(no, e.id);
  }
  const byNo = new Map(snap.taxa.map((t) => [t[0], t]));
  const word = (n: number) => snap.words[n] || undefined;
  const out = new Map<number, Known>() as Map<number, Known> & { forms: Map<string, Form> };
  out.forms = new Map();
  const labelOf = (id: string) => {
    const e = w.entity.get(id);
    const name = e?.claims.find((c) => c.prop === 'name')?.value as { en?: string; la?: string } | undefined;
    return name?.en ?? name?.la ?? id;
  };
  const size = (id: string, prop: 'body_length' | 'hip_height' | 'plant_height' | 'body_mass', ownTaxon: boolean): AtlasSize | undefined => {
    const q = tree.size(id, prop);
    return q ? { lo: q.lo, hi: q.hi, from: labelOf(q.from), own: q.own && ownTaxon } : undefined;
  };
  const results = new Map<number, Known | null>();
  const resolve = (no: number): Known | null => {
    const known = results.get(no);
    if (known !== undefined) return known;
    const t = byNo.get(no);
    if (!t) {
      results.set(no, null);
      return null;
    }
    // Up the database's own tree to the first taxon a record adopts.
    let node: string | undefined;
    let nodeNo = no;
    for (let x = no, guard = 0; x && byNo.has(x) && guard < 200; x = byNo.get(x)![3], guard++) {
      const id = adopted.get(x);
      if (id) {
        node = id;
        nodeNo = x;
        break;
      }
    }
    const source = node ? tree.source(node) : undefined;
    const form = node ? tree.form(node) : undefined;
    if (!node || !source || !form) {
      results.set(no, null);
      return null;
    }
    // Something on land or in fresh water: this atlas holds no seas, whose genera have lists of their own (sea.ts).
    // Exclude taxa the database places exclusively in sea waters (unless flying or at the water's edge), and marine
    // swimming taxa whose habit carries a marine depth zone (such as marine dolphins and porpoises tagged "marine,freshwater").
    const env = word(t[9]);
    const habit = word(t[11]);
    const habitat = form.behave?.habitat;
    const strictlySea = !!env && SEA_WATERS.test(env) && !/terrestrial|freshwater/.test(env);
    const marineSwimmer = habitat === 'water' && !!env && /marine|oceanic/.test(env) && /depth=/.test(habit ?? '');
    // In the sea, a taxon the database says lived on land or in fresh water only is not drawn, whatever its body: a bear
    // whose bones lie in a marine bed does not walk on the sea's floor. One it says nothing of, or that flies, may be.
    const landOnly = !!env && !SEA_WATERS.test(env) && habitat !== 'air';
    if (mode === 'land' ? (strictlySea && habitat !== 'air' && habitat !== 'edge' && habitat !== 'wet') || marineSwimmer : form.kind !== 'animal' || !SEA_HABITATS.has(habitat ?? '') || landOnly) {
      results.set(no, null);
      return null;
    }
    const fromNode = source.from;
    const canon = canonicalForm(form);
    const text = stableStringify(canon);
    const key = sha256(text).slice(0, 16);
    out.forms.set(key, canon);
    const isNode = nodeNo === no;
    const length = form.kind === 'animal' ? size(node, 'body_length', isNode) : undefined;
    const height = form.kind === 'plant' ? size(node, 'plant_height', isNode) : undefined;
    const mass = form.kind === 'animal' ? size(node, 'body_mass', isNode) : undefined;
    const hip = form.kind === 'animal' ? size(node, 'hip_height', isNode) : undefined;
    // A size is inherited, never guessed: a kind with no size anywhere above it is not drawn.
    if (form.kind === 'animal' ? !length && !mass : !height && form.behave?.layer !== 'float') {
      results.set(no, null);
      return null;
    }
    const posture = tree.posture(node);
    const kn: Known = {
      no,
      node,
      nodeNo,
      // By its length, or what its mass says of it.
      bucket: bucketOf(form, length ? Math.sqrt(length.lo * length.hi) : mass ? Math.cbrt(Math.sqrt(mass.lo * mass.hi) / (form.mass_length ?? 20)) : undefined, p),
      ...(strictlySea ? { strictlySea: true } : {}),
      taxon: {
        no,
        ...(adopted.get(no) ? { id: adopted.get(no) } : {}),
        label: t[1],
        rank: word(t[2]) ?? '',
        form: key,
        form_from: fromNode,
        form_label: labelOf(fromNode),
        own: adopted.get(no) === fromNode,
        ...(length ? { length } : {}),
        ...(hip ? { hip } : {}),
        ...(height ? { height } : {}),
        ...(mass ? { mass } : {}),
        ...(posture ? { posture } : {}),
        ...(word(t[10]) ? { diet: word(t[10]) } : {}),
        ...(word(t[11]) ? { habit: word(t[11]) } : {}),
      },
    };
    results.set(no, kn);
    out.set(no, kn);
    return kn;
  };
  for (const t of snap.taxa) resolve(t[0]);
  return out;
}
