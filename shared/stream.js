// An endless voxel world, made and drawn piece by piece around the player.
//
//   const world = new PagedWorld({ sx: 16384, sy: 96, sz: 16384, chunk: 32, generate: (cx, cz, data) => {...} });
//   world.get(x, y, z) / world.set(x, y, z, id) / world.inb(x, y, z)       same as VoxelWorld (voxel.js)
//   const terrain = createStreamTerrain(world, BLOCKS, { materialFor, aoCurve, onMesh, radius: 80 });
//   scene.add(terrain.group);
//   terrain.update(px, pz)          every frame: builds a few of the nearest missing chunks, drops far ones
//   terrain.setBlock(x, y, z, id)    edit; terrain.flush() once per frame (the same as createVoxelTerrain)
//
// The world: a chunk (chunk x chunk columns, all heights) is made by `generate` the first time any cell of it is
// read, and kept in a Map. Chunks that were edited are kept for good; the others may be dropped when far away
// (world.drop) and are made again, identical, if they are needed again.
//
// The terrain: each chunk near the player has its own meshes (one per tile and kind, as voxel.js draws them, with
// the same faces, ambient occlusion and materials), positioned at the chunk's corner so the vertices stay small
// numbers far from the origin. Chunks are built nearest first, a few per frame within a time budget.

import * as THREE from 'three';

export class PagedWorld {
  constructor({ sx, sy, sz, chunk = 32, generate, onChunk }) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.C = chunk; this.shift = Math.log2(chunk);
    if (!Number.isInteger(this.shift)) throw new Error('PagedWorld: chunk must be a power of two');
    this.mask = chunk - 1; this.yshift = this.shift * 2;
    this.ncz = Math.ceil(sz / chunk);
    this.chunks = new Map();                  // key -> Uint8Array(chunk * chunk * sy): x + (z << shift) + (y << 2 shift)
    this.edited = new Set();                  // keys of chunks changed by the game (never dropped)
    this.generate = generate; this.onChunk = onChunk || null;
    this.made = 0; this.genMs = 0;
    this._k = -1; this._d = null;
  }
  key(cx, cz) { return cx * this.ncz + cz; }
  /** The cells of chunk (cx, cz), made now if needed. */
  chunk(cx, cz) {
    const k = cx * this.ncz + cz;
    if (k === this._k) return this._d;
    let d = this.chunks.get(k);
    if (!d) {
      const t0 = performance.now();
      d = new Uint8Array(this.C * this.C * this.sy);
      const extra = this.generate(cx, cz, d);
      this.chunks.set(k, d);
      this.made++; this.genMs += performance.now() - t0;
      if (this.onChunk) this.onChunk(cx, cz, extra);
    }
    this._k = k; this._d = d;
    return d;
  }
  has(cx, cz) { return this.chunks.has(cx * this.ncz + cz); }
  inb(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) {
    if (y < 0 || y >= this.sy || x < 0 || z < 0 || x >= this.sx || z >= this.sz) return 0;
    x |= 0; y |= 0; z |= 0;
    return this.chunk(x >> this.shift, z >> this.shift)[(x & this.mask) + ((z & this.mask) << this.shift) + (y << this.yshift)];
  }
  set(x, y, z, id) {
    if (y < 0 || y >= this.sy || x < 0 || z < 0 || x >= this.sx || z >= this.sz) return;
    x |= 0; y |= 0; z |= 0;
    const cx = x >> this.shift, cz = z >> this.shift;
    this.chunk(cx, cz)[(x & this.mask) + ((z & this.mask) << this.shift) + (y << this.yshift)] = id;
    this.edited.add(cx * this.ncz + cz);
  }
  fill(x0, y0, z0, x1, y1, z1, id) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, id);
  }
  topY(x, z, skip) {
    for (let y = this.sy - 1; y >= 0; y--) { const id = this.get(x, y, z); if (id && !(skip && skip(id))) return y; }
    return -1;
  }
  /** Forget the unedited chunks for which keep(cx, cz) is false. Returns how many went. */
  drop(keep) {
    let n = 0;
    for (const k of this.chunks.keys()) {
      if (this.edited.has(k)) continue;
      const cx = Math.floor(k / this.ncz), cz = k - cx * this.ncz;
      if (keep(cx, cz)) continue;
      this.chunks.delete(k); n++;
    }
    if (n) { this._k = -1; this._d = null; }
    return n;
  }
  /** Bytes of cell data held now. */
  bytes() { return this.chunks.size * this.C * this.C * this.sy; }
}

// ------------------------------------------------------------------ the chunk mesher
// The same faces as voxel.js: corner order per face is a "Z", triangles (0,1,2) and (2,1,3).
const FACES = [
  { name: 'side', dir: [-1, 0, 0], corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { name: 'side', dir: [1, 0, 0], corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { name: 'bottom', dir: [0, -1, 0], corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { name: 'top', dir: [0, 1, 0], corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { name: 'side', dir: [0, 0, -1], corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { name: 'side', dir: [0, 0, 1], corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
];
const KINDS = { solid: 1, cutout: 2, translucent: 3, liquid: 4, slab: 5, cross: 6, none: 7 };

/** Growable vertex arrays for one (tile, kind) while a chunk is meshed. */
class Buf {
  constructor(tile, kind) { this.tile = tile; this.kind = kind; this.cap = 0; this.nv = 0; this.ni = 0; this.grow(1024); }
  grow(n) {
    const cap = Math.max(n, this.cap * 2), keep = (A, k, old) => { const a = new A(cap * k); if (old) a.set(old.subarray(0, this.nv * k)); return a; };
    this.pos = keep(Float32Array, 3, this.pos); this.nrm = keep(Int8Array, 3, this.nrm); this.uv = keep(Float32Array, 2, this.uv); this.col = keep(Uint8Array, 3, this.col); this.lay = keep(Uint8Array, 1, this.lay);
    const idx = new Uint32Array(cap * 3 + 12); if (this.idx) idx.set(this.idx.subarray(0, this.ni)); this.idx = idx;
    this.cap = cap;
  }
  room(nv) { if (this.nv + nv > this.cap) this.grow(this.nv + nv); }
}

/**
 * meshChunk(cx, cz) -> [{ tile, kind, geometry }]. Reads the chunk and its eight neighbours (making them if needed).
 */
export function makeChunkMesher(world, blocks, opts = {}) {
  const { aoCurve = [0.5, 0.68, 0.85, 1.0], liquidDrop = 0.12 } = opts;
  const C = world.C, SH = world.shift, SY = world.sy, W = C + 2, L = W * W;
  const P = new Uint8Array(L * (SY + 3));                     // padded copy: y from -1 to SY + 1
  const KIND = new Uint8Array(256), OCC = new Uint8Array(256), SHADE = new Float32Array(256).fill(1), HGT = new Float32Array(256).fill(1);
  const BK = new Int32Array(256 * 6).fill(-1), seen = new Uint8Array(256);
  const bufs = [], bufKey = new Map();
  // tiles the world keeps in one texture array (opts.layerOf(tile) >= 0) share one mesh per kind: far fewer draw calls
  const LAY = new Uint8Array(256 * 6), arrayKinds = { solid: 1, cutout: 1, cross: 1 };
  const bufFor = (tile, kind) => { if (opts.layerOf && arrayKinds[kind] && opts.layerOf(tile) >= 0) tile = 'tiles'; const k = tile + '|' + kind; let i = bufKey.get(k); if (i === undefined) { i = bufs.length; bufs.push(new Buf(tile, kind)); bufKey.set(k, i); } return i; };
  const tileOf = (def, face) => { const t = def.tiles; if (typeof t === 'string') return t; return t[face] ?? t.side ?? t.all ?? t.top; };
  function learn(id) {
    seen[id] = 1;
    const def = blocks[id];
    if (!id || !def) { KIND[id] = 0; return; }
    const kind = def.kind ?? 'solid';
    KIND[id] = KINDS[kind] || 1;
    OCC[id] = kind === 'solid' || def.occludes === true ? 1 : 0;
    SHADE[id] = def.shade ?? 1; HGT[id] = def.height ?? (kind === 'slab' ? 0.5 : 1);
    if (kind === 'none') return;
    for (let f = 0; f < 6; f++) {
      const tile = kind === 'cross' ? tileOf(def, 'side') : tileOf(def, FACES[f].name);
      BK[id * 6 + f] = bufFor(tile, kind === 'slab' ? 'solid' : kind);
      LAY[id * 6 + f] = opts.layerOf ? Math.max(0, opts.layerOf(tile)) : 0;
    }
  }
  // per face: neighbour step, and per corner the three AO sample steps from the neighbour
  const STEP = [1, L, W];                                       // x, y, z in the padded array
  const FOFF = FACES.map((f) => f.dir[0] * 1 + f.dir[1] * L + f.dir[2] * W);
  const AOS = FACES.map((f) => {
    const ax = f.dir[0] !== 0 ? 0 : f.dir[1] !== 0 ? 1 : 2, t1 = (ax + 1) % 3, t2 = (ax + 2) % 3;
    return f.corners.map((c) => { const o1 = (c[t1] === 1 ? 1 : -1) * STEP[t1], o2 = (c[t2] === 1 ? 1 : -1) * STEP[t2]; return [o1, o2, o1 + o2]; });
  });
  const CROSS = [[0.08, 0.08, 0.92, 0.92], [0.92, 0.08, 0.08, 0.92]];
  const RIM = new Int16Array(C * C), SKIRT = 2;

  function fill(cx, cz) {
    let yTop = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ncx = cx + dx, ncz = cz + dz;
      if (ncx < 0 || ncz < 0 || ncx * C >= world.sx || ncz * C >= world.sz) {      // outside the world: air
        continue;
      }
      const d = world.chunk(ncx, ncz);
      // the part of that chunk that falls in the padded box
      const x0 = dx < 0 ? C - 1 : 0, x1 = dx > 0 ? 0 : C - 1, z0 = dz < 0 ? C - 1 : 0, z1 = dz > 0 ? 0 : C - 1;
      const px = dx < 0 ? 0 : dx > 0 ? C + 1 : 1, pz = dz < 0 ? 0 : dz > 0 ? C + 1 : 1;
      for (let y = 0; y < SY; y++) {
        const sy = y << (SH * 2), py = (y + 1) * L;
        for (let z = z0; z <= z1; z++) {
          const sz = sy + (z << SH), pr = py + (pz + z - z0) * W + px - x0;
          for (let x = x0; x <= x1; x++) P[pr + x] = d[sz + x];
        }
      }
      if (dx === 0 && dz === 0) { for (let y = SY - 1; y > 0 && !yTop; y--) { const s = y << (SH * 2); for (let i = 0; i < C * C; i++) if (d[s + i]) { yTop = y; break; } } }
    }
    return yTop;
  }
  /** Zero the padded box (only the neighbours that are outside the world need it, but it is cheap). */
  const clear = () => P.fill(0);

  return function meshChunk(cx, cz) {
    if (cx <= 0 || cz <= 0 || (cx + 1) * C >= world.sx || (cz + 1) * C >= world.sz) clear();
    const yTop = fill(cx, cz);
    // the top of each column on the chunk's rim: there, the sides of the top few blocks are drawn even against a
    // neighbour's rock (a "skirt"), so where the next chunk is not drawn the edge shows ground, not a crack
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      if (x !== 0 && z !== 0 && x !== C - 1 && z !== C - 1) continue;
      let y = yTop; const i0 = (z + 1) * W + x + 1;
      while (y > 0 && KIND[P[(y + 1) * L + i0]] !== 1) { const id = P[(y + 1) * L + i0]; if (id && !seen[id]) { learn(id); continue; } y--; }
      RIM[x + z * C] = y;
    }
    for (const b of bufs) { b.nv = 0; b.ni = 0; }
    const used = new Set();
    for (let y = 0; y <= yTop; y++) {
      for (let z = 0; z < C; z++) {
        let i = (y + 1) * L + (z + 1) * W + 1;
        for (let x = 0; x < C; x++, i++) {
          const id = P[i];
          if (!id) continue;
          if (!seen[id]) learn(id);
          const kind = KIND[id];
          if (kind === 0 || kind === 7) continue;
          const shade = SHADE[id];
          if (kind === 6) {                                    // cross: two diagonal quads, both windings, normals up
            const bi = BK[id * 6], b = bufs[bi]; used.add(bi);
            b.room(8);
            const h = HGT[id], s = Math.round(aoCurve[3] * shade * 255), s8 = Math.round(aoCurve[3] * shade * 0.8 * 255);
            for (const q of CROSS) {
              const v = b.nv, p = v * 3, u = v * 2;
              b.pos.set([x + q[0], y, z + q[1], x + q[2], y, z + q[3], x + q[0], y + h, z + q[1], x + q[2], y + h, z + q[3]], p);
              b.nrm.set([0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127, 0], p);
              b.uv.set([0, 0, 1, 0, 0, 1, 1, 1], u);
              b.col.set([s8, s8, s8, s8, s8, s8, s, s, s, s, s, s], p);
              b.idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3, v, v + 2, v + 1, v + 2, v + 3, v + 1], b.ni);
              b.lay.fill(LAY[id * 6], v, v + 4);
              b.nv += 4; b.ni += 12;
            }
            continue;
          }
          if (kind === 5) {                                    // slab: a box `height` tall on the cell's floor
            const h = HGT[id];
            for (let f = 0; f < 6; f++) {
              const d = FACES[f].dir;
              if (d[1] <= 0) {
                if (f === 2 && y === 0) continue;
                const nid = P[i + FOFF[f]];
                if (nid) { if (!seen[nid]) learn(nid); if (KIND[nid] === 1 || (nid === id && d[1] === 0)) continue; }
              }
              const bi = BK[id * 6 + f], b = bufs[bi]; used.add(bi);
              b.room(4);
              const s = Math.round(aoCurve[3] * shade * (d[1] === 0 ? 0.9 : 1) * 255), v = b.nv;
              for (let c = 0; c < 4; c++) {
                const k = FACES[f].corners[c], p = (v + c) * 3, u = (v + c) * 2;
                b.pos[p] = x + k[0]; b.pos[p + 1] = y + k[1] * h; b.pos[p + 2] = z + k[2];
                b.nrm[p] = d[0] * 127; b.nrm[p + 1] = d[1] * 127; b.nrm[p + 2] = d[2] * 127;
                b.uv[u] = k[3]; b.uv[u + 1] = d[1] === 0 ? k[4] * h : k[4];
                b.col[p] = s; b.col[p + 1] = s; b.col[p + 2] = s;
              }
              b.idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], b.ni);
              b.lay.fill(LAY[id * 6 + f], v, v + 4);
              b.nv += 4; b.ni += 6;
            }
            continue;
          }
          const wantAO = kind === 1 || kind === 2;
          for (let f = 0; f < 6; f++) {
            if (f === 2 && y === 0) continue;                  // never the underside of the world
            const n = i + FOFF[f], nid = P[n];
            let skirt = false;
            if (nid) {
              if (!seen[nid]) learn(nid);
              const nk = KIND[nid];
              if (nk === 1) {                                  // hidden behind an opaque cube, except a skirt on the rim
                if (kind !== 1 || !((f === 0 && x === 0) || (f === 1 && x === C - 1) || (f === 4 && z === 0) || (f === 5 && z === C - 1)) || y < RIM[x + z * C] - SKIRT) continue;
                skirt = true;
              } else {
                if (nid === id) continue;                      // same see-through block: merge
                if (kind === 4 && nk === 4) continue;
              }
            }
            const bi = BK[id * 6 + f], b = bufs[bi]; used.add(bi);
            b.room(4);
            const d = FACES[f].dir, v = b.nv;
            let lowerTop = false;
            if (kind === 4) { const up = P[i + L]; if (up && !seen[up]) learn(up); lowerTop = KIND[up] !== 4; }
            let a0 = 3, a1 = 3, a2 = 3, a3 = 3;
            for (let c = 0; c < 4; c++) {
              const k = FACES[f].corners[c], p = (v + c) * 3, u = (v + c) * 2;
              b.pos[p] = x + k[0]; b.pos[p + 1] = y + k[1] - (lowerTop && k[1] === 1 ? liquidDrop : 0); b.pos[p + 2] = z + k[2];
              b.nrm[p] = d[0] * 127; b.nrm[p + 1] = d[1] * 127; b.nrm[p + 2] = d[2] * 127;
              b.uv[u] = k[3]; b.uv[u + 1] = k[4];
              let ao = 3;
              if (skirt) ao = 2;
              else if (wantAO) {
                const o = AOS[f][c], s1 = OCC[P[n + o[0]]], s2 = OCC[P[n + o[1]]], cr = OCC[P[n + o[2]]];
                ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
                if (c === 0) a0 = ao; else if (c === 1) a1 = ao; else if (c === 2) a2 = ao; else a3 = ao;
              }
              const s = Math.round(aoCurve[ao] * shade * 255);
              b.col[p] = s; b.col[p + 1] = s; b.col[p + 2] = s;
            }
            const I = b.idx, j = b.ni;
            // split the quad along the diagonal that keeps the AO gradient symmetric
            if (a0 + a3 > a1 + a2) { I[j] = v; I[j + 1] = v + 1; I[j + 2] = v + 3; I[j + 3] = v; I[j + 4] = v + 3; I[j + 5] = v + 2; }
            else { I[j] = v; I[j + 1] = v + 1; I[j + 2] = v + 2; I[j + 3] = v + 2; I[j + 4] = v + 1; I[j + 5] = v + 3; }
            b.lay.fill(LAY[id * 6 + f], v, v + 4);
            b.nv += 4; b.ni += 6;
          }
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
      if (b.tile === 'tiles') geo.setAttribute('layer', new THREE.BufferAttribute(b.lay.slice(0, b.nv), 1));
      geo.setIndex(new THREE.BufferAttribute(b.nv <= 65535 ? Uint16Array.from(b.idx.subarray(0, b.ni)) : b.idx.slice(0, b.ni), 1));
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(C, yTop + 2, C));
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
      out.push({ tile: b.tile, kind: b.kind, geometry: geo, quads: b.ni / 6 });
    }
    return out;
  };
}

// ------------------------------------------------------------------ the streamed terrain
/**
 * opts: materialFor(tile, kind) (required), aoCurve, liquidDrop, onMesh(mesh, isStatic),
 *       radius (blocks; chunks whose nearest point is within it are drawn), budget (ms per frame for building),
 *       keep (blocks beyond the radius for which made chunks stay in memory), onUnload(cx, cz) when a chunk's data is dropped.
 */
export function createStreamTerrain(world, blocks, opts = {}) {
  const { materialFor, onMesh } = opts;
  if (typeof materialFor !== 'function') throw new Error('createStreamTerrain: opts.materialFor(tile, kind) is required');
  const C = world.C;
  const meshChunk = makeChunkMesher(world, blocks, opts);
  const group = new THREE.Group();
  group.name = 'voxels';
  const loaded = new Map();                   // key -> { cx, cz, g: THREE.Group, quads, live }
  const dirty = new Set();
  let radius = opts.radius || 80, budget = opts.budget || 6, keepExtra = opts.keep ?? 64;
  let center = { x: NaN, z: NaN }, queue = [], frame = 0, changed = true;
  const stats = { quads: 0, triangles: 0, drawCalls: 0, chunks: 0, built: 0, buildMs: 0, maxBuildMs: 0 };
  let editedLive = 0;

  const mats = new Map();
  const matFor = (tile, kind) => {
    const k = tile + '|' + kind;
    let m = mats.get(k);
    if (m) return m;
    m = tile === 'tiles' ? opts.arrayMaterial(kind) : materialFor(tile, kind);
    if (!m) throw new Error('materialFor returned nothing for tile "' + tile + '" (' + kind + ')');
    m.vertexColors = true;
    if (kind === 'cross') m.side = THREE.FrontSide;
    mats.set(k, m);
    return m;
  };
  function build(cx, cz) {
    const t0 = performance.now();
    const key = world.key(cx, cz);
    let e = loaded.get(key);
    if (e) { stats.quads -= e.quads; stats.drawCalls -= e.g.children.length; for (const m of e.g.children) m.geometry.dispose(); e.g.clear(); }
    else { e = { cx, cz, g: new THREE.Group(), quads: 0, live: false }; e.g.position.set(cx * C, 0, cz * C); e.g.name = 'chunk:' + cx + ',' + cz; loaded.set(key, e); group.add(e.g); }
    e.quads = 0;
    for (const b of meshChunk(cx, cz)) {
      const mesh = new THREE.Mesh(b.geometry, matFor(b.tile, b.kind));
      mesh.name = b.tile + ':' + b.kind;
      mesh.castShadow = b.kind === 'solid' || b.kind === 'cutout';
      mesh.receiveShadow = true;
      if (b.tile === 'tiles' && opts.arrayDepth) { const dm = opts.arrayDepth(b.kind); if (dm) mesh.customDepthMaterial = dm; }
      if (b.kind === 'translucent') mesh.renderOrder = 1;
      if (b.kind === 'liquid') mesh.renderOrder = 2;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      if (onMesh) onMesh(mesh, false);
      e.g.add(mesh);
      e.quads += b.quads;
    }
    e.g.updateMatrixWorld(true);
    stats.quads += e.quads; stats.drawCalls += e.g.children.length;
    stats.triangles = stats.quads * 2; stats.chunks = loaded.size;
    const ms = performance.now() - t0;
    stats.built++; stats.buildMs += ms; stats.maxBuildMs = Math.max(stats.maxBuildMs, ms);
    changed = true;
    return e;
  }
  function unload(key) {
    const e = loaded.get(key);
    if (!e) return;
    stats.quads -= e.quads; stats.drawCalls -= e.g.children.length;
    for (const m of e.g.children) m.geometry.dispose();
    group.remove(e.g); loaded.delete(key);
    if (e.live) editedLive--;
    stats.triangles = stats.quads * 2; stats.chunks = loaded.size;
    changed = true;
  }
  // distance from (px, pz) to the nearest point of chunk (cx, cz)
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
  /** Build until the queue is empty or the time is up (always at least one). Returns how many were built. */
  function work(ms) {
    const t0 = performance.now();
    let n = 0;
    while (queue.length) {
      const [, cx, cz] = queue[0];
      if (loaded.has(world.key(cx, cz))) { queue.shift(); continue; }
      // a chunk is meshed with its eight neighbours made: make a missing one first (one piece of work at a time,
      // so a frame does either a making or a meshing, not several of both)
      let missing = null;
      for (let dz = -1; dz <= 1 && !missing; dz++) for (let dx = -1; dx <= 1; dx++) if (!world.has(cx + dx, cz + dz)) { missing = [cx + dx, cz + dz]; break; }
      if (missing) world.chunk(missing[0], missing[1]);
      else { queue.shift(); build(cx, cz); n++; }
      if (performance.now() - t0 > ms) break;
    }
    return n;
  }

  const api = {
    group, stats, world,
    get radius() { return radius; },
    set radius(r) { radius = r; center = { x: NaN, z: NaN }; },
    set budget(ms) { budget = ms; },
    /** Every frame, with the player's position. */
    update(px, pz) {
      frame++;
      if (!(Math.abs(px - center.x) < 8 && Math.abs(pz - center.z) < 8)) plan(px, pz);
      if (queue.length) work(budget);
      // made chunks far away and never edited are forgotten (they are made again, the same, if needed)
      if (frame % 120 === 0) {
        const far = radius + C + keepExtra;
        const n = world.drop((cx, cz) => dist(cx, cz, px, pz) <= far);
        if (n && opts.onDrop) opts.onDrop();
      }
      return queue.length;
    },
    /** Build everything within the radius of (px, pz) now (the start, a shot, a jump far away). */
    prime(px, pz) { plan(px, pz); work(1e9); return stats; },
    /** True while chunks within the radius are still missing. */
    get pending() { return queue.length; },
    /** Is chunk (cx, cz) drawn as blocks? (The far view leaves a hole there.) */
    isLoaded: (cx, cz) => loaded.has(world.key(cx, cz)),
    loadedChunks: () => [...loaded.values()].map((e) => [e.cx, e.cz]),
    /** True once after the set of drawn chunks changed. */
    takeChanged() { const c = changed; changed = false; return c; },
    setBlock(x, y, z, id) {
      if (!world.inb(x, y, z) || world.get(x, y, z) === id) return false;
      world.set(x, y, z, id);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cx = Math.floor((x + dx) / C), cz = Math.floor((z + dz) / C), k = world.key(cx, cz);
        if (loaded.has(k)) dirty.add(k);
      }
      return true;
    },
    markDirty(x, z) { const k = world.key(Math.floor(x / C), Math.floor(z / C)); if (loaded.has(k)) dirty.add(k); },
    flush() {
      if (!dirty.size) return 0;
      const n = dirty.size;
      for (const k of dirty) { const e = loaded.get(k); if (!e) continue; const was = e.live; build(e.cx, e.cz).live = true; if (!was) editedLive++; }
      dirty.clear();
      return n;
    },
    /** Chunks drawn again because of an edit (createVoxelTerrain's count of its small live meshes). */
    liveChunks: () => editedLive,
  };
  return api;
}
