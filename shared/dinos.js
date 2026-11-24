// The dinosaurs of «عالم الديناصورات»: plain box models of our own (not taken from any film or game), each facing
// +z and standing on its origin, with userData.anim(t, moving, air) for life.js (legs, a swinging tail, a neck
// that sways, a jaw, wings that beat).
//
//   العدّاء الصغير     a small quick two-legged plant eater that runs about in the grass (harmless)
//   العملاق أبو رقبة   a huge four-legged plant eater with a very long neck and tail (gentle: fed plants, it follows)
//   أبو ثلاث قرون      a heavy plant eater with a bony frill and three horns (it fights back when struck)
//   أبو صفايح          a plant eater with two rows of upright plates down its arched back and spikes on its tail
//   الطاير الجلدي      a flying reptile on wide skin wings, with a long beak and a crest
//   وحش البحر القديم   a sea reptile with four flippers and a long neck
//   المخلب السريع      a small fast hunter with a crest of quills; they come in numbers (a monster)
//   ملك الأنياب        a huge two-legged meat eater with a great jaw (a monster, rare and strong)
//   الصغار            hatchlings of the volcanic hatchery (styles/dino/ideas.js): a big head, big eyes, a stubby tail,
//                     the colour of the egg they came from; never made on their own, they follow whoever hatched them
//
//   kinds: [...dinoKinds(gen.landOf), ...extraKinds('dino'), ...hatchKinds()]

import * as THREE from 'three';
import { K } from './kit.js';

const mat = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, ...(o || {}) });
function kit() {
  const g = new THREE.Group();
  const add = (w, h, d, x, y, z, m, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
  const pivot = (x, y, z, parent = g) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  return { g, add, pivot };
}
const EYE = mat(0x14110e, { roughness: 0.3 });
/** A leg of two parts from a hip pivot: [hip, knee]; the foot at the bottom. */
function leg(add, pivot, parent, x, y, z, w, up, lo, m, foot, back = false) {
  const hip = pivot(x, y, z, parent);
  add(w, up, w * 1.05, 0, -up / 2, 0, m, hip);
  const knee = pivot(0, -up, 0, hip);
  add(w * 0.82, lo, w * 0.82, 0, -lo / 2, 0, m, knee);
  add(w * 1.05, w * 0.32, w * 1.35, 0, -lo + w * 0.16, back ? -w * 0.1 : w * 0.18, foot, knee);
  return [hip, knee];
}
/** A tail of pieces, each a pivot on the last, thinner toward the tip. */
function tail(add, pivot, parent, x, y, z, n, w, h, len, m, droop = 0.06) {
  const seg = [];
  let p = parent, px = x, py = y, pz = z;
  for (let i = 0; i < n; i++) {
    const s = 1 - i / (n + 0.6), q = pivot(px, py, pz, p);
    add(w * s, h * s, len, 0, 0, -len / 2, m, q);
    q.rotation.x = droop;
    seg.push(q); p = q; px = 0; py = 0; pz = -len * 0.92;
  }
  return seg;
}
const swing = (seg, t, k, amp) => { for (let i = 0; i < seg.length; i++) seg[i].rotation.y = Math.sin(t * k - i * 0.6) * amp * (0.5 + i * 0.25); };
/** Four legs walking: front left with back right, and the other two. */
const walk4 = (legs, t, moving, k, amp) => {
  const a = moving ? Math.sin(t * k) * amp : 0;
  legs.forEach(([hip, knee], i) => { const s = i === 0 || i === 3 ? a : -a; hip.rotation.x = s; knee.rotation.x = Math.max(0, -s) * 0.6; });
};
/** Two legs: hips swing opposite, the knee bends as the leg comes forward. */
const walk2 = (legs, t, moving, k, amp) => {
  const a = moving ? Math.sin(t * k) * amp : 0;
  legs.forEach(([hip, knee], i) => { const s = i ? -a : a; hip.rotation.x = s; knee.rotation.x = Math.max(0, s) * 0.9; });
};

/** العدّاء الصغير: a small two-legged plant eater, green with a yellow belly and a dark stripe down its back. */
export function runner() {
  const { g, add, pivot } = kit();
  const skin = mat(0x8fa046), belly = mat(0xe3d27a), dark = mat(0x4f5a26), foot = mat(0x5a5030);
  const body = pivot(0, 0.62, 0);
  add(0.34, 0.32, 0.62, 0, 0.06, 0, skin, body); add(0.28, 0.1, 0.5, 0, -0.08, 0.02, belly, body); add(0.1, 0.05, 0.6, 0, 0.23, -0.02, dark, body);
  const neck = pivot(0, 0.12, 0.26, body);
  add(0.16, 0.34, 0.16, 0, 0.14, 0.04, skin, neck).rotation.x = 0.35;
  const head = pivot(0, 0.32, 0.12, neck);
  add(0.2, 0.18, 0.3, 0, 0, 0.08, skin, head); add(0.14, 0.08, 0.14, 0, -0.04, 0.26, belly, head);
  for (const sx of [-1, 1]) add(0.03, 0.05, 0.05, sx * 0.1, 0.04, 0.14, EYE, head);
  for (const sx of [-1, 1]) { const a = pivot(sx * 0.15, -0.02, 0.24, body); add(0.05, 0.16, 0.05, 0, -0.08, 0.02, skin, a).rotation.x = 0.5; }
  const legs = [-1, 1].map((sx) => leg(add, pivot, body, sx * 0.13, -0.02, -0.06, 0.11, 0.3, 0.3, skin, foot));
  const tl = tail(add, pivot, body, 0, 0.06, -0.3, 4, 0.2, 0.2, 0.22, skin, 0.05);
  g.userData.anim = (t, moving) => {
    walk2(legs, t, moving, 15, 0.75);
    body.position.y = 0.62 + (moving ? Math.abs(Math.sin(t * 15)) * 0.04 : Math.sin(t * 2) * 0.008);
    neck.rotation.x = moving ? 0.25 : Math.sin(t * 0.9) * 0.15;
    head.rotation.y = moving ? 0 : Math.sin(t * 1.3) * 0.5;
    swing(tl, t, moving ? 15 : 2, moving ? 0.12 : 0.08);
  };
  return g;
}

/** العملاق أبو رقبة: the long-necked giant. Grey-green, a pale belly, darker bands over the back. */
export function longNeck() {
  const { g, add, pivot } = kit();
  const skin = mat(0x7a8a68), belly = mat(0xbdb89a), band = mat(0x5c6a4e), foot = mat(0x4e4a3e);
  const body = pivot(0, 3.0, 0);
  add(2.1, 1.9, 3.6, 0, 0.2, 0, skin, body); add(1.8, 0.5, 3.2, 0, -0.8, 0, belly, body);
  for (let i = 0; i < 5; i++) add(2.14, 0.3, 0.32, 0, 0.95, -1.2 + i * 0.6, band, body);
  add(1.7, 0.5, 2.6, 0, 1.25, -0.2, skin, body);                                       // the high back
  // the neck: six pieces rising forward, the head small at the top
  const neck = [];
  let p = body, px = 0, py = 0.7, pz = 1.6;
  for (let i = 0; i < 6; i++) {
    const s = 1 - i * 0.1, q = pivot(px, py, pz, p);
    add(0.9 * s, 0.9 * s, 1.0, 0, 0, 0.45, skin, q); add(0.6 * s, 0.3, 0.9, 0, -0.42 * s, 0.45, belly, q);
    q.rotation.x = i === 0 ? -0.75 : -0.1;
    neck.push(q); p = q; px = 0; py = 0; pz = 0.9;
  }
  const head = pivot(0, 0, 0.9, p);
  add(0.62, 0.5, 0.9, 0, 0.05, 0.3, skin, head); add(0.5, 0.2, 0.5, 0, -0.18, 0.55, belly, head);
  head.rotation.x = 0.9;
  for (const sx of [-1, 1]) add(0.05, 0.1, 0.12, sx * 0.31, 0.15, 0.4, EYE, head);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) legs.push(leg(add, pivot, body, sx * 0.78, -0.6, sz * 1.25, 0.62, 1.25, 1.1, skin, foot));
  const tl = tail(add, pivot, body, 0, 0.5, -1.7, 8, 1.0, 0.9, 0.8, skin, 0.1);
  for (let i = 3; i < tl.length; i++) tl[i].rotation.x = -0.02;
  g.userData.anim = (t, moving) => {
    walk4(legs, t, moving, 3.2, 0.32);
    body.position.y = 3.0 + (moving ? Math.abs(Math.sin(t * 3.2)) * 0.06 : 0);
    for (let i = 0; i < neck.length; i++) neck[i].rotation.y = Math.sin(t * 0.6 - i * 0.4) * 0.05;
    neck[0].rotation.x = -0.75 + (moving ? 0 : Math.sin(t * 0.4) * 0.12);
    head.rotation.x = 0.9 + Math.sin(t * 0.8) * 0.08;
    swing(tl, t, moving ? 3.2 : 0.8, 0.07);
  };
  return g;
}

/** أبو ثلاث قرون: heavy, a wide bony frill with a dark rim and pale spots, two long horns over the eyes and one on the nose. */
export function threeHorn() {
  const { g, add, pivot } = kit();
  const skin = mat(0x9a6a3e), belly = mat(0xc9a77a), frill = mat(0xc77e3a), rim = mat(0x5c3424), spot = mat(0xf0d8a8), horn = mat(0xeee2c4, { roughness: 0.5 }), foot = mat(0x4a3a2c);
  const body = pivot(0, 1.45, 0);
  add(1.5, 1.3, 2.6, 0, 0.15, -0.1, skin, body); add(1.3, 0.35, 2.3, 0, -0.55, -0.1, belly, body); add(1.2, 0.3, 1.6, 0, 0.88, -0.3, skin, body);
  const head = pivot(0, 0.15, 1.2, body);
  add(0.95, 0.85, 1.1, 0, 0, 0.45, skin, head);
  add(0.6, 0.5, 0.5, 0, -0.18, 1.1, skin, head); add(0.42, 0.32, 0.3, 0, -0.28, 1.4, mat(0x6a5a44), head);    // the beak
  // the frill: a wide plate leaning back over the neck
  const fr = pivot(0, 0.35, 0.1, head);
  add(1.9, 1.5, 0.16, 0, 0.55, 0, frill, fr);
  add(2.06, 0.16, 0.2, 0, 1.32, 0, rim, fr); for (const sx of [-1, 1]) add(0.16, 1.5, 0.2, sx * 1.02, 0.55, 0, rim, fr);
  for (const [x, y] of [[-0.5, 0.75], [0.5, 0.75], [0, 1.0], [-0.75, 0.25], [0.75, 0.25]]) add(0.26, 0.26, 0.04, x, y, 0.09, spot, fr);
  fr.rotation.x = -0.55;
  for (const sx of [-1, 1]) { const h = add(0.13, 0.13, 1.1, sx * 0.3, 0.55, 0.85, horn, head); h.rotation.x = -0.45; add(0.06, 0.1, 0.12, sx * 0.48, 0.28, 0.75, EYE, head); }
  const nose = add(0.12, 0.38, 0.12, 0, 0.18, 1.18, horn, head); nose.rotation.x = 0.35;
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) legs.push(leg(add, pivot, body, sx * 0.55, -0.4, sz * 0.85 - 0.1, 0.4, 0.55, 0.5, skin, foot));
  const tl = tail(add, pivot, body, 0, 0.2, -1.35, 4, 0.5, 0.45, 0.5, skin, 0.25);
  g.userData.anim = (t, moving) => {
    walk4(legs, t, moving, 6, 0.4);
    body.position.y = 1.45 + (moving ? Math.abs(Math.sin(t * 6)) * 0.05 : 0);
    head.rotation.x = moving ? 0.12 : Math.sin(t * 0.7) * 0.1;
    head.rotation.y = moving ? 0 : Math.sin(t * 0.5) * 0.2;
    swing(tl, t, moving ? 6 : 1.2, 0.1);
  };
  return g;
}

/** أبو صفايح: green with a low head and high hips; two rows of tall orange-red plates, and four spikes at the end of its tail. */
export function plated() {
  const { g, add, pivot } = kit();
  const skin = mat(0x6a8448), belly = mat(0xc4c08a), plate = mat(0xc4583a), edge = mat(0xe8a060), spike = mat(0xe6dcc0, { roughness: 0.5 }), foot = mat(0x45402e);
  const body = pivot(0, 1.5, 0);
  const torso = add(1.3, 1.25, 2.4, 0, 0.2, 0, skin, body); torso.rotation.x = 0.12;
  add(1.1, 0.3, 2.1, 0, -0.45, 0.05, belly, body);
  const neck = pivot(0, 0.05, 1.1, body);
  add(0.55, 0.55, 0.8, 0, -0.1, 0.35, skin, neck).rotation.x = 0.35;
  const head = pivot(0, -0.35, 0.75, neck);
  add(0.42, 0.38, 0.7, 0, 0, 0.25, skin, head); add(0.3, 0.16, 0.3, 0, -0.14, 0.52, belly, head);
  for (const sx of [-1, 1]) add(0.04, 0.07, 0.09, sx * 0.21, 0.07, 0.3, EYE, head);
  // the plates: diamonds standing on edge, tallest over the hips, alternating left and right, pale at the rim
  for (let i = 0; i < 9; i++) {
    const z = 0.95 - i * 0.3, sz = 0.3 + Math.sin((i + 1) / 10 * Math.PI) * 0.42, sx = i % 2 ? 0.14 : -0.14, y = 0.95 + sz * 0.62 + (z < 0 ? 0.08 : 0);
    const pl = add(0.08, sz, sz, sx, y, z, plate, body); pl.rotation.x = Math.PI / 4; pl.rotation.z = sx * 0.5;
    const rim = add(0.06, sz * 0.4, sz * 0.4, sx * 1.18, y + sz * 0.42, z, edge, body); rim.rotation.x = Math.PI / 4; rim.rotation.z = sx * 0.5;
  }
  const legs = [];
  for (const [sx, sz, len] of [[-1, 1, 0.42], [1, 1, 0.42], [-1, -1, 0.6], [1, -1, 0.6]]) legs.push(leg(add, pivot, body, sx * 0.5, -0.35, sz * 0.8, 0.34, len, 0.55 + (len - 0.42) * 0.4, skin, foot));
  const tl = tail(add, pivot, body, 0, 0.45, -1.15, 5, 0.55, 0.5, 0.5, skin, -0.05);
  const tip = tl[tl.length - 1];
  for (const [sx, a] of [[-1, 0.6], [1, 0.6], [-1, 1.1], [1, 1.1]]) { const s = add(0.08, 0.08, 0.7, sx * 0.25, 0.12, -0.3 - (a > 1 ? 0.25 : 0), spike, tip); s.rotation.y = sx * a; s.rotation.x = -0.4; }
  g.userData.anim = (t, moving) => {
    walk4(legs, t, moving, 5, 0.38);
    body.position.y = 1.5 + (moving ? Math.abs(Math.sin(t * 5)) * 0.04 : 0);
    neck.rotation.x = moving ? 0 : 0.2 + Math.sin(t * 0.8) * 0.1;
    swing(tl, t, moving ? 5 : 1.0, 0.14);
  };
  return g;
}

/** الطاير الجلدي: a flying reptile; a long beak, a crest that sweeps back, skin wings stretched from long arms. */
export function flyer() {
  const { g, add, pivot } = kit();
  const skin = mat(0x9a6a48), wing = mat(0xd08a5a, { side: THREE.DoubleSide }), crest = mat(0xb8382a), beak = mat(0xe0c08a);
  const body = pivot(0, 0.5, 0);
  add(0.32, 0.3, 0.8, 0, 0, 0, skin, body); add(0.2, 0.2, 0.3, 0, 0.02, 0.5, skin, body);
  const head = pivot(0, 0.12, 0.66, body);
  add(0.22, 0.24, 0.36, 0, 0, 0.1, skin, head);
  add(0.1, 0.1, 0.8, 0, -0.03, 0.62, beak, head);
  add(0.06, 0.3, 0.6, 0, 0.18, -0.22, crest, head).rotation.x = -0.5;                // the crest
  for (const sx of [-1, 1]) add(0.03, 0.05, 0.06, sx * 0.11, 0.06, 0.16, EYE, head);
  add(0.12, 0.08, 0.4, 0, 0, -0.55, skin, body);
  const wings = [-1, 1].map((sx) => {
    const sh = pivot(sx * 0.16, 0.08, 0.2, body);
    add(1.0, 0.05, 0.8, sx * 0.5, 0, -0.22, wing, sh); add(1.0, 0.07, 0.07, sx * 0.5, 0.02, 0.17, skin, sh);          // the inner wing and the arm bone
    const tipP = pivot(sx * 1.0, 0, 0, sh);
    add(1.1, 0.04, 0.55, sx * 0.55, 0, -0.1, wing, tipP); add(1.1, 0.06, 0.06, sx * 0.55, 0.02, 0.17, skin, tipP);
    return [sh, tipP];
  });
  for (const sx of [-1, 1]) add(0.05, 0.3, 0.05, sx * 0.1, -0.22, -0.3, skin, body);
  g.userData.anim = (t, moving, air) => {
    const flap = air > 0.05 ? (moving ? Math.sin(t * 7) * 0.55 : Math.sin(t * 2.2) * 0.12) : -1.2;      // in the air it beats or glides
    wings[0][0].rotation.z = -flap; wings[1][0].rotation.z = flap;
    wings[0][1].rotation.z = -flap * 0.6; wings[1][1].rotation.z = flap * 0.6;
    body.rotation.z = air > 0.05 ? Math.sin(t * 0.9) * 0.12 : 0;
    head.rotation.y = Math.sin(t * 0.7) * 0.3;
  };
  return g;
}

/** وحش البحر القديم: a sea reptile, blue-grey above and pale below, four long flippers and a long neck. */
export function seaReptile() {
  const { g, add, pivot } = kit();
  const skin = mat(0x3f5f72, { roughness: 0.45 }), belly = mat(0xcfd6cf, { roughness: 0.5 }), spot = mat(0x2c4452, { roughness: 0.5 });
  const body = pivot(0, 0.55, 0);
  add(1.0, 0.7, 2.0, 0, 0, 0, skin, body); add(0.8, 0.22, 1.8, 0, -0.32, 0, belly, body);
  for (const [x, z] of [[-0.2, 0.4], [0.25, -0.2], [-0.1, -0.6], [0.3, 0.6]]) add(0.22, 0.04, 0.22, x, 0.36, z, spot, body);
  const neck = [];
  let p = body, pz = 0.95;
  for (let i = 0; i < 4; i++) { const q = pivot(0, 0.05, pz, p); add(0.42 - i * 0.04, 0.4 - i * 0.04, 0.6, 0, 0, 0.28, skin, q); q.rotation.x = -0.18; neck.push(q); p = q; pz = 0.56; }
  const head = pivot(0, 0, 0.56, p);
  add(0.36, 0.3, 0.6, 0, 0, 0.2, skin, head); add(0.26, 0.1, 0.36, 0, -0.14, 0.32, belly, head);
  for (const sx of [-1, 1]) add(0.04, 0.06, 0.08, sx * 0.18, 0.07, 0.22, EYE, head);
  head.rotation.x = 0.55;
  const fl = [];
  for (const [sx, z, L] of [[-1, 0.55, 1.1], [1, 0.55, 1.1], [-1, -0.6, 0.85], [1, -0.6, 0.85]]) { const q = pivot(sx * 0.5, -0.12, z, body); const f = add(L, 0.08, 0.36, sx * L / 2, 0, -0.08, skin, q); f.rotation.y = sx * 0.35; fl.push(q); }
  const tl = tail(add, pivot, body, 0, 0, -1.0, 3, 0.5, 0.4, 0.45, skin, 0);
  g.userData.anim = (t, moving) => {
    const k = moving ? 3.2 : 1.1, a = Math.sin(t * k) * (moving ? 0.5 : 0.18);
    fl[0].rotation.z = a; fl[1].rotation.z = -a; fl[2].rotation.z = -a * 0.8; fl[3].rotation.z = a * 0.8;
    for (let i = 0; i < neck.length; i++) neck[i].rotation.y = Math.sin(t * 0.8 - i * 0.5) * 0.12;
    swing(tl, t, k, 0.2);
    body.position.y = 0.55 + Math.sin(t * k * 0.5) * 0.05;
  };
  return g;
}

/** المخلب السريع: a small fast hunter on two legs, sand-brown with dark stripes, a crest of blue quills, and a hooked claw on each foot. */
export function quickClaw() {
  const { g, add, pivot } = kit();
  const skin = mat(0x9a7448), stripe = mat(0x4a3424), belly = mat(0xd8c49a), quill = mat(0x2f6f9a), claw = mat(0x2a2420, { roughness: 0.4 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffb020, emissiveIntensity: 0.9, roughness: 0.4 });
  const body = pivot(0, 0.82, 0);
  add(0.36, 0.38, 0.9, 0, 0.05, 0, skin, body); add(0.3, 0.12, 0.8, 0, -0.14, 0.02, belly, body);
  for (let i = 0; i < 4; i++) add(0.38, 0.06, 0.08, 0, 0.18, -0.3 + i * 0.2, stripe, body);
  const neck = pivot(0, 0.12, 0.42, body);
  add(0.2, 0.36, 0.2, 0, 0.12, 0.06, skin, neck).rotation.x = 0.55;
  const head = pivot(0, 0.3, 0.2, neck);
  add(0.24, 0.24, 0.5, 0, 0, 0.18, skin, head);
  const jaw = pivot(0, -0.1, 0.0, head);
  add(0.2, 0.08, 0.44, 0, -0.03, 0.2, belly, jaw);
  for (const sx of [-1, 1]) add(0.03, 0.05, 0.06, sx * 0.12, 0.06, 0.16, eye, head);
  for (let i = 0; i < 5; i++) { const q = add(0.04, 0.18 - i * 0.02, 0.05, 0, 0.16, -0.06 - i * 0.07, quill, head); q.rotation.x = -0.7; }    // the crest
  for (let i = 0; i < 3; i++) { const q = add(0.04, 0.14, 0.05, 0, 0.27, 0.2 - i * 0.16, quill, body); q.rotation.x = -0.6; }
  const arms = [-1, 1].map((sx) => { const a = pivot(sx * 0.19, -0.02, 0.36, body); add(0.07, 0.26, 0.07, 0, -0.12, 0.03, skin, a); add(0.03, 0.08, 0.03, 0, -0.27, 0.07, claw, a); a.rotation.x = 0.6; return a; });
  const legs = [-1, 1].map((sx) => {
    const l = leg(add, pivot, body, sx * 0.15, -0.05, -0.1, 0.13, 0.38, 0.42, skin, stripe, true);
    add(0.04, 0.12, 0.04, 0, -0.38, 0.14, claw, l[1]).rotation.x = -0.6;          // the hooked claw
    return l;
  });
  const tl = tail(add, pivot, body, 0, 0.08, -0.45, 5, 0.22, 0.2, 0.3, skin, -0.03);
  g.userData.anim = (t, moving) => {
    walk2(legs, t, moving, 16, 0.85);
    body.position.y = 0.82 + (moving ? Math.abs(Math.sin(t * 16)) * 0.05 : 0);
    body.rotation.x = moving ? 0.1 : 0;
    jaw.rotation.x = moving ? 0.1 : Math.max(0, Math.sin(t * 1.7)) * 0.4;
    head.rotation.y = moving ? 0 : Math.sin(t * 1.1) * 0.4;
    arms[0].rotation.x = 0.6 + Math.sin(t * 3) * 0.1; arms[1].rotation.x = 0.6 - Math.sin(t * 3) * 0.1;
    swing(tl, t, moving ? 16 : 2, moving ? 0.06 : 0.1);
  };
  return g;
}

/** ملك الأنياب: the huge meat eater. Dark olive with a pale throat, a bony ridge over the eyes, a row of knobs down the back, a jaw that opens. */
export function fangKing() {
  const { g, add, pivot } = kit();
  const skin = mat(0x4f5a38), belly = mat(0xb9a87a), ridge = mat(0x8a5a36), tooth = mat(0xf2ecd8, { roughness: 0.4 }), mouth = mat(0x7a2a24), foot = mat(0x302a20);
  const eye = new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xff8a20, emissiveIntensity: 1.1, roughness: 0.4 });
  const body = pivot(0, 3.2, 0);
  add(1.6, 1.7, 3.0, 0, 0, 0, skin, body); add(1.3, 0.5, 2.6, 0, -0.75, 0.15, belly, body);
  for (let i = 0; i < 7; i++) add(0.24, 0.2, 0.28, 0, 0.9, 1.2 - i * 0.42, ridge, body);
  const neck = pivot(0, 0.35, 1.45, body);
  add(1.1, 1.1, 1.0, 0, 0.1, 0.35, skin, neck); add(0.8, 0.4, 0.9, 0, -0.38, 0.35, belly, neck);
  neck.rotation.x = -0.25;
  const head = pivot(0, 0.35, 0.85, neck);
  add(1.25, 0.8, 1.9, 0, 0.12, 0.75, skin, head);                       // the upper jaw and skull
  add(1.3, 0.16, 0.5, 0, 0.6, 0.45, ridge, head);                       // the bony brow
  for (const sx of [-1, 1]) { add(0.08, 0.14, 0.16, sx * 0.63, 0.34, 0.55, eye, head); for (let i = 0; i < 5; i++) add(0.08, 0.2, 0.08, sx * 0.5, -0.36, 0.4 + i * 0.3, tooth, head); }
  add(1.05, 0.12, 1.5, 0, -0.26, 0.8, mouth, head);
  const jaw = pivot(0, -0.3, 0.1, head);
  add(1.1, 0.34, 1.75, 0, -0.18, 0.75, belly, jaw);
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) add(0.07, 0.16, 0.07, sx * 0.44, 0.06, 0.55 + i * 0.32, tooth, jaw);
  for (const sx of [-1, 1]) { const a = pivot(sx * 0.7, -0.4, 1.1, body); add(0.16, 0.5, 0.16, 0, -0.22, 0.05, skin, a); add(0.14, 0.12, 0.2, 0, -0.5, 0.12, ridge, a); a.rotation.x = 0.7; }      // the little arms
  const legs = [-1, 1].map((sx) => leg(add, pivot, body, sx * 0.7, -0.3, -0.35, 0.62, 1.55, 1.45, skin, foot, true));
  const tl = tail(add, pivot, body, 0, 0.2, -1.45, 7, 1.15, 1.05, 0.75, skin, -0.04);
  g.userData.anim = (t, moving) => {
    walk2(legs, t, moving, 5.5, 0.5);
    body.position.y = 3.2 + (moving ? Math.abs(Math.sin(t * 5.5)) * 0.12 : Math.sin(t * 1.2) * 0.03);
    body.rotation.x = moving ? 0.08 : 0.02;
    jaw.rotation.x = moving ? 0.15 + Math.max(0, Math.sin(t * 2.2)) * 0.35 : Math.max(0, Math.sin(t * 0.9)) * 0.55;
    head.rotation.y = moving ? Math.sin(t * 2.75) * 0.1 : Math.sin(t * 0.6) * 0.3;
    swing(tl, t, moving ? 5.5 : 0.9, 0.08);
  };
  return g;
}

/**
 * The creatures of the dinosaur world on land, in the air and in the sea, each in the lands that suit it.
 * landAt(x, z) -> 'desert' | 'forest' | 'snow' | 'plains' | 'beach' | 'sea' | 'mountain' (play coordinates).
 * The hunters are about by day too, more of them at night (life.js doubles a monster's number at night as well);
 * the king of fangs is rare: only now and then does a place suit it.
 */
export function dinoKinds(landAt) {
  const in_ = (...lands) => (x, y, z) => lands.includes(landAt(x, z));
  const night = () => !!(window.__GAME_SKY && window.__GAME_SKY.night);
  /** A number that a test or a tool may pin; otherwise it follows the time of day. */
  const byTime = (k, day, nite) => {
    let set = null;
    Object.defineProperty(k, 'max', { enumerable: true, configurable: true, get: () => (set !== null ? set : night() ? nite : day), set: (v) => { set = v; } });
    return k;
  };
  const PLANT = 'plants';
  return [
    { key: 'runner', name: 'العدّاء الصغير', kind: 'animal', make: runner, hp: 5, speed: 3.4, radius: 0.4, height: 1.0, max: 3, likes: PLANT, drops: [[K.MEAT, 1]], where: in_('plains', 'forest', 'beach') },
    { key: 'longneck', name: 'العملاق أبو رقبة', kind: 'animal', make: longNeck, hp: 60, speed: 1.3, radius: 1.9, height: 7.4, max: 2, likes: PLANT, drops: [[K.MEAT, 5], [K.FUR, 3]], where: in_('plains', 'forest') },
    { key: 'threehorn', name: 'أبو ثلاث قرون', kind: 'animal', make: threeHorn, hp: 34, speed: 1.9, radius: 1.3, height: 2.7, max: 2, likes: PLANT, fights: true, dmg: 9, drops: [[K.MEAT, 3], [K.FUR, 2]], where: in_('plains') },
    { key: 'plated', name: 'أبو صفايح', kind: 'animal', make: plated, hp: 30, speed: 1.5, radius: 1.2, height: 3.0, max: 1, likes: PLANT, fights: true, dmg: 7, drops: [[K.MEAT, 2], [K.FUR, 1]], where: in_('forest', 'plains') },
    { key: 'flyer', name: 'الطاير الجلدي', kind: 'animal', make: flyer, hp: 8, speed: 4.2, radius: 0.9, height: 0.9, max: 2, fly: 9, perch: false, tame: false, drops: [[K.FEATHER, 2]], where: in_('mountain', 'beach', 'plains', 'desert') },
    { key: 'seareptile', name: 'وحش البحر القديم', kind: 'animal', make: seaReptile, hp: 30, speed: 2.2, radius: 1.4, height: 1.2, max: 1, swim: true, tame: false, drops: [[K.MEAT, 3]], where: in_('sea') },
    byTime({ key: 'quickclaw', name: 'المخلب السريع', kind: 'monster', make: quickClaw, hp: 12, speed: 4.4, radius: 0.5, height: 1.3, dmg: 6, where: in_('forest', 'plains', 'desert') }, 1, 2),
    byTime({ key: 'fangking', name: 'ملك الأنياب', kind: 'monster', make: fangKing, hp: 90, speed: 3.1, radius: 1.7, height: 5.4, dmg: 16, where: (x, y, z) => Math.random() < 0.03 && in_('forest', 'plains')(x, y, z) }, 1, 1),
  ];
}

/** The hatchlings: [colour key, name, skin, belly] in the order of the eggs (green, blue, red, gold). */
export const HATCH = [
  ['green', 'ديناصور صغير أخضر', 0x5fbf4a, 0xd8f0a0], ['blue', 'ديناصور صغير أزرق', 0x3f9ae0, 0xc8e8ff],
  ['red', 'ديناصور صغير أحمر', 0xe0503a, 0xffd0a0], ['gold', 'ديناصور صغير ذهبي', 0xf0c040, 0xfff2c0],
];
/** A hatchling: round body, a head too big for it, big shiny eyes, little arms, a stubby tail; it bounces as it runs. */
export function hatchling(color, light) {
  const { g, add, pivot } = kit();
  const skin = mat(color), belly = mat(light), foot = mat(0x4a3a2a), white = mat(0xffffff, { roughness: 0.3 });
  const body = pivot(0, 0.36, 0);
  add(0.36, 0.34, 0.44, 0, 0.04, 0, skin, body); add(0.3, 0.16, 0.36, 0, -0.08, 0.04, belly, body);
  for (let i = 0; i < 3; i++) add(0.06, 0.07, 0.07, 0, 0.24, 0.12 - i * 0.13, belly, body);      // little bumps down the back
  const head = pivot(0, 0.2, 0.2, body);
  add(0.36, 0.32, 0.36, 0, 0.12, 0.08, skin, head); add(0.3, 0.12, 0.2, 0, 0.0, 0.26, belly, head);
  for (const sx of [-1, 1]) { add(0.1, 0.11, 0.04, sx * 0.12, 0.18, 0.26, white, head); add(0.05, 0.07, 0.03, sx * 0.12, 0.17, 0.285, EYE, head); }
  for (const sx of [-1, 1]) { const a = pivot(sx * 0.15, 0.0, 0.18, body); add(0.05, 0.12, 0.05, 0, -0.06, 0.02, skin, a).rotation.x = 0.6; }
  const legs = [-1, 1].map((sx) => leg(add, pivot, body, sx * 0.11, -0.08, -0.04, 0.11, 0.15, 0.14, skin, foot));
  const tl = tail(add, pivot, body, 0, 0.02, -0.22, 3, 0.18, 0.16, 0.16, skin, 0.1);
  g.userData.anim = (t, moving) => {
    walk2(legs, t, moving, 16, 0.7);
    body.position.y = 0.36 + (moving ? Math.abs(Math.sin(t * 16)) * 0.06 : Math.abs(Math.sin(t * 2.4)) * 0.015);
    head.rotation.x = moving ? 0.1 : Math.sin(t * 1.1) * 0.12;
    head.rotation.z = moving ? 0 : Math.sin(t * 0.7) * 0.15;
    swing(tl, t, moving ? 16 : 3, 0.2);
  };
  return g;
}
/** Their kinds for life.js: never made on their own (max 0); the hatchery makes them and they follow. */
export function hatchKinds() {
  return HATCH.map(([c, name, a, b]) => ({ key: 'hatch-' + c, name, kind: 'animal', make: () => hatchling(a, b), hp: 30, speed: 3.4, radius: 0.35, height: 0.8, max: 0, tame: false, drops: [] }));
}
