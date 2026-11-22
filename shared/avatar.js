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
  box(0.07, 0.07, 0.02, M.dark, -0.1, 1.6, 0.235); box(0.07, 0.07, 0.02, M.dark, 0.1, 1.6, 0.235);
  const hat = box(0.5, 0.15, 0.5, M.hat, 0, 1.86, 0), brim = box(0.66, 0.04, 0.66, M.hat, 0, 1.79, 0);
  const cape = box(0.48, 0.74, 0.04, M.cape, 0, 0.98, -0.17);
  // long hair (the colour of the hat: the top of the head is the hair), a skirt that flares over the legs, a ring of flowers
  const hair = new THREE.Group(); group.add(hair);
  box(0.52, 0.86, 0.09, M.hat, 0, 1.39, -0.26, hair);                                                       // down the back
  box(0.07, 0.72, 0.4, M.hat, -0.265, 1.46, -0.03, hair); box(0.07, 0.72, 0.4, M.hat, 0.265, 1.46, -0.03, hair);   // past the ears to the shoulders
  box(0.5, 0.09, 0.05, M.hat, 0, 1.755, 0.235, hair);                                                       // the fringe
  const skirt = new THREE.Group(); group.add(skirt);
  box(0.54, 0.16, 0.32, M.skirt, 0, 0.74, 0, skirt); box(0.62, 0.18, 0.38, M.skirt, 0, 0.58, 0, skirt); box(0.7, 0.16, 0.44, M.skirt, 0, 0.42, 0, skirt);
  const crown = new THREE.Group(); group.add(crown);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; box(0.11, 0.11, 0.11, i % 2 ? M.leaf : M.flower, Math.sin(a) * 0.27, 1.9, Math.cos(a) * 0.27, crown); }
  const armL = limb(-0.34, 1.32), armR = limb(0.34, 1.32), legL = limb(-0.13, 0.72), legR = limb(0.13, 0.72);
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
      hair.visible = !!c.long && !idOf(g.head);
      skirt.visible = !!c.skirt && !idOf(g.legs); if (c.skirt) M.skirt.color.set(c.skirt);
      crown.visible = !!c.flowers && !idOf(g.head); if (c.flowers) { M.flower.color.set(c.flowers); M.leaf.color.set('#5f9e4a'); }
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
  const flowers = c.flowers ? `<rect x="13" y="1" width="2" height="2" fill="${c.flowers}"/><rect x="19" y="0.500" width="2" height="2" fill="${c.flowers}"/><rect x="25" y="1" width="2" height="2" fill="${c.flowers}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 46" width="${size}" height="${size * 1.15}" shape-rendering="crispEdges">${cape}
    <rect x="13" y="2" width="14" height="5" fill="${c.hat}"/>${brim}<rect x="13" y="7" width="14" height="9" fill="${c.skin || '#e0b088'}"/><rect x="16" y="10" width="2" height="2" fill="#1b1b20"/><rect x="22" y="10" width="2" height="2" fill="#1b1b20"/>
    <rect x="12" y="16" width="16" height="14" fill="${c.shirt}"/><rect x="7" y="16" width="5" height="13" fill="${c.shirt}"/><rect x="28" y="16" width="5" height="13" fill="${c.shirt}"/>
    <rect x="13" y="30" width="6.500" height="11" fill="${c.pants}"/><rect x="20.500" y="30" width="6.500" height="11" fill="${c.pants}"/><rect x="12.500" y="41" width="7.500" height="3.500" fill="${c.shoes}"/><rect x="20" y="41" width="7.500" height="3.500" fill="${c.shoes}"/>${skirt}${long}${flowers}</svg>`;
}
