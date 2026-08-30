"""Poking the machine until phenomena fall out.

Each demo is a hypothesis from the paper turned into an experiment you can run.
Nothing here is special-cased: every result comes from the same Up-Tree, the same
coin-flip neurons and the same broadcast, with one parameter changed.
"""

from __future__ import annotations

from .build import build


def _rule(title: str) -> None:
    print(f"\n{'=' * 72}\n{title}\n{'=' * 72}")


def _stream(machine, last: int = 12) -> None:
    print("\n  stream of consciousness (what reached every processor):")
    for line in machine.stream_of_consciousness(last):
        print("   ", line)


# ---------------------------------------------------------------------------


def blindsight(verbose: bool = True):
    """Section 3.1.

    Damage the route to consciousness, not the seeing. The vision processor's
    gain is crushed so its chunks can never win the Up-Tree competition -- but it
    keeps a direct link to motor. So the CTM reliably avoids an obstacle it
    truthfully reports never having seen.
    """
    machine, world, p = build(vision_gain=0.001, vision_links=("motor",), seed=7)
    machine.links.wire("vision", "motor")

    for _ in range(4):
        machine.tick()
    world.poke("vision", "an obstacle on the left", strength=1.0, duration=3)
    machine.run(14)

    motor, speech = p["motor"], p["inner-speech"]
    routes = motor.route_counts()
    saw_it = machine.was_conscious_of("vision")

    if verbose:
        _rule("BLINDSIGHT (section 3.1)")
        print(f"  vision gain crushed to {p['vision'].gain}; vision--motor link pre-formed")
        print(f"\n  did anything visual ever reach STM?   {saw_it}")
        print(f"  did the machine act on the obstacle?  {bool(motor.acted_on)}")
        print(f"  by which route?                       {routes}")
        print(f"\n  world log:")
        for line in world.recent(4):
            print("   ", line)
        print(f"\n  ask it what it saw:  \"{speech.report('vision')}\"")
        _stream(machine, 8)
        print("\n  -> It acts on visual information it is not conscious of, and says so.")
    return {"conscious_of_vision": saw_it, "acted": bool(motor.acted_on), "routes": routes}


def normal_sight(verbose: bool = True):
    """The control for blindsight: same wiring, undamaged gain."""
    machine, world, p = build(vision_gain=1.0, vision_links=("motor",), seed=7)
    machine.links.wire("vision", "motor")

    for _ in range(4):
        machine.tick()
    world.poke("vision", "an obstacle on the left", strength=1.0, duration=3)
    machine.run(14)

    saw_it = machine.was_conscious_of("vision")
    if verbose:
        _rule("CONTROL: intact vision")
        print(f"  did anything visual reach STM?  {saw_it}")
        print(f"  ask it what it saw:  \"{p['inner-speech'].report('vision')}\"")
        _stream(machine, 8)
    return {"conscious_of_vision": saw_it}


# ---------------------------------------------------------------------------


def inattentional_blindness(verbose: bool = True):
    """Section 3.2.

    Nothing is wrong with the eyes. A demanding task simply submits chunks with
    so much more weight that the gorilla's f-value never wins a coin flip on the
    way up the tree. Disengage the task and the same percept walks straight in.
    """
    results = {}
    for engaged in (True, False):
        machine, world, p = build(seed=11)
        p["task"].engaged = engaged
        machine.run(6)
        world.poke("vision", "a gorilla walks through", strength=1.0, duration=6)
        machine.run(16)
        results[engaged] = machine.was_conscious_of("vision")
        if verbose and engaged:
            _rule("INATTENTIONAL BLINDNESS (section 3.2)")
            print(f"  counting task weight {p['task'].base_weight}, gorilla weight "
                  f"{p['vision'].base_weight}")
            print(f"\n  task engaged   -> gorilla reached STM: {results[True]}")
            _stream(machine, 8)
    if verbose:
        print(f"\n  task disengaged -> gorilla reached STM: {results[False]}")
        print("\n  -> Same eyes, same gorilla. Only the competition changed.")
    return {"engaged": results[True], "disengaged": results[False]}


# ---------------------------------------------------------------------------


def free_will_delay(verbose: bool = True):
    """Section 3.7.

    Put a hand on a stove. The withdrawal happens over a link, at the tick the
    pain arrives. Conscious awareness of the pain arrives h + 1 ticks later. The
    decision is therefore already made and executed by the time it is felt --
    which is the CTM's account of the Libet-style delay.
    """
    machine, world, p = build(seed=3)
    machine.links.wire("nociception", "motor")
    machine.run(5)

    poke_t = machine.t
    world.poke("nociception", "a hot stove", strength=1.5, duration=2)
    machine.run(14)

    motor, mow = p["motor"], p["model-of-world"]
    acted_at = motor.acted_on[0][0] if motor.acted_on else None
    aware_at = next((t for t, m in mow.self_model["aware_of"] if m == "nociception"), None)

    if verbose:
        _rule("FREE WILL: the Up-Tree delay (section 3.7)")
        print(f"  Up-Tree height h = {machine.h}; latency to awareness = h + 1 = {machine.latency} ticks")
        print(f"\n  stove touched at tick        {poke_t}")
        print(f"  hand withdrawn at tick       {acted_at}   (route: {motor.acted_on[0][1]})")
        print(f"  pain consciously felt at     {aware_at}")
        if acted_at is not None and aware_at is not None:
            print(f"  the act preceded the feeling by {aware_at - acted_at} ticks")
        print(f"\n  self-model's record of acting: {mow.self_model['acted'][:2]}")
        _stream(machine, 8)
        print("\n  -> 'I decided to pull my hand away' is a story assembled after the fact.")
    return {"poked": poke_t, "acted": acted_at, "aware": aware_at, "h": machine.h}


# ---------------------------------------------------------------------------


def mood_and_intensity(verbose: bool = True):
    """Section 1.3.

    Mood is not stored anywhere. It is the signed sum of every processor's
    weight, accumulated one addition at a time on the way up the tree, and read
    off whatever chunk happens to win. A global feeling, computed by nobody.
    """
    machine, world, p = build(seed=5)
    machine.run(6)
    world.poke("nociception", "a deep ache", strength=2.0, duration=6)
    rows = []
    machine.run(3)
    for _ in range(8):
        machine.tick()
        content = str(machine.stm.gist) if machine.stm else "--"
        rows.append((machine.t, machine.mood, machine.intensity, content))

    if verbose:
        _rule("MOOD AND INTENSITY AS EMERGENT SUMS (section 1.3)")
        print("   tick     mood   intensity   conscious content")
        for t, mood, intensity, content in rows:
            print(f"   {t:>4}  {mood:+7.2f}   {intensity:9.2f}   {content}")
        print(f"\n  final mood {machine.mood:+.2f} over {len(machine.processors)} processors "
              f"= average mood {machine.mood / len(machine.processors):+.3f}")
        print("\n  -> No processor computed this. Each node did one addition.")
    return {"mood": machine.mood, "intensity": machine.intensity}


# ---------------------------------------------------------------------------


def dreaming(verbose: bool = True):
    """Section 3.5.

    Cut the Input maps and let the memory processor resubmit recombined salient
    chunks. With no sensory competition, those recombinations win STM -- and the
    inner-speech processor narrates them exactly as it narrates waking life.
    """
    machine, world, p = build(seed=13)

    # A day's worth of salient events.
    for label, channel, strength in [("a red ball", "vision", 1.0),
                                     ("a barking dog", "audition", 1.0),
                                     ("a hot stove", "nociception", 1.2)]:
        world.poke(channel, label, strength=strength, duration=4)
        machine.run(10)

    remembered = len(p["memory"].store)

    # Sleep: sensors off, memory on.
    p["memory"].dreaming = True
    machine.stream.clear()
    machine.run(24)

    dreams = [c for c in machine.stream if c.gist.modality == "dream"]
    if verbose:
        _rule("DREAM CREATION (section 3.5)")
        print(f"  salient chunks stored while awake: {remembered}")
        print(f"  dream chunks that reached STM:     {len(dreams)}")
        _stream(machine, 10)
        print("\n  narration during sleep:")
        for line in p["inner-speech"].transcript(4):
            print(f"    {line}")
        print("\n  -> Same machinery, no input. The stream does not notice the difference.")
    return {"stored": remembered, "dreams": len(dreams)}


# ---------------------------------------------------------------------------


def sleeping_experts(verbose: bool = True):
    """Section 1.6.

    A processor that keeps losing while privately believing it had the more
    valuable thing to say raises its own volume until it gets heard. Nobody
    grants it the floor; it takes it.
    """
    machine, world, p = build(seed=17)
    p["task"].engaged = True
    vision = p["vision"]
    start = vision.boldness

    trajectory = []
    for _ in range(60):
        world.poke("vision", "something genuinely important", strength=1.0, duration=1)
        machine.tick()
        trajectory.append(vision.boldness)

    if verbose:
        _rule("SLEEPING EXPERTS (section 1.6)")
        print(f"  vision boldness: {start:.2f} -> {vision.boldness:.2f}")
        print(f"  last verdict from its SEA: {vision.last_verdict}")
        print("  trajectory:", " ".join(f"{b:.2f}" for b in trajectory[::10]))
        print(f"\n  vision reached STM: {machine.was_conscious_of('vision')}")
        print("\n  -> Attention is bought, not allocated.")
    return {"start": start, "end": vision.boldness}


ALL = {
    "blindsight": blindsight,
    "normal-sight": normal_sight,
    "inattention": inattentional_blindness,
    "free-will": free_will_delay,
    "mood": mood_and_intensity,
    "dreaming": dreaming,
    "sleeping-experts": sleeping_experts,
}


def run_all() -> None:
    for demo in ALL.values():
        demo(verbose=True)
    print()
