"""Links -- paper section 1.1, "Links, Unconscious Communication & Global Ignition".

At birth no processors are linked, so every exchange has to go through STM and is
therefore conscious.  When A repeatedly finds B's answers useful, a link forms and
that same traffic moves off-stage: the CTM keeps doing the thing, and stops being
aware that it is doing it.  This is the mechanism behind the blindsight demo.
"""

from __future__ import annotations

from collections import defaultdict


class LinkTable:
    def __init__(self, threshold: int = 3):
        self.threshold = threshold
        self.acks: dict[frozenset, int] = defaultdict(int)
        self._queue: list[tuple[str, object, int]] = []

    def acknowledge(self, a: str, b: str, times: int = 1) -> bool:
        """A found B's chunk useful.  Returns True if this formed/strengthened a link."""
        if a == b:
            return False
        self.acks[frozenset((a, b))] += times
        return self.linked(a, b)

    def strength(self, a: str, b: str) -> int:
        return self.acks.get(frozenset((a, b)), 0)

    def linked(self, a: str, b: str) -> bool:
        return self.strength(a, b) >= self.threshold

    def wire(self, a: str, b: str) -> None:
        """Pre-form a link (a lifetime of learning we are not going to simulate)."""
        self.acks[frozenset((a, b))] = self.threshold

    def partners(self, name: str) -> list[str]:
        out = []
        for pair, n in self.acks.items():
            if name in pair and n >= self.threshold:
                (other,) = pair - {name}
                out.append(other)
        return sorted(out)

    def send(self, sender: str, target: str, chunk, t: int) -> bool:
        """Unconscious point-to-point traffic.  Only travels an existing link."""
        if not self.linked(sender, target):
            return False
        self._queue.append((target, chunk, t))
        return True

    def drain(self) -> list[tuple[str, object, int]]:
        out, self._queue = self._queue, []
        return out

    def summary(self) -> list[tuple[str, str, int]]:
        rows = []
        for pair, n in self.acks.items():
            a, b = sorted(pair)
            rows.append((a, b, n))
        return sorted(rows, key=lambda r: -r[2])
