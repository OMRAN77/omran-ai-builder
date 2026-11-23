// Gadgets: things from the bag that do something.
//   كاشف الكنوز     in the hand: how far the day's treasure is and which way, with a beep that quickens as it nears
//   الخريطة السحرية  in the hand or the other hand: a small live map that follows the player
//   الكاميرا         the place button takes a picture of the world (without the menus) and saves it
//   شنطة إضافية      the place button opens 27 more places
//   جهاز التاجر      the place button opens the trader's page from anywhere
//   بلورة المكان     the place button remembers this spot; the next press brings the player back to it
//
//   createGadgets({ play, kit, adv, net: () => net, openStore, world })      (the bag does this)

const CSS = `
#gadDetect { position: fixed; left: 50%; top: 62%; transform: translateX(-50%); z-index: 18; pointer-events: none; direction: rtl; display: flex; align-items: center; gap: 8px; padding: 5px 12px; border-radius: 9px;
  background: rgba(8, 11, 16, .8); border: 1px solid rgba(227, 192, 56, .7); color: #ffe9a8; font: 700 13.5px/1.4 system-ui, sans-serif; white-space: nowrap; }
#gadDetect[hidden], #gadMap[hidden] { display: none; }
#gadDetect svg { width: 20px; height: 20px; flex: none; }
#gadMap { position: fixed; right: 12px; top: 50%; transform: translateY(-50%); z-index: 17; pointer-events: none; width: 132px; height: 132px; border-radius: 50%; overflow: hidden; border: 3px solid rgba(120, 92, 50, .95); box-shadow: 0 4px 16px rgba(0, 0, 0, .5); background: #6b5a3c; }
#gadMap canvas { width: 100%; height: 100%; image-rendering: pixelated; display: block; }
#gadFlash { position: fixed; inset: 0; z-index: 60; pointer-events: none; background: #fff; opacity: 0; }
@media (max-height: 500px), (pointer: coarse) { #gadMap { width: 96px; height: 96px; right: 8px; top: 42%; } #gadDetect { top: 60%; font-size: 12px; } }
`;

export function createGadgets({ play, kit, adv, net, openStore, world }) {
  const st = play.state, w = kit.world, A = w.area || { x0: 0, z0: 0, x1: w.sx, z1: w.sz };      // the part of the world on the map (adventure.js mapOf)
  const css = document.createElement('style');
  css.textContent = CSS;
  document.head.appendChild(css);
  const detect = document.createElement('div');
  detect.id = 'gadDetect'; detect.hidden = true;
  detect.innerHTML = '<svg viewBox="0 0 20 20"><path d="M10 2l6 14-6-3.500L4 16z" fill="#e3c038" stroke="#2a2214" stroke-width="1"/></svg><span></span>';
  const mapEl = document.createElement('div');
  mapEl.id = 'gadMap'; mapEl.hidden = true;
  const cv = document.createElement('canvas'); cv.width = cv.height = 96; mapEl.appendChild(cv);
  const flash = document.createElement('div'); flash.id = 'gadFlash';
  document.body.append(detect, mapEl, flash);
  const arrow = detect.firstChild, dText = detect.lastChild, g = cv.getContext('2d');
  const holding = (what) => { const a = st.slots[st.sel], b = st.gear.off; return !!((a && a.gadget === what) || (b && b.gadget === what)); };      // always true or false: the chips below are shown and hidden by comparing with it

  // ---- the place button
  const uses = {
    camera() {
      play.capture((blob) => {
        if (!blob) { play.notice('ما قدرت آخذ الصورة.', false, 2600); return; }
        st.photos++;
        flash.style.transition = 'none'; flash.style.opacity = '0.85';
        requestAnimationFrame(() => { flash.style.transition = 'opacity .5s'; flash.style.opacity = '0'; });
        if (play.sound) play.sound.pick();
        const name = 'blockworld-' + world + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png';
        api.lastPhoto = { name, size: blob.size };
        // a phone offers its own sheet (save to photos, send); anywhere else the picture is downloaded
        try {
          const file = new File([blob], name, { type: 'image/png' });
          if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(() => {}); play.notice('الصورة جاهزة: احفظها أو أرسلها.', false, 3000); return; }
        } catch (e) { /* no share sheet here: download instead */ }
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        play.notice('انحفظت الصورة في التنزيلات.', false, 3000);
      });
      return true;
    },
    pouch() { return openStore(st.pouch, 'الشنطة الإضافية'); },
    phone() { if (adv.onTrade) { adv.onTrade(); return true; } return false; },
    recall() {
      if (!st.mark) { st.mark = { x: st.pos.x, y: st.pos.y, z: st.pos.z }; play.notice('البلورة حفظت هذا المكان. اضغط فيها مرة ثانية من أي مكان ترجعك له.', false, 4500); if (play.sound) play.sound.ui(); }
      else { st.pos.set(st.mark.x, st.mark.y + 0.05, st.mark.z); st.vel.set(0, 0, 0); st.mark = null; play.notice('رجعت للمكان المحفوظ. البلورة فاضية الحين وتقدر تحفظ فيها مكان جديد.', false, 4500); if (play.sound && play.sound.level) play.sound.level(); }
      return true;
    },
  };
  play.onUseFirst(() => { const s = st.slots[st.sel]; return !!(s && s.use && uses[s.use] && uses[s.use]()); });

  // ---- what works just by being held
  let beep = 0, drawT = 0;
  function drawMap() {
    const img = adv.mapOf ? adv.mapOf() : null;
    if (!img) return;
    if (!api.mapCanvas) { api.mapCanvas = document.createElement('canvas'); api.mapCanvas.width = A.x1 - A.x0; api.mapCanvas.height = A.z1 - A.z0; api.mapCanvas.getContext('2d').putImageData(img, 0, 0); }
    const R = 34, s = cv.width / (R * 2);       // cells either side of the player, and pixels per cell
    g.fillStyle = '#4a3f2a'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(api.mapCanvas, st.pos.x - R - A.x0, st.pos.z - R - A.z0, R * 2, R * 2, 0, 0, cv.width, cv.height);
    const at = (x, z) => [(x - st.pos.x + R) * s, (z - st.pos.z + R) * s];
    const edge = ([x, y]) => { const c = cv.width / 2, dx = x - c, dy = y - c, d = Math.hypot(dx, dy), m = c - 7; return d > m ? [c + dx / d * m, c + dy / d * m] : [x, y]; };      // what is off the map sits on its rim, the way to go
    if (adv.treasure && !adv.foundToday) { const [x, y] = edge(at(adv.treasure.x, adv.treasure.z)); g.strokeStyle = '#b3121b'; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke(); }
    if (adv.cave) { const [x, y] = edge(at(adv.cave.mouth.x, adv.cave.mouth.z)); g.fillStyle = '#16120c'; g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4.500, y + 4); g.lineTo(x - 4.500, y + 4); g.closePath(); g.fill(); g.stroke(); }
    const fm = window.__GAME_FARM;
    if (fm) for (const m of fm.marks) { const [x, y] = edge(at(m.x + 0.5, m.z + 0.5)); g.fillStyle = m.c; g.strokeStyle = '#111'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.lineTo(x - 4, y); g.closePath(); g.fill(); g.stroke(); }
    if (adv.traderAt) { const [x, y] = edge(at(adv.traderAt.x, adv.traderAt.z)); g.fillStyle = '#3f8a72'; g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.200, 0, 7); g.fill(); g.stroke(); }
    const n = net && net();
    if (n) for (const o of n.others.values()) if (o.s) { const [x, y] = edge(at(o.s.p[0], o.s.p[2])); g.fillStyle = '#55a0e0'; g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.stroke(); }
    // the player, an arrow in the middle pointing the way they look
    const c = cv.width / 2; g.save(); g.translate(c, c); g.rotate(-st.yaw); g.fillStyle = '#e02222'; g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -6.500); g.lineTo(4.500, 5); g.lineTo(0, 2.500); g.lineTo(-4.500, 5); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  play.onTick((s, dt) => {
    const det = holding('detector') && !st.modal, map = holding('map') && !st.modal;
    if (detect.hidden === det) detect.hidden = !det;
    if (mapEl.hidden === map) mapEl.hidden = !map;
    if (det) {
      // the nearest treasure not found yet: the day's chest, or one of the chests buried under the ground
      const left = [...(adv.treasure && !adv.foundToday ? [{ ...adv.treasure, top: true }] : []), ...(adv.buriedLeft || [])];
      let t = null, best = Infinity;
      for (const q of left) { const d0 = Math.hypot(q.x + 0.5 - st.pos.x, q.z + 0.5 - st.pos.z); if (d0 < best) { best = d0; t = q; } }
      if (!t) { dText.textContent = 'لقيت كل كنوز اليوم. كنوز جديدة بكرة.'; arrow.style.visibility = 'hidden'; }
      else {
        const dx = t.x + 0.5 - st.pos.x, dz = t.z + 0.5 - st.pos.z, d = Math.hypot(dx, dz);
        // which way to turn: the angle between where the player looks and where the treasure lies
        const rel = Math.atan2(dx, -dz) - (-st.yaw);
        arrow.style.visibility = ''; arrow.style.transform = 'rotate(' + rel.toFixed(2) + 'rad)';
        const deep = !t.top ? Math.max(0, Math.round(st.pos.y - t.y)) : 0;
        dText.textContent = d < 2.5 ? (t.top ? 'الكنز هني!' : 'الكنز مدفون تحتك ' + deep + ' مكعب. احفر!') : (t.top ? 'الكنز على ' : 'كنز مدفون على ') + Math.round(d) + ' مكعب';
        api.reading = { d, rel };
        if ((beep -= dt) <= 0) { beep = Math.max(0.18, Math.min(2.2, d / 28)); if (play.sound) play.sound.pick(); }
      }
    }
    if (map && (drawT -= dt) <= 0) { drawT = 0.2; drawMap(); }
  });
  const api = { uses, detect, mapEl, holding, drawMap, reading: null, lastPhoto: null, mapCanvas: null };
  window.__GAME_GADGETS = api;
  return api;
}
