// First-person play controller shared by every world: input (keyboard + mouse, touch),
// walking physics against the voxel world, block targeting, digging and placing.
//
//   const play = createPlay({
//     camera, canvas, world, blocks, terrain,        // terrain: createVoxelTerrain(...) from voxel.js
//     spawn: { x, y, z, yaw, pitch },                 // y = feet
//     slots: [{ tool: true }, { id: B.STONE, n: 20 }, ...],   // hotbar; the world owns icons / names
//     touch: { stick, knob, jump, dig, place } | null,        // HUD elements for touch play
//     isLiquid(id), pickable(id), canBreak(id, x, y, z), canPlace(x, y, z, id), hardness(id), dropOf(id),
//     heightOf(id),                                   // collision height of a block, 0..1 (half blocks, beds); default 1
//     onUse(item, slot),                              // the place button on an item with `use` (food, clothing)
//     onBag(), onMenu(), onFly(on),                   // E was pressed; Q was pressed; flying was switched on or off
//     onTarget(hit | null), onBreak(hit), onPlace(x, y, z, id), onInventory(slots, sel),
//     onFrame(state, dt), render(), setPixelRatio(pr),
//     stage,                                          // createStage() result: lets the loop pace itself on the GPU and
//                                                     // fall back to plain drawing if the picture comes out black
//   });
//   play.start();
//
// The world keeps everything visual (HUD, held tool, highlight box, effects); this module only
// reports what happened through the callbacks.

import * as THREE from 'three';
import { createSound } from './sound.js';

const E = 1e-4;

/** An empty hotbar square. It is an item like any other to the HUDs: no picture, no count, nothing to place. */
export const EMPTY = Object.freeze({ empty: true, kit: true, id: 0, name: '', tool: 'none' });
/** Can something new be put in this square? (nothing there, or a pile that ran out) */
export const isFree = (s) => !s || !!s.empty || (!s.tool && !s.use && !(s.n > 0));
const LOOK = { slow: 0.65, normal: 1, fast: 1.5 };
const FEEDBACK_API = '/api/feedback';      // this game's own list of notes and bug reports (see api/feedback.js)
// The keyboard: every action has a key the player may change (the pause menu does it). Arrows always walk too.
export const KEY_ACTIONS = [['fwd', 'قدّام'], ['back', 'ورا'], ['left', 'يسار'], ['right', 'يمين'], ['jump', 'قفز وسباحة'], ['run', 'ركض'], ['bag', 'الحقيبة'], ['menu', 'الوقت والجو'], ['view', 'المنظور من ورا'], ['place', 'بناء (بديل الزر الأيمن)'], ['mute', 'كتم الصوت']];
const KEYS0 = { fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', run: 'ControlLeft', bag: 'KeyE', menu: 'KeyQ', view: 'KeyV', place: 'KeyF', mute: 'KeyM' };
const KM = { ...KEYS0 };
try { const k = JSON.parse(window.localStorage.getItem('bw-keys') || 'null'); if (k && typeof k === 'object') for (const a of Object.keys(KEYS0)) if (typeof k[a] === 'string' && /^[A-Za-z0-9]{1,20}$/.test(k[a])) KM[a] = k[a]; } catch (e) { /* storage may be closed or hold something else */ }
const keepKeys = () => { try { window.localStorage.setItem('bw-keys', JSON.stringify(KM)); } catch (e) { /* not kept */ } };
/** A short name for a key code, for the menus. */
export const keyName = (code) => String(code).replace(/^Key/, '').replace(/^Digit/, '').replace('ControlLeft', 'Ctrl').replace('ControlRight', 'Ctrl يمين').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift يمين').replace('AltLeft', 'Alt').replace('Space', 'Space');
if (typeof window !== 'undefined') window.__GAME_KEYS = {
  map: KM,
  /** Give an action a new key. A key that was another action's is swapped with it. Esc, digits and arrows stay as they are. */
  set(action, code) {
    if (!(action in KEYS0) || typeof code !== 'string' || code === 'Escape' || /^(Digit|Numpad|Arrow|F\d)/.test(code) || /^(Meta|OS)/.test(code)) return false;
    for (const a of Object.keys(KM)) if (KM[a] === code && a !== action) KM[a] = KM[action];
    KM[action] = code; keepKeys();
    return true;
  },
  reset() { Object.assign(KM, KEYS0); keepKeys(); },
};
// How hard the world is: what a monster's blow costs, how fast hunger comes, how many monsters there may be.
const DIFFS = { easy: { dmg: 0.5, hunger: 0.6, mobs: 1 }, normal: { dmg: 1, hunger: 1, mobs: 1 }, hard: { dmg: 1.6, hunger: 1.4, mobs: 1.5 } };
if (typeof window !== 'undefined') {
  let mode = 'normal';
  try { const m = window.localStorage.getItem('bw-diff'); if (DIFFS[m]) mode = m; } catch (e) { /* storage may be closed */ }
  window.__GAME_DIFF = { get mode() { return mode; }, get dmg() { return DIFFS[mode].dmg; }, get hunger() { return DIFFS[mode].hunger; }, get mobs() { return DIFFS[mode].mobs; }, set(m) { if (!DIFFS[m]) return; mode = m; try { window.localStorage.setItem('bw-diff', m); } catch (e) { /* not kept */ } } };
}

export function createPlay(o) {
  const { camera, canvas, world, blocks, terrain } = o;
  const { sx, sy, sz } = world;
  const kindOf = (id) => (id && blocks[id] ? (blocks[id].kind ?? 'solid') : 'air');
  const CUBE = { solid: 1, cutout: 1, translucent: 1, slab: 1 };
  const isLiquid = o.isLiquid ?? ((id) => kindOf(id) === 'liquid');
  // a block may say for itself whether it is solid and whether it can be aimed at (a door is a model, not a meshed cube)
  const isSolid = o.isSolid ?? ((id) => (blocks[id] && blocks[id].solid != null ? blocks[id].solid : !!CUBE[kindOf(id)] && !isLiquid(id)));
  const pickable = o.pickable ?? ((id) => id !== 0 && !isLiquid(id) && kindOf(id) !== 'air' && (kindOf(id) !== 'none' || !!blocks[id].pick));
  const hardness = o.hardness ?? ((id) => (kindOf(id) === 'cross' ? 0.08 : 0.45));
  const hOf = o.heightOf ?? (() => 1);
  const P = { hw: 0.3, height: 1.8, eye: 1.62, walk: 4.4, sprint: 6.8, jump: 8.7, gravity: 27, reach: 5.5, swim: 3.4, autoJump: true, mouse: 0.0022, touchLook: 0.0052,
    stepUp: 0.6, fly: 10.5, flyFast: 19, flyRise: 7.5, doubleTap: 300, ...(o.tuning || {}) };

  const st = {
    pos: new THREE.Vector3(o.spawn.x, o.spawn.y, o.spawn.z), vel: new THREE.Vector3(),
    yaw: o.spawn.yaw || 0, pitch: o.spawn.pitch || 0,
    onGround: false, inWater: false, moving: 0, hit: null,
    dig: { on: false, x: 0, y: 0, z: 0, t: 0, need: 1, progress: 0 },
    slots: o.slots, sel: 0, running: false, locked: false, time: 0, broken: 0, placed: 0,
    flying: false, modal: false, xp: 0,
    pack: new Array(27).fill(null),                                  // the backpack: 27 places behind the hotbar
    gear: { head: null, chest: null, legs: null, feet: null, off: null },   // what is worn, and the other hand
    kills: { animal: 0, monster: 0 }, eaten: 0, crafted: 0, opened: 0, flown: 0, swum: 0, swumDist: 0, walked: 0, slept: 0, played: 0, deaths: 0, jumps: 0,   // counted for the achievements and quests
    made: {}, put: {}, pouch: new Array(27).fill(null), mark: null, photos: 0, pet: false, petBag: new Array(27).fill(null),                                                // how many of each thing were crafted / put down (by id)
    third: false,                                                    // the view from behind the player (V)
  };
  let itemOf = o.itemOf || null;
  let shared = false, held = false;
  const ticks = [], firsts = [];                                     // shared modules hook in here: every frame, and before the place button does its usual thing
  const net = { place: null, dig: null };                            // the multiplayer link listens here for what the player changes in the world                                     // id -> a fresh item object (the bag knows every item)
  const inp = { fx: 0, fz: 0, jump: false, dig: false, sprint: false, place: false, down: false };
  const sound = o.sound === false ? null : createSound();          // every world gets the same sounds; M mutes
  window.__GAME_SOUND = sound;
  window.__GAME_STATE = st;
  const snd = { stride: 0, dig: 0, ground: true, water: false, vy: 0, air: 0 };
  const keys = new Set();

  // ------------------------------------------------------------------ collision
  // Every solid block is a box that fills its cell sideways and reaches up to y + heightOf(id).
  /** Top of the solid box in cell (x, y, z); -Infinity when the cell holds nothing solid. */
  const topOf = (x, y, z) => {
    if (x < 0 || z < 0 || x >= sx || z >= sz || y < 0) return y + 1;      // the world is a walled box with a floor
    if (y >= sy) return -Infinity;
    const id = world.get(x, y, z);
    return isSolid(id) ? y + hOf(id) : -Infinity;
  };
  const solid = (x, y, z) => topOf(x, y, z) > y;
  /** Highest box top the body standing at (px, py, pz) pokes into; -Infinity when it is free. */
  function hitTop(px, py, pz) {
    const x0 = Math.floor(px - P.hw + E), x1 = Math.floor(px + P.hw - E);
    const y0 = Math.floor(py + E), y1 = Math.floor(py + P.height - E);
    const z0 = Math.floor(pz - P.hw + E), z1 = Math.floor(pz + P.hw - E);
    let top = -Infinity;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const t = topOf(x, y, z); if (t > py + E && t > top) top = t; }
    return top;
  }
  const collides = (px, py, pz) => hitTop(px, py, pz) > -Infinity;
  function unstick() { let n = 0; while (collides(st.pos.x, st.pos.y, st.pos.z) && n++ < sy) st.pos.y = Math.floor(st.pos.y) + 1; }

  function setFlying(on) {
    if (st.flying === on) return;
    st.flying = on; st.vel.y = 0;
    if (sound) sound.fly(on);
    if (o.onFly) o.onFly(on);
  }
  function step(dt) {
    const p = st.pos, v = st.vel;
    const sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    let wx = cos * inp.fx - sin * inp.fz, wz = -sin * inp.fx - cos * inp.fz;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    st.inWater = isLiquid(world.get(Math.floor(p.x), Math.floor(p.y + 0.9), Math.floor(p.z)));
    const wading = !st.inWater && isLiquid(world.get(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z)));   // at the surface: feet wet, chest out
    const wasGround = st.onGround;
    if (st.flying) {
      const speed = inp.sprint ? P.flyFast : P.fly, k = Math.min(1, 8 * dt);
      v.x += (wx * speed - v.x) * k; v.z += (wz * speed - v.z) * k;
      // keys: jump rises, the down key sinks. On touch there is no down key: pushing the stick flies where you look.
      let vy = ((inp.jump ? 1 : 0) - (inp.down ? 1 : 0)) * P.flyRise;
      if (stick.id !== null && !inp.jump) vy += Math.sin(st.pitch) * speed * Math.max(0, inp.fz);
      v.y += (vy - v.y) * k;
    } else {
      const speed = (inp.sprint ? P.sprint : P.walk) * (st.inWater ? 0.6 : 1);
      const k = Math.min(1, (st.onGround || st.inWater ? 14 : 4) * dt);
      v.x += (wx * speed - v.x) * k; v.z += (wz * speed - v.z) * k;
      if (st.inWater) {
        v.y -= 7 * dt; v.y *= 1 - Math.min(1, 3 * dt);
        if (inp.jump) v.y = P.swim;
      } else {
        v.y -= P.gravity * dt;
        if (inp.jump && (st.onGround || wading)) { v.y = P.jump; st.onGround = false; }       // from the surface a jump clears the bank
      }
      if (v.y < -40) v.y = -40;
    }

    let blocked = false;
    // sideways, one axis at a time; a low step (half block, bed) is walked up instead of blocking
    const canStep = wasGround && !st.inWater && !st.flying;
    const nx = p.x + v.x * dt;
    if (collides(nx, p.y, p.z)) {
      const top = canStep ? hitTop(nx, p.y, p.z) : Infinity;
      if (top - p.y <= P.stepUp + E && !collides(nx, top, p.z)) { p.x = nx; p.y = top; }
      else { p.x = v.x > 0 ? Math.floor(nx + P.hw) - P.hw - E : Math.floor(nx - P.hw) + 1 + P.hw + E; v.x = 0; blocked = true; }
    } else p.x = nx;
    const nz = p.z + v.z * dt;
    if (collides(p.x, p.y, nz)) {
      const top = canStep ? hitTop(p.x, p.y, nz) : Infinity;
      if (top - p.y <= P.stepUp + E && !collides(p.x, top, nz)) { p.z = nz; p.y = top; }
      else { p.z = v.z > 0 ? Math.floor(nz + P.hw) - P.hw - E : Math.floor(nz - P.hw) + 1 + P.hw + E; v.z = 0; blocked = true; }
    } else p.z = nz;
    p.y += v.y * dt;
    st.onGround = false;
    const top = hitTop(p.x, p.y, p.z);
    if (top > -Infinity) {
      if (v.y <= 0) { p.y = top; st.onGround = true; if (st.flying && inp.down) setFlying(false); }     // land on whatever is highest under the feet
      else p.y = Math.floor(p.y + P.height) - P.height - E;
      v.y = 0;
    }
    // Resting on something: a very short step (a fast display, a burst of frames) moves the feet less than the
    // collision tolerance, which must not read as "in the air" (no jump, a landing sound every frame).
    if (!st.onGround && v.y <= 0 && !st.flying && hitTop(p.x, p.y - 0.03, p.z) > -Infinity) { st.onGround = true; v.y = Math.max(v.y, -1); }
    // step up one block on its own: the terrain is terraced and touch players have no spare thumb
    if (P.autoJump && blocked && wasGround && st.onGround && wl > 0.25 && !st.inWater && !st.flying) {
      const fy = Math.floor(p.y + E), tx = Math.floor(p.x + (wx / wl) * (P.hw + 0.45)), tz = Math.floor(p.z + (wz / wl) * (P.hw + 0.45));
      if (solid(tx, fy, tz) && !solid(tx, fy + 1, tz) && !solid(tx, fy + 2, tz) && !solid(Math.floor(p.x), fy + 2, Math.floor(p.z))) { v.y = P.jump; st.onGround = false; }
    }
    // swimming into a bank climbs out of the water instead of getting stuck against it
    if (P.autoJump && blocked && (st.inWater || wading) && wl > 0.25 && !st.flying) {
      const fy = Math.floor(p.y + 0.9), tx = Math.floor(p.x + (wx / wl) * (P.hw + 0.45)), tz = Math.floor(p.z + (wz / wl) * (P.hw + 0.45));
      for (let up = 0; up <= 1; up++) if (solid(tx, fy + up, tz) && !solid(tx, fy + up + 1, tz) && !solid(tx, fy + up + 2, tz)) { v.y = Math.max(v.y, 6.4); break; }
    }
    if (p.y < -20) { p.set(o.spawn.x, o.spawn.y, o.spawn.z); v.set(0, 0, 0); unstick(); }
    if (p.y > sy + 40) { p.y = sy + 40; if (v.y > 0) v.y = 0; }            // flying has a ceiling
    st.moving = Math.hypot(v.x, v.z);
  }

  // ------------------------------------------------------------------ targeting
  const _dir = new THREE.Vector3(), _eye = new THREE.Vector3();
  /** Walk the grid along a ray (Amanatides & Woo). The cell the ray starts in is skipped. */
  function raycast(org, dir, max, accept = pickable) {
    let x = Math.floor(org.x), y = Math.floor(org.y), z = Math.floor(org.z);
    const sxn = dir.x > 0 ? 1 : -1, syn = dir.y > 0 ? 1 : -1, szn = dir.z > 0 ? 1 : -1;
    const dx = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity, dy = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity, dz = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tx = dir.x !== 0 ? (dir.x > 0 ? x + 1 - org.x : org.x - x) * dx : Infinity;
    let ty = dir.y !== 0 ? (dir.y > 0 ? y + 1 - org.y : org.y - y) * dy : Infinity;
    let tz = dir.z !== 0 ? (dir.z > 0 ? z + 1 - org.z : org.z - z) * dz : Infinity;
    for (let i = 0; i < 64; i++) {
      let t, nx = 0, ny = 0, nz = 0;
      if (tx < ty && tx < tz) { x += sxn; t = tx; tx += dx; nx = -sxn; } else if (ty < tz) { y += syn; t = ty; ty += dy; ny = -syn; } else { z += szn; t = tz; tz += dz; nz = -szn; }
      if (t > max) return null;
      if (!world.inb(x, y, z)) continue;
      const id = world.get(x, y, z);
      if (id && accept(id)) return { x, y, z, id, nx, ny, nz, t, px: org.x + dir.x * t, py: org.y + dir.y * t, pz: org.z + dir.z * t };
    }
    return null;
  }
  function aim() {
    _eye.set(st.pos.x, st.pos.y + P.eye, st.pos.z);
    const cp = Math.cos(st.pitch);
    _dir.set(-Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp);
    const hit = raycast(_eye, _dir, P.reach);
    const a = st.hit, changed = !a !== !hit || (hit && (a.x !== hit.x || a.y !== hit.y || a.z !== hit.z || a.id !== hit.id));
    st.hit = hit;
    if (changed && o.onTarget) o.onTarget(hit);
  }

  // ------------------------------------------------------------------ digging and placing
  const inventoryChanged = () => { if (o.onInventory) o.onInventory(st.slots, st.sel); };
  /**
   * Put an item among the player's things: on a pile of the same thing (hotbar first, then the backpack), else in an
   * empty hotbar square, else an empty place in the backpack, else a hotbar square whose pile ran out. Returns 'bar' or 'pack' (where it went), or false when full.
   */
  function give(item) {
    if (!item || !item.id) return false;
    const n = item.n == null ? 1 : item.n, piles = !item.tool;
    if (piles) for (const [where, list] of [['bar', st.slots], ['pack', st.pack]]) { const s = list.find((q) => q && q.id === item.id && !q.tool); if (s) { s.n = Math.min(999, (s.n || 0) + n); inventoryChanged(); return where; } }
    let i = st.slots.findIndex((q) => !q || q.empty);
    if (i >= 0) { st.slots[i] = { ...item }; inventoryChanged(); return 'bar'; }
    i = st.pack.findIndex((q) => !q);
    if (i >= 0) { st.pack[i] = { ...item }; inventoryChanged(); return 'pack'; }
    for (let j = st.slots.length - 1; j >= 0; j--) if (j !== st.sel && isFree(st.slots[j])) { st.slots[j] = { ...item }; inventoryChanged(); return 'bar'; }
    return false;
  }
  function collect(id) {
    const want = o.dropOf ? o.dropOf(id) : id;
    if (!want) return;
    const s = st.slots.find((q) => q && q.id === want && !q.tool) || st.pack.find((q) => q && q.id === want && !q.tool);
    if (s) { s.n = Math.min(999, (s.n || 0) + 1); inventoryChanged(); return; }
    const it = itemOf ? itemOf(want) : null;                         // nothing of the kind is carried yet: a new pile, if the item is known
    if (it) give({ ...it, n: 1 });
  }
  function breakBlock(h) {
    terrain.setBlock(h.x, h.y, h.z, 0);
    const up = world.get(h.x, h.y + 1, h.z);
    if (up && kindOf(up) === 'cross') terrain.setBlock(h.x, h.y + 1, h.z, 0);     // a plant cannot stand on nothing
    st.broken++;
    if (sound) sound.brk();
    collect(h.id);
    st.xp += 1;
    if (net.dig) net.dig(h.x, h.y, h.z);
    if (o.onBreak) o.onBreak(h);
  }
  function digTick(dt) {
    const d = st.dig, h = st.hit;
    if (st.noDig) { d.on = false; d.t = 0; d.progress = 0; return; }        // a creature is under the crosshair: the world handles the hit
    const can = inp.dig && h && h.y > 0 && (!o.canBreak || o.canBreak(h.id, h.x, h.y, h.z) !== false);
    if (!can) {
      // hitting the air, or something that cannot be dug: the swing is still heard
      if (sound && inp.dig && !st.modal && (snd.dig -= dt) <= 0) { snd.dig = 0.34; sound.swing(); }
      if (!inp.dig) snd.dig = 0;
      d.on = false; d.t = 0; d.progress = 0; return;
    }
    if (!d.on || d.x !== h.x || d.y !== h.y || d.z !== h.z) { d.on = true; d.x = h.x; d.y = h.y; d.z = h.z; d.t = 0; const tool = st.slots[st.sel]; d.need = Math.max(0.01, hardness(h.id) / ((tool && tool.speed) || 1)); }   // a pick or an axe from the bag digs faster
    d.t += dt; d.progress = Math.min(1, d.t / d.need);
    if (sound && (snd.dig -= dt) <= 0) { snd.dig = 0.2; sound.dig(); }
    if (d.t >= d.need) { breakBlock(h); d.on = false; d.t = 0; d.progress = 0; aim(); }
  }
  function placeNow() {
    let h = st.hit;
    const s = st.slots[st.sel];
    for (const f of firsts) if (f(h)) return true;
    // building on water: the crosshair passes through a liquid, so with a block in hand the surface of the water counts as
    // something to build against (not while the head is under it: there every side would be water)
    if (s && s.id && blocks[s.id] && !isLiquid(world.get(Math.floor(_eye.x), Math.floor(_eye.y), Math.floor(_eye.z)))) {
      const wet = raycast(_eye, _dir, P.reach, (id) => isLiquid(id) || pickable(id));
      if (wet && isLiquid(wet.id) && (!h || wet.t < h.t - 0.01)) h = wet;
    }                     // someone to talk to stands under the crosshair
    // a door, a chest, a workbench: the button works it (hold Shift to build against it instead)
    if (h && o.onInteract && !keys.has('ShiftLeft') && !keys.has('ShiftRight') && o.onInteract(h)) return true;
    if (s && s.use) return o.onUse ? !!o.onUse(s, st.sel) : false;          // food, clothing: used, not placed
    if (!h || !s || !s.id || !(s.n > 0) || !blocks[s.id]) return false;
    const onPlant = kindOf(h.id) === 'cross';
    const x = onPlant ? h.x : h.x + h.nx, y = onPlant ? h.y : h.y + h.ny, z = onPlant ? h.z : h.z + h.nz;
    if (!world.inb(x, y, z) || y >= sy - 1) return false;
    const cur = world.get(x, y, z);
    if (cur && !isLiquid(cur) && kindOf(cur) !== 'cross') return false;
    if (o.canPlace && o.canPlace(x, y, z, s.id) === false) return false;        // the world may keep blocks out of some places
    if (blocks[s.id].tall && (y + 2 >= sy || world.get(x, y + 1, z) !== 0)) return false;     // a door needs the cell above it too
    if (isSolid(s.id)) {      // never wall the player in
      const p = st.pos;
      if (x + 1 > p.x - P.hw && x < p.x + P.hw && z + 1 > p.z - P.hw && z < p.z + P.hw && y + 1 > p.y && y < p.y + P.height) return false;
    }
    terrain.setBlock(x, y, z, s.id);
    s.n--; st.placed++; st.put[s.id] = (st.put[s.id] || 0) + 1;
    if (net.place) net.place(x, y, z, s.id, st.yaw);
    if (sound) sound.place();
    inventoryChanged();
    if (o.onPlace) o.onPlace(x, y, z, s.id);
    aim();
    return true;
  }
  function select(i) {
    const n = st.slots.length, was = st.sel;
    st.sel = ((i % n) + n) % n;
    if (sound && st.sel !== was && st.running) sound.pick();
    inventoryChanged();
  }
  /** Put an item in a hotbar slot (the bag does this). item: { id, n, name, ... } or { tool: true, ... }. */
  function setSlot(i, item) {
    if (i < 0 || i >= st.slots.length) return;
    st.slots[i] = item;
    inventoryChanged();
  }
  /** While a panel (the bag) is open: the mouse is released and the player does not act. */
  function setModal(on) {
    st.modal = on;
    if (typeof seatNote === 'function') seatNote();              // a note already up moves out of the panel's way
    keys.clear(); inp.dig = false; inp.place = false; inp.fx = inp.fz = 0; btn.jump = false; sprintLatch = false;
    if (on) { if (document.pointerLockElement === canvas) document.exitPointerLock(); } else if (!T) tryLock();
  }

  // ------------------------------------------------------------------ input: keyboard + mouse
  const clampPitch = () => { st.pitch = Math.max(-1.5, Math.min(1.5, st.pitch)); };
  const lookBy = (dx, dy, k) => { st.yaw -= dx * k; st.pitch -= dy * k; clampPitch(); };
  let sprintLatch = false, lastFwd = -1e9, lastJump = -1e9, stickSprint = false;
  function readKeys() {
    if (st.modal) { inp.fx = inp.fz = 0; inp.jump = inp.sprint = inp.down = false; return; }
    const fwd = keys.has(KM.fwd) || keys.has('ArrowUp');
    const f = (fwd ? 1 : 0) - (keys.has(KM.back) || keys.has('ArrowDown') ? 1 : 0);
    const r = (keys.has(KM.right) || keys.has('ArrowRight') ? 1 : 0) - (keys.has(KM.left) || keys.has('ArrowLeft') ? 1 : 0);
    if (stick.id === null) { inp.fx = r; inp.fz = f; }
    if (!fwd && stick.id === null) sprintLatch = false;
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
    inp.jump = keys.has(KM.jump) || btn.jump;
    inp.down = st.flying && shift;                                   // while flying, Shift sinks
    inp.sprint = sprintLatch || stickSprint || keys.has(KM.run) || (!st.flying && shift);
  }
  /** Second press within the double-tap window? (times in ms) */
  const doubled = (now, last) => now - last < P.doubleTap;
  const onKey = (e) => {
    if (!st.running) return;
    if (e.type === 'keydown') {
      if (e.code === KM.bag && !e.repeat) { if (sound) sound.ui(); if (o.onBag) o.onBag(); e.preventDefault(); return; }
      if (e.code === KM.view && !e.repeat && !st.modal) { st.third = !st.third; if (sound) sound.ui(); return; }
      if (e.code === KM.menu && !e.repeat && o.onMenu) { if (sound) sound.ui(); o.onMenu(); e.preventDefault(); return; }
      if (e.code === KM.mute && !e.repeat && sound) { sound.setMuted(!sound.muted); notice(sound.muted ? 'الصوت مطفي.' : 'الصوت شغّال.', false, 1600); return; }
      if (st.modal) return;
      if (e.code === 'Escape' && !st.locked && o.onUnlock) { o.onUnlock(); return; }     // without a captured mouse Esc arrives here: the same pause menu
      if (!e.repeat) {
        const now = performance.now();
        if (e.code === KM.fwd || e.code === 'ArrowUp') { if (doubled(now, lastFwd)) sprintLatch = true; lastFwd = now; }          // double W: run until W is released
        if (e.code === KM.jump) { if (doubled(now, lastJump)) { setFlying(!st.flying); lastJump = -1e9; } else lastJump = now; }    // double Space: fly / stop flying
      }
      keys.add(e.code);
      if (/^(Digit|Numpad)[1-9]$/.test(e.code)) { const i = +e.code.slice(-1) - 1; if (i < st.slots.length) select(i); }
      if (e.code === KM.place) inp.place = true;
      if (e.code === KM.jump || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    } else keys.delete(e.code);
  };
  let lockFailed = false, mouseDrag = false, lockAt = 0, everLocked = false, refusals = 0;
  const refused = () => { if (!everLocked && ++refusals >= 2) lockFailed = true; };
  const tryLock = () => {
    if (lockFailed || !canvas.requestPointerLock) { lockFailed = true; return; }
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(refused); } catch (e) { refused(); }
  };
  const onLockChange = () => { st.locked = document.pointerLockElement === canvas; if (st.locked) { lockAt = performance.now(); everLocked = true; } if (!st.locked) { inp.dig = false; if (o.onUnlock && st.running && !lockFailed && !st.modal) o.onUnlock(); } };
  const onMouseMove = (e) => {
    if (!st.running || !(st.locked || mouseDrag)) return;
    if (st.locked && performance.now() - lockAt < 100) return;      // browsers can report one large stray move right after capture
    lookBy(e.movementX || 0, e.movementY || 0, P.mouse);
  };
  const onWheel = (e) => { if (st.running) { select(st.sel + (e.deltaY > 0 ? 1 : -1)); e.preventDefault(); } };

  // ------------------------------------------------------------------ input: pointers (mouse buttons + touch)
  const stick = { id: null, cx: 0, cy: 0, r: 40 };
  const btn = { jump: false };
  const looks = new Map();                       // pointerId -> { x, y } for touches that turn the view
  let digPointers = 0;
  const T = o.touch || null;
  function stickSet(e) {
    let dx = (e.clientX - stick.cx) / stick.r, dy = (e.clientY - stick.cy) / stick.r;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    inp.fx = Math.abs(dx) < 0.12 ? 0 : dx; inp.fz = Math.abs(dy) < 0.12 ? 0 : -dy;
    stickSprint = l > 0.96;
    if (T.knob) T.knob.style.transform = `translate(${(dx * stick.r).toFixed(1)}px, ${(dy * stick.r).toFixed(1)}px)`;
  }
  function bind(el, type, fn) { el.addEventListener(type, fn, { passive: false }); }
  function wireTouch() {
    for (const el of [T.stick, T.jump, T.dig, T.place]) if (el) { el.style.pointerEvents = 'auto'; el.style.touchAction = 'none'; }
    if (T.stick) {
      bind(T.stick, 'pointerdown', (e) => {
        if (!st.running) return;
        const r = T.stick.getBoundingClientRect();
        stick.id = e.pointerId; stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2; stick.r = r.width * 0.36;
        T.stick.setPointerCapture(e.pointerId); stickSet(e); e.preventDefault();
      });
      bind(T.stick, 'pointermove', (e) => { if (e.pointerId === stick.id) { stickSet(e); e.preventDefault(); } });
      const end = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; inp.fx = inp.fz = 0; stickSprint = false; if (T.knob) T.knob.style.transform = ''; };
      bind(T.stick, 'pointerup', end); bind(T.stick, 'pointercancel', end);
    }
    // jump / dig / place: press to act, and keep turning the view with the same thumb
    const press = (el, down, up) => {
      if (!el) return;
      bind(el, 'pointerdown', (e) => { if (!st.running) return; el.setPointerCapture(e.pointerId); looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.classList.add('down'); down(); e.preventDefault(); });
      bind(el, 'pointermove', (e) => { const l = looks.get(e.pointerId); if (l) { lookBy(e.clientX - l.x, e.clientY - l.y, P.touchLook); l.x = e.clientX; l.y = e.clientY; e.preventDefault(); } });
      const end = (e) => { if (!looks.delete(e.pointerId)) return; el.classList.remove('down'); up(); };
      bind(el, 'pointerup', end); bind(el, 'pointercancel', end);
    };
    press(T.jump, () => {
      const now = performance.now();
      if (doubled(now, lastJump)) { setFlying(!st.flying); lastJump = -1e9; } else lastJump = now;     // double tap: fly / stop flying
      btn.jump = true;
    }, () => { btn.jump = false; });
    press(T.dig, () => { digPointers++; inp.dig = true; }, () => { digPointers = Math.max(0, digPointers - 1); inp.dig = digPointers > 0; });
    press(T.place, () => { inp.place = true; }, () => {});
  }
  function wireCanvas() {
    canvas.style.touchAction = 'none';
    bind(canvas, 'pointerdown', (e) => {
      if (!st.running || st.modal) return;
      if (e.pointerType === 'mouse') {
        if (!st.locked && !lockFailed) { tryLock(); return; }        // the first click only captures the mouse
        if (!st.locked) { mouseDrag = true; canvas.setPointerCapture(e.pointerId); }
        if (e.button === 0) inp.dig = true;
        if (e.button === 2) inp.place = true;
      } else {
        canvas.setPointerCapture(e.pointerId);
        looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (o.onFirstLook) { o.onFirstLook(); o.onFirstLook = null; }
      }
      e.preventDefault();
    });
    bind(canvas, 'pointermove', (e) => {
      const l = looks.get(e.pointerId);
      if (l) { lookBy(e.clientX - l.x, e.clientY - l.y, P.touchLook); l.x = e.clientX; l.y = e.clientY; e.preventDefault(); }
    });
    const end = (e) => {
      if (e.pointerType === 'mouse') { if (e.button === 0) inp.dig = false; if (!e.buttons) mouseDrag = false; } else looks.delete(e.pointerId);
    };
    bind(canvas, 'pointerup', end); bind(canvas, 'pointercancel', end);
    bind(canvas, 'contextmenu', (e) => e.preventDefault());
  }
  wireCanvas();
  if (T) wireTouch();
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', () => { keys.clear(); inp.dig = false; });
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', refused);
  document.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });   // no pinch-zoom of the page on iOS

  // ------------------------------------------------------------------ frame
  function placeCamera() {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(st.pitch, st.yaw, 0);
    camera.position.set(st.pos.x, st.pos.y + P.eye, st.pos.z);
    if (st.third) {
      // over the shoulder: back along the view, a little up and to the right, stopping short of any wall
      const cp = Math.cos(st.pitch), dx = -Math.sin(st.yaw) * cp, dy = Math.sin(st.pitch), dz = -Math.cos(st.yaw) * cp, rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
      const ox = -dx * 3.6 + rx * 0.7, oy = -dy * 3.6 + 0.45, oz = -dz * 3.6 + rz * 0.7, e = camera.position;
      let k = 1;
      for (let i = 1; i <= 12; i++) { const t = i / 12; if (solid(Math.floor(e.x + ox * t), Math.floor(e.y + oy * t), Math.floor(e.z + oz * t))) { k = Math.max(0, (i - 1.5) / 12); break; } }
      e.set(e.x + ox * k, e.y + oy * k, e.z + oz * k);
    }
    camera.updateMatrixWorld(true);
  }
  /** Advance the game by dt seconds (no rendering). */
  function advance(dt) {
    readKeys();
    let rem = dt;
    while (rem > 1e-6) { const h = Math.min(rem, 1 / 60); snd.vy = st.vel.y; step(h); rem -= h; }
    st.time += dt;
    if (sound && dt > 0) {
      // steps by distance walked, a thump on landing, a puff on jumping, a splash on entering water
      if (!st.onGround) snd.air += dt;
      if (st.onGround && !snd.ground && snd.air > 0.12) sound.land(snd.vy < -13);
      else if (!st.onGround && snd.ground && st.vel.y > 5 && !st.flying) { sound.jump(); st.jumps++; }
      if (st.onGround) snd.air = 0;
      if (st.inWater && !snd.water) sound.splash();
      if ((st.onGround || st.inWater) && !st.flying && st.moving > 0.8) { snd.stride += st.moving * dt; if (snd.stride > (st.inWater ? 2.6 : 2.15)) { snd.stride = 0; sound.step(st.inWater); } }
      snd.ground = st.onGround; snd.water = st.inWater;
    }
    if (st.flying) st.flown += dt;
    if (st.inWater) { st.swum += dt; st.swumDist += st.moving * dt; }
    st.played += dt;
    if (st.onGround) st.walked += st.moving * dt;
    placeCamera();
    aim();
    digTick(dt);
    if (inp.place) { inp.place = false; placeNow(); }
    terrain.flush();
    if (o.onFrame) o.onFrame(st, dt);
    for (const f of ticks) f(st, dt);
  }
  // Picture sharpness against speed. The resolution may drop when the device cannot keep up, but a blurry
  // picture is worse than a slightly slower one, so by default it only drops when the game falls under about
  // 25 frames a second, and never below three quarters. The player can choose otherwise on the start panel:
  //   sharp     always full resolution
  //   balanced  the default described above
  //   fast      drops sooner (under ~38 fps) and as low as half
  const QUALITY = { sharp: { min: 1, slow: Infinity }, balanced: { min: 0.75, slow: 40 }, fast: { min: 0.5, slow: 26 } };
  const res = { base: 1, pr: 1, cap: 1, acc: 0, n: 0, hold: 0, good: 0, min: 0.75, slow: 40, mode: 'balanced' };
  try { const m = window.localStorage.getItem('bw-quality'); if (QUALITY[m]) res.mode = m; } catch (e) { /* storage may be closed to this page */ }
  function setQuality(mode) {
    if (!QUALITY[mode]) return;
    res.mode = mode; res.min = QUALITY[mode].min; res.slow = QUALITY[mode].slow;
    try { window.localStorage.setItem('bw-quality', mode); } catch (e) { /* not kept, that is all */ }
    res.pr = res.cap = res.base; res.acc = 0; res.n = 0; res.good = 0;       // start again from full resolution
    if (st.running && o.setPixelRatio) o.setPixelRatio(res.pr);
  }
  // how fast the view turns, for mouse and finger alike
  const look0 = { mouse: P.mouse, touch: P.touchLook };
  let lookMode = 'normal';
  const setLook = (m) => { if (!LOOK[m]) return; lookMode = m; P.mouse = look0.mouse * LOOK[m]; P.touchLook = look0.touch * LOOK[m]; try { window.localStorage.setItem('bw-look', m); } catch (e) { /* not kept */ } };
  try { const m = window.localStorage.getItem('bw-look'); if (LOOK[m]) setLook(m); } catch (e) { /* storage may be closed */ }
  window.__GAME_LOOK = { get mode() { return lookMode; }, set: setLook };
  window.__GAME_QUALITY = { get mode() { return res.mode; }, set: setQuality, get scale() { return res.base ? res.pr / res.base : 1; } };
  function initRes() {
    res.base = Math.min(window.devicePixelRatio || 1, o.maxPixelRatio ?? 2);
    res.min = QUALITY[res.mode].min; res.slow = QUALITY[res.mode].slow;
    res.pr = res.cap = res.base;
    if (o.setPixelRatio) o.setPixelRatio(res.pr);
  }
  function tuneRes(ms) {
    if (!o.setPixelRatio || res.slow === Infinity) return;
    res.acc += ms; res.n++;
    if (res.n < 40 && !(res.n >= 3 && res.acc > 2500)) return;       // judge 40 frames, or 2.5 s on a very slow device
    const avg = res.acc / res.n; res.acc = 0; res.n = 0;
    if (res.hold > 0) { res.hold--; return; }
    const floor = res.base * res.min;
    let pr = res.pr;
    if (avg > res.slow && pr > floor) { res.cap = pr * 0.94; pr = Math.max(floor, pr * (avg > res.slow * 2.2 ? 0.75 : 0.88)); res.good = 0; }
    else if (avg < 19) {
      if (++res.good % 15 === 0) res.cap = Math.min(res.base, res.cap * 1.1);      // after a long smooth stretch, try a little more
      const top = Math.min(res.base, res.cap);
      if (pr < top) pr = Math.min(top, pr * 1.1);
    }
    if (pr !== res.pr) { res.pr = pr; res.hold = 2; o.setPixelRatio(pr); }
  }

  // ------------------------------------------------------------------ drawing
  // With o.stage ({ renderer, scene, camera }) the loop can
  //  - wait for the GPU: never queue a frame while the last one is still being drawn. A slow or software GPU
  //    otherwise falls seconds behind, the picture freezes, and frame intervals stop telling how busy it is;
  //  - notice a black picture right after the start and draw the scene directly, without the world's
  //    post-processing, on hardware that cannot run it;
  //  - say which graphics device this is, so a screenshot of a problem is enough to act on.
  const S = o.stage && o.stage.renderer ? o.stage : null;
  const gl = S ? S.renderer.getContext() : null;
  let gpu = '';
  if (gl) { try { const d = gl.getExtension('WEBGL_debug_renderer_info'); gpu = String((d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || ''); } catch (e) { gpu = ''; } }
  window.__GAME_GPU = gpu;
  st.safeMode = false; st.pictureOk = false; st.contextLost = false; st.drawn = 0;
  let sync = null, syncAt = 0, gpuMs = 0, noteEl = null, noteTimer = 0;
  /** A short message over the game. keep = true: stays until replaced; otherwise it leaves after ms. */
  const seatNote = () => { if (noteEl) { noteEl.style.top = st.modal ? 'auto' : '22%'; noteEl.style.bottom = st.modal ? '6px' : 'auto'; } };
  function notice(text, keep, ms = 9000) {
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:48;max-width:min(560px,calc(100vw - 32px));padding:10px 16px;border-radius:10px;'
        + 'background:rgba(8,11,16,.9);border:1px solid rgba(255,255,255,.28);color:#f1f4f8;font:500 14px/1.7 system-ui,sans-serif;direction:rtl;text-align:center;white-space:pre-line;pointer-events:none;';
      document.body.appendChild(noteEl);
    }
    // over an open panel (the bag, the world panel) the note sits at the bottom edge, where it hides the least; clicks pass through it
    seatNote();
    noteEl.textContent = text; noteEl.hidden = false;
    clearTimeout(noteTimer);
    if (!keep) noteTimer = setTimeout(() => { noteEl.hidden = true; }, ms);
  }
  function draw() {
    if (st.safeMode && S) { S.renderer.setRenderTarget(null); S.renderer.render(S.scene, S.camera); } else o.render();
    st.drawn++;
  }
  function pictureIsBlack() {
    S.renderer.setRenderTarget(null);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4);
    for (let j = 1; j <= 5; j++) for (let i = 1; i <= 7; i++) {
      gl.readPixels((w * i / 8) | 0, (h * j / 6) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (px[0] > 6 || px[1] > 6 || px[2] > 6) return false;
    }
    return true;
  }
  /** The game opens on a lit view, so an all-black picture in the first frames means the drawing failed. */
  function checkPicture() {
    if (!S || st.pictureOk || !(st.drawn === 2 || st.drawn === 30)) return;
    if (!pictureIsBlack()) { if (st.drawn >= 30) st.pictureOk = true; return; }
    if (!st.safeMode) {
      st.safeMode = true; st.drawn = 27;                           // look again three frames from now
      notice('شغّلنا الرسم المبسّط، لأن جهازك ما عرض مؤثرات الصورة.', false);
      if (o.onSafeMode) o.onSafeMode();
    } else {
      st.pictureOk = true;
      notice('جهازك ما قدر يرسم العالم. صوّر الشاشة وأرسلها.\n' + (gpu || 'كرت الشاشة غير معروف'), true);
    }
  }
  if (S) {
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); st.contextLost = true; sync = null; notice('انقطع الرسم على جهازك. جاري الاستعادة…\n' + gpu, true); });
    canvas.addEventListener('webglcontextrestored', () => { st.contextLost = false; notice('رجع الرسم.', false); });
  }

  let raf = 0, last = 0;
  function frame(now) {
    if (!st.running) return;
    raf = requestAnimationFrame(frame);
    const ms = now - last; last = now;
    advance(Math.min(0.1, Math.max(0, ms / 1000)));
    if (st.contextLost) return;
    if (sync) {
      const r = gl.clientWaitSync(sync, 0, 0);
      if (r === gl.TIMEOUT_EXPIRED && now - syncAt < 3000) return;          // the GPU is still on the last frame
      gl.deleteSync(sync); sync = null; gpuMs = now - syncAt;
    }
    draw();
    if (gl && gl.fenceSync) { sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); syncAt = now; }
    checkPicture();
    tuneRes(Math.max(ms, gpuMs));
  }

  unstick();
  placeCamera();
  return {
    state: st, input: inp, tuning: P, res, isSolid, isLiquid, gpu, setSlot, setModal, setFlying, notice, sound, give, changed: inventoryChanged,
    /** Call fn(state, dt) every frame, after the world's own onFrame. */
    onTick(fn) { ticks.push(fn); },
    /** Call fn(hit) when the place button is pressed, before anything else; returning true uses the press up. */
    onUseFirst(fn) { firsts.push(fn); },
    /** Draw the world now and hand back the picture as a PNG blob (what the camera takes: the world without the menus). */
    capture(done) { draw(); canvas.toBlob((b) => done(b), 'image/png'); },
    net,
    /** What another player did, applied here without counting it as this player's own: a block put down, a block dug. */
    remotePlace(x, y, z, id, yaw) {
      if (!world.inb(x, y, z) || !blocks[id]) return;
      terrain.setBlock(x, y, z, id);
      const y0 = st.yaw; st.yaw = yaw;                               // the world asks the kit to lay beds and hang doors by the heading of whoever placed them
      try { if (o.onPlace) o.onPlace(x, y, z, id); } finally { st.yaw = y0; }
      aim();
    },
    remoteDig(x, y, z) {
      if (!world.inb(x, y, z)) return;
      const id = world.get(x, y, z);
      if (!id) return;
      terrain.setBlock(x, y, z, 0);
      const up = world.get(x, y + 1, z);
      if (up && kindOf(up) === 'cross') terrain.setBlock(x, y + 1, z, 0);
      if (o.onBreak) o.onBreak({ x, y, z, id, nx: 0, ny: 1, nz: 0, remote: true });
      aim();
    },
    /** The bag tells the controller how to make an item from an id, so that what is dug can start a new pile. */
    set itemOf(f) { itemOf = f; }, get itemOf() { return itemOf; },
    start() {
      if (held) { held = false; setModal(false); return; }      // back from the pause menu of a shared game
      if (st.running) return;
      st.running = true; initRes(); last = performance.now(); raf = requestAnimationFrame(frame);
      if (sound) sound.start();                       // start() runs inside the start button's click, which is what lets the browser play sound
    },
    stop() {
      // in a shared game the world must keep going for the others: the pause menu only takes the controls away
      if (shared && st.running) { held = true; setModal(true); return; }
      st.running = false; cancelAnimationFrame(raf); inp.dig = false; keys.clear(); if (sync) { gl.deleteSync(sync); sync = null; }
    },
    /** True while this player is in a shared game (the multiplayer link sets it). */
    get shared() { return shared; }, set shared(v) { shared = !!v; },
    /** Call from a click handler: capture the mouse on desktop. */
    lock: tryLock,
    select, advance, raycast, placeNow,
    /** For tests: run n fixed steps without waiting for frames, then draw once. */
    tick(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) advance(dt); draw(); },
  };
}

// ---------------------------------------------------------------------- start / pause panel
const PANEL_CSS = `
#playPanel { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; direction: rtl;
  background: radial-gradient(ellipse at center, rgba(4, 8, 14, .58), rgba(2, 4, 8, .86)); color: #f1f4f8; -webkit-user-select: none; user-select: none; }
#playPanel[hidden], #playPanel .box[hidden] { display: none; }
#playPanel .box { box-sizing: border-box; width: min(600px, calc(100vw - 32px)); max-height: calc(100vh - 16px); overflow: auto; overscroll-behavior: contain; padding: 22px 26px 20px; border-radius: 14px;
  background: rgba(10, 14, 20, .82); border: 1px solid var(--pp-line, rgba(255, 255, 255, .22)); box-shadow: 0 18px 60px rgba(0, 0, 0, .55); text-align: center; }
#playPanel h1 { margin: 0 0 4px; font-size: 30px; line-height: 1.2; font-weight: 700; color: var(--pp-accent, #fff); }
#playPanel p { margin: 0 0 14px; font-size: 14px; line-height: 1.6; opacity: .82; }
#playPanel ul { list-style: none; margin: 0 0 16px; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; text-align: right; font-size: 13.5px; line-height: 1.5; }
#playPanel li { display: flex; gap: 8px; align-items: baseline; }
#playPanel li b { flex: none; min-width: 74px; font-weight: 700; color: var(--pp-accent, #fff); }
#playPanel button { font: inherit; font-size: 17px; font-weight: 700; color: #0b0f14; background: var(--pp-accent, #fff); border: 0; border-radius: 10px; padding: 11px 44px; min-height: 46px; cursor: pointer; }
#playPanel .menu { display: inline-block; margin: 10px 4px 0; padding: 6px 18px; min-height: 0; font-size: 13.5px; font-weight: 500; color: inherit; background: none; border: 1px solid var(--pp-line, rgba(255, 255, 255, .3)); opacity: .85; }
#playPanel .note { margin: 12px 0 0; font-size: 12px; opacity: .6; }
#playPanel .gpu { margin: 6px 0 0; font: 400 10.5px/1.4 system-ui, sans-serif; opacity: .38; direction: ltr; word-break: break-word; }
#playPanel .go { display: inline-block; }
#playPanel .esc { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 4px; }
#playPanel .esc .go { grid-column: 1 / -1; }
#playPanel .esc .menu { margin: 0; padding: 10px 12px; min-height: 44px; font-size: 14.5px; opacity: 1; }
#playPanel .sub h2 { margin: 0 0 10px; font-size: 22px; color: var(--pp-accent, #fff); }
#playPanel .cards { list-style: none; margin: 0 0 12px; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; text-align: right; }
#playPanel .cards li { display: block; padding: 7px 10px; border-radius: 9px; border: 1px solid rgba(255, 255, 255, .14); font-size: 12.5px; line-height: 1.45; opacity: .55; }
#playPanel .cards li.done { opacity: 1; border-color: var(--pp-line, rgba(255, 255, 255, .3)); background: rgba(255, 255, 255, .06); }
#playPanel .cards li b { display: block; min-width: 0; font-size: 14px; color: var(--pp-accent, #fff); }
#playPanel .cards.keys li { display: flex; align-items: center; gap: 10px; font-size: 13.5px; }
#playPanel .cards.keys .key { margin: 0; min-width: 76px; padding: 6px 10px; font-weight: 700; opacity: 1; }
#playPanel .cards.keys .key.wait { color: #0b0f14; background: var(--pp-accent, #fff); }
#playPanel textarea { box-sizing: border-box; width: 100%; height: 110px; margin: 6px 0; padding: 9px 11px; font: inherit; font-size: 15px; line-height: 1.6; color: #f1f4f8; background: rgba(255, 255, 255, .07); border: 1px solid rgba(255, 255, 255, .3); border-radius: 10px; resize: none; -webkit-user-select: text; user-select: text; }
#playPanel .nm { display: flex; align-items: center; gap: 8px; justify-content: center; font-size: 14px; }
#playPanel .nm input { width: 130px; min-height: 40px; padding: 4px 10px; font: inherit; font-size: 15px; text-align: center; color: #f1f4f8; background: rgba(255, 255, 255, .07); border: 1px solid rgba(255, 255, 255, .3); border-radius: 9px; -webkit-user-select: text; user-select: text; }
#playPanel .stars { direction: ltr; margin: 4px 0; }
#playPanel .star { padding: 2px 6px; min-height: 0; font-size: 30px; line-height: 1; color: rgba(255, 255, 255, .28); background: none; }
#playPanel .star.on { color: #ffd76a; }
#playRotate { position: fixed; inset: 0; z-index: 60; display: none; align-items: center; justify-content: center; direction: rtl; text-align: center; padding: 24px;
  background: #06090e; color: #f1f4f8; font-size: 18px; line-height: 1.7; }
@media (pointer: coarse) and (orientation: portrait) { #playRotate { display: flex; } }
@media (max-height: 430px) { #playPanel .esc { gap: 5px; margin: 6px 0 2px; } #playPanel .esc .menu { padding: 6px 8px; min-height: 40px; font-size: 13px; } #playPanel textarea { height: 64px; } #playPanel .cards { gap: 4px; } #playPanel .cards li { padding: 4px 8px; }
  #playPanel .box { padding: 12px 18px 12px; } #playPanel h1 { font-size: 22px; } #playPanel p { margin-bottom: 8px; font-size: 12.5px; }
  #playPanel ul { gap: 3px 12px; font-size: 12px; margin-bottom: 10px; } #playPanel button { padding: 8px 36px; min-height: 44px; font-size: 15px; } #playPanel .note { margin-top: 6px; font-size: 11px; } }
`;

/**
 * Start panel (also used as the pause panel on desktop). Arabic, built in HTML.
 *   const panel = createPlayPanel({ title, tagline, fontFamily, accent, line, touch, onStart });
 *   panel.show('start' | 'pause');  panel.hide();
 * onStart runs inside the click, so it may capture the mouse or go full screen.
 */
export function createPlayPanel(o) {
  const css = document.createElement('style');
  css.textContent = PANEL_CSS;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'playPanel';
  el.style.fontFamily = o.fontFamily || 'sans-serif';
  if (o.accent) el.style.setProperty('--pp-accent', o.accent);
  if (o.line) el.style.setProperty('--pp-line', o.line);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const K = () => (window.__GAME_KEYS ? window.__GAME_KEYS.map : {});
  const kn = (a) => keyName(K()[a] || '');
  const rows = () => (o.touch
    ? [['العصا اليسار', 'المشي، وادفعها للآخر تركض'], ['اسحب على الشاشة', 'النظر'], ['زر الحفر', 'اضغط مطوّلًا لتكسر المكعب'], ['زر البناء', 'يضع المكعب، ويفتح الباب والصندوق'], ['زر القفز', 'قفز، ومرّتين تطير'], ['زر الحقيبة', 'أغراضك والتصنيع والمهام']]
    : [[[kn('fwd'), kn('left'), kn('back'), kn('right')].join(' '), 'المشي'], [kn('fwd') + ' مرّتين', 'ركض'], ['الفأرة', 'النظر'], [kn('jump'), 'قفز وسباحة'], [kn('jump') + ' مرّتين', 'طيران'], [kn('bag'), 'الحقيبة والمهام'], [kn('view'), 'شوف شكلك من ورا'], [kn('menu'), 'الوقت والجو'], ['Esc', 'القائمة'], [kn('mute'), 'الصوت'], ['الزر الأيسر', 'اضغط مطوّلًا لتكسر المكعب'], ['الزر الأيمن', 'يضع المكعب، ويفتح الباب والصندوق'], ['1 … 9 أو العجلة', 'اختيار المربع']]);
  const toMenu = o.onMenu || (window.__GAME && window.__GAME.onMenu);      // back to the world picker, when the page was opened from it
  const box = document.createElement('div'); box.className = 'box';
  const sub = document.createElement('div'); sub.className = 'box sub'; sub.hidden = true;
  el.append(box, sub);
  document.body.appendChild(el);
  const rot = document.createElement('div');
  rot.id = 'playRotate'; rot.style.fontFamily = el.style.fontFamily; rot.textContent = 'دوّر الجوال بالعرض عشان تلعب';
  document.body.appendChild(rot);

  let mode = 'start', view = 'main', waitKey = null, stars = 0, sent = '', confirmNew = false;
  const NAMES = { sound: () => { const s = window.__GAME_SOUND; return s ? (s.muted ? 'الصوت: مطفي' : 'الصوت: شغّال') : ''; },
    look: () => ({ slow: 'سرعة النظر (الماوس واللمس): بطيئة', normal: 'سرعة النظر (الماوس واللمس): عادية', fast: 'سرعة النظر (الماوس واللمس): سريعة' }[(window.__GAME_LOOK || {}).mode] || ''),
    video: () => ({ sharp: 'الصورة: واضحة دايم', balanced: 'الصورة: متوازنة', fast: 'الصورة: أسرع (تغبّش أكثر)' }[(window.__GAME_QUALITY || {}).mode] || ''),
    diff: () => ({ easy: 'الصعوبة: سهلة', normal: 'الصعوبة: عادية', hard: 'الصعوبة: صعبة' }[(window.__GAME_DIFF || {}).mode] || ''),
    mon: () => { const l = window.__GAME_LIFE; return l ? (l.monsters ? 'الوحوش: موجودة' : 'الوحوش: بدون') : ''; } };
  const cycle = (obj, list) => { if (obj) obj.set(list[(list.indexOf(obj.mode) + 1) % list.length]); };
  const btn = (act, text, cls = 'menu') => (text ? `<button type="button" class="${cls}" data-act="${act}">${text}</button>` : '');
  const clock = (sec) => { const m = Math.floor(sec / 60), h = Math.floor(m / 60); return h ? h + ' س ' + (m % 60) + ' د' : m + ' د ' + Math.floor(sec % 60) + ' ث'; };

  function drawMain() {
    const net = window.__GAME_NET, f = window.__GAME_FEATS, save = window.__GAME_SAVE;
    if (mode === 'start') {
      box.innerHTML = `<h1>${esc(o.title)}</h1><p>${esc(o.tagline || '')}</p><ul>${rows().map(([k, v]) => `<li><b dir="auto">${esc(k)}</b><span>${esc(v)}</span></li>`).join('')}</ul>`
        + btn('go', save && save.loaded ? 'كمّل عالمك' : 'ابدأ اللعب', 'go')
        + '<div>' + btn('options', 'الإعدادات') + (net ? btn('net', 'العب مع ربعك') : '') + (toMenu ? btn('worlds', 'العوالم') : '') + '</div>'
        + `<div class="note">${esc(save && save.loaded ? 'عالمك محفوظ في هذا المتصفح: تكمل من وين وقفت.' : o.note || '')}</div><div class="gpu">${esc(window.__GAME_GPU || '')}</div>`;
      return;
    }
    const fl = f ? f.list() : [];
    box.innerHTML = `<h1>${esc(o.title)}</h1><div class="esc">`
      + btn('go', 'الرجوع للعبة', 'go')
      + btn('feats', 'الإنجازات ' + fl.filter((q) => q.done).length + '/' + fl.length)
      + btn('stats', 'الإحصائيات')
      + btn('note', 'أرسل ملاحظة')
      + btn('bug', 'بلّغ عن خطأ')
      + btn('options', 'الإعدادات')
      + (net ? btn('net', net.role ? 'العب مع ربعك (الغرفة ' + net.code + ')' : 'العب مع ربعك') : '')
      + btn('quit', toMenu ? 'احفظ واطلع للقائمة' : 'احفظ')
      + `</div><div class="note">${esc(sent)}</div><div class="gpu">${esc(window.__GAME_GPU || '')}</div>`;
  }
  function drawSub() {
    let h = '';
    if (view === 'feats') {
      const f = window.__GAME_FEATS;
      h = '<h2>الإنجازات</h2><ol class="cards">' + (f ? f.list() : []).map((q) => `<li class="${q.done ? 'done' : ''}"><b>${esc(q.name)}</b>${esc(q.how)}</li>`).join('') + '</ol>';
    } else if (view === 'stats') {
      const st = window.__GAME_STATE || {}, adv = window.__GAME_ADV, lv = window.__GAME_FEATS && window.__GAME_FEATS.level ? window.__GAME_FEATS.level() : null;
      const made = Object.values(st.made || {}).reduce((a, n) => a + n, 0);
      const list = [['الوقت اللي لعبته', clock(st.played || 0)], ['مشيت', Math.round(st.walked || 0) + ' مكعب'], ['سبحت', Math.round(st.swumDist || 0) + ' مكعب'], ['طرت', clock(st.flown || 0)], ['قفزت', (st.jumps || 0) + ' مرة'],
        ['مكعبات كسرتها', st.broken || 0], ['مكعبات حطيتها', st.placed || 0], ['أغراض صنعتها', made], ['حيوانات صدتها', (st.kills || {}).animal || 0], ['وحوش قضيت عليها', (st.kills || {}).monster || 0],
        ['وجبات أكلتها', st.eaten || 0], ['صناديق فتحتها', st.opened || 0], ['صفقات مع التاجر', st.traded || 0], ['كنوز لقيتها', adv ? adv.found : 0], ['مرات نمت', st.slept || 0], ['مرات طحت للصفر', st.deaths || 0], ['الخبرة', (st.xp || 0) + (lv != null ? ' (المستوى ' + lv + ')' : '')]];
      h = '<h2>الإحصائيات</h2><ol class="cards stats">' + list.map(([k, v]) => `<li class="done"><b dir="auto">${esc(v)}</b>${esc(k)}</li>`).join('') + '</ol>';
    } else if (view === 'note' || view === 'bug') {
      h = `<h2>${view === 'bug' ? 'بلّغ عن خطأ' : 'أرسل ملاحظة'}</h2><p>${view === 'bug' ? 'اكتب وش صار، ووين، ووش كنت تسوي قبلها. يروح البلاغ لصاحب الموقع مع نوع الجهاز والعالم.' : 'قل رأيك في اللعبة أو اللي تبي ينضاف. يروح لصاحب الموقع.'}</p>`
        + (view === 'note' ? '<div class="stars">' + [1, 2, 3, 4, 5].map((n) => `<button type="button" class="star${n <= stars ? ' on' : ''}" data-star="${n}" aria-label="${n} من 5">★</button>`).join('') + '</div>' : '')
        + '<textarea maxlength="700" placeholder="اكتب هني…"></textarea><div class="note"></div>' + btn('send', 'أرسل', 'go');
    } else if (view === 'options') {
      const save = window.__GAME_SAVE;
      h = '<h2>الإعدادات</h2><div class="esc">' + btn('sound', NAMES.sound()) + btn('look', NAMES.look()) + btn('video', NAMES.video()) + btn('diff', NAMES.diff()) + btn('mon', NAMES.mon())
        + (window.__GAME_NET ? `<label class="nm">اسمك <input maxlength="16" value="${esc(window.__GAME_NET.name || '')}" placeholder="لاعب"></label>` + btn('name', 'احفظ الاسم') : '')
        + (o.touch ? '' : btn('keys', 'أزرار التحكم')) + (save && save.has() ? btn('new', confirmNew ? 'متأكد؟ اضغط مرة ثانية يمسح عالمك المحفوظ' : 'عالم جديد (يمسح المحفوظ)') : '') + '</div>'
        + `<div class="note">${o.touch ? 'أزرار اللمس ثابتة في مكانها. ' : ''}اللغة: العربية. اللغات الثانية ما انضافت للعبة للحين.</div>`;
    } else if (view === 'keys') {
      h = '<h2>أزرار التحكم</h2><p>اضغط على الزر اللي تبي تغيّره، بعدين اضغط المفتاح الجديد. Esc يلغي. الأسهم تمشي دايم، والأرقام للمربعات.</p><ol class="cards keys">'
        + KEY_ACTIONS.map(([a, name]) => `<li class="done"><button type="button" class="menu key${waitKey === a ? ' wait' : ''}" data-key="${a}" dir="ltr">${waitKey === a ? '…' : esc(kn(a))}</button>${esc(name)}</li>`).join('') + '</ol>' + btn('keys0', 'رجّع الأزرار الأصلية');
    }
    sub.innerHTML = h + '<div>' + btn('back', 'رجوع') + '</div>';
  }
  function draw() { box.hidden = view !== 'main'; sub.hidden = view === 'main'; if (view === 'main') drawMain(); else drawSub(); }
  function go(v) { view = v; waitKey = null; confirmNew = false; draw(); }

  async function send() {
    const ta = sub.querySelector('textarea'), out = sub.querySelector('.note'), text = ta ? ta.value.trim() : '';
    if (text.length < 3) { out.textContent = 'اكتب شي أول.'; return; }
    if (view === 'note' && !stars) { out.textContent = 'اختر كم نجمة.'; return; }
    const bug = view === 'bug';
    const tech = bug ? '\n(' + [o.touch ? 'لمس' : 'حاسوب', window.innerWidth + 'x' + window.innerHeight, String(window.__GAME_GPU || '').slice(0, 70)].join('؛ ') + ')' : '';
    out.textContent = 'أرسل…';
    try {
      const r = await fetch(FEEDBACK_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: bug ? 3 : stars, chips: bug ? ['fbChipBug'] : [], note: ('[عالم المكعبات · ' + o.title + (bug ? ' · خطأ' : '') + '] ' + text + tech).slice(0, 1000), lang: 'ar' }) });
      if (!r.ok) throw new Error('refused');
      sent = bug ? 'وصل بلاغك. مشكور.' : 'وصلت ملاحظتك. مشكور.'; stars = 0;
      go('main');
    } catch (e) { out.textContent = 'ما قدرت أرسل. تأكد من النت وجرّب مرة ثانية. (الإرسال يشتغل من الموقع نفسه)'; }
  }
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.star) { stars = +t.dataset.star; for (const b of sub.querySelectorAll('.star')) b.classList.toggle('on', +b.dataset.star <= stars); return; }
    if (t.dataset.key) { waitKey = t.dataset.key; drawSub(); return; }
    const act = t.dataset.act;
    if (act === 'go') { el.hidden = true; sent = ''; o.onStart(); }
    else if (act === 'back') go(view === 'keys' ? 'options' : 'main');
    else if (['feats', 'stats', 'note', 'bug', 'options', 'keys'].includes(act)) go(act);
    else if (act === 'send') send();
    else if (act === 'net') { const n = window.__GAME_NET; if (n) { el.hidden = true; n.open(() => { el.hidden = false; draw(); }); } }
    else if (act === 'worlds') toMenu();
    else if (act === 'quit') { const s = window.__GAME_SAVE, ok = s ? s.save() : false; sent = ok ? 'انحفظ عالمك في هذا المتصفح ✓' : (s && s.why ? s.why : 'ما قدرت أحفظ.'); if (toMenu && (ok || !s)) toMenu(); else draw(); }
    else if (act === 'sound') { const s = window.__GAME_SOUND; if (s) { s.setMuted(!s.muted); if (!s.muted) { s.start(); s.ui(); } } drawSub(); }
    else if (act === 'look') { cycle(window.__GAME_LOOK, ['normal', 'fast', 'slow']); drawSub(); }
    else if (act === 'video') { cycle(window.__GAME_QUALITY, ['balanced', 'sharp', 'fast']); drawSub(); }
    else if (act === 'diff') { cycle(window.__GAME_DIFF, ['normal', 'hard', 'easy']); drawSub(); }
    else if (act === 'mon') { const l = window.__GAME_LIFE; if (l) l.setMonsters(!l.monsters); drawSub(); }
    else if (act === 'name') { const inp = sub.querySelector('.nm input'), n = window.__GAME_NET; if (inp && n) { n.setName(inp.value); drawSub(); const out = sub.querySelector('.note'); if (out) out.textContent = 'اسمك الحين: ' + n.name; } }
    else if (act === 'keys0') { if (window.__GAME_KEYS) window.__GAME_KEYS.reset(); drawSub(); }
    else if (act === 'new') { if (!confirmNew) { confirmNew = true; drawSub(); } else { const s = window.__GAME_SAVE; if (s) s.clear(); window.location.reload(); } }
  });
  // while the panel is up the keyboard is the panel's: a key waited for is taken, and typing in the note box is not the game's
  el.addEventListener('keydown', (e) => {
    if (waitKey) { e.preventDefault(); e.stopPropagation(); if (e.code !== 'Escape' && window.__GAME_KEYS) window.__GAME_KEYS.set(waitKey, e.code); waitKey = null; drawSub(); return; }
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) e.stopPropagation();
  });
  window.addEventListener('keydown', (e) => { if (!el.hidden && waitKey) { e.preventDefault(); e.stopImmediatePropagation(); if (e.code !== 'Escape' && window.__GAME_KEYS) window.__GAME_KEYS.set(waitKey, e.code); waitKey = null; drawSub(); } }, true);
  window.__GAME_PANEL = () => { if (!el.hidden && view === 'main') draw(); };      // something the panel shows changed (a save was read)
  return {
    el,
    show(m = 'start') { mode = m; view = 'main'; waitKey = null; confirmNew = false; el.hidden = false; draw(); },
    hide() { el.hidden = true; },
    get view() { return view; }, go,
  };
}

/** Ask for full screen + landscape on phones. Must run inside a click; every refusal is fine. */
export function goImmersive() {
  try {
    const d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen;
    const r = f ? f.call(d) : null;
    const lock = () => { try { const q = screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null; if (q && q.catch) q.catch(() => {}); } catch (e) { /* not supported here */ } };
    if (r && r.then) r.then(lock).catch(() => {}); else lock();
  } catch (e) { /* the frame refuses full screen: play in the page as it is */ }
}
