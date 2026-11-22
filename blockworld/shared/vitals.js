// Living vitals: health plus each world's own needs (warmth, water, oxygen, power). They fall and rise by
// simple rules the player can read from the world, and the HUD bars show the real numbers.
//
//   const vitals = createVitals({
//     play, kit, world,
//     hp: 82,
//     needs: [{ key: 'warm', start: 46, drain: 0.33, wet: 1.1, how: 'fire', gain: 9, range: 4.5, heat: [{ x, y, z }], low: '…' }],
//     render(values),              // { hp, warm, ... } 0..100: write them to the HUD
//   });
//   onFrame -> vitals.update(dt)
//
// how: 'fire'  rises near a fire (kit fire, plus the world's own heat points)
//      'water' rises while standing in water
//      'home'  rises within `range` of the point `home`
//      'rest'  rises whenever it is not being used (`use(state)` returns the drain per second)
//      'eat'   never rises on its own (food: the creatures module adds to it when the player eats)
// rain: gain per second while it rains; rainDrain / nightDrain: the drain is multiplied by these in rain / at night.
// hurts: false marks a need that does not cost health at zero (power).

import { K } from './kit.js';

export function createVitals(o) {
  const { play, kit, world } = o, st = play.state;
  // food is the same in every world: it runs down with time (faster running), and only eating brings it back.
  // While it is low, health does not come back; at zero it costs health like any other need.
  if (o.food !== false) o.needs.push({ key: 'food', start: o.food ?? 80, drain: 0.14, run: 2.2, how: 'eat', respawn: 60, low: 'جعت. صيد حيوان وكل لحمه (اختر اللحم واضغط زر البناء).' });
  const sky = () => window.__GAME_SKY || {};
  const v = { hp: o.hp ?? 100 };
  for (const n of o.needs) v[n.key] = n.start ?? 100;
  const spawn = { x: st.pos.x, y: st.pos.y, z: st.pos.z, yaw: st.yaw, pitch: st.pitch };
  let air = 0, fallV = 0, wasGround = true, calm = 0, breath = 0, shown = '', deaths = 0;
  const warned = {};
  // a red flash at the screen edge when hurt
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;opacity:0;transition:opacity .35s;box-shadow:inset 0 0 120px 30px rgba(200,20,10,.75);';
  document.body.appendChild(flash);
  function hurt(d) {
    if (d <= 0) return;
    v.hp -= d; calm = 0;
    flash.style.transition = 'none'; flash.style.opacity = String(Math.min(0.9, 0.35 + d / 30));
    requestAnimationFrame(() => { flash.style.transition = 'opacity .5s'; flash.style.opacity = '0'; });
    if (play.sound && d >= 1) play.sound.hurt();
  }
  const cellAt = (x, y, z) => world.get(Math.floor(x), Math.floor(y), Math.floor(z));
  function nearFire(n) {
    const p = st.pos, r2 = n.range * n.range;
    for (const [k, id] of kit.glow) { if (id !== K.FIRE) continue; const [x, y, z] = k.split(',').map(Number); if ((x + 0.5 - p.x) ** 2 + (y - p.y) ** 2 + (z + 0.5 - p.z) ** 2 < r2) return true; }
    for (const h of n.heat || []) if ((h.x - p.x) ** 2 + (h.y - p.y) ** 2 + (h.z - p.z) ** 2 < r2) return true;
    return false;
  }
  function rising(n) {
    const p = st.pos;
    if (n.how === 'fire') return nearFire(n);
    if (n.how === 'water') return st.inWater || play.isLiquid(cellAt(p.x, p.y + 0.2, p.z));
    if (n.how === 'home') return Math.hypot(n.home.x - p.x, n.home.z - p.z) < n.range;
    return false;
  }
  function die() {
    deaths++; st.deaths = (st.deaths || 0) + 1;
    v.hp = 100; for (const n of o.needs) v[n.key] = Math.max(v[n.key], n.respawn ?? 70);
    play.setFlying(false);
    st.pos.set(spawn.x, spawn.y, spawn.z); st.vel.set(0, 0, 0); st.yaw = spawn.yaw; st.pitch = spawn.pitch;
    air = 0; fallV = 0; wasGround = true; breath = 0;
    play.notice(o.deathText || 'طاحت صحتك للصفر. رجعت لنقطة البداية.', false, 4500);
    if (o.onDeath) o.onDeath();
  }
  function update(dt) {
    if (dt <= 0 || st.modal) return;
    const p = st.pos;
    // falling: the speed of the fall is what hurts
    if (!st.onGround && !st.flying && !st.inWater) { air += dt; fallV = Math.min(fallV, st.vel.y); }
    if ((st.onGround || st.inWater || st.flying) && !wasGround) { if (st.onGround && fallV < -15) hurt((-fallV - 15) * 4.2); air = 0; fallV = 0; }
    wasGround = st.onGround || st.inWater || st.flying;
    // no air with the head under water
    if (play.isLiquid(cellAt(p.x, p.y + play.tuning.eye, p.z))) { breath += dt; if (breath > 12) hurt(7 * dt); } else breath = Math.max(0, breath - dt * 4);
    // standing in fire
    // fire burns whoever stands in it or brushes against it (any cell the body reaches into, a little beyond its sides)
    { let burn = false; const r = play.tuning.hw + 0.14;
      for (let y = Math.floor(p.y); y <= Math.floor(p.y + play.tuning.height - 0.05) && !burn; y++) for (const dx of [-r, 0, r]) for (const dz of [-r, 0, r]) if (cellAt(p.x + dx, y, p.z + dz) === K.FIRE) burn = true;
      if (burn) { hurt(14 * dt); if (!warned.fire) { warned.fire = true; play.notice('النار تحرق! ابعد عنها.', false, 2400); } } else warned.fire = false; }
    let starving = false, comfy = true;
    const w = sky();
    for (const n of o.needs) {
      let d;
      if (n.how === 'rest') { const use = n.use ? n.use(st) : 0; d = use > 0 ? -use : n.gain; }
      else d = rising(n) ? n.gain : -(n.drain * (st.inWater && n.wet ? n.wet : 1) * (play.input.sprint && n.run ? n.run : 1) * (w.rain && n.rainDrain ? n.rainDrain : 1) * (w.night && n.nightDrain ? n.nightDrain : 1) * (n.key === 'food' && window.__GAME_DIFF ? window.__GAME_DIFF.hunger : 1));
      if (w.rain && n.rain && !st.flying) d = Math.max(d, n.rain);        // rain fills what it fills (water in the desert)
      v[n.key] = Math.max(0, Math.min(100, v[n.key] + d * dt));
      if (n.hurts !== false) { if (v[n.key] <= 0) starving = true; if (v[n.key] < 40) comfy = false; }
      if (v[n.key] < 20 && !warned[n.key]) { warned[n.key] = true; if (n.low) play.notice(n.low, false, 5000); } else if (v[n.key] > 35) warned[n.key] = false;
      if (n.onEmpty && v[n.key] <= 0) n.onEmpty(st);
    }
    if (starving) hurt(2.6 * dt);
    calm += dt;
    if (comfy && calm > 4 && v.hp < 100) v.hp = Math.min(100, v.hp + 1.3 * dt);
    if (v.hp <= 0) die();
    const key = Object.keys(v).map((k) => Math.round(v[k])).join(',');
    if (key !== shown) { shown = key; o.render(v); }
  }
  o.render(v);
  const api = { values: v, needs: o.needs, update, hurt, get deaths() { return deaths; }, spawn };
  window.__GAME_VITALS = api;
  return api;
}

/** Bar writers for the three HUD styles, so each world wires its bars in a line. */
export const bars = {
  /** a fill element whose width is the value */
  width: (fill, num, unit = '') => (val) => { fill.style.width = val.toFixed(1) + '%'; if (num) num.textContent = Math.round(val) + unit; },
  /** a fill element driven by a CSS variable */
  cssVar: (fill, num, name = '--v') => (val) => { fill.style.setProperty(name, val.toFixed(1) + '%'); if (num) num.textContent = String(Math.round(val)); },
  /** a row of segments; `on` marks the lit ones */
  segments: (cells, num) => (val) => { const n = Math.round(val / 100 * cells.length); cells.forEach((el, i) => el.classList.toggle('on', i < n)); if (num) num.textContent = String(Math.round(val)); },
};
