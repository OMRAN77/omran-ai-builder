/* v-real-modes (المالك ٩ أكتوبر: «أحوّل المطاردة وسباق الدرون للمدينة الحقيقيّة»): وضعان فوق المدينة المصوَّرة.
   — مطاردة: ستّ بوّابات على الشوارع الحقيقيّة حول سيّارتك بالترتيب، مؤقّت وسهم للبوّابة التالية وأفضل وقت.
   — درون: حلقات مضيئة بين أعلى أسطح حقيقيّة (تُقاس بأشعّة نازلة على شبكة حول المكان)، كلّ حلقة على ٦٠٪ من أقصر
     البرجين؛ طيران W/S A/D E/Q والأسهم، والاصطدام بالمدينة يعيدك لآخر حلقة. */

const N_GATES = 6, N_RINGS = 8;

export function initModes(ctx) {
  const { THREE, scene, camera, controls, getTiles, life, DRV, say, T, $, keys } = ctx;
  const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
  const hit = (o, d, far) => { const t = getTiles(); if (!t) return null; ray.set(o, d); ray.far = far; return ray.intersectObject(t.group, true)[0] || null; };
  const best = (k) => { try { return Number(localStorage.getItem('real3d.best.' + k)) || 0; } catch (e) { return 0; } };
  const saveBest = (k, v) => { try { localStorage.setItem('real3d.best.' + k, String(v)); } catch (e) { /* guard-ok — تخزين محجوب: لا أفضل وقت */ } };
  const M = { mode: null, items: [], idx: 0, t0: 0, root: new THREE.Group(), hud: null, arrow: null, drone: null, last: null };
  scene.add(M.root);

  M.hud = document.createElement('div');
  Object.assign(M.hud.style, { position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)', zIndex: '3', background: 'rgba(10,14,22,.8)', color: '#fff', borderRadius: '14px', padding: '8px 16px', font: '800 17px ui-monospace,monospace', display: 'none', textAlign: 'center', direction: 'ltr', whiteSpace: 'pre' });
  document.body.appendChild(M.hud);

  function clear() { while (M.root.children.length) M.root.remove(M.root.children[0]); M.items = []; M.idx = 0; M.hud.style.display = 'none'; M.arrow = null; }
  function ring(r, color) {
    const g = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.08, 12, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }));
    return g;
  }
  function stop() {
    if (M.drone) { M.root.remove(M.drone); M.drone = null; controls.enabled = true; }
    M.mode = null; clear();
  }

  // —— المطاردة: بوّابات على الشوارع حول السيّارة، متباعدة ١٢٠–٢٢٠ م، بترتيب أقرب جار
  function startChase() {
    if (!DRV.car) { say(T('نزّل سيّارتك أوّلًا ثمّ ابدأ المطاردة', 'Drop your car first, then start the chase')); return; }
    const L = life.state; const p = DRV.car.position;
    const pts = [];
    for (const ln of L.lanes) for (const v of ln.line.v) { const d = Math.hypot(v.x - p.x, v.z - p.z); if (d > 60 && d < 650) pts.push(v); }
    if (pts.length < N_GATES) { say(T('ما في شوارع كافية حولك — انتظر حتّى تُجلب الشوارع أو انقل سيّارتك', 'Not enough streets around you yet')); return; }
    stop(); life.cancelRace(DRV); M.mode = 'chase';
    let cur = p.clone(); const chosen = [];
    for (let i = 0; i < N_GATES; i++) {
      let pick = null, bd = 1e9;
      for (const v of pts) {
        const d = Math.hypot(v.x - cur.x, v.z - cur.z);
        if (d < 120 || chosen.some((c) => Math.hypot(c.x - v.x, c.z - v.z) < 100)) continue;
        if (Math.abs(d - 170) < bd) { bd = Math.abs(d - 170); pick = v; }
      }
      if (!pick) break; chosen.push(pick.clone()); cur = pick;
    }
    if (chosen.length < 3) { stop(); say(T('ما قدرت أرتّب بوّابات حولك — جرّب مكانًا آخر', 'Could not place gates here')); return; }
    chosen.forEach((v, i) => {
      const g = ring(6, i === 0 ? 0x4ade80 : 0xf2a33a);
      const top = hit(new THREE.Vector3(v.x, 600, v.z), new THREE.Vector3(0, -1, 0), 2000);
      g.position.set(v.x, (top ? top.point.y : p.y) + 6, v.z);
      M.root.add(g); M.items.push(g);
    });
    M.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 16), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
    M.root.add(M.arrow);
    M.t0 = performance.now(); M.hud.style.display = 'block';
  }

  // —— الدرون: أعلى الأسطح بأشعّة على شبكة ١٫٢ كم، ثمّ حلقات بين كلّ برجين متتاليين
  function startDrone() {
    const tiles = getTiles(); if (!tiles) return;
    if (DRV.car) { $('exitBtn').click(); }
    stop(); life.cancelRace(DRV); M.mode = 'drone';
    const tops = [];
    for (let gx = -600; gx <= 600; gx += 30) for (let gz = -600; gz <= 600; gz += 30) { // شبكة ٣٠ م: برج عرضه ٣٠–٤٠ م لا يفلت
      const h = hit(new THREE.Vector3(gx, 1500, gz), new THREE.Vector3(0, -1, 0), 3000);
      if (h) tops.push(h.point.clone());
    }
    if (tops.length < 20) { stop(); say(T('المدينة لم تكتمل بعد — انتظر ثواني وجرّب', 'City still loading — try again in a few seconds')); return; }
    const ground = tops.map((t) => t.y).sort((a, b) => a - b)[Math.floor(tops.length * 0.2)];
    tops.sort((a, b) => b.y - a.y);
    const towers = [];
    for (const t of tops) { if (t.y - ground < 40) break; if (towers.every((o) => Math.hypot(o.x - t.x, o.z - t.z) > 110)) towers.push(t); if (towers.length >= N_RINGS + 1) break; }
    if (towers.length < 3) { stop(); say(T('ما في أبراج عالية كفاية هنا — جرّب المارينا أو برج خليفة', 'Not enough tall towers here')); return; }
    // ترتيب بأقرب جار من أعلى برج
    const route = [towers.shift()]; while (towers.length) { const l = route[route.length - 1]; let bi = 0, bd = 1e9; towers.forEach((t, i) => { const d = Math.hypot(t.x - l.x, t.z - l.z); if (d < bd) { bd = d; bi = i; } }); route.push(towers.splice(bi, 1)[0]); }
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i], b = route[i + 1];
      const y = ground + 0.6 * (Math.min(a.y, b.y) - ground);
      const g = ring(9, i === 0 ? 0x4ade80 : 0x38bdf8);
      g.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      g.lookAt(b.x, y, b.z); // الحلقة متعامدة على خطّ البرجين — يُعبر من جانب لآخر
      g.rotateY(Math.PI / 2);
      M.root.add(g); M.items.push(g);
    }
    // الدرون: جسم وأربع مراوح
    const d = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.5, roughness: 0.4 });
    d.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.9), mat));
    for (const [x, z] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), new THREE.MeshBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.6 }));
      arm.position.set(x, 0.18, z); d.add(arm);
    }
    const first = M.items[0].position;
    d.position.set(first.x, first.y + 15, first.z - 60);
    d.userData = { yaw: 0, v: new THREE.Vector3() };
    d.lookAt(first); d.userData.yaw = d.rotation.y;
    M.drone = d; M.root.add(d); M.last = d.position.clone();
    controls.enabled = false; M.t0 = performance.now(); M.hud.style.display = 'block';
    $('hint').textContent = T('W/S تقدّم ورجوع · A/D دوران · E/Q صعود ونزول · الأسهم انزلاق · Esc خروج', 'W/S fwd/back · A/D yaw · E/Q up/down · arrows strafe · Esc exit');
  }

  function finish(kind, secs) {
    const b = best(kind), nb = !b || secs < b; if (nb) saveBest(kind, secs.toFixed(2));
    M.hud.textContent = T('وصلت! ', 'Finished! ') + secs.toFixed(2) + ' s' + (nb ? T('  — أفضل وقت لك', '  — new best') : T('  أفضل: ', '  best: ') + b + ' s');
    M.mode = 'done-' + kind;
    setTimeout(() => { if (String(M.mode).indexOf('done') === 0) stop(); }, 8000);
  }

  function tick(dt) {
    if (!M.mode) return;
    const el = (performance.now() - M.t0) / 1000;
    M.items.forEach((g, i) => { g.visible = i >= M.idx; if (i === M.idx) g.material.color.set(0x4ade80); });
    if (M.mode === 'chase' && DRV.car) {
      const g = M.items[M.idx], p = DRV.car.position;
      const dx = g.position.x - p.x, dz = g.position.z - p.z, dist = Math.hypot(dx, dz);
      // سهم فوق السيّارة يشير إلى البوّابة التالية (المخروط رأسه +Y فيُدار ليرقد على اتّجاه الهدف)
      M.arrow.position.set(p.x, p.y + 4.2, p.z);
      M.arrow.lookAt(g.position.x, p.y + 4.2, g.position.z); M.arrow.rotateX(Math.PI / 2);
      M.hud.textContent = el.toFixed(1) + ' s   ' + (M.idx + 1) + '/' + M.items.length + '   ' + dist.toFixed(0) + ' m';
      if (dist < 12) { M.idx++; if (M.idx >= M.items.length) { M.root.remove(M.arrow); finish('chase', el); } }
      return;
    }
    if (M.mode === 'drone' && M.drone) {
      const d = M.drone, u = d.userData, k = (...c) => c.some((x) => keys.has(x));
      u.yaw += ((k('KeyA') ? 1 : 0) - (k('KeyD') ? 1 : 0)) * 1.8 * dt;
      const fwd = new THREE.Vector3(Math.sin(u.yaw), 0, Math.cos(u.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const acc = new THREE.Vector3()
        .addScaledVector(fwd, (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0))
        .addScaledVector(right, (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0))
        .addScaledVector(new THREE.Vector3(0, 1, 0), (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0));
      u.v.addScaledVector(acc, 30 * dt).multiplyScalar(1 - Math.min(0.9, 1.6 * dt));
      if (u.v.length() > 31) u.v.setLength(31); // ≈ ١١٠ كم/س
      const step = u.v.clone().multiplyScalar(dt);
      if (step.length() > 0.01) {
        const h = hit(d.position.clone(), step.clone().normalize(), step.length() + 1.5);
        if (h) { // اصطدام: رجوع لآخر حلقة
          say(T('اصطدمت! رجعت لآخر حلقة', 'Crashed! Back to the last ring')); setTimeout(() => say(''), 1500);
          d.position.copy(M.last); u.v.set(0, 0, 0);
        } else d.position.add(step);
      }
      d.rotation.set(0, u.yaw, 0); d.rotateX(Math.min(0.35, u.v.dot(fwd) * 0.012)); d.rotateZ(-Math.min(0.35, Math.max(-0.35, u.v.dot(right) * 0.012)));
      // كاميرا خلف الدرون
      const camGoal = d.position.clone().addScaledVector(fwd, -9).add(new THREE.Vector3(0, 3, 0));
      camera.position.lerp(camGoal, Math.min(1, dt * 5)); camera.lookAt(d.position.clone().addScaledVector(fwd, 8));
      const g = M.items[M.idx];
      if (g && d.position.distanceTo(g.position) < 9) { M.last = g.position.clone(); M.idx++; if (M.idx >= M.items.length) { finish('drone', el); return; } }
      M.hud.textContent = el.toFixed(1) + ' s   ' + T('حلقة ', 'ring ') + Math.min(M.idx + 1, M.items.length) + '/' + M.items.length + '   ' + Math.round(u.v.length() * 3.6) + ' km/h';
    }
  }

  addEventListener('keydown', (e) => { if (e.key === 'Escape' && M.mode === 'drone') stop(); });
  return { startChase, startDrone, stop, tick, state: M };
}
