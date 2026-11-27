# Contributing to WikiWorldModel

WikiWorldModel is an audacious project to recreate the entire history of Earth, life, and
civilization *in silico*, from the Solar System's first solids to the far future, with a viewer to
fly through it.

## How it works

Every view is a stack of five layers, each a different kind of knowledge. Follow a tyrannosaur in
the Hell Creek at 66.5 Ma down through them: a generator chose where it stands, a plate model
carried its ground to where it lay then, fossils from the Hell Creek Formation say it lived there,
and the Paleobiology Database is where they were read. Where evidence is thin, the layers above
fill in the gaps with our best informed guesses and say so.

- **The view.** What you see in the viewer: the layers below, drawn. Click anything to see what it
  rests on (*a tyrannosaur by the river, 66.5 Ma*).
- **Generators.** Detail finer than anything known—where each tree, animal, house, or visual detail
  stands. Seeded so a place always looks the same, and marked as generated (*`gen:life/scene` chose
  where it stands*).
- **Models.** Fill the space between the evidence: the plates, the climate, who lived where. Each
  says what it reads and where its numbers come from (*PALEOMAP carries its ground to where it lay
  then*).
- **Evidence.** Claims, each with its source, where in it, and a quote copied from it. Where
  sources disagree, both stay (*its fossils in the formation; its size, Sue's*).
- **Sources.** Papers, excavation reports, ancient texts, and open datasets pinned to the version
  read (*the Paleobiology Database, read 4 November 2026*).

This is the guide for everyone who contributes, people and AI agents alike. Agents start at
[AGENTS.md](AGENTS.md), which adds what applies to them only. The design is in
[docs/WORLD-MODEL.md](docs/WORLD-MODEL.md), [docs/README.md](docs/README.md) is a map of the rest,
and how to research a fact and write it as a record is in [docs/RECORDS.md](docs/RECORDS.md).

## Ways to contribute

- **Check a claim.** Every claim here was drafted by a machine and is still `proposed`. Reading one
  against its source and saying what you found is the most useful thing anyone can do: see
  [Reviewing](#reviewing).
- **Report a problem.** A wrong date, a misplaced city, a view that breaks: open an issue with the
  *Report a problem* form.
- **Add to the world.** Research a fact and write it as a record with its source
  ([docs/RECORDS.md](docs/RECORDS.md)), bring in an open dataset, or give a taxon a body
  ([docs/FORMS.md](docs/FORMS.md)).
- **Write code**: the build, the validators, the models, the generators and the viewer
  ([Code](#code)).
- **Fix the map upstream.** Outlines of buildings, walls and roads belong in OpenHistoricalMap, and
  corrections to a dataset go to the dataset ([Geometry](docs/RECORDS.md#geometry)).

Questions and proposals go to GitHub Discussions. Everyone taking part follows the
[code of conduct](CODE_OF_CONDUCT.md). Report a security problem privately, as
[SECURITY.md](SECURITY.md) says, not in an issue.

## The rules

These are not style preferences. A pull request that breaks one is closed.

1. **Never fabricate a source, citation, locator, quote or external identifier.** Cite only works
   you have actually retrieved and read, and copy quotes character for character from the text you
   retrieved. Never attribute a guessed or reconstructed value to a source that does not state it.
   Where evidence is missing, filling in a best guess is welcome—just label it honestly (as
   `unsourced:`, `reconstruction`, or `procedural`) rather than citing a source for it.
2. **Machine work is labelled and proposed.** Every claim a machine writes has
   `author: machine:<tool>` (for example `machine:claude-code`), on the claim or for the whole
   file. Its status is then `proposed` by default. Never set `status: accepted`: only a person
   who has checked a claim may accept it, and the validator refuses a machine claim marked
   accepted.
3. **Keep provenance clear.** Sourced claims name a work (`ref: src:…`), where in it (`loc:`: page,
   section, table row, record id), and a short `quote:` that shows the claim. Best-guess
   reconstructions, editorial labels, placements and generated details are welcome where sources
   are silent—mark them with `unsourced: <why>` (on a claim) or the appropriate `basis`
   (`reconstruction` or `procedural`) rather than omitting them.
4. **Disagreement is data.** If sources disagree, write competing claims on the same property,
   each with its source, and mark one `rank: preferred` with a note saying why. Never overwrite
   or delete another claim because you think it is wrong: add yours and say so. If a whole
   picture is at stake (a hypothesis, a reading, a perspective), it is an alternative
   (section 4.4 of the design).
5. **Derived values are never stored.** Dates that follow from other dates, coastlines,
   paleo-positions, inverse relations and coverage are computed by the build. Write the
   evidence ("after X", "within the Artinskian", "caused by Y"), not the result.
6. **Licenses are checked before data or assets come in.** Datasets and visual assets (scanned
   materials, textures, 3D models) the build or viewer ships must be CC0, CC BY or public domain
   (`publish.licenses` in [world/manifest.yaml](world/manifest.yaml)) and credited in
   [ATTRIBUTION.md](ATTRIBUTION.md). Share-alike (CC BY-SA, ODbL) and non-commercial (CC BY-NC)
   material may not be imported. Quotes stay short (the schema caps them at 400 characters); never
   copy a text wholesale.
7. **Ids are stable and mean nothing.** Never rename an id or reuse one. No tool reads meaning
   into an id, and neither should you; moving a file never changes its id.

## Setting up

```sh
npm install
python3 -m venv .venv && .venv/bin/pip install -r tools/world/importers/requirements.txt
npm run fetch          # the pinned datasets and snapshots → .cache/datasets & .cache/blobs (about 4 GB)
npm run validate       # schema, references, vocabularies, review, chronology, plate frames
npm test               # unit tests (need only the plate model and snapshots)
npm run build:world    # incremental DAG build → .cache/build + dist/builds/<id>/ (--no-cache forces full rebuild)
npm run test:build     # checks on that build
npm run build:viewer && npx playwright test --project=globe   # browser tests (also: city, city-views)
npm run dev            # the viewer, at http://localhost:5173/
```

Node 22.19+ or 24+, Python 3.12+. The build runs as content-addressed DAG stages streaming directly
to `.cache/build/blobs/<sha256>` and hard-linked into `dist/builds/<id>/`, so unchanged stages hit
cache across edits. The build makes the rivers of the glacial cycles in worker threads, one fewer
than the machine's cores, at most eight, and one for each 8 GB of memory; `WIKIWORLDMODEL_WORKERS`
sets how many, and under two the build's own thread makes them.

**Sandboxes with limited network access.** Datasets come from several hosts: GitHub, Zenodo,
Figshare, PANGAEA, CEDA, publishers' sites, NOAA, OpenTopography, INGV, and the project's blob store
(`builds.wikiworldmodel.org`). If some are blocked where you run:

- `npm run validate` and `npm test` need only the plate model (on GitHub) and the pinned raw
  snapshots (in the blob store): `npm run fetch -- src:paleomap-plate-model --snapshots`. Records
  can be written and checked with no other dataset, and these are the checks CI runs on every pull
  request.
- `npm run build:world` needs them all. Say in your pull request that you could not build, and
  CI will.
- Never work around a blocked download with a file from somewhere else: datasets are pinned by
  sha256, and a different file is a different dataset. When refreshing a snapshot, stage it in
  `.cache/blobs/<sha256>` (the `*-snapshot` CLI commands do this automatically) and upload it with
  `tools/world/publish-snapshots.sh`.

## The loop

1. **Pick a task** (see [Finding work](#finding-work)). Say what you're doing in its issue, if it
   has one, so two people or agents don't do the same thing.
2. **Research it.** Find the best sources you can actually read (see
   [Research](docs/RECORDS.md#research)). Note each fact with its source, locator and verbatim quote as you go.
3. **Write the records** in [world/](world/): one entity per file, in the directory for its kind
   ([world/schema/layout.yaml](world/schema/layout.yaml)), claims and relations in their subject's
   file, sources one per work. A thing a dataset already lists is named by its id there, in
   `same_as`, so that one thing is never written twice ([Where a record goes](docs/RECORDS.md#where-a-record-goes)).
4. **Check quotes against the texts** you retrieved, by script, not by eye: save the text you read
   and run `npm run world -- quote-check src:… <text file>`. Every `quote` must be found in it
   (after normalizing whitespace and typography); the command lists any that are not, and records
   the `quoted` step on each claim whose quotes it all finds (see [Checking](docs/RECORDS.md#how-far-a-claim-has-been-checked)).
   A claim that quotes several sources needs all their texts in one run: `quote-check src:a a.txt src:b b.txt`.
   Say what you checked in the source's `verified:` note too.
5. **Validate.** `npm run validate -- --verbose`. Fix every error and warning; read the notes
   (wanted records, and competing claims that contradict the rest of the world).
6. **Build and look**, if you can: `npm run build:world`, then open the place and time in the
   viewer, and check that what you added appears where and when it should.
7. **Open a pull request** ([Pull requests](#pull-requests)).

## Finding work

- **The coverage page** (`npm run dev`, then http://localhost:5173/coverage.html): every layer of the
  world along the whole span of time, coloured by what answers it (evidence, a model, a generic
  stand-in, or nothing), with what answers each layer when and how finely. A stretch that is
  generic or unknown where you know a source is work; so is a layer whose finest grid is coarser
  than the evidence allows.
- **[docs/RECORD-SETS.md](docs/RECORD-SETS.md)**: the twenty record sets, what is left of them, and
  the doubts their first drafts left behind: a person or an agent with a source can settle one.
- **[docs/DATA-OUTLINE.md](docs/DATA-OUTLINE.md)**: everything a complete history needs, by
  domain, with candidate datasets, their licenses, and what is already here. Start from a row
  marked *missing* in an area you can research well.
- **Forms**: `npm run world -- forms-wanted` lists the taxa that most need a body of their own, and
  [docs/FORMS.md](docs/FORMS.md) is the brief. Any taxon with none is drawn as the nearest node of the tree that has one,
  so a coarse form on a family is worth a lot, and a form for each species is the long-run aim.
- **Building traditions**: `npm run world -- dwellings-wanted` lists the regions and times where the most people are drawn
  with generic houses, and [docs/DWELLINGS.md](docs/DWELLINGS.md) is the brief for a tradition's record.
- **Matches wanted**: `npm run world -- matches-wanted` lists records that may be things of the lists
  the world reads, by name, kind and place: check each, and where it is right, name the thing's id in
  the record's `same_as` ([A list of things](docs/RECORDS.md#a-row-of-a-dataset)).
- **Wanted records**: references to records nobody has written, listed by
  `npm run validate -- --verbose` and in each build's `coverage.json`.
- **Unsourced claims**: listed in `coverage.json`, and counted by `npm run validate`. Find a source, or
  confirm there is none.
- **Each slice's "Next" section** in [docs/slices/](docs/slices/).
- **Issues** labelled `good first issue` or `agents welcome`.

Good tasks are bounded and checkable: "the 12 Phanerozoic large igneous provinces
with dated main phases", "the reigns of the Julio-Claudian emperors from Suetonius", "Pleiades
ids for the Rome monuments that lack them". Poor tasks are open-ended ("add history of China")
or rest on sources you cannot read.

## Reviewing

A claim's `status` says whether a person has accepted it, and its `checked:` steps say what has
been done to it short of that ([how far a claim has been
checked](docs/RECORDS.md#how-far-a-claim-has-been-checked)). Review is a person's work, and no
claim has had any yet. [docs/RECORD-SETS.md](docs/RECORD-SETS.md) says what each set of records
should be checked for first.

To review a claim:

1. **Find it.** Click the thing in the viewer and read its claims, or run
   `npm run world -- claims <id>`.
2. **Read its source** at the locator it gives. Is the quote there, word for word? Does the source
   say what the claim says, with the same number and the same uncertainty? Is it the best source
   that could be cited?
3. **Say what you found**, in an issue or a pull request: the claim, what you read and where, and
   whether it holds. A pull request may add an `audited` step to a claim you checked, `by:` your
   GitHub account and saying how; or, where the claim does not hold, a competing claim with the
   better source (never an overwrite: rule 4).

Accepting a machine's claim needs review records, which are not built yet
([docs/plans/PUBLIC-PROJECT.md](docs/plans/PUBLIC-PROJECT.md), Phase 1); until then the validator
refuses `status: accepted` on one.

## Larger work: slices

A slice is a thin piece of the world taken through every layer, from sources and records
through validation and the build to the viewer, with criteria that say when it works. Each of
those built so far has a document in [docs/slices/](docs/slices/): what it adds, its pass criteria and
where each is tested, its decisions, its limitations and what comes next.

Propose a slice in an issue before starting one, with its pass criteria. Build it on a branch,
write its document in the same form, and make every criterion a test.

## Code

- TypeScript, strict; `npm run typecheck` must pass. Match the code around you: its comments,
  its names, its idioms.
- **Records for specific claims; code for models, rules and craft.** Specific, sourceable claims
  about particular entities, dates, places or datasets belong in records and datasets so they can
  be cited, contested and inspected. General domain knowledge—physics, ecology, anatomy,
  behaviour, architectural proportions, material properties, animation and best-guess procedural
  defaults—belongs in code, shaders or shared assets whenever that is the most natural way to
  express it, with generated details labelled accordingly for inspection and evidence mode.
- **Generators are seeded, not exact.** A generator is seeded by stable slot ids and may use any
  arithmetic: `Math.*`, libraries, WebAssembly, the GPU. What it makes is compared by its
  fingerprint ([core/fingerprint.ts](core/fingerprint.ts)): which things there are, exactly, and
  where and how big, within a tolerance. An individual's identity comes from its slot and seed,
  never from a computed position, so a link, a click and a promotion keep working when two machines
  differ in the last bits of a float. A change to a generator's output beyond the tolerance is a
  new version, not an edit. In the viewer, generators run in a worker, off the page.
- **Tests.** Unit tests with `npm test`; they run on every pull request, so keep them fast and
  free of builds. Tests of a build go in the `build` group (`vitest.config.ts`). Browser tests
  in three groups, run nightly: `globe`, `city` (drawn with `quality=fast`) and `city-views`
  (full quality). Golden images change only with a change
  that should change them: regenerate them with `--update-snapshots`, look at every diff, and
  say in the pull request why each changed.
- **Every layer answers everywhere.** Asked at any place and time, a layer says what it has and which
  tier answered: evidence, model, generic or unknown ([core/resolve.ts](core/resolve.ts)). A new layer
  adds its case there; `coverage.json` counts the tiers and the build's tests ask every layer across
  the whole span. Unknown is a fine answer; drawn, it is the generic prior, plainly, never a hole.
- Builds are reproducible in meaning: two builds of the same commit have the same files, records,
  ids and words, and the same numbers within a tolerance (`npm run test:reproducible`). Keep it so.

## Pull requests

Title: what the change does, in the imperative ("Add the end-Permian extinction's dates"). GitHub
fills in the description from [the template](.github/PULL_REQUEST_TEMPLATE.md): what changed and
why, each source and how it was read, the checks run, and open questions. Note at the end which
agent made the change, and who ran it if a person did.

If the change affects what the viewer draws, include screenshots of representative affected
views in the pull request description. Label each pair **Before** (base branch) and **After**
(your change). Use the same place, time, camera angle, zoom and viewer settings for both shots,
and say what reviewers should look for. If you could not capture a shot, say why.

An AI reads the pull request first and leaves one comment, with a few more on particular lines:
the rules kept or broken, whether each quote shows its claim, what it could re-read of the sources,
and what it could not check. It reviews for what [.github/review/REVIEWER.md](.github/review/REVIEWER.md)
says, which is worth reading before you open one. It runs on every push from those with write
access; anyone else's pull request is reviewed when a maintainer adds the label `ai-review`. Its
review is advisory: answer what it finds, or say in the pull request why it is wrong.

A maintainer reviews every pull request before it merges. Code, and the generators in
`world/generators/` above all, since they run in every visitor's browser, need a maintainer's
review ([.github/CODEOWNERS](.github/CODEOWNERS)).

## Licenses

A contribution is made under the license of what it changes:

- **Code** (`core/`, `tools/`, `viewer/`, the generators' code in `world/generators/`, `site/`):
  [Apache-2.0](LICENSE).
- **Records, vocabularies, schemas and documentation:** [CC0 1.0](LICENSE-DATA), the same as
  Wikidata and OpenHistoricalMap, so facts can move between them freely.

Quotes inside records stay under their works' terms: they are short quotations used as evidence.
Datasets keep their own licenses, and only CC0, CC BY and public-domain data may come in (rule 6).
What the build reads, and whom it credits, is in [ATTRIBUTION.md](ATTRIBUTION.md).
