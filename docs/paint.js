/* A small painting library.
 *
 * Everything the interface is made of -- plates, buttons, switches, the rack --
 * is built from the same three moves a painter would use: lay a broken-colour
 * ground, drag a few loaded strokes across it, then catch the edges with light.
 * Nothing is a flat fill and nothing is a CSS gradient; shapes are pushed
 * through turbulence so no edge is ever quite straight.
 */

const NS = "http://www.w3.org/2000/svg";

export function rng(seed) {
  let a = (seed * 2654435761) % 2147483647 | 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function node(parent, tag, attrs, cls) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  if (cls) n.setAttribute("class", cls);
  if (parent) parent.appendChild(n);
  return n;
}

/* Shared filters. Injected once per SVG root. */
export function defs(svg) {
  if (svg.querySelector("defs[data-paint]")) return;
  const d = node(svg, "defs", { "data-paint": "1" });
  d.innerHTML = `
    <filter id="p-rough" x="-30%" y="-30%" width="160%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="4"
                    seed="11" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="11"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="p-edge" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4"
                    seed="23" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="p-fine" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3"
                    seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="p-bloom" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="p-phosphor">
      <stop offset="0%" stop-color="#4A3410"/>
      <stop offset="70%" stop-color="#241B0C"/>
      <stop offset="100%" stop-color="#15120A"/>
    </radialGradient>`;
}

/* ---------------------------------------------------------------- shapes */

/* A rectangle as a painter would lay it: corners rounded unevenly, sides
   bowed, so nothing reads as a drawn box. */
export function slabPath(w, h, seed, wob = 3.4) {
  const r = rng(seed);
  const j = () => (r() - 0.5) * wob * 2;
  const p = [
    [j(), j()], [w * 0.35 + j(), j() * 0.7], [w + j(), j()],
    [w + j() * 0.7, h * 0.4 + j()], [w + j(), h + j()],
    [w * 0.6 + j(), h + j() * 0.7], [j(), h + j()],
    [j() * 0.7, h * 0.55 + j()],
  ];
  let d = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    const mx = (a[0] + b[0]) / 2 + j() * 0.5;
    const my = (a[1] + b[1]) / 2 + j() * 0.5;
    d += ` Q ${mx.toFixed(1)} ${my.toFixed(1)}, ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }
  return d + " Z";
}

/* An irregular closed blob -- for smears and stains. */
export function smearPath(seed, rx, ry, wobble = 0.24, n = 11) {
  const r = rng(seed);
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.22;
    const k = 1 - wobble + r() * wobble * 2;
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

/* ---------------------------------------------------------------- colour */

const hex = (c) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

/* Broken colour: nudge a hue rather than tint it uniformly, the way mixed
   paint never lands twice on the same note. */
export function jitter(colour, r, amount = 26, warm = 0) {
  const [a, b, c] = hex(colour);
  const d = () => (r() - 0.5) * amount * 2;
  return `rgb(${clamp(a + d() + warm)},${clamp(b + d())},${clamp(c + d() - warm)})`;
}

/* --------------------------------------------------------------- surfaces */

/* Lay a ground of loaded strokes across an area. This is what stops a panel
   reading as a fill: up close it is thirty overlapping marks. */
export function brushField(parent, { w, h, seed, colour, count = 26,
                                     opacity = 0.5, warm = 0, vertical = false }) {
  const r = rng(seed);
  const g = node(parent, "g", { filter: "url(#p-fine)", opacity });
  for (let i = 0; i < count; i++) {
    const t = i / count;
    if (vertical) {
      const x = t * w + (r() - 0.5) * (w / count) * 2.2;
      node(g, "path", {
        d: `M ${x.toFixed(1)} ${(r() * h * 0.3).toFixed(1)} ` +
           `Q ${(x + (r() - 0.5) * 7).toFixed(1)} ${(h / 2).toFixed(1)}, ` +
           `${(x + (r() - 0.5) * 9).toFixed(1)} ${(h - r() * h * 0.25).toFixed(1)}`,
        stroke: jitter(colour, r, 22, warm), fill: "none",
        "stroke-width": (w / count) * (0.7 + r() * 1.1),
        "stroke-linecap": "round", opacity: 0.35 + r() * 0.5,
      });
    } else {
      const y = t * h + (r() - 0.5) * (h / count) * 2.2;
      node(g, "path", {
        d: `M ${(r() * w * 0.22).toFixed(1)} ${y.toFixed(1)} ` +
           `Q ${(w / 2).toFixed(1)} ${(y + (r() - 0.5) * 7).toFixed(1)}, ` +
           `${(w - r() * w * 0.18).toFixed(1)} ${(y + (r() - 0.5) * 9).toFixed(1)}`,
        stroke: jitter(colour, r, 22, warm), fill: "none",
        "stroke-width": (h / count) * (0.8 + r() * 1.2),
        "stroke-linecap": "round", opacity: 0.35 + r() * 0.5,
      });
    }
  }
  return g;
}

/* A painted metal plate: ground, brushwork, rim light, worn corners. */
export function plate(parent, { x = 0, y = 0, w, h, seed, colour, warm = 0,
                                rim = "#4A5658", shade = "#0B0F11",
                                strokes = 22, wob = 3.4, chips = 5 }) {
  const r = rng(seed + 91);
  const g = node(parent, "g", { transform: `translate(${x} ${y})` });
  const shape = slabPath(w, h, seed, wob);

  const clipId = `clip-${seed}-${Math.round(w)}-${Math.round(h)}`;
  const cp = node(g, "clipPath", { id: clipId });
  node(cp, "path", { d: shape });

  const body = node(g, "g", { filter: "url(#p-edge)" });
  node(body, "path", { d: shape, fill: colour });

  const inner = node(g, "g", { "clip-path": `url(#${clipId})` });
  brushField(inner, { w, h, seed: seed + 5, colour, count: strokes, warm,
                      opacity: 0.62 });

  // Light along the top lip, shadow under the bottom -- the whole reason a
  // painted panel reads as a solid object.
  node(inner, "path", {
    d: `M 2 3 Q ${w / 2} ${1 + (r() - 0.5) * 3}, ${w - 2} 3.5`,
    stroke: rim, "stroke-width": 1.8 + r(), fill: "none", opacity: 0.75,
    filter: "url(#p-fine)",
  });
  node(inner, "path", {
    d: `M 2 ${h - 2.5} Q ${w / 2} ${h - 0.5}, ${w - 2} ${h - 3}`,
    stroke: shade, "stroke-width": 2.6 + r(), fill: "none", opacity: 0.8,
    filter: "url(#p-fine)",
  });

  // Worn paint at the corners.
  for (let i = 0; i < chips; i++) {
    const cx = r() < 0.5 ? r() * w * 0.18 : w - r() * w * 0.18;
    const cy = r() < 0.5 ? r() * h * 0.3 : h - r() * h * 0.3;
    node(inner, "path", {
      d: smearPath(seed + i * 13, 2 + r() * 5, 1.5 + r() * 3),
      transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`,
      fill: jitter(rim, r, 16), opacity: 0.16 + r() * 0.2,
      filter: "url(#p-fine)",
    });
  }
  return g;
}

export function rivet(parent, x, y, seed, r0 = 3.2) {
  const r = rng(seed);
  const g = node(parent, "g", { transform: `translate(${x} ${y})`,
                                filter: "url(#p-fine)" });
  node(g, "path", { d: smearPath(seed, r0 + 1, r0 + 1, 0.18, 8), fill: "#161C1E" });
  node(g, "path", { d: smearPath(seed + 3, r0 * 0.62, r0 * 0.62, 0.2, 7),
                    fill: "#46524F", opacity: 0.7 + r() * 0.2,
                    transform: "translate(-0.6 -0.8)" });
  return g;
}

/* ------------------------------------------------------- HTML backdrops */

/* Paint a backdrop into an HTML element. The SVG is sized to the element's
   measured box so brushwork keeps its proportions instead of being stretched
   by preserveAspectRatio. */
export function backdrop(host, draw, seedBase = 1) {
  const paint = () => {
    const box = host.getBoundingClientRect();
    const w = Math.max(8, Math.round(box.width));
    const h = Math.max(8, Math.round(box.height));
    let svg = host.querySelector(":scope > svg.paint-bg");
    if (!svg) {
      svg = node(null, "svg", { class: "paint-bg" });
      host.prepend(svg);
    }
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.innerHTML = "";
    defs(svg);
    draw(svg, w, h, seedBase);
  };
  paint();
  // Re-paint if the box changes (font load, wrap, resize).
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => paint());
    ro.observe(host);
  }
  return paint;
}
