# Keeping a place in view from the globe to the ground

## The Angkor case

Open the [851 CE view](https://wikiworldmodel.org/?b=1753e842a906c808&t=851&lat=13.318067&lon=104.0184444&d=1.0062041066&w=752.531%7E949.81&v=33.88&sel=people%2Ffirst-cities%2Fangkor).
Before this change, the inspector named Angkor and the bottom bar reported its houses. The terrain gave the visitor no way to point out
the city. Its centre for 851, Hariharalaya at Bakong, is about 5.2 km west-northwest of the saved camera target.
Angkor's representative point lies farther northwest. The record uses that point for the later centre, Yasodharapura,
from 889 CE. The settlement generator already uses the dated cores when placing the town.
[Angkor record](../../world/entities/civilization/settlements/angkor.yaml) · [Town layout](../../world/generators/people/settlement/town.ts)

The camera range in the link is 39.5 km. A ready local scene can take over below 80 km and fully replaces the globe
below 45 km. Previously, the viewer hid the globe markers and state layer during that handoff. Local labels were enabled only
inside 22 km, and the local scene supplied names for organisms and recorded structures. Its settlement summaries fed
the bottom bar. This accounted for both the blank middle distance and the missing city label farther down.
[Viewer draw loop](../../viewer/src/main.ts) · [Local names](../../viewer/src/city/life.ts) · [City labels](../../viewer/src/ui/citylabels.ts)

## Viewer behavior

1. **Agree on where to go.** Resolve a settlement's name, active cores and representative point for the displayed year
   and chosen claims. Use the same result for the globe marker, search, the inspector's **Frame settlement**
   action and the local map. A single dated core gives the aim. Frame multiple contemporary cores together when
   possible. Fall back to the representative point for an undated settlement or an older build that only has a point.
   Carry the core claim reference through the build so the inspector can explain the choice. Expose a core's own name
   when supplied as data. A polity visit fits its dated rings to the globe camera on desktop and phone. Honour authored arrival views for sites such as
   Rome. Opening a saved camera or manually panning keeps the visitor's chosen view.
   [Feature placement](../../tools/world/src/build/records.ts) · [Settlement build](../../tools/world/src/build/landscape.ts)

2. **Keep one readable place label through the descent.** While local terrain loads, keep the globe label. When the
   local projection is ready, transfer the same selectable label to the dated core. At neighbourhood scale, give
   nearby named settlements and recorded landmarks the remaining room. When the selected core leaves the usable
   map area, show its direction and distance at the edge, with the same framing action. At ground level this also
   accommodates a centre hidden by terrain. Reserve space for the inspector and timeline. Deduplicate by stable
   identity so switching projections or panning across scene tiles never shows Angkor twice.

3. **Show what ground the settlement occupied.** Use a dated, sourced outline where the record supplies one.
   Otherwise draw a subdued overlay from the occupied parts of the generated plan and identify it on inspection as
   **reconstructed settlement extent**. For dispersed Angkor, show groups of occupied ground with fields and gaps
   between them. For a point-only site, the named pin is sufficient. A regional area estimate or a modern park
   boundary cannot establish a medieval city's perimeter. Compute the display geometry once per plan and date in
   the worker and simplify it for the current scale.
   [Settlement plan](../../world/generators/people/settlement/v12.ts) · [Worker summary](../../viewer/src/city/lifeworker.ts)

4. **Carry political context into the local view.** Use the same dated territory polygons and state dataset rows
   already drawn on the globe. If an edge crosses the view, clip it to the visible terrain and pick against the same
   geometry. Indicate the source map's resolution as the visitor gets closer. Deep inside a territory, where the
   nearest frontier may be hundreds of kilometres away, show the containing polity's name alongside the settlement.
   Keep the state and city independently selectable. Resolve containment for the displayed time and perspective.
   [Territories](../../viewer/src/ui/territory.ts) · [State rows](../../viewer/src/ui/layers.ts)

## Verification

| Visit | Visible result |
|---|---|
| Supplied link, 851 CE | The saved camera is restored. Once terrain appears, a visitor can locate Angkor on the map and frame Hariharalaya in one action. The core and surrounding settlement fit in the usable viewport with the inspector open. |
| Angkor, across 889 CE | The 851 and 1200 views identify their respective cores. Crossing the recorded transition updates the label and framing target. Panning away leaves a way back without moving the camera automatically. |
| Zoom in and back out | Sample both sides of the 80, 45 and 22 km thresholds, then neighbourhood and ground views, including during loading. Exactly one visible label or direction indicator identifies the selected site throughout. |
| Other settlements | Check Rome's authored arrival and monument labels, a compact city such as Uruk, and a settlement known only by a point. Inspecting a house still opens the house. |
| Polity interior and frontier | Start inside the Roman Empire in 120 CE, then cross a boundary present in that year's data. The interior names the polity, the crossing shows its edge, and inspection on either side agrees with the dated polygons. |

The matched screenshots below use the saved 851 CE camera and a fixed clock. The local pin marks Hariharalaya.
The dashed patches follow the occupied parts of the settlement plan. The Khmer Empire button opens the political map source.

| View | Before | After |
|---|---|---|
| Desktop | [Original view](../images/site-navigation-851-before-desktop.jpg) | [Dated centre, occupied patches and polity](../images/site-navigation-851-after-desktop.jpg) |
| Phone | [Original view](../images/site-navigation-851-before-phone.jpg) | [Settlement visible above the inspector](../images/site-navigation-851-after-phone.jpg) |

[Angkor camera fixtures](../../tools/look/views.yaml) · [Landscape tests](../../viewer/test/e2e/landscape.spec.ts) · [Territory tests](../../viewer/test/e2e/identity.spec.ts)
