/* ==========================================================================
   Movix — panels.js : toolbar, menus, effects list, project & properties panels
   ========================================================================== */

/* --------------------------------------------------------------- toolbar */
function buildToolbar() {
  const tools = [
    ["selection", "➤", "Selection Tool (V)"], ["hand", "✋", "Hand Tool (H)"],
    ["zoom", "🔍", "Zoom Tool (Z)"], ["rotation", "⟳", "Rotation Tool (W)"],
    ["anchor", "✛", "Pan Behind Anchor (Y)"],
    ["rect", "▭", "Rectangle Tool (Q)"], ["ellipse", "◯", "Ellipse Tool (Q)"],
    ["polygon", "⬠", "Polygon Tool (Q)"], ["star", "★", "Star Tool (Q)"],
    ["pen", "✎", "Pen Tool (G)"], ["text", "T", "Type Tool (Ctrl+T)"],
    ["brush", "🖌", "Brush Tool (Ctrl+B)"], ["eraser", "◻", "Eraser (Ctrl+B)"],
    ["clone", "⧉", "Clone Stamp (Ctrl+B)"], ["puppet", "⚓", "Puppet Tool (Ctrl+P)"],
    ["camera", "🎥", "Camera Tool (C)"], ["light", "💡", "Light Tool (C)"]
  ];
  const tb = $("#toolbar"), frag = document.createDocumentFragment();
  tools.forEach(([id, ico, title]) => {
    const b = document.createElement("button");
    b.className = "tool-btn" + (id === "selection" ? " active" : "");
    b.dataset.tool = id; b.title = title; b.textContent = ico;
    b.addEventListener("click", () => selectTool(id));
    frag.appendChild(b);
  });
  tb.insertBefore(frag, tb.firstChild);
  [["checker", "▦", "Transparency Grid"], ["safe", "▣", "Title/Action Safe"]].forEach(([id, ico, t]) => {
    const b = document.createElement("button"); b.className = "tool-btn"; b.dataset.vm = id; b.title = t; b.textContent = ico;
    b.addEventListener("click", () => toggleViewMode(id, b)); $("#view-modes").appendChild(b);
  });
  const fill = $("#fill-swatch"), stroke = $("#stroke-swatch");
  fill.style.background = ui.fill; stroke.style.background = ui.stroke;
  fill.addEventListener("click", () => pickColor(ui.fill, v => { ui.fill = v; fill.style.background = v; }));
  stroke.addEventListener("click", () => pickColor(ui.stroke, v => { ui.stroke = v; stroke.style.background = v; }));
  $("#swap-colors").addEventListener("click", () => { const t = ui.fill; ui.fill = ui.stroke; ui.stroke = t; fill.style.background = ui.fill; stroke.style.background = ui.stroke; });
}
function selectTool(id) {
  ui.tool = id;
  $$(".tool-btn[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === id));
  const cv = $("#comp-canvas");
  cv.style.cursor = id === "hand" ? "grab" : id === "zoom" ? "zoom-in" : id === "text" ? "text" : "default";
}
function pickColor(current, cb) {
  const inp = document.createElement("input"); inp.type = "color"; inp.value = current || "#000000";
  inp.style.cssText = "position:fixed;left:-120px;top:-120px"; document.body.appendChild(inp);
  inp.addEventListener("input", () => cb(inp.value));
  inp.addEventListener("change", () => { cb(inp.value); if (inp.parentNode) document.body.removeChild(inp); });
  inp.click();
}
function toggleViewMode(id, btn) {
  if (id === "checker") { ui.checker = !ui.checker; $("#comp-frame").classList.toggle("checker-off", !ui.checker); }
  if (id === "safe") $("#safe-area").classList.toggle("on");
  btn.classList.toggle("active");
}

/* ----------------------------------------------------------------- menus */
function buildMenus() {
  const wm = $("#window-menu");
  [["project", "Project"], ["effects", "Effects & Presets"], ["viewer", "Composition"],
  ["info", "Info"], ["properties", "Properties"], ["render", "Render Queue"], ["timeline-panel", "Timeline"]].forEach(([id, name]) => {
    const a = document.createElement("a"); a.textContent = name;
    a.addEventListener("click", () => {
      const el = document.querySelector(`[data-panel="${id}"]`) || $("#" + id);
      if (!el) return; el.style.display = el.style.display === "none" ? "" : "none";
    });
    wm.appendChild(a);
  });
  const em = $("#effect-menu");
  EFFECT_CATS.forEach(cat => {
    const names = Object.values(EFFECTS).filter(e => e.cat === cat).map(e => e.name);
    if (!names.length) return;
    const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = cat; em.appendChild(sub);
    names.forEach(n => { const a = document.createElement("a"); a.textContent = n; a.dataset.cmd = "apply-fx:" + n; em.appendChild(a); });
  });
  $$(".menubar .menu").forEach(m => m.querySelector("button").addEventListener("click", e => {
    const open = m.classList.contains("open");
    $$(".menubar .menu").forEach(x => x.classList.remove("open"));
    if (!open) m.classList.add("open");
    e.stopPropagation();
  }));
  document.addEventListener("click", e => { if (!e.target.closest(".menubar")) $$(".menubar .menu").forEach(x => x.classList.remove("open")); });
}

/* ------------------------------------------------------- effects & presets */
function buildFxPanel() {
  const list = $("#fx-list");
  function draw(filter) {
    list.innerHTML = "";
    EFFECT_CATS.forEach(cat => {
      const items = Object.values(EFFECTS).filter(e => e.cat === cat && (!filter || e.name.toLowerCase().includes(filter)));
      if (!items.length) return;
      const det = document.createElement("details"); det.className = "fx-cat"; det.open = !!filter;
      const sum = document.createElement("summary"); sum.textContent = cat; det.appendChild(sum);
      items.forEach(e => {
        const it = document.createElement("div"); it.className = "fx-item"; it.textContent = e.name; it.draggable = true;
        it.addEventListener("dblclick", () => applyEffectToSelected(e.name));
        it.addEventListener("dragstart", ev => ev.dataTransfer.setData("text/fx", e.name));
        det.appendChild(it);
      });
      list.appendChild(det);
    });
  }
  draw("");
  $("#fx-search").addEventListener("input", e => draw(e.target.value.toLowerCase().trim()));
}
function applyEffectToSelected(name) {
  const l = primaryLayer();
  if (!l) { toast("Select a layer first"); return; }
  pushUndo();
  const fx = makeEffect(name); l.effects.push(fx); ui.fxExpanded[fx.id] = true;
  refreshAll(); toast("Applied " + name);
}

/* --------------------------------------------------------- project panel */
function buildProjectPanel() {
  const body = $("#project-body"); if (!body) return;
  body.innerHTML = "";
  const tree = document.createElement("div"); tree.className = "tree";
  const root = document.createElement("div"); root.className = "tree-item";
  root.textContent = "▾  🗂  " + project.name;
  tree.appendChild(root);
  project.compositions.forEach(c => {
    const it = document.createElement("div");
    it.className = "tree-item comp" + (c.id === project.activeCompId ? " sel" : "");
    it.textContent = `🎞  ${c.name}`;
    const mini = document.createElement("span"); mini.className = "mini";
    mini.textContent = `${c.width}×${c.height} · ${c.duration}s · ${c.fps}fps`;
    it.appendChild(mini);
    it.addEventListener("click", () => { project.activeCompId = c.id; ui.activeCompId = c.id; ui.time = 0; ui.selLayerIds = []; refreshAll(); });
    it.addEventListener("dblclick", () => openCompSettings(c));
    tree.appendChild(it);
  });
  if (project.assets.length) {
    const hdr = document.createElement("div"); hdr.className = "tree-item"; hdr.style.color = "#9a9a9a";
    hdr.textContent = "📁  Footage"; tree.appendChild(hdr);
    project.assets.forEach(a => {
      const it = document.createElement("div"); it.className = "tree-item";
      const img = document.createElement("img"); img.className = "thumb"; img.src = a.dataUrl;
      it.appendChild(img); const s = document.createElement("span"); s.textContent = a.name; it.appendChild(s);
      it.addEventListener("dblclick", () => addImageLayer(a));
      tree.appendChild(it);
    });
  }
  body.appendChild(tree);
}

/* ------------------------------------------------------- properties panel */
function buildPropPanel() {
  const body = $("#prop-body"); if (!body) return;
  const l = primaryLayer();
  $("#prop-title").textContent = l ? l.name : "Timeline";
  body.innerHTML = "";
  if (!l) { body.innerHTML = `<div style="padding:12px;color:#8f8f8f">No layer selected.<br>Click a layer in the timeline or composition.</div>`; return; }

  /* ---- reusable row builders ---- */
  const groupHeader = (title, lyr) => {
    const g = document.createElement("div");
    const h = document.createElement("div"); h.className = "prow"; h.style.background = "#2f2f2f"; h.style.fontWeight = "600";
    h.innerHTML = `<span class="twist">▾</span><span class="pico">${iconForLayer(lyr)}</span><span class="pname">${title}</span>`;
    h.addEventListener("click", e => {
      if (e.target.closest("input,button,select")) return;
      const tw = h.querySelector(".twist"), hide = tw.textContent === "▾";
      tw.textContent = hide ? "▸" : "▾";
      for (const k of g.children) if (k !== h) k.style.display = hide ? "none" : "";
    });
    g.appendChild(h);
    return g;
  };
  const transformRow = (label, prop, key) => {
    const row = document.createElement("div"); row.className = "prow";
    const animated = propIsAnimated(prop);
    const hasExpr = !!(prop.expr && prop.expr.trim());
    row.innerHTML = `<span class="twist"></span>
      <span class="stopwatch ${animated ? "on" : ""}" title="Toggle animation">⏱</span>
      <span class="pname ${animated || hasExpr ? "kf-on" : ""}">${label}${hasExpr ? " <b style='color:#7fd0ff'>=</b>" : ""}</span>
      <input class="pval" value="${fmtNum(prop.value)}"/>
      <span class="kfnav"><button title="Add keyframe">◆</button><button title="Prev">◀</button><button title="Next">▶</button><button class="expr-toggle ${hasExpr ? "on" : ""}" title="Expression">=</button></span>`;
    row.querySelector(".stopwatch").addEventListener("click", e => { e.stopPropagation(); pushUndo(); toggleStopwatch(prop); });
    const inp = row.querySelector("input.pval");
    inp.addEventListener("change", () => {
      pushUndo();
      const v = parseVal(inp.value, prop.value);
      if (propIsAnimated(prop)) setKf(prop, ui.time, v); else prop.value = v;
      markDirty(); drawViewer(); refreshTimeline();
    });
    const btns = row.querySelectorAll(".kfnav button");
    btns[0].addEventListener("click", e => { e.stopPropagation(); pushUndo(); setKf(prop, ui.time, prop.value); refreshAll(); });
    btns[1].addEventListener("click", e => { e.stopPropagation(); nearestKfOfProp(prop, -1); });
    btns[2].addEventListener("click", e => { e.stopPropagation(); nearestKfOfProp(prop, 1); });
    btns[3].addEventListener("click", e => { e.stopPropagation(); prop.__exprOpen = !prop.__exprOpen; buildPropPanel(); });
    return row;
  };
  const exprRow = (prop) => {
    const row = document.createElement("div"); row.className = "prow expr-row";
    row.innerHTML = `<span class="twist"></span><span class="pname" style="color:#7fd0ff;width:auto">=</span>`;
    const inp = document.createElement("input"); inp.className = "pval expr-input"; inp.value = prop.expr || "";
    inp.placeholder = "e.g. wiggle(2,20)  ·  value + 50  ·  time*100";
    inp.addEventListener("change", () => {
      pushUndo(); prop.expr = inp.value.trim();
      if (prop.expr && !compileExpr(prop)) toast("Expression error: " + prop.__err);
      markDirty(); drawViewer(); refreshTimeline(); buildPropPanel();
    });
    row.appendChild(inp);
    return row;
  };
  const propRow = (label, prop) => {
    const frag = document.createDocumentFragment();
    frag.appendChild(transformRow(label, prop));
    if (prop.expr || prop.__exprOpen) frag.appendChild(exprRow(prop));
    return frag;
  };
  const customRow = (label, value, type, onChange, options) => {
    const row = document.createElement("div"); row.className = "prow";
    row.innerHTML = `<span class="twist"></span><span class="stopwatch" style="border:none"></span><span class="pname">${label}</span>`;
    let inp;
    if (type === "color") { inp = document.createElement("input"); inp.type = "color"; inp.className = "pval"; inp.style.width = "26px"; inp.value = value; }
    else if (type === "check") { inp = document.createElement("input"); inp.type = "checkbox"; inp.checked = !!value; }
    else if (type === "select") {
      inp = document.createElement("select"); inp.className = "pval";
      (options || []).forEach(o => { const op = document.createElement("option"); op.value = o; op.textContent = o; if (value === o) op.selected = true; inp.appendChild(op); });
    } else if (type === "textarea") {
      inp = document.createElement("textarea"); inp.className = "pval"; inp.value = value;
      inp.style.cssText = "width:calc(100% - 46px);height:48px;background:#232323;border:1px solid #1a1a1a;color:#ddd;margin-left:44px";
    } else { inp = document.createElement("input"); inp.className = "pval"; inp.value = value; }
    row.appendChild(inp);
    const evt = (type === "color" || type === "check" || type === "select" || type === "textarea") ? "input" : "change";
    inp.addEventListener(evt, () => {
      let v = inp.value;
      if (type === "check") v = inp.checked;
      else if (type !== "color" && type !== "select" && type !== "textarea") v = parseFloat(v) || 0;
      onChange(v); markDirty(); drawViewer();
    });
    return row;
  };

  /* ---- transform ---- */
  const gT = groupHeader(l.type.toUpperCase() + " TRANSFORM", l);
  gT.appendChild(propRow("Anchor Point", l.transform.anchor, "anchor"));
  gT.appendChild(propRow("Position", l.transform.position, "position"));
  gT.appendChild(propRow("Scale", l.transform.scale, "scale"));
  gT.appendChild(propRow("Rotation", l.transform.rotation, "rotation"));
  gT.appendChild(propRow("Opacity", l.transform.opacity, "opacity"));
  const gExpr = document.createElement("div"); gExpr.className = "prow";
  gExpr.innerHTML = `<span class="twist"></span><span class="pname" style="color:#7fd0ff">Expression hint: <i>time, value, wiggle(f,a), noise(x), linear(a,b,t), random()</i></span>`;
  gT.appendChild(gExpr);
  body.appendChild(gT);

  /* ---- layer options: 3D, parent, track matte ---- */
  if (l.type !== "camera") {
    const gL = groupHeader("LAYER OPTIONS", l);
    gL.appendChild(customRow("3D Layer", l.threeD, "check", v => { toggle3D(l, v); }));
    // parent
    const pRow = document.createElement("div"); pRow.className = "prow";
    pRow.innerHTML = `<span class="twist"></span><span class="pname">Parent</span>`;
    const psel = document.createElement("select"); psel.className = "pval";
    const none = document.createElement("option"); none.value = ""; none.textContent = "None"; psel.appendChild(none);
    activeComp().layers.forEach(x => {
      if (x === l || x.type === "camera" || x.type === "light") return;
      const o = document.createElement("option"); o.value = x.id; o.textContent = `${iconForLayer(x)} ${x.name}`;
      if (l.parentId === x.id) o.selected = true; psel.appendChild(o);
    });
    psel.addEventListener("change", () => setParent(l, psel.value || null));
    pRow.appendChild(psel); gL.appendChild(pRow);
    // track matte
    const mRow = document.createElement("div"); mRow.className = "prow";
    mRow.innerHTML = `<span class="twist"></span><span class="pname">Track Matte</span>`;
    const msel = document.createElement("select"); msel.className = "pval";
    const mn = document.createElement("option"); mn.value = ""; mn.textContent = "None"; msel.appendChild(mn);
    activeComp().layers.forEach(x => {
      if (x === l || x.type === "camera" || x.type === "light") return;
      const o = document.createElement("option"); o.value = x.id; o.textContent = `${iconForLayer(x)} ${x.name}`;
      if (l.matteId === x.id) o.selected = true; msel.appendChild(o);
    });
    msel.addEventListener("change", () => { l.matteId = msel.value || null; markDirty(); refreshAll(); });
    mRow.appendChild(msel); gL.appendChild(mRow);
    if (l.matteId) gL.appendChild(customRow("Matte Type", l.matteType, "select", v => { l.matteType = v; }, ["alpha", "luma"]));
    body.appendChild(gL);
  }

  /* ---- masks ---- */
  if (l.type !== "camera" && l.type !== "light" && l.type !== "null") {
    const gM = groupHeader("MASKS", l);
    const addRow = document.createElement("div"); addRow.className = "prow";
    addRow.innerHTML = `<span class="twist"></span><span class="pname">Add Mask</span>`;
    const bR = document.createElement("button"); bR.className = "btn"; bR.textContent = "+ ▭ Rect";
    const bE = document.createElement("button"); bE.className = "btn"; bE.textContent = "+ ◯ Ellipse";
    bR.addEventListener("click", () => addMask(l, "rect"));
    bE.addEventListener("click", () => addMask(l, "ellipse"));
    addRow.appendChild(bR); addRow.appendChild(bE); gM.appendChild(addRow);
    l.masks.forEach((m, i) => {
      const mr = document.createElement("div"); mr.className = "prow";
      mr.innerHTML = `<span class="twist"></span><span class="pname">Mask ${i + 1} · ${m.type}</span>`;
      const mode = document.createElement("select"); mode.className = "pval";
      ["add", "subtract", "intersect"].forEach(mo => { const o = document.createElement("option"); o.value = mo; o.textContent = mo; if (m.mode === mo) o.selected = true; mode.appendChild(o); });
      mode.addEventListener("change", () => { m.mode = mode.value; markDirty(); drawViewer(); });
      mr.appendChild(mode);
      const del = document.createElement("button"); del.className = "btn"; del.textContent = "✕";
      del.addEventListener("click", () => { pushUndo(); l.masks = l.masks.filter(x => x !== m); refreshAll(); });
      mr.appendChild(del);
      gM.appendChild(mr);
      ["x", "y", "w", "h", "feather"].forEach(k => {
        gM.appendChild(customRow("  " + k.toUpperCase(), m[k], "number", v => { m[k] = v; }));
      });
    });
    body.appendChild(gM);
  }

  /* ---- camera options ---- */
  if (l.type === "camera") {
    const gC = groupHeader("CAMERA OPTIONS", l);
    l.camera = l.camera || { zoom: 1000, focusZ: 0, dof: false, aperture: 16 };
    gC.appendChild(customRow("Zoom (Focal)", l.camera.zoom, "number", v => { l.camera.zoom = v || 1; }));
    gC.appendChild(customRow("Position Z", (l.transform.position.value[2] || 0), "number", v => {
      const p = l.transform.position.value.slice(); p[2] = v; if (p.length < 3) { p[1] = p[1] || 0; }
      if (propIsAnimated(l.transform.position)) setKf(l.transform.position, ui.time, p); else l.transform.position.value = p;
    }));
    gC.appendChild(customRow("Focus Z", l.camera.focusZ, "number", v => { l.camera.focusZ = v; }));
    gC.appendChild(customRow("Depth of Field", l.camera.dof, "check", v => { l.camera.dof = v; }));
    gC.appendChild(customRow("Aperture", l.camera.aperture, "number", v => { l.camera.aperture = v || 1; }));
    body.appendChild(gC);
  }

  /* ---- precompose source ---- */
  if (l.type === "comp") {
    const gP = groupHeader("PRECOMP SOURCE", l);
    const r = document.createElement("div"); r.className = "prow";
    r.innerHTML = `<span class="twist"></span><span class="pname">Composition</span>`;
    const sel = document.createElement("select"); sel.className = "pval";
    const own = compOfLayer(l.id); const excluded = own ? own.id : activeComp().id;
    project.compositions.forEach(c => { if (c.id === excluded) return; const o = document.createElement("option"); o.value = c.id; o.textContent = c.name; if (l.compId === c.id) o.selected = true; sel.appendChild(o); });
    if (!l.compId && project.compositions.length) { const o = document.createElement("option"); o.value = ""; o.textContent = "— pick —"; o.selected = true; sel.insertBefore(o, sel.firstChild); }
    sel.addEventListener("change", () => { l.compId = sel.value; markDirty(); refreshAll(); });
    r.appendChild(sel); gP.appendChild(r); body.appendChild(gP);
  }

  /* ---- type specific ---- */
  if (l.type === "solid") {
    const g = groupHeader("SOLID", l);
    g.appendChild(customRow("Color", l.color, "color", v => { l.color = v; }));
    body.appendChild(g);
  }
  if (l.type === "text") {
    const g = groupHeader("TEXT", l);
    g.appendChild(customRow("Source Text", l.text, "textarea", v => { l.text = v; recenterAnchor(l); }));
    g.appendChild(customRow("Font Size", l.fontSize, "number", v => { l.fontSize = v || 1; recenterAnchor(l); }));
    g.appendChild(customRow("Fill Color", l.color, "color", v => { l.color = v; }));
    g.appendChild(customRow("Tracking", l.tracking, "number", v => { l.tracking = v; recenterAnchor(l); }));
    g.appendChild(customRow("Line Height", l.lineHeight, "number", v => { l.lineHeight = v || 1; }));
    g.appendChild(customRow("Align", l.align, "select", v => { l.align = v; }, ["left", "center", "right"]));
    g.appendChild(customRow("Font Weight", l.weight, "select", v => { l.weight = v; }, ["300", "400", "600", "700", "900"]));
    body.appendChild(g);
  }
  if (l.type === "shape") {
    const g = groupHeader("SHAPE · " + l.shapeType, l);
    g.appendChild(customRow("Fill Color", l.color, "color", v => { l.color = v; }));
    g.appendChild(customRow("Fill", l.fillOn, "check", v => { l.fillOn = v; }));
    g.appendChild(customRow("Stroke Color", l.strokeColor || "#000000", "color", v => { l.strokeColor = v; }));
    g.appendChild(customRow("Stroke", l.strokeOn, "check", v => { l.strokeOn = v; }));
    g.appendChild(customRow("Stroke Width", l.strokeWidth, "number", v => { l.strokeWidth = v || 1; recenterAnchor(l); }));
    g.appendChild(customRow("Width", l.shapeW, "number", v => { l.shapeW = v || 1; recenterAnchor(l); }));
    g.appendChild(customRow("Height", l.shapeH, "number", v => { l.shapeH = v || 1; recenterAnchor(l); }));
    if (l.shapeType === "polygon" || l.shapeType === "star") g.appendChild(customRow("Points", l.points, "number", v => { l.points = Math.round(v) || 3; }));
    if (l.shapeType === "star") g.appendChild(customRow("Inner Radius", l.inner, "number", v => { l.inner = v; }));
    if (l.shapeType === "rect") g.appendChild(customRow("Roundness", l.roundness, "number", v => { l.roundness = v; }));
    body.appendChild(g);
  }
  if (l.type === "image") {
    const g = groupHeader("FOOTAGE", l);
    const r = document.createElement("div"); r.className = "prow";
    r.innerHTML = `<span class="twist"></span><span class="pname">Source</span><span class="pval">${l.name}</span>`;
    g.appendChild(r); body.appendChild(g);
  }
  // blend mode always available
  const gB = groupHeader("BLENDING", l);
  gB.appendChild(customRow("Blend Mode", l.blend, "select", v => {
    l.blend = { "normal": "Normal", "multiply": "Multiply", "screen": "Screen", "overlay": "Overlay", "lighter": "Add", "darken": "Darken", "lighten": "Lighten", "difference": "Difference", "color": "Color", "luminosity": "Luminosity" }[v] || "Normal";
  }, ["Normal", "Multiply", "Screen", "Overlay", "Add", "Darken", "Lighten", "Difference", "Color", "Luminosity"]));
  body.appendChild(gB);

  /* ---- effects ---- */
  l.effects.forEach(fx => {
    const def = EFFECTS[fx.name]; if (!def) return;
    const open = ui.fxExpanded[fx.id] !== false;
    const head = document.createElement("div"); head.className = "prow"; head.style.background = "#2f2f2f";
    head.innerHTML = `<span class="twist">${open ? "▾" : "▸"}</span><span class="pico" style="color:#7fd0ff">fx</span><span class="pname">${fx.name}</span>
      <span class="kfnav"><button class="fx-del" title="Remove effect">✕</button></span>`;
    head.querySelector(".fx-del").addEventListener("click", e => { e.stopPropagation(); pushUndo(); l.effects = l.effects.filter(f => f.id !== fx.id); refreshAll(); });
    head.addEventListener("click", e => { if (e.target.closest("button")) return; ui.fxExpanded[fx.id] = !open; buildPropPanel(); });
    body.appendChild(head);
    if (!open) return;

    const er = document.createElement("div"); er.className = "prow";
    er.innerHTML = `<span class="twist"></span><span class="pname">Effect Enabled</span>`;
    const eb = document.createElement("input"); eb.type = "checkbox"; eb.checked = fx.enabled;
    eb.addEventListener("change", () => { fx.enabled = eb.checked; drawViewer(); });
    er.appendChild(eb); body.appendChild(er);

    for (const key in def.params) {
      const pd = def.params[key];
      const row = document.createElement("div"); row.className = "prow";
      const pkf = fx.paramKf && fx.paramKf[key];
      const animated = pkf && pkf.kf.length;
      row.innerHTML = `<span class="twist"></span>
        <span class="stopwatch ${animated ? "on" : ""}" title="Animate parameter">⏱</span>
        <span class="pname ${animated ? "kf-on" : ""}">${pd.label}</span>`;
      if (pd.type === "choice") {
        const sel = document.createElement("select"); sel.className = "pval";
        pd.options.forEach(o => { const op = document.createElement("option"); op.value = o; op.textContent = o; if (fx.params[key] === o) op.selected = true; sel.appendChild(op); });
        sel.addEventListener("change", () => { fx.params[key] = sel.value; drawViewer(); });
        row.appendChild(sel);
      } else if (pd.type === "checkbox") {
        const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!fx.params[key];
        cb.addEventListener("change", () => { fx.params[key] = cb.checked; drawViewer(); });
        row.appendChild(cb);
      } else if (pd.type === "color") {
        const ci = document.createElement("input"); ci.type = "color"; ci.className = "pval"; ci.style.width = "26px"; ci.value = fx.params[key];
        ci.addEventListener("input", () => { fx.params[key] = ci.value; drawViewer(); });
        row.appendChild(ci);
      } else {
        const ci = document.createElement("input"); ci.className = "pval";
        ci.value = animated ? +(+getVal(pkf, ui.time)).toFixed(2) : fx.params[key];
        ci.addEventListener("change", () => {
          const v = parseFloat(ci.value); if (isNaN(v)) return;
          if (animated) setKf(pkf, ui.time, v); else fx.params[key] = v;
          drawViewer(); refreshTimeline();
        });
        row.appendChild(ci);
      }
      row.querySelector(".stopwatch").addEventListener("click", e => { e.stopPropagation(); toggleParamStopwatch(fx, key); });
      body.appendChild(row);
    }
    const sep = document.createElement("div"); sep.style.cssText = "height:6px;background:#242424"; body.appendChild(sep);
  });
}

function nearestKfOfProp(prop, dir) {
  if (!prop.kf.length) return;
  let best = null;
  for (const k of prop.kf) {
    if (dir > 0 && k.time > ui.time + 1e-4) { if (best === null || k.time < best) best = k.time; }
    if (dir < 0 && k.time < ui.time - 1e-4) { if (best === null || k.time > best) best = k.time; }
  }
  if (best !== null) seek(best);
}
function toggleStopwatch(prop) { if (prop.kf.length) prop.kf = []; else setKf(prop, ui.time, prop.value); refreshAll(); }
function toggleParamStopwatch(fx, key) {
  fx.paramKf = fx.paramKf || {};
  if (fx.paramKf[key] && fx.paramKf[key].kf.length) delete fx.paramKf[key];
  else { fx.paramKf[key] = mkProp(fx.params[key]); setKf(fx.paramKf[key], ui.time, fx.params[key]); }
  buildPropPanel(); refreshTimeline();
}

/* ------------------------------------------------------------- refreshing */
function refreshAll() { buildProjectPanel(); buildPropPanel(); refreshTimeline(); drawViewer(); updateCompSelect(); }
function refreshPropPanel() { buildPropPanel(); }
function updateCompSelect() {
  const sel = $("#comp-select"); if (!sel) return;
  sel.innerHTML = "";
  project.compositions.forEach(c => { const o = document.createElement("option"); o.value = c.id; o.textContent = c.name; if (c.id === project.activeCompId) o.selected = true; sel.appendChild(o); });
}
function selectOnly(l) { ui.selLayerIds = [l.id]; refreshAll(); }
