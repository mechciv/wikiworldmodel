# Filling in how people are drawn: time, ways of life, and things

Status: built in November 2026 as the [sixteenth slice](../slices/SIXTEENTH-SLICE.md), but for step 5, the ends of
time, which was set aside: [what was built](#what-was-built) says how each step came out. The rest is the plan as it
was written, before any of it was built. It says how much of the human world a visitor sees drawn from
something written, where the rest is a stand-in, and the order to fill it in. It takes up
[HUMAN-LANDSCAPE.md](../HUMAN-LANDSCAPE.md) at its step 4; [DWELLINGS.md](../DWELLINGS.md) is the brief for the records,
and [RENDERING.md](RENDERING.md) is the plan for the picture's quality, which this does not touch.

## Where it stands

The engine answers everywhere: at any land since 10,000 BCE a scene draws settlements, houses and fields. What it
draws them *from* is thin. The figures below were measured on master (2de771b) by a script that is not kept: HYDE's
people of each 1° cell shared over its 5′ cells as the generator shares them, each cell given its way of life by
`model:people/lifeways`, and counted as drawn from a tradition where the generator would use one.

**Across time.** Shares are of the people alive then.

| Time | People | Foragers | Herders | Shifting | Farmsteads, hamlets | Villages | Towns, cities | In a tradition's house |
|---|---|---|---|---|---|---|---|---|
| before 10,000 BCE | not modelled | | | | | | | nothing is drawn |
| 8000 BCE | 7 million | 100% | | | | | | 0% |
| 4000 BCE | 29 million | 66% | 17% | 6% | 10% | 0.4% | 0.4% | 0% |
| 2000 BCE | 73 million | 39% | 28% | 12% | 20% | 1% | 0.6% | 2% |
| 1000 BCE | 111 million | 15% | 29% | 17% | 37% | 1.5% | 1% | 3% |
| 1 CE | 232 million | 6% | 11% | 10% | 65% | 4% | 4% | 4% |
| 1000 CE | 323 million | 6% | 12% | 7% | 57% | 10% | 9% | 2% |
| 1500 CE | 503 million | 5% | 10% | 9% | 55% | 12% | 9% | 7% |
| 1850 CE | 1.27 billion | 0.6% | 4% | 2% | 26% | 52% | 15% | 4% |
| 2000 CE | 6.1 billion | 0.1% | 0.7% | 0.4% | 8% | 53% | 38% | 10%, wrongly (below) |

So at every time, at least nine people in ten are drawn in a generic house. The 37 traditions written name 43 of the
146 regions, and at most 22 regions have one at any of the times sampled.

**Across ways of life.**

| Way of life | What draws it now | What is written | The gap |
|---|---|---|---|
| Foragers' camps | one dome hut of thatch, in every climate | Jōmon, Thule and Stony Rises houses, none of them used | all of it: the generator never gives a camp a tradition's house |
| Herders' camps | one felt tent, from the Sahel to the Andes | the Mongolian ger, not used for herders | the same |
| Shifting cultivators | the farmer's house of the climate | the Iroquoian longhouse, the Southeast Asian house on piles | Amazonia, the Congo basin, New Guinea, the Eastern Woodlands before 1300 |
| Farmsteads, hamlets | the farmer's house of the climate (eight climates) | most of the 37 | India, China, Europe after Rome, West Africa: the top of `dwellings-wanted` |
| Villages | the same house, closer together | 24 traditions say how their houses stood together | half of all people from 1850, nearly all in regions with no tradition |
| Towns, cities | a round cluster of two-storey houses, no streets | Rome's fabric; Tenochtitlan's house plot | every other city |

**Across things.**

| Thing | In the records | Drawn in a scene |
|---|---|---|
| Houses | 37 traditions | yes, generic or a tradition's |
| Fields, pastures | 5 generic plot kinds; 4 traditions with a `field_system` | painted on the ground |
| Cities of the lists | 1,750 cities; 35 with a figure at 1 CE, 379 at 1500, 1,323 at 1850 | a dense cluster each |
| Cities as records | 22 settlements (18 first cities, Rome, Constantinople, Tenochtitlan, Tlatelolco) | Rome only, 300 BCE to 600 CE, as streets and blocks |
| Monuments, public buildings | 96 of Rome, with outlines from OpenHistoricalMap | Rome only |
| Roads, paths | Itiner-e's Roman roads, on the globe | no |
| Livestock, crops | 47 domestication records | no animals; crops only as plot kinds |
| People, boats, tools | 14 shipwrecks, 13 objects, 8 industries | no |
| Anything before 10,000 BCE | 30 dispersal sites, 14 prehistory records | no |

## What is wrong, apart from what is missing

1. **A camp never takes a tradition.** `formOf` in the settlement generator uses a tradition's dwelling only for
   farmers and townspeople. The ger, the Jōmon pit dwelling and the Thule winter house are written and are drawn only
   for whatever farmers HYDE puts in their regions. Before 3000 BCE this is most of humanity.
2. **A tradition has no way of life.** It holds for a region and a span, and draws every house there: a herder's ger
   would house Mongolia's farmers, and the Indus courtyard house every hamlet of northern India.
3. **A tradition with no `end` runs to the present.** The 10% of 2000 CE is the house on piles and others like it
   drawn through today's cities. Nothing written describes how most people have been housed since 1850.
4. **The measure is not kept.** `dwellings-wanted` ranks regions by people, with no way of life, and `coverage.json`
   does not count houses by tier.

## The steps

**0. Keep the measure.** The table above, by time and way of life, counted by every build into `coverage.json` and
shown on the coverage page; `dwellings-wanted` gains a column for the way of life. Each step below is judged on it.

**1. Give a tradition its way of life.** A claim, or the `settlement_form`'s pattern, says whom a tradition houses:
camps, shifting cultivators, farmers, townspeople. The generator then picks the most particular tradition *for the
pattern*, camps included. A new version of the generator. It makes four written traditions count at once, and is the
condition for steps 2 and 3 being right.

**2. Fill by people.** Broad traditions from the top of `dwellings-wanted`. Twelve regions with none hold 56% of the
people of 1850: Eastern, Northern, South Central, Southeastern and Northeastern China, Northern, Eastern and Southern
India, Central and Southern Europe, France, Japan. One broad tradition each for two or three spans is some thirty
records. Aim: half of each time's people from 3000 BCE to 1850 in a tradition's house, then four in five.

**3. Fill by way of life.** The small ways of life never reach the top of a list ranked by people, and they are the
whole picture before 3000 BCE and most of the land after. One broad tradition for each way of life in each climate it
was lived in: foragers' shelters (some eight), herders' tents and houses (steppe, Sahel, Arabia, the Andes, reindeer
country), shifting cultivators' houses (the four regions above). Aim: no camp in the generic hut where a source
could be read.

**4. Cities.** Three tiers, each a fallback for the one above.
   - *Any city of the lists:* a generic fabric in place of the cluster: streets, blocks and a wall, from a city form
     that a broad tradition states (grid, lanes, canals; walled or open), as a house's form is stated now.
   - *A city with a record:* `gen:rome/fabric` made a generator of any city, reading the record's area, people,
     houses and walls. The 22 settlements first; Tenochtitlan needs its lakes.
   - *A city with a map:* monuments and outlines through OpenHistoricalMap, as Rome's are. By demand, one slice each.

**5. The ends of time.** Before 10,000 BCE no model says where people were, so draw only evidence: a camp at each
dated site of the dispersal and prehistory records, and nothing between. After 1850: ends for the traditions that
stopped, and traditions for industrial and modern housing, or the present stays a stand-in and says so.

**6. What lives and moves there.** Livestock in the pastures first: the domestication records say which animal was
where from when, and forms are a pipeline that exists ([FORMS.md](../FORMS.md)). Then paths between settlements and
the Roman roads in scenes, then people, then boats.

## What was built

The [sixteenth slice](../slices/SIXTEENTH-SLICE.md) is the record of it; in short, by step:

| Step | Built | Not built |
|---|---|---|
| 0. Keep the measure | every build counts it at sixteen times (`coverage.json`), the coverage page and the glance show it, `dwellings-wanted` lists by way of life | |
| 1. A tradition's way of life | a `lifeway` claim on every tradition; version 2 of the generator; farmers and shifting cultivators stand in for each other | |
| 2. Fill by people | 37 traditions for South Asia, China, Japan, Korea and Europe. Of each time's people, 28% at 1 CE and at 1500, 56% at 1750 and 55% at 1850 are in a tradition's house, where the table above has 4%, 7% and 4% | France, eastern and southern Europe, the Ganges plain and South India before 1500, south-eastern China's lowlands: the aim of half from 3000 BCE is met only from 1750 |
| 3. Fill by way of life | 18 traditions: herders 7, foragers 6, shifting cultivators and the farmers who stand in 5 | most camps are still generic: travellers' accounts begin in the nineteenth century, and nothing was read for Australia, the Amazon, the Sahel or the Bronze Age steppe |
| 4. Cities | a town form (streets, a wall, gates, a moat, a square) from a tradition or a record; the 22 settlements with records drawn from their own people, houses and ground | no generator of any city from Rome's fabric: a recorded city is drawn in the living scene; Tenochtitlan's lakes; cities with maps |
| 5. The ends of time | | all of it, by decision: the world after 1850 wants a framework of its own, nearer to records than to traditions, and the time before 10,000 BCE is left as it is |
| 6. What lives and moves | 20 husbandry traditions and the animals they name, as herds and yard animals; paths between settlements; people; boats | the Roman roads, or any recorded road, in a scene |

Three things the plan did not foresee:

- **A house of a part of a region.** A tradition is drawn over the whole of each region it names, and the regions are
  large. A `prevalence` claim (a few, some, most) now draws a rare house for a part of a region's cells.
- **The model's ways of life are the bound.** A tradition reaches only the people the model gives its way of life, and
  the model has herders, shifting cultivators and foragers where the excavators have farms. Mending the model would
  house more people than any record.
- **The viewer could not show most of it.** No scene could be made within 1,400 km of Rome while Rome stood. A city
  with a scene of its own now keeps 60 km.

What this plan left alone, how a house itself is drawn and what stands round it, is the
[seventeenth slice](../slices/SEVENTEENTH-SLICE.md): a house from every part its tradition's claims state, in its
yard, in shapes that differ.

## Order, and what is to be decided

Steps 0 and 1 are small and come first. Steps 2 and 3 are records, written by agents in parallel once 1 is in. Step 4's
first tier follows 1; its second is a slice. Steps 5 and 6 can wait for a demand.

- Is the way of life a claim of the tradition, or read from its `settlement_form`? A claim is plainer. *Decided: a
  claim.*
- Is the world after 1850 in scope now, or left generic and marked? *Decided: left, for a framework of its own.*
- Before 10,000 BCE, sites only, or a model of foragers' numbers as well? *Decided: left as it is.*
