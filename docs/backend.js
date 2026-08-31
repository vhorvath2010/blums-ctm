/* One transport, two homes.
 *
 * Run from `python -m ctm.game` there is a local server, and every request is a
 * fetch. Served as a static site there is no server, so the same Python package
 * is loaded into Pyodide and the requests are answered in the page. Either way
 * the model is the one the tests exercise; nothing is reimplemented in JS.
 */

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

let mode = null;       // "http" once a local server answers, else "browser"
let dispatch = null;   // the Python callable, in browser mode
let booting = null;

const onProgress = (msg) => {
  const el = document.getElementById("boot-note");
  if (el) el.textContent = msg;
};

/* The static build stamps its own index.html, so there is nothing to probe. */
function detect() {
  const declared = document.querySelector('meta[name="ctm-backend"]');
  return declared ? declared.content : "http";
}

async function loadScript(src) {
  await new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error(`cannot load ${src}`));
    document.head.appendChild(s);
  });
}

async function boot() {
  onProgress("fetching the python runtime");
  await loadScript(PYODIDE + "pyodide.js");
  const py = await globalThis.loadPyodide({ indexURL: PYODIDE });

  onProgress("loading the model");
  const manifest = await (await fetch("py/manifest.json")).json();
  const sources = await Promise.all(
    manifest.files.map(async (f) => [f, await (await fetch(`py/${f}`)).text()]));

  py.FS.mkdirTree("/model");
  for (const [file, text] of sources) {
    const dir = "/model/" + file.split("/").slice(0, -1).join("/");
    if (dir !== "/model/") py.FS.mkdirTree(dir);
    py.FS.writeFile("/model/" + file, text);
  }

  onProgress("starting the machine");
  py.runPython(`
import sys, json
sys.path.insert(0, "/model")
from ctm.game import Game, dispatch as _dispatch

_game = Game()

def _call(path, body_json):
    """The same routing table the local server uses."""
    try:
        body = json.loads(body_json or "{}")
        return json.dumps(_dispatch(_game, path, body))
    except KeyError as exc:
        return json.dumps({"error": str(exc)})
    except (ValueError, TypeError) as exc:
        return json.dumps({"error": f"{type(exc).__name__}: {exc}"})
`);
  dispatch = py.globals.get("_call");
  onProgress("");
}

export async function call(path, body) {
  if (mode === null) mode = detect();

  if (mode === "http") {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res.json();
  }

  if (!dispatch) {
    booting = booting || boot();
    await booting;
  }
  return JSON.parse(dispatch(path, JSON.stringify(body || {})));
}

export const isInBrowser = () => mode === "browser";
