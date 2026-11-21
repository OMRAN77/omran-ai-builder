// HUD and name tags: plain HTML/CSS over the canvas, all text Arabic (RTL), icons drawn as inline SVG.
import * as THREE from 'three';
import { kitIcon, isKit } from '../../shared/kit.js';

const svg = (inner, vb = '0 0 48 48') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

// shared paint for the item illustrations
const DEFS = `<svg class="defs" aria-hidden="true"><defs>
  <linearGradient id="wg-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ece7d9"/><stop offset=".55" stop-color="#aaa69b"/><stop offset="1" stop-color="#6c6963"/></linearGradient>
  <linearGradient id="wg-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d8a2"/><stop offset="1" stop-color="#c48f55"/></linearGradient>
  <linearGradient id="wg-brick" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcbb8c"/><stop offset="1" stop-color="#b98d5b"/></linearGradient>
  <linearGradient id="wg-bark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a07a4c"/><stop offset="1" stop-color="#553820"/></linearGradient>
  <linearGradient id="wg-rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bb845a"/><stop offset="1" stop-color="#8a5a3b"/></linearGradient>
</defs></svg>`;

const ICON = {
  // a mattock: broad adze blade, short poll, bound haft
  mattock: svg(`
    <line x1="12" y1="43" x2="31.5" y2="13" stroke="#472d17" stroke-width="6.4" stroke-linecap="round"/>
    <line x1="12" y1="43" x2="31.5" y2="13" stroke="#a67c4c" stroke-width="3.8" stroke-linecap="round"/>
    <path d="M12.6 38.6 l4.4 2.8 M14.8 35.2 l4.4 2.8" stroke="#33200f" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M33.5 7.6 L40.5 11.6 L37.6 17.2 L30.6 15.6 Z" fill="#8f8a80" stroke="#2f2d2b" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M35 8.2 Q21 3.6 8.2 12 L5.8 23 Q17.5 15.8 30.2 17.8 Z" fill="url(#wg-steel)" stroke="#2f2d2b" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M8.2 12.4 L6 22.4" stroke="#fffaf0" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M12 12.4 Q21 7.6 31 9" fill="none" stroke="#fff8e6" stroke-width="1.1" stroke-linecap="round" opacity=".75"/>`),
  spade: svg(`
    <line x1="35" y1="8" x2="20" y2="29" stroke="#5c3d22" stroke-width="6" stroke-linecap="round"/>
    <line x1="35" y1="8" x2="20" y2="29" stroke="#a67c4c" stroke-width="3.6" stroke-linecap="round"/>
    <line x1="31" y1="5.5" x2="39.5" y2="11" stroke="#5c3d22" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M13 24 L25.5 33 Q22 43 9.5 43.5 Q5.5 33.5 13 24 Z" fill="url(#wg-steel)" stroke="#3b3a3a" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12.5 28 Q9 35 11.5 40.5" fill="none" stroke="#fff8e6" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>`),
  // a heap of loose sand
  sand: svg(`
    <path d="M3 38.5 Q10 30 17 23.5 Q22 18.5 26 18 Q31 18 36 25 Q41 31.5 45.5 38.5 Q25 44 3 38.5 Z" fill="url(#wg-sand)" stroke="#7a5630" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M26 18 Q31 18 36 25 Q41 31.5 45.5 38.5 Q33 41.6 17 40.6 Q22.5 34.5 24.5 28 Q26 23 26 18 Z" fill="#a9763f" opacity=".5"/>
    <path d="M8.5 35.6 q3 -1.6 6 0 M12 31.6 q2.6 -1.4 5.2 0 M16 27.6 q2 -1.2 4 0" stroke="#fff3d0" stroke-width="1.1" fill="none" opacity=".8" stroke-linecap="round"/>
    <circle cx="40.5" cy="42.6" r="1.3" fill="#e2bb7c"/><circle cx="6.5" cy="42.4" r="1.1" fill="#e2bb7c"/><circle cx="44.5" cy="41" r=".9" fill="#e2bb7c"/>`),
  // two rough-hewn slabs of bedded sandstone
  stone: svg(`
    <path d="M4 31 L20 25.5 L44 30 L43 37.5 L22 43.5 L5 38 Z" fill="url(#wg-rock)" stroke="#4e3020" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M4 31 L20 25.5 L44 30 L22 35.5 Z" fill="#d2a97e"/>
    <path d="M22 35.5 L44 30 L43 37.5 L22 43.5 Z" fill="#784c33" opacity=".9"/>
    <path d="M5 34.8 L22 39.8 L43.4 34" fill="none" stroke="#e7c79c" stroke-width="1" opacity=".6"/>
    <path d="M10 20 L24 14.5 L39 19 L38.4 26 L23 31 L10.6 26.6 Z" fill="url(#wg-rock)" stroke="#4e3020" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M10 20 L24 14.5 L39 19 L23 24 Z" fill="#dcb88c"/>
    <path d="M23 24 L39 19 L38.4 26 L23 31 Z" fill="#784c33" opacity=".9"/>
    <path d="M10.4 23.4 L23 27.6 L38.6 22.6" fill="none" stroke="#5c3a26" stroke-width="1.2"/>`),
  // a pair of sun-dried mud bricks, one laid across the other
  brick: svg(`
    <path d="M4 29 L24 23 L44 29 L44 36.5 L24 42.5 L4 36.5 Z" fill="url(#wg-brick)" stroke="#6a4a2a" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M4 29 L24 23 L44 29 L24 35 Z" fill="#ecd2a6"/>
    <path d="M24 35 L44 29 L44 36.5 L24 42.5 Z" fill="#a37a4b"/>
    <path d="M11 17.5 L27 12 L39 16.5 L39 23.5 L23 29 L11 24.5 Z" fill="url(#wg-brick)" stroke="#6a4a2a" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M11 17.5 L27 12 L39 16.5 L23 22 Z" fill="#f0d8ae"/>
    <path d="M23 22 L39 16.5 L39 23.5 L23 29 Z" fill="#a37a4b"/>
    <path d="M14 20.8 l3 1 M16.5 25.2 l2.6 .9 M8 32.4 l3 1 M13 37.4 l3 .9 M30 38.4 l3 -1 M29.5 24.8 l3 -1.1 M35 33.6 l3 -1" stroke="#7d5a34" stroke-width="1" stroke-linecap="round"/>`),
  // a section of palm trunk
  wood: svg(`
    <path d="M15 17.5 L35 8.5 A7 9.6 0 0 1 35.6 27.6 L15.5 37.5 Z" fill="url(#wg-bark)" stroke="#3a2412" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M20 17.5 l4 5 M26 14.8 l4 5 M32 12.2 l4 5 M19.5 26 l4 5 M25.5 23 l4 5 M31.5 20.2 l4 5 M23 13.6 l-3 4 M29 10.9 l-3 4" stroke="#2c1b0f" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>
    <ellipse cx="15" cy="27.5" rx="7.2" ry="10" fill="#d0aa72" stroke="#3a2412" stroke-width="1.4"/>
    <ellipse cx="15" cy="27.5" rx="4.4" ry="6.3" fill="none" stroke="#9a7444" stroke-width="1.2"/>
    <ellipse cx="15" cy="27.5" rx="1.7" ry="2.5" fill="#8a643a"/>`),
  lantern: svg(`
    <path d="M19 8 Q24 2 29 8" fill="none" stroke="#c9a35a" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M16 13 L24 8 L32 13 Z" fill="#c9a35a" stroke="#5b4320" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="15.5" y="13" width="17" height="24" rx="2" fill="#3a2a17" stroke="#c9a35a" stroke-width="2"/>
    <path d="M24 17 Q30.5 25 24 34 Q17.5 25 24 17 Z" fill="#ffb347"/>
    <path d="M24 22 Q27 27 24 32.5 Q21 27 24 22 Z" fill="#fff0b8"/>
    <rect x="13.5" y="37" width="21" height="4.5" rx="1.5" fill="#c9a35a" stroke="#5b4320" stroke-width="1.2"/>`),
  dates: svg(`
    <path d="M24 5 Q25 12 20 17 M24 5 Q26 13 30 17" fill="none" stroke="#8c8a4a" stroke-width="2.2" stroke-linecap="round"/>
    <g stroke="#3d2110" stroke-width="1.2">
      <ellipse cx="17" cy="21" rx="5" ry="7" fill="#a5562a" transform="rotate(18 17 21)"/>
      <ellipse cx="29.5" cy="21" rx="5" ry="7" fill="#b8642c" transform="rotate(-16 29.5 21)"/>
      <ellipse cx="23.5" cy="27" rx="5" ry="7.2" fill="#c97a34"/>
      <ellipse cx="15" cy="33" rx="4.8" ry="6.8" fill="#8f4622" transform="rotate(14 15 33)"/>
      <ellipse cx="31.5" cy="33.5" rx="4.8" ry="6.8" fill="#a5562a" transform="rotate(-12 31.5 33.5)"/>
      <ellipse cx="23.5" cy="38" rx="4.6" ry="6" fill="#b8642c"/>
    </g>
    <path d="M21.5 23 q1 -2 3 -1.5" fill="none" stroke="#f3c98c" stroke-width="1.2" stroke-linecap="round"/>`),
  skin: svg(`
    <path d="M20 9 H28 V14 Q39 20 37 33 Q35 43 24 43 Q13 43 11 33 Q9 20 20 14 Z" fill="#7a5233" stroke="#3a2412" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="18.5" y="5" width="11" height="5.5" rx="1.5" fill="#c9a35a" stroke="#5b4320" stroke-width="1.2"/>
    <path d="M14.5 30 Q15 37.5 22 40" fill="none" stroke="#b58656" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M24 22 Q29.5 29.5 24 34 Q18.5 29.5 24 22 Z" fill="#6fd0cf" stroke="#1f6a70" stroke-width="1.1"/>`),
  // stats
  health: svg(`<path d="M12 3 L20 12 L12 21 L4 12 Z" fill="#c9483a" stroke="#f3d9a4" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 3 L12 21 M4 12 L20 12" stroke="#ffb199" stroke-width=".9" opacity=".7"/>`, '0 0 24 24'),
  water: svg(`<path d="M12 2.5 Q19.5 12 18.6 15.5 A6.7 6.7 0 0 1 5.4 15.5 Q4.5 12 12 2.5 Z" fill="#3fb0b3" stroke="#f3d9a4" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.4 14.5 Q8.6 18 11.5 19" fill="none" stroke="#d6fbf6" stroke-width="1.2" stroke-linecap="round"/>`, '0 0 24 24'),
  // touch
  jump: svg(`<path d="M10 27 L24 13 L38 27 M10 38 L24 24 L38 38" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  place: svg(`
    <polygon points="22,10 37,17.5 22,25 7,17.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M7 17.5 V32 L22 39.5 V25 M37 17.5 V24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M36 28 V42 M29 35 H43" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>`),
  bag: svg(`<path d="M9 19 H39 L36 41 H12 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M17 19 V14 Q17 8 24 8 Q31 8 31 14 V19" fill="none" stroke="currentColor" stroke-width="3"/><path d="M20 27 H28" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
  pause: svg(`<path d="M17 12 V36 M31 12 V36" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/>`),
  look: svg(`<path d="M6 24 H42 M6 24 L13 17 M6 24 L13 31 M42 24 L35 17 M42 24 L35 31" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="24" r="5" fill="currentColor"/>`),
  star: svg(`<path d="M12 1.5 L14.7 6.2 L20 5 L18.8 10.3 L23.5 13 L18.8 15.7 L20 21 L14.7 19.8 L12 24.5 L9.3 19.8 L4 21 L5.2 15.7 L0.5 13 L5.2 10.3 L4 5 L9.3 6.2 Z" fill="currentColor"/>`, '0 0 24 26'),
};

const TOOLS = [
  { id: 'mattock', name: 'معول', n: '' },
  { id: 'spade', name: 'مجرفة', n: '' },
];
const MATS = [
  { id: 'sand', name: 'رمل', n: 86 },
  { id: 'stone', name: 'حجر رملي', n: 37 },
  { id: 'brick', name: 'طوب طين', n: 48 },
  { id: 'wood', name: 'جذع نخل', n: 12 },
  { id: 'lantern', name: 'فانوس', n: 3 },
];
const FOOD = [
  { id: 'dates', name: 'تمر', n: 9 },
  { id: 'skin', name: 'قربة ماء', n: '' },
];

/** The starting belt, in key order: two tools, five materials, two provisions. `id` (the block a slot
 *  places) is filled in by the world. `tool` means "carried, not placed": the bag draws such an item
 *  without asking for a block, so the provisions carry it too; `food` tells them from the digging tools. */
export const SLOTS = [
  ...TOOLS.map((b) => ({ key: b.id, name: b.name, tool: true })),
  ...MATS.map((b) => ({ key: b.id, name: b.name, n: b.n })),
  ...FOOD.map((b) => ({ key: b.id, name: b.name, tool: true, food: true, ...(b.n === '' ? {} : { n: b.n }) })),
];
const BELT = TOOLS.length + MATS.length;          // squares on the strap; the rest ride in the pouch
const isTool = (s) => !!s && s.tool === true && !s.food;
/** Picture of whatever a square holds: this world's own drawings, or the building kit's. */
const iconOf = (s) => (!s ? '' : s.kit || isKit(s.id) ? kitIcon(s.id) : ICON[s.key] || '');

const seg = (n, filled) => Array.from({ length: n }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');

/** heading: degrees clockwise from north. */
function compassStrip(heading) {
  const names = { 0: 'شمال', 90: 'شرق', 180: 'جنوب', 270: 'غرب' };
  let out = '';
  for (let d = 0; d < 360; d += 15) {
    let rel = ((d - heading + 540) % 360) - 180;       // -180..180, 0 = straight ahead
    if (Math.abs(rel) > 70) continue;
    const x = 50 + rel / 70 * 50;                       // percent across the strip
    const fade = 1 - Math.pow(Math.abs(rel) / 70, 2.2);
    if (names[d] !== undefined) out += `<span class="c-name" style="left:${x}%;opacity:${fade.toFixed(2)}">${names[d]}</span>`;
    else out += `<span class="c-tick${d % 45 === 0 ? ' mid' : ''}" style="left:${x}%;opacity:${(fade * 0.9).toFixed(2)}"></span>`;
  }
  return out;
}

export function buildHud(root) {
  const touch = matchMedia('(pointer: coarse)').matches || innerHeight < 480;
  root.classList.toggle('touch', touch);
  // Every square is the same empty niche; setSlots fills it with whatever the game put there.
  const square = (i, cls) => `<div class="${cls}" data-i="${i}"><span class="s-ico"></span><span class="s-n"></span>${touch ? '' : `<span class="s-key">${i + 1}</span>`}</div>`;
  root.innerHTML = `${DEFS}
    <div class="vitals plate">
      <div class="vital hp"><span class="v-ico">${ICON.health}</span><span class="v-lbl">الصحة</span><span class="v-bar">${seg(10, 8)}</span><span class="v-num">82</span></div>
      <div class="vital wt"><span class="v-ico">${ICON.water}</span><span class="v-lbl">الماء</span><span class="v-bar">${seg(10, 6)}</span><span class="v-num">57</span></div>
    </div>
    <div class="compass"><div class="c-strip" id="cstrip"></div><span class="c-mark"></span></div>
    <div class="day plate">
      <svg class="d-dial" viewBox="0 0 60 38" aria-hidden="true">
        <path d="M5 34 A25 25 0 0 1 55 34" fill="none" stroke="rgba(233,207,142,.28)" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M5 34 A25 25 0 0 1 47.7 16.3" fill="none" stroke="#e9cf8e" stroke-width="2.4" stroke-linecap="round"/>
        <line x1="2" y1="34" x2="58" y2="34" stroke="rgba(233,207,142,.5)" stroke-width="1"/>
        <circle cx="47.7" cy="16.3" r="5.2" fill="#ffcf6b" stroke="#7a5a2a" stroke-width="1"/>
        <g stroke="#ffcf6b" stroke-width="1.3" stroke-linecap="round"><path d="M47.7 8.3 V6 M55.7 16.3 H58 M53.4 10.6 L55 9 M42 10.6 L40.4 9"/></g>
      </svg>
      <div class="d-txt"><b>اليوم 12</b><span>العصر · 4:40</span></div>
    </div>
    <div class="crosshair"><i></i><i></i><i></i><i></i><b></b></div>
    <div class="aim" hidden><span class="aim-name"></span><span class="aim-bar"><i></i><i></i><i></i><i></i><i></i></span></div>
    <div class="belt-wrap">
      <div class="belt-name"><span class="orn">${ICON.star}</span><span class="belt-txt">${TOOLS[0].name}</span><span class="orn">${ICON.star}</span></div>
      <div class="belt-row">
        <div class="belt">
          ${SLOTS.slice(0, BELT).map((b, i) => square(i, 'slot')).join('')}
          <div class="belt-div"><i></i>${ICON.star}<i></i></div>
        </div>
        <div class="pouch">${SLOTS.slice(BELT).map((b, i) => square(BELT + i, 'pslot')).join('')}</div>
      </div>
    </div>
    <div class="t-top">
      <button class="t-mini" data-act="bag" aria-label="الحقيبة">${ICON.bag}</button>
      <button class="t-mini" data-act="pause" aria-label="إيقاف">${ICON.pause}</button>
    </div>
    <div class="t-stick" data-act="stick"><span class="t-knob"></span><i></i><i></i><i></i><i></i></div>
    <div class="t-look">${ICON.look}<span>اسحب للنظر</span></div>
    <div class="t-btns">
      <button class="t-btn jump" data-act="jump">${ICON.jump}<span>قفز</span></button>
      <button class="t-btn place" data-act="place">${ICON.place}<span>بناء</span></button>
      <button class="t-btn dig" data-act="dig">${ICON.mattock}<span>حفر</span></button>
    </div>`;
  const q = (sel) => root.querySelector(sel);
  const cstrip = q('#cstrip'), beltTxt = q('.belt-txt'), aim = q('.aim'), aimName = q('.aim-name'), pips = [...root.querySelectorAll('.aim-bar i')];
  const cells = [...root.querySelectorAll('[data-i]')], belt = q('.belt'), divider = q('.belt-div');
  const pics = cells.map((el) => el.querySelector('.s-ico')), counts = cells.map((el) => el.querySelector('.s-n'));
  const held = cells.map(() => null);             // what each square shows now, so a square is redrawn only when its item changes
  // on phones the pouch is put away, so only the belt itself can be selected (the bag holds everything else)
  const shown = touch ? BELT : cells.length;
  let headKey = -1, pipN = -1, aimText = null, divAt = -1;
  /** Show the game's belt: any item in any square, counts, the selected square and its name. */
  function setSlots(list, sel) {
    for (let i = 0; i < cells.length; i++) {
      const el = cells[i], s = list[i];
      el.classList.toggle('sel', i === sel);
      if (!s) continue;
      const sig = s.kit || isKit(s.id) ? 'kit' + s.id : s.key || '';
      if (held[i] !== sig) { held[i] = sig; pics[i].innerHTML = iconOf(s); }
      const n = s.n === undefined ? '' : String(s.n);
      if (counts[i].textContent !== n) counts[i].textContent = n;
      el.classList.toggle('empty', s.n === 0);
    }
    // The engraved divider stands between the digging tools and the things to put down, wherever that
    // line falls now; when the two are mixed, or the strap holds only one kind, there is no line to draw.
    let k = 0;
    while (k < BELT && isTool(list[k])) k++;
    let at = k > 0 && k < BELT ? k : 0;
    for (let i = k; i < BELT; i++) if (isTool(list[i])) at = 0;
    if (at !== divAt) {
      divAt = at;
      divider.hidden = !at;
      if (at) belt.insertBefore(divider, cells[at]);
    }
    beltTxt.textContent = list[sel] ? list[sel].name : '';
  }
  setSlots(SLOTS, 0);
  return {
    touch, shown, setSlots,
    /** Picture of an item of this HUD or of the building kit (the bag draws them too). */
    icon: iconOf,
    els: { stick: q('[data-act="stick"]'), knob: q('.t-knob'), jump: q('[data-act="jump"]'), dig: q('[data-act="dig"]'), place: q('[data-act="place"]'),
      pause: q('[data-act="pause"]'), bag: q('[data-act="bag"]'), look: q('.t-look'), belt: q('.belt-row') },
    /** heading: degrees clockwise from north. */
    setHeading(deg) {
      if (deg === headKey) return;
      headKey = deg;
      cstrip.innerHTML = compassStrip(deg);
    },
    /** Name of the block under the crosshair, or null for none. */
    setTarget(name) {
      if (name === aimText) return;
      aimText = name;
      aim.hidden = !name;
      if (name) aimName.textContent = name;
    },
    /** Dig progress 0..1 on the pips under the name. */
    setProgress(p) {
      const n = Math.round(p * pips.length);
      if (n === pipN) return;
      pipN = n;
      pips.forEach((el, i) => el.classList.toggle('on', i < n));
    },
  };
}

// ---------- name tags that follow projected 3D anchors ----------
export function createTags(root, camera) {
  const list = [];
  const v = new THREE.Vector3();
  function clear() { root.innerHTML = ''; list.length = 0; }
  function add(object, name, role, kind) {
    const el = document.createElement('div');
    el.className = 'tag ' + kind;
    el.innerHTML = `<div class="tag-plate"><b>${name}</b><span><i></i>${role}</span></div><div class="tag-stem"></div>`;
    root.appendChild(el);
    list.push({ el, object });
  }
  function update() {
    const w = innerWidth, h = innerHeight;
    camera.updateMatrixWorld(true);
    for (const t of list) {
      t.object.updateMatrixWorld(true);
      v.copy(t.object.userData.tag).applyMatrix4(t.object.matrixWorld).project(camera);
      const visible = v.z < 1 && t.object.visible;
      t.el.style.display = visible ? '' : 'none';
      t.el.style.left = ((v.x * 0.5 + 0.5) * w).toFixed(1) + 'px';
      t.el.style.top = ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
    }
  }
  return { add, update, clear };
}
