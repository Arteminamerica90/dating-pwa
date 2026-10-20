/* ==========================================================================
   Movix — engine.js : keyframes + render pipeline
   ========================================================================== */

/* ============================================================ KEYFRAMES */
function hash1(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function valueNoise1D(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return (hash1(i) + (hash1(i + 1) - hash1(i)) * u) * 2 - 1;
}
function cubicBezier(x1, y1, x2, y2, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  let t = x;
  for (let i = 0; i < 8; i++) { const xe = sx(t) - x; if (Math.abs(xe) < 1e-4) break; const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= xe / d; }
  return sy(clamp(t, 0, 1));
}
function getKfVal(prop, t) {
  const kf = prop.kf;
  if (!kf || !kf.length) return prop.value;
  if (kf.length === 1) return kf[0].value;
  if (t <= kf[0].time) return kf[0].value;
  if (t >= kf[kf.length - 1].time) return kf[kf.length - 1].value;
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i], b = kf[i + 1];
    if (t >= a.time && t <= b.time) {
      if (a.easing === "hold") return a.value;
      let u = (t - a.time) / ((b.time - a.time) || 1);
      if (a.bezOut && b.bezIn) u = cubicBezier(a.bezOut.x, a.bezOut.y, b.bezIn.x, b.bezIn.y, u);
      else if (a.easing === "ease") u = easeInOut(u);
      else if (a.easing === "easeIn") u = u * u;
      else if (a.easing === "easeOut") u = 1 - (1 - u) * (1 - u);
      if (Array.isArray(a.value)) return a.value.map((v, k) => lerp(v, b.value[k] != null ? b.value[k] : v, u));
      return lerp(a.value, b.value, u);
    }
  }
  return prop.value;
}
function compileExpr(prop) {
  if (prop.__src === prop.expr) return prop.__fn;
  prop.__src = prop.expr; prop.__fn = null; prop.__err = null;
  if (prop.expr && prop.expr.trim()) {
    try {
      prop.__fn = new Function("time", "value", "layer", "comp", "wiggle", "random", "noise", "linear", "ease", "Math",
        '"use strict";return (' + prop.expr + ");");
    } catch (e) { prop.__err = e.message; }
  }
  return prop.__fn;
}
function evalPropExpr(prop, t, layer) {
  const fn = compileExpr(prop);
  if (!fn) return undefined;
  const base = getKfVal(prop, t);
  const comp = layer ? (compOfLayer(layer.id) || activeComp()) : activeComp();
  if (prop.__seed == null) prop.__seed = Math.random() * 1000;
  const seed = prop.__seed;
  const wiggle = (freq, amp) => {
    freq = freq == null ? 1 : freq; amp = amp == null ? 10 : amp;
    const off = valueNoise1D(t * freq + seed) * amp;
    return Array.isArray(base) ? base.map((v, i) => v + (i === 0 ? off : off * 0.7)) : base + off;
  };
  const noise = (x, s) => valueNoise1D((x == null ? t : x) + (s == null ? seed : s));
  try { return fn(t, base, layer, comp, wiggle, Math.random, noise, (a, b, k) => lerp(a, b, clamp(k, 0, 1)), easeInOut, Math); }
  catch (e) { return undefined; }
}
function getVal(prop, t, layer) {
  if (prop.expr && prop.expr.trim()) { const ev = evalPropExpr(prop, t, layer); if (ev !== undefined) return ev; }
  return getKfVal(prop, t);
}
function kfAt(prop, t) { const tol = 0.5 / activeComp().fps; return prop.kf.find(k => Math.abs(k.time - t) < tol); }
function setKf(prop, t, value, easing) {
  const ex = kfAt(prop, t);
  if (ex) { ex.value = Array.isArray(value) ? value.slice() : value; if (easing) ex.easing = easing; }
  else { prop.kf.push({ time: t, value: Array.isArray(value) ? value.slice() : value, easing: easing || "linear" }); prop.kf.sort((a, b) => a.time - b.time); }
}
function propIsAnimated(prop) { return prop.kf && prop.kf.length > 0; }

/* =============================================================== RENDER */
const RES_SCALE = { full: 1, half: 0.5, third: 1 / 3, quarter: 0.25 };

function measureLine(ctx, ln, tr) { let s = 0; for (const c of ln) s += ctx.measureText(c).width + tr; return s - (ln.length ? tr : 0); }

function renderLayerContent(layer, comp, scale, t, depth, stack) {
  comp = comp || activeComp();
  depth = depth || 0; stack = stack || [];
  t = t == null ? ui.time : t;
  const size = contentSize(layer, comp);
  const cw = Math.max(1, Math.round(size.w * scale)), ch = Math.max(1, Math.round(size.h * scale));
  const c = document.createElement("canvas"); c.width = cw; c.height = ch;
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);
  const w = size.w, h = size.h;

  if (layer.type === "solid" || layer.type === "adjustment") {
    if (layer.type === "solid") { ctx.fillStyle = layer.color; ctx.fillRect(0, 0, w, h); }
  } else if (layer.type === "text") {
    ctx.font = `${layer.italic ? "italic " : ""}${layer.weight} ${layer.fontSize}px ${layer.font}, Arial, sans-serif`;
    ctx.fillStyle = layer.color; ctx.textBaseline = "top";
    const lines = String(layer.text || "").split("\n");
    let y = 5;
    for (const ln of lines) {
      if (layer.tracking) {
        const total = measureLine(ctx, ln, layer.tracking);
        let x = layer.align === "center" ? (w - total) / 2 + 10 : layer.align === "right" ? w - 10 - total : 10;
        ctx.textAlign = "left";
        for (const chx of ln) { ctx.fillText(chx, x, y); x += ctx.measureText(chx).width + layer.tracking; }
      } else {
        ctx.textAlign = layer.align === "center" ? "center" : layer.align === "right" ? "right" : "left";
        const bx = layer.align === "center" ? w / 2 : layer.align === "right" ? w - 10 : 10;
        ctx.fillText(ln, bx, y);
      }
      y += layer.fontSize * layer.lineHeight;
    }
  } else if (layer.type === "shape") {
    drawShape(ctx, layer, w / 2, h / 2);
  } else if (layer.type === "image") {
    const asset = project.assets.find(a => a.id === layer.assetId);
    if (asset && asset.img && asset.img.complete && asset.img.naturalWidth) ctx.drawImage(asset.img, 0, 0, w, h);
  } else if (layer.type === "comp") {
    const sub = compById(layer.compId);
    if (sub && !stack.includes(sub.id)) { const sc = renderComp(document.createElement("canvas"), sub, Math.max(0, t - layer.inPoint), false, depth + 1, stack); ctx.drawImage(sc, 0, 0, w, h); }
  }
  if (layer.masks && layer.masks.length) applyMasks(ctx, c, layer, w, h, scale);
  return c;
}

function drawMaskShape(mx, m, w, h) {
  const x = m.x != null ? m.x : w / 2, y = m.y != null ? m.y : h / 2;
  const mw = m.w != null ? m.w : w, mh = m.h != null ? m.h : h;
  mx.beginPath();
  if (m.type === "ellipse") mx.ellipse(x, y, mw / 2, mh / 2, 0, 0, TAU);
  else if (m.roundness) roundRect(mx, x - mw / 2, y - mh / 2, mw, mh, m.roundness);
  else mx.rect(x - mw / 2, y - mh / 2, mw, mh);
  mx.fillStyle = "#fff"; mx.fill();
}
function applyMasks(ctx, canvas, layer, w, h, scale) {
  const drawSet = (list, op) => {
    if (!list.length) return;
    const mc = document.createElement("canvas"); mc.width = canvas.width; mc.height = canvas.height;
    const mx = mc.getContext("2d"); mx.scale(scale, scale);
    for (const m of list) { mx.save(); if (m.feather) mx.filter = `blur(${(m.feather * scale).toFixed(2)}px)`; drawMaskShape(mx, m, w, h); mx.restore(); }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = op; ctx.drawImage(mc, 0, 0); ctx.restore();
  };
  const keep = layer.masks.filter(m => m.mode === "add" || m.mode === "intersect");
  const cut = layer.masks.filter(m => m.mode === "subtract");
  if (keep.length) drawSet(keep, "destination-in");
  if (cut.length) drawSet(cut, "destination-out");
}
function lumaToAlpha(cv) {
  const cx = cv.getContext("2d"); const im = cx.getImageData(0, 0, cv.width, cv.height); const d = im.data;
  for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; if (l < d[i + 3]) d[i + 3] = l; }
  cx.putImageData(im, 0, 0);
}

function drawShape(ctx, layer, cx, cy) {
  const w = layer.shapeW, h = layer.shapeH;
  ctx.save(); ctx.translate(cx, cy);
  ctx.beginPath();
  if (layer.shapeType === "ellipse") ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
  else if (layer.shapeType === "polygon") {
    const n = Math.max(3, layer.points | 0), sx = w / Math.min(w, h), sy = h / Math.min(w, h);
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / n) * TAU; const px = Math.cos(a) * (Math.min(w, h) / 2) * sx, py = Math.sin(a) * (Math.min(w, h) / 2) * sy; ctx[i ? "lineTo" : "moveTo"](px, py); }
    ctx.closePath();
  } else if (layer.shapeType === "star") {
    const n = Math.max(3, layer.points | 0), R = Math.min(w, h) / 2, r = R * layer.inner / 100;
    for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i / (n * 2)) * TAU, rr = i % 2 ? r : R; ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath();
  } else {
    if (layer.roundness) roundRect(ctx, -w / 2, -h / 2, w, h, layer.roundness); else ctx.rect(-w / 2, -h / 2, w, h);
  }
  if (layer.fillOn) { ctx.fillStyle = layer.color; ctx.fill(); }
  if (layer.strokeOn) { ctx.lineWidth = layer.strokeWidth; ctx.strokeStyle = layer.strokeColor || "#000000"; ctx.stroke(); }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function project3D(layer, t, comp) {
  comp = comp || activeComp();
  const cam = comp.layers.find(l => l.type === "camera" && l.enabled) || null;
  const cp = cam ? getVal(cam.transform.position, t, cam) : [comp.width / 2, comp.height / 2, 0];
  const F = cam && cam.camera ? cam.camera.zoom : 1000;
  const pos = getVal(layer.transform.position, t, layer);
  const z = (pos && pos[2]) || 0, cz = (cp && cp[2]) || 0;
  const s = F / Math.max(1, F + (z - cz));
  return { sx: cp[0] + ((pos[0] || 0) - cp[0]) * s, sy: cp[1] + ((pos[1] || 0) - cp[1]) * s, s, z, cz, cam };
}
function localMatrix(layer, t, comp) {
  comp = comp || activeComp();
  const tr = layer.transform;
  const anc = getVal(tr.anchor, t, layer), sc = getVal(tr.scale, t, layer), rot = getVal(tr.rotation, t, layer);
  let pos = getVal(tr.position, t, layer), ps = 1;
  if (layer.threeD) { const pr = project3D(layer, t, comp); pos = [pr.sx, pr.sy]; ps = pr.s; }
  const m = new DOMMatrix();
  m.translateSelf(pos[0], pos[1]);
  m.rotateSelf(rot);
  m.scaleSelf((sc[0] / 100) * ps, (sc[1] / 100) * ps);
  m.translateSelf(-anc[0], -anc[1]);
  return m;
}
function layerMatrix(layer, t, comp, depth) {
  comp = comp || activeComp();
  depth = depth || 0;
  let m = localMatrix(layer, t, comp);
  if (layer.parentId && depth < 32) {
    const p = layerById(layer.parentId);
    if (p) m = layerMatrix(p, t, comp, depth + 1).multiply(m);
  }
  return m;
}
function layerBounds(layer, t, scale) {
  scale = scale || 1;
  const size = contentSize(layer), m = layerMatrix(layer, t);
  const pts = [[0, 0], [size.w, 0], [size.w, size.h], [0, size.h]].map(p => {
    const q = m.transformPoint(new DOMPoint(p[0], p[1])); return [q.x * scale, q.y * scale];
  });
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), pts };
}

function renderComp(canvas, comp, t, forExport, depth, stack) {
  depth = depth || 0; stack = stack || [];
  const scale = forExport ? 1 : RES_SCALE[ui.resolution];
  const W = Math.max(1, Math.round(comp.width * scale)), H = Math.max(1, Math.round(comp.height * scale));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = comp.bg; ctx.fillRect(0, 0, W, H);
  if (depth > 6 || stack.includes(comp.id)) return canvas;
  stack = stack.concat(comp.id);

  const acc = document.createElement("canvas"); acc.width = W; acc.height = H;
  const actx = acc.getContext("2d");
  const cam = comp.layers.find(l => l.type === "camera" && l.enabled) || null;
  const anySolo = comp.layers.some(l => l.solo);
  const matteIds = new Set(comp.layers.map(l => l.matteId).filter(Boolean));
  const layers = comp.layers.slice().reverse();

  for (const layer of layers) {
    if (!layer.enabled) continue;
    if (t < layer.inPoint - 1e-6 || t > layer.outPoint + 1e-6) continue;
    if (anySolo && !layer.solo) continue;
    if (matteIds.has(layer.id)) continue;

    if (layer.type === "adjustment") {
      const out = applyEffectChain(acc, layer);
      if (out !== acc) { actx.setTransform(1, 0, 0, 1, 0, 0); actx.globalAlpha = 1; actx.globalCompositeOperation = "source-over"; actx.clearRect(0, 0, W, H); actx.drawImage(out, 0, 0); }
      actx.setTransform(1, 0, 0, 1, 0, 0); continue;
    }
    if (layer.type === "null" || layer.type === "camera" || layer.type === "light") continue;

    let buf = renderLayerContent(layer, comp, scale, t, depth, stack);
    buf = applyEffectChain(buf, layer);
    if (layer.threeD && cam && cam.camera && cam.camera.dof) {
      const pr = project3D(layer, t, comp);
      const blur = clamp(Math.abs(pr.z - (cam.camera.focusZ || 0)) / Math.max(1, cam.camera.zoom) * (cam.camera.aperture || 16) * 4, 0, 40);
      if (blur > 0.6) { const bctx = buf.getContext("2d"); const im = bctx.getImageData(0, 0, buf.width, buf.height); gaussBlur(im, blur); bctx.putImageData(im, 0, 0); }
    }
    const op = getVal(layer.transform.opacity, t, layer) / 100;
    const size = contentSize(layer, comp);
    const mm = new DOMMatrix().scaleSelf(scale).multiply(layerMatrix(layer, t, comp));

    if (layer.matteId) {
      const lb = document.createElement("canvas"); lb.width = W; lb.height = H; const lx = lb.getContext("2d");
      lx.setTransform(mm.a, mm.b, mm.c, mm.d, mm.e, mm.f); lx.drawImage(buf, 0, 0, size.w, size.h); lx.setTransform(1, 0, 0, 1, 0, 0);
      const mat = layerById(layer.matteId);
      if (mat) {
        let mc = renderLayerContent(mat, comp, scale, t, depth, stack); mc = applyEffectChain(mc, mat);
        const msz = contentSize(mat, comp);
        const mmm = new DOMMatrix().scaleSelf(scale).multiply(layerMatrix(mat, t, comp));
        const mb = document.createElement("canvas"); mb.width = W; mb.height = H; const mx = mb.getContext("2d");
        mx.setTransform(mmm.a, mmm.b, mmm.c, mmm.d, mmm.e, mmm.f); mx.drawImage(mc, 0, 0, msz.w, msz.h); mx.setTransform(1, 0, 0, 1, 0, 0);
        if (layer.matteType === "luma") lumaToAlpha(mb);
        lx.globalCompositeOperation = "destination-in"; lx.drawImage(mb, 0, 0); lx.globalCompositeOperation = "source-over";
      }
      actx.setTransform(1, 0, 0, 1, 0, 0); actx.save();
      actx.globalAlpha = clamp(op, 0, 1); actx.globalCompositeOperation = blendToOp(layer.blend);
      actx.drawImage(lb, 0, 0); actx.restore();
    } else {
      actx.setTransform(1, 0, 0, 1, 0, 0); actx.save();
      actx.globalAlpha = clamp(op, 0, 1); actx.globalCompositeOperation = blendToOp(layer.blend);
      actx.setTransform(mm.a, mm.b, mm.c, mm.d, mm.e, mm.f);
      actx.drawImage(buf, 0, 0, size.w, size.h);
      actx.restore();
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(acc, 0, 0);
  return canvas;
}
function renderFrame(canvas, t, forExport) { return renderComp(canvas, activeComp(), t, forExport, 0); }
