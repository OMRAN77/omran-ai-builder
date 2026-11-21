// Non-voxel props of the survivor's shelter: campfire, torches, palisade tips, lean-to roof,
// camp clutter. Everything is boxes / cylinders / sprites built in code.

import * as THREE from 'three';
import { patch } from './fx.js';
import { mat, box, cyl, at, grp, strut, bake } from './kit.js';
import { mulberry32 } from './texgen.js';

const V = (x, y, z) => [x, y, z];

function flameSprite(tex, w, h, gain) {
  const m = patch(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(gain, gain, gain), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), { additive: true });
  const s = new THREE.Sprite(m);
  s.center.set(0.5, 0.04);
  s.scale.set(w, h, 1);
  return s;
}
function glowSprite(tex, size, color, opacity) {
  const m = patch(new THREE.SpriteMaterial({ map: tex, color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), { additive: true });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

const EMBER = new THREE.Color(1.0, 0.36, 0.09);

export function makeCampfire(sprites, tiles) {
  const g = new THREE.Group();
  g.name = 'campfire';
  const stone = mat(0x6a6d70, { tex: 'plain', rough: 0.95 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2, r = 0.78 + (i % 3) * 0.05;
    const s = 0.26 + ((i * 7) % 5) * 0.035;
    g.add(at(box(s * 1.3, s * 0.8, s, stone, { r: 0.07, seg: 2 }), Math.cos(a) * r, s * 0.32, Math.sin(a) * r, 0.2 * (i % 2), a + 0.4, 0));
  }
  const charred = mat(0x1a1512, { tex: 'wood', rough: 1 });
  const hot = mat(0x2a1208, { tex: 'wood', rough: 1, emissive: 0xff5a14, emissiveIntensity: 2.2 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    g.add(strut(V(Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55), V(Math.cos(a + 2.6) * 0.1, 0.62, Math.sin(a + 2.6) * 0.1), 0.13, i % 2 ? charred : hot, { r: 0.03 }));
  }
  // ember bed
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.9, 0.16) }), { additive: false }));
  bed.rotation.x = -Math.PI / 2; bed.position.y = 0.05;
  g.add(bed);
  // flames: a few camera-facing sheets
  const f = new THREE.Group();
  f.add(at(flameSprite(sprites.flame, 1.25, 1.9, 2.6), 0, 0.1, 0));
  f.add(at(flameSprite(sprites.flame, 0.8, 1.25, 3.4), 0.16, 0.12, 0.05));
  f.add(at(flameSprite(sprites.flame, 0.7, 1.05, 3.4), -0.2, 0.1, -0.06));
  f.children[1].material.rotation = 0.08; f.children[2].material.rotation = -0.1;
  g.add(f);
  g.add(at(glowSprite(sprites.glow, 5.5, EMBER.clone().multiplyScalar(1.3), 0.55), 0, 0.9, 0));
  g.add(at(glowSprite(sprites.glow, 17, EMBER.clone().multiplyScalar(0.8), 0.22), 0, 1.6, 0));
  // sparks
  const sp = [];
  for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 0.1 + (i % 5) * 0.09; sp.push(Math.cos(a) * r + i * 0.012, 0.9 + i * 0.11 + (i % 3) * 0.1, Math.sin(a) * r); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  g.add(new THREE.Points(pg, patch(new THREE.PointsMaterial({ color: new THREE.Color(4, 1.6, 0.4), size: 0.05, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), { additive: true })));
  // smoke column drifting with the wind
  const smoke = new THREE.Group();
  smoke.name = 'smoke';
  for (let i = 0; i < 9; i++) {
    const m = patch(new THREE.SpriteMaterial({ map: sprites.soft, color: new THREE.Color(0.2, 0.215, 0.24), opacity: 0.34 * (1 - i / 11), depthWrite: false, transparent: true, rotation: i * 1.3 }));
    const s = new THREE.Sprite(m);
    const k = 1.3 + i * 0.75;
    s.scale.set(k, k, 1);
    s.position.set(i * 0.34 + i * i * 0.05, 2.2 + i * 1.25, i * 0.12);
    smoke.add(s);
  }
  g.add(smoke);
  // cooking tripod with a pot
  const pole = mat(0x3b3229, { tex: 'wood', rough: 0.95 });
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.9; g.add(strut(V(Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15), V(Math.cos(a) * -0.06, 2.25, Math.sin(a) * -0.06), 0.07, pole)); }
  const iron = mat(0x23262a, { tex: 'iron', rough: 0.6, metal: 0.7 });
  g.add(strut(V(0, 2.15, 0), V(0, 1.42, 0), 0.025, iron));
  g.add(at(cyl(0.2, 0.15, 0.26, iron, { seg: 10 }), 0, 1.3, 0));
  void tiles;
  return g;
}

export function makeTorch(sprites, h, kind = 'torch') {
  const g = new THREE.Group();
  g.name = kind;
  const wood = mat(0x3d342b, { tex: 'wood', rough: 0.95 });
  const iron = mat(0x1f2226, { tex: 'iron', rough: 0.6, metal: 0.7 });
  if (kind === 'torch') {
    g.add(at(box(0.13, h, 0.13, wood, { r: 0.02, anchor: 'bottom' }), 0, 0, 0, 0.03, 0.4, -0.04));
    g.add(at(box(0.2, 0.3, 0.2, mat(0x17120e, { tex: 'cloth', rough: 1 }), { r: 0.04, anchor: 'bottom' }), -0.09, h - 0.06, 0.06, 0, 0.4, 0));
    g.add(at(box(0.24, 0.05, 0.24, iron, { r: 0.01 }), -0.09, h - 0.08, 0.06, 0, 0.4, 0));
    g.add(at(flameSprite(sprites.flame, 0.5, 0.82, 3.2), -0.09, h + 0.18, 0.06));
    g.add(at(glowSprite(sprites.glow, 2.6, EMBER.clone().multiplyScalar(1.2), 0.5), -0.09, h + 0.45, 0.06));
    g.add(at(glowSprite(sprites.glow, 8, EMBER.clone().multiplyScalar(0.7), 0.16), -0.09, h + 0.5, 0.06));
    g.userData.lightAt = new THREE.Vector3(-0.09, h + 0.5, 0.06);
  } else {
    // hanging lantern: iron cage around a warm core
    g.add(at(box(0.03, 0.5, 0.03, iron, { r: 0 }), 0, h + 0.28, 0));
    g.add(at(box(0.2, 0.04, 0.2, iron, { r: 0.01 }), 0, h + 0.03, 0));
    g.add(at(box(0.2, 0.04, 0.2, iron, { r: 0.01 }), 0, h - 0.27, 0));
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.add(at(box(0.025, 0.28, 0.025, iron, { r: 0 }), dx * 0.085, h - 0.12, dz * 0.085));
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.11), patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.2, 0.6) })));
    g.add(at(core, 0, h - 0.12, 0));
    g.add(at(glowSprite(sprites.glow, 1.7, EMBER.clone().multiplyScalar(1.2), 0.5), 0, h - 0.12, 0));
    g.userData.lightAt = new THREE.Vector3(0, h - 0.12, 0);
  }
  return g;
}

/**
 * The palisade: one merged mesh of round, sharpened logs (seven-sided, tapered, each leaning its own
 * way), fire-hardened at the tips, with a rail lashed along the outside and a framed gate.
 */
function buildPalisade(S, tiles) {
  const SEG = 7;
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const rnd = mulberry32(4401);
  const g = new THREE.Group();
  g.name = 'palisade';
  const addLog = (L, sharp = true) => {
    const tw = rnd() * 6.28, u0 = rnd(), v0 = rnd();
    const tipH = sharp ? 0.55 + rnd() * 0.35 : 0.06;
    const lx = Math.sin(L.leanAz) * L.lean, lz = Math.cos(L.leanAz) * L.lean;
    const tone = 0.78 + rnd() * 0.4, warm = (rnd() - 0.5) * 0.07;
    // [height, radius factor, brightness]: foot in the ground, shoulder, hewn point, charred tip
    const rings = [[-0.3, 1.06, 0.62], [0.5, 1.0, 0.86], [L.h - tipH, 0.9, 1.0], [L.h - tipH * 0.5, sharp ? 0.52 : 0.86, sharp ? 0.42 : 0.8], [L.h, sharp ? 0.07 : 0.8, sharp ? 0.2 : 0.7]];
    const base = pos.length / 3;
    rings.forEach(([y, rf, br], ri) => {
      const slope = ri >= 3 && sharp ? 0.8 : 0.03;
      for (let k = 0; k <= SEG; k++) {
        const a = tw + (k / SEG) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const wob = 1 + (((k * 7 + L.seed * 3) % 5) - 2) * 0.018;
        pos.push(L.x + lx * y + ca * L.r * rf * wob, L.y + y, L.z + lz * y + sa * L.r * rf * wob);
        const il = 1 / Math.hypot(1, slope);
        nor.push(ca * il, slope * il, sa * il);
        uv.push(u0 + (k / SEG) * 2, v0 + y * 0.4);
        const b = br * tone;
        col.push(b * (1 + warm), b, b * (1 - warm));
      }
    });
    for (let ri = 0; ri < rings.length - 1; ri++) for (let k = 0; k < SEG; k++) {
      const p0 = base + ri * (SEG + 1) + k, p1 = p0 + SEG + 1;
      idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1);
    }
  };
  for (const L of S.logs) addLog(L);
  // gate posts: two heavier logs with a lintel
  const gt = S.gate, gl = Math.hypot(gt.ax, gt.az), ox = gt.ax / gl, oz = gt.az / gl;
  const t = S.R / Math.hypot(ox * 0.93, oz);
  const cx = S.fire.x + ox * t, cz = S.fire.z + oz * t, gy = S.g + 1;
  const posts = [-1, 1].map((sg) => ({ x: cx - oz * sg * 2.45 + ox * 0.15, z: cz + ox * sg * 2.45 + oz * 0.15, y: gy, r: 0.33, h: 4.9, lean: 0.01, leanAz: sg, seed: 900 + sg }));
  for (const P of posts) addLog(P, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const logMat = patch(new THREE.MeshStandardMaterial({ map: tiles.log.map, normalMap: tiles.log.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), vertexColors: true, roughness: 0.96, color: 0xc4c0bb }));
  const mesh = new THREE.Mesh(geo, logMat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.bakedMesh = true;                       // keep its vertex colours: not merged by bake()
  g.add(mesh);

  const wood = mat(0x3f352c, { tex: 'wood', rough: 0.95 });
  const woodD = mat(0x2c251f, { tex: 'wood', rough: 0.95 });
  const rope = mat(0x6b5d48, { tex: 'cloth', rough: 1 });
  const props = new THREE.Group();
  // rail along the outside at two-thirds height, lashed to every third log
  const logs = S.logs;
  for (let i = 0; i < logs.length; i++) {
    const A = logs[i], B = logs[(i + 1) % logs.length];
    if (Math.hypot(A.x - B.x, A.z - B.z) > 1.2) continue;                     // the gate
    const ya = 2.12 + Math.sin(i * 0.37) * 0.06, yb = 2.12 + Math.sin((i + 1) * 0.37) * 0.06;
    const pa = V(A.x + A.ox * (A.r + 0.06), A.y + ya, A.z + A.oz * (A.r + 0.06)), pb = V(B.x + B.ox * (B.r + 0.06), B.y + yb, B.z + B.oz * (B.r + 0.06));
    props.add(strut(pa, pb, 0.12, i % 9 < 5 ? wood : woodD, { r: 0.03 }));
    if (i % 4 === 0) {
      const lash = box(0.17, 0.15, 0.17, rope, { r: 0.04 });
      lash.position.set(pa[0] - A.ox * 0.03, pa[1], pa[2] - A.oz * 0.03);
      lash.rotation.y = Math.atan2(A.ox, A.oz);
      props.add(lash);
    }
  }
  // lintel and braces over the gate
  const [P0, P1] = posts;
  props.add(strut(V(P0.x - (P1.x - P0.x) * 0.1, gy + 4.55, P0.z - (P1.z - P0.z) * 0.1), V(P1.x + (P1.x - P0.x) * 0.1, gy + 4.62, P1.z + (P1.z - P0.z) * 0.1), 0.3, wood, { r: 0.06 }));
  for (const [P, Q] of [[P0, P1], [P1, P0]]) {
    const dx = (Q.x - P.x), dz = (Q.z - P.z);
    props.add(strut(V(P.x, gy + 3.5, P.z), V(P.x + dx * 0.2, gy + 4.5, P.z + dz * 0.2), 0.16, woodD, { r: 0.03 }));
    props.add(at(box(0.5, 0.2, 0.5, rope, { r: 0.05 }), P.x, gy + 4.5, P.z, 0, Math.atan2(ox, oz), 0));
  }
  g.add(bake(props));
  return g;
}

export function buildShelterProps(meta, sprites, tiles) {
  const S = meta.shelter;
  const root = new THREE.Group();
  root.name = 'shelterProps';

  root.add(buildPalisade(S, tiles));

  const fire = makeCampfire(sprites, tiles);
  fire.position.set(S.fire.x, S.fire.y, S.fire.z);
  root.add(fire);

  let jettyTorch = null, jettyLight = null;
  const lights = [{ pos: new THREE.Vector3(S.fire.x, S.fire.y + 0.9, S.fire.z), color: 0xff7a2e, intensity: 90, distance: 13, kind: 'fire' }];
  for (const t of S.torches) {
    const tg = makeTorch(sprites, t.h, t.kind);
    tg.position.set(t.x, t.y, t.z);
    bake(tg);
    root.add(tg);
    lights.push({ pos: tg.userData.lightAt.clone().add(tg.position), color: 0xff8436, intensity: t.kind === 'torch' ? 26 : 12, distance: t.kind === 'torch' ? 11 : 7, kind: t.kind });
    if (meta.shelter.jettyEnd && Math.abs(t.x - meta.shelter.jettyEnd.x) < 1 && Math.abs(t.z - meta.shelter.jettyEnd.z) < 1.5) { jettyTorch = tg; jettyLight = lights[lights.length - 1]; }
  }

  // lean-to roof: overlapping hide strips, sloping down to the back wall
  const hut = S.hut, g = hut.g + 1;
  const hide = mat(0x4c463c, { tex: 'fur', rough: 1 });
  const hide2 = mat(0x3c3832, { tex: 'fur', rough: 1 });
  const slope = Math.atan2(1.15, 4.6);
  for (let i = 0; i < 5; i++) {
    const z = hut.z + 0.5 + i * 1.02;
    root.add(at(box(5.3, 0.1, 1.22, i % 2 ? hide : hide2, { r: 0.03, uv: 0.8 }), hut.x + 1.9, g + 2.72 + (i % 2) * 0.05, z, 0, 0, -slope));
  }
  const pole = mat(0x3a3128, { tex: 'wood', rough: 0.95 });
  root.add(strut(V(hut.x - 0.55, g, hut.z + 0.2), V(hut.x - 0.55, g + 3.25, hut.z + 0.2), 0.14, pole));
  root.add(strut(V(hut.x - 0.55, g, hut.z + 4.8), V(hut.x - 0.55, g + 3.25, hut.z + 4.8), 0.14, pole));
  root.add(strut(V(hut.x - 0.55, g + 3.2, hut.z - 0.2), V(hut.x - 0.55, g + 3.2, hut.z + 5.2), 0.12, pole));
  // bedroll and a crate inside
  root.add(at(box(0.75, 0.2, 1.9, mat(0x4a4e46, { tex: 'cloth', rough: 1 }), { r: 0.09 }), hut.x + 1.9, g + 1.12, hut.z + 2.1, 0, 0.06, 0));
  root.add(at(box(0.75, 0.24, 0.4, mat(0x6b5f4e, { tex: 'fur', rough: 1 }), { r: 0.1 }), hut.x + 1.9, g + 1.2, hut.z + 3.05, 0, 0.06, 0));

  const crateMat = patch(new THREE.MeshStandardMaterial({ map: tiles.planks.map, normalMap: tiles.planks.normalMap, roughness: 0.95, color: 0xbfb5a5 }));
  const iron = mat(0x22252a, { tex: 'iron', rough: 0.6, metal: 0.7 });
  const crate = (x, y, z, s, ry) => root.add(at(box(s, s * 0.8, s, crateMat, { r: 0.02, uv: 0.5 }), x, y + s * 0.4, z, 0, ry, 0));
  const fx = S.fire.x, fz = S.fire.z;
  crate(fx - 4.6, g, fz + 1.6, 0.9, 0.3); crate(fx - 4.4, g, fz + 2.7, 0.8, -0.2); crate(fx - 4.5, g + 0.72, fz + 2.0, 0.7, 0.6);
  // barrel
  const barrelWood = mat(0x4a3f33, { tex: 'wood', rough: 0.9 });
  const barrel = (x, z) => { const b = grp(cyl(0.34, 0.3, 0.9, barrelWood, { seg: 12, anchor: 'bottom' }), at(cyl(0.355, 0.355, 0.05, iron, { seg: 12 }), 0, 0.22, 0), at(cyl(0.36, 0.36, 0.05, iron, { seg: 12 }), 0, 0.68, 0)); b.position.set(x, g, z); root.add(b); };
  barrel(fx - 3.3, fz + 4.3); barrel(fx - 2.5, fz + 4.9);
  // woodpile against the wall
  const logM = mat(0x40362c, { tex: 'wood', rough: 1 });
  const endM = mat(0x8d7a5e, { tex: 'wood', rough: 1 });
  const pile = new THREE.Group();
  let n = 0;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
    const lg = cyl(0.17, 0.17, 1.5, logM, { seg: 8 });
    lg.rotation.z = Math.PI / 2; lg.position.set(((n * 37) % 7) * 0.02, 0.17 + row * 0.3, (i + row * 0.5) * 0.36);
    pile.add(lg);
    for (const sx of [-1, 1]) { const e = cyl(0.14, 0.14, 0.02, endM, { seg: 8 }); e.rotation.z = Math.PI / 2; e.position.set(lg.position.x + sx * 0.755, lg.position.y, lg.position.z); pile.add(e); }
    n++;
  }
  pile.position.set(fx + 0.6, g, fz + 5.2); pile.rotation.y = 0.25;
  root.add(pile);
  // chopping block with an axe left in it
  const bark = mat(0x3a3027, { tex: 'wood', rough: 1 });
  const chop = grp(cyl(0.4, 0.44, 0.55, bark, { seg: 10, anchor: 'bottom' }), at(cyl(0.37, 0.37, 0.02, endM, { seg: 10 }), 0, 0.56, 0));
  chop.add(strut(V(0.05, 0.6, 0), V(0.5, 1.25, 0.12), 0.05, mat(0x5a4a38, { tex: 'wood', rough: 0.9 }), { depth: 0.035 }));
  chop.add(at(box(0.07, 0.24, 0.2, iron, { r: 0.015 }), 0.03, 0.66, -0.02, 0, 0.2, 0.6));
  chop.position.set(fx - 2.0, g, fz - 3.6);
  root.add(chop);
  // drying rack
  const rack = new THREE.Group();
  rack.add(strut(V(-1.1, 0, 0), V(-1.0, 1.75, 0), 0.07, pole)); rack.add(strut(V(1.1, 0, 0), V(1.0, 1.75, 0), 0.07, pole));
  rack.add(strut(V(-1.2, 1.68, 0), V(1.2, 1.68, 0), 0.055, pole));
  const meat = mat(0x4a2a24, { tex: 'leather', rough: 0.9 });
  for (let i = 0; i < 5; i++) rack.add(at(box(0.13, 0.42 + (i % 2) * 0.12, 0.03, meat, { r: 0.01 }), -0.75 + i * 0.37, 1.4 - (i % 2) * 0.06, 0, 0, 0, (i % 3 - 1) * 0.05));
  rack.position.set(fx + 1.2, g, fz - 4.9); rack.rotation.y = 0.35;
  root.add(rack);
  // gate: two leaning log braces across the opening look like a makeshift barrier
  bake(fire);
  bake(root);
  return { root, lights, fire, jettyTorch, jettyLight };
}
