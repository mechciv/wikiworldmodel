# Writing a form

A form is what a taxon's body is like, as data on a node of the tree of life. This is the brief for an agent, or a
person, writing them. The plan they serve is [LIVING-WORLD.md](LIVING-WORLD.md); the rules in
[CONTRIBUTING.md](../CONTRIBUTING.md) all apply. A form is a claim like any other: never invent a source, and everything a machine
writes is `proposed`.

The aim is every taxon, over time. A taxon with no form of its own is drawn as the nearest node above it that has one,
and says so. So there is no need to do everything at once, and a coarse form on a family is worth a lot: it draws every
genus under it until someone writes theirs. Work from the top of the list down.

## The line

```sh
npm run world -- forms-wanted --missing Reptilia  # the largest groups under a name that nothing can draw
npm run world -- forms-wanted Theropoda --n 40    # the taxa that most often come up with no form of their own
npm run world -- forms-wanted --sea --missing     # the same for the sea's fossils, for bodies that live in the sea
npm run world -- form-sheet life/taxa/triceratops # draw it, and print where its body comes from (also plan:<name>)
npm run validate -- --no-frames                   # every form is compiled and checked
```

`form-sheet` writes a PNG under `dist/sheets/` with the body from the side, the front and above, in its poses and at each
detail, with a scale. **Look at it.** Compare it with what you read and with a skeletal reconstruction if you can find
one. A form that compiles can still be a bad drawing, and the sheet is the only way to know. Correct it until it reads
as the animal: its silhouette, proportions and distinguishing parts.

## Where a form goes

On a taxon's record, in `world/entities/life/taxa/` (one file per taxon, in a subfolder per group if you like). Adopt the
database's taxon by its number, from `forms-wanted` or the data service; **look the number up, never guess it**. A
record so placed joins the tree under the nearest record above it, by the database's classification.

```yaml
id: life/taxa/ceratopsidae
kind: taxon
summary: The horned dinosaurs with large frills, of the Late Cretaceous of western North America and Asia.
same_as: { pbdb: "txn:38811" }
author: machine:claude-code
claims:
  name:
    prop: name
    value: { la: Ceratopsidae }
    unsourced: The classification's own name.
  body-plan:
    prop: body_plan
    value: ceratopsian
    unsourced: "Which plan draws it and everything below it: an editorial classification, from its place in the tree."
  length:
    prop: body_length
    value: { lo: 4.5, hi: 9 }
    source: { ref: src:holtz-2012-dinosaur-genus-list, loc: "p. 52, Chasmosaurines", quote: "…" }
    method: compilation
    note: The range across the genera listed there, standing for any member with no length of its own.
```

Three things a taxon can say, each optional, each inherited by everything below it that does not say otherwise:

| Property | What it holds |
|---|---|
| `body_plan` | a file in [world/plans](../world/plans): the whole body it and all below it start from |
| `body_form` | what differs from the body it inherits, by part |
| `body_length`, `hip_height`, `body_mass`, `plant_height`, `posture` | sizes in metres or kg, and how it stands. **A range on a clade is a claim about its members:** any member with no size of its own takes a size within it |

A size needs a source you actually read. If you could not read one, leave the size off and say so in your report: the
taxon then takes the node above's. A taxon with no size at any node above it is not drawn at all. That is why a clade's
range matters as much as its form.

A form itself is usually `unsourced`, saying why: *"A machine's reconstruction, from the skeletal drawings in X."* Where a
source states a proportion or a part, cite it with its quote and locator, and write the rest as your reconstruction in a
`note`. Colour is never claimed: the shader invents it, and says so.

## A change

Name the parts you change. Only the fields you give change; `null` takes a part away; a new name adds a part.

```yaml
  form:
    prop: body_form
    value:
      parts:
        brow: { to: [0.05, 0.27, 0.2], r: 0.022 }
        frill: { r: 0.14 }
        nose: null
    unsourced: "A machine's reconstruction: longer brow horns and a shorter frill, from the skull figures in X."
```

A list given whole replaces the list above it. To change some of its rows and keep the rest, name them by their
numbers, counted from 0: one ring of a body, one joint of a leg.

```yaml
        body:
          rings:
            7: [0.03, 1.48, 0.52, 0.124]   # the eighth ring, written again
            9.5: [0.16, 1.5, 0.62, 0.1]    # a new ring between the tenth and the eleventh
            0: null                        # the first ring, taken away
```

A whole number is the row of that number, and one past the last adds a row at the end; a number between two rows adds
one there; `null` takes a row away. The numbers are the rows' as the list stands above the change, before anything is
added or taken away. A row may itself be changed by number (`7: { 1: 1.48 }`, the eighth ring's top). The validator
refuses rows named where no list above was there to change.

## A new body plan

If nothing above a group is near it (a sauropod is not a theropod), write a new file in `world/plans/<name>.yaml` and put
`body_plan: <name>` on the group's record. The file's `description` is what the plan is. Start from the plan most like
it. Keep forms small: a plan is a few dozen lines, and a change a few.

## The parts

Everything is in proportions of the body, with its front towards +y, its right towards +x and the ground at z = 0. In the
body's frame, x, y and every radius are shares of the **length** L, and z is a share of the **hip height** H (say `zl:
true` to have z in L too). In a head's frame (`on: head`), everything is a share of L, as `[across, along, up]`.

Every part may have: `mat` (hide, horn, shell, fur, feather, membrane, chitin, dark; for plants bark, needle, frond,
broad; and a plant's part its `leaf`, below), `tint` (0–255, fixed) or `tint_add` (added to the taxon's colour), `on: head`, `mirror: true` (both sides), `near:
true` (only when close, for small things), `far: true` (only from a way off, standing for what `near` parts add), `poses: [...]` or `not: [...]` (only in those poses, or not), `stance: upright`
or `four`, `sides: [fine, coarse]`.

**Frames.** A `tube`, `chain`, `lump`, `spike`, `eyes`, `row` or `sheet` is written in one of four frames, in each of
which a point is `[across, along, up]`:

| It says | Its frame | Use it for |
|---|---|---|
| nothing | the body's | what is fixed to the trunk |
| `on: head` | the head's, which pitches with the pose | horns, a beak, a frill, eyes |
| `on: <part>` | the end of that part: the last point of a `chain`, the last ring of a `tube`, a `head` or a `trunk`, the tip of a `spike`. Along is the way the part runs there, across is level and square to it, and up is square to both | eyes on a head that is the end of a neck's chain; a claw on a foot; a tuft on a tail. It goes where the end goes when a child changes the part, on each side if the part is mirrored |
| `ride: <trunk>` | that trunk's skin. Across is the way round the body's section: 0 on the middle of the back, 1 on the flank where it is widest, 2 under the belly, and the same below zero on the other side. Along is the place along the body, as its rings have it. Up is how far it stands off the skin, the way the skin faces | plates and scutes that follow a back's curve and a body's width; a line along a jaw. It stays on the skin when a child changes the rings |

In the last two every length is a share of L. A part that hangs or rides is drawn only where what it hangs on is
drawn, and moves with it. Past a trunk's ends, what rides it stays on its last ring. A `lump`, and the lumps of a
`row`, lie level in every frame; `turn: true` turns one with its frame, so that a crest pitches with the head it is
on and a scute lies flat on a flank.

**Animals**

| Type | Fields |
|---|---|
| `trunk` | `rings`: tail tip to shoulder, each `[y, top, bottom, half-width]`. `neck: { r, steps: [fine, coarse] }` joins it to the head. `widest`, `under`, `over` shape its sections |
| `head` | Name it `head`: it sets the head's frame. `rings`: `[along, up, half-width, half-height]` from the back of the skull. `at`: where the neck joint goes in each pose: `stand`, and optionally `alert`, `low` (grazing, drinking), `upright` (a biped's) and `fly`, each `{ y, z, pitch }` with pitch in radians, downward; `low` may give `reach` (the head's length) instead of `z`, so that its tip meets the ground. `widest`, `under`, `over` |
| `tube` | `rings` of `[along, up, half-width, half-height]` (or `[x, y, z, w, h]`): a jaw, a beak, a crest. `widest`, `under`, `over` |
| `chain` | `points` of `[x, y, z, r]`: an arm, a neck, a splayed leg. With `swing` and `phase` it walks, from its first joint out to its last |
| `lump` | `at`, `r: [rx, ry, rz]`, `turn`: a body, a dome, a club |
| `spike` | `from`, `to`, `r`: a horn, a claw, a thumb, a tail spike |
| `pillar` | `y`, `x`, `top`, `r`, `swing`, `phase` (0 or 1), `muscle`, `across`, `column`: a pair of straight legs |
| `digitigrade` | `y`, `x`, `top`, `knee`, `ankle`, `r`, `swing`, `phase`, `toes`, `muscle`, `across`: a pair of bent legs |
| `fan` | `on: head`, `at: [along, up]`, `dir: [along, up]`, `r`, `across`, `tall`, `raise`, `scallop`, `scallops`, `arc`, `gap`, `rim`: a frill or a crest |
| `eyes` | `at: [across, along, up]`, `r` |
| `bands` | `rows`, `y`, `step`, `wide`, `top`, `low`, `out`, `spike`, `scute`: armour bands |
| `row` | `n`, `from`, `to`, `item` (lump, spike or plate), `r: [x, y, z]`, `size` (a list, along the row), `thick`, `bands`, `lean`, `turn`: plates, osteoderms, a stegosaur's back |
| `knobs` | `on: head`, `n`, `at`, `r`, `length`, `thick`: a ring of small knobs |
| `shell` | `r: [rx, ry, rz]`, `lift` |
| `sheet` | `points` of `[x, y, z]`, a fan from the first; `gap`: a sail, a fin, a membrane |
| `wing` | `shoulder: [x, y, z]`, `span`, `chord`, `sweep`, `beat`, `arm`, `folded`, `drop`, `mat`: spread when flying, folded along the flank otherwise. Give flyers `not: [fly]` on their legs if they should tuck them |

A leg has the muscle of its haunch or shoulder where it leaves the body, drawn close by: `muscle` says how much of it,
1 where nothing does, 0 for none, as under a belly it would hang out of.

**A section that is not an ellipse.** A `trunk`, a `head` or a `tube` is a skin through rings, each an ellipse unless
the part says otherwise:

- `widest`: where between its bottom (−1) and its top (1) a section is widest. 0, the middle, is the ellipse. A
  barrel that hangs low, or a body under a skirt of long hair, is widest below its middle (−0.3); a dome over a flat
  belly is widest near its bottom (−0.8); a narrow ridge of a hump over a deep chest is too.
- `under` and `over`: how square its underside and its top are, from 0, round, to 1, flat with rounded corners: a
  flat belly, a level back, a slab-sided flank. A section's top, bottom and width stay where its ring puts them.

Each is one number, the same all along the part, or a list of `[along, value]` it passes through, `along` being the
place along the part as its rings give it (a trunk's `y`, a head's or a tube's `along`): before the first it holds
the first value, and after the last the last. So `under: [[-0.4, 0], [-0.3, 0.6], [0.1, 0.6], [0.2, 0]]` flattens a
belly and leaves the tail and the shoulders round. Along a neck a section rounds off, to an ellipse at the head.

**A leg's width.** A leg is as wide across as its `r` and deeper fore and aft, most at its top. `across` is how wide
it is across as a share of that: one number for the whole leg, or `[top, foot]`. A thigh is narrower across than fore
and aft (`across: [0.6, 1]`), and a leg so narrowed at its top stays inside the body's flank, where the body tapers
past it. A `pillar` thins to a slender cannon above its foot, as a hoofed leg does; `column` says how much of a column
it is instead, from 0 to 1, as thick all the way down as at its top: an elephant's leg, a sauropod's.

**A frill's edge.** A `fan` is two sheets a hair apart, which from its side is a line. `rim` is the radius of a roll
along its edge, as a share of L, so that it has a thickness there; it follows the scallops.

**Plates and scutes.** A `row` runs straight from `from` to `to` in its frame. With `ride: <trunk>` it runs along
the body's skin instead: `from` and `to` are then `[round, along, off]`, and each item sits on the skin at its place
and stands off it the way the skin faces, so that two rows either side of a back lean apart as the back's curve has
them. `lean` leans a plate further out from the body's middle line, by that share of its height, in any frame;
`turn: true` lays a row's lumps flat on the skin.

**Plants.** Everything is a share of the plant's height. A plant's part grows a skeleton by its type's own rule, and
holds its leaves on cards that show a spray of one kind of leaf (`leaf`), or from further off a bough of them: say
which, where the default for its type and material is not it.

| `leaf` | What it is | The default for |
|---|---|---|
| `needle-flat` | needles in two flat ranks along feathery shoots: a redwood, a swamp cypress, a yew, a fir | a `conifer` |
| `needle-tuft` | long needles in bundles, brushes at the ends of twigs: a pine | a `broadleaf` whose `mat` is needle |
| `needle-scale` | shoots clothed in scale leaves, in flattened sprays: a cypress, a cheirolepid | a `conifer` or a `shrub` of scales |
| `needle-awl` | short stiff leaves all round a shoot: a spruce, a monkey puzzle, a walchian, a scale tree | a `scale-tree`, a calamite's branches |
| `frond-fern`, `frond-seed` | a fern's frond; a great frond twice divided: a seed fern, a tree fern | a `fern` |
| `frond-cycad` | a stiff frond of narrow leaflets: a cycad, a bennettite | |
| `frond-fan`, `frond-feather` | a pleated fan on a stalk; a long frond of drooping leaflets | a `palm` (the fan) |
| `broad-oval` | plain oval leaves, alternate along a twig | a `broadleaf` |
| `broad-lobed`, `broad-compound` | leaves cut into lobes, as a plane's; leaves of many leaflets, as an acacia's | |
| `broad-fan` | fan-shaped leaves on short spurs: a ginkgo | |
| `broad-tongue` | tongue-shaped leaves in tufts: a glossopterid | a `conifer` whose `mat` is broad |
| `broad-strap` | long strap leaves at the ends of twigs: a cordaite | a `broadleaf` whose `mat` is frond |
| `broad-small` | small leaves on wiry twigs: a shrub of dry ground | a `shrub` |
| `blade-grass`, `blade-reed`, `blade-rush` | a tuft of narrow blades; tall strap leaves; thin bare stems | a `tuft` (grass; rush where its `mat` is needle) |
| `whorl` | a jointed stem with a ring of thin branches at each joint: a horsetail | a `whorled` |
| `herb`, `moss` | a low leafy plant; a cushion of tiny leaves | a `tuft` of broad leaves; a `shrub` of fronds |

The kinds are a vocabulary (`core/leaves.ts`), and how each looks is the renderer's: `npx tsx tools/look/leaves.ts
out.png` draws them all. A new kind is a few lines there and a painter in `viewer/src/gl/leafatlas.ts`.

| Type | Fields |
|---|---|
| `conifer` | `reach`, `trunk`, `flare`, `tiers`, `start`, `drop`: tiers of foliage round a straight trunk |
| `broadleaf` | `crown`, `fork: [at, variation]`, `trunk`, `limbs` |
| `palm` | `trunk`, `lean`, `head`, `size`, `fronds`: fans at the top of a stem |
| `fern` | `reach`, `fronds`, `across`, `arch`, `steps`, and `on_stem`, `stem` to raise it: a fern, a tree fern, a cycad, a bennettite |
| `whorled` | `trunk`, `reach`, `nodes`, `around`, `start`: a horsetail, a Calamites |
| `scale-tree` | `trunk`, `fork_at`, `spread`, `forks`: a pole that forks at the top: a Lepidodendron |
| `tuft` | `blades`, `spread`, `wide`: a grass, a sedge, a rush, a low early land plant |
| `shrub` | `wide`, `lumps`: a thicket, a cushion |
| `mat` | `radius`: floating leaves, in metres |

And for any form, `behave` says how the generator lays it out, which is no claim about the animal:

- `group: [least, most]`, `habitat` (open, any, edge, forest, air, canopy, wet, water, floor), `poses: [...]` (stand, walk, graze, drink, alert, rest, fly), `flies: [low, high]` in metres.
  In a scene of the sea, `water` swims above the floor and `floor` rests on it, as do `any` and `edge` under water; only
  a body whose plan says one of these, or `air`, is drawn in the sea.
- For a plant: `layer` (canopy, under, float), `weight`, `wet`. `wet` is its liking for wet ground, by water's level or
  within a few tens of metres of a bank, flowing, still or dry: its weight is multiplied by 1 + `wet` × (how wet − ½),
  and never by less than nothing, so a willow at 1.6 is nine times as likely by water as away from it, and a reed at 3
  grows only by water. An understory plant whose `wet` is 2 or more stands in the shallows too.

`hip` says how high the hips are as a share of the length, where no claim does; `mass_length` what the body weighs in kg per
cubic metre of its length, for what a mass claim gives or needs.

Anything on a tail swings with it. A tube's section can flip where the tube runs along x, so a tall shell should lean a little
along y. A neck takes its curve from its two ends: to arch it more, draw it as a `tube` with rings of your own.

## Checks

The validator refuses a form with a part or field it does not know, a body more than 5% of its length below the ground, or a
fine mesh over 30,000 vertices (most should be under 2,000: they are drawn by the thousand). A form that passes may still be
a bad drawing: that is what the sheet is for.

Report what you wrote, what you read for each, and anything you could not settle.

## Running a batch

To go on with this at scale, give each agent one branch of the tree, so that two never write the same record, and this page as its
brief. A batch that worked, for the first forms:

- **One branch each**, named by its root: non-avian dinosaurs, reptiles and birds, early tetrapods and fish, mammals, land plants, the
  invertebrates of land and fresh water. Lower down the branches can be a family or a formation.
- **Top down.** A plan and a sourced size range on each major group first, as they draw everything under them, and then own forms for
  what `forms-wanted <root>` says most comes up. Quality over count.
- **New files only** under `world/entities/life/taxa/`, `world/plans/` and `world/sources/`; claims added to any record that already
  exists; nothing overwritten. Agents can share a checkout if they write only these, and an error in another agent's file is not theirs to fix.
- **A report**, whose doubts go in [RECORD-SETS.md](RECORD-SETS.md): which sizes it could not source, which rest on an encyclopedia,
  and what the form language lacked.

`npm run build:world` then lists how far the forms reach in `coverage.json`, with what most wants one next.
