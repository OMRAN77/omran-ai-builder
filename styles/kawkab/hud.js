import { kitIcon } from '../../shared/kit.js';

// Suit HUD for "kawkab": thin-line holographic overlay, all HTML/SVG over the canvas.
// Icons are drawn here as small inline SVGs (no emoji, no bitmap fonts).
const svg = (body, vb = '0 0 32 32', cls = '') => `<svg class="${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

const ICON = {
  // tools / blocks
  drill: '<path d="M4 12.5h13.5l5 3.5-5 3.5H4z"/><path d="M8.5 19.5v6h5.5v-6"/><path d="M22.5 16h6M24 11.5l3.5-2M24 20.5l3.5 2"/><path d="M8 12.5v-3h6v3" />',
  hull: '<path d="M16 4.5l10 5.8v11.4l-10 5.8-10-5.8V10.3z"/><path d="M6 10.3l10 5.7 10-5.7M16 16v11.5"/><path d="M9.5 15.5v5.5l3.5 2M19.5 20l3.5-2"/>',
  basalt: '<path d="M11 6l5-2.5L21 6v5.5l-5 2.5-5-2.5z"/><path d="M6 14.5l5-3 5 2.5v6l-5 2.5-5-2.5z"/><path d="M16 14l5-2.5 5 3V20l-5 2.5-5-2.5"/><path d="M11 22.5V27M21 22.5V27M6 20v4.5l5 2.5 5-2.5 5 2.5 5-2.5V20"/>',
  crystal: '<path d="M17 3l5 9-4.5 17-6.5-15z"/><path d="M11 14l6.5-2 4.5 0M17 3l.5 9"/><path d="M6.500 17.500l3-4.500 3.500 9-2 6z"/><path d="M24.500 16.500l2.500 5-2.500 6.500"/>',
  ore: '<path d="M5 19l3-9 8-4.500 9 3.500 2.500 9-5.500 7H9z"/><path d="M12.500 13l2.500-2 2.500 2-2.500 2zM18.500 19l2-1.700 2 1.700-2 1.700zM10 20l1.600-1.300 1.600 1.300-1.600 1.300z" class="fill"/>',
  lamp: '<path d="M11 8.500h10M12.500 8.500v-3h7v3"/><path d="M11.500 8.500h9l1.500 12h-12z"/><path d="M10 20.500h12v3H10zM14 23.500v3.500h4v-3.500"/><path d="M16 12v5" class="hot"/>',
  cell: '<path d="M11 9.500h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M13 9.500v-3.500h6v3.500M14.500 6V4h3v2"/><circle cx="14" cy="17" r="2.600"/><circle cx="19" cy="21" r="1.600"/>',
  soil: '<path d="M5 12l11-6 11 6v10l-11 6-11-6z"/><path d="M5 12l11 6 11-6M16 18v10"/><path d="M9.500 18.500v0M12 23.500v0M20.500 22v0M23.500 17.500v0M13 12v0M19 12.500v0"/>',
  cap: '<path d="M4.500 15.500C5 9 10 5 16 5s11 4 11.500 10.500z"/><path d="M13 15.500c-.3 4 .2 7.500-1 11h8c-1.200-3.500-.7-7-1-11"/><path d="M9.500 15.500v2.500M22.500 15.500v2.500M16 9v0M11 11.500v0M21 11.500v0" />',
  // vitals
  pulse: '<path d="M3 17h6l2.500-7 4 13 3.500-9 2 3h8"/>',
  oxy: '<circle cx="12" cy="16" r="6.500"/><circle cx="23.500" cy="20.500" r="4"/><path d="M9 13.500a4 4 0 0 1 3-1.700"/>',
  power: '<path d="M18.500 3L7 18h7.500L13 29l12-15.500h-7.500z"/>',
  // misc
  diamond: '<path d="M16 5l9 11-9 11-9-11z"/><path d="M7 16h18"/>',
  drone: '<path d="M10 13h12l2 4-2 4H10l-2-4z"/><circle cx="16" cy="17" r="2.200"/><path d="M8 15H3.500M24 15h4.500M3.500 12.500v5M28.500 12.500v5M14 13l-1.500-5M18.500 13l1-3.500"/>',
  jump: '<path d="M7 17l9-9 9 9"/><path d="M7 25l9-9 9 9"/>',
  place: '<path d="M14 9l9 5v10l-9 5-9-5V14z"/><path d="M5 14l9 5 9-5M14 19v10"/><path d="M25 3v8M21 7h8"/>',
  swipe: '<path d="M5 16h22M9 11l-5 5 5 5M23 11l5 5-5 5"/>',
  bag: '<path d="M7 12h18l-1.500 14h-15z"/><path d="M12 12V9a4 4 0 0 1 8 0v3"/><path d="M12.500 17h7"/>',
};
const ic = (name, cls = 'ic') => svg(ICON[name], '0 0 32 32', cls);
const hex = '<svg class="hx" viewBox="0 0 60 68" aria-hidden="true"><polygon points="30,2.500 56.500,17.800 56.500,50.200 30,65.500 3.500,50.200 3.500,17.800"/><path class="nt" d="M30 2.500l8 4.600M30 2.500l-8 4.600M30 65.500l8-4.600M30 65.500l-8-4.600"/></svg>';

/** The starting hotbar. `id` is filled in by the world (block ids live in blocks.js). */
export const SLOTS = [
  { key: 'drill', icon: 'drill', name: 'المثقاب الليزري', tool: true },
  { key: 'hull', icon: 'hull', name: 'لوح هيكل', n: 48 },
  { key: 'basalt', icon: 'basalt', name: 'بازلت', n: 64 },
  { key: 'soil', icon: 'soil', name: 'تربة', n: 20 },
  { key: 'crystal', icon: 'crystal', name: 'بلّور سماوي', n: 5 },
  { key: 'ore', icon: 'ore', name: 'خام متوهّج', n: 17 },
  { key: 'lamp', icon: 'lamp', name: 'مصباح', n: 6 },
  { key: 'cap', icon: 'cap', name: 'قبعة فطر', n: 9 },
];

function compass(heading, wpBearing, wpText, span) {
  const names = { 0: 'ش', 45: 'ش ق', 90: 'ق', 135: 'ج ق', 180: 'ج', 225: 'ج غ', 270: 'غ', 315: 'ش غ' };
  let ticks = '';
  for (let d = Math.ceil((heading - span / 2) / 5) * 5; d <= heading + span / 2; d += 5) {
    const deg = ((d % 360) + 360) % 360, x = ((d - heading) / span + 0.5) * 100;
    const fade = Math.max(0, 1 - Math.pow(Math.abs(d - heading) / (span / 2), 3));
    const major = deg % 45 === 0, mid = deg % 15 === 0;
    ticks += `<i class="${major ? 'mj' : mid ? 'md' : 'mn'}" style="left:${x.toFixed(2)}%;opacity:${fade.toFixed(2)}">${major ? `<b>${names[deg]}</b>` : (deg % 30 === 0 ? `<s>${deg}</s>` : '')}</i>`;
  }
  const wx = ((wpBearing - heading) / span + 0.5) * 100;
  return `<div class="compass">
    <div class="wp" style="left:${wx.toFixed(2)}%"><span>${wpText}</span>${svg('<path d="M8 2l6 7-6 7-6-7z"/>', '0 0 16 18', 'wpi')}</div>
    <div class="strip">${ticks}</div>
    <div class="caret"></div>
    <div class="hd num" dir="ltr">${String(heading).padStart(3, '0')}°</div>
  </div>`;
}

export function buildHud(root) {
  const touch = window.matchMedia('(pointer: coarse)').matches || window.innerHeight < 500;
  root.classList.toggle('touch', touch);
  const shown = touch ? 5 : 9, span = touch ? 96 : 120;
  const slotHtml = (s, i, sel) => `
    <div class="slot${i === sel ? ' sel' : ''}" data-i="${i}">${hex}${s.kit ? kitIcon(s.id) : ic(s.icon)}${s.tool ? '' : `<span class="cnt num" dir="ltr">${s.n}</span>`}<span class="key num" dir="ltr">${i + 1}</span></div>`;
  const slotsHtml = (list, sel) => list.slice(0, shown).map((s, i) => slotHtml(s, i, sel)).join('');
  const vit = (k, icon, label, v, unit = '') => `
    <div class="vit ${k}">${ic(icon)}<span class="lbl">${label}</span><div class="bar"><i style="width:${v}%"></i></div><span class="num" dir="ltr">${v}${unit}</span></div>`;
  root.innerHTML = `
    ${compass(166, 151, 'القاعدة <span class="num" dir="ltr">68</span> م', span)}
    <div class="clock">
      ${svg('<path class="arc" d="M6 30A26 26 0 0 1 58 30"/><path class="hz" d="M2 30h60"/><circle class="sun" cx="54.500" cy="21.500" r="3.200"/><path class="tk" d="M32 4v4M13.600 11.600l2.800 2.800M50.400 11.600l-2.800 2.800"/>', '0 0 64 36', 'dial')}
      <div class="ct"><span class="num big" dir="ltr">19:42</span><span class="lbl">الغسق · اليوم <span class="num" dir="ltr">12</span></span></div>
    </div>
    <div class="obj">
      <div class="row">${ic('diamond')}<span class="lbl">اجمع بلّورات سماوية</span><span class="num goal" dir="ltr">5/12</span></div>
      <div class="row dim">${ic('drone')}<span class="lbl">المسّاح يتبعك</span><span class="num" dir="ltr">87%</span></div>
    </div>
    <div class="cross">${svg('<circle cx="24" cy="24" r="1.600" class="dot"/><path d="M24 9v7M24 32v7M9 24h7M32 24h7"/><path class="br" d="M13 17v-4h4M31 13h4v4M35 31v4h-4M17 35h-4v-4"/>', '0 0 48 48')}</div>
    <div class="target"><span class="lbl">بلّور سماوي</span><span class="pips"><i></i><i></i><i></i><i class="off"></i></span></div>
    <div class="vitals">
      ${vit('hp', 'pulse', 'الصحة', 86)}
      ${vit('o2', 'oxy', 'الأكسجين', 72, '%')}
      ${vit('pw warn', 'power', 'الطاقة', 34, '%')}
    </div>
    <div class="bar-wrap">
      <div class="selname lbl">${SLOTS[0].name}</div>
      <div class="hotbar">${slotsHtml(SLOTS, 0)}</div>
    </div>
    <div class="stick" data-act="stick"><div class="ring"></div><div class="knob"></div>${svg('<path d="M24 6l5 6H19zM24 42l5-6H19zM6 24l6-5v10zM42 24l-6-5v10z"/>', '0 0 48 48', 'arrows')}</div>
    <div class="bagbtn" data-act="bag">${ic('bag')}<span class="lbl">حقيبة</span><span class="key num" dir="ltr">E</span></div>
    <div class="lookzone">${ic('swipe')}<span class="lbl">اسحب هنا للنظر</span></div>
    <div class="btns">
      <div class="btn place" data-act="place">${hex}${ic('place')}<span class="lbl">بناء</span></div>
      <div class="btn dig" data-act="dig">${hex}${ic('drill')}<span class="lbl">حفر</span></div>
      <div class="btn jump" data-act="jump">${hex}${ic('jump')}<span class="lbl">قفز</span></div>
    </div>`;
  const q = (sel) => root.querySelector(sel);
  const hotbar = q('.hotbar'), selname = q('.selname'), target = q('.target'), tlbl = q('.target .lbl'), pips = [...root.querySelectorAll('.target .pips i')], goal = q('.obj .goal');
  let navKey = '', pipN = -1;
  return {
    show(v) { root.hidden = !v; }, touch, shown,
    els: { stick: q('.stick'), knob: q('.knob'), jump: q('.btn.jump'), dig: q('.btn.dig'), place: q('.btn.place'), lookzone: q('.lookzone'), hotbar, bag: q('.bagbtn') },
    /** Markup of one of this HUD's own icons (the bag draws them too). */
    icon: (name) => ic(name),
    /** Redraw the hotbar from the game's slots. */
    setSlots(list, sel) { hotbar.innerHTML = slotsHtml(list, sel); selname.textContent = list[sel] ? list[sel].name : ''; },
    /** heading / bearing in degrees (0 = north, 90 = east), distance in metres. */
    setNav(heading, bearing, dist) {
      const h = ((Math.round(heading) % 360) + 360) % 360, d = Math.round(dist);
      let rel = ((bearing - h + 540) % 360) - 180;
      rel = Math.max(-span * 0.46, Math.min(span * 0.46, rel));
      const key = h + '|' + Math.round(rel) + '|' + d;
      if (key === navKey) return;
      navKey = key;
      q('.compass').outerHTML = compass(h, h + rel, `القاعدة <span class="num" dir="ltr">${d}</span> م`, span);
    },
    /** Name of the block under the crosshair, or null for none. */
    setTarget(name) { target.hidden = !name; if (name) tlbl.textContent = name; },
    /** Dig progress 0..1, shown on the four pips beside the name. */
    setProgress(p) { const n = Math.round(p * 4); if (n === pipN) return; pipN = n; pips.forEach((el, i) => el.classList.toggle('off', i >= n)); },
    setGoal(n, total) { goal.textContent = n >= total ? 'تم' : `${n}/${total}`; goal.dir = n >= total ? 'rtl' : 'ltr'; },
  };
}
