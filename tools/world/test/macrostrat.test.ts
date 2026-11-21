// Macrostrat's columns and units, as a snapshot: how the service's answers are read, what is refused, what a row says,
// how an overlay corrects one, and how the columns' footprints become a grid of column numbers.
import { describe, expect, it } from 'vitest';
import { columnCells, inOutline } from '../src/build/strata.ts';
import { columnsFrom, readBack, refLine, unitRows, type ColumnsAnswers, type RawFootprint, type RawUnit } from '../src/macrostrat.ts';
import { correctUnits, type RowsSpec } from '../src/tables.ts';

const QUERY = { meta: 'meta', columns: 'columns', units: 'units', lithologies: 'lithologies', attributes: 'attributes', environments: 'environments', refs: 'refs', projects: 'projects' };

/** A square footprint, a degree across, with its south-west corner at a place. */
const square = (west: number, south: number, size = 1): number[][][] => [[[west, south], [west + size, south], [west + size, south + size], [west, south + size], [west, south]]];
const footprint = (col_id: number, col_name: string, west: number, south: number, more: Partial<RawFootprint['properties']> = {}, size = 1): RawFootprint => ({
  geometry: { type: 'Polygon', coordinates: square(west, south, size) },
  properties: { col_id, col_name, col_group: 'A basin', lat: String(south + size / 2), lng: String(west + size / 2), col_area: String(12000 * size * size), project_id: 1, col_type: 'column', status_code: 'active', refs: [1], ...more },
});
const unit = (unit_id: number, col_id: number, b_age: number, t_age: number, more: Partial<RawUnit> = {}): RawUnit => ({
  unit_id,
  section_id: 1,
  col_id,
  unit_name: `Unit ${unit_id} Fm`,
  strat_name_long: `Unit ${unit_id} Formation`,
  t_age,
  b_age,
  t_int_name: 'Albian',
  t_prop: 0.5,
  b_int_name: 'Aptian',
  b_prop: 0.25,
  max_thick: 60,
  min_thick: 0,
  outcrop: 'surface',
  notes: '',
  refs: [1],
  lith: [{ lith_id: 10, prop: 0.75, atts: ['red', 'fine'] }, { lith_id: 8, prop: 0.25, atts: [] }],
  environ: [{ environ_id: 57 }],
  ...more,
});
const answers = (more: Partial<ColumnsAnswers> = {}): ColumnsAnswers => ({
  meta: { license: 'All data are licensed under Creative Commons BY 4.0 International', citation: 'Peters, S.E. et al. Macrostrat', version: '2.6.0' },
  licenses: ['CC-BY 4.0', 'CC-BY 4.0'],
  // Out of order, as a service may send them.
  footprints: [footprint(7, 'JacareÃ­ Sub-basin', -46, -24, { project_id: 8, refs: [29] }), footprint(2, 'Madison Co, Alabama', -87, 34)],
  units: [unit(30, 7, 20, 10, { unit_name: 'SÃ£o Paulo Fm', strat_name_long: '', refs: [29], lith: [{ lith_id: 8, prop: 1 }], environ: [] }), unit(2, 2, 330.65, 323.4, { max_thick: '152.00', min_thick: null }), unit(1, 2, 323.4, 322.3)],
  lithologies: [
    { lith_id: 10, name: 'sandstone', type: 'siliciclastic', group: 'sandstones', class: 'sedimentary' },
    { lith_id: 8, name: 'shale', type: 'siliciclastic', group: 'mudrocks', class: 'sedimentary' },
    { lith_id: 53, name: 'granite', type: 'plutonic', group: 'felsic', class: 'igneous' },
  ],
  attributes: [{ lith_att_id: 1, name: 'red', type: 'color' }],
  environments: [{ environ_id: 57, name: 'fluvial-deltaic indet.', type: 'fluvial', class: 'non-marine' }],
  refs: [
    { ref_id: 1, pub_year: 1985, author: 'Childs, O.E.', ref: 'Correlation of stratigraphic units of North America; COSUNA. AAPG Bulletin 69:173-180.', doi: null, url: null },
    { ref_id: 29, pub_year: 2007, author: 'Milani, E.J, A.B. FranÃ§a, R. L. Schneider', ref: 'Bacia do ParanÃ¡', doi: null, url: 'http://example.org/parana' },
    { ref_id: 99, pub_year: 2001, author: 'Nobody', ref: 'A map no column names', doi: '10.1/x', url: null },
  ],
  projects: [
    { project_id: 8, project: 'South America', descrip: 'Composite column dataset for South America.' },
    { project_id: 1, project: 'North America', descrip: 'Composite column dataset for the USA and Canada.' },
    { project_id: 3, project: 'eODP', descrip: 'Not among the columns.' },
  ],
  ...more,
});
const snapshot = (more: Partial<ColumnsAnswers> = {}) => columnsFrom('2026-11-21', QUERY, answers(more));

describe('a word the service sends', () => {
  it('is read back where its accents were encoded twice, and kept as it is where they were not', () => {
    expect(readBack('SÃ£o Paulo')).toBe('São Paulo');
    expect(readBack('Bacia do ParanÃ¡')).toBe('Bacia do Paraná');
    // Whole already: an é alone is no UTF-8, so nothing is read back.
    expect(readBack('Neuquén Basin')).toBe('Neuquén Basin');
    expect(readBack('Collón Cura')).toBe('Collón Cura');
    expect(readBack('Pottsville Fm')).toBe('Pottsville Fm');
    // A character no byte holds cannot have been one.
    expect(readBack('Žliobaitė Ã©')).toBe('Žliobaitė Ã©');
    expect(readBack('')).toBe('');
  });
});

describe('a snapshot of the columns', () => {
  it('keeps every column and unit the service gives, in the order of their numbers', () => {
    const s = snapshot();
    expect(s.format).toBe('lightworld-macrostrat-columns@1');
    expect(s.license).toBe('CC-BY 4.0');
    expect(s.meta.version).toBe('2.6.0');
    expect(s.query).toEqual(QUERY);
    expect(s.columns.map((c) => c[0])).toEqual([2, 7]);
    expect(s.units.map((u) => u[0])).toEqual([1, 2, 30]);
    const w = (k: number) => s.words[k];
    // A column: its name, group and project, its point and its area as numbers, its references and its footprint.
    const [col, name, group, project, lat, lng, area, refs, outline] = s.columns[0];
    expect([col, w(name), w(group), project, lat, lng, area, refs]).toEqual([2, 'Madison Co, Alabama', 'A basin', 1, 34.5, -86.5, 12000, [1]]);
    expect(outline).toEqual([[[-87, 34, -86, 34, -86, 35, -87, 35, -87, 34]]]);
    // A unit: its ages the older first, its thickness as numbers, its lithologies with their shares and attributes.
    const u = s.units[1];
    expect([u[0], u[1], w(u[3]), w(u[4]), u[5], u[6], w(u[7]), u[8], w(u[9]), u[10], u[11], u[12], w(u[13])]).toEqual([2, 2, 'Unit 2 Fm', 'Unit 2 Formation', 330.65, 323.4, 'Aptian', 0.25, 'Albian', 0.5, 152, 0, 'surface']);
    expect(u[16].map(([l, share, ...atts]) => [l, share, ...atts.map(w)])).toEqual([[10, 0.75, 'red', 'fine'], [8, 0.25]]);
    expect(u[17]).toEqual([57]);
    // The same answers make the same snapshot, whatever order they came in.
    const turned = answers();
    turned.footprints.reverse();
    turned.units.reverse();
    expect(JSON.stringify(columnsFrom('2026-11-21', QUERY, turned))).toBe(JSON.stringify(s));
  });

  it('keeps the references the columns and units name, and the projects that have a column', () => {
    const s = snapshot();
    expect(s.refs.map((r) => r[0])).toEqual([1, 29]);
    expect(refLine(s, s.refs[0])).toBe('Childs, O.E., 1985, Correlation of stratigraphic units of North America; COSUNA. AAPG Bulletin 69:173-180.');
    // Its accents read back, a full stop put after a title that has none, and where it can be found.
    expect(refLine(s, s.refs[1])).toBe('Milani, E.J, A.B. França, R. L. Schneider, 2007, Bacia do Paraná. http://example.org/parana');
    expect(s.projects.map((p) => [p[0], s.words[p[1]]])).toEqual([[1, 'North America'], [8, 'South America']]);
    // The vocabularies are kept whole: a lithology no unit names is still what the service's vocabulary had.
    expect(s.lithologies.map((l) => [l[0], s.words[l[1]], s.words[l[2]], s.words[l[3]], s.words[l[4]]])).toEqual([
      [8, 'shale', 'siliciclastic', 'mudrocks', 'sedimentary'],
      [10, 'sandstone', 'siliciclastic', 'sandstones', 'sedimentary'],
      [53, 'granite', 'plutonic', 'felsic', 'igneous'],
    ]);
    expect(s.environments.map((e) => [e[0], s.words[e[1]], s.words[e[3]]])).toEqual([[57, 'fluvial-deltaic indet.', 'non-marine']]);
  });

  it('reads back names sent with their accents encoded twice', () => {
    const s = snapshot();
    expect(s.words).toContain('Jacareí Sub-basin');
    expect(s.words).toContain('São Paulo Fm');
    expect(s.words.some((x) => /Ã/.test(x))).toBe(false);
  });

  it('refuses an answer it cannot read whole', () => {
    expect(() => snapshot({ licenses: ['CC-BY 4.0', 'CC BY-NC 4.0'] })).toThrow(/licence/);
    expect(() => snapshot({ licenses: [undefined, undefined] })).toThrow(/licence/);
    expect(() => snapshot({ units: [unit(1, 99, 10, 5)] })).toThrow(/column 99/);
    expect(() => snapshot({ units: [unit(1, 2, 5, 10)] })).toThrow(/from 5 to 10/);
    expect(() => snapshot({ units: [unit(1, 2, 10, 5, { lith: [{ lith_id: 777, prop: 1 }] })] })).toThrow(/lithology 777/);
    expect(() => snapshot({ units: [unit(1, 2, 10, 5, { environ: [{ environ_id: 4 }] })] })).toThrow(/environment 4/);
    expect(() => snapshot({ units: [unit(1, 2, 10, 5, { refs: [5] })] })).toThrow(/reference 5/);
    expect(() => snapshot({ units: [unit(1, 2, 10, 5), unit(1, 2, 20, 10)] })).toThrow(/twice/);
    expect(() => snapshot({ footprints: [footprint(2, 'A', 0, 0, { status_code: 'in process' })], units: [] })).toThrow(/active/);
    expect(() => snapshot({ footprints: [{ ...footprint(2, 'A', 0, 0), geometry: null }], units: [] })).toThrow(/footprint/);
    expect(() => snapshot({ footprints: [footprint(2, 'A', 0, 0, { project_id: 44 })], units: [] })).toThrow(/project 44/);
  });

  it('says what a unit says as a row: its ages, its lithologies in the service\'s words, and its column\'s place', () => {
    const rows = unitRows(snapshot());
    expect(rows.map((r) => r.unit)).toEqual([1, 2, 30]);
    expect(rows[0]).toMatchObject({ unit: 1, column: 2, column_name: 'Madison Co, Alabama', name: 'Unit 1 Fm', full_name: 'Unit 1 Formation', label: 'Unit 1 Formation', older_ma: 323.4, younger_ma: 322.3, older_interval: 'Aptian', younger_interval: 'Albian', outcrop: 'surface', lithologies: 'sandstone (red, fine) 0.75; shale 0.25', environments: 'fluvial-deltaic indet.', lat: 34.5, lng: -86.5 });
    expect(rows[0].reference).toBe('Childs, O.E., 1985, Correlation of stratigraphic units of North America; COSUNA. AAPG Bulletin 69:173-180.');
    // With no name in full it goes by its short name, and with no environment it gives none.
    expect(rows[2]).toMatchObject({ label: 'São Paulo Fm', full_name: '', lithologies: 'shale 1', environments: '' });
  });
});

const spec: RowsSpec = {
  kind: 'rock-unit',
  key: 'unit:{unit}',
  claims: {
    name: { column: 'label', as: 'text' },
    start: { column: 'older_ma', as: 'ma' },
    end: { column: 'younger_ma', as: 'ma' },
    lithology: { column: 'lithologies' },
    location: { column: ['lat', 'lng'], as: 'point' },
  },
};

describe('an overlay on a unit', () => {
  it('corrects its name and its ages, and leaves the rest of the snapshot as it was', () => {
    const s = snapshot();
    expect(correctUnits(s, spec, new Map())).toEqual({ snap: s, unapplied: [] });
    const { snap: fixed, unapplied } = correctUnits(s, spec, new Map([['unit:2', [{ prop: 'start', value: '331 Ma' }, { prop: 'name', value: { en: 'Bangor Limestone' } }]]]));
    expect(unapplied).toEqual([]);
    const row = unitRows(fixed)[1];
    expect(row).toMatchObject({ unit: 2, older_ma: 331, younger_ma: 323.4, label: 'Bangor Limestone', full_name: 'Bangor Limestone', name: 'Unit 2 Fm' });
    expect(unitRows(fixed)[0]).toEqual(unitRows(s)[0]);
    expect(s.units[1][5]).toBe(330.65);
  });

  it('says what it could not write into a unit, and does not end one before it began', () => {
    const s = snapshot();
    const lith = correctUnits(s, spec, new Map([['unit:1', [{ prop: 'lithology', value: 'limestone 1' }]]]));
    expect(lith.unapplied).toEqual(["unit:1: a corrected lithology cannot be written into a unit's row"]);
    expect(unitRows(lith.snap)[0]).toEqual(unitRows(s)[0]);
    const place = correctUnits(s, spec, new Map([['unit:1', [{ prop: 'location', value: { lat: 1, lon: 2 } }]]]));
    expect(place.unapplied).toHaveLength(2);
    const backwards = correctUnits(s, spec, new Map([['unit:1', [{ prop: 'end', value: '400 Ma' }]]]));
    expect(backwards.unapplied).toEqual(['unit:1: corrected, it would run from 323.4 to 400 Ma']);
    expect(unitRows(backwards.snap)[0].younger_ma).toBe(322.3);
  });
});

describe('the grid of column numbers', () => {
  it('tells whether a place is inside a footprint, with its holes left out', () => {
    const ring = (w: number, s: number, size: number) => [w, s, w + size, s, w + size, s + size, w, s + size, w, s];
    const holed = [[ring(0, 0, 10), ring(4, 4, 2)], [ring(20, 0, 2)]];
    expect(inOutline(holed, 1, 1)).toBe(true);
    expect(inOutline(holed, 5, 5)).toBe(false);
    expect(inOutline(holed, 21, 1)).toBe(true);
    expect(inOutline(holed, 15, 1)).toBe(false);
    expect(inOutline(holed, -1, 1)).toBe(false);
  });

  it('gives each cell the column whose footprint holds its middle, the smaller where two overlap', () => {
    // Cells of half a degree. A column over 10–12° E, 0–2° N; a small one inside it; and one a cell wide far off.
    const s = snapshot({
      footprints: [footprint(2, 'Wide', 10, 0, {}, 2), footprint(5, 'Small', 10.5, 0.5, {}, 0.5), footprint(9, 'Far', -120, 40, {}, 0.5)],
      units: [],
    });
    const { nx, ny, cells, lost } = columnCells(s.columns, 0.5);
    expect([nx, ny]).toEqual([720, 360]);
    expect(lost).toEqual([]);
    const at = (lat: number, lng: number) => cells[Math.floor((90 - lat) / 0.5) * nx + Math.floor((lng + 180) / 0.5)];
    // Numbered by their places in the snapshot's list, from 1: Wide 1, Small 2, Far 3.
    expect(at(1.75, 11.75)).toBe(1);
    expect(at(0.25, 10.25)).toBe(1);
    expect(at(0.75, 10.75)).toBe(2);
    expect(at(40.25, -119.75)).toBe(3);
    expect(at(2.25, 11)).toBe(0);
    expect(at(-10, 11)).toBe(0);
    // Sixteen cells in the wide one, one of them the small one's; and one far off.
    expect(cells.reduce((n, c) => n + (c === 1 ? 1 : 0), 0)).toBe(15);
    expect(cells.reduce((n, c) => n + (c ? 1 : 0), 0)).toBe(17);
  });

  it('gives a column too small for a cell the one its own point lies in, where that leaves the other a cell', () => {
    // On a grid of 2°, a footprint a tenth of a degree across holds no cell's middle.
    const tiny = footprint(5, 'Tiny', 10.2, 0.2, {}, 0.1);
    const alone = columnCells(snapshot({ footprints: [tiny], units: [] }).columns, 2);
    expect(alone.lost).toEqual([]);
    expect(alone.cells.reduce((n, c) => n + (c ? 1 : 0), 0)).toBe(1);
    expect(alone.cells[Math.floor((90 - 0.25) / 2) * alone.nx + Math.floor((10.25 + 180) / 2)]).toBe(1);
    // Inside a column of four cells it takes the one it lies in.
    const within = columnCells(snapshot({ footprints: [footprint(2, 'Wide', 8, -2, {}, 4), tiny], units: [] }).columns, 2);
    expect(within.lost).toEqual([]);
    expect(within.cells.reduce((n, c) => n + (c === 1 ? 1 : 0), 0)).toBe(3);
    expect(within.cells.reduce((n, c) => n + (c === 2 ? 1 : 0), 0)).toBe(1);
    // Two of them in the one cell of a column that has no other: neither takes it.
    const crowded = columnCells(snapshot({ footprints: [footprint(2, 'One cell', 10, 0, {}, 2), tiny], units: [] }).columns, 2);
    expect(crowded.lost).toEqual([5]);
    expect(crowded.cells.reduce((n, c) => n + (c === 1 ? 1 : 0), 0)).toBe(1);
  });
});
