// How likely the sea was at a place, asked of a build: `npm run world -- coast <lat> <lon> <time>`, and with nothing
// after it how the model held on what it did not see. The place is given as it is today, and carried on its plate to
// where it stood at the keyframe nearest the time, as the build carried the fossil collections there (core/coast.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BAND, byteChance, byteFinds, chanceWords, memberLevel, nodeOf, restsOnFinds, type CoastIndex, type CoastKeyHeader, type HeldScores, type SeaScore } from '../../../core/coast.ts';
import { decodeTile } from '../../../core/container.ts';
import { fromMa, formatTime, toMa } from '../../../core/time.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { placesOf } from './rocksnear.ts';

const json = <T>(build: string, name: string): T => JSON.parse(readFileSync(join(build, name), 'utf8')) as T;

/** A build's index of the sea's chance; undefined where the build has none. */
export function coastIndexOf(build: string): CoastIndex | undefined {
  const ts = json<Tileset>(build, 'tileset.json');
  return ts.files.coast ? json<CoastIndex>(build, ts.files.coast) : undefined;
}

/** A keyframe of a build, read out of its file: the chance of sea and what was found near each node. */
export function coastKeyOf(build: string, index: CoastIndex, ageMa: number): { chance: Uint8Array; marine: Uint8Array; land: Uint8Array; plate: Uint16Array } {
  const ref = index.keyframes.find((k) => k.ageMa === ageMa);
  if (!ref) throw new Error(`no keyframe of ${ageMa} Ma in ${index.field}`);
  const b = readFileSync(join(build, ref.file));
  const { header, arrays } = decodeTile<CoastKeyHeader>(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  return { chance: arrays[header.chance] as Uint8Array, marine: arrays[header.marine] as Uint8Array, land: arrays[header.land] as Uint8Array, plate: arrays[header.plate] as Uint16Array };
}

export interface CoastAt {
  index: CoastIndex;
  keyframe: CoastIndex['keyframes'][number];
  /** where the place stood at the keyframe */
  at: [number, number];
  chance: number;
  /** the marine and the land localities found near, each counted by how near it lies */
  marine: number;
  land: number;
  /** whether the finds near weigh more than the field's expectation */
  rests: boolean;
}

/** The chance of sea a build has at a place of today at a time; undefined where it has none, or no plate carries the place there. */
export function coastOfBuild(build: string, lat: number, lon: number, t: number): CoastAt | undefined {
  const index = coastIndexOf(build);
  if (!index?.keyframes.length) return undefined;
  const ageMa = toMa(t);
  const keyframe = index.keyframes.reduce((best, k) => (Math.abs(k.ageMa - ageMa) < Math.abs(best.ageMa - ageMa) ? k : best));
  const at = placesOf(build)(lat, lon, fromMa(keyframe.ageMa));
  if (!at) return undefined;
  const key = coastKeyOf(build, index, keyframe.ageMa);
  const n = nodeOf(index.grid, at[0], at[1]);
  const marine = byteFinds(key.marine[n]);
  const land = byteFinds(key.land[n]);
  return { index, keyframe, at, chance: byteChance(key.chance[n]), marine, land, rests: restsOnFinds(marine, land, index.rule) };
}

/** What a build has at a place, as lines a person can read. */
export function coastText(c: CoastAt): string {
  const k = c.keyframe;
  const found = (n: number) => (n < 0.05 ? 'none' : n < 10 ? n.toFixed(1) : String(Math.round(n)));
  const members = Array.from({ length: 16 }, (_, m) => (c.chance > memberLevel(m) ? 1 : 0)).reduce((a: number, b) => a + b, 0);
  return [
    `the keyframe of ${k.ageMa} Ma (localities of ${formatTime(fromMa(k.olderMa))} to ${formatTime(fromMa(k.youngerMa))}); the place stood at ${c.at[0].toFixed(2)}, ${c.at[1].toFixed(2)}`,
    `${chanceWords(c.chance)}: sea in ${members} of 16 members of the world`,
    `found within about ${Math.round(c.index.rule.kernel_km * 3)} km, each counted by how near it lies: marine ${found(c.marine)}, land ${found(c.land)}`,
    c.rests ? 'the finds weigh more than the map here: its land and sea rest on the rocks' : `the finds weigh less than the map here (which counts for ${c.index.rule.strength} of a locality): the chance is mostly the map's`,
    `${k.told ? `at this keyframe the sea leaves ${k.yield} localities for each one the land leaves` : `at this keyframe the land left too few localities to tell how many the sea leaves for each of its own: the nearest keyframe's that could, ${k.yield}, is used`}; ${k.localities[0]} marine and ${k.localities[1]} land localities in all, by weight`,
  ].join('\n');
}

/** How a build's model held on localities it did not see, as lines a person can read. */
export function coastScoresText(index: CoastIndex): string {
  const row = (label: string, s: SeaScore) => `  ${label.padEnd(34)} ${String(s.lpd).padStart(8)}  ${String(s.brier).padStart(7)}   ${s.held.map((b) => `${b.given.toFixed(2)}→${b.were.toFixed(2)}`).join('  ')}`;
  const held = (name: string, h: HeldScores) => [row(`${name}, its node held out`, h.node), row(`${name}, its tile`, h.tile), row(`${name}, its block`, h.block), row(`${name}, its keyframe`, h.span)];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const r = index.rule;
  const untold = index.keyframes.filter((k) => !k.told).map((k) => k.ageMa);
  const lines = [
    `${index.title} (${index.field}): ${index.keyframes.length} keyframes, ${Math.round(index.keyframes.reduce((n, k) => n + k.localities[0] + k.localities[1], 0)).toLocaleString('en-US')} localities by weight`,
    ...(untold.length ? [`fitted and scored on ${index.keyframes.length - untold.length} keyframes: the ${untold.length} of ${Math.min(...untold)} to ${Math.max(...untold)} Ma have fewer than ${r.yield_land_min} land localities to set the sea's against, and take the nearest keyframe's yield`] : []),
    `fitted: the odds of sea fall by ${r.slope_in} a degree inland of the field's coast and rise by ${r.slope_off} offshore, as logs, to ${r.cap}; the field counts for ${r.strength} of a locality; the finds' bell is ${r.kernel_km} km wide (tried: ${index.tried.map((t) => `${t.km} km ${t.lpd}`).join(', ')})`,
    '',
    `what a locality held out is predicted to be: the mean log of the chance given to its kind (0 is sure and right, ${Math.log(0.5).toFixed(2)} a coin), the mean squared miss, and of those given a chance of being marine in each fifth, the share that were`,
    ...held('the model', index.scores.model),
    ...held('no causes', index.scores.smoother),
    row('the field read softly, no finds', index.scores.field.soft),
    row('the field read as sure', index.scores.field.sure),
    '',
    `which side of the coast localities lie on (${index.sides.localities.marine.toLocaleString('en-US')} marine, ${index.sides.localities.land.toLocaleString('en-US')} land, by weight):`,
    `  the field's coast                  marine in its sea ${pct(index.sides.field.marine_in_sea)}, land on its land ${pct(index.sides.field.land_on_land)}`,
    `  the model, their node held out     ${pct(index.sides.node.marine_in_sea)}, ${pct(index.sides.node.land_on_land)}`,
    `  the model, their tile held out     ${pct(index.sides.tile.marine_in_sea)}, ${pct(index.sides.tile.land_on_land)}`,
    `  the model, their block held out    ${pct(index.sides.block.marine_in_sea)}, ${pct(index.sides.block.land_on_land)}`,
    `  the model, nothing held out        ${pct(index.sides.all.marine_in_sea)}, ${pct(index.sides.all.land_on_land)}`,
  ];
  if (index.columns) {
    const c = index.columns;
    lines.push(
      '',
      'the columns of rock, which it does not read, at each keyframe:',
      `  a unit laid down under the sea (${c.sea.n.toLocaleString('en-US')}): in the field's sea ${pct(c.sea.field)}, on the model's likelier side ${pct(c.sea.model)}; its mean chance of sea ${c.sea.chance}`,
      `  a unit laid down on land (${c.land.n.toLocaleString('en-US')}): on the field's land ${pct(c.land.field)}, on the model's likelier side ${pct(c.land.model)}; its mean chance of sea ${c.land.chance}`,
      `  both kinds: the field right ${pct(c.right.field)}, the model ${pct(c.right.model)}; where a column has a gap (${c.gap.n.toLocaleString('en-US')}), the field has sea ${pct(c.gap.field_sea)} of the time and the model's mean chance is ${c.gap.chance}`,
    );
  }
  const g = index.globe;
  lines.push('', `over all keyframes: the finds outweigh the field on ${(g.reached * 100).toFixed(1)}% of the globe; ${(g.changed * 100).toFixed(1)}% changes side, ${pct(g.to_sea)} of it to sea; ${(g.band * 100).toFixed(1)}% has a chance between ${BAND[0]} and ${BAND[1]}`);
  lines.push('', "through time, localities with their own node held out and the columns' units: the share on the side their kind is of, by the field's coast and by the model:");
  for (const t of index.through) {
    const c = t.columns;
    lines.push(
      `  ${`${t.olderMa}–${t.youngerMa} Ma${t.told ? '' : ' (no yield told)'}`.padEnd(30)} marine localities ${pct(t.field.marine_in_sea)} → ${pct(t.node.marine_in_sea)} (${t.localities.marine.toLocaleString('en-US')}), land ${pct(t.field.land_on_land)} → ${pct(t.node.land_on_land)} (${t.localities.land.toLocaleString('en-US')})${c ? `; units of the sea ${pct(c.sea.field)} → ${pct(c.sea.model)} (${c.sea.n.toLocaleString('en-US')}), of the land ${pct(c.land.field)} → ${pct(c.land.model)} (${c.land.n.toLocaleString('en-US')}), both ${pct(c.right.field)} → ${pct(c.right.model)}` : ''}`,
    );
  }
  const now = index.keyframes.find((k) => k.ageMa === 0);
  if (now) lines.push('', `held to the present, where the coast is measured: the model has ${(now.to_sea * 100).toFixed(1)}% of the globe likelier sea that is land, and ${(now.to_land * 100).toFixed(1)}% likelier land that is sea`);
  const most = [...index.keyframes].sort((a, b) => b.to_sea + b.to_land - (a.to_sea + a.to_land)).slice(0, 6);
  const share = (x: number) => `${(x * 100).toFixed(1)}%`;
  lines.push(
    'the keyframes where most of the globe changes side:',
    ...most.map((k) => `  ${String(k.ageMa).padStart(4)} Ma: ${share(k.to_sea)} of the globe from the field's land to sea, ${share(k.to_land)} from its sea to land; its land is ${share(k.land)} of the globe, the model's ${share(k.land - k.to_sea + k.to_land)}; the finds outweigh the field on ${share(k.reached)}`),
  );
  return lines.join('\n');
}
