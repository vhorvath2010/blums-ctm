"""One live CTM plus everything a viewer needs to see inside it.

The model is not reimplemented here. This wraps the same machine the tests
exercise and flattens its state into JSON, so anything you watch on screen is
the actual competition, not a picture of one.
"""

from __future__ import annotations

from ..build import build

MODALITY_ORDER = [
    "vision", "audition", "nociception", "inner-speech",
    "world", "dream", "task", "idle", "silence",
]


class Session:
    def __init__(self, seed: int = 0):
        self.reset(seed)

    def reset(self, seed: int = 0) -> dict:
        self.seed = seed
        self.machine, self.world, self.p = build(seed=seed)
        self.caption = (
            "A fresh CTM. Every processor submits a chunk each tick; one wins the "
            "Up-Tree and becomes conscious content. Poke the world and watch."
        )
        self.scenario = "free"
        return self.snapshot()

    # ---- commands ---------------------------------------------------------

    def tick(self, n: int = 1) -> dict:
        for _ in range(max(1, min(n, 200))):
            self.machine.tick()
        return self.snapshot()

    def poke(self, channel: str, label: str, strength: float, duration: int) -> dict:
        self.world.poke(channel, label, strength=strength, duration=duration)
        return self.snapshot()

    def clear(self, channel: str) -> dict:
        self.world.clear(channel)
        return self.snapshot()

    def set_gain(self, name: str, gain: float) -> dict:
        proc = self.p.get(name)
        if proc is not None and hasattr(proc, "gain"):
            proc.gain = gain
        return self.snapshot()

    def set_link(self, a: str, b: str, on: bool) -> dict:
        if on:
            self.machine.links.wire(a, b)
        else:
            self.machine.links.acks[frozenset((a, b))] = 0
        return self.snapshot()

    def set_task(self, engaged: bool) -> dict:
        self.p["task"].engaged = engaged
        return self.snapshot()

    def set_sleep(self, asleep: bool) -> dict:
        self.p["memory"].dreaming = asleep
        if asleep:
            self.world.signals.clear()
        return self.snapshot()

    # ---- scenarios --------------------------------------------------------

    SCENARIOS = {
        "free": "Free play. Nothing is set up; poke the world and step the clock.",
        "normal-sight": (
            "CONTROL. Vision is intact (gain 1.0) and also linked to motor. An "
            "obstacle is in view. Step the clock and watch the amber chunk climb. "
            "Each node is a coin flip weighted by f, so it may take a few ticks "
            "to win -- then it lands in STM and the machine reports seeing it."
        ),
        "blindsight": (
            "BLINDSIGHT. Identical wiring, one change: vision's gain is crushed to "
            "0.001, so its chunks carry f = 0.003 against the idle hum's 0.4 and "
            "are annihilated the moment they meet real competition. The "
            "vision->motor link is untouched. Watch the amber dashed path along "
            "the bottom: that is the obstacle reaching the body without ever "
            "entering the tree. Then ask it what it saw."
        ),
        "inattention": (
            "INATTENTIONAL BLINDNESS. Vision is perfectly healthy. A counting task "
            "is submitting chunks of weight 30 against the gorilla's 3, so the "
            "gorilla loses on the way up. Nothing is broken -- it is outbid. "
            "Untick the counting task and step again."
        ),
        "free-will": (
            "THE DELAY. A hand on a hot stove. The withdrawal fires over the "
            "nociception->motor link on the tick the pain arrives; the pain itself "
            "needs h + 1 ticks to reach awareness. Watch the actuator fire before "
            "the stream reports any pain."
        ),
        "dreaming": (
            "DREAMING. The input maps are closed and memory is recombining stored "
            "salient chunks. With no sensory competition they win STM unopposed, "
            "and inner speech narrates them exactly as it narrates waking life."
        ),
    }

    def load_scenario(self, name: str) -> dict:
        if name not in self.SCENARIOS:
            raise ValueError(f"unknown scenario {name!r}")
        self.reset(self.seed)
        self.scenario = name
        self.caption = self.SCENARIOS[name]
        p, world, machine = self.p, self.world, self.machine

        if name == "normal-sight":
            machine.links.wire("vision", "motor")
            p["vision"].gain = 1.0
            machine.run(4)
            world.poke("vision", "an obstacle on the left", strength=1.0, duration=6)

        elif name == "blindsight":
            machine.links.wire("vision", "motor")
            p["vision"].gain = 0.001
            machine.run(4)
            world.poke("vision", "an obstacle on the left", strength=1.0, duration=6)

        elif name == "inattention":
            p["task"].engaged = True
            machine.run(6)
            world.poke("vision", "a gorilla walks through", strength=1.0, duration=10)

        elif name == "free-will":
            machine.links.wire("nociception", "motor")
            machine.run(5)
            world.poke("nociception", "a hot stove", strength=1.5, duration=4)

        elif name == "dreaming":
            for label, channel, strength in [("a red ball", "vision", 1.0),
                                             ("a barking dog", "audition", 1.0),
                                             ("a hot stove", "nociception", 1.2)]:
                world.poke(channel, label, strength=strength, duration=4)
                machine.run(10)
            p["memory"].dreaming = True
            machine.stream.clear()

        return self.snapshot()

    # ---- the view ---------------------------------------------------------

    def snapshot(self) -> dict:
        m, world = self.machine, self.world
        last = m.trace[-1] if m.trace else {}

        submissions = [p.last_submitted for p in m.processors]
        shares = m.uptree.win_probability(submissions)

        processors = []
        for proc, share in zip(m.processors, shares):
            sub = proc.last_submitted
            processors.append({
                "name": proc.name,
                "address": proc.address,
                "kind": type(proc).__name__,
                "boldness": round(proc.boldness, 3),
                "gain": round(getattr(proc, "gain", 1.0), 4) if hasattr(proc, "gain") else None,
                "modality": getattr(proc, "modality", None),
                "share": round(share, 4),
                "submitted": None if sub is None else {
                    "modality": sub.gist.modality,
                    "content": sub.gist.content,
                    "weight": round(sub.weight, 3),
                    "f": round(m.uptree.f(sub), 3),
                },
                "verdict": proc.last_verdict,
                "story": len(proc.history),
            })

        motor = self.p["motor"]
        speech = self.p["inner-speech"]
        mow = self.p["model-of-world"]

        return {
            "t": m.t,
            "h": m.h,
            "latency": m.latency,
            "scenario": self.scenario,
            "caption": self.caption,
            "stm": None if m.stm is None else {
                "owner": m.processors[m.stm.address].name,
                "modality": m.stm.gist.modality,
                "content": m.stm.gist.content,
                "weight": round(m.stm.weight, 3),
                "intensity": round(m.stm.intensity, 3),
                "mood": round(m.stm.mood, 3),
                "submitted_at": m.stm.t,
                "age": m.t - 1 - m.stm.t,
            },
            "task_engaged": self.p["task"].engaged,
            "asleep": self.p["memory"].dreaming,
            "mood": round(m.mood, 3),
            "intensity": round(m.intensity, 3),
            "tree": m.uptree.snapshot(),
            "processors": processors,
            "stream": [
                {
                    "t": c.t + m.h,
                    "owner": m.processors[c.address].name,
                    "modality": c.gist.modality,
                    "content": c.gist.content,
                    "mood": round(c.mood, 2),
                }
                for c in list(m.stream)[-40:]
            ],
            "speech": [
                {"t": t, "line": line, "about": about}
                for t, line, about in speech.said[-12:]
            ],
            "links": [
                {"a": a, "b": b, "acks": n, "linked": m.links.linked(a, b)}
                for a, b, n in m.links.summary()
            ],
            "link_traffic": [
                {"from": a, "to": b, "modality": g.modality, "content": g.content}
                for a, b, g in last.get("link_traffic", [])
            ],
            "actions": [
                {"processor": name, **cmd} for name, cmd in last.get("actions", [])
            ],
            "acted": [
                {"t": t, "route": route, "about": about}
                for t, route, about in motor.acted_on[-10:]
            ],
            "routes": motor.route_counts(),
            "world": {
                "signals": [
                    {"channel": ch, "label": s.label, "strength": s.strength,
                     "ticks_left": s.ticks_left}
                    for ch, s in world.signals.items()
                ],
                "log": world.recent(8),
            },
            "model_of_world": {
                "model": dict(mow.model),
                "aware_of": [{"t": t, "modality": mod} for t, mod in mow.self_model["aware_of"][-8:]],
                "acted": [{"t": t, "what": w, "route": r} for t, w, r in mow.self_model["acted"][-8:]],
            },
            "conscious_of": {
                mod: m.was_conscious_of(mod) for mod in MODALITY_ORDER
            },
        }
