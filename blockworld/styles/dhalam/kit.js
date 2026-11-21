// Small modelling kit shared by props and characters: chamfered / tapered boxes with
// world-scaled UVs, cylinders, and a material factory that applies the shared height fog.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch } from './fx.js';

let DETAIL = null;
export function setDetail(d) { DETAIL = d; }

const matCache = new Map();
/**
 * Flat-coloured PBR material with a grey detail texture multiplied in.
 * tex: name of a detail texture ('cloth','leather','iron','fur','bone','feather','wood','shade','plain') or null.
 */
export function mat(color, { tex = 'plain', rough = 0.85, metal = 0, emissive = 0, emissiveIntensity = 1, normalScale = 0.6, flat = false, side = THREE.FrontSide, vc = false, fuzz = 0 } = {}) {
  const key = [color, tex, rough, metal, emissive, emissiveIntensity, normalScale, flat, side, vc, fuzz].join('|');
  let m = matCache.get(key);
  if (m) return m;
  const d = tex && DETAIL ? DETAIL[tex] : null;
  m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat, side, vertexColors: vc });
  if (d) { m.map = d.map; m.normalMap = d.normalMap; m.normalScale = new THREE.Vector2(normalScale, normalScale); }
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity; }
  patch(m, { fuzz });
  matCache.set(key, m);
  return m;
}

/** Planar UVs chosen per vertex by its dominant normal axis, in world units * scale. */
export function projectUV(geo, scale = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const geoCache = new Map();
/**
 * Chamfered box. opts: r (bevel radius), taper [tx, tz] top scale, shear [sx, sz] top offset,
 * uv (texture repeats per unit), anchor 'center' | 'bottom' | 'top'.
 */
export function boxGeo(w, h, d, { r = 0.02, seg = 2, taper = null, shear = null, uv = 1.4, anchor = 'center' } = {}) {
  const key = ['b', w, h, d, r, seg, taper && taper.join(','), shear && shear.join(','), uv, anchor].join('|');
  let g = geoCache.get(key);
  if (g) return g;
  if (Math.max(w, h, d) < 0.3) seg = 1;                 // small parts: one chamfer face is plenty
  const rr = Math.min(r, Math.min(w, h, d) * 0.49);
  g = rr > 0.0005 ? new RoundedBoxGeometry(w, h, d, seg, rr) : new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  if (taper || shear) {
    for (let i = 0; i < p.count; i++) {
      const f = p.getY(i) / h + 0.5;
      let x = p.getX(i), z = p.getZ(i);
      if (taper) { x *= 1 + (taper[0] - 1) * f; z *= 1 + (taper[1] - 1) * f; }
      if (shear) { x += shear[0] * f; z += shear[1] * f; }
      p.setX(i, x); p.setZ(i, z);
    }
  }
  if (anchor === 'bottom') g.translate(0, h / 2, 0);
  else if (anchor === 'top') g.translate(0, -h / 2, 0);
  projectUV(g, uv);
  geoCache.set(key, g);
  return g;
}

export function box(w, h, d, material, opts = {}) {
  const m = new THREE.Mesh(boxGeo(w, h, d, opts), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function cyl(rTop, rBot, h, material, { seg = 8, anchor = 'center', uv = 1.4, open = false } = {}) {
  const key = ['c', rTop, rBot, h, seg, anchor, uv, open].join('|');
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
    if (anchor === 'bottom') g.translate(0, h / 2, 0);
    else if (anchor === 'top') g.translate(0, -h / 2, 0);
    const uvA = g.attributes.uv;
    const circ = Math.PI * (rTop + rBot);
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * circ * uv, uvA.getY(i) * h * uv);
    geoCache.set(key, g);
  }
  const m = new THREE.Mesh(g, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function ball(r, material, { seg = 10, sy = 1, sz = 1 } = {}) {
  const key = ['s', r, seg].join('|');
  let g = geoCache.get(key);
  if (!g) { g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))); geoCache.set(key, g); }
  const m = new THREE.Mesh(g, material);
  m.scale.set(1, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Position / rotate helper: at(mesh, x, y, z, rx, ry, rz) -> mesh */
export function at(o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

export function grp(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}

/** A segment (box) stretched between two points: handy for limbs, poles, antlers. */
export function strut(a, b, thick, material, { taper = 1, r = 0.01, depth = null, uv = 1.4 } = {}) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const m = box(thick, len, depth ?? thick, material, { r, taper: taper === 1 ? null : [taper, taper], uv });
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return m;
}

/** Soft dark blob under a character: grounds it when the sun shadow is weak. */
export function blobShadow(tex, rx, rz, opacity = 0.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), patch(new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(rx * 2, rz * 2, 1);
  m.position.y = 0.03;
  m.renderOrder = 3;
  return m;
}

/**
 * A flat tapered strip (cloth tatter, wing, strap) hanging from `top` to `bottom`, its wide face
 * turned toward `outward`. w0 = width at the top, w1 = width at the bottom.
 */
export function ribbon(top, bottom, w0, w1, thick, outward, material, { uv = 2 } = {}) {
  const a = new THREE.Vector3(...top), b = new THREE.Vector3(...bottom);
  const len = a.distanceTo(b);
  const m = box(w1, len, thick, material, { r: Math.min(0.006, thick * 0.4), taper: [w0 / w1, 1], uv });
  const y = a.clone().sub(b).normalize();
  const z = new THREE.Vector3(...outward);
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  return m;
}

/** Orient an object so its local +Y runs along `dir` and its local +X leans toward `xHint`. */
export function aim(o, dir, xHint) {
  const y = new THREE.Vector3(...dir).normalize();
  const x = new THREE.Vector3(...xHint);
  x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return o;
}

/**
 * Merge every static mesh under `root` into one mesh per material, so a creature made of a
 * hundred boxes costs a handful of draw calls. Groups, sprites and points are left in place
 * (joints keep working as attachment points); sub-trees that were baked already are skipped.
 */
export function bake(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const by = new Map();
  const drop = [];
  const m4 = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.children.length) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.baked) return;
    if (o.userData.bakedMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + (o.castShadow ? '|s' : '|n');
    if (!by.has(key)) by.set(key, { material: o.material, cast: o.castShadow, geos: [] });
    by.get(key).geos.push(g);
    drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  for (const { material, cast, geos } of by.values()) {
    const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], material);
    m.castShadow = cast; m.receiveShadow = true;
    m.userData.bakedMesh = true;
    root.add(m);
  }
  root.userData.baked = true;
  return root;
}

// ---------------------------------------------------------------------------------------------
// Organic shapes: lofted tubes and alpha cards (fur locks, cloth tatters)
// ---------------------------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/**
 * A tube lofted through elliptical rings: rings = [{ p: [x, y, z], rx, ry, ryB? }] in path order.
 * rx lies along cross(up, tangent), ry along the other axis (ryB = radius on the negative side,
 * for keeled cross-sections such as a deep chest). Smooth normals, no visible joints.
 */
export class Loft {
  constructor(rings, { seg = 10, up = [0, 1, 0] } = {}) {
    this.rings = rings; this.seg = seg;
    const upv = new THREE.Vector3(...up);
    this.frames = rings.map((r, i) => {
      const a = new THREE.Vector3(...rings[Math.max(0, i - 1)].p), b = new THREE.Vector3(...rings[Math.min(rings.length - 1, i + 1)].p);
      const t = b.sub(a).normalize();
      let side = new THREE.Vector3().crossVectors(upv, t);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const v = new THREE.Vector3().crossVectors(t, side).normalize();
      return { p: new THREE.Vector3(...r.p), t, side, v };
    });
  }
  /** Point on the surface at ring coordinate s (0 .. rings - 1, fractional) and angle a. */
  at(s, a) {
    const n = this.rings.length;
    s = Math.min(n - 1, Math.max(0, s));
    const i = Math.min(n - 2, Math.floor(s)), f = s - i;
    const R0 = this.rings[i], R1 = this.rings[i + 1], F0 = this.frames[i], F1 = this.frames[i + 1];
    const ca = Math.cos(a), sa = Math.sin(a);
    const ry0 = sa < 0 && R0.ryB !== undefined ? R0.ryB : R0.ry, ry1 = sa < 0 && R1.ryB !== undefined ? R1.ryB : R1.ry;
    const rx = R0.rx + (R1.rx - R0.rx) * f, ry = ry0 + (ry1 - ry0) * f;
    const side = _a.copy(F0.side).lerp(F1.side, f).normalize(), v = _b.copy(F0.v).lerp(F1.v, f).normalize();
    const p = new THREE.Vector3().copy(F0.p).lerp(F1.p, f).addScaledVector(side, rx * ca).addScaledVector(v, ry * sa);
    const nrm = new THREE.Vector3().addScaledVector(side, ca / Math.max(rx, 1e-4)).addScaledVector(v, sa / Math.max(ry, 1e-4)).normalize();
    const t = new THREE.Vector3().copy(F0.t).lerp(F1.t, f).normalize();
    return { p, n: nrm, t };
  }
  /** colorAt(pos, ringIndex, angle) -> [r, g, b] (linear) gives per-vertex colour. */
  geometry({ uv = 1.4, colorAt = null, caps = true } = {}) {
    const { rings, frames, seg } = this;
    const pos = [], uvs = [], col = [], idx = [];
    let len = 0;
    const circ = Math.PI * 2 * Math.max(...rings.map((r) => (r.rx + r.ry) / 2));
    for (let i = 0; i < rings.length; i++) {
      if (i) len += frames[i].p.distanceTo(frames[i - 1].p);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const { p } = this.at(i, a);
        pos.push(p.x, p.y, p.z);
        uvs.push((k / seg) * Math.max(1, Math.round(circ * uv)), len * uv);
        if (colorAt) col.push(...colorAt(p, i, a));
      }
    }
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) {
      const p0 = i * (seg + 1) + k, p1 = p0 + seg + 1;
      idx.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1);
    }
    if (caps) {
      for (const end of [0, rings.length - 1]) {
        const c = pos.length / 3, F = frames[end];
        pos.push(F.p.x, F.p.y, F.p.z); uvs.push(0.5, end ? len * uv : 0);
        if (colorAt) col.push(...colorAt(F.p, end, 0));
        for (let k = 0; k < seg; k++) {
          const p0 = end * (seg + 1) + k;
          if (end) idx.push(p0, p0 + 1, c); else idx.push(p0 + 1, p0, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (colorAt) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // weld the normals across the uv seam
    const nA = g.attributes.normal;
    for (let i = 0; i < rings.length; i++) {
      const p0 = i * (seg + 1), p1 = p0 + seg;
      _c.set(nA.getX(p0) + nA.getX(p1), nA.getY(p0) + nA.getY(p1), nA.getZ(p0) + nA.getZ(p1)).normalize();
      nA.setXYZ(p0, _c.x, _c.y, _c.z); nA.setXYZ(p1, _c.x, _c.y, _c.z);
    }
    return g;
  }
}

/** Collects alpha cards (quads with custom normals and vertex colours) into one geometry. */
export class Cards {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  /**
   * A card rooted at P on a surface with normal N, lying along the flow direction F.
   * w0 / w1 = width at the root / tip; c0 / c1 = colour at the root / tip; uvx = [u0, u1] picks a
   * slice of the texture (root is v = 1, tip is v = 0); bend adds a middle row pushed along N.
   */
  add(P, N, F, len, w0, w1, c0, c1 = c0, { uvx = [0, 1], bend = 0, twist = 0, v0 = 1, v1 = 0 } = {}) {
    const n = _a.set(N.x, N.y, N.z).normalize().clone();
    const f = new THREE.Vector3(F.x, F.y, F.z).normalize();
    const w = new THREE.Vector3().crossVectors(n, f);
    if (w.lengthSq() < 1e-6) w.set(1, 0, 0);
    w.normalize();
    const rows = bend || twist ? 3 : 2;
    const base = this.pos.length / 3;
    for (let r = 0; r < rows; r++) {
      const t = r / (rows - 1);
      const ww = (w0 + (w1 - w0) * t) / 2;
      const wd = twist ? w.clone().applyAxisAngle(f, twist * t) : w;
      const c = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
      const off = bend * Math.sin(t * Math.PI);
      for (const sg of [-1, 1]) {
        this.pos.push(P.x + f.x * len * t + wd.x * ww * sg + n.x * off, P.y + f.y * len * t + wd.y * ww * sg + n.y * off, P.z + f.z * len * t + wd.z * ww * sg + n.z * off);
        const nn = twist ? n.clone().applyAxisAngle(f, twist * t) : n;
        this.nor.push(nn.x, nn.y, nn.z);
        this.uv.push(sg < 0 ? uvx[0] : uvx[1], v0 + (v1 - v0) * t);
        this.col.push(c[0], c[1], c[2]);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      const a = base + r * 2;
      this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      // both windings with the same normals: a lock or a tatter is lit alike from either side
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, material);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.bakedMesh = true;
    return m;
  }
}

/** Material for alpha cards: cut-out, two-sided, tinted by vertex colour. */
export function cardMat(tex, { rough = 1, fuzz = 0, color = 0xffffff } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, color, roughness: rough, alphaTest: 0.5, alphaToCoverage: true, side: THREE.FrontSide, vertexColors: true });
  patch(m, { fuzz });
  return m;
}

/** Merge lofts (BufferGeometries with position / normal / uv / color) into one mesh that bake() leaves alone. */
export function mergedMesh(geos, material) {
  const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], material);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.bakedMesh = true;
  return m;
}
