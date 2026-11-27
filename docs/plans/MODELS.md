# Models: an estimate everywhere, with the evidence as what it observes

Status: proposed, 25 November 2026; revised 27 November 2026. Its pilot is built as the [nineteenth
slice](../slices/NINETEENTH-SLICE.md) and its second node, the settlement's form, as the
[twentieth](../slices/TWENTIETH-SLICE.md); each says what it leaves out and how it differs from what is written here.
The revision widens the plan from the people side to every quantity of the world, and adds decisions 9 to 16: the
quantities in the order of their causes, four kinds of node, what holds a model to its causes, how evidence comes to
exist, and how one estimate answers at every scale. Decisions 1 to 8 keep their numbers. Nothing of the revision is
built but its map: the [graph of causes](../causes/README.md), which holds every quantity here as a node with its
causes, and ranks where the work is. The plan touches [CITIES.md](CITIES.md),
[HUMAN-LANDSCAPE-REALISM.md](HUMAN-LANDSCAPE-REALISM.md), [VISUAL-GAPS.md](VISUAL-GAPS.md) and
[ENTITIES.md](ENTITIES.md); [How this meets the other plans](#how-this-meets-the-other-plans) says how. It keeps the
design's three kinds of content ([STRUCTURE.md](../STRUCTURE.md) section 1.1) and its contracts: uncertainty as
samples (3.2), every layer answering in a tier (3.3), and the line between a model and a generator (3.4).

## Why

For most of history the evidence is thin, and for most places it is none. The world should still give its best
estimate of any quantity at any place and time: how many people, how densely, in what houses, growing what, on what
calendar, with what water works and animals. Evidence, data and the historical sciences should inform **models**, and
the models should give the estimate, its spread, and what narrowed it.

When this plan was written the people side of the world did the reverse. Evidence was what was drawn, and a model
filled only the gaps between figures. Angkor at 851 CE, as the viewer drew it then, shows what that cost:

| What the viewer got wrong | Why | Kind |
|---|---|---|
| 750,000 people at the founding | A figure with no date was pinned to the record's start. | bookkeeping |
| The people leap between 90,000 and 800,000 from one figure to the next | A regional total (Klassen et al., 3,000 km²) and a city's count (Chandler) were read as one series, and a record's figure *replaced* the lists' rather than informing them. | model |
| One dense disc of about 210 km² | One regime of density, with a floor of 15 people to the hectare; outside its centres, Angkor's metropolitan area held about 0.2 in 770–888 (Klassen et al. 2021, Table 1). | model |
| The court is in the wrong place in 850 | Hariharalaya, at Roluos, had no record. | evidence |
| The townspeople's houses are the global stand-in, an 11 m courtyard house | A tradition holds inside its regions or not at all; the one for Southeast Asia named farmers only, and nothing carries what neighbours or related peoples did. | model |
| Dryland millet and winter wheat | Crops are chosen by the climate's class alone (`genericCropsFor`, [dwelling.ts](../../core/dwelling.ts)), with no geography of crops. | model |
| Rice ripe in August | The fields' calendar runs on the month's number, as in a temperate summer ([plots.ts](../../core/plots.ts)), not on the place's rains. | model |
| No ponds, moats or temples | Nothing predicts water works from the rains, the crop and the density. | model |
| Every house the same size | No spread of size, and no rank. | model |
| No kept animals | No stand-in for husbandry where no tradition holds. | model |

Eight of ten are failures of modelling. The test this plan sets: **the world should draw a believable Angkor in 850
with none of Angkor's records**, from the monsoon, wet rice, the region's people and what is known of related peoples,
and Angkor's records should then sharpen it. The two slices built since have mended much of the table at Angkor, with
Angkor's records. Without them the world still cannot.

### What the pilot found

The pilot did what it was built to do with a settlement's own figures, and its scores showed where the plan was
weakest. With Angkor's records held out, the model predicted 20,925 people for the Greater Angkor Region in 770–888,
90% between 5,865 and 74,663, where Klassen et al.'s table gives 248,696: about twelvefold low
([nineteenth slice](../slices/NINETEENTH-SLICE.md), pass criteria). The conditioning was sound. The prior was not. It
was HYDE, which is another model, and whose rules for where people lived do not come from what made Angkor's land hold
so many (`field:earth/population` says how its numbers were made).

Three things follow, and the revision rests on them:

- **A prior from another's model is not a prior from causes.** Decision 2 asked for the second, and the pilot built
  the first.
- **The plan listed only what a settlement's scene needs:** people per hectare, houses, crops, animals. Every one of
  them rests on quantities further up that it did not name: how many people the land held, what way of life had
  reached it, what the climate grew there.
- **A figure held out among its neighbours rewards smoothing.** Angkor's test told something because a whole region
  was held out, with nothing of its own left to smooth between.

## Where it stands

The design already puts models between the evidence and the generators (section 4.10 of
[WORLD-MODEL.md](../WORLD-MODEL.md)), but the sides of the world are unequal.

- **The Earth's models predict from causes, and no evidence conditions them.** The energy balance, the water balance,
  the biome from the climate and the drainage each give an estimate anywhere their inputs reach, and name the evidence
  they contradict. But the climate they start from is one run of another's model for each time, its spread unknown, and
  where the world's evidence disagrees with it the run stands: at the Hell Creek the field has the coldest month below
  freezing where fossil leaves give a mean of the year of about 12–20 °C, and the scene follows the field
  (`model:earth/biome-from-climate`, `disagrees`).
- **The ground under them has no model at all.** The height of the land is another's hand-drawn maps at 1° every
  5 Myr, with no spread, and it is the top of the order of causes: the climate runs, the rivers and the fossils'
  places all stand on it. The world's own evidence contradicts it and corrects nothing: 36% of marine fossil
  collections fall on its land, and the Alps stand 1 to 1.5 km low for 20 Myr against their own record
  (`model:earth/coastline` and `model:earth/relief-carried`, `disagrees`).
- **Life is carried by distance, in tiers.** `model:life/atlas` puts a taxon where a fossil of it lies near, or can
  be reached overland in a like climate. It has no model of where fossils were looked for, and says so: "its lists
  partly show where people have dug".
- **The people's models smoothed evidence or followed rules of thumb** when this plan was written:
  - `model:people/city-population` drew a constant rate between figures. Since the pilot it conditions on every figure
    of a settlement, each as an observation of what it counts; its prior for a region is still HYDE's;
  - `model:people/lifeways` is, in its own words, "a set of rules of thumb" joining HYDE to the archaeologists'
    survey;
  - `model:people/settlement-growth` ranks ground and cuts it at an area set by a density. Since the pilot the density
    is a node's (`model:people/density`), pulled towards the settlements near whose ground was measured.
- **Traditions are parameters fitted by hand, with hard edges.** A building, farming or husbandry tradition holds in its
  ArchaeoGLOBE regions and span, and outside them the drawing falls to one global stand-in keyed by climate. In 500–1000
  CE, 99% of the people of towns and cities were housed by the stand-in (`coverage.json`, build d743ebb).
- **Evidence overrides; it does not inform,** outside the pilot's node. A preferred claim is the value. Nothing weighs
  a figure by what it counts, how good it is, or how far it lies from the place and time asked.

The evidence machinery is not the problem. Sources, locators, quotes and the checking ladder are what make a model
fittable and testable, and what will make its estimates believable. What is missing is the layer that turns that
evidence into estimates everywhere.

**What of this plan is built:**

| Decision | Built | Not built |
|---|---|---|
| 1, 3, 7, 8 | For one node, a settlement's people: observations by their ground and years, exact Gaussian conditioning ([gauss.ts](../../core/gauss.ts), [citypop.ts](../../core/citypop.ts)), scores on figures held out (`npm run world -- holdout`), a source's bias fitted. | Any node that is a field over the globe. Model records' `prior`, `observes` and `holdout` sections: the schema has none of them yet. |
| 2 | — | A prior from causes. The pilot's is HYDE's and the lists'. |
| 4 | A settlement's density pulled towards anchors near it in space and time. | Pooling by relatedness; a tradition carried beyond its regions. |
| 5 | — | Analogy as a method: the vocabulary has no term for it. |
| 6 | The settlement generator reads its people, density and fabric from nodes. | The generic house, the generic crops and the fields' calendar are still decided in the generator. |
| 9 to 16 | — | All of them. |

## The design: a graph of quantities

### 1. A quantity is a node, with a distribution, at any place and time

A node is something the world can be asked about anywhere: the people per hectare, a house's floor area, the share of
land under each crop, the month rice is planted. Asked at a place and time, it returns members (`core/samples.ts`,
member 0 central), the tier that answered (`core/resolve.ts`), and what the answer rests on.

The build's stages are already a graph ([dag.ts](../../tools/world/src/build/dag.ts)), and a model's record already says
what it reads and makes. A node adds what neither says today: its prior, how each kind of evidence observes it, and how
well it predicts evidence it did not see.

### 2. Every node has a prior from its causes

The prior is what the node would say with no evidence of this place: the people of a region from what its land grew,
the way of life that had reached it and how long before; a house's form from climate, materials and the house forms of
related peoples; crops from where they were domesticated, when they are known to have arrived, and what the climate
allows. The prior is the old generic tier done properly: it varies with place and time and says why, rather than
standing one house in for every city on Earth.

The pilot took HYDE's people for the prior of a region's. Decision 13 says why another's model is not one, and
decisions 9 to 11 say what a prior from causes is made of.

### 3. Evidence enters through an observation model, and conditions the estimate

A claim stops being the value and becomes an observation of a node. Its observation model says:

- **what it measures:** a sum over ground (people in a region), a mean over a sample (the floor area of excavated
  houses), a presence (a crop's seeds in a layer), a count (temples in a survey);
- **over what ground and when:** the area or record it counts, and its `valid` span. A figure with no date observes the
  record's whole span, weakly; it is never a point at the founding;
- **its error and bias:** how far a figure of its kind is from the truth, as a spread, and whether it runs high or low.
  A source's error is a parameter, fitted by how well its figures are predicted when held out.

Klassen et al.'s total of 248,696 for 770–888 is then an observation of the people summed over the 3,000 km² of the
Greater Angkor Region in that period. Their table says the embankments' share of it ranges from none to all of its
88,891, so the observation is a range from 159,805 to 248,696, not a point. Chandler's figure is an observation of the
core, with its own error. The two can no longer be read as one
series, because they observe different sums of one field.

Competing claims stay as they are ([RECORDS.md](../RECORDS.md#competing-claims)). A preferred claim observes the node, and
a deprecated one does not; an alternative's claims observe it only in that picture.

Decision 14 adds what an observation model needs for evidence of presence, and decision 15 the support every
observation has.

### 4. Estimates are pooled in a hierarchy, and carried by distance and relatedness

A node's parameters are pooled from the whole world down: global, culture area, region, site. Angkor's house sizes,
field sizes and densities borrow from monsoon Asia where Angkor has no evidence, and monsoon Asia from the world.

Cultural traits travel in two ways, and the model carries them both:

- **by distance** in space and time, as climate and crops do;
- **by relatedness:** peoples who speak related languages tend to build, farm and keep animals alike. The world
  already has Glottolog's languages and families; they give the distance by relatedness.

A tradition's record keeps its meaning and gains a softer one. Its regions and span say where and when it was attested.
The model carries it outward from there, with weight falling by distance and relatedness, instead of ending at the
region's edge.

### 5. Analogy is an observation with an error that grows with its distance

Nearly everything visible of Angkor in 850 comes from sources of 1100–1300, from Zhou Daguan in 1296, or from farming
observed in the 1990s. That is normal for most of history. Such a claim says what it borrows from (a time, a place, a
people), and its error grows with the gap in years, kilometres and relatedness. The panel then says "from Zhou Daguan,
450 years later". It ranks below direct evidence and above the prior. The vocabulary has no term for it yet, and the
first step that needs it adds one ([a new term](../RECORDS.md#a-new-term)).

### 6. Generators sample from nodes, and decide nothing themselves

The settlement generator draws from the density field, the house-size distribution with its classes, the crop shares
and the calendar. It decides where, never how many or what kind. This is the line STRUCTURE.md 3.4 draws, which the
people side does not yet keep: `genericFor`, the generic crops and the fields' calendar are decisions made inside the
generator.

### 7. A model is measured by what it predicts of evidence it did not see

Every node has a held-out score. Hold out a settlement's records (or a region's, or a source's), predict what they
observe, and score the prediction: the log of the predictive density, and whether the evidence falls in the 90% band
as often as it should. The scores go into `coverage.json` beside the tiers.

The places of judging below become the test set. A change to a model is an improvement only if the scores hold or
improve across it. This is the reconstruction as a test set, as decided on 22 November 2026, applied to the models the
world has now rather than to a future simulation.

Decision 12 says what is held out, and against what a score is read.

### 8. Fitted at build, cheap at query

Fitting happens in the build: the hyperparameters by held-out likelihood, the pooled parameters per culture area and
era, and the conditioned estimate near each piece of evidence. What ships is parameters and conditioned values on a
grid, in the field's tiles. Asking a node at a place and time evaluates closed forms on them. No sampling runs in the
browser. Where a node is conditioned on a few figures of one place, as a city's people are on its own, the closed form
is cheap enough to run where it is asked for, from the parameters the build fitted to the whole world.

The first nodes need nothing heavier than this:

- **a quantity that is a size or a count** (people per hectare, a floor area): Gaussian on its logarithm;
- **a share** (crops, animals, house classes): Dirichlet;
- **a presence** (a crop, a moat): Beta–Bernoulli;
- **smoothing in space, time and relatedness:** kernel weights, which is kriging on a log scale.

Each of these updates in closed form. A heavier engine waits until a node shows it needs one (decision 16).

### 9. The quantities stand in the order of their causes

A node's prior reads other nodes: the people of a region read what its land grew, and that reads the climate. So the
nodes are a graph by cause, and the work follows it. A node is worth building when what it reads can bear it. The node
most worth mending is the one that the most others read and that misses the most of its evidence held out.
[The quantities, in the order of their causes](#the-quantities-in-the-order-of-their-causes) lists them.

An arrow is drawn only where one quantity makes another, never because two go together. Going together is not enough,
for two reasons that matter here more than anywhere:

- **It does not carry.** Nearly every question the world is asked lies far from its evidence, in place or in time. A
  regularity read off where the evidence is thick holds elsewhere only if what made it holds there too. HYDE's rules
  for sharing people over the land are of this kind, and at Angkor they were out by twelve.
- **It mistakes the record for the world.** What has been found goes together with where people have looked
  (decision 14).

The evidence is too thin to tell a cause from a companion, so no arrow is learned from it. Each comes from the
sciences, written down as decision 11 says.

### 10. A node is of one of four kinds, by what it remembers

Nothing here steps the world forward (the decision of 22 November 2026). Causes do not need it: most quantities need
no history of their own, or one that can be written in closed form. A node's record says which kind it is.

- **At once.** Its value at a place and time is a function of its causes there and then, times a residual: the biome
  of the climate, how many people the land could feed under a way of life. The residual is a field of its own,
  alike at places near in space, time and relatedness (decision 4), and it is what the evidence conditions.
- **Settling.** It moves towards what its causes imply, over a time of its own, and shocks knock it off: the people of
  a region towards what the land could feed, the vegetation behind a changing climate. Its logarithm is a walk that
  is pulled back to the causes' value. The prior at a time is then a weighted history of what the causes implied,
  the weights falling with the years gone, and what is not explained wanders with a memory as long. It is still
  Gaussian, and conditions in the closed form the pilot built. The pilot's walk is this node with no causes and no
  pull. A shock is a dated event the node reads, a step of a size with a prior for its kind, which figures after it
  condition.
- **Spreading.** It arrives from somewhere, along paths: a taxon, a crop, a way of life, a family of languages, a
  craft. Its state is a surface of arrival times: at each place, the earliest of each origin's time and the cheapest
  journey from it, over a cost of the ground of the time (land and sea, relief, climate). The build solves it once
  for each member, as the life atlas already measures the way overland
  ([atlas.ts](../../tools/world/src/build/atlas.ts)), and "had it reached here by then" is one comparison. Its
  parameters are the speeds over each kind of ground. A dated first appearance observes it as a bound: the thing
  had arrived by then, which is what `start_before` means in a record. Its origins are records the world has:
  the domestications, the dispersals of *Homo sapiens*, a taxon's first fossils. A leaving is a second surface, or
  the record's `end`.
- **Contingent.** Which state, which ruler, the day of a battle. Nothing at the world's resolution predicts the
  instance. The evidence gives instances, and a model gives only their statistics: how many states, and how large,
  as the people and their means of travel allow. Generators draw from those, labelled (decision 6). A model that
  names an instance no evidence gives is wrong in kind.

Most quantities are a chain of the kinds. The people of the land are a way of life that spread there, what the land
could then feed at once, and the people settling towards it.

A quantity whose history fits none of these, as an ice sheet's does, is run elsewhere and comes in as a field
(decision 13), or waits.

### 11. A cause is written down, cited, and contested as a claim is

Each arrow is a mechanism in its node's record: its form, in words and in the code named, and each of its parameters
with a work and a locator, a claim of the world it `follows`, or a stated `choice`, as `params` are now.
[energy-balance.yaml](../../world/models/earth/energy-balance.yaml) is the pattern: a published model, each number
where its book gives it, each departure a choice that says so. A parameter the build fits says what it was fitted to,
and its prior.

Mechanisms disagree as sources do: whether people press on what the land can feed or raise it by working it harder;
whether farming spread by farmers moving or by their neighbours learning. Rule 4 holds for them. Rival mechanisms are
two models of one node, alternatives a reader can switch between, each with its scores. The default is the one that
carries best (decision 12), with a note saying why. Neither is deleted.

### 12. A model is held to what a cause must do

Decision 7's score stands. These make it a test of causes and not of smoothness.

- **Whole regions and whole eras are held out.** A figure predicted from its neighbours tests interpolation. A
  region predicted with every figure of it held out, or an era with every figure of its centuries, tests whether the
  mechanism carries. The score by block ranks models. The score by figure stays, for whether the bands are as wide
  as they should be.
- **A node must beat a smoother with no causes.** The baseline is decision 4's weights over the evidence alone, with
  the world's mean for a prior. Both scores stand in the node's record and on the coverage page. A mechanism that
  does not beat it by block has not earned its place, and its record says so.
- **Dated shocks are scored apart.** A change of known date in a cause, with evidence before and after, is the only
  experiment history gives. A node made of causes predicts the response; a smoother predicts none until a figure
  shows it. The world has a few written: the Younger Dryas and the last deglaciation, the end of the Pleistocene's
  large animals in North America, the impact that ended the Cretaceous. The Black Death, the plague of Justinian,
  the crops and diseases carried across the Atlantic after 1492 and the cold of 8,200 years ago are candidates, each
  needing figures on both sides of it.
- **A new figure is a test before it is evidence.** When a pull request adds a figure, the build before it predicts
  the figure, and that prediction is scored. It is the one test the model cannot have seen, and it costs nothing
  where the evidence is written by agents every day.
- **Another's model is scored beside ours,** on the same blocks (decision 13).

### 13. Another's model observes; it is not the prior

HYDE's people, a climate model's run, a compiled list of states: each comes in as a dataset whose source is of kind
`model` (section 4.10 of the design), and the world has drawn several as if they were the world.

- **Where a node has a prior from causes, another's model of its quantity observes it,** at the support of what that
  model rests on. HYDE's series for today's provinces and states rest on historical estimates; its sharing of them
  over the land is a rule. The first observes a sum over a province; the second observes weakly, or not at all.
- **Its error is fitted** to how well it predicts the evidence held out, so that it weighs what it has earned.
- **It is scored as a rival** on the node's blocks, and the coverage page shows both.
- **A mechanism's parameters are fitted to evidence, never to another's model,** or its regularities come in as ours.
- **Where the world has no such node yet, it stays the value,** in the tier `model`, as now.

### 14. Evidence has a model of how it came to exist

Almost all of the evidence is of presence, and all of it passed through what was preserved, what was found and what
was published. The world's own records say so: the atlas's lists "partly show where people have dug", the rock record
"leans as the fossils do, to Europe and North America", and of the states "an empty place is not an empty land". A
model that reads such evidence as the world learns the map of the digging.

- **Each kind of evidence has a field of effort:** how likely a thing that was there is to be in the dataset read.
  Its first cut is a count the world already holds: every collection of a stage within reach, for a fossil of one
  taxon; every dated sample of a region, for a site of one kind. Later cuts read its causes: rock of the right age
  at the surface, what a setting preserves, how near a road or a university.
- **An observation is "there, and found".** Nothing found where much was looked for is evidence of absence. Nothing
  found where nothing was looked for is no evidence. `resolve` can then tell the two apart, where today both fall to
  a stand-in or to unknown.
- **A count read as a measure is read over its effort:** sites, dated samples or inscriptions as a sign of people.
- **For figures it is decision 3's bias and decision 5's distance:** who counted, to what end, and how long after.

### 15. A quantity is a density, and every observation has a support

One estimate has to answer at every scale, from a continent's people to a village's, and the answers have to agree.

- **A node says what it is a measure of:** a density over ground (people to the km², the share of land under a crop,
  the chance a taxon lived there), or a statistic of a population (the floor area of houses, the sizes of
  settlements). A total is a sum of a density, worked out when asked, and never kept as a second estimate at another
  scale (rule 5).
- **An observation says its support:** its ground (a point, an outline, a record's extent, a region, a cell), its
  years (`valid`), and what it takes over them: a sum, a mean, a presence, a count or a bound. This is the pilot's
  `ground`, for every node. Two figures of different supports are never one series.
- **The estimate is made from coarse to fine.** On the pyramid of cells
  ([WORLD-MODEL.md](../WORLD-MODEL.md) section 7), a cell's value is its parent's, shared among the parent's
  children. The shares read the causes at the finer scale and the observations whose support is that fine. An
  observation conditions the level nearest its support, a sum carries it upward exactly, and the shares carry it
  down. On such a tree an estimate conditions in two passes, up and down, at a cost that grows with the number of
  cells and no faster.
- **Children sum to their parent.** A region's people and its towns' cannot then disagree, which the pilot could
  not promise: HYDE's people in a region may already count the town's.
- **Time is binned the same way,** coarse in deep time and fine in history, and a node is no finer than its causes
  and its evidence.
- **Asked finer than anything known, the band widens.** Each level adds a spread of its own, so a fine question far
  from evidence gets the coarse value with a wide band, and its tier says so. Below the finest level a node has,
  generators draw (decision 6), held to it in aggregate.
- **What ships** is each level's central value and band in the field's tiles (two or three layers, as STRUCTURE.md
  3.2 has it), and the fitted parameters for conditioning on a place's own figures where it is asked (decision 8).
  A question at a place, a time and a scale is a tile read, and at most one closed form.

### 16. Evidence does two jobs, and flows down the graph

- **It conditions the estimate near it, and it fits the mechanism everywhere.** The second job is how evidence
  reaches the places that have none. Angkor's figures say nothing of a delta nobody has surveyed. But they move what
  the world takes wet rice under a monsoon to feed, and that moves every such place. The parameters are pooled as
  decision 4 says.
- **Nodes are estimated in the order of their causes,** each from its own evidence. A node reads its causes member
  by member (`core/samples.ts`), so their spread carries on into it.
- **Evidence of a node does not move its causes,** except through the parameters fitted. This is meant: a wrong
  model of people should not bend the climate. Where it loses something, the node's record says so.
- **A heavier engine waits for a node that needs it.** Conditioning several nodes together can be done on the
  members: each is weighed, or moved, by how well it predicts an observation. The build may run more members than
  the sixteen it ships. None of it is built before a node shows the closed forms fail it.

## The quantities, in the order of their causes

Each row reads the rows above it. The kinds are decision 10's. The table is the short form of the
[graph of causes](../causes/README.md), which has each row as several nodes, the ground and the deep Earth above the
climate, every cause as an edge that says whether the world carries it, and a ranking of where the work is
(`npm run causes`).

| Quantity | Its causes | Kind | What observes it | Where it stands |
|---|---|---|---|---|
| Where the plates were | the mantle's flow, which nothing predicts | contingent | sea-floor stripes, old magnetism | One reconstruction to 1,100 Ma and one to 1,800 Ma, no spread. Their boundaries, which uplift follows from, are unread. The future's plates are not moved. |
| The height of the land | uplift where plates converge, wearing down after, the mantle's push | settling | measured old heights, beds of rock | Another's maps at 1° every 5 Myr, with no model behind them; a kilometre out against the range records. Today's shape is carried back to the Pliocene. |
| The depth of the sea floor | the floor's age, sediment | at once | today's surveys | The same maps' schematic depths. |
| Ice, sea level and the coast | the climate, the basins' room, the ice's weight on the crust | settling, and at once for the coast | isotopes, shorelines, marine and land beds | A stack every 1 kyr for 798 kyr over today's ground, the strongest part. Before it a curve that moves no coast. Ice for 80 kyr only, and no rebound. |
| The fine shape of the ground | the height of the land, wearing down, the rock | settling | today's surveys | 1.8 km cells, 30 m only round Rome; invented before the Pliocene. |
| The climate of each month: warmth and rain | the Sun, CO₂, where the land and its heights lay, the ice | at once | isotopes, fossil leaves, pollen, coals and salts | One run for each time (Li et al. 2022 for the Phanerozoic, Beyer et al. 2020 for the last 120,000 years), spread unknown. No evidence conditions it. The energy balance is made of causes and held to evidence, but knows only latitude. |
| Water: runoff, rivers, lakes | the climate, the relief | at once | rivers seen today, old shorelines and channels | `model:earth/water-balance` and `model:earth/drainage`, from causes. |
| What grew: the vegetation's growth and cover | the climate, CO₂, which plants there yet were | at once, settling behind a changing climate | pollen, plant fossils, coals | The climate's class read through thresholds; a vegetation model's growth for the last 120,000 years (`field:earth/net-primary-production`). No pollen. |
| Who lived where: each taxon's range | its climate, the way overland and by sea, when it arose and ended | spreading | fossils and today's sightings, each over its effort | `model:life/atlas`: tiers by distance and like climate. No effort. |
| A way of life's reach: people at all, then foraging, herding, each farming | where each began, the way there, what the climate lets grow | spreading | dated first appearances, the archaeologists' assessments, seeds and bones | ArchaeoGLOBE's 146 regions at ten times, the nearest time holding, with hard edges; the anthromes, which are HYDE's. |
| How many the land could feed | what grew, the way of life, water, soil | at once | densities of peoples whose way of life and land are known | Nothing. |
| People to the km² | what the land could feed, how long the way of life had been there, shocks | settling | censuses and surveys of regions, counts of sites over their effort, others' reconstructions (decision 13) | HYDE's grid, drawn as the value. The pilot's prior for a region is HYDE's. |
| Settlements: how many, how large, the share in towns | the people, the way of life, the routes by land and water | at once, for their statistics | lists of cities, surveys | The lists as rows; the pilot's nodes for one settlement's people, density and form. |
| What a people did: their language, houses, crops, calendar, animals | descent, neighbours, what the land gives | spreading, and at once from the land | traditions' records, excavations, the atlases of ethnographers | Glottolog's points for today only; traditions with hard edges; the stand-in for most. |
| States, wars, persons | — | contingent | records and rows | Cliopatria's rows and the world's records. No statistics. |

**How the gaps lie.** The same gap is at every row: the best model in each field is a prior made of causes, run as
an ensemble, conditioned on evidence through a model of how the evidence was found, and scored on what it did not
see. The world has pieces of that at each row and the whole of it at none. By size:

- **The ground is first for deep time and for the future,** and small for the last 800 kyr, where it is the best
  layer the world has. So the people's rows do not wait for it.
- **The climate is next,** and every row below reads it: no spread, no evidence conditioning it, one run to 10 Myr.
- **The people's chain,** from a way of life's reach to people to the km², is large at each step and missing
  outright at one: how many the land could feed.
- **Who lived where** has the most evidence behind the simplest rule, and no effort.
- **Water for the Quaternary and a settlement's people** are the nearest to the best buildable.

**The climate stands on the ground's maps.** The climate runs were made on the same maps of the land as the globe
draws. Replacing the central picture of the ground would leave the climate standing on other ground. So the ground
is mended in this order: a spread about the same central maps; corrections where evidence contradicts them, carried
into the climate by the downscaling to a place's height; and a whole other picture only once the climate can follow
it.

### What a scene reads

The nodes a settlement's scene draws from hang from the last rows above. They are the first plan's list, in its order.

| Node | Its prior | What observes it | What it feeds |
|---|---|---|---|
| People per hectare (built, the pilot) | HYDE's people of the cell, shared by the land's use (`model:people/lifeways`), until the people of the land have a node; settlement scaling for cores | every figure of people, houses and area, by its ground; regional totals; temple counts with people to a temple | the extent and zones of each settlement; the scene's farmsteads |
| A settlement's form (built, unscored) | regimes by lifeway and culture area: compact, dispersed, along embankments; the unit (household, compound, temple community), its spacing and clustering | measured plans; areas at dates; decision 8's measures in CITIES.md | the generator's layout |
| Houses | climate, materials and relatedness; size classes and their shares | building traditions; excavated houses; ethnographic surveys | the houses drawn, by class |
| Crops and fields | where each crop was domesticated and when it is attested arriving; what the climate allows | archaeobotany; farming traditions; texts | crop shares, field size and orientation, kept trees |
| The farming year | the place's own months (`spec.climate.months`): the onset of the rains, the frosts | farming traditions; texts that date sowing and harvest | each field's state in the month shown |
| Water works | the rains' seasonality, the crop, the density | mapped works; traditions | ponds, moats, reservoirs, terraces in the frame |
| Kept animals | domestication and attested arrival, the climate | zooarchaeology; husbandry traditions | the animals drawn |
| Institutions | shrines, markets and halls per people, by tradition and lifeway | mapped counts (the 1,177 temples of Greater Angkor that Klassen et al. 2021 date); records | the institutions on a town's plots |

## What changes in the records

- **A figure names its ground** (built). `population`, `houses` and `settlement_area` claims say what they count: the
  settlement, its `core`, its `region` or a `site`'s bounds today
  ([RECORDS.md](../RECORDS.md#what-a-settlements-figure-counts)). Without it, a figure counts the settlement.
  Decision 15 asks the same of every observation of every node, and the first node that needs a ground beyond a
  settlement's adds it.
- **A figure with no date observes the whole span** (built), so the five settlements whose undated figures were pinned
  to their founding (Caral, Çatalhöyük, Great Zimbabwe, Hattusa, Tikal) were mended by the same change as Angkor.
- **Analogy is a method,** with what it borrows from (decision 5).
- **Model records gain sections** (`world/schema/model.schema.json`):
  - `kind`: at once, settling, spreading or contingent (decision 10);
  - `prior`: the nodes it reads as causes, and for each the form it takes and where the form comes from, a cited work
    or a choice, as `params` are now (decisions 2 and 11);
  - `observes`: each kind of evidence it reads, with its support, its error and the field of effort it is read over
    (decisions 3, 14 and 15);
  - `holdout`: the blocks it is scored on, the baseline's score beside its own, and its rivals' (decisions 7, 12
    and 13).
- **Two models may make one node,** as alternatives (decision 11). The design gives each field one model at most;
  that changes with the first rival written.
- **A field of effort is a field like another,** made by a model from the dataset whose finding it describes.
- **A shock is an event's record** that a settling node names among its inputs, by kind.
- **No estimate is written back as a claim.** A model's output is a derived value (rule 5), and lives in its field.

## The pilot: people per hectare, end to end

Built as the [nineteenth slice](../slices/NINETEENTH-SLICE.md), which gives what each criterion below found. Two did
not hold, and [What the pilot found](#what-the-pilot-found) says what that changed here.

One node, taken through every layer as a slice ([CONTRIBUTING.md](../../CONTRIBUTING.md#larger-work-slices)), with its
criteria as tests.

**What it builds:**

1. **The ground of a figure** in the vocabulary, and the rule that an undated figure observes the span.
2. **`model:people/density`:** how densely each settlement lived, and how many people a region about one held beyond
   the town's. A settlement's density scale has a prior pulled towards those of the settlements near it in space and
   time whose own figures give their ground, and its own figures of people and ground condition it. A region's people
   have a prior of the settlement's and HYDE's in the region's ground, conditioned on the region's own figures, and the
   people beyond the town's are spread over the region's 5′ cells. Its observations are every claim of people, houses
   and area, each by its ground, and the lists' figures as observations of the settlement with their own error. It has
   members, and a held-out score.
3. **`model:people/city-population` reads the field:** the people of a settlement are the field summed over its ground,
   one series for each ground, and a record's figure no longer replaces a list's.
4. **`model:people/settlement-growth` reads the zones:** its ranking and cut stay as they are for the core. Where the
   field is below the compact regime, the ground is dispersed and drawn at the field's density, and the floor of 15
   people to the hectare goes.
5. **A held-out harness:** `npm run world -- holdout <model> [<record>…]` predicts each record's observations without
   them and scores the predictions; the build runs it over the places of judging and writes the scores to
   `coverage.json`.
6. **Angkor's evidence, as records:** Klassen et al. 2021's periods by zone, Hariharalaya and Mahendraparvata as
   Angkor's earlier cores with their dated monuments, from the texts already read for this plan (kept, git-ignored, in
   `.cache/source-texts/angkor/` of the worktree that wrote it).

**It works when:**

- Angkor's people have no saw-tooth: each ground's series is smooth where its evidence is.
- With Angkor's records held out, the band predicted for the people of the Greater Angkor Region in 770–888 overlaps
  Klassen et al. 2021's range for the period (159,805 to 248,696, Table 1), and the band for the metropolitan area
  outside the centres overlaps their 70,668 people on 294,153 ha.
- With them in, the region's people in that period fall within that range, and 851 is drawn with most of its people
  spread thinly over the region, not as one dense disc.
- No settlement has a figure at its founding that no source dates there.
- Rome in 100 CE and Tenochtitlan in 1519, held out, are scored too, and the scores are on the coverage page.
- Cities with one series of figures from the lists are drawn as before, within the fingerprint's tolerance.
- The panel shows, at any settlement, the prior, each observation with its pull on the estimate, and the spread.
- The fit adds less than a minute to a full build, and a query costs no more than the growth model's does now.

## After the pilot

Each a slice with a held-out score, on two tracks that do not wait for each other. On the people's track the people
of the land come first, ahead of what a scene reads, because every node of a scene reads them and the pilot found
them twelvefold out. Then, in the first plan's order: the farming year
(it needs no new data, only the place's months); crops and fields; houses with their classes; water works; kept
animals; institutions. The settlement's form is built, and wants its score. Each is judged, as well as by its score,
by a [visual-gaps](VISUAL-GAPS.md) card at the places of judging.

On the Earth's track the ground comes first, then the climate, then life. Three first steps need no new data:

- **the coast conditioned on the rocks:** a chance of sea for each cell and stage, from the marine and land beds the
  build already holds against it;
- **a range's height as an observation:** the eight range records condition the height of the land, so that the
  Himalaya's and the Alps' contradictions go;
- **the effort behind the fossils** (decision 14): every collection of a stage within reach, whatever it found.

After them: sea-level cycles before 798 ka and ice for every cycle, indexed to the last one's; relief at 30 m for
scenes of the human past; rival plate models as alternatives; and the climate as an ensemble conditioned on its
proxies.

### The people of the land, from causes

Three nodes in a chain, one of each kind that has a closed form, taken through every layer as one slice.

**What it builds:**

1. **Figures of regions, as records:** the test set. Only Angkor's record has figures of a region today. A bounded
   set of regions whose people were counted or surveyed, each figure with its ground and years, chosen across the
   continents and the ways of life.
2. **A way of life's reach** (spreading). The arrival of herding and of farming at each place, from the world's
   records of where each began, over the atlas's graph of the ground of the time, with the speeds fitted to when
   ArchaeoGLOBE's archaeologists first find each in a region, read as bounds and over their own least and most
   answers.
3. **How many the land could feed** (at once). People to the km² under each way of life, from the vegetation's
   growth (`field:earth/net-primary-production`) and the place's months, its parameters pooled over the world and
   fitted to the regions' figures.
4. **The people of the land** (settling). People to the km², towards what the land could feed since the way of life
   arrived, on the pyramid from 1° down to 5′, conditioned on the regions' figures by their grounds. HYDE observes
   it, with a fitted error.
5. **Blocks and a baseline in the harness:** `holdout` holds out a region or an era whole, and scores the smoother
   with no causes and HYDE beside the node.
6. **The pilot reads it:** a region's prior in `model:people/city-population` is this node's, in place of HYDE's.

**It works when:**

- With Angkor's records held out, the band for the people of the Greater Angkor Region in 770–888 overlaps Klassen
  et al. 2021's range, which the pilot's did not.
- Held out region by region, the node's score over the regions' figures is better than the baseline's and than
  HYDE's read as the value, and all three are on the coverage page.
- Held out continent by continent, the reach predicts when farming came to each of ArchaeoGLOBE's regions better
  than the baseline does.
- A region's people and the sum of its cells and towns are one number at every level of the pyramid.
- No node reads another's model as its prior.
- The panel shows the chain at any place: what grew, the way of life and since when, what the land could feed, and
  the people, each with its band and what observed it.
- What it contradicts is in its `disagrees`, with the numbers.
- The fit adds a few minutes at most to a full build, and a question is a tile read.

It leaves out shocks, and with them the plagues and conquests that the figures after them will show as misses; the
effort behind counts of sites; and every way of life finer than ArchaeoGLOBE's four.

### The settlement's form

`model:people/settlement-form`, the second node, decides how a settlement's people stood on its ground. In the design
built as the [twentieth slice](../slices/TWENTIETH-SLICE.md):

- **The fabric is the evidence's word.** A town is `compact`, houses packed along its lanes as the city system has drawn
  every town, or `dispersed`: its tradition's own settlements, each with its houses, ponds and shrine, set apart among
  fields, gardens and water. A town form says which (`fabric`), its record's or its townspeople's tradition's. Neither
  the density nor a village pattern can tell them apart: Angkor's households took about half its ground at its measured
  density, and so would Uruk's.
- **A dispersed town is a field of units.** Each unit is one of its tradition's settlements, as many households as the
  tradition says a settlement held, on the ground each household took, and the units are as far apart as the town's
  density, from the density node, leaves room for. What lies between is the open share of the town, farmed as its
  region farmed.
- **A unit keeps its place.** Units stand on a lattice of the town's own metres, each named by its place in it, and
  stand at a time where the growth model has built their ground then, so a link to one holds through the town's life.
- **What it is held to:** the households the units draw add up to the town's people; the open share is what the density
  leaves. No measured plan of a dispersed town is open to score it on yet. Chevance et al.'s plan of Mahendraparvata
  (2019), whose figures are CC BY, is the first candidate.

**The places of judging,** the test set for every node of a scene: Angkor in 850 and 1200; Rome in 100 CE;
Tenochtitlan in 1519; the Eastern Han hamlet of 147 CE; and one settlement in each culture area that has a broad
tradition, chosen where the evidence is best. The nodes above a scene are judged on blocks: the regions whose figures
are written, held out one at a time, and the eras.

**Candidate sources, not yet read and their licences not yet checked.** A work can be cited for its findings whatever
its licence; only a dataset the build imports must be CC0, CC BY or public domain (rule 6).

- Settlement scaling: Ortman, Bettencourt and colleagues, on how a settlement's area grows with its people.
- Fletcher, on low-density agrarian urbanism, Angkor's and the Maya's dispersed cities as a regime of their own.
- D-PLACE and the Ethnographic Atlas: house form, settlement pattern and subsistence for about 1,300 societies, tied to
  Glottolog's languages.
- Kohler et al. 2017 (*Nature*): the inequality of house sizes measured at dozens of sites, for house classes.
- FAO's GAEZ: crop suitability from climate. FAO data are often under a non-commercial licence, which would keep the
  data out while its findings can still be cited.
- Seshat: variables of polities. Its licence is likely to keep its data out.
- For how many the land could feed: Binford's densities of foraging peoples with their lands (2001), which D-PLACE
  carries; Tallavaara and colleagues, on foragers' density from the land's growth.
- For a way of life's reach: Ammerman and Cavalli-Sforza, and Fort, on the rate of farming's spread; Silva and
  Steele, on fitting routes and speeds to radiocarbon dates; the databases of dates themselves, p3k14c and XRONOS
  ([DATA-OUTLINE.md](../DATA-OUTLINE.md)).
- For figures of regions: the Han census of 2 CE by commandery; Domesday England; the Basin of Mexico survey
  (Sanders, Parsons and Santley); the lidar survey of the Maya lowlands (Canuto et al. 2018).
- For the climate conditioned on its evidence: the reanalyses of the last glacial maximum and since (Tierney et al.
  2020; Osman et al. 2021). Judd et al. 2024's, for the Phanerozoic, has no open licence
  (`field:earth/surface-temperature`).
- For pollen and the effort behind it: Neotoma.

## Other ways to do this

Considered on 27 November 2026, and what is kept of each.

| Way | What it is | Why it is not the plan | What is kept |
|---|---|---|---|
| Run the world forward, and keep the runs that meet the evidence | A simulation of people, crops and climate stepped through time, fitted by throwing out what misses. | The most causal, and the heaviest: every question needs a run from the start, and the world is a function of place and time with nothing carried forward (the decision of 22 November 2026). | A simulation can stand in for one node's prior, and is scored on the same blocks as what it replaces. |
| Learn the whole world | One network fitted to every field and figure, asked at a place, a time and a scale. | Cheap to ask, but it learns what goes together, including the map of the digging, and no answer can be traced to what it rests on. | An emulator of a slow model whose causes are written, such as a climate model, labelled as one. |
| Have agents write the priors | An agent reads the literature of a region and era and writes a wide prior, labelled a reconstruction. | Its held-out scores flatter it: the agent has read of the places held out. Only decision 12's new figures test it fairly. | A fallback for what a people did where no mechanism is known, scored on new figures only. |
| Smooth the evidence, with no causes | Decision 4's weights over the evidence alone. | It says nothing far from evidence, which is most of the world. | The baseline every node must beat (decision 12). |

## How this meets the other plans

- **[CITIES.md](CITIES.md).** Its layers, its ranking of the ground and its frame stand. Decision 3's area at a time
  comes from the density node rather than one density law. Decision 8's measured form becomes what observes the form
  node. Its open question 2, whether a tradition's density is a claim or a parameter, is answered: both, a claim that
  observes the parameter. Its rule "nothing predicts what was not recorded" changes: the models predict, with their
  spread, and say so. Its rules against forward modelling and invented districts stand: zones of density are a
  model's output, labelled, never a district.
- **[HUMAN-LANDSCAPE-REALISM.md](HUMAN-LANDSCAPE-REALISM.md).** Its third milestone, regional crops and their seasons,
  becomes the crops and farming-year nodes; its other milestones are generator craft and stand.
- **[VISUAL-GAPS.md](VISUAL-GAPS.md).** Its researched briefs are the test set of the look, as the held-out scores are
  the test set of the numbers.
- **[ENTITIES.md](ENTITIES.md).** A list of things is evidence of presence, read over its effort (decision 14): what a
  list lacks is not thereby absent. The lists' trees give the relatedness decision 4 carries a trait by.
- **[STRUCTURE.md](../STRUCTURE.md).** Members stay the currency (3.2), and a node reads its causes member by member.
  The tiers stand (3.3), and effort lets a tier tell "looked for and not found" from "not looked for". The line
  between a model and a generator stands (3.4), and decision 15 says where on the pyramid it falls.
- **Simulation.** Nothing here steps the world forward. The four kinds give each node its causes in a form that is
  solved once in the build and asked anywhere, which keeps the decision of 22 November 2026 to leave causal
  simulation for later. A future simulation would be scored against the same test set, a node at a time.

## What it will not do

- **No forward simulation,** and no forecasts.
- **No inference in the browser,** and none per question.
- **No data outside the licences.**
- **No estimate stored as a claim,** and no model tuned to hide what it cannot fit: what it contradicts goes in its
  `disagrees`.
- **No hard edges where the evidence has none.** A tradition fades with distance and relatedness; it does not stop at a
  line.
- **No arrow learned from the evidence,** and none drawn because two things go together.
- **No instance from a model.** A state, a ruler or a battle that no evidence gives is a generator's, labelled.
- **No estimate kept at two scales.**

## Open questions

1. **The form of a figure's ground:** settled by the pilot for settlements, as a small vocabulary with an area beside
   it. A region is still a disc about the record's point. What names the ground of an observation that is no
   settlement's: an outline, a record's `extent`, a cell?
2. **How a source's error is set:** the pilot fits a list's and a work's bias to their figures held out, and takes a
   choice where there are too few. How few is too few?
3. **Distance by relatedness:** Glottolog's classification gives families and branches, not branch lengths. Is a count
   of steps up the tree enough?
4. **What the generic tier means** once every node has a prior: the prior without pooling below the culture area, or
   kept for nodes with no model at all?
5. **How many members:** sixteen (`MEMBERS` in `core/samples.ts`) for every node, or more where a node's spread is wide?
6. **The blocks:** ArchaeoGLOBE's regions, culture areas, or continents? Too small and a block's neighbours give it
   away; too large and there are too few to score on.
7. **Where a new figure's test is kept.** The prediction made before a figure was merged is not derivable after it
   (rule 5 keeps derived values out of the records). A comment on the pull request, or a log the build reads?
8. **Rivals of one node:** how the viewer names two models of one quantity, and what a node downstream reads when
   the reader switches.
9. **How fine a way of life is:** one surface for farming, or one for each crop complex, each from its own
   beginning?
10. **The effort behind figures.** Nothing counts the censuses that were never taken. Is the bias of a kind of
    source enough, or does a region with no figure at all need a term of its own?
11. **How far down the pyramid a node goes** before a generator takes over: where its causes stop varying, or where
    its evidence does?
12. **Evidence that should move a cause.** Fossil leaves observe the climate directly. A city's people where the
    climate run has a desert do so only through a model. Is there a case where decision 16's rule loses too much?
13. **A second picture of the ground.** What would let the climate follow another reconstruction of the land: runs
    on it, or an emulator across grounds?
14. **The ranking's arithmetic.** The graph ranks by gap times reach, a node read through others counting 0.6 a
    step, on gaps of five coarse levels. Is that the right weight, and should a gap be a score once nodes have one?
