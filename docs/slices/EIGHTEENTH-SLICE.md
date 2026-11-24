# Eighteenth slice: cities through their lives

Status: built in part; see *How it was checked* for what was and was not run. It builds the first steps of
[plans/CITIES.md](../plans/CITIES.md), which asked how a viewer could draw thousands of cities over millennia when it
drew one city building by building, for one year, and every other as a disc of houses sized by a figure. It answers
with one system for every city, graded by what is known of it, and moves Rome onto it.

It adds:

- **A city's frame and its faces** ([core/frame.ts](../../core/frame.ts)): the lines nothing generated may cross, its
  routes, walls and the edge of its ground, noded on a grid of a tenth of a metre with exact integer tests, and the
  faces they enclose, each named by the run of lines and corners round it. A line added elsewhere leaves a face's name
  as it was; a line drawn across one makes two new faces and touches no other.
- **Two models.** `model:people/city-population` ([core/citypop.ts](../../core/citypop.ts)): a city's people through
  time, as members of a band, from every list's figure and its record's own. `model:people/settlement-growth`
  ([core/growth.ts](../../core/growth.ts)): one ranking of a city's ground, by how soon it would be built on, cut at
  each time where the built ground reaches the area its people needed then; an epoch for each wall. Nothing is stepped
  forward: any year is worked out directly, and a city grows and shrinks along the one ranking.
- **The land divided once** ([division.ts](../../world/generators/people/settlement/division.ts)): each face cut into
  lanes and blocks, organically or on a grid laid over the whole city, and the blocks into plots along their fronts,
  sized by the density where they lie at the city's height. Only what is built at the time asked is divided, and a
  piece divided later is divided as it would have been at once.
- **A city laid out through its whole life** ([town.ts](../../world/generators/people/settlement/town.ts)): routes
  towards the places it dealt with, the growth model's ranking, a wall round its body as it stood when the wall was
  built, the frame and its faces, all in the city's own metres from the city and the world's ground alone. The
  settlement generator, at **version 10**, lays every city of the lists and the records out so: a time says only which
  plots were built then.
- **A city's records in the living scene** ([viewer/src/city/structures.ts](../../viewer/src/city/structures.ts),
  [world/generators/life/survey.ts](../../world/generators/life/survey.ts)): where a map of the world is of a city,
  the living scene near it stands on the city's surveyed ground, draws its mapped water, keeps its own invented river
  off it, and draws the city's records building by building among its houses, fine near the eye and coarse beyond,
  each dated by its record.
- **Rome, moved over.** Rome is a city like any other: its houses are the settlement generator's, its monuments the
  records', drawn in the living scene. `gen:rome/fabric`, Rome's own scene and the 60 km round it within which no
  living scene was drawn are gone. A map's dataset says which city it is of (`import.site` in the manifest).
- **What most wants records** (`npm run world -- cities-wanted`): every city, its tier of what is known of it, and the
  people who lived in it summed over its years, the most first.
- **Two terms:** a town form's `orientation`, the bearing of its grid or main street; and a settlement's `extent`, its
  outline at a time.

## Running it

As for the other slices (see the [README](../../README.md)). In the viewer:

- **Rome in 315, from the south-east:** `?t=315.5&lat=41.8875&lon=12.4934&d=1.000235&h=302&v=66&hour=15&mo=6`. The
  same at `t=1200`: the city has shrunk to its oldest ground, and the Colosseum stands among fields within the walls.
- **Uruk in 3000 BCE,** walled round its body: `?t=-2999&lat=31.32&lon=45.64&d=1.0004&h=40&v=70`.
- **Tenochtitlan in 1519,** a grid of canals over its island: `?t=1519.5&lat=19.4326&lon=-99.1332&d=1.00044&h=20&v=60`.
- **The cities that most want records:** `npm run world -- cities-wanted --n 40`.

## Pass criteria

| Criterion | Where it is checked |
|---|---|
| The frame's faces cover the ground once, are found the same in any order of lines, and a line ending on a face's edge from outside leaves its name | `core/frame.test.ts` |
| A city builds as much ground as its people needed, as they rise and fall, and leaves first what it built last | `core/growth.test.ts`: *builds as much ground…*, *leaves first the ground it built last* |
| It never builds in water, builds along its roads first, ranks the ground inside its walls first while they stand, and makes the ranking again when they fall | `core/growth.test.ts` |
| Each member of the people cuts the one ranking at its own place; a record's area at its time is met | `core/growth.test.ts`: *cuts the same ranking…*, *meets the area a record gives…* |
| A city's people are read from its record before its lists, rise from a founding size, and run on to the present where its record has no end | `core/citypop.test.ts`, `tools/world/test/citiesWanted.test.ts` |
| A face is divided into blocks near their size and plots that each have a front, none over another; a grid runs on across faces street for street; lanes follow the contours where the ground is steep; a footprint keeps its ground | `world/generators/people/settlement/division.test.ts` |
| A recorded wall takes the place of a generated one and bounds the town while it stands; a recorded road stands in its frame; a district counted four times the buildings has smaller plots | `town.test.ts` |
| Dividing only what is wanted divides it as dividing all of it would | `division.test.ts`: *divides only what is wanted…* |
| A town keeps its streets and plots where they are as it grows, gives up its outer plots first as it shrinks, builds nothing in its river, is the same town every time, and has a gate on each route through its wall | `world/generators/people/settlement/town.test.ts` |
| In a scene, a city's houses and streets of one time stand where they stood at another; it shrinks to its oldest ground; a great city has no most of houses; its wall stands only while its claim says | `v10.test.ts`: *a city laid out through its life* |
| Each city of a scene carries its whole life, the same at every time | `tools/world/test/landscape.test.ts`: *gives each city its whole life…* |
| A survey's ground is laid over the scene's, its water is the scene's there, the scene's own river is taken out of it, and houses keep off its water, its structures and its gardens | `world/generators/life/survey.test.ts` |
| A city's records are cut into cells, each structure's entity after the scene's own | `tools/world/test/city.test.ts`: *a city's records, cell by cell* |
| In the browser, Rome is drawn by the living scene, its records named among its houses; a click on a house says the generator placed it; what stands depends on the time | `viewer/test/e2e/city.spec.ts`, `life.spec.ts` |

## What was built

### The models

The growth model's ranking is the cost of reaching each place of a city's ground from its core along its routes or
across the ground, raised for steep ground, ground that floods and ground outside its walls while they stand, and lowered
near water people could draw. The area its people needed at a time is their number over a density that grows a little
with the city's size, set to meet the area a record gives where it gives one. The cut is the area's worth of cells from
the front of the ranking, so a place is built at a time when its rank is under the cut: between two figures of the
people the cut moves at a constant rate, and the years a place was built are found exactly. Its grid is sized by the
city's people up to 1900 and reaches no further than 20 km: Tenochtitlan's record runs on into Mexico City, whose
millions made a grid of two million cells.

### The generator

A city's plan is made once, in its own metres about its point, from the city and the world's ground (the world's relief
under the scene, not the scene's ground, which is built about the scene's own point and reads a place a little
differently from each). Its routes run by the cheapest way across the ground towards the places it dealt with, which are
the largest and nearest cities of the lists and the records within 90 km over its whole life, and evenly round the rest;
each ends where it meets one traced before. A wall is laid round the city's body as it stood when it first had three
fifths of the most people it had while the wall stood, its ribbons along the roads left outside. The faces of the frame
are divided only where something is built at the time asked; a lane is drawn along the stretches of it that run by
built ground; and a plot is a household's share of the ground where it lies at the city's height, so the core's plots
are small and the edge's large.

Where a map of the world is of the city, its walls that go round it and its roads go into the plan in the city's own
metres: a recorded wall takes the place of a generated one, its years making the growth model's epochs, so Rome grows
within the Servian and then the Aurelian walls while they stand; and its roads stand in the frame and are routes beside
the generated ones. An open square its town form names is kept at its middle, square to its grid.

The scene leaves out what its own ground cannot take: a plot in its river, on its cliff, on a structure's ground. A house
is as big as its plot allows and the density there asks. A city's built ground at the scene's time is trodden as a
street is, and nothing grows on it but in its gardens. A scene keeps up to 400,000 houses and 30,000 streets, so a
city of a million is drawn with a house to each plot it built, and the renderer culls what is far by distance and rank.

### A city's records in the living scene

A map dataset of a city (`import: { as: ohm-site, site: … }`) says which settlement it is of, the point its metres are
laid out about, the surveys of its ground (Rome's TINITALY at 10 m, SRTM and ETOPO), the level of its water and its span.
The build makes a file of the city's records within 6.8 km of its point, and its ground as before. A living scene within
23 km of such a city takes its survey, laid over its own ground and eased in over 3 km; its mapped water, as the scene's
there; the ground its structures take at the scene's time, where no house stands and nothing grows; and its gardens,
where no house stands. The structures are raised by the forms of world/generators/city/forms.ts in the city's own worker,
a cell of 400 m at a time, moved into the scene's metres, their entities after the scene's own, dated by their records:
picked, named and lit as in the city's own scene before.

## Decisions

1. **One system for every city.** Rome differs from a town of the lists only in how much is known of it. Its regions'
   counts, which `gen:rome/fabric` weighted its housing by, are a city's districts now, read for any city whose records
   count a district's buildings: each built cell at the city's height goes to its nearest district's label, and a
   district's plots are as much smaller as it was denser than the city on the whole.
2. **A city's plan reads the world's ground, not the scene's.** A scene builds its ground about its own point, and the
   same place is a little different from two scenes; a city's streets must not move as a visitor goes from one to the
   next. The scene's water and steepness decide only what is drawn.
3. **A plot's size is fixed for a city's whole life,** by the density where it lies at the city's height. A plot of the
   core is small in every century, and holds a larger house as the city fills.
4. **What stood is a time's.** The ground a structure takes, and so where no house stands, is read at the scene's time;
   a scene reused across a few years keeps what it was made for.
5. **No most of houses in a city.** The cap of 12,000 a city had, and the scene's 60,000, made a city of a million a
   scatter of houses each standing for a dozen households. The renderer's culling by distance and rank is the budget.

## Limitations

- **Rome's houses are generic.** No building tradition houses the townspeople of Roman Italy, so Rome is drawn in the
  generic town house, small and of one storey, round its monuments. A tradition of the insula and the domus is being
  researched.
- **Rome's medieval town is not in the bend of the Tiber.** The growth model reads no aqueducts, so nothing makes the
  river's banks the better ground once they failed; the town of 1200 stands round the record's point, east of the
  Colosseum. An epoch at the aqueducts' end, reading the distance to the survey's water, would move it.
- **A city's institutions are not read.** No town has a temple or a market of its own unless a record draws one; a town
  form's open square is kept at its middle. A district's count of its buildings (Rome's regions, by the Regionary
  Catalogues) sizes its plots, but it does not move where the city grew.
- **A recorded wall bounds a city's growth only where its line goes round it.** The Servian and Aurelian walls do,
  their ends within a twentieth of their length (the Aurelian's 484 m apart where it left the Tiber to close it); a wall
  mapped in pieces does not.
- **The fields round a city are still the old field system's,** not the division's parcels: the land is divided once
  for the town, and the fields beyond it are laid out as before.
- **The globe does not draw a city's built ground through time,** nor do villages keep their places across the
  anthromes' steps. These are the plan's steps 2 and 8.
- **Nothing has been checked by a person.**

## How it was checked

By the agent that built it (Claude Code), on one machine, in November 2026: `npm run typecheck`; `npm test`, every unit
test passing; `npm run validate`, no errors and no warnings; a world build; and views of Uruk, Tenochtitlan,
Pataliputra, Mohenjo-daro and Rome at 315 and 1200 on the GPU. What the browser groups found is said in the pull request.

## Next

The rest of [plans/CITIES.md](../plans/CITIES.md): institutions from traditions; the ground of occupation and a survey
within every city; built ground on the globe; the fields round a city as the division's parcels; villages with
lifetimes; an epoch at the end of Rome's aqueducts; and the skeletons of the cities `cities-wanted` ranks first.
