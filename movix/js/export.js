/* ==========================================================================
   Movix — export.js : undo/redo, save/load, import, render, modals, context menu
   ========================================================================== */

/* ------------------------------------------------------------- undo/redo */
function serialize() {
  return {
    name: project.name, activeCompId: project.activeCompId,
    compositions: project.compositions,
    assets: project.assets.map(a => ({ id: a.id, name: a.name, dataUrl: a.dataUrl, width: a.width, height: a.height }))
  };
}
function pushUndo() {
  try { undoStack.push(JSON.stringify(serialize())); if (undoStack.length > 50) undoStack.shift(); redoStack = []; } catch (e) { }
}
function hydrateAssets(data) {
  project.assets = (data.assets || []).map(a => {
    const img = new Image(); img.src = a.dataUrl; const o = Object.assign({}, a); o.img = img; return o;
  });
}
function applySnapshot(json) {
  const data = JSON.parse(json);
  project.name = data.name; project.activeCompId = data.activeCompId; project.compositions = data.compositions;
  hydrateAssets(data);
  ui.activeCompId = project.activeCompId;
  ui.selLayerIds = ui.selLayerIds.filter(id => !!layerById(id));
  if (ui.time > activeComp().duration) ui.time = 0;
  cleanDirty(); refreshAll();
}
function undo() { if (!undoStack.length) { toast("Nothing to undo"); return; } redoStack.push(JSON.stringify(serialize())); applySnapshot(undoStack.pop()); }
function redo() { if (!redoStack.length) { toast("Nothing to redo"); return; } undoStack.push(JSON.stringify(serialize())); applySnapshot(redoStack.pop()); }

/* ------------------------------------------------------------ save / load */
function saveProject() {
  try { localStorage.setItem("movix.project", JSON.stringify(serialize())); cleanDirty(); toast("Project saved to browser storage"); }
  catch (e) { toast("Save failed: storage full"); }
}
function loadFromStorage() {
  const s = localStorage.getItem("movix.project"); if (!s) return false;
  try { applySnapshot(s); cleanDirty(); toast("Restored last project"); return true; } catch (e) { return false; }
}
function openProjectFile() { $("#file-open-input").click(); }
function saveProjectFile() {
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
  downloadBlob(blob, (project.name || "project") + ".movix.json");
  cleanDirty(); toast("Exported project file");
}
function downloadBlob(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------------------------------------------------------------- import */
function importFootage() { $("#file-import-input").click(); }
function readImageFile(file, asLayer) {
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      pushUndo();
      const asset = { id: uid("asset"), name: file.name.replace(/\.[^.]+$/, ""), dataUrl: fr.result, width: img.width, height: img.height, img };
      project.assets.push(asset);
      if (asLayer) addImageLayer(asset); else refreshAll();
      markDirty(); toast("Imported " + asset.name);
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function addImageLayer(asset) {
  pushUndo();
  const l = makeLayer("image", asset.name, activeComp());
  l.assetId = asset.id; l.imageW = asset.width; l.imageH = asset.height;
  const comp = activeComp();
  const k = Math.min(comp.width / asset.width, comp.height / asset.height, 1);
  l.imageW = asset.width * k; l.imageH = asset.height * k;
  l.transform.anchor.value = [l.imageW / 2, l.imageH / 2];
  l.transform.position.value = [comp.width / 2, comp.height / 2];
  comp.layers.unshift(l); selectOnly(l);
}

/* ---------------------------------------------------------------- render */
function exportFrame() {
  const comp = activeComp();
  const c = document.createElement("canvas");
  renderFrame(c, ui.time, true);
  c.toBlob(blob => { downloadBlob(blob, `${comp.name}_${fmtTime(ui.time, comp.fps).replace(/[:]/g, "-")}.png`); toast("Frame exported"); }, "image/png");
}
function pickVideoMime(format) {
  const supports = m => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m);
  if (format === "mp4") {
    const mp4 = ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"].find(supports);
    if (mp4) return { mime: mp4, ext: "mp4", container: "video/mp4" };
  }
  const webm = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(supports);
  return webm ? { mime: webm, ext: "webm", container: "video/webm" } : null;
}
function exportVideo(format) {
  const comp = activeComp();
  const canvas = $("#comp-canvas");
  if (!canvas.captureStream || typeof MediaRecorder === "undefined") { toast("Video capture not supported in this browser"); return; }
  const enc = pickVideoMime(format || "webm");
  if (!enc) { toast("No supported video codec found"); return; }
  if (format === "mp4" && enc.ext !== "mp4") toast("MP4 unsupported here — exporting WebM instead");

  const prevRes = ui.resolution, prevLoop = ui.loop, prevTime = ui.time;
  ui.resolution = "full"; ui.loop = false;
  applyZoom();
  const fps = comp.fps;
  const stream = canvas.captureStream(fps);
  const bps = Math.max(4000000, Math.round(comp.width * comp.height * fps * 0.12));
  const rec = new MediaRecorder(stream, { mimeType: enc.mime, videoBitsPerSecond: bps });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    downloadBlob(new Blob(chunks, { type: enc.container }), `${comp.name}.${enc.ext}`);
    ui.resolution = prevRes; ui.loop = prevLoop; applyZoom();
    $("#render-progress").value = 0;
    toast(`Video exported (${enc.ext.toUpperCase()})`);
    refreshAll();
  };
  seek(0); ui.resolution = "full"; drawViewer();
  rec.start();
  const bar = $("#render-progress");
  const total = comp.duration;
  const t0 = performance.now();
  toast(`Rendering ${enc.ext.toUpperCase()}…`);
  (function tickRec() {
    const el = (performance.now() - t0) / 1000;
    ui.time = Math.min(el, comp.duration);
    renderFrame(canvas, ui.time, true);
    drawPlayhead(); updateTimeUI();
    bar.value = (ui.time / total) * 100;
    if (ui.time < total) requestAnimationFrame(tickRec);
    else { setTimeout(() => { rec.stop(); seek(prevTime); }, 300); }
  })();
}
function toggleRender() {
  const fmt = $("#render-format").value;
  if (fmt === "png") exportFrame(); else exportVideo(fmt);
}

/* ---------------------------------------------------------------- modals */
function openModal(title, bodyHTML, actions) {
  const m = $("#modal"), box = $("#modal-box");
  box.innerHTML = `<h2>${title}</h2><div class="modal-body">${bodyHTML}</div>`;
  const foot = document.createElement("div"); foot.className = "actions";
  (actions || [{ label: "Close" }]).forEach(a => {
    const b = document.createElement("button"); b.className = "btn" + (a.primary ? " primary" : ""); b.textContent = a.label;
    b.addEventListener("click", () => { if (a.fn) a.fn(box); if (a.keepOpen !== true) closeModal(); });
    foot.appendChild(b);
  });
  box.appendChild(foot);
  m.hidden = false;
  return box;
}
function closeModal() { $("#modal").hidden = true; }
function openCompSettings(comp) {
  comp = comp || activeComp();
  const body = `
    <div class="field"><label>Name</label><input id="cs-name" value="${comp.name}"/></div>
    <div class="row2">
      <div class="field"><label>Width</label><input id="cs-w" type="number" value="${comp.width}"/></div>
      <div class="field"><label>Height</label><input id="cs-h" type="number" value="${comp.height}"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Frame Rate</label><input id="cs-fps" type="number" step="1" value="${comp.fps}"/></div>
      <div class="field"><label>Duration (s)</label><input id="cs-dur" type="number" step="0.5" value="${comp.duration}"/></div>
    </div>
    <div class="field"><label>Background</label><input id="cs-bg" type="color" value="${comp.bg}"/></div>`;
  openModal("Composition Settings", body, [
    { label: "Cancel" },
    {
      label: "OK", primary: true, fn: box => {
        pushUndo();
        comp.name = box.querySelector("#cs-name").value || comp.name;
        comp.width = Math.max(1, +box.querySelector("#cs-w").value || comp.width);
        comp.height = Math.max(1, +box.querySelector("#cs-h").value || comp.height);
        comp.fps = Math.max(1, +box.querySelector("#cs-fps").value || comp.fps);
        comp.duration = Math.max(0.1, +box.querySelector("#cs-dur").value || comp.duration);
        comp.bg = box.querySelector("#cs-bg").value;
        markDirty(); fitZoom(); refreshAll();
      }
    }
  ]);
}
function newCompDialog() {
  const body = `
    <div class="field"><label>Name</label><input id="nc-name" value="Comp ${project.compositions.length + 1}"/></div>
    <div class="row2">
      <div class="field"><label>Width</label><input id="nc-w" type="number" value="1280"/></div>
      <div class="field"><label>Height</label><input id="nc-h" type="number" value="720"/></div>
    </div>
    <div class="row2">
      <div class="field"><label>Frame Rate</label><input id="nc-fps" type="number" value="30"/></div>
      <div class="field"><label>Duration (s)</label><input id="nc-dur" type="number" step="0.5" value="10"/></div>
    </div>
    <div class="field"><label>Background</label><input id="nc-bg" type="color" value="#000000"/></div>`;
  openModal("New Composition", body, [
    { label: "Cancel" },
    {
      label: "Create", primary: true, fn: box => {
        pushUndo();
        const c = newComposition(box.querySelector("#nc-name").value,
          +box.querySelector("#nc-w").value, +box.querySelector("#nc-h").value,
          +box.querySelector("#nc-fps").value, +box.querySelector("#nc-dur").value, box.querySelector("#nc-bg").value);
        project.compositions.push(c); project.activeCompId = c.id; ui.activeCompId = c.id; ui.time = 0; ui.selLayerIds = [];
        markDirty(); fitZoom(); refreshAll();
      }
    }
  ]);
}
function bgColorDialog() {
  const comp = activeComp();
  const body = `<div class="field"><label>Background Color</label><input id="bg-c" type="color" value="${comp.bg}"/></div>`;
  openModal("Composition Background", body, [{ label: "Cancel" }, { label: "OK", primary: true, fn: box => { pushUndo(); comp.bg = box.querySelector("#bg-c").value; markDirty(); drawViewer(); } }]);
}
function solidDialog() {
  const body = `<div class="field"><label>Name</label><input id="sl-name" value="Solid ${activeComp().layers.length + 1}"/></div>
    <div class="row2"><div class="field"><label>Width</label><input id="sl-w" type="number" value="${activeComp().width}"/></div>
    <div class="field"><label>Height</label><input id="sl-h" type="number" value="${activeComp().height}"/></div></div>
    <div class="field"><label>Color</label><input id="sl-c" type="color" value="${ui.fill}"/></div>`;
  openModal("Solid Settings", body, [{ label: "Cancel" }, {
    label: "OK", primary: true, fn: box => {
      pushUndo();
      const l = makeLayer("solid", box.querySelector("#sl-name").value, activeComp());
      l.color = box.querySelector("#sl-c").value;
      activeComp().layers.unshift(l); selectOnly(l);
    }
  }]);
}
function aboutDialog() {
  openModal("About Movix", `<p>Movix is a browser motion-graphics &amp; compositing studio modelled on the layout, tools and effects of professional node-free compositors.</p>
    <p class="hint">Rendering engine: HTML5 Canvas 2D · ${Object.keys(EFFECTS).length} built-in effects · keyframe animation · PNG &amp; WebM export.</p>`);
}
function shortcutsDialog() {
  openModal("Keyboard Shortcuts", `<table>
    <tr><td>V / H / Z</td><td>Selection · Hand · Zoom</td></tr>
    <tr><td>Q</td><td>Cycle shape tools</td></tr>
    <tr><td>T</td><td>Type tool</td></tr>
    <tr><td>Space</td><td>Play / Pause</td></tr>
    <tr><td>Home / End</td><td>Go to start / end</td></tr>
    <tr><td>← / →</td><td>Step one frame</td></tr>
    <tr><td>Ctrl+Z / Ctrl+Shift+Z</td><td>Undo / Redo</td></tr>
    <tr><td>Ctrl+D</td><td>Duplicate layer</td></tr>
    <tr><td>Ctrl+Shift+D</td><td>Split layer at playhead</td></tr>
    <tr><td>Del</td><td>Delete selected</td></tr>
    <tr><td>Ctrl+A</td><td>Select all layers</td></tr>
    <tr><td>Ctrl+Y</td><td>New solid</td></tr>
    <tr><td>Ctrl+S</td><td>Save project</td></tr>
    <tr><td>.</td><td>Zoom in viewer</td></tr>
    <tr><td>,</td><td>Zoom out viewer</td></tr>
    <tr><td>Ctrl+wheel</td><td>Zoom timeline</td></tr></table>`);
}

/* --------------------------------------------------------- context menu */
function showContextMenu(x, y, items) {
  const m = $("#context-menu"); m.innerHTML = ""; m.hidden = false;
  items.forEach(it => {
    if (it === "—") { m.appendChild(document.createElement("hr")); return; }
    const a = document.createElement("a"); a.textContent = it.label;
    a.addEventListener("click", () => { it.fn(); hideContextMenu(); });
    m.appendChild(a);
  });
  m.style.left = Math.min(x, innerWidth - 200) + "px"; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 10) + "px";
}
function hideContextMenu() { $("#context-menu").hidden = true; }

/* -------------------------------------------------------- render queue UI */
function initRenderPanel() {
  // Render button uses the global [data-cmd="export"] dispatcher.
}
