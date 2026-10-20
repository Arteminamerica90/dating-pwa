/* ==========================================================================
   Movix — interactions.js : commands, layer creation, keyboard, bootstrap
   ========================================================================== */

/* ---------------------------------------------------- layer creation */
function addSolidLayer() { solidDialog(); }
function addTextLayer() {
  pushUndo();
  const l = makeLayer("text", "Text", activeComp());
  l.text = "Text"; l.fontSize = 96; l.color = ui.fill; l.align = "center"; recenterAnchor(l);
  l.transform.position.value = [activeComp().width / 2, activeComp().height / 2];
  activeComp().layers.unshift(l); selectOnly(l); editTextLayer(l);
}
function addShapeLayer(type) {
  pushUndo();
  type = type || "rect";
  const names = { rect: "Rectangle", ellipse: "Ellipse", polygon: "Polygon", star: "Star", line: "Line" };
  const l = makeLayer("shape", names[type] || "Shape", activeComp(), { shapeType: type });
  l.color = ui.fill; l.fillOn = true; l.strokeOn = false;
  l.strokeColor = ui.stroke;
  if (type === "star") { l.points = 5; l.inner = 45; }
  if (type === "polygon") l.points = 6;
  activeComp().layers.unshift(l); selectOnly(l);
}
function addNullLayer() {
  pushUndo();
  const l = makeLayer("null", "Null " + (activeComp().layers.length + 1), activeComp());
  activeComp().layers.unshift(l); selectOnly(l);
}
function addAdjustmentLayer() {
  pushUndo();
  const l = makeLayer("adjustment", "Adjustment", activeComp());
  l.effects.push(makeEffect("Hue/Saturation"));
  activeComp().layers.unshift(l); selectOnly(l);
}
function addCameraLayer() {
  pushUndo();
  const comp = activeComp();
  const l = makeLayer("camera", "Camera " + (comp.layers.length + 1), comp);
  l.transform.position.value = [comp.width / 2, comp.height / 2, 0];
  l.camera = { zoom: 1000, focusZ: 0, dof: false, aperture: 16 };
  comp.layers.unshift(l); selectOnly(l); toast("Camera added");
}
function addLightLayer() {
  pushUndo();
  const l = makeLayer("light", "Light " + (activeComp().layers.length + 1), activeComp());
  activeComp().layers.unshift(l); selectOnly(l); toast("Light added");
}
function addImageLayerPrompt() {
  if (!project.assets.length) { toast("Import footage first (File ▸ Import)"); importFootage(); return; }
  const items = project.assets.map(a => ({ label: a.name, fn: () => addImageLayer(a) }));
  showContextMenu(innerWidth / 2, 200, items);
}

/* ------------------------------------------- parenting / 3D / masks / precomp */
function isDescendant(id, ancestorId) {
  let l = layerById(id), guard = 0;
  while (l && l.parentId && guard++ < 64) { if (l.parentId === ancestorId) return true; l = layerById(l.parentId); }
  return false;
}
function matrixToTransform(m, anchor) {
  const scaleX = Math.hypot(m.a, m.b) || 1;
  const rot = Math.atan2(m.b, m.a);
  const det = m.a * m.d - m.b * m.c;
  const scaleY = det / scaleX;
  const pos = [m.e + (m.a * anchor[0] + m.c * anchor[1]), m.f + (m.b * anchor[0] + m.d * anchor[1])];
  return { position: pos, rotation: deg(rot), scale: [scaleX * 100, scaleY * 100] };
}
function applyTransformAt(layer, t) {
  const tr = layer.transform;
  const set = (prop, val) => { if (propIsAnimated(prop)) setKf(prop, ui.time, val); else prop.value = val; };
  let pos = t.position;
  if (layer.threeD) { const cur = getVal(tr.position, ui.time, layer); pos = [pos[0], pos[1], (cur && cur[2]) || 0]; }
  set(tr.position, pos); set(tr.rotation, t.rotation); set(tr.scale, t.scale);
}
function setParent(layer, parentId) {
  if (parentId === layer.id) return;
  if (parentId && isDescendant(parentId, layer.id)) { toast("Can't parent to a descendant"); return; }
  pushUndo();
  const comp = activeComp();
  const oldWorld = layerMatrix(layer, ui.time, comp);
  layer.parentId = parentId || null;
  if (parentId) {
    const p = layerById(parentId);
    const pw = layerMatrix(p, ui.time, comp);
    const newWorld = pw.inverse().multiply(oldWorld);
    const anc = getVal(layer.transform.anchor, ui.time, layer);
    applyTransformAt(layer, matrixToTransform(newWorld, anc));
  }
  markDirty(); refreshAll();
}
function toggle3D(layer, on) {
  pushUndo();
  layer.threeD = !!on;
  if (on) {
    const p = getVal(layer.transform.position, ui.time, layer).slice();
    while (p.length < 3) p.push(0);
    if (propIsAnimated(layer.transform.position)) setKf(layer.transform.position, ui.time, p); else layer.transform.position.value = p;
  }
  markDirty(); refreshAll();
}
function addMask(layer, type) {
  pushUndo();
  const cs = contentSize(layer);
  layer.masks.push({ id: uid("mask"), type, mode: "add", x: cs.w / 2, y: cs.h / 2, w: cs.w, h: cs.h, feather: 0, roundness: 0 });
  markDirty(); refreshAll();
}
function precompose() {
  const comp = activeComp(), sel = selectedLayers();
  if (!sel.length) { toast("Select layers to pre-compose"); return; }
  pushUndo();
  const sub = newComposition("Precomp " + project.compositions.length, comp.width, comp.height, comp.fps, comp.duration, comp.bg);
  project.compositions.push(sub);
  const moved = comp.layers.filter(l => ui.selLayerIds.includes(l.id));
  comp.layers = comp.layers.filter(l => !ui.selLayerIds.includes(l.id));
  moved.forEach(l => { l.parentId = null; sub.layers.push(l); });
  const pl = makeLayer("comp", "Precomp " + (project.compositions.length - 1), comp);
  pl.compId = sub.id; pl.outPoint = comp.duration;
  recenterAnchor(pl);
  pl.transform.position.value = [comp.width / 2, comp.height / 2];
  comp.layers.push(pl);
  ui.selLayerIds = [pl.id];
  markDirty(); refreshAll(); toast("Pre-composed " + moved.length + " layer(s)");
}

/* --------------------------------------------------- layer editing cmds */
function duplicateSelected() {
  const comp = activeComp();
  const sel = selectedLayers(); if (!sel.length) return;
  pushUndo();
  const clones = sel.map(l => {
    const c = JSON.parse(JSON.stringify(l));
    reidLayer(c);
    c.name = l.name + " 2"; c._num = ++ui._lastLayerNum;
    return c;
  });
  clones.forEach(c => comp.layers.unshift(c));
  ui.selLayerIds = clones.map(c => c.id);
  markDirty(); refreshAll();
}
function reidLayer(l) {
  l.id = uid("L"); l.effects.forEach(f => { f.id = uid("fx"); if (f.paramKf) { } });
}
function deleteSelected() {
  const comp = activeComp(); if (!ui.selLayerIds.length) return;
  pushUndo();
  comp.layers = comp.layers.filter(l => !ui.selLayerIds.includes(l.id));
  ui.selLayerIds = []; markDirty(); refreshAll();
}
function selectAllLayers() { ui.selLayerIds = activeComp().layers.map(l => l.id); refreshAll(); }
function splitSelected() {
  const comp = activeComp(), sel = selectedLayers(); if (!sel.length) return;
  pushUndo();
  sel.forEach(l => {
    if (ui.time <= l.inPoint || ui.time >= l.outPoint) return;
    const right = JSON.parse(JSON.stringify(l)); reidLayer(right);
    right.inPoint = ui.time; right.name = l.name;
    l.outPoint = ui.time;
    right.transform.position.value = getValValueAt(l.transform.position, ui.time);
    right.transform.scale.value = getValValueAt(l.transform.scale, ui.time);
    right.transform.rotation.value = getValValueAt(l.transform.rotation, ui.time);
    right.transform.opacity.value = getValValueAt(l.transform.opacity, ui.time);
    // strip keyframes outside
    ["position", "scale", "rotation", "opacity", "anchor"].forEach(k => { right.transform[k].kf = []; });
    comp.layers.splice(comp.layers.indexOf(l), 0, right);
  });
  markDirty(); refreshAll(); toast("Layer split");
}
function getValValueAt(prop, t) { const v = getVal(prop, t); return Array.isArray(v) ? v.slice() : v; }
function reorder(dir) {
  const comp = activeComp(), sel = selectedLayers(); if (!sel.length) return;
  pushUndo();
  sel.forEach(l => {
    const i = comp.layers.indexOf(l);
    let j = i;
    if (dir === "up") j = Math.max(0, i - 1);
    else if (dir === "down") j = Math.min(comp.layers.length - 1, i + 1);
    else if (dir === "front") j = 0;
    else if (dir === "back") j = comp.layers.length - 1;
    comp.layers.splice(i, 1); comp.layers.splice(j, 0, l);
  });
  markDirty(); refreshAll();
}
function fitToComp() {
  const comp = activeComp(), sel = selectedLayers(); if (!sel.length) return;
  pushUndo();
  sel.forEach(l => {
    const size = contentSize(l);
    const sc = Math.min(comp.width / size.w, comp.height / size.h) * 100;
    l.transform.position.value = [comp.width / 2, comp.height / 2];
    if (propIsAnimated(l.transform.scale)) setKf(l.transform.scale, ui.time, [sc, sc]); else l.transform.scale.value = [sc, sc];
    const cs = contentSize(l);
    l.transform.anchor.value = [cs.w / 2, cs.h / 2];
  });
  markDirty(); refreshAll();
}
function addKeyframeSelected() {
  const l = primaryLayer(); if (!l) return;
  pushUndo();
  ["anchor", "position", "scale", "rotation", "opacity"].forEach(k => {
    const pr = l.transform[k];
    if (propIsAnimated(pr)) setKf(pr, ui.time, getVal(pr, ui.time));
  });
  l.effects.forEach(fx => { if (fx.paramKf) for (const k in fx.paramKf) setKf(fx.paramKf[k], ui.time, fx.params[k]); });
  refreshAll();
}
function clearKeyframesSelected() {
  const l = primaryLayer(); if (!l) return;
  pushUndo();
  ["anchor", "position", "scale", "rotation", "opacity"].forEach(k => { l.transform[k].kf = []; });
  l.effects.forEach(fx => { fx.paramKf = {}; });
  refreshAll();
}
function setEasingAll(easing) {
  const l = primaryLayer(); if (!l) return;
  pushUndo();
  const props = ["anchor", "position", "scale", "rotation", "opacity"].map(k => l.transform[k]);
  l.effects.forEach(fx => { if (fx.paramKf) for (const k in fx.paramKf) props.push(fx.paramKf[k]); });
  props.forEach(pr => pr.kf.forEach(k => k.easing = easing));
  refreshAll(); toast("Interpolation: " + easing);
}
function toggleAllProps() {
  const l = primaryLayer(); if (!l) return;
  ui.expanded[l.id] = !ui.expanded[l.id]; refreshTimeline();
}

/* ------------------------------------------------------- graph editor */
function openGraphEditor(propArg) {
  const l = primaryLayer();
  if (!l) { toast("Select a layer"); return; }
  const props = [];
  [["Position", l.transform.position], ["Scale", l.transform.scale], ["Rotation", l.transform.rotation], ["Opacity", l.transform.opacity], ["Anchor Point", l.transform.anchor]]
    .forEach(p => { if (propIsAnimated(p[1])) props.push(p); });
  l.effects.forEach(fx => { if (fx.paramKf) for (const k in fx.paramKf) if (propIsAnimated(fx.paramKf[k])) props.push([fx.name + " · " + k, fx.paramKf[k]]); });
  if (propArg) props.unshift(["Property", propArg]);
  if (!props.length) { toast("No animated properties on this layer"); return; }

  const box = openModal("Graph Editor — " + l.name, `
    <div class="graph-body">
      <div class="graph-toolbar">
        <select id="graph-prop"></select>
        <button class="btn" data-preset="linear">Linear</button>
        <button class="btn" data-preset="ease">Easy Ease</button>
        <button class="btn" data-preset="easeIn">Ease In</button>
        <button class="btn" data-preset="easeOut">Ease Out</button>
        <button class="btn" data-preset="hold">Hold</button>
      </div>
      <canvas id="graph-canvas"></canvas>
      <div class="graph-hint">Drag the two round handles to shape the ease of the segment around the playhead.</div>
    </div>`, [{ label: "Done", primary: true }]);

  const sel = box.querySelector("#graph-prop");
  props.forEach((p, i) => { const o = document.createElement("option"); o.value = i; o.textContent = p[0]; sel.appendChild(o); });
  let cur = props[0][1];

  const cv = box.querySelector("#graph-canvas");
  const ctx = cv.getContext("2d");
  const CW = 460, CH = 300, PAD = 44, W = CW - PAD * 2, H = CH - PAD * 2, DPR = 2;
  cv.width = CW * DPR; cv.height = CH * DPR; cv.style.width = CW + "px"; cv.style.height = CH + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const tp = (x, y) => [PAD + x * W, PAD + (1 - y) * H];
  const inv = (px, py) => [(px - PAD) / W, 1 - (py - PAD) / H];

  function segment() {
    const kfs = cur.kf;
    if (kfs.length < 2) return null;
    let i = 0;
    for (let j = 0; j < kfs.length - 1; j++) { if (ui.time >= kfs[j].time && ui.time <= kfs[j + 1].time) { i = j; break; } if (ui.time > kfs[j + 1].time) i = j; }
    const a = kfs[i], b = kfs[i + 1];
    if (!a.bezOut) a.bezOut = { x: 0.33, y: 0.33 };
    if (!b.bezIn) b.bezIn = { x: 0.66, y: 0.66 };
    return { a, b };
  }
  let seg = segment();

  function dot(p, c, r) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p[0], p[1], r || 5, 0, Math.PI * 2); ctx.fill(); }
  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = "#1b1b1e"; ctx.fillRect(0, 0, CW, CH);
    ctx.strokeStyle = "#2c2c31"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const gx = PAD + i * W / 4, gy = PAD + i * H / 4; ctx.beginPath(); ctx.moveTo(gx, PAD); ctx.lineTo(gx, PAD + H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(PAD + W, gy); ctx.stroke(); }
    ctx.strokeStyle = "#555"; ctx.setLineDash([4, 4]);
    const p0 = tp(0, 0), p3 = tp(1, 1);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p3[0], p3[1]); ctx.stroke(); ctx.setLineDash([]);
    if (!seg) { ctx.fillStyle = "#aaa"; ctx.font = "13px sans-serif"; ctx.fillText("Need 2+ keyframes on this property", PAD, PAD + H / 2); return; }
    const c1 = tp(seg.a.bezOut.x, seg.a.bezOut.y), c2 = tp(seg.b.bezIn.x, seg.b.bezIn.y);
    ctx.strokeStyle = "#4aa3ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p3[0], p3[1]); ctx.stroke();
    ctx.strokeStyle = "#7fd0ff"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(c1[0], c1[1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p3[0], p3[1]); ctx.lineTo(c2[0], c2[1]); ctx.stroke();
    dot(p0, "#ccc", 4); dot(p3, "#ccc", 4); dot(c1, "#4aff9a"); dot(c2, "#ff9a4a");
  }

  let drag = null;
  cv.addEventListener("mousedown", e => {
    if (!seg) return;
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const c1 = tp(seg.a.bezOut.x, seg.a.bezOut.y), c2 = tp(seg.b.bezIn.x, seg.b.bezIn.y);
    if (Math.hypot(mx - c1[0], my - c1[1]) < 14) { drag = "out"; pushUndo(); }
    else if (Math.hypot(mx - c2[0], my - c2[1]) < 14) { drag = "in"; pushUndo(); }
  });
  function onMove(e) {
    if (!drag || !seg) return;
    const r = cv.getBoundingClientRect();
    let [x, y] = inv(e.clientX - r.left, e.clientY - r.top);
    x = Math.max(0, Math.min(1, x)); y = Math.max(-0.5, Math.min(1.5, y));
    if (drag === "out") seg.a.bezOut = { x, y }; else seg.b.bezIn = { x, y };
    draw(); markDirty(); drawViewer();
  }
  function onUp() { drag = null; }
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  const obs = new MutationObserver(() => { if ($("#modal").hidden) { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); obs.disconnect(); } });
  obs.observe($("#modal"), { attributes: true, attributeFilter: ["hidden"] });

  sel.addEventListener("change", () => { cur = props[+sel.value][1]; seg = segment(); draw(); });
  box.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
    pushUndo();
    cur.kf.forEach(k => { k.easing = b.dataset.preset; delete k.bezOut; delete k.bezIn; });
    seg = segment(); draw(); markDirty(); drawViewer(); refreshTimeline();
  }));
  draw();
}

/* ------------------------------------------------------- commands map */
function runCommand(cmd) {
  if (cmd.startsWith("apply-fx:")) { applyEffectToSelected(cmd.slice(9)); return; }
  const map = {
    "new-comp": newCompDialog,
    "comp-settings": () => openCompSettings(activeComp()),
    "bg-color": bgColorDialog,
    "import": importFootage,
    "open": openProjectFile,
    "save": saveProject,
    "save-file": saveProjectFile,
    "export-frame": exportFrame,
    "export-video": () => exportVideo("mp4"),
    "export": toggleRender,
    "reset": () => { if (confirm("Start a new project? Unsaved changes will be lost.")) { resetProject(false); fitZoom(); refreshAll(); } },
    "undo": undo,
    "redo": redo,
    "duplicate": duplicateSelected,
    "delete": deleteSelected,
    "selectall": selectAllLayers,
    "split": splitSelected,
    "add-solid": addSolidLayer,
    "add-text": addTextLayer,
    "add-shape": () => addShapeLayer("rect"),
    "add-shape-rect": () => addShapeLayer("rect"),
    "add-shape-ellipse": () => addShapeLayer("ellipse"),
    "add-shape-polygon": () => addShapeLayer("polygon"),
    "add-shape-star": () => addShapeLayer("star"),
    "add-null": addNullLayer,
    "add-adjustment": addAdjustmentLayer,
    "add-camera": addCameraLayer,
    "add-light": addLightLayer,
    "add-image": addImageLayerPrompt,
    "bring-forward": () => reorder("up"),
    "send-backward": () => reorder("down"),
    "bring-front": () => reorder("front"),
    "send-back": () => reorder("back"),
    "fit-comp": fitToComp,
    "play": togglePlay,
    "to-start": () => seek(0),
    "to-end": () => seek(activeComp().duration),
    "prev-frame": () => stepFrame(-1),
    "next-frame": () => stepFrame(1),
    "prev-kf": () => nearestKfTime(-1),
    "next-kf": () => nearestKfTime(1),
    "loop": () => { ui.loop = !ui.loop; $("#loop-btn").classList.toggle("active", ui.loop); },
    "zoom-in": () => setZoom(ui.zoom * 1.25),
    "zoom-out": () => setZoom(ui.zoom / 1.25),
    "zoom-fit": fitZoom,
    "zoom-100": () => setZoom(1),
    "toggle-checker": () => { ui.checker = !ui.checker; $("#comp-frame").classList.toggle("checker-off", !ui.checker); },
    "toggle-all-props": toggleAllProps,
    "add-kf": addKeyframeSelected,
    "toggle-stopwatch": toggleAllProps,
    "ease-linear": () => setEasingAll("linear"),
    "ease-ease": () => setEasingAll("ease"),
    "ease-hold": () => setEasingAll("hold"),
    "clear-kf": clearKeyframesSelected,
    "precompose": precompose,
    "toggle-3d": () => { const l = primaryLayer(); if (l) toggle3D(l, !l.threeD); },
    "add-mask-rect": () => { const l = primaryLayer(); if (l) addMask(l, "rect"); },
    "add-mask-ellipse": () => { const l = primaryLayer(); if (l) addMask(l, "ellipse"); },
    "graph-editor": openGraphEditor,
    "set-parent-none": () => { const l = primaryLayer(); if (l) setParent(l, null); },
    "tl-zoom-in": () => { ui.pps = clamp(ui.pps * 1.25, 6, 900); refreshTimeline(); },
    "tl-zoom-out": () => { ui.pps = clamp(ui.pps / 1.25, 6, 900); refreshTimeline(); },
    "help-shortcuts": shortcutsDialog,
    "help-about": aboutDialog
  };
  const fn = map[cmd];
  if (fn) fn();
}

/* -------------------------------------------------------------- keyboard */
function onKeyDown(e) {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); e.shiftKey ? saveProjectFile() : saveProject(); return; }
  if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); e.shiftKey ? splitSelected() : duplicateSelected(); return; }
  if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); newCompDialog(); return; }
  if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); importFootage(); return; }
  if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); addSolidLayer(); return; }
  if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); selectAllLayers(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === "c") { e.preventDefault(); precompose(); return; }
  if (mod) return;
  switch (e.key) {
    case " ": e.preventDefault(); togglePlay(); break;
    case "ArrowLeft": e.preventDefault(); stepFrame(-1); break;
    case "ArrowRight": e.preventDefault(); stepFrame(1); break;
    case "Home": e.preventDefault(); seek(0); break;
    case "End": e.preventDefault(); seek(activeComp().duration); break;
    case "Delete": case "Backspace": deleteSelected(); break;
    case ".": setZoom(ui.zoom * 1.25); break;
    case ",": setZoom(ui.zoom / 1.25); break;
    case "v": case "V": selectTool("selection"); break;
    case "h": case "H": selectTool("hand"); break;
    case "z": case "Z": selectTool("zoom"); break;
    case "t": case "T": selectTool("text"); break;
    case "q": case "Q": cycleShapeTool(); break;
    case "y": case "Y": selectTool("anchor"); break;
    case "w": case "W": selectTool("rotation"); break;
  }
}
function cycleShapeTool() {
  const seq = ["rect", "ellipse", "polygon", "star"];
  const i = seq.indexOf(ui.tool);
  selectTool(seq[(i + 1) % seq.length]);
}

/* ----------------------------------------------------------------- boot */
function bootstrap() {
  initTimeline();
  buildToolbar();
  buildMenus();
  buildFxPanel();
  initRenderPanel();
  initViewerInteraction();

  // hidden file inputs
  const fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*"; fi.multiple = true; fi.id = "file-import-input"; fi.style.display = "none";
  fi.addEventListener("change", () => { Array.from(fi.files).forEach(f => readImageFile(f, true)); fi.value = ""; });
  document.body.appendChild(fi);
  const fo = document.createElement("input"); fo.type = "file"; fo.accept = ".json,.movix"; fo.id = "file-open-input"; fo.style.display = "none";
  fo.addEventListener("change", () => {
    const f = fo.files[0]; if (!f) return; const fr = new FileReader();
    fr.onload = () => { try { applySnapshot(fr.result); toast("Project opened"); } catch (e) { toast("Could not open project"); } };
    fo.value = "";
    fr.readAsText(f);
  });
  document.body.appendChild(fo);

  // global click dispatch for [data-cmd]
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-cmd]");
    if (el) { e.preventDefault(); runCommand(el.dataset.cmd); $$(".menubar .menu").forEach(x => x.classList.remove("open")); }
    if (!e.target.closest("#context-menu")) hideContextMenu();
  });
  document.addEventListener("contextmenu", e => {
    // allow native menu in inputs
    if (e.target.closest("input,textarea")) return;
    e.preventDefault();
  });

  // viewer playback controls already data-cmd; wire remaining selects
  $("#comp-select").addEventListener("change", e => {
    project.activeCompId = e.target.value; ui.activeCompId = e.target.value; ui.time = 0; ui.selLayerIds = []; refreshAll(); fitZoom();
  });
  $("#resolution").addEventListener("change", e => { ui.resolution = e.target.value; drawViewer(); applyZoom(); });
  $$(".viewer-tabs .tab").forEach(t => t.addEventListener("click", () => {
    $$(".viewer-tabs .tab").forEach(x => x.classList.remove("active")); t.classList.add("active");
    ui.viewMode = t.dataset.view; drawViewer();
  }));

  // drag & drop effects onto the viewer
  const stage = $("#viewer-stage");
  stage.addEventListener("dragover", e => { e.preventDefault(); });
  stage.addEventListener("drop", e => {
    const name = e.dataTransfer.getData("text/fx"); if (!name) return;
    const rect = $("#comp-frame").getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (inside) { applyEffectToSelected(name); }
  });

  document.addEventListener("keydown", onKeyDown);
  $("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal") closeModal(); });

  // loop button initial
  $("#loop-btn").classList.add("active");

  window.addEventListener("resize", () => { drawOverlay(); });

  // restore last session, otherwise start with a small demo scene
  if (!loadFromStorage()) resetProject(true);
  fitZoom();
  refreshAll();
  drawViewer();
  updateTimeUI();
}

window.addEventListener("DOMContentLoaded", bootstrap);
