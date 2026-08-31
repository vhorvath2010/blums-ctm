"""Build the static site in docs/ for GitHub Pages.

The browser build runs the same Python package as everything else, under
Pyodide, so there is no second implementation of the model to keep in step. This
script copies the front end and the subset of the package the game imports, then
writes a manifest the loader reads.

    python tools/build_pages.py

Then in the repository settings, set Pages to deploy from the main branch,
/docs.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "ctm" / "game" / "static"
DOCS = ROOT / "docs"

# Only what the game actually imports. The CLI, the demos and the HTTP server
# are all left out: nothing in the browser build reaches them.
PY_FILES = [
    "ctm/__init__.py",
    "ctm/chunk.py",
    "ctm/uptree.py",
    "ctm/processor.py",
    "ctm/sleeping_experts.py",
    "ctm/links.py",
    "ctm/machine.py",
    "ctm/world.py",
    "ctm/processors.py",
    "ctm/game/__init__.py",
    "ctm/game/levels.py",
    "ctm/game/session.py",
    "ctm/game/routes.py",
]


def check_imports_are_covered() -> list[str]:
    """Import the package with only the listed files visible, so a missing one
    is caught here rather than as a blank page in a browser."""
    import subprocess
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        sandbox = Path(tmp)
        for rel in PY_FILES:
            dst = sandbox / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / rel, dst)
        probe = (
            "from ctm.game import Game, dispatch\n"
            "g = Game()\n"
            "for i in range(6):\n"
            "    dispatch(g, '/api/level', {'index': i})\n"
            "    dispatch(g, '/api/tick', {'n': 5})\n"
            "print('OK')\n"
        )
        out = subprocess.run([sys.executable, "-c", probe], cwd=sandbox,
                             capture_output=True, text=True)
    return [] if out.stdout.strip().endswith("OK") else [out.stderr.strip()]


def main() -> int:
    problems = check_imports_are_covered()
    if problems:
        print("the file list is incomplete; the browser build would fail:\n")
        print(problems[0])
        return 1

    if DOCS.exists():
        shutil.rmtree(DOCS)
    (DOCS / "py").mkdir(parents=True)

    for name in ("style.css", "app.js", "paint.js", "backend.js"):
        shutil.copy2(STATIC / name, DOCS / name)

    # Declare the backend rather than letting the page probe for a server it
    # will not find; a probe costs a 404 in the console on every load.
    html = (STATIC / "index.html").read_text(encoding="utf-8")

    # A Pages project site lives at /<repo>/, so a root-absolute asset path
    # resolves against the domain instead and 404s. Serving docs/ at a local
    # root hides this, so check the source rather than trusting a smoke test.
    import re
    rooted = re.findall(r'(?:src|href)="(/[^/][^"]*)"', html)
    if rooted:
        print("index.html uses root-absolute asset paths, which break on a")
        print("project Pages site. Make these relative: " + ", ".join(rooted))
        return 1

    marker = '<meta name="ctm-backend" content="browser">'
    assert marker not in html
    html = html.replace("<title>", marker + "\n<title>", 1)
    (DOCS / "index.html").write_text(html, encoding="utf-8")

    for rel in PY_FILES:
        dst = DOCS / "py" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, dst)

    (DOCS / "py" / "manifest.json").write_text(
        json.dumps({"files": PY_FILES}, indent=2), encoding="utf-8")

    # Pages runs Jekyll by default, which would ignore nothing here but adds a
    # build step and can swallow files beginning with an underscore.
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")

    total = sum(f.stat().st_size for f in DOCS.rglob("*") if f.is_file())
    print(f"built docs/  ({len(PY_FILES)} python files, {total / 1024:.0f} KB)")
    print("serve locally with:  python -m http.server -d docs 8080")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
