// Entity records for the inspect panel, features for tiles, periods, and the search index.
import { footprintText, type Footprint } from '../../../../core/footprint.ts';
import { lifewayText, outbuildingsText, specText, townText, type DwellingSpec, type LifewayWord, type OutbuildingSpec, type TownSpec } from '../../../../core/dwelling.ts';
import { levelOf } from '../../../../core/ladder.ts';
import type { FormSpec } from '../../../../core/city.ts';
import type { CitationRecord, ClaimRecord, EntityRecord, InverseRecord, PeriodRecord, RelationRecord, SearchFile, SourceRecord, VariantRecord } from '../../../../core/records.ts';
import { conj, rotate, toLatLon, unitVector } from '../../../../core/quat.ts';
import { parseRef, splitRef } from '../../../../core/refs.ts';
import type { RotationModel } from '../../../../core/rotation-model.ts';
import type { Bounds, Solution } from '../../../../core/stn.ts';
import { bounds, centre, dayOnAxis, formatDuration, formatTimeValue, historical, parseLag, parseTime, PRESENT_YEAR } from '../../../../core/time.ts';
import type { Basis, Estimate, Feature, FeatureMove, FeatureBasis, FeatureName, FeatureTime } from '../../../../core/tileset.ts';
import { anchorsOf, chosen, claimGroup, countDays, countOf, cycleOf, edgeSubject, epochsOf, inTurn, isBeside, pointOf, resolveCycle, rivalsIn, scenarioKey, spanOf, subjectExists, zeroDayClaim, type ClaimGroup, type Scenario, type SpanBound, type Variant } from '../chronology.ts';
import { BASES, isMoment, type Claim, type Entity, type Source, type World } from '../world.ts';

/** A form in words, for its claim: its type and what is known of it. */
function formText(f: FormSpec): string {
  const known = Object.entries(f).filter(([k]) => k !== 'type').map(([k, v]) => `${k.replace(/_/g, ' ')} ${v === true ? 'yes' : v === false ? 'no' : k.endsWith('height') || k === 'width' || k === 'depth' || k === 'diameter' ? `${v} m` : k === 'faces' ? `${v}°` : v}`);
  return known.length ? `${f.type}: ${known.join(', ')}` : f.type;
}

const mid = (lo: number, hi: number) => (Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : Number.isFinite(lo) ? lo : Number.isFinite(hi) ? hi : null);

/** The weakest basis: evidence, then reconstruction, projection and procedural. */
export function weakest(bases: Basis[]): Basis {
  return bases.reduce<Basis>((w, b) => (BASES.indexOf(b) > BASES.indexOf(w) ? b : w), 'evidence');
}

/** What the build knows about the world once its chronology is solved. */
export interface Solved {
  world: World;
  /** the default picture */
  sol: Solution & { ok: true };
  centres: Solution;
  /** every other scenario solved */
  variants: Variant[];
  groups: ClaimGroup[];
  model: RotationModel;
}

const boundsOf = (s: Solution) => (s.ok ? s.bounds : undefined);

/**
 * Bounds come from the network with every claim at its full range; the best estimate from
 * the same network with each claim pinned to its centre, so a date derived from "after X"
 * starts at X's central value rather than at the edge of X's uncertainty.
 */
function estimate(b: Bounds, centres: Bounds | undefined, point: string, direct: boolean): Estimate {
  const v = b.get(point)!;
  const c = centres?.get(point);
  return { best: c ? mid(c.lo, c.hi) : mid(v.lo, v.hi), lo: v.lo, hi: v.hi, derived: !direct };
}

/** Does a claimed time bound only one side, such as "younger than 3.4 Ga"? */
function oneSided(c: Claim): boolean {
  const v = parseTime(c.value as never);
  return v.kind === 'interval' && (!Number.isFinite(v.lo) || !Number.isFinite(v.hi));
}

/** The chosen claim of a subject's property in the default picture. */
export function claimOf(s: Solved, subject: string, prop: string): Claim | undefined {
  const g = claimGroup(s.world, subject, prop);
  return g ? chosen(g) : undefined;
}

function directTime(s: Solved, subject: string, prop: string): Claim | undefined {
  const c = claimOf(s, subject, prop);
  if (!c) return undefined;
  try {
    return parseTime(c.value as never).kind === 'ref' ? undefined : c;
  } catch {
    return undefined;
  }
}

function timeOf(s: Solved, subject: string, b: Bounds, centres?: Bounds): FeatureTime {
  const w = s.world;
  if (isMoment(w, subject)) {
    const e = estimate(b, centres, pointOf(w, subject, 'start'), !!directTime(s, subject, 'date'));
    const bounded = boundedBest(s, subject, b);
    if (bounded !== null) e.best = Math.min(Math.max(bounded, e.lo), e.hi);
    return { start: e, end: e, instant: true };
  }
  const endClaim = claimOf(s, subject, 'end');
  const end = estimate(b, centres, pointOf(w, subject, 'end'), !!directTime(s, subject, 'end'));
  const unknown = endClaim?.value === 'unknown';
  const { record: whole, phase: part } = splitRef(subject);
  // An end the kind shows at the latest time a range allows, as a taxon's last interval.
  if (!part && endClaim && !unknown && w.vocab.kinds[w.entity.get(whole)?.kind ?? '']?.end === 'latest' && Number.isFinite(end.hi)) end.best = end.hi;
  // Something with no stated or derivable end still holds.
  if ((!endClaim || unknown) && end.hi === Infinity) end.best = null;
  const { record, phase } = splitRef(subject);
  const latest = !phase && w.vocab.kinds[w.entity.get(record)?.kind ?? '']?.start === 'latest';
  const claimed = directTime(s, subject, 'start');
  const start = estimate(b, centres, pointOf(w, subject, 'start'), !!claimed);
  // A start the kind shows at the latest time the evidence allows, where no claim pins it:
  // at the best date of the member or subgroup that limits it, else at that limit; unknown
  // if nothing limits it, rather than at a bound or midway between bounds.
  if (latest && (!claimed || oneSided(claimed))) {
    const x = latestBest(s, subject, b, centres);
    const hi = (centres ?? b).get(pointOf(w, subject, 'start'))!.hi;
    start.best = x !== null ? Math.min(Math.max(x, start.lo), start.hi) : Number.isFinite(hi) ? hi : null;
  }
  const t: FeatureTime = { start, end, instant: false };
  if (unknown) t.endUnknown = true;
  return t;
}

/**
 * A moment whose date is bounded by one-sided evidence tighter than the rest ("before an ash
 * bed dated 555.3 Ma", within a 96 Myr period) is shown at that evidence, not midway through
 * the period: the solver says which claims set each bound.
 */
function boundedBest(s: Solved, subject: string, b: Bounds): number | null {
  const v = b.get(pointOf(s.world, subject, 'start'));
  if (!v) return null;
  const at = (refs: string[], prop: 'earlier_than' | 'later_than') => {
    for (const ref of refs) {
      const { record, part } = splitRef(ref);
      const c = record === subject ? s.world.entity.get(record)?.claims.find((x) => x.key === part && x.prop === prop) : undefined;
      const t = c ? parseTime(c.value as never) : undefined;
      if (t && t.kind !== 'ref' && Number.isFinite(centre(t)[0])) return centre(t)[0];
    }
    return null;
  };
  const before = Number.isFinite(v.hi) ? at(v.hiBy, 'earlier_than') : null;
  const after = Number.isFinite(v.lo) ? at(v.loBy, 'later_than') : null;
  return before !== null && after !== null ? (before + after) / 2 : (before ?? after);
}

/**
 * A start shown at the latest time the evidence allows is limited by a member (a fossil) or a
 * subgroup: show it at that record's best date, not at the edge of its uncertainty.
 */
function latestBest(s: Solved, subject: string, b: Bounds, centres: Bounds | undefined, depth = 0): number | null {
  const v = (centres ?? b).get(pointOf(s.world, subject, 'start'));
  if (!v || !Number.isFinite(v.hi) || depth > 50) return null;
  for (const src of v.hiBy) {
    const { record, part } = splitRef(src);
    const r = part ? s.world.entity.get(record)?.relations.find((x) => x.key === part) : undefined;
    if (!r || splitRef(r.to).record !== subject) continue;
    if (r.rel === 'member-of') return timeOf(s, r.subject, b, centres).start.best;
    if (r.rel === 'descends-from') return latestBest(s, r.subject, b, centres, depth + 1) ?? timeOf(s, r.subject, b, centres).start.best;
  }
  return null;
}

/** Are two times the same as written to a file? As JSON has it, every number that is not finite is null. */
function sameTime(a: FeatureTime, b: FeatureTime): boolean {
  const num = (x: number | null) => (x !== null && Number.isFinite(x) ? x : null);
  const same = (x: Estimate, y: Estimate) => num(x.best) === num(y.best) && num(x.lo) === num(y.lo) && num(x.hi) === num(y.hi) && x.derived === y.derived;
  return a.instant === b.instant && a.endUnknown === b.endUnknown && same(a.start, b.start) && same(a.end, b.end);
}

/**
 * The points of the network a subject's time is read from (timeOf): its start and end, and where its start is taken from
 * the members or forebears that limit it (latestBest), theirs, as the bounds given say which limit it. While a pick moves
 * none of these from its picture's bounds, the subject's time in it is its picture's.
 */
function pointsRead(s: Solved, subject: string, b: Bounds, centres: Bounds | undefined): string[] {
  const w = s.world;
  const out = new Set<string>();
  // The subjects whose limits have been followed: one reached first as a member, and not followed, may be reached again
  // as a forebear, and must be followed then.
  const followed = new Set<string>();
  const walk = (x: string, follow: boolean) => {
    const start = pointOf(w, x, 'start');
    out.add(start);
    out.add(pointOf(w, x, 'end'));
    const { record, phase } = splitRef(x);
    // What is limited by a member reads that member's time, whose start may be limited in turn; a forebear's start is
    // read whatever its kind.
    if (!follow && (phase || w.vocab.kinds[w.entity.get(record)?.kind ?? '']?.start !== 'latest')) return;
    if (followed.has(x)) return;
    followed.add(x);
    for (const src of (centres ?? b).get(start)?.hiBy ?? []) {
      const { record: from, part } = splitRef(src);
      const r = part ? w.entity.get(from)?.relations.find((y) => y.key === part) : undefined;
      if (!r || splitRef(r.to).record !== x) continue;
      if (r.rel === 'member-of') walk(r.subject, false);
      else if (r.rel === 'descends-from') walk(r.subject, true);
    }
  };
  walk(subject, false);
  return [...out];
}

/** Names in the default picture, and the one in use today. */
function namesOf(s: Solved, e: Entity): { label: string; names: FeatureName[] } {
  const text = (v: unknown) => {
    const m = v as Record<string, string>;
    return m.en ?? Object.values(m)[0];
  };
  const names: FeatureName[] = [];
  for (const c of e.claims) {
    if (c.prop !== 'name' || c.subject !== e.id || c.alt || c.status === 'deprecated' || c.rank === 'deprecated') continue;
    const n: FeatureName = { text: text(c.value) };
    // An unknown end: the name was dropped at some time no claim gives, so it is shown up
    // to the present, where today's name takes over.
    const span = validSpan(s, c.valid, e.id, PRESENT_YEAR);
    if (span) n.valid = span;
    names.push(n);
  }
  const chosenName = claimOf(s, e.id, 'name');
  // Today's names: those with no span, and those whose span is still open. Where every name has ended, the one
  // that ended last. (Not the names of 1950, the present of the time axis: a name taken since is today's.)
  const open = names.filter((n) => !n.valid || n.valid[1] === null);
  const last = Math.max(...names.map((n) => n.valid?.[1] ?? Infinity));
  const today = open.length ? open : names.filter((n) => n.valid?.[1] === last);
  const label = chosenName && (!chosenName.valid || today.some((n) => n.text === text(chosenName.value))) ? text(chosenName.value) : (today[0]?.text ?? names.at(-1)?.text ?? e.id);
  return { label, names };
}

/** Where the start or end of a subject is, at its best estimate in the default picture; null if open or unknown. */
function edgeBest(s: Solved, subject: string, edge: 'start' | 'end'): number | null {
  if (!subjectExists(s.world, subject)) return null;
  return timeOf(s, subject, s.sol.bounds, boundsOf(s.centres))[edge].best;
}

/**
 * When a claim holds, as years on the axis in the default picture: [from, to), an open end null. A bound that
 * names another record's start or end is where the evidence puts that. `unknownEnd`: what an end said to be
 * unknown is taken as. Undefined where the claim has no valid time, or one that cannot be read.
 */
export function validSpan(s: Solved, valid: unknown, self: string, unknownEnd: number | null = null): [number | null, number | null] | undefined {
  if (valid === undefined) return undefined;
  const span = spanOf(valid);
  if (!span) return undefined;
  if (span.at) return [span.at.t, span.at.t + (span.at.whole ? span.at.whole : 0)];
  const at = (b: SpanBound | undefined, end: boolean): number | null => {
    if (!b) return null;
    if ('ref' in b) {
      const subject = edgeSubject(b.ref, self);
      return subject ? edgeBest(s, subject, b.edge) : null;
    }
    return end ? b.t + b.whole : b.t;
  };
  const unknown = (valid as { hi?: unknown }).hi === 'unknown';
  return [at(span.lo, false), unknown ? unknownEnd : at(span.hi, true)];
}

/** Where a located entity is in its own frame, and on which plate. */
export interface Placement {
  frame: string;
  plate?: number;
  location: { lat: number; lon: number };
  basis: FeatureBasis;
  /** in a placeholder frame: drawn where it is today, because nothing says where it was */
  unplaced?: true;
}

/**
 * Carry a location from the frame it was measured in into the entity's frame (section 4.6):
 * present-day coordinates go into a plate frame by undoing that plate's rotation at the
 * present (the identity, for PALEOMAP).
 */
export function placement(s: Solved, e: Entity, subject: string = e.id): Placement | undefined {
  const loc = claimOf(s, subject, 'location');
  const fr = claimOf(s, subject, 'frame') ?? claimOf(s, e.id, 'frame');
  if (!loc || !fr) return undefined;
  const p = loc.value as { lat: number; lon: number; frame: string };
  const frame = s.world.frame.get(fr.value as string);
  if (!frame) return undefined;
  const plate = frame.kind === 'plate' ? frame.transform?.plate : undefined;
  let location = { lat: p.lat, lon: p.lon };
  if (plate !== undefined && p.frame === 'frame:earth/present-day') {
    const [lat, lon] = toLatLon(rotate(conj(s.model.total(plate, 0)), unitVector(p.lat, p.lon)));
    location = { lat, lon };
  }
  // A placeholder frame draws a place where it is today because nothing says where it was: a stand-in.
  const frameBasis: Basis = frame.kind === 'placeholder' ? 'procedural' : plate !== undefined ? 'reconstruction' : 'evidence';
  return {
    frame: frame.id,
    plate,
    location,
    basis: { time: 'evidence', place: weakest([loc.basis, fr.basis, frameBasis]), placeNow: loc.basis },
    ...(frame.kind === 'placeholder' ? { unplaced: true as const } : {}),
  };
}

/** The basis of a derived interval: the weakest of the claims and relations it rests on. */
function timeBasis(s: Solved, refs: string[]): Basis {
  const bases: Basis[] = [];
  for (const r of refs) {
    const { record, part: key } = splitRef(r);
    if (!key) continue;
    const e = s.world.entity.get(record);
    const x = e?.claims.find((c) => c.key === key) ?? e?.relations.find((y) => y.key === key);
    if (x) bases.push(x.basis);
  }
  return weakest(bases);
}

function derivedBy(b: Bounds, w: World, subject: string): { start: string[]; end: string[] } {
  // A date written in a count of days rests on the claim that dates the count's zero day too: the correlation. A date
  // named in cycles rests on the claims that date each cycle's anchor.
  const withZeroDay = (ref: string): string[] => {
    const { record, part: key } = splitRef(ref);
    const value = key ? w.entity.get(record)?.claims.find((c) => c.key === key)?.value : undefined;
    const count = countOf(value);
    const cycle = cycleOf(value);
    const calendars = count ? [count.calendar] : cycle ? [cycle.day?.cycle, cycle.year?.cycle].filter((x): x is string => !!x) : [];
    return [ref, ...calendars.flatMap((k) => zeroDayClaim(w, k)?.ref ?? [])];
  };
  const by = (p: string) => [...new Set([...b.get(p)!.loBy, ...b.get(p)!.hiBy].flatMap(withZeroDay))];
  return { start: by(pointOf(w, subject, 'start')), end: by(pointOf(w, subject, 'end')) };
}

function statusOf(e: Entity): Feature['status'] {
  const statuses = e.claims.map((c) => c.status);
  return statuses.includes('disputed') ? 'disputed' : statuses.every((x) => x === 'accepted') ? 'accepted' : 'proposed';
}

/**
 * Times under other scenarios, where they differ from what the viewer would otherwise use:
 * a picture's time where it differs from the default, a pick's where it differs from its
 * picture's.
 */
function variantTimes(s: Solved, subject: string, base: FeatureTime): Record<string, FeatureTime> {
  // Asked for several times of each subject, and each answer walks every variant: worked out once.
  let known = variantMemo.get(s);
  if (!known) {
    known = new Map();
    variantMemo.set(s, known);
  }
  const ready = known.get(subject);
  if (ready) return ready;
  const out: Record<string, FeatureTime> = {};
  const pictureTime = new Map<string, FeatureTime>();
  // Each picture's points the subject's time is read from, worked out when a pick of it is first asked.
  const pictureReads = new Map<string, string[]>();
  for (const v of s.variants) {
    if (v.scenario.picks?.length || !v.solution.ok) continue;
    pictureTime.set(v.key, timeOf(s, subject, v.solution.bounds, boundsOf(v.centres)));
  }
  const pictures = new Map(s.variants.filter((v) => !v.scenario.picks?.length).map((v) => [v.key, v]));
  const readsOf = (key: string): string[] | undefined => {
    if (!pictureReads.has(key)) {
      const p = pictures.get(key);
      if (p?.solution.ok) pictureReads.set(key, pointsRead(s, subject, p.solution.bounds, boundsOf(p.centres)));
    }
    return pictureReads.get(key);
  };
  // A pick's bounds are kept as what differs from its picture's (solveVariants): one that differs at none of these points.
  const moved = (b: Bounds | undefined, points: string[]) => !(b instanceof Map) || !('keptOver' in b) || points.some((p) => Map.prototype.has.call(b, p));
  for (const v of s.variants) {
    if (!v.key || !v.solution.ok) continue;
    const pictureKey = scenarioKey({ alts: v.scenario.alts });
    const fallback = v.scenario.picks?.length ? (pictureTime.get(pictureKey) ?? base) : base;
    // A pick that keeps every point the subject's time is read from as its picture has them changes nothing here.
    if (v.scenario.picks?.length) {
      const points = readsOf(pictureKey);
      if (points && !moved(v.solution.bounds, points) && !moved(boundsOf(v.centres), points)) continue;
    }
    const t = timeOf(s, subject, v.solution.bounds, boundsOf(v.centres));
    if (!sameTime(t, fallback)) out[v.key] = t;
  }
  known.set(subject, out);
  return out;
}

const variantMemo = new WeakMap<Solved, Map<string, Record<string, FeatureTime>>>();

/** A subject's interval (an entity's, or a phase's) in the default picture, and in the scenarios where it differs. */
export function subjectTime(s: Solved, subject: string): { time: FeatureTime; variants?: Record<string, FeatureTime> } {
  const time = timeOf(s, subject, s.sol.bounds, boundsOf(s.centres));
  const variants = variantTimes(s, subject, time);
  return Object.keys(variants).length ? { time, variants } : { time };
}

export function features(s: Solved): Feature[] {
  const out: Feature[] = [];
  for (const e of s.world.entities) {
    // A thing that moved says where it was in each of its phases.
    const moves: FeatureMove[] = [];
    for (const p of e.phases) {
      const subject = `${e.id}@${p.id}`;
      const at = placement(s, e, subject);
      if (at) moves.push({ label: p.label ?? p.id, ...(at.plate !== undefined ? { plate: at.plate } : {}), location: at.location, ...subjectTime(s, subject) });
    }
    const pl = placement(s, e) ?? (e.phases.map((p) => placement(s, e, `${e.id}@${p.id}`)).find(Boolean) as Placement | undefined);
    if (!pl) continue;
    const time = timeOf(s, e.id, s.sol.bounds, boundsOf(s.centres));
    const by = derivedBy(s.sol.bounds, s.world, e.id);
    const variants = variantTimes(s, e.id, time);
    const { label, names } = namesOf(s, e);
    out.push({
      id: e.id,
      label,
      names: names.length > 1 || names.some((n) => n.valid) ? names : undefined,
      kind: e.kind,
      basis: { ...pl.basis, time: timeBasis(s, [...by.start, ...by.end]) },
      frame: pl.frame,
      plate: pl.plate,
      location: pl.location,
      ...(pl.unplaced ? { unplaced: true as const } : {}),
      ...(moves.length ? { moves } : {}),
      time,
      variants: Object.keys(variants).length ? variants : undefined,
      status: statusOf(e),
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

function valueText(s: Solved, c: Claim, labelOf: (ref: string) => string): string {
  const prop = s.world.vocab.properties[c.prop];
  const v = c.value;
  switch (prop?.type) {
    case 'time': {
      const t = parseTime(v as never);
      // A day in a count of days is said as it is written, with the day it comes to in the default picture; a day
      // named in cycles, with the day it comes to there against the rest of the evidence.
      return t.kind === 'count' ? countText(s.world, t) : t.kind === 'cycle' ? cycleText(s.world, c) : dateText(v, labelOf);
    }
    case 'point': {
      const p = v as { lat: number; lon: number; frame: string };
      const f = s.world.frame.get(p.frame);
      return `${Math.abs(p.lat).toFixed(3)}°${p.lat >= 0 ? 'N' : 'S'}, ${Math.abs(p.lon).toFixed(3)}°${p.lon >= 0 ? 'E' : 'W'}${f ? ` (${f.title.toLowerCase()})` : ''}`;
    }
    case 'ref':
      return labelOf(String(v));
    case 'text':
      return Object.entries(v as Record<string, string>).map(([lang, t]) => (lang === 'en' ? t : `${t} (${lang})`)).join(' · ');
    case 'quantity': {
      const u = prop.unit ? ` ${prop.unit}` : '';
      const q = v as { mean?: number; sd?: number; lo?: number; hi?: number };
      if (typeof q === 'object' && q !== null) return q.mean !== undefined ? `${q.mean} ± ${q.sd}${u}` : `${q.lo}–${q.hi}${u}`;
      return `${(v as number).toLocaleString('en-US')}${prop.unit === '°' ? '' : ' '}${prop.unit}`;
    }
    case 'string':
      return prop.values?.[String(v)] ?? String(v);
    case 'form':
      return formText(v as FormSpec);
    case 'footprint-form':
      return footprintText(v as Footprint);
    case 'body-form': {
      const parts = Object.keys((v as { parts?: object }).parts ?? {});
      return parts.length ? `What it changes of the body it inherits: ${parts.join(', ')}` : 'What it changes of the body it inherits';
    }
    case 'dwelling':
    case 'settlement-form':
    case 'field-system':
      return specText(v as DwellingSpec);
    case 'town-form':
      return townText(v as TownSpec);
    case 'taxa':
      return (v as string[]).map((id) => labelOf(id)).join(', ');
    case 'lifeway':
      return lifewayText(v as LifewayWord[]);
    case 'outbuildings':
      return outbuildingsText(v as OutbuildingSpec[]);
    case 'geometry': {
      const g = v as { from: string; names?: string[]; elements?: string[] };
      if (g.elements) return `Traced on the map: ${g.elements.join(', ')}`;
      const names = g.names!.map((n) => `“${n}”`);
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
      return `The dataset's rows named ${list}`;
    }
    default:
      return String(v);
  }
}

/**
 * A time as text. A date that names its calendar is said as it is written, with the day it is on the axis where
 * that differs: a source's 1 May 1707 in the Julian calendar is 12 May in the Gregorian, which the axis reads
 * dates after 1582 in, and a reader with the source in hand looks for the first.
 */
function dateText(v: unknown, labelOf: (ref: string) => string = (r) => r): string {
  const shown = formatTimeValue(parseTime(v as never), labelOf);
  const named = typeof v === 'string' ? /^(.*) (Julian|Gregorian)$/.exec(v.trim()) : null;
  return named && named[1] !== shown ? `${named[1]} in the ${named[2]} calendar (${shown})` : shown;
}

/** A day in a count of days as text: as it is written, and the day it comes to in a scenario, where it can be placed. */
function countText(w: World, t: { calendar: string; days: number; text: string }, sc: Scenario = {}): string {
  const days = countDays(w, t, sc);
  return days ? `${t.text} (${formatTimeValue({ kind: 'interval', lo: days[0], hi: days[1] })})` : t.text;
}

/**
 * A day named in cycles as text: as it is written, and the day the rest of the evidence lets it be in a scenario,
 * or the days, or that it names none of the days the evidence allows.
 */
function cycleText(w: World, c: Claim, sc: Scenario = {}): string {
  const r = resolveCycle(w, c, sc);
  const day = ([a, b]: [number, number]) => formatTimeValue({ kind: 'interval', lo: dayOnAxis(a).t, hi: dayOnAxis(b).t + dayOnAxis(b).whole });
  const text = String(c.value);
  if (!r) return text;
  if (r.days.length === 1) return `${text} (${day(r.days[0])})`;
  if (r.days.length) return `${text} (one of ${r.days.map(day).join(', ')})`;
  return r.nearest ? `${text} (none of the days the rest of the evidence allows; the nearest is ${day(r.nearest)})` : text;
}

/**
 * The value of a claim written in a count of days, under each competing date of the count's zero day, or of a claim
 * named in cycles, under each competing date of its cycles' anchors: by that claim's reference, for the viewer to
 * show when it is picked. Undefined for any other claim.
 */
function countTexts(w: World, c: Claim): Record<string, string> | undefined {
  if (w.vocab.properties[c.prop]?.type !== 'time') return undefined;
  const count = countOf(c.value);
  const cycle = cycleOf(c.value);
  const calendars = count ? [count.calendar] : cycle ? [cycle.day?.cycle, cycle.year?.cycle].filter((x): x is string => !!x) : [];
  const out: Record<string, string> = {};
  for (const k of calendars) {
    const [epoch] = epochsOf(w, k);
    const g = epoch ? claimGroup(w, epoch, 'date') : undefined;
    if (!g) continue;
    const def = chosen(g);
    for (const z of g.claims) if (z !== def) out[z.ref] = count ? countText(w, count, { picks: [z.ref] }) : cycleText(w, c, { picks: [z.ref] });
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * When a claim holds, or the span a relation held over, in words: one time; "from … " and "until …" where an end
 * is left open; a bound that names another record's start or end as that; a day in a count of days as written.
 */
function validText(v: unknown, w: World, labelOf: (ref: string) => string, self: string): string | undefined {
  if (v === undefined) return undefined;
  const say = (x: unknown): string | null => {
    if (x === undefined) return null;
    if (x === 'unknown') return 'unknown';
    if (typeof x === 'object' && x !== null) {
      const { ref, edge } = x as { ref: string; edge: string };
      const subject = edgeSubject(ref, self) ?? ref;
      // A moment has no start and end to tell apart: it is named itself, as a surrender is.
      return isMoment(w, subject) ? labelOf(subject) : `the ${edge} of ${labelOf(subject)}`;
    }
    const count = countOf(x);
    return count ? countText(w, count) : dateText(x);
  };
  if (typeof v !== 'object' || v === null) return say(v)!;
  const { lo, hi } = v as { lo?: unknown; hi?: unknown };
  const [a, b] = [say(lo), say(hi)];
  return a && b ? `${a} – ${b}` : a ? `from ${a}` : `until ${b}`;
}

/**
 * How long after a moment a source was written, from its `written`: "written the same year", "written 4 months
 * after", "written 34 years after", or, for a range, from its first year to its last. Undefined where the source
 * does not say when it was written, or the moment is not within history.
 */
export function writtenAfter(written: unknown, at: number): string | undefined {
  if (written === undefined || !historical(at)) return undefined;
  let lo: number;
  let hi: number;
  try {
    [lo, hi] = bounds(parseTime(written as never));
  } catch {
    return undefined;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
  const say = (years: number): string => {
    const a = Math.abs(years);
    if (a < 1 / 12) return 'weeks';
    // Eleven and a half months and more is a year, not "12 months".
    const months = Math.max(1, Math.round(a * 12));
    if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
    return `${Math.round(a)} year${Math.round(a) === 1 ? '' : 's'}`;
  };
  // A day, a month or a year it was written in is taken at its middle; a longer span from its first year to its last.
  const [first, last] = hi - lo <= 1 ? [(lo + hi) / 2 - at, (lo + hi) / 2 - at] : [lo - at, hi - at];
  if (last < 0) return `written ${say(last)} before`;
  if (first < 0) return 'written at the time';
  const a = say(first);
  const b = say(last);
  if (a === b) return `written ${a} after`;
  // "33 to 56 years", not "33 years to 56 years".
  const [n, unit] = a.split(' ');
  return b.endsWith(` ${unit}`) || (unit === 'year' && b.endsWith(' years')) || (unit === 'month' && b.endsWith(' months')) ? `written ${n} to ${b} after` : `written ${a} to ${b} after`;
}

function lagText(lag: unknown): string | undefined {
  if (lag === undefined) return undefined;
  const [lo, hi] = parseLag(lag as never);
  if (lo === hi) return lo === 0 ? 'with no lag' : `after ${formatDuration(lo)}`;
  return hi === Infinity ? `at least ${formatDuration(lo)} after` : `${formatDuration(lo)} to ${formatDuration(hi)} after`;
}

/** A source as the viewer shows it: the record, without how the build fetches it. */
export function sourceRecord(src: Source): SourceRecord {
  const { id, type, kind, citation, authors, published, snapshot, title, container, doi, url, license, via, reliability, verified, note } = src;
  const written = src.written === undefined ? undefined : formatTimeValue(parseTime(src.written as never));
  return { id, type, kind, citation, authors, published, written, snapshot, title, container, doi, url, license, via, reliability, verified, note };
}

/** A label for any reference: an entity's or phase's name, a record's title, or the reference itself. */
/** Who held a perspective, and when: the `holds` relations that name it, from the records that make them. */
export function holdersOf(s: Solved, alt: string, labelOf: (ref: string) => string = labeller(s)): { id: string; label: string; held?: string }[] {
  return s.world.entities
    .flatMap((e) => e.relations.filter((r) => r.rel === 'holds' && r.to === alt && r.status !== 'deprecated' && r.rank !== 'deprecated').map((r) => ({ e, r })))
    .map(({ e, r }) => ({ id: r.subject, label: labelOf(r.subject), ...(r.valid !== undefined ? { held: validText(r.valid, s.world, labelOf, e.id) } : {}) }));
}

export function labeller(s: Solved): (ref: string) => string {
  const cache = new Map<string, string>();
  for (const e of s.world.entities) cache.set(e.id, namesOf(s, e).label);
  return (ref: string) => {
    try {
      const r = parseRef(ref);
      if (r.type === 'entity') {
        const base = cache.get(r.id);
        if (!base) return ref;
        if (r.phase) return `${base}: ${s.world.entity.get(r.id)!.phases.find((p) => p.id === r.phase)?.label ?? r.phase}`;
        return base;
      }
      if (r.type === 'frame') return s.world.frame.get(r.id)?.title ?? ref;
      if (r.type === 'alt') return s.world.alternative.get(r.id)?.title ?? ref;
      return ref;
    } catch {
      return ref;
    }
  };
}

export function records(s: Solved): EntityRecord[] {
  const w = s.world;
  const labelOf = labeller(s);
  const exists = (ref: string) => {
    try {
      const r = parseRef(ref);
      return r.type === 'external' || (r.type === 'entity' ? w.entity.has(r.id) : w.source.has(r.id) || w.frame.has(r.id) || w.alternative.has(r.id) || w.fields.some((f) => f.id === r.id) || w.generators.some((g) => g.id === r.id));
    } catch {
      return false;
    }
  };
  // Inverses: every relation, and every claim whose value is a record, seen from its target.
  const inverse = new Map<string, InverseRecord[]>();
  const addInverse = (target: string, x: InverseRecord) => {
    const id = splitRef(target).record;
    const list = inverse.get(id);
    if (list) list.push(x);
    else inverse.set(id, [x]);
  };
  // Rival readings, in the default picture or in any alternative's: marked, so that neither end takes one for held.
  const rivals = new Set([{}, ...w.alternatives.filter((a) => a.type === 'alternative').map((a) => ({ alts: [a.id] }))].flatMap((p) => rivalsIn(w, p).map((r) => r.ref)));
  for (const e of w.entities) {
    for (const r of e.relations) {
      const type = w.vocab.relations[r.rel];
      if (type && subjectExists(w, r.to)) addInverse(r.to, { rel: type.inverse, via: r.ref, from: r.subject, fromLabel: labelOf(r.subject), status: r.status, alt: r.alt, rank: r.rank, validText: validText(r.valid, w, labelOf, e.id), ...(rivals.has(r.ref) ? { rival: true as const } : {}) });
    }
    for (const c of e.claims) {
      const prop = w.vocab.properties[c.prop];
      if (prop?.type !== 'ref' || !prop.inverse) continue;
      const frame = w.frame.get(String(c.value));
      if (frame?.entity && w.entity.has(frame.entity)) addInverse(frame.entity, { rel: prop.inverse, via: c.ref, from: c.subject, fromLabel: labelOf(c.subject), status: c.status, alt: c.alt, rank: c.rank });
    }
  }
  const out: EntityRecord[] = [];
  for (const e of w.entities) {
    const used = new Set<string>();
    const wanted = new Set<string>();
    // When a source was written, against when what it tells of happened: an account written down decades later
    // is not one written that year (the moment is the claim's subject's date, or the edge a start or end claims).
    const momentOf = (c: Claim | (typeof e.relations)[number]): number | undefined => {
      const prop = 'prop' in c ? c.prop : undefined;
      const point = isMoment(w, c.subject) ? pointOf(w, c.subject, 'start') : prop === 'start' || prop === 'end' ? pointOf(w, c.subject, prop) : undefined;
      const b = point ? (s.centres.ok ? s.centres.bounds : s.sol.bounds).get(point) : undefined;
      return b && Number.isFinite(b.lo) && Number.isFinite(b.hi) ? (b.lo + b.hi) / 2 : undefined;
    };
    const cites = (cs: { ref: string; loc?: string; quote?: string }[], at?: number): CitationRecord[] =>
      cs.map((c) => {
        used.add(c.ref);
        const after = at === undefined ? undefined : writtenAfter(w.source.get(c.ref)?.written, at);
        return { ref: c.ref, loc: c.loc, quote: c.quote, ...(after ? { after } : {}) };
      });
    const common = (c: Claim | (typeof e.relations)[number]) => ({
      ref: c.ref,
      key: c.key,
      subject: c.subject,
      valid: c.valid,
      validText: validText(c.valid, w, labelOf, e.id),
      sources: cites(c.sources, momentOf(c)),
      against: c.against.length ? cites(c.against, momentOf(c)) : undefined,
      unsourced: c.unsourced,
      confidence: c.confidence,
      confidenceRange: typeof c.confidence === 'string' ? w.vocab.confidence[c.confidence] : undefined,
      basis: c.basis,
      alt: c.alt,
      author: c.author,
      status: c.status,
      rank: c.rank,
      checked: c.checked.length ? c.checked : undefined,
      level: levelOf(c.checked, c.status),
      note: c.note,
    });
    const claims: ClaimRecord[] = e.claims.map((c) => {
      const g = claimGroup(w, c.subject, c.prop);
      for (const ref of claimRefs(w, c)) if (!exists(ref)) wanted.add(splitRef(ref).record);
      // Claims of one picture that each hold for a span of their own, as a state's names do in turn, do not compete.
      const turn = !!g && c.rank !== 'deprecated' && inTurn(g.claims.filter((x) => x.alt === c.alt && x.rank !== 'deprecated'));
      return {
        ...common(c),
        prop: c.prop,
        value: c.value,
        valueText: valueText(s, c, labelOf),
        valueTexts: countTexts(w, c),
        method: c.method,
        methodLabel: c.method ? w.vocab.methods[c.method]?.label : undefined,
        group: `${c.subject}|${c.prop}`,
        competing: !!g && !isBeside(w, c) && g.claims.length > 1 && !turn,
        turn: turn || undefined,
        // A date named in cycles holds beside the others of its group, and is never the one picked.
        beside: isBeside(w, c) || undefined,
        chosen: !!g && chosen(g) === c,
      };
    });
    const relations: RelationRecord[] = e.relations.map((r) => {
      const ok = exists(r.to);
      if (!ok) wanted.add(splitRef(r.to).record);
      return { ...common(r), rel: r.rel, family: w.vocab.relations[r.rel]?.family ?? 'other', to: r.to, toLabel: labelOf(r.to), ...(rivals.has(r.ref) ? { rival: true as const } : {}), wanted: !ok, lagText: lagText(r.lag) };
    });
    const time = timeOf(s, e.id, s.sol.bounds, boundsOf(s.centres));
    const variants: VariantRecord[] = [];
    const mine = new Set([...e.claims, ...e.relations].map((x) => x.ref));
    const differs = variantTimes(s, e.id, time);
    for (const v of s.variants) {
      if (!v.key) continue;
      const picked = v.scenario.picks?.some((p) => mine.has(p));
      if (!v.solution.ok) {
        if (picked) variants.push({ key: v.key, consistent: false, conflict: v.solution.conflict.constraints.map((c) => c.source) });
        continue;
      }
      if (picked || differs[v.key]) variants.push({ key: v.key, consistent: true, time: timeOf(s, e.id, v.solution.bounds, boundsOf(v.centres)) });
    }
    const pl = placement(s, e);
    const by = derivedBy(s.sol.bounds, w, e.id);
    const frame = pl ? w.frame.get(pl.frame) : undefined;
    const { label, names } = namesOf(s, e);
    out.push({
      id: e.id,
      kind: e.kind,
      kindLabel: w.vocab.kinds[e.kind]?.label ?? e.kind,
      label,
      names,
      summary: e.summary,
      basis: pl ? { ...pl.basis, time: timeBasis(s, [...by.start, ...by.end]) } : { time: timeBasis(s, [...by.start, ...by.end]), place: 'evidence', placeNow: 'evidence' },
      frame: frame ? { id: frame.id, title: frame.title, plate: pl!.plate, entity: frame.entity, entityLabel: frame.entity ? labelOf(frame.entity) : undefined } : undefined,
      same_as: e.same_as,
      phases: e.phases.map((p) => ({ id: p.id, label: p.label ?? p.id, gap: p.gap, ...(p.same_as ? { same_as: p.same_as } : {}), ...subjectTime(s, `${e.id}@${p.id}`) })),
      time,
      claims,
      relations,
      inverse: (inverse.get(e.id) ?? []).sort((a, b) => (a.via < b.via ? -1 : 1)),
      variants,
      derivedBy: by,
      sources: Object.fromEntries([...used].sort().filter((id) => w.source.has(id)).map((id) => [id, sourceRecord(w.source.get(id)!)])),
      wanted: [...wanted].sort(),
    });
  }
  return out;
}

/** The records a claim refers to, besides its sources. */
function claimRefs(w: World, c: Claim): string[] {
  const prop = w.vocab.properties[c.prop];
  const out = [...c.sources, ...c.against].map((x) => x.ref);
  if (c.alt) out.push(c.alt);
  if (prop?.type === 'ref') out.push(String(c.value));
  if (prop?.type === 'point') out.push((c.value as { frame: string }).frame);
  if (prop?.type === 'time') {
    try {
      const t = parseTime(c.value as never);
      if (t.kind === 'ref') out.push(t.ref);
      // A day in a count of days rests on the record of the count's zero day, and a day named in cycles on their anchors.
      if (t.kind === 'count') out.push(...epochsOf(w, t.calendar));
      if (t.kind === 'cycle') for (const n of [t.day, t.year]) if (n) out.push(...anchorsOf(w, n.cycle));
    } catch {
      // the validator reports it
    }
  }
  return out;
}

export function periods(s: Solved): PeriodRecord[] {
  const w = s.world;
  const out: PeriodRecord[] = [];
  const edge = (b: Bounds, centres: Bounds | undefined, id: string, which: 'start' | 'end') => {
    const t = timeOf(s, id, b, centres);
    const x = which === 'start' ? t.start.best : t.end.best;
    return x === null ? Infinity : x;
  };
  for (const e of w.entities) {
    if (!e.kind.startsWith('period/')) continue;
    const color = claimOf(s, e.id, 'color')?.value as string | undefined;
    const parent = e.relations.find((r) => r.rel === 'part-of')?.to;
    const start = edge(s.sol.bounds, boundsOf(s.centres), e.id, 'start');
    const end = edge(s.sol.bounds, boundsOf(s.centres), e.id, 'end');
    const variants: Record<string, { start: number; end: number }> = {};
    for (const v of s.variants) {
      if (!v.key || !v.solution.ok || v.scenario.picks?.length) continue;
      const vs = edge(v.solution.bounds, boundsOf(v.centres), e.id, 'start');
      const ve = edge(v.solution.bounds, boundsOf(v.centres), e.id, 'end');
      if (vs !== start || ve !== end) variants[v.key] = { start: vs, end: ve };
    }
    out.push({
      id: e.id,
      name: namesOf(s, e).label,
      rank: (w.vocab.kinds[e.kind]?.label ?? e.kind).toLowerCase(),
      start,
      end,
      color,
      parent,
      variants: Object.keys(variants).length ? variants : undefined,
    });
  }
  return out.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
}

export function search(s: Solved, feats: Feature[]): SearchFile {
  const located = new Set(feats.map((f) => f.id));
  return {
    entities: s.world.entities
      .filter((e) => !e.kind.startsWith('period/'))
      .map((e) => {
        // Every name it goes by, so that it is found by any: absent where its label is its only one.
        const { label, names } = namesOf(s, e);
        const more = names.some((n) => n.text !== label || n.valid);
        return { id: e.id, label, kind: e.kind, summary: e.summary, time: timeOf(s, e.id, s.sol.bounds, boundsOf(s.centres)), located: located.has(e.id), ...(e.id.startsWith('life/pbdb/') ? { bulk: true } : {}), ...(more ? { names } : {}) };
      }),
  };
}

