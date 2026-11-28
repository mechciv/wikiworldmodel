import { describe, expect, it } from 'vitest';
import { climateClass, type ClimateNode, type ClimateRule } from './climate.ts';
import { above, band, byteChance, byteFinds, byteWarmSd, byteWetSd, chanceByte, chanceWords, classChances, CLASSES, drawOf, errorFrom, expit, findsByte, GH_POINTS, memberNode, monthSd, moved, nodeOf, normalBelow, nudged, placeOf, RESTS_FROM, restsOnBeds, scoreOf, shareNear, shareOver, together, toldOf, warmingAt, warmSdByte, wetSdByte, wettingAt, type ChanceGrid, type Response, type Spreads } from './climatechance.ts';

const GRID: ChanceGrid = { nx: 180, ny: 91, step: 2 };
/** Köppen's thresholds, as the biome field has them. */
const RULE: ClimateRule = { polar: 10, frost: 0, tropical: 18, cold: 0, arid: 1, desert: 0.5 };
/** How the runs answer to the mean, by belts of ten degrees from the equator: more towards the poles, and a little drier in the middle latitudes. */
const RESPONSE: Response = { belt_deg: 10, warm: [0.9, 1.0, 1.1, 1.2, 1.5, 1.8, 2.3, 2.7, 2.8], wet: [0, -0.01, -0.02, -0.03, -0.04, -0.03, -0.02, -0.02, -0.01] };
const TEMPERATE: ClimateNode = { hot: 22, cold: 4, aridity: 2, margin: -20 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const of = (cs: number[], cls: (typeof CLASSES)[number]) => cs[CLASSES.indexOf(cls)];

describe('the climate conditioned (model:earth/climate-conditioned)', () => {
  it('finds the node nearest a place on the climate field\'s grid, and the place of a node', () => {
    expect(nodeOf(GRID, 90, -180)).toBe(0);
    expect(placeOf(GRID, nodeOf(GRID, 47.4, -106.9))).toEqual([48, -106]);
    // Across the date line as anywhere.
    expect(nodeOf(GRID, 0, 179.6)).toBe(nodeOf(GRID, 0, -180));
    expect(placeOf(GRID, nodeOf(GRID, -91, 0))[0]).toBe(-90);
  });

  it('asks the season\'s swing at points that weigh as a bell does', () => {
    expect(GH_POINTS).toHaveLength(9);
    expect(sum(GH_POINTS.map(([, w]) => w))).toBeCloseTo(1, 9);
    expect(sum(GH_POINTS.map(([x, w]) => w * x))).toBeCloseTo(0, 9);
    expect(sum(GH_POINTS.map(([x, w]) => w * x * x))).toBeCloseTo(1, 6);
    expect(sum(GH_POINTS.map(([x, w]) => w * x ** 4))).toBeCloseTo(3, 5);
    expect(normalBelow(0)).toBeCloseTo(0.5, 6);
    expect(normalBelow(1.6449)).toBeCloseTo(0.95, 4);
    expect(normalBelow(-1.6449)).toBeCloseTo(0.05, 4);
    expect(band(10, 2)[1] - band(10, 2)[0]).toBeCloseTo(2 * 1.6449 * 2, 6);
  });

  it("gives the run's own class a chance of one where nothing is spread, and chances that add to one where something is", () => {
    const none: Spreads = { warm: 0, swing: 0, wet: 0 };
    for (const c of [TEMPERATE, { hot: 28, cold: 24, aridity: 3, margin: 40 }, { hot: 30, cold: 12, aridity: 0.2, margin: -60 }, { hot: 4, cold: -30, aridity: 4, margin: -50 }, { hot: -5, cold: -40, aridity: 4, margin: -50 }, { hot: 18, cold: -12, aridity: 0.8, margin: -40 }]) {
      const sure = classChances(c, none, RULE);
      expect(of(sure, climateClass(c, RULE))).toBe(1);
      expect(sum(sure)).toBe(1);
      const spread = classChances(c, { warm: 3, swing: 2, wet: 0.6 }, RULE);
      expect(sum(spread)).toBeCloseTo(1, 9);
      for (const v of spread) expect(v).toBeGreaterThanOrEqual(0);
      // The run's own class is still the likeliest where it lies well inside its class.
      if (c === TEMPERATE) expect(spread.indexOf(Math.max(...spread))).toBe(CLASSES.indexOf('temperate'));
    }
    // At a threshold the two classes it parts are as likely as each other: a coldest month of 0 °C, and nothing else in doubt.
    const edge = classChances({ hot: 25, cold: 0, aridity: 3, margin: -20 }, { warm: 2, swing: 0, wet: 0 }, RULE);
    expect(of(edge, 'temperate')).toBeCloseTo(0.5, 3);
    expect(of(edge, 'cold')).toBeCloseTo(0.5, 3);
    // And an aridity of one, with the warmth sure: steppe and temperate.
    const dry = classChances({ hot: 25, cold: 5, aridity: 1, margin: -20 }, { warm: 0, swing: 0, wet: 0.5 }, RULE);
    expect(of(dry, 'steppe') + of(dry, 'desert')).toBeCloseTo(0.5, 3);
    expect(of(dry, 'temperate')).toBeCloseTo(0.5, 3);
  });

  it('gives a wider spread more classes, and the season\'s swing its own part: a place can be polar by its summer and not by its year', () => {
    // A year's mean of 9 °C: with a small swing its warmest month is 12 °C, and no polar one.
    const c: ClimateNode = { hot: 12, cold: 6, aridity: 3, margin: -20 };
    const narrow = classChances(c, { warm: 0.5, swing: 0, wet: 0 }, RULE);
    expect(of(narrow, 'tundra')).toBeLessThan(0.001);
    // The swing in doubt: a smaller one takes the warmest month under 10 °C, though the year's mean has not moved.
    const swung = classChances(c, { warm: 0, swing: 2, wet: 0 }, RULE);
    expect(of(swung, 'tundra')).toBeCloseTo(normalBelow(-1), 3);
    // And a larger one takes the coldest month under 0 °C, three of its spreads away.
    expect(of(swung, 'cold')).toBeCloseTo(normalBelow(-3), 4);
    expect(of(swung, 'temperate')).toBeCloseTo(1 - normalBelow(-1) - normalBelow(-3), 3);
    expect(monthSd({ warm: 3, swing: 4, wet: 0 })).toBe(5);
  });

  it("moves the run's pattern more towards the poles than at the equator, by how its belt answers", () => {
    expect(warmingAt(RESPONSE, 5)).toBe(0.9);
    expect(warmingAt(RESPONSE, -85)).toBe(2.8);
    // Between two belts' middles, in proportion; north and south alike.
    expect(warmingAt(RESPONSE, 10)).toBeCloseTo(0.95, 9);
    expect(warmingAt(RESPONSE, -10)).toBeCloseTo(0.95, 9);
    expect(wettingAt(RESPONSE, 45)).toBe(-0.04);
    // An Earth two degrees warmer than the run's: under two degrees at the equator, over five near the pole.
    const low = moved(TEMPERATE, 5, 2, RESPONSE);
    const high = moved(TEMPERATE, 80, 2, RESPONSE);
    expect(low.hot - TEMPERATE.hot).toBeCloseTo(1.8, 9);
    expect(low.cold - TEMPERATE.cold).toBeCloseTo(1.8, 9);
    expect(high.hot - TEMPERATE.hot).toBeGreaterThan(5);
    // The aridity moves by its own answer, and the margin with it as the driest month's rain would.
    const mid = moved(TEMPERATE, 45, 5, RESPONSE);
    expect(mid.aridity).toBeCloseTo(2 * Math.exp(-0.2), 9);
    expect(mid.margin).toBeCloseTo(-20 + (Math.exp(-0.2) - 1) * 40, 9);
    // The run's own mean warmth leaves it where it was.
    expect(moved(TEMPERATE, 45, 0, RESPONSE)).toEqual(TEMPERATE);
  });

  it('keeps member 0 the central climate, and a member drawn warmer the warmer at every place', () => {
    const s: Spreads = { warm: 3, swing: 2, wet: 0.5 };
    // Member 0 draws nothing, and its warmth is the central one: the central climate.
    expect(drawOf(0)).toEqual({ mean: 0, swing: 0, wet: 0 });
    expect(memberNode(TEMPERATE, s, drawOf(0), 45, 0, 1.5, RESPONSE)).toEqual(TEMPERATE);
    // A member's draws are its own, the same wherever and whenever they are asked for.
    expect(drawOf(7)).toEqual(drawOf(7));
    expect(drawOf(7)).not.toEqual(drawOf(8));
    // Two members that differ only in the Earth's mean warmth, by two degrees: the warmer is warmer in both months
    // by what its belt answers, at the equator and near the pole, and the season's swing is the same.
    const none = { mean: 0, swing: 0, wet: 0 };
    for (const lat of [5, 45, 85]) {
      const cool = memberNode(TEMPERATE, s, none, lat, -1, 1.5, RESPONSE);
      const warm = memberNode(TEMPERATE, s, none, lat, 1, 1.5, RESPONSE);
      expect(warm.hot - cool.hot).toBeCloseTo(2 * warmingAt(RESPONSE, lat), 9);
      expect(warm.cold - cool.cold).toBeCloseTo(2 * warmingAt(RESPONSE, lat), 9);
      expect(warm.hot - warm.cold).toBeCloseTo(TEMPERATE.hot - TEMPERATE.cold, 9);
    }
    // A draw of the run's error in the year's mean moves both months by what is left of the spread once the
    // warmth's part is taken out; one of the swing parts them, one up and the other down by as much.
    const lat = 45;
    const left = Math.sqrt(3 * 3 - (warmingAt(RESPONSE, lat) * 1.5) ** 2);
    const m = memberNode(TEMPERATE, s, { mean: 1, swing: 0, wet: 0 }, lat, 0, 1.5, RESPONSE);
    expect(m.hot - TEMPERATE.hot).toBeCloseTo(left, 9);
    expect(m.cold - TEMPERATE.cold).toBeCloseTo(left, 9);
    const sw = memberNode(TEMPERATE, s, { mean: 0, swing: 1, wet: 0 }, lat, 0, 1.5, RESPONSE);
    expect(sw.hot - TEMPERATE.hot).toBe(2);
    expect(sw.cold - TEMPERATE.cold).toBe(-2);
    // And one of the aridity makes it wetter or drier, with the margin after it.
    const wet = memberNode(TEMPERATE, s, { mean: 0, swing: 0, wet: 1 }, lat, 0, 0, RESPONSE);
    expect(wet.aridity).toBeCloseTo(TEMPERATE.aridity * Math.exp(0.5), 9);
    expect(wet.hot).toBe(TEMPERATE.hot);
  });

  it('puts two things that say one number together by how sure each is', () => {
    expect(together({ mean: 10, sd: 2 }, { mean: 20, sd: 2 })).toEqual({ mean: 15, sd: Math.sqrt(2) });
    const t = together({ mean: 10, sd: 1 }, { mean: 20, sd: 3 })!;
    expect(t.mean).toBeCloseTo(11, 9);
    expect(t.sd).toBeLessThan(1);
    // One alone is itself.
    expect(together(undefined, { mean: 20, sd: 3 })).toEqual({ mean: 20, sd: 3 });
    expect(together({ mean: 10, sd: 1 }, undefined)).toEqual({ mean: 10, sd: 1 });
    expect(together(undefined, undefined)).toBeUndefined();
  });

  it('reckons a place\'s own share from what was found near: nothing found leaves what the members expect, and many finds outweigh it', () => {
    // Nothing found: the share is what the link expects, drawn over the places' own spread, and nothing is known more.
    const none = shareNear(0, 0, 0, 4);
    expect(none.mean).toBe(0);
    expect(none.var).toBe(4);
    expect(none.share).toBeCloseTo(0.5, 9);
    expect(shareOver(2, 0)).toBe(expit(2));
    // Over many places a share is nearer a half than at one place: the curve is flatter.
    expect(shareOver(2, 4)).toBeLessThan(expit(2));
    expect(shareOver(2, 4)).toBeGreaterThan(0.5);
    // Three of the first kind where an even share was expected: the place's own share is above a half, and surer.
    const some = shareNear(0, 3, 0, 4);
    expect(some.mean).toBeGreaterThan(0.5);
    expect(some.var).toBeLessThan(4);
    expect(some.share).toBeGreaterThan(0.7);
    // The other kind moves it the other way by as much.
    const other = shareNear(0, 0, 3, 4);
    expect(other.mean).toBeCloseTo(-some.mean, 6);
    expect(other.share).toBeCloseTo(1 - some.share, 6);
    // A thousand finds, a quarter of them the first kind: the share is theirs, whatever was expected.
    const many = shareNear(3, 250, 750, 4);
    expect(many.share).toBeCloseTo(0.25, 2);
    expect(many.mean).toBeCloseTo(Math.log(1 / 3) - 3, 1);
    expect(many.var).toBeLessThan(0.02);
    // With no spread of its own a place is what the link says, whatever was found.
    expect(shareNear(1, 50, 0, 0)).toEqual({ mean: 0, var: 0, share: expit(1) });
  });

  it('moves towards wet with coals and towards dry with salts, and leaves a place where they are found as expected', () => {
    // The link: the log of the odds of a coal among coals and salts rises by 3 for each unit of the log of the aridity.
    const link = { slope: 3, own: 9 };
    const sd = 0.6;
    const said = (more: number, less: number, expected = 0) => {
      const s = shareNear(expected, more, less, link.own);
      return errorFrom(sd, [{ ...link, mean: s.mean, var: s.var }]);
    };
    const coals = said(6, 0);
    const salts = said(0, 6);
    expect(coals.mean).toBeGreaterThan(0.1);
    expect(salts.mean).toBeCloseTo(-coals.mean, 6);
    expect(coals.sd).toBeLessThan(sd);
    // Found in the proportion the members expect, here three to one, the place stays where it was, and is surer.
    const asExpected = said(30, 10, Math.log(3));
    expect(Math.abs(asExpected.mean)).toBeLessThan(0.02);
    expect(asExpected.sd).toBeLessThan(sd);
    // More coals than expected is wetter than expected; fewer, drier.
    expect(said(38, 2, Math.log(3)).mean).toBeGreaterThan(0.05);
    expect(said(10, 30, Math.log(3)).mean).toBeLessThan(-0.05);
    // Nothing found says nothing.
    expect(said(0, 0)).toEqual({ mean: 0, sd });
    // The climate so moved: wetter, with the margin after it.
    const wetter = nudged(TEMPERATE, 0, coals.mean);
    expect(wetter.aridity).toBeGreaterThan(TEMPERATE.aridity);
    expect(wetter.hot).toBe(TEMPERATE.hot);
    expect(nudged(TEMPERATE, 1.5, 0).cold).toBe(TEMPERATE.cold + 1.5);
  });

  it('gives the climate only its part of what the beds say: none where the run could not err, all where nothing else moves them', () => {
    // The place's log odds are known to lie 2 above what was expected, almost surely.
    const known = { mean: 2, var: 1e-6 };
    // Where the run's error times the slope is all of a place's own spread, the distance is all climate: 2 over the slope.
    const all = errorFrom(0.5, [{ slope: 4, own: 4, ...known }]);
    expect(all.mean).toBeCloseTo(0.5, 3);
    expect(all.sd).toBeLessThan(0.01);
    // Where it is a quarter of the spread, a quarter of the way, and three quarters of the spread's square is left.
    const quarter = errorFrom(0.5, [{ slope: 4, own: 16, ...known }]);
    expect(quarter.mean).toBeCloseTo(0.125, 3);
    expect(toldOf(0.5, quarter.sd)).toBeCloseTo(0.25, 3);
    // A weak link says next to nothing however much was found: a reef of the warmth.
    const reef = errorFrom(2.5, [{ slope: 0.1, own: 2, ...known }]);
    expect(toldOf(2.5, reef.sd)).toBeLessThan(0.04);
    // Two kinds that tell of one thing each add what they know.
    const two = errorFrom(0.5, [
      { slope: 4, own: 16, ...known },
      { slope: 4, own: 16, ...known },
    ]);
    expect(two.sd).toBeLessThan(quarter.sd);
    // A run that could not err is not moved.
    expect(errorFrom(0, [{ slope: 4, own: 4, ...known }])).toEqual({ mean: 0, sd: 0 });
    // The tier: a quarter of the spread's square or more.
    expect(RESTS_FROM).toBe(0.25);
    expect(restsOnBeds(0.25)).toBe(true);
    expect(restsOnBeds(0.2)).toBe(false);
    expect(restsOnBeds(toldOf(2.5, reef.sd))).toBe(false);
    expect(toldOf(2, 2)).toBe(0);
    expect(toldOf(2, 0)).toBe(1);
  });

  it('takes a forest for a bound on the warmest month: the mean moves up and the spread narrows, the more the less likely trees were', () => {
    // A warmest month of 14 °C, give or take 3: trees are likely, and a forest says little.
    const likely = above(14, 3, 10, 1, 0.05);
    expect(likely.chance).toBeGreaterThan(0.85);
    expect(likely.mean - 14).toBeLessThan(0.6);
    expect(likely.mean).toBeGreaterThan(14);
    // One of 7 °C: trees were unlikely, and a forest moves it far towards the bound, and narrows it.
    const unlikely = above(7, 3, 10, 1, 0.05);
    expect(unlikely.chance).toBeLessThan(0.25);
    expect(unlikely.mean - 7).toBeGreaterThan(1.5);
    expect(unlikely.sd).toBeLessThan(3);
    expect(unlikely.mean - 7).toBeGreaterThan(likely.mean - 14);
    // The more often a forest is taken to say nothing, the less it moves.
    expect(above(7, 3, 10, 1, 0.5).mean).toBeLessThan(unlikely.mean);
    // Far above the bound it says nothing, and far below with no slip it carries the mean to the bound's side.
    expect(above(30, 3, 10, 1, 0.05).mean).toBeCloseTo(30, 6);
    expect(above(0, 3, 10, 0.5, 0).mean).toBeGreaterThan(7);
    // A number with no spread is not moved.
    expect(above(7, 0, 10, 0, 0.05)).toEqual({ mean: 7, sd: 0, chance: 0.05 });
  });

  it('scores predictions by the log of the chance given to what was found, and says how the chances held', () => {
    const s = scoreOf([
      { share: 0.9, was: true, w: 1 },
      { share: 0.9, was: true, w: 1 },
      { share: 0.1, was: false, w: 2 },
    ]);
    expect(s.n).toBe(4);
    expect(s.lpd).toBeCloseTo(Math.log(0.9), 3);
    expect(s.brier).toBeCloseTo(0.01, 6);
    expect(s.held[4]).toEqual({ n: 2, given: 0.9, were: 1 });
    expect(s.held[0]).toEqual({ n: 2, given: 0.1, were: 0 });
    // One sure and wrong is not endless.
    expect(scoreOf([{ share: 0, was: true, w: 1 }]).lpd).toBeCloseTo(Math.log(0.001), 3);
    expect(scoreOf([]).n).toBe(0);
  });

  it('keeps a chance, a spread and a count of beds each in a byte', () => {
    expect(byteChance(chanceByte(0.7))).toBeCloseTo(0.7, 2);
    expect(chanceByte(1.2)).toBe(255);
    expect(byteWarmSd(warmSdByte(3.14))).toBeCloseTo(3.1, 9);
    expect(byteWetSd(wetSdByte(0.673))).toBeCloseTo(0.67, 9);
    expect(findsByte(0)).toBe(0);
    expect(findsByte(1)).toBe(16);
    expect(byteFinds(findsByte(1000))).toBeGreaterThan(900);
    expect(byteFinds(findsByte(1000))).toBeLessThan(1100);
  });

  it('says a place\'s chances in words: the classes a member in twenty has, likeliest first', () => {
    const cs = [0.03, 0.1, 0, 0.27, 0.6, 0, 0, 0];
    expect(chanceWords(cs)).toEqual([
      { cls: 'temperate', chance: 0.6 },
      { cls: 'steppe', chance: 0.27 },
      { cls: 'savanna', chance: 0.1 },
    ]);
  });
});
