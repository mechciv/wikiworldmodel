# The record sets

Status: where each of the [roadmap's](archive/ROADMAP.md) twenty record sets stands, what it added, and what a
reviewer should look at first. All of it was written by machines and is `proposed`: nothing here has
been checked by a person, which is set 20. The three steps that come out of sets 1–3 are in
[SIXTH-SLICE.md](slices/SIXTH-SLICE.md).

| # | Set | Stands | Where |
|---|---|---|---|
| 1 | Biomes through time | done, derived from a climate model rather than from lithologic indicators | `world/fields/earth/{climate,biome}.yaml`, `world/entities/life/transitions/`, `world/entities/life/fossil-forests/` |
| 2 | Life's great transitions | done, bar what is noted | `world/entities/life/transitions/`, `world/entities/life/occurrences/` |
| 3 | Dinosaurs from a PBDB snapshot | the Hell Creek's, not all of them | `world/snapshots/pbdb-hell-creek-2026-11-04.json`, `world/entities/life/hell-creek/` |
| 4 | The ice ages | done, with the ice sheets of the last 80 kyr on the globe | `world/fields/earth/{co2-ice-core,methane-ice-core,antarctic-temperature,sea-level-stack,ice-sheets,ice-sheet-sea-level}.yaml`, `world/entities/earth/ice-ages/`, `world/snapshots/paleomist-1.0-ice-thickness.zip`, `world/alternatives/laurentide-mis3*` |
| 5 | Hominins and their tools | done | `world/entities/life/hominins/`, `world/entities/people/prehistory/` |
| 6 | Dispersals, with ancient DNA | done | `world/entities/people/dispersals/`, `world/alternatives/leaving-africa*`, `world/alternatives/peopling-of-the-americas*` |
| 7 | Megafauna extinctions | done | `world/entities/life/megafauna/`, `world/alternatives/megafauna-causes*` |
| 8 | Domestication worldwide | done | `world/entities/people/domestication/` |
| 9 | Population and land use (HYDE) | where people lived as a 1° grid over the globe, 10,000 BCE to 2015; the world's population, cropland and grazing land as series; since the eleventh slice, every 5′ cell's anthrome from Anthromes 12K, ArchaeoGLOBE's assessments by region, and the lists of cities ([HUMAN-LANDSCAPE.md](HUMAN-LANDSCAPE.md)); no grid of land-use shares | `world/fields/earth/{population,world-population,cropland,grazing-land}.yaml`, `world/fields/people/`, `world/snapshots/hyde-3.2.1-*.csv`, `world/snapshots/archaeoglobe-2019-assessments.csv`, `world/snapshots/reba-2016-*.csv` |
| 10 | States worldwide from Cliopatria | done as rows, not records; since the twelfth slice, states with records draw their own rows, 19 of them now ([TWELFTH-SLICE.md](slices/TWELFTH-SLICE.md), [FIFTEENTH-SLICE.md](slices/FIFTEENTH-SLICE.md)) | `world/fields/earth/polities.yaml`, `world/entities/people/polities/` |
| 11 | People and offices | done, for 44 rulers | `world/entities/people/rulers/`, `world/entities/people/polities/` |
| 12 | First cities, writing, languages | done; languages as rows | `world/fields/earth/languages.yaml`, `world/entities/people/first-cities/`, `world/entities/people/writing/` |
| 13 | Routes and trade | done, but for the Silk Road's lines | `world/fields/earth/roman-roads.yaml`, `world/entities/people/trade/` |
| 14 | Objects that move | done | `world/entities/people/objects/` |
| 15 | Disasters | done, as rows | `world/snapshots/noaa-hazards-2026-11-04.json`, `world/fields/earth/hazards.yaml` |
| 16 | Day length and the Moon | done | `world/entities/earth/day-length/`, `world/fields/earth/day-length.yaml` |
| 17 | Biodiversity through time | done for animals, uncorrected | `world/snapshots/pbdb-diversity-2026-11-04.csv`, `world/fields/earth/genera-through-time.yaml` |
| 18 | The present | land borders and cities; coasts remain the elevation field's | `world/fields/earth/present-day.yaml` |
| 19 | Futures | done | `world/entities/earth/futures/`, `world/alternatives/ipcc-ar6-scenarios*`, `world/alternatives/next-supercontinent*` |
| 20 | The first human reviews | **not done, and not a machine's to do** | |

## Rows over the globe

Sets 10, 12, 13, 15 and 18 add a new way of holding what has thousands of members: a field with
`grid: { kind: rows }`, whose rows stay rows of a pinned dataset, thinned for the globe, and are drawn on a
canvas over it (`core/layers.ts`, `tools/world/src/build/layers.ts`, `viewer/src/ui/layers.ts`). They are not
records: they are not dated by the solver, and a click says what the dataset says of a row. Search finds only the states,
by name, and a row an overlay ties to a record as that record.
Their tests are `tools/world/test/layers.test.ts` and `viewer/test/e2e/layers.spec.ts`.

- **States.** All of Cliopatria's rows at the time shown, tinted and outlined, the largest named; Rome's are
  left to its own records. The file is 18 MB (5 MB gzipped), loaded only once a past time is shown.
- **Roads.** Itiner-e's, thinned to about 2 km, from 300 BCE to 300 CE unless a stretch has dates of its own.
  Only about 2.7% of its 299,000 km is marked as certain, and the rest is drawn fainter.
- **Today's map.** From the time axis's present, 1950 (the datum geology dates from), although the lines are
  of about 2020. Its disputed lines are dashed.
- **Hazards.** 9,123 of NOAA's eruptions, earthquakes and tsunamis as rings around their years.
- **Languages.** Glottolog's points, by family, for the present only, behind a button in the *Layers* menu.

## A grid over the globe

Set 9's people are the one layer that is not rows: a field with `grid: { kind: lonlat }` and `data.as: people`, which the build reads itself
into one binary file, `people.lwt` (`peopleLayer` in `tools/world/src/build/layers.ts`), and the **People** button of the *Layers* menu draws
(`PeopleLayer` in `viewer/src/ui/layers.ts`). Its tests are `tools/world/test/people.test.ts`, the people test in
`tools/world/test/build.test.ts` and three in `viewer/test/e2e/layers.spec.ts`.

- **Through the globe's shader, not on a canvas.** The other layers are drawn on canvases over the globe, and a better fit appeared for this one.
  A density is a picture of the surface, not rows at places. On a canvas it would be up to 15,000 quads a frame, each hanging over the
  sea along a coast. As a map texture, the way a polity's territory is drawn, its coasts are the field's and it costs nothing while the
  globe turns. The shader only reads it when the button is on, so the golden images do not move.
- **What goes with it.** It dims the land, so that people show against desert and ice alike. The clouds, which are made up, thin to
  30%, and the states of the world are drawn as outlines only, so that neither hides it.
- **What it says.** The legend says *reconstruction* and *not a count*, and gives the scale. A click on the land gives the cell's people, its density,
  what HYDE gives at the steps on either side, the authors' range at that time, and how the people were placed. Numbers come from the
  snapshot and the field's `params`: the scale and the range are in `world/fields/earth/population.yaml`, not in code.
- **A snapshot, not the archive.** [CONTRIBUTING.md](../CONTRIBUTING.md) says a different file is a different dataset, so this is one:
  `src:hyde-3.2.1-population-grid` has its own id, file and sha256, its title and credit say the cells were added up, and its header lists each
  of the 74 members it came from with its CRC-32 and sha256. It stands in for nothing pinned, and it is what that rule asks for: the rule forbids
  swapping a file under a pinned id, not deriving a new one. Pinning the archive instead was weighed and refused. It is 5.3 GB, four times every other dataset
  together, for grids that are an eighth of it, and `fetch` holds a download in memory and its zip reader refuses Deflate64. What is given up is the
  archive's SHA-1: neither archive was downloaded whole, so only each member's CRC-32 was checked, against the directory at the archive's end. What
  keeps it honest is that `npm run world -- hyde-snapshot` makes the file again from the archive, reading 690 MB by range requests, with its own small
  reader for Deflate64 (`tools/world/src/hyde.ts`, tested against a file 7-Zip made); it was run twice, to the same bytes. A test adds up each step against
  HYDE's own table: within 0.003%.
- **Why 1° and all 73 steps.** The globe's land is a 1° grid, so anything finer would be sharper than the coast it is clipped to, and 0.5° would be 17 MB.
  At 2° it would be 1.8 MB. The yearly steps from 2001 could go, for 1 MB, but keeping them needs no explaining.
- **What it costs.** 5.5 MB in the repository, the largest snapshot by far (2.4 MB gzipped); 4.5 MB in a build of 157 MB (2.8 MB gzipped), loaded only
  when the button is pressed.

## What to look at first

Each set's agent read what it cites, checked its quotes by script and listed its doubts. They are kept here
so that they are not lost with the sessions that raised them.

### The licences to check

- **Itiner-e** (`src:itinere-2024`). Its Zenodo record shows no license field; its About page says CC BY 4.0, and an older page was
  read as saying non-commercial. If that is right, the roads must go.
- **NOAA's hazards** (`src:noaa-hazards-2026-11-04`). Taken as public domain, as the work of a US government agency. Its metadata
  pages could not be reached to confirm it.
- **`CC-BY-3.0`** was added to `publish.licenses` by set 4: see below.
- **PaleoMIST 1.0** (`src:paleomist-1.0`). PANGAEA's page says CC BY 4.0, which is clear, but the archive was read by range requests and
  not whole. Its `calc_sl/` folder is GPL by its readme, and is not used. Its thickness was computed with RTopo-2 and ICEBRIDGE data under
  the ice, whose own licences were not read.
- **The lists of cities** (`src:reba-2016-modelski-ancient-v2`, `src:reba-2016-chandler-v2`, eleventh slice). Taken as CC BY 4.0, as the world's
  record of the article has it and as Europe PMC gives the article's; the figshare records' own licence fields could not be read again from
  here, as their API host was not reachable.
- **Anthromes 12K** (`src:anthromes-12k`). Dataverse says CC0 1.0; the archive's own readme states no licence. It classifies HYDE 3.2, whose
  readme says CC BY 3.0, and HYDE is credited with it. The replication scripts, read for the classification's rules, are GPL v3 and limited to
  noncommercial research by their readme, and are not imported.

### The alternatives a build shows

What a build shows is a steward's decision (section 4.4 of the design), and no steward has made one. The five groups of sets 6, 7 and
19 and the one of set 4 are shown on a machine's proposal, behind the **Alternatives** button of the *Layers* menu: their `show:` lists are what to change. None is
anyone's default. They cost a build about two minutes and 18 MB. The twelfth slice adds three groups of perspectives, shown on the
same footing: who carried on the Roman Empire, Germany after 1945, and the Mongol Empire after 1260. The fifteenth adds a fourth,
whose account of the conquest of Mexico, with no default: the default picture keeps what both sides say. No build works out combinations: where two groups are chosen, a
record takes its time from the first of them that moves it.

### Set 1: biomes and fossil forests

- What may grow is gated by the transitions with a `cover` claim, and the rest is Li et al.'s climate read through Peel et al.'s
  thresholds. So a biome is a reading of a climate model, not a record of what grew there. Lithologic indicators (coals, evaporites,
  tillites) were not imported, and they are what would test it.
- **The Hell Creek reads cold.** The climate field has the coldest month below freezing there, where fossil leaves (Wilf et al. 2003)
  give mean annual temperatures of about 12–20 °C. The scene follows the field, and nothing yet sets the two side by side.
- Reefs are left empty from about 372 to 347 Ma and from the end-Permian to the Anisian, with notes; Cambro-Ordovician microbialite
  and Carboniferous episodes were added to the brief's list. Rudists as reef builders are disputed.
- Forests' `end` is a reading of "widespread *Archaeopteris*", and land plants' `end` is indirect. The microbial start of 3220 Ma has no
  uncertainty and is preferred over the 3.48 Ga hot springs editorially.
- Among the 15 fossil forests, Pine Island Bay is roots only though it has `in-situ-forest`; Collinson Ridge is Permian or Triassic;
  the Petrified Forest is `body-fossil`; Rusinga's stage is the PBDB's for the whole island; and seven sites are gazetteer points.
  Strathcona Fiord replaced Axel Heiberg in the list, and Bosques Petrificados replaced Cerro Cuadrado.
- The full texts of Davies 2024 and Berry & Marshall stopped at bot checks, and about 20 works were read as abstracts only.

### Set 2: life's great transitions

- 14 transitions with no `cover`, tied to 37 occurrences by a new relation, `evidenced-by`, which has no meaning in time:
  contested evidence must not bind the solver. A competing `start` names an occurrence as its value where the date is that
  occurrence's.
- Preferred ranks another reviewer might choose differently: eukaryotes, Javaux 2025 (one author, 1.78–1.73 Ga) over Porter's
  ca 1650 Ma; multicellularity, Qingshania over Bangiomorpha; animals, 558 Ma over Charnia at 574 Ma; amniotes, Hylonomus over
  Long 2025's tracks; Pneumodesmus, Wellman 2024 (Homerian) over Suarez 2017 (414 Ma), with a 2025 preprint against Wellman.
- Long 2025's tracks contradict the molecular intervals in `life/taxa/amniota` and `tetrapoda`, so they are placed only in
  `gnathostomata`. Those taxa may want a competing claim.
- Transition ends are readings: no source gives an end for eukaryotes, skeletons, animals on land, tetrapods or flowers.
- Several ± values have no stated level and are read as 1σ, Charnia's among them. Preondactylus, Delitzschala and
  Archaefructus use the PBDB's ages. The Francevillian's frame is the present-day one, as plate 701's polygon starts at 600 Ma.
- Coarse points: McDermott is basin-wide; Zachełmie, Barjarg, Ludford, Fortune Head and Weiach are gazetteer points near the sites.

### Set 3: the Hell Creek

- Sizes that look wrong or rest on little: *Pachycephalosaurus* at 7 m (Holtz) beside 370 kg; *Acheroraptor*'s sizes are *Deinonychus*'s,
  through a blog post by Evans; *Amesoneuron*'s 12 m is *Trachycarpus*'s as a stand-in; the *T. rex* hip of 4 m comes from a news report,
  with 3.66 m preferred; *Torosaurus*'s mass is from a restoration of "*Triceratops* or *Torosaurus*".
- *Triceratops*'s mass runs from 6,420 to 13,536 kg, with 7,400 preferred. Plant heights are the maxima of living species, *Sequoia* at 110 m.
- The agent found that Wilf's ages need about +0.5 Myr, and left them as they stand. Hirayama 2021 is in a Medwin journal.
- *Ginkgo* is drawn with the broadleaf kit, for want of its own.
- Not read: Falkingham 2026, Persons 2020, Sprain 2015 and 2018, Johnson 2002, the supplement of Wilson 2013. Evans 2013 was read as an abstract only.
- Six taxa are left out of the scene, each saying why: *Alphadon*, *Dryophyllum*, *Hydropteris*, *Marmarthia*, *Plesiobaena* and the ferns as a
  group. Birds, fish, amphibians, insects and most lizards have no body plan yet, so the scene is not all that lived there.

### Set 4: the ice ages

- `CC-BY-3.0` was added to `publish.licenses`: it fits "CC BY", but it widens the filter. Without it the
  Antarctic temperature and sea-level series go; CO₂ and methane stay.
- NOAA's own files state no license and name European contributors, so they were not taken as US government
  works. The series read openly licensed copies, compared row by row against NOAA's: the IPCC AR6 table of
  Figure 2.4, and PANGAEA's copies of Jouzel and of Spratt & Lisiecki.
- CO₂ and methane are not pure ice-core series: the last rows are from the IPCC's annex, and they are on two age
  scales that differ by a median of 0.8 kyr and up to 6 kyr.
- LGM dates prefer Clark 2009; LGM and Last Interglacial sea levels prefer the AR6 ranges; b2k ages are
  converted by subtracting 50; maximum counting errors are read as 2σ.
- No `ice_reach` on the LGM: a single latitude would misdraw its sheets, and in the field's span below the field takes its place anyway.
- PANGAEA generates its text files, so a change of metadata there would break their checksums.

**The ice sheets.** `field:earth/ice-sheets` draws PaleoMIST 1.0 (Gowan et al. 2021) on the globe from 80 ka on, and holds today's ice as the
elevation holds today's land. A click on the ice says what the dataset gives there and how far to trust it. `field:earth/ice-sheet-sea-level`
adds it up, beside the sea-level stack in the planet's panel. The tests are `tools/world/test/ice.test.ts`, the group `the ice sheets` in
`tools/world/test/build.test.ts` and `viewer/test/e2e/ice.spec.ts`. What each candidate's license says, as read on 4 November 2026:

| Dataset | Reach | What it says | Here |
|---|---|---|---|
| PaleoMIST 1.0 ([PANGAEA.905800](https://doi.org/10.1594/PANGAEA.905800)) | the world, 80 ka–now, every 2.5 kyr | "Creative Commons Attribution 4.0 International (CC-BY-4.0)" | imported, as a 1.1 MB snapshot |
| NADI-1 (Dalton et al. 2023, [Zenodo 8161764](https://doi.org/10.5281/zenodo.8161764)) | North America, 25–1 ka, every 500 yr, with minimum and maximum | Zenodo's field: CC BY 4.0 | checked against, below |
| DATED-1 (Hughes et al. 2016, [PANGAEA.848117](https://doi.org/10.1594/PANGAEA.848117)) | Eurasia, 40–10 ka, with minimum and maximum | "Creative Commons Attribution 3.0 Unported (CC-BY-3.0)" | checked against, below; PaleoMIST follows it after 40 ka |
| ICE-6G_C, ICE-7G_NA ([Peltier's data page](https://www.atmosp.physics.utoronto.ca/~peltier/data.php)) | the world, to 26 ka on PMIP4's grids, and ICE-6G_C's thickness to 122 ka | No license. Users "are requested to reference" the papers. PMIP4's copy says only "Please cite". | not imported. Its server sends no certificate chain, so it was read through the intermediate its certificate names |
| GLAC-1D (Tarasov et al.) | North America, Greenland and Antarctica, 120 ka–now; the world, to 26 ka, on PMIP4's page | No license. Tarasov's page: "Please cite appropriate references below when using these datasets". PMIP4's: "Please cite all the following papers". | not imported. Tarasov's page refused the connection and was read in the Wayback Machine, as of 22 May 2024 |
| Dalton et al. 2020 ([Ghub 4878](https://theghub.org/resources/4878)) | North America, 18–1 ka | "Licensed under", and then nothing. The page answers 404 now, and was read in the Wayback Machine, as of 14 November 2024 | not imported, and not needed: NADI-1 is its successor, from the same first author |
| Batchelor et al. 2019 ([OSF 7jen3](https://osf.io/7jen3/)) | the Northern Hemisphere, from the Quaternary's start | The article is CC BY 4.0. OSF's API gives its data `node_license: null` | not imported |

A reviewer should look at these first:

- **It starts at 80 ka.** The record of the Last Interglacial ends at 116 ka, so the last glacial cycle's first 36 kyr have no ice on the globe.
  ICE-6G_C, GLAC-1D and Batchelor et al. reach further, and none of them states a license.
- **The default picture draws the maximal scenario.** A judgement. The archive's plain files are the minimal one, and the paper prefers neither.
  The maximal one has ice on Hudson Bay throughout MIS 3, which suits a paper that calls the dates against it "near the limit of their
  reliability", and it is nearer the stack. The other is `alt:laurentide-mis3/hudson-bay-ice-free`, a sixth group behind **Alternatives**. It
  names no claims, so the build solves nothing for it and it costs no time. Its keyframes are kept only from 55 to 37.5 ka: elsewhere the two differ by none to four
  nodes of the margin and at most about 530 m of thickness, so choosing it draws the default there.
- **It disagrees with the stack, and says so.** The signs agree at every keyframe older than 5 ka, where the stack is scaled to 0 m (r over 0.8 for 5–80 ka). From 20 to 5 ka they are within about
  6 m. But the field's lowest is −116 m at 20 ka and the stack's −130 m at 24 ka; 22.5 and 25 ka differ by 16 and 27 m; and from 57 to 29 ka the
  field reads 17 to 54 m higher. At 60 ka they meet. The authors argue the proxies, not the ice, are wrong in MIS 3, and a stack of them is what
  this is being compared with: who is right is not settled here. `build.test.ts` holds both the agreement and the size of the gap.
- **Two sea levels in one table.** The grid's sum gives −115.8 m at 20 ka, within 0.7 m (rms) and at most 1.9 m of the "Calculated ESL" column of
  the paper's Supplementary Tables, and that is the −116 m in its text. The same tables' "SLE" column and the archive's `volume_sorted.txt` say
  106.3 m. The readme's formula on the grid's own volume gives the former. Why the tabulated volumes run 8% lower was not found out, though dividing
  by 0.91 closes most of it, so ice density may have been applied twice.
- **Two scenarios, how far apart.** The paper says their sea levels differ by at most "about 14 m". Its own Supplementary Tables and these grids reach 11 m,
  at 42.5 ka. The click gives the paper's figure and the grids'.
- **No error bars.** The click says so. Set against margins with bounds at 20 ka, south of 72°N and west of 55°W: PaleoMIST has 14.0 million km² of
  ice where NADI-1 has 13.7, between 10.3 and 15.0, with an intersection over union of 0.94, and 92% of the margin's nodes inside NADI-1's band.
  From 25 to 10 ka the intersection over union is 0.83 to 0.94, and that share 87% to 96%. In Eurasia north of 45°N: 5.7 where DATED-1 has 5.7, between
  5.0 and 6.1, with 0.99, but that is little test, as PaleoMIST took its margins from DATED-1. NADI-1 and DATED-1 could give each place bounds of its
  own; they are not drawn. `tools/world/importers/paleomist_check.py` makes these numbers.
- **The edge.** It is the 100 m contour of the 1° grids, chosen by checking against the archive's own margin files at five keyframes (intersection
  over union 0.97–0.99, north of 60°S; Antarctica's margin was not compared). Small ice caps and fjords do not survive. Between keyframes the edge
  moves evenly and the thickness goes in a straight line: 2,500 years is coarse for the deglaciation, and no one reconstructed those years. The
  Younger Dryas and Meltwater Pulse 1A cannot show.
- **What it leaves out.** Grounded ice only, by the name of its variable. No ice in the Alps, the Pyrenees, the Caucasus, the Himalaya, Tibet, the Altai,
  the southern Rockies, the tropical Andes, Tasmania or New Zealand, as checked at 20 ka: a peak stays white by its height alone, which is the
  renderer's, not a record. The paper says it leaves out smaller glaciers and ice caps, which it puts at 3–4 m of sea level.
- **Plates.** Each node moves with its plate, as the land does, from today's coordinates. In 80 kyr that is about 1 km on the big plates, and at most
  about 5 km under any ice, a twentieth of a node: the drawing would look no different without it.
- **Today's look changed.** Inside the field's span white comes from the field alone, and ground the climate holds frozen all year is left bare,
  because that reading would paint up to 3.5 million km² of land beyond the dataset's ice today (0.3 at 20 ka), 2.4 of it on the rim of Antarctica and
  most of the rest in the high Arctic. Some of that ground is icy today, in ice caps too small for the grid and on the land of the Antarctic
  rim, so those look barer than they are. Outside the span the climate's reading is back. No golden image was regenerated: five are the same to the
  pixel, and `today.png` differs in 79 pixels (0.008%, inside its tolerance), at the southern tip of Greenland and in Patagonia, where the ice is now the field's.
- **The rest of the globe does not know about the ice.** The climate field has no ice sheets before its pre-industrial run, so forest runs up to the
  Laurentide's edge. The coast stays at the elevation field's isoline, so Beringia and the shelves are not dry at the LGM even as the ice crosses
  them. PaleoMIST's paleotopography (not imported) would give both a start.

### Set 5: hominins and tools

- Liang Bua's `frame` is the present-day one: plate 679's polygon holds only at 0 Ma, so no plate frame passes there.
- Placement choices: Sima under `homo-neanderthalensis`, by Hublin's definition; Dmanisi under `homo-erectus`, though the
  PBDB says H. georgicus; Little Foot left at `hominini`. The tree is flat: every species hangs on `hominini`, and there
  is no record of the genus Homo.
- Preferred dates to check: about 200 ka for the Schöningen spears (Hutson 2025), over 337–300 and 400 ka; Nyayanga's wide
  range for the Oldowan's start; Blombos at 73 ka over 77 ka; Feldhofer's 44–42 ka is really given for a second individual.
- Weak: Laetoli uses the PBDB's composite point; the Mousterian's start is the Levant's only; several ages rest on
  sources that do not name the dating method, and the notes say so. About half of the 82 publications were read as
  abstracts only, and `verified.how` says which.

### Set 6: dispersals

- For the Americas, Sahul and East Asia the default picture gives only a bound both sides accept, and the
  alternatives carry the dates. So the default's arrival in the Americas shows at about 16 ka beside White
  Sands' older footprints: no contradiction, but odd.
- White Sands' `{ lo: 15.5 ka }` under the post-LGM picture is the agent's own arithmetic from an abstract's
  "at least ~7500 yr younger": the claim nearest to breaking the rule against invented numbers.
- Madjedbebe's figures are second-hand, from O'Connell et al.; Fuyan's dates are of other teeth than the original
  find's; one Arabian record holds Al Wusta and Alathar as competing dates; the Americas' post-LGM date is strictly
  the split of Native American branches.
- **Human remains.** Anzick-1 and Upward Sun River are remains of ancestors of living peoples. Section 4.2 of
  the design mentions handling notes, the schema has no field for them, and a person should decide.

### Set 7: megafauna

- A third alternative, people and climate together, was added beyond the brief, because Barnosky 2004 fits neither
  pure picture. The Americas are two events, north and south, as their sources and causes differ.
- `younger-dryas-cooling` is a thin event taking its dates by reference, because `caused-by` accepts only events.
- Stand-ins for "people arrive": Bacho Kiro in Bulgaria is a weak one for northern Eurasia.
- Weak dates: the moa's rests on a press release; Doedicurus has no calendar date; the calibrated ranges from
  Broughton & Weitzel's supplement state no confidence level; Wrangel's 3700 and about 4000 BP may be the same evidence.

### Set 8: domestication

- Preferred readings to check: the horse follows DOM2 over Botai; the dog starts as "by 15 ka", in eastern Eurasia;
  the chicken follows Peters 2022. Botai, Razboinichya and Nanzhuangtou keep a deprecated `part-of`, so they do not
  bind the date.
- Second-hand evidence: Guilá Naquitz squash and the Coxcatlán beans through Kennett 2023; Dja'de through its
  critics; Jiahu through Hongo 2021; Çayönü through Ottoni 2013.
- Weak domestic markers: Cishan, Donghulin (starch, offered as a hypothesis, and the preferred start for foxtail
  millet), Jiskairumoko, Shangshan.
- Development locations are editorial markers; dog's point is Wikidata's for Siberia.
- The horse's date is tagged `molecular-clock`, the nearest term.

### Set 9: population and land use

- Three series, `field:earth/{world-population,cropland,grazing-land}`, from the rows "Total" of HYDE 3.2.1's baseline tables, kept as
  snapshots with what they were read from. They were read by range requests: the tables' CRCs were checked, the archive's SHA-1 was not.
- Licence: the release's readme says CC BY 3.0, and DANS and DataCite say CC0 for the same files. The stricter is recorded.
- HYDE 3.3 supersedes it, and could not be reached. It follows the UN's 2008 figures, so 2015 reads 2.9% below the UN's of 2024. It
  stops at 2015. So the time axis's present, 1950, reads about 2.53 billion.
- It has no band: the lower and upper scenarios are only to be had from the author. The article's Table 6 says 7,301 million for 2015,
  where the table says 7,257. Its first step is labelled −10000, a year out against the axis, which the numbers cannot tell.
- Grazing land is pasture, rangeland and converted rangeland: HYDE's own table of rangeland leaves out the converted part. The article's
  Table 2 prints 20 for 1850 and 51 for 1920 in its world row, apparently misprints, where its other 15 match; Table 5's FAO row is about 3% above HYDE,
  though the article says it is followed exactly; its abstract has 667 Mha for 1700, where its tables have 664.
- **The grid says less about a place than it seems to.** A cell's number is the share of a province's estimate that HYDE's rules give it: the authors say
  "All allocation in the distant past is performed following general, globally applicable HYDE allocation rules", often from a Eurocentric point of view,
  with today's climate and biomes throughout. The panel says so. Iceland's cell shows how far that goes: 305 people at 1 CE, which looks like the rule
  rather than a finding (no source on Iceland's settlement was read for this).
- **Its range is the authors' and it is for their numbers as a whole.** ±95% at 10,000 BCE to ±1% in 2000, straight between as they do it; it is held at ±1% after 2000,
  which is this viewer's choice. They give none for a single place, and the panel says that too. Their wider range B is not shown.
- **Today's land.** HYDE has nobody on land the sea has since taken, and next to nobody under the ice of 10,000 BCE: 1,949 of 4.43 million in a rough box over northern
  Canada, 50–70°N and 110–60°W, chosen by eye and not from an ice map.
- **The scale is a choice.** A cell under 0.01 people per km² shows as empty, as the Ténéré's does at 1 CE with 59 people, though a click still says 59.
  Density is per km² of HYDE's `maxln_cr` land, as its own grids of density are, so a sliver of coast reads hot: the densest cell in 2015 is Lima's, on 264 km².
  The picture is smooth across cells and the numbers are not, so a click near a bright spot gets the whole cell's.
- **Step names.** The panel names steps as HYDE does, 0 AD and 10,000 BC, because the axis reads them as they stand, a year out before 1 CE, and would call them 1 BCE and 10,001 BCE.

### Set 11: people and offices

- 42 rulers: 27 Roman emperors from Augustus to Constantine (not Lucius Verus or Geta, nor most of the third century), and 15 elsewhere,
  from Djoser to Akbar. A reign is a phase of the person, and `held-office` puts it inside its polity. It stops at Akbar: no modern
  ruler has a record.
- Eleven polities were written for them, from Cliopatria's rows where those fit (`world/entities/people/polities/`): names, with the
  rows' first and last years. Four have no dates of their own (the First Dynasty of Babylon, the Old and New Kingdoms of Egypt,
  Palenque), because the chronologies compete or no row exists; Maurya and Han start with their first ruler's reign.
- Wikipedia is a last resort in three places, each said so: Diocletian's death, Charlemagne's birth, Hammurabi's 43 regnal years. The Long
  Count correlation was a fourth, until the twelfth slice gave it a record with three sourced values, `people/calendars/long-count-zero-day`.
- Worked out rather than stated, with the arithmetic in the notes: Nerva's birth and death, the birth years of Trajan and Titus,
  Macrinus's accession, Elagabalus's death, Hammurabi's High, Low and ultra-low starts. Pakal's Julian dates were too: his birth, accession
  and death are now written in the Long Count, as carved, and the ranges worked out by hand are kept, deprecated.
- James VI and I, the 43rd, holds his three crowns by `held-office` relations with spans, since reigns that overlap cannot be phases. The
  other 42 still hold office through reign phases: two ways of writing one thing.
- The upper bound on Macrinus's death is the agent's own allowance. The Historia Augusta's later Lives are weak, and say so.
- A birthplace stands for the whole of a life on the globe, so Claudius sits at Lyon during his reign.
- New Dio and Suetonius source records were added beside the narrower ones, and may want merging.

### Set 12: first cities and writing

- 18 settlements, with `settlement_area` and `population` as claims, and 10 scripts tied to 13 dated finds. Scripts are a child
  kind, `development/script`; proto-cuneiform is part of the existing record of writing in Mesopotamia.
- Population figures preferred only for lack of anything better: Ur, Mohenjo-daro, Memphis and Anyang rest on the Chandler and
  Modelski compilations (Ur's 100,000 looks too high for a city of at least 50 ha). Hattusa's area and population rest on Wikipedia.
- Modelski's file lists Teotihuacan and Tikal in columns BC_900 to BC_600, which look like misplaced AD values: not used, and flagged.
- The Ahiram inscription's date is from a figure caption and a time line, and its dispute is not recorded as a claim.
- Editorial readings: proto-cuneiform's end at 2900 BCE; Mohenjo-daro's dates are the civilization's; the Dipylon jug stands for the
  8th-century Greek group.
- Lineage between scripts is written since the twelfth slice: eight `arose-from` relations in six records, one of them a rival reading
  (the Greek alphabet from Proto-Canaanite) and one set aside (Egyptian hieroglyphs from Mesopotamian writing). Three of the parents,
  Proto-Canaanite, Olmec writing and Zapotec writing, are records with a name and no more.
- A script's start is its first find, so its lineage can only be slack or contradict it: a first attestation should bound a start, not be it.

### The identity cases (twelfth slice)

Nine cases, each written by an agent of its own from sources it fetched and kept, then gone over when the engine could say more
([TWELFTH-SLICE.md](slices/TWELFTH-SLICE.md)): 32 new records, 9 changed, 129 new sources. Every quote was found by script in the text it
was read in, and one source from each of the 48 hosts was fetched a second time and its quotes found again. Nothing was read twice by
another reader, and nothing by a person. The translations in the notes are the agents' own.

- **The Long Count** (`people/calendars/long-count-zero-day`, `people/rulers/pakal`). Preferring 584283 is a judgement: it is the constant
  most used, and agrees with the count still kept in the highlands; Martin and Skidmore explore 584286, from one eclipse. Thompson's two texts were read
  as OCR, and Lounsbury's in a reproduction. Mathews and Schele's online text has Pakal's birth once with two places exchanged; the
  claim's note says so. Their source record gives no year, though its id says 1974.
- **Scripts** (`people/writing/`). The Phoenician alphabet "arose from" Proto-Sinaitic, where the sources see one script at two stages:
  it could as well be `continues`, or one record. The Greek alphabet's rival parent rests on Lam's and Waal's reports of Naveh, who was
  not read. Maya writing from Olmec or Zapotec writing is one statement with an "or" in it, written as two relations that both hold.
- **The Holy Roman Empire.** Preferring 962 to 800 rests on Barker (1911) and on the two databases. The decretal Venerabilem is dated
  1202 from la.wikisource; the Royal Frankish Annals were read in an OCR, in which two older quotes of Charlemagne's record are not found.
  The view from Constantinople has no member of its own: what it asserts is the default picture, and what it denies is cited `against`.
- **Yugoslavia** (`sfr-yugoslavia`, `fr-yugoslavia`). Which end is preferred, and 1945 against the state's own 1943, are judgements. The
  declaration of 1945 was read only in a Wikisource contributor's Croatian rendering, and the constitutions on Wikisource were not held
  against the gazettes (the gazette date given for 1992's, 3 January 1992, cannot be right). The head of A/46/915 reads 7 May 1993 over a
  letter of 6 May 1992. The United Nations' machine-read PDFs set columns into one another: the quotes are in the text kept, which is
  not proof of how the page reads. Not reached: the judgments of the International Court of Justice, General Assembly resolution 47/1
  itself (cited as the Legal Counsel restated it), the Arbitration Commission's Opinion 11, Security Council resolution 752. The end is 3
  June 2006; the United Nations' depositary gives 2 June.
- **Britain** (six polities and `people/rulers/james-vi-and-i`). The Dictionary of National Biography's dates are read as Julian with the
  year beginning in January, which it does not say. Ireland's 1541 is inferred; the Act's short title and Wikidata say 1542. England from
  926 and Scotland from 846 are Victorian reference dates (Wikidata: 927, 843). The Constitution of Ireland is quoted from the
  consolidated text of 2020, and the Acts of Union from revised texts that lack what was repealed. The 1927 Act restyles Parliament, not
  the state in so many words. The United Kingdom has no Wikidata id, because Wikidata cuts it at the renaming.
- **The Second World War** (`people/wars/`, `people/events/`). The reckoning from 1937 is a competing start, and should be a
  perspective: under it nobody is in the war before 1939. Whether the war "from 1931" is the same war as that of 1937 is open. The end
  of 31 December 1946 is one state's legal date. Avalon heads the German acts of surrender "59 Stat. 1957", which may be a slip for 1857; 9 September
  1945 for the surrender at Nanking is from a headnote; the speech of 2005 is given to Hu Jintao only by the page's keywords.
- **Germany** (`german-reich`, `federal-republic-of-germany`, `german-democratic-republic`). The Federal Republic's `continues` sits in a
  perspective with no default, where an ordinary relation was the other choice. The Democratic Republic's is deprecated on a regional
  court's holding of 1950 that the identity remained, before its Supreme Court held otherwise. The end is 5 June 1945, against 23 May.
  `same_as` Q183 for the Federal Republic, though Wikidata also has an item for 1949–1990. The paragraph numbers of the 1973 judgment are
  a transcription's, and the 1951 judgment's central sentence could not be quoted: its PDF's text is out of reading order.
- **The Soviet Union and Russia.** Preferring 26 December 1991; Blum's "finally sealed on 25 December" is the rival. Russia is counted
  from 25 October 1917 (Old Style), though the appeal may have been adopted early on the 26th. The acts were read on Wikisource and not
  held against a printed edition, and no reference work could be reached. Nothing is cited against the continuity: a statement by
  Ukraine in 2022 contesting Russia's seat is said to exist, and could not be fetched.
- **The Mongol Empire.** The earlier record `mongol-empire` was changed: its end by the division of 1259–1264 is preferred to the borders
  dataset's 1293, which is kept. The Encyclopaedia Iranica was read in Internet Archive captures, Morgan (2009) in its abstract alone, and
  the Encyclopaedia Britannica of 1911 is the only source for the Ilkhanate's nominal end in 1353. The Yuan shi dates to the day in a
  calendar the axis cannot read, so its dates are given to the year. The three western khanates are not cut alike: the Chagatai record has
  two starts, the ulus of 1227 and the khanate of the 1260s.
- **Records with a name only:** the United States, the Empire of Japan, the Republic of China, the Second Polish Republic, and the three
  scripts above. The Republic of China has no Wikidata id here, because Wikidata cuts it in two.

What the cases found in the borders dataset, none of it corrected here or reported to its makers yet:

- Scotland is "Kingdom of Alba" to 1293 and "Kingdom of Scotland" to 1608, and then has no row: Edinburgh lies in none in 1650 and in
  "Kingdom of England" in 1700. There is no Kingdom of Ireland. "Kingdom of Great Britain" runs from 1709 to 2024 and never becomes the
  United Kingdom; its Wikidata id is the island's.
- Germany's names change with its border rows and not its regimes (German Empire to 1919, Weimar Republic to 1935, Nazi Germany to 1944);
  there is nothing for 1945–1948; "Federal Republic of Germany" ends in 1990 and "Federated Republic of Germany" begins in 1991 as another
  polity.
- Fifteen rows named "Golden Horde", for 1547–1695, lie in Mongolia and carry the Horde's Wikidata id; four named "Great Yuan", for 110
  BCE–50 CE, lie in Ferghana and carry the Yuan dynasty's; "Mongol Khanate" carries the id of a disambiguation page.
- "Yugoslavia" of 1919–1945 and the socialist federation of 1946–1991 carry one Wikidata id. Russia has no rows between 1922 and 1991,
  and 1920–1921 is one row, "Republics of the Soviet Union".
- The bracketed "(Holy Roman Empire)" begins in 922, where the sources read give 800 or 962.
- 385 rows are relations between states (allegiance, alliance, vassalage, personal union), drawn as if they were states.

### The conquest of Tenochtitlan (fifteenth slice)

Written from the evidence of three agents, one for each side's sources and one for the city and its neighbours, each keeping its
texts ([FIFTEENTH-SLICE.md](slices/FIFTEENTH-SLICE.md)): 25 new records, a group of two perspectives, 37 new sources. Every quote, 166
of them, was found by script in the text it was read in, and Cortés's were held against the page images of the 1870 edition as well.
Nothing was read twice by another reader, and nothing by a person. The translations in the notes are the agents' own.

- **The tie between the calendars** (`people/calendars/tonalpohualli-anchor`, `xiuhpohualli-anchor`). 1 Coatl = 13 August 1521 is
  Caso's, after Thompson; it rests on the fall's own double date, which therefore cannot test it, and Kirchhoff's denial is cited
  against it as Caso reports it. The year 3 Calli from 2 February 1521 is Sahagún's, the only Julian new year a source read gives; the
  arithmetic, 365 days with no leap day, is Caso's rule, and is code. Caso's book of 1967 and Tena's of 1987, where the arguments are
  made at length, were not read: Tena is quoted through Piña Garza, Díaz Álvarez and Kruell.
- **The entry's native dates** (`people/conquest/entry-into-tenochtitlan`). Book 12's 1 Ehecatl in the year 1 Acatl comes nearest the
  Spanish 8 November 1519 nineteen days before it; the Anales de Tlatelolco's 8 Ehecatl, read only as Caso reports it, a day after.
  Both are kept and set aside. Caso keeps the second, if the Mexica day ran from noon to noon.
- **Toxcatl and the flight** (`people/conquest/toxcatl-massacre`, `noche-triste`). The 195 days from the entry to the killing are the
  record's reading of Book 12's Nahuatl, the days of friendship ending with it; Sahagún's Spanish divides the 235 days otherwise.
  Wikidata's 22 May 1520 rests on no source read. For the flight, Hassig's 30 June to 1 July 1520 is preferred, Book 12's 235 days
  from the entry agree with it, and Bernal's printed 10 July is set aside, as Lockhart's note of 1844 has it.
- **The war and the siege** (`people/conquest/conquest-of-mexico`, `siege-of-tenochtitlan`). The war from the sailing, 10 February
  1519, is the record's choice, and the Triple Alliance's part in it is unsourced; Book 12's reckoning from Toxcatl is set aside
  because the world cannot hold it with the war's parts. The siege from 30 May 1521, Cortés's seventy-five days, is preferred to
  Bernal's 13 May.
- **Tlatelolco** (`people/cities/tlatelolco`, `people/polities/tlatelolco`, `people/conquest/conquest-of-tlatelolco`). 1473 is
  preferred to Ixtlilxóchitl's 1463, which his editor Chavero corrected, and the year 7 Calli he names sides with 1473. The town's
  arising from Tenochtitlan is the tradition of a split, with Gómara and Jiménez cited against it. Of the tellings of Moquihuix's death,
  the one Sahagún and the Codex Mendoza share is preferred, by rule more than by judgement.
- **The city's people** (`people/cities/tenochtitlan`). Eight estimates, seven for 1519 and Chandler's for 1520, from 60,000 to 700,000, with Calnek's 150,000 to
  200,000 preferred. Calnek, Sanders, Soustelle and Rojas were read only as Jiménez Martínez, Valero and Smith report them. The
  Anonymous Conqueror's 60,000 is quoted in the Spanish: Saville's English of 1917 has 70,000, copied from Icazbalceta's misreport of
  Prescott.
- **The house** (`people/traditions/tenochtitlan-house-plot`). Calnek's model as Valero reports it, with Torquemada and Gómara; its
  start is unsourced, and it is drawn over all of Central Mexico. Smith's measured houses of Morelos were scans with no text.
- **Who held what.** Cortés's span is the dates of the letters read, 1520 to 1524; Bernal's the year he names, 1568; Tlatelolco's the
  Digital Florentine Codex editors' 1555 to 1565. Tlaxcala is `subject-to` the Crown from the end of its war with Cortés, as Cortés has
  it; through whom the expedition acted for the Crown is a note.
- **Not reached:** the Anales de Tlatelolco, which have no public-domain transcription; Chimalpáhin; Caso's book of 1967 and his
  article of 1939; Tena (1987); Thouvenot, Kruell and Acevedo's *Tiempos superpuestos* (2024), whose PDF answered 404; Sahagún's
  revision of Book 12 of 1585; Calnek, Sanders, Soustelle, Gibson, Borah and Cook, Lombardo and Rojas themselves; Rojas's
  *Cuantificaciones* (historiamexicana.colmex.mx answered 403); Battcock (2011) on whether the alliance was formal (revistas.inah.gob.mx
  could not be reached); Smith's papers on his own site, which now asks for a sign-in (read in the Internet Archive's captures);
  famsi.org (403), redalyc.org (502), the search of www.cervantesvirtual.com (403); Bernal's Guatemala manuscript, so the printed text's
  dates were not held against it; Gayangos's edition of Cortés (1866), found and not fetched.

What the case found in the borders dataset, none of it corrected here or reported to its makers yet:

- "Aztec Triple Alliance" takes in Tlaxcala from 1450 to 1520, which it never ruled, and its first row, 1429–1439, leaves out
  Tenochtitlan itself and Tlacopan. Its rows carry the Wikidata id of the Aztec Empire (Q2608489).
- "Tenochtitlan" (1326–1428) lies east of the lake, between Texcoco and Tlaxcala, and takes in none of the Basin's towns, nor the city;
  "Texcoco" (1202–1428) lies south of the lake, taking in Chalco and Xochimilco and not Texcoco. There is no Tlatelolco.
- The Crown of Castile has no rows after 1515.

The list of cities has one row for Mexico City, "Tenochtitlan" among its other names, from 1500 to 1975: 80,000 people in 1500 and
1520, which is what the human landscape draws.

And in Wikidata, looked up on 18 and 19 November 2026:

- Tenochtitlan (Q13695) ends on 13 August 1521 and is replaced by Mexico City (Q1489), whose inception is both 1521 (preferred) and
  1325. The Aztec Empire (Q2608489) and the Aztec Triple Alliance (Q794210) are two items for what the sources treat as one thing.
- Tlatelolco (Q796925) is dissolved in 1473, though it went on as a tributary and as Santiago Tlatelolco; its inception of 1337 is
  from English Wikipedia. Moquihuix (Q1647668) "replaces" Tlacateotl, where Sahagún and the Codex Mendoza put Quauhtlatoa between
  them. Tlaxcala (Q614072) is dissolved in 1520, an end no source read gives.
- La Noche Triste (Q1308854) has its coordinates in north-western Mexico, about 1,600 km from the city. The siege (Q593267) starts on
  10 May 1521, Cortés's leaving Texcoco. The Cholula massacre (Q3297424) ends the day before it starts.
- Bernal Díaz's English label (Q315795) has been vandalized; Cuauhtémoc (Q297050) has no label in English or Spanish; Cuitláhuac's
  description (Q315628) gives his years as 1476–1638; Moctezuma II's death (Q141791) is on the Gregorian calendar model.
- Villa Rica de la Vera Cruz, the town of 1519, has no item.

### Set 13: routes and trade

- 14 wrecks from Uluburun to the Mary Rose, under a new child kind, `event/shipwreck`, with `cargo` and `voyage`; and 10 dated records of
  the Silk Road, from Zhang Qian to the Tian Shan corridor.
- Placed elsewhere than they lie: Gelidonya at Kumluca, 20 km north, as the plate's polygon at the wreck exists only at present; Nanhai
  One at its museum; Mazotos, Yassıada and Bom Jesus at nearby places.
- Ranks that are judgements: Kyrenia, radiocarbon over the coin's 294–290 BCE; Belitung, a wide 826–850; the Protectorate, 60 over 59 BCE.
- Second-hand or weak: Uluburun's date through Manning 2009, which was not read; Gelidonya's radiocarbon from a footnote; Mahdia's from
  OxREP alone; the span of Xuanquan from a newspaper. Zhang Qian's first mission rests on a reign period plus 13 years, and 138 and 126 BCE
  come only from Wikipedia. Palmyra is indirect: Gawlikowski says its merchants used the sea route.
- `evidence: inscription` is stretched to ink on wood and paper. No final excavation report was read.
- OxREP's database is cited and not imported, as its copyright page answered 403. Historic England and centuries.co.uk could not be
  reached, and Heidelberg's bot check was not attempted.
- Four new plates (331, 514, 606, 619) have frames and no plate records.

### Set 14: objects that move

- 13 objects, each with a phase for each place it was in, and its marker moves as the slider passes the dates (`moves` on a
  feature, `placeAt` in `core/tileset.ts`). A gap phase, for a voyage or an unrecorded spell, has no place, and the marker stays
  where it was.
- They use a child kind, `artefact/moved`, because `artefact` is a moment and a moment may have no phases.
- Weak dates: the Rosetta Stone's 1479 at the fort is when the fort was finished, on the reasoning that the stone went in with the
  old blocks; the Louvre arrivals of the Code and of Naram-Sin's stele are one-sided; the Okukor's first start is the Benin Bronzes'
  range as a group; the Obelisk of Axum's date is a century, from a news report, UNESCO and Wikidata.
- Nefertiti's wartime moves rest mainly on a campaign site's chronology, with competing claims where sources differ.
- The Parthenon sculptures and the Pergamon Altar moved over years: they have ranges, and the marker jumps at the midpoint.
- Museums' pages (British Museum, UNESCO, New York City Parks, the Met) refused direct access and were read as Wayback copies.

### The first forms

Written by agents, one to each branch of the tree of life, for the [seventh slice](slices/SEVENTH-SLICE.md). All of it is `proposed`, and a form is
a machine's reconstruction unless its claim cites a source. Most forms were drawn from published skeletal figures and silhouettes that an agent looked
at; a few from memory, which their claims say. A reviewer should look at a form's sheet (`npm run world -- form-sheet <taxon>`) next to a skeletal drawing.

- **Sizes are mostly whole-group figures.** A clade's range stands for every member with no size of its own, so one wrong end moves many taxa. Many
  rest on a popular reference: for dinosaurs Holtz's genus list, whose lengths run high for some (*Diplodocus* 30 m, *Allosaurus* 12 m); and for much else Britannica or
  Wikipedia, each saying so. Wikipedia is 41 of the 114 citations for early tetrapods and fish, and many of the upper ends for mammals. PanTHERIA's lengths for mammals leave out tails.
- **What has no size, and so is not drawn or takes a range from far above:** among dinosaurs, *Nyasasaurus*, and *Richardoestesia* and *Paronychodon* take a clade's range. Among mammals, Hyopsodontidae (1,226
  rows), Tillodontia, Apatotheria, Cimolestidae, pangolins, aardvarks and Mesozoic stems. Among plants, *Cooksonia*, liverworts, *Sphenophyllum*, Czekanowskiales, Caytoniales,
  Voltziales and Lycopsida take the node above's. Among insects, Palaeodictyopterida, Grylloblattodea and other stem groups take Insecta's, and giant fossil scorpions have none of their own.
  Tetrapoda and Amniota have no plan on purpose: one would draw every unwritten reptile and mammal as a stem tetrapod.
- **Values to doubt:** Ichthyostegidae's 1.5 m looks far too long for its 4.4 kg. Therocephalia's lower end is an agent's own arithmetic, and says so. The griffinfly's 410 mm is from Guinness. Blattaria's range is of
  forewings. Freshwater mollusc families rest on British species. Walchians borrow living small conifers' heights, peltasperms *Dicroidium*'s 10 m and other seed ferns *Medullosa*'s, and each says it is a stand-in.
- **Spores and pollen:** 4,920 rows of them hang on Plantae, which stands in as a low plant: they say something grew, and little of what.
- **Mass or length, not both:** multituberculates, sparassodonts, hyaenodonts and oxyaenids have mass only, and oreodonts length only. The other follows from the plan's shape.
- **Reptiles and birds:** Squamata has no size on purpose, so that the mosasaurs filed directly under it, not all flagged marine, are not drawn on land; a lizard's size comes
  from the groups within it, and those lengths are snout to vent, as the plan's length is. Pterosaurs have mass only. Proterochampsia, Younginiformes and Protorothyrididae had no size an agent could
  source, and are not drawn. Some sizes rest on Wikipedia. Confuciusornithiformes hang from Avialae and not where the database files them, because Aves here is the crown group, and its dates would squeeze
  theirs: the relation's note says so. The database flags most crocodiles and pterosaurs as marine, so a flag is now refused only for what does not keep to the air, the water's edge or wet ground.
- **Some megafauna repeat their forms.** Eleven records in `world/entities/life/megafauna/` hang directly on Mammalia, so they could not inherit from the clade nodes written since.

What agents found the form language lacks, for the next version of it: a spike that curves; a foreleg with an elbow and a wrist, a human leg and a flat foot (`digitigrade` bends at fixed places); parts that follow the neck, such as a mane;
a row that is not straight; a forking `tuft`, a swollen foot to a stem, a liverwort's thallus; a wing given by its span, and a body that bends sideways; and a depth for what swims, as fish are listed and not drawn.

### The sea's forms

Written by an agent for the [tenth slice](slices/TENTH-SLICE.md), in `world/plans/` and `world/entities/life/taxa/sea/`: fifteen plans and
twenty-five records, which take the share of the sea snapshot's rows that can be drawn from 35% to 63%, and to 62% once a genus the
database puts on land or in fresh water alone is left out of the sea (`npm run world -- forms-wanted --sea`). Every plan was looked at on its sheet; each says it is a machine's reconstruction.

- **Sizes, and where they rest.** Papers read in full from Europe PMC give the trilobites (Sun et al. 2025), the cephalopods' large end (Klug et al. 2025),
  the brachiopods' ends (Lüter et al. 2026; Vermeij 2016), the corals (Zapalski et al. 2025; Coward et al. 2020), the whales (Sun et al. 2019), the
  ichthyosaurs' large end (Pimiento et al. 2024) and the clams' ends (Czekanski-Moir & Rundell 2020; Vermeij 2016). The rest rest on Wikipedia, at a
  pinned revision, each saying which better work it cites and should be replaced by: the smallest ammonoid, bryozoans, sponges, sea urchins, mosasaurs,
  plesiosaurs, eurypterids, sea turtles, rugose corals and the ichthyosaurs' small end.
- **Values to doubt.** Anthozoa's 2 m is what a survey calls a large colony, not the largest: real colonies reach far more, and the note says the
  smaller figure was kept so that a scene's corals stay of a plausible size. Clams' 0.5 mm is a nut clam outside the subclass it stands for. Sea urchins'
  3 cm is the usual smallest, not the least. Sea turtles' range is of living species only. A bryozoan's small end is a single zooid.
- **What has a body and no size, and so is not drawn:** crinoids (10,311 rows) and sea stars (1,072): no smallest size could be sourced.
- **Bodies that stand in for what they do not fit:** endoceratids and multiceratids, which are numbers of the sea's snapshot only, inherit the coiled shell;
  heteromorph ammonoids, octopuses, feather stars, pliosaurs and sand dollars take their group's general body. Gastropods are drawn with the land snail's
  plan and sizes.
- **The land's lists.** Bivalves and sea turtles the database calls marine are now left out on land, as the land atlas intends, so 82 more of the land's
  taxa have no form; freshwater bivalves under Autobranchia with no record of their own take the clam's body, which a scene on land never places, and
  Unionida and Sphaeriidae keep the mussel's.
- **Blocked:** the CC0 body sizes of marine genera (Heim, Payne et al., on Dryad), which would give most genera a size of their own, could not be
  downloaded from here.

What the form language lacked, for the sea: radial symmetry of five or more; a coil (an ammonoid's shell is some sixty rings worked out by hand, so
an involute or a heteromorph is no simple change); a tube whose section is not a whole ellipse, for two valves that meet at an edge or a concavo-convex
shell; a sheet that is not flat; spines at angles other than 45°; and a pose for swimming.

### Building traditions

Written by agents, one to each part of the world, for the [eleventh slice](slices/ELEVENTH-SLICE.md), in `world/entities/people/traditions/`, on the
brief in [DWELLINGS.md](DWELLINGS.md): 36 records, seven of them members that take what they do not say from a broader one. Of their 199 claims, 162
cite a source and 37 do not: the names, and one end that is an editorial split (the Iron Age longhouse village ends where the Viking Age's begins).
The 348 quotes were all found by script in the texts the agents kept, each in the file named for its source; `quote-check` records one `quoted` step
on a claim however many sources it has, so on a claim with two sources the step names only the first text checked. Nothing has been looked at by a
person.

- **Encyclopedias.** 30 of the 68 sources are Wikipedia articles, read at a pinned revision, and 74 of the 162 sourced claims cite one, most often beside a
  paper. Twelve traditions rest on papers alone: the Classic Maya house group, the three of the Lower Xiajiadian, the Mongolian ger, the Nordic Bronze
  Age longhouse, the round house of Britain and Ireland, the Stony Rises' stone houses, the sunken houses of east-central Europe, the Swahili house,
  the Thule winter house and the planned pueblo town. The four-room house, Olynthus's house and the Ancestral Puebloan pit house lean on one most.
- **A region is drawn whole.** A tradition names the ArchaeoGLOBE regions its sources place it in, and a scene draws its houses over all of each, though
  most notes say it is not claimed for all of it. The worst stretches: the workmen's villages of Deir el-Medina and Amarna stand for every house in Egypt
  from 1506 to 1069 BCE; the pastas house of one city, Olynthus, for all of Southern Europe from 432 to 348 BCE; the stone houses of the lava flows of
  western Victoria for Victoria and Tasmania; the Samoan house for all of Polynesia; the house on piles for eight regions from Thailand to Indonesia.
  A narrower tradition takes over where one is written.
- **Open ends.** Eight have no end, and so are drawn to the present: the Ancestral Puebloan room block and the planned pueblo town, the Middle Niger's
  mudbrick and Djenné's courtyard house, the Mongolian ger, the Samoan house, the house on piles and the Swahili house. Their sources follow them into
  the nineteenth or twentieth century, or say nothing of an end.
- **A first find is not a beginning.** The Stony Rises' houses run from 1840 to 1870, the dates of the one excavated house; the paper leaves houses
  before European contact to future work. The round house's 1500 BCE is the earliest date in a source read, not its start, and its end of 400 CE is
  Ireland's alone.
- **Competing claims:** the Samoan settlement, dispersed (Davidson, preferred as the later reading) or in villages (the earlier surveys); the Puebloan
  traditions' starts and ends, where Bocinsky et al. (2016) is preferred over the encyclopedia's Pecos periods, and for the planned town over
  Spielmann et al. (2016); the four-room house's start; and the Zimbabwe
  culture's, at Mapela in the eleventh century (preferred, as dated evidence) or at Mapungubwe on the received view.
- **What the vocabulary lacks:** a semi-circular wall (the Stony Rises' houses are drawn round), open sides (the Samoan house's are drawn as none),
  thick daga without poles (the Zimbabwe culture's élite houses), stone pillars, and a cave. A size given as floor area is not stored, as the vocabulary
  takes a diameter or a length and width.
- **Not written:** the agents' lists of what they could not reach or did not get to are in the slice's document; `npm run world -- dwellings-wanted` lists
  where the most people are drawn with generic houses.

### Building traditions filled in, husbandry, and the animals people kept

Written by agents for the [sixteenth slice](slices/SIXTEENTH-SLICE.md), from the top of `dwellings-wanted`: by people
(South Asia, China, Japan and Korea, Europe) and by way of life (herders, foragers, shifting cultivators). All are
`proposed`, and nothing has been looked at by a person.

- **Building traditions:** 55 new records beside the 37, in `world/entities/people/traditions/`. Of their 376 claims
  and relations, 319 cite a source, with 828 quotes, and every one of the 319 has its `quoted` step; the 57 that cite
  none are the names and two editorial groupings of a tradition under a broader one. Each of the 37 older records gained a `lifeway` claim, and five of them
  and eight recorded cities a `town_form`.
- **Husbandry:** 20 records in `world/entities/people/husbandry/`: 107 claims and relations, 80 sourced and quoted;
  the rest are the names and seven editorial groupings. The two camel traditions rest on Wikipedia alone.
- **The animals people kept:** 14 domestic taxa in `world/entities/life/taxa/`, and sizes and a nearer parent for the
  dog and the horse, which keep the parent they had as a second, unpreferred claim. Twelve are named by a husbandry
  tradition and drawn; the Bactrian camel, the yak, the donkey and the reindeer wait for one.
- **Sources:** 132 new, 27 of them Wikipedia articles at pinned revisions. The Low German hall house and the parent
  North China courtyard house rest on Wikipedia alone.
- **All the kept texts, checked again in one run:** 1,591 quotes of 243 sources. The 78 not found are all of older
  claims whose pages were not kept this time: 72 of the Animal Diversity Web's, in 45 taxon records; five of Uruk's
  from the CDLI wiki, whose page refused this time; and one of Harappa's start, from Meadow and Kenoyer's report.

What to check first, beyond what the slice's document lists under *The records*:

- **A house of one people drawn for a region.** Only five traditions say how many lived so (`prevalence`). The Ao
  Naga house, the Ganda round house, the Iban longhouse, the Tupinambá village, the castro roundhouse, the snow house
  and the English houses are drawn for everyone of their way of life in their regions.
- **A start that is the year a traveller wrote.** Fifteen of the new traditions begin with the earliest account
  read: the herders' seven, four of the foragers', the three later houses of southern and eastern India, and
  Hindustan's. The five of the shifting cultivators begin when their people are first dated in the region.
- **`lifeway` readings.** Where the model's way of life and the excavators' differ, the agents named what the sources
  show and no more. Some records name a second way of life on a reading the note explains: the Painted Grey Ware hut
  and Mehrgarh's house, farmers and herders.
- **Sizes of animals** are mostly of today's breeds, and cattle have a mass and no length.
- **Vocabulary the agents wanted** and wrote the nearest word for: a timber frame with infill; woven bamboo or
  matting; a hip-and-gable and a half-hipped roof; a curved ridge; an L-shaped, a semicircular and an aisled plan; a
  heated floor; a floor area; a homestead of several huts; a village that is one house; a village round a green.

### The house in detail, and what stood by the houses

Read out of the traditions' own sources by six agents for the [seventeenth slice](slices/SEVENTEENTH-SLICE.md), one
to a part of the world, after the vocabulary grew to hold it ([DWELLINGS.md](DWELLINGS.md), *The house in detail* and
*What stood by the houses*). All of it is `proposed`, and nothing has been looked at by a person.

- **What changed:** all 92 building traditions were read again, and 85 of their records changed, a few only in
  the wording of a check. 58 now say something of the house that no record could say
  before: where its door was (16), which way it faced (6), its windows (18), how its smoke left it (23), how its
  walls were finished (19), a porch (3), a veranda (9), animals under its roof (13), how high its floor stood (6); or
  one of the narrower words for its walls, roof or plan (15). 35 say how the houses stood: in a ring or in rows (13),
  what enclosed the settlement (16) and each yard (14), open ground at its middle (7). 37 have an `outbuildings`
  claim, 69 things in all: shrines and halls of settlements, and of households kitchens, granaries, stores, byres,
  pens and wells.
- **Their checks:** the traditions' 674 claims and relations cite a source in 572, with 1,537 quotes, and every one
  of the 572 has its `quoted` step, written again by `quote-check --redo` with all of a claim's texts in one run
  wherever a claim gained a source.
- **Sources:** two new, both read in the Internet Archive's copies: Morgan's *Houses and House-Life of the American
  Aborigines* (1881), which quotes Lewis and Clark and Bartram, so that what rests on them is at one remove and says
  so; and Wissler's *Material Culture of the Blackfoot Indians* (1910). Five texts that were not kept before were
  retrieved and kept: Nicosia 2022 from Europe PMC with its supplementary table, and four Wikipedia articles at the
  revisions their records name. The Cortés, Torquemada and Gómara texts were copied from another checkout's cache,
  where the fifteenth slice had kept them.
- **Two disagreements, kept as competing claims:** Lewis and Clark's plank houses, sunk four or five feet, beside the
  record's house on the ground, which no sentence read supports; and Morgan's Iroquois longhouse with a roof of two
  slopes beside the record's arched one.

What to check first:

- **A detail of some houses, drawn for all.** The village wall of North China is "often" there in its source; the
  byre under the roof is "usually" not so in later medieval England, and so of the Viking house only where the owner
  had no stable; the chimney of the thatched Korean house belongs mainly to the late Joseon, and that of the Kofun pit
  dwelling to after the mid-fifth century; the painted finish of the Han house is said of tomb models, so of the
  well-off; the limewash of the English peasant's house is in "some sources".
- **One site, drawn for every settlement:** Lony's hall and three temples for the Deccan's villages; Bhita's sanctuary
  for the towns of the Ganges; Inamgaon's kiln; Deir el-Medina's and Amarna's chapels, which stood outside the wall;
  Maidanetske's assembly houses, which only some Trypillia settlements had.
- **Readings, not statements:** the door in the end of the Ao Naga and the Chin houses; the door in the long side of
  the black tent of Syria, read from its sizes; the round granary of Hindustan, from "like a large bee-hive"; the
  veranda of the Olynthus house, for its pastas; `windows: small` for windows of gut, ice and mica; the tulou's, from
  "few openings". `per: house` for the pens and workshops of an Irish rath rests on a rath being one household's.
- **Later accounts carried back:** the house of the planned Pueblo towns of 1260–1300 rests wholly on the pueblos of
  the nineteenth century; the tipi's door to the east and its smoke flaps on canvas tipis of 1910; the kitchens and
  granaries of the Zimbabwe culture on the Shona of today; the Samoan cookhouse on a pattern its excavator judged
  probably held in the past.
- **Which way houses faced.** Six traditions say: the felt tents of the steppe and of Mongolia to the south, on
  Rubruck's "always", though Rockhill's note has Mongol tents facing east and south-east too; the tipi to the east;
  the houses of North China and of Sichuan to the south.
- **Sizes that are not what the word means:** the latte house's floor height is its pillars'; the Chin house's is
  one house's span from its uphill to its downhill side; `floor_height` under a sunken floor is a depth.
- **What had no word, and is in the notes only:** a storage pit; an altar in the open (written as a shrine, which is
  drawn roofed); a stair to a roof terrace; the two opposed doors of a cross-passage; an oven or a stove inside a
  house, the kang among them; a floor half of earth and half of boards; a smoke louvre high in a wall; an open
  platform before a veranda; a vestibule; a cistern; a privy; a trough; walls bowed like a boat's; an area for an
  outbuilding; a sentry's hut.
- **Not read:** Cladh Hallan's second report, a file of 132 MB that the agent did not fetch unasked; four other
  sources whose texts were not kept; and anything in German for Staden's three doors, which were read in English.

### The bodies of the animals people kept

Drawn by one agent for the [seventeenth slice](slices/SEVENTEENTH-SLICE.md): a `body_form` or a new plan for each of
the sixteen animals the husbandry traditions name, and eighteen sourced sizes. All of it is `proposed`.

- **What changed:** the taxon records of the sheep, the goat, cattle, the pig, the hen, the dog, the zebu, the
  dromedary, the water buffalo, the alpaca, the llama, the horse, the yak, the Bactrian camel, the donkey and the
  reindeer (the dog's and the horse's are under `people/domestication`); two plans, `ox` and `camel`; five sources.
  The twenty claims of a form or a plan are `unsourced` and say what each was drawn from. The eighteen of a length
  or a height each have a quote and its `quoted` step.

What to check first:

- **Three lengths from Dimensions.com:** the zebu's, the yak's and the donkey's (`method: expert-estimate`). The site
  names no work for its figures. PanTHERIA has no row for the zebu and no length for the yak or the ass, and the
  Animal Diversity Web sizes only the wild yak and gives the ass a length that repeats its shoulder height. Each note
  asks for a measured length in its place.
- **Cattle are one breed:** a large modern dairy cow, the Holstein, from a ministry's note that cites the measurements
  and was read without them. Its ± is read as one standard deviation, and its inches are turned into metres.
- **The water buffalo's length is the species',** wild and domestic together, and the wild is the heavier. The record
  had left it out for that reason; it is given now, with that said, since without it the animal was drawn half as long
  as it is.
- **The llama's two lengths:** PanTHERIA's mean is preferred to the Animal Diversity Web's range, which does not say
  what it measures. The alpaca's length, from the account of *Lama pacos*, may be long.
- **Shoulder heights for the hip's** in nine records; only cattle's is a height at the rump. Ranges over all breeds
  make tall middles: the sheep stands 0.91 m at the back. The goat has no height, and stands 0.81 m where its account's
  typical goat is 0.64 m.
- **The dromedary's sizes** are from the German Wikipedia, quoted in German: the English article and the Animal
  Diversity Web give heights and weights only, and *Mammalian Species* 375 came as a scan with no text.
- **Not seen in the viewer.** Each was looked at on its sheet. The pig and the dog are `habitat: any`, so that the
  generator keeps them about the houses and does not herd them on the pasture: one word reverses it.

### Set 16: day length and the Moon

- 21 measurements from the Moodies Group (3.22 Ga) to today, 13 with the Earth–Moon distance, as records; the series are read
  from their claims (`data.prop`), so nothing is typed twice.
- Weeli Wolli shows 18.8 h, as Williams argues, but Mitchell & Kirscher exclude both readings and Joffre, 9 Myr older, reads
  16.9 h: the jump in the series comes from this. Big Cottonwood prefers Sonett & Chan's 18.9 h, which Williams doubts. Elatina's
  date is 640 Ma over 620 Ma.
- Unstated ± are read as 1σ, and Mitchell & Kirscher's uncertainty column is not a true σ.
- Meyers & Malinverno's hours are sidereal days. Lucaogou's numbers and the second Elatina claim are Farhat's model values, not
  the studies' own.
- A `{ lo, hi }` plots at its middle, so Moodies draws at 12.7 h where its source's central value is 12.9.
- Several points are representative only; Moodies and Cheshire have none, because plate 701's polygon stops at 600 Ma.
- Wells's corals rest on Williams 2000's summary, the original being unreadable; the studies behind Mitchell & Kirscher's rows
  were not read.

### Set 19: futures

- All the IPCC's amounts sit on one record, `climate-to-2100`, under five alternatives. Warming ranges are the report's very
  likely ones, sea-level ranges its likely ones. SSP3-7.0's sea level comes from Chapter 9, as the Summary omits it.
- `east-african-breakup` rests on a passing statement in a plant-genetics paper, "within 10 million years": it solves to about 5 Myr,
  which means nothing. Consider dropping the default claim.
- `next-glacial-inception` prefers Talento & Ganopolski's "highly unlikely in the next 120 kyr", the only one for emissions already
  made: a judgement call.
- Aurica prefers 250 Myr (Davies, Way) to Duarte's own "approximately 300 Ma". Pangaea Proxima's name and its 225 Myr are second-hand.
- Supercontinents use the moment kind `event/formation`, a slight stretch. `gibraltar-subduction-invasion` was added as the one
  dated start for the Atlantic's closing that does not depend on a scenario.

## Not done

- **Ice sheets before 80 ka.** Of the datasets read that reach further, none states a license (see set 4), and a search found no open one. The cycle's
  first 36 kyr have no ice on the globe, and neither have the cycles before it, which the sea-level stack and the ice cores do reach.
- **Set 9's land use on a grid.** Cropland and grazing land are series only. Their grids are in the same archive (`baseline/asc/<step>_lu/`), and the tool
  and the layer for people would read them the same way. HYDE 3.3 would reach 2023: its hosts (`public.yoda.uu.nl`, `geo.public.data.uu.nl`) answer a script with
  a bot check, and getting past it was not tried.
- **The Silk Road's lines.** It has records and no lines: no dataset of them could be used. Ortelius AT-046 states CC BY 4.0, but it is
  14 legs for about 800–1200, and calls itself illustrative. No license for OWTRAD could be found. Lines on the globe work for
  whatever comes.
- **Set 20.** A review is a person checking a claim. The validator refuses a machine's `accepted`, as it should.
