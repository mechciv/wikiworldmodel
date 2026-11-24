// Fields of points, lines and areas over the globe, all made the same way (docs/STRUCTURE.md section 3.6). A field
// with a `kind` of points, lines or areas, a `rows:` mapping and a `layer:` style is read as a table, corrected by
// its overlays, and written as time-binned files of rows ready to draw: each with its address, its time, its place or
// its lines, its group and what the panel says of it. How it looks is the style's, read by one renderer in the viewer.
import { byValue, type LayerBin, type LayerInfo, type LayerRow, type LayerStyle } from '../../../../core/fieldlayers.ts';
import type { MappedShore } from '../../../../core/shorelines.ts';
import { rowRef } from '../../../../core/refs.ts';
import { parsePoint, parseTime, type TimePointInput } from '../../../../core/time.ts';
import type { ClaimIndex } from '../claimindex.ts';
import { correctRows, GEOMETRY, rawRows, rowKey, toValue } from '../tables.ts';
import { stableStringify } from '../util.ts';
import type { Field, World } from '../world.ts';
import { fromWorldMercator, thin } from './layers.ts';
import { sourceRecord } from './records.ts';

/** How many rows a file holds at most: a time loads the files that cover it. */
export const BIN_ROWS = 4000;

/** A row's geometry as flat lines of hundredths of a degree: a line's points, or an area's rings. */
export function geometryLines(geometry: unknown, crs: LayerStyle['crs'], tolerance = 0): number[][] {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g?.type) return [];
  // Lines keep their compact integer encoding. An area can contain an island or channel narrower
  // than that grid, so keep its fractional hundredths until any thinning requested by the field.
  const area = g.type === 'Polygon' || g.type === 'MultiPolygon';
  const hundredths = (degree: number) => area ? degree * 100 : Math.round(degree * 100);
  const lists: number[][][] =
    g.type === 'LineString' ? [g.coordinates as number[][]] : g.type === 'MultiLineString' || g.type === 'Polygon' ? (g.coordinates as number[][][]) : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][]).flat() : [];
  const out: number[][] = [];
  for (const l of lists) {
    const flat: number[] = [];
    for (const p of l) {
      const [lat, lon] = crs === 'world-mercator' ? fromWorldMercator(p[0], p[1]) : [p[1], p[0]];
      const x = hundredths(lon);
      const y = hundredths(lat);
      if (flat.length >= 2 && flat[flat.length - 2] === x && flat[flat.length - 1] === y) continue;
      flat.push(x, y);
    }
    const thinned = tolerance > 0 ? thin(flat, tolerance * 100) : flat;
    // A small island still separates land from water even if all its vertices fit within the tolerance.
    const kept = area && thinned.length < 8 ? flat : thinned;
    if (kept.length >= 4 && !(kept.length === 4 && kept[0] === kept[2] && kept[1] === kept[3])) out.push(kept);
  }
  return out;
}

/** A claim's time value on the world's axis: a year, an age, or the ends of a range. */
function timeOf(v: unknown, end: 'lo' | 'hi'): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parsePoint(v as TimePointInput).t;
  const t = parseTime(v as never) as { kind: string; lo?: number; hi?: number };
  return t[end];
}

/** A field's rows, ready to draw, and the groups they fall in. */
export function layerRows(f: Field, raw: Record<string, unknown>[], keys: string[], changed: Map<number, string[]>): { rows: LayerRow[]; groups: string[] } {
  const spec = f.rows!;
  const style = f.layer!;
  const dataset = f.data!.from;
  const span: [number, number] = [parsePoint(f.time!.lo as TimePointInput).t, parsePoint(f.time!.hi as TimePointInput).t];
  // A group's name is its own row's, where the style says which column names it.
  const names = new Map<string, string>();
  if (style.group?.name) for (const r of raw) names.set(String(r[style.group.name.key] ?? ''), String(r[style.group.name.column] ?? ''));
  const groupNames = new Set<string>();
  const made: (LayerRow & { groupName?: string })[] = [];
  raw.forEach((columns, i) => {
    if (style.where && Object.entries(style.where).some(([c, v]) => String(columns[c] ?? '') !== v)) return;
    const value = (prop: string) => (spec.claims[prop] ? toValue(spec.claims[prop], columns) : undefined);
    const label = (value('name') as { en?: string } | undefined)?.en;
    const from = timeOf(value('start') ?? value('date'), 'lo') ?? span[0];
    const to = timeOf(value('end'), 'hi') ?? (value('date') !== undefined ? from + 1 : span[1]);
    const row: LayerRow & { groupName?: string } = { row: rowRef(dataset, keys[i]), from, to, says: [] };
    if (f.kind === 'points') {
      const p = value('location') as { lat: number; lon: number } | undefined;
      if (!p) return;
      row.at = [Math.round(p.lon * 1000) / 1000, Math.round(p.lat * 1000) / 1000];
    } else {
      const lines = geometryLines(columns[GEOMETRY], style.crs, style.thin ?? 0);
      if (!lines.length) return;
      row.lines = lines;
    }
    if (label) row.label = label;
    if (style.group) {
      const g = String(columns[style.group.column] ?? '');
      const name = g ? (names.get(g) || g) : label;
      if (name) {
        row.groupName = name;
        groupNames.add(name);
        row.says.push(g ? `${style.group.word}: ${name}` : `${style.group.word}: none larger in the dataset`);
      }
    }
    if (style.key_label) row.says.push(`${style.key_label} ${keys[i]}`);
    if (style.width !== undefined && typeof style.width !== 'number') row.w = byValue(style.width, columns, 1);
    if (style.opacity !== undefined && typeof style.opacity !== 'number') row.o = byValue(style.opacity, columns, 1);
    const fix = changed.get(i);
    if (fix) row.corrected = fix;
    made.push(row);
  });
  const groups = [...groupNames].sort();
  const index = new Map(groups.map((g, i) => [g, i]));
  const rows = made.map(({ groupName, ...r }) => (groupName !== undefined ? { ...r, group: index.get(groupName) } : r));
  rows.sort((a, b) => a.from - b.from || (a.row < b.row ? -1 : 1));
  return { rows, groups };
}

/** Every field of points, lines or areas the world draws over the globe, with the files of its rows. */
export async function fieldLayers(world: World, claims: ClaimIndex): Promise<{ infos: LayerInfo[]; files: Map<string, string> }> {
  const infos: LayerInfo[] = [];
  const files = new Map<string, string>();
  for (const f of world.fields) {
    if (!f.layer || !f.rows || !f.data || !['points', 'lines', 'areas'].includes(f.kind ?? '')) continue;
    const raw = await rawRows(world, f);
    if (!raw) continue;
    const fixed = correctRows(f.rows, raw, claims.corrections(f.data.from));
    const { rows, groups } = layerRows(f, fixed.rows, fixed.keys.length ? fixed.keys : raw.map((c, i) => rowKey(f.rows!.key, c, i)), fixed.changed);
    const slug = f.id.replace(/^field:/, '').replace(/[^a-z0-9]+/g, '-');
    const bins: LayerInfo['bins'] = [];
    for (let i = 0; i < rows.length; i += BIN_ROWS) {
      const part = rows.slice(i, i + BIN_ROWS);
      const file = `layers/${slug}/${bins.length}.json`;
      files.set(file, stableStringify({ format: 'lightworld-layer-bin@1', field: f.id, rows: part } satisfies LayerBin));
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of part) {
        if (r.from < lo) lo = r.from;
        if (r.to > hi) hi = r.to;
      }
      bins.push({ from: lo, to: hi, file, rows: part.length });
    }
    const s = world.source.get(f.data.from);
    infos.push({
      field: f.id,
      title: f.title,
      description: f.description,
      kind: f.kind!,
      style: f.layer,
      source: f.data.from,
      sourceRecord: s ? sourceRecord(s) : undefined,
      span: [parsePoint(f.time!.lo as TimePointInput).t, parsePoint(f.time!.hi as TimePointInput).t],
      groups,
      bins,
    });
  }
  return { infos, files };
}

/** The dated water rows a scene can use, referring back to the globe's files. */
export function mappedShores(world: World, layers: Awaited<ReturnType<typeof fieldLayers>>, lakesField: string, height: (lat: number, lon: number) => number) {
  const shores: MappedShore[] = [];
  const rows = new Map<string, LayerRow>();
  const fields = new Set(world.fields.filter(f => f.refines === lakesField && f.kind === 'areas').map(f => f.id));
  for (const info of layers.infos.filter(layer => fields.has(layer.field))) {
    for (const bin of info.bins) {
      const part: LayerBin = JSON.parse(layers.files.get(bin.file)!);
      for (const row of part.rows) {
        const box: MappedShore['box'] = [Infinity, Infinity, -Infinity, -Infinity];
        const heights: number[] = [];
        for (const ring of row.lines ?? []) {
          for (let i = 0; i + 3 < ring.length; i += 2) {
            const lon = ring[i] / 100, lat = ring[i + 1] / 100;
            box[0] = Math.min(box[0], lon);
            box[1] = Math.min(box[1], lat);
            box[2] = Math.max(box[2], lon);
            box[3] = Math.max(box[3], lat);
            heights.push(height(lat, lon));
          }
        }
        if (!heights.length) continue;
        heights.sort((a, b) => a - b);
        const middle = Math.floor(heights.length / 2);
        const level = (heights[middle] + heights[Math.floor((heights.length - 1) / 2)]) / 2;
        shores.push({ field: info.field, file: bin.file, row: row.row, span: [row.from, row.to], box, level });
        rows.set(row.row, row);
      }
    }
  }
  return { shores, rows };
}
