// «تخصيص أماكن الأزرار» (from the settings): every button and panel on the screen gets a dashed frame; drag one to move it,
// and change its size and how see-through it is. «حفظ واستخدام» keeps the layout on this device and goes back to the game,
// «خروج» leaves without keeping, «إعادة ضبط» puts everything back where the game had it.
//
// What moves: the touch buttons ([data-act]: stick, jump, dig, place, bag, pause, down), the corner buttons of the world
// switcher, and the panels of the world's HUD (time, vitals, compass, the hotbar). Each is moved with the CSS properties
// translate / scale / opacity, which add to what the world's own CSS does (centring transforms stay as they are).
// Kept per world and per kind of screen (touch or not), as fractions of the screen, so another screen size still fits.
//
//   const layout = mountLayout({ panel, onStart, name, touch, fontFamily });      layout.open()

const CSS = `
#bwLayout { position: fixed; inset: 0; z-index: 80; direction: rtl; touch-action: none; -webkit-user-select: none; user-select: none; }
#bwLayout[hidden] { display: none; }
#bwLayout .fr { position: fixed; box-sizing: border-box; border: 2px dashed rgba(70, 225, 255, .9); border-radius: 6px; background: rgba(70, 225, 255, .06); cursor: grab; touch-action: none; }
#bwLayout .fr.on { border-style: solid; border-color: #ffd34d; background: rgba(255, 211, 77, .14); box-shadow: 0 0 0 2px rgba(0, 0, 0, .35); }
#bwLayout .fr i { position: absolute; width: 9px; height: 9px; border: 3px solid rgba(70, 225, 255, 1); }
#bwLayout .fr.on i { border-color: #ffd34d; }
#bwLayout .fr i:nth-child(1) { top: -4px; right: -4px; border-left: 0; border-bottom: 0; } #bwLayout .fr i:nth-child(2) { top: -4px; left: -4px; border-right: 0; border-bottom: 0; }
#bwLayout .fr i:nth-child(3) { bottom: -4px; right: -4px; border-left: 0; border-top: 0; } #bwLayout .fr i:nth-child(4) { bottom: -4px; left: -4px; border-right: 0; border-top: 0; }
#bwLayout .pn { position: fixed; left: 50%; top: 12%; transform: translateX(-50%); box-sizing: border-box; width: min(430px, calc(100vw - 20px)); padding: 10px 12px 10px; border-radius: 12px;
  background: rgba(22, 27, 36, .94); border: 1px solid rgba(255, 255, 255, .22); box-shadow: 0 12px 40px rgba(0, 0, 0, .5); color: #eef2f7; }
#bwLayout .pn h3 { margin: 0 0 8px; font-size: 17px; font-weight: 800; text-align: center; cursor: move; }
#bwLayout .row { display: flex; gap: 12px; align-items: center; }
#bwLayout .sl { flex: 1; display: grid; gap: 8px; }
#bwLayout label { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; font-size: 13px; font-weight: 700; }
#bwLayout label b { font-weight: 700; color: #ffd34d; direction: ltr; }
#bwLayout input[type="range"] { grid-column: 1 / -1; width: 100%; accent-color: #ffd34d; }
#bwLayout .ar { display: grid; grid-template-columns: repeat(3, 34px); grid-template-rows: repeat(3, 30px); gap: 3px; direction: ltr; }
#bwLayout .ar button { padding: 0; font-size: 15px; color: #ffd34d; background: rgba(0, 0, 0, .35); border: 1px solid rgba(255, 211, 77, .6); border-radius: 6px; cursor: pointer; }
#bwLayout .ar button:disabled { opacity: .35; }
#bwLayout .bt { display: flex; gap: 8px; margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(255, 255, 255, .14); }
#bwLayout .bt button { flex: 1; min-height: 38px; font: inherit; font-size: 14px; font-weight: 800; border: 0; border-radius: 6px; cursor: pointer; }
#bwLayout .bt .save { color: #1b1606; background: #ffd34d; } #bwLayout .bt .exit { color: #08202a; background: #8fd3f0; } #bwLayout .bt .reset { color: #fff; background: #c8322b; }
#bwLayout .hint { margin: 6px 0 0; font-size: 11.5px; opacity: .7; text-align: center; }
@media (max-height: 430px) { #bwLayout .pn { top: 8px; padding: 7px 10px 8px; } #bwLayout .pn h3 { font-size: 15px; margin-bottom: 4px; } #bwLayout .sl { gap: 4px; } #bwLayout .bt { margin-top: 6px; padding-top: 6px; } #bwLayout .bt button { min-height: 32px; font-size: 13px; } #bwLayout .hint { display: none; } }
`;
const SKIP = /cross|aim|target|t-look|^look|tags|notice|toast/i;
const ACTS = ['stick', 'jump', 'dig', 'place', 'bag', 'pause', 'down'].map((a) => `[data-act="${a}"]`).join(',');      // the touch buttons

/** The things on the screen that may be moved, each with a key that stays the same from one game to the next. */
export function movables() {
  const W = window.innerWidth, H = window.innerHeight, out = [], seen = new Map();
  const shown = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const add = (el, key) => { const n = seen.get(key) || 0; seen.set(key, n + 1); out.push({ el, key: n ? key + '#' + n : key }); };
  for (const el of document.querySelectorAll(ACTS)) if (!el.closest('#bag, #playPanel, #netPanel, #bwSwitch, #bwLayout') && shown(el)) add(el, 'act:' + el.dataset.act);
  for (const el of document.querySelectorAll('#bwCorner [data-sw]')) if (shown(el)) add(el, 'corner:' + el.dataset.sw);
  const hud = document.getElementById('hud');
  const walk = (box, depth) => {
    for (const c of box.children) {
      if (!shown(c)) continue;
      const r = c.getBoundingClientRect(), name = c.id || (typeof c.className === 'string' ? c.className.trim().split(/\s+/)[0] : '') || c.tagName.toLowerCase();
      if (r.width * r.height > W * H * 0.3) { if (depth < 3) walk(c, depth + 1); continue; }      // a wrapper over the whole screen: what is inside it
      if (SKIP.test(name) || c.querySelector(ACTS) || c.matches(ACTS)) continue;      // the middle of the screen stays; groups of buttons move button by button
      const pos = getComputedStyle(c).position;
      if (pos !== 'absolute' && pos !== 'fixed') continue;
      add(c, 'hud:' + name);
    }
  };
  if (hud) walk(hud, 0);
  return out;
}

export function mountLayout({ panel, onStart, name, touch, fontFamily }) {
  if (document.getElementById('bwLayout')) return window.__GAME_LAYOUT || null;
  const KEY = 'bw-layout:' + String(name || 'world') + ':' + (touch ? 't' : 'd');
  const load = () => { try { const v = JSON.parse(window.localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
  let saved = load();
  const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);

  /** Put one thing where its layout says: x, y are fractions of the screen; s the size; o how solid (1 = not see-through). */
  function place(el, v) {
    const W = window.innerWidth, H = window.innerHeight;
    el.style.translate = v && (v.x || v.y) ? `${Math.round((v.x || 0) * W)}px ${Math.round((v.y || 0) * H)}px` : '';
    el.style.scale = v && v.s && v.s !== 1 ? String(v.s) : '';
    el.style.opacity = v && v.o != null && v.o < 1 ? String(v.o) : '';
  }
  function applyAll(lay) { for (const m of movables()) place(m.el, lay[m.key]); }
  applyAll(saved);
  for (const t of [800, 2500, 6000]) setTimeout(() => applyAll(saved), t);      // things made a little later (the corner buttons, the way down)
  window.addEventListener('resize', () => setTimeout(() => applyAll(saved), 150));

  // ---- the editor
  const root = document.createElement('div');
  root.id = 'bwLayout'; root.hidden = true;
  if (fontFamily) root.style.fontFamily = fontFamily;
  root.innerHTML = '<div class="frames"></div><div class="pn" role="dialog" aria-label="تخصيص أماكن الأزرار"><h3>تخصيص أماكن الأزرار</h3><div class="row"><div class="sl">'
    + '<label>الحجم <b data-v="s"></b><input type="range" min="60" max="160" step="5" data-k="s" aria-label="الحجم"></label>'
    + '<label>الشفافية <b data-v="o"></b><input type="range" min="20" max="100" step="5" data-k="o" aria-label="الشفافية"></label></div>'
    + '<div class="ar"><span></span><button type="button" data-nudge="0,-1" aria-label="فوق">▲</button><span></span><button type="button" data-nudge="-1,0" aria-label="يسار">◀</button><span></span><button type="button" data-nudge="1,0" aria-label="يمين">▶</button><span></span><button type="button" data-nudge="0,1" aria-label="تحت">▼</button><span></span></div></div>'
    + '<div class="bt"><button type="button" class="save" data-do="save">حفظ واستخدام</button><button type="button" class="exit" data-do="exit">خروج</button><button type="button" class="reset" data-do="reset">إعادة ضبط</button></div>'
    + '<p class="hint">اسحب أي زر أو لوحة لمكانها. اختر وحدة وغيّر حجمها وشفافيتها، أو بدون اختيار يتغيّر الكل.</p></div>';
  document.body.appendChild(root);
  const framesEl = root.querySelector('.frames'), pn = root.querySelector('.pn');
  let items = [], lay = {}, sel = null, raf = 0, wasHidden = [];
  const valOf = (key) => (lay[key] = lay[key] || { x: 0, y: 0, s: 1, o: 1 });

  function frames() {
    for (const it of items) { const r = it.el.getBoundingClientRect(); Object.assign(it.fr.style, { left: (r.left - 3) + 'px', top: (r.top - 3) + 'px', width: (r.width + 6) + 'px', height: (r.height + 6) + 'px' }); it.fr.classList.toggle('on', it === sel); }
    raf = requestAnimationFrame(frames);
  }
  function showValues() {
    const v = sel ? valOf(sel.key) : null;
    const s = v ? v.s : (items.length ? items.reduce((a, it) => a + valOf(it.key).s, 0) / items.length : 1);
    const o = v ? v.o : (items.length ? items.reduce((a, it) => a + valOf(it.key).o, 0) / items.length : 1);
    root.querySelector('[data-k="s"]').value = Math.round(s * 100); root.querySelector('[data-v="s"]').textContent = Math.round(s * 100) + '%';
    root.querySelector('[data-k="o"]').value = Math.round(o * 100); root.querySelector('[data-v="o"]').textContent = Math.round(o * 100) + '%';
    for (const b of root.querySelectorAll('[data-nudge]')) b.disabled = !sel;
  }
  /** Keep a thing on the screen: if a move or a size would push it off, it stops at the edge. */
  function keepIn(it) {
    const v = valOf(it.key), r = it.el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    let dx = 0, dy = 0;
    if (r.left < 0) dx = -r.left; else if (r.right > W) dx = W - r.right;
    if (r.top < 0) dy = -r.top; else if (r.bottom > H) dy = H - r.bottom;
    if (dx || dy) { v.x += dx / W; v.y += dy / H; place(it.el, v); }
  }
  function open() {
    lay = JSON.parse(JSON.stringify(saved));
    // the way down shows only while flying: show it now, so it too can be put where the player wants it
    wasHidden = [...document.querySelectorAll('[data-act="down"]')].filter((b) => b.hidden);
    for (const b of wasHidden) b.hidden = false;
    root.hidden = false;
    panel.hide();
    framesEl.innerHTML = ''; items = []; sel = null; showValues();
    // a moment later: the corner buttons come back once the panel has gone (the world switcher sees that), and get frames too
    setTimeout(() => {
      if (root.hidden) return;
      items = movables().map((m) => { const fr = document.createElement('div'); fr.className = 'fr'; fr.innerHTML = '<i></i><i></i><i></i><i></i>'; framesEl.appendChild(fr); const it = { ...m, fr }; fr._it = it; return it; });
      showValues();
      cancelAnimationFrame(raf); frames();
    }, 80);
  }
  function close() {
    root.hidden = true; cancelAnimationFrame(raf); framesEl.innerHTML = ''; items = []; sel = null;
    for (const b of wasHidden) b.hidden = true;
    wasHidden = [];
  }

  // dragging a frame moves its thing; a tap only picks it
  let drag = null;
  framesEl.addEventListener('pointerdown', (e) => {
    const fr = e.target.closest('.fr'); if (!fr) return;
    const it = fr._it, v = valOf(it.key);
    sel = it; showValues();
    drag = { id: e.pointerId, it, x0: e.clientX, y0: e.clientY, vx: v.x, vy: v.y };
    fr.setPointerCapture(e.pointerId); e.preventDefault();
  });
  framesEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const v = valOf(drag.it.key);
    v.x = drag.vx + (e.clientX - drag.x0) / window.innerWidth; v.y = drag.vy + (e.clientY - drag.y0) / window.innerHeight;
    place(drag.it.el, v); keepIn(drag.it); e.preventDefault();
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  framesEl.addEventListener('pointerup', end); framesEl.addEventListener('pointercancel', end);
  // a tap on the empty screen lets go of the one picked (then the sliders change all of them)
  root.addEventListener('pointerdown', (e) => { if (e.target === root || e.target === framesEl) { sel = null; showValues(); } });

  // the panel moves by its title, so it never stands over the thing being placed
  const h3 = pn.querySelector('h3');
  let pdrag = null;
  h3.addEventListener('pointerdown', (e) => { const r = pn.getBoundingClientRect(); pdrag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top }; h3.setPointerCapture(e.pointerId); e.preventDefault(); });
  h3.addEventListener('pointermove', (e) => {
    if (!pdrag || e.pointerId !== pdrag.id) return;
    const r = pn.getBoundingClientRect(), x = Math.max(0, Math.min(window.innerWidth - r.width, e.clientX - pdrag.dx)), y = Math.max(0, Math.min(window.innerHeight - r.height, e.clientY - pdrag.dy));
    Object.assign(pn.style, { left: x + 'px', top: y + 'px', transform: 'none' });
  });
  h3.addEventListener('pointerup', () => { pdrag = null; });

  root.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.k; if (!k) return;
    const val = (+e.target.value) / 100;
    for (const it of sel ? [sel] : items) { valOf(it.key)[k] = val; place(it.el, valOf(it.key)); if (k === 's') keepIn(it); }
    root.querySelector('[data-v="' + k + '"]').textContent = Math.round(val * 100) + '%';
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.nudge && sel) { const [dx, dy] = b.dataset.nudge.split(',').map(Number), v = valOf(sel.key); v.x += dx * 4 / window.innerWidth; v.y += dy * 4 / window.innerHeight; place(sel.el, v); keepIn(sel); }
    else if (b.dataset.do === 'save') {
      for (const k of Object.keys(lay)) { const v = lay[k]; if (Math.abs(v.x) < 1e-4 && Math.abs(v.y) < 1e-4 && v.s === 1 && v.o === 1) delete lay[k]; }
      saved = lay;
      try { window.localStorage.setItem(KEY, JSON.stringify(saved)); } catch (err) { /* storage closed: it is used now and not kept */ }
      close(); applyAll(saved);
      onStart();                                  // inside the click: the mouse may be captured again
    } else if (b.dataset.do === 'exit') { close(); applyAll(saved); panel.show('pause'); panel.go('options'); }
    else if (b.dataset.do === 'reset') { lay = {}; for (const it of items) place(it.el, null); sel = null; showValues(); }
  });
  window.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    e.stopImmediatePropagation();
    if (e.code === 'Escape') { e.preventDefault(); close(); applyAll(saved); panel.show('pause'); panel.go('options'); }
  }, true);

  const api = { open, close, get shown() { return !root.hidden; }, get saved() { return saved; }, key: KEY, movables, applyAll: () => applyAll(saved) };
  window.__GAME_LAYOUT = api;
  return api;
}
