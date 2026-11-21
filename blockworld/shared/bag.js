// The bag (key E): everything the player can carry, and which hotbar square each thing sits in.
// Pick a square at the bottom, then pick an item: it lands in that square. Arabic, built in HTML,
// works with a mouse and with a finger.
//
//   const bag = createBag({ play, groups, iconOf, shown, fontFamily, accent, line, extra: { label, onClick } });
//   createPlay({ onBag: () => bag.toggle(), ... })
//
// groups: [{ title, items: [{ id | tool, name, n, ... }] }]   an item is copied into the slot as it is
// iconOf(item): HTML for the item's icon (the world's own icons for its own items, kitIcon for kit blocks)

const CSS = `
#bag { position: fixed; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center; direction: rtl; color: #f1f4f8;
  background: rgba(3, 6, 10, .62); -webkit-user-select: none; user-select: none; touch-action: manipulation; }
#bag[hidden] { display: none; }
#bag .box { box-sizing: border-box; display: flex; flex-direction: column; width: min(760px, calc(100vw - 20px)); max-height: calc(100vh - 16px);
  border-radius: 14px; background: rgba(10, 14, 20, .93); border: 1px solid var(--bg-line, rgba(255, 255, 255, .24)); box-shadow: 0 18px 60px rgba(0, 0, 0, .55); overflow: hidden; }
#bag header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid rgba(255, 255, 255, .1); }
#bag h2 { margin: 0; font-size: 20px; font-weight: 700; color: var(--bg-accent, #fff); }
#bag header p { margin: 0; flex: 1; font-size: 13px; line-height: 1.5; opacity: .75; }
#bag .x, #bag .extra { font: inherit; font-size: 14px; font-weight: 700; min-width: 44px; min-height: 40px; padding: 4px 14px; border-radius: 9px; border: 1px solid var(--bg-line, rgba(255, 255, 255, .3)); background: none; color: inherit; cursor: pointer; }
#bag .list { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 6px 14px 10px; -webkit-overflow-scrolling: touch; }
#bag h3 { margin: 10px 2px 6px; font-size: 13.5px; font-weight: 700; opacity: .8; }
#bag .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 6px; }
#bag .it, #bag .sq { position: relative; box-sizing: border-box; font: inherit; color: inherit; cursor: pointer; border-radius: 10px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .12); }
#bag .it { display: flex; flex-direction: column; align-items: center; gap: 3px; min-height: 68px; padding: 7px 3px 5px; }
#bag .it:hover, #bag .it:focus-visible { background: rgba(255, 255, 255, .12); outline: none; border-color: var(--bg-accent, #fff); }
#bag .it .pic, #bag .sq .pic { position: relative; display: block; width: 34px; height: 34px; flex: none; }
#bag .pic > * { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; margin: 0 !important; transform: none !important; }
#bag .it span { font-size: 11px; line-height: 1.25; text-align: center; opacity: .88; }
#bag footer { padding: 8px 14px 12px; border-top: 1px solid rgba(255, 255, 255, .1); background: rgba(0, 0, 0, .25); }
#bag footer p { margin: 0 0 6px; font-size: 12.5px; opacity: .75; }
#bag .bar { display: flex; gap: 6px; justify-content: center; direction: rtl; }
#bag .sq { display: flex; align-items: center; justify-content: center; width: 54px; height: 54px; flex: none; }
#bag .sq.on { border: 2px solid var(--bg-accent, #fff); background: rgba(255, 255, 255, .14); }
#bag .sq b { position: absolute; top: 1px; right: 5px; font-size: 10px; font-weight: 500; opacity: .6; }
#bag .sq i { position: absolute; bottom: 1px; left: 5px; font-style: normal; font-size: 11px; font-weight: 700; }
@media (max-height: 430px) { #bag header { padding: 5px 12px; } #bag h2 { font-size: 16px; } #bag header p { font-size: 11.5px; } #bag .list { padding: 2px 10px 6px; } #bag h3 { margin: 6px 2px 4px; font-size: 12px; }
  #bag .it { min-height: 56px; padding: 4px 2px 3px; } #bag .it .pic { width: 28px; height: 28px; } #bag .it span { font-size: 10px; } #bag footer { padding: 5px 10px 7px; } #bag footer p { display: none; } #bag .sq { width: 46px; height: 46px; } #bag .sq .pic { width: 28px; height: 28px; } }
`;

export function createBag(o) {
  const { play } = o;
  const css = document.createElement('style');
  css.textContent = CSS;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'bag'; el.hidden = true;
  el.style.fontFamily = o.fontFamily || 'sans-serif';
  if (o.accent) el.style.setProperty('--bg-accent', o.accent);
  if (o.line) el.style.setProperty('--bg-line', o.line);
  el.innerHTML = '<div class="box" role="dialog" aria-label="الحقيبة"><header><h2>الحقيبة</h2><p>اختر مربعًا من تحت، ثم اختر الغرض اللي تبيه فيه.</p>' + (o.extra ? '<button type="button" class="extra"></button>' : '') + '<button type="button" class="x">إغلاق</button></header><div class="list"></div><footer><p>مربعاتك</p><div class="bar"></div></footer></div>';
  document.body.appendChild(el);
  const list = el.querySelector('.list'), bar = el.querySelector('.bar');
  if (o.extra) el.querySelector('.extra').textContent = o.extra.label;
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
  const shown = () => Math.min(o.shown || 9, play.state.slots.length);
  function drawBar() {
    const st = play.state;
    bar.innerHTML = st.slots.slice(0, shown()).map((s, i) => `<button type="button" class="sq${i === st.sel ? ' on' : ''}" data-sq="${i}"><b>${i + 1}</b><span class="pic">${s ? o.iconOf(s) || '' : ''}</span>${s && !s.tool && s.n != null ? `<i>${s.n}</i>` : ''}</button>`).join('');
  }
  let open = false, openedAt = 0;
  function show(v) {
    if (v === open || (v && play.state.modal)) return;      // one panel at a time
    open = v; el.hidden = !v;
    if (v) openedAt = performance.now();
    play.setModal(v);
    if (v) drawBar();
    if (o.onToggle) o.onToggle(v);
  }
  el.addEventListener('click', (e) => {
    if (performance.now() - openedAt < 350) return;          // the tap that opened the bag must not also pick what appears under the finger
    const sq = e.target.closest('[data-sq]'), it = e.target.closest('[data-item]');
    if (sq) { play.select(+sq.dataset.sq); drawBar(); }
    else if (it) { play.setSlot(play.state.sel, { ...items[+it.dataset.item] }); drawBar(); }
    else if (o.extra && e.target.closest('.extra')) { show(false); o.extra.onClick(); }
    else if (e.target.closest('.x') || e.target === el) show(false);
  });
  window.addEventListener('keydown', (e) => { if (open && e.code === 'Escape') { show(false); e.preventDefault(); } });
  return { el, open: () => show(true), close: () => show(false), toggle: () => show(!open), isOpen: () => open, items };
}
