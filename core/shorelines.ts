// A dated reconstruction of lake water. The globe and the ground read the same area row.
// The bin stays out of the scene download until its date and bounding box are in reach.
import type { LayerRow } from './fieldlayers.ts';
import type { SceneLake } from './scene.ts';

export interface MappedShore {
  field: string;
  file: string;
  row: string;
  span: [number, number];
  box: [number, number, number, number];
  /** Approximate surface from the relief, in metres on its own datum. */
  level: number;
}

const METRES_PER_DEGREE = 6371000 * Math.PI / 180;

export function shoresNear(shores: MappedShore[], t: number, at: { lat: number; lon: number }, reach: number): MappedShore[] {
  const dy = reach / METRES_PER_DEGREE;
  const dx = dy / Math.max(0.001, Math.cos(at.lat * Math.PI / 180));
  return shores.filter(({ span, box }) => t >= span[0] && t < span[1] && at.lat >= box[1] - dy && at.lat <= box[3] + dy &&
    [at.lon, at.lon - 360, at.lon + 360].some(lon => lon >= box[0] - dx && lon <= box[2] + dx));
}

export function mappedLake(shore: MappedShore, row: LayerRow, at: { lat: number; lon: number }, isoline: number): SceneLake {
  const east = METRES_PER_DEGREE * Math.cos(at.lat * Math.PI / 180);
  const rings = row.lines!.map(ring => ring.map((coord, i) => i % 2
    ? (coord / 100 - at.lat) * METRES_PER_DEGREE
    : (((coord / 100 - at.lon + 540) % 360) - 180) * east));
  return { key: shore.row, field: shore.field, level: shore.level - isoline, rings };
}
