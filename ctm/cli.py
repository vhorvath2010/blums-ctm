"""An interactive prod-and-poke shell for the CTM.

    python -m ctm             # REPL
    python -m ctm demos       # run every demo
    python -m ctm demo free-will
"""

from __future__ import annotations

import shlex
import sys

from .build import build
from .demos import ALL as DEMOS, run_all

HELP = """
commands
  step [n]                  advance n clock ticks (default 1)
  poke <channel> <label...> present a stimulus; channel: vision | audition | nociception
        [-s STRENGTH] [-d DURATION]
  clear <channel>           remove a stimulus
  stm                       what is conscious content right now
  stream [n]                the last n broadcasts (the stream of consciousness)
  say [n]                   inner speech: what the machine reports noticing
  world                     the model-of-world processor's picture, and its surprises
  self                      the self-model: what it is aware of, what it did
  procs                     every LTM processor, its boldness and last submission
  links                     acknowledgement counts and formed links
  ltm <name>                one processor's high level story (section 1.5)
  wire <a> <b>              pre-form a link between two processors
  gain <name> <value>       set a sensory processor's gain (crush it for blindsight)
  task on|off               engage the distracting counting task
  sleep on|off              close the input maps and let memory dream
  odds                      each processor's entitled share of STM this tick
  reset [--seed N]          start a fresh machine
  demo [name] | demos       run a scripted experiment
  help | quit
"""


class Shell:
    def __init__(self, seed: int = 0):
        self.reset(seed)

    def reset(self, seed: int = 0) -> None:
        self.machine, self.world, self.p = build(seed=seed)
        print(f"a fresh CTM: {len(self.machine.processors)} LTM processors, "
              f"Up-Tree height h={self.machine.h}, "
              f"awareness lags submission by {self.machine.latency} ticks")

    # ---- commands ---------------------------------------------------------

    def do_step(self, n: str = "1") -> None:
        for _ in range(int(n)):
            self.machine.tick()
        self.do_stm()

    def do_poke(self, *args: str) -> None:
        if not args:
            return print("poke <channel> <label...> [-s STRENGTH] [-d DURATION]")
        channel, rest = args[0], list(args[1:])
        strength, duration = 1.0, 3
        for flag, cast in (("-s", float), ("-d", int)):
            if flag in rest:
                i = rest.index(flag)
                value = cast(rest[i + 1])
                del rest[i:i + 2]
                if flag == "-s":
                    strength = value
                else:
                    duration = value
        label = " ".join(rest) or channel
        self.world.poke(channel, label, strength=strength, duration=duration)
        print(f"  {channel}: {label!r} (strength {strength}, {duration} ticks)")

    def do_clear(self, channel: str) -> None:
        self.world.clear(channel)

    def do_stm(self) -> None:
        m = self.machine
        if m.stm is None:
            return print(f"t={m.t}  STM: (silent)")
        owner = m.processors[m.stm.address].name
        print(f"t={m.t}  STM: {m.stm.gist}   from {owner}   "
              f"mood {m.mood:+.2f}  intensity {m.intensity:.2f}")

    def do_stream(self, n: str = "20") -> None:
        for line in self.machine.stream_of_consciousness(int(n)):
            print("  ", line)

    def do_say(self, n: str = "8") -> None:
        lines = self.p["inner-speech"].transcript(int(n))
        print("\n".join("  " + l for l in lines) or "  (it has said nothing)")

    def do_world(self) -> None:
        mow = self.p["model-of-world"]
        print("  model of the world:")
        for modality, content in mow.model.items():
            print(f"    {modality:<14} {content}")
        if mow.surprises:
            print("  surprises:")
            for t, was, now in mow.surprises[-5:]:
                print(f"    t={t:>4}  {was} -> {now}")

    def do_self(self) -> None:
        mow = self.p["model-of-world"]
        aware = mow.self_model["aware_of"][-8:]
        acted = mow.self_model["acted"][-8:]
        print("  recently aware of:", ", ".join(f"{m}@{t}" for t, m in aware) or "nothing")
        print("  recently did:     ", ", ".join(f"{w}@{t} ({r})" for t, w, r in acted) or "nothing")
        unexplained = [a for a in acted if a[2] == "unconscious"]
        if unexplained:
            print(f"  -> {len(unexplained)} action(s) it took with no conscious record of why.")

    def do_procs(self) -> None:
        print(f"  {'processor':<16}{'addr':>5}{'bold':>7}   last submission")
        for p in self.machine.processors:
            last = str(p.last_submitted.gist) if p.last_submitted else "-"
            print(f"  {p.name:<16}{p.address:>5}{p.boldness:>7.2f}   {last}")

    def do_links(self) -> None:
        rows = self.machine.links.summary()
        if not rows:
            return print("  no acknowledgements yet (everything still goes through STM)")
        for a, b, n in rows:
            mark = "LINKED" if self.machine.links.linked(a, b) else "      "
            print(f"  {mark}  {a} -- {b}  ({n})")

    def do_ltm(self, name: str) -> None:
        p = self.p.get(name)
        if p is None:
            return print(f"  no processor {name!r}; try `procs`")
        print(f"  {name}: {len(p.history)} chunks in its high level story")
        for c in p.history[-10:]:
            print(f"    t={c.t + self.machine.h:>4}  {c.gist}")

    def do_wire(self, a: str, b: str) -> None:
        self.machine.links.wire(a, b)
        print(f"  linked {a} -- {b}; their traffic is now unconscious")

    def do_gain(self, name: str, value: str) -> None:
        self.p[name].gain = float(value)
        print(f"  {name}.gain = {value}")

    def do_task(self, state: str = "on") -> None:
        self.p["task"].engaged = state == "on"
        print(f"  counting task {'engaged' if state == 'on' else 'disengaged'}")

    def do_sleep(self, state: str = "on") -> None:
        asleep = state == "on"
        self.p["memory"].dreaming = asleep
        if asleep:
            self.world.signals.clear()
        print("  asleep: input maps quiet, memory recombining" if asleep else "  awake")

    def do_odds(self) -> None:
        subs = [p.last_submitted for p in self.machine.processors]
        shares = self.machine.uptree.win_probability(subs)
        rows = sorted(zip(self.machine.processors, shares), key=lambda r: -r[1])
        print("  entitled share of STM (additive f -- the paper's theorem):")
        for p, share in rows[:8]:
            if share > 0:
                bar = "#" * int(share * 40)
                print(f"    {p.name:<16}{share:6.1%}  {bar}")

    def do_demo(self, name: str = "") -> None:
        if not name:
            return print("  demos: " + ", ".join(DEMOS))
        fn = DEMOS.get(name)
        if fn is None:
            return print(f"  no demo {name!r}; have: {', '.join(DEMOS)}")
        fn(verbose=True)

    def do_demos(self) -> None:
        run_all()

    def do_help(self) -> None:
        print(HELP)

    # ---- loop -------------------------------------------------------------

    def run(self) -> None:
        print(HELP)
        while True:
            try:
                raw = input(f"ctm[t={self.machine.t}]> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return
            if not raw:
                continue
            parts = shlex.split(raw)
            name, args = parts[0], parts[1:]
            if name in ("quit", "exit", "q"):
                return
            handler = getattr(self, f"do_{name.replace('-', '_')}", None)
            if handler is None:
                print(f"  unknown command {name!r}; try `help`")
                continue
            try:
                handler(*args)
            except TypeError as exc:
                print(f"  {exc}")
            except Exception as exc:  # noqa: BLE001 - it's a REPL
                print(f"  {type(exc).__name__}: {exc}")


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "demos":
        run_all()
        return 0
    if argv and argv[0] == "demo":
        name = argv[1] if len(argv) > 1 else ""
        if name not in DEMOS:
            print("demos: " + ", ".join(DEMOS))
            return 1
        DEMOS[name](verbose=True)
        return 0
    Shell().run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
