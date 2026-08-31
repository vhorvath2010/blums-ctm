"""The Conscious Turing Machine -- paper section 1.1.

    CTM = < STM, LTM, Up-Tree, Down-Tree, Links, Input, Output >

One clock tick, in order:

  1. Down-Tree.   The chunk that entered STM last tick is broadcast to all N LTM
                  processors.  Their *reception* of it -- not its arrival in STM
                  -- is conscious awareness (section 1.1).
  2. Links.       Unconscious point-to-point traffic between processors, plus the
                  reverberation that follows a broadcast ("global ignition").
  3. Input maps.  Environment -> designated processors, via sensors.
  4. Up-Tree.     Every processor submits; the tree advances one level; the chunk
                  reaching the root is CTM's conscious content at time t.
  5. Output maps. Designated processors -> actuators -> environment.

Nothing here schedules, arbitrates or decides.  There is no central executive:
the only thing that picks what CTM thinks about next is a tree of coin flips.
"""

from __future__ import annotations

import random
from collections import deque
from typing import Callable, Iterable

from .chunk import Chunk, Gist
from .links import LinkTable
from .processor import LTMProcessor
from .uptree import UpTree, additive_f


class ConsciousTuringMachine:
    def __init__(
        self,
        processors: Iterable[LTMProcessor],
        *,
        world=None,
        mood_coeff: float = 0.0,
        link_threshold: int = 3,
        seed: int | None = 0,
        stream_length: int = 400,
    ):
        self.processors: list[LTMProcessor] = list(processors)
        if len(self.processors) < 2:
            raise ValueError("a CTM needs at least 2 LTM processors")
        self.by_name = {p.name: p for p in self.processors}
        for address, p in enumerate(self.processors):
            p.address = address

        self.rng = random.Random(seed)
        self.uptree = UpTree(len(self.processors), additive_f(mood_coeff), self.rng)
        self.links = LinkTable(threshold=link_threshold)
        self.world = world

        self.t = 0
        self.stm: Chunk | None = None          # conscious content, right now
        self.stream: deque[Chunk] = deque(maxlen=stream_length)
        self.trace: list[dict] = []            # per-tick record, for poking at

    # ---- the 7-tuple's remaining members ----------------------------------

    @property
    def h(self) -> int:
        """Height of the Up-Tree.  A chunk submitted at t is conscious content at
        t + h, and CTM is consciously aware of it at t + h + 1."""
        return self.uptree.h

    @property
    def latency(self) -> int:
        """Ticks from submitting a chunk to being consciously aware of it."""
        return self.h + 1

    def input_map(self, t: int) -> dict[str, object]:
        """Env -> LTM.  Sensors hand raw percepts to designated processors."""
        if self.world is None:
            return {}
        return self.world.present(t)

    def output_map(self, commands: list[tuple[str, dict]], t: int) -> None:
        """LTM -> Env.  Actuators act on the world."""
        if self.world is None:
            return
        for name, command in commands:
            self.world.act(name, command, t)

    # ---- the clock --------------------------------------------------------

    def tick(self) -> dict:
        t = self.t
        record: dict = {"t": t, "broadcast": None, "conscious_content": None,
                        "link_traffic": [], "new_links": [], "actions": []}

        # 0. Tell each processor who it is currently linked to.  Links form and
        #    strengthen while the machine runs, so this cannot be fixed at birth.
        for p in self.processors:
            p.partners = tuple(self.links.partners(p.name))

        # 1. Down-Tree: conscious awareness of what entered STM last tick.
        if self.stm is not None:
            record["broadcast"] = self.stm
            for p in self.processors:
                p.receive_broadcast(self.stm, t)

        # 2. Links: unconscious LTM <-> LTM traffic.
        for p in self.processors:
            for target, gist, weight in p.drain_outgoing():
                chunk = Chunk.submitted(p.address, t, gist, weight * p.boldness)
                if self.links.send(p.name, target, chunk, t):
                    record["link_traffic"].append((p.name, target, gist))
            for other in p.drain_acks():
                if other in self.by_name and self.links.acknowledge(p.name, other):
                    if (p.name, other) not in record["new_links"]:
                        record["new_links"].append((p.name, other))
        for target, chunk, _ in self.links.drain():
            self.by_name[target].inbox.append(chunk)
        for p in self.processors:
            for chunk in p.inbox:
                p.on_link(chunk, t)
            p.inbox.clear()

        # 3. Input maps: Env -> LTM.
        percepts = self.input_map(t)
        for p in self.processors:
            p.percept = percepts.get(p.name)

        # 4. Up-Tree: everybody competes; the root is conscious content at time t.
        submissions = [p.submit(t) for p in self.processors]
        record["submissions"] = [s for s in submissions if s is not None]
        winner = self.uptree.tick(submissions)
        self.stm = None if winner.is_silent else winner
        record["conscious_content"] = self.stm
        if self.stm is not None:
            self.stream.append(self.stm)

        # 5. Output maps: LTM -> Env.
        commands = []
        for p in self.processors:
            command = p.actuate()
            if command is not None:
                commands.append((p.name, command))
                record["actions"].append((p.name, command))
        # Any processor that keeps a self-model is told what the body just did.
        # Note it is told *that* it acted, not why -- the route is recorded, but
        # a chunk that never reached STM left no conscious trace to explain it.
        for name, command in commands:
            for p in self.processors:
                note = getattr(p, "note_action", None)
                if note is not None:
                    note(t, command.get("about", ""), command.get("route", "conscious"))
        self.output_map(commands, t)

        self.t += 1
        self.trace.append(record)
        return record

    def run(self, ticks: int) -> list[dict]:
        return [self.tick() for _ in range(ticks)]

    # ---- introspection ----------------------------------------------------

    @property
    def mood(self) -> float:
        """CTM's mood at time t: the mood of the chunk now in STM.  It is the sum
        of every processor's signed weight from that competition -- a global
        quantity nobody computed on purpose."""
        return self.stm.mood if self.stm else 0.0

    @property
    def intensity(self) -> float:
        """Energy / enthusiasm / confidence: the same sum, unsigned."""
        return self.stm.intensity if self.stm else 0.0

    def stream_of_consciousness(self, last: int = 20, collapse_idle: bool = True) -> list[str]:
        """The time-ordered chunks broadcast from STM.

        Idle chatter is collapsed by default: a real CTM's stream is mostly
        background hum, and printing all of it hides the moments that matter.
        """
        rows: list[str] = []
        idle_run = 0
        for c in self.stream:
            owner = self.processors[c.address].name
            if collapse_idle and c.gist.modality == "idle":
                idle_run += 1
                continue
            if idle_run:
                rows.append(f"        ... {idle_run} ticks of idle hum ...")
                idle_run = 0
            rows.append(
                f"t={c.t + self.h:>4}  {owner:<14} {c.gist}  (mood {c.mood:+.1f})"
            )
        if idle_run:
            rows.append(f"        ... {idle_run} ticks of idle hum ...")
        return rows[-last:]

    def was_conscious_of(self, modality: str) -> bool:
        return any(c.gist.modality == modality for c in self.stream)
