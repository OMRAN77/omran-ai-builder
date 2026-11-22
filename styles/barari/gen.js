// The endless land of "barari", as pure functions of the position: the same (x, z) always gives the same ground,
// so any piece of the world can be made the first time it is needed, in any order, and made again identically.
//
//   lands by noise: big oceans and inner seas, beaches, plains (open grass and flowers), forests, deserts, snow
//   country, and mountain ranges with snow on their peaks; rivers that wind down to the sea, lakes, ponds with
//   reeds, frozen ponds in the snow and water holes with palms in the desert.
//   under the ground: caves (tunnels that enter from a hill side and wind down to halls with fires), coal, gold
//   and diamond by depth, more of them in the cave walls.
//
// No three.js here (node can run it for measuring):  const g = makeGen(K);  g.fillChunk(cx, cz, data);
import { makeNoise, hash3 } from '../../shared/noise.js';
import { B } from './blocks.js';

export const SY = 96, SEA = 30, C = 32, SIZE = 16384, MID = SIZE / 2;
const CS = 5, CS2 = 10;                         // a chunk is 32 x 32 columns: x + (z << 5) + (y << 10)

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function makeGen(K) {
  const N = makeNoise(7319), M = makeNoise(4421), Q = makeNoise(9133);

  // ------------------------------------------------------------------ the ground of one column
  // Everything about a column is written into one reused object (no garbage while a chunk is made).
  const col = { hf: 0, s: 0, ws: 0, wd: 0, wf: 0, wp: 0, mm: 0, wl: SEA, ice: false, pond: null, river: 0 };

  /** Ponds, water holes and frozen ponds: at most one in each 96-block cell, decided by a hash. */
  const PC = 96, ponds = new Map();
  function pondOf(gx, gz) {
    const key = gx * 4096 + gz;
    let p = ponds.get(key);
    if (p !== undefined) return p;
    p = null;
    const r = hash3(gx, 7, gz, 811);
    const x = gx * PC + 20 + Math.floor(hash3(gx, 8, gz, 813) * (PC - 40)), z = gz * PC + 20 + Math.floor(hash3(gx, 9, gz, 815) * (PC - 40));
    climate(x, z);
    const s = col.s, land = col.ws > 0.55 ? 'snow' : col.wd > 0.5 ? 'desert' : 'green';
    const chance = land === 'snow' ? 0.5 : land === 'desert' ? 0.4 : 0.45;
    if (r < chance && s > 0.06 && col.mm < 0.15) {
      const h = baseHeight(x, z);
      if (h > SEA + 1.5 && h < SEA + 16) {
        const rx = land === 'desert' ? 4 + hash3(gx, 1, gz, 817) * 2 : 5 + hash3(gx, 1, gz, 817) * 3.5;
        const rz = land === 'desert' ? 3.5 + hash3(gx, 2, gz, 819) * 1.5 : 3.5 + hash3(gx, 2, gz, 819) * 2.5;
        p = { x, z, rx, rz, y: Math.floor(h), kind: land === 'snow' ? 'frozen' : land === 'desert' ? 'hole' : 'pond' };
      }
    }
    if (ponds.size > 4000) ponds.clear();
    ponds.set(key, p);
    return p;
  }
  /** The pond whose reach covers (x, z), if any (it reaches at most rx + 6 from its middle). */
  function pondNear(x, z) {
    const gx = Math.floor(x / PC), gz = Math.floor(z / PC);
    const fx = x - gx * PC, fz = z - gz * PC;
    const p = pondOf(gx, gz);
    if (p && Math.abs(x - p.x) < 16 && Math.abs(z - p.z) < 16) return p;
    // a pond sits 20 blocks or more inside its cell, and reaches less than 16: nothing from the next cells
    void fx; void fz;
    return null;
  }

  /** Lands, coast, mountains: the slow fields. */
  function climate(x, z) {
    const c = N.fbm2(x / 1100 + 0.31, z / 1100 - 0.73, 4) + N.fbm2(x / 260 + 5.1, z / 260 + 1.7, 2) * 0.12;
    col.s = c + 0.16;                                                  // > 0 land, < 0 sea
    const T = M.fbm2(x / 820 + 3.3, z / 820 - 1.9, 3), H = M.fbm2(x / 610 + 50.7, z / 610 - 30.2, 3);
    let ws = smooth(-0.1, -0.2, T);
    let wd = smooth(0.06, 0.15, T) * smooth(0.06, -0.04, H) * (1 - ws);
    let wf = (1 - ws - wd) * smooth(-0.04, 0.07, H);
    let wp = Math.max(0, 1 - ws - wd - wf);
    col.ws = ws; col.wd = wd; col.wf = wf; col.wp = wp;
    const land = smooth(0, 0.08, col.s);
    const mq = Q.fbm2(x / 700 + 9.2, z / 700 - 4.4, 3);
    col.mm = clamp(smooth(0.1, 0.3, mq) + ws * 0.6 * smooth(-0.15, 0.1, mq)) * land;
  }

  /** The height without ponds and the flat at the start. */
  function baseHeight(x, z) {
    climate(x, z);
    const { ws, wd, wf, wp, mm, s } = col;
    let h = 0;
    if (wp > 0.01) h += wp * (SEA + 3 + N.fbm2(x / 90, z / 90, 3) * 3);
    if (wf > 0.01) h += wf * (SEA + 4 + N.fbm2(x / 70 + 7, z / 70, 3) * 6 + N.ridge2(x / 50, z / 50, 2) * 3);
    if (wd > 0.01) h += wd * (SEA + 3 + N.ridge2(x / 40 + N.fbm2(x / 50, z / 50, 2) * 1.5, z / 24, 2) * 4.5 + N.fbm2(x / 120 + 3, z / 120, 2) * 2);
    if (ws > 0.01) h += ws * (SEA + 6 + N.ridge2(x / 40 + 11, z / 40, 3) * 11 + N.fbm2(x / 25, z / 25, 2) * 2);
    h /= Math.max(0.01, ws + wd + wf + wp);
    if (mm > 0.01) h += mm * (Q.ridge2(x / 120 + 3.7, z / 120 - 8.1, 4) * 56 + 6);
    if (h > SEA + 40) h = SEA + 40 + (h - SEA - 40) * 0.6;            // the peaks stay under the top of the world
    // rivers wind down to the sea level, through the mountains too
    const rv = Math.abs(N.fbm2(x / 760 + 3.1, z / 760 - 7.3, 3)) + smooth(0.05, -0.15, M.fbm2(x / 1300 - 2.2, z / 1300 + 8.4, 2)) * 0.2;
    const land = smooth(0.0, 0.06, s);
    const valley = smooth(0.06, 0.02, rv) * land, river = smooth(0.02, 0.008, rv) * land;
    col.river = river;
    h = mix(h, SEA + 1.6, valley * 0.85);
    h = mix(h, SEA - 2.6, river);
    // lakes: hollows below the sea level, away from the mountains
    const lk = N.fbm2(x / 230 - 11.3, z / 230 + 5.9, 2);
    const lake = smooth(0.34, 0.42, lk) * land * (1 - mm);
    h = mix(h, SEA - 4.5, lake);
    // the coast: the land comes down to a beach, the sea floor goes down to 14 blocks under the water
    if (s < 0) h = Math.max(SEA - 14, SEA + 1 + s * 70 + N.fbm2(x / 30, z / 30, 2) * 1.5);
    else h = mix(SEA + 1.2, h, smooth(0, 0.07, s));
    return h;
  }

  let spawn = null;                             // set once the start is found (the ground is flattened round it)
  /** The full column: height, water level, ice. */
  function column(x, z) {
    let h = baseHeight(x, z);
    col.wl = SEA; col.ice = false; col.pond = null;
    const p = pondNear(x, z);
    if (p) {
      const dd = Math.hypot((x - p.x) / (p.rx + 5), (z - p.z) / (p.rz + 5));
      h = mix(h, p.y + 1.5, 1 - smooth(0.55, 1.45, dd));
      const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz) * (1 + N.fbm2(x / 5, z / 5, 2) * 0.15);
      if (d < 1) { h = p.y - 1 - (1 - d * d) * 3.2; col.wl = p.y; col.pond = p; }
      else if (d < 1.4) col.pond = p;
    }
    if (spawn) {
      const d = Math.hypot(x - spawn.x, z - spawn.z) / 9;
      if (d < 1.5) h = mix(h, spawn.y + 0.5, 1 - smooth(0.55, 1.45, d));
    }
    col.hf = h;
    col.ice = (col.pond ? col.pond.kind === 'frozen' : col.ws > 0.55 && col.s > 0.03);
    return col;
  }
  const hInt = (hf) => clamp(Math.floor(hf), 3, SY - 10);

  // ------------------------------------------------------------------ caves
  // Each 128-block region may hold a cave or two: a tunnel that enters a hill side at the ground, winds down,
  // opens into halls, and ends in a big hall. Its path is a list of ellipsoids, made once per region.
  const RC = 128, regions = new Map();
  function regionCaves(rx, rz) {
    const key = rx * 4096 + rz;
    let list = regions.get(key);
    if (list) return list;
    list = [];
    const n = [0, 1, 1, 2][Math.floor(hash3(rx, 1, rz, 901) * 4)];
    for (let i = 0; i < n; i++) {
      // the mouth: of a few spots, the one on the steepest dry ground
      let best = null;
      for (let t = 0; t < 7; t++) {
        const x = rx * RC + 8 + Math.floor(hash3(rx, i * 16 + t, rz, 903) * (RC - 16)), z = rz * RC + 8 + Math.floor(hash3(rx, i * 16 + t, rz, 905) * (RC - 16));
        const h = baseHeight(x, z);
        if (h < SEA + 3 || col.s < 0.04) continue;
        if (spawn && Math.hypot(x - spawn.x, z - spawn.z) < 24) continue;
        const gx = baseHeight(x + 3, z) - baseHeight(x - 3, z), gz = baseHeight(x, z + 3) - baseHeight(x, z - 3);
        const slope = Math.hypot(gx, gz);
        if (!best || slope > best.slope) best = { x, z, h, slope, ang: Math.atan2(-gz, -gx) + Math.PI };       // facing up the slope, into the hill
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
      // the box round it all, for quick tests
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let b = 0; b < blobs.length; b += 6) { x0 = Math.min(x0, blobs[b] - blobs[b + 3]); x1 = Math.max(x1, blobs[b] + blobs[b + 3]); z0 = Math.min(z0, blobs[b + 2] - blobs[b + 5]); z1 = Math.max(z1, blobs[b + 2] + blobs[b + 5]); }
      const cave = { blobs, halls, x0, x1, z0, z1, mouth: { x: best.x, y: Math.floor(best.h) + 1, z: best.z, yaw: Math.atan2(-Math.cos(ang), -Math.sin(ang)) }, fires: [] };
      const inside = (cx, cy, cz) => { for (let b = 0; b < blobs.length; b += 6) { const q = ((cx + 0.5 - blobs[b]) / blobs[b + 3]) ** 2 + ((cy + 0.5 - blobs[b + 1]) / blobs[b + 4]) ** 2 + ((cz + 0.5 - blobs[b + 2]) / blobs[b + 5]) ** 2; if (q < 1) return true; } return false; };
      // fires burn deep in the halls (and always in the last one)
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
  /** The caves whose box meets [x0, x1) x [z0, z1). */
  function cavesIn(x0, x1, z0, z1, out = []) {
    out.length = 0;
    for (let rz = Math.floor((z0 - 80) / RC); rz <= Math.floor((z1 + 80) / RC); rz++)
      for (let rx = Math.floor((x0 - 80) / RC); rx <= Math.floor((x1 + 80) / RC); rx++)
        for (const c of regionCaves(rx, rz)) if (c.x1 >= x0 && c.x0 < x1 && c.z1 >= z0 && c.z0 < z1) out.push(c);
    return out;
  }
  const carvedAt = (x, y, z) => { for (const c of cavesIn(x, x + 1, z, z + 1, _cv)) if (c.inside(x, y, z)) return true; return false; };
  const _cv = [];

  // ------------------------------------------------------------------ one chunk
  const W = C + 2, HF = new Float32Array(W * W), HI = new Int16Array(W * W), WL = new Int16Array(W * W);
  const ICE = new Uint8Array(W * W), POND = new Array(W * W), LANDS = new Uint8Array(W * W), S = new Float32Array(W * W);
  const L_SNOW = 1, L_FOREST = 2, L_DESERT = 3, L_PLAINS = 4;
  const WS = new Float32Array(W * W), WF = new Float32Array(W * W), WD = new Float32Array(W * W), MM = new Float32Array(W * W);
  const caveList = [];

  /** Which of the lands this column is drawn as (a few blocks of dither where two lands meet). */
  function pickLand(x, z, ws, wf, wd) {
    // the weights sharpened, so two lands meet over a few blocks, not a wide band of confetti
    const wp = Math.max(0, 1 - ws - wd - wf);
    ws *= ws * ws * ws; wd *= wd * wd * wd; wf *= wf * wf * wf; const p4 = wp * wp * wp * wp, t = ws + wd + wf + p4 || 1;
    ws /= t; wd /= t; wf /= t;
    const r = clamp(0.5 + N.fbm2(x / 7 + 40, z / 7 + 40, 2) * 0.7 + (hash3(x, 1, z, 5) - 0.5) * 0.25);
    return r < ws ? L_SNOW : r < ws + wd ? L_DESERT : r < ws + wd + wf ? L_FOREST : L_PLAINS;
  }

  /**
   * The top block of a column and whether trees or plants may stand on it: computed the same way for a column in
   * this chunk and for a tree's foot in the next one. Needs col filled by column(x, z) and the four neighbour heights.
   */
  function topOf(x, z, h, slope, exposed, land, s, wl, ice, mm) {
    if (h < wl) return ice ? B.ICE : B.WATER;
    if (s < 0.035 && h <= SEA + 2) return land === L_SNOW ? B.GRAVEL : B.SAND;
    if (h > snowLine(x, z)) return slope > 1.3 || exposed ? B.SNOWROCK : B.SNOWBLOCK;
    if ((mm > 0.35 && slope > 1.5) || (mm > 0.2 && h > SEA + 17 + N.fbm2(x / 18 + 4, z / 18, 2) * 10)) return hash3(x, 6, z, 71) < 0.12 ? B.GRAVEL : B.STONE;      // the mountains are bare rock above the grass
    if (land === L_DESERT) return slope > 1.9 ? B.SANDSTONE : B.SAND;
    if (land === L_SNOW) return exposed || slope > 0.75 ? B.SNOWROCK : h > SEA + 24 ? B.SNOWBLOCK : B.SNOW;
    if (slope > 1.7) return B.STONE;
    return B.GRASS;
  }
  const snowLine = (x, z) => SEA + 31 + N.fbm2(x / 60, z / 60, 2) * 6;

  /** Fill one chunk (32 x SY x 32, x + (z << 5) + (y << 10)) of the world. Returns the fires lit in it. */
  function fillChunk(cx, cz, d) {
    const X0 = cx * C, Z0 = cz * C;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = X0 + i - 1, z = Z0 + j - 1, k = i + j * W;
      const c = column(x, z);
      HF[k] = c.hf; HI[k] = hInt(c.hf); WL[k] = c.wl; ICE[k] = c.ice ? 1 : 0; POND[k] = c.pond; S[k] = c.s;
      WS[k] = c.ws; WF[k] = c.wf; WD[k] = c.wd; MM[k] = c.mm;
    }
    // ---- the columns
    for (let j = 1; j <= C; j++) for (let i = 1; i <= C; i++) {
      const k = i + j * W, x = X0 + i - 1, z = Z0 + j - 1, h = HI[k], wl = WL[k];
      const slope = Math.hypot(HF[k + 1] - HF[k - 1], HF[k + W] - HF[k - W]) * 0.5;
      const exposed = HI[k + 1] < h || HI[k - 1] < h || HI[k + W] < h || HI[k - W] < h;
      const land = pickLand(x, z, WS[k], WF[k], WD[k]);
      LANDS[k] = land;
      const top = topOf(x, z, h, slope, exposed, land, S[k], wl, ICE[k], MM[k]);
      const base = (i - 1) + ((j - 1) << CS);
      const wet = h < wl;
      for (let y = 0; y <= h; y++) {
        const depth = h - y;
        let id;
        if (wet) id = depth < 2 ? (ICE[k] || land === L_SNOW ? B.GRAVEL : B.SEABED) : B.STONE;
        else if (top === B.SAND && S[k] < 0.035) id = depth < 3 ? B.SAND : depth < 7 ? B.SANDSTONE : B.STONE;
        else if (top === B.GRAVEL) id = depth < 2 ? B.GRAVEL : B.STONE;
        else if (top === B.SNOWROCK || top === B.SNOWBLOCK || top === B.SNOW) id = depth === 0 ? top : depth < 3 && top === B.SNOW ? B.DIRT : B.STONE;
        else if (top === B.SAND) id = depth < 3 ? B.SAND : depth < 9 ? B.SANDSTONE : B.STONE;
        else if (top === B.SANDSTONE) id = depth < 8 ? B.SANDSTONE : B.STONE;
        else if (top === B.GRASS) id = depth === 0 ? B.GRASS : depth < 4 ? B.DIRT : B.STONE;
        else id = B.STONE;
        if (id === B.STONE && y < 8) id = B.DEEPROCK;
        if (y === 0) id = B.DEEPROCK;
        if ((id === B.STONE || id === B.DEEPROCK) && depth > 2) {
          // coal in clusters everywhere in the rock, gold deeper, diamond deepest
          const cell = hash3(x >> 2, y >> 2, z >> 2, 91);
          if (cell < 0.07 && y < SEA + 22) { if (hash3(x, y, z, 92) < 0.55) id = K.ROCK_COAL; }
          else if (cell < 0.085 && y < SEA - 8) { if (hash3(x, y, z, 93) < 0.5) id = K.ROCK_GOLD; }
          else if (y < 12 && hash3(x, y, z, 79) < 0.0018) id = K.ROCK_DIAMOND;
        }
        d[base + (y << CS2)] = id;
      }
      if (wet) {
        for (let y = h + 1; y <= wl; y++) d[base + (y << CS2)] = B.WATER;
        if (ICE[k]) d[base + (wl << CS2)] = B.ICE;
      }
    }
    // ---- caves
    const fires = [];
    const caves = cavesIn(X0, X0 + C, Z0, Z0 + C, caveList);
    let carved = null;
    if (caves.length) {
      carved = [];
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
            // never open the sea, a lake or a pond into a cave: under and beside water the rock stays
            let wetTop = 1e9;
            for (const kk of [k, k + 1, k - 1, k + W, k - W]) if (HI[kk] < WL[kk]) wetTop = Math.min(wetTop, HI[kk] - 3);
            for (let y = ya; y <= yb; y++) {
              if (y >= wetTop) break;
              const q = ((x + 0.5 - bx) / rx) ** 2 + ((y + 0.5 - by) / ry) ** 2 + ((z + 0.5 - bz) / rz) ** 2;
              if (q >= 1) continue;
              const a = (x - X0) + ((z - Z0) << CS) + (y << CS2);
              if (!d[a]) continue;
              d[a] = 0; carved.push(a);
            }
          }
        }
        for (const f of cv.fires) {
          if (f.x < X0 || f.x >= X0 + C || f.z < Z0 || f.z >= Z0 + C) continue;
          const a = (f.x - X0) + ((f.z - Z0) << CS) + (f.y << CS2);
          if (d[a] === 0 && d[a - (1 << CS2)] !== 0 && d[a - (1 << CS2)] !== B.WATER) { d[a] = K.FIRE; fires.push(f); }
        }
      }
      // ore in the cave walls: coal is common, gold rarer and deeper, diamond rarest and deepest
      const steps = [1, -1, 1 << CS, -(1 << CS), 1 << CS2, -(1 << CS2)];
      for (const a of carved) {
        const ax = a & 31, az = (a >> CS) & 31;
        for (let s = 0; s < 6; s++) {
          if ((s === 0 && ax === 31) || (s === 1 && ax === 0) || (s === 2 && az === 31) || (s === 3 && az === 0)) continue;
          const b2 = a + steps[s], id = d[b2];
          if (id !== B.STONE && id !== B.DEEPROCK && id !== B.SANDSTONE) continue;
          const y = b2 >> CS2, x = X0 + (b2 & 31), z = Z0 + ((b2 >> CS) & 31);
          const r = hash3(x, y, z, 301);
          if (y < 13 && r < 0.022) d[b2] = K.ROCK_DIAMOND;
          else if (y < SEA - 6 && r < 0.055) d[b2] = K.ROCK_GOLD;
          else if (y < SEA + 16 && r < 0.14) d[b2] = K.ROCK_COAL;
        }
      }
    }
    const topAt = (i, j) => { const base = (i - 1) + ((j - 1) << CS); for (let y = SY - 1; y > 0; y--) if (d[base + (y << CS2)]) return y; return 0; };

    // ---- ground plants, on the ground as it is after the caves
    for (let j = 1; j <= C; j++) for (let i = 1; i <= C; i++) {
      const k = i + j * W, x = X0 + i - 1, z = Z0 + j - 1;
      const t = topAt(i, j), base = (i - 1) + ((j - 1) << CS), id = d[base + (t << CS2)];
      if (t >= SY - 2 || d[base + ((t + 1) << CS2)] !== 0) continue;
      if (spawn && Math.abs(x - spawn.x) < 2 && Math.abs(z - spawn.z) < 2) continue;
      const r = hash3(x, 1, z, 601);
      let put = 0;
      if (id === B.GRASS) {
        const p = POND[k], nearPond = p && p.kind === 'pond' && Math.hypot((x - p.x) / (p.rx + 1.5), (z - p.z) / (p.rz + 1.5)) < 1.15;
        // the plains: short open grass, more flowers than tufts; the forest floor: tufts
        const plains = LANDS[k] === L_PLAINS, tu = plains ? 0.05 : 0.13, fl = plains ? 0.015 : 0.01;
        if (nearPond && r < 0.35) put = B.REED;
        else if (r < tu) put = B.TUFT;
        else if (r < tu + fl) put = B.FLOWER_R;
        else if (r < tu + fl * 2) put = B.FLOWER_Y;
        else if (r < tu + fl * 2.7) put = B.FLOWER_B;
      } else if (id === B.SAND && S[k] > 0.05) { if (r < 0.014) put = B.SHRUB; }
      else if (id === B.SNOW && r < 0.006) put = B.SHRUB;
      if (put) d[base + ((t + 1) << CS2)] = put;
    }

    // ---- trees: one place in each cell of a grid, decided by a hash, so a tree is the same seen from any chunk
    const inC = (x, y, z) => x >= X0 && z >= Z0 && x < X0 + C && z < Z0 + C && y >= 0 && y < SY;
    const at = (x, y, z) => (x - X0) + ((z - Z0) << CS) + (y << CS2);
    const put = (x, y, z, id) => { if (inC(x, y, z)) d[at(x, y, z)] = id; };
    const putAir = (x, y, z, id) => { if (inC(x, y, z) && d[at(x, y, z)] === 0) d[at(x, y, z)] = id; };
    const plant = (x, y, z) => { if (!inC(x, y, z)) return false; const id = d[at(x, y, z)]; return id === B.TUFT || id === B.FLOWER_R || id === B.FLOWER_Y || id === B.FLOWER_B || id === B.SHRUB || id === B.REED; };
    const putTrunk = (x, y, z, id) => { if (inC(x, y, z) && (d[at(x, y, z)] === 0 || plant(x, y, z) || d[at(x, y, z)] === B.OAK_LEAVES || d[at(x, y, z)] === B.PINE_NEEDLES || d[at(x, y, z)] === B.PALM_FROND)) d[at(x, y, z)] = id; };
    void put;
    function oak(x, z, y0, seed, big) {
      const hgt = (big ? 6 : 4) + Math.floor(hash3(x, 2, z, seed) * 2.5), R = big ? 3.3 : 2.5;
      const cy = y0 + hgt - 0.5, ri = Math.ceil(R);
      for (let y = y0; y < y0 + hgt; y++) putTrunk(x, y, z, B.OAK);
      if (big) for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (hash3(x + dx, 9, z + dz, seed) < 0.5) putTrunk(x + dx, y0 + hgt - 2, z + dz, B.OAK);
      for (let dy = -ri; dy <= ri; dy++) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
        const q = (dx * dx + dz * dz) / (R * R) + ((dy + 0.4) * (dy + 0.4)) / (R * R * 0.62);
        if (q > 1) continue;
        if (q > 0.72 && hash3(x + dx, Math.round(cy + dy), z + dz, seed + 5) < 0.42) continue;      // a ragged edge
        putAir(x + dx, Math.round(cy + dy), z + dz, B.OAK_LEAVES);
      }
    }
    function pine(x, z, y0, seed, snowy) {
      const hgt = 7 + Math.floor(hash3(x, 3, z, seed) * 4);
      for (let y = y0; y < y0 + hgt; y++) putTrunk(x, y, z, B.PINE);
      for (let y = y0 + 2; y <= y0 + hgt + 1; y++) {
        const t = (y - y0 - 2) / (hgt - 1), R = (1 - t) * 3.1 + 0.6 + ((y - y0) % 2 ? 0.45 : 0), ri = Math.ceil(R);
        for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
          if (dx * dx + dz * dz > R * R) continue;
          // snow lies on the needles that have nothing over them: the top of each layer's rim and the crown
          const R2 = (1 - (y + 1 - y0 - 2) / (hgt - 1)) * 3.1 + 0.6 + ((y + 1 - y0) % 2 ? 0.45 : 0);
          const covered = y + 1 <= y0 + hgt + 1 && dx * dx + dz * dz <= R2 * R2;
          putAir(x + dx, y, z + dz, snowy && !covered ? B.PINE_SNOWY : B.PINE_NEEDLES);
        }
      }
    }
    function palm(x, z, y0, seed) {
      const hgt = 5 + Math.floor(hash3(x, 4, z, seed) * 3.5);
      const a = Math.floor(hash3(x, 5, z, seed) * 4), lx = [1, -1, 0, 0][a], lz = [0, 0, 1, -1][a];
      let px = x, pz = z;
      for (let i = 0; i < hgt; i++) {
        putTrunk(px, y0 + i, pz, B.PALM);
        if (i === Math.floor(hgt * 0.55) || i === hgt - 2) { px += lx; pz += lz; putTrunk(px, y0 + i, pz, B.PALM); }   // the trunk leans a step
      }
      const ty = y0 + hgt;
      putAir(px, ty - 1, pz, B.PALM);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) putAir(px + dx, ty, pz + dz, B.PALM_FROND);
      putAir(px, ty + 1, pz, B.PALM_FROND);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        putAir(px + dx * 2, ty, pz + dz * 2, B.PALM_FROND);
        putAir(px + dx * 3, ty - 1, pz + dz * 3, B.PALM_FROND); putAir(px + dx * 3, ty, pz + dz * 3, B.PALM_FROND);
        putAir(px + dx * 4, ty - 1, pz + dz * 4, B.PALM_FROND); putAir(px + dx * 4, ty - 2, pz + dz * 4, B.PALM_FROND);
      }
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { putAir(px + dx * 2, ty - 1, pz + dz * 2, B.PALM_FROND); putAir(px + dx * 2, ty - 1, pz + dz, B.PALM_FROND); }
    }
    for (const t of treesIn(X0 - 6, X0 + C + 6, Z0 - 6, Z0 + C + 6)) {
      if (t.kind === 'stump') { putTrunk(t.x, t.y, t.z, B.OAK); putTrunk(t.x, t.y + 1, t.z, B.OAK); }
      else if (t.kind === 'oak') oak(t.x, t.z, t.y, t.seed, t.big);
      else if (t.kind === 'pine') pine(t.x, t.z, t.y, 41, t.snowy);
      else palm(t.x, t.z, t.y, 51);
    }
    return fires;
  }

  // ------------------------------------------------------------------ trees
  const G = 5;                                   // the tree grid: one candidate in each 5 x 5 cell
  const treeCache = new Map();
  /** The tree of grid cell (gx, gz), or null: { kind, x, z, y (first trunk cell), seed, big, snowy }. */
  function treeOf(gx, gz) {
    const key = gx * 8192 + gz;
    let t = treeCache.get(key);
    if (t !== undefined) return t;
    t = null;
    const x = gx * G + 1 + Math.floor(hash3(gx, 1, gz, 521) * 3), z = gz * G + 1 + Math.floor(hash3(gx, 2, gz, 523) * 3);
    const r = hash3(gx, 3, gz, 525);
    if (spawn && Math.floor(spawn.oak.x / G) === gx && Math.floor(spawn.oak.z / G) === gz) t = { kind: 'stump', x: spawn.oak.x, z: spawn.oak.z, y: spawn.y + 1 };
    else if (!(spawn && Math.abs(x - spawn.x) < 9 && Math.abs(z - spawn.z) < 9) && r < 0.75) {
      const c = column(x, z), h = hInt(c.hf);
      if (h >= c.wl) {
        const { s, ws, wf, wd, mm, ice, wl } = c, pond = c.pond;
        // level ground only: every neighbour within a block
        const hx1 = hInt(column(x + 1, z).hf), hx0 = hInt(column(x - 1, z).hf), hz1 = hInt(column(x, z + 1).hf), hz0 = hInt(column(x, z - 1).hf);
        const level = Math.abs(hx1 - h) <= 1 && Math.abs(hx0 - h) <= 1 && Math.abs(hz1 - h) <= 1 && Math.abs(hz0 - h) <= 1;
        if (level && !carvedAt(x, h, z) && !carvedAt(x, h + 1, z)) {
          const slope = Math.hypot(hx1 - hx0, hz1 - hz0) * 0.5, exposed = hx1 < h || hx0 < h || hz1 < h || hz0 < h;
          const land = pickLand(x, z, ws, wf, wd);
          const top = topOf(x, z, h, slope, exposed, land, s, wl, ice, mm);
          const glade = N.fbm2(x / 22 + 9, z / 22, 2);
          if (top === B.GRASS) {
            const dens = land === L_FOREST ? 0.78 * smooth(-0.4, 0.2, glade) : land === L_PLAINS ? 0.02 + 0.06 * smooth(0.3, 0.55, glade) : 0.2;
            if (ws > 0.15 && r < 0.28) t = { kind: 'pine', x, z, y: h + 1, snowy: false };
            else if (r < dens) t = { kind: 'oak', x, z, y: h + 1, seed: 31 + (x & 7), big: hash3(x, 9, z, 7) < 0.25 };
          } else if ((top === B.SNOW || top === B.SNOWBLOCK) && r < (h > SEA + 34 ? 0.1 : 0.36)) t = { kind: 'pine', x, z, y: h + 1, snowy: true };
          else if (top === B.SAND) {
            const nearHole = pond && pond.kind === 'hole' && Math.hypot(x - pond.x, z - pond.z) < 11;
            const beach = s < 0.06 && ws < 0.2;
            const dens = nearHole ? 0.7 : beach ? 0.16 : wd > 0.5 ? 0.012 : 0;
            if (r < dens && hash3(gx, 4, gz, 527) < 0.6) t = { kind: 'palm', x, z, y: h + 1 };
          }
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
  /** One of 'desert' | 'forest' | 'snow' | 'plains' | 'beach' | 'sea' | 'mountain' (play coordinates). */
  function landOf(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    const c = column(x, z), h = hInt(c.hf);
    if (h < c.wl) return 'sea';
    if (c.s < 0.035 && h <= SEA + 2) return 'beach';
    if (h > SEA + 20 && c.mm > 0.2) return 'mountain';
    const { ws, wd, wf, wp } = c;
    return ws >= wd && ws >= wf && ws >= wp ? 'snow' : wd >= wf && wd >= wp ? 'desert' : wf >= wp ? 'forest' : 'plains';
  }
  /** Surface height (top block y) of a column as made, before caves and trees. */
  const heightAt = (x, z) => hInt(column(Math.floor(x), Math.floor(z)).hf);

  /** For the far view: the ground height (with the tree tops of a forest) and its colour, cheaply. */
  const COL = {
    grass: [0.3, 0.53, 0.2], plains: [0.36, 0.57, 0.22], forest: [0.17, 0.34, 0.13], sand: [0.86, 0.76, 0.52], snow: [0.88, 0.91, 0.95],
    rock: [0.46, 0.45, 0.43], water: [0.46, 0.71, 0.81], deep: [0.36, 0.6, 0.75], ice: [0.8, 0.9, 0.95], pine: [0.2, 0.33, 0.24],
  };
  function farSample(x, z, out) {
    const c = column(x, z), h = c.hf;
    let y = h, rgb;
    out[4] = 0;
    if (h < c.wl - 0.5) { out[4] = 1; y = c.wl + 0.88; rgb = c.ice ? COL.ice : c.wl - h > 6 ? COL.deep : COL.water; }
    else if (c.s < 0.035 && h <= SEA + 2.5) rgb = c.ws > 0.5 ? COL.rock : COL.sand;
    else if (h > snowLine(x, z) - 1) rgb = COL.snow;
    else if (c.mm > 0.2 && h > SEA + 19) rgb = COL.rock;
    else {
      const { ws, wd, wf, wp } = c, tot = ws + wd + wf + wp;
      const a = ws / tot, b = wd / tot, f = wf / tot, p = wp / tot;
      const g = 0.5 + N.fbm2(x / 22 + 9, z / 22, 2);
      const fr = f * clamp(g * 1.4);
      out[0] = a * COL.snow[0] + b * COL.sand[0] + fr * COL.forest[0] + (f - fr) * COL.grass[0] + p * COL.plains[0];
      out[1] = a * COL.snow[1] + b * COL.sand[1] + fr * COL.forest[1] + (f - fr) * COL.grass[1] + p * COL.plains[1];
      out[2] = a * COL.snow[2] + b * COL.sand[2] + fr * COL.forest[2] + (f - fr) * COL.grass[2] + p * COL.plains[2];
      if (a > 0.5) { out[0] = mix(out[0], COL.pine[0], 0.45); out[1] = mix(out[1], COL.pine[1], 0.45); out[2] = mix(out[2], COL.pine[2], 0.45); }
      out[3] = y + fr * 5 + a * 2;              // forest canopy stands above the ground
      return out;
    }
    out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2]; out[3] = y;
    return out;
  }

  // ------------------------------------------------------------------ the start: flat grass in the plains, near a forest, snow mountains in sight
  function findSpawn() {
    let best = null;
    const flatAt = (x, z, h) => { for (let dz = -9; dz <= 9; dz += 3) for (let dx = -9; dx <= 9; dx += 3) { const t = baseHeight(x + dx, z + dz); if (Math.abs(t - h) > 1.6 || t < SEA + 2) return false; } return true; };
    for (let ring = 0; ring < 60 && !best; ring++) {
      const n = Math.max(1, ring * 6);
      for (let i = 0; i < n && !best; i++) {
        const a = i / n * Math.PI * 2, x = Math.round(MID + Math.cos(a) * ring * 48), z = Math.round(MID + Math.sin(a) * ring * 48);
        const h = baseHeight(x, z);
        if (col.wp < 0.85 || col.mm > 0.05 || col.s < 0.15 || h < SEA + 2.5 || h > SEA + 9) continue;
        if (!flatAt(x, z, h)) continue;
        // open grass all round, and a forest a little way off
        let forest = false, close = false;
        for (let k = 0; k < 16 && !close; k++) { const b = k / 16 * Math.PI * 2; for (const r of [20, 40, 60, 80, 100, 120]) { climate(x + Math.cos(b) * r, z + Math.sin(b) * r); if (col.wf > 0.5) { if (r <= 40) close = true; else forest = true; break; } } }
        if (!forest || close) continue;
        // the highest snowy peak between 150 and 520 blocks away
        let peak = null;
        for (let k = 0; k < 48; k++) {
          const b = k / 48 * Math.PI * 2;
          for (let r = 150; r <= 520; r += 30) { const px = x + Math.cos(b) * r, pz = z + Math.sin(b) * r, ph = baseHeight(px, pz); if (ph > SEA + 42 && (!peak || ph > peak.h)) peak = { x: px, z: pz, h: ph, r }; }
        }
        if (!peak) continue;
        best = { x, z, h, peak };
      }
    }
    if (!best) best = { x: MID, z: MID, h: baseHeight(MID, MID), peak: null };
    const y = Math.floor(best.h);
    // face the peak; the first wood to chop (a stump two logs high, so it hides little) stands 5 blocks ahead
    const yaw = best.peak ? Math.atan2(-(best.peak.x - best.x), -(best.peak.z - best.z)) : 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    spawn = { x: best.x, z: best.z, y, yaw, peak: best.peak, oak: { x: Math.round(best.x + fx * 5), z: Math.round(best.z + fz * 5) } };
    return spawn;
  }

  findSpawn();
  return {
    SY, SEA, C, SIZE, spawn, fillChunk, column, landOf, heightAt, baseHeight, farSample, cavesIn, treesIn,
  };
}
