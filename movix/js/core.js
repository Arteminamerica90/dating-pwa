/* ==========================================================================
   Movix — web motion-graphics studio
   core.js : utilities, state, project & layer model, effect registry
   ========================================================================== */
"use strict";

/* ------------------------------------------------------------------ utils */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;

function hexToRgb(hex) {
  hex = (hex || "#000000").replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
}
function withAlpha(c, a) { const [r, g, b] = hexToRgb(c); return `rgba(${r},${g},${b},${a})`; }

function fmtTime(t, fps) {
  t = Math.max(0, t);
  const f = Math.round((t % 1) * fps);
  const tot = Math.floor(t);
  const s = tot % 60, m = Math.floor(tot / 60) % 60, h = Math.floor(tot / 3600);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}
function fmtNum(v, dec = 1) {
  if (Array.isArray(v)) return v.map(x => verySmall(x, dec)).join(", ");
  return verySmall(v, dec);
}
function verySmall(v, dec) { return (Math.abs(v) < 1e-6 ? 0 : +(+v).toFixed(dec)).toString(); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(el._t); el._t = setTimeout(() => (el.hidden = true), 1800);
}
function parseVal(str, ref) {
  const parts = String(str).split(",").map(s => parseFloat(s.trim()));
  if (Array.isArray(ref)) return ref.map((_, i) => (isNaN(parts[i]) ? (ref[i] || 0) : parts[i]));
  const n = parts[0];
  return isNaN(n) ? ref : n;
}

/* ------------------------------------------------------------ state model */
let project = null;
const ui = {
  tool: "selection", fill: "#e8e8e8", stroke: "#000000",
  activeCompId: null, selLayerIds: [], selProp: null,
  expanded: {}, fxExpanded: {},
  time: 0, playing: false, loop: true,
  zoom: 1, resolution: "full", checker: true, tlZoom: 1, pps: 80,
  viewMode: "composition", clipboard: null, layerSearch: "",
  _lastLayerNum: 0, drag: null
};
let undoStack = [], redoStack = [], dirty = false;

function markDirty() { dirty = true; const d = $("#dirty-dot"); if (d) d.classList.add("on"); }
function cleanDirty() { dirty = false; const d = $("#dirty-dot"); if (d) d.classList.remove("on"); }

/* --------------------------------------------------------- project factory */
function newComposition(name, w, h, fps, dur, bg) {
  return {
    id: uid("comp"), kind: "comp", name: name || "Comp",
    width: w || 1280, height: h || 720, fps: fps || 30, duration: dur || 10,
    bg: bg || "#000000", layers: []
  };
}
function resetProject(demo) {
  project = { name: "Untitled Project", compositions: [], assets: [], activeCompId: null };
  ui.selLayerIds = []; ui.selProp = null; ui.time = 0; ui.expanded = {}; ui._lastLayerNum = 0;
  const c = newComposition("Comp 1", 1280, 720, 30, 10, "#101014");
  project.compositions.push(c);
  project.activeCompId = c.id; ui.activeCompId = c.id;
  undoStack = []; redoStack = [];
  cleanDirty();
  if (demo) buildDemo(c);
}
function buildDemo(c) {
  const t1 = makeLayer("text", "MOVIX", c);
  t1.text = "MOVIX"; t1.fontSize = 150; t1.color = "#ffffff"; t1.weight = "700"; t1.tracking = 4; t1.align = "center";
  recenterAnchor(t1);
  t1.transform.position.value = [c.width / 2, c.height / 2 - 60];
  t1.effects.push(makeEffect("Glow"));
  t1.effects.push(makeEffect("Drop Shadow"));
  const t2 = makeLayer("text", "web motion studio", c);
  t2.text = "web motion studio"; t2.fontSize = 40; t2.color = "#7fd0ff"; t2.align = "center"; recenterAnchor(t2);
  t2.transform.position.value = [c.width / 2, c.height / 2 + 70];
  const bg = makeLayer("solid", "Backdrop", c);
  bg.color = "#141428";
  c.layers.unshift(t2); c.layers.unshift(t1); c.layers.push(bg);
  setKf(t1.transform.scale, 0, [40, 40]);
  setKf(t1.transform.scale, 1.2, [100, 100]);
  t1.transform.scale.kf[1].easing = "ease";
  setKf(t1.transform.opacity, 0, 0);
  setKf(t1.transform.opacity, 0.8, 100);
}

/* ---------------------------------------------------------- layer factory */
function makeLayer(type, name, comp, opts) {
  comp = comp || activeComp();
  opts = opts || {};
  const w = comp.width, h = comp.height;
  const l = {
    id: uid("L"), type, name: name || defaultName(type),
    enabled: true, solo: false, locked: false, shy: false, threeD: false,
    inPoint: opts.inPoint != null ? opts.inPoint : 0,
    outPoint: opts.outPoint != null ? opts.outPoint : comp.duration,
    color: opts.color || (type === "solid" || type === "shape" ? "#e8e8e8" : "#8a7fff"),
    texture: !!opts.texture,
    text: opts.text || "Text",
    font: "Arial", fontSize: 100, weight: "400", italic: false,
    tracking: 0, lineHeight: 1.15, align: "left",
    shapeType: opts.shapeType || "rect",
    shapeW: Math.min(w * 0.4, 400), shapeH: Math.min(h * 0.4, 300),
    points: 5, inner: 50, roundness: 0, fillOn: true, strokeOn: false,
    strokeWidth: 4, strokeColor: "#000000",
    assetId: null, imageW: 0, imageH: 0, compId: null,
    parentId: null, matteId: null, matteType: "alpha", masks: [],
    camera: { zoom: 1000, focusZ: 0, dof: false, aperture: 16 },
    transform: {
      anchor: mkProp([0, 0]),
      position: mkProp([w / 2, h / 2]),
      scale: mkProp([100, 100]),
      rotation: mkProp(0),
      opacity: mkProp(100)
    },
    effects: [], blend: "normal",
    _num: ++ui._lastLayerNum
  };
  const cs = contentSize(l, comp);
  l.transform.anchor.value = [cs.w / 2, cs.h / 2];
  l.transform.position.value = [w / 2, h / 2];
  return l;
}
function mkProp(value) { return { value, kf: [], expr: "" }; }
function defaultName(type) {
  const n = { text: "Text", solid: "Solid", shape: "Shape", adjustment: "Adjustment", "null": "Null", camera: "Camera", light: "Light", image: "Footage", comp: "Precomp" };
  return n[type] || "Layer";
}
function recenterAnchor(l) {
  const cs = contentSize(l);
  const old = l.transform.anchor.value;
  l.transform.anchor.value = [cs.w / 2, cs.h / 2];
  if (l.transform.anchor.kf.length) setKf(l.transform.anchor, ui.time, [cs.w / 2, cs.h / 2]);
}
function contentSize(l, comp) {
  comp = comp || activeComp();
  if (l.type === "solid" || l.type === "adjustment") return { w: comp.width, h: comp.height };
  if (l.type === "shape") return { w: l.shapeW + l.strokeWidth * 2, h: l.shapeH + l.strokeWidth * 2 };
  if (l.type === "image") return { w: l.imageW || comp.width, h: l.imageH || comp.height };
  if (l.type === "comp") { const sc = compById(l.compId); return { w: sc ? sc.width : comp.width, h: sc ? sc.height : comp.height }; }
  if (l.type === "text") return measureText(l);
  return { w: comp.width, h: comp.height };
}
function measureText(l) {
  const c = document.createElement("canvas").getContext("2d");
  c.font = `${l.italic ? "italic " : ""}${l.weight} ${l.fontSize}px ${l.font}, Arial, sans-serif`;
  const lines = String(l.text || "").split("\n");
  let w = 10, h = 0;
  for (const ln of lines) {
    const m = c.measureText(ln).width + Math.max(0, ln.length - 1) * l.tracking;
    w = Math.max(w, m); h += l.fontSize * l.lineHeight;
  }
  return { w: Math.ceil(w + 20), h: Math.ceil(h + 10), lines };
}

/* ----------------------------------------------------------- active comp */
function activeComp() { return project.compositions.find(c => c.id === project.activeCompId) || project.compositions[0]; }
function compById(id) { return project.compositions.find(c => c.id === id) || null; }
function layerById(id) { for (const c of project.compositions) { const l = c.layers.find(x => x.id === id); if (l) return l; } return null; }
function compOfLayer(id) { for (const c of project.compositions) { if (c.layers.some(x => x.id === id)) return c; } return null; }
function selectedLayers() { const c = activeComp(); return c.layers.filter(l => ui.selLayerIds.includes(l.id)); }
function primaryLayer() { return layerById(ui.selLayerIds[ui.selLayerIds.length - 1]) || null; }
function iconForLayer(l) {
  return { text: "T", solid: "▧", shape: "◆", adjustment: "◐", "null": "⊘", camera: "🎥", light: "💡", image: "🖼", comp: "◫" }[l.type] || "▢";
}

/* =============================================================== EFFECTS */
const EFFECTS = {};
const EFFECT_CATS = ["Blur & Sharpen", "Color Correction", "Distort", "Generate", "Keying", "Noise & Grain", "Perspective", "Stylize", "Transition", "Channel"];
function defEffect(def) { EFFECTS[def.name] = def; return def; }
function P(label, type, def, extra) { return Object.assign({ label, type, def }, extra || {}); }
function makeEffect(name) {
  const def = EFFECTS[name] || EFFECTS["Gaussian Blur"];
  const params = {};
  for (const k in def.params) params[k] = def.params[k].def;
  return { id: uid("fx"), name: def.name, enabled: true, params };
}
function blendToOp(b, fallback) {
  return ({ Normal: fallback || "source-over", Multiply: "multiply", Screen: "screen", Overlay: "overlay", Add: "lighter", Darken: "darken", Lighten: "lighten", "Soft Light": "soft-light", "Hard Light": "hard-light", Difference: "difference", Exclusion: "exclusion", Hue: "hue", Saturation: "saturation", Color: "color", Luminosity: "luminosity" })[b] || (fallback || "source-over");
}
function applyEffectChain(canvas, layer) {
  if (!layer.effects.length) return canvas;
  let cur = canvas;
  for (const fx of layer.effects) {
    if (!fx.enabled) continue;
    const def = EFFECTS[fx.name]; if (!def) continue;
    const p = Object.assign({}, fx.params);
    if (fx.paramKf) for (const k in fx.paramKf) p[k] = getVal(fx.paramKf[k], ui.time);
    if (def.pixel) {
      const ctx = cur.getContext("2d");
      const img = ctx.getImageData(0, 0, cur.width, cur.height);
      def.apply(img, p); ctx.putImageData(img, 0, 0);
    } else if (def.draw) {
      const out = document.createElement("canvas"); out.width = cur.width; out.height = cur.height;
      const octx = out.getContext("2d");
      octx.save(); def.draw(cur, out, octx, p); octx.restore();
      cur = out;
    }
  }
  return cur;
}
