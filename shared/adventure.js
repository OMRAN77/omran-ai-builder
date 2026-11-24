// The adventure: quests the player can read, secrets the player has to stumble on, a treasure that lies
// somewhere new every day, outfits earned by all three, a trader to barter with, and the player's own
// figure seen from behind (V). The bag shows its page (المهام) and its trade page.
//
//   const adv = createAdventure({ play, kit, craft, camera, world: 'kawkab' });
//   adv.page()            HTML of the quests page;  adv.drawn(el) after it is in the document;  adv.click(target)
//   adv.opened(hit)       a chest was opened (the day's treasure?)
//   adv.sleep()           a bed was used; true when the night was slept through
//   adv.onTrade = fn      called when the player presses the place button on the trader

import * as THREE from 'three';
import { K, kitItem, kitIcon, kitName } from './kit.js';
import { EMPTY } from './play.js';
import { levelOf } from './status.js';
import { makeAvatar, outfitPicture } from './avatar.js';
import { createWardrobe, TRADER_LOOK, PACKS } from './outfits.js';
import { makeCave } from './cave.js';
import { earnSports } from './cars.js';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const dayKey = (d = new Date()) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();

// Quests in the open, in order. test(c) reads what the game counts; give: xp and maybe an outfit.
const QUESTS = [
  // easy on purpose (the owner asked for easier quests in every world); the last one gives the sports car
  ['wood', 'جمّع 4 خشب', (c) => c.craft.count('wood') >= 4, 10],
  ['table', 'اصنع طاولة تصنيع', (c) => c.st.made[K.TABLE] >= 1, 10],
  ['tool', 'اصنع أي أداة (فأس، معول، سيف، مجرفة أو معزقة)', (c) => [212, 214, 216, 261, 262, 263, 264, 267].some((id) => c.st.made[id] >= 1), 12, 'worker'],
  ['eat', 'كُل أي أكل', (c) => c.st.eaten >= 1, 10],
  ['cave', 'انزل الكهف (علامته على الخريطة) وطلّع منه أي حجر ثمين', (c) => [K.GEM, K.GOLD, K.EMERALD, K.RUBY, K.AMETHYST, K.COAL].some((id) => c.craft.count(id) >= 1) || c.st.made[220] >= 1, 15, 'miner'],
  ['hunt', 'صيد حيوان واحد', (c) => c.st.kills.animal >= 1, 10, 'hunter'],
  ['home', 'ابنِ: حط 10 مكعبات', (c) => c.st.placed >= 10, 12, 'builder'],
  ['store', 'افتح أي صندوق', (c) => c.st.opened >= 1, 10],
  ['slay', 'اقضِ على وحش واحد (أو صيد 3 حيوانات إذا الوحوش مطفية)', (c) => c.st.kills.monster >= 1 || c.st.kills.animal >= 3, 14, 'guard'],
  ['armor', 'البس أي قطعة لبس حماية', (c) => !!(c.st.gear.head || c.st.gear.chest || c.st.gear.legs || c.st.gear.feet), 14, 'knight'],
  ['level5', 'وصّل المستوى 3', (c) => levelOf(c.st.xp || 0).level >= 3, 20, 'hero'],
];
// Secrets: never listed until found.
const SECRETS = [
  ['sleep', 'نومة هنية', 'نمت في سرير لين الصبح', (c) => c.st.slept >= 1, 15, 'sleeper'],
  ['sky', 'فوق السحاب', 'وصلت أعلى العالم', (c) => c.st.pos.y >= c.sy - 10, 15, 'pilot'],
  ['deep', 'قاع العالم', 'نزلت لآخر طبقة', (c) => c.st.pos.y <= 2.5 && c.st.onGround, 20],
  ['storm', 'تحت المطر', 'قعدت تحت مطر الليل', (c) => c.st.stormTime >= 40, 15, 'shadow'],
  ['walk', 'الرحّالة', 'مشيت 400 مكعب', (c) => c.st.walked >= 400, 20],
  ['loot', 'صيّاد الكنوز', 'لقيت كنز اليوم', (c) => c.found >= 1, 20, 'pirate'],
  ['rich', 'مليونير', 'شلت 10 مكعبات ذهب', (c) => c.craft.count(K.GOLD) >= 10, 20, 'golden'],
  ['stranger', 'مهمة الغريب', 'سوّيت اللي طلبه الغريب', (c) => c.st.strangerDone >= 1, 20],
  ['island', 'جزيرة السما', 'وصلت الجزيرة قبل ما تختفي', (c) => c.st.islandVisits >= 1, 20],
  ['maze', 'المتاهة المتحركة', 'طلعت من المتاهة قبل الوقت', (c) => c.st.mazeWins >= 1, 25, 'runner'],
  ['dragon', 'صاحب التنين', 'فقّست بيضة تنين', (c) => !!c.st.pet, 15],
  ['oasis', 'الواحة المخفية', 'لحقت سلحفاة الرمال للواحة المخفية', (c) => c.st.oasisFound >= 1, 20, null, 'waha'],
  ['deer', 'غزال الظلال', 'شفت غزال الظلال في الليل', (c) => c.st.deerSeen >= 1, 20, null, 'dhalam'],
];
// What the trader may offer: [what is given, how many, what is got, how many]. An outfit is got as 'outfit:key'.
const OFFERS = [
  ['wood', 10, K.GOLD, 1], ['stone', 12, K.GOLD, 1], [K.MEAT, 4, K.GOLD, 1], [K.GOLD, 1, K.TORCH, 12], [K.GOLD, 2, K.GLASS, 6],
  [K.GOLD, 3, K.DIAMOND, 1], [K.DIAMOND, 2, 246, 1], [K.GOLD, 2, 160, 1], [K.GOLD, 4, 213, 1], [K.DIAMOND, 2, 217, 1], [K.GOLD, 1, K.MEAT, 3],
];

export function createAdventure({ play, kit, craft, camera, world: worldKey = 'world' }) {
  const st = play.state, w = kit.world, wardrobe = createWardrobe({ play });
  // the part of the world the map shows and the treasure is hidden in: all of a small world, a square round the start of an endless one
  const A = w.area || { x0: 0, z0: 0, x1: w.sx, z1: w.sz }, AW = A.x1 - A.x0, AH = A.z1 - A.z0;
  const load = (k, d) => { try { const v = JSON.parse(window.localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* not kept */ } };
  const done = new Set(load('bw-quests', [])), today = dayKey(), foundKey = 'bw-treasure-' + worldKey;
  const secretsHere = SECRETS.filter((q) => !q[6] || q[6] === worldKey);
  let found = load('bw-treasures', 0), foundToday = load(foundKey, '') === today;
  st.stormTime = 0;
  const ctx = { st, craft, sy: w.sy, get found() { return found; } };
  const spawn = { x: st.pos.x, y: st.pos.y, z: st.pos.z };

  // ---- the ground under a column: feet height of the highest open spot, or null
  const solidAt = (x, y, z) => play.isSolid(w.get(x, y, z));
  function groundAt(x, z) {
    if (x < 2 || z < 2 || x >= w.sx - 2 || z >= w.sz - 2) return null;
    for (let y = w.sy - 3; y > 1; y--) if (solidAt(x, y - 1, z)) return w.get(x, y, z) === 0 && w.get(x, y + 1, z) === 0 ? y : null;
    return null;
  }

  // ---- the day's cave, dug before anything else is placed
  let cave = null;
  try { cave = makeCave({ play, kit, rnd: rng(hash('cave|' + worldKey + '|' + today)), spawn }); } catch (e) { cave = null; }      // a world too shallow or too wet for one simply has none
  // ---- the day's treasure: a chest standing somewhere new each day, the same place for everyone in this world
  const r = rng(hash(worldKey + '|' + today));
  let treasure = null;
  for (let i = 0; i < 300 && !treasure; i++) {
    const x = A.x0 + 10 + Math.floor(r() * (AW - 20)), z = A.z0 + 10 + Math.floor(r() * (AH - 20)), y = groundAt(x, z);
    if (y === null || Math.hypot(x - spawn.x, z - spawn.z) < 24) continue;
    if (groundAt(x + 1, z) === null || groundAt(x - 1, z) === null || groundAt(x, z + 1) === null || groundAt(x, z - 1) === null) continue;   // open ground all round, not a ledge or a roof edge
    treasure = { x, y, z };
  }
  if (treasure && !foundToday) {
    kit.setBlock(treasure.x, treasure.y, treasure.z, K.CHEST);
    const c = kit.chestAt(treasure.x, treasure.y, treasure.z), bonus = [213, 216, 214, 224, 226][Math.floor(r() * 5)];
    c[0] = kitItem(K.GOLD, 2 + Math.floor(r() * 3)); c[1] = kitItem(K.DIAMOND, 1); c[2] = kitItem(K.TORCH, 8); c[3] = kitItem(bonus, 1);
  }

  // ---- chests buried under the ground: four new ones each day, found with the treasure detector and dug out
  const buriedKey = 'bw-buried-' + worldKey + '-' + today, dugUp = new Set(load(buriedKey, []));
  const hidden = [], LOOT = [[K.GOLD, 2], [K.GEM, 1], [K.EMERALD, 2], [K.RUBY, 1], [K.AMETHYST, 2], [K.PEARL, 1], [K.GOLDFISH, 1], [K.DIAMOND, 1], [K.COAL, 4], [K.BREAD, 3], [K.LUCKY, 1]];
  const rockAt = (x, y, z) => w.inb(x, y, z) && play.isSolid(w.get(x, y, z)) && !play.isLiquid(w.get(x, y, z));
  for (let i = 0; i < 400 && hidden.length < 4; i++) {
    const x = A.x0 + 8 + Math.floor(r() * (AW - 16)), z = A.z0 + 8 + Math.floor(r() * (AH - 16)), g = groundAt(x, z);
    if (g === null || Math.hypot(x - spawn.x, z - spawn.z) < 18) continue;
    const y = g - 3 - Math.floor(r() * 3);
    let ok = y > 2;
    for (let dy = -1; dy <= 2 && ok; dy++) for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (!rockAt(x + dx, y + dy, z + dz) && !(dx === 0 && dz === 0 && dy === 0)) { ok = false; break; }
    if (!ok || hidden.some((q) => Math.hypot(q.x - x, q.z - z) < 10)) continue;
    const spot = { x, y, z, k: x + ',' + y + ',' + z };
    if (!dugUp.has(spot.k)) {
      kit.setBlock(x, y, z, K.CHEST);
      const c = kit.chestAt(x, y, z);
      for (let j = 0; j < 3 + Math.floor(r() * 2); j++) { const [id, n] = LOOT[Math.floor(r() * LOOT.length)]; c[j * 3] = kitItem(id, n + Math.floor(r() * n)); }
    }
    hidden.push(spot);
  }

  // the characters page: the player's figure, turning slowly, in a little picture of its own
  let pv = null;
  const thumbs = new Map();
  function mountPreview(slot) {
    try {
      if (!pv) {
        const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
        r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(120, 150);
        const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.8)); const sun = new THREE.DirectionalLight(0xfff2d8, 1.8); sun.position.set(2, 4, 5); sc.add(sun);
        const cam = new THREE.PerspectiveCamera(30, 120 / 150, 0.1, 50); cam.position.set(0, 1.2, 4.6); cam.lookAt(0, 0.95, 0);
        const fig = makeAvatar(); sc.add(fig.group);
        pv = { r, sc, cam, fig, t: 0, key: '' };
        const loop = () => { if (!pv.r.domElement.isConnected) { pv.running = false; return; } pv.t += 0.016; pv.fig.group.rotation.y = pv.t * 0.8; pv.fig.walk(pv.t, 1.2); pv.r.render(pv.sc, pv.cam); requestAnimationFrame(loop); };
        pv.start = () => { if (!pv.running) { pv.running = true; requestAnimationFrame(loop); } };
      }
      // a picture of every character on the page drawn from its own figure (made once, kept)
      const imgs = slot.closest('.page') ? slot.closest('.page').querySelectorAll('img[data-thumb]') : [];
      if (imgs.length) {
        const all = wardrobe.list(), rot = pv.fig.group.rotation.y;
        pv.fig.group.rotation.y = 0.45;
        for (const im of imgs) {
          const k = im.dataset.thumb;
          if (!thumbs.has(k)) { const o = all.find((q) => q.key === k); if (!o) continue; pv.fig.dress(o.c, null); pv.fig.walk(0, 0); pv.r.render(pv.sc, pv.cam); thumbs.set(k, pv.r.domElement.toDataURL('image/png')); }
          im.src = thumbs.get(k);
        }
        pv.fig.group.rotation.y = rot;
      }
      pv.fig.dress(wardrobe.look, st.gear);
      slot.appendChild(pv.r.domElement); pv.start();
    } catch (e) { slot.remove(); /* no WebGL left for a second picture: the still portrait beside it is enough */ }
  }

  // a short darkness while the time passes in bed
  const fade = document.createElement('div');
  fade.style.cssText = 'position:fixed;inset:0;z-index:44;background:#000;opacity:0;pointer-events:none;transition:opacity .45s;';
  document.body.appendChild(fade);
  function sleepFade() { fade.style.transition = 'none'; fade.style.opacity = '1'; requestAnimationFrame(() => requestAnimationFrame(() => { fade.style.transition = 'opacity 1.2s'; fade.style.opacity = '0'; })); }

  // ---- the trader: stands near where the game starts
  const trader = makeAvatar();
  trader.dress(TRADER_LOOK, null);
  let tPos = null, tNear = false;
  for (let a = 0.6; a < 7 && !tPos; a += 0.5) for (const d of [6, 8, 5]) { const x = Math.floor(spawn.x + Math.sin(a) * d), z = Math.floor(spawn.z + Math.cos(a) * d), y = groundAt(x, z); if (y !== null && Math.abs(y - spawn.y) <= 3) { tPos = { x: x + 0.5, y, z: z + 0.5 }; break; } }
  trader.group.visible = !!tPos;
  if (tPos) { trader.place(tPos.x, tPos.y, tPos.z, 0); kit.scene.add(trader.group); }
  const deals = (() => { const q = rng(hash('deal|' + worldKey + '|' + today)), pool = OFFERS.slice(), out = []; while (out.length < 6 && pool.length) out.push(pool.splice(Math.floor(q() * pool.length), 1)[0]); out.push([K.DIAMOND, 4, 'outfit:merchant', 1]); return out; })();
  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:20;pointer-events:none;direction:rtl;padding:5px 12px;border-radius:8px;background:rgba(8,11,16,.82);border:1px solid rgba(255,255,255,.28);color:#f1f4f8;font:700 13px/1.4 system-ui,sans-serif;white-space:nowrap;';
  tag.textContent = 'التاجر · اضغط زر البناء للتجارة'; tag.hidden = true;
  document.body.appendChild(tag);

  // ---- the player's own figure, for the view from behind
  const me = makeAvatar();
  me.group.visible = false;
  kit.scene.add(me.group);
  let wasThird = false;
  function hideHands(on) {      // what hangs on the camera (the arm, the tool, the held block) is out of the picture while the view is from behind
    if (!camera) return;
    camera.traverse((o) => { if (o === camera || !(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return; if (on) { if (o.userData.bwMask == null) o.userData.bwMask = o.layers.mask; o.layers.set(30); } else if (o.userData.bwMask != null) { o.layers.mask = o.userData.bwMask; o.userData.bwMask = null; } });
  }

  const api = {
    wardrobe, trader, me, treasure, deals, cave, hidden, get buriedLeft() { return hidden.filter((q) => !dugUp.has(q.k)); },
    get found() { return found; }, get foundToday() { return foundToday; }, get traderAt() { return tPos; }, get traderNear() { return tNear; },
    done,
    onTrade: null,
    quests: () => QUESTS.map(([key, name, test, xp, outfit]) => ({ key, name, xp, outfit, done: done.has(key) })),
    secrets: () => secretsHere.filter((q) => done.has('s:' + q[0])).map(([key, name, how]) => ({ key, name, how })),
    secretCount: secretsHere.length,
    day: today, craft, groundAt, empty: EMPTY,
    /** A fresh item of the building kit. */
    item: (id, n) => kitItem(id, n),
    /** A source of chance that is the same all day for everyone in this world (for things that should agree between players). */
    rngFor: (name) => rng(hash(name + '|' + worldKey + '|' + today)),
    events: null, friends: null,
    /** A chest was opened: the day's treasure, if it is that one. */
    opened(h) {
      const b = hidden.find((q) => q.x === h.x && q.y === h.y && q.z === h.z);
      if (b && !dugUp.has(b.k)) {
        dugUp.add(b.k); save(buriedKey, [...dugUp]); st.xp = (st.xp || 0) + 10; st.dugTreasure = (st.dugTreasure || 0) + 1;
        play.notice('لقيت صندوق كنز مدفون! (+10 خبرة) باقي اليوم ' + hidden.filter((q) => !dugUp.has(q.k)).length + ' تحت الأرض. الكاشف يدلّك.', false, 6000);
        if (play.sound && play.sound.level) play.sound.level();
        return true;
      }
      if (!treasure || foundToday || h.x !== treasure.x || h.y !== treasure.y || h.z !== treasure.z) return false;
      foundToday = true; found++; save(foundKey, today); save('bw-treasures', found);
      st.xp = (st.xp || 0) + 20;
      play.notice('لقيت كنز اليوم! خذ اللي فيه. (+20 خبرة) كنز جديد بكرة في مكان ثاني.', false, 6000);
      if (play.sound && play.sound.level) play.sound.level();
      return true;
    },
    /** A bed was used. At night the player sleeps till morning. */
    sleep() {
      const sky = window.__GAME_SKY;
      if (!sky || !sky.night || !sky.set) return false;
      if (sky.locked) { play.notice('صاحب الغرفة هو اللي يغيّر الوقت.', false, 2600); return true; }
      sky.set('morning', sky.rain); st.slept++;
      sleepFade();
      play.notice('نمت لين الصبح.', false, 2600);
      return true;
    },
    /** A bed by day: rest until night. */
    nap() {
      const sky = window.__GAME_SKY;
      if (!sky || sky.night || !sky.set) return false;
      if (sky.locked) { play.notice('صاحب الغرفة هو اللي يغيّر الوقت.', false, 2600); return true; }
      sky.set('night', sky.rain); sleepFade();
      play.notice('ريّحت لين الليل. نم مرة ثانية ترجع الصبح.', false, 3200);
      return true;
    },
    /** Make deal i with the trader. Returns true or the reason it cannot be made. */
    trade(i) {
      const d = deals[i];
      if (!d) return 'ما في عرض.';
      const [what, n, got, m] = d;
      if (craft.count(what) < n) return 'ناقصك ' + craft.nameOf(what) + '.';
      if (typeof got === 'string') { const key = got.slice(7); if (wardrobe.owned.has(key)) return 'هذا اللبس عندك.'; craft.take(what, n); wardrobe.grant(key); }
      else { craft.take(what, n); if (!play.give(kitItem(got, m))) play.notice('حقيبتك مليانة.', false, 2600); }
      st.traded = (st.traded || 0) + 1;
      if (play.sound) play.sound.ui();
      play.changed();
      return true;
    },
    tradePage() {
      return '<p class="hint">عروض اليوم. تتغيّر كل يوم.</p><div class="recs">' + deals.map(([what, n, got, m], i) => {
        const have = craft.count(what), outfit = typeof got === 'string' ? wardrobe.list().find((o) => o.key === got.slice(7)) : null;
        const can = have >= n && !(outfit && outfit.owned);
        return `<button type="button" class="rec${can ? ' can' : ''}" data-deal="${i}"><span class="pic">${outfit ? outfitPicture(outfit.c, 30) : kitIcon(got)}</span><div><strong>${outfit ? 'لبس: ' + outfit.name : kitName(got) + (m > 1 ? ' ×' + m : '')}</strong><small>${have >= n ? `تعطيه ${n} ${craft.nameOf(what)}` : `<u>تعطيه ${n} ${craft.nameOf(what)} (عندك ${have})</u>`}${outfit && outfit.owned ? ' · عندك' : ''}</small></div></button>`;
      }).join('') + '</div>';
    },
    /** The quests page of the bag. */
    page() {
      const qs = api.quests(), next = qs.find((q) => !q.done), sec = api.secrets(), looks = wardrobe.list();
      const ev = api.events;
      const farmHtml = (window.__GAME_WONDERS ? window.__GAME_WONDERS.page() : '') + (window.__GAME_FARM ? window.__GAME_FARM.page() : '');
      return (ev ? `<h3>رسالة اليوم</h3><p class="hint msg">${ev.message()}</p>` : '') + `<h3>كنز اليوم</h3><div class="tmap"><canvas width="${AW}" height="${AH}"></canvas><p class="hint">${!treasure ? 'ما في كنز اليوم.' : foundToday ? 'لقيت كنز اليوم ✓ كنز جديد بكرة.' : 'علامة ✕ مكان الصندوق، والنقطة الحمرا أنت. الخريطة فوقها الشمال.'}${cave ? ' المثلث الأسود مدخل كهف اليوم: فيه ذهب وألماس.' : ''}${api.events && api.events.isle.up ? ' الدائرة البيضا جزيرة السما (طر لها قبل ما تختفي).' : ''}<br>كنوز لقيتها: ${found}</p></div>`
        + `<h3>المهام ${qs.filter((q) => q.done).length}/${qs.length}</h3><ol class="quests">${qs.map((q) => `<li class="${q.done ? 'done' : q === next ? 'now' : ''}">${q.name}<small>+${q.xp} خبرة${q.outfit ? ' · لبس «' + looks.find((o) => o.key === q.outfit).name + '»' : ''}</small></li>`).join('')}</ol>`
        + `<h3>مهام سرية لقيتها: ${sec.length} من ${secretsHere.length}</h3>${sec.length ? `<ol class="quests">${sec.map((q) => `<li class="done">${q.name}<small>${q.how}</small></li>`).join('')}</ol>` : '<p class="hint">ما تنكتب هني لين تلقاها بروحك. جرّب أشياء غريبة.</p>'}`
        + farmHtml;
    },
    /** The characters page: who the player is now, every character to choose from, and the designer. */
    looksPage() {
      const looks = wardrobe.list(), now = looks.find((o) => o.on) || looks[0];
      const big = now && now.pic ? `<img class="hero big" src="${new URL('../previews/heroes/' + now.pic + '.webp', import.meta.url).href}" alt="" draggable="false">` : now ? outfitPicture(now.c, 64) : '';
      return `<div class="me"><span class="pv">${big}</span><div class="pv3d" title="شكلك"></div><div><h3>شخصيتك الحين: ${now ? now.name : ''}</h3><p class="hint">اضغط على أي شخصية تلبسها على طول. اللي عليها قفل تفتحها بالمهام والأسرار.</p>` + '<p class="hint"><button type="button" class="view" data-view="1">' + (st.third ? 'ارجع للمنظور الأول' : 'شوف شكلك من ورا (V)') + '</button></p>' + `</div></div>`
        + PACKS.map(([pk, title]) => { const inPack = looks.filter((o) => (o.pack || (o.key === 'custom' ? 'start' : 'quests')) === pk); return inPack.length ? `<h3>${title}</h3><div class="looks">${inPack.map((o) => `<button type="button" class="look${o.on ? ' on' : ''}${o.owned ? '' : ' locked'}" data-look="${o.key}">${o.owned && o.pic ? `<img class="hero" src="${new URL('../previews/heroes/' + o.pic + '.webp', import.meta.url).href}" alt="" loading="lazy" draggable="false">` : o.owned ? `<img class="hero thumb" data-thumb="${o.key}" alt="" draggable="false">` : outfitPicture(o.owned ? o.c : { hat: '#2a2d35', skin: '#3a3d46', shirt: '#2a2d35', pants: '#22252c', shoes: '#1a1c22' }, 34)}<span>${o.owned ? o.name : o.rare ? 'نادر: ؟' : o.name}</span><small>${o.owned ? (o.on ? 'لابسه' : 'البسه') : o.how}</small></button>`).join('')}</div>` : ''; }).join('')
        + `<h3>صمّم شكلك</h3><div class="design">${[['hat', 'الطاقية والشعر'], ['skin', 'البشرة'], ['shirt', 'القميص'], ['pants', 'السروال'], ['shoes', 'الحذاء']].map(([k, t]) => `<label>${t}<input type="color" data-part="${k}" value="${wardrobe.custom[k] || '#888888'}"></label>`).join('')}<label>العباءة<input type="color" data-part="cape" value="${wardrobe.custom.cape || '#7747bb'}"></label><button type="button" class="view" data-cape="${wardrobe.custom.cape ? 0 : 1}">${wardrobe.custom.cape ? 'بدون عباءة' : 'مع عباءة'}</button><button type="button" class="view" data-brim="${wardrobe.custom.brim ? 0 : 1}">${wardrobe.custom.brim ? 'طاقية بدون حافة' : 'طاقية بحافة'}</button><button type="button" class="view" data-long="${wardrobe.custom.long ? 0 : 1}">${wardrobe.custom.long ? 'شعر قصير' : 'شعر طويل'}</button><label>الفستان<input type="color" data-part="skirt" value="${wardrobe.custom.skirt || '#c9b6f2'}"></label><button type="button" class="view" data-skirt="${wardrobe.custom.skirt ? 0 : 1}">${wardrobe.custom.skirt ? 'بدون فستان' : 'مع فستان'}</button><button type="button" class="view" data-flowers="${wardrobe.custom.flowers ? 0 : 1}">${wardrobe.custom.flowers ? 'بدون ورد' : 'تاج ورد'}</button><span class="pv">${outfitPicture(wardrobe.custom, 46)}</span></div>`
        ;
    },
    /** The picture of the world from above (made once): ground by height, water blue. */
    mapOf(g) {
      if (!api.mapImage) {
        const ctx = g || document.createElement('canvas').getContext('2d');
        const img = ctx.createImageData(AW, AH), top = new Int16Array(AW * AH); let lo = 1e9, hi = -1e9;
        for (let z = 0; z < AH; z++) for (let x = 0; x < AW; x++) { let y = w.sy - 1; while (y > 0 && w.get(A.x0 + x, y, A.z0 + z) === 0) y--; const wet = play.isLiquid(w.get(A.x0 + x, y, A.z0 + z)); top[x + z * AW] = wet ? -1 : y; if (!wet) { if (y < lo) lo = y; if (y > hi) hi = y; } }
        for (let i = 0; i < top.length; i++) { const k = top[i] < 0 ? -1 : (top[i] - lo) / Math.max(1, hi - lo), o = i * 4; if (k < 0) { img.data[o] = 70; img.data[o + 1] = 130; img.data[o + 2] = 170; } else { img.data[o] = 110 + k * 125; img.data[o + 1] = 92 + k * 120; img.data[o + 2] = 58 + k * 100; } img.data[o + 3] = 255; }
        api.mapImage = img;
      }
      return api.mapImage;
    },
    /** After page() is in the document: draw the map. */
    drawn(el) {
      const slot = el.querySelector('.pv3d');
      if (slot) mountPreview(slot);
      // the designer's colour boxes: each change dresses the figure at once
      for (const inp of el.querySelectorAll('.design input[type="color"]')) inp.addEventListener('input', () => { if ((inp.dataset.part === 'cape' || inp.dataset.part === 'skirt') && !wardrobe.custom[inp.dataset.part]) return; wardrobe.design(inp.dataset.part, inp.value); const pv = el.querySelector('.design .pv'); if (pv) pv.innerHTML = outfitPicture(wardrobe.custom, 46); });
      const cv = el.querySelector('.tmap canvas');
      if (!cv) return;
      const g = cv.getContext('2d');
      api.mapOf(g);
      g.putImageData(api.mapImage, 0, 0);
      const s = Math.max(2, AW / 64);
      g.save(); g.translate(-A.x0, -A.z0);      // world positions on the map's picture
      if (treasure && !foundToday) { g.strokeStyle = '#b3121b'; g.lineWidth = s * 0.9; g.lineCap = 'round'; g.beginPath(); g.moveTo(treasure.x - s * 1.6, treasure.z - s * 1.6); g.lineTo(treasure.x + s * 1.6, treasure.z + s * 1.6); g.moveTo(treasure.x + s * 1.6, treasure.z - s * 1.6); g.lineTo(treasure.x - s * 1.6, treasure.z + s * 1.6); g.stroke(); }
      if (api.events && api.events.isle.up) { const q = api.events.isle; g.fillStyle = '#fff'; g.strokeStyle = '#2d5abf'; g.lineWidth = s * 0.5; g.beginPath(); g.arc(q.x, q.z, s * 2.2, 0, 7); g.fill(); g.stroke(); }
      if (cave) { const m = cave.mouth; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(m.x, m.z - s * 2.3); g.lineTo(m.x + s * 2.1, m.z + s * 1.7); g.lineTo(m.x - s * 2.1, m.z + s * 1.7); g.closePath(); g.fill(); g.fillStyle = '#16120c'; g.beginPath(); g.moveTo(m.x, m.z - s * 1.5); g.lineTo(m.x + s * 1.4, m.z + s * 1.2); g.lineTo(m.x - s * 1.4, m.z + s * 1.2); g.closePath(); g.fill(); }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(st.pos.x, st.pos.z, s * 1.25, 0, 7); g.fill(); g.fillStyle = '#e02222'; g.beginPath(); g.arc(st.pos.x, st.pos.z, s * 0.85, 0, 7); g.fill();
      g.restore();
    },
    /** A click inside the quests page or the trade page. True when it was handled (the bag draws again). */
    click(t) {
      if (window.__GAME_FARM && window.__GAME_FARM.click(t)) return true;
      const cape = t.closest('[data-cape]'), brim = t.closest('[data-brim]'), long = t.closest('[data-long]'), skirt = t.closest('[data-skirt]'), flowers = t.closest('[data-flowers]');
      if (cape) { wardrobe.design('cape', cape.dataset.cape === '1' ? '#7747bb' : false); return true; }
      if (long) { wardrobe.design('long', long.dataset.long === '1'); return true; }
      if (skirt) { wardrobe.design('skirt', skirt.dataset.skirt === '1' ? '#c9b6f2' : false); return true; }
      if (flowers) { wardrobe.design('flowers', flowers.dataset.flowers === '1' ? '#ff6f9c' : false); return true; }
      if (brim) { wardrobe.design('brim', brim.dataset.brim === '1'); return true; }
      const look = t.closest('[data-look]'), deal = t.closest('[data-deal]'), view = t.closest('[data-view]');
      if (look) { if (!wardrobe.wear(look.dataset.look)) play.notice('هذا اللبس للحين مقفول.', false, 2000); else if (play.sound) play.sound.ui(); return true; }
      if (deal) { const res = api.trade(+deal.dataset.deal); if (res !== true) play.notice(res, false, 2600); return true; }
      if (view) { st.third = !st.third; return true; }
      return false;
    },
  };

  // ---- every frame
  let wait = 0;
  play.onTick((s, dt) => {
    const sky = window.__GAME_SKY;
    if (sky && sky.night && sky.rain) st.stormTime += dt;
    // the view from behind
    if (st.third !== wasThird) { wasThird = st.third; hideHands(st.third); me.group.visible = st.third; }
    if (st.third) { me.dress(wardrobe.look, st.gear); me.place(st.pos.x, st.pos.y, st.pos.z, st.yaw); me.walk(st.time, st.onGround ? st.moving : 0); me.nod(st.pitch); }
    // the trader turns to the player, and is spoken to when under the crosshair
    tNear = false;
    if (tPos) {
      const dx = st.pos.x - tPos.x, dz = st.pos.z - tPos.z, d = Math.hypot(dx, dz);
      if (d < 9) trader.group.rotation.y = Math.atan2(dx, dz);
      if (d < 4.2 && !st.modal) {
        const cp = Math.cos(st.pitch), vx = -Math.sin(st.yaw) * cp, vy = Math.sin(st.pitch), vz = -Math.cos(st.yaw) * cp;
        const cx = tPos.x - st.pos.x, cy = tPos.y + 1.05 - (st.pos.y + play.tuning.eye), cz = tPos.z - st.pos.z, t = cx * vx + cy * vy + cz * vz;
        tNear = t > 0 && cx * cx + cy * cy + cz * cz - t * t < 0.75;
      }
    }
    if (tag.hidden === tNear) tag.hidden = !tNear;
    // quests and secrets, looked at twice a second
    if ((wait -= dt) > 0) return;
    wait = 0.5;
    const next = QUESTS.find((q) => !done.has(q[0]));
    if (next && next[2](ctx)) { done.add(next[0]); st.xp = (st.xp || 0) + next[3]; save('bw-quests', [...done]); play.notice('خلّصت المهمة: ' + next[1] + ' (+' + next[3] + ' خبرة)', false, 4500); if (play.sound && play.sound.level) play.sound.level(); if (next[4]) setTimeout(() => wardrobe.grant(next[4]), 1800); return; }
    if (QUESTS.every((q) => done.has(q[0]))) earnSports(play);           // every quest done: the sports car (once)
    for (const q of secretsHere) {
      if (done.has('s:' + q[0]) || !q[3](ctx)) continue;
      done.add('s:' + q[0]); st.xp = (st.xp || 0) + q[4]; save('bw-quests', [...done]);
      play.notice('مهمة سرية: ' + q[1] + '! ' + q[2] + ' (+' + q[4] + ' خبرة)', false, 5500); if (play.sound && play.sound.level) play.sound.level();
      if (q[5]) setTimeout(() => wardrobe.grant(q[5]), 2200);
      break;
    }
  });
  play.onUseFirst(() => { if (!tNear || !api.onTrade) return false; api.onTrade(); return true; });
  window.__GAME_ADV = api;
  return api;
}
