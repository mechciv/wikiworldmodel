// What the time machine reads from what a reader types: a time, a place, or both ("Rome 100 CE"),
// and what the world holds at a time. Times are read leniently, as people write them ("44 BC",
// "AD 79", "66 mya", "10,000 years ago"), then by the axis's own parser (core/time.ts).
import type { SearchEntry } from './records.ts';
import { parsePoint, PRESENT_YEAR } from './time.ts';
import type { FeatureTime } from './tileset.ts';

const UNITS: [RegExp, string][] = [
  [/^(b\.?c\.?e?\.?|bce)$/i, 'BCE'],
  [/^(a\.?d\.?|c\.?e\.?|ce)$/i, 'CE'],
  [/^(ga|bya|gya|billion years ago|byr ago|gyr ago)$/i, 'Ga'],
  [/^(ma|mya|million years ago|myr ago|my ago)$/i, 'Ma'],
  [/^(ka|kya|thousand years ago|kyr ago)$/i, 'ka'],
  [/^(bp|years ago|yrs ago|yr ago|years bp)$/i, 'BP'],
];

/**
 * A time as a reader may type it, in astronomical years, or undefined if the text is not one. A
 * bare number is a year of the common era; a date is read as the axis reads one ("15 March 44 BC").
 */
export function readTime(text: string): number | undefined {
  let s = text.trim().replace(/^(c\.|ca\.?|circa|about|around)\s*/i, '').replace(/(\d),(?=\d{3}\b)/g, '$1');
  if (!s) return undefined;
  // "AD 79" is written with its era first.
  s = s.replace(/^(a\.?d\.?)\s+(\d+)$/i, '$2 CE');
  // "66mya", "44BC": a number run into its unit.
  s = s.replace(/^(-?\d+(?:\.\d+)?)(?=[a-z])/i, '$1 ');
  const m = /^(-?\d+(?:\.\d+)?)(?:\s+(.+))?$/.exec(s);
  if (m) {
    const x = Number(m[1]);
    if (!Number.isFinite(x)) return undefined;
    if (m[2] === undefined) return Number.isInteger(x) ? x : undefined;
    const unit = UNITS.find(([re]) => re.test(m[2]!.trim()))?.[1];
    if (unit === 'BP') return PRESENT_YEAR - x;
    if (unit) {
      try {
        return parsePoint(`${x} ${unit}`).t;
      } catch {
        return undefined;
      }
    }
    // Not a unit: perhaps a day and a month ("15 March 44 BC"), read below.
  }
  // A date with a month: the axis's own form, with BC/AD read as BCE/CE.
  const dated = s.replace(/\b(b\.?c\.?)$/i, 'BCE').replace(/\b(a\.?d\.?)$/i, 'CE').replace(/\b([a-z])([a-z]*)\b/gi, (w, a: string, b: string) => (/^(bce|ce)$/i.test(w) ? w.toUpperCase() : a.toUpperCase() + b.toLowerCase()));
  if (!/[A-Z][a-z]+ /.test(dated)) return undefined;
  try {
    return parsePoint(dated).t;
  } catch {
    return undefined;
  }
}

/** What a reader typed, read as a place and a time: either may be missing. */
export interface Query {
  place: string;
  t?: number;
}

/**
 * Splits what was typed into a place and a time. The time is the longest run of words at the end,
 * or else at the start, that reads as one: "Rome 100 CE", "100 CE Rome", "1200".
 */
export function readQuery(text: string): Query {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let k = words.length; k >= 1; k--) {
    const tail = readTime(words.slice(words.length - k).join(' '));
    if (tail !== undefined) return { place: words.slice(0, words.length - k).join(' ').replace(/[,;]$/, ''), t: tail };
    const head = readTime(words.slice(0, k).join(' '));
    if (head !== undefined) return { place: words.slice(k).join(' ').replace(/^(in|at)\s+/i, ''), t: head };
  }
  return { place: words.join(' ') };
}

/** The stretch of time a record holds, with an end that still holds read as the present. */
export function spanOfTime(time: FeatureTime): [number, number] | undefined {
  const a = time.start.best;
  if (a === null) return undefined;
  if (time.instant) return [a, a];
  // Bounds come as numbers, or as null where the build wrote an open one (±Infinity) to JSON.
  const finite = (x: number | null | undefined) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const b = time.end.best ?? (time.endUnknown ? finite(time.end.hi) ?? finite(time.end.lo) : null) ?? Math.max(a, PRESENT_YEAR);
  return [a, Math.max(a, b)];
}

/**
 * The stretch a search entry holds: its time, with an end no claim gives closed by the last of the
 * dataset rows that are rows of it, where it has some. A state the dataset stops drawing is not taken
 * to hold to the present only because no record says when it ended.
 */
export function spanOfEntry(e: SearchEntry): [number, number] | undefined {
  const span = spanOfTime(e.time);
  if (!span || e.time.instant || e.time.end.best !== null || !e.places?.length) return span;
  return [span[0], Math.max(span[0], ...e.places.map((p) => p[1]))];
}

/** How near in time a moment must be to count as "then": a few percent of how long ago it was. */
export function nearness(t: number): number {
  return Math.max(25, Math.abs(PRESENT_YEAR - t) * 0.03);
}

/** Kinds the time machine offers first when asked what was there at a time: places people lived, their states, their people. */
const RANK: [RegExp, number][] = [
  [/^settlement/, 0],
  [/^polity/, 1],
  [/^person/, 2],
  [/^event/, 3],
  [/^(development|industry|ecosystem)/, 4],
  [/^occurrence/, 6],
  [/^taxon/, 8],
];
const rankOf = (kind: string) => RANK.find(([re]) => re.test(kind))?.[1] ?? 5;

/**
 * The records that hold at a time, those people would most like to visit first: within each kind,
 * the shorter stretch is the more particular to the time, and a moment is nearer the nearer it is.
 */
export function heldAt(entries: SearchEntry[], t: number, skip: (e: SearchEntry) => boolean, limit = 8): SearchEntry[] {
  const near = nearness(t);
  const held: { e: SearchEntry; rank: number; row: number; length: number }[] = [];
  for (const e of entries) {
    if (e.bulk || skip(e)) continue;
    const span = spanOfEntry(e);
    if (!span) continue;
    const [a, b] = span;
    const within = e.time.instant ? Math.abs(a - t) <= near : a <= t && t <= b;
    if (!within) continue;
    // Records before rows of datasets; of the rows, the largest states then first.
    const row = e.dataset ? 1 : 0;
    held.push({ e, rank: rankOf(e.kind), row, length: row ? -(placeIn(e.places, t)?.[4] ?? 0) : e.time.instant ? Math.abs(a - t) : b - a });
  }
  return held.sort((x, y) => x.rank - y.rank || x.row - y.row || x.length - y.length || (x.e.label < y.e.label ? -1 : x.e.label > y.e.label ? 1 : 0)).slice(0, limit).map((x) => x.e);
}

/** Whether a record holds at a time, for a place chosen with a time. */
export function holdsAt(e: SearchEntry, t: number): boolean {
  const span = spanOfEntry(e);
  if (!span) return false;
  return e.time.instant ? Math.abs(span[0] - t) <= nearness(t) : span[0] <= t && t <= span[1];
}

type Place = NonNullable<SearchEntry['places']>[number];

/** Where a thing with no point of its own was drawn at a time: the row that holds then, or else the nearest in time. */
export function placeIn(places: Place[] | undefined, t: number): Place | undefined {
  let best: Place | undefined;
  let away = Infinity;
  for (const p of places ?? []) {
    const d = t < p[0] ? p[0] - t : t >= p[1] ? t - p[1] : 0;
    // Of rows holding at once, the largest.
    if (d < away || (d === away && best && p[4] > best[4])) {
      best = p;
      away = d;
    }
  }
  return best;
}

const inUse = (valid: [number | null, number | null] | undefined, t: number) => !valid || ((valid[0] ?? -Infinity) <= t && t < (valid[1] ?? Infinity));

/** The name a thing went by at a time: one in use then that is not always, else its label. */
export function nameAt(e: SearchEntry, t: number): string {
  return e.names?.find((n) => n.valid && inUse(n.valid, t))?.text ?? e.label;
}

const wordsOf = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Whether every word typed starts a word of a name: "rome" finds Rome, not Andromeda. What is typed is split into
 * words as the name is, at whatever is not a letter or a digit, so that "south-central" finds south-central Africa.
 */
export function nameMatches(name: string, text: string): boolean {
  const words = wordsOf(text);
  const starts = wordsOf(name);
  return words.length > 0 && words.every((w) => starts.some((x) => x.startsWith(w)));
}

/** The name of a thing that the text finds: its label first, then any other it went by. */
export function nameFound(e: SearchEntry, text: string): string | undefined {
  if (nameMatches(e.label, text)) return e.label;
  return e.names?.find((n) => nameMatches(n.text, text))?.text;
}
