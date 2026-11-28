// The sea's level and the height of the land at a place, asked of a build: `npm run world -- heights <lat> <lon>
// <time>`, and with nothing after it how the two held on what they were not shown. The place is given as it is today,
// and carried on its plate to where it stood at the keyframe nearest the time, as the build carried the beds there
// (core/heights.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { byteChance, memberLevel, nodeOf, type SeaScore } from '../../../core/coast.ts';
import { decodeTile } from '../../../core/container.ts';
import { byteSd, heightOf, heightWords, RESTS, type HeightKeyHeader, type HeightsIndex, type KindHeld, type ShoreHeld } from '../../../core/heights.ts';
import { MEMBERS } from '../../../core/samples.ts';
import { fromMa, formatTime, toMa } from '../../../core/time.ts';
import type { Tileset } from '../../../core/tileset.ts';
import { placesOf } from './rocksnear.ts';

const json = <T>(build: string, name: string): T => JSON.parse(readFileSync(join(build, name), 'utf8')) as T;

/** A build's index of the level and the heights; undefined where the build has none. */
export function heightsIndexOf(build: string): HeightsIndex | undefined {
  const ts = json<Tileset>(build, 'tileset.json');
  return ts.files.heights ? json<HeightsIndex>(build, ts.files.heights) : undefined;
}

/** A keyframe of a build, read out of its file. */
export function heightsKeyOf(build: string, index: HeightsIndex, ageMa: number): { map: Int16Array; mean: Int16Array; sd: Uint8Array; chance: Uint8Array; rests: Uint8Array } {
  const ref = index.keyframes.find((k) => k.ageMa === ageMa);
  if (!ref) throw new Error(`no keyframe of ${ageMa} Ma in ${index.field}`);
  const b = readFileSync(join(build, ref.file));
  const { header, arrays } = decodeTile<HeightKeyHeader>(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  return { map: arrays[header.map] as Int16Array, mean: arrays[header.mean] as Int16Array, sd: arrays[header.sd] as Uint8Array, chance: arrays[header.chance] as Uint8Array, rests: arrays[header.rests] as Uint8Array };
}

export interface HeightsAt {
  index: HeightsIndex;
  keyframe: HeightsIndex['keyframes'][number];
  /** where the place stood at the keyframe */
  at: [number, number];
  /** the map's own height above its coast there */
  map: number;
  /** the height above the level: the middle, the band, and the chance it lay below */
  middle: number;
  lo: number;
  hi: number;
  chance: number;
  /** what it rests on besides the map, as bits (core/heights.ts, RESTS) */
  rests: number;
}

/** The height a build has at a place of today at a time; undefined where it has none, or no plate carries the place there. */
export function heightsOfBuild(build: string, lat: number, lon: number, t: number): HeightsAt | undefined {
  const index = heightsIndexOf(build);
  if (!index?.keyframes.length) return undefined;
  const ageMa = toMa(t);
  const keyframe = index.keyframes.reduce((best, k) => (Math.abs(k.ageMa - ageMa) < Math.abs(best.ageMa - ageMa) ? k : best));
  const at = placesOf(build)(lat, lon, fromMa(keyframe.ageMa));
  if (!at) return undefined;
  const key = heightsKeyOf(build, index, keyframe.ageMa);
  const n = nodeOf(index.grid, at[0], at[1]);
  const h = heightOf({ mean: key.mean[n], sd: byteSd(key.sd[n]) }, byteChance(key.chance[n]));
  return { index, keyframe, at, map: key.map[n], middle: h.middle, lo: h.lo, hi: h.hi, chance: h.chance, rests: key.rests[n] };
}

const metres = (m: number) => (m < 0 ? `${Math.round(-m).toLocaleString('en-US')} m below` : `${Math.round(m).toLocaleString('en-US')} m above`);

/** What a height rests on, in words. */
export function restsWords(rests: number): string {
  const on: string[] = [];
  if (rests & RESTS.range) on.push("a range's record, which says it stood at about today's height by then");
  if (rests & RESTS.shore) on.push('beds laid down at the shore near, which say where the level was');
  if (rests & RESTS.kinds) on.push('the kinds of beds found near, of the sea and of the land');
  return on.length ? on.join('; and ') : 'the map alone: nothing found near outweighs it, and no range speaks for it';
}

/** What a build has at a place, as lines a person can read. */
export function heightsText(h: HeightsAt): string {
  const k = h.keyframe;
  const members = Array.from({ length: MEMBERS }, (_, m) => (h.chance > memberLevel(m) ? 1 : 0)).reduce((a: number, b) => a + b, 0);
  return [
    `the keyframe of ${k.ageMa} Ma (beds of ${formatTime(fromMa(k.olderMa))} to ${formatTime(fromMa(k.youngerMa))}); the place stood at ${h.at[0].toFixed(2)}, ${h.at[1].toFixed(2)}`,
    `the sea's level then: ${metres(k.level)} the map's coast, between ${metres(k.lo)} and ${metres(k.hi)} in nine chances of ten, read as if the old shore stood at today's sea on ground that has not moved; ${k.told ? `told by the keyframe's own shore beds, which count for ${Math.round(k.read)}` : "not told by the keyframe's own shore beds, and carried from the keyframes either side"}`,
    `  the map follows today's low ground by ${k.follow.toFixed(2)} there, and the middle shore bed found stands ${Math.round(k.stands)} m above today's sea: if the old shore stands as high, the level is ${metres(k.with_stands)} the map's coast`,
    `the map has this ground ${metres(h.map)} its coast`,
    `the height: ${heightWords(h.middle, h.lo, h.hi)}; ${Math.round(h.chance * 100)}% for the sea, and below the level in ${members} of ${MEMBERS} members of the world`,
    `it rests on ${restsWords(h.rests)}`,
  ].join('\n');
}

/** How a build's level and heights held on what they were not shown, as lines a person can read. */
export function heightsScoresText(index: HeightsIndex): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const kind = (label: string, s: SeaScore) => `  ${label.padEnd(44)} ${String(s.lpd).padStart(8)}  ${String(s.brier).padStart(7)}   ${s.held.map((b) => `${b.given.toFixed(2)}→${b.were.toFixed(2)}`).join('  ')}`;
  const kinds = (name: string, h: KindHeld) => [kind(`${name}, its node held out`, h.node), kind(`${name}, its tile`, h.tile), kind(`${name}, its block`, h.block), kind(`${name}, its keyframe`, h.span)];
  const shore = (label: string, s: ShoreHeld | undefined) => (s ? [`  ${label.padEnd(44)} ${String(s.tile.mean).padStart(5)} / ${String(s.tile.middle).padEnd(5)} ${String(s.block.mean).padStart(5)} / ${String(s.block.middle).padEnd(5)} ${String(s.span.mean).padStart(5)} / ${String(s.span.middle).padEnd(5)}`] : []);
  const r = index.rule;
  const s = index.scores;
  const told = index.keyframes.filter((k) => k.told);
  const untold = index.keyframes.filter((k) => !k.told).map((k) => k.ageMa);
  const now = index.present;
  const lines = [
    `${index.level.title} (${index.level.field}) and ${index.title.toLowerCase()} (${index.field}): ${index.keyframes.length} keyframes, ${(index.sides.localities.marine + index.sides.localities.land).toLocaleString('en-US')} beds by weight`,
    `the level is told by their own shore beds at ${told.length} keyframes${untold.length ? `; at ${untold.length}, ${Math.min(...untold)} to ${Math.max(...untold)} Ma, they are too few or lie in a sea the map draws at a depth of convention, and the level is carried from the keyframes either side` : ''}`,
    `fitted: the level keeps ${r.hold} of itself from one keyframe to the next and strays ${r.stray_m} m from the map's coast; the map's word counts for ${r.strength} of a bed beside the kinds found near on ground of like height, and for whatever those fall short of ${r.least_beds === 1 ? 'a bed' : `${r.least_beds} beds`}; a shore bed counts for less in the level by a factor of e for each ${r.near_m} m its ground stands above today's sea`,
    `the map misses today's ground by ${r.now_m} m on low ground, ${pct(r.now_high)} of the height on high ground and ${pct(r.now_deep)} of the depth of the deep sea, as bells that hold nine misses in ten; it misses the ranges that stood by ${pct(r.ranges_high)} of their height; a bed of the present misses its own node by ${r.bed_m} m`,
    '',
    "the level through time, against the map's coast, in metres, read as if the old shore stood at today's sea on unmoved ground (a star where the keyframe's own beds did not tell it); how far the map follows today's low ground, and how far above its coast it has ground that stands at today's sea; where the middle shore bed found stands today, and the level if the old shore stands as high:",
    ...[...index.keyframes]
      .filter((k) => k.ageMa % 10 === 0 || k.ageMa <= 70)
      .map((k) => {
        const other = index.rival?.at.find((x) => x.ageMa === k.ageMa);
        return `  ${String(k.ageMa).padStart(4)} Ma${k.told ? ' ' : '*'} ${String(k.level).padStart(5)}  [${String(k.lo).padStart(5)}, ${String(k.hi).padStart(4)}]  follows ${k.follow.toFixed(2)}  raised ${String(k.raised).padStart(4)}  the middle bed at ${String(k.stands).padStart(5)} m: ${String(k.with_stands).padStart(5)}${other ? `   ${index.rival!.title.toLowerCase()} ${String(other.value).padStart(4)}: the level would be ${String(other.level).padStart(4)}, and ${pct(other.below).padStart(4)} of the shore beds found stand below it today` : ''}`;
      }),
    '',
    'where the map puts a shore bed held out, each counted as the level counts it, in metres from where it is told to (the mean miss / the middle miss), with its tile, its block and its keyframe held out:',
    ...shore("the level, with the map's following of today's ground", s.shore.level),
    ...shore("the map's own coast", s.shore.map),
    ...shore('the shore beds near, with no level', s.shore.smoother),
    `of ${s.level_band.n} keyframes held out whole, the level their own beds give lies in the band told from the others at ${pct(s.level_band.inside)}`,
    '',
    `what a locality held out is told to be: the mean log of the chance given to its kind (0 is sure and right, ${Math.log(0.5).toFixed(2)} a coin), the mean squared miss, and of those given a chance of being marine in each fifth, the share that were`,
    ...kinds('the height above the level', s.kinds.height),
    ...kinds("the distance from the map's coast", s.kinds.distance),
    ...kinds('both read together', s.kinds.both),
    ...kinds('no causes', s.kinds.smoother),
    kind('the map alone: height above the level', s.alone.height),
    kind("the map alone: height above its own coast", s.alone.no_level),
    kind('the map alone: distance from its coast', s.alone.distance),
    kind('the map alone: both', s.alone.both),
    '',
    `which side of the level localities lie on (${index.sides.localities.marine.toLocaleString('en-US')} marine, ${index.sides.localities.land.toLocaleString('en-US')} land, by weight):`,
    `  the map's coast                     marine below it ${pct(index.sides.map.marine_below)}, land above it ${pct(index.sides.map.land_above)}`,
    `  the height, their node held out     ${pct(index.sides.node.marine_below)}, ${pct(index.sides.node.land_above)}`,
    `  the height, their tile held out     ${pct(index.sides.tile.marine_below)}, ${pct(index.sides.tile.land_above)}`,
    `  the height, their block held out    ${pct(index.sides.block.marine_below)}, ${pct(index.sides.block.land_above)}`,
    `  the height, nothing held out        ${pct(index.sides.all.marine_below)}, ${pct(index.sides.all.land_above)}`,
    '',
    'a shore bed held out: the middle of how far from the level the map has it and the height has it, in metres, and how often the level lies in the height\'s band:',
    ...(['node', 'tile', 'block'] as const).map((h) => `  its ${h} held out (${s.shore_height[h].n.toLocaleString('en-US')} beds)`.padEnd(40) + ` the map ${s.shore_height[h].map}, the height ${s.shore_height[h].height}; inside ${pct(s.shore_height[h].inside)}`),
    '',
    "the ranges whose records say when they stood: today's height of their ground at a degree's grain, how far from it the map (less the level) and the height are on average, and with the range's own record left out how often today's height lies in the map's band:",
    ...index.ranges.map((x) => `  ${x.label.padEnd(40)} stood by ${String(x.standingMa).padStart(5)} Ma; today ${String(x.today).padStart(5)} m; the map ${String(x.map.abs).padStart(5)} m off, the height ${String(x.height.abs).padStart(4)} m; without its record ${x.without.inside === undefined ? 'not scored: it stood only at the present keyframe' : `inside ${pct(x.without.inside)}`}`),
    '',
    `held to the present, where the ground is surveyed: its own beds put the level at ${now.level} m [${now.lo}, ${now.hi}] against the map's coast, where it is nothing`,
    `  land today that lies below the level: ${(now.height.to_sea * 100).toFixed(1)}% of the globe by the height, ${(now.map.to_sea * 100).toFixed(1)}% by the map; sea today that lies above it: ${(now.height.to_land * 100).toFixed(1)}%, ${(now.map.to_land * 100).toFixed(1)}%`,
    `  over today's land the height is ${now.miss.height} m from today's ground on average, the map ${now.miss.map} m; today's height lies in the band at ${pct(now.inside)} of nodes`,
    '',
    `over all keyframes: something besides the map is read on ${(index.globe.reached * 100).toFixed(1)}% of the globe; ${(index.globe.changed * 100).toFixed(1)}% changes side of the level, ${pct(index.globe.to_sea)} of it to below`,
    '',
    'through time, localities with their own node held out: the share on the side of the level their kind is of, by the map\'s coast and by the height; and shore beds, the middle of how far from the level each has them:',
    ...index.through.map(
      (t) =>
        `  ${`${t.olderMa}–${t.youngerMa} Ma${t.told ? '' : ' (kinds not told)'}`.padEnd(32)} level ${String(t.level.mean).padStart(4)} m (told at ${t.level.told} of ${t.keyframes}); marine ${pct(t.map.marine_below)} → ${pct(t.node.marine_below)} (${t.localities.marine.toLocaleString('en-US')}), land ${pct(t.map.land_above)} → ${pct(t.node.land_above)} (${t.localities.land.toLocaleString('en-US')}); shore beds ${t.shore.map} m → ${t.shore.height} m (${t.shore.n.toLocaleString('en-US')}), the middle one ${t.shore.stands} m above today's sea${t.shore.below === undefined ? '' : `, ${pct(t.shore.below)} of them below the other curve's ${t.shore.rival} m`}`,
    ),
  ];
  return lines.join('\n');
}
