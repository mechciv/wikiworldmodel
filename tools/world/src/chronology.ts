// Turn the world's dated claims and relations into a simple temporal network, solve it, and
// derive every entity's and phase's interval from the evidence (section 5), for each
// scenario (core/scenario.ts): the default picture, plus alternatives and picked claims.
import { parseRef, splitRef } from '../../../core/refs.ts';
import { scenarioKey, type Scenario } from '../../../core/scenario.ts';
import { conflictIn, ORIGIN, solve, solveChanged, type Bounds, type Conflict, type Constraint, type Solution } from '../../../core/stn.ts';
import { bounds, centre, CYCLES, cycleDays, dayNumberAt, dayOnAxis, isCount, isCycle, parseCycle, parseLag, parsePoint, parseTime, type CycleAnchor, type CycleDate, type TimeValue } from '../../../core/time.ts';
import { isMoment, kindIs, type Claim, type Relation, type World } from './world.ts';

export { scenarioKey, type Scenario } from '../../../core/scenario.ts';

/** The STN point of a subject's start or end; a moment has one point, its date. */
export function pointOf(world: World, subject: string, edge: 'start' | 'end'): string {
  return isMoment(world, subject) ? `${subject}|date` : `${subject}|${edge}`;
}

/** Does a reference name a subject (an entity or one of its phases) that exists? */
export function subjectExists(world: World, ref: string): boolean {
  try {
    const r = parseRef(ref);
    if (r.type !== 'entity' || r.part) return false;
    const e = world.entity.get(r.id);
    return !!e && (!r.phase || e.phases.some((p) => p.id === r.phase));
  } catch {
    return false;
  }
}

/** Competing claims: same subject and property. */
export interface ClaimGroup {
  key: string;
  subject: string;
  prop: string;
  claims: Claim[];
  /**
   * Claims of a moment's property whose value is a day named in calendars of cycles (core/time.ts, CYCLES). Such a
   * date names a set of days, and narrows the others rather than competing with them: it holds beside them, in
   * every picture, as a bound on an end does, and is never picked.
   */
  beside: Claim[];
}

const groupsOf = new WeakMap<World, { list: ClaimGroup[]; byKey: Map<string, ClaimGroup> }>();

/**
 * The world's claims grouped by subject and property, in key order. A loaded world does not
 * change, so this is worked out once per world: callers ask for it per entity, and redoing it
 * each time made validation quadratic in the size of the world.
 */
export function claimGroups(world: World): ClaimGroup[] {
  return indexGroups(world).list;
}

/** The group of one subject's property, if it has claims. */
export function claimGroup(world: World, subject: string, prop: string): ClaimGroup | undefined {
  return indexGroups(world).byKey.get(`${subject}|${prop}`);
}

function indexGroups(world: World): { list: ClaimGroup[]; byKey: Map<string, ClaimGroup> } {
  const known = groupsOf.get(world);
  if (known) return known;
  const groups = new Map<string, ClaimGroup>();
  for (const e of world.entities) {
    for (const c of e.claims) {
      if (c.status === 'deprecated') continue;
      const key = `${c.subject}|${c.prop}`;
      const g = groups.get(key) ?? { key, subject: c.subject, prop: c.prop, claims: [], beside: [] };
      (isBeside(world, c) ? g.beside : g.claims).push(c);
      groups.set(key, g);
    }
  }
  const index = { list: [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1)), byKey: groups };
  groupsOf.set(world, index);
  return index;
}

/** Does a claim hold beside its group's others: a moment's date written as a day named in cycles? */
export function isBeside(world: World, c: Claim): boolean {
  return isCycle(c.value) && !!world.vocab?.properties[c.prop]?.moment;
}

/**
 * The claims of a group a scenario chooses among: its alternatives' own claims if they have
 * any for this group (each alternative ranks its own claims), else the default picture's.
 */
export function available(g: ClaimGroup, s: Scenario): Claim[] {
  const alts = new Set(s.alts ?? []);
  const own = g.claims.filter((c) => c.alt && alts.has(c.alt));
  return own.length ? own : g.claims.filter((c) => !c.alt);
}

/**
 * The claim a scenario uses for a group: a pick, else the preferred one among those
 * available, else the only one that is not deprecated. Undefined if that is ambiguous.
 */
export function chosen(g: ClaimGroup, s: Scenario = {}): Claim | undefined {
  const avail = available(g, s);
  const pick = avail.find((c) => s.picks?.includes(c.ref));
  if (pick) return pick;
  const preferred = avail.filter((c) => c.rank === 'preferred');
  if (preferred.length === 1) return preferred[0];
  if (preferred.length > 1) return undefined;
  const usable = avail.filter((c) => c.rank !== 'deprecated');
  return usable.length === 1 ? usable[0] : undefined;
}

/** The relations of a scenario's picture that are not set aside: those that hold in it, and their rivals. */
function relationsOf(world: World, s: Scenario): Relation[] {
  const alts = new Set(s.alts ?? []);
  let all = allRelations.get(world);
  if (!all) {
    all = world.entities.flatMap((e) => e.relations).filter((r) => r.status !== 'deprecated' && r.rank !== 'deprecated');
    allRelations.set(world, all);
  }
  return all.filter((r) => !r.alt || alts.has(r.alt));
}

const allRelations = new WeakMap<World, Relation[]>();

/** Relations of one subject and one type: where one of them is ranked preferred, the others are its rivals. */
const rivalKey = (r: Relation) => `${r.subject}|${r.rel}`;

/**
 * Relations that hold in a scenario's picture. Several relations of one subject and one type all hold, as the two
 * parents of a union do, unless one of them is ranked preferred: then the preferred hold, and the others are
 * rival readings, which hold only when picked, in the preferred ones' place.
 */
export function relationsIn(world: World, s: Scenario): Relation[] {
  const all = relationsOf(world, s);
  const contested = new Set(all.filter((r) => r.rank === 'preferred').map(rivalKey));
  if (!contested.size) return all;
  const picked = new Set(all.filter((r) => contested.has(rivalKey(r)) && s.picks?.includes(r.ref)).map(rivalKey));
  return all.filter((r) => !contested.has(rivalKey(r)) || (picked.has(rivalKey(r)) ? s.picks!.includes(r.ref) : r.rank === 'preferred'));
}

/** The rival relations of a scenario's picture: those that give way to a preferred relation of their subject and type. */
export function rivalsIn(world: World, s: Scenario = {}): Relation[] {
  const all = relationsOf(world, s);
  const contested = new Set(all.filter((r) => r.rank === 'preferred').map(rivalKey));
  return all.filter((r) => r.rank !== 'preferred' && contested.has(rivalKey(r)));
}

/** Times already read: the network is made once for every competing claim, from the same few thousand values. */
const readStrings = new Map<string, TimeValue | undefined>();
const readObjects = new WeakMap<object, { v: TimeValue | undefined }>();

function timeOrUndefined(v: unknown): TimeValue | undefined {
  const read = () => {
    try {
      return parseTime(v as never);
    } catch {
      return undefined; // the validator reports it
    }
  };
  if (typeof v === 'string') {
    if (!readStrings.has(v)) readStrings.set(v, read());
    return readStrings.get(v);
  }
  if (typeof v !== 'object' || v === null) return read();
  let known = readObjects.get(v);
  if (!known) {
    known = { v: read() };
    readObjects.set(v, known);
  }
  return known.v;
}

const epochs = new WeakMap<World, Map<string, string[]>>();

/**
 * The records of a count's zero day (core/time.ts, DAY_COUNTS): each event/epoch whose `calendar` claim
 * names the count. There should be one, and the validator says so where there is not.
 */
export function epochsOf(world: World, calendar: string): string[] {
  let known = epochs.get(world);
  if (!known) {
    known = new Map();
    for (const e of world.entities) {
      if (!kindIs(e.kind, 'event/epoch')) continue;
      for (const c of e.claims) if (c.prop === 'calendar' && c.status !== 'deprecated' && typeof c.value === 'string') known.set(c.value, [...new Set([...(known.get(c.value) ?? []), e.id])]);
    }
    epochs.set(world, known);
  }
  return known.get(calendar) ?? [];
}

/** Is a record the zero day of a count of days? Its date moves every date written in that count. */
export function isEpoch(world: World, id: string): boolean {
  const e = world.entity.get(id);
  return !!e && kindIs(e.kind, 'event/epoch') && e.claims.some((c) => c.prop === 'calendar');
}

/**
 * The days a date in a count of days names, on the axis, in a scenario: the count's zero day as the
 * scenario's chosen claim dates it, and so many days on, counted on the calendar, day for day. A zero day
 * given as a range of days gives a range. Undefined where no record is the zero day, or its date is not
 * days of the calendar (a reference, a distribution, a time before day numbers begin).
 */
export function countDays(world: World, v: { calendar: string; days: number }, s: Scenario = {}): [number, number] | undefined {
  const c = zeroDayClaim(world, v.calendar, s);
  const zero = c ? timeOrUndefined(c.value) : undefined;
  if (!zero || (zero.kind !== 'instant' && zero.kind !== 'interval')) return undefined;
  const [lo, hi] = bounds(zero);
  const first = dayNumberAt(lo);
  // An interval's end is the start of the day after its last.
  const last = zero.kind === 'instant' ? first : dayNumberAt(hi - 1e-7);
  if (first === undefined || last === undefined || !Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
  // A day of the era before the zero day is counted back from it; day numbers begin in 4713 BCE.
  if (first + v.days < 0) return undefined;
  const end = dayOnAxis(last + v.days);
  return [dayOnAxis(first + v.days).t, end.t + end.whole];
}

/** The claim that dates a count's zero day in a scenario: the correlation every date in the count rests on there. */
export function zeroDayClaim(world: World, calendar: string, s: Scenario = {}): Claim | undefined {
  const [epoch] = epochsOf(world, calendar);
  const g = epoch ? claimGroup(world, epoch, 'date') : undefined;
  return g && chosen(g, s);
}

/** A day in a count of days, as a claim's value or a bound of a span gives it: the count and the days, or undefined. */
export function countOf(v: unknown): { calendar: string; days: number; text: string } | undefined {
  if (!isCount(v)) return undefined;
  const t = timeOrUndefined(v);
  return t?.kind === 'count' ? t : undefined;
}

/** A day named in cycles, as a claim's value gives it, or undefined. */
export function cycleOf(v: unknown): CycleDate | undefined {
  if (!isCycle(v)) return undefined;
  const t = timeOrUndefined(v);
  return t?.kind === 'cycle' ? t : undefined;
}

/** The record whose day anchors a cycle (core/time.ts, CYCLES): an event/epoch with `calendar` naming the cycle. */
export const anchorsOf = (world: World, cycle: string) => epochsOf(world, cycle);

/** The name an anchor gives its day in its cycle, from its `day_name` claim: the place, or undefined. */
export function anchorPlace(world: World, id: string, cycle: string): number | undefined {
  const c = world.entity.get(id)?.claims.find((x) => x.prop === 'day_name' && x.status !== 'deprecated' && x.rank !== 'deprecated');
  const v = typeof c?.value === 'string' ? parseCycle(c.value) : undefined;
  const name = CYCLES[cycle]?.unit === 'year' ? v?.year : v?.day;
  return name && name.cycle === cycle ? name.place : undefined;
}

/**
 * Where a cycle meets our days in a scenario: the day the anchor's chosen date gives, and the place its `day_name`
 * gives it. For a cycle of years the anchor is the first day of the year it names. Undefined where no record
 * anchors the cycle, or its date is not one day of the calendar.
 */
export function cycleAnchor(world: World, cycle: string, s: Scenario = {}): CycleAnchor | undefined {
  const [id] = anchorsOf(world, cycle);
  const place = id === undefined ? undefined : anchorPlace(world, id, cycle);
  const days = place === undefined ? undefined : countDays(world, { calendar: cycle, days: 0 }, s);
  if (!days) return undefined;
  const first = dayNumberAt(days[0]);
  const last = dayNumberAt(days[1] - 1e-7);
  return first !== undefined && first === last ? { jdn: first, place: place! } : undefined;
}

/** The anchors a date in cycles needs, in a scenario: one for each cycle it names. */
export function anchorsFor(world: World, v: CycleDate, s: Scenario = {}): { day?: CycleAnchor; year?: CycleAnchor } {
  return { day: v.day && cycleAnchor(world, v.day.cycle, s), year: v.year && cycleAnchor(world, v.year.cycle, s) };
}

/**
 * The days a date in cycles comes to, between two places on the axis: as runs of day numbers (a day each, or the
 * part of a year named alone). Undefined where a cycle it names has no anchor, or the window is open or too wide
 * to say.
 */
export function cycleCandidates(world: World, v: CycleDate, lo: number, hi: number, s: Scenario = {}): [number, number][] | undefined {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
  const first = dayNumberAt(lo);
  const last = dayNumberAt(Math.max(lo, hi - 1e-7));
  if (first === undefined || last === undefined) return undefined;
  return cycleDays(v, anchorsFor(world, v, s), first, last);
}

/** The point a claim of a moment's property dates. */
function claimPoint(world: World, c: Claim): string {
  return c.prop === 'end' || c.prop === 'end_before' ? pointOf(world, c.subject, 'end') : pointOf(world, c.subject, 'start');
}

/**
 * How a date in cycles comes out in a scenario, against the rest of the evidence: the window that evidence leaves
 * the claim's point, and the days in it that bear the names. One run: the day it is. Several: one of them, which
 * the evidence does not decide. None: the names disagree with the rest of the evidence, and the nearest day that
 * bears them is given, to say how far. Undefined where it cannot be said: no anchor, an open or a contradictory
 * window.
 */
export interface CycleResolution {
  window: [number, number];
  days: [number, number][];
  nearest?: [number, number];
}

/** The solutions of each scenario's network without its dates in cycles: the window each such date is read in. */
const restSolutions = new WeakMap<World, Map<string, Solution>>();

export function resolveCycle(world: World, c: Claim, s: Scenario = {}): CycleResolution | undefined {
  const v = cycleOf(c.value);
  if (!v) return undefined;
  let known = restSolutions.get(world);
  if (!known) restSolutions.set(world, (known = new Map()));
  const key = scenarioKey(s);
  let rest = known.get(key);
  if (!rest) {
    const net = restNetwork(world, s, false);
    rest = solve(net.points, net.constraints);
    known.set(key, rest);
  }
  return rest.ok ? resolveIn(world, v, rest.bounds.get(claimPoint(world, c)), s) : undefined;
}

function resolveIn(world: World, v: CycleDate, b: { lo: number; hi: number } | undefined, s: Scenario): CycleResolution | undefined {
  if (!b) return undefined;
  const days = cycleCandidates(world, v, b.lo, b.hi, s);
  if (!days) return undefined;
  const out: CycleResolution = { window: [b.lo, b.hi], days };
  if (!days.length) {
    // The nearest days of that name on either side of the window: a turn of the cycles back and forth is enough.
    const turn = 366 * 52;
    const first = dayNumberAt(b.lo)!;
    const last = dayNumberAt(Math.max(b.lo, b.hi - 1e-7))!;
    const before = cycleDays(v, anchorsFor(world, v, s), first - turn, first - 1)?.at(-1);
    const after = cycleDays(v, anchorsFor(world, v, s), last + 1, last + turn)?.[0];
    out.nearest = !before ? after : !after ? before : first - before[1] <= after[0] - last ? before : after;
  }
  return out;
}

/** What a date in cycles says, as constraints, given the window the rest of the evidence leaves its point. */
function cycleConstraints(world: World, c: Claim, b: { lo: number; hi: number } | undefined, s: Scenario): Constraint[] {
  const v = cycleOf(c.value);
  const r = v && resolveIn(world, v, b, s);
  const runs = r ? (r.days.length ? r.days : r.nearest ? [r.nearest] : []) : [];
  if (!runs.length) return [];
  const lo = dayOnAxis(runs[0][0]).t;
  const end = dayOnAxis(runs.at(-1)![1]);
  const hi = end.t + end.whole;
  // One day is held at its middle. Two days that touch at midnight share an instant, and the solver forgives a
  // thousandth of a year (core/stn.ts): held whole, a native date a day off the other side's would agree with it.
  const one = runs.length === 1 && runs[0][0] === runs[0][1];
  const [a, z] = one ? [(lo + hi) / 2, (lo + hi) / 2] : [lo, hi];
  return [{ source: c.ref, from: ORIGIN, to: claimPoint(world, c), lo: a, hi: z, note: r!.days.length ? 'a day of that name' : 'the nearest day of that name' }];
}

/**
 * The network for a scenario. With `centres`, each dated claim is pinned to its central value
 * instead of its bounds: solving that gives best estimates for derived dates.
 */
export function buildNetwork(world: World, s: Scenario = {}, centres = false): { points: string[]; constraints: Constraint[] } {
  // A pick changes one group's claim, in a network otherwise its picture's: there are thousands of picks.
  if (s.picks?.length === 1) {
    const quick = pickedNetwork(world, s, centres);
    if (quick) return quick;
  }
  return wholeNetwork(world, s, centres);
}

const pictureNetworks = new WeakMap<World, Map<string, { points: string[]; constraints: Constraint[] }>>();

/**
 * A picture's network, made once per world: the picks in it are made from it, sharing its points
 * and its unchanged constraints, so comparing a pick with its picture is cheap (solveChanged).
 */
export function pictureNetwork(world: World, picture: Scenario, centres = false): { points: string[]; constraints: Constraint[] } {
  let known = pictureNetworks.get(world);
  if (!known) {
    known = new Map();
    pictureNetworks.set(world, known);
  }
  const key = `${scenarioKey(picture)}|${centres}`;
  let base = known.get(key);
  if (!base) {
    base = wholeNetwork(world, picture, centres);
    known.set(key, base);
  }
  return base;
}

/** A picture's network, with one group's constraints changed for the claim picked; undefined if that cannot be done in place. */
function pickedNetwork(world: World, s: Scenario, centres: boolean): { points: string[]; constraints: Constraint[] } | undefined {
  const pick = s.picks![0];
  const { record, part } = splitRef(pick);
  const claim = world.entity.get(record)?.claims.find((c) => c.key === part);
  const g = claim && claimGroup(world, claim.subject, claim.prop);
  if (!claim || !g || !world.vocab.properties[g.prop]?.moment) return undefined;
  // A zero day's date moves every date written in its count, and a day others count days from moves them: nothing to
  // change in place.
  if (isEpoch(world, splitRef(claim.subject).record) || countedFrom(world).has(claim.subject)) return undefined;
  const picture: Scenario = s.alts?.length ? { alts: s.alts } : {};
  const before = chosen(g, picture);
  if (!before) return undefined;
  const base = pictureNetwork(world, picture, centres);
  const at = base.constraints.findIndex((c) => c.source === before.ref);
  if (at < 0) return undefined;
  // In place, so that the order of the constraints, on which ties in the solver turn, is the same as if made whole.
  const count = base.constraints.filter((c) => c.source === before.ref).length;
  const mine = claimConstraints(world, g.prop, claim, centres, s);
  return { points: base.points, constraints: [...base.constraints.slice(0, at), ...mine, ...base.constraints.slice(at + count)] };
}

/** What one dated claim says, as constraints, in a scenario: a date in a count of days follows the scenario's zero day. */
function claimConstraints(world: World, prop: string, c: Claim, centres: boolean, s: Scenario): Constraint[] {
  const out: Constraint[] = [];
  const add = (x: Constraint) => out.push(x);
  if (!subjectExists(world, c.subject)) return out;
  let v = timeOrUndefined(c.value);
  if (!v) return out;
  // A bound says only that the point lies before a time, or after one: of a moment, or of a lasting thing's end.
  const before = prop === 'earlier_than' || prop === 'end_before';
  const after = prop === 'later_than';
  const point = prop === 'end' || prop === 'end_before' ? pointOf(world, c.subject, 'end') : pointOf(world, c.subject, 'start');
  const source = c.ref;
  if (v.kind === 'count') {
    const days = countDays(world, v, s);
    if (!days) return out; // no zero day to count from: the validator reports it
    v = { kind: 'interval', lo: days[0], hi: days[1] };
  }
  if (v.kind === 'ref') {
    if (!subjectExists(world, v.ref)) return out; // a wanted record: nothing to constrain by yet
    // A lag in days from a day its record dates is counted on the calendar, to the days it lands on: carried as years
    // of 365.25 days, or even as the years between the two days, it straddles two days where the years differ in length.
    const from = v.lagDays && v.edge && !before && !after ? datedDay(world, v.ref, v.edge, s) : undefined;
    if (from !== undefined) {
      const last = dayOnAxis(from + v.lagDays![1]);
      const [a, z] = [dayOnAxis(from + v.lagDays![0]).t, last.t + last.whole];
      add({ source, from: ORIGIN, to: point, ...(centres ? { lo: (a + z) / 2, hi: (a + z) / 2 } : { lo: a, hi: z }), note: `${v.lagDays![0] === v.lagDays![1] ? v.lagDays![0] : `${v.lagDays![0]}–${v.lagDays![1]}`} days on the calendar after a dated day` });
      return out;
    }
    const [lo, hi] = v.lag;
    if (v.edge) {
      const tp = pointOf(world, v.ref, v.edge);
      if (before) add({ source, from: point, to: tp, lo, hi: Infinity, note: 'earlier than' });
      else if (after) add({ source, from: tp, to: point, lo, hi: Infinity, note: 'later than' });
      else add({ source, from: tp, to: point, lo, hi });
    } else if (before) {
      add({ source, from: point, to: pointOf(world, v.ref, 'start'), lo: 0, hi: Infinity, note: 'earlier than' });
    } else if (after) {
      add({ source, from: pointOf(world, v.ref, 'end'), to: point, lo: 0, hi: Infinity, note: 'later than' });
    } else {
      add({ source, from: pointOf(world, v.ref, 'start'), to: point, lo: 0, hi: Infinity, note: 'within' });
      add({ source, from: point, to: pointOf(world, v.ref, 'end'), lo: 0, hi: Infinity, note: 'within' });
    }
    return out;
  }
  if (v.kind === 'unknown') return out;
  const [lo, hi] = centres && !before && !after ? centre(v) : bounds(v);
  if (before) add({ source, from: ORIGIN, to: point, lo: -Infinity, hi, note: 'earlier than' });
  else if (after) add({ source, from: ORIGIN, to: point, lo, hi: Infinity, note: 'later than' });
  else if (Number.isFinite(lo) || Number.isFinite(hi)) add({ source, from: ORIGIN, to: point, lo, hi });
  return out;
}

const countedFroms = new WeakMap<World, Set<string>>();

/** The subjects some claim counts a lag in days from: a pick of their dates moves those claims' days too. */
function countedFrom(world: World): Set<string> {
  let known = countedFroms.get(world);
  if (!known) {
    known = new Set();
    for (const e of world.entities) {
      for (const c of e.claims) {
        const v = world.vocab?.properties[c.prop]?.moment ? timeOrUndefined(c.value) : undefined;
        if (v?.kind === 'ref' && v.lagDays) known.add(splitRef(v.ref).phase ? v.ref : splitRef(v.ref).record);
      }
    }
    countedFroms.set(world, known);
  }
  return known;
}

/**
 * The day number of the day a subject's edge is dated to by its own chosen claim in a scenario, where that claim
 * names one day of the calendar (a date, a day number, a day in a count). Undefined otherwise: a range, a year, a
 * reference to another record.
 */
function datedDay(world: World, subject: string, edge: 'start' | 'end', s: Scenario): number | undefined {
  const g = claimGroup(world, subject, isMoment(world, subject) ? 'date' : edge);
  const c = g && chosen(g, s);
  let v = c ? timeOrUndefined(c.value) : undefined;
  if (v?.kind === 'count') {
    const days = countDays(world, v, s);
    v = days && { kind: 'interval', lo: days[0], hi: days[1] };
  }
  if (!v || (v.kind !== 'instant' && v.kind !== 'interval')) return undefined;
  const [lo, hi] = bounds(v);
  const first = dayNumberAt(lo);
  return first !== undefined && (v.kind === 'instant' || first === dayNumberAt(hi - 1e-7)) ? first : undefined;
}

/** A place on the axis, with the length of the calendar unit it names. */
export interface SpanPoint {
  t: number;
  whole: number;
}

/** A bound of a span: a place on the axis, or the start or end of another record, wherever the evidence puts that. */
export type SpanBound = SpanPoint | { ref: string; edge: 'start' | 'end' };

export interface Span {
  lo?: SpanBound;
  hi?: SpanBound;
  /** one time at which it held */
  at?: SpanPoint;
}

/**
 * The span a `valid` gives, of a relation or of a claim: from a time to a time, either left open, or one time at
 * which it held. A bound is a year, a month, a day or a point, and one that names a calendar unit lies somewhere
 * in it: "from 1871" is from some day of 1871. Or a bound names the start or the end of another record, `{ ref,
 * edge }`, as "until his death" or "until the war ended" do: then it is not a date written twice, and it moves
 * with that record's evidence. Undefined for a `valid` that is neither (the validator reports it).
 */
export function spanOf(
  valid: unknown,
  /** where a bound is on the axis; a bound it cannot place yet (a day in a count with no zero day) is left open */
  at: (x: number | string) => SpanPoint | undefined = (x) => (isCount(x) ? (parseTime(x), undefined) : parsePoint(x)),
): Span | undefined {
  try {
    if (typeof valid === 'number' || typeof valid === 'string') return valid === 'unknown' ? undefined : { at: at(valid) };
    if (!valid || typeof valid !== 'object') return undefined;
    const { lo, hi, ...rest } = valid as { lo?: unknown; hi?: unknown };
    if (Object.keys(rest).length || (lo === undefined && hi === undefined)) return undefined;
    let bad = false;
    const bound = (x: unknown): SpanBound | undefined => {
      if (x === undefined || x === 'unknown') return undefined;
      if (typeof x === 'object' && x !== null) {
        const { ref, edge, ...more } = x as { ref?: unknown; edge?: unknown };
        if (typeof ref !== 'string' || (edge !== 'start' && edge !== 'end') || Object.keys(more).length) bad = true;
        return bad ? undefined : { ref: ref as string, edge: edge as 'start' | 'end' };
      }
      return at(x as never);
    };
    const span: Span = { lo: bound(lo), hi: bound(hi) };
    if (bad) return undefined;
    if (span.lo && span.hi && !('ref' in span.lo) && !('ref' in span.hi) && span.lo.t > span.hi.t + span.hi.whole) return undefined;
    return span;
  } catch {
    return undefined;
  }
}

/** The records a span's bounds name, as written (local shorthand and all). */
/**
 * A span as its turn among others: from where its first unit starts to where its last unit starts, an open end
 * infinite, so that a name dropped on the day the next was taken, or in the same year, has had its turn by then.
 * Undefined if a bound names a record.
 */
export function turnOf(span: Span | undefined): [number, number] | undefined {
  if (!span) return undefined;
  if (span.at) return [span.at.t, span.at.t + span.at.whole];
  if ((span.lo && 'ref' in span.lo) || (span.hi && 'ref' in span.hi)) return undefined;
  return [span.lo ? span.lo.t : -Infinity, span.hi ? span.hi.t : Infinity];
}

/**
 * Whether claims each hold for a span of their own, no two at once, as a state's official names do in turn. Such
 * claims do not compete, and none of them need be preferred.
 */
export function inTurn(claims: readonly { valid?: unknown }[]): boolean {
  if (claims.length < 2) return false;
  const spans = claims.map((c) => (c.valid === undefined ? undefined : turnOf(spanOf(c.valid))));
  return spans.every((x) => x) && spans.every((a, i) => spans.every((b, j) => i >= j || a![1] <= b![0] || b![1] <= a![0]));
}

export function spanRefs(span: Span | undefined): string[] {
  return [span?.lo, span?.hi].flatMap((b) => (b && 'ref' in b ? [b.ref] : []));
}

/** The subject a bound of a span names, with local shorthand read as its own record's; undefined if it is no subject. */
export function edgeSubject(ref: string, self: string): string | undefined {
  try {
    const r = parseRef(ref, self);
    return r.type === 'entity' && !r.part ? (r.phase ? `${r.id}@${r.phase}` : r.id) : undefined;
  } catch {
    return undefined;
  }
}

/** A bound of a span on the axis, in a scenario: a point as written, or the days a date in a count of days comes to there. */
function boundIn(world: World, x: number | string, s: Scenario): SpanPoint | undefined {
  const count = countOf(x);
  if (!count) return isCount(x) ? undefined : parsePoint(x);
  const days = countDays(world, count, s);
  return days && { t: days[0], whole: days[1] - days[0] };
}

function wholeNetwork(world: World, s: Scenario, centres: boolean): { points: string[]; constraints: Constraint[] } {
  return networkOf(world, s, centres, true);
}

/**
 * A scenario's network. Dates written in cycles come last, with `cycles`: each names a set of days, and is read in
 * the window the rest of the evidence leaves its point, in the same scenario.
 */
function networkOf(world: World, s: Scenario, centres: boolean, cycles: boolean): { points: string[]; constraints: Constraint[] } {
  const net = restNetwork(world, s, centres);
  if (!cycles) return net;
  const alts = new Set(s.alts ?? []);
  const beside = claimGroups(world).flatMap((g) => g.beside.filter((c) => c.rank !== 'deprecated' && (!c.alt || alts.has(c.alt)) && subjectExists(world, c.subject)));
  if (!beside.length) return net;
  let known = restSolutions.get(world);
  if (!known) restSolutions.set(world, (known = new Map()));
  const key = scenarioKey(s);
  let rest = known.get(key);
  if (!rest) {
    const plain = centres ? restNetwork(world, s, false) : net;
    rest = solve(plain.points, plain.constraints);
    known.set(key, rest);
  }
  if (!rest.ok) return net; // the rest does not hold: the validator says why, and a date in cycles has no window to be read in
  const bounds = rest.bounds;
  return { points: net.points, constraints: [...net.constraints, ...beside.flatMap((c) => cycleConstraints(world, c, bounds.get(claimPoint(world, c)), s))] };
}

function restNetwork(world: World, s: Scenario, centres: boolean): { points: string[]; constraints: Constraint[] } {
  const points = new Set<string>();
  const constraints: Constraint[] = [];
  const add = (c: Constraint) => constraints.push(c);
  for (const e of world.entities) {
    const start = pointOf(world, e.id, 'start');
    const end = pointOf(world, e.id, 'end');
    points.add(start).add(end);
    if (start !== end) add({ source: e.id, from: start, to: end, lo: 0, hi: Infinity, note: 'starts before it ends' });
    // Phases tile the lifetime: the first starts with the entity, each ends as the next
    // starts, and the last ends with the entity.
    let prev = start;
    for (const p of e.phases) {
      const ps = `${e.id}@${p.id}|start`;
      const pe = `${e.id}@${p.id}|end`;
      points.add(ps).add(pe);
      add({ source: e.id, from: prev, to: ps, lo: 0, hi: 0, note: prev === start ? `phase ${p.id} starts with the entity` : `phase ${p.id} starts as the one before it ends` });
      add({ source: e.id, from: ps, to: pe, lo: 0, hi: Infinity, note: `phase ${p.id} starts before it ends` });
      prev = pe;
    }
    if (e.phases.length) add({ source: e.id, from: prev, to: end, lo: 0, hi: 0, note: 'the last phase ends with the entity' });
  }
  for (const g of claimGroups(world)) {
    const prop = world.vocab.properties[g.prop];
    if (!prop?.moment) continue;
    const c = chosen(g, s);
    if (c) constraints.push(...claimConstraints(world, g.prop, c, centres, s));
  }
  for (const r of relationsIn(world, s)) {
    const type = world.vocab.relations[r.rel];
    if (!type || !subjectExists(world, r.subject) || !subjectExists(world, r.to)) continue;
    // A relation that holds over a span, and says which: the span lies within both lifetimes. A bound written in a
    // count of days is the days it comes to in this scenario.
    const span = type.span && r.valid !== undefined ? spanOf(r.valid, (x) => boundIn(world, x, s)) : undefined;
    if (span) {
      const start = `${r.ref}|start`;
      const end = `${r.ref}|end`;
      points.add(start).add(end);
      const pin = (p: SpanPoint): [number, number] => (centres ? [p.t + p.whole / 2, p.t + p.whole / 2] : [p.t, p.t + p.whole]);
      // A bound is a date, or the edge of another record, which it then shares: "until his death".
      const bind = (b: SpanBound | undefined, point: string, note: string) => {
        if (!b) return;
        if (!('ref' in b)) return add({ source: r.ref, from: ORIGIN, to: point, lo: pin(b)[0], hi: pin(b)[1], note });
        const target = edgeSubject(b.ref, r.entity);
        if (target && subjectExists(world, target)) add({ source: r.ref, from: pointOf(world, target, b.edge), to: point, lo: 0, hi: 0, note });
      };
      bind(span.lo, start, 'it held from then');
      bind(span.hi, end, 'it held until then');
      if (span.at) {
        add({ source: r.ref, from: ORIGIN, to: start, lo: -Infinity, hi: span.at.t + span.at.whole, note: 'it held by then' });
        add({ source: r.ref, from: ORIGIN, to: end, lo: span.at.t, hi: Infinity, note: 'it still held then' });
      }
      add({ source: r.ref, from: start, to: end, lo: 0, hi: Infinity, note: 'it holds from its start to its end' });
      for (const who of [r.subject, r.to]) {
        add({ source: r.ref, from: pointOf(world, who, 'start'), to: start, lo: 0, hi: Infinity, note: 'both were there while it held' });
        add({ source: r.ref, from: end, to: pointOf(world, who, 'end'), lo: 0, hi: Infinity, note: 'both were there while it held' });
      }
      continue;
    }
    if (!type.time) continue;
    let lag: [number, number] = [0, Infinity];
    try {
      lag = parseLag(r.lag);
    } catch {
      continue; // the validator reports it
    }
    const at = (x: string) => {
      const [who, edge] = x.split('.') as ['self' | 'other', 'start' | 'end'];
      return pointOf(world, who === 'self' ? r.subject : r.to, edge);
    };
    for (const t of type.time) {
      const [lo, hi] = t.lag ? lag : [0, Infinity];
      add({ source: r.ref, from: at(t.from), to: at(t.to), lo, hi });
    }
  }
  return { points: [...points], constraints };
}

/** Whether a scenario holds, and if not why, without working out its dates. */
export function conflictInScenario(world: World, s: Scenario = {}, centres = false): Conflict | undefined {
  const { points, constraints } = buildNetwork(world, s, centres);
  return conflictIn(points, constraints);
}

export function solveScenario(world: World, s: Scenario = {}, centres = false): Solution {
  const { points, constraints } = buildNetwork(world, s, centres);
  return solve(points, constraints);
}

export interface Variant {
  key: string;
  scenario: Scenario;
  solution: Solution;
  /** the same scenario with dated claims pinned to their centres (for best estimates) */
  centres: Solution;
}

/** The pictures to check or show: the default, and each given alternative on top of it. */
export function pictures(world: World, alternatives: string[] = world.alternatives.filter((a) => a.type === 'alternative').map((a) => a.id)): Scenario[] {
  return [{}, ...alternatives.map((a) => ({ alts: [a] }))];
}

/**
 * Each picture, and each picture with one competing dated claim, or one rival relation, picked over the
 * default. Combinations of picks are not worked out. The first of a picture's is the picture itself.
 */
export function* scenariosOf(world: World, alternatives?: string[]): Generator<Scenario> {
  for (const p of pictures(world, alternatives)) {
    yield p;
    for (const g of claimGroups(world)) {
      if (!world.vocab.properties[g.prop]?.moment) continue;
      const avail = available(g, p);
      if (avail.length < 2) continue;
      const def = chosen(g, p);
      for (const c of avail) if (c !== def) yield { ...p, picks: [c.ref] };
    }
    for (const r of rivalsIn(world, p)) yield { ...p, picks: [r.ref] };
  }
}

type Bound = NonNullable<ReturnType<Bounds['get']>>;

/** Bounds kept as what differs from another solution's: reading one falls through to the other. */
class BoundsOver extends Map<string, Bound> {
  /** what it is kept over: its own entries are only what differs from this */
  readonly keptOver: Bounds;
  constructor(private base: Bounds) {
    super();
    this.keptOver = base;
  }
  override get(point: string): Bound | undefined {
    return super.get(point) ?? this.base.get(point);
  }
}

const sameBound = (a: Bound, b: Bound) => a.lo === b.lo && a.hi === b.hi && a.loBy.length === b.loBy.length && a.hiBy.length === b.hiBy.length && a.loBy.every((x, i) => x === b.loBy[i]) && a.hiBy.every((x, i) => x === b.hiBy[i]);

/** A solution with only what differs from a base kept: a pick moves a few dates, and there are thousands of picks. */
function overBase(sol: Solution, base: Bounds | undefined): Solution {
  if (!sol.ok || !base) return sol;
  const out = new BoundsOver(base);
  for (const [point, b] of sol.bounds) {
    const was = base.get(point);
    if (!was || !sameBound(b, was)) out.set(point, b);
  }
  return { ok: true, bounds: out };
}

/**
 * Solve each picture, and each picture with one competing dated claim picked over the default.
 * Each is kept only as it differs from its picture, and each picture as it differs from the default.
 */
export function solveVariants(world: World, alternatives?: string[]): Variant[] {
  const out: Variant[] = [];
  const boundsOf = (s: Solution) => (s.ok ? s.bounds : undefined);
  let rootSol: Bounds | undefined;
  let rootCentres: Bounds | undefined;
  let picture: Variant | undefined;
  type Network = ReturnType<typeof buildNetwork>;
  let nets: { sol: Network; centres: Network } | undefined;
  // A pick, solved again only in the pieces of the network its claim is in (solveChanged).
  const picked = (net: Network, base: Bounds | undefined, s: Scenario, centres: boolean): Solution => {
    const mine = buildNetwork(world, s, centres);
    const quick = base && solveChanged({ ...net, bounds: base }, mine.points, mine.constraints);
    if (!quick) return overBase(solve(mine.points, mine.constraints), base);
    if (!quick.ok) return quick;
    const bounds = new BoundsOver(base!);
    for (const [point, b] of quick.changed) bounds.set(point, b);
    return { ok: true, bounds };
  };
  for (const scenario of scenariosOf(world, alternatives)) {
    let v: Variant;
    if (!scenario.picks?.length) {
      nets = { sol: pictureNetwork(world, scenario), centres: pictureNetwork(world, scenario, true) };
      const sol = solve(nets.sol.points, nets.sol.constraints);
      const centres = solve(nets.centres.points, nets.centres.constraints);
      v = { key: scenarioKey(scenario), scenario, solution: overBase(sol, rootSol), centres: overBase(centres, rootCentres) };
      picture = v;
      if (!rootSol) {
        rootSol = boundsOf(v.solution);
        rootCentres = boundsOf(v.centres);
      }
    } else {
      v = {
        key: scenarioKey(scenario),
        scenario,
        solution: picked(nets!.sol, boundsOf(picture!.solution), scenario, false),
        centres: picked(nets!.centres, boundsOf(picture!.centres), scenario, true),
      };
    }
    out.push(v);
  }
  return out;
}
