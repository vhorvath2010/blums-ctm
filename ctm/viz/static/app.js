/* Front end for the CTM console.  It holds no model state: every frame is a
   snapshot of the Python machine, and every control is a command sent to it. */

const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";

const MODALITIES = ["vision", "audition", "nociception", "inner-speech",
                    "world", "dream", "task", "idle", "silence"];
const colour = (m) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(`--m-${MODALITIES.includes(m) ? m : "idle"}`).trim() || "#888";

const fmt = (v) =>
  v === 0 ? "0" :
  v >= 100 ? v.toFixed(0) :
  v >= 10 ? v.toFixed(1) :
  v >= 0.1 ? v.toFixed(2) :
  v.toPrecision(2);

const SHORT = {
  "vision": "vis", "audition": "aud", "nociception": "noc", "motor": "mot",
  "inner-speech": "spch", "model-of-world": "mow", "memory": "mem", "task": "task",
};
const short = (n) => SHORT[n] || n.replace("idle-", "i");

let state = null;
let selected = null;      // {level, index}
let playing = null;

/* ------------------------------------------------------------- transport */

async function call(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) { console.error(data.error); return state; }
  state = data;
  render();
  return data;
}

const step = (n = 1) => call("/api/tick", { n });

function togglePlay() {
  if (playing) {
    clearInterval(playing); playing = null;
    $("btn-play").textContent = "Play"; $("btn-play").classList.remove("on");
  } else {
    playing = setInterval(() => step(1), 550);
    $("btn-play").textContent = "Pause"; $("btn-play").classList.add("on");
  }
}

/* ---------------------------------------------------------------- render */

function render() {
  if (!state) return;
  $("m-t").textContent = state.t;
  $("m-h").textContent = state.h;
  $("m-lag").textContent = state.latency;
  $("caption").textContent = state.caption;

  renderSTM();
  renderTree();
  renderProcessors();
  renderSignals();
  renderActions();
  renderStream();
  renderSpeech();
  renderVerdict();
  syncControls();
  if (selected) showDetail(selected.level, selected.index);
}

function renderSTM() {
  const body = $("stm-body");
  const s = state.stm;
  if (!s) {
    body.innerHTML = '<span class="silent">silent &mdash; no chunk won this tick</span>';
  } else {
    body.innerHTML = "";
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = `${s.owner} · submitted at t=${s.submitted_at}, ` +
                      `conscious ${s.age + 1} ticks later`;
    const line = document.createElement("div");
    line.textContent = s.content;
    line.style.color = colour(s.modality);
    body.append(who, line);
  }

  // Mood is signed and centred; intensity is unsigned and grows from the left.
  const span = Math.max(40, Math.abs(state.mood) * 1.2, state.intensity);
  const mood = state.mood / span;               // -1 .. +1
  const g = $("g-mood");
  g.style.background = state.mood >= 0 ? "var(--good)" : "var(--bad)";
  g.style.left = `${(mood >= 0 ? 50 : 50 + mood * 50).toFixed(1)}%`;
  g.style.width = `${(Math.abs(mood) * 50).toFixed(1)}%`;
  $("v-mood").textContent = state.mood.toFixed(2);

  const gi = $("g-int");
  gi.style.background = "var(--accent)";
  gi.style.left = "0%";
  gi.style.width = `${Math.min(100, (state.intensity / span) * 100).toFixed(1)}%`;
  $("v-int").textContent = state.intensity.toFixed(2);
}

/* --------------------------------------------------------------- the tree */

const W = 980, H = 430, PAD_X = 26, TOP = 22, BOT = 62;

function nodeXY(level, index, levels) {
  const count = levels[level].length;
  const usable = W - PAD_X * 2;
  const x = PAD_X + usable * ((index + 0.5) / count);
  const rows = levels.length;                     // h + 1
  const y = TOP + (H - TOP - BOT) * (1 - level / (rows - 1));
  return { x, y };
}

function renderTree() {
  const svg = $("tree");
  const levels = state.tree;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";

  const leafW = (W - PAD_X * 2) / levels[0].length;
  const boxW = Math.max(14, Math.min(46, leafW - 6));
  const boxH = 22;

  // Edges first, so nodes sit on top of them.
  for (let s = 1; s < levels.length; s++) {
    levels[s].forEach((node, i) => {
      const parent = nodeXY(s, i, levels);
      [0, 1].forEach((side) => {
        const ci = i * 2 + side;
        const child = nodeXY(s - 1, ci, levels);
        const won = node.winner_child === side;
        const path = document.createElementNS(SVGNS, "path");
        const my = (parent.y + child.y) / 2;
        path.setAttribute("d",
          `M ${child.x} ${child.y - boxH / 2} C ${child.x} ${my}, ${parent.x} ${my}, ` +
          `${parent.x} ${parent.y + boxH / 2}`);
        path.setAttribute("class", `edge ${won ? "win" : "lose"}`);
        const cn = levels[s - 1][ci];
        if (won && !cn.silent) path.setAttribute("stroke", colour(cn.modality));
        svg.appendChild(path);
      });
    });
  }

  // Level labels: each row is a different competition, which is the point.
  for (let s = 0; s < levels.length; s++) {
    const { y } = nodeXY(s, 0, levels);
    const label = document.createElementNS(SVGNS, "text");
    label.setAttribute("class", "level-label");
    label.setAttribute("x", 4);
    label.setAttribute("y", y + 3);
    label.textContent = s === 0 ? "leaves · t" :
                        s === levels.length - 1 ? `STM · t−${s}` : `level ${s} · t−${s}`;
    svg.appendChild(label);
  }

  // Nodes.
  for (let s = 0; s < levels.length; s++) {
    levels[s].forEach((node, i) => {
      const { x, y } = nodeXY(s, i, levels);
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "node" +
        (selected && selected.level === s && selected.index === i ? " sel" : ""));
      g.addEventListener("click", () => { selected = { level: s, index: i };
                                          renderTree(); showDetail(s, i); });

      const rect = document.createElementNS(SVGNS, "rect");
      const w = s === 0 ? boxW : Math.min(96, boxW * Math.pow(1.7, s));
      rect.setAttribute("x", x - w / 2);
      rect.setAttribute("y", y - boxH / 2);
      rect.setAttribute("width", w);
      rect.setAttribute("height", boxH);
      rect.setAttribute("rx", 4);
      rect.setAttribute("fill", node.silent ? "var(--m-silence)" : colour(node.modality));
      rect.setAttribute("opacity", node.silent ? 0.35 : 1);
      g.appendChild(rect);

      if (!node.silent && w > 30) {
        const t = document.createElementNS(SVGNS, "text");
        t.setAttribute("class", "node-f");
        t.setAttribute("x", x);
        t.setAttribute("y", y + 3.5);
        t.setAttribute("text-anchor", "middle");
        t.textContent = s === 0 ? fmt(node.f)
                                : `${short(procName(node.address))} ${fmt(node.f)}`;
        g.appendChild(t);
      }

      const title = document.createElementNS(SVGNS, "title");
      title.textContent = node.silent
        ? "silent leaf (f = 0)"
        : `${procName(node.address)} · ${node.content}\nf = ${fmt(node.f)}  ` +
          `intensity ${node.intensity.toFixed(2)}  mood ${node.mood.toFixed(2)}`;
      g.appendChild(title);
      svg.appendChild(g);
    });
  }

  // Leaf labels along the bottom.
  levels[0].forEach((node, i) => {
    const { x, y } = nodeXY(0, i, levels);
    const t = document.createElementNS(SVGNS, "text");
    t.setAttribute("class", "leaf-label");
    t.setAttribute("x", x);
    t.setAttribute("y", y + boxH / 2 + 13);
    t.setAttribute("text-anchor", "middle");
    t.textContent = short(state.processors[i] ? state.processors[i].name : "");
    svg.appendChild(t);
  });

  drawLinkTraffic(svg, levels, boxH);
}

/* The sideways route.  When a chunk travels a link it never enters the tree at
   all, which is exactly why it never becomes conscious. */
function drawLinkTraffic(svg, levels, boxH) {
  if (!state.link_traffic.length) return;
  const index = {};
  state.processors.forEach((p, i) => { index[p.name] = i; });

  state.link_traffic.forEach((tr) => {
    const a = index[tr.from], b = index[tr.to];
    if (a === undefined || b === undefined) return;
    const pa = nodeXY(0, a, levels), pb = nodeXY(0, b, levels);
    const dip = pa.y + boxH / 2 + 26;
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute("class", "linkpath");
    path.setAttribute("stroke", colour(tr.modality));
    path.setAttribute("d",
      `M ${pa.x} ${pa.y + boxH / 2} C ${pa.x} ${dip}, ${pb.x} ${dip}, ${pb.x} ${pb.y + boxH / 2}`);
    svg.appendChild(path);

    const label = document.createElementNS(SVGNS, "text");
    label.setAttribute("class", "linkpath-label");
    label.setAttribute("fill", colour(tr.modality));
    label.setAttribute("x", (pa.x + pb.x) / 2);
    label.setAttribute("y", dip + 11);
    label.setAttribute("text-anchor", "middle");
    label.textContent = `${tr.from} → ${tr.to} · unconscious, bypasses the tree`;
    svg.appendChild(label);
  });
}

const procName = (addr) =>
  addr < 0 ? "silence"
           : (state.processors.find((p) => p.address === addr) || {}).name || `p${addr}`;

function showDetail(level, index) {
  const el = $("detail");
  const levels = state.tree;
  if (level >= levels.length || index >= levels[level].length) { selected = null; return; }
  const node = levels[level][index];

  if (level === 0) {
    el.innerHTML = node.silent
      ? `<h4>Leaf ${index} &mdash; ${procName(node.address)}</h4>
         <span class="hint">Nothing submitted this tick. f = 0, so it loses every
         competition it can lose.</span>`
      : `<h4>Leaf ${index} &mdash; ${procName(node.address)}</h4>
         <table><tr><td class="name">gist</td><td>${esc(node.content)}</td></tr>
         <tr><td class="name">weight</td><td>${node.weight.toFixed(3)}</td></tr>
         <tr><td class="name">f = intensity</td><td>${node.f.toFixed(3)}</td></tr></table>`;
    return;
  }

  const l = levels[level - 1][index * 2];
  const r = levels[level - 1][index * 2 + 1];
  const fl = l.f, fr = r.f, total = fl + fr;
  const pl = total === 0 ? 0.5 : fl / total;
  const wonLeft = node.winner_child === 0;

  const row = (c, f, p, won) => `
    <tr>
      <td class="name">${won ? "▶" : "&nbsp;"}</td>
      <td class="${won ? "won" : "lost"}">${esc(c.silent ? "(silent)" : procName(c.address))}</td>
      <td class="${won ? "won" : "lost"}">${esc(c.silent ? "" : c.content)}</td>
      <td>f=${fmt(f)}</td>
      <td>${(p * 100).toFixed(1)}%</td>
    </tr>`;

  el.innerHTML = `
    <h4>${level === levels.length - 1 ? "Root (STM)" : `Level ${level}`},
        node ${index} &mdash; coin-flip neuron</h4>
    <table>
      ${row(l, fl, pl, wonLeft)}
      ${row(r, fr, 1 - pl, !wonLeft)}
    </table>
    <span class="hint">The winner carries its own gist upward unchanged, but
    takes both children's sums: intensity ${node.intensity.toFixed(2)},
    mood ${node.mood.toFixed(2)}.</span>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* --------------------------------------------------------- side panels */

function renderProcessors() {
  const ul = $("procs");
  ul.innerHTML = "";
  const max = Math.max(...state.processors.map((p) => p.share), 0.001);
  state.processors.forEach((p) => {
    const li = document.createElement("li");
    li.className = "proc" + (p.share > 0 ? " active" : "");
    const c = colour(p.submitted ? p.submitted.modality : "idle");
    li.innerHTML = `
      <span class="nm"><i class="pip" style="background:${c}"></i>${esc(p.name)}</span>
      <span class="pct">${(p.share * 100).toFixed(1)}%</span>
      <span class="bar"><i style="width:${(p.share / max * 100).toFixed(1)}%;
        background:${c}"></i></span>
      <span class="said">${p.submitted ? esc(p.submitted.content) +
        ` · f=${p.submitted.f.toFixed(1)}` : "&mdash; silent"}</span>`;
    ul.appendChild(li);
  });
}

function renderSignals() {
  const box = $("signals");
  const sig = state.world.signals;
  box.innerHTML = sig.length ? "" :
    '<span class="hint">No stimulus present.</span>';
  sig.forEach((s) => {
    const d = document.createElement("div");
    d.className = "signal";
    d.innerHTML = `<i class="pip" style="background:${colour(s.channel)}"></i>
      ${esc(s.label)} <span class="ttl">×${s.strength} · ${s.ticks_left} left</span>`;
    box.appendChild(d);
  });
}

function renderActions() {
  const ul = $("actions");
  ul.innerHTML = "";
  if (!state.acted.length) {
    ul.innerHTML = '<span class="hint">The body has not moved.</span>';
    return;
  }
  state.acted.slice().reverse().forEach((a) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="t">t=${a.t}</span>
      <span class="route ${a.route}">${a.route}</span> ${esc(a.about)}`;
    ul.appendChild(li);
  });
}

function renderStream() {
  const ol = $("stream");
  ol.innerHTML = "";
  let idle = 0;
  const flush = () => {
    if (!idle) return;
    const li = document.createElement("li");
    li.innerHTML = `<span class="t"></span>
      <span class="idle-run">… ${idle} tick${idle > 1 ? "s" : ""} of idle hum …</span>`;
    ol.prepend(li); idle = 0;
  };
  state.stream.forEach((c) => {
    if (c.modality === "idle") { idle++; return; }
    flush();
    const li = document.createElement("li");
    li.innerHTML = `<span class="t">${c.t}</span>
      <i class="pip" style="background:${colour(c.modality)}"></i>
      <span class="who">${esc(c.owner)}</span>
      <span>${esc(c.content)}</span>`;
    ol.prepend(li);
  });
  flush();
}

function renderSpeech() {
  const ol = $("speech");
  ol.innerHTML = "";
  if (!state.speech.length) {
    ol.innerHTML = '<li><span class="hint">It has said nothing.</span></li>';
    return;
  }
  state.speech.forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="t">${s.t}</span><span>${esc(s.line)}</span>`;
    ol.prepend(li);
  });
}

function renderVerdict() {
  const saw = state.conscious_of.vision;
  const felt = state.conscious_of.nociception;
  const r = state.routes;
  const acted = r.conscious + r.unconscious;
  const said = [...state.speech].reverse().find((s) => s.about === "vision");

  // Inner speech hears the broadcast one tick after it lands in STM, so a "yes"
  // with no line yet is a lag, not a denial.  Saying otherwise would put a false
  // report in the machine's mouth -- the exact error this panel exists to expose.
  let quote, tone;
  if (said) { quote = said.line; tone = "said"; }
  else if (saw) { quote = "(nothing said yet � inner speech hears the broadcast " +
                          "one tick later. Step once more.)"; tone = "pending"; }
  else { quote = "I noticed no vision at all."; tone = "said"; }

  const blindsight = !saw && r.unconscious > 0;
  const raced = saw && r.unconscious > 0 && r.conscious === 0;

  $("verdict").innerHTML = `
    <div class="row"><span>Vision reached STM</span>
      <span class="val ${saw ? "yes" : "no"}">${saw ? "YES" : "NO"}</span></div>
    <div class="row"><span>Pain reached STM</span>
      <span class="val ${felt ? "yes" : "no"}">${felt ? "YES" : "NO"}</span></div>
    <div class="row"><span>Body acted</span>
      <span class="val ${acted ? "yes" : "no"}">${acted ? `${acted}�` : "NO"}</span></div>
    <div class="row"><span>� consciously</span>
      <span class="val">${r.conscious}</span></div>
    <div class="row"><span>� unconsciously</span>
      <span class="val ${r.unconscious ? "yes" : ""}">${r.unconscious}</span></div>
    <p class="quote ${tone}">${esc(quote)}</p>
    ${blindsight
      ? `<p class="punchline">It is acting on what it sees and reporting,
         truthfully, that it saw nothing. The information reached the body over a
         link; it never reached the stage.</p>`
      : raced
      ? `<p class="punchline">It did see the obstacle � but the link got to the
         body first. The unconscious route is h + 1 ticks shorter than the
         conscious one, so awareness arrives after the act.</p>`
      : ""}`;
}

function syncControls() {
  const vis = state.processors.find((p) => p.name === "vision");
  if (vis && vis.gain != null && document.activeElement !== $("gain")) {
    $("gain").value = Math.log10(Math.max(vis.gain, 1e-3)).toFixed(3);
    $("gain-val").textContent = vis.gain.toFixed(3);
  }
  const linked = (a, b) =>
    state.links.some((l) => l.linked &&
      ((l.a === a && l.b === b) || (l.a === b && l.b === a)));
  $("link-vm").checked = linked("vision", "motor");
  $("link-nm").checked = linked("nociception", "motor");
  $("task").checked = !!state.task_engaged;
  $("sleep").checked = !!state.asleep;
}

/* ------------------------------------------------------------- controls */

const POKES = [
  { channel: "vision", label: "an obstacle on the left", strength: 1.0 },
  { channel: "audition", label: "a barking dog", strength: 1.0 },
  { channel: "nociception", label: "a hot stove", strength: 1.5 },
];

function buildLegend() {
  const box = document.getElementById("legend");
  if (!box) return;
  ["vision", "audition", "nociception", "inner-speech", "world", "dream",
   "task", "idle"].forEach((m) => {
    const el = document.createElement("span");
    el.className = "key";
    el.innerHTML = `<i style="background:${colour(m)}"></i>${m}`;
    box.appendChild(el);
  });
}

function buildPokes() {
  const box = $("pokes");
  POKES.forEach((p) => {
    const row = document.createElement("div");
    row.className = "poke-row";
    const b = document.createElement("button");
    b.style.setProperty("--dot", colour(p.channel));
    b.innerHTML = `<strong>${p.channel}</strong><br>${esc(p.label)}`;
    b.onclick = () => call("/api/poke", { ...p, duration: 5 });
    row.appendChild(b);
    box.appendChild(row);
  });
}

async function buildScenarios() {
  const { scenarios } = await (await fetch("/api/scenarios")).json();
  const nav = $("scenarios");
  const NAMES = {
    "free": "Free play", "normal-sight": "Normal sight", "blindsight": "Blindsight",
    "inattention": "Inattentional blindness", "free-will": "The delay behind free will",
    "dreaming": "Dreaming",
  };
  Object.keys(scenarios).forEach((key) => {
    const b = document.createElement("button");
    b.textContent = NAMES[key] || key;
    b.onclick = async () => {
      if (playing) togglePlay();
      selected = null;
      await call("/api/scenario", { name: key });
      [...nav.children].forEach((c) => c.classList.remove("on"));
      b.classList.add("on");
    };
    nav.appendChild(b);
  });
}

function wire() {
  $("btn-step").onclick = () => step(1);
  $("btn-step5").onclick = () => step(5);
  $("btn-play").onclick = togglePlay;
  $("btn-reset").onclick = () => {
    if (playing) togglePlay();
    selected = null;
    call("/api/reset", { seed: 0 });
    [...$("scenarios").children].forEach((c) => c.classList.remove("on"));
  };

  $("gain").oninput = (e) => {
    const g = Math.pow(10, parseFloat(e.target.value));
    $("gain-val").textContent = g.toFixed(3);
  };
  $("gain").onchange = (e) =>
    call("/api/gain", { name: "vision", gain: Math.pow(10, parseFloat(e.target.value)) });

  $("task").onchange = (e) => call("/api/task", { on: e.target.checked });
  $("sleep").onchange = (e) => call("/api/sleep", { on: e.target.checked });
  $("link-vm").onchange = (e) =>
    call("/api/link", { a: "vision", b: "motor", on: e.target.checked });
  $("link-nm").onchange = (e) =>
    call("/api/link", { a: "nociception", b: "motor", on: e.target.checked });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === " ") { e.preventDefault(); step(1); }
    if (e.key === "p") togglePlay();
  });
}

(async function start() {
  wire();
  buildPokes();
  buildLegend();
  await buildScenarios();
  await call("/api/state");
})();
