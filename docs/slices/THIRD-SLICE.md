# Third slice: Earth's states

Status: built and passing its tests. The second slice ([SECOND-SLICE.md](SECOND-SLICE.md))
covered the whole span coarsely, but before 1,100 Ma the globe was a plain sphere, and a
Snowball Earth looked like any other time. This slice draws the planet as the world says it
was: what covered its surface, what its atmosphere was, and where there was ice.

It adds:

- **Earth as a record,** `space/bodies/earth`, whose phases cover its life from the start of
  its accretion: a proto-Earth, the rock-vapour atmosphere and the magma ocean left by the
  Moon-forming impact, the steam raining out, the hot ocean it left under a thick atmosphere
  of carbon dioxide, oceans of water, and, about 2 Gyr from now, a planet without them.
  Each phase says what covered the
  surface and, where it matters, what the atmosphere was, as claims with sources. Their
  dates come from the chronology: they are tied to the Solar System's first solids and to the
  Moon-forming impact, so picking another date for the impact moves the magma ocean with it.
- **Passages,** since the planet did not change at a stroke: a phase whose sources say that
  its change took its whole length claims `change: gradual`, and the globe is then drawn
  part of the way from that phase's state to the next's, as far as the phase has run
  (`model:earth/passage`). The four phases after the impact are passages.
- **Ice as a claim on a glaciation,** `ice_reach`: the lowest latitude the ice reached. The
  two Cryogenian Snowballs reach the equator, with a competing claim that leaves a strip of
  open tropical sea; a new record, the Makganyene glaciation of about 2.43 Ga, is the
  Paleoproterozoic Snowball.
- **A surface generator,** `gen:earth/surface`, that makes the patterns the states are drawn
  with: plates of crust on a cooling magma ocean, and a ragged edge for the ice. Like the
  clouds, it runs to the same bytes in the build and in the browser.
- **The renderer and the viewer:** the states drawn over whatever geography the time has,
  a row for them in the planet panel, a band under the time control's track, and the state
  in the panel for a click on the globe.

## Running it

As for the other slices (see the [README](../../README.md)). Nothing new is fetched.

## Pass criteria

| Criterion | Where it is checked | Result |
|---|---|---|
| Earth's phases follow the claims they rest on, in every scenario | `tools/world/test/build.test.ts`, `tools/world/test/planet.test.ts` | the proto-Earth ends at the impact and the magma ocean 2 Myr after it; picking Maurice et al.'s date moves the magma ocean to 4,425 Ma; the three competing lengths of the magma ocean move its end to 0.21, 1.5 and 10 Myr after the impact |
| A phase claimed to change gradually passes little by little into the next, and at no moment all at once | `planet.test.ts`; `build.test.ts`: leaves no moment…; `viewer.spec.ts`: Earth after the Moon-forming impact | from the first rock vapour to the oceans, in the default picture and with each competing claim picked, a thousandth of a phase moves no part of the drawing by more than 0.3%, and each phase ends in the state the next begins in; in the browser, eight moments through each passage each differ a little from the one before, none by half of the whole, and nothing jumps across a boundary |
| The state at a time follows the picks and alternatives | `planet.test.ts` | a pick moves a phase; an alternative's claims replace the default's |
| The surface generator is deterministic, and the browser reproduces the build's bytes | `world/generators/earth/surface/v1.test.ts`, `build.test.ts`, `viewer.spec.ts` | same SHA-256 in Node and in Chromium |
| The viewer shows each state and says which record it comes from | `viewer.spec.ts`: Earth's states, Snowball Earth | nothing before Earth formed; molten rock after the impact; oceans at 2 Ga; ice to the equator in the Sturtian, open water when the competing claim is picked |
| The vocabulary is enforced | `tools/world/test/validate.test.ts` | a string outside its property's values, a lag without an edge, and a planet's property on another kind are errors |
| Earlier renders are unchanged | `golden.spec.ts` | the three earlier goldens match without being regenerated; two new ones, the magma ocean and the Sturtian Snowball. With the passages the magma ocean's was regenerated, for the reason given under the surface generator, and no other changed |

## What was built

### Earth's record

`space/bodies/earth` is of a new kind, `body/planet`. Its phases, in the default picture:

| Phase | From → to | Surface | Atmosphere | Sources |
|---|---|---|---|---|
| Proto-Earth | 4,566.8 Ma, within 1 Myr of the first solids → the Moon-forming impact, 4,537.3 Ma | crust over magma | — | Zahnle et al. 2007; Elkins-Tanton 2012; Jacobson et al. 2014 |
| Rock-vapour atmosphere | the impact → 1 kyr after it | magma | rock vapour | Zahnle et al. 2007 |
| Magma ocean under steam | → 2 Myr after the impact, 4,535.3 Ma | magma | steam | Zahnle et al. 2007; Sleep 2010 |
| Steam raining out | → 1 to 10 kyr later, shown at 5.5 | crust over magma | steam | Zahnle et al. 2007; Sleep 2010 |
| Hot ocean under carbon dioxide | → 10 to 100 Myr later, shown at 55: 4,480.3 Ma | oceans | dense CO₂ | Zahnle et al. 2007; Sleep 2010; Sleep et al. 2014 |
| Oceans | → 2 Gyr from now | oceans | — | Zahnle et al. 2007; Goldblatt & Watson 2012 |
| Without oceans | → no end recorded | bare rock | — | Goldblatt & Watson 2012 |

The surface and atmosphere of a phase are what it began with. The rock-vapour atmosphere, the
magma ocean, the rain and the hot ocean each claim `change: gradual`: their sources have the
rock vapour condensing through its thousand years, the magma ocean taking its two million to
freeze at the surface, the steam raining out at about a metre a year until the oceans
returned, and the hot ocean cooling as fast as its carbon dioxide was carried into the mantle.

- **The impact's date** is the world's preferred claim, Barboni et al. (2017): within 60 Myr
  of the first solids. Picking Jacobson et al.'s (2014) moves the impact and the magma ocean
  to 4,472 Ma, Maurice et al.'s (2020) to 4,425 Ma.
- **How long the magma ocean lasted** competes. Zahnle et al.'s (2007) 2 Myr is preferred,
  as the model whose account the phases on either side follow, read in full. Against it:
  1.5 Myr to an ocean (Lebrun et al. 2013), about 10 Myr of runaway greenhouse (Sleep et al.
  2014, two of the same authors, and Sleep 2010), and 0.21 Myr (Nikolaou et al. 2019, who
  count the magma ocean ended when its surface stops flowing as a liquid, before it is
  frozen). The rock vapour's thousand years has two bounds beside it: less than 2,000 years
  (Sleep et al. 2001) and 100 to 1,000 (Zahnle et al. 2010).
- **How long the rain took** no source read says in years. Zahnle et al. give its rate, about
  a metre a year, and Sleep (2010) says of the like rain after an ocean-boiling impact that
  the surface is clement again "in a few thousand years": the claim is written as 1 to 10
  kyr, which is all those words say, and shown at the middle.
- **How long the hot ocean lasted** is a range, 10 to 100 Myr, which is what Zahnle et al.
  say they know (Sleep 2010), and the preferred claim: the phase is shown ending at its
  middle. Its two ends compete with it, each a case of theirs: 10 Myr if carbonate went
  into the mantle as fast as it formed, 100 Myr if it did not. Whichever, it had ended by
  3.8 Ga (Sleep et al. 2014), a bound that holds beside them all.
- **The Jack Hills zircon** (4,404 Ma) is recorded as grown after the rain: its oxygen
  isotopes record rock altered by liquid water (Wilde et al. 2001), which a hot ocean under
  carbon dioxide is as much as a temperate one (Sleep 2010). Its earlier relation, during
  the oceans' phase, is kept and set aside, since that phase is now the ocean after the hot
  one.
- **The oceans' end** competes: about 2 Gyr from now (Goldblatt & Watson 2012, preferred),
  or at least 1.5 Gyr from now (Wolf & Toon 2014, a lower bound).
- **New properties,** of planets: `surface` (magma, crust over magma, oceans, bare rock) and
  `atmosphere` (rock vapour, steam, dense carbon dioxide), each a string with declared
  values; and `change` (gradual), for a phase that gave way little by little.

### Passages

`model:earth/passage` (`core/planet.ts`) fills the time inside a phase whose change is
claimed to be gradual: the planet is taken to pass from the state the phase began in to the
state of the phase that follows, evenly in time. `lookAt` gives the state it is passing into
and how far it has gone. Where each of the model's parameters comes from is in its record:

| Parameter | Comes from |
|---|---|
| how long each passage takes | follows the claim that ends its phase: the rock vapour's, the magma ocean's, the rain's and the hot ocean's `end`. Pick a competing claim, and the passage is that long |
| how the change ran inside a phase | a choice: evenly. No work read gives it, and the sources say it was not even: the rock vapour's clouds held the planet's face until the vapour was gone, the magma ocean's surface stayed at its melting point until the freezing reached it |

A phase with no such claim holds its state to its end, and the globe changes there at once:
the proto-Earth at the impact, which the record has as a moment, and the oceans' end.

### Ice

`ice_reach`, a new property of glaciations, is the lowest latitude at which ice reached sea
level, as sea ice or grounded ice: 0 is ice to the equator.

| Glaciation | Ice reached | Competing claim |
|---|---|---|
| Makganyene, 2,443 → 2,425.5 Ma (new) | the equator: a global glaciation, from deposits at low latitude (Gumsley et al. 2017; Kopp et al. 2005) | 11°, where its glacial rocks were laid down (Evans et al. 1997, palaeomagnetic): the least the evidence requires |
| Sturtian, 716.9 → 658.9 Ma | the equator: grounded ice at sea level at all latitudes (Hoffman et al. 2017) | 10°: the Jormungand state, sea ice to within 5–15° of the equator (Abbot et al. 2011, with the latitude from Hoffman et al. 2017) |
| Marinoan, 644.5 → 635.4 Ma | the same | the same |

The Makganyene's dates are Gumsley et al.'s (2017): the first Paleoproterozoic global
glaciation began between 2,460 and 2,426 Ma, and the Ongeluk lavas over its last deposits
date its end to 2,425.5 Ma. Kopp et al.'s (2005) older dating, about 2.3–2.2 Ga, is kept as a
deprecated claim; the validator notes that it contradicts the preferred end.

### The states file

The build writes `planet.json` (`tools/world/src/build/planet.ts`): Earth's phases in order
and the episodes that change its look, each with its interval in the default picture and in
every scenario that moves it, and the claims that decide how it looks (`surface`,
`atmosphere`, `ice_reach`) with their ranks and alternatives. The look itself is derived in
the viewer, by `lookAt` in `core/planet.ts`: the phase that holds at the time, how far
through it the time is, and the lowest latitude any glaciation's ice reaches, each claim
chosen as the chronology chooses (a pick, else the preferred claim, else the only one).

Records now carry each phase's interval under the scenarios that move it, so the inspect
panel dates Earth's phases by the picks in force.

### The surface generator

`gen:earth/surface` (version 1) makes one RGBA texture, 512 × 256, over an equirectangular
grid: when each spot crusts over as a magma ocean cools (plate interiors first, from a
cellular pattern on the sphere; the cracks between plates last), hot and cool patches of
melt, a smooth field that makes the ice's edge ragged, and fine texture. It takes nothing
from the world: which channel shows, and how much of it, follows the states. How the
renderer uses it is in the record too, each a choice: a surface of magma has no crust; one
of crust over magma is 82% crust; and the ice's edge strays up to 5° either side of its
claimed reach. How much of a magma ocean has crusted over at a time is no longer one of
them: the crust spreads from none to the 82% of the state that follows, as far as the
passage has gone, where it used to spread to 96% by a number of the generator's. That is
the one golden that changed: at its moment, 1.3 Myr after the impact, 53% of the surface is
crust where 62% was, so the cracks between the plates are a little wider and the steam over
them glows a little more; the plates, the clouds and the sky are where they were. It reuses
the cloud generator's noise and, like
it, uses only arithmetic, `floor`, `Math.sqrt` and 32-bit integer operations, so every
engine makes the same bytes. It runs in about 0.3 s.

### The renderer

The states go over the geography mode the time has (elevation, the blocks, or none):

| State | Drawn as |
|---|---|
| Not formed yet | the sky only |
| Rock-vapour atmosphere | a glowing ball, the surface hidden |
| Magma | molten rock, giving its own light, with plates of dark crust that spread through the phase |
| Crust over magma | dark crust with melt glowing in its cracks, and no atmosphere drawn, since none is claimed |
| Steam atmosphere | an overcast of the cloud pattern, lit from below by the magma |
| Dense carbon dioxide | a pale veil over the whole planet, a little thicker where the cloud pattern is: the ocean under it barely shows |
| Oceans, where the map is unknown | an ocean world with a faint graticule: where the land was is not known, so none is drawn |
| Ice | ice sheets over land and sea ice over water, poleward of the claimed reach |
| A passage | part of the way from the one state to the next: rock vapour and molten rock thin out over what is under them, a magma ocean's crust spreads, the sky's colour and the clouds' cover, colour and glow go from the one's to the other's |

Clouds need water: they are drawn over oceans and in a steam atmosphere, thinner over a
Snowball Earth, and not over magma or bare rock. In evidence mode the state patterns are
procedural, magenta like the clouds. With no state, each mode draws exactly as before.

From the impact to 50 Myr after it, in the default picture: a glowing ball for a thousand
years, its glow giving way to steam; two million years of magma under that steam, its crust
spreading and the glow under the clouds dying down; a few thousand years of rain, the last
melt going under the water; then the pale veil thinning over an ocean world, most of it
gone by 50 Myr and today's sky by 57.

### The viewer

- The planet panel has a row for Earth's phase and, during a glaciation, one for its ice;
  each opens its record.
- A thin band under the time control's track shows the phases and, over them, the
  glaciations. Pointing at it names the state; a click opens its record, moving into the
  state if the time shown is outside it.
- A click on the globe adds the planet's state to the panel, with links to its records. In a
  passage both say which state the planet is passing into and how far it has gone, and the
  panel that the even pace is the drawing's. While molten rock thins out over a coming
  ocean, the panel answers for what shows through it: generic land and sea.
- Before Earth's record starts, only the sky is drawn, and the notice says when it began to
  form.

## Decisions

1. **States are phases of the planet's record,** as the design has it (section 4.2), not a
   series of values. Their dates come from the chronology, so they move with the claims they
   rest on; a series would have repeated those dates.
2. **Ice is a claim on the glaciation** (`ice_reach`), not a field. A latitude is what a
   Snowball Earth is claimed to be, and what the alternative claims instead. For the ice
   ages of the last 540 Myr a latitude band would be wrong (Siberia is not under ice today),
   so they wait for ice grids.
3. **No invented land.** Where no map is known, the oceans are drawn without land rather
   than with continents generated to a land fraction.
4. **The patterns are procedural and say so,** like the clouds: a generator with a seed, a
   version and a test of its bytes, and evidence mode marks them.
5. **A phase is of its entity's kind** when the validator checks which properties fit it, so
   a phase of a planet takes the planet's properties.
6. **A lag counts from an edge.** A time that refers to another record with a lag but no
   edge was accepted, and its lag ignored; it is now an error.
7. **String values can be declared** (`values` in properties.yaml), and the validator keeps
   claims to them; the inspect panel shows what a value means.
8. **A transition is a phase, and that it is one is a claim.** The steam raining out is a
   state the planet was in for thousands of years, with a start and an end like any other,
   so it is a phase; and that a phase gave way little by little is something its sources
   say, so it is a claim with a quote (`change: gradual`), not a flag on the phase or a list
   in code. The length of a fade is then the phase's own, which the chronology already
   solves, picks and all. Considered and not done: fading across the uncertainty of a
   boundary's date, which for these phases is the uncertainty of the impact's date, tens of
   millions of years, and would smear a thousand years of rock vapour into nothing; and
   quantities that vary through a phase (a temperature, a pressure of CO₂), which is how the
   design would have it in the end, but the sources give them at too few moments to draw from.
9. **The hot ocean is a phase of its own,** though its surface is the same ocean as the
   phase after it: what the sources tell apart is the planet under a hundred bars of carbon
   dioxide at 500 K and the planet after, and they date the one's end.
10. **A model that makes no field may name its parameters.** The validator held a model's
    parameters to those of the fields it makes; one that derives something else, as the
    passage does, may now say where its own come from.

## Limitations

- **Claims need review.** Every new claim is machine-made and proposed. Values that could not
  be fully checked:
  - of the works on the time after the impact, Zahnle et al. (2007), Zahnle et al. (2010),
    Sleep (2010) and Sleep et al. (2001) were read in full, and Nikolaou et al. (2019) in
    the authors' manuscript on arXiv; Lebrun et al. (2013) and Sleep et al. (2014) only in
    their abstracts, since HAL's copy sits behind a check for automated readers and the
    Royal Society's site refused the request. Elkins-Tanton (2008), the model most often
    cited for the magma ocean's length, could not be read at all and is not cited; her 2011
    paper, read on arXiv, gives only a range for rocky planets at large, 10,000 years to 5
    Myr, and Hamano et al.'s (2013) abstract only "within several million years", so neither
    is a claim;
  - the rain's length rests on a sentence about another rain, after an ocean-boiling
    impact, and is a range of a whole order of magnitude;
  - Zahnle et al.'s Fig. 5, which they call a cartoon, draws the surface freezing nearer 4
    Myr than the 2 Myr of their text, and near 500 K until about 100 Myr; the claims follow
    the text, and the figure's readings are in their notes;
  - Elkins-Tanton (2012), Abbot et al. (2011), Wolf & Toon (2014), Evans et al. (1997) and
    Kopp et al. (2005) were read only in their abstracts, the Abbot abstract only in a
    reconstructed copy; Zahnle et al. (2007) was read in full;
  - the Jormungand ice margin, 10°, is the middle of Hoffman et al.'s 5–15°, citing Abbot et
    al.; Abbot's abstract gives no latitude;
  - Goldblatt & Watson's "around 2 billion years" is a round figure that the paper does not
    derive; Caldeira & Kasting (1992) and Leconte et al. (2013) give other horizons;
  - the Makganyene's start is the bracket of the first global glaciation as Gumsley et al.
    correlate it across cratons; they suggest the Fennoscandian ages may bracket it to under
    7 Myr, about 10 Myr before the Ongeluk lavas.
- **One model's account.** The states after the impact, and the preferred length of each,
  are Zahnle et al.'s (2007) and its authors' later papers. Other groups' models compete on
  how long the magma ocean lasted, but none read tells the whole sequence another way.
- **A passage runs evenly, which no source says.** The model knows when a phase began and
  ended and nothing of what happened between: the sources have the rock vapour's face
  unchanged until it was gone, and the magma ocean's surface at its melting point, part
  melt and part solid scum, until the end. The crust that spreads through the magma ocean's
  two million years is the drawing's.
- **After the hot ocean the sky is today's.** Zahnle et al.
  take the Hadean that followed to have been cold, its oceans under thin ice with thaws
  after large impacts, and say themselves that this is reasoned and not observed; Sleep
  (2010) leaves open clement, icy, or still warm into the Archean. None of these is a claim
  yet, and no ice is drawn.
- **The hot ocean's look is a guess at what nobody describes:** a pale veil. The sources
  give its pressure, its temperature and an albedo of 40%, not its colour or its clouds.
- **The proto-Earth is one state** for the whole of its accretion: crust over magma. It was
  remelted by giant impacts at times nobody has dated, and it is drawn at today's size,
  though it was growing.
- **The impact itself** is a moment: the globe changes at it, but nothing shows the impact.
- **No Moon,** no length of day, and the light does not dim with the young Sun.
- **Ice is a latitude band.** That is what a Snowball Earth is claimed to be, and the
  competing claim's strip of open sea is drawn at its latitude with a generated edge. The
  ice ages of the last 540 Myr have no ice yet, and today's ice sheets are still coloured by
  their elevation.
- **Oceans without land where the map is unknown.** There was land (cratons, and later
  supercontinents), but nothing in the world says where, so none is drawn; the panel for a
  click on the globe says so.
- **States change at their best dates,** or pass between them. Evidence mode does not yet
  fade a state across the uncertainty of its boundaries, as it does for markers.
- **None of this shows in a sweep through time.** The time control's scale gives the Hadean
  and the Archean together five hundredths of its length (`core/timescale.ts`), so the first
  fifty million years after the impact pass in a blink; the passages show when the time
  control is zoomed in to them.
- **The patterns are simple:** one scale of plates and cracks, and the weather's cloud
  pattern for a steam atmosphere.
- **The atmosphere of the oceans' phase is not claimed,** so today's blue sky is drawn
  throughout it, from the end of the hot ocean on, including the late Archean, which may
  have had an orange haze.

## Next

- the Moon at its distance, and the length of the day, from tidal and cyclostratigraphic
  records;
- Earth's size as it accreted, with the accretion models as competing claims;
- the Hadean after the hot ocean: Zahnle et al.'s cold Earth under ice as an alternative
  beside a clement one, with the impacts that thawed it;
- Sleep et al. (2014) and Lebrun et al. (2013) read in full, and Elkins-Tanton (2008) read
  at all, so that the lengths they give can be weighed and not only listed;
- how each passage ran, where a model gives it: the temperature of the planet's face after
  the rock vapour, the share of a magma ocean's surface that was solid, the pressure of CO₂
  through the hot ocean, as quantities that vary through a phase;
- a scale for the time control that gives the first hundred million years room;
- the Archean's atmosphere and its haze;
- ice sheets from grids, for the last glacial cycle first (the first slice's Last Glacial
  Maximum), then the older ice ages;
- the impact as a tour: a replay drawn after the impact model picked;
- a simple energy-balance model, driven by the Sun and CO₂ series, as a check on when the
  rocks say the Earth froze;
- the far future's states: a steam atmosphere after the oceans evaporate, a molten surface
  under the swelling Sun, and the Earth's end, engulfed by the Sun about 0.5 Myr before the
  tip of the red-giant branch (Schröder & Smith 2008, already the source of that event).
