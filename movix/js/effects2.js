/* ==========================================================================
   Movix — effects2.js : Distort, Generate, Stylize, Perspective, Keying, Transition, Channel
   ========================================================================== */

/* --- Distort ------------------------------------------------------------- */
defEffect({
  name: "Turbulent Displace", cat: "Distort", pixel: true,
  params: { amount: P("Amount", "number", 20, { min: 0, max: 200 }), size: P("Size", "number", 40, { min: 1, max: 400 }), complexity: P("Complexity", "number", 3, { min: 1, max: 8, step: 1 }), evolution: P("Evolution", "number", 0, { min: 0, max: 360 }) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, src = cloneData(d), s = p.size, seed = p.evolution / 360 * 200;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const dx = (fbm(x / s, y / s, seed, p.complexity) - 0.5) * 2 * p.amount;
      const dy = (fbm(x / s, y / s, seed + 50, p.complexity) - 0.5) * 2 * p.amount;
      const k = (clamp(Math.round(y + dy), 0, h - 1) * w + clamp(Math.round(x + dx), 0, w - 1)) * 4;
      d[o] = src[k]; d[o + 1] = src[k + 1]; d[o + 2] = src[k + 2]; d[o + 3] = src[k + 3];
    }
  }
});
defEffect({
  name: "Ripple", cat: "Distort", pixel: true,
  params: { radius: P("Radius", "number", 60, { min: 1, max: 500 }), amplitude: P("Wave Amplitude", "number", 20, { min: 0, max: 200 }), wavelength: P("Wave Length", "number", 60, { min: 2, max: 500 }), cx: P("Center X", "number", 50, { min: -100, max: 200 }), cy: P("Center Y", "number", 50, { min: -100, max: 200 }) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, src = cloneData(d);
    const cx = (p.cx / 100) * w, cy = (p.cy / 100) * h, rad0 = p.radius + p.amplitude;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy);
      let off = 0;
      if (dist < rad0) off = Math.sin((dist / p.wavelength) * TAU) * p.amplitude * (1 - dist / rad0);
      const ux = dist ? dx / dist : 0, uy = dist ? dy / dist : 0;
      const k = (clamp(Math.round(y + uy * off), 0, h - 1) * w + clamp(Math.round(x + ux * off), 0, w - 1)) * 4;
      const o = (y * w + x) * 4;
      d[o] = src[k]; d[o + 1] = src[k + 1]; d[o + 2] = src[k + 2]; d[o + 3] = src[k + 3];
    }
  }
});
defEffect({
  name: "Wave Warp", cat: "Distort", pixel: true,
  params: { amp: P("Wave Height", "number", 20, { min: 0, max: 200 }), len: P("Wave Width", "number", 60, { min: 2, max: 500 }), phase: P("Phase", "number", 0, { min: -360, max: 360 }), dir: P("Direction", "choice", "Horizontal", { options: ["Horizontal", "Vertical"] }) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, src = cloneData(d), ph = rad(p.phase);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sx = x, sy = y;
      if (p.dir === "Horizontal") sy = y + Math.sin((x / p.len) * TAU + ph) * p.amp;
      else sx = x + Math.sin((y / p.len) * TAU + ph) * p.amp;
      const o = (y * w + x) * 4, k = (clamp(Math.round(sy), 0, h - 1) * w + clamp(Math.round(sx), 0, w - 1)) * 4;
      d[o] = src[k]; d[o + 1] = src[k + 1]; d[o + 2] = src[k + 2]; d[o + 3] = src[k + 3];
    }
  }
});
defEffect({
  name: "Bulge", cat: "Distort", pixel: true,
  params: { amount: P("Bulge Height", "number", 40, { min: -100, max: 100 }), radius: P("Radius", "number", 50, { min: 1, max: 200 }), cx: P("Center X", "number", 50, { min: -100, max: 200 }), cy: P("Center Y", "number", 50, { min: -100, max: 200 }) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, src = cloneData(d);
    const cx = (p.cx / 100) * w, cy = (p.cy / 100) * h, R = Math.min(w, h) * p.radius / 100, k = p.amount / 100;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy);
      let sx = x, sy = y;
      if (dist < R && R > 0) { const t = dist / R, f = Math.pow(t, 1 - k); sx = cx + dx * f; sy = cy + dy * f; }
      const o = (y * w + x) * 4, kk = (clamp(Math.round(sy), 0, h - 1) * w + clamp(Math.round(sx), 0, w - 1)) * 4;
      d[o] = src[kk]; d[o + 1] = src[kk + 1]; d[o + 2] = src[kk + 2]; d[o + 3] = src[kk + 3];
    }
  }
});
defEffect({
  name: "Mirror", cat: "Distort", canvas: true,
  params: { angle: P("Reflection Angle", "number", 90, { min: -360, max: 360 }), side: P("Reflection Center", "number", 50, { min: 0, max: 100 }) },
  draw(src, dst, ctx, p) {
    const w = src.width, h = src.height;
    ctx.drawImage(src, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.rect((w * p.side) / 100, 0, w, h); ctx.clip();
    ctx.translate(w / 2, h / 2); ctx.rotate(rad(p.angle * 2)); ctx.translate(-w / 2, -h / 2);
    ctx.scale(-1, 1); ctx.drawImage(src, -w, 0);
    ctx.restore();
  }
});
defEffect({
  name: "Transform", cat: "Distort", canvas: true,
  params: { posx: P("Position X", "number", 0, { min: -4000, max: 4000 }), posy: P("Position Y", "number", 0, { min: -4000, max: 4000 }), scale: P("Scale", "number", 100, { min: 0, max: 500 }), rotation: P("Rotation", "number", 0, { min: -360, max: 360 }), opacity: P("Opacity", "number", 100, { min: 0, max: 100 }) },
  draw(src, dst, ctx, p) {
    const w = src.width, h = src.height;
    ctx.translate(w / 2 + p.posx, h / 2 + p.posy);
    ctx.rotate(rad(p.rotation)); ctx.scale(p.scale / 100, p.scale / 100); ctx.translate(-w / 2, -h / 2);
    ctx.globalAlpha = p.opacity / 100; ctx.drawImage(src, 0, 0); ctx.globalAlpha = 1;
  }
});

/* --- Generate ------------------------------------------------------------ */
defEffect({
  name: "Fill", cat: "Generate", canvas: true,
  params: { color: P("Color", "color", "#ff8844"), opacity: P("Opacity", "number", 100, { min: 0, max: 100 }), blend: P("Blend Mode", "choice", "Normal", { options: ["Normal", "Multiply", "Screen", "Overlay", "Add"] }) },
  draw(src, dst, ctx, p) {
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = p.opacity / 100;
    ctx.fillStyle = p.color; ctx.fillRect(0, 0, src.width, src.height);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
});
defEffect({
  name: "Ramp", cat: "Generate", pixel: true,
  params: { start: P("Start Color", "color", "#ff0000"), end: P("End Color", "color", "#0000ff"), type: P("Type", "choice", "Linear", { options: ["Linear", "Radial"] }), angle: P("Angle", "number", 0, { min: -360, max: 360 }), opacity: P("Opacity", "number", 100, { min: 0, max: 100 }) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, [r1, g1, b1] = hexToRgb(p.start), [r2, g2, b2] = hexToRgb(p.end), a = p.opacity / 100;
    const ar = rad(p.angle), dx = Math.cos(ar), dy = Math.sin(ar);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let t;
      if (p.type === "Radial") { const ddx = (x - w / 2) / (w / 2), ddy = (y - h / 2) / (h / 2); t = clamp(Math.sqrt(ddx * ddx + ddy * ddy) * 0.7, 0, 1); }
      else t = clamp((x * dx + y * dy) / (Math.abs(dx) * w + Math.abs(dy) * h) + 0.5, 0, 1);
      const o = (y * w + x) * 4;
      d[o] = lerp(d[o], lerp(r1, r2, t), a); d[o + 1] = lerp(d[o + 1], lerp(g1, g2, t), a); d[o + 2] = lerp(d[o + 2], lerp(b1, b2, t), a);
      d[o + 3] = Math.max(d[o + 3], a * 255);
    }
  }
});
defEffect({
  name: "Stroke", cat: "Generate", canvas: true,
  params: { color: P("Color", "color", "#ffffff"), width: P("Brush Size", "number", 4, { min: 0.5, max: 40, step: 0.5 }), opacity: P("Opacity", "number", 100, { min: 0, max: 100 }), position: P("Position", "choice", "Outside", { options: ["Outside", "Inside", "Center"] }) },
  draw(src, dst, ctx, p) {
    ctx.drawImage(src, 0, 0);
    const r = Math.max(1, Math.round(p.width)), w = src.width, h = src.height;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const cx = c.getContext("2d"); cx.drawImage(src, 0, 0);
    let im = cx.getImageData(0, 0, w, h);
    const a0 = cloneData(im.data), out = im.data;
    for (let pass = 0; pass < r; pass++) {
      const prev = cloneData(out);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const o = (y * w + x) * 4; if (o === 0) continue;
        if (out[o + 3] > 0) continue;
        let m = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) m = Math.max(m, prev[((y + j) * w + (x + i)) * 4 + 3]);
        out[o + 3] = m;
      }
    }
    const [cr, cg, cb] = hexToRgb(p.color);
    for (let i = 0; i < out.length; i += 4) { if (out[i + 3] > 0) { out[i] = cr; out[i + 1] = cg; out[i + 2] = cb; } }
    cx.putImageData(im, 0, 0);
    if (p.position === "Inside") {
      const c2 = document.createElement("canvas"); c2.width = w; c2.height = h;
      const x2 = c2.getContext("2d"); x2.drawImage(src, 0, 0); x2.globalCompositeOperation = "source-in"; x2.drawImage(c, 0, 0);
      ctx.globalAlpha = p.opacity / 100; ctx.drawImage(c2, 0, 0); ctx.globalAlpha = 1;
    } else if (p.position === "Outside") {
      const c2 = document.createElement("canvas"); c2.width = w; c2.height = h;
      const x2 = c2.getContext("2d"); x2.drawImage(c, 0, 0); x2.globalCompositeOperation = "destination-out"; x2.drawImage(src, 0, 0);
      ctx.globalAlpha = p.opacity / 100; ctx.drawImage(c2, 0, 0); ctx.globalAlpha = 1;
    } else { ctx.globalAlpha = p.opacity / 100; ctx.drawImage(c, 0, 0); ctx.globalAlpha = 1; }
  }
});

/* --- Stylize ------------------------------------------------------------- */
defEffect({
  name: "Posterize", cat: "Stylize", pixel: true,
  params: { levels: P("Levels", "number", 6, { min: 2, max: 64, step: 1 }) },
  apply(img, p) { const d = img.data, f = 255 / (p.levels - 1); for (let i = 0; i < d.length; i += 4) { d[i] = Math.round(d[i] / f) * f; d[i + 1] = Math.round(d[i + 1] / f) * f; d[i + 2] = Math.round(d[i + 2] / f) * f; } }
});
defEffect({
  name: "Find Edges", cat: "Stylize", pixel: true,
  params: { amount: P("Blend With Original", "number", 0, { min: 0, max: 100 }), invert: P("Invert", "checkbox", false) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, src = cloneData(d), a = 1 - p.amount / 100;
    const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1], gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let sx = 0, sy = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = ((y + j) * w + (x + i)) * 4, g = luminance(src[k], src[k + 1], src[k + 2]), gi = (j + 1) * 3 + (i + 1); sx += g * gx[gi]; sy += g * gy[gi]; }
      let v = Math.min(255, Math.sqrt(sx * sx + sy * sy)); if (p.invert) v = 255 - v;
      const o = (y * w + x) * 4;
      d[o] = lerp(d[o], v, a); d[o + 1] = lerp(d[o + 1], v, a); d[o + 2] = lerp(d[o + 2], v, a);
    }
  }
});
defEffect({
  name: "Emboss", cat: "Stylize", pixel: true,
  params: { amount: P("Amount", "number", 100, { min: 0, max: 100 }), angle: P("Angle", "number", 135, { min: -180, max: 180 }) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, src = cloneData(d), a = p.amount / 100, ar = rad(p.angle), ax = Math.round(Math.cos(ar));
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const o = (y * w + x) * 4, k1 = (y * w + x - ax) * 4, k2 = (y * w + x + ax) * 4;
      const l1 = luminance(src[k1], src[k1 + 1], src[k1 + 2]), l2 = luminance(src[k2], src[k2 + 1], src[k2 + 2]);
      const v = clamp(128 + (l1 - l2) * (1 + a), 0, 255);
      d[o] = d[o + 1] = d[o + 2] = v;
    }
  }
});
defEffect({
  name: "Pixelate", cat: "Stylize", pixel: true,
  params: { size: P("Pixel Size", "number", 12, { min: 2, max: 200, step: 1 }) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, s = Math.max(2, p.size | 0);
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let j = 0; j < s && y + j < h; j++) for (let i = 0; i < s && x + i < w; i++) { const o = ((y + j) * w + (x + i)) * 4; r += d[o]; g += d[o + 1]; b += d[o + 2]; a += d[o + 3]; n++; }
      r /= n; g /= n; b /= n; a /= n;
      for (let j = 0; j < s && y + j < h; j++) for (let i = 0; i < s && x + i < w; i++) { const o = ((y + j) * w + (x + i)) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a; }
    }
  }
});
defEffect({
  name: "Venetian Blinds", cat: "Stylize", pixel: true,
  params: { completion: P("Transition Completion", "number", 20, { min: 0, max: 100 }), band: P("Width", "number", 8, { min: 1, max: 100, step: 1 }), angle: P("Direction", "number", 0, { min: -360, max: 360 }), feather: P("Feather", "number", 1, { min: 0, max: 10 }) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, ar = rad(p.angle), step = p.band * 2, feather = Math.max(1, p.feather);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const proj = Math.abs(Math.cos(ar)) * x + Math.abs(Math.sin(ar)) * y, m = proj % step;
      const t = clamp((m - p.band) / feather, 0, 1), o = (y * w + x) * 4;
      d[o + 3] = d[o + 3] * (1 - (1 - t) * p.completion / 100);
    }
  }
});
defEffect({
  name: "Glow", cat: "Stylize", canvas: true,
  params: { threshold: P("Glow Threshold", "number", 45, { min: 0, max: 100 }), radius: P("Glow Radius", "number", 24, { min: 0, max: 200 }), intensity: P("Glow Intensity", "number", 130, { min: 0, max: 500 }), colorA: P("Color A", "color", "#ffffff"), colorB: P("Color B", "color", "#ffffff") },
  draw(src, dst, ctx, p) {
    ctx.drawImage(src, 0, 0);
    const glow = document.createElement("canvas"); glow.width = src.width; glow.height = src.height;
    const gctx = glow.getContext("2d"); gctx.drawImage(src, 0, 0);
    const im = gctx.getImageData(0, 0, glow.width, glow.height), d = im.data, th = p.threshold * 2.55;
    const [ar, ag, ab] = hexToRgb(p.colorA), [br, bg, bb] = hexToRgb(p.colorB);
    for (let i = 0; i < d.length; i += 4) {
      const l = luminance(d[i], d[i + 1], d[i + 2]), t = clamp((l - th) / Math.max(1, 255 - th), 0, 1);
      d[i] = lerp(ar, br, t); d[i + 1] = lerp(ag, bg, t); d[i + 2] = lerp(ab, bb, t); d[i + 3] = d[i + 3] * t;
    }
    gctx.putImageData(im, 0, 0);
    if (p.radius > 0) { const im2 = gctx.getImageData(0, 0, glow.width, glow.height); gaussBlur(im2, p.radius); gctx.putImageData(im2, 0, 0); }
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = clamp(p.intensity / 100, 0, 3);
    ctx.drawImage(glow, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
});

/* --- Perspective --------------------------------------------------------- */
defEffect({
  name: "Drop Shadow", cat: "Perspective", canvas: true,
  params: { color: P("Shadow Color", "color", "#000000"), opacity: P("Shadow Opacity", "number", 60, { min: 0, max: 100 }), dir: P("Direction", "number", 135, { min: -360, max: 360 }), dist: P("Distance", "number", 14, { min: 0, max: 300 }), soft: P("Softness", "number", 12, { min: 0, max: 200 }) },
  draw(src, dst, ctx, p) {
    const dx = Math.cos(rad(p.dir)) * p.dist, dy = Math.sin(rad(p.dir)) * p.dist;
    const sh = document.createElement("canvas"); sh.width = src.width; sh.height = src.height;
    const sctx = sh.getContext("2d"); sctx.drawImage(src, 0, 0);
    sctx.globalCompositeOperation = "source-in"; sctx.fillStyle = p.color; sctx.fillRect(0, 0, sh.width, sh.height);
    if (p.soft > 0) { const im = sctx.getImageData(0, 0, sh.width, sh.height); gaussBlur(im, p.soft); sctx.putImageData(im, 0, 0); }
    ctx.globalAlpha = p.opacity / 100; ctx.drawImage(sh, dx, dy); ctx.globalAlpha = 1;
    ctx.drawImage(src, 0, 0);
  }
});
defEffect({
  name: "Motion Tile", cat: "Stylize", canvas: true,
  params: { tw: P("Tile Width", "number", 100, { min: 1, max: 200 }), th: P("Tile Height", "number", 100, { min: 1, max: 200 }), phase: P("Tile Phase", "number", 0, { min: -1000, max: 1000 }), mirror: P("Mirror Edges", "checkbox", false) },
  draw(src, dst, ctx, p) {
    const w = src.width, h = src.height, tw = w * p.tw / 100, th = h * p.th / 100;
    const cols = Math.ceil(w / tw) + 1, rows = Math.ceil(h / th) + 1;
    for (let j = -1; j < rows; j++) for (let i = -1; i < cols; i++) {
      ctx.save(); ctx.translate(i * tw + p.phase, j * th);
      if (p.mirror) { const mx = Math.abs(i % 2), my = Math.abs(j % 2); ctx.scale(mx ? -1 : 1, my ? -1 : 1); ctx.translate(mx ? -tw : 0, my ? -th : 0); }
      ctx.drawImage(src, 0, 0, w, h, 0, 0, tw, th);
      ctx.restore();
    }
  }
});

/* --- Keying / Channel ---------------------------------------------------- */
defEffect({
  name: "Luma Key", cat: "Keying", pixel: true,
  params: { threshold: P("Threshold", "number", 50, { min: 0, max: 100 }), tolerance: P("Tolerance", "number", 10, { min: 0, max: 100 }), invert: P("Invert", "checkbox", false) },
  apply(img, p) {
    const d = img.data, th = p.threshold * 2.55, tol = p.tolerance * 2.55;
    for (let i = 0; i < d.length; i += 4) {
      const l = luminance(d[i], d[i + 1], d[i + 2]);
      let a = clamp((l - th) / Math.max(1, tol), 0, 1); if (p.invert) a = 1 - a;
      d[i + 3] = d[i + 3] * a;
    }
  }
});
defEffect({
  name: "Alpha Levels", cat: "Channel", pixel: true,
  params: { inBlack: P("Input Black", "number", 0, { min: 0, max: 255 }), inWhite: P("Input White", "number", 255, { min: 0, max: 255 }), outBlack: P("Output Black", "number", 0, { min: 0, max: 255 }), outWhite: P("Output White", "number", 255, { min: 0, max: 255 }) },
  apply(img, p) { const d = img.data; for (let i = 3; i < d.length; i += 4) { const v = clamp((d[i] - p.inBlack) / Math.max(1, p.inWhite - p.inBlack), 0, 1); d[i] = lerp(p.outBlack, p.outWhite, v); } }
});
defEffect({
  name: "Set Alpha", cat: "Channel", pixel: true,
  params: { value: P("Alpha", "number", 100, { min: 0, max: 100 }) },
  apply(img, p) { const d = img.data; for (let i = 3; i < d.length; i += 4) d[i] = p.value * 2.55; }
});
defEffect({
  name: "Invert Alpha", cat: "Channel", pixel: true,
  params: {},
  apply(img) { const d = img.data; for (let i = 3; i < d.length; i += 4) d[i] = 255 - d[i]; }
});
defEffect({
  name: "Channel Mixer", cat: "Channel", pixel: true,
  params: { rr: P("Red from Red %", "number", 100, { min: -200, max: 200 }), rg: P("Red from Green %", "number", 0, { min: -200, max: 200 }), rb: P("Red from Blue %", "number", 0, { min: -200, max: 200 }), gr: P("Green from Red %", "number", 0, { min: -200, max: 200 }), gg: P("Green from Green %", "number", 100, { min: -200, max: 200 }), gb: P("Green from Blue %", "number", 0, { min: -200, max: 200 }), br: P("Blue from Red %", "number", 0, { min: -200, max: 200 }), bg: P("Blue from Green %", "number", 0, { min: -200, max: 200 }), bb: P("Blue from Blue %", "number", 100, { min: -200, max: 200 }) },
  apply(img, p) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = (r * p.rr + g * p.rg + b * p.rb) / 100;
      d[i + 1] = (r * p.gr + g * p.gg + b * p.gb) / 100;
      d[i + 2] = (r * p.br + g * p.bg + b * p.bb) / 100;
    }
  }
});

/* --- Transition ---------------------------------------------------------- */
defEffect({
  name: "Gradient Wipe", cat: "Transition", canvas: true,
  params: { completion: P("Transition Completion", "number", 50, { min: 0, max: 100 }), angle: P("Wipe Angle", "number", 0, { min: -360, max: 360 }), feather: P("Feather", "number", 40, { min: 0, max: 500 }) },
  draw(src, dst, ctx, p) {
    ctx.drawImage(src, 0, 0);
    const w = src.width, h = src.height, ar = rad(p.angle);
    const g = ctx.createLinearGradient(w / 2 - Math.cos(ar) * w / 2, h / 2 - Math.sin(ar) * h / 2, w / 2 + Math.cos(ar) * w / 2, h / 2 + Math.sin(ar) * h / 2);
    const edge = p.completion / 100, f = clamp(p.feather / Math.max(w, h), 0.001, 0.5);
    g.addColorStop(clamp(edge - f, 0, 1), "rgba(0,0,0,0)");
    g.addColorStop(clamp(edge + f, 0, 1), "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }
});
defEffect({
  name: "Opacity", cat: "Channel", canvas: true,
  params: { opacity: P("Opacity", "number", 100, { min: 0, max: 100 }) },
  draw(src, dst, ctx, p) { ctx.globalAlpha = p.opacity / 100; ctx.drawImage(src, 0, 0); ctx.globalAlpha = 1; }
});
