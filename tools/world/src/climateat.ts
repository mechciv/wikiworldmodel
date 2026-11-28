// The climate of the deep past with its spread at a place, asked of a build: `npm run world -- climate <lat> <lon>
// <time>`, and with nothing after it how the model held on what it did not see. The place is given as it is today, and
// carried on its plate to where it stood at the keyframe nearest the time, as the build carried the beds there
// (core/climatechance.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { climateClass, CLIMATE_LABEL, decodeNode, type ClimateClass, type ClimateHeader, type ClimateNode } from '../../../core/climate.ts';
import { band, byteChance, byteFinds, byteWarmSd, byteWetSd, chanceWords, monthSd, nodeOf, PAIR_WORDS, PAIRS, RESTS_FROM, restsOnBeds, type ChanceIndex, type ChanceKeyHeader, type HeldScores, type Pair, type Score, type Spreads } from '../../../core/climatechance.ts';
import { decodeTile } from '../../../core/container.ts';
import { fromMa, formatTime, toMa } from '../../../core/time.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { placesOf } from './rocksnear.ts';

const json = <T>(build: string, name: string): T => JSON.parse(readFileSync(join(build, name), 'utf8')) as T;

/** A build's index of the climate conditioned; undefined where the build has none. */
export function chanceIndexOf(build: string): ChanceIndex | undefined {
  const ts = json<Tileset>(build, 'tileset.json');
  return ts.files.climateChance ? json<ChanceIndex>(build, ts.files.climateChance) : undefined;
}

/** A keyframe of a build, read out of its file. */
export function chanceKeyOf(build: string, index: ChanceIndex, ageMa: number): { central: Uint8Array; spread: Uint8Array; chances: Uint8Array; found: Uint8Array; told: Uint8Array; plate: Uint16Array } {
  const ref = index.keyframes.find((k) => k.ageMa === ageMa);
  if (!ref) throw new Error(`no keyframe of ${ageMa} Ma in ${index.field}`);
  const b = readFileSync(join(build, ref.file));
  const { header, arrays } = decodeTile<ChanceKeyHeader>(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  return { central: arrays[header.central] as Uint8Array, spread: arrays[header.spread] as Uint8Array, chances: arrays[header.chances] as Uint8Array, found: arrays[header.found] as Uint8Array, told: arrays[header.told] as Uint8Array, plate: arrays[header.plate] as Uint16Array };
}

/** The run's own climate at a node of a keyframe, as the build's climate file keeps it; undefined where it keeps none. */
function runNodeOf(build: string, ageMa: number, node: number): ClimateNode | undefined {
  const ts = json<Tileset>(build, 'tileset.json');
  if (!ts.files.climate) return undefined;
  const b = readFileSync(join(build, ts.files.climate));
  const { header, arrays } = decodeTile<ClimateHeader>(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const k = header.keyframes.find((x) => x.ageMa === ageMa);
  if (!k) return undefined;
  const v = arrays[k.values] as Uint8Array;
  return decodeNode([v[node * 4] / 255, v[node * 4 + 1] / 255, v[node * 4 + 2] / 255, v[node * 4 + 3] / 255]);
}

export interface ChancePlace {
  index: ChanceIndex;
  keyframe: ChanceIndex['keyframes'][number];
  /** where the place stood at the keyframe */
  at: [number, number];
  central: ClimateNode;
  spreads: Spreads;
  /** the chance of each class, in the index's order */
  chances: number[];
  /** the beds found near, for each pair its `more` kind and its `less`, each counted by how near it lies */
  found: Record<Pair, [number, number]>;
  /** how much of the square of the spread what was found took away: of the warmth, and of the aridity */
  told: { warm: number; wet: number };
  /** the run's own climate there, and its class */
  run?: ClimateNode;
  runClass?: ClimateClass;
}

/** The climate a build has at a place of today at a time; undefined where it has none, or no plate carries the place there. */
export function chanceOfBuild(build: string, lat: number, lon: number, t: number): ChancePlace | undefined {
  const index = chanceIndexOf(build);
  if (!index?.keyframes.length) return undefined;
  const ageMa = toMa(t);
  const keyframe = index.keyframes.reduce((best, k) => (Math.abs(k.ageMa - ageMa) < Math.abs(best.ageMa - ageMa) ? k : best));
  const at = placesOf(build)(lat, lon, fromMa(keyframe.ageMa));
  if (!at) return undefined;
  const key = chanceKeyOf(build, index, keyframe.ageMa);
  const n = nodeOf(index.grid, at[0], at[1]);
  const chances = Array.from(key.chances.subarray(n * index.classes.length, (n + 1) * index.classes.length), byteChance);
  if (!chances.some((c) => c > 0)) return undefined;
  const central = decodeNode([key.central[n * 4] / 255, key.central[n * 4 + 1] / 255, key.central[n * 4 + 2] / 255, key.central[n * 4 + 3] / 255]);
  const run = runNodeOf(build, keyframe.ageMa, n);
  return {
    index,
    keyframe,
    at,
    central,
    spreads: { warm: byteWarmSd(key.spread[n * 2]), swing: index.rule.error.swing_sd, wet: byteWetSd(key.spread[n * 2 + 1]) },
    chances,
    found: Object.fromEntries(PAIRS.map((pair, i) => [pair, [byteFinds(key.found[n * PAIRS.length * 2 + i * 2]), byteFinds(key.found[n * PAIRS.length * 2 + i * 2 + 1])]])) as Record<Pair, [number, number]>,
    told: { warm: byteChance(key.told[n * 2]), wet: byteChance(key.told[n * 2 + 1]) },
    ...(run ? { run, runClass: climateClass(run, index.thresholds) } : {}),
  };
}

const count = (n: number) => (n < 0.05 ? 'none' : n < 10 ? n.toFixed(1) : String(Math.round(n)));
const deg = (x: number) => x.toFixed(1);
/** How much narrower a band is once a share of the square of its spread is taken away. */
const narrowed = (told: number) => `${Math.round((1 - Math.sqrt(Math.max(0, 1 - told))) * 100)}%`;

/** What a build has at a place, as lines a person can read. */
export function chanceText(c: ChancePlace): string {
  const k = c.keyframe;
  const w = k.warmth;
  const hot = band(c.central.hot, monthSd(c.spreads));
  const cold = band(c.central.cold, monthSd(c.spreads));
  const mean = band((c.central.hot + c.central.cold) / 2, c.spreads.warm);
  const wet = Math.exp(1.6449 * c.spreads.wet);
  const told = Math.max(c.told.warm, c.told.wet);
  return [
    `the keyframe of ${k.ageMa} Ma (beds of ${formatTime(fromMa(k.olderMa))} to ${formatTime(fromMa(k.youngerMa))}); the place stood at ${c.at[0].toFixed(2)}, ${c.at[1].toFixed(2)}`,
    `the Earth's mean warmth: ${deg(w.mean)} ± ${deg(w.sd)} °C${w.prior ? `; the energy balance on the CO₂, brought to the curve's level, ${deg(w.prior.mean)} ± ${deg(w.prior.sd)}` : '; the world has no CO₂ for this time'}${w.seen ? `; the rocks' curve ${deg(w.seen.mean)} ± ${deg(w.seen.sd)}` : ''}${w.forests ? `; ${w.forests.n} fossil forest${w.forests.n === 1 ? '' : 's'} moved it from ${deg(w.forests.mean)} ± ${deg(w.forests.sd)}` : ''}; the run's own ${deg(w.run)}`,
    c.run ? `the run:   ${CLIMATE_LABEL[c.runClass!]}; warmest month ${deg(c.run.hot)} °C, coldest ${deg(c.run.cold)}, aridity ${c.run.aridity.toFixed(2)}` : 'the run has no climate here',
    `the model: ${chanceWords(c.chances, c.index.classes).map((x) => `${CLIMATE_LABEL[x.cls]} ${Math.round(x.chance * 100)}%`).join('; ')}`,
    `  nine members in ten have the warmest month between ${deg(hot[0])} and ${deg(hot[1])} °C, the coldest between ${deg(cold[0])} and ${deg(cold[1])}, the year's mean between ${deg(mean[0])} and ${deg(mean[1])}; the aridity ${c.central.aridity.toFixed(2)}, give or take ${wet.toFixed(1)} times`,
    `found near, each counted by how near it lies: ${PAIRS.map((pair) => `${PAIR_WORDS[pair].more} ${k.pairs[pair].told ? count(c.found[pair][0]) : 'not read here'}, ${PAIR_WORDS[pair].less} ${k.pairs[pair].told ? count(c.found[pair][1]) : 'not read here'}`).join('; ')}`,
    restsOnBeds(told)
      ? `what was found has narrowed the band of its warmth by ${narrowed(c.told.warm)} and of its aridity by ${narrowed(c.told.wet)}: the climate here rests on it`
      : `what was found has narrowed the band of its warmth by ${narrowed(c.told.warm)} and of its aridity by ${narrowed(c.told.wet)}, less than the ${narrowed(RESTS_FROM)} at which the climate is said to rest on it: it is the run's, moved`,
  ].join('\n');
}

/** How a build's model held on what it did not see, as lines a person can read. */
export function chanceScoresText(index: ChanceIndex): string {
  const row = (label: string, s: Score) => `  ${label.padEnd(40)} ${String(s.lpd).padStart(8)}  ${String(s.brier).padStart(7)}   ${s.held.map((b) => (b.n ? `${b.given.toFixed(2)}→${b.were.toFixed(2)}` : '    –    ')).join('  ')}  (${s.n.toLocaleString('en-US')})`;
  const held = (name: string, h: HeldScores) => [row(`${name}, its node held out`, h.node), row(`${name}, its tile`, h.tile), row(`${name}, its block`, h.block), row(`${name}, its era`, h.span)];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const r = index.rule;
  const e = r.error;
  const lines = [
    `${index.title} (${index.field}): ${index.keyframes.length} keyframes`,
    `read across the runs: for each degree of the Earth's mean warmth the land warms by ${r.response.warm[0]} at the equator and ${r.response.warm.at(-1)} at the poles, and the log of its aridity moves by ${Math.min(...r.response.wet)} at the most`,
    `read at the present: the run's year's mean is out by ${e.mean_bias} °C on average and ${e.mean_sd} as a root mean square, its season's swing by ${e.swing_bias} and ${e.swing_sd}, the log of its aridity by ${e.wet_bias} and ${e.wet_sd}; its errors go together over ${e.warm_km} km for the warmth and ${e.wet_km} km for the aridity`,
    `the Earth's mean warmth: the energy balance lies ${index.warmth.bias} °C from the rocks' curve on average over ${index.warmth.keyframes} keyframes; with an era held out it tells the curve to ${index.warmth.balance} °C as it is, to ${index.warmth.shifted} brought to the curve's level by the other eras, and the mean of the other eras tells it to ${index.warmth.baseline}; its own error is taken as ${r.balance_sd} °C`,
    '',
    `what a bed held out is predicted to be: the mean log of the chance given to its kind (0 is sure and right, ${Math.log(0.5).toFixed(2)} a coin), the mean squared miss, and of those given a chance of being the first kind in each fifth, the share that were`,
  ];
  for (const pair of PAIRS) {
    const l = r.links[pair];
    const s = index.scores[pair];
    const read = index.keyframes.filter((k) => k.pairs[pair].told);
    lines.push(
      `${PAIR_WORDS[pair].more} against ${PAIR_WORDS[pair].less}: read at ${read.length} keyframes; the log of the odds moves by ${l.slope} for each ${pair === 'wet' ? 'unit of the log of the aridity' : 'degree of the year\'s mean'}, and a place's own varies by ${Math.sqrt(l.own).toFixed(2)} about that; the run's error could explain ${pct(Math.min(1, (l.slope * l.slope * (pair === 'wet' ? e.wet_sd : e.mean_sd) ** 2) / l.own))} of it`,
      ...held('the model', s.model),
      ...held('no causes', s.smoother),
      row('the members alone, nothing found', s.alone),
    );
  }
  if (index.columns) {
    const c = index.columns;
    lines.push(
      '',
      `the columns of rock, which it does not read: ${c.dry.toLocaleString('en-US')} units with salt and ${c.wet.toLocaleString('en-US')} with coal being laid down at a keyframe`,
      `  of every pair of one of each at a keyframe, the salt lies where the land is drier in ${pct(c.ordered.model)} by the model, ${pct(c.ordered.run)} by the run`,
      `  units with salt on arid ground: ${pct(c.sides.model.dry)} by the model, ${pct(c.sides.run.dry)} by the run; units with coal on ground that is not: ${pct(c.sides.model.wet)} and ${pct(c.sides.run.wet)}`,
    );
  }
  if (index.forests?.length) {
    const f = index.forests;
    lines.push('', `the fossil forests, each told with itself held out: a climate that bears trees is given ${pct(f.reduce((s, x) => s + x.trees, 0) / f.length)} on average, and ${pct(f.reduce((s, x) => s + x.read, 0) / f.length)} once read; the run's class bears trees at ${f.filter((x) => x.runTrees).length} of ${f.length}`);
    for (const x of f) lines.push(`  ${x.id.padEnd(46)} ${String(x.ageMa).padStart(8)} Ma  the run: ${(x.run ?? 'none').padEnd(10)}  held out ${pct(x.trees).padStart(4)}  read ${pct(x.read).padStart(4)}`);
  }
  if (index.present) {
    const p = index.present;
    lines.push(
      '',
      `held to the present, where the climate is measured (${p.nodes.toLocaleString('en-US')} land nodes, each block's spread told from the other blocks):`,
      `  the measured warmest month lies in the band nine members in ten do at ${pct(p.within.hot)} of the land, the coldest at ${pct(p.within.cold)}, the aridity at ${pct(p.within.aridity)}`,
      `  the measured class is given ${p.lpd.spread} (log of its chance, on average) by the run with its spread, ${p.lpd.point} by the run's class as a point, ${p.lpd.beds} with the beds of its span read, ${p.lpd.model} by the model with the warmth of its span too`,
      `  the likeliest class is the measured one on ${pct(p.same.run)} of the land by the run, ${pct(p.same.beds)} with the beds, ${pct(p.same.model)} by the model; root mean squares, the run, with the beds, and the model: warmest month ${p.rms.hot.join(', ')} °C, coldest ${p.rms.cold.join(', ')}, log of the aridity ${p.rms.wet.join(', ')}`,
    );
  }
  const g = index.globe;
  lines.push('', `over all keyframes: what was found has narrowed a band by ${narrowed(RESTS_FROM)} or more, a quarter of the square of its spread, on ${(g.reached * 100).toFixed(1)}% of the land; the likeliest class is not the run's on ${(g.changed * 100).toFixed(1)}%; the likeliest class has a chance of ${pct(g.sure)} on average`);
  lines.push('', 'through time, beds held out with their tile: the mean log chance by the model, by the smoother with no causes and by the members alone; and the columns\' pairs ordered by the run and by the model:');
  for (const t of index.through) {
    const parts = PAIRS.filter((pair) => t.pairs[pair].more + t.pairs[pair].less > 0).map((pair) => `${pair} ${t.pairs[pair].model} / ${t.pairs[pair].smoother} / ${t.pairs[pair].alone} (${t.pairs[pair].more}:${t.pairs[pair].less})`);
    lines.push(`  ${`${t.olderMa}–${t.youngerMa} Ma`.padEnd(14)} ${parts.join('; ') || 'no pair read'}${t.columns && t.columns.dry && t.columns.wet ? `; columns ${pct(t.columns.run)} → ${pct(t.columns.model)} (${t.columns.dry} salt, ${t.columns.wet} coal)` : ''}; reached ${(t.reached * 100).toFixed(1)}% of the land`);
  }
  return lines.join('\n');
}
