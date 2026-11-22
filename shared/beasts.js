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



// ---------------------------------------------------------------------- four-legged animals from one recipe
/**
 * One recipe for the four-legged animals: sizes in blocks, colours as numbers.
 *   body [w, h, l], leg [w, h], neck [w, h, lean] (optional), head [w, h, d], snout [w, h, d] (optional),
 *   ears 'up' | 'long' | 'droop' | 'round' | 'none', horns 'short' | 'curve' | 'antlers' (optional), hump, mane, wool,
 *   tail 'short' | 'long' | 'fluff' | 'up' | 'none', coat, belly, dark (hooves/nose), snoutCol, patch (a second colour in patches)
 */
function beast4(o) {
  const { g, add, limb } = kit();
  const mc = mat(o.coat), mb = mat(o.belly ?? o.coat), md = mat(o.dark ?? 0x2a221c), ms = mat(o.snoutCol ?? o.belly ?? o.coat), eye = mat(0x14110e);
  const [bw, bh, bl] = o.body, [lw, lh] = o.leg, by = lh + bh / 2;
  add(bw, bh, bl, 0, by, 0, o.wool ? mat(o.wool) : mc);
  if (o.belly != null && !o.wool) add(bw * 0.86, bh * 0.3, bl * 0.84, 0, by - bh * 0.38, 0, mb);
  if (o.patch != null) { const mp = mat(o.patch); add(bw * 1.02, bh * 0.5, bl * 0.28, 0, by + bh * 0.12, bl * 0.12, mp); add(bw * 1.02, bh * 0.4, bl * 0.2, 0, by - bh * 0.05, -bl * 0.3, mp); }
  if (o.hump) { add(bw * 0.7, bh * 0.55, bl * 0.34, 0, by + bh * 0.68, -bl * 0.05, mc); add(bw * 0.5, bh * 0.25, bl * 0.24, 0, by + bh * 1.02, -bl * 0.05, mc); }
  // neck and head at the front (+z)
  let hx = bl / 2, hy = by + bh * 0.25;
  if (o.neck) { const [nw, nh, lean] = o.neck; const n = add(nw, nh, nw * 1.1, 0, hy + nh / 2 - 0.05, hx - nw * 0.2 + lean * nh * 0.5, mc); n.rotation.x = lean; hy += nh * 0.92; hx += lean * nh * 0.85; if (o.mane) { const m = add(nw * 0.36, nh * 1.02, nw * 0.5, 0, n.position.y + 0.05, n.position.z - nw * 0.55, mat(o.mane)); m.rotation.x = lean; } }
  const [hw, hh, hd] = o.head;
  const headZ = hx + hd * 0.32;
  add(hw, hh, hd, 0, hy, headZ, o.wool && o.face != null ? mat(o.face) : mc);
  if (o.snout) { const [sw, sh, sd] = o.snout; add(sw, sh, sd, 0, hy - hh * 0.2, headZ + hd / 2 + sd / 2 - 0.02, ms); add(sw * 0.5, sh * 0.25, 0.02, 0, hy - hh * 0.12, headZ + hd / 2 + sd - 0.01, md); }
  for (const sx of [-1, 1]) add(0.05, 0.05, 0.02, sx * hw * 0.3, hy + hh * 0.12, headZ + hd / 2 + 0.005, eye);
  const ear = (w, h, d, x, y, z, rx = 0, rz = 0) => { const e = add(w, h, d, x, y, z, mc); e.rotation.x = rx; e.rotation.z = rz; };
  for (const sx of [-1, 1]) {
    if (o.ears === 'up') ear(0.08, 0.16, 0.05, sx * hw * 0.32, hy + hh / 2 + 0.07, headZ - hd * 0.15);
    else if (o.ears === 'long') ear(0.08, 0.34, 0.05, sx * hw * 0.24, hy + hh / 2 + 0.16, headZ - hd * 0.2, -0.15, sx * 0.12);
    else if (o.ears === 'droop') ear(0.18, 0.06, 0.1, sx * (hw / 2 + 0.07), hy + hh * 0.2, headZ - hd * 0.1, 0, sx * -0.4);
    else if (o.ears === 'round') ear(0.11, 0.11, 0.05, sx * hw * 0.36, hy + hh / 2 + 0.04, headZ - hd * 0.1);
    if (o.horns === 'short') { const h = add(0.06, 0.16, 0.06, sx * hw * 0.32, hy + hh / 2 + 0.07, headZ, mat(0xe6dcc4)); h.rotation.z = sx * -0.5; }
    if (o.horns === 'curve') { const h = add(0.07, 0.07, 0.24, sx * (hw / 2 + 0.03), hy + hh * 0.36, headZ - hd * 0.32, mat(0xb8ad94)); h.rotation.x = 0.6; }
    if (o.horns === 'antlers') { const am = mat(0xcab79a); add(0.04, 0.3, 0.04, sx * hw * 0.3, hy + hh / 2 + 0.15, headZ - hd * 0.2, am); add(0.16, 0.04, 0.04, sx * (hw * 0.3 + 0.08), hy + hh / 2 + 0.24, headZ - hd * 0.2, am); add(0.04, 0.14, 0.04, sx * (hw * 0.3 + 0.15), hy + hh / 2 + 0.32, headZ - hd * 0.2, am); add(0.04, 0.12, 0.04, sx * hw * 0.3, hy + hh / 2 + 0.36, headZ - hd * 0.12, am); }
  }
  // tail at the back
  const tz = -bl / 2;
  if (o.tail === 'short') add(0.08, 0.12, 0.08, 0, by + bh * 0.2, tz - 0.04, mc);
  else if (o.tail === 'long') { const t = add(0.08, bh * 1.1, 0.08, 0, by - bh * 0.1, tz - 0.06, o.mane != null ? mat(o.mane) : mc); t.rotation.x = 0.25; }
  else if (o.tail === 'fluff') { add(0.18, 0.18, 0.36, 0, by + bh * 0.05, tz - 0.16, mc); add(0.16, 0.16, 0.1, 0, by + bh * 0.05, tz - 0.38, mat(0xf4efe6)); }
  else if (o.tail === 'up') { const t = add(0.06, 0.4, 0.06, 0, by + bh * 0.5, tz - 0.06, mc); t.rotation.x = -0.35; }
  else if (o.tail === 'puff') add(0.12, 0.12, 0.1, 0, by + bh * 0.15, tz - 0.04, mat(0xf4efe6));
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [1, -1]) { const L = limb(lw, lh, lw, sx * (bw / 2 - lw / 2), lh, sz * (bl / 2 - lw * 0.8), o.legCol != null ? mat(o.legCol) : mc); legs.push(L); const hoof = new THREE.Mesh(new THREE.BoxGeometry(lw * 1.04, Math.min(0.08, lh * 0.18), lw * 1.04), md); hoof.position.set(0, -lh + Math.min(0.04, lh * 0.09), 0); L.add(hoof); }
  g.userData.anim = o.hop ? (t, moving) => { const a = moving ? Math.abs(Math.sin(t * 8)) : 0; g.children[0].position.y = by + a * 0.12; legs[1].rotation.x = legs[3].rotation.x = -a * 0.8; } : walk4(legs);
  return g;
}
export const cow = () => beast4({ body: [0.78, 0.66, 1.3], leg: [0.2, 0.62], head: [0.46, 0.44, 0.42], snout: [0.36, 0.22, 0.12], ears: 'droop', horns: 'short', tail: 'long', coat: 0x7a5236, belly: 0xe9e1d2, patch: 0xefe7d8, snoutCol: 0xe7b9a6, dark: 0x2a201a });
export const sheep = () => beast4({ body: [0.72, 0.64, 1.0], leg: [0.15, 0.46], head: [0.32, 0.36, 0.38], ears: 'droop', tail: 'puff', coat: 0x3d332c, wool: 0xf1ede4, face: 0x3d332c, legCol: 0x3d332c, dark: 0x1e1915 });
export const horse = (coat = 0x8a5a33, mane = 0x2a1d14) => beast4({ body: [0.6, 0.66, 1.42], leg: [0.17, 0.92], neck: [0.3, 0.72, 0.55], head: [0.3, 0.34, 0.6], ears: 'up', mane, tail: 'long', coat, belly: coat, dark: 0x1e1712 });
export const donkey = () => beast4({ body: [0.54, 0.56, 1.1], leg: [0.15, 0.7], neck: [0.26, 0.5, 0.5], head: [0.28, 0.3, 0.52], ears: 'long', mane: 0x3b3430, tail: 'long', coat: 0x7d7470, belly: 0xc9c2bc, snoutCol: 0xd8d2cc, dark: 0x262220 });
export const camel = () => beast4({ body: [0.66, 0.6, 1.4], leg: [0.16, 1.1], hump: true, neck: [0.24, 0.9, 0.85], head: [0.28, 0.28, 0.5], ears: 'round', tail: 'short', coat: 0xc9a06a, belly: 0xd9b884, dark: 0x5a4430 });
export const deer = () => beast4({ body: [0.46, 0.5, 1.0], leg: [0.11, 0.8], neck: [0.2, 0.46, 0.35], head: [0.24, 0.26, 0.4], ears: 'up', horns: 'antlers', tail: 'puff', coat: 0xa06a3c, belly: 0xe8d6bc, dark: 0x2a1f16 });
export const rabbit = (coat = 0xb89a7c) => beast4({ body: [0.3, 0.28, 0.42], leg: [0.08, 0.12], head: [0.24, 0.22, 0.24], ears: 'long', tail: 'puff', coat, belly: 0xf1e9dc, dark: 0x3a2e24, hop: true });
export const cat = (coat = 0xd39a52) => beast4({ body: [0.28, 0.28, 0.66], leg: [0.08, 0.26], head: [0.28, 0.26, 0.26], snout: [0.14, 0.08, 0.06], ears: 'up', tail: 'up', coat, belly: 0xf4ead8, snoutCol: 0xf4ead8, patch: coat === 0x3a3a40 ? null : 0xa86a2c, dark: 0x2a201a });
export const dog = (coat = 0xc9a070) => beast4({ body: [0.36, 0.38, 0.8], leg: [0.12, 0.38], head: [0.32, 0.3, 0.32], snout: [0.18, 0.14, 0.16], ears: 'droop', tail: 'up', coat, belly: 0xefe2cc, snoutCol: 0xefe2cc, dark: 0x1e1915 });
export const fox = () => beast4({ body: [0.3, 0.3, 0.72], leg: [0.09, 0.3], head: [0.3, 0.26, 0.28], snout: [0.14, 0.1, 0.16], ears: 'up', tail: 'fluff', coat: 0xd8662a, belly: 0xf6ecdc, snoutCol: 0xf6ecdc, legCol: 0x2a201a, dark: 0x1a1512 });
export const polarBear = () => bear({ coat: 0xeef0ec, snout: 0xd9d6cc });

/** A penguin: it waddles. */
export function penguin() {
  const { g, add, limb } = kit(), mb = mat(0x1f2329), mw = mat(0xf4f4f0), mo = mat(0xf0a020);
  add(0.4, 0.62, 0.34, 0, 0.5, 0, mb); add(0.3, 0.5, 0.06, 0, 0.47, 0.17, mw);
  add(0.32, 0.26, 0.3, 0, 0.92, 0.02, mb); add(0.08, 0.06, 0.14, 0, 0.9, 0.22, mo);
  for (const sx of [-1, 1]) { add(0.06, 0.06, 0.02, sx * 0.08, 0.96, 0.17, mw); add(0.04, 0.4, 0.14, sx * 0.22, 0.56, 0, mb); }
  const feet = [limb(0.12, 0.2, 0.18, -0.1, 0.2, 0.04, mo), limb(0.12, 0.2, 0.18, 0.1, 0.2, 0.04, mo)];
  g.userData.anim = (t, moving) => { const a = moving ? Math.sin(t * 10) : 0; g.rotation.z = a * 0.12; feet[0].rotation.x = a * 0.4; feet[1].rotation.x = -a * 0.4; };
  return g;
}
/** A duck. */
export function duck() {
  const { g, add, limb } = kit(), mb = mat(0xe9e2cf), mg = mat(0x2f7a4a), mo = mat(0xf0a020);
  add(0.3, 0.26, 0.48, 0, 0.32, 0, mb); add(0.2, 0.12, 0.12, 0, 0.42, -0.28, mb);
  add(0.18, 0.22, 0.2, 0, 0.58, 0.2, mg); add(0.12, 0.05, 0.14, 0, 0.55, 0.36, mo);
  for (const sx of [-1, 1]) add(0.03, 0.03, 0.02, sx * 0.06, 0.62, 0.305, mat(0x14110e));
  const legs = [limb(0.05, 0.18, 0.05, -0.07, 0.19, 0, mo), limb(0.05, 0.18, 0.05, 0.07, 0.19, 0, mo)];
  g.userData.anim = (t, moving) => { const a = moving ? Math.sin(t * 12) * 0.6 : 0; legs[0].rotation.x = a; legs[1].rotation.x = -a; };
  return g;
}
/** A frog: it hops. */
export function frog() {
  const { g, add } = kit(), mg = mat(0x5aa83a), ml = mat(0xd7e7a0), me = mat(0x14110e);
  const body = new THREE.Group(); g.add(body);
  add(0.4, 0.2, 0.42, 0, 0.14, 0, mg, body); add(0.32, 0.06, 0.34, 0, 0.05, 0.02, ml, body);
  for (const sx of [-1, 1]) { add(0.12, 0.1, 0.12, sx * 0.12, 0.28, 0.12, mg, body); add(0.06, 0.06, 0.02, sx * 0.12, 0.29, 0.185, me, body); add(0.12, 0.08, 0.26, sx * 0.24, 0.06, -0.08, mg, body); }
  g.userData.anim = (t, moving) => { body.position.y = moving ? Math.abs(Math.sin(t * 7)) * 0.3 : 0; };
  return g;
}
/** A sea turtle on the sand. */
export function turtle() {
  const { g, add, limb } = kit(), ms = mat(0x3f7a4a), md = mat(0x2b5634), mk = mat(0x8fb27a);
  add(0.7, 0.24, 0.8, 0, 0.26, 0, ms); add(0.5, 0.1, 0.6, 0, 0.42, 0, md); add(0.6, 0.06, 0.7, 0, 0.12, 0, mk);
  add(0.22, 0.18, 0.24, 0, 0.24, 0.5, mk); for (const sx of [-1, 1]) add(0.04, 0.04, 0.02, sx * 0.07, 0.28, 0.62, mat(0x14110e));
  const legs = []; for (const sx of [-1, 1]) for (const sz of [1, -1]) legs.push(limb(0.18, 0.12, 0.24, sx * 0.38, 0.14, sz * 0.26, mk));
  g.userData.anim = walk4(legs);
  return g;
}
/** A crab: it walks sideways (the turn is the world's; the claws wave). */
export function crab() {
  const { g, add } = kit(), mr = mat(0xd2532e), md = mat(0xa83a1e);
  add(0.44, 0.16, 0.34, 0, 0.18, 0, mr);
  for (const sx of [-1, 1]) { add(0.03, 0.12, 0.03, sx * 0.08, 0.32, 0.12, md); add(0.05, 0.05, 0.05, sx * 0.08, 0.4, 0.12, mat(0x14110e)); for (let i = 0; i < 3; i++) { const l = add(0.22, 0.04, 0.04, sx * 0.3, 0.1, 0.1 - i * 0.1, md); l.rotation.z = sx * 0.5; } }
  const claws = [-1, 1].map((sx) => { const c = add(0.14, 0.1, 0.14, sx * 0.26, 0.22, 0.24, mr); return c; });
  g.userData.anim = (t) => { claws[0].position.y = 0.22 + Math.sin(t * 4) * 0.03; claws[1].position.y = 0.22 + Math.cos(t * 4) * 0.03; };
  return g;
}
/** A dolphin: it swims with a beat of its tail. */
export function dolphin() {
  const { g, add } = kit(), mb = mat(0x7d93a8, { roughness: 0.4 }), ml = mat(0xdfe6ec, { roughness: 0.4 });
  add(0.34, 0.34, 1.2, 0, 0.3, 0, mb); add(0.28, 0.12, 1.0, 0, 0.16, 0.02, ml); add(0.16, 0.12, 0.3, 0, 0.26, 0.7, ml);
  add(0.06, 0.24, 0.24, 0, 0.56, -0.05, mb); for (const sx of [-1, 1]) { const f = add(0.3, 0.04, 0.16, sx * 0.26, 0.18, 0.2, mb); f.rotation.z = sx * -0.4; add(0.04, 0.04, 0.02, sx * 0.13, 0.36, 0.55, mat(0x14110e)); }
  const tail = new THREE.Group(); tail.position.set(0, 0.3, -0.6); const tf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.22), mb); tf.position.set(0, 0, -0.12); tail.add(tf); g.add(tail);
  g.userData.anim = (t, moving) => { tail.rotation.x = Math.sin(t * (moving ? 9 : 3)) * 0.4; };
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
    { key: 'camel', name: 'جمل', kind: 'animal', make: camel, hp: 20, speed: 2.0, radius: 0.9, height: 2.4, max: 1, likes: 'plants', drops: [] },
    { key: 'rabbit', name: 'أرنب', kind: 'animal', make: () => rabbit(0xcdb08a), hp: 3, speed: 3.0, radius: 0.3, height: 0.6, max: 2, drops: [[K.MEAT, 1], [K.FUR, 1]] },
    { key: 'cat', name: 'قطوة', kind: 'animal', make: () => cat(), hp: 6, speed: 2.4, radius: 0.4, height: 0.7, max: 1, likes: 'meat', drops: [] },
    { key: 'dove', name: 'حمامة', kind: 'animal', make: () => bird({ body: 0xb9b2a8, belly: 0xece6dc }), hp: 2, speed: 2.6, radius: 0.4, height: 0.45, max: 3, fly: 3.2, perch: true, drops: [[K.FEATHER, 1]] },
    ...sea,
  ];
  if (world === 'dhalam') return [
    { key: 'bear', name: 'دب', kind: 'animal', make: () => bear(), hp: 26, speed: 2.3, radius: 0.9, height: 1.55, max: 1, likes: 'meat', fights: true, dmg: 9, drops: [[K.MEAT, 3], [K.FUR, 2]] },
    { key: 'deer', name: 'غزال', kind: 'animal', make: deer, hp: 9, speed: 3.2, radius: 0.6, height: 1.8, max: 2, drops: [[K.MEAT, 2], [K.FUR, 1]] },
    { key: 'fox', name: 'ثعلب', kind: 'animal', make: fox, hp: 6, speed: 3.0, radius: 0.4, height: 0.7, max: 1, likes: 'meat', drops: [[K.FUR, 1]] },
    { key: 'rabbit', name: 'أرنب', kind: 'animal', make: () => rabbit(0x8a7a6a), hp: 3, speed: 3.0, radius: 0.3, height: 0.6, max: 2, drops: [[K.MEAT, 1], [K.FUR, 1]] },
    { key: 'crow', name: 'غراب', kind: 'animal', make: () => bird({ body: 0x23262b, belly: 0x33373d, beak: 0x4a4d52 }), hp: 2, speed: 2.8, radius: 0.4, height: 0.45, max: 3, fly: 3.6, perch: true, drops: [[K.FEATHER, 1]] },
    ...sea,
  ];
  if (world === 'kawkab') return [
    { key: 'glider', name: 'طير الوهج', kind: 'animal', make: () => bird({ body: 0x3fd6c2, belly: 0xc8fff4, beak: 0xff9be0 }), hp: 2, speed: 2.6, radius: 0.4, height: 0.45, max: 3, fly: 3.4, perch: true, drops: [[K.FEATHER, 1]] },
    ...sea,
  ];
  return sea;
}

/**
 * The land animals of a world that has lands (البراري): each kind is made only in the lands that suit it.
 * landAt(x, z) -> 'desert' | 'forest' | 'snow' | 'plains' | 'beach' | 'sea' | 'mountain' (play coordinates).
 * Spread into createLife's kinds next to extraKinds(world) and the world's own monsters.
 */
export function landKinds(world, landAt) {
  const in_ = (...lands) => (x, y, z) => lands.includes(landAt(x, z));
  void world;
  const PLANT = 'plants', MEAT = 'meat';
  return [
    // the farm animals of the grass and the desert's edge
    { key: 'cow', name: 'بقرة', kind: 'animal', make: cow, hp: 12, speed: 1.4, radius: 0.85, height: 1.4, max: 3, drops: [[K.MEAT, 2], [K.FUR, 1]], where: in_('plains', 'forest') },
    { key: 'sheep', name: 'خروف', kind: 'animal', make: sheep, hp: 9, speed: 1.6, radius: 0.65, height: 1.2, max: 3, drops: [[K.MEAT, 1], [K.WOOL, 2]], where: in_('plains', 'mountain', 'forest') },
    { key: 'goat', name: 'عنز', kind: 'animal', make: () => goat(), hp: 8, speed: 2.0, radius: 0.55, height: 1.05, max: 2, drops: [[K.MEAT, 1], [K.FUR, 1]], where: in_('desert', 'plains', 'mountain') },
    { key: 'hen', name: 'دياية', kind: 'animal', make: () => hen(), hp: 4, speed: 1.7, radius: 0.4, height: 0.9, max: 3, drops: [[K.CHICKEN, 1], [K.FEATHER, 2]], where: in_('plains', 'forest', 'desert') },
    { key: 'duck', name: 'بطة', kind: 'animal', make: duck, hp: 3, speed: 1.5, radius: 0.4, height: 0.7, max: 2, drops: [[K.CHICKEN, 1], [K.FEATHER, 1]], where: in_('plains', 'beach', 'forest') },
    // the ones that are befriended, not hunted: fed from the hand they follow (nothing is gained by striking them)
    { key: 'horse', name: 'حصان', kind: 'animal', make: () => horse(), hp: 16, speed: 3.0, radius: 0.85, height: 1.9, max: 2, likes: PLANT, drops: [], where: in_('plains') },
    { key: 'horse2', name: 'حصان أبيض', kind: 'animal', make: () => horse(0xe9e4dc, 0x9a948c), hp: 16, speed: 3.0, radius: 0.85, height: 1.9, max: 1, likes: PLANT, drops: [], where: in_('plains') },
    { key: 'donkey', name: 'حمار', kind: 'animal', make: donkey, hp: 14, speed: 2.2, radius: 0.75, height: 1.6, max: 1, likes: PLANT, drops: [], where: in_('plains', 'desert') },
    { key: 'camel', name: 'جمل', kind: 'animal', make: camel, hp: 20, speed: 2.0, radius: 0.9, height: 2.4, max: 2, likes: PLANT, drops: [], where: in_('desert') },
    { key: 'cat', name: 'قطوة', kind: 'animal', make: () => cat(), hp: 6, speed: 2.4, radius: 0.4, height: 0.7, max: 1, likes: MEAT, drops: [], where: in_('plains', 'forest', 'desert') },
    { key: 'dog', name: 'كلب', kind: 'animal', make: () => dog(), hp: 10, speed: 2.8, radius: 0.5, height: 0.9, max: 1, likes: MEAT, drops: [], where: in_('plains', 'forest') },
    // the wild ones
    { key: 'deer', name: 'غزال', kind: 'animal', make: deer, hp: 9, speed: 3.2, radius: 0.6, height: 1.8, max: 2, drops: [[K.MEAT, 2], [K.FUR, 1]], where: in_('forest', 'plains') },
    { key: 'rabbit', name: 'أرنب', kind: 'animal', make: () => rabbit(), hp: 3, speed: 3.0, radius: 0.3, height: 0.6, max: 3, drops: [[K.MEAT, 1], [K.FUR, 1]], where: in_('plains', 'forest', 'desert') },
    { key: 'snowhare', name: 'أرنب الثلج', kind: 'animal', make: () => rabbit(0xf2f2ee), hp: 3, speed: 3.0, radius: 0.3, height: 0.6, max: 2, drops: [[K.MEAT, 1], [K.FUR, 1]], where: in_('snow') },
    { key: 'fox', name: 'ثعلب', kind: 'animal', make: fox, hp: 6, speed: 3.0, radius: 0.4, height: 0.7, max: 1, likes: MEAT, drops: [[K.FUR, 1]], where: in_('forest', 'snow') },
    { key: 'frog', name: 'ضفدع', kind: 'animal', make: frog, hp: 2, speed: 1.6, radius: 0.3, height: 0.4, max: 2, tame: false, drops: [], where: in_('forest', 'plains', 'beach') },
    { key: 'bear', name: 'دب', kind: 'animal', make: () => bear(), hp: 26, speed: 2.3, radius: 0.9, height: 1.55, max: 1, likes: MEAT, fights: true, dmg: 9, drops: [[K.MEAT, 3], [K.FUR, 2]], where: in_('forest', 'mountain') },
    { key: 'polarbear', name: 'دب أبيض', kind: 'animal', make: polarBear, hp: 28, speed: 2.3, radius: 0.9, height: 1.6, max: 1, likes: MEAT, fights: true, dmg: 10, drops: [[K.MEAT, 3], [K.FUR, 2]], where: in_('snow') },
    { key: 'penguin', name: 'بطريق', kind: 'animal', make: penguin, hp: 5, speed: 1.2, radius: 0.35, height: 1.1, max: 3, likes: MEAT, drops: [[K.FEATHER, 1]], where: in_('snow') },
    // the shore and the air
    { key: 'turtle', name: 'سلحفاة', kind: 'animal', make: turtle, hp: 10, speed: 0.8, radius: 0.5, height: 0.5, max: 2, likes: PLANT, drops: [], where: in_('beach') },
    { key: 'crab', name: 'سرطان', kind: 'animal', make: crab, hp: 3, speed: 1.4, radius: 0.35, height: 0.45, max: 3, tame: false, drops: [[K.SHRIMP, 1]], where: in_('beach') },
    { key: 'sparrow', name: 'عصفور', kind: 'animal', make: () => bird({ body: 0x9a6a3e, belly: 0xf3e2c4, beak: 0xe2a03a }), hp: 2, speed: 2.6, radius: 0.4, height: 0.45, max: 3, fly: 3.0, perch: true, drops: [[K.FEATHER, 1]], where: in_('forest', 'plains', 'desert', 'snow', 'mountain') },
    { key: 'parrot', name: 'ببغاء', kind: 'animal', make: () => bird({ body: 0x2fae5a, belly: 0xe2c03a, beak: 0xd2532e }), hp: 2, speed: 2.6, radius: 0.4, height: 0.45, max: 2, fly: 3.4, perch: true, drops: [[K.FEATHER, 1]], where: in_('forest') },
    { key: 'gull', name: 'نورس', kind: 'animal', make: () => bird({ body: 0xe9edf1, belly: 0xffffff, beak: 0xf0a020 }), hp: 2, speed: 2.9, radius: 0.4, height: 0.45, max: 2, fly: 4.4, perch: true, drops: [[K.FEATHER, 1]], where: in_('beach') },
    { key: 'dolphin', name: 'دلفين', kind: 'animal', make: dolphin, hp: 14, speed: 3.0, radius: 0.7, height: 0.6, max: 2, swim: true, tame: false, drops: [], where: in_('sea') },
  ];
}
