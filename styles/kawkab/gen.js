// The endless planet of "kawkab", as pure functions of the position: the same (x, z) always gives the same ground,
// so any piece of the world can be made the first time it is needed, in any order, and made again identically.
//
//   lands by noise: glowing lowlands (lichen, ferns, light bulbs, giant cap plants and tendril trees), crystal
//   fields (violet lichen and crystal spires), basalt highlands of organ pipes, slate mountains, glowing alien seas
//   and lakes with luminous shores; floating asteroids high over the land, each with a gravity pad under it.
//   under the ground: caves (tunnels from a hill side down to halls) with ore in their walls, glowing ore veins.
//   oxygen vents here and there on the land: standing by one fills the suit like the base does.
//
// The hand-made home (world.js) lies in a square in the middle; the land round it grows out of its crater rim,
// and to its north lies the sea of the meteors with the landing stone on its shore (wonders.js).
// No three.js here (node can run it for measuring):  const g = makeGen(K, home);  g.fillChunk(cx, cz, data);
import { makeNoise, hash3 } from '../../shared/noise.js';
import { B } from './blocks.js';

export const SY = 84, SEA = 20, C = 32, SIZE = 16384;
const CS = 5, CS2 = 10;                         // a chunk is 32 x 32 columns: x + (z << 5) + (y << 10)

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * home: { x0, z0, sx, sz, cell(lx, y, lz), heightF(lx, lz), basaltTop(lx, lz, h) } — the hand-made square and the
 * functions its ground was made with (they go on smoothly outside it, so the crater rim can carry on).
 * spots: { meteorSea: { x, z, r }, landing: { x, z }, island: { x, z, r } } in world coordinates.
 */
export function makeGen(K, home, spots) {
  const N = makeNoise(5821), M = makeNoise(9377), Q = makeNoise(1291);
  const HX0 = home.x0, HZ0 = home.z0, HX1 = home.x0 + home.sx, HZ1 = home.z0 + home.sz;
  const HCX = (HX0 + HX1) / 2, HCZ = (HZ0 + HZ1) / 2;
  const inHome = (x, z) => x >= HX0 && x < HX1 && z >= HZ0 && z < HZ1;
  /** Distance from (x, z) to the home square (0 inside it). */
  const homeDist = (x, z) => { const dx = x < HX0 ? HX0 - x : x >= HX1 ? x - HX1 + 1 : 0, dz = z < HZ0 ? HZ0 - z : z >= HZ1 ? z - HZ1 + 1 : 0; return Math.hypot(dx, dz); };
  const MS = spots.meteorSea, LD = spots.landing;
  const BLEND = 56;                              // the crater rim melts into the planet over this many blocks

  // ------------------------------------------------------------------ the ground of one column
  const col = { hf: 0, s: 0, wc: 0, wb: 0, mm: 0, wl: SEA, basalt: false, home: 0, lake: 0 };

  /** Lands, coast, mountains: the slow fields. */
  function climate(x, z) {
    let s = N.fbm2(x / 980 + 0.37, z / 980 - 0.61, 4) + N.fbm2(x / 240 + 5.1, z / 240 + 1.7, 2) * 0.12 + 0.1;
    const dh = Math.hypot(x - HCX, z - HCZ);
    s = mix(s, Math.max(s, 0.42), smooth(420, 150, dh));                // the home stands on a wide land
    const dm = Math.hypot(x - MS.x, z - MS.z);
    s = mix(s, -0.42, smooth(MS.r + 30, MS.r, dm));                   // the sea of the meteors, north of the home
    col.s = s;
    const T = M.fbm2(x / 720 + 3.3, z / 720 - 1.9, 3);
    col.wc = smooth(0.04, 0.2, T);                                     // crystal fields
    const bq = M.fbm2(x / 520 + 41.2, z / 520 - 17.5, 3);
    col.wb = smooth(0.16, 0.32, bq) * (1 - col.wc * 0.7);               // basalt highlands
    const land = smooth(0, 0.08, s);
    col.mm = smooth(0.12, 0.34, Q.fbm2(x / 640 + 9.2, z / 640 - 4.4, 3)) * land;
  }
  // basalt organ pipes: voronoi cells, each a column of its own height
  const CELL = 2.6;
  function cellRand(x, z) {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    let best = 1e9, r = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = (gx + i + 0.5 + (hash3(gx + i, 7, gz + j, 3) - 0.5) * 0.7) * CELL, cz = (gz + j + 0.5 + (hash3(gx + i, 9, gz + j, 5) - 0.5) * 0.7) * CELL;
      const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
      if (d < best) { best = d; r = hash3(gx + i, 11, gz + j, 7); }
    }
    return r;
  }

  /** The height of the planet itself (not the home), and its fields in col. */
  function planetHeight(x, z) {
    climate(x, z);
    const { s, wc, wb, mm } = col;
    let h = SEA + 3.2 + N.fbm2(x / 85, z / 85, 3) * 3 + N.fbm2(x / 19, z / 19, 2) * 0.7;          // glowing lowlands
    if (wc > 0.01) h = mix(h, SEA + 4 + N.fbm2(x / 60 + 3, z / 60, 3) * 2.5 + N.ridge2(x / 34, z / 34, 2) * 3.5, wc);   // crystal fields: low ridges
    col.basalt = false;
    if (wb > 0.05) {
      const step = SEA + 5 + wb * (6 + cellRand(x, z) * 9) + N.fbm2(x / 40, z / 40, 2) * 3;
      if (step > h) { h = Math.floor(step); col.basalt = wb > 0.35; }
    }
    if (mm > 0.01) h += mm * (Q.ridge2(x / 125 + 3.7, z / 125 - 8.1, 4) * 50 + 5);
    if (h > SEA + 46) h = SEA + 46 + (h - SEA - 46) * 0.5;            // the peaks stay under the top of the world
    // glowing lakes: hollows below the sea, away from the mountains
    const lk = N.fbm2(x / 210 - 11.3, z / 210 + 5.9, 2);
    const land = smooth(0.0, 0.06, s);
    const lake = smooth(0.33, 0.42, lk) * land * (1 - mm);
    col.lake = lake;
    if (lake > 0) { h = mix(h, SEA - 4.5, lake); if (lake > 0.3) col.basalt = false; }
    // the coast: the land comes down to a shining shore, the sea floor goes down to 14 under the water
    if (s < 0) { h = Math.max(SEA - 14, SEA + 1 + s * 65 + N.fbm2(x / 30, z / 30, 2) * 1.5); col.basalt = false; }
    else h = mix(SEA + 1.2, h, smooth(0, 0.035, s));
    return h;
  }
  /** The full column: the planet, grown out of the home's rim near it, and the flat by the landing stone. */
  function column(x, z) {
    let h = planetHeight(x, z);
    col.wl = SEA; col.home = 0;
    const d = homeDist(x, z);
    if (d < BLEND) {
      const t = smooth(0, BLEND, d), lx = x - HX0, lz = z - HZ0;
      let hh = home.heightF(lx, lz);
      const edge = 0.32 + 0.22 * N.n2(x / 11 + 3.3, z / 11 - 7.1);      // the organ pipes of the rim end raggedly, not on a line
      const bt = t < edge ? home.basaltTop(lx, lz, Math.floor(hh)) : -1;
      if (bt >= 0) hh = bt;
      h = mix(hh, h, t);
      col.home = 1 - t;
      if (bt >= 0) col.basalt = true;
    }
    const dl = Math.hypot(x - LD.x, z - LD.z);
    if (dl < 9) h = mix(h, SEA + 1.5, 1 - smooth(5, 9, dl));            // the landing stone stands on a flat of the shore
    col.hf = h;
    return col;
  }
  const hInt = (hf) => clamp(Math.floor(hf), 2, SY - 10);
  /** Surface height (top block y) of a column as made, before caves and plants. */
  const heightAt = (x, z) => hInt(column(Math.floor(x), Math.floor(z)).hf);

  // ------------------------------------------------------------------ caves (as in the open lands: tunnels from a hill side down to halls)
  const RC = 128, regions = new Map();
  function regionCaves(rx, rz) {
    const key = rx * 4096 + rz;
    let list = regions.get(key);
    if (list) return list;
    list = [];
    const n = [0, 1, 1, 2][Math.floor(hash3(rx, 1, rz, 901) * 4)];
    for (let i = 0; i < n; i++) {
      let best = null;
      for (let t = 0; t < 7; t++) {
        const x = rx * RC + 8 + Math.floor(hash3(rx, i * 16 + t, rz, 903) * (RC - 16)), z = rz * RC + 8 + Math.floor(hash3(rx, i * 16 + t, rz, 905) * (RC - 16));
        if (homeDist(x, z) < 30) continue;
        const h = planetHeight(x, z);
        if (h < SEA + 3 || col.s < 0.04) continue;
        const gx = planetHeight(x + 3, z) - planetHeight(x - 3, z), gz = planetHeight(x, z + 3) - planetHeight(x, z - 3);
        const slope = Math.hypot(gx, gz);
        if (!best || slope > best.slope) best = { x, z, h, slope, ang: Math.atan2(-gz, -gx) + Math.PI };
      }
      if (!best) continue;
      const seed = rx * 131 + rz * 71 + i * 7, blobs = [];
      let x = best.x + 0.5, z = best.z + 0.5, ang = best.slope > 1.5 ? best.ang : hash3(rx, i, rz, 907) * Math.PI * 2;
      let y = Math.floor(best.h) + 2.2;
      const len = 44 + Math.floor(hash3(rx, i, rz, 909) * 30), deep = 5 + Math.floor(hash3(rx, i, rz, 911) * 8);
      for (let k = 0; k < len; k++) {
        const r = 1.65 + hash3(k, seed, 3, 11) * 0.5;
        blobs.push(x, y, z, r, 1.7, r);
        const pitch = k > 9 && y > deep ? -0.42 : 0;
        ang += (hash3(k, seed, 1, 13) - 0.5) * 0.55;
        x += Math.cos(ang); z += Math.sin(ang); y += pitch;
        if (k > 12 && k % 17 === 0) blobs.push(x, y + 0.8, z, 4.5, 2.8, 4.5);
      }
      blobs.push(x, y + 1, z, 5.5, 3.2, 5.5);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let b = 0; b < blobs.length; b += 6) { x0 = Math.min(x0, blobs[b] - blobs[b + 3]); x1 = Math.max(x1, blobs[b] + blobs[b + 3]); z0 = Math.min(z0, blobs[b + 2] - blobs[b + 5]); z1 = Math.max(z1, blobs[b + 2] + blobs[b + 5]); }
      const inside = (cx, cy, cz) => { for (let b = 0; b < blobs.length; b += 6) { const q = ((cx + 0.5 - blobs[b]) / blobs[b + 3]) ** 2 + ((cy + 0.5 - blobs[b + 1]) / blobs[b + 4]) ** 2 + ((cz + 0.5 - blobs[b + 2]) / blobs[b + 5]) ** 2; if (q < 1) return true; } return false; };
      list.push({ blobs, x0, x1, z0, z1, inside, mouth: { x: best.x, y: Math.floor(best.h) + 1, z: best.z } });
    }
    if (regions.size > 600) regions.clear();
    regions.set(key, list);
    return list;
  }
  function cavesIn(x0, x1, z0, z1, out = []) {
    out.length = 0;
    for (let rz = Math.floor((z0 - 80) / RC); rz <= Math.floor((z1 + 80) / RC); rz++)
      for (let rx = Math.floor((x0 - 80) / RC); rx <= Math.floor((x1 + 80) / RC); rx++)
        for (const c of regionCaves(rx, rz)) if (c.x1 >= x0 && c.x0 < x1 && c.z1 >= z0 && c.z0 < z1) out.push(c);
    return out;
  }
  const _cv = [];
  const carvedAt = (x, y, z) => { for (const c of cavesIn(x, x + 1, z, z + 1, _cv)) if (c.inside(x, y, z)) return true; return false; };

  // ------------------------------------------------------------------ floating asteroids (one in some 112-block regions), each with a gravity pad under its rim
  const RA = 112, rocks = new Map();
  function asteroidOf(ax, az) {
    const key = ax * 4096 + az;
    let a = rocks.get(key);
    if (a !== undefined) return a;
    a = null;
    if (hash3(ax, 3, az, 701) < 0.42) {
      const x = ax * RA + 24 + Math.floor(hash3(ax, 4, az, 703) * (RA - 48)), z = az * RA + 24 + Math.floor(hash3(ax, 5, az, 705) * (RA - 48));
      if (homeDist(x, z) > 40 && Math.hypot(x - MS.x, z - MS.z) > MS.r + 40) {
        const g = hInt(column(x, z).hf);
        if (g >= SEA) {
          const r = 4 + hash3(ax, 6, az, 707) * 3.5, y = Math.min(SY - 12, Math.max(g + 24, 46) + Math.floor(hash3(ax, 7, az, 709) * 8));
          const pa = hash3(ax, 8, az, 711) * Math.PI * 2, px = Math.round(x + Math.cos(pa) * (r + 2.5)), pz = Math.round(z + Math.sin(pa) * (r + 2.5));
          const pg = hInt(column(px, pz).hf);
          if (pg >= SEA && y - pg >= 16 && y - pg <= 40) a = { x, z, y, r, seed: ax * 31 + az * 17, pad: { x: px, z: pz, y: pg } };
        }
      }
    }
    if (rocks.size > 2000) rocks.clear();
    rocks.set(key, a);
    return a;
  }
  function asteroidsIn(x0, x1, z0, z1) {
    const out = [];
    for (let az = Math.floor((z0 - 12) / RA); az <= Math.floor((z1 + 12) / RA); az++) for (let ax = Math.floor((x0 - 12) / RA); ax <= Math.floor((x1 + 12) / RA); ax++) { const a = asteroidOf(ax, az); if (a) out.push(a); }
    return out;
  }
  /** Is cell (x, y, z) inside asteroid a? A lumpy lens: round on top, coming to a point below. */
  function inRock(a, x, y, z) {
    const dx = x + 0.5 - a.x, dz = z + 0.5 - a.z, dy = y + 0.5 - a.y, d2 = dx * dx + dz * dz;
    const wob = 1 + (hash3(Math.floor(Math.atan2(dz, dx) * 3), 1, a.seed, 713) - 0.5) * 0.3;
    const R = a.r * wob;
    if (dy >= 0) return d2 + (dy * 2.2) ** 2 < R * R;
    return Math.sqrt(d2) < R * (1 + dy / (a.r * 1.4));
  }

  // ------------------------------------------------------------------ oxygen vents: one in some 72-block cells, on dry land
  const VC = 72, vents = new Map();
  function ventOf(gx, gz) {
    const key = gx * 8192 + gz;
    let v = vents.get(key);
    if (v !== undefined) return v;
    v = null;
    if (hash3(gx, 1, gz, 801) < 0.7) {
      const x = gx * VC + 10 + Math.floor(hash3(gx, 2, gz, 803) * (VC - 20)), z = gz * VC + 10 + Math.floor(hash3(gx, 3, gz, 805) * (VC - 20));
      if (homeDist(x, z) > 6) {
        const c = column(x, z), h = hInt(c.hf);
        if (h > SEA && c.s > 0.03 && !carvedAt(x, h, z)) v = { x, y: h, z };
      }
    }
    if (vents.size > 4000) vents.clear();
    vents.set(key, v);
    return v;
  }
  function ventsIn(x0, x1, z0, z1) {
    const out = [];
    for (let gz = Math.floor(z0 / VC); gz <= Math.floor((z1 - 1) / VC); gz++) for (let gx = Math.floor(x0 / VC); gx <= Math.floor((x1 - 1) / VC); gx++) { const v = ventOf(gx, gz); if (v && v.x >= x0 && v.x < x1 && v.z >= z0 && v.z < z1) out.push(v); }
    return out;
  }

  // ------------------------------------------------------------------ one chunk
  const W = C + 2, HF = new Float32Array(W * W), HI = new Int16Array(W * W), S = new Float32Array(W * W);
  const WC = new Float32Array(W * W), MM = new Float32Array(W * W), BAS = new Uint8Array(W * W), HOM = new Float32Array(W * W), LK = new Float32Array(W * W);
  const caveList = [];

  /** The top block of a dry column (needs the four neighbour heights for the slope). */
  function topOf(x, z, h, slope, s, wc, mm, basalt, homeW, lake) {
    if (basalt) return B.BASALT;
    if (homeW > 0.45 + (hash3(x, 5, z, 61) - 0.5) * 0.3) return home.topRule(x - HX0, z - HZ0, h, slope);      // the home's own ground, dithered out
    if ((s < 0.02 || lake > 0.15) && h <= SEA + 1) return B.SHORE;
    if (slope > 1.25 + (1 - homeW) * 0.3 || h > SEA + 29 + N.fbm2(x / 18 + 4, z / 18, 2) * 6 || (mm > 0.3 && slope > 1)) return B.SLATE;
    const nA = N.fbm2(x / 21 + 40, z / 21 + 11, 3), nB = N.n2(x / 7 + 3, z / 7 + 8);
    if (wc > 0.5) return nB > 0.42 ? B.LICHEN_G : B.LICHEN_B;
    return nB > 0.34 ? B.LICHEN_G : nA > 0.12 ? B.LICHEN_B : B.LICHEN_A;
  }

  /** Fill one chunk (32 x SY x 32, x + (z << 5) + (y << 10)). Returns { tips, vents } found in it. */
  function fillChunk(cx, cz, d) {
    const X0 = cx * C, Z0 = cz * C;
    const tips = [], ventList = [];
    // the home square: its cells, as built
    const hx0 = Math.max(X0, HX0), hx1 = Math.min(X0 + C, HX1), hz0 = Math.max(Z0, HZ0), hz1 = Math.min(Z0 + C, HZ1);
    const homeAll = hx0 === X0 && hx1 === X0 + C && hz0 === Z0 && hz1 === Z0 + C;
    if (hx0 < hx1 && hz0 < hz1) {
      for (let y = 0; y < SY; y++) for (let z = hz0; z < hz1; z++) for (let x = hx0; x < hx1; x++) {
        const id = home.cell(x - HX0, y, z - HZ0);
        if (id) d[(x - X0) + ((z - Z0) << CS) + (y << CS2)] = id;
      }
      for (const t of home.tips) if (t.x >= X0 && t.x < X0 + C && t.z >= Z0 && t.z < Z0 + C) tips.push(t);
    }
    if (homeAll) return { tips, vents: ventList };
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = X0 + i - 1, z = Z0 + j - 1, k = i + j * W;
      const c = column(x, z);
      HF[k] = c.hf; HI[k] = hInt(c.hf); S[k] = c.s; WC[k] = c.wc; MM[k] = c.mm; BAS[k] = c.basalt ? 1 : 0; HOM[k] = c.home; LK[k] = c.lake;
    }
    // ---- the columns
    for (let j = 1; j <= C; j++) for (let i = 1; i <= C; i++) {
      const x = X0 + i - 1, z = Z0 + j - 1;
      if (inHome(x, z)) continue;
      const k = i + j * W, h = HI[k];
      const slope = Math.hypot(HF[k + 1] - HF[k - 1], HF[k + W] - HF[k - W]) * 0.5;
      const wet = h < SEA;
      const top = wet ? B.LAKEBED : topOf(x, z, h, slope, S[k], WC[k], MM[k], BAS[k], HOM[k], LK[k]);
      const base = (i - 1) + ((j - 1) << CS);
      for (let y = 0; y <= h; y++) {
        const depth = h - y;
        let id;
        if (wet) id = depth < 2 ? B.LAKEBED : B.SLATE;
        else if (top === B.BASALT) id = depth < 20 ? B.BASALT : B.SLATE;
        else if (top === B.SHORE) id = depth < 3 ? B.SHORE : B.SLATE;
        else if (top === B.SLATE) id = B.SLATE;
        else id = depth === 0 ? top : depth < 4 ? B.SOIL : B.SLATE;
        if (id === B.SLATE && depth > 1) {
          // the glowing ore of the planet in clusters, and the common ores of the kit by depth
          const cell = hash3(x >> 2, y >> 2, z >> 2, 91);
          if (cell < 0.05) { if (hash3(x, y, z, 92) < 0.55) id = hash3(x >> 3, y >> 3, z >> 3, 94) < 0.5 ? B.ORE : B.ORE_V; }
          else if (cell < 0.085 && y < SEA + 14) { if (hash3(x, y, z, 95) < 0.5) id = K.ROCK_COAL; }
          else if (cell < 0.097 && y < SEA - 6) { if (hash3(x, y, z, 93) < 0.5) id = K.ROCK_GOLD; }
          else if (y < 12 && hash3(x, y, z, 79) < 0.002) id = K.ROCK_DIAMOND;
          else if (y < 10 && hash3(x, y, z, 81) < 0.001) id = K.ROCK_EMERALD;
          else if (y < 9 && hash3(x, y, z, 83) < 0.0008) id = K.ROCK_RUBY;
          else if (y < 14 && hash3(x, y, z, 85) < 0.0012) id = K.ROCK_AMETHYST;
        }
        d[base + (y << CS2)] = id;
      }
      if (wet) for (let y = h + 1; y <= SEA; y++) d[base + (y << CS2)] = B.SEA;
    }
    // ---- caves
    const caves = cavesIn(X0, X0 + C, Z0, Z0 + C, caveList);
    if (caves.length) {
      const carved = [];
      for (const cv of caves) {
        const b = cv.blobs;
        for (let n = 0; n < b.length; n += 6) {
          const bx = b[n], by = b[n + 1], bz = b[n + 2], rx = b[n + 3], ry = b[n + 4], rz = b[n + 5];
          const xa = Math.max(X0, Math.floor(bx - rx)), xb = Math.min(X0 + C - 1, Math.ceil(bx + rx));
          const za = Math.max(Z0, Math.floor(bz - rz)), zb = Math.min(Z0 + C - 1, Math.ceil(bz + rz));
          if (xa > xb || za > zb) continue;
          const ya = Math.max(2, Math.floor(by - ry)), yb = Math.min(SY - 2, Math.ceil(by + ry));
          for (let z = za; z <= zb; z++) for (let x = xa; x <= xb; x++) {
            if (inHome(x, z)) continue;
            const i = x - X0 + 1, j = z - Z0 + 1, k = i + j * W;
            let wetTop = 1e9;                                    // never open the sea or a lake into a cave
            for (const kk of [k, k + 1, k - 1, k + W, k - W]) if (HI[kk] < SEA) wetTop = Math.min(wetTop, HI[kk] - 3);
            for (let y = ya; y <= yb; y++) {
              if (y >= wetTop) break;
              const q = ((x + 0.5 - bx) / rx) ** 2 + ((y + 0.5 - by) / ry) ** 2 + ((z + 0.5 - bz) / rz) ** 2;
              if (q >= 1) continue;
              const a = (x - X0) + ((z - Z0) << CS) + (y << CS2);
              if (!d[a] || d[a] === B.SEA) continue;
              d[a] = 0; carved.push(a);
            }
          }
        }
      }
      // ore in the cave walls: rare stones deepest, the planet's glowing ore everywhere
      const steps = [1, -1, 1 << CS, -(1 << CS), 1 << CS2, -(1 << CS2)];
      for (const a of carved) {
        const ax = a & 31, az = (a >> CS) & 31;
        for (let s = 0; s < 6; s++) {
          if ((s === 0 && ax === 31) || (s === 1 && ax === 0) || (s === 2 && az === 31) || (s === 3 && az === 0)) continue;
          const b2 = a + steps[s], id = d[b2];
          if (id !== B.SLATE && id !== B.BASALT) continue;
          const y = b2 >> CS2, x = X0 + (b2 & 31), z = Z0 + ((b2 >> CS) & 31);
          const r = hash3(x, y, z, 301);
          if (y < 10 && r < 0.012) d[b2] = K.ROCK_RUBY;
          else if (y < 14 && r < 0.026) d[b2] = K.ROCK_EMERALD;
          else if (y < 18 && r < 0.042) d[b2] = K.ROCK_AMETHYST;
          else if (y < 13 && r < 0.06) d[b2] = K.ROCK_DIAMOND;
          else if (y < SEA - 4 && r < 0.058) d[b2] = K.ROCK_GOLD;
          else if (y < SEA + 16 && r < 0.13) d[b2] = K.ROCK_COAL;
          else if (r < 0.17) d[b2] = B.ORE;
          else if (r < 0.2) d[b2] = B.ORE_V;
        }
      }
    }
    const inC = (x, y, z) => x >= X0 && z >= Z0 && x < X0 + C && z < Z0 + C && y >= 0 && y < SY && !inHome(x, z);
    const at = (x, y, z) => (x - X0) + ((z - Z0) << CS) + (y << CS2);
    const put = (x, y, z, id) => { if (inC(x, y, z)) d[at(x, y, z)] = id; };
    const putAir = (x, y, z, id) => { if (inC(x, y, z) && d[at(x, y, z)] === 0) d[at(x, y, z)] = id; };
    const topAt = (i, j) => { const base = (i - 1) + ((j - 1) << CS); for (let y = SY - 1; y > 0; y--) if (d[base + (y << CS2)]) return y; return 0; };

    // ---- small plants, on the ground as it is after the caves
    for (let j = 1; j <= C; j++) for (let i = 1; i <= C; i++) {
      const k = i + j * W, x = X0 + i - 1, z = Z0 + j - 1;
      if (inHome(x, z)) continue;
      const t = topAt(i, j), base = (i - 1) + ((j - 1) << CS), id = d[base + (t << CS2)];
      if (t >= SY - 2 || d[base + ((t + 1) << CS2)] !== 0) continue;
      const r = hash3(x, 0, z, 51);
      let p = 0;
      if (id === B.SHORE) { if (r < 0.16 && t === SEA) p = B.REED; else if (r > 0.95) p = B.BULB; }
      else if (id === B.LICHEN_G || id === B.LICHEN_A || id === B.LICHEN_B) {
        const dens = id === B.LICHEN_G ? 2.2 : 1, crys = WC[k] > 0.5;
        if (crys) { if (r < 0.012) p = B.BULB; else if (r < 0.03) p = B.FERN; }
        else if (r < 0.045 * dens) p = B.FERN;
        else if (r < 0.068 * dens) p = B.BULB;
      }
      if (p) d[base + ((t + 1) << CS2)] = p;
    }

    // ---- big plants and crystal spires: one place in each cell of a grid, decided by a hash (the same seen from any chunk)
    function capDisc(cx2, cy, cz2, R) {
      const layers = [[-1, R + 0.25, R - 1.45, B.CAP_RIM], [0, R, -1, B.CAP], [1, R * 0.8, -1, B.CAP]];
      if (R >= 3.5) layers.push([2, R * 0.52, -1, B.CAP]);
      if (R >= 6.2) layers.push([3, R * 0.24, -1, B.CAP]);
      const ri = Math.ceil(R + 1);
      for (const [dy, rOut, rIn, id] of layers) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
        const dd = Math.hypot(dx, dz);
        if (dd > rOut || dd <= rIn) continue;
        const X = Math.round(cx2) + dx, Z = Math.round(cz2) + dz;
        put(X, cy + dy, Z, id);
        if (dy === -1 && hash3(X, cy, Z, 91) < 0.55) putAir(X, cy - 2, Z, B.FRINGE);
      }
    }
    function capPlant(x, z, y0, Hh, R) {
      const thick = R >= 5.5 ? 2 : 1, lx = (hash3(x, 1, z, 21) - 0.5) * 3, lz = (hash3(x, 2, z, 23) - 0.5) * 3;
      let cx2 = x, cz2 = z;
      for (let i = -1; i < Hh; i++) {
        const t = Math.max(0, i) / Hh, kk = Math.sin(t * Math.PI * 0.5);
        cx2 = x + Math.round(lx * kk * t); cz2 = z + Math.round(lz * kk * t);
        for (let a = 0; a < thick; a++) for (let b = 0; b < thick; b++) put(cx2 + a, y0 + i, cz2 + b, B.STALK);
      }
      const off = (thick - 1) / 2;
      capDisc(cx2 + off, y0 + Hh, cz2 + off, R);
    }
    function tendrilTree(x, z, y0, Hh, seed) {
      let tx = x, tz = z, a = hash3(x, 3, z, seed) * 6.283;
      for (let i = -1; i < Hh; i++) {
        const X = Math.round(tx), Z = Math.round(tz);
        put(X, y0 + i, Z, B.BARK);
        if (i < 1) { put(X - 1, y0 + i, Z, B.BARK); put(X, y0 + i, Z - 1, B.BARK); }
        tx += Math.cos(a) * 0.28; tz += Math.sin(a) * 0.28; a += (hash3(i, 5, x + z, seed) - 0.5) * 1.2;
      }
      const nb = 4 + Math.floor(hash3(x, 6, z, seed) * 3);
      for (let kq = 0; kq < nb; kq++) {
        const ang = (kq / nb) * 6.283 + hash3(kq, 7, x, seed) * 0.9, Lb = 4 + Math.floor(hash3(kq, 8, z, seed) * 3);
        let bx = tx, bz = tz, by = y0 + Hh - 1 - (kq % 2), px = Math.round(bx), pz = Math.round(bz);
        for (let s = 1; s <= Lb; s++) {
          bx += Math.cos(ang); bz += Math.sin(ang);
          if (s <= Lb * 0.4) by += 1; else if (s > Lb * 0.7) by -= 1;
          const X = Math.round(bx), Z = Math.round(bz);
          if (X !== px && Z !== pz) put(px, by, Z, B.BARK);
          put(X, by, Z, B.BARK);
          px = X; pz = Z;
          if (s >= 2 && hash3(X, by + 3, Z, seed + 2) < 0.62) {
            const len = 1 + Math.floor(hash3(X, by, Z, seed + 1) * 4), g = y0 + 1;
            for (let q = 1; q <= len && by - q > g; q++) putAir(X, by - q, Z, B.TENDRIL);
          }
        }
      }
    }
    function spire(x, z, y0, Hh, id, lx, lz, w0) {
      for (let i = 0; i <= Hh; i++) {
        const t = i / Hh, w = t < 0.32 ? w0 : t < 0.68 ? Math.max(1, w0 - 1) : 1;
        const ox = Math.round(lx * i), oz = Math.round(lz * i), o = Math.floor((w - 1) / 2);
        for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) put(x + ox - o + a, y0 + i, z + oz - o + b, id);
      }
      const tx = x + Math.round(lx * Hh), tz = z + Math.round(lz * Hh);
      if (tx >= X0 && tx < X0 + C && tz >= Z0 && tz < Z0 + C && !inHome(tx, tz)) tips.push({ x: tx, y: y0 + Hh + 1, z: tz, id, h: Math.min(3.4, 1.1 + Hh * 0.17 + hash3(x, 7, z, 43) * 0.5), lx, lz });
    }
    function cluster(x, z, y0, Hh, id, n) {
      spire(x, z, y0, Hh, id, (hash3(x, 1, z, 31) - 0.5) * 0.16, (hash3(x, 2, z, 33) - 0.5) * 0.16, Hh >= 11 ? 3 : 2);
      for (let kq = 0; kq < n; kq++) {
        const a = (kq / n) * 6.283 + hash3(x, kq, z, 35) * 1.5, dd = 2 + hash3(x, kq, z, 37) * 2.6;
        const sx = Math.round(x + Math.cos(a) * dd), sz = Math.round(z + Math.sin(a) * dd);
        const hh = Math.max(2, Math.round(Hh * (0.25 + hash3(x, kq, z, 39) * 0.4)));
        spire(sx, sz, heightAt(sx, sz) - 1, hh, id, Math.cos(a) * 0.22, Math.sin(a) * 0.22, hh >= 6 ? 2 : 1);
      }
    }
    for (const f of featuresIn(X0 - 12, X0 + C + 12, Z0 - 12, Z0 + C + 12)) {
      if (f.kind === 'cap') capPlant(f.x, f.z, f.y, f.h, f.r);
      else if (f.kind === 'tree') tendrilTree(f.x, f.z, f.y, f.h, f.seed);
      else cluster(f.x, f.z, f.y - 2, f.h, f.id, f.n);
    }

    // ---- floating asteroids: rock with crystal on top and rare stones inside; a gravity pad on the ground under the rim
    for (const a of asteroidsIn(X0, X0 + C, Z0, Z0 + C)) {
      const R = Math.ceil(a.r * 1.3) + 1;
      for (let z = Math.max(Z0, Math.floor(a.z) - R); z <= Math.min(Z0 + C - 1, Math.floor(a.z) + R); z++)
        for (let x = Math.max(X0, Math.floor(a.x) - R); x <= Math.min(X0 + C - 1, Math.floor(a.x) + R); x++) {
          if (inHome(x, z)) continue;
          let topY = -1;
          for (let y = Math.floor(a.y - a.r * 1.5); y <= Math.ceil(a.y + a.r * 0.6); y++) {
            if (!inRock(a, x, y, z)) continue;
            const r = hash3(x, y, z, 721);
            d[at(x, y, z)] = r < 0.05 ? K.ROCK_AMETHYST : r < 0.075 ? K.ROCK_DIAMOND : r < 0.1 ? B.ORE_V : r < 0.14 ? B.ORE : B.FLOAT;
            topY = y;
          }
          if (topY >= 0) { d[at(x, topY, z)] = B.LICHEN_B; const r = hash3(x, 2, z, 723); if (r < 0.06) d[at(x, topY + 1, z)] = B.BULB; else if (r < 0.14) d[at(x, topY + 1, z)] = B.FERN; }
        }
      // a small crystal on its crown
      if (a.x >= X0 && a.x < X0 + C && a.z >= Z0 && a.z < Z0 + C) {
        let ty = Math.ceil(a.y + a.r * 0.6); while (ty > a.y && !inRock(a, Math.floor(a.x), ty, Math.floor(a.z))) ty--;
        spire(Math.floor(a.x), Math.floor(a.z), ty + 1, 3 + (a.seed & 3), (a.seed & 1) ? B.CRYSTAL_V : B.CRYSTAL_C, 0.05, -0.04, 1);
      }
      const p = a.pad;
      if (p.x >= X0 && p.x < X0 + C && p.z >= Z0 && p.z < Z0 + C && !inHome(p.x, p.z)) {
        const base = (p.x - X0) + ((p.z - Z0) << CS), ground = (id) => id === B.LICHEN_A || id === B.LICHEN_B || id === B.LICHEN_G || id === B.SLATE || id === B.SHORE || id === B.BASALT || id === B.SOIL;
        let t = SY - 2; while (t > 1 && !ground(d[base + (t << CS2)])) t--;
        if (d[base + (t << CS2)] === B.SHORE && t < SEA) continue;
        for (let y = t + 1; y < t + 4; y++) d[base + (y << CS2)] = 0;      // nothing over the pad
        d[base + (t << CS2)] = B.GRAV;
      }
    }

    // ---- oxygen vents (on the ground as it is now)
    for (const v of ventsIn(X0, X0 + C, Z0, Z0 + C)) {
      const base = (v.x - X0) + ((v.z - Z0) << CS), small = (id) => id === B.FERN || id === B.BULB || id === B.REED;
      let t = SY - 2; while (t > 1 && (!d[base + (t << CS2)] || small(d[base + (t << CS2)]))) t--;
      const g0 = d[base + (t << CS2)];
      if (!(g0 === B.LICHEN_A || g0 === B.LICHEN_B || g0 === B.LICHEN_G || g0 === B.SLATE || g0 === B.SHORE || g0 === B.BASALT || g0 === B.SOIL)) continue;
      if (small(d[base + ((t + 1) << CS2)])) d[base + ((t + 1) << CS2)] = 0;
      if (d[base + ((t + 1) << CS2)]) continue;
      d[base + (t << CS2)] = B.VENT;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {      // a ring of basalt round it
        const xx = v.x + dx, zz = v.z + dz;
        if (xx < X0 || zz < Z0 || xx >= X0 + C || zz >= Z0 + C) continue;
        const bb = (xx - X0) + ((zz - Z0) << CS);
        let tt = SY - 2; while (tt > 1 && (!d[bb + (tt << CS2)] || d[bb + (tt << CS2)] === B.FERN || d[bb + (tt << CS2)] === B.BULB)) tt--;
        if (d[bb + (tt << CS2)] !== B.SEA) { d[bb + (tt << CS2)] = B.BASALT; if (d[bb + ((tt + 1) << CS2)] === B.FERN || d[bb + ((tt + 1) << CS2)] === B.BULB) d[bb + ((tt + 1) << CS2)] = 0; }
      }
      ventList.push({ x: v.x, y: t + 1, z: v.z });
    }
    // ---- the landing stone of the meteors on the shore north of the home: a ring of basalt round a block of meteor rock
    if (Math.abs(LD.x - X0 - 16) < 24 && Math.abs(LD.z - Z0 - 16) < 24) {
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const x = LD.x + dx, z = LD.z + dz, r = Math.hypot(dx, dz);
        if (x < X0 || z < Z0 || x >= X0 + C || z >= Z0 + C || (r > 0.5 && (r < 2.6 || r > 3.6)) || (dz < -1 && Math.abs(dx) <= 1)) continue;      // (open towards the sea: the bridge goes out there)
        const base = (x - X0) + ((z - Z0) << CS);
        let t = SY - 2; while (t > 1 && !d[base + (t << CS2)]) t--;
        for (let y = t + 1; y < t + 5; y++) d[base + (y << CS2)] = 0;
        if (r < 0.5) d[base + (t << CS2)] = B.METEOR;
        else { d[base + ((t + 1) << CS2)] = B.BASALT; if (hash3(x, 1, z, 31) < 0.5) d[base + ((t + 2) << CS2)] = B.BASALT; }
      }
    }
    return { tips, vents: ventList };
  }

  // ------------------------------------------------------------------ big plants: one candidate in each 7 x 7 cell
  const G = 7, featCache = new Map();
  function featureOf(gx, gz) {
    const key = gx * 8192 + gz;
    let f = featCache.get(key);
    if (f !== undefined) return f;
    f = null;
    const x = gx * G + 1 + Math.floor(hash3(gx, 1, gz, 521) * (G - 2)), z = gz * G + 1 + Math.floor(hash3(gx, 2, gz, 523) * (G - 2));
    const r = hash3(gx, 3, gz, 525);
    if (homeDist(x, z) > 9 && r < 0.5) {
      const c = column(x, z), h = hInt(c.hf);
      if (h > SEA && c.s > 0.04 && !c.basalt && c.mm < 0.35) {
        const hx1 = heightAt(x + 1, z), hx0 = heightAt(x - 1, z), hz1 = heightAt(x, z + 1), hz0 = heightAt(x, z - 1);
        const level = Math.abs(hx1 - h) <= 1 && Math.abs(hx0 - h) <= 1 && Math.abs(hz1 - h) <= 1 && Math.abs(hz0 - h) <= 1;
        if (level && h < SEA + 26 && !carvedAt(x, h, z) && !carvedAt(x, h + 1, z)) {
          const cc = column(x, z), glade = N.fbm2(x / 26 + 9, z / 26, 2), rr = hash3(gx, 4, gz, 527);
          if (cc.wc > 0.5) {
            if (r < 0.13) f = { kind: 'crystal', x, z, y: h + 1, h: 4 + Math.floor(rr * 9), id: hash3(gx, 5, gz, 529) < 0.6 ? B.CRYSTAL_V : B.CRYSTAL_C, n: 2 + Math.floor(rr * 3) };
            else if (r < 0.17) f = { kind: 'cap', x, z, y: h + 1, h: 3 + Math.floor(rr * 4), r: 1.8 + rr * 1.6 };
          } else {
            const dens = 0.05 + 0.2 * smooth(-0.1, 0.45, glade);
            if (r < dens * 0.45) f = { kind: 'cap', x, z, y: h + 1, h: 3 + Math.floor(rr * 9), r: 2 + rr * 4.2 };
            else if (r < dens) f = { kind: 'tree', x, z, y: h + 1, h: 6 + Math.floor(rr * 5), seed: 3 + (gx & 15) * 2 };
            else if (r < dens + 0.02) f = { kind: 'crystal', x, z, y: h + 1, h: 3 + Math.floor(rr * 6), id: B.CRYSTAL_C, n: 2 };
          }
        }
      }
    }
    if (featCache.size > 20000) featCache.clear();
    featCache.set(key, f);
    return f;
  }
  function featuresIn(x0, x1, z0, z1) {
    const out = [];
    for (let gz = Math.floor(z0 / G); gz <= Math.floor((z1 - 1) / G); gz++) for (let gx = Math.floor(x0 / G); gx <= Math.floor((x1 - 1) / G); gx++) { const f = featureOf(gx, gz); if (f) out.push(f); }
    return out;
  }

  // ------------------------------------------------------------------ what the rest of the game asks
  /** One of 'home' | 'glow' | 'crystal' | 'basalt' | 'mountain' | 'shore' | 'sea'. */
  function landOf(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (inHome(x, z)) return 'home';
    const c = column(x, z), h = hInt(c.hf);
    if (h < SEA) return 'sea';
    if (c.home > 0.6) return 'home';
    if ((c.s < 0.02 || c.lake > 0.15) && h <= SEA + 1) return 'shore';
    if (h > SEA + 22 && c.mm > 0.2) return 'mountain';
    if (c.basalt || c.wb > 0.5) return 'basalt';
    return c.wc > 0.5 ? 'crystal' : 'glow';
  }
  /** For the far view: the ground height (with the cap plants of the lowlands) and its colour (sRGB 0..1). */
  const COL = {
    glow: [0.2, 0.4, 0.38], lichen: [0.24, 0.36, 0.38], violet: [0.32, 0.27, 0.46], slate: [0.33, 0.34, 0.4], basalt: [0.2, 0.2, 0.25],
    shore: [0.5, 0.56, 0.5], sea: [0.06, 0.32, 0.36], deep: [0.03, 0.18, 0.24], caps: [0.62, 0.36, 0.62],
  };
  function farSample(x, z, out) {
    x = Math.floor(x); z = Math.floor(z);
    if (inHome(x, z)) {                                          // the home as built (only ever far away when seen from out in the planet)
      const lx = x - HX0, lz = z - HZ0;
      let y = SY - 1; while (y > 0 && !home.cell(lx, y, lz)) y--;
      const id = home.cell(lx, y, lz), c = id === B.WATER ? COL.sea : id === B.BASALT ? COL.basalt : id === B.SLATE ? COL.slate : id === B.SHORE ? COL.shore : id >= B.HULL_W ? [0.75, 0.75, 0.78] : COL.lichen;
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = y + 1; out[4] = id === B.WATER ? 1 : 0;
      return out;
    }
    const c = column(x, z), h = c.hf;
    let rgb;
    out[4] = 0;
    let y = h;
    if (h < SEA - 0.5) { out[4] = 1; y = SEA + 0.88; rgb = SEA - h > 6 ? COL.deep : COL.sea; }
    else if ((c.s < 0.02 || c.lake > 0.15) && h <= SEA + 1.5) rgb = COL.shore;
    else if (c.basalt) rgb = COL.basalt;
    else if (h > SEA + 28 || (c.mm > 0.3 && h > SEA + 16)) rgb = COL.slate;
    else {
      const g = 0.5 + N.fbm2(x / 26 + 9, z / 26, 2);
      const caps = (1 - c.wc) * clamp((g - 0.5) * 1.2) * 0.5;
      const base = c.wc > 0.5 ? COL.violet : COL.glow;
      out[0] = mix(base[0], COL.caps[0], caps); out[1] = mix(base[1], COL.caps[1], caps); out[2] = mix(base[2], COL.caps[2], caps);
      out[3] = y + caps * 6;
      return out;
    }
    out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2]; out[3] = y;
    return out;
  }

  return { SY, SEA, C, SIZE, fillChunk, column, heightAt, landOf, farSample, cavesIn, asteroidsIn, ventsIn, inHome, homeDist };
}
