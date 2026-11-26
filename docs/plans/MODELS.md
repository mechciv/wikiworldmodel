# Models: an estimate everywhere, with the evidence as what it observes

Status: proposed, 25 November 2026. Its pilot is built as the [nineteenth slice](../slices/NINETEENTH-SLICE.md), which
says what it leaves out and how it differs from what is written here; the nodes after it are not built. It changes how
the people side of the world is made, and
touches [CITIES.md](CITIES.md), [HUMAN-LANDSCAPE-REALISM.md](HUMAN-LANDSCAPE-REALISM.md) and
[VISUAL-GAPS.md](VISUAL-GAPS.md); [How this meets the other plans](#how-this-meets-the-other-plans) says how. It keeps
the design's three kinds of content ([STRUCTURE.md](../STRUCTURE.md) section 1.1) and its contracts: uncertainty as
samples (3.2), every layer answering in a tier (3.3), and the line between a model and a generator (3.4).

## Why

For most of history the evidence is thin, and for most places it is none. The world should still give its best
estimate of any quantity at any place and time: how many people, how densely, in what houses, growing what, on what
calendar, with what water works and animals. Evidence, data and the historical sciences should inform **models**, and
the models should give the estimate, its spread, and what narrowed it.

The people side of the world does the reverse today. Evidence is what is drawn, and a model fills only the gaps between
figures. Angkor at 851 CE, as the viewer draws it, shows what that costs:

| What the viewer gets wrong | Why | Kind |
|---|---|---|
| 750,000 people at the founding | A figure with no date is pinned to the record's start ([landscape.ts](../../tools/world/src/build/landscape.ts), around line 615). | bookkeeping |
| The people leap between 90,000 and 800,000 from one figure to the next | A regional total (Klassen et al., 3,000 km²) and a city's count (Chandler) are read as one series, and a record's figure *replaces* the lists' rather than informing them ([citypop.ts](../../core/citypop.ts)). | model |
| One dense disc of about 210 km² | One regime of density, with a floor of 15 people to the hectare ([growth.ts](../../core/growth.ts), `GROWTH_DEFAULTS.density.least`); outside its centres, Angkor's metropolitan area held about 0.2 in 770–888 (Klassen et al. 2021, Table 1). | model |
| The court is in the wrong place in 850 | Hariharalaya, at Roluos, has no record. | evidence |
| The townspeople's houses are the global stand-in, an 11 m courtyard house | A tradition holds inside its regions or not at all; the one for Southeast Asia names farmers only, and nothing carries what neighbours or related peoples did. | model |
| Dryland millet and winter wheat | Crops are chosen by the climate's class alone (`genericCropsFor`, [dwelling.ts](../../core/dwelling.ts)), with no geography of crops. | model |
| Rice ripe in August | The fields' calendar runs on the month's number, as in a temperate summer ([plots.ts](../../core/plots.ts)), not on the place's rains. | model |
| No ponds, moats or temples | Nothing predicts water works from the rains, the crop and the density; the vocabulary has no pond. | model |
| Every house the same size | No spread of size, and no rank. | model |
| No kept animals | No stand-in for husbandry where no tradition holds. | model |

Eight of ten are failures of modeling. The test this plan sets: **the world should draw a believable Angkor in 850 with
none of Angkor's records**, from the monsoon, wet rice, the region's people and what is known of related peoples, and
Angkor's records should then sharpen it. Today it cannot.

## Where it stands

The design already puts models between the evidence and the generators (section 4.10 of
[WORLD-MODEL.md](../WORLD-MODEL.md)), but the two sides of the world are unequal.

- **The Earth's models predict from causes.** The energy balance, the water balance, the biome from the climate and the
  drainage each give an estimate anywhere their inputs reach, and are held to evidence they do not read.
- **The people's models smooth evidence or follow rules of thumb:**
  - `model:people/city-population` draws a constant rate between figures, and a record's figure takes the place of a
    list's within 25 years;
  - `model:people/lifeways` is, in its own words, "a set of rules of thumb" joining HYDE to the archaeologists'
    survey;
  - `model:people/settlement-growth` ranks ground and cuts it at an area set by one density law, clamped to a floor and
    a ceiling.
- **Traditions are parameters fitted by hand, with hard edges.** A building, farming or husbandry tradition holds in its
  ArchaeoGLOBE regions and span, and outside them the drawing falls to one global stand-in keyed by climate. In 500–1000
  CE, 99% of the people of towns and cities are housed by the stand-in (`coverage.json`, build d743ebb).
- **Evidence overrides; it does not inform.** A preferred claim is the value. Nothing weighs a figure by what it counts,
  how good it is, or how far it lies from the place and time asked.

The evidence machinery is not the problem. Sources, locators, quotes and the checking ladder are what make a model
fittable and testable, and what will make its estimates believable. What is missing is the layer that turns that
evidence into estimates everywhere.

## The design: a graph of quantities

### 1. A quantity is a node, with a distribution, at any place and time

A node is something the world can be asked about anywhere: the people per hectare, a house's floor area, the share of
land under each crop, the month rice is planted. Asked at a place and time, it returns members (`core/samples.ts`,
member 0 central), the tier that answered (`core/resolve.ts`), and what the answer rests on.

The build's stages are already a graph ([dag.ts](../../tools/world/src/build/dag.ts)), and a model's record already says
what it reads and makes. A node adds what neither says today: its prior, how each kind of evidence observes it, and how
well it predicts evidence it did not see.

### 2. Every node has a prior from its causes

The prior is what the node would say with no evidence of this place: the people of the region from HYDE and the
land's use; a house's form from climate, materials and the house forms of related peoples; crops from where they were
domesticated, when they are known to have arrived, and what the climate allows. The prior is the old generic tier done
properly: it varies with place and time and says why, rather than standing one house in for every city on Earth.

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

Each of these updates in closed form. A heavier engine waits until a node shows it needs one.

## What changes in the records

- **A figure names its ground.** `population`, `houses` and `settlement_area` claims say what they count: the record's
  core, the settlement, or a named region (an outline, or a record's `extent`). The form of this is settled in the
  pilot's first step. Without it, a figure counts the settlement.
- **A figure with no date observes the whole span,** so the five settlements whose undated figures are pinned to their
  founding today (Caral, Çatalhöyük, Great Zimbabwe, Hattusa, Tikal) are mended by the same change as Angkor.
- **Analogy is a method,** with what it borrows from (decision 5).
- **Model records gain three sections** (`world/schema/model.schema.json`): `prior` (where its prior comes from, a
  cited work or a choice per parameter, as `params` are now), `observes` (each kind of evidence it reads, with its
  observation model and error), and `holdout` (the test that scores it, and on what).
- **No estimate is written back as a claim.** A model's output is a derived value (rule 5), and lives in its field.

## The nodes, in order

| Node | Its prior | What observes it | What it feeds |
|---|---|---|---|
| People per hectare | HYDE's people of the cell, shared by the land's use (`model:people/lifeways`); settlement scaling for cores | every figure of people, houses and area, by its ground; regional totals; temple counts with people to a temple | the extent and zones of each settlement; the scene's farmsteads |
| A settlement's form | regimes by lifeway and culture area: compact, dispersed, along embankments; the unit (household, compound, temple community), its spacing and clustering | measured plans; areas at dates; decision 8's measures in CITIES.md | the generator's layout |
| Houses | climate, materials and relatedness; size classes and their shares | building traditions; excavated houses; ethnographic surveys | the houses drawn, by class |
| Crops and fields | where each crop was domesticated and when it is attested arriving; what the climate allows | archaeobotany; farming traditions; texts | crop shares, field size and orientation, kept trees |
| The farming year | the place's own months (`spec.climate.months`): the onset of the rains, the frosts | farming traditions; texts that date sowing and harvest | each field's state in the month shown |
| Water works | the rains' seasonality, the crop, the density | mapped works; traditions | ponds, moats, reservoirs, terraces in the frame |
| Kept animals | domestication and attested arrival, the climate | zooarchaeology; husbandry traditions | the animals drawn |
| Institutions | shrines, markets and halls per people, by tradition and lifeway | mapped counts (the 1,177 temples of Greater Angkor that Klassen et al. 2021 date); records | the institutions on a town's plots |

## The pilot: people per hectare, end to end

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

In order, each a slice with a held-out score: the settlement's form, which the pilot showed matters most at Angkor
(drawn at its measured density of about 28 to the hectare, its town is large plots of trodden ground with one generic
house each, where the evidence has houses on mounds among gardens, ponds and fields, in temple communities); the farming
year (it needs no new data, only the place's months); crops and fields; houses with their classes; water works; kept
animals; institutions. Each is judged, as well as by
its score, by a [visual-gaps](VISUAL-GAPS.md) card at the places of judging.

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

**The places of judging,** the test set for every node: Angkor in 850 and 1200; Rome in 100 CE; Tenochtitlan in 1519;
the Eastern Han hamlet of 147 CE; and one settlement in each culture area that has a broad tradition, chosen where the
evidence is best.

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
- **Simulation.** Nothing here steps the world forward. Each time is estimated from its own inputs and evidence, which
  keeps the decision of 22 November 2026 to leave causal simulation for later; a future simulation would be scored
  against the same test set.

## What it will not do

- **No forward simulation,** and no forecasts.
- **No inference in the browser,** and none per question.
- **No data outside the licences.**
- **No estimate stored as a claim,** and no model tuned to hide what it cannot fit: what it contradicts goes in its
  `disagrees`.
- **No hard edges where the evidence has none.** A tradition fades with distance and relatedness; it does not stop at a
  line.

## Open questions

1. **The form of a figure's ground:** a reference to an outline or record, or a small vocabulary (core, settlement,
   region) with an area beside it?
2. **How a source's error is set:** a choice per source, or fitted from its held-out figures once there are enough?
3. **Distance by relatedness:** Glottolog's classification gives families and branches, not branch lengths. Is a count
   of steps up the tree enough?
4. **What the generic tier means** once every node has a prior: the prior without pooling below the culture area, or
   kept for nodes with no model at all?
5. **How many members:** sixteen (`MEMBERS` in `core/samples.ts`) for every node, or more where a node's spread is wide?
