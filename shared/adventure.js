// The adventure: quests the player can read, secrets the player has to stumble on, a treasure that lies
// somewhere new every day, outfits earned by all three, a trader to barter with, and the player's own
// figure seen from behind (V). The bag shows its page (المهام) and its trade page.
//
//   const adv = createAdventure({ play, kit, craft, camera, world: 'kawkab' });
//   adv.page()            HTML of the quests page;  adv.drawn(el) after it is in the document;  adv.click(target)
//   adv.opened(hit)       a chest was opened (the day's treasure?)
//   adv.sleep()           a bed was used; true when the night was slept through
//   adv.onTrade = fn      called when the player presses the place button on the trader

import { K, kitItem, kitIcon, kitName } from './kit.js';
import { EMPTY } from './play.js';
import { levelOf } from './status.js';
import { makeAvatar, outfitPicture } from './avatar.js';
import { createWardrobe, TRADER_LOOK } from './outfits.js';
import { makeCave } from './cave.js';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const dayKey = (d = new Date()) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();

// Quests in the open, in order. test(c) reads what the game counts; give: xp and maybe an outfit.
const QUESTS = [
  ['wood', 'جمّع 8 خشب', (c) => c.craft.count('wood') >= 8, 10],
  ['table', 'اصنع طاولة تصنيع', (c) => c.st.made[K.TABLE] >= 1, 10],
  ['tool', 'اصنع فأس أو معول أو سيف', (c) => [212, 214, 216].some((id) => c.st.made[id] >= 1), 12, 'worker'],
  ['cave', 'انزل الكهف (علامته على الخريطة) واجمع 4 ألماسات', (c) => c.craft.count(K.GEM) >= 4 || c.st.made[220] >= 1, 20, 'miner'],
  ['dset', 'اصنع طقم لبس الألماس من 4 ألماسات', (c) => c.st.made[220] >= 1, 15],
  ['hunt', 'صيد حيوانين', (c) => c.st.kills.animal >= 2, 12, 'hunter'],
  ['home', 'ابنِ بيتك: حط 30 مكعب وركّب باب', (c) => c.st.placed >= 30 && c.st.put[K.DOOR] >= 1, 15, 'builder'],
  ['store', 'اصنع صندوق وافتحه', (c) => c.st.made[K.CHEST] >= 1 && c.st.opened >= 1, 12],
  ['slay', 'اقضِ على 3 وحوش', (c) => c.st.kills.monster >= 3, 18, 'guard'],
  ['armor', 'البس درع كامل (4 قطع)', (c) => !!(c.st.gear.head && c.st.gear.chest && c.st.gear.legs && c.st.gear.feet), 20, 'knight'],
  ['level5', 'وصّل المستوى 5', (c) => levelOf(c.st.xp || 0).level >= 5, 25, 'hero'],
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
    const x = 10 + Math.floor(r() * (w.sx - 20)), z = 10 + Math.floor(r() * (w.sz - 20)), y = groundAt(x, z);
    if (y === null || Math.hypot(x - spawn.x, z - spawn.z) < 24) continue;
    if (groundAt(x + 1, z) === null || groundAt(x - 1, z) === null || groundAt(x, z + 1) === null || groundAt(x, z - 1) === null) continue;   // open ground all round, not a ledge or a roof edge
    treasure = { x, y, z };
  }
  if (treasure && !foundToday) {
    kit.setBlock(treasure.x, treasure.y, treasure.z, K.CHEST);
    const c = kit.chestAt(treasure.x, treasure.y, treasure.z), bonus = [213, 216, 214, 224, 226][Math.floor(r() * 5)];
    c[0] = kitItem(K.GOLD, 2 + Math.floor(r() * 3)); c[1] = kitItem(K.DIAMOND, 1); c[2] = kitItem(K.TORCH, 8); c[3] = kitItem(bonus, 1);
  }

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
    wardrobe, trader, me, treasure, deals, cave,
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
      play.notice('نمت لين الصبح.', false, 2600);
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
      return (ev ? `<h3>رسالة اليوم</h3><p class="hint msg">${ev.message()}</p>` : '') + `<h3>كنز اليوم</h3><div class="tmap"><canvas width="${w.sx}" height="${w.sz}"></canvas><p class="hint">${!treasure ? 'ما في كنز اليوم.' : foundToday ? 'لقيت كنز اليوم ✓ كنز جديد بكرة.' : 'علامة ✕ مكان الصندوق، والنقطة الحمرا أنت. الخريطة فوقها الشمال.'}${cave ? ' المثلث الأسود مدخل كهف اليوم: فيه ذهب وألماس.' : ''}${api.events && api.events.isle.up ? ' الدائرة البيضا جزيرة السما (طر لها قبل ما تختفي).' : ''}<br>كنوز لقيتها: ${found}</p></div>`
        + `<h3>المهام ${qs.filter((q) => q.done).length}/${qs.length}</h3><ol class="quests">${qs.map((q) => `<li class="${q.done ? 'done' : q === next ? 'now' : ''}">${q.name}<small>+${q.xp} خبرة${q.outfit ? ' · لبس «' + looks.find((o) => o.key === q.outfit).name + '»' : ''}</small></li>`).join('')}</ol>`
        + `<h3>مهام سرية لقيتها: ${sec.length} من ${secretsHere.length}</h3>${sec.length ? `<ol class="quests">${sec.map((q) => `<li class="done">${q.name}<small>${q.how}</small></li>`).join('')}</ol>` : '<p class="hint">ما تنكتب هني لين تلقاها بروحك. جرّب أشياء غريبة.</p>'}`
        + `<h3>ملابسي</h3><div class="looks">${looks.map((o) => `<button type="button" class="look${o.on ? ' on' : ''}${o.owned ? '' : ' locked'}" data-look="${o.key}">${outfitPicture(o.owned ? o.c : { hat: '#2a2d35', skin: '#3a3d46', shirt: '#2a2d35', pants: '#22252c', shoes: '#1a1c22' }, 34)}<span>${o.owned ? o.name : o.rare ? 'نادر: ؟' : o.name}</span><small>${o.owned ? (o.on ? 'لابسه' : 'البسه') : o.how}</small></button>`).join('')}</div>`
        + `<h3>صمّم شكلك</h3><div class="design">${[['hat', 'الطاقية والشعر'], ['skin', 'البشرة'], ['shirt', 'القميص'], ['pants', 'السروال'], ['shoes', 'الحذاء']].map(([k, t]) => `<label>${t}<input type="color" data-part="${k}" value="${wardrobe.custom[k] || '#888888'}"></label>`).join('')}<label>العباءة<input type="color" data-part="cape" value="${wardrobe.custom.cape || '#7747bb'}"></label><button type="button" class="view" data-cape="${wardrobe.custom.cape ? 0 : 1}">${wardrobe.custom.cape ? 'بدون عباءة' : 'مع عباءة'}</button><button type="button" class="view" data-brim="${wardrobe.custom.brim ? 0 : 1}">${wardrobe.custom.brim ? 'طاقية بدون حافة' : 'طاقية بحافة'}</button><button type="button" class="view" data-long="${wardrobe.custom.long ? 0 : 1}">${wardrobe.custom.long ? 'شعر قصير' : 'شعر طويل'}</button><label>الفستان<input type="color" data-part="skirt" value="${wardrobe.custom.skirt || '#c9b6f2'}"></label><button type="button" class="view" data-skirt="${wardrobe.custom.skirt ? 0 : 1}">${wardrobe.custom.skirt ? 'بدون فستان' : 'مع فستان'}</button><button type="button" class="view" data-flowers="${wardrobe.custom.flowers ? 0 : 1}">${wardrobe.custom.flowers ? 'بدون ورد' : 'تاج ورد'}</button><span class="pv">${outfitPicture(wardrobe.custom, 46)}</span></div>`
        + '<p class="hint"><button type="button" class="view" data-view="1">' + (st.third ? 'ارجع للمنظور الأول' : 'شوف شكلك من ورا (V)') + '</button></p>';
    },
    /** The picture of the world from above (made once): ground by height, water blue. */
    mapOf(g) {
      if (!api.mapImage) {
        const ctx = g || document.createElement('canvas').getContext('2d');
        const img = ctx.createImageData(w.sx, w.sz), top = new Int16Array(w.sx * w.sz); let lo = 1e9, hi = -1e9;
        for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) { let y = w.sy - 1; while (y > 0 && w.get(x, y, z) === 0) y--; const wet = play.isLiquid(w.get(x, y, z)); top[x + z * w.sx] = wet ? -1 : y; if (!wet) { if (y < lo) lo = y; if (y > hi) hi = y; } }
        for (let i = 0; i < top.length; i++) { const k = top[i] < 0 ? -1 : (top[i] - lo) / Math.max(1, hi - lo), o = i * 4; if (k < 0) { img.data[o] = 70; img.data[o + 1] = 130; img.data[o + 2] = 170; } else { img.data[o] = 110 + k * 125; img.data[o + 1] = 92 + k * 120; img.data[o + 2] = 58 + k * 100; } img.data[o + 3] = 255; }
        api.mapImage = img;
      }
      return api.mapImage;
    },
    /** After page() is in the document: draw the map. */
    drawn(el) {
      // the designer's colour boxes: each change dresses the figure at once
      for (const inp of el.querySelectorAll('.design input[type="color"]')) inp.addEventListener('input', () => { if ((inp.dataset.part === 'cape' || inp.dataset.part === 'skirt') && !wardrobe.custom[inp.dataset.part]) return; wardrobe.design(inp.dataset.part, inp.value); const pv = el.querySelector('.design .pv'); if (pv) pv.innerHTML = outfitPicture(wardrobe.custom, 46); });
      const cv = el.querySelector('.tmap canvas');
      if (!cv) return;
      const g = cv.getContext('2d');
      api.mapOf(g);
      g.putImageData(api.mapImage, 0, 0);
      const s = Math.max(2, w.sx / 64);
      if (treasure && !foundToday) { g.strokeStyle = '#b3121b'; g.lineWidth = s * 0.9; g.lineCap = 'round'; g.beginPath(); g.moveTo(treasure.x - s * 1.6, treasure.z - s * 1.6); g.lineTo(treasure.x + s * 1.6, treasure.z + s * 1.6); g.moveTo(treasure.x + s * 1.6, treasure.z - s * 1.6); g.lineTo(treasure.x - s * 1.6, treasure.z + s * 1.6); g.stroke(); }
      if (api.events && api.events.isle.up) { const q = api.events.isle; g.fillStyle = '#fff'; g.strokeStyle = '#2d5abf'; g.lineWidth = s * 0.5; g.beginPath(); g.arc(q.x, q.z, s * 2.2, 0, 7); g.fill(); g.stroke(); }
      if (cave) { const m = cave.mouth; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(m.x, m.z - s * 2.3); g.lineTo(m.x + s * 2.1, m.z + s * 1.7); g.lineTo(m.x - s * 2.1, m.z + s * 1.7); g.closePath(); g.fill(); g.fillStyle = '#16120c'; g.beginPath(); g.moveTo(m.x, m.z - s * 1.5); g.lineTo(m.x + s * 1.4, m.z + s * 1.2); g.lineTo(m.x - s * 1.4, m.z + s * 1.2); g.closePath(); g.fill(); }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(st.pos.x, st.pos.z, s * 1.25, 0, 7); g.fill(); g.fillStyle = '#e02222'; g.beginPath(); g.arc(st.pos.x, st.pos.z, s * 0.85, 0, 7); g.fill();
    },
    /** A click inside the quests page or the trade page. True when it was handled (the bag draws again). */
    click(t) {
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
