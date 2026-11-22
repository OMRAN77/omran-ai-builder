// Procedural block tiles for "kawkab": 128px, smooth-filtered, stylised PBR
// (albedo + roughness/metalness + normal + emissive), all generated per pixel at start-up.
import * as THREE from 'three';

export const TILE = 128;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const mod = (a, n) => ((a % n) + n) % n;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const TAU = Math.PI * 2;

function h2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** periodic value noise; x,y in lattice units with integer periods px,py */
function vn(x, y, px, py, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = mod(ix, px), x1 = mod(ix + 1, px), y0 = mod(iy, py), y1 = mod(iy + 1, py);
  return mix(mix(h2(x0, y0, seed), h2(x1, y0, seed), ux), mix(h2(x0, y1, seed), h2(x1, y1, seed), ux), uy);
}
/** periodic fbm in [0,1] over the unit tile */
function fbm(u, v, f, oct, seed) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vn(u * f, v * f, f, f, seed + i * 17); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
/** periodic voronoi on an nx×ny jittered (optionally staggered) grid */
function voro(u, v, nx, ny, seed, jitter = 0.85, stagger = 0) {
  const x = u * nx, y = v * ny;
  const ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0, cx = 0, cy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -2; i <= 2; i++) {
      const gx = ix + i, gy = iy + j;
      const wx = mod(gx, nx), wy = mod(gy, ny);
      const ox = 0.5 + (h2(wx, wy, seed) - 0.5) * jitter + (stagger && (wy & 1) ? 0.5 : 0);
      const oy = 0.5 + (h2(wx, wy, seed + 7) - 0.5) * jitter;
      const dx = (gx + ox - x) / nx, dy = (gy + oy - y) / ny;
      const d = Math.sqrt(dx * dx + dy * dy) * nx;
      if (d < d1) { d2 = d1; d1 = d; id = h2(wx, wy, seed + 13); cx = dx * nx; cy = dy * nx; }
      else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id, cx, cy };
}
const edgeDist = (u, v) => Math.min(u, 1 - u, v, 1 - v);

const P = {};
const T = (name, opts, fn) => { P[name] = { opts, fn }; };

// ------------------------------------------------------------------ terrain
function lichen(seedBase, violet, glowAmt) {
  return (u, v, p) => {
    const c = voro(u, v, 12, 12, seedBase, 0.9);
    const cush = 1 - smooth(0, 0.75, c.d1);
    const edge = smooth(0.0, 0.14, c.d2 - c.d1);
    const n = fbm(u, v, 8, 3, seedBase + 5), big = fbm(u, v, 3, 3, seedBase + 9);
    let base = mix3(hex('#243d45'), hex('#3f6f6a'), cush * 0.65 + n * 0.35);
    base = mix3(base, hex('#4d4672'), clamp(smooth(1 - violet - 0.15, 1 - violet + 0.15, c.id) * 0.75 + (n - 0.5) * 0.3));
    base = mul(base, mix(0.55, 1, edge) * mix(0.82, 1.08, big));
    p.c = base; p.h = cush * edge; p.r = 0.93;
    // light organs gather in loose patches instead of an even sprinkle
    const patch = smooth(0.5, 0.7, big);
    const on = fract(c.id * 7.31) < glowAmt * (0.12 + 0.88 * patch) ? 1 : 0;
    const spot = on * (1 - smooth(0.0, 0.3, c.d1));
    p.e = mul(hex('#58f6d2'), spot);
  };
}
T('lichenA', { glow: 'moss', ei: 1.5, nrm: 1.1, size: 256, span: [2, 2] }, lichen(11, 0.25, 0.14));
T('lichenB', { glow: 'moss', ei: 1.5, nrm: 1.1, size: 256, span: [2, 2] }, lichen(23, 0.7, 0.09));
T('lichenG', { glow: 'moss', ei: 1.4, nrm: 1.1, size: 256, span: [2, 2] }, lichen(37, 0.2, 0.3));

T('soil', { nrm: 0.8 }, (u, v, p) => {
  const n = fbm(u, v, 4, 4, 21), g = fbm(u, v, 16, 2, 3);
  const peb = voro(u, v, 7, 7, 31, 0.95);
  const pb = (peb.id > 0.62 ? 1 : 0) * (1 - smooth(0.12, 0.22, peb.d1));
  let c = mix3(hex('#352f42'), hex('#554a66'), n * 0.8 + g * 0.2);
  c = mix3(c, hex('#5d5470'), pb * 0.6);
  p.c = c; p.h = n * 0.5 + pb * 0.5; p.r = 0.95;
});

function slateBase(u, v, p) {
  const w = fbm(u, v, 3, 3, 41) * 0.16;
  const s = v + w;
  const k = Math.floor(s * 5), band = s * 5 - k;
  const id = h2(mod(k, 5), 3, 77);
  const seam = 1 - smooth(0.0, 0.07, Math.min(band, 1 - band));
  const g = fbm(u, v, 8, 2, 9);
  let c = mix3(hex('#343346'), hex('#5a5876'), id * 0.7 + g * 0.3);
  c = mul(c, 1 - seam * 0.5);
  p.c = c; p.h = (1 - seam) * (0.45 + id * 0.55); p.r = mix(0.38, 0.78, id * 0.7 + g * 0.3);
}
T('slate', { nrm: 1.2 }, slateBase);
T('slateTop', { nrm: 1.2 }, (u, v, p) => {
  const c = voro(u, v, 3, 3, 47, 0.9);
  const edge = smooth(0.0, 0.07, c.d2 - c.d1);
  const g = fbm(u, v, 6, 3, 49);
  let col = mix3(hex('#363549'), hex('#5c5a7a'), c.id * 0.6 + g * 0.4);
  col = mul(col, mix(0.5, 1, edge));
  p.c = col; p.h = edge * (0.5 + c.id * 0.5); p.r = mix(0.4, 0.75, g);
});
function oreTile(seed, glowHex, hotHex) {
  return (u, v, p) => {
    slateBase(u, v, p);
    const a = Math.abs(fbm(u, v, 3, 3, seed) - 0.5);
    const vein = 1 - smooth(0.004, 0.034, a);
    const nd = voro(u, v, 4, 4, seed + 2, 0.9);
    const node = (nd.id > 0.6 ? 1 : 0) * (1 - smooth(0.05, 0.16, nd.d1));
    const g = clamp(vein * 0.9 + node);
    p.c = mix3(p.c, hex(glowHex), g * 0.7);
    p.e = mix3(mul(hex(glowHex), g), hex(hotHex), clamp(node * 0.8 + vein * 0.25) * g);
    p.r = mix(p.r, 0.15, g); p.h = p.h * (1 - g * 0.6);
  };
}
T('ore', { glow: 'ore', ei: 1.8, nrm: 1.0 }, oreTile(51, '#33e6d6', '#c8fff6'));
T('oreV', { glow: 'ore', ei: 1.8, nrm: 1.0 }, oreTile(57, '#b55cff', '#f0d4ff'));

T('basaltSide', { nrm: 0.9 }, (u, v, p) => {
  const cu = u * 3, ci = Math.floor(cu), f = cu - ci;
  const gap = smooth(0.0, 0.1, Math.min(f, 1 - f));
  const id = h2(ci, 0, 61);
  const prof = Math.sin(f * Math.PI);
  const fy = fract(v + id * 0.73);
  const crack = 1 - smooth(0.0, 0.02, Math.abs(fy - 0.5));
  const g = vn(u * 24, v * 4, 24, 4, 63);
  let c = mix3(hex('#23242e'), hex('#4a4d5c'), prof * 0.55 + id * 0.25 + g * 0.2);
  c = mul(c, gap * (1 - crack * 0.45));
  p.c = c; p.h = prof * gap * (1 - crack * 0.5); p.r = mix(0.5, 0.72, g);
});
T('basaltTop', { nrm: 1.1 }, (u, v, p) => {
  const c = voro(u, v, 3, 4, 71, 0.22, 1);
  const edge = smooth(0.015, 0.1, c.d2 - c.d1);
  const g = fbm(u, v, 8, 2, 73);
  let col = mix3(hex('#292a35'), hex('#505464'), c.id * 0.7 + g * 0.3);
  col = mul(col, mix(0.4, 1, edge));
  p.c = col; p.h = edge * (0.4 + c.id * 0.6); p.r = mix(0.3, 0.5, g);
});

T('shore', { glow: 'lake', ei: 1.4, nrm: 0.8, size: 256, span: [2, 2] }, (u, v, p) => {
  const n = fbm(u, v, 4, 4, 81), big = fbm(u, v, 2, 3, 85);
  const rip = 0.5 + 0.5 * Math.sin(TAU * (v * 8 + Math.sin(TAU * u) * 0.3 + Math.sin(TAU * 2 * u + 1.7) * 0.12 + n * 1.3));
  const peb = voro(u, v, 14, 14, 86, 0.95);
  const stone = (peb.id > 0.9 ? 1 : 0) * (1 - smooth(0.1, 0.34, peb.d1));           // a few half-buried pebbles
  let c = mix3(hex('#3f3b55'), hex('#6b6684'), n * 0.6 + rip * 0.12 + big * 0.28);
  c = mix3(c, hex('#7d7896'), stone * 0.5);
  const g = voro(u, v, 18, 18, 83, 0.95);
  const patch = smooth(0.48, 0.7, big);
  const grain = (fract(g.id * 7.31) < 0.012 + 0.075 * patch ? 1 : 0) * (1 - smooth(0.04, 0.16, g.d1));
  p.c = mix3(c, hex('#8ff5e6'), grain * 0.6); p.e = mul(hex('#5ff3de'), grain);
  p.h = rip * 0.3 + n * 0.4 + stone * 0.16; p.r = mix(0.42, 0.7, n);
});
T('lakebed', { glow: 'lake', ei: 1.5, nrm: 0.5, size: 256, span: [4, 4] }, (u, v, p) => {
  // soft caustic-like veins, a few blocks across
  const c = voro(u, v, 5, 5, 87, 0.95), c2 = voro(u, v, 11, 11, 88, 0.95);
  const web = 1 - smooth(0.0, 0.2, c.d2 - c.d1), web2 = 1 - smooth(0.0, 0.25, c2.d2 - c2.d1);
  const n = fbm(u, v, 3, 4, 89);
  const g = clamp(web * 0.6 + web2 * 0.3 * n + n * 0.25);
  p.c = mix3(mix3(hex('#0b262e'), hex('#14504f'), n), hex('#3fd8c6'), g * 0.4);
  p.e = mul(hex('#2fe0cc'), g * g * 0.7 + 0.04);
  p.h = n; p.r = 0.7;
});
T('water', { kind: 'alpha', glow: 'lake', ei: 0.55, nrm: 0.45, opacity: 0.66 }, (u, v, p) => {
  const n = fbm(u, v, 4, 3, 91);
  p.c = mix3(hex('#0c5e6c'), hex('#1b9c9a'), n);
  p.e = mul(hex('#16bfb4'), 0.4 + 0.3 * n);
  p.r = 0.05; p.m = 0;
  p.h = 0.5 + 0.2 * Math.sin(TAU * (2 * u + 3 * v)) + 0.16 * Math.sin(TAU * (4 * u - v) + 1.3) + 0.12 * Math.sin(TAU * (-3 * u + 5 * v) + 2.1) + (n - 0.5) * 0.25;
});

function crystal(seed, lo, hi, hot) {
  return (u, v, p) => {
    const c = voro(u, v, 3, 3, seed, 1.0);
    const a = c.id * TAU * 3.0;                                   // every facet leans its own way
    const tilt = c.cx * Math.cos(a) + c.cy * Math.sin(a);
    const g = clamp(0.5 + tilt * 0.85);
    const edge = 1 - smooth(0.0, 0.03, c.d2 - c.d1);
    const deep = fbm(u, v, 3, 3, seed + 3);
    let col = mix3(hex(lo), hex(hi), g * 0.7 + c.id * 0.3);
    col = mul(col, 0.72 + 0.28 * deep);
    col = mix3(col, hex(hot), edge * 0.4);
    p.c = col;
    p.e = mul(mix3(hex(lo), hex(hi), 0.35 + 0.65 * g), 0.14 + 0.5 * g * g + edge * 0.25);
    p.r = 0.22 + 0.14 * c.id; p.m = 0.0;
    p.n = [Math.cos(a) * 0.3 * (1 - edge), Math.sin(a) * 0.3 * (1 - edge)];
  };
}
T('crystalC', { glow: 'ore', ei: 1.5, size: 256, span: [2, 4] }, crystal(93, '#0c3a70', '#5cc6ee', '#d8f8ff'));
T('crystalV', { glow: 'ore', ei: 1.5, size: 256, span: [2, 4] }, crystal(97, '#34197a', '#a574ea', '#efdcff'));

// ------------------------------------------------------------------ flora
T('stalk', { glow: 'flora', ei: 1.0, nrm: 0.9 }, (u, v, p) => {
  const fib = vn(u * 20, v * 2, 20, 2, 101), n = fbm(u, v, 4, 2, 103);
  p.c = mix3(hex('#6f6890'), hex('#b7aed2'), fib * 0.7 + n * 0.3);
  p.h = fib; p.r = 0.7;
  const line = smooth(0.8, 0.96, vn(u * 10, v * 1, 10, 1, 107));
  p.e = mul(hex('#9a78ff'), line * 0.55);
});
function capBase(u, v, p) {
  const n = fbm(u, v, 3, 3, 111);
  const s = voro(u, v, 3, 3, 113, 0.9);
  const cell = smooth(0.0, 0.55, s.d2 - s.d1);
  const pore = (s.id > 0.72 ? 1 : 0) * (1 - smooth(0.04, 0.2, s.d1));
  let c = mix3(hex('#3b2674'), hex('#7a54c4'), n * 0.55 + cell * 0.45);
  c = mix3(c, hex('#30c2b6'), pore * 0.85);
  p.c = c; p.e = mul(hex('#49f2da'), pore * 0.6); p.r = 0.34; p.h = n * 0.35 + cell * 0.35 + pore * 0.5;
}
T('capTop', { glow: 'flora', ei: 1.25, nrm: 0.7 }, capBase);
T('capRim', { glow: 'flora', ei: 1.3, nrm: 0.7 }, (u, v, p) => {
  capBase(u, v, p);
  const rim = 1 - smooth(0.1, 0.34, v + Math.sin(TAU * u * 3) * 0.03);
  p.c = mix3(p.c, hex('#7ffbe6'), rim * 0.85);
  p.e = mix3(p.e, hex('#7dfbe4'), rim);
});
T('gill', { glow: 'flora', ei: 1.5, nrm: 0.6 }, (u, v, p) => {
  const s = 0.5 + 0.5 * Math.sin(TAU * (u * 7 + Math.sin(TAU * v) * 0.08));
  const line = smooth(0.55, 0.95, s);
  const n = fbm(u, v, 4, 2, 117);
  p.c = mix3(hex('#24153f'), hex('#5ce9d6'), line * 0.8);
  p.e = mul(hex('#62f8e0'), line * (0.6 + 0.4 * n) + 0.06); p.h = line; p.r = 0.5;
});
T('bark', { glow: 'flora', ei: 1.3, nrm: 1.3 }, (u, v, p) => {
  const tw = Math.sin(TAU * v) * 0.8;
  const fib = vn(u * 14 + tw, v * 3, 14, 3, 121), n = fbm(u, v, 4, 2, 125);
  p.c = mix3(hex('#2b2439'), hex('#5c4f7c'), fib * 0.75 + n * 0.25);
  p.h = fib; p.r = 0.8;
  const sap = smooth(0.84, 0.97, vn(u * 7 + tw * 0.5, v * 2, 7, 2, 123));
  p.e = mul(hex('#b06cff'), sap * 0.9);
});

// cross plants (alpha cut-outs)
T('tendril', { kind: 'cutout', glow: 'flora', ei: 0.9 }, (u, v, p) => {
  let a = 0, glow = 0;
  for (let i = 0; i < 3; i++) {
    const x = 0.22 + i * 0.28 + 0.07 * Math.sin(TAU * (v * (1 + (i % 2)) + i * 0.37));
    const d = Math.abs(u - x);
    a = Math.max(a, 1 - smooth(0.012, 0.026, d));
    const bv = fract(v * 2 + i * 0.31);
    const bd = Math.hypot(u - x, (bv - 0.5) / 2);
    a = Math.max(a, 1 - smooth(0.034, 0.05, bd));
    glow = Math.max(glow, 1 - smooth(0.0, 0.055, bd));
  }
  p.a = a; p.c = mix3(hex('#1f7a80'), hex('#8ffbe8'), glow); p.e = mix3(hex('#0f5e5c'), hex('#b0fff2'), glow);
});
T('fringe', { kind: 'cutout', glow: 'flora', ei: 1.2 }, (u, v, p) => {
  let a = 0, glow = 0;
  for (let i = 0; i < 5; i++) {
    const end = 0.08 + h2(i, 1, 141) * 0.62;
    const x = 0.12 + i * 0.19 + 0.03 * Math.sin(TAU * (v * 1.5 + i * 0.41));
    if (v > end) a = Math.max(a, 1 - smooth(0.016, 0.032, Math.abs(u - x)));
    const bd = Math.hypot(u - x, v - end);
    a = Math.max(a, 1 - smooth(0.04, 0.058, bd));
    glow = Math.max(glow, 1 - smooth(0.0, 0.07, bd));
  }
  p.a = a; p.c = mix3(hex('#2a7f8c'), hex('#9cfdea'), glow); p.e = mix3(hex('#17877f'), hex('#b0fff2'), glow);
});
function distCurve(u, v, pts) {
  let best = 9, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
    const vx = bx - ax, vy = by - ay;
    const t = clamp(((u - ax) * vx + (v - ay) * vy) / (vx * vx + vy * vy));
    const d = Math.hypot(u - ax - vx * t, v - ay - vy * t);
    if (d < best) { best = d; bt = (i + t) / (pts.length - 1); }
  }
  return [best, bt];
}
const FRONDS = [];
for (let k = 0; k < 7; k++) {
  const dir = (k - 3) / 3, len = 0.62 + h2(k, 2, 151) * 0.33, pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([0.5 + dir * (0.1 * t + 0.34 * t * t), 0.02 + len * (t - 0.25 * t * t * Math.abs(dir))]); }
  FRONDS.push(pts);
}
T('fern', { kind: 'cutout', glow: 'flora', ei: 1.7 }, (u, v, p) => {
  let a = 0, tip = 0;
  for (const pts of FRONDS) {
    const [d, t] = distCurve(u, v, pts);
    const w = 0.038 * (1 - t * 0.75);
    const m = 1 - smooth(w * 0.7, w, d);
    if (m > a) { a = m; tip = t; }
  }
  p.a = a; p.c = mix3(hex('#16454a'), hex('#5df0d6'), smooth(0.3, 1, tip)); p.e = mul(hex('#55f3d8'), smooth(0.45, 1, tip));
});
const BULBS = [[0.3, 0.55, -0.06], [0.52, 0.86, 0.03], [0.72, 0.66, 0.07], [0.18, 0.3, -0.04], [0.86, 0.36, 0.04]];
T('bulb', { kind: 'cutout', glow: 'flora', ei: 2.0 }, (u, v, p) => {
  let a = 0, g = 0;
  for (const [bx, by, lean] of BULBS) {
    const x = bx - lean * (1 - v / by) * 2.2;
    if (v < by) a = Math.max(a, 1 - smooth(0.012, 0.026, Math.abs(u - x)));
    const d = Math.hypot(u - bx, (v - by) * 0.8);
    a = Math.max(a, 1 - smooth(0.06, 0.078, d));
    g = Math.max(g, 1 - smooth(0.0, 0.085, d));
  }
  p.a = a; p.c = mix3(hex('#3a2d66'), hex('#d9c2ff'), g); p.e = mix3(hex('#201a44'), hex('#c7a2ff'), g);
});
T('reed', { kind: 'cutout', glow: 'flora', ei: 1.8 }, (u, v, p) => {
  let a = 0, g = 0;
  for (let i = 0; i < 6; i++) {
    const top = 0.6 + h2(i, 3, 161) * 0.38, lean = (h2(i, 4, 161) - 0.5) * 0.22;
    const x = 0.14 + i * 0.145 + lean * v * v;
    if (v < top) a = Math.max(a, 1 - smooth(0.012 * (1.6 - v), 0.03 * (1.4 - v * 0.6), Math.abs(u - x)));
    g = Math.max(g, (1 - smooth(0.0, 0.03, Math.abs(u - x))) * smooth(top - 0.3, top, v) * (v < top ? 1 : 0));
  }
  p.a = a; p.c = mix3(hex('#1b5560'), hex('#8cf7ee'), g); p.e = mul(hex('#6df2e6'), g);
});

// ------------------------------------------------------------------ outpost
function hullPanel(u, v, p, lo, hi, groove, seed, metal, rough) {
  const e = edgeDist(u, v);
  const gr = 1 - smooth(0.0, 0.016, Math.abs(e - 0.05));
  const n = fbm(u, v, 4, 3, seed);
  const streak = vn(u * 18, v * 2, 18, 2, seed + 2);
  const grime = smooth(0.5, 0.0, v) * 0.12 + (streak - 0.5) * 0.07;
  let c = mix3(hex(lo), hex(hi), n * 0.5 + 0.5 * smooth(0, 0.7, v));
  c = mul(c, 1 - grime);
  c = mix3(c, hex(groove), gr * 0.85);
  const ru = Math.min(u, 1 - u), rv = Math.min(v, 1 - v);
  const rivet = 1 - smooth(0.016, 0.03, Math.hypot(ru - 0.115, rv - 0.115));
  c = mix3(c, mix3(hex(groove), hex(hi), 0.45), rivet * 0.85);
  c = mul(c, mix(0.62, 1, smooth(0, 0.022, e)));
  p.c = c; p.r = rough + n * 0.18; p.m = metal; p.h = 1 - gr * 0.9 + rivet * 0.6 - (1 - smooth(0, 0.022, e)) * 0.6;
}
T('hullW', { nrm: 1.0 }, (u, v, p) => hullPanel(u, v, p, '#b9bfc9', '#e4e7ec', '#4c525e', 131, 0.12, 0.4));
T('hullW2', { nrm: 1.0 }, (u, v, p) => {
  hullPanel(u, v, p, '#b9bfc9', '#e4e7ec', '#4c525e', 135, 0.12, 0.4);
  if (u > 0.24 && u < 0.76 && v > 0.2 && v < 0.52) {
    const l = fract((v - 0.2) / 0.32 * 5);
    const slat = smooth(0.0, 0.25, l) * (1 - smooth(0.7, 1.0, l));
    const inE = Math.min(u - 0.24, 0.76 - u, v - 0.2, 0.52 - v);
    p.c = mix3(hex('#20242b'), hex('#7d848f'), slat * smooth(0, 0.02, inE)); p.h = slat * 0.6; p.m = 0.5; p.r = 0.45;
  }
  const led = 1 - smooth(0.012, 0.022, Math.hypot(u - 0.3, v - 0.72));
  p.c = mix3(p.c, hex('#ffb347'), led); p.e = mul(hex('#ffab3d'), led);
});
T('hullS', { nrm: 1.0 }, (u, v, p) => {
  hullPanel(u, v, p, '#b9bfc9', '#e4e7ec', '#4c525e', 137, 0.12, 0.4);
  const band = smooth(0.33, 0.35, v) * (1 - smooth(0.65, 0.67, v));
  const wear = fbm(u, v, 8, 3, 139);
  const line = (1 - smooth(0.0, 0.012, Math.abs(v - 0.34))) + (1 - smooth(0.0, 0.012, Math.abs(v - 0.66)));
  p.c = mix3(p.c, mix3(hex('#d9601a'), hex('#f58a2a'), wear), band * (0.82 + 0.18 * smooth(0.25, 0.5, wear)));
  p.c = mix3(p.c, hex('#3a3f49'), clamp(line) * 0.7);
});
T('hullG', { nrm: 1.0 }, (u, v, p) => hullPanel(u, v, p, '#262a32', '#3d434e', '#101216', 143, 0.45, 0.42));
T('hazard', { nrm: 0.8 }, (u, v, p) => {
  hullPanel(u, v, p, '#262a32', '#3d434e', '#101216', 145, 0.4, 0.45);
  const e = edgeDist(u, v);
  const s = fract((u + v) * 2.5);
  const st = smooth(0.0, 0.04, s) * (1 - smooth(0.5, 0.54, s));
  const wear = fbm(u, v, 8, 3, 147);
  p.c = mix3(p.c, mix3(hex('#d9601a'), hex('#f58a2a'), wear), st * smooth(0.06, 0.08, e) * (0.75 + 0.25 * wear));
});
T('window', { glow: 'tech', ei: 1.7, nrm: 0.8 }, (u, v, p) => {
  hullPanel(u, v, p, '#262a32', '#3d434e', '#101216', 149, 0.45, 0.42);
  const pane = smooth(0.13, 0.15, edgeDist(u, v));
  const mull = 1 - smooth(0.0, 0.018, Math.abs(u - 0.5));
  const n = fbm(u, v, 3, 2, 151);
  const sil = smooth(0.5, 0.62, vn(u * 4, v * 3, 4, 3, 153)) * smooth(0.6, 0.2, v);
  let glass = mix3(hex('#ff9a3c'), hex('#ffe3ae'), smooth(0.1, 0.9, v) * 0.7 + n * 0.3);
  glass = mul(glass, 1 - sil * 0.55);
  const on = pane * (1 - mull);
  p.c = mix3(p.c, glass, on); p.e = mul(glass, on); p.r = mix(p.r, 0.12, on); p.m = mix(p.m, 0, on);
  p.h = mix(p.h, 0.3, on);
});
T('pad', { nrm: 0.9 }, (u, v, p) => {
  const gu = fract(u * 4), gv = fract(v * 4);
  const line = 1 - smooth(0.0, 0.05, Math.min(gu, 1 - gu, gv, 1 - gv));
  const stud = 1 - smooth(0.1, 0.16, Math.hypot(gu - 0.5, gv - 0.5));
  const n = fbm(u, v, 4, 3, 157);
  let c = mix3(hex('#23262d'), hex('#353a44'), n);
  c = mix3(c, hex('#14161a'), line * 0.8);
  c = mix3(c, hex('#444a56'), stud * 0.5);
  p.c = c; p.h = (1 - line) * 0.7 + stud * 0.3; p.r = 0.55 + n * 0.2; p.m = 0.35;
});
T('solar', { nrm: 0.6 }, (u, v, p) => {
  const gu = fract(u * 4), gv = fract(v * 4);
  const line = 1 - smooth(0.0, 0.06, Math.min(gu, 1 - gu, gv, 1 - gv));
  const fine = 1 - smooth(0.0, 0.08, Math.abs(fract(gu * 3) - 0.5) * 2 - 0.9);
  let c = mix3(hex('#0d1a38'), hex('#1f4d92'), clamp((u + v) * 0.5 + (gu - 0.5) * 0.2));
  c = mix3(c, hex('#2f66b4'), (1 - fine) * 0.0 + 0.0);
  c = mix3(c, hex('#93a1b5'), line * 0.9);
  p.c = c; p.r = mix(0.1, 0.4, line); p.m = 0.7; p.h = 1 - line;
});
T('lamp', { glow: 'tech', ei: 1.5 }, (u, v, p) => {
  hullPanel(u, v, p, '#262a32', '#3d434e', '#101216', 159, 0.45, 0.42);
  const on = smooth(0.1, 0.13, edgeDist(u, v));
  const slat = 0.75 + 0.25 * smooth(0.3, 0.5, Math.abs(fract(v * 4) - 0.5) * 2);
  p.c = mix3(p.c, hex('#fff0cf'), on); p.e = mul(hex('#ffe9c0'), on * slat);
});
T('glass', { kind: 'alpha', nrm: 0, opacity: 1 }, (u, v, p) => {
  const e = edgeDist(u, v);
  const frame = 1 - smooth(0.045, 0.06, e);
  const streak = smooth(0.4, 0.6, fract((u - v) * 1.5)) * 0.12;
  p.c = mix3(hex('#9fe2ff'), hex('#474d59'), frame);
  p.a = mix(0.2 + streak, 0.96, frame); p.r = mix(0.04, 0.4, frame); p.m = mix(0, 0.5, frame);
});
T('beam', { nrm: 1.0 }, (u, v, p) => {
  hullPanel(u, v, p, '#22252c', '#383d47', '#0e1014', 163, 0.5, 0.45);
  const d1 = Math.abs(u - v), d2 = Math.abs(u + v - 1);
  const x = 1 - smooth(0.03, 0.05, Math.min(d1, d2));
  p.c = mix3(p.c, hex('#4a505c'), x * 0.6 * smooth(0.06, 0.08, edgeDist(u, v))); p.h = Math.max(p.h, x);
});
T('cargo', { nrm: 1.0 }, (u, v, p) => {
  hullPanel(u, v, p, '#3a3f49', '#565c68', '#1a1c21', 165, 0.3, 0.5);
  const cu = Math.min(u, 1 - u), cv = Math.min(v, 1 - v);
  const corner = (cu < 0.22 && cv < 0.22 && (cu < 0.07 || cv < 0.07)) ? 1 : 0;
  const band = (1 - smooth(0.0, 0.02, Math.abs(Math.abs(v - 0.5) - 0.09))) * smooth(0.1, 0.12, cu);
  p.c = mix3(p.c, hex('#e8731a'), clamp(corner + band * 0.9));
});
T('grow', { glow: 'tech', ei: 2.2 }, (u, v, p) => {
  const s = smooth(0.25, 0.45, Math.abs(fract(u * 4) - 0.5) * 2);
  p.c = mix3(hex('#ff7ad6'), hex('#2a1730'), s); p.e = mul(hex('#ff62c8'), 1 - s); p.r = 0.4;
});
function stripLight(colHex, seed) {
  return (u, v, p) => {
    hullPanel(u, v, p, '#262a32', '#3d434e', '#101216', seed, 0.45, 0.42);
    const on = (1 - smooth(0.1, 0.13, Math.abs(v - 0.5))) * smooth(0.1, 0.13, Math.min(u, 1 - u));
    p.c = mix3(p.c, hex(colHex), on); p.e = mul(hex(colHex), on);
  };
}
T('amber', { glow: 'tech', ei: 2.0 }, stripLight('#ffad42', 167));
T('cyan', { glow: 'tech', ei: 2.0 }, stripLight('#5cf2ff', 169));

// ------------------------------------------------------------------ baking
function dataTex0(arr, srgb, mip = true, size = TILE, repeat = false) {
  const t = new THREE.DataTexture(arr, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mip;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function bake(name) {
  const { opts, fn } = P[name];
  const TILE = opts.size || 128, rep = !!opts.span;       // world-mapped tiles repeat across blocks
  const dataTex = (arr, srgb, mip = true) => dataTex0(arr, srgb, mip, TILE, rep);
  const n = TILE * TILE;
  const col = new Uint8Array(n * 4), orm = new Uint8Array(n * 4), hgt = new Float32Array(n);
  let em = null, anyE = false, anyM = false, nrmBuf = null;
  const emBuf = new Uint8Array(n * 4);
  const p = {};
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = y * TILE + x, u = (x + 0.5) / TILE, v = (y + 0.5) / TILE;
      p.c = [1, 0, 1]; p.e = null; p.r = 0.8; p.m = 0; p.h = 0.5; p.a = 1; p.n = null;
      fn(u, v, p);
      col[i * 4] = clamp(p.c[0]) * 255; col[i * 4 + 1] = clamp(p.c[1]) * 255; col[i * 4 + 2] = clamp(p.c[2]) * 255; col[i * 4 + 3] = clamp(p.a) * 255;
      orm[i * 4] = 255; orm[i * 4 + 1] = clamp(p.r, 0.04, 1) * 255; orm[i * 4 + 2] = clamp(p.m) * 255; orm[i * 4 + 3] = 255;
      if (p.m > 0.01) anyM = true;
      if (p.e) {
        emBuf[i * 4] = clamp(p.e[0]) * 255; emBuf[i * 4 + 1] = clamp(p.e[1]) * 255; emBuf[i * 4 + 2] = clamp(p.e[2]) * 255;
        if (p.e[0] + p.e[1] + p.e[2] > 0.02) anyE = true;
      }
      emBuf[i * 4 + 3] = 255;
      hgt[i] = p.h;
      if (p.n) {                                        // explicit tangent-space normal (flat facets)
        if (!nrmBuf) nrmBuf = new Uint8Array(n * 4);
        const l = Math.hypot(p.n[0], p.n[1], 1);
        nrmBuf[i * 4] = (p.n[0] / l * 0.5 + 0.5) * 255; nrmBuf[i * 4 + 1] = (p.n[1] / l * 0.5 + 0.5) * 255; nrmBuf[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; nrmBuf[i * 4 + 3] = 255;
      }
    }
  }
  if (anyE) em = emBuf;
  const kind = opts.kind || 'opaque';
  const params = { roughness: 1, metalness: anyM ? 1 : 0 };
  params.map = dataTex(col, true);
  if (kind === 'cutout') {
    // plants: no gloss maps, keep them cheap. Mip-mapped so distant fringes fade instead of sparkling.
    params.roughness = 0.8;
    params.alphaTest = 0.3;
    params.side = THREE.DoubleSide;
  } else {
    const ormT = dataTex(orm, false);
    params.roughnessMap = ormT;
    if (anyM) params.metalnessMap = ormT;
    const k = opts.nrm ?? 1;
    if (nrmBuf) params.normalMap = dataTex(nrmBuf, false);
    else if (k > 0) {
      const nm = new Uint8Array(n * 4);
      const s = k * 2.2;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const i = y * TILE + x;
          const dx = hgt[y * TILE + ((x + 1) % TILE)] - hgt[y * TILE + ((x + TILE - 1) % TILE)];
          const dy = hgt[((y + 1) % TILE) * TILE + x] - hgt[((y + TILE - 1) % TILE) * TILE + x];
          let nx = -dx * s, ny = -dy * s, nz = 1;
          const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
          nm[i * 4] = (nx * 0.5 + 0.5) * 255; nm[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nm[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nm[i * 4 + 3] = 255;
        }
      }
      params.normalMap = dataTex(nm, false);
    }
  }
  if (em) {
    params.emissiveMap = dataTex(em, true);
    params.emissive = new THREE.Color(0xffffff);
    params.emissiveIntensity = opts.ei ?? 1;
  }
  if (kind === 'alpha') {
    params.transparent = true;
    params.opacity = opts.opacity ?? 1;
    params.depthWrite = false;
  }
  const mat = new THREE.MeshStandardMaterial(params);
  mat.name = name;
  mat.userData.glow = opts.glow || null;
  mat.userData.baseEI = em ? (opts.ei ?? 1) : 0;
  return mat;
}

const cache = new Map();
export function tileMaterial(name) {
  let m = cache.get(name);
  if (!m) {
    if (!P[name]) throw new Error('unknown tile ' + name);
    m = bake(name);
    cache.set(name, m);
  }
  return m;
}
export function allTileMaterials() { return [...cache.values()]; }
/** [horizontal, vertical] number of blocks a world-mapped tile spans, or null for one tile per face. */
export function tileSpan(name) { return (P[name] && P[name].opts.span) || null; }
export function tileNames() { return Object.keys(P); }

/** Scale emissive strength per glow group, e.g. { flora: 1.6, ore: 1.4, tech: 1, lake: 1.2 }. */
export function setGlow(levels) {
  for (const m of cache.values()) {
    const g = m.userData.glow;
    if (!g || !m.userData.baseEI) continue;
    m.emissiveIntensity = m.userData.baseEI * (levels[g] ?? 1);
  }
}
