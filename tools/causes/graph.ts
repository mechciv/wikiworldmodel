// The graph of causes (docs/causes/README.md): every quantity the world should be able to estimate, what causes it,
// what observes it, and how far the world's own model of it is from the best that could be built. A design tool beside
// the code: nothing in the build reads it. This reads the lane files, holds them to their own rules, and ranks the
// nodes by how much hangs from each and how far it is from built.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const KINDS = ['given', 'at-once', 'settling', 'spreading', 'contingent', 'record'] as const;
export const STATES = ['none', 'stand-in', 'borrowed', 'rule', 'conditioned', 'scored', 'records'] as const;
export const GAPS = ['none', 'small', 'medium', 'large', 'total'] as const;
export const EDGE_STATES = ['built', 'partial', 'inside', 'backwards', 'missing'] as const;

/** The lane of the kinds of evidence: its nodes are what the other lanes' nodes are `seen` through. */
export const RECORD_LANE = 'record';

export type Kind = (typeof KINDS)[number];
export type State = (typeof STATES)[number];
export type Gap = (typeof GAPS)[number];
export type EdgeState = (typeof EDGE_STATES)[number];

export interface Lane {
  id: string;
  title: string;
  about: string;
}

export interface CauseNode {
  id: string;
  label: string;
  lane: string;
  kind: Kind;
  /** what the quantity is, in a sentence */
  what: string;
  /** where the world stands on it */
  now: State;
  /** the fields, models and generators of the world that answer it today */
  has: string[];
  note: string;
  /** the best model that could be built */
  best: string;
  gap: Gap;
  /** the kinds of evidence that observe it: nodes of the record lane */
  seen: string[];
}

export interface CauseEdge {
  from: string;
  to: string;
  now: EdgeState;
  /** the mechanism, in a sentence */
  how: string;
  /** the model or generator that carries it, where one does */
  by?: string;
  /** the feedback it closes; without its loop edges the graph has no cycle */
  loop?: string;
  /** the lane whose file it is written in: its target's */
  lane: string;
}

export interface CauseGraph {
  lanes: Lane[];
  nodes: CauseNode[];
  edges: CauseEdge[];
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

/** The graph as its lane files give it, in the order of the files' names. Nothing is checked here. */
export function loadGraph(dir: string): CauseGraph {
  const g: CauseGraph = { lanes: [], nodes: [], edges: [] };
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort()) {
    const doc = parseYaml(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>;
    const lane = text(doc.lane);
    g.lanes.push({ id: lane, title: text(doc.title), about: text(doc.about) });
    for (const raw of (doc.nodes ?? []) as Record<string, unknown>[]) {
      g.nodes.push({
        id: text(raw.id),
        label: text(raw.label),
        lane,
        kind: text(raw.kind) as Kind,
        what: text(raw.what),
        now: text(raw.now) as State,
        has: list(raw.has),
        note: text(raw.note),
        best: text(raw.best),
        gap: text(raw.gap) as Gap,
        seen: list(raw.seen),
      });
    }
    for (const raw of (doc.edges ?? []) as Record<string, unknown>[]) {
      const e: CauseEdge = { from: text(raw.from), to: text(raw.to), now: text(raw.now) as EdgeState, how: text(raw.how), lane };
      if (raw.by) e.by = text(raw.by);
      if (raw.loop) e.loop = text(raw.loop);
      g.edges.push(e);
    }
  }
  return g;
}

/** Where a reference of a node or an edge should be found in the world, or null if it is no kind this graph may name. */
function fileOf(ref: string): string | null {
  const m = /^(field|model|gen):([a-z0-9-]+(?:\/[a-z0-9-]+)+)$/.exec(ref);
  if (!m) return null;
  const dir = m[1] === 'field' ? 'fields' : m[1] === 'model' ? 'models' : 'generators';
  return join('world', dir, `${m[2]}.yaml`);
}

/** Who each node points at along the edges kept, as lists by id. */
function adjacency(g: CauseGraph, keep: (e: CauseEdge) => boolean): { out: Map<string, string[]>; into: Map<string, string[]> } {
  const out = new Map<string, string[]>(g.nodes.map((n) => [n.id, []]));
  const into = new Map<string, string[]>(g.nodes.map((n) => [n.id, []]));
  for (const e of g.edges) {
    if (!keep(e) || !out.has(e.from) || !into.has(e.to)) continue;
    out.get(e.from)!.push(e.to);
    into.get(e.to)!.push(e.from);
  }
  return { out, into };
}

/** Everything reached from a node along the lists given, each with how many steps away it is; the node itself is left out. */
function reached(from: string, next: Map<string, string[]>): Map<string, number> {
  const far = new Map<string, number>();
  let edge = [from];
  for (let steps = 1; edge.length; steps++) {
    const after: string[] = [];
    for (const at of edge) {
      for (const to of next.get(at) ?? []) {
        if (to === from || far.has(to)) continue;
        far.set(to, steps);
        after.push(to);
      }
    }
    edge = after;
  }
  return far;
}

/** A cycle among the edges that close no named loop, as the ids along it, or null where there is none. */
function cycleOf(g: CauseGraph): string[] | null {
  const { out } = adjacency(g, (e) => !e.loop);
  const state = new Map<string, 0 | 1 | 2>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    path.push(id);
    for (const to of out.get(id) ?? []) {
      if (state.get(to) === 1) return [...path.slice(path.indexOf(to)), to];
      if (!state.get(to)) {
        const found = visit(to);
        if (found) return found;
      }
    }
    path.pop();
    state.set(id, 2);
    return null;
  };
  for (const n of g.nodes) {
    if (state.get(n.id)) continue;
    const found = visit(n.id);
    if (found) return found;
  }
  return null;
}

/**
 * What is wrong with the graph, a sentence each; none if it keeps its rules (docs/causes/README.md). `root` is the
 * repository, where the fields, models and generators a node or an edge names are looked for.
 */
export function checkGraph(g: CauseGraph, root: string): string[] {
  const problems: string[] = [];
  const lanes = new Set<string>();
  for (const l of g.lanes) {
    if (!l.id) problems.push('a lane file names no lane');
    if (lanes.has(l.id)) problems.push(`lane ${l.id} is written twice`);
    lanes.add(l.id);
    if (!l.title || !l.about) problems.push(`lane ${l.id} needs a title and a line about it`);
  }
  if (!lanes.has(RECORD_LANE)) problems.push(`no lane ${RECORD_LANE}: the kinds of evidence have nowhere to stand`);

  const byId = new Map<string, CauseNode>();
  for (const n of g.nodes) {
    if (!/^[a-z][a-z0-9-]*$/.test(n.id)) problems.push(`node id "${n.id}" in lane ${n.lane} is not lower-case letters, digits and hyphens`);
    if (byId.has(n.id)) problems.push(`node ${n.id} is written twice, in lanes ${byId.get(n.id)!.lane} and ${n.lane}`);
    byId.set(n.id, n);
    if (!KINDS.includes(n.kind)) problems.push(`node ${n.id}: kind "${n.kind}" is none of ${KINDS.join(', ')}`);
    if (!STATES.includes(n.now)) problems.push(`node ${n.id}: now "${n.now}" is none of ${STATES.join(', ')}`);
    if (!GAPS.includes(n.gap)) problems.push(`node ${n.id}: gap "${n.gap}" is none of ${GAPS.join(', ')}`);
    for (const key of ['label', 'what', 'note', 'best'] as const) if (!n[key]) problems.push(`node ${n.id} has no ${key}`);
    if (n.kind === 'record' && n.lane !== RECORD_LANE) problems.push(`node ${n.id} is a kind of evidence outside the lane ${RECORD_LANE}`);
    for (const ref of n.has) {
      const file = fileOf(ref);
      if (!file) problems.push(`node ${n.id}: "${ref}" is not a field, a model or a generator`);
      else if (!existsSync(join(root, file))) problems.push(`node ${n.id}: ${ref} is not in the world (${file})`);
    }
  }
  for (const n of g.nodes) {
    for (const s of n.seen) {
      const r = byId.get(s);
      if (!r) problems.push(`node ${n.id} is seen through "${s}", which is no node`);
      else if (r.lane !== RECORD_LANE) problems.push(`node ${n.id} is seen through ${s}, which is not in the lane ${RECORD_LANE}`);
    }
    if (n.lane === RECORD_LANE && n.seen.length) problems.push(`node ${n.id} is a kind of evidence and is seen through nothing`);
  }

  const pairs = new Set<string>();
  for (const e of g.edges) {
    const name = `edge ${e.from} → ${e.to}`;
    if (!byId.has(e.from)) problems.push(`${name}: "${e.from}" is no node`);
    if (!byId.has(e.to)) problems.push(`${name}: "${e.to}" is no node`);
    if (e.from === e.to) problems.push(`${name} runs from a node to itself`);
    if (pairs.has(`${e.from}>${e.to}`)) problems.push(`${name} is written twice`);
    pairs.add(`${e.from}>${e.to}`);
    if (!EDGE_STATES.includes(e.now)) problems.push(`${name}: now "${e.now}" is none of ${EDGE_STATES.join(', ')}`);
    if (!e.how) problems.push(`${name} does not say how`);
    const to = byId.get(e.to);
    if (to && to.lane !== e.lane) problems.push(`${name} is written in lane ${e.lane}, and its effect is in lane ${to.lane}: an edge goes in the file of what it causes`);
    if (e.by) {
      const file = fileOf(e.by);
      if (!file) problems.push(`${name}: "${e.by}" is not a model or a generator`);
      else if (!existsSync(join(root, file))) problems.push(`${name}: ${e.by} is not in the world (${file})`);
      if (e.now === 'missing' || e.now === 'inside') problems.push(`${name} names ${e.by} and is ${e.now}: nothing of the world carries such an edge`);
    }
  }

  const cycle = cycleOf(g);
  if (cycle) problems.push(`a cycle that no edge names as a loop: ${cycle.join(' → ')}`);
  const { out } = adjacency(g, () => true);
  for (const e of g.edges) {
    if (e.loop && byId.has(e.from) && byId.has(e.to) && !reached(e.to, out).has(e.from)) {
      problems.push(`edge ${e.from} → ${e.to} names the loop ${e.loop} and closes no cycle: nothing leads from ${e.to} back to ${e.from}`);
    }
  }
  return problems;
}

/** How much a gap weighs in the ranking. */
export const GAP_WEIGHT: Record<Gap, number> = { none: 0, small: 1, medium: 2, large: 3, total: 4 };

/** How much less a node read through another counts, for each step further off. */
export const REACH_FADE = 0.6;

export interface Reach {
  /** how many nodes cause it, directly or through others */
  up: number;
  /** how many nodes read it, directly or through others; for a kind of evidence, how many it observes */
  down: number;
  /** its gap's weight times one more than its reach, a node read through others counting for less each step: where the work is */
  score: number;
}

/**
 * How far each node reaches (docs/causes/README.md, Where the work is). Causes are followed without the edges that
 * close a loop, or every node of a loop would reach every other. A kind of evidence reaches the nodes seen through it,
 * and what feeds a kind of evidence, as preservation and effort do, reaches all that its kinds observe. In the score a
 * node read directly counts whole, and one read through others for less with each step, so that what many nodes read
 * themselves comes before what merely stands far upstream.
 */
export function reachOf(g: CauseGraph): Map<string, Reach> {
  const { out, into } = adjacency(g, (e) => !e.loop);
  const lane = new Map(g.nodes.map((n) => [n.id, n.lane]));
  const observed = new Map<string, Set<string>>();
  for (const n of g.nodes) for (const s of n.seen) observed.set(s, (observed.get(s) ?? new Set()).add(n.id));
  const reach = new Map<string, Reach>();
  for (const n of g.nodes) {
    const below = reached(n.id, out);
    // What reads it, by how many steps off: its effects outside the record, and for evidence what it observes.
    const read = new Map([...below].filter(([id]) => lane.get(id) !== RECORD_LANE));
    if (n.lane === RECORD_LANE) {
      for (const [id, steps] of [[n.id, 0] as const, ...below]) {
        if (lane.get(id) !== RECORD_LANE) continue;
        for (const seen of observed.get(id) ?? []) if (seen !== n.id && !read.has(seen)) read.set(seen, steps + 1);
      }
    }
    let weight = 0;
    for (const steps of read.values()) weight += REACH_FADE ** (steps - 1);
    const score = Math.round(GAP_WEIGHT[n.gap] * (1 + weight) * 10) / 10;
    reach.set(n.id, { up: reached(n.id, into).size, down: read.size, score });
  }
  return reach;
}

/** The nodes by where the work is: the highest score first, and ties by reach and then by name. */
export function ranking(g: CauseGraph, reach = reachOf(g)): CauseNode[] {
  return [...g.nodes].sort((a, b) => {
    const ra = reach.get(a.id)!;
    const rb = reach.get(b.id)!;
    return rb.score - ra.score || rb.down - ra.down || a.id.localeCompare(b.id);
  });
}
