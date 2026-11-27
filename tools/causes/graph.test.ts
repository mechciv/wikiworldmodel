import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkGraph, loadGraph, ranking, reachOf, type CauseGraph } from './graph.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const world = (): CauseGraph => loadGraph(join(root, 'docs', 'causes'));

/** A small graph to break: a → b → c, with c seen through r. */
function small(): CauseGraph {
  const node = (id: string, lane: string) => ({ id, label: id, lane, kind: lane === 'record' ? ('record' as const) : ('at-once' as const), what: 'w', now: 'none' as const, has: [], note: 'n', best: 'b', gap: 'large' as const, seen: [] as string[] });
  const g: CauseGraph = {
    lanes: [{ id: 'one', title: 'One', about: 'a' }, { id: 'record', title: 'Record', about: 'a' }],
    nodes: [node('a', 'one'), node('b', 'one'), node('c', 'one'), node('r', 'record')],
    edges: [
      { from: 'a', to: 'b', now: 'missing', how: 'h', lane: 'one' },
      { from: 'b', to: 'c', now: 'missing', how: 'h', lane: 'one' },
    ],
  };
  g.nodes[2].seen = ['r'];
  return g;
}

describe('the graph of causes (docs/causes/README.md)', () => {
  it('keeps its own rules: every id, word and reference holds, and every cycle is a named loop', () => {
    expect(checkGraph(world(), root)).toEqual([]);
  });

  it('names only fields, models and generators that are in the world', () => {
    const g = small();
    g.nodes[0].has = ['field:earth/elevation', 'field:earth/no-such-field', 'src:not-a-kind-it-may-name'];
    const problems = checkGraph(g, root);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('field:earth/no-such-field is not in the world');
    expect(problems[1]).toContain('is not a field, a model or a generator');
  });

  it('refuses a cycle that no edge names as a loop, and a loop that closes no cycle', () => {
    const cyclic = small();
    cyclic.edges.push({ from: 'c', to: 'a', now: 'missing', how: 'h', lane: 'one' });
    expect(checkGraph(cyclic, root).join('\n')).toContain('a cycle that no edge names as a loop: a → b → c → a');
    cyclic.edges[2].loop = 'round';
    expect(checkGraph(cyclic, root)).toEqual([]);
    const idle = small();
    idle.edges[1].loop = 'round';
    expect(checkGraph(idle, root).join('\n')).toContain('names the loop round and closes no cycle');
  });

  it('refuses an edge written outside the lane of what it causes, and evidence that is no kind of evidence', () => {
    const g = small();
    g.edges[0].lane = 'record';
    g.nodes[0].seen = ['b'];
    const problems = checkGraph(g, root).join('\n');
    expect(problems).toContain('an edge goes in the file of what it causes');
    expect(problems).toContain('is seen through b, which is not in the lane record');
  });

  it('ranks by gap times reach, a node read through others counting for less: what the most others read comes first', () => {
    const g = small();
    const reach = reachOf(g);
    // b is read directly and counts whole; c is read through b and counts for 0.6.
    expect(reach.get('a')).toEqual({ up: 0, down: 2, score: 7.8 });
    expect(reach.get('c')).toEqual({ up: 2, down: 0, score: 3 });
    // A kind of evidence reaches the nodes seen through it.
    expect(reach.get('r')!.down).toBe(1);
    expect(ranking(g, reach).map((n) => n.id)).toEqual(['a', 'b', 'r', 'c']);
  });

  it('follows no loop edge when it measures reach, so a feedback does not make every node read every other', () => {
    const g = small();
    g.edges.push({ from: 'c', to: 'a', now: 'missing', how: 'h', loop: 'round', lane: 'one' });
    expect(reachOf(g).get('c')!.down).toBe(0);
  });
});
