/* ==========================================================================
   Movix — effects.js : pixel/blur helpers + Blur, Color Correction, Noise
   ========================================================================== */

/* --- pixel helpers ------------------------------------------------------- */
function cloneData(d) { return new Uint8ClampedArray(d); }

function boxBlurH(src, dst, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let i = 0; i < h; i++) {
    let ti = i * w, li = ti, ri = ti + r;
    const fv = [src[ti * 4], src[ti * 4 + 1], src[ti * 4 + 2], src[ti * 4 + 3]];
    const lv = [src[(ti + w - 1) * 4], src[(ti + w - 1) * 4 + 1], src[(ti + w - 1) * 4 + 2], src[(ti + w - 1) * 4 + 3]];
    let val = [(r + 1) * fv[0], (r + 1) * fv[1], (r + 1) * fv[2], (r + 1) * fv[3]];
    for (let j = 0; j < r; j++) { const k = (ti + Math.min(j, w - 1)) * 4; val[0] += src[k]; val[1] += src[k + 1]; val[2] += src[k + 2]; val[3] += src[k + 3]; }
    for (let j = 0; j <= r; j++) {
      const k = ri * 4; val[0] += src[k] - fv[0]; val[1] += src[k + 1] - fv[1]; val[2] += src[k + 2] - fv[2]; val[3] += src[k + 3] - fv[3];
      const d = ti * 4; dst[d] = val[0] * iarr; dst[d + 1] = val[1] * iarr; dst[d + 2] = val[2] * iarr; dst[d + 3] = val[3] * iarr;
      ti++; ri = Math.min(ri + 1, w - 1);
    }
    for (let j = r + 1; j < w - r; j++) {
      const k = ri * 4, m = li * 4; val[0] += src[k] - src[m]; val[1] += src[k + 1] - src[m + 1]; val[2] += src[k + 2] - src[m + 2]; val[3] += src[k + 3] - src[m + 3];
      const d = ti * 4; dst[d] = val[0] * iarr; dst[d + 1] = val[1] * iarr; dst[d + 2] = val[2] * iarr; dst[d + 3] = val[3] * iarr;
      ti++; ri++; li++;
    }
    for (let j = w - r; j < w; j++) {
      const k = ri * 4; val[0] += lv[0] - src[k]; val[1] += lv[1] - src[k + 1]; val[2] += lv[2] - src[k + 2]; val[3] += lv[3] - src[k + 3];
      const d = ti * 4; dst[d] = val[0] * iarr; dst[d + 1] = val[1] * iarr; dst[d + 2] = val[2] * iarr; dst[d + 3] = val[3] * iarr;
      ti++; li++;
    }
  }
}
function boxBlurV(src, dst, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let i = 0; i < w; i++) {
    let ti = i, li = ti, ri = ti + r * w;
    const fv = [src[ti * 4], src[ti * 4 + 1], src[ti * 4 + 2], src[ti * 4 + 3]];
    const lv = [src[(ti + w * (h - 1)) * 4], src[(ti + w * (h - 1)) * 4 + 1], src[(ti + w * (h - 1)) * 4 + 2], src[(ti + w * (h - 1)) * 4 + 3]];
    let val = [(r + 1) * fv[0], (r + 1) * fv[1], (r + 1) * fv[2], (r + 1) * fv[3]];
    for (let j = 0; j < r; j++) { const k = (ti + Math.min(j, h - 1) * w) * 4; val[0] += src[k]; val[1] += src[k + 1]; val[2] += src[k + 2]; val[3] += src[k + 3]; }
    for (let j = 0; j <= r; j++) {
      const k = ri * 4; val[0] += src[k] - fv[0]; val[1] += src[k + 1] - fv[1]; val[2] += src[k + 2] - fv[2]; val[3] += src[k + 3] - fv[3];
      const d = ti * 4; dst[d] = val[0] * iarr; dst[d + 1] = val[1] * iarr; dst[d + 2] = val[2] * iarr; dst[d + 3] = val[3] * iarr;
      ti += w; ri = Math.min(ri + w, (h - 1) * w + i);
    }
    for (let j = r + 1; j < h - r; j++) {
      const k = ri * 4, m = li * 4; val[0] += src[k] - src[m]; val[1] += src[k + 1] - src[m + 1]; val[2] += src[k + 2] - src[m + 2]; val[3] += src[k + 3] - src[m + 3];
      const d = ti * 4; dst[d] = val[0] * iarr; dst[d + 1] = val[1] * iarr; dst[d + 2] = val[2] * iarr; dst[d + 3] = val[3] * iarr;
      ti += w; ri += w; li += w;
    }
    for (let j = h - r; j < h; j++) {
      const k = ri * 4; val[0] += lv[0] - src[k]; val[1] += lv[1] - src[k + 1]; val[2] += lv[2] - src[k + 2]; val[3] += lv[3] - src[k + 3];
      const d = ti * 4; dst[d] = val[0] * iarr; dst[d + 1] = val[1] * iarr; dst[d + 2] = val[2] * iarr; dst[d + 3] = val[3] * iarr;
      ti += w; li += w;
    }
  }
}
function gaussBlur(img, radius) {
  if (radius < 0.6) return img;
  const w = img.width, h = img.height, data = img.data;
  const r = Math.max(1, Math.round(radius));
  const b = [Math.max(1, Math.floor((r - 1) / 2)), Math.max(1, Math.floor(r / 2)), Math.max(1, Math.floor((r + 1) / 2))];
  const tmp = new Uint8ClampedArray(data.length);
  for (const br of b) { boxBlurH(data, tmp, w, h, br); boxBlurV(tmp, data, w, h, br); }
  return img;
}
function hash2(x, y, seed) {
  let n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, seed, oct) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < (oct || 4); i++) { s += amp * valueNoise(x * f, y * f, seed + i * 13); f *= 2; amp *= 0.5; }
  return s;
}
function luminance(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

/* --- Blur & Sharpen ------------------------------------------------------ */
defEffect({
  name: "Gaussian Blur", cat: "Blur & Sharpen", pixel: true,
  params: { blur: P("Blurriness", "number", 12, { min: 0, max: 500, step: 1 }), dim: P("Dimensions", "choice", "Both", { options: ["Both", "Horizontal", "Vertical"] }) },
  apply(img, p) {
    if (p.blur < 0.6) return;
    if (p.dim === "Both") { gaussBlur(img, p.blur); return; }
    const w = img.width, h = img.height, d = img.data, r = Math.max(1, Math.round(p.blur));
    const tmp = new Uint8ClampedArray(d.length);
    if (p.dim === "Horizontal") { boxBlurH(d, tmp, w, h, r); d.set(tmp); }
    else { boxBlurV(d, tmp, w, h, r); d.set(tmp); }
  }
});
defEffect({
  name: "Fast Box Blur", cat: "Blur & Sharpen", pixel: true,
  params: { blur: P("Blur Radius", "number", 8, { min: 0, max: 200, step: 1 }), repeat: P("Iterations", "number", 1, { min: 1, max: 3, step: 1 }) },
  apply(img, p) {
    const r = Math.max(1, Math.round(p.blur)), w = img.width, h = img.height, d = img.data;
    const tmp = new Uint8ClampedArray(d.length);
    for (let i = 0; i < p.repeat; i++) { boxBlurH(d, tmp, w, h, r); boxBlurV(tmp, d, w, h, r); }
  }
});
defEffect({
  name: "Directional Blur", cat: "Blur & Sharpen", canvas: true,
  params: { dir: P("Direction", "number", 0, { min: -360, max: 360 }), len: P("Blur Length", "number", 30, { min: 0, max: 300 }), samples: P("Samples", "number", 16, { min: 2, max: 64, step: 1 }) },
  draw(src, dst, ctx, p) {
    const n = Math.max(2, p.samples | 0), a = rad(p.dir), dx = Math.cos(a), dy = Math.sin(a);
    ctx.globalAlpha = 1 / n;
    for (let i = 0; i < n; i++) { const t = (i / (n - 1) - 0.5) * p.len; ctx.drawImage(src, dx * t, dy * t); }
    ctx.globalAlpha = 1;
  }
});
defEffect({
  name: "Radial Blur", cat: "Blur & Sharpen", canvas: true,
  params: { amount: P("Amount", "number", 12, { min: -100, max: 100 }), cx: P("Center X", "number", 50, { min: -100, max: 200 }), cy: P("Center Y", "number", 50, { min: -100, max: 200 }), samples: P("Samples", "number", 12, { min: 2, max: 40, step: 1 }) },
  draw(src, dst, ctx, p) {
    const n = Math.max(2, p.samples | 0), ox = (p.cx / 100) * src.width, oy = (p.cy / 100) * src.height;
    ctx.globalAlpha = 1 / n;
    for (let i = 0; i < n; i++) {
      const s = 1 + (i / n - 0.5) * (p.amount / 100);
      ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s); ctx.translate(-ox, -oy); ctx.drawImage(src, 0, 0); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
});
defEffect({
  name: "Sharpen", cat: "Blur & Sharpen", pixel: true,
  params: { amount: P("Amount", "number", 50, { min: 0, max: 300 }) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, src = cloneData(d), a = p.amount / 100;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const o = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = src[o + ch] * (1 + 4 * a) - a * (src[o - 4 + ch] + src[o + 4 + ch] + src[o - w * 4 + ch] + src[o + w * 4 + ch]);
        d[o + ch] = v;
      }
    }
  }
});

/* --- Color Correction ---------------------------------------------------- */
defEffect({
  name: "Brightness & Contrast", cat: "Color Correction", pixel: true,
  params: { brightness: P("Brightness", "number", 0, { min: -100, max: 100 }), contrast: P("Contrast", "number", 0, { min: -100, max: 100 }), useLegacy: P("Use Legacy", "checkbox", false) },
  apply(img, p) {
    const d = img.data, br = p.brightness * 2.55, c = (p.contrast / 100) + 1, cf = (1 - c) * 128;
    for (let i = 0; i < d.length; i += 4) { d[i] = d[i] * c + cf + br; d[i + 1] = d[i + 1] * c + cf + br; d[i + 2] = d[i + 2] * c + cf + br; }
  }
});
defEffect({
  name: "Exposure", cat: "Color Correction", pixel: true,
  params: { exposure: P("Exposure", "number", 0, { min: -5, max: 5, step: 0.05 }), offset: P("Offset", "number", 0, { min: -1, max: 1, step: 0.01 }), gamma: P("Gamma", "number", 1, { min: 0.1, max: 4, step: 0.01 }) },
  apply(img, p) {
    const d = img.data, ex = Math.pow(2, p.exposure), off = p.offset * 255, g = 1 / p.gamma, lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.pow(clamp((i * ex + off) / 255, 0, 1), g) * 255;
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  }
});
defEffect({
  name: "Hue/Saturation", cat: "Color Correction", pixel: true,
  params: { hue: P("Master Hue", "number", 0, { min: -180, max: 180 }), sat: P("Master Saturation", "number", 0, { min: -100, max: 100 }), light: P("Master Lightness", "number", 0, { min: -100, max: 100 }), colorize: P("Colorize", "checkbox", false) },
  apply(img, p) {
    const d = img.data, hue = rad(p.hue), sat = 1 + p.sat / 100, light = p.light / 100, cos = Math.cos(hue), sin = Math.sin(hue);
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      if (p.colorize) { const lum = luminance(r * 255, g * 255, b * 255) / 255; r = g = b = lum; }
      let nr = (0.213 + cos * 0.787 - sin * 0.213) * r + (0.715 - cos * 0.715 - sin * 0.715) * g + (0.072 - cos * 0.072 + sin * 0.928) * b;
      let ng = (0.213 - cos * 0.213 + sin * 0.143) * r + (0.715 + cos * 0.285 + sin * 0.140) * g + (0.072 - cos * 0.072 - sin * 0.283) * b;
      let nb = (0.213 - cos * 0.213 - sin * 0.787) * r + (0.715 - cos * 0.715 + sin * 0.715) * g + (0.072 + cos * 0.928 + sin * 0.072) * b;
      const l = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
      nr = l + (nr - l) * sat; ng = l + (ng - l) * sat; nb = l + (nb - l) * sat;
      d[i] = (nr + light) * 255; d[i + 1] = (ng + light) * 255; d[i + 2] = (nb + light) * 255;
    }
  }
});
defEffect({
  name: "Tint", cat: "Color Correction", pixel: true,
  params: { amount: P("Amount to Tint", "number", 100, { min: 0, max: 100 }), black: P("Map Black To", "color", "#000000"), white: P("Map White To", "color", "#ffffff") },
  apply(img, p) {
    const d = img.data, a = p.amount / 100, [br, bg, bb] = hexToRgb(p.black), [wr, wg, wb] = hexToRgb(p.white);
    for (let i = 0; i < d.length; i += 4) {
      const l = luminance(d[i], d[i + 1], d[i + 2]) / 255;
      d[i] = lerp(d[i], lerp(br, wr, l), a); d[i + 1] = lerp(d[i + 1], lerp(bg, wg, l), a); d[i + 2] = lerp(d[i + 2], lerp(bb, wb, l), a);
    }
  }
});
defEffect({
  name: "Tritone", cat: "Color Correction", pixel: true,
  params: { hi: P("Highlights", "color", "#ffc864"), mid: P("Midtones", "color", "#c85a3c"), sh: P("Shadows", "color", "#1a1a3c"), blend: P("Blend With Original", "number", 0, { min: 0, max: 100 }) },
  apply(img, p) {
    const d = img.data, [hr, hg, hb] = hexToRgb(p.hi), [mr, mg, mb] = hexToRgb(p.mid), [sr, sg, sb] = hexToRgb(p.sh), bl = p.blend / 100;
    for (let i = 0; i < d.length; i += 4) {
      const l = luminance(d[i], d[i + 1], d[i + 2]) / 255;
      let r, g, b;
      if (l < 0.5) { const t = l * 2; r = lerp(sr, mr, t); g = lerp(sg, mg, t); b = lerp(sb, mb, t); }
      else { const t = (l - 0.5) * 2; r = lerp(mr, hr, t); g = lerp(mg, hg, t); b = lerp(mb, hb, t); }
      d[i] = lerp(r, d[i], bl); d[i + 1] = lerp(g, d[i + 1], bl); d[i + 2] = lerp(b, d[i + 2], bl);
    }
  }
});
defEffect({
  name: "Levels", cat: "Color Correction", pixel: true,
  params: { inBlack: P("Input Black", "number", 0, { min: 0, max: 255 }), inWhite: P("Input White", "number", 255, { min: 0, max: 255 }), gamma: P("Gamma", "number", 1, { min: 0.1, max: 3, step: 0.01 }), outBlack: P("Output Black", "number", 0, { min: 0, max: 255 }), outWhite: P("Output White", "number", 255, { min: 0, max: 255 }) },
  apply(img, p) {
    const d = img.data, lut = new Uint8ClampedArray(256), ib = p.inBlack, iw = p.inWhite, g = 1 / p.gamma;
    for (let i = 0; i < 256; i++) { let v = clamp((i - ib) / Math.max(1, iw - ib), 0, 1); v = Math.pow(v, g); lut[i] = lerp(p.outBlack, p.outWhite, v); }
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  }
});
defEffect({
  name: "Curves", cat: "Color Correction", pixel: true,
  params: { shadows: P("Shadows", "number", 0, { min: -100, max: 100 }), midtones: P("Midtones", "number", 0, { min: -100, max: 100 }), highlights: P("Highlights", "number", 0, { min: -100, max: 100 }) },
  apply(img, p) {
    const d = img.data, lut = new Uint8ClampedArray(256), s = p.shadows / 100, m = p.midtones / 100, h = p.highlights / 100;
    for (let i = 0; i < 256; i++) { const x = i / 255; lut[i] = clamp(x + s * (1 - x) * (1 - x) + m * 4 * x * (1 - x) + h * x * x, 0, 1) * 255; }
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  }
});
defEffect({
  name: "Color Balance", cat: "Color Correction", pixel: true,
  params: {
    sr: P("Shadow Red", "number", 0, { min: -100, max: 100 }), sg: P("Shadow Green", "number", 0, { min: -100, max: 100 }), sb: P("Shadow Blue", "number", 0, { min: -100, max: 100 }),
    mr: P("Mid Red", "number", 0, { min: -100, max: 100 }), mg: P("Mid Green", "number", 0, { min: -100, max: 100 }), mb: P("Mid Blue", "number", 0, { min: -100, max: 100 }),
    hr: P("High Red", "number", 0, { min: -100, max: 100 }), hg: P("High Green", "number", 0, { min: -100, max: 100 }), hb: P("High Blue", "number", 0, { min: -100, max: 100 })
  },
  apply(img, p) {
    const d = img.data, k = 2.55;
    for (let i = 0; i < d.length; i += 4) {
      const l = luminance(d[i], d[i + 1], d[i + 2]) / 255;
      const sw = Math.max(0, 1 - l * 2), mw = 1 - Math.abs(l - 0.5) * 2, hw = Math.max(0, (l - 0.5) * 2);
      d[i] += (p.sr * sw + p.mr * mw + p.hr * hw) * k;
      d[i + 1] += (p.sg * sw + p.mg * mw + p.hg * hw) * k;
      d[i + 2] += (p.sb * sw + p.mb * mw + p.hb * hw) * k;
    }
  }
});
defEffect({
  name: "Vibrance", cat: "Color Correction", pixel: true,
  params: { amount: P("Vibrance", "number", 0, { min: -100, max: 100 }), saturation: P("Saturation", "number", 0, { min: -100, max: 100 }) },
  apply(img, p) {
    const d = img.data, amt = p.amount / 100, sats = 1 + p.saturation / 100;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = (mx - mn) / 255;
      const k = (1 + amt * (1 - sat)) * sats, l = luminance(r, g, b);
      d[i] = l + (r - l) * k; d[i + 1] = l + (g - l) * k; d[i + 2] = l + (b - l) * k;
    }
  }
});
defEffect({
  name: "Invert", cat: "Color Correction", pixel: true,
  params: { amount: P("Blend With Original", "number", 0, { min: 0, max: 100 }) },
  apply(img, p) { const d = img.data, a = 1 - p.amount / 100; for (let i = 0; i < d.length; i += 4) { d[i] = lerp(255 - d[i], d[i], a); d[i + 1] = lerp(255 - d[i + 1], d[i + 1], a); d[i + 2] = lerp(255 - d[i + 2], d[i + 2], a); } }
});
defEffect({
  name: "Grayscale", cat: "Color Correction", pixel: true,
  params: { amount: P("Amount", "number", 100, { min: 0, max: 100 }) },
  apply(img, p) { const d = img.data, a = p.amount / 100; for (let i = 0; i < d.length; i += 4) { const l = luminance(d[i], d[i + 1], d[i + 2]); d[i] = lerp(d[i], l, a); d[i + 1] = lerp(d[i + 1], l, a); d[i + 2] = lerp(d[i + 2], l, a); } }
});
defEffect({
  name: "Sepia", cat: "Color Correction", pixel: true,
  params: { amount: P("Amount", "number", 100, { min: 0, max: 100 }) },
  apply(img, p) {
    const d = img.data, a = p.amount / 100;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = lerp(r, Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b), a);
      d[i + 1] = lerp(g, Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b), a);
      d[i + 2] = lerp(b, Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b), a);
    }
  }
});
defEffect({
  name: "Threshold", cat: "Color Correction", pixel: true,
  params: { level: P("Level", "number", 128, { min: 0, max: 255 }) },
  apply(img, p) { const d = img.data; for (let i = 0; i < d.length; i += 4) { const v = luminance(d[i], d[i + 1], d[i + 2]) >= p.level ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } }
});

/* --- Noise & Grain ------------------------------------------------------- */
defEffect({
  name: "Noise", cat: "Noise & Grain", pixel: true,
  params: { amount: P("Amount of Noise", "number", 25, { min: 0, max: 100 }), mono: P("Monochromatic", "checkbox", false), anim: P("Animate", "checkbox", true), seed: P("Seed", "number", 1, { min: 0, max: 999 }) },
  apply(img, p) {
    const d = img.data, amt = p.amount * 2.55, seed = (p.anim ? ui.time * 24 : 0) + p.seed;
    for (let i = 0; i < d.length; i += 4) {
      if (p.mono) { const n = (hash2(i, 7, seed) - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      else { d[i] += (hash2(i, 1, seed) - 0.5) * amt; d[i + 1] += (hash2(i, 2, seed) - 0.5) * amt; d[i + 2] += (hash2(i, 3, seed) - 0.5) * amt; }
    }
  }
});
defEffect({
  name: "Fractal Noise", cat: "Noise & Grain", pixel: true,
  params: { scale: P("Scale", "number", 40, { min: 1, max: 400 }), complexity: P("Complexity", "number", 4, { min: 1, max: 8, step: 1 }), evolution: P("Evolution", "number", 0, { min: 0, max: 360 }), contrast: P("Contrast", "number", 100, { min: 0, max: 400 }), brightness: P("Brightness", "number", 0, { min: -100, max: 100 }), opacity: P("Opacity", "number", 100, { min: 0, max: 100 }), type: P("Type", "choice", "Mono", { options: ["Mono", "Color", "Overlay"] }) },
  apply(img, p) {
    const w = img.width, h = img.height, d = img.data, s = p.scale, seed = p.evolution / 360 * 100;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, n = clamp((fbm(x / s, y / s, seed, p.complexity) - 0.5) * (p.contrast / 100) + 0.5 + p.brightness / 100, 0, 1);
      if (p.type === "Overlay") { d[o] = d[o] * n * 2; d[o + 1] = d[o + 1] * n * 2; d[o + 2] = d[o + 2] * n * 2; }
      else if (p.type === "Color") {
        d[o] = lerp(d[o], fbm(x / s, y / s, seed, 3) * 255, p.opacity / 100);
        d[o + 1] = lerp(d[o + 1], fbm(x / s + 5, y / s, seed, 3) * 255, p.opacity / 100);
        d[o + 2] = lerp(d[o + 2], fbm(x / s, y / s + 5, seed, 3) * 255, p.opacity / 100);
        d[o + 3] = Math.max(d[o + 3], p.opacity / 100 * 255);
      } else { const v = n * 255; d[o] = lerp(d[o], v, p.opacity / 100); d[o + 1] = lerp(d[o + 1], v, p.opacity / 100); d[o + 2] = lerp(d[o + 2], v, p.opacity / 100); d[o + 3] = Math.max(d[o + 3], p.opacity / 100 * 255); }
    }
  }
});
