// Vehicles: a car of each world (the crystal rover of كوكب, the desert cart of واحة, the adventure jeep of البراري,
// the dinosaur tracker, the gothic ghost carriage of ظلام) and «لمسة ذهبية», the sports car earned by finishing every
// quest. The place button with one in the hand gets in; again, gets out. Driving is the player's own walking made
// fast (play's st.ride), with the car drawn round them; it climbs single steps by itself and cannot go in water.
//
//   const cars = createCars({ play, kit, world });          (the bag makes it)

import * as THREE from 'three';
import { K, kitItem } from './kit.js';

const SPEED = { rover: 3.4, buggy: 3.6, jeep: 3.2, dino: 3.0, ghost: 2.8, sport: 4.4 };
export const CAR_OF_WORLD = { kawkab: K.CAR_ROVER, waha: K.CAR_BUGGY, barari: K.CAR_JEEP, dino: K.CAR_DINO, dhalam: K.CAR_GHOST };

const std = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...(o || {}) });
const glow = (c, k = 0.9, o) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4, ...(o || {}) });

/** The model of a car, facing +z, wheels on the ground at y = 0. Returns { g, wheels }. */
export function makeCar(key) {
  const g = new THREE.Group(), wheels = [];
  const add = (w, h, d, x, y, z, m, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
  const wheel = (x, z, r, m, rim) => { const p = new THREE.Group(); p.position.set(x, r, z); add(0.24, r * 2, r * 2, 0, 0, 0, m, p); add(0.26, r * 0.9, r * 0.9, 0, 0, 0, rim, p); g.add(p); wheels.push(p); };
  const tyre = std(0x1e1e22, { roughness: 0.95 });
  if (key === 'rover') {
    const body = std(0x5ff0ff, { transparent: true, opacity: 0.55, emissive: 0x2ab0d0, emissiveIntensity: 0.6, roughness: 0.15 }), edge = glow(0x7ff6ff, 1.1), crystal = glow(0x9ff4ff, 0.8, { transparent: true, opacity: 0.85 });
    add(1.5, 0.4, 2.4, 0, 0.7, 0, body); add(1.2, 0.5, 1.2, 0, 1.15, -0.2, body); add(1.52, 0.06, 2.42, 0, 0.92, 0, edge);
    for (const [x, z, h, r] of [[0.3, -0.4, 0.9, 0.2], [0, -0.6, 1.2, 0], [-0.3, -0.5, 0.8, -0.25], [0.15, -0.9, 0.7, 0.3]]) { const c = add(0.18, h, 0.18, x, 1.4 + h / 2, z, crystal); c.rotation.z = r; c.rotation.y = 0.785; }
    for (const [x, z] of [[-0.85, 0.85], [0.85, 0.85], [-0.85, -0.85], [0.85, -0.85]]) wheel(x, z, 0.36, tyre, glow(0x5ff0ff, 1.2));
  } else if (key === 'buggy') {
    const sand = std(0xd8c08a), frame = std(0x9a7448, { roughness: 0.6 }), seat = std(0x6a4a2a);
    add(1.4, 0.3, 2.3, 0, 0.6, 0, sand); add(1.3, 0.25, 0.7, 0, 0.82, 0.75, sand); add(1.0, 0.3, 0.4, 0, 0.9, -0.3, seat);
    for (const sx of [-1, 1]) { add(0.08, 0.9, 0.08, sx * 0.6, 1.2, 0.2, frame); add(0.08, 0.9, 0.08, sx * 0.6, 1.2, -0.8, frame); add(0.08, 0.08, 1.1, sx * 0.6, 1.65, -0.3, frame); }
    add(1.28, 0.08, 0.08, 0, 1.65, 0.2, frame); add(1.28, 0.08, 0.08, 0, 1.65, -0.8, frame); add(1.1, 0.1, 0.12, 0, 0.62, 1.2, frame);
    for (const [x, z] of [[-0.8, 0.85], [0.8, 0.85], [-0.8, -0.8], [0.8, -0.8]]) wheel(x, z, 0.38, tyre, std(0x8a6a3a));
  } else if (key === 'jeep') {
    const green = std(0x3f7a3a), tan = std(0xc9a870), dark = std(0x2a2e26), crate = std(0x7a6a3a);
    add(1.5, 0.55, 2.5, 0, 0.75, 0, green); add(1.45, 0.3, 0.9, 0, 1.1, 0.75, green); add(1.2, 0.15, 0.1, 0, 0.82, 1.26, dark);
    for (let i = -2; i <= 2; i++) add(0.06, 0.32, 0.04, i * 0.18, 0.8, 1.27, tan);                                       // the grille
    for (const sx of [-1, 1]) { add(0.08, 0.8, 0.08, sx * 0.7, 1.43, 0.2, tan); add(0.08, 0.8, 0.08, sx * 0.7, 1.43, -1.0, tan); add(0.08, 0.08, 1.3, sx * 0.7, 1.84, -0.4, tan); add(0.16, 0.16, 0.06, sx * 0.55, 0.92, 1.28, glow(0xfff2c0, 0.8)); }
    add(1.48, 0.08, 0.08, 0, 1.84, 0.2, tan); add(0.9, 0.3, 0.5, -0.1, 2.0, -0.6, crate); add(0.4, 0.25, 0.4, 0.45, 1.98, -0.4, crate);
    for (const [x, z] of [[-0.82, 0.9], [0.82, 0.9], [-0.82, -0.9], [0.82, -0.9]]) wheel(x, z, 0.42, tyre, std(0x9aa0a8));
    add(0.5, 0.5, 0.2, 0, 0.9, -1.32, tyre);                                                                                // the spare wheel
  } else if (key === 'dino') {
    const armour = std(0x8a7a5a, { roughness: 0.85 }), plate = std(0x6a6458), bone = std(0xe8dcc4), cage = std(0x3a3a3e, { metalness: 0.4 });
    add(1.7, 0.6, 2.6, 0, 1.1, 0, armour); add(1.5, 0.55, 1.2, 0, 1.65, -0.2, plate); add(1.6, 0.5, 0.2, 0, 1.0, 1.35, cage);
    for (let i = -3; i <= 3; i++) add(0.05, 0.42, 0.06, i * 0.2, 1.0, 1.46, cage);
    for (const [x, z] of [[-0.5, -0.2], [0, -0.2], [0.5, -0.2], [-0.25, -0.7], [0.25, -0.7]]) { const sp = add(0.12, 0.3, 0.12, x, 2.05, z, bone); sp.rotation.x = -0.3; }
    for (const sx of [-1, 1]) add(0.2, 0.2, 0.5, sx * 0.86, 1.5, 0.9, bone);
    for (const [x, z] of [[-0.95, 0.95], [0.95, 0.95], [-0.95, -0.95], [0.95, -0.95]]) wheel(x, z, 0.55, tyre, std(0x5a5a5e));
  } else if (key === 'ghost') {
    const black = std(0x1e1a24, { roughness: 0.5 }), trim = std(0x3a3044), purple = glow(0xb06aff, 1.3), lamp = glow(0xffd08a, 1.0);
    add(1.4, 0.5, 2.6, 0, 0.75, 0, black); add(1.3, 0.9, 1.4, 0, 1.45, -0.3, black); add(1.5, 0.1, 1.6, 0, 1.95, -0.3, trim);
    for (const [x, z] of [[-0.5, 0.25], [0.5, 0.25], [-0.5, -0.85], [0.5, -0.85]]) { add(0.1, 0.5, 0.1, x, 2.25, z, trim); add(0.06, 0.12, 0.06, x, 2.55, z, trim); }
    for (const sx of [-1, 1]) { add(0.03, 0.5, 0.8, sx * 0.66, 1.5, -0.3, glow(0x7a3aaa, 0.6, { transparent: true, opacity: 0.6 })); add(0.18, 0.12, 0.08, sx * 0.5, 0.8, 1.32, purple); const l = add(0.16, 0.24, 0.16, sx * 0.72, 1.95, 0.5, lamp); l.position.y = 2.0; add(0.04, 0.3, 0.04, sx * 0.72, 1.75, 0.5, trim); }
    for (const [x, z] of [[-0.8, 0.9], [0.8, 0.9], [-0.8, -0.9], [0.8, -0.9]]) wheel(x, z, 0.45, std(0x2a2430), std(0x6a5a7a));
  } else {                                                                                                                // the sports car
    const white = std(0xf6f6f2, { roughness: 0.25, metalness: 0.15 }), gold = std(0xf0bd3f, { roughness: 0.25, metalness: 0.8 }), glass = std(0x1a2230, { roughness: 0.1, metalness: 0.3 });
    add(1.6, 0.4, 2.8, 0, 0.5, 0, white); add(1.5, 0.12, 1.0, 0, 0.76, 0.85, white);                                   // the body and the long bonnet
    add(1.3, 0.35, 1.3, 0, 0.88, -0.25, glass); add(1.32, 0.06, 1.32, 0, 1.08, -0.25, white);                            // the cabin
    for (const sx of [-1, 1]) { add(0.12, 0.02, 2.84, sx * 0.25, 0.71, 0, gold); add(0.03, 0.06, 2.5, sx * 0.805, 0.46, 0, gold); }   // two gold stripes and gold sills
    add(1.44, 0.06, 0.26, 0, 0.84, -1.32, gold); add(0.06, 0.16, 0.06, -0.6, 0.76, -1.32, gold); add(0.06, 0.16, 0.06, 0.6, 0.76, -1.32, gold);   // the wing at the back
    for (const sx of [-1, 1]) { add(0.3, 0.1, 0.06, sx * 0.55, 0.55, 1.41, glow(0xffffff, 1)); add(0.3, 0.1, 0.06, sx * 0.55, 0.55, -1.41, glow(0xff3048, 1)); }
    for (const [x, z] of [[-0.85, 0.95], [0.85, 0.95], [-0.85, -0.95], [0.85, -0.95]]) wheel(x, z, 0.32, tyre, gold);
  }
  // the parts above the driver's eyes (roll bars, roofs, crystals, lamps on poles) are hidden while driving from inside
  const upper = [];
  g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; if (m.parent === g && m.position.y > 1.3) upper.push(m); } });
  return { g, wheels, upper };
}

export function createCars({ play, kit, world }) {
  const st = play.state, scene = kit.scene;
  let driving = null, model = null, eye0 = play.tuning.eye, roll = 0;
  function enter(item) {
    if (st.boat) { play.notice('انزل من القارب أول.', false, 2000); return; }
    if (st.ride && st.ride !== 1) { play.notice('انزل من الحيوان أول.', false, 2000); return; }
    if (st.inWater) { play.notice('السيارة ما تمشي في الماي.', false, 2000); return; }
    play.setFlying(false);
    driving = item; eye0 = play.tuning.eye; play.tuning.eye = eye0 + 0.35; st.ride = SPEED[item.car] || 3; st.driving = item.car;
    const m = makeCar(item.car); model = m; scene.add(m.g);
    st.drove = (st.drove || 0) + 1;
    play.notice('ركبت «' + item.name + '». امش وين ما تبي، وتطلع الدرجات بروحها. نفس الزر ينزّلك.', false, 4200);
    if (play.sound) play.sound.ui();
  }
  function leave(text) {
    if (!driving) return;
    driving = null; st.ride = 1; st.driving = null; play.tuning.eye = eye0;
    if (model) { scene.remove(model.g); model.g.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } }); model = null; }
    if (text) play.notice(text, false, 2000);
  }
  play.onUseFirst(() => {
    const s = st.slots[st.sel];
    if (driving && s && s.use === 'drive') { leave('نزلت من السيارة.'); return true; }
    if (!s || s.use !== 'drive') return false;
    enter(s); return true;
  });
  play.onTick((s0, dt) => {
    if (!driving) return;
    if (st.inWater || st.boat || st.flying) { leave(st.inWater ? 'السيارة ما تمشي في الماي: نزلت.' : ''); return; }
    roll += st.moving * dt / 0.4;
    model.g.position.set(st.pos.x, st.pos.y, st.pos.z);
    model.g.rotation.y = st.yaw + Math.PI;
    for (const w of model.wheels) w.rotation.x = roll;
    for (const m of model.upper) m.visible = !!st.third;
    st.droveDist = (st.droveDist || 0) + st.moving * dt;
  });
  const api = { get driving() { return driving; }, enter, leave, makeCar };
  window.__GAME_CARS = api;
  return api;
}

/** The sports car is earned once (all the quests); from then on it can be made in every world. */
export const sportsEarned = () => { try { return !!window.localStorage.getItem('bw-sportscar'); } catch (e) { return false; } };
export function earnSports(play) {
  try { if (window.localStorage.getItem('bw-sportscar')) return false; window.localStorage.setItem('bw-sportscar', '1'); } catch (e) { /* not kept: given this once anyway */ }
  play.give(kitItem(K.CAR_SPORT, 1));
  play.notice('خلّصت كل المهام! جايزتك: السيارة الرياضية «لمسة ذهبية». تلقاها في أغراضك، وتقدر تصنعها في كل العوالم.', false, 8000);
  if (play.sound && play.sound.level) play.sound.level();
  return true;
}
