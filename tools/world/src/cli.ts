// WikiWorldModel world tools: fetch datasets, import them, validate the world, build tile sets.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { putBlob, stageBlobsFromGit } from './blobs.ts';
import type { CompressionEncoding } from './compress.ts';
import { fetchAll } from './fetch.ts';
import { fieldSource, importBlocks, importElevation, importReliefPlates, tiledField } from './importer.ts';
import { loadManifest, resolveDatasetFile } from './manifest.ts';
import { exportSnapshot, type OhmSnapshot } from './ohm.ts';
import { REPO } from './paths.ts';
import { loadWorld } from './world.ts';

async function saveSnapshotBlob(content: string | Uint8Array, filename: string, extra = ''): Promise<void> {
  const { sha256: hash, bytes, path } = await putBlob(content);
  console.log(`stored blob → ${path}`);
  console.log(
    `In world/manifest.yaml point the dataset at:\n  url: blob:${hash}\n  filename: ${filename}\n  sha256: ${hash}\n  bytes: ${bytes}${extra ? `\n${extra}` : ''}\nThen upload with \`tools/world/publish-snapshots.sh\`.`,
  );
}

/** What a thing of a list is, as `world thing` prints it; given a record's id, the things that are it. */
async function thingText(id: string, world: Awaited<ReturnType<typeof loadWorld>>): Promise<number | void> {
  const { worldThings } = await import('./things.ts');
  const { things, identity } = await worldThings(world);
  const ids = world.entity.has(id) ? (identity.rowsOf.get(id) ?? []) : [id];
  if (world.entity.has(id)) console.log(ids.length ? `${id} is ${ids.join(', ')}` : `${id} names no thing of the lists read here`);
  for (const x of ids) {
    const t = things.things.get(x);
    if (!t) {
      console.log(`${x} is in none of the lists read here (${things.lists.map((l) => l.field.id).join(', ') || 'none is fetched'})`);
      return 1;
    }
    console.log(`${t.id}  ${t.label}`);
    for (const row of t.rows) {
      const list = things.lists[row.list];
      console.log(`  ${list.field.id}, ${list.dataset}#${t.key}`);
      list.props.forEach((p, i) => row.values[i] !== null && console.log(`    ${p.padEnd(16)} ${JSON.stringify(row.values[i])}`));
    }
    if (t.parent) console.log(`  hangs from ${t.parent} (${things.things.get(t.parent)?.label ?? '?'})`);
    const kids = [...things.things.values()].filter((c) => c.parent === t.id).length;
    if (kids) console.log(`  ${kids} of the lists' things hang from it`);
    if (Object.keys(t.same_as).length) console.log(`  its row gives ${Object.entries(t.same_as).map(([k, v]) => `${k}:${v}`).join(', ')}`);
    const record = identity.record.get(t.id);
    console.log(record ? `  it is ${record} (${world.entity.get(record)?.file})` : '  no record is it yet: a record that names it in same_as will be');
    const also = identity.also.get(t.id);
    if (also?.length) console.log(`  and is ${also.join(', ')}`);
  }
}

const commands: Record<string, (args: string[]) => Promise<number | void>> = {
  // Every dataset, or only those named (plus `--snapshots` for all `blob:` snapshots):
  // `npm run fetch -- src:paleomap-plate-model --snapshots`.
  async fetch(ids) {
    await fetchAll(console.log, ids);
  },
  async import() {
    await fetchAll();
    const world = await loadWorld();
    for (const f of world.fields.filter(tiledField)) {
      const kind = fieldSource(f);
      await (kind === 'elevation' ? importElevation(f) : kind === 'relief' ? importReliefPlates(f) : importBlocks(f));
    }
  },
  // A fresh extract of the map over the box of an existing OHM dataset in world/manifest.yaml, stored in the local blob store.
  async 'ohm-snapshot'([datasetId = 'src:ohm-rome-2026-11-01']) {
    const manifest = await loadManifest();
    const d = manifest.datasets[datasetId] ?? Object.values(manifest.datasets).find((x) => x.fetch.filename === `${datasetId}.json`);
    if (!d) throw new Error(`no OHM dataset "${datasetId}" in world/manifest.yaml`);
    const old = JSON.parse(readFileSync(resolveDatasetFile(d.id, d), 'utf8')) as OhmSnapshot;
    const date = new Date().toISOString().slice(0, 10);
    const base = (d.fetch.filename ?? `${d.id.replace(/^src:/, '')}.json`).replace(/\.json$/, '');
    const filename = `${base.replace(/\d{4}-\d{2}-\d{2}$/, date)}.json`;
    const snap = await exportSnapshot(old.bbox, date);
    const text = JSON.stringify(snap);
    console.log(`${snap.elements.length} elements (${old.elements.length} before) → ${filename}`);
    await saveSnapshotBlob(text, filename);
  },
  // A fresh extract of a formation from the Paleobiology Database, stored in the local content-addressed blob store.
  async 'pbdb-snapshot'([formation = 'Hell Creek']) {
    const { exportSnapshot: exportPbdb } = await import('./pbdb.ts');
    const date = new Date().toISOString().slice(0, 10);
    const filename = `pbdb-${formation.toLowerCase().replace(/[^a-z]+/g, '-')}-${date}.json`;
    const snap = await exportPbdb(formation, date);
    const text = JSON.stringify(snap);
    console.log(`${snap.occurrences.length} occurrences, ${snap.collections.length} collections, ${snap.taxa.length} taxa → ${filename}`);
    await saveSnapshotBlob(text, filename);
  },
  // The land's fossils from the Paleobiology Database, for the atlas of who lived where, stored in the local blob store.
  async 'pbdb-land'() {
    const { exportLand } = await import('./pbdb.ts');
    const date = new Date().toISOString().slice(0, 10);
    const filename = `pbdb-land-${date}.json`;
    const snap = await exportLand(date, console.log);
    const text = JSON.stringify(snap);
    console.log(`${snap.rows.length} occurrences at ${snap.sites.length} sites, ${snap.taxa.length} taxa → ${filename}`);
    await saveSnapshotBlob(text, filename);
  },
  // The sea's fossils from the Paleobiology Database, zipped and stored in the local blob store.
  async 'pbdb-sea'() {
    const { exportFossils } = await import('./pbdb.ts');
    const { zipSync, strToU8 } = await import('fflate');
    const date = new Date().toISOString().slice(0, 10);
    const name = `pbdb-sea-${date}`;
    const filename = `${name}.zip`;
    // Spans to ask for one at a time, about a period long each, over the same 541 Myr as the land's: where they fall does
    // not matter, as an occurrence the service gives for two of them is kept once.
    const edges = [541, 485, 444, 419, 359, 299, 252, 201, 145, 66, 23, 0];
    const snap = await exportFossils('marine', date, console.log, edges.slice(1).map((min, i) => ({ max: edges[i], min })));
    const json = strToU8(JSON.stringify(snap));
    const member = `${name}.json`;
    // A fixed time on the member, so that the same rows make the same bytes.
    const zip = zipSync({ [member]: [json, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') }] });
    console.log(`${snap.rows.length} occurrences at ${snap.sites.length} sites, ${snap.taxa.length} taxa → ${filename}`);
    await saveSnapshotBlob(zip, filename, `  member ${member}, sha256 ${createHash('sha256').update(json).digest('hex')}`);
  },
  // The rocks the Paleobiology Database's fossils lie in, zipped and stored in the local blob store.
  async 'pbdb-rocks'() {
    const { exportRocks } = await import('./pbdb.ts');
    const { zipSync, strToU8 } = await import('fflate');
    const date = new Date().toISOString().slice(0, 10);
    const name = `pbdb-rocks-${date}`;
    const filename = `${name}.zip`;
    const snap = await exportRocks(date, console.log);
    const json = strToU8(JSON.stringify(snap));
    const member = `${name}.json`;
    // A fixed time on the member, so that the same rows make the same bytes.
    const zip = zipSync({ [member]: [json, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') }] });
    console.log(`${snap.collections.length} collections, ${snap.ages.length} measured ages → ${filename}`);
    await saveSnapshotBlob(zip, filename, `  member ${member}, sha256 ${createHash('sha256').update(json).digest('hex')}`);
  },
  // Macrostrat's columns and their units, zipped and stored in the local blob store.
  async 'macrostrat-snapshot'() {
    const { exportColumns } = await import('./macrostrat.ts');
    const { zipSync, strToU8 } = await import('fflate');
    const date = new Date().toISOString().slice(0, 10);
    const name = `macrostrat-columns-${date}`;
    const filename = `${name}.zip`;
    const snap = await exportColumns(date, console.log);
    const json = strToU8(JSON.stringify(snap));
    const member = `${name}.json`;
    // A fixed time on the member, so that the same rows make the same bytes.
    const zip = zipSync({ [member]: [json, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') }] });
    console.log(`${snap.columns.length} columns, ${snap.units.length} units → ${filename}`);
    await saveSnapshotBlob(zip, filename, `  member ${member}, sha256 ${createHash('sha256').update(json).digest('hex')}`);
  },
  // What the rocks of a stage say near a place, by the latest build: `npm run world -- rocks -4.04 -43.18 123.7 Ma`.
  // The place is as it is today; the time is written as a record writes one.
  /** How likely the sea was at a place of today at a time, as the latest build has it; with no place, how its model held. */
  async coast([lat, lon, ...when]) {
    const { coastIndexOf, coastOfBuild, coastScoresText, coastText } = await import('./coastat.ts');
    const { parsePoint } = await import('../../../core/time.ts');
    const { BUILDS } = await import('./paths.ts');
    const index = join(BUILDS, 'index.json');
    if (!existsSync(index)) throw new Error('no world build: run `npm run build:world` first');
    const build = join(BUILDS, JSON.parse(readFileSync(index, 'utf8')).latest);
    if (lat === undefined) {
      const ix = coastIndexOf(build);
      if (!ix) {
        console.log("The build has no chance of sea: its rock record's snapshot was not fetched.");
        return 1;
      }
      console.log(coastScoresText(ix));
      return;
    }
    if (lon === undefined || !when.length || [lat, lon].some((x) => !Number.isFinite(Number(x)))) throw new Error('usage: world coast [<lat> <lon> <time>], the place as it is today: world coast 39.1 -100.9 85 Ma');
    const found = coastOfBuild(build, Number(lat), Number(lon), parsePoint(when.join(' ') as import('../../../core/time.ts').TimePointInput).t);
    if (!found) {
      console.log('The build has no chance of sea for that place and time: it has none at all, or no plate carries the place there.');
      return 1;
    }
    console.log(coastText(found));
  },
  async rocks([lat, lon, ...when]) {
    if (lat === undefined || lon === undefined || !when.length) throw new Error('usage: world rocks <lat> <lon> <time>, the place as it is today: world rocks -4.04 -43.18 123.7 Ma');
    const { rocksOfBuild, rocksText } = await import('./rocksnear.ts');
    const { parsePoint } = await import('../../../core/time.ts');
    const { BUILDS } = await import('./paths.ts');
    const index = join(BUILDS, 'index.json');
    if (!existsSync(index)) throw new Error('no world build: run `npm run build:world` first');
    const t = parsePoint(when.join(' ') as import('../../../core/time.ts').TimePointInput).t;
    const found = rocksOfBuild(join(BUILDS, JSON.parse(readFileSync(index, 'utf8')).latest), Number(lat), Number(lon), t);
    if (!found) {
      console.log('The build has no rock record for that place and time: no stage holds the time, or no plate carries the place there.');
      return 1;
    }
    console.log(rocksText(found));
  },
  // A fresh extract of NOAA's hazard databases, stored in the local blob store.
  async 'noaa-snapshot'() {
    const { exportHazards } = await import('./noaa.ts');
    const date = new Date().toISOString().slice(0, 10);
    const filename = `noaa-hazards-${date}.json`;
    const snap = await exportHazards(date);
    const text = JSON.stringify(snap);
    console.log(`${snap.rows.length} rows → ${filename}`);
    await saveSnapshotBlob(text, filename);
  },
  // HYDE 3.2.1's population grids, coarsened and stored in the local blob store.
  async 'hyde-snapshot'() {
    const { exportPopulationGrid, SNAPSHOT } = await import('./hyde.ts');
    const text = await exportPopulationGrid();
    console.log(`${text.split('\n').filter((l) => l && !l.startsWith('#')).length - 1} cells → ${SNAPSHOT}`);
    await saveSnapshotBlob(text, SNAPSHOT);
  },
  // SoilGrids 2.0's topsoil, averaged over half degrees and stored in the local blob store.
  async 'soilgrids-snapshot'() {
    const { exportTopsoil, SNAPSHOT } = await import('./soilgrids.ts');
    const text = await exportTopsoil();
    console.log(`${text.split('\n').filter((l) => l && !l.startsWith('#')).length - 1} cells → ${SNAPSHOT}`);
    await saveSnapshotBlob(text, SNAPSHOT);
  },
  // ArchaeoGLOBE's summary tables, joined into one table stored in the local blob store.
  async 'archaeoglobe-snapshot'() {
    const { exportAssessments, SNAPSHOT } = await import('./archaeoglobe.ts');
    const text = await exportAssessments();
    console.log(`${text.split('\n').filter((l) => l && !l.startsWith('#')).length - 1} rows → ${SNAPSHOT}`);
    await saveSnapshotBlob(text, SNAPSHOT);
  },
  // Stage missing snapshot blobs into .cache/blobs/<sha256> from a historical git revision.
  async 'stage-blobs'(args) {
    const i = args.indexOf('--from-git');
    const rev = i >= 0 ? args[i + 1] : args[0] ?? 'HEAD~1';
    const manifest = await loadManifest();
    const r = await stageBlobsFromGit(manifest, rev, { log: console.log });
    console.log(`stage-blobs: ${r.staged} staged, ${r.alreadyPresent} already present, ${r.missing.length} missing`);
    if (r.missing.length) {
      console.error(`missing snapshots: ${r.missing.join(', ')}`);
      return 1;
    }
  },
  // Upload the latest (or --id <buildId>) world build to the content-addressed R2/S3 blob store.
  async 'publish-build'(args) {
    const opt = (flag: string) => {
      const idx = args.indexOf(flag);
      return idx >= 0 ? args[idx + 1] : undefined;
    };
    const bucket = opt('--bucket') ?? process.env.BUILD_BUCKET;
    if (!bucket) throw new Error('missing bucket: pass --bucket <name> or set BUILD_BUCKET');
    const encoding = (opt('--encoding') ?? process.env.BLOB_ENCODING ?? 'br') as CompressionEncoding;
    const { resolveS3Config, S3Client } = await import('./s3.ts');
    const { publishBuild } = await import('./publish.ts');
    const s3 = new S3Client(await resolveS3Config(bucket));
    const r = await publishBuild({
      buildId: opt('--id'),
      s3,
      encoding,
      brotliQuality: opt('--quality') ? Number(opt('--quality')) : process.env.BLOB_BROTLI_QUALITY ? Number(process.env.BLOB_BROTLI_QUALITY) : undefined,
      concurrency: opt('--concurrency') ? Number(opt('--concurrency')) : undefined,
    });
    if (args.includes('--print-json')) console.log(JSON.stringify(r));
  },
  // Upload every `blob:<sha256>` snapshot dataset in world/manifest.yaml to R2/S3 `blobs/<sha256>`.
  async 'publish-snapshots'(args) {
    const opt = (flag: string) => {
      const idx = args.indexOf(flag);
      return idx >= 0 ? args[idx + 1] : undefined;
    };
    const bucket = opt('--bucket') ?? process.env.SNAPSHOT_BUCKET ?? process.env.BUILD_BUCKET;
    if (!bucket) throw new Error('missing bucket: pass --bucket <name> or set SNAPSHOT_BUCKET / BUILD_BUCKET');
    const encoding = (opt('--encoding') ?? process.env.BLOB_ENCODING ?? 'br') as CompressionEncoding;
    const { resolveS3Config, S3Client } = await import('./s3.ts');
    const { publishSnapshots } = await import('./publish.ts');
    const s3 = new S3Client(await resolveS3Config(bucket));
    await publishSnapshots({
      manifest: await loadManifest(),
      s3,
      encoding,
      fromGit: opt('--from-git'),
      concurrency: opt('--concurrency') ? Number(opt('--concurrency')) : undefined,
    });
  },
  // What most wants a city's records (docs/plans/CITIES.md, step 7), by the latest build's cities: `npm run world --
  // cities-wanted [--n 40] [--below 2]`. Each city's tier of what is known of it, and the most people-years first.
  async 'cities-wanted'(args) {
    const { citiesWanted, citiesWantedText } = await import('./citiesWanted.ts');
    const opt = (name: string) => {
      const i = args.indexOf(name);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const index = join(REPO, 'dist/builds/index.json');
    if (!existsSync(index)) throw new Error('no build: run npm run build:world first');
    const dir = join(REPO, 'dist/builds', JSON.parse(readFileSync(index, 'utf8')).latest);
    const f = JSON.parse(readFileSync(join(dir, 'people/cities.json'), 'utf8'));
    // The settlements whose fabric a map of the world gives: the build's sites of cities.
    const ts = JSON.parse(readFileSync(join(dir, 'tileset.json'), 'utf8')) as { sites?: { kind: string; place?: string }[] };
    const mapped = new Set((ts.sites ?? []).filter((s) => s.kind === 'city' && s.place).map((s) => s.place!));
    console.log(citiesWantedText(citiesWanted(f, mapped), Number(opt('--n') ?? 40), Number(opt('--below') ?? 2)));
  },
  // The population model's scores on figures it did not see (docs/plans/MODELS.md, decision 7), on the latest build's
  // cities file: `npm run world -- holdout [<record id> …] [--fit]`. Each record named gets each of its figures predicted
  // with all of its record's held out; `--fit` fits the model's parameters again rather than read the build's.
  async holdout(args) {
    const { fitCitiesModel, peopleScores, scoresText, settlementsOf } = await import('./holdout.ts');
    const index = join(REPO, 'dist/builds/index.json');
    if (!existsSync(index)) throw new Error('no build: run npm run build:world first');
    const dir = join(REPO, 'dist/builds', JSON.parse(readFileSync(index, 'utf8')).latest);
    const f = JSON.parse(readFileSync(join(dir, 'people/cities.json'), 'utf8'));
    const ids = args.filter((a) => !a.startsWith('--'));
    const s = args.includes('--fit') ? fitCitiesModel(f) : peopleScores(f, settlementsOf(f));
    console.log(scoresText(s, ids));
  },
  // What most wants a building tradition: `npm run world -- dwellings-wanted [--n 40] [--region 59] [--lifeway herders]`;
  // `--totals` for each time's people by way of life and how many a tradition houses; `--regions` for the regions' numbers.
  async 'dwellings-wanted'(args) {
    const { dwellingsWanted, wantedText, wantedTotals, WANTED_TIMES } = await import('./dwellingsWanted.ts');
    const { LIFEWAY_WORDS } = await import('../../../core/dwelling.ts');
    const opt = (name: string) => {
      const i = args.indexOf(name);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const lifeway = opt('--lifeway');
    if (lifeway !== undefined && !Object.hasOwn(LIFEWAY_WORDS, lifeway)) throw new Error(`--lifeway is one of ${Object.keys(LIFEWAY_WORDS).join(', ')}`);
    const { rows, regions } = await dwellingsWanted(WANTED_TIMES);
    if (args.includes('--regions')) console.log(regions.map((r) => `${String(r.id).padStart(3)} ${r.label}`).join('\n'));
    else if (args.includes('--totals')) console.log(wantedTotals(rows));
    else console.log(wantedText(rows, Number(opt('--n') ?? 40), { ...(opt('--region') !== undefined ? { region: Number(opt('--region')) } : {}), ...(lifeway ? { lifeway: lifeway as keyof typeof LIFEWAY_WORDS } : {}) }));
  },
  // A sheet of a house, to look at: `npm run world -- dwelling-sheet people/traditions/iban-longhouse`; or of one thing
  // that stood by its houses, `--outbuilding 1` for the first of its list; or of the generator's own house,
  // `generic:foragers`, `generic:herders`, `generic:farm:temperate`; or of any dwelling, as JSON: '{"plan":"round"}'.
  // `--grow 2` draws it twice as wide and long, as where one house stands for several households; `--climate desert`
  // takes what a farmer's house leaves unsaid from the generator's house of that climate, and not of the temperate one.
  async 'dwelling-sheet'(args) {
    const flag = (name: string) => {
      const i = args.indexOf(name);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const rest = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
    const [name, out] = rest;
    if (!name) throw new Error('give a building tradition, generic:<house>, or a dwelling as JSON');
    const world = await loadWorld();
    const { dwellingSheet } = await import('./dwellingsheet.ts');
    const { fillDwelling, homesteadOf, outbuildingSpec } = await import('../../../world/generators/people/dwellings.ts');
    const { compileTraditions, outbuildingText, specText } = await import('../../../core/dwelling.ts');
    type Spec = import('../../../core/dwelling.ts').DwellingSpec;
    const gen = world.generators.find((g) => g.id === 'gen:people/settlement');
    const generic = (gen?.params as { generic?: { foragers: Spec; herders: Spec; town: Spec; city: Spec; farm: Record<string, Spec> } } | undefined)?.generic;
    const outs = (gen?.params as { outbuildings?: import('../../../world/generators/people/dwellings.ts').OutbuildingParams } | undefined)?.outbuildings;
    // `--yard` draws each house with its yard, on a lot of that side in metres (or of its tradition's spacing).
    const yard = args.includes('--yard');
    const lotOf = (t: { settlement: { spacing?: import('../../../core/dwelling.ts').Span } }) => {
      const given = Number(flag('--yard'));
      const spacing = t.settlement.spacing;
      return given > 0 ? given : spacing !== undefined ? (typeof spacing === 'number' ? spacing : (spacing.lo + spacing.hi) / 2) : 18;
    };
    let spec: Spec;
    let label = name;
    let home: import('../../../world/generators/people/dwellings.ts').Homestead | undefined;
    if (name === 'all') {
      // Every tradition's house on pages of twelve, or those whose id has a word in it: `dwelling-sheet all longhouse`.
      const { contactSheet } = await import('./dwellingsheet.ts');
      const { claimGroups, solveScenario } = await import('./chronology.ts');
      const { traditionInputs } = await import('./build/landscape.ts');
      const solved = { world, sol: solveScenario(world), centres: solveScenario(world, {}, true), variants: [], groups: claimGroups(world), model: undefined as never };
      const all = compileTraditions(traditionInputs(solved as never, 'src:archaeoglobe-2019-regions')).filter((t) => !out || t.id.includes(out));
      const items = all.map((t) => {
        const whose = t.lifeways[0];
        const under: Spec = whose === 'foragers' ? generic?.foragers ?? {} : whose === 'herders' ? generic?.herders ?? {} : generic?.farm[flag('--climate') ?? 'temperate'] ?? {};
        const spec = fillDwelling(t.dwelling, under);
        return { spec, label: t.id.split('/').pop()!, variant: Number(flag('--variant') ?? 0), ...(yard ? { home: homesteadOf(t, spec, lotOf(t), outs) } : {}) };
      });
      mkdirSync(join(REPO, 'dist', 'sheets'), { recursive: true });
      for (let p = 0; p * 12 < items.length; p++) {
        const file = join(REPO, 'dist', 'sheets', `traditions-${String(p + 1).padStart(2, '0')}.png`);
        writeFileSync(file, contactSheet(items.slice(p * 12, p * 12 + 12), `BUILDING TRADITIONS ${p * 12 + 1} TO ${Math.min(items.length, p * 12 + 12)} OF ${items.length}`));
        console.log(file);
      }
      return;
    }
    if (name.startsWith('work:')) {
      // One kind of piece of a settlement's works: `work:person`, `work:well`, `work:enclosure:hedge`, `work:pen:fence`.
      const { workSheet } = await import('./dwellingsheet.ts');
      const [, kind, word] = name.split(':');
      const figures = (gen?.params as { figures?: { height: number } } | undefined)?.figures;
      const size = outs?.generic[kind === 'floor' ? 'threshing-floor' : (kind as 'well')] ?? {};
      const num = (x: unknown, or: number) => (typeof x === 'number' ? x : or);
      const w = { kind, height: kind === 'person' ? (figures?.height ?? 1.62) : num(size.height, 0), thickness: num(size.diameter ?? size.width, kind === 'person' ? 0.5 : 3), ...(word ? { word } : {}), ...(kind === 'enclosure' ? { run: 6 } : {}) } as import('../../../world/generators/people/works.ts').WorkSpec;
      const file = out ?? join(REPO, 'dist', 'sheets', `${name.replace(/[^a-z0-9]+/gi, '-')}.png`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, workSheet(w, name));
      console.log(file);
      return;
    }
    if (name.startsWith('{')) {
      spec = JSON.parse(name) as Spec;
      label = 'a dwelling';
    } else if (name.startsWith('generic:')) {
      const [, kind, climate] = name.split(':');
      const found = kind === 'farm' ? generic?.farm[climate ?? 'temperate'] : (generic as Record<string, Spec> | undefined)?.[kind];
      if (!found) throw new Error(`no generic house "${name}"`);
      spec = found;
    } else {
      const { claimGroups, solveScenario } = await import('./chronology.ts');
      const { traditionInputs } = await import('./build/landscape.ts');
      const solved = { world, sol: solveScenario(world), centres: solveScenario(world, {}, true), variants: [], groups: claimGroups(world), model: undefined as never };
      const t = compileTraditions(traditionInputs(solved as never, 'src:archaeoglobe-2019-regions')).find((x) => x.id === name);
      if (!t) throw new Error(`no building tradition "${name}"`);
      // What a tradition leaves unsaid is the generator's house of its people's way of life, as in a scene.
      const whose = t.lifeways[0];
      const under: Spec = whose === 'foragers' ? generic?.foragers ?? {} : whose === 'herders' ? generic?.herders ?? {} : generic?.farm[flag('--climate') ?? 'temperate'] ?? {};
      const nth = flag('--outbuilding');
      if (nth !== undefined) {
        const o = t.outbuildings?.[Number(nth) - 1];
        if (!o) throw new Error(`${name} has ${t.outbuildings?.length ?? 0} outbuildings`);
        spec = outbuildingSpec(o, outs, fillDwelling(t.dwelling, under));
        label = `${name.split('/').pop()}: ${outbuildingText(o)}`;
      } else {
        spec = fillDwelling(t.dwelling, under);
        console.log(`Its own: ${specText(t.dwelling) || 'nothing'}.`);
        const borrowed = Object.fromEntries(Object.entries(spec).filter(([k]) => !(k in t.dwelling)));
        console.log(`The generator's, where it says nothing: ${specText(borrowed) || 'nothing'}.`);
        if (t.outbuildings?.length) console.log(`By its houses: ${t.outbuildings.map(outbuildingText).join('; ')}.`);
        if (yard) home = homesteadOf(t, spec, lotOf(t), outs);
      }
    }
    const file = out ?? join(REPO, 'dist', 'sheets', `${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}.png`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, dwellingSheet(spec, label, Number(flag('--grow') ?? 1), home));
    console.log(file);
  },
  // A sheet of a form, to look at: `npm run world -- form-sheet life/taxa/triceratops`, or `plan:ceratopsian`.
  async 'form-sheet'([name, out]) {
    const world = await loadWorld();
    const { formSheet } = await import('./formsheet.ts');
    const { FormTree, planForm } = await import('./forms.ts');
    const tree = new FormTree(world);
    const isPlan = name?.startsWith('plan:');
    const form = isPlan ? planForm(world, name.slice(5)) : name ? tree.form(name) : undefined;
    if (!form) throw new Error(`no form for "${name}": give a taxon's id, or plan:<name> (${Object.keys(world.plans).join(', ')})`);
    const mid = (s?: { lo: number; hi: number }) => (s ? (s.lo + s.hi) / 2 : undefined);
    const posture = isPlan ? undefined : tree.posture(name);
    const file = out ?? join(REPO, 'dist', 'sheets', `${name.replace(/[^a-z0-9]+/gi, '-')}.png`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, formSheet(form, { label: name, biped: posture === 'biped', ...(isPlan ? {} : { length: mid(tree.size(name, 'body_length')), hip: mid(tree.size(name, 'hip_height')), height: mid(tree.size(name, 'plant_height')) }) }));
    if (!isPlan) {
      const s = tree.source(name)!;
      console.log(`Its body: the plan "${s.plan}" from ${s.node}${s.changes.length ? `, changed by ${s.changes.map((c) => c.node).join(', ')}` : ''}. Nearest node with anything to say: ${s.from}${s.own ? ' (its own)' : ''}.`);
    }
    console.log(file);
  },
  // What most wants a form: the taxa that most often come up in the atlas with none of their own. Give a
  // name to see only what is under it, --missing to see what has no form at any node above it, and --sea to rank
  // the sea's fossils for bodies that live in the sea.
  async 'forms-wanted'(args) {
    const world = await loadWorld();
    const { formsWanted } = await import('./formsWanted.ts');
    let sea: import('./pbdb.ts').LandSnapshot | undefined;
    if (args.includes('--sea')) {
      const { datasetFile } = await import('./manifest.ts');
      const f = world.fields.find((x) => x.data?.as === 'community-sea');
      if (!f) throw new Error('no field reads the sea\'s fossils');
      const id = f.data!.from;
      sea = JSON.parse(readFileSync(datasetFile(id, world.manifest.datasets[id], f.data!.file), 'utf8'));
    }
    console.log(formsWanted(world, args, sea));
  },
  // The first step of checking a claim: its quote found in the text its source was read in. Records the step on
  // each claim whose quote is found: `npm run world -- quote-check src:… <text file> [--by machine:<tool>] [--dry-run]`.
  async 'quote-check'(args) {
    const { runQuoteCheck } = await import('./quotecheck.ts');
    return runQuoteCheck(await loadWorld(), args);
  },
  // Every claim about a subject, a record or a row of a dataset, with where each comes from and which the default
  // picture shows (*): `npm run world -- claims src:noaa-hazards-2026-11-04#eruption:5238`, or an entity's id.
  async claims([ref]) {
    if (!ref) throw new Error('usage: world claims <entity id | src:<dataset>#<row key> | <scheme>:<key>>');
    const world = await loadWorld();
    const { ClaimIndex } = await import('./claimindex.ts');
    const { parseRef } = await import('../../../core/refs.ts');
    const r = parseRef(ref);
    // A thing of a list is known by its scheme's id: what each row of it says, and the record that is it.
    if (r.type === 'external') return thingText(ref, world);
    const index = await ClaimIndex.of(world, r.type === 'row' ? [r.id] : []);
    if (r.type === 'row' && !index.tables.has(r.id)) console.log(`${r.id} is not read as rows here: fetch it, or give its field a rows: section`);
    const cs = index.of(ref);
    if (!cs.length) {
      console.log(`no claims about ${ref}`);
      return 1;
    }
    for (const c of cs) {
      const pick = index.chosen(c.subject, c.prop);
      const shown = pick && pick.origin === c.origin && pick.where === c.where && JSON.stringify(pick.value) === JSON.stringify(c.value) ? '*' : ' ';
      console.log(`${shown} ${c.prop.padEnd(14)} ${JSON.stringify(c.value)}\n    ${c.origin}, ${c.rank}, ${c.status}, ${c.level}; ${c.author}; ${c.where}${c.note ? `\n    ${c.note}` : ''}`);
    }
  },
  // A thing of a list (docs/plans/ENTITIES.md, steps 2 and 4): what each of its rows says, what it hangs from, what hangs
  // from it, and which record and which other things it is. Given a record's id, the things that are it.
  async thing([id]) {
    if (!id) throw new Error('usage: world thing <scheme>:<key> | <entity id>');
    return thingText(id, await loadWorld());
  },
  // Things of lists that a record may be, by name alone: proposals to confirm or refuse, never joins. A thing becomes a
  // record's when the record names it in same_as, or an overlay ties its row to it (docs/plans/ENTITIES.md, step 4).
  async 'matches-wanted'(args) {
    const limit = Number(args[args.indexOf('--limit') + 1]) || 40;
    const world = await loadWorld();
    const { worldThings } = await import('./things.ts');
    const { wordsOf } = await import('../../../core/things.ts');
    const { things, identity } = await worldThings(world);
    const fold = (s: string) => wordsOf(s).join(' ');
    // Records by their names, of the kinds the lists are of, that name no thing of that kind's list yet.
    const byName = new Map<string, { id: string; kind: string; at?: { lat: number; lon: number } }[]>();
    const kinds = new Set(things.lists.map((l) => l.spec.kind));
    for (const e of world.entities) {
      if (e.imported || ![...kinds].some((k) => e.kind === k || e.kind.startsWith(`${k}/`))) continue;
      if ((identity.rowsOf.get(e.id) ?? []).length) continue;
      const at = e.claims.find((c) => c.prop === 'location')?.value as { lat: number; lon: number } | undefined;
      for (const c of e.claims) {
        if (c.prop !== 'name' || !c.value || typeof c.value !== 'object') continue;
        for (const n of Object.values(c.value as Record<string, string>)) {
          const key = fold(n);
          if (!key) continue;
          const list = byName.get(key) ?? [];
          if (!list.some((x) => x.id === e.id)) list.push({ id: e.id, kind: e.kind, at });
          byName.set(key, list);
        }
      }
    }
    const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
      const r = Math.PI / 180;
      const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(x));
    };
    let shown = 0;
    for (const t of things.things.values()) {
      if (identity.record.has(t.id)) continue;
      const kind = things.lists[t.rows[0].list].spec.kind;
      for (const r of byName.get(fold(t.label)) ?? []) {
        if (r.kind !== kind && !r.kind.startsWith(`${kind}/`)) continue;
        const li = things.lists[t.rows[0].list];
        const i = li.props.indexOf('location');
        const at = i >= 0 ? (t.rows[0].values[i] as { lat: number; lon: number } | null) : null;
        // A place far from the record's is another place of the same name.
        const d = at && r.at ? km(at, r.at) : undefined;
        if (d !== undefined && d > 50) continue;
        console.log(`${r.id}  may be  ${t.id} (${t.label})${d !== undefined ? `, ${d.toFixed(1)} km from it` : ''}: if so, give it same_as: { ${t.scheme}: "${t.key}" }`);
        if (++shown >= limit) return;
      }
    }
    if (!shown) console.log('no record may be a thing of the lists by its name');
  },
  // What a record came from, what came of it, and which records are one thing with it, in the default picture or
  // with the alternatives named: `npm run world -- lineage people/polities/rome [--alt alt:…]…`.
  async lineage(args) {
    const id = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--alt');
    if (!id) throw new Error('usage: world lineage <entity id> [--alt alt:<group>/<member>]…');
    const alts = args.flatMap((a, i) => (a === '--alt' && args[i + 1] ? [args[i + 1]] : []));
    const world = await loadWorld();
    for (const a of alts) if (world.alternative.get(a)?.type !== 'alternative') throw new Error(`${a} is not an alternative of the world`);
    const { lineageText } = await import('./lineage.ts');
    console.log(lineageText(world, id, alts.length ? { alts } : {}));
  },
  // What the latest build's tiles say of the climate at a place and a time, as a scene is given it: its months, and what
  // else the climate's source says of its node. The place is where it stood then, as a link to the viewer gives it; the
  // month is 1–12, or all twelve: `npm run world -- months 14.105 43.335 "1887 CE" 7`.
  async months([lat, lon, time, month]) {
    if (lat === undefined || lon === undefined || !time || [lat, lon].some((x) => !Number.isFinite(Number(x))) || (month !== undefined && !(Number(month) >= 1 && Number(month) <= 12))) {
      throw new Error('usage: world months <lat> <lon> <time> [month, 1–12]');
    }
    const index = join(REPO, 'dist/builds/index.json');
    if (!existsSync(index)) throw new Error('no world build: run `npm run build:world` first');
    const { monthsAt, monthsText } = await import('./monthsat.ts');
    const { parsePoint } = await import('../../../core/time.ts');
    const t = parsePoint(time).t;
    console.log(monthsText(Number(lat), Number(lon), t, monthsAt(join(REPO, 'dist/builds', JSON.parse(readFileSync(index, 'utf8')).latest), Number(lat), Number(lon), t), month === undefined ? undefined : Number(month)));
  },
  // What the latest build's files say of the ground at a place and a time, as a scene is given it: the elevation read,
  // and the shape of the ground within its cells, the survey's own or today's carried back. The place is where it stood
  // then, as a link to the viewer gives it: `npm run world -- relief 33.97 70.6 "475 CE"`.
  async relief([lat, lon, ...when]) {
    const time = when.join(' ');
    if (lat === undefined || lon === undefined || !time || [lat, lon].some((x) => !Number.isFinite(Number(x)))) throw new Error('usage: world relief <lat> <lon> <time>');
    const index = join(REPO, 'dist/builds/index.json');
    if (!existsSync(index)) throw new Error('no world build: run `npm run build:world` first');
    const { reliefAt, reliefText } = await import('./reliefat.ts');
    const { parsePoint } = await import('../../../core/time.ts');
    const t = parsePoint(time).t;
    console.log(reliefText(Number(lat), Number(lon), t, reliefAt(join(REPO, 'dist/builds', JSON.parse(readFileSync(index, 'utf8')).latest), Number(lat), Number(lon), t)));
  },
  async validate(args) {
    const { runValidate } = await import('./validate/index.ts');
    return runValidate(args);
  },
  async build(args) {
    const { runBuild } = await import('./build/index.ts');
    return runBuild(args);
  },
  // ATTRIBUTION.md at the top of the repository, from the manifest and the sources the records cite.
  async attribution([out = 'ATTRIBUTION.md']) {
    const { attributionMarkdown } = await import('./attribution.ts');
    writeFileSync(join(REPO, out), attributionMarkdown(await loadWorld()));
    console.log(`attribution → ${out}`);
  },
  // The public site for Cloudflare Pages, from site/, the built viewer and the latest build. With
  // BUILD_STORE set to the URL of the builds' object storage, the index points there and the build
  // stays out of the site.
  async site([out = 'dist/public']) {
    const { assembleSite } = await import('./site.ts');
    const store = process.env.BUILD_STORE || undefined;
    const r = assembleSite({ landing: join(REPO, 'site'), viewer: join(REPO, 'dist/site'), builds: join(REPO, 'dist/builds'), out: join(REPO, out), store });
    console.log(`site: build ${r.build}, ${r.files} files, ${(r.bytes / 1e6).toFixed(1)} MB → ${out}`);
  },
};

const [name, ...args] = process.argv.slice(2);
const command = name ? commands[name] : undefined;
if (!command) {
  console.error(`usage: world <${Object.keys(commands).join('|')}> [args]`);
  process.exit(2);
}
command(args).then(
  (code) => process.exit(typeof code === 'number' ? code : 0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
