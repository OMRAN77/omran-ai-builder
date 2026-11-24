// Mesher for the "waha" world, streamed: the endless desert (gen.js) is drawn only near the player, in regions of
// 64 x 64 columns that are meshed a few rows per frame, nearest first, and dropped when far behind.
//
// The faces are those of /shared/voxel.js (face culling, per-vertex AO, one mesh per tile and kind) with one
// addition: blocks of untouched loose ground get sloped tops. Each top corner of such a column sits on the
// continuous terrain height, neighbouring columns share those corners, and the side faces between them collapse,
// so dunes are one smooth sheet of two triangles per block. Columns that were dug or built on keep plain cube faces.
//
// When the player edits a column of sloped ground, only that column turns into cubes. Its neighbours keep their
// slopes; the walls between them are cut where the sloped surface meets them (see `cut` in meshColumns), so a hole
// in a dune has straight sides up to the sand and nothing else moves.
//
// The shared building kit (shared/kit.js) brings block kinds this world has none of: 'slab' (a box `height` tall:
// half blocks, beds), 'translucent' (glass), a liquid and a 'cross' of its own (water, fire). `opts.kit(id)` names
// those blocks. They are always drawn plain: flat faces, never sloped, never turned or resized like the plants; and
// where one stands beside sloped sand, the sand's surface (not its cell) decides which of the block's sides show.
//
// Editing: a region is drawn from one static mesh per tile, and the index range every 16 x 16 piece of it owns in
// every static mesh is remembered. The first edit in a piece collapses those ranges and from then on the piece is
// drawn from small meshes of its own, which are cheap to rebuild (the same pattern as createVoxelTerrain in voxel.js).
//
// Coordinates: the grid of gen.js (from zero). Vertices are written in world coordinates (whole numbers at block
// corners, so the edges two regions share are the very same numbers and no crack of sky shows between them).
import * as THREE from 'three';
import { SY, B, OXC, OZC } from './world.js';

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

const R = 64, SUB = 16, NSUB = R / SUB;

/**
 * A copy of a box of columns (and one more all round) with their tables and corners, read from the desert: the
 * mesher reads only this while it works.
 */
function makeView(D, maxW) {
  const PW = maxW + 2, CW = maxW + 3, CC = D.C * D.C;
  const vox = new Uint8Array(PW * PW * SY), top = new Int16Array(PW * PW), nat = new Uint8Array(PW * PW), colMax = new Int16Array(PW * PW);
  const hc = new Float32Array(CW * CW), smooth = new Uint8Array(CW * CW), firm = new Float32Array(CW * CW);
  const v = { gx0: 0, gz0: 0, w: 0, PW, CW, L: PW * PW, vox, top, nat, colMax, hc, smooth, firm };
  const CO = { hc: 0, smooth: 0, firm: 0 };
  v.fill = (gx0, gz0, w) => {
    v.gx0 = gx0; v.gz0 = gz0; v.w = w;
    const L = v.L;
    for (let lz = 0; lz < w + 2; lz++) for (let lx = 0; lx < w + 2; lx++) {
      const gx = gx0 - 1 + lx, gz = gz0 - 1 + lz, li = lx + lz * PW;
      if (gx < 0 || gz < 0 || gx >= D.sx || gz >= D.sz) { for (let y = 0; y < SY; y++) vox[li + y * L] = 0; top[li] = -1; nat[li] = 0; colMax[li] = -1; continue; }
      const r = D.colRec(gx, gz), ci = D.ci32(gx, gz), d = r.d;
      const m = r.colMax[ci];
      for (let y = 0; y <= m; y++) vox[li + y * L] = d[ci + y * CC];
      for (let y = Math.max(0, m + 1); y < SY; y++) vox[li + y * L] = 0;
      top[li] = r.top[ci]; nat[li] = r.nat[ci]; colMax[li] = m;
    }
    for (let lz = 0; lz < w + 3; lz++) for (let lx = 0; lx < w + 3; lx++) {
      const gx = gx0 - 1 + lx, gz = gz0 - 1 + lz, k = lx + lz * CW;
      if (gx < 1 || gz < 1 || gx >= D.sx - 1 || gz >= D.sz - 1) { smooth[k] = 0; hc[k] = 0; firm[k] = 0; continue; }
      D.corner(gx, gz, CO);
      hc[k] = CO.hc; smooth[k] = CO.smooth; firm[k] = CO.firm;
    }
  };
  return v;
}

/**
 * Streamed editable terrain.
 *
 *   const terrain = createTerrain(D, BLOCKS, { materialFor, regionOf, skipLiquid, onMesh, radius });
 *   scene.add(terrain.group);
 *   terrain.update(gx, gz)            every frame: makes and meshes a little near (gx, gz), drops what is far
 *   terrain.setBlock(gx, y, gz, id)   edit; terrain.flush() once per frame
 *
 * @param D        the desert (gen.js createDesert). Its column tables are kept up to date by setBlock.
 * @param opts.materialFor(tile, kind)
 * @param opts.regionOf(wx, wz) -> small integer; meshes are split per region (used for the pool reflection set)
 * @param opts.skipLiquid(wx, y, wz) -> true to leave a liquid block to a separately drawn water surface
 * @param opts.onMesh    (mesh, isStatic) => void, called for every mesh created
 * @param opts.notGround (id) => true for blocks that stand on the ground without being part of it (plants, water)
 * @param opts.kit       (id) => true for the blocks of the shared building kit (drawn plain, see above)
 * @param opts.onLoad(region) / opts.onUnload(region)   a region was drawn / dropped (region.props is a group of its own)
 */
export function createTerrain(D, blocks, opts = {}) {
  const { materialFor, aoCurve = [0.5, 0.68, 0.85, 1.0], liquidDrop = 0.12, regionOf = () => 0, skipLiquid = () => false, onMesh } = opts;
  const notGround = opts.notGround ?? ((id) => id >= B.WATER && id <= B.SHRUB);
  const isKit = opts.kit ?? (() => false);
  const NR = D.sx / R;
  const kindOf = (id) => (id && blocks[id] ? (blocks[id].kind ?? 'solid') : 'air');
  const KIND = new Array(256).fill(null);
  const kindQ = (id) => KIND[id] ?? (KIND[id] = kindOf(id));
  const newBuckets = () => ({ map: new Map(), list: [] });
  const bucket = (bk, tile, kind, region) => {
    const key = tile + '|' + kind + '|' + region;
    let b = bk.map.get(key);
    if (!b) { b = { tile, kind, region, positions: [], normals: [], uvs: [], colors: [], mixes: [], indices: [], quads: 0 }; bk.map.set(key, b); bk.list.push(b); }
    return b;
  };

  /** Append the faces of every column with x0 <= x < x1 and z0 <= z < z1 (grid) to the buckets, positions relative to (ox, oz). */
  function meshColumns(V, bk, x0, x1, z0, z1, ox, oz) {
    const { PW, CW, L, vox, top, nat, colMax, hc, smooth, firm } = V;
    const bx = V.gx0 - 1, bz = V.gz0 - 1;
    const colIndex = (x, z) => (x - bx) + (z - bz) * PW;
    const cornerIndex = (x, z) => (x - bx) + (z - bz) * CW;
    const get = (x, y, z) => (y < 0 || y >= SY ? 0 : vox[(x - bx) + (z - bz) * PW + y * L]);
    const occ = (x, y, z) => {
      const id = get(x, y, z);
      if (!id) return 0;
      const def = blocks[id];
      return def && ((def.kind ?? 'solid') === 'solid' || def.occludes === true) ? 1 : 0;
    };
    const gradN = (x, z, out) => {
      // smooth normal of the corner-height field
      const k = cornerIndex(x, z);
      const h0 = hc[k];
      const g = (dx, dz) => { const kk = cornerIndex(x + dx, z + dz); return smooth[kk] ? hc[kk] : h0; };
      const nx = -(g(1, 0) - g(-1, 0)) * 0.5, nz = -(g(0, 1) - g(0, -1)) * 0.5;
      const l = Math.hypot(nx, 1, nz);
      out[0] = nx / l; out[1] = 1 / l; out[2] = nz / l;
    };
    const nrm = [0, 0, 0];
    const ys = [0, 0, 0, 0], ao = [3, 3, 3, 3];
    const edge = [0, 0];
    /**
     * The untouched sloped ground of column `bi` along the edge it shares with side face `f` of cell (x, z):
     * fills `edge` with its two heights (a corner that is not sloped sits on the block top). False when
     * that edge is not sloped at all.
     */
    const slopedEdge = (f, x, z, bi) => {
      const ca = f.corners[f.tops[0]], cb = f.corners[f.tops[1]];
      const ka = cornerIndex(x + ca.pos[0], z + ca.pos[2]), kb = cornerIndex(x + cb.pos[0], z + cb.pos[2]);
      if (!smooth[ka] && !smooth[kb]) return false;
      const S = top[bi] + 1;
      edge[0] = smooth[ka] ? hc[ka] : S; edge[1] = smooth[kb] ? hc[kb] : S;
      return true;
    };
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const ci = colIndex(x, z), wx = x + OXC, wz = z + OZC;
      const region = regionOf(wx, wz);
      const isNat = nat[ci] === 1, SA = top[ci] + 1;
      const px = x - ox, pz = z - oz;                               // where the column's faces go in the mesh
      for (let y = 0, ym = colMax[ci]; y <= ym; y++) {
        const id = vox[ci + y * L];
        if (!id) continue;
        const def = blocks[id];
        if (!def) continue;
        const kind = kindQ(id);
        if (kind === 'none') continue;
        const shade = def.shade ?? 1;

        if (kind === 'cross') {
          const b = bucket(bk, tileOf(def, 'side'), 'cross', region);
          const h = def.height ?? 1;
          const s = aoCurve[3] * shade;
          let y0 = y;
          if (isNat && y === SA) {
            // on the sloped surface (the same bilinear height as gen.js surfaceY), a little sunk
            const a = cornerIndex(x, z), cy = (k) => (smooth[k] ? hc[k] : SA);
            y0 = (cy(a) + cy(a + 1) + cy(a + CW) + cy(a + CW + 1)) * 0.25 - 0.06;
          }
          // slight per-plant turn and size so tufts do not line up on the grid; a kit block (fire) is
          // the same two diagonals in every world
          const plainX = isKit(id);
          const hsh = ((wx * 73856093) ^ (wz * 19349663)) >>> 0;
          const rot = (hsh % 628) / 100, sc = plainX ? 1 : 0.85 + ((hsh >>> 8) % 100) / 220;
          const cs = plainX ? 0.42 : Math.cos(rot) * 0.46 * sc, sn = plainX ? 0.42 : Math.sin(rot) * 0.46 * sc;
          const quads = [[[-cs, -sn], [cs, sn]], [[sn, -cs], [-sn, cs]]];
          for (const [a, c] of quads) {
            const base = b.positions.length / 3;
            b.positions.push(px + 0.5 + a[0], y0, pz + 0.5 + a[1], px + 0.5 + c[0], y0, pz + 0.5 + c[1], px + 0.5 + a[0], y0 + h * sc, pz + 0.5 + a[1], px + 0.5 + c[0], y0 + h * sc, pz + 0.5 + c[1]);
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
        const kb = isKit(id);
        if (kind === 'slab') {
          // a box of the cell's footprint and `height` tall (half blocks, beds): flat faces, drawn with the opaque blocks
          const h = def.height ?? 0.5;
          for (const f of FACES) {
            const d = f.dir, nx = x + d[0], ny = y + d[1], nz = z + d[2];
            if (d[1] <= 0) {                                 // sides and underside can hide behind a full cube or a twin
              if (ny < 0) continue;                          // never the underside of the world
              const nid = get(nx, ny, nz);
              let hidden = nid !== 0 && (kindQ(nid) === 'solid' || (nid === id && d[1] === 0));
              if (d[1] === 0) {
                // beside untouched sloped ground the sand's surface decides, not its cell
                const bi = colIndex(nx, nz);
                if (nat[bi] === 1 && y <= top[bi] && slopedEdge(f, x, z, bi)) hidden = y + h <= Math.min(edge[0], edge[1]) + 1e-4;
              }
              if (hidden) continue;
            }
            const b = bucket(bk, tileOf(def, f.name), 'solid', region);
            const base = b.positions.length / 3;
            const s = aoCurve[3] * shade * (d[1] === 0 ? 0.9 : 1);
            for (let i = 0; i < 4; i++) {
              const c = f.corners[i];
              b.positions.push(px + c.pos[0], y + c.pos[1] * h, pz + c.pos[2]);
              b.normals.push(d[0], d[1], d[2]);
              b.uvs.push(c.uv[0], d[1] === 0 ? c.uv[1] * h : c.uv[1]);
              b.colors.push(s, s, s);
              b.mixes.push(0);
            }
            b.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
            b.quads++;
          }
          continue;
        }
        if (kind === 'liquid' && !kb && skipLiquid(wx, y, wz)) continue;      // the pool sheet stands in for this world's own water only
        const soft = isNat && y < SA && kind === 'solid' && !kb;

        for (const f of FACES) {
          const d = f.dir;
          const nx = x + d[0], ny = y + d[1], nz = z + d[2];
          if (ny < 0) continue;                                     // never draw the underside of the world
          const nid = ny < SY ? get(nx, ny, nz) : 0;
          // A wall between untouched sloped ground and a block that is not.
          // cut 1: this block is the sloped ground and the column beside it was edited.
          // cut 2: this block is a plain one (in an edited column, built clear of the ground, or a kit
          //        block) and the ground beside it is sloped. A cell beside it that holds a block of its
          //        own, above that ground, hides the face by the usual rules instead.
          let cut = 0, ea = 0, eb = 0, plain = true, capFrom = -1;
          if (d[1] === 0 && (kind === 'solid' || kb)) {
            const bi = colIndex(nx, nz), nb = nat[bi] === 1;
            const own = nb && y > top[bi] && nid !== 0 && (kindQ(nid) === 'solid' || nid === id || (kind === 'liquid' && kindQ(nid) === 'liquid'));
            if (soft ? !nb : (nb && !own)) {
              const ca = f.corners[f.tops[0]], cb = f.corners[f.tops[1]];
              const ka = cornerIndex(x + ca.pos[0], z + ca.pos[2]), kc = cornerIndex(x + cb.pos[0], z + cb.pos[2]);
              if (smooth[ka] || smooth[kc]) {
                // the sloped surface along the shared edge (a corner that is not sloped sits on the block top)
                const S = soft ? SA : top[bi] + 1;
                ea = smooth[ka] ? hc[ka] : S; eb = smooth[kc] ? hc[kc] : S;
                cut = soft ? 1 : 2;
              }
            }
          }
          if (cut === 1) {
            // Where the edited neighbour is open, a level wholly under the surface gets a plain face, and
            // the lowest open level that reaches the surface carries one face up to it (the top block
            // carries that face when the level lies above this column's blocks).
            const m = Math.min(ea, eb), M = Math.max(ea, eb);
            plain = y + 1 <= m && kindQ(nid) !== 'solid';
            let Lv = Math.max(0, Math.floor(m));
            while (Lv < M && kindQ(get(nx, Lv, nz)) === 'solid') Lv++;
            if (Lv < M - 1e-4 && (Lv === y || (y === SA - 1 && Lv >= SA))) capFrom = Lv;
            if (!plain && capFrom < 0) continue;
          } else if (cut === 2) {
            // the neighbour's surface, not its cells, decides what shows: all of this face that is above it
            if (y + 1 <= Math.min(ea, eb) + 1e-4) continue;
          } else if (nid) {
            const nk = kindQ(nid);
            if (nk === 'solid') continue;
            if (nid === id) continue;
            if (kind === 'liquid' && nk === 'liquid') continue;
          }
          const wantAO = kind === 'solid' || kind === 'cutout';
          const ax = d[0] !== 0 ? 0 : d[1] !== 0 ? 1 : 2;
          const t1 = (ax + 1) % 3, t2 = (ax + 2) % 3;
          const lowerTop = kind === 'liquid' && kindQ(get(x, y + 1, z)) !== 'liquid';
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
              b.positions.push(cx - ox, ys[i], cz - oz);
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

  function bucketMesh(b, x0, z0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3));
    if (b.tile === 'sand' || b.tile === 'hardpan' || b.tile === 'salt') geo.setAttribute('aMix', new THREE.Float32BufferAttribute(b.mixes, 1));
    const nv = b.positions.length / 3;
    geo.setIndex(nv <= 65535 ? new THREE.Uint16BufferAttribute(b.indices, 1) : new THREE.Uint32BufferAttribute(b.indices, 1));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(x0 + OXC - 1, 0, z0 + OZC - 1), new THREE.Vector3(x0 + OXC + R + 1, SY, z0 + OZC + R + 1));
    geo.computeBoundingSphere();
    const mat = matFor(b.tile, b.kind);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = b.tile + ':' + b.kind;
    mesh.userData.region = b.region;
    mesh.castShadow = b.kind === 'solid' || b.kind === 'cutout';
    mesh.receiveShadow = true;
    if (b.kind === 'translucent') mesh.renderOrder = 1;
    if (b.kind === 'liquid') mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    return mesh;
  }
  const mats = new Map();
  function matFor(tile, kind) {
    const k = tile + '|' + kind;
    let m = mats.get(k);
    if (m) return m;
    m = materialFor(tile, kind);
    if (!m) throw new Error('materialFor returned nothing for tile "' + tile + '" (' + kind + ')');
    m.vertexColors = true;
    if (kind === 'cross') m.side = THREE.FrontSide;
    mats.set(k, m);
    return m;
  }

  // ---------------------------------------------------------------- regions
  const group = new THREE.Group();
  group.name = 'voxels';
  const loaded = new Map();                  // region key -> region
  const dirty = new Set();                   // region key * 16 + piece
  const stats = { quads: 0, triangles: 0, drawCalls: 0, chunks: 0, built: 0, buildMs: 0, maxBuildMs: 0, rebuilt: 0 };
  let radius = opts.radius || 88, budget = opts.budget || 6, keepExtra = opts.keep ?? 64;
  let center = { x: NaN, z: NaN }, queue = [], frame = 0, changed = true, job = null, liveN = 0;
  const jobView = makeView(D, R), editView = makeView(D, SUB);
  const rkey = (rx, rz) => rx * NR + rz;
  const count = () => { stats.triangles = stats.quads * 2; stats.chunks = loaded.size; };

  function startJob(rx, rz) {
    job = { rx, rz, gx0: rx * R, gz0: rz * R, z: 0, bk: newBuckets(), ranges: Array.from({ length: NSUB * NSUB }, () => []), lens: [], t: 0, filled: false };
  }
  /** Make the chunks a region needs (one at a time); true when all are there. */
  function chunksReady(rx, rz, t0, ms) {
    const c0x = (rx * R - 2) >> 5, c1x = (rx * R + R + 2) >> 5, c0z = (rz * R - 2) >> 5, c1z = (rz * R + R + 2) >> 5;
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      if (cx < 0 || cz < 0 || cx * D.C >= D.sx || cz * D.C >= D.sz || D.has(cx, cz)) continue;
      D.chunk(cx, cz);
      if (performance.now() - t0 > ms) return false;
    }
    return true;
  }
  /** Mesh rows of the current job until the time is up; when the region is done, make its meshes. */
  function runJob(t0, ms) {
    const J = job;
    if (!J.filled) { jobView.fill(J.gx0, J.gz0, R); J.filled = true; if (performance.now() - t0 > ms) return false; }
    const bk = J.bk, list = bk.list;
    while (J.z < R) {
      const z = J.gz0 + J.z, sz = (J.z / SUB) | 0;
      for (let sx = 0; sx < NSUB; sx++) {
        const n0 = list.length;
        for (let i = 0; i < n0; i++) J.lens[i] = list[i].indices.length;
        meshColumns(jobView, bk, J.gx0 + sx * SUB, J.gx0 + (sx + 1) * SUB, z, z + 1, -OXC, -OZC);
        const r = J.ranges[sz * NSUB + sx];
        for (let i = 0; i < list.length; i++) { const s = i < n0 ? J.lens[i] : 0, e = list[i].indices.length; if (e > s) r.push(i, s, e - s); }
      }
      J.z++;
      if (performance.now() - t0 > ms) return false;
    }
    finishJob();
    return true;
  }
  function finishJob() {
    const J = job, t0 = performance.now();
    job = null;
    const key = rkey(J.rx, J.rz);
    const old = loaded.get(key);
    if (old) unload(key);
    const reg = { rx: J.rx, rz: J.rz, gx0: J.gx0, gz0: J.gz0, g: new THREE.Group(), statics: [], ranges: J.ranges, live: new Map(), quads: 0, props: new THREE.Group() };
    reg.g.name = 'region:' + J.rx + ',' + J.rz;
    for (const b of J.bk.list) {
      if (!b.quads) { reg.statics.push(null); continue; }
      const mesh = bucketMesh(b, J.gx0, J.gz0);
      if (onMesh) onMesh(mesh, true);
      reg.statics.push(mesh); reg.g.add(mesh);
      reg.quads += b.quads; stats.drawCalls++;
    }
    reg.g.add(reg.props);
    group.add(reg.g);
    loaded.set(key, reg);
    stats.quads += reg.quads; stats.built++;
    const ms = performance.now() - t0 + J.t;
    stats.buildMs += ms; stats.maxBuildMs = Math.max(stats.maxBuildMs, ms);
    count(); changed = true;
    if (opts.onLoad) opts.onLoad(reg);
  }
  function unload(key) {
    const reg = loaded.get(key);
    if (!reg) return;
    if (opts.onUnload) opts.onUnload(reg);
    for (const m of reg.statics) if (m) { m.geometry.dispose(); stats.drawCalls--; }
    for (const g of reg.live.values()) { for (const m of g.children) { m.geometry.dispose(); stats.drawCalls--; stats.quads -= m.userData.quads || 0; } }
    liveN -= reg.live.size;
    group.remove(reg.g); loaded.delete(key);
    stats.quads -= reg.quads;
    count(); changed = true;
  }
  // distance from (px, pz) to the nearest point of region (rx, rz)
  const dist = (rx, rz, px, pz) => { const x0 = rx * R, z0 = rz * R, dx = px < x0 ? x0 - px : px > x0 + R ? px - x0 - R : 0, dz = pz < z0 ? z0 - pz : pz > z0 + R ? pz - z0 - R : 0; return Math.hypot(dx, dz); };
  function plan(px, pz) {
    center = { x: px, z: pz };
    const r = Math.ceil(radius / R) + 1, crx = Math.floor(px / R), crz = Math.floor(pz / R);
    queue = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const rx = crx + dx, rz = crz + dz;
      if (rx < 0 || rz < 0 || rx >= NR || rz >= NR) continue;
      const d = dist(rx, rz, px, pz);
      if (d <= radius && !loaded.has(rkey(rx, rz))) queue.push([d, rx, rz]);
    }
    queue.sort((a, b) => a[0] - b[0]);
    for (const [key, reg] of [...loaded]) if (dist(reg.rx, reg.rz, px, pz) > radius + R * 0.5) unload(key);
    if (job && dist(job.rx, job.rz, px, pz) > radius + R * 0.5) job = null;
  }
  /** Work until the queue is empty or the time is up (always at least one step). */
  function work(ms) {
    const t0 = performance.now();
    let n = 0;
    while (job || queue.length) {
      if (!job) {
        const [, rx, rz] = queue[0];
        if (loaded.has(rkey(rx, rz))) { queue.shift(); continue; }
        if (!chunksReady(rx, rz, t0, ms)) break;
        queue.shift();
        startJob(rx, rz);
      }
      const j = job, ts = performance.now();
      const done = runJob(t0, ms);
      j.t += performance.now() - ts;
      if (done) n++;
      if (performance.now() - t0 > ms) break;
    }
    return n;
  }

  // ---------------------------------------------------------------- edits
  function rebuildPiece(reg, p) {
    const sx = p % NSUB, sz = (p / NSUB) | 0;
    let g = reg.live.get(p);
    if (!g) {
      // first edit in this piece: collapse its triangles in the static meshes
      const r = reg.ranges[p];
      for (let i = 0; i < r.length; i += 3) {
        reg.quads -= r[i + 2] / 6; stats.quads -= r[i + 2] / 6;
        const index = reg.statics[r[i]].geometry.index;
        index.array.fill(0, r[i + 1], r[i + 1] + r[i + 2]);
        index.addUpdateRange(r[i + 1], r[i + 2]);
        index.needsUpdate = true;
      }
      reg.ranges[p] = [];
      g = new THREE.Group();
      g.name = 'piece:' + p;
      reg.live.set(p, g); liveN++;
      reg.g.add(g);
    }
    for (const m of g.children) { m.geometry.dispose(); stats.drawCalls--; stats.quads -= m.userData.quads || 0; }
    g.clear();
    const x0 = reg.gx0 + sx * SUB, z0 = reg.gz0 + sz * SUB;
    editView.fill(x0, z0, SUB);
    const bk = newBuckets();
    meshColumns(editView, bk, x0, x0 + SUB, z0, z0 + SUB, -OXC, -OZC);
    for (const b of bk.list) {
      if (!b.quads) continue;
      const mesh = bucketMesh(b, reg.gx0, reg.gz0);
      mesh.userData.quads = b.quads;
      if (onMesh) onMesh(mesh, false);
      g.add(mesh);
      stats.drawCalls++; stats.quads += b.quads;
    }
    count();
  }

  const api = {
    group, stats, desert: D,
    get radius() { return radius; },
    set radius(r) { radius = r; center = { x: NaN, z: NaN }; },
    set budget(ms) { budget = ms; },
    /** Every frame, with the player's position (grid). */
    update(px, pz) {
      frame++;
      if (!(Math.abs(px - center.x) < 8 && Math.abs(pz - center.z) < 8)) plan(px, pz);
      if (job || queue.length) work(budget);
      // made chunks far away and never edited are forgotten (they are made again, the same, if needed)
      if (frame % 120 === 0) {
        const far = radius + R + keepExtra;
        const n = D.drop((cx, cz) => { const x0 = cx * D.C, z0 = cz * D.C, dx = px < x0 ? x0 - px : px > x0 + D.C ? px - x0 - D.C : 0, dz = pz < z0 ? z0 - pz : pz > z0 + D.C ? pz - z0 - D.C : 0; return Math.hypot(dx, dz) <= far; });
        if (n && opts.onDrop) opts.onDrop();
      }
      return queue.length + (job ? 1 : 0);
    },
    /** Draw everything within the radius of (px, pz) now (the start, a shot, a jump far away). */
    prime(px, pz) { plan(px, pz); work(1e9); return stats; },
    get pending() { return queue.length + (job ? 1 : 0); },
    /** Is region (rx, rz) of R x R columns drawn as blocks? (The far view leaves a hole there.) */
    isLoaded: (rx, rz) => loaded.has(rkey(rx, rz)),
    regions: () => [...loaded.values()],
    REGION: R,
    takeChanged() { const c = changed; changed = false; return c; },
    /**
     * Change one block (grid). Keeps the column tables right (highest block, ground level, whether the column is
     * still untouched loose ground) and marks every piece whose faces, slopes or shading can depend on the change.
     */
    setBlock(x, y, z, id) {
      if (!D.inb(x, y, z)) return false;
      const old = D.get(x, y, z);
      if (old === id) return false;
      D.set(x, y, z, id);
      const rec = D.colRec(x, z), ci = D.ci32(x, z);
      if (id) { if (y > rec.colMax[ci]) rec.colMax[ci] = y; } else if (y === rec.colMax[ci]) { let m = y - 1; while (m >= 0 && !D.get(x, m, z)) m--; rec.colMax[ci] = m; }
      if (rec.nat[ci]) {
        // Untouched loose ground stays sloped only while its own blocks are left alone: a plant coming or going, or
        // something built clear of the surface, does not count as touching it. A touched column becomes cubes; the
        // corner heights stay, so its neighbours keep their slopes.
        const t = rec.top[ci];
        if (!(y > t + 1 || (y > t && (!old || notGround(old)) && (!id || notGround(id))))) rec.nat[ci] = 0;
      }
      if (!rec.nat[ci]) { let m = rec.colMax[ci]; while (m >= 0) { const q = D.get(x, m, z); if (q && !notGround(q)) break; m--; } rec.top[ci] = m; }
      // faces and their shading depend on the cells one step away, so that is how far a change reaches
      for (const gz of [z - 1, z, z + 1]) for (const gx of [x - 1, x, x + 1]) {
        if (gx < 0 || gz < 0) continue;
        const rx = Math.floor(gx / R), rz = Math.floor(gz / R), k = rkey(rx, rz);
        if (job && job.rx === rx && job.rz === rz) { startJob(rx, rz); }      // the region being meshed read the old cells: start it again
        if (loaded.has(k)) dirty.add(k * 16 + ((((gz - rz * R) / SUB) | 0) * NSUB + (((gx - rx * R) / SUB) | 0)));
      }
      return true;
    },
    /** Rebuild the pieces touched since the last call. Returns how many were rebuilt. */
    flush() {
      if (!dirty.size) return 0;
      const n = dirty.size;
      for (const dk of dirty) { const reg = loaded.get(Math.floor(dk / 16)); if (reg) rebuildPiece(reg, dk % 16); }
      dirty.clear();
      stats.rebuilt += n;
      return n;
    },
    liveChunks: () => liveN,
  };
  return api;
}
