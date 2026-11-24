// Barari's wonders (the owner's «أفكار مبتكرة لتطوير عالم البراري»), made to work here; the ground they stand on is made
// by gen.js (lighthouses, sunken places, cloud islands and their vents) and every block of them is in blocks.js.
//
//   منارات المد والجزر      the stone of the tide inside each lighthouse lowers the sea round it (the water near the
//                           lighthouse goes, a sunken village or a sea cave with chests comes out) and raises it again
//   فصول الطبيعة           the land turns by itself: a flowering spring, a golden autumn, a snowy winter, each with its
//                           own colours and its own gifts (seeds, apples and wood, fish under the ice and fur)
//   طوطم صداقة الحيوانات   three logs stacked and carved with the axe: goats, bears and octopuses round it become
//                           friends; a goat brings wool or wood, a bear helps dig, an octopus makes swimming fast
//   جزر السحاب            hidden islands of earth and cloud over the forests and the snow; a warm vent on the ground
//                           beside each sends up a column of air that carries the player to it
//
//   const ideas = createIdeas({ play, kit, life, gen, world, terrain, scene, far, vitals: () => vitals });
//   ideas.placed(x, y, z, id, local)   from the world's onPlace;  ideas.digFactor  what digging takes now (a bear helps)
//   ideas.season                        { key, name, w } for the needs and the snow;  ideas.page()  for the quests page
//
// The tide is not written in the save (the sea is high again when the world is opened) and does not move in a shared game.

import * as THREE from 'three';
import { K, kitItem } from '../../shared/kit.js';
import { B } from './blocks.js';
import { SEASON } from './tiles.js';

const load = (k, d) => { try { const v = JSON.parse(window.localStorage.getItem(k) || 'null'); return v ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage may be closed: kept for this visit only */ } };
const dayKey = (d = new Date()) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
const DIRS = ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'];
/** Which way (dx, dz) points, in words (north is -z, as on the compass of the HUD). */
export const dirName = (dx, dz) => DIRS[((Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360 / 45) % 8) + 8) % 8];
const LOGS = new Set([B.OAK, B.PINE, B.PALM]);
export const SEASONS = [
  { key: 'spring', name: 'الربيع', hello: 'جا الربيع! الشجر نوّر والزهور طلعت، والزرع يعطيك حبوب أكثر.' },
  { key: 'autumn', name: 'الخريف', hello: 'جا الخريف! الورق صار ذهبي وأحمر، والشجر يطيّح تفاح وخشب أكثر.' },
  { key: 'winter', name: 'الشتا', hello: 'جا الشتا! الثلج غطّى البراري والبرد في كل مكان: البس فرو أو ولّع نار. اكسر الجليد وتصيد سمك تحته.' },
];
const SEASON_LEN = 600;                         // seconds of play a season lasts (a night slept is half of one)

export function createIdeas(o) {
  const { play, kit, life, gen, world, terrain, scene } = o, st = play.state;
  const api = { digFactor: 1, lavaFactor: 1, season: null };
  const guest = () => !!(life && life.share && life.share.mode === 'guest');
  const itemOfBlock = (id, n = 1) => { const it = play.itemOf ? play.itemOf(id) : null; return it ? { ...it, n } : null; };
  const give = (it) => it && play.give(it);

  // ================================================================ the tide
  const tides = new Map();                      // lighthouse key -> { L, state: 'high' | 'down' | 'low' | 'up', cells, layers, i, t }
  const lhFound = new Set(load('bw-barari-lh', []));
  let lhList = [], lhAt = null, beams = [];
  const tideOf = (L) => { let t = tides.get(L.key); if (!t) { t = { L, state: 'high', layers: null, i: 0, t: 0, healed: false }; tides.set(L.key, t); } return t; };
  /** The water that goes at low tide: round the sunken place, and a way from the lighthouse out to it. */
  function inRegion(L, x, z) {
    const S = L.site, ax = L.x + L.dx * 3, az = L.z + L.dz * 3, bx = S.x, bz = S.z;
    if (Math.hypot(x - bx, z - bz) <= S.R) return true;
    const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    return Math.hypot(x - ax - vx * t, z - az - vz * t) <= 4.5;
  }
  function regionBox(L) {
    const S = L.site, x0 = Math.floor(Math.min(L.x, S.x - S.R)) - 6, x1 = Math.ceil(Math.max(L.x, S.x + S.R)) + 6, z0 = Math.floor(Math.min(L.z, S.z - S.R)) - 6, z1 = Math.ceil(Math.max(L.z, S.z + S.R)) + 6;
    return { x0, x1, z0, z1 };
  }
  /** Every water cell of the region, by height (the top layer first). */
  function waterLayers(L) {
    const b = regionBox(L), by = new Map();
    for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
      if (!inRegion(L, x, z)) continue;
      for (let y = gen.SEA || 30; y >= 1; y--) if (world.get(x, y, z) === B.WATER) { let l = by.get(y); if (!l) by.set(y, l = []); l.push(x, z); }
    }
    return [...by.entries()].sort((a, b2) => b2[0] - a[0]);
  }
  /** At high tide: cells of the region that the game left empty under the sea (a dig read back from the save) fill again. */
  function heal(L) {
    const b = regionBox(L);
    for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
      if (!inRegion(L, x, z)) continue;
      const c = gen.column(x, z), h = Math.floor(c.hf);
      if (h >= c.wl) continue;
      // only a hole beside the sea (a dry room someone walled in under the water stays dry)
      for (let y = c.wl; y > h; y--) if (world.get(x, y, z) === 0 && [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(([a, b, q]) => world.get(x + a, y + b, z + q) === B.WATER)) terrain.setBlock(x, y, z, B.WATER);
    }
  }
  function fillLoot(L) {
    const k = 'bw-barari-tide-' + L.key;
    if (load(k, '') === dayKey()) return;
    const S = L.site, R = Math.random;
    S.chests.forEach((c, i) => {
      const box = kit.chestAt(c.x, c.y, c.z);
      if (box.some(Boolean)) return;
      const loot = [kitItem(K.GOLD, 2 + Math.floor(R() * 3)), kitItem(K.PEARL, 1 + Math.floor(R() * 3)), kitItem(K.SHELL, 2 + Math.floor(R() * 3)), kitItem(K.HAMOUR, 2)];
      if (i === 0) loot.push(kitItem(K.EMERALD, 1 + Math.floor(R() * 2)));
      if (R() < 0.35) loot.push(kitItem(K.LUCKY, 1));
      if (R() < 0.25) loot.push(kitItem(K.GOLDFISH, 1));
      loot.forEach((it, j) => { box[j * 2] = it; });
    });
    save(k, dayKey());
  }
  function toggleTide(L) {
    const T = tideOf(L);
    if (play.shared) { play.notice('المد ما يتحرك وانت في غرفة مع ربعك. جرّبه في عالمك.', false, 3200); return; }
    if (T.state === 'down' || T.state === 'up') { play.notice('البحر يتحرك… استنى شوي.', false, 1800); return; }
    if (T.state === 'high') {
      T.layers = waterLayers(L); T.i = 0; T.t = 0; T.state = 'down';
      play.notice(L.site.kind === 'village' ? 'لمست حجر المد… البحر ينحسر! تحت الماي قرية غرقانة فيها صناديق.' : 'لمست حجر المد… البحر ينحسر! تحت الماي كهف فيه كنز.', false, 5200);
    } else {
      T.layers = (T.layers || []).slice().reverse(); T.i = 0; T.t = 0; T.state = 'up';
      play.notice('البحر يرجع يرتفع. اطلع للسيف قبل لا يغطيك!', false, 3600);
    }
    if (play.sound) (play.sound.level || play.sound.ui)();
    st.tides = (st.tides || 0) + 1;
  }
  function stepTide(T, dt) {
    if ((T.t -= dt) > 0) return;
    T.t = 0.28;
    const layer = T.layers[T.i++];
    if (layer) {
      const [y, cells] = layer;
      for (let k = 0; k < cells.length; k += 2) {
        const x = cells[k], z = cells[k + 1], id = world.get(x, y, z);
        if (T.state === 'down' && id === B.WATER) terrain.setBlock(x, y, z, 0);
        else if (T.state === 'up' && id === 0) terrain.setBlock(x, y, z, B.WATER);
      }
      return;
    }
    if (T.state === 'down') {
      T.state = 'low'; fillLoot(T.L);
      play.notice('البحر انحسر! انزل للمكان اللي طلع وافتح الصناديق. لمّا تخلص، المس حجر المد مرة ثانية يرجع البحر.', false, 6000);
      T.layers = T.layers.slice();
    } else { T.state = 'high'; heal(T.L); }
  }
  // the beams of the lighthouses, turning at sunset and at night (seen from far: that is how a lighthouse is found)
  // a beam: three crossed fans of light from the lamp, bright at the lamp and fading to nothing 90 blocks out
  const beamGeo = new THREE.BufferGeometry();
  {
    const pos = [], col = [];
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI, cy = Math.cos(a) * 5.5, cz = Math.sin(a) * 5.5;
      pos.push(0, 0, 0, 90, cy, cz, 90, -cy, -cz); col.push(1, 1, 1, 0, 0, 0, 0, 0, 0);
    }
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); const a = new THREE.Mesh(beamGeo, beamMat), b = new THREE.Mesh(beamGeo, beamMat); b.rotation.y = Math.PI; g.add(a, b);
    g.visible = false; g.renderOrder = 4; a.frustumCulled = b.frustumCulled = false; scene.add(g); beams.push(g);
  }

  // ================================================================ the seasons
  let clock = +load('bw-barari-season', 0) || 0, slept = st.slept || 0, saveT = 0, farT = 0;
  const sIndex = () => Math.floor(clock / SEASON_LEN) % 3;
  let cur = sIndex();
  const w = new THREE.Vector3(cur === 0 ? 1 : 0, cur === 1 ? 1 : 0, cur === 2 ? 1 : 0);
  const applyW = () => { SEASON.w.value.copy(w); if (gen.setSeason) gen.setSeason(w); };
  applyW();
  api.season = { get key() { return SEASONS[cur].key; }, get name() { return SEASONS[cur].name; }, get winter() { return cur === 2; }, get left() { return Math.ceil((SEASON_LEN - (clock % SEASON_LEN)) / 60); } };
  /** Far land: draw its rings again with the new colours. */
  const redrawFar = () => { if (o.far) for (const R of o.far.rings) { R.cx = NaN; R.cz = NaN; } };
  // winter: the animals with fur give one more
  const baseDrops = new Map();
  function seasonDrops() {
    if (!life) return;
    for (const k of life.kinds) {
      if (!baseDrops.has(k)) baseDrops.set(k, k.drops);
      const d = baseDrops.get(k);
      k.drops = cur === 2 && d && d.some(([id]) => id === K.FUR) ? [...d, [K.FUR, 1]] : d;
    }
  }
  seasonDrops();
  play.onBreakAny((h) => {
    if (h.remote) return;
    const id = h.id, R = Math.random();
    if (cur === 0) {
      if ((id === B.TUFT || id === B.REED || id === B.SHRUB) && R < 0.5) give(kitItem(K.SEEDS, 1));
      if (id === B.FLOWER_R || id === B.FLOWER_Y || id === B.FLOWER_B) { give(itemOfBlock(id)); if (R < 0.6) give(kitItem(K.SEEDS, 1)); }
    } else if (cur === 1) {
      if (id === B.OAK_LEAVES && R < 0.25) { give(kitItem(K.APPLE, 1)); if (!st.gotFallApple) { st.gotFallApple = true; play.notice('الخريف: طاحت تفاحة! الشجر يطيّح تفاح أكثر في الخريف.', false, 3200); } }
      if (LOGS.has(id) && R < 0.3) give(itemOfBlock(id));
    } else {
      if (id === B.ICE && R < 0.45) { give(kitItem(R < 0.08 ? K.HAMOUR : K.FISH, 1)); play.notice('صدت سمكة من تحت الجليد!', false, 2400); st.iceFish = (st.iceFish || 0) + 1; }
      if ((id === B.SNOWBLOCK || id === B.SNOW) && R < 0.5) give(itemOfBlock(B.SNOWBLOCK));
    }
  });

  // ================================================================ totems and the animals that become friends
  const totems = new Map();                     // "x,y,z" of the head -> { x, y, z, spawnT }
  const FRIEND = { goat: 'العنز', bear: 'الدب', polarbear: 'الدب الأبيض', octopus: 'الأخطبوط' };
  const friendKind = (k) => (k === 'polarbear' ? 'bear' : k);
  const met = new Set(load('bw-barari-friends', []));
  let goatT = 30, rideMine = false, swimWas = null, bearSaid = false, octoSaid = false, stackSaid = 0;
  const isLog = (id) => LOGS.has(id);
  function stackAt(x, y, z) {
    let b = y, t = y;
    while (isLog(world.get(x, b - 1, z))) b--;
    while (isLog(world.get(x, t + 1, z))) t++;
    return { b, t, n: t - b + 1 };
  }
  function addTotem(x, y, z) { const k = x + ',' + y + ',' + z; if (!totems.has(k)) totems.set(k, { x, y, z, spawnT: 2 }); }
  function carve(h) {
    const s = stackAt(h.x, h.y, h.z);
    if (s.n !== 3) { play.notice('الطوطم يبيله 3 جذوع بالضبط فوق بعض. هذا العمود ' + s.n + '.', false, 2600); return true; }
    play.put(h.x, s.b, h.z, B.TOTEM); play.put(h.x, s.b + 1, h.z, B.TOTEM); play.put(h.x, s.t, h.z, B.TOTEM_TOP);
    addTotem(h.x, s.t, h.z);
    st.totems = (st.totems || 0) + 1;
    play.notice('نحت طوطم صداقة! العنز والدب والأخطبوط اللي حوله بيصيرون ربعك: العنز يجيب لك صوف وخشب، الدب يساعدك تحفر، والأخطبوط يسرّع سباحتك.', false, 7000);
    if (play.sound) (play.sound.level || play.sound.ui)();
    return true;
  }
  /** Make a creature of `key` near (x, z) whatever land it is, for a totem's call. */
  function spawnFree(key, x, z) {
    const k = life.kinds.find((q) => q.key === key);
    if (!k) return null;
    const wh = Object.getOwnPropertyDescriptor(k, 'where');
    k.where = null;
    try { return life.spawnAt(key, x, z); } finally { if (wh) Object.defineProperty(k, 'where', wh); else delete k.where; }
  }
  const friendsOf = (kind) => (life ? life.ents.filter((e) => !e.dead && e.totemFriend && friendKind(e.k.key) === kind) : []);
  function totemTick(T, dt) {
    if (world.get(T.x, T.y, T.z) !== B.TOTEM_TOP) { totems.delete(T.x + ',' + T.y + ',' + T.z); return; }
    for (const e of life.ents) {
      if (e.dead || !FRIEND[e.k.key]) continue;
      const d = Math.hypot(e.x - T.x, e.z - T.z);
      if (!e.totemFriend && d < 24) {
        e.totemFriend = true; e.tamed = true; e.love = 600; e.owner = null; e.flee = 0;
        const kind = friendKind(e.k.key);
        if (!met.has(kind)) { met.add(kind); save('bw-barari-friends', [...met]); play.notice(FRIEND[e.k.key] + ' صار صديقك عند الطوطم! ' + (kind === 'goat' ? 'بيجيب لك صوف وخشب كل شوي.' : kind === 'bear' ? 'وهو جنبك تحفر أسرع.' : 'في الماي جنبه تسبح أسرع.'), false, 5200); }
      }
      if (e.totemFriend && e.love < 120 && d < 40) e.love = 600;
    }
    // the totem calls one of each kind that is not about yet
    if ((T.spawnT -= dt) > 0) return;
    T.spawnT = 20;
    for (const key of ['goat', 'bear', 'octopus']) {
      if (friendsOf(key).length || life.ents.some((e) => !e.dead && friendKind(e.k.key) === key && Math.hypot(e.x - T.x, e.z - T.z) < 30)) continue;
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, r = key === 'octopus' ? 6 + Math.random() * 26 : 4 + Math.random() * 7;
        if (spawnFree(key, T.x + Math.cos(a) * r, T.z + Math.sin(a) * r)) break;
      }
    }
  }
  function helpTick(dt) {
    const near = (kind, r) => friendsOf(kind).some((e) => Math.hypot(e.x - st.pos.x, e.z - st.pos.z) < r && Math.abs(e.y - st.pos.y) < 6);
    // a goat brings wool or wood now and then
    if (near('goat', 10) && (goatT -= dt) <= 0) {
      goatT = 40;
      const wood = Math.random() < 0.5, it = wood ? itemOfBlock(B.OAK, 2) : kitItem(K.WOOL, 1);
      if (give(it)) play.notice(wood ? 'العنز صديقتك جابت لك خشب.' : 'العنز صديقتك جابت لك صوف.', false, 2600);
    }
    // a bear beside the player: digging is quicker
    const bear = near('bear', 9);
    api.digFactor = bear ? 0.5 : 1;
    if (bear && st.dig.on && !bearSaid) { bearSaid = true; play.notice('الدب صديقك يساعدك: الحفر صار أسرع وهو جنبك.', false, 3200); }
    // an octopus near in the water: swimming is fast
    const octo = st.inWater && friendsOf('octopus').some((e) => Math.hypot(e.x - st.pos.x, e.z - st.pos.z) < 16);
    if (octo && (!st.ride || rideMine)) {
      if (!rideMine) { swimWas = play.tuning.swim; play.tuning.swim = 5.6; }
      st.ride = 2.3; rideMine = true;
      if (!octoSaid) { octoSaid = true; play.notice('الأخطبوط صديقك يدفّك: تسبح أسرع وانت جنبه.', false, 3200); }
    } else if (rideMine) { st.ride = 0; rideMine = false; if (swimWas !== null) play.tuning.swim = swimWas; }
  }

  // ================================================================ cloud islands and their columns of warm air
  let isles = [], islesAt = null;
  const isleFound = new Set(load('bw-barari-isles', []));
  const ventSaid = new Set();
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const NP = 80, airs = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(NP * 3), sp = new Float32Array(NP);
    for (let k = 0; k < NP; k++) sp[k] = 3 + Math.random() * 5;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.45, map: dotTex, color: 0xfff4e0, transparent: true, opacity: 0.85, depthWrite: false }));
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    pts.frustumCulled = false; col.frustumCulled = false; pts.visible = col.visible = false;
    scene.add(pts, col);
    airs.push({ pts, col, pos, sp, isle: null });
  }
  function seatAir(A, I) {
    A.isle = I;
    if (!I) { A.pts.visible = A.col.visible = false; return; }
    const v = I.vent, h = I.top + 5 - v.y;
    A.col.scale.y = h; A.col.position.set(v.x + 0.5, v.y + 1 + h / 2, v.z + 0.5); A.col.visible = true; A.pts.visible = true;
    for (let k = 0; k < NP; k++) { const a = Math.random() * 6.283, r = Math.random() * 1.3; A.pos[k * 3] = v.x + 0.5 + Math.cos(a) * r; A.pos[k * 3 + 1] = v.y + 1 + Math.random() * h; A.pos[k * 3 + 2] = v.z + 0.5 + Math.sin(a) * r; }
  }
  function fillIsle(I) {
    const k = 'bw-barari-isle-' + I.key;
    if (load(k, '') === dayKey()) return;
    const box = kit.chestAt(I.chest.x, I.chest.y, I.chest.z);
    if (box.some(Boolean)) return;
    const R = Math.random, loot = [kitItem(K.EMERALD, 1 + Math.floor(R() * 2)), kitItem(K.AMETHYST, 2), kitItem(K.FEATHER, 4), kitItem(K.GOLD, 2)];
    if (R() < 0.4) loot.push(kitItem(K.GOLDEN_APPLE, 1));
    if (R() < 0.18) loot.push(kitItem(K.WINGS, 1));
    if (R() < 0.3) loot.push(kitItem(K.LUCKY, 1));
    loot.forEach((it, j) => { box[j * 2] = it; });
    save(k, dayKey());
  }
  let lifted = false;
  function isleTick(dt) {
    const p = st.pos;
    lifted = false;
    for (const I of isles) {
      const v = I.vent, dx = p.x - (v.x + 0.5), dz = p.z - (v.z + 0.5), dd = Math.hypot(dx, dz);
      // the column lifts whoever stands in it, and holds them at the top beside the path of cloud
      if (dd < 1.7 && p.y >= v.y + 0.5 && p.y < I.top + 4.5 && !st.flying && !st.boat) {
        lifted = true;
        const H = I.top + 1.35;                                                 // where the feet float: level with the path of cloud
        st.vel.y = p.y < H - 1.2 ? Math.max(st.vel.y, 8) : (H - p.y) * 3 + 27 * Math.min(dt, 0.05);
        if (!ventSaid.has('in')) { ventSaid.add('in'); play.notice('الهوا الدافي يرفعك! لمّا توصل فوق، امشِ على الغيم للجزيرة.', false, 4200); }
      }
      if (dd < 40 && !ventSaid.has(I.key)) { ventSaid.add(I.key); play.notice('عمود هوا دافي يطلع من الأرض… فوق الغيم جزيرة مخفية! ادخل العمود وبيرفعك.', false, 5200); }
      const ci = Math.hypot(p.x - I.x, p.z - I.z);
      if (ci < I.R + 2 && p.y > I.top - 1 && p.y < I.top + 6) {
        if (!isleFound.has(I.key)) { isleFound.add(I.key); save('bw-barari-isles', [...isleFound]); st.xp = (st.xp || 0) + 25; play.notice('وصلت جزيرة السحاب! (+25 خبرة) فيها زهرة السحاب وتوت السما وصندوق كنز.', false, 5600); if (play.sound && play.sound.level) play.sound.level(); }
        fillIsle(I);
      }
    }
    // the air rises in the columns near the player
    for (const A of airs) {
      if (!A.isle) continue;
      const I = A.isle, v = I.vent, h = I.top + 5 - v.y;
      for (let k = 0; k < NP; k++) {
        let y = A.pos[k * 3 + 1] + A.sp[k] * dt;
        if (y > v.y + 1 + h) { y = v.y + 1; const a = Math.random() * 6.283, r = Math.random() * 1.3; A.pos[k * 3] = v.x + 0.5 + Math.cos(a) * r; A.pos[k * 3 + 2] = v.z + 0.5 + Math.sin(a) * r; }
        A.pos[k * 3 + 1] = y;
      }
      A.pts.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ================================================================ the place button, what is put down, every frame
  play.onUseFirst((h) => {
    if (h && h.id === B.TIDE_STONE) {
      const L = gen.lighthousesNear(h.x, h.z, 6)[0];
      if (L) toggleTide(L);
      return true;
    }
    const s = st.slots[st.sel];
    if (h && isLog(h.id) && s && !s.empty && (s.key === 'axe' || s.dig === 'wood') && stackAt(h.x, h.y, h.z).n === 3) return carve(h);
    return false;
  });
  let placedSeen = st.placed;
  api.placed = (x, y, z, id) => {
    const local = st.placed !== placedSeen;      // placed by this player's own hand (the controller counted it), not read back or sent
    placedSeen = st.placed;
    if (id === B.TOTEM_TOP) addTotem(x, y, z);
    if (local && isLog(id) && stackAt(x, y, z).n === 3 && stackSaid < 2) { stackSaid++; play.notice('عمود من 3 جذوع! اضغط عليه زر البناء والفأس بيدك وتنحته طوطم صداقة.', false, 4800); }
  };
  let slow = 0;
  play.onTick((s, dt) => {
    if (dt <= 0) return;
    const p = st.pos;
    // the seasons go on with the play; a night slept is half a season
    if (!st.modal) clock += dt;
    if ((st.slept || 0) > slept) { clock += SEASON_LEN / 2 * ((st.slept || 0) - slept); slept = st.slept || 0; }
    if ((saveT += dt) > 10) { saveT = 0; save('bw-barari-season', Math.round(clock)); }
    const now = sIndex();
    if (now !== cur) { cur = now; seasonDrops(); play.notice(SEASONS[cur].hello, false, 6500); farT = 0; }
    const tx = cur === 0 ? 1 : 0, ty = cur === 1 ? 1 : 0, tz = cur === 2 ? 1 : 0, k = Math.min(1, dt / 3);
    if (Math.abs(w.x - tx) + Math.abs(w.y - ty) + Math.abs(w.z - tz) > 0.002) {
      w.x += (tx - w.x) * k; w.y += (ty - w.y) * k; w.z += (tz - w.z) * k;
      if (Math.abs(w.x - tx) + Math.abs(w.y - ty) + Math.abs(w.z - tz) < 0.01) w.set(tx, ty, tz);
      applyW();
      if ((farT -= dt) <= 0 || (w.x === tx && w.y === ty && w.z === tz)) { farT = 1.5; redrawFar(); }
    }
    // the tides that are moving
    for (const T of tides.values()) if (T.state === 'down' || T.state === 'up') stepTide(T, dt);
    if (life && !guest()) helpTick(dt);
    isleTick(dt);
    // twice a second: what is near
    if ((slow -= dt) > 0) return;
    slow = 0.5;
    if (!lhAt || Math.hypot(p.x - lhAt.x, p.z - lhAt.z) > 60) { lhAt = { x: p.x, z: p.z }; lhList = gen.lighthousesNear(p.x, p.z, 700); }
    for (const L of lhList) {
      const d = Math.hypot(p.x - L.x, p.z - L.z);
      if (d < 30 && !lhFound.has(L.key)) { lhFound.add(L.key); save('bw-barari-lh', [...lhFound]); play.notice('منارة على البحر! داخلها حجر المد الأزرق: اضغط عليه زر البناء والبحر ينحسر ويبيّن اللي تحته.', false, 6500); }
      const T = tides.get(L.key);
      if (d < 70 && (!T || (T.state === 'high' && !T.healed))) { const t2 = tideOf(L); t2.healed = true; heal(L); }
    }
    // the beams: the three nearest lighthouses, at sunset and at night
    const sk = window.__GAME_SKY || {}, dark = sk.time === 'night' || sk.time === 'sunset' || sk.rain;
    const lit = nearLH && !lhList.includes(nearLH) ? [...lhList, nearLH] : lhList;      // (the nearest one found farther off shines too: it shows the way)
    beams.forEach((g, i) => { const L = lit[i]; g.visible = !!(L && dark); if (L) g.position.set(L.x + 0.5, L.y + L.H + 1.5, L.z + 0.5); });
    // the cloud islands near, and the columns of air of the three nearest
    if (!islesAt || Math.hypot(p.x - islesAt.x, p.z - islesAt.z) > 40) { islesAt = { x: p.x, z: p.z }; isles = gen.islesNear(p.x, p.z, 260); }
    airs.forEach((A, i) => { const I = isles[i] || null; if (A.isle !== I) seatAir(A, I); });
    for (const T of totems.values()) if (life && !guest() && Math.hypot(T.x - p.x, T.z - p.z) < 64) totemTick(T, 0.5);
  });
  // the beams turn every frame
  play.onTick((s, dt) => { for (const g of beams) if (g.visible) g.rotation.y += dt * 0.7; });

  // ================================================================ the quests page: what there is and where
  let nearLH = null, nearAt = null, searching = false;
  /** The nearest lighthouse within 1600, looked for a cell at a time (each cell of the coast takes a moment to read). */
  function findNearest() {
    if (searching) return;
    const p = st.pos;
    if (nearAt && Math.hypot(p.x - nearAt.x, p.z - nearAt.z) < 200) return;
    searching = true; nearAt = { x: p.x, z: p.z };
    const cells = [], LC = gen.LC || 320;
    for (let gz = Math.floor((p.z - 1600) / LC); gz <= Math.floor((p.z + 1600) / LC); gz++) for (let gx = Math.floor((p.x - 1600) / LC); gx <= Math.floor((p.x + 1600) / LC); gx++) cells.push([Math.hypot((gx + 0.5) * LC - p.x, (gz + 0.5) * LC - p.z), gx, gz]);
    cells.sort((a, b) => a[0] - b[0]);
    let best = null, i = 0;
    const step = () => {
      const t0 = performance.now();
      while (i < cells.length && performance.now() - t0 < 4) {
        const [, gx, gz] = cells[i++], L = gen.lighthouseOf(gx, gz);
        if (L) { const d = Math.hypot(L.x - p.x, L.z - p.z); if (!best || d < best.d) best = { L, d }; }
        if (best && i < cells.length && cells[i][0] - LC > best.d) i = cells.length;      // nothing nearer is left
      }
      if (i < cells.length) setTimeout(step, 30); else { nearLH = best ? best.L : null; searching = false; }
    };
    setTimeout(step, 0);
  }
  play.onTick(() => { if (st.played > 4) findNearest(); });
  const where = (x, z) => { const dx = x - st.pos.x, dz = z - st.pos.z; return Math.round(Math.hypot(dx, dz)) + ' مكعب جهة ' + dirName(dx, dz); };
  api.page = () => {
    const L = nearLH, I = isles[0] || gen.islesNear(st.pos.x, st.pos.z, 700)[0];
    const T = L ? tides.get(L.key) : null, sea = SEASONS[cur];
    const gifts = cur === 0 ? 'الزرع والزهور تعطيك حبوب أكثر، والشجر منوّر.' : cur === 1 ? 'الورق يطيّح تفاح، والجذوع تعطيك خشب زيادة.' : 'برد في كل مكان (البس فرو أو ولّع نار)، الجليد تحته سمك، والحيوانات تعطي فرو أكثر.';
    return '<h3>أسرار البراري</h3><ol class="quests">'
      + `<li class="${lhFound.size ? 'done' : 'now'}">منارات المد والجزر<small>${L ? 'أقرب منارة: ' + where(L.x, L.z) + '. ' : searching ? 'أدوّر أقرب منارة… ' : 'المنارات على سيف البحر. '}داخلها حجر المد: يحسّر البحر ويبيّن قرية غرقانة أو كهف فيه كنز، ومرة ثانية يرجّعه.${T && T.state === 'low' ? ' البحر منحسر الحين.' : ''} شفت ${lhFound.size}.</small></li>`
      + `<li class="now">فصول الطبيعة: الحين ${sea.name}<small>${gifts} الفصل يتغيّر بروحه بعد ${api.season.left} دقايق لعب تقريبًا (والنوم ليلة يقدّمه).</small></li>`
      + `<li class="${totems.size ? 'done' : 'now'}">طوطم صداقة الحيوانات<small>حط 3 جذوع فوق بعض، واضغط عليها زر البناء والفأس بيدك. العنز يجيب صوف وخشب، الدب يساعدك تحفر، والأخطبوط يسرّع سباحتك في الماي.${met.size ? ' ربعك: ' + [...met].map((k) => FRIEND[k]).join('، ') + '.' : ''}</small></li>`
      + `<li class="${isleFound.size ? 'done' : 'now'}">جزر السحاب<small>مخفية فوق الغابة والثلج. دوّر عمود الهوا الدافي على الأرض وادخله.${I ? ' أقرب عمود: ' + where(I.vent.x, I.vent.z) + '.' : ''} وصلت ${isleFound.size}.</small></li></ol>`;
  };
  api.tides = tides; api.totems = totems; api.toggleTide = toggleTide; api.setClock = (t) => { clock = t; };
  return api;
}
