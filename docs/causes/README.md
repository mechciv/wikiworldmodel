# The graph of causes

A design tool for [plans/MODELS.md](../plans/MODELS.md): every quantity the world should be able to estimate, what
causes it, what observes it, and how far the world's own model of it is from the best that could be built. It is a
map to plan from and argue with, kept beside the code and apart from it. Nothing in the build reads it.

The model records in [world/models/](../../world/models/) say what is built. This says what there is to build, and
names the records that already answer each part.

```sh
npm run causes              # checks the graph, prints where the work is, and writes dist/causes/index.html
npm run causes -- --check   # checks only
```

Open `dist/causes/index.html` in a browser. Click a quantity to see its causes, its effects and where it stands.

## The files

One file for each lane, in causal order: `01-sky.yaml` to `13-record.yaml`. A file has its lane's nodes, and the
edges that are the causes of those nodes.

```yaml
lane: ground
title: The ground
about: One line saying what the lane holds.
nodes:
  - id: coast                  # stable, and means nothing to any tool
    label: Land and sea
    kind: at-once
    what: "Which ground was dry and which was under the sea."
    now: rule
    has: [model:earth/coastline, field:earth/coastline]
    note: "Where the world stands on it, with numbers where a build gives them."
    best: "The best model that could be built, with candidate sources and their licence as read."
    gap: large
    seen: [rocks, fossils]     # nodes of the lane `record`: the evidence that observes it
edges:
  - { from: sea-level, to: coast, now: partial, by: model:earth/relief-coastline, how: "The mechanism, in a sentence." }
```

## The words

**A node's `kind`** is how much it remembers ([MODELS.md](../plans/MODELS.md), decision 10):

| Kind | Meaning |
|---|---|
| `given` | comes from outside the graph, and nothing here causes it |
| `at-once` | a function of its causes at the same place and time |
| `settling` | moves towards what its causes imply, over a time of its own |
| `spreading` | arrives from somewhere, along paths |
| `contingent` | instances are evidence's alone, and a model gives only their statistics |
| `record` | a kind of evidence, in the lane `record` |

**A node's `now`** is where the world stands on it:

| State | Meaning |
|---|---|
| `none` | nothing in the world answers it |
| `stand-in` | a generator or a generic default decides it |
| `borrowed` | another's model or dataset is drawn as the value |
| `rule` | a model of the world's own, which no evidence conditions |
| `conditioned` | a model of the world's own, conditioned on evidence |
| `scored` | and scored on evidence held out |
| `records` | instances written as records or read as rows |

**A node's `gap`** is how far that is from the best buildable: `none`, `small`, `medium`, `large` or `total`.

**An edge's `now`** is whether the world carries the cause through:

| State | Meaning |
|---|---|
| `built` | a model of the world's reads this cause for this effect (`by` names it) |
| `partial` | read crudely, or for part of the time |
| `inside` | holds only inside a dataset the world reads, such as a climate run |
| `backwards` | the world works it out in the other direction |
| `missing` | nothing carries it |

**An edge's `loop`** names a feedback it closes. Without its loop edges the graph has no cycle, and the checker holds
it to that: every cycle must be named.

## What the checker holds it to

- Every id is unique, every edge's ends exist, and every word is one of those above.
- Every `has` and `by` names a field, a model or a generator that exists in `world/`.
- Every `seen` names a node of the lane `record`.
- Without its loop edges the graph is acyclic, and every loop edge does close a cycle.

## Where the work is

The page and the command rank the nodes by gap times reach: how far a node is from the best buildable, times how
many other nodes read it. A node that reads it directly counts whole, and one that reads it through others counts for
0.6 as much with each step, so that what many nodes read themselves comes before what merely stands far upstream. For
a kind of evidence, reach is how many nodes it observes. The ranking is arithmetic on the graph, and is only as good
as the gaps written in it.

## Changing it

Change the YAML, run `npm run causes`, and look. A gap or a state that a new build's numbers contradict should be
changed with the numbers in its `note`. A cause that sources dispute is two edges, or an edge whose `how` says who
holds it. The text follows the rules of the other documents: nothing is attributed to a work that was not read, and
a candidate source says that its licence is unchecked.
