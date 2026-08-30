"""LTM processors -- paper section 1.1.

Every processor lives in LTM; nothing lives in STM but the single winning chunk.
A processor is defined by three things:

  propose(t)              -- what, if anything, it wants to say this tick
  on_broadcast(chunk, t)  -- what it does when conscious content reaches it
  appraise(gist)          -- what it privately thinks any gist is worth

Everything else here -- boldness, the stored history, the acknowledgements that
grow links -- is machinery the paper attaches to all processors alike.
"""

from __future__ import annotations

from typing import Any

from .chunk import Chunk, Gist
from .sleeping_experts import SleepingExperts


class LTMProcessor:
    #: modalities this processor cares about when appraising someone else's gist
    interests: tuple[str, ...] = ()

    def __init__(self, name: str, *, base_weight: float = 1.0):
        self.name = name
        self.address: int = -1
        self.base_weight = base_weight
        self.boldness = 1.0
        self.sea = SleepingExperts()

        self.percept: Any = None            # from an Input map, this tick
        self.inbox: list[Chunk] = []        # arrived over links, this tick
        self.history: list[Chunk] = []      # section 1.5: the high level story
        self.last_submitted: Chunk | None = None
        self.last_verdict: str | None = None
        self.best_missed_value = 0.0        # best thing SEA has seen lose
        self.awake = True
        self.partners: tuple[str, ...] = ()  # who it is linked to, refreshed each tick

        self._queued: tuple[Gist, float] | None = None
        self._outgoing: list[tuple[str, Gist, float]] = []
        self._acks: list[str] = []

    # ---- to be overridden -------------------------------------------------

    def propose(self, t: int) -> tuple[Gist, float] | None:
        """Return (gist, weight) to enter this tick's competition, or None to stay silent."""
        return None

    def on_broadcast(self, chunk: Chunk, t: int) -> None:
        """React to conscious content.  May call self.say(), self.tell(), self.ack()."""

    def on_link(self, chunk: Chunk, t: int) -> None:
        """React to a chunk that arrived unconsciously, over a link."""

    def appraise(self, gist: Gist) -> float:
        """This processor's private opinion of a gist's worth. Its own specialty
        is what it can judge; outside it, it mostly shrugs."""
        return 1.0 if gist.modality in self.interests else 0.0

    def actuate(self) -> dict | None:
        """Output map: a command for an actuator, or None."""
        return None

    # ---- machinery --------------------------------------------------------

    def say(self, gist: Gist, weight: float) -> None:
        """Queue a gist for the *next* competition (used from on_broadcast)."""
        self._queued = (gist, weight)

    def tell(self, target: str, gist: Gist, weight: float) -> None:
        """Send a gist straight to a linked processor, bypassing STM entirely."""
        self._outgoing.append((target, gist, weight))

    def ack(self, other: str) -> None:
        """Declare that `other`'s contribution was useful.  Enough of these and a link forms."""
        self._acks.append(other)

    def submit(self, t: int) -> Chunk | None:
        proposal = self.propose(t)
        if proposal is None:
            proposal, self._queued = self._queued, None
        if proposal is None:
            self.last_submitted = None
            return None
        gist, weight = proposal
        chunk = Chunk.submitted(self.address, t, gist, weight * self.boldness)
        self.last_submitted = chunk
        return chunk

    def receive_broadcast(self, chunk: Chunk, t: int) -> None:
        self.history.append(chunk)
        if self.last_submitted is not None:
            value = self.appraise(self.last_submitted.gist)
            if chunk.address != self.address:
                self.best_missed_value = max(self.best_missed_value, value)
            self.last_verdict = self.sea.review(self, self.last_submitted, chunk)
        self.on_broadcast(chunk, t)

    def drain_outgoing(self) -> list[tuple[str, Gist, float]]:
        out, self._outgoing = self._outgoing, []
        return out

    def drain_acks(self) -> list[str]:
        out, self._acks = self._acks, []
        return out

    def __repr__(self) -> str:
        return f"<{type(self).__name__} {self.name} @{self.address} boldness={self.boldness:.2f}>"
