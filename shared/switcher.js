// Quick world switcher: two buttons in the top corner while playing («تبديل العالم» and «الإعدادات»), and a window that
// pauses the game, says which world this is, and offers the other four with their pictures. «انتقل الآن» saves this world
// and opens the other one straight away (its start panel, not the first page); «استكمال اللعب» goes back to the game.
// Only when the world was opened from the first page (window.__GAME.key), since that page is what loads another world.

export const WORLDS = [
  { key: 'dhalam', name: 'عالم الظلام', badge: '👻', about: 'مرتفعات باردة وغابة صنوبر وأطلال قلعة في الضباب.' },
  { key: 'dino', name: 'عالم الديناصورات', badge: '🦖', about: 'غابات حارّة ومستنقعات وبراكين، وديناصورات عملاقة.' },
  { key: 'barari', name: 'عالم البراري', badge: '⛰️', about: 'بر وغابة وثلج وبحر بلا نهاية، وكهوف فيها معادن.' },
  { key: 'waha', name: 'عالم الواحة', badge: '🌴', about: 'صحراء الجزيرة وقت الغروب، وواحة نخيل وحصن طين.' },
  { key: 'kawkab', name: 'عالم الكوكب', badge: '🌍', about: 'كوكب غريب بنباتات مضيئة، ويرافقك المسّاح الآلي.' },
];

const ICON = {
  cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 21 7.2v9.6L12 21.5 3 16.8V7.2z M3 7.2l9 4.7 9-4.7 M12 11.9v9.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.3 2.8h3.4l.5 2.6 1.6.9 2.5-.9 1.7 2.9-2 1.7v1.9l2 1.7-1.7 2.9-2.5-.9-1.6.9-.5 2.6h-3.4l-.5-2.6-1.6-.9-2.5.9-1.7-2.9 2-1.7V11l-2-1.7 1.7-2.9 2.5.9 1.6-.9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
};

const CSS = `
#bwCorner { position: fixed; top: max(10px, env(safe-area-inset-top)); right: max(10px, env(safe-area-inset-right)); z-index: 55; display: flex; gap: 8px; direction: rtl; }
#bwCorner[hidden], #bwSwitch[hidden] { display: none; }
#bwCorner button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; width: 66px; height: 62px; padding: 6px 4px 5px; font: inherit; font-size: 11.5px; font-weight: 700; line-height: 1.15;
  color: #eef2f7; background: rgba(28, 36, 48, .82); border: 1px solid rgba(255, 255, 255, .2); border-radius: 12px; box-shadow: 0 4px 14px rgba(0, 0, 0, .35); cursor: pointer; -webkit-tap-highlight-color: transparent; }
#bwCorner button:hover { background: rgba(40, 52, 68, .92); }
#bwCorner svg { width: 28px; height: 28px; }
#bwSwitch { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; padding: 12px; direction: rtl; color: #eef2f7;
  background: rgba(3, 6, 10, .55); -webkit-user-select: none; user-select: none; }
#bwSwitch .sw { box-sizing: border-box; width: min(860px, 100%); max-height: 100%; overflow: auto; overscroll-behavior: contain; padding: 22px 24px 20px; border-radius: 16px;
  background: rgba(14, 18, 25, .95); border: 1px solid rgba(255, 255, 255, .16); box-shadow: 0 22px 70px rgba(0, 0, 0, .6); text-align: center; }
#bwSwitch h2 { margin: 0; font-size: 30px; line-height: 1.25; font-weight: 800; }
#bwSwitch .now { margin: 6px 0 16px; font-size: 16px; opacity: .85; } #bwSwitch .now b { opacity: 1; font-weight: 800; }
#bwSwitch .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
#bwSwitch .card { display: flex; flex-direction: column; overflow: hidden; text-align: right; border-radius: 12px; background: #1a212c; border: 1px solid rgba(255, 255, 255, .12); }
#bwSwitch .pic { position: relative; aspect-ratio: 16 / 10; background: #0b0f15; }
#bwSwitch .pic img { display: block; width: 100%; height: 100%; object-fit: cover; }
#bwSwitch .badge { position: absolute; left: 8px; bottom: 8px; width: 30px; height: 30px; display: grid; place-items: center; font-size: 18px; border-radius: 8px; background: rgba(12, 16, 22, .82); border: 1px solid rgba(255, 255, 255, .25); }
#bwSwitch .card b { display: block; margin: 10px 12px 4px; font-size: 17px; font-weight: 800; }
#bwSwitch .card p { flex: 1; margin: 0 12px 10px; font-size: 12.5px; line-height: 1.55; opacity: .72; }
#bwSwitch .card button { margin: 0 12px 12px; min-height: 38px; font: inherit; font-size: 15px; font-weight: 800; color: #0d1a10; background: #9ee6a8; border: 0; border-radius: 9px; cursor: pointer; }
#bwSwitch .card button:hover { background: #b6f0be; }
#bwSwitch .row { display: flex; justify-content: center; gap: 14px; margin-top: 18px; }
#bwSwitch .row button { min-width: 230px; min-height: 46px; padding: 0 22px; font: inherit; font-size: 16px; font-weight: 800; border-radius: 10px; cursor: pointer; }
#bwSwitch .row .resume { color: #10151c; background: #f3f5f8; border: 0; }
#bwSwitch .row .home { color: #eef2f7; background: none; border: 1px solid rgba(255, 255, 255, .45); }
#bwSwitch .msg { min-height: 1em; margin: 8px 0 0; font-size: 12.5px; opacity: .75; }
@media (max-width: 720px) { #bwSwitch .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } #bwSwitch .row button { min-width: 0; flex: 1; } }
@media (max-height: 520px) { #bwSwitch .sw { padding: 10px 14px 10px; } #bwSwitch h2 { font-size: 20px; } #bwSwitch .now { margin: 2px 0 8px; font-size: 13px; }
  #bwSwitch .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; } #bwSwitch .pic { aspect-ratio: 16 / 8; } #bwSwitch .badge { width: 24px; height: 24px; font-size: 14px; left: 5px; bottom: 5px; }
  #bwSwitch .card b { margin: 6px 8px 2px; font-size: 13.5px; } #bwSwitch .card p { display: none; } #bwSwitch .card button { margin: 4px 8px 8px; min-height: 32px; font-size: 13px; }
  #bwSwitch .row { margin-top: 8px; } #bwSwitch .row button { min-height: 38px; font-size: 14px; min-width: 180px; } #bwSwitch .msg { margin-top: 4px; }
  #bwCorner button { width: 54px; height: 50px; font-size: 10px; } #bwCorner svg { width: 22px; height: 22px; } }
`;

/**
 * mountSwitcher({ panel, onStart, fontFamily })
 *   panel    the start / pause panel (show, hide, go)
 *   onStart  what the panel's play button does (captures the mouse or goes full screen, then starts the game)
 */
export function mountSwitcher({ panel, onStart, fontFamily }) {
  const G = window.__GAME;
  if (!G || !G.key || document.getElementById('bwCorner')) return null;
  const here = WORLDS.find((w) => w.key === G.key);
  const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
  const pic = (k) => new URL('../previews/' + k + '.webp', import.meta.url).href;

  const corner = document.createElement('div');
  corner.id = 'bwCorner';
  corner.innerHTML = `<button type="button" data-sw="open" aria-label="تبديل العالم">${ICON.cube}<span>تبديل العالم</span></button><button type="button" data-sw="options" aria-label="الإعدادات">${ICON.gear}<span>الإعدادات</span></button>`;
  const box = document.createElement('div');
  box.id = 'bwSwitch'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'الانتقال إلى عالم آخر');
  box.innerHTML = '<div class="sw"><h2>الانتقال إلى عالم آخر</h2>'
    + `<div class="now">أنت الآن في: <b>${here ? here.name : ''}</b></div><div class="grid">`
    + WORLDS.filter((w) => w.key !== G.key).map((w) => `<div class="card" data-k="${w.key}"><div class="pic"><img alt="" loading="lazy" data-pic="${w.key}"><span class="badge" aria-hidden="true">${w.badge}</span></div><b>${w.name}</b><p>${w.about}</p><button type="button" data-go="${w.key}">انتقل الآن</button></div>`).join('')
    + '</div><div class="row"><button type="button" class="resume" data-sw="resume">استكمال اللعب</button><button type="button" class="home" data-sw="home">العودة للقائمة الرئيسية</button></div><div class="msg"></div></div>';
  for (const el of [corner, box]) { if (fontFamily) el.style.fontFamily = fontFamily; document.body.appendChild(el); }
  const msg = box.querySelector('.msg');

  // each world has its own corner pieces (a clock, a pause button): sit just under whatever is already in the top-right corner
  function place() {
    const W = window.innerWidth, H = window.innerHeight, zone = { l: W - corner.offsetWidth - 24 };
    let low = 0;
    const look = (el, depth) => {
      for (const c of el.children) {
        if (c === corner || c === box || c.id === 'playPanel' || c.id === 'playRotate' || c.tagName === 'CANVAS' || c.tagName === 'SCRIPT' || c.tagName === 'STYLE') continue;
        const r = c.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const big = r.width * r.height > W * H * 0.2;
        // only a small piece fixed at the top edge (the clock): a passing hint or a message lower down does not count
        if (!big && r.right > zone.l && r.top < 48 && r.height < 110 && r.bottom > 0 && getComputedStyle(c).visibility !== 'hidden') low = Math.max(low, r.bottom);
        else if (big && depth < 4) look(c, depth + 1);
      }
    };
    look(document.body, 0);
    corner.style.top = low ? Math.min(H - corner.offsetHeight - 8, Math.round(low + 8)) + 'px' : '';
  }
  // over the start / pause panel the buttons stay only where they do not cover it (that panel has «تبديل العالم» too)
  function sync() {
    const play = window.__GAME_PLAY, playing = !!(play && play.state.running && !play.state.modal);
    const over = ['netPanel', 'bag', 'chatBox'].some((id) => { const e = document.getElementById(id); return e && !e.hidden; });
    const editing = !!(window.__GAME_LAYOUT && window.__GAME_LAYOUT.shown);      // «تخصيص أماكن الأزرار»: these two are placed too
    let hide = !editing && (!box.hidden || over || (panel.el.hidden && !playing));      // another window (the room panel, the bag) is up or has the game paused: keep out of its way
    if (!hide && !editing && !panel.el.hidden) {
      corner.hidden = false;
      const p = panel.el.querySelector('.box:not([hidden])'), a = p && p.getBoundingClientRect(), c = corner.getBoundingClientRect();
      hide = !!a && c.left < a.right && c.right > a.left && c.top < a.bottom && c.bottom > a.top;
    }
    corner.hidden = hide;
  }
  place(); sync(); setTimeout(() => { place(); sync(); }, 600);
  new MutationObserver(sync).observe(panel.el, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  window.addEventListener('resize', () => setTimeout(() => { place(); sync(); }, 120));
  // the windows that cover the game (the bag, the room panel, the chat) are made later than this: watch each once it is there,
  // so the buttons step aside the moment one opens (the interval below is only the fallback)
  const watched = new Set();
  const watch = () => { for (const id of ['netPanel', 'bag', 'chatBox']) { const e = document.getElementById(id); if (e && !watched.has(e)) { watched.add(e); new MutationObserver(sync).observe(e, { attributes: true, attributeFilter: ['hidden'] }); } } };
  watch();
  setInterval(() => { watch(); if (box.hidden) { place(); sync(); } }, 1000);

  // pause: stop the game first so that letting the mouse go does not open the pause panel on top of this window
  function pause() {
    const play = window.__GAME_PLAY;
    if (play) play.stop();
    try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* nothing was captured */ }
  }
  function save() { const s = window.__GAME_SAVE; try { return s ? s.save() : true; } catch (e) { return false; } }
  function open() {
    pause(); panel.hide();
    for (const im of box.querySelectorAll('img[data-pic]')) if (!im.src) im.src = pic(im.dataset.pic);
    msg.textContent = ''; corner.hidden = true; box.hidden = false;
    const first = box.querySelector('[data-go]'); if (first) first.focus({ preventScroll: true });
  }
  function close() { box.hidden = true; sync(); }
  function goTo(key) {
    msg.textContent = 'أحفظ عالمك وأفتح ' + (WORLDS.find((w) => w.key === key) || {}).name + '…';
    const ok = save();
    if (!ok) { const s = window.__GAME_SAVE; msg.textContent = (s && s.why) || 'ما قدرت أحفظ عالمك. جرّب مرة ثانية.'; return; }
    try { window.sessionStorage.removeItem('bw-join'); } catch (e) { /* no room to leave behind */ }
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + key); } catch (e) { window.location.hash = key; }
    window.location.reload();
  }

  corner.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sw]'); if (!b) return;
    if (b.dataset.sw === 'open') open();
    else if (b.dataset.sw === 'options') { pause(); close(); panel.show('pause'); panel.go('options'); }
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go) goTo(b.dataset.go);
    else if (b.dataset.sw === 'resume') { close(); onStart(); }          // inside the click: the mouse may be captured again
    else if (b.dataset.sw === 'home') { save(); if (G.onMenu) G.onMenu(); }
  });
  // Esc in the window: back to the pause panel (a key press may not capture the mouse, so it cannot resume the game)
  window.addEventListener('keydown', (e) => {
    if (box.hidden || e.code !== 'Escape') return;
    e.preventDefault(); e.stopImmediatePropagation();
    close(); panel.show('pause');
  }, true);
  const api = { open, close, get shown() { return !box.hidden; }, corner, box };
  window.__GAME_SWITCH = api;
  return api;
}
