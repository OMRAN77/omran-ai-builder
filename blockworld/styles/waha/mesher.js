// Mesher for the "waha" world. Same rules as /shared/voxel.js (face culling, per-vertex AO, one mesh
// per tile and kind) with one addition: blocks of untouched loose ground get sloped tops. Each top
// corner of such a column sits on the continuous terrain height, neighbouring columns share those
// corners, and the side faces between them collapse, so dunes are one smooth sheet of two triangles
// per block. Columns that were dug or built on keep plain cube faces.
//
// When the player edits a column of sloped ground, only that column turns into cubes. Its neighbours
// keep their slopes; the walls between them are cut where the sloped surface meets them (see `cut`
// in meshColumns), so a hole in a dune has straight sides up to the sand and nothing else moves.
//
// The terrain is editable (same pattern as createVoxelTerrain in /shared/voxel.js): the world is meshed
// column by column into one static mesh per tile, and the index range every chunk owns inside every
// static mesh is remembered. The first edit in a chunk collapses those ranges and from then on the
// chunk is drawn from small meshes of its own, which are cheap to rebuild.
import * as THREE from 'three';
import { X0, X1, Z0, Z1, SX, SZ, SY, colIndex, cornerIndex, B } from './world.js';

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

for (const f of FACES) f.tops = [0, 1, 2, 3].filter((i) => f.corners[i].pos[1] === 1);      // which corners are the upper ones

function tileOf(def, faceName) {
  const t = def.tiles;
  if (typeof t === 'string') return t;
  return t[faceName] ?? t.side ?? t.all ?? t.top;
}

/**
 * Editable terrain.
 *
 *   const terrain = createTerrain(W, BLOCKS, { materialFor, regionOf, skipLiquid, onMesh });
 *   scene.add(terrain.group);
 *   terrain.setBlock(x, y, z, id);      // edit; call terrain.flush() once per frame
 *
 * @param W        result of buildWorld(). Its top / nat / colMax / smooth arrays are kept up to date,
 *                 so W.surfaceY() stays right after an edit.
 * @param blocks   block definitions by id
 * @param opts.materialFor(tile, kind)
 * @param opts.regionOf(x, z) -> small integer; meshes are split per region (used for the pool reflection set)
 * @param opts.skipLiquid(x, y, z) -> true to leave a liquid block to a separately drawn water surface
 * @param opts.chunk     chunk size in blocks (default 16)
 * @param opts.onMesh    (mesh, isStatic) => void, called for every mesh created (static and rebuilt chunks)
 * @param opts.notGround (id) => true for blocks that stand on the ground without being part of it
 *                       (plants, water). Default: the plant and water ids of world.js.
 */
export function createTerrain(W, blocks, opts = {}) {
  const { materialFor, aoCurve = [0.5, 0.68, 0.85, 1.0], liquidDrop = 0.12, regionOf = () => 0, skipLiquid = () => false, chunk = 16, onMesh } = opts;
  const notGround = opts.notGround ?? ((id) => id >= B.WATER && id <= B.SHRUB);
  const { world, top, nat, colMax, hc, smooth, firm, surfaceY } = W;
  const kindOf = (id) => (id && blocks[id] ? (blocks[id].kind ?? 'solid') : 'air');
  const occ = (x, y, z) => {
    const id = world.get(x, y, z);
    if (!id) return 0;
    const def = blocks[id];
    return def && ((def.kind ?? 'solid') === 'solid' || def.occludes === true) ? 1 : 0;
  };
  const newBuckets = () => ({ map: new Map(), list: [] });
  const bucket = (bk, tile, kind, region) => {
    const key = tile + '|' + kind + '|' + region;
    let b = bk.map.get(key);
    if (!b) { b = { tile, kind, region, positions: [], normals: [], uvs: [], colors: [], mixes: [], indices: [], quads: 0 }; bk.map.set(key, b); bk.list.push(b); }
    return b;
  };
  const inCols = (x, z) => x >= X0 && x < X1 && z >= Z0 && z < Z1;
  const gradN = (x, z, out) => {
    // smooth normal of the corner-height field
    const k = cornerIndex(x, z);
    const h0 = hc[k];
    const g = (dx, dz) => { const xx = x + dx, zz = z + dz; if (xx < X0 || xx > X1 || zz < Z0 || zz > Z1) return h0; const kk = cornerIndex(xx, zz); return smooth[kk] ? hc[kk] : h0; };
    let nx = -(g(1, 0) - g(-1, 0)) * 0.5, nz = -(g(0, 1) - g(0, -1)) * 0.5;
    const l = Math.hypot(nx, 1, nz);
    out[0] = nx / l; out[1] = 1 / l; out[2] = nz / l;
  };
  const nrm = [0, 0, 0];
  const ys = [0, 0, 0, 0], ao = [3, 3, 3, 3];

  /** Append the faces of every column with x0 <= x < x1 and z0 <= z < z1 to the buckets `bk`. */
  function meshColumns(bk, x0, x1, z0, z1) {
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const ci = colIndex(x, z);
      const region = regionOf(x, z);
      const isNat = nat[ci] === 1, SA = top[ci] + 1;
      for (let y = 0, ym = colMax[ci]; y <= ym; y++) {
        const id = world.get(x, y, z);
        if (!id) continue;
        const def = blocks[id];
        if (!def) continue;
        const kind = def.kind ?? 'solid';
        if (kind === 'none') continue;
        const shade = def.shade ?? 1;

        if (kind === 'cross') {
          const b = bucket(bk, tileOf(def, 'side'), 'cross', region);
          const h = def.height ?? 1;
          const s = aoCurve[3] * shade;
          const y0 = (isNat && y === SA) ? surfaceY(x + 0.5, z + 0.5) - 0.06 : y;
          // slight per-plant turn and size so tufts do not line up on the grid
          const hsh = ((x * 73856093) ^ (z * 19349663)) >>> 0;
          const rot = (hsh % 628) / 100, sc = 0.85 + ((hsh >>> 8) % 100) / 220;
          const cs = Math.cos(rot) * 0.46 * sc, sn = Math.sin(rot) * 0.46 * sc;
          const quads = [[[-cs, -sn], [cs, sn]], [[sn, -cs], [-sn, cs]]];
          for (const [a, c] of quads) {
            const base = b.positions.length / 3;
            b.positions.push(x + 0.5 + a[0], y0, z + 0.5 + a[1], x + 0.5 + c[0], y0, z + 0.5 + c[1], x + 0.5 + a[0], y0 + h * sc, z + 0.5 + a[1], x + 0.5 + c[0], y0 + h * sc, z + 0.5 + c[1]);
            b.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
            b.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
            b.colors.push(s * 0.8, s * 0.8, s * 0.8, s * 0.8, s * 0.8, s * 0.8, s, s, s, s, s, s);
            b.mixes.push(0, 0, 0, 0);
            b.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
            b.indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
            b.quads += 2;
          }
          continue;
        }
        if (kind === 'liquid' && skipLiquid(x, y, z)) continue;
        const soft = isNat && y < SA && kind === 'solid';

        for (const f of FACES) {
          const d = f.dir;
          const nx = x + d[0], ny = y + d[1], nz = z + d[2];
          let nid = 0;
          if (inCols(nx, nz) && ny >= 0 && ny < SY) nid = world.get(nx, ny, nz);
          else if (ny < 0 || ny < SY) continue;                     // never draw the underside or the world border
          // A wall between untouched sloped ground and a column the player has edited (this never
          // happens in the static build: there, corners beside a touched column are not sloped).
          // cut 1: this block is the sloped ground, 2: this block is in the edited column.
          let cut = 0, ea = 0, eb = 0, plain = true, capFrom = -1;
          if (d[1] === 0 && kind === 'solid') {
            const bi = colIndex(nx, nz);
            if ((nat[bi] === 1) !== isNat) {
              const ca = f.corners[f.tops[0]], cb = f.corners[f.tops[1]];
              const ka = cornerIndex(x + ca.pos[0], z + ca.pos[2]), kb = cornerIndex(x + cb.pos[0], z + cb.pos[2]);
              if (smooth[ka] || smooth[kb]) {
                // the sloped surface along the shared edge (a corner that is not sloped sits on the block top)
                const S = isNat ? SA : top[bi] + 1;
                ea = smooth[ka] ? hc[ka] : S; eb = smooth[kb] ? hc[kb] : S;
                cut = isNat ? (y < SA ? 1 : 0) : 2;
              }
            }
          }
          if (cut === 1) {
            // Where the edited neighbour is open, a level wholly under the surface gets a plain face, and
            // the lowest open level that reaches the surface carries one face up to it (the top block
            // carries that face when the level lies above this column's blocks).
            const m = Math.min(ea, eb), M = Math.max(ea, eb);
            plain = y + 1 <= m && kindOf(nid) !== 'solid';
            let L = Math.max(0, Math.floor(m));
            while (L < M && kindOf(world.get(nx, L, nz)) === 'solid') L++;
            if (L < M - 1e-4 && (L === y || (y === SA - 1 && L >= SA))) capFrom = L;
            if (!plain && capFrom < 0) continue;
          } else if (cut === 2) {
            // the neighbour's surface, not its cells, decides what shows: all of this face that is above it
            if (y + 1 <= Math.min(ea, eb) + 1e-4) continue;
          } else if (nid) {
            const nk = kindOf(nid);
            if (nk === 'solid') continue;
            if (nid === id) continue;
            if (kind === 'liquid' && nk === 'liquid') continue;
          }
          const wantAO = kind === 'solid' || kind === 'cutout';
          const ax = d[0] !== 0 ? 0 : d[1] !== 0 ? 1 : 2;
          const t1 = (ax + 1) % 3, t2 = (ax + 2) % 3;
          const lowerTop = kind === 'liquid' && kindOf(world.get(x, y + 1, z)) !== 'liquid';
          const slopedTop = soft && d[1] === 1 && y === SA - 1;
          const slopedSide = soft && d[1] === 0 && cut !== 1;
          let SB = 0;
          if (slopedSide) SB = top[colIndex(nx, nz)] + 1;           // neighbour at least as high: plain face
          // one face; a cut wall can have two (pass 0: the plain face, pass 1: the one up to the surface)
          for (let pass = plain ? 0 : 1, passes = capFrom >= 0 ? 2 : 1; pass < passes; pass++) {
            // vertex heights
            let degenerate = slopedSide;
            if (pass === 1) {
              for (let i = 0; i < 4; i++) ys[i] = capFrom;
              ys[f.tops[0]] = Math.max(capFrom, ea); ys[f.tops[1]] = Math.max(capFrom, eb);
              degenerate = false;
            } else for (let i = 0; i < 4; i++) {
              const c = f.corners[i];
              const cx = x + c.pos[0], cz = z + c.pos[2];
              let py = y + c.pos[1];
              if (lowerTop && c.pos[1] === 1) py -= liquidDrop;
              if (slopedTop) {
                const k = cornerIndex(cx, cz);
                if (smooth[k]) py = hc[k];
              } else if (slopedSide && SB < SA) {
                const k = cornerIndex(cx, cz);
                if (smooth[k]) py = hc[k];
                else degenerate = false;
              } else degenerate = false;
              ys[i] = py;
            }
            if (degenerate) continue;

            const ay = pass === 1 ? capFrom : ny;                   // the level whose surroundings shade the face
            const b = bucket(bk, tileOf(def, f.name), kind, region);
            const base = b.positions.length / 3;
            for (let i = 0; i < 4; i++) {
              const c = f.corners[i];
              const cx = x + c.pos[0], cz = z + c.pos[2];
              b.positions.push(cx, ys[i], cz);
              let smoothCorner = false;
              if (slopedTop) {
                const k = cornerIndex(cx, cz);
                if (smooth[k]) { gradN(cx, cz, nrm); b.normals.push(nrm[0], nrm[1], nrm[2]); smoothCorner = true; }
                b.mixes.push(firm[k]);
              } else b.mixes.push(d[1] === 1 && kind === 'solid' ? firm[cornerIndex(cx, cz)] : 0);
              if (!smoothCorner) b.normals.push(d[0], d[1], d[2]);
              b.uvs.push(c.uv[0], c.uv[1]);
              ao[i] = 3;
              if (wantAO && !smoothCorner) {
                const s1 = c.pos[t1] === 1 ? 1 : -1;
                const s2 = c.pos[t2] === 1 ? 1 : -1;
                const p1 = [nx, ay, nz]; p1[t1] += s1;
                const p2 = [nx, ay, nz]; p2[t2] += s2;
                const p3 = [nx, ay, nz]; p3[t1] += s1; p3[t2] += s2;
                const side1 = occ(p1[0], p1[1], p1[2]);
                const side2 = occ(p2[0], p2[1], p2[2]);
                const corner = occ(p3[0], p3[1], p3[2]);
                ao[i] = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
              }
              const s = aoCurve[ao[i]] * shade;
              b.colors.push(s, s, s);
            }
            let flip;
            if (slopedTop) flip = Math.abs(ys[0] - ys[3]) < Math.abs(ys[1] - ys[2]);   // split along the flatter diagonal: clean crests
            else flip = ao[0] + ao[3] > ao[1] + ao[2];
            if (flip) b.indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
            else b.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
            b.quads++;
          }
        }
      }
    }
  }

  function bucketMesh(b) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3));
    if (b.tile === 'sand' || b.tile === 'hardpan') geo.setAttribute('aMix', new THREE.Float32BufferAttribute(b.mixes, 1));
    geo.setIndex(b.indices);
    geo.computeBoundingSphere();
    const mat = materialFor(b.tile, b.kind);
    if (!mat) throw new Error('materialFor returned nothing for tile "' + b.tile + '" (' + b.kind + ')');
    mat.vertexColors = true;
    if (b.kind === 'cross') mat.side = THREE.FrontSide;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = b.tile + ':' + b.kind;
    mesh.userData.region = b.region;
    mesh.castShadow = b.kind === 'solid' || b.kind === 'cutout';
    mesh.receiveShadow = true;
    if (b.kind === 'translucent') mesh.renderOrder = 1;
    if (b.kind === 'liquid') mesh.renderOrder = 2;
    return mesh;
  }

  // ---- static build. Columns are visited in the same order as a plain whole-world pass (row by row),
  //      so the static meshes are exactly what that pass would produce; a chunk owns one index run
  //      per bucket for each of its rows.
  const ncx = Math.ceil(SX / chunk), ncz = Math.ceil(SZ / chunk);
  const buckets = newBuckets();
  const ranges = Array.from({ length: ncx * ncz }, () => []);      // per chunk, flat triples: bucket number, first index, index count
  const lens = [];
  for (let z = Z0; z < Z1; z++) {
    const cz = Math.floor((z - Z0) / chunk);
    for (let cx = 0; cx < ncx; cx++) {
      const list = buckets.list, n0 = list.length;
      for (let i = 0; i < n0; i++) lens[i] = list[i].indices.length;
      meshColumns(buckets, X0 + cx * chunk, Math.min(X1, X0 + (cx + 1) * chunk), z, z + 1);
      const r = ranges[cz * ncx + cx];
      for (let i = 0; i < list.length; i++) { const s = i < n0 ? lens[i] : 0, e = list[i].indices.length; if (e > s) r.push(i, s, e - s); }
    }
  }

  const group = new THREE.Group();
  group.name = 'voxels';
  const statics = [];                        // by bucket number
  let quads = 0, drawCalls = 0;
  for (const b of buckets.list) {
    if (!b.quads) { statics.push(null); continue; }
    quads += b.quads;
    const mesh = bucketMesh(b);
    if (onMesh) onMesh(mesh, true);
    statics.push(mesh);
    group.add(mesh);
    drawCalls++;
  }
  buckets.map.clear(); buckets.list.length = 0;      // the plain arrays are no longer needed

  const live = new Map();                    // chunk number -> THREE.Group of its own meshes
  const dirty = new Set();

  function rebuild(ci) {
    let g = live.get(ci);
    if (!g) {
      // first edit in this chunk: collapse its triangles in the static meshes
      const r = ranges[ci];
      for (let i = 0; i < r.length; i += 3) {
        const index = statics[r[i]].geometry.index;
        index.array.fill(0, r[i + 1], r[i + 1] + r[i + 2]);
        index.addUpdateRange(r[i + 1], r[i + 2]);
        index.needsUpdate = true;
      }
      ranges[ci] = null;
      g = new THREE.Group();
      g.name = 'chunk:' + ci;
      live.set(ci, g);
      group.add(g);
    }
    for (const m of g.children) m.geometry.dispose();
    g.clear();
    const cx = ci % ncx, cz = (ci - cx) / ncx;
    const bk = newBuckets();
    meshColumns(bk, X0 + cx * chunk, Math.min(X1, X0 + (cx + 1) * chunk), Z0 + cz * chunk, Math.min(Z1, Z0 + (cz + 1) * chunk));
    for (const b of bk.list) {
      if (!b.quads) continue;
      const mesh = bucketMesh(b);
      if (onMesh) onMesh(mesh, false);
      g.add(mesh);
    }
  }

  return {
    group,
    stats: { quads, triangles: quads * 2, drawCalls },
    /**
     * Change one block. Keeps the column tables of W right (highest block, ground level, whether the
     * column is still untouched loose ground) and marks every chunk whose faces, slopes or shading can
     * depend on the change. Returns false when nothing changed.
     */
    setBlock(x, y, z, id) {
      if (!world.inb(x, y, z)) return false;
      const old = world.get(x, y, z);
      if (old === id) return false;
      world.set(x, y, z, id);
      const ci = colIndex(x, z);
      if (id) { if (y > colMax[ci]) colMax[ci] = y; } else if (y === colMax[ci]) { let m = y - 1; while (m >= 0 && !world.get(x, m, z)) m--; colMax[ci] = m; }
      if (nat[ci]) {
        // Untouched loose ground stays sloped only while its own blocks are left alone: a plant coming
        // or going, or something built clear of the surface, does not count as touching it. A touched
        // column becomes cubes; the corner heights stay, so its neighbours keep their slopes.
        const t = top[ci];
        if (!(y > t + 1 || (y > t && (!old || notGround(old)) && (!id || notGround(id))))) nat[ci] = 0;
      }
      if (!nat[ci]) { let m = colMax[ci]; while (m >= 0) { const q = world.get(x, m, z); if (q && !notGround(q)) break; m--; } top[ci] = m; }
      // faces and their shading depend on the cells one step away, so that is how far a change reaches
      const c0 = Math.max(0, Math.floor((x - 1 - X0) / chunk)), c1 = Math.min(ncx - 1, Math.floor((x + 1 - X0) / chunk));
      const d0 = Math.max(0, Math.floor((z - 1 - Z0) / chunk)), d1 = Math.min(ncz - 1, Math.floor((z + 1 - Z0) / chunk));
      for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) dirty.add(cz * ncx + cx);
      return true;
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

/** The meshes alone, for callers that never edit. */
export function buildTerrainMeshes(W, blocks, opts = {}) {
  const t = createTerrain(W, blocks, opts);
  return { group: t.group, stats: t.stats };
}
export const _B = B;
