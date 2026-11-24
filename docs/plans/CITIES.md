# Cities: every settlement, at any time, drawn from what is known of it

Status: in progress, 24 November 2026: step 1, the growth model of step 2, the town's division of step 3, the houses of
step 4 that a plot carries through its centuries, Rome's move (step 5) and `cities-wanted` (step 7) are built, as the
[eighteenth slice](../slices/EIGHTEENTH-SLICE.md) says, with what each leaves out. It replaces both ways a city was drawn before: Rome's own
pipeline ([fifth slice](../slices/FIFTH-SLICE.md)) and the cluster of houses every other city got
([sixteenth slice](../slices/SIXTEENTH-SLICE.md)). It is written from what a city system has to do, not from what
exists. What exists is kept only where it is what that would build anyway.

The small end of the same system is a hamlet's lanes, parcels, walls and work. This plan takes it in, from an earlier
proposal for living settlements, with an Eastern Han hamlet of 147 CE as its first place.
[HUMAN-LANDSCAPE-REALISM.md](HUMAN-LANDSCAPE-REALISM.md) works on the same ground; [How this meets the other
plans](#how-this-meets-the-other-plans) says how the two fit together.

## Where it stands

Detail is all or nothing. A city is either Rome, drawn structure by structure for one year, or a disc of houses sized
from a population figure.

**Rome** has its own pipeline from records to viewer:

- 96 monument records with `form` claims; the 854 elements of an OpenHistoricalMap (OHM) snapshot, imported as
  machine-proposed records; the 14 regions of Augustus with the Regionary Catalogues' counts.
- Three nested elevation grids made for it alone, at 10 m, 50 m and 800 m.
- `gen:rome/fabric`, which cuts blocks and lots between everything mapped, weighted by the catalogues, for the middle
  of 315 CE, and is drawn from 300 BCE to 600 CE.
- Its own file (`city/rome.json`), its own scene class (`CityScene`), and a reach of 60 km within which the viewer
  draws it and switches the living scene off.

In code it is a singleton:

- The build finds the generator by its id, and takes the first OHM snapshot as the city.
- It finds the Tiber's island by its name, and names its elevation tiles.

So Rome before 300 BCE or after 600 CE has monuments and no houses. A view near the ground jumps from one scene to the
other at 60 km. The generic path never reads Rome's own record.

**Every other city** goes through `gen:people/settlement` in the living scene. That is 1,750 from Chandler's and
Modelski's lists, as Reba, Reitsma and Seto placed them, and the 21 other settlements with records. Each is drawn as:

- a disc or a square about its point, sized from its people at the time shown or from its record's area;
- the houses of its region's townspeople;
- streets on a grid, in lanes or along canals, and a wall where a `town_form` says so.

Everything inside is invented. There is no real outline, no quarters, no monuments and no real streets.

- **A cap on houses.** A city has at most 12,000 houses, so one of a million people is drawn with each house standing
  for about fourteen households.
- **No persistence.** Its outline follows its people at the time shown, so its streets are laid again whenever the
  figure changes.
- **Villages move.** Villages are sited anew at each step of the anthromes.

**The small end** shows the same limits. Take the Eastern Han hamlet in the foothills of northern China in June 147 CE,
at 15:00 (`?t=147.974&lat=36.5681&lon=114.1017&d=1.0002&h=240&v=60&hour=15&mo=6`):

- **Houses stand apart.** The record's preferred reading is a walled hamlet, but each house is given a farmstead's
  ground, so the houses are scattered on bare earth with no lanes between them.
- **The way in is missing.** Paths between settlements stop at their edges.
- **Walls step.** The enclosure is short level pieces on a circle, which step and stack on a slope.
- **Fields don't follow the land.** They are one warped grid of plots, coloured by a hash, which the ground's colour
  and the close crop rows each draw again for themselves.
- **No one is seen at work.** People are dropped below four pixels' height, and they walk short trips with nowhere to
  go.

**Worth keeping**, because a system built from nothing would build them too:

- the 26 forms of [forms.ts](../../world/generators/city/forms.ts), which hold no facts about Rome;
- a record that adopts a map's element;
- lifetimes on each vertex, so that moving the time strip rebuilds nothing;
- the build shipping a plan's inputs, and the browser making its geometry;
- traditions as records, and the measure of how many people they house.

## What the system has to do

1. **Any settlement at any time**, a hamlet of 10,000 BCE or a capital of a million, from orbit to a doorway, with no
   load screen and no seam.
2. **Rest on what is known, and say so**, for every street, wall, plot and house: evidence, reconstruction or
   generated.
3. **Keep a thing the same thing.** A street that stood for a thousand years stands in the same place in every one of
   them, and at every visit. A generated house has an identity a link can name.
4. **Let evidence win locally.** A new record changes what it touches and nothing else.
5. **Be a function of place and time.** Nothing is stepped forward. Any year is drawn directly, and scrubbing is cheap.
6. **One machinery.** Rome differs from a town of the lists only in how much is known of it.
7. **Fit the budget:**
   - 16 ms a frame at 1600 × 900 on the Apple M1 reference, over the largest city of its time;
   - a small download per city;
   - a build whose cost grows with the evidence, not with the number of cities.
8. **Grow by contribution.** A person or an agent raises a city by writing records or by mapping in OHM, and the world
   counts what is missing.
9. **Carry the doubt:** rival population figures, rival readings of a plan, and how unsure the edge of a city is.

## A city in layers that last for different lengths of time

A town does not change all at once:

- its ground and water change least;
- its routes, gates and walls last for centuries;
- its streets and plots outlive the buildings on them, often by centuries;
- buildings are rebuilt every few generations;
- what they are used for changes within a lifetime;
- people move by the hour.

This is the town-plan analysis of Conzen (Alnwick, 1960) and the morphologists after him. It is also the structure of
the system: each layer is made from its own evidence, and conditioned on the layers above it.

| Layer | What it is | How long it lasts | Evidence | Made by, where there is none |
|---|---|---|---|---|
| Ground and water | the surface, rivers, shores, what occupation laid down | millennia, though it rises under a town | surveys, `ground_level`, a tell's height, the world's rivers and seas | the world's fields; `model:people/occupation-ground` |
| Frame | routes between places, gates, walls, bridges, harbours, canals, the core, main streets | centuries to millennia | roads (Itiner-e, records), walls and gates, mapped streets, a plan's axes | routes from neighbouring places and the gates to the core |
| Extent | which ground is built on, and how densely, at each time | changes by the decade | an outline at a time, an area, a district's count, the people | `model:people/settlement-growth` |
| Division | lanes, blocks and plots; fields and their lanes outside | centuries | mapped streets and plots, a plan's grid | the generator, face by face |
| Buildings | what stands on each plot, rebuilt in generations | decades to centuries | records with footprints and forms; mapped buildings | the generator, from the tradition that held when each was built |
| Use and life | who lives where; work, markets, people moving | hours to years | traditions; rarely more | behaviour, going to places the layout made ([decision 11](#11-work-goes-somewhere-and-leaves-a-trace)) |

## The decisions

### 1. One system for every settlement; evidence decides the detail

A camp, a hamlet, a market town and Rome all go through the same models and the same generator. Nothing in code
names a place. Places differ only in how many layers have evidence (the tiers below). A better-known city is drawn
more from its own records and less from the generator.

These go:

- `gen:rome/fabric` ([world/generators/rome/](../../world/generators/rome/));
- the singleton city build ([tools/world/src/build/city.ts](../../tools/world/src/build/city.ts));
- `CityScene` and `CITY_REACH` ([viewer/src/main.ts](../../viewer/src/main.ts));
- `city/<site>.json`;
- the cap on a city's houses.

### 2. Time is lifetimes; a view is a filter

Every element has a start and an end, from a record or from a model. A view at a time draws what stands then.

Nothing is stepped forward from a founding. Each element's lifetime is computed from the evidence directly, so:

- any year is as cheap to draw as any other;
- two visitors at the same time see the same city.

What ends fades over the years either side of its end, as Rome's buildings do now.

### 3. One ranking of the ground makes a city grow and shrink

`model:people/settlement-growth` ranks a settlement's ground once, by how soon it would be built on. It then cuts that
ranking at each time, where the built area reaches the area the settlement's people needed. No step-forward model is
needed: given the ranking and the people at a time, the built ground follows directly.

- **The ranking** is the cost of reaching a place from the core along the frame's routes. The cost goes up for steep
  ground, for ground that floods, and for ground outside the walls while they stand. It goes down near water people
  could draw. People settled first where they could most cheaply reach what they needed: the core, the roads, water,
  safety. A settlement with several cores, such as a town taken into a city or a palace quarter apart, is ranked from
  each. A core is where records put it: its oldest dated structures, its citadel, or else the record's or the list's
  point.
- **The area at a time** is the settlement's people at that time, divided by its density. Density depends on the
  tradition, and falls from the core outwards. A district's count (Rome's insulae and domus) or an outline at a date is
  a constraint the cut must meet.
- **Growing and shrinking** are the cut moving down and up the same ranking, so the ground built first is left last.
  Where ground is left, its plots become ruins, gardens or fields. Walls and monuments keep their own records'
  lifetimes.
- **An epoch begins** where a record changes what the ranking reads, and from then the ranking is made again. Such
  records include a new circuit of walls, a new port, a palace moved, an aqueduct ending, or a city refounded on a
  plan. That is how medieval Rome can come to live in the bend of the Tiber once its aqueducts stop, rather than on the
  hills. That is a check the model has to pass, with its source.
- **The doubt** in the people is a spread in the cut, not another plan. Each member of the population's ensemble cuts
  the same ranking somewhere else, so the uncertain edge is a band of ground that evidence mode can show.

This is a model and not a generator ([RECORDS.md](../RECORDS.md#a-model)). Its output is a claim about the world at its
resolution: whether ground of about 25 m was built on at a time. It can be tested against any outline or area a record
gives, and it is held to all of them.

### 4. The land is divided once; what it is used for changes on it

Fields and town are one division:

- A face of the frame is divided into lanes and parcels when it is farmed.
- When the town reaches it, the lanes become streets and the parcels are cut into plots along their fronts.

So the lines of the fields stay in the town's streets and plots, as they do in real towns. The farmland round a city
and the city are one drawing, which never changes under the visitor.

A planned founding divides the faces it covers anew, on its own grid, from its epoch on: a Roman colony, a Tang
capital, a Spanish grid.

**Everything reads this one division:**

- the ground's colour;
- where buildings stand;
- the crop rows;
- what a click picks;
- where people walk.

Nothing draws a layout of its own. The shader's grid of plots ([core/plots.ts](../../core/plots.ts)) goes.

**A parcel has one state at every distance.** It has a crop, from its agricultural tradition or from a fallback that
says so, a direction for its rows, and a state for the month. That one state is drawn at every distance:

- from afar, as the parcel's colour;
- at middle distance, as the shadows of its rows;
- close by, as stems, leaves and heads of a shape the crop can be known by.

Changing the month changes the stand and the work under way. The parcel's edges and its way in stay where they are.

### 5. The frame's faces are the units of work

The frame is a graph of the lines no generated thing may cross: routes, walls, water, coasts and mapped streets. Each
area it encloses is a face.

- **A face is made on its own,** from its own seed and what lies in it. Both neighbours read the street along their
  shared edge from the frame. So there are no seams to agree, a face can be made without its neighbours, and a new
  mapped street changes only the faces it divides.
- **A large face is divided first** by the lanes of its fields, which are the frame's level below.
- **Every machine finds the same faces.** They are found by exact tests of orientation on the records' coordinates.
- **A face's identity** is the set of edges that bound it, never its computed position.

### 6. Buildings stand in generations on plots that last

Each plot carries a run of buildings, one generation after another:

- **How long each stands** depends on what it is built of, varied by the plot's seed. This is a parameter of the
  generator, said to be no claim.
- **Each is of the building tradition that held when it was built,** so the plot of a Roman insula can carry a
  medieval house and then a palazzo.
- **How much of the plot it covers, and how high it rises,** follow the density at the plot's place and time.
- **How many households a building held** is the tradition's, so a dense city has fewer, larger buildings, not a cap.

### 7. A town's institutions come from its tradition; its monuments from records

A tradition of townspeople says what its towns had, and where. Some examples:

- a temple precinct, a palace, a market square, a forum;
- a mosque and a bazaar, a church, a granary, baths;
- at the core, at the gates, or outside the walls, where the Romans buried their dead.

That is a claim with a source, `institutions`, which is new.

- **Where no record names the real one,** the generator raises one of each, drawn from the tradition's monument forms
  and labelled a reconstruction.
- **A record of the real one,** with its footprint and form, takes its place.

Monument forms become a library by tradition, as houses are. Rome's 26 forms are the Mediterranean part of it.

### 8. What the generator makes is held to measured form

What the generator makes is checked against measures of real towns of the same tradition, not against taste:

- the spread of block and plot sizes;
- the length of street to a square kilometre;
- how many junctions are T-junctions and how many are crossroads;
- how many lanes end blind;
- how much ground is open.

Each measure is a claim of a tradition, read from a study of mapped towns or measured on the plans the world has
(Rome's map, an excavated town). Each is a check on the generator. These measures are what make a medieval Islamic
town look different from a Roman colony from the air.

### 9. The build ships evidence and models; the browser makes the city

For each settlement the build writes a bundle:

- its frame's lines;
- the records that stand in it, with their footprints and forms;
- its plan's skeleton;
- its population series, with their members;
- the growth model's ranking for each epoch, compressed.

A city with only a point and a figure is a hundred bytes. Rome is about what `city/rome.json` is now.

- **Bundles are tiled** by place and time, as markers are ([FEATURE-TILES.md](../FEATURE-TILES.md)), and fetched when a
  view comes near.
- **The browser's worker makes faces** nearest first. It keeps what it made by the generator's version and the face's
  inputs, so a second visit makes nothing.

### 10. One scene, with detail by what the screen can show

There is one local renderer, with no city mode. A settlement is drawn at the detail its size on screen calls for:

| From | What is drawn | Made from |
|---|---|---|
| Orbit and the globe | the built ground of every settlement at the time, as a tint | the growth model's cut, on the globe's tiles |
| A region, 10–100 km | built ground, the frame's roads, walls and water | the bundle |
| Over the city, 1–10 km | each face as a roofscape: its blocks raised to their height, roofs in the tradition's material | the face, coarsely |
| A street, within about 600 m | each building, each monument's form, trees in yards and gardens | the face, finely |
| A doorway | the house in detail, its yard and what stands in it, people at work | the plot's building ([seventeenth slice](../slices/SEVENTEENTH-SLICE.md)); decision 11 |

A face's mesh holds every generation within a window of centuries round the time shown, each vertex with its
lifetime. So the time strip can move within the window without anything being made again.

**Continuous things stay continuous across detail.** A wall, a street and a field's edge are made once, as lines of the
frame and the division. The coarse drawing and the fine drawing of each are the same line, so a distant wall does not
break or jump as the near mesh takes over.

**Detail costs only near the eye:**

- continuous walls are drawn in batches;
- crop rows and props near the eye are drawn as instances;
- far off, a field's state, a group of roofs and the traces of work are drawn cheaply;
- people's movement is worked out in detail only where they can be seen.

The fast-quality setting draws the same layout.

### 11. Work goes somewhere, and leaves a trace

People do jobs with a place to go: a destination from the division, a route along its lanes, tools or a load, a time it
takes, and a result in the scene. Examples:

- tending a row of the crop;
- fetching water from the well;
- cutting a crop and carrying it to a yard or a store;
- goods changing hands at a market;
- gathering at a shared place, where the tradition says there was one.

**Each job's state is a function of the clock** and the job's seed, with nothing remembered, so any hour can be drawn
directly.

**The mix follows the hour and the season.**

**A frozen hour still says what is happening.** Worked strips, worn entries, loads set down and small groups show it,
so a still view from the air reads as lived in, as well as one with the clock running.

**A particular day needs its own evidence.** That jobs were done is the tradition's, and which person does which is
the generator's. A named festival or a market day needs its own record.

## The evidence a city can have

| Tier | What is known | Example | What it decides |
|---|---|---|---|
| 0 | a point, and its people at some times | most of the lists' cities | the extent only, from the model |
| 1 | a record: names, a founding, an end, areas, houses, people, a `town_form` | the 18 first cities | the extent, held to its areas; the town's form |
| 2 | a plan's skeleton: an outline at dated times, walls and gates, the plan's orientation and module, its main streets, its quarters, its core monuments | Teotihuacan's turned grid; Chang'an's walled wards | the frame, the epochs, the grid; the rest is generated within them |
| 3 | its fabric mapped: streets, plots and buildings, each dated | Rome; an excavated town | the division and the buildings, where mapped; the generator only fills |

**Tier 2 is the one to write at scale.** It gives most of what makes a city recognisable for a small part of what tier
3 costs, so it is the tier to write for hundreds of cities.

**A city's tier is per time and per part.** Rome is tier 3 in the Forum in 315, and tier 1 in the Borgo in 1300. Each
layer answers `resolve(place, time)` with its tier ([core/resolve.ts](../../core/resolve.ts)), so the coverage page
shows where a city's drawing rests on what.

**A list's row is tied to its settlement's record by an overlay** (`same_as`), not by distance
([RECORDS.md](../RECORDS.md#a-row-of-a-dataset)).

**New terms**, each added with the first records that need it ([RECORDS.md](../RECORDS.md#a-new-term)):

- **`extent` of a settlement:** its outline at a time (`valid`), drawn in the claim or adopted from an OHM element. The
  note says what was measured: a walled circuit, an excavated limit, a survey's scatter of sherds.
- **In `town_form`:** the plan's orientation and module, and its main streets as lines.
- **`institutions`** of a building tradition, as above.
- **District records** (`open/district`), with an extent and, where a source counts them, their houses or people.
  Rome's regions are the first.
- **A town form's measures**, on a tradition (decision 8).
- **Rebuilding:** a fire, a sack, an earthquake or a flood, as events that affect a settlement or a district. The
  record says whether the rebuilding kept the old streets. London kept them after 1666; Lisbon was laid out on a new
  grid after 1755.
- **Routes between places,** as records or datasets: the Roman roads of Itiner-e (CC BY 4.0, already in the
  manifest) first.

**Where the geometry comes from.**

- **OHM, for any place.** Streets, walls and buildings are mapped in OpenHistoricalMap with their dates, and adopted by
  records ([RECORDS.md](../RECORDS.md#geometry)). So `ohm-snapshot` takes any settlement's bounding box, not just
  Rome's.
- **Not OpenStreetMap.** In many old cores, today's street network is the best witness to the old one, but
  OpenStreetMap is ODbL and may not come in. Instead, a mapper traces the historic streets into OHM with their dates.
- **Excavated plans** are figures in publications. What may be traced from them into OHM is for OHM and the mapper to
  decide.

## The models

- **`model:people/city-population`:** a settlement's people through time, as a band with members. It reads every
  list's figure and every record's claim, and replaces the rules that read the nearest figure within fifty years.
  - Rival estimates are members; the preferred one is member 0.
  - Between figures it interpolates on a log scale.
  - Before the first figure and after the last, it says how far it reaches. The founding and the end bound it.
- **`model:people/settlement-growth`:** decision 3. Its checks:
  - each record's areas and outlines at their dates;
  - each district's count;
  - that within an epoch, the ground built first is left last.
- **`model:people/occupation-ground`:** the ground under a settlement rises as it is lived on, by rubble and refuse.
  That is metres in a city, and tens of metres in a tell of the Near East.
  - Ground at a time is today's surveyed ground, less what was laid down since then, at a rate given by a choice.
  - The rate is held to every `ground_level` claim and every tell's height.
  - So early Uruk stands low, on ground its own rubble later raised, and the Forum lies in its hollow.
- **The ground itself:** about 30 m within each settlement's box, from a public-domain survey. SRTM GL1 covers 60°N to
  56°S, and the manifest already has two of its tiles; north of 60°N needs another survey.
  - It is eased into the scene's ground at the box's edge, as Rome's grids are.
  - A finer survey is used where one is licensed, as TINITALY is for Rome.
  - A survey of today has today's buildings and fills in it. The model above takes the fills out, and a survey of the
    bare ground is preferred where there is one.
- **Water** comes from the world: a river that moved, a harbour that silted, a lake that was drained are records and
  fields the settlement reads. The lakes of the Basin of Mexico are needed before Tenochtitlan can stand in water.

## The generator

The next version of `gen:people/settlement`, for every settlement. For each face, in order:

1. **What the face holds:** the frame on its edges, the records and mapped elements in it, the growth model's ranking
   over it, and the plan's grid if it has one.
2. **Division:** lanes, parcels and plots. Mapped streets and plots stand as mapped, and generated ones join them.
   - Lanes run from the frame's edges inwards, along the contours on a slope, and on the grid where there is one.
   - Parcels lie between the lanes.
   - Plots are cut from parcels along their fronts, with widths and depths from the tradition's measures. Fronts vary,
     side passages are left, and productive plots lie behind the houses.
   - **Ways in:**
     - every plot that is lived on has an entrance from a lane;
     - every lane reaches the frame;
     - a holding that stands alone reaches a track by a turnoff of its own;
     - a route crosses water only at a bridge, a ford or a landing;
     - the approaches to a walled settlement go in through its gates.
   - **Walls and enclosures are boundaries of the division,** not pieces laid one after another. Each is a run with
     its corners and openings, following the ground's profile without a step. Neighbours share a wall. Where a gate
     opens, its jambs, the lane's width, the threshold and the levels of the ground meet.
3. **Lifetimes:**
   - a lane stands from when the first plot on it is built;
   - a plot stands from when the growth model's cut reaches it, until the cut leaves it or an epoch divides it anew.
4. **Buildings:**
   - each plot's generations, each of its tradition;
   - the institutions its tradition gives the core, the gates and the edge;
   - records' structures on their footprints, which take the plots they cover for their lifetimes.
5. **Open ground:** gardens, yards, squares, cemeteries and ruins, with their trees and what stands in them.

Everything it makes has an identity from its slot: settlement, face, plot, generation. A click says what it is, what it
rests on and what was generated. For example: *a house of the Roman insula tradition, 140–260 CE, on a generated plot
of a generated block; the street it faces is mapped (OHM way …)*.

## Rome, moved over

| Now | Then |
|---|---|
| OHM's 854 elements, as records | the same records: walls, gates, bridges, roads and the river in the frame; buildings on their footprints |
| 96 monuments with forms | the same, raised by the same forms |
| the 14 regions and the catalogues' counts | districts whose counts constrain the growth model's density in 315 |
| TINITALY, SRTM and ETOPO grids made for Rome | Rome's fine survey laid over the generic ground; the Forum's `ground_level` held by the ground model |
| `gen:rome/fabric`, for the middle of 315, drawn 300 BCE–600 CE | the generator, at every time from the founding to 1950 |
| `CityScene`, `city/rome.json`, the switch at 60 km | the one scene, and a bundle like any other |

`gen:rome/fabric` is retired when both of these hold:

- Rome's five views on the look-book sheet are at least as good: overview, Colosseum, Forum, Pantheon, sunset.
- Its checks pass on the new generator: each region as dense as the catalogues say, and nothing built on a standing
  monument, a garden, the river or a street.

Rome gains its houses in every century, its shrinking within the walls, and its medieval town by the river. It loses
the jump at 60 km.

## Uncertainty and alternatives

- **Rival figures for the people** are members of one band (above): one ranking, cut at several places.
- **Rival readings of a plan** are competing claims of `town_form` or `extent`, one of them preferred. For example: the
  walled hamlet and the scattered compounds of the Han record, or two reconstructions of a city's walls. The reader can
  switch, and the generator reads the chosen one. Where a reading changes several records together, it is an
  alternative.
- **A generated element is no claim.** It is never ranked or contested: a record that disagrees with it replaces it.

## How it is judged

- **Against evidence:** every outline, area, count and ground level a record gives, by the models' checks. The
  coverage page shows where the model and the records disagree.
- **Against measured form:** decision 8's measures, for each tradition that has them.
- **Persistence:** no street, plot or monument moves between two times it stands at. A city at two times differs only
  by lifetimes.
- **Locality:** a new record changes only the faces it touches. Adding a mapped street to one quarter leaves the far
  side of the city as it was, within the fingerprint's tolerance. Neighbouring loads of a scene place everything in
  the same places.
- **Ways in, by test:**
  - every lived-in plot reaches a lane;
  - every lane reaches the frame;
  - every gate opening can be walked through;
  - no route crosses water except where it may;
  - neighbouring plots share their edges;
  - a settlement's households add up to its people.
- **The places of judging:**
  - Rome in 100 CE;
  - Chang'an in 750;
  - Tenochtitlan in 1519;
  - a town of the lists with nothing but its figure;
  - the Eastern Han hamlet of 147 CE.
- **Speed**, measured on the reference machine at each place of judging against the look book's frame budget
  ([tools/look/views.yaml](../../tools/look/views.yaml), [views.ts](../../tools/look/views.ts)):
  - frame time over the largest city of its time, median and 95th percentile while moving;
  - each pass's time on the GPU;
  - cold descent to a usable view;
  - the worker's time to make a face.

  As detail is added, the moving 95th percentile and the cold descent stay within the range measured before it.
- **Breadth:** before the library of forms and houses grows, the same machinery draws three more kinds of settlement,
  and each reads differently from the air and has places to go on foot:
  - dispersed farmsteads, which keep their holdings apart;
  - a herders' camp, laid out round its animals;
  - a city on canals, with landings and ways by water.
- **The look:** every place of judging, at the look book's distances, against researched pictures of each place, as
  [RENDERING.md](RENDERING.md#the-standard) holds every scene.
  - **Matched views.** Before and after are taken from the same camera: from above, at a gate, and at a field's edge.
    Each pair adds an uncut descent with the clock running, two months at one camera, and a frozen afternoon with the
    interface hidden.
  - **Reviewer tasks.** A reviewer is asked to point to the way in, to name the crop close by, and to say from what
    they see what one person is doing.
- **The measure:** `coverage.json` counts, for each time, the people of cities by tier. `cities-wanted` ranks the
  cities with the most people-years below tier 2.

## How this meets the other plans

**The hamlet is a settlement of tier 1 or below:**

- its tracks and enclosure are its frame;
- its lanes and courts are its division;
- its parcels are its fields.

Its two readings are this plan's competing claims of `town_form`: the record's preferred walled hamlet, and the
dispersed compounds among fields that an excavation found. The region's farmstead class still says how many people the
land carries. Each reading says how the households share the ground.

**[HUMAN-LANDSCAPE-REALISM.md](HUMAN-LANDSCAPE-REALISM.md)** has the same aims at the small end, which this plan
places:

- its continuous walls are the frame's and the division's boundaries;
- its terraced fields and real crops are the division's parcels, with their states;
- its activity is decision 11;
- its own milestones should be built as these layers, face by face, so that the hamlet and the city are one generator.

**Art and research can start with the layout:**

- a crop of the region and time, from its archaeobotanical evidence: millet is a first candidate for the hamlet;
- a small kit at real scale: the crop at its stages, a court and a gate, tools and loads, and poses of work whose
  hands meet what they hold.

Licences and credits travel with every asset imported ([RENDERING.md](RENDERING.md)).

**Villages get lifetimes too.** A village is sited once for a cell, and stands while the cell's people need it. It is
not sited again at each step of the anthromes.

## The order

Each step is a slice ([CONTRIBUTING.md](../../CONTRIBUTING.md#larger-work-slices)), with its criteria as tests.

| Step | What it builds | It works when |
|---|---|---|
| 0. Reference | the five places of judging in the look book; their frame times now; the tier measure on the coverage page | before and after can be compared for each |
| 1. Population and frame | `model:people/city-population`; the frame from routes, walls, gates, water and mapped streets, with routes run from the gates to the core where none is recorded; faces; skeleton records for Teotihuacan and Chang'an as the tests of tier 2 | every city has a curve with a band; Rome's frame is its walls, roads and river; a new mapped street changes only the faces it divides |
| 2. Growth | `model:people/settlement-growth` and its epochs; built ground on the globe through time | the Aurelian walls' extent agrees at its date; a city shrinks from its edges; the cut's band follows the rival figures |
| 3. Division | lanes, parcels and plots per face, fields and town as one; planned grids from a skeleton | a street keeps its place from founding to end; a farmed face becomes a quarter along its old lanes; Teotihuacan's grid is turned |
| 4. Buildings | generations, households to a building, institutions from traditions, monument forms by tradition | the same plot carries the houses of its centuries; a million people are drawn without a cap; a town of the lists has its temple and its market |
| 5. One scene | roofscapes giving way to buildings by size on screen; `CityScene`, the 60 km reach and `gen:rome/fabric` retired | Rome's five views pass; the frame budget holds over Chang'an in 750; no jump anywhere near the ground |
| 6. Ground | 30 m ground within settlements; the ground of occupation; the lakes of the Basin of Mexico | the Forum stands in its hollow; Uruk on its rising mound; Tenochtitlan in its lake |
| 7. Records | the brief, `cities-wanted`, `ohm-snapshot` for any settlement; skeletons for the cities with the most people-years | the share of urban people-years at tier 2 or above, by time, on the coverage page |
| 8. Villages | anonymous settlements with lifetimes, through the same generator | a village keeps its place across the anthromes' steps |

Steps 1–3 come before any art. A city that grows in the right shape, along the right roads, with plots that keep their
place, is worth more than a better house, and every house after that is drawn on it.

**Step 3 is built first at its smallest, on the hamlet: one continuous visit in the normal viewer:**

1. Start at the view of 147 CE.
2. Come down to the hamlet's entrance.
3. Follow a lane past its courts and a well.
4. Walk out to a rainfed parcel.

The view from above is reviewed before anything is spent on meshes. The same generator runs over the whole scene, so a
visitor can turn away from the route and find the same. Then, at the same place, come the first pieces of step 4 and
of decision 11:

- the enclosure and the court;
- one crop at three distances;
- one whole job of work.

## What it will not do

- **No forward modelling.** No city is stepped forward from its founding, and nothing predicts what was not recorded.
  The growth model ranks ground and cuts it, and its checks are the records.
- **No data outside the licences.** Today's street network does not come in from OpenStreetMap, nor buildings from any
  source that is not CC0, CC BY or public domain.
- **No invented districts.** Where people lived within a city, who was rich, what a quarter made: only what records
  say, and the tradition's institutions. A guess is never presented as a district.
- **No interiors.**
- **Nothing after 1850 yet.** The same machinery holds, but the evidence is of another kind (censuses, cadastres,
  surveys of built ground), and needs a plan of its own.

## Open questions

1. **How fine the growth model's ground is** (25 m or 50 m), and whether its ranking is made at build or in the
   browser:
   - at build, its checks run in the build's tests, and its bytes ship;
   - in the browser, it ships nothing, but the build's tests must run it to check it.
2. **The density of a tradition's towns:** a claim where studies measure it, or the model's parameter, held to the
   records' counts?
3. **A face's limit,** the largest area made in one piece. It sets how long the worker takes over a face.
4. **Rebuilding after a disaster:** whether the old streets were kept is often disputed. Is that a competing claim, or
   an alternative where it changes several records together?
5. **What a link names** once evidence divides a face anew, and the generated house it named is gone. The panel
   should say that the place has changed since the link was made.
