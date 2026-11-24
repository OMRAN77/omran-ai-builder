// Procedural, tileable block textures for the "dhalam" direction.
// Everything is generated at load time from seeded periodic noise: colour + tangent-space
// normal map (+ optional emissive / alpha). Tiles are 256px and span two blocks in world
// space (128px per block face), or 128px for one-block tiles.

import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export { mulberry32 };

const mod = (a, n) => ((a % n) + n) % n;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** Periodic gradient noise + periodic Worley noise. */
export function makePNoise(seed) {
  const r = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  function n(x, y, px, py) {
    let xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    xi = mod(xi, px); yi = mod(yi, py);
    const x1 = (xi + 1) % px, y1 = (yi + 1) % py;
    const h00 = perm[perm[xi & 255] + (yi & 255)], h10 = perm[perm[x1 & 255] + (yi & 255)];
    const h01 = perm[perm[xi & 255] + (y1 & 255)], h11 = perm[perm[x1 & 255] + (y1 & 255)];
    const u = fade(fx), v = fade(fy);
    const a = gx[h00] * fx + gy[h00] * fy, b = gx[h10] * (fx - 1) + gy[h10] * fy;
    const c = gx[h01] * fx + gy[h01] * (fy - 1), d = gx[h11] * (fx - 1) + gy[h11] * (fy - 1);
    const top = a + (b - a) * u, bot = c + (d - c) * u;
    return (top + (bot - top) * v) * 1.5;
  }
  /** u,v in [0,1) tile space; bx/by = lattice cells across the tile for the first octave. */
  function fbm(u, v, bx, oct = 4, gain = 0.5, by = bx) {
    let amp = 1, sum = 0, norm = 0, fx = bx, fy = by;
    for (let i = 0; i < oct; i++) {
      sum += amp * n(u * fx, v * fy, fx, fy);
      norm += amp; amp *= gain; fx *= 2; fy *= 2;
    }
    return sum / norm;
  }
  function ridge(u, v, bx, oct = 4, gain = 0.5, by = bx) {
    let amp = 1, sum = 0, norm = 0, fx = bx, fy = by;
    for (let i = 0; i < oct; i++) {
      const t = 1 - Math.abs(n(u * fx, v * fy, fx, fy));
      sum += amp * t * t; norm += amp; amp *= gain; fx *= 2; fy *= 2;
    }
    return sum / norm;
  }
  /** out = [f1, f2, cellHash 0..1, dx, dy] */
  function worley(u, v, nx, out, jitter = 0.9, ny = nx) {
    const x = u * nx, y = v * ny;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0, ox = 0, oy = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx, cy = yi + dy;
        const wx = mod(cx, nx), wy = mod(cy, ny);
        const h = perm[perm[wx & 255] + (wy & 255)];
        const h2 = perm[h + 71];
        const px = cx + 0.5 + (h / 255 - 0.5) * jitter, py = cy + 0.5 + (h2 / 255 - 0.5) * jitter;
        const ddx = px - x, ddy = py - y;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < f1) { f2 = f1; f1 = d; id = perm[h2 + 13] / 255; ox = ddx; oy = ddy; }
        else if (d < f2) f2 = d;
      }
    }
    out[0] = f1; out[1] = f2; out[2] = id; out[3] = ox; out[4] = oy;
    return out;
  }
  return { n, fbm, ridge, worley, rnd: r };
}

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
function mix3(a, b, t, out) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; }

function dataTex(data, size, { srgb = true, anisotropy = 8 } = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function normalFromHeight(H, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const yu = mod(y + 1, size), yd = mod(y - 1, size);
    for (let x = 0; x < size; x++) {
      const xl = mod(x - 1, size), xr = mod(x + 1, size);
      const dx = (H[y * size + xr] - H[y * size + xl]) * strength;
      const dy = (H[yu * size + x] - H[yd * size + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function blurH(H, size, passes = 1) {
  let a = H, b = new Float32Array(H.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const xl = mod(x - 1, size), xr = mod(x + 1, size), yu = mod(y + 1, size), yd = mod(y - 1, size);
      b[y * size + x] = (a[y * size + x] * 4 + a[y * size + xl] + a[y * size + xr] + a[yu * size + x] + a[yd * size + x]) / 8;
    }
    const t = a; a = b; b = t;
  }
  return a;
}

/**
 * Per-pixel tile. shade(u, v, o) fills o.c (rgb 0..255), o.h (height), o.e (emissive 0..1), o.a (alpha 0..1).
 * Row 0 of the data is v = 0, so "up" in the function is up on a block side.
 */
function pixelTile(size, shade, { normal = 2.2, emissiveColor = null, alpha = false, cavity = 0.0, heightAlpha = false } = {}) {
  const col = new Uint8Array(size * size * 4);
  const H = new Float32Array(size * size);
  const E = emissiveColor ? new Uint8Array(size * size * 4) : null;
  const o = { c: [0, 0, 0], h: 0, e: 0, a: 1 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      o.h = 0; o.e = 0; o.a = 1;
      shade((x + 0.5) / size, (y + 0.5) / size, o);
      const i = (y * size + x) * 4;
      col[i] = o.c[0]; col[i + 1] = o.c[1]; col[i + 2] = o.c[2]; col[i + 3] = alpha ? o.a * 255 : 255;
      H[y * size + x] = o.h;
      if (E) { E[i] = emissiveColor[0] * o.e; E[i + 1] = emissiveColor[1] * o.e; E[i + 2] = emissiveColor[2] * o.e; E[i + 3] = 255; }
    }
  }
  if (cavity > 0) {
    // darken pixels that sit below their blurred surroundings (cheap baked cavity shading)
    const B = blurH(H, size, 6);
    for (let i = 0; i < size * size; i++) {
      const d = clamp01(1 + (H[i] - B[i]) * cavity);
      const k = 0.55 + 0.45 * d;
      col[i * 4] *= k; col[i * 4 + 1] *= k; col[i * 4 + 2] *= k;
    }
  }
  // the moss blend in the shader wants to know where the low parts of the tile are
  if (heightAlpha) for (let i = 0; i < size * size; i++) col[i * 4 + 3] = clamp01(H[i]) * 255;
  const res = { map: dataTex(col, size), normalMap: dataTex(normalFromHeight(H, size, normal * (size / 128)), size, { srgb: false }) };
  if (E) res.emissiveMap = dataTex(E, size);
  res._col = col; res._size = size;
  return res;
}

/** Tile painted with canvas 2D strokes; painter draws through wrapDraw so the result tiles. */
function canvasTile(size, painter, { normal = 1.6, alpha = false, heightBlur = 1, fillRGB = null } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  painter(ctx, size);
  const img = ctx.getImageData(0, 0, size, size).data;
  const col = new Uint8Array(size * size * 4);
  let H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const sy = size - 1 - y; // flip: canvas row 0 is the top
    for (let x = 0; x < size; x++) {
      const si = (sy * size + x) * 4, di = (y * size + x) * 4;
      let r = img[si], g = img[si + 1], b = img[si + 2];
      const a = img[si + 3];
      if (alpha && fillRGB && a < 255) {
        // un-premultiplied colour under transparent texels: keeps mip levels from going black
        const t = a / 255;
        r = r * t + fillRGB[0] * (1 - t); g = g * t + fillRGB[1] * (1 - t); b = b * t + fillRGB[2] * (1 - t);
      }
      col[di] = r; col[di + 1] = g; col[di + 2] = b; col[di + 3] = alpha ? a : 255;
      H[y * size + x] = ((r * 0.3 + g * 0.6 + b * 0.1) / 255) * (alpha ? a / 255 : 1);
    }
  }
  if (heightBlur) H = blurH(H, size, heightBlur);
  const res = { map: dataTex(col, size), normalMap: dataTex(normalFromHeight(H, size, normal * (size / 128)), size, { srgb: false }) };
  res._col = col; res._size = size;
  return res;
}

function wrapDraw(ctx, S, x, y, margin, fn) {
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const px = x + ox * S, py = y + oy * S;
    if (px < -margin || py < -margin || px > S + margin || py > S + margin) continue;
    fn(px, py);
  }
}

const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// ---------------------------------------------------------------------------------------------
// Tile recipes
// ---------------------------------------------------------------------------------------------

function rockShader(N, opts = {}) {
  const { strata = 0, dark = hex(0x3a3f47), light = hex(0x7b8189), warm = hex(0x77716a), cells = 3, lichen = 0.5, closed = 0.3, crackW = 1 } = opts;
  const w = [0, 0, 0, 0, 0], w2 = [0, 0, 0, 0, 0];
  const tmp = [0, 0, 0];
  const crackC = hex(0x121418), lichenC = hex(0x8f9486);
  const hsh = (a) => { const q = Math.sin(a * 127.1 + 3.3) * 43758.5453; return q - Math.floor(q); };
  return (u, v, o) => {
    const wa = strata ? 0.11 : 0.05;
    const wu = u + wa * N.fbm(u + 0.3, v, 3, 3), wv = v + wa * N.fbm(u, v + 0.7, 3, 3);
    const big = N.fbm(u, v, 2, 5, 0.55) * 0.5 + 0.5;
    const mid = N.fbm(u + 0.61, v + 0.17, 7, 3, 0.55) * 0.5 + 0.5;
    const fine = N.fbm(u + 0.13, v + 0.41, 28, 3, 0.6) * 0.5 + 0.5;
    // cliff faces fracture in tall columns; flat tops fracture in polygons
    // cliff faces break into big uneven slabs; flat tops fracture in smaller polygons
    if (strata) N.worley(wu, wv, 2, w, 1.0, 2); else N.worley(wu, wv, cells, w, 0.95);
    N.worley(wu + 0.37, wv + 0.11, strata ? 5 : cells * 3 + 1, w2, 0.95, strata ? 4 : cells * 3 + 1);
    const e1 = w[1] - w[0], e2 = w2[1] - w2[0];
    const open = sstep(0.38, 0.6, N.fbm(u + 0.8, v + 0.5, 3, 3, 0.5) * 0.5 + 0.5);
    const crack = (1 - sstep(0.0, ((strata ? 0.012 : 0.02) + 0.018 * open) * crackW, e1)) * (closed + (1 - closed) * open);
    const crack2 = (1 - sstep(0.0, 0.03 * crackW, e2)) * (w2[2] > 0.62 ? 0.5 : 0.0);
    let bandTone = 0.5, ledge = 0;
    if (strata) {
      // soft bedding: uneven bands that differ in tone, with a thin shadow under each ledge
      const t = v * strata + 0.85 * N.fbm(u, v, 2, 3) + 0.12 * N.fbm(u, v, 9, 2);
      const fl = Math.floor(t), f = t - fl;
      const a0 = hsh(((fl % strata) + strata) % strata), a1 = hsh((((fl + 1) % strata) + strata) % strata);
      bandTone = lerp(a0, a1, sstep(0.75, 1.0, f));
      ledge = (1 - sstep(0.0, 0.07, f)) * 0.5;
    }
    // close-up detail: grain, small pits, and ledges that break up instead of running on
    const grain = N.fbm(u + 0.71, v + 0.93, 56, 2, 0.6) * 0.5 + 0.5;
    const pit = sstep(0.7, 0.84, N.fbm(u + 0.37, v + 0.59, 19, 2, 0.5) * 0.5 + 0.5);
    ledge *= sstep(0.28, 0.55, N.fbm(u + 0.15, v + 0.4, 5, 2, 0.5) * 0.5 + 0.5);
    const rim = sstep(0.03, 0.06, e1) * (1 - sstep(0.06, 0.13, e1)) * open;
    let h = w[2] * 0.2 + big * 0.45 + mid * 0.22 + fine * 0.1 + (strata ? bandTone * 0.35 - ledge * 0.4 : 0) + (grain - 0.5) * 0.16 - pit * 0.22;
    h -= crack * 0.8 + crack2 * 0.25;
    const t = clamp01(big * 0.55 + mid * 0.35 + w[2] * 0.14 + (fine - 0.5) * 0.3 - 0.02 + (bandTone - 0.5) * 0.3);
    mix3(dark, light, t, tmp);
    const wt = clamp01((w[2] - 0.5) * 0.7 + N.fbm(u + 0.5, v + 0.2, 2, 2) * 0.5);
    mix3(tmp, warm, wt * 0.4, tmp);
    const li = sstep(0.64, 0.8, N.fbm(u + 0.9, v + 0.3, 12, 3, 0.6) * 0.5 + 0.5) * lichen;
    mix3(tmp, lichenC, li * 0.45, tmp);
    const gk = (0.9 + (grain - 0.5) * 0.3) * (1 - pit * 0.28) * (1 + rim * 0.1);
    tmp[0] *= gk; tmp[1] *= gk; tmp[2] *= gk;
    const ck = Math.max(crack, crack2 * 0.6, ledge * 0.5);
    mix3(tmp, crackC, ck * 0.85, tmp);
    o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2];
    o.h = h;
  };
}

function mossOver(N, base, { amount = 0.5, c0 = hex(0x1b2118), c1 = hex(0x353d2b), c2 = hex(0x51573c), scale = 3 } = {}) {
  const tmp = [0, 0, 0];
  return (u, v, o) => {
    base(u, v, o);
    const m = N.fbm(u + 0.21, v + 0.63, scale, 4, 0.55) * 0.5 + 0.5;
    const fuzz = N.fbm(u, v, 40, 2, 0.5) * 0.5 + 0.5;
    // moss prefers the low, cracked parts of the rock
    let k = sstep(1 - amount - 0.12, 1 - amount + 0.1, m + (0.5 - o.h) * 0.12 + (fuzz - 0.5) * 0.18);
    if (k <= 0) return;
    const tt = clamp01(fuzz * 0.9 + (m - 0.5));
    mix3(c0, c1, tt, tmp);
    if (fuzz > 0.72) mix3(tmp, c2, (fuzz - 0.72) * 2.2, tmp);
    mix3(o.c, tmp, k, o.c);
    o.h = lerp(o.h, 0.55 + fuzz * 0.35 + m * 0.2, k);
  };
}

function strokes(ctx, S, rnd, count, opt) {
  const { len = [8, 16], width = [1, 1.6], colors, alpha = [0.7, 1], margin = 24, curve = 0 } = opt;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
    const l = lerp(len[0], len[1], rnd());
    const c = colors[(rnd() * colors.length) | 0];
    const al = lerp(alpha[0], alpha[1], rnd());
    const wd = lerp(width[0], width[1], rnd());
    const cv = (rnd() - 0.5) * curve * l;
    wrapDraw(ctx, S, x, y, margin, (px, py) => {
      ctx.strokeStyle = rgb(c, al);
      ctx.lineWidth = wd;
      ctx.beginPath();
      const ex = px + Math.cos(a) * l, ey = py + Math.sin(a) * l;
      ctx.moveTo(px, py);
      if (cv) ctx.quadraticCurveTo((px + ex) / 2 - Math.sin(a) * cv, (py + ey) / 2 + Math.cos(a) * cv, ex, ey);
      else ctx.lineTo(ex, ey);
      ctx.stroke();
    });
  }
}

function noiseFill(ctx, S, N, c0, c1, bx = 4, oct = 5) {
  const img = ctx.createImageData(S, S);
  const d = img.data, tmp = [0, 0, 0];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const t = clamp01(N.fbm(u, v, bx, oct, 0.55) * 0.75 + 0.5);
    mix3(c0, c1, t, tmp);
    const i = (y * S + x) * 4;
    d[i] = tmp[0]; d[i + 1] = tmp[1]; d[i + 2] = tmp[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export function buildTiles() {
  const T = {};
  const S = 256;

  // --- natural rock -------------------------------------------------------------------------
  const Nr = makePNoise(11);
  const rockTop = rockShader(Nr, { cells: 8, closed: 0.0, crackW: 0.8 });
  const rockSide = rockShader(makePNoise(12), { strata: 3, cells: 3, crackW: 0.55 });
  T.rockTop = pixelTile(S, rockTop, { normal: 2.6, cavity: 1.2, heightAlpha: true });
  {
    const N = makePNoise(16), w = [0, 0, 0, 0, 0], tmp = [0, 0, 0];
    const c0 = hex(0x161b13), c1 = hex(0x2f3826), c2 = hex(0x4c5437), dry = hex(0x5a563c);
    T.moss = pixelTile(S, (u, v, o) => {
      const big = N.fbm(u, v, 3, 4, 0.55) * 0.5 + 0.5;
      const fuzz = N.fbm(u + 0.3, v + 0.1, 44, 2, 0.55) * 0.5 + 0.5;
      N.worley(u + 0.02 * N.fbm(u, v, 9, 2), v, 15, w, 0.95);          // cushions
      const cush = 1 - sstep(0.0, 0.6, w[0]);
      mix3(c0, c1, clamp01(cush * 0.55 + fuzz * 0.45 + (big - 0.5) * 0.5), tmp);
      if (fuzz > 0.66) mix3(tmp, c2, (fuzz - 0.66) * 2.4, tmp);
      const d = sstep(0.66, 0.8, N.fbm(u + 0.6, v + 0.8, 6, 3, 0.55) * 0.5 + 0.5);
      mix3(tmp, dry, d * 0.35, tmp);
      o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2];
      o.h = cush * 0.6 + fuzz * 0.3;
    }, { normal: 1.4, cavity: 0.8 });
  }
  T.rockSide = pixelTile(S, rockSide, { normal: 2.8, cavity: 1.2 });
  T.rockSideMoss = pixelTile(S, mossOver(makePNoise(15), rockShader(makePNoise(12), { strata: 3, cells: 3, crackW: 0.55 }), { amount: 0.36 }), { normal: 2.6, cavity: 1.2 });

  // --- frost / thin snow on rock -------------------------------------------------------------
  {
    const N = makePNoise(21), base = rockShader(makePNoise(22), { cells: 3, lichen: 0 });
    const s0 = hex(0x97a4b3), s1 = hex(0xd5dde6), tmp = [0, 0, 0];
    T.snow = pixelTile(S, (u, v, o) => {
      base(u, v, o);
      const m = N.fbm(u, v, 3, 5, 0.55) * 0.5 + 0.5;
      const d = N.fbm(u + 0.4, v + 0.2, 16, 3, 0.5) * 0.5 + 0.5;
      const k = sstep(0.3, 0.52, m + (o.h - 0.4) * 0.25 + (d - 0.5) * 0.12);
      mix3(s0, s1, clamp01(m * 0.6 + d * 0.5), tmp);
      mix3(o.c, tmp, k, o.c);
      o.h = lerp(o.h, 0.6 + m * 0.25 + d * 0.05, k);
    }, { normal: 1.6, cavity: 0.6 });
  }

  // --- forest floor: needle litter ----------------------------------------------------------
  {
    const N = makePNoise(31), rnd = mulberry32(32);
    T.litter = canvasTile(S, (ctx) => {
      noiseFill(ctx, S, N, hex(0x1c1713), hex(0x3d3024), 5, 5);
      // damp darker hollows and a few moss dabs
      for (let i = 0; i < 26; i++) {
        const x = rnd() * S, y = rnd() * S, r = 8 + rnd() * 16;
        const moss = rnd() < 0.45;
        wrapDraw(ctx, S, x, y, 40, (px, py) => {
          const g = ctx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, moss ? 'rgba(52,64,38,0.55)' : 'rgba(10,8,7,0.5)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
        });
      }
      const needles = [hex(0x66503a), hex(0x7d664a), hex(0x54422f), hex(0x94805f), hex(0x433629), hex(0x716048), hex(0x86735a)];
      strokes(ctx, S, rnd, 2600, { len: [7, 15], width: [0.9, 1.5], colors: needles, alpha: [0.55, 0.95] });
      // twigs
      strokes(ctx, S, rnd, 26, { len: [22, 54], width: [1.6, 2.8], colors: [hex(0x2a211a), hex(0x40332a), hex(0x54463a)], alpha: [0.9, 1], margin: 60, curve: 0.25 });
      // small cones / pebbles
      for (let i = 0; i < 18; i++) {
        const x = rnd() * S, y = rnd() * S, r = 2.5 + rnd() * 3.5, stone = rnd() < 0.5;
        wrapDraw(ctx, S, x, y, 10, (px, py) => {
          ctx.fillStyle = stone ? 'rgb(96,98,100)' : 'rgb(58,42,30)';
          ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.75, x, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.beginPath(); ctx.ellipse(px - r * 0.2, py - r * 0.25, r * 0.5, r * 0.3, x, 0, 7); ctx.fill();
        });
      }
      strokes(ctx, S, rnd, 500, { len: [6, 13], width: [0.8, 1.3], colors: needles, alpha: [0.7, 1] });
    }, { normal: 1.5, heightBlur: 1 });
  }

  // --- moss / heath ground for clearings ----------------------------------------------------
  {
    const N = makePNoise(41), rnd = mulberry32(42);
    T.heath = canvasTile(S, (ctx) => {
      noiseFill(ctx, S, N, hex(0x1f2219), hex(0x3b4030), 5, 5);
      strokes(ctx, S, rnd, 900, { len: [3, 7], width: [1.5, 3], colors: [hex(0x4a5038), hex(0x343a2a), hex(0x272b1f), hex(0x565a40)], alpha: [0.35, 0.7] });
      strokes(ctx, S, rnd, 1100, { len: [8, 18], width: [0.8, 1.3], colors: [hex(0x827c62), hex(0x69654d), hex(0x938d74), hex(0x555341), hex(0x716c55)], alpha: [0.45, 0.85], curve: 0.4 });
      for (let i = 0; i < 60; i++) {
        const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 1.6;
        wrapDraw(ctx, S, x, y, 6, (px, py) => { ctx.fillStyle = 'rgba(170,176,150,0.5)'; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill(); });
      }
    }, { normal: 1.4, heightBlur: 1 });
  }

  // --- wet dark soil (sides) -------------------------------------------------------------------
  {
    const N = makePNoise(51), w = [0, 0, 0, 0, 0], tmp = [0, 0, 0];
    const d0 = hex(0x1c1712), d1 = hex(0x41342a), st0 = hex(0x2e2c29), st1 = hex(0x4b4843), root = hex(0x0e0b09);
    T.soil = pixelTile(S, (u, v, o) => {
      const big = N.fbm(u, v, 4, 5, 0.55) * 0.5 + 0.5;
      const fine = N.fbm(u + 0.3, v + 0.8, 32, 2, 0.5) * 0.5 + 0.5;
      const layer = N.fbm(u * 0.5, v, 2, 3, 0.5, 9) * 0.5 + 0.5;       // faint horizontal bedding
      mix3(d0, d1, clamp01(big * 0.7 + layer * 0.35 + (fine - 0.5) * 0.4), tmp);
      let h = big * 0.5 + fine * 0.25 + layer * 0.2;
      N.worley(u, v, 27, w, 0.9);
      if (w[2] > 0.83) {                                                  // small embedded stones
        const rad = 0.12 + (w[2] - 0.83) * 0.9 + 0.08 * N.fbm(u + 0.2, v + 0.9, 30, 2);
        const k = sstep(rad, rad - 0.07, w[0]);
        if (k > 0) {
          const st = [0, 0, 0];
          mix3(st0, st1, clamp01((w[2] - 0.83) * 4 + (fine - 0.5) * 0.5 - w[4] * 1.2), st);
          mix3(tmp, st, k * 0.85, tmp);
          h = lerp(h, 0.8 + (rad - w[0]) * 2, k);
        }
      }
      // root fibres: thin wavy horizontal-ish threads
      const rt = Math.abs(N.fbm(u, v * 1.0, 3, 3, 0.5, 6));
      const rk = sstep(0.02, 0.0, rt) * sstep(0.4, 0.58, N.fbm(u + 0.5, v + 0.5, 3, 2) * 0.5 + 0.5);
      mix3(tmp, root, rk * 0.45, tmp);
      h += rk * 0.7;
      o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2]; o.h = h;
    }, { normal: 2.2, cavity: 1.2 });
  }

  // --- trampled earth (shelter floor, paths) ---------------------------------------------------
  {
    const N = makePNoise(55), w = [0, 0, 0, 0, 0], tmp = [0, 0, 0];
    const d0 = hex(0x2b241d), d1 = hex(0x5a4b3b), st = hex(0x77736c);
    T.path = pixelTile(S, (u, v, o) => {
      const big = N.fbm(u, v, 4, 5, 0.55) * 0.5 + 0.5;
      const fine = N.fbm(u + 0.3, v + 0.8, 40, 2, 0.5) * 0.5 + 0.5;
      mix3(d0, d1, clamp01(big * 0.8 + (fine - 0.5) * 0.5), tmp);
      let h = big * 0.4 + fine * 0.2;
      N.worley(u + 0.04 * N.fbm(u, v, 6, 2), v + 0.04 * N.fbm(u + 0.4, v, 6, 2), 11, w, 0.95);
      if (w[2] > 0.9) { const k = sstep(0.24, 0.12, w[0] + 0.12 * N.fbm(u, v, 22, 2)); mix3(tmp, st, k * 0.6, tmp); h = lerp(h, 0.8, k); }
      // trodden ruts
      const rut = sstep(0.05, 0.0, Math.abs(N.fbm(u, v, 3, 3, 0.5)));
      tmp[0] *= 1 - rut * 0.25; tmp[1] *= 1 - rut * 0.25; tmp[2] *= 1 - rut * 0.25; h -= rut * 0.2;
      o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2]; o.h = h;
    }, { normal: 1.6, cavity: 0.9 });
  }

  // --- lake-shore gravel --------------------------------------------------------------------
  {
    const N = makePNoise(61), w = [0, 0, 0, 0, 0], tmp = [0, 0, 0];
    const g0 = hex(0x43464a), g1 = hex(0x7c7f82), gw = hex(0x756e62), gap = hex(0x16160f);
    T.gravel = pixelTile(S, (u, v, o) => {
      N.worley(u, v, 19, w, 0.95);
      const fine = N.fbm(u, v, 40, 2, 0.5) * 0.5 + 0.5;
      const edge = w[1] - w[0];
      const dome = sstep(0.0, 0.32, edge);
      mix3(g0, g1, clamp01(w[2] * 0.9 + (fine - 0.5) * 0.3 - w[4] * 0.5), tmp);
      if (w[2] > 0.6) mix3(tmp, gw, 0.35, tmp);
      mix3(gap, tmp, sstep(0.0, 0.1, edge), tmp);
      o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2];
      o.h = dome * (0.5 + w[2] * 0.5) + fine * 0.05;
    }, { normal: 2.6, cavity: 0.8 });
  }

  // --- pine bark (one block per tile, wraps around the trunk) -------------------------------
  {
    const N = makePNoise(71), w = [0, 0, 0, 0, 0], tmp = [0, 0, 0];
    const b0 = hex(0x100d0b), b1 = hex(0x3b322a), b2 = hex(0x5a5248);
    T.bark = pixelTile(128, (u, v, o) => {
      const wu = u + 0.035 * N.fbm(u, v, 3, 3, 0.5);
      const rid = N.ridge(wu, v, 7, 3, 0.55, 2);                // long vertical ridges
      const brk = N.ridge(u + 0.4, v + 0.2, 4, 2, 0.5, 9);      // short horizontal breaks
      const fine = N.fbm(u, v, 30, 2, 0.55, 8) * 0.5 + 0.5;
      const plate = sstep(0.42, 0.74, rid) * (1 - sstep(0.78, 0.95, brk) * 0.8);
      N.worley(wu, v, 5, w, 0.9, 2);
      mix3(b0, b1, clamp01(plate * 0.75 + (fine - 0.5) * 0.5 + (w[2] - 0.5) * 0.3), tmp);
      if (w[2] > 0.6) mix3(tmp, b2, plate * (w[2] - 0.6) * 1.6, tmp);
      o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2];
      o.h = plate * 0.9 + fine * 0.15;
    }, { normal: 3.0, cavity: 0.9 });
    // cut end: rings
    const N2 = makePNoise(72);
    const r0 = hex(0x8c7556), r1 = hex(0x5e4b35), rim = hex(0x2a221b);
    T.barkTop = pixelTile(128, (u, v, o) => {
      const dx = u - 0.5 + 0.02 * N2.fbm(u, v, 3, 2), dy = v - 0.5 + 0.02 * N2.fbm(u + 0.5, v, 3, 2);
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const ang = Math.atan2(dy, dx);
      const ring = Math.sin(d * 34 + N2.fbm(u, v, 4, 3) * 3) * 0.5 + 0.5;
      const fine = N2.fbm(u, v, 30, 2) * 0.5 + 0.5;
      mix3(r0, r1, clamp01(ring * 0.6 + (fine - 0.5) * 0.4 + d * 0.25), tmp);
      const crack = sstep(0.06, 0.0, Math.abs(Math.sin(ang * 3.5 + 1.3))) * sstep(0.1, 0.5, d) * 0.7;
      mix3(tmp, rim, crack, tmp);
      const sq = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
      const rk = sstep(0.8, 0.9, sq + (fine - 0.5) * 0.08);
      mix3(tmp, rim, rk, tmp);
      o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2];
      o.h = ring * 0.25 - crack * 0.5 + rk * 0.4;
    }, { normal: 1.6 });
    // stripped, weathered palisade log (a prop, see props.js): wraps once around the log and spans
    // four blocks of height, so no knot or split ever repeats up a stake
    const N3 = makePNoise(73);
    const s0 = hex(0x221b16), s1 = hex(0x54463a), s2 = hex(0x74665a), sg = hex(0x64605a), spl = hex(0x0b0907), kn = hex(0x1a130e);
    T.log = pixelTile(S, (u, v, o) => {
      const wu = u + 0.006 * N3.fbm(u, v, 3, 2, 0.5, 2);
      const fib = N3.fbm(wu, v, 46, 3, 0.55, 1) * 0.5 + 0.5;                 // long straight fibres
      const fib2 = N3.fbm(wu + 0.3, v, 100, 2, 0.5, 2) * 0.5 + 0.5;
      const blot = N3.fbm(u + 0.2, v + 0.4, 4, 3, 0.5, 3) * 0.5 + 0.5;       // weather stains
      mix3(s0, s1, clamp01(fib * 0.6 + fib2 * 0.3 + blot * 0.3 - 0.1), tmp);
      if (blot > 0.58) mix3(tmp, s2, (blot - 0.58) * 1.3, tmp);
      mix3(tmp, sg, sstep(0.5, 0.8, N3.fbm(u + 0.7, v + 0.2, 3, 2, 0.5, 2) * 0.5 + 0.5) * 0.45, tmp);   // silvered patches
      // a few narrow drying splits of finite length
      const sp = Math.abs(N3.fbm(u, v * 0.5, 5, 2, 0.5, 1));
      const split = sstep(0.011, 0.0, sp) * sstep(0.4, 0.62, N3.fbm(u + 0.4, v, 2, 2, 0.5, 3) * 0.5 + 0.5);
      mix3(tmp, spl, split * 0.9, tmp);
      // the odd small knot
      N3.worley(u, v, 3, w, 0.9, 4);
      const knot = w[2] > 0.7 ? sstep(0.17, 0.05, Math.hypot(w[3] * 1.5, w[4])) : 0;
      mix3(tmp, kn, knot * 0.8, tmp);
      o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2];
      o.h = fib * 0.5 + fib2 * 0.25 - split * 0.9 - knot * 0.3;
    }, { normal: 2.6, cavity: 0.8 });
  }

  // --- pine needles (cut-out) ------------------------------------------------------------------
  {
    const rnd = mulberry32(81);
    const greens = [hex(0x1f2f28), hex(0x283c32), hex(0x314a3b), hex(0x3a5544), hex(0x263a35)];
    const tips = [hex(0x3f5a49), hex(0x486452), hex(0x3a5345)];
    T.needles = canvasTile(S, (ctx) => {
      ctx.clearRect(0, 0, S, S);
      // dark inner mass
      for (let i = 0; i < 120; i++) {
        const x = rnd() * S, y = rnd() * S, r = 16 + rnd() * 22;
        wrapDraw(ctx, S, x, y, 40, (px, py) => { ctx.fillStyle = 'rgba(20,31,26,1)'; ctx.beginPath(); ctx.ellipse(px, py, r, r * (0.5 + rnd() * 0.4), rnd() * 3, 0, 7); ctx.fill(); });
      }
      // sprigs: a twig with needles fanning out
      ctx.lineCap = 'round';
      for (let i = 0; i < 210; i++) {
        const x = rnd() * S, y = rnd() * S, a = Math.PI * 0.5 + (rnd() - 0.5) * 2.4, L = 22 + rnd() * 26;
        const base = greens[(rnd() * greens.length) | 0];
        const tip = rnd() < 0.3 ? tips[(rnd() * tips.length) | 0] : base;
        const seedR = mulberry32((rnd() * 1e9) | 0);
        wrapDraw(ctx, S, x, y, 60, (px, py) => {
          const r2 = mulberry32(((x * 977) | 0) + 1);
          const ex = px + Math.cos(a) * L, ey = py + Math.sin(a) * L;
          ctx.strokeStyle = 'rgba(40,30,22,0.9)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
          const n = 13;
          for (let k = 0; k < n; k++) {
            const t = k / (n - 1);
            const bx = px + (ex - px) * t, by = py + (ey - py) * t;
            const nl = (8 + r2() * 5) * (1 - t * 0.45);
            for (const s of [-1, 1]) {
              const na = a + s * (0.75 + r2() * 0.35);
              ctx.strokeStyle = rgb(t > 0.6 ? tip : base, 1);
              ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(na) * nl, by + Math.sin(na) * nl); ctx.stroke();
            }
          }
          void seedR;
        });
      }
    }, { normal: 1.2, alpha: true, fillRGB: hex(0x24362e), heightBlur: 1 });
  }

  // --- keep masonry ---------------------------------------------------------------------------
  function brickShader(N, { flag = false } = {}) {
    const tmp = [0, 0, 0], w = [0, 0, 0, 0, 0];
    const c0 = hex(0x4a4947), c1 = hex(0x85827c), cw = hex(0x82796a), mortar = hex(0x201f1d), stain = hex(0x2b2c2a);
    const rowsY = [0, 0.27, 0.5, 0.79, 1];
    const hsh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
    return (u, v, o) => {
      const big = N.fbm(u, v, 3, 4, 0.55) * 0.5 + 0.5;
      const fine = N.fbm(u + 0.2, v + 0.6, 36, 2, 0.5) * 0.5 + 0.5;
      const chip = (N.fbm(u + 0.7, v + 0.1, 9, 3, 0.6) * 0.5 + 0.5);
      let e, sid;
      if (flag) {
        // flagstones for wall tops / floors
        N.worley(u + 0.03 * N.fbm(u, v, 4, 2), v + 0.03 * N.fbm(u + 0.5, v, 4, 2), 3, w, 0.8);
        e = (w[1] - w[0]) * 0.1; sid = w[2];
      } else {
        const wob = 0.004 * N.fbm(u, v, 5, 2);
        const vv = mod(v + wob, 1);
        let row = 0; while (row < 3 && vv >= rowsY[row + 1]) row++;
        const y0 = rowsY[row], y1 = rowsY[row + 1];
        const count = 2 + (hsh(row, 3) > 0.55 ? 1 : 0);
        const uu = mod(u + wob + hsh(row, 7), 1) * count;
        const col = Math.floor(uu);
        const split = hsh(row * 13 + col, 5);
        let fx = uu - col, wdt = 1, idx = col * 2;
        if (split > 0.45) {                                   // some stones are split in two
          const sp = 0.35 + (split - 0.45) * 0.6;
          if (fx > sp) { fx -= sp; wdt = 1 - sp; idx += 1; } else wdt = sp;
        }
        sid = hsh(row * 31 + idx, 17);
        const ex = Math.min(fx, wdt - fx) / count, ey = Math.min(vv - y0, y1 - vv);
        e = Math.min(ex, ey);
      }
      e -= chip * 0.011;
      const inside = sstep(0.0015, 0.011, e);
      mix3(c0, c1, clamp01(sid * 0.7 + big * 0.35 + (fine - 0.5) * 0.3), tmp);
      if (sid > 0.55) mix3(tmp, cw, (sid - 0.55) * 1.3, tmp);
      N.worley(u, v, 4, w, 0.95);
      const crack = sid < 0.34 ? 1 - sstep(0.0, 0.022, w[1] - w[0]) : 0;
      mix3(tmp, mortar, crack * 0.8, tmp);
      const st = sstep(0.45, 0.8, N.fbm(u, v, 9, 3, 0.5, 2) * 0.5 + 0.5);
      mix3(tmp, stain, st * 0.42, tmp);
      // worn, lighter arrises
      const arr = sstep(0.03, 0.008, e) * inside;
      tmp[0] += arr * 14; tmp[1] += arr * 14; tmp[2] += arr * 14;
      mix3(mortar, tmp, inside, tmp);
      o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2];
      o.h = inside * (0.5 + sid * 0.3 + sstep(0.0, 0.04, e) * 0.25) + fine * 0.08 - crack * 0.4 + big * 0.12;
    };
  }
  T.brick = pixelTile(S, brickShader(makePNoise(91)), { normal: 2.8, cavity: 1.0 });
  T.brickMoss = pixelTile(S, mossOver(makePNoise(93), brickShader(makePNoise(91)), { amount: 0.5, scale: 3 }), { normal: 2.6, cavity: 1.0 });
  T.brickTop = pixelTile(S, mossOver(makePNoise(95), brickShader(makePNoise(94), { flag: true }), { amount: 0.58, scale: 3 }), { normal: 2.4, cavity: 1.0 });

  // --- weathered planks -----------------------------------------------------------------------
  {
    const N = makePNoise(101), tmp = [0, 0, 0];
    const p0 = hex(0x211c18), p1 = hex(0x4f463c), p2 = hex(0x6a6257), gap = hex(0x0b0907);
    const hsh = (a) => { const s = Math.sin(a * 91.7) * 43758.5453; return s - Math.floor(s); };
    T.planks = pixelTile(S, (u, v, o) => {
      const rows = 7;
      const r = Math.floor(v * rows), fy = v * rows - r;
      const id = hsh(r + 1);
      const grain = N.fbm(u + id * 3.1, v, 3, 4, 0.6, 48) * 0.5 + 0.5;
      const blot = N.fbm(u + id, v + 0.5, 5, 3) * 0.5 + 0.5;
      mix3(p0, p1, clamp01(grain * 0.7 + blot * 0.35 + (id - 0.5) * 0.3), tmp);
      if (blot > 0.6) mix3(tmp, p2, (blot - 0.6) * 1.4, tmp);
      const e = Math.min(fy, 1 - fy);
      const butt = Math.abs(mod(u + id * 0.77, 1) - 0.5);   // one butt joint per board
      const ins = sstep(0.02, 0.09, e) * sstep(0.002, 0.007, butt);
      mix3(gap, tmp, ins, tmp);
      // nails
      const nx = Math.abs(mod(u + id * 0.77, 1) - 0.46), ny = Math.abs(fy - 0.5);
      const nail = sstep(0.012, 0.006, Math.sqrt(nx * nx + (ny * 0.14) * (ny * 0.14)));
      mix3(tmp, hex(0x15130f), nail, tmp);
      o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2];
      o.h = ins * (0.6 + grain * 0.3) + (id - 0.5) * 0.2;
    }, { normal: 2.4, cavity: 0.7 });
  }

  // --- ores ---------------------------------------------------------------------------------
  {
    const N = makePNoise(111), base = rockShader(makePNoise(112), { strata: 3, cells: 3, lichen: 0.2, crackW: 0.55 });
    const o0 = hex(0x2a2320), o1 = hex(0x4c3a30), o2 = hex(0x716256), stainC = hex(0x473b34), tmp = [0, 0, 0], wi = [0, 0, 0, 0, 0];
    T.oreIron = pixelTile(S, (u, v, o) => {
      base(u, v, o);
      // a broad band where the ore lies, following the bedding
      const band = sstep(0.42, 0.62, N.fbm(u, v * 1.6 + 0.2, 2, 3, 0.5, 3) * 0.5 + 0.5);
      const fine = N.fbm(u + 0.3, v + 0.3, 30, 2) * 0.5 + 0.5;
      mix3(o.c, stainC, band * 0.3, o.c);                               // rust-stained rock around it
      N.worley(u + 0.02 * N.fbm(u, v, 6, 2), v, 17, wi, 0.95);
      if (wi[2] < 0.45) return;
      const k = band * sstep(0.4, 0.3, Math.max(Math.abs(wi[3]), Math.abs(wi[4]) * 1.25) + (fine - 0.5) * 0.16);
      if (k <= 0) return;
      const f = clamp01(0.3 + (wi[2] - 0.45) * 1.2 - wi[4] * 1.4 + (fine - 0.5) * 0.4);
      mix3(o0, o1, f, tmp);
      if (f > 0.7) mix3(tmp, o2, (f - 0.7) * 2.2, tmp);
      mix3(o.c, tmp, clamp01(k), o.c);
      o.h += clamp01(k) * (0.25 + 0.2 * f);
    }, { normal: 2.6, cavity: 1.0 });
    // glowing ore: a fissure with a hot thread deep inside and angular crystal shards on its walls
    const N2 = makePNoise(113), base2 = rockShader(makePNoise(114), { strata: 3, cells: 3, lichen: 0.1, dark: hex(0x272b31), light: hex(0x585e66) });
    const g0 = hex(0x12353c), g1 = hex(0x86d2cc), gw = hex(0xd6faf5), fis = hex(0x06080a), w = [0, 0, 0, 0, 0], w2 = [0, 0, 0, 0, 0];
    T.oreGlow = pixelTile(S, (u, v, o) => {
      base2(u, v, o);
      const wu = u + 0.05 * N2.fbm(u + 0.2, v, 4, 2), wv = v + 0.05 * N2.fbm(u, v + 0.6, 4, 2);
      N2.worley(wu, wv, 4, w, 1.0);
      const e = w[1] - w[0];
      const run = sstep(0.4, 0.56, N2.fbm(u + 0.7, v + 0.3, 3, 3) * 0.5 + 0.5);
      const seam = (1 - sstep(0.0, 0.06, e)) * run;
      const core = (1 - sstep(0.0, 0.022, e)) * run;
      N2.worley(u, v, 24, w2, 0.95);
      const near = (1 - sstep(0.035, 0.17, e)) * run;
      const shard = near * (w2[2] > 0.42 ? 1 : 0) * sstep(0.0, 0.1, w2[1] - w2[0]);
      mix3(o.c, fis, seam * 0.9, o.c);
      o.h -= seam * 0.7;
      let f = 0;
      if (shard > 0) {
        f = clamp01(0.2 + w2[2] * 0.9 - w2[4] * 1.5);               // every facet catches the light differently
        mix3(g0, g1, f, tmp);
        mix3(o.c, tmp, shard, o.c);
        o.h += shard * (0.6 + 0.5 * f);
      }
      mix3(o.c, gw, core * 0.9, o.c);
      o.e = clamp01(core + shard * (0.1 + 0.55 * f * f) + seam * 0.16);
    }, { normal: 2.8, cavity: 0.8, emissiveColor: hex(0x9fe6e0) });
  }

  // --- charred / ash ground around the fire -----------------------------------------------------
  {
    const N = makePNoise(121), tmp = [0, 0, 0];
    const a0 = hex(0x0f0e0d), a1 = hex(0x3a3836), a2 = hex(0x6c6a66);
    T.ash = pixelTile(S, (u, v, o) => {
      const big = N.fbm(u, v, 5, 5, 0.6) * 0.5 + 0.5, fine = N.fbm(u, v, 48, 2) * 0.5 + 0.5;
      mix3(a0, a1, clamp01(big + (fine - 0.5) * 0.4), tmp);
      if (fine > 0.7) mix3(tmp, a2, (fine - 0.7) * 2, tmp);
      o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2]; o.h = big * 0.4 + fine * 0.3;
    }, { normal: 1.5 });
  }

  // --- water ripple normals (colour unused) -----------------------------------------------------
  {
    const N = makePNoise(131);
    T.water = pixelTile(S, (u, v, o) => {
      o.c[0] = o.c[1] = o.c[2] = 255;
      o.h = N.fbm(u, v, 4, 4, 0.5) * 0.6 + N.ridge(u + 0.3, v + 0.1, 6, 3, 0.5) * 0.4;
    }, { normal: 1.1 });
  }

  // --- small plants (cross quads) --------------------------------------------------------------
  {
    const rnd = mulberry32(141);
    const plant = (painter, fill) => canvasTile(128, (ctx) => { ctx.clearRect(0, 0, 128, 128); painter(ctx); }, { alpha: true, fillRGB: fill, normal: 0.6 });
    T.fern = plant((ctx) => {
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.3 + (rnd() - 0.5) * 0.15, L = 78 + rnd() * 34;
        const cx = 64, cy = 126;
        const g = [hex(0x2b3d2a), hex(0x3a4f33), hex(0x22331f)][i % 3];
        ctx.strokeStyle = rgb(g); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.95 + Math.abs(i - 3) * 6;
        ctx.quadraticCurveTo(cx + Math.cos(a) * L * 0.5, cy + Math.sin(a) * L * 0.75, ex, ey); ctx.stroke();
        for (let k = 2; k < 14; k++) {
          const t = k / 14;
          const bx = cx + (ex - cx) * t, by = cy + (ey - cy) * t - Math.sin(t * Math.PI) * 8;
          const ll = 11 * (1 - t * 0.6);
          for (const s of [-1, 1]) {
            ctx.lineWidth = 2.6;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + s * 1.25) * ll, by + Math.sin(a + s * 1.25) * ll); ctx.stroke();
          }
        }
      }
    }, hex(0x2b3d2a));
    T.dryGrass = plant((ctx) => {
      ctx.lineCap = 'round';
      const cs = [hex(0x85805f), hex(0x6a674e), hex(0x979274), hex(0x545340), hex(0x747058)];
      for (let i = 0; i < 46; i++) {
        const x = 20 + rnd() * 88, lean = (x - 64) / 64 * 26 + (rnd() - 0.5) * 22, h = 50 + rnd() * 70;
        ctx.strokeStyle = rgb(cs[(rnd() * cs.length) | 0]); ctx.lineWidth = 1.6 + rnd() * 1.4;
        ctx.beginPath(); ctx.moveTo(x, 128); ctx.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h); ctx.stroke();
      }
    }, hex(0x7b7450));
    T.reeds = plant((ctx) => {
      ctx.lineCap = 'round';
      const cs = [hex(0x4d5137), hex(0x6a6a48), hex(0x3b4230), hex(0x7d7852)];
      for (let i = 0; i < 16; i++) {
        const x = 16 + rnd() * 96, lean = (rnd() - 0.5) * 22, h = 84 + rnd() * 42;
        ctx.strokeStyle = rgb(cs[(rnd() * cs.length) | 0]); ctx.lineWidth = 2.4 + rnd() * 1.2;
        ctx.beginPath(); ctx.moveTo(x, 128); ctx.quadraticCurveTo(x + lean * 0.2, 128 - h * 0.6, x + lean, 128 - h); ctx.stroke();
        if (rnd() < 0.45) { ctx.strokeStyle = 'rgb(46,34,26)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + lean, 128 - h + 2); ctx.lineTo(x + lean * 0.93, 128 - h + 16); ctx.stroke(); }
      }
    }, hex(0x4d5137));
  }

  return T;
}

// ---------------------------------------------------------------------------------------------
// Small detail textures for characters and props (cloth, leather, iron, fur, bone, ...)
// ---------------------------------------------------------------------------------------------
export function buildDetailTextures() {
  const D = {};
  const S = 128;
  const mk = (seed, fn, opts) => pixelTile(S, fn(makePNoise(seed)), opts);
  const tmp = [0, 0, 0];
  const grey = (a, b) => (N) => (u, v, o) => {
    const big = N.fbm(u, v, 3, 4, 0.55) * 0.5 + 0.5, fine = N.fbm(u + 0.4, v + 0.1, 28, 2, 0.5) * 0.5 + 0.5;
    const t = clamp01(big * a + fine * b + (1 - a - b) * 0.5);
    const k = 150 + t * 105;
    o.c[0] = o.c[1] = o.c[2] = k; o.h = t;
  };
  // woven cloth: fine cross-hatch
  D.cloth = mk(201, (N) => (u, v, o) => {
    const wx = Math.sin(u * Math.PI * 2 * 44) * 0.5 + 0.5, wy = Math.sin(v * Math.PI * 2 * 44) * 0.5 + 0.5;
    const weave = (wx * wy) * 0.6 + 0.4;
    const big = N.fbm(u, v, 3, 4, 0.55) * 0.5 + 0.5;
    const fold = N.fbm(u, v, 2, 2, 0.5, 5) * 0.5 + 0.5;
    const k = 120 + 135 * clamp01(weave * 0.45 + big * 0.45 + fold * 0.2);
    o.c[0] = o.c[1] = o.c[2] = k; o.h = weave * 0.3 + big * 0.5;
  }, { normal: 1.2 });
  // leather: mottled with creases
  D.leather = mk(202, (N) => { const w = [0, 0, 0, 0, 0]; return (u, v, o) => {
    const big = N.fbm(u, v, 3, 4, 0.55) * 0.5 + 0.5, fine = N.fbm(u, v, 30, 2) * 0.5 + 0.5;
    N.worley(u + 0.03 * N.fbm(u, v, 4, 2), v, 9, w, 0.9);
    const crease = 1 - sstep(0.0, 0.07, w[1] - w[0]);
    const k = 130 + 125 * clamp01(big * 0.6 + fine * 0.3 + 0.1) - crease * 60;
    o.c[0] = o.c[1] = o.c[2] = Math.max(40, k); o.h = big * 0.5 - crease * 0.5 + fine * 0.1;
  }; }, { normal: 1.6 });
  // iron: pitted, scratched, slightly rusty in hollows
  D.iron = mk(203, (N) => (u, v, o) => {
    const big = N.fbm(u, v, 3, 4, 0.55) * 0.5 + 0.5, fine = N.fbm(u, v, 34, 2, 0.6) * 0.5 + 0.5;
    const scr = sstep(0.03, 0.0, Math.abs(N.fbm(u * 1.0, v, 3, 2, 0.5, 14)));
    const pit = sstep(0.68, 0.8, fine);
    const rust = sstep(0.55, 0.8, N.fbm(u + 0.5, v + 0.2, 5, 3) * 0.5 + 0.5);
    let k = 135 + 110 * clamp01(big * 0.6 + 0.2 + scr * 0.4) - pit * 55;
    o.c[0] = k + rust * 26; o.c[1] = k - rust * 6; o.c[2] = k - rust * 26; o.h = big * 0.4 - pit * 0.5 + scr * 0.2;
  }, { normal: 1.4 });
  // fur: fine strands running along v, softly clumped
  D.fur = mk(204, (N) => (u, v, o) => {
    const wu = u + 0.012 * N.fbm(u, v, 5, 2);
    const st = N.fbm(wu, v, 44, 3, 0.6, 9) * 0.5 + 0.5;
    const clump = N.fbm(wu, v, 9, 2, 0.5, 4) * 0.5 + 0.5;
    const big = N.fbm(u, v, 3, 3, 0.5) * 0.5 + 0.5;
    const k = 158 + 97 * clamp01(st * 0.5 + clump * 0.3 + big * 0.3 - 0.05);
    o.c[0] = o.c[1] = o.c[2] = k; o.h = st * 0.6 + clump * 0.4;
  }, { normal: 1.3 });
  // bone: porous, stained, a few hairline cracks
  D.bone = mk(205, (N) => { const w = [0, 0, 0, 0, 0]; return (u, v, o) => {
    const big = N.fbm(u, v, 3, 4, 0.55) * 0.5 + 0.5, fine = N.fbm(u, v, 40, 2) * 0.5 + 0.5;
    N.worley(u + 0.05 * N.fbm(u, v, 5, 2), v, 3, w, 0.95);
    const crack = (1 - sstep(0.0, 0.02, w[1] - w[0])) * sstep(0.5, 0.7, N.fbm(u + 0.3, v, 3, 2) * 0.5 + 0.5);
    const pore = sstep(0.72, 0.84, fine);
    const k = 175 + 80 * clamp01(big * 0.75 + 0.15) - crack * 60 - pore * 30;
    o.c[0] = k; o.c[1] = k * 0.985; o.c[2] = k * 0.945; o.h = big * 0.4 - crack * 0.4 - pore * 0.25;
  }; }, { normal: 1.2 });
  // feathers: small overlapping vanes
  D.feather = mk(206, (N) => { const w = [0, 0, 0, 0, 0]; return (u, v, o) => {
    N.worley(u, v, 14, w, 0.55, 22);
    const e = sstep(0.0, 0.25, w[1] - w[0]);
    const big = N.fbm(u, v, 3, 3) * 0.5 + 0.5;
    const k = 150 + 105 * clamp01(e * 0.4 + (w[4] + 0.5) * 0.3 + big * 0.3);
    o.c[0] = o.c[1] = o.c[2] = k; o.h = e * 0.4 + w[4] * 0.5;
  }; }, { normal: 1.2 });
  // rough wood grain (axe handle, posts)
  D.wood = mk(207, (N) => (u, v, o) => {
    const g = N.fbm(u, v, 22, 3, 0.6, 2) * 0.5 + 0.5, big = N.fbm(u, v, 3, 3) * 0.5 + 0.5;
    const k = 115 + 140 * clamp01(g * 0.6 + big * 0.4);
    o.c[0] = o.c[1] = o.c[2] = k; o.h = g * 0.7;
  }, { normal: 1.6 });
  // shadow stuff: matte with faint vertical tatters
  D.shade = mk(208, (N) => (u, v, o) => {
    const st = N.fbm(u, v, 14, 3, 0.6, 2) * 0.5 + 0.5, big = N.fbm(u, v, 3, 3) * 0.5 + 0.5;
    const k = 120 + 135 * clamp01(st * 0.55 + big * 0.5);
    o.c[0] = o.c[1] = o.c[2] = k; o.h = st * 0.6 + big * 0.3;
  }, { normal: 1.5 });
  D.plain = mk(209, grey(0.6, 0.3), { normal: 1.0 });
  void tmp;
  return D;
}

/** Pine bough strip: opaque needles at the top, ragged hanging tips at the bottom. Wraps in u. */
export function buildBoughTexture() {
  const W = 512, Hh = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const rnd = mulberry32(88);
  const greens = [hex(0x15211d), hex(0x1c2c25), hex(0x25382e), hex(0x2c4136), hex(0x1a2927), hex(0x263427)];
  const tips = [hex(0x3b5445), hex(0x47604f), hex(0x33483e), hex(0x4d6558)];
  const wrapX = (x, margin, fn) => { for (const o of [-W, 0, W]) { if (x + o < -margin || x + o > W + margin) continue; fn(x + o); } };
  ctx.fillStyle = 'rgb(15,24,20)';
  ctx.fillRect(0, 0, W, Hh * 0.3);
  // dark inner mass with an uneven lower edge
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W, y = Hh * (0.26 + rnd() * 0.3), r = 20 + rnd() * 30;
    wrapX(x, 80, (px) => { ctx.fillStyle = 'rgb(14,23,19)'; ctx.beginPath(); ctx.ellipse(px, y, r * 0.75, r, 0, 0, 7); ctx.fill(); });
  }
  ctx.lineCap = 'round';
  // hanging sprays: a drooping twig feathered with needles, longer ones reaching the bottom edge
  const spray = (px, y0, L, sway, base, tip, s, wd) => {
    const r2 = mulberry32(s);
    const ex = px + sway, ey = Math.min(Hh - 3, y0 + L);
    const mx = px + sway * 0.25, my = y0 + L * 0.55;
    ctx.strokeStyle = 'rgba(34,27,21,0.95)'; ctx.lineWidth = wd * 1.1;
    ctx.beginPath(); ctx.moveTo(px, y0); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    const n = Math.max(9, Math.round(L / 6.5));
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const bx = (1 - t) * (1 - t) * px + 2 * t * (1 - t) * mx + t * t * ex, by = (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * my + t * t * ey;
      const a = Math.atan2(ey - y0, ex - px) + (t - 0.5) * 0.2;
      const nl = (15 + r2() * 11) * (1 - t * 0.55);
      for (const sg of [-1, 1]) {
        const na = a + sg * (0.55 + r2() * 0.4);
        ctx.strokeStyle = rgb(t > 0.5 ? tip : base, 1); ctx.lineWidth = wd;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(na) * nl, by + Math.sin(na) * nl); ctx.stroke();
      }
    }
  };
  for (let i = 0; i < 230; i++) {
    const x = rnd() * W, y0 = Hh * (0.02 + rnd() * 0.5), L = Hh * (0.2 + rnd() * 0.4), sway = (rnd() - 0.5) * 34;
    const base = greens[(rnd() * greens.length) | 0], tip = rnd() < 0.55 ? tips[(rnd() * tips.length) | 0] : base;
    const s = (rnd() * 1e9) | 0, wd = 2.5 + rnd() * 1.0;
    wrapX(x, 60, (px) => spray(px, y0, L, sway, base, tip, s, wd));
  }
  const img = ctx.getImageData(0, 0, W, Hh).data;
  const col = new Uint8Array(W * Hh * 4);
  const fill = hex(0x21332b);
  // soften the alpha a little: the cut-out edge then follows a smooth contour when magnified
  let A = new Float32Array(W * Hh), A2 = new Float32Array(W * Hh);
  for (let i = 0; i < W * Hh; i++) A[i] = img[i * 4 + 3] / 255;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const xl = mod(x - 1, W), xr = mod(x + 1, W), yu = Math.min(Hh - 1, y + 1), yd = Math.max(0, y - 1);
      A2[y * W + x] = (A[y * W + x] * 4 + A[y * W + xl] + A[y * W + xr] + A[yu * W + x] + A[yd * W + x]) / 8;
    }
    const t = A; A = A2; A2 = t;
  }
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const sy = Hh - 1 - y, si = (sy * W + x) * 4, di = (y * W + x) * 4;
    const a = img[si + 3], t = a / 255;
    col[di] = img[si] * t + fill[0] * (1 - t); col[di + 1] = img[si + 1] * t + fill[1] * (1 - t); col[di + 2] = img[si + 2] * t + fill[2] * (1 - t);
    col[di + 3] = clamp01(A[sy * W + x] * 1.15) * 255;
  }
  const tex = new THREE.DataTexture(col, W, Hh, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 8;
  tex.needsUpdate = true;
  return { map: tex };
}

/** Grey grain + its normal, tiling: multiplied over block tiles at a higher frequency (see fx.js patch). */
export function buildVoxelDetail() {
  const S = 128, N = makePNoise(401);
  const H = new Float32Array(S * S);
  let mean = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const g = N.fbm(u, v, 9, 4, 0.6) * 0.5 + 0.5, pit = sstep(0.66, 0.8, N.fbm(u + 0.4, v + 0.7, 26, 2, 0.5) * 0.5 + 0.5);
    H[y * S + x] = clamp01(0.5 + (g - 0.5) * 1.9 - pit * 0.3);
    mean += H[y * S + x];
  }
  mean /= S * S;
  const nrm = normalFromHeight(H, S, 2.4);
  const out = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { out[i * 4] = nrm[i * 4]; out[i * 4 + 1] = clamp01(H[i] - mean + 0.5) * 255; out[i * 4 + 2] = nrm[i * 4 + 1]; out[i * 4 + 3] = 255; }
  return dataTex(out, S, { srgb: false });
}

/** Alpha cards: shaggy fur locks and ragged cloth strips (grey, tinted by vertex colour). */
export function buildCardTextures() {
  const R = {};
  const fromCanvas = (c, fill) => {
    const W = c.width, Hh = c.height;
    const img = c.getContext('2d').getImageData(0, 0, W, Hh).data;
    const col = new Uint8Array(W * Hh * 4);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const si = ((Hh - 1 - y) * W + x) * 4, di = (y * W + x) * 4, t = img[si + 3] / 255;
      col[di] = img[si] * t + fill * (1 - t); col[di + 1] = img[si + 1] * t + fill * (1 - t); col[di + 2] = img[si + 2] * t + fill * (1 - t); col[di + 3] = img[si + 3];
    }
    const tex = new THREE.DataTexture(col, W, Hh, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  };
  // fur lock: rooted along the top edge (v = 1), wiry strands ending in separate tips
  {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const rnd = mulberry32(511);
    ctx.lineCap = 'round';
    ctx.fillStyle = 'rgb(200,200,200)'; ctx.fillRect(10, 0, S - 20, S * 0.2);
    for (let i = 0; i < 80; i++) {
      const x = 8 + rnd() * (S - 16), L = S * (0.45 + rnd() * 0.52), sway = (x - S / 2) * 0.25 + (rnd() - 0.5) * 26;
      const g = 175 + rnd() * 80;
      ctx.strokeStyle = `rgb(${g | 0},${g | 0},${g | 0})`;
      const steps = 5;
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        ctx.lineWidth = (6.5 - 4.5 * t0) * (0.7 + rnd() * 0.5);
        ctx.beginPath();
        ctx.moveTo(x + sway * t0 * t0, L * t0); ctx.lineTo(x + sway * t1 * t1, L * t1); ctx.stroke();
      }
    }
    R.fur = fromCanvas(c, 210);
  }
  // cloth tatter: woven strip, frayed sides, a torn hem with hanging threads, a few holes
  {
    const W = 128, Hh = 256, c = document.createElement('canvas'); c.width = W; c.height = Hh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const N = makePNoise(521);
    const img = ctx.createImageData(W, Hh);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, v = 1 - (y + 0.5) / Hh;                 // v = 1 at the top (attached) edge
      const weave = (Math.sin(u * Math.PI * 2 * 30) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 2 * 60) * 0.5 + 0.5);
      const big = N.fbm(u, v, 3, 4, 0.55, 6) * 0.5 + 0.5, fold = N.fbm(u, v, 5, 2, 0.5, 2) * 0.5 + 0.5;
      const g = 95 + 150 * clamp01(weave * 0.3 + big * 0.45 + fold * 0.35);
      const hem = 0.1 + 0.3 * Math.abs(N.fbm(u, 0.3, 5, 3, 0.6, 1)) + 0.07 * (N.fbm(u, 0.7, 21, 2, 0.5, 1) * 0.5 + 0.5);
      const thread = Math.abs(((u * 17 + N.fbm(u, v, 3, 2, 0.5, 4) * 0.5) % 1) - 0.5) < 0.09 && v > hem - 0.1 * (N.fbm(u, 0.1, 17, 1, 0.5, 1) * 0.5 + 0.5) - 0.02;
      const side = 0.03 + 0.09 * (N.fbm(0.2, v, 1, 3, 0.6, 13) * 0.5 + 0.5) * (1.2 - v);
      const hole = N.fbm(u + 0.3, v + 0.1, 4, 3, 0.55, 7) * 0.5 + 0.5 > 0.69 + v * 0.16;
      let a = (v > hem || thread) && Math.abs(u - 0.5) < 0.5 - side && !hole ? 1 : 0;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
    R.tatter = fromCanvas(c, 150);
  }
  return R;
}

/** Soft sprite textures (flame, glow, smoke). Drawn on canvas; no text. */
export function buildSpriteTextures() {
  const mk = (size, painter) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    painter(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const R = {};
  R.glow = mk(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  });
  R.soft = mk(128, (ctx, s) => {
    const N = makePNoise(301);
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s;
      const d = Math.hypot(u - 0.5, v - 0.5) * 2;
      const n = N.fbm(u, v, 3, 4, 0.55) * 0.5 + 0.5;
      const a = clamp01((1 - d) * 1.5) * clamp01(0.35 + n * 0.9);
      const i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.pow(a, 1.5) * 255;
    }
    ctx.putImageData(img, 0, 0);
  });
  R.flame = mk(128, (ctx, s) => {
    const N = makePNoise(302);
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, v = 1 - y / s;                      // v: 0 base .. 1 tip
      const cx = (u - 0.5) * 2;
      const wob = N.fbm(u, v * 0.7, 3, 3, 0.55) * 0.32 * v;
      const width = (0.62 * Math.pow(1 - v, 0.75) + 0.04) * (0.85 + 0.3 * Math.sin(v * 5));
      const d = Math.abs(cx + wob) / Math.max(0.001, width);
      let a = clamp01(1 - d) * clamp01(v * 9) * clamp01((1 - v) * 3);
      a *= 0.65 + 0.35 * (N.fbm(u + 0.3, v, 6, 2) * 0.5 + 0.5);
      const heat = clamp01(a * 1.5 - v * 0.55);
      const i = (y * s + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 90 + 150 * heat;
      img.data[i + 2] = 20 + 150 * heat * heat;
      img.data[i + 3] = Math.pow(a, 0.8) * 255;
    }
    ctx.putImageData(img, 0, 0);
  });
  return R;
}

// ---------------------------------------------------------------------------------------------
// Tiles of the endless game only: the clock rooms' gears and dials, the fog towers' socket and crystal, the
// shadow-and-light stones, and the passage of time. Pictures, no writing.
// ---------------------------------------------------------------------------------------------
export function buildGameTiles(T) {
  const S = 128, N = makePNoise(611), tmp = [0, 0, 0];
  const plate = (u, v, o, dark = hex(0x2c2a28), light = hex(0x4e4a45)) => {
    const n = N.fbm(u, v, 6, 4, 0.55) * 0.5 + 0.5, f = N.fbm(u + 0.3, v + 0.7, 30, 2) * 0.5 + 0.5;
    mix3(dark, light, clamp01(n * 0.9 + (f - 0.5) * 0.4), o.c);
    o.h = n * 0.3 + f * 0.1;
    const e = Math.min(u, v, 1 - u, 1 - v);                    // a bevelled rim, so each block reads as one plate
    if (e < 0.06) { const k = sstep(0.0, 0.06, e); o.c[0] *= 0.55 + 0.45 * k; o.c[1] *= 0.55 + 0.45 * k; o.c[2] *= 0.55 + 0.45 * k; o.h -= (1 - k) * 0.3; }
  };
  const bronze0 = hex(0x5a3d1e), bronze1 = hex(0xb4823f), glowC = hex(0xffc26a);
  // a gear with ten teeth; one tooth carries a glowing notch that says which way it points (0 up, 1 right, 2 down, 3 left)
  for (let k = 0; k < 4; k++) {
    const aim = Math.PI / 2 - k * Math.PI / 2;
    T['gear' + k] = pixelTile(S, (u, v, o) => {
      plate(u, v, o);
      const x = u - 0.5, y = v - 0.5, r = Math.hypot(x, y), a = Math.atan2(y, x);
      const rel = a - aim, teeth = 10;
      const tooth = Math.cos(rel * teeth) > 0.2 ? 1 : 0;
      const R = 0.34 + tooth * 0.08;
      if (r < R) {
        const ring = r > 0.26 || r < 0.12;
        const spoke = Math.abs(Math.sin(rel * 2)) < 0.22;
        if (ring || spoke) {
          const sh = clamp01(0.55 + 0.45 * Math.cos(a - 2.2) * sstep(0.0, 0.4, r) + (N.fbm(u, v, 20, 2) * 0.2));
          mix3(bronze0, bronze1, sh, tmp);
          o.c[0] = tmp[0]; o.c[1] = tmp[1]; o.c[2] = tmp[2];
          o.h = 0.7 + (r > 0.26 ? 0.1 : 0) - (r < 0.05 ? 0.4 : 0);
          o.e = 0.12;
          if (r < 0.05) { o.c[0] *= 0.3; o.c[1] *= 0.3; o.c[2] *= 0.3; o.e = 0; }
        } else { o.c[0] *= 0.4; o.c[1] *= 0.4; o.c[2] *= 0.4; o.h = 0.05; }
      }
      // the notch: a bright wedge on the tooth that points the way
      const ad = Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel)));
      if (ad < 0.2 && r > 0.2 && r < 0.43) { mix3(o.c, glowC, 0.9, o.c); o.e = 1; o.h = 0.9; }
    }, { normal: 2.4, cavity: 0.6, emissiveColor: hex(0xffb45e) });
  }
  // a dial: a bronze ring with four marks and one hand
  for (let k = 0; k < 4; k++) {
    const aim = Math.PI / 2 - k * Math.PI / 2, ax = Math.cos(aim), ay = Math.sin(aim);
    T['dial' + k] = pixelTile(S, (u, v, o) => {
      plate(u, v, o, hex(0x34302b), hex(0x585248));
      const x = u - 0.5, y = v - 0.5, r = Math.hypot(x, y), a = Math.atan2(y, x);
      if (r > 0.33 && r < 0.4) { mix3(bronze0, bronze1, 0.6 + 0.4 * Math.cos(a - 2.2), o.c); o.h = 0.7; o.e = 0.08; }
      const mark = r > 0.25 && r < 0.33 && Math.abs(Math.sin(a * 2)) < 0.09;
      if (mark) { mix3(o.c, bronze1, 0.8, o.c); o.h = 0.6; }
      // the hand: from the middle toward the aim, ending in a point
      const along = x * ax + y * ay, side = Math.abs(-x * ay + y * ax);
      const wd = along < 0.2 ? 0.035 : 0.035 * (0.3 - along) / 0.1;
      if (along > -0.06 && along < 0.3 && side < Math.max(0, wd)) { mix3(o.c, glowC, 0.85, o.c); o.e = 0.85; o.h = 0.85; }
      if (r < 0.05) { mix3(o.c, bronze1, 0.9, o.c); o.h = 0.9; }
    }, { normal: 2.2, cavity: 0.6, emissiveColor: hex(0xffb45e) });
  }
  const tealD = hex(0x123c40), tealL = hex(0x8ff0e6), white = hex(0xe6fffb);
  // the socket at the foot of a fog tower: a six-sided hollow in a stone slab; lit, a crystal burns in it
  const socket = (lit) => pixelTile(S, (u, v, o) => {
    plate(u, v, o);
    const x = u - 0.5, y = v - 0.5, a = Math.atan2(y, x), r = Math.hypot(x, y);
    const hexR = 0.3 / Math.cos(((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6);
    if (r < hexR) {
      o.h = 0.0; o.c[0] *= 0.25; o.c[1] *= 0.25; o.c[2] *= 0.28;
      if (lit) { const f = N.fbm(u * 3, v * 3, 3, 2) * 0.5 + 0.5, w = Math.abs(Math.sin(a * 3 + r * 20)); mix3(tealD, tealL, clamp01(0.4 + f * 0.5 + w * 0.2), o.c); if (r < 0.12) mix3(o.c, white, 0.7, o.c); o.e = clamp01(0.55 + 0.45 * (1 - r / 0.3)); o.h = 0.6; }
    } else if (r < hexR + 0.04) { o.c[0] *= 0.6; o.c[1] *= 0.6; o.c[2] *= 0.6; o.h = 0.2; }
  }, { normal: 2.2, cavity: 0.6, emissiveColor: hex(0x9ff6ee) });
  T.socket = socket(false);
  T.socketLit = socket(true);
  // the crystal at the top of a tower: facets; dull grey-green until it is lit
  const crystal = (lit) => pixelTile(S, (u, v, o) => {
    const w = [0, 0, 0, 0, 0];
    N.worley(u, v, 3, w, 0.9);
    const f = clamp01(0.25 + w[2] * 0.6 - w[4] * 0.8), edge = 1 - sstep(0.0, 0.04, w[1] - w[0]);
    if (lit) { mix3(tealD, tealL, f, o.c); mix3(o.c, white, edge * 0.7, o.c); o.e = clamp01(0.45 + f * 0.5 + edge * 0.4); }
    else { mix3(hex(0x2a3434), hex(0x6d7f7d), f, o.c); mix3(o.c, hex(0x9aa8a6), edge * 0.4, o.c); o.e = 0.03; }
    o.h = f * 0.6 - edge * 0.3;
  }, { normal: 2.6, cavity: 0.5, emissiveColor: hex(0x9ff6ee) });
  T.crystal = crystal(false);
  T.crystalLit = crystal(true);
  // the shadow-and-light stone: pale stone threaded with runes of light (the picture is all glow: it is drawn unlit)
  T.glimmer = pixelTile(S, (u, v, o) => {
    const n = N.fbm(u + 3, v + 1, 5, 3) * 0.5 + 0.5, w = [0, 0, 0, 0, 0];
    N.worley(u, v, 3, w, 1.0);
    const line = 1 - sstep(0.0, 0.035, w[1] - w[0]);
    const e = Math.min(u, v, 1 - u, 1 - v), rim = 1 - sstep(0.0, 0.07, e);
    mix3(hex(0x1c4a4e), hex(0x3e7f80), n, o.c);
    mix3(o.c, white, Math.max(line * 0.85, rim * 0.6), o.c);
    o.h = n * 0.3 + line * 0.3;
  }, { normal: 1.5 });
  // the passage of time: a ring of drifting violet light, open in the middle (cross quads, alpha)
  T.timegate = pixelTile(S, (u, v, o) => {
    const x = (u - 0.5) * 1.15, y = (v - 0.5), r = Math.hypot(x, y * 0.8), a = Math.atan2(y, x);
    const sw = Math.sin(a * 5 + r * 26) * 0.5 + 0.5;
    const ring = sstep(0.18, 0.3, r) * (1 - sstep(0.4, 0.48, r));
    const k = clamp01(ring * (0.55 + 0.45 * sw) + (1 - sstep(0.0, 0.2, r)) * 0.35);
    mix3(hex(0x3b1e6a), hex(0xd9b8ff), clamp01(k * 1.1), o.c);
    o.a = k > 0.12 ? 1 : 0; o.e = k; o.h = k * 0.4;
  }, { normal: 0.6, alpha: true, emissiveColor: hex(0xc9a2ff) });
  return T;
}
