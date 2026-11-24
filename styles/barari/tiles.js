// Procedural block tiles for "barari": soft painted look, bright and friendly. Every tile is painted once at
// start-up on a canvas (per pixel, or with canvas paths for the plants), so no image files are needed.
// Each tile keeps its canvas: the HUD draws its little block icons from the same pictures.
import * as THREE from 'three';
import { DINO } from './mode.js';

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

// ------------------------------------------------------------------ barari's wonders: lighthouses, the sunken places, cloud islands, totems
// (opts.glow: the tile shines by itself, drawn with its own material outside the texture array)
if (!DINO) {
  const brick = (u, v, rows, cols, seed) => {
    const r = Math.floor(v * rows), t = mod(v * rows, 1), off = r % 2 ? 0.5 / cols : 0, s = mod((u + off) * cols, 1);
    const mortar = Math.min(smooth(0, 0.07, t) * smooth(1, 0.93, t), smooth(0, 0.05, s) * smooth(1, 0.95, s));
    return { mortar, id: h2(r, Math.floor((u + off) * cols), seed) };
  };
  const painted = (u, v, p, a, b, seed) => {
    const k = brick(u, v, 4, 2, seed), n = fbm(u, v, 5, 3, seed + 1);
    p.c = mul(mix3(hex(a), hex(b), n * 0.6 + k.id * 0.4), 0.7 + k.mortar * 0.3); p.h = k.mortar * (0.7 + n * 0.3); p.r = 0.8;
  };
  T('lhWhite', { nrm: 0.9 }, (u, v, p) => painted(u, v, p, '#e9e6de', '#fbf9f3', 1601));
  T('lhRed', { nrm: 0.9 }, (u, v, p) => painted(u, v, p, '#b8372c', '#d6513e', 1603));
  // the stone of the tide: deep blue, with rings of light like ripples spreading on water
  T('tideStone', { nrm: 0.8, glow: 0.9 }, (u, v, p) => {
    const r = rock(u, v, 1611, '#1c3550', '#2c4d6e'), d = Math.hypot(u - 0.5, v - 0.5);
    const ring = 1 - smooth(0.0, 0.035, Math.abs(mod(d * 7 + 0.15, 1) - 0.5) * 0.5 * (1 + fbm(u, v, 6, 2, 1613) * 0.6));
    p.c = mix3(r.c, hex('#7fe8ff'), ring * (d < 0.47 ? 1 : 0) * 0.9); p.h = r.h; p.r = 0.6;
  });
  // the bricks of the sunken houses: old stone with coral and weed growing on it
  T('coralBrick', { nrm: 1.1 }, (u, v, p) => {
    const k = brick(u, v, 4, 2, 1621), n = fbm(u, v, 5, 3, 1623), c0 = cells(u, v, 6, 1625);
    let c = mul(mix3(hex('#7d8a86'), hex('#a3aea6'), n * 0.6 + k.id * 0.4), 0.66 + k.mortar * 0.34);
    const spot = 1 - smooth(0.1, 0.28, c0.d1);
    if (c0.id > 0.7) c = mix3(c, c0.id > 0.86 ? hex('#ef8a8a') : hex('#4fae9a'), spot * 0.85);
    c = mix3(c, hex('#3f6a3a'), smooth(0.62, 0.78, fbm(u, v, 3, 2, 1627)) * 0.55);
    p.c = c; p.h = k.mortar * 0.8 + spot * 0.3; p.r = 0.9;
  });
  // a cloud: soft white puffs with blue-grey hollows
  T('cloud', { nrm: 0.5 }, (u, v, p) => {
    const c0 = cells(u, v, 5, 1631, 0.9), c1 = cells(u + 0.31, v + 0.17, 9, 1633, 0.9), puff = 1 - Math.min(c0.d1 * 1.1, c1.d1 * 1.5);
    p.c = mix3(hex('#c8d6e8'), hex('#ffffff'), clamp(puff * 1.2 + fbm(u, v, 4, 2, 1635) * 0.3)); p.h = puff; p.r = 0.95;
  });
  // the warm vent under a cloud island: hot pale stone breathing out through glowing cracks
  T('vent', { nrm: 1.0, glow: 0.75 }, (u, v, p) => {
    const r = rock(u, v, 1641, '#a8927a', '#cbb79c'), c0 = cells(u, v, 4, 1643, 0.95), crack = 1 - smooth(0.0, 0.05, c0.d2 - c0.d1);
    const hole = 1 - smooth(0.05, 0.16, Math.hypot(u - 0.5, v - 0.5));
    p.c = mix3(mul(r.c, 0.55), hex('#ffd9a0'), clamp(crack * 0.9 + hole)); p.h = r.h * (1 - crack); p.r = 0.8;
  });
  // the carved totem: a wooden face painted in red, teal and white, and the head on top with big eyes and a beak
  const carvedWood = (u, v, seed) => { const b = barkV(u * 0.6 + 0.2, v, seed, '#8a5a32', '#a87a4a'); return { c: mul(b.c, 1.05), h: b.h }; };
  T('totemFace', { nrm: 1.2 }, (u, v, p) => {
    const w = carvedWood(u, v, 1651); let c = w.c, h = w.h * 0.5;
    const eye = (cx) => Math.hypot((u - cx) / 1.2, v - 0.34);
    for (const cx of [0.3, 0.7]) { const e = eye(cx); if (e < 0.12) { c = e < 0.05 ? hex('#1a1410') : e < 0.085 ? hex('#f3efe2') : hex('#2aa198'); h = 1; } }
    if (Math.abs(u - 0.5) < 0.07 && v > 0.42 && v < 0.62) { c = hex('#c8402e'); h = 0.9; }                      // the nose
    if (Math.abs(v - 0.76) < 0.05 && Math.abs(u - 0.5) < 0.28) { c = hex('#1a1410'); h = 0.1; }                 // the mouth
    if (v < 0.08 || v > 0.94) { c = hex('#c8402e'); h = 0.8; }                                                   // bands top and bottom
    p.c = c; p.h = h; p.r = 0.85;
  });
  T('totemHead', { nrm: 1.2 }, (u, v, p) => {
    const w = carvedWood(u, v, 1661); let c = mix3(w.c, hex('#2aa198'), 0.35), h = w.h * 0.5;
    for (const cx of [0.28, 0.72]) { const e = Math.hypot(u - cx, (v - 0.4) * 0.9); if (e < 0.16) { c = e < 0.07 ? hex('#1a1410') : e < 0.11 ? hex('#ffd34a') : hex('#f3efe2'); h = 1; } }
    if (v > 0.52 && v < 0.9 && Math.abs(u - 0.5) < 0.16 * (1 - (v - 0.52) / 0.38) + 0.02) { c = hex('#e09a2a'); h = 1; }   // the beak
    if (v < 0.12) { c = hex('#c8402e'); h = 0.8; }
    p.c = c; p.h = h; p.r = 0.85;
  });
  T('totemCap', { nrm: 1.0 }, (u, v, p) => { const r = rings(u, v, 1671, '#b98a55', '#d9aa6e', '#c8402e'); p.c = r.c; p.h = r.h; p.r = 0.9; });
  // the rare plants of the cloud islands
  D('skyFlower', { glow: 0.55 }, (ctx) => {
    const rnd = R(1681);
    blades(ctx, rnd, 7, ['#7fc8a8', '#a6e0c4'], 0.2, 0.45, 2.5);
    for (const [x, top] of [[46, 0.3], [84, 0.2]]) {
      const y = S * top;
      ctx.strokeStyle = '#6fb89a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 3, S); ctx.quadraticCurveTo(x - 5, (S + y) / 2, x, y); ctx.stroke();
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; ctx.fillStyle = k % 2 ? '#dff4ff' : '#bfe6ff'; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 10, y + Math.sin(a) * 10, 10, 5, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#fff7c8'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
    }
  });
  D('skyBerry', {}, (ctx) => {
    const rnd = R(1691);
    for (let i = 0; i < 16; i++) { const x = 20 + rnd() * 88, y = 40 + rnd() * 80; ctx.fillStyle = i % 3 ? '#3f8a52' : '#5aa86a'; ctx.beginPath(); ctx.ellipse(x, y, 16, 9, rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < 14; i++) { const x = 24 + rnd() * 80, y = 44 + rnd() * 66; ctx.fillStyle = '#7a3fc0'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c9a6ff'; ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, 1.8, 0, Math.PI * 2); ctx.fill(); }
  });
}

// the world of the dinosaurs paints its own tiles with the same brushes
if (DINO) (await import('../dino/tiles.js')).dinoTiles({ T, D, S, clamp, mix, smooth, mod, hex, mix3, mul, h2, fbm, cells, rock, dirtAt, leafy, barkV, rings, blades, R });

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
  else if (name === 'swampWater') Object.assign(o, { color: 0xe8f0d8, transparent: true, opacity: 0.9, roughness: 0.2, depthWrite: false, side: THREE.FrontSide });
  else if (name === 'lava') Object.assign(o, { emissive: 0xffffff, emissiveMap: b.map, emissiveIntensity: 1.0, roughness: 0.6 });
  else if (name === 'ice') Object.assign(o, { transparent: true, roughness: 0.15, depthWrite: false });
  else if (b.opts.cutout) Object.assign(o, { alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
  else if (P[name].draw) Object.assign(o, { alphaTest: 0.4, roughness: 0.9 });
  if (b.opts.glow) Object.assign(o, { emissive: 0xffffff, emissiveMap: b.map, emissiveIntensity: b.opts.glow });      // it shines by itself, at night too
  m = new THREE.MeshStandardMaterial(o);
  m.name = name;
  mats.set(key, m);
  return m;
}
/** The painted picture of a tile (for icons). */
export function tileCanvas(name) { if (!canvases.has(name)) { baked.set(name, bake(name)); } return canvases.get(name); }
export const tileNames = () => Object.keys(P);

// ------------------------------------------------------------------ one texture array for the endless terrain
// Every own tile but the water and the ice, stacked as layers of one texture (and their normal maps as layers of a
// second), so a chunk draws all its solid blocks in one call, its leaves in another and its plants in a third.
// The materials are the same standard material as tileMaterial gives each tile, reading the picture from the layer
// the vertex names. Plants and leaves keep their holes in the shadows too (their own depth material).
let arr = null;
// The seasons of barari: which tiles change (1 grass, 2 the leaves of the broad trees, 3 flowers, 4 pine needles) and how
// much of each season shows now (uSeasonW: spring, autumn, winter; they add up to 1). Plain mixes only (no pow, no
// normalize): the same picture on every graphics card.
export const SEASON = { cls: { value: new Float32Array(64) }, w: { value: new THREE.Vector3(1, 0, 0) } };
const SEASON_CLASS = { grassTop: 1, grassSide: 1, tuft: 1, reed: 1, shrub: 1, oakLeaves: 2, flowerR: 3, flowerY: 3, flowerB: 3, pineNeedles: 4, pineSnowSide: 4, pineSnowTop: 4 };
const SEASON_HEAD = 'uniform float uSeasonCls[64];\nuniform vec3 uSeasonW;\n';
const SEASON_TINT = `
  {
    float cls = uSeasonCls[int(clamp(vLayer + 0.25, 0.0, 63.0))];
    if (cls > 0.5) {
      vec3 c = diffuseColor.rgb;
      float g = clamp((c.g - max(c.r, c.b)) * 6.0, 0.0, 1.0);                    // how green this bit of the picture is
      float lum = dot(c, vec3(0.3, 0.59, 0.11));
      float speck = fract(sin(dot(floor(vMapUv * 16.0), vec2(12.9898, 78.233))) * 43758.5453);
      vec3 spring = c * vec3(0.96, 1.1, 0.88);
      vec3 autumn = c, winter = c;
      if (cls < 1.5) {                                                            // grass: fresh green, gold and straw, under snow
        autumn = mix(c, vec3(lum * 2.2, lum * 1.65, lum * 0.42), g);
        winter = mix(c, vec3(0.84, 0.89, 0.95), g * 0.96);
      } else if (cls < 2.5) {                                                     // broad leaves: blossom, red and orange, frost
        spring = mix(spring, vec3(0.98, 0.62, 0.74), step(0.86, speck) * g);
        autumn = mix(c, mix(vec3(lum * 4.2, lum * 1.3, lum * 0.25), vec3(lum * 3.8, lum * 2.6, lum * 0.35), step(0.5, speck)), g);
        winter = mix(c * 0.8, vec3(0.86, 0.9, 0.95), g * 0.72);
      } else if (cls < 3.5) {                                                     // flowers: bright in spring, dry later
        spring = c * 1.12;
        autumn = mix(c, vec3(lum * 1.1, lum * 0.85, lum * 0.5), 0.55);
        winter = mix(c, vec3(0.8, 0.84, 0.9), 0.55);
      } else {                                                                    // pines stay green; snow settles on them in winter
        spring = c; autumn = c;
        winter = mix(c, vec3(0.86, 0.9, 0.95), g * 0.42);
      }
      diffuseColor.rgb = spring * uSeasonW.x + autumn * uSeasonW.y + winter * uSeasonW.z;
    }
  }
`;
export function tileArray() {
  if (arr) return arr;
  const names = Object.keys(P).filter((n) => n !== 'water' && n !== 'ice' && n !== 'swampWater' && n !== 'lava' && !P[n].opts.glow);      // (the dinosaur world's water and lava, and every tile that shines, are drawn with materials of their own)
  const index = new Map(names.map((n, i) => [n, i]));
  const L = S * S * 4, col = new Uint8Array(L * names.length), nrm = new Uint8Array(L * names.length);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  // canvas textures are flipped on upload (flipY); the array is not, so its rows are laid in bottom first
  const copy = (src, out, i) => { ctx.clearRect(0, 0, S, S); ctx.drawImage(src, 0, 0); const d = ctx.getImageData(0, 0, S, S).data; for (let y = 0; y < S; y++) out.set(d.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), i * L + y * S * 4); };
  names.forEach((n, i) => {
    let b = baked.get(n);
    if (!b) { b = bake(n); baked.set(n, b); }
    copy(b.map.image, col, i);
    if (b.normalMap) copy(b.normalMap.image, nrm, i);
    else for (let k = i * L; k < (i + 1) * L; k += 4) { nrm[k] = 128; nrm[k + 1] = 128; nrm[k + 2] = 255; nrm[k + 3] = 255; }
  });
  const tex = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, S, S, names.length);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  };
  const tiles = tex(col, true), norms = tex(nrm, false);
  // a stand-in 2D map and normal map switch on the uv and normal-map code; the reads are then pointed at the arrays
  const stand = baked.get(names[0]);
  // barari's seasons (seasons.js): the grass, the leaves and the flowers of the lands take the colours of the season
  if (!DINO) names.forEach((n, i) => { if (i < 64 && SEASON_CLASS[n]) SEASON.cls.value[i] = SEASON_CLASS[n]; });
  const seasonal = !DINO;
  const hook = (m, key) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTiles = { value: tiles }; sh.uniforms.uNorms = { value: norms };
      const tint = seasonal && !key.startsWith('depth');
      if (tint) { sh.uniforms.uSeasonCls = SEASON.cls; sh.uniforms.uSeasonW = SEASON.w; }
      sh.vertexShader = 'attribute float layer;\nvarying float vLayer;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vLayer = layer;');
      // (the chunks are still #includes here: they are put in already pointed at the arrays)
      sh.fragmentShader = 'uniform highp sampler2DArray uTiles;\nuniform highp sampler2DArray uNorms;\nvarying float vLayer;\n' + (tint ? SEASON_HEAD : '') + sh.fragmentShader
        .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'texture( uTiles, vec3( vMapUv, vLayer + 0.25 ) )') + (tint ? SEASON_TINT : ''))
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )', 'texture( uNorms, vec3( vNormalMapUv, vLayer + 0.25 ) )'));
    };
    m.customProgramCacheKey = () => 'barari-tiles-' + key + (seasonal ? '-s' : '');
    return m;
  };
  const std = (o, key) => hook(new THREE.MeshStandardMaterial({ map: stand.map, normalMap: stand.normalMap || null, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.92, metalness: 0, vertexColors: true, ...o }), key);
  const mats = {
    solid: std({}, 'solid'),
    cutout: std({ alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }, 'cutout'),
    cross: std({ alphaTest: 0.4, roughness: 0.9, normalMap: null, side: THREE.FrontSide }, 'cross'),
  };
  for (const m of Object.values(mats)) m.name = 'tiles';
  const depth = (alpha, key) => hook(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: stand.map, alphaTest: alpha }), 'depth-' + key);
  const depths = { cutout: depth(0.5, 'cutout'), cross: depth(0.4, 'cross') };
  arr = { layerOf: (n) => (index.has(n) ? index.get(n) : -1), material: (kind) => mats[kind], depth: (kind) => depths[kind] || null, names };
  return arr;
}
