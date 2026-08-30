/* The game holds no model state. Every frame is a snapshot of the Python CTM;
   every control is a command sent to it. */

const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";

const PALETTE = {
  red: "#BE3A25", blue: "#4A6FB5", yellow: "#EFC034",
  ink: "#1B1815", green: "#5E8C61", task: "#EFC034",
  idle: "#CFC9BD", silence: "#DAD5CA",
};
const hue = (m) => PALETTE[m] || PALETTE.idle;
// Ochre and paper-ish fills need dark text on them; the rest take paper.
const darkText = (m) =>
  m === "yellow" || m === "task" || m === "idle" || m === "silence";

let state = null;
let playing = null;

/* --------------------------------------------------- hand-torn shapes */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A closed Catmull-Rom spline through jittered points: the torn-paper look,
   generated rather than hand-drawn so every blob is a unique shape but a given
   processor keeps the same one across frames. */
function blobPath(seed, rx, ry = rx, wobble = 0.16, n = 9) {
  const rnd = mulberry32(seed * 2654435761 % 2147483647);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.12;
    const k = 1 - wobble + rnd() * wobble * 2;
    pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]);
  }
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i];
    const p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)}, ${c2[0].toFixed(2)} ` +
         `${c2[1].toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + " Z";
}

function blob(svg, { x, y, rx, ry, seed, fill, opacity = 1, cls = "", onClick }) {
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("transform", `translate(${x} ${y})`);
  if (cls) g.setAttribute("class", cls);
  const path = document.createElementNS(SVGNS, "path");
  path.setAttribute("d", blobPath(seed, rx, ry ?? rx));
  path.setAttribute("fill", fill);
  path.setAttribute("opacity", opacity);
  g.appendChild(path);
  if (onClick) { g.classList.add("clickable"); g.addEventListener("click", onClick); }
  svg.appendChild(g);
  return g;
}

function label(svg, { x, y, text, size = 20, cls = "blob-label", dark = false }) {
  const t = document.createElementNS(SVGNS, "text");
  t.setAttribute("x", x); t.setAttribute("y", y);
  t.setAttribute("class", cls + (dark ? " dark" : ""));
  t.setAttribute("font-size", size);
  t.textContent = text;
  svg.appendChild(t);
  return t;
}

/* A decorative blob behind a piece of text (the menu-highlight effect). */
function swatch(host, colour, seed, tilt = -2) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "swatch");
  svg.setAttribute("viewBox", "-60 -30 120 60");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.setProperty("--tilt", `${tilt}deg`);
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("d", blobPath(seed, 56, 26, 0.1, 11));
  p.setAttribute("fill", colour);
  svg.appendChild(p);
  host.prepend(svg);
}

/* ------------------------------------------------------------ network */

async function call(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) { console.error(data.error); return state; }
  const wasSolved = state && state.solved;
  state = data;
  render();
  if (state.solved && !wasSolved) showCurtain();
  return data;
}

const act = (control, value) => call("/api/act", { control, value });
const step = (n = 1) => call("/api/tick", { n });

function setPlaying(on) {
  if (playing) { clearInterval(playing); playing = null; }
  if (on) playing = setInterval(() => { if (!state.solved) step(1); }, 620);
}

/* ------------------------------------------------------------- title */

function buildTitle() {
  const svg = document.querySelector(".logo-blobs");
  [[170, 120, 92, PALETTE.blue, 3], [330, 92, 80, PALETTE.red, 7],
   [452, 196, 74, PALETTE.yellow, 11]].forEach(([x, y, r, c, s]) =>
    blob(svg, { x, y, rx: r, ry: r * 0.92, seed: s, fill: c }));
}

function buildMenu() {
  const nav = $("menu");
  nav.innerHTML = "";
  const colours = [PALETTE.blue, PALETTE.red, PALETTE.yellow];
  state.menu.forEach((lv, i) => {
    const b = document.createElement("button");
    b.className = "menu-item" + (state.completed.includes(lv.number) ? " done" : "");
    b.innerHTML = `<span class="no">${String(lv.number).padStart(2, "0")}</span>` +
                  `${lv.title.toUpperCase()}`;
    swatch(b, colours[i % 3], 20 + i * 5, i % 2 ? 2 : -2.5);
    b.onclick = () => { call("/api/level", { index: i }).then(() => showPlay()); };
    nav.appendChild(b);
  });
}

const showMenu = () => {
  setPlaying(false);
  buildMenu();
  $("screen-title").hidden = false;
  $("screen-play").hidden = true;
  $("curtain").hidden = true;
};

const showPlay = () => {
  $("screen-title").hidden = true;
  $("screen-play").hidden = false;
  $("curtain").hidden = true;
  setPlaying(state.level.autoplay);
};

/* -------------------------------------------------------------- play */

function render() {
  if (!state) return;
  const lv = state.level;
  $("hud-no").textContent = String(lv.number).padStart(2, "0");
  $("hud-name").textContent = lv.title;
  $("hud-tick").textContent = `t ${state.t}`;
  $("premise").textContent = lv.premise;
  $("goal").textContent = lv.goal;
  renderStage();
  renderControls();
  renderProgress();
  renderReadout();
}

/* One stage picture for every level: the crowd along the bottom, the single
   conscious chunk at the top, and whatever happens in between. */
function renderStage() {
  const svg = $("stage");
  svg.innerHTML = "";
  // Room for a full-size crowd blob (r up to 70) plus its caption, and for the
  // link arc that dips below them, without spilling past the viewBox.
  const W = 900, TOP = 88, FLOOR = 330;
  const n = state.level.number;

  // --- the stage itself -------------------------------------------------
  const s = state.stage;
  label(svg, { x: W / 2, y: 20, text: "ON STAGE", size: 12, cls: "caption" });
  if (s) {
    const big = 58;
    blob(svg, { x: W / 2, y: TOP, rx: big * 1.9, ry: big, seed: 99,
                fill: hue(s.modality) });
    const room = big * 1.9 * 1.75;                    // usable width inside it
    const size = Math.max(15, Math.min(38, room / (s.text.length * 0.46)));
    label(svg, { x: W / 2, y: TOP + size * 0.34, text: s.text, size,
                 dark: darkText(s.modality) });
  } else {
    label(svg, { x: W / 2, y: TOP + 10, text: "silence", size: 30,
                 cls: "caption" });
  }

  const line = document.createElementNS(SVGNS, "path");
  line.setAttribute("class", "rule");
  line.setAttribute("d", `M 60 ${TOP + 102} L ${W - 60} ${TOP + 102}`);
  svg.appendChild(line);

  // --- level 3 draws the climb between crowd and stage ------------------
  if (n === 3 && state.extra.tree) drawClimb(svg, W, TOP + 120, FLOOR - 78);

  // --- the crowd --------------------------------------------------------
  let show = state.blobs;
  if (n >= 3) {
    const voices = show.filter((b) => b.modality !== "idle");
    const hum = show.filter((b) => b.modality === "idle");
    show = voices.slice(0, 6);
    if (hum.length) {
      show.push({
        name: "crowd", address: 900, modality: "idle",
        text: `${hum.length} others`,
        f: Math.round(hum.reduce((a, b) => a + b.f, 0) * 100) / 100,
      });
    }
  }
  show = show.slice(0, 8);
  const maxF = Math.max(...show.map((b) => b.f), 0.001);
  show.forEach((b, i) => {
    const x = W * ((i + 0.5) / show.length);
    const r = 26 + 44 * Math.sqrt(b.f / maxF);
    const clickable = n === 1;
    blob(svg, {
      x, y: FLOOR, rx: r * 1.25, ry: r, seed: b.address + 3, fill: hue(b.modality),
      onClick: clickable ? () => act("louder", b.name) : null,
    });
    const size = Math.min(26, 12 + r * 0.28);
    const fits = b.text.length * size * 0.46 < r * 2.3;
    if (fits) {
      label(svg, { x, y: FLOOR + 8, text: b.text, size, dark: darkText(b.modality) });
      label(svg, { x, y: FLOOR + r + 22, text: `volume ${b.f}`, size: 12,
                   cls: "caption" });
    } else {
      label(svg, { x, y: FLOOR + r + 26, text: b.text, size: 20, dark: true });
      label(svg, { x, y: FLOOR + r + 44, text: `volume ${b.f}`, size: 12,
                   cls: "caption" });
    }
  });

  if (n === 4 || n === 6) drawLink(svg, W, FLOOR);
}

/* The tree, drawn only as far as it needs to be understood: rows of small
   marks, with the shouted chunk coloured as it climbs. */
function drawClimb(svg, W, top, bottom) {
  const levels = state.extra.tree;
  const rows = levels.length;
  for (let s = rows - 1; s >= 1; s--) {
    const y = top + ((rows - 1 - s) / (rows - 1)) * (bottom - top);
    levels[s].forEach((node, i) => {
      const x = W * ((i + 0.5) / levels[s].length);
      const loud = !node.silent && node.f > 5;
      blob(svg, {
        x, y, rx: loud ? 15 : 7, ry: loud ? 10 : 5, seed: s * 31 + i,
        fill: loud ? PALETTE.red : PALETTE.idle, opacity: loud ? 1 : 0.7,
      });
    });
    label(svg, { x: 22, y: y + 4, text: `t−${s}`, size: 11, cls: "caption" });
  }
}

/* The route that skips the stage entirely. */
function drawLink(svg, W, floor) {
  const on = state.level.number === 6 ||
             (state.extra.routes && state.extra.routes.unconscious > 0);
  if (!on) return;
  const blobs = state.blobs.slice(0, 8);
  if (blobs.length < 2) return;
  const a = W * (0.5 / blobs.length), b = W * ((blobs.length - 0.5) / blobs.length);
  const dip = floor + 100;
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("d", `M ${a} ${floor + 46} C ${a} ${dip}, ${b} ${dip}, ${b} ${floor + 46}`);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", PALETTE.red);
  p.setAttribute("stroke-width", 2.5);
  p.setAttribute("stroke-dasharray", "7 6");
  svg.appendChild(p);
  label(svg, { x: W / 2, y: dip + 4, size: 13, cls: "caption",
               text: "straight to the body — never reaches the stage" });
}

/* ---------------------------------------------------------- controls */

function renderControls() {
  const box = $("controls");
  box.innerHTML = "";
  const n = state.level.number;

  state.level.controls.forEach((c, i) => {
    if (c.kind === "blobs") {
      const p = document.createElement("p");
      p.className = "premise";
      p.style.margin = "0";
      p.textContent = c.label;
      box.appendChild(p);
    }

    if (c.kind === "run") {
      const b = document.createElement("button");
      b.className = "big";
      b.textContent = c.label;
      swatch(b, PALETTE.blue, 41);
      b.onclick = () => step(c.value);
      box.appendChild(b);
    }

    if (c.kind === "shout") {
      const b = document.createElement("button");
      b.className = "big";
      b.textContent = c.label;
      swatch(b, PALETTE.red, 47);
      b.onclick = () => act("shout", true);
      box.appendChild(b);
    }

    if (c.kind === "stove") {
      const b = document.createElement("button");
      b.className = "big";
      b.textContent = c.label;
      swatch(b, PALETTE.red, 53);
      b.onclick = () => act("stove", true);
      box.appendChild(b);
    }

    if (c.kind === "guess") {
      const wrap = document.createElement("div");
      wrap.className = "guess";
      wrap.innerHTML = `<span class="label">${c.label}</span>`;
      c.options.forEach((o) => {
        const b = document.createElement("button");
        b.textContent = o;
        if (state.extra.guess === o) b.classList.add("picked");
        b.onclick = () => act("guess", o);
        wrap.appendChild(b);
      });
      box.appendChild(wrap);
    }

    if (c.kind === "toggle") {
      const on = c.id === "loud" ? state.extra.loud_on
               : c.id === "link" ? state.extra.link_on
               : state.extra.count_on;
      const b = document.createElement("button");
      b.className = "switch" + (on ? " on" : "");
      b.innerHTML = `<span class="box"><svg viewBox="0 0 20 20">
        <path d="M4 10 L8 15 L16 5" stroke="#EDEAE3" stroke-width="2.6"
              fill="none" stroke-linecap="round"/></svg></span>
        <span>${c.label}</span>`;
      b.onclick = () => act(c.id, !on);
      box.appendChild(b);
    }
  });

  // Everyone gets a way to move the clock by hand.
  if (state.level.autoplay) {
    const b = document.createElement("button");
    b.className = "link-btn";
    b.textContent = playing ? "pause" : "resume";
    b.onclick = () => { setPlaying(!playing); renderControls(); };
    box.appendChild(b);
  }
}

function renderProgress() {
  const box = $("progress");
  const c = state.extra.counter;
  if (!c) { box.innerHTML = ""; return; }
  const pips = Array.from({ length: c.of }, (_, i) =>
    `<i class="pip${i < c.value ? " on" : ""}"></i>`).join("");
  box.innerHTML = c.of <= 24
    ? `<span>${c.label}</span><span class="pips">${pips}</span>`
    : `<span>${c.label}</span><span>${c.value} / ${c.of}</span>`;
}

/* ---------------------------------------------------------- readouts */

function renderReadout() {
  const box = $("readout");
  const e = state.extra;
  const n = state.level.number;
  box.innerHTML = "";

  if (n === 2 && e.tally) {
    box.innerHTML = `<table><tr>
        <td></td><td class="r">won</td>
        <td class="r">measured</td><td class="r strong">predicted</td></tr>` +
      e.tally.map((r) => `<tr>
        <td><span class="bar" style="background:${hue(r.modality)};
            width:${Math.max(6, r.measured * 160)}px"></span></td>
        <td class="r">${r.won}</td>
        <td class="r">${(r.measured * 100).toFixed(1)}%</td>
        <td class="r strong">${(r.predicted * 100).toFixed(1)}%</td></tr>`).join("") +
      `</table>`;
  }

  if (n === 3) {
    const bits = [];
    if (e.shouted_at !== null) bits.push(`you shouted at t ${e.shouted_at}`);
    if (e.heard_at !== null) bits.push(`you heard it at t ${e.heard_at}`);
    if (e.lag !== null) bits.push(`<span class="strong">${e.lag} ticks later</span>`);
    box.innerHTML = bits.length ? `<p class="say">${bits.join(" · ")}</p>` : "";
  }

  if (n === 4) {
    box.innerHTML = `<table>
      <tr><td>the obstacle reached the stage</td>
          <td class="r strong">${e.aware ? "yes" : "no"}</td></tr>
      <tr><td>body steered around it</td>
          <td class="r strong">${e.routes.conscious + e.routes.unconscious} times</td></tr>
      <tr><td>&nbsp;&nbsp;knowingly</td><td class="r">${e.routes.conscious}</td></tr>
      <tr><td>&nbsp;&nbsp;without knowing</td><td class="r">${e.routes.unconscious}</td></tr>
      </table><p class="say">“${e.said}”</p>`;
  }

  if (n === 5) {
    const scoreline = `it reached the stage on ${e.got_through} of
                       ${e.watched} ticks while the counting ran`;
    box.innerHTML =
      e.phase === "miss"
        ? `<p class="say">with the counting running, the gorilla reached the
           stage on ${e.got_through} of ${e.watched} ticks</p>`
        : e.count_on
        ? `<p class="say">${scoreline}. now switch the counting off.</p>`
        : `<p class="say">${scoreline} — with it off, seen
           ${e.seen_after} time${e.seen_after === 1 ? "" : "s"}.</p>`;
  }

  if (n === 6 && e.acted_at !== null) {
    box.innerHTML = `<table>
      <tr><td>hand touched the stove</td><td class="r">t ${e.touched_at}</td></tr>
      <tr><td>hand pulled away</td><td class="r strong">t ${e.acted_at}</td></tr>
      <tr><td>pain felt</td><td class="r strong">${
        e.felt_at === null ? "not yet" : "t " + e.felt_at}</td></tr>
      </table>` + (e.gap ? `<p class="say">it moved ${e.gap} ticks before it hurt</p>` : "");
  }
}

/* ----------------------------------------------------------- curtain */

function showCurtain() {
  setPlaying(false);
  const lv = state.level;
  $("done-no").textContent = lv.number;
  $("done-title").textContent = lv.title;
  $("done-lesson").textContent = lv.lesson;
  const svg = document.querySelector(".card-blob");
  svg.innerHTML = "";
  blob(svg, { x: 150, y: 80, rx: 130, ry: 62, seed: lv.number * 13,
              fill: [PALETTE.yellow, PALETTE.blue, PALETTE.red][lv.number % 3],
              opacity: 0.85 });
  $("btn-next").hidden = state.index >= state.count - 1;
  $("curtain").hidden = false;
}

/* -------------------------------------------------------------- boot */

function wire() {
  $("btn-menu").onclick = showMenu;
  $("btn-again").onclick = () => call("/api/retry", {}).then(showPlay);
  $("btn-next").onclick = () => call("/api/next", {}).then(showPlay);
  swatch($("btn-next"), PALETTE.yellow, 61);
  document.addEventListener("keydown", (e) => {
    if ($("screen-play").hidden) return;
    if (e.key === " ") { e.preventDefault(); step(1); }
    if (e.key === "Escape") showMenu();
  });
}

(async function start() {
  buildTitle();
  wire();
  await call("/api/state");
  showMenu();
})();
