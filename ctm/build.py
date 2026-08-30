"""A standard little mind, so the demos and the REPL start from the same place."""

from __future__ import annotations

from .machine import ConsciousTuringMachine
from .processors import (
    DistractorProcessor,
    IdleProcessor,
    InnerSpeechProcessor,
    MemoryProcessor,
    ModelOfTheWorldProcessor,
    MotorProcessor,
    SensoryProcessor,
)
from .world import World


def build(
    *,
    vision_gain: float = 1.0,
    vision_links: tuple[str, ...] = (),
    mood_coeff: float = 0.0,
    seed: int | None = 0,
    n_idle: int = 8,
) -> tuple[ConsciousTuringMachine, World, dict]:
    """Return (machine, world, processors-by-name).

    `n_idle` pads LTM out so the Up-Tree has some height and the competition has
    some noise in it. With 16 processors h = 4, so conscious awareness lags
    submission by 5 ticks -- the toy equivalent of the paper's ~2.4 seconds.
    """
    world = World()

    vision = SensoryProcessor("vision", "vision", base_weight=3.0,
                              gain=vision_gain, link_targets=vision_links)
    audition = SensoryProcessor("audition", "audition", base_weight=2.5)
    nociception = SensoryProcessor("nociception", "nociception",
                                   base_weight=6.0, valence=-1.0,
                                   link_targets=("motor",))
    motor = MotorProcessor()
    speech = InnerSpeechProcessor()
    mow = ModelOfTheWorldProcessor()
    memory = MemoryProcessor()
    task = DistractorProcessor()

    named = [vision, audition, nociception, motor, speech, mow, memory, task]
    idle = [IdleProcessor(f"idle-{i}") for i in range(n_idle)]

    machine = ConsciousTuringMachine(named + idle, world=world,
                                     mood_coeff=mood_coeff, seed=seed)
    return machine, world, {p.name: p for p in machine.processors}
