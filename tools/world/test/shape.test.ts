// When each range stood, as its record says (tools/world/src/build/shape.ts), and the bound a record says it by: on a
// small world written for the test, whose ranges are no real ones.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { toMa } from '../../../core/time.ts';
import { claimGroups, solveScenario } from '../src/chronology.ts';
import { carriedInfo, rangesOf } from '../src/build/shape.ts';
import type { Solved } from '../src/build/records.ts';
import { validateWorld } from '../src/validate/index.ts';
import { loadWorld, type Field, type World } from '../src/world.ts';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const SOURCE = `id: src:test/report\ntype: publication\nkind: measurement\ncitation: A fixture source, not a real publication.\n`;
const cite = `source: { ref: src:test/report, loc: p. 1 }`;

async function world(files: Record<string, string>): Promise<World> {
  const root = mkdtempSync(join(tmpdir(), 'wikiworldmodel-shape-'));
  dirs.push(root);
  for (const [path, text] of Object.entries({ 'sources/report.yaml': SOURCE, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorld(root);
}

const solved = (w: World): Solved => {
  const sol = solveScenario(w);
  if (!sol.ok) throw new Error('the world does not hold');
  return { world: w, sol, centres: solveScenario(w, {}, true), variants: [], groups: claimGroups(w), model: undefined as never };
};

const PHASES = `phases:\n  - { id: rising, label: Rising }\n  - { id: standing, label: At about its present height }\n`;
const outline = (west: number) => `  extent:\n    prop: extent\n    value: { type: Polygon, frame: frame:earth/present-day, coordinates: [[[${west}, 30], [${west + 4}, 30], [${west + 4}, 34], [${west}, 34], [${west}, 30]]] }\n    unsourced: A box drawn for the test.\n`;
const range = (id: string, west: number, claims: string, relations = '') => `id: test/${id}\nkind: landform/mountain-range\nauthor: fixture\n${PHASES}claims:\n  name: { prop: name, value: { en: ${id} }, unsourced: A label. }\n${outline(west)}${claims}${relations}`;
const collision = `id: test/collision\nkind: event/collision\nauthor: fixture\nclaims:\n  date: { prop: date, value: 59 Ma, ${cite} }\n`;
const period = (id: string, start: string) => `id: test/${id}\nkind: period/period\nauthor: fixture\nclaims:\n  start: { prop: start, value: ${start}, ${cite} }\n`;

describe('by when a range stood', () => {
  it('takes a bound on the start of a phase: a range stood by the time a measurement shows it standing, and may have long before', async () => {
    const w = await world({ 'entities/a.yaml': range('a', 80, `  stood: { prop: start_before, subject: "@standing", value: 17 Ma, ${cite} }\n`) });
    expect((await validateWorld(w, { frames: false })).issues.filter((i) => i.level === 'error' || i.level === 'warning')).toEqual([]);
    const s = solveScenario(w);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const b = s.bounds.get('test/a@standing|start')!;
    expect(toMa(b.hi)).toBeCloseTo(17, 6);
    expect(b.lo).toBe(-Infinity);
    // A date for the phase's start later than the bound contradicts it.
    const late = await world({ 'entities/a.yaml': range('a', 80, `  stood: { prop: start_before, subject: "@standing", value: 17 Ma, ${cite} }\n  dated: { prop: start, subject: "@standing", value: 12 Ma, ${cite} }\n`) });
    expect(solveScenario(late).ok).toBe(false);
  });

  it('reads the latest time the evidence allows a range to have stood by, and when its growth began from what raised it', async () => {
    const w = await world({
      'entities/collision.yaml': collision,
      // A window from fossil leaves, and a bound from isotopes inside it: it stood by the bound, the earlier of the
      // two times the evidence has it standing by.
      'entities/a.yaml': range('a', 80, `  window: { prop: start, subject: "@standing", value: { lo: 21 Ma, hi: 15 Ma }, ${cite} }\n  stood: { prop: start_before, subject: "@standing", value: 17 Ma, ${cite} }\n`, `relations:\n  raised: { rel: caused-by, to: test/collision, ${cite} }\n`),
      // Only a bound, and nothing of when its growth began.
      'entities/b.yaml': range('b', 100, `  stood: { prop: start_before, subject: "@standing", value: 35 Ma, ${cite} }\n`),
      // Dated outright, and its growth too.
      'entities/c.yaml': range('c', -70, `  began: { prop: start, value: 25 Ma, ${cite} }\n  stood: { prop: start, subject: "@standing", value: 6.8 Ma, ${cite} }\n`),
      // No evidence of when it stood: the rule alone speaks for it.
      'entities/d.yaml': range('d', 10, ''),
      // Its growth had begun by a time, and it stood by a later one: it is taken to have grown from the first.
      'entities/e.yaml': range('e', 40, `  begun: { prop: start_before, value: 56 Ma, ${cite} }\n  stood: { prop: start, subject: "@standing", value: { hi: 28 Ma }, ${cite} }\n`),
    });
    const ranges = rangesOf(solved(w), 'standing');
    expect(ranges.map((r) => [r.id, r.standingMa, r.startMa])).toEqual([
      ['test/a', 17, 59],
      ['test/b', 35, undefined],
      ['test/c', 6.8, 25],
      ['test/e', 28, 56],
    ]);
    expect(ranges[0].label).toBe('a');
    expect(ranges[0].outline).toEqual([[[[80, 30], [84, 30], [84, 34], [80, 34], [80, 30]]]]);
  });

  it("follows the records its rule names: whole back to one's start, and none before the other's", async () => {
    const w = await world({
      'entities/quaternary.yaml': period('quaternary', '2.58 Ma'),
      'entities/pliocene.yaml': period('pliocene', '5.333 Ma'),
      'entities/b.yaml': range('b', 100, `  stood: { prop: start_before, subject: "@standing", value: 35 Ma, ${cite} }\n`),
    });
    const field = { id: 'field:test/carried', title: 'carried', params: { held_through: 'test/quaternary', gone_before: 'test/pliocene', standing_phase: 'standing', other_plates: 1, valley_floor: 0.02 } } as unknown as Field;
    const c = carriedInfo(solved(w), field, 'model:test')!;
    expect([c.field, c.model, c.fullMa, c.goneMa, c.apart, c.floor]).toEqual(['field:test/carried', 'model:test', 2.58, 5.333, 1, 0.02]);
    expect(c.ranges.map((r) => r.id)).toEqual(['test/b']);
    // The two the wrong way round say nothing a rule can follow.
    const wrong = { ...field, params: { held_through: 'test/pliocene', gone_before: 'test/quaternary', standing_phase: 'standing', other_plates: 1, valley_floor: 0.02 } } as unknown as Field;
    expect(() => carriedInfo(solved(w), wrong, 'model:test')).toThrow(/must begin after/);
  });
});
