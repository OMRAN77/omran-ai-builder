// Modelling kit for the cast: painted cloth / fur / chitin textures made with the same gradient + grain
// generator as the block tiles, bevelled boxes with smooth edge normals, and lofted skins (rings along a
// spine) for bodies, limbs and drapery. Everything is merged to one mesh per material per character.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from './atmo.js';
import { paint, base, hex, mul, mix3, pv, pfbm, sstep, glowTexture } from './tiles.js';
import { hash3 } from '../../shared/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export { V3 };

// ---------------------------------------------------------------- painted surfaces
const R = { repeat: true };
export const SURF = {
  linen: (col, seed) => paint(128, (u, t) => {
    const c = base(col, u, t, { seed, blotch: 0.09, grain: 0.03, grad: 0, edge: 0, streakX: 2, streakY: 2 });
    const warp = pv(u, t, 64, 4, seed + 1) - 0.5, weft = pv(u, t, 4, 64, seed + 2) - 0.5;
    const wv = Math.sin(u * 6.2832 * 32) * Math.sin(t * 6.2832 * 32) * 0.03;
    return mul(c, 1 + 0.08 * warp + 0.08 * weft + wv);
  }, null, R),
  wool: (col, seed) => paint(128, (u, t) => {
    const c = base(col, u, t, { seed, blotch: 0.14, grain: 0.06, grad: 0, edge: 0, streakX: 3, streakY: 2 });
    const rib = pv(u, t, 56, 2, seed + 1) - 0.5, nap = pv(u, t, 90, 14, seed + 2) - 0.5;
    return mul(c, 1 + 0.22 * rib + 0.12 * nap);
  }, null, R),
  fur: (col, seed, amt = 1) => paint(128, (u, t) => {
    const c = base(col, u, t, { seed, blotch: 0.10, grain: 0.02, grad: 0, edge: 0, streakX: 3, streakY: 2 });
    const a = pv(u, t, 44, 5, seed + 1) - 0.5, b = pv(u, t, 96, 11, seed + 2) - 0.5;
    return mul(c, 1 + amt * (0.16 * a + 0.12 * b));
  }, null, R),
  chitin: (col, seed) => paint(128, (u, t) => {
    const c = base(col, u, t, { seed, blotch: 0.16, grain: 0.03, grad: 0, edge: 0, streakX: 2, streakY: 5 });
    const pit = pv(u, t, 22, 22, seed + 1), sheen = pfbm(u, t, 2, 7, 2, seed + 2), ridge = Math.sin(t * 6.2832 * 9 + 2.5 * pv(u, t, 3, 3, seed + 3));
    let k = 0.82 + 0.34 * sheen + 0.035 * ridge;
    if (pit > 0.86) k *= 0.80;
    return mul(c, k);
  }, null, R),
  leather: (col, seed) => paint(128, (u, t) => {
    const c = base(col, u, t, { seed, blotch: 0.12, grain: 0.04, grad: 0, edge: 0 });
    const peb = pv(u, t, 40, 40, seed + 1), crease = Math.abs(pfbm(u, t, 4, 4, 3, seed + 2) - 0.5);
    return mul(c, (0.90 + 0.18 * peb) * (0.80 + 0.20 * sstep(0.0, 0.03, crease)));
  }, null, R),
  skin: (col, seed) => paint(64, (u, t) => base(col, u, t, { seed, blotch: 0.07, grain: 0.02, grad: 0, edge: 0 }), null, R),
  steel: (col, seed) => paint(128, (u, t) => {
    const c = base(col, u, t, { seed, blotch: 0.14, grain: 0.05, grad: 0, edge: 0 });
    const ham = pv(u, t, 11, 11, seed + 1), scr = pv(u, t, 3, 60, seed + 2);
    let k = 0.84 + 0.30 * ham;
    if (scr > 0.82) k *= 1.16;
    return mul(c, k);
  }, null, R),
  wood: (col, seed) => paint(128, (u, t) => {
    const c = base(col, u, t, { seed, blotch: 0.10, grain: 0.04, grad: 0, edge: 0, streakX: 10, streakY: 2 });
    const g = pv(u, t, 36, 2, seed + 1) - 0.5, g2 = pv(u, t, 80, 3, seed + 2) - 0.5;
    return mul(c, 1 + 0.26 * g + 0.12 * g2);
  }, null, R),
  // wind-carved sandstone: fine lamination across the grain, pits, pale wind polish
  sandstone: (col, seed) => paint(128, (u, t) => {
    const wob = (pv(u, 0.5, 4, 1, seed + 3) - 0.5) * 0.08;
    const c = base(col, u, t + wob, { seed, blotch: 0.10, grain: 0.04, grad: 0, edge: 0, streakX: 2, streakY: 7 });
    const lam = pv(0.5, t + wob, 1, 12, seed + 1), pit = pv(u, t, 18, 18, seed + 2);
    let k = 0.80 + 0.36 * lam;
    if (pit > 0.87) k *= 0.82;
    return mul(c, k);
  }, null, R),
  feather: (col, col2, seed) => paint(128, (u, t) => {
    // overlapping rows of pale-edged feathers
    const rows = 7, row = Math.floor(t * rows), ft = t * rows - row;
    const uu = u * 6 + (row % 2) * 0.5, fu = uu - Math.floor(uu);
    const d = Math.hypot((fu - 0.5) * 1.3, ft - 0.15);
    const c = base(mix3(col, col2, sstep(0.50, 0.72, d)), u, t, { seed, blotch: 0.08, grain: 0.03, grad: 0, edge: 0 });
    return mul(c, 0.86 + 0.22 * (1 - ft));
  }, null, R),
  shemagh: () => paint(256, (u, t) => {
    const n = 16, x = u * n, y = t * n, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const white = [0.86, 0.82, 0.74], red = [0.52, 0.16, 0.13];
    let k = 0;
    if ((ix + iy) % 2 === 0) k = (fx > 0.14 && fx < 0.86 && fy > 0.14 && fy < 0.86) ? 1 : 0;
    else k = (Math.abs(fx - 0.5) < 0.11 || Math.abs(fy - 0.5) < 0.11) ? 0.85 : 0;
    const c = mix3(white, red, k);
    const th = 0.92 + 0.10 * pv(u, t, 128, 8, 5) + 0.06 * (pv(u, t, 3, 3, 9) - 0.5);
    return mul(c, th);
  }, null, R),
  // sand in the air: opaque at the top of the strip, breaking into streaks toward the bottom
  sandFlow: (col, seed, ribbon) => paint(128, (u, t) => {
    // fine streaks running down the strip, thinning into separate threads, with a grainy break-up
    const st = pv(u, t, 26, 2, seed), st2 = pv(u, t, 64, 3, seed + 4), gr = pv(u, t, 128, 128, seed + 7);
    const c = mul(col, 0.62 + 0.30 * st + 0.22 * st2);
    const fall = sstep(0.06, 0.95, t);
    let a = (1 - Math.pow(fall, 1.6)) * sstep(0.18 + 0.50 * fall, 0.46 + 0.50 * fall, 0.55 * st + 0.45 * st2) * (0.55 + 0.6 * gr);
    a = Math.max(a, (1 - sstep(0.0, 0.16, t)) * (ribbon ? 0.8 : 1));
    a = Math.min(1, a) * (ribbon ? 0.62 : 0.85);
    if (ribbon) a *= sstep(0.0, 0.35, Math.min(u, 1 - u));
    return [c[0], c[1], c[2], a];
  }, null, {}),
};

const _mats = new Map();
/** A painted, rim-lit Lambert material. tile = texture repeats per metre. */
export function surf(key, make, o = {}) {
  if (_mats.has(key)) return _mats.get(key);
  const m = patchMaterial(new THREE.MeshLambertMaterial({
    map: make(), vertexColors: true, side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    transparent: !!o.alpha, depthWrite: !o.alpha, alphaTest: o.alpha ? 0.03 : 0,
  }), { rim: o.rim ?? 1 });
  m.userData.tile = o.tile ?? 2;
  m.userData.soft = !!o.alpha;
  _mats.set(key, m);
  return m;
}
export function glowMat(key, r, g, b) {
  if (_mats.has(key)) return _mats.get(key);
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), fog: false });
  m.userData.tile = 1;
  _mats.set(key, m);
  return m;
}
let _glow = null;
export function glowSprite(color, scale, opacity = 1) {
  if (!_glow) _glow = glowTexture();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: _glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
  s.scale.setScalar(scale);
  s.renderOrder = 6;
  return s;
}

// ---------------------------------------------------------------- bevelled box
const bits = (s) => (s[0] > 0 ? 1 : 0) + (s[1] > 0 ? 2 : 0) + (s[2] > 0 ? 4 : 0);
/** Box with chamfered edges. Each flat face keeps its own normal and the bevels blend between them,
 *  so the form shades like a rounded solid. deform(p: number[3]) may reshape it (taper, shear). */
export function cboxGeo(w, h, d, r, deform, tile = 2) {
  const H = [w / 2, h / 2, d / 2];
  r = Math.max(0, Math.min(r, H[0] * 0.92, H[1] * 0.92, H[2] * 0.92));
  const pos = [], uvs = [], nrm = [], idx = [];
  for (let a = 0; a < 3; a++) for (let c = 0; c < 8; c++) {
    const s = [c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1];
    const p = [0, 0, 0];
    for (let k = 0; k < 3; k++) p[k] = s[k] * (k === a ? H[k] : H[k] - r);
    pos.push(p[0], p[1], p[2]);
    nrm.push(a === 0 ? s[0] : 0, a === 1 ? s[1] : 0, a === 2 ? s[2] : 0);
    uvs.push((a === 0 ? p[2] : p[0]) * tile + 0.5, (a === 1 ? p[2] : p[1]) * tile + 0.5);
  }
  const P = (i) => V3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const poly = (ids, out) => {
    const a = P(ids[0]), n = P(ids[1]).sub(a).cross(P(ids[2]).sub(a));
    if (n.x * out[0] + n.y * out[1] + n.z * out[2] < 0) ids.reverse();
    for (let k = 1; k < ids.length - 1; k++) idx.push(ids[0], ids[k], ids[k + 1]);
  };
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const sa of [-1, 1]) {
      const mk = (sb, sc) => { const g = [0, 0, 0]; g[a] = sa; g[b] = sb; g[c] = sc; return a * 8 + bits(g); };
      const out = [0, 0, 0]; out[a] = sa;
      poly([mk(-1, -1), mk(1, -1), mk(1, 1), mk(-1, 1)], out);
      if (r > 0) for (const sb of [-1, 1]) {
        const v = (face, sc) => { const g = [0, 0, 0]; g[a] = sa; g[b] = sb; g[c] = sc; return face * 8 + bits(g); };
        const o2 = [0, 0, 0]; o2[a] = sa; o2[b] = sb;
        poly([v(a, -1), v(a, 1), v(b, 1), v(b, -1)], o2);
      }
    }
  }
  if (r > 0) for (let c = 0; c < 8; c++) poly([c, 8 + c, 16 + c], [c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1]);
  if (deform) {
    const p = [0, 0, 0];
    for (let i = 0; i < 24; i++) { p[0] = pos[i * 3]; p[1] = pos[i * 3 + 1]; p[2] = pos[i * 3 + 2]; deform(p); pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; }
    for (let a = 0; a < 3; a++) for (const sa of [-1, 1]) {
      const b = (a + 1) % 3, c = (a + 2) % 3;
      const mk = (sb, sc) => { const g = [0, 0, 0]; g[a] = sa; g[b] = sb; g[c] = sc; return a * 8 + bits(g); };
      const q = [mk(-1, -1), mk(1, -1), mk(1, 1), mk(-1, 1)];
      const n = P(q[2]).sub(P(q[0])).cross(P(q[3]).sub(P(q[1]))).normalize();
      if ((a === 0 ? n.x : a === 1 ? n.y : n.z) * sa < 0) n.negate();
      for (const i of q) { nrm[i * 3] = n.x; nrm[i * 3 + 1] = n.y; nrm[i * 3 + 2] = n.z; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- lofted skin
/**
 * rings: [{ p: [x, y, z], rx, ry, ryB?, n?, gap? }]  rx = half width, ry = half size toward the frame's
 * "top" (ryB toward its underside), n = superellipse exponent (2 round .. 5 boxy), gap = opening angle.
 * The first frame's top is opts.up projected off the spine (default +Y, or +Z for vertical spines) and is
 * then carried along the spine. opts: seg, tile, fit (uv 0..1 over the whole skin), cap0, cap1, gapAt.
 */
export function loftGeo(rings, o = {}) {
  const S = o.seg ?? 12, tile = o.tile ?? 2, n = rings.length;
  const P = rings.map((q) => V3(q.p[0], q.p[1], q.p[2]));
  const hasGap = rings.some((q) => q.gap);
  const at = o.gapAt ?? (hasGap ? Math.PI / 2 : -Math.PI / 2);
  const pos = [], uvs = [], idx = [];
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + P[i].distanceTo(P[i - 1]));
  const total = Math.max(1e-6, lens[n - 1]);
  let avg = 0; for (const q of rings) avg += (q.rx + q.ry) / 2; avg /= n;
  const uRep = Math.max(1, Math.round(2 * Math.PI * avg * tile));
  let side = null;
  const t = V3(0, 0, 0), upv = V3(0, 0, 0);
  for (let i = 0; i < n; i++) {
    t.copy(P[Math.min(i + 1, n - 1)]).sub(P[Math.max(i - 1, 0)]).normalize();
    if (!side) {
      // upright spines put their "top" toward +Z (the front of the model), level ones toward +Y
      const up = V3(...(o.up ?? (Math.abs(t.y) > 0.5 ? [0, 0, 1] : [0, 1, 0])));
      if (Math.abs(t.dot(up)) > 0.92) up.set(0, 0, 1);
      side = up.clone().cross(t).normalize();
    } else side.addScaledVector(t, -side.dot(t)).normalize();
    upv.copy(t).cross(side);
    const q = rings[i], e = 2 / (q.n ?? o.n ?? 2.3), g = q.gap ?? 0;
    for (let k = 0; k <= S; k++) {
      const th = at + g / 2 + (k / S) * (2 * Math.PI - g);
      const c = Math.cos(th), s = Math.sin(th);
      const a = q.rx * Math.sign(c) * Math.pow(Math.abs(c), e), b = (s >= 0 ? q.ry : (q.ryB ?? q.ry)) * Math.sign(s) * Math.pow(Math.abs(s), e);
      pos.push(P[i].x + side.x * a + upv.x * b, P[i].y + side.y * a + upv.y * b, P[i].z + side.z * a + upv.z * b);
      if (o.fit) uvs.push(k / S, lens[i] / total); else uvs.push((k / S) * uRep, lens[i] * tile);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < S; k++) {
    const a = i * (S + 1) + k, b = a + 1, c = a + S + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const cap = (i, flip) => {
    const ci = pos.length / 3;
    pos.push(P[i].x, P[i].y, P[i].z); uvs.push(0.5, o.fit ? lens[i] / total : lens[i] * tile);
    for (let k = 0; k < S; k++) { const a = i * (S + 1) + k; if (flip) idx.push(ci, a + 1, a); else idx.push(ci, a, a + 1); }
  };
  if (o.cap0 !== false && !rings[0].gap) cap(0, true);
  if (o.cap1 !== false && !rings[n - 1].gap) cap(n - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // close the shading seam where a ring wraps onto itself
  const N = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    if (rings[i].gap) continue;
    const a = i * (S + 1), b = a + S;
    const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1;
    N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}
/** point on a ring's rim at parameter angle th, for trims that follow an edge (vertical spines only) */
export function rimPoint(q, th) {
  const e = 2 / (q.n ?? 2.3), c = Math.cos(th), s = Math.sin(th);
  return [q.p[0] + q.rx * Math.sign(c) * Math.pow(Math.abs(c), e), q.p[1], q.p[2] + (s >= 0 ? q.ry : (q.ryB ?? q.ry)) * Math.sign(s) * Math.pow(Math.abs(s), e)];
}

/** two-bone IK: where the elbow / knee sits between a and b */
export function bend(a, b, l1, l2, pole) {
  const d = b.clone().sub(a);
  const L = Math.min(d.length(), (l1 + l2) * 0.999);
  const nrm = d.normalize();
  const k = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, l1 * l1 - k * k));
  const p = V3(pole[0], pole[1], pole[2]); p.addScaledVector(nrm, -p.dot(nrm)).normalize();
  return a.clone().addScaledVector(nrm, k).addScaledVector(p, h);
}

// ---------------------------------------------------------------- the rig
export class Rig {
  constructor() { this.buckets = new Map(); this.stack = [new THREE.Matrix4()]; this.extras = []; }
  get m() { return this.stack[this.stack.length - 1]; }
  /** enter a joint: translate then rotate (YXZ order, radians) */
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
    const t = new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(s, s, s));
    this.stack.push(this.m.clone().multiply(t));
    return this;
  }
  /** enter a frame at `from` whose +Y points along `dir`, then turned by `roll` about that axis */
  aim(from, dir, roll = 0) {
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
    if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), roll));
    const t = new THREE.Matrix4().compose(from, q, V3(1, 1, 1));
    this.stack.push(this.m.clone().multiply(t));
    return this;
  }
  pop(n = 1) { for (let i = 0; i < n; i++) this.stack.pop(); return this; }
  world(x = 0, y = 0, z = 0) { return V3(x, y, z).applyMatrix4(this.m); }
  /** grad: darkening toward the bottom of the piece (0..1). col: optional [r, g, b] tint. */
  add(mat, g, grad = 0, col = null) {
    g.computeBoundingBox();
    const p = g.attributes.position, bb = g.boundingBox, h = Math.max(1e-5, bb.max.y - bb.min.y);
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const k = 1 - grad * (1 - (p.getY(i) - bb.min.y) / h);
      c[i * 3] = k * (col ? col[0] : 1); c[i * 3 + 1] = k * (col ? col[1] : 1); c[i * 3 + 2] = k * (col ? col[2] : 1);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.applyMatrix4(this.m);
    const ng = g.index ? g.toNonIndexed() : g;
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(ng);
    return this;
  }
  _place(g, x, y, z, rx, ry, rz) {
    if (rx || ry || rz) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
    g.translate(x, y, z);
    return g;
  }
  _r(w, h, d, r) { return r ?? Math.min(0.035, 0.22 * Math.min(w, h, d)); }
  box(mat, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, grad = 0, col = null, r = undefined) {
    return this.add(mat, this._place(cboxGeo(w, h, d, this._r(w, h, d, r), null, mat.userData.tile), x, y, z, rx, ry, rz), grad, col);
  }
  /** box whose top face is scaled (sx, sz) and shifted (ox, oz) */
  tbox(mat, w, h, d, sx, sz, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, grad = 0, ox = 0, oz = 0, col = null, r = undefined) {
    const g = cboxGeo(w, h, d, this._r(w, h, d, r), (p) => { const f = p[1] / h + 0.5; p[0] = p[0] * (1 + (sx - 1) * f) + ox * f; p[2] = p[2] * (1 + (sz - 1) * f) + oz * f; }, mat.userData.tile);
    return this.add(mat, this._place(g, x, y, z, rx, ry, rz), grad, col);
  }
  cyl(mat, rt, rb, h, seg, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, grad = 0, col = null) {
    return this.add(mat, this._place(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz), grad, col);
  }
  /** limb segment hanging from the current joint along -Y, tapered toward the far end */
  seg(mat, w, len, d, sx = 1, sz = 1, grad = 0, col = null) {
    const g = cboxGeo(w, len, d, this._r(w, len, d), (p) => { const f = 0.5 - p[1] / len; p[0] *= 1 + (sx - 1) * f; p[2] *= 1 + (sz - 1) * f; }, mat.userData.tile);
    g.translate(0, -len / 2, 0);
    return this.add(mat, g, grad, col);
  }
  /** segment running from the current joint along +Z, tapered toward the far end */
  zseg(mat, w, h, len, sx = 1, sy = 1, grad = 0, y0 = 0, col = null) {
    const g = cboxGeo(w, h, len, this._r(w, h, len), (p) => { const f = p[2] / len + 0.5; p[0] *= 1 + (sx - 1) * f; p[1] *= 1 + (sy - 1) * f; }, mat.userData.tile);
    g.translate(0, y0, len / 2);
    return this.add(mat, g, grad, col);
  }
  loft(mat, rings, o = {}, grad = 0, col = null) {
    return this.add(mat, loftGeo(rings, { tile: mat.userData.tile, ...o }), grad, col);
  }
  /** a tapered round limb through points: pts = [[x, y, z, r], ...] */
  tube(mat, pts, o = {}, grad = 0, col = null) {
    return this.loft(mat, pts.map((q) => ({ p: [q[0], q[1], q[2]], rx: q[3], ry: q[4] ?? q[3] })), { seg: 8, ...o }, grad, col);
  }
  build(name) {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, geos] of this.buckets) {
      const geo = mergeGeometries(geos);
      if (!mat.isMeshBasicMaterial) {
        // undersides sit in their own shade: a cheap stand-in for ambient occlusion
        const N = geo.attributes.normal, C = geo.attributes.color;
        for (let i = 0; i < N.count; i++) {
          const k = 0.74 + 0.26 * sstep(-0.85, 0.25, N.getY(i));
          C.setXYZ(i, C.getX(i) * k, C.getY(i) * k, C.getZ(i) * k);
        }
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !mat.isMeshBasicMaterial && !mat.userData.soft;
      mesh.receiveShadow = !mat.isMeshBasicMaterial && !mat.userData.soft;
      if (mat.userData.soft) mesh.renderOrder = 3;
      group.add(mesh);
    }
    for (const e of this.extras) group.add(e);
    return group;
  }
}
export { hex, mul, mix3, hash3 };
