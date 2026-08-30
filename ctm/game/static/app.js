/* The game holds no model state. Every frame is a snapshot of the Python CTM;
   every control is a command sent to it.

   Nothing here is a rectangle. The apparatus, and every switch and key on it,
   is built out of the painting primitives in paint.js: broken-colour grounds,
   loaded strokes, light caught on an edge. */

import { defs, node, plate, rivet, brushField, smearPath, slabPath, rng, jitter,
         backdrop } from "./paint.js";

const $ = (id) => document.getElementById(id);

const PALETTE = {
  amber: "#E9A93C", amberHi: "#F7D08A", amberLo: "#A87322",
  red: "#9A4232", blue: "#4E8177", yellow: "#C08A2E",
  ink: "#55697A", task: "#C08A2E", green: "#77854A",
  idle: "#41505C", silence: "#2A3336",
  steel: "#2C3739", steelDark: "#1C2426", rim: "#4A5658",
};
const hue = (m) => PALETTE[m] || PALETTE.idle;

let state = null;
let playing = null;
let builtFor = null;      // which level the controls were built for

/* Every word the game uses that a reader might not already own. Hovering one
   shows the definition in place; clicking opens the index. Longest phrases are
   matched first so "relay tree" wins over "relay". */
const GLOSSARY = {
  "Conscious Turing Machine":
    "The model this game is built on, from Lenore and Manuel Blum. A large " +
    "crowd of simple processors, all working at once, competing for a single " +
    "slot of Short Term Memory.",
  "inattentional blindness":
    "Missing something in plain view because you were occupied with something " +
    "else.",
  "Short Term Memory":
    "The single slot at the top of the machine. It holds one chunk at a time, " +
    "and whatever is in it is what the machine is conscious of.",
  "conscious content":
    "The chunk sitting in Short Term Memory right now.",
  "competition":
    "What happens every tick. All processors submit a chunk, the chunks meet " +
    "in pairs up the Up-Tree, and one of them survives to reach Short Term " +
    "Memory. Higher weight means better odds, never a guarantee.",
  "processor":
    "One of the machine's many small specialists. Each works on its own and " +
    "can only tell the others anything by winning the competition.",
  "blindsight":
    "A real condition. People with damage to the visual cortex report seeing " +
    "nothing, then reach for objects and avoid obstacles accurately anyway.",
  "broadcast":
    "When a chunk reaches Short Term Memory it is sent back out to every " +
    "processor at once. Blum and Blum count that moment, rather than the " +
    "arrival, as the machine becoming conscious of it.",
  "Up-Tree":
    "The tree the chunks climb. Chunks meet in pairs at each level and one of " +
    "each pair goes on, so a tree four levels deep takes four ticks.",
  "weight":
    "How much the submitting processor thinks its own chunk matters. Weight " +
    "sets its odds in the competition and does nothing else.",
  "chunk":
    "The small packet a processor submits: who sent it, what it says, and how " +
    "much weight is behind it.",
  "link":
    "A direct channel between two processors. Chunks sent along a link skip " +
    "the competition, so they are never broadcast and the machine never " +
    "becomes conscious of them.",
  "tick":
    "One beat of the machine's clock. Every processor submits one chunk per " +
    "tick.",
};

const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);

const escapeHtml = (t) => t.replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Wrap the first mention of each known term. */
function withTerms(str) {
  let out = escapeHtml(str);
  const taken = [];
  TERMS.forEach((term) => {
    const re = new RegExp(`\\b(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "i");
    const m = out.match(re);
    if (!m) return;
    // Skip a match that landed inside markup already emitted.
    const before = out.slice(0, m.index);
    if ((before.split("<").length - 1) !== (before.split(">").length - 1)) return;
    if (taken.includes(term.toLowerCase())) return;
    taken.push(term.toLowerCase());
    out = out.slice(0, m.index) +
      `<button class="term" data-term="${term}">${m[1]}</button>` +
      out.slice(m.index + m[1].length);
  });
  return out;
}

function attachTerms(root) {
  root.querySelectorAll(".term").forEach((b) => {
    b.onmouseenter = () => showTip(b);
    b.onfocus = () => showTip(b);
    b.onmouseleave = hideTip;
    b.onblur = hideTip;
    b.onclick = () => { hideTip(); showIndex(b.dataset.term); };
  });
}

function showTip(anchor) {
  const tip = $("tip");
  const term = anchor.dataset.term;
  tip.innerHTML = `<b>${escapeHtml(term)}</b>${escapeHtml(GLOSSARY[term])}` +
                  `<i>click for the full index</i>`;
  tip.hidden = false;
  const a = anchor.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const x = Math.min(Math.max(8, a.left + a.width / 2 - t.width / 2),
                     window.innerWidth - t.width - 8);
  const above = a.top > t.height + 16;
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(above ? a.top - t.height - 10 : a.bottom + 10)}px`;
}

const hideTip = () => { $("tip").hidden = true; };

/* ------------------------------------------------------------- index */

/* Reading order, not alphabetical: the machine's parts first, then what it
   does with them, then the two conditions the levels reproduce. */
const INDEX_ORDER = [
  "Conscious Turing Machine", "processor", "chunk", "weight", "competition",
  "Up-Tree", "Short Term Memory", "conscious content", "broadcast", "link",
  "tick", "blindsight", "inattentional blindness",
];

function buildIndex() {
  const list = $("index-list");
  list.innerHTML = "";
  const order = INDEX_ORDER.filter((t) => t in GLOSSARY)
    .concat(Object.keys(GLOSSARY).filter((t) => !INDEX_ORDER.includes(t)));
  order.forEach((term) => {
    const dt = document.createElement("dt");
    dt.id = `term-${term.replace(/\s+/g, "-").toLowerCase()}`;
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = GLOSSARY[term];
    list.append(dt, dd);
  });
}

let cameFrom = "screen-title";

function showIndex(focusTerm) {
  cameFrom = $("screen-play").hidden ? "screen-title" : "screen-play";
  setPlaying(false);
  buildIndex();
  $("screen-title").hidden = true;
  $("screen-play").hidden = true;
  $("screen-index").hidden = false;
  if (focusTerm) {
    const el = document.getElementById(
      `term-${focusTerm.replace(/\s+/g, "-").toLowerCase()}`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("lit");
      setTimeout(() => el.classList.remove("lit"), 2200);
    }
  }
}

function leaveIndex() {
  $("screen-index").hidden = true;
  if (cameFrom === "screen-play") {
    $("screen-play").hidden = false;
    setPlaying(state.level.autoplay && !state.solved);
  } else {
    showMenu();
  }
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

/* ------------------------------------------------ painted HTML chrome */

/* An enamelled key that stands off the chassis. */
function paintKey(host, seed, tone = PALETTE.amber, lo = PALETTE.amberLo) {
  backdrop(host, (svg, w, h) => {
    const r = rng(seed);
    node(svg, "path", {
      d: slabPath(w - 2, h - 2, seed + 40, 2.6),
      transform: "translate(2 5)", fill: "#0A0D0F", opacity: 0.55,
      filter: "url(#p-edge)",
    });
    plate(svg, { x: 1, y: 0, w: w - 2, h: h - 3, seed, colour: tone,
                 warm: 12, rim: "#FFE6AE", shade: lo, strokes: 16, wob: 2.4,
                 chips: 4 });
    // A dragged highlight, as if the brush lifted at the right.
    node(svg, "path", {
      d: `M ${w * 0.1} ${h * 0.3} Q ${w * 0.5} ${h * 0.2}, ${w * 0.86} ${h * 0.34}`,
      stroke: "#FFF0CC", "stroke-width": 1.6, fill: "none",
      opacity: 0.3 + r() * 0.15, filter: "url(#p-fine)", "stroke-linecap": "round",
    });
  }, seed);
}

/* A steel plaque: the menu rows, the HUD rail, the readout housing. */
function paintPlate(host, seed, colour = PALETTE.steel, opts = {}) {
  backdrop(host, (svg, w, h) => {
    plate(svg, { w, h, seed, colour, rim: PALETTE.rim, strokes: opts.strokes || 20,
                 wob: opts.wob === undefined ? 3 : opts.wob,
                 chips: opts.chips === undefined ? 5 : opts.chips });
    (opts.rivets || []).forEach(([fx, fy], i) =>
      rivet(svg, fx * w, fy * h, seed + i * 7, opts.rivetSize || 3));
  }, seed);
}

/* A bat-handle switch, drawn rather than styled. The handle's throw is a CSS
   transform on the painted group, so state changes do not repaint it. */
function paintSwitch(host, seed) {
  backdrop(host, (svg, w, h) => {
    // Escutcheon.
    plate(svg, { w, h, seed, colour: "#232B2D", rim: "#48555A", strokes: 12,
                 wob: 2, chips: 3 });
    node(svg, "path", {
      d: smearPath(seed + 2, w * 0.3, h * 0.26, 0.2, 9),
      transform: `translate(${w / 2} ${h / 2})`, fill: "#0D1113",
      opacity: 0.85, filter: "url(#p-edge)",
    });
    const lever = node(svg, "g", { class: "lever" });
    const g = node(lever, "g", { filter: "url(#p-fine)" });
    node(g, "path", {                            // shaft
      d: `M ${w * 0.5} ${h * 0.62} L ${w * 0.5} ${h * 0.24}`,
      stroke: "#9AA3A0", "stroke-width": w * 0.09, "stroke-linecap": "round",
    });
    node(g, "path", {                            // knob
      d: smearPath(seed + 6, w * 0.115, h * 0.2, 0.22, 9),
      transform: `translate(${w * 0.5} ${h * 0.24})`, fill: "#C3C9C2",
    });
    node(g, "path", {                            // light on the knob
      d: smearPath(seed + 9, w * 0.05, h * 0.08, 0.3, 7),
      transform: `translate(${w * 0.47} ${h * 0.19})`, fill: "#EFF1E8",
      opacity: 0.65,
    });
    node(lever, "path", {                        // lamp behind the knob
      class: "lever-glow",
      d: smearPath(seed + 12, w * 0.2, h * 0.3, 0.25, 9),
      transform: `translate(${w * 0.5} ${h * 0.3})`, fill: PALETTE.amber,
      filter: "url(#p-bloom)", opacity: 0,
    });
  }, seed);
}

/* ------------------------------------------------------------- title */

function buildTitle() {
  const svg = document.querySelector(".logo-blobs");
  svg.innerHTML = "";
  defs(svg);
  [[250, 150, 210, 96, PALETTE.blue, 3, 0.5],
   [470, 190, 190, 84, PALETTE.red, 7, 0.42],
   [380, 120, 240, 70, PALETTE.amber, 13, 0.22]]
    .forEach(([x, y, rx, ry, fill, seed, opacity]) => {
      const g = node(svg, "g", { transform: `translate(${x} ${y})`,
                                 filter: "url(#p-rough)", opacity });
      node(g, "path", { d: smearPath(seed, rx, ry), fill });
      brushField(g, { w: rx * 1.4, h: ry * 1.2, seed: seed + 30, colour: fill,
                      count: 14, opacity: 0.4 });
    });
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
    paintPlate(b, 200 + i * 31, PALETTE.steel,
               { rivets: [[0.021, 0.5], [0.979, 0.5]], rivetSize: 2.4 });
  });
}

const showMenu = () => {
  setPlaying(false);
  buildMenu();
  $("screen-title").hidden = false;
  $("screen-play").hidden = true;
  $("screen-index").hidden = true;
  $("curtain").hidden = true;
};

const showPlay = () => {
  $("screen-title").hidden = true;
  $("screen-play").hidden = false;
  $("screen-index").hidden = true;
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
  $("premise").innerHTML = withTerms(lv.premise);
  $("goal").innerHTML = withTerms(lv.goal);
  attachTerms($("premise"));
  attachTerms($("goal"));
  renderStage();
  if (builtFor !== lv.number) { buildControls(); builtFor = lv.number; }
  syncControls();
  renderProgress();
  renderReadout();
}

const W = 900, APERTURE_Y = 100, RAIL = 376;

function renderStage() {
  const svg = $("stage");
  svg.innerHTML = "";
  defs(svg);
  const n = state.level.number;
  const cabled = n === 4 || n === 6;
  svg.setAttribute("viewBox", `0 0 ${W} ${cabled ? 570 : 480}`);

  drawAperture(svg);
  if (n === 3 && state.extra.tree) drawRelays(svg);
  const shown = drawValves(svg, n);
  if (cabled) drawPatchCable(svg, shown);
}

/* The phosphor window in its painted housing. */
function drawAperture(svg) {
  const s = state.stage;
  const w = 560, h = 126, x = (W - w) / 2, y = APERTURE_Y - h / 2;

  plate(svg, { x: x - 30, y: y - 30, w: w + 60, h: h + 52, seed: 77,
               colour: "#283234", rim: "#4E5B5C", strokes: 30, wob: 4.2,
               chips: 9 });
  [[x - 16, y - 15], [x + w + 16, y - 15],
   [x - 16, y + h + 10], [x + w + 16, y + h + 10]]
    .forEach(([cx, cy], i) => rivet(svg, cx, cy, 300 + i * 11, 3.6));

  // Recess, then the glass.
  node(svg, "path", {
    d: slabPath(w + 12, h + 12, 55, 3), transform: `translate(${x - 6} ${y - 6})`,
    fill: "#0B0F10", filter: "url(#p-edge)",
  });
  node(svg, "path", {
    d: slabPath(w, h, 56, 2.6), transform: `translate(${x} ${y})`,
    fill: "url(#p-phosphor)", filter: "url(#p-edge)",
  });

  if (s) {
    const tone = s.modality === "idle" ? "#7A6428" : hue(s.modality);
    const g = node(svg, "g", { filter: "url(#p-bloom)", opacity: 0.46 });
    node(g, "path", { d: smearPath(61, 172, 40, 0.16, 13),
                      transform: `translate(${W / 2} ${APERTURE_Y})`, fill: tone });
    const room = w * 0.84;
    const size = Math.max(15, Math.min(34, room / (s.text.length * 0.62)));
    text(svg, { x: W / 2, y: APERTURE_Y + size * 0.35, str: s.text, size,
                cls: "aperture-text",
                fill: s.modality === "idle" ? "#C3B48A" : undefined });
    text(svg, { x: W / 2, y: APERTURE_Y + 46, size: 10, cls: "plate-text",
                str: `SUBMITTED T${String(s.submitted_at).padStart(4, "0")}  ·  ` +
                     `SOURCE ${s.owner.toUpperCase()}` });
  } else {
    text(svg, { x: W / 2, y: APERTURE_Y + 6, str: "— NO SIGNAL —", size: 20,
                cls: "plate-text" });
  }
  text(svg, { x: W / 2, y: y - 40, size: 11, cls: "plate-text",
              str: "SHORT TERM MEMORY · ONE CHUNK AT A TIME" });
}

function text(svg, { x, y, str, size = 14, cls = "plate-text", fill }) {
  const t = node(svg, "text", { x, y, "font-size": size }, cls);
  if (fill) t.setAttribute("fill", fill);
  t.textContent = str;
  return t;
}

/* A thermionic valve, painted: glass, filament, ceramic base. */
function valve(svg, { x, y, scale, fill, bright, label, reading, onClick }) {
  const g = node(svg, "g", { transform: `translate(${x} ${y}) scale(${scale})` });
  if (onClick) {
    g.setAttribute("class", "clickable");
    g.addEventListener("click", onClick);
  }
  const r = rng(Math.round(x) + 3);

  if (bright > 0.02) {
    const halo = node(g, "g", { filter: "url(#p-bloom)",
                                opacity: 0.14 + bright * 0.46 });
    node(halo, "path", { d: smearPath(Math.round(x) + 9, 40, 46, 0.2, 11), fill });
  }

  const body = node(g, "g", { filter: "url(#p-edge)" });
  const envelope = "M -30 26 L -30 -18 Q -30 -50 0 -50 Q 30 -50 30 -18 L 30 26 Z";
  node(body, "path", { d: envelope, fill: "#25302F", opacity: 0.9 });
  // Glass is painted, not glazed: a few vertical drags and one hot highlight.
  const clipId = `v-${Math.round(x)}`;
  const cp = node(body, "clipPath", { id: clipId });
  node(cp, "path", { d: envelope });
  const inner = node(body, "g", { "clip-path": `url(#${clipId})` });
  brushField(inner, { w: 60, h: 76, seed: Math.round(x) + 17, colour: "#3C4A4C",
                      count: 12, opacity: 0.55, vertical: true });
  node(inner, "path", {
    d: "M -19 -40 Q -22 -8, -17 22", stroke: "#8FA3A6", "stroke-width": 3.2,
    fill: "none", opacity: 0.3, "stroke-linecap": "round",
  });
  node(body, "path", { d: envelope, fill: "none", stroke: "#0E1315",
                       "stroke-width": 2.2 });

  node(body, "path", {
    d: "M -13 18 L -7 -22 L 0 12 L 7 -22 L 13 18",
    fill: "none", stroke: fill, "stroke-width": 1.4 + bright * 3.6,
    opacity: 0.25 + bright * 0.75, "stroke-linejoin": "round",
    "stroke-linecap": "round",
  });

  plate(body, { x: -27, y: 26, w: 54, h: 21, seed: Math.round(x) + 23,
                colour: "#2B3134", rim: "#4C5654", strokes: 9, wob: 1.8,
                chips: 3 });
  node(body, "path", { d: "M -7 47 L -7 56", stroke: "#141A1C",
                       "stroke-width": 4, "stroke-linecap": "round" });
  node(body, "path", { d: "M 6 47 L 6 56", stroke: "#141A1C",
                       "stroke-width": 4, "stroke-linecap": "round" });

  if (label) {
    const size = Math.min(17, Math.max(11, 150 / Math.max(label.length, 1)));
    text(svg, { x, y: RAIL + 78, str: label.toUpperCase(), size, cls: "valve-text" });
  }
  if (reading) text(svg, { x, y: RAIL + 94, str: reading, size: 11, cls: "reading" });
  return g;
}

function drawValves(svg, n) {
  // The rail, painted as a length of angle iron.
  plate(svg, { x: 40, y: RAIL + 44, w: W - 80, h: 10, seed: 401,
               colour: "#2A3436", rim: "#4C5A5B", strokes: 8, wob: 2, chips: 6 });

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

function drawRelays(svg) {
  const levels = state.extra.tree;
  const rows = levels.length, top = 208, bottom = 300;
  for (let s = rows - 1; s >= 1; s--) {
    const y = top + ((rows - 1 - s) / (rows - 1)) * (bottom - top);
    text(svg, { x: 30, y: y + 4, str: `T−${s}`, size: 10, cls: "reading" });
    levels[s].forEach((node_, i) => {
      const x = W * ((i + 0.5) / levels[s].length);
      const live = !node_.silent && node_.f > 5;
      if (live) {
        const g = node(svg, "g", { filter: "url(#p-bloom)", opacity: 0.85 });
        node(g, "path", { d: smearPath(i * 13 + s, 7, 7, 0.3, 8),
                          transform: `translate(${x} ${y})`, fill: PALETTE.amber });
      }
      node(svg, "path", {
        d: smearPath(i * 7 + s * 3, live ? 4.6 : 2.8, live ? 4.6 : 2.8, 0.3, 8),
        transform: `translate(${x} ${y})`,
        fill: live ? PALETTE.amberHi : "#39443F", filter: "url(#p-fine)",
      });
    });
  }
}

function drawPatchCable(svg, shown) {
  const on = state.level.number === 6 ||
             (state.extra.routes && state.extra.routes.unconscious > 0);
  if (!on || shown.length < 2) return;
  const a = W * (0.5 / shown.length) - 34;
  const b = W * ((shown.length - 0.5) / shown.length) + 34;
  const dip = RAIL + 150;
  const d = `M ${a} ${RAIL + 44} C ${a} ${dip}, ${b} ${dip}, ${b} ${RAIL + 44}`;
  node(svg, "path", { d, fill: "none", stroke: "#3A1A14", "stroke-width": 9,
                      "stroke-linecap": "round", filter: "url(#p-edge)",
                      opacity: 0.8 });
  node(svg, "path", { d, fill: "none", stroke: "#7A3126", "stroke-width": 6,
                      "stroke-linecap": "round", filter: "url(#p-edge)" });
  node(svg, "path", { d, fill: "none", stroke: PALETTE.red, "stroke-width": 2.6,
                      "stroke-dasharray": "11 9", "stroke-linecap": "round",
                      filter: "url(#p-fine)" });
  text(svg, { x: W / 2, y: dip - 6, size: 11, cls: "plate-text",
              str: "LINK · THESE CHUNKS NEVER ENTER THE COMPETITION" });
}

/* ---------------------------------------------------------- controls */

function buildControls() {
  const box = $("controls");
  box.innerHTML = "";
  let seed = 500;

  state.level.controls.forEach((c) => {
    if (c.kind === "blobs") {
      const p = document.createElement("p");
      p.className = "note";
      p.textContent = c.label;
      box.appendChild(p);
    }

    if (c.kind === "run" || c.kind === "shout" || c.kind === "stove") {
      const b = document.createElement("button");
      b.className = "big";
      b.innerHTML = `<span class="cap">${c.label}</span>`;
      b.onclick = c.kind === "run" ? () => step(c.value)
                : c.kind === "shout" ? () => act("shout", true)
                : () => act("stove", true);
      box.appendChild(b);
      paintKey(b, (seed += 17));
    }

    if (c.kind === "guess") {
      const wrap = document.createElement("div");
      wrap.className = "guess";
      const lab = document.createElement("span");
      lab.className = "label";
      lab.textContent = c.label;
      wrap.appendChild(lab);
      c.options.forEach((o) => {
        const b = document.createElement("button");
        b.dataset.guess = o;
        b.innerHTML = `<span class="cap">${o}</span>`;
        b.onclick = () => act("guess", o);
        wrap.appendChild(b);
        paintPlate(b, (seed += 13), "#2B3436", { strokes: 10, wob: 2, chips: 3 });
      });
      box.appendChild(wrap);
    }

    if (c.kind === "toggle") {
      const b = document.createElement("button");
      b.className = "switch";
      b.dataset.toggle = c.id;
      b.innerHTML = `<span class="box"></span>` +
                    `<span class="switch-label">${c.label}</span>`;
      b.onclick = () => act(c.id, !toggleState(c.id));
      box.appendChild(b);
      paintSwitch(b.querySelector(".box"), (seed += 19));
    }
  });

  if (state.level.autoplay) {
    const b = document.createElement("button");
    b.className = "link-btn";
    b.id = "btn-clock";
    b.onclick = () => { setPlaying(!playing); syncControls(); };
    box.appendChild(b);
  }
}

const toggleState = (id) =>
  id === "loud" ? state.extra.loud_on
  : id === "link" ? state.extra.link_on
  : state.extra.count_on;

/* Only the state changes each frame; the paint stays where it was put. */
function syncControls() {
  document.querySelectorAll("#controls .switch").forEach((b) => {
    b.classList.toggle("on", !!toggleState(b.dataset.toggle));
  });
  document.querySelectorAll("#controls .guess button").forEach((b) => {
    b.classList.toggle("picked", state.extra.guess === Number(b.dataset.guess));
  });
  const clock = $("btn-clock");
  if (clock) clock.textContent = playing ? "halt clock" : "resume clock";
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
    if (e.shouted_at !== null) bits.push(`SUBMITTED T${e.shouted_at}`);
    if (e.heard_at !== null) bits.push(`BROADCAST AT T${e.heard_at}`);
    if (e.lag !== null) bits.push(`<span class="strong">${e.lag} TICKS</span>`);
    box.innerHTML = bits.length ? `<p class="say">${bits.join("  ·  ")}</p>` : "";
  }

  if (n === 4) {
    box.innerHTML = `<table>
      <tr><td>OBSTACLE REACHED SHORT TERM MEMORY</td>
          <td class="r strong">${e.aware ? "YES" : "NO"}</td></tr>
      <tr><td>MOTOR PROCESSOR ACTED</td>
          <td class="r strong">${e.routes.conscious + e.routes.unconscious}×</td></tr>
      <tr><td>&nbsp;&nbsp;ON A BROADCAST</td><td class="r">${e.routes.conscious}</td></tr>
      <tr><td>&nbsp;&nbsp;OVER THE LINK</td>
          <td class="r">${e.routes.unconscious}</td></tr>
      </table><p class="say" style="margin-top:.7rem">“${e.said}”</p>`;
  }

  if (n === 5) {
    const line = `vision reached Short Term Memory on ${e.got_through} of
                  ${e.watched} ticks while the counting task ran`;
    box.innerHTML =
      e.phase === "miss"
        ? `<p class="say">with the counting task running, the gorilla reached
           Short Term Memory on ${e.got_through} of ${e.watched} ticks</p>`
        : e.count_on
        ? `<p class="say">${line}. now switch the counting task off.</p>`
        : `<p class="say">${line}. with it off, ${e.seen_after}
           broadcast${e.seen_after === 1 ? "" : "s"} so far.</p>`;
  }

  if (n === 6 && e.acted_at !== null) {
    box.innerHTML = `<table>
      <tr><td>HAND TOUCHED THE STOVE</td><td class="r">T${e.touched_at}</td></tr>
      <tr><td>MOTOR ACTED OVER THE LINK</td>
          <td class="r strong">T${e.acted_at}</td></tr>
      <tr><td>PAIN BROADCAST</td><td class="r strong">${
        e.felt_at === null ? "NOT YET" : "T" + e.felt_at}</td></tr>
      </table>` +
      (e.gap ? `<p class="say" style="margin-top:.7rem">it moved
        ${e.gap} ticks before the pain was broadcast</p>` : "");
  }
}

/* ----------------------------------------------------------- curtain */

function showCurtain() {
  setPlaying(false);
  const lv = state.level;
  $("done-no").textContent = lv.number;
  $("done-title").textContent = lv.title;
  $("done-lesson").innerHTML = withTerms(lv.lesson);
  attachTerms($("done-lesson"));
  const svg = document.querySelector(".card-blob");
  svg.innerHTML = "";
  defs(svg);
  const tone = [PALETTE.blue, PALETTE.red, PALETTE.amber][lv.number % 3];
  const g = node(svg, "g", { transform: "translate(220 120)",
                             filter: "url(#p-rough)", opacity: 0.42 });
  node(g, "path", { d: smearPath(lv.number * 17, 200, 92), fill: tone });
  brushField(g, { w: 300, h: 130, seed: lv.number * 5, colour: tone,
                  count: 16, opacity: 0.45 });
  $("btn-next").hidden = state.index >= state.count - 1;
  $("curtain").hidden = false;
}

/* -------------------------------------------------------------- boot */

function wire() {
  $("btn-menu").onclick = showMenu;
  $("btn-again").onclick = () => call("/api/retry", {}).then(showPlay);
  $("btn-next").onclick = () => call("/api/next", {}).then(showPlay);
  paintKey($("btn-next"), 909);
  paintPlate($("hud-panel"), 111, "#26302F",
             { rivets: [[0.012, 0.5], [0.988, 0.5]], strokes: 26, rivetSize: 3 });
  paintPlate($("readout-panel"), 222, "#1B2223",
             { strokes: 22, chips: 7, rivets: [[0.02, 0.12], [0.98, 0.12],
                                               [0.02, 0.88], [0.98, 0.88]],
               rivetSize: 2.6 });
  $("btn-glossary").onclick = () => showIndex();
  $("btn-glossary-2").onclick = () => showIndex();
  $("btn-index-back").onclick = leaveIndex;
  document.addEventListener("keydown", (e) => {
    if (!$("screen-index").hidden) {
      if (e.key === "Escape") leaveIndex();
      return;
    }
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
