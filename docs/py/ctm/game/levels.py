"""Six levels, each teaching exactly one idea with exactly one thing to fiddle.

A level owns a machine, a goal, and a check for whether the goal has been met.
Every level is built from the same CTM the tests exercise -- the game changes
what is on screen and what you may touch, never how the model behaves.
"""

from __future__ import annotations

from ..chunk import Gist
from ..machine import ConsciousTuringMachine
from ..processor import LTMProcessor
from ..processors import (
    DistractorProcessor,
    IdleProcessor,
    InnerSpeechProcessor,
    MotorProcessor,
    SensoryProcessor,
)
from ..world import World


class Voice(LTMProcessor):
    """A processor with one thing to say and a volume you can turn."""

    def __init__(self, name: str, text: str, modality: str, weight: float = 2.0):
        super().__init__(name, base_weight=weight)
        self.text = text
        self.modality = modality
        self.interests = (modality,)

    def propose(self, t: int):
        return Gist(self.modality, self.text), self.base_weight

    def appraise(self, gist: Gist) -> float:
        return self.base_weight if gist.modality == self.modality else 0.0


# ---------------------------------------------------------------------------


class Level:
    number = 0
    title = ""
    subtitle = ""
    premise = ""
    goal = ""
    lesson = ""
    controls: list[dict] = []
    autoplay = True

    def __init__(self):
        self.solved = False
        self.note = ""
        self.age = 0          # ticks since the current setup started running
        self.build()
        # Pin every processor's Sleeping Experts algorithm.  It is real CTM
        # behaviour, but none of these levels teach it, and letting volumes
        # drift means the screen says 144 while the premise says 30.  A level
        # whose numbers contradict its own text teaches the wrong thing.
        for proc in self.machine.processors:
            proc.sea.up = 1.0
            proc.sea.down = 1.0

    def build(self) -> None:
        raise NotImplementedError

    def act(self, control: str, value) -> None:
        pass

    def check(self) -> None:
        pass

    def tick(self) -> None:
        self.machine.tick()
        self.age += 1
        self.check()

    def extra(self) -> dict:
        return {}

    def restart(self) -> None:
        """Wipe the record without rebuilding the machine.

        Changing a knob starts a new experiment.  Without this the stream still
        holds what happened under the old setting, and a goal phrased as "it
        never saw it" could never be met again."""
        self.age = 0
        self.machine.stream.clear()
        self.machine.trace.clear()
        self.machine.uptree.flush()   # drop competitions still in flight
        self.machine.stm = None
        for p in self.machine.processors:
            p.history.clear()
            if hasattr(p, "acted_on"):
                p.acted_on.clear()
            if hasattr(p, "said"):
                p.said.clear()

    # Convenience for subclasses -------------------------------------------

    def _crowd(self, n: int, weight: float = 0.4) -> list[LTMProcessor]:
        return [IdleProcessor(f"hum-{i}", base_weight=weight) for i in range(n)]

    def blobs(self) -> list[dict]:
        """What the stage should draw: one blob per processor that spoke."""
        out = []
        for p in self.machine.processors:
            sub = p.last_submitted
            if sub is None:
                continue
            out.append({
                "name": p.name,
                "address": p.address,
                "modality": sub.gist.modality,
                "text": sub.gist.content,
                "f": round(self.machine.uptree.f(sub), 3),
            })
        return out


# ---------------------------------------------------------------------------


class L1(Level):
    number = 1
    title = "One stage"
    subtitle = "Short Term Memory holds one thing"
    premise = ("Three processors each have something to say. Short Term Memory "
               "holds one chunk at a time, so on every tick the three compete "
               "and one wins. A processor that puts more weight behind its "
               "chunk gets better odds. Click one to raise its weight.")
    goal = "Get HUNGER into Short Term Memory three times."
    lesson = ("Nothing chose hunger. There is no manager inside the machine "
              "deciding what matters. Hunger won because you gave it more "
              "weight and the draw went its way. Blum and Blum argue this "
              "narrow channel is the point of consciousness: everything the "
              "machine knows has to compete for one slot, which is what lets "
              "the whole machine work on one thing at a time.")
    controls = [{"kind": "blobs",
                 "label": "Click a processor to raise its weight"}]

    def build(self):
        self.voices = [
            # Hunger starts faint against two loud neighbours, so reaching the
            # stage three times by luck alone is not on the cards.
            Voice("hunger", "hunger", "red", 0.5),
            Voice("birdsong", "birdsong", "blue", 4.0),
            Voice("an itch", "an itch", "yellow", 4.0),
        ]
        self.machine = ConsciousTuringMachine(self.voices, seed=1)
        self.wins = 0

    def act(self, control, value):
        if control == "louder":
            for v in self.voices:
                if v.name == value:
                    v.base_weight = min(24.0, v.base_weight * 2)

    def check(self):
        if self.machine.stm and self.machine.stm.gist.modality == "red":
            self.wins += 1
        if self.wins >= 3:
            self.solved = True

    def extra(self):
        return {"counter": {"label": "hunger in short term memory",
                            "value": self.wins, "of": 3}}


class L2(Level):
    number = 2
    title = "A weighted coin"
    subtitle = "Each chunk's share of Short Term Memory"
    premise = ("Four processors submit chunks every tick, with weights fixed "
               "at 1, 2, 3 and 4. Run the machine and keep score of which one "
               "reaches Short Term Memory. The table fills in as you go.")
    goal = "Run 60 ticks, then compare the score to the prediction."
    lesson = ("Each processor wins about as often as its share of the total "
              "weight. The one at 4 out of 10 takes roughly 40% of the ticks. "
              "Blum and Blum prove this holds exactly. It also means no "
              "processor is ever shut out for good: a low-weight one still "
              "gets its turn, just rarely, so the machine never goes "
              "permanently deaf to anything.")
    controls = [{"kind": "run", "label": "Run 20 rounds", "value": 20}]
    autoplay = False

    def build(self):
        self.voices = [
            Voice("one", "1", "blue", 1.0),
            Voice("two", "2", "yellow", 2.0),
            Voice("three", "3", "red", 3.0),
            Voice("four", "4", "ink", 4.0),
        ]
        self.machine = ConsciousTuringMachine(self.voices, seed=4)
        self.tally = {v.name: 0 for v in self.voices}
        self.rounds = 0

    def check(self):
        if self.machine.t <= self.machine.h:
            return                      # the pipeline is still filling
        if self.machine.stm:
            name = self.machine.processors[self.machine.stm.address].name
            if name in self.tally:
                self.tally[name] += 1
                self.rounds += 1
        if self.rounds >= 60:
            self.solved = True

    def extra(self):
        total = sum(v.base_weight for v in self.voices)
        return {
            "tally": [
                {"name": v.name, "text": v.text, "modality": v.modality,
                 "won": self.tally[v.name],
                 "measured": round(self.tally[v.name] / self.rounds, 3) if self.rounds else 0.0,
                 "predicted": round(v.base_weight / total, 3)}
                for v in self.voices
            ],
            "counter": {"label": "ticks scored", "value": self.rounds, "of": 60},
        }


class L3(Level):
    number = 3
    title = "The climb"
    subtitle = "Why becoming conscious takes time"
    premise = ("Sixteen processors submit at once. Their chunks meet in pairs, "
               "and each pair sends one winner up to the next level. Blum and "
               "Blum call this the Up-Tree, and every level of it costs one "
               "tick. Press SHOUT to submit a very heavy chunk and follow it "
               "up.")
    goal = "Shout, then say how many ticks passed before it was broadcast."
    lesson = ("This Up-Tree is four levels deep, so a chunk needs four ticks "
              "to reach Short Term Memory and one more to be broadcast back "
              "to every processor. Five ticks in total. A brain would have "
              "millions of processors and a far deeper tree. Blum and Blum "
              "work that case out to roughly 2.4 seconds, which is close to "
              "how long people take to report a decision they have already "
              "made.")
    controls = [{"kind": "shout", "label": "SHOUT"},
                {"kind": "guess", "label": "ticks until broadcast",
                 "options": [1, 3, 5, 7]}]

    def build(self):
        self.shouter = Voice("you", "HELLO", "red", 40.0)
        self.shouter.base_weight = 0.0            # silent until you shout
        procs = [self.shouter, *self._crowd(15)]
        self.machine = ConsciousTuringMachine(procs, seed=9)
        self.shouted_at = None
        self.heard_at = None
        self.guess = None

    def act(self, control, value):
        if control == "shout":
            self.shouter.base_weight = 40.0
            self.shouted_at = self.machine.t
            self.heard_at = None
        elif control == "guess":
            self.guess = int(value)

    def check(self):
        if self.shouted_at is not None and self.shouter.base_weight > 0:
            self.shouter.base_weight = 0.0        # one shout only
        stm = self.machine.stm
        if (self.heard_at is None and stm is not None
                and stm.gist.content == "HELLO"):
            self.heard_at = self.machine.t
        if self.heard_at is not None and self.guess is not None:
            self.solved = True

    def extra(self):
        lag = None
        if self.shouted_at is not None and self.heard_at is not None:
            lag = self.heard_at - self.shouted_at
        return {
            "shouted_at": self.shouted_at,
            "heard_at": self.heard_at,
            "lag": lag,
            "guess": self.guess,
            "correct": lag is not None and self.guess == lag,
            "tree": self.machine.uptree.snapshot(),
        }


class L4(Level):
    number = 4
    title = "The back door"
    subtitle = "Blindsight"
    premise = ("The machine has a vision processor, and there is an obstacle "
               "in front of it. You can change two things: how much weight "
               "vision puts behind its chunks, and whether vision has a link "
               "straight to the motor processor. Chunks sent along a link "
               "never enter the competition at all.")
    goal = "Make it avoid the obstacle while it truthfully reports seeing nothing."
    lesson = ("You did not damage vision. You lowered its weight until it "
              "stopped winning the competition, so nothing it saw was ever "
              "broadcast. The link carried the same information straight to "
              "the motor processor, which acted on it. A processor can only "
              "report what was broadcast, so the machine reports seeing "
              "nothing, and it is being honest. People with damage to the "
              "visual cortex do exactly this. They report no vision, then "
              "reach for objects accurately. Doctors call it blindsight.")
    controls = [
        {"kind": "toggle", "id": "loud", "label": "Vision at full weight", "on": True},
        {"kind": "toggle", "id": "link", "label": "Link vision → motor", "on": False},
    ]

    def build(self):
        self.world = World()
        self.eye = SensoryProcessor("eye", "blue", base_weight=6.0)
        # Blindsight is a broken route, not an under-confident processor.  Left
        # alone, this eye's Sleeping Experts algorithm notices it keeps losing,
        # raises its own volume, and eventually gets heard -- which is correct
        # CTM behaviour and completely wrong for this lesson.  A lesioned
        # pathway does not lobby for attention, so its volume is pinned.
        self.eye.sea.up = 1.0
        self.body = MotorProcessor("body")
        self.body.RESPONSES = {"blue": "avoid"}
        self.speech = InnerSpeechProcessor("inner voice", base_weight=1.0)
        procs = [self.eye, self.body, self.speech, *self._crowd(13, 0.5)]
        self.machine = ConsciousTuringMachine(procs, world=self.world, seed=5)
        self.world.SENSORS = {"vision": "eye"}
        self.world.poke("vision", "an obstacle", strength=1.0, duration=9999)
        self.loud, self.link = True, False
        self.spoiled = False

    def act(self, control, value):
        if control == "loud":
            self.loud = bool(value)
            self.eye.gain = 1.0 if self.loud else 0.001
            self.spoiled = False
            self.restart()
        elif control == "link":
            self.link = bool(value)
            if self.link:
                self.machine.links.wire("eye", "body")
            else:
                self.machine.links.acks[frozenset(("eye", "body"))] = 0
            self.spoiled = False
            self.restart()

    def check(self):
        r = self.body.route_counts()
        if self.machine.was_conscious_of("blue"):
            self.spoiled = True
        # A chunk needs h + 1 ticks to reach the stage, so early evidence proves
        # nothing: with a loud eye the body racks up unconscious acts before the
        # percept could possibly have become conscious.  Give the eye a fair
        # chance to be heard before ruling that it never was.
        if self.age >= 15 and not self.spoiled and r["unconscious"] >= 3:
            self.solved = True

    def extra(self):
        r = self.body.route_counts()
        return {
            "aware": self.spoiled,
            "progress": min(self.age, 15),
            "loud_on": self.loud,
            "link_on": self.link,
            "routes": r,
            "said": (self.speech.said[-1][1] if self.speech.said
                     else "I noticed nothing."),
            "acted": [{"t": t, "route": route} for t, route, _ in self.body.acted_on[-6:]],
        }


class L5(Level):
    number = 5
    title = "In plain sight"
    subtitle = "Inattentional blindness"
    premise = ("A gorilla is in plain view and the vision processor is "
               "working normally, submitting at weight 6. A counting task is "
               "running as well, submitting at weight 30. Vision has to beat "
               "that to be broadcast.")
    goal = "See how often the gorilla gets through, then switch the counting off."
    lesson = ("The gorilla stood in front of a working vision processor the "
              "whole time. Its chunks lost the competition to a heavier one, "
              "tick after tick. In the study this comes from, about half the "
              "people counting basketball passes never notice someone in a "
              "gorilla suit walk through the shot. Nothing was aimed away "
              "from the gorilla. It was simply outbid.")
    controls = [{"kind": "toggle", "id": "count",
                 "label": "Counting task running", "on": True}]

    def build(self):
        self.world = World()
        self.eye = SensoryProcessor("eye", "red", base_weight=6.0)
        self.task = DistractorProcessor("counting", base_weight=30.0)
        self.task.engaged = True
        procs = [self.eye, self.task, *self._crowd(14, 0.5)]
        self.machine = ConsciousTuringMachine(procs, world=self.world, seed=11)
        self.world.SENSORS = {"vision": "eye"}
        self.world.poke("vision", "a gorilla", strength=1.0, duration=9999)
        self.watched = 0        # ticks elapsed with the counting task running
        self.got_through = 0    # of those, how many put the gorilla on stage
        self.seen_after = 0     # sightings once the counting stops
        self.phase = "miss"

    def act(self, control, value):
        if control == "count":
            self.task.engaged = bool(value)

    def _gorilla_on_stage(self) -> bool:
        stm = self.machine.stm
        return stm is not None and stm.gist.modality == "red"

    def check(self):
        on_stage = self._gorilla_on_stage()
        if self.phase == "miss":
            if self.task.engaged:
                self.watched += 1
                self.got_through += on_stage
                if self.watched >= 20:
                    self.phase = "look"
        else:
            if not self.task.engaged:
                self.seen_after += on_stage
                if self.seen_after >= 3:
                    self.solved = True

    def extra(self):
        return {
            "phase": self.phase,
            "count_on": self.task.engaged,
            "watched": self.watched,
            "got_through": self.got_through,
            "seen_after": self.seen_after,
            "counter": ({"label": "ticks with the counting task on",
                         "value": self.watched, "of": 20}
                        if self.phase == "miss" else
                        {"label": "broadcasts with counting off",
                         "value": self.seen_after, "of": 3}),
        }


class L6(Level):
    number = 6
    title = "Before you feel it"
    subtitle = "The delay behind free will"
    premise = ("A hand is resting on a hot stove. The pain processor has a "
               "link straight to the motor processor, and it also submits "
               "chunks to the competition like everything else. The link "
               "takes one tick. The competition takes five.")
    goal = "Touch the stove, and watch the hand move before the pain is broadcast."
    lesson = ("The hand pulled away on the tick the pain arrived, over the "
              "link. The pain itself needed five more ticks to win the "
              "competition and be broadcast. By the time the machine is "
              "conscious of the pain it has already moved, and it holds no "
              "record of having decided, because the decision never went "
              "through the broadcast. Experiments on people find something "
              "similar: brain activity predicting a movement often appears "
              "before the person reports choosing to move.")
    controls = [{"kind": "stove", "label": "TOUCH THE STOVE"}]

    def build(self):
        self.world = World()
        self.pain = SensoryProcessor("pain", "red", base_weight=8.0, valence=-1.0)
        self.body = MotorProcessor("body")
        self.body.RESPONSES = {"red": "withdraw"}
        procs = [self.pain, self.body, *self._crowd(14, 0.5)]
        self.machine = ConsciousTuringMachine(procs, world=self.world, seed=3)
        self.world.SENSORS = {"nociception": "pain"}
        self.machine.links.wire("pain", "body")
        self.touched_at = None
        self.felt_at = None

    def act(self, control, value):
        if control == "stove":
            self.touched_at = self.machine.t
            self.felt_at = None
            self.world.poke("nociception", "a hot stove", strength=1.5, duration=3)

    def check(self):
        stm = self.machine.stm
        if self.felt_at is None and stm is not None and stm.gist.modality == "red":
            self.felt_at = self.machine.t
        acted = self.body.acted_on[0][0] if self.body.acted_on else None
        if acted is not None and self.felt_at is not None and acted < self.felt_at:
            self.solved = True

    def extra(self):
        acted = self.body.acted_on[0][0] if self.body.acted_on else None
        return {
            "touched_at": self.touched_at,
            "acted_at": acted,
            "felt_at": self.felt_at,
            "gap": (self.felt_at - acted) if (acted is not None and self.felt_at) else None,
        }


LEVELS = [L1, L2, L3, L4, L5, L6]
