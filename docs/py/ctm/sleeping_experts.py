"""Sleeping Experts -- paper section 1.6.

Processors do not learn *what* to say here; they learn how loudly to say it.
SEA nudges a processor's `boldness`, the multiplier it puts on the |weight| of
everything it submits:

  embolden -- my chunk lost, and in my opinion my gist was worth more than
              whatever did get into STM.
  hush     -- my chunk won, and in my opinion something I have since seen was
              worth more.  (This arrives late, as the paper notes.)

"In my opinion" is load-bearing: the comparison uses the processor's own
`appraise()`, not a global oracle.  Nothing in the CTM has a view from nowhere.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SleepingExperts:
    up: float = 1.30
    down: float = 0.80
    floor: float = 0.02
    ceiling: float = 20.0
    margin: float = 1e-9

    def review(self, processor, submitted, winner) -> str | None:
        """Called once per broadcast.  Returns the verdict, for the curious."""
        if submitted is None or winner is None:
            return None

        mine = processor.appraise(submitted.gist)
        theirs = processor.appraise(winner.gist)
        won = winner.address == processor.address and winner.t == submitted.t

        if not won and mine > theirs + self.margin:
            processor.boldness = min(self.ceiling, processor.boldness * self.up)
            return "embolden"
        if won and theirs + self.margin < processor.best_missed_value:
            processor.boldness = max(self.floor, processor.boldness * self.down)
            return "hush"
        return None
