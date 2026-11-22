// The two night monsters of "barari", box models of their own (they face +z and stand on their origin).
//   العاصوف   the dune walker: a squat heap of sand plates on four stubby legs, a ring of grit circling it,
//             two amber eyes in a slit, and a crest of dry thorns down its back.
//   الزمهرير  the frost stalker: tall and thin, ice-blue, long arms that hang to the knees, icicles on the
//             shoulders and a cold cyan glow in a single wide eye.
import * as THREE from 'three';

// a faint glow of their own, so that they can be made out in the dark (they only come at night)
const std = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, emissive: c, emissiveIntensity: 0.22, ...(o || {}) });
const glow = (c, k = 2.2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: k, roughness: 0.5 });
function kit() {
  const g = new THREE.Group();
  const add = (w, h, d, x, y, z, m, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
  const pivot = (x, y, z, parent = g) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  return { g, add, pivot };
}

/** العاصوف: the dune walker. */
export function asfoof() {
  const { g, add, pivot } = kit();
  const sand = std(0xd7b272), dark = std(0xa57d45), thorn = std(0x6b5233), eye = glow(0xffa424, 2.6);
  const body = pivot(0, 0, 0);
  add(1.0, 0.62, 1.1, 0, 0.78, 0, sand, body);
  add(0.86, 0.3, 0.92, 0, 1.22, -0.04, dark, body);
  add(0.7, 0.26, 0.7, 0, 1.48, -0.08, sand, body);
  add(0.9, 0.42, 0.34, 0, 0.92, 0.6, dark, body);                         // the face plate
  add(0.62, 0.09, 0.05, 0, 0.98, 0.79, std(0x2a1d10), body);              // the slit
  for (const sx of [-1, 1]) add(0.16, 0.07, 0.04, sx * 0.17, 0.98, 0.815, eye, body);
  for (let i = 0; i < 4; i++) { const t = add(0.08, 0.26 + (i % 2) * 0.1, 0.08, 0, 1.68 - i * 0.05, 0.12 - i * 0.24, thorn, body); t.rotation.x = -0.35; }
  for (const sx of [-1, 1]) { const s = add(0.1, 0.2, 0.1, sx * 0.42, 1.32, 0.3, thorn, body); s.rotation.z = -sx * 0.6; }
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [1, -1]) { const p = pivot(sx * 0.36, 0.52, sz * 0.36); add(0.26, 0.52, 0.26, 0, -0.26, 0, dark, p); add(0.3, 0.08, 0.32, 0, -0.48, 0.03, sand, p); legs.push(p); }
  // the ring of grit that circles it
  const ring = pivot(0, 0.95, 0);
  const grit = std(0xe8cf98);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, c = add(0.12, 0.12, 0.12, Math.cos(a) * 0.95, Math.sin(i * 1.7) * 0.18, Math.sin(a) * 0.95, grit, ring); c.rotation.set(i, i * 0.5, 0); }
  g.userData.anim = (t, moving) => {
    const a = moving ? Math.sin(t * 8) * 0.45 : 0;
    legs[0].rotation.x = a; legs[3].rotation.x = a; legs[1].rotation.x = -a; legs[2].rotation.x = -a;
    body.position.y = moving ? Math.abs(Math.sin(t * 8)) * 0.05 : Math.sin(t * 2) * 0.015;
    ring.rotation.y = t * (moving ? 3.2 : 1.4);
    eye.emissiveIntensity = 2.2 + Math.sin(t * 5) * 0.5;
  };
  return g;
}

/** الزمهرير: the frost stalker. */
export function zamharir() {
  const { g, add, pivot } = kit();
  const ice = std(0xa9d8ee, { roughness: 0.35 }), deep = std(0x5f9fc4, { roughness: 0.45 }), frost = std(0xeaf7ff, { roughness: 0.3 }), eye = glow(0x5ff6ff, 2.8);
  const torso = pivot(0, 1.25, 0);
  add(0.5, 0.78, 0.34, 0, 0.32, 0, ice, torso);
  add(0.62, 0.18, 0.4, 0, 0.74, 0, deep, torso);                           // shoulders
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const c = add(0.07, 0.3 - i * 0.07, 0.07, sx * (0.18 + i * 0.07), 0.95 - i * 0.03, -0.05 + i * 0.04, frost, torso); c.rotation.z = -sx * (0.15 + i * 0.12); }
  const head = pivot(0, 0.86, 0.02, torso);
  add(0.36, 0.4, 0.34, 0, 0.2, 0, ice, head);
  add(0.4, 0.08, 0.38, 0, 0.42, 0, frost, head);
  add(0.26, 0.07, 0.04, 0, 0.22, 0.18, eye, head);                          // one wide eye
  const arms = [];
  for (const sx of [-1, 1]) {
    const a = pivot(sx * 0.34, 0.66, 0, torso);
    add(0.13, 0.62, 0.13, 0, -0.31, 0, deep, a);
    const lo = pivot(0, -0.62, 0, a);
    add(0.11, 0.56, 0.11, 0, -0.28, 0, ice, lo);
    for (let f = 0; f < 3; f++) { const c = add(0.03, 0.16, 0.03, (f - 1) * 0.04, -0.62, 0.02, frost, lo); c.rotation.x = 0.2; }
    arms.push([a, lo]);
  }
  const legs = [];
  for (const sx of [-1, 1]) { const p = pivot(sx * 0.14, 1.25, 0); add(0.14, 0.64, 0.14, 0, -0.32, 0, deep, p); const k = pivot(0, -0.64, 0, p); add(0.12, 0.6, 0.12, 0, -0.3, 0, ice, k); add(0.16, 0.06, 0.24, 0, -0.6, 0.05, frost, k); legs.push([p, k]); }
  g.userData.anim = (t, moving) => {
    const a = moving ? Math.sin(t * 6) * 0.5 : 0;
    legs[0][0].rotation.x = a; legs[1][0].rotation.x = -a; legs[0][1].rotation.x = Math.max(0, -a) * 0.8; legs[1][1].rotation.x = Math.max(0, a) * 0.8;
    for (const [i, [up, lo]] of arms.entries()) { up.rotation.x = (moving ? -a * 0.6 : Math.sin(t * 1.3 + i) * 0.08) - 0.12; lo.rotation.x = -0.25 + Math.sin(t * 2 + i) * 0.06; }
    torso.rotation.x = moving ? 0.18 : 0.06;
    head.rotation.y = Math.sin(t * 0.7) * 0.35;
    eye.emissiveIntensity = 2.4 + Math.sin(t * 3.3) * 0.5;
  };
  return g;
}
