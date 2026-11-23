// Wonders: a lucky box that gives one rare thing, a village hidden under the sea, an island that rises from the
// sea on Fridays, and a portal to the world of the dinosaurs (and back).
//
//   const wonders = createWonders({ play, kit, adv, world, seaSpot });      (the bag makes it)
//
// Everything is placed the same way for everyone in the same world (seeded by the world, the day or the week),
// so friends in a shared game find the same village, island and portal.

import { K, kitItem } from './kit.js';
import { makeAvatar } from './avatar.js';
import { OUTFITS } from './outfits.js';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const dayKey = (d = new Date()) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
const weekKey = (d = new Date()) => { const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 2) % 7)); return dayKey(t); };   // weeks start on Saturday
const load = (k, d) => { try { const v = JSON.parse(window.localStorage.getItem(k) || 'null'); return v ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage may be closed: kept for this visit only */ } };

// what a lucky box may hold: [weight, item id, count, how rare]
const LUCK = [
  [14, K.EMERALD, 3, 'نادر'], [12, K.RUBY, 2, 'نادر'], [12, K.AMETHYST, 3, 'نادر'], [10, K.PEARL, 3, 'نادر'], [8, K.GOLDFISH, 1, 'نادر'],
  [8, K.DIAMOND, 2, 'نادر جدًا'], [6, 217, 1, 'نادر جدًا'], [6, 210, 1, 'نادر جدًا'], [5, 245, 1, 'نادر جدًا'], [5, 242, 1, 'نادر جدًا'],
  [4, 246, 1, 'أسطوري'], [4, K.EMERALD_BLOCK, 1, 'أسطوري'], [3, K.RUBY_BLOCK, 1, 'أسطوري'], [3, 'outfit', 1, 'أسطوري'],
];

export function createWonders({ play, kit, adv, world, seaSpot }) {
  const st = play.state, w = kit.world, scene = kit.scene;
  const A = w.area || { x0: 0, z0: 0, x1: w.sx, z1: w.sz };
  const spawn = { x: Math.floor(st.pos.x), z: Math.floor(st.pos.z) };
  const liquid = (x, y, z) => play.isLiquid(w.get(x, y, z));
  const set = (x, y, z, id) => { if (w.inb(x, y, z)) kit.setBlock(x, y, z, id); };
  const api = { village: null, island: null, portal: null };

  // ---------------------------------------------------------------- the lucky box
  function openLucky(h) {
    play.remoteDig(h.x, h.y, h.z);
    if (play.net && play.net.dig) play.net.dig(h.x, h.y, h.z);
    let r = Math.random() * LUCK.reduce((a, q) => a + q[0], 0), pick = LUCK[0];
    for (const q of LUCK) { if ((r -= q[0]) <= 0) { pick = q; break; } }
    const [, id, n, tier] = pick;
    if (id === 'outfit' && adv && adv.wardrobe) {
      const rare = OUTFITS.filter((o) => o.rare && !adv.wardrobe.owned.has(o.key));
      if (rare.length) { const o = rare[Math.floor(Math.random() * rare.length)]; adv.wardrobe.grant(o.key); play.notice('صندوق الحظ: لبس ' + tier + '! «' + o.name + '» صار لك.', false, 5200); if (play.sound && play.sound.level) play.sound.level(); return true; }
    }
    const it = kitItem(id === 'outfit' ? K.DIAMOND : id, n);
    const where = play.give(it);
    st.lucky = (st.lucky || 0) + 1;
    play.notice('صندوق الحظ: ' + it.name + (it.n > 1 ? ' ×' + it.n : '') + ' — ' + tier + '!' + (where ? '' : ' (حقيبتك مليانة، راح)'), false, 4600);
    if (play.sound) (play.sound.level || play.sound.ui)();
    return true;
  }

  // ---------------------------------------------------------------- finding open sea
  /** The floor under the water at (x, z): { floor, top } (the first water cell and the surface), or null if no water. */
  function waterCol(x, z) {
    let y = w.sy - 2; while (y > 1 && w.get(x, y, z) === 0) y--;
    if (!liquid(x, y, z)) return null;
    const top = y; while (y > 1 && liquid(x, y, z)) y--;
    return { floor: y + 1, top };
  }
  /** A square of `size` all water at least `depth` deep, in the world's area, not too near `avoid`. */
  function findSea(size, depth, seed, avoid) {
    const fromHook = seaSpot ? seaSpot(600, seed) : null;
    const tryAt = (cx, cz) => {
      if (avoid && Math.hypot(cx - avoid.x, cz - avoid.z) < 40) return null;
      let floor = Infinity, top = -1;
      for (let dx = -size / 2; dx <= size / 2; dx += 2) for (let dz = -size / 2; dz <= size / 2; dz += 2) { const c = waterCol(cx + dx, cz + dz); if (!c || c.top - c.floor + 1 < depth) return null; floor = Math.min(floor, c.floor); top = Math.max(top, c.top); }
      return { x: cx, z: cz, floor, top };
    };
    if (fromHook) { const t = tryAt(fromHook.x, fromHook.z); if (t) return t; }
    const r = rng(hash(world + '|sea|' + seed));
    for (let i = 0; i < 260; i++) {
      const x = A.x0 + 8 + Math.floor(r() * (A.x1 - A.x0 - 16)), z = A.z0 + 8 + Math.floor(r() * (A.z1 - A.z0 - 16));
      const c = waterCol(x, z); if (!c || c.top - c.floor + 1 < depth) continue;
      const t = tryAt(x, z); if (t) return t;
    }
    return null;
  }

  /** No sea deep enough: the widest lake there is, dug down from below to `depth` (its water fills the hole). */
  function deepLake(size, depth, seed, avoid) {
    const v = findSea(size, 1, seed + '-lake', avoid) || findSea(Math.max(8, size - 6), 1, seed + '-lake2', avoid);
    if (!v) return null;
    const half = Math.ceil(size / 2) + 1, bottom = Math.max(2, v.top - depth + 1);
    for (let dx = -half; dx <= half; dx++) for (let dz = -half; dz <= half; dz++) {
      const c = waterCol(v.x + dx, v.z + dz); if (!c) continue;
      const wid = w.get(v.x + dx, c.top, v.z + dz);
      for (let y = c.floor - 1; y >= bottom; y--) set(v.x + dx, y, v.z + dz, wid);
    }
    return { x: v.x, z: v.z, floor: bottom, top: v.top };
  }

  // ---------------------------------------------------------------- the village under the sea
  const VKEY = 'bw-village-' + world + '-' + dayKey(), vOpened = new Set(load(VKEY, []));
  const vFoundKey = 'bw-village-found-' + world;
  const villagers = [];
  const PEOPLE = [
    { name: 'حارس القرية', c: { hat: '#1f4a6a', skin: '#c99870', shirt: '#2a6a8a', pants: '#1f3a4a', shoes: '#14242e', face: 'bubble', pack: '#d8dde4' }, say: 'أهلًا بك في قريتنا! محد يعرف طريقها غيرك.', gift: [K.PEARL, 2] },
    { name: 'بائعة اللؤلؤ', c: { hat: '#e8c9b0', skin: '#e0b088', shirt: '#3fa8a0', pants: '#2a6a7a', shoes: '#1f4a54', face: 'bubble', long: true, skirt: '#3fa8a0' }, say: 'هذي لؤلؤة من بحرنا، خذها هدية.', gift: [K.PEARL, 1] },
    { name: 'الصيّاد العجوز', c: { hat: '#d8d2c0', skin: '#c99870', shirt: '#7a5a3a', pants: '#3a4a54', shoes: '#22252a', face: 'bubble' }, say: 'كل يوم أصيد سمكة ذهبية. اليوم هذي لك.', gift: [K.GOLDFISH, 1] },
  ];
  function buildVillage() {
    const v = findSea(18, 6, 'village') || deepLake(16, 7, 'village');
    if (!v) return null;
    const y0 = v.floor, chests = [];
    // the sea floor of the village: a sandy square with lamp posts
    for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) { const c = waterCol(v.x + dx, v.z + dz); if (c) { for (let y = c.floor; y < y0; y++) set(v.x + dx, y, v.z + dz, 115); set(v.x + dx, y0 - 1, v.z + dz, Math.abs(dx) <= 1 || Math.abs(dz) <= 1 ? 101 : 115); } }
    for (const [dx, dz] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) { set(v.x + dx, y0, v.z + dz, 102); set(v.x + dx, y0 + 1, v.z + dz, 102); set(v.x + dx, y0 + 2, v.z + dz, 132); if (kit.lit) kit.lit(v.x + dx, y0 + 2, v.z + dz, 132); }
    // three houses of glass, dry inside, each with a lamp and a chest; their doors open on the square
    const houses = [[-5, -5, 1, 0], [5, -5, -1, 0], [0, 5, 0, -1]];
    houses.forEach(([hx, hz, ox, oz], i) => {
      const cx = v.x + hx, cz = v.z + hz;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 4; dy++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2 || dy === 4;
        set(cx + dx, y0 + dy, cz + dz, edge ? K.GLASS : 0);
      }
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(cx + dx, y0 - 1, cz + dz, 114);
      // the door: two cells open toward the square (the water stands in it and the air stays in)
      const doorX = cx + ox * 2, doorZ = cz + oz * 2; set(doorX, y0, doorZ, 0); set(doorX, y0 + 1, doorZ, 0);
      set(cx - ox - (oz ? 1 : 0), y0, cz - oz - (ox ? 1 : 0), 130); if (kit.lit) kit.lit(cx - ox - (oz ? 1 : 0), y0, cz - oz - (ox ? 1 : 0), 130);
      const kx = cx - ox + (oz ? 1 : 0), kz = cz - oz + (ox ? 1 : 0);
      set(kx, y0, kz, K.CHEST); chests.push({ x: kx, y: y0, z: kz, k: kx + ',' + y0 + ',' + kz });
      const p = PEOPLE[i], a = makeAvatar(); a.dress(p.c, null); a.place(cx + 0.5, y0, cz + 0.5, Math.atan2(-ox, -oz) + Math.PI); scene.add(a.group);
      villagers.push({ ...p, a, x: cx + 0.5, y: y0, z: cz + 0.5, gave: load('bw-gift-' + world + '-' + i, '') === dayKey(), i });
    });
    const r = rng(hash(world + '|village|' + dayKey()));
    for (const c of chests) {
      if (vOpened.has(c.k)) continue;
      const box = kit.chestAt(c.x, c.y, c.z);
      box[0] = kitItem(K.LUCKY, 1); box[1] = kitItem([K.PEARL, K.SHELL, K.EMERALD, K.AMETHYST][Math.floor(r() * 4)], 2 + Math.floor(r() * 3)); box[2] = kitItem(K.SHRIMP, 4); box[3] = kitItem([K.HAMOUR, K.KANAD, K.SAFI][Math.floor(r() * 3)], 3);
    }
    return { x: v.x, y: y0, z: v.z, chests, found: !!load(vFoundKey, false) };
  }

  // ---------------------------------------------------------------- the island of Fridays
  const FRIDAY = 5;
  let forceIsland = false;
  const isFriday = () => forceIsland || new Date().getDay() === FRIDAY;
  const daysToFriday = () => (FRIDAY - new Date().getDay() + 7) % 7;
  const IKEY = 'bw-island-' + world + '-' + weekKey();
  function buildIsland() {
    const v = findSea(16, 4, 'island-' + weekKey(), api.village) || findSea(12, 1, 'island-' + weekKey(), api.village) || findSea(10, 1, 'island2-' + weekKey());
    if (!v) return null;
    const r = rng(hash(world + '|island|' + weekKey())), top = v.top;
    // a round hill of sand from the sea floor to three blocks over the water, grass on its crown, two palms and a lucky box
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      const d = Math.hypot(dx, dz) + (r() - 0.5) * 0.8; if (d > 7.6) continue;
      const h = Math.round(top + 3 - Math.max(0, d - 3) * 0.9);
      for (let y = v.floor; y <= h; y++) set(v.x + dx, y, v.z + dz, y === h && d < 4.5 && h > top ? 108 : 115);
      for (let y = h + 1; y <= top + 6; y++) if (liquid(v.x + dx, y, v.z + dz)) set(v.x + dx, y, v.z + dz, 0);
    }
    const crown = top + 4;
    for (const [px, pz] of [[-3, 1], [2, -3]]) {
      for (let y = crown; y < crown + 5; y++) set(v.x + px, y, v.z + pz, 114);
      for (const [lx, lz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) set(v.x + px + lx, crown + 5, v.z + pz + lz, 107);
    }
    const opened = load(IKEY, false);
    if (!opened) { set(v.x, crown, v.z, K.LUCKY); set(v.x + 1, crown, v.z + 1, K.CHEST); const box = kit.chestAt(v.x + 1, crown, v.z + 1); box[0] = kitItem(K.LUCKY, 2); box[1] = kitItem(K.DIAMOND, 2); box[2] = kitItem(K.RUBY, 2); box[3] = kitItem(K.GOLDFISH, 1); }
    set(v.x - 1, crown, v.z - 1, 130); if (kit.lit) kit.lit(v.x - 1, crown, v.z - 1, 130);
    return { x: v.x, y: crown, z: v.z, chest: { x: v.x + 1, y: crown, z: v.z + 1 } };
  }

  // ---------------------------------------------------------------- the portal
  const HOME = 'bw-portal-from';
  const target = () => (world === 'dino' ? (sessionStorage.getItem(HOME) || 'barari') : 'dino');
  function buildPortal() {
    const r = rng(hash(world + '|portal'));
    const ground = adv && adv.groundAt ? adv.groundAt : null;
    for (let i = 0; i < 300; i++) {
      const a = r() * 6.283, d = 14 + r() * 22, x = Math.floor(spawn.x + Math.sin(a) * d), z = Math.floor(spawn.z + Math.cos(a) * d);
      if (!ground) break;
      const y = ground(x, z); if (y === null) continue;
      let ok = true;
      for (let k = -1; k <= 2 && ok; k++) { const g = ground(x + k, z); if (g === null || g !== y) ok = false; for (let h = 0; h < 5 && ok; h++) if (w.get(x + k, y + h, z) !== 0) ok = false; }
      if (!ok) continue;
      // a frame four wide and five high, standing across x; the two by three inside is the light of the gate
      for (let k = -1; k <= 2; k++) for (let h = 0; h < 5; h++) set(x + k, y + h, z, k === -1 || k === 2 || h === 0 || h === 4 ? K.PORTAL_FRAME : K.PORTAL);
      if (kit.lit) kit.lit(x, y + 2, z, K.PORTAL);
      return { x, y, z, cells: [[x, y + 1], [x + 1, y + 1], [x, y + 2], [x + 1, y + 2], [x, y + 3], [x + 1, y + 3]].map(([cx, cy]) => cx + ',' + cy + ',' + z) };
    }
    return null;
  }
  function travel() {
    const to = target();
    if (play.shared) { play.notice('اطلع من الغرفة أول (العب مع ربعك) قبل ما تروح من البوابة.', false, 3600); return; }
    const sv = window.__GAME_SAVE; if (sv && sv.save) sv.save();
    if (world !== 'dino') { try { sessionStorage.setItem(HOME, world); } catch (e) { /* no storage: the way back leads to البراري */ } }
    play.notice(to === 'dino' ? 'تفتح البوابة… رايح عالم الديناصورات!' : 'ترجع لعالمك…', true);
    setTimeout(() => {
      try { history.replaceState(null, '', location.pathname + location.search + '#' + to); } catch (e) { location.hash = to; }
      location.reload();
    }, 700);
  }

  // ---------------------------------------------------------------- build what this world has
  try { api.village = buildVillage(); } catch (e) { api.village = null; /* a world with no sea big enough has no village */ }
  try { api.island = isFriday() ? buildIsland() : null; } catch (e) { api.island = null; /* no open sea: no island */ }
  try { api.portal = buildPortal(); } catch (e) { api.portal = null; /* no level ground near the start */ }

  // ---------------------------------------------------------------- every frame: the village is found, the portal is stood in
  let inPortal = false, nearT = 0;
  play.onTick((s, dt) => {
    if (st.modal) return;
    const v = api.village;
    if (v && !v.found && Math.hypot(st.pos.x - v.x, st.pos.z - v.z) < 9 && st.pos.y < v.y + 8) {
      v.found = true; save(vFoundKey, true); st.xp = (st.xp || 0) + 25;
      play.notice('لقيت القرية المخفية تحت البحر! (+25 خبرة) كلّم أهلها وافتح صناديق بيوتهم.', false, 6500);
      if (play.sound && play.sound.level) play.sound.level();
    }
    for (const p of villagers) { p.t = (p.t || 0) + dt; p.a.walk(p.t, 0); p.a.nod(Math.sin(p.t * 0.7) * 0.15); }
    if (api.portal) {
      const k = Math.floor(st.pos.x) + ',' + Math.floor(st.pos.y + 0.5) + ',' + Math.floor(st.pos.z);
      const now = api.portal.cells.includes(k);
      if (now && !inPortal) play.notice(target() === 'dino' ? 'هذي بوابة عالم الديناصورات. اضغط زر البناء وانت فيها عشان تروح.' : 'هذي البوابة ترجّعك لعالمك. اضغط زر البناء وانت فيها.', false, 4200);
      inPortal = now;
    }
    if ((nearT -= dt) <= 0) nearT = 1;
  });
  play.onUseFirst((h) => {
    if (h && h.id === K.LUCKY) return openLucky(h);
    if (inPortal) { travel(); return true; }
    // a villager within reach: talk, and once a day a gift
    for (const p of villagers) {
      if (Math.hypot(st.pos.x - p.x, st.pos.z - p.z) > 2.6 || Math.abs(st.pos.y - p.y) > 2) continue;
      if (!p.gave) { p.gave = true; save('bw-gift-' + world + '-' + p.i, dayKey()); play.give(kitItem(p.gift[0], p.gift[1])); play.notice(p.name + ': ' + p.say, false, 4800); }
      else play.notice(p.name + ': تعال بكرة، عندي لك هدية ثانية.', false, 3000);
      return true;
    }
    return false;
  });
  /** A chest was opened: a village or island chest is counted. */
  api.opened = (h) => {
    const v = api.village;
    if (v) { const c = v.chests.find((q) => q.x === h.x && q.y === h.y && q.z === h.z); if (c && !vOpened.has(c.k)) { vOpened.add(c.k); save(VKEY, [...vOpened]); } }
    const isl = api.island;
    if (isl && h.x === isl.chest.x && h.y === isl.chest.y && h.z === isl.chest.z) save(IKEY, true);
  };
  api.page = () => '<h3>العجايب</h3><ol class="quests">'
    + `<li class="${api.village && api.village.found ? 'done' : 'now'}">قرية مخفية تحت البحر<small>${!api.village ? 'ما في بحر كبير في هذا العالم.' : api.village.found ? 'لقيتها. أهلها عندهم هدية لك كل يوم.' : 'في مكان عميق تحت الماي… دوّرها.'}</small></li>`
    + `<li class="${isFriday() ? 'now' : ''}">جزيرة الجمعة<small>${isFriday() ? (api.island ? 'طالعة اليوم من البحر! فيها صندوق حظ وكنز.' : 'ما في بحر يكفيها في هذا العالم.') : 'تطلع من البحر يوم الجمعة. باقي ' + daysToFriday() + ' أيام.'}</small></li>`
    + `<li class="now">${world === 'dino' ? 'بوابة الرجوع' : 'بوابة عالم الديناصورات'}<small>${api.portal ? 'قريبة من مكان البداية: إطار يلمع. ادخلها واضغط زر البناء.' : 'ما لقت لها مكان هني.'}</small></li>`
    + '<li class="now">صندوق الحظ<small>يعطيك شي نادر. تلقاه في القرية والجزيرة والكنوز، أو تصنعه من ذهب وزمرّد.</small></li></ol>';
  api.force = { island() { forceIsland = true; api.island = buildIsland(); return api.island; } };
  api.target = target; api.travel = travel; api.villagers = villagers; api.openLucky = openLucky;
  window.__GAME_WONDERS = api;
  return api;
}
