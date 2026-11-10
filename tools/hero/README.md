# The hero render

A still for the landing page: the Earth with an octant cut out of it. The cut faces show the model's
layers as bands (people, life, climate, terrain, plates) around a core labelled sources, each band
faintly tinted with that layer's own map along the cut. The surface is a different time in each
band of latitude, oldest at the bottom: the magma ocean, the Cambrian (500 Ma), the Cretaceous
(100 Ma), Rome in 120 CE; the night side is today. It is drawn with three.js and rendered in
headless Chromium on the GPU.

`renders/` holds the last render (`hero-cutaway.jpg`, 3000×2000, and a 1600 px copy) and
`approaches.jpg`, the other layouts tried on the way: a terraced pit, a stepped wedge, an octant
whose inner layers step up, time slices pulled apart, and the eras as a clock around the cut.

## What it reads

`bake.py` makes equirectangular textures in `tex/` from the fetched datasets (`.cache/datasets`)
and a world build (`dist/builds`, the newest unless `HERO_BUILD` names one):

- today: ETOPO 2022 relief; water from Natural Earth; land coloured from the Köppen classes of
  Li et al. (2022)'s pre-industrial climate, brought down to the relief by the lapse rate;
- the night lights: HYDE 3.2.1's population in 2015, scattered as settlements, and Natural Earth's
  places;
- Rome: the build's territory for 120 CE and the Itiner-e roads of that year;
- the deep past: the PaleoDEMs at 500 and 100 Ma, coloured by Li et al.'s climate of that age
  (bare ground before land plants), with generated relief finer than their 1° grid;
- the layers: PALEOMAP plates (`plates_dump.py`), ETOPO relief, Li et al.'s temperature and winds,
  biomes with every PBDB fossil site, Cliopatria's polities in 117 CE with HYDE's population in 100 CE.

Generated, not sourced: the magma ocean's pattern, the clouds, the fine relief on the PaleoDEMs.
The 500 Ma map is turned 150° in longitude to bring Gondwana into view (`eraLon`); plate
reconstructions do not fix longitude. Every dataset is one the build already credits in
ATTRIBUTION.md.

## Rendering it again

```sh
cd tools/hero && npm install                         # three.js
uv venv --python 3.12 .bake && uv pip install --python .bake/bin/python -r requirements.txt
../../.venv/bin/python plates_dump.py 0 cache/plates_0.json
.bake/bin/python -I bake.py now lights rome paleo:500 paleo:100 plates terrain climate life people
```

Then serve the repository's root (the page loads the site's fonts) and shoot:

```sh
python3 -m http.server 8765 --bind 127.0.0.1        # from the repository's root
node tools/hero/shoot.mjs out.png "$(sed 's/w=1500&h=1000/w=4500\&h=3000/' tools/hero/preset_final.txt)"
```

Everything about the picture is a URL parameter of `index.html` (see `P` in `hero.js`);
`preset_final.txt` is the one rendered. Render at 4500×3000 and downsample to 3000×2000 for the
final. `shoot.mjs` also writes `<out>.anchors.json`: where each era's band meets the globe's edge,
as shares of the picture, for placing labels beside it.
