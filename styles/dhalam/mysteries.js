// The four mysteries of the dark highlands (the endless game of "dhalam"), each found by walking up to it:
//
//   1. Shadow-and-light stones: a bridge over a chasm that is there only in lantern light. Each stone is solid and seen
//      while a light is near it (a torch or lamp in the hand, or one set down), and nothing at all in the dark. The
//      chasms ring an island of rock with a chest on it; a torch at the near end shows the first stones.
//   2. Fog towers: old towers with an empty crystal socket at their foot. Fed one glowing crystal, the crystal at the
//      top burns, the mist round the tower thins, and a hidden ring of stones with a chest shows itself, marked by light.
//   3. «نوّور»: a small lantern-tailed creature of the pine woods. Given food it becomes a companion: it follows, lights
//      the way, and sniffs out the day's buried chests, walks to them and digs where they lie.
//   4. Clock rooms in the ruins: four glowing gears in a wall and four dials over the door. Turn each gear until its
//      bright tooth points as its dial does: the wall behind the gears opens on a vault with a chest and a passage
//      of time (step in, and the time of day moves on).
//
// The world keeps what was done (play.put / play.net.dig go into the save and to the others in a shared game).

import * as THREE from 'three';
import { K, KIT_BLOCKS, kitItem } from '../../shared/kit.js';
import { patch } from './fx.js';
import { mat, box, at } from './kit.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const LOOT_KEY = 'bw-dhalam-loot', NOOR_KEY = 'bw-dhalam-noor';
const load = (k, d) => { try { const v = JSON.parse(window.localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const keep = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* not kept: the worst is a chest filled again */ } };
const WAY = (dx, dz) => { const a = Math.atan2(dx, -dz) * 180 / Math.PI; return a > -45 && a <= 45 ? 'الشمال' : a > 45 && a <= 135 ? 'الشرق' : a > -135 && a <= -45 ? 'الغرب' : 'الجنوب'; };

/** «نوّور»: a round little forest creature with long soft ears, big dark eyes and a tail that ends in a glowing seed pod. */
function makeNoor(glowTex) {
  const g = new THREE.Group();
  const fur = mat(0x5f6b52, { tex: 'fur', rough: 1, fuzz: 0.6 }), furL = mat(0x8c9878, { tex: 'fur', rough: 1, fuzz: 0.5 }), furD = mat(0x3d4636, { tex: 'fur', rough: 1 });
  const eye = mat(0x08090b, { tex: null, rough: 0.15 }), shine = patch(new THREE.MeshBasicMaterial({ color: 0xf4fbff }));
  const pod = patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 0.9) }));
  const body = new THREE.Group();
  body.add(at(box(0.46, 0.36, 0.56, fur, { r: 0.15, seg: 3 }), 0, 0.3, 0));
  body.add(at(box(0.34, 0.16, 0.42, furL, { r: 0.07, seg: 2 }), 0, 0.17, 0.02));             // pale belly
  const head = new THREE.Group();
  head.add(at(box(0.38, 0.33, 0.33, fur, { r: 0.13, seg: 3 }), 0, 0, 0));
  head.add(at(box(0.2, 0.13, 0.08, furL, { r: 0.05 }), 0, -0.06, 0.16));                      // muzzle
  head.add(at(box(0.05, 0.035, 0.03, furD, { r: 0.012 }), 0, -0.02, 0.205));                  // nose
  for (const s of [-1, 1]) {
    head.add(at(box(0.085, 0.1, 0.03, eye, { r: 0.03 }), s * 0.095, 0.04, 0.165));
    head.add(at(box(0.025, 0.025, 0.01, shine, { r: 0 }), s * 0.095 + 0.02, 0.07, 0.182));
    const ear = new THREE.Group();
    ear.add(at(box(0.09, 0.34, 0.05, fur, { r: 0.04, anchor: 'bottom', taper: [0.7, 0.5] }), 0, 0, 0));
    ear.add(at(box(0.05, 0.26, 0.02, furL, { r: 0.02, anchor: 'bottom', taper: [0.7, 0.5] }), 0, 0.03, 0.022));
    ear.position.set(s * 0.13, 0.12, -0.02); ear.rotation.set(-0.5, 0, s * -0.9);
    head.add(ear);
    (g.userData.ears = g.userData.ears || []).push(ear);
  }
  head.position.set(0, 0.52, 0.27);
  body.add(head);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) body.add(at(box(0.1, 0.16, 0.11, furD, { r: 0.04, anchor: 'bottom' }), sx * 0.15, 0, sz * 0.17));
  // the tail: three segments curling up and over, the pod at the end
  const tail = new THREE.Group();
  let p = tail;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group();
    s.add(at(box(0.08 - i * 0.015, 0.2, 0.08 - i * 0.015, i ? furL : fur, { r: 0.03, anchor: 'bottom' }), 0, 0, 0));
    s.position.set(0, i ? 0.18 : 0, 0); s.rotation.x = i ? -0.55 : -0.9;
    p.add(s); p = s;
  }
  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), pod);
  bulb.position.set(0, 0.22, 0);
  p.add(bulb);
  const glow = new THREE.Sprite(patch(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.0, 0.72, 0.36), opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), { additive: true }));
  glow.scale.set(1.3, 1.3, 1);
  glow.position.copy(bulb.position);
  p.add(glow);
  tail.position.set(0, 0.36, -0.26);
  body.add(tail);
  g.add(body);
  g.userData.body = body; g.userData.head = head; g.userData.tail = tail; g.userData.pod = bulb;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

export function createMysteries({ play, world, terrain, kit, scene, camera, endless, B, sprites, tiles, weather, adv, light }) {
  const st = play.state;
  const LIT_HELD = (q) => q && ((q.key === 'torch' && q.n > 0) || (KIT_BLOCKS[q.id] && KIT_BLOCKS[q.id].light && q.n > 0));
  const filled = new Set(load(LOOT_KEY, []));
  let noticeAt = -10, clock = 0;
  const told = new Map();                                        // what was said, and when (so it is said again only after a while)
  /** force: the answer to something the player just did (it never waits behind a hint). */
  function say(key, text, ms = 5200, again = 90, force = false) {
    const t = told.get(key);
    if (t !== undefined && clock - t < again) return false;
    if (!force && clock - noticeAt < 3.5) return false;          // one at a time
    told.set(key, clock); noticeAt = clock;
    play.notice(text, false, ms);
    return true;
  }
  const solid = (id) => play.isSolid(id);
  /** Feet height on column (x, z) at or below height y (the first open cell above solid ground). */
  function groundBelow(x, z, y) {
    const X = Math.floor(x), Z = Math.floor(z);
    let yy = Math.min(world.sy - 2, Math.floor(y));
    while (yy > 1 && !solid(world.get(X, yy - 1, Z))) yy--;
    while (yy < world.sy - 2 && solid(world.get(X, yy, Z))) yy++;
    return yy;
  }
  /** Fill a chest the land put down, once (its key is kept so an emptied chest is not filled again). */
  function stock(key, c, list) {
    if (filled.has(key)) return;
    const ch = kit.chestAt(c.x, c.y, c.z);
    if (ch.some(Boolean)) { filled.add(key); return; }
    list.forEach(([id, n], i) => { const it = kitItem(id, n); if (it) ch[i * 2] = it; });
    filled.add(key);
    keep(LOOT_KEY, [...filled].slice(-400));
  }
  const has = (want) => [...st.slots, ...st.pack].find((q) => q && !q.tool && want.includes(q.id) && q.n > 0);
  function take(q) { q.n--; if (q.n <= 0) { const i = st.slots.indexOf(q); if (i >= 0) st.slots[i] = { empty: true, kit: true, id: 0, name: '', tool: 'none' }; else { const j = st.pack.indexOf(q); if (j >= 0) st.pack[j] = null; } } play.changed(); }

  // ------------------------------------------------------------------ features near the player
  let near = [], nearAt = -10;
  const refresh = () => { near = endless.featuresNear(st.pos.x, st.pos.z, 160); nearAt = clock; };

  // ------------------------------------------------------------------ 1. shadow-and-light stones
  const MAXG = 96, boxG = new THREE.BoxGeometry(1.0, 1.0, 1.0);
  const glimOn = new THREE.InstancedMesh(boxG, patch(new THREE.MeshBasicMaterial({ map: tiles.glimmer.map, color: new THREE.Color(1.15, 1.25, 1.25), transparent: true, opacity: 0.88 })), MAXG);
  const ghostMat = patch(new THREE.MeshBasicMaterial({ map: tiles.glimmer.map, color: 0x6fd6cf, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }), { additive: true });
  const glimGhost = new THREE.InstancedMesh(boxG, ghostMat, MAXG);
  for (const m of [glimOn, glimGhost]) { m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; scene.add(m); }
  glimOn.name = 'glimmerLit'; glimGhost.name = 'glimmerDark';
  const _m = new THREE.Matrix4();
  let glimT = 0;
  function lightsNear(x, y, z, r) {
    const p = st.pos;
    const held = LIT_HELD(st.slots[st.sel]) || LIT_HELD(st.gear && st.gear.off);
    if (held && Math.hypot(p.x - x - 0.5, p.y + 1 - y - 0.5, p.z - z - 0.5) < r + 0.5) return true;
    for (const k of kit.glow.keys()) { const [a, b, c] = k.split(',').map(Number); if (Math.abs(a - x) <= r && Math.abs(c - z) <= r && Math.abs(b - y) <= r && Math.hypot(a - x, b - y, c - z) <= r) return true; }
    return false;
  }
  function glimmer(dt) {
    if ((glimT -= dt) > 0) return;
    glimT = 0.1;
    let nOn = 0, nGhost = 0;
    const p = st.pos, hw = play.tuning.hw, ht = play.tuning.height;
    for (const f of near) {
      if (f.kind !== 'chasm' || Math.hypot(f.x - p.x, f.z - p.z) > 70) continue;
      for (const c of f.glim) {
        const cur = world.get(c.x, c.y, c.z);
        if (cur !== B.GLIM_OFF && cur !== B.GLIM_ON) continue;      // something else stands there now
        let on = lightsNear(c.x, c.y, c.z, 5.5);
        // never solid round the player's own body (it would trap them in stone)
        if (on && cur === B.GLIM_OFF && c.x + 1 > p.x - hw && c.x < p.x + hw && c.z + 1 > p.z - hw && c.z < p.z + hw && c.y + 1 > p.y && c.y < p.y + ht) on = false;
        const want = on ? B.GLIM_ON : B.GLIM_OFF;
        if (want !== cur) world.chunk(c.x >> 5, c.z >> 5)[(c.x & 31) + ((c.z & 31) << 5) + (c.y << 10)] = want;      // not an edit: the land's own stone changing with the light
        _m.makeTranslation(c.x + 0.5, c.y + 0.5, c.z + 0.5);
        if (on && nOn < MAXG) glimOn.setMatrixAt(nOn++, _m);
        else if (!on && nGhost < MAXG && Math.hypot(c.x - p.x, c.z - p.z) < 12) glimGhost.setMatrixAt(nGhost++, _m);
      }
      const dh = Math.hypot(f.head.x - p.x, f.head.z - p.z);
      if (dh < 13) say('glim:' + f.key, 'هالجسر ما يبان إلا في النور. امسك المشعل (أو حط مشعل جنبه) وامشِ عليه. وفي الظلام يختفي!', 6500, 120);
      if (Math.hypot(f.x - p.x, f.z - p.z) < 30) stock('chasm:' + f.key, f.chest, [[K.GOLD, 3], [K.EMERALD, 2], [K.AMETHYST, 3], [K.LUCKY, 1], [K.TORCH, 6]]);
    }
    glimOn.count = nOn; glimOn.instanceMatrix.needsUpdate = true;
    glimGhost.count = nGhost; glimGhost.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ 2. fog towers
  const towerGlow = new Map();                                   // feature key -> { glow, beam }
  const glowMat = (c, o) => patch(new THREE.SpriteMaterial({ map: sprites.glow, color: c, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), { additive: true });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x8ff0e6, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 70, 8, 1, true);
  let fog = 1, fogWant = 1;
  const lit = (f) => world.get(f.top.x, f.top.y, f.top.z) === B.BEACON_LIT;
  function lightTower(f) {
    play.put(f.socket.x, f.socket.y, f.socket.z, B.SOCKET_LIT);
    play.put(f.top.x, f.top.y, f.top.z, B.BEACON_LIT);
    // the hidden place: a ring of old standing stones round a chest
    // on dry ground: the first spot round the planned one that is not under a lake
    let h = f.hidden, g = groundBelow(h.x + 0.5, h.z + 0.5, world.sy - 3);
    for (let i = 0; i < 48 && g <= 17; i++) {
      const a = i * 2.4, r = 4 + i * 1.5, x = Math.round(f.hidden.x + Math.cos(a) * r), z = Math.round(f.hidden.z + Math.sin(a) * r), y = groundBelow(x + 0.5, z + 0.5, world.sy - 3);
      if (y > 17) { h = { x, z }; g = y; }
    }
    f.hidden = h;
    keep('bw-dhalam-hidden:' + f.key, { x: h.x, z: h.z, y: g });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, x = Math.round(h.x + Math.cos(a) * 3), z = Math.round(h.z + Math.sin(a) * 3), gy = groundBelow(x + 0.5, z + 0.5, g + 4);
      for (let y = gy; y < gy + 2 + (i % 2); y++) play.put(x, y, z, i % 2 ? B.BRICK_MOSS : B.BRICK);
    }
    play.put(h.x, g, h.z, K.CHEST);
    f.hiddenY = g;
    stock('hidden:' + f.key, { x: h.x, y: g, z: h.z }, [[K.DIAMOND, 2], [K.GOLD, 4], [K.GEM, 2], [K.GOLDEN_APPLE, 1], [K.LUCKY, 1]]);
    say('lit:' + f.key, 'ولّعت المنارة! الضباب انقشع حواليها… وبان شي كان مخفي: شوف عمود النور القريب.', 7000, 5, true);
  }
  function towers(dt) {
    const p = st.pos;
    let best = Infinity;
    for (const f of near) {
      if (f.kind !== 'tower') continue;
      if (!f.seen) { f.seen = true; const o = load('bw-dhalam-hidden:' + f.key, null); if (o) { f.hidden = { x: o.x, z: o.z }; f.hiddenY = o.y; } }      // where its hidden place showed itself
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      const on = lit(f);
      if (on) best = Math.min(best, d);
      let v = towerGlow.get(f.key);
      if (on && !v && d < 260) {
        const glow = new THREE.Sprite(glowMat(new THREE.Color(0.5, 1.0, 0.95), 0.9));
        glow.scale.set(11, 11, 1); glow.position.set(f.top.x + 0.5, f.top.y + 1.2, f.top.z + 0.5);
        const beam = new THREE.Mesh(beamGeo, beamMat);
        const hy = f.hiddenY ?? groundBelow(f.hidden.x + 0.5, f.hidden.z + 0.5, world.sy - 3);
        beam.position.set(f.hidden.x + 0.5, hy + 35, f.hidden.z + 0.5);
        scene.add(glow, beam);
        v = { glow, beam, hy };
        towerGlow.set(f.key, v);
      }
      if (v) {
        v.glow.material.opacity = 0.75 + 0.15 * Math.sin(clock * 2.1);
        // the beam over the hidden place goes out once its chest has been opened and emptied, or broken
        const id = world.get(f.hidden.x, v.hy, f.hidden.z), c = kit.chests.get(f.hidden.x + ',' + v.hy + ',' + f.hidden.z);
        v.beam.visible = id === K.CHEST && !!c && c.some(Boolean);
      }
      if (!on && d < 15) say('tower:' + f.key, 'منارة قديمة… وفي أسفلها من داخل مقبس بلّوري فاضي. حط فيه خام متوهّج (الصخر اللي يلمع جنبها) وشوف وش يصير.', 7000, 100);
    }
    for (const [k, v] of towerGlow) if (!near.some((f) => f.key === k)) { scene.remove(v.glow, v.beam); towerGlow.delete(k); }
    fogWant = 1 - 0.72 * sstep(120, 40, best);
    fog += (fogWant - fog) * Math.min(1, dt * 0.8);
  }

  // ------------------------------------------------------------------ 3. «نوّور», the lantern creature
  const noor = { obj: makeNoor(sprites.glow), on: false, tame: !!load(NOOR_KEY, false), x: 0, y: 0, z: 0, yaw: 0, mode: 'idle', home: null, wait: 4, hop: 0, target: null, digging: null };
  noor.obj.visible = false;
  scene.add(noor.obj);
  const isFood = (q) => q && q.n > 0 && (q.use === 'eat' || q.key === 'meat' || q.id === K.MEAT);
  function place(x, z, y) { noor.x = x; noor.z = z; noor.y = y; noor.on = true; noor.obj.visible = true; }
  function spawnWild() {
    const p = st.pos;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 13 + Math.random() * 9, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const y = groundBelow(x, z, p.y + 8), under = world.get(Math.floor(x), y - 1, Math.floor(z));
      if (under !== B.LITTER || Math.abs(y - p.y) > 6) continue;
      place(x, z, y); noor.home = { x, z }; noor.mode = 'idle';
      return true;
    }
    return false;
  }
  function stepTo(tx, tz, speed, dt) {
    const dx = tx - noor.x, dz = tz - noor.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    const s = Math.min(d, speed * dt);
    const nx = noor.x + dx / d * s, nz = noor.z + dz / d * s;
    const ny = groundBelow(nx, nz, noor.y + 1.6);
    if (ny - noor.y <= 1.6) { noor.x = nx; noor.z = nz; noor.y += (ny - noor.y) * Math.min(1, dt * 12); }
    else noor.hop = 1;                                         // a wall: it bounds over it next frame
    if (noor.hop > 0) { noor.y = Math.max(noor.y, ny); noor.hop = 0; }
    const want = Math.atan2(dx, dz);
    let da = want - noor.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
    noor.yaw += da * Math.min(1, dt * 8);
    return d;
  }
  function useOnNoor(q) {
    if (!noor.on || noor.tame) return false;
    const p = st.pos, dx = noor.x - p.x, dz = noor.z - p.z, d = Math.hypot(dx, dz);
    if (d > 3.4) return false;
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    if ((fx * dx + fz * dz) / Math.max(0.01, d) < 0.55) return false;
    if (!isFood(q)) { say('noor-food', '«نوّور» يشمّ يدك… يبي أكل.', 2600, 6, true); return true; }
    take(q);
    noor.tame = true; keep(NOOR_KEY, true);
    st.noorFriend = 1;
    say('noor-tame', '«نوّور» صار رفيقك! بيمشي معك ويضوي لك الدرب، ولو شمّ كنز مدفون بيمشي له ويحفر عنده.', 7500, 0, true);
    return true;
  }
  let sniff = 0;
  function noorTick(dt) {
    const p = st.pos;
    if (!noor.on) {
      if (noor.tame) { const y = groundBelow(p.x + 1.5, p.z + 1.5, p.y + 3); place(p.x + 1.5, p.z + 1.5, y); }
      else if ((noor.wait -= dt) <= 0) { noor.wait = 5; spawnWild(); }
    }
    if (!noor.on) { light.intensity = 0; return; }
    const d = Math.hypot(noor.x - p.x, noor.z - p.z);
    let moving = false;
    if (!noor.tame) {
      if (d > 75) { noor.on = false; noor.obj.visible = false; return; }
      if (d < 10) say('noor-wild', 'شي صغير يلمع بين الشجر… هذا «نوّور». قرّب منه وعطه أكل (اللحم المجفف أو أي أكل) وهو قدّامك، ويصير رفيقك.', 7000, 150);
      // it potters about its spot, and keeps a little away from a player who rushes at it
      if (!noor.target || Math.hypot(noor.target.x - noor.x, noor.target.z - noor.z) < 0.3) noor.target = { x: noor.home.x + (Math.random() - 0.5) * 6, z: noor.home.z + (Math.random() - 0.5) * 6 };
      if (d < 2.2 && st.moving > 3) noor.target = { x: noor.x + (noor.x - p.x) * 1.5, z: noor.z + (noor.z - p.z) * 1.5 };
      moving = stepTo(noor.target.x, noor.target.z, 1.2, dt) > 0.05;
    } else {
      if (d > 34) { const y = groundBelow(p.x + 1.2, p.z + 1.2, p.y + 3); place(p.x + 1.2, p.z + 1.2, y); }
      // the day's buried chests: the nearest one within reach, if any
      if ((sniff -= dt) <= 0) {
        sniff = 1;
        const A = adv || window.__GAME_ADV, left = A ? A.buriedLeft : [];
        let best = null, bd = Infinity;
        for (const q of left) { const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < bd) { bd = dd; best = q; } }
        if (noor.digging && !left.some((q) => q.k === noor.digging.k)) { say('noor-found:' + noor.digging.k, 'لقيته! «نوّور» فرحان. في كنوز ثانية؟ امشِ وخلّه يشمّ.', 4500, 0); noor.digging = null; }
        noor.target = best && bd < 90 ? best : null;
        if (noor.target && !noor.digging) say('noor-lead:' + best.k, '«نوّور» شمّ شي تحت الأرض… امشِ وراه!', 4200, 200);
        else if (!noor.target && best) say('noor-far', '«نوّور» يشمّ كنز بعيد صوب ' + WAY(best.x - p.x, best.z - p.z) + '.', 4200, 120);
      }
      const t = noor.target;
      if (t) {
        const dt2 = Math.hypot(t.x + 0.5 - noor.x, t.z + 0.5 - noor.z);
        if (dt2 > 1.0) {
          // leads, but never runs off: it waits when the player falls behind
          if (d < 9) moving = stepTo(t.x + 0.5, t.z + 0.5, 3.6, dt) > 0.05;
        } else {
          noor.digging = t;
          if (Math.hypot(t.x - p.x, t.z - p.z) < 8) say('noor-dig:' + t.k, '«نوّور» يحفر هني… الكنز تحت! احفر تحته (' + Math.max(1, Math.round(noor.y - t.y - 1)) + ' مكعبات تقريبًا).', 6000, 60);
        }
      } else {
        const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
        const gx = p.x - fx * 1.6 + fz * 1.3, gz = p.z - fz * 1.6 - fx * 1.3;
        if (Math.hypot(gx - noor.x, gz - noor.z) > 1.2) moving = stepTo(gx, gz, d > 6 ? 6 : 3.4, dt) > 0.05;
      }
    }
    // the picture: hops while it goes, its tail sways, its ears flick; digging, it bobs its head down
    const o = noor.obj, u = o.userData;
    o.position.set(noor.x, noor.y, noor.z); o.rotation.y = noor.yaw;
    const hop = moving ? Math.abs(Math.sin(clock * 9)) * 0.14 : 0;
    u.body.position.y = hop;
    u.tail.rotation.z = Math.sin(clock * 2.3) * 0.25;
    for (const e of u.ears) e.rotation.x = -0.5 + Math.sin(clock * 3.1 + e.position.x * 9) * 0.08;
    u.head.rotation.x = noor.digging ? 0.5 + Math.sin(clock * 12) * 0.25 : 0;
    // its light: the pod glows, and lights the way of a friend
    const pod = u.pod.getWorldPosition(new THREE.Vector3());
    light.position.copy(pod); light.position.y += 0.7;           // above it: the way ahead is lit, not its own fur
    light.intensity = (noor.tame ? 3.2 : 1.6) * (0.9 + 0.1 * Math.sin(clock * 5));
  }

  // ------------------------------------------------------------------ 4. clock rooms
  function gearUse(h) {
    if (h.id < B.GEAR0 || h.id > B.GEAR3) return false;
    const f = near.find((q) => q.kind === 'ruin' && q.gears.some((g) => g.x === h.x && g.y === h.y && g.z === h.z));
    if (!f) return false;
    play.put(h.x, h.y, h.z, B.GEAR0 + ((h.id - B.GEAR0 + 1) % 4));
    if (play.sound && play.sound.place) play.sound.place();
    const ok = f.gears.every((g, i) => world.get(g.x, g.y, g.z) === B.GEAR0 + f.target[i]);
    if (ok && world.get(f.door[0].x, f.door[0].y, f.door[0].z) === B.SECRET) {
      for (const c of f.door) { play.remoteDig(c.x, c.y, c.z); if (play.net && play.net.dig) play.net.dig(c.x, c.y, c.z); }
      stock('vault:' + f.key, f.chest, [[K.DIAMOND, 3], [K.GOLD, 5], [K.RUBY, 2], [K.EMERALD, 2], [K.LUCKY, 1], [K.GOLDEN_APPLE, 1]]);
      st.clockRooms = (st.clockRooms || 0) + 1;
      say('vault:' + f.key, 'طق… طق… طق! التروس تركّبت والجدار انفتح: غرفة سرّية فيها صندوق، وممر الزمن يلمع في آخرها.', 7500, 0, true);
    }
    return true;
  }
  const TIMES = ['sunset', 'night', 'morning'], TIME_NAME = { sunset: 'الغسق', night: 'الليل', morning: 'الصبح' };
  let inGate = false;
  function ruins() {
    const p = st.pos;
    for (const f of near) {
      if (f.kind !== 'ruin') continue;
      const r = f.room, inside = p.x > r.x0 && p.x < r.x1 + 1 && p.z > r.z0 && p.z < r.z1 + 1;
      const open = world.get(f.door[0].x, f.door[0].y, f.door[0].z) !== B.SECRET;
      if (!open && Math.hypot(f.x - p.x, f.z - p.z) < 14) say('ruin-near:' + f.key, 'أطلال قديمة… وفي داخلها غرفة تطلع منها لمعة تروس.', 4500, 200);
      if (inside && !open) say('ruin:' + f.key, 'تروس تلمع في الجدار! اضغط على كل ترس عشان يلف، وخلّ سنّه المضيء يأشّر مثل عقرب الساعة اللي فوقه على الجدار المقابل (فوق الباب).', 8500, 60);
    }
    // the passage of time: stepping into it moves the time of day on
    const fx = Math.floor(p.x), fz = Math.floor(p.z), fy = Math.floor(p.y + 0.1);
    const here = world.get(fx, fy, fz) === B.TIMEGATE || world.get(fx, fy + 1, fz) === B.TIMEGATE;
    if (here && !inGate && weather) {
      const now = (window.__GAME_SKY && window.__GAME_SKY.time) || 'sunset', next = TIMES[(TIMES.indexOf(now) + 1) % TIMES.length] || 'night';
      weather.set(next, !!(window.__GAME_SKY && window.__GAME_SKY.rain));
      say('gate', 'ممر الزمن! الوقت صار ' + TIME_NAME[next] + '. ادخله مرّة ثانية عشان يتغيّر.', 4200, 0, true);
      st.timeTravel = (st.timeTravel || 0) + 1;
    }
    inGate = here;
  }

  // ------------------------------------------------------------------ the place button
  play.onUseFirst((h) => {
    const q = st.slots[st.sel];
    refresh();
    if (useOnNoor(q)) return true;
    if (!h) return false;
    if (h.id === B.SOCKET) {
      const f = near.find((t) => t.kind === 'tower' && t.socket.x === h.x && t.socket.y === h.y && t.socket.z === h.z);
      if (!f) return false;
      const gem = has([K.ORE, K.AMETHYST, K.GEM]);
      if (!gem) { say('socket-empty', 'المقبس يبي خام متوهّج. اكسر الصخر اللي يلمع جنب المنارة (بالمعول) وارجع.', 5000, 0, true); return true; }
      take(gem); lightTower(f);
      return true;
    }
    if (h.id === B.SOCKET_LIT || h.id === B.BEACON_LIT) { say('lit-already', 'المنارة والعة.', 2000, 0, true); return true; }
    return gearUse(h);
  });

  return {
    get fog() { return fog; },
    noor,
    update(dt) {
      clock += dt;
      if (clock - nearAt > 0.5) refresh();
      glimmer(dt);
      towers(dt);
      noorTick(dt);
      ruins();
      glimGhost.material.opacity = 0.05 + 0.04 * Math.sin(clock * 2.6);
    },
    /** For checks: every feature within r of (x, z). */
    near: (r = 400) => endless.featuresNear(st.pos.x, st.pos.z, r),
  };
}
