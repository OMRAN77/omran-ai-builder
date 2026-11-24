// The home of "kawkab": a crater basin with a shallow glowing lake, basalt organ pipes, crystal spires, giant cap
// plants, tendril trees and a modular outpost built from blocks. It is built by hand (below) in a 176 x 176 square
// of its own, and that square is laid into the endless planet (gen.js) at HOME: the chunks that cover it copy its
// cells, and the land round it grows out of its crater rim. Pure JS (node can run it for measuring).
import { makeNoise, hash3 } from '../../shared/noise.js';
import { PagedWorld } from '../../shared/stream.js';
import { K } from '../../shared/kit.js';
import { B } from './blocks.js';
import { makeGen, SIZE, C } from './gen.js';

/** The home square's own size; SY is the height of the whole planet. */
export const SX = 176, SY = 84, SZ = 176, SEA = 20;
/** Where the home square lies in the endless world (its corner): the middle of a 16384-block planet. */
export const HOME = { x0: SIZE / 2 - SX / 2, z0: SIZE / 2 - SZ / 2, sx: SX, sz: SZ };

/** A small box of cells (the same layout as VoxelWorld, without three.js). */
class Grid {
  constructor(sx, sy, sz) { this.sx = sx; this.sy = sy; this.sz = sz; this.data = new Uint8Array(sx * sy * sz); }
  inb(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) { return this.inb(x, y, z) ? this.data[x + this.sx * (z + this.sz * y)] : 0; }
  set(x, y, z, id) { if (this.inb(x, y, z)) this.data[x + this.sx * (z + this.sz * y)] = id; }
}

/** Places in the home, in its own coordinates (LOCAL) and in the world's (SITE, exported). */
const LOCAL = {
  lake: { x: 84, z: 70, rx: 31, rz: 23 },
  plateau: { x: 108, z: 117, rx: 40, rz: 20, y: 26 },
  hab: { x: 96, z: 120 },
  lab: { x: 116, z: 123 },
  green: { x: 97, z: 105 },
  garage: { x: 82, z: 121 },
  pad: { x: 132, z: 109, r: 8, y: 26 },
  mast: { x: 88, z: 131 },
  solar: { x: 108, z: 134 },
  jetty: { x: 86, z: 98 },
  hero: { x: 69, z: 19, y: 31 },
  cast: { x: 70, z: 100, y: 21 },
  garden: { x: 68, z: 20 },                       // the singing crystals (on the flat of the hero view)
  charger: { x: 112, z: 104 },                    // the surveyor's charging station
  room: { x0: 103, z0: 107, x1: 112, z1: 115 },   // the secret room under the plateau
  hatch: { x: 108, z: 110 },                      // its hatch (2 x 2)
  rock: { x: 29, z: 51, y: 64, r: 6 },            // the floating asteroid of the home
  rockPad: { x: 36, z: 57 },                      // and the gravity pad beside it
};

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function buildHome() {
  const SITE = LOCAL;
  const world = new Grid(SX, SY, SZ);
  const N = makeNoise(2187);
  const H = new Int16Array(SX * SZ);          // terrain surface (top solid block) before flora/buildings
  const anchors = { pylons: [], floods: [], lights: [], crystals: [], caps: [], tips: [] };
  const L = SITE.lake, PL = SITE.plateau;

  const lakeD = (x, z) => {
    const a = Math.atan2(z - L.z, x - L.x);
    const wob = 1 + 0.2 * N.n2(Math.cos(a) * 1.6 + 3.1, Math.sin(a) * 1.6 + 9.2) + 0.07 * N.n2(x / 8, z / 8);
    return Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz) / wob;
  };
  const plateauD = (x, z) => Math.hypot((x - PL.x) / PL.rx, (z - PL.z) / PL.rz);
  const FLATS = [
    { x: SITE.hero.x, z: SITE.hero.z, rx: 10, rz: 8, y: SITE.hero.y, soft: 0.6 },
    { x: SITE.cast.x, z: SITE.cast.z, rx: 14, rz: 12, y: SITE.cast.y, soft: 0.25 },
  ];

  function heightF(x, z) {
    let h = 25 + N.fbm2(x / 50, z / 50, 4) * 5.5 + N.fbm2(x / 13, z / 13, 2) * 1.4;
    const ed = Math.min(x, SX - 1 - x, z, SZ - 1 - z);
    const near = smooth(0.12, 0.42, z / SZ);            // the side behind the hero camera stays lower
    const rim = Math.pow(1 - smooth(6, 54, ed), 1.25);
    const far = smooth(0.62, 0.9, z / SZ) * smooth(0.02, 0.2, x / SX) * smooth(0.98, 0.8, x / SX);
    h += rim * (10 + N.ridge2(x / 36, z / 36, 4) * 30) * mix(0.5, 1, near) * mix(1, 0.16, far);
    h += smooth(0.8, 1.0, z / SZ) * (1.5 + N.ridge2(x / 30 + 5, z / 30, 3) * 7);
    // slope from the lookout down to the lake
    const ld = lakeD(x, z);
    const basin = 1 - smooth(0.72, 1.45, ld);
    h = mix(h, 17.4 + ld * 2.3, basin);
    const pd = plateauD(x, z);
    h = mix(h, PL.y + 0.5, 1 - smooth(0.82, 1.22, pd));
    for (const f of FLATS) {
      const d = Math.hypot((x - f.x) / f.rx, (z - f.z) / f.rz);
      h = mix(h, f.y + 0.5, 1 - smooth(1 - f.soft, 1 + f.soft, d));
    }
    return h;
  }

  // ---- basalt organ pipes: voronoi cells with a constant height each
  const CELL = 2.6;
  function cellOf(x, z) {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    let best = 1e9, bi = 0, bj = 0, bx = 0, bz = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = (gx + i + 0.5 + (hash3(gx + i, 7, gz + j, 3) - 0.5) * 0.7) * CELL;
      const cz = (gz + j + 0.5 + (hash3(gx + i, 9, gz + j, 5) - 0.5) * 0.7) * CELL;
      const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
      if (d < best) { best = d; bi = gx + i; bj = gz + j; bx = cx; bz = cz; }
    }
    return { i: bi, j: bj, x: bx, z: bz, r: hash3(bi, 11, bj, 7) };
  }
  const ORGANS = [
    { x: 41, z: 76, r: 13, h: 17 }, { x: 33, z: 96, r: 11, h: 22 }, { x: 127, z: 58, r: 9, h: 12 },
    { x: 148, z: 82, r: 12, h: 19 }, { x: 62, z: 122, r: 8, h: 13 },
    { x: 146, z: 132, r: 12, h: 20 }, { x: 50, z: 46, r: 6, h: 8 }, { x: 108, z: 38, r: 7, h: 9 },
    { x: 97, z: 62, r: 3.6, h: 5, lake: true },
    { x: 57, z: 59, r: 5.2, h: 8.5, lake: true, base: 20 }, { x: 64, z: 61.5, r: 4.4, h: 6, lake: true, base: 20 },
  ];
  const inLakeOrgan = (x, z) => ORGANS.some((o) => o.lake && Math.hypot(x - o.x, z - o.z) < o.r + 1.5);
  function basaltAt(x, z, h) {
    let top = -1;
    const c = cellOf(x, z);
    for (const o of ORGANS) {
      const d = Math.hypot(c.x - o.x, c.z - o.z) / o.r;
      if (d < 1) {
        const hh = (o.base ?? heightF(o.x, o.z)) + o.h * Math.pow(1 - d * d, 0.8) * (0.5 + 0.5 * c.r) + 1;
        top = Math.max(top, Math.floor(hh));
      }
    }
    const ed = Math.min(x, SX - 1 - x, z, SZ - 1 - z);
    const m = N.fbm2(c.x / 34 + 7.3, c.z / 34 + 2.1, 3);
    if (ed < 50 && m > 0.1 && plateauD(x, z) > 1.25) {
      const k = smooth(0.1, 0.3, m);
      top = Math.max(top, Math.floor(heightF(c.x, c.z) + k * (1 + c.r * 7)));
    }
    return top > h ? top : (top >= 0 && top >= h - 1 ? h : -1);
  }

  // ---- terrain columns
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      let h = Math.floor(heightF(x, z));
      const ld = lakeD(x, z), pd = plateauD(x, z);
      let basalt = false;
      if (ld > 1.12 || inLakeOrgan(x, z)) {
        const bt = basaltAt(x, z, h);
        if (bt >= 0) { h = bt; basalt = true; }
      }
      h = Math.min(h, SY - 12);
      H[x + z * SX] = h;
      const under = h < SEA;
      const hx = heightF(x + 1, z) - heightF(x - 1, z), hz = heightF(x, z + 1) - heightF(x, z - 1);
      const slope = Math.hypot(hx, hz) * 0.5;
      const nA = N.fbm2(x / 21 + 40, z / 21 + 11, 3), nB = N.n2(x / 7 + 3, z / 7 + 8);
      for (let y = 0; y <= h; y++) {
        const depth = h - y;
        let id = B.SLATE;
        if (basalt) id = depth < 26 ? B.BASALT : B.SLATE;
        else if (under) id = depth < 2 ? B.LAKEBED : B.SLATE;
        else if (h <= SEA + 1 && ld < 1.6) id = depth < 2 ? B.SHORE : B.SLATE;
        else if (slope > 1.25 || h > 49 + nA * 6) id = B.SLATE;
        else if (depth === 0) id = (nB > 0.34 || (ld < 1.35 && nB > -0.1)) ? B.LICHEN_G : nA > 0.12 ? B.LICHEN_B : B.LICHEN_A;
        else if (depth < 4) id = B.SOIL;
        if (id === B.SLATE) {
          const o = N.n3(x / 6.5, y / 5, z / 6.5);
          if (o > 0.46) id = N.n3(x / 31 + 9, y / 31, z / 31 + 4) > 0.0 ? B.ORE : B.ORE_V;
        }
        world.set(x, y, z, id);
      }
      for (let y = h + 1; y <= SEA; y++) world.set(x, y, z, B.WATER);
    }
  }
  const topH = (x, z) => H[clamp(Math.round(x), 0, SX - 1) + clamp(Math.round(z), 0, SZ - 1) * SX];
  const air = (x, y, z) => world.get(x, y, z) === 0;
  const put = (x, y, z, id) => { if (world.inb(x, y, z)) world.set(x, y, z, id); };
  const putAir = (x, y, z, id) => { if (world.inb(x, y, z) && world.get(x, y, z) === 0) world.set(x, y, z, id); };

  // ---- flora builders
  function capDisc(cx, cy, cz, R) {
    const layers = [[-1, R + 0.25, R - 1.45, B.CAP_RIM], [0, R, -1, B.CAP], [1, R * 0.8, -1, B.CAP]];
    if (R >= 3.5) layers.push([2, R * 0.52, -1, B.CAP]);
    if (R >= 6.2) layers.push([3, R * 0.24, -1, B.CAP]);
    const ri = Math.ceil(R + 1);
    for (const [dy, rOut, rIn, id] of layers) {
      for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > rOut || d <= rIn) continue;
        const X = Math.round(cx) + dx, Z = Math.round(cz) + dz;
        put(X, cy + dy, Z, id);
        if (dy === -1 && hash3(X, cy, Z, 91) < 0.55) putAir(X, cy - 2, Z, B.FRINGE);
      }
    }
  }
  function capPlant(x, z, Hh, R, o = {}) {
    const y0 = topH(x, z) + 1;
    const thick = R >= 5.5 ? 2 : 1;
    const lx = o.lx ?? (hash3(x, 1, z, 21) - 0.5) * 3, lz = o.lz ?? (hash3(x, 2, z, 23) - 0.5) * 3;
    let cx = x, cz = z;
    for (let i = -1; i < Hh; i++) {
      const t = Math.max(0, i) / Hh, k = Math.sin(t * Math.PI * 0.5);
      cx = x + Math.round(lx * k * t); cz = z + Math.round(lz * k * t);
      for (let a = 0; a < thick; a++) for (let b = 0; b < thick; b++) put(cx + a, y0 + i, cz + b, B.STALK);
      if (thick === 2 && i < 2) { put(cx - 1, y0 + i, cz, B.STALK); put(cx + 2, y0 + i, cz + 1, B.STALK); put(cx, y0 + i, cz + 2, B.STALK); put(cx + 1, y0 + i, cz - 1, B.STALK); }
    }
    const off = (thick - 1) / 2;
    if (o.tier) capDisc(x + Math.round(lx * 0.25) + off, y0 + Math.floor(Hh * 0.52), z + Math.round(lz * 0.25) + off, R * 0.55);
    capDisc(cx + off, y0 + Hh, cz + off, R);
    anchors.caps.push({ x: cx + off + 0.5, y: y0 + Hh - 1, z: cz + off + 0.5, r: R });
  }
  function tendrilTree(x, z, Hh, seed) {
    const y0 = topH(x, z) + 1;
    let cx = x, cz = z, a = hash3(x, 3, z, seed) * 6.283;
    const big = Hh >= 10;
    for (let i = -1; i < Hh; i++) {
      const X = Math.round(cx), Z = Math.round(cz);
      put(X, y0 + i, Z, B.BARK);
      if (big && i < Hh * 0.45) { put(X + 1, y0 + i, Z, B.BARK); put(X, y0 + i, Z + 1, B.BARK); put(X + 1, y0 + i, Z + 1, B.BARK); }
      if (i < 1) { put(X - 1, y0 + i, Z, B.BARK); put(X, y0 + i, Z - 1, B.BARK); if (big) { put(X + 2, y0 + i, Z + 1, B.BARK); put(X + 1, y0 + i, Z + 2, B.BARK); } }
      cx += Math.cos(a) * 0.28; cz += Math.sin(a) * 0.28; a += (hash3(i, 5, x + z, seed) - 0.5) * 1.2;
    }
    const nb = 4 + Math.floor(hash3(x, 6, z, seed) * 3);
    for (let k = 0; k < nb; k++) {
      const ang = (k / nb) * 6.283 + hash3(k, 7, x, seed) * 0.9;
      const Lb = 4 + Math.floor(hash3(k, 8, z, seed) * (big ? 5 : 3));
      let bx = cx, bz = cz, by = y0 + Hh - 1 - (k % 2), px = Math.round(bx), pz = Math.round(bz);
      for (let s = 1; s <= Lb; s++) {
        bx += Math.cos(ang); bz += Math.sin(ang);
        if (s <= Lb * 0.4) by += 1; else if (s > Lb * 0.7) by -= 1;
        const X = Math.round(bx), Z = Math.round(bz);
        if (X !== px && Z !== pz) put(px, by, Z, B.BARK);
        put(X, by, Z, B.BARK);
        px = X; pz = Z;
        if (s >= 2 && hash3(X, by + 3, Z, seed + 2) < 0.62) {
          const len = 1 + Math.floor(hash3(X, by, Z, seed + 1) * (big ? 6 : 4));
          for (let q = 1; q <= len; q++) {
            if (by - q <= topH(X, Z) + 1) break;
            putAir(X, by - q, Z, B.TENDRIL);
          }
        }
      }
    }
  }
  function spire(x, z, Hh, id, lx, lz, base) {
    const y0 = topH(x, z) - 1;
    for (let i = 0; i <= Hh; i++) {
      const t = i / Hh;
      const w = t < 0.32 ? base : t < 0.68 ? Math.max(1, base - 1) : 1;
      const ox = Math.round(lx * i), oz = Math.round(lz * i), o = Math.floor((w - 1) / 2);
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) put(x + ox - o + a, y0 + i, z + oz - o + b, id);
    }
    // pointed tip (a non-cubic block model, drawn as one merged mesh per crystal kind)
    const tx = x + Math.round(lx * Hh), tz = z + Math.round(lz * Hh), ty = y0 + Hh + 1;
    anchors.tips.push({ x: tx, y: ty, z: tz, id, h: Math.min(3.4, 1.1 + Hh * 0.17 + hash3(x, 7, z, 43) * 0.5), lx, lz });
  }
  function crystalCluster(x, z, Hh, id, n = 4) {
    spire(x, z, Hh, id, (hash3(x, 1, z, 31) - 0.5) * 0.16, (hash3(x, 2, z, 33) - 0.5) * 0.16, Hh >= 11 ? 3 : 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + hash3(x, k, z, 35) * 1.5, d = 2 + hash3(x, k, z, 37) * 2.6;
      const sx = Math.round(x + Math.cos(a) * d), sz = Math.round(z + Math.sin(a) * d);
      const hh = Math.max(2, Math.round(Hh * (0.25 + hash3(x, k, z, 39) * 0.4)));
      spire(sx, sz, hh, id, Math.cos(a) * 0.22, Math.sin(a) * 0.22, hh >= 6 ? 2 : 1);
    }
    anchors.crystals.push({ x: x + 0.5, y: topH(x, z) + Hh * 0.5, z: z + 0.5, h: Hh, id });
  }

  // ---- hand-placed features (framing for the hero / play / night cameras)
  const C = B.CRYSTAL_C, V = B.CRYSTAL_V;
  const CAPS = [
    [59, 31, 13, 7.2, { tier: true, lx: -2, lz: 1 }], [86, 33, 9, 5.2, { lx: 2, lz: -1 }], [50, 44, 8, 4.5, {}],
    [112, 46, 11, 6.2, { tier: true }], [40, 60, 7, 4, {}], [129, 76, 9, 5, {}], [137, 92, 12, 6.5, { tier: true }],
    [72, 132, 13, 7, { tier: true }], [58, 140, 9, 5, {}], [150, 110, 10, 5.5, {}],
    [156, 62, 11, 6, {}], [24, 58, 10, 5.5, {}], [120, 26, 9, 5, {}], [36, 30, 10, 5.5, { tier: true }],
    [98, 44, 5, 3, {}], [74, 40, 4, 2.4, {}], [46, 112, 10, 5.6, { tier: true }], [141, 44, 8, 4.4, {}],
    [126, 144, 12, 6.4, { tier: true }], [102, 150, 9, 5, {}],
  ];
  const TREES = [
    [92, 24, 12, 3], [78, 27, 8, 5], [44, 36, 11, 7], [121, 52, 10, 9], [52, 60, 9, 11], [136, 70, 12, 13],
    [47, 88, 11, 15], [40, 124, 12, 17], [66, 147, 10, 19], [152, 98, 11, 21], [160, 124, 12, 23], [28, 76, 10, 25],
    [104, 28, 9, 27], [146, 30, 11, 29], [20, 40, 12, 31], [118, 152, 11, 33], [82, 150, 9, 35],
  ];
  const CRYS = [
    [50, 66, 12, C], [47, 73, 8, V], [118, 68, 11, V], [112, 84, 6, C], [72, 50, 6, C], [103, 52, 7, V],
    [36, 86, 14, C], [28, 104, 12, V], [143, 86, 15, C], [150, 70, 10, V], [57, 97, 5, V], [78, 88, 4, C],
    [58, 128, 11, C], [140, 140, 14, V], [96, 156, 16, C], [70, 160, 12, V], [124, 160, 13, C], [158, 148, 12, C],
    [20, 132, 13, C], [16, 90, 11, V], [162, 44, 12, V], [130, 34, 8, C], [30, 20, 9, C], [85, 68, 5, C], [90, 76, 3, V],
  ];
  for (const [x, z, hh, id] of CRYS) crystalCluster(x, z, hh, id, 3 + Math.floor(hash3(x, 0, z, 41) * 3));
  for (const [x, z, hh, r, o] of CAPS) capPlant(x, z, hh, r, o);
  for (const [x, z, hh, seed] of TREES) tendrilTree(x, z, hh, seed);

  // sky-crystal outcrop on the causeway (target of the play shot); the one being mined keeps a flat top
  for (const [x, z, top, tip] of [[64, 64, 25, 0], [64, 65, 23, 0.8], [65, 65, 23, 1.0], [66, 65, 24, 1.4], [62, 66, 22, 1.0], [67, 66, 22, 1.1]]) {
    for (let y = topH(x, z) + 1; y <= top; y++) put(x, y, z, C);
    if (tip) anchors.tips.push({ x, y: top + 1, z, id: C, h: tip, lx: (hash3(x, 3, z, 45) - 0.5) * 0.12, lz: (hash3(x, 4, z, 47) - 0.5) * 0.12 });
  }

  // the engineer's kit on the causeway: a supply crate with a field lantern on it (the lantern is a prop)
  { const x = 64, z = 59, t = topH(x, z); put(x, t + 1, z, B.CARGO); anchors.camp = { x: x + 0.5, y: t + 2, z: z + 0.5 }; }

  // ---- scattered flora
  const isLichen = (id) => id === B.LICHEN_A || id === B.LICHEN_B || id === B.LICHEN_G;
  for (let z = 3; z < SZ - 3; z++) {
    for (let x = 3; x < SX - 3; x++) {
      const h = H[x + z * SX];
      const top = world.get(x, h, z);
      if (!air(x, h + 1, z)) continue;
      const r = hash3(x, 0, z, 51), pd = plateauD(x, z);
      if (pd < 1.12) continue;
      if (Math.abs(x - SITE.cast.x) < 9 && z > SITE.cast.z - 9 && z < SITE.cast.z + 10) continue;   // keep the cast stage clear
      if (top === B.SHORE) {
        if (r < 0.2 && h === SEA) put(x, h + 1, z, B.REED);
        else if (r > 0.95) put(x, h + 1, z, B.BULB);
        continue;
      }
      if (!isLichen(top)) continue;
      const dens = top === B.LICHEN_G ? 2.2 : 1;
      if (r < 0.045 * dens) put(x, h + 1, z, B.FERN);
      else if (r < 0.068 * dens) put(x, h + 1, z, B.BULB);
      else if (r > 0.9965) {
        const heroD = Math.hypot(x - SITE.hero.x, z - SITE.hero.z);
        if (heroD > 16 && Math.hypot(x - SITE.cast.x, z - SITE.cast.z) > 15 && Math.hypot(x - SITE.jetty.x, z - SITE.jetty.z) > 15) capPlant(x, z, 2 + Math.floor(hash3(x, 4, z, 53) * 4), 1.6 + hash3(x, 5, z, 55) * 1.6, {});
      }
    }
  }

  for (const [dx, dz, id] of [[-3.4, 2.2, B.FERN], [-4.3, 1.4, B.BULB], [-2.9, 3.0, B.BULB], [3.4, 2.4, B.FERN], [4.4, 1.6, B.FERN], [3.0, 3.1, B.BULB], [-7.5, -6.5, B.FERN], [7.8, -7.2, B.BULB], [-8.4, -3.2, B.BULB]]) {
    const x = Math.round(SITE.cast.x + dx), z = Math.round(SITE.cast.z + dz);
    if (air(x, topH(x, z) + 1, z)) put(x, topH(x, z) + 1, z, id);
  }

  // ------------------------------------------------------------------ outpost
  const G0 = PL.y + 1;                                   // first block layer above the plateau
  function oct(cx, cz, r, ch, fn) {
    const inside = (dx, dz) => Math.abs(dx) <= r && Math.abs(dz) <= r && Math.abs(dx) + Math.abs(dz) <= 2 * r - ch;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (!inside(dx, dz)) continue;
      const edge = !(inside(dx + 1, dz) && inside(dx - 1, dz) && inside(dx, dz + 1) && inside(dx, dz - 1));
      const flat = Math.abs(dx) === r || Math.abs(dz) === r;
      fn(cx + dx, cz + dz, edge, flat, dx, dz);
    }
  }
  // level the ground under every structure
  function foundation(x0, z0, x1, z1) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      for (let y = topH(x, z) + 1; y < G0; y++) put(x, y, z, B.HULL_G);
      for (let y = G0; y < SY; y++) { const id = world.get(x, y, z); if (id && id < B.HULL_W) put(x, y, z, 0); }
    }
  }

  // main habitat: two-storey octagon with a command cupola
  const hab = SITE.hab;
  foundation(hab.x - 7, hab.z - 7, hab.x + 7, hab.z + 7);
  oct(hab.x, hab.z, 6, 4, (x, z, edge, flat, dx, dz) => {
    const win = flat && ((dx + dz) & 1) === 0;
    put(x, G0, z, B.HULL_G);
    put(x, G0 + 1, z, edge ? (flat && ((dx * 3 + dz) % 4 === 0) ? B.HULL_W2 : B.HULL_W) : B.HULL_W);
    put(x, G0 + 2, z, edge && win ? B.WINDOW : B.HULL_W);
    put(x, G0 + 3, z, B.HULL_S);
    put(x, G0 + 4, z, B.HULL_W);
    put(x, G0 + 5, z, edge && flat && ((dx + dz) % 3 === 0) ? B.WINDOW : B.HULL_W);
    put(x, G0 + 6, z, edge ? B.HULL_G : B.HULL_W);
  });
  oct(hab.x, hab.z, 3, 2, (x, z, edge, flat) => {
    put(x, G0 + 7, z, B.HULL_G);
    put(x, G0 + 8, z, edge ? B.WINDOW : B.HULL_W);
    put(x, G0 + 9, z, edge ? B.HULL_S : B.HULL_W);
  });
  oct(hab.x, hab.z, 2, 1, (x, z) => put(x, G0 + 10, z, B.HULL_G));
  // roof railing lights
  for (const [dx, dz] of [[-6, -2], [-6, 2], [6, -2], [6, 2], [-2, -6], [2, -6], [-2, 6], [2, 6]]) put(hab.x + dx, G0 + 7, hab.z + dz, B.AMBER);

  // corridor hab -> lab
  const lab = SITE.lab;
  function corridorX(x0, x1, zc, lit = 3) {
    foundation(x0, zc - 1, x1, zc + 1);
    for (let x = x0; x <= x1; x++) for (let dz = -1; dz <= 1; dz++) {
      put(x, G0, zc + dz, B.HULL_G);
      put(x, G0 + 1, zc + dz, dz !== 0 && (x % lit === 0) ? B.WINDOW : B.HULL_W);
      put(x, G0 + 2, zc + dz, dz === 0 ? B.HULL_G : B.HULL_S);
    }
  }
  function corridorZ(z0, z1, xc, lit = 3) {
    foundation(xc - 1, z0, xc + 1, z1);
    for (let z = z0; z <= z1; z++) for (let dx = -1; dx <= 1; dx++) {
      put(xc + dx, G0, z, B.HULL_G);
      put(xc + dx, G0 + 1, z, dx !== 0 && (z % lit === 0) ? B.WINDOW : B.HULL_W);
      put(xc + dx, G0 + 2, z, dx === 0 ? B.HULL_G : B.HULL_S);
    }
  }
  corridorX(hab.x + 7, lab.x - 6, hab.z + 1);
  // laboratory: long single-storey block with a solar roof
  foundation(lab.x - 6, lab.z - 4, lab.x + 6, lab.z + 4);
  for (let dz = -4; dz <= 4; dz++) for (let dx = -6; dx <= 6; dx++) {
    const corner = Math.abs(dx) === 6 && Math.abs(dz) === 4;
    if (corner) continue;
    const edge = Math.abs(dx) === 6 || Math.abs(dz) === 4;
    const x = lab.x + dx, z = lab.z + dz;
    put(x, G0, z, B.HULL_G);
    put(x, G0 + 1, z, edge && ((dx + dz) % 5 === 0) ? B.HULL_W2 : B.HULL_W);
    put(x, G0 + 2, z, edge && Math.abs(dz) === 4 && (dx & 1) === 0 ? B.WINDOW : edge && Math.abs(dx) === 6 && (dz & 1) === 0 ? B.WINDOW : B.HULL_W);
    put(x, G0 + 3, z, B.HULL_S);
    put(x, G0 + 4, z, edge ? B.HULL_G : (Math.abs(dx) <= 4 && Math.abs(dz) <= 2 ? B.SOLAR : B.HULL_W));
  }
  // greenhouse: glass barrel vault with a lit bed, facing the lake
  const gr = SITE.green;
  foundation(gr.x - 6, gr.z - 4, gr.x + 6, gr.z + 4);
  for (let dx = -6; dx <= 6; dx++) for (let dz = -3; dz <= 3; dz++) {
    const x = gr.x + dx, z = gr.z + dz, end = Math.abs(dx) === 6;
    put(x, G0, z, B.HULL_G);
    const arch = [3, 3, 4, 4][3 - Math.abs(dz)] ?? 4;      // roof height above G0 for |dz| = 3,2,1,0
    const hTop = Math.abs(dz) === 3 ? 2 : Math.abs(dz) === 2 ? 3 : 4;
    for (let y = 1; y <= hTop; y++) {
      const shell = end || y === hTop || Math.abs(dz) === 3;
      if (!shell) continue;
      const rib = dx % 4 === 0 || end;
      put(x, G0 + y, z, rib && (y === hTop || Math.abs(dz) === 3) && !end ? B.HULL_W : (end && (Math.abs(dz) === 3 || y === hTop) ? B.HULL_W : B.GLASS));
    }
    if (!end && Math.abs(dz) <= 2) {
      if (Math.abs(dz) === 0 && dx % 2 === 0) put(x, G0 + 3, z, B.GROW);
      if (Math.abs(dz) >= 1) put(x, G0 + 1, z, hash3(x, 1, z, 61) < 0.6 ? B.FERN : B.BULB);
    }
    void arch;
  }
  corridorZ(gr.z + 4, hab.z - 7, hab.x, 2);
  // garage / airlock on the west side
  const ga = SITE.garage;
  corridorX(ga.x + 3, hab.x - 7, hab.z + 1);
  foundation(ga.x - 3, ga.z - 3, ga.x + 3, ga.z + 3);
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const x = ga.x + dx, z = ga.z + dz, edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
    const door = dz === -3 && Math.abs(dx) <= 1;
    put(x, G0, z, door ? B.HAZARD : B.HULL_G);
    put(x, G0 + 1, z, door ? B.LAMP : B.HULL_W);
    put(x, G0 + 2, z, door ? B.LAMP : edge && dz !== -3 && ((dx + dz) & 1) === 0 ? B.WINDOW : B.HULL_W);
    put(x, G0 + 3, z, door || dz === -3 ? B.HAZARD : B.HULL_S);
    put(x, G0 + 4, z, edge ? B.HULL_G : B.HULL_W);
  }
  // door of the habitat towards the lake side yard
  for (let y = 1; y <= 2; y++) put(hab.x - 3, G0 + y, hab.z - 6, B.LAMP);

  // landing pad on struts
  const pad = SITE.pad;
  foundation(pad.x - pad.r, pad.z - pad.r, pad.x + pad.r, pad.z + pad.r);
  oct(pad.x, pad.z, pad.r, 6, (x, z, edge, flat, dx, dz) => {
    put(x, G0, z, edge ? ((dx + dz) & 1 ? B.BEAM : B.HULL_G) : 0);
    const corner = edge && ((Math.abs(dx) === pad.r && Math.abs(dz) === 2) || (Math.abs(dz) === pad.r && Math.abs(dx) === 2));
    put(x, G0 + 1, z, corner ? B.CYAN : edge ? B.HAZARD : B.PAD);
  });
  corridorX(lab.x + 7, pad.x - pad.r - 1, lab.z - 2, 2);
  // access ramp from the pad towards the lab corridor
  for (let dz = -1; dz <= 1; dz++) { put(pad.x - pad.r - 1, G0, lab.z - 2 + dz, B.HULL_G); }
  // cargo stacks beside the pad
  for (const [dx, dz, n] of [[-11, -5, 2], [-10, -5, 1], [-11, -6, 1], [-12, -4, 1], [3, 11, 2], [4, 11, 1], [4, 12, 1], [-10, 8, 1]]) {
    const x = pad.x + dx, z = pad.z + dz;
    for (let y = topH(x, z) + 1; y < G0; y++) put(x, y, z, B.HULL_G);
    for (let k = 0; k < n; k++) put(x, G0 + k, z, B.CARGO);
  }

  // paved yard and walkways (flush with the ground)
  const pave = (x0, z0, x1, z1) => {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const t = topH(x, z);
      if (world.get(x, t + 1, z) === 0 || world.get(x, t + 1, z) === B.FERN || world.get(x, t + 1, z) === B.BULB) { put(x, t, z, B.PAD); put(x, t + 1, z, 0); }
    }
  };
  pave(hab.x - 4, hab.z - 9, hab.x - 2, hab.z - 7);
  pave(ga.x - 2, ga.z - 8, ga.x + 2, ga.z - 4);
  pave(ga.x, ga.z - 8, hab.x - 3, ga.z - 8);
  // jetty into the lake
  const jt = SITE.jetty;
  pave(jt.x - 1, jt.z + 1, jt.x + 1, ga.z - 9);
  for (let z = jt.z; z >= jt.z - 9; z--) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let y = SEA + 1; y < SEA + 2; y++) put(jt.x + dx, y, z, 0);
      put(jt.x + dx, SEA + 2, z, dx === 0 ? B.PAD : (z % 3 === 0 ? B.AMBER : B.HULL_G));
    }
    if (z % 4 === 0) for (const dx of [-1, 1]) for (let y = topH(jt.x + dx, z) + 1; y <= SEA + 1; y++) put(jt.x + dx, y, z, B.BEAM);
  }
  put(jt.x, SEA + 3, jt.z - 9, B.BEAM); put(jt.x, SEA + 4, jt.z - 9, B.LAMP);
  anchors.lights.push({ x: jt.x + 0.5, y: SEA + 5.2, z: jt.z - 8.5, kind: 'jetty' });

  // perimeter pylons
  const NP = 30;
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * Math.PI * 2;
    const x = Math.round(PL.x + Math.cos(a) * (PL.rx - 1)), z = Math.round(PL.z + Math.sin(a) * (PL.rz - 0.5));
    const t = topH(x, z);
    if (t < SEA || !air(x, t + 1, z) && world.get(x, t + 1, z) !== B.FERN && world.get(x, t + 1, z) !== B.BULB) continue;
    if (Math.hypot(x - pad.x, z - pad.z) < pad.r + 3) continue;
    put(x, t + 1, z, B.BEAM); put(x, t + 2, z, B.BEAM); put(x, t + 3, z, B.AMBER);
    anchors.pylons.push({ x: x + 0.5, y: t + 3.5, z: z + 0.5 });
  }

  // anchors for props and lights
  anchors.padTop = { x: pad.x + 0.5, y: G0 + 2, z: pad.z + 0.5 };
  anchors.cupola = { x: hab.x + 0.5, y: G0 + 11, z: hab.z + 0.5 };
  anchors.ground = G0;
  anchors.mast = { x: SITE.mast.x + 0.5, y: topH(SITE.mast.x, SITE.mast.z) + 1, z: SITE.mast.z + 0.5 };
  anchors.solar = [];
  for (let i = 0; i < 4; i++) { const x = SITE.solar.x + i * 7, z = SITE.solar.z + (i % 2) * 2; anchors.solar.push({ x: x + 0.5, y: topH(x, z) + 1, z: z + 0.5 }); }
  anchors.floods = [
    { x: 84.5, z: 106.5, tx: -1, tz: -0.76 }, { x: 107.5, z: 101.5, tx: -0.3, tz: -1 }, { x: 123.5, z: 99.5, tx: 0.45, tz: -1 }, { x: ga.x - 5.5, z: ga.z + 5.5, tx: -1, tz: 0.5 },
  ].map((p) => ({ ...p, y: topH(p.x, p.z) + 1 }));
  anchors.rover = { x: ga.x + 0.5, y: topH(ga.x, ga.z - 7) + 1, z: ga.z - 6.5 };

  // ------------------------------------------------------------------ the wonders of the home (their play is in wonders.js)
  const clearUp = (x, y0, z) => { for (let y = y0; y < SY; y++) { const id = world.get(x, y, z); if (id === B.FERN || id === B.BULB || id === B.REED || id === B.FRINGE || id === B.TENDRIL) put(x, y, z, 0); } };
  // the garden of the singing crystals, on the flat of the rim above the lake: five crystals round a stone, the
  // taller the higher the note; touched in the order they sing, the base opens its secret hatch
  {
    const g = SITE.garden, y = topH(g.x, g.z);
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) if (dx * dx + dz * dz <= 40) clearUp(g.x + dx, y + 1, g.z + dz);
    put(g.x, y, g.z, B.BASALT); put(g.x, y + 1, g.z, B.BASALT);           // the stone in the middle
    anchors.garden = { x: g.x + 0.5, y: y + 1, z: g.z + 0.5, chimes: [] };
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 2 / 5) + 0.3, x = Math.round(g.x + Math.cos(a) * 4.2), z = Math.round(g.z + Math.sin(a) * 4.2);
      const t = topH(x, z), id = B.CHIME0 + k, hgt = 1 + Math.ceil(k / 2) + 1;
      put(x, t, z, B.BASALT);
      for (let i = 1; i <= hgt; i++) put(x, t + i, z, id);
      for (let i = hgt + 1; i < hgt + 4; i++) put(x, t + i, z, 0);
      anchors.garden.chimes.push({ x, y: t + 1, z, top: t + hgt, id, k });
    }
  }
  // the charging station of the surveyor, on the open plateau east of the greenhouse: a dark pad, the charger in
  // the middle and four sockets at its corners that take sky crystals
  {
    const c = SITE.charger;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { put(c.x + dx, G0 - 1, c.z + dz, B.HULL_G); for (let y = G0; y < G0 + 4; y++) put(c.x + dx, y, c.z + dz, 0); }
    put(c.x, G0, c.z, B.CHARGER);
    anchors.charger = { x: c.x, y: G0, z: c.z, sockets: [] };
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { put(c.x + dx, G0, c.z + dz, B.SOCKET); anchors.charger.sockets.push({ x: c.x + dx, y: G0, z: c.z + dz }); }
  }
  // the secret room under the plateau, shut by a hatch in the ground: a lit room with a chest, crystal in its walls
  // and steps up to the hatch
  {
    const r = SITE.room, top = G0 - 1, ceil = top - 1, fl = top - 5;    // under the plateau's top layer (left as it is) a ceiling, the floor four lower
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) {
      const edge = x === r.x0 || x === r.x1 || z === r.z0 || z === r.z1;
      put(x, fl, z, edge ? B.HULL_G : B.PAD);
      for (let y = fl + 1; y < ceil; y++) put(x, y, z, edge ? (y === fl + 3 && (x + z) % 3 === 0 ? B.LAMP : B.HULL_W) : 0);
      put(x, ceil, z, edge ? B.HULL_G : B.HULL_S);
    }
    for (const [x, z] of [[r.x0 + 1, r.z0 + 1], [r.x1 - 1, r.z0 + 1], [r.x0 + 1, r.z1 - 1], [r.x1 - 1, r.z1 - 1]]) put(x, ceil, z, B.AMBER);      // lights in the corners of the ceiling
    for (const [x, z, hh] of [[r.x0, r.z0 + 2, 2], [r.x0, r.z0 + 3, 1], [r.x1, r.z1 - 2, 2], [r.x1, r.z1 - 3, 1]]) for (let i = 1; i <= hh; i++) put(x, fl + i, z, B.CRYSTAL_C);    // crystal grown into the walls
    const h = SITE.hatch;
    for (let dz = 0; dz <= 2; dz++) for (let dx = -1; dx <= 1; dx++) put(h.x + dx, ceil, h.z + dz, 0);      // the ceiling is open over the steps
    // steps from the floor up to the hatch: one under the open ceiling, the other four under the hatch itself
    // (from each step the head has room to rise onto the next)
    put(h.x - 1, fl + 1, h.z + 1, B.HULL_G);
    for (const [dx, dz, n] of [[0, 1, 2], [0, 0, 3], [1, 0, 4], [1, 1, 3]]) for (let i = 1; i <= n; i++) put(h.x + dx, fl + i, h.z + dz, B.HULL_G);
    anchors.hatch = [];
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { put(h.x + dx, top, h.z + dz, B.SEAL); clearUp(h.x + dx, top + 1, h.z + dz); anchors.hatch.push({ x: h.x + dx, y: top, z: h.z + dz }); }
    put(r.x0 + 2, fl + 1, r.z1 - 1, K.CHEST);
    anchors.room = { chest: { x: r.x0 + 2, y: fl + 1, z: r.z1 - 1 }, floor: fl, x: (r.x0 + r.x1) / 2 + 0.5, z: (r.z0 + r.z1) / 2 + 0.5 };
  }
  // a floating asteroid over the west lowland, with a gravity pad on the ground beside it and a chest on its crown
  {
    const a = SITE.rock, R = a.r;
    let crown = -1;
    for (let dz = -R - 2; dz <= R + 2; dz++) for (let dx = -R - 2; dx <= R + 2; dx++) {
      const d2 = dx * dx + dz * dz, wob = 1 + (hash3(Math.floor(Math.atan2(dz, dx) * 3), 1, 77, 713) - 0.5) * 0.3, Rw = R * wob;
      let topY = -1;
      for (let y = Math.floor(a.y - R * 1.5); y <= Math.ceil(a.y + R * 0.6); y++) {
        const dy = y + 0.5 - a.y, inside = dy >= 0 ? d2 + (dy * 2.2) ** 2 < Rw * Rw : Math.sqrt(d2) < Rw * (1 + dy / (R * 1.4));
        if (!inside) continue;
        const q = hash3(a.x + dx, y, a.z + dz, 721);
        put(a.x + dx, y, a.z + dz, q < 0.06 ? K.ROCK_AMETHYST : q < 0.09 ? K.ROCK_DIAMOND : q < 0.14 ? B.ORE_V : B.FLOAT);
        topY = y;
      }
      if (topY >= 0) { put(a.x + dx, topY, a.z + dz, B.LICHEN_B); if (dx === 0 && dz === 0) crown = topY; else if (hash3(dx, 3, dz, 725) < 0.12) put(a.x + dx, topY + 1, a.z + dz, B.BULB); }
    }
    put(a.x, crown + 1, a.z, K.CHEST);
    { const x = a.x + 2, z = a.z - 1; let t = crown + 2; while (t > a.y - 4 && world.get(x, t, z) === 0) t--;      // a crystal on the crown
      for (let i = 1; i <= 3; i++) put(x, t + i, z, B.CRYSTAL_V);
      anchors.tips.push({ x, y: t + 4, z, id: B.CRYSTAL_V, h: 1.6, lx: 0.04, lz: -0.03 }); }
    const p = SITE.rockPad, pt = topH(p.x, p.z);
    put(p.x, pt, p.z, B.GRAV); clearUp(p.x, pt + 1, p.z);
    anchors.rock = { x: a.x + 0.5, y: crown + 1, z: a.z + 0.5, chest: { x: a.x, y: crown + 1, z: a.z }, marker: { x: a.x, y: crown - 2, z: a.z }, pad: { x: p.x, y: pt, z: p.z } };
  }

  const surfaceY = (x, z) => {
    const X = clamp(Math.floor(x), 0, SX - 1), Z = clamp(Math.floor(z), 0, SZ - 1);
    for (let y = SY - 1; y >= 0; y--) {
      const id = world.get(X, y, Z);
      if (id && id !== B.FERN && id !== B.BULB && id !== B.REED && id !== B.TENDRIL && id !== B.FRINGE && id !== B.WATER) return y + 1;
    }
    return 0;
  };
  const groundY = (x, z) => topH(Math.floor(x), Math.floor(z)) + 1;
  /** The top block the home's ground rule gives a dry column (for the land just outside, so the rim carries on). */
  const topRule = (x, z, h, slope) => {
    const nA = N.fbm2(x / 21 + 40, z / 21 + 11, 3), nB = N.n2(x / 7 + 3, z / 7 + 8);
    if (slope > 1.25 || h > 49 + nA * 6) return B.SLATE;
    return (nB > 0.34 || (lakeD(x, z) < 1.35 && nB > -0.1)) ? B.LICHEN_G : nA > 0.12 ? B.LICHEN_B : B.LICHEN_A;
  };
  return { world, anchors, surfaceY, groundY, heightF, lakeD, basaltTop: basaltAt, topRule };
}

// ------------------------------------------------------------------ the endless planet with the home in it
const shiftKeys = { x: 'x', x0: 'x', x1: 'x', z: 'z', z0: 'z', z1: 'z' };
/** A copy of o (anchors, places) with every x / z moved from the home's own coordinates into the world's. */
function toWorld(o) {
  if (Array.isArray(o)) return o.map(toWorld);
  if (!o || typeof o !== 'object') return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === 'number' && shiftKeys[k] ? v + (shiftKeys[k] === 'x' ? HOME.x0 : HOME.z0) : toWorld(v);
  return out;
}
/** The places of the home, in world coordinates. */
export const SITE = toWorld(LOCAL);
/** The sea of the meteors north of the home, the stone on its shore where they fall, and the island they reveal. */
export const SPOTS = toWorld({ meteorSea: { x: 88, z: -126, r: 50 }, landing: { x: 88, z: -70 }, island: { x: 88, z: -126, r: 8 } });
for (const k of ['meteorSea', 'island']) SPOTS[k].r = { meteorSea: 50, island: 8 }[k];

export function generateWorld() {
  const t0 = performance.now();
  const home = buildHome();
  const OX = HOME.x0, OZ = HOME.z0;
  const anchors = toWorld(home.anchors);
  anchors.ground = home.anchors.ground;
  const g = makeGen(K, { x0: OX, z0: OZ, sx: SX, sz: SZ, cell: (lx, y, lz) => home.world.get(lx, y, lz), heightF: home.heightF, basaltTop: home.basaltTop, topRule: home.topRule, tips: anchors.tips }, SPOTS);
  // what each chunk made holds besides its cells: the crystal tips and the oxygen vents in it
  const tips = new Map(), vents = new Map();
  const world = new PagedWorld({
    sx: SIZE, sy: SY, sz: SIZE, chunk: C,
    generate: (cx, cz, d) => g.fillChunk(cx, cz, d),
    onChunk: (cx, cz, extra) => { const k = cx * world.ncz + cz; if (extra.tips.length) tips.set(k, extra.tips); if (extra.vents.length) vents.set(k, extra.vents); },
  });
  // the part of the world the shared pages look at (the quest map, the day's treasure and cave, the sky island,
  // the maze): a square round the home, a little bigger than the home itself
  const A = 224, cx = OX + SX / 2, cz = OZ + SZ / 2;
  world.area = { x0: cx - A / 2, z0: cz - A / 2, x1: cx + A / 2, z1: cz + A / 2 };
  const inHome = (x, z) => x >= OX && z >= OZ && x < OX + SX && z < OZ + SZ;
  /** Feet height on the ground as made (the home's terrain, else the planet's), for props and mist. */
  const groundY = (x, z) => (inHome(x, z) ? home.groundY(x - OX, z - OZ) : g.heightAt(x, z) + 1);
  const surfaceY = (x, z) => (inHome(x, z) ? home.surfaceY(x - OX, z - OZ) : Math.max(SEA + 1, g.heightAt(x, z) + 1));
  /** Forget what the dropped chunks held (made again, they bring it back). */
  const forget = () => { for (const m of [tips, vents]) for (const k of m.keys()) if (!world.chunks.has(k)) m.delete(k); };
  return {
    world, anchors, tips, vents, forget, groundY, surfaceY, gen: g, home: { x0: OX, z0: OZ, sx: SX, sz: SZ },
    landOf: g.landOf, heightAt: g.heightAt, farSample: g.farSample, cavesIn: g.cavesIn,
    ms: performance.now() - t0,
  };
}
