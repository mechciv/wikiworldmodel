// A schematic impression constrained by the three measured spans. The fractional stations,
// outline between them, and relative relief are drawing choices. No depth was measured here.
import type { Footprint } from '../../../../core/footprint.ts';

/** Cross-section through the print at distance y (mm) from the heel, giving the centre and half-width in mm. */
export function footprintSection(f: Footprint, y: number): [number, number] {
  const t = y / f.length_mm;
  if (t <= 0 || t >= 1) return [0, 0];
  const heel = f.heel_width_mm / 2;
  const ball = f.width_mm / 2;
  const stations = [[0, 0, 0], [.16, 0, heel], [.40, .20 * ball, .74 * heel],
    [.68, 0, ball], [.82, -.05 * ball, .95 * ball],
    ...(f.toes ? [[.90, -.14 * ball, .78 * ball], [.95, -.47 * ball, .39 * ball]] : []), [1, -.51 * ball, 0]];
  let i = 1;
  while (stations[i][0] < t) i++;
  const [t0, x0, r0] = stations[i - 1];
  const [t1, x1, r1] = stations[i];
  const p = (t - t0) / (t1 - t0);
  const smooth = p * p * (3 - 2 * p);
  // Rounded heel and toe ends meet their adjoining cross-sections tangentially.
  const radius = i === 1 ? heel * Math.sqrt(p * (2 - p)) : i === stations.length - 1 ? r0 * Math.sqrt(1 - p * p) : r0 + (r1 - r0) * smooth;
  return [(f.side === 'left' ? -1 : 1) * (x0 + (x1 - x0) * smooth), radius];
}

/** Unitless indentation within a measured cross-section. Surface slopes between measurements are illustrative. */
export function footprintDepth(along: number, across: number, groupedToes = false): number {
  if (along <= 0 || along >= 1 || Math.abs(across) >= 1) return 0;
  const edge = (1 - across * across) ** 1.45;
  const heel = Math.exp(-((along - .16) ** 2) / .018);
  const forefoot = Math.exp(-((along - .77) ** 2) / .036);
  const instep = .5 + .5 * across;
  const end = Math.min(1, along / .075, (1 - along) / .065);
  const ballAndHeel = .12 + .76 * heel + .85 * forefoot + .25 * instep;
  // The narrow raised band separates the ball from the undifferentiated toe impression.
  const ridge = groupedToes ? .68 * Math.exp(-((along - (.805 + .04 * across)) ** 2) / .00045) : 0;
  const hallux = groupedToes ? .42 * Math.exp(-((along - .945) ** 2) / .0013 - (across + .18) ** 2 / .47) : 0;
  return edge * end * Math.max(0, ballAndHeel - ridge + hallux);
}
