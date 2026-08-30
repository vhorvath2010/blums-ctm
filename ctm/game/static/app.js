/* The game holds no model state. Every frame is a snapshot of the Python CTM;
   every control is a command sent to it.

   The drawing treats the machine as valve-computing hardware: processors are
   thermionic tubes whose filaments burn at their volume, and the single
   conscious chunk is what gets lit in the phosphor aperture above them. */

const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";

const PALETTE = {
  amber: "#E9A93C", amberHi: "#F7D08A",
  red: "#9A4232", blue: "#4E8177", yellow: "#C08A2E",
  ink: "#55697A", task: "#C08A2E", green: "#77854A",
  idle: "#41505C", silence: "#2A3336",
};
const hue = (m) => PALETTE[m] || PALETTE.idle;

let state = null;
let playing = null;

/* ------------------------------------------------- painted primitives */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Turbulence displacement is what stops these reading as vector art: every
   edge picks up the roughness of a loaded brush. Two filters, so that broad
   shapes scumble more than fine ones. */
function defs(svg) {
  const d = document.createElementNS(SVGNS, "defs");
  d.innerHTML = `
    <filter id="paint" x="-25%" y="-25%" width="150%" height="150%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4"
                    seed="11" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="9"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="paint-fine" x="-25%" y="-25%" width="150%" height="150%">
      <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3"
                    seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3.4"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="bloom" x="-70%" y="-70%" width="240%" height="240%">
      <feGaussianBlur stdDeviation="9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="phosphor">
      <stop offset="0%" stop-color="#4A3410"/>
      <stop offset="70%" stop-color="#241B0C"/>
      <stop offset="100%" stop-color="#15120A"/>
    </radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5C6E72" stop-opacity=".5"/>
      <stop offset="55%" stop-color="#2A3538" stop-opacity=".35"/>
      <stop offset="100%" stop-color="#1A2224" stop-opacity=".6"/>
    </linearGradient>`;
  svg.appendChild(d);
}

const el = (svg, tag, attrs, cls) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (cls) n.setAttribute("class", cls);
  svg.appendChild(n);
  return n;
};

/* A smear of paint: an irregular closed spline, roughened by the filter. */
function smearPath(seed, rx, ry, wobble = 0.22, n = 11) {
  const rnd = mulberry32((seed * 2654435761) % 2147483647);
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
    const k = 1 - wobble + rnd() * wobble * 2;
    p.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]);
  }
  let d = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n], e = p[(i + 2) % n];
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ` +
         `${c2[1].toFixed(1)}, ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }
  return d + " Z";
}

function smear(svg, { x, y, rx, ry, seed, fill, opacity = 1 }) {
  const g = el(svg, "g", { transform: `translate(${x} ${y})`,
                           filter: "url(#paint)" });
  el(g, "path", { d: smearPath(seed, rx, ry), fill, opacity });
  return g;
}

function text(svg, { x, y, str, size = 14, cls = "plate-text", fill, extra }) {
  const t = el(svg, "text", { x, y, "font-size": size, ...(extra || {}) }, cls);
  if (fill) t.setAttribute("fill", fill);
  t.textContent = str;
  return t;
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
  const was = state && state.solved;
  state = data;
  render();
  if (state.solved && !was) showCurtain();
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
  defs(svg);
  [[250, 150, 210, 96, PALETTE.blue, 3, 0.5],
   [470, 190, 190, 84, PALETTE.red, 7, 0.42],
   [380, 120, 240, 70, PALETTE.amber, 13, 0.22]]
    .forEach(([x, y, rx, ry, fill, seed, opacity]) =>
      smear(svg, { x, y, rx, ry, seed, fill, opacity }));
}

function buildMenu() {
  const nav = $("menu");
  nav.innerHTML = "";
  state.menu.forEach((lv, i) => {
    const b = document.createElement("button");
    b.className = "menu-item" + (state.completed.includes(lv.number) ? " done" : "");
    b.innerHTML =
      `<span class="lamp"></span>` +
      `<span class="no">${String(lv.number).padStart(2, "0")}</span>` +
      `<span class="plaque">${lv.title}</span>` +
      `<span class="sub">${lv.subtitle}</span>`;
    b.onclick = () => call("/api/level", { index: i }).then(showPlay);
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
  $("hud-tick").textContent = `T ${String(state.t).padStart(4, "0")}`;
  $("premise").textContent = lv.premise;
  $("goal").textContent = lv.goal;
  renderStage();
  renderControls();
  renderProgress();
  renderReadout();
}

const W = 900, APERTURE_Y = 96, RAIL = 372;

function renderStage() {
  const svg = $("stage");
  svg.innerHTML = "";
  defs(svg);
  const n = state.level.number;

  // Only the levels that route a lead under the rack need the extra depth;
  // reserving it everywhere leaves a dead band beneath the valves.
  const cabled = n === 4 || n === 6;
  svg.setAttribute("viewBox", `0 0 ${W} ${cabled ? 570 : 480}`);

  drawAperture(svg);
  if (n === 3 && state.extra.tree) drawRelays(svg);
  const shown = drawValves(svg, n);
  if (n === 4 || n === 6) drawPatchCable(svg, shown);
}

/* The phosphor window. Whatever is conscious is what is lit here. */
function drawAperture(svg) {
  const s = state.stage;
  const w = 560, h = 128, x = (W - w) / 2, y = APERTURE_Y - h / 2;

  // Chassis plate behind the window.
  el(svg, "rect", { x: x - 26, y: y - 26, width: w + 52, height: h + 44,
                    fill: "#232C2E", stroke: "#101416", "stroke-width": 1 });
  el(svg, "rect", { x: x - 26, y: y - 26, width: w + 52, height: 2,
                    fill: "#3A4648" });
  [[x - 14, y - 14], [x + w + 14, y - 14],
   [x - 14, y + h + 8], [x + w + 14, y + h + 8]]
    .forEach(([cx, cy]) => el(svg, "circle", { cx, cy, r: 3.4, fill: "#161C1E",
                                               stroke: "#3E4A4C" }));

  // The window itself.
  el(svg, "rect", { x, y, width: w, height: h, rx: 7, fill: "url(#phosphor)",
                    stroke: "#0C1012", "stroke-width": 2 });

  if (s) {
    const glowFill = s.modality === "idle" ? "#6E5A2A" : hue(s.modality);
    const g = el(svg, "g", { filter: "url(#bloom)", opacity: .5 });
    el(g, "ellipse", { cx: W / 2, cy: APERTURE_Y, rx: 170, ry: 40,
                       fill: glowFill });
    const room = w * 0.84;
    const size = Math.max(15, Math.min(34, room / (s.text.length * 0.62)));
    text(svg, { x: W / 2, y: APERTURE_Y + size * 0.35, str: s.text, size,
                cls: "aperture-text",
                fill: s.modality === "idle" ? "#A0906E" : undefined });
    text(svg, { x: W / 2, y: APERTURE_Y + 46, size: 10,
                str: `SUBMITTED T${String(s.submitted_at).padStart(4, "0")}  ·  ` +
                     `SOURCE ${s.owner.toUpperCase()}`, cls: "plate-text" });
  } else {
    text(svg, { x: W / 2, y: APERTURE_Y + 6, str: "— NO SIGNAL —", size: 20,
                cls: "plate-text" });
  }

  text(svg, { x: W / 2, y: y - 34, size: 11,
              str: "SHORT TERM MEMORY · CONSCIOUS CONTENT", cls: "plate-text" });
}

/* A thermionic valve: glass envelope, ceramic base, and a filament whose
   burn is the processor's volume. */
function valve(svg, { x, y, scale, fill, bright, label, reading, onClick }) {
  const g = el(svg, "g", { transform: `translate(${x} ${y}) scale(${scale})` });
  if (onClick) { g.setAttribute("class", "clickable"); g.addEventListener("click", onClick); }

  // Halo of escaping light, before the glass.
  if (bright > 0.02) {
    const halo = el(g, "g", { filter: "url(#bloom)", opacity: 0.16 + bright * 0.5 });
    el(halo, "ellipse", { cx: 0, cy: -6, rx: 40, ry: 46, fill });
  }

  const body = el(g, "g", { filter: "url(#paint-fine)" });
  // Envelope.
  el(body, "path", {
    d: "M -30 26 L -30 -18 Q -30 -50 0 -50 Q 30 -50 30 -18 L 30 26 Z",
    fill: "url(#glass)", stroke: "#0E1315", "stroke-width": 2,
  });
  // Filament: brighter and fatter with volume.
  el(body, "path", {
    d: "M -13 18 L -7 -22 L 0 12 L 7 -22 L 13 18",
    fill: "none", stroke: fill,
    "stroke-width": 1.4 + bright * 3.6,
    opacity: 0.25 + bright * 0.75,
    "stroke-linejoin": "round", "stroke-linecap": "round",
  });
  // Base.
  el(body, "rect", { x: -26, y: 26, width: 52, height: 20, fill: "#2A3033",
                     stroke: "#0E1315" });
  el(body, "rect", { x: -26, y: 32, width: 52, height: 2, fill: "#3E4749" });
  el(body, "rect", { x: -8, y: 46, width: 5, height: 9, fill: "#1A2022" });
  el(body, "rect", { x: 3, y: 46, width: 5, height: 9, fill: "#1A2022" });

  if (label) {
    const size = Math.min(17, Math.max(11, 150 / Math.max(label.length, 1)));
    text(svg, { x, y: RAIL + 78, str: label.toUpperCase(), size, cls: "valve-text" });
  }
  if (reading) {
    text(svg, { x, y: RAIL + 94, str: reading, size: 11, cls: "reading" });
  }
  return g;
}

function drawValves(svg, n) {
  // Rail the valves are seated on.
  el(svg, "rect", { x: 40, y: RAIL + 48, width: W - 80, height: 5,
                    fill: "#2B3537" });
  el(svg, "rect", { x: 40, y: RAIL + 48, width: W - 80, height: 1.5,
                    fill: "#3E4A4C" });

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
    const frac = b.f / maxF;
    valve(svg, {
      x, y: RAIL, scale: 0.62 + 0.5 * Math.sqrt(frac),
      fill: hue(b.modality), bright: Math.sqrt(frac),
      label: b.text, reading: `${b.f}`,
      onClick: n === 1 ? () => act("louder", b.name) : null,
    });
  });
  return show;
}

/* The relay lattice a chunk has to climb. */
function drawRelays(svg) {
  const levels = state.extra.tree;
  const rows = levels.length, top = 206, bottom = 300;
  for (let s = rows - 1; s >= 1; s--) {
    const y = top + ((rows - 1 - s) / (rows - 1)) * (bottom - top);
    text(svg, { x: 30, y: y + 4, str: `T−${s}`, size: 10, cls: "reading" });
    levels[s].forEach((node, i) => {
      const x = W * ((i + 0.5) / levels[s].length);
      const live = !node.silent && node.f > 5;
      if (live) {
        const g = el(svg, "g", { filter: "url(#bloom)", opacity: .85 });
        el(g, "circle", { cx: x, cy: y, r: 6, fill: PALETTE.amber });
      }
      el(svg, "circle", {
        cx: x, cy: y, r: live ? 4.5 : 2.6,
        fill: live ? PALETTE.amberHi : "#33403F",
      });
    });
  }
}

/* The patch cable: a lead that runs from one valve to another around the back
   of the rack, so nothing on it ever reaches the aperture. */
function drawPatchCable(svg, shown) {
  const on = state.level.number === 6 ||
             (state.extra.routes && state.extra.routes.unconscious > 0);
  if (!on || shown.length < 2) return;
  const a = W * (0.5 / shown.length) - 34;
  const b = W * ((shown.length - 0.5) / shown.length) + 34;
  const dip = RAIL + 150;
  const d = `M ${a} ${RAIL + 44} C ${a} ${dip}, ${b} ${dip}, ${b} ${RAIL + 44}`;
  el(svg, "path", { d, fill: "none", stroke: "#7A3126", "stroke-width": 6,
                    "stroke-linecap": "round", filter: "url(#paint-fine)" });
  el(svg, "path", { d, fill: "none", stroke: PALETTE.red, "stroke-width": 2.4,
                    "stroke-dasharray": "10 8", "stroke-linecap": "round" });
  text(svg, { x: W / 2, y: dip - 6, size: 11, cls: "plate-text",
              str: "PATCH LEAD · BYPASSES THE APERTURE ENTIRELY" });
}

/* ---------------------------------------------------------- controls */

function renderControls() {
  const box = $("controls");
  box.innerHTML = "";

  state.level.controls.forEach((c) => {
    if (c.kind === "blobs") {
      const p = document.createElement("p");
      p.className = "note";
      p.textContent = "Strike a valve to raise its filament";
      box.appendChild(p);
    }

    if (c.kind === "run" || c.kind === "shout" || c.kind === "stove") {
      const b = document.createElement("button");
      b.className = "big";
      b.textContent = c.label;
      b.onclick = c.kind === "run" ? () => step(c.value)
                : c.kind === "shout" ? () => act("shout", true)
                : () => act("stove", true);
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
      b.innerHTML = `<span class="box"></span>` +
                    `<span class="switch-label">${c.label}</span>`;
      b.onclick = () => act(c.id, !on);
      box.appendChild(b);
    }
  });

  if (state.level.autoplay) {
    const b = document.createElement("button");
    b.className = "link-btn";
    b.textContent = playing ? "halt clock" : "resume clock";
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
        <td></td><td class="r">WON</td>
        <td class="r">MEASURED</td><td class="r strong">PREDICTED</td></tr>` +
      e.tally.map((r) => `<tr>
        <td><span class="bar" style="background:${hue(r.modality)};
            width:${Math.max(6, r.measured * 150)}px"></span></td>
        <td class="r">${r.won}</td>
        <td class="r">${(r.measured * 100).toFixed(1)}%</td>
        <td class="r strong">${(r.predicted * 100).toFixed(1)}%</td></tr>`).join("") +
      `</table>`;
  }

  if (n === 3) {
    const bits = [];
    if (e.shouted_at !== null) bits.push(`SIGNAL SENT T${e.shouted_at}`);
    if (e.heard_at !== null) bits.push(`LIT AT T${e.heard_at}`);
    if (e.lag !== null) bits.push(`<span class="strong">${e.lag} TICKS</span>`);
    box.innerHTML = bits.length ? `<p class="say">${bits.join("  ·  ")}</p>` : "";
  }

  if (n === 4) {
    box.innerHTML = `<table>
      <tr><td>OBSTACLE REACHED THE APERTURE</td>
          <td class="r strong">${e.aware ? "YES" : "NO"}</td></tr>
      <tr><td>BODY STEERED AROUND IT</td>
          <td class="r strong">${e.routes.conscious + e.routes.unconscious}×</td></tr>
      <tr><td>&nbsp;&nbsp;KNOWINGLY</td><td class="r">${e.routes.conscious}</td></tr>
      <tr><td>&nbsp;&nbsp;WITHOUT KNOWING</td>
          <td class="r">${e.routes.unconscious}</td></tr>
      </table><p class="say" style="margin-top:.7rem">“${e.said}”</p>`;
  }

  if (n === 5) {
    const line = `it reached the aperture on ${e.got_through} of ${e.watched}
                  ticks while the counting ran`;
    box.innerHTML =
      e.phase === "miss"
        ? `<p class="say">with the counting running, the gorilla reached the
           aperture on ${e.got_through} of ${e.watched} ticks</p>`
        : e.count_on
        ? `<p class="say">${line}. now throw the counting switch.</p>`
        : `<p class="say">${line} — with it off, seen
           ${e.seen_after} time${e.seen_after === 1 ? "" : "s"}.</p>`;
  }

  if (n === 6 && e.acted_at !== null) {
    box.innerHTML = `<table>
      <tr><td>HAND TOUCHED THE STOVE</td><td class="r">T${e.touched_at}</td></tr>
      <tr><td>HAND PULLED AWAY</td><td class="r strong">T${e.acted_at}</td></tr>
      <tr><td>PAIN LIT IN THE APERTURE</td><td class="r strong">${
        e.felt_at === null ? "NOT YET" : "T" + e.felt_at}</td></tr>
      </table>` +
      (e.gap ? `<p class="say" style="margin-top:.7rem">it moved
        ${e.gap} ticks before it hurt</p>` : "");
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
  defs(svg);
  smear(svg, { x: 220, y: 120, rx: 200, ry: 92, seed: lv.number * 17,
               fill: [PALETTE.blue, PALETTE.red, PALETTE.amber][lv.number % 3],
               opacity: 0.4 });
  $("btn-next").hidden = state.index >= state.count - 1;
  $("curtain").hidden = false;
}

/* -------------------------------------------------------------- boot */

function wire() {
  $("btn-menu").onclick = showMenu;
  $("btn-again").onclick = () => call("/api/retry", {}).then(showPlay);
  $("btn-next").onclick = () => call("/api/next", {}).then(showPlay);
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
