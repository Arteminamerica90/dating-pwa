/* ==========================================================================
   Movix — timeline.js : layer rows, property tracks, keyframes, playhead
   ========================================================================== */

let tlRows = [];
let tlInited = false;

function refreshTimeline() {
  const comp = activeComp();
  if (!comp) return;
  buildRowModel();
  renderTLLayers();
  renderTLTracks();
  renderRuler();
  layoutTimelineWidth();
  drawPlayhead();
  updateTLInfo();
}
function buildRowModel() {
  const comp = activeComp();
  tlRows = [];
  const q = ui.layerSearch.toLowerCase();
  for (const layer of comp.layers) {
    if (q && !layer.name.toLowerCase().includes(q)) continue;
    tlRows.push({ kind: "layer", layer });
    if (ui.expanded[layer.id]) {
      for (const k of ["anchor", "position", "scale", "rotation", "opacity"]) {
        tlRows.push({ kind: "prop", layer, key: k, prop: layer.transform[k], label: propLabel(k) });
      }
      for (const fx of layer.effects) {
        tlRows.push({ kind: "fxHead", layer, fx });
        const def = EFFECTS[fx.name]; if (!def) continue;
        for (const pk in def.params) {
          const pkf = fx.paramKf && fx.paramKf[pk];
          if (pkf) tlRows.push({ kind: "fxparam", layer, fx, key: pk, prop: pkf, label: def.params[pk].label });
        }
      }
    }
  }
  if (tlRows.length === 0) tlRows = [{ kind: "empty" }];
}
function propLabel(k) { return { anchor: "Anchor Point", position: "Position", scale: "Scale", rotation: "Rotation", opacity: "Opacity" }[k] || k; }
const ROW_H = 26;

function renderTLLayers() {
  const box = $("#tl-layers"); box.innerHTML = "";
  const comp = activeComp();
  tlRows.forEach((r, i) => {
    if (r.kind === "empty") { const d = document.createElement("div"); d.className = "layer-row"; d.style.color = "#777"; d.textContent = "No layers — use + Layer ▾"; box.appendChild(d); return; }
    if (r.kind === "prop" || r.kind === "fxparam") {
      const d = document.createElement("div"); d.className = "tl-prop";
      const animated = propIsAnimated(r.prop);
      d.innerHTML = `<span class="pname">${r.label}</span><span class="pval">${fmtNum(getVal(r.prop, ui.time))}</span>`;
      d.addEventListener("click", () => { ui.selProp = { layerId: r.layer.id, key: r.key, prop: r.prop }; });
      box.appendChild(d); return;
    }
    if (r.kind === "fxHead") {
      const d = document.createElement("div"); d.className = "tl-prop"; d.style.color = "#7fd0ff";
      d.innerHTML = `<span class="pname">fx · ${r.fx.name}</span>`;
      box.appendChild(d); return;
    }
    // layer row
    const layer = r.layer;
    const sel = ui.selLayerIds.includes(layer.id);
    const d = document.createElement("div");
    d.className = "layer-row" + (sel ? " sel" : "") + (layer.solo ? " solo" : "");
    d.dataset.layer = layer.id;
    d.innerHTML = `
      <span class="twist" title="Expand">${ui.expanded[layer.id] ? "▾" : "▸"}</span>
      <span class="eyeball ${layer.enabled ? "" : "off"}" title="Toggle visibility">${layer.enabled ? "👁" : "–"}</span>
      <span class="swatch" style="background:${labelColor(layer)}"></span>
      <span class="lname">${layer.name}</span>
      <span class="ltype">${layer.type}</span>
      <span class="no">${tlRows.filter(x => x.kind === "layer").length - tlRows.filter(x => x.kind === "layer").indexOf(r)}</span>`;
    d.querySelector(".twist").addEventListener("click", e => { e.stopPropagation(); ui.expanded[layer.id] = !ui.expanded[layer.id]; refreshTimeline(); });
    d.querySelector(".eyeball").addEventListener("click", e => { e.stopPropagation(); layer.enabled = !layer.enabled; markDirty(); refreshAll(); });
    d.addEventListener("mousedown", e => {
      if (e.target.closest(".twist,.eyeball")) return;
      selectLayerRow(layer, e);
    });
    d.addEventListener("dblclick", () => { if (layer.type === "text") editTextLayer(layer); });
    // label of number handled separately
    const noEl = d.querySelector(".no");
    noEl.textContent = (comp.layers.indexOf(layer) + 1);
    box.appendChild(d);
  });
}
function labelColor(l) {
  const palette = ["#8a7fff", "#ff7f7f", "#7fffa5", "#ffcf7f", "#7fd0ff", "#ff7fe7", "#c9ff7f", "#ffa07f", "#7ffff0", "#b3b3ff"];
  return palette[(l._num || 0) % palette.length];
}
function selectLayerRow(layer, e) {
  if (e.shiftKey) { if (!ui.selLayerIds.includes(layer.id)) ui.selLayerIds.push(layer.id); }
  else if (!ui.selLayerIds.includes(layer.id)) ui.selLayerIds = [layer.id];
  refreshAll();
}

function renderTLTracks() {
  const box = $("#tl-tracks"); box.innerHTML = "";
  const comp = activeComp();
  tlRows.forEach(r => {
    const d = document.createElement("div"); d.className = "track";
    if (r.kind === "empty") { box.appendChild(d); return; }
    const sel = ui.selLayerIds.includes(r.layer.id);
    if (r.kind === "layer") {
      d.classList.add("layer-track"); if (sel) d.classList.add("sel");
      const bar = document.createElement("div"); bar.className = "bar";
      bar.style.left = r.layer.inPoint * ui.pps + "px";
      bar.style.width = Math.max(4, (r.layer.outPoint - r.layer.inPoint) * ui.pps) + "px";
      bar.innerHTML = `<span class="bedge l"></span><span class="blabel">${r.layer.name}</span><span class="bedge r"></span>`;
      d.appendChild(bar);
      bar.addEventListener("mousedown", e => startBarDrag(e, r.layer, bar));
      d.addEventListener("mousedown", e => { if (!e.target.closest(".bar")) selectLayerRow(r.layer, e); });
    } else if (r.kind === "prop" || r.kind === "fxparam") {
      if (sel) d.classList.add("sel");
      renderKeyframes(d, r);
    } else if (r.kind === "fxHead") {
      d.style.background = "#262626";
    }
    box.appendChild(d);
  });
}
function renderKeyframes(track, r) {
  const kf = r.prop.kf;
  if (!kf.length) return;
  let prevX = null;
  kf.forEach((k, idx) => {
    const x = k.time * ui.pps;
    if (prevX !== null) {
      const line = document.createElement("div"); line.className = "kf-line";
      line.style.left = prevX + "px"; line.style.width = (x - prevX) + "px";
      track.appendChild(line);
    }
    const d = document.createElement("div");
    d.className = "kf" + (k.easing === "hold" ? " hold" : (k.easing === "ease" ? " ease" : ""));
    if (ui.selProp && ui.selProp.prop === r.prop && Math.abs((ui.selProp.time || -9) - k.time) < 1e-3) d.classList.add("sel");
    d.style.left = x + "px";
    d.title = `t=${k.time.toFixed(2)}s · ${k.easing}`;
    d.addEventListener("mousedown", e => { e.stopPropagation(); startKfDrag(e, r, k, idx); });
    d.addEventListener("contextmenu", e => { e.preventDefault(); e.stopPropagation(); kfContextMenu(e, r, k); });
    track.appendChild(d);
    prevX = x;
  });
}
function startKfDrag(e, r, k, idx) {
  const startX = e.clientX, t0 = k.time;
  const wasAt = Math.abs(ui.time - t0) < 0.2;
  let moved = false;
  const mv = ev => {
    const dt = (ev.clientX - startX) / ui.pps;
    k.time = clamp(t0 + dt, 0, activeComp().duration);
    if (Math.abs(ev.clientX - startX) > 2) moved = true;
    r.prop.kf.sort((a, b) => a.time - b.time);
    ui.selProp = { layerId: r.layer.id, key: r.key, prop: r.prop, time: k.time };
    markDirty(); drawViewer(); refreshTimeline();
  };
  const up = () => {
    document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up);
    if (!moved) { seek(k.time); ui.selProp = { layerId: r.layer.id, key: r.key, prop: r.prop, time: k.time }; refreshTimeline(); }
  };
  document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
}
function kfContextMenu(e, r, k) {
  showContextMenu(e.clientX, e.clientY, [
    { label: "Linear", fn: () => { k.easing = "linear"; markDirty(); refreshTimeline(); } },
    { label: "Ease In/Out", fn: () => { k.easing = "ease"; markDirty(); refreshTimeline(); } },
    { label: "Ease In", fn: () => { k.easing = "easeIn"; markDirty(); refreshTimeline(); } },
    { label: "Ease Out", fn: () => { k.easing = "easeOut"; markDirty(); refreshTimeline(); } },
    { label: "Hold", fn: () => { k.easing = "hold"; markDirty(); refreshTimeline(); } },
    "—",
    { label: "Delete Keyframe", fn: () => { r.prop.kf = r.prop.kf.filter(x => x !== k); markDirty(); refreshAll(); } },
    { label: "Go to Keyframe", fn: () => seek(k.time) }
  ]);
}
function startBarDrag(e, layer, bar) {
  e.preventDefault();
  const isLeft = e.target.classList.contains("l"), isRight = e.target.classList.contains("r");
  const startX = e.clientX, ip0 = layer.inPoint, op0 = layer.outPoint;
  let moved = false;
  const mv = ev => {
    const dt = (ev.clientX - startX) / ui.pps;
    if (Math.abs(ev.clientX - startX) > 2) moved = true;
    const dur = activeComp().duration;
    if (isLeft) layer.inPoint = clamp(ip0 + dt, 0, layer.outPoint - 0.05);
    else if (isRight) layer.outPoint = clamp(op0 + dt, layer.inPoint + 0.05, dur);
    else {
      const len = op0 - ip0;
      let ni = clamp(ip0 + dt, 0, dur - len);
      layer.inPoint = ni; layer.outPoint = ni + len;
    }
    markDirty(); refreshTimeline(); drawViewer();
  };
  const up = () => {
    document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up);
    if (!moved) selectLayerRow(layer, e);
  };
  document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
}

function renderRuler() {
  const ruler = $("#tl-ruler"); if (!ruler) return;
  const comp = activeComp();
  ruler.innerHTML = "";
  let step = 1;
  if (ui.pps < 30) step = 5; else if (ui.pps < 60) step = 2; else if (ui.pps > 200) step = 0.5;
  for (let t = 0; t <= comp.duration + 1e-6; t += step) {
    const x = t * ui.pps;
    const tick = document.createElement("div"); tick.className = "ruler-tick"; tick.style.left = x + "px";
    ruler.appendChild(tick);
    const lab = document.createElement("div"); lab.className = "ruler-label"; lab.style.left = x + "px";
    lab.textContent = (step < 1 ? t.toFixed(1) : t) + "s";
    ruler.appendChild(lab);
  }
  const wa = document.createElement("div"); wa.className = "work-area";
  wa.style.left = "0px"; wa.style.width = comp.duration * ui.pps + "px";
  wa.style.opacity = ".35"; ruler.appendChild(wa);
}
function layoutTimelineWidth() {
  const comp = activeComp();
  const w = Math.max(200, comp.duration * ui.pps);
  const inner = $("#tl-inner");
  if (inner) inner.style.width = w + "px";
  $("#tl-ruler").style.width = w + "px";
  $("#tl-tracks").style.width = w + "px";
}
function drawPlayhead() {
  const ph = $("#tl-playhead"); if (!ph) return;
  ph.style.left = ui.time * ui.pps + "px";
}
function updateTLInfo() {
  const comp = activeComp();
  const el = $("#tl-info");
  if (el) el.textContent = `${comp.name} · ${comp.layers.length} layer${comp.layers.length !== 1 ? "s" : ""} · ${comp.duration}s · ${comp.fps}fps · ${Math.round(ui.pps)}px/s`;
}

function initTimeline() {
  if (tlInited) return;
  tlInited = true;
  const right = $("#tl-right");
  const inner = document.createElement("div");
  inner.id = "tl-inner";
  inner.style.cssText = "position:relative;min-height:100%";
  const rulerEl = $("#tl-ruler"), tracksEl = $("#tl-tracks"), headEl = $("#tl-playhead");
  [rulerEl, tracksEl, headEl].forEach(el => inner.appendChild(el));
  right.appendChild(inner);
  right.style.overflow = "auto";

  const left = $("#tl-layers");
  right.addEventListener("scroll", () => { left.scrollTop = right.scrollTop; });
  left.addEventListener("wheel", e => { right.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });

  // ruler scrub
  const ruler = $("#tl-ruler");
  ruler.addEventListener("mousedown", e => {
    const r = ruler.getBoundingClientRect();
    seek(clamp((e.clientX - r.left + right.scrollLeft) / ui.pps, 0, activeComp().duration));
    const mv = ev => seek(clamp((ev.clientX - r.left + right.scrollLeft) / ui.pps, 0, activeComp().duration));
    const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
  });
  // playhead drag
  $("#tl-playhead").addEventListener("mousedown", e => {
    e.stopPropagation();
    const r = ruler.getBoundingClientRect();
    const mv = ev => seek(clamp((ev.clientX - r.left + right.scrollLeft) / ui.pps, 0, activeComp().duration));
    const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
  });
  // zoom with ctrl+wheel
  right.addEventListener("wheel", e => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); ui.pps = clamp(ui.pps * (e.deltaY < 0 ? 1.12 : 0.89), 6, 900); refreshTimeline(); }
  }, { passive: false });

  $("#layer-search").addEventListener("input", e => { ui.layerSearch = e.target.value; refreshTimeline(); });
  $("#add-layer-btn").addEventListener("click", e => { e.stopPropagation(); $("#add-layer-menu").style.display = $("#add-layer-menu").style.display === "block" ? "none" : "block"; });
  document.addEventListener("click", e => { if (!e.target.closest("#add-layer-btn")) $("#add-layer-menu").style.display = "none"; });
}
