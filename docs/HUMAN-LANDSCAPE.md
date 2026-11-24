# The human landscape: zoom in anywhere and see how people lived there

Status: the plan and what is built of it, November 2026. The [eleventh slice](slices/ELEVENTH-SLICE.md) builds its first
steps, and the [sixteenth](slices/SIXTEENTH-SLICE.md) fills it in: whom each tradition housed, towns with streets and
walls, cities drawn from their own records, the animals people kept, people, boats and paths
([plans/LIFEWAY-RENDERINGS.md](plans/LIFEWAY-RENDERINGS.md)). It does for people what [LIVING-WORLD.md](LIVING-WORLD.md) does for life: at any place on land and any time since
10,000 BCE, the settlements, houses and fields of the people who lived there, drawn from what is known and honest about
which is which. It is the anonymous landscape, the villages and farmsteads nobody wrote about one by one. Named places,
Rome's monuments and the first cities, stay records of their own, and a city slice draws a city's fabric as Rome's is.

## The idea

**A settlement is a function, not a file.** As a living scene is, the people of a scene are made in the browser from a
few small, sourced inputs, and nothing they make is stored:

```text
HYDE 3.2 (people, land use)  →  Anthromes 12K: every 5′ cell's class, 73 times        the lists of cities (Chandler, Modelski)
ArchaeoGLOBE: 146 regions × 10 times, how each way of life was spread                  the settlements the world has records of
                                                                                       traditions: of building and of husbandry, by region, time and way of life
            ↓ the build: tiles of 5′ cells, the regions drawn into them, the assessments, the cities, the traditions
model:people/lifeways: at a place and time, how people lived, how many, and how sure that is
            ↓ a few tiles and lists, in the browser
gen:people/settlement: settlements, houses of a tradition's form, towns with streets and walls, fields, pastures,
                       herds, people, boats, paths
            ↓
drawn in the living scene, on its ground, around its rivers, its trees cleared where the fields are
```

Four questions, each with one answer that scales.

## 1. Were there people here, and how many?

HYDE 3.2.1 is the only reconstruction of where people lived, year by year, over the whole Earth since 10,000 BCE. The
world reads it twice:

- **Its people**, added up to 1° cells (`field:earth/population`), for how many.
- **Its anthromes** (`field:people/anthromes`): Anthromes 12K classes each 5′ cell of HYDE 3.2 into urban, villages of
  rice, irrigation, rainfed crops or herds, croplands, rangelands, woodlands and treeless lands with few people, and
  wildlands with none, by thresholds on its people and the share of its land in each use. Its classes are bands of
  density: a village needs at least 100 people to the km², residential land 10, populated land 1.

A scene's 5′ cells take their 1° cell's people in proportion to their class's band, so a scene's houses add up to HYDE's
people. A class is a reading of HYDE's model, not a map anyone drew, and HYDE's own range is 75% either way at 1 CE.

**Cities** come from two lists of cities with their people through time, Modelski's for the ancient world and
Chandler's to 1975, as Reba, Reitsma and Seto placed them on the map (`field:people/cities-ancient`, `field:people/cities`).
They are evidence of a kind HYDE's grid does not have: at 5′ HYDE has no Uruk in 3000 BCE, Tikal in 700 CE or Cahokia in
1100, and the lists do.

**A city the world has a record of** (`kind: settlement`) is drawn from the record: where its `location` puts it, under
its name of the time, with the people a `population` claim gives it for about that time, the houses a source counted
(`houses`), the ground it covered (`settlement_area`) and the layout its `town_form` states. A list's figure stands
where the record gives none for the time, and is kept beside the record's where it gives one. Of several estimates for
one time the record's preferred one is drawn; Tenochtitlan in 1519 is Calnek's city, not Chandler's.

## 2. How did they live?

The anthrome says what at least a fifth of a cell's land was used for, where it was. Where it says nothing (people in
woodland or open country, too few or too scattered to use a fifth of it), **the archaeologists say**: ArchaeoGLOBE asked
255 archaeologists how widespread foraging, pastoralism, shifting and continuous farming were in each of 146 regions at
ten times, and whether there were cities (`field:people/land-use-assessment`). The most widespread of them is the way of
life drawn (`model:people/lifeways`):

| Pattern | Where |
|---|---|
| A city, towns | urban and dense cells, and the lists' cities |
| Villages | village classes: rice, irrigated, rainfed or pastoral |
| Hamlets, farmsteads | residential and populated croplands; woodland where farming is the region's way of life |
| Shifting cultivators | woodland where shifting cultivation is |
| Herders' camps | rangelands, and open country where herding is |
| Foragers' camps | remote land where foraging is, or where nothing more is known |
| No one | wildlands |

Each answer says how sure it is, in the tiers every layer answers in:

| Tier | What it means | What a click says |
|---|---|---|
| **Evidence** | a list of cities puts a city here, or the region's archaeologists say this way of life was there then | which list, or what the archaeologists said |
| **Model** | only HYDE says it, or the archaeologists disagree | where they disagree |
| **Generic** | HYDE has people and nothing says how they lived: foragers stand in | that it is a stand-in |
| **Unknown** | no land, or before the anthromes' first step | nothing is drawn |

The two readings disagree, and the world says so rather than choose. Where the archaeologists found no farming, HYDE's
anthromes almost never farm; but where they call farming widespread, the anthromes farm a twentieth of the region or
more in only about a third to a half of those regions. Every build counts it again (`coverage.json`, `landscape`).

## 3. What were the houses like?

**Every house has a form, and the regions' traditions fill every gap.** A building tradition is a record
(`tradition/building`): where it was (`extent`, the ArchaeoGLOBE regions its sources place it in), when (`start`, `end`),
whom it housed (`lifeway`: foragers, herders, shifting cultivators, farmers, townspeople), and as sourced claims, its
dwelling (plan, size, walls, roof, floor), how its houses stood together, how many lived in each, its fields, and how
its towns were laid out. A narrower tradition is a member of a broader one and says only what differs. At a place and
time the most particular tradition that holds there *for the way of life of the people there* draws the houses: a
herder's tent for the camps of herders, not for the farmers of the same region. Where none is written for a region's
shifting cultivators the house of its farmers stands in, and the other way round, and says so: the model tells the two
apart only by a survey's answer for a whole region. A tradition that was the house of a part of a region's people says
so (`prevalence`: a few, some or most of them), and is drawn for that part of the region's 5′ cells, the rest in the
next tradition's house or the generic one. Where no tradition holds, a generic house for the way of life and
the climate stands in, and says so. Agents write them, region by region; [DWELLINGS.md](DWELLINGS.md) is the brief.

**A house is drawn from every part its claims state.** Beside its plan, size and materials a dwelling says where its
door was and which way it faced, its windows, how its smoke left it, how its walls were finished, a porch, a veranda,
a byre under its roof, how high its floor stood on its posts or how deep it was dug, how steep its roof was. Each is
drawn: a roof as thick as thatch is, a frame of timber with its panels, a ladder to a floor on posts, a hatch and a
ladder where a house was entered by its roof, a low passage into a house of snow. What the claims leave unsaid is the
generator's own house of the way of life and the climate, as far as that fits what they do say: a round house takes no
gable, a court no farmhouse's width. And no two houses of a tradition are drawn alike: a dwelling is drawn in eight
shapes, each with sizes of its own within the ranges its claims give, which is the generator's and no record's.

**A house stands in its yard, and a settlement has what its tradition names.** A tradition's `outbuildings` say what
stood by the houses: a granary, a byre, a pen, a cookhouse, an oven, a well, a rack, a stack, a shrine, a house to
meet in, each a household's or the settlement's. A household's are drawn in its yard with its house, within what its
tradition says enclosed the yard; a settlement's among the houses or at their edge. Its `settlement_form` says whether
its houses stood in a ring or in rows, round open ground, and what stood round them all: a fence, a hedge, a
palisade, a bank, a ditch, a wall. That they stood there is the tradition's claim; how many where no source counts
them, and where each stands, is the generator's.

**Farming households have a way to the fields.** In version 7, compact hamlets and villages grow side lanes
from a through lane, with small groups of compounds sharing the approach to their doors. Where a tradition encloses
the settlement, its boundary follows the occupied lots and opens where the field tracks cross it. Dispersed holdings
leave cultivated ground between yards. A stated facing or layout takes precedence. The lanes, entrances and plot
access are procedural. [Farming layouts](../world/generators/people/settlement/lanes.ts) In version 8, enclosures
and town walls are extruded as continuous terrain-conforming curtains with roofed gatehouses where lanes and streets
pass through, fields follow domain-oriented seasonal parcels (`tradition/agriculture`) with 3D fieldworks and hillside
terraces, and settlements carry procedural everyday activity (stalls, altars, kilns, smoke plumes, carts, and field work).

**A town has streets.** Its houses stand on lots, back to back in blocks: on a grid with a main street each way
through the middle, along lanes that wander, or with water in some of its streets; a square may lie at its middle; and
round it a wall with gates and towers, a rampart, a palisade or a moat. A lot is as wide as its house and a way past
it, and deeper than wide where its ground allows, the house at its front: houses line a street, and a house wider
than the ground its town gives it is drawn as small as its lot, and says so. Along lanes a house fronts its lane as
the lane runs there, and no house stands in its neighbour; where two cities of the lists would take the same ground,
the one that comes first keeps it. Which kind of streets is a `town_form` claim, of the tradition
that housed its townspeople or of the city's own record. Where neither says, the generic town is drawn, lanes and no
wall, and the panel says so. A city too thin on the ground for streets, a hectare to a house, has none.

**The animals people kept** are a record too, a husbandry tradition (`tradition/husbandry`): which animals, as taxon
records, whose way it was, where and when. Each is drawn with its taxon's body and size, as a wild animal is: those
that graze in herds, on the pasture of people who herd and at the edge of the houses of people who farm; the rest about
the houses. Which animals is the tradition's claim. How many is nobody's, and the generator says so.

**People, boats and paths** rest on no record at all. A few people are by the houses of every settlement, standing,
walking, carrying, sitting, at work, a child among them; a boat floats on water deep enough beside one; and a path
joins each settlement of people who stayed put to its nearest neighbours, so that a scene has its scale and its ways.
The same few figures are drawn everywhere, in plain cloth, and a click says they are the generator's.

**They go about, and their animals feed and move on.** Those who stand, walk or carry each have a way of their own
(`gen:people/settlement` version 4): to the door of another house of the settlement, or to a well, an oven or a
threshing floor it had, and back, clear of every house and of every enclosed yard but their own; those who sit or
kneel at work stay. The kept animals go as the wild ones of their body plan do, a herd out on its pasture and what
is kept about the houses among them. The renderer moves each along its way by the visit's clock, with nothing kept
from one frame to the next ([plans/RENDERING.md](plans/RENDERING.md), step 5). Who goes, where to, how fast and how
long they stay is the generator's, and no record's.

## 4. How is it drawn?

- **In the living scene.** The settlement generator runs in the scene's worker, after its ground and before its trees:
  where people cleared fields, pastures and yards, no tree stands.
- **Keyed by the world.** Settlements are seeded by the world's 5′ cells and the anthromes' step, so two scenes that
  overlap put them in the same places.
- **Where in its cell** (version 9, [settlement/sites.ts](../world/generators/people/settlement/sites.ts)): a cell's
  settlements stand where people looked for a place to live, near fresh water and above its floods, on level ground a
  little up from the bottom of a valley, on the better soil and near a town, by chance in proportion to how good the
  place is; no two nearer than the cell's spacing allows, across a cell's edge as within it; and gathered loosely round
  a few of them. They are of many sizes within their range, the larger in the better places. A cell's people still
  live in the cell, as the world says; only where in it is the generator's, and a crowded cell's lean toward its
  crowded neighbours, so that a cell's edge is no line on the land.
- **Fields grow over the land** from each settlement's houses, through the ground least effort to reach and farm, until
  they are as large as its people farmed or the walk too long: level, dry and better ground first, along the contours
  of a slope, along the water and along the land's grain elsewhere, and never in the water or on ground too steep. Two
  settlements' fields meet where walking to either is as far; settlements just beyond the scene's edge grow theirs too.
- **Houses as instances**, one mesh for each dwelling, shape and detail, as the bodies of the living scene are, ranked
  so that a far view draws the top of the list a near view draws in full, and within the frame's budget. A house's
  yard is part of its mesh, so that a village of homesteads costs no more instances than a village of houses; from
  far off a house is a block under its roof. A town's wall, its towers, gates and water, and a village's fence or
  hedge, are short pieces drawn the same way, along the line the generator lays; the animals people kept are drawn as
  the wild ones are; the paths are one ribbon laid on the ground.
- **What a house is built of is a surface the renderer draws:** thatch in its courses, mud plaster runnelled by rain,
  limewash stained at its foot, a frame of timber and its panels, logs, boards, rough stone, woven mats, felt, sewn
  hides, cloth of hair, turf, snow, shingles, tiles. Each is laid in the house's own frame, so that it stays with the
  house however it is turned. That a wall was of mud is its tradition's claim; what colour the mud was is the
  renderer's, and no record's.
- **The ground is trodden round each house**, and among houses that stand together; little grows there.
- **A house has relief, close by**: a wall that is built up is as thick as its kind where a door or a window is cut
  through it, the opening set back under a lintel, with a sill or a threshold; a wall of earth, turf or dry stone leans
  in as it rises; a flat roof's walls rise past its deck as its parapet. That a wall was of mudbrick is its tradition's
  claim; how thick mudbrick is drawn is the generator's.
- **Fields painted on the ground, and sown close by**: the generator gives where they are; their plots are laid out by
  the tradition's field system (strips, blocks, paddies flooded within their banks, swidden plots), once, for the
  ground's colour and for what stands on it ([core/plots.ts](../core/plots.ts)). A plot under a crop has the crop
  standing on it close by, in rows along the plot: one plain stand of upright blades, the same everywhere. Which crop
  grew is no record's here, and none is named; a click on it says so.
- **On the globe**, the anthromes' classes in the legend's colours, under *Settlement* in the *Layers* menu; and a click on
  land says how people lived there, from all of the above.

## What it will not do

- A house, a village, a field: none of them was there. Only their numbers, their way of life and their type rest on
  anything, and a click says which. That one house of a tradition differs from the next, where a thing stands in its
  yard, where a fence runs and where its ways in are: all invented. So is where in its 5′ cell a settlement stands and
  where its fields end: the water and the ground are the scene's, but the soil they weigh is a noise, and nothing
  records which places people chose.
- What a tradition says of its house is drawn for every house of it. A porch that some houses had, a byre that the
  poor shared with their cattle and the rich did not, a village wall that was "often" there, are drawn for all or left
  in a note, until a record can say how many.
- A thing with no word is not drawn: a storage pit, a stair to a roof terrace, the two doors of a cross-passage, a
  floor half of earth and half of boards. The records' notes keep them.
- HYDE's people within a country rest on its allocation rules, and its anthromes on thresholds: a cell near one is a coin
  toss. Before 1500 CE its numbers are rough, and its farming falls well short of the archaeologists'.
- ArchaeoGLOBE's regions are made from today's provinces and are as large as a country; a tradition named in a region is
  drawn over all of it.
- The lists of cities lean to the cities historians wrote about, and their figures differ from later archaeologists' by a
  factor of two or more. A city has streets and a wall as its tradition or its record says, and every street's line,
  every gate's place and its outline are invented; it has no temples, palaces or districts of its own.
- The model's ways of life are coarse. It calls the people of grazed land herders and of land the archaeologists farmed
  without continuous fields shifting cultivators, region by region, so a tradition written for farmers reaches only
  those the model calls farmers, or shifting cultivators through the stand-in. Where the model has foragers and the
  excavators have farming villages, as in the American Southwest before 1750, the villages are not drawn.
- How many animals, people and boats there were is nobody's claim, nor is anything they do: a person goes to a door
  or a well and back by straight lines, round and round, the same at every hour and in every season, and never along
  a path to the next settlement, to the fields or indoors. The roads people built, the Roman roads among them,
  are not drawn in a scene yet, nor are boundaries, or the seasons of the fields.
- The world after 1850 and before 10,000 BCE is left as it was: a tradition with no end runs to the present, and no
  model says where people were before the anthromes begin.

## The order

1. **The substrate:** the anthromes, the assessments, the lifeway at any place and time, on the globe and in the panel.
   *Built.*
2. **Settlements in scenes:** houses, fields and pastures from the lifeway and HYDE's people, cities from the lists.
   *Built.*
3. **Traditions as records**, with a brief, and a first batch by region. *A first batch is written.*
4. **More traditions,** by agents, from `npm run world -- dwellings-wanted`, until every region, era and way of life
   that HYDE peoples has one. *Under way: each says whom it housed, and every build counts how many people a tradition
   houses, by time and way of life (the coverage page).*
5. **HYDE's land use as grids:** cropland, rice and irrigation at 1°, to hold each scene's fields to HYDE's share of
   cropland, not only to the class's.
6. **Paths** between settlements; **livestock** in the pastures; **people** in the villages; **boats**. *Built.* The
   Roman roads where Itiner-e has them are not in scenes yet.
7. **Sites as evidence:** dated, excavated settlements as records, so that a scene near one draws it there. *Built for
   the settlements that have records: a city is drawn from its record's people, houses, ground and layout.*
