import { describe, expect, it } from 'vitest';
import { cityPopulation } from './citypop.ts';
import { peopleAt } from './growth.ts';

const list = (pops: [number, number][], source = 'src:list-a', hold = 50) => ({ source, pops, hold });

describe("a settlement's people through time", () => {
  it('reads a list between its figures at a constant rate, and stands only while the list holds it', () => {
    const p = cityPopulation([list([[0, 10000], [100, 40000]])]);
    expect(p.span).toEqual([-50, 150]);
    expect(peopleAt(p.members[0], 50)).toBeCloseTo(20000, 6);
    expect(peopleAt(p.members[0], 100)).toBeCloseTo(40000, 6);
  });

  it('prefers the record’s own figures, and keeps a list’s apart as a reading of its own', () => {
    const p = cityPopulation(
      [list([[0, 10000], [200, 30000]]), { source: 'people/cities/x', pops: [[10, 15000]], hold: 50, record: true }],
      [-300, 1e9],
    );
    // The record's 15,000 in 10 takes the place of the list's 10,000 in 0.
    expect(peopleAt(p.members[0], 10)).toBeCloseTo(15000, 6);
    expect(p.from).toContain('src:list-a');
    const own = p.members[p.from.indexOf('src:list-a')];
    expect(peopleAt(own, 0)).toBeCloseTo(10000, 6);
  });

  it('rises from a founding size at the record’s start, and holds its last figure where the record runs on', () => {
    const p = cityPopulation([{ source: 'people/cities/x', pops: [[0, 50000]], hold: 50, record: true }], [-700, 1e9]);
    expect(p.span[0]).toBe(-700);
    expect(peopleAt(p.members[0], -700)).toBeCloseTo(1000, 6);
    expect(peopleAt(p.members[0], -350)).toBeGreaterThan(1000);
    expect(peopleAt(p.members[0], 0)).toBeCloseTo(50000, 6);
  });

  it('falls to a founding size at the record’s end', () => {
    const p = cityPopulation([{ source: 'r', pops: [[0, 50000]], hold: 50, record: true }], [-100, 400]);
    expect(peopleAt(p.members[0], 400)).toBeCloseTo(1000, 6);
  });

  it('carries the doubt as members higher and lower than the central reading', () => {
    const p = cityPopulation([list([[0, 10000]])]);
    expect(p.members.length).toBe(3);
    expect(peopleAt(p.members[1], 0)).toBeGreaterThan(peopleAt(p.members[0], 0));
    expect(peopleAt(p.members[2], 0)).toBeLessThan(peopleAt(p.members[0], 0));
  });
});
