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
| Relief | elevation, sea level, ice | ETOPO 2022: its 60″ cells around a scene's place, over the 0.1° grid the globe draws (15″ exists); SRTM 30 m | today's ground at the sea level of the time (800 kyr); before that the PaleoDEMs at 1°, with today's shape carried back on its plate through the Quaternary and for as long as a range's record says it stood ([below](#the-grounds-shape)) | landforms by process: hills and valleys cut by water, leading to the rivers; dunes; glacial forms and coasts not yet |
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
- **The Quaternary before them, and the Pliocene:** the PaleoDEM of the time for where the land stood and
  how high, and today's shape within its cells, carried back on its plate: all of it to the start of the
  Quaternary, less and less of it to the start of the Pliocene. Further back only where a range's record
  says it already stood.
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
  valleys lead to the rivers that drain them. Built ([below](#the-grounds-shape)): what a scene invents is
  cut by water run over it, which drains to the sea, to the rivers and lakes the world gives and to the edge
  ([erosion.ts](../world/generators/life/erosion.ts)).
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
- Beyond 16 km the ground's cover is read by its height, each height bearing what its own climate does (below), in the
  colours of the scene's own place: a far range has its treeline, and not the tones of the class its heights are.

## The ground's shape

Since `gen:life/scene` version 10 ([docs/plans/PARITY.md](plans/PARITY.md), item 6). A scene's ground is the world's as
finely as the world has it, and invented only below that
([core/relief.ts](../core/relief.ts), [relief.ts](../world/generators/life/relief.ts)).
`npm run world -- relief <lat> <lon> <time>` prints what a build gives a scene of a place: the elevation it reads, the
shape within its cells, and the highest ground about it with and without that shape.

- **The survey's own cells.** Today's relief is held on a grid of a tenth of a degree, some 11 km, which is what the
  globe draws; its survey, ETOPO 2022, is a sixtieth of a degree, some 1,850 m. The build keeps what the survey has at
  each of its cells less what the relief's grid makes of the place, one byte a cell, in tiles of two degrees wherever
  some ground stands above −200 m and departs from the grid by two metres (`field:earth/relief`, `fine`: 8,129 tiles,
  62 MB). A scene sends for the tiles within two degrees of its place and lays them over the grid: the two together are
  the survey's ground, read straight from one of the survey's cells to the next. So a range thirty kilometres off has
  its own crest and not the mean of eleven kilometres of it, as far as the scene's ground reaches.
- **Carried back.** Before the glacial cycles the elevation is a PaleoDEM, a degree's: where the land stood and about
  how high. `model:earth/relief-carried` lays today's shape over it: today's ground less what the PaleoDEM makes of
  today, its grid of the present, read where the place stands today and turned as its plate has turned since. So
  from 798 ka back to 2.5 Ma, where the PaleoDEM a scene reads is that grid of the present, it stands on today's
  ground as surveyed; and before that on today's ground, raised or lowered by as much as the PaleoDEM's grids say the
  land has risen or sunk since. All of today's shape stood through the Quaternary and none before the Pliocene,
  falling evenly between: a choice, whose two times follow the records of those periods. Within the outline of a
  range whose record says by when it stood at about its present height, all of its shape is carried back to then,
  and before that as much as an even rise from the start of its growth gives
  ([RECORDS.md](RECORDS.md#a-mountain-range)). Eight ranges have such records: the Himalaya's crests are carried back
  to 16 Ma, the Tibetan Plateau's to 23 Ma, the Front Range's to 35 Ma. The scene's own plate carries its shape. The
  ground of another plate keeps its shape only as far as that plate has not moved against the scene's own since the
  PaleoDEM's grid: all of it at the grid of the present, when none has moved, and none once it has moved a node of
  the relief's grid (`other_plates`). Where the shape stops, at a range's outline or the edge of a plate that has
  moved, its hills and valleys stop there, and what today's ground stands above the PaleoDEM's grid of the present by
  on the whole falls away over a degree, so that no step is left along the line. Where the PaleoDEM has the land
  lower than today, today's valleys would lie
  under its sea; but a valley is cut no lower than the sea it drains to. So ground that is dry today is held above
  the coast wherever the PaleoDEM has land, at a fiftieth of the height it gives the land there and no higher than
  the ground stands today (`valley_floor`).
- **Invented below that.** Under the grain of the world's ground, hills and valleys nobody surveyed. How high they
  stand goes on from that ground itself: the roughness it shows at its own grain (how far each node of it stands from
  the mean of the nodes a grain away either side), seven tenths of it, a feature half as long standing 2^-0.75 as
  high. So a plain the survey shows level stays level, however high it lies, and a range the survey shows rough is
  rough below its cells. Under the survey's cells the features are shorter than a cell; under a PaleoDEM's alone they
  are as wide as tens of kilometres. Over a cell of the world's ground they add nothing to its mean.
- **Cut by water.** What is invented is then routed and cut ten times: the ground is flooded from its outlets upward,
  each node cuts toward the node it drains to, the faster the more ground drains through it, and slopes creep. The
  outlets are the sea, the scene's edge, and the rivers and lakes the world gives, which keep their heights. So the
  valleys lead to what drains them, and about a fortieth of the invented ground is left in hollows where a sixth of
  it would be. Only what is cut below the longest invented feature is kept: the broad slopes are the world's.
- **A modelled river runs down the finer ground.** The drainage gives a river as the nodes of its grid, a tenth of a
  degree apart. Where the scene has the survey's shape, each node is moved to the lowest ground within its cell, and
  the river's course between two is the way that keeps lowest; its water is at that ground's height. A river Landsat
  saw is where Landsat saw it, and needs none of this.
- **Heights are not cut.** The ground's three grids keep their heights in sixteen bits each, in steps as fine as the
  grid's own range allows: decimetres near the eye, on a plateau as on a plain, and a quarter or half a metre where a
  grid holds both a summit and a sea floor.

What reads the ground reads the new one. Each height bears what its own climate does and holds the month's snow
(above), on the scene's own cells and now beyond them; a river's bed, banks and valley walls are cut into it, and a
lake's basin; houses and fields stand on it.

Limits:
- The survey's cells are read two degrees either way of a place, less far east and west toward the poles; beyond that
  the far ground is the relief's own grid. Only tiles with ground above −200 m are kept: a scene of the deep sea
  stands on the grid alone.
- A cell is 1,850 m. A gorge or a summit narrower than that is the survey's mean of it, and what is invented below it
  knows nothing of the rock or the ice that shaped the place: a glacial trough and a canyon come out alike.
- Carried back, a range has today's valleys, though rivers have cut them deeper and glaciers reshaped them since; a
  volcano younger than the time shown stands; and a coast has today's shape where the PaleoDEM's lies near today's.
  The crust that sank under the ice and rose again is left out, as it is through the glacial cycles.
- Carried back, the ground keeps the PaleoDEM's level, so that a scene stands where the globe, the climate and the
  rivers of its time have the land; and the PaleoDEM's grids do not hold a range at the height its record gives.
  Within 50 km of Mount Everest the grid of 10 Ma stands a kilometre above the grid of the present and the grid of
  5 Ma seven hundred metres below it, and the western Alps are a kilometre to a kilometre and a half lower than
  today from 20 Ma to 5 Ma. So a range its record has at about its present height is drawn with today's crests and
  valleys, as much higher or lower (`model:earth/relief-carried`, `disagrees`). The PaleoDEM is read at its nearest
  grid, and its grids are five million years apart: the ground steps at 2.5 Ma, at 7.5 Ma and so on.
- A valley the PaleoDEM's lower land would drown is held just above the coast, and its floor comes out broad and
  smooth, sloping as the PaleoDEM's land does: the Arve below Mont Blanc at 15 Ma. Nothing measured says how high any
  valley's floor stood; and an arm of the sea narrower than a degree, which the PaleoDEM cannot hold, is not there.
- Just before 798 ka the coast is today's, at today's sea level, and just after it the sea's of the time: the ground
  of the two scenes meets, and their shores may not.
- A scene's plate is the one that carries its place to ground of its own today, by today's plates on the relief's
  grid: the PaleoDEM's own grid of plates is a degree's, too coarse by a plate's edge, where the ranges are. The
  plate that grid has at the place is tried first, and then those of the ground round about, out to three degrees.
  Where the ground of two plates lay over the same place at a time, as that of blocks that have since pulled apart
  did, the scene stands on the first of them tried, and the other's ground is not there.
- A range's record gives a height at a basin or a summit, at a time; the model draws all of the range within its
  outline alike. The outlines are loose and editorial. Where the sources disagree about when a range stood, the
  scene follows the claim the default picture shows.
- How much of today's shape stood is read at the scene's own place for what it invents: across the edge of a range's
  outline, the hills invented inside it are as many as outside.
- Before the glacial cycles the drainage's nodes are a degree apart, and a node is moved no further than 6 km to low
  ground: a river then may cross a ridge of today's shape, in a cut the scene makes for it. Small rivers, below what
  the drainage keeps, are still not drawn: an invented valley has no stream.
- The globe still draws the PaleoDEM alone before the glacial cycles: only a scene has the shape carried back.
- Water cuts the invented ground in valleys a node or two wide, with walls far steeper than a hillside stands: a
  hundred metres deep and more where the world's ground is rough. From the air over a range they read as dark slots.
  The cutting has no rule for how steep a wall may stand.
- Hills invented below the world's ground are the scene's own: two scenes that overlap draw different valleys
  below the survey's cells. Seamless ground is the last step of the order.

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
4. **Relief below the field,** by erosion, and today's ground from finer tiles of evidence. Built
   ([above](#the-grounds-shape)): the survey's 60″ cells in tiles, today's shape carried back before the glacial
   cycles, and what is invented below them cut by water. Finer surveys where a licence allows (SRTM's 30 m),
   glacial forms, coasts and streams in the invented valleys remain.
5. **Cover and substrate today:** land cover, soils and geology, licence by licence. The substrate is begun: today's
   topsoil and bedrock at half a degree, and rock units with their ages where Macrostrat has columns
   ([above](#what-the-ground-is-made-of)). Finer maps, rock units for the rest of the Earth, a soil's colour and land
   cover remain.
6. **Season and weather** from the monthly climate. The month's snow and sun are done (above), and a river's season
   ([above](#water-and-what-grows-by-it)); leaf, grass, the weather and the sky remain. The months of cloudiness,
   humidity and wind they will read are kept (above).
7. **Seamless ground,** keyed in the world's coordinates, which the rivers' keying begins.
