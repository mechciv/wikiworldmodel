# The pie: props

The hero sketch in `pie.html` is the Earth seen from above its north pole, cut like a pie into six
eras, each era into two or three moments, with small low-poly models standing on each moment's map:
volcanoes, trilobites, sauropods, mammoths, pyramids, skyscrapers. It is a toy, and says so: the
models are caricatures, not reconstructions.

## What is drawn from data, and what is made up

- **Maps from the hero's bake** (`bake.py`, every dataset credited in ATTRIBUTION.md): today's relief,
  land and colour; the PaleoDEMs at 500, 250, 150 and 100 Ma with Li et al.'s climate; today's
  night lights (HYDE); the polities of 117 CE (Cliopatria) as a faint tint on Rome.
- **Made up, and to be said so wherever the picture is shown**: every model (caricatures, sized for
  legibility, not to scale); where each one stands; the magma ocean, the Archean's oceans and
  islands, and Snowball Earth (the 500 Ma continents under ice, standing in for 690 Ma), all
  generated in `pie/bake_pie.py`; the ice age's ice sheets and steppe, drawn by hand over today's
  map; each moment's longitude, chosen to show its subject; the clouds.
- The dates on the labels are round figures for the moment drawn, not claims of the world model.

## Rendering it

```sh
python3 tools/hero/pie/bake_pie.py                       # after bake.py: normal maps and masks
python3 -m http.server 8765 --bind 127.0.0.1             # from the repository's root
cd tools/hero && node pie/shoot.mjs out/pie.png "w=1500&h=1000" 3   # 4500×3000, labels included
```

Every choice is a URL parameter of `pie.html` (see `P` in `pie.js`); `only=<moment>` draws one
moment alone, to work on it.

- **Detail.** `detail=1`, the default, draws 12 moments (two to an era) with two to four big models
  each and a light scatter. `detail=2` draws all 15 moments with every model and scatter entry: the
  dense version. A moment, model or scatter entry marked `d: 2` in `SLICES` is drawn only at
  detail 2. `heroSize`, `scatterSize`, `skySize` and `density` tune the sizes and the count, and
  `drop=a,b` leaves out moments by key.
- **Models stand up for the camera**, so the side of an animal faces the viewer wherever it stands.
  On the half of the globe facing the camera, such a model would lean into the sphere, so the globe
  draws `pop` radii behind them, and they stand over it like a pop-up book's figures.
- **Nothing piles up.** A hero moves to the nearest spot where it doesn't stand on another hero as
  seen, or cover more than `overlap` of one. It is no wider than `fit` of its moment. Scatter
  doesn't stand on a hero, clouds don't cross one, and the moments' labels move aside or outward
  until they clear every hero.

## The models

The models live in five modules, each a file `props-<name>.js` that default-exports an object of
factories:

```js
import { THREE, mat, glow, mesh, at, group, … } from './kit.js';
function trilobite(rng) { const g = group(); …; return g; }
export const flat = ['wheatField'];      // props that lie on the ground: fitted by width, not height
export default { trilobite, …, wheatField };
```

## The rules for a factory

- `(rng) => THREE.Group`. `rng()` is a seeded random number in [0, 1); use it for variation (a
  tree's lean, a building's height, a herd animal's pose), never `Math.random`.
- It stands on y = 0, up is +y, and its front (a face, a facade, a bow) looks toward **+z**: the
  scene turns each model so +z faces the viewer. Its footprint is centred on x = z = 0.
- **Size doesn't matter**: the scene scales each model to the height it wants (flat ones, listed in
  `flat`, to the width). Build at whatever size is convenient, about 1 unit tall.
- Use the kit (`pie/kit.js`): `mat(color, {flat, emissive, …})` caches materials, `glow()` for lava,
  fire and lit windows, `mesh()` turns on shadows. Use the shared colours in `C` where they fit, so
  the eras agree.
- **Legibility over micro-detail.** In the hero a hero model (a sauropod, the Colosseum) is about
  60–120 px tall and a scatter model (a tree, a house) 12–30 px. Strong silhouettes, chunky
  readable parts, clear and slightly saturated colours. A detail under 2 px at that size is wasted.
  Check every model in the gallery at hero size (`w=900&h=600`).
- **Triangle budget**: scatter models (trees, grass, houses, herd animals, people) under ~400
  triangles each, as they are instanced by the hundred; hero models up to ~15k.
- Style: smooth-shaded low-poly, rounded where a toy would be rounded, like a tabletop diorama or a
  painted wooden toy. Not realistic, not blocky Minecraft. Caricature the key features (a sauropod's
  neck, a mammoth's tusks and hump, a Triceratops's frill), so each reads at a glance.
- No textures loaded from files. Canvas textures (`canvasTex`) are fine, for windows or crop rows.
- Animals face +z or are seen side-on? **Side-on reads best**: build animals walking along **+x**,
  so their profile faces +z (the viewer).

## The gallery

Serve the repository's root and shoot the gallery with the hero's shooter:

```sh
python3 -m http.server 8765 --bind 127.0.0.1                     # from the repository's root
cd tools/hero
HERO_URL=http://127.0.0.1:8765/tools/hero/pie/gallery.html node shoot.mjs out/g.png "mod=early"
HERO_URL=…/gallery.html node shoot.mjs out/g_small.png "mod=early&w=900&h=600"   # hero size
HERO_URL=…/gallery.html node shoot.mjs out/g1.png "mod=early&only=trilobite&w=900&h=900"
```

The page logs how many triangles it drew; errors show in the shooter's output.
