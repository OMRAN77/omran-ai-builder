// The cast of "kawkab": the astronaut-engineer, her survey drone, the six-legged pack beast and
// three hostiles (crawler, wraith, rogue sentry). Everything is assembled from rounded boxes,
// cylinders and sphere caps; each figure is a few dozen small meshes in an idle pose.
import * as THREE from 'three';
import { MAT, std, emis, put, rbox, boxG, cylG, sphG, strut, halo, tiled, tboxGeo } from './props.js';

const J = (parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.set(rx, ry, rz);
  parent.add(g);
  return g;
};

const C = {
  suit: std(0xd6dae1, { roughness: 0.62, metalness: 0.03 }),
  soft: std(0x69707e, { roughness: 0.8, metalness: 0 }),
  dark: std(0x23262d, { roughness: 0.55, metalness: 0.25 }),
  sole: std(0x101114, { roughness: 0.9 }),
  visor: emis(0x3fcfe8, 0.85, 'visor', 0x03161d),
  visorHot: emis(0x9af4ff, 1.8, 'visor', 0x052028),
  screen: emis(0x5cf2ff, 1.6, 'tech'),
  screenDim: emis(0x39c6d8, 0.55, 'tech', 0x04181e),
  toolTop: std(0x596070, { roughness: 0.45, metalness: 0.45 }),
  lens: emis(0x5cf2ff, 2.2, 'tech', 0x041418),
  // pack beast
  hide: std(0x8a7f96, { roughness: 0.9 }),
  hideLight: std(0xb6abb9, { roughness: 0.9 }),
  plate: std(0x3d3f62, { roughness: 0.5, metalness: 0.1 }),
  hoof: std(0x2f2a36, { roughness: 0.6 }),
  bone: std(0xd8d0c6, { roughness: 0.55 }),
  strap: std(0x5a3a22, { roughness: 0.85 }),
  tarp: std(0x8d8676, { roughness: 0.95 }),
  spot: emis(0x58f6d2, 1.3, 'flora', 0x103a38),
  eyeDim: std(0x0a0a10, { roughness: 0.15, metalness: 0.6 }),
  // crawler
  chitin: std(0x554e80, { roughness: 0.26, metalness: 0.35 }),
  chitin2: std(0x5c3156, { roughness: 0.42, metalness: 0.25 }),
  chitinEdge: std(0x9a92c4, { roughness: 0.3, metalness: 0.45 }),
  seam: emis(0xff3d8a, 1.6, 'hostile', 0x1a0812),
  spine: emis(0xff5aa2, 2.3, 'hostile', 0x3a0c24),
  spineBase: emis(0xd0307a, 0.4, 'hostile', 0x2a1030),
  ember: emis(0xff6a22, 2.0, 'hostile', 0x200800),
  // wraith
  bell: new THREE.MeshStandardMaterial({ color: 0xb9a4ff, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.42, emissive: 0x7a48ff, emissiveIntensity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  bellIn: new THREE.MeshStandardMaterial({ color: 0xe0b8ff, roughness: 0.4, transparent: true, opacity: 0.6, emissive: 0xd060ff, emissiveIntensity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  core: emis(0xffb0f0, 3.2, 'hostile', 0x401040),
  tendril: emis(0xc890ff, 1.3, 'hostile', 0x24103c),
  sting: emis(0xff6ad8, 3.0, 'hostile', 0x300820),
  // sentry
  hullOld: std(0xb4b6b8, { roughness: 0.68, metalness: 0.2 }),
  rust: std(0x6a4a3a, { roughness: 0.9, metalness: 0.2 }),
  copper: std(0xb86a32, { roughness: 0.4, metalness: 0.8 }),
  redEye: emis(0xff1c0c, 2.4, 'hostile', 0x1a0403),
};

C.visor.roughness = 0.12; C.visor.metalness = 0.5;
{
  // woven-fabric normal map for the suit (64px, tiled) so it does not read as moulded plastic
  const S = 64, d = new Uint8Array(S * S * 4), T = Math.PI * 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const nx = Math.cos(u * T * 8) * Math.sin(v * T * 8) * 0.55 + Math.cos(u * T * 3 + v * T * 2) * 0.25;
    const ny = Math.sin(u * T * 8) * Math.cos(v * T * 8) * 0.55 + Math.cos(v * T * 3 - u * T) * 0.25;
    const l = Math.hypot(nx, ny, 1), i = (y * S + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  for (const m of [C.suit, C.soft]) { m.normalMap = t; m.normalScale = new THREE.Vector2(0.3, 0.3); }
  C.suitLow = C.suit.clone(); C.suitLow.color.set(0xc3c0c2); C.suitLow.roughness = 0.72;       // dustier lower legs
}

// ------------------------------------------------------------------ multitool (also the first-person view model)
export function makeMultitool(detail = false) {
  const g = new THREE.Group();
  const r = detail ? 4 : 2;
  // receiver: white upper shroud over a graphite frame
  g.add(put(rbox(0.08, 0.052, 0.29, 0.016, r), C.dark, 0, -0.024, 0));
  g.add(put(rbox(0.086, 0.056, 0.3, 0.018, r), MAT.white, 0, 0.024, 0));
  g.add(put(rbox(0.07, 0.03, 0.22, 0.01, r), C.toolTop, 0, 0.062, -0.02));
  g.add(put(rbox(0.09, 0.062, 0.022, 0.006, r), MAT.orange, 0, 0.022, 0.1));           // safety band
  g.add(put(rbox(0.055, 0.15, 0.065, 0.018, r), C.dark, 0, -0.11, -0.085, 0.22, 0, 0));
  g.add(put(rbox(0.02, 0.06, 0.1, 0.008, r), C.dark, 0, -0.08, 0.0));
  // emitter head
  g.add(put(cylG(0.03, 0.036, 0.1, detail ? 16 : 8), MAT.grey, 0, 0.0, 0.2, Math.PI / 2, 0, 0));
  g.add(put(cylG(0.038, 0.038, 0.016, detail ? 16 : 8), C.dark, 0, 0.0, 0.165, Math.PI / 2, 0, 0));
  g.add(put(cylG(0.022, 0.022, 0.012, detail ? 16 : 8), C.lens, 0, 0.0, 0.252, Math.PI / 2, 0, 0));
  for (const s of [-1, 1]) {
    g.add(put(rbox(0.012, 0.028, 0.13, 0.004, 1), C.toolTop, s * 0.045, 0, 0.21));
    g.add(put(rbox(0.014, 0.014, 0.03, 0.004, 1), C.screen, s * 0.045, 0, 0.268));
  }
  g.add(put(rbox(0.012, 0.012, 0.13, 0.004, 1), MAT.grey, 0, 0.047, 0.21));
  // power cell + status
  g.add(put(cylG(0.026, 0.026, 0.11, detail ? 14 : 8), C.toolTop, 0.058, -0.012, -0.05, Math.PI / 2, 0, 0));
  g.add(put(cylG(0.0275, 0.0275, 0.024, detail ? 14 : 8), MAT.orange, 0.058, -0.012, -0.05, Math.PI / 2, 0, 0));
  g.add(put(rbox(0.04, 0.012, 0.05, 0.004, 1), detail ? C.screenDim : C.screen, 0, 0.08, -0.06));
  if (detail) {
    g.add(put(cylG(0.03, 0.03, 0.02, 14), C.dark, 0.058, -0.012, 0.01, Math.PI / 2, 0, 0));
    g.add(put(cylG(0.03, 0.03, 0.02, 14), C.dark, 0.058, -0.012, -0.11, Math.PI / 2, 0, 0));
    for (let i = 0; i < 4; i++) g.add(put(boxG(0.089, 0.005, 0.012), C.dark, 0, 0.03, -0.05 - i * 0.022));    // cooling slots
    g.add(put(sphG(0.008, 8, 6), MAT.amber, -0.03, 0.08, 0.03));
    g.add(put(rbox(0.012, 0.04, 0.012, 0.004, 1), MAT.grey, -0.046, 0.01, -0.02));
  }
  return g;
}

// ------------------------------------------------------------------ astronaut-engineer (player)
export function makeAstronaut() {
  const root = new THREE.Group();
  const hips = J(root, 0, 0.95, 0, 0, 0, 0.035);
  hips.add(put(rbox(0.38, 0.22, 0.26, 0.07), C.soft, 0, 0, 0));
  hips.add(put(rbox(0.4, 0.065, 0.28, 0.02), C.dark, 0, 0.09, 0));
  hips.add(put(rbox(0.08, 0.05, 0.03, 0.01), MAT.grey, 0, 0.09, 0.14));
  hips.add(put(rbox(0.095, 0.13, 0.07, 0.02), MAT.orange, 0.195, -0.01, 0.06));
  hips.add(put(rbox(0.09, 0.16, 0.1, 0.02), C.dark, -0.21, -0.03, -0.01));
  const leg = (s, thighRx, thighRz, kneeRx, footRx) => {
    const thigh = J(hips, s * 0.102, -0.03, 0, thighRx, 0, thighRz);
    thigh.add(put(rbox(0.178, 0.44, 0.196, 0.07), C.suit, 0, -0.2, 0));
    thigh.add(put(rbox(0.184, 0.06, 0.202, 0.02), C.soft, 0, -0.03, 0));
    thigh.add(put(rbox(0.045, 0.13, 0.11, 0.012), C.dark, s * 0.09, -0.2, 0));
    thigh.add(put(rbox(0.186, 0.03, 0.204, 0.01), C.soft, 0, -0.33, 0));                 // stitched seam
    const knee = J(thigh, 0, -0.41, 0, kneeRx, 0, 0);
    knee.add(put(rbox(0.14, 0.13, 0.06, 0.025), C.dark, 0, -0.01, 0.085));
    knee.add(put(rbox(0.165, 0.09, 0.185, 0.035), C.soft, 0, 0, 0));
    knee.add(put(rbox(0.16, 0.4, 0.178, 0.06), C.suitLow, 0, -0.22, 0));
    knee.add(put(rbox(0.166, 0.04, 0.184, 0.012), MAT.orange, 0, -0.3, 0));
    const foot = J(knee, 0, -0.41, 0, footRx, 0, 0);
    foot.add(put(rbox(0.172, 0.16, 0.215, 0.045), C.dark, 0, -0.025, 0.0));
    foot.add(put(rbox(0.165, 0.095, 0.18, 0.035), C.dark, 0, -0.05, 0.14));
    foot.add(put(rbox(0.178, 0.032, 0.34, 0.012), C.sole, 0, -0.086, 0.06));
    foot.add(put(rbox(0.176, 0.03, 0.06, 0.01), MAT.grey, 0, 0.03, 0.105));               // boot clasp
    return thigh;
  };
  leg(-1, 0.04, -0.07, 0.02, -0.06);                         // standing leg
  leg(1, -0.2, 0.11, 0.34, -0.14);                           // relaxed leg, knee forward

  const chest = J(hips, 0, 0.1, 0, 0.03, -0.12, -0.05);
  chest.add(put(rbox(0.32, 0.18, 0.225, 0.07), C.soft, 0, 0.06, 0));
  chest.add(put(rbox(0.45, 0.37, 0.295, 0.09, 3), C.suit, 0, 0.32, 0));
  chest.add(put(rbox(0.33, 0.07, 0.302, 0.02), C.soft, 0, 0.17, 0));
  for (const s of [-1, 1]) chest.add(put(rbox(0.06, 0.05, 0.33, 0.015), C.dark, s * 0.135, 0.505, -0.02));
  chest.add(put(rbox(0.22, 0.15, 0.06, 0.02), C.dark, 0, 0.33, 0.14));
  chest.add(put(rbox(0.09, 0.045, 0.012, 0.004, 1), C.screen, -0.04, 0.35, 0.172));
  chest.add(put(rbox(0.025, 0.025, 0.012, 0.004, 1), MAT.amber, 0.06, 0.36, 0.172));
  chest.add(put(rbox(0.025, 0.025, 0.012, 0.004, 1), MAT.orange, 0.06, 0.31, 0.172));
  chest.add(put(cylG(0.13, 0.158, 0.075, 14), C.dark, 0, 0.54, 0));
  chest.add(put(cylG(0.145, 0.145, 0.02, 14), MAT.grey, 0, 0.515, 0));                    // neck ring
  chest.add(strut(-0.11, 0.27, 0.165, -0.215, 0.47, 0.07, 0.018, C.dark, 5));   // hose
  chest.add(strut(0.11, 0.27, 0.165, 0.215, 0.47, 0.07, 0.018, C.dark, 5));
  for (const s of [-1, 1]) chest.add(put(rbox(0.05, 0.3, 0.02, 0.008, 1), C.soft, s * 0.165, 0.33, 0.146, 0, 0, s * 0.08));   // harness straps
  // backpack: life support + tool rack
  const pack = J(chest, 0, 0.33, -0.25);
  pack.add(put(rbox(0.4, 0.52, 0.19, 0.05), C.suit, 0, 0, 0));
  pack.add(put(rbox(0.405, 0.08, 0.195, 0.02), MAT.orange, 0, 0.1, 0));
  pack.add(put(rbox(0.3, 0.14, 0.06, 0.02), C.dark, 0, -0.12, -0.095));
  for (const s of [-1, 1]) {
    pack.add(put(cylG(0.066, 0.066, 0.4, 10), C.dark, s * 0.105, 0.05, -0.12));
    pack.add(put(sphG(0.066, 10, 6), MAT.grey, s * 0.105, 0.25, -0.12));
  }
  pack.add(put(rbox(0.28, 0.05, 0.13, 0.02), C.dark, 0, 0.285, 0.0));
  pack.add(strut(0.16, 0.26, -0.02, 0.18, 0.63, -0.06, 0.012, C.dark, 4));
  pack.add(put(sphG(0.018, 6, 5), MAT.amber, 0.18, 0.64, -0.06));
  pack.add(put(rbox(0.05, 0.05, 0.03, 0.01), C.screen, -0.14, 0.19, -0.1));

  const arm = (s, shRx, shRz, elRx, wristRy = 0) => {
    const sh = J(chest, s * 0.275, 0.45, 0, shRx, 0, shRz);
    sh.add(put(rbox(0.175, 0.16, 0.195, 0.07), C.suit, s * 0.01, 0.0, 0));
    sh.add(put(rbox(0.128, 0.3, 0.14, 0.055), C.suit, s * 0.02, -0.17, 0));
    if (s > 0) sh.add(put(rbox(0.134, 0.045, 0.146, 0.012), MAT.orange, s * 0.02, -0.12, 0));
    const el = J(sh, s * 0.02, -0.31, 0, elRx, wristRy, 0);
    el.add(put(rbox(0.132, 0.085, 0.144, 0.04), C.soft, 0, 0, 0));
    el.add(put(rbox(0.114, 0.26, 0.126, 0.05), C.suit, 0, -0.15, 0));
    el.add(put(rbox(0.128, 0.1, 0.14, 0.03), C.dark, 0, -0.22, 0));
    const hand = J(el, 0, -0.32, 0);
    hand.add(put(rbox(0.095, 0.115, 0.105, 0.035), C.dark, 0, 0, 0));
    return { sh, el, hand };
  };
  const armL = arm(-1, 0.12, -0.17, -0.3);
  armL.el.add(put(rbox(0.012, 0.06, 0.07, 0.004, 1), C.screen, -0.067, -0.21, 0));     // wrist display
  const armR = arm(1, -0.55, 0.1, -1.05, -0.25);
  const tool = makeMultitool(false);
  tool.position.set(0, -0.05, 0.09); tool.rotation.set(Math.PI / 2 + 0.1, 0, 0);
  armR.hand.add(tool);

  const head = J(chest, 0, 0.575, 0.01, 0.03, 0.42, 0.02);
  head.add(put(rbox(0.27, 0.27, 0.29, 0.105, 4), C.suit, 0, 0.135, 0));
  head.add(put(rbox(0.26, 0.165, 0.12, 0.05, 3), C.dark, 0, 0.14, 0.097));
  head.add(put(rbox(0.23, 0.115, 0.1, 0.045, 3), C.visor, 0, 0.142, 0.116));
  head.add(put(rbox(0.15, 0.012, 0.02, 0.004, 1), C.visorHot, 0, 0.106, 0.16));
  head.add(put(rbox(0.07, 0.035, 0.24, 0.012), MAT.orange, 0, 0.272, -0.02));
  head.add(put(rbox(0.295, 0.07, 0.12, 0.03), C.dark, 0, 0.04, -0.06));
  head.add(put(cylG(0.028, 0.028, 0.06, 8), C.dark, 0.152, 0.2, 0.04, Math.PI / 2, 0, 0));
  head.add(put(cylG(0.02, 0.02, 0.012, 8), MAT.warm, 0.152, 0.2, 0.075, Math.PI / 2, 0, 0));
  head.add(put(rbox(0.03, 0.09, 0.09, 0.01), C.dark, -0.148, 0.13, 0.0));
  const vh = halo(0x66ecff, 0.55, 0.22, 'visor'); vh.position.set(0, 0.142, 0.2); head.add(vh);
  root.userData = { height: 1.9, head };
  return root;
}

// ------------------------------------------------------------------ survey drone (friendly)
export function makeDrone() {
  const g = new THREE.Group();
  g.add(put(cylG(0.2, 0.23, 0.13, 8), C.suit, 0, 0, 0));
  g.add(put(cylG(0.12, 0.2, 0.07, 8), C.dark, 0, 0.1, 0));
  g.add(put(cylG(0.235, 0.235, 0.03, 8), MAT.orange, 0, 0.02, 0));
  g.add(put(cylG(0.17, 0.1, 0.07, 8), C.dark, 0, -0.1, 0));
  g.add(put(new THREE.TorusGeometry(0.13, 0.018, 6, 20), C.screen, 0, -0.14, 0, Math.PI / 2, 0, 0));
  // sensor head: one big survey lens and a small range finder, off-centre
  g.add(put(cylG(0.085, 0.095, 0.12, 12), C.dark, 0.03, 0.0, 0.21, Math.PI / 2, 0, 0));
  g.add(put(cylG(0.062, 0.062, 0.02, 12), C.lens, 0.03, 0.0, 0.275, Math.PI / 2, 0, 0));
  g.add(put(cylG(0.03, 0.03, 0.02, 10), MAT.glass, 0.03, 0.0, 0.288, Math.PI / 2, 0, 0));
  g.add(put(cylG(0.025, 0.025, 0.08, 8), MAT.grey, -0.1, 0.03, 0.21, Math.PI / 2, 0, 0));
  g.add(put(cylG(0.014, 0.014, 0.01, 8), MAT.amber, -0.1, 0.03, 0.252, Math.PI / 2, 0, 0));
  // lift pods on short booms
  for (const s of [-1, 1]) {
    g.add(put(rbox(0.16, 0.035, 0.06, 0.012), C.dark, s * 0.28, 0.01, -0.02));
    const pod = J(g, s * 0.39, 0.0, -0.02, 0, 0, s * 0.12);
    pod.add(put(cylG(0.085, 0.07, 0.13, 10), C.suit, 0, 0, 0));
    pod.add(put(cylG(0.09, 0.09, 0.03, 10), MAT.orange, 0, 0.035, 0));
    pod.add(put(cylG(0.055, 0.055, 0.012, 10), C.screen, 0, -0.07, 0));
  }
  g.add(strut(-0.06, 0.13, -0.08, -0.12, 0.42, -0.2, 0.008, C.dark, 4));
  g.add(strut(0.07, 0.13, -0.1, 0.1, 0.32, -0.22, 0.008, C.dark, 4));
  g.add(put(sphG(0.014, 6, 5), MAT.red, -0.12, 0.43, -0.2));
  const h = halo(0x5cf2ff, 0.9, 0.5, 'visor'); h.position.set(0, -0.2, 0); g.add(h);
  g.userData = { height: 0.5 };
  return g;
}

// ------------------------------------------------------------------ pack beast (friendly, six legs)
export function makePackBeast() {
  const g = new THREE.Group();
  const body = J(g, 0, 0, 0);
  // three barrel segments
  body.add(put(rbox(0.98, 0.92, 1.0, 0.3, 4), C.hide, 0, 1.02, 0.78, 0.05, 0, 0));
  body.add(put(rbox(1.1, 0.98, 1.05, 0.32, 4), C.hide, 0, 1.05, 0.0));
  body.add(put(rbox(0.94, 0.84, 0.95, 0.28, 4), C.hide, 0, 0.98, -0.8, -0.06, 0, 0));
  body.add(put(rbox(0.8, 0.3, 2.3, 0.14, 3), C.hideLight, 0, 0.62, 0.0));
  // overlapping dorsal plates
  const plates = [[0.82, 1.5, 0.8, 0.88, 0.1], [0.3, 1.56, 0.02, 1.0, 0.0], [-0.26, 1.53, -0.02, 0.96, -0.02], [-0.8, 1.42, -0.8, 0.84, -0.1]];
  for (const [z, y, , w, rx] of plates) {
    body.add(put(rbox(w, 0.13, 0.62, 0.06, 3), C.plate, 0, y, z, rx, 0, 0));
    for (const s of [-1, 1]) body.add(put(rbox(0.16, 0.34, 0.58, 0.06, 3), C.plate, s * (w / 2 + 0.02), y - 0.17, z, rx, 0, s * 0.28));
  }
  // lateral line of light organs
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const z = 1.05 - i * 0.36, r = 0.024 + (i % 3) * 0.008;
    const m = put(sphG(r, 8, 6), C.spot, s * (0.53 - Math.abs(i - 3) * 0.02), 0.86 + Math.sin(i * 1.3) * 0.04, z);
    m.scale.set(0.5, 1, 1); body.add(m);
  }
  // six legs: shoulder -> knee -> hoof
  const legs = [[0.98, -0.16, 0.2, -0.05], [0.08, 0.1, 0.12, 0.05], [-0.82, 0.22, 0.3, -0.1]];
  for (const [z, rx, knee, foot] of legs) for (const s of [-1, 1]) {
    const k = s > 0 ? 1 : 0.6;
    const up = J(body, s * 0.42, 0.82, z, rx * k, 0, s * 0.1);
    up.add(put(rbox(0.26, 0.52, 0.3, 0.1, 3), C.hide, 0, -0.2, 0));
    const lo = J(up, 0, -0.42, 0, knee * k, 0, -s * 0.1);
    lo.add(put(rbox(0.2, 0.2, 0.22, 0.08, 3), C.plate, 0, 0, 0.03));
    lo.add(put(rbox(0.16, 0.4, 0.18, 0.06, 3), C.hide, 0, -0.18, 0));
    const ft = J(lo, 0, -0.36, 0, foot - rx * k - knee * k, 0, 0);
    ft.add(put(rbox(0.2, 0.12, 0.22, 0.04, 2), C.hoof, 0, 0.02, 0.02));
    ft.add(put(rbox(0.07, 0.07, 0.09, 0.02, 1), C.hoof, -0.055, -0.005, 0.14));
    ft.add(put(rbox(0.07, 0.07, 0.09, 0.02, 1), C.hoof, 0.055, -0.005, 0.14));
  }
  // neck + low-slung head with a brow shield and two luminous feelers
  const neck = J(body, 0, 1.06, 1.22, 0.2, 0, 0);
  neck.add(put(rbox(0.56, 0.52, 0.62, 0.2, 3), C.hide, 0, 0, 0.12));
  for (const z of [0.0, 0.2]) neck.add(put(rbox(0.6, 0.5, 0.07, 0.03, 2), C.hideLight, 0, -0.03, z, 0.1, 0, 0));    // neck folds
  const head = J(neck, 0, -0.04, 0.5, 0.2, 0.3, 0);
  head.add(put(rbox(0.46, 0.36, 0.56, 0.14, 3), C.hide, 0, 0, 0.2));
  head.add(put(rbox(0.36, 0.22, 0.32, 0.1, 3), C.hideLight, 0, -0.03, 0.52));                 // upper muzzle
  head.add(put(rbox(0.31, 0.1, 0.3, 0.045, 3), C.hide, 0, -0.2, 0.47, 0.14, 0, 0));          // lower jaw, slightly open
  head.add(put(rbox(0.3, 0.02, 0.26, 0.008, 1), C.hoof, 0, -0.145, 0.5, 0.07, 0, 0));        // mouth line
  head.add(put(rbox(0.5, 0.1, 0.42, 0.045, 3), C.plate, 0, 0.19, 0.12, -0.12, 0, 0));        // brow shield
  head.add(put(rbox(0.24, 0.06, 0.2, 0.025, 2), C.plate, 0, 0.085, 0.56, 0.2, 0, 0));        // nose plate
  for (const s of [-1, 1]) {
    head.add(put(rbox(0.1, 0.1, 0.3, 0.04, 2), C.bone, s * 0.26, 0.2, -0.08, 0.25, s * 0.25, 0));
    head.add(put(rbox(0.04, 0.022, 0.05, 0.01, 1), C.eyeDim, s * 0.075, 0.0, 0.672));          // nostril
    head.add(strut(s * 0.17, -0.16, 0.5, s * 0.215, -0.07, 0.74, 0.032, C.bone, 6, 0.006));   // cheek tusk
    head.add(put(rbox(0.05, 0.2, 0.2, 0.02, 2), C.hideLight, s * 0.225, -0.06, 0.22));         // cheek fold
    head.add(put(sphG(0.019, 8, 6), C.eyeDim, s * 0.222, 0.035, 0.4));
    head.add(put(sphG(0.026, 8, 6), C.eyeDim, s * 0.228, 0.05, 0.3));
    head.add(strut(s * 0.15, -0.1, 0.6, s * 0.3, -0.26, 0.76, 0.016, C.hide, 5, 0.01));
    head.add(strut(s * 0.3, -0.26, 0.76, s * 0.33, -0.46, 0.72, 0.01, C.hide, 5, 0.006));
    head.add(put(sphG(0.024, 8, 6), C.spot, s * 0.33, -0.48, 0.72));
  }
  // tail
  const tail = J(body, 0, 1.05, -1.25, -0.7, 0, 0);
  tail.add(put(rbox(0.3, 0.26, 0.5, 0.1, 2), C.hide, 0, 0, -0.18));
  tail.add(put(rbox(0.18, 0.16, 0.42, 0.06, 2), C.hide, 0, -0.03, -0.55, -0.25, 0, 0));
  tail.add(put(sphG(0.045, 8, 6), C.spot, 0, -0.1, -0.78));
  // cargo harness
  const cargo = J(body, 0, 1.0, 0.0);
  cargo.add(put(rbox(1.16, 0.06, 0.86, 0.02, 2), C.strap, 0, 0.62, 0.02));
  for (const z of [-0.3, 0.34]) {
    cargo.add(put(rbox(1.16, 0.05, 0.09, 0.015, 1), C.dark, 0, 0.63, z));
    for (const s of [-1, 1]) cargo.add(put(rbox(0.05, 0.95, 0.09, 0.015, 1), C.dark, s * 0.575, 0.16, z));
  }
  for (const s of [-1, 1]) {
    cargo.add(put(tboxGeo(0.36, 0.5, 0.74, 1.4), tiled('cargo'), s * 0.76, 0.12, 0.02, 0, 0, -s * 0.06));
    cargo.add(put(rbox(0.1, 0.08, 0.5, 0.02, 1), C.dark, s * 0.6, 0.42, 0.02));
  }
  cargo.add(put(cylG(0.15, 0.15, 0.95, 12), C.tarp, 0, 0.8, -0.24, 0, 0, Math.PI / 2));
  for (const x of [-0.3, 0.3]) cargo.add(put(cylG(0.156, 0.156, 0.05, 12), C.strap, x, 0.8, -0.24, 0, 0, Math.PI / 2));
  cargo.add(put(rbox(0.52, 0.26, 0.36, 0.04, 2), C.suit, 0.05, 0.79, 0.25, 0, 0.12, 0));
  cargo.add(put(rbox(0.53, 0.06, 0.37, 0.015, 1), MAT.orange, 0.05, 0.8, 0.25, 0, 0.12, 0));
  // hanging lantern
  cargo.add(strut(0.6, 0.6, 0.48, 0.66, 0.36, 0.5, 0.008, C.dark, 4));
  cargo.add(put(cylG(0.036, 0.036, 0.1, 8), MAT.warm, 0.66, 0.3, 0.5));
  cargo.add(put(cylG(0.048, 0.048, 0.025, 8), C.dark, 0.66, 0.36, 0.5));
  cargo.add(put(cylG(0.048, 0.048, 0.025, 8), C.dark, 0.66, 0.24, 0.5));
  const lh = halo(0xffd9a0, 1.2, 0.45, 'visor'); lh.position.set(0.72, 1.3, 0.5); g.add(lh);
  g.userData = { height: 1.95, lantern: new THREE.Vector3(0.72, 1.3, 0.5) };
  return g;
}

// ------------------------------------------------------------------ crawler (hostile)
export function makeCrawler() {
  const g = new THREE.Group();
  // six armour plates on an S-curve; the front third is reared off the ground
  const segs = [
    { z: 1.0, w: 0.66, h: 0.34, y: 0.9, rx: -0.55 }, { z: 0.62, w: 0.9, h: 0.42, y: 0.68, rx: -0.42 },
    { z: 0.18, w: 1.04, h: 0.46, y: 0.53, rx: -0.2 }, { z: -0.28, w: 1.0, h: 0.44, y: 0.47, rx: -0.04 },
    { z: -0.72, w: 0.84, h: 0.38, y: 0.44, rx: 0.03 }, { z: -1.1, w: 0.62, h: 0.3, y: 0.41, rx: 0.08 },
  ];
  const bend = (z) => Math.sin(z * 1.1 + 0.4) * 0.16;
  /** One swept-back spine: dark root, luminous tip. */
  const spine = (parent, x, y, z, len, lean) => {
    const sp = J(parent, x, y, z, -0.55, 0, lean);
    sp.add(put(new THREE.CylinderGeometry(0.03, 0.062, len * 0.5, 5), C.spineBase, 0, len * 0.25, 0));
    sp.add(put(new THREE.CylinderGeometry(0.0, 0.03, len * 0.55, 5), C.spine, 0, len * 0.5 + len * 0.275, 0));
  };
  segs.forEach((s, i) => {
    const x = bend(s.z), yaw = Math.cos(s.z * 1.1 + 0.4) * 0.17;
    const sg = J(g, x, s.y, s.z, s.rx, yaw, 0);
    sg.add(put(rbox(s.w, s.h, 0.62, Math.min(0.12, s.h * 0.35), 3), C.chitin, 0, 0, 0, -0.1, 0, 0));
    sg.add(put(rbox(s.w * 0.84, s.h * 0.5, 0.44, 0.06, 2), C.chitin2, 0, -s.h * 0.42, 0));
    for (const sd of [-1, 1]) {
      sg.add(put(rbox(0.16, s.h * 0.72, 0.56, 0.05, 2), C.chitin, sd * s.w * 0.5, -s.h * 0.2, 0, -0.1, 0, sd * 0.5));
      sg.add(put(sphG(0.026, 8, 6), C.seam, sd * (s.w * 0.5 + 0.075), -s.h * 0.2, 0.08));       // lateral light organ
    }
    sg.add(put(rbox(s.w * 0.94, 0.045, 0.05, 0.015, 1), C.chitinEdge, 0, s.h * 0.44, -0.29, -0.1, 0, 0));   // pale rear lip of the plate
    if (i < segs.length - 1) sg.add(put(rbox(s.w * 0.8, 0.04, 0.035, 0.01, 1), C.seam, 0, s.h * 0.3, -0.325));
    // luminous back spines
    if (i >= 1 && i <= 4) {
      const n = i === 2 || i === 3 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const fx = (k / (n - 1) - 0.5) * s.w * 0.5;
        const len = (0.36 + (i === 2 ? 0.3 : i === 3 ? 0.24 : i === 1 ? 0.12 : 0.04) - Math.abs(fx) * 0.25) * (n === 3 && k === 1 ? 1.25 : 1);
        spine(sg, fx, s.h * 0.4, -0.02 - (k % 2) * 0.07, len, -fx * 0.9);
      }
    }
  });
  // legs are planted in body space so the feet stay on the ground under the reared front
  [2, 3, 4, 5].forEach((i, n) => {
    const s = segs[i], x0 = bend(s.z);
    for (const sd of [-1, 1]) {
      const reach = 0.5 + (n === 0 ? 0.16 : n === 1 ? 0.1 : 0), fz = s.z + (1.5 - n) * 0.3 + (sd > 0 ? 0.07 : -0.05);
      const hx = x0 + sd * s.w * 0.44, hy = s.y - 0.1;
      const kx = x0 + sd * (s.w * 0.5 + reach * 0.62), ky = s.y + 0.16, kz = (s.z + fz) / 2;
      const fx = x0 + sd * (s.w * 0.5 + reach * 1.08);
      g.add(strut(hx, hy, s.z, kx, ky, kz, 0.085, C.chitin, 6, 0.06));
      g.add(put(sphG(0.078, 8, 6), C.chitin2, kx, ky, kz));
      g.add(strut(kx, ky, kz, fx, 0.13, fz, 0.058, C.chitin, 6, 0.032));
      g.add(strut(fx, 0.13, fz, fx + sd * 0.05, 0.0, fz + 0.03, 0.03, C.bone, 5, 0.004));        // claw
    }
  });
  // raptorial fore-limbs, held up and forward under the reared plates
  for (const sd of [-1, 1]) {
    const s = segs[1], x0 = bend(s.z), hx = x0 + sd * s.w * 0.42, hy = s.y - 0.12, hz = s.z + 0.05;
    const ex = x0 + sd * (s.w * 0.5 + 0.34), ey = s.y - 0.34, ez = s.z + 0.34;
    g.add(strut(hx, hy, hz, ex, ey, ez, 0.085, C.chitin, 6, 0.06));
    g.add(put(sphG(0.074, 8, 6), C.chitin2, ex, ey, ez));
    g.add(strut(ex, ey, ez, ex - sd * 0.1, ey + 0.2, ez + 0.52, 0.062, C.chitin, 6, 0.04));
    g.add(strut(ex - sd * 0.1, ey + 0.2, ez + 0.52, ex - sd * 0.2, ey - 0.12, ez + 0.76, 0.04, C.bone, 5, 0.004));
  }
  // head: wedge with pincers and a cluster of ember sensor pits
  const head = J(g, bend(1.3) + 0.03, 1.12, 1.36, -0.18, Math.cos(1.3 * 1.1 + 0.4) * 0.2 + 0.25, 0);
  head.add(put(rbox(0.56, 0.26, 0.5, 0.08, 3), C.chitin, 0, 0, 0));
  head.add(put(rbox(0.4, 0.15, 0.28, 0.05, 2), C.chitin2, 0, -0.07, 0.26));
  head.add(put(rbox(0.62, 0.07, 0.34, 0.03, 2), C.chitin, 0, 0.14, -0.04, -0.15, 0, 0));
  head.add(put(rbox(0.6, 0.035, 0.04, 0.012, 1), C.chitinEdge, 0, 0.125, 0.135, -0.15, 0, 0));
  head.add(put(rbox(0.3, 0.2, 0.3, 0.06, 2), C.chitin2, 0, -0.1, -0.3));                          // neck
  for (const s of [-1, 1]) {
    head.add(strut(s * 0.2, -0.07, 0.2, s * 0.36, -0.12, 0.54, 0.055, C.chitin, 6, 0.04));
    head.add(strut(s * 0.36, -0.12, 0.54, s * 0.1, -0.15, 0.84, 0.04, C.bone, 5, 0.006));
    for (let k = 0; k < 3; k++) {
      const e = put(sphG(0.026 - k * 0.005, 8, 6), C.ember, s * (0.13 + k * 0.065), 0.075 - k * 0.012, 0.235 - k * 0.07);
      e.scale.set(1, 0.6, 1); head.add(e);
    }
    head.add(strut(s * 0.22, 0.15, -0.1, s * 0.52, 0.42, -0.56, 0.014, C.chitin, 4, 0.004));
  }
  // tail curling up to a luminous barb
  const tail = J(g, bend(-1.4), 0.42, -1.4, 0.25, -0.3, 0);
  tail.add(put(rbox(0.36, 0.2, 0.44, 0.06, 2), C.chitin, 0, 0, -0.1));
  tail.add(put(rbox(0.24, 0.15, 0.4, 0.05, 2), C.chitin, 0.03, 0.1, -0.44, 0.5, 0.2, 0));
  tail.add(put(rbox(0.16, 0.11, 0.3, 0.04, 2), C.chitin2, 0.06, 0.28, -0.66, 1.0, 0.2, 0));
  spine(tail, 0.07, 0.36, -0.72, 0.4, 0);
  const hs = halo(0xff4f9c, 1.7, 0.4, 'visor'); hs.position.set(0, 1.0, 0.2); g.add(hs);
  g.userData = { height: 1.5 };
  return g;
}

// ------------------------------------------------------------------ wraith (hostile, floating stinger)
export function makeWraith() {
  const g = new THREE.Group();
  const top = J(g, 0, 2.25, 0, 0.3, 0, 0.08);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.58, 24, 12, 0, Math.PI * 2, 0, 1.85), C.bell);
  bell.scale.set(1, 0.82, 1); bell.renderOrder = 4; top.add(bell);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 10, 0, Math.PI * 2, 0, 1.7), C.bellIn);
  inner.scale.set(1, 0.9, 1); inner.position.y = 0.02; inner.renderOrder = 3; top.add(inner);
  top.add(put(sphG(0.15, 12, 10), C.core, 0, 0.1, 0));
  top.add(put(new THREE.TorusGeometry(0.555, 0.028, 6, 28), C.tendril, 0, -0.13, 0, Math.PI / 2, 0, 0));
  // radial ribs on the bell
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    top.add(strut(Math.sin(a) * 0.14, 0.44, Math.cos(a) * 0.14, Math.sin(a) * 0.55, -0.1, Math.cos(a) * 0.55, 0.012, C.tendril, 4));
  }
  // short oral arms
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    let px = Math.sin(a) * 0.16, py = -0.05, pz = Math.cos(a) * 0.16;
    for (let k = 0; k < 4; k++) {
      const nx = px + Math.sin(a + k) * 0.05, ny = py - 0.16, nz = pz + Math.cos(a + k * 1.3) * 0.05;
      top.add(strut(px, py, pz, nx, ny, nz, 0.03 - k * 0.006, C.bellIn, 5, 0.024 - k * 0.006));
      px = nx; py = ny; pz = nz;
    }
  }
  // long trailing tendrils (world-aligned so they hang straight and drift backwards)
  const hang = J(g, 0, 2.2, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2, long = i % 3 === 0;
    const n = long ? 9 : 6, seg = long ? 0.23 : 0.2;
    let px = Math.sin(a) * 0.5, py = -0.12 - Math.cos(a) * 0.12, pz = Math.cos(a) * 0.5;
    for (let k = 0; k < n; k++) {
      const t = (k + 1) / n;
      const nx = px + Math.sin(a * 2 + k * 0.9) * 0.05 - Math.sin(a) * 0.03, ny = py - seg * (1 - 0.25 * t), nz = pz - 0.03 - t * 0.1 + Math.cos(a * 3 + k * 0.8) * 0.04;
      hang.add(strut(px, py, pz, nx, ny, nz, 0.02 * (1 - t * 0.6), C.tendril, 4, 0.02 * (1 - t * 0.7)));
      px = nx; py = ny; pz = nz;
    }
    if (long) {
      hang.add(put(new THREE.CylinderGeometry(0.03, 0.0, 0.16, 5), C.sting, px, py - 0.07, pz));
    } else hang.add(put(sphG(0.022, 6, 5), C.sting, px, py, pz));
  }
  const h1 = halo(0xd070ff, 2.6, 0.55, 'visor'); h1.position.set(0, 2.3, 0); g.add(h1);
  g.userData = { height: 2.95 };
  return g;
}

// ------------------------------------------------------------------ rogue sentry (hostile, damaged outpost machine)
export function makeSentry() {
  const g = new THREE.Group();
  const pelvis = J(g, 0, 1.22, 0, 0, 0, 0.03);
  pelvis.add(put(rbox(0.6, 0.26, 0.44, 0.06), C.dark, 0, 0, 0));
  pelvis.add(put(cylG(0.16, 0.16, 0.16, 10), MAT.grey, 0, 0.16, 0));
  const leg = (s, hipRx, kneeRx, ankleRx) => {
    const hip = J(pelvis, s * 0.4, -0.02, 0, hipRx, 0, s * 0.05);
    hip.add(put(cylG(0.13, 0.13, 0.16, 10), MAT.grey, 0, 0, 0, 0, 0, Math.PI / 2));
    hip.add(put(rbox(0.2, 0.62, 0.28, 0.05), C.hullOld, 0, -0.27, 0));
    hip.add(put(rbox(0.21, 0.09, 0.29, 0.02), MAT.orange, 0, -0.14, 0));
    const knee = J(hip, 0, -0.56, 0, kneeRx, 0, 0);
    knee.add(put(cylG(0.11, 0.11, 0.24, 10), C.dark, 0, 0, 0, 0, 0, Math.PI / 2));
    knee.add(put(rbox(0.14, 0.66, 0.18, 0.04), C.dark, 0, -0.32, 0));
    knee.add(strut(0.0, -0.06, -0.12, 0.0, -0.5, -0.1, 0.03, MAT.grey, 6));
    const ankle = J(knee, 0, -0.64, 0, ankleRx, 0, 0);
    ankle.add(put(rbox(0.3, 0.12, 0.46, 0.03), C.hullOld, 0, -0.07, 0.06));
    ankle.add(put(rbox(0.1, 0.09, 0.2, 0.02), C.dark, -0.09, -0.085, 0.36));
    ankle.add(put(rbox(0.1, 0.09, 0.2, 0.02), C.dark, 0.09, -0.085, 0.36));
    ankle.add(put(rbox(0.12, 0.09, 0.14, 0.02), C.dark, 0, -0.085, -0.22));
  };
  leg(-1, -0.72, 1.35, -0.63);
  leg(1, -0.5, 1.2, -0.7);
  // hull: a wide, headless turret body, listing to one side
  const hull = J(pelvis, 0, 0.3, 0.02, 0.16, 0.3, -0.07);
  hull.add(put(rbox(1.14, 0.72, 0.86, 0.14, 3), C.hullOld, 0, 0.38, 0));
  hull.add(put(rbox(0.9, 0.2, 0.7, 0.05), C.dark, 0, 0.0, 0));
  hull.add(put(tboxGeo(0.7, 0.2, 0.04, 2), tiled('hazard'), 0.1, 0.16, 0.432));
  hull.add(put(rbox(0.74, 0.16, 0.08, 0.03), C.dark, 0.0, 0.5, 0.41));
  hull.add(put(rbox(0.6, 0.06, 0.03, 0.012, 1), C.redEye, 0.0, 0.5, 0.455));
  hull.add(put(rbox(1.0, 0.1, 0.7, 0.03), C.dark, 0, 0.77, -0.03));
  // torn-off panel with exposed wiring
  hull.add(put(rbox(0.32, 0.3, 0.05, 0.01, 1), C.sole, -0.35, 0.28, 0.42));
  hull.add(strut(-0.46, 0.4, 0.45, -0.3, 0.2, 0.47, 0.012, C.copper, 4));
  hull.add(strut(-0.4, 0.42, 0.45, -0.24, 0.32, 0.5, 0.01, MAT.orange, 4));
  hull.add(strut(-0.26, 0.4, 0.45, -0.36, 0.1, 0.52, 0.01, C.screen, 4));
  hull.add(put(rbox(0.26, 0.22, 0.02, 0.008, 1), C.rust, -0.5, 0.08, 0.45, 0.25, 0.15, 0.9));
  hull.add(put(rbox(0.3, 0.5, 0.3, 0.04), C.rust, 0.42, 0.42, -0.36));
  hull.add(put(cylG(0.09, 0.09, 0.5, 8), C.dark, -0.25, 0.4, -0.46));
  // bent antenna + dead lamp
  hull.add(strut(0.38, 0.8, -0.2, 0.44, 1.2, -0.26, 0.012, C.dark, 4));
  hull.add(strut(0.44, 1.2, -0.26, 0.62, 1.34, -0.2, 0.01, C.dark, 4));
  hull.add(put(cylG(0.09, 0.07, 0.14, 10), C.dark, -0.34, 0.88, 0.2, 0.9, 0, 0));
  hull.add(put(cylG(0.06, 0.06, 0.02, 10), C.ember, -0.34, 0.925, 0.26, 0.9, 0, 0));
  // right arm: cutter emitter, raised
  const shR = J(hull, 0.66, 0.5, 0.0, -1.0, 0, 0.12);
  shR.add(put(rbox(0.24, 0.26, 0.28, 0.06), C.dark, 0, 0, 0));
  shR.add(put(rbox(0.16, 0.46, 0.18, 0.04), C.hullOld, 0.02, -0.3, 0));
  const elR = J(shR, 0.02, -0.56, 0, -0.5, 0, 0);
  elR.add(put(cylG(0.09, 0.09, 0.2, 10), MAT.grey, 0, 0, 0, 0, 0, Math.PI / 2));
  elR.add(put(rbox(0.15, 0.42, 0.17, 0.04), C.dark, 0, -0.24, 0));
  elR.add(put(cylG(0.045, 0.06, 0.3, 8), MAT.grey, 0, -0.58, 0));
  elR.add(put(cylG(0.03, 0.03, 0.04, 8), C.ember, 0, -0.74, 0));
  for (const a of [0, 2.1, 4.2]) elR.add(strut(Math.sin(a) * 0.07, -0.46, Math.cos(a) * 0.07, Math.sin(a) * 0.05, -0.72, Math.cos(a) * 0.05, 0.012, MAT.orange, 4));
  // left arm: hanging grabber with slack cables
  const shL = J(hull, -0.66, 0.5, 0.0, 0.1, 0, -0.1);
  shL.add(put(rbox(0.24, 0.26, 0.28, 0.06), C.dark, 0, 0, 0));
  shL.add(put(rbox(0.16, 0.5, 0.18, 0.04), C.hullOld, -0.02, -0.32, 0));
  shL.add(put(rbox(0.17, 0.08, 0.19, 0.02), MAT.orange, -0.02, -0.2, 0));
  const elL = J(shL, -0.02, -0.6, 0, -0.18, 0, 0.06);
  elL.add(put(cylG(0.09, 0.09, 0.2, 10), MAT.grey, 0, 0, 0, 0, 0, Math.PI / 2));
  elL.add(put(rbox(0.14, 0.46, 0.16, 0.04), C.dark, 0, -0.26, 0));
  for (const a of [0.3, 2.4, 4.5]) {
    elL.add(strut(Math.sin(a) * 0.05, -0.5, Math.cos(a) * 0.05, Math.sin(a) * 0.12, -0.68, Math.cos(a) * 0.12, 0.022, MAT.grey, 5));
    elL.add(strut(Math.sin(a) * 0.12, -0.68, Math.cos(a) * 0.12, Math.sin(a) * 0.05, -0.84, Math.cos(a) * 0.05, 0.018, MAT.grey, 5, 0.006));
  }
  shL.add(strut(0.06, -0.1, 0.1, 0.02, -0.5, 0.14, 0.01, C.copper, 4));
  shL.add(strut(0.02, -0.5, 0.14, 0.05, -0.74, 0.1, 0.01, C.copper, 4));
  const hr = halo(0xff3a20, 1.5, 0.55, 'visor'); hr.position.set(0.12, 2.06, 0.5); g.add(hr);
  g.userData = { height: 2.55 };
  return g;
}
