# Parity: closing the gaps between the evidence and the picture

Status: proposal, November 2026. Nothing in it is built. It follows the first round of visual gaps
([VISUAL-GAPS.md](VISUAL-GAPS.md), section 7) and a reading of the code behind every gap that round found. It
orders the work that would bring the viewer's picture of a place and a time to what the evidence says of it, by
how much of the picture each piece changes. Most of the work is already named somewhere: in the order of
[SCENES.md](../SCENES.md), of [LIVING-WORLD.md](../LIVING-WORLD.md) and of
[HUMAN-LANDSCAPE.md](../HUMAN-LANDSCAPE.md), and in the slices' "Next". This ranks it by what twelve views
showed, says why each gap is there, and adds what none of those lists has.

## 1. What parity means

A brief says what a person standing at a place and a time would have seen, item by item, each from a source.
The viewer is at parity with a brief when every item is one of two things:

- **drawn,** from a claim, a dataset or a model that the world holds and the panel can name; or
- **plainly not known:** drawn as the generic thing, and said to be.

So parity has two sides. Visually, the picture shows the thing. Evidentially, the world holds what the picture
rests on. A thing drawn from a constant in the renderer is not at parity, and neither is a thing the world holds
and nothing draws.

**Where it stands.** Of the round's 167 items, one frame could test 131, and the viewer drew 41 of them: under a
third. By layer:

| Layer | Could be tested | Drawn | | Layer | Could be tested | Drawn |
|---|---|---|---|---|---|---|
| polity | 6 | 6 | | water | 10 | 2 |
| relief | 14 | 8 | | people | 10 | 2 |
| cover | 30 | 13 | | weather | 8 | 2 |
| ice | 7 | 3 | | sky | 6 | 2 |
| geography | 4 | 2 | | life | 19 | 1 |
| | | | | substrate | 17 | 0 |

Twelve views are a small sample, and a lopsided one: no town, no coast, no forest's interior, no high mountain.
The ranking below should be read with that in mind, and section 7 says how it is tested again.

## 2. What reading the code found

Five machine readers went through the generators, the build and the viewer with the round's verdicts in hand, and
rebuilt several of the round's scenes in memory to count what was in them. Three findings shape the plan more than any
one gap does.

**Much of the missing evidence is already in hand.** Three sources the build has pinned hold what several gaps
lack, and the build does not read it:

- **ETOPO 2022's 60″ grid** is fetched, and served averaged six by six to 0.1°.
- **Beyer et al. 2020** carry monthly cloudiness, relative humidity and wind speed, and a biome, a leaf area and
  a productivity, for each of their 72 times. **Li et al. 2022** carry monthly winds and surface albedo. Only
  temperature and precipitation are read from either.
- **The Paleobiology Database** gives each collection's environment, its lithology and its measured ages, under
  CC0. The land and sea snapshots ask for none of them (`show=coords,strat` in
  [pbdb.ts](../../tools/world/src/pbdb.ts)); the Hell Creek's snapshot keeps the first two, and nothing reads them.

**Some gaps are defects,** not missing layers: a limit, a threshold or a word read two ways. Section 3 lists them.

**Some are the round's own.** Its cameras stood where no visitor arrives, and four of its reasons were wrong
about the cause while right about the picture. Section 6 says what was corrected.

## 3. First: what is broken

These are not ranked. Each is a defect against a design already written, each is small, and several stand in the
way of the ranked work. They close a handful of the round's gaps directly, and more than twelve views could see:
no scene anywhere can show ground above 3,200 m.

| Defect | Where | What it does |
|---|---|---|
| Heights are cut at ±3,200 m | the scene generator's `encode`: heights as 16-bit decimetres | the Safed Koh's crest (p08), and every high range, is a flat top |
| Beyond 16 km the ground's cover ignores its height | the terrain's shader | a far range has no treeline and no snow (p08) |
| Animals of open ground are kept off ground barer than 0.7 | the generator's habitat test, `open` | a desert is 0.92 bare, so no gazelle, hare, horse or ox is placed in one (p09, p12) |
| `edge` is the water's edge to the generator and the forest's edge to the records that say it | the habitat test; Cervidae, Felidae, Giraffidae | deer, cats and giraffes stand only between 1.8 m below and 1.1 m above a water's level, so nowhere in a scene with no water |
| Floating plants are sown on dry ground | the generator's floating layer | wherever ground lies up to 1.6 m under the origin's height, water or not |
| The fossil list's *Homo sapiens* is placed as a wild animal | the atlas's list, drawn by the scene | about 390 hominin bodies within 2.5 km at p09, where the people layer puts about 60 people and draws no person |
| Pasture is painted one green in any climate | the terrain's shader; [settlement.yaml](../../world/generators/people/settlement.yaml) | six tenths of each camp's land: the olive desert of p11 |
| The cloud layer stands 1,400 to 2,400 m above the sea, not the ground | the sky's shader | an eye above 1,400 m has no cloud at any cover (p08's stood at 1,666 m) |
| Willow, poplar and elm take one broadleaf body, which keeps off wet ground | [broadleaf.yaml](../../world/plans/broadleaf.yaml), `wet: -0.9` | riverside trees avoid the river |
| An animal with no size of its own is sized across its clade's whole range | [spec.ts](../../world/generators/life/spec.ts) | a gazelle 0.56 m long, a raccoon dog 1.75 m |
| A herder or a forager never takes a tradition's dwelling | the settlement generator | every herder has the generic felt tent, where the Mongolian ger is written |
| The viewer's life tier always reads unknown | `resolveWorld` in [main.ts](../../viewer/src/main.ts) passes no life | the panel says less than the atlas holds |
| One PBDB row is misplaced at its source | collection 90684: a cave in Bermuda, stored at 64.72° E | petrels and shearwaters reach an Afghan valley (p08): an overlay here, and a report to the PBDB |

## 4. The work, ranked

**By what the eye meets:** how much of a frame a thing governs, in how many of the round's cards, and whether
its absence leaves the picture empty or makes it false. Not by the work each takes. The count of gaps is given
beside each, and it is not the rank: a herd is one item, and so is the ground it stands on.

| | Work | Cards | Gaps | Of a frame | Evidence |
|---|---|---|---|---|---|
| 1 | [The ground](#1-the-ground-what-it-is-made-of) | 10 of the 10 at eye level or from the air | 16 | the lower half; all of it from the air | deep time: one new PBDB snapshot. Today: geology and soils, licences to read |
| 2 | [The sky, the weather and the season](#2-the-sky-the-weather-and-the-season) | 8 | 9 | the upper half, and the light and colour of the rest | in hand: Beyer's months, Li's winds |
| 3 | [The setting the rocks record](#3-the-setting-the-rocks-record) | 3 of 5 in deep time | 10 | the whole frame: lake or forest, land or sea | the same snapshot as 1 |
| 4 | [Plants](#4-plants-where-they-stand-which-they-are-what-they-look-like) | 7 | 9 | most of what covers the ground | in hand for 120 kyr; pollen and living floras to bring in |
| 5 | [Animals](#5-animals-a-visitor-meets-from-lists-right-for-the-time) | 7 | 17 | small, and where the eye goes | the PBDB's measured ages and habits; living faunas to bring in |
| 6 | [Relief](#6-relief-the-skyline) | 3 | 6 | the horizon, where there is one | in hand: the 60″ grid. Uplift histories to write |
| 7 | [Water](#7-water-lakes-small-rivers-dry-beds) | 3 | 3, and 4 under item 3 | where the place has it | in hand: the drainage's lakes, the months' runoff |
| 8 | [People](#8-people-houses-in-view-crops-herds-and-themselves) | 3 of 4 in the human era | 12 | focal | traditions and crops to write; bodies for domesticates |
| 9 | [The globe from orbit](#9-the-globe-from-orbit) | 2 | 6 | the disc | in hand: months, anthromes. Records to write |

Two of the round's ninety gaps are left out: fire (p03's burnt ground) and the weather of one year (the snow of
the winter of 1090), which is finer than any climate field.

### 1. The ground: what it is made of

**Saw.** Every card at eye level or from the air expected something of the ground, sixteen items in all, and
none was drawn: red soil with lime nodules, quartz sand, gravel sheets, gypsum, cracked mud, sandstone and
boulders, loam. The ground is one smooth surface in the tones of its climate class.

**Why.** The renderer has the materials. Within 260 m of the eye it blends soil, litter, mud, sand, gravel and
rock ([RENDERING.md](RENDERING.md), step 2). What chooses among them is the climate class, the slope and the
wetness beside mapped water: rock by slope, sand by the share of bare ground, gravel by bare ground and slope,
mud by wetness, litter under a canopy. No field, model or record says what rock or soil a place has.

**Build.**

1. **A substrate layer,** answering in tiers as every layer does ([resolve.ts](../../core/resolve.ts)): for a
   place and a time, shares of a short vocabulary of surface materials, and a colour where a source gives one.
2. **Deep time, from the rocks.** The lithology of the PBDB's collections near the place: `lith` and `env` added
   to the land and sea snapshots, a weight for each material on each patch of the atlas, in tiers by distance as
   the lists are. This is one snapshot with items 3 and 5.
3. **Today and the Holocene, from maps.** Geologic units with their lithology and age, and soils, as tiles
   fetched for the place in view, as river reaches are. Candidates, none read into the manifest yet: Macrostrat
   ([DATA-OUTLINE.md](../DATA-OUTLINE.md) has it "CC BY (check)"; its own pages state CC BY 4.0 and ask that the
   original maps be credited); SoilGrids 2.0 (catalogues list it CC BY 4.0, and an earlier release was under the
   ODbL, which may not come in, so ISRIC's own terms are to be read); the Global Lithological Map (no licence
   found).
4. **Carried back.** A mapped unit's lithology holds at any time younger than the unit, on its plate, where a
   soil is evidence for the Holocene only. That rule is a model with a record, and its limit is stated: a unit
   since buried or stripped was not at the surface.
5. **Drawn.** The substrate enters a scene's spec as a patch and a second mask, as people's fields do; tones by
   material take the place of tones by climate class; the renderer gains the materials it lacks (a crust of salt
   or gypsum, mud cracked into polygons, a pavement of pebbles, silt); and stones, boulders and outcrops stand on
   the ground as instances, with a budget of their own.

**Evidence.** Evidence where a collection or a mapped unit is near, a model where one is carried in time or
from a neighbour, generic by climate class elsewhere as now, and the panel says which.

**Limits.** Most of the round's substrate items were said of a region. For two deep-time cards no collection
lies within hundreds of kilometres (p05, p06): there the ground stays generic, plainly.

### 2. The sky, the weather and the season

**Saw.** A cloudless sky at two in the afternoon in the Tihama's summer rains, fair-weather cloud in a winter
monsoon, a deep blue sky over the Sahara's dust, a plain at 35° N green in January, no snow on the globe in
December.

**Why.**

- **Clouds take nothing from the world.** `gen:earth/clouds` thresholds seeded noise by a fixed profile of
  latitude, with `inputs: []`: the same at every age, month and hour. A scene takes six tenths of the globe's
  cover over it, and never more than half the sky. Over four of the round's views the globe's cover was exactly
  zero, as it is over 69% of the cells between 10° and 40° N.
- **Haze and wind are constants** of the renderer.
- **The month moves only the snow line and the sun.** A scene's tones are picked once, by the year's climate
  class. Snow reaches the terrain's shader only, so trees stay green under it and water open. The globe has no
  month at all.

**Build.**

1. **The month's weather, as a model:** cloud cover, haze and wind for a place and a month. Cover from Beyer's
   cloudiness where it reaches; before it, from the month's rain and temperature by a stated rule, held to
   Beyer's where both answer. Haze from humidity; dust from dryness and wind. Its parameters are choices, and
   its record says so.
2. **Clouds, version 2,** reading that model, on the globe and in a scene alike, as RENDERING.md's step 7 keeps
   them one: no cap at half the sky, a deck of overcast, a base that stands above the ground, and haze and dust
   as the sky's inputs.
3. **The day's course.** Cloud that builds through the afternoon of a warm, wet month is the generator's
   invention, marked as one, with the visit's hour as its clock.
4. **The season on the ground.** A monthly index of growth out of the water balance, which already runs the
   months, blends the ground's and the low plants' tones between green and cured. Trees that shed stand bare:
   that needs a leaf habit on a taxon, a claim like its size, written by agents. Without one a tree stays in leaf,
   and says so. Snow lies on plants, and still water freezes.
5. **The season on the globe.** A month in the globe's frame, and for each node and keyframe a mask of the
   months with snow, written by the build.

**Evidence.** A model throughout, as the climate runs are: `model` where a run's months answer, `generic` where
only the latitude does.

**Limits.** A climate is not a day. At p12 the field's July has 6 mm of rain, so a sky drawn from it is nearly
clear there too: the botanist's thunderstorm was one afternoon's weather. Such an item stays a note on the card.

### 3. The setting the rocks record

**Saw.** The round's worst card. At 123.7 Ma the viewer draws a rainforest of tall conifers 632 m up, where
rocks 15 km away record a salt lake the sea at times entered, under an arid sky: eight of that card's fourteen
items. At 485 Ma it draws a plain where the nearest rocks of the age are marine. At 291 Ma its plain lacks the
ponds the beds record.

**Why.** Nothing near a place can compete with a field. Climate answers `model` or `generic` only, and
geography `model` wherever a field covers the time. At p04 the climate is the nearest node of Li et al.'s run,
with 2,455 mm of rain a year; its class is rainforest, and the cover table gives that class all forest and no
bare ground. Heights are the nearest PaleoDEM keyframe's. The fossils themselves are placed on the PaleoDEM's
land and sea. The design already decides the principle ([WORLD-MODEL.md](../WORLD-MODEL.md), section 9.2):
"the finer evidence wins locally, the field is rebalanced around it, and the difference is reported". SCENES.md
plans this as step 3 of its order, and it is not built.

**Build.**

1. **The snapshot,** with items 1 and 5: `env` and `lith` on every collection.
2. **A setting on each patch of the atlas:** the environments its collections name (channel, floodplain, lake,
   lagoon, delta, dunes, shore, reef), weighted and tiered by distance and by how well each is dated to the bin;
   and from the lithology, the climate's sign: evaporite and gypsum for arid, coal for wet, tillite for ice.
3. **An evidence tier** for climate and geography where a setting is near. A scene's spec takes the setting,
   and the generator draws it: standing water of the setting's kind, a cover moved toward what the rocks say (a
   dry sign caps the canopy), a height brought to the water it stood beside. The correction is a model with a
   record and limits, never an edit of the field.
4. **The checks the outline lists,** as tests that report: climate against lithology, biomes against fossils,
   land and sea against marine and terrestrial collections. Each lists the nodes the rocks contradict, and the
   model's `disagrees` holds them.
5. **Later, the wider compilations:** lithologic indicators of climate (Boucot et al. 2013; the outline has the
   licence as "?"; the copy digitised for Cao et al. 2018 is offered with no licence found, and a third party's
   upload is listed CC BY 4.0: to be read), and Macrostrat's units.

**Limits.** A collection is dated to a stage, and a setting changes within one: p03's shelf was sea and land by
turns, and p04's ground was lake, river plain and lagoon in succession. A scene draws the setting most of the
bin's collections name, and says the others.

### 4. Plants: where they stand, which they are, what they look like

**Saw.** One shape scattered evenly where the rocks say patches each of one kind (p03). Trees that do not
change up a slope (p08). No reeds, willows or acacias along water. A woodland where the nearer pollen says
sagebrush steppe (p06). Not one bush of a flora a botanist listed (p12). Conifers as tiered spruces where the
fossils are scale-leaved shoots (p04).

**Why.**

- **A stem's kind is an independent draw.** The canopy's share is the class's, varied by one noise 640 m wide.
  There are no stands, no slope and no strip along water. Up a mountain the amounts change, and the kinds do not.
- **Few bodies.** Willow, oak, elm and poplar are one broadleaf. Low plants are meshes within 20 m only.
- **The lists hold fossils only.** Of the Holocene's 1,740 patches, 1,236 have no plant within reach, and
  their stand-in is the stage's commonest body worldwide for the climate class: pines for the Sahara's trees.

**Build.**

1. **Structure in the generator:** a term for each taxon's patches, so that kinds stand in stands; a strip
   along water, flowing or dry (with item 7); each taxon's liking for wet ground and for a climate, so that what
   grows changes up a slope; an understorey beyond 20 m.
2. **Growth forms** for what the round missed and `forms-wanted` ranks: a scale-leaved conifer, a podocarp, a
   thorn tree, a shrub of dry ground, reeds and tall grass.
3. **The vegetation of the last 120,000 years:** Beyer's biome, leaf area and productivity, held and unread, as
   the cover's model in place of the climate class. Then pollen and plant remains into the atlas (Neotoma; the
   outline has it CC BY), and today's land cover for today's shares (ESA WorldCover; CC BY in the outline).
4. **Living floras,** licence by licence, as LIVING-WORLD.md's step 8 plans.
5. **Stand-ins from within reach, or none:** the nearest by the cost overland, and where nothing is in reach,
   the generic plant of the class, said to be generic.

### 5. Animals a visitor meets, from lists right for the time

**Saw.** Twelve items of animals the atlas lists, and none to be seen in any frame. Lists thousands of years
out of date: the green Sahara's hippopotamus in 475 CE; elephant, giraffe and rhinoceros in the Nubian Desert of
1482. Petrels and a river dolphin in a mountain valley. Rhinoceroses standing in on a continent of marsupials.

**Why they are not seen.** They are there, and too far. Density is Damuth's rule times a stated twelve, and
placement is uniform. A herd is a knot: sixteen horses within 14 m. One group of each kind is set within 340 m
of a scene's arrival point, and the round's cameras stood 4 to 24 km from it. At p07 the frame held 99 animals,
the nearest 143 m off, and 23 horses at 334 to 500 m, each five pixels long. From eye height, all the ground
beyond 100 m is a band twelve pixels deep. Fliers always fly, and an animal of the canopy stands on the ground
under it: the PBDB's life habits reach the atlas's bins and are dropped before the scene.

**Why the lists are wide.** The Holocene is one bin of 11,700 years, and every row in it carries only the
interval's ages. A row counts as "here" by distance alone, however loosely it is dated: *Elasmotherium*, dated
2.58 to 0.129 Ma, is "here" at 1.83 Ma. A taxon is listed if any row lies within 2,200 km overland, with no
test of habitat. Only a taxon's end worldwide removes it. The atlas reads the 10 Myr climate runs even in the
last 120,000 years.

**Build.** The lists first: a wrong animal in plain sight is worse than a right one unseen.

1. **Ages.** The PBDB's measured ages in the snapshot, a span on each entry of a list, and "here" only for a
   row dated mostly within its bin. The hippopotamus rows behind p09 carry radiocarbon ages of 7,700 to 2,500
   years before present, a thousand years and more before 475 CE; how many rows carry such ages is not yet known.
2. **Reach.** The region's tier gated by habitat and by likeness of climate; animals of water only where the
   scene has water; the late Quaternary's climate where it reaches.
3. **Ends by region.** A taxon's last record in a region as a claim, as the megafauna's extinctions already are
   for five regions.
4. **Encounters by block.** One group of each kind set in every block of about a kilometre, seeded by the
   block, as the arrival's is now; herds spread as herds; animals at water; birds perched and animals in the
   crowns, by the habit the atlas carries.
5. **A lens.** The field of view as a control and a link's parameter, so that a herd 400 m off can be looked at.
6. **Living faunas,** with item 4's floras.

### 6. Relief: the skyline

**Saw.** The Safed Koh, 4,700 m high and 30 km off, as a low wooded ridge (p08). A level horizon at 1.83 Ma
where the Taihang should close the view (p07). No granite hills on the Nubian plain (p11), and no gullies
anywhere.

**Why.** The crest is inside the drawn ground: a scene has three grids, of 10 m out to 6.4 km, 50 m to 32 km and
800 m to 480 km. The field loses it. `field:earth/relief` is the 60″ grid averaged to 0.1°, about 11 km: the
range's highest node is 3,714 m where the 60″ grid reaches 4,484 m, and between nodes the range is one plane.
The two defects of section 3 do the rest. Below a cell there are two terms of noise, and dunes; erosion, step 4
of SCENES.md's order, is not built. Before 798 ka, the reach of the sea-level stack, the PaleoDEM answers at 1°
and every 5 Myr, and nothing carries today's ground back on its plate.

**Build.**

1. **The 60″ grid as a finer level** of the relief's tiles. Then finer still where the outline has a licence
   (SRTM's 30 m) and a view asks for it. A finer grid restores a range's shape more than its height: along
   p08's heading the 60″ skyline stands 5.5° up, the present plane 5°.
2. **Erosion below the cell,** so that valleys lead to the rivers that drain them, and a piedmont has gullies.
3. **Today's relief carried back** before 798 ka, as a model: the PaleoDEM as each cell's mean, today's finer
   ground on its plate as the shape within it, for as far back as a range's record says it stood. It needs
   uplift histories as records (the one range written, the Himalaya, has none) and a sea level before the stack,
   and it says where it is a choice.

### 7. Water: lakes, small rivers, dry beds

**Saw.** No Surkhab (p08), no river leaving the Taihang (p07), and wadis that are nothing at all (p11). Under
item 3, no lake and no pond. Four items of plants and animals wait on water: a crocodile, riverside trees,
reeds and water plants.

**Why.** No lake is drawn in any scene: the drainage's lakes (500 km² and more) and Natural Earth's are on the
globe and in the relief's mask only, and a scene skips GRWL's lake segments. A river is GRWL's, 30 m wide and
more, or a reach of the drainage, kept where 2,000 km² drains (50,000 in deep time); below that a scene with the
world's water invents none. A reach's flow is the year's mean, and any flow is drawn as water: p11's reaches
carry about half a cubic metre a second, and come out as streams four to five metres wide in the Nubian Desert.

**Build.** Lakes in scenes, from the drainage and from today's (the eighth slice's "Next"). The drainage
routed on the finer relief with a lower threshold, after item 6's first step. The months' runoff, so that a
river has a season; a bed that is dry is drawn dry, in sand and gravel (with item 1), with its line of trees
(with item 4). Losses along a river (also the eighth slice's "Next"). The scene generator's version 7, the
migration of an invented river's bends, is in a working tree as this is written, and this work follows it.

### 8. People: houses in view, crops, herds and themselves

**Saw.** At the round's best-documented point (p12), one flat green field: no millet three metres tall, no date
palms, no banks or water on the fields, no hut in view and no one at work. Herders with no camels (p09, p11).

**Why.**

- **The houses are there, and seldom in a frame.** p12's scene has hamlets about 1.2 km apart. One stood 81 m
  behind the camera; the nearest in the frame was a kilometre off and two pixels tall. A scene's arrival is a
  river's bend or its middle, never a settlement.
- **A field is a disc of flat tones** round its settlement: no crop, height, month, bank or channel. `bounds`
  and `terraces` are in the traditions' vocabulary, and nothing draws them.
- **No person or herd is drawn** in a natural scene. HUMAN-LANDSCAPE.md plans both (its order, step 6). Rome's
  kit has a figure and a crowd; cattle, camels and horses have bodies at the family's level, and no domestic
  kind has its own.
- **Traditions are few.** The 37 written name 43 of ArchaeoGLOBE's 146 regions, and none is written for Yemen,
  the Sudan or Afghanistan. Settlements are a jittered grid that reads water only to keep off it.

**Build.** A scene that arrives at a settlement where people lived. Crops as plants: a tradition's crops with
their heights and months, from sources, standing through the plants' instancing. The bounds, terraces and
channels the vocabulary has. Herds on pasture and people at work, with bodies for the domesticates, held to the
dates and places of their domestication records (47 are written). Settlements placed by water. Traditions for
the regions `dwellings-wanted` ranks and the three the round met, with herders' and foragers' dwellings among
them. Sites as evidence (its order, step 7): a ruin, a mine or a well as a record a scene draws.

**Limits.** The round measures this least well: its sampler chose no town.

### 9. The globe from orbit

- **Snow by the month,** with item 2.
- **Land use in the default picture** (p10): the anthromes' cropland and villages blended into the land's
  tint, where today they are a layer to switch on.
- **Before the plate models reach** (p01): the land's share from a sourced claim, in place of the placeholder
  0.15 of [generic-land.yaml](../../world/generators/earth/generic-land.yaml); the later Paleoproterozoic
  glaciation as a record, beside the Makganyene; the sea's colour as a claim on the planet's phase.
- **The Sun's brightening in the globe's light** is a question, in section 9.

## 5. The order of building

The rank says what matters most to the picture. The order of building follows what unlocks what.

1. **Section 3's defects.**
2. **Three changes to the build, each feeding several items:**

   | Change | Feeds |
   |---|---|
   | A PBDB snapshot with `env`, `lith` and `ages` | 1, 3, 5, and 7's standing water |
   | Beyer's and Li's unread variables, kept by the importers | 2, 4 |
   | The 60″ grid as a level of the relief's tiles | 6, 7 |

3. **Items 1, 2 and 3 together.** They touch different code (the terrain's materials; the clouds and the sky;
   the atlas and the spec) and can be built side by side.
4. **A second round** (section 7), before the rest.
5. **Items 4 to 9,** in rank, 4 and 5 sharing their sources.

Beside these, three kinds of work that are not code:

- **Licences to read** before anything is promised: Macrostrat, SoilGrids, the Global Lithological Map; the
  lithologic indicators of climate; Neotoma, WorldCover and GBIF's datasets; SRTM.
- **Records for agents to write,** each a bounded set: the leaf habit of taxa; uplift histories of ranges; last
  records by region; traditions with their crops; bodies for domesticates; sites.
- **Versions.** Each change to what a generator makes is a new version with its witnesses recorded again, and
  most steps change the golden images.

## 6. What the reading corrected in the round

Eight entries of [verdicts.yaml](../../tools/gaps/rounds/1/verdicts.yaml) were corrected, and the round's counts
with them (26 gaps held and not drawn, 11 not held):

- **One verdict.** p01's ice was given as held and not drawn. The world's one glaciation of the era ends before
  2,425 Ma by its preferred dates and is rightly not drawn at 2,258 Ma; the brief's ice is a later one the world
  does not hold.
- **One owner.** p11's olive ground is the settlement generator's pasture, not the scene's cover.
- **Six reasons.** The horses and shovel-tuskers "not drawn" were in the frame, a few pixels long. The gazelles
  and hares were kept out by the rule for open ground. p03's seed ferns were drawn, a fifth of the stems, and
  could not be told from the conifers. p09's specks on the horizon were not tents.

For the next round's method:

- **A point is shot on four headings.** A hamlet 81 m behind the camera is not a gap.
- **One camera of each point is the scene's own arrival,** which is what a visitor first sees: from about 12 m
  up, by the look book's first view, where the round's eye stood level at 1.6 m.
- **A card says how far its camera stood from the arrival.**
- **A sample of the verdicts "held and not drawn" is read against the code,** as these were. The picture can
  say that a thing is missing, and seldom why.

## 7. How each piece is judged

- **The first round, again.** Its twelve views are shot on the new build, and the items a piece owns are
  judged again by a reader other than the one who built it. The measure is the share of testable items drawn:
  41 of 131 now.
- **The look book** takes five of the round's views (p04, p07, p08, p09, p12), so that each pull request shows
  its before and its after on one sheet, with its frame times.
- **Each piece's own tests:** a generator's checks in aggregate, a model's record with a check against evidence
  it does not read, the budgets of frame time, instances and triangles.
- **A second round** after items 1 to 3: twenty-four points, the sampler mended as VISUAL-GAPS.md's section 7
  says (towns by the cities' lists, fewer views from orbit in the deep Precambrian), and the method of section 6.

## 8. What it keeps

- **No facts in the renderer.** It decides how gypsum looks, never where gypsum lies.
- **No picture painted by a learned model** (RENDERING.md). The round's expected pictures stay a yardstick's
  illustration, out of the world, the build and the viewer.
- **Every layer answers everywhere, in tiers.** A new layer adds its case to `resolve`, and `coverage.json`
  counts it.
- **Evidence corrects a model through a record:** a claim, an overlay on a row, or a model with its own record
  and checks. Never an edit to a field's values.
- **Licences are read before data comes in,** and a dataset marked "check" or "?" in the outline is neither.

## 9. Decisions and open questions

- **Encounters by block** are a second allowance for a visitor's sake, beside the density's factor of twelve.
  Should the generator's record state it as one, with its size?
- **How far back may today's relief be carried** where no record says when a range rose: through the
  Quaternary only?
- **Should the globe dim under the young Sun?** The third slice says it does not, and a scene is exposed as an
  eye adapts. Following the luminosity would close p01's item and darken four billion years of the globe.
- **A figure's dress and tools are facts.** Is a generic figure drawn wherever no tradition's record gives them?
- **Does a setting from the rocks replace the climate's cover outright,** or blend into it with distance from
  the collection?
- **Where should the substrate's vocabulary come from:** a geologic map's own classes, or a short list of the
  project's that each source is mapped onto?
