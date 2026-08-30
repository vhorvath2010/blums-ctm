"""A small, opinionated LTM: enough specialists to make phenomena appear.

None of these are clever. Each does one narrow job and shouts about it with a
weight it thinks is appropriate. Everything interesting in the demos comes out
of the competition between them, not out of any one of them.
"""

from __future__ import annotations

from .chunk import Chunk, Gist
from .processor import LTMProcessor


class SensoryProcessor(LTMProcessor):
    """Input map -> Brainish. One per modality.

    `gain` is the knob the demos turn. Crushing it does not blind the processor
    -- it still sees, still submits, still talks over its links. It only makes
    it too quiet to win the competition. That distinction is the whole of
    blindsight (section 3.1).
    """

    def __init__(self, name: str, modality: str, *, base_weight: float = 3.0,
                 gain: float = 1.0, valence: float = 1.0,
                 link_targets: tuple[str, ...] = ()):
        super().__init__(name, base_weight=base_weight)
        self.modality = modality
        self.gain = gain
        self.valence = valence           # +1 neutral/pleasant, -1 for pain
        self.link_targets = link_targets
        self.interests = (modality,)
        self.last_seen: dict | None = None

    def propose(self, t: int):
        if self.percept is None:
            self.last_seen = None
            return None
        self.last_seen = self.percept
        gist = Gist(self.modality, self.percept["label"], dict(self.percept))
        weight = self.base_weight * self.gain * self.percept["strength"] * self.valence
        # Whatever it saw, it also tells its linked partners -- unconsciously.
        # `link_targets` is a head start; `partners` is whatever the machine has
        # actually wired up by now, including links formed since birth.
        for target in dict.fromkeys((*self.link_targets, *self.partners)):
            self.tell(target, gist, abs(weight))
        return gist, weight

    def appraise(self, gist: Gist) -> float:
        if gist.modality != self.modality:
            return 0.0
        return float(gist.payload.get("strength", 1.0)) * self.base_weight


class DistractorProcessor(LTMProcessor):
    """A demanding task that keeps shouting: the counting job in the gorilla
    experiment. Its only role is to occupy STM."""

    def __init__(self, name: str = "task", *, base_weight: float = 30.0):
        super().__init__(name, base_weight=base_weight)
        self.interests = ("task",)
        self.engaged = False
        self.count = 0

    def propose(self, t: int):
        if not self.engaged:
            return None
        self.count += 1
        return Gist("task", f"...counting passes: {self.count}"), self.base_weight

    def appraise(self, gist: Gist) -> float:
        return self.base_weight if gist.modality == "task" else 0.0


class MotorProcessor(LTMProcessor):
    """Acts on the world. It will act on anything that reaches it -- consciously
    via broadcast, or unconsciously via a link. It cannot tell the difference,
    and that is exactly the point."""

    RESPONSES = {"nociception": "withdraw", "vision": "avoid"}

    def __init__(self, name: str = "motor"):
        super().__init__(name)
        self.interests = ("motor",)
        self.pending: dict | None = None
        self.acted_on: list[tuple[int, str, str]] = []   # (t, route, what)

    def _respond(self, chunk: Chunk, t: int, route: str) -> None:
        action = self.RESPONSES.get(chunk.gist.modality)
        if action is None or self.pending is not None:
            return
        self.pending = {"action": action, "about": chunk.gist.content, "route": route}
        self.acted_on.append((t, route, chunk.gist.content))

    def on_broadcast(self, chunk: Chunk, t: int) -> None:
        self._respond(chunk, t, "conscious")

    def on_link(self, chunk: Chunk, t: int) -> None:
        self._respond(chunk, t, "unconscious")

    def actuate(self):
        command, self.pending = self.pending, None
        return command

    def route_counts(self) -> dict[str, int]:
        counts = {"conscious": 0, "unconscious": 0}
        for _, route, _ in self.acted_on:
            counts[route] += 1
        return counts


class InnerSpeechProcessor(LTMProcessor):
    """Section 1.1: an Inner generalized Speech processor. It narrates whatever
    reaches conscious awareness -- and only that. Ask it what happened and you
    get a report of the broadcast stream, never of the links. When the CTM
    confabulates, this is where it happens."""

    def __init__(self, name: str = "inner-speech", *, base_weight: float = 1.2):
        super().__init__(name, base_weight=base_weight)
        self.interests = ("inner-speech",)
        self.said: list[tuple[int, str, str]] = []   # (t, line, modality narrated)

    def on_broadcast(self, chunk: Chunk, t: int) -> None:
        if chunk.gist.modality in ("inner-speech", "silence", "idle"):
            return  # don't narrate the narration, or the hum
        line = f"I notice {chunk.gist.content}."
        self.said.append((t, line, chunk.gist.modality))
        self.say(Gist("inner-speech", line, {"about": chunk.gist.modality}),
                 self.base_weight)

    def report(self, modality: str) -> str:
        """What CTM says if you ask whether it noticed something.

        Note where this answer comes from: the broadcast stream, and nowhere
        else. Inner speech has no access to link traffic, so an honest report
        of conscious experience can be a false report of what the machine did.
        """
        hits = [line for _, line, m in self.said if m == modality]
        return hits[-1] if hits else f"I noticed no {modality} at all."

    def transcript(self, last: int = 6) -> list[str]:
        return [f"t={t:>4}  {line}" for t, line, _ in self.said[-last:]]


class ModelOfTheWorldProcessor(LTMProcessor):
    """Section 1.1 / Chapter 2: the Model-of-the-World processor.

    It keeps a running model of the room and of CTM itself, predicts what comes
    next, and shouts when it is wrong. Surprise is expensive to ignore, so its
    weight scales with prediction error -- the predictive-dynamics loop of
    section 1.6 in its smallest possible form.
    """

    def __init__(self, name: str = "model-of-world", *, base_weight: float = 4.0):
        super().__init__(name, base_weight=base_weight)
        self.interests = ("world", "vision", "audition", "nociception")
        self.model: dict[str, str] = {}
        self.surprises: list[tuple[int, str, str]] = []
        self.self_model: dict[str, list] = {"acted": [], "aware_of": []}

    def on_broadcast(self, chunk: Chunk, t: int) -> None:
        m = chunk.gist.modality
        if m in ("silence", "inner-speech", "idle"):
            return
        self.self_model["aware_of"].append((t, m))
        previous = self.model.get(m)
        self.model[m] = chunk.gist.content
        if previous is not None and previous != chunk.gist.content:
            self.surprises.append((t, previous, chunk.gist.content))
            self.say(
                Gist("world", f"that changed: {previous} -> {chunk.gist.content}",
                     {"was": previous, "now": chunk.gist.content}),
                self.base_weight * 2,
            )

    def note_action(self, t: int, what: str, route: str) -> None:
        """The self-model only learns of an action if it was told. An action
        taken over a link leaves no trace here -- so when asked why it acted,
        the machine has nothing true to say."""
        self.self_model["acted"].append((t, what, route))

    def appraise(self, gist: Gist) -> float:
        return self.base_weight if gist.modality in self.interests else 0.5


class MemoryProcessor(LTMProcessor):
    """Section 1.5: stores salient chunks -- the terrible, wonderful and
    unexpected -- and, when CTM sleeps, resubmits recombinations of them. With
    the Input maps quiet, those recombinations are all that is left to win the
    competition, which is section 3.5's account of dreaming."""

    def __init__(self, name: str = "memory", *, base_weight: float = 2.0,
                 salience: float = 2.0):
        super().__init__(name, base_weight=base_weight)
        self.interests = ("memory", "dream")
        self.salience = salience
        self.store: list[Chunk] = []
        self.dreaming = False
        self._state = 12345

    def on_broadcast(self, chunk: Chunk, t: int) -> None:
        if chunk.gist.modality in ("memory", "dream", "idle", "silence", "inner-speech"):
            return  # remember the world, not the commentary on it
        if abs(chunk.weight) >= self.salience:
            self.store.append(chunk)

    def propose(self, t: int):
        if not self.dreaming or len(self.store) < 2:
            return None
        self._state = (1103515245 * self._state + 12345) % (2**31)
        a = self.store[self._state % len(self.store)]
        b = self.store[(self._state >> 8) % len(self.store)]
        gist = Gist("dream", f"{a.gist.content} ... and then ... {b.gist.content}",
                    {"from": [a.gist.content, b.gist.content]})
        return gist, self.base_weight


class IdleProcessor(LTMProcessor):
    """Background chatter, so the competition is never a walkover. A CTM with
    nothing on its mind is still bubbling."""

    def __init__(self, name: str, *, base_weight: float = 0.4):
        super().__init__(name, base_weight=base_weight)
        self.interests = ("idle",)

    def propose(self, t: int):
        return Gist("idle", f"{self.name} hums"), self.base_weight
