// The endless desert of "waha", kept as chunks of 32 x 32 columns that are made the first time anything reads them.
//
// The hand-made home map (world.js buildWorld: the fort, the oasis, the camp) is copied into the chunks it covers;
// every other chunk is made from terrainAt with the same rules as the home map's ground (strata, weathered cliff
// faces, boulders, scrub), plus what only the open desert has: caves with ore in the mesas, small oases with palms,
// salt flats, a ruined wind tower here and there.
//
// Besides its cells, a chunk keeps the tables the sloped-dune mesher needs (mesher.js): for each column its top
// block, its highest block, whether it is still untouched loose ground; for each of its corners the smooth surface
// height and how firm the sand is. A corner is "finished" (smooth or not, held within reach of its columns) the
// first time it is read, from the columns round it as they were made.
//
// Coordinates: the grid (what the controller, shared/play.js, works in) starts at zero; world coordinates are the
// grid's plus (OXC, OZC). Everything here takes grid coordinates unless it says otherwise.
import { makeNoise, hash3, mulberry32 } from '../../shared/noise.js';
import { K } from '../../shared/kit.js';
import {
  B, SY, GROUND, WATER_Y, X0, X1, Z0, Z1, SX, SIZE, CHUNK as C, OXC, OZC, SOFT, colIndex, cornerIndex,
  terrainAt, strataAt, weatherColumn, cornerSample, scrubAt, sandDrift, oasisOfCell, homeDist,
} from './world.js';

const PALM = 29;                                  // the game's palm trunk block (see game.js)
const SH = 5, CC = C * C;
const SURF = { sand: 0, hardpan: 1, gravel: 2, rock: 3, damp: 4, salt: 5 };
const isPlantOrWater = (id) => id >= B.WATER && id <= B.SHRUB;
const isStrata = (id) => id >= B.ROCK_A && id <= B.ROCK_D;
const N3 = makeNoise(5150);

/** The palm's lean, the same two numbers props.js buildPalms draws it with. */
export function palmLean(seed) {
  const rnd = mulberry32(seed * 7919 + 13);
  const a = rnd() * Math.PI * 2, m = 0.4 + rnd() * 1.3;
  return [Math.cos(a) * m, Math.sin(a) * m];
}

// where the palms of an oasis stand (world coordinates), worked out once per oasis from terrainAt alone, so the
// chunks on either side of a chunk border agree
const oasisPalms = new Map();
function palmsOfOasis(o) {
  const k = o.i * 100003 + o.j;
  let list = oasisPalms.get(k);
  if (list) return list;
  list = [];
  const want = 6 + Math.floor(hash3(o.i, 3, o.j, 77) * 9);
  for (let n = 0; n < 160 && list.length < want; n++) {
    const a = hash3(n, 1, o.seed, 301) * Math.PI * 2, rad = 1.15 + hash3(n, 2, o.seed, 302) * 1.5;
    const x = Math.floor(o.x + Math.cos(a) * o.rx * rad), z = Math.floor(o.z + Math.sin(a) * o.rz * rad);
    if (list.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6)) continue;
    const t = terrainAt(x + 0.5, z + 0.5);
    if (Math.floor(t.h) <= WATER_Y || t.surf === 'rock') continue;
    list.push({ x, z, h: 5.5 + hash3(n, 4, o.seed, 304) * 5.5, seed: (o.seed + n * 31) | 0 });
  }
  // a ruined wind tower stands by some oases: a short clay shaft with its head (game.js turns its sails)
  if (hash3(o.i, 5, o.j, 78) < 0.45) {
    const a = hash3(o.i, 6, o.j, 79) * Math.PI * 2, x = Math.floor(o.x + Math.cos(a) * o.rx * 3.4), z = Math.floor(o.z + Math.sin(a) * o.rz * 3.4);
    const t = terrainAt(x + 0.5, z + 0.5);
    if (t.surf !== 'rock' && Math.floor(t.h) > WATER_Y) list.tower = { x, z };
  }
  oasisPalms.set(k, list);
  return list;
}

export function createDesert(W) {
  const NC = SIZE / C;
  const chunks = new Map();                      // key -> chunk record
  let made = 0, genMs = 0, lastK = -1, lastR = null;
  const keyOf = (ci, cj) => ci * NC + cj;
  const api = { chunks, sx: SIZE, sy: SY, sz: SIZE, C, onChunk: null };

  // ---------------------------------------------------------------- one chunk
  function newRec(ci, cj) {
    return {
      ci, cj, d: new Uint8Array(CC * SY),
      top: new Int16Array(CC), colMax: new Int16Array(CC), nat: new Uint8Array(CC), top0: new Int16Array(CC), nat0: new Uint8Array(CC),
      hc: new Float32Array(CC), firm: new Float32Array(CC), sm: new Int8Array(CC).fill(-1),
      palms: [], palmAt: new Map(), towers: [], edited: false, home: false,
    };
  }
  const SAMPLE = { hc: 0, firm: 0 };
  function make(ci, cj) {
    const t0 = performance.now();
    const rec = newRec(ci, cj);
    const wx0 = ci * C + OXC, wz0 = cj * C + OZC;
    const touchesHome = wx0 < X1 && wx0 + C > X0 && wz0 < Z1 && wz0 + C > Z0;
    const allHome = wx0 >= X0 && wx0 + C <= X1 && wz0 >= Z0 && wz0 + C <= Z1;
    if (!allHome) desert(rec, wx0, wz0);
    if (touchesHome) home(rec, wx0, wz0);
    made++; genMs += performance.now() - t0;
    return rec;
  }

  // the home map's columns and corners, as buildWorld left them
  function home(rec, wx0, wz0) {
    const src = W.world.data, d = rec.d;
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const wx = wx0 + x, wz = wz0 + z;
      if (wx >= X0 && wx < X1 && wz >= Z0 && wz < Z1) {
        const ci = colIndex(wx, wz), i = x + (z << SH);
        for (let y = 0; y < SY; y++) d[i + y * CC] = src[ci + W.world.sx * W.world.sz * y];
        rec.top[i] = W.top[ci]; rec.colMax[i] = W.colMax[ci]; rec.nat[i] = W.nat[ci];
        rec.top0[i] = W.top[ci]; rec.nat0[i] = W.nat[ci];
      }
      if (wx >= X0 && wx <= X1 && wz >= Z0 && wz <= Z1) {
        const k = cornerIndex(wx, wz), i = x + (z << SH);
        rec.hc[i] = W.hc[k]; rec.firm[i] = W.firm[k]; rec.sm[i] = W.smooth[k];
      }
    }
    rec.home = true;
  }

  // ---- the open desert
  const P = C + 2;
  const sH = new Float32Array(P * P), sTop = new Int16Array(P * P), sSurf = new Uint8Array(P * P), sT = new Array(P * P);
  const origId = new Uint8Array(CC);
  function desert(rec, wx0, wz0) {
    const d = rec.d;
    // terrain samples for the columns of the chunk and one more all round
    for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
      const t = terrainAt(wx0 + i - 1 + 0.5, wz0 + j - 1 + 0.5), k = i + j * P;
      sT[k] = t; sH[k] = t.h; sTop[k] = Math.min(SY - 3, Math.floor(t.h)); sSurf[k] = SURF[t.surf] ?? 0;
    }
    const S = (x, z) => (x + 1) + (z + 1) * P;
    // 1. the ground, column by column (buildWorld's first pass)
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const t = sT[S(x, z)], top = sTop[S(x, z)], i = x + (z << SH);
      const wx = wx0 + x, wz = wz0 + z;
      for (let y = 0; y <= top; y++) {
        let id;
        const depth = top - y;
        if (t.surf === 'rock') {
          id = strataAt(wx, y, wz);
          if (depth === 0 && t.rock > 20 && sandDrift(wx, wz)) id = B.SAND;
        } else if (depth === 0) {
          id = t.surf === 'damp' ? B.DAMP : t.surf === 'gravel' ? B.GRAVEL : t.surf === 'salt' ? B.SALT : B.SAND;
        } else if (depth < 4 && t.rock < 0.9) id = t.surf === 'damp' ? B.DAMP : B.PACKED;
        else id = strataAt(wx, y, wz);
        d[i + y * CC] = id;
      }
      origId[i] = d[i + top * CC];
      for (let y = top + 1; y <= WATER_Y; y++) d[i + y * CC] = B.WATER;
    }
    // 2. the cliff faces
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const k = S(x, z), t = sT[k];
      if (t.r < -1) continue;
      const i = x + (z << SH);
      weatherColumn(wx0 + x, wz0 + z, t, sTop[k], (y) => d[i + y * CC], (y, id) => { d[i + y * CC] = id; });
    }
    // 3. boulders come down onto the scree (each starts in a column, and may lean into the next)
    for (let z = -1; z < C; z++) for (let x = -1; x < C; x++) {
      const wx = wx0 + x, wz = wz0 + z;
      if (sSurf[S(x, z)] !== SURF.gravel || hash3(wx, 31, wz, 5) > 0.012) continue;
      const s = hash3(wx, 32, wz, 6), ty = sTop[S(x, z)];
      const w = s > 0.7 ? 2 : 1, hgt = s > 0.85 ? 2 : 1;
      for (let dz = 0; dz < w; dz++) for (let dx = 0; dx < w; dx++) for (let dy = 0; dy <= hgt; dy++) {
        const cx = x + dx, cz = z + dz;
        if (cx < 0 || cz < 0 || cx >= C || cz >= C) continue;
        if (dy === hgt && (dx || dz) && hash3(wx + dx, 33, wz + dz, 7) < 0.6) continue;
        if (sSurf[S(cx, cz)] !== SURF.gravel) continue;
        const y = Math.min(sTop[S(cx, cz)], ty) + dy;
        d[cx + (cz << SH) + y * CC] = dy === hgt ? B.RUBBLE : strataAt(wx + dx, ty + 9 + dy, wz + dz);
      }
    }
    // 4. caves wind through the rock of the mesas, and ore shows in their walls (and, rarely, deeper in the rock)
    let caved = false;
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const k = S(x, z), t = sT[k];
      if (t.w > 0.02 || t.rock < 0.9 || sTop[k] < GROUND + 8) continue;
      const i = x + (z << SH), wx = wx0 + x, wz = wz0 + z, yTop = sTop[k] - 4;
      for (let y = 5; y <= yTop; y++) {
        const id = d[i + y * CC];
        if (!isStrata(id)) continue;
        const a = N3.n3(wx * 0.045, y * 0.075, wz * 0.045), b = N3.n3(wx * 0.045 + 31.7, y * 0.075 + 11.3, wz * 0.045 + 7.1);
        if (a * a + b * b < 0.011) { d[i + y * CC] = 0; caved = true; }
      }
    }
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const k = S(x, z), t = sT[k];
      if (t.w > 0.02 || t.rock < 0.9) continue;
      const i = x + (z << SH), wx = wx0 + x, wz = wz0 + z, yTop = sTop[k] - 2;
      for (let y = 3; y <= yTop; y++) {
        const at = i + y * CC;
        if (!isStrata(d[at])) continue;
        let open = false;
        if (caved) {
          if (d[at + CC] === 0 || d[at - CC] === 0) open = true;
          else if (x > 0 && d[at - 1] === 0) open = true; else if (x < C - 1 && d[at + 1] === 0) open = true;
          else if (z > 0 && d[at - C] === 0) open = true; else if (z < C - 1 && d[at + C] === 0) open = true;
        }
        const r = hash3(wx, y, wz, 9091);
        if (r > (open ? 0.06 : 0.0015)) continue;
        d[at] = oreFor(y, hash3(wx, y, wz, 9092));
      }
    }
    // 5. plants: reeds and grass round an oasis pool, scrub on the open ground
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const k = S(x, z), t = sT[k], i = x + (z << SH), top = sTop[k];
      if (top + 1 >= SY || d[i + (top + 1) * CC]) continue;
      const top0 = d[i + top * CC];
      const wx = wx0 + x, wz = wz0 + z;
      if (t.oasis && t.pr < 2.2) {
        if (top0 !== B.DAMP && top0 !== B.SAND && top0 !== B.HARDPAN) continue;
        const r = hash3(wx, 11, wz, 17);
        if (t.pr > 0.93 && t.pr < 1.12 && r < 0.55) d[i + (top + 1) * CC] = B.REED;
        else if (t.pr >= 1.05 && t.pr < 1.9 && r < 0.22) d[i + (top + 1) * CC] = B.TUFT;
        continue;
      }
      if (top < GROUND || (top0 !== B.SAND && top0 !== B.HARDPAN && top0 !== B.GRAVEL && top0 !== B.SALT)) continue;
      const plant = scrubAt(wx, wz, t.surf);
      if (plant) d[i + (top + 1) * CC] = plant;
    }
    // 6. the column tables and the corners
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const i = x + (z << SH), k = S(x, z);
      let m = SY - 1; while (m >= 0 && !d[i + m * CC]) m--;
      rec.colMax[i] = m;
      let ty = m; while (ty >= 0 && (!d[i + ty * CC] || isPlantOrWater(d[i + ty * CC]))) ty--;
      rec.top[i] = ty;
      const above = ty + 1 < SY ? d[i + (ty + 1) * CC] : 0;
      rec.nat[i] = (sSurf[k] !== SURF.rock && ty === sTop[k] && d[i + ty * CC] === origId[i] && SOFT.has(origId[i]) && (!above || isPlantOrWater(above))) ? 1 : 0;
      cornerSample(wx0 + x, wz0 + z, SAMPLE);
      rec.hc[i] = SAMPLE.hc; rec.firm[i] = SAMPLE.firm;
    }
    rec.top0.set(rec.top); rec.nat0.set(rec.nat);
    // 7. palms (after the tables: a trunk does not make the sand under it a touched column) and wind towers
    const plant = (p) => {
      const lx = p.x - wx0, lz = p.z - wz0;
      if (lx < 2 || lz < 2 || lx >= C - 2 || lz >= C - 2) return;
      const i = lx + (lz << SH), k = S(lx, lz), top = rec.top[i];
      if (top <= WATER_Y || d[i + top * CC] === B.WATER) return;
      const t = sT[k], surfY = Math.min(top + 1, t.h + 0.5);
      const palm = { x: p.x + 0.5, y: surfY - 0.15, z: p.z + 0.5, h: p.h, seed: p.seed, cells: [], felled: false, gen: true };
      const [ax, az] = palmLean(p.seed);
      palm.lean = [ax, az];
      if (d[i + (top + 1) * CC] && isPlantOrWater(d[i + (top + 1) * CC])) d[i + (top + 1) * CC] = 0;
      for (let y = top + 1; y < palm.y + palm.h - 0.2 && y < SY; y++) {
        const u = Math.max(0, (y + 0.5 - palm.y) / palm.h), cx = Math.floor(palm.x + ax * u * u) - wx0, cz = Math.floor(palm.z + az * u * u) - wz0;
        if (cx < 0 || cz < 0 || cx >= C || cz >= C) continue;
        const at = cx + (cz << SH) + y * CC;
        if (d[at]) continue;
        d[at] = PALM;
        palm.cells.push([cx + wx0 - OXC, y, cz + wz0 - OZC]);
        rec.palmAt.set(at, palm);
      }
      palm.root = [lx + wx0 - OXC, top, lz + wz0 - OZC];
      rec.palms.push(palm);
    };
    const seen = new Set();
    for (const [dx, dz] of [[0, 0], [C, 0], [0, C], [C, C]]) {
      const ox = Math.floor((wx0 + dx) / 150), oz = Math.floor((wz0 + dz) / 150), kk = ox + ',' + oz;
      if (seen.has(kk)) continue;
      seen.add(kk);
      const o = oasisOfCell(ox, oz);
      if (!o) continue;
      const list = palmsOfOasis(o);
      for (const p of list) if (p.x >= wx0 && p.x < wx0 + C && p.z >= wz0 && p.z < wz0 + C) plant(p);
      const tw = list.tower;
      if (tw && tw.x >= wx0 + 1 && tw.x < wx0 + C - 1 && tw.z >= wz0 + 1 && tw.z < wz0 + C - 1) {
        const lx = tw.x - wx0, lz = tw.z - wz0, i = lx + (lz << SH), top = rec.top[i];
        if (top > WATER_Y && top + 5 < SY) {
          for (let y = top + 1; y <= top + 3; y++) d[i + y * CC] = y === top + 3 ? B.BRICK : B.ADOBE;
          d[i + (top + 4) * CC] = B.WINDHEAD;
          rec.colMax[i] = Math.max(rec.colMax[i], top + 4);
          rec.top[i] = top + 4; rec.nat[i] = 0;
          rec.towers.push([tw.x - OXC, top + 4, tw.z - OZC]);
        }
      }
    }
    // a lone palm here and there along a wadi or beside a salt flat
    for (let z = 3; z < C - 3; z += 1) for (let x = 3; x < C - 3; x += 1) {
      const wx = wx0 + x, wz = wz0 + z, k = S(x, z);
      if (hash3(wx, 41, wz, 4141) > 0.0016) continue;
      const surf = sSurf[k];
      if (surf !== SURF.gravel && surf !== SURF.hardpan) continue;
      if (sT[k].w > 0.5) continue;
      plant({ x: wx, z: wz, h: 5 + hash3(wx, 42, wz, 4142) * 4, seed: (wx * 13 + wz * 7) | 0 });
    }
  }
  function oreFor(y, r) {
    if (y < 16) return r < 0.42 ? K.ROCK_COAL : r < 0.62 ? K.ROCK_GOLD : r < 0.72 ? K.ROCK_DIAMOND : r < 0.80 ? K.ROCK_RUBY : r < 0.88 ? K.ROCK_EMERALD : K.ROCK_AMETHYST;
    if (y < 32) return r < 0.66 ? K.ROCK_COAL : r < 0.82 ? K.ROCK_GOLD : r < 0.87 ? K.ROCK_AMETHYST : r < 0.92 ? K.ROCK_EMERALD : r < 0.96 ? K.ROCK_RUBY : K.ROCK_DIAMOND;
    return r < 0.84 ? K.ROCK_COAL : r < 0.95 ? K.ROCK_GOLD : K.ROCK_AMETHYST;
  }

  // ---------------------------------------------------------------- access
  /** The record of chunk (ci, cj), made now if needed. */
  function chunk(ci, cj) {
    const k = ci * NC + cj;
    if (k === lastK) return lastR;
    let r = chunks.get(k);
    if (!r) { r = make(ci, cj); chunks.set(k, r); if (api.onChunk) api.onChunk(r); }
    lastK = k; lastR = r;
    return r;
  }
  const has = (ci, cj) => chunks.has(ci * NC + cj);
  const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < SIZE && y < SY && z < SIZE;
  function get(x, y, z) {
    if (y < 0 || y >= SY || x < 0 || z < 0 || x >= SIZE || z >= SIZE) return 0;
    x |= 0; y |= 0; z |= 0;
    return chunk(x >> SH, z >> SH).d[(x & 31) + ((z & 31) << SH) + y * CC];
  }
  function set(x, y, z, id) {
    if (y < 0 || y >= SY || x < 0 || z < 0 || x >= SIZE || z >= SIZE) return;
    x |= 0; y |= 0; z |= 0;
    const r = chunk(x >> SH, z >> SH);
    r.d[(x & 31) + ((z & 31) << SH) + y * CC] = id;
    r.edited = true;
  }
  /** The column record and index of column (x, z). */
  const colRec = (x, z) => chunk(x >> SH, z >> SH);
  const ci32 = (x, z) => (x & 31) + ((z & 31) << SH);
  const topAt = (x, z) => colRec(x, z).top[ci32(x, z)];
  const natAt = (x, z) => colRec(x, z).nat[ci32(x, z)];
  const colMaxAt = (x, z) => colRec(x, z).colMax[ci32(x, z)];
  /** Corner (x, z), finished if it was not: { hc, smooth, firm } in out. */
  function corner(x, z, out) {
    const r = colRec(x, z), i = ci32(x, z);
    if (r.sm[i] < 0) {
      // smooth when all four columns round it were untouched loose ground as made; its height within reach of them
      let s = 1, lo = -1e9, hi = 1e9;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const q = colRec(x + dx, z + dz), j = ci32(x + dx, z + dz);
        if (!q.nat0[j]) s = 0;
        const t = q.top0[j] + 1;
        lo = Math.max(lo, t - 1.6); hi = Math.min(hi, t + 1.6);
      }
      if (s && lo <= hi) r.hc[i] = Math.min(hi, Math.max(lo, r.hc[i]));
      r.sm[i] = s;
    }
    out.hc = r.hc[i]; out.smooth = r.sm[i]; out.firm = r.firm[i];
    return out;
  }
  const CO = { hc: 0, smooth: 0, firm: 0 };
  /** Walkable ground height at any point (grid coordinates): on the sloped surface over untouched ground, else the block top. */
  function surfaceY(xf, zf) {
    const x = Math.floor(xf), z = Math.floor(zf);
    if (x < 1 || z < 1 || x >= SIZE - 1 || z >= SIZE - 1) return GROUND + 1;
    const r = colRec(x, z), i = ci32(x, z), s = r.top[i] + 1;
    if (!r.nat[i]) return s;
    const fx = xf - x, fz = zf - z;
    const cy = (cx, cz) => { corner(cx, cz, CO); return CO.smooth ? CO.hc : s; };
    const a = cy(x, z), b = cy(x + 1, z), c = cy(x, z + 1), e = cy(x + 1, z + 1);
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + e * fx) * fz;
  }
  /** The palm one of whose trunk cells is (x, y, z), or null. */
  function palmAt(x, y, z) {
    if (y < 0 || y >= SY) return null;
    const r = colRec(x, z);
    return r.palmAt.get((x & 31) + ((z & 31) << SH) + y * CC) || null;
  }
  /** Forget the made chunks that were never changed and are not wanted now. */
  function drop(keep) {
    let n = 0;
    for (const [k, r] of chunks) {
      if (r.edited || r.home || keep(r.ci, r.cj)) continue;
      chunks.delete(k); n++;
    }
    if (n) { lastK = -1; lastR = null; }
    return n;
  }
  Object.assign(api, {
    chunk, has, inb, get, set, topAt, natAt, colMaxAt, colRec, ci32, corner, surfaceY, palmAt, drop,
    bytes: () => chunks.size * CC * SY,
    /** Grid <-> world. */
    OX: OXC, OZ: OZC,
  });
  // live numbers (Object.assign would copy a getter's value once, not the getter)
  Object.defineProperties(api, { made: { get: () => made }, genMs: { get: () => genMs } });
  return api;
}
export { SIZE, C as CHUNK, homeDist };
