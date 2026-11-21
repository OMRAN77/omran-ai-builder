// First-person play controller shared by every world: input (keyboard + mouse, touch),
// walking physics against the voxel world, block targeting, digging and placing.
//
//   const play = createPlay({
//     camera, canvas, world, blocks, terrain,        // terrain: createVoxelTerrain(...) from voxel.js
//     spawn: { x, y, z, yaw, pitch },                 // y = feet
//     slots: [{ tool: true }, { id: B.STONE, n: 20 }, ...],   // hotbar; the world owns icons / names
//     touch: { stick, knob, jump, dig, place } | null,        // HUD elements for touch play
//     isLiquid(id), pickable(id), canBreak(id, x, y, z), canPlace(x, y, z, id), hardness(id), dropOf(id),
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

const E = 1e-4;

export function createPlay(o) {
  const { camera, canvas, world, blocks, terrain } = o;
  const { sx, sy, sz } = world;
  const kindOf = (id) => (id && blocks[id] ? (blocks[id].kind ?? 'solid') : 'air');
  const CUBE = { solid: 1, cutout: 1, translucent: 1 };
  const isLiquid = o.isLiquid ?? ((id) => kindOf(id) === 'liquid');
  const isSolid = o.isSolid ?? ((id) => !!CUBE[kindOf(id)] && !isLiquid(id));
  const pickable = o.pickable ?? ((id) => id !== 0 && !isLiquid(id) && kindOf(id) !== 'none' && kindOf(id) !== 'air');
  const hardness = o.hardness ?? ((id) => (kindOf(id) === 'cross' ? 0.08 : 0.45));
  const P = { hw: 0.3, height: 1.8, eye: 1.62, walk: 4.4, sprint: 6.8, jump: 8.7, gravity: 27, reach: 5.5, swim: 3.4, autoJump: true, mouse: 0.0022, touchLook: 0.0052, ...(o.tuning || {}) };

  const st = {
    pos: new THREE.Vector3(o.spawn.x, o.spawn.y, o.spawn.z), vel: new THREE.Vector3(),
    yaw: o.spawn.yaw || 0, pitch: o.spawn.pitch || 0,
    onGround: false, inWater: false, moving: 0, hit: null,
    dig: { on: false, x: 0, y: 0, z: 0, t: 0, need: 1, progress: 0 },
    slots: o.slots, sel: 0, running: false, locked: false, time: 0, broken: 0, placed: 0,
  };
  const inp = { fx: 0, fz: 0, jump: false, dig: false, sprint: false, place: false };
  const keys = new Set();

  // ------------------------------------------------------------------ collision
  const solid = (x, y, z) => {
    if (x < 0 || z < 0 || x >= sx || z >= sz || y < 0) return true;      // the world is a walled box with a floor
    if (y >= sy) return false;
    return isSolid(world.get(x, y, z));
  };
  function collides(px, py, pz) {
    const x0 = Math.floor(px - P.hw + E), x1 = Math.floor(px + P.hw - E);
    const y0 = Math.floor(py + E), y1 = Math.floor(py + P.height - E);
    const z0 = Math.floor(pz - P.hw + E), z1 = Math.floor(pz + P.hw - E);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (solid(x, y, z)) return true;
    return false;
  }
  function unstick() { let n = 0; while (collides(st.pos.x, st.pos.y, st.pos.z) && n++ < sy) st.pos.y = Math.floor(st.pos.y) + 1; }

  function step(dt) {
    const p = st.pos, v = st.vel;
    const sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    let wx = cos * inp.fx - sin * inp.fz, wz = -sin * inp.fx - cos * inp.fz;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    st.inWater = isLiquid(world.get(Math.floor(p.x), Math.floor(p.y + 0.9), Math.floor(p.z)));
    const wading = !st.inWater && isLiquid(world.get(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z)));   // at the surface: feet wet, chest out
    const speed = (inp.sprint ? P.sprint : P.walk) * (st.inWater ? 0.6 : 1);
    const k = Math.min(1, (st.onGround || st.inWater ? 14 : 4) * dt);
    v.x += (wx * speed - v.x) * k; v.z += (wz * speed - v.z) * k;
    const wasGround = st.onGround;
    if (st.inWater) {
      v.y -= 7 * dt; v.y *= 1 - Math.min(1, 3 * dt);
      if (inp.jump) v.y = P.swim;
    } else {
      v.y -= P.gravity * dt;
      if (inp.jump && (st.onGround || wading)) { v.y = P.jump; st.onGround = false; }       // from the surface a jump clears the bank
    }
    if (v.y < -40) v.y = -40;

    let blocked = false;
    p.x += v.x * dt;
    if (collides(p.x, p.y, p.z)) { p.x = v.x > 0 ? Math.floor(p.x + P.hw) - P.hw - E : Math.floor(p.x - P.hw) + 1 + P.hw + E; v.x = 0; blocked = true; }
    p.z += v.z * dt;
    if (collides(p.x, p.y, p.z)) { p.z = v.z > 0 ? Math.floor(p.z + P.hw) - P.hw - E : Math.floor(p.z - P.hw) + 1 + P.hw + E; v.z = 0; blocked = true; }
    p.y += v.y * dt;
    st.onGround = false;
    if (collides(p.x, p.y, p.z)) {
      if (v.y <= 0) { p.y = Math.floor(p.y + E) + 1; st.onGround = true; } else p.y = Math.floor(p.y + P.height) - P.height - E;
      v.y = 0;
    }
    // step up one block on its own: the terrain is terraced and touch players have no spare thumb
    if (P.autoJump && blocked && wasGround && st.onGround && wl > 0.25 && !st.inWater) {
      const fy = Math.floor(p.y + E), tx = Math.floor(p.x + (wx / wl) * (P.hw + 0.45)), tz = Math.floor(p.z + (wz / wl) * (P.hw + 0.45));
      if (solid(tx, fy, tz) && !solid(tx, fy + 1, tz) && !solid(tx, fy + 2, tz) && !solid(Math.floor(p.x), fy + 2, Math.floor(p.z))) { v.y = P.jump; st.onGround = false; }
    }
    // swimming into a bank climbs out of the water instead of getting stuck against it
    if (P.autoJump && blocked && (st.inWater || wading) && wl > 0.25) {
      const fy = Math.floor(p.y + 0.9), tx = Math.floor(p.x + (wx / wl) * (P.hw + 0.45)), tz = Math.floor(p.z + (wz / wl) * (P.hw + 0.45));
      for (let up = 0; up <= 1; up++) if (solid(tx, fy + up, tz) && !solid(tx, fy + up + 1, tz) && !solid(tx, fy + up + 2, tz)) { v.y = Math.max(v.y, 6.4); break; }
    }
    if (p.y < -20) { p.set(o.spawn.x, o.spawn.y, o.spawn.z); v.set(0, 0, 0); unstick(); }
    st.moving = Math.hypot(v.x, v.z);
  }

  // ------------------------------------------------------------------ targeting
  const _dir = new THREE.Vector3(), _eye = new THREE.Vector3();
  /** Walk the grid along a ray (Amanatides & Woo). The cell the ray starts in is skipped. */
  function raycast(org, dir, max) {
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
      if (id && pickable(id)) return { x, y, z, id, nx, ny, nz, t, px: org.x + dir.x * t, py: org.y + dir.y * t, pz: org.z + dir.z * t };
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
  function collect(id) {
    const want = o.dropOf ? o.dropOf(id) : id;
    if (!want) return;
    const s = st.slots.find((q) => q.id === want);
    if (s) { s.n = Math.min(999, (s.n || 0) + 1); inventoryChanged(); }
  }
  function breakBlock(h) {
    terrain.setBlock(h.x, h.y, h.z, 0);
    const up = world.get(h.x, h.y + 1, h.z);
    if (up && kindOf(up) === 'cross') terrain.setBlock(h.x, h.y + 1, h.z, 0);     // a plant cannot stand on nothing
    st.broken++;
    collect(h.id);
    if (o.onBreak) o.onBreak(h);
  }
  function digTick(dt) {
    const d = st.dig, h = st.hit;
    const can = inp.dig && h && h.y > 0 && (!o.canBreak || o.canBreak(h.id, h.x, h.y, h.z) !== false);
    if (!can) { d.on = false; d.t = 0; d.progress = 0; return; }
    if (!d.on || d.x !== h.x || d.y !== h.y || d.z !== h.z) { d.on = true; d.x = h.x; d.y = h.y; d.z = h.z; d.t = 0; d.need = Math.max(0.01, hardness(h.id)); }
    d.t += dt; d.progress = Math.min(1, d.t / d.need);
    if (d.t >= d.need) { breakBlock(h); d.on = false; d.t = 0; d.progress = 0; aim(); }
  }
  function placeNow() {
    const h = st.hit, s = st.slots[st.sel];
    if (!h || !s || !s.id || !(s.n > 0)) return false;
    const onPlant = kindOf(h.id) === 'cross';
    const x = onPlant ? h.x : h.x + h.nx, y = onPlant ? h.y : h.y + h.ny, z = onPlant ? h.z : h.z + h.nz;
    if (!world.inb(x, y, z) || y >= sy - 1) return false;
    const cur = world.get(x, y, z);
    if (cur && !isLiquid(cur) && kindOf(cur) !== 'cross') return false;
    if (o.canPlace && o.canPlace(x, y, z, s.id) === false) return false;        // the world may keep blocks out of some places
    if (isSolid(s.id)) {      // never wall the player in
      const p = st.pos;
      if (x + 1 > p.x - P.hw && x < p.x + P.hw && z + 1 > p.z - P.hw && z < p.z + P.hw && y + 1 > p.y && y < p.y + P.height) return false;
    }
    terrain.setBlock(x, y, z, s.id);
    s.n--; st.placed++;
    inventoryChanged();
    if (o.onPlace) o.onPlace(x, y, z, s.id);
    aim();
    return true;
  }
  function select(i) {
    const n = st.slots.length;
    st.sel = ((i % n) + n) % n;
    inventoryChanged();
  }

  // ------------------------------------------------------------------ input: keyboard + mouse
  const clampPitch = () => { st.pitch = Math.max(-1.5, Math.min(1.5, st.pitch)); };
  const lookBy = (dx, dy, k) => { st.yaw -= dx * k; st.pitch -= dy * k; clampPitch(); };
  function readKeys() {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (!stick.id) { inp.fx = r; inp.fz = f; }
    inp.jump = keys.has('Space') || btn.jump;
    inp.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  }
  const onKey = (e) => {
    if (!st.running) return;
    if (e.type === 'keydown') {
      keys.add(e.code);
      if (/^Digit[1-9]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (i < st.slots.length) select(i); }
      if (e.code === 'KeyF') inp.place = true;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    } else keys.delete(e.code);
  };
  let lockFailed = false, mouseDrag = false, lockAt = 0;
  const tryLock = () => {
    if (lockFailed || !canvas.requestPointerLock) { lockFailed = true; return; }
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { lockFailed = true; }); } catch (e) { lockFailed = true; }
  };
  const onLockChange = () => { st.locked = document.pointerLockElement === canvas; if (st.locked) lockAt = performance.now(); if (!st.locked) { inp.dig = false; if (o.onUnlock && st.running && !lockFailed) o.onUnlock(); } };
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
    inp.sprint = l > 0.96;
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
      const end = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; inp.fx = inp.fz = 0; inp.sprint = false; if (T.knob) T.knob.style.transform = ''; };
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
    press(T.jump, () => { btn.jump = true; }, () => { btn.jump = false; });
    press(T.dig, () => { digPointers++; inp.dig = true; }, () => { digPointers = Math.max(0, digPointers - 1); inp.dig = digPointers > 0; });
    press(T.place, () => { inp.place = true; }, () => {});
  }
  function wireCanvas() {
    canvas.style.touchAction = 'none';
    bind(canvas, 'pointerdown', (e) => {
      if (!st.running) return;
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
  document.addEventListener('pointerlockerror', () => { lockFailed = true; });
  document.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });   // no pinch-zoom of the page on iOS

  // ------------------------------------------------------------------ frame
  function placeCamera() {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(st.pitch, st.yaw, 0);
    camera.position.set(st.pos.x, st.pos.y + P.eye, st.pos.z);
    camera.updateMatrixWorld(true);
  }
  /** Advance the game by dt seconds (no rendering). */
  function advance(dt) {
    readKeys();
    let rem = dt;
    while (rem > 1e-6) { const h = Math.min(rem, 1 / 60); step(h); rem -= h; }
    st.time += dt;
    placeCamera();
    aim();
    digTick(dt);
    if (inp.place) { inp.place = false; placeNow(); }
    terrain.flush();
    if (o.onFrame) o.onFrame(st, dt);
  }
  // dynamic resolution: keep the frame time in budget on whatever device this runs on
  const res = { base: 1, pr: 1, cap: 1, acc: 0, n: 0, hold: 0, good: 0, min: 0.5 };
  function initRes() {
    res.base = Math.min(window.devicePixelRatio || 1, o.maxPixelRatio ?? 2);
    res.pr = res.cap = res.base;
    if (o.setPixelRatio) o.setPixelRatio(res.pr);
  }
  function tuneRes(ms) {
    if (!o.setPixelRatio) return;
    res.acc += ms; res.n++;
    if (res.n < 40 && !(res.n >= 3 && res.acc > 2500)) return;       // judge 40 frames, or 2.5 s on a very slow device
    const avg = res.acc / res.n; res.acc = 0; res.n = 0;
    if (res.hold > 0) { res.hold--; return; }
    let pr = res.pr;
    if (avg > 26 && pr > res.min) { res.cap = pr * 0.94; pr = Math.max(res.min, pr * (avg > 60 ? 0.7 : 0.85)); res.good = 0; }
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
  function notice(text, keep) {
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:55;max-width:min(560px,calc(100vw - 32px));padding:10px 16px;border-radius:10px;'
        + 'background:rgba(8,11,16,.9);border:1px solid rgba(255,255,255,.28);color:#f1f4f8;font:500 14px/1.7 system-ui,sans-serif;direction:rtl;text-align:center;white-space:pre-line;pointer-events:none;';
      document.body.appendChild(noteEl);
    }
    noteEl.textContent = text; noteEl.hidden = false;
    clearTimeout(noteTimer);
    if (!keep) noteTimer = setTimeout(() => { noteEl.hidden = true; }, 9000);
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
    state: st, input: inp, tuning: P, res, isSolid, isLiquid, gpu,
    start() {
      if (st.running) return;
      st.running = true; initRes(); last = performance.now(); raf = requestAnimationFrame(frame);
    },
    stop() { st.running = false; cancelAnimationFrame(raf); inp.dig = false; keys.clear(); if (sync) { gl.deleteSync(sync); sync = null; } },
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
#playPanel[hidden] { display: none; }
#playPanel .box { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 24px); overflow: auto; padding: 22px 26px 20px; border-radius: 14px;
  background: rgba(10, 14, 20, .82); border: 1px solid var(--pp-line, rgba(255, 255, 255, .22)); box-shadow: 0 18px 60px rgba(0, 0, 0, .55); text-align: center; }
#playPanel h1 { margin: 0 0 4px; font-size: 30px; line-height: 1.2; font-weight: 700; color: var(--pp-accent, #fff); }
#playPanel p { margin: 0 0 14px; font-size: 14px; line-height: 1.6; opacity: .82; }
#playPanel ul { list-style: none; margin: 0 0 16px; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; text-align: right; font-size: 13.5px; line-height: 1.5; }
#playPanel li { display: flex; gap: 8px; align-items: baseline; }
#playPanel li b { flex: none; min-width: 74px; font-weight: 700; color: var(--pp-accent, #fff); }
#playPanel button { font: inherit; font-size: 17px; font-weight: 700; color: #0b0f14; background: var(--pp-accent, #fff); border: 0; border-radius: 10px; padding: 11px 44px; min-height: 46px; cursor: pointer; }
#playPanel .menu { display: block; margin: 10px auto 0; padding: 6px 18px; min-height: 0; font-size: 13.5px; font-weight: 500; color: inherit; background: none; border: 1px solid var(--pp-line, rgba(255, 255, 255, .3)); opacity: .85; }
#playPanel .note { margin: 12px 0 0; font-size: 12px; opacity: .6; }
#playPanel .gpu { margin: 6px 0 0; font: 400 10.5px/1.4 system-ui, sans-serif; opacity: .38; direction: ltr; word-break: break-word; }
#playRotate { position: fixed; inset: 0; z-index: 60; display: none; align-items: center; justify-content: center; direction: rtl; text-align: center; padding: 24px;
  background: #06090e; color: #f1f4f8; font-size: 18px; line-height: 1.7; }
@media (pointer: coarse) and (orientation: portrait) { #playRotate { display: flex; } }
@media (max-height: 430px) { #playPanel .box { padding: 12px 18px 12px; } #playPanel h1 { font-size: 22px; } #playPanel p { margin-bottom: 8px; font-size: 12.5px; }
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
  const rows = o.touch
    ? [['العصا اليسار', 'المشي'], ['اسحب على الشاشة', 'النظر'], ['زر الحفر', 'اضغط مطوّلًا لتكسر المكعب'], ['زر البناء', 'يضع المكعب المختار'], ['زر القفز', 'قفز وسباحة'], ['الشريط', 'اضغط خانة لتختارها']]
    : [['W A S D', 'المشي'], ['الفأرة', 'النظر'], ['الزر الأيسر', 'اضغط مطوّلًا لتكسر المكعب'], ['الزر الأيمن', 'يضع المكعب المختار'], ['Space', 'قفز وسباحة'], ['Shift', 'ركض'], ['1 – 9 أو العجلة', 'اختيار الخانة'], ['Esc', 'إيقاف مؤقت']];
  const h1 = document.createElement('h1'), p = document.createElement('p'), ul = document.createElement('ul'), b = document.createElement('button'), note = document.createElement('div');
  h1.textContent = o.title; p.textContent = o.tagline || '';
  for (const [k, v] of rows) { const li = document.createElement('li'), kb = document.createElement('b'), s = document.createElement('span'); kb.textContent = k; kb.dir = 'auto'; s.textContent = v; li.append(kb, s); ul.appendChild(li); }
  note.className = 'note'; note.textContent = o.note || '';
  b.type = 'button';
  const box = document.createElement('div'); box.className = 'box';
  box.append(h1, p, ul, b);
  // when the page was opened from the world picker, offer the way back
  const toMenu = o.onMenu || (window.__GAME && window.__GAME.onMenu);
  if (toMenu) { const m = document.createElement('button'); m.type = 'button'; m.className = 'menu'; m.textContent = 'العوالم'; m.addEventListener('click', toMenu); box.appendChild(m); }
  box.appendChild(note);
  const gpuEl = document.createElement('div'); gpuEl.className = 'gpu';
  box.appendChild(gpuEl);
  el.appendChild(box);
  document.body.appendChild(el);
  const rot = document.createElement('div');
  rot.id = 'playRotate'; rot.style.fontFamily = el.style.fontFamily; rot.textContent = 'دوّر الجوال بالعرض عشان تلعب';
  document.body.appendChild(rot);
  b.addEventListener('click', () => { el.hidden = true; o.onStart(); });
  return {
    el,
    show(mode = 'start') { b.textContent = mode === 'pause' ? 'كمّل اللعب' : 'ابدأ اللعب'; gpuEl.textContent = window.__GAME_GPU || ''; el.hidden = false; },
    hide() { el.hidden = true; },
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
