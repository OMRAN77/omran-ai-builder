// Procedural block tiles for "barari": soft painted look, bright and friendly. Every tile is painted once at
// start-up on a canvas (per pixel, or with canvas paths for the plants), so no image files are needed.
// Each tile keeps its canvas: the HUD draws its little block icons from the same pictures.
import * as THREE from 'three';

const S = 128;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mod = (a, n) => ((a % n) + n) % n;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

function h2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Value noise that wraps every `p` lattice cells (so tiles join without seams). */
function vn(x, y, p, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = mod(ix, p), x1 = mod(ix + 1, p), y0 = mod(iy, p), y1 = mod(iy + 1, p);
  return mix(mix(h2(x0, y0, seed), h2(x1, y0, seed), ux), mix(h2(x0, y1, seed), h2(x1, y1, seed), ux), uy);
}
function fbm(u, v, f, oct, seed) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vn(u * f, v * f, f, seed + i * 31); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
/** Wrapping cellular noise: distance to the nearest and second nearest point, and the nearest cell's id. */
function cells(u, v, n, seed, jit = 0.85) {
  const x = u * n, y = v * n, ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = ix + i, gy = iy + j, wx = mod(gx, n), wy = mod(gy, n);
    const px = gx + 0.5 + (h2(wx, wy, seed) - 0.5) * jit, py = gy + 0.5 + (h2(wx, wy, seed + 9) - 0.5) * jit;
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; id = h2(wx, wy, seed + 17); } else if (d < d2) d2 = d;
  }
  return { d1, d2, id };
}

const P = {};
/** Per-pixel tile: fn(u, v, p) sets p.c (colour), p.a (alpha), p.h (height for the normal map). v grows downwards. */
const T = (name, opts, fn) => { P[name] = { opts, fn }; };
/** Tile drawn with canvas paths (plants). */
const D = (name, opts, draw) => { P[name] = { opts, draw }; };

// ------------------------------------------------------------------ ground
function grassAt(u, v, seed) {
  const n = fbm(u, v, 4, 3, seed), f = fbm(u, v, 16, 2, seed + 5);
  let c = mix3(hex('#4f9e35'), hex('#7cc24e'), n);
  c = mix3(c, hex('#9bd45c'), smooth(0.62, 0.8, f) * 0.5);
  const blade = h2(Math.floor(u * 64), Math.floor(v * 64), seed + 3);
  if (blade > 0.86) c = mul(c, 1.12); else if (blade < 0.1) c = mul(c, 0.86);
  return c;
}
function dirtAt(u, v, seed) {
  const n = fbm(u, v, 5, 3, seed), c0 = cells(u, v, 9, seed + 2);
  let c = mix3(hex('#7a4f30'), hex('#9a6a42'), n);
  const peb = 1 - smooth(0.12, 0.26, c0.d1);
  if (c0.id > 0.72) c = mix3(c, hex('#b08a64'), peb * 0.8);
  return { c, h: n * 0.4 + peb * 0.5 * (c0.id > 0.72 ? 1 : 0) };
}
T('grassTop', { nrm: 0.6 }, (u, v, p) => { p.c = grassAt(u, v, 11); p.h = fbm(u, v, 16, 2, 16); p.r = 0.95; });
T('dirt', { nrm: 0.9 }, (u, v, p) => { const d = dirtAt(u, v, 21); p.c = d.c; p.h = d.h; p.r = 0.98; });
T('grassSide', { nrm: 0.7 }, (u, v, p) => {
  const edge = 0.24 + fbm(u, 0.5, 8, 2, 31) * 0.16 + (h2(Math.floor(u * 32), 0, 33) > 0.7 ? 0.07 : 0);
  const d = dirtAt(u, v, 21);
  if (v < edge) { p.c = mul(grassAt(u, v, 11), mix(1.05, 0.88, v / edge)); p.h = 0.8; }
  else { p.c = mul(d.c, v < edge + 0.05 ? 0.82 : 1); p.h = d.h; }
  p.r = 0.97;
});
T('sand', { nrm: 0.5 }, (u, v, p) => {
  const n = fbm(u, v, 4, 3, 41), g = h2(Math.floor(u * 128), Math.floor(v * 128), 43);
  const ripple = Math.sin((v + fbm(u, v, 3, 2, 45) * 0.25) * Math.PI * 2 * 5) * 0.5 + 0.5;
  let c = mix3(hex('#e6c98a'), hex('#f3dfa8'), n * 0.7 + ripple * 0.3);
  c = mul(c, 0.94 + g * 0.1);
  p.c = c; p.h = ripple * 0.5 + g * 0.2; p.r = 0.96;
});
T('sandstone', { nrm: 1.0 }, (u, v, p) => {
  const w = v + fbm(u, v, 3, 2, 51) * 0.06, band = Math.floor(w * 5), t = mod(w * 5, 1);
  const shade = [1, 0.93, 1.04, 0.9, 0.98][mod(band, 5)];
  let c = mul(mix3(hex('#d4ad6e'), hex('#e2c287'), fbm(u, v, 6, 3, 53)), shade);
  const groove = 1 - smooth(0, 0.08, t);
  c = mul(c, 1 - groove * 0.22);
  p.c = c; p.h = 1 - groove; p.r = 0.95;
});
T('sandstoneTop', { nrm: 0.6 }, (u, v, p) => {
  const n = fbm(u, v, 5, 3, 57), c0 = cells(u, v, 4, 58);
  p.c = mul(mix3(hex('#d8b475'), hex('#e8ca90'), n), 0.95 + smooth(0, 0.1, c0.d2 - c0.d1) * 0.07); p.h = smooth(0, 0.1, c0.d2 - c0.d1); p.r = 0.95;
});
function rock(u, v, seed, a, b) {
  const n = fbm(u, v, 4, 4, seed), c0 = cells(u, v, 5, seed + 3, 0.95);
  const crack = 1 - smooth(0.0, 0.06, c0.d2 - c0.d1);
  let c = mix3(hex(a), hex(b), n * 0.8 + c0.id * 0.2);
  c = mul(c, 1 - crack * 0.35);
  const spk = h2(Math.floor(u * 96), Math.floor(v * 96), seed + 7);
  if (spk > 0.93) c = mul(c, 1.12);
  return { c, h: (1 - crack) * (0.6 + n * 0.4) };
}
T('stone', { nrm: 1.4 }, (u, v, p) => { const r = rock(u, v, 61, '#7f858c', '#a6abb0'); p.c = r.c; p.h = r.h; p.r = 0.9; });
T('deeprock', { nrm: 1.4 }, (u, v, p) => { const r = rock(u, v, 71, '#4c5059', '#6c707a'); p.c = r.c; p.h = r.h; p.r = 0.88; });
T('gravel', { nrm: 1.3 }, (u, v, p) => {
  const c0 = cells(u, v, 10, 81, 0.9), bump = 1 - smooth(0.2, 0.62, c0.d1);
  p.c = mul(mix3(hex('#7d7a74'), hex('#b2ada3'), c0.id), 0.75 + bump * 0.35); p.h = bump; p.r = 0.9;
});
T('seabed', { nrm: 0.7 }, (u, v, p) => {
  const n = fbm(u, v, 4, 3, 91), c0 = cells(u, v, 7, 93);
  let c = mix3(hex('#c8b385'), hex('#dbc898'), n);
  if (c0.id > 0.8) c = mix3(c, hex('#9a8f78'), (1 - smooth(0.1, 0.3, c0.d1)) * 0.8);
  p.c = c; p.h = n; p.r = 0.95;
});
function snowAt(u, v, seed) {
  const n = fbm(u, v, 3, 3, seed), s = h2(Math.floor(u * 128), Math.floor(v * 128), seed + 1);
  let c = mix3(hex('#dfe9f3'), hex('#fbfdff'), n);
  if (s > 0.985) c = [1, 1, 1];
  return c;
}
T('snowTop', { nrm: 0.4 }, (u, v, p) => { p.c = snowAt(u, v, 101); p.h = fbm(u, v, 3, 3, 101); p.r = 0.8; });
T('snowSide', { nrm: 0.7 }, (u, v, p) => {
  const edge = 0.28 + fbm(u, 0.3, 6, 2, 111) * 0.18;
  if (v < edge) { p.c = mul(snowAt(u, v, 101), mix(1, 0.9, v / edge)); p.h = 0.9; p.r = 0.8; }
  else { const d = dirtAt(u, v, 21); p.c = mul(d.c, v < edge + 0.05 ? 0.78 : 0.94); p.h = d.h; p.r = 0.97; }
});
T('ice', { alpha: true }, (u, v, p) => {
  const n = fbm(u, v, 3, 3, 121), c0 = cells(u, v, 3, 123, 0.9), crack = 1 - smooth(0, 0.03, c0.d2 - c0.d1);
  p.c = mix3(hex('#9fd6ee'), hex('#d9f3ff'), n * 0.6 + crack * 0.6); p.a = 0.62 + crack * 0.3 + n * 0.08; p.h = 1 - crack; p.r = 0.15;
});
T('water', { alpha: true }, (u, v, p) => { const n = fbm(u, v, 4, 3, 131); p.c = mix3(hex('#2f8fc2'), hex('#57b5df'), n); p.a = 0.7; p.h = n; });

// ------------------------------------------------------------------ wood
const barkV = (u, v, seed, a, b) => {
  const w = u + fbm(u, v, 3, 2, seed) * 0.12, fis = Math.abs(Math.sin(w * Math.PI * 7));
  const n = fbm(u * 0.5, v * 2, 4, 3, seed + 3);
  const groove = 1 - smooth(0.0, 0.35, fis);
  return { c: mul(mix3(hex(a), hex(b), n), 1 - groove * 0.4), h: 1 - groove };
};
T('oakBark', { nrm: 1.5 }, (u, v, p) => { const r = barkV(u, v, 141, '#5e3f25', '#83603c'); p.c = r.c; p.h = r.h; p.r = 0.95; });
T('pineBark', { nrm: 1.6 }, (u, v, p) => {
  const c0 = cells(u * 1.0, v * 0.5, 4, 151, 0.7), plate = smooth(0.0, 0.08, c0.d2 - c0.d1);
  p.c = mul(mix3(hex('#4f3020'), hex('#7b4a2e'), fbm(u, v, 5, 3, 153) * 0.6 + c0.id * 0.4), 0.6 + plate * 0.45); p.h = plate; p.r = 0.95;
});
T('palmBark', { nrm: 1.4 }, (u, v, p) => {
  const w = v + Math.sin(u * Math.PI * 2) * 0.03, t = mod(w * 4, 1), ring = smooth(0.7, 1.0, t);
  p.c = mul(mix3(hex('#9b7748'), hex('#c29a62'), fbm(u, v, 6, 3, 161)), 1 - ring * 0.32); p.h = 1 - ring; p.r = 0.95;
});
function rings(u, v, seed, a, b, bark) {
  const x = u - 0.5, y = v - 0.5, r = Math.hypot(x, y) + fbm(u, v, 4, 2, seed) * 0.04;
  if (Math.max(Math.abs(x), Math.abs(y)) > 0.43) return { c: hex(bark), h: 0.3 };
  const ring = Math.sin(r * Math.PI * 2 * 7) * 0.5 + 0.5;
  return { c: mix3(hex(a), hex(b), ring * 0.6 + fbm(u, v, 6, 2, seed + 1) * 0.4), h: ring };
}
T('oakRing', { nrm: 0.8 }, (u, v, p) => { const r = rings(u, v, 171, '#b98a55', '#d9aa6e', '#5e3f25'); p.c = r.c; p.h = r.h; p.r = 0.9; });
T('pineRing', { nrm: 0.8 }, (u, v, p) => { const r = rings(u, v, 173, '#b8834f', '#dba66a', '#4f3020'); p.c = r.c; p.h = r.h; p.r = 0.9; });
T('palmRing', { nrm: 0.8 }, (u, v, p) => { const r = rings(u, v, 175, '#c9a36a', '#e5c58a', '#9b7748'); p.c = r.c; p.h = r.h; p.r = 0.9; });
T('planks', { nrm: 1.1 }, (u, v, p) => {
  const b = Math.floor(v * 4), t = mod(v * 4, 1), off = h2(b, 0, 181);
  const seam = smooth(0.0, 0.06, t) * smooth(1.0, 0.94, t), end = mod(u + off, 1) < 0.02 ? 0.7 : 1;
  const grain = Math.sin((u * 3 + fbm(u, v * 4, 4, 2, 183 + b) * 0.8) * Math.PI * 6) * 0.5 + 0.5;
  p.c = mul(mix3(hex('#b07a45'), hex('#d29e64'), grain * 0.5 + off * 0.5), (0.62 + seam * 0.38) * end); p.h = seam * end; p.r = 0.85;
});

// ------------------------------------------------------------------ leaves (cut-out cubes)
function leafy(u, v, seed, a, b, holes) {
  const c0 = cells(u, v, 7, seed, 0.95), c1 = cells(u + 0.13, v + 0.27, 11, seed + 4, 0.95);
  const blob = Math.min(c0.d1 * 1.05, c1.d1 * 1.25), lit = fbm(u, v, 4, 2, seed + 8);
  let c = mix3(hex(a), hex(b), clamp((1 - blob) * 0.7 + lit * 0.5 - 0.1));
  c = mul(c, mix(0.72, 1.08, 1 - smooth(0.2, 0.75, c0.d1)));
  const hole = smooth(holes - 0.05, holes + 0.05, Math.min(c0.d1, c1.d1 * 1.2)) * (h2(Math.floor(u * 7), Math.floor(v * 7), seed + 2) > 0.45 ? 1 : 0);
  return { c, a: 1 - hole, h: 1 - c0.d1 };
}
T('oakLeaves', { cutout: true, nrm: 0.8 }, (u, v, p) => { const r = leafy(u, v, 191, '#2f7a33', '#6fb94a', 0.52); p.c = r.c; p.a = r.a; p.h = r.h; p.r = 0.85; });
function needles(u, v, seed) {
  const k = Math.floor(v * 10), t = mod(v * 10, 1), sh = h2(k, 0, seed);
  const x = mod(u * 6 + sh, 1), bar = Math.abs(x - 0.5) * 2;
  const stroke = 1 - smooth(0.5, 0.95, bar + (1 - t) * 0.4);
  const n = fbm(u, v, 5, 2, seed + 3);
  return { c: mul(mix3(hex('#1f5a3c'), hex('#3f8a52'), n * 0.6 + stroke * 0.5), 0.75 + t * 0.3), a: stroke > 0.15 || n > 0.62 ? 1 : 0, h: stroke };
}
T('pineNeedles', { cutout: true, nrm: 0.8 }, (u, v, p) => { const r = needles(u, v, 201); p.c = r.c; p.a = r.a; p.h = r.h; p.r = 0.85; });
T('pineSnowTop', { cutout: true, nrm: 0.6 }, (u, v, p) => {
  const s = fbm(u, v, 4, 3, 211), r = needles(u, v, 201);
  if (s > 0.42) { p.c = snowAt(u, v, 101); p.a = 1; p.h = 1; } else { p.c = r.c; p.a = r.a; p.h = r.h; }
  p.r = 0.8;
});
T('pineSnowSide', { cutout: true, nrm: 0.7 }, (u, v, p) => {
  const edge = 0.22 + fbm(u, 0.1, 6, 2, 221) * 0.2, r = needles(u, v, 201);
  if (v < edge) { p.c = snowAt(u, v, 101); p.a = 1; p.h = 1; } else { p.c = r.c; p.a = r.a; p.h = r.h; }
  p.r = 0.82;
});
T('palmFrond', { cutout: true, nrm: 0.7 }, (u, v, p) => {
  // long leaflets side by side, tapering at the ends, with a pale midrib each
  const w = u * 7 + fbm(u, v, 3, 2, 231) * 0.6, k = Math.floor(w), t = w - k, len = h2(k, 0, 233);
  const end = Math.abs(v - 0.5 - (len - 0.5) * 0.25) * 2, width = 0.42 * (1 - Math.pow(end, 3));
  const on = Math.abs(t - 0.5) < width;
  const rib = 1 - smooth(0, 0.08, Math.abs(t - 0.5));
  p.c = mix3(mix3(hex('#4d9a2c'), hex('#94cc4a'), fbm(u, v, 5, 2, 235) * 0.7 + len * 0.3), hex('#d9df8a'), rib * 0.55);
  p.a = on ? 1 : 0; p.h = 1 - Math.abs(t - 0.5) * 2; p.r = 0.8;
});
T('snowRockSide', { nrm: 1.2 }, (u, v, p) => {
  const edge = 0.2 + fbm(u, 0.3, 6, 2, 241) * 0.16;
  if (v < edge) { p.c = mul(snowAt(u, v, 101), mix(1, 0.9, v / edge)); p.h = 1; p.r = 0.8; }
  else { const r = rock(u, v, 61, '#7f858c', '#a6abb0'); p.c = mul(r.c, v < edge + 0.04 ? 0.8 : 1); p.h = r.h; p.r = 0.9; }
});

// ------------------------------------------------------------------ plants (drawn with paths)
const R = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
function blades(ctx, rnd, n, cols, hMin, hMax, w = 3) {
  for (let i = 0; i < n; i++) {
    const x = 10 + rnd() * (S - 20), h = S * (hMin + rnd() * (hMax - hMin)), lean = (rnd() - 0.5) * 30;
    ctx.strokeStyle = cols[Math.floor(rnd() * cols.length)]; ctx.lineWidth = w + rnd() * 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, S); ctx.quadraticCurveTo(x + lean * 0.3, S - h * 0.6, x + lean, S - h); ctx.stroke();
  }
}
D('tuft', {}, (ctx) => { blades(ctx, R(7), 26, ['#4e9a32', '#6cba45', '#86cc58', '#3f8a2c'], 0.35, 0.9); });
function flower(ctx, seed, petal, centre) {
  const rnd = R(seed);
  blades(ctx, rnd, 9, ['#4e9a32', '#6cba45', '#3f8a2c'], 0.2, 0.55);
  for (const [x, top] of [[40, 0.34], [70, 0.22], [96, 0.4]]) {
    const y = S * top;
    ctx.strokeStyle = '#3f8a2c'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(x + 4, S); ctx.quadraticCurveTo(x - 6, (S + y) / 2, x, y); ctx.stroke();
    ctx.fillStyle = petal;
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + rnd(); ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 8, 5.5, a, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = centre; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  }
}
D('flowerR', {}, (ctx) => flower(ctx, 11, '#e2483c', '#ffd34a'));
D('flowerY', {}, (ctx) => flower(ctx, 13, '#f6c933', '#c8742a'));
D('flowerB', {}, (ctx) => flower(ctx, 17, '#5b8ff0', '#fff1b8'));
D('shrub', {}, (ctx) => {
  const rnd = R(23);
  ctx.lineCap = 'round';
  const branch = (x, y, a, len, w, d) => {
    const x2 = x + Math.cos(a) * len, y2 = y - Math.sin(a) * len;
    ctx.strokeStyle = d > 1 ? '#8a6a44' : '#a88a5a'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    if (d > 0) for (let k = 0; k < 2; k++) branch(x2, y2, a + (k ? 0.45 : -0.45) + (rnd() - 0.5) * 0.4, len * 0.66, w * 0.68, d - 1);
    else if (rnd() > 0.5) { ctx.fillStyle = '#9aa556'; ctx.beginPath(); ctx.arc(x2, y2, 3.2, 0, Math.PI * 2); ctx.fill(); }
  };
  for (const [x, a] of [[S * 0.5, 1.57], [S * 0.42, 2.1], [S * 0.58, 1.05]]) branch(x, S, a, S * 0.3, 5, 3);
});
D('reed', {}, (ctx) => {
  const rnd = R(29);
  blades(ctx, rnd, 14, ['#6f9a3c', '#8aac4a', '#5c8a34'], 0.6, 1.0, 2.5);
  for (const x of [36, 64, 92]) { ctx.fillStyle = '#7a4f2a'; ctx.beginPath(); ctx.ellipse(x, S * 0.1 + rnd() * 10, 4.5, 11, 0, 0, Math.PI * 2); ctx.fill(); }
});

// ------------------------------------------------------------------ baking
const canvases = new Map();
const baked = new Map();
function bake(name) {
  const def = P[name];
  if (!def) throw new Error('unknown tile ' + name);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  let hgt = null;
  if (def.draw) def.draw(ctx);
  else {
    const img = ctx.createImageData(S, S), d = img.data; hgt = new Float32Array(S * S);
    const p = { c: [0, 0, 0], a: 1, h: 0, r: 0.9 };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      p.a = 1; p.h = 0;
      def.fn((x + 0.5) / S, (y + 0.5) / S, p);
      const i = (y * S + x) * 4;
      d[i] = clamp(p.c[0]) * 255; d[i + 1] = clamp(p.c[1]) * 255; d[i + 2] = clamp(p.c[2]) * 255; d[i + 3] = clamp(p.a) * 255;
      hgt[y * S + x] = p.h;
    }
    ctx.putImageData(img, 0, 0);
  }
  canvases.set(name, cv);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;                 // every tile is painted to wrap; the sea plane repeats it
  map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
  let normalMap = null;
  const k = def.opts.nrm ?? 0;
  if (hgt && k > 0) {
    const nc = document.createElement('canvas'); nc.width = nc.height = S;
    const nx = nc.getContext('2d'), img = nx.createImageData(S, S), d = img.data, s = k * 2.2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x + S - 1) % S)];
      const dy = hgt[((y + 1) % S) * S + x] - hgt[((y + S - 1) % S) * S + x];
      let a = -dx * s, b = dy * s, c = 1; const l = Math.hypot(a, b, c); a /= l; b /= l; c /= l;
      const i = (y * S + x) * 4; d[i] = (a * 0.5 + 0.5) * 255; d[i + 1] = (b * 0.5 + 0.5) * 255; d[i + 2] = (c * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    nx.putImageData(img, 0, 0);
    normalMap = new THREE.CanvasTexture(nc);
    normalMap.colorSpace = THREE.NoColorSpace;
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  }
  return { map, normalMap, opts: def.opts };
}

const mats = new Map();
/** The material of an own tile for the voxel mesher (null for an unknown name, so the kit can answer). */
export function tileMaterial(name, kind) {
  if (!P[name]) return null;
  const key = name + '|' + (kind || '');
  let m = mats.get(key);
  if (m) return m;
  let b = baked.get(name);
  if (!b) { b = bake(name); baked.set(name, b); }
  const o = { map: b.map, roughness: 0.92, metalness: 0 };
  if (b.normalMap) { o.normalMap = b.normalMap; o.normalScale = new THREE.Vector2(0.8, 0.8); }
  if (name === 'water') Object.assign(o, { color: 0xd8ecff, transparent: true, opacity: 0.84, roughness: 0.1, depthWrite: false, side: THREE.FrontSide });
  else if (name === 'ice') Object.assign(o, { transparent: true, roughness: 0.15, depthWrite: false });
  else if (b.opts.cutout) Object.assign(o, { alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
  else if (P[name].draw) Object.assign(o, { alphaTest: 0.4, roughness: 0.9 });
  m = new THREE.MeshStandardMaterial(o);
  m.name = name;
  mats.set(key, m);
  return m;
}
/** The painted picture of a tile (for icons). */
export function tileCanvas(name) { if (!canvases.has(name)) { baked.set(name, bake(name)); } return canvases.get(name); }
export const tileNames = () => Object.keys(P);
