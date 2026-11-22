// The status strip over the hotbar: ten hearts of health, ten portions of food, the armour worn, and the
// experience bar with the level. One look for the three worlds, tinted by each world's accent.
//
//   const status = createStatus({ play, mount, vitals: () => vitals, life: () => life, accent, hide: [oldHealthBar] });
//   onFrame -> status.update()
//
// Experience is play.state.xp (the controller adds to it when a block breaks, the creatures when one falls).

import { createFeats } from './feats.js';

const HEART = 'M8 14.2 2.3 8.6C.5 6.8.6 4 2.5 2.6 4.3 1.2 6.7 1.7 8 3.6 9.3 1.7 11.700 1.2 13.500 2.6c1.900 1.400 2 4.200.200 6z';
const FOOD = 'M9.6 1.800c2.700-.500 5 1.800 4.600 4.500-.400 2.400-2.800 3.900-5.200 3.300L6.400 12.200c.600 1.300-.900 2.600-2.100 1.700-.300-.200-.500-.500-.600-.900-.400-.100-.700-.300-.900-.600-.900-1.200.400-2.700 1.700-2.100L7.100 7.700C6.400 5.200 7.500 2.300 9.600 1.800z';
const SHIELD = 'M8 1.300 13.700 3.200v4.300c0 3.400-2.300 6-5.700 7.200-3.400-1.200-5.700-3.800-5.700-7.200V3.200z';

const CSS = `
#statusStrip { position: relative; box-sizing: border-box; width: max(100%, 362px); display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 3px 8px; direction: rtl; pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .75)); }
#statusStrip .row { display: flex; gap: 1px; }
#statusStrip .hearts { justify-self: start; direction: rtl; }
#statusStrip .food { justify-self: end; direction: ltr; }
#statusStrip .cell { position: relative; width: 15px; height: 15px; }
#statusStrip svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
#statusStrip .bg path { fill: rgba(8, 10, 14, .72); stroke: rgba(255, 255, 255, .34); stroke-width: 1; }
#statusStrip .fg { clip-path: inset(0 0 0 100%); }
#statusStrip .food .fg { clip-path: inset(0 100% 0 0); }
#statusStrip .cell.half .fg { clip-path: inset(0 0 0 50%); }
#statusStrip .food .cell.half .fg { clip-path: inset(0 50% 0 0); }
#statusStrip .cell.full .fg { clip-path: none; }
#statusStrip .hearts .fg path { fill: #e23b32; stroke: #ffb3a8; stroke-width: .7; }
#statusStrip .food .fg path { fill: #d99a4e; stroke: #ffe1b0; stroke-width: .7; }
#statusStrip.low .hearts .cell { animation: stBeat .7s infinite; }
@keyframes stBeat { 0%, 100% { transform: none; } 40% { transform: scale(1.22); } }
#statusStrip .lvl { min-width: 22px; text-align: center; font: 700 14px/1 system-ui, sans-serif; color: var(--st-accent, #9be36a); direction: ltr; }
#statusStrip .armor { grid-column: 1 / -1; justify-self: start; display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; color: #bfeaff; }
#statusStrip .armor[hidden] { display: none; }
#statusStrip .armor svg { position: static; width: 14px; height: 14px; }
#statusStrip .armor path { fill: #57c8ee; stroke: #dff6ff; stroke-width: .8; }
#statusStrip .xp { grid-column: 1 / -1; height: 5px; border-radius: 3px; background: rgba(8, 10, 14, .72); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .26); overflow: hidden; direction: rtl; }
#statusStrip .xp i { display: block; height: 100%; width: 0; background: var(--st-accent, #9be36a); transition: width .25s; }
@media (max-height: 500px), (pointer: coarse) { #statusStrip { width: max(100%, 278px); gap: 2px 6px; } #statusStrip .cell { width: 11px; height: 11px; } #statusStrip .lvl { font-size: 12px; } #statusStrip .xp { height: 4px; } #statusStrip .armor { font-size: 10px; } }
`;

/** Points needed to go from level n to n + 1. */
export const xpFor = (n) => 10 + n * 6;
export function levelOf(xp) { let n = 0; while (xp >= xpFor(n)) { xp -= xpFor(n); n++; } return { level: n, into: xp, need: xpFor(n) }; }

/** The share of every blow that the worn clothing takes away. */
export const protection = (st) => ['head', 'chest', 'legs', 'feet'].reduce((s, k) => s + ((st.gear && st.gear[k] && st.gear[k].prot) || 0), 0);

export function createStatus(o) {
  const { play } = o, st = play.state;
  const css = document.createElement('style');
  css.textContent = CSS;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'statusStrip';
  if (o.accent) el.style.setProperty('--st-accent', o.accent);
  const cell = (d) => `<span class="cell"><svg class="bg" viewBox="0 0 16 16"><path d="${d}"/></svg><svg class="fg" viewBox="0 0 16 16"><path d="${d}"/></svg></span>`;
  el.innerHTML = `<div class="armor" hidden><svg viewBox="0 0 16 16"><path d="${SHIELD}"/></svg><span></span></div>
    <div class="row hearts" aria-label="الصحة">${cell(HEART).repeat(10)}</div><div class="lvl">0</div><div class="row food" aria-label="الأكل">${cell(FOOD).repeat(10)}</div>
    <div class="xp"><i></i></div>`;
  o.mount.insertBefore(el, o.mount.firstChild);
  for (const h of o.hide || []) if (h) h.style.display = 'none';
  const hearts = [...el.querySelectorAll('.hearts .cell')], food = [...el.querySelectorAll('.food .cell')];
  const lvl = el.querySelector('.lvl'), xpFill = el.querySelector('.xp i'), armorEl = el.querySelector('.armor'), armorTxt = armorEl.querySelector('span');
  const feats = createFeats({ play });
  const paint = (cells, val) => { const halves = Math.ceil(Math.max(0, Math.min(100, val)) / 5); cells.forEach((c, i) => { c.classList.toggle('full', halves >= i * 2 + 2); c.classList.toggle('half', halves === i * 2 + 1); }); };
  let shown = '', level = 0;
  function update() {
    feats.check();
    const v = o.vitals && o.vitals();
    const hp = v ? v.values.hp : 100, fd = v && v.values.food != null ? v.values.food : 100, xp = st.xp || 0;
    const worn = ['head', 'chest', 'legs', 'feet'].filter((k) => st.gear && st.gear[k]), ar = worn.length ? worn.length + ':' + Math.round(protection(st) * 100) : 0;
    const key = Math.ceil(hp / 5) + '|' + Math.ceil(fd / 5) + '|' + xp + '|' + ar;
    if (key === shown) return;
    shown = key;
    paint(hearts, hp); paint(food, fd);
    el.classList.toggle('low', hp <= 25);
    armorEl.hidden = !ar;
    if (ar) armorTxt.textContent = 'درع ' + worn.length + '/4 · يصدّ ' + Math.round(protection(st) * 100) + '%';
    const q = levelOf(xp);
    lvl.textContent = String(q.level);
    xpFill.style.width = (q.into / q.need * 100).toFixed(1) + '%';
    if (q.level > level) { if (level || xp) { play.notice('وصلت المستوى ' + q.level + '.', false, 2600); if (play.sound && play.sound.level) play.sound.level(); } level = q.level; }
  }
  update();
  return { el, update, feats, get level() { return level; } };
}
