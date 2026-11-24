// Hand-painted procedural tiles (96-128 px, smooth filtering). Each tile is a soft gradient with
// brushy blotches, fine grain and a faint painted edge so single blocks read up close but melt
// into broad colour fields at distance. No pixel art.
import * as THREE from 'three';
import { canvasTexture } from '../../shared/stage.js';
import { hash3, mulberry32 } from '../../shared/noise.js';

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// periodic value noise: integer cell counts keep every tile seamless with its neighbours
function pv(u, v, cx, cy, seed) {
  const x = u * cx, y = v * cy;
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => hash3(((i % cx) + cx) % cx, ((j % cy) + cy) % cy, cx * 31 + cy, seed);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function pfbm(u, v, cx, cy, oct, seed) {
  let s = 0, amp = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += amp * pv(u, v, cx << i, cy << i, seed + i * 13); n += amp; amp *= 0.5; }
  return s / n;
}

/** fn(u, t) -> [r, g, b] (0..1 sRGB) or [r, g, b, a]; t = 0 at the top of a side face, 1 at the bottom. */
function paint(size, fn, post, opts = {}) {
  return canvasTexture(size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const c = fn((x + 0.5) / s, (y + 0.5) / s);
      const i = (y * s + x) * 4;
      img.data[i] = clamp01(c[0]) * 255; img.data[i + 1] = clamp01(c[1]) * 255; img.data[i + 2] = clamp01(c[2]) * 255;
      img.data[i + 3] = c.length > 3 ? clamp01(c[3]) * 255 : 255;
    }
    ctx.putImageData(img, 0, 0);
    if (post) post(ctx, s);
  }, { anisotropy: 8, ...opts });
}

// the common painted base: brushy blotches + grain + soft top-to-bottom gradient + painted edge
function base(col, u, t, o = {}) {
  const { seed = 1, blotch = 0.07, grain = 0.035, grad = 0.05, edge = 0.05, streakX = 3, streakY = 3 } = o;
  const b = pfbm(u, t, streakX, streakY, 3, seed) - 0.5;
  const g = pv(u, t, 48, 48, seed + 5) - 0.5;
  const g2 = pv(u, t, 24, 24, seed + 9) - 0.5;
  let k = 1 + blotch * 2 * b + grain * 2 * g + grain * g2 + grad * (0.5 - t);
  const e = Math.min(u, 1 - u, t, 1 - t);
  k *= 1 - edge * (1 - sstep(0, 0.09, e));
  return [col[0] * k, col[1] * k, col[2] * k];
}
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

export const PAL = {
  sand: hex(0xd29c6c), sandDeep: hex(0xc48a55), packed: hex(0xa9764a),
  hardpan: hex(0xd3a877), damp: hex(0xb08a60), gravel: hex(0xb89a74),
  rockA: hex(0xb07e58), rockB: hex(0x9c6a4a), rockC: hex(0xc9a781), rockD: hex(0x7e5440),
  adobe: hex(0xcaa377), adobeDark: hex(0xa97f56), plaster: hex(0xe6dcc6), stone: hex(0x8d7964),
  wood: hex(0x5a3c26), woodDark: hex(0x3e2a1b), thatch: hex(0xa98a56), falaj: hex(0xb5a58b),
  salt: hex(0xeae4d6),
};

export function buildTiles() {
  const T = {};
  const S = 128;

  // --- sand: almost featureless so dunes read as one sculpted surface; ripples come from the shader
  T.sand = paint(S, (u, t) => {
    let c = base(PAL.sand, u, t, { seed: 11, blotch: 0.04, grain: 0.03, grad: 0.0, edge: 0.0, streakX: 2, streakY: 2 });
    const sp = pv(u, t, 64, 64, 77);
    if (sp > 0.86) c = mul(c, 0.94); else if (sp < 0.1) c = mul(c, 1.05);
    return c;
  });
  T.sandSide = paint(S, (u, t) => {
    let c = base(PAL.sand, u, t, { seed: 12, blotch: 0.05, grain: 0.03, grad: 0.10, edge: 0.02, streakX: 2, streakY: 5 });
    const slump = pv(u, t, 3, 14, 31);
    c = mul(c, 0.97 + 0.06 * slump);
    return c;
  });
  T.hardpan = paint(S, (u, t) => {
    let c = base(PAL.hardpan, u, t, { seed: 21, blotch: 0.05, grain: 0.03, grad: 0, edge: 0.0 });
    const n = pfbm(u, t, 4, 4, 3, 23);
    const crack = Math.abs(n - 0.5);
    c = mul(c, 0.90 + 0.10 * sstep(0.0, 0.02, crack));
    return c;
  });
  // packed sand under the loose top layer: darker, damp, finely laminated (what a dig exposes)
  T.packed = paint(S, (u, t) => {
    const wob = (pv(u, 0.5, 3, 1, 37) - 0.5) * 0.05;
    let c = base(PAL.packed, u, t + wob, { seed: 33, blotch: 0.07, grain: 0.04, grad: 0.10, edge: 0.03, streakX: 2, streakY: 9 });
    const lam = pv(0.5, t + wob, 1, 11, 35);
    c = mul(c, 0.92 + 0.14 * lam);
    const peb = pv(u, t, 22, 22, 39);
    if (peb > 0.9) c = mul(c, 1.12);
    return c;
  });
  T.packedTop = paint(S, (u, t) => base(mul(PAL.packed, 1.04), u, t, { seed: 34, blotch: 0.08, grain: 0.05, grad: 0, edge: 0.04 }));
  T.damp = paint(S, (u, t) => base(PAL.damp, u, t, { seed: 25, blotch: 0.10, grain: 0.05, grad: 0.04, edge: 0.05 }));
  T.gravel = paint(S, (u, t) => {
    let c = base(PAL.gravel, u, t, { seed: 27, blotch: 0.06, grain: 0.05, grad: 0.03, edge: 0.03 });
    return c;
  }, (ctx, s) => {
    const r = mulberry32(99);
    for (let i = 0; i < 46; i++) {
      const x = r() * s, y = r() * s, rx = 2.5 + r() * 5.5, ry = rx * (0.55 + r() * 0.35);
      const light = r() > 0.5;
      ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 3.14);
      ctx.fillStyle = light ? 'rgba(232,212,180,0.50)' : 'rgba(112,88,66,0.45)';
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(60,40,28,0.28)';
      ctx.beginPath(); ctx.ellipse(0.8, 1.4, rx, ry * 0.6, 0, 0, 3.15); ctx.fill();
      ctx.restore();
    }
  });

  // --- sandstone strata: sides carry wobbly horizontal bedding lines, tops are weathered and paler
  const strata = (col, seed, lines) => paint(S, (u, t) => {
    const wob = (pv(u, 0.5, 4, 1, seed + 3) - 0.5) * 0.07 + (pv(u, 0.5, 9, 1, seed + 4) - 0.5) * 0.03;
    const tt = t + wob;
    let c = base(col, u, tt, { seed, blotch: 0.07, grain: 0.035, grad: 0.06, edge: 0.035, streakX: 2, streakY: 7 });
    const band = pv(0.5, tt, 1, 7, seed + 6);
    c = mul(c, 0.93 + 0.14 * band);
    for (const [pos, w, d] of lines) {
      const dd = Math.abs(tt - pos);
      if (dd < w) c = mul(c, 1 - d * (1 - dd / w));
    }
    const pit = pv(u, t, 16, 16, seed + 8);
    if (pit > 0.88) c = mul(c, 0.9);
    return c;
  });
  const rockTop = (col, seed) => paint(S, (u, t) => {
    let c = base(mix3(col, PAL.rockC, 0.18), u, t, { seed, blotch: 0.09, grain: 0.04, grad: 0, edge: 0.05 });
    const n = pfbm(u, t, 4, 4, 3, seed + 2);
    if (Math.abs(n - 0.5) < 0.014) c = mul(c, 0.8);
    return c;
  });
  T.rockA = strata(PAL.rockA, 41, [[0.22, 0.03, 0.2], [0.63, 0.045, 0.24], [0.9, 0.025, 0.14]]);
  T.rockB = strata(PAL.rockB, 43, [[0.35, 0.04, 0.22], [0.78, 0.03, 0.2]]);
  T.rockC = strata(PAL.rockC, 45, [[0.15, 0.025, 0.14], [0.5, 0.035, 0.18], [0.82, 0.03, 0.16]]);
  T.rockD = strata(PAL.rockD, 47, [[0.3, 0.05, 0.22], [0.7, 0.04, 0.2]]);
  T.rubble = paint(S, (u, t) => {
    let c = base(mix3(PAL.rockA, PAL.rockC, 0.35), u, t, { seed: 49, blotch: 0.10, grain: 0.05, grad: 0.08, edge: 0.06 });
    const n = pfbm(u, t, 3, 3, 3, 50);
    c = mul(c, 0.84 + 0.16 * sstep(0.0, 0.03, Math.abs(n - 0.5)));
    return c;
  });
  T.rockATop = rockTop(PAL.rockA, 51); T.rockBTop = rockTop(PAL.rockB, 53);
  T.rockCTop = rockTop(PAL.rockC, 55); T.rockDTop = rockTop(PAL.rockD, 57);

  // --- fort: mud plaster, brick courses, decorative band, gypsum caps, stone plinth
  T.adobe = paint(S, (u, t) => {
    let c = base(PAL.adobe, u, t, { seed: 61, blotch: 0.08, grain: 0.035, grad: 0.05, edge: 0.03, streakX: 2, streakY: 6 });
    const straw = pv(u, t, 40, 90, 63);
    if (straw > 0.9) c = mul(c, 1.07);
    const trowel = pv(u, t, 2, 9, 64);
    c = mul(c, 0.965 + 0.07 * trowel);
    return c;
  });
  T.adobeTop = paint(S, (u, t) => base(mul(PAL.adobe, 1.04), u, t, { seed: 62, blotch: 0.07, grain: 0.04, grad: 0, edge: 0.05 }));
  // hand-made mud bricks: uneven lengths, soft worn corners, a wandering mud joint, straw and pits
  T.adobeBrick = paint(S, (u, t) => {
    const rows = 4, row = Math.floor(t * rows), ft = t * rows - row;
    const uu = (u + [0.0, 0.47, 0.14, 0.63][row]) % 1, split = [0.56, 0.45, 0.52, 0.60][row];
    const inA = uu < split, bw = inA ? split : 1 - split, fu = inA ? uu / split : (uu - split) / (1 - split), col = inA ? 0 : 1;
    const tone = 0.89 + 0.22 * hash3(col, row, 3, 71), warm = hash3(col, row, 9, 73) - 0.5;
    let c = base(mul(PAL.adobe, tone), u, t, { seed: 71, blotch: 0.09, grain: 0.04, grad: 0.03, edge: 0.0 });
    c = [c[0] * (1 + 0.05 * warm), c[1], c[2] * (1 - 0.08 * warm)];
    const wob = (pv(u, t, 9, 9, 75) - 0.5) * 0.016;
    const dx = Math.min(fu, 1 - fu) * bw, dy = Math.min(ft, 1 - ft) / rows;
    const corner = Math.hypot(Math.max(0, 0.035 - dx), Math.max(0, 0.035 - dy));
    const m = sstep(0.005, 0.028, Math.min(dx, dy) + wob - corner * 0.7);
    c = mul(c, 0.72 + 0.28 * m);
    c = mul(c, 1 + (0.07 * sstep(0.22, 0.04, ft) - 0.09 * sstep(0.76, 0.98, ft)) * m);
    if (m > 0.9 && pv(u, t, 46, 110, 77) > 0.90) c = mul(c, 1.09);
    if (m > 0.9 && pv(u, t, 20, 20, 79) > 0.90) c = mul(c, 0.90);
    return c;
  });
  T.adobeBand = paint(S, (u, t) => {
    // a course of small triangular niches, the classic mud-fort ornament
    let c = base(PAL.adobe, u, t, { seed: 73, blotch: 0.07, grain: 0.035, grad: 0.04, edge: 0.03 });
    const n = 2, fu = (u * n) % 1;
    const tri = (1 - Math.abs(fu - 0.5) * 2) * 0.46;      // height of the triangle at this u
    const y = (t - 0.27) / 0.5;                           // 0 at the apex row, 1 at the base
    if (y > 0 && y < 1 && (1 - y) < tri / 0.46 * 1.0 && Math.abs(fu - 0.5) < y * 0.42) {
      c = mul(PAL.woodDark, 0.55 + 0.5 * y);
    }
    if (Math.abs(t - 0.14) < 0.03 || Math.abs(t - 0.88) < 0.03) c = mul(c, 0.84);
    return c;
  });
  T.plaster = paint(S, (u, t) => base(PAL.plaster, u, t, { seed: 75, blotch: 0.05, grain: 0.025, grad: 0.05, edge: 0.05 }));
  T.stone = paint(S, (u, t) => {
    const rows = 3, row = Math.floor(t * rows), ft = t * rows - row;
    const off = hash3(row, 1, 2, 81) * 0.5;
    const uu = (u + off) % 1, cols = 2, fu = (uu * cols) % 1, col = Math.floor(uu * cols);
    const tone = 0.86 + 0.26 * hash3(col, row, 5, 83);
    let c = base(mul(PAL.stone, tone), u, t, { seed: 81, blotch: 0.09, grain: 0.05, grad: 0.02, edge: 0.0 });
    const ms = Math.min(sstep(0, 0.16, Math.min(ft, 1 - ft)), sstep(0, 0.07, Math.min(fu, 1 - fu)));
    return mul(c, 0.66 + 0.34 * ms);
  });
  T.falaj = paint(S, (u, t) => {
    const cols = 2, fu = (u * cols) % 1;
    let c = base(PAL.falaj, u, t, { seed: 85, blotch: 0.07, grain: 0.04, grad: 0.03, edge: 0.06 });
    return mul(c, 0.84 + 0.16 * sstep(0, 0.06, Math.min(fu, 1 - fu)));
  });

  // --- timber, thatch
  T.wood = paint(S, (u, t) => {
    const planks = 4, p = Math.floor(u * planks), fu = u * planks - p;
    const tone = 0.88 + 0.22 * hash3(p, 2, 1, 91);
    let c = base(mul(PAL.wood, tone), u, t, { seed: 91, blotch: 0.10, grain: 0.05, grad: 0.05, edge: 0.0, streakX: 12, streakY: 2 });
    const grainL = pv(u, t, 60, 3, 93);
    c = mul(c, 0.93 + 0.14 * grainL);
    return mul(c, 0.62 + 0.38 * sstep(0, 0.10, Math.min(fu, 1 - fu)));
  }, (ctx, s) => {
    // iron bands and studs
    for (const y of [0.2, 0.78]) {
      ctx.fillStyle = 'rgba(34,28,26,0.92)'; ctx.fillRect(0, y * s - 5, s, 10);
      ctx.fillStyle = 'rgba(120,108,96,0.35)'; ctx.fillRect(0, y * s - 5, s, 1.5);
      for (let i = 0; i < 4; i++) {
        const x = (i + 0.5) / 4 * s;
        ctx.fillStyle = 'rgba(12,10,10,0.9)'; ctx.beginPath(); ctx.arc(x, y * s + 0.8, 3.6, 0, 6.3); ctx.fill();
        ctx.fillStyle = 'rgba(176,160,138,0.75)'; ctx.beginPath(); ctx.arc(x - 0.8, y * s - 0.6, 1.5, 0, 6.3); ctx.fill();
      }
    }
  });
  T.beam = paint(64, (u, t) => {
    let c = base(PAL.woodDark, u, t, { seed: 95, blotch: 0.12, grain: 0.06, grad: 0.04, edge: 0.08, streakX: 2, streakY: 10 });
    return mul(c, 1.25);
  });
  T.thatch = paint(S, (u, t) => {
    let c = base(PAL.thatch, u, t, { seed: 97, blotch: 0.08, grain: 0.05, grad: 0.03, edge: 0.03 });
    const weave = Math.sin(u * 6.283 * 8 + Math.sin(t * 6.283 * 3) * 1.2) * 0.5 + 0.5;
    const cross = Math.sin(t * 6.283 * 6) * 0.5 + 0.5;
    return mul(c, 0.82 + 0.20 * weave * (0.6 + 0.4 * cross));
  });

  // --- window slits (dark, and lit from inside)
  const slit = (lit) => paint(S, (u, t) => {
    let c = base(PAL.adobe, u, t, { seed: 61, blotch: 0.08, grain: 0.035, grad: 0.05, edge: 0.03, streakX: 2, streakY: 6 });
    const dx = Math.abs(u - 0.5), inside = dx < 0.085 && t > 0.2 && t < 0.86;
    const frame = dx < 0.13 && t > 0.16 && t < 0.9;
    if (inside) {
      const g = 1 - Math.abs(t - 0.5) * 0.9;
      c = lit ? [1.0 * g, 0.72 * g, 0.36 * g] : [0.10, 0.075, 0.06];
    } else if (frame) c = mul(c, 0.72);
    return c;
  });
  T.slit = slit(false);
  T.slitLit = slit(true);
  T.slitGlow = paint(S, (u, t) => {
    const dx = Math.abs(u - 0.5), inside = dx < 0.085 && t > 0.2 && t < 0.86;
    const g = 1 - Math.abs(t - 0.5) * 0.9;
    return inside ? [1.0 * g, 0.62 * g, 0.26 * g] : [0, 0, 0];
  });

  // --- plants (alpha cut-outs)
  const strokes = (n, colA, colB, opts = {}) => canvasTexture(S, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const r = mulberry32(opts.seed ?? 5);
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x0 = s * (0.5 + (r() - 0.5) * (opts.spread ?? 0.35));
      const lean = (r() - 0.5) * (opts.lean ?? 0.9);
      const h = s * ((opts.minH ?? 0.45) + r() * (opts.varH ?? 0.5));
      ctx.strokeStyle = r() > 0.5 ? colA : colB;
      ctx.lineWidth = (opts.w ?? 5) * (0.7 + r() * 0.6);
      ctx.beginPath(); ctx.moveTo(x0, s);
      ctx.quadraticCurveTo(x0 + lean * h * 0.3, s - h * 0.6, x0 + lean * h, s - h);
      ctx.stroke();
    }
    if (opts.heads) {
      for (let i = 0; i < 5; i++) {
        const x = s * (0.25 + r() * 0.5), y = s * (0.08 + r() * 0.2);
        ctx.fillStyle = opts.heads; ctx.beginPath(); ctx.ellipse(x, y, 4, 11, (r() - 0.5) * 0.5, 0, 6.3); ctx.fill();
      }
    }
  }, { anisotropy: 4 });
  T.reed = strokes(16, '#6f8140', '#8a9550', { seed: 3, w: 4.5, minH: 0.6, varH: 0.38, lean: 0.35, spread: 0.7, heads: '#6b4a2c' });
  T.tuft = strokes(18, '#8c8a4a', '#a39a58', { seed: 7, w: 4, minH: 0.3, varH: 0.4, lean: 1.1, spread: 0.5 });
  T.shrub = strokes(26, '#8a7350', '#6f6a44', { seed: 9, w: 3.2, minH: 0.35, varH: 0.5, lean: 1.5, spread: 0.3 });

  // --- the open desert: a salt flat's white crust, broken into plates by low ridges
  T.salt = paint(S, (u, t) => {
    let c = base(PAL.salt, u, t, { seed: 101, blotch: 0.035, grain: 0.03, grad: 0, edge: 0.0, streakX: 2, streakY: 2 });
    const n = pfbm(u, t, 3, 3, 2, 103), m = pfbm(u + 0.37, t + 0.11, 5, 5, 2, 107);
    const ridge = Math.min(Math.abs(n - 0.5), Math.abs(m - 0.5) * 1.4);
    c = mul(c, 1.03 - 0.10 * sstep(0.03, 0.0, ridge));
    if (pv(u, t, 40, 40, 109) > 0.9) c = mul(c, 0.96);
    return c;
  });
  T.saltSide = paint(S, (u, t) => {
    const crust = sstep(0.12, 0.2, t);
    let c = base(mix3(PAL.salt, PAL.packed, crust * 0.85), u, t, { seed: 111, blotch: 0.05, grain: 0.035, grad: 0.06, edge: 0.02, streakX: 2, streakY: 6 });
    return c;
  });
  // the head of a wind tower: a clay drum with four dark vents, the cap the sails turn on
  T.windhead = paint(S, (u, t) => {
    let c = base(mul(PAL.adobe, 0.96), u, t, { seed: 113, blotch: 0.08, grain: 0.035, grad: 0.05, edge: 0.04, streakX: 2, streakY: 6 });
    const dx = Math.abs(u - 0.5);
    if (dx < 0.18 && t > 0.3 && t < 0.72) c = [0.13, 0.09, 0.07];
    else if (dx < 0.24 && t > 0.24 && t < 0.78) c = mul(c, 0.78);
    if (Math.abs(t - 0.12) < 0.03 || Math.abs(t - 0.9) < 0.03) c = mul(PAL.woodDark, 1.3);
    return c;
  });
  // the stone of the sun vault: dressed blocks with a carved sun disc and rays
  T.vault = paint(S, (u, t) => {
    let c = base(mul(PAL.stone, 1.12), u, t, { seed: 121, blotch: 0.07, grain: 0.04, grad: 0, edge: 0.07 });
    const dx = u - 0.5, dy = t - 0.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const ray = r > 0.22 && r < 0.42 && Math.abs(((a / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) < 0.12;
    if (r < 0.16) c = mul(c, r > 0.12 ? 0.68 : 1.08);
    else if (ray) c = mul(c, 0.74);
    return c;
  });
  T.vaultSide = paint(S, (u, t) => {
    const rows = 2, row = Math.floor(t * rows), ft = t * rows - row, fu = ((u + row * 0.5) * 2) % 1;
    const c = base(mul(PAL.stone, 1.06), u, t, { seed: 123, blotch: 0.08, grain: 0.05, grad: 0.02, edge: 0.0 });
    return mul(c, 0.66 + 0.34 * Math.min(sstep(0, 0.1, Math.min(ft, 1 - ft)), sstep(0, 0.06, Math.min(fu, 1 - fu))));
  });

  return T;
}

// ---- prop textures ----
export function palmFrondTexture() {
  // a pinnate frond drawn as solid blade shapes (not hair-thin strokes), so the alpha edge stays
  // clean under mip-mapping and alpha-to-coverage
  const tex = canvasTexture(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const n = 19;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const y = s - 6 - t * (s - 26);
      const len = s * 0.5 * (0.50 + 0.50 * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.14))) * (1 - t * 0.30);
      const w = (13 - t * 6) * (pass ? 0.5 : 1);
      for (const sgn of [-1, 1]) {
        const tipX = s / 2 + sgn * len, tipY = y - len * 0.66;
        const g = ctx.createLinearGradient(s / 2, y, tipX, tipY);
        if (pass === 0) { g.addColorStop(0, '#4f5f2a'); g.addColorStop(1, '#7d8a3e'); }
        else { g.addColorStop(0, 'rgba(150,160,84,0.55)'); g.addColorStop(1, 'rgba(170,176,96,0.0)'); }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(s / 2, y + w * 0.5);
        ctx.quadraticCurveTo(s / 2 + sgn * len * 0.55, y - len * 0.18 + w * 0.55, tipX, tipY);
        ctx.quadraticCurveTo(s / 2 + sgn * len * 0.45, y - len * 0.34 - w * 0.45, s / 2, y - w * 0.5);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#a3965a'; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s / 2, s); ctx.lineTo(s / 2, 8); ctx.stroke();
  }, { anisotropy: 8 });
  return tex;
}

export function palmTrunkTexture() {
  return paint(64, (u, t) => {
    let c = base(hex(0x7a6248), u, t, { seed: 131, blotch: 0.10, grain: 0.05, grad: 0, edge: 0 });
    // diamond leaf-scar lattice
    const a = (u * 4 + t * 3) % 1, b = (u * 4 - t * 3 + 8) % 1;
    const d = Math.min(Math.min(a, 1 - a), Math.min(b, 1 - b));
    return mul(c, 0.70 + 0.42 * sstep(0, 0.16, d));
  }, null, { repeat: true });
}

// Sadu-style weave for rugs and saddle cloths: bands of triangles, diamonds and stripes.
export function saduTexture(variant = 0) {
  const palettes = [
    ['#7d1f1c', '#1d1715', '#e8dcc4', '#c9822f'],
    ['#2b2a33', '#8a2421', '#e3d7bd', '#b9792e'],
    ['#8c3a22', '#231c1a', '#dccfb4', '#2f4a57'],
  ];
  const P = palettes[variant % palettes.length];
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = P[0]; ctx.fillRect(0, 0, s, s);
    const bands = [
      [0.00, 0.05, 'solid', P[1]], [0.05, 0.08, 'solid', P[2]], [0.08, 0.22, 'tri', P[1], P[2]],
      [0.22, 0.25, 'solid', P[3]], [0.25, 0.30, 'solid', P[1]], [0.30, 0.44, 'dia', P[2], P[3]],
      [0.44, 0.47, 'solid', P[1]], [0.47, 0.53, 'stripe', P[2], P[1]], [0.53, 0.56, 'solid', P[1]],
      [0.56, 0.70, 'dia', P[2], P[3]], [0.70, 0.75, 'solid', P[1]], [0.75, 0.78, 'solid', P[3]],
      [0.78, 0.92, 'tri', P[1], P[2]], [0.92, 0.95, 'solid', P[2]], [0.95, 1.00, 'solid', P[1]],
    ];
    for (const [a, b, kind, c1, c2] of bands) {
      const y0 = a * s, h = (b - a) * s;
      if (kind === 'solid') { ctx.fillStyle = c1; ctx.fillRect(0, y0, s, h); continue; }
      const n = 16, w = s / n;
      for (let i = 0; i < n; i++) {
        const x = i * w;
        if (kind === 'tri') {
          ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x, y0 + h); ctx.lineTo(x + w / 2, y0); ctx.lineTo(x + w, y0 + h); ctx.fill();
          ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x + w * 0.3, y0 + h); ctx.lineTo(x + w / 2, y0 + h * 0.45); ctx.lineTo(x + w * 0.7, y0 + h); ctx.fill();
        } else if (kind === 'dia') {
          ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x + w / 2, y0 + 1); ctx.lineTo(x + w - 1, y0 + h / 2); ctx.lineTo(x + w / 2, y0 + h - 1); ctx.lineTo(x + 1, y0 + h / 2); ctx.fill();
          ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x + w / 2, y0 + h * 0.3); ctx.lineTo(x + w * 0.72, y0 + h / 2); ctx.lineTo(x + w / 2, y0 + h * 0.7); ctx.lineTo(x + w * 0.28, y0 + h / 2); ctx.fill();
        } else {
          ctx.fillStyle = i % 2 ? c1 : c2; ctx.fillRect(x, y0, w, h);
        }
      }
    }
    // woven grain
    const img = ctx.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const px = (i / 4) % s, py = Math.floor(i / 4 / s);
      const k = 0.90 + 0.10 * ((px + py) % 2) + 0.06 * (hash3(px, py, 1, 5) - 0.5);
      img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
    }
    ctx.putImageData(img, 0, 0);
  }, { anisotropy: 8 });
}

export function tentTexture() {
  return canvasTexture(128, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, t = y / s;
      let c = [0.105, 0.092, 0.085];
      const stripe = (t > 0.30 && t < 0.345) || (t > 0.655 && t < 0.70);
      const thin = Math.abs(t - 0.5) < 0.012;
      if (stripe) c = [0.62, 0.56, 0.47]; else if (thin) c = [0.42, 0.24, 0.16];
      const weave = 0.86 + 0.14 * ((x + (y >> 1)) % 2) + 0.12 * (pv(u, t, 6, 6, 201) - 0.5) + 0.10 * (pv(u, t, 40, 40, 203) - 0.5);
      const i = (y * s + x) * 4;
      img.data[i] = clamp01(c[0] * weave) * 255; img.data[i + 1] = clamp01(c[1] * weave) * 255; img.data[i + 2] = clamp01(c[2] * weave) * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { anisotropy: 8, repeat: true });
}

// soft radial glow sprite (lanterns, fire, eyes)
export function glowTexture() {
  return canvasTexture(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }, { anisotropy: 1 });
}

export { paint, base, hex, mul, mix3, pv, pfbm, sstep, clamp01 };
export const _THREE = THREE;
