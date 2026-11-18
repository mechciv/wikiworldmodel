# Rendering: a better picture of every scene

Status: proposal, November 2026. Nothing in it is built. It plans how the local scene renderer
([city.ts](../../viewer/src/gl/city.ts) and [cityShaders.ts](../../viewer/src/gl/cityShaders.ts)) and the meshes
the generators make of forms ([forms.ts](../../world/generators/life/forms.ts)) get from a clean diorama to the
picture of a good game, everywhere at once. [LIVING-WORLD.md](../LIVING-WORLD.md) and [SCENES.md](../SCENES.md) say
what a scene holds; this says how it is drawn.

## The aim

Every scene, at every place and time, drawn as well as a visitor's GPU allows, at no cost that grows with the
Earth's area or the span of time. The picture gets better through the renderer's code and the generators' meshes,
which every scene shares, and never by storing pictures of places.

What it will not do:

- **Paint the view with a learned model.** Diffusion or other neural rendering of frames is not an aim of the
  project (decided November 2026). Such a picture cannot say what any animal stands on, and the same view would
  not give the same picture twice.
- **Make the world more accurate.** A better picture of the Hell Creek shows the same taxa, forms, ground and
  climate. What lived there, and what it looked like, comes from records and forms, and is improved there.
- **Use assets made by a model.** Meshes or textures generated from a form were considered, and left for later.
- **Trace paths in real time.** WebGL 2 cannot afford it. The still (step 8) comes closest.

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

- **No facts in the renderer.** It decides how a material looks, never which material a thing has. Whether a taxon
  had feathers, needles or fronds, and how tall it grew, comes from its form and its claims. Colours and patterns
  stay the generator's, and are marked as such, as now.
- **The same build, time and camera give the same picture**, within the tolerance the golden images allow.
  Anything that moves takes a clock that a link and a test can fix.
- **Picking and evidence mode work for everything drawn.** A leaf a click passes through to the ground behind it,
  or that evidence mode does not tint, is a bug.
- **The fast way stays.** It draws no more than it does now, so the browser tests in software and slow machines
  keep working. New work is for the full way, and may add a higher one for stills.
- **Budgets, not hopes.** Each step says what it costs in frame time on the reference views, and the instance and
  triangle budgets stay tests.
- **A generator's new mesh is a new version.** The scene's fingerprint includes its meshes (`meshParts` in
  [kit.ts](../../world/generators/city/kit.ts)), so a step that changes what forms.ts makes is version 6 of
  `gen:life/scene`, with its witnesses recorded again. A step that changes only shaders changes golden images, not
  versions.
- **Procedural first.** A material made by a shader or a worker costs no download and no licence. Where a scanned
  material is worth it (soil, sand, mud, rock), it is CC0, listed in [ATTRIBUTION.md](../../ATTRIBUTION.md) with its
  source, fetched once and cached, and the same for every place and time. Nothing that shows a particular living
  thing, such as a leaf or a skin, is a photograph of a living one.

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
  body's size. Animals moving from place to place come later.

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

- **Nothing for each place or time.** Every step is code that every scene shares. The only new downloads are a few
  CC0 material sets, a few megabytes in all, fetched once.
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

## Open questions

- Is bark, like a leaf, too particular to a kind of tree for a scanned material, or can one stand in for all?
- Where should the wind's direction come from: a field of the climate's winds, once there is one, or the renderer?
- Is a third quality level, between fast and full, wanted for phones?
- Should animals move from place to place, and if so, by what rule?
