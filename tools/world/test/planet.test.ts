// The planet's state at a time: the phase that holds, how far through it the time is, how far
// a phase that is a passage has gone into the next, and the ice of any glaciation, each
// following the scenario's picks and alternatives. Then how the globe draws it.
import { describe, expect, it } from 'vitest';
import { chosenClaim, coverAt, lookAt, type PlanetFile, type StateClaim } from '../../../core/planet.ts';
import type { FeatureTime } from '../../../core/tileset.ts';
import { globeLook } from '../../../viewer/src/gl/globe.ts';
import { apart, drawn } from './drawn.ts';

const span = (start: number, end: number | null): FeatureTime => ({
  start: { best: start, lo: start, hi: start, derived: false },
  end: { best: end, lo: end ?? Infinity, hi: end ?? Infinity, derived: false },
  instant: false,
});
const claim = (key: string, value: string | number, rank = 'normal', alt?: string): StateClaim => ({ claim: `x#${key}`, value, rank, alt, basis: 'reconstruction' });

const FILE: PlanetFile = {
  planet: {
    id: 'p',
    label: 'Planet',
    time: span(0, null),
    phases: [
      { subject: 'p@molten', label: 'Molten', time: span(0, 100), variants: { 'x#late': span(0, 200) }, values: { surface: [claim('s1', 'magma')], atmosphere: [claim('a1', 'steam')] } },
      { subject: 'p@wet', label: 'Wet', time: span(100, null), variants: { 'x#late': span(200, null) }, values: { surface: [claim('s2', 'ocean')] } },
    ],
  },
  episodes: [{ subject: 'ice', label: 'Ice age', time: span(500, 600), values: { ice_reach: [claim('hard', 0, 'preferred'), claim('belt', 12)] } }],
};

/** A planet whose record says how each of its first states gave way: a cloud of rock vapour, a magma ocean, a rain, a hot ocean. */
const PASSING: PlanetFile = {
  planet: {
    id: 'q',
    label: 'Planet',
    time: span(0, null),
    phases: [
      { subject: 'q@vapour', label: 'Vapour', time: span(0, 10), values: { surface: [claim('s0', 'magma')], atmosphere: [claim('a0', 'rock-vapour')], change: [claim('c0', 'gradual')] } },
      { subject: 'q@molten', label: 'Molten', time: span(10, 110), variants: { 'x#late': span(10, 210) }, values: { surface: [claim('s1', 'magma')], atmosphere: [claim('a1', 'steam')], change: [claim('c1', 'gradual')] } },
      { subject: 'q@rain', label: 'Rain', time: span(110, 120), variants: { 'x#late': span(210, 220) }, values: { surface: [claim('s2', 'crust-and-magma')], atmosphere: [claim('a2', 'steam')], change: [claim('c2', 'gradual')] } },
      { subject: 'q@hot', label: 'Hot', time: span(120, 220), variants: { 'x#late': span(220, 320) }, values: { surface: [claim('s3', 'ocean')], atmosphere: [claim('a3', 'dense-co2')], change: [claim('c3', 'gradual')] } },
      { subject: 'q@wet', label: 'Wet', time: span(220, null), variants: { 'x#late': span(320, null) }, values: { surface: [claim('s4', 'ocean')], change: [claim('c4', 'gradual')] } },
    ],
  },
  episodes: [],
};

describe('the planet at a time', () => {
  it('has not formed before its record starts', () => {
    expect(lookAt(FILE, -1, {}).formed).toBe(false);
    expect(lookAt(FILE, 0, {}).formed).toBe(true);
  });

  it('is in the phase that holds, part of the way through it', () => {
    const a = lookAt(FILE, 25, {});
    expect(a.phase?.label).toBe('Molten');
    expect([a.surface, a.atmosphere]).toEqual(['magma', 'steam']);
    expect(a.progress).toBeCloseTo(0.25);
    // At a boundary the next phase has begun.
    expect(lookAt(FILE, 100, {}).phase?.label).toBe('Wet');
    expect(lookAt(FILE, 300, {}).atmosphere).toBeNull();
  });

  it('passes little by little into the next phase, where the phase\'s change is claimed to be gradual', () => {
    const a = lookAt(PASSING, 35, {});
    expect([a.phase?.label, a.surface, a.atmosphere]).toEqual(['Molten', 'magma', 'steam']);
    expect([a.into?.label, a.intoSurface, a.intoAtmosphere]).toEqual(['Rain', 'crust-and-magma', 'steam']);
    expect(a.passed).toBeCloseTo(0.25);
    // As a phase starts nothing has passed; just before it ends, nearly all of it has.
    expect(lookAt(PASSING, 110, {}).passed).toBe(0);
    expect(lookAt(PASSING, 109.999, {}).passed).toBeCloseTo(1, 4);
    // A pick that lengthens the phase stretches the passage with it.
    expect(lookAt(PASSING, 110, { picks: ['x#late'] }).passed).toBeCloseTo(0.5);
  });

  it('holds its state where no such claim is made, and where the phase has no end to pass by', () => {
    const held = lookAt(FILE, 25, {});
    expect([held.into, held.passed, held.progress]).toEqual([null, 0, 0.25]);
    // The last phase's change is claimed gradual too, but it has no end and nothing follows it.
    const last = lookAt(PASSING, 1000, {});
    expect([last.phase?.label, last.into, last.passed]).toEqual(['Wet', null, 0]);
  });

  it('moves its phases with a pick that moves their dates', () => {
    expect(lookAt(FILE, 150, {}).surface).toBe('ocean');
    expect(lookAt(FILE, 150, { picks: ['x#late'] }).surface).toBe('magma');
    expect(lookAt(FILE, 150, { picks: ['x#late'] }).progress).toBeCloseTo(0.75);
  });

  it('has ice during a glaciation, as far as the chosen claim says', () => {
    expect(lookAt(FILE, 400, {}).iceReach).toBe(90);
    const hard = lookAt(FILE, 550, {});
    expect(hard.iceReach).toBe(0);
    expect(hard.ice?.label).toBe('Ice age');
    expect(lookAt(FILE, 550, { picks: ['x#belt'] }).iceReach).toBe(12);
  });

  it('chooses among competing claims as the chronology does', () => {
    const cs = [claim('a', 1), claim('b', 2)];
    expect(chosenClaim(cs, {})).toBeUndefined();
    expect(chosenClaim([...cs, claim('c', 3, 'preferred')], {})?.value).toBe(3);
    expect(chosenClaim([claim('d', 4, 'deprecated'), claim('e', 5)], {})?.value).toBe(5);
    // An alternative's own claims replace the default picture's.
    const alt = [claim('f', 6, 'preferred'), claim('g', 7, 'normal', 'alt:x')];
    expect(chosenClaim(alt, {})?.value).toBe(6);
    expect(chosenClaim(alt, { alts: ['alt:x'] })?.value).toBe(7);
  });
});

describe('what can cover the land at a time', () => {
  const cover = (subject: string, value: string, time: FeatureTime, variants?: Record<string, FeatureTime>) => ({ subject, label: subject, time, variants, values: { cover: [claim(subject, value)] } });
  const file: PlanetFile = {
    planet: null,
    episodes: [],
    coverSpread: 100,
    covers: [
      cover('crust', 'microbial-crust', span(0, 50)),
      cover('plants', 'land-plants', span(1000, null), { 'x#early': span(800, null) }),
      cover('forests', 'forests', span(1500, 1700)),
      cover('grass', 'grasslands', span(3000, null)),
      cover('reefs-a', 'reefs', span(500, 600)),
      cover('reefs-b', 'reefs', span(2000, 2100)),
    ],
  };

  it('is nothing before the transition that allows it: no vegetation before the land-plants claim', () => {
    expect(coverAt(file, 999, {}).plants).toBe(0);
    expect(coverAt(file, 999, {}).forests).toBe(0);
    expect(coverAt(file, 1000, {}).plants).toBe(0);
    expect(coverAt(file, 1001, {}).plants).toBeGreaterThan(0);
  });

  it('follows a scenario: a competing date for the first land plants moves them', () => {
    expect(coverAt(file, 900, {}).plants).toBe(0);
    expect(coverAt(file, 900, { picks: ['x#early'] }).plants).toBeGreaterThan(0);
  });

  it('spreads over the time given, or the time the rule allows where none is given', () => {
    // Forests give an end: half way, they are half way.
    expect(coverAt(file, 1600, {}).forests).toBeCloseTo(0.5);
    expect(coverAt(file, 1700, {}).forests).toBe(1);
    expect(coverAt(file, 5000, {}).forests).toBe(1);
    // Grass gives none, so the rule's spread.
    expect(coverAt(file, 3050, {}).grasses).toBeCloseTo(0.5);
    expect(coverAt(file, 3100, {}).grasses).toBe(1);
  });

  it('counts forest and grass as plants, whatever the plants claim says', () => {
    const c = coverAt({ ...file, covers: file.covers!.filter((x) => x.subject === 'forests') }, 1700, {});
    expect(c.plants).toBe(1);
  });

  it('holds reefs only while a reef-builder lasts, and not in the gaps', () => {
    expect(coverAt(file, 550, {}).reefs).toBe(1);
    expect(coverAt(file, 700, {}).reefs).toBe(0);
    expect(coverAt(file, 2050, {}).reefs).toBe(1);
    expect(coverAt(file, 3000, {}).reefs).toBe(0);
  });

  it('is empty for a world with no transitions', () => {
    expect(coverAt({ planet: null, episodes: [] }, 1000, {})).toEqual({ crust: 0, plants: 0, forests: 0, grasses: 0, reefs: 0 });
  });
});

describe('how the globe draws the planet between its states', () => {
  const draw = { crust: { magma: 0, over_magma: 0.82 }, ice_edge: 5 };
  const at = (file: PlanetFile, t: number) => globeLook(lookAt(file, t, {}), draw);

  it('draws a state that holds as that state: molten rock under steam, or oceans under today\'s sky', () => {
    const molten = at(FILE, 25);
    expect([molten.molten, molten.crust, molten.ember, molten.surfaceMix]).toEqual([1, 0, 0, 0]);
    expect(molten.clouds!.base).toBeGreaterThan(0.5);
    const wet = at(FILE, 300);
    expect([wet.surface, wet.molten, wet.ember]).toEqual([1, 0, 0]);
    expect(wet.clouds).toEqual({ opacity: 0.78, base: 0, tint: [1, 1, 1], glow: [0, 0, 0] });
  });

  it('spreads a magma ocean\'s crust as far as its passage has gone, and dims the glow under its steam with it', () => {
    expect(at(PASSING, 10).crust).toBe(0);
    const half = at(PASSING, 60);
    expect(half.molten).toBe(1);
    expect(half.crust).toBeCloseTo(0.41);
    expect(half.clouds!.glow[0]).toBeCloseTo(0.55 * (1 - 0.41));
    expect(at(PASSING, 109.999).crust).toBeCloseTo(0.82, 3);
  });

  it('thins rock vapour over the magma under it, and molten rock over the ocean that the rain leaves', () => {
    const vapour = at(PASSING, 5);
    expect([vapour.ember, vapour.molten]).toEqual([0.5, 1]);
    // The steam's clouds gather as the rock vapour thins.
    expect(vapour.clouds!.base).toBeCloseTo(0.275);
    const rain = at(PASSING, 115);
    expect([rain.molten, rain.surface, rain.crust]).toEqual([0.5, 1, 0.82]);
  });

  it('thins a veil of carbon dioxide over the ocean until the sky is today\'s', () => {
    const veiled = at(PASSING, 120);
    const thinning = at(PASSING, 170);
    const clear = at(PASSING, 220);
    expect(veiled.clouds!.base).toBeGreaterThan(thinning.clouds!.base);
    expect(thinning.clouds!.base).toBeGreaterThan(0);
    expect([clear.clouds, clear.rim, clear.halo]).toEqual([{ opacity: 0.78, base: 0, tint: [1, 1, 1], glow: [0, 0, 0] }, [0.25, 0.45, 0.85], [0.22, 0.42, 0.95]]);
    expect([veiled.surface, thinning.surface, clear.surface]).toEqual([1, 1, 1]);
  });

  it('passes from one plain surface to another, as oceans to bare rock would', () => {
    const drying: PlanetFile = {
      planet: {
        id: 'd',
        label: 'Planet',
        time: span(0, null),
        phases: [
          { subject: 'd@wet', label: 'Wet', time: span(0, 100), values: { surface: [claim('s', 'ocean')], change: [claim('c', 'gradual')] } },
          { subject: 'd@dry', label: 'Dry', time: span(100, null), values: { surface: [claim('r', 'bare-rock')] } },
        ],
      },
      episodes: [],
    };
    const g = at(drying, 25);
    expect([g.surface, g.surfaceTo, g.surfaceMix, g.molten]).toEqual([1, 4, 0.25, 0]);
    // The clouds thin out with the water.
    expect(g.clouds!.opacity).toBeCloseTo(0.78 * 0.75);
  });

  it('changes at no moment all at once, from the first rock vapour to the oceans', () => {
    // Step through every passage: no step moves any part of the drawing by more than a little.
    const step = 0.01;
    let before = drawn(at(PASSING, 0));
    let most = 0;
    for (let t = step; t <= 230; t += step) {
      const now = drawn(at(PASSING, t));
      most = Math.max(most, apart(before, now));
      before = now;
    }
    expect(most).toBeLessThan(0.003);
    // At each boundary the phase before has come to the state the next begins in.
    for (const b of [10, 110, 120, 220]) expect(apart(drawn(at(PASSING, b - 1e-9)), drawn(at(PASSING, b)))).toBeLessThan(1e-6);
    // And each passage is a change: its two ends are drawn differently.
    for (const [a, b] of [[0, 10], [10, 110], [110, 120], [120, 220]]) expect(apart(drawn(at(PASSING, a)), drawn(at(PASSING, b)))).toBeGreaterThan(0.2);
  });

  it('changes all at once where the record gives a state no passage', () => {
    expect(apart(drawn(at(FILE, 99.999)), drawn(at(FILE, 100)))).toBeGreaterThan(0.5);
  });
});
