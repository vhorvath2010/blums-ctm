# A pokeable Conscious Turing Machine

A small, dependency-free implementation of the **Conscious Turing Machine** of
Lenore Blum and Manuel Blum ([PNAS 119(21) e2115934119, 2022][paper];
arXiv:2107.13704) — built to be prodded rather than to be fast.

The point is not to model a brain. It is to have something small enough to hold
in your head, faithful enough to the paper's definitions that its behaviour is a
consequence of *their* structure and not of ours, and instrumented enough that
you can watch a phenomenon like blindsight fall out of a single changed
parameter.

[paper]: https://www.pnas.org/doi/10.1073/pnas.2115934119

```
python -m ctm.game        # the game, six levels        <-- start here
python -m ctm.viz         # the full console, every knob at once
python -m ctm             # text shell
python -m ctm demos       # run every experiment
python -m pytest tests    # check the implementation against the paper
```

Only `pytest` is an outside dependency, and only for the tests. The model and the
console are pure standard library.

## The model

The CTM is a 7-tuple, `< STM, LTM, Up-Tree, Down-Tree, Links, Input, Output >`.

- **LTM** is every processor there is. Each is a narrow specialist with its own
  memory, its own opinion of what matters, and no view of the whole.
- **STM** holds exactly one chunk: the conscious content, right now.
- A **chunk** is `< address, t, gist, weight, intensity, mood >`. The `gist` is a
  word of *Brainish*, the multi-modal inner language — a patch of inner vision, a
  twinge of sensation, a line of inner speech.
- Every tick, **every** processor submits a chunk to the **Up-Tree**: a binary
  tree of coin-flip neurons, height `h = log₂ N`. At each node one of two sibling
  chunks wins with probability proportional to its competition function `f`, and
  the node adds up both children's intensity and mood.
- The chunk that reaches the root is broadcast down the **Down-Tree** to all
  processors. Their *reception* of it — not its arrival in STM — is conscious
  awareness.
- Processors that repeatedly find each other useful form **links**, and their
  traffic moves off-stage. The machine keeps doing the thing and stops being
  aware that it is doing it.

Nothing schedules, arbitrates, or decides. There is no central executive: the
only thing choosing what the machine thinks about next is a tree of coin flips.

| Paper | Module |
|---|---|
| 1.1 Structure, links, input/output maps | `ctm/machine.py`, `ctm/links.py` |
| 1.2 Brainish, chunks, gists | `ctm/chunk.py` |
| 1.3 Up-Tree competition, coin-flip neuron | `ctm/uptree.py` |
| 1.4 Delay to conscious awareness | `machine.h`, `machine.latency` |
| 1.5 Memories, the high level story | `processor.history` |
| 1.6 Predictive dynamics, Sleeping Experts | `ctm/sleeping_experts.py` |
| Chapter 3 phenomena | `ctm/demos.py` |

## The game

`python -m ctm.game` is a six-level introduction. Each level isolates one idea,
gives you one or two things to touch, and states a goal you have to actually
reach. The model underneath is the same CTM the tests exercise.

```
01  ONE STAGE            only one thing can be conscious at a time
02  A WEIGHTED COIN      each chunk's share of the stage, in proportion
03  THE CLIMB            becoming conscious takes h + 1 ticks
04  THE BACK DOOR        blindsight
05  IN PLAIN SIGHT       inattentional blindness
06  BEFORE YOU FEEL IT   the delay behind free will
```

The machine is drawn as institutional valve-computing hardware: each processor
is a thermionic tube whose filament burns at its volume, and the single conscious
chunk is what gets lit in the amber phosphor aperture above the rack. A link is a
patch lead that runs under the rack, bypassing the aperture entirely. Shapes are
displaced through turbulence so their edges scumble like paint rather than
resolving as vector art.

Level 4 is the one to play if you only play one: you
have an eye that works, an obstacle in front of you, and two switches. Quieting
the eye does not blind it — the percept still reaches the body through the link
and still steers it. What is missing is the broadcast, and the broadcast is all
inner speech can report, so it steers around an obstacle it truthfully says it
never saw.

Levels are won, not watched: level 4 will not accept an early result, because a
chunk needs h + 1 ticks to reach the stage and evidence collected before then
proves nothing.

## Watching it think

For the full instrument — every processor, every knob, the live Up-Tree —
`python -m ctm.viz` is still there. It shows everything at once, which is either
what you want or exactly why you want the game instead.

`python -m ctm.viz` starts a server on 127.0.0.1:8765 and opens a console.
Nothing is reimplemented for the browser: every frame is a snapshot of the same
Python machine the tests exercise, and every control is a command sent to it.

The centrepiece is the Up-Tree, drawn live. Each row is a **different**
competition caught mid-climb, because the tree is pipelined - a new one starts
every tick and takes h ticks to reach the top. Chunks are coloured by modality so
you can follow one up the tree by eye, and **clicking any node prints the local
competition that node just ran**:

```
Level 3, node 0 - coin-flip neuron
   audition   a barking dog             f=2.53     7.8%
 > task       ...counting passes: 3     f=30.0    92.2%
```

That is inattentional blindness in one line. Nothing is broken; the gorilla is
outbid.

For blindsight the console draws the second route explicitly: an amber dashed
path along the bottom labelled `vision -> motor · unconscious, bypasses the
tree`. The chunk reaches the body without ever entering the competition, and the
verdict panel puts the two facts side by side:

```
Vision reached STM        NO
Body acted                4x
... consciously            0
... unconsciously          4

  "I noticed no vision at all."
```

Controls worth trying: the **vision gain** slider (drag it down and watch a
healthy percept stop reaching STM), the **link** checkboxes (a link moves traffic
off-stage and the machine stops being aware of it), the counting task, and sleep.
Space steps the clock, `p` plays.

## What falls out

Run `python -m ctm demos` for the same experiments headless. Each changes exactly
one thing.

**Blindsight** (§3.1) — crush the vision processor's gain so its chunks can never
win the competition, but leave its link to motor intact. It still sees; it is
just too quiet to be heard.

```
did anything visual ever reach STM?   False
did the machine act on the obstacle?  True
by which route?                       {'conscious': 0, 'unconscious': 2}
ask it what it saw:  "I noticed no vision at all."
```

It avoids an obstacle it truthfully reports never having seen. Restore the gain
(`normal-sight`) and the same wiring yields `"I notice an obstacle on the left."`

**Inattentional blindness** (§3.2) — nothing is wrong with the eyes. A counting
task submits chunks weighted 30 against the gorilla's 3, and the gorilla loses
every coin flip on the way up. Disengage the task and it walks straight in.

**The delay behind free will** (§3.7) — a hand on a stove is withdrawn over a
link at tick 6; the pain is consciously felt at tick 10. The act precedes the
feeling by four ticks, and the self-model's only record is *that* it acted.

**Mood as an emergent sum** (§1.3) — mood is stored nowhere. It is the signed sum
of every processor's weight, accumulated one addition per node, read off whatever
chunk happens to win. A global feeling computed by nobody.

**Dreaming** (§3.5) — close the input maps and let memory resubmit recombinations
of salient chunks. They win STM unopposed, and inner speech narrates them exactly
as it narrates waking life.

**Sleeping Experts** (§1.6) — a processor that keeps losing while privately
believing it had the better thing to say raises its own volume until it is heard.
Attention is bought, not allocated.

## Poking it yourself

```
$ python -m ctm
ctm[t=0]> wire vision motor
ctm[t=0]> gain vision 0.001
ctm[t=0]> poke vision a truck -s 2 -d 4
ctm[t=0]> step 8
ctm[t=8]> stream          # what reached consciousness
ctm[t=8]> say             # what it reports noticing
ctm[t=8]> self            # what it did, and whether it knows why
ctm[t=8]> odds            # each processor's entitled share of STM
```

`help` lists everything. `odds` is worth a look: it prints each processor's
`f(chunk) / Σf`, which for an additive `f` is provably its long-run share of
STM — you can watch the theorem hold while the machine runs.

## Is it faithful?

`tests/test_ctm.py` checks the implementation against the paper's own claims
rather than against itself:

- the coin-flip neuron fires proportionally, and fairly at `(0, 0)`;
- for additive `f`, each chunk's measured share of STM matches `f / Σf` (the
  §1.3 theorem) to within 1.5% over 20,000 trials;
- permuting processors across leaves does not change those shares (the paper's
  corollary);
- the root's intensity and mood equal the sums over *all* leaves;
- a chunk submitted at `t` reaches STM at exactly `t + h`;
- links do not carry traffic until enough acknowledgements have accumulated.

## Deliberate simplifications

`N = 16` processors, not 10⁷, so `h = 4` and awareness lags by 5 ticks instead of
the paper's ~2.4 seconds. Gists are strings with a structured payload rather than
a learned multi-modal encoding — real Brainish is an open research problem, not a
weekend's work. The Sleeping Experts algorithm is the simplest embolden/hush rule
that shows the dynamic; the paper cites a whole literature of better ones. The
environment is one room with three sensors and two actuators.

None of these touch the competition itself, which is where the paper's claims
actually live.

## Layout

```
ctm/chunk.py             gists and chunks
ctm/uptree.py            coin-flip neuron, competition functions, the tree
ctm/processor.py         the LTM processor base class
ctm/sleeping_experts.py  embolden / hush
ctm/links.py             acknowledgement, link formation, unconscious traffic
ctm/machine.py           the 7-tuple and its clock
ctm/world.py             a one-room environment you can poke
ctm/processors.py        vision, pain, motor, inner speech, model-of-world, memory
ctm/build.py             a standard little mind
ctm/demos.py             the experiments
ctm/cli.py               the text shell
ctm/viz/session.py       one live machine, flattened to JSON
ctm/viz/server.py        stdlib HTTP server, binds 127.0.0.1 only
ctm/viz/static/          the console (no build step, no framework)
ctm/game/levels.py       six levels: setup, goal, and how it is won
ctm/game/static/         the game (no build step, no framework)
```
