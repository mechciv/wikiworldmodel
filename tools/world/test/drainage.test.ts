// The drainage model's routing, on made-up continents of a 1° grid: every node of land reaches the sea, water is
// neither made nor lost, a hollow holds a lake that spills only when the climate fills it, and the rivers join up.
import { describe, expect, it } from 'vitest';
import { flow as flowOf, hollowsOf, latOf, lonOf, nearestNodes, outletChains, reaches, route, rowAreas, seaAt, wetMonthsAt, type NodeGrid, type Routing, type SlowWater } from '../src/build/drainage.ts';

const g: NodeGrid = { nx: 360, ny: 181, step: 1 };
const YEAR = 365.25 * 86400;

/** A continent 40° square: land rising north and away from a valley down its middle, which runs out to the sea in the south. */
function valley(): Float32Array {
  const z = new Float32Array(g.nx * g.ny).fill(-3000);
  for (let k = 0; k < z.length; k++) {
    const lat = latOf(g, k);
    const lon = lonOf(g, k);
    if (Math.abs(lat) <= 20 && Math.abs(lon) <= 20) z[k] = 50 + 20 * (lat + 20) + 30 * Math.abs(lon);
  }
  return z;
}

/** A plateau with a crater in its middle: the crater drains to nowhere but itself. */
function crater(): Float32Array {
  const z = new Float32Array(g.nx * g.ny).fill(-3000);
  for (let k = 0; k < z.length; k++) {
    const lat = latOf(g, k);
    const lon = lonOf(g, k);
    if (Math.abs(lat) > 20 || Math.abs(lon) > 20) continue;
    const d = Math.sqrt(lat * lat + lon * lon);
    z[k] = d < 6 ? 100 + d * 60 : 500 + (20 - Math.max(Math.abs(lat), Math.abs(lon))) * 5;
  }
  return z;
}

const oceanOf = (z: Float32Array) => Uint8Array.from(z, (v) => (v < 0 ? 1 : 0));
const flow = (z: Float32Array, grid: NodeGrid, r: Routing, runoff: Float32Array, loss: Float32Array, sea?: Uint8Array) => flowOf(z, grid, r, hollowsOf(z, grid, r), runoff, loss, sea);

/** What leaves the land for the sea, m³/s. */
function toSea(r: ReturnType<typeof route>, q: Float32Array): number {
  let s = 0;
  for (const k of r.order) if (r.down[k] >= 0 && r.sea[r.down[k]]) s += q[k];
  return s;
}

describe('the drainage model', () => {
  it('routes every node of land to the sea, each after the node it drains to', () => {
    const z = valley();
    const r = route(z, g, seaAt(z, g, oceanOf(z), 0));
    const rank = new Int32Array(z.length).fill(-1);
    r.order.forEach((k, i) => (rank[k] = i));
    let land = 0;
    for (let k = 0; k < z.length; k++) if (z[k] >= 0) land++;
    expect(r.order.length).toBe(land);
    for (const k of r.order) {
      const d = r.down[k];
      expect(d).toBeGreaterThanOrEqual(0);
      if (!r.sea[d]) expect(rank[d]).toBeLessThan(rank[k]);
    }
  });

  it('neither makes nor loses water where nothing evaporates', () => {
    const z = valley();
    const r = route(z, g, seaAt(z, g, oceanOf(z), 0));
    const runoff = new Float32Array(z.length).fill(250);
    const f = flow(z, g, r, runoff, new Float32Array(z.length));
    const areas = rowAreas(g);
    let made = 0;
    for (const k of r.order) made += (0.25 * areas[Math.floor(k / g.nx)]) / YEAR;
    expect(toSea(r, f.q) / made).toBeCloseTo(1, 6);
  });

  it('holds a lake in a hollow that evaporates what comes in, and spills it when the climate is wet', () => {
    const z = crater();
    const r = route(z, g, seaAt(z, g, oceanOf(z), 0));
    const runoff = new Float32Array(z.length).fill(100);
    const dry = flow(z, g, r, runoff, new Float32Array(z.length).fill(2000));
    const wet = flow(z, g, r, runoff, new Float32Array(z.length).fill(0));
    const lakeOf = (f: typeof dry) => f.lakes.reduce((a, b) => (b.km2 > a.km2 ? b : a));
    const d = lakeOf(dry);
    const w = lakeOf(wet);
    expect(d.spills).toBe(false);
    expect(d.outflow).toBe(0);
    // It covers about a twentieth of the crater: 100 mm in, 2000 mm out.
    expect(d.km2 / w.km2).toBeGreaterThan(0.02);
    expect(d.km2 / w.km2).toBeLessThan(0.12);
    expect(d.level).toBeLessThan(w.level);
    expect(w.spills).toBe(true);
    expect(w.outflow).toBeCloseTo(w.inflow, 6);
    // What the dry crater keeps never reaches the sea.
    expect(toSea(r, dry.q)).toBeCloseTo(toSea(r, wet.q) - w.inflow, 3);
  });

  it('keeps a hollow under the sea level dry where the sea cannot reach it', () => {
    const z = crater();
    const ocean = oceanOf(z);
    for (let k = 0; k < z.length; k++) if (z[k] >= 0 && z[k] < 200) z[k] -= 300;
    const sea = seaAt(z, g, ocean, 0);
    const middle = 90 * g.nx + 180;
    expect(z[middle]).toBeLessThan(0);
    expect(sea[middle]).toBe(0);
    const r = route(z, g, sea);
    expect(r.order).toContain(middle);
  });

  it('joins its reaches: each ends where the next begins, and the trunk outranks what feeds it', () => {
    const z = valley();
    const r = route(z, g, seaAt(z, g, oceanOf(z), 0));
    const f = flow(z, g, r, new Float32Array(z.length).fill(300), new Float32Array(z.length));
    const rs = reaches(r, f, 30000);
    const byId = new Map(rs.map((x) => [x.id, x]));
    expect(rs.length).toBeGreaterThan(3);
    for (const x of rs) {
      expect(['river', 'sea']).toContain(x.ends);
      if (x.ends !== 'river') continue;
      const next = byId.get(x.into!)!;
      expect(next.nodes[0]).toBe(x.nodes[x.nodes.length - 1]);
      expect(next.order).toBeGreaterThanOrEqual(x.order);
      expect(next.km2).toBeGreaterThan(x.km2);
    }
    const mouth = rs.filter((x) => x.ends === 'sea').reduce((a, b) => (b.km2 > a.km2 ? b : a));
    expect(lonOf(g, mouth.nodes[mouth.nodes.length - 2])).toBe(0);
    expect(mouth.order).toBe(Math.max(...rs.map((x) => x.order)));
  });

  // Each month's runoff of the soil's surplus at every node, in steps of 0.1 mm, on the routed grid itself.
  const slowWater = (n: number, mm: (m: number, k: number) => number): SlowWater => {
    const slow = new Uint16Array(n * 12);
    for (let m = 0; m < 12; m++) for (let k = 0; k < n; k++) slow[m * n + k] = Math.round(mm(m, k) / 0.1);
    return { slow, step: 0.1, nodes: n, near: nearestNodes({ lon0: -180, lat0: 90, step: 1, nx: 360, ny: 181 }, g) };
  };

  it("keeps a river's bed wet in the months its basin's soil lets water go, and dry in the rest", () => {
    const z = valley();
    const r = route(z, g, seaAt(z, g, oceanOf(z), 0));
    const h = hollowsOf(z, g, r);
    // 120 mm a year runs off everywhere: 10 mm a month on the year's mean.
    const f = flowOf(z, g, r, h, new Float32Array(z.length).fill(120), new Float32Array(z.length));
    const mouth = reaches(r, f, 30000)
      .filter((x) => x.ends === 'sea')
      .reduce((a, b) => (b.km2 > a.km2 ? b : a));
    const end = mouth.nodes[mouth.nodes.length - 2];
    const chains = outletChains(h, z.length);
    // Slow water of 6 mm a month from January to June, more than 0.15 of the mean; nothing from July on.
    const halfYear = slowWater(z.length, (m) => (m < 6 ? 6 : 0));
    expect(wetMonthsAt(g, r, f, h, chains, halfYear, 0.15, [end])[0]).toBe(0b111111);
    // A millimetre a month is a tenth of the mean: the rest of the year's water came in floods, and the bed is dry.
    const thin = slowWater(z.length, () => 1);
    expect(wetMonthsAt(g, r, f, h, chains, thin, 0.15, [end])[0]).toBe(0);
    // The slow water of a wet upland reaches the plain below it: the river's months are its basin's, not its mouth's.
    const upland = slowWater(z.length, (_, k) => (latOf(g, k) > 0 ? 8 : 0));
    expect(wetMonthsAt(g, r, f, h, chains, upland, 0.15, [end])[0]).toBe(0xfff);
    // A river that carries nothing holds nothing.
    const none = flowOf(z, g, r, h, new Float32Array(z.length), new Float32Array(z.length));
    expect(wetMonthsAt(g, r, none, h, chains, upland, 0.15, [end])[0]).toBe(0);
    // A basin that gives its river 120 mm a year runs it all year where that is wet enough to, and not where it is not.
    expect(wetMonthsAt(g, r, f, h, chains, halfYear, 0.15, [end], 100)[0]).toBe(0xfff);
    expect(wetMonthsAt(g, r, f, h, chains, halfYear, 0.15, [end], 150)[0]).toBe(0b111111);
  });

  it('carries no slow water out of a lake that keeps all it gets, and all of it out of one that spills', () => {
    const z = crater();
    const r = route(z, g, seaAt(z, g, oceanOf(z), 0));
    const h = hollowsOf(z, g, r);
    const inside = (k: number) => Math.hypot(latOf(g, k), lonOf(g, k)) < 6;
    // Only the crater's own ground gives slow water, 6 mm a month of its 100 a year: what reaches its pass is the crater's.
    const fromCrater = slowWater(z.length, (_, k) => (inside(k) ? 6 : 0));
    // Where the crater's hollow spills: the node at its pass, outside it.
    const hollow = h.of[90 * g.nx + 180];
    expect(hollow).toBeGreaterThanOrEqual(0);
    const outlet = h.outlet[hollow];
    expect(outlet).toBeGreaterThanOrEqual(0);
    const runoff = new Float32Array(z.length).fill(100);
    const dry = flowOf(z, g, r, h, runoff, new Float32Array(z.length).fill(2000));
    const wet = flowOf(z, g, r, h, runoff, new Float32Array(z.length));
    expect(wetMonthsAt(g, r, dry, h, outletChains(h, z.length), fromCrater, 0.15, [outlet])[0]).toBe(0);
    expect(wetMonthsAt(g, r, wet, h, outletChains(h, z.length), fromCrater, 0.15, [outlet])[0]).toBe(0xfff);
  });
});
