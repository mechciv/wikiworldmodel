// The first step of the ladder (docs/STRUCTURE.md section 3.7, core/ladder.ts): a claim's quotes found in
// the texts its sources were read in, by script, not by eye.
//
//   npm run world -- quote-check src:renne-2013-kpg-timescales renne-2013.txt [src:… <text file> …]
//                                [--by machine:<tool>] [--dry-run] [--redo]
//
// A text is what was retrieved and read: a page saved as text, a PDF's text. It is not kept; the step
// records its name and sha256. Both sides are compared after normalizing: Unicode compatibility forms,
// curly quotes and dashes as plain ones, soft hyphens and words broken across a line joined, and every run
// of whitespace as one space. A quote with an ellipsis (… or ...) is found when its pieces are, in order.
//
// A claim is quoted when every quote it has was found, each in its own source's text. So a claim that quotes
// two sources gets its step only when both texts are given in one run, and the step names both; given one,
// the other is asked for. The step is written into the claim's file, after what is there. `--redo` writes
// it again over one this tool wrote before, as when a claim was checked against one of its texts only.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isMap, isSeq, parseDocument, type Node, type YAMLMap } from 'yaml';
import type { CheckStep } from '../../../core/ladder.ts';
import type { Claim, Relation, World } from './world.ts';

/** A text as quotes are compared with it. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/­\s*/g, '')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The pieces of a quote, in order: an ellipsis is a gap between them. */
function piecesIn(pieces: string[], text: string): boolean {
  if (!pieces.length) return false;
  let from = 0;
  for (const p of pieces) {
    const at = text.indexOf(p, from);
    if (at < 0) return false;
    from = at + p.length;
  }
  return true;
}

/** A text with the hyphens inside its words taken out, so that "well-known" and "wellknown" are the same. */
const unhyphenated = (s: string) => s.replace(/(?<=\p{L})-(?=\p{L})/gu, '');

let lastText = '';
let lastUnhyphenated = '';

/**
 * Is a quote in a text? Both normalized; an ellipsis is a gap, whose pieces must come in order. A word broken
 * across a line has been joined without its hyphen, which is wrong for a compound that was broken at its own
 * hyphen ("Proto-" / "Sinaitic"): so a quote that is not found as it stands is looked for again with the hyphens
 * inside words left out of both.
 */
export function quoteIn(quote: string, text: string): boolean {
  const pieces = normalizeText(quote)
    .split(/\s*(?:…|\.\.\.)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (piecesIn(pieces, text)) return true;
  if (text !== lastText) {
    lastText = text;
    lastUnhyphenated = unhyphenated(text);
  }
  return piecesIn(pieces.map(unhyphenated), lastUnhyphenated);
}

/** The column a node starts at, in a text. */
function columnOf(text: string, offset: number): number {
  return offset - (text.lastIndexOf('\n', offset - 1) + 1);
}

/** A step as one line of YAML, in the flow style the records use. */
function stepLine(s: CheckStep): string {
  const q = (v: string) => JSON.stringify(v);
  return `{ step: ${s.step}, by: ${s.by}, how: ${q(s.how)}${s.on ? `, on: ${q(s.on)}` : ''} }`;
}

/**
 * Add a step to a claim or relation in a record's text, after what is there, leaving the rest of the file as
 * it was. Returns the new text, or the old one if the claim already has a step of that kind.
 */
export function addStep(text: string, section: 'claims' | 'relations', key: string, step: CheckStep): string {
  const doc = parseDocument(text, { keepSourceTokens: true });
  const claim = doc.getIn([section, key], true) as YAMLMap | undefined;
  if (!claim || !isMap(claim) || claim.flow || !claim.items.length || !claim.range) throw new Error(`${section}.${key} is not a block mapping in this file: add its steps by hand`);
  const checked = claim.get('checked', true) as Node | undefined;
  if (checked && isSeq(checked) && checked.items.some((i) => isMap(i) && i.get('step') === step.step)) return text;
  const indent = columnOf(text, (claim.items[0].key as Node).range![0]);
  const pad = ' '.repeat(indent);
  if (checked) {
    if (!isSeq(checked) || checked.flow || !checked.range) throw new Error(`${section}.${key}.checked is not a block list: add the step by hand`);
    const itemPad = ' '.repeat(columnOf(text, (checked.items[0] as Node).range![0]) - 2);
    return insertLines(text, checked.range[1], [`${itemPad}- ${stepLine(step)}`]);
  }
  return insertLines(text, claim.range[1], [`${pad}checked:`, `${pad}  - ${stepLine(step)}`]);
}

/** Lines put in at the end of a block that ends at `at`, whether or not its last newline is part of it. */
function insertLines(text: string, at: number, lines: string[]): string {
  const block = lines.join('\n');
  return text[at - 1] === '\n' ? `${text.slice(0, at)}${block}\n${text.slice(at)}` : `${text.slice(0, at)}\n${block}${text.slice(at)}`;
}

/** Write a step over the step of its kind that a claim or relation has, leaving the rest of the file as it was. */
export function replaceStep(text: string, section: 'claims' | 'relations', key: string, step: CheckStep): string {
  const doc = parseDocument(text, { keepSourceTokens: true });
  const checked = doc.getIn([section, key, 'checked'], true) as Node | undefined;
  const item = checked && isSeq(checked) ? (checked.items.find((i) => isMap(i) && i.get('step') === step.step) as Node | undefined) : undefined;
  if (!item?.range || !isMap(item) || !item.flow) throw new Error(`${section}.${key} has no ${step.step} step written on one line to write over`);
  return `${text.slice(0, item.range[0])}${stepLine(step)}${text.slice(item.range[1])}`;
}

export interface QuoteText {
  /** the file's name, as the step records it */
  name: string;
  /** the first sixteen digits of its sha256 */
  sha: string;
  text: string;
}

export interface ClaimQuotes {
  claim: Claim | Relation;
  /** each of its quotes from a source whose text was given, and whether that text has it */
  quotes: { source: string; quote: string; found: boolean }[];
  /** the sources it quotes whose texts were not given */
  others: string[];
}

/** Every claim that quotes one of the sources given, with all of its quotes: found, not found, or from a source not given. */
export function checkClaims(world: World, texts: Map<string, QuoteText>): ClaimQuotes[] {
  const norm = new Map([...texts].map(([source, t]) => [source, normalizeText(t.text)]));
  const out: ClaimQuotes[] = [];
  for (const e of world.entities) {
    for (const c of [...e.claims, ...e.relations]) {
      // What speaks for a claim and what denies it are quoted alike: both are words that must be in their texts.
      const quoted = [...c.sources, ...c.against].filter((s) => s.quote);
      if (!quoted.some((s) => norm.has(s.ref))) continue;
      out.push({
        claim: c,
        quotes: quoted.filter((s) => norm.has(s.ref)).map((s) => ({ source: s.ref, quote: s.quote!, found: quoteIn(s.quote!, norm.get(s.ref)!) })),
        others: [...new Set(quoted.filter((s) => !norm.has(s.ref)).map((s) => s.ref))],
      });
    }
  }
  return out;
}

/** What the step says was done: the texts a claim's quotes were found in, in the order it cites them. */
export function quotedHow(c: ClaimQuotes, texts: Map<string, QuoteText>): string {
  const files = [...new Set(c.quotes.map((q) => q.source))].map((s) => `${texts.get(s)!.name} (sha256 ${texts.get(s)!.sha})`);
  const list = files.length > 1 ? `${files.slice(0, -1).join(', ')} and ${files.at(-1)}` : files[0];
  return `Found in ${list}, after normalizing whitespace and typography, by npm run world -- quote-check.`;
}

export async function runQuoteCheck(world: World, args: string[]): Promise<number> {
  const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--by'));
  if (!positional.length || positional.length % 2) {
    console.error('usage: world quote-check src:<source> <text file> [src:<source> <text file> …] [--by machine:<tool>] [--dry-run] [--redo]');
    return 2;
  }
  const by = args.includes('--by') ? args[args.indexOf('--by') + 1] : 'machine:quote-check';
  const dry = args.includes('--dry-run');
  const redo = args.includes('--redo');
  const texts = new Map<string, QuoteText>();
  for (let i = 0; i < positional.length; i += 2) {
    const [source, file] = [positional[i], positional[i + 1]];
    if (!world.source.has(source)) throw new Error(`no source ${source} in the world`);
    const raw = readFileSync(file);
    texts.set(source, { name: basename(file), sha: createHash('sha256').update(raw).digest('hex').slice(0, 16), text: raw.toString('utf8') });
  }
  const results = checkClaims(world, texts);
  const on = new Date().toISOString().slice(0, 10);
  const files = new Map<string, string>();
  let added = 0;
  const waiting = new Map<string, number>();
  for (const r of results) {
    const c = r.claim;
    if (r.quotes.some((q) => !q.found) || c.where.split('.').length !== 2) continue;
    // Quoted means every quote: one from a source whose text was not given is still to find.
    if (r.others.length) {
      for (const o of r.others) waiting.set(o, (waiting.get(o) ?? 0) + 1);
      continue;
    }
    const has = c.checked.find((s) => s.step === 'quoted');
    if (has && !(redo && has.by === by)) continue;
    const step: CheckStep = { step: 'quoted', by, how: quotedHow(r, texts), on };
    const [section, key] = c.where.split('.') as ['claims' | 'relations', string];
    const path = join(world.root, c.file);
    const before = files.get(path) ?? readFileSync(path, 'utf8');
    const after = has ? replaceStep(before, section, key, step) : addStep(before, section, key, step);
    if (after !== before) added++;
    files.set(path, after);
  }
  if (!dry) for (const [path, text] of files) writeFileSync(path, text);
  let missing = 0;
  for (const [source, t] of texts) {
    const mine = results.flatMap((r) => r.quotes.filter((q) => q.source === source).map((q) => ({ ...q, claim: r.claim })));
    const lost = mine.filter((q) => !q.found);
    missing += lost.length;
    console.log(`${source}: ${mine.length - lost.length} of ${mine.length} quotes found in ${t.name}.`);
    for (const q of lost) console.log(`  not found  ${q.claim.file} ${q.claim.where}: ${q.quote}`);
  }
  console.log(`${dry ? 'Would record' : 'Recorded'} the quoted step on ${added} claim${added === 1 ? '' : 's'}.`);
  if (waiting.size) {
    console.log('Some claims quote other sources too, and are quoted only when every quote is found: give these texts in the same run.');
    for (const [source, n] of [...waiting].sort()) console.log(`  ${source}  (${n} claim${n === 1 ? '' : 's'})`);
  }
  return missing ? 1 : 0;
}
