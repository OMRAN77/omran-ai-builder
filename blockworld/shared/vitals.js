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
// hurts: false marks a need that does not cost health at zero (power).

import { K } from './kit.js';

export function createVitals(o) {
  const { play, kit, world } = o, st = play.state;
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
    deaths++;
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
    if (cellAt(p.x, p.y + 0.3, p.z) === K.FIRE) hurt(14 * dt);
    let starving = false, comfy = true;
    for (const n of o.needs) {
      let d;
      if (n.how === 'rest') { const use = n.use ? n.use(st) : 0; d = use > 0 ? -use : n.gain; }
      else d = rising(n) ? n.gain : -(n.drain * (st.inWater && n.wet ? n.wet : 1) * (play.input.sprint && n.run ? n.run : 1));
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
  return { values: v, needs: o.needs, update, hurt, get deaths() { return deaths; }, spawn };
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
