"""The Up-Tree competition -- paper section 1.3.

A binary tree of height h = ceil(log2 N) whose leaves are the LTM processors and
whose root is STM.  Every non-leaf node holds a tiny circuit that, in one clock
tick, runs a local competition between its two children using a coin-flip neuron
and then adds up their intensities and moods.

The tree is *pipelined*: level s holds the competition that started s ticks ago,
so a competition entered at tick t reaches the root at t + h while a fresh one
starts every tick.  That pipeline is the whole source of the delay to conscious
awareness (section 1.4).
"""

from __future__ import annotations

import math
import random
from typing import Callable, Sequence

from .chunk import Chunk

CompetitionFn = Callable[[Chunk], float]


def coin_flip(a: float, b: float, rng: random.Random) -> bool:
    """The coin-flip neuron: True (pick a) with probability a/(a+b), or 1/2 when a = b = 0."""
    if a < 0 or b < 0:
        raise ValueError(f"coin-flip neuron needs non-negative inputs, got ({a}, {b})")
    total = a + b
    if total == 0:
        return rng.random() < 0.5
    return rng.random() < a / total


def additive_f(mood_coeff: float = 0.0) -> CompetitionFn:
    """f(chunk) = intensity + c * mood, for -1 <= c <= +1.

    This is the family the paper singles out: it is *additive*, which is what
    makes each chunk's share of STM come out exactly proportional to its
    f-value, independently of how processors were shuffled onto the leaves.

    c = 0   -- pure importance; a scream and a cheer of equal size compete equally.
    c > 0   -- an optimist: good news gets a louder voice.
    c < 0   -- a pessimist / anxious CTM: bad news gets a louder voice.
    """
    if not -1.0 <= mood_coeff <= 1.0:
        raise ValueError("mood coefficient must lie in [-1, +1] to keep f non-negative")

    def f(chunk: Chunk) -> float:
        # |mood| <= intensity always holds (mood sums signed weights, intensity
        # sums their absolute values), so this is non-negative by construction;
        # max() only guards float error.
        return max(0.0, chunk.intensity + mood_coeff * chunk.mood)

    return f


class UpTree:
    def __init__(self, n_leaves: int, competition_fn: CompetitionFn, rng: random.Random):
        if n_leaves < 2:
            raise ValueError("need at least 2 leaves")
        self.h = math.ceil(math.log2(n_leaves))
        self.width = 2**self.h  # leaves are padded out to a power of two with silence
        self.n_leaves = n_leaves
        self.f = competition_fn
        self.rng = rng
        self.levels: list[list[Chunk]] = [
            [Chunk.silent() for _ in range(self.width >> s)] for s in range(self.h + 1)
        ]

    def _compete(self, left: Chunk, right: Chunk) -> Chunk:
        """One node's work for one tick: pick a local winner, accumulate the sums."""
        winner = left if coin_flip(self.f(left), self.f(right), self.rng) else right
        return winner.merged(
            intensity=left.intensity + right.intensity,
            mood=left.mood + right.mood,
        )

    def tick(self, submissions: Sequence[Chunk | None]) -> Chunk:
        """Advance every level by one, then seed the leaves with a new round.

        Returns the chunk arriving at the root: the winner of the competition
        that was submitted h ticks ago.
        """
        if len(submissions) > self.n_leaves:
            raise ValueError("more submissions than leaves")

        # Top-down so each level reads its children before they are overwritten.
        for s in range(self.h, 0, -1):
            below = self.levels[s - 1]
            self.levels[s] = [
                self._compete(below[2 * i], below[2 * i + 1])
                for i in range(len(self.levels[s]))
            ]

        leaves = [c if c is not None else Chunk.silent() for c in submissions]
        leaves.extend(Chunk.silent() for _ in range(self.width - len(leaves)))
        self.levels[0] = leaves

        return self.levels[self.h][0]

    def win_probability(self, submissions: Sequence[Chunk | None]) -> list[float]:
        """The share of STM each submission is entitled to, for an additive f.

        Handy for checking the machine against the paper's theorem rather than
        just trusting the tree.
        """
        chunks = [c if c is not None else Chunk.silent() for c in submissions]
        values = [self.f(c) for c in chunks]
        total = sum(values)
        if total == 0:
            return [0.0] * len(chunks)
        return [v / total for v in values]
