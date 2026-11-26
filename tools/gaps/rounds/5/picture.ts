// The fifth round's expected pictures (round 1's script) (docs/plans/VISUAL-GAPS.md, section 3.3): a throwaway. Each prompt in
// prompts.yaml goes to xAI's image model, and the picture comes back to dist/gaps/5/expected/, with what made it
// (the model, the prompt, the cost, the day) beside the round, in pictures.json. The API takes no seed, so a
// picture cannot be made again as it was: the prompt is what is kept.
//
//   npx tsx tools/gaps/rounds/5/picture.ts --dry            the prompts as they would be sent; nothing is sent
//   npx tsx tools/gaps/rounds/5/picture.ts [p04 p12 …]      make those pictures (no names: every one not yet made)
//   npx tsx tools/gaps/rounds/5/picture.ts --again p04      make one again, keeping the last as pNN.<k>.png
//
// The key is read from XAI_API_KEY, or from .cache/xai-api-key (out of git). Only the prompt is sent.
// A picture is an illustration of its brief, never evidence: nothing here is read by the world, the build or the viewer.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const REPO = join(import.meta.dirname, '../../../..');
const HERE = import.meta.dirname;
const OUT = join(REPO, 'dist/gaps/5/expected');
const MODEL = 'grok-imagine-image-2.0';
const QUALITY = 'medium';
const ENDPOINT = 'https://api.x.ai/v1/images/generations';

interface Prompts {
  style: string;
  cameras: Record<string, string>;
  points: Record<string, { prompt: string; camera?: string; leaves_out?: Record<string, string> }>;
}
interface Made {
  model: string;
  quality: string;
  made: string;
  prompt: string;
  mime: string;
  usd?: number;
  takes: number;
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const again = args.includes('--again');
const named = args.filter((a) => !a.startsWith('--'));
const prompts = parse(readFileSync(join(HERE, 'prompts.yaml'), 'utf8')) as Prompts;
const cameraOf = new Map((JSON.parse(readFileSync(join(HERE, 'points.json'), 'utf8')) as { points: { name: string; camera: string }[] }).points.map((p) => [p.name, p.camera]));
const logFile = join(HERE, 'pictures.json');
const log: Record<string, Made> = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : {};

const text = (name: string) => [prompts.points[name]!.prompt, prompts.cameras[prompts.points[name]!.camera ?? cameraOf.get(name)!], prompts.style].map((s) => s.trim()).join(' ');
const names = (named.length ? named : Object.keys(prompts.points)).filter((n) => named.length || again || !existsSync(join(OUT, `${n}.png`)));
for (const n of names) if (!prompts.points[n] || !cameraOf.get(n)) throw new Error(`${n} has no prompt, or is not a point of the round`);

if (dry) {
  for (const n of names) console.log(`\n${n} (${text(n).length} characters)\n${text(n)}`);
  process.exit(0);
}

const keyFile = join(REPO, '.cache/xai-api-key');
const key = (process.env.XAI_API_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '')).trim();
if (!key) {
  console.error('No key: set XAI_API_KEY, or put the key in .cache/xai-api-key.');
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
let failed = 0;
for (const n of names) {
  const prompt = text(n);
  // A request that hangs is given up after three minutes: the pictures made so far each came back within one.
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, prompt, n: 1, aspect_ratio: '16:9', resolution: '1k', quality: QUALITY, response_format: 'b64_json' }),
    signal: AbortSignal.timeout(180_000),
  }).catch((e: Error) => e);
  if (res instanceof Error) {
    failed++;
    console.log(`${n}: ${res.name === 'TimeoutError' ? 'no answer in three minutes' : res.message}`);
    continue;
  }
  if (!res.ok) {
    failed++;
    console.log(`${n}: ${res.status} ${(await res.text()).slice(0, 400)}`);
    if (res.status === 401 || res.status === 403) break;
    continue;
  }
  const body = (await res.json()) as { data?: { b64_json?: string; mime_type?: string }[]; usage?: { cost_in_usd_ticks?: number } };
  const image = body.data?.[0];
  if (!image?.b64_json) {
    failed++;
    console.log(`${n}: no picture came back`);
    continue;
  }
  const takes = (log[n]?.takes ?? 0) + 1;
  const to = join(OUT, `${n}.png`);
  if (existsSync(to)) renameSync(to, join(OUT, `${n}.${takes - 1}.png`));
  const raw = join(OUT, `${n}.raw`);
  writeFileSync(raw, Buffer.from(image.b64_json, 'base64'));
  execFileSync('sips', ['-s', 'format', 'png', raw, '--out', to], { stdio: 'ignore' });
  const usd = body.usage?.cost_in_usd_ticks === undefined ? undefined : body.usage.cost_in_usd_ticks / 1e10;
  log[n] = { model: MODEL, quality: QUALITY, made: new Date().toLocaleDateString('sv'), prompt, mime: image.mime_type ?? '', usd, takes };
  writeFileSync(logFile, `${JSON.stringify(log, null, 1)}\n`);
  console.log(`${n}: made${usd === undefined ? '' : ` ($${usd.toFixed(3)})`}, take ${takes}`);
}
const spent = Object.values(log).reduce((s, m) => s + (m.usd ?? 0), 0);
console.log(`${names.length - failed} of ${names.length} made${failed ? `, ${failed} failed` : ''}. The last takes cost $${spent.toFixed(2)} in all.`);
process.exit(failed ? 1 : 0);
