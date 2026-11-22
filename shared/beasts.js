// Plain box models for creatures any world can use: a goat, a hen, a bird, a bear, a fish, a shrimp, an
// octopus and a sea plant. Each faces +z, stands on its origin, and may carry userData.anim(t, moving, air)
// which life.js calls every frame (legs, wings, a tail, arms that sway).
//
//   kinds: [{ key: 'hen', name: 'دياية', kind: 'animal', make: () => hen(), hp: 5, speed: 1.6, radius: 0.4, height: 0.7, max: 3,
//             drops: [[K.CHICKEN, 1], [K.FEATHER, 2]] }]

import * as THREE from 'three';
import { K } from './kit.js';

const mat = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...(o || {}) });
function kit() {
  const g = new THREE.Group();
  const add = (w, h, d, x, y, z, m, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
  /** A part that turns about a point: the box hangs from the pivot. */
  const limb = (w, h, d, x, y, z, m, dy = -h / 2, dz = 0) => { const p = new THREE.Group(); p.position.set(x, y, z); const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(0, dy, dz); p.add(b); g.add(p); return p; };
  return { g, add, limb };
}
const walk4 = (legs) => (t, moving) => { const a = moving ? Math.sin(t * 9) * 0.5 : 0; legs[0].rotation.x = a; legs[3].rotation.x = a; legs[1].rotation.x = -a; legs[2].rotation.x = -a; };

/** A small goat: short horns, a beard, a tail that stands up. */
export function goat({ coat = 0xd9d2c4, dark = 0x5a4a3c, horn = 0x8c8474 } = {}) {
  const { g, add, limb } = kit(), mc = mat(coat), md = mat(dark), mh = mat(horn);
  add(0.4, 0.4, 0.8, 0, 0.62, 0, mc);
  add(0.24, 0.3, 0.28, 0, 0.88, 0.44, mc); add(0.2, 0.2, 0.3, 0, 0.98, 0.62, mc); add(0.14, 0.12, 0.12, 0, 0.92, 0.8, md);
  add(0.06, 0.14, 0.05, 0, 0.8, 0.72, md);                                       // the beard
  for (const sx of [-1, 1]) { add(0.05, 0.2, 0.05, sx * 0.07, 1.16, 0.56, mh).rotation.x = -0.5; add(0.1, 0.05, 0.04, sx * 0.15, 1.02, 0.52, md); add(0.04, 0.04, 0.02, sx * 0.07, 1.02, 0.775, mat(0x15120f)); }
  add(0.08, 0.14, 0.06, 0, 0.84, -0.42, mc).rotation.x = -0.6;
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [1, -1]) legs.push(limb(0.1, 0.44, 0.1, sx * 0.13, 0.44, sz * 0.28, md));
  g.userData.anim = walk4(legs);
  return g;
}

/** A hen. */
export function hen({ body = 0xf1ece2, comb = 0xc7342b, beak = 0xe2a03a } = {}) {
  const { g, add, limb } = kit(), mb = mat(body), mr = mat(comb), mk = mat(beak);
  add(0.3, 0.3, 0.44, 0, 0.42, 0, mb); add(0.26, 0.2, 0.14, 0, 0.52, -0.26, mb);              // body, tail
  add(0.18, 0.26, 0.18, 0, 0.7, 0.2, mb);
  add(0.06, 0.08, 0.14, 0, 0.87, 0.2, mr); add(0.06, 0.08, 0.05, 0, 0.6, 0.32, mr);            // comb, wattle
  add(0.08, 0.06, 0.1, 0, 0.7, 0.33, mk);
  for (const sx of [-1, 1]) { add(0.04, 0.04, 0.02, sx * 0.07, 0.76, 0.295, mat(0x15120f)); add(0.04, 0.2, 0.3, sx * 0.17, 0.44, 0, mat(0xd9d2c4)); }
  const legs = [limb(0.05, 0.26, 0.05, -0.08, 0.27, 0, mk), limb(0.05, 0.26, 0.05, 0.08, 0.27, 0, mk)];
  g.userData.anim = (t, moving) => { const a = moving ? Math.sin(t * 13) * 0.6 : 0; legs[0].rotation.x = a; legs[1].rotation.x = -a; };
  return g;
}

/** A small bird with wings that beat while it is in the air. */
export function bird({ body = 0x6f7f96, belly = 0xdfe4ea, beak = 0xe2a03a } = {}) {
  const { g, add, limb } = kit(), mb = mat(body), ml = mat(belly), mk = mat(beak);
  add(0.2, 0.18, 0.34, 0, 0.2, 0, mb); add(0.16, 0.08, 0.26, 0, 0.12, 0.02, ml);
  add(0.15, 0.15, 0.15, 0, 0.32, 0.18, mb); add(0.05, 0.04, 0.08, 0, 0.31, 0.29, mk);
  add(0.12, 0.03, 0.18, 0, 0.22, -0.24, mb);
  for (const sx of [-1, 1]) { add(0.03, 0.03, 0.02, sx * 0.05, 0.35, 0.256, mat(0x15120f)); add(0.03, 0.1, 0.03, sx * 0.05, 0.06, 0, mk); }
  const wings = [-1, 1].map((sx) => { const p = new THREE.Group(); p.position.set(sx * 0.1, 0.27, 0); const w = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.22), mb); w.position.set(sx * 0.17, 0, 0); p.add(w); g.add(p); return p; });
  g.userData.anim = (t, moving, air) => { const a = air > 0.05 ? Math.sin(t * 22) * 0.9 : -1.25; wings[0].rotation.z = -a; wings[1].rotation.z = a; };
  return g;
}

/** A bear. */
export function bear({ coat = 0x5b4332, snout = 0xb99a78 } = {}) {
  const { g, add, limb } = kit(), mc = mat(coat), ms = mat(snout), md = mat(0x15120f);
  add(0.8, 0.74, 1.4, 0, 0.92, 0, mc); add(0.7, 0.3, 0.5, 0, 1.3, 0.35, mc);                    // body, the hump of the shoulders
  add(0.52, 0.5, 0.46, 0, 1.12, 0.9, mc); add(0.26, 0.2, 0.22, 0, 1.02, 1.2, ms); add(0.1, 0.08, 0.04, 0, 1.08, 1.32, md);
  for (const sx of [-1, 1]) { add(0.14, 0.14, 0.08, sx * 0.2, 1.42, 0.86, mc); add(0.05, 0.05, 0.02, sx * 0.13, 1.2, 1.135, md); }
  add(0.14, 0.14, 0.1, 0, 1.0, -0.72, mc);
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [1, -1]) legs.push(limb(0.26, 0.6, 0.28, sx * 0.26, 0.6, sz * 0.48, mc));
  g.userData.anim = walk4(legs);
  return g;
}

/** A fish; the tail wags. */
export function fish({ body = 0xe8893a, belly = 0xf6e7c8, fin = 0xc9632a } = {}) {
  const { g, add } = kit(), mb = mat(body, { roughness: 0.5 }), ml = mat(belly, { roughness: 0.5 }), mf = mat(fin, { roughness: 0.6 });
  add(0.14, 0.26, 0.5, 0, 0.2, 0, mb); add(0.12, 0.1, 0.42, 0, 0.1, 0, ml); add(0.1, 0.2, 0.14, 0, 0.2, 0.3, mb);
  add(0.03, 0.12, 0.2, 0, 0.37, -0.02, mf);
  for (const sx of [-1, 1]) add(0.02, 0.04, 0.04, sx * 0.06, 0.24, 0.31, mat(0x10151c));
  const tail = new THREE.Group(); tail.position.set(0, 0.2, -0.25);
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.2), mf); t1.position.set(0, 0, -0.1); tail.add(t1); g.add(tail);
  g.userData.anim = (t, moving) => { tail.rotation.y = Math.sin(t * (moving ? 14 : 5)) * 0.55; };
  return g;
}

/** A shrimp: a curled row of plates and two long feelers. */
export function shrimp({ shell = 0xf08a6c } = {}) {
  const { g, add } = kit(), ms = mat(shell, { roughness: 0.55 }), md = mat(0xc75f44, { roughness: 0.6 });
  const segs = [[0.14, 0.14, 0.16, 0.2, 0.14], [0.13, 0.13, 0.12, 0.22, 0.02], [0.11, 0.12, 0.11, 0.2, -0.08], [0.09, 0.1, 0.1, 0.15, -0.16], [0.07, 0.07, 0.1, 0.09, -0.2]];
  for (const [w, h, d, y, z] of segs) add(w, h, d, 0, y, z, ms);
  add(0.16, 0.02, 0.1, 0, 0.05, -0.26, md);                                                      // the tail fan
  for (const sx of [-1, 1]) { add(0.015, 0.015, 0.3, sx * 0.04, 0.28, 0.34, md).rotation.y = sx * 0.25; add(0.03, 0.03, 0.03, sx * 0.05, 0.25, 0.21, mat(0x10151c)); }
  for (let i = 0; i < 3; i++) add(0.12, 0.06, 0.015, 0, 0.09, 0.12 - i * 0.07, md);
  g.userData.anim = (t, moving) => { g.children[0].position.y = 0.2 + (moving ? Math.sin(t * 10) * 0.01 : 0); };
  return g;
}

/** An octopus: a round head and eight arms that curl. */
export function octopus({ skin = 0xb0527a, spot = 0xe9b8cd } = {}) {
  const { g, add } = kit(), ms = mat(skin, { roughness: 0.6 }), mp = mat(spot, { roughness: 0.6 });
  add(0.5, 0.46, 0.5, 0, 0.62, 0, ms); add(0.42, 0.14, 0.42, 0, 0.9, 0, ms); add(0.3, 0.1, 0.3, 0, 0.36, 0, ms);
  for (const sx of [-1, 1]) { add(0.1, 0.12, 0.03, sx * 0.13, 0.62, 0.255, mat(0xf4f1e6)); add(0.05, 0.07, 0.02, sx * 0.13, 0.61, 0.275, mat(0x10151c)); add(0.08, 0.08, 0.02, sx * 0.14, 0.82, 0.25, mp); }
  const arms = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.39, p = new THREE.Group(); p.position.set(Math.sin(a) * 0.2, 0.34, Math.cos(a) * 0.2); p.rotation.y = a;
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), ms); up.position.set(0, -0.04, 0.15); p.add(up);
    const lo = new THREE.Group(); lo.position.set(0, -0.04, 0.3); const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.28), mp); tip.position.set(0, 0, 0.14); lo.add(tip); p.add(lo);
    g.add(p); arms.push([p, lo, i]);
  }
  g.userData.anim = (t, moving) => { for (const [p, lo, i] of arms) { const w = Math.sin(t * (moving ? 6 : 2.2) + i * 0.8); p.rotation.x = 0.35 + w * 0.3; lo.rotation.x = 0.5 + w * 0.45; } };
  return g;
}

/** A sea plant: a few ribbons that sway. It stays where it grows and is picked like any other creature is struck. */
export function seaweed({ leaf = 0x2f8a52, tip = 0x62b877 } = {}) {
  const { g } = kit(), ml = mat(leaf, { roughness: 0.7 }), mt = mat(tip, { roughness: 0.7 });
  const blades = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7, h = 0.7 + (i % 3) * 0.28, p = new THREE.Group(); p.position.set(Math.sin(a) * 0.14, 0, Math.cos(a) * 0.14); p.rotation.y = a;
    const lo = new THREE.Mesh(new THREE.BoxGeometry(0.1, h * 0.55, 0.03), ml); lo.position.set(0, h * 0.275, 0); p.add(lo);
    const hi = new THREE.Group(); hi.position.set(0, h * 0.55, 0); const top = new THREE.Mesh(new THREE.BoxGeometry(0.08, h * 0.45, 0.03), mt); top.position.set(0, h * 0.225, 0); hi.add(top); p.add(hi);
    g.add(p); blades.push([p, hi, i]);
  }
  g.userData.anim = (t) => { for (const [p, hi, i] of blades) { const w = Math.sin(t * 1.4 + i * 1.3); p.rotation.x = w * 0.12; hi.rotation.x = w * 0.3; } };
  return g;
}


/**
 * The creatures every world gets on top of its own: life in its water, and the animals that suit the place.
 * Spread into createLife's kinds: kinds: [ ...own, ...extraKinds('waha') ].
 */
export function extraKinds(world) {
  const tint = world === 'kawkab' ? { body: 0x5fd6e8, belly: 0xd6fbff, fin: 0x2a9fb5 } : world === 'dhalam' ? { body: 0x7d8a8e, belly: 0xd5dcd9, fin: 0x55626a } : {};
  const sea = [
    { key: 'fish', name: 'سمكة', kind: 'animal', make: () => fish(tint), hp: 3, speed: 1.9, radius: 0.4, height: 0.4, max: 5, swim: true, tame: false, drops: [[K.FISH, 1]] },
    { key: 'shrimp', name: 'ربيان', kind: 'animal', make: () => shrimp(), hp: 2, speed: 1.2, radius: 0.32, height: 0.3, max: 3, swim: true, tame: false, drops: [[K.SHRIMP, 2]] },
    { key: 'octopus', name: 'أخطبوط', kind: 'animal', make: () => octopus(world === 'kawkab' ? { skin: 0x7a5ad6, spot: 0xc9b8ff } : {}), hp: 8, speed: 1.1, radius: 0.55, height: 0.9, max: 1, swim: true, tame: false, drops: [[K.PEARL, 1]] },
    { key: 'seaweed', name: 'طحالب', kind: 'animal', make: () => seaweed(world === 'kawkab' ? { leaf: 0x2a8f9a, tip: 0x6fe6d8 } : {}), hp: 1, speed: 0, radius: 0.42, height: 1.0, max: 5, swim: true, still: true, drops: [[K.SEAWEED, 2]] },
  ];
  if (world === 'waha') return [
    { key: 'goat', name: 'عنز', kind: 'animal', make: () => goat(), hp: 8, speed: 2.0, radius: 0.55, height: 1.05, max: 3, drops: [[K.MEAT, 1], [K.FUR, 1]] },
    { key: 'hen', name: 'دياية', kind: 'animal', make: () => hen(), hp: 4, speed: 1.7, radius: 0.4, height: 0.9, max: 3, drops: [[K.CHICKEN, 1], [K.FEATHER, 2]] },
    { key: 'dove', name: 'حمامة', kind: 'animal', make: () => bird({ body: 0xb9b2a8, belly: 0xece6dc }), hp: 2, speed: 2.6, radius: 0.4, height: 0.45, max: 3, fly: 3.2, perch: true, drops: [[K.FEATHER, 1]] },
    ...sea,
  ];
  if (world === 'dhalam') return [
    { key: 'bear', name: 'دب', kind: 'animal', make: () => bear(), hp: 26, speed: 2.3, radius: 0.9, height: 1.55, max: 1, likes: 'meat', fights: true, dmg: 9, drops: [[K.MEAT, 3], [K.FUR, 2]] },
    { key: 'crow', name: 'غراب', kind: 'animal', make: () => bird({ body: 0x23262b, belly: 0x33373d, beak: 0x4a4d52 }), hp: 2, speed: 2.8, radius: 0.4, height: 0.45, max: 3, fly: 3.6, perch: true, drops: [[K.FEATHER, 1]] },
    ...sea,
  ];
  if (world === 'kawkab') return [
    { key: 'glider', name: 'طير الوهج', kind: 'animal', make: () => bird({ body: 0x3fd6c2, belly: 0xc8fff4, beak: 0xff9be0 }), hp: 2, speed: 2.6, radius: 0.4, height: 0.45, max: 3, fly: 3.4, perch: true, drops: [[K.FEATHER, 1]] },
    ...sea,
  ];
  return sea;
}
