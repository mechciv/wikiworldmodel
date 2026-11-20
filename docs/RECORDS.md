# Researching and writing records

How to research a fact and write it into the world: which sources to use and how to cite them, and
the shape of each kind of record. [CONTRIBUTING.md](../CONTRIBUTING.md) has the rules these follow,
and the loop they fit in; the schemas are in [world/schema/](../world/schema/), and the terms you
may use in [world/schema/vocab/](../world/schema/vocab/).

## Research

**Sources, best first:**

1. Primary evidence and its first publication: a dated sample's lab paper, an excavation
   report, an inscription, a contemporary text in a critical edition.
2. Peer-reviewed syntheses and standard reference works: review papers, the ICS chart, Platner
   and Ashby for Rome, the Barrington Atlas through Pleiades.
3. Curated databases with versions: the Paleobiology Database, Pleiades, Wikidata (for
   identifiers more than for facts), PeriodO.
4. Encyclopedias such as Wikipedia, only to find the sources above. Cite them only when nothing
   better can be read, and say so in a note.

**Locators** are specific enough that a person can find the quote in a minute: `p. 412`,
`Fig. 3`, `Table 2, row "Deccan"`, `5.26.1`, `s.v. Arcus Titi, p. 45`, `occurrence 820351`.

**Numbers** are copied as the source gives them, with their uncertainty:
- `{ mean: 66.038 Ma, sd: 0.049 Myr }` for a stated ±. If the source says the ± is 2σ or 95%,
  halve it for `sd` and say so in a note; if it doesn't say, read it as 1σ and say so.
- `{ lo: 290.1 Ma, hi: 283.5 Ma }` for a range; `lo` is always the earlier time.
- A stage, reign or other record when that is what the source dates by: `{ ref: ics/artinskian }`.

**Dates** are written as the axis reads them ([core/time.ts](../core/time.ts)):
- years: `44 BCE`, `80 CE`, `1990.61`;
- days and months: `15 March 44 BCE`, `March 44 BCE`, in the Julian calendar before 15 October
  1582 and the Gregorian after;
- a date from a country that kept the Julian calendar after 1582 names it:
  `1 May 1707 CE Julian`, `25 October 1917 CE Julian`. Nothing can check this for you: left
  unnamed, such a date is read as Gregorian and lands ten to thirteen days early. England also
  began its year on 25 March until 1752, so an English "24 March 1602" is 1603: write the year as
  begun in January and say so in the note;
- a day by its Julian Day Number, as astronomers count days: `JDN 584283`;
- a day in the Maya Long Count, as the inscription gives it: `9.12.11.5.18 Long Count`
  ([a date in a count of days](#a-date-in-a-count-of-days));
- a day or a year in the Mexica calendar, as the source names it: `1 Coatl in the year 3 Calli`,
  `the year 7 Calli` ([a day named in cycles](#a-day-named-in-cycles));
- ages: `4550 BP`, `12.9 ka`, `66.043 Ma`, `4.567 Ga`;
- the future: `5 Gyr from now`.

Write a date as the source gives it, in the source's calendar where the axis reads it, and never
convert it by hand: a conversion is a derived value, and the note is the place to say what the
source's calendar was. A Roman date before 45 BCE is in a calendar out of step with the seasons.
Keep the date the source gives and say so in a note.

**Places** are recorded as measured: `{ lat, lon, frame: frame:earth/present-day }`, usually
from a gazetteer (Pleiades, Wikidata, GeoNames) with `method: gazetteer` and the gazetteer's id
as the locator. The entity also needs a `frame` claim, the plate it rides; copy the pattern
from a neighbour on the same plate. `npm run validate` checks it against the plate polygons.

**Identifiers**: put Wikidata, Pleiades, PBDB, PeriodO and OpenHistoricalMap ids in `same_as`,
and only ones you have looked up.

## Writing records

Read three or four records near yours before writing; the patterns are consistent. The schemas
are in [world/schema/](../world/schema/), and the terms you may use in
[world/schema/vocab/](../world/schema/vocab/).

### An event

```yaml
# world/entities/people/events/battle-of-actium.yaml
id: people/events/battle-of-actium
kind: event/battle
summary: >-
  The sea battle off the promontory of Actium in which Octavian's fleet under Agrippa defeated
  Antony and Cleopatra.
author: machine:claude-code
same_as: { wikidata: Q160387 }
claims:
  name:
    prop: name
    value: { en: Battle of Actium }
    unsourced: An editorial label.
  date:
    prop: date
    value: 2 September 31 BCE
    source:
      ref: src:cassius-dio-roman-history
      loc: "51.1.1, vol. 6 p. 3"
      quote: Such was the naval battle in which they engaged on the second of September.
    method: historical-account
  location:
    prop: location
    value: { lat: 38.923568, lon: 20.749775, frame: frame:earth/present-day }
    source: { ref: src:pleiades-actium-promontory, loc: representative point }
    method: gazetteer
  frame:
    prop: frame
    value: frame:paleomap/plate-307
    source: { ref: src:paleomap-plate-model, loc: PALEOMAP_PlatePolygons.gpml }
    method: plate-polygon
    basis: reconstruction
```

### Competing claims

```yaml
  date-renne-2013:
    prop: date
    value: { mean: 66.038 Ma, sd: 0.049 Myr }
    source: { ref: src:renne-2013-kpg-timescales, loc: "40Ar/39Ar ages of tektites", quote: "…" }
    method: radiometric/ar-ar
    rank: preferred
    note: Why this one is preferred, in a sentence.
  date-swisher-1992:
    prop: date
    value: { mean: 64.98 Ma, sd: 0.05 Myr }
    source: { ref: src:swisher-1992-chicxulub-ages, quote: "…" }
    method: radiometric/ar-ar
    rank: deprecated
    note: What superseded it.
```

The viewer lets a reader switch between them; the solver says if one contradicts the rest of
the world.

Estimates that differ several-fold, as the people of a city before any census do, are competing
claims like any other, each with its method and the year it is for (`valid`), one preferred with
a note saying why. A count of something else that an estimate rests on, the houses or householders
a chronicler gives, is a claim of what it counts (`houses`), never turned into people here: an
estimate of the people from it is a claim of `population`, with its own source.

### Evidence about time

```yaml
  date:                              # dated by the stage it was found in: follows the chart
    prop: date
    value: { ref: ics/artinskian }
  earlier-than-najman-2010:          # a one-sided bound
    prop: earlier_than
    value: 50.6 Ma
relations:
  formed-by:                         # a cause, with no lag: the crater starts with the impact
    rel: caused-by
    to: earth/events/chicxulub-impact
    lag: 0 yr
  during-deccan:                     # within another record's phase
    rel: during
    to: earth/lips/deccan-traps@main
```

Relations carry a `source` like any claim. Their meaning in time is declared in
[relations.yaml](../world/schema/vocab/relations.yaml), so the solver checks them: a cause dated
after its effect fails validation.

A count of days from another record's day, as a chronicle gives it, is a reference with a lag in
days: `{ ref: people/conquest/entry-into-tenochtitlan, edge: start, lag: 195 days }`. Where that
record's chosen claim dates its start or end to a day, the lag is counted on the calendar from it,
day for day, and lands on a day. A lag in years, or from a date less exact than a day, is carried
in years.

### One thing or two: lineage

Where one thing ends and another begins is the record's choice, and the sources' before it. Write
one record for what your sources treat as one thing, with phases for its states: Rome is one
record through a kingdom, a republic and an empire. Write a new record for what an act founded as
new. **Where it is disputed whether two are one, write two records and join them with
`continues`:** a relation can be contested, cited against and set in a perspective, and the shape
of a record cannot. Then say what happened between the two, in the *later* record:

```yaml
# world/entities/people/polities/great-britain.yaml
relations:
  from-england:
    rel: arose-from
    to: people/polities/kingdom-of-england
    source: { ref: src:…, loc: "Article I", quote: "…" }
```

| Relation | When to write it |
|---|---|
| `arose-from` | The subject came out of the target: it seceded from it, formed when it broke up, or formed when it united with others; a script adapted from another. The target may have ended or gone on. A break-up is several records that arose from one, and a union one that arose from several. |
| `succeeds` | The subject is a new thing that took the target's place when it ended. |
| `merged-into` | The subject ended by becoming part of the target, which was there already, and kept nothing of its own: an accession, an annexation. This one is written in the record that ended. Not for a town taken into a city, nor for a state made to pay tribute: see below. |
| `continues` | The subject *is* the target, carried on under another record: a claim of identity, sourced to whoever holds it (a court, a treaty, the United Nations, the state itself). |

- **Don't copy a date across records.** A kingdom that ended as the union began says so:
  `value: { ref: people/polities/great-britain, edge: start }`.
- **A contested `continues`** is the usual kind. Held by the body competent to decide, it is an
  ordinary relation. Asserted by one side and rejected by others, it belongs to an alternative of
  kind `perspective` (`alt: alt:<group>/<member>`), whose group says who holds which view. Asserted
  once and since given up, it is `rank: deprecated`, with a note saying when: it is kept, and
  binds nothing.
- **A denial is cited `against` the claim it denies.** Whoever refused a claim of identity, a
  court, a council, the other side, gives no other value to set beside it, so there is nothing
  to write as a competing claim. Its words go in `against:`, a list of citations like `source:`,
  and are quote-checked the same way. Any claim or relation may have one.
- **A renaming is not a new record.** The `name` is the short name people use, and the label on
  the map; a state's styles in its own laws are `official_name` claims, each with the `valid`
  it held for. Names that follow one another, no two at once, need no rank, and the panel shows
  them in turn. That is told from dates alone: where a name's span ends at a phase or at another
  record, rank one of them `preferred`.
- **Rival parents.** Two `arose-from` relations of one record both hold: that is a union. Where
  they are rival readings, as when scholars disagree about a script's parent, rank one
  `preferred`, with a note saying why, as for competing claims. Then it holds, and the other is
  shown as another reading, which holds only when a reader picks it. This goes for any relation
  type.
- **Lineage runs between things of a kind:** a state arises from a state, a script from a script.
- **A city is a settlement, and the bodies that governed it are polities.** Taken apart so, the
  rules above decide what a conquest and a renaming do to it. The settlement is one record while
  its sources treat it as one place, through a destruction and a rebuilding, with phases and its
  names in turn: `people/cities/tenochtitlan` is Tenochtitlan and then Mexico City. The states
  that ruled from it are records of their own, which may end, go on or be founded anew.
- **A town taken into a city does not end, nor does a state made to pay tribute.** The town goes
  on as part of the city, `part-of` it from the day it was taken (`valid: { lo: … }`). A state
  that paid another tribute, or took its governors from it, and kept rulers of its own people is
  `subject-to` it, for the span it was one. `merged-into` is for what ended by being taken in.

```yaml
# world/entities/people/polities/tlatelolco.yaml
relations:
  subject-to-tenochtitlan:
    rel: subject-to
    to: people/polities/tenochtitlan
    valid: { lo: { ref: people/conquest/conquest-of-tlatelolco, edge: start }, hi: { ref: people/conquest/fall-of-tenochtitlan, edge: start } }
    source: { ref: src:duran-1867-historia, loc: "ch. XXXIV, p. 269", quote: "…le fuesen tributarios y pecheros…" }
    note: What was owed, and what was kept, in a sentence.
```

- **The note says what came over,** where that is the question: a script may take another's sign
  shapes, their sounds, or only the idea of writing.
- `npm run world -- lineage <id> [--alt alt:…]` prints what a record came from, what came of it,
  and which records are one thing with it in that picture.

### A relation that held for a span

`part-of`, `member-of`, `held-office`, `participant`, `subject-to` and `holds` may say when they
held:

```yaml
relations:
  in-the-union:
    rel: part-of
    to: people/polities/soviet-union
    valid: { lo: 30 December 1922 CE, hi: 26 December 1991 CE }
    source: { ref: src:…, loc: …, quote: "…" }
```

Without `valid`, the subject's whole lifetime lies inside the target's: right for a fossil in its
taxon, wrong for a republic older than its union. With it, only the span must lie inside both
lifetimes. Either end may be left out, and one time (`valid: 1707 CE`) says it held then. A bound
that names a year or a month lies somewhere in it.

**A bound may be another record's start or end**, and where that is what the source means it
should be, so that no date is written twice and the span follows the evidence: "until his death",
"for as long as the Union lasted", "to the end of the war".

```yaml
    valid: { lo: 24 March 1603 CE Julian, hi: { ref: people/rulers/james-vi-and-i, edge: end } }
    valid: { lo: { ref: people/polities/soviet-union, edge: start }, hi: { ref: people/polities/soviet-union, edge: end } }
```

An open end is not "to the end": it says the end is not known. A claim's `valid` takes the same
bounds, and `"@phase"` names a phase of the record itself. Use a span for:

- a state that was part of another, or a member of a league, for some of its years;
- a person who held two offices at once: two `held-office` relations of the person, each with
  its span. (One office at a time may still be a phase of the life, `subject: "@reign"`.)
- a state that joined a war late or left it early;
- a town that paid another tribute, a lord who made himself a king's vassal, a company that acted
  in a king's name, for as long as it did (`subject-to`);
- who held a perspective, and from when to when ([two sides' accounts](#two-sides-accounts)).

No other relation takes `valid`.

### A war

A war is an event that lasts (`kind: event/war`), with a `start` and an `end`, which are often
competing claims. Its battles, campaigns and smaller wars are `part-of` it, in their own records;
a war that became part of a larger one partway through says from when (`valid`). Who fought is
written in the war's record, one `participant` relation each, with the span they fought for and
their side in the note:

```yaml
# world/entities/people/wars/second-world-war.yaml
relations:
  united-kingdom:
    rel: participant
    to: people/polities/united-kingdom
    valid: { lo: 3 September 1939 CE, hi: … }
    source: { ref: src:…, loc: …, quote: "…" }
    note: One of the Allies.
```

A campaign, an operation or a battle that lasted is `kind: event/campaign`; a battle of a day or
two is a moment. A treaty, an armistice or a surrender is a moment too (`kind: event/treaty`), on
the day it was signed.

- **Where a contested start or end changes what belongs to the war**, its parts and who fought
  in it from when, a competing claim is not enough: it moves one date and carries nothing with
  it. That is a perspective, an alternative that holds the date and the relations together.
- **The event that ends a thing is its end, and not a part of it:** name it as the `end`.
- **A state that changed sides takes part twice,** one `participant` relation for each span,
  each note saying which side. An alliance (`polity/alliance`) takes part as one; a member that
  fought on the other side takes part on its own, for its span. A company that fought in a
  king's name (`organization`) takes part as itself, and is `subject-to` the king.

### Two sides' accounts

Where the sides tell an event differently, each telling is a claim of its `account`: a sentence or
two in English, the writer's paraphrase of what the quotes show. Where a whole reading of several
events is at stake, each side's tellings belong to its perspective, an alternative of kind
`perspective` whose group says who told what, when and to what end. Neither is preferred: the
default picture keeps what both say, the dates both give and who fought.

```yaml
# world/entities/people/conquest/toxcatl-massacre.yaml
  account-mexica:
    prop: account
    alt: alt:conquest-accounts/mexica
    value:
      en: >-
        The Spaniards asked for the feast of Huitzilopochtli, and Moctezuma had it held. When the
        dancing had begun, they came out armed, closed every way out of the temple courtyard, and
        killed those who were dancing.
    source: { ref: src:florentine-codex-book-12, loc: "Book 12, chap. 20, fol. 32v", quote: "…" }
    method: historical-account
```

Who held a perspective is a relation of the holder, `holds`, with the span it held it for, sourced
to where it said so:

```yaml
# world/entities/people/persons/hernan-cortes.yaml
relations:
  holds-the-conquerors-account:
    rel: holds
    to: alt:conquest-accounts/conquerors
    valid: { lo: 30 October 1520 CE, hi: 15 October 1524 CE }
    source: { ref: src:cortes-1520-second-letter, loc: "p. 237 (the dating clause)", quote: "…" }
```

- **The span is when the holder said it**, from what its sources show: the dates of the letters
  read, not of a life. A holder written only for the view it held needs no more than a name.
- **A `holds` binds no dates** and holds in every picture: its target is an alternative, not a
  record. The panel and the menu of alternatives name each perspective's holders.
- **How long after.** When a source was written is the source's `written` (a day, a year, or a
  range for a text compiled over years), and each citation of a claim about a moment shows how
  long after the moment its source was written: *written 9 months after*, *written 33 to 56 years
  after*. Don't put it in the note.
- **One kind in every picture.** Whether a killing was a massacre or the putting down of a rising
  is often what the sides dispute. A record has one kind, the word most historians now use, and
  the accounts say the rest.

### Bounds beside a date

Some evidence does not date a start or an end, and only bounds it: a resolution that says a state
has ceased to exist, a visitor who found a city in ruins. `end_before` holds such a bound on an
end. It is not a competing end: it holds in every picture, beside whichever end is chosen.

```yaml
  end-security-council:
    prop: end_before
    value: 19 September 1992 CE
    source: { ref: src:…, loc: "preamble", quote: "…has ceased to exist" }
```

A first mention bounds a start in the same way, and a last mention an end from the other side;
those properties are not yet in the vocabulary, and are added with the first records that need
them ([a new term](#a-new-term)).

### A state that gave way little by little

A planet's phases say what covered its surface and what its atmosphere was (`surface`, `atmosphere`).
Where the sources say that a state did not end at a stroke, but changed through its whole phase into
the next, as a magma ocean froze over two million years, a claim of `change` says so:

```yaml
# world/entities/space/bodies/earth.yaml
  magma-ocean-change:
    prop: change
    subject: "@magma-ocean"
    value: gradual
    source: { ref: src:zahnle-2007-habitable-planet, loc: "section 9, p. 72", quote: "…it took would have taken ∼2 Myrs for the surface of a magma ocean to freeze." }
```

- **The phase's `surface` and `atmosphere` are then what it began with,** and the phase after it is
  what it came to. The viewer draws the planet part of the way from the one to the other, as far as
  the phase has run.
- **The quote shows that the change took the phase's length.** How long that was is the phase's
  `end`, a claim like any other: competing lengths are competing claims of it, and the fade follows
  the one chosen. Never write a length for a fade anywhere else.
- **A change that took its own time between two states is a phase of its own,** as the rain is
  between the magma ocean and the first ocean.
- **Without the claim, the state held until the phase ended,** and the globe changes there at once.
  That is right for a state that an impact ended.
- **It says nothing of how the change ran inside the phase.** The planet is drawn passing evenly
  (`model:earth/passage`), which no source says: the note is the place for what the sources have
  instead.

### A date in a count of days

Some calendars name a day by how many days it is after a zero day. A record writes such a date
as the source gives it:

```yaml
  end:
    prop: end
    value: 9.12.11.5.18 Long Count
    source: { ref: src:…, loc: …, quote: "9.12.11.5.18 6 Etz'nab 11 Yax …" }
```

Which day of our calendar that is depends on which day the zero day was: a correlation, argued
from evidence and contested. It is not in the code. It is the `date` of one record,
`people/calendars/long-count-zero-day` (`kind: event/epoch`), whose competing claims are the
correlations, each written as its constant: `value: JDN 584283`. Every Long Count date in the
world follows the one chosen, day for day, and the viewer can switch them. So never convert a
Long Count date yourself, and never cite a source for the correlation on a date: cite it on the
zero day.

- The validator warns where none of a claim's quotes has the date as written: two places are
  easily exchanged.
- The inscriptions write the zero day itself as 13.0.0.0.0, the end of an era before, and date
  the time before it in that era. Such a date says so: `12.19.13.4.0 Long Count of the era
  before`. Unmarked, the same places are a day of 2006.
- A span of a relation may be bounded by such dates.

### A day named in cycles

The Mexica named a day by two cycles: the 260-day count, `tonalpohualli`, a number from 1 to 13
with one of twenty signs (`1 Coatl`); and the year of 365 days, `xiuhpohualli`, a number with one
of four bearers, Tochtli, Acatl, Tecpatl and Calli (`the year 3 Calli`). A record writes such a
date as the source names it, a day, a year or both, with the signs spelled as in
[core/time.ts](../core/time.ts):

```yaml
  date-mexica:
    prop: date
    value: 1 Coatl in the year 3 Calli
    source: { ref: src:florentine-codex-book-12, loc: "Book 12, chap. 40, fol. 83r", quote: "…in xiuhtonalli ei calli. Auh in cemilhuitlapoalli ce coatl:" }
    method: historical-account
```

Such a date names not one day but every day that bears its names: a day's name comes round every
260 days, a year's every 52 years. So it is not a competing claim. It holds **beside** the
record's other dates, needs no rank and is never picked. The rest of the evidence leaves its
moment a window, and the date names the days of its name in that window: one, which must then
agree with the other dates to the day; several, between which it cannot choose (a note); or none,
and then the world fails, and says how far the nearest day of that name is. Two sides' dates for
one day are held against each other so.

- **Which day of ours a name falls on is a correlation:** the `date` of an anchor, a record of
  kind `event/epoch` with a `calendar` claim, the cycle, and a `day_name` claim, its day's name in
  it. `people/calendars/tonalpohualli-anchor` is the day 1 Coatl on which Tenochtitlan fell;
  `people/calendars/xiuhpohualli-anchor` the first day of the year 3 Calli. Their competing dates
  are the correlations, and every date named in cycles follows the one chosen. So never convert
  such a date yourself, and cite a correlation on its anchor.
- **A date given in both calendars tests the correlation,** unless the correlation rests on it.
  Where it names none of the days the rest of the evidence allows, it is kept and set aside
  (`rank: deprecated`), with a note saying why; the validator notes the nearest day of its name,
  and how far.
- **The quote names the signs,** in any of the spellings the sources use, Nahuatl or Spanish
  (`coatl`, `cohuatl`, `culebra`): the validator warns where it does not.
- **It dates a moment, a start or an end,** and nothing else: not `earlier_than`, nor a bound of
  a span.
- **A day of the year by its month,** "the eve of the 10th of Quecholli", is not read yet: it needs
  the month that began the year, which is disputed. Keep it in the note.

### A source

A law, a treaty, a resolution, a judgment or a proclamation is `type: document`, `kind: act`: the
document is itself the act, cited by article, section or paragraph. A claim read from an act made
at the time has `method: documentary`; one that rests on what a court or another competent body
held, often long after, has `method: ruling`.

```yaml
# world/sources/renne-2013-kpg-timescales.yaml
id: src:renne-2013-kpg-timescales
type: publication              # what the work is
kind: measurement              # what sort of evidence it is
citation: >-
  Renne, P.R., Deino, A.L., … & Smit, J. (2013). Time scales of critical events around the
  Cretaceous-Paleogene boundary. Science 339(6120), 684–687.
authors: ["Renne, P.R.", "Deino, A.L."]   # quote each: a bare flow list splits at the commas
published: 2013
doi: 10.1126/science.1230492
verified:
  by: machine:claude-code
  how: Citation, DOI and quoted values checked against the full text from the publisher's page.
```

One file per work, cited many times with different locators. An ancient text is one source,
naming the edition or translation it was read in.

### A dataset

A dataset the build reads goes in [world/manifest.yaml](../world/manifest.yaml), not in records:
its title, citation, license and a `fetch:` block with the URL, `sha256` and size. Then an
importer turns it into what the build needs, in [tools/world/](../tools/world/), with tests. Don't
convert a large dataset into thousands of YAML records: records are for researched facts, and
datasets are referenced, not copied (section 12 of the design). A database that changes every
day, such as OpenHistoricalMap or the PBDB, is kept as a dated snapshot in
[world/snapshots/](../world/snapshots/) or a pinned archive, with the query that made it
(`npm run world -- ohm-snapshot`, `npm run world -- pbdb-snapshot "Hell Creek"`). A taxon written by
hand adopts the database's by its number: `same_as: { pbdb: "txn:38862" }`.

A dataset of points, lines or areas over the globe needs no code in the viewer: its field says
its `kind` (points, lines or areas), maps its columns in `rows:`, and says how it looks in `layer:`
(a colour, or a hue for each group; sizes, widths and opacity, fixed or by a column; names; a
toolbar toggle), and one renderer draws it ([core/fieldlayers.ts](../core/fieldlayers.ts)). The
languages and the Roman roads are drawn so; copy one of theirs.

The field that reads a dataset says how its uncertainty is carried, as `spread:`: `band` (a low and a
high around each value), `alternatives` (readings, each its own picture), `ensemble` (members, such as
runs of a model), `claims`, `tiers`, or `unknown` when the source gives one value and no spread. Say
`unknown` rather than leave it out: no spread is not the same as exact.

### A row of a dataset

A dataset read as rows (the PBDB's fossils, Cliopatria's states, NOAA's hazards, Glottolog's
languages, Itiner-e's roads) is a source whose rows are claims. Its field's `rows:` section says
how a row is keyed and which column gives which property ([tools/world/src/tables.ts](../tools/world/src/tables.ts)).
A row's address is `src:<dataset>#<key>`: the inspect panel shows it, and
`npm run world -- claims <address>` lists what the row says.

A record can't be written into a dataset, so an **overlay**, one file per row in
[world/overlays/](../world/overlays/), names the row and does one of three things:

- **corrects it:** a claim of the same property, `rank: preferred`, with a `note` saying why the
  row is wrong and a source for the right value;
- **corroborates it:** the same value, from another source;
- **ties it to a record:** `same_as: <entity id>`, the entity it is a row of.

```yaml
# world/overlays/noaa-hazards/eruption-5238.yaml: the shape of one, not a real correction
row: src:noaa-hazards-2026-11-04#eruption:5238
author: machine:claude-code
claims:
  date:
    prop: date
    value: …
    source: { ref: src:…, loc: …, quote: … }
    rank: preferred
    note: Why the row's year is wrong, in a sentence.
```

The row stays as the dataset gives it, and the build reads it with the correction applied. Write
an overlay only for a row you have something to say about; never copy rows into records.

### A model

A model fills the space between the evidence: code that turns records, datasets and fields into a
field or another derived value. Its record, in [world/models/](../world/models/), says what it reads,
what it makes, where each parameter of what it makes comes from, and what it is checked against.
The values stay in the field; the model says only where they come from.

```yaml
# world/models/earth/coastline.yaml
id: model:earth/coastline
type: model
title: The coastline, from the elevation
description: >-
  The coast is where the elevation field crosses an isoline near sea level.
author: machine:claude-code
code: viewer/src/gl/globe.ts
inputs:
  - field:earth/elevation
outputs: [field:earth/coastline]
params:
  isoline_m: { choice: "Where the coast sits between the 0 m class and the first class of land." }
uncertainty: { kind: none, note: "A line with no width." }
```

- A parameter has a `source` (a work and a locator, as a claim's), `follows` a claim of the world, or
  is a `choice` that says what it means. Never call a choice a source.
- `checks` name a test and the test's name as written; the validator finds it. A check holds the model
  to evidence it does not read.
- `disagrees` lists evidence the model contradicts. Write it down rather than tune the model to hide it.
- `uncertainty` says how its output carries uncertainty. Uncertainty travels as samples
  ([core/samples.ts](../core/samples.ts)): a member is a joint sample of the whole world, member 0 the
  central value. A model that reads a field with a band, alternatives or an ensemble runs once per
  member and carries the spread on; the validator warns at one that says its output carries none.
- A generator lists its `inputs` the same way, as records, or as `{ prop: … }`, `{ rel: … }` or
  `{ kind: … }` for every claim, relation or record of that term. Empty only if it reads nothing.
- **A model or a generator?** A model turns evidence into a distribution: its output is a claim about
  the world at its resolution, which can be tested against a piece of evidence at a place. A generator
  draws samples from a model's distribution, finer than anything known: no single output is a claim,
  only its statistics. One that samples fields or claims names `checks`, tests that hold what it
  makes in aggregate to them (generated density to the model's, the mix of taxa to the atlas's), and
  `limits` where it is known not to follow them.

`npm run validate -- --verbose` notes each model and field that no evidence of the world reaches. A
check against the world's own evidence there is among the most useful work there is.

### How far a claim has been checked

A claim's `status` says whether a person has accepted it. Its `checked:` steps say what has been
done short of that, each with who did it and how ([core/ladder.ts](../core/ladder.ts)):

```yaml
    checked:
      - { step: quoted, by: machine:quote-check, how: "Found in renne-2013.txt (sha256 …).", on: "2026-11-06" }
      - { step: re-read, by: machine:claude-code@reread, how: "Read Table 2 again on its own; same value." }
```

- **quoted**: every quote the claim has was found, each in the text its source was read in, by
  script. `quote-check` writes it; don't write it by hand. A claim that quotes two sources is
  checked against both texts in one run, `quote-check src:a a.txt src:b b.txt`, and its step names
  both; given one text, the command asks for the other.
- **re-read**: a second reader read the source on its own and reached the same value. The reader is
  not the claim's author: a second agent names itself apart, as `machine:claude-code@reread`.
- **audited**: a person checked it, as part of a sample. Never a machine.
- **accepted** is the claim's status, set only by a person.

Each step stands on the one below it, and the inspect panel and `coverage.json` show the level a
claim has reached. Record only steps that were taken.

### A new term

A kind, property, method or relation type that isn't in the vocabulary is added in the same pull
request as the first records that need it, with a description. Prefer an existing term if one
fits; ask in the pull request if unsure.

### Geometry

Outlines of buildings, walls, roads and the like belong in
[OpenHistoricalMap](https://www.openhistoricalmap.org/), with their dates. A record adopts the
element (`footprint: { from: src:ohm-…, elements: [way/…] }`) and the snapshot is refreshed with
`npm run world -- ohm-snapshot`. Federate, don't fork: fix the map upstream, not here.
