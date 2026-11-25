import { describe, expect, it } from 'vitest';
import { cityPopulation, densityAnchor, densityPrior, dispersedAt, holdOut, leaveOneOut, PEOPLE_MODEL, type Figure } from './citypop.ts';
import { peopleAt } from './growth.ts';

const list = (pops: [number, number][], source = 'src:list-a', hold = 50) => ({ source, pops, hold });
const fig = (f: Partial<Figure> & Pick<Figure, 'v'>): Figure => ({ prop: 'population', ground: 'settlement', source: 'src:work', ...f });

describe("a settlement's people through time", () => {
  it('reads a list between its figures at a constant rate, and stands only while the list holds it', () => {
    const p = cityPopulation({ lists: [list([[0, 10000], [100, 40000]])] });
    expect(p.span).toEqual([-50, 150]);
    // A city with one source is read through its figures exactly: its error is all its source's bias.
    expect(peopleAt(p.members[0], 50) / 20000).toBeCloseTo(1, 4);
    expect(peopleAt(p.members[0], 100) / 40000).toBeCloseTo(1, 4);
  });

  it("carries a list's doubt as members 1.6 times higher and lower at its figures, by default", () => {
    const p = cityPopulation({ lists: [list([[0, 10000]])] });
    expect(p.members.length).toBe(3);
    const band = Math.exp(PEOPLE_MODEL.band * PEOPLE_MODEL.bias.list);
    expect(band).toBeCloseTo(1.6, 2);
    expect(peopleAt(p.members[1], 0) / peopleAt(p.members[0], 0)).toBeCloseTo(band, 3);
    expect(peopleAt(p.members[0], 0) / peopleAt(p.members[2], 0)).toBeCloseTo(band, 3);
  });

  it("passes over a list's figure near a record's preferred one, and reads it elsewhere", () => {
    const p = cityPopulation({ lists: [list([[0, 10000], [200, 30000]])], figures: [fig({ t: [10, 10], v: 15000, preferred: true, claim: 'people/cities/x#population' })], span: [-300, 1e9] });
    // Near the record's own figure, shaded a little towards the list's, since each source may be high or low.
    expect(peopleAt(p.members[0], 10) / 15000).toBeGreaterThan(0.97);
    expect(peopleAt(p.members[0], 10) / 15000).toBeLessThan(1.1);
    const passed = p.observations.find((o) => o.list && o.t?.[0] === 0)!;
    expect(passed.use).toBe('passed');
    expect(passed.by).toBe('people/cities/x#population');
    expect(p.observations.find((o) => o.list && o.t?.[0] === 200)!.use).toBe('used');
    expect(peopleAt(p.members[0], 200) / 30000).toBeGreaterThan(0.9);
    expect(peopleAt(p.members[0], 200) / 30000).toBeLessThan(1.03);
  });

  it('rises from a founding size at the record’s start, and holds its last figure where the record runs on', () => {
    const p = cityPopulation({ figures: [fig({ t: [0, 0], v: 50000 })], span: [-700, 1e9] });
    expect(p.span[0]).toBe(-700);
    expect(peopleAt(p.members[0], -700)).toBeCloseTo(1000, 0);
    expect(peopleAt(p.members[0], -350)).toBeGreaterThan(1000);
    expect(peopleAt(p.members[0], 0)).toBeCloseTo(50000, -1);
    expect(peopleAt(p.members[0], 1500)).toBeCloseTo(50000, -1);
  });

  it('reads a figure that gives no time over the whole span, never as a point at the founding', () => {
    const p = cityPopulation({ figures: [fig({ v: 10000 })], span: [1100, 1500] });
    const o = p.observations[0];
    expect(o.use).toBe('used');
    expect(o.at).toEqual([1100, 1500]);
    // It says the people were about so many all through those years: from the founding on, with no ramp to them.
    expect(peopleAt(p.members[0], 1300)).toBeCloseTo(10000, -1);
    expect(peopleAt(p.members[0], 1100)).toBeCloseTo(10000, -1);
    // Its doubt is wider than a figure for a moment's: it says less of any one year.
    const moment = cityPopulation({ figures: [fig({ t: [1300, 1300], v: 10000 })], span: [1100, 1500] });
    expect(peopleAt(p.members[1], 1300)).toBeGreaterThan(peopleAt(moment.members[1], 1300));
  });

  it("stands a figure's people from the start of its years, and ramps from a founding size only before them", () => {
    const p = cityPopulation({ figures: [fig({ t: [770, 888], v: 89000 })], span: [851, 1450] });
    expect(p.observations[0].at).toEqual([851, 888]);
    expect(peopleAt(p.members[0], 851.6)).toBeCloseTo(89000, -3);
    const later = cityPopulation({ figures: [fig({ t: [900, 950], v: 89000 })], span: [851, 1450] });
    expect(peopleAt(later.members[0], 851)).toBeCloseTo(1000, 0);
    expect(peopleAt(later.members[0], 900)).toBeCloseTo(89000, -3);
  });

  it('reads a range as a spread of its own, about the middle of its ends on a log scale', () => {
    const p = cityPopulation({ figures: [fig({ t: [0, 0], v: 175000, lo: 150000, hi: 200000 })], span: [-100, 100] });
    expect(peopleAt(p.members[0], 0)).toBeCloseTo(Math.sqrt(150000 * 200000), -2);
  });

  it("takes a core's figure for a part of the settlement, and a region's for the land about it besides", () => {
    const p = cityPopulation({
      figures: [
        fig({ ground: 'core', t: [800, 900], v: 89000 }),
        fig({ ground: 'region', t: [800, 900], v: 200000, lo: 160000, hi: 250000, source: 'src:k' }),
        fig({ prop: 'settlement_area', ground: 'region', t: [1180, 1300], v: 300000, source: 'src:k' }),
        fig({ prop: 'settlement_area', ground: 'site', v: 40000, source: 'src:park' }),
      ],
      span: [800, 1450],
      hyde: [[800, 30000], [1000, 40000]],
    });
    expect(peopleAt(p.members[0], 850) / 89000).toBeCloseTo(Math.exp(PEOPLE_MODEL.core[0]), 1);
    expect(p.region?.ha).toBe(300000);
    expect(peopleAt(p.region!.members[0], 850)).toBeGreaterThan(160000);
    expect(peopleAt(p.region!.members[0], 850)).toBeLessThan(250000);
    expect(dispersedAt(p, 850)).toBeGreaterThan(50000);
    expect(p.observations.find((o) => o.ground === 'site')!.use).toBe('site');
  });

  it('gives a region with no figure of its people no reading of its own, and one with no ground none at all', () => {
    const p = cityPopulation({ figures: [fig({ t: [0, 0], v: 5000 }), fig({ ground: 'region', t: [0, 0], v: 50000, source: 'src:k' })], span: [-100, 100] });
    expect(p.region).toBeUndefined();
    expect(p.observations.find((o) => o.ground === 'region')!.use).toBe('no-region');
  });

  it('sets its density scale from its own ground and people, and from its neighbours where it has no ground', () => {
    const own = cityPopulation({ figures: [fig({ t: [0, 0], v: 100000 }), fig({ prop: 'settlement_area', t: [0, 0], v: 1000 })], span: [-100, 100] });
    // 100 to the hectare at 100,000 people is 100 / 10^0.2 = 63 at 10,000: its own figures take it most of the way
    // from the world's 100, as far as a work's figures may each be high or low.
    expect(own.at10k).toBeGreaterThan(100 / Math.pow(10, 0.2));
    expect(own.at10k).toBeLessThan(Math.sqrt(100 * (100 / Math.pow(10, 0.2))));
    const anchor = densityAnchor('a', 13, 104, { figures: [fig({ t: [0, 0], v: 100000 }), fig({ prop: 'settlement_area', t: [0, 0], v: 10000 })], span: [-100, 100] })!;
    expect(Math.exp(anchor.u)).toBeLessThan(20);
    const near = densityPrior([anchor], 13.2, 104.1, 50);
    const far = densityPrior([anchor], 50, 0, 50);
    expect(Math.exp(near[0])).toBeLessThan(40);
    expect(Math.exp(far[0])).toBeCloseTo(PEOPLE_MODEL.density.at10k, 0);
    expect(densityPrior([anchor], 13, 104, 0, undefined, 'a')[0]).toBeCloseTo(Math.log(PEOPLE_MODEL.density.at10k), 6);
    // A ground with no figure of the people beside it says nothing of how densely they lived, and anchors nothing.
    expect(densityAnchor('b', 13, 104, { figures: [fig({ prop: 'settlement_area', t: [0, 0], v: 300 })], span: [-100, 100] })).toBeUndefined();
    // A settlement known by its ground alone has its people from the density its neighbours lived at.
    const ground = cityPopulation({ figures: [fig({ prop: 'settlement_area', t: [0, 0], v: 4500 })], span: [-100, 100], density: near });
    const people = peopleAt(ground.members[0], 0);
    expect(people / 4500).toBeCloseTo(Math.exp(near[0]) * Math.pow(people / 1e4, 0.2), -1);
  });

  it("passes over a count of houses where a preferred figure gives the people, and reads it where none does", () => {
    const both = cityPopulation({ figures: [fig({ t: [1519, 1519], v: 175000, preferred: true }), fig({ prop: 'houses', t: [1519, 1519], v: 60000 })], span: [1325, 1600] });
    expect(both.observations[1].use).toBe('passed');
    expect(peopleAt(both.members[0], 1519)).toBeCloseTo(175000, -2);
    const houses = cityPopulation({ figures: [fig({ prop: 'houses', t: [1519, 1519], v: 60000 })], span: [1325, 1600] });
    expect(peopleAt(houses.members[0], 1519)).toBeCloseTo(60000 * Math.exp(PEOPLE_MODEL.household[0]), -3);
  });

  it('meets two lists that disagree between them', () => {
    const p = cityPopulation({ lists: [list([[1000, 100000]], 'src:a'), list([[1000, 200000]], 'src:b')] });
    const c = peopleAt(p.members[0], 1000);
    expect(c).toBeGreaterThan(100000);
    expect(c).toBeLessThan(200000);
  });

  it('scores a figure held out by how well the others predict it', () => {
    const input = { lists: [list([[0, 10000], [100, 20000], [200, 40000]])] };
    const loo = leaveOneOut(input);
    expect(loo.length).toBe(3);
    // The middle one is predicted from those either side, on the line between them.
    const mid = loo.find((s) => Math.abs(s.y - Math.log(20000)) < 1e-9)!;
    expect(Math.exp(mid.mean)).toBeCloseTo(20000, -2);
    expect(mid.within).toBe(true);
    const held = holdOut({ figures: [fig({ t: [100, 100], v: 20000, claim: 'x#p' })], ...input, span: [-50, 250] }, (o) => o.claim === 'x#p');
    expect(held.length).toBe(1);
    expect(Math.exp(held[0].mean)).toBeCloseTo(20000, -2);
    expect(held[0].sd).toBeGreaterThan(PEOPLE_MODEL.bias.work - 1e-9);
  });
});
