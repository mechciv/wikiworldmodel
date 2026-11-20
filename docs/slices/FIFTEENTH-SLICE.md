# Fifteenth slice: Tenochtitlan, 1519–1521

Status: built and passing its tests. The second of two probes ([TWELFTH-SLICE.md](TWELFTH-SLICE.md), Next): a case
outside Europe, thinly and one-sidedly documented, to find out what the model assumes without saying. The conquest of
Tenochtitlan is told by two sides whose sources were written down at different times and for different ends, in two
calendars, about a city that was destroyed and rebuilt, a twin town taken into it, an alliance that is also called an
empire, a state that fought on both sides, and a company whose authority was its own invention. What the sources say
was written; the engine was mended where a finding recurred or cost the case its meaning; what it still cannot say is
in [Limitations](#limitations).

It adds:

- **Days named in cycles.** A Mexica date, `1 Coatl in the year 3 Calli`, names not one day but every day that bears
  those names, one or two in each 52 years. It is read as a set of candidate days, which the rest of the evidence
  narrows: it holds beside the other side's date instead of competing with it, so the two are held against each other.
  Where they disagree the world says so, and by how many days; a correlation that a date given in both calendars
  contradicts is said not to hold.
- **Anchors of a calendar of cycles**: a day whose name in the 260-day count the sources give, and the first day of a
  named year, each a record whose competing dates are the correlations.
- **A lag in days counted on the calendar.** "235 days after the entry" lands on the day, where it used to straddle
  two in a leap year.
- **Who held a perspective, and when**: `holds`, a relation of the holder, sourced and spanned like any. The twelfth
  slice's first wish for the engine.
- **How long after**: every citation of a claim about a moment says how long after it its source was written, from
  the source's own `written`: "written 9 months after", "written 33 to 56 years after".
- **What one source tells of an event**: `account`, a sentence of what happened as a source tells it, so that each
  side's telling is a claim, in its own perspective.
- **Allegiance**: `subject-to`, for a town that paid another tribute and kept its own rulers, a lord who made himself a
  king's vassal, a company that acted in a king's name. Less than part-of, more than nothing.
- **An alliance, an organization, a massacre**: `polity/alliance`, `organization` and `event/massacre`, kinds the
  case needed and the vocabulary had none of.
- **Houses counted**: `houses`, a settlement's houses or householders as a source counts them, apart from estimates of
  its people.
- **The case:** 25 new records, a group of two perspectives, and 37 new sources. Every quote the records make, 166 of
  them, was checked by script against the text it was read in.

## Running it

As for the other slices (see the [README](../../README.md)). Nothing new is fetched.

```sh
npm run world -- claims people/conquest/entry-into-tenochtitlan   # the Spanish date, and the two native dates set aside
npm run validate -- --verbose | grep -i "set aside\|names [0-9]* days"   # how far each native date is from the rest
npm run world -- dwellings-wanted --region 23                       # Central Mexico, now with a tradition at 1500
```

In the viewer, with `npm run dev`:

- `?sel=people/conquest/fall-of-tenochtitlan&t=1521.62&lat=19.45&lon=-99.14&d=2.2`: the Spanish date and Book 12's,
  side by side, the one in cycles with the day it comes to, and how long after each source was written.
- `?sel=people/conquest/entry-into-tenochtitlan&t=1519.86&lat=19.43&lon=-99.13&d=2.2`: two native dates that disagree
  with the Spanish one, kept, set aside, with the nearest day of each name.
- `?sel=people/conquest/death-of-moctezuma&t=1520.49&lat=19.43&lon=-99.13&d=2.2`, then the same with
  `&alt=alt:conquest-accounts/mexica` and `&alt=alt:conquest-accounts/conquerors`: each side's telling, held by whom.
- `?sel=people/cities/tlatelolco&t=1500&lat=19.45&lon=-99.14&d=2.2`: a town taken into a city, which goes on.
- `?sel=people/conquest/conquest-of-mexico&t=1520&lat=19.4&lon=-98.8&d=2.6`: Tlaxcala on both sides.
- `?t=1500&lat=19.425&lon=-99.14&d=1.0000188&h=40&v=74`: the city on the ground in 1500, its houses drawn from the
  new tradition (and on dry land: see [Limitations](#limitations)).

## The case

The sources were read by three agents of their own, each keeping its texts: the Spanish side (Cortés's letters in the
Mexico edition of 1870, checked against its page images, and Bernal Díaz in the 1862 reprint of the 1632 text and in
Lockhart's English of 1844); the Nahua side (Book 12 of the Florentine Codex, its Nahuatl and Sahagún's Spanish, in
the transcriptions the Getty's Digital Florentine Codex serves, Sahagún's Spanish of other books in Kingsborough's
edition, and the calendar papers of *Estudios de Cultura Náhuatl*); and the city and its neighbours (Gómara, the
Anonymous Conqueror, Durán, Torquemada, Ixtlilxóchitl, the Codex Mendoza's commentary, Muñoz Camargo's history of
Tlaxcala, and open-access modern studies of the city's size, Tlatelolco and the alliance). The records were written
from their evidence.

| Part | Records | What is hard about it | How it is written |
|---|---|---|---|
| The city | `people/cities/tenochtitlan` | One record or two, through a conquest, a destruction and a renaming | One settlement, from about 1325, in two phases: Mexico Tenochtitlan, and Mexico rebuilt under the Spaniards from the fall. Names in turn, Tenochtitlan then Mexico City. Its altepetl is another record |
| A town taken in | `people/cities/tlatelolco`, `people/polities/tlatelolco`, `people/conquest/conquest-of-tlatelolco` | `merged-into` says the town ended; it went on | The town is `part-of` the city from the conquest of 1473, and has no end; it `arose-from` the city by the tradition of a split, with Gómara and the archaeology cited against it. The altepetl is `subject-to` Tenochtitlan from 1473 to 1521, in three phases: kingdom, tributary, Santiago |
| The war | `people/conquest/conquest-of-mexico` and six events | A war of a company and its native allies against an alliance; a state on both sides | Starts 10 February 1519 (the sailing); Book 12's reckoning, from Toxcatl, kept and set aside. Ends with the fall. Seven participants, Tlaxcala twice, Texcoco on the side it was not a member of |
| The states | `triple-alliance` (`polity/alliance`), `tenochtitlan`, `texcoco`, `tlacopan`, `tlaxcala`, `crown-of-castile`; `people/organizations/cortes-expedition` | No kind for an alliance or a company; a state no dataset draws | The alliance with its three members, its territory the dataset's rows; the expedition `subject-to` the Crown in every telling, through whom disputed; Tlaxcala `subject-to` the Crown from the peace, as Cortés has it |
| Two sides' accounts | `alt:conquest-accounts`, its two perspectives; `account` claims on the massacre at Toxcatl and Moctezuma's death | Who tells what, and when it was written down | Each side's telling in its own perspective; the default picture keeps what both say. Held by Cortés (1520–1524), Bernal Díaz (1568) and Tlatelolco (1555–1565) |
| The calendar | `people/calendars/tonalpohualli-anchor`, `xiuhpohualli-anchor` | A date in cycles is not a count | 1 Coatl = 13 August 1521, Caso's, with Kirchhoff's denial cited against it; the year 3 Calli from 2 February 1521, Sahagún's, the only Julian new year a source gives |
| The people of the city | `population`, `houses` and `settlement_area` claims on the city | Estimates tenfold apart | Eight estimates, seven of 1519 and Chandler's of 1520, 60,000 to 700,000, each with its method, Calnek's 150,000–200,000 preferred; 60,000 houses or householders and 120,000 houses; 9.44 and 13.5 km² |
| Houses | `people/traditions/tenochtitlan-house-plot` | 19.3 million people of Central Mexico in 1500 drawn with generic houses | Calnek's house plot, as Valero reports it, with the chroniclers: one room, adobe, flat roof, a compound round a patio, chinampas behind |
| People | `people/rulers/moctezuma-ii`, `people/persons/hernan-cortes`, `people/persons/bernal-diaz-del-castillo` | | Moctezuma's reign ends with his death, whichever telling; the two writers for the perspective they held |

## What broke

### Before anything was changed

The case was first written against the world as it stood. This is what it said:

| What | What the engine said |
|---|---|
| A date in the Mexica calendar, `1 Coatl in the year 3 Calli` | not a time |
| The same day given by both sides, as two `date` claims | competing claims, one of which must be preferred: the two sides' dates could not be held against each other, only chosen between |
| A town taken into a city, `merged-into` | the town ended: its end was the merge, and Tlatelolco had no record left for the last stand of 1521 |
| A tributary that kept its own governors | nothing between `part-of`, which takes it in, and no relation |
| The Triple Alliance, the expedition, the killing at Toxcatl | unknown kinds |
| How Moctezuma died, as each side tells it | no property for what happened |
| Who held each telling, and when it was written down | prose, in a perspective's description; a source's `written`, shown apart from the claims it supports |
| Book 12's count of the days from the entry to the killing | a lag in days, carried as years of 365.25 days, straddling 21 and 22 May 1520 |
| Sixty thousand houses | a population, or nothing |

### While it was mended

- **Two days that touch are one instant.** A native date one day off the Spanish one was found to agree with it: two
  whole days meet at midnight, and the solver forgives a thousandth of a year. A day named in cycles is held at the
  middle of its day, so that a day's disagreement shows.
- **A world without a vocabulary.** The atlas's tests build worlds of records alone; telling a date in cycles from
  other claims read the vocabulary, and failed there.
- **The year count's arithmetic is contested.** The twelfth slice put a calendar's arithmetic in code and its
  correlation in records. For the Mexica year that line does not hold: whether leap days were counted, which day named
  the year, and which month began it are as disputed as where it met ours. The code counts 365 days with no leap day,
  Caso's rule and Motolinía's; the others are told in the anchor's note.

### What the case showed

| What the case showed | Where | Mended as |
|---|---|---|
| A date in cycles names many days, and the rest of the evidence picks one | the fall, the entry, Tlatelolco, the alliance | a set of candidate days, read in the window the rest leaves, holding beside the other dates |
| The two sides' dates for one event could not be held against each other | the fall, the entry | a date in cycles never competes; where it names none of the days allowed, the world fails, and a note says by how far |
| Evidence ran from a correlation to its dates only | the fall | a correlation under which a double date disagrees is said not to hold |
| Book 12's day for the entry is nineteen days from the Spanish one, the Anales de Tlatelolco's one day | the entry | kept, set aside, with the nearest day of each name in the panel and the validator's notes |
| Ixtlilxóchitl dates the conquest of Tlatelolco to 1463 and names the year 7 Calli, which is 1473 | Tlatelolco | the year name, held beside, sides with his editor's correction |
| Counts of days from a dated day straddled two days | Toxcatl, the flight; the twelfth slice's Long Count written as a lag | a lag in days from a day is counted on the calendar |
| A town taken into a city does not end, nor does a tributary that keeps its rulers | Tlatelolco | `part-of` from then; `subject-to`; `merged-into`'s own example corrected |
| Whose authority a company acted under, a lord's vassalage, a town's tribute | the expedition, Tlaxcala, Tlatelolco | `subject-to` |
| No kind for an alliance, a company or a massacre | the alliance, the expedition, Toxcatl | `polity/alliance`, `organization`, `event/massacre` |
| What happened, as each side tells it, had no value | Toxcatl, Moctezuma's death, Moquihuix's | `account` |
| Who held a perspective, and when, was prose | the accounts; Germany and Yugoslavia before | `holds`, from the holder, with its span |
| When a source was written mattered and was not said beside the claim | every claim of the case | how long after, on each citation |
| Houses counted are not people counted | the city | `houses` |

## Pass criteria

| Criterion | Where it is checked | Result |
|---|---|---|
| A day named in cycles is read, and what is not one is refused | `tools/world/test/conquest.test.ts`: a day named in cycles | `1 Coatl`, `the year 3 Calli`, `1 Coatl in the year 3 Calli`; the years in turn, 1 Acatl to 4 Tochtli; 14 Coatl and the year 3 Coatl refused; not a bound of a span |
| It names a set of days, one in every turn of its cycles | the same | 1 Coatl every 260 days; in the year 3 Calli once, in 2 Tecpatl twice; a year named alone is the year; nothing without an anchor |
| It needs an anchor for each cycle it names, and an anchor names its own day | the same | errors for each missing anchor and a nameless one |
| It holds beside the other side's date and does not compete | the same; `tools/world/test/world.test.ts`: the conquest of Tenochtitlan | two date claims, no rank, no error, no pick; the fall on 13 August 1521 |
| It dates what the other side does not, within the rest of the evidence | `conquest.test.ts` | a raid in a war, on the two days of its name the war allows, and a note saying so |
| It says so where nothing else dates the thing closely enough | the same | a warning |
| Two sides' dates for one event that disagree make the world fail, by a day if need be | the same | an error naming 8 November and the nearest 8 Ehecatl, 9 November |
| It follows the correlation chosen, and a correlation a double date contradicts is said not to hold | the same | the raid moves a day with the correlation; the other correlation is a warning |
| It is copied as the source gives it | the same | a quote that names none of its signs, in any of their spellings, is a warning |
| It dates a moment, a start or an end, and nothing else | the same | `earlier_than` refused |
| A lag in days from a dated day is counted on the calendar | `tools/world/test/identity.test.ts`: a date in a count of days; `world.test.ts` | 1,872,000 days from the Long Count's zero day is 21 December 2012, as the count is; from a year it is still carried in years; the killing at Toxcatl is on 21 May 1520 |
| A citation says how long after its source was written | `conquest.test.ts`: when a source was written; `tools/world/test/build.test.ts`: the conquest of Tenochtitlan | weeks, months, years, a range, before, at the time, and a year rather than twelve months; the fall's two sources 9 months and 47 years after |
| A perspective is held by someone, for a span, in every picture | `conquest.test.ts`: who held a perspective; `build.test.ts` | a relation of the holder that binds no dates; it names a perspective and holds in every picture; the build lists the holders of each |
| A subject is held to its lord for the span it was one; an alliance, a massacre and a company are known | `conquest.test.ts`: allegiance, alliances, massacres and companies | a span outside the lord's lifetime fails; a massacre is a moment |
| The world holds the conquest as both sides date it | `world.test.ts`: the conquest of Tenochtitlan | the fall's two dates agree; Book 12's entry is 19 days off and the Anales' 1; 7 Calli is 1473 and 1463 does not hold; Toxcatl and the flight counted from the entry; Tlatelolco has no end and is part of the city; each telling only in its picture, and its holders |
| The build carries it | `build.test.ts`: the conquest of Tenochtitlan | the date in cycles with its day, beside; how long after; who held what; the alliance's twelve rows its own |
| The viewer shows it | `viewer/test/e2e/conquest.spec.ts` | both dates of the fall, not a choice, with how long after; the native dates of the entry set aside with their nearest days; each telling only in its picture, with who held it; Tlatelolco part of the city and subject to Tenochtitlan; Tlaxcala twice in the war |
| The world itself holds | `world.test.ts` | no errors, no warnings, no reference to a record nobody wrote |

## What was built

### Days named in cycles

[core/time.ts](../../core/time.ts) has `CYCLES` beside `DAY_COUNTS`: the 260-day count, `tonalpohualli`, thirteen
numbers and twenty signs advancing a day at a time; and the count of years, `xiuhpohualli`, years of 365 days named by
thirteen numbers and four bearers, Tochtli, Acatl, Tecpatl and Calli, advancing a year at a time. A date is a day name,
a year name, or both: `1 Coatl`, `the year 3 Calli`, `1 Coatl in the year 3 Calli`. `cycleDays` lists the days such a
date names between two day numbers, given each cycle's anchor.

- **Anchors** are records of kind `event/epoch` with a `calendar` claim naming the cycle and a `day_name` giving its
  day's name in it, `1 Coatl` or `the year 3 Calli`; their competing `date` claims are the correlations, as the Long
  Count's zero day's are. The kind's label is now *Day that anchors a calendar*.
- **The solver** ([tools/world/src/chronology.ts](../../tools/world/src/chronology.ts)) solves each picture without its
  dates in cycles, reads each such date in the window that leaves its point, and adds it: one day, held at the middle
  of the day; several, the span from the first to the last; none, the nearest day of that name, which then contradicts
  the rest and is reported with it. A date in cycles is kept in its group's `beside`, not among the claims that compete,
  so it is never picked and needs no rank; set aside, it binds nothing.
- **The validator** asks for an anchor for each cycle a date names, a day name of its own cycle on each anchor, a quote
  that names the signs (in any of the spellings the sources use, Nahuatl or Spanish), and a moment, a start or an end to
  date. It warns where nothing else dates the thing closely enough to name one day, notes where several days remain, and
  notes, of one set aside, the nearest day of its name and how far.
- **The panel** shows it as written, with the day it comes to, `1 Coatl in the year 3 Calli (13 August 1521 CE)`, a
  badge *named in cycles*, and no radio button: it is not a choice. Under each competing correlation its day is the
  day under that one.

### A lag in days, on the calendar

A date written as so many days after another record's start or end is counted on the calendar, day for day, where that
start or end is dated to a day by its own chosen claim; elsewhere it is carried in years, as before. A pick of the day
counted from is solved whole. This mends what the twelfth slice found of a Long Count date written as a lag from the
zero day, which landed days away: 1,872,000 days from it is now 21 December 2012, as the count is.

### Perspectives held, and how long after

- **`holds`**: the subject held a perspective, an alternative of kind perspective, for the span its `valid` gives. It
  binds no dates, holds in every picture, and is quote-checked like any relation. The build lists each perspective's
  holders in the tile set, and the panel names them where a chosen perspective touches the record open: *In the
  alternative "As the Mexica told it", held by Tlatelolco (1555 CE – 1565 CE)*. The menu of alternatives says so too.
- **How long after**: each citation of a claim about a moment, or about a start or an end, carries how long after it
  its source was written (`after` in the build's records), from the source's `written` and the moment's best date.
  The panel shows it after the locator, and shows two quotes from one place of one work as one citation.

### Terms

| Term | What |
|---|---|
| `polity/alliance` | states bound to act together and named as one; its members `member-of` it; its territory a claim |
| `organization` | a body that acted as one and was not a state: an expedition, a company, a council |
| `event/massacre` | a killing of those not fighting; the kind takes the historians' word, the sides' accounts are its claims |
| `subject-to` | allegiance kept with rulers of one's own: tribute, vassalage, a company in a king's name, for a span |
| `holds` | who held a perspective, and when |
| `account` | what happened, in a sentence, as one source tells it |
| `houses` | houses or householders as a source counts them |
| `calendar: tonalpohualli`, `xiuhpohualli`; `day_name` | the cycles and their anchors |

`merged-into` no longer gives "a village taken into a city" as its example, and says what to write for a town taken
into a city and a state made a tributary.

## Decisions

1. **One record for the city.** Section 4.2's rules decide it once a city is taken apart into what it is: a
   settlement, a place and its people, and the bodies that governed it. The settlement is one record, as its sources
   treat it: Cortés found the city destroyed, chose to settle it again because it was famous, and wished it rebuilt;
   its people rebuilt their own part; the list of cities has one row from 1500 to 1975. The rule for a state founded
   anew by an act applies to the Spanish town council, which is not written, and the altepetl is its own record, which
   went on under the Spaniards. Wikidata cuts the city in two at 13 August 1521, and its item for Mexico City carries
   both 1521, preferred, and 1325 as its inception: the same question, held there as two values.
2. **A town does not merge.** Tlatelolco went on as a ward of the city, a native town, and a district today; its
   rulers became tributaries and recovered their lordship under the Spaniards. `merged-into` would have ended both, as
   Wikidata's item does.
3. **A date in cycles holds beside, never competes.** It names a set of days; the other side's date names one; both
   are evidence of the same day. Competing, they could only be chosen between; beside, they test each other, and a
   correlation with them.
4. **One day held at its middle.** A day's disagreement must show, and the solver forgives less than half a day only
   at a point.
5. **Set aside what the engine cannot hold, and say so.** Book 12's day for the entry is wrong by Caso's reckoning; the
   Anales de Tlatelolco's is wrong only because a day here has no clock; the Mexica reckoning of the war's start fails
   only because a competing start carries none of the war's parts. All three are kept, ranked deprecated, and each note
   says which.
6. **Each side's telling in its own perspective; the default picture keeps what both say.** Neither telling is
   preferred: the default picture has no account of how Moctezuma died, only that he died in the Spaniards' hands
   between Cortés's return and the flight.
7. **The holder of a perspective is a relation of the holder**, not a field of the alternative: who held a view is a
   claim, with sources and a span, and quote-checked.
8. **How long after is derived**, from the source's `written` and the moment's date, and never stored.
9. **The only Julian new year a source gives anchors the year count.** Sahagún's 2 February, which his own book applies
   to the year after the flight. Caso's correlation of the years is a rule, not a day, and is told in the note.
10. **Source records without the agents' prefixes.** The three research agents kept their texts under prefixes
    (`es-`, `na-`, `city-`); the source ids drop them.

## Limitations

**Calendars**

- **The arithmetic of the year count is contested,** and is code: 365 days with no leap day, the year named for no day
  in particular. Sahagún's fixed table needs a leap day; Tena names the year for its 80th and 340th days; Johansson
  has the first month slide every four years. A rule cannot compete with a rule; the record says so.
- **Months and festivals are not read.** Toxcatl, Tecuilhuitontli, "the eve of the 10th of Quecholli": a day of the
  365-day year by its month needs the month that began the year, which is disputed.
- **A day has no clock.** Caso keeps the Anales' 8 Ehecatl if the Mexica day ran from noon to noon; the world cannot
  say when a day began, and sets it aside. (The twelfth slice found the same of the German surrender.)
- **Two counts cannot be said to be one.** The Mexica and Maya 260-day counts agree day for day only under 584283,
  which is Thompson's argument for it; the world cannot join the two anchors, so a Mexica double date does not bear on
  the Maya correlation, and the agreement is a note.
- **A date in cycles cannot follow a rival.** Ixtlilxóchitl's 4 Acatl goes with his 1431, which competes with 1428:
  it holds beside whichever start is chosen, so it is set aside, and does not come back when 1431 is picked.
- **A date in cycles is read in its picture's window.** A pick that moves a thing by more than a turn of its cycles
  keeps the day the picture found, and fails.
- **The year anchor's day is Sahagún's.** Under Caso's correlation the same new year fell some days later; no source
  read gives his day.
- **A count of days from a day dated through another record is still carried in years.** The three reigns already
  in the world that end so many days after they began start at a predecessor's death or in a year, and are not
  counted on the calendar: Didius Julianus's 65 or 66 days from Pertinax's death on 28 March 193 span 31 May to 2 June,
  where the calendar gives 1 or 2 June.
- **A date in cycles is named as what dates the rest.** Held at the middle of its day, it binds more tightly than the
  whole day the other side gives, so what follows from the fall, such as the alliance's end, lists the Mexica date and
  its anchors as what it was derived from, and not the Spanish date that agrees with it.

**Pictures and relations**

- **A competing claim still carries nothing with it.** The Mexica reckoning of the war, from Toxcatl, leaves the
  entry and the war with Tlaxcala parts of a war not yet begun; it is set aside. (The twelfth slice's 1937 start.)
- **An alternative still cannot take away.** No perspective can hold the Mexica reckoning with its parts removed.
- **Sides are notes.** Tlaxcala takes part twice; Texcoco is a member of the alliance and fights on the other side
  in 1521; the war's sides are not records, since no source names the Spaniards' allies as one.
- **Through whom.** `subject-to` says whose authority a company acted under, not through whom: Velázquez's commission
  or the council of Vera Cruz's election is the dispute, and it is a note.
- **Forced preferences.** Of five tellings of Moquihuix's death, three are written as competing claims and two are in a
  note, and one must be preferred; the rule chose the one two sources share. A source with two voices, Book 12's Nahuatl and Sahagún's Spanish, which disagree on the funeral
  and the days of friendship, is one source record.
- **A source's kind.** Bernal Díaz took part and wrote forty-seven years later: `eyewitness` says "at the time or soon
  after", and his record says so in its reliability.

**The records**

- **Nobody has read them.** Every claim is a machine's and `proposed`. Their quotes were checked by script; no second
  reader has re-read a source, and the English in the notes is the agents'.
- **Second-hand.** Calnek, Sanders, Soustelle, Gibson, Rojas, Caso's book of 1967, Tena, the Anales de Tlatelolco and
  Chimalpáhin were not read; what they say is quoted from those who quote them, and each claim says so.
- **The house is a city's, drawn over a region.** The tradition rests on Calnek's model as Valero reports it and on the
  chroniclers; its start is the record's choice, unsourced, and it is drawn over all of Central Mexico, which holds the
  Basin, Morelos and Tlaxcala. Smith's excavated houses of Morelos, with their sizes, were scans with no text.
- **The landscape draws Chandler's city.** The human landscape draws 80,000 people for the city in 1500 and 1520 from
  the list of cities, near the low end of the estimates the record holds; the lists' rows are not claims yet.
- **Not written:** the Cholula massacre, Otumba, the smallpox and Cuitlahuac, Cuauhtemoc, the founding of
  Tenochtitlan as a year in cycles (2 Calli), the Spanish town council of Mexico, and Villa Rica de la Vera Cruz,
  which Wikidata has no item for.

**The map and the scene**

- **The borders dataset misplaces the Basin's states.** It takes Tlaxcala into the Triple Alliance from 1450, and its
  first row of the alliance, 1429–1439, leaves out Tenochtitlan itself. Its Tenochtitlan, 1326–1428, lies east of the
  lake and holds none of the Basin's towns; its Texcoco lies south of the lake, holding Chalco and Xochimilco. It draws
  the Crown of Castile only to 1515. No record can cut a hole in a row, or move one: the territory claims' notes say
  so, and [RECORD-SETS.md](../RECORD-SETS.md) lists them.
- **The lakes are not there.** The ground and its water are today's, so the city's houses stand on dry land among
  pines, where the lake and its chinampas were. No record or dataset here gives the lakes of 1519.
- **The scene's animals are the Pleistocene's.** At 1500 CE the scene of the Basin draws glyptodonts, a pampathere and
  a ground sloth: its list of taxa there runs from the Chibanian to the Meghalayan. This slice did not touch it.

## How it was checked

All of it here, in the session that made it.

- `npm run typecheck`; `npm test`, 593 unit tests, 23 of them this slice's; `npm run validate -- --verbose`: no errors
  and no warnings over 3,334 entities, 15,404 claims and 1,491 sources, plate frames included, and no reference to a
  record nobody wrote. 522 claims and relations are `quoted`, 93 more than before.
- **The sources.** 37 new source records. Every quote the new records make, 166 of them over 40 sources, was found by
  `npm run world -- quote-check` in the text kept from its fetch, with the record of each fetch beside it; Torquemada's
  six pages were joined into one text. The agents also checked every quote of their evidence files by script (389 in
  all), Cortés's against the page images of the 1870 edition as well.
- **A full build** (`npm run build:world`, 3,334 records in 530 MB) and its tests (`npm run test:build`, 84, four of
  them this slice's).
- **The browser tests** of the globe group, in software WebGL: 98 of 99 pass, this slice's five among them. The one
  that fails, `viewer.spec.ts`'s search for "south-central", fails without this slice too, which touches neither the
  search nor the records it finds: the search splits a name at its hyphens, so "south-central Africa" is not found by
  its name, and Çatalhöyük, "in south-central Turkey", is found by its summary. One golden file changed,
  `today-markers.json`: Mexico City and Tlatelolco exist today and are in the view, so their markers were added, and
  the squash's and the Maya script's moved to make room; the image did not change. `features.spec.ts` looked for a
  thinned tile from the far side of its record, which a quarter of the globe can still reach; it now looks from the far
  side of the tile's cell. The city group, drawn the fast way, since the new house tradition changes what the
  landscape draws: 32 of 33 pass. The one that fails clicks the Hell Creek's ground at a fixed pixel, which now falls on
  its tree line, and fails without this slice too, which touches neither that scene nor the camera.
- **On the GPU**, in headless Chrome drawing with ANGLE on Metal (an Apple M3 Max): every view above, Toxcatl, the
  city and the alliance with their panels, the Basin of Mexico from above in 1425 and 1500, and the city and Texcoco on
  the ground in 1500. Looking found:
  - the entry and Moctezuma's death had no place, and so no marker: both now have the city's point, as the flight has;
  - a citation with two quotes from one place of one work was listed twice, and "written 12 months after" read
    oddly: one citation now, and "1 year";
  - the borders dataset's outlines in the Basin, drawn in 1425, are where [Limitations](#limitations) says, and the
    territory claims now say so;
  - on the ground the city is drawn from the new tradition, in close rows of one-room houses with flat roofs, some
    40,000 of them for Mexico City and the towns near it; but on dry land among pines, and with glyptodonts;
  - the alliance's end is said to be derived from the Mexica date of the fall and its anchors.

## Next

- **Months and the Calendar Round.** A day of the 365-day year by its month, and the Maya Calendar Round on the Long
  Count's dates, once the month that began the year can be a claim.
- **Two counts as one**, so that the Mexica double dates bear on the Maya correlation.
- **A day's clock**, which the German surrender and the Anales de Tlatelolco both want.
- **Sides of a war**, and a competing start that carries its parts with it: what the Second World War probe will ask
  for too.
- **The lists' rows as claims**, so that a city's record can say which estimate the landscape draws.
- **The lakes of the Basin of Mexico**, from a source for their shores in 1519, so that the city stands in water among
  its chinampas.
- **The borders of the Basin**, reported to the dataset's makers, with what the sources read here say.
- **A scene's animals at a historical time**: only taxa whose records reach the time shown.
