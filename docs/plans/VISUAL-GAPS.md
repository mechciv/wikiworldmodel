# Visual gaps: what a place should look like, beside what the viewer draws

Status: proposal, November 2026. A first round of twelve points has been run by hand
([section 7](#7-what-the-first-round-found)); none of the tooling is built. It designs a page that takes a sample of places
and times, says from the evidence what each should look like, and sets that beside the viewer's own
picture of it, so that what the layers, models and generators leave out can be seen and counted. It goes
with the coverage page ([core/coverage.ts](../../core/coverage.ts)) and the look book
([tools/look/](../../tools/look/look.ts)).

## 1. Why

The coverage page says which tier answers each layer, everywhere and always. It cannot say whether the
answer looks right. A view in which every layer answers `model` may still show a river with no reeds, a
steppe with no herds, or a town of the wrong houses, and a view that answers `generic` may be close
enough. The look book judges the renderer on a dozen views chosen by hand, all of them places the world
already does well.

What is missing is a measure taken where nobody chose to look: a sample of the whole world, each point
held to what the best evidence says was there.

## 2. What the page shows

One card for each sampled point:

- **The view:** a place, a time, a camera and an hour, as a link into the viewer.
- **Expected:** a picture made from a researched brief of the scene (section 3.2 and 3.3).
- **Drawn:** the viewer's still of the same link, with the tier that answered each layer there.
- **The list:** each thing the brief expects, with its source, marked *drawn*, *drawn wrong*, *missing* or
  *not known*, and what owes it: a layer, and the field, model or generator that would draw it.

Above the cards, the gaps are counted by what owes them. That table is the point of the page: a ranked
list of what most often stands between the evidence and the picture.

## 3. The loop

### 3.1 Sample

A round is N points, drawn by a seeded sampler and written to a file of links, like the look book's
[views.yaml](../../tools/look/views.yaml). The same seed and build give the same round.

- **Time** is drawn evenly along the time control's own scale (`timeAt` in
  [core/timescale.ts](../../core/timescale.ts)), in N strata with one point in each. So an era gets the
  share of the sample that it gets of the strip, and the cards can be laid along the strip as the coverage
  chart is. The first rounds stop at today: the future has models and no evidence to hold them to.
- **Place** is drawn by weight, where a visitor is most likely to look at that time. The weight is read
  from the build, never written in the sampler:
  - people: the HYDE population of the cell, by its square root, so that the largest cities do not take
    every point;
  - records: the entities placed there and alive then, by the prominence the feature tiles give them;
  - fossils: the PBDB collections of the stage, from the atlas;
  - a floor: every cell of land has some weight, and the sea a tenth of the sample, so that anywhere may
    come up.
  Before anything has a place, the draw is even over the globe. How the four are mixed is a choice, stated
  in the sampler's settings and shown on the page.
- **Camera:** most points at eye level, where a scene's gaps show; some from a few hundred metres up; a
  few from orbit, which test land and sea, ice, climate and states. Daylight, and a month drawn evenly.
- **Two sets.** A fixed panel, drawn once and kept, measures progress from round to round. A fresh draw
  each round keeps the work from being tuned to the panel.

### 3.2 Research: the brief

An agent researches each point and writes a **scene brief**: what a person standing there then would
have seen, as a list of things, each with a source, a locator and a verbatim quote. A brief keeps the
rules of a record ([RECORDS.md](../RECORDS.md)): only works actually read, quotes checked by
`quote-check`, `author: machine:<tool>`.

```yaml
# tools/gaps/rounds/1/p07.yaml: the shape of one
view: t=…&lat=…&lon=…&d=…&h=…&v=…&hour=…&mo=…
author: machine:claude-code
expects:
  - id: cover-reedbeds
    layer: cover                 # relief, water, substrate, cover, life, people, weather
    what: Reedbeds along both banks, taller than a person.
    reach: place                 # place: said of this place and time; region: of its region or period
    source: { ref: src:…, loc: "…", quote: "…" }
  - id: people-houses
    layer: people
    what: …
    reach: region
    source: { ref: src:…, loc: "…", quote: "…" }
unknown:
  - What grew on the valley floor: no pollen record within 300 km.
```

- **The world first.** Research starts from what the build already holds for the point: its records,
  the rows of its datasets, what `resolve` answers. An item that rests on those tests the generators and
  the renderer. Then outside sources, which test what the world holds.
- **`reach` says how far the evidence carries.** Most of a scene is known for its region and period, not
  for the spot. The brief says which, and the page shows it.
- **`unknown` is a finding.** Where nothing can be read, the right picture is the generic one, plainly
  marked, and the card checks only that it is.
- **A brief is not a record.** It lives with the round, not in `world/`. An item that would make a good
  claim is a lead: the pull request that writes the record cites the source itself.

### 3.3 The expected picture

The brief is the yardstick. The picture illustrates it, so that a reader can take in the gap at a glance
before reading the list.

- **Made by an image model, from the brief.** The prompt is built from the brief's items, the camera, the
  hour and the month, and says what must not appear (grass, before there was grass). A scene built by
  hand in three.js for each point was considered: it is a second renderer, with gaps of its own to be
  told apart from the viewer's, and it is weakest in the same places, where no mesh exists yet.
- **Checked against the brief.** An image model fills whatever the prompt leaves open with what it has
  seen most, and may contradict the brief. A second pass lists each item as shown, absent or
  contradicted; a picture that contradicts an item is made again, and what it adds beyond the brief is
  noted on the card. The verdicts in 3.5 are made against the list, never against the picture.
- **Labelled, and kept out of the world.** Each is captioned as an illustration made by a model, with the
  model, the prompt and, where the model takes one, the seed. None is evidence, none enters `world/`, the build or the viewer. This
  keeps the decision in [RENDERING.md](RENDERING.md): the viewer's picture gets better through its
  renderer and its meshes, and no model paints its frames.
- **Pictures that exist.** Where a museum's reconstruction, a painting of the time or a photograph shows
  the place, the brief links it. It is not copied in: few are under licences the project takes.

### 3.4 Shoot the viewer

`tools/look/look.ts shoot` already draws a file of links at full quality and waits until the viewer has
what each needs. A round is shot with it, as stills (`still=1`). Beside each picture it saves what the
viewer says of the scene (`window.__wikiworldmodel.scene()`: the taxa drawn and their tiers, the water,
the people) and the tier `resolve` gives each layer at the point.

### 3.5 Compare

For each item of the brief, a verdict and an owner:

| Verdict | Means | The work it points to |
|---|---|---|
| drawn | the viewer shows it | none |
| drawn wrong | it is there, and not as the source says | the generator or the model that made it |
| missing, held | the world holds the evidence and the scene does not draw it | a generator, a form, a tradition, the renderer |
| missing, not held | the evidence exists and the world does not hold it | a record or a dataset: a wanted row |
| no layer | nothing in the world could say it yet | a new layer or field |
| not tested | the item is of the region or of another moment, and one frame cannot show whether the viewer has it | none: the brief asked for too little of the frame |

An agent gives the verdicts, looking at both pictures and at what the viewer said of the scene, as
`machine:<tool>`, and a person may overrule any of them. They are judgements, and the page says so. The
count that matters is not a score for a card but the roll-up: gaps by owner, across the round.

### 3.6 The page

`viewer/gaps.html`, beside `coverage.html`: the roll-up, then the cards along the time strip's scale,
filtered by layer, owner and verdict. Each card links to the view in the viewer and to its brief. The
roll-up's rows are tasks, of the bounded kind [finding work](../../CONTRIBUTING.md#finding-work) asks
for, and belong in the catalog ([CATALOG.md](CATALOG.md)) once it is built.

## 4. Where it lives

- `tools/gaps/`: the sampler, the brief's schema, the prompt builder, the comparison, and the script that
  runs a round.
- `tools/gaps/rounds/<n>/`: the round's links, briefs and verdicts, in git. The texts read are kept
  out of git, in `.cache/source-texts/`, as the world's are.
- The pictures, expected and drawn, are large and made again from the round: they go to `dist/gaps/<n>/`
  and are published with the site, not committed.

## 5. A first round by hand

Before any tooling: twelve points, drawn with a throwaway script, each taken through the whole loop by
hand. It answers what the design cannot:

- whether the pairs are telling, or whether every card says the same three things;
- how long a brief takes, and how much of one is `region` and `unknown`;
- how often the image model contradicts its brief, and whether the check catches it;
- whether the weights put the points where a visitor would look.

## 6. Open questions

- **What importance is.** The mix of people, records, fossils and floor is a guess at where visitors
  look. Once the public site has visits, they are the better weight.
- **The same framing.** An image model given only a prompt frames the scene as it likes. Giving it the
  viewer's depth as a guide would match the two pictures, and would hand the expected picture the
  viewer's own relief, which is right where relief is evidence and wrong where it is generic.
- **How many.** A round of a hundred points is a hundred researched briefs. Twenty-four may be enough
  to rank the owners, and the first round will say.
- **Who checks the verdicts.** They are machine judgements about pictures. A sample of them audited by a
  person, as claims are, would say how far the roll-up can be trusted.

## 7. What the first round found

The round is in [tools/gaps/rounds/1/](../../tools/gaps/rounds/1/): the sampler, the twelve views, the briefs, what
the viewer said of each view, and the verdicts with their findings. `npx tsx tools/gaps/rounds/1/page.ts` lays it
out as a page, `dist/gaps/1/index.html`. It ran on build 46369419beeb44e6 with the seed `gaps-round-1`. The
verdicts were given against the briefs' lists, before any expected picture was made. The pictures came after, from
xAI's `grok-imagine-image-2.0` (`prompts.yaml`, `picture.ts`), and were checked against the briefs
(`picture-checks.yaml`).

**The count.** 167 items in twelve briefs: 41 drawn, 17 drawn wrong, 26 missing though held, 11 missing and not
held, 36 with no layer, and 36 that one frame could not test.

**What owes the gaps**, most first:

| Owner | Gaps | What |
|---|---|---|
| `gen:life/scene` | 20 | Twelve are animals the atlas lists and the scene places, with none in sight in any eye-level view. The rest: plants in even scatter where the rocks say patches, no belts by height, and animals and plants of water listed where the scene has no water. |
| substrate (no layer) | 16 | What the ground is made of: red soil with lime nodules, quartz sand, gravel plains, gypsum, sandstone and boulders. Every eye-level and aerial card has such items and none could be drawn. |
| `model:life/atlas` | 8 | One list for the whole Holocene (the green Sahara's hippopotamus in 475 CE, elephants in the Nubian Desert of 1482); a row dated only to the whole Pleistocene; lists carried 2,200 km; no living plants. |
| `field:earth/elevation` | 7 | The far relief is not in a scene even where today's ground is held (the Safed Koh at 30 km); before 800 ka a 1° relief answers and the Taihang is gone; a Cretaceous salt lake the sea entered is 632 m up. |
| weather and season (no layer) | 7 | Dust haze, the afternoon's storm cloud, a winter plain that is green in January. |
| standing water from the rock record (no layer) | 4 | Lakes and ponds the formations near a point record, which the drainage model cannot make. |
| people and their animals (no layer) | 4 | The viewer draws dwellings, and no person, herd or camel. |

One card turned on a single field: at the Aptian point the climate model's wet tropics make a rainforest, where clay
minerals 15 km away give under 250 mm of rain. The states of 1090 were the one layer with every item drawn.

**The questions of section 5.**

- *Are the pairs telling?* Yes, and the same few owners recur on most cards, which is what ranks them. The rarer
  findings were errors in the world that a brief caught: the atlas rows above, and heights and climates in deep
  time that the nearest rocks contradict.
- *What does a brief take?* Eight to thirteen minutes and about 200,000 tokens for an agent: some eighteen texts
  fetched and kept, eight cited, and as many fetches refused. The briefs were two-thirds `region` (116 items to 51)
  and left 108 things unknown, nine a brief.
- *Does the image model contradict its brief?* Seldom outright, once it is told what not to draw. Of the 167
  items the prompts asked for 117, and left 50 out as of another moment, out of sight, or no sight at all (a state,
  the length of a day). Of the 117, the pictures show 106, lack 7 and go against 4. Four pictures were made a
  second time because the first take broke an item: a hill where the brief has a plain, a mountain wall with no
  foothills, shovel-tuskers as living elephants, land too red. The second take cured the relief and the colour,
  and not the animals or the plants. What the model fills in is the larger matter: every picture answers some of
  its brief's `unknown` with what the model has seen most, which is the present. Extinct things come out as their
  living kin (podocarps as spruces, a Miocene crocodile as an alligator, shovel-tuskers as elephants), and a reader
  cannot tell an item from a filling by looking. The check lists what each picture adds. Sixteen takes cost $0.96.
- *Do the weights put the points where a visitor would look?* In deep time, yes: the fossils' weight found real
  fossil districts. In the human era, no: a square root over 1° cells chose three empty landscapes and no town.

What would close these gaps, ranked by how much of a picture each changes, and what a reading of the code found
behind each, is in [PARITY.md](PARITY.md). That reading corrected eight of the round's verdicts: its section 6.

**What the round changes in the design.**

- **A sixth verdict, not tested**, is in the table of 3.5. A fifth of all items needed it.
- **The brief asks for this frame.** An item is what the camera would show from where it stands, facing as it
  faces. What is known only of the region stays an item, marked so; what is of another moment goes in a note.
- **The viewer's own account is half the evidence.** Several verdicts rest on what the viewer said and no frame
  shows: a height, a list, a count of houses. A round keeps it (`drawn.json`) beside the pictures.
- **The sampler names the place** from a gazetteer, and gives today's coordinates before the Holocene. Its hint
  for one point was wrong, and the researcher had to find that out.
- **The people's weight** should be by density, or by the cities' lists, so that towns come up; and the fossils'
  weight should stop where the people's begins.
- **Orbit in the deep Precambrian tests little:** nine of that card's fourteen items could not be tested. Before
  any plate model reaches, a round should take fewer such points.
- **Fetching needs a better reader.** Half the fetches were refused. A round's cost is mostly here.
- **The prompt is written from the brief, not assembled from it.** Three items in ten cannot go into one frame,
  and each prompt says which it left out and why (`leaves_out`), so that the card can tell an item the picture was
  never asked for from one it failed.
- **The card says what in the picture is the model's.** Each item is marked shown, absent, against or not asked,
  and what the picture adds beyond the brief is listed under it. Without that the picture reads as more certain
  than the brief is, most of all for plants and animals.
- **No seed.** The model takes none, so a picture cannot be made again as it was: the prompt and the number of
  the take are what a round keeps.
