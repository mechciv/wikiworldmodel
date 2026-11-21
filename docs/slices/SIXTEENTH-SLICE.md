# Sixteenth slice: the human landscape, filled in

Status: built; see *How it was checked* for what was and was not run. The plan it comes from is
[plans/LIFEWAY-RENDERINGS.md](../plans/LIFEWAY-RENDERINGS.md), which measured how little of the human landscape of the
[eleventh slice](ELEVENTH-SLICE.md) rested on anything written: at every time, nine people in ten in a generic house;
camps that could take no tradition; one cluster of lots for every city; no animals, people, boats or paths. This slice
mends the engine where the plan found it wrong, keeps the measure, and fills what records could be written. It leaves
the world after 1850 and before 10,000 BCE as it was: the plan's fifth step is not built.

It adds:

- **Whom a tradition housed.** A `lifeway` claim on every building tradition: foragers, herders, shifting cultivators,
  farmers, townspeople. A house is drawn for those only, a camp's among them. Where none is written for a region's
  shifting cultivators the house of its farmers stands in, and the other way round, and says so.
- **How many lived so.** A `prevalence` claim, for a house that was that of a few, some or most of a region's people
  and not of all: it is drawn for that part of the region's 5′ cells, and the rest are the next tradition's or generic.
- **The measure, kept.** Every build counts, at sixteen times from 10,000 BCE to 1850, the people of each pattern of
  settlement and how many a tradition houses (`coverage.json`, `landscape.housing`). The coverage page shows it by way
  of life, the glance has a bar for it, and `dwellings-wanted` ranks what is missing by region, time and way of life.
- **Towns with streets and walls.** A `town_form` claim, of a tradition that housed townspeople or of a city's own
  record: streets on a grid, winding lanes or canals; a wall of earth, timber, mudbrick, rammed earth, stone or brick,
  with gates and towers; a moat; a square. Where nothing says, the generic town: lanes and no wall.
- **Cities from their records.** A settlement the world has a record of is drawn from the record: its place, its name
  of the time, the people a claim gives it for about that time, the houses a source counted, the ground it covered, its
  layout. A list's figure stands where the record gives none.
- **The animals people kept.** Husbandry traditions (`tradition/husbandry`): which animals, as taxon records, whose
  way it was, where and when. They are drawn with their taxa's bodies, in herds on the pasture or about the houses.
- **People, boats and paths**, which rest on no record: a few plain people before the doors of the houses, a boat on
  water beside a settlement, a path to the nearest neighbours. They are generic, and a click says so.
- **A scene anywhere past a city's own ground.** The viewer kept every place within 1,400 km of a city that has a scene
  of its own from having one while that city stood, which was Europe, North Africa and Anatolia from 1000 BCE to 1950.
  A city now keeps the 60 km round it.
- **Records:** a lifeway on each of the 37 traditions written before; 55 new building traditions; 20 husbandry
  traditions, and 14 domestic animals as taxa beside the dog and the horse; town forms on 8 recorded cities and 14
  traditions.

## Running it

As for the other slices (see the [README](../../README.md)); it needs no dataset the eleventh slice did not.

- **The measure:** `npm run dev`, then http://localhost:5173/coverage.html, under *People's houses, by way of life*;
  or `npm run world -- dwellings-wanted --totals`.
- **What is missing:** `npm run world -- dwellings-wanted` (`--lifeway herders`, `--region 107`).
- **A town with a wall on a grid:** Pataliputra in 1 CE, from above, `?t=1&lat=25.61&lon=85.14&d=1.00082&h=0&v=8`.
- **A city from its record:** Tenochtitlan in 1519, `?t=1519.5&lat=19.4326&lon=-99.1332&d=1.00044&h=20&v=60`. Click a
  house, a piece of wall, an animal, a person or a path for what each rests on.
- **Herders, their tents and their herds:** the Mongolian steppe in 1200 CE, `?t=1200&lat=47.2&lon=102.8&d=1.00005&h=60&v=76`.
- **A medieval English hamlet,** which no scene could reach before: `?t=1300&lat=52.2&lon=0.4&d=1.00014&h=40&v=70`.
- **To look at it all at once:** `npm run build:viewer && LOOK_GPU=1 npx tsx viewer/test/look-landscape.mts <dir>`.

## Pass criteria

The generator's tests named here as `v2.test.ts` are in `v3.test.ts` since the [seventeenth slice](SEVENTEENTH-SLICE.md)
made its version 3; their names are as they were.

| Criterion | Where it is checked |
|---|---|
| A lifeway is a list of the five ways of life, each once; a member takes its parent's where it says none | `tools/world/test/landscape.test.ts`: checks whom a tradition housed word by word; inherits what a member does not say |
| A tradition's house is drawn only for the ways of life it names | `landscape.test.ts`: draws a tradition's house only for the ways of life it says it housed |
| A camp takes the tradition that housed its way of life; a herder's tent is no farmer's house | `world/generators/people/settlement/v2.test.ts`: draws a camp's shelter from the tradition that housed its way of life |
| The house of farmers stands in for shifting cultivators who have none, and says so; no other way of life is stood in for | `landscape.test.ts`: lets the house of farmers stand in; `v2.test.ts`: draws shifting cultivators in the house of their region's farmers |
| Every tradition says whom it housed | `npm run validate` (a warning); `tools/world/test/landscape-build.test.ts` |
| A tradition that says how many lived so takes that part, before the house of the region, and what none houses is generic; a member does not take the word from its parent | `landscape.test.ts`: draws a house that a few lived in for a part of them; has the words of a prevalence the vocabulary declares |
| The generator draws it for that part of the region's cells, each cell all of one house, the same from two scenes | `v2.test.ts`: draws a house that some lived in for that part of the cells of its region |
| The people are counted by region, time and pattern as a scene shares them, each with the tradition that houses them, a row for each tradition's part | `landscape.test.ts`: counts the people of each region by how they lived; shares the people of a region among the traditions |
| The build's count adds up, and the glance's bar is the same count | `landscape-build.test.ts`: counts whose houses rest on a tradition; `core/glance.test.ts` |
| The coverage page shows it by way of life | `viewer/test/e2e/coverage.spec.ts` |
| A town of no stated form is the generic town; on a grid it is square, its rows facing their streets, with a main street each way | `v2.test.ts`, *a town* |
| A wall stands round its houses, whole but for its gates, which stand where the main streets leave; a rampart and a palisade have no towers; a moat has a way across before each gate | `v2.test.ts`, *a town* |
| A wall whose height or gates are stated and whose material is not is drawn, and says what is not said; a town form holds only while its claim says | `v2.test.ts`: has a wall of the plain kind where its form gives the wall and not what it was made of; `landscape.test.ts`: draws a record's layout only while its claim says it held |
| A town of canals has water in some streets, and no house in it | `v2.test.ts`, *a town* |
| A city of a record is drawn from its people, houses, ground and layout; a record's layout stands over its tradition's, part by part | `v2.test.ts`, *a town* |
| A city too thin on the ground for streets has none | `v2.test.ts`, *a town* |
| A record's people are read about the time they are for, and a list's elsewhere; a record no list has is drawn from its own figure or a guess from its ground; one that says nothing is left out | `landscape.test.ts`, *the cities a scene draws* |
| The build reads the settlements with records: Mohenjo-daro's ground, Tenochtitlan's preferred estimate and its name of the time | `landscape-build.test.ts` |
| Every piece of a town's works is drawn, at every detail, the size it says; a gate has its way through | `world/generators/people/works.test.ts` |
| A husbandry tradition keeps its animals and whose they were; the most particular holds | `landscape.test.ts` |
| A kept animal has its taxon's body and the middle of its size; one with no size is left out, and said | `tools/world/test/forms.test.ts` |
| Animals are drawn where a husbandry names them for that way of life: herds on the pasture, the rest by the houses; none otherwise | `v2.test.ts`, *the animals people kept* |
| People stand before houses and never within their walls, in a town in its streets; boats float only on water deep enough; paths join neighbours and end at the edge of their houses | `v2.test.ts`, *people, boats and paths* |
| A scene hands each kind to a view as its own entity, and lays its paths on the ground, never under water | `world/generators/people/scene.test.ts` |
| Each cell and each settlement is seeded apart, and alike from two scenes | `v2.test.ts` |
| In the browser: a city with a record is drawn from it; a farming country has its people and paths; herders have their tent and their herds; a hamlet far from Rome is drawn while Rome stands | `viewer/test/e2e/landscape.spec.ts` |

## What was built

### The measure

[tools/world/src/build/landscape.ts](../../tools/world/src/build/landscape.ts) (`housing`) shares HYDE's people of each
1° cell over its 5′ cells as a scene does, gives each 5′ cell the pattern of settlement the model gives it, and adds the
people up by region and pattern, each with the tradition that would draw their houses. `housingCounts` makes the
build's count of it, `dwellings-wanted` the list of what is missing, and both come from the same rows. It takes about
nine seconds for sixteen times.

People in a house of a tradition written for their way of life, region and time, of HYDE's people. *Before* is the
plan's measure on master, which counted any tradition of a region, whoever it housed. *Now* is build
`567b68e58ccf8821`. In brackets, of each way of life, the share a tradition houses.

| Time | People | Before | Now | Foragers | Herders | Shifting cultivators | Farmers | Townspeople |
|---|---|---|---|---|---|---|---|---|
| 8000 BCE | 7 million | 0% | 0.0% | 100% (0.0%) | | | | |
| 4000 BCE | 29 million | 0% | 10% | 66% (0.3%) | 17% (0.0%) | 6.3% (82%) | 10% (51%) | 0.4% (0.0%) |
| 2000 BCE | 73 million | 2% | 0.2% | 39% (0.5%) | 28% (0.0%) | 12% (0.0%) | 21% (0.0%) | 0.6% (0.0%) |
| 1000 BCE | 111 million | 3% | 21% | 15% (1.2%) | 29% (55%) | 17% (16%) | 38% (6.8%) | 1.1% (3.3%) |
| 1 CE | 232 million | 4% | 28% | 5.7% (0.3%) | 11% (6.5%) | 10% (27%) | 69% (32%) | 4.4% (52%) |
| 1000 CE | 323 million | 2% | 17% | 5.7% (0.4%) | 12% (3.8%) | 7.2% (37%) | 66% (21%) | 9.1% (1.0%) |
| 1500 CE | 503 million | 7% | 28% | 4.9% (0.5%) | 9.7% (12%) | 8.6% (46%) | 67% (33%) | 9.4% (11%) |
| 1750 CE | 746 million | | 56% | 2.0% (2.3%) | 8.6% (17%) | 3.7% (40%) | 73% (59%) | 12% (77%) |
| 1850 CE | 1.27 billion | 4% | 55% | 0.6% (7.4%) | 4.4% (28%) | 2.0% (29%) | 78% (57%) | 15% (59%) |

The glance's bar, the mean over the sixteen times, is 16.3%; a build early in this slice, with the ways of life and
northern India's five records only, had 5.3%. At 1850, 49 of 145 peopled regions have a
tradition that houses some of their people; at 1 CE, 22 of 142. Where *now* is less than *before*, as at 2000 BCE, a
house written for townspeople was counted before for the farmers and herders of its region, the Indus courtyard house
above all. The second millennium BCE is the emptiest stretch: the model has most people then as herders and foragers,
and nothing is written for them (see *Limitations*).

### The engine

- **The lifeway** is a claim (`lifeway`, a list of words in [core/dwelling.ts](../../core/dwelling.ts)); a tradition
  compiles with its own or its parent's; `traditionsAt` lists the traditions of a way of life, the most particular
  first, and `traditionsFor` gives each its part of the region's people, the stand-ins between shifting cultivators
  and farmers after the rest. The validator warns of a tradition that does not say.
- **Prevalence** is a word (`few`, `some`, `most`), and the part each is drawn for is a parameter of the generator.
  Each 5′ cell and each city falls to one tradition by a number of its own, so that a rare house stands in clusters,
  and the same cell is the same house whichever scene draws it.
- **The settlement generator is version 2**
  (`world/generators/people/settlement/v2.ts`, since replaced by version 3 in
  [world/generators/people/settlement/](../../world/generators/people/settlement/)). A town's houses stand on
  lots back to back in blocks; its outline is round with a wandering edge, or square where its streets are planned; its
  wall follows the outline a street clear of the outermost houses, in pieces that overlap so that they fill each run
  between two gates ([works.ts](../../world/generators/people/works.ts)). Herds, people, boats and paths are laid after
  the houses. A tradition's house in a town is a form apart from its house in a village, as what it leaves unsaid is
  the generic house's of the same way of life.
- **Seeds are whole numbers.** Version 1 seeded each cell and each settlement with a number between 0 and 1, which the
  hashes read as 0: every cell laid its settlements out alike, and every village its houses. A settlement's axis was
  keyed by its place in the scene's list, so it turned from one scene to the next.
- **Cities.** `cityRecords` reads each settlement with a place: its span, its names in turn, and its figures of people,
  houses and ground at the times their claims are for, the preferred one of rivals within fifty years. `citiesAround`
  (core) joins a record with the list's city within twelve kilometres. A city stands on its river's plain, where a
  village keeps well above the water.
- **Husbandry.** `compileHusbandry` and `husbandryAt` (core) mirror the building traditions; `keptAnimals` (build)
  gives each named animal its taxon's body, up the tree, and the middle of the range its nearest size claim gives. The
  tree takes a taxon's preferred parent where it has two.
- **The scene's stream** draws three more kinds beside houses: the pieces of a town's works, the animals people kept
  (as the wild ones are drawn, idling) and one mesh of paths, a ribbon a hand above the ground. Each is an entity of its
  own, so a click tells them apart, and the panel says what each rests on.
- **The viewer's ground.** A city with a scene of its own is the place a view is at within 60 km of it
  (`CITY_REACH` in [viewer/src/main.ts](../../viewer/src/main.ts)), past the reach of the lists' cities a scene of
  anywhere draws; everywhere else near the ground, the view comes down into the scene of where it is.

### The records

All were written by agents (Claude Code), are `proposed`, and have every quote found by `quote-check` in the text
kept for its source.

| Set | Records | Read from |
|---|---|---|
| A `lifeway` on each tradition written before | 37 claims | each record's own sources, fetched again |
| Town forms | 8 recorded cities, 5 older traditions | the records' sources; one new source |
| Traditions by people | South Asia 10, China 9, Japan and Korea 8, Europe 10 | excavators' syntheses and papers; travellers and gazetteers for the centuries before 1850 |
| Traditions by way of life | herders 7, foragers 6, shifting cultivators and farmers who stand in for them 5 | travellers' accounts, ethnographies, a few papers |
| The animals people kept | 14 domestic taxa; sizes and a nearer parent for the dog and the horse | Animal Diversity Web, papers, Wikipedia for six sizes |
| Husbandry | 20 traditions, naming 12 of those animals | zooarchaeological papers; Wikipedia for the two camel traditions |
| Sources | 132 | |

What the build now draws from them, for the most people: the adobe courtyard house of North China, the skywell house
of the lower Yangtze, the mud-walled house of Hindustan, Bengal's thatched hut, the mud courtyard house of South India
(each for tens of millions in 1750 and 1850), the chuandou house of the south-west, the machiya, the minka and the
choga, the English houses of three ages, and the hall house of the north German plain.

**What they rest on, least first.** Wikipedia, at pinned revisions, carries the Low German hall house whole, the two
Korean houses of the Joseon, the parent North China courtyard house, the camel traditions, and the sizes of the pig,
dog, dromedary, alpaca, reindeer and zebu; each note says so. Travellers' and officials' accounts carry the houses of
the centuries before 1850 (Burckhardt, Buchanan, Rubruck, Staden, Paes, Smith's *Village Life in China*), read in
scans whose text was recognised by machine: quotes keep to stretches read cleanly.

**Doubts a reviewer should take first**, from the agents' reports:

- *Starts that are bounds.* A tradition known from a traveller starts when he wrote: the black tent of the Syrian
  desert in 1810, the Maasai house in 1851, the leaf hut of the Central African forest in 1888. So the centuries before
  stay generic, and the last three draw nothing in the span this slice measures.
- *One place for a region.* Bhita for the towns of the Ganges, Inamgaon for the Deccan, one village (Lony) for its
  later houses, Maidanets'ke for Trypillia, one Tupinambá account for the Brazilian Highlands, the Ao for north-eastern
  India, the Ganda for Uganda, Rwanda and Burundi, the Iban for Borneo. Only the tulou, the lake dwelling, the Chin
  Hills house, the yaodong and the hall house say how many lived so; the rest are drawn for everyone of their way of
  life in their regions. The English houses are drawn over Scotland and Ireland, the castro house over all Iberia, the
  snow house over Labrador's forest foragers.
- *Town forms drawn for every town.* Korea's stone wall, though a source has a wall at about a third of its county
  seats; the canals of the lower Yangtze's towns; Djenné's wall of 1828 over Jenne-jeno's. A wall is drawn round a
  whole town, which is wrong at Cahokia (its precinct) and Harappa (its separate mounds).
- *Ways of life that are readings.* `[farmers, herders]` on the Painted Grey Ware hut and Mehrgarh; the Chin as
  farmers; the lower Yangtze's villagers as farmers; the Marianas' latte house, whose way of life is unsourced.
- *Sizes.* Animals at the sizes of today's breeds; 300 people to a tulou, one of the largest; the Iban longhouse at
  the length of the two largest measured; chiefs' yurts; an English house of the Great Rebuilding that says only that
  it had two storeys.
- *Dates chosen as boundaries.* 710 CE for Japan's ground-level house, though pit dwellings lasted in the east to
  1185; 1392 for Korea's houses; 1368 for the skywell house.
- *An older quote not found again.* The text of Meadow and Kenoyer's report on Harappa kept this time has every quote
  of the new claims and not one of an older claim of Harappa's start; the pages read then were not kept.

**What could not be read,** and was not worked around: MDPI refused every request, and holds the key papers on the
houses of Korea, China and the tulou; bot checks stopped the repositories of Heidelberg, Bern, Cardiff, Hawaii, UCL
and CORE, De Gruyter, Sage, Historic England and UNESCO's World Heritage pages; Project Gutenberg was down, and its
texts were read in the Internet Archive's copies. Wanted and not reached: Jarrige's Mehrgarh reports, Marshall's Bhita
and Taxila, Lal's Hastinapura, Nishimura on Yayoi floor areas, *Ruralia IV*, Lynn on Irish houses, Smith on the house
sizes of Morelos, Buck's *Chinese Farm Economy*.

**What was not written:** France at any date; eastern Europe from 1500; the Iron Age of central Europe; Roman Italy and
the Mediterranean farmhouse; Iberia after 100 CE; Britain in 1850; the Ganges plain's farmers from 1 CE to 1500; South
India before 1520; North China from 2500 to 206 BCE; the lowland house of south-eastern China; Central Mexico, the
largest gap among the Americas; West Africa's farmers; the herders of the Sahel, south-west Asia and the Bronze Age
steppe; the foragers of the Congo before 1888, of Australia and of the Amazon.

## Decisions

1. **The way of life is a claim, and the match is exact but for one pair.** A herder's tent is no farmer's house, so a
   tradition of another way of life in the same region does not stand in. Shifting cultivators and farmers are the
   exception: the model tells them apart by a survey's answer for a whole region, non-continuous against continuous
   farming, and the same villages are both to their excavators. The stand-in is said and counted as one.
2. **Herders are people who lived mainly by their herds**, in camps or on farms among their pastures. The model calls
   the people of grazed land with few people herders, in Iceland as on the steppe; a narrower word would leave every
   stock farmer's house undrawn.
3. **How many lived so is a word, and the part is the generator's.** A source says a house was rare or common far
   more often than it counts, and a count is of a district, not of one of these regions: eleven villages of 2,189 in
   Meizhou says the tulou was rare, not that it housed half a per cent of south-eastern China. So the claim is `few`,
   `some` or `most`, and the part of the cells each is drawn for is a parameter, said to be no fact. A share written as
   a number would have been a derived value with nothing behind it.
4. **A city with only a record is drawn in the living scene, not as Rome is.** The plan had `gen:rome/fabric` made a
   generator of any city. Rome's fabric is cut around mapped structures on a surveyed ground; a city with only a record
   has neither. What it has, its people, houses, ground and layout, the settlement generator can draw. A city with a
   map stays a slice of its own.
5. **A record's figure holds about its own time.** A record's people are drawn within fifty years of the time a claim
   is for, or between two no more than six hundred years apart, as a list's are read; elsewhere the list's stand, and
   where there is no list, the record's nearest. A record of one estimate does not fix a city's size for a thousand years.
6. **Husbandry is a tradition, not a claim on a house.** Which animals people kept is a fact of a region and a time,
   broader than a way of building; it has its own extent, span and way of life, and is chosen as a house is.
7. **How many is the generator's.** Animals to a house, people by a house and boats by a settlement are parameters of
   the generator, said to be no claim. Which animals, and that there was a wall, are the records'.
8. **Paths are a mesh on the ground, not paint.** The ground's painted masks are fifteen metres to a pixel; a path
   painted there is a road fifteen metres wide. A ribbon a hand above the ground is two metres wide at any distance.
9. **A city's own ground is 60 km.** Past the 30 km within which a scene of anywhere draws the lists' cities, so that
   no scene draws Rome in generic houses beside the Rome drawn building by building, and no further: the rest of the
   land round a city is the living world's.
10. **The world after 1850 and before 10,000 BCE is left as it was.** Housing since 1850 wants records of another
    kind, nearer to a census than to a tradition; before the anthromes no model says where people were. The measure
    stops at 1850.

## Limitations

- **The model's ways of life are coarse, and a tradition reaches only the people the model gives its way of life.**
  It calls the people of grazed land with few people herders: 15 million on the Ganges plain in 1000 BCE, most of
  Scandinavia in the Iron Age, Iceland. It calls farmers of land the survey farmed without continuous fields shifting
  cultivators: most of Iron Age Britain, eastern Europe in 500 CE, the Maya lowlands, Central Mexico before 500 CE. And
  it has foragers where excavators have farming villages: the American Southwest before 1750, north-eastern China in
  2000 BCE, Japan in 500 CE. The stand-in between farmers and shifting cultivators and the wider meaning of herders
  mend part of it; a house written for farmers still draws no one where the model has foragers.
- **A region is still drawn whole, or by lot.** A tradition is drawn over all of its regions, or, where it says how
  many lived so, over a part of their cells taken by a seeded number: never over the part it really held. A town form
  named by a tradition is drawn for every town of its regions; a husbandry tradition's animals for every settlement of
  its way of life there.
- **A city's outline and streets are invented.** Round or square about its point, on the ground its record gives. Its
  real outline, its quarters and its monuments are not read. Tenochtitlan stands on dry land: the lakes of the Basin of
  Mexico are still not in the world, though its record's canals are drawn.
- **Rome is not in this.** Rome has a scene of its own, and its record's town form would not be read by it. A view
  that crosses the 60 km round Rome near the ground changes from one scene to the other at once.
- **How many animals, people and boats there were is no one's claim.** Nor is which house a person stands before.
  Sheep and goats are drawn in the body of the bovids' family, at their own size.
- **The fossil database's rows still put the genera of farm animals among the wild ones** where its Holocene rows are
  from archaeological sites, so a scene may draw wild-placed cattle beside the kept.
- **The Roman roads are not in scenes**, nor any road a record gives: the paths are the generator's.
- **Not drawn yet:** boundaries, the seasons of the fields, carts, smoke.
- **Nothing has been checked by a person.** Every record here is `proposed`.

## How it was checked

By the agent that built it (Claude Code), on one machine, in November 2026:

- `npm run validate`: no errors and no warnings, on 3,423 entities, 15,962 claims and 1,623 sources.
- `npm run typecheck`, and `npm test`: 652 unit tests pass.
- `npm run build:world` (build `567b68e58ccf8821`) and `npm run test:build`: 88 tests pass.
  `npm run test:reproducible` passes: the world built again means the same.
- **Every quote of every source whose text was kept**, in one run of `quote-check --dry-run` over 243 texts: 1,513
  of 1,591 found. The 78 not found are of claims written before this slice, whose pages were not kept this time: 72
  of the Animal Diversity Web's, in 45 taxon records this slice did not change; five of Uruk's from the CDLI wiki,
  which refused this time; one of Harappa's start. No `quoted` step was written by hand. One agent wrote some into a
  draft, took them out and ran the script; that record's eleven quotes were checked again.
- **Browser tests**, drawn in software, on a port of this session's own: the `city` and `globe` groups, 140 tests,
  all pass, the goldens unchanged; and `landscape.spec.ts` again, 9 tests, after the last change to the panel's words.
- **Looked at**, on this machine's GPU (`viewer/test/look-landscape.mts`): Pataliputra in 1 CE from above and from
  among its houses; Tenochtitlan in 1519; Uruk in 3000 BCE; the Nile delta in 1500 BCE from above and beside a village;
  a hamlet of East Anglia in 1300; the Mongolian steppe in 1200 from above and beside a camp; Uruk's wall and a canal
  of Tenochtitlan from close by; the coverage page. Looking
  found, and this slice mended: no houses for a city on its river's plain; walls of unstated material not drawn; a
  town form's `valid` ignored; people standing inside their houses, where nobody could see them; tents of felt dyed
  red and blue; and that no scene of Europe could be reached at all.
- **Not checked.** Nothing was read by a second reader, or by a person. The frame-time budget was not measured, and
  herds, people and paths add instances to a scene. Rome's full-quality views (`city-views`) were not drawn again.
  A moat, a rampart and a palisade were tested as geometry and never seen: no view was taken of a town that has one.

## Next

- **The lifeway model**, where it parts from the excavators: stock farmers on grazed land, and settled farmers where
  the survey calls foraging the region's way of life. It would move more people into houses already written than any
  new record.
- **More traditions**, from `dwellings-wanted`. The most people still in generic houses: the farmers of south-eastern
  China, France, central and southern Europe, Britain and eastern Europe in 1850; of the Ganges plain from 1 CE to
  1500, with its townspeople; of South India and Bengal before 1500; of Nigeria in 1750 and 1850; of Central Mexico in
  1500. And a `prevalence` on the houses of one people that are drawn for a region.
- **An extent finer than a region**, for a house of a district: the tulou's hills, the hall house's plain.
- **The lists' rows as claims**, so that a record can correct a list's figure by an overlay.
- **The lakes of the Basin of Mexico**, and water a record gives in general: a lake's shore at a time.
- **Roads as records and datasets** in scenes, the Roman roads first.
- **The world after 1850**, by a framework of its own.
