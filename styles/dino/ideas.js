// The wonders of the world of the dinosaurs (the owner's «أفكار مبتكرة لتطوير عالم الديناصورات»), made to work here.
// The towers and the fossil caves are made by gen.js; the blocks are in blocks.js, their pictures in tiles.js, the
// hatchlings in shared/dinos.js.
//
//   فقاسة الديناصورات البركانية  a wild nest dug gives an egg (green, blue, red, or a rare gold); the nest put on warm volcanic
//                                rock becomes a warm nest; an egg put in it hatches after a minute into a little dinosaur
//                                that follows its keeper and has a gift: it heals, it speeds swimming, it shields from the
//                                lava, or it digs up amber and gold
//   أبراج الرنين الصوتي          the stone at the foot of an ancient tower rings: a wave of sound calms the hunters round
//                                about for two minutes, and calls the gentle giants to come and help fight them
//   مناطيد العنبر المضيء          resin falls from the giant trees; six make an amber balloon that rises and drifts over the
//                                highlands and the craters, safe from the lava, lifted by its heat
//   جسور الكهرمان المتفاعلة       amber put on lava hardens with it into a path to walk on; behind a moat of lava on each
//                                volcano's flank, a fossil cave with rare finds
//
//   const ideas = createIdeas({ play, kit, life, gen, world, terrain, scene, vitals: () => vitals });
//   ideas.placed(x, y, z, id)   from the world's onPlace;   ideas.lavaFactor   how much the lava burns now (a red hatchling shields)

import * as THREE from 'three';
import { K, kitItem } from '../../shared/kit.js';
import { EMPTY } from '../../shared/play.js';
import { HATCH } from '../../shared/dinos.js';
import { B, ITEM } from '../barari/blocks.js';
import { dirName } from '../barari/ideas.js';

const load = (k, d) => { try { const v = JSON.parse(window.localStorage.getItem(k) || 'null'); return v ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage may be closed: kept for this visit only */ } };
const dayKey = (d = new Date()) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();

const EGGS = [
  { name: 'بيضة ديناصور خضرا', power: 'يرجّع لك صحتك شوي شوي وهو جنبك' },
  { name: 'بيضة ديناصور زرقا', power: 'تسبح أسرع وهو جنبك' },
  { name: 'بيضة ديناصور حمرا', power: 'الحمم ما تحرقك وايد وهو جنبك' },
  { name: 'بيضة ديناصور ذهبية', power: 'يحفر لك كهرمان وذهب كل شوي' },
];
export const eggItem = (i, n = 1) => ({ id: ITEM.EGG + i, key: 'egg-' + i, name: EGGS[i].name, n, use: 'dinoEgg', egg: i, icon: 'egg' + i });
const resinItem = (n = 1) => ({ id: ITEM.RESIN, key: 'resin', name: 'صمغ الشجر العملاق', n, use: 'amberResin', icon: 'resin' });
const balloonItem = () => ({ id: ITEM.BALLOON, key: 'balloon', name: 'منطاد العنبر', n: 1, tool: true, use: 'amberBalloon', icon: 'balloon' });
const HATCH_MS = 60000, RESIN_NEED = 6;
const GIANTS = new Set(['longneck', 'threehorn', 'plated']);

export function createIdeas(o) {
  const { play, kit, life, gen, world, scene } = o, st = play.state;
  const api = { lavaFactor: 1, digFactor: 1 };
  const guest = () => !!(life && life.share && life.share.mode === 'guest');
  const itemOfBlock = (id, n = 1) => { const it = play.itemOf ? play.itemOf(id) : null; return it ? { ...it, n } : null; };
  const give = (it) => it && play.give(it);
  const near = (x, z, r) => Math.hypot(st.pos.x - x, st.pos.z - z) < r;
  /** Make a creature of `key` near (x, z) whatever land it is (the hatchery's young, a giant called by a tower). */
  function spawnFree(key, x, z) {
    const k = life.kinds.find((q) => q.key === key);
    if (!k) return null;
    const wh = Object.getOwnPropertyDescriptor(k, 'where');
    k.where = null;
    try { for (let i = 0; i < 10; i++) { const a = Math.random() * 6.283, r = i ? 1.5 + Math.random() * 3 : 0, e = life.spawnAt(key, x + Math.cos(a) * r, z + Math.sin(a) * r); if (e) return e; } return null; }
    finally { if (wh) Object.defineProperty(k, 'where', wh); else delete k.where; }
  }
  const count = (id) => [...st.slots, ...st.pack].reduce((s, q) => s + (q && !q.empty && q.id === id ? q.n || 0 : 0), 0);
  function take(id, n) {
    for (const list of [st.slots, st.pack]) for (let i = 0; i < list.length && n > 0; i++) {
      const q = list[i];
      if (!q || q.empty || q.id !== id) continue;
      const k = Math.min(q.n || 0, n); q.n -= k; n -= k;
      if (q.n <= 0) list[i] = list === st.slots ? EMPTY : null;
    }
    play.changed();
  }

  // ================================================================ the volcanic hatchery
  const incub = load('bw-dino-eggs', []).filter((q) => q && [q.x, q.y, q.z, q.i, q.t0].every(Number.isFinite));
  const babies = load('bw-dino-babies', []).filter((q) => q && Number.isFinite(q.c)).slice(0, 8);
  const keepEggs = () => save('bw-dino-eggs', incub), keepBabies = () => save('bw-dino-babies', babies.map((b) => ({ c: b.c })));
  // warm: volcanic rock under it, lava near, or warm blocks put right around it (fire, a torch, a furnace, lava, volcanic rock)
  const WARM = new Set([B.LAVA, B.BASALT, B.ASH, K.FIRE, K.FURNACE, K.TORCH]);
  const warmAround = (x, y, z) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy || dz) && WARM.has(world.get(x + dx, y + dy, z + dz))) return true; return false; };
  const warmRock = (x, y, z) => {
    const under = world.get(x, y - 1, z);
    if (under === B.BASALT || under === B.ASH || warmAround(x, y, z)) return true;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 1; dy++) if (world.get(x + dx, y + dy, z + dz) === B.LAVA) return true;
    return false;
  };
  const pickEgg = () => { const r = Math.random(); return r < 0.55 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : 3; };
  let nestSaid = false, healT = 3, goldT = 50, rideMine = false, swimWas = null;
  function hatch(q) {
    play.put(q.x, q.y, q.z, B.WARM_NEST);
    incub.splice(incub.indexOf(q), 1); keepEggs();
    const b = { c: q.i, e: null };
    babies.push(b); if (babies.length > 8) babies.shift();
    keepBabies();
    b.e = spawnFree('hatch-' + HATCH[q.i][0], q.x + 0.5, q.z + 0.5);
    st.hatched = (st.hatched || 0) + 1; st.xp = (st.xp || 0) + 15;
    play.notice('فقست البيضة! ' + HATCH[q.i][1] + ' صار يمشي وراك (+15 خبرة): ' + EGGS[q.i].power + '.', false, 6500);
    if (play.sound && play.sound.level) play.sound.level();
  }
  function babyTick(dt) {
    let red = false, inWaterBlue = false;
    for (const b of babies) {
      const e = b.e;
      if (!e || e.dead || !life.ents.includes(e)) { b.e = st.played > 4 ? spawnFree('hatch-' + HATCH[b.c][0], st.pos.x + 2, st.pos.z + 2) : null; continue; }
      e.hatch = true; e.love = 1e6; e.tamed = true; e.owner = null; e.flee = 0;
      const d = Math.hypot(e.x - st.pos.x, e.z - st.pos.z);
      if (d > 10) continue;
      if (b.c === 0 && (healT -= dt) <= 0) { healT = 3; const v = o.vitals && o.vitals(); if (v && v.values.hp < 100) v.values.hp = Math.min(100, v.values.hp + 2); }
      if (b.c === 1 && st.inWater) inWaterBlue = true;
      if (b.c === 2) red = true;
      if (b.c === 3 && (goldT -= dt) <= 0) { goldT = 50; const am = Math.random() < 0.6; if (give(am ? itemOfBlock(B.AMBER, 1) : kitItem(K.GOLD, 1))) play.notice(HATCH[3][1] + ' حفر لك ' + (am ? 'كهرمان' : 'ذهب') + '!', false, 2600); }
    }
    api.lavaFactor = red ? 0.3 : 1;
    if (inWaterBlue && (!st.ride || rideMine)) { if (!rideMine) { swimWas = play.tuning.swim; play.tuning.swim = 5.6; } st.ride = 2.3; rideMine = true; }
    else if (rideMine) { st.ride = 0; rideMine = false; if (swimWas !== null) play.tuning.swim = swimWas; }
  }

  // ================================================================ the towers of resonance
  const towersFound = new Set(load('bw-dino-towers', []));
  const rang = new Map();                       // tower key -> st.time when it may ring again
  // the hunters, calmed: their own kinds, made now in the same order everywhere (a shared game names a creature's kind by its place in this list)
  const calmOf = new Map();
  if (life) for (const k of [...life.kinds]) if (k.kind === 'monster') { const c = { ...k, kind: 'animal', tame: false, max: 0, calm: true, name: k.name + ' (هادي)' }; calmOf.set(k, c); life.kinds.push(c); }
  const waves = [];
  const waveGeo = new THREE.RingGeometry(0.86, 1, 72);
  function wave(x, y, z, delay) {
    const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: 0x7ff6e6, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.visible = false; m.frustumCulled = false; scene.add(m);
    waves.push({ m, t: -delay });
  }
  function ring(T) {
    if ((rang.get(T.key) || -1) > st.time) { play.notice('الحجر للحين يرنّ… استنى شوي وجرّب مرة ثانية.', false, 2200); return; }
    rang.set(T.key, st.time + 45);
    for (let i = 0; i < 3; i++) { wave(T.bell.x + 0.5, T.bell.y + 0.6, T.bell.z + 0.5, i * 0.45); wave(T.x + 0.5, T.y + T.H + 1, T.z + 0.5, i * 0.45 + 0.2); }
    if (play.sound) (play.sound.level || play.sound.ui)();
    st.rung = (st.rung || 0) + 1;
    if (guest()) { play.notice('رنّ البرج! (الوحوش في الغرفة يتحكم فيها صاحب الغرفة.)', false, 3200); return; }
    let calmed = 0, helpers = 0;
    for (const e of life.ents) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - T.x, e.z - T.z);
      if (e.k.kind === 'monster' && d < 80 && calmOf.has(e.k)) { e.calmFrom = e.k; e.k = calmOf.get(e.k); e.calmEnd = st.time + 120; e.flee = 0; calmed++; }
      else if (GIANTS.has(e.k.key) && d < 90) { e.tamed = true; e.love = 240; e.owner = null; e.flee = 0; e.giant = true; helpers++; }
    }
    if (!helpers) { const g = spawnFree('longneck', T.x + 6, T.z + 6); if (g) { g.tamed = true; g.love = 240; g.owner = null; g.giant = true; helpers = 1; } }
    play.notice('رنّ برج الرنين! ' + (calmed ? 'هدت الوحوش حولك دقيقتين. ' : 'أي وحش حولك يهدا دقيقتين. ') + (helpers ? 'والعملاق جاي يمشي وراك ويساعدك على الوحوش.' : ''), false, 6000);
  }
  let giantT = 0;
  function towerTick(dt) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const W = waves[i]; W.t += dt;
      if (W.t < 0) continue;
      W.m.visible = true;
      const s = 1 + W.t * 26; W.m.scale.set(s, s, s); W.m.material.opacity = Math.max(0, 0.8 * (1 - W.t / 2.6));
      if (W.t > 2.6) { scene.remove(W.m); W.m.material.dispose(); waves.splice(i, 1); }
    }
    if (guest()) return;
    for (const e of life.ents) if (e.calmFrom && (st.time > e.calmEnd || e.dead)) { e.k = e.calmFrom; e.calmFrom = null; }
    // the giants that answered help: a hunter near one of them is struck
    if ((giantT -= dt) > 0) return;
    giantT = 1.2;
    for (const g of life.ents) {
      if (!g.giant || g.dead || !g.tamed || !(g.love > 0)) continue;
      for (const m of life.ents) if (!m.dead && m.k.kind === 'monster' && Math.hypot(m.x - g.x, m.z - g.z) < g.k.radius + 3) { life.hurtEntity(m, 8); break; }
    }
  }

  // ================================================================ the amber balloon
  let riding = false, tuned = null, wind = { x: 0.7, z: 0.35 }, heatSaid = false, scanT = 0, hot = false, resinSaid = false;
  const balloon = new THREE.Group();
  {
    const amber = new THREE.MeshStandardMaterial({ color: 0xf0a030, emissive: 0x8a4200, emissiveIntensity: 0.7, roughness: 0.4, transparent: true, opacity: 0.93 });
    const band = new THREE.MeshStandardMaterial({ color: 0xa85a10, emissive: 0x4a2000, emissiveIntensity: 0.5, roughness: 0.6 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.9 }), rope = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.9 });
    const env = new THREE.Mesh(new THREE.SphereGeometry(1.8, 20, 14), amber); env.scale.set(1, 1.22, 1); env.position.y = 5.2; balloon.add(env);
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.81, 0.05, 6, 30), band); r.rotation.y = i * Math.PI / 4; r.scale.set(1, 1.22, 1); r.position.y = 5.2; balloon.add(r); }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 0.5, 12), band); neck.position.y = 2.95; balloon.add(neck);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.5, 0.035), rope); r.position.set(sx * 0.48, 1.8, sz * 0.48); r.rotation.set(-sz * 0.1, 0, sx * 0.1); balloon.add(r);
      const w = new THREE.Mesh(new THREE.BoxGeometry(sx === sz ? 1.1 : 0.06, 0.55, sx === sz ? 0.06 : 1.1), wood); w.position.set(sx === sz ? 0 : sx * 0.55, 0.28, sx === sz ? sz * 0.55 : 0); balloon.add(w);
    }
    balloon.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
    balloon.visible = false; scene.add(balloon);
  }
  function startRide() {
    if (st.boat) { play.notice('انزل من القارب أول.', false, 2000); return; }
    riding = true; tuned = { fly: play.tuning.fly, flyFast: play.tuning.flyFast, flyRise: play.tuning.flyRise };
    play.tuning.fly = 4.2; play.tuning.flyFast = 6.5; play.tuning.flyRise = 3.2;
    play.setFlying(true);
    const a = Math.random() * 6.283; wind = { x: Math.cos(a) * 0.8, z: Math.sin(a) * 0.8 };
    balloon.visible = true; st.ballooned = (st.ballooned || 0) + 1;
    play.notice('ركبت منطاد العنبر! ' + (play.touch || window.matchMedia('(pointer: coarse)').matches ? 'زر النط يرفعه وزر «نزول» ينزّله.' : 'المسافة ترفعه وShift ينزّله.') + ' الريح تسحبه شوي، وفوق الحمم الحرارة ترفعه. ما تحترق وانت فيه. زر البناء مرة ثانية ينزّلك.', false, 7000);
  }
  function endRide(say = true) {
    if (!riding) return;
    riding = false; balloon.visible = false;
    if (tuned) Object.assign(play.tuning, tuned);
    tuned = null; hot = false;
    if (st.flying) play.setFlying(false);
    if (say) play.notice('نزلت من المنطاد. تقدر تركبه مرة ثانية متى ما تبي.', false, 2600);
  }
  const free = (x, y, z) => { for (let dy = 0; dy < 2; dy++) { const id = world.get(Math.floor(x), Math.floor(y + dy), Math.floor(z)); if (id && play.isSolid(id)) return false; } return true; };
  function rideTick(dt) {
    if (!riding) return;
    if (!st.flying) { endRide(); return; }
    const p = st.pos;
    if (free(p.x + wind.x * dt, p.y, p.z + wind.z * dt)) { p.x += wind.x * dt; p.z += wind.z * dt; }
    if ((scanT -= dt) <= 0) {
      scanT = 0.3; hot = false;
      for (let y = Math.floor(p.y); y > Math.max(0, p.y - 26); y--) { const id = world.get(Math.floor(p.x), y, Math.floor(p.z)); if (id === B.LAVA) { hot = true; break; } if (id && play.isSolid(id)) break; }
      if (hot && !heatSaid) { heatSaid = true; play.notice('الحرارة اللي تطلع من الحمم ترفع المنطاد فوق!', false, 3000); }
    }
    if (hot && p.y < world.sy + 30 && free(p.x, p.y + 2.5 * dt + 0.2, p.z)) p.y += 2.5 * dt;
    balloon.position.set(p.x, p.y, p.z); balloon.rotation.y = Math.sin(st.time * 0.4) * 0.15;
  }

  // ================================================================ amber on lava, and the fossil caves
  const fossilFound = new Set(load('bw-dino-fossils', []));
  let bridgeSaid = false, fossils = [], fossilsAt = null, towers = [], towersAt = null;
  const said = new Set();
  function harden(x, y, z) {
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), [ax, az] = Math.abs(fx) >= Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz)];
    const starts = [];
    if (world.get(x, y - 1, z) === B.LAVA) starts.push([x, y - 1, z]);
    for (const [dx, dz] of [[ax, az], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (!starts.length && world.get(x + dx, y, z + dz) === B.LAVA) starts.push([x + dx, y, z + dz]);
    if (!starts.length) return false;
    const [sx, sy0, sz] = starts[0];
    let n = 0, sy = sy0;
    for (let s = 0; s < 6; s++) {
      const cx = sx + ax * s, cz = sz + az * s;
      // the lava ahead, at this height or a step up or down (it runs down the slopes)
      const ly = [sy, sy + 1, sy - 1].find((y) => world.get(cx, y, cz) === B.LAVA);
      if (ly === undefined) { if (s > 0 && play.isSolid(world.get(cx, sy, cz))) break; continue; }
      sy = ly;
      for (const w of [0, 1, -1]) {                      // a path three wide over the lava ahead
        const qx = cx + (az ? w : 0), qz = cz + (ax ? w : 0);
        if (world.get(qx, sy, qz) === B.LAVA && (w === 0 || s > 0)) { play.put(qx, sy, qz, B.AMBER_PATH); n++; }
      }
    }
    play.remoteDig(x, y, z);                       // the amber itself went into the path
    if (play.net && play.net.dig) play.net.dig(x, y, z);
    st.bridges = (st.bridges || 0) + n;
    if (!bridgeSaid) { bridgeSaid = true; play.notice('الكهرمان لمس الحمم وتصلّب: صار جسر تمشي عليه! كل كهرمان يسوي ممر قدّامك.', false, 5200); }
    if (play.sound) play.sound.place();
    return true;
  }
  function fillFossil(F) {
    const k = 'bw-dino-fossil-' + F.key;
    if (load(k, '') === dayKey()) return;
    const box = kit.chestAt(F.chest.x, F.chest.y, F.chest.z);
    if (box.some(Boolean)) return;
    const R = Math.random, loot = [itemOfBlock(B.AMBER, 3), itemOfBlock(B.FOSSIL, 2), kitItem(K.EMERALD, 2), R() < 0.5 ? eggItem(3) : eggItem(2), resinItem(2)];
    if (R() < 0.35) loot.push(kitItem(K.DIAMOND, 1));
    if (R() < 0.3) loot.push(kitItem(K.LUCKY, 1));
    loot.filter(Boolean).forEach((it, j) => { box[j * 2] = it; });
    save(k, dayKey());
  }

  // ================================================================ the place button, what is dug and put down, every frame
  play.onUseFirst((h) => {
    const s = st.slots[st.sel];
    if (h && h.id === B.RESO_BELL) { const T = gen.towersNear(h.x, h.z, 6)[0]; if (T) ring(T); return true; }
    if (s && !s.empty && s.use === 'dinoEgg') {
      if (h && h.id === B.WARM_NEST) {
        play.put(h.x, h.y, h.z, B.EGG_NEST + s.egg);
        if (!incub.some((q) => q.x === h.x && q.y === h.y && q.z === h.z)) { incub.push({ x: h.x, y: h.y, z: h.z, i: s.egg, t0: Date.now() }); keepEggs(); }      // (placed() may have noted it already)
        s.n--; play.setSlot(st.sel, s.n > 0 ? s : EMPTY);
        play.notice('حطيت ' + s.name + ' في العش الدافي… تفقس بعد دقيقة. خلك قريب منها.', false, 4500);
        return true;
      }
      play.notice('البيضة تبي عش دافي: حط عش البيض على الصخر البركاني الأسود (قرب البركان أو الحمم)، وبعدين حط البيضة فيه.', false, 5200);
      return true;
    }
    if (s && !s.empty && s.use === 'amberResin') {
      const n = count(ITEM.RESIN);
      if (n < RESIN_NEED) { play.notice('عندك ' + n + ' صمغ. تبي ' + RESIN_NEED + ' عشان تسوي منطاد العنبر. الصمغ يطيح من جذوع الشجر العملاق.', false, 3600); return true; }
      take(ITEM.RESIN, RESIN_NEED); give(balloonItem());
      play.notice('سوّيت منطاد العنبر! اختاره من مربعاتك واضغط زر البناء وتركبه.', false, 4500);
      if (play.sound && play.sound.level) play.sound.level();
      return true;
    }
    if (s && !s.empty && s.use === 'amberBalloon') { if (riding) endRide(); else startRide(); return true; }
    return false;
  });
  play.onBreakAny((h) => {
    if (h.remote) return;
    if (h.id === B.NEST) {
      const i = pickEgg();
      give(eggItem(i));
      play.notice('لقيت ' + EGGS[i].name + (i === 3 ? ' (نادرة!)' : '') + '! خذ العش بعد: حطه على صخر بركاني أسود يصير عش دافي، وحط البيضة فيه وتفقس.', false, 6500);
    } else if (h.id >= B.EGG_NEST && h.id <= B.EGG_NEST + 3) {
      give(eggItem(h.id - B.EGG_NEST));
      const q = incub.find((e) => e.x === h.x && e.y === h.y && e.z === h.z); if (q) { incub.splice(incub.indexOf(q), 1); keepEggs(); }
    } else if (h.id === B.JUNGLE_LOG) {
      // the giant trees (trunks two wide) bleed resin; any other log only now and then
      const wide = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => world.get(h.x + a, h.y, h.z + b) === B.JUNGLE_LOG).length >= 2;
      if (Math.random() < (wide ? 0.6 : 0.06)) {
        give(resinItem(1));
        if (!resinSaid) { resinSaid = true; play.notice('طاح صمغ من الشجرة العملاقة! جمّع ' + RESIN_NEED + ' صمغ، اختاره واضغط زر البناء: تسوي منطاد العنبر وتطير فوق البراكين.', false, 6500); }
      }
    }
  });
  let placedSeen = st.placed;
  api.placed = (x, y, z, id) => {
    const local = st.placed !== placedSeen;      // put down by this player's own hand (not read back from the save, not a friend's)
    placedSeen = st.placed;
    if (id >= B.EGG_NEST && id <= B.EGG_NEST + 3 && !incub.some((q) => q.x === x && q.y === y && q.z === z)) { incub.push({ x, y, z, i: id - B.EGG_NEST, t0: Date.now() }); keepEggs(); }
    if (!local) return;
    if (id === B.NEST) {
      if (warmRock(x, y, z)) { play.put(x, y, z, B.WARM_NEST); play.notice('صار عش دافي على الصخر البركاني! حط فيه بيضة ديناصور (اختارها واضغط زر البناء على العش).', false, 5200); }
      else if (!nestSaid) { nestSaid = true; play.notice('العش يبي دفا عشان يفقّس: حطه على الصخر الأسود قرب البركان، أو حط جنبه نار أو مشعل أو فرن أو حمم.', false, 5000); }
    } else if (id === B.AMBER) harden(x, y, z);
    if (WARM.has(id)) {          // a warm block put beside a nest: the nest warms
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (world.get(nx, ny, nz) === B.NEST) { play.put(nx, ny, nz, B.WARM_NEST); play.notice('دفّيت العش! صار عش دافي: حط فيه بيضة ديناصور (اختارها واضغط زر البناء على العش) وتفقس بعد دقيقة.', false, 5200); }
      }
    }
  };
  let slow = 0;
  play.onTick((s, dt) => {
    if (dt <= 0) return;
    rideTick(dt);
    if (life) towerTick(dt);
    if (life && !guest()) babyTick(dt);
    if ((slow -= dt) > 0) return;
    slow = 0.5;
    const p = st.pos, now = Date.now();
    for (const q of [...incub]) {
      if (!near(q.x, q.z, 90)) continue;
      if (world.get(q.x, q.y, q.z) !== B.EGG_NEST + q.i) { if (near(q.x, q.z, 60)) { incub.splice(incub.indexOf(q), 1); keepEggs(); } continue; }
      if (now - q.t0 >= HATCH_MS && near(q.x, q.z, 48) && !guest()) hatch(q);
    }
    if (!towersAt || Math.hypot(p.x - towersAt.x, p.z - towersAt.z) > 50) { towersAt = { x: p.x, z: p.z }; towers = gen.towersNear(p.x, p.z, 900); }
    for (const T of towers) if (near(T.x, T.z, 36) && !towersFound.has(T.key)) { towersFound.add(T.key); save('bw-dino-towers', [...towersFound]); play.notice('برج حجر قديم وفوقه بلورة تلمع… عند رجله حجر الرنين: اضغط عليه زر البناء ويرنّ، ويهدّي الوحوش ويناديلك العملاق.', false, 7000); }
    if (!fossilsAt || Math.hypot(p.x - fossilsAt.x, p.z - fossilsAt.z) > 60) { fossilsAt = { x: p.x, z: p.z }; fossils = gen.fossilsNear(p.x, p.z, 1500); }
    for (const F of fossils) {
      if (near(F.x, F.z, 30) && !said.has(F.key)) { said.add(F.key); play.notice('كهف أحافير ورا بحيرة حمم! حط كهرمان على الحمم ويتصلّب جسر تعبر عليه.' + (count(B.AMBER) ? '' : ' (الكهرمان في الصخر الأحمر والكهوف.)'), false, 6500); }
      if (near(F.x, F.z, 6) && Math.abs(p.y - F.y) < 4) {
        if (!fossilFound.has(F.key)) { fossilFound.add(F.key); save('bw-dino-fossils', [...fossilFound]); st.xp = (st.xp || 0) + 25; play.notice('دخلت كهف الأحافير! (+25 خبرة) افتح الصندوق: فيه أشياء نادرة.', false, 5000); if (play.sound && play.sound.level) play.sound.level(); }
        fillFossil(F);
      }
    }
  });

  // ================================================================ the quests page
  const where = (x, z) => { const dx = x - st.pos.x, dz = z - st.pos.z; return Math.round(Math.hypot(dx, dz)) + ' مكعب جهة ' + dirName(dx, dz); };
  api.page = () => {
    const T = towers[0], F = fossils[0], hatched = babies.length, eggs = incub.length, resin = count(ITEM.RESIN);
    return '<h3>أسرار عالم الديناصورات</h3><ol class="quests">'
      + `<li class="${hatched ? 'done' : 'now'}">فقاسة الديناصورات البركانية<small>اكسر عش البيض البري (في الغابة وسهل السرخس) وتلقى بيضة: خضرا، زرقا، حمرا، أو ذهبية نادرة. حط العش على الصخر البركاني الأسود يصير دافي، وحط البيضة فيه: تفقس بعد دقيقة.${eggs ? ' عندك ' + eggs + ' بيضة تدفى.' : ''}${hatched ? ' صغارك: ' + hatched + '.' : ''}</small></li>`
      + `<li class="${towersFound.size ? 'done' : 'now'}">أبراج الرنين الصوتي<small>برج حجر قديم فوقه بلورة. حجر الرنين عند رجله يهدّي الوحوش دقيقتين ويناديلك العملاق يساعدك.${T ? ' أقرب برج: ' + where(T.x, T.z) + '.' : ''}</small></li>`
      + `<li class="${st.ballooned ? 'done' : 'now'}">مناطيد العنبر المضيء<small>الصمغ يطيح من جذوع الشجر العملاق (اللي جذعها عريض). ${RESIN_NEED} صمغ = منطاد: اختار الصمغ واضغط زر البناء. تطير فيه فوق البراكين بأمان.${resin ? ' عندك ' + resin + ' صمغ.' : ''}</small></li>`
      + `<li class="${fossilFound.size ? 'done' : 'now'}">جسور الكهرمان<small>حط كهرمان على الحمم ويتصلّب ممر تمشي عليه. على جنب كل بركان كهف أحافير ورا الحمم، فيه أشياء نادرة.${F ? ' أقرب كهف: ' + where(F.x, F.z) + '.' : ''}</small></li></ol>`;
  };
  api.ring = ring; api.hatchNow = () => { for (const q of incub) q.t0 = 0; }; api.babies = babies; api.incub = incub;
  api.riding = () => riding; api.startRide = startRide; api.endRide = endRide;
  return api;
}
