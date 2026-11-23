import { kitIcon } from '../../shared/kit.js';
import { BLOCKS } from './blocks.js';
import { tileCanvas } from './tiles.js';
import { DINO } from './mode.js';

// HUD for "barari": light rounded cards, warm colours. All HTML/SVG over the canvas; block icons are little
// cubes drawn from the world's own tile pictures.
const svg = (body, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
const ICON = {
  axe: '<path d="M9 28L22 9" stroke="#7a4f2a" stroke-width="3.4" stroke-linecap="round"/><path d="M17 6.5c3.5-3 9-2.5 11.5 1.5l-6 7c-1-3-3.5-5-7.5-5z" fill="#cfd6dc" stroke="#46505a" stroke-width="1.2"/><path d="M20 7.5c2-1 4.5-.5 6 1" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>',
  drop: '<path d="M16 4c5 7 9 11 9 16a9 9 0 0 1-18 0c0-5 4-9 9-16z" fill="#4aa8e8" stroke="#1d5f8c" stroke-width="1.3"/><path d="M11.5 20a4.5 4.5 0 0 0 3 4.3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
  warm: '<path d="M16 3c1 6 8 8 8 16a8 8 0 0 1-16 0c0-4 2-6 3-9 1 3 2 4 3 4 0-4 0-7 2-11z" fill="#ff8a3a" stroke="#a5461a" stroke-width="1.2"/><path d="M16 15c.5 3 4 4 4 7a4 4 0 0 1-8 0c0-2 1-3 1.5-4.5.5 1.5 1 2 1.5 2 0-2 0-3 1-4.5z" fill="#ffe08a"/>',
  heart: '<path d="M16 27L5 16C2 13 3 8 7 7c3-1 6 1 9 4 3-3 6-5 9-4 4 1 5 6 2 9z" fill="#ef4b45" stroke="#9b2420" stroke-width="1.2"/>',
  jump: '<path d="M8 18l8-8 8 8M8 25l8-8 8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  place: '<path d="M14 10l8 4.5v9L14 28l-8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M6 14.5l8 4.5 8-4.5M14 19v9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M25 3v8M21 7h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  dig: '<path d="M9 28L22 9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M17 6.5c3.5-3 9-2.5 11.5 1.5l-6 7c-1-3-3.5-5-7.5-5z" fill="currentColor"/>',
  bag: '<path d="M7 12h18l-1.5 14h-15z" fill="#c98a4a" stroke="#6b4320" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 12V9a4 4 0 0 1 8 0v3" fill="none" stroke="#6b4320" stroke-width="1.8"/><path d="M12.5 17h7" stroke="#fff3dc" stroke-width="1.8" stroke-linecap="round"/>',
  swipe: '<path d="M5 16h22M9 11l-5 5 5 5M23 11l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  sun: '<circle cx="16" cy="16" r="6" fill="#ffc83a"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M7 7l3 3M22 22l3 3M25 7l-3 3M10 22l-3 3" stroke="#ffb020" stroke-width="2" stroke-linecap="round"/>',
  moon: '<path d="M21 4a11 11 0 1 0 7 17A9 9 0 0 1 21 4z" fill="#dfe7ff" stroke="#8a97c4" stroke-width="1.2"/>',
};
const ic = (name, cls = 'ic') => svg(ICON[name] || '', cls);

/** A little cube picture for an own block, drawn from its tile pictures (cached as a data URL). */
const cubeCache = new Map();
function cubeUrl(id) {
  let url = cubeCache.get(id);
  if (url) return url;
  const def = BLOCKS[id];
  if (!def) return '';
  const tile = (f) => (typeof def.tiles === 'string' ? def.tiles : def.tiles[f] ?? def.tiles.side ?? def.tiles.top);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const S = 128;
  if ((def.kind ?? 'solid') === 'cross') x.drawImage(tileCanvas(tile('side')), 4, 4, 56, 56);
  else {
    const face = (name, a, b, cc, d, e, f, dark) => {
      x.setTransform(a / S, b / S, cc / S, d / S, e, f); x.drawImage(tileCanvas(name), 0, 0);
      if (dark) { x.fillStyle = `rgba(20,24,30,${dark})`; x.fillRect(0, 0, S, S); }
    };
    x.save(); x.beginPath(); x.moveTo(32, 4); x.lineTo(60, 18); x.lineTo(32, 32); x.lineTo(4, 18); x.closePath(); x.clip(); face(tile('top'), 28, -14, 28, 14, 4, 18, 0); x.restore();
    x.save(); x.beginPath(); x.moveTo(4, 18); x.lineTo(32, 32); x.lineTo(32, 62); x.lineTo(4, 48); x.closePath(); x.clip(); face(tile('side'), 28, 14, 0, 30, 4, 18, 0.18); x.restore();
    x.save(); x.beginPath(); x.moveTo(32, 32); x.lineTo(60, 18); x.lineTo(60, 48); x.lineTo(32, 62); x.closePath(); x.clip(); face(tile('side'), 28, -14, 0, 30, 32, 32, 0.36); x.restore();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.strokeStyle = 'rgba(30,24,16,.35)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(32, 4); x.lineTo(60, 18); x.lineTo(60, 48); x.lineTo(32, 62); x.lineTo(4, 48); x.lineTo(4, 18); x.closePath(); x.moveTo(4, 18); x.lineTo(32, 32); x.lineTo(60, 18); x.moveTo(32, 32); x.lineTo(32, 62); x.stroke();
  }
  url = c.toDataURL('image/png');
  cubeCache.set(id, url);
  return url;
}
/** Icon markup for an item of this world (a block, or the tool), or for a kit item. */
export function itemIcon(it, cls = 'ic') {
  if (!it || it.empty) return '';
  if (it.kit) return kitIcon(it.id, cls);
  if (it.icon) return ic(it.icon, cls);
  const url = cubeUrl(it.id);
  return url ? `<img class="${cls} cube" src="${url}" alt="" draggable="false">` : '';
}

/** The starting hotbar; ids are filled in by main.js. */
const DINO_SLOTS = [
  { key: 'axe', icon: 'axe', name: 'الفأس', tool: true },
  { key: 'log', block: 'JUNGLE_LOG', name: 'جذع شجرة الغابة', n: 6 },
  { key: 'planks', block: 'PLANKS', name: 'ألواح خشب', n: 32 },
  { key: 'stone', block: 'STONE', name: 'صخر', n: 32 },
  { key: 'dirt', block: 'DIRT', name: 'تراب', n: 24 },
  { key: 'sand', block: 'SAND', name: 'رمل', n: 24 },
  { key: 'basalt', block: 'BASALT', name: 'صخر بركاني', n: 16 },
];
export const SLOTS = DINO ? DINO_SLOTS : [
  { key: 'axe', icon: 'axe', name: 'الفأس', tool: true },
  { key: 'log', block: 'OAK', name: 'جذع شجرة', n: 6 },
  { key: 'planks', block: 'PLANKS', name: 'ألواح خشب', n: 32 },
  { key: 'stone', block: 'STONE', name: 'صخر', n: 32 },
  { key: 'dirt', block: 'DIRT', name: 'تراب', n: 24 },
  { key: 'sand', block: 'SAND', name: 'رمل', n: 24 },
  { key: 'snow', block: 'SNOWBLOCK', name: 'ثلج', n: 16 },
];

export function buildHud(root) {
  const touch = window.matchMedia('(pointer: coarse)').matches || window.innerHeight < 500;
  root.classList.toggle('touch', touch);
  const shown = touch ? 5 : 9;
  const slotHtml = (s, i, sel) => `<div class="slot${i === sel ? ' sel' : ''}${s && !s.empty ? '' : ' none'}" data-i="${i}">${itemIcon(s)}${s && !s.empty && !s.tool && s.n != null ? `<span class="cnt">${s.n}</span>` : ''}${touch ? '' : `<span class="key">${i + 1}</span>`}</div>`;
  const vit = (k, icon, label) => `<div class="vit ${k}">${ic(icon)}<span class="lbl">${label}</span><div class="bar"><i></i></div><span class="num">0</span></div>`;
  root.innerHTML = `
    <div class="land"><span class="dir">ش</span><span class="name">الغابة</span></div>
    <div class="clock"><span class="sky">${ic('sun')}</span><div class="ct"><span class="big">08:20</span><span class="lbl">الصبح</span></div></div>
    <div class="vitals">${vit('hp', 'heart', 'الصحة')}${vit('water', 'drop', 'الماي')}${vit('warm', 'warm', 'الدفا')}</div>
    <div class="cross"><i></i><i></i></div>
    <div class="target"><span class="lbl"></span><span class="prog"><i></i></span></div>
    <div class="bar-wrap"><div class="selname"></div><div class="hotbar"></div></div>
    <div class="stick" data-act="stick"><div class="ring"></div><div class="knob"></div></div>
    <div class="bagbtn" data-act="bag">${ic('bag')}<span class="lbl">الحقيبة</span><span class="key">E</span></div>
    <div class="lookzone">${ic('swipe')}<span class="lbl">اسحب هنا عشان تلف</span></div>
    <div class="btns">
      <div class="btn place" data-act="place">${ic('place')}<span class="lbl">حط</span></div>
      <div class="btn dig" data-act="dig">${ic('dig')}<span class="lbl">اكسر</span></div>
      <div class="btn jump" data-act="jump">${ic('jump')}<span class="lbl">نط</span></div>
    </div>`;
  const q = (sel) => root.querySelector(sel);
  const hotbar = q('.hotbar'), selname = q('.selname'), target = q('.target'), tlbl = q('.target .lbl'), prog = q('.target .prog i');
  let landKey = '', pr = -1;
  return {
    show(v) { root.hidden = !v; }, touch, shown,
    els: { stick: q('.stick'), knob: q('.knob'), jump: q('.btn.jump'), dig: q('.btn.dig'), place: q('.btn.place'), lookzone: q('.lookzone'), hotbar, bag: q('.bagbtn') },
    icon: (it) => itemIcon(it),
    setSlots(list, sel) { hotbar.innerHTML = list.slice(0, shown).map((s, i) => slotHtml(s, i, sel)).join(''); selname.textContent = list[sel] && !list[sel].empty ? list[sel].name : ''; selname.hidden = !selname.textContent; },
    /** The land under the player and the way they face (0 = north, degrees clockwise). */
    setLand(name, heading) {
      const dirs = ['ش', 'ش ق', 'ق', 'ج ق', 'ج', 'ج غ', 'غ', 'ش غ'], d = dirs[((Math.round(heading / 45) % 8) + 8) % 8];
      const key = name + d;
      if (key === landKey) return;
      landKey = key; q('.land .name').textContent = name; q('.land .dir').textContent = d;
    },
    setTarget(name) { target.hidden = !name; if (name) tlbl.textContent = name; },
    setProgress(p) { const n = Math.round(p * 20); if (n === pr) return; pr = n; prog.style.width = (n * 5) + '%'; prog.parentNode.hidden = n === 0; },
    setClock(time, label, night) { q('.clock .big').textContent = time; q('.clock .lbl').textContent = label; q('.clock .sky').innerHTML = ic(night ? 'moon' : 'sun'); },
  };
}
