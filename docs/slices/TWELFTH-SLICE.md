# Twelfth slice: identity

Status: built and passing its tests. The slices before it could say what a thing was, where and
when. This one asks what makes it *one* thing, and when it is the same thing: the question the
history of civilization turns on, and the one that a biome or a body plan never raises. It was
done as a stress test before that history is filled in. Nine of the hardest cases that could be
found were researched and written as records, to see where the model broke; the model was mended
where it did, and what it still cannot say is written down here, in [Limitations](#limitations).

It adds:

- **Lineage.** What came of what, between records: a state that `arose-from` another, `succeeds`
  it or `merged-into` it. A break-up and a union need no types of their own: they are several
  records that arose from one, and one that arose from several.
- **Identity as a claim.** `continues` says that two records are one thing carried on. It has
  sources like any claim. Where it is contested it belongs to a perspective, so what counts as one
  thing depends on the picture shown; where it was given up it is kept, set aside.
- **Denials.** A claim or a relation cites what speaks against it (`against`) apart from what
  speaks for it: the resolution that refused a state's claim to be another, beside the note that
  made the claim.
- **Rival readings of a relation.** Where two relations answer one question differently, one is
  preferred and the other holds only when a reader picks it, as with competing claims.
- **Relations that hold for a span.** A republic that was part of a union for seventy of its
  hundred years, one king of three kingdoms at once, a state that joined a war late: the relation
  says when it held, and the solver keeps that span inside both lifetimes. A span may end where
  another record does, "until his death" or "until the war ended", without the date written twice.
- **Wars.** An event that lasts, with battles, campaigns and other wars as its parts, and the
  states that fought in it as its participants, each for the span it fought.
- **Dates in a count of days.** A Maya date is written as the inscription gives it,
  `9.12.11.5.18 Long Count`. Which day of ours that is depends on the correlation, which is a
  claim with competing values, and every such date follows the one chosen, day for day.
- **Bounds and names.** An end may have a bound beside its date ("had ended by"). A state's
  official names follow one another without competing, and its short name stays the label.
- **Laws, treaties and rulings as sources.** A document that is itself the act, and a method for
  what a court or a council held.
- **No state dropped.** The globe drew at most three states that have records, and hid the
  others. It now draws them all.
- **The nine cases:** 32 new records and 9 changed ones, 3 groups of alternatives with 4
  perspectives, and 129 new sources, every quote of which was checked by script against the text
  it was read in.

## Running it

As for the other slices (see the [README](../../README.md)). Nothing new is fetched. One command
is new, and one takes more than it did:

```sh
npm run world -- lineage people/polities/russia           # what it came from, what came of it, what it is one thing with
npm run world -- lineage people/polities/rome --alt alt:roman-succession/translatio-imperii
npm run world -- quote-check src:a a.txt src:b b.txt      # several sources at once: a claim is quoted when every quote of it is found
```

In the viewer, with `npm run dev`:

- `?sel=people/rulers/pakal&t=683`: his dates as carved; then open *Zero day of the Maya Long
  Count* and choose another correlation.
- `?t=1300&lat=45&lon=70&d=2.4`: six states with records at once.
- `?sel=people/polities/holy-roman-empire&t=1000`, and the same with
  `&alt=alt:roman-succession/translatio-imperii`.
- `?sel=people/polities/fr-yugoslavia&t=1995`: a claim of continuity, set aside, with what denied it.

## The cases

Each was researched and written by an agent of its own, from sources it fetched and kept, and
then gone over once the engine could say more. What each one found is in
[What the cases showed](#what-the-cases-showed) and in [Limitations](#limitations).

| Case | Records | What is hard about it | How it is written |
|---|---|---|---|
| The Maya Long Count | `people/calendars/long-count-zero-day` (new), `people/rulers/pakal` | Dates carved in a calendar whose place in ours is argued | The zero day has three competing dates, JDN 584283 (preferred), 584285 and 584286. Pakal's birth, accession and death are written as carved; his death is 26, 28 or 29 August 683. The ranges of Julian dates worked out by hand are kept, deprecated |
| The lineage of scripts | six records of `people/writing/` | Lineage outside states: an adaptation, a minority view, a theory given up, an "or" | Eight `arose-from`: Proto-Sinaitic from Egyptian hieroglyphs, Phoenician from Proto-Sinaitic, Linear B from Linear A; Greek from Phoenician (preferred) or from Proto-Canaanite (a rival); Maya writing from Olmec or Zapotec writing; Egyptian hieroglyphs from proto-cuneiform, set aside |
| The Holy Roman Empire | `people/polities/holy-roman-empire`, `alt:roman-succession` | A claim to be Rome that the other Rome denied for a thousand years; two starts 162 years apart | Start 962 preferred, 800 competing. It `continues` Rome only in the perspective *translatio imperii*, with six citations for and four against |
| Yugoslavia | `sfr-yugoslavia`, `fr-yugoslavia` | A dissolution with no day; a continuity claimed, refused and withdrawn | The end is the Arbitration Commission's span, 29 November 1991 to 4 July 1992, preferred over the successor's first day; the Security Council's "has ceased to exist" is a bound on the end. The Federal Republic's `continues` is set aside, with nine citations for and five against |
| Britain | `kingdom-of-england`, `kingdom-of-scotland`, `kingdom-of-ireland`, `great-britain`, `united-kingdom`, `ireland`, `people/rulers/james-vi-and-i` | A union of crowns, two unions of states, a secession, renamings, Old Style dates | James holds three offices by spans that end at his death. Great Britain arose from England and Scotland, which end as it begins; the United Kingdom from Great Britain and Ireland; Ireland from the United Kingdom. Official names in turn |
| The Second World War | `people/wars/second-world-war`, `second-sino-japanese-war`, `invasion-of-poland`, `people/events/german-surrender-1945`, `japanese-surrender-1945` | A war with wars inside it, whose start and end are disputed; states that joined late | It starts with the invasion of Poland (preferred) or on 7 July 1937, and has three ends. Seven participants, each for its span. The war in China is part of it from 9 December 1941 |
| Germany | `german-reich`, `federal-republic-of-germany`, `german-democratic-republic`, `alt:germany-after-1945` | Two states and two courts on whether the Reich went on | Two perspectives. The Federal Republic `continues` the Reich in one, with the other state's court cited against it; the Democratic Republic's own early claim is set aside; it `merged-into` the Federal Republic |
| The Soviet Union and Russia | `soviet-union`, `russia` | A republic older than the union it was part of and carries on; four dates for one end | Russia is `part-of` the Union from the Union's start to its end, by reference, and `continues` it, with twelve citations. The Union `arose-from` Russia. Its end has four competing dates in December 1991 |
| The Mongol Empire | `mongol-empire` (changed), `yuan-dynasty`, `golden-horde`, `chagatai-khanate`, `ilkhanate`, `alt:mongol-unity` | A division with no day; a unity that outlived it in name | The empire's end is a range, August 1259 to 1264, preferred over the dataset's 1293. Four states arose from it. In the perspective *one empire* the Yuan `continues` it and the others are parts of it, with two citations against |

Besides these, Rome's kingdom and republic carry the Wikidata ids of the items that are those
states (below), and seven records were written with a name and no more, for what the cases refer
to and nobody has researched: the United States, the Empire of Japan, the Republic of China and
the Second Polish Republic, and Proto-Canaanite, Olmec and Zapotec writing.

## What broke

### Before anything was changed

The hard cases were first written against the world as it stood. This is what it said of them:

| Case | What the engine said |
|---|---|
| A kingdom of 1806–1918 that was part of an empire founded in 1871 | a contradiction, 64 years short: a part had to lie inside its whole for its whole life |
| One king of two kingdoms, 1603–1625, as two reign phases | a contradiction, 21 years short: phases follow one another |
| A state that arose from, succeeded, merged into or continues another | unknown relation types. The design named lineage relations; the vocabulary had one, for the tree of life |
| A war with a battle inside it and a state that joined late | no kind for a war: every political event, battle and conquest was a moment; no relation for who took part |
| A date in the Maya Long Count | not a time. The one ruler dated by it had ranges of Julian dates worked out by hand, with Wikipedia cited for the correlation |
| The same date as a count of days after its zero day | placed across two days in antiquity, and days away after 1582: a lag in days was turned into years of 365.25 days |

### While it was mended

Four more faults came to light, none of them in the records:

- **A relation's valid time meant nothing.** It was read and shown, and the solver ignored it. No
  relation in the world had one.
- **A record took a dataset's name whole.** A polity that claimed the borders dataset's rows of a
  name took every row of that name out of the map of states, even rows after the polity's own
  end, which it does not draw. Those rows vanished.
- **Three states with records at most.** The globe drew a record's territory in one of three
  colours, and when a fourth held at the same time it was dropped without a word, its rows
  already out of the map of states. The more states had records, the fewer the globe showed.
- **A relation seen from its target ignored the picture.** The panel listed a relation on the
  record it points to under every alternative, with no sign of its rank or its span.

### What the cases showed

Then the nine cases were written, and each agent reported what it could not say. What came up
more than once, or cost a case its meaning, was mended before the records were finished:

| What a case showed | In | Mended as |
|---|---|---|
| A denial has no form: what refuses a claim sat in its list of sources, told apart only in the note | Holy Roman Empire, Yugoslavia, Germany | `against`, cited and quote-checked like `source` |
| "Until his death", "until the war ended", "while the Union lasted" could only be copied dates, wrong under any competing date of the other record | Britain, the world war, the Soviet Union, the Mongols | a span's bound may name another record's start or end |
| Relations do not compete: `rank: preferred` on a relation was read by nothing, and two parents meant a union or a choice with nothing to tell them apart | scripts | rivals: the preferred holds, the other when picked |
| Three statements that agree had to be written as rival ends | Yugoslavia | `end_before`, a bound that holds beside the date |
| From 1918 the map's label for Russia was its long official name, and the name of today was the name of 1950 | the Soviet Union, Britain, Yugoslavia | `official_name`; names in turn do not compete; today's name is the last |
| `continues` asked that the heir be the younger, and the loop check refused "the Union arose from Russia" beside "Russia continues the Union" | the Soviet Union | it binds only the end; to carry a thing on is not to come after it |
| A date of the era before the zero day was read, silently, as a day in 2006 | the Long Count | `… Long Count of the era before` |
| Nothing held a count date to its quote; the source itself has the birth once with two places exchanged | the Long Count | a warning where no quote has the date as written |
| The day shown for a count date was the default correlation's, whatever was picked | the Long Count | the day under each correlation, and the one picked shown |
| A count date could not bound a relation's span | the Long Count | it can |
| No method fits a correlation, or what a court held years after | the Long Count, Germany | `calendar-correlation`, `ruling` |
| quote-check recorded one text for a claim, whichever source was run first, and a compound broken at its own hyphen no longer matched | the Long Count, scripts, the world war | every quote of every source, several sources in a run; a second look with hyphens left out |
| A script could arise from a state | scripts | lineage runs between things of one kind (`alike`) |
| One picture that does not hold put a warning on every competing claim of the world: 333, then 8,000 | scripts, Germany, the Soviet Union | said once, as that picture's |
| With any error at all the chronology was skipped, and the report looked clean | the Holy Roman Empire, scripts | the report names the checks that did not run |
| Chronology messages gave a day as "0.001 Ma" and a gap of days as "0 yr short" | the Soviet Union, the world war | calendar days, and days |
| Rows a record claims but does not draw in the picture shown were drawn by nobody | the Holy Roman Empire | the rows stay in the map of states, marked, and are left out only while their record holds |
| A record that arose from one long ended passed unnoticed: East Francia, between the Franks and the empire, has no record | the Holy Roman Empire, Germany | a note on the gap |
| A campaign of five weeks had to be a war, since a battle is a moment | the world war | `event/campaign` |
| A date written in the Old Style was shown only converted | Britain, the Soviet Union | shown as written, with its day on the axis |
| `lineage` gave a ranged end by its earliest bound, so a state seemed to end before its heirs began | the Mongols, Yugoslavia, scripts | it prints the range |

## Pass criteria

| Criterion | Where it is checked | Result |
|---|---|---|
| A relation that holds for a span binds only the span | `tools/world/test/identity.test.ts`: a relation that holds for a span | the kingdom older than its empire holds with `valid` and contradicts without it; a span that reaches outside either lifetime is a contradiction that names the relation; a bound that names a year is some day of that year; a whole with no end of its own lasted at least as long as its part was part of it |
| One person may hold two offices at once | the same | two `held-office` relations with spans hold; the same reigns as phases contradict |
| Only a relation that holds over a span has a valid time | the same | `valid` on `arose-from` is an error, and so is a span that is not `{ lo, hi }` or one time |
| A span may end where another record does | `identity.test.ts`: a span that ends where another record does | "until his death" follows whichever date of the death is chosen; with the date copied instead, a competing date contradicts the reign; a bound may name a phase, and must name a record that exists |
| Lineage binds the dates it should, and no more | `identity.test.ts`: lineage | nothing arises from what was not yet there; a successor began no earlier than what it replaced and outlasted it; a state that took another in may be the older or the younger, but was there and outlasted it; what carries a thing on may be the older of the two |
| A union's parents end as it begins, without the date written twice | the same | both kingdoms end on 12 May 1707, the union's 1 May in the Julian calendar |
| A contested claim of identity holds only in its perspective | the same | `continues` in an alternative is a relation of that picture alone; a picture that cannot hold is reported as that picture's; one given up is kept and binds nothing |
| What is one thing depends on the picture | `identity.test.ts`: what is one thing | the old empire is one thing with its claimant only in the claimant's perspective; an accepted continuity joins two records in every picture; what merely arose from a state is another thing |
| What denies a claim is cited apart | `identity.test.ts`: what denies a claim | `against` is read beside `source`, and must name works of the world |
| Rival relations: the preferred holds, the other when picked | `identity.test.ts`: rival readings | two parents with no rank both hold; with one preferred the other is a rival, checked as a competing claim is; preferred over nothing is a warning; lineage between things of two kinds is an error |
| Nothing is its own ancestor | `identity.test.ts`: nothing is its own ancestor | a loop of lineage is an error naming its relations; two records cannot have merged into each other; a union may have arisen from the republic that carries it on |
| A missing link is noted | `identity.test.ts`: a missing link | a record that arose from one that ended long before it began has a note saying what is not written |
| A war lasts, holds its battles, and may take in an older war | `identity.test.ts`: a war | a battle outside its war contradicts; a war that began in 1937 is part of one that began in 1939 from the day it joined, or throughout under the competing start of 1937 |
| Participants are written in the war's record, each for its span | the same | a span outside the war contradicts; a `participant` written in a state's record is refused |
| A day number is that day, across the reform of 1582 | `identity.test.ts`: days by number | JDN 2299160 is 4 October 1582 and 2299161 the 15th; day numbers and the axis go back and forth |
| A Long Count date is that many days after the zero day, to the day | `identity.test.ts`: a date in a count of days | 9.12.11.5.18 is 26 August 683 under 584283; 13.0.0.0.0 is 21 December 2012, where a lag in days lands elsewhere; a date of the era before is counted back from the zero day |
| Every date in a count follows the correlation chosen | the same | picking 584285 moves the death, the birth and the zero day by two days together |
| A count needs one zero day, and its dates are as the source has them | the same | no zero day is an error on the date; two are an error; a zero day that is a range, and a date no quote has, are warnings |
| A bound on an end holds beside its date | `identity.test.ts`: a bound on an end | `end_before` binds in every picture and does not compete |
| Names in turn do not compete | `identity.test.ts`: names in turn | official names with spans of their own need no rank; two that hold at once do |
| A picture that does not hold is said once | `identity.test.ts`: a picture that does not hold | one fault is one error, not a warning on every competing claim |
| Checks that did not run are named | `identity.test.ts`: checks that did not run | a report with errors says the chronology was not checked |
| A phase may carry another database's id | `identity.test.ts`: another database's cut | the kingdom's Wikidata item is on the phase |
| A claim is quoted when every quote of it is found | `tools/world/test/quotecheck.test.ts`: a claim that quotes two sources | given one source's text, the other is asked for; a step the tool wrote can be written again |
| A row is left out of the map of states only while a record that draws it holds | `tools/world/test/territory.test.ts`; `tools/world/test/build.test.ts`: draws Rome's territory, draws every state that has a record | Rome's rows are marked as its own; the dataset's Byzantine row of 1468–1474 is not; the Holy Roman Empire's rows of 922–961 are the dataset's in the default picture and the empire's where it begins in 800 |
| No state is dropped for want of a colour | `territory.test.ts`; `build.test.ts`: draws every state that has a record | of six that hold in 1300 CE, three take the colours, the open record first and then the largest, and three are left to the map of states |
| The viewer shows all of it | `viewer/test/e2e/identity.spec.ts` | Pakal's dates as carved, and two days later under 584285; spans, denials, "set aside" and "another reading" in the panel; a contested identity only in its picture, from either end; names in turn; a click on a state drawn among the states opens its record |
| The world itself holds | `tools/world/test/world.test.ts` | no errors, no warnings, and no reference to a record nobody wrote |

## What was built

### Lineage

Four relations, of the family `lineage`, in [relations.yaml](../../world/schema/vocab/relations.yaml).
Each is stored in the later record and names the earlier, so that writing a successor never
means editing its predecessor; `merged-into` is the exception, held by the record that ended.

| Relation | Means | What it binds |
|---|---|---|
| `arose-from` | the subject came out of the target, which may have ended in it or gone on beside it | it began no earlier than the target began |
| `succeeds` | a new thing took the place of one that ended | it began no earlier than the target began, and ended no earlier than it ended |
| `merged-into` | the subject ended by becoming part of the target, which was there already | the target was there by the subject's end, and outlasted it |
| `continues` | the subject is the target, carried on: a claim of identity | it ended no earlier than the target ended |

- **A date is not written twice.** A kingdom that ended as a union began names the union's start
  as its end, as any claim may name another record's edge.
- **Lineage runs between things of a kind** (`alike`): a state from a state, a script from a
  script.
- **The validator** refuses a loop: nothing is its own ancestor, in any picture. `continues` is
  identity and not ancestry, so a union may have arisen from the republic that carries it on. It
  notes a record that arose from, or succeeds, one that ended long before it began: what lay
  between them is not written.
- **`npm run world -- lineage <id>`** prints what a record came from, what came of it, and the
  records it is one thing with, which are those joined to it by `continues` in the picture
  asked for (`tools/world/src/lineage.ts`).

No record uses `succeeds` yet: see [Limitations](#limitations).

### Contested, denied, given up, rival

- **Contested:** a `continues` that others reject belongs to an alternative of kind `perspective`.
  It holds, and joins the two records as one thing, only in that picture.
- **Denied:** `against` on a claim or a relation lists the works that deny it, each with its
  locator and quote, as `source` lists those that speak for it. The panel shows them apart
  ("Denied by"), and quote-check checks them.
- **Given up:** `rank: deprecated`, with a note saying when. It binds nothing and stays in the
  record, shown as *set aside*.
- **Rival:** relations of one subject and one type all hold, as the two parents of a union do,
  unless one is ranked `preferred`. Then the others are rivals: they hold only when a reader picks
  one, the solver checks each as it checks a competing claim, and the panel marks them *another
  reading*.

### Spans

`part-of`, `member-of`, `held-office` and `participant` are marked `span: true` in the
vocabulary. Such a relation may carry `valid`: `{ lo, hi }`, either end left out, or one time at
which it held. The solver gives it a start and an end of its own, bounded by what `valid` says,
and keeps them inside the lifetimes of both ends, in place of the rule that a part's whole life
lies inside its whole (`tools/world/src/chronology.ts`). So a span also bounds what has no date
of its own: a union lasted at least as long as its last member was in it. No other relation may
carry `valid`.

A bound is a date, a date in a count of days, or the edge of a record: `{ ref: <record>, edge:
end }`, or `{ ref: "@phase", edge: start }` for a phase of the record itself. A bound that names
a year or a month lies somewhere within it, not at its first instant. A bound that names a record
is that record's start or end in whatever picture is shown, so it moves with a competing date.

### Wars, treaties and who took part

- `event/war`: a war, from its outbreak to its end. It is the first event of people that lasts:
  political events, battles and conquests are moments.
- `event/campaign`: a campaign, an operation or a battle that lasted weeks or months, as a part
  of a war.
- `event/treaty`: a treaty, an armistice, a surrender or an act of union, a moment.
- `participant`: who took part in an event, stored in the event's record, with the side or the
  role in its note and the span it took part for.

### Days by number, and counts of days

- **`JDN 584283`** is a day by its Julian Day Number, as a correlation constant is given.
- **`9.12.11.5.18 Long Count`** is a time value of its own kind: a count, 1,386,478 days after the
  count's zero day. `12.19.13.4.0 Long Count of the era before` is counted back from it. How the
  five places count is in [core/time.ts](../../core/time.ts), as the Julian leap year is.
- **The zero day is a record,** of kind `event/epoch`, with a claim `calendar: long-count`. Its
  `date` has one claim for each correlation, by the method `calendar-correlation`. The solver
  places a date in the count by taking the zero day's date in the scenario at hand and counting
  days on the calendar, so it comes out as one day exactly, and a competing correlation moves
  every such date together.
- **The validator** asks for one zero day for each count, a day and not a range; that some quote
  of a count date has the date as written; and that the vocabulary and the code know the same
  counts.
- **The panel** shows the date as written with the day it comes to, under the correlation picked.

### Bounds and names

- **`end_before`**: an entity or a phase had ended by this time. It is a bound and not a date: it
  holds beside whatever the `end` claims say, in every picture, and does not compete with them.
- **`official_name`**: the name a state gave itself in its laws, with the span it held it. The
  label on the map is its `name`, the short name people use.
- **Names in turn.** Claims of one property that each hold for a span of their own, no two at
  once, do not compete and need no rank; the panel shows them *in turn* and offers no choice
  between them. It goes for any property: the populations of Memphis in 2500, 2000 and 1100 BCE
  are three claims that take turns, where the panel used to offer a choice between them. A
  record's name of today is the one that is still held, or the last.
- **A date in another calendar** is shown as it is written, with its day on the axis:
  "1 May 1707 CE in the Julian calendar (12 May 1707 CE)".

### Sources, and checking quotes

- `type: document` and `kind: act` in [sources.yaml](../../world/schema/vocab/sources.yaml): a law,
  a treaty, a resolution, a judgment or a proclamation, which is itself the act. The fourth slice
  had marked the Res Gestae an eyewitness for want of this. The method `ruling` is for what a
  court or another competent body held, often long after the events.
- **quote-check** takes several `src:… <text file>` pairs in one run. A claim reaches `quoted`
  only when every quote of it, for and against, is found, each in its own source's text; the step
  names every text. `--redo` writes again a step the tool wrote, when a citation was added. A
  quote not found as it stands is looked for once more with the hyphens inside words left out of
  both, for a compound that the text breaks at its own hyphen.

### Another database's cut

A phase may carry `same_as`. The Roman state is one record here and several items in Wikidata.
Its kingdom and republic are the same things as two of them, and now say so. Its empire is not:
Wikidata's Roman Empire has three dates of dissolution (395, 476 and 1453) and its Byzantine
Empire four of inception (285 to 395). That is the same dispute, held there as several values
of one item and here as phases with competing ends.

### The map of states

- **The dataset's rows all stay in the map of states.** A row that a record draws as its
  territory is marked with that record (`claimedBy`, `tools/world/src/build/layers.ts`), and the
  viewer leaves it out only while the record holds, at the time and in the picture shown
  (`statesAt`, [core/layers.ts](../../core/layers.ts)). Before the record begins there, and after
  it ends, the row is the dataset's again.
- **No state is dropped.** Of the records' territories that hold at a time, three are drawn in a
  colour of their own: the record that is open, then the largest (`drawnFirst`,
  [core/territory.ts](../../core/territory.ts)). The others are drawn among the states, under
  their records' names, and a click on one opens its record.
- **The panel** shows a relation's span, marks one that was set aside or is another reading, says
  what denies it, and shows a relation of an alternative only in that alternative's picture, from
  either end.

### What the validator says

- A picture that does not hold is reported once, as that picture's, and not again on every pick
  that leaves its fault alone.
- A report with errors names the checks that did not run because of them.
- Dates within history are given as calendar days, and gaps under a year in days.

## Decisions

1. **The cases first, then the engine, then the cases again.** Each case was written by an agent
   that was told to write what the sources say and to report what it could not write, not to
   work around it. The engine was changed between rounds, and the records rewritten to use what
   it had learned to say.
2. **Lineage is stored in the later record.** It knows its ancestors, and an older record need
   not be edited when a successor is written.
3. **A split and a union are shapes, not types.** Both are `arose-from`; the graph, and the
   parent's own end, say which.
4. **`continues` binds only the end.** The heir outlasted what it carries on. It need not be the
   younger: Russia is older than the Union it continues.
5. **The shape of a record is a claim of identity that nothing can contest.** Rome is one record
   to 1453, which builds Constantinople's view into the record's id; the western claim is a
   relation and can be contested. So where identity is in dispute, write two records and join
   them by `continues`, in a perspective if it is contested. One record with phases is for an
   identity nobody disputes.
6. **A denial is a citation, not a claim.** `against` keeps both sides of a dispute on the one
   relation they are about. A competing claim would need something to assert, and "it does not
   continue" asserts nothing the solver could use.
7. **Rivals by rank.** Relations took the rank that claims already had, with the same meaning,
   rather than a field of their own.
8. **A span's bounds may be other records' edges.** A copied date is a derived value stored, and
   wrong under every competing date but one.
9. **The arithmetic of a calendar is code; its correlation is a claim.** How the places of the
   Long Count add up is not in dispute, and is in `core/time.ts` beside the leap year. Which day
   it counts from is, and is a record.
10. **Participants are written in the event.** A war lists who fought in it; a state does not
    list its wars.
11. **The dataset is never edited by a record.** A record's claim on a row marks it; it does not
    take it away. What the dataset says is always there to be drawn when no record holds.
12. **Records for what was only referred to.** The world's own test allows no reference to a
    record that does not exist, so the seven things the cases point to have records with a name,
    a summary and, where one item is the same thing, a Wikidata id.
13. **Older claims gained `quoted` steps.** quote-check, run over the texts kept for this slice,
    found the quotes of earlier claims that cite the same sources, and recorded that: in eleven
    records the cases did not otherwise touch, and on older claims of those they did. No step
    that was there before was changed.

## Limitations

What the cases showed and this slice did not mend. Most of it is work for the slices that come
next.

**Pictures**

- **A perspective has no time, and no holder.** The Federal Republic of Yugoslavia claimed to be
  the old federation from 1992 to 2000; East Germany's court held in 1951 that the Reich had
  ended, and that state acceded to the other in 1990, under the other's Basic Law. Who held a
  view, and from when to when, is prose, and a contest that ended cannot be said to have ended.
- **An alternative can add, and never take away.** A perspective cannot switch off a relation of
  the default picture, say that in it two records are one, or hold a record that exists only in
  it. So *translatio imperii* shows two Roman empires at once, not an empire moved; and where the
  Yuan continues the Mongol Empire it also still arose from it.
- **A competing claim moves one date and carries nothing with it.** Under the 1937 start the
  world war still takes in the war in China only in 1941, and nobody fights in it before 1939.
  That reckoning should be a perspective; it is a competing start. A relation cannot depend on
  which competing claim is picked.
- **Two cuts of a record are not two values.** The Holy Roman Empire from 800 or from 962, the
  Chagatai ulus of 1227 or the khanate of the 1260s: phases, offices, territory and ids cannot
  follow the choice of a start.
- **Rivals are of one type.** "It arose from it" against "it continues it" are relations of two
  types, and are not rivals. "One or the other, the sources do not say which", as of Maya writing
  from Olmec or Zapotec, is written as two relations that both hold.
- **A continuity has no scope.** Russia continues the Union in its seat and its treaties; its own
  constitution tells the successor on its territory from the continuator abroad.

**Time**

- **A first find is written as a start.** A script, a city or a people begins, in its record, at
  its first attestation, so lineage can only be slack or contradict it: a daughter script may be
  attested before its mother. A taxon's oldest fossil bounds its origin from above; the same is
  wanted here (`start_before`, and its three siblings).
- **A day has no clock and no place.** The German surrender took effect at one minute, which was
  8 May in Berlin and 9 May in Moscow: it is three competing dates, one of which must be
  preferred though nothing is in dispute. Adjacent days touch at midnight, so a contradiction of
  a day can be squeezed to an instant.
- **The centred check fails where a year meets a day.** A span or an end given to the year, beside
  one given to the day, can fail the solve at best estimates though its bounds hold.
- **Old Style dates must say so.** A date between 1582 and a country's change of calendar that
  does not name the Julian calendar is read as Gregorian, with no warning. A year that began on
  25 March cannot be said.
- **Other calendars.** Chinese era dates (the Yuan shi dates to the day), the Japanese era, the
  Hijri calendar, the Calendar Round and distance numbers are not read. A date known only as a
  position in a cycle has no value to hold it.
- **Evidence for a correlation is not evidence here.** A record dated in both calendars does not
  bound the zero day: inference runs from the zero day to the dates only.
- **An end that is a process.** A dissolution over months is written as a range, which reads as
  doubt about an instant. The three ends of the world war are ends of different kinds, and
  compete as if they answered one question.

**Kinds and relations there are none of**

- **An office or an institution.** The quarrel between the two empires was over an office;
  `held-office` runs from a person to a state. A dependent office, a style and a regnal number
  (James VI and I) have no home.
- **An alliance, and sides.** Who was on which side of a war is a note. Being at war is between
  two states, and `participant` is not.
- **Allegiance.** What nearly every source says of the Mongol states after 1260 lies between
  part and nothing. The borders dataset has 385 rows for such relations (allegiance, alliance,
  vassalage, personal union), drawn as if they were states, which no relation here can adopt.
- **An organization,** so a seat at the United Nations cannot be written.
- **Legal succession.** `succeeds` reads as it, and both German courts deny it in terms; no
  record uses the relation yet.
- **A revival** after a lapse; a state that ends and lives on as a country, as Scotland did; a
  sister script with an ancestor nobody has found; what a script took from another.

**The records**

- **Nobody has read them.** Every claim is a machine's and `proposed`. Their quotes were checked
  against the texts by script; no second reader has re-read a source, and the translations in the
  notes are the agents' own.
- **What could not be reached** is said in each source's `verified` note and in
  [RECORD-SETS.md](../RECORD-SETS.md): among it the judgments of the International Court of
  Justice, General Assembly resolution 47/1 itself, Naveh on the alphabet, and any modern
  reference work on the Soviet Union's end.
- **Two ways to write an office.** The 42 earlier rulers hold office through reign phases; James
  holds three by spans. Names whose spans are tied to phases still need one ranked preferred.
- **Gaps.** Germany from 1945 to 1949, East Francia, the kingdom of Yugoslavia and the Union's
  other republics have no records. The seven records with only a name have no dates.
- **The rules do not decide every case.** Whether a renamed or divided state is one record or
  two (the United Kingdom in 1927, the Chagatai Khanate in the 1340s) was settled case by case.

**The map**

- **Today's map takes over in 1950.** The borders dataset runs to 2024, but from 1950 the globe
  draws today's borders, so the Soviet Union's last forty years, Yugoslavia and the two Germanys
  are never seen. Record territories stop there too.
- **The dataset cuts differently, and has errors.** Scotland vanishes in 1609; "Kingdom of Great
  Britain" runs to 2024; fifteen rows named Golden Horde lie in Mongolia in 1547–1695. None was
  corrected here or reported upstream: they are listed in [RECORD-SETS.md](../RECORD-SETS.md).
- **A state made of states.** The Holy Roman Empire's row lies under its members' rows, which
  the dataset draws too: a click inside it finds a member, and a member's name may be drawn
  over the empire's.
- **Relations drawn as states.** The dataset's rows for an allegiance or an alliance are drawn as
  outlines among the states, over the land of the records they are about.

**Tools**

- The viewer shows no `same_as`. Search does not find a dataset's rows.
- quote-check proves a quote is in the text kept, not that the text is the document: a PDF's
  columns may be set into one another. It does not check locators.

## How it was checked

All of it here, in the session that made it.

- `npm run typecheck`; `npm test`, 546 unit tests, 62 of them this slice's; and `npm run validate
  -- --verbose`: no errors and no warnings over 3,309 entities, 15,285 claims and 1,454 sources,
  and no reference to a record nobody wrote. Of its 25 notes, three are of the new kind: the two
  German states began four years after the Reich ended, and the Holy Roman Empire 112 years after
  the kingdom of the Franks. 428 claims and relations are `quoted`, 222 more than before.
- A full build and its 80 tests, and the build made again and compared in meaning
  (`npm run test:reproducible`). The first such run differed in one thing, the commit a build
  records, because the slice's commits were made while it built; run again with nothing
  changing under it, it passed.
- The browser tests, in software WebGL as CI draws them: the globe group whole, 94 tests with the
  six of `identity.spec.ts`, and the city group, 33. All passed. The city-views group, Rome at
  full quality, was not run: nothing it draws was touched.
- **The first commit alone,** the engine with the world as it was before the cases: it
  typechecks, validates as the world did before, and passes the same unit tests.
- **The sources.** 140 sources are quoted by the claims the slice adds or cites anew, 129 of
  them new records. Every quote of every one was found by script in a text kept from its fetch,
  after the normalizing quote-check does. 138 of those texts have the record of their fetch
  beside them (the URL, the time, a checksum); the two others were joined from parts that have.
  One source from each of the 48 hosts was then fetched again from the URL in its record: all 48
  held the same quotes, 37 of them byte for byte. Each of the 32 Wikidata ids on the new records
  and phases was looked up again and held against its record's name, and what
  [RECORD-SETS.md](../RECORD-SETS.md) says of the borders dataset was counted in the dataset
  itself.
- **Looked at,** by an agent: the panel's text for Pakal under each correlation, the two
  empires from either end in both pictures, the war and James; and screenshots taken on the GPU
  of Eurasia in 1300 CE, the same with the Chagatai Khanate open, Europe in 1940, and Europe in
  950 CE in both pictures of the Roman succession. Looking found what the tests had not: names
  that follow one another were headed "competing claims", with a choice to make between them;
  a span that ended at a surrender read "the start of German Instrument of Surrender"; and a
  test of the build and one of the browser took it that no state but Rome had a record in 1460.
  Each is mended, and the first two have tests. It also found a member's name drawn over the
  empire's, and the dataset's rows of allegiance drawn over the records' land: both are among
  the limitations.

A person has not looked at it, and no second reader has re-read a source.

## Next

Three slices follow from this one, each on its own branch:

- **Search reads rows.** The borders dataset names more than 1,600 states and the lists 1,750
  cities, and none can be found by name. With that, the world has a named skeleton of
  civilization from end to end before any more of it is researched.
- **The Second World War, as a probe of density:** days and hours, alliances and sides, hundreds
  of events inside events, borders that move by the week; and the map of 1950 to today.
- **Tenochtitlan, 1519–1521, as a probe outside Europe:** two sides' accounts of the same events,
  a calendar of cycles, a town that merged into a city, and a state no dataset draws.

And in the engine, from the limitations above, in the order the cases asked for them: dated
perspectives; an alternative that can take away; bounds on a start; an office as a kind;
allegiance; the clock.
