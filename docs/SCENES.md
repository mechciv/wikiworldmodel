# Natural scenes: any place, any time

Status: the design, November 2026. Water is the first layer built this way, in the
[eighth slice](slices/EIGHTH-SLICE.md). It extends [LIVING-WORLD.md](LIVING-WORLD.md), which says who lives in a
scene and how they are drawn, to everything they stand on: the ground, the water, the soil, the cover and
the weather.

## What a scene was

Up to the seventh slice a scene was one recipe, written for the Hell Creek and run everywhere:

- **One river, invented.** Whether a place had a river was a weighted coin toss. The river was a curve of
  fixed width (86 m) and bend length (1.5 km) that ran downhill through the scene's middle. Its oxbows were
  arcs scattered near it, and its water was one flat sheet. So the Amazon, the Kansas prairie and the Hell
  Creek had the same river, and none of them had its own.
- **Coarse inputs, at the wrong time.** A scene read the land at whole degrees and the climate of the
  10 Myr runs, at the middle of the atlas's stage. A scene "today" was drawn at the sea level of 385 ka.
- **A place, not a world.** Everything invented was seeded by the scene. The next square of the lattice,
  11 km on, drew a different river.

## The principle

**A scene is the world's fields, downscaled.** It is not a separate world.

1. **Read every layer at the time shown, at the finest resolution anything answers it.** Each layer has
   its own clock: taxa by stage, relief and sea level by keyframe, climate by its runs, and the season by the
   month. A scene is keyed by the keyframes it reads, so the same place and time is the same scene.
2. **Generate only below that resolution.** The generator adds what the fields cannot hold: the bends of
   a river narrower than the line it follows, the hills inside a cell of the relief. It never moves what a
   field already places.
3. **Condition every invented thing on the fields.** Size, shape and kind come from the fields through
   stated rules: a river's width from its discharge, its bends from its width, and braided or meandering
   from its slope and discharge. They do not come from constants tuned for one place.
4. **Hold it to them in aggregate.** Averaged over a cell of a field, a scene gives the field back: its
   mean height, its share of forest, and its river where the drainage puts it, as wide as the law says.
   These are the generator's checks.
5. **Key invented things by the feature they belong to, in the world's coordinates.** A river's bends are
   keyed by the reach and the distance along it, not by the scene. So two scenes that overlap draw the same
   river, and flying from one into the next stays in one world.

## The layers of a natural scene

Each layer answers in the four tiers every layer does (evidence, model, generic, unknown), and each has
its own generator below its finest field.

| Layer | What it reads | Finest evidence today (candidates, licences to be read) | The past | Below the fields |
| --- | --- | --- | --- | --- |
| Relief | elevation, sea level, ice | ETOPO 2022 (0.1° in use; 15″ exists); SRTM 30 m | today's ground at the sea level of the time (800 kyr); PaleoDEMs at 1° | landforms by process: valleys cut by the rivers, hills by erosion, dunes, glacial forms |
| Water | relief, climate, water balance | HydroRIVERS; Natural Earth lakes | the drainage routed over the relief of the time, with runoff from its climate | channels from discharge; meanders, bars and oxbows; banks and floodplains |
| Substrate | the rock record, soils, geology | SoilGrids 2.0 and the Global Lithological Map, both at half a degree; Macrostrat's columns of rock units, which have ages | the rocks of the stage's fossil collections; today's topsoil held through the Holocene, and today's bedrock carried back through the Quaternary; at any time, the units of the column of rock a place lies in, where Macrostrat has one; generic by climate elsewhere ([below](#what-the-ground-is-made-of)) | the ground's materials in patches, with pebbles, cracks and crusts; outcrops and stones in the colour of the rock |
| Cover | biome, transitions, land cover | ESA WorldCover (10 m) | biome from climate; pollen biomes (BIOME 6000) for the late Quaternary | stands, glades and edges; trees along water |
| Life | the atlases, forms | living species (later) | fossils, in tiers | individuals, as now |
| Weather and season | monthly climate | observed climatologies | the runs' months | snow cover, leaf, a river's season, the light |

People's fields, roads and buildings follow the same pattern, and the Roman city already does.

## Across time

What answers a layer changes with the era, and the scene must say which:

- **Today:** the evidence is finest of all. Rivers are mapped reach by reach, and the ground is known to
  30 m. A scene should be almost entirely evidence above 500 m.
- **The historical past and the Holocene:** today's ground and rivers, held, with the changes that are
  recorded: shorelines, deltas, avulsions, drained marshes.
- **The glacial cycles:** today's ground at the sea level of the time. Rivers cross the exposed shelves,
  as the Channel River and the rivers of Sundaland did. Lakes fill where the climate fed them, as
  Bonneville did. Ice covers what the ice sheets covered.
- **The Phanerozoic:** the PaleoDEMs and the climate runs, at 1–2°, routed into rivers as big as those
  grids can hold. The rock record says what the place itself was. A fossil site's collection names its
  environment: channel, floodplain, lake, delta, dune or reef. Where it names one, the scene must draw it.
  This is the deep past's evidence for a scene, and the atlas already reaches it.
- **The Precambrian:** generic ground on the reconstructed blocks, plainly marked.

## Processes, where shape matters

Noise makes texture, not landforms. Where a form's shape carries meaning, it is made by the process
that makes it, at a scale a worker can afford:

- **Rivers:** a river the world gives is wound into the sine-generated curve of real meanders, scaled by
  the channel, with cutoffs that leave oxbows. A river a scene invents, where the world gives it none, is
  made by migration ([meander.ts](../world/generators/life/meander.ts)): a channel whose every point moves
  sideways by the curvature at it and upstream of it, so that bends grow, lean down the valley and cut
  off. Its oxbows are the loops it cut, and the inside of each bend is the ground it swept, a bar crossed
  by scrolls. Later, the same for the rivers the world gives.
- **Hills and valleys below the relief's cell:** stream-power erosion on the generated relief, so that
  valleys lead to the rivers that drain them.
- **Dunes** from the wind of the climate runs, **glacial forms** from the ice's history, and **coasts**
  from the sea level's history: terraces, beaches and drowned valleys.

## The climate at a scene's heights

A climate model's months stand for the ground of its cell. For the deep past's runs (Li et al. 2022), that is the
model's own surface, its surface geopotential as a height. For the last 120,000 years (Beyer et al. 2020), which were
corrected to the climate observed on a half-degree grid, it is the mean height of the cell's land. The build keeps every
keyframe's twelve months at each node with land, with that height, in tiles of 10° (field:earth/climate-at-height). A
scene fetches the tile its place stood in at the keyframe nearest its time, of the finest climate that covers it. Scenes draw so from `gen:life/scene` version 4.

Beside its months each node keeps what else its climate's dataset says of it, each a field of its own, in tiles of
parts (`core/months.ts`, PARTS). For the last 120,000 years: the cloudiness, the relative humidity and the wind speed
of each month, and the year's biome, leaf area and production from a vegetation model, cell by cell of the dataset's
half-degree grid. For the deep past's runs: each month's wind at 1000 hPa, toward the east and the north, and the
surface's albedo. A tile of parts holds a span of the keyframes, so a scene fetches one file of them for each tile of
months, and its spec carries what they say of its node (`climate.parts`). **Nothing draws from them yet:** the clouds,
the haze and the wind are still the renderer's own, and a scene's cover is still the class of its months.
`npm run world -- months <lat> <lon> <time> [month]` prints what a build's tiles say at a place, as a scene is given it.

At any height of the scene, the air is colder by one lapse rate, 5.8 °C a kilometre (model:earth/lapse-rate, from
Loomis et al. 2017), with the same rain. So:

- **What grows changes up a mountain.** Each height takes the Köppen–Geiger class of its own months and grows what the
  cover's table gives that class. The treeline falls where the warmest month drops below 10 °C, and permanent ice where
  it drops below 0 °C. The edge between two classes wanders over the height that 1.5 °C of cooling makes.
- **A scene has a month.** The viewer's Month control (and `mo=` in a link) picks it, and the place's warmest month is
  drawn if none is picked. Snow lies wherever the water balance (model:earth/water-balance) holds at least 10 mm of it,
  in a month colder than its threshold for rain. The sun stands at the month's declination.

Limits:
- One lapse rate for every place, month and time, with no inversions. Glacial mountains come out a little warm, as the
  rate was steeper then (about 6.7 °C/km in East Africa).
- No rain shadows: the rain of a cell is the same at all its heights and on both sides of its hills.
- No leaf or grass seasons: a deciduous forest is drawn in leaf in January. Its phenology wants a source.
- Snow lies on the ground's colour only. Trees stay green under it, and lakes and rivers do not freeze.
- The node is the nearest of a 1° grid, so a scene near a coast can read a node of a model's coast that is not its own.
- The parts are the node's at every height: nothing brings cloudiness, humidity or wind up a mountain.
- No cloudiness or humidity before 120,000 years ago, and none over the sea at any time. The deep past's winds are on
  a pressure level, which lies under high ground: there they are not winds at the surface (field:earth/wind).
- The vegetation of the last 120,000 years has no people in it, and nothing on most of the shelves the low sea bared
  (field:earth/biome-late-quaternary).

## Water, and what grows by it

Since `gen:life/scene` version 8 ([docs/plans/PARITY.md](plans/PARITY.md), items 4 and 7):

- **A river has a season.** The water balance keeps each month's runoff of the soil's surplus beside the year's: what
  the soil, once full, lets go in the months after (model:earth/water-balance). The drainage routes it month by month as
  it routes the year's water, and each reach's months with water in its bed are those in which that slow water reaches
  it at no less than 0.15 of its mean flow (field:earth/rivers, `wet_share`); and every month, where the ground it drains
  gives it 150 mm a year or more (`perennial_mm`), since the water balance lets a soil's surplus go faster than a wet
  basin's ground water runs out. What the rain sends off as it falls runs in floods of a day or two, and between them
  the bed is dry. So a river fed from wet uplands keeps its water across a desert, and a desert's own beds have none.
- **A dry bed is drawn dry.** In a month its bed holds no water, a river has no water in its channel, its oxbows are dry
  hollows, and its bed is bare: loose sand, paler than the plain, with sheets of gravel on its bars. A river whose bed
  holds water in no month is a wash, wide and shallow as a braided river's bed, with no oxbow lakes.
- **The world's lakes stand in a scene** (field:earth/lakes): the cells of the drainage's grid a lake covers, with its
  level, carved into a basin below it, its shore wandering off the cells' edges by a noise of the place, the land just
  beyond rising from it.
- **What grows by water stands along it,** flowing, still or dry: within 12 m of a bank in full and gone by 55 m, more
  trees than the climate keeps away from water, in clumps, and the kinds that like wet ground by it. A kind's liking cuts
  both ways: a willow is nine times as likely by water as away from it, and a reed grows only by water, in its shallows
  too.
- **Kinds stand in stands.** Each kind of a layer is commonest in patches of its own, about 160 m across.
- **What grows changes up a slope.** Each taxon carries the climate its rows lived in, the mean and the spread of their
  places' warmest and coldest months (field:life/community), and at each height the kinds are weighted by how like their
  own its climate is.
- **Shrubs and ferns show from a way off.** The understory as tall as a person is sown as far as the big animals and drawn
  as far as it shows; lower plants stay close by. What floats is sown only on still water.

Limits:
- A month's water is routed in the month, with no time to travel: a long river's flood reaches its lower course later
  than it is drawn. A lake that spills passes its basin's water on in the month it comes, with none of a lake's
  steadying of a river's season.
- The water balance's soil lets its surplus go by half each month, so in a basin that gives less than 150 mm a year the
  slow water of a long dry season or a cold winter runs out sooner than real groundwater would. Where 150 mm divides
  the two is a choice. Rivers Landsat saw hold water in every month.
- A lake's shore and depth below the drainage's grid are invented, and only lakes of 500 km² and more are kept. Its
  water is drawn within 34 km of a scene's middle; further off, a great lake's far reaches are the ground at its level.
  Lake Victoria is not among the drainage's lakes, and so not in a scene (docs/slices/EIGHTH-SLICE.md).
- A kind's liking is its rows' places' climate in the whole stage, worldwide, which leans to Europe and North America; a
  stand-in has no rows and likes every climate alike.
- Beyond 16 km the ground's cover still ignores its height, and heights are cut at 3,200 m (PARITY.md, section 3): a far
  range has no treeline.

## What the ground is made of

A scene's ground is made of what the world says it was (`field:earth/substrate`,
[core/substrate.ts](../core/substrate.ts)): sand, gravel, silt, mud, lime mud, a crust of salt, peat or ash, in
shares, with the colours and marks its sources name, and the rock under it. Four things answer, each for the times and
places it covers, and the panel says which:

- **The rocks of the stage's fossil collections** (`field:earth/rock-record`), through the Phanerozoic. A sandstone
  was laid down as sand and a claystone as mud, and what a collection says of its rock's colour, cracks and ripples is
  said of the ground. A collection within 30 km is evidence of the place and decides all of its bare ground. Those of
  the country round, out to 200 km, are a model and decide half. Its materials are drawn sorted across the ground,
  each over the share of it the collections give: gravel in sheets of pebbles on the rises, then sand, silt and mud,
  and a crust of salt in the hollows, each in its own colour or the one the collections name.
- **Today's topsoil** (`field:earth/soil`), held as it is through the Holocene: its sand, silt and clay, and its
  coarse fragments as gravel, from SoilGrids' predictions averaged over half degrees. A model of the place itself. It
  gives way only to a collection at the place, and it names no colour. So its fine earth is drawn as one mixture, a
  shade of the ground its climate gives it, paler where it is sandy and darker where it is clay; and its coarse
  fragments as stones scattered through it, thick in places and thin in others, as many as their share.
- **Today's bedrock** (`field:earth/bedrock`), carried back on its plate through the Quaternary: the class the
  Global Lithological Map gives the place where it stands today. It says nothing of the loose ground. Outcrops, steep
  rock and stones are drawn in its colour: a basalt dark, a limestone pale.
- **The rock units of the place's column** (`field:earth/strata`, [core/strata.ts](../core/strata.ts)), at any time,
  where Macrostrat has a column: in North America above all. A column is the rock succession of an area, each unit
  with the ages it was laid down between. The place is carried on its plate to where it stands today, and is in the
  column whose footprint holds it there. A unit being laid down at the time shown, and not under the sea, is the
  ground: its lithologies by their shares, read by the same words as the collections' rocks, so that the Nugget
  Sandstone of Wyoming is sand and the Opeche Shale of North Dakota a red-brown mud with salt. A lava or an ash being
  laid down is the rock at the surface. Where the column has a gap at the time, the youngest unit from before it is the
  rock under the ground, and nothing is said of the loose ground. The panel names the unit, its ages, its row and the
  work its column was compiled from. A scene sends for the grid of which column a place lies in once, 143 kB, and for
  the one file that holds its column, 119 kB at the most.

A place's loose ground is the first of these to answer: a collection at the place; then today's topsoil; then its
column's unit; then the collections of the country round ([core/substrate.ts](../core/substrate.ts), `firstGround`,
which says why). The rock under it is today's map's through the Quaternary, and its column's before.

Where none answers, the ground is drawn by the climate's class alone, as it was before, and says so. The generator
does not read the substrate: the renderer does, so a scene's plants, animals and river are the same with it and
without. Leaf litter under a canopy, the wet of a bank and steep rock cover the ground as they did.

Limits:
- A fossil collection is where fossils were kept, mostly in beds laid down under or beside water. The ground between
  such beds is not in it, and one collection of sandstone makes a scene's ground all sand.
- A map of today held back knows nothing of what changed: soils since ploughed, drained or buried in dust, a lava
  not yet erupted. The bedrock map gives no ages, so it stops at the Quaternary, and is wrong within it wherever the
  rock is younger than the time shown.
- Half a degree is some 50 km. A scene takes one cell's soil and one class of rock for all of its ground, where a real
  one has wadi floors of silt beside plains of pebbles. SoilGrids is weakest in deserts, and does not know a sea of
  dunes from the plain beside it.
- Where each material lies is the renderer's, by a noise: the amounts are the world's, and the places are not. The
  rises and hollows it sorts them by are not the scene's own relief, and no stones gather on its slopes.
- A column of rock stands for an area, some 150 km across in North America, and does not say where in it each rock
  lies. Its unit is drawn over all of a scene's ground, and two units of one age share the ground alike, whatever
  their thickness. Its footprint is drawn round the middle of its area, and is no geological boundary: a scene at its
  edge may have the rock of the column next to it.
- A column holds the rock that is there today. The youngest unit from before a gap is taken as the rock under the
  ground, which is wrong wherever rock since worn away lay over it, and a granite counts as at the surface as soon as
  its column has nothing younger. Most of what the columns say is of this kind: asked at the middle of a stage where
  the elevation field has land, a column has a gap about two times in three, and a unit laid down on land one time in
  twelve.
- A unit laid down under the sea says nothing of a land. Where the elevation field has land and the column only such
  units, about one time in twelve, the ground stays generic: nothing settles which of the two is right, and
  `coverage.json` counts it.
- A unit's ages are an age model's, with no uncertainty, and a scene takes them as given. Nothing is said where no
  column reaches, which is most of the Earth outside North America.
- A soil's coarse fragments are drawn as stones lying on it. In the soil they are mixed through its depth.
- No stones, boulders or outcrops stand on the ground as things of their own. That would change what the generator
  makes, and wants a version of it.
- What it costs a frame is not measured: the frame-time budget wants its reference GPU.

## What it costs

What is stored grows with the evidence, not with the Earth's area. Global fields are kept at the
resolution of their sources. Evidence finer than the globe needs, such as river reaches, comes in tiles
fetched for the place in view. Everything else is computed in a worker for the view and thrown away.
Each step has a budget, and a test.

## The order

1. **Water,** in the eighth slice: a water balance, routing over the land of any time, today's rivers
   as evidence, and channels drawn from their discharge.
2. **Scenes at the time shown,** with the finest relief and climate. The eighth slice draws a scene at the time
   shown, within its stage, on the 0.1° relief where it covers the time. A scene now reads its climate from the finest
   field that covers the time too, as months at its own heights (below).
3. **The rock record's environments** for deep-time scenes: the PBDB's collection environments read
   into the atlas, and a scene that draws the one its fossils name. The first half is done: every collection's
   environment and rock is in the build by stage, as sites a place can ask for those near it
   (`field:earth/rock-record`, [core/rocks.ts](../core/rocks.ts)). A scene's ground is drawn from their rocks
   ([above](#what-the-ground-is-made-of)); no scene reads their environments yet.
4. **Relief below the field,** by erosion, and today's ground from finer tiles of evidence.
5. **Cover and substrate today:** land cover, soils and geology, licence by licence. The substrate is begun: today's
   topsoil and bedrock at half a degree, and rock units with their ages where Macrostrat has columns
   ([above](#what-the-ground-is-made-of)). Finer maps, rock units for the rest of the Earth, a soil's colour and land
   cover remain.
6. **Season and weather** from the monthly climate. The month's snow and sun are done (above), and a river's season
   ([above](#water-and-what-grows-by-it)); leaf, grass, the weather and the sky remain. The months of cloudiness,
   humidity and wind they will read are kept (above).
7. **Seamless ground,** keyed in the world's coordinates, which the rivers' keying begins.
