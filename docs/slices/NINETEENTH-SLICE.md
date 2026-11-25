# Nineteenth slice: people per hectare, a model scored on what it did not see

Status: built; see *How it was checked* for what was and was not run. It builds the pilot of
[plans/MODELS.md](../plans/MODELS.md), which asked that the people side of the world be made by models that give an
estimate of any quantity at any place and time, with the evidence as what they observe, and scored on what they predict
of evidence held out. The pilot is one quantity taken through every layer: how many people a settlement held, and how
densely, from Angkor's case.

Angkor at 851 was drawn as one dense disc of 750,000 people over about 210 km², at an average of 36 to the hectare.
Its record's figures for the 3,000 km² region about the city had been read as the city's, and a figure with no date
had been read as the people at its founding. This slice reads each figure as an observation of the ground it counts,
over the years it is for.

It adds:

- **What a figure counts** ([RECORDS.md](../RECORDS.md#what-a-settlements-figure-counts)). A claim of a settlement's
  people, ground or houses says its `ground`: the settlement (the default), its `core` alone, its `region` with the land
  about it, or a `site`'s bounds today, which count none of its people. A settlement's `core` is a claim of its own: a
  place it was centred on, while it was.
- **The population model, rebuilt** (`model:people/city-population`, [core/citypop.ts](../../core/citypop.ts), on
  [core/gauss.ts](../../core/gauss.ts)). The log of a settlement's people is a random walk through time. Every figure
  of the lists and of its record observes it, conditioned on together in closed form:
  - a figure of the settlement over the years it is for; one that gives no years over the settlement's whole life, and
    never as a point at its founding;
  - a figure of its core as a part of its people;
  - a count of its houses over a household, where no preferred figure gives the people then;
  - its ground over the density it lived at;
  - each source's figures with a bias of their own, so that disagreement between sources widens the band rather than
    being hidden. A preferred figure passes over its rivals, as before.
- **People per hectare from the settlements near** (`model:people/density`). A settlement whose figures give both its
  people and its ground is an anchor. Every other settlement's density has a prior pulled towards the anchors near it
  in space and time, and the floor of fifteen to the hectare the growth model held every town to is gone.
- **A region's people.** Where a record counts the people of its region and gives the region's ground, the region has
  people of its own, with a prior of the town's and HYDE's within the region's ground. Those beyond the town's are spread
  over the region's 5′ cells in a scene, among the villages and farmsteads, in place of HYDE's there
  ([core/landscape.ts](../../core/landscape.ts), `regionsInto`).
- **Cores with years** ([core/growth.ts](../../core/growth.ts), [town.ts](../../world/generators/people/settlement/town.ts)).
  The growth model ranks a town's ground from the cores its record says it was centred on, each while it was one: an
  epoch begins where a core does. A town's routes lead to each core while it was one, and are drawn only then.
- **Scores on figures held out** ([tools/world/src/holdout.ts](../../tools/world/src/holdout.ts),
  `npm run world -- holdout`). Each list's figure is predicted from its city's others; each record's figures are
  predicted with all of its own held out; and the places of judging likewise. The build fits the walk's variance and a
  list's bias to the first and a work's bias to the second, writes what it fitted and the density anchors into the
  cities file, and the scores into `coverage.json` (`landscape.people`), which the coverage page shows.
- **Angkor's evidence, as records.** Klassen et al. (2021)'s Table 1, period by period: the people and the ground of
  the civic-ceremonial centres, and the region's people. Hariharalaya at Roluos is a core until 889, and Yasodharapura
  from 889. The six earlier figures say what ground they count. The UNESCO properties of Caral, Hattusa and Tikal,
  Çatalhöyük's two mounds and Great Zimbabwe's whole estate are `site`.
- **The settlement generator, version 11**, which lays a city out at the model's density, from its cores, and says in
  the panel what the model read of a city and how far each figure moved it.

## Running it

```sh
npm run build:world                      # fits the model and writes its scores
npm run world -- holdout people/first-cities/angkor
npm run dev                              # http://localhost:5173/?t=851.6&lat=13.31&lon=103.974&d=1.00024&h=10&v=60&hour=10&mo=8
```

## Pass criteria

The criteria are the pilot's in [plans/MODELS.md](../plans/MODELS.md#the-pilot-people-per-hectare-end-to-end), each
with what the build of this slice found. Two do not hold, and say why.

| Criterion | Where it is checked | Found |
|---|---|---|
| Angkor's people have no saw-tooth: each ground's series is smooth where its evidence is | `core/citypop.test.ts`: *takes a core's figure…*; `npm run world -- holdout people/first-cities/angkor` | Holds. The city reads 112,000 in 851, 199,000 in 1000 and 143,000 in 1200; its region 142,000, 625,000 and 552,000. The leaps between 90,000 and 800,000 are gone: those were a region's figures read as the city's. |
| With Angkor's records held out, the band predicted for the region in 770–888 overlaps Klassen et al.'s | `tools/world/src/holdout.ts`, the places of judging; the coverage page | **Does not hold.** Held out, the model predicts 20,925 people, 90% between 5,865 and 74,663, where the table gives 248,696. HYDE puts about 11,000 people in the 3,000 km² then, and the lists have no Angkor before 889. The world's prior misses Angkor's region about twelvefold, which is what the score is for. |
| The band for the metropolitan area outside the centres overlaps theirs | — | Not checked: no claim counts the metropolitan area on its own, and none is worked out from the table, whose columns do not sum. Held out, the centres' own 89,137 for 770–888 is predicted at 73,967, 90% between 20,002 and 273,527, which holds. |
| With them in, the region's people in that period fall within Klassen et al.'s range | `npm run world -- holdout`; the build's log | Holds: 170,000 about 870, between the table's columns for the centres and the metropolitan area together (159,805) and its total (248,696), pulled down from the total by the prior. |
| 851 is drawn with most of its people spread thinly over the region, not as one dense disc | the views below | **Does not hold in full.** In 851 the town holds 112,000 at 28 to the hectare about Bakong, on 39 km², and the region beyond it 30,000. The town's share is high because the region is pulled towards HYDE's prior and the centres are taken as a quarter less than the city. From 950 on, most of the region's people are beyond the town (228,000 of 370,000 in 950, 425,000 of 625,000 in 1000). The disc of 210 km² at 36 to the hectare is gone. |
| No settlement has a figure at its founding that no source dates there | `core/citypop.test.ts`: *reads a figure that gives no time over the whole span…* | Holds, for Caral, Çatalhöyük, Great Zimbabwe, Hattusa and Tikal too. |
| Rome in 100 CE and Tenochtitlan in 1519, held out, are scored, and the scores are on the coverage page | the build's log; `coverage.json`, `landscape.people`; the coverage page | Holds. Tenochtitlan's Calnek, 150,000 to 200,000, is predicted at 80,000, 90% between 29,597 and 216,242, from Chandler's list. Rome's 450,000 in Chandler's list for 100 CE is predicted at 919,750, 90% between 783,557 and 1,079,614, from Modelski's figure and Chandler's own others: Chandler's figure for that year sits apart from both. |
| Cities with one series of figures from the lists are drawn as before, within the fingerprint's tolerance | a comparison of master's reading with this one over the base build's cities | Holds for 849 of the 1,555 cities with one list: those with no two figures within 25 years read the same within 0.002%. The other 706 differ because master's reading skipped any of a list's own figures within 25 years of one it had taken: Osaka's 12 and 15.5 million in 1970 and 1975 were never read, and the city fell to a thousand people by 2025. Every figure is read now. |
| The panel shows, at any settlement, the prior, each observation with its pull on the estimate, and the spread | the house panel of a city; `viewer/src/main.ts`, `populationWords` | Holds: the band, each figure read with how far it moved the reading, each passed over and by what, and the density's prior and posterior. |
| The fit adds less than a minute to a full build, and a query costs no more than the growth model's | the build's log | Holds: the fit and every score take about a second; a city's conditioning is a closed form on its own figures. |

## What was built

### The model

The state is the log of the settlement's people at knots (its span's ends and the middle of every figure's years),
its density scale, and one bias for each source: each list, and each work and property of the record's. A figure is a
row over that state: the knot at the middle of its years (with the walk's variance over its years added to its own), its
source's bias, and, for an area, the density scale. Conditioning is exact, in the covariance form, so a figure may have
no noise of its own. That is how a city with one source is read: its error is all its source's bias, and it is drawn
through its figures exactly, as before. Each figure's prediction from all the others follows from the one fit in closed
form ([core/gauss.ts](../../core/gauss.ts)), which is what the scores read.

The band's edges are the posterior's 5% and 95% at each knot. Before the first figure and after the last the people
rise from a founding size and fall to it, as before.

A region's people have a prior of the settlement's central reading and HYDE's people within a disc of the region's
ground about the record's point, at HYDE's steps ([build/landscape.ts](../../tools/world/src/build/landscape.ts),
`regionHyde`). That prior wanders as the people do, with HYDE's doubt at its start, and is conditioned on the region's
figures.

### What it changes in a scene

A scene's cities take their people, band and density from the model. A record within 12 km of a list's city reads the
lists' rows near its point, whatever their times, so that its people are the same at every time, as its plan already
was. Where a region's people are counted, the 5′ cells of land within its disc are as many times more crowded than HYDE
has them as the region's people beyond the town's are than HYDE's there.

## What it looks like

Angkor in 851 from about 1.5 km up, as master drew it and as this slice does, in the same views on the GPU; two of
them are now in the look book ([tools/look/views.yaml](../../tools/look/views.yaml): `angkor-851-plain`,
`angkor-851-hariharalaya`). Master drew the record's point as a town of 750,000 on 210 km² of trodden ground. Here the
record's point in 851 is open country, with hamlets and their fields among uncultivated savanna. The court's town stands
at Roluos, about Bakong: some 112,000 people on 39 km², grown out along its routes, with its fields beyond. Its houses
and its ground are still the generic town's, trodden, with one courtyard house to a plot, so it reads as a smaller,
thinner version of the same disc. What a town of low density looks like is the next node's
([plans/MODELS.md](../plans/MODELS.md#after-the-pilot)).

## Decisions

- **A source alone is read exactly.** A figure's own error, 5% where it gives no range, is what reconciles two sources'
  figures that disagree in their trend, as Chandler's and Modelski's for Chang'an in 800 and 900 do. Within one source
  it would only shade its figures, so a city with one source has none, and is drawn as it was.
- **A preferred figure passes over its rivals,** and a count of houses at about its time (docs/RECORDS.md: houses are
  never turned into people where a source gives the people). A list's figure within 25 years of a preferred one of the
  record is passed over, as before. Rivals neither preferred nor passed over are all read, with their biases.
- **The table's totals are copied, not worked on.** Klassen et al.'s totals count the embankments' people at the most
  the paper allows. Their columns do not sum to the totals, so no lower total is worked out here, and the claims say so.
- **A work's figures of one ground share one bias, whatever they count.** A work that drew a city's ground wide counted
  its people over it, so its ground and its people err together, and how densely they lived is what it says most
  surely. With a bias for each property, Klassen et al.'s measured centres, 15 to 38 to the hectare, barely moved
  Angkor from the world's 100. With one bias, they set it at 18 at 10,000 people, about 28 at Angkor's size.
- **Only the figures the model reads are scored.** Holding a record out at first scored the figures its record passes
  over too, such as Groslier's 1.9 million for Angkor and Soustelle's 560,000 to 700,000 for Tenochtitlan. The fit then
  widened every work's bias to cover disagreement the model never reads.
- **A figure says its people were there from the start of its years.** The founding size stands only before then.
  Klassen et al.'s first period, 770–888, begins before Angkor's record does (851), so Angkor stands at its centres'
  people from its first year.
- **The grid a town is laid on still follows its band.** With a city of one source read as before, its plan is as it was.

## Limitations

- **A region is a disc** of its ground about the record's point. Greater Angkor is not a disc, and the Tonle Sap lies
  partly in this one.
- **The model knows nothing of where in a region its people lived.** Those beyond the town are spread as HYDE's are,
  among the region's cells by their classes. The temple communities, the households on their mounds and the people
  along the embankments are not drawn as such.
- **A town is still one compact settlement about the cores standing.** Angkor's civic-ceremonial centres were several,
  and only the court's is a core here, so the centres' people are drawn about Hariharalaya until 889.
- **HYDE's people in a region may count the town's already,** so a region's prior counts them twice, by as much as HYDE
  has of the town.
- **Only the walk and a list's bias are fitted.** The density's reach (800 km and 800 years) and its spreads, the core's
  ratio, the household and a figure's own error are choices, said so in the models' records.
- **A work's figures share one bias,** so Klassen et al.'s five periods move together.
- **Mahendraparvata is not written.** Chevance et al. (2019) measure its grid, but nothing counts its people, and its
  dispersed grid is not a compact town.
- **The founding size is a rule, not an observation,** as it was.
- **A build made before version 11** gives a record's figures one to a time, all of the settlement and all preferred,
  and is drawn with the model's defaults.

## How it was checked

By the agent that built it (Claude Code), on one machine, on 25 November 2026:

- `npm run typecheck`;
- `npm test`, 1,071 tests passing;
- `npm run validate`, no errors and no warnings;
- the new claims' quotes found by `npm run world -- quote-check` in the texts they were read in (Klassen et al. 2021,
  Lustig 2009, Pottier and Soutif 2014, and Pleiades' record of Angkor), which recorded the `quoted` step on 21 claims;
- a world build from the working tree, not a clean commit (`a42d4a51`), and `npm run test:build` on it, 119 tests
  passing;
- views of Angkor in 851 on the GPU, beside the same views of master's viewer on master's build.

The browser test groups were not run, so their golden images were not looked at. A city whose people the model reads
differently is laid out again on a grid of another size, so the city views may differ from their goldens where a city
of the lists has two lists, a record, a neighbour whose ground sets its density, or figures within 25 years of each
other.

## Next

The rest of [plans/MODELS.md](../plans/MODELS.md), each a slice with a held-out score: the farming year from the place's
own months, crops and fields, houses with their classes, water works, kept animals and institutions. Nearer to this
slice: Angkor's other civic-ceremonial centres as cores, and Mahendraparvata; a region's outline from a record's extent
in place of a disc; the density's reach and spreads fitted to the anchors' scores; and a measure of how much of the
lists' figures the records' are consistent with, so that a record that contradicts its lists says so.
