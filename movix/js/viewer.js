/* ==========================================================================
   Movix — viewer.js : playback engine, composition viewer, overlay, interaction
   ========================================================================== */

/* ============================================================== PLAYBACK */
let rafId = null, lastTS = 0;
function play() { if (ui.playing) return; ui.playing = true; lastTS = performance.now(); setPlayUI(); rafId = requestAnimationFrame(tick); }
function pause() { ui.playing = false; cancelAnimationFrame(rafId); setPlayUI(); }
function togglePlay() { ui.playing ? pause() : play(); }
function tick(ts) {
  if (!ui.playing) return;
  const comp = activeComp();
  const dt = Math.min(0.1, (ts - lastTS) / 1000); lastTS = ts;
  ui.time += dt;
  if (ui.time >= comp.duration) { if (ui.loop) ui.time = 0; else { ui.time = comp.duration; pause(); } }
  drawViewer(); updateTimeUI();
  rafId = requestAnimationFrame(tick);
}
function setPlayUI() {
  const b = ui.playing ? "❚❚" : "▶";
  const p1 = $("#play-btn"), p2 = $("#play-btn2");
  if (p1) p1.textContent = b; if (p2) p2.textContent = b;
}
function seek(t) { const c = activeComp(); ui.time = clamp(t, 0, c.duration); drawViewer(); updateTimeUI(); }
function stepFrame(dir) { seek(ui.time + dir / activeComp().fps); }
function nearestKfTime(dir) {
  let best = null;
  for (const pr of allPropRefs()) for (const k of pr.prop.kf) {
    if (dir > 0 && k.time > ui.time + 1e-4) { if (best === null || k.time < best) best = k.time; }
    if (dir < 0 && k.time < ui.time - 1e-4) { if (best === null || k.time > best) best = k.time; }
  }
  if (best !== null) seek(best);
}
function allPropRefs() {
  const out = [], comp = activeComp();
  for (const l of comp.layers) {
    for (const k in l.transform) out.push({ layer: l, kind: "transform", key: k, prop: l.transform[k] });
    for (const fx of l.effects) if (fx.paramKf) for (const k in fx.paramKf) out.push({ layer: l, kind: "effect", key: k, fx, prop: fx.paramKf[k] });
  }
  return out;
}
function updateTimeUI() {
  const comp = activeComp();
  const tr = $("#time-readout");
  if (tr) tr.textContent = fmtTime(ui.time, comp.fps);
  drawPlayhead();
}

/* =============================================================== VIEWER */
function fitZoom() {
  const stage = $("#viewer-stage"), comp = activeComp();
  const pad = 46;
  const zx = (stage.clientWidth - pad) / comp.width, zy = (stage.clientHeight - pad) / comp.height;
  ui.zoom = clamp(Math.min(zx, zy), 0.02, 16);
  applyZoom();
}
function setZoom(z) { ui.zoom = clamp(z, 0.02, 16); applyZoom(); }
function applyZoom() {
  const comp = activeComp(), f = $("#comp-frame"), cv = $("#comp-canvas");
  f.style.width = comp.width * ui.zoom + "px"; f.style.height = comp.height * ui.zoom + "px";
  cv.style.width = comp.width * ui.zoom + "px"; cv.style.height = comp.height * ui.zoom + "px";
  $("#zoom-label").textContent = Math.round(ui.zoom * 100) + "%";
  drawOverlay();
}
function drawViewer() { renderFrame($("#comp-canvas"), ui.time, false); drawOverlay(); }

function drawOverlay() {
  const ov = $("#viewer-overlay");
  const editing = ov.querySelector("textarea.layer-text");
  ov.innerHTML = "";
  if (ui.viewMode !== "composition") { if (editing) ov.appendChild(editing); return; }
  const comp = activeComp(), z = ui.zoom;
  for (const layer of comp.layers) {
    if (!ui.selLayerIds.includes(layer.id)) continue;
    if (ui.time < layer.inPoint || ui.time > layer.outPoint) continue;
    if (layer.type === "null" || layer.type === "camera" || layer.type === "light") continue;
    const b = layerBounds(layer, ui.time, 1);
    const d = document.createElement("div"); d.className = "bbox";
    d.style.left = b.x * z + "px"; d.style.top = b.y * z + "px";
    d.style.width = b.w * z + "px"; d.style.height = b.h * z + "px";
    ov.appendChild(d);
    b.pts.forEach((p, i) => {
      const h = document.createElement("div"); h.className = "handle corner";
      h.style.left = p[0] * z + "px"; h.style.top = p[1] * z + "px";
      h.dataset.corner = i; h.dataset.layer = layer.id;
      ov.appendChild(h);
    });
    const anc = getVal(layer.transform.anchor, ui.time);
    const ap = layerMatrix(layer, ui.time).transformPoint(new DOMPoint(anc[0], anc[1]));
    const a = document.createElement("div"); a.className = "anchor";
    a.style.left = ap.x * z + "px"; a.style.top = ap.y * z + "px";
    a.dataset.anchor = layer.id;
    ov.appendChild(a);
  }
  if (editing) ov.appendChild(editing);
}
function viewerPointToComp(e) {
  const r = $("#comp-frame").getBoundingClientRect();
  return [(e.clientX - r.left) / ui.zoom, (e.clientY - r.top) / ui.zoom];
}
function hitTest(px, py) {
  const comp = activeComp();
  for (const layer of comp.layers) {
    if (!layer.enabled || layer.type === "camera" || layer.type === "light") continue;
    if (ui.time < layer.inPoint || ui.time > layer.outPoint) continue;
    const size = contentSize(layer), m = layerMatrix(layer, ui.time).inverse();
    const p = m.transformPoint(new DOMPoint(px, py));
    if (p.x >= 0 && p.y >= 0 && p.x <= size.w && p.y <= size.h) return layer;
  }
  return null;
}

/* ------------------------------------------------ viewer interactions */
function initViewerInteraction() {
  const stage = $("#viewer-stage"), coord = $("#viewer-overlay");
  stage.addEventListener("mousemove", e => {
    const [x, y] = viewerPointToComp(e);
    $("#info-x").textContent = Math.round(x);
    $("#info-y").textContent = Math.round(y);
    updateRGBReadout(x, y);
  });

  stage.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    const ov = $("#viewer-overlay");
    if (e.target.closest(".handle[data-corner]")) { startScaleDrag(e); return; }
    if (e.target.closest(".anchor[data-anchor]")) { startAnchorDrag(e); return; }
    if (ui.tool === "hand") { startPan(e); return; }
    if (ui.tool === "zoom") { setZoom(ui.zoom * (e.altKey ? 0.5 : 2)); return; }
    if (ui.tool === "text") { const [x, y] = viewerPointToComp(e); createQuickText(x, y); return; }
    if (ui.tool === "rect" || ui.tool === "ellipse" || ui.tool === "polygon" || ui.tool === "star") {
      pushUndo(); const l = addShapeLayer(ui.tool); selectOnly(l); return;
    }

    const [px, py] = viewerPointToComp(e);
    const hit = hitTest(px, py);
    if (hit) {
      if (e.shiftKey) { if (!ui.selLayerIds.includes(hit.id)) ui.selLayerIds.push(hit.id); }
      else if (!ui.selLayerIds.includes(hit.id)) ui.selLayerIds = [hit.id];
      refreshTimeline(); refreshPropPanel(); drawOverlay(); buildProjectPanel();
      if (e.altKey) startAnchorDrag(e);
      else startMoveDrag(e, hit);
    } else {
      ui.selLayerIds = []; refreshTimeline(); refreshPropPanel(); drawOverlay();
      if (ui.tool === "selection") startPan(e);
    }
  });
}

function updateRGBReadout(x, y) {
  const cv = $("#comp-canvas");
  const comp = activeComp(), scale = RES_SCALE[ui.resolution];
  const ix = Math.round(x * scale), iy = Math.round(y * scale);
  if (ix < 0 || iy < 0 || ix >= cv.width || iy >= cv.height) return;
  try {
    const d = cv.getContext("2d").getImageData(ix, iy, 1, 1).data;
    $("#info-r").textContent = d[0]; $("#info-g").textContent = d[1]; $("#info-b").textContent = d[2];
  } catch (err) { }
}

function startMoveDrag(e, layer) {
  const start = viewerPointToComp(e), orig = new Map();
  for (const l of selectedLayers()) orig.set(l.id, getVal(l.transform.position, ui.time).slice());
  let moved = false;
  const mv = ev => {
    const [x, y] = viewerPointToComp(ev); const dx = x - start[0], dy = y - start[1];
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) { if (!moved) { pushUndo(); moved = true; } }
    for (const l of selectedLayers()) {
      const o = orig.get(l.id); if (!o) continue;
      const v = [o[0] + dx, o[1] + dy];
      const pr = l.transform.position;
      if (propIsAnimated(pr)) setKf(pr, ui.time, v); else pr.value = v;
    }
    markDirty(); drawViewer(); refreshPropPanel();
  };
  const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); if (moved) refreshTimeline(); };
  document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
}
function startScaleDrag(e) {
  const layer = primaryLayer(); if (!layer) return;
  pushUndo();
  const corner = +e.target.dataset.corner;
  const b0 = layerBounds(layer, ui.time, 1);
  const center = [(b0.pts[0][0] + b0.pts[2][0]) / 2, (b0.pts[0][1] + b0.pts[2][1]) / 2];
  const start = viewerPointToComp(e);
  const origScale = getVal(layer.transform.scale, ui.time).slice();
  const d0 = Math.hypot(start[0] - center[0], start[1] - center[1]) || 1;
  const mv = ev => {
    const [x, y] = viewerPointToComp(ev);
    const d = Math.hypot(x - center[0], y - center[1]);
    const k = d / d0;
    const v = [origScale[0] * k, origScale[1] * k];
    const pr = layer.transform.scale;
    if (propIsAnimated(pr)) setKf(pr, ui.time, v); else pr.value = v;
    markDirty(); drawViewer(); refreshPropPanel();
  };
  const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); refreshTimeline(); };
  document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
}
function startAnchorDrag(e) {
  const layer = primaryLayer(); if (!layer) return;
  pushUndo();
  const start = viewerPointToComp(e);
  const origAnchor = getVal(layer.transform.anchor, ui.time).slice();
  const origPos = getVal(layer.transform.position, ui.time).slice();
  const mv = ev => {
    const [x, y] = viewerPointToComp(ev); const dx = x - start[0], dy = y - start[1];
    const a = [origAnchor[0] + dx, origAnchor[1] + dy];
    const p = [origPos[0] + dx, origPos[1] + dy];
    const pa = layer.transform.anchor, pp = layer.transform.position;
    if (propIsAnimated(pa)) setKf(pa, ui.time, a); else pa.value = a;
    if (propIsAnimated(pp)) setKf(pp, ui.time, p); else pp.value = p;
    markDirty(); drawViewer(); refreshPropPanel();
  };
  const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); refreshTimeline(); };
  document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
}
function startPan(e) {
  const stage = $("#viewer-stage");
  const sx = stage.scrollLeft, sy = stage.scrollTop, mx = e.clientX, my = e.clientY;
  stage.style.cursor = "grabbing";
  const mv = ev => { stage.scrollLeft = sx - (ev.clientX - mx); stage.scrollTop = sy - (ev.clientY - my); };
  const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); stage.style.cursor = ""; };
  document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
}
function createQuickText(x, y) {
  pushUndo();
  const l = makeLayer("text", "Text", activeComp());
  l.text = "Text"; l.fontSize = 72; l.color = ui.fill; recenterAnchor(l);
  l.transform.position.value = [x, y];
  activeComp().layers.unshift(l); selectOnly(l);
  editTextLayer(l);
}
function editTextLayer(layer) {
  const ov = $("#viewer-overlay");
  const b = layerBounds(layer, ui.time, 1), z = ui.zoom;
  const ta = document.createElement("textarea");
  ta.className = "layer-text";
  const size = contentSize(layer);
  ta.style.left = (b.x) * z + "px"; ta.style.top = (b.y) * z + "px";
  ta.style.width = Math.max(40, size.w * z) + "px"; ta.style.height = Math.max(24, size.h * z) + "px";
  ta.style.fontSize = layer.fontSize * z * (getVal(layer.transform.scale, ui.time)[1] / 100) + "px";
  ta.style.textAlign = layer.align;
  ta.value = layer.text;
  ta.addEventListener("input", () => { layer.text = ta.value; recenterAnchor(layer); markDirty(); drawViewer(); });
  ta.addEventListener("blur", () => { ov.removeChild(ta); refreshAll(); });
  ov.appendChild(ta); ta.focus(); ta.select();
}
