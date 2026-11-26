# Entities: every kind of thing, listed, written or generated

Status: a report and a proposal, 25 November 2026. Nothing in it is built. It reads `world/entities` as it
stands at commit `1654c57` (build `1753e842a906c808`), says what stands between the world and an entry for
every thing of every kind, and proposes how to get there. It goes with three documents and repeats none of
them:

- [STRUCTURE.md](../STRUCTURE.md) section 3.1, *rows are claims*: this finishes it, so that a row is a thing;
- [CATALOG.md](CATALOG.md), which measures what is missing: this says where its lists come from;
- [MODELS.md](MODELS.md), which fills in what no list reaches.

## 1. In short

- **What is written is a set of samples.** `world/entities` holds 1,664 records. Each slice chose its own
  things (26 clades, 18 first cities, 44 rulers, 14 shipwrecks, 2 battles), and nothing says out of how many.
  The directories are named for the slices that wrote them (`life/hell-creek`, `rome`, `people/conquest`),
  beside others named for a kind (`life/taxa`, `people/polities`).
- **Most of what the world already holds is not an entity, and cannot be found.** The build reads 68,361 taxa
  of the land's fossils, 8,304 languages, 13,778 rows of states, 9,123 hazards and 35,481 rock units as rows of
  datasets. Search finds 3,263 things. A dinosaur that a scene draws may have no page and no name to search.
- **Everything that has been catalogued can be filled in, and none of it should be written as files.** For
  most kinds of thing an open list exists (section 3.4): 2.3 million living species, 410,000 fossil taxa, 13
  million places, 13.8 million people. For a few the best lists are closed: the stars, volcanoes, peoples.
  Bringing one in is engineering, not research: one path that makes a row of a list a thing the world can
  find, open, link to and correct. That path has been built three times by hand, each differently (section
  2.3). Built once, the lists the world already reads make more than a hundred thousand things findable with
  no new dataset.
- **Everything that existed cannot, and that is the larger part.** The lists hold fewer than one in a thousand
  of the species thought to have lived, and about one in eight thousand of the people (section 3.1). No list
  will close that. It is for models to estimate and generators to draw, labelled, as [MODELS.md](MODELS.md)
  sets out for people.
- **Whole kinds are missing** (section 4): the sky and every body in it but the Earth, named rivers, lakes,
  seas, islands and volcanoes, every living species, archaeological sites and cultures, religions, works,
  persons who were not rulers, and nearly all events.
- **The plan** (section 5): shelve the records by kind; make a row a thing; make the outputs hold millions;
  join the lists into one identity; bring in a backbone for each kind, in order of what it unlocks; write
  records where the build says they are most wanted; and model what no list reaches.

## 2. What is there

### 2.1 The records

| Kind | Records | Directories they sit in |
|---|---|---|
| taxon | 690 | `life/taxa` and its six shards 619, `life/hell-creek` 42, `life/hominins` 14, `life/megafauna` 13, `people/domestication` 2 |
| period | 188 | `periods/ics` 184, `earth/ice-ages` 4 |
| occurrence (a dated find) | 150 | `life/occurrences` 49, `people/domestication` 25, `life/hominins` 20, `life/fossil-forests` 16, `people/dispersals` 13, `people/writing` 13, `life/megafauna` 5, `life/mesosaurus` 4, `people/trade` 3, `earth/day-length` 2 |
| event | 134 | `life/transitions` 25, `people/trade` 19, `people/dispersals` 17, `earth/events` 13, `people/events` 12, `earth/futures` 10, `life/megafauna` 9, `people/conquest` 9, `space/events` 7, `earth/ice-ages` 6, `people/calendars` 3, `people/wars` 3, `earth/day-length` 1 |
| tradition | 122 | `people/traditions` 95, `people/husbandry` 20, `people/agriculture` 7 |
| building, monument, works, open space | 111 | `rome` 110, `people/trade` 1 |
| plate | 54 | `earth/plates` |
| person | 46 | `people/rulers` 44, `people/persons` 2 |
| polity | 43 | `people/polities` 42, `people/trade` 1 |
| development | 36 | `people/domestication` 20, `people/writing` 13, `people/developments` 3 |
| settlement | 24 | `people/first-cities` 18, `people/cities` 4, `places` 2 |
| sample | 24 | `earth/day-length` 18, `earth/samples` 6 |
| artefact | 19 | `people/objects` 13, `people/prehistory` 6 |
| landform | 9 | `earth/orogens` 8, `earth/structures` 1 |
| industry | 8 | `people/prehistory` |
| large igneous province | 3 | `earth/lips` |
| ecosystem, organization, body | 1 each | `life/hell-creek`, `people/organizations`, `space/bodies` |

The last build has 18,756 claims, all proposed, 1,741 of them unsourced; 1,239 have been found in their
sources by script, and none has been read by a person.

### 2.2 How they are organised

1. **Directories are named for the job that wrote their files.** `life/hell-creek`, `life/megafauna`,
   `life/mesosaurus`, `life/fossil-forests`, `people/conquest`, `people/first-cities`, `people/trade` and
   `rome` are slices and record sets. They sit beside directories named for a kind (`life/taxa`,
   `people/polities`, `earth/plates`) and under three named for a domain. A new record has no rule to go by.
2. **So one kind is in many places.** Events are in thirteen directories, dated finds in ten, taxa in five,
   settlements in three: Rome is `places/rome`, Babylon `people/cities/babylon`, Uruk
   `people/first-cities/uruk`. A directory such as `life/megafauna` holds taxa, finds and three kinds of event.
3. **The design's own layout was not followed.** [WORLD-MODEL.md](../WORLD-MODEL.md) section 10 has
   `entities/` "sharded by domain/region/era", with the Colosseum at
   `places/italy/rome/buildings/colosseum.yaml`. It is at `rome/colosseum.yaml`.
4. **Ids already differ from paths, which is what makes mending this cheap.** 910 of the 1,664 records have an
   id that is not their path: every taxon is `life/taxa/<name>` whatever shard or slice directory it is in.
   Rule 7 holds: a file can move and nothing else changes. Ids that carry a slice's name
   (`people/first-cities/angkor`, `rome/colosseum`, `life/megafauna/extinction-sahul`) stay as they are,
   since an id means nothing.
5. **Three places in the code read an id's prefix,** to tell a thing a dataset brought from one that was
   written: `rome/ohm/` in `build/city.ts`, `life/pbdb/` in `build/tree.ts` and `build/records.ts`. That is
   what rule 7 forbids, and it is there because nothing else says which a thing is.
6. **Nothing stops one thing being written twice.** No two records share an external id today (0 of 1,224),
   but the validator does not check it, and 636 records have no external id to check. With many agents and no
   rule for where a record goes, two files for one city are a matter of time.
7. **Each set is a sample with no denominator.** The first cities are eighteen, the rulers forty-four, the
   shipwrecks fourteen, the battles two. Each was a reasonable choice for its slice. None says which list it
   was drawn from, so none can say how full it is, and [CATALOG.md](CATALOG.md)'s first guardrail ("no
   percentage without a denominator taken from a source") has nothing to count against.

### 2.3 The things that are not records

Far more of the world's things come from datasets than from `world/entities`, and a dataset's things are
treated in four different ways, by which importer brought them:

| Dataset | Its things | What they become | Found by search | Has a page |
|---|---|---|---|---|
| OpenHistoricalMap, around Rome | about 750 buildings, streets and open spaces beyond the 110 written | entities, with ids `rome/ohm/…` made by the importer | yes | yes |
| PBDB, the Hell Creek | 1,037 taxa beyond those written | entities, with ids `life/pbdb/txn-<n>` | yes | yes |
| PBDB, the land | 68,361 taxa in the atlas, from 245,380 occurrences | rows; a taxon joins the tree only if a record adopts it | no | no: in a scene, a panel says what puts it there and whose body it is drawn with, and its name links to nothing |
| PBDB, the sea | genera from 1.47 million occurrences | rows | no | no |
| Cliopatria | 13,778 rows of states | rows; 181 tied to nine records by overlays | by name: 1,602 names | what the dataset says of the row |
| Glottolog | 8,304 languages | rows, drawn as a layer for the present | no | what the dataset says of the row |
| NOAA's hazards | 9,123 eruptions, earthquakes and tsunamis | rows, drawn as a layer | no | the same |
| Itiner-e | 13,846 stretches of Roman road | rows, drawn as a layer | no | the same |
| Natural Earth | 1,251 cities and 393 border lines of today | rows, drawn as a layer | no | no |
| Macrostrat | 35,481 rock units in 1,534 columns | rows, read by the ground of a scene | no | no |
| PBDB, the rocks | 278,985 collections | rows, read for a scene's ground | no | no |

So whether a thing can be searched for, opened or linked to depends on which importer brought it in, and not
on what it is. [STRUCTURE.md](../STRUCTURE.md) section 3.1 decided that rows are claims and built the address
(`src:<dataset>#<key>`), the claim index and the overlays. What it left is what this table shows: a row has
claims, and is still not a thing.

## 3. Can everything be filled in?

### 3.1 Two meanings of everything

"Everything" is two sets, and they differ by orders of magnitude:

| | A list has it | Thought to have existed |
|---|---|---|
| Species alive today | 2,278,463 accepted species in the Catalogue of Life's release of 11 November 2026 | "∼8.7 million (±1.3 million SE) eukaryotic species" (Mora et al. 2011, *PLoS Biology* 9(8): e1001127) |
| Species of the past | 410,244 taxa of every rank in the Paleobiology Database; of fossil species, "at least 280,000 have been named" (Alroy 2002, *PNAS*, read in a snippet only) | "four billion species estimated to have evolved" (Barnosky et al. 2011, *Nature* 471: 51, read as quoted elsewhere and not in the paper) |
| People | 13.8 million humans in Wikidata | "About 117 billion members of our species have ever been born" (Kaneda & Haub 2022, Population Reference Bureau) |

So the lists hold fewer than one in a thousand of the species thought to have lived, and about one in
eight thousand of the people. The figures on the right are estimates quoted to show the scale, each as it
was read, and are not claims of the world.

[STRUCTURE.md](../STRUCTURE.md) section 1 names the two gaps. The first column is the *ingestion gap*: the
knowledge exists and the world has not read it. Reading closes it, and sections 3.2 to 3.4 are about that.
The difference between the columns is the *science gap*: the evidence did not survive. No reading closes
it, and step 7 of the plan is about that.

### 3.2 Every species, worked through

**What is already here.** The Paleobiology Database is the list of fossil taxa, and the world reads it three
ways: one formation's taxa as entities, the land's and the sea's occurrences as rows. The atlas can put
68,361 land taxa at a place and time. 131 of them are drawn with a form of their own, 65,464 with the form
of a group above them, and 2,766 with none.

**What is missing.**

- *The living.* No list of living species is read. The atlas reads fossils only, so the wildlife of the
  present is whatever the Holocene's fossil collections happen to hold.
- *The fossil taxa without the occurrences the queries asked for.* The snapshots hold the taxa that their
  occurrences name, and those taxa's parents. A taxon known only from an occurrence the queries left out
  (ichnotaxa, form taxa, occurrences named above the genus) is not here.
- *A page for any of them.* Section 2.3.
- *One tree.* The 690 written taxa hang on a tree written by hand, with the PBDB's parents below it. Sixty
  records name an Open Tree of Life id, and nothing reads them.

**What it would take** is steps 2 to 5 of the plan: make the PBDB's taxa things; bring in one list of the
living with its tree; join the two by their identifiers, and never by a name alone; and read present-day
occurrences into the same atlas, as its tier for today. No species needs a file. A species earns a written
record when someone has something to say that the lists do not: a dated first appearance argued from a
specimen, a disputed placement, a form.

**What it cannot reach** is the species nobody described, which is nearly all of them. For those the honest
entry is not a row but an estimate: for a clade at a time, how many species the lists know, how many are
thought to have lived, and stand-ins drawn for the rest, marked as generated. That is a model
([MODELS.md](MODELS.md)), with the lists as what it observes and is tested against.

### 3.3 What stands in the way, in order

Nothing in the rules does. Rule 6 admits the main lists, and rule 2 is met by a row saying which dataset it
is from. What stands in the way is this:

1. **No one path from a row to a thing.** Each importer made its own (section 2.3). Until there is one, each
   new list costs an importer, a build step, a file format and a layer in the viewer, and its things still
   cannot be found.
2. **The build's outputs do not hold millions.** `search.json` is one file of 2.0 MB for 3,263 entities and
   1,602 names; at that rate two million species are about a gigabyte, loaded whole. Each record has a page of
   its own, 16 KB on average. `tree.json` is 14 MB for 1,727 nodes and one formation's 5,272 occurrences. The
   markers are the exception: the feature tiles ([FEATURE-TILES.md](../FEATURE-TILES.md)) already hold any
   number.
3. **No identity across lists.** One thing is a row in several lists: a tyrannosaur in the PBDB, Wikidata and
   the Open Tree; a city in GeoNames, Pleiades, Wikidata and a list of city populations. Nothing joins them
   but a record's `same_as`, written by hand, and nothing fails when two records name the same thing.
4. **Lists disagree, and the world has only one way to say so.** Two classifications place a genus
   differently; two gazetteers put a town a kilometre apart. Competing claims hold this for records. For rows
   it needs a declared order: which list is preferred for which property of which kind.
5. **Licences close some of the best lists** (section 3.4): for the sea's species and the fishes, for the
   ranges of living species, for divergence times, for volcanoes, for the stars, for peoples, and for the
   states and persons of several traditions. They may be cited and linked, and a record may name their ids,
   but their rows may not come in.
6. **A listed thing is a name until it has a body, a place and a time.** A species needs a form (131 have
   their own), a range and a span. For fossils the atlas gives the last two. For the living, a range needs
   occurrences, of which 3.2 billion are open; and a span needs divergence times, whose one database may not
   be redistributed, so they come from the literature, clade by clade, as records.
7. **Nothing is reviewed.** Every claim is a machine's and proposed. A list's rows change this less than it
   seems: a row is the dataset's own statement, credited to it and pinned, and is checked upstream. It is the
   written records that need people.
8. **The evidence that did not survive.** Section 3.1. This is not in the way of anything: it is where the
   lists stop and the models begin.

### 3.4 An open list for each kind

Read on 25 November 2026 by two agents, each from the list's own pages or its record on Zenodo, DataCite
or Dataverse. *Size* is as the list's makers state it. A † marks what was read from a search engine's
snippet because the page refused a script. This is a first reading, to choose by: each list's licence is
read again, whole, when it is pinned, and written in the manifest's `verified:` note as every dataset's is.
Appendix B says what could not be read.

**Life**

| Kind of thing | A list that may come in | Size | Licence, as read | Lists that may not come in |
|---|---|---|---|---|
| Living species, by name | the Catalogue of Life | 2,278,463 accepted species, 173,031 of them flagged extinct | CC BY 4.0 | WoRMS ("Re-distribution of the entire database is not permitted"); FishBase and AmphibiaWeb (CC BY-NC) |
| The same, from others | the GBIF Backbone; NCBI Taxonomy; ITIS; the World Flora Online Plant List | 7.7 million name usages, last built in August 2023; 2,515,473 species; 1,004,738 names; 382,401 accepted species of plants | CC BY 4.0; "no restrictions"; public; CC0 by its Zenodo record | |
| The tree of life | the Open Tree of Life's synthetic tree | 2,385,875 tips, 159,925 of them placed by a phylogeny | CC0 "where not limited by pre-existing terms of use"; its taxonomy states none of its own | TimeTree, for divergence times ("Redistribution of TimeTree data and its transformations are not permitted") |
| Fossil taxa and where they were found | the Paleobiology Database, read in part | 410,244 taxa; 2,012,410 occurrences | CC0, by the data service's own header | |
| Fossils and pollen of the Quaternary | Neotoma | 31,402 sites | CC BY 4.0 | |
| Where living species are found | GBIF's occurrences | 3.9 billion: 477 million CC0, 2.75 billion CC BY, 681 million CC BY-NC | by record, and it can be asked for by licence | IUCN's ranges (non-commercial †) |
| Birds; mammals | the IOC World Bird List; the Mammal Diversity Database | 11,227 species; 6,904 | CC BY 3.0; CC BY 4.0 on Zenodo, though its site says "All rights reserved" | the Reptile Database states none; Amphibian Species of the World says "All Rights Reserved" |

**Earth**

| Kind of thing | A list that may come in | Size | Licence, as read | Lists that may not come in |
|---|---|---|---|---|
| Earthquakes | the USGS's catalogue (ComCat) | 4.9 million events | public domain, as the USGS's work | |
| Glaciers | the Randolph Glacier Inventory 7.0 | not stated | CC BY 4.0 | |
| Lakes | HydroLAKES | "1.4 million" | CC BY 4.0 | |
| Dams and reservoirs | Global Dam Watch | 41,145 barriers | "a free CC BY license" | GRanD 1.3 states none |
| Mineral deposits | the USGS's MRDS, not kept up since 2011 | not stated | public domain | Mindat (share-alike †) |
| Volcanoes | none yet | 1,209 of the Holocene and 1,457 of the Pleistocene, with 11,109 eruptions, in the Global Volcanism Program's | | its terms read as "non-commercial" † |
| Impact structures | none | about 190 † | | the Earth Impact Database's address now serves another business; Impact Earth states no licence |
| Mountain ranges | the GMBA inventory, if its licence allows | 8,616 ranges | not read; the paper that describes it is CC BY 4.0 | |
| Storms | IBTrACS, if its licence allows | not stated | "full and open access", with no licence named | |
| Meteorites; minerals | not read | 78,941 names †; 6,006 species † | their sites refused a script | |
| Large igneous provinces; the time scale's boundary sections | by hand, from the literature | 82 boundary sections | | the commission's table of provinces states no licence; the ICS's pages are "all rights reserved" |

**Space**

| Kind of thing | A list that may come in | Size | Licence, as read | Lists that may not come in |
|---|---|---|---|---|
| The Sun, the Moon and the planets | by hand: they are few | | | |
| Satellites and launches | GCAT | not stated | CC BY | |
| Asteroids and comets | the Minor Planet Center's; JPL's | 1,594,186 objects | neither states one | |
| Stars | **none found** | | | Gaia (1.8 billion sources) and Hipparcos: CC BY-NC 3.0 IGO. HYG (119,614 stars): CC BY-SA 4.0. The Yale Bright Star Catalogue (9,110) states none |
| Planets of other stars | NASA's Exoplanet Archive | 6,473 confirmed | none stated | |
| Named features of other worlds | the IAU's gazetteer, kept by the USGS | not stated | none stated | |

**People**

| Kind of thing | A list that may come in | Size | Licence, as read | Lists that may not come in |
|---|---|---|---|---|
| The identity of anything; persons; events; works | Wikidata | 124 million items. By query, as direct instances: 13.8 million humans, 608,581 human settlements, 303,785 buildings, 75,928 archaeological sites, 18,765 battles, 1,775 wars, 1.09 million paintings | CC0 | |
| Places of today | GeoNames | "over 13 million unique features" | CC BY 4.0 | Overture's buildings and divisions (ODbL) |
| Ancient places | Pleiades | "just over 42,000" | CC BY (3.0 on its downloads page) | Trismegistos (CC BY-SA 4.0); CHGIS ("no commercial use, resale, or redistribution") |
| Historical places, worldwide | World Historical Gazetteer | 2.2 million places to search | by dataset: 24 licences, some share-alike or non-commercial, so only the open ones | |
| Periods and cultures, by region | PeriodO | not stated | public domain | |
| Dated buildings, streets and borders | OpenHistoricalMap, of which the world reads Rome | 7.8 million dated elements, 2.59 million of them buildings; the whole is 1.3 GB | CC0, but for elements tagged with a licence of their own, which are left out | Viabundus (CC BY-SA) |
| States | Cliopatria, read already | 13,778 rows | CC BY 4.0 | Seshat (CC BY-SA 4.0 by its terms); CShapes 2.0 (CC BY-NC-SA 4.0) |
| Wars | UCDP, from 1946 | not stated | CC BY 4.0 | Correlates of War and Brecke's catalogue state no licence |
| Persons of one tradition | none beyond Wikidata | | | the China Biographical Database (CC BY-NC-SA 4.0); the Digital Prosopography of the Roman Republic (CC BY-NC 4.0) |
| Radiocarbon-dated sites | p3k14c; XRONOS | 180,070 dates; 314,832 dates at 70,660 sites | CC0; CC BY 4.0 | ROAD (CC BY-SA 4.0 †) |
| Ancient individuals with genomes | the Allen Ancient DNA Resource | not stated | CC0, by its Dataverse record | |
| Languages, and what they are like | Glottolog, read already; WALS; Grambank | 8,304 points read; Grambank has 2,467 languages | CC BY 4.0, each | |
| Peoples | none found | | | D-PLACE and the Ethnographic Atlas (CC BY-NC 4.0) |
| Religions | the Database of Religious History, in a derived release on Zenodo | not stated | CC BY 4.0, for that release | no open data of their spread over the map was found |
| Heritage sites | none beyond Wikidata | | | UNESCO's World Heritage List (CC BY-SA 4.0) |
| Inscriptions and coins | Nomisma's concepts | | CC BY | the Epigraphic Database Heidelberg (CC BY-SA 4.0 †); OCRE (ODbL) |
| Shipwrecks | none yet | 1,784 in the Oxford Roman Economy Project's | | it states no licence |
| Objects in museums | the Met; the Smithsonian; the Rijksmuseum; the Art Institute of Chicago; the Cleveland Museum of Art | 470,000; 11 million; 800,000; 133,375; 61,000 | CC0, each for its data | the British Museum (CC BY-NC-SA 4.0 †) |
| Roads and routes | Itiner-e, read already; ORBIS | 13,846 stretches read | CC BY 4.0; CC BY 3.0 | Viabundus (CC BY-SA) |
| Cities and their people | Chandler's and Modelski's lists, read already; Buringh's | 2,262 European settlements in Buringh's | CC BY 4.0; CC0 | |
| Economies | the Maddison Project Database 2023 | 169 countries | CC BY 4.0 | |
| Voyages of the slave trade | SlaveVoyages | 36,108 voyages † | what is drawn from documents is public domain, and what is imputed is non-commercial: by variable | |

Two lists are open in every way but the letter of rule 6: the Getty vocabularies and VIAF are under the
Open Data Commons Attribution licence, which asks for credit only and is not one of `publish.licenses`.
Whether it joins them is a decision (section 6).

## 4. Kinds of thing the world lacks

*Here* is what `world/entities` and the datasets hold today. A kind marked **none** has no record and no
row. Several need a new term in [kinds.yaml](../../world/schema/vocab/kinds.yaml), added with the first
records that need it.

### Space

| Kind of thing | Here |
|---|---|
| The Sun, the Moon, the planets and their moons, as bodies | the Earth alone; the Sun's luminosity and the Moon's distance are series, with no record to hang on |
| Asteroids and comets | **none** |
| Stars and constellations: the sky of any night | **none**: the globe's stars are random points made in a shader |
| What was seen in the sky: eclipses, supernovae, comets | **none**, though a dated eclipse is among the best checks a chronology has |
| Meteorite falls and finds | **none** |
| Spacecraft, satellites and launches | three events |

### Earth

| Kind of thing | Here |
|---|---|
| Rivers, lakes, seas, oceans, islands, deserts, as named things | **none** as things: rivers and lakes are fields, and a click on the Nile names nothing |
| Mountain ranges | eight, written by hand |
| Volcanoes | **none** as things: 9,123 hazards are rows of eruptions, earthquakes and tsunamis |
| Glaciers and ice sheets, as things with a life | fields only |
| Impact structures | Chicxulub |
| Large igneous provinces | three |
| Supercontinents, cratons, terranes and vanished oceans | 54 plates; no Pangaea, Gondwana, Rodinia or Tethys |
| Rock formations | 35,481 units as rows; none as a record, though `rock-unit` is in the vocabulary |
| Minerals, ore deposits and mines | **none** |
| Climate events: the PETM, the ocean anoxic events, the Messinian salinity crisis | three Snowball glaciations and ten records of the ice ages |
| Storms, floods and droughts | **none** |

### Life

| Kind of thing | Here |
|---|---|
| Living species | **none** as such: section 3.2 |
| Microbes, fungi and viruses | four clades |
| Named specimens and individuals | 150 dated finds |
| Fossil sites, biotas and Lagerstätten, as things | one ecosystem, the Hell Creek; the PBDB's collections as rows |
| Biomes and ecoregions, as named things | a field only |
| Diseases and their outbreaks | **none** |
| Breeds and cultivars | 20 domestications, each a development and not a breed |

### People

| Kind of thing | Here |
|---|---|
| Archaeological sites | **none** as a kind: 24 settlements and the finds |
| Archaeological cultures and regional periods | eight tool industries; the periods are the ICS chart's only |
| Peoples | **none** |
| Languages through time, and their families as a tree | today's languages as points |
| Religions, their institutions and sacred places | **none** |
| Persons who were not rulers | two |
| Dynasties and offices, as things | offices only as relations of a person |
| Battles, sieges, wars and treaties | two battles, three wars, two treaties |
| Epidemics, famines, revolts and migrations | **none** in history; the dispersals of prehistory |
| Voyages and expeditions | a handful |
| Works: texts, books, paintings, music, maps | **none** as things. A text is a source here, and has no place or date in the world |
| Inventions, technologies and discoveries | domestication, 13 scripts and three others |
| Organizations: companies, orders, universities, churches | one |
| Buildings outside Rome | one |
| Roads other than Rome's, canals, railways, ports and dams | Roman roads as rows |
| Provinces and other divisions of states | **none** |
| Currencies, commodities and prices | **none** |
| Shipwrecks | 14 |

### The present

Today's countries are 393 border lines and today's cities 1,251 points, both rows. Nothing else of the
present is here: no living species, no living language's speakers, no building standing now.
[STRUCTURE.md](../STRUCTURE.md) section 4 defers the present at street scale, since its best sources are
share-alike. The present's lists of things are not deferred by that: most are open.

## 5. The plan

### 5.1 Three states of a thing

A thing in the world is in one of three states, and may rise from one to the next:

| State | What it is | Where it lives | Who makes it |
|---|---|---|---|
| **generated** | a slot a generator filled: this tree, this house, this unnamed species | nowhere: made again from its seed | a generator, from a model |
| **listed** | a row of a pinned list: a name, an identifier, and what the list says of it | the blob store, as a snapshot | the list's own makers, read by the build |
| **written** | a record: claims with sources and quotes, relations, phases, a form | `world/entities`, in git | a person or an agent, one at a time |

Promotion from generated to written is in the design already (section 7). Adoption of a listed thing by a
written one is too, for taxa (`same_as: { pbdb: "txn:38862" }`). The plan makes both general. Four rules
follow:

- **One backbone for each kind:** a list that says what there is of that kind and gives each thing an
  identifier. It is the denominator [CATALOG.md](CATALOG.md) asks for.
- **A list is never copied into records.** [STRUCTURE.md](../STRUCTURE.md) section 3.1 gives the reasons, and
  they hold at any size.
- **A record is for what a list cannot say:** evidence with a locator and a quote, a disagreement, lineage, an
  account, a form. Agents are spent there, where the build says a record is most wanted.
- **Where no list reaches, a model answers,** and says so.

### 5.2 The steps

**Step 1. Shelve by kind.** A move of files, with no id changed.

- *The rule:* a directory is named for a kind of thing, never for the job that wrote its files. A path is
  `<domain>/<kind's directory>[/<shard>]/<name>.yaml`. The exception is the detail of one settlement, its
  buildings, streets and districts, which a contributor works on a city at a time: `places/<settlement>/`.
- *The table:* `world/schema/layout.yaml` gives each kind its directory. The validator warns at a record
  that sits elsewhere, so "where does this go" has one answer, which an agent can look up.
- *A set is a relation or a list, never a folder.* The Hell Creek's taxa are members of its ecosystem;
  Rome's buildings are part of Rome; the conquest's events are part of the conquest. Where a set has no such
  thing to belong to, its slice document lists its ids. [CATALOG.md](CATALOG.md)'s selectors then choose by
  kind and relation, not by path.
- *Two guards:* two records with the same external id fail validation; and a thing a dataset brought says
  so in a field of its own, so the three tests on an id's prefix go.
- *Done when:* every directory holds one family of kinds; `npm run validate` is clean; the build is the same
  in meaning (`npm run test:reproducible`), as no id has changed; the example paths in
  [RECORDS.md](../RECORDS.md) and the "Where" column of [RECORD-SETS.md](../RECORD-SETS.md) are right.
- Appendix A gives the move, directory by directory: about 580 files.

**Step 2. A row is a thing.** Finish section 3.1 of [STRUCTURE.md](../STRUCTURE.md).

A field's `rows:` already says a row's kind, its key and which column is which property. It gains what
makes a row a thing:

```yaml
# world/fields/earth/languages.yaml: a sketch
rows:
  kind: language
  key: "{Glottocode}"
  scheme: glottolog                     # its things are known as glottolog:stan1293, in every snapshot
  parent: { column: Family_ID }         # for a list that is a tree
  same_as: { iso639-3: ISO639P3code }   # the other schemes its columns carry
  claims:
    name: { column: Name, as: text }
    location: { column: [Latitude, Longitude], as: point, method: compilation }
```

From that one declaration the build makes, for every row of every list:

- an entry in search;
- a page, from the row's claims and any overlay on it;
- a marker in the feature tiles, from as far away as its kind and size say;
- a target for a reference: `to: glottolog:stan1293` is the record that adopts it, or else the row. The
  schema's `ref` already allows `scheme:id`. A row's address with its snapshot's date in it
  (`src:glottolog-5.3#stan1293`) stays, as the citation of what one snapshot said;
- a node of a tree, where the list is one.

The lists already read move onto it first: the PBDB's land, sea and formation taxa, OpenHistoricalMap's
elements, Glottolog, the hazards, Cliopatria, Natural Earth's places and Macrostrat's units. The ids the two
importers made (`life/pbdb/txn-<n>`, `rome/ohm/…`) are kept as other names for the same things, since links
to them are out.

- *Done when:* any taxon the atlas can draw is found by name and opens a page; the count of findable things
  goes from 3,263 to more than 100,000 with no new dataset; `ohm-site`, `pbdb-formation` and `pbdb-land` are
  no longer kinds of import; a test asks every list's rows for search, a page and a reference.
- *Left as it is:* the date solver reads records only. A row's dates are the list's, shown as given.

**Step 3. Outputs that hold millions.**

- *Search* in shards by the start of a name, fetched as the reader types, with the most prominent things of
  every kind in a first small shard.
- *Pages* of listed things composed in the viewer from columnar chunks keyed by identifier, a few kilobytes
  a fetch. Written records keep their own files.
- *The tree* in shards by clade, a node's children fetched when it is opened.
- *Snapshots* kept columnar in the blob store, which section 3.1 of STRUCTURE.md left undone.
- *Done when:* what the viewer loads at first does not grow with the number of listed things, held by a
  test with a budget.

**Step 4. One identity across lists.**

- The build makes a table of which rows of which lists are one thing, from the lists' own cross-references,
  Wikidata's identifier statements, and the `same_as` of records.
- One thing in two lists has one page, which shows both rows. Where they differ, they are competing claims,
  and the field says which list is preferred for which property: the PBDB for when a fossil taxon lived, a
  list of the living for a living species' name.
- **Never joined by name alone.** Names repeat across kingdoms and across centuries. The field says what
  besides a name makes a match the build may make by itself, and the page says it was made so: for a taxon,
  the same rank and an agreeing parent or author; for a place, the same kind within a stated distance. Less
  than that is a proposal, listed as work (`npm run world -- matches-wanted`), and becomes a join when an
  agent or a person confirms it in an overlay.
- *Done when:* *Tyrannosaurus rex* is one page naming its record, its PBDB taxon and its other identifiers;
  and no two things in search are the same thing by any identifier the lists give.

**Step 5. A backbone for each kind,** in the order of what each unlocks. Each is a pinned snapshot, a
`rows:` declaration and a line of attribution, and no code in the viewer. Section 3.4 has the lists.

1. *Life today.* A list of living species with its tree (decision 5), then present-day occurrences into the
   atlas as its tier for today. GBIF's open occurrences are 3.2 billion, far too many to pin whole: they are
   asked for already reduced, to species by cell, as the fossils' snapshots were asked for by span. It gives
   the present its wildlife, the tree its living tips, and every form a wider reach, since a form climbs the
   tree.
2. *Places.* The named settlements and the named rivers, lakes, seas, islands and mountains. It labels the
   globe at any height, gives the cities a denominator, and gives nearly every located record its external
   id for nothing.
3. *The sky and the Solar System.* The bodies as records, written by hand, since they are few. Eclipses need
   no list: they follow from the motions of the Sun, the Moon and the Earth, which is a model, and the
   records that mention one are its check and the chronology's. The stars wait: no catalogue of them that may
   come in was found (decision 9).
4. *The Earth's features.* Earthquakes, glaciers, lakes, dams and mineral deposits have open lists. Volcanoes
   and impact structures do not, as read, and the large igneous provinces are few enough to write.
5. *People, events and works,* from Wikidata: the dead, with their dates; battles, wars and treaties with a
   date and a place; buildings with a place and a date of building. They come in as listed things, each
   marked as Wikidata's and unchecked, and any record outranks them (decision 4).
6. *Archaeology and language.* Dated sites, the periods and cultures of each region, and the languages as a
   tree with their families, which [MODELS.md](MODELS.md) needs to carry a trait by relatedness.
7. *Objects in collections,* by demand only: the lists are large and most of their things are never looked
   at.

**Step 6. Written records where they are most wanted.** `forms-wanted` already ranks the taxa that most
need a body by how often the atlas draws them. The same for every kind: for each backbone, the build ranks
the listed things that most want a record, by how often they are drawn, how often a record refers to them,
and how often people look. These are [CATALOG.md](CATALOG.md)'s items, and the backbone is its denominator.
The aim is not a file for every species. It is a page for every species, and a record for those most seen.

**Step 7. A model for what no list reaches.** For each kind, how many things there were that no list has
is a quantity like any other ([MODELS.md](MODELS.md)): the species of a clade at a time, observed by the
fossil and living lists and tested on those held out; the people of a place, which HYDE gives; its
settlements, which the pilot does. Generators draw the individuals from it, each a slot that can be
promoted. A clade's page then says how many of its species are listed, how many are thought to have lived,
and that the rest are drawn as stand-ins.

### 5.3 What not to do

- **Do not turn a list into records,** however cheap the conversion. Two million files, every refresh a
  diff of thousands, and a fork of the upstream.
- **Do not import a share-alike or non-commercial list** because it is the best one. Cite it, link it, name
  its ids in `same_as`, and find the facts in what may come in.
- **Do not write a record of a thing a backbone lists without naming its identifier.** That is how one thing
  gets two records.
- **Do not list the living.** A list of persons stops at those who have died (decision 6).

## 6. Decisions needed

1. **The layout:** by kind, as step 1 has it (recommended), or by region and era, as the design first drew
   it. By kind gives every record one right place, which a region does not for a thing that crossed regions
   or lived before them.
2. **When to move the files:** in one pull request, once the open branches that add records have merged.
   Git follows a renamed file, but a file added to an old directory would land beside the rule.
3. **How a listed thing is referred to:** by its own scheme and identifier, `glottolog:stan1293`
   (recommended), which is stable across snapshots and is what the design already calls an external id; or
   by an id the importer makes, as `life/pbdb/txn-<n>` is now.
4. **Whether Wikidata's statements may come in as a listed thing's claims.** [RECORDS.md](../RECORDS.md) has
   Wikidata "for identifiers more than for facts". Recommended: yes, for a name, a place and a date, marked
   as Wikidata's, never preferred over a record's claim, and never read by the solver. A labelled lead is
   better than a hole, and the rows that contradict a record are a list of work.
5. **Which list is the backbone of the living.** Recommended: the Catalogue of Life for what there is and
   what it is called, since it is current and flags the extinct; the Open Tree's synthetic tree for who
   descends from whom, since sixty records carry its ids already; and the GBIF Backbone only as the key its
   occurrences are filed under. Step 4 joins the three.
6. **Persons:** only the dead (recommended), with a cut-off to choose.
7. **How large a snapshot may be.** The lists of step 5 are gigabytes together in the blob store; none goes
   in git.
8. **Whether the Open Data Commons Attribution licence joins `publish.licenses`.** It asks for credit and
   nothing else, as CC BY does, and the Getty vocabularies and VIAF are under it.
9. **What to do where the best list is closed or states no licence:** the stars, volcanoes, asteroids, impact
   structures. Recommended: ask the makers, as [DATA-OUTLINE.md](../DATA-OUTLINE.md) advises, and until they
   answer take what Wikidata has of the same things, which is CC0 and was not counted here.

## 7. Open questions

- **Where two trees meet.** The PBDB's classification and a living list's will disagree about the same
  clade. Competing parents handle one taxon. Which tree is preferred over which part of life needs a rule
  that does not cut a clade in two.
- **Rows and the solver.** A listed battle's date is not checked against a listed ruler's reign. Reading
  rows in the solver would find the contradictions, and would let one bad row fail the world.
- **Corrections upstream.** [STRUCTURE.md](../STRUCTURE.md) section 7 asks whether an overlay that corrects a
  row should be sent to the list's makers. With millions of rows the question is sharper.
- **Prominence among millions.** The rule ranks by kind and measured size. Most listed things have no
  measured size.
- **Lists are of the present.** A gazetteer gives a town where it is now, under its name now; a language
  list gives the languages spoken now. How far back a listed thing is drawn, and under which name, is the
  list's silence, and needs a default that says so.
- **Things with no edge.** A monsoon, an ocean current and a culture are not rows of anything. Whether each
  is a record, a field or both is decided kind by kind.

## Appendix A: where each directory's files would go

No id changes. *Kinds* are those in the directory today.

| Now | Files | Kinds | To |
|---|---|---|---|
| `life/taxa/` and its shards | 619 | taxa | stays; its shards named by clade, with a rule for which |
| `life/hell-creek/` | 43 | 42 taxa, the ecosystem | `life/taxa/…`, `life/ecosystems/` |
| `life/hominins/` | 34 | 14 taxa, 20 finds | `life/taxa/…`, `life/occurrences/` |
| `life/megafauna/` | 27 | 13 taxa, 9 events, 5 finds | `life/taxa/…`, `life/events/`, `life/occurrences/` |
| `life/occurrences/`, `life/fossil-forests/`, `life/mesosaurus/` | 69 | finds | `life/occurrences/` |
| `life/transitions/` | 25 | events | `life/events/` |
| `earth/events/`, `earth/ice-ages/`, `earth/futures/` | 33 | 29 events, 4 periods | `earth/events/`, `periods/` |
| `earth/orogens/`, `earth/structures/` | 9 | landforms | `earth/landforms/` |
| `earth/day-length/`, `earth/samples/` | 27 | 24 samples, 2 finds, an event | `earth/samples/`, `life/occurrences/`, `earth/events/` |
| `earth/plates/`, `earth/lips/`, `periods/ics/`, `space/` | 249 | as named | stay |
| `people/first-cities/`, `people/cities/`, `places/` | 24 | settlements | `people/settlements/` |
| `rome/` | 110 | buildings, monuments, works, open spaces | `places/rome/` |
| `people/rulers/`, `people/persons/` | 46 | persons | `people/persons/` |
| `people/events/`, `people/wars/`, `people/conquest/` | 24 | events | `people/events/` |
| `people/calendars/` | 3 | the days that anchor calendars | `periods/calendars/` |
| `people/dispersals/` | 30 | 17 events, 13 finds | `people/events/`, `people/occurrences/` |
| `people/trade/` | 24 | 19 events, 3 finds, a building, a polity | `people/events/`, `people/occurrences/`, `places/…`, `people/polities/` |
| `people/domestication/` | 47 | 20 developments, 25 finds, 2 taxa | `people/developments/`, `people/occurrences/`, `life/taxa/…` |
| `people/writing/` | 26 | 13 scripts, 13 finds | `people/developments/`, `people/occurrences/` |
| `people/prehistory/` | 14 | 8 industries, 6 artefacts | `people/industries/`, `people/artefacts/` |
| `people/objects/` | 13 | artefacts | `people/artefacts/` |
| `people/traditions/`, `people/husbandry/`, `people/agriculture/` | 122 | traditions | `people/traditions/`, a shard for each of the three |
| `people/polities/`, `people/developments/`, `people/organizations/` | 46 | as named | stay |

## Appendix B: what the reading of the licences could not reach

Section 3.4 was read by script, and some of it did not answer. Before any of these is pinned, a person or an
agent that can reach the page reads it.

**Life, the Earth and space.**

- *Refused a script, so read from a search engine's snippet or not at all:* the Global Volcanism Program,
  IUCN's Red List, the Meteoritical Bulletin, the IMA's list of minerals and RRUFF, Mindat, the GMBA
  inventory's host, and the paper the count of named fossil species is from.
- *Gone:* the Earth Impact Database. Its address serves another business, and no other home for it was found.
- *No licence stated:* the Minor Planet Center's orbits, JPL's Small-Body Database, NASA's Exoplanet Archive,
  the Yale Bright Star Catalogue, the IAU's gazetteer of planetary names, IBTrACS, GRanD 1.3, the Reptile
  Database, the Large Igneous Provinces Commission's table. Several are a United States agency's work, as
  NOAA's hazards are, which the world took as public domain and has not yet confirmed
  ([RECORD-SETS.md](../RECORD-SETS.md#the-licences-to-check)).
- *Statements that disagree:* the Mammal Diversity Database is CC BY 4.0 on Zenodo and "All rights reserved"
  on its site; the Open Tree's CC0 is "where not limited by pre-existing terms of use", and its taxonomy is
  built from lists with terms of their own.
- *The Paleobiology Database's licence:* its data service says CC0 now. No dated notice of the change from
  CC BY was found.
- *The estimates of section 3.1:* Mora et al. was read in the journal; Alroy's count from a snippet; Barnosky
  et al.'s figure as another site quotes it.

**People.**

- *Refused a script, so read from a search engine's snippet or not at all:* the Canadian Archaeological
  Radiocarbon Database, tDAR, UNESCO's own site, the British Museum, Europeana, VIAF's site, the China
  Biographical Database's site, the Epigraphic Database Heidelberg, the Smithsonian's page (its repository
  was read), HYDE's site (its DataCite record was read, and says CC BY 4.0 for HYDE 3.3).
- *Could not be reached:* ROCEEH's site, for the Out of Africa Database; the Old World Trade Routes project.
- *Pages that are scripts only:* the United Nations' population site, SlaveVoyages, the Database of
  Religious History.
- *Statements that disagree:* Seshat's terms say CC BY-SA 4.0, and its Equinox release on Zenodo is labelled
  CC BY; Pleiades says CC BY in one place and CC BY 3.0 in another; al-Ṯurayyā says CC BY 4.0 for what the
  project made, which leaves out what it took from a printed atlas of 1983.
- *No licence stated:* the Correlates of War data, Brecke's Conflict Catalog, the Oxford Roman Economy
  Project's shipwrecks, the Digital Index of North American Archaeology, Open Library (which "does not
  assert any new copyright").
- *Wikidata's counts* are of direct instances, by query on the day. Counted with subclasses they are several
  times larger, and depend on its tree of classes.
