import { describe, expect, it } from 'vitest';
import { FABRIC_MODEL, fabricOf, unitSlots, type Units } from './fabric.ts';

/** A number in [0, 1) for a name, as a generator's hash gives one. */
const rand = (name: string) => {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

describe("a settlement's fabric", () => {
  it('is compact where its town form says nothing, or says so', () => {
    expect(fabricOf({ density: 28 })).toEqual({ fabric: 'compact', why: 'unsaid' });
    expect(fabricOf({ fabric: 'compact', density: 28 })).toEqual({ fabric: 'compact', why: 'said' });
  });

  it("makes a dispersed town of its tradition's settlements, as far apart as its density leaves room for", () => {
    // Angkor's: a hundred households of five, 25 to 38 m apart, at 28 people to the hectare.
    const u = fabricOf({ fabric: 'dispersed', houses: 100, spacing: { lo: 25, hi: 38 }, household: 5, density: 28 }) as Units;
    expect(u.fabric).toBe('dispersed');
    // Each unit takes the ground its five hundred people need: about 18 ha.
    expect(u.area).toBeCloseTo((500 / 28) * 1e4, 0);
    // Its houses take a little over half of it, and the rest is open between the units.
    expect(u.built).toBeCloseTo((100 * 31.5 * 31.5) / u.area, 6);
    expect(u.open).toBeGreaterThan(0.4);
    expect(u.open).toBeLessThan(0.5);
    // On a lattice of triangles, each unit's share of the ground about it is its area.
    expect(((u.apart * u.apart * Math.sqrt(3)) / 2)).toBeCloseTo(u.area, 3);
  });

  it('draws a dispersed town as a compact one where its density leaves no ground between its units', () => {
    expect(fabricOf({ fabric: 'dispersed', houses: 100, spacing: 30, household: 5, density: 300 })).toEqual({ fabric: 'compact', why: 'crowded' });
  });

  it("takes the model's own unit where its tradition gives none", () => {
    const u = fabricOf({ fabric: 'dispersed', density: 10 }) as Units;
    expect(u.houses).toBe(FABRIC_MODEL.houses);
    expect(u.spacing).toBe(FABRIC_MODEL.spacing);
    expect(u.household).toBe(FABRIC_MODEL.household);
  });

  it('puts its units in the same places every time, as many as its ground holds', () => {
    const u = fabricOf({ fabric: 'dispersed', houses: 100, spacing: 30, household: 5, density: 28 }) as Units;
    const a = unitSlots('people/x', 3000, u, rand);
    const b = unitSlots('people/x', 3000, u, rand);
    expect(a).toEqual(b);
    // A square 6 km on a side holds about its area over a unit's.
    const want = (6000 * 6000) / u.area;
    expect(a.length / want).toBeGreaterThan(0.85);
    expect(a.length / want).toBeLessThan(1.15);
    // No two units nearer than the lattice moved them allows.
    let least = Infinity;
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) least = Math.min(least, Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y));
    expect(least).toBeGreaterThan(u.apart * 0.5);
    // Another town's are elsewhere.
    expect(unitSlots('people/y', 3000, u, rand)[0]).not.toEqual(a[0]);
  });
});
