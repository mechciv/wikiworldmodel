# Performance: 60 fps across space, scale and time

Status: Phases 0–3 and Phase 4a implemented in WebGL 2, November 2026; Phases 4b–5 proposed. Connects the current
WebGL 2 local renderer ([city.ts](../../viewer/src/gl/city.ts), [cityShaders.ts](../../viewer/src/gl/cityShaders.ts),
[megabuffer.ts](../../viewer/src/gl/megabuffer.ts), [impostors.ts](../../viewer/src/gl/impostors.ts),
[sky.ts](../../viewer/src/gl/sky.ts)) and streaming workers ([life.ts](../../viewer/src/city/life.ts),
[stream.ts](../../world/generators/life/stream.ts), [structures.ts](../../viewer/src/city/structures.ts)) to the WebGPU
compute / visibility-buffer backend planned in [RENDERING.md](RENDERING.md) (step 9).

## The aim

Every local scene in Earth's history—a dense 200 Ma conifer forest, a Carboniferous coal swamp, a Pleistocene
grassland, Rome from 300 BCE to 600 CE, or a future modern megacity like Tokyo—should stay responsive at **60 frames
a second (≤ 16 ms/frame)** while the visitor:

- **zooms continuously** from orbital globe to 1.7 m eye height and back;
- **pans, turns and walks** across complex landscapes and urban canyons;
- **scrubs or plays through time** across seasons, years, centuries and millions of years.

**General architecture first.** Rather than adding city-only hacks, this plan targets universal spatial-temporal
rendering mechanisms that apply uniformly across plants, animals, rocks, fallen wood, people, vehicles, buildings,
roads, walls, water and terrain. Cities—starting with Rome today, and high-density modern cities next—serve as the
toughest stress test of the general system. City-specific optimizations (such as interior-mapped glass facades or
parametric modular skyscraper extrusion) should only be added later if profiling shows dense modern cities exceed what
the general architecture can hold within budget.

## Where it stands

The local renderer already has strong foundations: eye-relative coordinates (`gpuEye`), nested terrain clipmap rings,
single-sample floating-point HDR with TAA and hashed alpha, half-res occlusion-culled volumetric clouds, pooled
`interactive` / `native` / `still` FBOs, KTX2 compressed material loading ([ktx2.ts](../../viewer/src/gl/ktx2.ts),
[materials.ts](../../viewer/src/gl/materials.ts)), GPU-baked hemi-octahedral canopy tree impostors
([impostors.ts](../../viewer/src/gl/impostors.ts)), and a backend-agnostic [`LocalRenderer`](../../viewer/src/gl/renderer.ts)
contract with WebGPU capability probing ([webgpu.ts](../../viewer/src/gl/webgpu.ts)).

Yet zooming, panning or scrubbing time in Rome—and in any scene approaching high geometric density—exhibits severe
frame-time spikes and multi-second stalls. Code inspection identifies seven root causes, all of them general rather
than Rome-specific:

1. **Shadow cascade thrashing on every move, zoom, upload and year tick.**
   In [`updateShadows`](../../viewer/src/gl/city.ts), cascade radii (`r0`, `r1`, `r2`) vary continuously with camera
   `range`, cascade origins snap to a single shadow texel, `f.time` enters the cache key directly for cascades 0 and 1,
   and every cell upload (`upload`) or instance update (`setInstances`) bumps global `meshSerial++`. Almost every
   zoom tick, pan step, streaming arrival or timeline step re-rasterizes all three `2048²` depth maps.
2. **Per-move CPU selection churn and full GPU buffer re-uploads.**
   [`LifeScene.moved`](../../viewer/src/city/life.ts) triggers a worker round-trip whenever the eye moves >3 m (or 3%
   of clearance) or turns ~1.8°. [`SceneStream.select`](../../world/generators/life/stream.ts) then re-iterates visible
   cells (up to 220,000 instances / 9 million triangles), allocates fresh `ArrayBuffer`s, transfers them to the main
   thread, runs [`computeBatchBounds`](../../viewer/src/gl/culling.ts) across every instance on the **main thread**,
   re-uploads via `gl.bufferSubData`, and invalidates all shadow cascades.
3. **Flat LODs, high draw-call count and no occlusion culling.**
   Recorded static geometry ([`StructureLayer`](../../viewer/src/city/structures.ts)) streams ~972 separate `400 m`
   cell VAOs/VBOs/IBOs with only two binary LODs (`detail = 0` coarse, `detail = 1` fine inside `620 m`) and no
   hierarchical merging at altitude. Every visible cell is drawn up to five times per frame (3 shadow cascades, depth
   prepass, lit pass). There is no occlusion culling, and `gl.disable(gl.CULL_FACE)` is active for all mesh geometry
   across depth, lit and shadow passes—even though [`Mesh.tri`](../../world/generators/city/kit.ts) already enforces
   outward CCW winding on solid faces.
4. **Heavy branching fragment ubershader and unthrottled secondary passes during motion.**
   [`MESH_FS`](../../viewer/src/gl/cityShaders.ts) is a ~1,400-line ubershader branching across 76+ procedural
   materials (3D fBM noise, 9-tap Voronoi loops, scanned textures, 5-tap PCF shadows), causing SIMT warp divergence and
   high register pressure whenever varied materials share pixels. During motion (`cameraRestAt`), [`main.ts`](../../viewer/src/main.ts)
   scales internal resolution slightly on HiDPI displays, but every moving frame still executes 3× `2048²` shadows,
   full depth prepass, GTAO + 3 bilateral blur passes, volumetric clouds, full-res water SSR copy blit, volumetric
   shafts, TAA, luminance mipmaps and 3-level bloom.
5. **Time scrubbing tears down and rebuilds the entire scene.**
   [`lifeKeyAt`](../../viewer/src/main.ts) includes `landscape?.stepAt(t)` (which steps every 100 years in antiquity
   and every **10 years** in modern eras). Crossing a step disposes or parks the active `LifeScene`, spawns fresh
   `lifeworker.ts` and `worker.ts` threads, re-runs the entire `SceneStream` constructor, synchronously computes
   [`CityBuilder.tops()`](../../world/generators/city/cells.ts) for every structure, and rebuilds and re-uploads all
   static cell meshes—even though `StructureLayer` already supports smooth GPU lifespan filtering via `uEntities`.
6. **Synchronous GPU stalls on lighting changes.**
   Whenever the sun elevation changes (hour slider, month or time travel), [`updateSky`](../../viewer/src/gl/city.ts)
   executes five synchronous `gl.readPixels` calls (including a full `192 × 128` float LUT readback) to project sky
   spherical harmonics on the CPU, forcing a full CPU–GPU pipeline flush.
7. **Per-frame main-thread overlay raycasting and DOM churn.**
   [`CityLabels.update`](../../viewer/src/ui/citylabels.ts) runs every frame over all named entities, performing 8
   terrain height samples and 2D grid raycasts ([`Skyline.blocked`](../../viewer/src/city/skyline.ts)) per candidate,
   $O(N^2)$ overlap checks, and per-frame DOM `style.transform` mutations during active camera motion.

## Rules the work keeps

- **Same picture when settled.** Fixed-clock settled views and golden images keep their visual fidelity and
  determinism ([RENDERING.md](RENDERING.md#rules-the-work-keeps)). Interactive optimizations may trade secondary
  quality *only while moving or scrubbing*, and must converge cleanly to full quality once the camera rests.
- **Picking and evidence mode keep working everywhere.** Every entity—whether drawn as a close mesh, a simplified HLOD
  proxy, an impostor or a GPU-culled indirect instance—must remain pickable and tinted honestly in evidence mode.
- **The fast WebGL 2 way stays.** Slow machines and headless software CI (`quality=fast`) remain supported without
  requiring WebGPU.
- **Generator fingerprints stay stable unless geometry changes.** Renderer-side caching, culling, LOD selection,
  impostors, mega-buffers and shader refactors do not alter generator outputs or require version bumps. Where a later
  phase introduces persistent 4D lifespans in generators, it bumps the generator version cleanly with updated witnesses.
- **Measure motion, not just stills.** Every phase is verified against static *and* interactive benchmarks (zoom sweep,
  pan/orbit sweep, time-scrub sweep), tracking p50/p95/p99 frame time and worst single-frame stall.

---

## The universal 4D architecture

Any local scene—natural or built, Mesozoic or modern—consists of two primitives: **continuous surface fields**
(terrain elevation, normals, substrate, land use, cover, water) and **discrete 4D objects** (plants, animals, rocks,
people, vehicles, buildings, monuments, walls, roads), each carrying a spatial bound, a temporal lifespan
`[t_start, t_end]`, a multi-scale representation pyramid, a material class, and an entity ID.

Seven general architectural pillars scale both primitives cleanly across orders of magnitude in scene complexity:

### 1. Persistent spatial chunks and GPU-driven culling

Stop treating the GPU as a dumb triangle sink re-fed by JavaScript on every small camera turn.

- **Unified spatial chunk grid (quadtree / clipmap).** Partition all local geometry (static meshes and instanced
  populations alike) into persistent spatial chunks indexed by `(level, cx, cy)`. Each chunk is generated once in a
  worker and uploaded once into sub-allocated **GPU mega-buffers** (pooled vertex, index and instance buffers) rather
  than ~1,000 independent VAOs/VBOs.
- **WebGL 2 path (mega-buffers + multi-draw + generous frustum hysteresis).** Keep resident chunks in GPU buffers across
  camera moves. Submit visible static chunks via `WEBGL_multi_draw` (falling back to batched `drawElements` where
  absent). Give CPU/worker instance selection a generous frustum and distance margin so ordinary pans, turns and small
  zooms draw from already-resident GPU buffers with zero worker round-trips.
- **WebGPU path (compute culling + `drawIndexedIndirect`).** Upload each chunk's instances once to GPU storage buffers.
  Each frame, a single compute shader evaluates frustum culling, Hi-Z occlusion culling, temporal lifespan culling
  (`uTime ∈ [t_start - RISE, t_end + RISE]`) and continuous screen-size LOD selection, compacting surviving instances
  directly into per-prototype indirect draw buffers. Camera motion and time scrubbing perform **zero CPU instance
  iteration and zero `bufferSubData` uploads**.

### 2. Unified multi-scale representation pyramid (HLOD + generalized impostors)

Every object class should degrade smoothly from 1.7 m to 50 km using one shared **Screen-Space Error (SSE)** metric
(projected pixels of geometric error), instead of ad-hoc per-system cutoffs:

| Apparent size | Representation | Applies to |
|---|---|---|
| Close (`> 60 px`) | Full-detail mesh (branches/cards, cut openings, articulated limbs, detailed landmarks) | Plants, animals, people, buildings, monuments, rocks |
| Mid (`12–60 px`) | Simplified mesh (reduced topology, lower card count, massing volumes) | All prototypes and chunk meshes |
| Far (`2–16 px`) | **Generalized hemi-octahedral impostors** (2-triangle GPU-baked albedo+normal billboards) | Canopy trees (existing), shrubs, boulders, houses, small landmarks, vehicles |
| Macro (`< 4 px` / regional altitude) | **Quadtree HLOD merged chunks** (4 child chunks decimated/merged into 1 parent proxy) fading into macro terrain cover/land-use fields | Dense forests, rocky massifs, walls/roads, urban blocks and skylines |

- **Generalizing [`ImpostorAtlas`](../../viewer/src/gl/impostors.ts):** The existing 8×8 hemi-octahedral baker already
  preserves dynamic sun/SH lighting, shadows, picking and evidence mode for canopy trees. Extending it to *any* static
  or rigid prototype (dwellings, boulders, shrubs, props, vehicles) reduces tens of thousands of distant meshes to 2
  triangles each across every era.
- **Quadtree HLOD for non-instanced static geometry:** Replace the flat 2-LOD `400 m` cell array with a 3–4 level
  quadtree (`200 m → 400 m → 800 m → 1600 m+`). Parent nodes hold merged, decimated geometry (or simplified block/cliff
  envelopes) so zooming out over a megacity or mountain range drops draw calls from hundreds to a handful.
- **Smooth transitions:** Keep deterministic per-instance staggered LOD thresholds (`lodDetail`) and temporally
  stratified hashed-alpha cross-fading (`vInstFade`) so zooming from orbit to street level never pops or stalls.

### 3. Visibility and overdraw reduction (Hi-Z occlusion + winding-aware culling)

In dense forests, canyons and urban streets, 70–90% of objects inside the view frustum are completely hidden behind
closer terrain, tree crowns or building walls.

- **Front-to-back submission.** Sort opaque chunks and batches by distance from the eye before drawing so hardware
  Early-Z discards hidden fragments before entering the fragment shader.
- **Hierarchical-Z (Hi-Z) occlusion culling.** Build a conservative max-depth mip pyramid from the previous frame's
  depth buffer:
  - *WebGPU:* Two-phase GPU compute occlusion culling (test bounding boxes against previous-frame Hi-Z → draw visible
    → build current-frame Hi-Z → re-test newly disoccluded boxes and draw them) eliminates both occluded overdraw and
    1-frame disocclusion pop.
  - *WebGL 2:* Amortize coarse chunk visibility using either a compact CPU/worker masked software occluder buffer
    (128×64, rasterizing terrain + major opaque chunk AABBs) or WebGL 2 conservative occlusion queries
    (`ANY_SAMPLES_PASSED_CONSERVATIVE`) on coarse spatial cells.
- **Explicit single-sided vs. double-sided geometry.** [`Mesh.tri`](../../world/generators/city/kit.ts) already winds
  triangles outward consistently. Tagging solid closed meshes (terrain, rocks, trunks, animal bodies, closed building
  volumes) separately from genuinely thin shells/cards (foliage cards, open awnings, single-sheet roofs, porticos) lets
  the renderer enable `gl.CULL_FACE` on closed geometry, cutting rasterized triangles and overdraw ~40–50% across
  depth, shadow and lit passes.

### 4. Stable, cached, multi-scale shadows

Shadow maps must scale with camera *change*, not total world density.

- **Quantized cascade radii with hysteresis.** Snap `shadowRadii` to discrete geometric steps (e.g., powers of
  $\sqrt{2}$) with a hysteresis band so continuous zooming never invalidates all three cascades on every wheel tick.
- **Cascade update cadence & regional invalidation.**
  - Separate **static casters** (terrain, rocks, buildings, walls, roads) from **dynamic casters** (wind-swaying
    foliage, walking/idling animals and people).
  - Time-slice cascades: refresh Cascade 0 at interactive cadence, Cascade 1 every few frames or on >5% focus shift,
    and Cascade 2 only when focus shifts >15% of its radius, the sun moves, or a caster inside its footprint changes.
  - Replace global `meshSerial++` shadow invalidation with **bounds-filtered cascade invalidation**: uploading a cell
    4 km away does not flush Cascade 0.
- **Event-driven temporal shadow invalidation.** Precompute the active set of entity lifespan transition windows
  `[start - RISE, start]` and `[end, end + RISE]` (or bucketed transition times) so scrubbing across quiet years where
  no shadow caster changes state reuses cached shadow maps with zero re-rendering.
- **Toroidal scrolling / Virtual Shadow Maps (long-term).** On WebGL 2, scroll static shadow cascades toroidally when
  panning so only the newly exposed L-shaped border strip is rasterized. On WebGPU, adopt paged **Virtual Shadow Maps
  (VSM)** cached in world space so static urban and forest geometry stays cached across arbitrary pans and zooms.
- **Screen-space contact shadows.** Add a cheap 6–8 step depth-buffer raymarch in the lit pass for close-range contact
  grounding (feet, curbs, stones, grass tufts, window ledges), allowing Cascade 0 to stay wider and update less
  aggressively without floating shadows.

### 5. Low-divergence shading and GPU-compressed materials

Fragment cost scales with pixel count × overdraw × shader register pressure.

- **Material-class shader splitting (WebGL 2).** Break the monolithic 1,400-line `MESH_FS` ubershader into small,
  coherent shader programs by material family (e.g., *foliage cards*, *masonry / built surfaces*, *organic / animal*,
  *terrain / rocks / strewn*), grouped by batch/submesh. Cutting register pressure and warp divergence increases GPU
  occupancy dramatically on Apple M1 and integrated laptop GPUs.
- **Pre-baked KTX2 procedural material arrays (WebGL 2 & WebGPU).** Build on the existing KTX2 loader
  ([ktx2.ts](../../viewer/src/gl/ktx2.ts), [materials.ts](../../viewer/src/gl/materials.ts)) to replace expensive
  per-fragment procedural loops (9-tap Voronoi basalt, coursed brick/travertine, roof tiles, bark, scales/fur) with
  hardware-compressed ASTC/BC7/ETC2/BC3 texture arrays with proper mipmaps—reducing ALU cost while eliminating distant
  moiré.
- **Visibility Buffer (WebGPU).** Render opaque geometry into a compact Visibility Buffer (`instanceID` + `primitiveID`
  + depth) with minimal vertex/fragment cost, then execute tile-binned material compute passes so every visible pixel
  is shaded **exactly once** with zero overdraw shading and zero material warp divergence.

### 6. Layered 4D temporal persistence and two-tier time scrubbing

Time does not change everything at the same rate. Mirroring physical and historical timescales (generalizing
[CITIES.md](CITIES.md#a-city-in-layers-that-last-for-different-lengths-of-time) across all natural and human scenes)
prevents scrubbing from tearing down unchanged layers:

| Layer | Timescale | Examples | Lifetime policy |
|---|---|---|---|
| **0. Ground & drainage** | Millennia – Myr | Relief grids, bedrock, major river valleys, bathymetry | Rebuilt only on geological/shoreline/plate-bin change |
| **1. Persistent frame** | Centuries – millennia | Climate zone, recorded monuments, major roads, walls, canals | Mounted once per location; animated purely on GPU via `uTime` and `uEntities` |
| **2. Living & built fabric** | Decades – centuries | Forest stands, land-use/anthrome masks, procedural houses on plots, crops | Carry GPU `[t_start, t_end]` lifespans and GPU-interpolated temporal surface arrays across nearby steps |
| **3. Ephemeral & cyclic** | Seconds – months | Sun angle, snow line, seasonal palette, clouds, wind, walking/idling routines | Pure uniform / shader evaluation (`uClock`, `uSun`, `uSnow`, seasonal LUT) |

- **Decouple persistent layers from transient time keys.** Keep `StructureLayer` (its worker, tops and uploaded GPU
  cells) and unchanged terrain grids alive when scrubbing across anthrome or seasonal steps at the same location.
- **Universal 4D lifespans for procedural objects.** Extend `[t_start, t_end]` lifespans (already used for recorded
  monuments and taxa) to procedural buildings on persistent plots, dynamic land-use clearings, and vegetation cohorts
  so scrubbing across decades or centuries transitions them smoothly on the GPU without spawning workers.
- **Temporal texture arrays for surface masks.** Pack land-use, anthrome, and seasonal cover masks across adjacent time
  steps into `sampler2DArray` keyframe pairs interpolated in `TERRAIN_FS` by `uTime`, avoiding full CPU mask re-baking
  on every 10-year step.
- **Two-tier time scrubbing.** While the user actively drags the timebar or plays rapidly, update GPU uniforms (`uTime`,
  sun, seasonal tint) at 60 fps and **defer** heavyweight worker rebuilds until scrubbing pauses (~250–350 ms), then
  warm and swap the new layer asynchronously off-screen without blanking the frame.

### 7. Closed-loop frame budgeter and main-thread hygiene

Keep interaction fluid even on modest GPUs or unexpectedly dense viewpoints.

- **Closed-loop dynamic scaling & interactive pass shedding.** Track rolling frame times (via `FrameTimer` and `rAF`
  deltas) against the 16 ms target. During active camera/time motion (or when rolling frame time exceeds budget):
  - Reuse the pooled `interactive` FBO at adaptive `renderScale` (`0.5–1.0×`).
  - Shed or reduce expensive secondary passes while moving (skip or halve GTAO blur iterations, skip volumetric shafts
    and water SSR copy blit, halve shadow update cadence, skip smoke billboards), then smoothly restore full quality
    and TAA accumulation once input settles.
- **Zero synchronous GPU readbacks on the frame path.** Replace the five `gl.readPixels` calls in
  [`updateSky`](../../viewer/src/gl/city.ts) with an analytic/CPU sky radiance evaluation (or asynchronous PBO
  readback), eliminating multi-millisecond CPU–GPU stalls whenever sun elevation changes.
- **Time-budgeted uploads and worker offloads.** Move `computeBatchBounds` into `lifeworker.ts` (avoiding main-thread
  loops over 220k instances); cap main-thread `upload()` work to ~2–3 ms per frame; throttle [`CityLabels.update`](../../viewer/src/ui/citylabels.ts)
  so expensive `Skyline.blocked` raycasts pause during rapid drags and run on settle.

---

## Phased rollout

Each phase is self-contained, testable, and moves both natural and built scenes toward the 16 ms budget.

### Phase 0: Quick wins in the current WebGL 2 renderer *(implemented)*

Low-risk, high-impact fixes requiring no format breaks or generator version bumps:

1. **Stabilize & throttle shadows** (`viewer/src/gl/culling.ts`, `viewer/src/gl/city.ts`):
   - Quantize cascade radii to discrete power-of-$\sqrt{2}$ steps with hysteresis.
   - Event-driven temporal shadow key (track active entity lifespan transition windows instead of raw `f.time`).
   - Time-slice cascade 1 & 2 updates during motion and relax cascade 1/2 snap thresholds.
   - Avoid invalidating all three shadow cascades on every distant cell upload or instance update when bounds don't
     overlap a cascade.
2. **Eliminate synchronous `gl.readPixels` in `updateSky`** (`viewer/src/gl/sky.ts`, `viewer/src/gl/city.ts`):
   - Compute sky zenith/horizon colors and 9-band spherical harmonics directly on CPU from the exact same Rayleigh/Mie
     atmosphere equations as `SKY_LUT_FS` (zero GPU flush).
3. **Interactive pass shedding** (`viewer/src/gl/city.ts`, `viewer/src/gl/cityShaders.ts`, `viewer/src/main.ts`):
   - Pass an explicit `interactive` flag during active camera/time motion so non-essential passes (GTAO step count and
     diagonal blur pass, volumetric cloud step count, volumetric shafts, water SSR scene copy blit) scale down or pause
     during drag/wheel/scrub and restore seamlessly when settled.
4. **Decouple `StructureLayer` across time steps & debounce time scrubbing** (`viewer/src/main.ts`, `viewer/src/city/life.ts`, `viewer/src/city/structures.ts`, `viewer/src/city/lifecycle.ts`):
   - Pool and reuse `StructureLayer` (worker + uploaded GPU cells + cached `Skyline`) across time-step and month
     changes at the same city using a GPU `uEntityOffset` uniform instead of tearing down and rebuilding ~972 cells on
     every anthrome boundary.
   - Debounce `makeLife()` during active timebar dragging while keeping `uTime` live at 60 fps, and keep the active
     scene live across anthrome/month transitions while the next scene warms off-screen.
   - Time-budget incoming `StructureLayer` cell GPU uploads per frame so bursts of cells don't stall rendering.
5. **Reduce CPU selection churn & main-thread overhead** (`viewer/src/city/life.ts`, `viewer/src/city/lifeworker.ts`, `world/generators/life/stream.ts`, `viewer/src/ui/citylabels.ts`):
   - Compute `BatchBounds` inside `lifeworker.ts` and transfer them with batches instead of scanning all instances on
     the main thread.
   - Add a frustum margin (`margin: 0.25`) in `SceneStream.select()` and relax `LifeScene.moved()` thresholds with
     ~8 Hz throttling while moving so small camera motions don't constantly re-bucket and re-upload 220k instances.
   - Fast-path `CityLabels.update()` reprojection during active camera motion (skipping terrain/skyline raycasts
     between periodic full passes) and run a full occlusion/clash pass on settle.

**Pass criteria:** All existing unit tests and typecheck stay green; new unit tests cover shadow radius quantization,
temporal shadow transition keying, CPU sky SH accuracy, and structure-layer reuse; golden settled views remain
unchanged; Rome zoom/pan/scrub shadow redraws and main-thread stalls drop sharply.

### Phase 1: Interactive benchmark & telemetry harness *(implemented)*

- Extended [`tools/look/views.yaml`](../../tools/look/views.yaml), [`tools/look/views.ts`](../../tools/look/views.ts),
  [`viewer/src/main.ts`](../../viewer/src/main.ts) (`window.__wikiworldmodel.profileInteractive`), and
  [`frametime.spec.ts`](../../viewer/test/e2e/frametime.spec.ts) with scripted **interactive stress traces**
  (`rome-zoom-sweep`, `rome-orbit-walk`, `rome-time-scrub`, `hell-creek-zoom-sweep`) plus per-frame
  [`FrameCounters`](../../viewer/src/gl/renderer.ts) telemetry (`shadowCascades`, `drawCalls`, `megaDraws`,
  `staticCells`, `macroCells`, `impostorInstances`, `meshInstances`, and `workerSelections`).

### Phase 2: Persistent chunk mega-buffers, multi-draw and winding-aware culling (WebGL 2) *(implemented; coarse occlusion culling deferred to WebGPU/Phase 5)*

- Sub-allocated static chunk meshes into shared 28-byte VAO/VBO/IBO pages via
  [`StaticMegaBuffer`](../../viewer/src/gl/megabuffer.ts) with coalescing [`FreeListAllocator`](../../viewer/src/gl/megabuffer.ts),
  index rebasing, and `WEBGL_multi_draw` batching (falling back cleanly to single-VAO-bind `drawElements`).
- Sorted visible static cells and instanced batches front-to-back ([`sortCellsFrontToBack`](../../viewer/src/gl/culling.ts))
  and opaque-before-foliage-cards across depth and lit passes.
- Enabled `gl.CULL_FACE` selectively for verified closed outward-wound manifolds (`closed: true`, starting with
  subdivided-icosphere strewn stones) while keeping open/single-sheet architecture and foliage shells double-sided.
- *Remaining (optional WebGL 2 / Phase 5):* Conservative coarse occlusion culling (CPU masked depth rasterizer or Hi-Z
  compute occlusion on WebGPU).

### Phase 3: Unified HLOD pyramid and generalized octahedral impostors *(implemented; contact shadows pending)*

- **Quadtree macro HLOD pyramid** ([`cells.ts`](../../world/generators/city/cells.ts),
  [`worker.ts`](../../viewer/src/city/worker.ts), [`structures.ts`](../../viewer/src/city/structures.ts)): added
  `1600 m` (`4 × 4` leaf cells) merged & area-simplified macro tiles (`CityBuilder.macroCells()` / `buildMacro()` /
  `simplifyMacroMesh`) streamed first, substituting for leaf cells beyond `1500 m` (`1100 m` interactive) and serving
  Shadow Cascade 2 directly while restricting leaf coarse streaming to within `2000 m`.
- **Generalized hemi-octahedral impostors** ([`impostors.ts`](../../viewer/src/gl/impostors.ts),
  [`cityShaders.ts`](../../viewer/src/gl/cityShaders.ts), [`life.ts`](../../viewer/src/city/life.ts)): raised atlas
  capacity to 96 layers with pure [`ImpostorLru`](../../viewer/src/gl/impostors.ts) eviction and on-demand re-baking,
  extended baking and shading (`uImpSway`, `uImpKind`) beyond canopy trees to understory shrubs, procedural dwellings,
  and compact rigid town works (accepting `detail >= 0` sources so distant settlements bake immediately).
- *Remaining:* Screen-space contact shadows to further decouple close shadow crispness from Cascade 0 radii.

### Phase 4: Low-divergence shading and 4D temporal GPU layers *(Phase 4a shader specialization implemented; 4b KTX2 procedural arrays, 4D GPU lifespans, and toroidal shadows proposed)*

- **Phase 4a (implemented):** Specialized [`MESH_FS`](../../viewer/src/gl/cityShaders.ts) from a single `#ifdef`-pruned
  template into `MESH_FS_STATIC` (**zero `discard` instructions**, unlocking hardware Early-Z across static buildings,
  monuments, walls, and roads), `MESH_FS_BUILT` (instanced built/stone), `MESH_FS_FOLIAGE` (pure leaf cards/blades),
  and `MESH_FS` (mixed meshes), dispatched via [`classifyMeshMaterials`](../../viewer/src/gl/culling.ts).
- **Phase 4b (proposed):**
  - Bake high-frequency procedural patterns (basalt Voronoi, coursed stone/brick, roof tiles, bark) into KTX2 compressed
    material arrays via `tools/materials/pack.ts`.
  - Move procedural house/clearing cohorts and land-use surface masks to GPU 4D lifespans (`[t_start, t_end]`) and
    interpolated `sampler2DArray` temporal fields so time scrubbing across decades/centuries requires zero scene
    rebuilds.
  - Add toroidal scrolling for static shadow cascades on WebGL 2.

### Phase 5: WebGPU compute culling, Hi-Z occlusion and Visibility Buffer (`RENDERING.md` step 9)

- Implement a `WebGPURenderer` behind [`LocalRenderer`](../../viewer/src/gl/renderer.ts) using
  [`probeWebGPU`](../../viewer/src/gl/webgpu.ts):
  - Persistent GPU chunk & instance storage buffers with compute frustum + two-phase Hi-Z occlusion + temporal
    lifespan + SSE LOD culling emitting `drawIndexedIndirect` commands.
  - Visibility Buffer geometry pass + tile-binned per-material compute shading (zero overdraw shading, zero warp
    divergence).
  - Paged Virtual Shadow Maps (VSM) cached in world space for static terrain, forests and megacities.
- Keep WebGL 2 full and fast paths intact as fallback where WebGPU is unavailable.

## Open questions

- **When are city-specific optimizations warranted?** Modern cities like Tokyo introduce glass curtain walls, night
  window lighting, dense road markings and millions of repetitive tower storeys. Measure Phase 2–4 on a synthetic
  megacity stress test before deciding whether interior-mapped facades or parametric GPU building extrusion are needed
  beyond the general HLOD + instancing + Visibility Buffer pipeline.
- **Mobile / phone quality tier.** Should phones default to an intermediate tier (e.g., 1024² shadows, generalized
  impostors at closer range, lower interactive `renderScale` floor) between `fast` and `full`?
- **Worker pool sizing.** When `StructureLayer` and `SceneStream` stream chunks concurrently on multi-core laptops,
  should chunk mesh generation run across a small bounded worker pool (2–4 workers) to eliminate worker queue latency
  during fast flights?
