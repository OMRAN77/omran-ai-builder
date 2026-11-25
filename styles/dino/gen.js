// The endless land of the world of the dinosaurs, as pure functions of the position (the same contract as
// styles/barari/gen.js, which styles/barari/world.js uses in its place in this mode):
//
//   lands by noise: a hot jungle of tall trees (vines hanging from their crowns, a giant now and then) and giant
//   ferns; open fern plains; swamps of mud, murky pools, reeds and horsetails; ash badlands of banded red rock;
//   volcanoes standing in rugged black highlands, a lake of lava in each crater and streams of lava down their
//   sides; rivers and lakes; a warm sea with islands. No snow anywhere.
//   under the ground: the same caves as barari (tunnels from a hill side to halls with fires), coal, gold and
//   diamond by depth, and amber: rare drops in the rock, a few showing on cliff faces.
//   wonders (ideas.js makes them work): ancient stone towers of resonance with a glowing crystal on top and a stone
//   that rings at their foot; on the flank of each volcano a fossil cave in a mound of black rock behind a moat of lava.
//
// No three.js here (node can run it for measuring):  const g = makeGen(K);  g.fillChunk(cx, cz, data);
import { makeNoise, hash3 } from '../../shared/noise.js';
import { B } from '../barari/blocks.js';

export const SY = 96, SEA = 30, C = 32, SIZE = 16384, MID = SIZE / 2;
const CS = 5, CS2 = 10;                         // a chunk is 32 x 32 columns: x + (z << 5) + (y << 10)

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export function makeGen(K) {
  const N = makeNoise(5101), M = makeNoise(6203), Q = makeNoise(7307), V = makeNoise(8419);

  // ------------------------------------------------------------------ volcanoes
  // At most one in each 560-block cell, on land, decided by a hash: { x, z, R (base radius), peak, rc (crater, a
  // share of R), lava (the level of the crater's lava lake), ph (where its lava streams run) }.
  const VC = 560, vcache = new Map();
  function volcanoOf(gx, gz) {
    const key = gx * 4096 + gz;
    let v = vcache.get(key);
    if (v !== undefined) return v;
    v = null;
    if (hash3(gx, 3, gz, 2101) < 0.62) {
      const x = gx * VC + 150 + Math.floor(hash3(gx, 4, gz, 2103) * (VC - 300)), z = gz * VC + 150 + Math.floor(hash3(gx, 5, gz, 2105) * (VC - 300));
      if (continent(x, z) > 0.14) {
        const R = 125 + hash3(gx, 6, gz, 2107) * 45, peak = SEA + 51 + hash3(gx, 7, gz, 2109) * 4;
        const rc = 0.12, rim = SEA + 4 + (peak - SEA - 4) * Math.pow(1 - rc, 1.3);
        v = { x, z, R, peak, rc, rim, floor: rim - 9, lava: Math.floor(rim - 9) + 4, ph: hash3(gx, 8, gz, 2111) * TAU };
      }
    }
    if (vcache.size > 2000) vcache.clear();
    vcache.set(key, v);
    return v;
  }
  /** The nearest volcano to (x, z) and the distance in shares of its radius. */
  const near = { v: null, d: 9 };
  function nearestVolcano(x, z) {
    near.v = null; near.d = 9;
    const gx = Math.floor(x / VC), gz = Math.floor(z / VC);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const v = volcanoOf(gx + i, gz + j);
      if (!v) continue;
      const d = Math.hypot(x - v.x, z - v.z) / v.R;
      if (d < near.d) { near.d = d; near.v = v; }
    }
    return near;
  }

  // ------------------------------------------------------------------ the ground of one column
  const col = { hf: 0, s: 0, wj: 0, wp: 0, wsw: 0, wa: 0, wv: 0, mm: 0, vd: 9, vk: null, wl: SEA, swamp: false, lava: 0, flow: false, river: 0, isl: 0 };

  /** Land (> 0) or sea (< 0), before the islands. */
  const continent = (x, z) => N.fbm2(x / 1000 + 0.47, z / 1000 - 0.91, 4) + N.fbm2(x / 240 + 3.3, z / 240 + 2.1, 2) * 0.12 + 0.1;
  /** Lands, coast, islands, mountains, the volcanic country: the slow fields. */
  function climate(x, z) {
    let s = continent(x, z);
    // islands out in the sea: a ring of beach round a low green hill
    const I = V.fbm2(x / 150 + 7.7, z / 150 - 3.1, 3);
    const isl = smooth(0.22, 0.36, I) * smooth(-0.6, -0.12, s) * (s < 0 ? 1 : 0);
    col.isl = isl;
    if (isl > 0) s = mix(s, 0.11, isl);
    col.s = s;
    const T = M.fbm2(x / 800 + 3.3, z / 800 - 1.9, 3), H = M.fbm2(x / 600 + 50.7, z / 600 - 30.2, 3);
    const wsw = smooth(0.1, 0.2, H) * smooth(0.12, 0.0, T);
    const wa = smooth(0.12, 0.22, T) * smooth(0.04, -0.06, H) * (1 - wsw);
    const wj = (1 - wsw - wa) * smooth(-0.08, 0.04, H + T * 0.3);
    const wp = Math.max(0, 1 - wsw - wa - wj);
    col.wsw = wsw; col.wa = wa; col.wj = wj; col.wp = wp;
    const land = smooth(0, 0.08, s);
    const mq = Q.fbm2(x / 700 + 9.2, z / 700 - 4.4, 3);
    col.mm = clamp(smooth(0.16, 0.34, mq)) * land * (1 - isl);
    const nv = nearestVolcano(x, z);
    col.vd = nv.d; col.vk = nv.v;
    col.wv = smooth(1.55 + N.fbm2(x / 70 + 3, z / 70 - 8, 2) * 0.5, 1.0, nv.d) * land;      // ragged at its edge
  }

  /** The height without the flat at the start. */
  function baseHeight(x, z) {
    climate(x, z);
    const { wj, wp, wsw, wa, wv, mm, s, vd, vk } = col;
    col.lava = 0; col.flow = false;
    let h = 0;
    if (wp > 0.01) h += wp * (SEA + 3 + N.fbm2(x / 90, z / 90, 3) * 3.5);
    if (wj > 0.01) h += wj * (SEA + 5 + N.fbm2(x / 64 + 7, z / 64, 3) * 7 + N.ridge2(x / 46, z / 46, 2) * 4);
    if (wsw > 0.01) h += wsw * (SEA + 0.15 + N.fbm2(x / 16 + 2, z / 16 - 5, 2) * 3.6 + N.fbm2(x / 60 - 4, z / 60, 2) * 1.6);      // mud banks and pools
    if (wa > 0.01) {
      // mesas: the ground rises in steps of three
      let r = N.ridge2(x / 80 + 4, z / 80 - 2, 3) * 16;
      const f = r / 3 - Math.floor(r / 3);
      r = Math.floor(r / 3) * 3 + 3 * smooth(0.72, 1, f);
      h += wa * (SEA + 3 + r);
    }
    h /= Math.max(0.01, wj + wp + wsw + wa);
    if (mm > 0.01) h += mm * (Q.ridge2(x / 120 + 3.7, z / 120 - 8.1, 4) * 44 + 4);
    if (wv > 0.01) h += wv * (6 + N.ridge2(x / 44 + 1.3, z / 44 + 6.6, 3) * 12);       // the rugged black country round a volcano
    if (h > SEA + 40) h = SEA + 40 + (h - SEA - 40) * 0.6;
    const land = smooth(0.0, 0.06, s), calm = smooth(0.95, 1.4, vd);
    // rivers wind down to the sea level (not up a volcano)
    const rv = Math.abs(N.fbm2(x / 760 + 3.1, z / 760 - 7.3, 3)) + smooth(0.05, -0.15, M.fbm2(x / 1300 - 2.2, z / 1300 + 8.4, 2)) * 0.2;
    const valley = smooth(0.06, 0.02, rv) * land * calm, river = smooth(0.02, 0.008, rv) * land * calm;
    col.river = river;
    h = mix(h, SEA + 1.6, valley * 0.85);
    h = mix(h, SEA - 2.6, river);
    const lk = N.fbm2(x / 230 - 11.3, z / 230 + 5.9, 2);
    const lake = smooth(0.34, 0.42, lk) * land * (1 - mm) * calm * (1 - wsw);      // (a swamp has pools, not a lake)
    h = mix(h, SEA - 4.5, lake);
    // the coast: a beach, then the sea floor down to 16 under the water
    if (s < 0) h = Math.max(SEA - 16, SEA + 1 + s * 70 + N.fbm2(x / 30, z / 30, 2) * 1.5);
    else h = mix(SEA + 1.2, h, smooth(0, 0.07, s));
    // the volcano: a cone with gullies, a crater at the top, a lake of lava in it and streams of lava down its sides
    if (vk && vd < 1) {
      const rough = N.fbm2(x / 16, z / 16, 2) * 3 * (1 - vd);
      const ang = Math.atan2(z - vk.z, x - vk.x), gully = (N.ridge2(ang * 3.2 + vk.ph, vd * 3.5, 2) - 0.5) * 5 * (1 - vd) * smooth(vk.rc, 0.3, vd);
      let cone = SEA + 4 + (vk.peak - SEA - 4) * Math.pow(1 - vd, 1.3) + rough - gully;
      if (vd < vk.rc) { cone = mix(vk.floor, vk.rim, Math.pow(vd / vk.rc, 3)); col.lava = vk.lava; }
      else if (vd < 0.75) {
        // three streams from the rim, each wandering a little, two blocks wide
        const dist = vd * vk.R, step = TAU / 3, wig = N.fbm2(dist / 26 + vk.ph, 3.3, 2) * 0.8;
        let a = (ang - vk.ph - wig) % step; if (a < 0) a += step; if (a > step / 2) a -= step;
        const k = Math.floor((((ang - vk.ph - wig) % TAU) + TAU) % TAU / step + 0.5) % 3;
        if (Math.abs(a) * dist < 1.15 && vd < 0.5 + hash3(Math.floor(vk.x), k, Math.floor(vk.z), 2113) * 0.25) { col.flow = true; cone -= 0.6; }
      }
      if (cone > h) h = cone;
    }
    return h;
  }

  let spawn = null;                             // set once the start is found (the ground is flattened round it)
  /** The full column: height and water level. */
  function column(x, z) {
    let h = baseHeight(x, z);
    col.wl = SEA;
    if (spawn) {
      const d = Math.hypot(x - spawn.x, z - spawn.z) / 9;
      if (d < 1.5) h = mix(h, spawn.y + 0.5, 1 - smooth(0.55, 1.45, d));
    }
    col.hf = h;
    col.swamp = col.wsw > 0.4 && col.s > 0.05;                        // still water among the swamps is murky
    return col;
  }
  const hInt = (hf) => clamp(Math.floor(hf), 3, SY - 10);

  // ------------------------------------------------------------------ caves (as in barari)
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
        const h = baseHeight(x, z);
        if (h < SEA + 3 || col.s < 0.04 || col.vd < 1) continue;
        if (spawn && Math.hypot(x - spawn.x, z - spawn.z) < 24) continue;
        const gx = baseHeight(x + 3, z) - baseHeight(x - 3, z), gz = baseHeight(x, z + 3) - baseHeight(x, z - 3);
        const slope = Math.hypot(gx, gz);
        if (!best || slope > best.slope) best = { x, z, h, slope, ang: Math.atan2(-gz, -gx) + Math.PI };
      }
      if (!best) continue;
      const seed = rx * 131 + rz * 71 + i * 7;
      const blobs = [], halls = [];
      let x = best.x + 0.5, z = best.z + 0.5, ang = best.slope > 1.5 ? best.ang : hash3(rx, i, rz, 907) * Math.PI * 2;
      let y = Math.floor(best.h) + 2.2;
      const len = 44 + Math.floor(hash3(rx, i, rz, 909) * 30), deep = 6 + Math.floor(hash3(rx, i, rz, 911) * 10);
      for (let k = 0; k < len; k++) {
        const r = 1.65 + hash3(k, seed, 3, 11) * 0.5;
        blobs.push(x, y, z, r, 1.7, r);
        const pitch = k > 9 && y > deep ? -0.42 : 0;
        ang += (hash3(k, seed, 1, 13) - 0.5) * 0.55;
        x += Math.cos(ang); z += Math.sin(ang); y += pitch;
        if (k > 12 && k % 17 === 0) { blobs.push(x, y + 0.8, z, 4.5, 2.8, 4.5); halls.push({ x, y: y - 1.7, z, end: false }); }
      }
      blobs.push(x, y + 1, z, 5.5, 3.2, 5.5);
      halls.push({ x, y: y - 1.7, z, end: true });
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let b = 0; b < blobs.length; b += 6) { x0 = Math.min(x0, blobs[b] - blobs[b + 3]); x1 = Math.max(x1, blobs[b] + blobs[b + 3]); z0 = Math.min(z0, blobs[b + 2] - blobs[b + 5]); z1 = Math.max(z1, blobs[b + 2] + blobs[b + 5]); }
      const cave = { blobs, halls, x0, x1, z0, z1, mouth: { x: best.x, y: Math.floor(best.h) + 1, z: best.z, yaw: Math.atan2(-Math.cos(ang), -Math.sin(ang)) }, fires: [] };
      const inside = (cx, cy, cz) => { for (let b = 0; b < blobs.length; b += 6) { const q = ((cx + 0.5 - blobs[b]) / blobs[b + 3]) ** 2 + ((cy + 0.5 - blobs[b + 1]) / blobs[b + 4]) ** 2 + ((cz + 0.5 - blobs[b + 2]) / blobs[b + 5]) ** 2; if (q < 1) return true; } return false; };
      for (const hl of halls) {
        if (hl.y > SEA - 8 && !hl.end) continue;
        for (let t = 0; t < 12; t++) {
          const fx = Math.round(hl.x + (hash3(t, 1, Math.round(hl.z), 401) - 0.5) * 6), fz = Math.round(hl.z + (hash3(t, 2, Math.round(hl.x), 403) - 0.5) * 6);
          let fy = Math.round(hl.y) + 3;
          if (!inside(fx, fy, fz)) continue;
          while (fy > 3 && inside(fx, fy - 1, fz)) fy--;
          if (!inside(fx, fy + 1, fz) || fy - 1 > hInt(baseHeight(fx, fz)) - 2) continue;
          cave.fires.push({ x: fx, y: fy, z: fz });
          break;
        }
      }
      cave.inside = inside;
      list.push(cave);
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


  // ------------------------------------------------------------------ the towers of resonance
  // At most one in each 384-block cell, on firm level ground away from the volcanoes: { x, z, y (its foot), H, bell }.
  const TC = 384, towerCache = new Map();
  function towerOf(gx, gz) {
    const key = gx * 4096 + gz;
    let T = towerCache.get(key);
    if (T !== undefined) return T;
    T = null;
    if (hash3(gx, 41, gz, 2301) < 0.8) {
      for (let t = 0; t < 12 && !T; t++) {
        const x = gx * TC + 40 + Math.floor(hash3(gx, t, gz, 2303) * (TC - 80)), z = gz * TC + 40 + Math.floor(hash3(gx, t, gz, 2305) * (TC - 80));
        const c = column(x, z), h = hInt(c.hf);
        if (h < c.wl || c.lava || c.flow || c.vd < 1.3 || c.wv > 0.3 || c.s < 0.06 || c.swamp || c.wj > 0.45 || h > SEA + 28 || h < SEA + 2) continue;      // (in the open: the jungle would hide it)
        if (spawn && Math.hypot(x - spawn.x, z - spawn.z) < 30) continue;
        let level = true;
        for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, 3]]) { const q = column(x + dx, z + dz), qh = hInt(q.hf); if (qh < q.wl || Math.abs(qh - h) > 2) { level = false; break; } }
        if (!level) continue;
        T = { x, z, y: h + 1, H: 21 + Math.floor(hash3(gx, t, gz, 2307) * 6), bell: { x, y: h + 1, z: z + 3 }, key: gx + ',' + gz };
      }
    }
    if (towerCache.size > 2000) towerCache.clear();
    towerCache.set(key, T);
    return T;
  }
  function towersIn(x0, x1, z0, z1) {
    const out = [];
    for (let gz = Math.floor((z0 - 8) / TC); gz <= Math.floor((z1 + 8) / TC); gz++) for (let gx = Math.floor((x0 - 8) / TC); gx <= Math.floor((x1 + 8) / TC); gx++) {
      const T = towerOf(gx, gz);
      if (T && T.x - 4 < x1 && T.x + 4 >= x0 && T.z - 4 < z1 && T.z + 4 >= z0) out.push(T);
    }
    return out;
  }
  function towersNear(x, z, r) { return towersIn(x - r, x + r, z - r, z + r).filter((T) => Math.hypot(T.x - x, T.z - z) <= r).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)); }

  // ------------------------------------------------------------------ the fossil caves: one on the flank of each volcano
  // { x, z, y (its floor), ox, oz (its mouth faces out, away from the volcano), chest, fires, key }
  const fossilCache = new Map();
  function fossilOf(gx, gz) {
    const key = gx * 4096 + gz;
    let F = fossilCache.get(key);
    if (F !== undefined) return F;
    F = null;
    const v = volcanoOf(gx, gz);
    if (v) {
      for (let t = 0; t < 6 && !F; t++) {
        const a = v.ph + Math.PI / 3 + (t % 2 ? 1 : -1) * Math.floor((t + 1) / 2) * 0.35 + (t >= 4 ? Math.PI : 0), d = v.R * 0.84;
        const x = Math.round(v.x + Math.cos(a) * d), z = Math.round(v.z + Math.sin(a) * d);
        const c = column(x, z), h = hInt(c.hf);
        if (c.lava || c.flow || h < c.wl || h > SEA + 36) continue;
        const ox = Math.cos(a), oz = Math.sin(a), px = -oz, pz = ox;
        F = { x, z, y: h + 1, ox, oz, chest: { x: Math.round(x - ox * 3), y: h + 1, z: Math.round(z - oz * 3) },
          fires: [{ x: Math.round(x + px * 3), y: h + 1, z: Math.round(z + pz * 3) }, { x: Math.round(x - px * 3), y: h + 1, z: Math.round(z - pz * 3) }], key: gx + ',' + gz };
      }
    }
    if (fossilCache.size > 2000) fossilCache.clear();
    fossilCache.set(key, F);
    return F;
  }
  function fossilsIn(x0, x1, z0, z1) {
    const out = [];
    for (let gz = Math.floor((z0 - 200) / VC); gz <= Math.floor((z1 + 200) / VC); gz++) for (let gx = Math.floor((x0 - 200) / VC); gx <= Math.floor((x1 + 200) / VC); gx++) {
      const F = fossilOf(gx, gz);
      if (F && F.x - 13 < x1 && F.x + 13 >= x0 && F.z - 13 < z1 && F.z + 13 >= z0) out.push(F);
    }
    return out;
  }
  function fossilsNear(x, z, r) { return fossilsIn(x - r, x + r, z - r, z + r).filter((F) => Math.hypot(F.x - x, F.z - z) <= r).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)); }

  // ------------------------------------------------------------------ one chunk
  const W = C + 2, HF = new Float32Array(W * W), HI = new Int16Array(W * W), WL = new Int16Array(W * W);
  const S = new Float32Array(W * W), LANDS = new Uint8Array(W * W), SWAMP = new Uint8Array(W * W), LAVA = new Int16Array(W * W), FLOW = new Uint8Array(W * W);
  const WJ = new Float32Array(W * W), WP = new Float32Array(W * W), WSW = new Float32Array(W * W), WA = new Float32Array(W * W), WV = new Float32Array(W * W), MM = new Float32Array(W * W), VD = new Float32Array(W * W);
  const L_JUNGLE = 1, L_PLAINS = 2, L_SWAMP = 3, L_ASH = 4;
  const caveList = [];

  /** Which land this column is drawn as (a few blocks of dither where two lands meet). */
  function pickLand(x, z, wj, wp, wsw, wa) {
    wj *= wj * wj * wj; wp *= wp * wp * wp; wsw *= wsw * wsw * wsw; wa *= wa * wa * wa;
    const t = wj + wp + wsw + wa || 1;
    const r = clamp(0.5 + N.fbm2(x / 7 + 40, z / 7 + 40, 2) * 0.7 + (hash3(x, 1, z, 5) - 0.5) * 0.25) * t;
    return r < wsw ? L_SWAMP : r < wsw + wa ? L_ASH : r < wsw + wa + wj ? L_JUNGLE : L_PLAINS;
  }
  /** The top block of a column (the same for a column of this chunk and for a tree's foot in the next one). */
  function topOf(x, z, h, slope, exposed, land, s, wl, mm, wv, vd, lava, flow) {
    if (lava && h < lava) return B.LAVA;
    if (h < wl) return B.WATER;
    if (s < 0.035 && h <= SEA + 2) return B.SAND;
    if (flow) return B.LAVA;
    if (vd < 1 || wv > 0.55) {
      if (vd > 1.05 && wv > 0.7 && h < SEA + 26 && slope < 0.8 && N.fbm2(x / 13 + 5, z / 13 - 2, 2) > 0.3) return B.LAVA;      // pools of lava in the black country
      return slope > 1.15 || exposed || N.fbm2(x / 9, z / 9 + 3, 2) < 0.1 ? B.BASALT : B.ASH;       // black rock with drifts of ash
    }
    if ((mm > 0.35 && slope > 1.5) || (mm > 0.2 && h > SEA + 19 + N.fbm2(x / 18 + 4, z / 18, 2) * 10)) return hash3(x, 6, z, 71) < 0.12 ? B.GRAVEL : B.STONE;
    if (land === L_ASH) return slope > 0.9 || exposed ? B.RED_ROCK : B.ASH;
    if (land === L_SWAMP) return h <= SEA + 1 + N.fbm2(x / 6, z / 6, 2) * 1.5 ? B.MUD : B.JUNGLE_GRASS;
    if (slope > 1.7) return B.STONE;
    return land === L_JUNGLE ? B.JUNGLE_GRASS : B.FERN_GRASS;
  }

  /** Fill one chunk (32 x SY x 32, x + (z << 5) + (y << 10)) of the world. Returns the fires lit in it. */
  function fillChunk(cx, cz, d) {
    const X0 = cx * C, Z0 = cz * C;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = X0 + i - 1, z = Z0 + j - 1, k = i + j * W;
      const c = column(x, z);
      HF[k] = c.hf; HI[k] = hInt(c.hf); WL[k] = c.wl; S[k] = c.s; SWAMP[k] = c.swamp ? 1 : 0; LAVA[k] = c.lava; FLOW[k] = c.flow ? 1 : 0;
      WJ[k] = c.wj; WP[k] = c.wp; WSW[k] = c.wsw; WA[k] = c.wa; WV[k] = c.wv; MM[k] = c.mm; VD[k] = c.vd;
    }
    const fires = [];
    for (let j = 1; j <= C; j++) for (let i = 1; i <= C; i++) {
      const k = i + j * W, x = X0 + i - 1, z = Z0 + j - 1, h = HI[k], wl = WL[k];
      const slope = Math.hypot(HF[k + 1] - HF[k - 1], HF[k + W] - HF[k - W]) * 0.5;
      const exposed = HI[k + 1] < h || HI[k - 1] < h || HI[k + W] < h || HI[k - W] < h;
      const land = pickLand(x, z, WJ[k], WP[k], WSW[k], WA[k]);
      LANDS[k] = land;
      const top = topOf(x, z, h, slope, exposed, land, S[k], wl, MM[k], WV[k], VD[k], LAVA[k], FLOW[k]);
      const base = (i - 1) + ((j - 1) << CS);
      const wet = h < wl && top !== B.LAVA, volcanic = VD[k] < 1 || WV[k] > 0.55;
      for (let y = 0; y <= h; y++) {
        const depth = h - y;
        let id;
        if (wet) id = depth < 2 ? (SWAMP[k] ? B.MUD : B.SEABED) : B.STONE;
        else if (top === B.LAVA) id = depth === 0 ? B.LAVA : depth < 8 ? B.BASALT : B.STONE;
        else if (top === B.SAND) id = depth < 3 ? B.SAND : depth < 7 ? B.SANDSTONE : B.STONE;
        else if (top === B.GRAVEL) id = depth < 2 ? B.GRAVEL : B.STONE;
        else if (top === B.BASALT || (top === B.ASH && volcanic)) id = depth === 0 ? top : depth < 12 ? B.BASALT : B.STONE;
        else if (top === B.ASH || top === B.RED_ROCK) id = depth === 0 ? top : depth < 12 ? B.RED_ROCK : B.STONE;
        else if (top === B.MUD) id = depth < 3 ? B.MUD : B.STONE;
        else if (top === B.JUNGLE_GRASS || top === B.FERN_GRASS) id = depth === 0 ? top : depth < 4 ? B.DIRT : B.STONE;
        else id = B.STONE;
        if (id === B.STONE && y < 8) id = B.DEEPROCK;
        if (y === 0) id = B.DEEPROCK;
        if ((id === B.STONE || id === B.DEEPROCK) && depth > 2) {
          const cell = hash3(x >> 2, y >> 2, z >> 2, 91);
          if (cell < 0.07 && y < SEA + 22) { if (hash3(x, y, z, 92) < 0.55) id = K.ROCK_COAL; }
          else if (cell < 0.085 && y < SEA - 8) { if (hash3(x, y, z, 93) < 0.5) id = K.ROCK_GOLD; }
          else if (cell >= 0.085 && cell < 0.0885 && y > SEA - 14 && y < SEA + 18) { if (hash3(x, y, z, 97) < 0.35) id = B.AMBER; }      // amber: a few drops together
          else if (y < 12 && hash3(x, y, z, 79) < 0.0018) id = K.ROCK_DIAMOND;
          else if (y < 10 && hash3(x, y, z, 81) < 0.0009) id = K.ROCK_EMERALD;
          else if (y < 8 && hash3(x, y, z, 83) < 0.0006) id = K.ROCK_RUBY;
        } else if (id === B.RED_ROCK && depth > 1 && hash3(x, y, z, 99) < 0.006) id = B.AMBER;       // now and then a drop in a cliff face
        d[base + (y << CS2)] = id;
      }
      if (wet) for (let y = h + 1; y <= wl; y++) d[base + (y << CS2)] = SWAMP[k] ? B.SWAMPWATER : B.WATER;
      if (top === B.LAVA && LAVA[k]) for (let y = h + 1; y <= LAVA[k]; y++) d[base + (y << CS2)] = B.LAVA;      // the crater's lake
      // flames dance here and there on the lava
      if (top === B.LAVA && hash3(x, 3, z, 2201) < 0.04) { const ty = LAVA[k] ? Math.max(h, LAVA[k]) : h; if (ty + 1 < SY) d[base + ((ty + 1) << CS2)] = K.FIRE; }
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
            const i = x - X0 + 1, j = z - Z0 + 1, k = i + j * W;
            if (spawn && Math.abs(x - spawn.x) < 14 && Math.abs(z - spawn.z) < 14) continue;
            let wetTop = 1e9;
            for (const kk of [k, k + 1, k - 1, k + W, k - W]) if (HI[kk] < WL[kk] || LAVA[kk] || FLOW[kk]) wetTop = Math.min(wetTop, HI[kk] - 3);
            for (let y = ya; y <= yb; y++) {
              if (y >= wetTop) break;
              const q = ((x + 0.5 - bx) / rx) ** 2 + ((y + 0.5 - by) / ry) ** 2 + ((z + 0.5 - bz) / rz) ** 2;
              if (q >= 1) continue;
              const a = (x - X0) + ((z - Z0) << CS) + (y << CS2);
              if (!d[a] || d[a] === B.LAVA) continue;
              d[a] = 0; carved.push(a);
            }
          }
        }
        for (const f of cv.fires) {
          if (f.x < X0 || f.x >= X0 + C || f.z < Z0 || f.z >= Z0 + C) continue;
          const a = (f.x - X0) + ((f.z - Z0) << CS) + (f.y << CS2);
          if (d[a] === 0 && d[a - (1 << CS2)] !== 0 && d[a - (1 << CS2)] !== B.WATER && d[a - (1 << CS2)] !== B.SWAMPWATER) { d[a] = K.FIRE; fires.push(f); }
        }
      }
      const steps = [1, -1, 1 << CS, -(1 << CS), 1 << CS2, -(1 << CS2)];
      for (const a of carved) {
        const ax = a & 31, az = (a >> CS) & 31;
        for (let s = 0; s < 6; s++) {
          if ((s === 0 && ax === 31) || (s === 1 && ax === 0) || (s === 2 && az === 31) || (s === 3 && az === 0)) continue;
          const b2 = a + steps[s], id = d[b2];
          if (id !== B.STONE && id !== B.DEEPROCK && id !== B.SANDSTONE && id !== B.RED_ROCK && id !== B.BASALT) continue;
          const y = b2 >> CS2, x = X0 + (b2 & 31), z = Z0 + ((b2 >> CS) & 31);
          const r = hash3(x, y, z, 301);
          if (y < 10 && r < 0.012) d[b2] = K.ROCK_RUBY;
          else if (y < 14 && r < 0.026) d[b2] = K.ROCK_EMERALD;
          else if (y < 18 && r < 0.04) d[b2] = K.ROCK_AMETHYST;
          else if (y < 13 && r < 0.058) d[b2] = K.ROCK_DIAMOND;
          else if (y < SEA - 6 && r < 0.055) d[b2] = K.ROCK_GOLD;
          else if (y > SEA - 16 && r < 0.061) d[b2] = B.AMBER;
          else if (y < SEA + 16 && r < 0.14) d[b2] = K.ROCK_COAL;
        }
      }
    }
    const topAt = (i, j) => { const base = (i - 1) + ((j - 1) << CS); for (let y = SY - 1; y > 0; y--) if (d[base + (y << CS2)]) return y; return 0; };

    // ---- ground plants
    for (let j = 1; j <= C; j++) for (let i = 1; i <= C; i++) {
      const k = i + j * W, x = X0 + i - 1, z = Z0 + j - 1;
      const t = topAt(i, j), base = (i - 1) + ((j - 1) << CS), id = d[base + (t << CS2)];
      if (t >= SY - 2 || d[base + ((t + 1) << CS2)] !== 0) continue;
      if (spawn && Math.abs(x - spawn.x) < 2 && Math.abs(z - spawn.z) < 2) continue;
      const r = hash3(x, 1, z, 601);
      let put = 0;
      if (id === B.JUNGLE_GRASS) {
        const sw = LANDS[k] === L_SWAMP;
        if (sw) put = r < 0.1 ? B.HORSETAIL : r < 0.2 ? B.FERN : r < 0.24 ? B.BIGLEAF : 0;
        else put = r < 0.17 ? B.FERN : r < 0.27 ? B.BIGLEAF : r < 0.33 ? B.TUFT : r < 0.3315 ? B.NEST : 0;
      } else if (id === B.FERN_GRASS) put = r < 0.1 ? B.FERN : r < 0.17 ? B.TUFT : r < 0.19 ? B.HORSETAIL : r < 0.194 ? B.FLOWER_Y : r < 0.1955 ? B.NEST : 0;
      else if (id === B.MUD) {
        const byWater = HI[k + 1] < WL[k + 1] || HI[k - 1] < WL[k - 1] || HI[k + W] < WL[k + W] || HI[k - W] < WL[k - W];
        put = byWater && r < 0.4 ? B.REED : r < 0.12 ? B.HORSETAIL : r < 0.16 ? B.REED : 0;
      } else if (id === B.ASH && WV[k] < 0.3 && r < 0.012) put = B.SHRUB;
      else if (id === B.ASH && r > 0.995) put = B.NEST;          // nests by the volcanoes too: eggs near the hot ground
      else if (id === B.SAND && S[k] > 0.02 && r < 0.01) put = B.FERN;
      if (put) d[base + ((t + 1) << CS2)] = put;
    }

    // ---- trees: one place in each cell of a grid, decided by a hash, so a tree is the same seen from any chunk
    const inC = (x, y, z) => x >= X0 && z >= Z0 && x < X0 + C && z < Z0 + C && y >= 0 && y < SY;
    const at = (x, y, z) => (x - X0) + ((z - Z0) << CS) + (y << CS2);
    const putAir = (x, y, z, id) => { if (inC(x, y, z) && d[at(x, y, z)] === 0) d[at(x, y, z)] = id; };
    const soft = (id) => id === 0 || id === B.TUFT || id === B.FERN || id === B.BIGLEAF || id === B.HORSETAIL || id === B.REED || id === B.FLOWER_Y || id === B.NEST || id === B.VINE || id === B.JUNGLE_LEAVES || id === B.FERN_FROND;
    const putTrunk = (x, y, z, id) => { if (inC(x, y, z) && soft(d[at(x, y, z)])) d[at(x, y, z)] = id; };
    /** Vines hang from the underside of a crown: from (x, y, z) down while there is air. */
    const vine = (x, y, z, n) => { for (let i = 0; i < n; i++) { if (!inC(x, y - i, z) || d[at(x, y - i, z)] !== 0) break; d[at(x, y - i, z)] = B.VINE; } };
    /** A crown of leaves: a flattened ball, ragged at the edge; vines from some of its lowest leaves. */
    function crown(x, cy, z, R, flat, seed, vines) {
      const ri = Math.ceil(R);
      for (let dy = -ri; dy <= ri; dy++) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
        const q = (dx * dx + dz * dz) / (R * R) + ((dy + 0.3) * (dy + 0.3)) / (R * R * flat);
        if (q > 1) continue;
        if (q > 0.7 && hash3(x + dx, Math.round(cy + dy), z + dz, seed + 5) < 0.4) continue;
        putAir(x + dx, Math.round(cy + dy), z + dz, B.JUNGLE_LEAVES);
      }
      if (!vines) return;
      for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
        const dd = (dx * dx + dz * dz) / (R * R);
        if (dd > 0.95 || dd < 0.25 || hash3(x + dx, 17, z + dz, seed + 9) > vines) continue;
        // the lowest leaf of this column of the crown
        let ly = null;
        for (let dy = -ri; dy <= ri; dy++) { const yy = Math.round(cy + dy); if (inC(x + dx, yy, z + dz) && d[at(x + dx, yy, z + dz)] === B.JUNGLE_LEAVES) { ly = yy; break; } }
        if (ly !== null) vine(x + dx, ly - 1, z + dz, 2 + Math.floor(hash3(x + dx, 19, z + dz, seed) * 6));
      }
    }
    function jungleTree(t) {
      const { x, z, y: y0 } = t, hgt = 9 + Math.floor(hash3(x, 2, z, 61) * 7);
      for (let y = y0; y < y0 + hgt; y++) putTrunk(x, y, z, B.JUNGLE_LOG);
      // roots that flare at the foot, a branch with its own little crown half way up
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (hash3(x + dx, 3, z + dz, 63) < 0.5) putTrunk(x + dx, y0, z + dz, B.JUNGLE_LOG);
      const bd = Math.floor(hash3(x, 4, z, 65) * 4), bx = [1, -1, 0, 0][bd], bz = [0, 0, 1, -1][bd], by = y0 + Math.floor(hgt * 0.6);
      putTrunk(x + bx, by, z + bz, B.JUNGLE_LOG); putTrunk(x + bx * 2, by + 1, z + bz * 2, B.JUNGLE_LOG);
      crown(x + bx * 2, by + 2, z + bz * 2, 2.2, 0.5, 71, 0.25);
      crown(x, y0 + hgt, z, 3.6 + hash3(x, 5, z, 67) * 1.2, 0.42, 73, 0.35);
    }
    function giantTree(t) {
      const { x, z, y: y0 } = t, hgt = 18 + Math.floor(hash3(x, 2, z, 81) * 6);
      for (let y = y0; y < y0 + hgt; y++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) putTrunk(x + dx, y, z + dz, B.JUNGLE_LOG);
      for (const [dx, dz] of [[-1, 0], [2, 1], [0, 2], [1, -1], [-1, 1], [2, 0]]) for (let y = y0; y < y0 + 2 + Math.floor(hash3(x + dx, 3, z + dz, 83) * 2); y++) putTrunk(x + dx, y, z + dz, B.JUNGLE_LOG);       // buttress roots
      for (let b = 0; b < 3; b++) {
        const a = hash3(x, b, z, 85) * TAU, by = y0 + Math.floor(hgt * (0.55 + b * 0.12)), L = 3 + b % 2;
        let px = x + 0.5, pz = z + 0.5;
        for (let s = 1; s <= L; s++) { px += Math.cos(a); pz += Math.sin(a); putTrunk(Math.floor(px), by + (s >> 1), Math.floor(pz), B.JUNGLE_LOG); }
        crown(Math.floor(px), by + (L >> 1) + 1, Math.floor(pz), 2.6, 0.5, 87 + b, 0.3);
      }
      crown(x, y0 + hgt, z, 5.6, 0.36, 89, 0.4);
    }
    /** A giant fern: a scaly trunk, a crown of long fronds that arch out and droop. */
    function fernTree(t) {
      const { x, z, y: y0 } = t, hgt = 3 + Math.floor(hash3(x, 2, z, 91) * 4);
      for (let y = y0; y < y0 + hgt; y++) putTrunk(x, y, z, B.FERN_TRUNK);
      const ty = y0 + hgt;
      putAir(x, ty, z, B.FERN_FROND); putAir(x, ty + 1, z, B.FERN_FROND);
      const n = 6, off = hash3(x, 3, z, 93) * TAU;
      for (let k = 0; k < n; k++) {
        const a = off + k / n * TAU, L = 3.5 + hash3(x, k, z, 95) * 1.5;
        for (let s = 1; s <= L; s++) {
          const fx = Math.round(x + Math.cos(a) * s), fz = Math.round(z + Math.sin(a) * s), fy = ty + (s <= 1.5 ? 1 : s <= 2.5 ? 0 : -Math.floor((s - 2) * 0.8));
          putAir(fx, fy, fz, B.FERN_FROND);
        }
      }
    }
    function swampTree(t) {
      const { x, z, y: y0 } = t, hgt = 5 + Math.floor(hash3(x, 2, z, 101) * 3);
      for (let y = y0; y < y0 + hgt; y++) putTrunk(x, y, z, B.JUNGLE_LOG);
      for (const [dx, dz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) if (hash3(x + dx, 3, z + dz, 103) < 0.6) { putTrunk(x + dx, y0, z + dz, B.JUNGLE_LOG); putTrunk(x + dx, y0 - 1, z + dz, B.JUNGLE_LOG); }
      crown(x, y0 + hgt, z, 3.4, 0.28, 105, 0.6);
    }
    function snag(t) { const h = 3 + Math.floor(hash3(t.x, 2, t.z, 111) * 3); for (let y = t.y; y < t.y + h; y++) putTrunk(t.x, y, t.z, B.JUNGLE_LOG); }
    for (const t of treesIn(X0 - 8, X0 + C + 8, Z0 - 8, Z0 + C + 8)) {
      const r = t.kind === 'giant' ? 9 : t.kind === 'jungle' ? 7 : 5;       // how far a tree of this kind reaches from its foot
      if (t.x + r < X0 || t.x - r >= X0 + C || t.z + r < Z0 || t.z - r >= Z0 + C) continue;
      if (t.kind === 'stump') { putTrunk(t.x, t.y, t.z, B.JUNGLE_LOG); putTrunk(t.x, t.y + 1, t.z, B.JUNGLE_LOG); }
      else if (t.kind === 'jungle') jungleTree(t);
      else if (t.kind === 'giant') giantTree(t);
      else if (t.kind === 'fern') fernTree(t);
      else if (t.kind === 'swamp') swampTree(t);
      else snag(t);
    }
    // ---- the wonders, after the trees (they stand clear of them)
    const soft2 = (id) => soft(id) || id === B.FERN_TRUNK || id === B.JUNGLE_LOG || id === B.SHRUB;
    const colTop = (x, z) => { const i = x - X0 + 1, j = z - Z0 + 1; return i >= 0 && j >= 0 && i < W && j < W ? HI[i + j * W] : hInt(column(x, z).hf); };
    for (const T of towersIn(X0, X0 + C, Z0, Z0 + C)) {
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 4; dx++) {
        const cx = T.x + dx, cz = T.z + dz;
        if (!inC(cx, T.y, cz)) continue;
        for (let y = T.y; y <= T.y + T.H + 4 && y < SY; y++) if (soft2(d[at(cx, y, cz)]) || (Math.abs(dx) <= 2 && Math.abs(dz) <= 2)) d[at(cx, y, cz)] = 0;
        if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
        for (let y = T.y - 5; y < T.y; y++) if (y > 0) d[at(cx, y, cz)] = B.RESO_STONE;
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2, corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
        for (let y = T.y; y < T.y + T.H; y++) {
          const lv = y - T.y, top = T.H - lv <= 4;
          if (top && edge && (corner || hash3(cx, y, cz, 2311) < 0.35)) continue;      // the old top has fallen in places
          d[at(cx, y, cz)] = edge && lv % 4 === 2 ? B.RESO_CARVED : B.RESO_STONE;
        }
        if (dx === 0 && dz === 0) { d[at(cx, T.y + T.H, cz)] = B.RESO_CRYSTAL; d[at(cx, T.y + T.H + 1, cz)] = B.RESO_CRYSTAL; }
        else if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && (dx === 0 || dz === 0)) d[at(cx, T.y + T.H, cz)] = B.RESO_CARVED;
      }
      const b = T.bell;
      if (inC(b.x, b.y, b.z)) { for (let y = b.y - 4; y < b.y; y++) if (y > 0) d[at(b.x, y, b.z)] = B.RESO_STONE; d[at(b.x, b.y, b.z)] = B.RESO_BELL; d[at(b.x, b.y + 1, b.z)] = 0; }
    }
    for (const F of fossilsIn(X0, X0 + C, Z0, Z0 + C)) {
      const y0 = F.y, px = -F.oz, pz = F.ox;
      for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
        const cx = F.x + dx, cz = F.z + dz, dd = Math.hypot(dx, dz);
        if (!inC(cx, y0, cz) || dd >= 11.5) continue;
        const g = colTop(cx, cz);
        if (dd < 8.5) {
          const top = y0 + Math.round(6.5 * Math.sqrt(1 - (dd / 8.5) * (dd / 8.5)));
          for (let y = Math.min(g, y0 - 1); y <= Math.max(top, g); y++) {
            if (y <= 0 || y >= SY) continue;
            const inner = dd < 5.5 && y >= y0 && y <= y0 + (dd < 3.5 ? 4 : 3);
            if (inner) { d[at(cx, y, cz)] = 0; continue; }
            if (y > top) { if (y > g) d[at(cx, y, cz)] = 0; continue; }
            const r = hash3(cx, y, cz, 2321), shell = dd < 7.2 && y < y0 + 5;
            d[at(cx, y, cz)] = y === y0 - 1 && dd < 5.5 ? B.ASH : shell && r < 0.16 ? B.FOSSIL : shell && r < 0.21 ? B.AMBER : B.BASALT;
          }
          for (let y = Math.max(top, g) + 1; y < Math.min(SY, Math.max(top, g) + 6); y++) if (soft2(d[at(cx, y, cz)])) d[at(cx, y, cz)] = 0;
        } else {
          // the moat: a level ring of lava round the mound, one below the cave's floor (cut into the slope, or held up by black rock)
          for (let y = Math.min(g, y0 - 4); y <= Math.max(g, y0 + 2) + 5 && y < SY; y++) {
            if (y <= 0) continue;
            const a = at(cx, y, cz);
            if (y < y0 - 1) { if (y >= y0 - 4 || !d[a] || d[a] === B.WATER) d[a] = B.BASALT; }
            else if (y === y0 - 1) d[a] = B.LAVA;
            else if (y <= Math.max(g, y0 + 2) || soft2(d[a])) d[a] = 0;
          }
        }
      }
      // a landing of black rock outside the moat in front of the mouth, level with the cave's floor
      for (let s2 = 11.5; s2 <= 15; s2 += 0.5) for (const w of [-2, -1, 0, 1, 2]) {
        const cx = Math.round(F.x + F.ox * s2 + px * w), cz = Math.round(F.z + F.oz * s2 + pz * w);
        if (!inC(cx, y0, cz) || Math.hypot(cx - F.x, cz - F.z) < 11.5) continue;
        const g = colTop(cx, cz);
        for (let y = Math.min(g, y0 - 4); y <= Math.max(g, y0 + 2) + 3 && y < SY; y++) { if (y <= 0) continue; const a = at(cx, y, cz); if (y < y0) { if (y >= y0 - 4 || !d[a]) d[a] = B.BASALT; } else d[a] = 0; }
      }
      // the mouth, out toward the low ground; the chest at the back, two fires for light
      for (let s2 = 3; s2 <= 9; s2 += 0.5) for (const w of [-1, 0, 1]) {
        const cx = Math.round(F.x + F.ox * s2 + px * w), cz = Math.round(F.z + F.oz * s2 + pz * w);
        if (!inC(cx, y0, cz)) continue;
        for (let y = y0; y <= y0 + 2; y++) if (d[at(cx, y, cz)] !== B.LAVA) d[at(cx, y, cz)] = 0;
        if (d[at(cx, y0 - 1, cz)] !== B.LAVA) d[at(cx, y0 - 1, cz)] = B.BASALT;
      }
      const c = F.chest;
      if (inC(c.x, c.y, c.z)) d[at(c.x, c.y, c.z)] = K.CHEST;
      for (const f of F.fires) if (inC(f.x, f.y, f.z)) { d[at(f.x, f.y, f.z)] = K.FIRE; fires.push(f); }
    }
    return fires;
  }

  // ------------------------------------------------------------------ trees
  const G = 5;
  const treeCache = new Map();
  function treeOf(gx, gz) {
    const key = gx * 8192 + gz;
    let t = treeCache.get(key);
    if (t !== undefined) return t;
    t = null;
    const x = gx * G + 1 + Math.floor(hash3(gx, 1, gz, 521) * 3), z = gz * G + 1 + Math.floor(hash3(gx, 2, gz, 523) * 3);
    const r = hash3(gx, 3, gz, 525);
    if (spawn && Math.floor(spawn.oak.x / G) === gx && Math.floor(spawn.oak.z / G) === gz) t = { kind: 'stump', x: spawn.oak.x, z: spawn.oak.z, y: spawn.y + 1 };
    else if (!(spawn && Math.abs(x - spawn.x) < 10 && Math.abs(z - spawn.z) < 10) && r < 0.85) {
      const c = column(x, z), h = hInt(c.hf);
      if (h >= c.wl && !c.lava && !c.flow) {
        const { s, wj, wp, wsw, wa, wv, mm, vd, wl } = c;
        const hx1 = hInt(column(x + 1, z).hf), hx0 = hInt(column(x - 1, z).hf), hz1 = hInt(column(x, z + 1).hf), hz0 = hInt(column(x, z - 1).hf);
        const level = Math.abs(hx1 - h) <= 1 && Math.abs(hx0 - h) <= 1 && Math.abs(hz1 - h) <= 1 && Math.abs(hz0 - h) <= 1;
        if (level && !carvedAt(x, h, z) && !carvedAt(x, h + 1, z)) {
          const slope = Math.hypot(hx1 - hx0, hz1 - hz0) * 0.5, exposed = hx1 < h || hx0 < h || hz1 < h || hz0 < h;
          const land = pickLand(x, z, wj, wp, wsw, wa);
          const top = topOf(x, z, h, slope, exposed, land, s, wl, mm, wv, vd, 0, false);
          const glade = N.fbm2(x / 22 + 9, z / 22, 2), q = hash3(gx, 4, gz, 527);
          if (top === B.JUNGLE_GRASS && land === L_JUNGLE) {
            const dens = 0.8 * smooth(-0.45, 0.15, glade);
            if (r < dens) t = { kind: q < 0.07 && (gx + gz) % 3 === 0 ? 'giant' : q < 0.3 ? 'fern' : 'jungle', x, z, y: h + 1 };
          } else if (top === B.JUNGLE_GRASS || top === B.MUD) { if (r < 0.22) t = { kind: 'swamp', x, z, y: h + 1 }; }
          else if (top === B.FERN_GRASS) {
            const dens = 0.035 + 0.12 * smooth(0.25, 0.55, glade);
            if (r < dens) t = { kind: q < 0.8 ? 'fern' : 'jungle', x, z, y: h + 1 };
          } else if (top === B.SAND) { if (s < 0.06 && r < 0.14 && q < 0.7) t = { kind: 'fern', x, z, y: h + 1 }; }
          else if ((top === B.ASH || top === B.RED_ROCK) && r < 0.012) t = { kind: 'snag', x, z, y: h + 1 };
        }
      }
    }
    if (treeCache.size > 20000) treeCache.clear();
    treeCache.set(key, t);
    return t;
  }
  function treesIn(x0, x1, z0, z1) {
    const out = [];
    for (let gz = Math.floor(z0 / G); gz <= Math.floor((z1 - 1) / G); gz++) for (let gx = Math.floor(x0 / G); gx <= Math.floor((x1 - 1) / G); gx++) { const t = treeOf(gx, gz); if (t) out.push(t); }
    return out;
  }

  // ------------------------------------------------------------------ what the rest of the game asks
  /** One of the standard land names the shared code knows (play coordinates). */
  function landOf(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    const c = column(x, z), h = hInt(c.hf);
    if (c.lava && h < c.lava) return 'mountain';
    if (h < c.wl) return 'sea';
    if (c.s < 0.035 && h <= SEA + 2) return 'beach';
    if ((c.vd < 1 && h > SEA + 12) || (h > SEA + 20 && c.mm > 0.2)) return 'mountain';
    const { wj, wp, wsw, wa, wv } = c;
    if (wv > 0.55 || (wa >= wj && wa >= wp && wa >= wsw)) return 'desert';
    return wj >= wp || wsw >= wp ? 'forest' : 'plains';
  }
  /** The land as this world names it: 'jungle' | 'ferns' | 'swamp' | 'ash' | 'black' | 'volcano' | 'beach' | 'island' | 'sea'. */
  function zoneOf(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    const c = column(x, z), h = hInt(c.hf);
    if (c.vd < 1 && (h > SEA + 8 || c.lava)) return 'volcano';
    if (h < c.wl) return c.swamp ? 'swamp' : 'sea';
    if (c.s < 0.035 && h <= SEA + 2) return c.isl > 0.3 ? 'island' : 'beach';
    if (c.isl > 0.3) return 'island';
    if (c.wv > 0.55) return 'black';
    const { wj, wp, wsw, wa } = c;
    return wa >= wj && wa >= wp && wa >= wsw ? 'ash' : wsw >= wj && wsw >= wp ? 'swamp' : wj >= wp ? 'jungle' : 'ferns';
  }
  const heightAt = (x, z) => hInt(column(Math.floor(x), Math.floor(z)).hf);
  /** The volcanoes whose middle is within r of (x, z): [{ x, z, top }] (top: the rim). */
  function volcanoesNear(x, z, r) {
    const out = [];
    for (let gz = Math.floor((z - r) / VC); gz <= Math.floor((z + r) / VC); gz++) for (let gx = Math.floor((x - r) / VC); gx <= Math.floor((x + r) / VC); gx++) {
      const v = volcanoOf(gx, gz);
      if (v && Math.hypot(v.x - x, v.z - z) <= r) out.push({ x: v.x, z: v.z, top: v.rim, lava: v.lava, R: v.R });
    }
    return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }

  /** For the far view: the ground height (with the tree tops of a jungle) and its colour, cheaply. */
  const COL = {
    jungle: [0.12, 0.33, 0.12], canopy: [0.09, 0.27, 0.1], ferns: [0.45, 0.6, 0.24], swamp: [0.3, 0.36, 0.18], mud: [0.27, 0.24, 0.15],
    ash: [0.5, 0.48, 0.46], red: [0.66, 0.36, 0.22], basalt: [0.25, 0.25, 0.27], lava: [1.0, 0.42, 0.08], sand: [0.88, 0.78, 0.55], rock: [0.46, 0.45, 0.43],
    water: [0.3, 0.62, 0.66], deep: [0.2, 0.48, 0.58], murky: [0.32, 0.4, 0.22],
  };
  function farSample(x, z, out) {
    const c = column(x, z), h = c.hf;
    let rgb;
    out[4] = 0; out[3] = h;
    if (c.lava && h < c.lava) { rgb = COL.lava; out[3] = c.lava + 0.9; }
    else if (h < c.wl - 0.5) { out[4] = 1; out[3] = c.wl + 0.88; rgb = c.swamp ? COL.murky : c.wl - h > 6 ? COL.deep : COL.water; }
    else if (c.s < 0.035 && h <= SEA + 2.5) rgb = COL.sand;
    else if (c.flow) rgb = COL.lava;
    else if (c.vd < 1 || c.wv > 0.55) { const a = smooth(0.0, 0.25, N.fbm2(x / 9, z / 9 + 3, 2)); for (let i = 0; i < 3; i++) out[i] = mix(COL.basalt[i], COL.ash[i], a * 0.8); return out; }
    else if (c.mm > 0.2 && h > SEA + 19) rgb = COL.rock;
    else {
      const { wj, wp, wsw, wa } = c, tot = wj + wp + wsw + wa || 1;
      const a = wj / tot, b = wp / tot, sw = wsw / tot, as = wa / tot;
      const g = 0.5 + N.fbm2(x / 22 + 9, z / 22, 2), fr = a * clamp(g * 1.6);
      for (let i = 0; i < 3; i++) out[i] = fr * COL.canopy[i] + (a - fr) * COL.jungle[i] + b * COL.ferns[i] + sw * COL.swamp[i] + as * mix(COL.ash[i], COL.red[i], 0.5);
      out[3] = h + fr * 9 + sw * 3 + b * 0.6;                       // the jungle canopy stands high above the ground
      return out;
    }
    out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2];
    return out;
  }

  // ------------------------------------------------------------------ the start: open fern plain, the jungle a little way off, a volcano in sight
  function findSpawn() {
    let best = null;
    const flatAt = (x, z, h) => { for (let dz = -9; dz <= 9; dz += 3) for (let dx = -9; dx <= 9; dx += 3) { const t = baseHeight(x + dx, z + dz); if (Math.abs(t - h) > 1.6 || t < SEA + 2) return false; } return true; };
    for (let ring = 0; ring < 70 && !best; ring++) {
      const n = Math.max(1, ring * 6);
      for (let i = 0; i < n && !best; i++) {
        const a = i / n * Math.PI * 2, x = Math.round(MID + 3000 + Math.cos(a) * ring * 48), z = Math.round(MID - 2000 + Math.sin(a) * ring * 48);
        const h = baseHeight(x, z);
        if (col.wp < 0.85 || col.mm > 0.05 || col.s < 0.15 || col.wv > 0.05 || h < SEA + 2.5 || h > SEA + 9) continue;
        if (!flatAt(x, z, h)) continue;
        let jungle = false, close = false;
        for (let k = 0; k < 16 && !close; k++) { const b = k / 16 * Math.PI * 2; for (const r of [20, 40, 60, 80, 100, 120]) { climate(x + Math.cos(b) * r, z + Math.sin(b) * r); if (col.wj > 0.5) { if (r <= 40) close = true; else jungle = true; break; } } }
        if (!jungle || close) continue;
        const v = volcanoesNear(x, z, 720).find((q) => { const d = Math.hypot(q.x - x, q.z - z); return d > 260; });
        if (!v) continue;
        best = { x, z, h, peak: { x: v.x, z: v.z, h: v.top } };
      }
    }
    if (!best) best = { x: MID, z: MID, h: baseHeight(MID, MID), peak: null };
    const y = Math.floor(best.h);
    const yaw = best.peak ? Math.atan2(-(best.peak.x - best.x), -(best.peak.z - best.z)) : 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    spawn = { x: best.x, z: best.z, y, yaw, peak: best.peak, oak: { x: Math.round(best.x + fx * 5), z: Math.round(best.z + fz * 5) } };
    return spawn;
  }

  findSpawn();
  return {
    SY, SEA, C, SIZE, spawn, fillChunk, column, landOf, zoneOf, heightAt, baseHeight, farSample, cavesIn, treesIn, volcanoesNear,
    towersNear, fossilsNear, towerOf, TC,
  };
}
