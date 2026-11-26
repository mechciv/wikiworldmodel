// Dated political map in the local terrain's metres. Prepare nearby edges once per scene;
// containment uses the original geographic rings, including holes and antimeridian crossings.
import { toLocal } from '../../../core/city.ts';
import { insideRow, type PolityRow } from '../../../core/layers.ts';

export type BorderRow = PolityRow & { source?: string };
type Origin = { lat: number; lon: number };
export class LocalBorders {
  private nearby: BorderRow[] = [];
  segments: number[][] = [];

  constructor(origin: Origin, rows: BorderRow[]) {
    const reach = 400_000;
    const halfWorld = Math.PI * 6371000 * Math.cos((origin.lat * Math.PI) / 180);
    for (const row of rows) {
      let close = false;
      for (const ring of row.rings) {
        for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
          const a = toLocal(origin, ring[j + 1] / 100, ring[j] / 100);
          const b = toLocal(origin, ring[i + 1] / 100, ring[i] / 100);
          if (Math.abs(a[0] - b[0]) > halfWorld) continue;
          if (Math.min(a[0], b[0]) > reach || Math.max(a[0], b[0]) < -reach || Math.min(a[1], b[1]) > reach || Math.max(a[1], b[1]) < -reach)
            continue;
          close = true;
          this.segments.push([...a, ...b]);
        }
      }
      if (close || insideRow(row, origin.lon, origin.lat)) this.nearby.push(row);
    }
    this.nearby.sort((a, b) => a.area - b.area);
  }

  at(lon: number, lat: number): BorderRow | undefined {
    return this.nearby.find((row) => insideRow(row, lon, lat));
  }
}
