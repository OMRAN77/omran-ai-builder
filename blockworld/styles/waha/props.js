// Non-cube props: date palms, stepped merlons, timber spouts, lanterns, the goat-hair tent,
// fire pit, rugs. All are a few hundred triangles each and share a handful of materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from './atmo.js';
import { PAL, palmFrondTexture, palmTrunkTexture, saduTexture, tentTexture, glowTexture } from './tiles.js';
import { mulberry32 } from '../../shared/noise.js';

const lin = (c, k = 1) => new THREE.Color().setRGB(c[0] * k, c[1] * k, c[2] * k, THREE.SRGBColorSpace);
const lambert = (o, flags = {}) => patchMaterial(new THREE.MeshLambertMaterial(o), flags);

function colorize(geo, col) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function box(w, h, d, x, y, z, col) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
  return col ? colorize(g, col) : g;
}

// ---------- stepped triangular (Najdi-style) merlons: mud brick, only the tip limewashed ----------
export function buildMerlons(list) {
  const adobe = lin(PAL.adobe, 1.0), adobe2 = lin(PAL.adobe, 0.93), tip = lin([0.91, 0.863, 0.776], 0.86);
  const geo = mergeGeometries([
    box(0.98, 0.34, 0.50, 0, 0.17, 0, adobe2),
    box(0.72, 0.30, 0.48, 0, 0.49, 0, adobe),
    box(0.46, 0.28, 0.46, 0, 0.78, 0, adobe),
    box(0.22, 0.14, 0.44, 0, 0.99, 0, adobe),
    box(0.22, 0.13, 0.44, 0, 1.125, 0, tip),
  ]);
  const mat = lambert({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  list.forEach((a, i) => {
    q.setFromAxisAngle(up, a.rot);
    p.set(a.x, a.y, a.z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'merlons';
  return mesh;
}

// ---------- timber: barjeel poles, and tapered water spouts with a run-off stain on the wall ----------
export function buildBeams(list) {
  const g = new THREE.Group(); g.name = 'beams';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
  const mat = lambert({ color: lin(PAL.woodDark, 1.5) });
  const poles = list.filter((a) => !a.spout), spouts = list.filter((a) => a.spout);
  {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 1); geo.translate(0, 0, 0.5);
    const mesh = new THREE.InstancedMesh(geo, mat, poles.length);
    poles.forEach((a, i) => {
      dir.set(a.dx, 0, a.dz).normalize(); q.setFromUnitVectors(zAxis, dir); p.set(a.x, a.y, a.z); s.set(1, 1, a.len ?? 1.5); m.compose(p, q, s); mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  }
  if (spouts.length) {
    // a hollowed half-log: wide at the wall, narrow at the lip, tipped down
    const geo = new THREE.BoxGeometry(0.30, 0.16, 0.85);
    const pp = geo.attributes.position;
    for (let i = 0; i < pp.count; i++) if (pp.getZ(i) > 0) { pp.setX(i, pp.getX(i) * 0.55); pp.setY(i, pp.getY(i) * 0.6 - 0.10); }
    geo.translate(0, 0, 0.42); geo.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(geo, mat, spouts.length);
    const stainTex = (() => {
      const c = document.createElement('canvas'); c.width = 32; c.height = 128;
      const ctx = c.getContext('2d');
      const gr = ctx.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, 'rgba(60,38,24,0.62)'); gr.addColorStop(0.35, 'rgba(70,46,30,0.38)'); gr.addColorStop(1, 'rgba(80,54,36,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(22, 0); ctx.quadraticCurveTo(26, 60, 19, 128); ctx.lineTo(14, 128); ctx.quadraticCurveTo(5, 60, 10, 0); ctx.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const stainGeo = new THREE.PlaneGeometry(0.62, 2.9); stainGeo.translate(0, -1.5, 0.012);
    const stains = new THREE.InstancedMesh(stainGeo, lambert({ map: stainTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), spouts.length);
    spouts.forEach((a, i) => {
      dir.set(a.dx, 0, a.dz).normalize(); q.setFromUnitVectors(zAxis, dir); p.set(a.x, a.y, a.z); s.set(1, 1, 1); m.compose(p, q, s);
      mesh.setMatrixAt(i, m); stains.setMatrixAt(i, m);
    });
    mesh.castShadow = true; mesh.receiveShadow = true; stains.receiveShadow = true;
    g.add(mesh, stains);
  }
  return g;
}

// ---------- date palms ----------
export function buildPalms(list) {
  const trunkGeos = [], frondGeos = [];
  const green = new THREE.Color(1, 1, 1), dead = new THREE.Color(0.86, 0.62, 0.38), young = new THREE.Color(1.1, 1.12, 0.9);
  for (const palm of list) {
    const rnd = mulberry32(palm.seed * 7919 + 13);
    const h = palm.h;
    const leanA = rnd() * Math.PI * 2, leanM = 0.4 + rnd() * 1.3;
    const lx = Math.cos(leanA) * leanM, lz = Math.sin(leanA) * leanM;
    palm.lean = [lx, lz];                                   // where the trunk goes: the game makes it solid
    const at = (t) => new THREE.Vector3(palm.x + lx * t * t, palm.y + h * t, palm.z + lz * t * t);
    const nSeg = Math.max(6, Math.round(h / 0.62));
    for (let i = 0; i < nSeg; i++) {
      const t0 = i / nSeg, t1 = (i + 1) / nSeg;
      const a = at(t0), b = at(t1);
      const r0 = 0.42 - 0.10 * t0 + (i === 0 ? 0.14 : 0), r1 = r0 * 1.0 + 0.06;
      const g = new THREE.CylinderGeometry(r1, r0 * 0.9, a.distanceTo(b) + 0.02, 7, 1, true);
      g.rotateY(rnd() * 6.28);
      const dir = b.clone().sub(a).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.applyQuaternion(q);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      g.translate(mid.x, mid.y, mid.z);
      const shade = 0.82 + 0.3 * rnd();
      colorize(g, new THREE.Color(shade, shade, shade));
      trunkGeos.push(g);
    }
    const top = at(1);
    // crown boss + date bunches
    const boss = new THREE.CylinderGeometry(0.34, 0.46, 0.75, 7);
    boss.translate(top.x, top.y + 0.15, top.z);
    colorize(boss, new THREE.Color(0.8, 0.74, 0.6));
    trunkGeos.push(boss);
    const nb = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < nb; i++) {
      const a = rnd() * 6.28, r = 0.55 + rnd() * 0.25;
      const bunch = new THREE.BoxGeometry(0.24, 0.62, 0.24);
      bunch.translate(top.x + Math.cos(a) * r, top.y - 0.35 - rnd() * 0.25, top.z + Math.sin(a) * r);
      colorize(bunch, new THREE.Color(1.5, 0.78, 0.26));
      bunch.deleteAttribute('uv');
      const uv = new Float32Array(bunch.attributes.position.count * 2).fill(0.5);
      bunch.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      trunkGeos.push(bunch);
    }
    // fronds
    const nF = 17 + Math.floor(rnd() * 5);
    for (let i = 0; i < nF; i++) {
      const az = i * 2.39996 + rnd() * 0.4;
      const tier = i / nF;                                   // 0 = youngest (upright), 1 = oldest (drooping)
      const isDead = tier > 0.86;
      let pitch = THREE.MathUtils.degToRad(isDead ? -35 - rnd() * 25 : 78 - tier * 74 + (rnd() - 0.5) * 10);
      const droop = THREE.MathUtils.degToRad(isDead ? 35 : 60 + tier * 55 + rnd() * 20);
      const len = (isDead ? 2.3 : 3.3 + rnd() * 1.3) * (0.85 + 0.15 * Math.min(1, h / 8));
      const hw = isDead ? 0.5 : 0.72;
      const S = 7;
      const pos = [], uv = [], col = [], idx = [];
      const p = new THREE.Vector3(top.x, top.y + 0.42, top.z);
      const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
      const tint = isDead ? dead : tier < 0.25 ? young : green;
      for (let s = 0; s <= S; s++) {
        const t = s / S;
        const pc = pitch - droop * Math.pow(t, 1.35);
        const dir = new THREE.Vector3(Math.cos(az) * Math.cos(pc), Math.sin(pc), Math.sin(az) * Math.cos(pc));
        const nrm = new THREE.Vector3().crossVectors(side, dir).normalize();   // frond's "up"
        const lift = 0.34 * hw;
        const l = p.clone().addScaledVector(side, hw).addScaledVector(nrm, lift);
        const r = p.clone().addScaledVector(side, -hw).addScaledVector(nrm, lift);
        pos.push(l.x, l.y, l.z, p.x, p.y, p.z, r.x, r.y, r.z);
        uv.push(0, t, 0.5, t, 1, t);
        const sh = 0.82 + 0.18 * t;
        for (let k = 0; k < 3; k++) col.push(tint.r * sh, tint.g * sh, tint.b * sh);
        if (s < S) {
          const b = s * 3;
          idx.push(b, b + 1, b + 3, b + 1, b + 4, b + 3, b + 1, b + 2, b + 4, b + 2, b + 5, b + 4);
        }
        p.addScaledVector(dir, len / S);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      // bias normals upward so both faces of the thin leaf light softly
      const n = g.attributes.normal;
      for (let k = 0; k < n.count; k++) {
        let y = n.getY(k); if (y < 0) { n.setXYZ(k, -n.getX(k), -y, -n.getZ(k)); y = -y; }
        const v = new THREE.Vector3(n.getX(k), n.getY(k) + 0.9, n.getZ(k)).normalize();
        n.setXYZ(k, v.x, v.y, v.z);
      }
      frondGeos.push(g);
    }
  }
  const trunkGeo = mergeGeometries(trunkGeos.map((g) => { const c = g.index ? g.toNonIndexed() : g; return c; }));
  const frondGeo = mergeGeometries(frondGeos);
  const trunk = new THREE.Mesh(trunkGeo, lambert({ map: palmTrunkTexture(), vertexColors: true }));
  const fronds = new THREE.Mesh(frondGeo, lambert({ map: palmFrondTexture(), vertexColors: true, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }));
  trunk.castShadow = fronds.castShadow = true;
  trunk.receiveShadow = true; fronds.receiveShadow = false;
  const g = new THREE.Group(); g.name = 'palms'; g.add(trunk, fronds);
  return g;
}

// ---------- lanterns ----------
const glowTex = { v: null };
export function glowSprite(color, scale, opacity = 1) {
  if (!glowTex.v) glowTex.v = glowTexture();
  const m = new THREE.SpriteMaterial({ map: glowTex.v, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  s.renderOrder = 5;
  return s;
}
export function buildLantern(a) {
  const g = new THREE.Group();
  const brass = lambert({ color: 0x2a2018 });
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.30, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(7.0, 3.4, 1.1), fog: false }));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.2, 4), brass); cap.position.y = 0.26; cap.rotation.y = Math.PI / 4;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), brass); base.position.y = -0.18;
  g.add(core, cap, base);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.32, 0.035), brass); post.position.set(x * 0.125, 0, z * 0.125); g.add(post);
  }
  if (a.wall === 'z') {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.75), brass); arm.position.set(0, 0.62, -0.3); g.add(arm);
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), brass); chain.position.set(0, 0.47, 0); g.add(chain);
  } else if (a.wall === 'hang') {
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.03), brass); chain.position.set(0, 0.68, 0); g.add(chain);
  } else if (a.wall === 'pole') {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.4, 0.09), lambert({ color: lin(PAL.woodDark, 1.4) })); pole.position.set(-0.4, -0.75, 0); g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), brass); arm.position.set(-0.2, 0.44, 0); g.add(arm);
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), brass); chain.position.set(0, 0.36, 0); g.add(chain);
  }
  const glow = glowSprite(new THREE.Color(1.0, 0.55, 0.2), 1.6, 0.9);
  g.add(glow);
  g.position.set(a.x, a.y, a.z);
  g.traverse((o) => { if (o.isMesh && o !== core) o.castShadow = true; });
  const light = new THREE.PointLight(0xffa24a, 0, 22, 1.7);
  light.position.set(a.x, a.y, a.z + (a.wall === 'z' ? 0.25 : 0));
  return { group: g, light, glow, core };
}

// ---------- goat-hair tent ----------
export function buildTent(x0, y0, z0, opts = {}) {
  const W = opts.w ?? 9.5, D = opts.d ?? 4.6;
  const g = new THREE.Group();
  const cloth = lambert({ map: tentTexture(), side: THREE.DoubleSide });
  const nx = 18, nz = 8;
  const poleXs = [0.04, 0.35, 0.65, 0.96];
  const hAt = (u, v) => {
    // v: 0 = open front, 1 = back. Three pole lines; cloth sags between poles.
    const front = 1.85, mid = 2.75, back = 1.25;
    const prof = v < 0.5 ? front + (mid - front) * Math.sin((v / 0.5) * Math.PI / 2) : mid + (back - mid) * (1 - Math.cos(((v - 0.5) / 0.5) * Math.PI / 2));
    let dmin = 1; for (const px of poleXs) dmin = Math.min(dmin, Math.abs(u - px));
    const sag = 0.30 * Math.min(1, dmin / 0.15) * (0.5 + 0.5 * Math.sin(v * Math.PI));
    const edge = 0.18 * Math.pow(Math.abs(u - 0.5) * 2, 3);
    return prof - sag - edge;
  };
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / nz;
    pos.push((u - 0.5) * W, hAt(u, v), (0.5 - v) * D);
    uv.push(u * 3, v * 2);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = i + j * (nx + 1), b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  // back and end walls slope outward to the ground
  const wall = (pts, out) => {
    const base = pos.length / 3;
    pts.forEach(([x, y, z], k) => {
      pos.push(x, y, z, x + out[0] * 0.75, 0, z + out[1] * 0.75);
      uv.push(k / (pts.length - 1) * 3, 0, k / (pts.length - 1) * 3, 0.45);
      if (k < pts.length - 1) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
  };
  const backPts = [], leftPts = [], rightPts = [];
  for (let i = 0; i <= nx; i++) backPts.push([(i / nx - 0.5) * W, hAt(i / nx, 1), -0.5 * D]);
  for (let j = 2; j <= nz; j++) { const v = j / nz; leftPts.push([-0.5 * W, hAt(0, v), (0.5 - v) * D]); rightPts.push([0.5 * W, hAt(1, v), (0.5 - v) * D]); }
  wall(backPts, [0, -1]); wall(leftPts, [-1, 0]); wall(rightPts, [1, 0]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(geo, cloth);
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);
  // poles + guy ropes
  const wood = lambert({ color: lin(PAL.wood, 1.3) });
  const rope = lambert({ color: lin([0.72, 0.64, 0.5]) });
  const stick = (a, b, th, mat) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const m = new THREE.Mesh(new THREE.BoxGeometry(th, len, th), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true;
    g.add(m);
  };
  for (const px of poleXs) for (const [v, extra] of [[0, 0.12], [0.5, 0.12], [1, 0.05]]) {
    const x = (px - 0.5) * W, z = (0.5 - v) * D, h = hAt(px, v) + extra + (v === 0.5 ? 0.3 : 0);
    stick(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, h, z), 0.09, wood);
    if (v === 0) stick(new THREE.Vector3(x, h - 0.1, z), new THREE.Vector3(x + (px - 0.5) * 1.2, 0, z + 2.6), 0.03, rope);
  }
  for (const sx of [-1, 1]) for (const v of [0.15, 0.5, 0.85]) {
    stick(new THREE.Vector3(sx * W * 0.5, hAt(sx < 0 ? 0 : 1, v), (0.5 - v) * D), new THREE.Vector3(sx * (W * 0.5 + 2.4), 0, (0.5 - v) * D * 1.2), 0.03, rope);
  }
  // woven divider curtain inside
  const div = new THREE.Mesh(new THREE.PlaneGeometry(D * 0.86, 1.7), lambert({ map: saduTexture(0), side: THREE.DoubleSide }));
  div.rotation.y = Math.PI / 2; div.position.set(W * 0.16, 0.9, -0.1);
  div.castShadow = true;
  g.add(div);
  g.position.set(x0, y0, z0);
  g.rotation.y = opts.rot ?? 0;
  g.name = 'tent';
  return g;
}

export function buildRug(w, d, variant) {
  const top = lambert({ map: saduTexture(variant) });
  const side = lambert({ color: 0x3a1512 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), [side, side, top, side, side, side]);
  m.receiveShadow = true;
  return m;
}

export function buildCushion(variant, w = 0.9) {
  const mat = lambert({ map: saduTexture(variant) });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, 0.42), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- fire pit with a coffee pot ----------
export function buildFire() {
  const g = new THREE.Group();
  const stone = lambert({ color: lin(PAL.stone, 0.9) });
  const rnd = mulberry32(77);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.34 + rnd() * 0.12, 0.2 + rnd() * 0.1, 0.26 + rnd() * 0.1), stone);
    s.position.set(Math.cos(a) * 0.72, 0.1, Math.sin(a) * 0.72); s.rotation.y = -a + rnd() * 0.5;
    s.castShadow = true; s.receiveShadow = true;
    g.add(s);
  }
  const log = lambert({ color: 0x2a1a10 });
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), log);
    l.position.y = 0.12; l.rotation.y = i * 0.8; l.rotation.z = 0.12; g.add(l);
  }
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.03, 10), lambert({ color: 0x1c1512 })); ash.position.y = 0.02; g.add(ash);
  const flames = new THREE.Group();
  const fm = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false });
  const mk = (r, h, x, z, c) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), fm(c)); f.position.set(x, 0.14 + h / 2, z); f.rotation.y = x * 5; flames.add(f); };
  mk(0.26, 0.75, 0, 0, new THREE.Color(5.0, 1.5, 0.25));
  mk(0.18, 0.55, 0.2, 0.1, new THREE.Color(4.5, 1.2, 0.2));
  mk(0.16, 0.5, -0.18, -0.08, new THREE.Color(4.5, 1.3, 0.2));
  mk(0.13, 0.5, 0.02, 0.0, new THREE.Color(8.0, 4.4, 1.2));
  g.add(flames);
  const glow = glowSprite(new THREE.Color(1.0, 0.45, 0.14), 3.2, 0.9); glow.position.y = 0.55; g.add(glow);
  // dallah (coffee pot) on the stones
  const brass = lambert({ color: lin([0.72, 0.52, 0.22]) });
  const prof = [[0.0, 0], [0.11, 0], [0.13, 0.06], [0.10, 0.16], [0.065, 0.23], [0.075, 0.27], [0.03, 0.33], [0.0, 0.36]].map(([r, y]) => new THREE.Vector2(r, y));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(prof, 8), brass); pot.position.set(1.05, 0.0, 0.25); pot.castShadow = true;
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 4), brass); spout.position.set(1.05 + 0.14, 0.22, 0.25); spout.rotation.z = -1.0; g.add(pot, spout);
  const light = new THREE.PointLight(0xff8a3a, 0, 30, 1.6);
  light.position.set(0, 0.9, 0);
  g.add(light);
  g.name = 'fire';
  return { group: g, light, glow, flames };
}

// ---------- plain pennant on the tower ----------
export function buildFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.4, 0.08), lambert({ color: lin(PAL.woodDark, 1.3) })); pole.position.y = 1.7; g.add(pole);
  const geo = new THREE.PlaneGeometry(1.5, 0.75, 6, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 3.2) * 0.12 * (x + 0.75)); p.setY(i, p.getY(i) * (1 - (x + 0.75) * 0.22) - (x + 0.75) * 0.1); }
  geo.computeVertexNormals();
  const cloth = new THREE.Mesh(geo, lambert({ color: lin([0.48, 0.12, 0.09]), side: THREE.DoubleSide }));
  cloth.position.set(0.8, 2.95, 0); g.add(cloth);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
