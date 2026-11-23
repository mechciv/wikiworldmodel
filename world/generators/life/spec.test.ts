// Which plate a place of a scene is on (spec.ts): on a made-up world of two plates, which says nothing of any real one.
import { describe, expect, it } from 'vitest';
import { platesNear, plateUnder } from './spec.ts';

// At the keyframe, 10 Ma, plate 1 lies south of 20°N and plate 2 north of 25°N, with no ground between them: they
// have not yet met. Plate 1 goes north a degree in a million years, and plate 2 stays where it is.
const world = {
  keyAge: 10,
  plate: (lat: number, _lon: number) => (lat < 20 ? 1 : lat >= 25 ? 2 : 0),
  carry: (plate: number, lat: number, lon: number, from: number, to: number): [number, number] => (plate === 1 ? [lat + (from - to), lon] : [lat, lon]),
};

describe('the plate under a place', () => {
  it("is the keyframe's own at the keyframe's time, and away from any edge", () => {
    expect(plateUnder(world, 19, 30, 10)).toBe(1);
    expect(plateUnder(world, 22, 30, 10)).toBe(0);
    expect(plateUnder(world, 40, 30, 8)).toBe(2);
    expect(plateUnder(world, 5, 30, 8)).toBe(1);
    expect(plateUnder(world, 5, 30, 12)).toBe(1);
  });

  it('is the plate whose ground has come there since the keyframe, where the keyframe has none at the place', () => {
    // At 8 Ma plate 1 has come two degrees north: its edge is at 22°N, over ground the keyframe has as no plate's.
    expect(world.plate(21, 30)).toBe(0);
    expect(plateUnder(world, 21, 30, 8)).toBe(1);
    expect(plateUnder(world, 21.9, 30, 8)).toBe(1);
    // Beyond its edge there is still no plate, and north of the gap the other one.
    expect(plateUnder(world, 23, 30, 8)).toBe(0);
    expect(plateUnder(world, 25.5, 30, 8)).toBe(2);
    // By the line where longitude wraps and far north, the same.
    expect(plateUnder(world, 21, 179.9, 8)).toBe(1);
    expect(plateUnder(world, 21, -179.9, 8)).toBe(1);
  });

  it("keeps the keyframe's answer where no plate's ground carries to the place, and where two do", () => {
    // At 12 Ma plate 1's edge was at 18°N: the place at 19°N then lay beyond it, on no plate's ground.
    expect(plateUnder(world, 19, 30, 12)).toBe(1);
    // With the other plate nearer, from 21°N: at 8 Ma plate 1 has run under it as far as 22°N. Where both have
    // ground, the keyframe's own plate there; south of that, the one that has come.
    const near = { ...world, plate: (lat: number, _lon: number) => (lat < 20 ? 1 : lat >= 21 ? 2 : 0) };
    expect(plateUnder(near, 21.5, 30, 8)).toBe(2);
    expect(plateUnder(near, 20.5, 30, 8)).toBe(1);
  });

  it("takes a plate that carries the place to within a cell of its ground, the keyframe's grid being coarser than its edge", () => {
    // The keyframe's grid of a degree has plate 1 on its nodes up to 19°N, though its ground runs a little further:
    // a place at 21.6°N at 8 Ma is carried to 19.6°N, between a node of plate 1 and a node of none.
    const coarse = { ...world, step: 1, plate: (lat: number, _lon: number) => (Math.round(lat) <= 19 ? 1 : Math.round(lat) >= 25 ? 2 : 0) };
    expect(coarse.plate(19.6, 30)).toBe(0);
    expect(plateUnder(coarse, 21.6, 30, 8)).toBe(1);
    // A whole cell beyond its last node, it is on no plate.
    expect(plateUnder(coarse, 23.2, 30, 8)).toBe(0);
  });

  it("goes by today's plates where the world has them more finely: the plate that carries the place to ground of its own today", () => {
    // Today plate 1 has come ten degrees north since the keyframe, and its edge, which the keyframe's grid of a degree
    // has at 19°N, is known to a tenth of a degree: at 29.7°N. Plate 2 lies north of that.
    const coarse = { ...world, step: 1, plate: (lat: number, _lon: number) => (Math.round(lat) <= 19 ? 1 : Math.round(lat) >= 25 ? 2 : 0) };
    const fine = { ...coarse, plateNow: (lat: number, _lon: number) => (lat < 29.7 ? 1 : 2) };
    // At the keyframe's own time, a place at 19.6°N: the keyframe has no plate at its nearest node, and today's plates
    // say it is plate 1's, which carries it to 29.6°N. Without them the keyframe's cell says so too, with a node of
    // plate 1 at its corner.
    expect(platesNear(coarse, 19.6, 30)).toEqual([0, 1]);
    expect(plateUnder(fine, 19.6, 30, 10)).toBe(1);
    expect(plateUnder(coarse, 19.6, 30, 10)).toBe(1);
    // And one at 19.4°N at 10 Ma, which the keyframe's grid gives plate 1, is its: today 29.4°N.
    expect(plateUnder(fine, 19.4, 30, 10)).toBe(1);
    // A place the keyframe's grid gives a plate that does not carry it to ground of its own today is the other's, where
    // the other does: with plate 2's ground today from 21.5°N, a place at 21.6°N at 8 Ma would be carried by plate 1 to
    // 29.6°N, which is plate 1's own, though the keyframe's grid has plate 2 at the place.
    const two = { ...world, step: 1, plate: (lat: number, _lon: number) => (Math.round(lat) <= 19 ? 1 : 2), plateNow: (lat: number, _lon: number) => (lat < 29.7 ? 1 : 2) };
    expect(two.plate(21.6, 30)).toBe(2);
    expect(plateUnder(two, 21.6, 30, 8)).toBe(1);
    // Where no plate carries the place to its own ground today, the keyframe's plates decide, as without them.
    const lost = { ...coarse, plateNow: () => 9 };
    expect(plateUnder(lost, 21, 30, 8)).toBe(1);
    expect(plateUnder(lost, 40, 30, 8)).toBe(2);
  });
});
