// Surprises:
//   رسالة اليوم      a note that changes every day and hints at where things are
//   الغريب           a hooded stranger who is only there once the sun is low, with one task a day and a reward
//   الجزيرة          an island in the sky that is there for ten minutes of every half hour, then gone
//   البوابة والمتاهة  a gate that opens near the player now and then; stepping in leads to a maze whose walls move.
//                    Out before the time runs down wins a prize.
//
//   createEvents({ play, kit, adv, world, groundAt, openPage })      (the bag does this)

import * as THREE from 'three';
import { makeAvatar } from './avatar.js';

const WINDS = ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'];
const wind = (dx, dz) => WINDS[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];
const STRANGER_LOOK = { hat: '#1a1524', skin: '#8f7a6a', shirt: '#2a2038', pants: '#191422', shoes: '#0e0b14', cape: '#3b1f5e' };

export function createEvents({ play, kit, adv, world, groundAt, openPage }) {
  const st = play.state, w = kit.world, scene = kit.scene, today = adv.day;
  const load = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const keep = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) { /* not kept */ } };
  const spawn = { x: st.pos.x, y: st.pos.y, z: st.pos.z };
  const chip = document.createElement('div');
  chip.style.cssText = 'position:fixed;left:50%;top:12%;transform:translateX(-50%);z-index:21;pointer-events:none;direction:rtl;padding:6px 14px;border-radius:9px;background:rgba(8,11,16,.85);border:1px solid rgba(192,106,245,.8);color:#f1e6ff;font:700 14px/1.4 system-ui,sans-serif;white-space:nowrap;';
  chip.hidden = true; document.body.appendChild(chip);
  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:20;pointer-events:none;direction:rtl;padding:5px 12px;border-radius:8px;background:rgba(8,11,16,.82);border:1px solid rgba(255,255,255,.28);color:#f1f4f8;font:700 13px/1.4 system-ui,sans-serif;white-space:nowrap;';
  tag.textContent = 'الغريب · اضغط زر البناء'; tag.hidden = true; document.body.appendChild(tag);

  // ---- the stranger, and the day's task
  const sr = adv.rngFor('stranger');
  let sPos = null;
  for (let i = 0; i < 60 && !sPos; i++) { const a = sr() * 6.283, d = 13 + sr() * 9, x = Math.floor(spawn.x + Math.sin(a) * d), z = Math.floor(spawn.z + Math.cos(a) * d), y = groundAt(x, z); if (y !== null && Math.abs(y - spawn.y) <= 5) sPos = { x: x + 0.5, y, z: z + 0.5 }; }
  const stranger = makeAvatar();
  stranger.dress(STRANGER_LOOK, null);
  stranger.group.visible = false;
  if (sPos) { stranger.place(sPos.x, sPos.y, sPos.z, 0); scene.add(stranger.group); }
  const TASKS = [
    { ask: [200, 3], text: 'جيب لي 3 لحم', give: () => (st.pet ? [[231, 3]] : [[246, 1]]), prize: () => (st.pet ? '3 ألماسات' : 'بيضة تنين') },
    { ask: [140, 2], text: 'جيب لي مكعبين ذهب', give: () => [[231, 2]], prize: () => 'ألماستين' },
    { ask: ['stone', 12], text: 'جيب لي 12 حجر', give: () => [[240, 1], [172, 6]], prize: () => 'كاشف الكنوز و6 مشاعل' },
    { ask: [231, 1], text: 'جيب لي ألماسة من الكهف', give: () => [], outfit: 'stranger', prize: () => 'عباءة الغريب (لبس نادر)' },
    { photo: true, text: 'صوّر لي صورة بالكاميرا بعد ما نتفق', give: () => [[242, 1]], prize: () => 'الخريطة السحرية' },
  ];
  const task = TASKS[Math.floor(sr() * TASKS.length)], doneKey = 'bw-stranger-' + world;
  let taskDone = load(doneKey) === today, accepted = false, photos0 = 0, sNear = false;
  const sHere = () => !!sPos && !!window.__GAME_SKY && window.__GAME_SKY.time !== 'morning' && window.__GAME_SKY.time !== 'noon';
  function deliver() {
    if (taskDone) return 'خلصت مهمة اليوم. تعال بكرة.';
    if (task.photo) { if (!accepted) { accepted = true; photos0 = st.photos || 0; return 'تم. صوّر صورة وارجع لي.'; } if ((st.photos || 0) <= photos0) return 'للحين ما صوّرت.'; }
    else { const [what, n] = task.ask; if (adv.craft.count(what) < n) return 'ناقصك ' + adv.craft.nameOf(what) + '.'; adv.craft.take(what, n); }
    for (const [id, n] of task.give()) if (!play.give(adv.item(id, n))) play.notice('حقيبتك مليانة.', false, 2600);
    if (task.outfit) adv.wardrobe.grant(task.outfit);
    taskDone = true; keep(doneKey, today); st.strangerDone = (st.strangerDone || 0) + 1; st.xp = (st.xp || 0) + 15;
    if (play.sound && play.sound.level) play.sound.level();
    play.changed();
    return true;
  }
  const strangerPage = { title: 'الغريب', html: () => `<p class="hint">${taskDone ? 'أخذت اللي أبيه. نتلاقى بكرة، إذا غابت الشمس.' : '«' + task.text + '»، وأعطيك: ' + task.prize() + '.'}</p>${taskDone ? '' : `<p class="hint"><button type="button" class="view" data-stranger="1">${task.photo && !accepted ? 'اتفقنا' : 'سلّم'}</button></p>`}<p class="hint" data-out></p>`,
    click(t) { if (!t.closest('[data-stranger]')) return false; const r = deliver(); play.notice(r === true ? 'الغريب: «زين. هذا حقك.»' : 'الغريب: «' + r + '»', false, 3500); return true; } };
  play.onUseFirst(() => { if (!sNear) return false; openPage(strangerPage); return true; });

  // ---- the island in the sky: ten minutes of every half hour by the clock, so everyone sees it at the same time
  const ir = adv.rngFor('island');
  const A = w.area || { x0: 0, z0: 0, x1: w.sx, z1: w.sz };      // all of a small world, a square round the start of an endless one
  const isle = { x: A.x0 + 24 + Math.floor(ir() * (A.x1 - A.x0 - 48)), z: A.z0 + 24 + Math.floor(ir() * (A.z1 - A.z0 - 48)), y: Math.max(8, w.sy - (w.sy > 44 ? 16 : 9)), up: false, cells: [], warned: false };
  const islandTime = () => Math.floor(Date.now() / 60000) % 30 < 10;
  function raiseIsland() {
    if (isle.up) return;                             // it is there already
    isle.cells = []; isle.warned = false;
    const put = (x, y, z, id) => { if (w.inb(x, y, z) && w.get(x, y, z) === 0) { kit.setBlock(x, y, z, id); isle.cells.push([x, y, z, id]); } };
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) { const d = Math.hypot(dx, dz); if (d > 4.3) continue; put(isle.x + dx, isle.y, isle.z + dz, 108); if (d < 3.2) put(isle.x + dx, isle.y - 1, isle.z + dz, 114); if (d < 1.8) put(isle.x + dx, isle.y - 2, isle.z + dz, 114); }
    put(isle.x, isle.y + 1, isle.z, 170); put(isle.x + 2, isle.y + 1, isle.z, 130); put(isle.x - 2, isle.y + 1, isle.z, 130);
    if (kit.lit) { kit.lit(isle.x + 2, isle.y + 1, isle.z, 130); kit.lit(isle.x - 2, isle.y + 1, isle.z, 130); }
    const c = kit.chestAt(isle.x, isle.y + 1, isle.z); c.fill(null); c[0] = adv.item(140, 3); c[1] = adv.item(231, 1); if (!st.pet && Math.random() < 0.5) c[2] = adv.item(246, 1);
    isle.up = true;
    play.notice('جزيرة طلعت في السما! تختفي بعد 10 دقايق. مكانها على خريطة المهام.', false, 7000);
  }
  function sinkIsland() {
    if (!isle.up) return;
    for (const [x, y, z, id] of isle.cells) if (w.get(x, y, z) === id) kit.setBlock(x, y, z, 0);
    kit.chests.delete(isle.x + ',' + (isle.y + 1) + ',' + isle.z);
    isle.cells = []; isle.up = false;
    play.notice('الجزيرة اختفت. ترجع بعد شوي.', false, 4000);
  }

  // ---- the gate and the maze
  const gate = new THREE.Group();
  { const m = new THREE.MeshStandardMaterial({ color: 0xc06af5, emissive: 0x9a3fe0, emissiveIntensity: 1.6, roughness: 0.4 });
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, q = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.2), m); q.position.set(Math.cos(a) * 1.1, 1.35 + Math.sin(a) * 1.25, 0); q.rotation.z = a; q.frustumCulled = false; gate.add(q); }
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.3), new THREE.MeshBasicMaterial({ color: 0x7a2fd0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); veil.position.y = 1.35; gate.add(veil); }
  gate.visible = false; scene.add(gate);
  let gateIn = 150, gateLeft = 0, gPos = null;
  const N = 6, SIZE = N * 2 + 1, MAZE_TIME = 120;
  const maze = { on: false, x0: A.x1 - SIZE - 6, z0: A.z1 - SIZE - 6, y: 0, left: 0, shift: 0, back: null, cells: new Map(), seed: 1 };
  // the maze hangs in the air over a corner of the world, clear of whatever ground is there (it must never cut into a hill)
  { let top = 0; for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) { let y = w.sy - 1; while (y > 0 && w.get(maze.x0 + x, y, maze.z0 + z) === 0) y--; if (y > top) top = y; } maze.y = Math.min(w.sy - 6, top + 5); maze.room = maze.y > top + 1; }
  function layout(seed) {      // a maze on an N x N grid: walls everywhere, then passages cut by a wandering path
    let a = seed >>> 0; const r = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const wall = Array.from({ length: SIZE }, () => new Array(SIZE).fill(true)), seen = new Set(['0,0']), stack = [[0, 0]];
    wall[1][1] = false;
    while (stack.length) {
      const [cx, cz] = stack[stack.length - 1], nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [cx + dx, cz + dz, dx, dz]).filter(([x, z]) => x >= 0 && z >= 0 && x < N && z < N && !seen.has(x + ',' + z));
      if (!nb.length) { stack.pop(); continue; }
      const [nx, nz, dx, dz] = nb[Math.floor(r() * nb.length)];
      seen.add(nx + ',' + nz); wall[nz * 2 + 1][nx * 2 + 1] = false; wall[cz * 2 + 1 + dz][cx * 2 + 1 + dx] = false; stack.push([nx, nz]);
    }
    for (let i = 0; i < 5; i++) { const x = 1 + Math.floor(r() * (SIZE - 2)), z = 1 + Math.floor(r() * (SIZE - 2)); if ((x + z) % 2 === 1) wall[z][x] = false; }      // a few extra doors, so a shift never traps anyone for long
    return wall;
  }
  function buildMaze(first) {
    const wall = layout(maze.seed++), px = Math.floor(st.pos.x) - maze.x0, pz = Math.floor(st.pos.z) - maze.z0;
    const set = (x, y, z, id) => { const k = x + ',' + y + ',' + z; if ((maze.cells.get(k) || 0) === id) return; kit.setBlock(x, y, z, id); if (id) maze.cells.set(k, id); else maze.cells.delete(k); };
    for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
      const X = maze.x0 + x, Z = maze.z0 + z, rim = x === 0 || z === 0 || x === SIZE - 1 || z === SIZE - 1, exit = x === SIZE - 2 && z === SIZE - 2;
      if (first) set(X, maze.y - 1, Z, exit ? 140 : 101);
      const open = !wall[z][x] || (Math.abs(x - px) <= 0 && Math.abs(z - pz) <= 0) || exit;      // never a wall on the player, nor on the way out
      for (let h = 0; h < 3; h++) set(X, maze.y + h, Z, rim ? 133 : open || h === 2 ? 0 : 132);      // walls of glowing blocks (pink outside, cyan inside): the maze is seen at any hour
    }
  }
  function enterMaze() {
    maze.back = { x: st.pos.x, y: st.pos.y, z: st.pos.z }; maze.on = true; maze.left = MAZE_TIME; maze.shift = 12; maze.seed = 1 + Math.floor(Math.random() * 1e6);
    play.setFlying(false); st.third = false;
    st.pos.set(maze.x0 + 1.5, maze.y + 0.05, maze.z0 + 1.5); st.vel.set(0, 0, 0);
    buildMaze(true);
    gate.visible = false; gateLeft = 0;
    play.notice('دخلت المتاهة! الجدران تتحرك كل شوي. دوّر مكعب الذهب في الزاوية الثانية قبل ما يخلص الوقت.', false, 7000);
  }
  function leaveMaze(won) {
    for (const k of [...maze.cells.keys()]) { const [x, y, z] = k.split(',').map(Number); kit.setBlock(x, y, z, 0); }
    maze.cells.clear(); maze.on = false; chip.hidden = true;
    st.pos.set(maze.back.x, maze.back.y + 0.05, maze.back.z); st.vel.set(0, 0, 0);
    if (won) { st.mazeWins = (st.mazeWins || 0) + 1; st.xp = (st.xp || 0) + 25; play.give(adv.item(231, 2)); play.notice('طلعت من المتاهة! جائزتك ألماستين و25 خبرة.', false, 6000); if (play.sound && play.sound.level) play.sound.level(); }
    else play.notice('خلص الوقت ورجّعتك المتاهة. جرّب مع البوابة الجاية.', false, 5000);
    gateIn = 420;
  }
  play.onUseFirst(() => maze.on);      // nothing is built or used inside the maze

  // ---- the day's note
  function message() {
    const parts = [];
    if (adv.treasure && !adv.foundToday) parts.push('اللي يمشي صوب ' + wind(adv.treasure.x - spawn.x, adv.treasure.z - spawn.z) + ' من البداية يلقى صندوق ما له صاحب.');
    if (adv.cave) parts.push('وتحت الأرض صوب ' + wind(adv.cave.mouth.x - spawn.x, adv.cave.mouth.z - spawn.z) + ' شي يلمع.');
    if (sPos) parts.push('والغريب ما يطلع إلا إذا غابت الشمس، صوب ' + wind(sPos.x - spawn.x, sPos.z - spawn.z) + '.');
    parts.push('وإذا شفت بوابة بنفسجية لا تفوّتها.');
    return parts.join(' ');
  }
  if (load('bw-msg-' + world) !== today) { keep('bw-msg-' + world, today); setTimeout(() => play.notice('رسالة اليوم: ' + message(), false, 12000), 2500); }

  let slow = 0;
  play.onTick((s, dt) => {
    // the stranger
    const here = sHere();
    if (stranger.group.visible !== here) stranger.group.visible = here;
    sNear = false;
    if (here) {
      const dx = st.pos.x - sPos.x, dz = st.pos.z - sPos.z, d = Math.hypot(dx, dz);
      if (d < 10) stranger.group.rotation.y = Math.atan2(dx, dz);
      if (d < 4.2 && !st.modal) { const cp = Math.cos(st.pitch), vx = -Math.sin(st.yaw) * cp, vy = Math.sin(st.pitch), vz = -Math.cos(st.yaw) * cp, cx = sPos.x - st.pos.x, cy = sPos.y + 1.05 - (st.pos.y + play.tuning.eye), cz = sPos.z - st.pos.z, t = cx * vx + cy * vy + cz * vz; sNear = t > 0 && cx * cx + cy * cy + cz * cz - t * t < 0.75; }
    }
    if (tag.hidden === sNear) tag.hidden = !sNear;
    // the maze
    if (maze.on) {
      st.noDig = true; if (st.flying) play.setFlying(false);
      maze.left -= dt; maze.shift -= dt;
      const t = Math.max(0, Math.ceil(maze.left)); chip.hidden = false; chip.textContent = 'المتاهة · باقي ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + ' · الجدران تتحرك بعد ' + Math.max(0, Math.ceil(maze.shift));
      if (maze.shift <= 0) { maze.shift = 12; buildMaze(false); if (play.sound) play.sound.place(); }
      const ex = maze.x0 + SIZE - 2, ez = maze.z0 + SIZE - 2;
      if (Math.floor(st.pos.x) === ex && Math.floor(st.pos.z) === ez) leaveMaze(true);
      else if (maze.left <= 0 || st.pos.y < maze.y - 3) leaveMaze(false);
      return;
    }
    // the gate
    if (gateLeft > 0) {
      gateLeft -= dt; gate.rotation.y += dt * 0.8;
      if (maze.room && Math.hypot(st.pos.x - gPos.x, st.pos.z - gPos.z) < 1.1 && Math.abs(st.pos.y - gPos.y) < 2) enterMaze();
      else if (gateLeft <= 0) { gate.visible = false; gateIn = 420; }
    } else if (maze.room && (gateIn -= dt) <= 0) {
      for (let i = 0; i < 20 && !gPos; i++) { const a = Math.random() * 6.283, d = 8 + Math.random() * 7, x = Math.floor(st.pos.x + Math.sin(a) * d), z = Math.floor(st.pos.z + Math.cos(a) * d), y = groundAt(x, z); if (y !== null && Math.abs(y - st.pos.y) < 5) gPos = { x: x + 0.5, y, z: z + 0.5 }; }
      if (gPos) { gate.position.set(gPos.x, gPos.y, gPos.z); gate.visible = true; gateLeft = 100; play.notice('بوابة سرية طلعت قريب منك! تختفي بعد شوي.', false, 6000); if (play.sound) play.sound.ui(); } else gateIn = 20;
    }
    if (gateLeft <= 0) gPos = gate.visible ? gPos : null;
    // the island, looked at now and then
    if ((slow -= dt) > 0) return;
    slow = 3;
    const up = api.force != null ? api.force : islandTime();      // (force: a test holds the island up or down whatever the clock says)
    if (up && !isle.up) raiseIsland();
    else if (!up && isle.up) sinkIsland();
    if (isle.up) {
      if (!isle.warned && Math.floor(Date.now() / 1000) % 1800 > 570) { isle.warned = true; play.notice('الجزيرة بتختفي بعد نص دقيقة! انزل منها.', false, 6000); }
      if (Math.hypot(st.pos.x - isle.x, st.pos.z - isle.z) < 5 && Math.abs(st.pos.y - (isle.y + 1)) < 3) st.islandVisits = (st.islandVisits || 0) + 1;
    }
  });
  const api = { force: null, message, stranger, strangerAt: sPos, task, deliver, strangerHere: sHere, get strangerNear() { return sNear; }, isle, raiseIsland, sinkIsland, islandTime, gate, maze, enterMaze, leaveMaze, layout,
    openGate(p) { gPos = p; gate.position.set(p.x, p.y, p.z); gate.visible = true; gateLeft = 100; }, get gateAt() { return gateLeft > 0 ? gPos : null; }, strangerPage };
  window.__GAME_EVENTS = api;
  return api;
}
