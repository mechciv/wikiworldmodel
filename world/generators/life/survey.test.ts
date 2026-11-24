import { describe, expect, it } from 'vitest';
import type { SceneSurvey } from '../../../core/scene.ts';
import type { GroundGridData } from '../city/ground.ts';
import type { Waters } from './land.ts';
import type { RiverPath } from './rivers.ts';
import { clipWaters, overlaySurvey, placeSurvey, surveyOffset, surveyWaterMesh, surveyWeight, withSurveyWater } from './survey.ts';

/** A level grid of `z` metres, in decimetres. */
const level = (x0: number, n: number, cell: number, z: number): GroundGridData & { z: Int16Array } => ({ nx: n, ny: n, x0, y0: x0, cell, z: new Int16Array(n * n).fill(z * 10) });

/** A survey at the scene's own point: 50 m everywhere, a city grid of 1 km and a wider one of 20 km. */
const survey = (over: Partial<SceneSurvey> = {}): SceneSurvey => ({
  of: 'places/x',
  origin: { lat: 41.9, lon: 12.5 },
  levels: [level(-500, 101, 10, 50), level(-10000, 401, 50, 50), level(-100000, 251, 800, 50)],
  ...over,
});
const site = { lat: 41.9, lon: 12.5 };

describe("a settlement's survey in a scene", () => {
  it('lays its ground over the scene’s well inside its reach, and leaves the scene’s beyond it', () => {
    const scene = [level(-3000, 601, 10, 20)];
    const p = placeSurvey(site, survey());
    overlaySurvey(scene, p, 1);
    const at = (x: number, y: number) => scene[0].z[Math.round((y + 3000) / 10) * 601 + Math.round((x + 3000) / 10)] / 10;
    expect(at(0, 0)).toBeCloseTo(50, 5);
    expect(at(2000, 2000)).toBeCloseTo(50, 5);
    expect(surveyWeight(p, 0, 0)).toBe(1);
    expect(surveyWeight(p, 30000, 0)).toBe(0);
  });

  it('places a survey of another point by the offset between the two', () => {
    const [dx, dy] = surveyOffset(site, { lat: 41.91, lon: 12.5 });
    expect(Math.abs(dx)).toBeLessThan(1e-6);
    expect(dy).toBeCloseTo(1111.95, 1);
  });

  it('has its own water and the ground its structures take, and keeps houses off both and off its gardens', () => {
    const river = [-100, -500, 100, -500, 100, 500, -100, 500];
    const island = [-30, -30, 30, -30, 30, 30, -30, 30];
    const temple = [200, 200, 260, 200, 260, 280, 200, 280];
    const garden = [-400, 200, -300, 200, -300, 300, -400, 300];
    const p = placeSurvey(site, survey({ water: { rings: [river], islands: [island], level: 7 }, built: [temple], gardens: [garden] }));
    expect(p.wet(0, 200)).toBe(true);
    expect(p.wet(0, 0)).toBe(false);
    expect(p.wet(300, 0)).toBe(false);
    expect(p.built(230, 240)).toBe(true);
    expect(p.built(-350, 250)).toBe(false);
    expect(p.reserved(-350, 250)).toBe(true);
    expect(p.reserved(0, 200)).toBe(true);
    expect(p.reserved(-200, -200)).toBe(false);
    // The scene's water is the survey's there.
    expect(withSurveyWater(() => -5, p)(0, 300)).toBe(7);
    expect(withSurveyWater(() => -5, p)(300, 300)).toBe(-5);
    // And it is drawn at its level, round its island.
    const mesh = surveyWaterMesh(p);
    expect(mesh.indices.length).toBeGreaterThan(0);
    for (let i = 2; i < mesh.vertices.length; i += 3) expect(mesh.vertices[i]).toBe(7);
  });

  it('keeps houses a street from a structure all round its convex hull, its courts and recesses with it', () => {
    // A temple's precinct in the shape of a U, open to the north.
    const precinct = [0, 0, 120, 0, 120, 100, 90, 100, 90, 30, 30, 30, 30, 100, 0, 100];
    const p = placeSurvey(site, survey({ built: [precinct], clear: [precinct] }));
    // Its ground is built on, and the court within its arms is kept clear of houses, though not built on.
    expect(p.built(10, 50)).toBe(true);
    expect(p.built(60, 70)).toBe(false);
    expect(p.reserved(60, 70)).toBe(true);
    // A street's width beyond it is kept clear; further out, a house may stand.
    expect(p.reserved(60, -3)).toBe(true);
    expect(p.reserved(60, -12)).toBe(false);
    expect(p.reserved(132, 50)).toBe(false);
  });

  it('takes the scene’s own river out where the survey has its water, and keeps it beyond', () => {
    const n = 200;
    const path: RiverPath = {
      key: 'r',
      pattern: 'meandering' as RiverPath['pattern'],
      xy: Float64Array.from({ length: n * 2 }, (_, i) => (i % 2 ? -2000 + (Math.floor(i / 2) / (n - 1)) * 4000 : 0)),
      z: new Float32Array(n).fill(5),
      half: new Float32Array(n).fill(30),
      depth: new Float32Array(n).fill(2),
      q: new Float32Array(n).fill(50),
      plain: 300,
    };
    const w: Waters = { river: [0, -2000, 0, 2000], oxbows: [], ponds: [0, 0, 20, 20, 0, 1500, 20, 20], paths: [path] };
    const clipped = clipWaters(w, placeSurvey(site, survey()));
    // The survey's city grid reaches 500 m each way: the river runs on either side of it, in two runs.
    expect(clipped.paths!.length).toBe(2);
    for (const r of clipped.paths!) for (let i = 1; i < r.xy.length; i += 2) expect(Math.abs(r.xy[i])).toBeGreaterThanOrEqual(500);
    expect(clipped.ponds).toEqual([0, 1500, 20, 20]);
  });
});
