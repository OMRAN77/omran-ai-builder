// The endless terrain of "dhalam", drawn piece by piece round the player, with its baked light.
//
// shared/stream.js draws a paged world with ambient occlusion only. This world also bakes its light into every vertex:
// open sky (aLit.x), the warm light of the camp's fire and torches (aLit.y) and the coloured light of lamps, fires,
// glowing crystal and gears (aTint), the same attributes world.js gives the hand-made valley, so the materials (fx.js
// patch) are the ones they always were.
//
// The light of a chunk is worked out when the chunk is meshed, in a box of the chunk and 18 blocks round it (the
// furthest any light reaches: the camp fire starts at 19), flooded through the air, and thrown away once the chunk's
// vertices have it. Nothing is stored, so there is no light to keep in step with edits: an edit meshes again the chunk
// it is in at once, and the chunks its light can reach a frame or two later.
//
//   const t = createLitTerrain(world, BLOCKS, { materialFor, homeLights, radius, decorate });
//   scene.add(t.group); every frame t.update(px, pz); t.setBlock(x, y, z, id); t.flush();

import * as THREE from 'three';
import { makeNoise } from '../../shared/noise.js';

const FACES = [
  { name: 'side', dir: [-1, 0, 0], corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { name: 'side', dir: [1, 0, 0], corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { name: 'bottom', dir: [0, -1, 0], corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { name: 'top', dir: [0, 1, 0], corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { name: 'side', dir: [0, 0, -1], corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { name: 'side', dir: [0, 0, 1], corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
];
const KINDS = { solid: 1, cutout: 2, translucent: 3, liquid: 4, slab: 5, cross: 6, none: 7 };
const KIND_NAME = ['', 'solid', 'cutout', 'translucent', 'liquid', 'slab', 'cross', 'none'];
const CROSS = [[0.08, 0.08, 0.92, 0.92], [0.92, 0.08, 0.08, 0.92]];

class Buf {
  constructor(tile, kind) { this.tile = tile; this.kind = kind; this.cap = 0; this.nv = 0; this.ni = 0; this.grow(1024); }
  grow(n) {
    const cap = Math.max(n, this.cap * 2), keep = (A, k, old) => { const a = new A(cap * k); if (old) a.set(old.subarray(0, this.nv * k)); return a; };
    this.pos = keep(Float32Array, 3, this.pos); this.nrm = keep(Int8Array, 3, this.nrm); this.uv = keep(Float32Array, 2, this.uv);
    this.col = keep(Uint8Array, 3, this.col); this.lit = keep(Float32Array, 2, this.lit); this.tin = keep(Uint8Array, 4, this.tin);
    const idx = new Uint32Array(cap * 3 + 12); if (this.idx) idx.set(this.idx.subarray(0, this.ni)); this.idx = idx;
    this.cap = cap;
  }
  room(nv) { if (this.nv + nv > this.cap) this.grow(this.nv + nv); }
}

export function createLitTerrain(world, blocks, opts = {}) {
  const { materialFor, uvScale = {}, picTiles = new Set(), homeLights = [], decorate = null, onMesh = null } = opts;
  const aoCurve = opts.aoCurve || [0.3, 0.52, 0.78, 1.0], liquidDrop = opts.liquidDrop ?? 0.18, LAMP = opts.lamp || 7;
  const C = world.C, SH = world.shift, SY = world.sy;
  const M = 18, BW = C + 2 * M, L = BW * BW, NB = L * (SY + 2);
  const ids = new Uint8Array(NB), sky = new Uint8Array(NB), blk = new Uint8Array(NB), lv = new Uint8Array(NB), lc = new Uint8Array(NB);
  const top = new Int16Array(L);
  const Q = new Int32Array(1 << 20), QM = Q.length - 1;
  // what each block id is, learnt the first time it is seen
  const seen = new Uint8Array(256), KIND = new Uint8Array(256), OCC = new Uint8Array(256), PASS = new Uint8Array(256), SHADE = new Float32Array(256).fill(1), HGT = new Float32Array(256).fill(1);
  const LCOL = new Uint8Array(256), LLEV = new Uint8Array(256), OWN = new Uint8Array(256 * 6), SCALE = new Float32Array(256 * 6), BK = new Int32Array(256 * 6).fill(-1);
  const pal = [[0, 0, 0]], palIndex = new Map();
  const colour = (hex) => { let i = palIndex.get(hex); if (i === undefined) { const c = new THREE.Color(hex), m = Math.max(c.r, c.g, c.b, 1e-3); i = pal.length; pal.push([c.r / m, c.g / m, c.b / m]); palIndex.set(hex, i); } return i; };
  const bufs = [], bufKey = new Map();
  const bufFor = (tile, kind) => { const k = tile + '|' + kind; let i = bufKey.get(k); if (i === undefined) { i = bufs.length; bufs.push(new Buf(tile, kind)); bufKey.set(k, i); } return i; };
  const tileOf = (def, face) => { const t = def.tiles; if (typeof t === 'string') return t; return t[face] ?? t.side ?? t.all ?? t.top; };
  PASS[0] = 1; seen[0] = 1;
  function learn(id) {
    seen[id] = 1;
    const def = blocks[id];
    if (!def) { KIND[id] = 0; PASS[id] = 1; return; }
    const kind = def.kind ?? 'solid';
    KIND[id] = KINDS[kind] || 1;
    OCC[id] = kind === 'solid' || def.occludes === true ? 1 : 0;
    PASS[id] = kind === 'solid' || (kind === 'none' && def.occludes) ? 0 : kind === 'cutout' ? 2 : 1;
    SHADE[id] = def.shade ?? 1; HGT[id] = def.height ?? (kind === 'slab' ? 0.5 : 1);
    if (def.light) { LCOL[id] = colour(def.light); LLEV[id] = def.lightLevel || (def.flicker ? LAMP - 1 : LAMP); }
    if (kind === 'none') return;
    for (let f = 0; f < 6; f++) {
      const tile = kind === 'cross' ? tileOf(def, 'side') : tileOf(def, FACES[f].name);
      BK[id * 6 + f] = bufFor(tile, kind === 'slab' ? 'solid' : kind);
      OWN[id * 6 + f] = tile.startsWith('x:') || picTiles.has(tile) ? 0 : 1;          // world-space UVs and colour drift for this world's own tiles
      SCALE[id * 6 + f] = uvScale[tile] ?? 0.5;
    }
  }
  for (let id = 1; id < 256; id++) if (blocks[id]) learn(id);

  // ---------------------------------------------------------------- the box: ids of the chunk and 18 blocks round it
  let X0 = 0, Z0 = 0;                                         // world position of the box's corner
  function fill(cx, cz) {
    X0 = cx * C - M; Z0 = cz * C - M;
    ids.fill(0);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ncx = cx + dx, ncz = cz + dz;
      if (ncx < 0 || ncz < 0 || ncx * C >= world.sx || ncz * C >= world.sz) continue;
      const d = world.chunk(ncx, ncz), wx0 = ncx * C, wz0 = ncz * C;
      const x0 = Math.max(wx0, X0), x1 = Math.min(wx0 + C, X0 + BW), z0 = Math.max(wz0, Z0), z1 = Math.min(wz0 + C, Z0 + BW);
      if (x0 >= x1 || z0 >= z1) continue;
      const n = x1 - x0;
      for (let y = 0; y < SY; y++) {
        const sy = y << (SH * 2), by = L * (y + 1);
        for (let z = z0; z < z1; z++) {
          const s = sy + ((z - wz0) << SH) + (x0 - wx0);
          ids.set(d.subarray(s, s + n), by + (z - Z0) * BW + (x0 - X0));
        }
      }
    }
  }
  // ---------------------------------------------------------------- light: flooded through the air of the box
  let qh = 0, qt = 0;
  const push = (i) => { Q[qt] = i; qt = (qt + 1) & QM; };
  function flood(arr, tag) {
    while (qh !== qt) {
      const i = Q[qh]; qh = (qh + 1) & QM;
      const v = arr[i];
      if (v <= 1) continue;
      const y1 = (i / L) | 0, r = i - y1 * L, bz = (r / BW) | 0, bx = r - bz * BW;
      const c = tag ? tag[i] : 0;
      for (let k = 0; k < 6; k++) {
        let j;
        if (k === 0) { if (bx === BW - 1) continue; j = i + 1; } else if (k === 1) { if (bx === 0) continue; j = i - 1; }
        else if (k === 2) { if (bz === BW - 1) continue; j = i + BW; } else if (k === 3) { if (bz === 0) continue; j = i - BW; }
        else if (k === 4) { if (y1 === SY) continue; j = i + L; } else { if (y1 === 1) continue; j = i - L; }
        const p = PASS[ids[j]];
        if (!p) continue;
        const nl = v - (p === 2 ? 2 : 1);
        if (arr[j] < nl) { arr[j] = nl; if (tag) tag[j] = c; push(j); }
      }
    }
  }
  let anyLamp = false;
  function light() {
    sky.fill(0); blk.fill(0);
    for (let bz = 0; bz < BW; bz++) for (let bx = 0; bx < BW; bx++) {
      const c = bx + bz * BW;
      let v = 15, y = SY - 1;
      for (; y >= 0; y--) {
        const i = c + L * (y + 1), id = ids[i];
        if (!seen[id]) learn(id);
        const p = PASS[id];
        if (!p) break;
        if (p === 2) { v -= 2; if (v <= 0) break; }
        sky[i] = v;
      }
      top[c] = y + 1;
    }
    qh = qt = 0;
    // only where a column's sky ends higher than a neighbour's can light spill sideways into the dark
    for (let bz = 0; bz < BW; bz++) for (let bx = 0; bx < BW; bx++) {
      const c = bx + bz * BW, t = top[c];
      let m = t;
      if (bx > 0 && top[c - 1] > m) m = top[c - 1];
      if (bx < BW - 1 && top[c + 1] > m) m = top[c + 1];
      if (bz > 0 && top[c - BW] > m) m = top[c - BW];
      if (bz < BW - 1 && top[c + BW] > m) m = top[c + BW];
      for (let y = t; y < m && y < SY; y++) { const i = c + L * (y + 1); if (sky[i] > 1) push(i); }
    }
    flood(sky, null);
    // the camp's fire and torches (the warm baked light of the valley)
    for (const l of homeLights) {
      const bx = l.x - X0, bz = l.z - Z0;
      if (bx < 0 || bz < 0 || bx >= BW || bz >= BW || l.y < 0 || l.y >= SY) continue;
      const i = bx + bz * BW + L * (l.y + 1);
      if (!PASS[ids[i]]) continue;
      if (blk[i] < l.level) { blk[i] = l.level; push(i); }
    }
    flood(blk, null);
    // lamps, fires, torches, crystal and gears: coloured light from the blocks themselves
    anyLamp = false;
    for (let i = L; i < NB - L; i++) {
      const id = ids[i];
      if (!LLEV[id]) continue;
      if (!anyLamp) { anyLamp = true; lv.fill(0); lc.fill(0); }
      if (lv[i] < LLEV[id]) { lv[i] = LLEV[id]; lc[i] = LCOL[id]; push(i); }
    }
    if (anyLamp) flood(lv, lc);
  }

  // ---------------------------------------------------------------- the mesher (the centre chunk of the box)
  const STEP = [1, L, BW];
  const FOFF = FACES.map((f) => f.dir[0] + f.dir[1] * L + f.dir[2] * BW);
  const AOS = FACES.map((f) => {
    const ax = f.dir[0] !== 0 ? 0 : f.dir[1] !== 0 ? 1 : 2, t1 = (ax + 1) % 3, t2 = (ax + 2) % 3;
    return f.corners.map((c) => { const o1 = (c[t1] === 1 ? 1 : -1) * STEP[t1], o2 = (c[t2] === 1 ? 1 : -1) * STEP[t2]; return [o1, o2, o1 + o2]; });
  });
  const tint = makeNoise(4242);
  const LS = [0, 0, 0, 0, 0, 0];                               // light of one vertex: sky, fire, lamp level, r, g, b
  /** Light of one cell (box coordinates); false when it is solid. */
  function cell(bx, y, bz) {
    if (y >= SY) { LS[0] += 15; return true; }
    if (y < 0 || bx < 0 || bz < 0 || bx >= BW || bz >= BW) return false;
    const i = bx + bz * BW + L * (y + 1);
    if (!PASS[ids[i]]) return false;
    LS[0] += sky[i]; LS[1] += blk[i];
    if (anyLamp) { const v = lv[i]; if (v) { const c = pal[lc[i]]; LS[2] += v; LS[3] += c[0] * v; LS[4] += c[1] * v; LS[5] += c[2] * v; } }
    return true;
  }
  function vlight(b, v, px, py, pz, nx, ny, nz, own, cross) {
    LS[0] = LS[1] = LS[2] = LS[3] = LS[4] = LS[5] = 0;
    let n = 0;
    if (cross) n = cell(Math.floor(px), Math.floor(py + 0.01), Math.floor(pz)) ? 1 : 0;
    else {
      const rx = Math.round(px), ry = Math.round(py), rz = Math.round(pz);
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
        let x, y, z;
        if (nx !== 0) { x = nx > 0 ? rx : rx - 1; y = ry - a; z = rz - c; }
        else if (ny !== 0) { y = ny < 0 ? ry - 1 : own || py === ry ? ry : Math.floor(py); x = rx - a; z = rz - c; }
        else { z = nz > 0 ? rz : rz - 1; x = rx - a; y = ry - c; }
        if (cell(x, y, z)) n++;
      }
    }
    const L2 = v * 2, L4 = v * 4;
    b.lit[L2] = n ? LS[0] / n / 15 : 0;
    b.lit[L2 + 1] = n ? Math.min(1, LS[1] / n / 15) : 0;
    if (LS[2]) { const q = 255 / LS[2]; b.tin[L4] = LS[3] * q; b.tin[L4 + 1] = LS[4] * q; b.tin[L4 + 2] = LS[5] * q; b.tin[L4 + 3] = Math.min(255, LS[2] / n * (255 / LAMP)); }
    else { b.tin[L4] = b.tin[L4 + 1] = b.tin[L4 + 2] = b.tin[L4 + 3] = 0; }
  }
  /** World-space UVs, as world.js gives the valley (kept small: the chunk's offset is folded into the tile's repeat). */
  function wuv(b, v, lx, ly, lz, nx, ny, s) {
    const u2 = v * 2, ox = ((X0 + M) * s) % 1, oz = ((Z0 + M) * s) % 1;
    if (ny !== 0) { b.uv[u2] = lx * s + ox; b.uv[u2 + 1] = lz * s + oz; }
    else if (nx !== 0) { b.uv[u2] = lz * s + oz; b.uv[u2 + 1] = ly * s; }
    else { b.uv[u2] = lx * s + ox; b.uv[u2 + 1] = ly * s; }
  }
  function drift(b, v, wx, wy, wz, base) {
    const t1 = tint.n3(wx / 13, wy / 9, wz / 13), t2 = tint.n3(wx / 31 + 5, wy / 23, wz / 31 - 3);
    const k = 1 + t1 * 0.13 + t2 * 0.1, w = t2 * 0.05, p = v * 3;
    b.col[p] = Math.min(255, base * k * (1 + w)); b.col[p + 1] = Math.min(255, base * k); b.col[p + 2] = Math.min(255, base * k * (1 - w));
  }

  /** Is the air cell at box index n dark: no sky, no fire, no lamp (a cave the light never reaches)? */
  const darkAt = (n) => sky[n] < 10 && !blk[n];               // more than a few blocks into a cave: seen only from inside it
  /** full: every face; otherwise faces that only dark cave air can see are left out (from afar nobody can see them). */
  function meshChunk(full) {
    let yTop = 0;
    for (let y = SY - 1; y > 0 && !yTop; y--) for (let bz = M; bz < M + C && !yTop; bz++) { const r = bz * BW + L * (y + 1); for (let bx = M; bx < M + C; bx++) if (ids[r + bx]) { yTop = y; break; } }
    for (const b of bufs) { b.nv = 0; b.ni = 0; }
    const used = new Set();
    const WX = X0 + M, WZ = Z0 + M;
    for (let y = 0; y <= yTop; y++) for (let z = 0; z < C; z++) {
      let i = (z + M) * BW + M + L * (y + 1);
      for (let x = 0; x < C; x++, i++) {
        const id = ids[i];
        if (!id) continue;
        if (!seen[id]) learn(id);
        const kind = KIND[id];
        if (kind === 0 || kind === 7) continue;
        const shade = SHADE[id];
        if (kind === 6) {                                       // cross: two diagonal quads, both windings
          const bi = BK[id * 6], b = bufs[bi]; used.add(bi);
          b.room(8);
          const h = HGT[id], s = Math.round(aoCurve[3] * shade * 255), s8 = Math.round(aoCurve[3] * shade * 0.8 * 255), own = OWN[id * 6];
          for (const q of CROSS) {
            const v = b.nv, p = v * 3;
            b.pos.set([x + q[0], y, z + q[1], x + q[2], y, z + q[3], x + q[0], y + h, z + q[1], x + q[2], y + h, z + q[3]], p);
            b.nrm.set([0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127, 0], p);
            b.uv.set([0, 0, 1, 0, 0, 1, 1, 1], v * 2);
            for (let c = 0; c < 4; c++) {
              const cy = c < 2 ? y : y + h, px = x + (c % 2 ? q[2] : q[0]), pz = z + (c % 2 ? q[3] : q[1]);
              vlight(b, v + c, px + M, cy, pz + M, 0, 1, 0, 1, true);
              const base = c < 2 ? s8 : s;
              if (own) drift(b, v + c, px + WX, cy, pz + WZ, base); else b.col[(v + c) * 3] = b.col[(v + c) * 3 + 1] = b.col[(v + c) * 3 + 2] = base;
            }
            b.idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3, v, v + 2, v + 1, v + 2, v + 3, v + 1], b.ni);
            b.nv += 4; b.ni += 12;
          }
          continue;
        }
        if (kind === 5) {                                       // slab: a box `height` tall on the cell's floor
          const h = HGT[id];
          for (let f = 0; f < 6; f++) {
            const d = FACES[f].dir;
            if (d[1] <= 0) {
              if (f === 2 && y === 0) continue;
              const nid = ids[i + FOFF[f]];
              if (nid) { if (!seen[nid]) learn(nid); if (KIND[nid] === 1 || (nid === id && d[1] === 0)) continue; }
            }
            const bi = BK[id * 6 + f], b = bufs[bi]; used.add(bi);
            b.room(4);
            const s = Math.round(aoCurve[3] * shade * (d[1] === 0 ? 0.9 : 1) * 255), v = b.nv, own = OWN[id * 6 + f];
            for (let c = 0; c < 4; c++) {
              const k = FACES[f].corners[c], p = (v + c) * 3, u = (v + c) * 2;
              const px = x + k[0], py = y + k[1] * h, pz = z + k[2];
              b.pos[p] = px; b.pos[p + 1] = py; b.pos[p + 2] = pz;
              b.nrm[p] = d[0] * 127; b.nrm[p + 1] = d[1] * 127; b.nrm[p + 2] = d[2] * 127;
              b.uv[u] = k[3]; b.uv[u + 1] = d[1] === 0 ? k[4] * h : k[4];
              vlight(b, v + c, px + M, py, pz + M, d[0], d[1], d[2], own, false);
              if (own) { wuv(b, v + c, px, py, pz, d[0], d[1], SCALE[id * 6 + f]); drift(b, v + c, px + WX, py, pz + WZ, s); }
              else { b.col[p] = s; b.col[p + 1] = s; b.col[p + 2] = s; }
            }
            b.idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], b.ni);
            b.nv += 4; b.ni += 6;
          }
          continue;
        }
        const wantAO = kind === 1 || kind === 2;
        for (let f = 0; f < 6; f++) {
          if (f === 2 && y === 0) continue;
          const n = i + FOFF[f], nid = ids[n];
          if (nid) {
            if (!seen[nid]) learn(nid);
            const nk = KIND[nid];
            if (nk === 1) continue;
            if (nid === id) continue;
            if (kind === 4 && nk === 4) continue;
          }
          if (!full && darkAt(n)) continue;
          const bi = BK[id * 6 + f], b = bufs[bi]; used.add(bi);
          b.room(4);
          const d = FACES[f].dir, v = b.nv, own = OWN[id * 6 + f], liquid = kind === 4;
          let lowerTop = false;
          if (liquid) { const up = ids[i + L]; if (up && !seen[up]) learn(up); lowerTop = KIND[up] !== 4; }
          let a0 = 3, a1 = 3, a2 = 3, a3 = 3;
          for (let c = 0; c < 4; c++) {
            const k = FACES[f].corners[c], p = (v + c) * 3, u = (v + c) * 2;
            const px = x + k[0], py = y + k[1] - (lowerTop && k[1] === 1 ? liquidDrop : 0), pz = z + k[2];
            b.pos[p] = px; b.pos[p + 1] = py; b.pos[p + 2] = pz;
            b.nrm[p] = d[0] * 127; b.nrm[p + 1] = d[1] * 127; b.nrm[p + 2] = d[2] * 127;
            b.uv[u] = k[3]; b.uv[u + 1] = k[4];
            let ao = 3;
            if (wantAO) {
              const o = AOS[f][c], s1 = OCC[ids[n + o[0]]], s2 = OCC[ids[n + o[1]]], cr = OCC[ids[n + o[2]]];
              ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
              if (c === 0) a0 = ao; else if (c === 1) a1 = ao; else if (c === 2) a2 = ao; else a3 = ao;
            }
            const s = Math.round(aoCurve[ao] * shade * 255);
            vlight(b, v + c, px + M, py, pz + M, d[0], d[1], d[2], own, false);
            if (own) { wuv(b, v + c, px, py, pz, d[0], d[1], SCALE[id * 6 + f]); if (!liquid) drift(b, v + c, px + WX, py, pz + WZ, s); else { b.col[p] = s; b.col[p + 1] = s; b.col[p + 2] = s; } }
            else { b.col[p] = s; b.col[p + 1] = s; b.col[p + 2] = s; }
          }
          const I = b.idx, j = b.ni;
          if (a0 + a3 > a1 + a2) { I[j] = v; I[j + 1] = v + 1; I[j + 2] = v + 3; I[j + 3] = v; I[j + 4] = v + 3; I[j + 5] = v + 2; }
          else { I[j] = v; I[j + 1] = v + 1; I[j + 2] = v + 2; I[j + 3] = v + 2; I[j + 4] = v + 1; I[j + 5] = v + 3; }
          b.nv += 4; b.ni += 6;
        }
      }
    }
    const out = [];
    for (const bi of used) {
      const b = bufs[bi];
      if (!b.nv) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(b.pos.slice(0, b.nv * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(b.nrm.slice(0, b.nv * 3), 3, true));
      geo.setAttribute('uv', new THREE.BufferAttribute(b.uv.slice(0, b.nv * 2), 2));
      geo.setAttribute('color', new THREE.BufferAttribute(b.col.slice(0, b.nv * 3), 3, true));
      geo.setAttribute('aLit', new THREE.BufferAttribute(b.lit.slice(0, b.nv * 2), 2));
      geo.setAttribute('aTint', new THREE.BufferAttribute(b.tin.slice(0, b.nv * 4), 4, true));
      geo.setIndex(new THREE.BufferAttribute(b.nv <= 65535 ? Uint16Array.from(b.idx.subarray(0, b.ni)) : b.idx.slice(0, b.ni), 1));
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(C, yTop + 2, C));
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
      out.push({ tile: b.tile, kind: b.kind, geometry: geo, quads: b.ni / 6 });
    }
    return out;
  }

  // ---------------------------------------------------------------- the chunks round the player
  const group = new THREE.Group();
  group.name = 'world';
  const loaded = new Map();
  const urgent = new Set(), later = new Set();
  let radius = opts.radius || 80, budget = opts.budget || 6;
  const keepExtra = opts.keep ?? 48;
  let center = { x: NaN, z: NaN }, queue = [], frame = 0, changed = true, editedLive = 0, px0 = 0, pz0 = 0;
  const stats = { quads: 0, triangles: 0, drawCalls: 0, chunks: 0, built: 0, buildMs: 0, maxBuildMs: 0, lightMs: 0, props: 0 };
  const mats = new Map();
  const matFor = (tile, kind) => {
    const k = tile + '|' + kind;
    let m = mats.get(k);
    if (m) return m;
    m = materialFor(tile, kind);
    m.vertexColors = true;
    if (kind === 'cross') m.side = THREE.FrontSide;
    mats.set(k, m);
    return m;
  };
  const disposeAll = (e) => { for (const o of e.g.children) if (o.geometry) o.geometry.dispose(); e.g.clear(); };
  function build(cx, cz) {
    const t0 = performance.now();
    const key = world.key(cx, cz);
    let e = loaded.get(key);
    if (e) { stats.quads -= e.quads; stats.drawCalls -= e.g.children.length; stats.props -= e.props; disposeAll(e); }
    else { e = { cx, cz, g: new THREE.Group(), quads: 0, props: 0, live: false, full: false }; e.g.position.set(cx * C, 0, cz * C); e.g.name = 'chunk:' + cx + ',' + cz; loaded.set(key, e); group.add(e.g); }
    e.full = dist(cx, cz, px0, pz0) < NEAR;
    fill(cx, cz);
    const tl = performance.now();
    light();
    stats.lightMs += performance.now() - tl;
    e.quads = 0;
    for (const b of meshChunk(e.full)) {
      const mesh = new THREE.Mesh(b.geometry, matFor(b.tile, b.kind));
      mesh.name = b.tile + ':' + b.kind;
      mesh.userData.kind = b.kind; mesh.userData.tile = b.tile;
      mesh.castShadow = b.kind === 'solid' || b.kind === 'cutout';
      mesh.receiveShadow = true;
      if (b.kind === 'translucent') mesh.renderOrder = 1;
      if (b.kind === 'liquid') mesh.renderOrder = 2;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      if (onMesh) onMesh(mesh);
      e.g.add(mesh);
      e.quads += b.quads;
    }
    e.props = 0;
    if (decorate) for (const o of decorate(cx, cz) || []) { o.matrixAutoUpdate = false; o.updateMatrix(); e.g.add(o); e.props += o.userData.tris || 0; }
    e.g.updateMatrixWorld(true);
    stats.quads += e.quads; stats.drawCalls += e.g.children.length; stats.props += e.props;
    stats.triangles = stats.quads * 2; stats.chunks = loaded.size;
    const ms = performance.now() - t0;
    stats.built++; stats.buildMs += ms; stats.maxBuildMs = Math.max(stats.maxBuildMs, ms);
    changed = true;
    return e;
  }
  function unload(key) {
    const e = loaded.get(key);
    if (!e) return;
    stats.quads -= e.quads; stats.drawCalls -= e.g.children.length; stats.props -= e.props;
    disposeAll(e);
    group.remove(e.g); loaded.delete(key);
    if (e.live) editedLive--;
    urgent.delete(key); later.delete(key);
    stats.triangles = stats.quads * 2; stats.chunks = loaded.size;
    changed = true;
  }
  const NEAR = opts.near ?? 26;                               // chunks nearer than this are meshed with their caves
  const dist = (cx, cz, px, pz) => { const x0 = cx * C, z0 = cz * C, dx = px < x0 ? x0 - px : px > x0 + C ? px - x0 - C : 0, dz = pz < z0 ? z0 - pz : pz > z0 + C ? pz - z0 - C : 0; return Math.hypot(dx, dz); };
  function plan(px, pz) {
    center = { x: px, z: pz };
    const r = Math.ceil(radius / C) + 1, ccx = Math.floor(px / C), ccz = Math.floor(pz / C);
    queue = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (cx < 1 || cz < 1 || (cx + 1) * C >= world.sx || (cz + 1) * C >= world.sz) continue;
      const d = dist(cx, cz, px, pz);
      if (d <= radius && !loaded.has(world.key(cx, cz))) queue.push([d, cx, cz]);
    }
    queue.sort((a, b) => a[0] - b[0]);
    for (const [key, e] of [...loaded]) if (dist(e.cx, e.cz, px, pz) > radius + C * 0.75) unload(key);
  }
  function work(ms) {
    const t0 = performance.now();
    let n = 0;
    while (queue.length) {
      const [, cx, cz] = queue[0];
      if (loaded.has(world.key(cx, cz))) { queue.shift(); continue; }
      let missing = null;
      for (let dz = -1; dz <= 1 && !missing; dz++) for (let dx = -1; dx <= 1; dx++) if (!world.has(cx + dx, cz + dz)) { missing = [cx + dx, cz + dz]; break; }
      if (missing) world.chunk(missing[0], missing[1]);
      else { queue.shift(); build(cx, cz); n++; }
      if (performance.now() - t0 > ms) break;
    }
    return n;
  }
  /** Mark the chunks an edit at (x, z) can change: at once those it touches, later those its light can reach. */
  function touch(x, z, reach) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const k = world.key(Math.floor((x + dx) / C), Math.floor((z + dz) / C)); if (loaded.has(k)) urgent.add(k); }
    const c0 = Math.floor((x - reach) / C), c1 = Math.floor((x + reach) / C), d0 = Math.floor((z - reach) / C), d1 = Math.floor((z + reach) / C);
    for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) { const k = world.key(cx, cz); if (loaded.has(k) && !urgent.has(k) && dist(cx, cz, x + 0.5, z + 0.5) <= reach) later.add(k); }
  }
  function rebuild(k) { const e = loaded.get(k); if (!e) return; const was = e.live; build(e.cx, e.cz).live = true; if (!was) editedLive++; }

  return {
    group, stats, world,
    get radius() { return radius; },
    set radius(r) { radius = r; center = { x: NaN, z: NaN }; },
    set budget(ms) { budget = ms; },
    update(px, pz) {
      frame++; px0 = px; pz0 = pz;
      if (!(Math.abs(px - center.x) < 8 && Math.abs(pz - center.z) < 8)) plan(px, pz);
      if (queue.length) work(budget);
      // a chunk the player has come near is meshed again with its caves (one a frame)
      else if (frame % 3 === 0) for (const [k, e] of loaded) if (!e.full && dist(e.cx, e.cz, px, pz) < NEAR - 4) { const was = e.live; build(e.cx, e.cz).live = was; void k; break; }
      if (frame % 120 === 0) {
        const far = radius + C + keepExtra;
        const n = world.drop((cx, cz) => dist(cx, cz, px, pz) <= far);
        if (n && opts.onDrop) opts.onDrop();
      }
      return queue.length;
    },
    prime(px, pz) { px0 = px; pz0 = pz; plan(px, pz); work(1e9); return stats; },
    get pending() { return queue.length; },
    isLoaded: (cx, cz) => loaded.has(world.key(cx, cz)),
    takeChanged() { const c = changed; changed = false; return c; },
    setBlock(x, y, z, id) {
      if (!world.inb(x, y, z) || world.get(x, y, z) === id) return false;
      const old = world.get(x, y, z);
      world.set(x, y, z, id);
      if (!seen[id]) learn(id);
      if (!seen[old]) learn(old);
      touch(x, z, LLEV[id] || LLEV[old] ? Math.max(15, LLEV[id], LLEV[old]) : homeLights.some((l) => Math.abs(l.x - x) < 20 && Math.abs(l.z - z) < 20) ? 18 : 15);
      return true;
    },
    /** Mesh column (x, z)'s chunk again though no block changed (a picture that depends on something else). */
    markDirty(x, z) { const k = world.key(Math.floor(x / C), Math.floor(z / C)); if (loaded.has(k)) urgent.add(k); },
    flush() {
      let n = 0;
      if (urgent.size) { for (const k of urgent) { rebuild(k); later.delete(k); n++; } urgent.clear(); }
      if (later.size) {
        // the far reach of an edit's light: the nearest one chunk per frame
        let best = null, bd = Infinity;
        for (const k of later) { const e = loaded.get(k); if (!e) { later.delete(k); continue; } const d = dist(e.cx, e.cz, px0, pz0); if (d < bd) { bd = d; best = k; } }
        if (best !== null) { later.delete(best); rebuild(best); n++; }
      }
      return n;
    },
    liveChunks: () => editedLive,
    loadedChunks: () => [...loaded.values()].map((e) => [e.cx, e.cz]),
  };
}
