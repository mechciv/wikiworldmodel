# Rendering: a better picture of every scene

Status: steps 0 to 8 built, November 2026, and then a pass over all of them for fidelity, under
[The fidelity pass](#the-fidelity-pass); step 9 waits until it is needed. What each step built, and where it differs
from what was planned, is under [What was built](#what-was-built). What a picture is held to is under
[The standard](#the-standard). It plans how the local scene renderer
([city.ts](../../viewer/src/gl/city.ts) and [cityShaders.ts](../../viewer/src/gl/cityShaders.ts)) and the meshes
the generators make of forms ([forms.ts](../../world/generators/life/forms.ts)) get from a clean diorama to the
picture of a good game, everywhere at once. [LIVING-WORLD.md](../LIVING-WORLD.md) and [SCENES.md](../SCENES.md) say
what a scene holds; this says how it is drawn.

## The aim

Every scene, at every place and time, drawn as close to modern video game quality as a visitor's GPU
allows—filling in unknown details with our best informed guesses so places look inhabited,
grounded and alive rather than sparse or schematic. Broad improvements come from shared rendering
technology, PBR material libraries, modular architectural kits, rigged creature and human templates
and procedural generators that lift every scene at once, complemented where warranted by bespoke
per-place or per-time assets (such as hero landmarks, famous buildings or curated site models).

What stays out of scope for the live renderer:

- **Frame-by-frame neural repainting.** Running a diffusion model over rendered frames is not an aim
  of the live viewer: it breaks 3D temporal consistency, picking and provenance. (Using sculpted,
  scanned or model-generated 3D meshes, rigs and textures as assets inside the 3D scene is welcome
  where licensing and quality fit.)
- **Real-time path tracing on WebGL 2.** Full real-time path tracing is beyond WebGL 2 budgets; the
  still mode (step 8) and modern real-time techniques (GI, IBL, SSR, contact shadows, WebGPU) bridge
  the gap.

## Where it stands

The renderer is a forward renderer in floating point, and it already has much of a game's lighting:

- a physically based sky, from a table remade for each sun, with haze along every view;
- one sun, with three cascades of shadows of 2048² each, and the shadows of passing clouds;
- a highlight by the GGX model, and the sky reflected in smooth surfaces;
- occlusion from the depth buffer at half size, four samples a pixel, bloom and a filmic curve;
- the ground as nested rings of a height field, coloured by a mask of canopy, low plants, bare ground and water,
  and by the tones of the place's climate;
- everything alive drawn by instancing, one mesh for each form, pose and level of detail, within a budget of
  220,000 instances and 9 million triangles (`FULL_BUDGET` in [stream.ts](../../world/generators/life/stream.ts));
- a fast way, for slow machines and the browser tests in software: one sample a pixel, and no shadows,
  occlusion or bloom.

Seen in the Hell Creek at its arrival, at 1600×900 on a laptop's GPU (November 2026), what holds the picture back is
not the light but what it falls on:

1. **Plants are solids.** A conifer is a stack of cones, and a broadleaf's crown is lumps of mottled noise. From
   the air they read as a forest. Within a few metres a crown is a faceted block with blotches on it, and no light
   comes through a leaf.
2. **The open ground is one surface.** The floodplain is a field of colour and noise. There is nothing on it
   smaller than a single tuft: no low plants, litter, mud or sand. The bank meets the water with no change at all.
3. **Water reflects only the sky.** The river is a pale, flat sheet. Neither the bank nor the trees on it show in
   it, and nothing of its bed shows in the shallows.
4. **Indirect light is the same everywhere.** It is a colour from the sky above and one bounced from below,
   darkened only by the screen's occlusion and each vertex's view of the sky. The floor of a forest is lit like a
   meadow.
5. **Nothing moves.** `uTime` is the world's time, in years; the scene has no clock. Animals stand in one pose, and
   no plant moves in the wind.
6. **Bodies are smooth tubes with a mottled hide.** Their outlines read well; their skins do not, close up.

## Rules the work keeps

- **Guided by records, filled in by best guesses.** When records specify something (a taxon's size
  or body plan, a building's wall material, a biome or era), the renderer and generators honour it.
  Where records are silent, code, shaders and assets are encouraged to fill in plausible visual,
  architectural, material, behavioural and environmental details using domain knowledge and best
  guesses—marking generated elements clearly in inspection and evidence mode rather than leaving
  scenes bare.
- **The same build, time and camera give the same picture**, within the tolerance the golden images allow.
  Anything that moves takes a clock that a link and a test can fix.
- **Picking and evidence mode work for everything drawn.** A leaf a click passes through to the ground behind it,
  or that evidence mode does not tint, is a bug.
- **The fast way stays.** It draws no more than it does now, so the browser tests in software and slow machines
  keep working. New work is for the full way, and may add higher tiers (such as desktop GPU or stills).
- **Budgets, not hopes.** Each step says what it costs in frame time on the reference views, and the instance and
  triangle budgets stay tests.
- **A generator's new mesh is a new version.** The scene's fingerprint includes its meshes (`meshParts` in
  [kit.ts](../../world/generators/city/kit.ts)), so a step that changes what forms.ts makes bumps the
  generator's version with its witnesses recorded again. A step that changes only shaders or visual assets
  changes golden images, not versions.
- **Best-fit assets and materials.** Use whichever combination of scanned PBR textures, sculpted or
  model-generated 3D meshes and rigs (glTF), modular architectural kits and procedural shaders gives
  the best visual quality within download, VRAM and frame-time budgets. Any third-party asset or
  scan (for ground, architecture, wood, cloth, bark, foliage, creatures or landmarks) must use a
  compatible open licence (CC0, CC BY or public domain), be listed in [ATTRIBUTION.md](../../ATTRIBUTION.md),
  and prefer GPU-compressed formats (such as KTX2) when scaling up.

## The steps

Each step is a pull request of its own, usable by itself and judged on the reference views. They are in order of
how much of a frame each improves.

### 0. Reference views and a frame-time budget

Before anything changes: a fixed set of views to judge each change on, and a measure of what each costs.

- **The look book.** A dozen links, each a place, a time and a camera: the Hell Creek at its arrival, at a tree's
  foot, at the river's bank and from 300 m up; a desert; a mountain above the treeline in winter; a sea floor; a
  swamp of the Carboniferous; an open plain; Rome's forum and one of its streets. A script in `tools/` shoots them
  in headless Chromium with the GPU on, and lays the before and the after side by side. Every pull request below shows its sheet.
- **Frame time.** GPU timer queries (`EXT_disjoint_timer_query_webgl2`) for each pass, logged on each reference
  view. The target is 16 ms a frame at 1600×900 on a reference laptop's GPU, which the test names. It runs on a
  machine with a GPU, by hand or nightly, not in CI's software rendering.

Pass: the sheet and the timings exist and can be made again; the goldens are unchanged.

### 1. Plants: branches and leaves

The largest part of most frames.

- **Skeletons and cards.** Each plant part type (`conifer`, `broadleaf`, `palm`, `fern`, `whorled`, `scale-tree`,
  `tuft`, `shrub`, `mat`) grows a skeleton of branches by its own rule, then clothes it in leaf cards: quads cut by a
  leaf's outline, drawn with alpha to coverage, so that the four samples a pixel smooth their edges. A leaf's
  outline follows its material in the form: needle, frond or broad.
- **Light through leaves.** A leaf passes a share of the sun from behind, tinted by the leaf. Its normal bends out
  from the crown's centre, so a crown is lit as a mass, not as a thousand cards.
- **Impostors far off.** A crown seen from afar is the same tree, baked in the worker from a few directions into a
  small atlas and drawn as one card that turns to the eye. The chain becomes fine mesh, cards, impostor, then the
  canopy on the ground, as LIVING-WORLD.md's chain of details asks.
- **Every pass.** The shadow and id passes cut the cards by the same alpha.

Pass: a crown at 3 m shows leaves and the gaps between them, and at 300 m reads as the same forest; the forest
views stay within the frame budget; a click on a leaf finds its plant; `gen:life/scene` version 6 passes its checks.

### 2. The ground: cover, materials and banks

- **Low plants as plants.** Near the eye, the mask's share of low plants becomes clumps of whatever low plants the
  atlas has there (ferns and horsetails; grass only where the atlas has grass), placed on the ground by a hash of the
  place. They thin with distance into the terrain's own colour for them, and take a budget of their own.
- **Layers of material.** Soil, mud, sand, gravel, litter and rock, each with its colour, roughness and a detail
  normal. The mask, the slope and the wetness blend them, by height, so that sand fills hollows and rock stands out
  of them.
- **Banks.** A band along every water's edge, wet and darker, as wide as the water's rise and fall allows; mud and
  sand where the channel's laws put its bars.
- **Litter under trees.** Under the canopy, needles or leaves on the ground, by what grows there.

Pass: the floodplain at the arrival reads as ground with things on it; low plants never appear where the atlas has
none; the budgets hold.

### 3. Water

- **The bank in the water.** Reflections of what stands on the bank, traced through the depth buffer in screen
  space, with the sky where the trace finds nothing. A lake or the sea's surface, at one level, can use a planar
  reflection instead.
- **Depth and the bed.** The shallows show their bed, and take their colour from their depth, read from the depth
  buffer under the water. The rivers already give the shader each point's velocity and depth.
- **Movement.** Ripples along the flow, faster in the channel than at its edges; still water stays still.
- **The edge.** A soft line where the water meets the ground, and the bank's wetness, not a cut.

Pass: from the arrival, the far bank's trees show in the river and the shallows show their bed; the sheet's views of
the sea and a lake lose nothing.

### 4. Light

- **The sky as light.** Indirect light read from the sky table by a surface's direction, in place of two colours,
  so the colour of dawn and dusk reaches the shade.
- **Shade under the canopy.** The canopy's share, from the mask and from the crowns' own shadows, darkens the sky's
  light on the ground: a forest floor is dim, and a glade is bright.
- **Better occlusion.** Ground-truth ambient occlusion (GTAO) in place of the present pass, at about its cost, with
  more reach in the near view.
- **Light in the air.** Shafts through the canopy and haze over the water, marched through the shadow map along the
  view, at a low resolution.
- **A better curve.** A tone curve that keeps colour in a bright sky, such as AgX, and an exposure that adapts to
  what the view sees, as a camera's does.
- **Temporal antialiasing.** Frames jittered and accumulated, for leaves and grass that four samples cannot settle.
  It accumulates only while the camera is still enough, and a test takes its frame once the view has settled.

Pass: on the sheet, a forest floor is clearly darker than a meadow under the same sun; nothing shimmers in the
forest views while the camera moves slowly.

### 5. Movement

- **A clock in the scene.** Seconds of the visit, apart from the world's time. A link can fix it (`clock=`), and
  the tests do.
- **Wind.** Plants sway in the vertex shader, trunks slowly and leaves quickly, by each part type's height and
  stiffness, with gusts that cross the ground.
- **Idle movement.** A body's parts become bones: each vertex keeps the part it belongs to and that part's joint,
  and the vertex shader turns it. The poses already written (stand, walk, graze, drink, alert, rest, fly) become
  the ends of loops: a head lowered to graze and raised again, a tail's swing, breathing, at a pace set by the
  body's size. Animals moving from place to place come later (they came with `gen:life/scene` version 11: see what
  was built, below).

Pass: with the clock fixed, two loads of a link give the same picture; with it running, the forest moves and the
animals do not stand frozen; the frame time holds.

### 6. Bodies, close up

- **Smooth near meshes.** At the finest detail, more rings and sides through the same form, with normals smoothed
  across the joints between parts.
- **Skin by material.** `hide`, `fur`, `feather`, `shell`, `chitin` and `membrane` each get a surface, as normal
  detail in the shader: scales or scutes in a pattern laid in the body's own coordinates, hair or feathers that lie
  along the body. Which a body has is its form's; how it looks is the renderer's.
- **Shading and pattern.** Darker above and lighter below, with stripes or spots by hash: the generator's look,
  marked as generated, as colour already is.

Pass: `form-sheet`'s views of a ceratopsian, a theropod, a mammal and a bird show their skins; the forms' own tests
still hold.

### 7. Clouds with depth

The local sky's clouds are a flat layer. They become clouds marched through a volume and lit by the sun, with the
shadows on the ground taken from the same field, so that the clouds in the sky are the ones whose shadows pass.
They follow the globe's clouds (`gen:earth/clouds`), so the way down from orbit keeps the same weather.

Pass: the arrival's sky has clouds with lit and shaded sides, and their shadows fall under them.

### 8. The still: more when the camera rests

When the camera stops, the renderer keeps working on the same frame. It accumulates jittered frames for
antialiasing, softens the sun's shadows by moving it over its disc, raises the budgets so that the far forest is
drawn as the near one is, and renders at twice the size and halves it. After a few seconds the view is the best
this machine can draw, and `Save picture` keeps it with its link. This is the project's "enhance": the same scene
from the same records, drawn for longer.

Pass: a still of each reference view can be made again from its link, within the goldens' tolerance; moving the
camera returns to the live frame at once.

### 9. WebGPU, when it is needed

WebGL 2 can hold every step above. Compute shaders, for culling, for the ground's clumps by the million and for
baking impostors, come with WebGPU, once steps 1 and 2 can meet their budgets only by thinning what they draw. The
fast way stays on WebGL 2.

## What it costs

- **Shared baseline, optional bespoke detail.** Core rendering upgrades, PBR material packs, modular
  kits and base rigs are shared across all scenes so baseline visual quality improves everywhere
  without growing with Earth's area or time. Bespoke per-place or per-time assets (such as hero
  landmarks or curated city models) are streamed on demand only when visiting those places and times.
- **Frame time,** spent against the budget on the reference views, with each step saying what it took. The full
  way aims at 60 frames a second on a laptop's GPU; the still has no such limit.
- **The goldens.** Most steps change them. Each pull request regenerates them, shows every diff on its sheet, and
  says why each changed, as CONTRIBUTING.md asks.

## The city

The same renderer draws Rome. Steps 2, 4, 7 and 8 improve it as they improve the wild: materials, light, clouds
and the still. Its buildings' surfaces (brick, marble, plaster, tile) are shaders already, and would gain most from
the same layered materials and detail normals. Its trees are drawn by their own function (`tree` in
[city/forms.ts](../../world/generators/city/forms.ts), called from [cells.ts](../../world/generators/city/cells.ts)),
not from forms; drawing them as step 1's plants would change the city's meshes, and whichever generator's version
covers them. Both are later steps, judged on the sheet's city views.

## What was built

Steps 0 to 8 were built together, on one branch, and judged on the look book's sheet. Where a step differs from its plan
above, it says so here.

- **0. The look book and the budget.** The views are [tools/look/views.yaml](../../tools/look/views.yaml), twelve
  links: the Hell Creek at its arrival, at a tree's foot, on the bank, from 300 m and at dusk; a desert; Mount
  Rainier above the treeline in January; a Thanetian shelf sea's floor; a Moscovian coal swamp; the Great Plains; and
  Rome's forum and one of its streets. Each fixes the visit's clock (`clock=0`). `npx tsx tools/look/look.ts shoot <dir>`
  shoots them and writes each frame's time by pass; `look.ts sheet <before> <after> --out <dir>` lays two shoots side by
  side. The renderer times its passes ([timer.ts](../../viewer/src/gl/timer.ts)) by GPU timer queries where the browser
  has them, or where it has none by waiting for each pass, reading a pixel back, and the viewer's `profile()` hook measures
  a view;
  [frametime.spec.ts](../../viewer/test/e2e/frametime.spec.ts), the browser tests' `frame-time` group, holds each view to
  16 ms at 1600 × 900 on the reference GPU, and skips anywhere else. The reference GPU is a choice still to be made.
- **1. Plants.** Every plant part type grows branches and holds its leaves on cards, cut by the shader to needles, a
  frond's leaflets or broad leaves as its material says, blended at their edges by coverage; once they are finer than a
  pixel, each grows by part of one, so that a spray far off closes into a mass within its own outline, as a real one,
  leaves over leaves, does, rather than letting the sky through. A dark mass of leaves inside a crown stands for the
  leaves behind. From a way off (detail 1) a plant is its trunk, that mass and fewer,
  larger cards, so that it keeps its ragged edge and its colour; the lighter way keeps its plain shapes. Leaves are lit
  as their crown's mass, with light through them. The shadow, depth and pick passes cut them as the lit pass does; the
  depth before the lit pass leaves them out, and they write their own. `gen:life/scene` is version 6. A tuft's own blades
  are thin leaves, and since version 9 are lit so too: in a material of their own that carries their form's colour, by
  the tuft's normal on either side of a blade, with the sun through them and none of the sky mirrored, and never holed as
  a mass of leaves is. Drawn as a mass of broad leaves or needles, the back of a blade had been lit as if it faced the
  ground, and the holes cut in it showed the sky, which the depth drawn before kept the ground from covering. *Not
  built:* impostors. A crown far off is still detail 1's cards or detail 0's shape; baking a tree into an atlas of views,
  as planned, is left until a view on the sheet needs it.
- **2. The ground.** The understory the atlas has there covers the ground close by, as clumps on a grid of a metre, out
  to 70 m, thinning into the ground's own colour, with a budget of 40,000 of its own (`plants.clumps`); a tuft is a pair
  of cards of blades, a fern a few fronds, anything else a few sprays of its leaves. Soil, litter, mud, sand, gravel and
  rock blend by height close by, with a grain from their heights. Banks: the water near the eye is drawn from above into a
  map of its level, blurred to its banks, so that ground within the water's rise of it is wet, with mud and sand on the
  gentler slopes. Litter under trees is needles or leaves as the scene's canopy has them. Sand is mottled, and close by
  rippled across the renderer's wind.
- **3. Water.** What is drawn so far is resolved before the water, which sees its bed through itself, coloured by how
  much water lies along the view, and reflects its banks by marching across the screen against the depth, the sky where
  that finds nothing. Its ripples are carried by the current. *Not built:* a planar reflection for a lake or the sea.
- **4. Light.** The sky's light on a surface follows its direction, from nine spherical harmonics of the sky table. Under
  the canopy the sky's light is dimmed on the ground and on what stands low. Ground-truth ambient occlusion replaces the
  old pass. Light in the air is marched through the shadow map at a quarter of the frame's size, out to four distances
  along each pixel's way, and each pixel of the frame takes it as far as its own depth, so that a twig against the sky
  takes the air before it and not the sky's. AgX is the tone curve. A frame is exposed for the light on open level
  ground, the sun's and the sky's, as an eye adapts by day, and below the light of a sun 18° up no further, so that dusk
  reads darker than noon and a low sun's sky keeps its colours; then, at full quality, a frame darker than a key, a forest
  floor, is lifted part of the way towards it, and a bright one is left as it is, so that snow and sand stay bright
  (`EXPOSURE` in [city.ts](../../viewer/src/gl/city.ts)). Frames are jittered and
  averaged while the view holds still, eight of them, once the scene has settled, and a test takes its frame once they
  are; while the view moves, what was kept is reprojected and clamped. So that a frame which takes long, as in software,
  does not hold up a city's meshes, the scene asks its worker for every cell it wants at once, and the worker makes the
  nearest first ([worker.ts](../../viewer/src/city/worker.ts)): Rome's 972 cells, which came three a frame, now come
  as fast as the worker makes them.
- **5. Movement.** The visit's clock (`clock=` in a link; the tests fix it) moves the wind in the plants, the ripples, the
  clouds and the animals: each vertex of an animal says whether it moves with the head, the neck, the tail or the
  breathing trunk, and the shader turns it about its joint, at a pace set by the body's length. The wind's direction is
  the renderer's, as no field gives it.

  **Animals and people go from place to place** (`gen:life/scene` version 11, `gen:people/settlement` version 4): what
  is drawn has something to do, and does it for as long as it is drawn. A body plan's `behave` names a routine, `feed`,
  `wander`, `patrol`, `stalk` or `circle`, or its habitat and poses suggest one ([FORMS.md](../FORMS.md)); the generator
  gives each animal a way by it ([routines.ts](../../world/generators/life/routines.ts)): a place or two near where it
  stands, how long it stays at each and how fast it goes between them, or a circle it flies or swims round. A group
  keeps together: the first of it that goes anywhere leads, and the rest go its way beside it, each from where it
  stands, a little after. One that stalks goes slowly up to the nearest group of something that is no hunter, holds
  off it and watches. A name goes with the first of its group. A settlement's
  people who stand, walk or carry make for the door of another house or for a well, an oven or a threshing floor, and
  keep clear of every house and enclosed yard; those who sit or kneel at work stay; the animals they kept feed and
  move on as the wild ones do, the herds out from among the houses. A way is twelve numbers kept with the body, and
  the shader works out from them and the clock where the body is, which way it faces and how far it has walked, each
  frame, with nothing carried from one frame to the next: what is not drawn costs nothing, and what comes back into
  view is where it would have been. A leg's points say how far they go with its stride, and the shader strides them
  by how far the body has walked, so that a foot on the ground stays where it was put down; a head held low to feed
  is held up on the way. As the clock starts everything is where the scene put it, or a first step on if it was put
  walking, so that a link with `clock=0` shows what it showed before, but for the legs of what walks. The sums are
  written twice, in the shader and in `wayAt`, and the tests hold the second.

  *Not built:* anything one animal does because of another. Nothing eats, is caught, flees or answers; a stalker's
  group takes no notice of it. A body is carried along straight lines, over ground that may lie a tenth of its hips'
  height off them, and stays put where the ground is rougher; it does not lean with a slope, its legs do not bend at
  the knee, and a small animal whose legs are spikes glides. Wings do not beat. People do not use the paths between
  settlements, go to the fields or the water, carry anything from place to place, or go indoors. Rome's crowd still
  stands. The hour and the season change nothing: a routine is the same at noon and at dusk. A way comes round every
  few minutes, so an hour's watching shows the same round many times.
- **6. Bodies.** A body's trunk, head and tubes have half as many sides again close by, and a head's or a tube's rings one
  more between each two. Hide, fur, feathers, chitin and wings have a grain in the body's own frame, and a body a pattern
  by its taxon's tint: stripes, spots, mottling or none. *Not built:* normals smoothed across the joints of parts.
- **7. Clouds.** The sky marches a layer of cloud from 1400 m to 2400 m in steps of 250 m at most, each frame from a
  start that moves across the screen, lit by the sun through itself and, with the sun low, through the heaps its light
  crosses along the layer, so that clouds against a low sun have dark cores and lit edges; the ground's cloud
  shadows are taken through the same layer. Its cover follows the globe's clouds over the scene, as fair weather: most of
  their cover, and never more than half the sky. The lighter way keeps its flat clouds.
- **8. The still.** A view held still is refined further: 48 frames, drawn at twice the size each way, the shadows cast
  from all over the sun's disc, and the scene asked for twice the budget with finer detail at each distance. It starts
  where a link says `still=1`, or once a visitor has used the page and held the view still for 1.5 s; any change ends it.
  `Save picture` keeps the canvas as a PNG with its link written into it.

## The fidelity pass

The eight steps left a clean diorama: the light was right, and what it fell on was plain. The parity rounds, which
hold the viewer's picture to researched briefs of what a visitor would have seen, showed it on every card: a ground
of one smooth surface, trees as balls of stamped leaves on sticks, a tuft every metre on bare earth, bodies as tubes. This pass went over the ground, the
plants, the bodies, the people and what they build, and raised each by the means the rules above allow.

- **The ground's materials are scanned.** Twelve of them: earth, fine earth, sand, grit, pebbles, stones, rock, rock in
  beds, mud, cracked mud, a crust and snow ([core/materials.ts](../../core/materials.ts)), all CC0 scans from Poly
  Haven, pinned and packed by [tools/materials/pack.ts](../../tools/materials/pack.ts) into
  `viewer/public/materials` (5.4 MB, fetched once, at full quality only) and credited in ATTRIBUTION.md. A scan gives
  a material its grain: its colour divided by its own mean, to multiply the tone the scene or the substrate gives the
  ground; its normal; its roughness about its mean; its height, by which two materials meet, the higher showing. Which
  material lies where, in what share and what colour, is untouched: the shader that coloured the ground says, as it
  colours it, how much of each material is there, and the grain of the two there is most of is read. Each is read
  three times among the tiles of a grid of hexagons, so that no repeat shows from above, and from the eye, where a
  float keeps its small places. A face too steep to read from above is read from its sides, its beds level. None of
  the twelve shows a living thing: what lies under trees is drawn (below).
- **Leaves come from an atlas.** A card of leaves shows a tile of an array of textures
  ([core/leaves.ts](../../core/leaves.ts), [leafatlas.ts](../../viewer/src/gl/leafatlas.ts)): for each of twenty-two
  kinds of leaf, two to four sprays of it on their twig, and for a tree's kinds a bough clothed in such sprays. Flat
  ranks of needles, brushes of long needles, scale-leaved sprays, shoots like bottle brushes; fronds of a fern, a
  cycad, a feather palm, a fan palm, a seed fern; oval, lobed, fan-shaped, tongue-shaped, strap-shaped, small and
  compound broad leaves; grass, reeds, rushes, a horsetail's whorls, a herb, a cushion of moss. Each is drawn in code,
  leaf by leaf, by a small rasterizer in a worker, in a second or two, the same in every browser: how light each point
  of a leaf is, how much of it is twig, how its face leans across its card, and how much of it is leaf. Its smaller
  levels keep as much of a tile leaf as its first, so that a spray far off keeps its mass. Which kind a part has is
  its form's (`leaf`), or follows from its type and material; nothing in the atlas is a photograph.
- **Plants grow skeletons.** [plants.ts](../../world/generators/life/plants.ts) draws every plant part type afresh: a
  conifer's branches in whorls that rise, sag and turn up, with sprays either side of them or all round; a
  broad-leaved tree's twig ends spread over a lopsided crown and gathered, by nearness, to limbs and their branches,
  with a rosette of sprays at each end and boughs behind them for the crown's mass; a palm's and a fern's fronds as
  troughed strips that arch and hang; a scale tree's forks ending in bottle brushes; a shrub's stems. A plant is drawn
  four ways from one seed, so that it keeps its shape as it nears: to its twigs close by, with boughs for its sprays a
  little way off, as a trunk, a mass and boughs laid like shingles from a way off, and as a plain shape far off.
  Limbs carry bark laid along them, of six kinds by part type: furrowed, smooth, in scales, in diamond cushions,
  ringed, ribbed and jointed. `gen:life/scene` is version 12: version 10 gave a scene the world's relief below its grid, and version 11 set its animals walking.
- **The ground's cover closes, in patches.** Three grids of clumps lie over one another: the scene's own, a finer one
  near the eye, and a wider one of larger clumps out to 170 m; a wide plant is sown further from its neighbours than a
  narrow one. Each grid is made a tile at a time and kept. A tuft's own blades are finer and bent over. Low plants
  grow in patches a few metres across, the same on every grid: most of a patch is of one kind, ranker or shorter and a
  little greener or yellower than the next, thinner at its edge, and one patch in seven is an opening. Where low
  plants have most of the ground, as on a grassland, the sward closes over patch and opening alike; where they have
  little, there are fewer clumps than their share of a grid, since a clump covers more than its own node. None stands
  where the eye does.
- **What lies fallen under trees is the canopy's own leaves.** The atlas has eight tiles more, each a patch of ground
  0.7 m by 1.4 m strewn with one kind of litter, which repeats without a seam: needles and shed shoots, lengths of
  scale-leaved shoot, oval, lobed and fan-shaped leaves, tongues and straps, small leaves, fronds and their loose
  leaflets, with bits of twig among them. Every kind of leaf falls as one of them, and a scene's litter is of its
  canopy's two commonest kinds, by weight. The ground under trees reads two sheets of it, one turned and a little
  larger than the other, within 34 m of the eye. Each leaf of a tile keeps its place in the order they fell in, the
  last on top, so that where less has fallen only the last lie there, whole; and they lie in drifts. A leaf is a
  brown of its own, and the earth's grain does not show through it. Nothing here is a photograph either.
- **What grows takes its place's colour.** A leaf takes most of its hue from the tones its place's climate gives its
  low plants or its canopy, as the ground under it does: a plant and the ground from afar are of one colour. Each
  plant is a shade of its own, and what grows low is dark at its foot.
- **Bodies.** A leg has a profile: a thigh or a shoulder deep fore and aft, a knee, a slender shank, a foot that
  spreads, and the muscle where it leaves the body. A trunk has one more ring between each two close by. Skins are
  laid in the body's own frame, a hide creased round the body, a coat lit at its edge; an eye is dark and wet. The
  plans themselves, which decide whether a horse is a horse, were gone over on their sheets, side, front and above:
  forty-six of them redrawn or mended, and one written for horses, which had been drawn as the plain ungulate and
  looked like llamas. A taxon's own form changes its plan part by part, so the eighty-two records whose forms
  restated the old proportions were refitted with them: what only repeated the old plan was dropped, and what makes
  the taxon itself was set on the new body.
- **People and what they build.** A figure's body is wider than it is deep, its head longer than wide, with a nose
  and hair; cloth hangs in folds. What houses are built of stands in relief, each material by a height of its own,
  and what is of earth or stone takes the scans' grain. `gen:people/settlement` was version 5 with these, on the
  legs that version 4 had set walking, and is version 6 with the three that follow.
- **A house has the relief its claims support, close by.** Its shapes were plain boxes with a dark patch for a door
  ([dwellings.ts](../../world/generators/people/dwellings.ts)). At the finest of its three details a wall that is built
  up, of earth, brick, stone, timber or daub, is now drawn face by face with its openings cut through it: a door or a
  window is set back by the wall's thickness, which shows at its sides, its head and its sill, under a lintel of timber
  bedded in the wall, a door on a threshold with its leaf shut, standing ajar into the dark of the room, or out of
  sight. A wall of mudbrick, rammed earth, cob, turf or dry stone leans in as it rises, its foot the thicker. A flat
  roof's walls rise past its deck as its parapet, under a coping, with the deck seen within them from above and the
  ends of its beams through them below; a court's deck stands out over the court as eaves. A round house's door is cut
  through a flat piece of its wall. How thick each kind of wall is, and how far it leans, is the generator's look
  (`BUILT`), as a roof's pitch already was: no tradition's record states it, and nothing was added that a record would
  have to state, so an empty yard stays empty. A wall that is a covering on a frame, thatch, mats, hides, felt, has
  no thickness to cut, and its door stays on its face.
- **A field under a crop is plants, close by.** The fields were flat colours on the ground. The plots are now laid out
  once ([core/plots.ts](../../core/plots.ts)), by whole-number hashes and sines that a shader and a worker reckon alike,
  for the ground's colour and for what is sown on it. Where the land use has fields and a plot is under a crop, the
  crop stands on it in rows along the plot, clear of its balks, sown through the ground's cover
  ([crops.ts](../../world/generators/people/crops.ts)): a plant at a time out to the cover's own reach, a length of row
  at a time on its wider grid out to 170 m, the colour of the field beyond. Between the rows close by the ground is
  tilled earth; in a plot under a crop or the plough what grows wild is weeded out, and keeps the balks and the fallow.
  Which crop grew is not known where no record says, and none is invented: it is one plain stand of upright blades, of
  two tiles the atlas of leaves already had, on a material of its own that takes the plot's colour, ripe or green,
  and not the wild land's tones. It has an entity of its own, and a click on it says that it is the generator's and
  names no crop.
- **A robed figure stands on feet.** Under a robe no legs were drawn, and a robe that reached the ground seemed to
  hover over it. Close by its hem stops at the ankle, over an ankle and a foot each side, on the ground; where the
  figure walks they stride as the feet of the legs that are drawn do.

  These three were judged on the look book's `hamlet-house`, `hamlet` and `village-house`, the last a hamlet of
  England in 1300 in the house its tradition's records describe; and the feet on the sheet of figures
  (`npm run world -- dwelling-sheet work:person`), since the figure that stands before the door in `hamlet-house`
  wears no robe. What they cost, at 1600 × 900 on an Apple M3 Max, which is not the reference GPU: a frame's total was
  as unsteady from load to load as it has been on this machine, before and after (19.6 and 23.4 ms, 28.8 and 28.9 ms,
  32.0 and 35.9 ms, the passes the change does not touch moving as much as those it does), and all three views were
  over the budget by that measure before the change as after it. What holds within a load is one pass against
  another: the meshes against the resolve went from 1.06 to 1.20 on `hamlet-house`, from 1.14 to 1.07 on `hamlet`, and
  from 1.70 to 1.55 on `village-house`, where rows of a crop took the place of the wild cover's clumps. The triangles
  drawn went from 12 to 144 thousand, from 8 to 72 thousand, and from 1.63 to 1.43 million. Nothing was thinned: the
  crop is drawn within the cover's own budget of clumps, and a house's relief only at its finest detail. The lighter
  way draws none of the three.
- **Stones stand on stony ground.** Where a scene's substrate has gravel ([core/substrate.ts](../../core/substrate.ts)),
  stones stand on its ground close by, as meshes: eight shapes of a rounded cobble, an angular block, a slab and a
  pointed stone ([strewn.ts](../../world/generators/life/strewn.ts)), each a ball swollen, cut by planes and squashed,
  part of it under the ground, sized and turned where it is sown. They are sown through the ground's cover, on its
  three grids and within its budget: the small on the grid nearest the eye and the big on the one that reaches
  furthest, a stone twice as wide a fifth as common. How stony a ground is, is its substrate's to say: its share of
  gravel, and how coarse its sources name its grain; how many stones that comes to is the generator's choice
  (`strewn.stones` in [scene.yaml](../../world/generators/life/scene.yaml)). A stone stands where the terrain draws
  the ground's own stones, since both read one field: where each material of a ground lies was the renderer's noise,
  and is now the generator's ([sorting.ts](../../world/generators/life/sorting.ts)), which the shader is written from.
  A sheet of gravel has stones all over it, and a topsoil's stones thicken on its rises. A stone is coloured as the
  terrain colours the ground's stones, by the two tones of its gravel, which are the rock's under the place where the
  world says what rock that is, each stone a shade of its own; its grain is the scanned rock's, read on its own
  faces; and the ground's bare colour lies banked at its foot and dusted on its top.
- **Fallen wood lies under trees.** Where at least three tenths of the ground is under canopy, lengths of fallen
  trunk, some broken in two, stumps, fallen branches and boughs lie on it, of the kind of tree that stands over the
  place, chosen as the trees are: in that tree's own bark, of its form's own thickness and a share of its height.
  A trunk lies where there is room between the standing trunks, turned the way the ground is most level under it,
  and not at all where the ground falls too much along it, since a mesh drawn many times can be turned but not
  tilted. Its bark is its tree's, greyed by how long it has lain, with what grows low on its upper side and the wood
  pale where it broke; it does not sway. A click on it finds its taxon. How much wood lies to the hectare is the
  generator's choice (`strewn.wood`): nobody counted it. A palm, a tree fern and a calamite shed a trunk and no
  branches. The look book's `forest-floor` is a view of it.
- **Bare ground is bare.** A ground bears what its climate grows only as far as what it is made of lets it: a crust of
  salt a thirtieth of it, and a mud or a lime mud its sources say dried into cracks a tenth (`cover.bears`, the
  generator's choice). Bare ground takes the rest, so that fewer trees and fewer low plants stand there, from afar
  by the mean of the scene's ground and close by where each material lies: tufts stand on the sand beside a crust,
  and next to none on it. `gen:life/scene` is version 13: a scene whose ground bears all its climate grows has every
  tree and animal where version 12 put it. The look book's `ground-salt` was moved some ten kilometres, onto land with
  the same ground: the world's relief below a scene's grid (version 10) had put its place under water.
- **Shadows close to.** The nearest cascade is as wide as the view is far, down to 24 m, so that close by a shadow is
  fine enough to meet the foot that casts it. How far behind what shades it a point must be, along the sun's way, was
  one number for all three cascades, which in the nearest came to more than half a metre: nothing lower than that
  cast a shadow on the ground beside it. It is now three texels of each cascade's own map, a hand's breadth in the
  nearest, so that a stone a foot high, a tuft and a foot cast one. A stone lower than two texels, some 6 cm at the
  nearest, still casts none: the map is no finer.
- **Clouds without streaks.** A march of 24 steps through the cloud layer hit or missed the edges of its heaps so
  much at random that eight frames' average kept the pattern of the marches' starts, as fine streaks along the rows of
  the screen. The march has 48 steps; each frame of a view at rest starts an even eighth of a step on from the last,
  in the order that halves the gaps; what is finer than the ground a pixel takes in of the layer, towards the
  horizon, is left out; and the light that has come a long way through the cloud is reckoned by its broad shape alone,
  which pays for some of the steps.

*What the stones, the wood and the bare ground cost,* on the look book's views at 1600 × 900: the stones add 0.3 to
0.4 million triangles to a stony desert's frame, of a budget of 9 million, and some 3,000 to the 90,000 the ground's
cover may draw; fallen wood adds some 50,000 triangles to a forest's; and a crust of salt or a cracked mud draws a
tenth or less of what it drew, since little grows on it. On the machine at hand, an Apple M3 Max with other work
running on it, the meshes' pass took 2.3 ms before and 3.6 ms after on `ground-stones`, 2.9 and 3.1 ms on `desert`,
and 4.9 and 5.4 ms on `forest-floor`. Whole frames were too unsteady to say more of than that they ran from 18 to 28
ms before and after alike: over the 16 ms target either way, on a machine that is not the reference GPU, on which
none of this has been measured.

*Not done:* parallax in the ground's grain; impostors; a house's yard where no tradition says what stood in it, which
stays empty. Stones stand only where a substrate says the ground has gravel: the gravel the renderer lays on a
climate's bare slopes and on the bars of a dry bed, and the rock of a steep face, have no stones standing on them, and
there is no scree. Fallen wood lies level, and has no fungi, no hollow and no root plate; a fallen frond is not drawn.
Neither stones nor wood are in the scene's fingerprint, which proves its ground, a cell and a mesh. The lighter way
draws none of this: its plants are the plain shapes they were, it has no stones and no fallen wood, though what its
ground bears is the same, its houses' doors lie on their walls, and its fields are colours on the ground.

*Not done, of houses:* a house walked into under its gable or a hood, one with a rounded end, a ring of rooms round a
court, a front cut in the earth and every tent keep their openings on the face of their walls. A wall has no inside:
a door ajar shows the dark, not a room. A roof of thatch or tile is the slab with thick edges it was, with no rafters'
feet or courses at its eaves, and a wall of timber no posts standing proud of its panels. From a middle distance a
house is what it was, so that as the eye nears one its door steps back into its wall.

*Not done, of fields:* every plot lies north and south, as the ground's plots always did; a crop is green or ripe by
its plot and not by the month, and stands under snow; a field has no stubble, stooks or weeds among its rows; a crop a
record names is not drawn as itself, since no record of a field's crop is read. Rows are the generator's look: most
grain was sown broadcast. A robe does not swing with the feet that stride under it: its cloth has no paces, so a
foot steps out past a hem that hangs still.

*What the plans could not say,* as those who redrew them found: a section that is not an ellipse (a flat belly, a
pear-shaped body); a leg narrower across than fore and aft, which a thigh is; a part that hangs on another part's end,
so that a turtle's head has eyes and a crocodile a line to its jaw; a row of plates that follows a back's curve; a
frill with thickness at its rim; a crest that turns with the head it stands on; one ring of a body changed without
writing them all. Forms with a source of their own were left as they were, among them most birds, whose thighs still
hang under their bellies.

*What they can say now* ([FORMS.md](../FORMS.md)), each a field that changes nothing where it is not written: a
section's shape (`widest`, `under`, `over`); a leg's width across and how much of a column it is (`across`,
`column`); a part on another part's end (`on: <part>`) or on its skin (`ride: <part>`), which goes where a child's
rings or joints put it; plates that lean and items that stand off a skin as it faces (`lean`); an edge to a frill
or a sheet (`rim`); a lump that turns with its frame (`turn`); and rows of a list changed by their numbers. They
were used where the sheets were worst. The elephants', the mammoth's and the heavy hoofed plan's legs are columns
narrow across at the top, under barrels widest below their middles, so that no leg's top stands out of a flank. The
sheep, the pig, the yak and the bison stand on stouter legs set as far apart as their bodies' sides, the sheep's
fleece and the yak's skirt of hair widest low. A turtle's eyes and the line of its mouth ride its neck, and a
crocodile's jaw line its snout, each on whatever head a family below has, sourced or not. The horned dinosaurs'
shield has a roll along its edge, and the duck-bills' crests turn with their heads.

*What is left.* The birds' thigh is the muscle a leg is given where it leaves the body, which hangs under a belly
higher than the plan's: `muscle: 0` on the `bird` plan's legs takes it away on every bird below that does not say
otherwise, the sourced ones among them, with no claim touched, and leaves a drumstick that is still the colour of
the leg and should be feathered. It was tried on a sheet and not written, since it changes every bird. The ox, the
water buffalo, the goat and the plain pigs and peccaries still have the pad of a haunch standing out of a narrow
flank, as the bison had. The stegosaur's plates still stand on a straight line under its back's arch, and the
crocodile's scutes on straight lines over its back: a row that rides would follow them, but the four records below
the crocodile that restate its neck's row and its eyes in the body's frame each cite a source, and would have to be
written again with it. The gharial's and the long-snouted kin's eyes and neck scutes float over their lower skulls
for the same reason. Domes, brows and head shields on other plans still lie level when a head pitches.

## The standard

A picture is judged where a visitor looks: from eye height, at what is within twenty metres, and at what stands out
against the sky. Each kind of thing is held to its own test, on the look book's views and on the sheets:

- **The ground** reads as a material from two metres: earth has crumbs and stones, sand grains, mud a sheen. No
  repeat shows from the air. Its colour from afar is its colour close by.
- **A plant** reads as its kind by its outline at fifty metres and by its leaf at three. Its crown has gaps the sky
  shows through and no surface that is only a shape. A stand of one kind has no two alike.
- **A sward** closes: where low plants cover the ground, bare earth shows between them only as the cover's share
  leaves it.
- **An animal** reads as its group from its side at any distance, by its back line, its neck, its head and its legs:
  its sheet (`form-sheet`) is looked at against a skeletal reconstruction whenever its plan is touched.
- **A person and a house** stand on the ground, and cast a shadow that meets them. A house's door and windows are set
  in the thickness of its wall, and where records are silent, plausible best-guess architectural trim, surface wear
  and environmental dressing (curbs, pottery, carts, stalls, yards and street clutter) fill the gaps so places feel
  lived in, marked as generated.
- **A field** under a crop is plants close by and the colour of those plants from afar; where no record names the
  crop, a plausible best-guess stand for the region and era is drawn and marked as generated.
- **What lies on the ground** lies in it: a stone's foot is banked with the ground's own colour and a log's underside
  is dark where it meets the earth. A stone is of what the ground's own stones are drawn of, and no two beside each
  other are alike; fallen wood is of a tree that stands over it.
- **Open assets and best guesses are welcome.** Openly licensed scanned PBR materials, foliage atlases, modular
  architectural kits and sculpted/rigged base meshes are welcome alongside procedural work. Everything honours the
  claims on record and fills in unknown details with our best informed guesses, honestly labelled in evidence mode.

A change is shown on the look book's sheet, before and after, with its frame times; where a view's frame goes over the
budget on the reference GPU, the change says what it thins to come back under it.

## Open questions

- Where should the wind's direction come from: a field of the climate's winds, once there is one, or the renderer?
- Is a third quality level, between fast and full, wanted for phones?
- Animals now move from place to place, each by its body plan's routine, with nothing carried from frame to frame
  (step 5, what was built). What should a routine rest on? Its name is the generator's own today. A taxon's diet, how
  far it ranged and how it kept company could be claims on its record, falling back up the tree as its form does.
- Should one animal answer another: a herd that looks up, or moves off, when a stalker comes? That needs either a
  rule that both can work out from the clock alone, or state kept for what is in view and given up when it is not.
