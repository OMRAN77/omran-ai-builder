// Voxel world storage + mesher (face culling, per-vertex ambient occlusion).
//
//   const world = new VoxelWorld(160, 64, 160);
//   world.set(x, y, z, blockId);                       // 0 = air
//   const { group, stats } = buildVoxelMeshes(world, BLOCKS, { materialFor });
//   scene.add(group);
//
// BLOCKS is an object/array indexed by block id:
//   { tiles: 'sand' }                                   one tile name for every face
//   { tiles: { top: 'grassTop', side: 'grassSide', bottom: 'dirt' } }
//   kind: 'solid'       (default) opaque cube, casts AO and shadows
//         'cutout'      cube with alpha-tested holes (leaves, grates)
//         'translucent' see-through cube (glass, ice, crystal)
//         'liquid'      see-through cube whose surface sits a little lower
//         'slab'        a box `height` tall (default 0.5) on the cell's floor: half blocks, beds
//         'cross'       two crossed quads (grass tufts, flowers, reeds); `height` optional.
//                       Emitted with both windings and up-facing normals, and the material is
//                       forced to FrontSide, so plants are lit evenly from every side.
//         'none'        stored in the world but not meshed (you draw it as a prop)
//   shade: number       optional brightness multiplier baked into vertex colours
//   occludes: true      make a non-solid block still darken neighbours' AO
//
// materialFor(tile, kind) -> THREE.Material. One mesh (one draw call) is produced per
// (tile, kind) pair, and each face gets full 0..1 UVs, so every tile can have its own
// texture with mipmaps and no atlas bleeding. `vertexColors` is switched on for you
// (AO lives in the vertex colours).

import * as THREE from 'three';

export class VoxelWorld {
  constructor(sx, sy, sz) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.data = new Uint8Array(sx * sy * sz);
  }
  inb(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }
  get(x, y, z) {
    return this.inb(x, y, z) ? this.data[x + this.sx * (z + this.sz * y)] : 0;
  }
  set(x, y, z, id) {
    if (this.inb(x, y, z)) this.data[x + this.sx * (z + this.sz * y)] = id;
  }
  /** Fill an inclusive box. */
  fill(x0, y0, z0, x1, y1, z1, id) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, id);
  }
  /** Highest non-air y in a column, or -1. `skip(id)` may ignore some blocks (e.g. leaves). */
  topY(x, z, skip) {
    for (let y = this.sy - 1; y >= 0; y--) {
      const id = this.get(x, y, z);
      if (id && !(skip && skip(id))) return y;
    }
    return -1;
  }
}

// Corner order per face is a "Z": triangles (0,1,2) and (2,1,3) wind counter-clockwise
// when seen from outside.
const FACES = [
  { name: 'side', dir: [-1, 0, 0], corners: [
    { pos: [0, 1, 0], uv: [0, 1] }, { pos: [0, 0, 0], uv: [0, 0] }, { pos: [0, 1, 1], uv: [1, 1] }, { pos: [0, 0, 1], uv: [1, 0] } ] },
  { name: 'side', dir: [1, 0, 0], corners: [
    { pos: [1, 1, 1], uv: [0, 1] }, { pos: [1, 0, 1], uv: [0, 0] }, { pos: [1, 1, 0], uv: [1, 1] }, { pos: [1, 0, 0], uv: [1, 0] } ] },
  { name: 'bottom', dir: [0, -1, 0], corners: [
    { pos: [1, 0, 1], uv: [1, 0] }, { pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 0], uv: [1, 1] }, { pos: [0, 0, 0], uv: [0, 1] } ] },
  { name: 'top', dir: [0, 1, 0], corners: [
    { pos: [0, 1, 1], uv: [1, 1] }, { pos: [1, 1, 1], uv: [0, 1] }, { pos: [0, 1, 0], uv: [1, 0] }, { pos: [1, 1, 0], uv: [0, 0] } ] },
  { name: 'side', dir: [0, 0, -1], corners: [
    { pos: [1, 0, 0], uv: [0, 0] }, { pos: [0, 0, 0], uv: [1, 0] }, { pos: [1, 1, 0], uv: [0, 1] }, { pos: [0, 1, 0], uv: [1, 1] } ] },
  { name: 'side', dir: [0, 0, 1], corners: [
    { pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 1], uv: [1, 0] }, { pos: [0, 1, 1], uv: [0, 1] }, { pos: [1, 1, 1], uv: [1, 1] } ] },
];

function tileOf(def, faceName) {
  const t = def.tiles;
  if (typeof t === 'string') return t;
  return t[faceName] ?? t.side ?? t.all ?? t.top;
}

function makeMesher(world, blocks, opts) {
  const { aoCurve = [0.5, 0.68, 0.85, 1.0], edgeFaces = true, liquidDrop = 0.12 } = opts;
  const kindOf = (id) => (id && blocks[id] ? (blocks[id].kind ?? 'solid') : 'air');
  const occludes = (x, y, z) => {
    const id = world.get(x, y, z);
    if (!id) return 0;
    const def = blocks[id];
    if (!def) return 0;
    return ((def.kind ?? 'solid') === 'solid' || def.occludes === true) ? 1 : 0;
  };
  const bucket = (buckets, tile, kind) => {
    const key = tile + '|' + kind;
    let b = buckets.get(key);
    if (!b) {
      b = { tile, kind, positions: [], normals: [], uvs: [], colors: [], indices: [], quads: 0 };
      buckets.set(key, b);
    }
    return b;
  };
  const { sy } = world;

  /** Append the faces of every cell with x0 <= x < x1 and z0 <= z < z1 (all heights) to `buckets`. */
  return function meshRegion(buckets, x0, x1, z0, z1) {
    for (let y = 0; y < sy; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          const id = world.get(x, y, z);
          if (!id) continue;
          const def = blocks[id];
          if (!def) continue;
          const kind = def.kind ?? 'solid';
          if (kind === 'none') continue;
          const shade = def.shade ?? 1;

          if (kind === 'cross') {
            const b = bucket(buckets, tileOf(def, 'side'), 'cross');
            const h = def.height ?? 1;
            const s = aoCurve[3] * shade;
            // two diagonal quads, normals pointing up so both light evenly
            const quads = [
              [[0.08, 0, 0.08], [0.92, 0, 0.92]],
              [[0.92, 0, 0.08], [0.08, 0, 0.92]],
            ];
            for (const [a, c] of quads) {
              const base = b.positions.length / 3;
              b.positions.push(x + a[0], y, z + a[2], x + c[0], y, z + c[2], x + a[0], y + h, z + a[2], x + c[0], y + h, z + c[2]);
              b.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
              b.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
              b.colors.push(s * 0.8, s * 0.8, s * 0.8, s * 0.8, s * 0.8, s * 0.8, s, s, s, s, s, s);
              // both windings: lit the same from either side with a FrontSide material
              b.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
              b.indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
              b.quads += 2;
            }
            continue;
          }

          if (kind === 'slab') {
            // a box of the cell's footprint and `height` tall (half blocks, beds); drawn with the opaque blocks
            const h = def.height ?? 0.5;
            for (const f of FACES) {
              const d = f.dir, nx = x + d[0], ny = y + d[1], nz = z + d[2];
              if (d[1] <= 0) {                               // sides and underside can hide behind a full cube or a twin
                if (!world.inb(nx, ny, nz)) { if (ny < 0 || !edgeFaces) continue; }
                else { const nid = world.get(nx, ny, nz); if (nid && (kindOf(nid) === 'solid' || (nid === id && d[1] === 0))) continue; }
              }
              const b = bucket(buckets, tileOf(def, f.name), 'solid');
              const base = b.positions.length / 3;
              const s = aoCurve[3] * shade * (d[1] === 0 ? 0.9 : 1);
              for (let i = 0; i < 4; i++) {
                const c = f.corners[i];
                b.positions.push(x + c.pos[0], y + c.pos[1] * h, z + c.pos[2]);
                b.normals.push(d[0], d[1], d[2]);
                b.uvs.push(c.uv[0], d[1] === 0 ? c.uv[1] * h : c.uv[1]);
                b.colors.push(s, s, s);
              }
              b.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
              b.quads++;
            }
            continue;
          }

          for (const f of FACES) {
            const d = f.dir;
            const nx = x + d[0], ny = y + d[1], nz = z + d[2];
            let nid = 0;
            if (world.inb(nx, ny, nz)) {
              nid = world.get(nx, ny, nz);
            } else {
              if (ny < 0) continue;                     // never draw the underside of the world
              if (ny < sy && !edgeFaces) continue;      // world border walls are optional
            }
            if (nid) {
              const nk = kindOf(nid);
              if (nk === 'solid') continue;             // hidden behind an opaque cube
              if (nid === id) continue;                 // same see-through block: merge
              if (kind === 'liquid' && nk === 'liquid') continue;
            }

            const b = bucket(buckets, tileOf(def, f.name), kind);
            const base = b.positions.length / 3;
            const wantAO = kind === 'solid' || kind === 'cutout';
            const ax = d[0] !== 0 ? 0 : d[1] !== 0 ? 1 : 2;
            const t1 = (ax + 1) % 3, t2 = (ax + 2) % 3;
            const lowerTop = kind === 'liquid' && kindOf(world.get(x, y + 1, z)) !== 'liquid';
            const ao = [3, 3, 3, 3];
            for (let i = 0; i < 4; i++) {
              const c = f.corners[i];
              let py = y + c.pos[1];
              if (lowerTop && c.pos[1] === 1) py -= liquidDrop;
              b.positions.push(x + c.pos[0], py, z + c.pos[2]);
              b.normals.push(d[0], d[1], d[2]);
              b.uvs.push(c.uv[0], c.uv[1]);
              if (wantAO) {
                const s1 = c.pos[t1] === 1 ? 1 : -1;
                const s2 = c.pos[t2] === 1 ? 1 : -1;
                const p1 = [nx, ny, nz]; p1[t1] += s1;
                const p2 = [nx, ny, nz]; p2[t2] += s2;
                const p3 = [nx, ny, nz]; p3[t1] += s1; p3[t2] += s2;
                const side1 = occludes(p1[0], p1[1], p1[2]);
                const side2 = occludes(p2[0], p2[1], p2[2]);
                const corner = occludes(p3[0], p3[1], p3[2]);
                ao[i] = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
              }
              const s = aoCurve[ao[i]] * shade;
              b.colors.push(s, s, s);
            }
            // split the quad along the diagonal that keeps the AO gradient symmetric
            if (ao[0] + ao[3] > ao[1] + ao[2]) b.indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
            else b.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
            b.quads++;
          }
        }
      }
    }
  };
}

function bucketMesh(b, materialFor) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3));
  geo.setIndex(b.indices);
  geo.computeBoundingSphere();
  const mat = materialFor(b.tile, b.kind);
  if (!mat) throw new Error('materialFor returned nothing for tile "' + b.tile + '" (' + b.kind + ')');
  mat.vertexColors = true;
  if (b.kind === 'cross') mat.side = THREE.FrontSide; // geometry already carries both windings
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = b.tile + ':' + b.kind;
  mesh.castShadow = b.kind === 'solid' || b.kind === 'cutout';
  mesh.receiveShadow = true;
  if (b.kind === 'translucent') mesh.renderOrder = 1;
  if (b.kind === 'liquid') mesh.renderOrder = 2;
  return mesh;
}

/**
 * @param {VoxelWorld} world
 * @param {Record<number, object>} blocks  block definitions by id
 * @param {object} opts
 * @param {(tile: string, kind: string) => THREE.Material} opts.materialFor
 * @param {number[]} [opts.aoCurve]   brightness for AO levels 0 (darkest) .. 3 (open)
 * @param {boolean} [opts.edgeFaces]  draw the side walls at the world border (diorama look)
 * @param {number} [opts.liquidDrop]  how far a liquid's open surface sits below the cube top
 */
export function buildVoxelMeshes(world, blocks, opts = {}) {
  const { materialFor } = opts;
  if (typeof materialFor !== 'function') throw new Error('buildVoxelMeshes: opts.materialFor(tile, kind) is required');
  const buckets = new Map();
  makeMesher(world, blocks, opts)(buckets, 0, world.sx, 0, world.sz);
  const group = new THREE.Group();
  group.name = 'voxels';
  let quads = 0;
  for (const b of buckets.values()) {
    if (!b.quads) continue;
    quads += b.quads;
    group.add(bucketMesh(b, materialFor));
  }
  return { group, stats: { quads, triangles: quads * 2, drawCalls: group.children.length } };
}

/**
 * Editable terrain for the playable game. Same look and the same draw calls as buildVoxelMeshes
 * (one static mesh per tile for the whole world), but the world is meshed chunk by chunk and the
 * index range of every chunk inside every static mesh is remembered. When a block changes,
 * the chunks it touches are cut out of the static meshes (their triangles are collapsed) and
 * drawn from then on as small meshes of their own, which are cheap to rebuild.
 *
 *   const terrain = createVoxelTerrain(world, BLOCKS, { materialFor, aoCurve, onMesh });
 *   scene.add(terrain.group);
 *   terrain.setBlock(x, y, z, id);      // edit; call terrain.flush() once per frame
 *
 * opts: everything buildVoxelMeshes takes, plus
 *   chunk   chunk size in blocks (default 16)
 *   onMesh  (mesh, isStatic) => void, called for every mesh created (static and rebuilt chunks),
 *           e.g. to remap UVs or set flags.
 */
export function createVoxelTerrain(world, blocks, opts = {}) {
  const { materialFor, chunk = 16, onMesh } = opts;
  if (typeof materialFor !== 'function') throw new Error('createVoxelTerrain: opts.materialFor(tile, kind) is required');
  const meshRegion = makeMesher(world, blocks, opts);
  const { sx, sz } = world;
  const ncx = Math.ceil(sx / chunk), ncz = Math.ceil(sz / chunk);

  const buckets = new Map();
  const ranges = new Array(ncx * ncz);       // per chunk: [bucketKey, firstIndex, indexCount][]
  for (let cz = 0; cz < ncz; cz++) {
    for (let cx = 0; cx < ncx; cx++) {
      const before = new Map();
      for (const [k, b] of buckets) before.set(k, b.indices.length);
      meshRegion(buckets, cx * chunk, Math.min(sx, (cx + 1) * chunk), cz * chunk, Math.min(sz, (cz + 1) * chunk));
      const r = [];
      for (const [k, b] of buckets) { const s = before.get(k) ?? 0; if (b.indices.length > s) r.push([k, s, b.indices.length - s]); }
      ranges[cz * ncx + cx] = r;
    }
  }

  const group = new THREE.Group();
  group.name = 'voxels';
  const statics = new Map();
  let quads = 0;
  for (const [k, b] of buckets) {
    if (!b.quads) continue;
    quads += b.quads;
    const mesh = bucketMesh(b, materialFor);
    if (onMesh) onMesh(mesh, true);
    statics.set(k, mesh);
    group.add(mesh);
  }

  const live = new Map();                    // chunk index -> THREE.Group of its own meshes
  const dirty = new Set();

  function rebuild(ci) {
    let g = live.get(ci);
    if (!g) {
      // first edit in this chunk: collapse its triangles in the static meshes
      for (const [k, start, count] of ranges[ci]) {
        const index = statics.get(k).geometry.index;
        index.array.fill(0, start, start + count);
        index.addUpdateRange(start, count);
        index.needsUpdate = true;
      }
      g = new THREE.Group();
      g.name = 'chunk:' + ci;
      live.set(ci, g);
      group.add(g);
    }
    for (const m of g.children) m.geometry.dispose();
    g.clear();
    const cx = ci % ncx, cz = (ci - cx) / ncx;
    const bk = new Map();
    meshRegion(bk, cx * chunk, Math.min(sx, (cx + 1) * chunk), cz * chunk, Math.min(sz, (cz + 1) * chunk));
    for (const b of bk.values()) {
      if (!b.quads) continue;
      const mesh = bucketMesh(b, materialFor);
      if (onMesh) onMesh(mesh, false);
      g.add(mesh);
    }
  }

  return {
    group,
    stats: { quads, triangles: quads * 2, drawCalls: statics.size },
    /** Change one block. Marks every chunk whose faces or shading can depend on it. */
    setBlock(x, y, z, id) {
      if (!world.inb(x, y, z) || world.get(x, y, z) === id) return false;
      world.set(x, y, z, id);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cx = Math.floor((x + dx) / chunk), cz = Math.floor((z + dz) / chunk);
        if (cx >= 0 && cz >= 0 && cx < ncx && cz < ncz) dirty.add(cz * ncx + cx);
      }
      return true;
    },
    /** Queue the chunk holding column (x, z) for a rebuild although no block changed (e.g. its lighting did). */
    markDirty(x, z) {
      const cx = Math.floor(x / chunk), cz = Math.floor(z / chunk);
      if (cx >= 0 && cz >= 0 && cx < ncx && cz < ncz) dirty.add(cz * ncx + cx);
    },
    /** Rebuild the chunks touched since the last call. Returns how many were rebuilt. */
    flush() {
      if (!dirty.size) return 0;
      const n = dirty.size;
      for (const ci of dirty) rebuild(ci);
      dirty.clear();
      return n;
    },
    liveChunks: () => live.size,
  };
}
