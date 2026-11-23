// What the bag's other tools and things do with the place button (the bag makes this):
//   معزقة: tills soil · دلو: takes water up and pours it out, milks a cow · مقص: shears a sheep · حبل قيادة: leads an
//   animal · سرج: rides a befriended horse, donkey, camel… · قوس + سهم: shoots · لؤلؤة القفزة: thrown, the player lands
//   where it falls · قدّاحة: lights a fire · دفتر: a page to write on · بطاقة اسم: names an animal · منظار: looks far ·
//   بوصلة / ساعة in the hand: the way home and the hour. A bed slept in becomes the place to come back to.
// Apples fall from leaves now and then, carrots and potatoes turn up among wild plants.

import * as THREE from 'three';
import { K, kitItem } from './kit.js';
import { EMPTY } from './play.js';

const RIDE = new Set(['horse', 'horse2', 'donkey', 'camel', 'llama', 'zebra', 'longneck']);
const WOOLLY = new Set(['sheep', 'blacksheep', 'llama']);
const COWS = new Set(['cow']);

export function createGear({ play, kit, world, adv, openPage }) {
  const st = play.state, w = kit.world, scene = kit.scene;
  const life = () => (window.__GAME_LIFE && window.__GAME_LIFE.life) || null;
  const held = () => st.slots[st.sel];
  const used = (s) => { s.n = (s.n || 1) - 1; play.setSlot(st.sel, s.n > 0 ? s : EMPTY); };
  const eye = () => new THREE.Vector3(st.pos.x, st.pos.y + play.tuning.eye, st.pos.z);
  const look = () => { const cp = Math.cos(st.pitch); return new THREE.Vector3(-Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp); };
  const count = (id) => [...st.slots, ...st.pack].filter((q) => q && q.id === id && q.n > 0).reduce((a, q) => a + q.n, 0);
  const takeOne = (id) => { for (const list of [st.slots, st.pack]) for (let i = 0; i < list.length; i++) { const q = list[i]; if (q && q.id === id && q.n > 0) { q.n--; if (!(q.n > 0)) list[i] = list === st.slots ? EMPTY : null; play.changed(); return true; } } return false; };
  const creative = () => !!(window.__GAME_RULES && window.__GAME_RULES.creative);
  const aimedAnimal = () => { const l = life(), e = l && l.aimed; return e && e.k.kind === 'animal' && !e.dead ? e : null; };

  // ---------------------------------------------------------------- the home: a bed slept in
  const HK = 'bw-home-' + world;
  let home = null;
  try { const h = JSON.parse(window.localStorage.getItem(HK) || 'null'); if (h && [h.x, h.y, h.z].every(Number.isFinite)) home = h; } catch (e) { /* storage may be closed */ }
  const applyHome = () => { const v = window.__GAME_VITALS; if (v && v.spawn && home) { v.spawn.x = home.x; v.spawn.y = home.y; v.spawn.z = home.z; return true; } return false; };
  let homeSet = false;
  const setHome = () => { home = { x: st.pos.x, y: st.pos.y, z: st.pos.z }; try { window.localStorage.setItem(HK, JSON.stringify(home)); } catch (e) { /* not kept */ } applyHome(); play.notice('هذا السرير صار بيتك: إذا متّ ترجع له.', false, 3200); };
  if (adv) for (const k of ['sleep', 'nap']) { const f = adv[k]; if (typeof f === 'function') adv[k] = () => { const r = f(); if (r && !(window.__GAME_SKY && window.__GAME_SKY.locked)) setHome(); return r; }; }

  // ---------------------------------------------------------------- what turns up when digging plants and leaves
  play.onBreakAny((h) => {
    const b = play.blocks[h.id];
    if (h.remote || !b || h.id >= 100) return;
    if (b.kind === 'cutout' && Math.random() < 0.12) { play.give(kitItem(K.APPLE, 1)); if (!st.gotApple) { st.gotApple = true; play.notice('طاحت تفاحة من الورق!', false, 2400); } }
    if (b.kind === 'cross') { const r = Math.random(); if (r < 0.06) play.give(kitItem(K.CARROT, 1)); else if (r < 0.12) play.give(kitItem(K.POTATO, 1)); }
  });

  // ---------------------------------------------------------------- arrows and the jump pearl: things that fly
  const flying = [];
  const arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.6), arrowMat = new THREE.MeshStandardMaterial({ color: 0x8a5a30 });
  const pearlGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18), pearlMat = new THREE.MeshStandardMaterial({ color: 0x3fd0b0, emissive: 0x1a6a5a, emissiveIntensity: 0.6 });
  function shoot(kind, speed) {
    const p = eye(), d = look(), m = new THREE.Mesh(kind === 'arrow' ? arrowGeo : pearlGeo, kind === 'arrow' ? arrowMat : pearlMat);
    p.addScaledVector(d, 0.6); m.position.copy(p); scene.add(m);
    flying.push({ kind, m, p, v: d.multiplyScalar(speed), t: 0, stuck: 0 });
    if (play.sound) play.sound.swing();
  }
  const _q = new THREE.Vector3();
  play.onTick((s, dt) => {
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      if (f.stuck) { if ((f.stuck -= dt) <= 0) { scene.remove(f.m); flying.splice(i, 1); } continue; }
      f.t += dt; f.v.y -= (f.kind === 'arrow' ? 9 : 14) * dt;
      const steps = 4;
      for (let k = 0; k < steps; k++) {
        f.p.addScaledVector(f.v, dt / steps);
        const id = w.get(Math.floor(f.p.x), Math.floor(f.p.y), Math.floor(f.p.z));
        const l = life(), hitE = l && l.ents.find((e) => !e.dead && Math.hypot(e.x - f.p.x, e.z - f.p.z) < e.k.radius + 0.2 && f.p.y > e.y - 0.2 && f.p.y < e.y + (e.lift || 0) + e.k.height + 0.2);
        if (f.kind === 'arrow' && hitE) { l.hurtEntity(hitE, 6); scene.remove(f.m); flying.splice(i, 1); break; }
        if ((id && play.isSolid(id)) || f.t > 6) {
          if (f.kind === 'pearl') {
            // the player lands on top of where the pearl fell
            f.p.addScaledVector(f.v, -dt / steps);
            let x = Math.floor(f.p.x), y = Math.floor(f.p.y), z = Math.floor(f.p.z);
            while (y < w.sy - 2 && (play.isSolid(w.get(x, y, z)) || play.isSolid(w.get(x, y + 1, z)))) y++;
            if (f.t <= 6) { play.setFlying(false); st.pos.set(x + 0.5, y, z + 0.5); st.vel.set(0, 0, 0); const v = window.__GAME_VITALS; if (v && !creative()) v.hurt(2); play.notice('قفزت!', false, 1200); }
            scene.remove(f.m); flying.splice(i, 1);
          } else { f.stuck = 4; f.m.position.copy(f.p); }
          break;
        }
      }
      if (!f.stuck && flying.includes(f)) { f.m.position.copy(f.p); _q.copy(f.p).add(f.v); f.m.lookAt(_q); }
    }
  });

  // ---------------------------------------------------------------- the lead: a rope from the hand to the animal
  const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0xc9a35a }));
  rope.visible = false; rope.frustumCulled = false; scene.add(rope);
  let led = null;
  play.onTick(() => {
    if (led && (led.dead || !life() || !life().ents.includes(led))) { led = null; }
    rope.visible = !!led;
    if (!led) return;
    led.love = 9999; led.owner = null; led.tamed = true;
    const a = ropeGeo.attributes.position; a.setXYZ(0, st.pos.x, st.pos.y + 1.1, st.pos.z); a.setXYZ(1, led.x, led.y + led.k.height * 0.8, led.z); a.needsUpdate = true;
    if (Math.hypot(led.x - st.pos.x, led.z - st.pos.z) > 14) { led.love = 0; led = null; play.notice('انقطع الحبل: بعدت وايد.', false, 2200); }
  });

  // ---------------------------------------------------------------- riding
  let riding = null, eye0 = play.tuning.eye;
  function mount(e) {
    riding = e; e.ridden = true; eye0 = play.tuning.eye; play.tuning.eye = eye0 + e.k.height * 0.55;
    st.ride = e.k.key === 'longneck' ? 1.4 : 1.9; play.setFlying(false);
    play.notice('ركبت ' + e.k.name + '! تحرّك وين ما تبي. عشان تنزل: اختر السرج واضغط زر البناء.', false, 4600);
  }
  function dismount() { if (!riding) return; riding.ridden = false; riding = null; play.tuning.eye = eye0; st.ride = 1; }
  play.onTick(() => { if (riding && (riding.dead || !life() || !life().ents.includes(riding) || st.boat)) dismount(); });

  // ---------------------------------------------------------------- the spyglass, the compass and the clock
  const cam = () => (window.__game && window.__game.camera && window.__game.camera.isPerspectiveCamera ? window.__game.camera : (play.camera && play.camera.isPerspectiveCamera ? play.camera : null));
  let zoom = false, fov0 = null;
  const setZoom = (on) => { const c = cam(); if (!c) return; if (on && !zoom) { fov0 = c.fov; c.fov = fov0 / 4; } else if (!on && zoom && fov0) c.fov = fov0; zoom = on; c.updateProjectionMatrix(); };
  const chip = document.createElement('div');
  chip.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:21;direction:rtl;display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:12px;background:rgba(8,11,16,.78);color:#f1f4f8;border:1px solid rgba(255,255,255,.25);font:700 14px/1.3 system-ui,sans-serif;pointer-events:none;';
  chip.innerHTML = '<span class="ar" style="display:inline-block;font-size:20px;line-height:1">⬆</span><span class="tx"></span>';
  chip.hidden = true; document.body.appendChild(chip);
  const chipArrow = chip.querySelector('.ar'), chipText = chip.querySelector('.tx');
  const TIMES = { morning: 'الصبح', noon: 'الظهر', sunset: 'المغرب', night: 'الليل' };
  play.onTick(() => {
    const s = held();
    if (zoom && (!s || s.id !== K.SPYGLASS || st.modal)) setZoom(false);
    const id = s && !st.modal ? s.id : 0;
    if (id === K.COMPASS) {
      const t = home || (window.__GAME_VITALS && window.__GAME_VITALS.spawn) || { x: st.pos.x, z: st.pos.z };
      const dx = t.x - st.pos.x, dz = t.z - st.pos.z, d = Math.hypot(dx, dz), rel = Math.atan2(dx, -dz) - (-st.yaw);
      chipArrow.style.visibility = d < 2 ? 'hidden' : ''; chipArrow.style.transform = 'rotate(' + rel.toFixed(2) + 'rad)';
      chipText.textContent = d < 2 ? 'انت في البيت' : (home ? 'سريرك' : 'مكان البداية') + ' على ' + Math.round(d) + ' مكعب';
      chip.hidden = false;
    } else if (id === K.CLOCK) {
      const sky = window.__GAME_SKY || {};
      chipArrow.style.visibility = ''; chipArrow.style.transform = 'none'; chipArrow.textContent = sky.night ? '☾' : '☀';
      chipText.textContent = 'الوقت: ' + (TIMES[sky.time] || (sky.night ? 'الليل' : 'النهار')) + (sky.rain ? ' · مطر' : '');
      chip.hidden = false;
    } else { if (!chip.hidden) chip.hidden = true; chipArrow.textContent = '⬆'; }
  });

  // ---------------------------------------------------------------- the notebook
  const BK = 'bw-book-' + world;
  const bookPage = { title: 'دفتري', html: () => { let t = ''; try { t = window.localStorage.getItem(BK) || ''; } catch (e) { t = ''; } return '<p class="hint">اكتب اللي تبي: أماكن لقيتها، أسماء، خطط بناء. ينحفظ في هذا المتصفح.</p><textarea class="book" maxlength="3000" style="width:100%;min-height:180px;box-sizing:border-box;font:inherit;font-size:15px;line-height:1.7;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,248,230,.95);color:#2a2016;direction:rtl"></textarea>'.replace('</textarea>', t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</textarea>'); }, click: () => false };
  document.addEventListener('input', (e) => { if (e.target && e.target.classList && e.target.classList.contains('book')) { try { window.localStorage.setItem(BK, e.target.value); } catch (err) { /* not kept */ } } });

  // ---------------------------------------------------------------- the place button with each thing in the hand
  const waterAhead = (reach) => { const h = play.raycast(eye(), look(), reach, (id) => play.isLiquid(id) || (id !== 0 && play.isSolid(id))); return h && play.isLiquid(h.id) ? h : null; };
  play.onUseFirst((h) => {
    const s = held();
    if (riding && s && s.id === K.SADDLE) { dismount(); play.notice('نزلت.', false, 1400); return true; }
    if (!s || !s.id) return false;
    switch (s.id) {
      case 267: case 268: case 269: {                                                     // the hoe: tills the top of soft ground
        if (!h || h.ny !== 1 || !play.isSolid(h.id) || h.id >= 100 || (play.digClass && play.digClass(h.id) !== 'soft')) { play.notice('المعزقة تحرث التراب والعشب والرمل من فوق.', false, 2200); return true; }
        if (w.get(h.x, h.y + 1, h.z) !== 0) return true;
        play.put(h.x, h.y, h.z, K.FARMLAND); if (play.sound) play.sound.dig();
        if (!st.tilled) play.notice('حرثت الأرض. الزرع في الأرض المحروثة يكبر أسرع.', false, 3600);
        st.tilled = (st.tilled || 0) + 1; return true;
      }
      case K.BUCKET: {
        const e = aimedAnimal();
        if (e && COWS.has(e.k.key)) { play.setSlot(st.sel, kitItem(K.BUCKET_MILK, 1)); play.notice('حلبت البقرة: دلو حليب.', false, 2200); return true; }
        const wat = waterAhead(play.tuning.reach);
        if (!wat) { play.notice('وجّه الدلو على ماي تعبّيه، أو على بقرة تحلبها.', false, 2400); return true; }
        play.remoteDig(wat.x, wat.y, wat.z); if (play.net && play.net.dig) play.net.dig(wat.x, wat.y, wat.z);
        play.setSlot(st.sel, kitItem(K.BUCKET_WATER, 1)); if (play.sound) play.sound.splash(); return true;
      }
      case K.BUCKET_WATER: {
        if (!h) return true;
        const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
        if (w.get(x, y, z) !== 0) return true;
        play.put(x, y, z, K.WATER); play.setSlot(st.sel, kitItem(K.BUCKET, 1)); if (play.sound) play.sound.splash(); return true;
      }
      case K.SHEARS: {
        const e = aimedAnimal();
        if (!e || !WOOLLY.has(e.k.key)) { play.notice('المقص للخراف واللاما: يقصّ صوفها بدون ما تموت.', false, 2400); return true; }
        if (e.shorn && e.shorn > performance.now()) { play.notice('توّه مقصوص. صوفه يطلع بعد شوي.', false, 2000); return true; }
        e.shorn = performance.now() + 90000; play.give(kitItem(K.WOOL, 2)); if (play.sound) play.sound.ui(); play.notice('قصّيت الصوف: صوف ×2.', false, 2000); return true;
      }
      case K.LEAD: {
        const e = aimedAnimal();
        if (led) { led.love = 0; led = null; play.notice('فكّيت الحبل.', false, 1600); return true; }
        if (!e) { play.notice('وجّه الحبل على حيوان تربطه.', false, 2000); return true; }
        led = e; play.notice('ربطت ' + e.k.name + ': بيمشي وراك. اضغط مرة ثانية تفكّه.', false, 3200); return true;
      }
      case K.SADDLE: {
        const e = aimedAnimal();
        if (!e || !RIDE.has(e.k.key)) { play.notice('السرج للحصان والحمار والجمل واللاما والحمار الوحشي.', false, 2800); return true; }
        if (!e.tamed) { play.notice(e.k.name + ' ما يعرفك: أكّله أول عشان يرضى تركبه.', false, 3000); return true; }
        mount(e); return true;
      }
      case K.BOW: {
        if (!creative() && !takeOne(K.ARROW)) { play.notice('ما عندك أسهم. اصنعها من خشب وريش وحجر.', false, 2600); return true; }
        shoot('arrow', 34); st.shot = (st.shot || 0) + 1; return true;
      }
      case K.PEARL_JUMP: { shoot('pearl', 22); if (!creative()) used(s); return true; }
      case K.FLINT: {
        if (!h) return true;
        const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
        if (w.get(x, y, z) !== 0 || !play.isSolid(w.get(x, y - 1, z))) { play.notice('ولّع النار فوق أرض صلبة.', false, 2000); return true; }
        play.put(x, y, z, K.FIRE); if (play.sound) play.sound.place(); return true;
      }
      case K.BOOK: { if (openPage) openPage(bookPage); return true; }
      case K.NAME_TAG: {
        const e = aimedAnimal();
        if (!e) { play.notice('وجّه البطاقة على حيوان تسمّيه.', false, 2000); return true; }
        let name = '';
        try { name = String(window.prompt('وش تبي تسمّي ' + e.k.name + '؟', e.customName || '') || ''); } catch (err) { name = ''; }
        name = name.replace(/[\u0000-\u001f<>&"'`]/g, '').trim().slice(0, 16);
        if (!name) return true;
        e.customName = name; e.tamed = true; used(s); play.notice('سمّيته «' + name + '».', false, 2400); return true;
      }
      case K.SPYGLASS: { setZoom(!zoom); return true; }
      default: return false;
    }
  });
  play.onTick(() => { if (st.gear && st.gear.chest && st.gear.chest.glide && !st.wingsTold) { st.wingsTold = true; play.notice('لبست الأجنحة: وانت طايح من مكان عالي اضغط القفز، تفتح وتنزلق في الهوا.', false, 5200); } });

  const api = { get riding() { return riding; }, get led() { return led; }, get home() { return home; }, flying, mount, dismount, setZoom, get zoom() { return zoom; }, setHome, applyHome };
  play.onTick(() => { if (!homeSet) homeSet = applyHome(); });
  window.__GAME_GEAR = api;
  return api;
}
