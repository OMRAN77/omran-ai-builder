// «سفينة الجزر»: a ship docked on a wooden pier near where every world starts. Pressed with the place button it opens the
// map of the five islands (the owner's picture of them: the planet, the oasis, the wilds, the dark, the dinosaurs, with
// the sea between), the player picks an island and sails there: this world is kept, the sailing is shown, and the
// other world opens. The worlds are separate pages, so the sea between them is this map and the short crossing.
// Only when the game was opened from the first page (that page is what opens another world).
//
//   createVoyage({ play, kit, spawn, groundAt, avoid })

import * as THREE from 'three';

export const ISLANDS = [      // where each one lies on the map (per cent of its width and height), as in the owner's picture
  { key: 'kawkab', name: 'كوكب', x: 22, y: 26, about: 'بلّورات تغنّي وصخور طايرة' },
  { key: 'waha', name: 'واحة', x: 78, y: 24, about: 'صحراء وحصن طين وقافلة جمال' },
  { key: 'barari', name: 'البراري', x: 50, y: 50, about: 'غابات وجبال وثلج وبحر' },
  { key: 'dhalam', name: 'ظلام', x: 22, y: 76, about: 'أطلال وضباب وجسور من نور' },
  { key: 'dino', name: 'الديناصورات', x: 78, y: 76, about: 'بركان وغابة وديناصورات' },
];

const CSS = `
#bwVoyage { position: fixed; inset: 0; z-index: 72; display: flex; align-items: center; justify-content: center; padding: 10px; direction: rtl; background: rgba(2, 6, 12, .62); color: #f3f6fb; -webkit-user-select: none; user-select: none; }
#bwVoyage[hidden] { display: none; }
#bwVoyage .vy { box-sizing: border-box; width: min(880px, 100%); max-height: 100%; overflow: auto; padding: 14px 16px 12px; border-radius: 16px; background: rgba(12, 18, 28, .96); border: 1px solid rgba(255, 255, 255, .18); box-shadow: 0 20px 70px rgba(0, 0, 0, .6); text-align: center; }
#bwVoyage h2 { margin: 0; font-size: 24px; font-weight: 800; } #bwVoyage .sub { margin: 2px 0 10px; font-size: 13.5px; opacity: .8; }
#bwVoyage .sea { position: relative; width: 100%; height: min(51vw, 450px, calc(100vh - 168px)); border-radius: 14px; overflow: hidden;
  background: radial-gradient(ellipse at 50% 50%, #2f8fd0 0%, #1d6fb2 45%, #134d86 100%); box-shadow: inset 0 0 40px rgba(0, 0, 0, .35); }
#bwVoyage .sea::before { content: ''; position: absolute; inset: 0; opacity: .35; background:
  repeating-radial-gradient(circle at 30% 40%, transparent 0 18px, rgba(255, 255, 255, .25) 19px 20px, transparent 21px 38px),
  repeating-radial-gradient(circle at 75% 65%, transparent 0 22px, rgba(255, 255, 255, .2) 23px 24px, transparent 25px 44px); }
#bwVoyage svg.lanes { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
#bwVoyage .isl { position: absolute; transform: translate(-50%, -50%); width: 21%; padding: 0; border: 0; background: none; cursor: pointer; color: inherit; font: inherit; }
#bwVoyage .isl .pic { position: relative; display: block; width: 100%; aspect-ratio: 16 / 10; border-radius: 46% 54% 48% 52% / 55% 45% 55% 45%; overflow: hidden;
  box-shadow: 0 0 0 4px #e8cf8c, 0 0 0 7px rgba(255, 255, 255, .35), 0 8px 18px rgba(0, 0, 0, .45); }
#bwVoyage .isl img { display: block; width: 100%; height: 100%; object-fit: cover; }
#bwVoyage .isl b { display: inline-block; margin-top: 7px; padding: 2px 10px; border-radius: 8px; font-size: 14px; font-weight: 800; background: rgba(8, 14, 22, .78); }
#bwVoyage .isl small { display: block; margin-top: 2px; font-size: 11px; opacity: .85; text-shadow: 0 1px 3px #000; }
#bwVoyage .isl.here .pic { box-shadow: 0 0 0 4px #ffd34d, 0 0 0 8px rgba(255, 211, 77, .45), 0 8px 18px rgba(0, 0, 0, .45); }
#bwVoyage .isl.here b::after { content: ' · أنت هني'; color: #ffd34d; }
#bwVoyage .isl.pick .pic { box-shadow: 0 0 0 4px #9ee6a8, 0 0 0 9px rgba(158, 230, 168, .5), 0 8px 18px rgba(0, 0, 0, .45); }
#bwVoyage .isl:disabled { cursor: default; }
#bwVoyage .row { display: flex; justify-content: center; gap: 12px; margin-top: 12px; }
#bwVoyage .row button { min-width: 200px; min-height: 44px; padding: 0 18px; font: inherit; font-size: 16px; font-weight: 800; border-radius: 10px; cursor: pointer; }
#bwVoyage .go { color: #10220f; background: #9ee6a8; border: 0; } #bwVoyage .go:disabled { opacity: .45; cursor: default; }
#bwVoyage .back { color: #f3f6fb; background: none; border: 1px solid rgba(255, 255, 255, .45); }
#bwVoyage .msg { min-height: 1em; margin-top: 6px; font-size: 12.5px; color: #ffcf8a; }
#bwVoyage .sail { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 10px; background: linear-gradient(#0d2c4f, #134d86); }
#bwVoyage.sailing .sail { display: flex; }
#bwVoyage .sail .ship { font-size: 54px; animation: bwSail 1.8s linear forwards; filter: drop-shadow(0 4px 6px rgba(0, 0, 0, .5)); }
#bwVoyage .sail .waves { width: 70%; height: 14px; border-radius: 7px; background: repeating-linear-gradient(90deg, rgba(255, 255, 255, .55) 0 18px, transparent 18px 36px); animation: bwWave .6s linear infinite; }
#bwVoyage .sail p { margin: 0; font-size: 18px; font-weight: 800; }
@keyframes bwSail { from { transform: translateX(120px) rotate(-4deg); } 50% { transform: translateX(0) rotate(4deg); } to { transform: translateX(-120px) rotate(-3deg); } }
@keyframes bwWave { from { background-position: 0 0; } to { background-position: -36px 0; } }
@media (max-height: 520px) { #bwVoyage .vy { padding: 8px 12px; } #bwVoyage h2 { font-size: 18px; } #bwVoyage .sub { margin-bottom: 6px; font-size: 12px; }
  #bwVoyage .sea { height: calc(100vh - 128px); } #bwVoyage .isl { width: 17%; } #bwVoyage .isl small { display: none; } #bwVoyage .isl b { font-size: 12px; margin-top: 4px; }
  #bwVoyage .row { margin-top: 6px; } #bwVoyage .row button { min-height: 36px; min-width: 150px; font-size: 14px; } }
`;

/** The ship: an original boxy sailing ship with a striped sail and a pennant, docked on a short pier of planks. */
export function buildShip() {
  const g = new THREE.Group(), lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const wood = lam(0x8a5a32), dark = lam(0x5e3b20), deck = lam(0xc49a62), sail = lam(0xf3ecd8), stripe = lam(0x2f7fc0), flag = lam(0xd23b2f), rope = lam(0xd9c79b);
  const box = (w, h, d, x, y, z, m, p = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); p.add(b); return b; };
  // the pier: planks on posts, the ship rests beside it
  for (let i = 0; i < 6; i++) box(1.9, 0.12, 0.42, -2.2, 0.55, -2.4 + i * 0.95, i % 2 ? deck : wood);
  for (const z of [-2.5, 2.4]) for (const x of [-3.0, -1.4]) box(0.22, 0.75, 0.22, x, 0.2, z, dark);
  const ship = new THREE.Group(); g.add(ship);
  box(2.0, 0.9, 5.0, 0.6, 0.75, 0, wood, ship);                       // the hull
  box(1.5, 0.5, 4.2, 0.6, 0.25, 0, dark, ship);                       // the keel side, narrower below
  box(0.5, 0.6, 1.2, 0.6, 1.0, 2.75, wood, ship);                     // the bow
  box(1.8, 0.1, 4.8, 0.6, 1.22, 0, deck, ship);                       // the deck
  for (const s of [-1, 1]) box(0.12, 0.35, 4.8, 0.6 + s * 0.94, 1.45, 0, dark, ship);      // the rails
  box(1.2, 0.8, 1.1, 0.6, 1.65, -1.7, dark, ship);                    // the cabin at the stern
  box(1.35, 0.12, 1.25, 0.6, 2.1, -1.7, wood, ship);
  box(0.18, 3.6, 0.18, 0.6, 3.0, 0.3, dark, ship);                    // the mast
  box(0.1, 0.1, 2.2, 0.6, 4.55, 0.3, dark, ship);                     // the yard
  const sl = new THREE.Group(); sl.position.set(0.6, 3.25, 0.3); ship.add(sl);
  box(0.06, 2.4, 2.0, 0, 0, 0, sail, sl);                             // the sail, with two bands of colour
  box(0.07, 0.35, 2.0, 0, 0.45, 0, stripe, sl); box(0.07, 0.35, 2.0, 0, -0.45, 0, stripe, sl);
  const fl = box(0.04, 0.35, 0.7, 0.6, 5.0, 0.6, flag, ship);         // the pennant
  box(0.05, 0.05, 2.9, 0.6, 2.5, 1.65, rope, ship).rotation.x = -0.75;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { ship, sail: sl, flag: fl };
  return g;
}

export function createVoyage({ play, kit, spawn, groundAt, avoid }) {
  const G = window.__GAME, st = play.state;
  if (!G || !G.key || !kit || !kit.scene) return null;
  // a flat place a little way from the start (and from the trader) for the pier and the ship. Grass and flowers do not
  // count (groundAt refuses a cell with a plant on it, and the wilds are all grass): the first solid block from above does
  const w = kit.world;
  const heightAt = w && play.isSolid ? (x, z) => { for (let y = Math.min(w.sy - 2, Math.floor(spawn.y) + 12); y > 1; y--) if (play.isSolid(w.get(x, y - 1, z))) return y; return null; } : groundAt;
  // the best place round the start: the flattest, nearest, and not on the trader; a few uneven cells are allowed (a crowded
  // base, a hillside), so every world has its ship
  let at = null, best = 1e9;
  for (const d of [10, 12, 9, 14, 16, 18, 21, 24]) for (let a = 3.6; a < 3.6 + 6.28; a += 0.3) {
    const x = Math.floor(spawn.x + Math.sin(a) * d), z = Math.floor(spawn.z + Math.cos(a) * d), y = heightAt(x, z);
    if (y === null || Math.abs(y - spawn.y) > 6) continue;
    if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 5) continue;
    let bad = 0;
    for (let dx = -3; dx <= 2; dx++) for (let dz = -3; dz <= 3; dz++) { const h = heightAt(x + dx, z + dz); if (h === null || Math.abs(h - y) > 1) bad++; }
    const score = bad * 10 + d + Math.abs(y - spawn.y) * 2;
    if (bad <= 8 && score < best) { best = score; at = { x: x + 0.5, y, z: z + 0.5, yaw: Math.atan2(spawn.x - x, spawn.z - z) + Math.PI / 2 }; }
  }
  if (!at) return null;
  const ship = buildShip();
  ship.position.set(at.x, at.y, at.z); ship.rotation.y = at.yaw;
  kit.scene.add(ship);
  const centre = new THREE.Vector3(0.6, 1.6, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), at.yaw).add(new THREE.Vector3(at.x, at.y, at.z));

  const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:20;pointer-events:none;direction:rtl;padding:5px 12px;border-radius:8px;background:rgba(8,11,16,.82);border:1px solid rgba(255,255,255,.28);color:#f1f4f8;font:700 13px/1.4 system-ui,sans-serif;white-space:nowrap;';
  tag.textContent = '⛵ سفينة الجزر · اضغط زر البناء'; tag.hidden = true;
  document.body.appendChild(tag);

  const here = ISLANDS.find((q) => q.key === G.key) || ISLANDS[2];
  const pic = (k) => new URL('../previews/' + k + '.webp', import.meta.url).href;
  const el = document.createElement('div');
  el.id = 'bwVoyage'; el.hidden = true;
  el.innerHTML = '<div class="vy"><h2>خريطة الجزر الخمس</h2><div class="sub">اختر الجزيرة اللي تبي تبحر لها، وسفينة الجزر توديك.</div><div class="sea"><svg class="lanes" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>'
    + ISLANDS.map((q) => `<button type="button" class="isl${q.key === here.key ? ' here' : ''}" data-k="${q.key}" style="left:${q.x}%;top:${q.y}%"${q.key === here.key ? ' disabled' : ''}><span class="pic"><img alt="" data-pic="${q.key}"></span><b>${q.name}</b><small>${q.about}</small></button>`).join('')
    + '<div class="sail"><div class="ship">⛵</div><div class="waves"></div><p></p></div></div>'
    + '<div class="row"><button type="button" class="go" disabled>اختر جزيرة</button><button type="button" class="back">رجوع</button></div><div class="msg"></div></div>';
  document.body.appendChild(el);
  // the sea lanes: dashed lines from this island to each of the others
  el.querySelector('.lanes').innerHTML = ISLANDS.filter((q) => q !== here).map((q) => `<line x1="${here.x}" y1="${here.y}" x2="${q.x}" y2="${q.y}" stroke="rgba(255,255,255,.75)" stroke-width="0.5" stroke-dasharray="1.6 1.4" vector-effect="non-scaling-stroke" style="stroke-width:2px"/>`).join('');
  const goBtn = el.querySelector('.go'), msg = el.querySelector('.msg');
  let pick = null, aimed = false, t = 0;

  function open() {
    play.stop();
    try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* nothing captured */ }
    for (const im of el.querySelectorAll('img[data-pic]')) if (!im.src) im.src = pic(im.dataset.pic);
    pick = null; msg.textContent = ''; goBtn.disabled = true; goBtn.textContent = 'اختر جزيرة';
    for (const b of el.querySelectorAll('.isl')) b.classList.remove('pick');
    el.classList.remove('sailing'); el.hidden = false;
  }
  function close() { el.hidden = true; if (window.__GAME_PAUSE) window.__GAME_PAUSE(); }
  function sail() {
    if (!pick) return;
    const net = window.__GAME_NET;
    if (net && net.role) { msg.textContent = 'أنت في غرفة مع ربعك: اطلع من الغرفة أول («العب مع ربعك»)، بعدين أبحر.'; return; }
    const sw = window.__GAME_SWITCH;
    if (!sw || !sw.goTo) { msg.textContent = 'السفينة تبحر لما تفتح اللعبة من صفحتها الأولى.'; return; }
    const q = ISLANDS.find((i) => i.key === pick);
    el.querySelector('.sail p').textContent = 'نبحر إلى ' + q.name + '…';
    el.classList.add('sailing');
    setTimeout(() => { const r = sw.goTo(pick); if (r !== true && typeof r === 'string') { el.classList.remove('sailing'); msg.textContent = r; } }, 1900);
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || el.classList.contains('sailing')) return;
    if (b.classList.contains('isl') && !b.disabled) {
      pick = b.dataset.k;
      for (const x of el.querySelectorAll('.isl')) x.classList.toggle('pick', x === b);
      goBtn.disabled = false; goBtn.textContent = '⛵ أبحر إلى ' + ISLANDS.find((q) => q.key === pick).name;
    } else if (b.classList.contains('go')) sail();
    else if (b.classList.contains('back')) close();
  });
  el.addEventListener('keydown', (e) => e.stopPropagation());

  // under the crosshair and near: the place button opens the map
  play.onUseFirst(() => { if (!aimed || st.modal) return false; open(); return true; });
  play.onTick((s, dt) => {
    t += dt;
    const u = ship.userData;
    u.ship.position.y = Math.sin(t * 1.4) * 0.05; u.ship.rotation.z = Math.sin(t * 1.1) * 0.015;
    u.sail.scale.z = 1 + Math.sin(t * 2.1) * 0.03; u.flag.rotation.y = Math.sin(t * 3.2) * 0.3;
    aimed = false;
    const dx = centre.x - st.pos.x, dz = centre.z - st.pos.z;
    if (Math.hypot(dx, dz) < 6.5 && !st.modal && el.hidden) {
      const cp = Math.cos(st.pitch), vx = -Math.sin(st.yaw) * cp, vy = Math.sin(st.pitch), vz = -Math.cos(st.yaw) * cp;
      const cy = centre.y - (st.pos.y + play.tuning.eye), tt = dx * vx + cy * vy + dz * vz;
      aimed = tt > 0 && dx * dx + cy * cy + dz * dz - tt * tt < 2.6 * 2.6;
    }
    if (tag.hidden === aimed) tag.hidden = !aimed;
  });
  const api = { ship, at, open, close, get aimed() { return aimed; }, el };
  window.__GAME_VOYAGE = api;
  return api;
}
