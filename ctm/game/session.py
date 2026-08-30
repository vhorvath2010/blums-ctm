"""Game state: which level you are on, and what the screen should show."""

from __future__ import annotations

from .levels import LEVELS


class Game:
    def __init__(self):
        self.index = 0
        self.completed: set[int] = set()
        self.load(0)

    # ---- commands ---------------------------------------------------------

    def load(self, index: int) -> dict:
        self.index = max(0, min(index, len(LEVELS) - 1))
        self.level = LEVELS[self.index]()
        # Prime the pipeline so the stage is already alive when you arrive.
        # Until a competition has climbed the whole tree there is nothing in STM
        # and every blob is blank, which reads as a broken screen.
        for _ in range(self.level.machine.h + 1):
            self.level.tick()
        return self.view()

    def retry(self) -> dict:
        return self.load(self.index)

    def next(self) -> dict:
        return self.load(self.index + 1)

    def tick(self, n: int = 1) -> dict:
        for _ in range(max(1, min(n, 400))):
            self.level.tick()
            if self.level.solved:
                self.completed.add(self.level.number)
                break
        return self.view()

    def act(self, control: str, value=None) -> dict:
        self.level.act(control, value)
        return self.view()

    # ---- the view ---------------------------------------------------------

    def view(self) -> dict:
        lv = self.level
        m = lv.machine
        stm = m.stm
        if lv.solved:
            self.completed.add(lv.number)
        return {
            "index": self.index,
            "count": len(LEVELS),
            "completed": sorted(self.completed),
            "level": {
                "number": lv.number,
                "title": lv.title,
                "subtitle": lv.subtitle,
                "premise": lv.premise,
                "goal": lv.goal,
                "lesson": lv.lesson,
                "controls": lv.controls,
                "autoplay": lv.autoplay,
            },
            "menu": [
                {"number": c.number, "title": c.title, "subtitle": c.subtitle}
                for c in LEVELS
            ],
            "t": m.t,
            "h": m.h,
            "latency": m.latency,
            "solved": lv.solved,
            "stage": None if stm is None else {
                "owner": m.processors[stm.address].name,
                "modality": stm.gist.modality,
                "text": stm.gist.content,
                "mood": round(stm.mood, 2),
                "submitted_at": stm.t,
            },
            "blobs": lv.blobs(),
            "extra": lv.extra(),
        }
