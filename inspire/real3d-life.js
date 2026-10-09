/* v-city-life (المالك ٩ أكتوبر: «كلهم»): حياة المدينة المصوَّرة — زحمة على الشوارع الحقيقيّة، مشاة على الأرصفة،
   سباق دراج ربع ميل، وطقس ووقت بالأمر المكتوب. الشوارع من /api/system?action=osm (مخبّأة في الشبكة).
   الأرض: كلّ كائن يأخذ ارتفاعه بشعاع نازل على المدينة، موزَّعًا على الإطارات (ثمانية أشعّة في الإطار) فلا يثقل. */

const DRIVE = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street)(_link)?$/;
const WALK = /^(pedestrian|footway|path|living_street)$/;
const SIDEWALK_FROM = /^(primary|secondary|tertiary|residential|unclassified)$/;
const SPEED = { motorway: 27, trunk: 22, primary: 16, secondary: 14, tertiary: 12, residential: 9, unclassified: 9, service: 6, living_street: 5 };
const N_CARS = 22, N_PEDS = 36, QUARTER = 402.3;

export function initLife(ctx) {
  const { THREE, scene, camera, renderer, getTiles, gl, say, T, $ } = ctx;
  const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
  const DOWN = new THREE.Vector3(0, -1, 0);
  const groundAt = (x, z, fromY) => {
    const tiles = getTiles(); if (!tiles) return null;
    ray.set(new THREE.Vector3(x, fromY, z), DOWN); ray.far = 3000;
    const h = ray.intersectObject(tiles.group, true)[0];
    return h ? h.point.y : null;
  };
  const L = { place: null, lanes: [], walks: [], cars: [], peds: [], models: [], root: new THREE.Group(), gi: 0, weather: null, race: null };
  scene.add(L.root);

  // —— إسقاط محلّيّ: أصل المشهد هو المكان المختار، الشمال +Z والغرب +X (اتّفاق ReorientationPlugin)
  function toLocal(lat, lon) {
    const p = L.place, k = Math.cos(p.lat * Math.PI / 180);
    return new THREE.Vector3(-(lon - p.lon) * k * 111320, 0, (lat - p.lat) * 110574);
  }
  function poly(pts) {
    const v = pts.map(([a, b]) => toLocal(a, b)); const cum = [0];
    for (let i = 1; i < v.length; i++) cum.push(cum[i - 1] + v[i].distanceTo(v[i - 1]));
    return { v, cum, len: cum[cum.length - 1] };
  }
  function at(line, s, off) {
    s = Math.max(0, Math.min(line.len - 0.001, s));
    let i = 1; while (i < line.cum.length - 1 && line.cum[i] < s) i++;
    const a = line.v[i - 1], b = line.v[i], t = (s - line.cum[i - 1]) / Math.max(1e-6, line.cum[i] - line.cum[i - 1]);
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
    // الإزاحة يمين اتّجاه السير (القيادة يمينًا في الخليج): X غرب، فاليمين = (−dz, dx)
    return { x: a.x + dx * t + (-dz / d) * off, z: a.z + dz * t + (dx / d) * off, h: Math.atan2(dx, dz) };
  }

  // —— الشوارع
  async function loadRoads(p, keep, radius) {
    if (!keep) { L.lanes = []; L.walks = []; L.seen = new Set(); }
    L.status = T('يجلب الشوارع…', 'Loading streets…');
    const r = await fetch('/api/system?action=osm&lat=' + p.lat.toFixed(5) + '&lon=' + p.lon.toFixed(5) + '&r=' + (radius || 700)).then((x) => x.json()).catch(() => null);
    if (!r || !r.ways) { L.status = T('تعذّر جلب الشوارع — الزحمة والمشاة بعد قليل', 'Streets unavailable — try again shortly'); return; }
    for (const w of r.ways) {
      const id = w.t + ':' + w.p[0] + ':' + w.p[w.p.length - 1]; if (L.seen.has(id)) continue; L.seen.add(id); // الجلب الثاني حول سيّارتك يتداخل مع الأوّل
      const line = poly(w.p); if (line.len < 25) continue;
      const base = w.t.replace(/_link$/, '');
      if (DRIVE.test(w.t)) L.lanes.push({ line, sp: SPEED[base] || 8, one: !!w.o, wide: /motorway|trunk|primary/.test(base) ? 5 : 2.2 });
      if (WALK.test(w.t)) L.walks.push({ line, off: 0 });
      if (SIDEWALK_FROM.test(base)) { L.walks.push({ line, off: 6 }); L.walks.push({ line, off: -6 }); }
    }
  }

  // —— الزحمة: نسخ من سيّارات المختبر بألوان مختلفة، وصندوق بسيط إن لم توجد سيّارات بعد
  async function loadModels() {
    if (L.models.length) return;
    const r = await fetch('/api/system?action=car3d&list=1', { cache: 'no-store' }).then((x) => x.json()).catch(() => ({}));
    const list = (r.cars || []).filter((c) => c.glb).slice(0, 4);
    await Promise.all(list.map((c) => new Promise((ok) => gl.load(c.glb, (g) => { L.models.push(normalize(g.scene)); ok(); }, undefined, () => ok()))));
  }
  function normalize(m) {
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
    const s = 4.6 / Math.max(size.x, size.z, 0.001); m.scale.setScalar(s); if (size.x > size.z) m.rotation.y = Math.PI / 2;
    const h = new THREE.Group(); h.add(m);
    const b2 = new THREE.Box3().setFromObject(h), c = b2.getCenter(new THREE.Vector3()); m.position.set(-c.x, -b2.min.y, -c.z);
    const root = new THREE.Group(); root.add(h); return root;
  }
  const PAINT = [0xf2f2f2, 0x1c1c1e, 0x9aa0a6, 0x7a1f1f, 0x1f3a5f, 0xc9b28a, 0x2f4a3a];
  function makeCar(i) {
    let o;
    if (L.models.length) {
      o = L.models[i % L.models.length].clone(true);
      // لون مختلف لكلّ نسخة: نخلط لون المادّة الأصليّ بلون الطلاء (المادّة تُنسخ فلا يتأثّر الأصل)
      const tint = new THREE.Color(PAINT[i % PAINT.length]);
      o.traverse((m) => { if (m.isMesh && m.material && i >= L.models.length) { m.material = m.material.clone(); if (m.material.color) m.material.color.lerp(tint, 0.55); } });
    } else {
      o = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 4.4), new THREE.MeshStandardMaterial({ color: PAINT[i % PAINT.length], metalness: 0.4, roughness: 0.35 }));
      body.position.y = 0.75; o.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x222831, metalness: 0.2, roughness: 0.1 }));
      cab.position.set(0, 1.45, -0.2); o.add(cab);
    }
    return o;
  }
  function spawnCars() {
    L.cars.forEach((c) => L.root.remove(c.o)); L.cars = [];
    if (!L.lanes.length) return;
    // الطرق الأطول والأسرع أولى بالسيّارات
    const weighted = []; L.lanes.forEach((ln) => { const w = Math.ceil(ln.line.len / 120 * (ln.sp > 12 ? 2 : 1)); for (let i = 0; i < w; i++) weighted.push(ln); });
    for (let i = 0; i < N_CARS; i++) {
      const ln = weighted[(Math.random() * weighted.length) | 0];
      const dir = ln.one ? 1 : (Math.random() < 0.5 ? 1 : -1);
      const c = { o: makeCar(i), ln, dir, s: Math.random() * ln.line.len, v: ln.sp * (0.8 + Math.random() * 0.3), y: null };
      L.root.add(c.o); L.cars.push(c);
    }
  }

  // —— المشاة: أجسام بسيطة بمشية متأرجحة (رأس، جذع، ذراعان، ساقان) وألوان ملابس مختلفة
  const SKIN = [0xc68642, 0x8d5524, 0xe0ac69, 0xf1c27d], CLOTH = [0xffffff, 0x111111, 0x2b4c7e, 0x7e2b2b, 0x8a8a8a, 0xd8c3a5, 0x3d5c3d];
  function makePed(i) {
    const g = new THREE.Group(), m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    const cloth = m(CLOTH[i % CLOTH.length]), skin = m(SKIN[i % SKIN.length]), pants = m(CLOTH[(i + 3) % CLOTH.length]);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), cloth); torso.position.y = 1.2; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin); head.position.y = 1.68; g.add(head);
    const limb = (mat, len, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, len, 4, 6), mat); l.position.y = -len / 2 - 0.06; p.add(l); g.add(p); return p; };
    const legL = limb(pants, 0.7, -0.1, 0.92), legR = limb(pants, 0.7, 0.1, 0.92), armL = limb(cloth, 0.5, -0.27, 1.45), armR = limb(cloth, 0.5, 0.27, 1.45);
    const s = 0.92 + Math.random() * 0.16; g.scale.setScalar(s);
    return { g, legL, legR, armL, armR };
  }
  function spawnPeds() {
    L.peds.forEach((p) => L.root.remove(p.b.g)); L.peds = [];
    if (!L.walks.length) return;
    for (let i = 0; i < N_PEDS; i++) {
      const w = L.walks[(Math.random() * L.walks.length) | 0];
      const p = { b: makePed(i), w, dir: Math.random() < 0.5 ? 1 : -1, s: Math.random() * w.line.len, v: 1.1 + Math.random() * 0.5, ph: Math.random() * 6, y: null };
      L.root.add(p.b.g); L.peds.push(p);
    }
  }

  // —— الطقس والوقت بالأمر المكتوب
  const sky = { day: 0x9fc3e6, night: 0x0b1020, sunset: 0xf0a060, fog: 0xc8c8c8, dust: 0xc9a46a, rain: 0x6f7c8a, snow: 0xdfe6ee };
  const tint = document.createElement('div');
  Object.assign(tint.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '1', mixBlendMode: 'multiply', transition: 'background .8s', background: 'transparent' });
  document.body.appendChild(tint);
  let drops = null;
  function particles(kind) {
    if (drops) { scene.remove(drops); drops = null; }
    if (!kind) return;
    const n = kind === 'snow' ? 2500 : 6000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 160; pos[i * 3 + 1] = Math.random() * 80; pos[i * 3 + 2] = (Math.random() - 0.5) * 160; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    drops = new THREE.Points(g, new THREE.PointsMaterial({ color: kind === 'snow' ? 0xffffff : 0xaec4dd, size: kind === 'snow' ? 0.35 : 0.12, transparent: true, opacity: 0.85 }));
    drops.userData.kind = kind; scene.add(drops);
  }
  function weather(text) {
    const t = String(text || '');
    const has = (re) => re.test(t);
    // الوقت والحالة يجتمعان («مطر بالليل»): الوقت يلوّن، والحالة تضيف ضبابًا وجزيئات
    const time = has(/ليل|night|dark|مظلم/i) ? 'night' : has(/غروب|sunset|مغرب/i) ? 'sunset' : has(/نهار|صافي|day|clear|شمس|عادي/i) ? 'day' : null;
    const cond = has(/مطر|rain|أمطار|تمطر/i) ? 'rain' : has(/ثلج|snow|تثلج/i) ? 'snow' : has(/غبار|عاصفة|dust|sand/i) ? 'dust' : has(/ضباب|fog|mist/i) ? 'fog' : null;
    if (!time && !cond) { say(T('ما فهمت — جرّب: ليل، غروب، مطر، ثلج، غبار، ضباب، نهار', 'Try: night, sunset, rain, snow, dust, fog, day')); return false; }
    const mode = cond || time;
    L.weather = [time, cond].filter(Boolean).join('+');
    renderer.setClearColor(sky[time === 'night' ? 'night' : mode] || sky.day);
    scene.fog = cond ? new THREE.Fog(time === 'night' ? sky.night : sky[cond], cond === 'fog' ? 60 : 120, cond === 'fog' ? 700 : 1400) : null;
    const TINT = { night: 'rgba(40,60,120,.62)', sunset: 'rgba(255,150,80,.38)', rain: 'rgba(90,105,125,.42)', snow: 'rgba(220,230,245,.25)', dust: 'rgba(210,160,90,.45)', fog: 'rgba(200,200,200,.2)', day: 'transparent' };
    tint.style.background = TINT[time === 'night' || time === 'sunset' ? time : mode];
    particles(cond === 'rain' || cond === 'snow' ? cond : null);
    say(''); return true;
  }

  // —— سباق الدراج: ربع ميل من مكان سيّارتك واتّجاهها، ضدّ سيّارة بجانبك، بعدّ تنازليّ وأضواء
  const hud = document.createElement('div');
  Object.assign(hud.style, { position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)', zIndex: '3', background: 'rgba(10,14,22,.8)', color: '#fff', borderRadius: '14px', padding: '10px 18px', font: '800 18px ui-monospace,monospace', display: 'none', textAlign: 'center', direction: 'ltr', whiteSpace: 'pre' });
  document.body.appendChild(hud);
  function startRace(DRV) {
    if (!DRV.car) { say(T('نزّل سيّارتك أوّلًا', 'Drop your car first')); return; }
    if (L.race && L.race.opp) L.root.remove(L.race.opp);
    const p = DRV.car.position.clone(), h = DRV.heading;
    const side = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)); // يسار السيّارة تقريبًا
    const opp = makeCar(7); opp.position.copy(p).addScaledVector(side, 4); opp.rotation.y = h + (DRV.flip || 0); L.root.add(opp);
    DRV.speed = 0; DRV.lock = true;
    L.race = { start: p, h, opp, oppS: 0, oppV: 0, t0: 0, phase: 'count', cd: 3, cdT: performance.now(), you: null, them: null, trap: 0 };
  }
  function raceTick(dt, DRV) {
    const R = L.race; if (!R) return;
    const fx = Math.sin(R.h), fz = Math.cos(R.h);
    if (R.phase === 'count') {
      const left = 3 - Math.floor((performance.now() - R.cdT) / 1000);
      hud.style.display = 'block'; hud.style.color = left > 0 ? '#ff5a5a' : '#4ade80'; hud.textContent = left > 0 ? String(left) : T('انطلق!', 'GO!');
      if (left <= 0) { R.phase = 'run'; R.t0 = performance.now(); DRV.lock = false; }
      return;
    }
    if (R.phase === 'done') return;
    hud.style.color = '#fff';
    const el = (performance.now() - R.t0) / 1000;
    // الخصم: تسارع يقلّ مع السرعة (أقصى ~٦٠ م/ث)، يقطع الربع ميل في ~١٢ ث
    R.oppV += Math.max(0, 9.5 - R.oppV * 0.14) * dt; R.oppS += R.oppV * dt;
    const base = R.start.clone().add(new THREE.Vector3(Math.cos(R.h), 0, -Math.sin(R.h)).multiplyScalar(4));
    R.opp.position.set(base.x + fx * R.oppS, R.opp.position.y, base.z + fz * R.oppS);
    const gy = groundAt(R.opp.position.x, R.opp.position.z, R.opp.position.y + 6); if (gy != null) R.opp.position.y = gy;
    const yours = (DRV.car.position.x - R.start.x) * fx + (DRV.car.position.z - R.start.z) * fz;
    if (R.you == null && yours >= QUARTER) { R.you = el; R.trap = Math.abs(DRV.speed) * 3.6; }
    if (R.them == null && R.oppS >= QUARTER) R.them = el;
    hud.textContent = el.toFixed(2) + ' s   ' + Math.max(0, yours).toFixed(0) + ' / 402 m';
    if (R.you != null && (R.them != null || el > R.you + 4)) {
      R.phase = 'done';
      const win = R.them == null || R.you < R.them;
      hud.textContent = (win ? T('فزت! ', 'You win! ') : T('خسرت ', 'You lost ')) + '\n' + T('وقتك ', 'ET ') + R.you.toFixed(2) + ' s · ' + R.trap.toFixed(0) + ' km/h'
        + (R.them != null ? '\n' + T('الخصم ', 'Rival ') + R.them.toFixed(2) + ' s' : '');
      setTimeout(() => { hud.style.display = 'none'; }, 9000);
    }
  }

  // —— الحلقة: الزحمة والمشاة (حركة + أرض موزَّعة) والجزيئات
  function tick(dt, DRV) {
    const tiles = getTiles();
    const player = DRV && DRV.car ? DRV.car.position : null;
    for (const c of L.cars) {
      // إبطاء أمام سيّارتك أو أمام سيّارة على الطريق نفسه
      let v = c.v;
      const here = at(c.ln.line, c.s, c.dir * c.ln.wide);
      if (player && Math.hypot(player.x - here.x, player.z - here.z) < 12) v = 0;
      for (const o of L.cars) { if (o !== c && o.ln === c.ln && o.dir === c.dir) { const gap = (o.s - c.s) * c.dir; if (gap > 0 && gap < 9) { v = Math.min(v, o.v * 0.6); } } }
      c.s += v * c.dir * dt;
      if (c.s > c.ln.line.len || c.s < 0) { // نهاية الطريق: طريق آخر قريب (بسيط: عشوائيّ بين الطرق)
        const nl = L.lanes[(Math.random() * L.lanes.length) | 0]; c.ln = nl; c.dir = nl.one ? 1 : (Math.random() < 0.5 ? 1 : -1); c.s = c.dir > 0 ? 0 : nl.line.len; c.y = null;
      }
      const q = at(c.ln.line, c.s, c.dir * c.ln.wide);
      c.o.position.x = q.x; c.o.position.z = q.z; c.o.rotation.y = q.h + (c.dir < 0 ? Math.PI : 0) + ((DRV && DRV.flip) || 0);
      if (c.y != null) c.o.position.y = c.y;
      c.o.visible = c.y != null;
    }
    for (const p of L.peds) {
      p.s += p.v * p.dir * dt;
      if (p.s > p.w.line.len || p.s < 0) { p.dir *= -1; p.s = Math.max(0, Math.min(p.w.line.len, p.s)); }
      const q = at(p.w.line, p.s, p.w.off);
      p.b.g.position.x = q.x; p.b.g.position.z = q.z; p.b.g.rotation.y = q.h + (p.dir < 0 ? Math.PI : 0);
      if (p.y != null) p.b.g.position.y = p.y;
      p.b.g.visible = p.y != null;
      p.ph += dt * p.v * 5.2; const sw = Math.sin(p.ph) * 0.55;
      p.b.legL.rotation.x = sw; p.b.legR.rotation.x = -sw; p.b.armL.rotation.x = -sw * 0.8; p.b.armR.rotation.x = sw * 0.8;
    }
    // ثمانية أشعّة أرض في الإطار، بالتناوب على الكلّ
    if (tiles) {
      const all = L.cars.length + L.peds.length;
      for (let k = 0; k < 8 && all; k++) {
        L.gi = (L.gi + 1) % all;
        const e = L.gi < L.cars.length ? L.cars[L.gi] : L.peds[L.gi - L.cars.length];
        const o = e.o || e.b.g;
        const gy = groundAt(o.position.x, o.position.z, (e.y != null ? e.y : 0) + 400);
        if (gy != null) e.y = gy;
      }
    }
    if (drops) {
      const a = drops.geometry.attributes.position, fall = drops.userData.kind === 'snow' ? 3 : 28;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) - fall * dt; if (y < 0) y += 80; a.setY(i, y); }
      a.needsUpdate = true; drops.position.set(camera.position.x, camera.position.y - 40, camera.position.z);
    }
    raceTick(dt, DRV);
  }

  async function onPlace(p) {
    L.place = p;
    L.cars.forEach((c) => L.root.remove(c.o)); L.peds.forEach((q) => L.root.remove(q.b.g)); L.cars = []; L.peds = [];
    await Promise.all([loadRoads(p), loadModels()]);
    if (L.place !== p) return;
    spawnCars(); spawnPeds(); stat();
  }
  function stat() { L.status = T('شوارع ', 'streets ') + L.lanes.length + T(' · سيّارات ', ' · cars ') + L.cars.length + T(' · مشاة ', ' · people ') + L.peds.length; }
  // قرب سيّارتك: شوارع حولها إن لم تُجلب بعد، ثمّ الزحمة والمشاة ينتقلون إلى ما حولها (٣٥٠ م)
  function toLatLon(x, z) { const p = L.place, k = Math.cos(p.lat * Math.PI / 180); return { lat: p.lat + z / 110574, lon: p.lon - x / (k * 111320) }; }
  const near = (line, pos, R) => line.v.some((v) => Math.hypot(v.x - pos.x, v.z - pos.z) < R);
  async function nearPlayer(pos) {
    if (!L.place) return;
    let lanes = L.lanes.filter((ln) => near(ln.line, pos, 350));
    if (lanes.length < 3) { await loadRoads(toLatLon(pos.x, pos.z), true, 500); lanes = L.lanes.filter((ln) => near(ln.line, pos, 350)); if (!L.models.length) await loadModels(); }
    const walks = L.walks.filter((w) => near(w.line, pos, 300));
    if (!L.cars.length) spawnCars(); if (!L.peds.length) spawnPeds();
    if (lanes.length) L.cars.forEach((c) => { const ln = lanes[(Math.random() * lanes.length) | 0]; c.ln = ln; c.dir = ln.one ? 1 : (Math.random() < 0.5 ? 1 : -1); c.s = Math.random() * ln.line.len; c.y = null; });
    if (walks.length) L.peds.forEach((q) => { const w = walks[(Math.random() * walks.length) | 0]; q.w = w; q.s = Math.random() * w.line.len; q.y = null; });
    stat();
  }

  return { tick, onPlace, weather, startRace, nearPlayer, state: L, at, toLocal };
}
