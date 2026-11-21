// The building kit every world shares: blocks the player takes from the bag (painted blocks, half blocks,
// lamps, gold, diamond, glass, water, fire, beds) with their materials, names, icons and small behaviours.
//
// A world joins in with a few lines:
//   Object.assign(BLOCKS, KIT_BLOCKS)                         before meshing
//   materialFor: (tile) => kitMaterial(tile) || ownMaterial(tile)
//   const kit = createKit({ scene, world, terrain })
//   createPlay({ heightOf: kit.heightOf, isLiquid: (id) => own(id) || kit.isLiquid(id), ... })
//   onPlace -> kit.placed(x, y, z, id, yaw);  onBreak -> kit.broke(h);  onFrame -> kit.update(pos, dt, time)
//
// Ids 100 and up belong to the kit and mean the same block in every world.

import * as THREE from 'three';
import { canvasTexture } from './stage.js';

const COLORS = [
  ['white', 'أبيض', '#eceeed'], ['silver', 'رمادي فاتح', '#b7bcc3'], ['grey', 'رمادي', '#777d86'], ['black', 'أسود', '#25282d'],
  ['red', 'أحمر', '#c33d2e'], ['orange', 'برتقالي', '#dd7c2a'], ['yellow', 'أصفر', '#e3c038'], ['lime', 'أخضر فاتح', '#89c13e'],
  ['green', 'أخضر', '#3c8a47'], ['cyan', 'سماوي', '#2cabb3'], ['sky', 'أزرق فاتح', '#55a0e0'], ['blue', 'أزرق', '#2d5abf'],
  ['purple', 'بنفسجي', '#7747bb'], ['pink', 'وردي', '#d9649f'], ['brown', 'بنّي', '#775033'], ['sand', 'بيج', '#d3be96'],
];
const SLABS = ['white', 'grey', 'black', 'brown', 'sand', 'red'];
const LAMPS = [['warm', 'ليت دافئ', '#ffc27a'], ['white', 'ليت أبيض', '#eaf4ff'], ['cyan', 'ليت سماوي', '#5ff0ff'], ['pink', 'ليت وردي', '#ff6ad0']];
const BEDS = [['red', 'سرير أحمر', '#b8392f'], ['blue', 'سرير أزرق', '#2f58b4'], ['green', 'سرير أخضر', '#3b8748'], ['white', 'سرير أبيض', '#e4e6e4']];
const hexOf = Object.fromEntries(COLORS.map(([k, , h]) => [k, h]));
const nameOfColor = Object.fromEntries(COLORS.map(([k, n]) => [k, n]));

/** Block ids of the kit. */
export const K = { GOLD: 140, DIAMOND: 141, GLASS: 142, WATER: 150, FIRE: 151 };
/** Block definitions, in the same shape the worlds use (see voxel.js). */
export const KIT_BLOCKS = {};
const INFO = {};                                 // id -> { name, key, group, icon }
const GROUP_NAMES = { paint: 'مكعبات ملوّنة', slab: 'أنصاف مكعبات', light: 'إضاءة', gem: 'ذهب وجواهر', nature: 'ماء ونار', bed: 'أسرّة' };
function add(id, def, info) { KIT_BLOCKS[id] = def; INFO[id] = { id, ...info }; }

COLORS.forEach(([key, name, hex], i) => add(100 + i, { tiles: 'x:paint:' + hex }, { key: 'paint-' + key, name: 'مكعب ' + name, group: 'paint', icon: ['cube', hex] }));
SLABS.forEach((key, i) => add(120 + i, { tiles: 'x:paint:' + hexOf[key], kind: 'slab', height: 0.5 }, { key: 'slab-' + key, name: 'نصف مكعب ' + nameOfColor[key], group: 'slab', icon: ['slab', hexOf[key]] }));
LAMPS.forEach(([key, name, hex], i) => add(130 + i, { tiles: 'x:lamp:' + hex, light: hex }, { key: 'lamp-' + key, name, group: 'light', icon: ['lamp', hex] }));
add(K.GOLD, { tiles: 'x:gold' }, { key: 'gold', name: 'مكعب ذهب', group: 'gem', icon: ['cube', '#f0bd3f', 'shine'] });
add(K.DIAMOND, { tiles: 'x:diamond' }, { key: 'diamond', name: 'مكعب ألماس', group: 'gem', icon: ['cube', '#7fe6f5', 'shine'] });
add(K.GLASS, { tiles: 'x:glass', kind: 'translucent' }, { key: 'glass', name: 'زجاج', group: 'gem', icon: ['glass', '#cfeefa'] });
add(K.WATER, { tiles: 'x:water', kind: 'liquid' }, { key: 'water', name: 'ماء', group: 'nature', icon: ['drop', '#3f97dc'] });
add(K.FIRE, { tiles: 'x:fire', kind: 'cross', height: 0.96, light: '#ff9a3c', flicker: true }, { key: 'fire', name: 'نار', group: 'nature', icon: ['flame', '#ff8a2a'] });
BEDS.forEach(([key, name, hex], i) => {
  const head = 160 + i * 2, foot = head + 1, side = 'x:bedside:' + hex;
  add(head, { tiles: { top: 'x:pillow', side, bottom: 'x:wood' }, kind: 'slab', height: 0.5625, mate: foot }, { key: 'bed-' + key, name, group: 'bed', icon: ['bed', hex] });
  KIT_BLOCKS[foot] = { tiles: { top: 'x:quilt:' + hex, side, bottom: 'x:wood' }, kind: 'slab', height: 0.5625, mate: head, part: true };
  INFO[foot] = { id: foot, key: 'bed-' + key + '-foot', name, group: null };
});

// ---------------------------------------------------------------------- materials
const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const tex = {};
const T = (name, size, paint, opts) => (tex[name] ||= canvasTexture(size, paint, opts));
function grain(ctx, s, seed, n, lo, hi) { const r = rnd(seed); for (let i = 0; i < n; i++) { const v = Math.round(lo + r() * (hi - lo)); ctx.fillStyle = `rgba(${v},${v},${v},${0.05 + r() * 0.07})`; const w = 2 + r() * 7; ctx.fillRect(r() * s, r() * s, w, w * (0.4 + r())); } }
function bevel(ctx, s, depth, dark) { const g = [[0, 0, s, depth, 0, 1], [0, s - depth, s, depth, 0, -1], [0, 0, depth, s, 1, 0], [s - depth, 0, depth, s, -1, 0]]; for (const [x, y, w, h, dx, dy] of g) { const gr = dx ? ctx.createLinearGradient(dx > 0 ? x : x + w, 0, dx > 0 ? x + w : x, 0) : ctx.createLinearGradient(0, dy > 0 ? y : y + h, 0, dy > 0 ? y + h : y); gr.addColorStop(0, `rgba(0,0,0,${dark})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); } }
const paintTex = () => T('paint', 128, (c, s) => { c.fillStyle = '#eeeeee'; c.fillRect(0, 0, s, s); grain(c, s, 7, 260, 120, 255); bevel(c, s, 9, 0.2); });
const lampTex = () => T('lamp', 128, (c, s) => {
  c.fillStyle = '#16181c'; c.fillRect(0, 0, s, s);
  const g = c.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s * 0.62); g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#d8d8d8'); g.addColorStop(1, '#8a8a8a');
  c.fillStyle = g; c.fillRect(12, 12, s - 24, s - 24);
  c.strokeStyle = '#16181c'; c.lineWidth = 5; c.beginPath(); c.moveTo(s / 2, 12); c.lineTo(s / 2, s - 12); c.moveTo(12, s / 2); c.lineTo(s - 12, s / 2); c.stroke();
});
const goldTex = () => T('gold', 128, (c, s) => {
  const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#fff3c4'); g.addColorStop(0.35, '#f1c24a'); g.addColorStop(0.7, '#d79a22'); g.addColorStop(1, '#f6d572');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  const r = rnd(11); c.globalAlpha = 0.22; for (let i = 0; i < 70; i++) { c.fillStyle = r() > 0.5 ? '#fff8d8' : '#a8730f'; c.fillRect(0, r() * s, s, 1 + r() * 1.5); } c.globalAlpha = 1;
  c.strokeStyle = 'rgba(120,78,6,.55)'; c.lineWidth = 3; c.strokeRect(13, 13, s - 26, s - 26); bevel(c, s, 10, 0.28);
});
const diamondTex = () => T('diamond', 128, (c, s) => {
  c.fillStyle = '#8fe4f2'; c.fillRect(0, 0, s, s);
  const r = rnd(5), pts = []; for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) pts.push([(i + (i % 4 ? (r() - 0.5) * 0.6 : 0)) * s / 4, (j + (j % 4 ? (r() - 0.5) * 0.6 : 0)) * s / 4]);
  const shade = ['#e8fdff', '#b9f3fb', '#74d6ea', '#4fbdd8', '#a4ecf7', '#d4f9ff'];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const a = pts[j * 5 + i], b = pts[j * 5 + i + 1], d = pts[(j + 1) * 5 + i], e = pts[(j + 1) * 5 + i + 1]; for (const tri of [[a, b, d], [b, e, d]]) { c.fillStyle = shade[Math.floor(r() * shade.length)]; c.beginPath(); c.moveTo(tri[0][0], tri[0][1]); c.lineTo(tri[1][0], tri[1][1]); c.lineTo(tri[2][0], tri[2][1]); c.closePath(); c.fill(); } }
  bevel(c, s, 8, 0.16);
});
const glassTex = () => T('glass', 128, (c, s) => {
  c.clearRect(0, 0, s, s); c.fillStyle = 'rgba(205,236,248,.16)'; c.fillRect(0, 0, s, s);
  c.strokeStyle = 'rgba(232,248,255,.9)'; c.lineWidth = 6; c.strokeRect(3, 3, s - 6, s - 6);
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(26, 62); c.lineTo(58, 26); c.moveTo(44, 78); c.lineTo(66, 54); c.stroke();
});
const woodTex = () => T('wood', 128, (c, s) => { c.fillStyle = '#6f4a2c'; c.fillRect(0, 0, s, s); const r = rnd(3); for (let i = 0; i < 46; i++) { c.fillStyle = `rgba(${r() > 0.5 ? '40,24,10' : '150,104,62'},${0.12 + r() * 0.14})`; c.fillRect(0, r() * s, s, 1 + r() * 2.5); } bevel(c, s, 8, 0.25); });
const pillowTex = () => T('pillow', 128, (c, s) => {
  c.fillStyle = '#e9e7e0'; c.fillRect(0, 0, s, s); grain(c, s, 9, 120, 170, 255); bevel(c, s, 8, 0.14);
  c.fillStyle = '#fbfaf6'; c.strokeStyle = 'rgba(120,112,98,.55)'; c.lineWidth = 2.5; const x = 18, y = 22, w = s - 36, h = s - 44, rr = 16;
  c.beginPath(); c.moveTo(x + rr, y); c.arcTo(x + w, y, x + w, y + h, rr); c.arcTo(x + w, y + h, x, y + h, rr); c.arcTo(x, y + h, x, y, rr); c.arcTo(x, y, x + w, y, rr); c.closePath(); c.fill(); c.stroke();
});
const quiltTex = () => T('quilt', 128, (c, s) => { c.fillStyle = '#ededed'; c.fillRect(0, 0, s, s); grain(c, s, 13, 140, 150, 255); c.strokeStyle = 'rgba(0,0,0,.16)'; c.lineWidth = 2; for (let i = -s; i < s * 2; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + s, s); c.moveTo(i + s, 0); c.lineTo(i, s); c.stroke(); } bevel(c, s, 8, 0.18); });
/** Bed side: the lower part (the only part a 0.56-high side shows) is the wooden frame with the blanket hanging over it. */
const bedSideTex = (hex) => T('bedside' + hex, 128, (c, s) => {
  c.fillStyle = '#6a4629'; c.fillRect(0, 0, s, s); const r = rnd(4); for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(40,24,10,${0.1 + r() * 0.14})`; c.fillRect(0, r() * s, s, 1 + r() * 2); }
  c.fillStyle = hex; c.fillRect(0, s * 0.44, s, s * 0.3);                  // canvas y grows down: this band sits in the upper half of the visible strip
  c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, s * 0.72, s, 3);
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(0, s * 0.44, s, 3);
});
function flameTex(seed) {
  return T('flame' + seed, 128, (c, s) => {
    c.clearRect(0, 0, s, s); const r = rnd(seed);
    for (let i = 0; i < 5; i++) {
      const x = s * (0.2 + 0.15 * i + (r() - 0.5) * 0.06), h = s * (0.5 + r() * 0.42), w = s * (0.13 + r() * 0.06);
      const g = c.createLinearGradient(0, s, 0, s - h); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.35, '#ffc23c'); g.addColorStop(0.75, '#ff7a1c'); g.addColorStop(1, 'rgba(255,60,10,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(x - w, s); c.quadraticCurveTo(x - w * 1.25, s - h * 0.5, x + (r() - 0.5) * w, s - h); c.quadraticCurveTo(x + w * 1.25, s - h * 0.5, x + w, s); c.closePath(); c.fill();
    }
  });
}

const mats = new Map();
let fireMat = null;
/** Material of a kit tile ('x:…'), or null for any other tile name. */
export function kitMaterial(tile) {
  if (typeof tile !== 'string' || tile.charCodeAt(0) !== 120 || tile[1] !== ':') return null;
  let m = mats.get(tile);
  if (m) return m;
  const [, kind, arg] = tile.split(':');
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  if (kind === 'paint') m = std({ map: paintTex(), color: arg });
  else if (kind === 'lamp') m = std({ map: lampTex(), color: 0x2a2a2a, emissive: new THREE.Color(arg), emissiveMap: lampTex(), emissiveIntensity: 1.7, roughness: 0.5 });
  else if (kind === 'gold') m = std({ map: goldTex(), color: 0xffffff, metalness: 0.85, roughness: 0.32, emissive: 0x4a3104, emissiveIntensity: 0.55 });
  else if (kind === 'diamond') m = std({ map: diamondTex(), color: 0xffffff, metalness: 0.15, roughness: 0.12, emissive: 0x1c6f80, emissiveIntensity: 0.45 });
  else if (kind === 'glass') m = std({ map: glassTex(), transparent: true, depthWrite: false, roughness: 0.08, side: THREE.DoubleSide });
  else if (kind === 'water') m = std({ color: 0x2f86c8, transparent: true, opacity: 0.66, roughness: 0.12, depthWrite: false });
  else if (kind === 'fire') m = fireMat = new THREE.MeshBasicMaterial({ map: flameTex(21), alphaTest: 0.3, toneMapped: false, fog: false, color: 0xffd9a8 });
  else if (kind === 'wood') m = std({ map: woodTex() });
  else if (kind === 'pillow') m = std({ map: pillowTex() });
  else if (kind === 'quilt') m = std({ map: quiltTex(), color: arg });
  else if (kind === 'bedside') m = std({ map: bedSideTex(arg) });
  else return null;
  m.name = tile;
  mats.set(tile, m);
  return m;
}

// ---------------------------------------------------------------------- icons (an <img>, so no HUD stylesheet can restyle it)
const shadeHex = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
function svgIcon([shape, hex, extra]) {
  const top = shadeHex(hex, 1.12), left = shadeHex(hex, 0.78), right = shadeHex(hex, 0.6), line = 'rgba(0,0,0,.35)';
  const cube = (y0) => `<path d="M16 ${y0}l11 6-11 6-11-6z" fill="${top}" stroke="${line}" stroke-width=".7"/><path d="M5 ${y0 + 6}l11 6v${27 - y0 - 12}l-11-6z" fill="${left}" stroke="${line}" stroke-width=".7"/><path d="M27 ${y0 + 6}l-11 6v${27 - y0 - 12}l11-6z" fill="${right}" stroke="${line}" stroke-width=".7"/>`;
  let body;
  if (shape === 'slab') body = cube(12);
  else if (shape === 'lamp') body = `<circle cx="16" cy="16" r="14" fill="${hex}" opacity=".28"/>` + cube(4) + '<path d="M16 16v11M10.500 13l5.500 3 5.500-3" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1"/>';
  else if (shape === 'glass') body = `<path d="M16 4l11 6v12l-11 6-11-6V10z" fill="${hex}" fill-opacity=".28" stroke="#eaf8ff" stroke-width="1.4"/><path d="M5 10l11 6 11-6M16 16v12" fill="none" stroke="#eaf8ff" stroke-width="1"/><path d="M9 17l4-4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`;
  else if (shape === 'drop') body = `<path d="M16 3c5 7 9 11 9 16a9 9 0 0 1-18 0c0-5 4-9 9-16z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M11.500 19a4.500 4.500 0 0 0 3 4.300" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>`;
  else if (shape === 'flame') body = `<path d="M16 3c1 6 8 8 8 16a8 8 0 0 1-16 0c0-4 2-6 3-9 1 3 2 4 3 4 0-4 0-7 2-11z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M16 15c.500 3 4 4 4 7a4 4 0 0 1-8 0c0-2 1-3 1.500-4.500.500 1.500 1 2 1.500 2 0-2 0-3 1-4.500z" fill="#ffe28a"/>`;
  else if (shape === 'bed') body = `<path d="M3 21l9-5 17 9-9 5z" fill="${top}" stroke="${line}" stroke-width=".7"/><path d="M3 21v3l17 9v-3z" fill="${left}" stroke="${line}" stroke-width=".7"/><path d="M29 25v3l-9 5v-3z" fill="${right}" stroke="${line}" stroke-width=".7"/><path d="M4.500 20l6-3.300 5 2.600-6 3.300z" fill="#f6f4ee" stroke="${line}" stroke-width=".7"/><path d="M3 21v-6l9-5v6" fill="#6a4629" stroke="${line}" stroke-width=".7"/>`;
  else body = cube(4);
  if (extra === 'shine') body += '<path d="M9 13.500l5-2.700M8.500 16.500l2.500-1.300" stroke="#fff" stroke-opacity=".8" stroke-width="1.5" stroke-linecap="round"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`;
}
const iconCache = new Map();
/** <img> markup for a kit block's icon; className is added to the image. */
export function kitIcon(id, className = 'ic') {
  let url = iconCache.get(id);
  if (!url) { const info = INFO[id]; if (!info || !info.icon) return ''; url = 'data:image/svg+xml,' + encodeURIComponent(svgIcon(info.icon)); iconCache.set(id, url); }
  return `<img class="${className} xi" src="${url}" alt="" draggable="false">`;
}

/** The bag's contents: [{ title, items: [{ id, key, name, n, kit: true }] }]. A slot holding one of these is a kit slot. */
export const KIT_GROUPS = Object.entries(GROUP_NAMES).map(([g, title]) => ({
  title, items: Object.values(INFO).filter((i) => i.group === g).map((i) => ({ id: i.id, key: i.key, name: i.name, n: 64, kit: true })),
}));
export const isKit = (id) => id >= 100 && !!KIT_BLOCKS[id];
export const kitName = (id) => (INFO[id] ? INFO[id].name : '');

// ---------------------------------------------------------------------- behaviour in a running world
/**
 * scene: lights are added here. world / terrain: as given to createPlay (terrain.setBlock edits).
 * Returns the hooks the world wires into createPlay.
 */
export function createKit({ scene, world, terrain, lights = 2 }) {
  const glow = new Map();                          // "x,y,z" -> block id, for every placed block that gives light
  const pool = [];
  for (let i = 0; i < lights; i++) { const l = new THREE.PointLight(0xffffff, 0, 15, 1.8); l.visible = true; scene.add(l); pool.push(l); }   // always in the scene: the light count never changes after the first frame
  const flameB = flameTex(22);
  let since = 1, flick = 0, frame = 0;
  const key = (x, y, z) => x + ',' + y + ',' + z;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return {
    heightOf: (id) => (KIT_BLOCKS[id] && KIT_BLOCKS[id].height) || 1,
    isLiquid: (id) => id === K.WATER,
    nameOf: kitName,
    hardness: (id) => (id === K.FIRE ? 0.05 : id === K.GOLD || id === K.DIAMOND ? 0.8 : KIT_BLOCKS[id] ? 0.35 : null),
    /** What breaking a kit block gives back (the foot of a bed counts as its head). */
    dropOf: (id) => { const d = KIT_BLOCKS[id]; return d ? (d.part ? d.mate : id) : 0; },
    /** Call after the player placed block id at (x, y, z); yaw is the player's heading. */
    placed(x, y, z, id, yaw = 0) {
      const d = KIT_BLOCKS[id];
      if (!d) return;
      if (d.light) glow.set(key(x, y, z), id);
      if (d.mate && !d.part) {
        // the bed is two cells long: lay the foot away from the player if that cell is free, else any free side
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), ahead = Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz)];
        for (const [dx, dz] of [ahead, ...DIRS]) {
          const nx = x + dx, nz = z + dz;
          if (world.inb(nx, y, nz) && world.get(nx, y, nz) === 0 && world.get(nx, y - 1, nz) !== 0) { terrain.setBlock(nx, y, nz, d.mate); break; }
        }
      }
      since = 1;
    },
    /** Call after the player broke the block described by h ({ x, y, z, id }). */
    broke(h) {
      const d = KIT_BLOCKS[h.id];
      if (!d) return;
      glow.delete(key(h.x, h.y, h.z));
      if (d.mate) for (const [dx, dz] of DIRS) if (world.get(h.x + dx, h.y, h.z + dz) === d.mate) { terrain.setBlock(h.x + dx, h.y, h.z + dz, 0); break; }
      since = 1;
    },
    /** Every frame: the nearest lamps and fires get the real lights; flames flicker. */
    update(pos, dt, time) {
      since += dt; flick += dt;
      if (fireMat && flick > 0.13) { flick = 0; frame ^= 1; fireMat.map = frame ? flameB : flameTex(21); }
      if (since < 0.3) { for (const l of pool) if (l.userData.flicker) l.intensity = l.userData.base * (0.82 + 0.18 * Math.sin(time * 17 + l.position.x)); return; }
      since = 0;
      const near = [];
      for (const [k, id] of glow) {
        const [x, y, z] = k.split(',').map(Number);
        if (world.get(x, y, z) !== id) { glow.delete(k); continue; }       // gone without a word (a flame on a dug block, a block set into it)
        const d2 = (x + 0.5 - pos.x) ** 2 + (y + 0.5 - pos.y) ** 2 + (z + 0.5 - pos.z) ** 2; if (d2 < 30 * 30) near.push([d2, x, y, z, id]);
      }
      near.sort((a, b) => a[0] - b[0]);
      pool.forEach((l, i) => {
        const n = near[i];
        if (!n) { l.intensity = 0; l.userData.base = 0; l.userData.flicker = false; return; }
        const d = KIT_BLOCKS[n[4]];
        l.color.set(d.light); l.position.set(n[1] + 0.5, n[2] + 0.75, n[3] + 0.5);
        l.userData.base = d.flicker ? 16 : 22; l.userData.flicker = !!d.flicker; l.intensity = l.userData.base;
      });
    },
    lights: pool, glow,
  };
}
