// The first step of the ladder: a quote found in the text its source was read in, by script, and the step
// written into the record's file without disturbing the rest of it.
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll } from 'vitest';
import { addStep, checkClaims, normalizeText, quotedHow, quoteIn, replaceStep, type QuoteText } from '../src/quotecheck.ts';
import { loadWorld } from '../src/world.ts';

const STEP = { step: 'quoted' as const, by: 'machine:quote-check', how: 'Found in a.txt.', on: '2026-11-06' };

const RECORD = `# A record, with a comment that must stay.
id: earth/events/x
kind: event/impact
author: machine:claude-code
claims:
  date:
    prop: date
    value: { mean: 66.038 Ma, sd: 0.049 Myr }
    source:
      ref: src:x
      loc: p. 2
      quote: "the impact at 66.038 ± 0.049 Ma"
    note: >-
      A folded note
      that spans lines.
  name:
    prop: name
    value: { en: X }
    unsourced: An editorial label.
relations:
  during:
    rel: during
    to: earth/events/y
    source: { ref: src:x, loc: p. 3, quote: "within Y" }
`;

describe('quotes against a text', () => {
  it('are compared after normalizing whitespace, quotes, dashes and words broken across a line', () => {
    const text = normalizeText('The “impact” at 66.038 ±\n  0.049 Ma, a well-\nknown age – about 66 Ma.');
    expect(quoteIn('the "impact" at 66.038 ± 0.049 Ma'.replace('the', 'The'), text)).toBe(true);
    expect(quoteIn('a wellknown age - about 66 Ma', text)).toBe(true);
    expect(quoteIn('at 66.039 ± 0.049 Ma', text)).toBe(false);
  });

  it('find a compound that was broken at its own hyphen, which joining the lines took for a broken word', () => {
    const text = normalizeText('in a script that strongly resembles the Proto-\nSinaitic texts, a well-\nknown case');
    expect(quoteIn('strongly resembles the Proto-Sinaitic texts', text)).toBe(true);
    expect(quoteIn('a well-known case', text)).toBe(true);
    expect(quoteIn('strongly resembles the Proto-Canaanite texts', text)).toBe(false);
  });

  it('join a word an OCR broke at a soft hyphen and the end of a line', () => {
    expect(quoteIn('increase downstream with discharge', normalizeText('increase downstream with dis\u00ad \ncharge in the form'))).toBe(true);
  });

  it('find a quote with an ellipsis when its pieces come in order, and not out of order', () => {
    const text = normalizeText('First the ash fell. Much later the iridium settled.');
    expect(quoteIn('First the ash … the iridium settled', text)).toBe(true);
    expect(quoteIn('the iridium settled ... First the ash', text)).toBe(false);
  });
});

describe('a step written into a record', () => {
  it('adds a checked list after what the claim holds, and leaves everything else as it was', () => {
    const out = addStep(RECORD, 'claims', 'date', STEP);
    expect(out).toContain('# A record, with a comment that must stay.');
    expect(out).toContain('    note: >-\n      A folded note\n      that spans lines.\n    checked:\n      - { step: quoted,');
    const before = parse(RECORD);
    const after = parse(out);
    expect(after.claims.date.checked).toEqual([STEP]);
    delete after.claims.date.checked;
    expect(after).toEqual(before);
  });

  it('adds to a list that is there, and does not add a step twice', () => {
    const once = addStep(RECORD, 'relations', 'during', STEP);
    expect(parse(once).relations.during.checked).toEqual([STEP]);
    expect(addStep(once, 'relations', 'during', STEP)).toBe(once);
    const reread = { step: 're-read' as const, by: 'kvh', how: 'Read it again.' };
    expect(parse(addStep(once, 'relations', 'during', reread)).relations.during.checked).toEqual([STEP, reread]);
  });

  it('refuses a claim written in one line, rather than rewrite it', () => {
    const flow = RECORD.replace(/  name:\n    prop: name\n    value: \{ en: X \}\n    unsourced: An editorial label.\n/, '  name: { prop: name, value: { en: X }, unsourced: An editorial label. }\n');
    expect(() => addStep(flow, 'claims', 'name', STEP)).toThrow(/by hand/);
  });
});

describe('a claim that quotes two sources', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  const source = (id: string) => `id: ${id}\ntype: publication\nkind: measurement\ncitation: A fixture source, not a real publication.\n`;
  const text = (name: string, t: string): QuoteText => ({ name, sha: '0123456789abcdef', text: t });

  it('is quoted only when every quote is found, each in its own source\'s text; given one text, the other is asked for', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wikiworldmodel-quotes-'));
    dirs.push(root);
    const files: Record<string, string> = {
      'sources/a.yaml': source('src:test/a'),
      'sources/b.yaml': source('src:test/b'),
      'entities/x.yaml': `id: test/x\nkind: event/impact\nauthor: machine:claude-code\nclaims:\n  date:\n    prop: date\n    value: 66 Ma\n    source:\n      - { ref: src:test/a, loc: p. 1, quote: "at 66 Ma" }\n      - { ref: src:test/b, loc: p. 9, quote: "sixty-six million years" }\n  name:\n    prop: name\n    value: { en: X }\n    source: { ref: src:test/a, loc: p. 1, quote: "The X impact" }\n`,
    };
    for (const [path, t] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), t);
    }
    const w = await loadWorld(root);
    const a = text('a.txt', 'The X impact, at 66 Ma.');
    const b = text('b.txt', 'About sixty-six million years ago.');
    // One text: the claim that quotes only it is whole; the other still has a quote to find elsewhere.
    const one = checkClaims(w, new Map([['src:test/a', a]]));
    expect(one.map((r) => [r.claim.key, r.quotes.map((q) => q.found), r.others])).toEqual([
      ['date', [true], ['src:test/b']],
      ['name', [true], []],
    ]);
    // Both texts: each quote is looked for in its own source's text, and the step names both.
    const texts = new Map([['src:test/a', a], ['src:test/b', b]]);
    const both = checkClaims(w, texts);
    expect(both[0]).toMatchObject({ quotes: [{ source: 'src:test/a', found: true }, { source: 'src:test/b', found: true }], others: [] });
    expect(quotedHow(both[0], texts)).toBe('Found in a.txt (sha256 0123456789abcdef) and b.txt (sha256 0123456789abcdef), after normalizing whitespace and typography, by npm run world -- quote-check.');
    // A quote is not found in the other source's text.
    const swapped = checkClaims(w, new Map([['src:test/a', b], ['src:test/b', a]]));
    expect(swapped[0].quotes.map((q) => q.found)).toEqual([false, false]);
  });

  it('a step this tool wrote can be written again, in place', () => {
    const once = addStep(RECORD, 'claims', 'date', STEP);
    const again = replaceStep(once, 'claims', 'date', { ...STEP, how: 'Found in a.txt and b.txt.' });
    expect(parse(again).claims.date.checked).toEqual([{ ...STEP, how: 'Found in a.txt and b.txt.' }]);
    expect(again.replace('Found in a.txt and b.txt.', 'Found in a.txt.')).toBe(once);
    expect(() => replaceStep(RECORD, 'claims', 'date', STEP)).toThrow(/no quoted step/);
  });
});
