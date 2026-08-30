"""A one-room environment you can poke.

The paper leaves Env as "a subset of R^m(t)".  This is the smallest thing that
still gives the CTM something to be right and wrong about: a few signals that
decay, and actuators that can change them.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Signal:
    label: str
    strength: float
    ticks_left: int
    detail: dict = field(default_factory=dict)


class World:
    #: which processor each sensor feeds (the Input map's wiring)
    SENSORS = {"vision": "vision", "audition": "audition", "nociception": "nociception"}

    def __init__(self):
        self.signals: dict[str, Signal] = {}
        self.log: list[tuple[int, str]] = []
        self.hand_withdrawn = False

    # ---- poking -----------------------------------------------------------

    def poke(self, channel: str, label: str, strength: float = 1.0,
             duration: int = 1, **detail) -> None:
        if channel not in self.SENSORS:
            raise ValueError(f"no sensor for {channel!r}; have {sorted(self.SENSORS)}")
        self.signals[channel] = Signal(label, strength, duration, detail)

    def clear(self, channel: str) -> None:
        self.signals.pop(channel, None)

    # ---- the Input map ----------------------------------------------------

    def present(self, t: int) -> dict[str, object]:
        percepts: dict[str, object] = {}
        for channel, signal in list(self.signals.items()):
            if signal.ticks_left <= 0:
                del self.signals[channel]
                continue
            percepts[self.SENSORS[channel]] = {
                "channel": channel,
                "label": signal.label,
                "strength": signal.strength,
                **signal.detail,
            }
            signal.ticks_left -= 1
        return percepts

    # ---- the Output map ---------------------------------------------------

    def act(self, processor: str, command: dict, t: int) -> None:
        action = command.get("action")
        self.log.append((t, f"{processor}: {action} {command.get('about', '')}".strip()))
        if action == "withdraw":
            self.hand_withdrawn = True
            self.clear("nociception")   # taking your hand off the stove works
        elif action == "avoid":
            # The obstacle is still there; it is being steered around.  Leaving it
            # in place keeps the unconscious route firing so it can be watched.
            pass

    def recent(self, n: int = 10) -> list[str]:
        return [f"t={t:>4}  {msg}" for t, msg in self.log[-n:]]
