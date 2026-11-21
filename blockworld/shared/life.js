// Living creatures: animals that wander and can be hunted for meat, and monsters that come for the player.
// Each world brings its own models and names; this module moves them over the voxel ground, lets the
// player strike what is under the crosshair, and hands out meat.
//
//   const life = createLife({
//     scene, camera, play, world, vitals: () => vitals, offset: { x, z },      // offset: play coordinates -> scene
//     kinds: [{ key, name, kind: 'animal' | 'monster', make: () => Object3D, hp, speed, radius, height,
//               max, meat, dmg, fly }],
//   });
//   createPlay({ onUse: (item) => life.use(item), ... });   onFrame -> life.update(dt)
//
// Models are made once per slot and reused. They face +z at rotation 0 and stand on their origin.

import * as THREE from 'three';
import { kitItem } from './kit.js';
import { EMPTY } from './play.js';
import { protection } from './status.js';

export const MEAT = 200, SWORD = 210, ARMOR = 211;

/** A plain four-legged animal from boxes, for a world that has no model of its own for one. */
export function simpleBeast({ body = 0x6d5a47, belly = 0x8a7660, horn = 0xd8d2c0, scale = 1 } = {}) {
  const g = new THREE.Group(), m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 });
  const mb = m(body), ml = m(belly), mh = m(horn), md = m(0x2a221c);
  const add = (w, h, d, x, y, z, mat, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b; };
  add(0.5, 0.52, 1.05, 0, 0.86, 0, mb); add(0.44, 0.2, 0.9, 0, 0.6, 0, ml);
  add(0.3, 0.44, 0.34, 0, 1.2, 0.55, mb, -0.5); add(0.26, 0.26, 0.4, 0, 1.4, 0.82, mb); add(0.18, 0.16, 0.16, 0, 1.33, 1.04, ml);
  for (const sx of [-1, 1]) { add(0.07, 0.34, 0.07, sx * 0.1, 1.66, 0.72, mh, 0.5); add(0.06, 0.26, 0.06, sx * 0.1, 1.86, 0.56, mh, 1.0); add(0.05, 0.05, 0.03, sx * 0.1, 1.44, 1.02, md); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { add(0.13, 0.62, 0.13, sx * 0.17, 0.31, sz * 0.38, mb); add(0.11, 0.08, 0.13, sx * 0.17, 0.04, sz * 0.38, md); }
  add(0.1, 0.16, 0.1, 0, 1.0, -0.56, ml, 0.5);
  g.scale.setScalar(scale);
  return g;
}

export function createLife(o) {
  const { scene, camera, play, world } = o, st = play.state, off = o.offset || { x: 0, z: 0 };
  const ents = [], pool = {}, counts = {};
  let monsters = true, spawnT = 1, atkCool = 0, aimed = null, xp = 0;
  const armor = () => Math.min(0.8, protection(st));
  try { monsters = window.localStorage.getItem('bw-monsters') !== '0'; } catch (e) { /* storage may be closed */ }
  for (const k of o.kinds) { pool[k.key] = []; counts[k.key] = 0; }
  window.__GAME_LIFE = {
    get monsters() { return monsters; },
    setMonsters(v) { monsters = !!v; try { window.localStorage.setItem('bw-monsters', monsters ? '1' : '0'); } catch (e) { /* not kept */ } if (!monsters) for (const e of [...ents]) if (e.k.kind === 'monster') retire(e); },
  };
  // name tag over the creature under the crosshair
  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;left:0;top:0;z-index:20;pointer-events:none;direction:rtl;padding:3px 9px 5px;border-radius:7px;background:rgba(8,11,16,.78);border:1px solid rgba(255,255,255,.25);color:#f1f4f8;font:700 13px/1.3 system-ui,sans-serif;white-space:nowrap;';
  tag.innerHTML = '<span></span><i style="display:block;height:3px;margin-top:3px;background:rgba(255,255,255,.2)"><b style="display:block;height:100%;background:#e24a3a"></b></i>';
  tag.hidden = true; document.body.appendChild(tag);
  const tagName = tag.firstChild, tagBar = tag.querySelector('b');

  const cell = (x, y, z) => world.get(Math.floor(x), Math.floor(y), Math.floor(z));
  const solidAt = (x, y, z) => (y < 0 ? true : world.inb(Math.floor(x), Math.floor(y), Math.floor(z)) ? play.isSolid(cell(x, y, z)) : false);
  /** Feet height of open ground in column (x, z), looking down from a little above y0; null if none. */
  function groundAt(x, z, y0) {
    if (x < 3 || z < 3 || x > world.sx - 3 || z > world.sz - 3) return null;
    for (let y = Math.min(world.sy - 3, Math.floor(y0) + 2); y > 0; y--) if (solidAt(x, y - 1, z) && !solidAt(x, y, z) && !solidAt(x, y + 1, z)) return play.isLiquid(cell(x, y, z)) ? null : y;
    return null;
  }
  function take(k) {
    let obj = pool[k.key].pop();
    if (!obj) { obj = k.make(); obj.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } }); scene.add(obj); }
    obj.visible = true; obj.rotation.set(0, 0, 0); obj.scale.setScalar(obj.userData.baseScale ?? (obj.userData.baseScale = obj.scale.x));
    return obj;
  }
  function retire(e) { const i = ents.indexOf(e); if (i >= 0) ents.splice(i, 1); e.obj.visible = false; pool[e.k.key].push(e.obj); counts[e.k.key]--; if (aimed === e) aimed = null; }
  function spawnAt(key, x, z) {
    const k = o.kinds.find((q) => q.key === key), y = groundAt(x, z, st.pos.y + 8);
    if (!k || y === null) return null;
    const e = { k, obj: take(k), x, y, z, yaw: Math.random() * 6.28, hp: k.hp, t: Math.random() * 10, mode: 'idle', until: 1 + Math.random() * 3, tx: x, tz: z, flee: 0, cool: 0, hurt: 0, dead: 0, moving: false };
    ents.push(e); counts[key]++;
    return e;
  }
  function trySpawn() {
    const night = !!(window.__GAME_SKY && window.__GAME_SKY.night);                 // the night belongs to the monsters: twice as many
    const open = o.kinds.filter((k) => counts[k.key] < k.max * (k.kind === 'monster' && night ? 2 : 1) && (k.kind !== 'monster' || monsters));
    if (!open.length) return;
    const k = open[Math.floor(Math.random() * open.length)], a = Math.random() * 6.283, d = (k.kind === 'monster' ? 20 : 13) + Math.random() * 12;
    spawnAt(k.key, st.pos.x + Math.sin(a) * d, st.pos.z + Math.cos(a) * d);
  }
  function giveMeat(n) {
    const had = [...st.slots, ...st.pack].some((q) => q && q.id === MEAT && q.n > 0);
    const where = play.give(kitItem(MEAT, n));
    if (!where) { play.notice('حقيبتك مليانة، ما في مكان للحم.', false, 3000); return; }
    if (where === 'pack') play.notice('اللحم راح حقيبتك (E). انقله لمربع من مربعاتك تحت عشان تاكله.', false, 6000);
    else if (!had) play.notice('حصلت لحم. اختره واضغط زر البناء (الزر الأيمن) عشان تاكل وتشبع.', false, 5000);
  }
  /** The selected item was used (the place button on something that is not a block). */
  function use(item) {
    const v = o.vitals && o.vitals();
    if (item.use === 'eat') {
      if (!(item.n > 0) || !v) return false;
      const hungry = v.values.food != null && v.values.food < 95;
      if (v.values.hp >= 100 && !hungry) { play.notice('شبعان وصحتك كاملة.', false, 1600); return false; }
      if (v.values.food != null) v.values.food = Math.min(100, v.values.food + 40);
      v.values.hp = Math.min(100, v.values.hp + (v.values.food != null ? 10 : 30)); item.n--; st.eaten++; play.setSlot(st.sel, item.n > 0 ? item : EMPTY);
      if (play.sound) (play.sound.eat || play.sound.place)();
      return true;
    }
    if (item.use === 'wear' && item.wear) {
      // the piece in the hand goes on, and what was worn there comes back to the hand
      const was = st.gear[item.wear];
      st.gear[item.wear] = item; st.slots[st.sel] = was || EMPTY;
      play.changed();
      play.notice('لبست ' + item.name + '.', false, 2200); if (play.sound) play.sound.ui();
      return true;
    }
    return false;
  }
  const power = () => { const s = st.slots[st.sel]; return s && s.weapon ? +s.weapon || 7 : s && s.tool && !s.empty ? 3 : 2; };   // a weapon by its own strength, a digging tool 3, the bare hand 2
  const _d = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3();
  function findAimed() {
    const cp = Math.cos(st.pitch); _d.set(-Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp);
    const ex = st.pos.x, ey = st.pos.y + play.tuning.eye, ez = st.pos.z, limit = Math.min(3.6, st.hit ? st.hit.t : 99);
    let best = null, bt = limit;
    for (const e of ents) {
      if (e.hp <= 0) continue;
      _c.set(e.x - ex, e.y + e.k.height * 0.5 - ey, e.z - ez);
      const t = _c.dot(_d);
      if (t < 0 || t > bt + e.k.radius) continue;
      const d2 = _c.lengthSq() - t * t, r = Math.max(e.k.radius, e.k.height * 0.42);
      if (d2 < r * r && t - r * 0.5 < bt) { best = e; bt = t - r * 0.5; }
    }
    return best;
  }
  function strike(e) {
    e.hp -= power(); e.hurt = 0.25; e.flee = e.k.kind === 'animal' ? 5 : 0;
    const dx = e.x - st.pos.x, dz = e.z - st.pos.z, l = Math.hypot(dx, dz) || 1, nx = e.x + dx / l * 0.7, nz = e.z + dz / l * 0.7;
    if (groundAt(nx, nz, e.y + 1) !== null) { e.x = nx; e.z = nz; }
    if (play.sound) { play.sound.dig(); if (e.hp <= 0) play.sound.brk(); }
    if (e.hp <= 0) { e.dead = 0.0001; { const gain = e.k.kind === 'monster' ? 5 : 2; xp += gain; st.xp = (st.xp || 0) + gain; st.kills[e.k.kind]++; } if (e.k.meat) giveMeat(e.k.meat); }
  }
  function update(dt) {
    if (dt <= 0 || st.modal) return;
    const p = st.pos;
    if ((spawnT -= dt) <= 0) { spawnT = 2.2; trySpawn(); }
    atkCool -= dt;
    aimed = findAimed();
    st.noDig = !!aimed;                                   // a creature under the crosshair is struck instead of the block behind it
    if (aimed && play.input.dig && atkCool <= 0) { atkCool = 0.4; strike(aimed); }
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i], k = e.k;
      e.t += dt;
      if (e.dead) { e.dead += dt; e.obj.rotation.z = Math.min(1.45, e.dead * 5); e.obj.scale.setScalar(e.obj.userData.baseScale * Math.max(0.01, 1 - Math.max(0, e.dead - 0.5) * 2.2)); if (e.dead > 0.95) retire(e); continue; }
      const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz);
      if (dist > 64) { retire(e); continue; }
      let mx = 0, mz = 0, speed = k.speed;
      e.cool -= dt; e.flee -= dt; e.hurt -= dt;
      if (k.kind === 'monster' && monsters && dist < 20 && Math.abs(p.y - e.y) < 6) {
        const reach = k.radius + 1.25;
        if (dist > reach) { mx = dx / dist; mz = dz / dist; speed = k.speed; }
        else if (e.cool <= 0) { e.cool = 1.15; const v = o.vitals && o.vitals(); if (v) v.hurt(k.dmg * (1 - armor())); }
      } else if (e.flee > 0 && dist > 0.01) { mx = -dx / dist; mz = -dz / dist; speed = k.speed * 2.1; }
      else {
        if ((e.until -= dt) <= 0) { e.until = 2 + Math.random() * 5; if (Math.random() < 0.65) { const a = Math.random() * 6.283, d = 2 + Math.random() * 5; e.tx = e.x + Math.sin(a) * d; e.tz = e.z + Math.cos(a) * d; e.mode = 'walk'; } else e.mode = 'idle'; }
        const wx = e.tx - e.x, wz = e.tz - e.z, wl = Math.hypot(wx, wz);
        if (e.mode === 'walk' && wl > 0.25) { mx = wx / wl; mz = wz / wl; speed = k.speed * 0.6; } else e.mode = 'idle';
      }
      e.moving = false;
      if (mx || mz) {
        const nx = e.x + mx * speed * dt, nz = e.z + mz * speed * dt, g = groundAt(nx, nz, e.y + 1);
        if (g !== null && g - e.y <= 1.05 && e.y - g <= 3) { e.x = nx; e.z = nz; e.y += (g - e.y) * Math.min(1, 12 * dt); e.moving = true; e.yaw += (((Math.atan2(mx, mz) - e.yaw + 9.4248) % 6.2832) - 3.1416) * Math.min(1, 7 * dt); }
        else { e.mode = 'idle'; e.until = 0.4; if (e.flee > 0 || k.kind === 'monster') { const s = Math.random() < 0.5 ? 1 : -1, sx2 = -mz * s, sz2 = mx * s, g2 = groundAt(e.x + sx2 * 0.5, e.z + sz2 * 0.5, e.y + 1); if (g2 !== null && Math.abs(g2 - e.y) <= 1.05) { e.x += sx2 * speed * dt; e.z += sz2 * speed * dt; } } }
      } else { const g = groundAt(e.x, e.z, e.y + 1); if (g !== null) e.y += (g - e.y) * Math.min(1, 12 * dt); }
      const lift = k.fly ? k.fly + Math.sin(e.t * 1.6) * 0.25 : (e.moving ? Math.abs(Math.sin(e.t * 7)) * 0.07 : 0);
      e.obj.position.set(e.x + off.x, e.y + lift, e.z + off.z);
      e.obj.rotation.set(e.moving && !k.fly ? Math.sin(e.t * 7) * 0.04 : 0, e.yaw, 0);
      e.obj.scale.setScalar(e.obj.userData.baseScale * (e.hurt > 0 ? 0.9 : 1));
    }
    // the tag follows the aimed creature
    if (aimed && camera) {
      _p.set(aimed.x + off.x, aimed.y + aimed.k.height + (aimed.k.fly || 0) + 0.35, aimed.z + off.z).project(camera);
      tag.hidden = _p.z >= 1;
      tagName.textContent = aimed.k.name; tagBar.style.width = Math.max(0, aimed.hp / aimed.k.hp * 100).toFixed(0) + '%';
      tag.style.transform = `translate(${((_p.x * 0.5 + 0.5) * window.innerWidth).toFixed(1)}px, ${((-_p.y * 0.5 + 0.5) * window.innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
    } else tag.hidden = true;
  }
  return { update, use, spawnAt, ents, kinds: o.kinds, get armor() { return armor(); }, get xp() { return xp; }, get aimed() { return aimed; } };
}
