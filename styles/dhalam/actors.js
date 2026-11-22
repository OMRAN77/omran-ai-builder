// Characters and creatures of "dhalam", built in code from chamfered / tapered boxes.
// Every builder returns a Group standing on y = 0, facing +Z, with userData.tag (where the
// name tag attaches) and userData.height.

import * as THREE from 'three';
import { patch } from './fx.js';
import { mat, box, boxGeo, ball, at, grp, strut, ribbon, aim, bake, Loft, Cards, cardMat, mergedMesh } from './kit.js';

const V = (x, y, z) => [x, y, z];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Joint: a group at a position with a rotation, holding children. */
function J(x, y, z, rx, ry, rz, ...children) {
  const g = grp(...children);
  g.position.set(x, y, z);
  g.rotation.set(rx, ry, rz);
  return g;
}

function glowDot(sprites, size, color, opacity = 0.9) {
  const m = patch(new THREE.SpriteMaterial({ map: sprites.glow, color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), { additive: true });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}
function emissiveBox(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), patch(new THREE.MeshBasicMaterial({ color })));
}

// ---------------------------------------------------------------------------------------------
// The survivor
// ---------------------------------------------------------------------------------------------
/** Felling axe. Local +Y runs from the butt of the handle to the head, the blade points to +X. */
export function makeAxe(len = 0.9) {
  const wood = mat(0x5e4a36, { tex: 'wood', rough: 0.85 });
  const iron = mat(0x8a9098, { tex: 'iron', rough: 0.4, metal: 0.5 });
  const dark = mat(0x3a3e44, { tex: 'iron', rough: 0.55, metal: 0.45 });
  const edge = mat(0xc2c8cf, { tex: 'iron', rough: 0.28, metal: 0.55 });
  const g = new THREE.Group();
  g.add(at(box(0.04, len * 0.52, 0.03, wood, { r: 0.012, anchor: 'bottom', taper: [0.86, 0.9] }), 0, 0, 0));
  g.add(at(box(0.035, len * 0.5, 0.027, wood, { r: 0.011, anchor: 'bottom' }), 0.004, len * 0.5, 0, 0, 0, -0.02));
  g.add(at(box(0.05, 0.045, 0.036, wood, { r: 0.012 }), -0.004, 0.02, 0));                // swell at the butt
  g.add(at(box(0.044, 0.05, 0.034, dark, { r: 0.006 }), 0.004, len * 0.52, 0));            // leather / iron collar
  const hy = len - 0.075;
  g.add(at(box(0.062, 0.088, 0.046, dark, { r: 0.01 }), 0.006, hy, 0));                    // eye of the head
  g.add(at(box(0.036, 0.058, 0.048, dark, { r: 0.01 }), -0.038, hy + 0.004, 0));           // poll
  // the blade: narrow and thick at the eye, flaring to a thin bearded edge (the box's "top" is the eye end)
  g.add(at(box(0.184, 0.132, 0.007, iron, { r: 0.002, taper: [0.4, 4.2], shear: [0.016, 0] }), 0.1, hy - 0.014, 0, 0, 0, Math.PI / 2));
  g.add(at(box(0.05, 0.03, 0.03, dark, { r: 0.006 }), 0.05, hy + 0.002, 0));                // langet
  // ground edge, in three short facets so it reads as a curve
  const ex = 0.168, ey = hy - 0.03;
  g.add(strut(V(ex - 0.016, ey + 0.098, 0), V(ex + 0.004, ey + 0.036, 0), 0.016, edge, { r: 0.003, depth: 0.006 }));
  g.add(strut(V(ex + 0.004, ey + 0.04, 0), V(ex + 0.006, ey - 0.03, 0), 0.016, edge, { r: 0.003, depth: 0.006 }));
  g.add(strut(V(ex + 0.006, ey - 0.026, 0), V(ex - 0.014, ey - 0.092, 0), 0.016, edge, { r: 0.003, depth: 0.006 }));
  return g;
}

/** Pickaxe. Local +Y runs from the butt of the handle to the head; the picks point along +/-X. */
export function makePick(len = 0.8) {
  const wood = mat(0x5e4a36, { tex: 'wood', rough: 0.85 });
  const iron = mat(0x868c94, { tex: 'iron', rough: 0.42, metal: 0.5 });
  const dark = mat(0x3a3e44, { tex: 'iron', rough: 0.55, metal: 0.45 });
  const g = new THREE.Group();
  g.add(at(box(0.042, len, 0.032, wood, { r: 0.012, anchor: 'bottom', taper: [0.9, 0.95] }), 0, 0, 0));
  g.add(at(box(0.052, 0.045, 0.038, wood, { r: 0.012 }), 0, 0.02, 0));
  const hy = len - 0.045;
  g.add(at(box(0.075, 0.085, 0.06, dark, { r: 0.012 }), 0, hy, 0));
  for (const sx of [-1, 1]) {
    g.add(strut(V(sx * 0.03, hy, 0), V(sx * 0.16, hy + 0.012, 0), 0.05, iron, { r: 0.01, depth: 0.04 }));
    g.add(strut(V(sx * 0.155, hy + 0.012, 0), V(sx * 0.27, hy - 0.03, 0), 0.042, iron, { r: 0.009, depth: 0.034 }));
    g.add(strut(V(sx * 0.265, hy - 0.028, 0), V(sx * 0.36, hy - 0.105, 0), 0.034, iron, { r: 0.007, depth: 0.028, taper: 0.25 }));
  }
  return g;
}

/** First-person right arm holding a tool, in camera space (x right, y up, -z forward). */
export function makeViewArm(tool) {
  const sleeve = mat(0x343a41, { tex: 'cloth', rough: 0.95 });
  const leather = mat(0x5a4634, { tex: 'leather', rough: 0.78 });
  const glove = mat(0x74593f, { tex: 'leather', rough: 0.72 });
  const gloveD = mat(0x4a3a2b, { tex: 'leather', rough: 0.8 });
  const iron = mat(0x8b9198, { tex: 'iron', rough: 0.42, metal: 0.5 });
  const g = new THREE.Group();
  g.name = 'viewArm';
  const E = V(0.36, -0.62, 0.02), W = V(0.09, -0.125, -0.2), F = V(0.0, 0.0, -0.26);
  g.add(strut(V(0.52, -0.95, 0.2), E, 0.17, sleeve, { r: 0.04, depth: 0.16 }));
  g.add(strut(add3(E, V(0.03, -0.05, 0.02)), add3(W, V(0.012, -0.015, 0.008)), 0.118, sleeve, { r: 0.035, depth: 0.118, taper: 0.8 }));   // sleeve under the bracer
  // bracer: leather with an iron splint and two straps
  const b0 = add3(W, V(0.135, -0.25, 0.11)), b1 = add3(W, V(0.008, -0.012, 0.006));
  g.add(strut(b0, b1, 0.13, leather, { r: 0.03, depth: 0.128, taper: 0.76 }));
  g.add(strut(add3(b0, V(-0.05, 0.04, 0.035)), add3(b1, V(-0.04, 0.035, 0.03)), 0.05, iron, { r: 0.012, depth: 0.03, taper: 0.8 }));
  for (const t of [0.22, 0.62]) {
    const p = V(b0[0] + (b1[0] - b0[0]) * t, b0[1] + (b1[1] - b0[1]) * t, b0[2] + (b1[2] - b0[2]) * t);
    const q = V(b0[0] + (b1[0] - b0[0]) * (t + 0.09), b0[1] + (b1[1] - b0[1]) * (t + 0.09), b0[2] + (b1[2] - b0[2]) * (t + 0.09));
    g.add(strut(p, q, 0.142 - t * 0.03, gloveD, { r: 0.008, depth: 0.14 - t * 0.03 }));
  }
  // the gloved hand, built in a frame whose +Y runs along the handle and +Z faces the eye
  const dir = new THREE.Vector3(-0.2, 0.84, -0.5).normalize();
  const hand = new THREE.Group();
  aim(hand, [dir.x, dir.y, dir.z], [1, 0, 0.25]);
  hand.position.set(F[0], F[1], F[2]);
  hand.add(at(box(0.07, 0.118, 0.108, glove, { r: 0.03, seg: 3 }), 0.048, -0.004, 0.0));                    // back of the hand
  hand.add(at(box(0.11, 0.108, 0.045, gloveD, { r: 0.02 }), 0.0, -0.004, -0.048));                           // fingers round the far side
  for (let k = 0; k < 4; k++) hand.add(at(box(0.04, 0.0235, 0.078, k % 2 ? glove : gloveD, { r: 0.011 }), -0.046, -0.044 + k * 0.0268, 0.004, 0, 0.12, 0));   // fingertips
  hand.add(at(box(0.09, 0.034, 0.038, glove, { r: 0.014 }), 0.002, 0.03, 0.05, 0, 0, 0.45));                 // thumb across the near side
  hand.add(at(box(0.022, 0.1, 0.07, iron, { r: 0.008 }), 0.088, 0.0, -0.004));                               // knuckle plate
  hand.add(at(box(0.1, 0.04, 0.115, gloveD, { r: 0.016 }), 0.05, -0.078, 0.004, 0, 0, 0.2));                 // cuff
  g.add(hand);
  aim(tool, [dir.x, dir.y, dir.z], [-0.72, 0.05, -0.7]);
  tool.position.set(F[0] - dir.x * 0.17, F[1] - dir.y * 0.17, F[2] - dir.z * 0.17);
  g.add(tool);
  bake(g);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  return g;
}

export function makeLantern(sprites, lit = true) {
  const iron = mat(0x24272b, { tex: 'iron', rough: 0.55, metal: 0.5 });
  const g = new THREE.Group();
  g.add(at(box(0.095, 0.018, 0.095, iron, { r: 0.004 }), 0, 0, 0));
  g.add(at(box(0.095, 0.018, 0.095, iron, { r: 0.004 }), 0, -0.145, 0));
  g.add(at(box(0.055, 0.03, 0.055, iron, { r: 0.004 }), 0, 0.022, 0));
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.add(at(box(0.011, 0.135, 0.011, iron, { r: 0 }), dx * 0.04, -0.072, dz * 0.04));
  g.add(at(box(0.011, 0.06, 0.011, iron, { r: 0 }), 0, 0.062, 0));
  if (lit) {
    g.add(at(emissiveBox(0.05, 0.095, 0.05, new THREE.Color(5, 2.3, 0.7)), 0, -0.072, 0));
    g.add(at(glowDot(sprites, 0.6, new THREE.Color(1.2, 0.5, 0.14), 0.55), 0, -0.072, 0));
  }
  return g;
}

export function makeSurvivor(sprites, { lantern: lit = true } = {}) {
  const cloak = mat(0x2b3138, { tex: 'cloth', rough: 0.95 });
  const cloak2 = mat(0x22282e, { tex: 'cloth', rough: 0.95 });
  const hood = mat(0x252b31, { tex: 'cloth', rough: 0.95 });
  const tunic = mat(0x4b453c, { tex: 'cloth', rough: 0.95 });
  const trouser = mat(0x24272c, { tex: 'cloth', rough: 0.95 });
  const leather = mat(0x4d3d2f, { tex: 'leather', rough: 0.78 });
  const leatherD = mat(0x2c251f, { tex: 'leather', rough: 0.82 });
  const iron = mat(0x80868d, { tex: 'iron', rough: 0.42, metal: 0.5 });
  const ironD = mat(0x4b5057, { tex: 'iron', rough: 0.5, metal: 0.45 });
  const skin = mat(0x8a6a56, { tex: 'plain', rough: 0.8 });
  const skinD = mat(0x5b4336, { tex: 'plain', rough: 0.85 });
  const scarf = mat(0x35201b, { tex: 'cloth', rough: 0.95 });
  const scarfL = mat(0x4a2c24, { tex: 'cloth', rough: 0.95 });
  const eyeW = mat(0xcdd3d6, { tex: null, rough: 0.25 });
  const dark = mat(0x0b0c0e, { tex: null, rough: 1 });

  const g = new THREE.Group();
  g.name = 'survivor';

  // ---- legs: weight on his left leg, the right relaxed and a little forward --------------------
  const leg = (rx, ry, rz, kneeRx, footRx) => J(0, 0, 0, rx, ry, rz,
    at(box(0.15, 0.49, 0.165, trouser, { r: 0.03, anchor: 'top', taper: [1.16, 1.12] }), 0, 0.02, 0),
    at(box(0.125, 0.085, 0.13, leather, { r: 0.022 }), 0, -0.465, 0.03),                        // knee cop
    J(0, -0.47, 0, kneeRx, 0, 0,
      at(box(0.115, 0.42, 0.13, trouser, { r: 0.025, anchor: 'top', taper: [1.12, 1.1] }), 0, 0, 0),
      at(box(0.1, 0.29, 0.03, iron, { r: 0.012, taper: [1.14, 1] }), 0, -0.2, 0.062),             // greave
      at(box(0.108, 0.04, 0.045, ironD, { r: 0.01 }), 0, -0.045, 0.062),
      at(box(0.122, 0.022, 0.135, leatherD, { r: 0.006 }), 0, -0.13, 0.0),                        // straps
      at(box(0.122, 0.022, 0.135, leatherD, { r: 0.006 }), 0, -0.27, 0.0),
      J(0, 0, 0, footRx, 0, 0,
        at(box(0.124, 0.15, 0.148, leatherD, { r: 0.025 }), 0, -0.37, 0.0),                       // boot shaft
        at(box(0.112, 0.08, 0.26, leatherD, { r: 0.03, taper: [0.9, 0.9] }), 0, -0.482, 0.05),     // foot
        at(box(0.116, 0.02, 0.268, dark, { r: 0.006 }), 0, -0.519, 0.05)),
    ),
  );
  const legL = leg(0.03, 0.14, 0.03, 0.03, -0.06);
  legL.position.set(0.092, 1.0, 0);
  const legR = leg(-0.16, -0.32, -0.07, 0.27, -0.11);
  legR.position.set(-0.092, 1.0, 0.005);
  g.add(legL, legR);

  // ---- torso -------------------------------------------------------------------------------
  const T = J(0.014, 1.0, 0, 0.02, -0.08, 0.022);
  g.add(T);
  T.add(at(box(0.32, 0.16, 0.2, trouser, { r: 0.03 }), 0, 0.02, 0));
  T.add(at(box(0.36, 0.17, 0.24, tunic, { r: 0.025, anchor: 'top', taper: [0.88, 0.88] }), 0, 0.1, 0));    // gambeson skirt
  for (const sx of [-1, 1]) T.add(at(box(0.15, 0.1, 0.03, leather, { r: 0.012, anchor: 'top' }), sx * 0.095, -0.05, 0.112, -0.05, 0, 0));    // tassets over the thighs
  T.add(at(box(0.31, 0.2, 0.195, tunic, { r: 0.03 }), 0, 0.2, 0));
  T.add(at(box(0.35, 0.3, 0.22, leather, { r: 0.035, taper: [1.18, 1.08] }), 0, 0.41, 0.003));              // cuirass
  T.add(at(box(0.25, 0.075, 0.026, iron, { r: 0.009 }), 0, 0.5, 0.118));
  T.add(at(box(0.235, 0.07, 0.026, iron, { r: 0.009 }), 0, 0.432, 0.121));
  T.add(at(box(0.21, 0.065, 0.026, ironD, { r: 0.009 }), 0, 0.368, 0.118));
  T.add(at(box(0.335, 0.06, 0.215, leatherD, { r: 0.012 }), 0, 0.115, 0));                                  // belt
  T.add(at(box(0.052, 0.062, 0.016, iron, { r: 0.007 }), 0.015, 0.115, 0.112));
  T.add(at(box(0.09, 0.105, 0.055, leather, { r: 0.018 }), -0.12, 0.062, 0.123, 0.04, 0, 0.03));            // pouch
  T.add(at(box(0.05, 0.02, 0.06, leatherD, { r: 0.006 }), -0.12, 0.102, 0.128));
  T.add(strut(V(0.15, 0.55, 0.122), V(-0.14, 0.15, 0.121), 0.04, leatherD, { depth: 0.014, r: 0.004 }));    // baldric
  T.add(at(box(0.2, 0.05, 0.2, ironD, { r: 0.015 }), 0, 0.578, 0.0));                                       // gorget
  const lantern = makeLantern(sprites, lit);
  lantern.position.set(0.128, 0.05, 0.14);
  lantern.rotation.set(0, 0.3, 0.03);
  T.add(lantern);
  g.userData.lantern = lantern;

  // ---- cloak ---------------------------------------------------------------------------------
  const L = [0.98, 1.12, 1.18, 1.08, 0.95];
  [-0.18, -0.09, 0, 0.09, 0.18].forEach((x, i) => {
    T.add(ribbon(V(x * 0.9, 0.57, -0.112), V(x * 1.5, 0.57 - L[i], -0.2 - Math.abs(x) * 0.12 - (i % 2) * 0.015), 0.105, 0.17, 0.028, V(x * 0.6, 0, -1), i % 2 ? cloak2 : cloak));
  });
  T.add(ribbon(V(-0.17, 0.57, 0.062), V(-0.225, -0.2, 0.1), 0.065, 0.095, 0.028, V(-0.6, 0, 0.8), cloak));    // front edges
  T.add(ribbon(V(0.175, 0.57, 0.058), V(0.25, -0.36, 0.08), 0.07, 0.11, 0.028, V(0.75, 0, 0.6), cloak2));
  T.add(ribbon(V(0.235, 0.56, 0.0), V(0.305, -0.24, 0.02), 0.1, 0.16, 0.028, V(1, 0, 0.15), cloak));          // drape over the left arm
  // mantle of the hood over the shoulders
  for (const sx of [-1, 1]) T.add(at(box(0.2, 0.045, 0.27, hood, { r: 0.02 }), sx * 0.152, 0.572, -0.005, 0, 0, sx * -0.42));
  T.add(at(box(0.25, 0.12, 0.03, hood, { r: 0.012 }), 0, 0.535, 0.117, -0.12, 0, 0));
  T.add(at(box(0.11, 0.11, 0.028, hood, { r: 0.01 }), 0.0, 0.475, 0.124, -0.1, 0, Math.PI / 4));
  T.add(at(box(0.3, 0.17, 0.03, hood, { r: 0.012 }), 0, 0.52, -0.123, 0.1, 0, 0));

  // ---- arms ----------------------------------------------------------------------------------
  const armor = (S, E, H, plateSide) => {
    T.add(strut(S, E, 0.1, tunic, { depth: 0.105, r: 0.028 }));
    T.add(at(box(0.095, 0.07, 0.1, leather, { r: 0.02 }), E[0], E[1], E[2]));
    T.add(strut(E, H, 0.086, leather, { depth: 0.092, r: 0.02, taper: 0.9 }));
    if (plateSide) T.add(strut(add3(E, V(plateSide * 0.042, 0.02, 0)), add3(H, V(plateSide * 0.04, 0, 0)), 0.03, iron, { depth: 0.07, r: 0.008 }));
  };
  // right arm (viewer's left): bent up, holding the haft of the axe that rides on the shoulder
  const SR = V(-0.21, 0.5, 0), ER = V(-0.272, 0.245, 0.085), HR = V(-0.2, 0.455, 0.2);
  armor(SR, ER, HR, -1);
  T.add(at(box(0.09, 0.095, 0.1, leatherD, { r: 0.025 }), HR[0], HR[1] + 0.03, HR[2] + 0.012, 0.95, 0.1, 0));
  T.add(at(box(0.17, 0.065, 0.19, iron, { r: 0.02 }), -0.235, 0.56, 0, 0, 0, 0.45));       // pauldron
  T.add(at(box(0.15, 0.06, 0.17, ironD, { r: 0.02 }), -0.285, 0.495, 0, 0, 0, 0.7));
  // left arm relaxed, half under the cloak
  const SL = V(0.21, 0.5, 0), EL = V(0.243, 0.215, -0.02), HL = V(0.232, -0.03, 0.07);
  armor(SL, EL, HL, 0);
  T.add(at(box(0.08, 0.105, 0.088, leatherD, { r: 0.025 }), HL[0], HL[1] - 0.045, HL[2] + 0.012, -0.25, 0, 0));

  // ---- head: a deep peaked hood, the face lost in its shadow -----------------------------------
  const head = J(0, 0.61, 0.012, 0.07, 0.3, -0.02);
  T.add(head);
  head.add(at(box(0.2, 0.085, 0.2, scarf, { r: 0.04 }), 0, -0.005, 0));                                   // scarf round the neck
  head.add(at(box(0.25, 0.2, 0.27, hood, { r: 0.06 }), 0, 0.105, -0.022));                                // cowl, lower part
  head.add(at(box(0.25, 0.19, 0.27, hood, { r: 0.06, taper: [0.42, 0.7], anchor: 'bottom' }), 0, 0.17, -0.022, -0.06, 0, 0));   // peak
  head.add(at(box(0.09, 0.14, 0.11, hood, { r: 0.03, taper: [0.3, 0.4] }), 0, 0.31, -0.14, -1.15, 0, 0));  // drooping point
  // rim of the opening
  for (const sx of [-1, 1]) head.add(at(box(0.034, 0.22, 0.05, hood, { r: 0.014 }), sx * 0.086, 0.13, 0.105, 0, 0, sx * 0.2));
  head.add(at(box(0.13, 0.045, 0.07, hood, { r: 0.016 }), 0, 0.245, 0.108, 0.5, 0, 0));
  // what shows inside: only shadow, a strip of brow, and the scarf pulled over nose and mouth
  head.add(at(box(0.14, 0.2, 0.03, dark, { r: 0.006 }), 0, 0.13, 0.09));
  head.add(at(box(0.13, 0.1, 0.03, skinD, { r: 0.012 }), 0, 0.166, 0.098));                              // brow to cheekbones
  head.add(at(box(0.132, 0.026, 0.026, skin, { r: 0.009 }), 0, 0.203, 0.11, 0.3, 0, 0));                 // brow ridge
  head.add(at(box(0.026, 0.07, 0.034, skin, { r: 0.009 }), 0, 0.152, 0.112, -0.16, 0, 0));               // bridge of the nose
  for (const sx of [-1, 1]) {
    head.add(at(box(0.042, 0.03, 0.022, skin, { r: 0.009 }), sx * 0.042, 0.139, 0.108, 0, 0, sx * -0.25));   // cheekbone
    head.add(at(box(0.038, 0.024, 0.012, dark, { r: 0.004 }), sx * 0.034, 0.176, 0.111));                 // eye socket
    head.add(at(box(0.011, 0.009, 0.006, eyeW, { r: 0 }), sx * 0.03, 0.178, 0.118));                      // catch-light
  }
  head.add(at(box(0.142, 0.082, 0.062, scarf, { r: 0.022, taper: [0.92, 0.9] }), 0, 0.082, 0.1));         // scarf over nose and mouth
  head.add(at(box(0.136, 0.015, 0.068, scarfL, { r: 0.006 }), 0, 0.106, 0.1, 0, 0, 0.07));                // its folds
  head.add(at(box(0.132, 0.013, 0.066, scarfL, { r: 0.006 }), 0, 0.072, 0.1, 0, 0, -0.06));
  head.add(at(box(0.06, 0.19, 0.024, scarf, { r: 0.01, anchor: 'top' }), -0.066, -0.035, 0.108, -0.1, 0, 0.1));
  head.scale.setScalar(0.95);

  // ---- felling axe: carried over the right shoulder, blade outward ------------------------------
  const axe = makeAxe(0.86);
  const ad = new THREE.Vector3(-0.36, 0.62, -0.7).normalize();
  aim(axe, [ad.x, ad.y, ad.z], [-1, -0.5, 0.0]);
  axe.position.set(HR[0] - ad.x * 0.07, HR[1] + 0.03 - ad.y * 0.07, HR[2] + 0.01 - ad.z * 0.07);
  T.add(axe);

  g.userData.height = 1.92;
  g.userData.tag = new THREE.Vector3(0, 2.1, 0);
  return bake(g);
}

// ---------------------------------------------------------------------------------------------
// Wolfhound companion
// ---------------------------------------------------------------------------------------------
/**
 * A rough-coated wolfhound. One lofted body (deep chest, tucked waist), lofted neck, head, legs
 * and tail, all sharing vertices so nothing reads as a joint, under a layer of alpha fur locks.
 * pose 'alert': head up, watching. pose 'wary': head low, hackles up, tail tucked.
 */
export function makeHound(sprites, { pose = 'alert', headYaw = 0.3, headPitch = null, step = 1 } = {}) {
  const wary = pose === 'wary';
  const g = new THREE.Group();
  g.name = 'hound';
  const cCoat = new THREE.Color(0x565a5e), cSaddle = new THREE.Color(0x34373b), cPale = new THREE.Color(0x77756f), cDark = new THREE.Color(0x1d1f22);
  const hsh = (x, y, z) => { const q = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return q - Math.floor(q); };
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const tmpC = new THREE.Color();
  /** Coat colour at a point of the standing dog: dark saddle, paler legs and underside, brindle streaks. */
  const tone = (p, k = 1) => {
    const saddle = sm(0.66, 0.8, p.y) * sm(-0.62, -0.45, p.z) * sm(0.5, 0.3, p.z);
    const pale = Math.max(sm(0.42, 0.12, p.y), sm(0.56, 0.42, p.y) * sm(0.1, 0.4, p.z) * 0.7);
    tmpC.copy(cCoat).lerp(cSaddle, saddle * 0.6).lerp(cPale, pale * 0.4);
    const br = Math.sin(p.z * 31 + p.y * 13 + Math.sin(p.y * 17 + p.x * 9) * 2.2);
    const streak = 1 - 0.2 * sm(0.25, 0.9, br) * (1 - pale);
    const n = 0.9 + 0.2 * hsh(Math.round(p.x * 40), Math.round(p.y * 40), Math.round(p.z * 40));
    const f = streak * n * k;
    return [tmpC.r * f, tmpC.g * f, tmpC.b * f];
  };
  const furMat = mat(0xffffff, { tex: 'fur', rough: 1, vc: true, fuzz: 1.0, normalScale: 0.9 });
  const lockMat = cardMat(sprites.fur, { fuzz: 1.0 });
  const geos = [];
  const cards = new Cards();
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const down = new THREE.Vector3(0, -1, 0);
  /** Scatter fur locks over a loft: s range, angle centre/spread, flow = back along the tube * kb + down * kd + out * lift. */
  const fur = (L, n, [s0, s1], [a0, da], { kb = 1, kd = 0.4, lift = 0.25, len = 0.15, w = 0.11, both = true, colP = null, k = 1 } = {}) => {
    for (let i = 0; i < n; i++) {
      const s = s0 + (s1 - s0) * ((i + rnd()) / n);
      let a = a0 + (rnd() - 0.5) * 2 * da;
      if (both && rnd() < 0.5) a = Math.PI - a;
      const { p, n: N, t } = L.at(s, a);
      const F = new THREE.Vector3().addScaledVector(t, -kb).addScaledVector(down, kd).addScaledVector(N, lift);
      F.applyAxisAngle(N, (rnd() - 0.5) * 0.6);
      const ll = len * (0.75 + rnd() * 0.6), ww = w * (0.8 + rnd() * 0.5);
      const c = tone(colP || p, k * (0.92 + rnd() * 0.22)), c1 = [c[0] * 1.3, c[1] * 1.3, c[2] * 1.3];
      const u0 = rnd() * 0.5;
      cards.add(p.addScaledVector(N, -0.01), N.clone().addScaledVector(F.clone().normalize(), 0.3), F, ll, ww, ww * 0.8, c, c1, { uvx: [u0, u0 + 0.5], bend: 0.008 });
    }
  };

  // ---- trunk ---------------------------------------------------------------------------------
  const body = new Loft([
    { p: V(0, 0.665, -0.6), rx: 0.04, ry: 0.055, ryB: 0.065 },
    { p: V(0, 0.675, -0.545), rx: 0.085, ry: 0.105, ryB: 0.115 },
    { p: V(0, 0.69, -0.44), rx: 0.105, ry: 0.125, ryB: 0.13 },
    { p: V(0, 0.7, -0.3), rx: 0.097, ry: 0.125, ryB: 0.112 },
    { p: V(0, 0.695, -0.16), rx: 0.094, ry: 0.135, ryB: 0.12 },
    { p: V(0, 0.675, -0.02), rx: 0.104, ry: 0.16, ryB: 0.155 },
    { p: V(0, 0.648, 0.12), rx: 0.117, ry: 0.192, ryB: 0.212 },
    { p: V(0, 0.63, 0.25), rx: 0.122, ry: 0.21, ryB: 0.24 },
    { p: V(0, 0.64, 0.36), rx: 0.112, ry: 0.19, ryB: 0.225 },
    { p: V(0, 0.665, 0.45), rx: 0.09, ry: 0.15, ryB: 0.175 },
    { p: V(0, 0.69, 0.515), rx: 0.05, ry: 0.085, ryB: 0.105 },
  ], { seg: 12 });
  geos.push(body.geometry({ colorAt: (p) => tone(p) }));
  const hk = wary ? 0.7 : 0.3;
  fur(body, 22, [1.2, 9.4], [Math.PI / 2, 0.4], { kb: 1, kd: 0, lift: hk, len: wary ? 0.12 : 0.1, w: 0.1, both: false });     // spine ridge / hackles
  fur(body, 64, [0.8, 9.8], [0.15, 0.95], { kb: 1, kd: 0.35, lift: 0.14, len: 0.105, w: 0.1 });                              // flanks
  fur(body, 18, [3.0, 9.8], [-Math.PI / 2, 0.55], { kb: 0.7, kd: 0.8, lift: 0.0, len: 0.09, w: 0.1, both: false });           // brisket and belly
  fur(body, 8, [9.0, 10.0], [-0.5, 0.9], { kb: 0.2, kd: 1, lift: 0.12, len: 0.09, w: 0.09 });                                 // forechest
  fur(body, 70, [0.6, 9.9], [0.25, 1.15], { kb: 1, kd: 0.3, lift: 0.1, len: 0.07, w: 0.06, k: 1.12 });                         // finer top coat

  // ---- neck and head --------------------------------------------------------------------------
  const nb = V(0, 0.745, 0.4);
  const H = wary ? V(0, 0.8, 0.83) : V(0, 1.03, 0.665);
  const nm = wary ? V(0, 0.79, 0.62) : V(0, 0.9, 0.555);
  const neck = new Loft([
    { p: V(0, 0.72, 0.3), rx: 0.085, ry: 0.15, ryB: 0.16 },
    { p: nb, rx: 0.084, ry: 0.13, ryB: 0.14 },
    { p: nm, rx: 0.068, ry: 0.092, ryB: 0.1 },
    { p: V(H[0], H[1] - 0.005, H[2] - 0.045), rx: 0.058, ry: 0.07, ryB: 0.075 },
    { p: V(H[0], H[1] + 0.0, H[2] + 0.01), rx: 0.05, ry: 0.058, ryB: 0.06 },
  ], { seg: 10 });
  geos.push(neck.geometry({ colorAt: (p) => tone(p), caps: false }));
  fur(neck, 26, [0.6, 3.6], [0.3, 1.1], { kb: 1, kd: 0.35, lift: 0.2, len: 0.1, w: 0.09 });                                  // ruff
  fur(neck, 8, [0.8, 3.4], [-Math.PI / 2, 0.45], { kb: 0.7, kd: 0.8, lift: 0.05, len: 0.09, w: 0.085, both: false });         // throat
  fur(neck, 8, [0.5, 3.2], [Math.PI / 2, 0.3], { kb: 1, kd: 0, lift: hk, len: 0.1, w: 0.085, both: false });                  // crest

  const head = J(H[0], H[1], H[2], headPitch ?? (wary ? 0.22 : 0.14), headYaw, 0.03);
  g.add(head);
  const hs = 0.8;
  const skull = new Loft([
    { p: V(0, 0.0, -0.1 * hs), rx: 0.04, ry: 0.042, ryB: 0.046 },
    { p: V(0, 0.008, -0.05 * hs), rx: 0.066, ry: 0.06, ryB: 0.062 },
    { p: V(0, 0.01, 0.0), rx: 0.072, ry: 0.064, ryB: 0.068 },
    { p: V(0, 0.004, 0.06 * hs), rx: 0.062, ry: 0.054, ryB: 0.066 },
    { p: V(0, -0.012, 0.115 * hs), rx: 0.046, ry: 0.036, ryB: 0.06 },
    { p: V(0, -0.018, 0.2 * hs), rx: 0.04, ry: 0.033, ryB: 0.056 },
    { p: V(0, -0.022, 0.28 * hs), rx: 0.036, ry: 0.03, ryB: 0.05 },
    { p: V(0, -0.025, 0.325 * hs), rx: 0.025, ry: 0.02, ryB: 0.036 },
  ], { seg: 10 });
  // colours are evaluated as if the head sat level at the alert position, so the muzzle is always the paler part
  const headTone = (p, k = 1) => { const c = tone(_hp.set(p.x, 0.62 + p.y, 0.2), k); const m = 1 + 0.35 * sm(0.08, 0.3, p.z) - 0.25 * sm(0.03, -0.08, p.z); return [c[0] * m, c[1] * m, c[2] * m]; };
  const skullMesh = mergedMesh([skull.geometry({ colorAt: (p) => headTone(p) })], furMat);
  head.add(skullMesh);
  const hc = new Cards();
  const hfur = (n, [s0, s1], [a0, da], F0, len, w, k = 1) => {
    for (let i = 0; i < n; i++) {
      const s = s0 + (s1 - s0) * ((i + rnd()) / n);
      let a = a0 + (rnd() - 0.5) * 2 * da;
      if (rnd() < 0.5) a = Math.PI - a;
      const { p, n: N } = skull.at(s, a);
      const F = new THREE.Vector3(...F0).addScaledVector(N, 0.25);
      const c = headTone(p, k * (0.9 + rnd() * 0.2));
      const u0 = rnd() * 0.5;
      hc.add(p.addScaledVector(N, -0.008), N.clone().addScaledVector(F.clone().normalize(), 0.3), F, len * (0.8 + rnd() * 0.4), w, w * 0.7, c, [c[0] * 1.3, c[1] * 1.3, c[2] * 1.3], { uvx: [u0, u0 + 0.5] });
    }
  };
  hfur(6, [4.4, 6.6], [-Math.PI / 2, 0.5], [0, -1, -0.35], 0.075, 0.06, 1.15);        // beard
  hfur(4, [4.6, 6.4], [0.1, 0.4], [0, -0.7, -0.7], 0.06, 0.05, 1.1);                  // moustache
  hfur(4, [2.6, 3.4], [0.95, 0.25], [0, 0.35, 0.9], 0.05, 0.05, 0.9);                 // brows
  hfur(6, [0.6, 2.6], [0.6, 0.8], [0, -0.2, -1], 0.08, 0.07, 0.95);                   // cheeks and poll
  { const hm = hc.mesh(lockMat); hm.castShadow = false; head.add(hm); }
  const noseM = mat(0x0c0c0d, { tex: 'plain', rough: 0.4 });
  head.add(at(box(0.046, 0.036, 0.034, noseM, { r: 0.014 }), 0, -0.016, 0.33 * hs));
  
  const earM = mat(0x2b2e31, { tex: 'fur', rough: 1, fuzz: 0.8 });
  for (const sx of [-1, 1]) {
    head.add(at(box(0.02, 0.125, 0.075, earM, { r: 0.008, taper: [1, 0.35] }), sx * 0.07, 0.022, -0.05, wary ? -2.45 : -2.15, sx * -0.3, sx * 0.25));   // rose ear, laid back
    head.add(at(box(0.016, 0.014, 0.014, mat(0x0a0806, { tex: null, rough: 0.25 }), { r: 0.005 }), sx * 0.05, 0.022, 0.072 * hs, 0, sx * 0.5, 0));     // eye
    head.add(at(box(0.004, 0.004, 0.004, mat(0x8a6c42, { tex: null, rough: 0.2 }), { r: 0 }), sx * 0.052, 0.024, 0.08 * hs));
  }
  // collar
  {
    const c0 = neck.at(1.55, 0), k = 1.08;
    const col = new Loft([1.45, 1.75].map((s) => { const f = neck.at(s, 0), r = neck.rings; const i = Math.floor(s), t = s - i; const lerp = (q) => (r[i][q] + (r[i + 1][q] - r[i][q]) * t) * k; const c = new THREE.Vector3().copy(neck.frames[i].p).lerp(neck.frames[i + 1].p, t); void f; return { p: [c.x, c.y, c.z], rx: lerp('rx'), ry: lerp('ry'), ryB: (r[i].ryB + (r[i + 1].ryB - r[i].ryB) * t) * k }; }), { seg: 10 });
    const cm = new THREE.Mesh(col.geometry({ caps: false, uv: 3 }), mat(0x3d2c20, { tex: 'leather', rough: 0.8, side: THREE.DoubleSide }));
    cm.castShadow = true; cm.userData.bakedMesh = true;
    g.add(cm);
    void c0;
  }

  // ---- legs: lofted from the shoulder / hip to the toes -------------------------------------------
  const fwd = { up: [0, 0, 1], seg: 8 };
  for (const sx of [-1, 1]) {
    const o = (sx > 0 ? 0.06 : -0.04) * step;
    const fl = new Loft([
      { p: V(sx * 0.04, 0.76, 0.3), rx: 0.03, ry: 0.06 },
      { p: V(sx * 0.082, 0.64, 0.3), rx: 0.05, ry: 0.092 },
      { p: V(sx * 0.108, 0.48, 0.255 + o * 0.3), rx: 0.04392, ry: 0.0667 },
      { p: V(sx * 0.108, 0.33, 0.268 + o * 0.7), rx: 0.03538, ry: 0.046 },
      { p: V(sx * 0.108, 0.17, 0.275 + o), rx: 0.03294, ry: 0.03795 },
      { p: V(sx * 0.108, 0.075, 0.288 + o), rx: 0.03416, ry: 0.04255 },
      { p: V(sx * 0.108, 0.03, 0.315 + o), rx: 0.04514, ry: 0.0667 },
      { p: V(sx * 0.108, 0.008, 0.325 + o), rx: 0.04148, ry: 0.0598 },
    ], fwd);
    geos.push(fl.geometry({ colorAt: (p) => tone(p) }));
    fur(fl, 7, [1.6, 4.8], [-Math.PI / 2, 0.6], { kb: -1, kd: 0, lift: 0.45, len: 0.07, w: 0.065, both: false });               // feathering behind the forearm
    fur(fl, 14, [0.0, 2.4], [0.2, 1.0], { kb: -0.9, kd: 0, lift: 0.14, len: 0.085, w: 0.075 });
    const oh = (sx > 0 ? -0.07 : 0.04) * step;
    const hl = new Loft([
      { p: V(sx * 0.035, 0.76, -0.44), rx: 0.03, ry: 0.07 },
      { p: V(sx * 0.078, 0.63, -0.405 + oh * 0.2), rx: 0.056, ry: 0.122 },
      { p: V(sx * 0.108, 0.48, -0.335 + oh * 0.5), rx: 0.048, ry: 0.08512 },
      { p: V(sx * 0.108, 0.375, -0.44 + oh * 0.8), rx: 0.036, ry: 0.05376 },
      { p: V(sx * 0.108, 0.27, -0.555 + oh), rx: 0.03, ry: 0.04032 },
      { p: V(sx * 0.108, 0.15, -0.565 + oh), rx: 0.0264, ry: 0.03136 },
      { p: V(sx * 0.108, 0.07, -0.55 + oh), rx: 0.0312, ry: 0.0392 },
      { p: V(sx * 0.108, 0.03, -0.52 + oh), rx: 0.0432, ry: 0.06496 },
      { p: V(sx * 0.108, 0.008, -0.51 + oh), rx: 0.0396, ry: 0.05824 },
    ], fwd);
    geos.push(hl.geometry({ colorAt: (p) => tone(p) }));
    fur(hl, 9, [0.3, 4.0], [-Math.PI / 2, 0.6], { kb: -1, kd: 0.2, lift: 0.4, len: 0.09, w: 0.085, both: false });              // breeches
    fur(hl, 16, [0.0, 2.8], [0.2, 1.0], { kb: -0.9, kd: 0, lift: 0.14, len: 0.09, w: 0.08 });
  }
  // ---- tail: long, carried low; tucked when wary ---------------------------------------------------
  const tz = wary ? 0.08 : 0;
  const tail = new Loft([
    { p: V(0, 0.75, -0.56), rx: 0.036, ry: 0.04 },
    { p: V(0, 0.64, -0.645 + tz * 0.3), rx: 0.034, ry: 0.038 },
    { p: V(0, 0.49, -0.695 + tz * 0.7), rx: 0.03, ry: 0.034 },
    { p: V(0.004, 0.35, -0.71 + tz), rx: 0.026, ry: 0.03 },
    { p: V(0.01, 0.24, -0.735 + tz * 1.3), rx: 0.02, ry: 0.024 },
    { p: V(0.018, 0.17, -0.8 + tz * 1.8), rx: 0.011, ry: 0.013 },
  ], { up: [0, 0, 1], seg: 7 });
  geos.push(tail.geometry({ colorAt: (p) => tone(p, 0.9) }));
  fur(tail, 14, [0.4, 4.9], [-Math.PI / 2, 1.2], { kb: -0.8, kd: 0.3, lift: 0.4, len: 0.09, w: 0.075, both: false });

  g.add(mergedMesh(geos, furMat));
  { const cm = cards.mesh(lockMat); cm.castShadow = false; g.add(cm); }
  void cDark;
  g.userData.height = wary ? 0.95 : 1.12;
  g.userData.tag = new THREE.Vector3(0, wary ? 1.05 : 1.2, 0.3);
  return bake(g);
}
const _hp = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------
// Raven
// ---------------------------------------------------------------------------------------------
export function makeRaven() {
  const f = mat(0x1b1e25, { tex: 'feather', rough: 0.5, metal: 0.1 });
  const f2 = mat(0x121419, { tex: 'feather', rough: 0.45, metal: 0.12 });
  const beak = mat(0x2e2f33, { tex: 'plain', rough: 0.38 });
  const leg = mat(0x1c1c1e, { tex: 'plain', rough: 0.7 });
  const g = new THREE.Group();
  g.name = 'raven';
  const s = 1.3;                                    // a big bird: easier to read at a distance
  // body leans forward, tail down: the classic perched wedge
  const b = J(0, 0.165, -0.01, -0.5, 0, 0);
  g.add(b);
  b.add(at(box(0.125, 0.13, 0.32, f, { r: 0.045 }), 0, 0, 0));
  b.add(at(box(0.11, 0.1, 0.12, f, { r: 0.04 }), 0, -0.03, 0.11));                                 // breast
  b.add(at(box(0.13, 0.26, 0.018, f2, { r: 0.007, taper: [0.55, 1] }), 0, -0.012, -0.28, Math.PI / 2 - 0.12, 0, 0));   // wedge tail
  for (const sx of [-1, 1]) {
    b.add(at(box(0.024, 0.46, 0.105, f2, { r: 0.01, taper: [1, 0.22] }), sx * 0.062, 0.03, -0.1, -Math.PI / 2 - 0.04, sx * 0.09, 0));   // folded wing, tip over the tail
    b.add(at(box(0.026, 0.17, 0.1, f, { r: 0.01, taper: [1, 0.75] }), sx * 0.068, 0.04, 0.05, -Math.PI / 2, 0, 0));
  }
  // neck hackles, head held level, heavy beak
  g.add(strut(V(0, 0.22, 0.1), V(0, 0.31, 0.16), 0.1, f, { r: 0.035, depth: 0.1, taper: 0.85 }));
  const head = J(0, 0.335, 0.175, 0.04, 0.6, 0.03);
  g.add(head);
  head.add(at(box(0.085, 0.085, 0.11, f, { r: 0.035 }), 0, 0, 0));
  head.add(at(box(0.07, 0.06, 0.07, f, { r: 0.025 }), 0, -0.05, 0.0, 0.3, 0, 0));                  // shaggy throat
  head.add(at(box(0.042, 0.15, 0.05, beak, { r: 0.013, taper: [0.28, 0.34], shear: [0, -0.014] }), 0, 0.0, 0.125, Math.PI / 2 + 0.06, 0, 0));
  head.add(at(box(0.03, 0.095, 0.016, beak, { r: 0.006, taper: [0.5, 1] }), 0, -0.027, 0.1, Math.PI / 2 + 0.02, 0, 0));
  head.add(at(box(0.046, 0.026, 0.05, f, { r: 0.01 }), 0, 0.016, 0.065, 0.3, 0, 0));               // bristles over the beak
  for (const sx of [-1, 1]) head.add(at(box(0.006, 0.013, 0.014, mat(0x050506, { tex: null, rough: 0.1 }), { r: 0.003 }), sx * 0.042, 0.012, 0.03));
  for (const sx of [-1, 1]) {
    g.add(at(box(0.04, 0.075, 0.05, f, { r: 0.016 }), sx * 0.035, 0.085, 0.0));                    // feathered thighs
    g.add(strut(V(sx * 0.035, 0.06, 0.0), V(sx * 0.04, 0.0, 0.01), 0.014, leg));
    for (const a2 of [-0.5, 0, 0.5]) g.add(strut(V(sx * 0.04, 0.007, 0.01), V(sx * 0.04 + Math.sin(a2) * 0.05, 0.004, 0.01 + 0.05 * Math.cos(a2)), 0.01, leg));
    g.add(strut(V(sx * 0.04, 0.007, 0.01), V(sx * 0.04, 0.004, -0.03), 0.01, leg));
  }
  g.scale.setScalar(s);
  g.userData.height = 0.42 * s;
  g.userData.tag = new THREE.Vector3(0, 0.5 * s, 0.05);
  return bake(g);
}

// ---------------------------------------------------------------------------------------------
// The stalker: a tall, hunched shadow in a tattered shroud, crowned with antlers
// ---------------------------------------------------------------------------------------------
export function makeStalker(sprites, { eyeGain = 1 } = {}) {
  const sh = mat(0x17191d, { tex: 'shade', rough: 1 });
  const sh2 = mat(0x0d0e11, { tex: 'shade', rough: 1 });
  const robe = mat(0x0c0d10, { tex: 'cloth', rough: 1, side: THREE.DoubleSide });
  const bone = mat(0x8d8878, { tex: 'bone', rough: 0.82 });
  const boneD = mat(0x565246, { tex: 'bone', rough: 0.88 });
  const horn = mat(0x5e5a50, { tex: 'bone', rough: 0.8 });
  const hornTip = mat(0x9c9687, { tex: 'bone', rough: 0.7 });
  const dark = mat(0x050506, { tex: null, rough: 1 });
  const g = new THREE.Group();
  g.name = 'stalker';
  let seed = 77;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // everything below the neck is drawn out tall and narrow
  const KY = 1.14, KX = 0.9;
  const b = new THREE.Group();
  b.scale.set(KX, KY, 1);
  g.add(b);

  // legs: thin and backward-bending like a stag's, mostly hidden by the shroud
  for (const sx of [-1, 1]) {
    const o = sx > 0 ? 0 : 0.16;
    const hip = V(sx * 0.1, 1.62, -0.05), knee = V(sx * 0.13, 1.0, 0.16 + o), hock = V(sx * 0.11, 0.44, -0.16 + o), hoof = V(sx * 0.11, 0.07, -0.02 + o);
    b.add(strut(hip, knee, 0.12, sh, { r: 0.03, taper: 0.7 }));
    b.add(strut(knee, hock, 0.08, sh, { r: 0.022, taper: 0.8 }));
    b.add(strut(hock, hoof, 0.055, sh2, { r: 0.015 }));
    g.add(at(box(0.095, 0.1, 0.16, sh2, { r: 0.02, taper: [0.7, 0.7] }), hoof[0] * KX, 0.05, hoof[2] + 0.04));
  }
  // spine: hips -> hunched shoulders
  const hips = V(0, 1.62, -0.05), mid = V(0, 2.06, 0.02);
  b.add(at(box(0.26, 0.2, 0.18, sh, { r: 0.04 }), 0, 1.64, -0.05));
  b.add(strut(hips, mid, 0.17, sh2, { r: 0.04, depth: 0.13 }));
  const chest = J(0, 2.3, 0.13, 0.45, 0, 0);
  b.add(chest);
  chest.add(at(box(0.4, 0.46, 0.25, sh, { r: 0.06, taper: [1.2, 1.0] }), 0, 0, 0));
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) chest.add(at(box(0.17, 0.024, 0.03, sh2, { r: 0.008 }), sx * 0.1, -0.16 + i * 0.07, 0.125, 0, 0, sx * (0.25 - i * 0.03)));
  b.add(at(box(0.56, 0.11, 0.2, sh, { r: 0.04 }), 0, 2.5, 0.22, 0.3, 0, 0));
  b.add(at(box(0.34, 0.2, 0.26, sh2, { r: 0.08, taper: [0.6, 0.7] }), 0, 2.56, 0.08, -0.4, 0, 0));        // hump

  // arms: reach nearly to the knees
  const hand = (wrist, dirDown, spread, sx) => {
    const h = new THREE.Group();
    h.add(at(box(0.075, 0.1, 0.045, sh, { r: 0.014 }), 0, -0.05, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i - 1.5) * spread;
      h.add(J(Math.sin(a) * 0.03, -0.095, 0, 0.1, 0, a,
        at(box(0.02, 0.19, 0.02, sh2, { r: 0.006, anchor: 'top' }), 0, 0, 0),
        J(0, -0.185, 0, -0.4, 0, 0, at(box(0.016, 0.17, 0.016, sh2, { r: 0.004, anchor: 'top', taper: [3, 3] }), 0, 0, 0))));
    }
    h.add(J(sx * -0.04, -0.03, 0.012, 0.35, 0, sx * -0.95, at(box(0.018, 0.13, 0.018, sh2, { r: 0.005, anchor: 'top', taper: [2.5, 2.5] }), 0, 0, 0)));
    h.position.set(...wrist);
    h.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...dirDown).normalize());
    return h;
  };
  const armPts = [
    [V(0.28, 2.47, 0.22), V(0.37, 1.76, 0.3), V(0.34, 1.07, 0.44), V(0.02, -1, 0.12), 0.2],          // left: hangs
    [V(-0.28, 2.47, 0.22), V(-0.44, 1.86, 0.44), V(-0.37, 1.32, 0.84), V(0.1, -0.7, 0.7), 0.4],       // right: reaching
  ];
  armPts.forEach(([S, E, W, dn, spread], i) => {
    const sx = i === 0 ? 1 : -1;
    b.add(strut(S, E, 0.085, sh, { r: 0.025, taper: 0.8 }));
    b.add(ball(0.05, sh2, { seg: 8 }).translateX(E[0]).translateY(E[1]).translateZ(E[2]));
    b.add(strut(E, W, 0.062, sh, { r: 0.02, taper: 0.8 }));
    b.add(hand(W, dn, spread, sx));
  });

  // the shroud. Underneath, a closed dark robe so the figure is one mass and no daylight shows through
  const C = V(0, 2.5 * KY, 0.13);
  const under = new Loft([
    { p: V(0, C[1] + 0.02, 0.15), rx: 0.2, ry: 0.11 },
    { p: V(0, C[1] - 0.25, 0.13), rx: 0.26, ry: 0.17 },
    { p: V(0, 2.1, 0.04), rx: 0.25, ry: 0.17 },
    { p: V(0, 1.45, -0.01), rx: 0.28, ry: 0.2 },
    { p: V(0, 0.9, 0.0), rx: 0.32, ry: 0.25 },
    { p: V(0, 0.34, 0.0), rx: 0.36, ry: 0.29 },
  ], { seg: 10, up: [0, 0, 1] });
  g.add(mergedMesh([under.geometry({ caps: false, uv: 1.2 })], robe));
  // over it, ragged strips of cloth in three overlapping layers (alpha cards, torn hems)
  const cards = new Cards();
  const strip = (P, N, F, len, w0, w1, k) => {
    const c0 = [0.034 * k, 0.037 * k, 0.043 * k], c1 = [c0[0] * 0.6, c0[1] * 0.6, c0[2] * 0.6];
    cards.add(P, N, F, len, w0, w1, c0, c1, { uvx: rnd() < 0.5 ? [0, 1] : [1, 0], bend: 0.04 + rnd() * 0.07, twist: (rnd() - 0.5) * 0.7 });
  };
  const layer = (n, yTop, r, zc, [l0, l1], w, flare, [a0, a1], tone) => {
    for (let i = 0; i < n; i++) {
      const a = (a0 + (a1 - a0) * ((i + rnd() * 0.7) / n)) * Math.PI / 180;
      const sa = Math.sin(a), ca = Math.cos(a);
      const P = new THREE.Vector3(sa * r[0], yTop - rnd() * 0.07, zc + ca * r[1]);
      const N = new THREE.Vector3(sa, 0.3, ca).normalize();
      const F = new THREE.Vector3(sa * flare + (rnd() - 0.5) * 0.08, -1, ca * flare * 1.1 - 0.02).normalize();
      strip(P, N, F, l0 + (l1 - l0) * rnd(), w * (0.75 + rnd() * 0.4), w * (1.15 + rnd() * 0.6), tone * (0.7 + rnd() * 0.6));
    }
  };
  layer(16, C[1] - 0.03, [0.27, 0.17], C[2], [2.45, 3.05], 0.2, 0.08, [10, 350], 0.8);        // long strips down the back and sides
  layer(11, C[1] + 0.0, [0.29, 0.19], C[2], [1.15, 1.7], 0.21, 0.13, [14, 346], 1.0);        // middle layer
  layer(10, C[1] + 0.07, [0.2, 0.13], C[2] + 0.04, [0.55, 0.95], 0.2, 0.42, [0, 360], 1.25);  // mantle over the shoulders
  layer(4, 1.95, [0.17, 0.12], 0.02, [0.9, 1.3], 0.15, 0.05, [-40, 40], 0.9);                 // loin tatters at the front
  // sleeve tatters
  armPts.forEach(([S, E], i) => {
    const sx = i === 0 ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const t = 0.15 + k * 0.27;
      const P = new THREE.Vector3((S[0] + (E[0] - S[0]) * t) * KX, (S[1] + (E[1] - S[1]) * t) * KY, S[2] + (E[2] - S[2]) * t - 0.02);
      strip(P, new THREE.Vector3(sx, 0.2, 0.25).normalize(), new THREE.Vector3(sx * 0.12, -1, -0.12).normalize(), 0.4 + rnd() * 0.45, 0.13, 0.19, 0.9 + rnd() * 0.4);
    }
  });
  { const cm = cards.mesh(cardMat(sprites.tatter, { rough: 1 })); g.add(cm); }

  // long neck, and a stag's skull for a head, thrust forward below the hump
  const nk0 = V(0, C[1] + 0.04, 0.3), nk1 = V(0, C[1] + 0.2, 0.52);
  g.add(strut(nk0, nk1, 0.085, sh2, { r: 0.03 }));
  for (let i = 0; i < 3; i++) g.add(at(box(0.11, 0.035, 0.1, boneD, { r: 0.012 }), 0, nk0[1] + 0.03 + i * 0.055, nk0[2] + 0.04 + i * 0.075, -0.9, 0, 0));    // neck vertebrae
  const head = J(0, C[1] + 0.22, 0.6, 0.5, -0.32, 0.08);
  g.add(head);
  head.add(at(box(0.15, 0.125, 0.17, bone, { r: 0.05 }), 0, 0.03, -0.01));                                             // braincase
  head.add(at(box(0.125, 0.31, 0.085, bone, { r: 0.024, taper: [0.4, 0.62] }), 0, -0.008, 0.2, Math.PI / 2 + 0.14, 0, 0));   // long face
  head.add(at(box(0.05, 0.022, 0.19, boneD, { r: 0.008 }), 0, 0.04, 0.17, 0.14, 0, 0));                                 // nasal ridge
  head.add(at(box(0.034, 0.03, 0.075, dark, { r: 0.008 }), 0, 0.0, 0.325, 0.14, 0, 0));                                 // nasal opening
  head.add(at(box(0.056, 0.022, 0.25, boneD, { r: 0.007, taper: [1, 1] }), 0, -0.1, 0.13, 0.42, 0, 0));                 // slack lower jaw
  head.add(at(box(0.1, 0.07, 0.03, boneD, { r: 0.01 }), 0, -0.05, 0.0, 0.2, 0, 0));
  for (const sx of [-1, 1]) {
    head.add(strut(V(sx * 0.07, 0.085, -0.02), V(sx * 0.068, 0.07, 0.12), 0.03, boneD, { r: 0.01 }));                  // brow ridge
    head.add(strut(V(sx * 0.074, 0.0, 0.0), V(sx * 0.045, -0.035, 0.19), 0.022, boneD, { r: 0.007 }));                 // cheek arch
    head.add(at(box(0.05, 0.05, 0.06, dark, { r: 0.014 }), sx * 0.058, 0.038, 0.075, 0, sx * 0.5, 0));                  // deep socket
    head.add(at(emissiveBox(0.02, 0.016, 0.01, new THREE.Color(2.4 * eyeGain, 2.9 * eyeGain, 3.1 * eyeGain)), sx * 0.062, 0.04, 0.101, 0, sx * 0.5, 0));
    head.add(at(glowDot(sprites, 0.17, new THREE.Color(0.7, 0.88, 1.0).multiplyScalar(eyeGain), 0.7), sx * 0.064, 0.04, 0.115));
    for (let i = 0; i < 4; i++) head.add(at(box(0.01, 0.022, 0.016, bone, { r: 0.003, taper: [0.5, 1] }), sx * (0.036 - i * 0.003), -0.062 - i * 0.004, 0.2 + i * 0.03, 0.14, 0, 0));   // teeth
  }
  // antlers: heavy beams with tines; the right one has lost its top
  const antler = (sx, k, broken) => {
    const a = new THREE.Group();
    const P = (x, y, z) => V(sx * x * k, y * k, z * k);
    const p0 = P(0.06, 0.09, -0.03), p1 = P(0.2, 0.3, -0.12), p2 = P(0.45, 0.5, -0.14), p3 = P(0.62, 0.82, -0.06), p4 = P(0.6, 1.1, 0.04);
    a.add(strut(p0, p1, 0.065, horn, { r: 0.015 }));
    a.add(strut(p1, p2, 0.055, horn, { r: 0.013 }));
    a.add(strut(p1, P(0.12, 0.52, 0.1), 0.036, hornTip, { r: 0.008, taper: 0.35 }));
    a.add(strut(p2, P(0.72, 0.56, -0.24), 0.034, hornTip, { r: 0.008, taper: 0.35 }));
    if (broken) {
      a.add(strut(p2, P(0.55, 0.68, -0.1), 0.045, horn, { r: 0.011, taper: 0.8 }));          // snapped beam
      a.add(strut(p2, P(0.34, 0.8, -0.02), 0.036, hornTip, { r: 0.008, taper: 0.35 }));
    } else {
      a.add(strut(p2, p3, 0.045, horn, { r: 0.011 }));
      a.add(strut(p3, p4, 0.035, hornTip, { r: 0.008, taper: 0.35 }));
      a.add(strut(p2, P(0.36, 0.88, -0.04), 0.036, hornTip, { r: 0.008, taper: 0.35 }));
      a.add(strut(p3, P(0.86, 0.96, -0.1), 0.03, hornTip, { r: 0.007, taper: 0.35 }));
      a.add(strut(p3, P(0.48, 1.06, -0.14), 0.03, hornTip, { r: 0.007, taper: 0.35 }));
    }
    return a;
  };
  head.add(antler(1, 1.2 / 1.2, false), antler(-1, 1.02 / 1.2, true));
  head.scale.setScalar(1.2);

  g.userData.height = 3.2;
  g.userData.tag = new THREE.Vector3(0, 4.42, 0.5);
  g.userData.eyes = new THREE.Vector3(0, C[1] + 0.25, 0.7);
  return bake(g);
}

// ---------------------------------------------------------------------------------------------
// Bone hound: a skeletal wolf with a cold light caged in its ribs
// ---------------------------------------------------------------------------------------------
export function makeBoneHound(sprites, { glow = 1, tint = null } = {}) {
  const bone = mat(0xb9b2a0, { tex: 'bone', rough: 0.75 });
  const boneD = mat(0x7f796b, { tex: 'bone', rough: 0.8 });
  const dark = mat(0x09090a, { tex: null, rough: 1 });
  const glowC = new THREE.Color(tint ?? 0x8fedd8);
  const g = new THREE.Group();
  g.name = 'boneHound';
  // spine: arched, shoulders high, head carried low
  const spine = [V(0, 0.8, 0.5), V(0, 0.9, 0.36), V(0, 0.94, 0.2), V(0, 0.93, 0.03), V(0, 0.9, -0.14), V(0, 0.86, -0.31), V(0, 0.8, -0.48)];
  for (let i = 0; i < spine.length - 1; i++) {
    g.add(strut(spine[i], spine[i + 1], 0.07, bone, { r: 0.02, depth: 0.08 }));
    const m = spine[i];
    g.add(at(box(0.028, 0.14 - Math.abs(i - 1.5) * 0.02, 0.06, boneD, { r: 0.01, taper: [0.4, 0.55] }), 0, m[1] + 0.085, m[2] - 0.085, -0.4, 0, 0));
  }
  // rib cage: seven hoops around the light
  for (let i = 0; i < 7; i++) {
    const z = 0.4 - i * 0.098, cy = 0.705 - i * 0.004;
    const rx = 0.2 - Math.abs(i - 2.2) * 0.012, ry = 0.235 - i * 0.012;
    const ang = [0.2, 0.9, 1.6, 2.25, 2.75 - i * 0.07];
    for (const sx of [-1, 1]) {
      for (let k = 0; k < ang.length - 1; k++) {
        const a0 = ang[k], a1 = ang[k + 1];
        g.add(strut(V(sx * rx * Math.sin(a0), cy + ry * Math.cos(a0), z - k * 0.012), V(sx * rx * Math.sin(a1), cy + ry * Math.cos(a1), z - (k + 1) * 0.012), 0.036 - k * 0.003, k === 3 ? boneD : bone, { r: 0.012 }));
      }
    }
  }
  g.add(strut(V(0, 0.475, 0.4), V(0, 0.52, -0.12), 0.055, boneD, { r: 0.014, depth: 0.035 }));     // sternum
  // the light inside
  g.add(at(emissiveBox(0.09, 0.1, 0.28, glowC.clone().multiplyScalar(0.9 * glow)), 0, 0.7, 0.14, 0.12, 0, 0));
  g.add(at(emissiveBox(0.06, 0.13, 0.12, glowC.clone().multiplyScalar(1.5 * glow)), 0, 0.71, 0.22, 0.3, 0.5, 0));
  g.add(at(glowDot(sprites, 0.9, glowC.clone().multiplyScalar(0.45 * glow), 0.45), 0, 0.7, 0.17));
  g.userData.core = new THREE.Vector3(0, 0.7, 0.17);
  // shoulder blades and pelvis
  for (const sx of [-1, 1]) {
    g.add(at(box(0.03, 0.25, 0.16, bone, { r: 0.012, taper: [1, 0.45] }), sx * 0.2, 0.84, 0.36, 0.3, 0, sx * -0.22));
    g.add(at(box(0.035, 0.19, 0.2, bone, { r: 0.012, taper: [1, 0.55] }), sx * 0.125, 0.78, -0.44, -0.55, 0, sx * -0.28));
  }
  g.add(at(box(0.22, 0.065, 0.09, boneD, { r: 0.02 }), 0, 0.73, -0.5));
  // neck down to a low, thrust-forward skull
  const nk = [V(0, 0.8, 0.5), V(0, 0.74, 0.64), V(0, 0.67, 0.77)];
  for (let i = 0; i < 2; i++) g.add(strut(nk[i], nk[i + 1], 0.065, bone, { r: 0.02 }));
  const head = J(0, 0.64, 0.83, 0.16, -0.3, 0);
  g.add(head);
  head.add(at(box(0.16, 0.125, 0.17, bone, { r: 0.045 }), 0, 0.035, 0.0));                                    // braincase
  head.add(at(box(0.04, 0.05, 0.15, boneD, { r: 0.012, taper: [0.5, 1] }), 0, 0.105, -0.02));                  // sagittal crest
  head.add(at(box(0.105, 0.2, 0.078, bone, { r: 0.02, taper: [0.6, 0.72] }), 0, 0.012, 0.17, Math.PI / 2, 0, 0)); // snout
  head.add(at(box(0.036, 0.03, 0.04, dark, { r: 0.008 }), 0, 0.028, 0.268));                                   // nasal opening
  for (const sx of [-1, 1]) {
    head.add(strut(V(sx * 0.052, -0.005, 0.11), V(sx * 0.1, 0.005, -0.04), 0.024, boneD, { r: 0.006 }));        // cheek arch
    head.add(at(box(0.052, 0.052, 0.05, dark, { r: 0.014 }), sx * 0.056, 0.042, 0.078, 0, sx * 0.4, 0));        // socket
    head.add(at(emissiveBox(0.014, 0.014, 0.01, glowC.clone().multiplyScalar(2.2 * glow)), sx * 0.06, 0.042, 0.1));
    head.add(at(glowDot(sprites, 0.13, glowC.clone().multiplyScalar(0.7 * glow), 0.7), sx * 0.062, 0.042, 0.115));
    head.add(at(box(0.017, 0.08, 0.017, bone, { r: 0.004, taper: [3.2, 3.2] }), sx * 0.036, -0.062, 0.235));    // fangs
    for (let i = 0; i < 3; i++) head.add(at(box(0.012, 0.028, 0.02, bone, { r: 0.003, taper: [2.5, 1] }), sx * (0.042 + i * 0.003), -0.04, 0.195 - i * 0.035));
  }
  const jaw = J(0, -0.03, -0.02, 0.3, 0, 0,
    at(box(0.07, 0.025, 0.23, boneD, { r: 0.008 }), 0, 0, 0.125),
    at(box(0.125, 0.085, 0.04, boneD, { r: 0.012 }), 0, 0.025, 0.0));
  for (const sx of [-1, 1]) {
    jaw.add(at(box(0.014, 0.05, 0.014, bone, { r: 0.004, taper: [0.3, 0.3] }), sx * 0.027, 0.033, 0.235));
    for (let i = 0; i < 3; i++) jaw.add(at(box(0.011, 0.024, 0.018, bone, { r: 0.003, taper: [0.4, 1] }), sx * 0.03, 0.022, 0.19 - i * 0.035));
  }
  head.add(jaw);
  // legs: bones with knobby joints, in a stalking half-step
  const knob = (p, r) => { const k = ball(r, boneD, { seg: 8 }); k.position.set(...p); return k; };
  const limb = (pts, th) => { for (let i = 0; i < pts.length - 1; i++) { g.add(strut(pts[i], pts[i + 1], th[i], bone, { r: 0.014 })); g.add(knob(pts[i], th[i] * 0.72)); } };
  // toes fan forward from the ankle and bite into the ground
  const paw = (p) => {
    for (const k of [-1, 0, 1]) {
      const tip = V(p[0] + k * 0.035, 0.012, p[2] + 0.115 - Math.abs(k) * 0.02);
      g.add(strut(p, tip, 0.026, k === 0 ? bone : boneD, { r: 0.008, taper: 0.7 }));
      g.add(strut(tip, V(tip[0], 0.0, tip[2] + 0.035), 0.014, boneD, { r: 0.004, taper: 0.3 }));
    }
    g.add(knob(p, 0.03));
  };
  const fl = [V(0.19, 0.75, 0.38), V(0.2, 0.42, 0.5), V(0.2, 0.075, 0.56)];
  const fr = [V(-0.19, 0.75, 0.38), V(-0.2, 0.42, 0.3), V(-0.2, 0.075, 0.2)];
  limb(fl, [0.05, 0.04]); paw(fl[2]); limb(fr, [0.05, 0.04]); paw(fr[2]);
  const hl = [V(0.14, 0.72, -0.46), V(0.15, 0.45, -0.3), V(0.15, 0.25, -0.52), V(0.15, 0.075, -0.48)];
  const hr = [V(-0.14, 0.72, -0.46), V(-0.15, 0.44, -0.42), V(-0.15, 0.26, -0.66), V(-0.15, 0.075, -0.63)];
  limb(hl, [0.052, 0.04, 0.034]); paw(hl[3]); limb(hr, [0.052, 0.04, 0.034]); paw(hr[3]);
  // tail: a whip of small vertebrae
  let p = V(0, 0.79, -0.53);
  for (let i = 0; i < 8; i++) {
    const q = V(0.012 * i, p[1] - 0.03 - i * 0.012, p[2] - 0.09 + i * 0.007);
    g.add(strut(p, q, 0.042 - i * 0.0035, i % 2 ? bone : boneD, { r: 0.011 }));
    p = q;
  }
  g.userData.height = 1.05;
  g.userData.tag = new THREE.Vector3(0, 1.32, 0.3);
  return bake(g);
}

// ---------------------------------------------------------------------------------------------
// Ruin guardian: a hulking golem of fallen masonry, overgrown, its back still a battlement
// ---------------------------------------------------------------------------------------------
export function makeGolem(sprites, tiles, { glow = 1 } = {}) {
  const mk = (t, color, ns = 0.7) => patch(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(ns, ns), color, roughness: 0.96 }));
  const st = mk(tiles.brick, 0xc9c6c0), stM = mk(tiles.brickMoss, 0xc4c4bc), stD = mk(tiles.brick, 0x8a8783), stL = mk(tiles.brick, 0xe2dfd8), top = mk(tiles.brickTop, 0xbdbdb5);
  const moss = mat(0x363d2b, { tex: 'fur', rough: 1 });
  const mossL = mat(0x4a5037, { tex: 'fur', rough: 1 });
  const dark = mat(0x070809, { tex: null, rough: 1 });
  const twig = mat(0x2b241e, { tex: 'wood', rough: 1 });
  const glowC = new THREE.Color(0.5, 0.92, 0.88);
  const B = (w, h, d, m, o = {}) => box(w, h, d, m, { r: 0.035, seg: 2, uv: 0.82, ...o });
  const g = new THREE.Group();
  g.name = 'golem';

  // legs: squat piers
  const leg = (sx, z, ry) => J(sx * 0.6, 0, z, 0, ry, sx * -0.03,
    at(B(0.92, 0.3, 1.05, stD), 0, 0.15, 0.08),
    at(B(0.72, 0.52, 0.76, stM), 0, 0.56, 0, 0, 0.1, 0),
    at(B(0.8, 0.44, 0.84, st), 0, 1.02, -0.02, 0, -0.08, 0.02),
    at(box(0.84, 0.06, 0.98, moss, { r: 0.03 }), 0, 0.33, 0.06),
  );
  g.add(leg(1, 0.16, -0.22), leg(-1, -0.16, 0.18));
  g.add(at(B(1.62, 0.46, 0.98, stD), 0, 1.4, -0.03, 0.06, 0, 0.02));                         // hips
  // torso: leans forward on its arms
  const T = J(0, 1.6, -0.02, 0.34, 0.06, -0.03);
  g.add(T);
  T.add(at(B(1.8, 0.6, 1.1, stM, { anchor: 'bottom' }), 0, 0, 0));
  T.add(at(B(2.3, 0.72, 1.28, st, { anchor: 'bottom', taper: [1.07, 1.02] }), 0.02, 0.56, 0.04, 0, 0.03, 0));
  T.add(at(B(2.5, 0.36, 1.22, stL, { anchor: 'bottom' }), -0.02, 1.26, -0.02, 0, -0.03, 0.015));    // shoulder course
  T.add(at(box(2.5, 0.07, 1.2, moss, { r: 0.03 }), -0.02, 1.64, -0.02, 0, -0.03, 0.015));
  // the back is a stump of curtain wall: a parapet with broken merlons
  T.add(at(B(2.3, 0.42, 0.42, st, { anchor: 'bottom' }), 0, 1.6, -0.42, -0.06, 0, 0.01));
  const mer = [[-0.95, 0.44], [-0.48, 0.3], [0.0, 0.46], [0.48, 0.16], [0.95, 0.4]];
  for (const [x, h] of mer) T.add(at(B(0.34, h, 0.42, h > 0.35 ? stL : stD, { anchor: 'bottom' }), x, 2.0, -0.42, -0.06, 0, (x * 7 % 3) * 0.02));
  T.add(at(box(0.36, 0.06, 0.44, mossL, { r: 0.02 }), -0.95, 2.47, -0.45, -0.06, 0, 0));
  T.add(at(box(0.36, 0.06, 0.44, moss, { r: 0.02 }), 0, 2.49, -0.45, -0.06, 0, 0));
  // chest hollow: shards of the glowing ore that drive it
  T.add(at(box(0.5, 0.6, 0.2, dark, { r: 0.02 }), 0, 0.84, 0.6));
  T.add(at(B(0.22, 0.74, 0.3, stD), -0.35, 0.86, 0.62, 0, 0.2, 0.07));
  T.add(at(B(0.22, 0.7, 0.3, stD), 0.35, 0.84, 0.62, 0, -0.2, -0.05));
  T.add(at(B(0.86, 0.2, 0.32, stL), 0, 1.22, 0.62, 0.1, 0, 0.03));
  T.add(at(B(0.8, 0.16, 0.3, st), 0, 0.5, 0.63, -0.05, 0, -0.02));
  // a cluster of ore crystals: tapered prisms, each a slightly different brightness
  const crystals = [[-0.1, 0.56, 0.13, 0.42, 0.28, 0.5], [0.06, 0.56, 0.15, 0.56, -0.12, 0.85], [0.16, 0.57, 0.1, 0.3, -0.5, 0.42], [-0.02, 0.57, 0.09, 0.26, 0.62, 0.36], [-0.17, 0.57, 0.08, 0.22, 0.75, 0.3]];
  for (const [x, y, w, h, rz, k] of crystals) {
    const c = new THREE.Mesh(boxGeo(w, h, w * 0.8, { r: 0, taper: [0.3, 0.3], anchor: 'bottom' }), patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.86, 0.78).multiplyScalar(k * 1.5 * glow) })));
    T.add(at(c, x, y, 0.66, 0.12, x * 3, rz));
    const core = new THREE.Mesh(boxGeo(w * 0.34, h * 0.72, w * 0.3, { r: 0, taper: [0.3, 0.3], anchor: 'bottom' }), patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.5, 1.4).multiplyScalar((0.6 + k) * glow) })));
    T.add(at(core, x, y + 0.02, 0.7, 0.12, x * 3, rz));
  }
  T.add(at(glowDot(sprites, 1.5, glowC.clone().multiplyScalar(0.3 * glow), 0.4), 0, 0.84, 0.82));
  g.userData.core = new THREE.Vector3(0, 2.35, 0.95);
  // head: a small worn block sunk low between the shoulders, one slit
  const head = J(0.03, 1.36, 0.56, 0.2, 0.14, 0.03);
  T.add(head);
  head.add(at(B(0.66, 0.56, 0.64, stM, { taper: [0.88, 0.9] }), 0, 0.2, 0));
  head.add(at(B(0.74, 0.15, 0.26, stL), 0, 0.33, 0.3, 0.22, 0, 0));
  head.add(at(box(0.42, 0.065, 0.06, dark, { r: 0.01 }), 0, 0.2, 0.305));
  head.add(at(emissiveBox(0.3, 0.028, 0.02, glowC.clone().multiplyScalar(3.2 * glow)), 0, 0.2, 0.318));
  head.add(at(glowDot(sprites, 0.5, glowC.clone().multiplyScalar(0.35 * glow), 0.5), 0, 0.2, 0.36));
  head.add(at(B(0.3, 0.2, 0.12, stD), 0, 0.02, 0.3, -0.1, 0, 0));
  head.add(at(box(0.64, 0.09, 0.6, mossL, { r: 0.04, taper: [0.7, 0.7] }), 0, 0.52, -0.03));
  // shoulders
  const shL = J(-1.36, 1.2, 0.08, 0.05, 0.1, 0.14);
  T.add(shL);
  shL.add(at(B(0.98, 0.78, 1.04, st), 0, 0, 0));
  shL.add(at(B(1.02, 0.2, 1.08, top), 0, 0.46, 0));
  shL.add(at(B(0.5, 0.26, 0.5, stD), -0.1, 0.68, 0.1, 0, 0.3, 0.05));
  const shR = J(1.38, 1.16, 0.05, 0.02, -0.12, -0.18);
  T.add(shR);
  shR.add(at(B(0.96, 0.76, 1.0, stM), 0, 0, 0));
  shR.add(at(box(0.98, 0.12, 1.02, moss, { r: 0.05 }), 0, 0.43, 0));
  shR.add(at(box(0.5, 0.11, 0.5, mossL, { r: 0.05 }), 0.12, 0.51, 0.1));
  for (let i = 0; i < 5; i++) shR.add(at(box(0.08, 0.36 + (i % 2) * 0.22, 0.025, i % 2 ? moss : mossL, { r: 0.008, anchor: 'top', taper: [0.4, 1] }), 0.12 + i * 0.08, 0.36, 0.51, -0.06, 0, 0.03 * i));
  shR.add(strut(V(0.05, 0.45, -0.1), V(0.0, 1.1, -0.2), 0.07, twig, { taper: 0.6 }));                 // dead sapling
  shR.add(strut(V(0.01, 0.88, -0.16), V(0.3, 1.22, -0.1), 0.04, twig, { taper: 0.5 }));
  shR.add(strut(V(0.0, 1.06, -0.2), V(-0.2, 1.46, -0.3), 0.035, twig, { taper: 0.5 }));
  shR.add(strut(V(0.0, 1.08, -0.2), V(0.1, 1.5, -0.14), 0.03, twig, { taper: 0.5 }));
  // arms: forearms like fallen column drums, fists on or near the ground
  const arm = (sx, rx, rz, elbow, m1, m2) => J(sx * 1.5, 1.02, 0.12, rx, 0, rz,
    at(B(0.6, 0.86, 0.64, m1, { anchor: 'top' }), 0, 0, 0),
    J(0, -0.84, 0, elbow, 0, sx * 0.06,
      at(B(0.78, 1.1, 0.82, m2, { anchor: 'top', taper: [0.84, 0.84] }), 0, 0.06, 0),
      at(B(0.86, 0.17, 0.9, stD), 0, -0.4, 0),
      at(box(0.8, 0.08, 0.5, moss, { r: 0.03 }), 0, -0.02, -0.2, 0.3, 0, 0),
      at(B(0.9, 0.6, 0.94, stD, { anchor: 'top' }), 0, -0.98, 0.04, 0.1, sx * 0.2, 0),
      ...[-1, 0, 1].map((k) => at(B(0.26, 0.24, 0.3, k === 0 ? stL : st), k * 0.3, -1.57, 0.34, 0.2, 0, 0))),
  );
  T.add(arm(-1, -0.56, -0.1, -0.2, stM, st));
  T.add(arm(1, -0.36, 0.14, -0.38, st, stM));
  g.userData.height = 3.6;
  g.userData.tag = new THREE.Vector3(0, 4.15, 0.5);
  return bake(g);
}
