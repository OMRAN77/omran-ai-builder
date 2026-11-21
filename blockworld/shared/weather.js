// The world panel (key Q): the player picks the time of day, the weather, and whether monsters roam.
// Each world lights its own morning, sunset and night; this module owns the choice, the panel, and the rain.
//
//   const sky = createWeather({
//     play, scene, camera, time: 'sunset', times: [[key, name], ...],   // times: optional, the default is morning / sunset / night
//     apply(time, rain),            // 'morning' | 'sunset' | 'night', and whether it rains: light the world
//     fontFamily, accent, line,
//   });
//   createPlay({ onMenu: () => sky.toggle(), ... });   onFrame -> sky.update(dt)
//
// window.__GAME_SKY = { time, rain, night } is what the vitals and the creatures read.

import * as THREE from 'three';

export const TIMES = [['morning', 'الصبح'], ['sunset', 'المغرب'], ['night', 'الليل']];

const CSS = `
#skyPanel { position: fixed; inset: 0; z-index: 46; display: flex; align-items: center; justify-content: center; direction: rtl; color: #f1f4f8;
  background: rgba(3, 6, 10, .28); -webkit-user-select: none; user-select: none; touch-action: manipulation; }
#skyPanel[hidden] { display: none; }
#skyPanel .box { box-sizing: border-box; width: min(470px, calc(100vw - 20px)); max-height: calc(100vh - 12px); overflow-y: auto; padding: 12px 18px 16px; border-radius: 14px;
  background: rgba(10, 14, 20, .9); border: 1px solid var(--sk-line, rgba(255, 255, 255, .24)); box-shadow: 0 18px 60px rgba(0, 0, 0, .55); }
#skyPanel header { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
#skyPanel h2 { margin: 0; flex: 1; font-size: 20px; font-weight: 700; color: var(--sk-accent, #fff); }
#skyPanel .x { font: inherit; font-size: 14px; font-weight: 700; min-width: 44px; min-height: 40px; padding: 4px 14px; border-radius: 9px; border: 1px solid var(--sk-line, rgba(255, 255, 255, .3)); background: none; color: inherit; cursor: pointer; }
#skyPanel h3 { margin: 12px 2px 6px; font-size: 13.5px; font-weight: 700; opacity: .8; }
#skyPanel .row { display: flex; gap: 6px; }
#skyPanel button { -webkit-tap-highlight-color: transparent; outline: none; }
#skyPanel .row button { flex: 1; font: inherit; font-size: 15px; font-weight: 700; min-height: 46px; padding: 6px 4px; border-radius: 10px; color: inherit; cursor: pointer;
  background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .14); }
#skyPanel .row button.on { color: #0b0f14; background: var(--sk-accent, #fff); border-color: var(--sk-accent, #fff); }
#skyPanel p { margin: 12px 2px 0; font-size: 12px; line-height: 1.6; opacity: .7; }
@media (max-height: 430px) { #skyPanel .box { padding: 6px 14px 9px; } #skyPanel h2 { font-size: 16px; } #skyPanel h3 { margin: 6px 2px 4px; font-size: 12px; } #skyPanel .row button { min-height: 40px; font-size: 14px; } #skyPanel p { display: none; } }
`;

/** Rain: streaks that fall in a box that follows the camera. All the motion is in the vertex shader. */
function makeRain() {
  const N = 1500, pos = new Float32Array(N * 4 * 3), end = new Float32Array(N * 4 * 2), idx = new Uint16Array(N * 6);
  let s = 4242;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < N; i++) {
    const x = rnd(), y = rnd(), z = rnd();
    for (let v = 0; v < 4; v++) { pos.set([x, y, z], (i * 4 + v) * 3); end.set([v < 2 ? 0 : 1, v % 2 ? 1 : -1], (i * 4 + v) * 2); }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uColor: { value: new THREE.Color(0.62, 0.7, 0.8) } },
    vertexShader: /* glsl */`
      attribute vec2 aEnd; uniform float uTime; varying float vA;
      const vec3 BOX = vec3(26.0, 18.0, 26.0);
      void main() {
        float speed = 15.0 + 7.0 * fract(position.x * 37.0 + position.z * 17.0);
        vec3 p = position * BOX;
        p.y -= uTime * speed;
        p.xz += vec2(0.16, 0.05) * p.y;                       // a slant, as if a wind leaned on it
        vec3 c = cameraPosition + mod(p - cameraPosition, BOX) - 0.5 * BOX;
        vec3 fall = vec3(-0.16, -1.0, -0.05) * 0.062;          // a streak is this long, per unit of speed
        vec3 w = c + fall * speed * aEnd.x * 0.5;
        vec3 view = w - cameraPosition;
        vec3 side = cross(fall, view);
        float d = length(view);
        side = side / max(length(side), 0.0001) * clamp(d * 0.0013, 0.003, 0.014) * aEnd.y;     // about a pixel and a half wide at any distance
        vA = (1.0 - smoothstep(8.0, 13.0, d)) * smoothstep(1.2, 3.0, d);
        gl_Position = projectionMatrix * viewMatrix * vec4(w + side, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmt; uniform vec3 uColor; varying float vA;
      void main() { gl_FragColor = vec4(uColor, 0.4 * vA * uAmt); }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 50; mesh.visible = false;
  return mesh;
}

export function createWeather(o) {
  const { play } = o, st = play.state;
  const times = o.times || TIMES;
  const state = { time: o.time || 'sunset', rain: false, get night() { return state.time === 'night'; } };
  window.__GAME_SKY = state;
  const rain = makeRain();
  o.scene.add(rain);
  let amt = 0, clock = 0;

  const css = document.createElement('style');
  css.textContent = CSS;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'skyPanel'; el.hidden = true;
  el.style.fontFamily = o.fontFamily || 'sans-serif';
  if (o.accent) el.style.setProperty('--sk-accent', o.accent);
  if (o.line) el.style.setProperty('--sk-line', o.line);
  const row = (name, list) => `<div class="row">${list.map(([k, t]) => `<button type="button" data-${name}="${k}">${t}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="box" role="dialog" aria-label="العالم"><header><h2>العالم</h2><button type="button" class="x">إغلاق</button></header>
    <h3>الوقت</h3>${row('time', times)}
    <h3>الجو</h3>${row('rain', [['0', 'صافي'], ['1', 'مطر']])}
    <h3>الوحوش</h3>${row('mon', [['1', 'موجودة'], ['0', 'بدون']])}
    <p>اللي تختاره يتغيّر على طول. في الليل الوحوش أكثر.</p></div>`;
  document.body.appendChild(el);
  const mons = () => { const l = window.__GAME_LIFE; return l ? l.monsters : true; };
  function mark() {
    for (const b of el.querySelectorAll('[data-time]')) b.classList.toggle('on', b.dataset.time === state.time);
    for (const b of el.querySelectorAll('[data-rain]')) b.classList.toggle('on', (b.dataset.rain === '1') === state.rain);
    for (const b of el.querySelectorAll('[data-mon]')) b.classList.toggle('on', (b.dataset.mon === '1') === mons());
  }
  function set(time, rainOn) {
    if (!times.some((t) => t[0] === time)) return;
    state.time = time; state.rain = !!rainOn;
    o.apply(state.time, state.rain);
    rain.visible = state.rain || amt > 0.01;
    if (play.sound && play.sound.rain) play.sound.rain(state.rain);
    mark();
  }
  let open = false, openedAt = 0;
  function show(v) {
    if (v === open || (v && st.modal)) return;                // one panel at a time: the bag stays if it is up
    open = v; el.hidden = !v;
    if (v) { openedAt = performance.now(); mark(); }
    play.setModal(v);
  }
  el.addEventListener('click', (e) => {
    if (performance.now() - openedAt < 350) return;          // the tap that opened the panel must not also press a button in it
    const b = e.target.closest('button');
    if (!b) { if (e.target === el) show(false); return; }
    if (b.classList.contains('x')) { show(false); return; }
    if (play.sound) play.sound.ui();
    if (b.dataset.time) set(b.dataset.time, state.rain);
    else if (b.dataset.rain) set(state.time, b.dataset.rain === '1');
    else if (b.dataset.mon) { const l = window.__GAME_LIFE; if (l) l.setMonsters(b.dataset.mon === '1'); mark(); }
  });
  window.addEventListener('keydown', (e) => { if (open && (e.code === 'Escape' || e.code === 'KeyQ') && !e.repeat) { show(false); e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  function update(dt) {
    clock += dt;
    amt += ((state.rain ? 1 : 0) - amt) * Math.min(1, dt * 1.5);
    rain.visible = amt > 0.01;
    rain.material.uniforms.uTime.value = clock % 3600;
    rain.material.uniforms.uAmt.value = amt;
  }
  return { el, state, set, update, rain, open: () => show(true), close: () => show(false), toggle: () => show(!open), isOpen: () => open };
}
