"""A local, stdlib-only server so the CTM can be watched in a browser.

Nothing leaves the machine: it binds 127.0.0.1, serves the static files next to
this module, and exposes a small JSON API that drives one Session.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .session import Session

STATIC = Path(__file__).parent / "static"
_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    session: Session

    # ---- plumbing ---------------------------------------------------------

    def log_message(self, fmt, *args):  # noqa: A003 - quiet by default
        if self.server.verbose:  # type: ignore[attr-defined]
            super().log_message(fmt, *args)

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, payload: dict, status: int = 200) -> None:
        self._send(status, json.dumps(payload).encode(), "application/json")

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    # ---- routes -----------------------------------------------------------

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path == "/api/state":
            with _lock:
                return self._json(Handler.session.snapshot())
        if path == "/api/scenarios":
            return self._json({"scenarios": Session.SCENARIOS})

        name = "index.html" if path == "/" else path.lstrip("/")
        target = (STATIC / name).resolve()
        if not str(target).startswith(str(STATIC.resolve())) or not target.is_file():
            return self._send(404, b"not found", "text/plain")
        kind, _ = mimetypes.guess_type(target.name)
        self._send(200, target.read_bytes(), kind or "application/octet-stream")

    def do_POST(self) -> None:
        path = self.path.split("?")[0]
        body = self._body()
        s = Handler.session
        try:
            with _lock:
                if path == "/api/tick":
                    return self._json(s.tick(int(body.get("n", 1))))
                if path == "/api/poke":
                    return self._json(s.poke(
                        body.get("channel", "vision"),
                        body.get("label") or body.get("channel", "something"),
                        float(body.get("strength", 1.0)),
                        int(body.get("duration", 4)),
                    ))
                if path == "/api/clear":
                    return self._json(s.clear(body["channel"]))
                if path == "/api/gain":
                    return self._json(s.set_gain(body["name"], float(body["gain"])))
                if path == "/api/link":
                    return self._json(s.set_link(body["a"], body["b"], bool(body["on"])))
                if path == "/api/task":
                    return self._json(s.set_task(bool(body.get("on"))))
                if path == "/api/sleep":
                    return self._json(s.set_sleep(bool(body.get("on"))))
                if path == "/api/scenario":
                    return self._json(s.load_scenario(body.get("name", "free")))
                if path == "/api/reset":
                    return self._json(s.reset(int(body.get("seed", 0))))
        except (KeyError, ValueError, TypeError) as exc:
            return self._json({"error": f"{type(exc).__name__}: {exc}"}, status=400)
        self._json({"error": "no such endpoint"}, status=404)


def serve(port: int = 8765, open_browser: bool = True, seed: int = 0,
          verbose: bool = False) -> None:
    Handler.session = Session(seed=seed)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.verbose = verbose  # type: ignore[attr-defined]
    url = f"http://127.0.0.1:{port}/"
    print(f"CTM running at {url}   (ctrl-c to stop)")
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m ctm.viz",
                                 description="Watch a Conscious Turing Machine think.")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)
    serve(port=args.port, open_browser=not args.no_browser,
          seed=args.seed, verbose=args.verbose)
    return 0
