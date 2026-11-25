# Seventeenth slice: the house in detail

Status: built; see *How it was checked* for what was and was not run. It follows the
[sixteenth slice](SIXTEENTH-SLICE.md), which filled the human landscape with houses of recorded traditions, and
answers what that left plain to see: every house was a box or a drum under one roof with a dark oblong for a door,
every house of a tradition the same house, and a village nothing but houses. A record could say no more than a plan, a
size, what the walls and the roof were made of and the level of the floor, and the generator drew less than that.

It adds:

- **What a house can say.** A `dwelling` claim now says where its door was (`entrance`: in an end, in a long side,
  through the roof, by a low passage), which way the houses of a tradition all faced (`faces`), its windows, how its
  smoke left it (`smoke`: no opening, a hole, openings under the ridge, a chimney), how its walls were finished
  (`finish`: plain, mud, lime, painted), a `porch`, a `veranda`, a `byre` under its roof, how high its floor stood on
  its posts or how deep it was dug (`floor_height`), and how steep its roof was (`pitch`). And the words the first
  traditions wanted: walls of logs, of planks, of a timber frame with its panels, of wattle with no daub, of mats;
  roofs hipped under a gable, half-hipped, curved as in Bengal, of one slope; roofs of leaves, of brush, of mats; plans
  in an L, of two round rooms, of many sides, of a half circle.
- **What stood by the houses.** A tradition's `outbuildings`: a list of what a household or a settlement had besides
  its houses, a granary, a store, a byre, a pen, a cookhouse, an oven, a well, a pond, a rack, a stack, a threshing
  floor, a work hut, a bath house, a shrine, a house to meet in, a pole. Each says its use and whose it was, how many
  where a source counts them, and what it was like in the words of a dwelling.
- **How the houses stood.** A `settlement_form` says whether they stood in a ring or in rows (`layout`), round open
  ground (`plaza`), what stood round the settlement (`enclosure`: a fence, a hedge, a palisade, a bank, a ditch, a
  wall) and round each yard (`yard`).
- **A house drawn from all of it.** A roof as thick as its covering, on its frame, with its eaves, its verges and its
  ridge; hips, half-hips, hips under gables, the curved ridge of Bengal, vaults, domes, cones; a door of boards in its
  frame, shut, open or ajar; windows with shutters, or of lattice and paper; a frame of timber and its storeys; a
  floor on posts with its ladder, on a base with its steps, or dug down with the earth banked against its walls; a
  hatch and a ladder where a house was entered by its roof; a low passage into a house of snow; a porch on its posts;
  a veranda; a chimney; a byre's wide door. A ring of rooms round a court under one roof; ranges round a court, each
  under its own, the court kept from far off; a block of rooms stepping up to its back, with the ends of its beams and its ladders; a front cut in
  the earth, with its arches; a felt tent with its bands, its ropes, its ring for the smoke and its door; a tent of
  hides with its poles and its flaps; a black tent on its poles and ropes, its front open; a roof on posts with no
  walls; a hut that is all roof.
- **No two alike.** A dwelling is drawn in eight shapes, each with sizes of its own within the ranges its claims
  give, its door and windows a little elsewhere, its door shut or open. A house that stands for several households is
  drawn wider and longer, its storeys and doors as they were, and no longer as a bigger copy of itself.
- **A house in its yard, a village with what it had.** A household's outbuildings and the enclosure of its yard are
  drawn with its house, as one thing; a settlement's hall, shrine, well or pen stands among its houses or at their
  edge, and its fence, hedge, palisade, bank, ditch or wall round them. Houses stand in a ring or in rows, round open
  ground, and face the way they all faced, where their tradition says so; where it says nothing, a cluster is thrown
  and not wound on a spiral.
- **What houses are built of, as surfaces.** Thatch in its courses, mud plaster, bricks of mud, limewash, painted
  plaster, a timber frame with its panels, logs, boards, rough stone, wattle, woven mats, reeds in bundles, felt, sewn
  hides, cloth of hair, turf, snow, an earthen roof, shingles, fired tiles, leaves, brushwood, rope: each drawn by the
  renderer in the house's own frame.
- **People in their ways.** Standing, with a staff, walking, carrying on the head, sitting, kneeling at work, a
  child, holding a basket: eight figures in place of one.
- **The animals people kept, in bodies of their own:** see *The animals* below.
- **A sheet of a house**, to look at it without a browser: `npm run world -- dwelling-sheet`.
- **Records:** the 92 building traditions read again in their own sources for all of this: 58 now say something
  new of the house, 35 of how the houses stood, and 37 have outbuildings, 69 things in all.

## Running it

As for the other slices (see the [README](../../README.md)); it needs no dataset the eleventh slice did not.

- **A house on its sheet:** `npm run world -- dwelling-sheet people/traditions/bengal-thatched-hut --yard`, then open
  the PNG it names under `dist/sheets/`; `npm run world -- dwelling-sheet all --yard` for every tradition, twelve to a
  page; `npm run world -- dwelling-sheet work:person` for the figures, `work:pen:hedge` for a fold.
- **A medieval English hamlet,** each timber-framed house in its ditched toft with its barn: `?t=1300&lat=52.2&lon=0.4&d=1.00014&h=40&v=70`.
- **A homestead of Bengal,** its curved thatch, its veranda, its fenced yard and its tank: `?t=1800&lat=24.5&lon=88.5&d=1.00014&h=40&v=70`.
- **A village of North China,** courtyard houses of mud brick with paper windows, all facing south: `?t=1850&lat=36.6&lon=115.5&d=1.00014&h=40&v=70`.
- **A Yangshao village,** rings of sunken houses round its open middle and its hall: `?t=-4000&lat=34.4&lon=109&d=1.00014&h=40&v=70`.
- **A Maasai kraal,** a hedge of thorn round low houses and the fold at their middle: `?t=1885&lat=-2.6&lon=36.6&d=1.00014&h=40&v=70`.
- **Herders' felt tents,** their doors to the south: `?t=1200&lat=47.2&lon=102.8&d=1.00005&h=60&v=76`.
- Click a house, a thing in its yard, a length of fence or a person for what each rests on and what of it is invented.
- **To look at it all at once:** `npm run build:viewer && LOOK_GPU=1 npx tsx viewer/test/look-landscape.mts <dir>`:
  each settlement from before the door of one of its houses (`close-…`) and from over it (`over-…`).

## Pass criteria

The generator's tests named here as `v3.test.ts` are in `v4.test.ts` since its version 4 gave its people and their
animals somewhere to go ([docs/plans/RENDERING.md](../plans/RENDERING.md), step 5); their names are as they were.

| Criterion | Where it is checked |
|---|---|
| A dwelling's new parameters are checked word by word, a flag as a flag, a pitch as less than 90°; a settlement form's likewise | `tools/world/test/landscape.test.ts`: checks the house in detail |
| Outbuildings are a list, each with its use and whose it was, in the words of a dwelling | `landscape.test.ts`: checks what stood by the houses |
| A member takes its parent's list of outbuildings whole where it gives none, and gives its own whole where it does | `landscape.test.ts`: takes a member's list of outbuildings whole |
| Every word a claim may use is drawn, at every detail, about as big as it says; far off a house is a block of a few triangles | `world/generators/people/dwellings.test.ts`: draws every word a claim may use |
| A dwelling is drawn in several shapes, each within the ranges its claims give, and each the same every time | `dwellings.test.ts`: draws a dwelling in several shapes |
| A house's door is in its front, whichever of its walls it is in | `dwellings.test.ts`: turns a house so that its door is in its front |
| A house that stands for several households is wider and longer, and no taller | `dwellings.test.ts`: grows a house; `v3.test.ts`: draws a house that stands for several households wider and longer |
| A floor on posts is lifted, a dug one sunk; the eaves of a walled house stay above a head | `dwellings.test.ts`: lifts a floor on posts |
| What a tradition leaves unsaid is the generator's house only as far as that fits what it says | `dwellings.test.ts`: takes from the generator's house only what fits |
| A household's outbuilding is built of what its house is built of, where nothing says; a household's things and its yard's enclosure are its tradition's, a settlement's left to the settlement | `dwellings.test.ts`, *a house in its yard* |
| A yard is drawn with its house, within the household's ground, behind and beside it, and not from far off | `dwellings.test.ts`: draws the yard with the house |
| A length of enclosure runs its whole run; a pen has its way in; each thing of a yard is about the size it says | `world/generators/people/works.test.ts` |
| A person is drawn in each of its ways, a grown one as tall as it says, a child shorter, none in the ground | `works.test.ts`: draws a person in each of its ways |
| Every house of a scene is in one of its dwelling's shapes, and as big as its claims say | `world/generators/people/settlement/v3.test.ts`: draws each house in one of its shapes |
| Houses stand in a ring round open ground, their doors to the middle; in rows, facing across; and all one way, where their tradition says | `v3.test.ts`, *how a tradition sets its houses out* |
| What a tradition says enclosed a settlement stands outside every house, all round but for its ways in; a settlement called walled and no more has the generator's plain wall, which says so; one that says nothing has none | `v3.test.ts`: draws round a settlement what its tradition says enclosed it |
| A town's house is no wider than the ground its town gives it | `v3.test.ts`: draws a town's house no wider than the ground its town gives it |
| No house of a town of winding lanes stands in its neighbour, its houses front the lanes as they run, and the town has as many houses as a town of straight streets | `v3.test.ts`: lets no house of a town of winding lanes stand in its neighbour |
| A city's houses keep off the ground of a city that adjoins it | `v3.test.ts`: keeps a city's houses off the ground of a city that adjoins it |
| A town's low houses are drawn from far off, where each is wider than a pixel and not as tall as one | `world/generators/people/scene.test.ts`: keeps a town's low houses in sight from far off |
| A settlement has one of each thing its tradition names for it, near its middle, and no house is counted that is none; a house's form carries its yard and whose claims they are | `v3.test.ts`: draws what a settlement had of its own |
| The generator's record names these as its checks, and the validator finds them | `npm run validate` |
| In the browser: a house of East Anglia stands in its yard; a Yangshao village has its hall and its ditch | `viewer/test/e2e/landscape.spec.ts`: a house stands in its yard |

## What was built

### The vocabulary

[core/dwelling.ts](../../core/dwelling.ts) holds the words, each with its meaning, and checks a claim against them;
[DWELLINGS.md](../DWELLINGS.md) is the brief. `outbuildings` is a new property and a new type of value: a list, each
thing a mapping with `use`, `per` and whatever of a dwelling's words and sizes its source states. A tradition that
gives no list takes its parent's, whole. `specText` and `outbuildingsText` say them in a panel as a source would.
Nothing was taken away or changed in meaning: `timber` and `thatch` are still what a record says where its source
says no more, and the narrower words need a sentence that says so.

### The drawing

[dwellings.ts](../../world/generators/people/dwellings.ts) draws a house from its dwelling, by its plan and what it is
built of, in three details: close by, everything; from a way off, its roof's thickness, its doors and windows as dark
oblongs, its posts, its yard's fence without its stakes; far off, a block under its roof, of 14 triangles for a house
of four walls. [parts.ts](../../world/generators/people/parts.ts) has what it is drawn with, frames inside frames
among them: a wall's door is drawn in the wall's own frame, and a house whose door is in a long side is turned so that
its front is still its front. [yard.ts](../../world/generators/people/yard.ts) draws what stands in a yard and round
one, [figures.ts](../../world/generators/people/figures.ts) the people.

What the claims leave unsaid is drawn by the proportions at the head of each file, which are the generator's look: a
door of 0.9 m by 1.85 m, thatch a third of a metre thick at 45°, tiles at 27°, a stilted floor at 1.6 m, eaves no lower
than a person walks under. Where a tradition says nothing of its roof, the generator's own house of the way of life
and the climate gives it, but only as far as it fits (`fillDwelling`): a size only where the tradition gives none and
its plan is the generator's or unstated; a roof only where the tradition says nothing of its roof and is of the same
kind of plan; a court only where no plan is stated. Before, a round pit house took a farmhouse's gable and a courtyard
house its five metres of width.

### The generator

`gen:people/settlement` is **version 3**
([world/generators/people/settlement/v3.ts](../../world/generators/people/settlement/v11.ts), now `v9.ts`): what it makes of a
scene changed beyond the tolerance, so it is a new version and not an edit.

- **A house's shape** is one of eight, by a hash of its place in its settlement; its size is no longer a share of its
  dwelling's. A city's house that stands for several households is a form of its own, as wide and long as they would
  take, to a quarter.
- **A house's yard is part of its mesh.** A form carries its homestead: the side of the ground a household has, what
  encloses its yard, and its household's outbuildings, each filled out as a dwelling is, from what its tradition says
  of it, then the generator's plain one of its use (its shape and size), then what the tradition's house is built of.
  So a village of homesteads costs no more instances than a village of houses. A household has a thing its source
  counts as many times as it counts; where none is counted, six households in ten have one
  (`params.outbuildings.share`).
- **A settlement's own things** are instances of their own: a roofed one a form like a house's, the rest works. One
  of each, or as many as a source counts, to eight: what people met at or drew water from at the middle, what smoked
  or needed room at the edge, a pen at the middle of a ring.
- **A ring** holds as many houses as stand side by side round it, and another ring outside it for more; **rows** stand
  in pairs that face across a way. Houses set so, with no distance stated, stand 2.4 lengths of a house apart
  (`params.compact`), and no further than the generator's ground for their pattern. A tradition's `spacing` is the
  distance from one house to the next where that is more than a house, and the gap between them where it is less.
- **An enclosure** is drawn in lengths of 6 m round the outermost houses, with two ways in; the ring is as wide as a
  whole number of lengths, so that one kind of piece serves every settlement of a tradition. At most 30,000 lengths to
  a scene, laid from its middle outward.
- **A town's houses line its streets.** A lot is as wide along its street as its house and a way past it, and as
  much deeper as its ground allows, to three times (`params.towns.deep`); the house stands at its front, a step back
  from the street, and its yard lies behind. Version 2 stood every house at the middle of a square lot. A house wider
  or deeper than the ground its town gives it is drawn as small as its lot, to a twentieth, so that no house stands in
  its neighbour; the panel says by how much. Along winding lanes a house fronts its lane as the lane runs there, turned
  a little more by chance, and a lot that the wandering has squeezed against one already taken is passed over for the
  next, so the town keeps its houses. Version 2 turned each house by chance alone, and where houses filled their
  lots they stood in one another.
- **Two cities on one ground.** Tenochtitlan and Tlatelolco are two entries of the lists a kilometre or two apart,
  and each laid its houses over the other's. The one that comes first now keeps its ground: no house of a later
  city, nor of a settlement that is no city, is laid on it.
- **A house that stands for several households** has a door to each share of its front, as many as it is times as
  wide, and a house round a court ranges as much deeper: before, a block of five households was a blank wall with
  one gate.
- **A cluster with no stated layout** is thrown: places at random on the ground its houses would take, none nearer
  another than a house and its yard need, none on the open ground at its middle.
- **The ground is trodden round each house** ([LandUseMap](../../world/generators/people/settlement/v11.ts)), on a grid
  of 16 m, and among houses that stand together; houses that stand apart leave the ground between them as it was. No
  tree stands there, and little grass.

### The renderer

The mesh shader has a second table of surfaces, for what houses are built of
([cityShaders.ts](../../viewer/src/gl/cityShaders.ts), `built`): twenty-one, from 50 on in the kit's list, and thatch
and mud drawn anew. Each lays its pattern in the house's own frame and along its walls and up its roofs, so that
boards, courses and weaves stay with a house however it is turned, and lays weather in the world: damp at the foot of
a wall, streaks from its top, moss on old thatch, wood gone grey. Each house has its own age and shade from its tint.
Rome's surfaces are untouched: a house's tiles are a surface of their own, dull red to grey.

In a settlement the ground is trodden in patches, and the tufts of the ground's cover thin where it is.

A house is left out of a view where it is too small to see
([stream.ts](../../world/generators/life/stream.ts)). That was judged by its height alone, and by the height of the
first of its shapes: so a city of one-storey houses round courts, each under a pixel tall from two kilometres but
several across, was drawn as its wall and nothing in it. Uruk was, when this slice first gave its house one storey of
the one or two its record says. A house is now left out only where it is under a pixel tall and under a pixel across
half its width, each shape by its own size.

### The records

Six agents, one to a part of the world, read the traditions' own kept texts again for what the vocabulary could now
hold, and where a tradition's texts said nothing of its house, one more source they could read in full. Their brief
was [DWELLINGS.md](../DWELLINGS.md) with the rules of [CONTRIBUTING.md](../../CONTRIBUTING.md); they added parts to
the `dwelling` and `settlement_form` claims that were there, each with its sentence, and wrote the `outbuildings`
claims. Every claim that gained a source had its `quoted` step written again by script, with all its texts in one run.
[RECORD-SETS.md](../RECORD-SETS.md) has the counts and what a reviewer should take first.

| Part of the world | Traditions | What was found |
|---|---|---|
| South Asia and its north-east | 14, 12 changed | the travellers and officials say most: verandas, cattle sheds, granaries "like a large bee-hive", tanks in every compound, the village hall and temples of Lony, the curved ridge of the Bengal hut |
| China and the steppe | 15, all changed | doors to the south, the smoke ring, carts of coffers beside a tent; the village wall, temple and well of North China; a tulou's wells and ancestral hall; the ditch, the open middle, the kilns and the hall of a Yangshao village |
| Japan, Korea, South-East Asia, the Pacific | 17, 12 changed | smoke holes and chimneys, a store behind a town house, raised granaries beside pit dwellings, the Iban house's veranda and height, a Samoan cookhouse |
| Europe | 18, 15 changed | timber frames, byres under the roof, tofts within ditches, barns, bakehouses, raths within banks, the Uhlenloch of the hall house, Trypillia's rings and assembly houses |
| Africa and the Near East | 16, 14 changed | the kraal's hedge and the fold inside it, camps in rings, mats and not reeds, a Ganda house's porch and fence, limewash and chapels of the workmen's villages |
| The Americas and the Arctic | 12, 11 changed | the snow house's passage, window and storerooms; the roof hatch and cists of a pit house; kivas; planks and roof boards; the tipi's door to the east; a palisade and open ground round Tupinambá houses |

**What could not be said,** because it had no word, is in the records' notes and listed in RECORD-SETS.md: a storage
pit, an altar in the open, a stair to a roof, opposed doors, a stove inside, a floor of two levels.

### The animals

The sixteen animals the husbandry traditions name were each drawn with the body of its family: every bovid as an
antelope, both camels and both llamas as one camelid, the horse and the donkey as one equid; and the zebu, the yak
and the water buffalo 1.28 m long, the middle of all bovids, the donkey as long as a horse. One agent gave each a body
of its own, as claims of its taxon ([FORMS.md](../FORMS.md)), and looked at each on its sheet
(`npm run world -- form-sheet life/taxa/ovis-aries`). No code changed for them.

- **Ten forms on plans there were:** the sheep, a barrel of wool on thin legs with a dark face and its ears out
  sideways; the goat, leaner, with swept horns, a beard and its tail up; the pig, long and low on short legs, with hams
  and a snout; the hen, upright, with its comb, its wattles and its tail a blade; the dog, deep in the chest, its tail
  a sickle; the horse and the donkey apart, the donkey smaller with long ears and a tufted tail; the alpaca woolly to
  its legs, the llama tall in the neck; the reindeer stocky, with antlers, in herds on open ground.
- **Two new plans,** [ox](../../world/plans/ox.yaml) and [camel](../../world/plans/camel.yaml). Cattle and the
  dromedary are the plans as they stand; the zebu (a hump, a deep dewlap, hanging ears), the water buffalo (bare hide,
  heavy horns swept back in a half circle), the yak (a skirt of hair, a bushy tail) and the Bactrian camel (two humps)
  are forms on them.
- **Eighteen sizes, sourced:** lengths and heights for eleven of them, each a claim with its quote, checked by
  script, so that cattle are 2.5 m long and not 1.3, and a donkey 1.7 m and not 2.5. A shoulder height stands for
  the height at the hip in nine records, each saying so. The goat, the horse, the pig, the dog and the hen gained no
  size: the ranges read were of all breeds, or of the wild animal.
- **A form is a drawing, and says so:** the fourteen `body_form` claims and the six `body_plan` claims are
  `unsourced`, each naming the account it was drawn from, that its proportions are a drawing's and no measurements of
  any animal, and that it was only compared with its sheet.
- **Five new sources:** a note of Ontario's ministry of agriculture on the size of Holstein cows (2003), in the
  Internet Archive's copy; three Wikipedia articles at named revisions, one of them German, for sizes no better
  source read gave for the domestic animal; and Dimensions.com, a site of drawings for designers, for three lengths.
  The last is a weak source and its record says so: [RECORD-SETS.md](../RECORD-SETS.md) puts it first among the
  doubts.
- **One committed sentence changed:** the note of the water buffalo's mass said that no length was given, and now a
  length is, for the species as its account gives it, with that said. The llama's new length stands beside the one
  that was there, preferred, with a note saying why. Nothing else that was committed was changed or removed.

## Decisions

- **A yard is its house's.** The enclosure of a yard and what a household kept in it are part of the house's mesh
  and of its form, not instances of their own: a scene may hold sixty thousand houses, and five things to each would
  be three hundred thousand more. A click on a granary in a yard therefore opens its house, whose panel says what its
  tradition says stood by each house, and whose claim that is.
- **Variation is the generator's, and says so.** Sources give ranges, and a village of one house copied is no
  village. Each shape takes its sizes within the ranges, by a hash, as a range of sizes is mostly near its small end.
  The panel says that no two houses are drawn alike and that this is no record of any house.
- **Colour is the renderer's.** What a wall was made of is a claim; what colour that was is not, and the shader
  invents it within what the stuff allows. A house's tiles are dull red to grey: nearly every tiled tradition written
  so far is of East Asia, whose tiles were grey, and no claim says which.
- **The generator's own house fills in only what fits.** The alternative, to draw what a tradition leaves unsaid by
  fixed defaults, would lose what the climate knows: a house of mud brick with nothing said of its roof is flat-roofed
  in a desert and thatched in a wet country. But a default that contradicts what is said is worse than none.
- **A new version, not an edit.** Version 2 is the sixteenth slice's, in a pull request not yet merged when this was
  built, and could have been changed in place; this is a version of its own so that the two can be told apart whatever
  order they are merged in.
- **`faces` is a rule or nothing.** It is written only where a source says the houses of a tradition all faced one
  way. A house's own bearing, where none is stated, stays the layout's.
- **A thing with no count is drawn to a share, not to all.** "Granaries stood among the houses" is not a granary to
  every house. Six in ten is the generator's number, in its parameters, and the panel says that it is.
- **What a settlement had is drawn once.** A hall, a shrine, a well: one to a settlement unless a source counts
  more, however large the settlement.
- **Brushwood for every hedge.** A hedge is "live or of cut thorn"; both are drawn as a ragged band of brush, more
  grey than green.

## Limitations

- **A detail of some houses is drawn for all.** A claim is the tradition's: a porch that some houses had, a byre the
  poor shared with their cattle, a village wall that was "often" there, a chimney that came late, are drawn for every
  house or left in a note. RECORD-SETS.md lists the ones to look at first. A `prevalence` for a part of a dwelling
  would mend it; there is none.
- **One site's things for every settlement of a region:** Lony's three temples, Bhita's sanctuary, Maidanetske's
  assembly house.
- **Where anything stands is invented:** a thing in a yard, behind the house or beside it; a hall, near the middle;
  an enclosure, a round ring whatever the ground; a yard, a rectangle square to its house. Outbuildings that find no
  room in a household's ground are left out, silently.
- **A ditch is not dug.** The ground of a scene is not cut: a ditch is drawn as the dark of its cut, with a bank
  beside it. A sunken house has the earth banked at its eaves and no pit.
- **Houses and yards on a slope** stand level, as they did before: a yard twenty metres across on a slope of one in
  ten stands a metre out of the ground at one end.
- **A town has no yards and none of its own things:** the houses on a town's lots are houses only, and a tradition's
  shrines and halls are drawn for villages. A city still has no temples, palaces or districts.
- **Nothing is inside.** A door stands open on darkness; a house on posts has nothing under it; no smoke rises.
- **The model's ways of life are still the bound.** Where it has foragers and the excavators have villages, as in the
  American Southwest and Iroquoia, the pueblos and longhouses written are not drawn; and where it has herders in a
  rainforest, their generic tent is of felt.
- **The sheet's colours are not the viewer's.** It tells materials apart, and is for shape.
- **Eight shapes, eight figures.** A village of a hundred houses repeats each a dozen times; a crowd, each figure.
- **The animals' colours are the shader's coats.** No coat it has is a white fleece, a red comb, a pig's bare skin or
  a donkey's grey, and its patterns follow a tint no record chose: cattle, zebu and llamas come spotted. The animals
  were looked at on their sheets, which have one brown, and not in the viewer.
- **Animals about the houses only stand and walk:** hens do not peck nor pigs root, and nothing lies down. A dewlap
  or a mane is left off when a head goes down.

## How it was checked

By the agent that built it (Claude Code), on one machine, in November 2026:

- `npm run validate`: no errors and no warnings, on 3,423 entities, 16,061 claims and 1,642 sources; 1,115 claims
  have their `quoted` step.
- `npm run typecheck`, and `npm test`: 730 unit tests pass.
- `npm run build:world` (build `0d5f596e43be0199`) and `npm run test:build`: 104 tests pass.
  `npm run test:reproducible` passes: the world built again means the same.
- **Every quote of every source whose text is kept under its source's name,** in one run of `quote-check --dry-run`
  over 254 texts: 1,866 of 1,940 found. Of the 74 not found, 72 are of the Animal Diversity Web's in taxon records
  this slice did not change, whose pages were not kept, and one is of Harappa's start, as before; the last is the
  alpaca's length, whose account is kept as a text of its own, and was found in it. No `quoted` step was written by
  hand.
- **Browser tests,** drawn in software, on a port of this session's own: the `globe` and `city` groups, 143 tests,
  all pass, the goldens unchanged, on the last build and the viewer as it stands. `landscape.spec.ts` has the new
  test of a house in its yard and a village with its hall and its ditch. And the `city-views` group, Rome at full
  quality, 6 tests, all pass, its goldens unchanged: the shader Rome shares has a second table of surfaces now.
- **Looked at,** on this machine's GPU ([look-landscape.mts](../../viewer/test/look-landscape.mts)), from before a
  house's door and from over its settlement: a hamlet of East Anglia in 1300; a homestead of Bengal in 1800; a camp of
  the Mongolian steppe in 1200; a village of North China in 1850; a Yangshao village of 4000 BCE; a Maasai kraal in
  1885; a Bedouin camp in 1830; a camp of the northern Plains in 1800; a farmhouse of Edo Japan in 1750; a village of
  the Nile delta in 1500 BCE; a town of Hindustan in 1600; Uruk in 3000 BCE; Tenochtitlan and Tlatelolco in 1519. And
  on their sheets every tradition's house (`dwelling-sheet all`) and each of the sixteen animals.
- **Looking found, and this slice mended:** eaves that hung to the ground; a farmhouse's gable and its width put on
  round houses and on houses round a court; pit houses standing at full height; huts of poles and of snow drawn as
  drums; a roof on posts with no posts; a seated figure sunk in the ground; a ring village half a kilometre across; a
  bare trodden disc at the middle of homesteads that stand apart; a spiral in every cluster of houses; the sky seen
  through a hedge; a yard's wall round a house that is its own court; a town of huts on a lattice, then houses
  standing in their neighbours, on a grid and along lanes; two cities laid over each other; a block of five
  households with one door; and a city whose low houses were not drawn from far off, which a comparison with the
  sixteenth slice's viewer showed and no test had.
- **What a frame costs.** The same nine scenes were drawn by the sixteenth slice's viewer and by this one, at
  1600 × 900 and full quality on this machine's GPU (an Apple M3 Max, not the look book's reference), twice each, and
  timed by the viewer's own profiler. Its totals swing two-fold between loads of one scene by one viewer (the steppe
  of Mongolia, where nothing changed: 45 to 70 ms), so they say nothing by themselves. Within a load, the pass that
  draws meshes took the same time against a full-screen pass before and after, in every scene, within what an
  unchanged scene swings by; so did Rome's forum, whose shader this slice added to. What the detail adds is triangles
  close by and no instances: beside a village of the Nile 39,000 where there were 12,000, over Tenochtitlan 520,000
  for 370,000, a hamlet of East Anglia 639,000 for 635,000.
- **Not checked.** Nothing was read by a second reader, or by a person. The frame-time budget
  (`frametime.spec.ts`) needs its reference GPU and was not run. The animals were looked at on their sheets; in the
  viewer only a dog by a tent and an animal in a yard were seen, and no herd from close by. No look was taken at
  Pataliputra's wall or at an Inuit camp from close by: the script found no settlement near where it looked. Where
  the lifeway model has foragers and the excavators have villages, as in Iroquoia and among the Pueblos, and where it
  has herders in Borneo, the generator's plain shelters and tents are still drawn, and no house of a tradition.

## Next

- **How many, for a part of a house:** a way to say that some houses of a tradition had a porch, a byre, a chimney, a
  second storey, as `prevalence` says it of the whole house.
- **Words for what had none:** a storage pit, an altar in the open, a stair to a roof, opposed doors, a stove.
- **A town's own things:** the shrines, halls and markets its tradition names, on lots of their own; and yards
  behind the houses of a town's rows.
- **A yard on a slope,** stepped or following the ground.
- **Smoke,** from the holes and chimneys the records now name.
- **The lifeway model,** where it parts from the excavators: it still decides who gets a house at all.
