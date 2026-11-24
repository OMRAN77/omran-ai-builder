// The wonders of "kawkab", each found by walking up to it (a notice says what it is when the player comes near):
//
//   the garden of the singing crystals   on the rim above the lake: five crystals sing a tune when the player
//                                        comes close; touched (the place button) in the order they sang, they open
//                                        the secret hatch of the base. Under it: a lit room with a chest.
//   the gravity pads                     violet pads on the ground: standing on one throws the player high and the
//                                        fall is slow until they land, enough to reach the floating asteroids. One
//                                        stands by the asteroid of the home, which has a chest on its crown.
//   the surveyor's charging station      on the plateau: three sky crystals fill each of its four sockets; once all
//                                        are lit the surveyor flies beside the player, lasers whatever they dig
//                                        (faster) and digs out the ore round them by itself.
//   the meteor bridge                    a glowing meteor falls on the stone by the sea north of the home every few
//                                        minutes and lays a bridge of meteor rock and star stone out to an island
//                                        that is there only while the bridge stands, with a chest and a lucky box.
//
// What must last is kept in the world itself, so it is saved and shared like any block: the hatch is dug open, the
// sockets are lit blocks, the asteroid's chest marks itself with a star stone. The bridge and its island are set
// for a while without being saved or sent.
import * as THREE from 'three';
import { K, kitItem } from '../../shared/kit.js';
import { B, CHIMES } from './blocks.js';
import { SPOTS, SEA } from './world.js';
import { halo } from './props.js';

const TUNE = [0, 2, 1, 4, 3];                                  // the order the garden sings (indices of the crystals, low to high)
const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0];         // a five-note scale: any order sounds like a tune
const ORES = new Set([B.ORE, B.ORE_V, K.ROCK_COAL, K.ROCK_GOLD, K.ROCK_DIAMOND, K.ROCK_EMERALD, K.ROCK_RUBY, K.ROCK_AMETHYST]);
/** Blocks of the wonders that the drill does not take (they would leave the wonder broken). */
export const FIXED = new Set([...CHIMES, B.SEAL, B.GRAV, B.CHARGER, B.SOCKET, B.SOCKET_LIT]);

/** A few tones of our own (the shared sounds have no notes): made on first use, quiet when the game is muted. */
function makeSynth(muted) {
  let ctx = null, out = null;
  const ok = () => {
    if (muted()) return false;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { ctx = new AC(); out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination); } catch (e) { ctx = null; return false; }      // no sound here: the wonders work silently
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => null);
    return true;
  };
  function bell(f, when = 0, dur = 1.6, gain = 0.16) {
    if (!ok()) return;
    const t = ctx.currentTime + when;
    for (const [m, g] of [[1, 1], [2.76, 0.32], [5.4, 0.12]]) {          // a glassy bell: a few bright partials that fade
      const o = ctx.createOscillator(), a = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * m;
      a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(gain * g, t + 0.01); a.gain.exponentialRampToValueAtTime(0.0001, t + dur / m);
      o.connect(a); a.connect(out); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  function sweep(f0, f1, dur, gain = 0.12, type = 'triangle', when = 0) {
    if (!ok()) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), a = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(gain, t + 0.02); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(a); a.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function boom(when = 0) {
    if (!ok()) return;
    const t = ctx.currentTime + when, n = ctx.sampleRate * 1.4, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), a = ctx.createGain();
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(80, t + 1.2);
    a.gain.value = 0.5; src.connect(lp); lp.connect(a); a.connect(out); src.start(t);
  }
  return { bell, sweep, boom };
}

/**
 * o: { play, kit, world, terrain, gen, anchors, scene, camera, hud, drone, laserOf(), dropOf(id), onTips() }
 * Returns { update(dt), nav (where the compass points now, or null), droneOwned(), locked(x, y, z), state }.
 */
export function createWonders(o) {
  const { play, kit, world, terrain, anchors, scene, hud, drone } = o, st = play.state;
  const synth = makeSynth(() => !!(play.sound && play.sound.muted));
  const notice = (t, ms = 5600) => play.notice(t, false, ms);
  const told = new Set();
  const tell = (key, t, ms) => { if (told.has(key)) return false; told.add(key); notice(t, ms); return true; };
  const dist = (a) => Math.hypot(a.x - st.pos.x, a.z - st.pos.z);
  const api = { nav: null, state: { garden: 'idle', input: [], bridge: null, droneOn: true } };
  const navs = {};                                          // what each wonder would point the compass at (the nearest one wins)
  const dig = (x, y, z) => { if (!world.get(x, y, z)) return; play.remoteDig(x, y, z); if (play.net && play.net.dig) play.net.dig(x, y, z); };

  // ------------------------------------------------------------------ light waves: rings that spread from a point and fade
  const ringGeo = new THREE.RingGeometry(0.86, 1, 48);
  const rings = [];
  function wave(x, y, z, color, size = 6, upright = false) {
    let r = rings.find((q) => !q.mesh.visible);
    if (!r) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      m.frustumCulled = false; scene.add(m); r = { mesh: m, t: 0, size: 1 }; rings.push(r);
    }
    r.mesh.visible = true; r.mesh.position.set(x, y, z); r.mesh.material.color.set(color); r.t = 0; r.size = size;
    r.mesh.rotation.set(upright ? 0 : -Math.PI / 2, 0, 0);
  }
  function waves(dt) {
    for (const r of rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / 1.4;
      if (k >= 1) { r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(0.3 + k * r.size); r.mesh.material.opacity = (1 - k) * (1 - k);
    }
  }

  // ------------------------------------------------------------------ 1. the garden of the singing crystals
  const G = anchors.garden, COLORS = [0x42f0cf, 0x93ef58, 0xffcf45, 0xff69a8, 0xb48cff];
  const glows = G.chimes.map((c, i) => { const h = halo(COLORS[i], 2.4, 0.0001, 'none'); h.position.set(c.x + 0.5, c.top + 0.9, c.z + 0.5); scene.add(h); return { h, t: 0 }; });
  const hatchShut = () => anchors.hatch.some((c) => world.get(c.x, c.y, c.z) === B.SEAL);
  let tuneQ = [], tuneT = 0, singT = 4, sang = false, roomSeen = false, solvedNow = false;
  function ring(k, loud = 1) {
    const c = G.chimes[k];
    synth.bell(NOTES[k], 0, 1.8, 0.15 * loud);
    glows[k].t = 1;
    wave(c.x + 0.5, c.y + 0.2, c.z + 0.5, COLORS[k], 7);
    wave(c.x + 0.5, c.top + 0.6, c.z + 0.5, COLORS[k], 3.5, true);
  }
  function sing() { tuneQ = TUNE.slice(); tuneT = 0.2; api.state.garden = 'singing'; }
  function openHatch() {
    for (const c of anchors.hatch) dig(c.x, c.y, c.z);
    const box = kit.chestAt(anchors.room.chest.x, anchors.room.chest.y, anchors.room.chest.z), own = (id, n) => { const it = play.itemOf ? play.itemOf(id) : null; return it ? { ...it, n } : null; };
    box.fill(null);
    [own(B.CRYSTAL_C, 12), kitItem(K.GEM, 3), kitItem(K.AMETHYST, 4), kitItem(K.EMERALD, 2), kitItem(K.LUCKY, 1), kitItem(K.GOLD, 4)].filter(Boolean).forEach((it, i) => { box[i] = it; });
  }
  function touchChime(k) {
    ring(k);
    st.chimes = (st.chimes || 0) + 1;
    if (!hatchShut() || api.state.garden === 'singing') return;
    const inp = api.state.input;
    inp.push(k);
    if (inp[inp.length - 1] !== TUNE[inp.length - 1]) {
      api.state.input = [];
      synth.sweep(300, 140, 0.45, 0.1, 'sawtooth', 0.25);
      notice('غلط! اسمع البلّورات مرة ثانية، وعيد نفس الترتيب.', 3600);
      singT = 2.2; sang = false;
      return;
    }
    if (inp.length < TUNE.length) return;
    api.state.input = []; api.state.garden = 'open'; solvedNow = true;
    TUNE.forEach((t, i) => synth.bell(NOTES[t] * 2, 0.5 + i * 0.12, 1.4, 0.1));
    for (let i = 0; i < 5; i++) setTimeout(() => ring(i, 0.3), 500 + i * 120);
    openHatch();
    st.gardenSolved = (st.gardenSolved || 0) + 1;
    notice('صح! البلّورات فتحت باب سرّي في القاعدة: فتحة في الأرض جنب البيت الزجاجي. البوصلة تدلّك.', 7000);
    if (play.sound && play.sound.level) play.sound.level();
  }
  function garden(dt) {
    for (const g of glows) { g.t = Math.max(0, g.t - dt * 1.3); g.h.material.opacity = g.t * 0.95; g.h.visible = g.t > 0.01; g.h.scale.setScalar(2 + g.t * 1.6); }
    const d = dist(G), shut = hatchShut();
    if (tuneQ.length) {
      if ((tuneT -= dt) <= 0) { ring(tuneQ.shift(), d < 30 ? 1 : 0.5); tuneT = 0.75; if (!tuneQ.length) { api.state.garden = shut ? 'listen' : 'open'; singT = 14; } }
    } else if (d < 26 && shut && (singT -= dt) <= 0) sing();
    if (d < 26 && shut && !sang) { sang = true; singT = Math.min(singT, 0.5); }
    if (d < 13 && shut) tell('garden', 'البلّورات تغنّي! اسمع ترتيب النغمات، وبعدين المسها بنفس الترتيب (زر البناء على كل بلّورة).', 7000);
    if (d > 40) sang = false;
    // the secret room: the compass points at the open hatch until the player is down in it
    const R = anchors.room;
    if (!shut && solvedNow && !roomSeen) {
      const h = anchors.hatch[0];
      navs.garden = { x: h.x + 1, z: h.z + 1, label: 'الباب السرّي' };
      if (Math.abs(st.pos.x - R.x) < 5 && Math.abs(st.pos.z - R.z) < 5 && st.pos.y < R.floor + 4) {
        roomSeen = true; navs.garden = null; st.secretRoom = (st.secretRoom || 0) + 1;
        notice('لقيت الغرفة السرّية تحت القاعدة! افتح الصندوق: فيه بلّور سماوي للشاحن وجواهر. والبلّور اللي في الجدار ينحفر.', 7000);
        if (play.sound && play.sound.level) play.sound.level();
      }
    } else navs.garden = null;
  }

  // ------------------------------------------------------------------ 2. gravity pads and floating asteroids
  const G0 = play.tuning.gravity;
  let light = false, airT = 0;
  const lift = halo(0xb48cff, 2.2, 0.0001, 'none'); scene.add(lift);
  function gravity(dt) {
    const p = st.pos, under = world.get(Math.floor(p.x), Math.floor(p.y - 0.06), Math.floor(p.z));
    if (under === B.GRAV && st.onGround && !st.flying) {
      st.vel.y = 22; st.onGround = false; light = true; airT = 0;
      play.tuning.gravity = 5.5;
      synth.sweep(180, 900, 0.7, 0.14); wave(Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.05, Math.floor(p.z) + 0.5, 0xb48cff, 5);
      st.gravJumps = (st.gravJumps || 0) + 1;
      tell('gravjump', 'مكعب الجاذبية رماك فوق! الجاذبية خفيفة لين توصل الأرض: وجّه نفسك صوب الصخرة الطايرة.', 6000);
    }
    if (light) {
      airT += dt;
      if (st.vel.y < -6.5) st.vel.y = -6.5;                  // the fall is slow: no harm when landing
      lift.position.set(p.x, p.y - 0.2, p.z); lift.visible = true; lift.material.opacity = 0.5 + 0.2 * Math.sin(airT * 9);
      if ((st.onGround && airT > 0.3) || st.inWater || st.flying) { light = false; play.tuning.gravity = G0; lift.visible = false; }
    }
    // a pad close by says what it is
    const fx = Math.floor(p.x), fy = Math.floor(p.y), fz = Math.floor(p.z);
    if (!told.has('grav') && (gravT -= dt) <= 0) {
      gravT = 1;
      for (let dz = -5; dz <= 5 && !told.has('grav'); dz++) for (let dx = -5; dx <= 5; dx++) for (let dy = -3; dy <= 2; dy++) if (world.get(fx + dx, fy + dy, fz + dz) === B.GRAV) { tell('grav', 'شفت المكعب البنفسجي اللي يلمع؟ هذا مكعب جاذبية: اوقف عليه ويرميك عالي، صوب الصخور اللي طايرة في السما.', 6500); break; }
    }
  }
  let gravT = 0;
  // the chest on the asteroid of the home: filled the first time it is opened, then marked with a star stone (saved)
  const RK = anchors.rock;
  function rockChest(h) {
    if (!h || h.id !== K.CHEST || h.x !== RK.chest.x || h.y !== RK.chest.y || h.z !== RK.chest.z) return false;
    if (world.get(RK.marker.x, RK.marker.y, RK.marker.z) === B.STAR) return false;
    const box = kit.chestAt(h.x, h.y, h.z);
    box.fill(null);
    [kitItem(K.WINGS, 1), kitItem(K.AMETHYST, 3), kitItem(K.GEM, 2), kitItem(K.ROCK_AMETHYST, 4)].filter(Boolean).forEach((it, i) => { box[i] = it; });
    play.put(RK.marker.x, RK.marker.y, RK.marker.z, B.STAR);
    st.asteroids = (st.asteroids || 0) + 1;
    notice('وصلت الصخرة الطايرة! في الصندوق أجنحة: البسها، وانت طايح اضغط القفز تنزلق.', 6500);
    return false;                                          // the bag opens the chest as usual
  }

  // ------------------------------------------------------------------ 3. the surveyor's charging station
  const CH = anchors.charger;
  const lit = () => CH.sockets.filter((s) => world.get(s.x, s.y, s.z) === B.SOCKET_LIT).length;
  const isCrystalItem = (q) => q && !q.tool && !q.empty && q.id === B.CRYSTAL_C && q.n > 0;
  const crystals = () => [...st.slots, ...st.pack].reduce((a, q) => a + (isCrystalItem(q) ? q.n : 0), 0);
  function take(n) {
    for (const list of [st.slots, st.pack]) for (const q of list) { if (!n) break; if (isCrystalItem(q)) { const k = Math.min(n, q.n); q.n -= k; n -= k; } }
    play.changed();
  }
  const upgraded = () => lit() >= 4;
  function charger(h) {
    if (!h || !(h.id === B.CHARGER || h.id === B.SOCKET || h.id === B.SOCKET_LIT)) return false;
    if (Math.abs(h.x - CH.x) > 1 || Math.abs(h.z - CH.z) > 1) return false;
    const n = lit();
    if (n >= 4) {
      api.state.droneOn = !api.state.droneOn;
      notice(api.state.droneOn ? 'المسّاح رجع يحفر معك.' : 'وقّفت حفر المسّاح. المسه بالشاحن مرة ثانية يرجع.', 3600);
      synth.sweep(api.state.droneOn ? 400 : 700, api.state.droneOn ? 700 : 400, 0.25);
      return true;
    }
    const have = crystals();
    if (have < 3) { notice('الشاحن يبي 3 بلّورات سماوية لكل خانة (عندك ' + have + '). البلّور السماوي تحفره من الصخور الزرقاء المضيئة.', 5200); synth.sweep(320, 220, 0.3, 0.08); return true; }
    take(3);
    const s = CH.sockets.find((q) => world.get(q.x, q.y, q.z) !== B.SOCKET_LIT);
    play.put(s.x, s.y, s.z, B.SOCKET_LIT);
    wave(s.x + 0.5, s.y + 1.05, s.z + 0.5, 0x7df1ff, 3);
    synth.bell(NOTES[n] , 0, 1.2, 0.12);
    if (n + 1 >= 4) {
      st.droneUp = 1;
      wave(CH.x + 0.5, CH.y + 1.05, CH.z + 0.5, 0x7df1ff, 9);
      TUNE.forEach((t, i) => synth.bell(NOTES[t], 0.3 + i * 0.1, 1.2, 0.1));
      notice('المسّاح اندمج مع البلّور! صار يطير وراك ويحفر بالليزر: يساعدك في أي مكعب تحفره، ويطلّع الخام اللي حواليك بروحه. (زر البناء على الشاحن يوقفه ويشغّله)', 8000);
      if (play.sound && play.sound.level) play.sound.level();
    } else notice('عبّيت خانة في الشاحن (' + (n + 1) + ' من 4). كل خانة تبي 3 بلّورات سماوية.', 4200);
    showDrone();
    return true;
  }
  let shownKey = '';
  function showDrone() {
    const n = lit(), key = n + '|' + api.state.droneOn;
    if (key === shownKey || !hud.setObjective) return;
    shownKey = key;
    if (n >= 4) hud.setObjective('بلّورات سماوية', api.state.droneOn ? 'المسّاح يطير ويحفر' : 'المسّاح موقوف', api.state.droneOn ? 'ليزر' : '—');
    else hud.setObjective('اجمع بلّور للشاحن', 'شحن المسّاح', (n * 25) + '%');
  }
  // the surveyor's own laser and glow, once upgraded
  const beamL = o.laserOf();
  const core = halo(0x7df1ff, 1.6, 0.0001, 'none'); drone.add(core); core.position.set(0, 0.1, 0);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  let job = null, scanT = 2, assistT = 0, flown = 0;
  /** The nearest bare ore within 6 blocks of the player (one with air beside it), or null. */
  function oreNear() {
    const p = st.pos, px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    let best = null, bd = 1e9;
    for (let dy = -3; dy <= 4; dy++) for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
      const x = px + dx, y = py + dy, z = pz + dz, id = world.get(x, y, z);
      if (!ORES.has(id)) continue;
      if (world.get(x + 1, y, z) && world.get(x - 1, y, z) && world.get(x, y + 1, z) && world.get(x, y - 1, z) && world.get(x, y, z + 1) && world.get(x, y, z - 1)) continue;
      const d = dx * dx + dy * dy * 1.5 + dz * dz;
      if (d < bd) { bd = d; best = { x, y, z, id }; }
    }
    return best;
  }
  function droneWork(dt) {
    const on = upgraded();
    core.visible = on; if (on) core.material.opacity = 0.75 + 0.2 * Math.sin(st.time * 6);
    beamL.visible = false;
    if (!on || !api.state.droneOn || st.modal) { job = null; return; }
    const p = st.pos, d = st.dig, sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);
    let target = null;
    if (d.on && st.hit) {                                     // helping: the same block, from the side
      const h = st.hit;
      target = { x: h.x + 0.5, y: h.y + 0.5, z: h.z + 0.5 };
      v1.set(p.x - cos * 1.6 - sin * 0.6, p.y + 2.3, p.z + sin * 1.6 - cos * 0.6);
      d.t += dt * 0.9;                                        // with the surveyor's beam on it too the block gives way about twice as fast
      assistT += dt;
      if (assistT > 1.5) tell('assist', 'المسّاح يحفر معك بالليزر: المكعب ينكسر أسرع.', 3600);
    } else {
      if (!job && (scanT -= dt) <= 0) { scanT = 2.5; const ore = oreNear(); if (ore) job = { ...ore, t: 0 }; }
      if (job) {
        if (world.get(job.x, job.y, job.z) !== job.id || Math.hypot(job.x - p.x, job.z - p.z) > 10) job = null;
        else {
          target = { x: job.x + 0.5, y: job.y + 0.5, z: job.z + 0.5 };
          v1.set(job.x + 0.5 + (p.x - job.x) * 0.25, job.y + 2.2, job.z + 0.5 + (p.z - job.z) * 0.25);
          job.t += dt;
          if (job.t > 2.2) {                                  // dug: what it gives goes to the player
            const id = job.id, drop = o.dropOf(id);
            dig(job.x, job.y, job.z);
            const it = drop ? (play.itemOf && play.itemOf(drop)) || kitItem(drop, 1) : null;
            if (it) { it.n = 1; play.give(it); }
            st.droneDug = (st.droneDug || 0) + 1;
            if (st.droneDug === 1 || st.droneDug % 10 === 0) notice('المسّاح طلّع لك ' + (it ? it.name : 'خام') + ' بالليزر.', 3000);
            job = null; scanT = 1.2;
          }
        }
      }
      if (!target) v1.set(p.x - sin * 2.6 - cos * 1.8, p.y + 2.4 + Math.sin(st.time * 1.7) * 0.25, p.z - cos * 2.6 + sin * 1.8);
    }
    drone.position.lerp(v1, 1 - Math.exp(-3.2 * dt));
    flown += dt;
    if (target) {
      drone.rotation.set(0.25, Math.atan2(target.x - drone.position.x, target.z - drone.position.z), 0);
      if (job ? job.t > 0.6 : true) { v2.set(target.x, target.y, target.z); beamL.userData.set(drone.position, v2); beamL.visible = true; }
    } else drone.rotation.set(0.05, Math.atan2(p.x - drone.position.x, p.z - drone.position.z), 0);
  }
  function chargerHint() {
    const d = Math.hypot(CH.x + 0.5 - st.pos.x, CH.z + 0.5 - st.pos.z);
    if (d < 7 && !upgraded()) tell('charger', 'هذا شاحن المسّاح. عطه بلّور سماوي (زر البناء على الشاحن): 3 بلّورات لكل خانة من الأربع، ويتطوّر يطير ويحفر معك.', 7000);
  }

  // ------------------------------------------------------------------ 4. the meteor bridge
  const LD = SPOTS.landing, IS = SPOTS.island;
  const meteor = new THREE.Group();
  {
    const core2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshBasicMaterial({ color: 0xffe2b0, fog: false }));
    meteor.add(core2, halo(0xff8a4a, 16, 1, 'none'), halo(0xffd6a0, 7, 1, 'none'));
    for (let i = 1; i <= 14; i++) { const t = halo(i % 2 ? 0xff7a3a : 0xff4f8a, 9 - i * 0.5, 0.8 - i * 0.05, 'none'); t.userData.trail = i; meteor.add(t); }
    meteor.visible = false; scene.add(meteor);
  }
  const flash = halo(0xffc890, 30, 0.0001, 'none'); scene.add(flash);
  let meteorT = 35, fall = null, flashT = 0, landY = null, follow = false;
  const bridgeLife = 110;
  const keyOf = (x, y, z) => x + ',' + y + ',' + z;
  /** Cells the player may not dig just now (the island's ground under the sea level: it gives way to the sea again). */
  const lockedCells = new Set();
  api.locked = (x, y, z) => lockedCells.has(keyOf(x, y, z));
  /** The top solid cell of a column. */
  const groundTop = (x, z) => { let y = world.sy - 2; while (y > 1 && !play.isSolid(world.get(x, y, z))) y--; return y; };
  function startFall() {
    landY = groundTop(LD.x, LD.z);
    fall = { t: 0, from: new THREE.Vector3(LD.x - 140, landY + 170, LD.z + 70), to: new THREE.Vector3(LD.x + 0.5, landY + 1, LD.z + 0.5) };
    meteor.visible = true;
    synth.sweep(1400, 300, 3, 0.05, 'sine');
    // the first one seen is told and pointed at; later ones only to whoever is near the shore (the compass is the base's the rest of the time)
    const d = dist(LD);
    if (d < 120 || (d < 260 && !told.has('fall'))) { told.add('fall'); follow = true; notice('شوف السما! نيزك مضيء طايح صوب الساحل الشمالي.', 5000); navs.meteor = { x: LD.x + 0.5, z: LD.z + 0.5, label: 'النيزك' }; }
    st.meteors = (st.meteors || 0) + 1;
  }
  function buildBridge() {
    const y = landY, dx = IS.x - LD.x, dz = IS.z - LD.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, cells = [], seen = new Set();
    for (let s = 3; s <= L - IS.r + 1; s += 0.5) for (const w of [-1, 0, 1]) {
      const x = Math.round(LD.x + ux * s - uz * w), z = Math.round(LD.z + uz * s + ux * w), k = keyOf(x, y, z);
      if (seen.has(k)) continue;
      seen.add(k);
      const was = world.get(x, y, z);
      if (was && !play.isLiquid(was)) continue;
      cells.push({ x, y, z, id: (Math.floor(s) + w) % 4 === 0 ? B.STAR : B.METEOR, was, s });
    }
    // the island: ground from the sea floor up to the bridge, crystal and star stone on it, a chest and a lucky box in the middle
    const isle = [];
    for (let iz = -IS.r - 1; iz <= IS.r + 1; iz++) for (let ix = -IS.r - 1; ix <= IS.r + 1; ix++) {
      const r = Math.hypot(ix, iz) * (1 + 0.12 * Math.sin(Math.atan2(iz, ix) * 3));
      if (r > IS.r) continue;
      const x = IS.x + ix, z = IS.z + iz, top = y - (r > IS.r - 1.5 ? 1 : 0);
      let fl = top; while (fl > 1 && (world.get(x, fl - 1, z) === 0 || play.isLiquid(world.get(x, fl - 1, z)))) fl--;
      for (let yy = fl; yy <= top; yy++) isle.push({ x, y: yy, z, id: yy === top ? (r < 3 ? B.STAR : r > IS.r - 2 ? B.SHORE : B.LICHEN_B) : B.FLOAT, was: world.get(x, yy, z), s: L + r });
    }
    const c = { x: IS.x, y: y + 1, z: IS.z };
    isle.push({ ...c, id: K.CHEST, was: world.get(c.x, c.y, c.z), s: L + 1 }, { x: c.x + 2, y: c.y, z: c.z - 1, id: K.LUCKY, was: 0, s: L + 2 });
    for (let i = 0; i < 3; i++) isle.push({ x: IS.x - 3, y: y + 1 + i, z: IS.z + 2, id: B.CRYSTAL_V, was: 0, s: L + 3 });
    for (let i = 0; i < 2; i++) isle.push({ x: IS.x + 3, y: y + 1 + i, z: IS.z + 3, id: B.CRYSTAL_C, was: 0, s: L + 3 });
    api.state.bridge = { cells: [...cells, ...isle].sort((a, b) => a.s - b.s), up: 0, t: 0, chest: c, warned: false, gone: false };
  }
  function bridgeTick(dt) {
    const b = api.state.bridge;
    b.t += dt;
    // grow: twelve blocks a second outwards from the stone
    const reach = b.t * 14;
    let placed = false;
    while (b.up < b.cells.length && b.cells[b.up].s <= reach) {
      const q = b.cells[b.up++];
      if (world.get(q.x, q.y, q.z) !== q.was) continue;      // someone built there meanwhile: leave it
      terrain.setBlock(q.x, q.y, q.z, q.id); placed = true;
      if (q.y <= SEA) lockedCells.add(keyOf(q.x, q.y, q.z));
      if (q.id === K.CHEST) {
        const box = kit.chestAt(q.x, q.y, q.z); box.fill(null);
        const own = (id, n) => { const it = play.itemOf ? play.itemOf(id) : null; return it ? { ...it, n } : null; };
        [own(B.METEOR, 8), own(B.STAR, 6), kitItem([K.RUBY, K.EMERALD, K.AMETHYST, K.GEM][Math.floor(Math.random() * 4)], 2 + Math.floor(Math.random() * 3)), own(B.CRYSTAL_C, 3)].filter(Boolean).forEach((it, i) => { box[i] = it; });
      }
      if (q.id === B.STAR && Math.random() < 0.3) wave(q.x + 0.5, q.y + 1.02, q.z + 0.5, 0x8fb4ff, 2.5);
    }
    if (placed) terrain.flush();
    if (b.up >= b.cells.length && !b.done) {
      b.done = true;
      if (dist(LD) < 120 || follow) notice('النيزك بنى جسر لجزيرة كانت مخفية! الحق عليها قبل يختفي الجسر (دقيقتين تقريبًا).', 6500);
    }
    const onIt = dist(IS) < IS.r + 3 || (dist(LD) < Math.hypot(IS.x - LD.x, IS.z - LD.z) && Math.abs(st.pos.y - b.chest.y) < 3 && dist(IS) < 60);
    if (b.done) navs.meteor = dist(IS) > IS.r + 1 && (follow || dist(LD) < 120) && dist(LD) < 260 ? { x: IS.x + 0.5, z: IS.z + 0.5, label: 'الجزيرة' } : null;
    if (dist(IS) < IS.r && !b.visited) { b.visited = true; st.islands = (st.islands || 0) + 1; notice('وصلت الجزيرة المخفية! افتح الصندوق وصندوق الحظ. لا تطوّل: الجسر بيختفي.', 5500); if (play.sound && play.sound.level) play.sound.level(); }
    if (b.t > bridgeLife - 20 && !b.warned && onIt) { b.warned = true; notice('الجسر بيختفي بعد 20 ثانية! ارجع للساحل.', 5000); }
    if (b.t > bridgeLife) crumble();
  }
  function crumble() {
    const b = api.state.bridge;
    for (let i = b.up - 1; i >= 0; i--) {
      const q = b.cells[i];
      if (world.get(q.x, q.y, q.z) === q.id) terrain.setBlock(q.x, q.y, q.z, q.was);
      if (q.id === K.CHEST) { kit.chests.delete(q.x + ',' + q.y + ',' + q.z); }
    }
    terrain.flush();
    lockedCells.clear();
    api.state.bridge = null; navs.meteor = null; follow = false;
    wave(IS.x + 0.5, SEA + 1.2, IS.z + 0.5, 0x8fb4ff, 14);
    meteorT = 150;
  }
  function meteors(dt) {
    const d = dist(LD);
    if (d < 16 && !api.state.bridge && !fall) {
      if (tell('landing', 'حجر النيازك! كل كم دقيقة يطيح هنا نيزك مضيء من السما ويبني جسر لجزيرة مخفية. انتظر شوي…', 6500)) meteorT = Math.min(meteorT, 25);
    }
    if (!fall && !api.state.bridge && d < 260 && (meteorT -= dt) <= 0) startFall();
    if (fall) {
      fall.t += dt;
      const k = Math.min(1, fall.t / 3.2), e = k * k;
      meteor.position.lerpVectors(fall.from, fall.to, e);
      const dir = v1.subVectors(fall.from, fall.to).normalize();
      for (const c of meteor.children) if (c.userData.trail) c.position.copy(dir).multiplyScalar(c.userData.trail * 3.2);
      if (k >= 1) {
        fall = null; meteor.visible = false; flashT = 1;
        flash.position.set(LD.x + 0.5, landY + 2, LD.z + 0.5);
        synth.boom(); wave(LD.x + 0.5, landY + 1.1, LD.z + 0.5, 0xff9a5a, 16); wave(LD.x + 0.5, landY + 3, LD.z + 0.5, 0xffd08a, 10, true);
        buildBridge();
      }
    }
    if (flashT > 0) { flashT = Math.max(0, flashT - dt * 0.8); flash.material.opacity = flashT; flash.visible = flashT > 0.01; flash.scale.setScalar(20 + (1 - flashT) * 30); }
    if (api.state.bridge) bridgeTick(dt);
  }

  // ------------------------------------------------------------------ the place button on the wonders
  play.onUseFirst((h) => {
    if (!h) return false;
    const k = CHIMES.indexOf(h.id);
    if (k >= 0 && Math.abs(h.x - G.x) < 8 && Math.abs(h.z - G.z) < 8) { touchChime(k); return true; }
    if (charger(h)) return true;
    return rockChest(h);
  });

  api.update = (dt) => {
    if (dt <= 0) return;
    waves(dt);
    garden(dt);
    gravity(dt);
    chargerHint();
    droneWork(dt);
    meteors(dt);
    showDrone();
    // the compass: the nearest thing a wonder points at, else the base
    let best = null;
    for (const n of Object.values(navs)) if (n && (!best || dist(n) < dist(best))) best = n;
    api.nav = best;
  };
  api.droneOwned = () => upgraded() && api.state.droneOn;
  api.force = { sing, meteor: () => { meteorT = 0; }, startFall, openHatch };
  return api;
}
