// Lineage (section 4.5 of WORLD-MODEL.md): what a record came from and what came of it, and which records
// are one thing with it, in a picture. Where one thing ends and another begins is whoever wrote the records'
// choice; `continues` says that two records are the same thing carried on, and is a claim like any other, so
// what counts as one thing depends on the picture: the default one, or a perspective's.
import { splitRef } from '../../../core/refs.ts';
import type { Scenario } from '../../../core/scenario.ts';
import { formatTime } from '../../../core/time.ts';
import { relationsIn, rivalsIn, solveScenario } from './chronology.ts';
import type { World } from './world.ts';

export interface LineageEdge {
  rel: string;
  /** the record the relation is stored in, and the one it names */
  from: string;
  to: string;
  /** the stored relation, entity#key */
  via: string;
  alt?: string;
}

/** The lineage relations that hold in a picture, between records (a phase counts as its record). */
export function lineageEdges(world: World, s: Scenario = {}): LineageEdge[] {
  return relationsIn(world, s)
    .filter((r) => world.vocab.relations[r.rel]?.family === 'lineage')
    .map((r) => ({ rel: r.rel, from: splitRef(r.subject).record, to: splitRef(r.to).record, via: r.ref, alt: r.alt }));
}

/**
 * The records that are one thing with a record, in a picture: itself, and every record joined to it by
 * `continues`, either way, through any number of records. In order: the earliest first, by the order the
 * relations give (what is continued comes before what continues it), then by id.
 */
export function identityOf(world: World, id: string, s: Scenario = {}): string[] {
  const edges = lineageEdges(world, s).filter((e) => e.rel === 'continues');
  const same = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of edges) {
      if (same.has(e.from) !== same.has(e.to)) {
        same.add(e.from).add(e.to);
        grew = true;
      }
    }
  }
  // Depth: how many records it continues, at most; a loop of claims gives up and falls back to the id.
  const depth = new Map<string, number>();
  const depthOf = (x: string, seen: Set<string>): number => {
    if (depth.has(x)) return depth.get(x)!;
    if (seen.has(x)) return 0;
    seen.add(x);
    const d = Math.max(0, ...edges.filter((e) => e.from === x).map((e) => 1 + depthOf(e.to, seen)));
    depth.set(x, d);
    return d;
  };
  return [...same].sort((a, b) => depthOf(a, new Set()) - depthOf(b, new Set()) || (a < b ? -1 : 1));
}

/**
 * A loop in the lineage, if a picture has one: relations that between them make a record its own ancestor,
 * in the order they run, earliest first. Each relation says one record came before another (merged-into,
 * that its holder did), and nothing comes before itself. `continues` says no such thing, and is left out.
 */
export function lineageLoop(world: World, s: Scenario = {}): LineageEdge[] | undefined {
  // An edge runs from what came before to what came after.
  const after = new Map<string, { to: string; edge: LineageEdge }[]>();
  for (const e of lineageEdges(world, s)) {
    // To carry a thing on is not to come after it: a republic older than its union may carry the union on, and
    // the union have arisen from it.
    if (e.rel === 'continues') continue;
    const [a, b] = e.rel === 'merged-into' ? [e.from, e.to] : [e.to, e.from];
    after.set(a, [...(after.get(a) ?? []), { to: b, edge: e }]);
  }
  const state = new Map<string, 1 | 2>(); // 1: on the walk, 2: done
  const path: LineageEdge[] = [];
  const walk = (x: string): LineageEdge[] | undefined => {
    state.set(x, 1);
    for (const { to, edge } of after.get(x) ?? []) {
      path.push(edge);
      if (state.get(to) === 1) {
        // The loop is the walk from where `to` was entered: the edges after the one that reached it.
        const at = path.findIndex((p) => (p.rel === 'merged-into' ? p.from : p.to) === to);
        return path.slice(at);
      }
      if (!state.has(to)) {
        const found = walk(to);
        if (found) return found;
      }
      path.pop();
    }
    state.set(x, 2);
    return undefined;
  };
  for (const x of [...after.keys()].sort()) {
    if (state.has(x)) continue;
    const found = walk(x);
    if (found) return found;
  }
  return undefined;
}

export interface Lineage {
  /** the records that are one thing with it, itself among them (identityOf) */
  same: string[];
  /** what it came from: what it arose from, succeeds or continues, and what merged into it */
  before: { rel: string; id: string; via: string }[];
  /** what came of it: what arose from it, succeeded or continues it, and what it merged into */
  after: { rel: string; id: string; via: string }[];
}

/** A record's place in the lineage, in a picture. The inverse relations are named as the vocabulary names them. */
export function lineageOf(world: World, id: string, s: Scenario = {}): Lineage {
  const before: Lineage['before'] = [];
  const after: Lineage['after'] = [];
  const inverse = (rel: string) => world.vocab.relations[rel]?.inverse ?? rel;
  for (const e of lineageEdges(world, s)) {
    // merged-into is held by the record that ended and names the one that went on; the others name what came before.
    const forward = e.rel === 'merged-into';
    if (e.from === id) (forward ? after : before).push({ rel: e.rel, id: e.to, via: e.via });
    if (e.to === id) (forward ? before : after).push({ rel: inverse(e.rel), id: e.from, via: e.via });
  }
  const byId = (a: { id: string; rel: string }, b: { id: string; rel: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.rel < b.rel ? -1 : 1);
  return { same: identityOf(world, id, s), before: before.sort(byId), after: after.sort(byId) };
}

/** `npm run world -- lineage <id> [--alt alt:…]…`: a record's lineage as text, with the years the picture gives each record. */
export function lineageText(world: World, id: string, s: Scenario = {}): string {
  if (!world.entity.has(id)) return `no record ${id}`;
  const sol = solveScenario(world, s);
  // A start or an end by its year, or the years it lies between where the evidence gives a range of them; an end
  // that nothing bounds is still open.
  const edge = (b: { lo: number; hi: number } | undefined) => {
    if (!b || !Number.isFinite(b.lo) || !Number.isFinite(b.hi)) return '…';
    const [from, to] = [formatTime(b.lo), formatTime(Math.max(b.lo, b.hi - 1e-6))];
    return from === to ? from : `${from}/${to}`;
  };
  const span = (x: string) => {
    if (!sol.ok) return '';
    return ` (${edge(sol.bounds.get(`${x}|start`) ?? sol.bounds.get(`${x}|date`))} – ${edge(sol.bounds.get(`${x}|end`) ?? sol.bounds.get(`${x}|date`))})`;
  };
  const l = lineageOf(world, id, s);
  const lines = [`${id}${span(id)}${s.alts?.length ? `, with ${s.alts.join(' and ')}` : ', in the default picture'}`];
  if (!sol.ok) lines.push('  this picture does not hold: run npm run validate');
  if (l.same.length > 1) lines.push(`  one thing with: ${l.same.filter((x) => x !== id).map((x) => `${x}${span(x)}`).join(', ')}`);
  for (const x of l.before) lines.push(`  ${x.rel.replace(/-/g, ' ')} ${x.id}${span(x.id)}`);
  for (const x of l.after) lines.push(`  ${x.rel.replace(/-/g, ' ')} ${x.id}${span(x.id)}`);
  // Rival readings do not hold in this picture: they are said apart, from either end.
  for (const r of rivalsIn(world, s)) {
    if (world.vocab.relations[r.rel]?.family !== 'lineage') continue;
    const [from, to] = [splitRef(r.subject).record, splitRef(r.to).record];
    if (from === id) lines.push(`  another reading: ${r.rel.replace(/-/g, ' ')} ${to}${span(to)}`);
    else if (to === id) lines.push(`  another reading: ${(world.vocab.relations[r.rel]?.inverse ?? r.rel).replace(/-/g, ' ')} ${from}${span(from)}`);
  }
  if (lines.length === 1) lines.push('  no lineage relations in this picture');
  return lines.join('\n');
}
