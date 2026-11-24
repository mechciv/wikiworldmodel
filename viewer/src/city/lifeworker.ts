// A living scene's generators, off the main thread: the ground once, and then for each view which cells it
// needs and who to draw at what detail. They are the same code as the build's, so what they make agrees with it
// within the tolerance of core/fingerprint.ts.
import type { Fingerprint } from '../../../core/fingerprint.ts';
import { groundNormals } from '../gl/groundNormals.ts';
import { encodeGround, GRIDS, placeLook, worldGround } from '../../../world/generators/life/scene/v14.ts';
import { plotStyle } from '../../../core/plots.ts';
import type { SceneSpec } from '../../../core/scene.ts';
import { FAST_BUDGET, FULL_BUDGET, SceneStream, type Batch, type LifeView, type NamedGroup, type ProtoMesh } from '../../../world/generators/life/stream.ts';
import type { PlanForm, Settlement, SettlementPlan, WorkForm } from '../../../world/generators/people/settlement/v9.ts';

/** What a scene's people are, for its panel: the plan without its houses. */
export interface PeopleSummary {
  forms: PlanForm[];
  /** the kinds of piece its towns' works are drawn from, and how many pieces stand */
  works: WorkForm[];
  pieces: number;
  /** continuous settlement perimeters (walls, enclosures, gatehouses) with their provenance */
  perimeters: { settlement: number; kind: string; height: number; thickness: number; gates: number; towers: boolean; moat?: number; label: string; from: string }[];
  /** how many kinds of animal its people kept are drawn, and how many animals */
  kept: number;
  animals: number;
  /** how many paths run between its settlements, and internal streets within them */
  paths: number;
  streets: number;
  /** whether its fields' crop is drawn as plants close by (world/generators/people/crops.ts) */
  crops: boolean;
  /** the resolved regional agricultural tradition (or generic fallback) and seasonal 8-slot palette */
  agriculture: SettlementPlan['agriculture'];
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
  return plotStyle(s);
}

export type ToLifeWorker = { type: 'init'; spec: SceneSpec; fast: boolean; preview: boolean } | { type: 'view'; view: LifeView; serial: number } | { type: 'reset' };

type GroundLevel = ReturnType<typeof encodeGround>;

export type FromLifeWorker =
  | { type: 'preview'; levels: GroundLevel[]; waterLevel: number }
  | {
      type: 'ground';
      levels: GroundLevel[];
      normals: Uint8Array<ArrayBuffer>[];
      focus: [number, number];
      toRiver: [number, number];
      water: { vertices: Float32Array; indices: Uint32Array; flow: Float32Array };
      waterLevel: number;
      mask: Uint8Array;
      maskSize: number;
      maskBox: [number, number, number, number];
      print: Fingerprint;
      ms: number;
      people?: PeopleSummary;
      fields?: Uint8Array;
      paths?: { vertices: ArrayBuffer; indices: Uint32Array };
      walls?: { vertices: ArrayBuffer; indices: Uint32Array };
      fieldworks?: { vertices: ArrayBuffer; indices: Uint32Array };
      smokes?: Float32Array;
    }
  | { type: 'mask'; mask: Uint8Array; maskSize: number; maskBox: [number, number, number, number]; fields?: Uint8Array }
  | { type: 'selection'; serial: number; batches: Batch[]; protos: ProtoMesh[]; instances: number; triangles: number; pending: number; groups: NamedGroup[]; ms: number };

let stream: SceneStream | null = null;
const sent = new Set<number>();
const post = (m: FromLifeWorker, transfer: Transferable[]) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<ToLifeWorker>) => {
  const m = e.data;
  if (m.type === 'init') {
    const t0 = performance.now();
    if (m.preview) {
      // Use the same relief field and extents as the finished grids. The carved channels, buildings and ground
      // cover follow with the plan. Keep this cheap enough to send before starting any of that work.
      const relief = worldGround(m.spec);
      const levels = [GRIDS.fine, GRIDS.mid, GRIDS.far].map(g => {
        const n = 65;
        const cell = g.cell * (g.nx - 1) / (n - 1);
        const z = new Float32Array(n * n);
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) z[j * n + i] = relief.at(g.x0 + i * cell, g.y0 + j * cell);
        }
        return encodeGround({ nx: n, ny: n, x0: g.x0, y0: g.y0, cell }, z);
      });
      post({ type: 'preview', levels, waterLevel: placeLook(m.spec).water }, levels.map(l => l.z.buffer as ArrayBuffer));
    }
    stream = new SceneStream(m.spec, m.fast ? FAST_BUDGET : FULL_BUDGET);
    sent.clear();
    const print = stream.print();
    const { data, box } = stream.mask(512);
    const water = stream.water();
    const levels = stream.levels.map((l) => ({ nx: l.nx, ny: l.ny, x0: l.x0, y0: l.y0, cell: l.cell, z: (l.z as Int16Array).slice(), ...(l.unit !== undefined ? { unit: l.unit } : {}), ...(l.base !== undefined ? { base: l.base } : {}) }));
    const normals = levels.map(g => groundNormals(g, g.z));
    const fields = stream.fields(512)?.data;
    const paths = stream.paths();
    const walls = stream.walls();
    const fieldworks = m.fast ? undefined : stream.fieldworks();
    const smokes = m.fast ? undefined : stream.smokes();
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
      perimeters: pl.perimeters.map((pr) => ({ settlement: pr.settlement, kind: pr.kind, height: pr.height, thickness: pr.thickness, gates: pr.gates.length, towers: !!pr.towers, ...(pr.moat ? { moat: pr.moat } : {}), label: pr.label, from: pr.from })),
      kept: m.spec.people?.kept?.length ?? 0,
      animals: pl.animals.length,
      paths: pl.paths.length,
      streets: pl.streets.length + pl.lanes.length,
      crops: !!stream.crops,
      agriculture: pl.agriculture,
      settlements: pl.settlements.map((x, i) => ({ ...(houseOf.has(i) ? { house: houseOf.get(i)! } : {}), pattern: x.pattern, houses: x.houses, people: Math.round(x.people), ...(x.city ? { city: x.city } : {}), ...(x.record ? { record: x.record } : {}), ...(x.from ? { from: x.from } : {}), ...(x.town ? { town: x.town } : {}), ...(x.husbandry ? { husbandry: x.husbandry } : {}), tier: x.tier, form: x.form, region: x.region, x: Math.round(x.x), y: Math.round(x.y), r: Math.round(x.r) })),
      houses: pl.houses.length,
      drawn: pl.drawn,
      expected: pl.expected,
      perHouse: pl.perHouse,
      style: pl.style,
      lifeway: pl.lifeway,
    };
    const transfer: Transferable[] = [
      data.buffer as ArrayBuffer,
      water.vertices.buffer as ArrayBuffer,
      water.indices.buffer as ArrayBuffer,
      water.flow.buffer as ArrayBuffer,
      ...levels.map((l) => l.z.buffer as ArrayBuffer),
      ...normals.map((n) => n.buffer),
      ...(fields ? [fields.buffer as ArrayBuffer] : []),
      ...(paths ? [paths.vertices, paths.indices.buffer as ArrayBuffer] : []),
      ...(walls ? [walls.vertices, walls.indices.buffer as ArrayBuffer] : []),
      ...(fieldworks ? [fieldworks.vertices, fieldworks.indices.buffer as ArrayBuffer] : []),
      ...(smokes ? [smokes.buffer as ArrayBuffer] : []),
    ];
    post(
      {
        type: 'ground',
        levels,
        normals,
        focus: stream.plan.focus,
        toRiver: stream.plan.toRiver,
        water,
        waterLevel: stream.look.water,
        mask: data,
        maskSize: 512,
        maskBox: box,
        print,
        ms: performance.now() - t0,
        ...(people ? { people } : {}),
        ...(fields ? { fields } : {}),
        ...(paths ? { paths } : {}),
        ...(walls ? { walls } : {}),
        ...(fieldworks ? { fieldworks } : {}),
        ...(smokes ? { smokes } : {}),
      },
      transfer,
    );
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
