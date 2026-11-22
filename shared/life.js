// Living creatures: animals that wander and can be hunted, and monsters that come for the player.
// Each world brings its own models and names; this module moves them over the voxel ground (or through the
// water, or above the ground), lets the player strike what is under the crosshair, hands out what the
// creature leaves, and lets an animal be fed so that it follows the player.
//
//   const life = createLife({
//     scene, camera, play, world, vitals: () => vitals, offset: { x, z },      // offset: play coordinates -> scene
//     kinds: [{ key, name, kind: 'animal' | 'monster', make: () => Object3D, hp, speed, radius, height, max, dmg,
//               drops: [[itemId, n], ...]   what it leaves (kit item ids; `meat: n` is the old way to say [[200, n]])
//               fly: h                      it keeps h above the ground; with perch: true it lands when it rests
//               swim: true                  it lives in the water: made there, and never leaves it
//               still: true                 it does not move (a sea plant: picked the way a creature is struck)
//               likes: 'plants' | 'meat'    what it takes from the hand (default 'plants'); tame: false for one that never does
//               where: (x, y, z) => bool    only made where this says so (a part of the world)
//             }],
//   });
//   createPlay({ onUse: (item) => life.use(item), ... });   onFrame -> life.update(dt)
//
// Models are made once per slot and reused. They face +z at rotation 0 and stand on their origin.

import * as THREE from 'three';
import { kitItem, K } from './kit.js';
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
    onChange: null,
    setMonsters(v, forced) {
      if (share.mode === 'guest' && !forced) { play.notice('صاحب الغرفة هو اللي يتحكم بالوحوش.', false, 2600); return; }
      monsters = !!v; if (window.__GAME_LIFE.onChange && !forced) window.__GAME_LIFE.onChange(monsters); try { window.localStorage.setItem('bw-monsters', monsters ? '1' : '0'); } catch (e) { /* not kept */ } if (!monsters && share.mode !== 'guest') for (const e of [...ents]) if (e.k.kind === 'monster') retire(e);
    },
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
  const wet = (x, y, z) => play.isLiquid(cell(x, y, z));
  /** The water in column (x, z) nearest under y0: { lo, hi } = the floor under it and its surface; null if there is none. */
  function waterAt(x, z, y0) {
    if (x < 3 || z < 3 || x > world.sx - 3 || z > world.sz - 3) return null;
    for (let y = Math.min(world.sy - 2, Math.floor(y0) + 6); y > 0; y--) if (wet(x, y, z)) { let lo = y; while (lo > 0 && wet(x, lo - 1, z)) lo--; return { lo, hi: y + 0.8 }; }
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
    const k = o.kinds.find((q) => q.key === key);
    if (!k) return null;
    let y;
    if (k.swim) { const w = waterAt(x, z, st.pos.y + 8); if (!w || (!k.still && w.hi - w.lo < 1.2)) return null; y = k.still ? w.lo : w.lo + 0.2 + Math.random() * Math.max(0, w.hi - w.lo - 0.9); }
    else y = groundAt(x, z, st.pos.y + 8);
    if (y === null || (k.where && !k.where(x, y, z))) return null;
    const e = { nid: ++seq, k, obj: take(k), x, y, z, yaw: Math.random() * 6.28, hp: k.hp, t: Math.random() * 10, mode: 'idle', until: 1 + Math.random() * 3, tx: x, ty: y, tz: z, flee: 0, cool: 0, hurt: 0, dead: 0, moving: false, love: 0, tamed: false, owner: null, air: k.fly && !k.perch ? 1 : 0, lift: 0 };
    ents.push(e); counts[key]++;
    return e;
  }
  function trySpawn() {
    const night = !!(window.__GAME_SKY && window.__GAME_SKY.night);                 // the night belongs to the monsters: twice as many
    const open = o.kinds.filter((k) => counts[k.key] < Math.ceil(k.max * (k.kind === 'monster' ? (night ? 2 : 1) * (window.__GAME_DIFF ? window.__GAME_DIFF.mobs : 1) : 1)) && (k.kind !== 'monster' || monsters));
    if (!open.length) return;
    const k = open[Math.floor(Math.random() * open.length)];
    // a creature of the water, or of one part of the world, may need a few tries to find its place
    for (let i = (k.swim || k.where ? 8 : 1); i > 0; i--) {
      const a = Math.random() * 6.283, d = (k.kind === 'monster' ? 20 : k.still ? 5 : 13) + Math.random() * (k.swim ? 22 : 12);
      if (spawnAt(k.key, st.pos.x + Math.sin(a) * d, st.pos.z + Math.cos(a) * d)) break;
    }
  }
  const dropsOf = (k) => k.drops || (k.meat ? [[MEAT, k.meat]] : []);
  /** Hand over what a creature left: [[itemId, n], ...]. One note says what was gained and where it went. */
  function giveDrops(list) {
    const got = [], lost = [];
    let food = null, packed = false;
    for (const [id, n] of list) {
      const it = kitItem(id | 0, Math.max(1, Math.min(8, n | 0)));
      if (!it) continue;
      const where = play.give(it);
      if (!where) { lost.push(it.name); continue; }
      got.push(it.name + (it.n > 1 ? ' ×' + it.n : ''));
      if (where === 'pack') packed = true;
      if (it.use === 'eat' && !food) food = it;
    }
    if (lost.length) { play.notice('حقيبتك مليانة، ما في مكان لـ ' + lost.join(' و') + '.', false, 3200); if (!got.length) return; }
    if (!got.length) return;
    const first = food && !st.gotFood;
    if (food) st.gotFood = true;
    play.notice('حصلت: ' + got.join('، ') + '.' + (packed ? ' اللي ما له مكان تحت راح حقيبتك (E).' : '') + (first ? ' عشان تاكل: اختر الأكل واضغط زر البناء.' : ''), false, first || packed ? 6000 : 3200);
  }
  /** The selected item was used (the place button on something that is not a block). */
  function use(item) {
    const v = o.vitals && o.vitals();
    if (item.use === 'eat') {
      if (!(item.n > 0) || !v) return false;
      const hungry = v.values.food != null && v.values.food < 95;
      if (v.values.hp >= 100 && !hungry) { play.notice('شبعان وصحتك كاملة.', false, 1600); return false; }
      if (v.values.food != null) v.values.food = Math.min(100, v.values.food + (item.eat || 40));
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
      _c.set(e.x - ex, e.y + (e.lift || 0) + e.k.height * 0.5 - ey, e.z - ez);
      const t = _c.dot(_d);
      if (t < 0 || t > bt + e.k.radius) continue;
      const d2 = _c.lengthSq() - t * t, r = Math.max(e.k.radius, e.k.height * 0.42);
      if (d2 < r * r && t - r * 0.5 < bt) { best = e; bt = t - r * 0.5; }
    }
    return best;
  }
  // ---- a shared game. The host's creatures are the real ones: it moves them, and tells the guests where they are.
  // A guest shows what it is told, and tells the host about its blows.
  const share = { mode: null, send: null, players: null };       // mode: null | 'host' | 'guest'; send(toId | null, msg); players(): [{ id, x, y, z }]
  let seq = 0;
  function felled(e) { e.dead = 0.0001; if (play.sound) play.sound.brk(); }
  /** A kill is counted and paid: kind 'animal' | 'monster' | 'plant' (a sea plant: picked, not hunted); drops [[id, n], ...] (a bare number is that much meat). */
  function credit(kind, drops) {
    const gain = kind === 'monster' ? 5 : kind === 'plant' ? 1 : 2; xp += gain; st.xp = (st.xp || 0) + gain;
    if (kind === 'monster' || kind === 'animal') st.kills[kind]++;
    const list = Array.isArray(drops) ? drops : drops > 0 ? [[MEAT, drops]] : [];
    if (list.length) giveDrops(list);
  }
  const kindOf = (k) => (k.still ? 'plant' : k.kind);
  // ---- feeding: an animal takes the food it likes from the hand. It stops running, heals, and follows whoever fed it
  // until it is hungry again (LOVE seconds); then it wanders off until it is fed once more.
  const LOVE = 240;
  const heartGeo = new THREE.BoxGeometry(0.16, 0.16, 0.06), heartRed = new THREE.MeshBasicMaterial({ color: 0xff4d6d }), heartGrey = new THREE.MeshBasicMaterial({ color: 0x8a8f98 });
  function heart(e) {
    let h = e.obj.userData.heart;
    if (!h) { h = new THREE.Group(); const a = new THREE.Mesh(heartGeo, heartRed), b = new THREE.Mesh(heartGeo, heartRed); a.rotation.z = 0.785; a.position.x = -0.06; b.rotation.z = 0.785; b.position.x = 0.06; b.position.y = 0; h.add(a, b); const c = new THREE.Mesh(heartGeo, heartRed); c.rotation.z = 0.785; c.position.y = -0.07; h.add(c); e.obj.add(h); e.obj.userData.heart = h; }
    return h;
  }
  function fed(e, who) {
    e.love = LOVE; e.tamed = true; e.owner = who; e.flee = 0; e.hp = e.k.hp;
  }
  function feed(e, s) {
    const likes = e.k.likes || 'plants';
    if (e.k.tame === false) { play.notice(e.k.name + ' ما ياخذ أكل من اليد.', false, 2600); return true; }
    if (s.feed !== likes) { play.notice(e.k.name + ' ما ياكل هذا. يحب ' + (likes === 'meat' ? 'اللحم والسمك' : 'الحبوب والتمر والطحالب') + '.', false, 3400); return true; }
    const again = e.tamed;
    s.n--; play.setSlot(st.sel, s.n > 0 ? s : EMPTY);
    st.fed = (st.fed || 0) + 1; st.xp = (st.xp || 0) + 1;
    if (play.sound) (play.sound.eat || play.sound.place)();
    if (share.mode === 'guest') { if (share.send) share.send(null, { t: 'feed', e: e.nid }); e.love = 1; }
    else fed(e, null);
    play.notice(again ? e.k.name + ' شبع ورجع يمشي وراك.' : e.k.name + ' صار يحبك وبيمشي وراك. بعد شوي يجوع، أكّله مرة ثانية.', false, 4200);
    return true;
  }
  play.onUseFirst(() => {
    const s = st.slots[st.sel];
    if (!aimed || aimed.k.kind !== 'animal' || aimed.k.still || !s || !s.feed || !(s.n > 0)) return false;
    // food the animal does not take is the player's own to eat: the press goes on to eating
    if (aimed.k.tame === false || s.feed !== (aimed.k.likes || 'plants')) return false;
    return feed(aimed, s);
  });
  /** Host: a guest fed creature nid. */
  function remoteFeed(nid, from) { const e = ents.find((q) => q.nid === nid); if (e && !e.dead && e.k.kind === 'animal' && e.k.tame !== false) fed(e, from); }
  // every third plant pulled up gives seeds, which is what the animals that graze are fed
  let plants = 0;
  if (play.onBreakAny) play.onBreakAny((h) => {
    const b = play.blocks[h.id];
    if (h.remote || !b || b.kind !== 'cross' || h.id === K.FIRE || h.id === K.TORCH) return;
    if (plants++ % 3 === 0) { const first = !st.gotSeeds; st.gotSeeds = true; if (play.give(kitItem(K.SEEDS, 2)) && first) play.notice('لقيت حبوب بين الزرع. أكّلها للحيوانات عشان تحبك وتمشي وراك.', false, 5200); }
  });
  function strike(e) {
    e.hurt = 0.25;
    if (play.sound) play.sound.dig();
    if (share.mode === 'guest') { if (share.send) share.send(null, { t: 'hit', e: e.nid, pow: power() }); return; }      // the host decides what the blow did
    e.hp -= power(); e.flee = e.k.kind === 'animal' ? 5 : 0; e.love = 0; e.tamed = false;
    const dx = e.x - st.pos.x, dz = e.z - st.pos.z, l = Math.hypot(dx, dz) || 1, nx = e.x + dx / l * 0.7, nz = e.z + dz / l * 0.7;
    if (!e.k.still && (e.k.swim ? wet(nx, e.y, nz) : groundAt(nx, nz, e.y + 1) !== null)) { e.x = nx; e.z = nz; }
    if (e.hp <= 0) { felled(e); credit(kindOf(e.k), dropsOf(e.k)); }
  }
  /** Host: a guest struck creature nid. */
  function remoteHit(nid, pow, from) {
    const e = ents.find((q) => q.nid === nid);
    if (!e || e.dead || !(pow > 0)) return;
    e.hp -= Math.min(10, pow); e.hurt = 0.25; e.flee = e.k.kind === 'animal' ? 5 : 0; e.love = 0; e.tamed = false;
    if (e.hp <= 0) { felled(e); if (share.send) share.send(from, { t: 'kill', kind: kindOf(e.k), drops: dropsOf(e.k) }); }
  }
  /** Host: where every creature is now, for the guests. */
  const snapshot = () => ents.map((e) => [e.nid, o.kinds.indexOf(e.k), +e.x.toFixed(2), +e.y.toFixed(2), +e.z.toFixed(2), +e.yaw.toFixed(2), Math.max(0, Math.round(e.hp * 10) / 10), e.moving ? 1 : 0, e.dead ? 1 : 0, e.love > 0 ? 1 : e.tamed ? 2 : 0, +(e.air || 0).toFixed(1)]);
  /** Guest: take the host's creatures as they are. */
  function applySnapshot(list) {
    const seen = new Set();
    for (const [nid, ki, x, y, z, yaw, hp, moving, dead, love, air] of list) {
      const k = o.kinds[ki];
      if (!k) continue;
      seen.add(nid);
      let e = ents.find((q) => q.nid === nid);
      if (!e) { e = { k, obj: take(k), nid, x, y, z, yaw, hp, t: 0, hurt: 0, dead: 0, moving: false, puppet: true }; ents.push(e); counts[k.key]++; }
      e.gx = x; e.gy = y; e.gz = z; e.gyaw = yaw; e.hp = hp; e.moving = !!moving; e.love = love === 1 ? 1 : 0; e.tamed = love > 0; e.air = air || 0;
      if (dead && !e.dead) felled(e);
    }
    for (const e of [...ents]) if (!seen.has(e.nid) && !e.dead) retire(e);
  }
  /** Take or leave a shared game. Entering as a guest clears this player's own creatures. */
  function setShare(mode, send, players) {
    share.mode = mode; share.send = send || null; share.players = players || null;
    if (mode === 'guest') for (const e of [...ents]) retire(e);
    if (!mode) for (const e of [...ents]) if (e.puppet) retire(e);
  }
  function pose(e, dt) {
    const k = e.k;
    // a bird that perches comes down when it rests and goes up when it moves; the others that fly stay up
    if (k.fly && k.perch) e.air += ((e.moving || e.flee > 0 ? 1 : 0) - e.air) * Math.min(1, 2.5 * dt);
    const lift = k.fly ? (k.fly + Math.sin(e.t * 1.6) * 0.25) * (k.perch ? e.air : 1) : k.swim ? 0 : (e.moving && !e.obj.userData.anim ? Math.abs(Math.sin(e.t * 7)) * 0.07 : 0);
    e.lift = lift;
    e.obj.position.set(e.x + off.x, e.y + lift, e.z + off.z);
    e.obj.rotation.set(e.moving && !k.fly && !k.swim && !e.obj.userData.anim ? Math.sin(e.t * 7) * 0.04 : 0, e.yaw, 0);
    e.obj.scale.setScalar(e.obj.userData.baseScale * (e.hurt > 0 ? 0.9 : 1));
    if (e.obj.userData.anim) e.obj.userData.anim(e.t, e.moving, k.fly ? (k.perch ? e.air : 1) : 0);
    // a heart over an animal that was fed: red while it follows, grey once it is hungry again
    if (e.tamed || e.obj.userData.heart) {
      const h = heart(e), sc = e.obj.userData.baseScale || 1;
      h.visible = e.tamed && !e.dead;
      if (h.visible) { h.position.set(0, (k.height + 0.38 + Math.sin(e.t * 3) * 0.05) / sc, 0); h.scale.setScalar(1 / sc); h.rotation.y = -e.yaw + st.yaw; const m = e.love > 0 ? heartRed : heartGrey; for (const c of h.children) c.material = m; }
    }
  }
  function update(dt) {
    if (dt <= 0 || (st.modal && !share.mode)) return;
    const guest = share.mode === 'guest';
    if (!guest && (spawnT -= dt) <= 0) {
      spawnT = 2.2; trySpawn();
      if (window.__GAME_DIFF && window.__GAME_DIFF.mobs === 0) for (const e of [...ents]) if (e.k.kind === 'monster') retire(e);      // a peaceful world has none
    }
    atkCool -= dt;
    aimed = st.modal ? null : findAimed();
    st.noDig = !!aimed;                                   // a creature under the crosshair is struck instead of the block behind it
    if (aimed && play.input.dig && atkCool <= 0) { atkCool = 0.4; strike(aimed); }
    // everyone a monster may go for: this player, and in a shared game the others
    const others = share.mode === 'host' && share.players ? share.players() : [];
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i], k = e.k;
      e.t += dt; e.hurt -= dt;
      if (e.dead) { e.dead += dt; e.obj.rotation.z = Math.min(1.45, e.dead * 5); e.obj.scale.setScalar(e.obj.userData.baseScale * Math.max(0.01, 1 - Math.max(0, e.dead - 0.5) * 2.2)); if (e.dead > 0.95) retire(e); continue; }
      if (guest) {      // glide to where the host says it is
        const f = Math.min(1, 10 * dt);
        e.x += (e.gx - e.x) * f; e.y += (e.gy - e.y) * f; e.z += (e.gz - e.z) * f; e.yaw += (((e.gyaw - e.yaw + 9.4248) % 6.2832) - 3.1416) * f;
        pose(e, dt);
        continue;
      }
      // fire burns creatures too: an animal that dies in it is roasted for whoever lit it
      if (cell(e.x, e.y + 0.2, e.z) === 151) { e.hp -= 9 * dt; e.hurt = 0.2; e.flee = 2; if (e.hp <= 0) { felled(e); credit(kindOf(k), dropsOf(k)); continue; } }
      if (k.still) { pose(e, dt); continue; }
      if (e.love > 0 && (e.love -= dt) <= 0 && e.owner === null) play.notice(k.name + ' جاع. أكّله عشان يرجع يمشي وراك.', false, 3600);
      let p = st.pos, who = null, dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz);
      for (const q of others) { const d = Math.hypot(q.x - e.x, q.z - e.z); if (d < dist) { dist = d; p = q; who = q.id; dx = q.x - e.x; dz = q.z - e.z; } }
      if (dist > 64) { retire(e); continue; }
      let mx = 0, mz = 0, speed = k.speed;
      e.cool -= dt; e.flee -= dt;
      if (k.swim) {
        // through the water: toward a point in it, away from whoever struck; it never leaves the water
        if (!wet(e.x, e.y + 0.1, e.z)) { retire(e); continue; }
        if (e.flee > 0 && dist > 0.01) { e.tx = e.x - dx / dist * 4; e.tz = e.z - dz / dist * 4; speed = k.speed * 2.2; }
        else if ((e.until -= dt) <= 0) { e.until = 1.5 + Math.random() * 4; const a = Math.random() * 6.283, d = 1.5 + Math.random() * 5; e.tx = e.x + Math.sin(a) * d; e.tz = e.z + Math.cos(a) * d; e.ty = e.y + (Math.random() - 0.5) * 2.4; }
        const wx = e.tx - e.x, wy = e.ty - e.y, wz = e.tz - e.z, wl = Math.hypot(wx, wz);
        e.moving = false;
        if (wl > 0.2) {
          const nx = e.x + wx / wl * speed * dt, nz = e.z + wz / wl * speed * dt, ny = e.y + Math.max(-1, Math.min(1, wy)) * speed * 0.5 * dt;
          if (wet(nx, e.y + 0.1, nz) && wet(nx, e.y + k.height, nz)) { e.x = nx; e.z = nz; e.moving = true; e.yaw += (((Math.atan2(wx, wz) - e.yaw + 9.4248) % 6.2832) - 3.1416) * Math.min(1, 6 * dt); }
          else e.until = 0;
          if (wet(e.x, ny + 0.05, e.z) && wet(e.x, ny + k.height + 0.15, e.z)) e.y = ny; else e.ty = e.y;
        }
        pose(e, dt);
        continue;
      }
      if (((k.kind === 'monster' && monsters) || (k.fights && e.flee > 0)) && dist < 20 && Math.abs(p.y - e.y) < 6) {      // a monster, or an animal that fights back when it is struck
        const reach = k.radius + 1.25;
        if (dist > reach) { mx = dx / dist; mz = dz / dist; speed = k.speed; }
        else if (e.cool <= 0) {
          e.cool = 1.15;
          const dmg = k.dmg * (window.__GAME_DIFF ? window.__GAME_DIFF.dmg : 1);      // how hard the world is, by the host's choice
          if (who !== null) { if (share.send) share.send(who, { t: 'hurt', d: dmg }); }
          else { const v = o.vitals && o.vitals(); if (v) v.hurt(dmg * (1 - armor())); }
        }
      } else if (e.flee > 0 && dist > 0.01) { mx = -dx / dist; mz = -dz / dist; speed = k.speed * 2.1; }
      else if (e.love > 0) {
        // fed: it keeps near whoever fed it
        let q = st.pos; if (e.owner !== null) { const f = others.find((w) => w.id === e.owner); if (f) q = f; }
        const fx = q.x - e.x, fz = q.z - e.z, fl = Math.hypot(fx, fz);
        if (fl > 3) { mx = fx / fl; mz = fz / fl; speed = k.speed * (fl > 9 ? 2.2 : 1.1); }
      }
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
      pose(e, dt);
    }
    // the tag follows the aimed creature
    if (aimed && camera) {
      _p.set(aimed.x + off.x, aimed.y + aimed.k.height + (aimed.lift || 0) + (aimed.tamed ? 0.75 : 0.35), aimed.z + off.z).project(camera);
      tag.hidden = _p.z >= 1;
      tagName.textContent = aimed.k.name + (aimed.love > 0 ? ' · يحبك' : aimed.tamed ? ' · جوعان' : ''); tagBar.style.width = Math.max(0, aimed.hp / aimed.k.hp * 100).toFixed(0) + '%';
      tag.style.transform = `translate(${((_p.x * 0.5 + 0.5) * window.innerWidth).toFixed(1)}px, ${((-_p.y * 0.5 + 0.5) * window.innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
    } else tag.hidden = true;
  }
  /** A shared game: a blow from a monster the host moves lands on this player; a kill this player made is counted here. */
  function hurtPlayer(d) { const v = o.vitals && o.vitals(); if (v && d > 0) v.hurt(Math.min(40, d) * (1 - armor())); }
  const api = { update, use, spawnAt, ents, kinds: o.kinds, share, setShare, snapshot, applySnapshot, remoteHit, remoteFeed, hurtPlayer, credit, waterAt, get armor() { return armor(); }, get xp() { return xp; }, get aimed() { return aimed; } };
  window.__GAME_LIFE.life = api;
  return api;
}
