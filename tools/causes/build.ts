// npm run causes [-- --check]
//
// Checks the graph of causes (docs/causes/), prints where the work is, and writes its page: dist/causes/index.html to
// open in a browser, and dist/causes/artifact.html, the same page without a document's wrapping, for publishing as an
// artifact. With --check it only checks.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGraph, EDGE_STATES, loadGraph, ranking, reachOf } from './graph.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const g = loadGraph(join(root, 'docs', 'causes'));

const problems = checkGraph(g, root);
if (problems.length) {
  for (const p of problems) console.error(`causes  ${p}`);
  console.error(`causes  ${problems.length} problem${problems.length === 1 ? '' : 's'} in docs/causes`);
  process.exit(1);
}

const reach = reachOf(g);
const seen = g.nodes.reduce((n, node) => n + node.seen.length, 0);
const byState = EDGE_STATES.map((s) => `${g.edges.filter((e) => e.now === s).length} ${s}`).join(', ');
const loops = new Set(g.edges.flatMap((e) => (e.loop ? [e.loop] : [])));
console.log(`causes  ${g.nodes.length} nodes in ${g.lanes.length} lanes; ${g.edges.length} causes (${byState}); ${seen} observations; ${loops.size} loops`);
console.log('causes  where the work is, by gap times reach:');
for (const n of ranking(g, reach).slice(0, 15)) {
  const r = reach.get(n.id)!;
  console.log(`causes    ${String(r.score).padStart(4)}  ${n.label} (${n.gap}, read by ${r.down})`);
}

if (!process.argv.includes('--check')) {
  const data = {
    lanes: g.lanes,
    nodes: g.nodes.map((n) => ({ ...n, ...reach.get(n.id)! })),
    edges: g.edges.map(({ from, to, now, how, by, loop }) => ({ from, to, now, how, by, loop })),
  };
  // `<` is written as an escape, so that no text of the graph can end the script element it is carried in.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const page = readFileSync(join(here, 'page.html'), 'utf8').replace('__GRAPH__', () => json);
  const [head, body] = page.split('<!-- body -->');
  if (body === undefined) throw new Error('tools/causes/page.html has no <!-- body --> line');
  const out = join(root, 'dist', 'causes');
  mkdirSync(out, { recursive: true });
  // An artifact's page is wrapped in a document when it is published, so it is written without one.
  writeFileSync(join(out, 'artifact.html'), head + body);
  writeFileSync(
    join(out, 'index.html'),
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n` +
      `<style>body{margin:0;font:14px system-ui,sans-serif}[hidden]{display:none!important}</style>\n${head}</head>\n<body>\n${body}</body>\n</html>\n`,
  );
  console.log(`causes  wrote dist/causes/index.html (${Math.round((head.length + body.length) / 1024)} kB)`);
}
