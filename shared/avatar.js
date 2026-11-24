// The blocky figure of a player: what you see of yourself from behind (V), what others see of you in a
// shared game, and the trader. Its colours are an outfit; worn armour shows over them.
//
//   const a = makeAvatar();  scene.add(a.group);
//   a.dress(outfit, gear);   a.place(x, y, z, yaw);   a.walk(time, speed);

import * as THREE from 'three';

const TINT = { 220: 0x7fe6f5, 211: 0x7fe6f5, 222: 0x7fe6f5, 223: 0x7fe6f5, 224: 0xf0bd3f, 225: 0xf0bd3f, 226: 0xf0bd3f, 227: 0xf0bd3f };

export function makeAvatar() {
  const group = new THREE.Group();
  const mat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const M = { skin: mat(), hat: mat(), shirt: mat(), pants: mat(), shoes: mat(), cape: mat(), skirt: mat(), flower: mat(), leaf: mat(), dark: new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.6 }) };
  const box = (w, h, d, m, x, y, z, parent = group) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); q.castShadow = false; q.frustumCulled = false; parent.add(q); return q; };
  const limb = (x, y) => { const g = new THREE.Group(); g.position.set(x, y, 0); group.add(g); return g; };
  // the figure faces +z; its feet stand on the origin; 1.8 tall
  box(0.5, 0.62, 0.27, M.shirt, 0, 1.03, 0);
  const head = box(0.46, 0.46, 0.46, M.skin, 0, 1.57, 0);
  const eyes = [box(0.07, 0.07, 0.02, M.dark, -0.1, 1.6, 0.235), box(0.07, 0.07, 0.02, M.dark, 0.1, 1.6, 0.235)];
  const hat = box(0.5, 0.15, 0.5, M.hat, 0, 1.86, 0), brim = box(0.66, 0.04, 0.66, M.hat, 0, 1.79, 0);
  const cape = box(0.48, 0.74, 0.04, M.cape, 0, 0.98, -0.17);
  // long hair (the colour of the hat: the top of the head is the hair), a skirt that flares over the legs, a ring of flowers
  const hair = new THREE.Group(); group.add(hair);
  box(0.52, 0.86, 0.09, M.hat, 0, 1.39, -0.26, hair);                                                       // down the back
  box(0.07, 0.72, 0.4, M.hat, -0.265, 1.46, -0.03, hair); box(0.07, 0.72, 0.4, M.hat, 0.265, 1.46, -0.03, hair);   // past the ears to the shoulders
  box(0.5, 0.09, 0.05, M.hat, 0, 1.755, 0.235, hair);                                                       // the fringe
  const skirt = new THREE.Group(); group.add(skirt);
  box(0.54, 0.16, 0.32, M.skirt, 0, 0.74, 0, skirt); box(0.62, 0.18, 0.38, M.skirt, 0, 0.58, 0, skirt); box(0.7, 0.16, 0.44, M.skirt, 0, 0.42, 0, skirt);
  // the parts of the space and adventure characters: a face (a screen with a heart, a visor, an alien's eyes, a gas mask,
  // a glass helmet), tentacles from the head, wings, a backpack, shoulder pads, glowing strips
  const glowMat = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.5 });
  const M2 = { screen: new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.4 }), heart: glowMat(0xff3048), visor: glowMat(0x5ff0ff), goggle: glowMat(0x5fe07a), mask: mat(), tent: mat(), wing: new THREE.MeshStandardMaterial({ color: 0xbff5d6, transparent: true, opacity: 0.45, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }), pack: mat(), pad: mat(), collar: new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.5, metalness: 0.3 }), strap: mat(), strip: glowMat(0x5ff0ff), glass: new THREE.MeshStandardMaterial({ color: 0xcfeefa, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false }) };
  const faces = {};
  faces.heart = new THREE.Group(); group.add(faces.heart);
  box(0.44, 0.4, 0.02, M2.screen, 0, 1.57, 0.236, faces.heart);
  for (const [x, y] of [[-2, 1], [-1, 2], [1, 2], [2, 1], [-2, 0], [2, 0], [-1, -1], [1, -1], [0, -2], [-1, 0], [0, 0], [1, 0], [0, -1], [0, 1], [-1, 1], [1, 1]]) box(0.06, 0.06, 0.02, M2.heart, x * 0.06, 1.57 + y * 0.06, 0.249, faces.heart);
  faces.visor = new THREE.Group(); group.add(faces.visor);
  box(0.48, 0.12, 0.03, M2.visor, 0, 1.6, 0.238, faces.visor);
  faces.alien = new THREE.Group(); group.add(faces.alien);
  for (const sx of [-1, 1]) { const e = box(0.13, 0.16, 0.02, M.dark, sx * 0.11, 1.6, 0.238, faces.alien); e.rotation.z = sx * 0.35; box(0.04, 0.04, 0.02, M2.visor, sx * 0.12, 1.63, 0.245, faces.alien); }
  faces.mask = new THREE.Group(); group.add(faces.mask);
  box(0.46, 0.2, 0.06, M2.mask, 0, 1.47, 0.25, faces.mask); box(0.16, 0.12, 0.12, M2.mask, 0, 1.44, 0.3, faces.mask);
  for (const sx of [-1, 1]) box(0.13, 0.13, 0.04, M2.goggle, sx * 0.11, 1.61, 0.25, faces.mask);
  faces.bubble = new THREE.Group(); group.add(faces.bubble);
  box(0.62, 0.62, 0.62, M2.glass, 0, 1.6, 0, faces.bubble); box(0.64, 0.08, 0.64, M2.collar, 0, 1.3, 0, faces.bubble);
  // more faces: a dark screen with two lit eyes, a band of goggles, a closed helmet with a visor, a machine's lit eyes
  faces.screen = new THREE.Group(); group.add(faces.screen);
  box(0.44, 0.4, 0.02, M2.screen, 0, 1.57, 0.236, faces.screen);
  for (const sx of [-1, 1]) box(0.12, 0.05, 0.02, M2.heart, sx * 0.1, 1.6, 0.249, faces.screen);
  box(0.2, 0.03, 0.02, M2.heart, 0, 1.48, 0.249, faces.screen);
  faces.goggles = new THREE.Group(); group.add(faces.goggles);
  box(0.5, 0.13, 0.08, M2.visor, 0, 1.61, 0.24, faces.goggles); box(0.52, 0.05, 0.5, M2.screen, 0, 1.61, 0, faces.goggles);
  faces.helm = new THREE.Group(); group.add(faces.helm);
  { const shell = new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.45, metalness: 0.15 }); M2.shell = shell;
    box(0.56, 0.12, 0.56, shell, 0, 1.86, 0, faces.helm); box(0.56, 0.56, 0.08, shell, 0, 1.6, -0.25, faces.helm);
    for (const sx of [-1, 1]) box(0.08, 0.56, 0.56, shell, sx * 0.25, 1.6, 0, faces.helm);
    box(0.56, 0.1, 0.56, shell, 0, 1.34, 0, faces.helm);
    M2.helmVisor = new THREE.MeshStandardMaterial({ color: 0x2a3440, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.3, depthWrite: false });
    box(0.44, 0.34, 0.02, M2.helmVisor, 0, 1.6, 0.28, faces.helm); }
  faces.bot = new THREE.Group(); group.add(faces.bot);
  for (const sx of [-1, 1]) box(0.09, 0.06, 0.02, M2.visor, sx * 0.1, 1.6, 0.238, faces.bot);
  const tentacles = new THREE.Group(); group.add(tentacles);
  for (const [x, z, h] of [[-0.18, -0.12, 0.5], [0.18, -0.12, 0.5], [-0.24, 0.05, 0.36], [0.24, 0.05, 0.36], [-0.12, 0.2, 0.34], [0, 0.22, 0.4], [0.12, 0.2, 0.34]]) { const t = box(0.07, h, 0.07, M2.tent, x, 1.38 - h / 2 + 0.06, z, tentacles); t.rotation.z = x * 0.6; }
  const wings = new THREE.Group(); group.add(wings);
  for (const sx of [-1, 1]) { const w = box(0.5, 0.7, 0.01, M2.wing, sx * 0.3, 1.25, -0.2, wings); w.rotation.y = sx * 0.5; w.rotation.z = sx * -0.25; }
  const pack = new THREE.Group(); group.add(pack);
  box(0.4, 0.5, 0.18, M2.pack, 0, 1.05, -0.22, pack); box(0.34, 0.14, 0.2, M2.pack, 0, 0.74, -0.23, pack); box(0.42, 0.1, 0.12, M2.strap, 0, 1.33, -0.24, pack);
  for (const sx of [-1, 1]) box(0.06, 0.56, 0.02, M2.strap, sx * 0.14, 1.06, 0.142, pack);                            // the straps over the chest
  const pads = new THREE.Group(); group.add(pads);
  for (const sx of [-1, 1]) box(0.26, 0.12, 0.3, M2.pad, sx * 0.34, 1.38, 0, pads);
  const strips = new THREE.Group(); group.add(strips);
  for (const sx of [-1, 1]) box(0.05, 0.32, 0.02, M2.strip, sx * 0.12, 1.06, 0.14, strips);                       // two lights down the chest
  // crystals on the shoulders, a hood, a long open coat, a glowing core in the chest
  const crystals = new THREE.Group(); group.add(crystals);
  M2.crystal = new THREE.MeshStandardMaterial({ color: 0xb06aff, emissive: 0xb06aff, emissiveIntensity: 0.5, transparent: true, opacity: 0.85, roughness: 0.2 });
  for (const sx of [-1, 1]) for (const [dx, h, r] of [[0, 0.34, 0.15], [0.09, 0.24, -0.25], [-0.08, 0.2, 0.35]]) { const c = box(0.08, h, 0.08, M2.crystal, sx * (0.36 + dx), 1.4 + h / 2, 0, crystals); c.rotation.z = sx * -r; c.rotation.y = 0.785; }
  const hood = new THREE.Group(); group.add(hood);
  M2.hood = mat();
  box(0.56, 0.1, 0.56, M2.hood, 0, 1.85, -0.01, hood); box(0.56, 0.58, 0.07, M2.hood, 0, 1.57, -0.26, hood);
  for (const sx of [-1, 1]) box(0.07, 0.58, 0.5, M2.hood, sx * 0.27, 1.57, -0.02, hood);
  const coat = new THREE.Group(); group.add(coat);
  M2.coat = mat();
  box(0.54, 0.7, 0.06, M2.coat, 0, 0.92, -0.16, coat);
  for (const sx of [-1, 1]) { box(0.06, 0.7, 0.3, M2.coat, sx * 0.27, 0.92, 0, coat); box(0.14, 0.7, 0.04, M2.coat, sx * 0.2, 0.92, 0.15, coat); box(0.2, 0.62, 0.22, M2.coat, sx * 0.34, 1.03, 0, coat); }
  const core = new THREE.Group(); group.add(core);
  M2.core = glowMat(0x5fd0ff);
  box(0.17, 0.17, 0.03, M2.core, 0, 1.12, 0.145, core).rotation.z = 0.785;                                   // a lit diamond in the chest
  for (const [x, y, z] of [[-0.5, 1.7, 0.1], [0.52, 1.5, -0.1], [0.45, 2.0, 0.15]]) box(0.12, 0.12, 0.12, M2.core, x, y, z, core);
  // what the character holds in the right hand, as in the owner's pictures
  const M3a = () => new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.6 });
  const held = {}, hand = new THREE.Group(); hand.position.set(0, -0.68, 0.06);              // joined to the right arm once the arms are made
  const H = (name) => { const g = new THREE.Group(); g.visible = false; hand.add(g); held[name] = g; return g; };
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9d2dc, roughness: 0.3, metalness: 0.6 }), grip = mat(), dark2 = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.5 });
  M2.heldGlow = glowMat(0x5ff0ff); M2.heldBody = mat();
  { const g = H('sword'); box(0.06, 0.12, 0.06, grip, 0, 0, 0.04, g); box(0.2, 0.04, 0.06, dark2, 0, 0.06, 0.04, g); box(0.05, 0.62, 0.1, M2.heldGlow, 0, 0.38, 0.04, g); g.rotation.x = 1.2; }
  { const g = H('blade'); box(0.06, 0.12, 0.06, dark2, 0, 0, 0.04, g); box(0.07, 0.42, 0.04, M2.heldGlow, 0, 0.27, 0.04, g); g.rotation.x = 1.2; }
  { const g = H('cannon'); box(0.16, 0.16, 0.62, M2.heldBody, 0, 0.02, 0.22, g); box(0.1, 0.1, 0.16, M2.heldGlow, 0, 0.02, 0.58, g); box(0.06, 0.16, 0.08, dark2, 0, -0.1, 0.02, g); box(0.18, 0.06, 0.3, dark2, 0, 0.12, 0.2, g); }
  { const g = H('book'); box(0.24, 0.3, 0.06, M2.heldBody, 0.02, 0.06, 0.12, g); box(0.2, 0.26, 0.02, M2.heldGlow, 0.02, 0.06, 0.155, g); g.rotation.x = -0.4; }
  { const g = H('tablet'); box(0.3, 0.2, 0.04, dark2, -0.1, 0.06, 0.14, g); box(0.24, 0.14, 0.01, M2.heldGlow, -0.1, 0.06, 0.162, g); g.rotation.x = -0.9; }
  { const g = H('jar'); box(0.16, 0.22, 0.16, M2.glass, 0, 0.08, 0.1, g); box(0.18, 0.04, 0.18, dark2, 0, 0.21, 0.1, g); box(0.04, 0.14, 0.04, M2.heldGlow, 0, 0.05, 0.1, g); box(0.1, 0.04, 0.04, M2.heldGlow, 0, 0.1, 0.1, g); }
  { const g = H('drill'); box(0.16, 0.16, 0.26, dark2, 0, 0, 0.1, g); box(0.12, 0.12, 0.16, steel, 0, 0, 0.3, g); box(0.07, 0.07, 0.14, steel, 0, 0, 0.44, g); box(0.03, 0.03, 0.1, steel, 0, 0, 0.55, g); }
  // more held things: a staff with a glowing tip, a lute, a spear
  { const g = H('staff'); box(0.05, 1.3, 0.05, grip, 0, 0.35, 0.08, g); box(0.12, 0.12, 0.12, M2.heldGlow, 0, 1.02, 0.08, g); g.rotation.x = 0.15; }
  { const g = H('lute'); box(0.26, 0.3, 0.08, M2.heldBody, -0.12, 0.05, 0.16, g); box(0.05, 0.36, 0.04, grip, -0.12, 0.36, 0.16, g); box(0.1, 0.1, 0.02, dark2, -0.12, 0.05, 0.205, g); g.rotation.z = 0.7; }
  { const g = H('bow'); const b1 = box(0.04, 0.5, 0.04, grip, 0, 0.3, 0.12, g); b1.rotation.x = 0.15; const b2 = box(0.04, 0.5, 0.04, grip, 0, -0.18, 0.12, g); b2.rotation.x = -0.15; box(0.01, 0.95, 0.01, M3a(), 0, 0.06, 0.05, g); }
  { const g = H('compass'); box(0.2, 0.2, 0.05, M2.heldBody, 0, 0.06, 0.14, g); box(0.15, 0.15, 0.01, M3a(), 0, 0.06, 0.168, g); box(0.02, 0.12, 0.01, M2.heldGlow, 0, 0.06, 0.176, g); box(0.05, 0.04, 0.04, M2.heldBody, 0, 0.18, 0.14, g); g.rotation.x = -0.7; }
  { const g = H('spear'); box(0.04, 1.4, 0.04, grip, 0, 0.4, 0.08, g); box(0.08, 0.2, 0.03, steel, 0, 1.16, 0.08, g); }
  // hats and heads of every kind (shape in c.hatShape, colour c.hat2 or the hat colour)
  const hats = {}, M3 = { a: mat(), b: mat(), gold: new THREE.MeshStandardMaterial({ color: 0xf0bd3f, roughness: 0.35, metalness: 0.6 }), white: mat(), horn: mat(), leaf: mat(), beard: mat(), ear: mat(), cloth: mat() };
  const HG = (n) => { const g = new THREE.Group(); g.visible = false; group.add(g); hats[n] = g; return g; };
  { const g = HG('wizard'); box(0.7, 0.05, 0.7, M3.a, 0, 1.82, 0, g); box(0.42, 0.18, 0.42, M3.a, 0, 1.93, 0, g); box(0.3, 0.18, 0.3, M3.a, 0.02, 2.1, -0.02, g); box(0.18, 0.16, 0.18, M3.a, 0.05, 2.26, -0.05, g); box(0.08, 0.12, 0.08, M3.a, 0.09, 2.38, -0.08, g); box(0.44, 0.05, 0.44, M3.b, 0, 1.86, 0, g); }
  { const g = HG('witch'); box(0.8, 0.04, 0.8, M3.a, 0, 1.82, 0, g); box(0.38, 0.2, 0.38, M3.a, 0, 1.94, 0, g); box(0.24, 0.2, 0.24, M3.a, -0.03, 2.13, 0.03, g); box(0.1, 0.16, 0.1, M3.a, -0.08, 2.3, 0.08, g); box(0.4, 0.05, 0.4, M3.gold, 0, 1.86, 0, g); }
  { const g = HG('viking'); box(0.52, 0.18, 0.52, M3.a, 0, 1.86, 0, g); box(0.08, 0.2, 0.52, M3.b, 0, 1.86, 0, g); for (const sx of [-1, 1]) { const hh = box(0.08, 0.26, 0.08, M3.horn, sx * 0.34, 1.98, 0, g); hh.rotation.z = sx * -0.5; } box(0.06, 0.2, 0.04, M3.a, 0, 1.68, 0.25, g); }
  { const g = HG('crown'); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(0.1, i % 2 ? 0.16 : 0.1, 0.1, M3.gold, Math.sin(a) * 0.24, 1.86 + (i % 2 ? 0.03 : 0), Math.cos(a) * 0.24, g); } box(0.06, 0.06, 0.02, new THREE.MeshStandardMaterial({ color: 0xe0344a, emissive: 0x6a0a14, emissiveIntensity: 0.6 }), 0, 1.88, 0.27, g); }
  { const g = HG('nemes'); box(0.54, 0.14, 0.54, M3.a, 0, 1.86, 0, g); for (const sx of [-1, 1]) box(0.08, 0.66, 0.3, M3.a, sx * 0.29, 1.5, 0.04, g); box(0.5, 0.5, 0.08, M3.a, 0, 1.5, -0.27, g); for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) box(0.09, 0.04, 0.31, M3.b, sx * 0.29, 1.72 - i * 0.14, 0.04, g); box(0.08, 0.1, 0.05, M3.gold, 0, 1.84, 0.27, g); }
  { const g = HG('crest'); box(0.54, 0.16, 0.54, M3.a, 0, 1.86, 0, g); box(0.08, 0.22, 0.56, M3.b, 0, 2.02, -0.02, g); for (const sx of [-1, 1]) box(0.06, 0.3, 0.2, M3.a, sx * 0.27, 1.66, 0.12, g); }
  { const g = HG('mushroom'); box(0.9, 0.3, 0.9, M3.a, 0, 2.0, 0, g); box(0.7, 0.12, 0.7, M3.a, 0, 2.2, 0, g); for (const [x, z] of [[0.3, 0.3], [-0.32, 0.1], [0.05, -0.34], [-0.15, 0.36], [0.36, -0.2]]) box(0.14, 0.04, 0.14, M3.white, x, 2.27, z, g); box(0.92, 0.04, 0.92, M3.b, 0, 1.84, 0, g); }
  { const g = HG('phones'); box(0.54, 0.06, 0.12, M3.a, 0, 1.84, 0, g); for (const sx of [-1, 1]) box(0.08, 0.2, 0.18, M3.b, sx * 0.27, 1.6, 0, g); }
  { const g = HG('leaves'); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = 0.22 + (i % 3) * 0.06; box(0.14, 0.14, 0.14, M3.leaf, Math.sin(a) * r, 1.86 + (i % 2) * 0.1, Math.cos(a) * r, g); } box(0.36, 0.16, 0.36, M3.leaf, 0, 2.0, 0, g); }
  { const g = HG('diver'); const brass = new THREE.MeshStandardMaterial({ color: 0xc9903a, roughness: 0.35, metalness: 0.7 }); box(0.62, 0.62, 0.62, brass, 0, 1.6, 0, g); box(0.34, 0.34, 0.03, new THREE.MeshStandardMaterial({ color: 0x5fb0e8, transparent: true, opacity: 0.55, roughness: 0.1 }), 0, 1.6, 0.315, g); for (const sx of [-1, 1]) box(0.03, 0.2, 0.2, M3.a, sx * 0.32, 1.6, 0, g); box(0.7, 0.1, 0.7, brass, 0, 1.28, 0, g); }
  { const g = HG('ninja'); box(0.5, 0.2, 0.5, M3.a, 0, 1.47, 0, g); box(0.5, 0.18, 0.5, M3.a, 0, 1.75, 0, g); box(0.1, 0.3, 0.06, M3.b, 0.12, 1.7, -0.27, g); }
  const beard = new THREE.Group(); group.add(beard); box(0.42, 0.2, 0.06, M3.beard, 0, 1.4, 0.25, beard); box(0.3, 0.18, 0.06, M3.beard, 0, 1.24, 0.25, beard); box(0.16, 0.12, 0.05, M3.beard, 0, 1.11, 0.25, beard);
  const ears = new THREE.Group(); group.add(ears); for (const sx of [-1, 1]) { const e = box(0.06, 0.18, 0.08, M3.ear, sx * 0.27, 1.62, -0.02, ears); e.rotation.z = sx * -0.6; }
  const robe = new THREE.Group(); group.add(robe); box(0.62, 0.72, 0.4, M3.cloth, 0, 0.42, 0, robe); box(0.66, 0.1, 0.44, M3.b, 0, 0.1, 0, robe);
  const sash = new THREE.Group(); group.add(sash); { const sb = box(0.08, 0.8, 0.02, M3.white, 0, 1.03, 0.14, sash); sb.rotation.z = 0.6; }
  const crown = new THREE.Group(); group.add(crown);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; box(0.11, 0.11, 0.11, i % 2 ? M.leaf : M.flower, Math.sin(a) * 0.27, 1.9, Math.cos(a) * 0.27, crown); }
  const armL = limb(-0.34, 1.32), armR = limb(0.34, 1.32), legL = limb(-0.13, 0.72), legR = limb(0.13, 0.72);
  armR.add(hand);
  const sleeves = [box(0.18, 0.62, 0.2, M.shirt, 0, -0.29, 0, armL), box(0.18, 0.62, 0.2, M.shirt, 0, -0.29, 0, armR)];
  box(0.18, 0.14, 0.2, M.skin, 0, -0.66, 0, armL); box(0.18, 0.14, 0.2, M.skin, 0, -0.66, 0, armR);
  const legs = [box(0.23, 0.56, 0.25, M.pants, 0, -0.28, 0, legL), box(0.23, 0.56, 0.25, M.pants, 0, -0.28, 0, legR)];
  const feet = [box(0.24, 0.16, 0.3, M.shoes, 0, -0.64, 0.02, legL), box(0.24, 0.16, 0.3, M.shoes, 0, -0.64, 0.02, legR)];
  let key = '';
  return {
    group, head,
    /** outfit: { hat, skin, shirt, pants, shoes, cape?, brim? } (colours); gear: { head, chest, legs, feet } items or ids. */
    dress(outfit, gear) {
      const idOf = (g) => (g && typeof g === 'object' ? g.id : g) || 0, g = gear || {};
      const k = JSON.stringify([outfit, idOf(g.head), idOf(g.chest), idOf(g.legs), idOf(g.feet)]);
      if (k === key) return;
      key = k;
      const c = outfit || {};
      M.skin.color.set(c.skin || '#e0b088'); M.hat.color.set(TINT[idOf(g.head)] || c.hat || '#3a3f4a'); M.shirt.color.set(TINT[idOf(g.chest)] || c.shirt || '#3f7ab8');
      M.pants.color.set(TINT[idOf(g.legs)] || c.pants || '#3a4152'); M.shoes.color.set(TINT[idOf(g.feet)] || c.shoes || '#2a2c33');
      cape.visible = !!c.cape; if (c.cape) M.cape.color.set(c.cape);
      hair.visible = !!c.long && !idOf(g.head) && c.hatShape !== 'nemes' && c.hatShape !== 'diver' && c.hatShape !== 'ninja';
      for (const [k, h] of Object.entries(hats)) h.visible = c.hatShape === k && !idOf(g.head);
      if (c.hatShape) { M3.a.color.set(c.hat2 || c.hat || '#3a3f4a'); M3.b.color.set(c.hat3 || '#d8d2c0'); M3.horn.color.set('#e8e0cc'); M3.white.color.set('#f4f4f0'); M3.leaf.color.set(c.hat2 || '#3f8a3f'); }
      hat.visible = !(c.hatShape === 'mushroom' || c.hatShape === 'diver'); brim.visible = brim.visible && !c.hatShape;
      beard.visible = !!c.beard; if (c.beard) M3.beard.color.set(c.beard);
      ears.visible = !!c.ears; M3.ear.color.set(c.skin || '#e0b088');
      robe.visible = !!c.robe; if (c.robe) { M3.cloth.color.set(c.robe); M3.b.color.set(c.hat3 || '#d8b04a'); }
      sash.visible = !!c.sash; if (c.sash) M3.white.color.set(c.sash);
      for (const l of legs) l.visible = !c.robe; for (const f of feet) f.visible = !c.robe;
      skirt.visible = !!c.skirt && !idOf(g.legs); if (c.skirt) M.skirt.color.set(c.skirt);
      crown.visible = !!c.flowers && !idOf(g.head); if (c.flowers) { M.flower.color.set(c.flowers); M.leaf.color.set('#5f9e4a'); }
      for (const [k, f] of Object.entries(faces)) f.visible = c.face === k && !(k !== 'bubble' && idOf(g.head) && k === 'visor');
      for (const e of eyes) e.visible = !c.face || c.face === 'bubble' || (c.face === 'helm' && !c.visor);
      if (c.face === 'screen' || c.face === 'heart') { const col = c.face === 'screen' && c.glow ? c.glow : '#ff3048'; M2.heart.color.set(col); M2.heart.emissive.set(col); }
      if (c.face === 'goggles' || c.face === 'bot') { const col = c.glow || '#5ff0ff'; M2.visor.color.set(col); M2.visor.emissive.set(col); }
      if (c.face === 'helm') { M2.shell.color.set(c.helm || '#f1f1ee'); M2.helmVisor.color.set(c.visor || '#cfeefa'); M2.helmVisor.opacity = c.visor ? 0.92 : 0.3; }
      for (const [k, h] of Object.entries(held)) h.visible = c.holds === k;
      if (c.holds) { const gc = c.heldGlow || '#5ff0ff'; M2.heldGlow.color.set(gc); M2.heldGlow.emissive.set(gc); M2.heldBody.color.set(c.heldCol || '#5a6068'); grip.color.set('#3a2a1c'); }
      crystals.visible = !!c.crystals; if (c.crystals) { M2.crystal.color.set(c.crystals); M2.crystal.emissive.set(c.crystals); }
      hood.visible = !!c.hood && !idOf(g.head); if (c.hood) M2.hood.color.set(c.hood);
      coat.visible = !!c.coat && !idOf(g.chest); if (c.coat) M2.coat.color.set(c.coat);
      core.visible = !!c.core; if (c.core) { M2.core.color.set(c.core); M2.core.emissive.set(c.core); }
      // a figure made of light: every part glows and lets the world show through
      for (const m of [M.skin, M.hat, M.shirt, M.pants, M.shoes]) { m.transparent = !!c.ghost; m.opacity = c.ghost ? 0.62 : 1; m.emissive = m.emissive || new THREE.Color(0); m.emissive.set(c.ghost ? c.ghost : '#000000'); m.emissiveIntensity = c.ghost ? 0.55 : 0; m.depthWrite = !c.ghost; m.needsUpdate = true; }
      if (c.face === 'visor' && c.glow) M2.visor.color.set(c.glow), M2.visor.emissive.set(c.glow);
      if (c.face === 'mask') M2.mask.color.set(c.maskCol || '#3b3f2c');
      tentacles.visible = !!c.tentacles; if (c.tentacles) M2.tent.color.set(c.tentacles);
      wings.visible = !!c.wings; if (c.wings) M2.wing.color.set(c.wings);
      pack.visible = !!c.pack; if (c.pack) M2.pack.color.set(c.pack);
      pads.visible = !!c.pads; if (c.pads) M2.pad.color.set(c.pads); else if (c.face === 'bubble') M2.pad.color.set('#d8dde4');
      M2.strap.color.set('#4a3424');
      strips.visible = !c.core && (!!c.glow && c.face !== 'visor' || (!!c.glow && !!c.pads)); if (c.glow) { M2.strip.color.set(c.glow); M2.strip.emissive.set(c.glow); }
      brim.visible = !!c.brim && !idOf(g.head);
      for (const m of [M.hat, M.shirt, M.pants, M.shoes]) { m.metalness = 0; m.roughness = 0.85; }
      for (const [id, m] of [[idOf(g.head), M.hat], [idOf(g.chest), M.shirt], [idOf(g.legs), M.pants], [idOf(g.feet), M.shoes]]) if (TINT[id]) { m.metalness = 0.5; m.roughness = 0.35; }
      void sleeves; void legs; void feet; void hat;
    },
    /** Feet at (x, y, z); yaw as the controller has it (0 looks along -z). */
    place(x, y, z, yaw) { group.position.set(x, y, z); group.rotation.y = yaw + Math.PI; },
    /** Swing arms and legs: t in seconds, speed in blocks per second (0 stands still). */
    walk(t, speed) { const a = Math.sin(t * 9) * Math.min(1, speed / 3) * 0.7; armL.rotation.x = a; armR.rotation.x = -a; legL.rotation.x = -a; legR.rotation.x = a; },
    nod(pitch) { head.rotation.x = -pitch * 0.6; },
  };
}

/** A small front view of an outfit for the menus (SVG markup). */
export function outfitPicture(c, size = 44) {
  const cape = c.cape ? `<rect x="9" y="15" width="22" height="20" fill="${c.cape}"/>` : '';
  const brim = c.brim ? `<rect x="9" y="6.500" width="22" height="2" fill="${c.hat}"/>` : '';
  const long = c.long ? `<rect x="11" y="4" width="2" height="16" fill="${c.hat}"/><rect x="27" y="4" width="2" height="16" fill="${c.hat}"/>` : '';
  const skirt = c.skirt ? `<rect x="11" y="28" width="18" height="4" fill="${c.skirt}"/><rect x="10" y="32" width="20" height="5" fill="${c.skirt}"/>` : '';
  const face = c.face === 'heart' ? '<rect x="13" y="7" width="14" height="9" fill="#15171c"/><rect x="16" y="9" width="3" height="3" fill="#ff3048"/><rect x="21" y="9" width="3" height="3" fill="#ff3048"/><rect x="17" y="11" width="6" height="3" fill="#ff3048"/>'
    : c.face === 'visor' ? `<rect x="13" y="9.500" width="14" height="3" fill="${c.glow || '#5ff0ff'}"/>`
    : c.face === 'alien' ? '<rect x="15" y="9" width="4" height="4" fill="#1b1b20"/><rect x="21" y="9" width="4" height="4" fill="#1b1b20"/>'
    : c.face === 'mask' ? `<rect x="13" y="12" width="14" height="4" fill="${c.maskCol || '#3b3f2c'}"/><rect x="15" y="9" width="4" height="3" fill="#5fe07a"/><rect x="21" y="9" width="4" height="3" fill="#5fe07a"/>`
    : c.face === 'screen' ? `<rect x="13" y="7" width="14" height="9" fill="#15171c"/><rect x="15" y="10" width="4" height="1.500" fill="${c.glow || '#ff3048'}"/><rect x="21" y="10" width="4" height="1.500" fill="${c.glow || '#ff3048'}"/>`
    : c.face === 'goggles' ? `<rect x="12" y="9" width="16" height="3.500" fill="${c.glow || '#5ff0ff'}"/>`
    : c.face === 'helm' ? `<rect x="11" y="1" width="18" height="17" fill="${c.helm || '#f1f1ee'}"/><rect x="14" y="5" width="12" height="9" fill="${c.visor || '#e0b088'}"/>${c.visor ? '' : '<rect x="16" y="9" width="2" height="2" fill="#1b1b20"/><rect x="22" y="9" width="2" height="2" fill="#1b1b20"/>'}`
    : c.face === 'bot' ? `<rect x="15" y="10" width="3" height="2" fill="${c.glow || '#5ff0ff'}"/><rect x="22" y="10" width="3" height="2" fill="${c.glow || '#5ff0ff'}"/>`
    : c.face === 'bubble' ? '<rect x="11" y="1" width="18" height="17" fill="#cfeefa" fill-opacity=".35" stroke="#eaf8ff" stroke-width=".8"/>' : '';
  const extra = (c.tentacles ? `<rect x="12" y="15" width="2" height="7" fill="${c.tentacles}"/><rect x="26" y="15" width="2" height="7" fill="${c.tentacles}"/>` : '')
    + (c.pads ? `<rect x="6" y="15" width="7" height="3" fill="${c.pads}"/><rect x="27" y="15" width="7" height="3" fill="${c.pads}"/>` : '')
    + (c.crystals ? `<rect x="6" y="11" width="3" height="5" fill="${c.crystals}"/><rect x="31" y="11" width="3" height="5" fill="${c.crystals}"/>` : '')
    + (c.coat ? `<rect x="10" y="16" width="4" height="20" fill="${c.coat}"/><rect x="26" y="16" width="4" height="20" fill="${c.coat}"/>` : '')
    + (c.core ? `<rect x="18" y="20" width="4" height="4" fill="${c.core}"/>` : '')
    + (c.hood ? `<rect x="11" y="1" width="2" height="16" fill="${c.hood}"/><rect x="27" y="1" width="2" height="16" fill="${c.hood}"/><rect x="11" y="1" width="18" height="2" fill="${c.hood}"/>` : '')
    + (c.glow && c.face !== 'visor' ? `<rect x="19" y="17" width="2" height="11" fill="${c.glow}"/>` : '');
  const wingsSvg = c.wings ? `<rect x="2" y="13" width="9" height="14" fill="${c.wings}" fill-opacity=".5"/><rect x="29" y="13" width="9" height="14" fill="${c.wings}" fill-opacity=".5"/>` : '';
  const packSvg = c.pack ? `<rect x="10" y="17" width="2" height="12" fill="${c.pack}"/><rect x="28" y="17" width="2" height="12" fill="${c.pack}"/>` : '';
  const flowers = c.flowers ? `<rect x="13" y="1" width="2" height="2" fill="${c.flowers}"/><rect x="19" y="0.500" width="2" height="2" fill="${c.flowers}"/><rect x="25" y="1" width="2" height="2" fill="${c.flowers}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 46" width="${size}" height="${size * 1.15}" shape-rendering="crispEdges">${wingsSvg}${cape}
    <rect x="13" y="2" width="14" height="5" fill="${c.hat}"/>${brim}<rect x="13" y="7" width="14" height="9" fill="${c.skin || '#e0b088'}"/><rect x="16" y="10" width="2" height="2" fill="#1b1b20"/><rect x="22" y="10" width="2" height="2" fill="#1b1b20"/>
    <rect x="12" y="16" width="16" height="14" fill="${c.shirt}"/><rect x="7" y="16" width="5" height="13" fill="${c.shirt}"/><rect x="28" y="16" width="5" height="13" fill="${c.shirt}"/>
    <rect x="13" y="30" width="6.500" height="11" fill="${c.pants}"/><rect x="20.500" y="30" width="6.500" height="11" fill="${c.pants}"/><rect x="12.500" y="41" width="7.500" height="3.500" fill="${c.shoes}"/><rect x="20" y="41" width="7.500" height="3.500" fill="${c.shoes}"/>${skirt}${long}${flowers}${face}${extra}${packSvg}</svg>`;
}
