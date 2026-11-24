import { describe, expect, it } from 'vitest';
import { areaFor, builtAt, builtSpans, cutAt, densityAt, GROWTH_DEFAULTS, growSettlement, type GrowthGround, type GrowthInput } from './growth.ts';

/** Level ground with a river running north to south at x = 300, 40 m wide, 2 m below the bank. */
const valley: GrowthGround = {
  height: (x) => (Math.abs(x - 300) < 20 ? -2 : 5),
  above: (x) => (Math.abs(x - 300) < 20 ? -2 : 5 + Math.min(0, (Math.abs(x - 300) - 60) / 10)),
};
const flat: GrowthGround = { height: () => 10, above: () => 10 };

const base = (over: Partial<GrowthInput> = {}): GrowthInput => ({
  cores: [{ x: 0, y: 0 }],
  routes: [],
  walls: [],
  ground: flat,
  people: [{ t: [-500, 0, 500], people: [2000, 20000, 4000] }],
  span: [-500, 600],
  cell: 20,
  ...over,
});

/** The built area, in hectares, by counting cells. */
const builtHa = (g: ReturnType<typeof growSettlement>, t: number, member = 0) => {
  let n = 0;
  const { x0, y0, cell, nx, ny } = g.grid;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (builtAt(g, x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell, t, member)) n++;
  return (n * cell * cell) / 1e4;
};

describe('the growth of a settlement', () => {
  it('builds as much ground as its people needed, as they rise and fall', () => {
    const g = growSettlement(base());
    for (const t of [-500, -250, 0, 250, 500]) {
      const people = [-500, 0, 500].includes(t) ? { '-500': 2000, '0': 20000, '500': 4000 }[String(t)]! : undefined;
      const want = people !== undefined ? areaFor(people, g.at10k, g.params.density) : (cutAt(g, t) * 400) / 1e4;
      expect(Math.abs(builtHa(g, t) - want)).toBeLessThanOrEqual(0.04 + 1e-9);
    }
    expect(builtHa(g, 0)).toBeGreaterThan(builtHa(g, -250));
    expect(builtHa(g, 500)).toBeLessThan(builtHa(g, 0));
    expect(builtHa(g, -600)).toBe(0);
  });

  it('leaves first the ground it built last', () => {
    const g = growSettlement(base());
    const spansAt = (x: number, y: number) => builtSpans(g, x, y);
    const core = spansAt(10, 10);
    const edge = spansAt(240, 0);
    expect(core.length).toBe(1);
    expect(edge.length).toBe(1);
    // The core's years hold the edge's.
    expect(core[0][0]).toBeLessThanOrEqual(edge[0][0]);
    expect(core[0][1]).toBeGreaterThanOrEqual(edge[0][1]);
    // The spans agree with the cut at their ends.
    const [a, b] = edge[0];
    expect(builtAt(g, 240, 0, a + 1)).toBe(true);
    expect(builtAt(g, 240, 0, b - 1)).toBe(true);
    expect(builtAt(g, 240, 0, a - 1)).toBe(false);
    expect(builtAt(g, 240, 0, b + 1)).toBe(false);
  });

  it('never builds in the water, and builds the low bank after higher ground as near', () => {
    const g = growSettlement(base({ ground: valley, people: [{ t: [0], people: [60000] }], span: [0, 100] }));
    const e = g.epochs[0];
    const cell = (x: number, y: number) => Math.floor((y - g.grid.y0) / g.grid.cell) * g.grid.nx + Math.floor((x - g.grid.x0) / g.grid.cell);
    expect(e.rank[cell(300, 0)]).toBe(-1);
    // 250 m out on the low bank by the river, against 250 m out the other way on dry ground.
    expect(e.rank[cell(250, 0)]).toBeGreaterThan(e.rank[cell(-250, 0)]);
  });

  it('builds along its roads before the ground between them', () => {
    const g = growSettlement(base({ routes: [[0, 0, 2000, 0]] }));
    const r = g.epochs[0].rank;
    const cell = (x: number, y: number) => Math.floor((y - g.grid.y0) / g.grid.cell) * g.grid.nx + Math.floor((x - g.grid.x0) / g.grid.cell);
    expect(r[cell(400, 0)]).toBeLessThan(r[cell(0, 400)]);
  });

  it('ranks the ground inside its walls first while they stand, and makes the ranking again when they fall', () => {
    const ring = [-150, -150, 150, -150, 150, 150, -150, 150];
    const g = growSettlement(base({ walls: [{ ring, from: -300, to: 300 }], routes: [[-1500, 0, 1500, 0]] }));
    expect(g.epochs.map((e) => [e.from, e.to])).toEqual([[-500, -300], [-300, 300], [300, 600]]);
    const cell = (x: number, y: number) => Math.floor((y - g.grid.y0) / g.grid.cell) * g.grid.nx + Math.floor((x - g.grid.x0) / g.grid.cell);
    const walled = g.epochs[1].rank;
    // Inside, at a corner 184 m out, against outside the north wall 170 m out: nearer as the crow flies.
    expect(walled[cell(130, 130)]).toBeLessThan(walled[cell(0, 170)]);
    const open = g.epochs[2].rank;
    expect(open[cell(130, 130)]).toBeGreaterThan(open[cell(0, 170)]);
  });

  it('cuts the same ranking at another place for each member of the people', () => {
    const g = growSettlement(base({ people: [{ t: [0], people: [20000] }, { t: [0], people: [40000] }], span: [0, 100] }));
    expect(builtHa(g, 50, 1)).toBeGreaterThan(builtHa(g, 50, 0));
    // Every cell the smaller member builds, the larger builds too: one ranking, two cuts.
    const { x0, y0, cell, nx, ny } = g.grid;
    for (let j = 0; j < ny; j += 3)
      for (let i = 0; i < nx; i += 3) {
        const x = x0 + (i + 0.5) * cell;
        const y = y0 + (j + 0.5) * cell;
        if (builtAt(g, x, y, 50, 0)) expect(builtAt(g, x, y, 50, 1)).toBe(true);
      }
  });

  it('meets the area a record gives at its time', () => {
    const g = growSettlement(base({ areas: [{ t: 0, ha: 300 }] }));
    expect(Math.abs(builtHa(g, 0) - 300)).toBeLessThan(0.5);
    expect(g.at10k).not.toBe(GROWTH_DEFAULTS.density.at10k);
  });

  it('is denser where it was built first, and as dense as its people over all', () => {
    const g = growSettlement(base());
    expect(densityAt(g, 10, 10, 0)).toBeGreaterThan(densityAt(g, 200, 40, 0));
    let people = 0;
    const { x0, y0, cell, nx, ny } = g.grid;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) people += (densityAt(g, x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell, 0) * cell * cell) / 1e4;
    expect(Math.abs(people - 20000) / 20000).toBeLessThan(0.02);
  });

  it('ranks the same ground the same way every time', () => {
    const a = growSettlement(base({ ground: valley, routes: [[0, 0, 900, 300]] }));
    const b = growSettlement(base({ ground: valley, routes: [[0, 0, 900, 300]] }));
    expect([...a.epochs[0].order]).toEqual([...b.epochs[0].order]);
  });
});
