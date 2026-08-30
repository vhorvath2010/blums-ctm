"""Brainish gists and chunks -- paper section 1.2.

A chunk is a 6-tuple < address, t, gist, weight, intensity, mood >.  Only
`intensity` and `mood` change as a chunk climbs the Up-Tree; address, t, gist
and weight are carried along unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any

SILENT_ADDRESS = -1


@dataclass(frozen=True)
class Gist:
    """A word or phrase of Brainish, the CTM's multi-modal inner language.

    `modality` is what makes it multi-modal: a gist can be a patch of inner
    vision, a twinge of inner sensation, a line of inner speech, a fragment of
    the world model.  `payload` is the structured part other processors read;
    `content` is only for our benefit when printing a stream of consciousness.
    """

    modality: str
    content: str
    payload: dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:
        return f"[{self.modality}] {self.content}"


SILENCE = Gist("silence", "--")


@dataclass(frozen=True)
class Chunk:
    address: int
    t: int
    gist: Gist
    weight: float
    intensity: float
    mood: float

    @classmethod
    def submitted(cls, address: int, t: int, gist: Gist, weight: float) -> "Chunk":
        """A chunk as it enters its leaf of the Up-Tree: intensity = |weight|, mood = weight."""
        return cls(address, t, gist, weight, abs(weight), weight)

    @classmethod
    def silent(cls, t: int = 0) -> "Chunk":
        """A leaf with nothing to say.  Its f-value is 0, so it loses every
        competition it can lose -- but it still contributes 0 to the running
        sums, which is what keeps the tree's arithmetic honest."""
        return cls(SILENT_ADDRESS, t, SILENCE, 0.0, 0.0, 0.0)

    @property
    def is_silent(self) -> bool:
        return self.address == SILENT_ADDRESS

    def merged(self, intensity: float, mood: float) -> "Chunk":
        """This chunk, promoted one level, carrying more global sums."""
        return replace(self, intensity=intensity, mood=mood)

    def __str__(self) -> str:
        return (
            f"<p{self.address} t={self.t} {self.gist} "
            f"w={self.weight:+.2f} i={self.intensity:.2f} m={self.mood:+.2f}>"
        )
