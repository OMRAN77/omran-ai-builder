// The farm and the sea: planting seeds, watering, harvest; fishing with a rod; marking places on the map.
//
//   const farm = createFarm({ play, kit, world });     (the bag makes it)
//
// Seeds in the hand + the place button on the top of a block: a crop is planted above it. A crop grows in four
// steps; watered (the can, rain, or water within three blocks) it grows about three times faster. The ripe crop
// is dug for wheat and more seeds. The watering can is filled at any water and holds ten waterings.
// The rod + the place button on water: the float goes out; when it dips, press again to land the fish.
// The magic map + the place button: a mark is set where the player stands; marks stand as beams of light.

import * as THREE from 'three';
import { K, kitItem } from './kit.js';
import { EMPTY } from './play.js';

const GROW = 28;                       // seconds of growth per step, watered (dry: three times as long)
const CAN_FULL = 10;
const MARK_COLORS = ['#ff5a5a', '#ffb84a', '#f6e04a', '#6ae07a', '#5ad0ff', '#7a8aff', '#d06aff', '#ff8ad0', '#ffffff'];
// what bites: weight, item. Rare things are rare.
const CATCH = [[30, K.FISH], [18, K.SAFI], [14, K.HAMOUR], [12, K.KANAD], [10, K.SHERI], [8, K.SHRIMP], [5, K.SHELL], [2, K.PEARL], [1, K.GOLDFISH]];

export function createFarm({ play, kit, world }) {
  const st = play.state, w = kit.world, scene = kit.scene;
  const key = (x, y, z) => x + ',' + y + ',' + z;
  const guest = () => !!(window.__GAME_NET && window.__GAME_NET.role === 'guest');      // the host grows the fields of a shared game
  const held = () => st.slots[st.sel];
  const eye = () => new THREE.Vector3(st.pos.x, st.pos.y + play.tuning.eye, st.pos.z);
  const look = () => { const cp = Math.cos(st.pitch); return new THREE.Vector3(-Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp); };
  /** The first water cell the player looks at within reach (null if a solid block or nothing comes first). */
  const waterAhead = (reach) => { const h = play.raycast(eye(), look(), reach, (id) => play.isLiquid(id) || (id !== 0 && play.isSolid(id))); return h && play.isLiquid(h.id) ? h : null; };

  // ---------------------------------------------------------------- the fields
  const crops = new Map();               // cell -> { x, y, z, stage, grow, wet }
  const isCrop = (id) => id >= K.CROP0 && id <= K.CROP3;
  const placed0 = kit.placed.bind(kit), broke0 = kit.broke.bind(kit);
  kit.placed = (x, y, z, id, yaw) => { placed0(x, y, z, id, yaw); if (isCrop(id)) { const k = key(x, y, z), was = crops.get(k); crops.set(k, { x, y, z, stage: id - K.CROP0, grow: 0, wet: was ? was.wet : 0 }); } else crops.delete(key(x, y, z)); };
  kit.broke = (h) => { broke0(h); crops.delete(key(h.x, h.y, h.z)); };
  const nearWater = (c) => { for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = -1; dy <= 0; dy++) if (play.isLiquid(w.get(c.x + dx, c.y + dy, c.z + dz))) return true; return false; };
  let farmT = 0;
  play.onTick((s, dt) => {
    if (dt <= 0 || (st.modal && !play.shared) || guest()) return;
    if ((farmT += dt) < 0.5) return;
    const step = farmT; farmT = 0;
    const rain = !!(window.__GAME_SKY && window.__GAME_SKY.rain);
    for (const c of [...crops.values()]) {
      if (c.stage >= 3) continue;
      if (w.get(c.x, c.y, c.z) !== K.CROP0 + c.stage) { crops.delete(key(c.x, c.y, c.z)); continue; }
      const wet = c.wet > 0 || rain || (c.water ??= nearWater(c));
      if (c.wet > 0) c.wet -= step;
      c.grow += step * (wet ? 1 : 1 / 3);
      if (c.grow >= GROW) { c.grow = 0; play.put(c.x, c.y, c.z, K.CROP0 + c.stage + 1); }
    }
  });
  // what the field gives: the ripe crop wheat (the dig itself) and seeds; a green one gives its seed back
  play.onBreakAny((h) => {
    if (h.remote || h.id !== K.CROP3) return;
    play.give(kitItem(K.SEEDS, 1 + Math.floor(Math.random() * 2)));
    if (Math.random() < 0.5) play.give(kitItem(K.WHEAT, 1));
    st.harvested = (st.harvested || 0) + 1;
  });
  function plant(h, s) {
    if (!h || h.ny !== 1 || !play.isSolid(h.id) || isCrop(h.id)) return false;
    const y = h.y + 1;
    if (!w.inb(h.x, y, h.z) || w.get(h.x, y, h.z) !== 0) return false;
    if (!play.put(h.x, y, h.z, K.CROP0)) return false;
    s.n--; play.setSlot(st.sel, s.n > 0 ? s : EMPTY);
    if (play.sound) play.sound.place();
    if (!st.planted) play.notice('زرعت. اسقِ الزرع بالمرشّة (أو خلّه قريب من ماي) يكبر أسرع، ولما يصفرّ احصده.', false, 6000);
    st.planted = (st.planted || 0) + 1;
    return true;
  }
  function water(h, s) {
    const wet = waterAhead(play.tuning.reach);
    if (wet && (!h || wet.t < h.t + 0.01)) { s.water = CAN_FULL; play.changed(); play.notice('عبّيت المرشّة: تكفي ' + CAN_FULL + ' مرّات.', false, 2400); if (play.sound) play.sound.splash(); return true; }
    if (!h || !isCrop(h.id)) { play.notice(s.water > 0 ? 'وجّهها على زرع عشان تسقيه.' : 'المرشّة فاضية: وجّهها على ماي وعبّها.', false, 2400); return true; }
    if (!(s.water > 0)) { play.notice('المرشّة فاضية: وجّهها على ماي وعبّها.', false, 2400); return true; }
    s.water--; play.changed();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const c = crops.get(key(h.x + dx, h.y, h.z + dz)); if (c) c.wet = 90; }
    st.watered = (st.watered || 0) + 1;
    if (play.sound) play.sound.splash();
    play.notice(h.id === K.CROP3 ? 'هذا ناضج: احصده.' : 'سقيت الزرع. باقي في المرشّة ' + s.water + '.', false, 2000);
    return true;
  }

  // ---------------------------------------------------------------- fishing
  const float = new THREE.Group();
  { const red = new THREE.MeshStandardMaterial({ color: 0xe0344a, roughness: 0.5 }), white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), red), b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), white), c = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), red);
    a.position.y = 0.06; b.position.y = -0.05; c.position.y = 0.18; float.add(a, b, c); }
  float.visible = false; scene.add(float);
  let cast = null;                       // { x, y, z, t, bite, window }
  const reel = (text) => { cast = null; float.visible = false; if (text) play.notice(text, false, 2400); };
  function fish() {
    if (cast) {
      if (cast.biting > 0) {
        let r = Math.random() * CATCH.reduce((a, c) => a + c[0], 0), id = K.FISH;
        for (const [wt, it] of CATCH) { if ((r -= wt) <= 0) { id = it; break; } }
        const it = kitItem(id, 1);
        reel(''); const where = play.give(it);
        st.caught = (st.caught || 0) + 1; st.xp = (st.xp || 0) + (id === K.GOLDFISH || id === K.PEARL ? 6 : 2);
        play.notice(where ? 'صدت ' + it.name + (id === K.GOLDFISH ? '! نادرة وايد.' : '!') : 'صدت ' + it.name + ' بس حقيبتك مليانة.', false, 3200);
        if (play.sound) play.sound.ui();
      } else reel('سحبت السنارة.');
      return true;
    }
    const h = waterAhead(10);
    if (!h) { play.notice('وجّه السنارة على ماي.', false, 2200); return true; }
    let y = h.y; while (play.isLiquid(w.get(h.x, y + 1, h.z))) y++;
    cast = { x: h.x + 0.5, y: y + 0.88, z: h.z + 0.5, t: 0, bite: 3 + Math.random() * 6 * (window.__GAME_SKY && window.__GAME_SKY.rain ? 0.6 : 1), biting: 0 };
    float.position.set(cast.x, cast.y, cast.z); float.visible = true;
    if (play.sound) play.sound.splash();
    if (!st.castOnce) { st.castOnce = true; play.notice('انتظر لين العوّامة تغطس، بعدين اضغط زر البناء بسرعة.', false, 5000); }
    return true;
  }
  play.onTick((s, dt) => {
    if (!cast) return;
    const s0 = held();
    if (!s0 || s0.id !== K.ROD) { reel(''); return; }
    if (Math.hypot(cast.x - st.pos.x, cast.z - st.pos.z) > 16) { reel('بعدت عن العوّامة.'); return; }
    cast.t += dt;
    float.position.y = cast.y + Math.sin(cast.t * 2.4) * 0.03 - (cast.biting > 0 ? 0.16 : 0);
    if (cast.biting > 0) { if ((cast.biting -= dt) <= 0) { cast.bite = cast.t + 3 + Math.random() * 5; play.notice('هربت السمكة. انتظر وحدة ثانية.', false, 2000); } }
    else if (cast.t >= cast.bite) { cast.biting = 1.4; play.notice('غطست! اضغط زر البناء!', false, 1300); if (play.sound) play.sound.splash(); }
  });

  // ---------------------------------------------------------------- the boat
  const boat = new THREE.Group();
  { const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.85 }), dark = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.9 }), sail = new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.9, side: THREE.DoubleSide });
    const add = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); boat.add(b); return b; };
    add(1.1, 0.12, 2.4, 0, -0.5, 0, dark);                                                   // the bottom, under the water
    for (const sx of [-1, 1]) add(0.1, 0.66, 2.4, sx * 0.55, -0.16, 0, wood);                // the sides, standing out of it
    add(1.2, 0.66, 0.1, 0, -0.16, -1.2, wood); const bow = add(0.8, 0.66, 0.5, 0, -0.14, 1.38, wood); bow.scale.x = 0.7;
    add(1.1, 0.06, 0.12, 0, 0.18, -1.2, dark); for (const sx of [-1, 1]) add(0.12, 0.06, 2.4, sx * 0.55, 0.18, 0, dark);   // the rim
    add(1.0, 0.08, 0.3, 0, -0.04, -0.5, dark);                                               // the seat
    // oars resting on the sides (no mast: it would stand in front of the player's eyes)
    for (const sx of [-1, 1]) { const o = add(0.06, 0.06, 1.5, sx * 0.66, 0.22, -0.2, dark); o.rotation.y = sx * 0.25; add(0.04, 0.2, 0.36, sx * 0.84, 0.12, -0.85, dark); } void sail; }
  boat.visible = false; scene.add(boat);
  function useBoat() {
    if (st.boat) { play.leaveBoat(); return true; }
    const h = waterAhead(6), here = play.surfaceAt(st.pos.x, st.pos.z, st.pos.y + 0.5);
    const at = h ? [h.x + 0.5, h.z + 0.5, h.y] : here !== null ? [st.pos.x, st.pos.z, st.pos.y + 0.5] : null;
    if (!at || !play.enterBoat(at[0], at[1], at[2])) { play.notice('القارب يبي ماي: وجّهه على البحر أو بحيرة وانت جنبها.', false, 2800); return true; }
    st.sailed = (st.sailed || 0) + 1;
    play.notice('ركبت القارب. تحرّك وين ما تبي، والركض يسرّع. القفز (أو زر البناء بالقارب) ينزّلك على البر.', false, 5200);
    return true;
  }
  let sailT = 0;
  play.onTick((s, dt) => {
    boat.visible = !!st.boat;
    if (!st.boat) return;
    sailT += dt;
    boat.position.set(st.pos.x, st.pos.y + Math.sin(sailT * 1.8) * 0.03, st.pos.z);
    boat.rotation.set(Math.sin(sailT * 1.3) * 0.02, st.yaw + Math.PI, Math.sin(sailT * 1.1) * 0.025);
    st.sailedDist = (st.sailedDist || 0) + st.moving * dt;
  });

  // ---------------------------------------------------------------- marks on the map
  const MK = 'bw-marks-' + world;
  let marks = [];
  try { const m = JSON.parse(window.localStorage.getItem(MK) || '[]'); if (Array.isArray(m)) marks = m.filter((q) => q && [q.x, q.y, q.z].every(Number.isFinite)).slice(0, 9); } catch (e) { /* storage may be closed or hold something else */ }
  const keepMarks = () => { try { window.localStorage.setItem(MK, JSON.stringify(marks)); } catch (e) { /* not kept */ } };
  const beams = new THREE.Group(); scene.add(beams);
  function drawBeams() {
    while (beams.children.length) { const b = beams.children.pop(); b.geometry.dispose(); b.material.dispose(); }
    marks.forEach((m, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: m.c, transparent: true, opacity: 0.45, depthWrite: false, fog: false });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 48, 0.34), mat); b.position.set(m.x + 0.5, m.y + 24, m.z + 0.5); b.renderOrder = 2; beams.add(b);
      void i;
    });
  }
  drawBeams();
  function mark() {
    if (marks.length >= 9) { play.notice('عندك 9 علامات. امسح وحدة من صفحة المهام (E) قبل.', false, 3200); return true; }
    const used = new Set(marks.map((m) => m.n)); let n = 1; while (used.has(n)) n++;
    marks.push({ n, x: Math.floor(st.pos.x), y: Math.floor(st.pos.y), z: Math.floor(st.pos.z), c: MARK_COLORS[(n - 1) % MARK_COLORS.length] });
    keepMarks(); drawBeams();
    play.notice('حطّيت علامة ' + n + ' هني. تشوفها عمود نور، وعلى الخريطة، وفي صفحة المهام.', false, 4200);
    if (play.sound) play.sound.ui();
    return true;
  }
  /** Which way, in words, from the player to (x, z). */
  function towards(x, z) {
    const dx = x - st.pos.x, dz = z - st.pos.z, d = Math.hypot(dx, dz);
    if (d < 3) return 'هني';
    const a = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360, names = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
    return Math.round(d) + ' مكعب، ' + names[Math.round(a / 45) % 8];
  }

  // ---------------------------------------------------------------- the place button with these in the hand
  play.onUseFirst((h) => {
    const s = held();
    if (!s || !s.id) return false;
    if (s.id === K.SEEDS && s.n > 0 && !(window.__GAME_LIFE && window.__GAME_LIFE.life && window.__GAME_LIFE.life.aimed)) return plant(h, s);
    if (s.id === K.CAN) return water(h, s);
    if (s.id === K.ROD) return fish();
    if (s.id === K.BOAT) return useBoat();
    if (s.id === 242) return mark();
    return false;
  });

  const api = {
    crops, get cast() { return cast; }, marks, towards, plant, water, fish, mark, useBoat, boat,
    removeMark(n) { const i = marks.findIndex((m) => m.n === n); if (i >= 0) { marks.splice(i, 1); keepMarks(); drawBeams(); } },
    /** The marks section of the quests page. */
    page() {
      return '<h3>علاماتي على الخريطة</h3>' + (marks.length ? '<ol class="quests">' + marks.map((m) => `<li class="now"><b style="color:${m.c}">●</b> علامة ${m.n}<small>${towards(m.x + 0.5, m.z + 0.5)} <button type="button" class="view" data-unmark="${m.n}">امسحها</button></small></li>`).join('') + '</ol>'
        : '<p class="hint">امسك الخريطة السحرية واضغط زر البناء: تنحط علامة مكانك (لين 9 علامات).</p>');
    },
    click(t) { const u = t.closest('[data-unmark]'); if (u) { api.removeMark(+u.dataset.unmark); return true; } return false; },
  };
  window.__GAME_FARM = api;
  return api;
}
