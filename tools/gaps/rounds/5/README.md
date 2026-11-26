# Visual gaps, round 5: a fresh draw

Round 1 drew twelve places and times and held the viewer's pictures of them to researched briefs
([docs/plans/VISUAL-GAPS.md](../../../../docs/plans/VISUAL-GAPS.md)). Rounds 2 to 4 shot that same panel again on newer builds. This round is the second sample: twelve new
points, on build `46e013ad3acac105` (master of 2026-11-22), with the seed `gaps-round-5`.

`npx tsx tools/gaps/rounds/5/page.ts` lays it out as `dist/gaps/5/index.html`.

## What was done

| Step | File | Notes |
|---|---|---|
| Sample | `sample.ts` → `points.json`, `views.yaml` | Round 1's sampler with its lessons: time from 1 Ga, people by number with half their draws to towns, fossils only before HYDE, today's place named, three spots a point. |
| Shoot | `shoot.ts` → `drawn.json`, `dist/gaps/5/drawn/` | 34 views (eleven points × three spots, and one from orbit) on the GPU, about 14 s each. |
| Briefs | `pNN.yaml`, texts in `.cache/source-texts/gaps-5/` | Twelve researchers, one a point, written blind to the viewer. 188 items, 45 of the place and 143 of the region, and 98 things unknown. Every quote checked against its kept text (`check.ts`). |
| Verdicts | `verdicts/pNN.yaml` | Four readers of three points each; every item judged at each spot, then by what most spots show. |
| Findings | `findings.yaml` | Across the round; two code defects confirmed by reading the code. |
| Pictures | `prompts.yaml`, `picture.ts` → `pictures.json`, `dist/gaps/5/expected/` | Written from the briefs, made by xAI's image model. Illustrations, never evidence; no verdict rests on them. |

## The count

188 items: 51 drawn, 25 drawn wrong, 29 missing though held, 22 missing and not held, 8 with no layer, 53 untested.

| | Testable | Drawn | Share |
|---|---|---|---|
| Round 1 (its panel, one spot, build 46369419) | 131 | 41 | 31.3% |
| Round 4 (round 1's panel again, three spots) | 130 | 43 | 33.1% |
| **Round 5 (fresh, three spots)** | **135** | **51** | **37.8%** |
| round 5, spot a alone | 135 | 53 | 39.3% |
| round 5, spot b alone | 121 | 43 | 35.5% |
| round 5, spot c alone | 121 | 41 | 33.9% |

A fresh draw scoring a little above the fixed panel says the panel is not flattering the viewer, but twelve points
are few: the difference is within what one easy card (p02 from orbit, 9 drawn) moves. As in round 4, spot a scores
above the random spots.

**By layer, round 1 against round 5** (share of testable items drawn):

| Layer | Round 1 | Round 5 | |
|---|---|---|---|
| substrate | 0% (0/17) | 50% (4/8) | the substrate layer, new since round 1, works |
| life | 5% (1/19) | 17% (4/24) | still the weakest |
| cover | 43% (13/30) | 27% (7/26) | forests drawn as savanna in this sample |
| people | 20% (2/10) | 33% (7/21) | farmsteads right; towns missing |
| water | 20% (2/10) | 32% (6/19) | |
| relief | 57% (8/14) | 50% (6/12) | |
| weather | 25% (2/8) | 78% (7/9) | a kinder sample of skies |

## What owes the gaps

84 gaps (wrong, missing, no layer), most first, beside round 1's 90:

| Owner | Gaps | Points | Round 1 |
|---|---|---|---|
| `gen:life/scene` | 20 | p03 p04 p05 p06 p07 p08 | 20 |
| `model:life/atlas` | 9 | p03 p05 p06 p07 p08 p10 | 8 |
| building traditions: fields and crops | 7 | p08 p09 p10 p12 | 2 |
| `field:earth/elevation` | 6 | p01 p02 p05 p08 p09 | 7 |
| `gen:people/settlement` | 6 | p08 p10 p12 | 4 |
| renderer | 4 | p04 p09 p11 | 0 |
| `model:earth/biome-from-climate` | 3 | p02 p12 | 1 |
| `model:earth/drainage` | 3 | p05 p08 p09 | 1 |
| records the world lacks (towns, temples, tanks, monuments) | 6 | p08 p10 p12 | 0 |
| everything else | 20 | | |

Substrate, round 1's second largest owner (16 gaps, no layer), owes one gap here.

## What the round found, ranked

1. **Scenes are cut flat above 3,200 m and below −3,200 m.** `encode` in
   [world/generators/life/scene/v9.ts](../../../../world/generators/life/scene/v9.ts) keeps heights as decimetres in
   16-bit integers clamped at ±32,000. The Altiplano point (ground 4,227 m, a basin 650 m below, a 5,140 m volcano)
   is one level plain at 3,200 m, and the deep Pacific floor is clamped to −3,200 m. Every scene on the Tibetan
   Plateau, the Altiplano, the high Andes and Ethiopia is drawn so. **A small fix with a large reach:** a coarser step
   or an offset, and a new version of the generator.
2. **At sea the camera is under the water, and the sea scene takes the land's list.** Eye level stood on the floor;
   from the air the camera sat 30–40 m under the surface. Fifteen of the two sea cards' 31 items could not be tested.
   The Eocene shelf carries brontotheres because `placeSpec` prefers the land atlas's list. A surface camera at sea,
   and the sea list for a sea scene.
3. **Towns between a city list's figures vanish.** Kanchipuram (50,000 in 1150, then nothing to 1800) is 864
   generic villages of thatched round huts in 1285; Khiva (one figure, 1800) is bare desert in 1890. The settlement
   generator holds a figure ±50 years and bridges gaps of at most 600. A town the list names before and after should
   stand between, and an oasis needs fields, canals and orchards, which nothing holds (7 gaps on 4 points).
4. **The atlas carries life too far, and into the wrong habitats.** Pampas glyptodonts in the Amazon, capybara at
   4,400 m, sea otters 290 km out at sea, dolphins on a hillside, a Miocene rhino in 594 BCE. It also drops taxa the
   briefs most expect (Anchitherium, the Sihong apes) from collections it otherwise keeps. Round 4 ranked this
   ("the animals a visitor meets") next; this round agrees, and adds the gate by habitat: height, land or sea, water.
5. **Forest drawn as savanna, plants mixed tree by tree.** The Pliocene Amazon falls 3.7 mm short of the forest line
   in its driest month and is drawn as open savanna; Anhui's Miocene and Euboea likewise. Listed plants are often
   not placed at all.
6. **No scene before the Phanerozoic.** At 611.8 Ma an eye-level view shows the globe's texture from 15 m: no
   horizon, no ground. A bare scene of rock and sky needs no list.
7. **The viewer's resolver never answers life.** `resolveWorld()` in
   [viewer/src/main.ts](../../../../viewer/src/main.ts) gives the resolver no `life` function, so every view of
   rounds 1 and 5 reports life as unknown. A one-line fix.

**Errors in the world the briefs caught:** PBDB collection 107496 (Puddledock, Virginia) placed 220 km west in the
Valley and Ridge as a marine claystone; Handan with no people between 399 BCE and 400 CE in the cities' list;
Mourasuchus and a gharial-group row carried into the Pliocene on rows dated only to wide spans.

## The re-take, on build 3b9f48ad (2026-11-23)

The same 34 views were shot again after master merged the fidelity pass (scene generator versions 11 and 12), the
relief below a scene's grid, scene behaviours, finer clouds and the satellite globe, and judged afresh by four readers
(`verdicts-retake/`, `findings-retake.yaml`; `npx tsx tools/gaps/rounds/5/page.ts --take retake` →
`dist/gaps/5/retake.html`, each verdict beside the first take's). The world was built in this worktree from clean
master; its id matched the shared build's.

| | Testable | Drawn | Share |
|---|---|---|---|
| First take, build 46e013ad | 135 | 51 | 37.8% |
| **Re-take, build 3b9f48ad** | **136** | **50** | **36.8%** |

**Two verdicts of 188 moved, both down**, and seven of the 3 × 188 spot verdicts. The Miocene ground, sand by the
account, is now drawn as stony soil and leaf litter; the Altiplano's snow, untestable before, is now drawn where the
brief has bare slopes.

- **The pictures changed far more than the verdicts.** Leafy crowns, leaf litter, patchy ground cover, scanned ground,
  sculpted relief, a satellite globe: every eye-level frame looks better, and draws the same wrong things. The briefs
  ask mostly *what* is there (a town, a forest, the sea, a river, the right animals), not how it looks.
- **The 3,200 m clamp (finding 1 above) is fixed upstream** by the new encoding in `v12.ts`. The Altiplano scene
  stands at its real height, and its snow line, 4,251 m, now reaches the ground on a dry April slope.
- **The relief below the grid helps, short of the brief.** Euboea's hillside rose from a flat 275 m to 277–416 m (the
  brief has 443 m); the Cishan loess became ridges and gullies, not flat-topped terraces.
- **Untouched:** no town at Kanchipuram or Khiva; the camera under the water at sea; the land's list on the shelf;
  savanna for forest; no scene before the Phanerozoic; the atlas's far-carried animals; the resolver's missing life.
- **New faults:** shadows with nothing casting them at Cishan; "Ground of sand" over leaf litter; conifers that read as
  dead spars; a cloud band over the orbit view's point.

So the ranking below stands, less its first item.

## What to take next

By reach and cost: the height encoding (1) is fixed (see the re-take), and the resolver's life (7) is one line, a
defect rather than a gap. Then the sea camera and list (2). Of the larger work, the atlas gated by
habitat and date (4) recurs from round 1 and round 4 and is the largest owner after the scene itself; towns between
list figures (3) is the most visible gap of the human era, since a visitor goes to towns.

## What the next round should change

- **Towns by the generator's own rule.** This sampler weighted a town by any figure within 600 years before the time,
  and so sent two points to towns the viewer does not draw: telling, but by accident.
- **A camera at the surface for sea points**, until the viewer has one.
- **Place hints by the nearest settlement and the ground's height.** Two hints were wrong (Euboea, the Altiplano),
  and the researchers found it.
- **Each researcher its own scratch folder.** They shared one, and fetch helpers overwrote each other; `check.ts`
  caught every misfiled text, but it cost time.

## Cost

Twelve briefs of about 155,000–216,000 tokens each, 6 to 17 minutes; four readers of about 200,000–240,000 tokens,
6 to 11 minutes; the shoot about 8 minutes. Eighteen pictures at $0.06 each, $1.08: twelve first takes, and two more takes each of p03, p05 and p08, whose first takes went against a central item. The third takes cured p08's town and ground and p05's forest in part; p03's conifers stayed spruces, as round 1's p05 animals stayed living kin (`picture-checks.yaml`).
