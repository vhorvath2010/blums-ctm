"""The one place that says what each request does.

Both transports use this: the local HTTP server, and the in-browser build where
the same Python runs under Pyodide with no server at all.
"""

from __future__ import annotations

from .session import Game


def dispatch(game: Game, path: str, body: dict) -> dict:
    if path == "/api/state":
        return game.view()
    if path == "/api/tick":
        return game.tick(int(body.get("n", 1)))
    if path == "/api/act":
        return game.act(body["control"], body.get("value"))
    if path == "/api/level":
        return game.load(int(body["index"]))
    if path == "/api/retry":
        return game.retry()
    if path == "/api/next":
        return game.next()
    raise KeyError(f"no such endpoint: {path}")
