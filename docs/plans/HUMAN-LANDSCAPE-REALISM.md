# Human landscape realism: settlements, fields, crops and daily life

Status: approved plan, November 2026; implementation in progress on `feat/human-landscape-realism`. It follows the
[sixteenth](../slices/SIXTEENTH-SLICE.md) and [seventeenth](../slices/SEVENTEENTH-SLICE.md) slices,
[HUMAN-LANDSCAPE.md](../HUMAN-LANDSCAPE.md), [RENDERING.md](RENDERING.md), and [PARITY.md](PARITY.md).

## Diagnosis

At aerial and mid-range zoom (for example, the Eastern Han foothills of northern China in 147 CE,
`lat=36.5681, lon=114.1017, h=240, mo=6, hour=15`), the current human landscape reads as schematic:

1. **Checkerboard fields draped blindly over relief.** `core/plots.ts` and `plots()` in
   `viewer/src/gl/cityShaders.ts` divide all cropland into one global north–south rectangular grid of uniform
   cells with mild sine warp. Parcels ignore terrain contours, rivers, roads and steep hillsides; field bounds
   (`FIELD_WORDS.bounds`) are only a dark shader line; furrows vanish past 420 m; and close up
   `world/generators/people/crops.ts` stamps one generic grass-blade stand everywhere, with random ripe/green
   states that ignore the month.
2. **Pegboard settlements without internal roads.** Nucleated and walled villages without an explicit ring or
   row layout fall back to Poisson-disc `scatter()` (`world/generators/people/settlement/v6.ts`), leaving houses
   isolated 25–35 m apart on a giant uniform beige trodden disc (`s.r * 1.1`) with no internal streets, lanes or
   plazas. Inter-settlement `paths` stop short at `0.9 * s.r` instead of entering gates.
3. **Awkwardly stacked walls.** Town walls (`PIECE = 8` m in `world/generators/people/works.ts`) and village
   enclosures (`run = 6` m in `v6.ts`) are discrete horizontal instanced boxes placed at `ground.at(x, y)`. On
   any slope they stair-step, z-fight and expose end-caps; village walls are forced into rigid circles whose
   gates are merely an omitted segment.
4. **Generic building blocks and slope floating.** Houses stand strictly horizontal without terraced plinths on
   slopes, courtyard compounds collapse into flat blocks at mid-distance, and yards lack interior trees or
   clutter.
5. **No readable sign of life or activity.** `smallWork()` in `world/generators/life/stream.ts` culls people and
   small props below 4 px tall, leaving settlements visually deserted from 150–400 m. Close up, figures only
   spawn right outside house doors and ping-pong in straight lines—never working fields, driving carts, trading
   at markets, tending herds on pastures, or sending smoke from hearths and kilns.

## Locked architectural decisions

1. **Agricultural traditions as their own record kind (`tradition/agriculture`).** Parallel to
   `tradition/husbandry`, agricultural traditions live in `world/entities/civilization/traditions/agriculture/`, naming regions
   (`extent`), time span, `lifeway`, optional `field_system`, and `crops` (each entry specifying a botanical
   crop kind, optional `taxon` record, growing `season`, and `share`). Where no record holds for a region and
   time, a climate-appropriate generic crop mix stands in and reports itself as generic.
2. **Terrain-draped 3D field works for now.** Field bunds, dry-stone walls, hedges, ditches and contoured
   terrace retaining risers are built as terrain-draped static 3D meshes plus shader micro-relief, keeping
   relief height grids decoupled from settlement layout.
3. **Procedural-first geometry + expanded CC0 PBR material scans (low-complexity hybrid).** Keep the viewer's
   single 28-byte `Mesh` vertex format, instanced/static pipeline, picking and evidence tinting. Upgrade
   procedural geometry craft (`dwellings.ts`, `works.ts`, `walls.ts`, `crops.ts`, `figures.ts`), expand
   `tools/materials/ground.yaml` with CC0 architectural/prop scans where useful, and defer any build-time
   `.glb` → `Mesh` prop baker until needed.
4. **Provenance honesty and determinism throughout.** Sourced facts stay in CC0 YAML records with verified
   quotes checked by `npm run world -- quote-check`. Procedural layout, streets, walls, bunds, crops, carts,
   smoke, stalls and routines are seeded deterministically from world cells/slots and clearly labelled as
   generated in inspection and evidence mode.

## Milestones

### M1. Organic connected settlements and continuous terrain-conforming walls (`gen:people/settlement` v8)
- **Continuous terrain-conforming wall & gatehouse mesh builder** (`world/generators/people/walls.ts`):
  extrudes battered rammed-earth, masonry, brick, earthen bank, palisade, hedge and ditch perimeters along
  sampled terrain elevation with mitered joins, deep foundation skirts (zero gaps on slopes), horizontal
  stepped wall-walks on steep ground, organic/rectangular compound footprints (no forced circles for planned
  or walled villages), and real gatehouse assemblies (lintel/arch portals, flanking towers, roofed pavilions).
  Streamed as a static shadow-casting, pickable mesh from `SceneStream` alongside paths.
- **Road-first internal street networks & tight lot packing**:
  - Score settlement sites within 5′ cells to prefer low-slope ground and valley/river margins.
  - Build a connected road/street graph first: inter-settlement roads run directly to settlement gates; inside
    walled/planned settlements, cross-axial main streets meet at a central plaza/altar square with residential
    lanes and alleys; inside organic villages, a curving spine and branching lanes surround a central well/green.
  - Pack lots tightly along streets (eaves/yard walls 1–3 m apart) with a natural core-to-edge density gradient.
  - Render internal streets, plazas and roads as continuous terrain-draped surfaces, and replace the uniform
    `s.r * 1.1` beige trodden disc in `LandUseMap` with tight per-street, per-plaza and per-yard masks so
    greenery and shade trees survive inside settlements.
  - Seat buildings on slope-terraced plinths extending below the lowest corner of each footprint.

### M2. Topography-aware agricultural landscapes, terracing and 3D field bounds
- **Two-level domain-oriented parcel layout** (`core/plots.ts` + `PLOTS_GLSL` in `viewer/src/gl/cityShaders.ts`):
  replace the single global N–S grid with macro-domains (~220–420 m Voronoi cells) whose parcel orientation
  aligns to local terrain contours on slopes, nearby river/road bearings on valley floors, or seeded regional
  angles on broad plains. Subdivide each domain into irregular rectangular/trapezoidal plots with varied aspect
  and size.
- **Slope & riparian gating:** restrict flat blocks/paddies to low slopes, switch moderate slopes to narrow
  contour-aligned terraces, transition steep hillsides into pasture/scrub/woodland, and preserve natural
  riparian fringes along channels.
- **Physical 3D field bounds & terraces** (`world/generators/people/fieldworks.ts`): terrain-draped earthen
  bunds/dikes, terrace retaining risers, dry-stone walls, hedgerows, irrigation ditches and boundary corner
  shrubs/trees streamed as static meshes within the scene.
- **Aerial & mid-range field shading:** multi-octave crop vigor and soil-moisture variation, headlands,
  long-range anisotropic furrow normals legible past 1 km, partially harvested swaths, ploughed loam, weedy
  fallow and wet reflective paddies.

### M3. Real, regionally and seasonally grounded crops (`tradition/agriculture`)
- **Schema, validation and build pipeline:** add `kind: tradition/agriculture` to `kinds.yaml`, `crops`
  property to `properties.yaml` (and extend `field_system` to `tradition/agriculture`), add `Agriculture`
  compilation/lookup in `core/dwelling.ts`, validation in `tools/world/src/validate/index.ts`, build export in
  `tools/world/src/build/landscape.ts`, and streaming into `ScenePeople` via `core/landscape.ts` and
  `viewer/src/city/landscape.ts`.
- **Initial sourced agricultural traditions** (in `world/entities/civilization/traditions/agriculture/`, quote-checked against
  retrieved sources): Han/North China dryland millet–wheat–soybean–hemp–mulberry, Yangtze wet-rice,
  Mediterranean wheat–barley–olive–vine triad, Northern/Central European mixed cereal–legume, Mesoamerican
  maize–bean–squash milpa, and South Asian monsoon rice–millet–pulse.
- **7 botanical crop archetypes** in `core/leaves.ts`, `viewer/src/gl/leafatlas.ts`,
  `world/generators/life/plants.ts` and `world/generators/people/crops.ts`:
  1. Drooping-panicle millets (foxtail/broomcorn millet)
  2. Bearded small-grain cereals (wheat, barley, rye, oats)
  3. Tall cane/stalk crops (sorghum, maize, hemp, sugarcane)
  4. Wetland paddy rice
  5. Broadleaf row/bush crops (soybean, legumes, flax, cotton, tubers)
  6. Vine/cucurbit/trellis rows
  7. Orchards & groves (mulberry, olive, palm, fruit trees)
- **True seasonal phenology:** drive every parcel's growth stage, height, colour, harvest state and snow cover
  from `spec.climate.month`, hemisphere/latitude and climate water balance. Clicking a crop names its crop
  kind and agricultural tradition (or notes that it is a generic stand-in).

### M4. Living agricultural, economic and cultural activity
- **Aerial-readable signs of life:**
  - Animated hearth, kitchen and kiln smoke plumes (dedicated alpha-blended shader pass driven by `uWind`,
    `uClock`, `uNoise` and time-of-day intensity).
  - Working field and edge-of-village props: 3D grain stooks/sheaves, hay/straw ricks, active threshing floors
    with grain mounds, yoked ox-plough teams on ploughed plots, smoking kilns, irrigation ponds/well sweeps,
    river jetties and moored boats.
  - Economic life: two-wheeled carts, wheelbarrows and pack trains moving along real streets and
    inter-settlement roads; market plazas/streets with draped linen awnings, stalls, pottery jars, sacks and
    baskets.
  - Cultural hubs: raised civic/sacred forecourts around settlement shrines, altars and halls with mature shade
    trees and ceremonial poles/stelae.
  - Evening life: warm flickering amber light from open doorways, windows, kilns and market braziers when the
    sun is low.
- **Graph-following movement & daily rhythms:** route villagers and carts along actual street/road polylines
  and field balks rather than door-to-door straight lines; add agricultural, market and social poses; place
  livestock herds on real pasture/fallow parcels with realistic coat tints (fixing uniform spotted cattle and
  missing white fleece); lower mid-range culling thresholds with lightweight silhouette LODs so activity reads
  from 150–400 m.

### M5. Composite compounds, architectural craft and edge cohesion
- **Composite multi-wing dwellings** (`world/generators/people/dwellings.ts`): hierarchical courtyard compounds
  with taller principal halls, lower flanking wings, entry gate/screen walls, interior shade trees, firewood
  stacks and kitchen gardens; eaves rafter tails/brackets, ridge detailing, varied roof weathering, and
  silhouette-preserving mid/far LODs.
- **Soft natural–human fringes:** keep riparian trees/scrub along incised banks and gullies, hedgerow/corner
  trees in field margins, and grounded base darkening/AO skirts on walls, risers and buildings.
- **Look-book verification:** add the 147 CE Eastern Han North China view alongside the other reference human
  landscapes in `tools/look/views.yaml` and verify all unit, schema, typecheck, build and visual checks.
