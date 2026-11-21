// Pines: the trunk is made of ordinary log blocks (you chop it block by block); the boughs are a
// light prop on top of it: stacked, drooping, star-edged skirts with a needle texture.
// A whole forest is merged into a handful of meshes (about 200 triangles per tree).

import * as THREE from 'three';
import { patch } from './fx.js';
import { mulberry32 } from './texgen.js';

function addPine(buf, tr) {
  const rnd = mulberry32(tr.seed * 7919 + 13);
  const cx = tr.x + 0.5 + (rnd() - 0.5) * 0.2, cz = tr.z + 0.5 + (rnd() - 0.5) * 0.2;
  const h = tr.h;
  const top = tr.g + 1 + h + 0.6;
  // about one tree in eight has lost its top to wind or rot
  const dead = tr.dead ?? (rnd() < 0.13);
  // lower branches have died off: bare trunk below, so you can see (and be seen) between the trees
  const crown = tr.g + 1 + Math.max(3.3, h * (0.33 + rnd() * 0.1));
  const n = Math.max(5, Math.round(h / 1.75));
  const Rmax = (1.25 + h * 0.135) * (0.8 + rnd() * 0.4);
  const tint = 0.8 + rnd() * 0.36;
  const warm = (rnd() - 0.5) * 0.14;
  const lean = [(rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05];
  const span = top - crown;
  // whorls are never evenly spaced
  const gaps = []; let acc = 0;
  for (let i = 0; i < n; i++) { const w = 0.65 + rnd() * 0.7; gaps.push(w); acc += w; }
  let t = 0;
  for (let i = 0; i < n; i++) {
    const t0 = t; t += gaps[i] / acc;
    const skip = i > 1 && i < n - 1 && rnd() < 0.1;                 // a whorl is missing here and there
    const low = i < 2;
    const lobes = low ? 3 + Math.floor(rnd() * 2) : 5 + Math.floor(rnd() * 3);
    const jit = 0.76 + rnd() * 0.48;
    const ox = (rnd() - 0.5) * 0.34, oz = (rnd() - 0.5) * 0.34;
    const tw = rnd() * Math.PI * 2;
    const reach = 1.8 + rnd() * 0.9;
    if (skip || (dead && t0 > 0.66)) { for (let k = 0; k < lobes * 4; k++) rnd(); continue; }
    const yb = crown + span * t0;
    let Rb = (Rmax * Math.pow(1 - t0, 0.9) + 0.3) * jit;
    if (low) Rb *= 0.66;                                            // the lowest whorls are thin and half dead
    const yt = Math.min(top - 0.15, yb + (span / n) * reach);
    const Rt = Math.max(0.05, Rb * 0.09);
    const shade = (0.46 + 0.54 * Math.pow((i + 1) / n, 0.8)) * tint * (low ? 0.82 : 1);
    const SEG = lobes * 2;
    const uRep = Math.max(2, Math.round((Math.PI * 2 * Rb) / 3.4));
    const base = buf.pos.length / 3;
    const hgt = yt - yb;
    const lx = cx + ox + lean[0] * (yb - tr.g), lz = cz + oz + lean[1] * (yb - tr.g);
    let r0 = 0, d0 = 0, s0 = 0;
    for (let k = 0; k <= SEG; k++) {
      const tip = k % 2 === 0;
      // each bough reaches out and droops; between two boughs the skirt folds back toward the trunk
      let r = Rb * (tip ? 0.92 + rnd() * 0.42 : 0.3 + rnd() * 0.2);
      let dy = tip ? -(0.35 + rnd() * 0.6) * Math.min(1.25, Rb / 1.6) : (0.12 + rnd() * 0.3) * Math.min(1, Rb / 2);
      let sh = shade * (tip ? 0.95 + rnd() * 0.3 : 0.52 + rnd() * 0.14);
      rnd();
      if (k === 0) { r0 = r; d0 = dy; s0 = sh; }
      if (k === SEG) { r = r0; dy = d0; sh = s0; }
      const a = tw + (k / SEG) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      buf.pos.push(lx + ca * r, yb + dy, lz + sa * r);
      buf.pos.push(lx + ca * Rt, yt, lz + sa * Rt);
      const ny = (Rb - Rt) * 0.55;
      const il = 1 / Math.hypot(hgt, ny);
      buf.nor.push(ca * hgt * il, ny * il, sa * hgt * il, ca * hgt * il, ny * il, sa * hgt * il);
      buf.uv.push((k / SEG) * uRep, 0.02, (k / SEG) * uRep, 0.98);
      const s1 = shade * 0.8;
      buf.col.push(sh * (1 + warm), sh, sh * (1 - warm), s1 * (1 + warm), s1, s1 * (1 - warm));
      if (k < SEG) {
        const b = base + k * 2;
        buf.idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
      }
    }
  }
  const lx = cx + lean[0] * (top - tr.g), lz = cz + lean[1] * (top - tr.g);
  if (!dead) {
    // the leader: every living pine ends in a slender point
    const LS = 6, yb = top - 1.5, yt = top + 0.85 + rnd() * 0.5, Rb = 0.42 + rnd() * 0.12;
    const base = buf.pos.length / 3, tw = rnd() * 6.28, sh = tint * 0.98;
    for (let k = 0; k <= LS; k++) {
      const a = tw + (k / LS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), r = Rb * (k % 2 ? 0.6 : 1.1);
      buf.pos.push(lx + ca * r, yb - (k % 2 ? 0 : 0.25), lz + sa * r, lx, yt, lz);
      buf.nor.push(ca * 0.94, 0.34, sa * 0.94, ca * 0.94, 0.34, sa * 0.94);
      buf.uv.push((k / LS) * 1, 0.04, (k / LS) * 1, 0.98);
      const s0 = sh * (k % 2 ? 0.7 : 1.05);
      buf.col.push(s0 * (1 + warm), s0, s0 * (1 - warm), sh * (1 + warm), sh, sh * (1 - warm));
      if (k < LS) { const b = base + k * 2; buf.idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); }
    }
  }
  // thin upper trunk inside the boughs (the lower trunk is voxel logs); a dead top stands bare
  const y0 = tr.trunkTop, y1 = dead ? crown + span * (0.78 + rnd() * 0.12) : top - 0.4, r0 = 0.3;
  const base = buf.tpos.length / 3;
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const tx = cx + lean[0] * (y1 - tr.g), tz = cz + lean[1] * (y1 - tr.g);
    buf.tpos.push(cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0, tx + Math.cos(a) * (dead ? 0.07 : 0.04), y1, tz + Math.sin(a) * (dead ? 0.07 : 0.04));
    buf.tnor.push(Math.cos(a), 0.1, Math.sin(a), Math.cos(a), 0.1, Math.sin(a));
  }
  for (let k = 0; k < 4; k++) { const b = base + k * 2, c = base + ((k + 1) % 4) * 2; buf.tidx.push(b, b + 1, c, c, b + 1, c + 1); }
}

export function buildForest(trees, bough, { region = 54 } = {}) {
  const groups = new Map();
  const keyOf = (tr) => Math.floor(tr.x / region) + '|' + Math.floor(tr.z / region);
  for (const tr of trees) {
    if (tr.snag) continue;
    const key = keyOf(tr);
    let g = groups.get(key);
    if (!g) { g = { trees: [], boughs: null, trunks: null }; groups.set(key, g); }
    g.trees.push(tr);
  }
  const root = new THREE.Group();
  root.name = 'forest';
  // no normal map and no shadow lookup on the boughs: they overlap many layers deep, so their
  // pixels must stay cheap; the tier shading is baked into vertex colours instead
  const mat = patch(new THREE.MeshLambertMaterial({ map: bough.map, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, vertexColors: true }));
  const tmat = patch(new THREE.MeshLambertMaterial({ color: 0x241d18 }));
  /** The two merged geometries (boughs, upper trunks) of one region, from the pines still standing in it. */
  const geometries = (g) => {
    const buf = { pos: [], nor: [], uv: [], col: [], idx: [], tpos: [], tnor: [], tidx: [] };
    for (const tr of g.trees) if (!tr.felled) addPine(buf, tr);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    bg.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
    bg.setIndex(buf.idx);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(buf.tpos, 3));
    tg.setAttribute('normal', new THREE.Float32BufferAttribute(buf.tnor, 3));
    tg.setIndex(buf.tidx);
    return [bg, tg, (buf.idx.length + buf.tidx.length) / 3];
  };
  let tris = 0;
  for (const g of groups.values()) {
    const [bg, tg, n] = geometries(g);
    g.boughs = new THREE.Mesh(bg, mat);
    g.boughs.castShadow = true; g.boughs.receiveShadow = false;
    root.add(g.boughs);
    g.trunks = new THREE.Mesh(tg, tmat);
    g.trunks.castShadow = false; g.trunks.receiveShadow = true;
    root.add(g.trunks);
    tris += n;
  }
  return {
    root, tris,
    /** Take one pine's boughs and upper trunk away (its log blocks belong to the world): its region is merged again without it. */
    fell(tr) {
      const g = groups.get(keyOf(tr));
      if (!g || tr.snag || tr.felled) return false;
      tr.felled = true;
      const [bg, tg] = geometries(g);
      g.boughs.geometry.dispose(); g.boughs.geometry = bg;
      g.trunks.geometry.dispose(); g.trunks.geometry = tg;
      return true;
    },
  };
}
