// The bag (key E), in three pages. Arabic, built in HTML, works with a mouse and with a finger.
//   أغراضي       what the player carries: four places for clothing, the other hand, 27 places, and the hotbar.
//                Tap a thing, then tap where it goes: it moves there, or the two change places.
//   التصنيع      recipes: what can be made from what is carried (some need a workbench nearby).
//   كل البلوكات   the catalogue: pick a hotbar square, then an item, and a full pile of it lands in that square.
// A chest opens the first page with the chest's 27 places above the player's own.
//
//   const bag = createBag({ play, kit, camera, world: 'key', groups, iconOf, mats, fontFamily, accent, line, extra: { label, onClick }, onMenu });
//   (the fourth page, المهام, and the trader's page come from adventure.js)
//   createPlay({ onBag: () => bag.toggle(), onInteract: (h) => bag.interact(h), ... })
//
// groups: [{ title, items: [{ id | tool, name, n, ... }] }]   an item is copied into the slot as it is
// iconOf(item): HTML for the item's icon (the world's own icons for its own items, kitIcon for kit blocks)
// mats: { wood: { ids, name }, stone: { ids, name }, ore: { ids, name } }   this world's stuff for the recipes

import { EMPTY } from './play.js';
import { createCraft } from './craft.js';
import { createAdventure } from './adventure.js';

const CSS = `
#bag { position: fixed; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center; direction: rtl; color: #f1f4f8; --c: 46px;
  background: rgba(3, 6, 10, .62); -webkit-user-select: none; user-select: none; touch-action: manipulation; }
#bag[hidden] { display: none; }
#bag button { -webkit-tap-highlight-color: transparent; }
#bag .box { box-sizing: border-box; display: flex; flex-direction: column; width: min(780px, calc(100vw - 20px)); max-height: calc(100vh - 16px);
  border-radius: 14px; background: rgba(10, 14, 20, .93); border: 1px solid var(--bg-line, rgba(255, 255, 255, .24)); box-shadow: 0 18px 60px rgba(0, 0, 0, .55); overflow: hidden; }
#bag header { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid rgba(255, 255, 255, .1); }
#bag h2 { margin: 0; font-size: 19px; font-weight: 700; color: var(--bg-accent, #fff); }
#bag .tabs { display: flex; gap: 4px; flex: 1; justify-content: center; }
#bag .tabs button { font: inherit; font-size: 14px; font-weight: 700; min-height: 40px; padding: 4px 13px; border-radius: 9px; color: inherit; cursor: pointer; background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .14); }
#bag .tabs button.on { color: #0b0f14; background: var(--bg-accent, #fff); border-color: var(--bg-accent, #fff); }
#bag .x, #bag .extra, #bag .menu { font: inherit; font-size: 13px; font-weight: 700; min-width: 44px; min-height: 40px; padding: 4px 11px; border-radius: 9px; border: 1px solid var(--bg-line, rgba(255, 255, 255, .3)); background: none; color: inherit; cursor: pointer; }
#bag .page { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 6px 14px 10px; -webkit-overflow-scrolling: touch; }
#bag .page[hidden] { display: none; }
#bag h3 { margin: 8px 2px 5px; font-size: 13px; font-weight: 700; opacity: .8; }
#bag .hint { margin: 6px 2px 0; font-size: 12.5px; line-height: 1.5; opacity: .8; min-height: 19px; }
#bag .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 6px; }
#bag .cells { display: grid; grid-template-columns: repeat(9, var(--c)); gap: 4px; justify-content: center; direction: rtl; }
#bag .worn { display: flex; gap: 4px; justify-content: center; align-items: flex-start; direction: rtl; }
#bag .worn .gap { width: 18px; }
#bag .worn label { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10.5px; opacity: .85; }
#bag .it, #bag .sq { position: relative; box-sizing: border-box; font: inherit; color: inherit; cursor: pointer; border-radius: 10px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .12); padding: 0; }
#bag .it { display: flex; flex-direction: column; align-items: center; gap: 3px; min-height: 68px; padding: 7px 3px 5px; }
#bag .it:hover, #bag .it:focus-visible, #bag .sq:hover { background: rgba(255, 255, 255, .12); outline: none; border-color: var(--bg-accent, #fff); }
#bag .it .pic, #bag .sq .pic, #bag .rec .pic { position: relative; display: block; width: 34px; height: 34px; flex: none; }
#bag .pic > * { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; margin: 0 !important; transform: none !important; }
#bag .it span { font-size: 11px; line-height: 1.25; text-align: center; opacity: .88; }
#bag footer { padding: 6px 14px 10px; border-top: 1px solid rgba(255, 255, 255, .1); background: rgba(0, 0, 0, .25); }
#bag footer p { margin: 0 0 5px; font-size: 12px; opacity: .75; }
#bag .bar { display: flex; gap: 4px; justify-content: center; direction: rtl; }
#bag .sq { display: flex; align-items: center; justify-content: center; width: var(--c); height: var(--c); flex: none; }
#bag .sq.on { border: 2px solid var(--bg-accent, #fff); background: rgba(255, 255, 255, .14); }
#bag .sq.held { border: 2px solid #ffd76a; background: rgba(255, 215, 106, .22); }
#bag .sq b { position: absolute; top: 1px; right: 4px; font-size: 9.5px; font-weight: 500; opacity: .55; }
#bag .sq i { position: absolute; bottom: 0; left: 4px; font-style: normal; font-size: 11px; font-weight: 700; text-shadow: 0 1px 2px #000; }
#bag .recs { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px; }
#bag .rec { display: flex; align-items: center; gap: 9px; box-sizing: border-box; min-height: 58px; padding: 6px 9px; font: inherit; color: inherit; text-align: right; cursor: pointer; border-radius: 10px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .12); }
#bag .rec.can { border-color: var(--bg-accent, #fff); background: rgba(255, 255, 255, .1); }
#bag .rec:not(.can) { opacity: .6; }
#bag .rec div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
#bag .rec strong { font-size: 13.5px; }
#bag .rec small { font-size: 11.5px; line-height: 1.4; opacity: .85; }
#bag .rec small u { text-decoration: none; color: #ff9a8a; }
#bag .tmap { display: flex; gap: 12px; align-items: flex-start; }
#bag .tmap canvas { width: 172px; height: 172px; flex: none; image-rendering: pixelated; border-radius: 8px; border: 2px solid rgba(120, 92, 50, .9); background: #6b5a3c; }
#bag .quests { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 5px; }
#bag .quests li { padding: 6px 10px; border-radius: 9px; border: 1px solid rgba(255, 255, 255, .12); font-size: 13px; line-height: 1.4; opacity: .5; }
#bag .quests li small { display: block; font-size: 11px; opacity: .8; }
#bag .quests li.now { opacity: 1; border-color: var(--bg-accent, #fff); background: rgba(255, 255, 255, .08); }
#bag .quests li.done { opacity: .85; text-decoration: line-through; text-decoration-color: rgba(255, 255, 255, .4); }
#bag .quests li.done small { text-decoration: none; }
#bag .looks { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 6px; }
#bag .look { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 3px 5px; font: inherit; color: inherit; cursor: pointer; border-radius: 10px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .12); }
#bag .look.on { border: 2px solid var(--bg-accent, #fff); background: rgba(255, 255, 255, .12); }
#bag .look.locked { opacity: .55; }
#bag .look span { font-size: 11.5px; font-weight: 700; }
#bag .look small { font-size: 10px; opacity: .8; text-align: center; line-height: 1.3; }
#bag .view { font: inherit; font-size: 13px; font-weight: 700; min-height: 40px; padding: 5px 16px; border-radius: 9px; border: 1px solid var(--bg-line, rgba(255, 255, 255, .3)); background: none; color: inherit; cursor: pointer; }
@media (max-height: 500px), (max-width: 560px) { #bag { --c: 36px; } #bag header { padding: 4px 10px; gap: 5px; } #bag h2 { display: none; } #bag .tabs button { min-height: 36px; padding: 3px 9px; font-size: 12.5px; } #bag .x, #bag .extra, #bag .menu { min-height: 36px; padding: 3px 8px; font-size: 12px; }
  #bag .page { padding: 2px 10px 5px; } #bag h3 { margin: 4px 2px 3px; font-size: 11.5px; } #bag .hint { font-size: 11px; margin-top: 3px; min-height: 16px; }
  #bag .it { min-height: 56px; padding: 4px 2px 3px; } #bag .it .pic, #bag .sq .pic, #bag .rec .pic { width: 26px; height: 26px; } #bag .it span { font-size: 10px; } #bag footer { padding: 4px 10px 6px; } #bag footer p { display: none; }
  #bag .rec { min-height: 48px; padding: 4px 7px; } #bag .worn label { font-size: 9.5px; } }
`;

const WEAR = [['head', 'خوذة'], ['chest', 'صدرية'], ['legs', 'سروال'], ['feet', 'حذاء']];
const TABS = [['mine', 'أغراضي'], ['craft', 'التصنيع'], ['all', 'كل البلوكات'], ['quests', 'المهام']];
const has = (it) => !!it && !it.empty;

export function createBag(o) {
  const { play, kit } = o, st = play.state;
  const css = document.createElement('style');
  css.textContent = CSS;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'bag'; el.hidden = true;
  el.style.fontFamily = o.fontFamily || 'sans-serif';
  if (o.accent) el.style.setProperty('--bg-accent', o.accent);
  if (o.line) el.style.setProperty('--bg-line', o.line);
  el.innerHTML = '<div class="box" role="dialog" aria-label="الحقيبة"><header><h2>الحقيبة</h2><div class="tabs">'
    + TABS.map(([k, t]) => `<button type="button" data-tab="${k}">${t}</button>`).join('') + '</div>'
    + (o.extra ? '<button type="button" class="extra"></button>' : '') + (o.onMenu ? '<button type="button" class="menu">القائمة</button>' : '')
    + '<button type="button" class="x">إغلاق</button></header>'
    + '<div class="page" data-page="mine"></div><div class="page" data-page="craft"></div><div class="page" data-page="all"><div class="list"></div></div><div class="page" data-page="quests"></div><div class="page" data-page="trade"></div>'
    + '<footer><p>مربعاتك</p><div class="bar"></div></footer></div>';
  document.body.appendChild(el);
  const pages = Object.fromEntries([...el.querySelectorAll('.page')].map((p) => [p.dataset.page, p]));
  const list = el.querySelector('.list'), bar = el.querySelector('.bar');
  if (o.extra) el.querySelector('.extra').textContent = o.extra.label;

  // ---- the catalogue (built once)
  const items = [];
  for (const g of o.groups) {
    if (!g.items.length) continue;
    const h = document.createElement('h3'); h.textContent = g.title;
    const grid = document.createElement('div'); grid.className = 'grid';
    for (const it of g.items) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'it'; b.dataset.item = String(items.length);
      b.innerHTML = `<span class="pic">${o.iconOf(it)}</span><span></span>`;
      b.lastChild.textContent = it.name;
      grid.appendChild(b); items.push(it);
    }
    list.append(h, grid);
  }
  // what is dug starts a new pile when the catalogue knows the item
  play.itemOf = (id) => { const it = items.find((q) => q.id === id && !q.tool); return it ? { ...it } : null; };
  if (kit && kit.attach) kit.attach(play);
  const craft = createCraft({ play, kit, mats: o.mats || {} });
  const adv = kit ? createAdventure({ play, kit, craft, camera: o.camera, world: o.world }) : null;
  if (adv) adv.onTrade = () => { if (st.modal) return; tab = 'trade'; show(true); if (play.sound) play.sound.ui(); };

  // ---- places: the hotbar, the backpack, what is worn, the other hand, an open chest
  let tab = 'mine', chest = null, held = null, note = '';
  try { const t = window.localStorage.getItem('bw-bag-tab'); if (TABS.some((q) => q[0] === t)) tab = t; } catch (e) { /* storage may be closed */ }
  const get = (z, k) => (z === 'bar' ? st.slots[k] : z === 'pack' ? st.pack[k] : z === 'chest' ? chest[k] : st.gear[k]);
  const put = (z, k, it) => { if (z === 'bar') st.slots[k] = has(it) ? it : EMPTY; else if (z === 'pack') st.pack[k] = has(it) ? it : null; else if (z === 'chest') chest[k] = has(it) ? it : null; else st.gear[k] = has(it) ? it : null; };
  const fits = (z, k, it) => !has(it) || z === 'bar' || z === 'pack' || z === 'chest' || k === 'off' || it.wear === k;
  const cell = (z, k, it, label, cls = '') => `<button type="button" class="sq${cls}${held && held.z === z && String(held.k) === String(k) ? ' held' : ''}" data-z="${z}" data-k="${k}"${z === 'bar' ? ` data-sq="${k}"` : ''}>${label ? `<b>${label}</b>` : ''}<span class="pic">${has(it) ? o.iconOf(it) || '' : ''}</span>${has(it) && !it.tool && it.n != null ? `<i>${it.n}</i>` : ''}</button>`;
  const cells = (z, arr) => `<div class="cells">${arr.map((it, i) => cell(z, i, it)).join('')}</div>`;
  function move(a, b) {
    const A = get(a.z, a.k), B = get(b.z, b.k);
    if (!fits(b.z, b.k, A) || !fits(a.z, a.k, B)) { note = b.z === 'gear' || a.z === 'gear' ? 'هذا المكان للّبس اللي يناسبه بس.' : ''; return; }
    if (has(B) && B.id === A.id && !A.tool && !B.tool) { B.n = Math.min(999, (B.n || 0) + (A.n || 0)); put(a.z, a.k, null); }
    else { put(a.z, a.k, B); put(b.z, b.k, A); }
    note = '';
    play.changed();
  }
  function tapPlace(z, k) {
    const it = get(z, k);
    if (!held) { if (has(it)) held = { z, k }; }
    else if (held.z === z && String(held.k) === String(k)) held = null;
    else { move(held, { z, k: z === 'gear' ? k : +k }); held = null; }
    draw();
  }

  // ---- drawing
  function drawBar() {
    bar.innerHTML = st.slots.map((s, i) => cell('bar', i, s, String(i + 1), i === st.sel ? ' on' : '')).join('');
  }
  function drawMine() {
    const h = held ? get(held.z, held.k) : null;
    pages.mine.innerHTML = (chest ? `<h3>الصندوق</h3>${cells('chest', chest)}<h3>حقيبتك</h3>` :
      `<div class="worn">${WEAR.map(([k, t]) => `<label>${cell('gear', k, st.gear[k])}${t}</label>`).join('')}<span class="gap"></span><label>${cell('gear', 'off', st.gear.off)}اليد الثانية</label></div><h3>حقيبتك</h3>`)
      + cells('pack', st.pack)
      + `<p class="hint">${note || (has(h) ? 'اخترت «' + h.name + '». اضغط المكان اللي تبيه فيه.' : 'اضغط على غرض، بعدين اضغط المكان اللي تبي تنقله له.')}</p>`;
  }
  function drawCraft() {
    const near = craft.tableNear();
    pages.craft.innerHTML = `<p class="hint">${near ? 'طاولة التصنيع قريبة: كل الوصفات مفتوحة.' : 'بدون طاولة تصنيع تقدر تسوي الأشياء البسيطة. اصنع طاولة وحطها قريب منك تفتح الباقي.'}</p><div class="recs">`
      + craft.list().map((r, i) => `<button type="button" class="rec${r.can ? ' can' : ''}" data-rec="${i}"><span class="pic">${o.iconOf(r.item)}</span><div><strong>${r.item.name}${r.n > 1 ? ' ×' + r.n : ''}</strong><small>${r.needs.map((q) => (q.have >= q.n ? `${q.n} ${q.name}` : `<u>${q.n} ${q.name} (عندك ${q.have})</u>`)).join(' + ')}${r.table && !near ? ' · <u>يبي طاولة</u>' : ''}</small></div></button>`).join('')
      + '</div>';
  }
  function draw() {
    for (const [k, p] of Object.entries(pages)) p.hidden = k !== tab;
    for (const b of el.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    drawBar();
    if (tab === 'mine') drawMine(); else if (tab === 'craft') drawCraft();
    else if (tab === 'quests' && adv) { pages.quests.innerHTML = adv.page(); adv.drawn(pages.quests); }
    else if (tab === 'trade' && adv) pages.trade.innerHTML = '<h3>التاجر</h3>' + adv.tradePage();
  }
  function setTab(t) { tab = t; held = null; note = ''; if (t !== 'mine') chest = null; try { if (t !== 'trade') window.localStorage.setItem('bw-bag-tab', t); } catch (e) { /* not kept */ } draw(); }

  let open = false, openedAt = 0;
  function show(v) {
    if (v === open || (v && st.modal)) return;      // one panel at a time
    open = v; el.hidden = !v;
    if (v) openedAt = performance.now(); else { chest = null; held = null; note = ''; if (tab === 'trade') tab = 'mine'; }
    play.setModal(v);
    if (v) draw();
    if (o.onToggle) o.onToggle(v);
  }
  el.addEventListener('click', (e) => {
    if (performance.now() - openedAt < 350) return;          // the tap that opened the bag must not also pick what appears under the finger
    const t = e.target, tb = t.closest('[data-tab]'), it = t.closest('[data-item]'), rec = t.closest('[data-rec]'), pl = t.closest('[data-z]');
    if (tb) setTab(tb.dataset.tab);
    else if ((tab === 'quests' || tab === 'trade') && adv && adv.click(t)) draw();
    else if (tab === 'all' && pl && pl.dataset.z === 'bar') { play.select(+pl.dataset.k); drawBar(); }
    else if (tab === 'craft' && pl && pl.dataset.z === 'bar') { play.select(+pl.dataset.k); drawBar(); }
    else if (pl) tapPlace(pl.dataset.z, pl.dataset.z === 'gear' ? pl.dataset.k : +pl.dataset.k);
    else if (it) { play.setSlot(st.sel, { ...items[+it.dataset.item] }); drawBar(); }
    else if (rec) { const r = craft.make(+rec.dataset.rec); if (r !== true) play.notice(r, false, 2600); draw(); }
    else if (o.extra && t.closest('.extra')) { show(false); o.extra.onClick(); }
    else if (o.onMenu && t.closest('.menu')) { show(false); o.onMenu(); }
    else if (t.closest('.x') || t === el) show(false);
  });
  window.addEventListener('keydown', (e) => { if (open && e.code === 'Escape') { show(false); e.preventDefault(); } });
  return {
    el, items, craft, adv,
    open: () => show(true), close: () => show(false), toggle: () => show(!open), isOpen: () => open,
    get tab() { return tab; }, setTab,
    /** The place button on a block: a door swings, a chest opens here, a workbench opens the recipes. True when it was one of those. */
    interact(h) {
      const r = kit && kit.interact ? kit.interact(h) : null;
      if (!r) return false;
      if (r === 'door') return true;
      if (st.modal) return true;
      if (r.bed) return adv ? adv.sleep() : false;                 // by day a bed is a block like any other
      if (r.chest) { chest = r.chest; tab = 'mine'; st.opened++; show(true); if (play.sound) play.sound.ui(); if (adv) adv.opened(h); }
      else if (r.table) { tab = 'craft'; show(true); if (play.sound) play.sound.ui(); }
      return true;
    },
  };
}
