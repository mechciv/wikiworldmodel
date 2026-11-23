// A living scene's generators, off the main thread: the ground once, and then for each view which cells it
// needs and who to draw at what detail. They are the same code as the build's, so what they make agrees with it
// within the tolerance of core/fingerprint.ts.
import type { Fingerprint } from '../../../core/fingerprint.ts';
import type { SceneSpec } from '../../../core/scene.ts';
import { FAST_BUDGET, FULL_BUDGET, SceneStream, type Batch, type LifeView, type NamedGroup, type ProtoMesh } from '../../../world/generators/life/stream.ts';
import type { PlanForm, Settlement, SettlementPlan, WorkForm } from '../../../world/generators/people/settlement/v4.ts';

/** What a scene's people are, for its panel: the plan without its houses. */
export interface PeopleSummary {
  forms: PlanForm[];
  /** the kinds of piece its towns' works are drawn from, and how many pieces stand */
  works: WorkForm[];
  pieces: number;
  /** how many kinds of animal its people kept are drawn, and how many animals */
  kept: number;
  animals: number;
  /** how many paths run between its settlements */
  paths: number;
  settlements: { pattern: string; houses: number; people: number; city?: string; record?: string; from?: Settlement['from']; town?: Settlement['town']; husbandry?: string; tier: string; form: number; region: number; x: number; y: number; r: number; house?: [number, number, number] }[];
  houses: number;
  drawn: number;
  expected: number;
  perHouse: number;
  style: SettlementPlan['style'];
  lifeway: SettlementPlan['lifeway'];
}

/** How a field system's plots are drawn: their side in metres, how much longer than wide, and the shader's code for their kind. */
export function fieldStyle(s: SettlementPlan['style']): { plot: number; aspect: number; kind: number } {
  const KIND: Record<string, [number, number]> = { blocks: [0, 1.5], strips: [1, 6], irregular: [2, 1.2], terraces: [3, 4], paddies: [4, 1.3], basins: [5, 2], raised: [6, 3], swidden: [7, 1.2], gardens: [8, 1.2], none: [0, 1] };
  const [kind, aspect] = KIND[s.kind] ?? [0, 1.5];
  return { plot: Math.sqrt(s.plot * 10000), aspect, kind };
}

export type ToLifeWorker = { type: 'init'; spec: SceneSpec; fast: boolean } | { type: 'view'; view: LifeView; serial: number } | { type: 'reset' };

export type FromLifeWorker =
  | { type: 'ground'; levels: { nx: number; ny: number; x0: number; y0: number; cell: number; z: Int16Array; unit?: number; base?: number }[]; focus: [number, number]; toRiver: [number, number]; water: { vertices: Float32Array; indices: Uint32Array; flow: Float32Array }; waterLevel: number; mask: Uint8Array; maskSize: number; maskBox: [number, number, number, number]; print: Fingerprint; ms: number; people?: PeopleSummary; fields?: Uint8Array; paths?: { vertices: ArrayBuffer; indices: Uint32Array } }
  | { type: 'mask'; mask: Uint8Array; maskSize: number; maskBox: [number, number, number, number]; fields?: Uint8Array }
  | { type: 'selection'; serial: number; batches: Batch[]; protos: ProtoMesh[]; instances: number; triangles: number; pending: number; groups: NamedGroup[]; ms: number };

let stream: SceneStream | null = null;
const sent = new Set<number>();
const post = (m: FromLifeWorker, transfer: Transferable[]) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<ToLifeWorker>) => {
  const m = e.data;
  if (m.type === 'init') {
    const t0 = performance.now();
    stream = new SceneStream(m.spec, m.fast ? FAST_BUDGET : FULL_BUDGET);
    sent.clear();
    const print = stream.print();
    const { data, box } = stream.mask(512);
    const water = stream.water();
    const levels = stream.levels.map((l) => ({ nx: l.nx, ny: l.ny, x0: l.x0, y0: l.y0, cell: l.cell, z: (l.z as Int16Array).slice(), ...(l.unit !== undefined ? { unit: l.unit } : {}), ...(l.base !== undefined ? { base: l.base } : {}) }));
    const fields = stream.fields(512)?.data;
    const paths = stream.paths();
    const pl = stream.people;
    // A house of each settlement, the nearest its middle: where it stands and which way it faces, for a look at it.
    const houseOf = new Map<number, [number, number, number]>();
    const nearest = new Map<number, number>();
    for (const h of pl?.houses ?? []) {
      if (pl!.forms[h.form].outbuilding) continue;
      const s = pl!.settlements[h.settlement];
      const d = Math.hypot(h.x - s.x, h.y - s.y);
      if (d < (nearest.get(h.settlement) ?? Infinity)) {
        nearest.set(h.settlement, d);
        houseOf.set(h.settlement, [Math.round(h.x * 10) / 10, Math.round(h.y * 10) / 10, Math.round(h.face * 100) / 100]);
      }
    }
    const people: PeopleSummary | undefined = pl && {
      forms: pl.forms,
      works: pl.workForms,
      pieces: pl.works.length,
      kept: m.spec.people?.kept?.length ?? 0,
      animals: pl.animals.length,
      paths: pl.paths.length,
      settlements: pl.settlements.map((x, i) => ({ ...(houseOf.has(i) ? { house: houseOf.get(i)! } : {}), pattern: x.pattern, houses: x.houses, people: Math.round(x.people), ...(x.city ? { city: x.city } : {}), ...(x.record ? { record: x.record } : {}), ...(x.from ? { from: x.from } : {}), ...(x.town ? { town: x.town } : {}), ...(x.husbandry ? { husbandry: x.husbandry } : {}), tier: x.tier, form: x.form, region: x.region, x: Math.round(x.x), y: Math.round(x.y), r: Math.round(x.r) })),
      houses: pl.houses.length,
      drawn: pl.drawn,
      expected: pl.expected,
      perHouse: pl.perHouse,
      style: pl.style,
      lifeway: pl.lifeway,
    };
    post({ type: 'ground', levels, focus: stream.plan.focus, toRiver: stream.plan.toRiver, water, waterLevel: stream.look.water, mask: data, maskSize: 512, maskBox: box, print, ms: performance.now() - t0, ...(people ? { people } : {}), ...(fields ? { fields } : {}), ...(paths ? { paths } : {}) }, [data.buffer as ArrayBuffer, water.vertices.buffer as ArrayBuffer, water.indices.buffer as ArrayBuffer, water.flow.buffer as ArrayBuffer, ...levels.map((l) => l.z.buffer as ArrayBuffer), ...(fields ? [fields.buffer as ArrayBuffer] : []), ...(paths ? [paths.vertices, paths.indices.buffer as ArrayBuffer] : [])]);
    // A finer picture of the ground, once there is something to look at.
    setTimeout(() => {
      if (!stream) return;
      const size = m.fast ? 1024 : 2048;
      const fine = stream.mask(size);
      const fineFields = stream.fields(size)?.data;
      post({ type: 'mask', mask: fine.data, maskSize: size, maskBox: fine.box, ...(fineFields ? { fields: fineFields } : {}) }, [fine.data.buffer as ArrayBuffer, ...(fineFields ? [fineFields.buffer as ArrayBuffer] : [])]);
    }, 0);
    return;
  }
  if (m.type === 'reset') {
    sent.clear();
    return;
  }
  if (!stream) return;
  const t0 = performance.now();
  const s = stream.select(m.view, sent, () => performance.now() - t0 < 28);
  const buffers: ArrayBuffer[] = [...s.batches.flatMap((b) => (b.ways ? [b.data, b.ways] : [b.data])), ...s.protos.flatMap((p) => [p.vertices, p.indices.buffer as ArrayBuffer])];
  post({ type: 'selection', serial: m.serial, batches: s.batches, protos: s.protos, instances: s.instances, triangles: s.triangles, pending: s.pending, groups: s.groups, ms: performance.now() - t0 }, buffers);
};
