// A sheet of a house: a dwelling as the settlement generator draws it, from before and behind, from the front, the
// side and above, in several of its shapes and at each detail, with a scale in metres. It is how whoever writes a
// building tradition, or changes how houses are drawn, checks the result by looking at it, as a form's sheet is for a
// body (formsheet.ts). The colours are only enough to tell the materials apart: the renderer's are its own.
import type { DwellingSpec } from '../../../core/dwelling.ts';
import { Mesh } from '../../../world/generators/city/kit.ts';
import { drawDwelling, houseSize, HOUSE_VARIANTS, type Homestead, type HouseDetail } from '../../../world/generators/people/dwellings.ts';
import { drawWork, WORK_VARIANTS, workTop, type WorkSpec } from '../../../world/generators/people/works.ts';
import { Canvas, FRONT, panel, png, SIDE, text, TOP, type View } from './formsheet.ts';

/** A view from above and to one side: `az` round from the front towards the house's left, `el` above the level, in degrees. */
function oblique(title: string, az: number, el: number): View {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  const se = Math.sin(e);
  const ce = Math.cos(e);
  return {
    title,
    project: (x, y, z) => [-x * ca + y * sa, z * ce - (x * sa + y * ca) * se, -(x * sa * ce + y * ca * ce + z * se)],
    light: [0.35, 0.5, 0.79],
  };
}

const BEFORE = oblique('BEFORE', 32, 22);
const BEHIND = oblique('BEHIND', 212, 26);

/**
 * The sheet of a dwelling, as a PNG. `label` heads it, and `grow` draws it as wide and long as where it stands for
 * several households. With `home`, each house is drawn with its yard: what encloses it and what stands in it.
 */
export function dwellingSheet(spec: DwellingSpec, label: string, grow = 1, home?: Homestead): Buffer {
  const W = 1320;
  const H = 880;
  const cv = new Canvas(W, H);
  const size = houseSize(spec, 0, grow);
  text(cv, `${label}: ${size.w.toFixed(1)} M ACROSS ITS FRONT, ${size.l.toFixed(1)} M BACK, ${size.top.toFixed(1)} M HIGH`.slice(0, 104), 16, 12, 2);
  const mesh = (variant: number, detail: HouseDetail): Mesh => {
    const m = new Mesh(8192);
    drawDwelling(m, spec, detail, variant, grow, home);
    return m;
  };
  const fit = home ? Math.max(size.w + 9, size.l + 10) : Math.max(size.w, size.l, size.top) * 1.25;
  const pw = 330;
  const ph = 276;
  const tris = (m: Mesh) => m.count / 3;
  const panels: { m: Mesh; v: View; t: string }[] = [
    { m: mesh(0, 0), v: BEFORE, t: 'FROM BEFORE IT, CLOSE' },
    { m: mesh(0, 0), v: BEHIND, t: 'FROM BEHIND' },
    { m: mesh(0, 0), v: FRONT, t: 'FRONT' },
    { m: mesh(0, 0), v: SIDE, t: 'SIDE' },
    { m: mesh(0, 0), v: TOP, t: 'ABOVE' },
    ...Array.from({ length: Math.min(5, HOUSE_VARIANTS - 1) }, (_, i) => ({ m: mesh(i + 1, 0), v: BEFORE, t: `ANOTHER OF ITS SHAPES (${i + 1})` })),
    { m: mesh(0, 1), v: BEFORE, t: 'FROM A WAY OFF' },
    { m: mesh(0, 2), v: BEFORE, t: 'FAR OFF' },
  ];
  panels.forEach((p, i) => panel(cv, p.m, p.v, 8 + (i % 4) * pw, 44 + Math.floor(i / 4) * ph, pw - 4, ph - 4, `${p.t}, ${tris(p.m)} TRIS`, fit));
  return png(cv.rgb, W, H);
}

/** Many dwellings on one page, each from before it, close: twelve to a page, for looking over all the traditions at once. */
export function contactSheet(items: { spec: DwellingSpec; label: string; variant?: number; home?: Homestead }[], title: string): Buffer {
  const W = 1320;
  const H = 880;
  const cv = new Canvas(W, H);
  text(cv, title.slice(0, 104), 16, 12, 2);
  const pw = 330;
  const ph = 276;
  items.slice(0, 12).forEach((it, i) => {
    const size = houseSize(it.spec, it.variant ?? 0);
    const m = new Mesh(8192);
    drawDwelling(m, it.spec, 0, it.variant ?? 0, 1, it.home);
    panel(cv, m, BEFORE, 8 + (i % 4) * pw, 44 + Math.floor(i / 4) * ph, pw - 4, ph - 4, it.label.slice(0, 50), it.home ? Math.max(size.w + 9, size.l + 10) : Math.max(size.w, size.l, size.top) * 1.2);
  });
  return png(cv.rgb, W, H);
}

/** The sheet of one kind of piece of a settlement's works: each of its shapes close by, then from a way off and far off. */
export function workSheet(spec: WorkSpec, label: string): Buffer {
  const W = 1320;
  const H = 880;
  const cv = new Canvas(W, H);
  text(cv, label.slice(0, 104), 16, 12, 2);
  const mesh = (variant: number, detail: HouseDetail): Mesh => {
    const m = new Mesh(4096);
    drawWork(m, spec, detail, variant);
    return m;
  };
  const fit = Math.max(workTop(spec), spec.kind === 'enclosure' ? (spec.run ?? 8) : spec.thickness) * 1.2;
  const pw = 330;
  const ph = 276;
  const panels: { m: Mesh; v: View; t: string }[] = [
    ...Array.from({ length: WORK_VARIANTS }, (_, i) => ({ m: mesh(i, 0), v: BEFORE, t: `SHAPE ${i}` })),
    { m: mesh(0, 0), v: FRONT, t: 'FRONT' },
    { m: mesh(0, 0), v: SIDE, t: 'SIDE' },
    { m: mesh(0, 1), v: BEFORE, t: 'FROM A WAY OFF' },
    { m: mesh(0, 2), v: BEFORE, t: 'FAR OFF' },
  ];
  panels.forEach((p, i) => panel(cv, p.m, p.v, 8 + (i % 4) * pw, 44 + Math.floor(i / 4) * ph, pw - 4, ph - 4, `${p.t}, ${p.m.count / 3} TRIS`, fit));
  return png(cv.rgb, W, H);
}
