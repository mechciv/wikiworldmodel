// The time axis: float64 decimal astronomical years (year 0 = 1 BCE, so 44 BCE is −43).
// Ages (BP, ka, Ma, Ga) count back from 1950 CE, the "present" of the BP convention.
//
// Records may write each bound in whatever unit suits it (section 5 of WORLD-MODEL.md):
//   1990.61          a decimal astronomical year; a whole number means that whole year
//   80 CE, 44 BCE    calendar years (whole years)
//   15 March 44 BCE  a calendar date (that whole day), or a month: March 44 BCE
//   4550 BP          years before 1950
//   66.043 Ma        also ka, Ga
//   5 Gyr from now   also kyr and Myr; counted from the present of the axis (1950)
//   JDN 584283       a day by its Julian Day Number, as astronomers and correlations count days
//   9.12.11.5.18 Long Count
//                    a day in a calendar that counts days from a zero day (DAY_COUNTS): so many days
//                    after that day, wherever the world puts it
// A time value is a point, an interval {lo, hi} (lo is always the earlier time; either end
// may be left open), a normal distribution {mean, sd}, `unknown`, a reference to another
// record's interval or one of its edges, {ref, edge, lag}, or a day in a count of days. Durations
// (sd, lag) are a number of years or "<n> days|yr|kyr|Myr|Gyr".
//
// Dates are in the calendar then in use: the Julian before 15 October 1582, the Gregorian
// from then on (a date may name its calendar instead, "25 October 1917 CE Julian"). Earlier
// Julian dates are proleptic: the Roman calendar before 45 BCE ran out of step with the
// seasons, and a date written in it has to be converted before it goes here. A day's place in
// its year is its count of days into the year over the year's length, so whole years stay
// whole numbers; 1582, shortened by the reform, has 355 days.

export const PRESENT_YEAR = 1950;

export const fromMa = (ma: number): number => PRESENT_YEAR - ma * 1e6;
export const toMa = (year: number): number => (PRESENT_YEAR - year) / 1e6;
export const fromKa = (ka: number): number => PRESENT_YEAR - ka * 1e3;

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS = MONTH_NAMES;
/** Day number of 15 October 1582, the first day of the Gregorian calendar. */
const REFORM = 2299161;
/** The earliest year (astronomical) dates are read and written for: day numbers start in 4713 BCE. */
const FIRST_DATED_YEAR = -4712;

/** The day number (Julian Day Number) of a date; y is the astronomical year. */
function dayNumber(y: number, m: number, d: number, gregorian: boolean): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const n = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4);
  return gregorian ? n - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045 : n - 32083;
}

/** The date of a day number in one calendar (E. G. Richards' algorithm, for day numbers ≥ 0). */
function dateOf(j: number, gregorian: boolean): { y: number; m: number; d: number } {
  const f = gregorian ? j + 1401 + Math.floor((Math.floor((4 * j + 274277) / 146097) * 3) / 4) - 38 : j + 1401;
  const e = 4 * f + 3;
  const h = 5 * Math.floor((e % 1461) / 4) + 2;
  const m = ((Math.floor(h / 153) + 2) % 12) + 1;
  return { y: Math.floor(e / 1461) - 4716 + Math.floor((14 - m) / 12), m, d: Math.floor((h % 153) / 5) + 1 };
}

/** The first day of a year, in the calendar in use then. */
const yearStart = (y: number) => dayNumber(y, 1, 1, y > 1582);

/** A day number's place on the axis: its year, plus its days into the year over the year's length. */
function axisOf(j: number): number {
  const { y } = dateOf(j, j >= REFORM);
  const y0 = yearStart(y);
  return y + (j - y0) / (yearStart(y + 1) - y0);
}

/** The day number (Julian Day Number) of the day a point on the axis falls in; none before 4713 BCE. */
export function dayNumberAt(t: number): number | undefined {
  const y = Math.floor(t + 1e-9);
  if (!Number.isFinite(t) || y < FIRST_DATED_YEAR || y > 1e6) return undefined;
  const y0 = yearStart(y);
  return y0 + Math.floor(Math.max(0, t - y) * (yearStart(y + 1) - y0) + 1e-6);
}

/** A day by its number: where it starts on the axis, and how long it is there. */
export function dayOnAxis(j: number): { t: number; whole: number } {
  const t = axisOf(j);
  return { t, whole: axisOf(j + 1) - t };
}

/** The calendar date at a point on the axis, in the calendar then in use; none before 4713 BCE. */
export function dateAt(t: number): { year: number; month: number; day: number } | undefined {
  const j = dayNumberAt(t);
  if (j === undefined) return undefined;
  const { y: year, m, d } = dateOf(j, j >= REFORM);
  return { year, month: m, day: d };
}

/**
 * Counts of days: calendars that name a day by how many days it is after a zero day, written in places,
 * as the Maya Long Count is. How the places count is the calendar's own rule, and is here as the Julian
 * leap year is. Which day of ours the zero day was is not: it is a claim of the world, on the record of
 * that day (kind event/epoch, with a `calendar` claim naming the count), often contested, and every date
 * written in the count follows the one chosen (tools/world/src/chronology.ts).
 *
 *   places   how many of each place make one of the place before it, from the second place on
 *   era      the count on which the era before the zero day ended, where the count had one: the Maya wrote their
 *            zero day as 13.0.0.0.0, the end of thirteen b'ak'tuns, and dated the time before it in that older
 *            era. A date marked "of the era before" is counted back from the zero day by what it lacks of this,
 *            so `13.0.0.0.0 Long Count of the era before` is the zero day itself, and `13.0.0.0.0 Long Count`,
 *            unmarked, the day thirteen b'ak'tuns after it.
 */
export const DAY_COUNTS: Record<string, { name: string; places: number[]; era?: number[] }> = {
  // b'ak'tun.k'atun.tun.winal.k'in: 20 k'in to a winal, 18 winal to a tun, 20 tun to a k'atun, 20 k'atun to a b'ak'tun.
  'long-count': { name: 'Long Count', places: [20, 20, 18, 20], era: [13, 0, 0, 0, 0] },
};

const ERA_BEFORE = 'of the era before';
const COUNT = new RegExp(`^\\s*(\\d+(?:\\.\\d+)+)\\s+(${Object.values(DAY_COUNTS).map((c) => c.name).join('|')})(\\s+${ERA_BEFORE})?\\s*$`);

/** The places of a count as a number of days. */
const countOf = (digits: number[], places: number[]) => places.reduce((days, radix, i) => days * radix + digits[i + 1], digits[0]);

/** A day written in a count of days: the count, and how many days after its zero day (before it, if negative). */
function parseCount(input: string): { calendar: string; days: number; text: string } | undefined {
  const m = COUNT.exec(input);
  if (!m) return undefined;
  const [calendar, def] = Object.entries(DAY_COUNTS).find(([, c]) => c.name === m[2])!;
  const digits = m[1].split('.').map(Number);
  if (digits.length !== def.places.length + 1) throw new TimeError(`"${input}": a ${def.name} date has ${def.places.length + 1} places`);
  for (const [i, radix] of def.places.entries()) {
    if (digits[i + 1] >= radix) throw new TimeError(`"${input}": place ${i + 2} of a ${def.name} date counts to ${radix - 1}`);
  }
  const days = countOf(digits, def.places);
  if (!m[3]) return { calendar, days, text: `${digits.join('.')} ${def.name}` };
  if (!def.era) throw new TimeError(`"${input}": the ${def.name} has no era before its zero day`);
  const era = countOf(def.era, def.places);
  if (days > era) throw new TimeError(`"${input}": the era before the zero day ended on ${def.era.join('.')}`);
  return { calendar, days: days - era, text: `${digits.join('.')} ${def.name} ${ERA_BEFORE}` };
}

/** Is a time point, as written, a day in a count of days? Such a day has no place on the axis until the world gives its zero day. */
export const isCount = (input: unknown): input is string => typeof input === 'string' && COUNT.test(input);

/**
 * Calendars of cycles: calendars that name a day by its place in cycles that come round again, and not by how many
 * days it is after a zero day. The Mexica named a day of their 260-day count by a number from 1 to 13 and one of
 * twenty signs, both advancing a day at a time (1 Coatl, then 2 Miquiztli), and a year of 365 days by the number
 * and the sign of its bearer, both advancing a year at a time through four signs (1 Acatl, then 2 Tecpatl), so
 * that the names of the years came round every 52 years. A date so written, `1 Coatl in the year 3 Calli`, names
 * not one day but every day that bears those names: a set of candidate days, one or two in every 52 years, which
 * only the rest of the evidence narrows to one. How the cycles turn is the calendar's own rule, and is here, as
 * the leap year is; which day of ours bore a given name is not: it is a claim of the world, on the record of a day
 * whose name in the cycle the sources give (kind event/epoch, with a `calendar` claim naming the cycle and a
 * `day_name` claim giving its name), often contested, and every date written in the cycle follows the one
 * chosen (tools/world/src/chronology.ts).
 *
 *   unit     day: each day takes the next number and the next sign; year: each year of `length` days takes the
 *            next number and the next of `signs`, and is named for its bearer
 *   numbers  how many numbers the names run through
 *   signs    the signs, in the order they come
 */
export const CYCLES: Record<string, { name: string; unit: 'day' | 'year'; numbers: number; signs: string[]; length?: number }> = {
  // The 260-day count: thirteen numbers and twenty signs, 13 × 20 days before a name comes round again.
  tonalpohualli: {
    name: 'tonalpohualli',
    unit: 'day',
    numbers: 13,
    signs: ['Cipactli', 'Ehecatl', 'Calli', 'Cuetzpalin', 'Coatl', 'Miquiztli', 'Mazatl', 'Tochtli', 'Atl', 'Itzcuintli', 'Ozomatli', 'Malinalli', 'Acatl', 'Ocelotl', 'Cuauhtli', 'Cozcacuauhtli', 'Ollin', 'Tecpatl', 'Quiahuitl', 'Xochitl'],
  },
  // The years of 365 days and their bearers: thirteen numbers and four signs, 13 × 4 years before a name comes round.
  xiuhpohualli: { name: 'xiuhpohualli', unit: 'year', numbers: 13, signs: ['Tochtli', 'Acatl', 'Tecpatl', 'Calli'], length: 365 },
};

/**
 * How the signs are spelt in the sources, besides their names above: in sixteenth-century Nahuatl, which wrote the
 * same word several ways, and in the Spanish of the colonial writers, who translated them. Only to tell whether a
 * quote names a sign (the validator's check that a date was copied as the source gives it).
 */
export const SIGN_SPELLINGS: Record<string, string[]> = {
  Cipactli: ['cipactli', 'lagarto'],
  Ehecatl: ['ehecatl', 'hecatl', 'ecatl', 'viento'],
  Calli: ['calli', 'casa'],
  Cuetzpalin: ['cuetzpalin', 'cuetzpallin', 'cuetzpalli', 'lagartija'],
  Coatl: ['coatl', 'cohuatl', 'couatl', 'culebra', 'serpiente'],
  Miquiztli: ['miquiztli', 'muerte'],
  Mazatl: ['mazatl', 'maçatl', 'venado'],
  Tochtli: ['tochtli', 'conejo'],
  Atl: ['atl', 'agua'],
  Itzcuintli: ['itzcuintli', 'perro'],
  Ozomatli: ['ozomatli', 'oçomatli', 'mono'],
  Malinalli: ['malinalli', 'yerba', 'hierba'],
  Acatl: ['acatl', 'caña'],
  Ocelotl: ['ocelotl', 'tigre'],
  Cuauhtli: ['cuauhtli', 'quauhtli', 'aguila', 'águila'],
  Cozcacuauhtli: ['cozcacuauhtli', 'cozcaquauhtli', 'zopilote'],
  Ollin: ['ollin', 'olin', 'movimiento'],
  Tecpatl: ['tecpatl', 'pedernal'],
  Quiahuitl: ['quiahuitl', 'quiyahuitl', 'quiauitl', 'lluvia'],
  Xochitl: ['xochitl', 'suchitl', 'flor'],
};

/** Does a text name a sign, in any of the spellings the sources use? */
export function namesSign(text: string, sign: string): boolean {
  const t = text.toLowerCase();
  return (SIGN_SPELLINGS[sign] ?? [sign.toLowerCase()]).some((s) => t.includes(s));
}

/** The place of a name in its cycle: the number and the sign that both advance one step a step, as one count from 0. */
function placeIn(number: number, sign: number, numbers: number, signs: number): number {
  for (let p = sign; p < numbers * signs; p += signs) if (p % numbers === number - 1) return p;
  throw new TimeError(`${number} and sign ${sign} name no place in a cycle of ${numbers} by ${signs}`);
}

/** A name in a cycle as text: its number and sign. */
export function cycleName(cycle: string, place: number): string {
  const c = CYCLES[cycle];
  return `${(place % c.numbers) + 1} ${c.signs[place % c.signs.length]}`;
}

/** A day named in cycles: its place in a day cycle, its year's place in a year cycle, or both, and how it is written. */
export interface CycleDate {
  day?: { cycle: string; place: number };
  year?: { cycle: string; place: number };
  text: string;
}

const dayCycles = Object.entries(CYCLES).filter(([, c]) => c.unit === 'day');
const yearCycles = Object.entries(CYCLES).filter(([, c]) => c.unit === 'year');
const DAY_NAME = `(\\d{1,2})\\s+(${dayCycles.flatMap(([, c]) => c.signs).join('|')})`;
const YEAR_NAME = `the\\s+year\\s+(\\d{1,2})\\s+(${yearCycles.flatMap(([, c]) => c.signs).join('|')})`;
const CYCLE = new RegExp(`^\\s*(?:${DAY_NAME}(?:\\s+in\\s+${YEAR_NAME})?|${YEAR_NAME})\\s*$`);

/** One name in the cycles of a unit: which cycle, and the place in it. */
function nameIn(unit: 'day' | 'year', n: string, sign: string, input: string): { cycle: string; place: number } {
  const [cycle, def] = (unit === 'day' ? dayCycles : yearCycles).find(([, c]) => c.signs.includes(sign))!;
  const number = Number(n);
  if (number < 1 || number > def.numbers) throw new TimeError(`"${input}": the ${def.name} numbers its ${unit}s from 1 to ${def.numbers}`);
  return { cycle, place: placeIn(number, def.signs.indexOf(sign), def.numbers, def.signs.length) };
}

/** A day written in calendars of cycles: "1 Coatl", "the year 3 Calli", or "1 Coatl in the year 3 Calli". */
export function parseCycle(input: string): CycleDate | undefined {
  const m = CYCLE.exec(input);
  if (!m) return undefined;
  const text = input.trim().replace(/\s+/g, ' ');
  if (m[1]) return { day: nameIn('day', m[1], m[2], input), ...(m[3] ? { year: nameIn('year', m[3], m[4], input) } : {}), text };
  return { year: nameIn('year', m[5], m[6], input), text };
}

/** Is a time point, as written, a day named in cycles? It names many days, and stands alone as evidence about a moment. */
export const isCycle = (input: unknown): input is string => typeof input === 'string' && CYCLE.test(input);

/** Where a cycle meets our days: the day number of a day, or of the first day of a year, and its place in the cycle. */
export interface CycleAnchor {
  jdn: number;
  place: number;
}

/**
 * The days a date in cycles names between two day numbers, first and last inclusive: as runs of days, each a
 * day, or for a year named alone the whole year (the part of it in the window). Each cycle the date names needs
 * its anchor. Undefined where an anchor is missing, or where the window would hold more names than there is any
 * sense in listing (a window of thousands of years).
 */
export function cycleDays(v: CycleDate, anchors: { day?: CycleAnchor; year?: CycleAnchor }, first: number, last: number): [number, number][] | undefined {
  if ((v.day && !anchors.day) || (v.year && !anchors.year)) return undefined;
  if (last < first) return [];
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  // The years named so, as runs of days, each cut to the window.
  let years: [number, number][] | undefined;
  if (v.year) {
    const c = CYCLES[v.year.cycle];
    const length = c.length!;
    const turn = c.numbers * c.signs.length;
    const a = anchors.year!;
    // Year k after the anchor's begins on day a.jdn + k·length and takes the place a.place + k. The first of the
    // window's years is the one that holds its first day; the first named so is that, or comes after it.
    const k0 = Math.floor((first - a.jdn) / length);
    years = [];
    for (let k = k0 + mod(v.year.place - a.place - k0, turn); a.jdn + k * length <= last; k += turn) {
      if (years.length > 1000) return undefined;
      const lo = a.jdn + k * length;
      years.push([Math.max(lo, first), Math.min(lo + length - 1, last)]);
    }
    if (!v.day) return years;
  }
  // The days of that name, within the window or within the years named.
  const c = CYCLES[v.day!.cycle];
  const turn = c.numbers * c.signs.length;
  const a = anchors.day!;
  const out: [number, number][] = [];
  for (const [lo, hi] of years ?? [[first, last]]) {
    for (let d = lo + mod(a.jdn + (v.day!.place - a.place) - lo, turn); d <= hi; d += turn) {
      if (out.length > 1000) return undefined;
      out.push([d, d]);
    }
  }
  return out;
}

const DATE = new RegExp(`^\\s*(?:(\\d{1,2})\\s+)?(${MONTHS.join('|')})\\s+(\\d+)\\s+(CE|BCE)(?:\\s+(Julian|Gregorian))?\\s*$`);

/** A calendar date, or a whole month: its start on the axis and the length of the day or month. */
function parseDate(input: string): { t: number; whole: number } | undefined {
  const m = DATE.exec(input);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[2]) + 1;
  const y = m[4] === 'BCE' ? 1 - Number(m[3]) : Number(m[3]);
  const day = m[1] === undefined ? 1 : Number(m[1]);
  if (y < FIRST_DATED_YEAR) throw new TimeError(`"${input}": dates are read from 4713 BCE on; write a year instead`);
  const gregorian = m[5] ? m[5] === 'Gregorian' : y > 1582 || (y === 1582 && (month > 10 || (month === 10 && day >= 15)));
  const j = dayNumber(y, month, day, gregorian);
  const back = dateOf(j, gregorian);
  if (back.y !== y || back.m !== month || back.d !== day) throw new TimeError(`"${input}" is not a date in the ${gregorian ? 'Gregorian' : 'Julian'} calendar`);
  const t = axisOf(j);
  if (m[1] !== undefined) return { t, whole: axisOf(j + 1) - t };
  const next = month === 12 ? dayNumber(y + 1, 1, 1, gregorian) : dayNumber(y, month + 1, 1, gregorian);
  return { t, whole: axisOf(next) - t };
}

/** One bound or moment as written in a record. */
export type TimePointInput = number | string;
export type DurationInput = number | string;
export type LagInput = DurationInput | { lo?: DurationInput; hi?: DurationInput };

/** A time value as written in a record, before normalization. */
export type TimeInput =
  | TimePointInput
  | 'unknown'
  | { lo?: TimePointInput | 'unknown'; hi?: TimePointInput | 'unknown' }
  | { mean: TimePointInput; sd: DurationInput }
  | { ref: string; edge?: 'start' | 'end'; lag?: LagInput };

/** A normalized time value, in astronomical years. `lo` is the earlier end. */
export type TimeValue =
  | { kind: 'instant'; t: number }
  /** an interval; an open end is ±Infinity, an end stated as unknown is flagged */
  | { kind: 'interval'; lo: number; hi: number; loUnknown?: boolean; hiUnknown?: boolean }
  | { kind: 'normal'; mean: number; sd: number }
  /** `lagDays`: the lag as written, where it was given in days, so that it can be counted on the calendar from a day */
  | { kind: 'ref'; ref: string; edge?: 'start' | 'end'; lag: [number, number]; lagDays?: [number, number] }
  /** a day in a count of days (DAY_COUNTS): so many days after the count's zero day, wherever the world puts that */
  | { kind: 'count'; calendar: string; days: number; text: string }
  /** a day named in calendars of cycles (CYCLES): one of the days that bear those names, which the rest of the evidence narrows */
  | ({ kind: 'cycle' } & CycleDate)
  | { kind: 'unknown' };

export class TimeError extends Error {}

const AGE_UNITS: Record<string, number> = { BP: 1, ka: 1e3, Ma: 1e6, Ga: 1e9 };
const FUTURE_UNITS: Record<string, number> = { kyr: 1e3, Myr: 1e6, Gyr: 1e9 };
const DURATION_UNITS: Record<string, number> = { day: 1 / 365.25, days: 1 / 365.25, yr: 1, kyr: 1e3, Myr: 1e6, Gyr: 1e9 };

/**
 * A point on the axis, and the length of the calendar unit it names, if it names one: a
 * whole year, month or day, which as a moment means that whole unit. Zero for an exact point.
 */
export function parsePoint(input: TimePointInput): { t: number; whole: number } {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new TimeError(`not a time: ${input}`);
    return { t: input, whole: Number.isInteger(input) ? 1 : 0 };
  }
  const date = parseDate(input);
  if (date) return date;
  const jdn = /^\s*JDN\s+(\d+)\s*$/.exec(input);
  if (jdn) {
    const day = dayOnAxis(Number(jdn[1]));
    if (day.t > 1e6) throw new TimeError(`"${input}": day numbers are read to the year 1,000,000`);
    return day;
  }
  if (COUNT.test(input)) throw new TimeError(`"${input}" is a day in a count of days: it stands alone as a time, not as a bound of a range`);
  if (CYCLE.test(input)) throw new TimeError(`"${input}" is a day named in cycles: it names many days, one in each turn of its cycles, and stands alone as evidence about a moment, not as a bound`);
  const m = /^\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(CE|BCE|BP|ka|Ma|Ga|kyr from now|Myr from now|Gyr from now)\s*$/.exec(input);
  if (!m) throw new TimeError(`not a time: "${input}" (write a year, a date such as 15 March 44 BCE, a day number such as JDN 584283, or a number with CE, BCE, BP, ka, Ma, Ga, or kyr/Myr/Gyr from now)`);
  const x = Number(m[1]);
  const unit = m[2];
  if (unit === 'CE') return { t: x, whole: Number.isInteger(x) ? 1 : 0 };
  if (unit === 'BCE') return { t: 1 - x, whole: Number.isInteger(x) ? 1 : 0 };
  if (unit in AGE_UNITS) return { t: PRESENT_YEAR - x * AGE_UNITS[unit], whole: 0 };
  return { t: PRESENT_YEAR + x * FUTURE_UNITS[unit.split(' ')[0]], whole: 0 };
}

export function parseDuration(input: DurationInput): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) throw new TimeError(`not a duration: ${input}`);
    return input;
  }
  const m = /^\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(days?|yr|kyr|Myr|Gyr)\s*$/.exec(input);
  if (!m) throw new TimeError(`not a duration: "${input}" (write years, or a number with days, yr, kyr, Myr or Gyr)`);
  return Number(m[1]) * DURATION_UNITS[m[2]];
}

/**
 * A lag written in days, as [lo, hi] days: "195 days", or { lo, hi } with each end in days. Undefined for a lag in
 * any other unit, or open at either end. A count of days from a dated day lands on a day only when it is counted on
 * the calendar; carried as years of 365.25 days, it drifts by part of a day in a leap year.
 */
export function lagInDays(input: LagInput | undefined): [number, number] | undefined {
  const days = (x: DurationInput | undefined) => (typeof x === 'string' ? /^\s*(\d+)\s+days?\s*$/.exec(x)?.[1] : undefined);
  if (typeof input === 'string') {
    const n = days(input);
    return n === undefined ? undefined : [Number(n), Number(n)];
  }
  if (input && typeof input === 'object') {
    const [lo, hi] = [days(input.lo), days(input.hi)];
    return lo !== undefined && hi !== undefined ? [Number(lo), Number(hi)] : undefined;
  }
  return undefined;
}

/** A lag as [lo, hi] in years; a single duration is exact, a missing end is open. */
export function parseLag(input: LagInput | undefined): [number, number] {
  if (input === undefined) return [0, Infinity];
  if (typeof input === 'object') {
    const lo = input.lo === undefined ? 0 : parseDuration(input.lo);
    const hi = input.hi === undefined ? Infinity : parseDuration(input.hi);
    if (lo > hi) throw new TimeError(`lag lo is greater than hi`);
    return [lo, hi];
  }
  const d = parseDuration(input);
  return [d, d];
}

export function parseTime(input: TimeInput): TimeValue {
  if (input === 'unknown') return { kind: 'unknown' };
  if (typeof input === 'number' || typeof input === 'string') {
    const count = typeof input === 'string' ? parseCount(input) : undefined;
    if (count) return { kind: 'count', ...count };
    const cycle = typeof input === 'string' ? parseCycle(input) : undefined;
    if (cycle) return { kind: 'cycle', ...cycle };
    const p = parsePoint(input);
    return p.whole ? { kind: 'interval', lo: p.t, hi: p.t + p.whole } : { kind: 'instant', t: p.t };
  }
  const keys = input && typeof input === 'object' ? Object.keys(input).sort().join(',') : '';
  const forms = ['hi', 'lo', 'hi,lo', 'mean,sd', 'ref', 'edge,ref', 'lag,ref', 'edge,lag,ref'];
  if (!forms.includes(keys)) throw new TimeError(`not a time value: ${JSON.stringify(input)} (write a point, {lo, hi}, {mean, sd}, {ref, edge, lag} or unknown)`);
  if ('ref' in input) {
    if (input.edge !== undefined && input.edge !== 'start' && input.edge !== 'end') throw new TimeError(`edge must be start or end`);
    const lagDays = lagInDays(input.lag);
    return { kind: 'ref', ref: input.ref, edge: input.edge, lag: input.lag === undefined ? [0, 0] : parseLag(input.lag), ...(lagDays ? { lagDays } : {}) };
  }
  if ('mean' in input) {
    const sd = parseDuration(input.sd);
    return { kind: 'normal', mean: parsePoint(input.mean).t, sd };
  }
  const { lo, hi } = input as { lo?: TimePointInput | 'unknown'; hi?: TimePointInput | 'unknown' };
  const loP = lo === undefined || lo === 'unknown' ? undefined : parsePoint(lo);
  const hiP = hi === undefined || hi === 'unknown' ? undefined : parsePoint(hi);
  const v: TimeValue = {
    kind: 'interval',
    lo: loP ? loP.t : -Infinity,
    // "1990 to 2000" includes the whole of 2000, and "to 15 March" the whole of that day.
    hi: hiP ? hiP.t + hiP.whole : Infinity,
  };
  if (lo === 'unknown') v.loUnknown = true;
  if (hi === 'unknown') v.hiUnknown = true;
  if (v.lo > v.hi) throw new TimeError(`lo is later than hi (${lo} after ${hi}); lo is always the earlier time`);
  return v;
}

/** Bounds used as hard constraints: an interval as given, a normal distribution at ±2σ (95%). */
export function bounds(v: TimeValue): [number, number] {
  if (v.kind === 'instant') return [v.t, v.t];
  if (v.kind === 'interval') return [v.lo, v.hi];
  if (v.kind === 'normal') return [v.mean - 2 * v.sd, v.mean + 2 * v.sd];
  return [-Infinity, Infinity];
}

export function centre(v: TimeValue): [number, number] {
  if (v.kind === 'instant') return [v.t, v.t];
  if (v.kind === 'normal') return [v.mean, v.mean];
  if (v.kind === 'interval' && Number.isFinite(v.lo) && Number.isFinite(v.hi)) {
    const c = (v.lo + v.hi) / 2;
    return [c, c];
  }
  return bounds(v);
}

function trimNumber(x: number, digits: number): string {
  return Number(x.toFixed(digits)).toString();
}

/**
 * A label for a point in time. `resolution` (years) chooses the precision; by default it
 * follows the magnitude of the age.
 */
export function formatTime(year: number, resolution?: number): string {
  if (year === -Infinity) return 'open';
  if (year === Infinity) return 'open';
  const age = PRESENT_YEAR - year;
  // The future, beyond the span where a calendar year reads naturally.
  if (age <= -1e4) {
    const ahead = -age;
    const [div, unit] = ahead >= 1e9 ? [1e9, 'Gyr'] : ahead >= 1e6 ? [1e6, 'Myr'] : [1e3, 'kyr'];
    const digits = resolution ? Math.max(0, Math.min(6, Math.ceil(-Math.log10(resolution / div)))) : 2;
    return `${trimNumber(ahead / div, digits)} ${unit} from now`;
  }
  if (age >= 1e6) {
    const digits = resolution ? Math.max(0, Math.min(6, Math.ceil(-Math.log10(resolution / 1e6)))) : age >= 1e8 ? 1 : 2;
    return `${trimNumber(age / 1e6, digits)} Ma`;
  }
  if (age >= 1e4) {
    const digits = resolution ? Math.max(0, Math.min(3, Math.ceil(-Math.log10(resolution / 1e3)))) : 1;
    return `${trimNumber(age / 1e3, digits)} ka`;
  }
  // A finer resolution than a year shows the month, or the day.
  const unit = resolution === undefined || resolution >= 60 / 365 ? 'year' : resolution >= 3 / 365 ? 'month' : 'day';
  return formatDate(year, unit);
}

/** The calendar year, month or day that contains a point on the axis. */
export function formatDate(t: number, unit: 'year' | 'month' | 'day'): string {
  const date = unit === 'year' ? undefined : dateAt(t);
  const y = date?.year ?? Math.floor(t + 1e-9);
  const era = y <= 0 ? `${1 - y} BCE` : `${y} CE`;
  if (!date) return era;
  return unit === 'month' ? `${MONTHS[date.month - 1]} ${era}` : `${date.day} ${MONTHS[date.month - 1]} ${era}`;
}

/** The calendar unit a point starts, if it starts one: a year, else a month, else a day. */
function unitStarted(t: number): 'year' | 'month' | 'day' | undefined {
  if (Math.abs(t - Math.round(t)) < 1e-9) return 'year';
  const y = Math.floor(t);
  if (y < FIRST_DATED_YEAR || y > 1e6) return undefined;
  const k = (t - y) * (yearStart(y + 1) - yearStart(y));
  if (Math.abs(k - Math.round(k)) > 1e-6) return undefined;
  return dateAt(t)?.day === 1 ? 'month' : 'day';
}

/**
 * An interval of whole calendar units, as text: "80 CE", "March 44 BCE", "15 March 44 BCE", or
 * a range of them. Undefined if its ends are not calendar units.
 */
function formatWhole(lo: number, hi: number): string | undefined {
  const order = ['year', 'month', 'day'];
  const a = unitStarted(lo);
  const b = unitStarted(hi);
  if (!a || !b) return undefined;
  const unit = order[Math.max(order.indexOf(a), order.indexOf(b))] as 'year' | 'month' | 'day';
  // The end is exclusive: the unit before it is the last one in the interval.
  const first = formatDate(lo, unit);
  const last = formatDate(hi - 1e-7, unit);
  return first === last ? first : `${first} – ${last}`;
}

/** A label for a duration in years, e.g. "40 days", "22 kyr" or "1.3 Myr". */
export function formatDuration(years: number): string {
  const a = Math.abs(years);
  if (a >= 1e6) return `${trimNumber(a / 1e6, a >= 1e7 ? 0 : 1)} Myr`;
  if (a >= 1e3) return `${trimNumber(a / 1e3, a >= 1e4 ? 0 : 1)} kyr`;
  if (a < 1) return `${Math.round(a * 365.25)} days`;
  return `${Math.round(a)} yr`;
}

/** A time value as text, in Ma with up to four decimals in deep time. */
export function formatTimeValue(v: TimeValue, refLabel: (ref: string) => string = (r) => r): string {
  const deep = (y: number) => PRESENT_YEAR - y >= 1e4;
  const ma = (y: number) => `${+((PRESENT_YEAR - y) / 1e6).toFixed(4)} Ma`;
  const at = (y: number) => (deep(y) ? ma(y) : formatTime(y));
  if (v.kind === 'instant') return at(v.t);
  if (v.kind === 'unknown') return 'unknown';
  if (v.kind === 'count' || v.kind === 'cycle') return v.text;
  if (v.kind === 'normal') {
    if (!deep(v.mean)) return `${formatTime(v.mean)} ± ${formatDuration(v.sd)} (1σ)`;
    return `${+((PRESENT_YEAR - v.mean) / 1e6).toFixed(4)} ± ${+(v.sd / 1e6).toFixed(4)} Ma (1σ)`;
  }
  if (v.kind === 'ref') {
    const what = v.edge ? `the ${v.edge} of ${refLabel(v.ref)}` : `during ${refLabel(v.ref)}`;
    const [lo, hi] = v.lag;
    if (lo === 0 && hi === 0) return what;
    return `${what}, ${hi === Infinity ? `at least ${formatDuration(lo)}` : lo === hi ? formatDuration(lo) : `${formatDuration(lo)} to ${formatDuration(hi)}`} after`;
  }
  if (historical(v.lo) && historical(v.hi) && !v.loUnknown && !v.hiUnknown) {
    const whole = formatWhole(v.lo, v.hi);
    if (whole) return whole;
  }
  // An end that is exclusive (the start of the unit after) is shown as the unit before it.
  const end = (y: number) => {
    const unit = historical(y) ? unitStarted(y) : undefined;
    return unit ? formatDate(y - 1e-7, unit) : at(y);
  };
  const lo = v.loUnknown ? 'unknown' : Number.isFinite(v.lo) ? at(v.lo) : null;
  const hi = v.hiUnknown ? 'unknown' : Number.isFinite(v.hi) ? end(v.hi) : null;
  if (lo && hi) return `${lo} – ${hi}`;
  if (hi) return `no later than ${hi}`;
  return `no earlier than ${lo}`;
}

/** Whether a time is close enough to the present for the calendar: within 10 kyr of 1950. */
export const historical = (year: number): boolean => Math.abs(PRESENT_YEAR - year) < 1e4;

/** A time as the URL carries it: within 10 kyr of the present, so that a day can be told apart. */
export function quantizeTime(year: number): number {
  return historical(year) ? Math.round(year * 1000) / 1000 : Math.round(year);
}

/**
 * Canonical URL form: a decimal astronomical year to a thousandth (about nine hours) within
 * 10 kyr of the present, e.g. "-43.796"; further away, the age in Ma with whole years as the
 * finest step, e.g. "66.043Ma".
 */
export function timeToParam(year: number): string {
  const y = quantizeTime(year);
  return historical(y) ? String(y) : `${(PRESENT_YEAR - y) / 1e6}Ma`;
}

export function timeFromParam(s: string): number | undefined {
  const m = /^(-?\d+(?:\.\d+)?)(Ma|ka|BCE|CE)?$/.exec(s.trim());
  if (!m) return undefined;
  const x = Number(m[1]);
  if (m[2] === 'Ma') return Math.round(fromMa(x));
  if (m[2] === 'ka') return Math.round(fromKa(x));
  if (m[2] === 'BCE') return 1 - x;
  return x;
}
