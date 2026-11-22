// Friendly creatures, each with a job:
//   ثعلب الكريستال   comes to the player and trots ahead to the day's treasure (every world)
//   التنين الصغير    hatches from an egg, follows the player for good, and carries 27 places of things
//   سلحفاة الرمال    walks to the hidden oasis (the desert world)
//   غزال الظلال      stands at the edge of the light on dark nights, and is gone if you come close (the dark world)
// None of them fights or is hunted. They are this player's own: in a shared game each player has theirs.
//
//   createFriends({ play, kit, adv, world, groundAt, openStore })      (the adventure's page and the bag use it)

import * as THREE from 'three';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
function boxes(parts) {
  const g = new THREE.Group();
  for (const [w, h, d, x, y, z, m, rx = 0, rz = 0] of parts) { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); q.rotation.set(rx, 0, rz); q.castShadow = false; q.frustumCulled = false; g.add(q); }
  return g;
}
// every model faces +z and stands on its origin
function makeFox() {
  const fur = M(0xe8862e), white = M(0xf4efe6), dark = M(0x2a211b), ice = M(0x7fe6f5, { emissive: 0x2fb6d0, emissiveIntensity: 0.9, roughness: 0.3 });
  return boxes([[0.34, 0.3, 0.72, 0, 0.42, 0, fur], [0.3, 0.12, 0.6, 0, 0.3, 0, white], [0.3, 0.28, 0.3, 0, 0.56, 0.46, fur], [0.16, 0.12, 0.18, 0, 0.5, 0.66, white], [0.06, 0.05, 0.04, 0, 0.53, 0.76, dark],
    [0.08, 0.16, 0.06, -0.1, 0.78, 0.44, ice], [0.08, 0.16, 0.06, 0.1, 0.78, 0.44, ice], [0.18, 0.18, 0.46, 0, 0.5, -0.56, fur, -0.5], [0.16, 0.16, 0.18, 0, 0.66, -0.78, ice],
    ...[[-0.11, 0.26], [0.11, 0.26], [-0.11, -0.26], [0.11, -0.26]].map(([x, z]) => [0.09, 0.3, 0.09, x, 0.15, z, dark])]);
}
function makeDragon() {
  const skin = M(0x4fae6a), belly = M(0xe9d98a), wing = M(0x7747bb, { side: THREE.DoubleSide }), horn = M(0xf4efe6), eye = M(0xffd76a, { emissive: 0xffb300, emissiveIntensity: 1 });
  const g = boxes([[0.36, 0.34, 0.6, 0, 0.3, 0, skin], [0.3, 0.1, 0.5, 0, 0.14, 0, belly], [0.3, 0.28, 0.32, 0, 0.56, 0.36, skin], [0.2, 0.14, 0.2, 0, 0.5, 0.58, skin], [0.05, 0.14, 0.05, -0.1, 0.76, 0.3, horn], [0.05, 0.14, 0.05, 0.1, 0.76, 0.3, horn],
    [0.06, 0.06, 0.03, -0.09, 0.6, 0.53, eye], [0.06, 0.06, 0.03, 0.09, 0.6, 0.53, eye], [0.14, 0.14, 0.5, 0, 0.3, -0.5, skin, 0.3], [0.1, 0.12, 0.12, 0, 0.2, -0.78, horn]]);
  const wl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.38), wing), wr = wl.clone();
  wl.position.set(-0.42, 0.5, -0.04); wr.position.set(0.42, 0.5, -0.04); g.add(wl, wr);
  g.userData.wings = [wl, wr];
  return g;
}
function makeTurtle() {
  const shell = M(0x8a6a3a), plate = M(0xc9a35a), skin = M(0x7d8a4a), dark = M(0x2a211b);
  return boxes([[0.7, 0.2, 0.86, 0, 0.3, 0, shell], [0.52, 0.16, 0.66, 0, 0.47, 0, plate], [0.32, 0.1, 0.42, 0, 0.6, 0, shell], [0.24, 0.2, 0.26, 0, 0.3, 0.54, skin], [0.05, 0.05, 0.03, -0.07, 0.34, 0.68, dark], [0.05, 0.05, 0.03, 0.07, 0.34, 0.68, dark],
    ...[[-0.36, 0.28], [0.36, 0.28], [-0.36, -0.28], [0.36, -0.28]].map(([x, z]) => [0.18, 0.16, 0.2, x, 0.1, z, skin]), [0.08, 0.08, 0.2, 0, 0.24, -0.5, skin]]);
}
function makeDeer() {
  const coat = M(0x1b1e2a), pale = M(0x3a4058), eye = M(0x9fe8ff, { emissive: 0x7fd8ff, emissiveIntensity: 2.2 }), horn = M(0xbfc6d8, { emissive: 0x4a5a80, emissiveIntensity: 0.6 });
  return boxes([[0.4, 0.44, 1.0, 0, 1.0, 0, coat], [0.34, 0.14, 0.86, 0, 0.74, 0, pale], [0.22, 0.5, 0.24, 0, 1.36, 0.5, coat, -0.45], [0.22, 0.24, 0.36, 0, 1.62, 0.72, coat], [0.05, 0.05, 0.03, -0.08, 1.67, 0.9, eye], [0.05, 0.05, 0.03, 0.08, 1.67, 0.9, eye],
    [0.05, 0.4, 0.05, -0.1, 1.94, 0.62, horn, 0.3, 0.25], [0.05, 0.4, 0.05, 0.1, 1.94, 0.62, horn, 0.3, -0.25], [0.04, 0.2, 0.04, -0.22, 2.08, 0.6, horn, 0, 0.9], [0.04, 0.2, 0.04, 0.22, 2.08, 0.6, horn, 0, -0.9],
    ...[[-0.14, 0.38], [0.14, 0.38], [-0.14, -0.38], [0.14, -0.38]].map(([x, z]) => [0.1, 0.8, 0.1, x, 0.4, z, coat])]);
}

export function createFriends({ play, kit, adv, world, groundAt, openStore }) {
  const st = play.state, w = kit.world, scene = kit.scene;
  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:20;pointer-events:none;direction:rtl;padding:5px 12px;border-radius:8px;background:rgba(8,11,16,.82);border:1px solid rgba(255,255,255,.28);color:#f1f4f8;font:700 13px/1.4 system-ui,sans-serif;white-space:nowrap;';
  tag.hidden = true; document.body.appendChild(tag);
  const spot = (cx, cz, d0, d1) => { for (let i = 0; i < 24; i++) { const a = Math.random() * 6.283, d = d0 + Math.random() * (d1 - d0), x = Math.floor(cx + Math.sin(a) * d), z = Math.floor(cz + Math.cos(a) * d), y = groundAt(x, z); if (y !== null && Math.abs(y - st.pos.y) < 8) return { x: x + 0.5, y, z: z + 0.5 }; } return null; };
  function make(model) { const o = model(); o.visible = false; scene.add(o); return { o, x: 0, y: 0, z: 0, yaw: 0, t: 0, on: false, moving: false }; }
  function show(e, p) { e.x = p.x; e.y = p.y; e.z = p.z; e.on = true; e.o.visible = true; }
  function hide(e) { e.on = false; e.o.visible = false; }
  /** One step toward (tx, tz) over the ground; false when the way is shut. */
  function step(e, tx, tz, speed, dt) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    e.moving = false;
    if (d < 0.05) return true;
    const nx = e.x + dx / d * speed * dt, nz = e.z + dz / d * speed * dt, g = groundAt(Math.floor(nx), Math.floor(nz));
    e.yaw += (((Math.atan2(dx, dz) - e.yaw + 9.4248) % 6.2832) - 3.1416) * Math.min(1, 8 * dt);
    if (g === null || g - e.y > 1.6) { const a = Math.atan2(dx, dz) + (e.side || (e.side = Math.random() < 0.5 ? 1.2 : -1.2)), sx = e.x + Math.sin(a) * speed * dt, sz = e.z + Math.cos(a) * speed * dt, g2 = groundAt(Math.floor(sx), Math.floor(sz)); if (g2 !== null && g2 - e.y <= 1.6) { e.x = sx; e.z = sz; e.y += (g2 - e.y) * Math.min(1, 10 * dt); e.moving = true; } return false; }
    e.x = nx; e.z = nz; e.y += (g - e.y) * Math.min(1, 10 * dt); e.moving = true; e.side = 0;
    return true;
  }
  const pose = (e, lift = 0) => { e.o.position.set(e.x, e.y + lift + (e.moving ? Math.abs(Math.sin(e.t * 9)) * 0.06 : 0), e.z); e.o.rotation.y = e.yaw; };
  const dist = (e) => Math.hypot(e.x - st.pos.x, e.z - st.pos.z);
  const face = (e, dt) => { e.yaw += (((Math.atan2(st.pos.x - e.x, st.pos.z - e.z) - e.yaw + 9.4248) % 6.2832) - 3.1416) * Math.min(1, 6 * dt); };

  // ---- a guide: comes near, then leads to a place, waiting when the player falls behind
  function guide(model, name, goal, speed) {
    const e = make(model); let wait = 6, told = false, arrived = false;
    return {
      e, name, goal,
      get arrived() { return arrived; },
      tick(dt) {
        const g = goal();
        if (!g) { if (e.on) hide(e); return; }
        if (!e.on) { if ((wait -= dt) > 0) return; const p = spot(st.pos.x, st.pos.z, 7, 12); if (!p) { wait = 4; return; } show(e, p); told = false; arrived = false; }
        e.t += dt;
        const d = dist(e), left = Math.hypot(g.x - e.x, g.z - e.z);
        if (d > 70) { hide(e); wait = 8; return; }
        if (left < 2.2) { arrived = true; e.moving = false; face(e, dt); }
        else if (d < 9) { if (!told) { told = true; play.notice(name + ' يدلّك. الحقه!', false, 4000); if (play.sound) play.sound.ui(); } step(e, g.x, g.z, d < 3 ? speed * 1.5 : speed, dt); }
        else { e.moving = false; face(e, dt); }       // too far behind: it waits, looking back
        pose(e);
      },
    };
  }
  const fox = guide(makeFox, 'ثعلب الكريستال', () => (adv.treasure && !adv.foundToday ? { x: adv.treasure.x + 0.5, z: adv.treasure.z + 1.6 } : null), 3.4);
  // ---- the hidden oasis of the desert, and the turtle that knows the way
  let oasis = null;
  if (world === 'waha') {
    const r = adv.rngFor('oasis');
    for (let i = 0; i < 300 && !oasis; i++) {
      const x = 14 + Math.floor(r() * (w.sx - 28)), z = 14 + Math.floor(r() * (w.sz - 28)), y = groundAt(x, z);
      if (y === null || Math.hypot(x - st.pos.x, z - st.pos.z) < 45) continue;
      let flat = true; for (let dx = -2; dx <= 2 && flat; dx++) for (let dz = -2; dz <= 2 && flat; dz++) if (groundAt(x + dx, z + dz) !== y) flat = false;
      if (flat) oasis = { x, y, z };
    }
    if (oasis) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) kit.setBlock(oasis.x + dx, oasis.y - 1, oasis.z + dz, 150);      // a pool three by three, set into the sand
      for (const [dx, dz, h] of [[-2, -2, 3], [2, -2, 2], [-2, 2, 2]]) { for (let k = 0; k < h; k++) kit.setBlock(oasis.x + dx, oasis.y + k, oasis.z + dz, 114); kit.setBlock(oasis.x + dx, oasis.y + h, oasis.z + dz, 108); }      // palms of a sort: a brown trunk, a green crown
      kit.setBlock(oasis.x + 2, oasis.y, oasis.z + 2, 170);
      const c = kit.chestAt(oasis.x + 2, oasis.y, oasis.z + 2); c[0] = adv.item(231, 2); c[1] = adv.item(140, 3); c[2] = adv.item(200, 4);
    }
  }
  const turtle = world === 'waha' ? guide(makeTurtle, 'سلحفاة الرمال', () => (oasis && !st.oasisFound ? { x: oasis.x + 0.5, z: oasis.z + 2.6 } : null), 1.7) : null;
  // ---- the shadow deer: only at night, only in the dark world, never near
  const deer = world === 'dhalam' ? make(makeDeer) : null;
  let deerWait = 5, deerSeen = 0;
  // ---- the little dragon
  const dragon = make(makeDragon);
  let dNear = false;
  function hatch() { st.pet = true; const p = spot(st.pos.x, st.pos.z, 2, 3) || { x: st.pos.x + 1, y: st.pos.y, z: st.pos.z }; show(dragon, p); play.notice('فقست البيضة! التنين الصغير بيلحقك ويشيل أغراضك: وجّه عليه واضغط زر البناء.', false, 6000); if (play.sound && play.sound.level) play.sound.level(); }
  play.onUseFirst(() => {
    const s = st.slots[st.sel];
    if (dNear) return openStore(st.petBag, 'شنطة التنين');
    if (s && s.use === 'egg') { if (st.pet) { play.notice('عندك تنين.', false, 2000); return true; } s.n = (s.n || 1) - 1; if (!(s.n > 0)) play.setSlot(st.sel, adv.empty); hatch(); play.changed(); return true; }
    return false;
  });

  play.onTick((s, dt) => {
    fox.tick(dt);
    if (turtle) { turtle.tick(dt); if (oasis && !st.oasisFound && Math.hypot(st.pos.x - oasis.x, st.pos.z - oasis.z) < 4) st.oasisFound = 1; }
    if (deer) {
      const night = !!(window.__GAME_SKY && window.__GAME_SKY.night);
      if (!night) { if (deer.on) hide(deer); deerWait = 4; }
      else if (!deer.on) { if ((deerWait -= dt) <= 0) { const p = spot(st.pos.x, st.pos.z, 15, 22); if (p) show(deer, p); else deerWait = 3; } }
      else {
        deer.t += dt; const d = dist(deer);
        if (d > 40) { hide(deer); deerWait = 3; }                                // the player went far off: it shows itself again near where they are now
        else if (d < 6.5) { hide(deer); deerWait = 25; play.notice('غزال الظلال اختفى. ما يخليك تقرب.', false, 3500); }       // it melts away
        else {
          face(deer, dt); pose(deer);
          // seen: it stands in front of the player, within sight
          const cp = Math.cos(st.pitch), vx = -Math.sin(st.yaw) * cp, vz = -Math.cos(st.yaw) * cp, dx = (deer.x - st.pos.x) / d, dz = (deer.z - st.pos.z) / d;
          if (d < 24 && vx * dx + vz * dz > 0.9) { deerSeen += dt; if (deerSeen > 1.2) st.deerSeen = 1; } else deerSeen = 0;
        }
      }
    }
    dNear = false;
    if (st.pet) {
      if (!dragon.on) show(dragon, { x: st.pos.x + 1, y: st.pos.y, z: st.pos.z });
      dragon.t += dt;
      const d = dist(dragon);
      if (d > 30) { dragon.x = st.pos.x + 1.5; dragon.z = st.pos.z + 1.5; dragon.y = st.pos.y; }       // left far behind (a fall, the crystal): it is beside the player again
      // it keeps station behind the player's shoulder, in the air
      const tx = st.pos.x + Math.sin(st.yaw) * 1.6 + Math.cos(st.yaw) * 1.1, tz = st.pos.z + Math.cos(st.yaw) * 1.6 - Math.sin(st.yaw) * 1.1, ddx = tx - dragon.x, ddz = tz - dragon.z, dd = Math.hypot(ddx, ddz);
      if (dd > 0.4) { const v = Math.min(dd * 3, 9) * dt; dragon.x += ddx / dd * v; dragon.z += ddz / dd * v; dragon.yaw += (((Math.atan2(ddx, ddz) - dragon.yaw + 9.4248) % 6.2832) - 3.1416) * Math.min(1, 8 * dt); } else face(dragon, dt);
      dragon.y += (st.pos.y + 1.15 + Math.sin(dragon.t * 2.2) * 0.12 - dragon.y) * Math.min(1, 5 * dt);
      dragon.o.position.set(dragon.x, dragon.y, dragon.z); dragon.o.rotation.y = dragon.yaw;
      const flap = Math.sin(dragon.t * 11) * 0.55; dragon.o.userData.wings[0].rotation.z = flap; dragon.o.userData.wings[1].rotation.z = -flap;
      if (d < 4 && !st.modal) { const cp = Math.cos(st.pitch), vx = -Math.sin(st.yaw) * cp, vy = Math.sin(st.pitch), vz = -Math.cos(st.yaw) * cp, cx = dragon.x - st.pos.x, cy = dragon.y + 0.35 - (st.pos.y + play.tuning.eye), cz = dragon.z - st.pos.z, t = cx * vx + cy * vy + cz * vz; dNear = t > 0 && cx * cx + cy * cy + cz * cz - t * t < 0.4; }
    } else if (dragon.on) hide(dragon);
    const text = dNear ? 'التنين الصغير · اضغط زر البناء تفتح شنطته' : '';
    if (tag.textContent !== text) tag.textContent = text;
    if (tag.hidden === !!text) tag.hidden = !text;
  });
  const api = { fox, turtle, deer, dragon, oasis, hatch, get dragonNear() { return dNear; } };
  window.__GAME_FRIENDS = api;
  return api;
}
