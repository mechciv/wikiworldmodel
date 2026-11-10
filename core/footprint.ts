// A measured individual print. Coordinates in its local view run from the heel to the toes.
// Depth is deliberately absent unless a future source supplies its surface.
export interface Footprint {
  specimen: string;
  side: 'left' | 'right';
  length_mm: number;
  width_mm: number;
  heel_width_mm: number;
  heel_drag_approx_mm?: number;
  toes?: 'indistinct-with-projecting-hallux';
}

export function isFootprint(value: unknown): value is Footprint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Partial<Footprint>;
  const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
  return typeof v.specimen === 'string' && !!v.specimen.trim() && (v.side === 'left' || v.side === 'right') &&
    positive(v.length_mm) && positive(v.width_mm) && positive(v.heel_width_mm) && v.heel_width_mm <= v.width_mm &&
    (v.heel_drag_approx_mm === undefined || positive(v.heel_drag_approx_mm)) &&
    (v.toes === undefined || v.toes === 'indistinct-with-projecting-hallux');
}

export function footprintText(f: Footprint): string {
  const dimensions = `${f.specimen}, ${f.side} foot. Length ${f.length_mm} mm, maximum width ${f.width_mm} mm, heel width ${f.heel_width_mm} mm.`;
  const drag = f.heel_drag_approx_mm ? ` Heel drag about ${f.heel_drag_approx_mm} mm.` : '';
  return dimensions + drag + (f.toes ? ' The big toe projects beyond the indistinct smaller toes.' : '');
}
