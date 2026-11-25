# Twentieth slice: a town of its people's own settlements

Status: built; see *How it was checked* for what was and was not run. It builds the second node of
[plans/MODELS.md](../plans/MODELS.md#the-settlements-form), the settlement's form, from Angkor's case. The
[nineteenth slice](NINETEENTH-SLICE.md) gave Angkor its people and its measured density in the right places. But the
generator drew every town the same way: plots packed along lanes, one house to a plot, on ground trodden bare. At
Angkor's density that made a town of large bare plots with one generic courtyard house each. The evidence has
households on their own mounds, each with a pond, gathered in communities round a temple and its reservoir, scattered
among the rice fields.

It adds:

- **A town's fabric** (`model:people/settlement-form`, [core/fabric.ts](../../core/fabric.ts)). A town is `compact` or
  `dispersed`, as a town form's new word `fabric` says, its record's or its townspeople's tradition's; where none says,
  it is compact, as before. A dispersed town is made of units, each one of its tradition's settlements, as far apart
  as the town's density leaves room for. Where the density leaves too little ground between them, the town is compact
  after all.
- **Units drawn as their tradition's settlements** (the settlement generator, **version 12**, `layOutUnits`). Each unit
  is laid out as a village of its tradition is, with its houses, its lanes, what the tradition says a settlement and a
  house had, and its own fields of the region's use. Units stand on a lattice of the town's own metres, named by their
  place in it, where the growth model has their ground built at the scene's time. Nothing of a dispersed town's own
  ground is trodden.
- **A city's fields of its region's use.** A city's fields were all rainfed; they are now of the scene's own use, as
  its region farmed: paddies about a city of the rice lands.
- **The Khmer house of the Angkorian period**
  ([angkorian-khmer-house.yaml](../../world/entities/people/traditions/angkorian-khmer-house.yaml)), a member of the
  Southeast Asian house on piles, for farmers and townspeople in 802–1431. From Zhou Daguan
  (1296–1297): houses of thatch only, raised on piles, their size by their household's wealth, a pond to each house or
  one to two or three, a temple or a tower in every village, and a temple's roof of tiles. From Klassen et al. (2021):
  village-level communities on earthen mounds round a temple and its reservoir, about a hundred families of five, and
  the city as a low-density landscape of fields and settlements. From Carter et al. (2018): house mounds of about 25 by
  38 m, and scattered small temples, ponds and house mounds among the fields. Its town form says `fabric: dispersed`.
  All its quotes were found in the texts by script.

## Running it

```sh
npm run build:world
npm run dev    # http://localhost:5173/?t=851.6&lat=13.31&lon=103.974&d=1.00024&h=10&v=60&hour=10&mo=8
```

## Pass criteria

The criteria are this node's in [plans/MODELS.md](../plans/MODELS.md#the-settlements-form) and the slice's own, each
with what this slice's build (`067ca0a0`) found. One is not checked, and says why.

| Criterion | Where it is checked | Found |
|---|---|---|
| A town whose form says it was dispersed is drawn as its tradition's settlements, each with its houses, what its tradition says a settlement and a house had, and its own fields | `v12.test.ts`: *draws a dispersed town as its people's own settlements among their fields, each keeping its place*; the views below | Holds. Angkor is 248 settlements of its own in 851, 397 in 1000 and 304 in 1200. Each holds about a hundred Khmer houses on piles, thatched, among rice fields, with ponds by its houses and a tiled shrine and a pond of its own. Its panel says "its own settlements set apart among their fields, no wall". |
| The households the units draw add up to the town's people | the same test, within six tenths and three halves of them; `scene().people.cities[].units` in the viewer | Holds, to within an eighth. The units hold 125,240 people for the town's 111,695 in 851, 201,180 for 198,157 in 1000, and 153,425 for 143,104 in 1200. They are spaced for the town's density at its height, 32 to the hectare. In 851 its density was 29, so its units stand a little closer than its people then would put them. |
| The open share is what the density leaves | `core/fabric.test.ts`: *makes a dispersed town of its tradition's settlements, as far apart as its density leaves room for* | Holds. At Angkor's height a unit takes about 15.5 ha, 424 m from the next. Its houses' squares, 31.5 m on a side, take 64% of that ground, and the other 36% is open between the units. |
| A unit keeps its place and its name through the town's life | the same `v12.test.ts` test: every unit standing in 1000, when the town was smaller, stood in 500 | Holds in the test. Angkor's units are on a lattice of the town's own frame. The lattice stays put when the centre moves from Hariharalaya to Yasodharapura in 889. |
| A town too dense for its units to stand apart is drawn compact, whatever its form says | `core/fabric.test.ts`: *draws a dispersed town as a compact one where its density leaves no ground between its units*; `v12.test.ts`: *keeps a dense town compact even where its form says it was dispersed* | Holds. |
| A town whose form says nothing of its fabric is drawn as before | the unit tests and the build's; Rome in 100 CE, below | Holds, except for a city's fields, which now follow its region's use. Rome in 100 CE is the same picture to the pixel, with 103,614 houses. A city whose region grows rice, or irrigates, now has fields of that kind. |
| The node is scored on held-out evidence | — | **Not checked.** No measured plan of a dispersed town is written in the world. Chevance et al.'s plan of Mahendraparvata (2019) is the first candidate. |
| A scene of a dispersed town is drawn within the frame budget, 16 ms at 1600×900 | the look tool's frame times, the median of ten frames on one GPU | **Not in every view.** Two of the five views of Angkor are within it, against one of five on master. Yasodharapura in 1200 takes 15.5 ms from 1.5 km up (22.4 on master), 15.8 ms from 150 m (24.9) and 19.1 ms near the ground (18.9). Hariharalaya in 851 takes 16.6 ms from 150 m (14.1) and 19.9 ms from 1.5 km up (29.1). Another run of the same views took 29.0 ms in that last one, so these times are good to a few milliseconds at best. |

## What it changes in a scene

At Angkor in 1200, laid out from each build as the build tests lay out a scene (flat ground, no water):

- **The town's 143,104 people** were 59,585 houses on master, two or three people to a house, each on its own plot in a
  town trodden bare. They are now 303 settlements of the town's own, holding 30,770 houses of five people each.
- **The countryside's people,** about 154,000 in both builds, were 17,620 farmsteads of one to three houses on master.
  They are now 303 villages of about a hundred houses. The Khmer house's tradition says a settlement held about a
  hundred households, and it holds for the farmers of its region from 802 to 1431.
- **The fields** of the town are of the region's use, rice, where a city's were all rainfed.

From 150 m up, Hariharalaya in 851 and Yasodharapura in 1200 are thatched houses on piles, each with its pond, standing
apart among rice fields, crossed by lanes. On master both were a bare mass of courtyard houses. From 1.5 km up the town
is no longer a beige disc beside its fields: its fields run through it. Near the ground at Yasodharapura the camera
stands in a rice field with houses on piles about it, where on master it stood among the walls of courtyard houses.
Before and after shots of three of these views are in [docs/images](../images/), `angkor-dispersed-*.jpg`.

A village whose tradition sets its houses more than about 24.5 m apart is no longer trodden bare between them (version
12, `garden_lot`). That reaches the Khmer house's villages and the Linearbandkeramik longhouse's (16 to 40 m apart).

## Decisions

- **The fabric is the evidence's word, not the density's.** Angkor's households, at its measured density of about 28 to
  the hectare, take a little more than half its ground on their mounds; a Mesopotamian city's courtyard houses packed in
  their blocks take about as much. A village pattern does not tell them apart either: sixteen traditions house
  townspeople in `nucleated` or `compound` settlements, among them the courtyard houses of Mesopotamia and North China.
  So a town is dispersed only where a town form says so.
- **A unit is a village of its tradition.** It is drawn by the same code as the villages of the countryside, so its
  houses, lanes, shrine, ponds and fields are those its tradition's claims give, and no new drawing was written for it.
- **Units keep their places.** Their lattice is the town's at every time, and a unit stands or does not by the growth
  model's cut, as a plot does in a compact town.
- **A unit holds about its tradition's number of households,** by a number of its own between seven tenths and thirteen
  tenths of it. The town's denser centres are not drawn as fuller units: Angkor's centres and its metropolitan area
  differ by the region's spread, not by its units.
- **A village whose houses stand far apart keeps its gardens.** Where a tradition says its houses stood more than about
  24.5 m apart (600 m² to a house, `garden_lot`, a choice), each house keeps its yard, with gardens and fields between
  them. Before, a nucleated village was trodden bare inside its edge however far apart its houses stood, and a town of
  such villages read as one bare mass.
- **A dispersed town's panel says only what is drawn of it.** The words a town form gives for a compact town's streets,
  blocks, square and axis are left out of a dispersed town's text, since its units are laid out as villages.

## Limitations

- **No score.** The node is not yet held to any measured plan, only to its own arithmetic: the units hold the town's
  people, and the open share is what the density leaves.
- **Every unit is alike.** Each holds about a hundred houses of one size on squares of one size. Zhou Daguan's houses
  sized by their household's wealth, and the nobles' larger houses with tiles over their main chamber and family
  temple, wait for the node of houses with their classes.
- **The units are spaced for the town at its height,** so when the town was smaller they hold more people than it had,
  up to an eighth more in 851.
- **A dispersed town's centres are drawn as sparsely as the rest of it.** Its walled centres are units like any others,
  and nothing marks where its people lived more densely.
- **The ground is flat.** The house mounds that Carter et al. measure, and the rectangular reservoirs of the
  communities, are not shapes of the ground. A house's pond is a generic pond.
- **A community's temple is the generator's plain shrine,** 3 m square, roofed with tiles as Zhou says a temple might
  be, and not a tower of brick or stone.
- **The fields are generic.** Rice is drawn as rows of a green crop in dry fields, not as paddies flooded in the wet
  season. That waits for the farming year and the crops.
- **The tradition reaches all of its region.** Region 128 holds Vietnam as well as Cambodia. Until a record of their own
  houses takes them, the houses and villages of Đại Việt and Champa in 802–1431 are drawn as Khmer houses on piles in
  villages of a hundred households. So is all of Cambodia's countryside, though Klassen et al. give that figure for the
  communities of Greater Angkor.
- **A dispersed town draws no wall, streets or square of its own,** only its units and the routes to its cores. No
  dispersed town in the world has such a word yet.
- **The generic works of every farming scene are drawn here too:** a wheelbarrow, straw ricks, a plough and its yoke, a
  cart. No record says which of them Angkor's people had.

## How it was checked

By the agent that built it (Claude Code), on one machine, on 25 November 2026:

- `npm run typecheck`;
- `npm test`, 1,086 tests passing;
- `npm run validate`, no errors and no warnings;
- the new record's quotes found by `npm run world -- quote-check` in the texts they were read in. Those are Zhou
  Daguan's text on Wikisource, Klassen et al. (2021), Carter et al. (2018), Lustig (2009) and Pleiades' record of
  Angkor. The check recorded the `quoted` step on 7 claims;
- a world build from the working tree, not a clean commit (`067ca0a0`), and the build tests on it, 119 passing;
- views of Angkor in 851 and 1200 and of Rome in 100 CE on the GPU, beside the same views of master's viewer on
  master's build (`a42d4a51`);
- the houses of the town, its units and the countryside counted in the viewer's scenes and in each build's layout.

The browser test groups were not run, so their golden images were not looked at. Those of a city whose region grows rice
or irrigates may differ, since its fields follow the region's use now. The frame times are noisy: Rome in 100 CE took
73.7 ms a frame on master's run and 20.9 ms on this one, for the same picture.

## Next

The rest of [plans/MODELS.md](../plans/MODELS.md), each a slice with a held-out score: the farming year from the place's
own months, crops and fields, houses with their classes, water works, kept animals and institutions. Nearer to this
slice:

- a score: Chevance et al.'s plan of Mahendraparvata (2019), its mounds and ponds held out against the units drawn
  there;
- the house mounds and the communities' reservoirs as shapes of the ground, and the temple as a form of its own;
- the walled centres of a dispersed town drawn denser than its outskirts, where a survey measures them;
- a record of the houses of Đại Việt and of Champa, so that the Khmer house holds only where the Khmer lived.
