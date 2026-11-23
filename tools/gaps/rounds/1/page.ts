// The first round's page (docs/plans/VISUAL-GAPS.md, sections 2 and 3.6): a throwaway. It lays the round out as one
// page, dist/gaps/1/index.html: the gaps counted by what owes them, then a card for each point, with what the brief
// expects beside what the viewer drew, and each item's verdict. The pictures go beside it, as JPEGs.
//
//   npx tsx tools/gaps/rounds/1/page.ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { fromMa, PRESENT_YEAR } from '../../../../core/time.ts';
import { positionOf } from '../../../../core/timescale.ts';

const REPO = join(import.meta.dirname, '../../../..');
const HERE = import.meta.dirname;
const OUT = join(REPO, 'dist/gaps/1');

interface Point {
  name: string;
  t: number;
  when: string;
  lat: number;
  lon: number;
  camera: 'eye' | 'air' | 'orbit';
  heading: number;
  hour: number;
  month: number;
  why: string;
  link: string;
}
interface Item {
  id: string;
  layer: string;
  what: string;
  reach: 'place' | 'region';
  source: { cite?: string; ref?: string; url?: string; loc: string; quote: string };
  note?: string;
}
interface Brief {
  place?: string;
  expects?: Item[];
  unknown?: (string | Record<string, string>)[];
  pictures?: { url: string; what: string }[];
  effort?: { fetched?: number; cited?: number; failed?: number; note?: string };
}
type Verdict = 'drawn' | 'wrong' | 'missing-held' | 'missing-not-held' | 'no-layer' | 'untested';
interface Verdicts {
  author: string;
  judged: string;
  findings?: { title: string; text: string }[];
  points: Record<string, { summary?: string; items: Record<string, { verdict: Verdict; owner: string; why: string }> }>;
}
// What made each expected picture (picture.ts), what its prompt left out (prompts.yaml), and how the picture holds to
// its brief (picture-checks.yaml): an item the prompt asked for is shown unless the check says absent or against.
type Made = Record<string, { model: string; quality: string; made: string; prompt: string; takes: number }>;
interface Prompts {
  points: Record<string, { leaves_out?: Record<string, string> }>;
}
interface Checks {
  points: Record<string, { note?: string; absent?: Record<string, string>; against?: Record<string, string>; adds?: string[] }>;
}

const VERDICT: Record<Verdict, { label: string; means: string }> = {
  drawn: { label: 'Drawn', means: 'the viewer shows it' },
  wrong: { label: 'Drawn wrong', means: 'it is there, and not as the source says' },
  'missing-held': { label: 'Missing, held', means: 'the world holds the evidence and the scene does not draw it' },
  'missing-not-held': { label: 'Missing, not held', means: 'the evidence exists and the world does not hold it' },
  'no-layer': { label: 'No layer', means: 'nothing in the world could say it yet' },
  untested: { label: 'Not tested', means: 'of the region or another moment: one frame cannot show whether the viewer has it' },
};
const ORDER = Object.keys(VERDICT) as Verdict[];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CAMERA = { eye: 'eye level', air: '300 m up', orbit: 'orbit' };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const round = JSON.parse(readFileSync(join(HERE, 'points.json'), 'utf8')) as { seed: string; build: string; mix: Record<string, number>; points: Point[] };
const drawn = (JSON.parse(readFileSync(join(HERE, 'drawn.json'), 'utf8')) as { views: Record<string, { tiers: Record<string, { tier: string }>; text: string[] }> }).views;
const verdicts: Verdicts = existsSync(join(HERE, 'verdicts.yaml')) ? (parse(readFileSync(join(HERE, 'verdicts.yaml'), 'utf8')) as Verdicts) : { author: '', judged: '', points: {} };
const read = <T>(file: string, fallback: T): T => (existsSync(join(HERE, file)) ? (file.endsWith('.json') ? JSON.parse(readFileSync(join(HERE, file), 'utf8')) : parse(readFileSync(join(HERE, file), 'utf8'))) : fallback) as T;
const made = read<Made>('pictures.json', {});
const prompts = read<Prompts>('prompts.yaml', { points: {} });
const checks = read<Checks>('picture-checks.yaml', { points: {} });
const briefs = new Map<string, Brief>();
for (const p of round.points) if (existsSync(join(HERE, `${p.name}.yaml`))) briefs.set(p.name, parse(readFileSync(join(HERE, `${p.name}.yaml`), 'utf8')) as Brief);

// The pictures, as JPEGs of a width a page can carry.
mkdirSync(join(OUT, 'img'), { recursive: true });
for (const p of round.points) {
  for (const kind of ['drawn', 'expected']) {
    const from = join(OUT, kind, `${p.name}.png`);
    if (existsSync(from)) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '-Z', '1280', from, '--out', join(OUT, 'img', `${p.name}-${kind}.jpg`)], { stdio: 'ignore' });
  }
}

// The roll-up: every judged item, by verdict, by layer and by owner.
const judged = round.points.flatMap((p) =>
  (briefs.get(p.name)?.expects ?? []).flatMap((x) => {
    const v = verdicts.points[p.name]?.items[x.id];
    return v ? [{ point: p.name, item: x, ...v }] : [];
  }),
);
const count = <K extends string>(key: (j: (typeof judged)[number]) => K) => judged.reduce((m, j) => m.set(key(j), (m.get(key(j)) ?? 0) + 1), new Map<K, number>());
const byVerdict = count((j) => j.verdict);
const layers = [...new Set(judged.map((j) => j.item.layer))];
const gaps = judged.filter((j) => j.verdict !== 'drawn' && j.verdict !== 'untested');
const owners = [...gaps.reduce((m, j) => m.set(j.owner, [...(m.get(j.owner) ?? []), j]), new Map<string, typeof gaps>())].sort((a, b) => b[1].length - a[1].length);
const reach = count((j) => j.item.reach);
const unknowns = [...briefs.values()].reduce((n, b) => n + (b.unknown?.length ?? 0), 0);

const pill = (v: Verdict) => `<span class="pill v-${v}">${VERDICT[v].label}</span>`;
const last = positionOf(PRESENT_YEAR);
const at = (t: number) => ((positionOf(t) / last) * 100).toFixed(2);
const AXIS: [number, string][] = [[fromMa(4000), '4 Ga'], [fromMa(541), '541 Ma'], [fromMa(66), '66 Ma'], [-10000, '10,000 BCE'], [1, '1 CE'], [1500, '1500'], [PRESENT_YEAR, 'today']];

const ownerRow = ([o, js]: (typeof owners)[number]) => `<tr><td class="owner">${esc(o)}</td><td class="n">${js.length}</td><td>${[...new Set(js.map((j) => `<a href="#${j.point}">${j.point}</a>`))].join(' ')}</td><td>${[...new Set(js.map((j) => esc(j.why)))].slice(0, 3).join(' ')}</td></tr>`;

function card(p: Point): string {
  const b = briefs.get(p.name);
  const v = verdicts.points[p.name];
  const d = drawn[p.name];
  const expected = existsSync(join(OUT, 'img', `${p.name}-expected.jpg`));
  const m = made[p.name];
  const out = prompts.points[p.name]?.leaves_out ?? {};
  const check = checks.points[p.name];
  // How the expected picture holds an item of its brief: the picture is only an illustration, and says where it fails.
  const inPicture = (id: string): [string, string] | undefined =>
    !expected || !check ? undefined : out[id] ? ['not asked', out[id]!] : check.against?.[id] ? ['against', check.against[id]!] : check.absent?.[id] ? ['absent', check.absent[id]!] : ['shown', 'The expected picture shows it.'];
  const held = (b?.expects ?? []).reduce((n, x) => ((n[inPicture(x.id)?.[0] ?? ''] = (n[inPicture(x.id)?.[0] ?? ''] ?? 0) + 1), n), {} as Record<string, number>);
  const holds = check ? ` Of the brief's ${b?.expects?.length ?? 0} items it shows ${held.shown ?? 0}${held.absent ? `, lacks ${held.absent}` : ''}${held.against ? `, goes against ${held.against}` : ''}${held['not asked'] ? `, and was not asked for ${held['not asked']}` : ''}.` : '';
  const tally = ORDER.map((k) => [k, (b?.expects ?? []).filter((x) => v?.items[x.id]?.verdict === k).length] as const).filter(([, n]) => n);
  const rows = (b?.expects ?? [])
    .map((x) => {
      const j = v?.items[x.id];
      const cite = esc(x.source.cite ?? x.source.ref ?? '');
      return `<li class="item" data-verdict="${j?.verdict ?? 'none'}">
        <div class="item-head">${j ? pill(j.verdict) : '<span class="pill">Not judged</span>'}<span class="layer">${esc(x.layer)}</span><span class="reach" title="${x.reach === 'place' ? 'The source says it of this place and time' : 'The source says it of the region or period, carried here'}">${x.reach}</span>${inPicture(x.id) ? `<span class="pic pic-${inPicture(x.id)![0].replace(' ', '-')}" title="${esc(inPicture(x.id)![1])}">expected picture: ${inPicture(x.id)![0]}</span>` : ''}</div>
        <p class="what">${esc(x.what)}</p>
        ${j ? `<p class="why"><span class="owner">${esc(j.owner)}</span> ${esc(j.why)}</p>` : ''}
        <details><summary>Source</summary><blockquote>${esc(x.source.quote)}</blockquote><p class="cite">${x.source.url ? `<a href="${esc(x.source.url)}">${cite}</a>` : cite}, ${esc(x.source.loc)}</p>${x.note ? `<p class="cite">${esc(x.note)}</p>` : ''}</details>
      </li>`;
    })
    .join('\n');
  return `<article class="card" id="${p.name}">
  <header class="card-head">
    <div><span class="tag">${p.name}</span><h2>${esc(p.when)}</h2></div>
    <p class="place">${esc(b?.place ?? `${p.lat}, ${p.lon}`)}</p>
    <p class="meta">${CAMERA[p.camera]}${p.camera === 'orbit' ? '' : `, facing ${p.heading}°`} · ${p.hour}:00 · ${MONTHS[p.month - 1]} · drawn by ${esc(p.why.split(':')[0])}</p>
  </header>
  <div class="pair">
    <figure>
      <figcaption>Expected</figcaption>
      ${
        expected
          ? `<img src="img/${p.name}-expected.jpg" alt="An illustration of the scene the brief expects" loading="lazy"><p class="note">An illustration made by a model${m ? ` (${esc(m.model)}, ${esc(m.made)}${m.takes > 1 ? `, take ${m.takes}` : ''})` : ''} from the brief. Not evidence.${holds}</p>${
              m || check?.adds?.length
                ? `<details class="made"><summary>What it adds, and its prompt</summary>${check?.note ? `<p class="cite">${esc(check.note)}</p>` : ''}${check?.adds?.length ? `<p class="cite">Beyond the brief, the model put in: ${esc(check.adds.join('; '))}.</p>` : ''}${m ? `<p class="cite">${esc(m.prompt)}</p>` : ''}</details>`
                : ''
            }`
          : `<div class="nopicture"><p class="caption">No picture yet. The brief is the yardstick:</p><ul>${(b?.expects ?? []).map((x) => `<li>${esc(x.what)}</li>`).join('')}</ul></div>`
      }
    </figure>
    <figure>
      <figcaption>Drawn</figcaption>
      <img src="img/${p.name}-drawn.jpg" alt="The viewer's picture of the same view" loading="lazy">
      <p class="caption">${Object.entries(d?.tiers ?? {}).map(([l, a]) => `<span class="tier t-${esc(a.tier)}" title="${esc(l)}: ${esc(a.tier)}">${esc(l)}</span>`).join('')}</p>
      ${d?.text?.length ? `<p class="caption">The viewer says: ${esc(d.text.join(' · '))}</p>` : ''}
    </figure>
  </div>
  ${v?.summary ? `<p class="summary">${esc(v.summary)}</p>` : ''}
  <div class="tally">${tally.map(([k, n]) => `<span>${pill(k)} ${n}</span>`).join('')}</div>
  <ul class="items">${rows}</ul>
  ${b?.unknown?.length ? `<details class="unknown"><summary>Not known: ${b.unknown.length} things no source read could say</summary><ul>${b.unknown.map((u) => `<li>${esc(typeof u === 'string' ? u : Object.entries(u).map(([k, v]) => `${k}: ${v}`).join(' '))}</li>`).join('')}</ul></details>` : ''}
  <p class="link"><code>?b=${round.build}&amp;${esc(p.link)}</code></p>
</article>`;
}

const html = `<title>Visual Gaps, Round 1</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>
/* One column of cards on the viewer's own dark ground: each card a pair of pictures over its list. The viewer's
   colours and type (viewer/src/tokens.css), a single dark look, as the viewer's pages are. */
:root {
  --bg: #03040b; --panel: #0a0d14; --line: rgba(233, 236, 242, 0.16); --hair: rgba(233, 236, 242, 0.1);
  --text: #e9ecf2; --text-2: #c8ced8; --muted: #9aa3b2; --faint: #7a8496; --accent: #f4b860; --link: #9fd6f5;
  --tier-evidence: #259ed6; --tier-model: #d27908; --tier-generic: #d446a1; --tier-unknown: #222a3a;
  --v-drawn: #5fc49a; --v-wrong: #f2a63a; --v-held: #f0736e; --v-nothold: #b193f2; --v-nolayer: #6fb7e8; --v-untested: #7a8496;
  --font: 'Geist', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: dark;
}
body { background: var(--bg); color: var(--text); font: 15px/1.5 var(--font); padding-block: 40px 80px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
main { max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 40px; }
h1 { font-size: 30px; font-weight: 600; letter-spacing: -0.01em; margin: 0; text-wrap: balance; }
h2 { font-size: 20px; font-weight: 600; margin: 0; display: inline; }
h3 { font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0 0 12px; }
p { margin: 0; }
a { color: var(--link); }
a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.lede { color: var(--text-2); max-width: 68ch; margin-top: 10px; }
.facts { color: var(--faint); font: 12px/1.6 var(--mono); margin-top: 12px; }
section { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.strip { position: relative; height: 62px; border-bottom: 1px solid var(--line); }
.strip a { position: absolute; bottom: 0; transform: translateX(-50%); font: 11px var(--mono); color: var(--accent); text-decoration: none; padding-bottom: 12px; }
.strip a::after { content: ''; position: absolute; left: 50%; bottom: 0; width: 1px; height: 9px; background: var(--accent); }
.strip a:nth-child(even) { padding-bottom: 28px; }
.strip a:nth-child(even)::after { height: 25px; }
.axis { position: relative; height: 18px; font: 11px var(--mono); color: var(--faint); }
.axis span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.axis span:first-child { transform: none; } .axis span:last-child { transform: translateX(-100%); }
.bar { display: flex; height: 26px; border-radius: 4px; overflow: hidden; }
.bar span { min-width: 2px; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 18px; color: var(--text-2); font-size: 13px; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 7px 12px 7px 0; border-bottom: 1px solid var(--hair); vertical-align: top; }
th { color: var(--muted); font-weight: 500; }
td.n, th.n { text-align: right; }
td.zero { color: var(--faint); }
.owner { font: 12px var(--mono); color: var(--accent); overflow-wrap: anywhere; }
.findings { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px 32px; }
.findings h4 { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
.findings p { color: var(--text-2); font-size: 14px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.filters button { font: 13px var(--font); color: var(--text-2); background: transparent; border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; cursor: pointer; }
.filters button[aria-pressed='true'] { color: var(--bg); background: var(--text); border-color: var(--text); }
.card { border-top: 1px solid var(--line); padding-top: 24px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.card-head { display: flex; flex-direction: column; gap: 2px; }
.tag { font: 12px var(--mono); color: var(--accent); margin-right: 10px; }
.place { color: var(--text-2); }
.meta, .link { font: 12px var(--mono); color: var(--faint); overflow-wrap: anywhere; }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
figure { margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
figcaption { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
figure img { display: block; width: 100%; aspect-ratio: 1600 / 788; object-fit: cover; border-radius: 4px; background: var(--panel); }
.nopicture { aspect-ratio: 1600 / 788; overflow-y: auto; border: 1px dashed var(--line); border-radius: 4px; padding: 12px 14px; background: var(--panel); }
.nopicture ul { margin: 6px 0 0; padding-left: 18px; color: var(--text-2); font-size: 13px; }
.caption { font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px; }
.note { font-size: 12px; color: var(--muted); }
.made summary { font-size: 12px; color: var(--faint); cursor: pointer; }
.made p { margin-top: 6px; }
.pic { font: 11px var(--mono); color: var(--faint); margin-left: auto; }
.pic-against { color: var(--v-wrong); } .pic-absent { color: var(--v-held); }
.tier { font: 11px var(--mono); padding: 1px 6px; border-radius: 3px; color: #fff; }
.t-evidence { background: var(--tier-evidence); } .t-model { background: var(--tier-model); } .t-generic { background: var(--tier-generic); } .t-unknown { background: var(--tier-unknown); color: var(--muted); outline: 1px solid #3a4560; outline-offset: -1px; }
.summary { color: var(--text-2); max-width: 78ch; }
.tally { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--text-2); }
.pill { display: inline-block; font-size: 12px; font-weight: 500; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
.v-drawn { color: var(--v-drawn); border-color: var(--v-drawn); } .v-wrong { color: var(--v-wrong); border-color: var(--v-wrong); }
.v-missing-held { color: var(--v-held); border-color: var(--v-held); } .v-missing-not-held { color: var(--v-nothold); border-color: var(--v-nothold); } .v-no-layer { color: var(--v-nolayer); border-color: var(--v-nolayer); } .v-untested { color: var(--v-untested); border-color: var(--line); }
.b-drawn { background: var(--v-drawn); } .b-wrong { background: var(--v-wrong); } .b-missing-held { background: var(--v-held); } .b-missing-not-held { background: var(--v-nothold); } .b-no-layer { background: var(--v-nolayer); } .b-untested { background: var(--tier-unknown); }
.items { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 0 28px; }
.item { padding: 10px 0; border-top: 1px solid var(--hair); display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.item-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.layer, .reach { font: 11px var(--mono); color: var(--faint); }
.what { font-size: 14px; }
.why { font-size: 13px; color: var(--muted); }
details { font-size: 12px; color: var(--muted); }
summary { cursor: pointer; color: var(--faint); }
blockquote { margin: 6px 0; padding-left: 10px; border-left: 2px solid var(--line); color: var(--text-2); overflow-wrap: anywhere; }
.cite { overflow-wrap: anywhere; }
.unknown ul { margin: 6px 0 0; padding-left: 18px; color: var(--text-2); font-size: 13px; }
code { font-family: var(--mono); }
@media (max-width: 720px) { .items { grid-template-columns: 1fr; } h1 { font-size: 24px; } }
</style>
<main>
<header>
  <h1>Visual gaps, round 1</h1>
  <p class="lede">Twelve places and times, drawn by a seeded sampler along the time strip. For each, a researched brief says what the evidence puts in view, and the viewer's picture of the same link is held to it, item by item. The verdicts are a machine's judgements of pictures, not measurements.</p>
  <p class="facts">build ${round.build} · seed ${esc(round.seed)} · ${judged.length} items judged in ${briefs.size} briefs · ${reach.get('place') ?? 0} said of the place, ${reach.get('region') ?? 0} of its region · ${unknowns} things not known · judged ${esc(verdicts.judged)} by ${esc(verdicts.author)}</p>
</header>

<section>
  <h3>The round along the time strip</h3>
  <div><div class="strip">${round.points.map((p) => `<a href="#${p.name}" style="left:${at(p.t)}%">${p.name}</a>`).join('')}</div>
  <div class="axis">${AXIS.map(([t, l]) => `<span style="left:${at(t)}%">${l}</span>`).join('')}</div></div>
</section>

<section>
  <h3>What became of ${judged.length} expected things</h3>
  <div class="bar">${ORDER.map((k) => `<span class="b-${k}" style="flex:${byVerdict.get(k) ?? 0}" title="${VERDICT[k].label}: ${byVerdict.get(k) ?? 0}"></span>`).join('')}</div>
  <div class="legend">${ORDER.map((k) => `<span>${pill(k)} ${byVerdict.get(k) ?? 0} · ${VERDICT[k].means}</span>`).join('')}</div>
</section>

${verdicts.findings?.length ? `<section><h3>What the round found</h3><div class="findings">${verdicts.findings.map((f) => `<div><h4>${esc(f.title)}</h4><p>${esc(f.text)}</p></div>`).join('')}</div></section>` : ''}

<section>
  <h3>Gaps by what owes them</h3>
  <div class="scroll"><table>
    <tr><th>Owner</th><th class="n">Gaps</th><th>Points</th><th>What is missing or wrong</th></tr>
    ${owners.filter(([, js]) => js.length > 1).map(ownerRow).join('\n')}
  </table></div>
  <details><summary>${owners.filter(([, js]) => js.length === 1).length} more owners with one gap each</summary><div class="scroll"><table>
    ${owners.filter(([, js]) => js.length === 1).map(ownerRow).join('\n')}
  </table></div></details>
</section>

<section>
  <h3>By layer</h3>
  <div class="scroll"><table>
    <tr><th>Layer</th>${ORDER.map((k) => `<th class="n">${VERDICT[k].label}</th>`).join('')}</tr>
    ${layers.map((l) => `<tr><td>${esc(l)}</td>${ORDER.map((k) => { const n = judged.filter((j) => j.item.layer === l && j.verdict === k).length; return `<td class="n${n ? '' : ' zero'}">${n}</td>`; }).join('')}</tr>`).join('\n')}
  </table></div>
</section>


<section>
  <h3>The twelve points</h3>
  <div class="filters" role="group" aria-label="Show items by verdict"><button type="button" id="f-all" data-f="all" aria-pressed="true">All</button>${ORDER.map((k) => `<button type="button" id="f-${k}" data-f="${k}" aria-pressed="false">${VERDICT[k].label}</button>`).join('')}</div>
  ${round.points.map(card).join('\n')}
</section>
</main>
<script>
for (const b of document.querySelectorAll('.filters button')) b.addEventListener('click', () => {
  for (const o of document.querySelectorAll('.filters button')) o.setAttribute('aria-pressed', String(o === b));
  for (const li of document.querySelectorAll('.item')) li.hidden = b.dataset.f !== 'all' && li.dataset.verdict !== b.dataset.f;
});
</script>
`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(`${join(OUT, 'index.html')}: ${briefs.size} briefs, ${judged.length} items judged, ${gaps.length} gaps, ${owners.length} owners`);
