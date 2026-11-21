# Writing a building tradition

A building tradition is a way of building houses and setting them out that archaeologists or historians recognize
across many sites: the Iron Age roundhouse of Britain, the Ancestral Puebloan room block, the Mongolian felt tent. It
is a record with a few sourced claims (what the house was like, how the houses stood together, the fields around them,
where and when), and the settlement generator draws every house of the human landscape from it. This is the brief for an
agent, or a person, writing them. The plan it serves is [HUMAN-LANDSCAPE.md](HUMAN-LANDSCAPE.md); the rules in
[CONTRIBUTING.md](../CONTRIBUTING.md) and [RECORDS.md](RECORDS.md) all apply. Never invent a source, a size or a date,
and everything a machine writes is `proposed`.

Where no tradition is written for a place and a time, the generator draws a generic house for the way of life and the
climate there (a forager's hut, a herder's tent, a farmer's house of mud, timber or thatch), and the panel says that it
is generic. So there is no need to do everything at once. A broad tradition covering a large region for a long time is
worth a lot: it draws every house there until someone writes a narrower one.

## The line

```sh
npm run world -- dwellings-wanted               # the regions, times and ways of life with no tradition written
npm run world -- dwellings-wanted --lifeway herders   # the same for one way of life
npm run world -- dwellings-wanted --region 59   # one region's times and ways of life, and the traditions that cover them
npm run world -- dwellings-wanted --totals      # each time's people by way of life, and how many a tradition houses
npm run world -- dwellings-wanted --regions     # the regions' numbers and names
npm run world -- quote-check src:<source> <text file>   # find every quote of a source in the text you read
npm run validate -- --no-frames                 # every tradition is checked
npm run world -- dwelling-sheet people/traditions/iban-longhouse          # draw its house, and print whose each part is
npm run world -- dwelling-sheet people/traditions/iban-longhouse --yard   # the same in its yard, with what stood by it
npm run world -- dwelling-sheet people/traditions/iban-longhouse --outbuilding 1   # the first thing of its outbuildings
npm run world -- dwelling-sheet all [word] [--yard]   # every tradition's house, twelve to a page
```

`dwelling-sheet` writes a PNG under `dist/sheets/` with the house from before and behind, from the front, the side and
above, in several of its shapes and at each detail, with a scale. **Look at it**, as a form's sheet is looked at
([FORMS.md](FORMS.md)): it is the quickest way to see that a claim says what you meant, that a door is in the end
you read it in, that a floor on posts stands as high as the source says. Its colours only tell the materials apart; the
viewer's are its own. `--climate desert` takes what a farmer's house leaves unsaid from the generator's house of that
climate, as a scene there would.

`dwellings-wanted` ranks a region, a time and a way of life by how many people HYDE and the model of how people lived
put there, so the top of the list is where most houses are drawn as generic. Work from the top down, and then by way
of life: foragers, herders and shifting cultivators never reach the top of a list ranked by people, and they are most
of the land and, before 3000 BCE, most of the people.

## Where a tradition goes

In `world/entities/people/traditions/`, one file per tradition:

```yaml
# The shape of one: every value here must come from what you read, with its quote.
id: people/traditions/iron-age-roundhouse-britain
kind: tradition/building
summary: >-
  The round house of later prehistoric Britain and Ireland: a circle of posts or a ring of stone or turf walls under a
  conical thatched roof, standing alone or in small groups among their fields.
author: machine:claude-code
claims:
  name:
    prop: name
    value: { en: Iron Age roundhouse of Britain and Ireland }
    unsourced: An editorial label.
  start:
    prop: start
    value: { lo: 1500 BCE, hi: 800 BCE }
    source: { ref: src:…, loc: "p. …", quote: "…" }
    method: expert-estimate
  end:
    prop: end
    value: 100 CE
    source: { ref: src:…, loc: "p. …", quote: "…" }
    method: expert-estimate
  extent:
    prop: extent
    value: { from: src:archaeoglobe-2019-regions, names: ["38"] }
    source: { ref: src:…, loc: "p. …", quote: "…" }
    method: editorial
    note: The regions the source places it in; it does not say the house covered all of them.
  lifeway:
    prop: lifeway
    value: [farmers]
    source: { ref: src:…, loc: "p. …", quote: "…" }
    method: editorial
    note: Whom the source says lived in these houses, in a sentence.
  dwelling:
    prop: dwelling
    value: { plan: round, diameter: { lo: 5, hi: 15 }, walls: wattle-and-daub, roof: conical, roof_material: thatch }
    source: { ref: src:…, loc: "p. …", quote: "…" }
    method: excavation
  settlement:
    prop: settlement_form
    value: { pattern: dispersed, houses: { lo: 1, hi: 5 } }
    source: { ref: src:…, loc: "p. …", quote: "…" }
    method: expert-estimate
relations:
  broader:
    rel: member-of
    to: people/traditions/…
    unsourced: An editorial grouping.
```

Write one claim for each property. When different sources give different parts of a dwelling, cite them all in its
`source:` list, each with its own locator and quote, and say in a `note` which gives which. Two claims of one property
are competing claims, for when sources disagree: rank one `preferred` and say why ([RECORDS.md](RECORDS.md)). Keep a
parameter you cannot source out of the claim: what no claim says is the generator's guess, and the panel shows it as such.

## What a tradition can say

| Property | What it holds |
|---|---|
| `start`, `end` | when the tradition held, as the source dates it: a year, a range, or a period's record |
| `extent` | the ArchaeoGLOBE regions it was found in, as `{ from: src:archaeoglobe-2019-regions, names: ["59", "61"] }`. A region named is a region where the tradition was, not a claim that it covered all of it. A tradition with no extent takes its parent's |
| `lifeway` | whom it housed: a list of one or more of `foragers`, `herders`, `shifting-cultivators`, `farmers`, `townspeople`. Its house is drawn only for those. A tradition with no lifeway takes its parent's; one with none at all houses no one, and the validator warns |
| `dwelling` | the house: `plan`, `diameter` or `width` and `length`, `wall_height`, `height`, `storeys`, `rooms`, `walls`, `finish`, `roof`, `roof_material`, `pitch`, `floor`, `floor_height`, `court`, and [its openings and what stood against it](#the-house-in-detail): `entrance`, `faces`, `windows`, `smoke`, `porch`, `veranda`, `byre` |
| `settlement_form` | how the houses stood together: `pattern`, `layout` (`ring`, `rows`), `enclosure` (what stood round the settlement or the compound), `yard` (what stood round each house's yard), `plaza`, `houses` (in one settlement), `spacing` (metres between them), `household` (people in one house) |
| `outbuildings` | [what stood by the houses](#what-stood-by-the-houses): granaries, byres, pens, cookhouses, ovens, wells, racks, stacks, shrines, houses to meet in, as a list |
| `field_system` | the fields: `kind`, `plot` (hectares), `bounds` |
| `town_form` | for a tradition that housed townspeople, how its towns were laid out: `streets` (`grid`, `lanes`, `canals`), `block` and `street` and `main_street` (metres), `wall` (`none`, `earth`, `rammed-earth`, `timber`, `mudbrick`, `stone`, `brick`), `wall_height`, `wall_thickness`, `gates`, `moat`, `square` |
| `member-of` | the broader tradition it belongs to: it inherits every parameter it does not state |

The words each may take are in [core/dwelling.ts](../core/dwelling.ts), each with what it means. Lengths are in metres
and plots in hectares; a number is a number or `{ lo, hi }` as the source gives it. If a source's word for a material or a
plan is not there, use the nearest and say so in a note, or add the word to `core/dwelling.ts` with its meaning in the
same pull request.

`household` matters most to the generator after the house itself: it turns HYDE's people into houses. Cite it only where a
source gives it for this tradition; otherwise leave it out and the generator's stated choice stands in.

## The house in detail

A house is drawn from every part its `dwelling` claim states, and what it does not state is the generator's plain
guess, marked so. Beside its plan, size and materials, a source often says a few things that make a house its own, and
each has a word:

| Parameter | What it says | Words |
|---|---|---|
| `entrance` | where the way in was | `end` (in a short side, or under a gable), `side` (in a long side), `roof` (through the roof, by a ladder), `tunnel` (by a low covered passage) |
| `faces` | which way the entrance faced, where the houses of a tradition all faced one way | `north`, `north-east`, `east`, `south-east`, `south`, `south-west`, `west`, `north-west` |
| `windows` | its windows | `none`, `small` (unglazed, shuttered or barred), `large` (lattice, paper or glass) |
| `smoke` | how smoke left it | `none` (through the thatch or by the door), `hole` (in the roof), `gable` (openings under the ridge), `chimney` |
| `finish` | how its walls were finished | `plain`, `mud` (mud, clay or dung plaster), `lime` (limewash or lime plaster), `painted` |
| `porch`, `veranda`, `byre` | `true` or `false`: a porch before the door; a veranda or gallery under the eaves; animals stalled under the same roof | |
| `floor_height` | metres the floor stood above the ground (raised, on a platform, on stilts) or below it (sunken) | |
| `pitch` | how steeply the roof sloped, in degrees from the level | |

Words added with these, for what the first traditions could not say: plans `l-shaped`, `figure-of-eight`, `polygonal`,
`semicircular`; walls `log`, `plank`, `timber-frame` (a frame filled with wattle and daub, earth or brick), `wattle`
(with no daub), `mat`; roofs `hip-and-gable`, `half-hip`, `curved` (ridge and eaves curving down to the ends, as in
Bengal), `shed`; roof materials `leaves`, `brush`, `mat`. Where a source says only "timber" or "thatch", keep those:
the narrower word needs a sentence that says it.

Each needs a sentence that states it, as a size does: "the door is always in the gable end facing the street" is a
source for `entrance: end`; a plan in a figure is not. `faces` is for a rule the source states ("the doorways face
south-east"), never for one house. Say `windows: none`, `smoke: none` or `porch: false` only where a source says there
were none: a parameter left out is unknown, which is not the same.

A round house enclosing a court (`plan: round` with `court: true`) is drawn as a ring of rooms round it, as a tulou is.

## What stood by the houses

A household had more than a house, and a settlement more than households: a granary on posts, a pen for the cattle at
night, a cookhouse, a well, a rack for drying fish, a house the men met in. A tradition's `outbuildings` claim lists
them:

```yaml
  outbuildings:
    prop: outbuildings
    value:
      - { use: granary, per: house, plan: round, diameter: 2, walls: wattle-and-daub, roof: conical, roof_material: thatch, floor: stilts }
      - { use: pen, per: settlement, enclosure: hedge, diameter: { lo: 20, hi: 30 } }
      - { use: hall, per: settlement, plan: rectangular, length: 18, width: 8 }
    source:
      - { ref: src:…, loc: "p. …", quote: "…each wife has her own granary, a small round hut raised on stones…" }
      - { ref: src:…, loc: "p. …", quote: "…the cattle are driven at night into a fold of thorn bushes in the middle…" }
    method: historical-account
    note: Which source gives which, and what is left to the generator.
```

| Field | What it holds |
|---|---|
| `use` | `granary`, `store`, `byre` (a house for animals), `pen` (an open fold, kraal or corral), `kitchen`, `oven` (an oven or kiln in the open), `well`, `pond`, `rack`, `stack`, `threshing-floor`, `workshop`, `bath`, `shrine` (a shrine, temple or church), `hall` (a house to meet in: a men's house, a council house, a kiva), `pole` (a carved pole or a standing stone) |
| `per` | `house`: a household's, drawn by a house; `settlement`: the settlement's, drawn among the houses or at their middle |
| `count` | how many to a household or in a settlement, where a source counts them; a number below one where only some households had one ("one granary to four or five houses" is `{ lo: 0.2, hi: 0.25 }`) |
| the words and sizes of a dwelling | `plan`, `diameter`, `width`, `length`, `height`, `walls`, `roof`, `roof_material`, `floor`, `floor_height` and the rest, as far as a source says them; `enclosure` for what a pen was made of |

- **One list, one claim.** Cite each source that gives a part of it, each with its quote, and say in the note which
  gives which.
- **Only what a source says stood there.** "Grain was stored in pits inside the house" is no outbuilding. A use with no
  word is left to the note, or a word is added to [core/dwelling.ts](../core/dwelling.ts) with its meaning.
- **`per` is the source's.** "Each household had its own granary" is `per: house`; "the village granary" is
  `per: settlement`. Where it does not say, leave the outbuilding out and say so in the note.
- **How many is drawn where none is counted is the generator's:** by a part of the houses, or once in a settlement
  (`params.outbuildings` in [settlement.yaml](../world/generators/people/settlement.yaml)), and the panel says so.
- A member tradition that gives a list of its own does not add to its parent's: it replaces it.

## Whom a tradition housed

The model of how people lived gives every piece of land a pattern of settlement, and each pattern is one way of life:

| `lifeway` | The patterns it houses | Who they were |
|---|---|---|
| `foragers` | foragers' camps | people who lived by hunting, fishing and gathering, in camps or settled |
| `herders` | herders' camps | people who lived by their herds, in camps moved with them |
| `shifting-cultivators` | shifting cultivators | people who cleared plots in woodland, cropped them a few years and moved on |
| `farmers` | farmsteads, hamlets, villages | people who farmed the same fields year after year |
| `townspeople` | towns, cities | people of towns and cities, the lists' cities among them |

A tradition's house is drawn only for the ways of life its `lifeway` names: a herder's tent for herders' camps, not for
the farmers of the same region, who stay generic until someone writes their house. Name every way of life the sources
show the house was lived in by, and no more. A house of villages and of the towns that grew from them is
`[farmers, townspeople]`; a house known only from a city's excavated quarters is `[townspeople]`. The claim is sourced
like any other: a sentence that says who lived in these houses.

Two things about how the model draws the line:

- **Herders are people who lived mainly by their herds,** in camps moved with them or on farms among their pastures.
  The model calls the people of grazed land with few people herders, in Iceland as on the steppe. A house of stock
  farmers whose sources say they lived by their herds names `herders`, beside `farmers` if they also tilled.
- **Shifting cultivators and farmers stand in for each other.** The model tells them apart by a survey's answer for a
  whole region, farming that was not continuous against farming that was, and the same villages are often both to
  their excavators. So where no tradition is written for a region's shifting cultivators, the house of its farmers is
  drawn for them, and the other way round, and the panel says that it stands in. Name the one the sources show; write
  the other's house when a source describes one.

## How many lived so

An `extent` names regions where a tradition was, not regions it covered, and a region is large: Central Europe, Myanmar,
south-eastern China. A tradition that says nothing more is drawn as the house of everyone of its way of life there whom
no more particular tradition houses. Where the sources show it was the house of a part of them, a `prevalence` claim
says so:

| `prevalence` | How many of them |
|---|---|
| `few` | a few: a house of some districts, of one people among others, or of those who could afford it |
| `some` | a part of them, beside other houses |
| `most` | most of them |

```yaml
  prevalence:
    prop: prevalence
    value: few
    source:
      ref: src:…
      loc: "…"
      quote: Only five villages included Square Tulou, and six featured Round Tulou.
    method: editorial
    note: What the region holds besides, and that the word is the record's reading of where the houses stood.
```

- **A word, not a number.** A source says that a house was rare or common far more often than it counts, and a count is
  of one district, not of the region. The part of the region's settlements each word is drawn for is the generator's
  parameter (`params.prevalence` in [settlement.yaml](../world/generators/people/settlement.yaml)), and no claim.
- **Its source places the house:** a sentence that says where it stood, or how common it was, and a note that says what
  else the region holds.
- **What it does.** Each 5′ cell of the region falls to one tradition, so a rare house stands in clusters. The
  traditions that say how many take their parts first, the most particular first; the most particular of those that do
  not say takes everyone left; and where none does, the rest are in the generic house and counted so.
- **A member does not take it from its parent,** and a tradition that was the house of its region needs none.

## Towns

A town or a city is drawn as houses on the lots of its streets, and round them a wall with its gates and towers where
it had one. How it was laid out is a `town_form` claim, of two kinds of record:

- **A tradition that housed townspeople** states it for the towns of its region and time: "the towns of the Indus
  cities stood on a grid of streets, behind walls of mudbrick". It is drawn for every town and city of the region then,
  the lists' cities among them.
- **A settlement's own record** (`kind: settlement`) states it for that city, and stands over the tradition's, part by
  part: Tenochtitlan's canals, the four gates a source counts in a city's wall. With its `population`, `houses` and
  `settlement_area` claims, it is what a scene draws the city from.

```yaml
  town:
    prop: town_form
    value: { streets: grid, block: { lo: 80, hi: 100 }, wall: mudbrick, wall_height: 6, gates: 4 }
    source: { ref: src:…, loc: "p. …", quote: "…" }
    method: excavation
```

Say only what a source states: a wall with no height is `wall: stone` and no `wall_height`, and the generator's
height stands in and says so. A wall whose height, thickness or gates a source gives and whose material it does not
has those and no `wall`: it is drawn as the generator's plain wall, and the panel says that what it was made of is
not said. A layout that held for part of a record's span says when (`valid`), as a palisade put up late does, and is
drawn only then. Where neither a tradition nor a record says anything, the generic town is drawn, lanes that wander
and no wall, and the panel says that it is generic.

The wall is drawn round the whole town, and the form for every town of a tradition's regions. A wall round a precinct,
or one that some towns had and others did not, belongs in the note until a record can say so.

## Animals

Which animals people kept is a record of its own kind, a husbandry tradition (`kind: tradition/husbandry`), written as
a building tradition is: `name`, `start`, `end`, `extent`, `lifeway`, and in place of a dwelling its `livestock`, the
animals as a list of taxon records. A narrower one is a `member-of` a broader one and says only what differs. The file
goes in `world/entities/people/husbandry/`.

```yaml
id: people/husbandry/neolithic-europe
kind: tradition/husbandry
summary: >-
  The cattle, sheep, goats and pigs of Europe's first farmers …
author: machine:claude-code
claims:
  name:
    prop: name
    value: { en: Farm animals of Neolithic Europe }
    unsourced: An editorial label.
  start: { prop: start, value: 6500 BCE, source: { ref: src:…, loc: "…", quote: "…" }, method: expert-estimate }
  extent:
    prop: extent
    value: { from: src:archaeoglobe-2019-regions, names: ["43", "44"] }
    source: { ref: src:…, loc: "…", quote: "…" }
    method: editorial
  lifeway: { prop: lifeway, value: [farmers], source: { ref: src:…, loc: "…", quote: "…" }, method: editorial }
  livestock:
    prop: livestock
    value: [life/taxa/bos-taurus, life/taxa/ovis-aries, life/taxa/capra-hircus, life/taxa/sus-domesticus]
    source: { ref: src:…, loc: "…", quote: "…" }
    method: excavation
```

The settlement generator draws those animals among the tradition's people: the ones that graze, in herds on the pasture
of people who herd and at the edge of the houses of people who farm; the rest, pigs, fowl and dogs, about the houses.
Which animals is the tradition's claim. How many is no one's: the generator draws a few to a house and says so.

Each animal is a taxon record (`kind: taxon`, in `world/entities/life/taxa/`), drawn with the body of the nearest
record above it that has one ([FORMS.md](FORMS.md)) and its own size. So a domestic animal needs a record with a
`descends-from` relation to a taxon that has a body (cattle, sheep and goats to `life/taxa/bovidae`, pigs to
`life/taxa/suoidea`, horses and donkeys to `life/taxa/equus`, camels and llamas to `life/taxa/camelidae`, dogs to
`life/taxa/canidae`, fowl to `life/taxa/galliformes`) and a sourced `body_length` or `body_mass`: without a size of
its own it is drawn at the middle of its family's range, a sheep as big as an ox. One with no size anywhere above it
is not drawn, and the build says so.

## Which tradition draws a place

At a place and a time, of the traditions whose `extent` names the place's region, whose span holds the time and whose
`lifeway` names the way of life there, the generator takes the most particular: the deepest in the tree, then the one
that names the fewest regions, then the latest to start. Those that say they housed a part of the people
([how many lived so](#how-many-lived-so)) take their parts before it. So:

- **Write broad traditions first.** "Mudbrick houses of Mesopotamia, 3000–500 BCE" before "the houses of Ur in the Isin–Larsa
  period". The narrower one, when it comes, takes over where and when it holds, and inherits what it does not say.
- **Split by time when the house changed.** Two records, each with its own span, are better than one that averages them.
- **Do not stretch a tradition to fill a map.** A region named without a source that places the tradition there is an
  invention. A region nobody has written stays generic, and says so.

## Sources

The best sources are excavation reports and syntheses of a region's houses, then reviews and handbooks, then
encyclopedias, cited only when nothing better can be read and saying so in a note ([RECORDS.md](RECORDS.md)). Read the
source; keep its text; check every quote by script with `quote-check`; give the page or section as the locator. A size
needs a sentence that states it. "Houses of 5–7 m across" is a source for `diameter: { lo: 5, hi: 7 }`; a photograph is not.

## What it will not do

- A tradition is a type, not a house: every house the generator draws is one sample of it, and none of them was there.
- A region is coarse. Where a tradition held only part of one, the generator draws it over all of it, or over a part
  of its cells taken at random where the tradition says how many lived so: never over the part it really held. The
  panel says the tradition was found in the region, not here.
- Colour, decoration and the inside of a house are the generator's, and marked so. So is every difference between one
  house of a tradition and the next: which of its stated sizes each has, how weathered it is, where exactly its
  windows are.
