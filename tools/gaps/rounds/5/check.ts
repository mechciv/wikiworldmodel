// The fifth round's check (round 1's, unchanged but for its folder) of a brief (docs/plans/VISUAL-GAPS.md, section 3.2): a throwaway. Every item a brief
// expects has a source with a quote, and every quote must be found in the text that was read and kept, by the same
// rule the world's quote-check uses (tools/world/src/quotecheck.ts).
//
//   npx tsx tools/gaps/rounds/1/check.ts p07 [p08 …]      (no names: every brief of the round)
//
// The texts are in .cache/source-texts/gaps-5/<point>/, out of git as the world's are.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { normalizeText, quoteIn } from '../../../world/src/quotecheck.ts';

const REPO = join(import.meta.dirname, '../../../..');
const HERE = import.meta.dirname;
const LAYERS = ['sky', 'relief', 'water', 'substrate', 'cover', 'life', 'people', 'weather', 'geography', 'ice', 'polity'];

interface Source {
  cite?: string;
  ref?: string;
  url?: string;
  text?: string;
  loc?: string;
  quote?: string;
}
interface Brief {
  view?: string;
  author?: string;
  place?: string;
  expects?: { id?: string; layer?: string; what?: string; reach?: string; source?: Source }[];
  unknown?: string[];
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(HERE).filter((f) => /^p\d+\.yaml$/.test(f)).map((f) => f.replace('.yaml', ''));
let bad = 0;
for (const name of names) {
  const brief = parse(readFileSync(join(HERE, `${name}.yaml`), 'utf8')) as Brief;
  const texts = join(REPO, '.cache/source-texts/gaps-5', name);
  const say = (id: string, what: string) => (bad++, console.log(`${name} ${id}: ${what}`));
  if (!brief.author?.startsWith('machine:')) say('', 'no author: machine:<tool>');
  if (!brief.view) say('', 'no view');
  const ids = new Set<string>();
  for (const x of brief.expects ?? []) {
    const id = x.id ?? '(no id)';
    if (!x.id || ids.has(x.id)) say(id, 'an item needs an id of its own');
    ids.add(id);
    if (!x.what) say(id, 'says nothing (what)');
    if (!LAYERS.includes(x.layer ?? '')) say(id, `layer is one of ${LAYERS.join(', ')}`);
    if (x.reach !== 'place' && x.reach !== 'region') say(id, 'reach is place or region');
    const s = x.source;
    if (!s?.quote || !s.loc || !s.text || !(s.cite || s.ref)) {
      say(id, 'its source needs cite (or ref), text, loc and quote');
      continue;
    }
    if (s.quote.length > 400) say(id, `its quote is ${s.quote.length} characters; at most 400`);
    const file = join(texts, s.text);
    if (!existsSync(file)) say(id, `the text ${s.text} is not in ${texts}`);
    else if (!quoteIn(s.quote, normalizeText(readFileSync(file, 'utf8')))) say(id, `its quote is not in ${s.text}`);
  }
  console.log(`${name}: ${brief.expects?.length ?? 0} items, ${brief.unknown?.length ?? 0} unknown`);
}
console.log(bad ? `${bad} to fix` : 'every quote found in the text it was read in');
process.exit(bad ? 1 : 0);
