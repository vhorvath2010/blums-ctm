"""Local server for the game.  Binds 127.0.0.1; nothing leaves the machine."""

from __future__ import annotations

import argparse
import json
import mimetypes
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .routes import dispatch
from .session import Game

STATIC = Path(__file__).parent / "static"
_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    game: Game

    def log_message(self, fmt, *args):
        if getattr(self.server, "verbose", False):
            super().log_message(fmt, *args)

    def _send(self, status, body: bytes, ctype: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, payload: dict, status: int = 200) -> None:
        self._send(status, json.dumps(payload).encode(), "application/json")

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return {}

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path == "/api/state":
            with _lock:
                return self._json(dispatch(Handler.game, path, {}))
        name = "index.html" if path == "/" else path.lstrip("/")
        target = (STATIC / name).resolve()
        if not str(target).startswith(str(STATIC.resolve())) or not target.is_file():
            return self._send(404, b"not found", "text/plain")
        kind, _ = mimetypes.guess_type(target.name)
        self._send(200, target.read_bytes(), kind or "application/octet-stream")

    def do_POST(self) -> None:
        path = self.path.split("?")[0]
        body = self._body()
        g = Handler.game
        try:
            with _lock:
                return self._json(dispatch(g, path, body))
        except KeyError as exc:
            return self._json({"error": str(exc)}, 404)
        except (ValueError, TypeError) as exc:
            return self._json({"error": f"{type(exc).__name__}: {exc}"}, 400)


def serve(port: int = 8766, open_browser: bool = True, verbose: bool = False) -> None:
    Handler.game = Game()
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.verbose = verbose
    url = f"http://127.0.0.1:{port}/"
    print(f"A Machine That Notices — {url}   (ctrl-c to stop)")
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m ctm.game")
    ap.add_argument("--port", type=int, default=8766)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    serve(port=a.port, open_browser=not a.no_browser, verbose=a.verbose)
    return 0
