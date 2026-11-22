// "barari" — desert, forest and snow side by side, with the sea along the east. Scene assembly, times of day,
// shots for the tools, and the playable game (wired to the shared modules the same way as the other worlds).
import * as THREE from 'three';
import { createVoxelTerrain } from '../../shared/voxel.js';
import { createPlay, createPlayPanel, goImmersive, EMPTY } from '../../shared/play.js';
import { KIT_BLOCKS, KIT_GROUPS, kitMaterial, createKit, kitItem, K } from '../../shared/kit.js';
import { createBag } from '../../shared/bag.js';
import { createHeld } from '../../shared/held.js';
import { createVitals, bars } from '../../shared/vitals.js';
import { createLife } from '../../shared/life.js';
import { extraKinds, goat, hen, bird, bear } from '../../shared/beasts.js';
import { createWeather } from '../../shared/weather.js';
import { createStatus } from '../../shared/status.js';
import { createStage, defineShot, installShotApi, markReady } from '../../shared/stage.js';
import { B, BLOCKS, NAMES, DROP, hardnessOf } from './blocks.js';
import { tileMaterial } from './tiles.js';
import { createSky, dirFrom } from './sky.js';
import { generateWorld, SITE, SX, SY, SZ, SEA } from './world.js';
import { asfoof, zamharir } from './monsters.js';
import { buildHud, SLOTS, itemIcon } from './hud.js';

// Game mode: the page is opened to be played (index.html?play, or the launcher sets window.__GAME).
const GAME = window.__GAME || (new URLSearchParams(location.search).has('play') ? {} : null);
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const FONT = "'Tajawal', sans-serif", ACCENT = '#ffb43a', LINE = 'rgba(255, 180, 58, .45)';

const stage = createStage({ fov: 70, near: 0.1, far: 700, exposure: 1 });
const { scene, camera, renderer } = stage;
scene.add(camera);

// ------------------------------------------------------------------ world
const gen = generateWorld();
const { world, anchors } = gen;
Object.assign(BLOCKS, KIT_BLOCKS);                           // the shared building kit: ids 100 and up
const materialFor = (tile, kind) => kitMaterial(tile) || tileMaterial(tile, kind);
// ice is drawn after the water under it, so a frozen pond looks frozen
const terrain = createVoxelTerrain(world, BLOCKS, { materialFor, aoCurve: [0.52, 0.7, 0.86, 1.0], onMesh: (m) => { if (m.name.startsWith('ice:')) m.renderOrder = 3; } });
scene.add(terrain.group);
window.__stats = terrain.stats;

// the sea goes on past the edge of the map: water and a sandy floor all round the land
{
  // (the shape is drawn in x / -z so that, laid flat, it faces up and its hole covers the map)
  const R = 1400, outer = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R, -R), new THREE.Vector2(R, R), new THREE.Vector2(-R, R)]);
  outer.holes.push(new THREE.Path([new THREE.Vector2(0, 0), new THREE.Vector2(0, -SZ), new THREE.Vector2(SX, -SZ), new THREE.Vector2(SX, 0)]));
  const geo = new THREE.ShapeGeometry(outer);
  geo.rotateX(-Math.PI / 2);                                 // shape y -> world -z, facing up
  const n = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < n; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
  const sea = new THREE.Mesh(geo, tileMaterial('water', 'liquid'));
  sea.position.y = SEA + 1 - 0.12; sea.renderOrder = 2; sea.name = 'sea-ring';
  const bedM = new THREE.MeshStandardMaterial({ color: 0xb7a57c, roughness: 1 });
  const bed = new THREE.Mesh(geo.clone(), bedM);
  bed.position.y = SEA - 11; bed.name = 'seabed-ring';
  scene.add(sea, bed);
}

// ------------------------------------------------------------------ first-person hand: a glove holding a hatchet
const fp = new THREE.Group();
{
  const m = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const box = (w, h, d, x, y, z, mat, p = fp) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); p.add(b); return b; };
  const tool = new THREE.Group();
  box(0.035, 0.42, 0.035, 0, 0.1, 0, m(0x8a5a30), tool);                        // handle
  box(0.04, 0.1, 0.13, 0, 0.3, -0.05, m(0xc9d1d8, 0.35), tool);                   // head
  box(0.042, 0.045, 0.03, 0, 0.3, -0.125, m(0xeef3f6, 0.25), tool);               // the bright edge
  box(0.045, 0.05, 0.045, 0, 0.3, 0.02, m(0x5a3a22), tool);                       // the wrap
  tool.rotation.set(-0.15, 0, 0);
  fp.add(tool);
  box(0.09, 0.08, 0.1, 0, 0.0, 0.01, m(0x6aa04a));                                // glove (green, like a ranger's)
  box(0.1, 0.06, 0.05, 0, -0.06, 0.02, m(0x5a8c3c));
  box(0.105, 0.26, 0.11, 0, -0.2, 0.03, m(0xd8a25a));                             // sleeve
  fp.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
}
fp.scale.setScalar(0.78); fp.position.set(0.34, -0.3, -0.56); fp.rotation.set(0.12, 0.42, 0.12);
fp.visible = false;
camera.add(fp);

// block highlight: twelve thin bars
const pickBox = new THREE.Group();
{
  const m = new THREE.MeshBasicMaterial({ color: 0x2b2116, fog: false, transparent: true, opacity: 0.75 });
  const t = 0.025, L = 1.02, h = L / 2;
  for (const [ax, a, b] of [[0, 1, 2], [1, 0, 2], [2, 0, 1]]) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const size = [t, t, t]; size[ax] = L + t;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), m);
    const p = [0, 0, 0]; p[a] = sa * h; p[b] = sb * h; bar.position.set(p[0], p[1], p[2]);
    pickBox.add(bar);
  }
}
pickBox.visible = false;
scene.add(pickBox);

// ------------------------------------------------------------------ sky + lights
const sky = createSky();
scene.add(sky.mesh);
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
scene.fog = new THREE.Fog(0xcfe6f5, 60, 260);
function aimSun(dir, cx, cy, cz, half, depth = 400) {
  sun.position.set(cx + dir.x * depth * 0.5, cy + dir.y * depth * 0.5, cz + dir.z * depth * 0.5);
  sun.target.position.set(cx, cy, cz);
  const c = sun.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = depth;
  c.updateProjectionMatrix();
  sun.shadow.normalBias = Math.max(0.03, (half * 2 / sun.shadow.mapSize.x) * 4);
}
renderer.info.autoReset = false;
const _px = new Uint8Array(4);
stage.render = () => {
  renderer.info.reset();
  renderer.render(scene, camera);
  if (stage.live) return;                                    // the running game never waits for the GPU
  const gl = renderer.getContext();                          // a screenshot right after a shot must see the finished frame
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px);
};
stage.resize();

// ------------------------------------------------------------------ times of day
const MOODS = {
  morning: {
    top: '#3f93e4', horizon: '#cfeaf9', below: '#a9d0e6', sunCol: '#fff1cf', sunDir: dirFrom(118, 34), sunSize: 0.045, cloud: 0.48, stars: 0, haze: 1,
    cloudCol: '#ffffff', cloudShade: '#c8d9ea', fog: '#cde6f6', fogNear: 70, fogFar: 300,
    hemiSky: '#dcefff', hemiGround: '#8c7a58', hemi: 1.55, sun: '#fff0d8', sunI: 2.7, light: dirFrom(118, 40), exposure: 1.0,
  },
  sunset: {
    top: '#3b5fa8', horizon: '#ffb07a', below: '#c7896c', sunCol: '#ffa864', sunDir: dirFrom(262, 5), sunSize: 0.06, cloud: 0.55, stars: 0.05, haze: 2.2,
    cloudCol: '#ffd2a8', cloudShade: '#8f6a86', fog: '#e6b08e', fogNear: 45, fogFar: 240,
    hemiSky: '#ffd0ae', hemiGround: '#5c4a4e', hemi: 1.05, sun: '#ffb27a', sunI: 2.1, light: dirFrom(262, 14), exposure: 1.0,
  },
  night: {
    top: '#0a1530', horizon: '#22365f', below: '#0f182c', sunCol: '#6d84c4', sunDir: dirFrom(262, -30), sunSize: 0.04, cloud: 0.3, stars: 1, haze: 0,
    cloudCol: '#3a4c74', cloudShade: '#1c2640', fog: '#16243f', fogNear: 25, fogFar: 170,
    hemiSky: '#6077b5', hemiGround: '#1b2133', hemi: 0.6, sun: '#a9bcff', sunI: 0.55, light: dirFrom(200, 42), exposure: 1.0,
  },
};
let mood = MOODS.morning, base = null;
function setMood(name, rain = false) {
  const m = MOODS[name];
  mood = m;
  const u = sky.uniforms, dim = rain ? 0.62 : 1;
  u.uTop.value.set(m.top).multiplyScalar(dim); u.uHorizon.value.set(m.horizon).multiplyScalar(dim); u.uBelow.value.set(m.below).multiplyScalar(dim);
  u.uSunCol.value.set(m.sunCol).multiplyScalar(rain ? 0.35 : 1); u.uSunDir.value.copy(m.sunDir); u.uSunSize.value = rain ? 0 : m.sunSize;
  u.uMoonDir.value.copy(dirFrom(200, 42)); u.uStars.value = m.stars * (rain ? 0.2 : 1); u.uHaze.value = m.haze;
  u.uCloud.value = rain ? 1 : m.cloud; u.uCloudCol.value.set(m.cloudCol).multiplyScalar(rain ? 0.7 : 1); u.uCloudShade.value.set(m.cloudShade).multiplyScalar(rain ? 0.7 : 1);
  scene.fog.color.set(m.fog).multiplyScalar(rain ? 0.72 : 1); scene.fog.near = m.fogNear * (rain ? 0.5 : 1); scene.fog.far = m.fogFar * (rain ? 0.55 : 1);
  hemi.color.set(m.hemiSky); hemi.groundColor.set(m.hemiGround); hemi.intensity = m.hemi * (rain ? 0.8 : 1);
  sun.color.set(m.sun); sun.intensity = m.sunI * (rain ? 0.45 : 1);
  renderer.toneMappingExposure = m.exposure * (rain ? 0.9 : 1);
  base = { fog: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far };
  under = null;                                              // look again whether the camera is under water
}
let under = null;
const underEl = document.getElementById('under');
/** Under water the picture closes in, blue. */
function setUnder(on) {
  if (on === under) return;
  under = on; underEl.hidden = !on;
  tileMaterial('water', 'liquid').side = on ? THREE.DoubleSide : THREE.FrontSide;      // from below, the surface is seen only from in the water
  if (on) { scene.fog.color.set('#145a82').multiplyScalar(mood === MOODS.night ? 0.35 : 1); scene.fog.near = 0.5; scene.fog.far = 26; }
  else if (base) { scene.fog.color.copy(base.fog); scene.fog.near = base.near; scene.fog.far = base.far; }
}

function look(px, py, pz, tx, ty, tz, fov = 70) {
  camera.fov = fov; camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
const solidAt = (x, y, z) => { const id = world.get(Math.floor(x), Math.floor(y), Math.floor(z)); return id && (BLOCKS[id].kind ?? 'solid') !== 'cross' && id !== B.WATER && BLOCKS[id].kind !== 'none'; };
function standY(x, z, near = SY - 2) { let y = Math.floor(near); while (y > 1 && !solidAt(x, y - 1, z)) y--; return y; }

const hud = buildHud(document.getElementById('hud'));

// ------------------------------------------------------------------ shots
defineShot('hero', () => {
  hud.show(false); fp.visible = false; pickBox.visible = false;
  setMood('morning'); setUnder(false);
  const px = 150, pz = 142, py = 54;
  look(px, py, pz, 80, 26, 72, 60);
  aimSun(mood.light, 100, 26, 90, 100);
});
defineShot('play', () => {
  hud.show(true); fp.visible = true; pickBox.visible = false;
  setMood('morning'); setUnder(false);
  const s = anchors.spawn, ey = s.y + 1.62;
  camera.fov = 70; camera.position.set(s.x, ey, s.z);
  camera.rotation.set(-0.12, s.yaw, 0, 'YXZ'); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  aimSun(mood.light, s.x, s.y, s.z, 60);
});
// views of each land, for checking by eye (tools/shot.cjs --shots desert,forest,snow,sea)
const view = (name, p, t, time = 'morning') => defineShot(name, () => { hud.show(false); fp.visible = false; pickBox.visible = false; setMood(time); setUnder(false); look(...p, ...t, 66); aimSun(mood.light, t[0], t[1], t[2], 80); });
view('desert', [70, 40, 168], [86, 24, 132]);
view('forest', [40, 36, 118], [80, 24, 86]);
view('snow', [96, 48, 70], [70, 34, 26]);
view('sea', [118, 34, 96], [160, 14, 70]);
view('night', [40, 36, 118], [80, 24, 86], 'night');

// ------------------------------------------------------------------ the playable game
const own = (id) => ({ key: 'b' + id, id, name: NAMES[id], n: 64 });
const CATALOGUE = [
  { key: 'axe', icon: 'axe', name: 'الفأس', tool: true },
  ...[B.OAK, B.PINE, B.PALM, B.PLANKS, B.OAK_LEAVES, B.PINE_NEEDLES, B.PALM_FROND, B.GRASS, B.DIRT, B.SAND, B.SANDSTONE, B.STONE, B.DEEPROCK, B.GRAVEL,
    B.SNOWBLOCK, B.ICE, B.TUFT, B.FLOWER_R, B.FLOWER_Y, B.FLOWER_B, B.SHRUB, B.REED].map(own),
];
const LANDS = { snow: 'الثلج', forest: 'الغابة', desert: 'البر', sea: 'البحر' };
const CLOCK = { morning: ['08:20', 'الصبح'], sunset: ['18:40', 'المغرب'], night: ['23:10', 'الليل'] };

async function startGame() {
  await window.__shot('play');
  stage.live = true;
  const eu = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  const slots = [...SLOTS.map((q) => ({ ...q, id: q.block ? B[q.block] : 0 })), kitItem(K.TORCH, 8), EMPTY].slice(0, hud.shown);
  const kit = createKit({ scene, world, terrain });
  for (const f of anchors.fires) kit.lit(f.x, f.y, f.z, K.FIRE);      // the fires deep in the caves give real light
  const heldBlock = createHeld({ camera, blocks: BLOCKS, materialFor });
  let toolInHand = true, aimed = null, hintTimer = 0, wasNight = false, digT = 0;
  const fpHome = fp.position.clone(), fpRot = fp.rotation.clone();
  const isLiquid = (id) => id === B.WATER || kit.isLiquid(id);
  /** A block dug next to water lets the water in (no dry holes in the sea or a pond). */
  function letWaterIn(x, y, z) {
    if (world.get(x, y, z) !== 0) return;
    const wet = world.get(x, y + 1, z) === B.WATER || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => world.get(x + a, y, z + b) === B.WATER);
    if (wet) terrain.setBlock(x, y, z, B.WATER);
  }

  let life = null, weather = null, status = null, vitals = null;
  const play = createPlay({
    camera, canvas: stage.canvas, world, blocks: BLOCKS, terrain,
    spawn: { x: anchors.spawn.x, y: anchors.spawn.y, z: anchors.spawn.z, yaw: eu.y, pitch: eu.x },
    slots, touch: hud.touch ? hud.els : null, maxPixelRatio: 2,
    isLiquid, heightOf: kit.heightOf,
    canBreak: (id, x, y) => y > 0,
    hardness: (id) => kit.hardness(id) ?? hardnessOf(id, BLOCKS[id] && BLOCKS[id].kind),
    dropOf: (id) => (id in DROP ? DROP[id] : kit.dropOf(id)),
    onTarget(h) { pickBox.visible = !!h; if (h) pickBox.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5); hud.setTarget(h ? NAMES[h.id] || kit.nameOf(h.id) || 'مكعب' : null); },
    onBreak(h) { kit.broke(h); if (!h.remote) letWaterIn(h.x, h.y, h.z); },
    onPlace(x, y, z, id) { kit.placed(x, y, z, id, play.state.yaw); },
    onInventory(list, sel) {
      hud.setSlots(list, sel);
      const it = list[sel], block = it && it.id && (!it.tool || it.model) && (BLOCKS[it.id] || it.model) ? it.id : 0;
      heldBlock.show(block); toolInHand = !block; fp.visible = toolInHand;
    },
    onBag() { bag.toggle(); },
    onInteract: (h) => bag.interact(h),
    onMenu() { if (weather) weather.toggle(); },
    onUse: (item) => (life ? life.use(item) : false),
    onFly(on) { play.notice(on ? (hud.touch ? 'الطيران شغّال. زر النط يطلّعك وزر «نزول» ينزّلك، والمشي ما يطيّحك. النط مرّتين يوقفه.' : 'الطيران شغّال. المسافة تطلّعك وShift ينزّلك. المسافة مرّتين توقفه.') : 'وقف الطيران.', false, on ? 4500 : 1800); },
    onUnlock() { play.stop(); panel.show('pause'); },
    onFirstLook() { hud.els.lookzone.hidden = true; },
    onFrame(st, dt) {
      const d = st.dig, p = st.pos;
      hud.setProgress(d.on ? d.progress : 0);
      kit.update(p, dt, st.time);
      if (vitals) vitals.update(dt);
      if (life) life.update(dt);
      if (weather) weather.update(dt);
      if (status) status.update();
      const land = gen.landOf(p.x, p.z);
      hud.setLand(LANDS[land], ((-st.yaw * 180 / Math.PI) % 360 + 360) % 360);
      // what the needs do here: thirst comes fastest in the desert; the cold bites only in the snow (less in a fur coat)
      if (vitals) {
        const [water, warm] = vitals.needs, coat = st.gear && st.gear.chest && st.gear.chest.warm;
        water.drain = land === 'desert' ? 0.42 : land === 'snow' ? 0.16 : 0.22;
        warm.drain = land === 'snow' ? (coat ? 0.14 : 0.5) : -3;
      }
      const sk = window.__GAME_SKY || {};
      // the night's monsters go to dust when the sun comes up
      if (wasNight && !sk.night && life && life.share.mode !== 'guest') for (const e of life.ents) if (e.k.kind === 'monster' && !e.dead) { e.hp = 0; e.dead = 0.0001; }
      wasNight = !!sk.night;
      // rain over the snow falls as snow: white flakes, and the clock says so
      if (weather) {
        const snowing = sk.rain && land === 'snow';
        weather.rain.material.uniforms.uColor.value.set(snowing ? '#f4f8ff' : '#a6b8cc');
        clockLabel(sk.time, sk.rain, snowing);
      }
      sky.uniforms.uTime.value = st.time;
      const wm = tileMaterial('water', 'liquid');
      if (wm.map) { wm.map.offset.set(st.time * 0.02, st.time * 0.013); if (wm.normalMap) wm.normalMap.offset.copy(wm.map.offset); }
      const c = camera.position;
      setUnder(world.get(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)) === B.WATER);
      // the hand: sways with each step, swings while digging
      const bob = st.onGround ? Math.min(1, st.moving / 4) : 0;
      digT = d.on && toolInHand ? digT + dt : 0;
      fp.position.set(fpHome.x + Math.sin(st.time * 4.6) * 0.01 * bob, fpHome.y + Math.abs(Math.sin(st.time * 9.2)) * 0.014 * bob, fpHome.z);
      fp.rotation.set(fpRot.x - (digT > 0 ? Math.abs(Math.sin(digT * 11)) * 0.7 : 0), fpRot.y, fpRot.z);
      if (!aimed || Math.hypot(p.x - aimed.x, p.z - aimed.z) > 14) { aimed = { x: Math.round(p.x / 4) * 4, z: Math.round(p.z / 4) * 4 }; aimSun(mood.light, aimed.x, p.y, aimed.z, 60); }
      if (hud.touch && hintTimer >= 0 && (hintTimer += dt) > 7) { hud.els.lookzone.hidden = true; hintTimer = -1; }
    },
    stage, render: () => stage.render(),
    setPixelRatio: (pr) => { stage.pixelRatio = pr; stage.resize(); },
  });
  let lastClock = '';
  function clockLabel(time, rain, snowing) {
    const c = CLOCK[time] || CLOCK.morning, lbl = (rain ? (snowing ? 'ثلج يطيح · ' : 'مطر · ') : '') + c[1], key = c[0] + lbl;
    if (key === lastClock) return;
    lastClock = key; hud.setClock(c[0], lbl, time === 'night');
  }
  const bag = createBag({
    play, kit, camera, world: 'barari', shown: hud.shown, onMenu: () => { play.stop(); panel.show('pause'); },
    mats: { wood: { ids: [B.OAK, B.PINE, B.PALM, B.PLANKS], name: 'خشب' }, stone: { ids: [B.STONE, B.SANDSTONE, B.DEEPROCK], name: 'صخر' }, ore: { ids: [], name: 'خام معدن' } },
    groups: [{ title: 'براري', items: CATALOGUE }, ...KIT_GROUPS],
    iconOf: (it) => itemIcon(it),
    fontFamily: FONT, accent: ACCENT, line: LINE,
    extra: { label: 'الوقت والجو', onClick: () => weather && weather.open() },
  });
  hud.els.bag.addEventListener('pointerdown', (e) => { if (play.state.running) { bag.toggle(); e.preventDefault(); } });
  hud.setSlots(slots, 0);
  hud.setTarget(null);
  hud.els.hotbar.addEventListener('pointerdown', (e) => { const el = e.target.closest('.slot'); if (el && play.state.running) { play.select(+el.dataset.i); e.preventDefault(); } });
  const panel = createPlayPanel({
    title: 'براري', tagline: 'بر وغابة وثلج وبحر. اقطع الشجر، انزل الكهوف، وابنِ بيتك.',
    fontFamily: FONT, accent: ACCENT, line: LINE, touch: hud.touch,
    note: 'نسخة تجريبية: الوقت والمطر والوحوش تختارها من لوحة Q (وعلى الجوال من زر داخل الحقيبة). الوحوش تطلع في الليل.',
    onStart() { if (hud.touch) goImmersive(); else play.lock(); play.start(); },
  });
  panel.show('start');
  // health, water and warmth: water comes back in any water (the sea, a pond), warmth beside a fire
  const vq = (sel) => document.querySelector('#hud .vit.' + sel);
  const write = { hp: bars.width(vq('hp .bar i'), vq('hp .num')), water: bars.width(vq('water .bar i'), vq('water .num')), warm: bars.width(vq('warm .bar i'), vq('warm .num')) };
  vitals = createVitals({
    play, kit, world, hp: 100,
    needs: [
      { key: 'water', start: 85, drain: 0.22, how: 'water', gain: 9, low: 'عطشت. ادخل الماي (البحر أو بركة) عشان تشرب.' },
      { key: 'warm', start: 100, drain: -3, how: 'fire', gain: 9, range: 4.5, wet: 1.6, rainDrain: 1.5, nightDrain: 1.4, low: 'بردت. ولّع نار، أو البس معطف فرو، أو انزل للغابة.' },
    ],
    render(v) { write.hp(v.hp); write.water(v.water); write.warm(v.warm); vq('water').classList.toggle('warn', v.water < 25); vq('warm').classList.toggle('warn', v.warm < 30); },
  });
  // creatures: each lives in its own land; the two monsters come out at night
  const L = (x, z) => gen.landOf(x, z);
  const onLand = (x, z) => L(x, z) !== 'sea';
  const nightly = (k, n) => {
    let set = null;                                          // a test or a tool may pin the number
    Object.defineProperty(k, 'max', { enumerable: true, configurable: true, get: () => (set !== null ? set : window.__GAME_SKY && window.__GAME_SKY.night ? n : 0), set: (v) => { set = v; } });
    return k;
  };
  life = createLife({
    scene, camera, play, world, vitals: () => vitals,
    kinds: [
      { key: 'goat', name: 'عنز', kind: 'animal', make: () => goat(), hp: 8, speed: 2.0, radius: 0.55, height: 1.05, max: 3, drops: [[K.MEAT, 1], [K.FUR, 1]], where: (x, y, z) => L(x, z) === 'desert' || L(x, z) === 'forest' },
      { key: 'hen', name: 'دياية', kind: 'animal', make: () => hen(), hp: 4, speed: 1.7, radius: 0.4, height: 0.9, max: 3, drops: [[K.CHICKEN, 1], [K.FEATHER, 2]], where: (x, y, z) => L(x, z) === 'desert' || L(x, z) === 'forest' },
      { key: 'sparrow', name: 'عصفور', kind: 'animal', make: () => bird({ body: 0x9a6a3e, belly: 0xf3e2c4, beak: 0xe2a03a }), hp: 2, speed: 2.6, radius: 0.4, height: 0.45, max: 3, fly: 3.0, perch: true, drops: [[K.FEATHER, 1]], where: (x, y, z) => onLand(x, z) },
      { key: 'gull', name: 'نورس', kind: 'animal', make: () => bird({ body: 0xe9edf1, belly: 0xffffff, beak: 0xf0a020 }), hp: 2, speed: 2.9, radius: 0.4, height: 0.45, max: 2, fly: 4.4, perch: true, drops: [[K.FEATHER, 1]], where: (x, y, z) => gen.weights(x, z).sea > -18 },
      { key: 'bear', name: 'دب', kind: 'animal', make: () => bear(), hp: 26, speed: 2.3, radius: 0.9, height: 1.55, max: 1, likes: 'meat', fights: true, dmg: 9, drops: [[K.MEAT, 3], [K.FUR, 2]], where: (x, y, z) => L(x, z) === 'snow' || (L(x, z) === 'forest' && z < 88) },
      ...extraKinds('barari'),
      nightly({ key: 'asfoof', name: 'العاصوف', kind: 'monster', make: () => asfoof(), hp: 14, speed: 2.5, radius: 0.75, height: 1.7, dmg: 7, where: (x, y, z) => z > 92 && onLand(x, z) }, 1),
      nightly({ key: 'zamharir', name: 'الزمهرير', kind: 'monster', make: () => zamharir(), hp: 18, speed: 2.2, radius: 0.6, height: 2.5, dmg: 9, where: (x, y, z) => z < 82 && onLand(x, z) }, 1),
    ],
  });
  status = createStatus({ play, mount: document.querySelector('#hud .bar-wrap'), vitals: () => vitals, life: () => life, accent: ACCENT, hide: [vq('hp')] });
  // the world panel (Q): morning, sunset or night, clear or rain
  weather = createWeather({
    play, scene, camera, time: 'morning', fontFamily: FONT, accent: ACCENT, line: LINE,
    apply(time, rain) {
      setMood(time, rain);
      aimed = null;                                          // the sun moved: aim the shadow map again
      lastClock = '';
      clockLabel(time, rain, rain && gen.landOf(play.state.pos.x, play.state.pos.z) === 'snow');
    },
  });
  clockLabel('morning', false, false);
  window.__play = play;
  window.__game = { play, panel, terrain, world, B, slots, bag, kit, camera, vitals, life, weather, status, gen };
}

installShotApi(stage);
await Promise.all(["500 14px 'Tajawal'", "700 14px 'Tajawal'"].map((f) => document.fonts.load(f, 'براري').catch(() => null)));     // a font that cannot be fetched must not stop the game
if (GAME) await startGame(); else await window.__shot('hero');
markReady();
