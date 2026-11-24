// "barari" — an endless land: plains, forests, deserts, snow country and mountains, beaches and seas, as far as
// the eye can see. Scene assembly, the far view, times of day, shots for the tools, and the playable game (wired to
// the shared modules the same way as the other worlds).
// The same engine draws the world of the dinosaurs (mode 'dino', see mode.js and styles/dino/): its own ground,
// blocks, sky, words and creatures; everything below that says DINO is that world, the rest is shared.
import * as THREE from 'three';
import { createStreamTerrain } from '../../shared/stream.js';
import { createPlay, createPlayPanel, goImmersive, EMPTY } from '../../shared/play.js';
import { KIT_BLOCKS, KIT_GROUPS, kitMaterial, createKit, kitItem, K } from '../../shared/kit.js';
import { createBag } from '../../shared/bag.js';
import { createHeld } from '../../shared/held.js';
import { createVitals, bars } from '../../shared/vitals.js';
import { createLife } from '../../shared/life.js';
import { extraKinds, landKinds } from '../../shared/beasts.js';
import { createWeather } from '../../shared/weather.js';
import { createStatus } from '../../shared/status.js';
import { createStage, defineShot, installShotApi, markReady } from '../../shared/stage.js';
import { B, BLOCKS, NAMES, DROP, hardnessOf } from './blocks.js';
import { tileMaterial, tileArray } from './tiles.js';
import { createSky, dirFrom } from './sky.js';
import { generateWorld, SY } from './world.js';
import { createFarView } from './far.js';
import { asfoof, zamharir } from './monsters.js';
import { buildHud, SLOTS, itemIcon } from './hud.js';
import { DINO } from './mode.js';

const D = DINO ? await import('../dino/look.js') : null;      // the dinosaur world's sky, words and bag
// each world's wonders (lighthouses and tides, seasons, totems, cloud islands; or hatchery, resonance towers, balloons, amber bridges)
const IDEAS = DINO ? await import('../dino/ideas.js') : await import('./ideas.js');

// Game mode: the page is opened to be played (index.html?play, or the launcher sets window.__GAME).
const GAME = window.__GAME || (new URLSearchParams(location.search).has('play') ? {} : null);
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const FONT = "'Tajawal', sans-serif", ACCENT = '#ffb43a', LINE = 'rgba(255, 180, 58, .45)';

const stage = createStage({ fov: 70, near: 0.1, far: 1900, exposure: 1 });
const { scene, camera, renderer } = stage;
scene.add(camera);

// ------------------------------------------------------------------ world
const gen = generateWorld();
const { world, anchors } = gen;
Object.assign(BLOCKS, KIT_BLOCKS);                           // the shared building kit: ids 100 and up
const materialFor = (tile, kind) => kitMaterial(tile) || tileMaterial(tile, kind);
// how far the blocks reach round the player: less on a phone, and less again when the picture is set to fast
const radiusFor = () => { const m = (window.__GAME_QUALITY || {}).mode, r = COARSE ? 64 : 88; return m === 'fast' ? r - 24 : m === 'sharp' ? r + 16 : r; };
// ice is drawn after the water under it, so a frozen pond looks frozen
const TA = tileArray();                                      // the own tiles as one texture: a few draw calls a chunk
const terrain = createStreamTerrain(world, BLOCKS, {
  materialFor, layerOf: TA.layerOf, arrayMaterial: TA.material, arrayDepth: TA.depth,
  aoCurve: [0.52, 0.7, 0.86, 1.0], radius: radiusFor(), budget: COARSE ? 4 : 6,
  onMesh: (m) => { if (m.name.startsWith('ice:')) m.renderOrder = 3; },
  onDrop: () => { if (dropped) dropped(); },
});
let dropped = null;
scene.add(terrain.group);
window.__stats = terrain.stats;
// beyond the blocks: the far land, out to the horizon
const far = createFarView({ sample: gen.farSample, chunk: world.C, isLoaded: terrain.isLoaded, rings: COARSE ? [{ step: 4, n: 96 }, { step: 16, n: 144 }] : undefined });      // a little lighter on a phone
scene.add(far.group);
/** Make the blocks and the far land round (x, z) at once (the start, a shot). */
function around(x, z) { terrain.prime(x, z); far.prime(x, z); }

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
// smoke over the volcanoes near the player (the dinosaur world)
const smoke = D ? D.createSmoke() : null;
if (smoke) scene.add(smoke.group);
let vols = [], volsAt = null;
/** The smoke follows the nearest volcanoes; the list is looked up again when the camera has gone 200 blocks. */
function updateSmoke(t) {
  if (!smoke) return;
  const c = camera.position;
  if (!volsAt || Math.hypot(c.x - volsAt.x, c.z - volsAt.z) > 200) { volsAt = { x: c.x, z: c.z }; vols = gen.volcanoesNear(c.x, c.z, 1400); }
  const nite = mood === MOODS.night ? 1 : mood === MOODS.sunset ? 0.35 : 0;
  smoke.update(vols, t, c, scene.fog.far, nite, nite);
}
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
  if (smoke) updateSmoke(performance.now() / 1000);
  renderer.render(scene, camera);
  if (stage.live) return;                                    // the running game never waits for the GPU
  const gl = renderer.getContext();                          // a screenshot right after a shot must see the finished frame
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px);
};
stage.resize();

// ------------------------------------------------------------------ times of day
const MOODS = {
  morning: {
    top: '#3f93e4', horizon: '#cfeaf9', below: '#cde6f6', sunCol: '#fff1cf', sunDir: dirFrom(118, 34), sunSize: 0.045, cloud: 0.48, stars: 0, haze: 1,
    cloudCol: '#ffffff', cloudShade: '#c8d9ea', fog: '#cde6f6', fogNear: 120, fogFar: 1200,
    hemiSky: '#dcefff', hemiGround: '#8c7a58', hemi: 1.55, sun: '#fff0d8', sunI: 2.7, light: dirFrom(118, 40), exposure: 1.0,
  },
  sunset: {
    top: '#3b5fa8', horizon: '#ffb07a', below: '#c7896c', sunCol: '#ffa864', sunDir: dirFrom(262, 5), sunSize: 0.06, cloud: 0.55, stars: 0.05, haze: 2.2,
    cloudCol: '#ffd2a8', cloudShade: '#8f6a86', fog: '#e6b08e', fogNear: 80, fogFar: 900,
    hemiSky: '#ffd0ae', hemiGround: '#5c4a4e', hemi: 1.05, sun: '#ffb27a', sunI: 2.1, light: dirFrom(262, 14), exposure: 1.0,
  },
  night: {
    top: '#0a1530', horizon: '#22365f', below: '#0f182c', sunCol: '#6d84c4', sunDir: dirFrom(262, -30), sunSize: 0.04, cloud: 0.3, stars: 1, haze: 0,
    cloudCol: '#3a4c74', cloudShade: '#1c2640', fog: '#16243f', fogNear: 25, fogFar: 170,
    hemiSky: '#6077b5', hemiGround: '#1b2133', hemi: 0.6, sun: '#a9bcff', sunI: 0.55, light: dirFrom(200, 42), exposure: 1.0,
  },
};
if (D) Object.assign(MOODS, D.moods(dirFrom));                // warm and hazy over the jungle
let mood = MOODS.morning, base = null;
function setMood(name, rain = false) {
  const m = MOODS[name];
  mood = m;
  const u = sky.uniforms, dim = rain ? m.rainDim ?? 0.62 : 1, cd = rain ? m.rainDim ?? 0.58 : 1;      // (a hazy sky says how dark its rain is)
  u.uTop.value.set(m.top).multiplyScalar(dim); u.uHorizon.value.set(m.horizon).multiplyScalar(dim); u.uBelow.value.set(m.below).multiplyScalar(dim);
  u.uSunCol.value.set(m.sunCol).multiplyScalar(rain ? 0.35 : 1); u.uSunDir.value.copy(m.sunDir); u.uSunSize.value = rain ? 0 : m.sunSize;
  u.uMoonDir.value.copy(dirFrom(200, 42)); u.uStars.value = m.stars * (rain ? 0.2 : 1); u.uHaze.value = m.haze * (rain && m.rainDim ? 0.3 : 1);
  u.uCloud.value = rain ? 1 : m.cloud; u.uCloudCol.value.set(m.cloudCol).multiplyScalar(cd); u.uCloudShade.value.set(m.cloudShade).multiplyScalar(cd);
  // under rain the far land goes grey and close (the view is wide on a clear day, so it closes in more than it used to)
  scene.fog.color.set(m.fog).multiplyScalar(rain ? 0.66 : 1); scene.fog.near = m.fogNear * (rain ? 0.3 : 1); scene.fog.far = m.fogFar * (rain ? 0.3 : 1);
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
  if (DINO) tileMaterial('swampWater', 'liquid').side = on ? THREE.DoubleSide : THREE.FrontSide;
  if (DINO) underEl.style.background = on === 'swamp' ? 'radial-gradient(ellipse at 50% 40%, rgba(90, 110, 40, .3), rgba(30, 40, 12, .62))' : '';      // murky green in the swamp
  if (on) { scene.fog.color.set(on === 'swamp' ? '#3c4a22' : '#145a82').multiplyScalar(mood === MOODS.night ? 0.35 : 1); scene.fog.near = 0.5; scene.fog.far = on === 'swamp' ? 9 : 26; }
  else if (base) { scene.fog.color.copy(base.fog); scene.fog.near = base.near; scene.fog.far = base.far; }
}

function look(px, py, pz, tx, ty, tz, fov = 70) {
  camera.fov = fov; camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
const solidAt = (x, y, z) => { const id = world.get(Math.floor(x), Math.floor(y), Math.floor(z)); return id && (BLOCKS[id].kind ?? 'solid') !== 'cross' && id !== B.WATER && BLOCKS[id].kind !== 'none'; };
function standY(x, z, near = SY - 2) { let y = Math.floor(near); while (y > 1 && !solidAt(x, y - 1, z)) y--; return y; }
void standY;
/** The nearest place of a land round the start, searched ring by ring (for the shots). */
function findLand(land, r0 = 40, r1 = 1400, test = null, landOf = gen.landOf) {
  const s = gen.spawn;
  for (let r = r0; r <= r1; r += 16) for (let k = 0, n = Math.ceil(r / 6); k < n; k++) {
    const a = k / n * Math.PI * 2, x = Math.round(s.x + Math.cos(a) * r), z = Math.round(s.z + Math.sin(a) * r);
    if (landOf(x, z) === land && (!test || test(x, z)) && landOf(x + 12, z) === land && landOf(x - 12, z) === land && landOf(x, z + 12) === land && landOf(x, z - 12) === land) return { x, z };
  }
  return { x: s.x, z: s.z };
}

const hud = buildHud(document.getElementById('hud'));

// ------------------------------------------------------------------ shots
defineShot('hero', () => {
  hud.show(false); fp.visible = false; pickBox.visible = false;
  setMood('morning'); setUnder(false);
  const s = gen.spawn, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  const px = s.x - fx * 50, pz = s.z - fz * 50, py = Math.max(gen.heightAt(px, pz), s.y) + 16;
  around(px + fx * 40, pz + fz * 40);
  look(px, py, pz, s.x + fx * 220, s.y + 12, s.z + fz * 220, 58);
  aimSun(mood.light, s.x, s.y, s.z, 100);
});
defineShot('play', () => {
  hud.show(true); fp.visible = true; pickBox.visible = false;
  setMood('morning'); setUnder(false);
  const s = anchors.spawn, ey = s.y + 1.62;
  around(s.x, s.z);
  camera.fov = 70; camera.position.set(s.x, ey, s.z);
  camera.rotation.set(-0.12, s.yaw, 0, 'YXZ'); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  aimSun(mood.light, s.x, s.y, s.z, 60);
});
// views of each land, for checking by eye (tools/shot.cjs --shots desert,forest,snow,plains,mountain,beach,sea,high,night)
const view = (name, land, opt = {}) => defineShot(name, () => {
  hud.show(false); fp.visible = false; pickBox.visible = false; setMood(opt.time || 'morning'); setUnder(false);
  const t = findLand(land, 40, 1400, opt.test), s = gen.spawn;
  const dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz) || 1, back = opt.back ?? 46;
  const px = t.x - dx / d * back, pz = t.z - dz / d * back, ty = gen.heightAt(t.x, t.z) + 2;
  const py = Math.max(gen.heightAt(px, pz), ty) + (opt.up ?? 22);
  around(px, pz);
  look(px, py, pz, t.x + dx / d * 30, ty, t.z + dz / d * 30, 66);
  aimSun(mood.light, t.x, ty, t.z, 80);
});
view('desert', 'desert');
view('forest', 'forest');
view('snow', 'snow');
view('plains', 'plains');
view('mountain', 'mountain', { back: 90, up: 30 });
view('beach', 'beach', { back: 30, up: 12 });
view('sea', 'sea', { back: 70, up: 14, test: (x, z) => gen.column(x, z).s < -0.1 });      // the open sea, not a lake
view('night', 'forest', { time: 'night' });
// a snowy peak seen from its foot: the highest ground within 400 blocks of the start
defineShot('peak', () => {
  hud.show(false); fp.visible = false; pickBox.visible = false; setMood('morning'); setUnder(false);
  const s = gen.spawn;
  let top = { x: s.x, z: s.z, h: 0 };
  for (let z = -400; z <= 400; z += 8) for (let x = -400; x <= 400; x += 8) { const h = gen.heightAt(s.x + x, s.z + z); if (h > top.h) top = { x: s.x + x, z: s.z + z, h }; }
  const dx = s.x - top.x, dz = s.z - top.z, d = Math.hypot(dx, dz) || 1, px = top.x + dx / d * 80, pz = top.z + dz / d * 80;
  const py = gen.heightAt(px, pz) + 14;
  around(px, pz);
  look(px, py, pz, top.x, top.h - 6, top.z, 60);
  aimSun(mood.light, top.x, top.h - 20, top.z, 100);
});
// the picture for the world picker: a place near the start where many lands meet, seen from above
if (DINO) defineShot('vista', () => {
  // the picture for the world picker: the plain, the jungle and the smoking volcano from a little above the start
  hud.show(false); fp.visible = false; pickBox.visible = false; setMood('morning'); setUnder(false);
  const s = gen.spawn, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  const px = s.x - fx * 70, pz = s.z - fz * 70, py = Math.max(gen.heightAt(px, pz), s.y) + 26;
  terrain.radius = 176;                                      // a picture, not a frame of play: blocks far out (the game sets its own radius again)
  around(s.x + fx * 60, s.z + fz * 60);
  look(px, py, pz, s.x + fx * 260, s.y + 22, s.z + fz * 260, 60);
  aimSun(mood.light, s.x, s.y, s.z, 110);
});
else defineShot('vista', () => {
  hud.show(false); fp.visible = false; pickBox.visible = false; setMood('morning'); setUnder(false);
  const s = gen.spawn;
  let best = null;
  for (let z = -1200; z <= 1200; z += 48) for (let x = -1200; x <= 1200; x += 48) {
    const cx = s.x + x, cz = s.z + z, seen = new Set();
    for (let k = 0; k < 12; k++) for (const r of [0, 30, 60]) { const l = gen.landOf(cx + Math.cos(k / 12 * 6.283) * r, cz + Math.sin(k / 12 * 6.283) * r); seen.add(l === 'beach' ? 'sea' : l === 'mountain' ? 'snow' : l); }
    const score = seen.size - Math.hypot(x, z) / 3000;
    if (!best || score > best.score) best = { x: cx, z: cz, score };
  }
  const px = best.x - 70, pz = best.z + 70, py = gen.heightAt(best.x, best.z) + 48;
  around(best.x - 30, best.z + 30);
  look(px, py, pz, best.x + 10, gen.heightAt(best.x, best.z), best.z - 10, 60);
  aimSun(mood.light, best.x, gen.heightAt(best.x, best.z), best.z, 110);
});
// the dinosaur world's own views (tools/shot.cjs --shots jungle,ferns,swamp,volcano,lava,sea,island,high,vista)
if (DINO) {
  const zone = (name, z, opt = {}) => defineShot(name, () => {
    hud.show(false); fp.visible = false; pickBox.visible = false; setMood(opt.time || 'morning'); setUnder(false);
    const t = findLand(z, opt.r0 ?? 40, 1600, opt.test, gen.zoneOf), s = gen.spawn;
    const dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz) || 1, back = opt.back ?? 40;
    const px = t.x - dx / d * back, pz = t.z - dz / d * back, ty = gen.heightAt(t.x, t.z) + 2;
    const py = Math.max(gen.heightAt(px, pz), ty) + (opt.up ?? 16);
    around(px, pz);
    look(px, py, pz, t.x + dx / d * 30, ty, t.z + dz / d * 30, 66);
    aimSun(mood.light, t.x, ty, t.z, 80);
  });
  zone('jungle', 'jungle', { up: 10, back: 30 });
  zone('ferns', 'ferns', { up: 12 });
  zone('swamp', 'swamp', { up: 7, back: 22, test: (x, z) => { const c = gen.column(x, z); return c.wsw > 0.8 && Math.floor(c.hf) >= c.wl; } });
  zone('island', 'island', { r0: 100, up: 18, back: 70 });
  zone('sea', 'sea', { back: 70, up: 14, test: (x, z) => gen.column(x, z).s < -0.1 });
  // the nearest volcano, from its foot by day; its crater and streams of lava from the rim at night
  const volcano = (name, time, near) => defineShot(name, () => {
    hud.show(false); fp.visible = false; pickBox.visible = false; setMood(time); setUnder(false);
    const s = gen.spawn, v = gen.volcanoesNear(s.x, s.z, 1600)[0] || { x: s.x + 200, z: s.z, top: 70, R: 120 };
    const dx = s.x - v.x, dz = s.z - v.z, d = Math.hypot(dx, dz) || 1, back = near ? v.R * 0.2 : v.R * 1.7;
    const px = v.x + dx / d * back, pz = v.z + dz / d * back, py = near ? v.top + 14 : gen.heightAt(px, pz) + 12;
    around(px, pz);
    look(px, py, pz, v.x - dx / d * (near ? 10 : 0), near ? v.top - 14 : v.top - 10, v.z - dz / d * (near ? 10 : 0), near ? 75 : 60);
    aimSun(mood.light, v.x, v.top - 20, v.z, 110);
  });
  volcano('volcano', 'morning', false);
  volcano('lava', 'night', true);
}
defineShot('high', () => {
  hud.show(false); fp.visible = false; pickBox.visible = false; setMood('morning'); setUnder(false);
  const s = gen.spawn, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  around(s.x, s.z);
  look(s.x - fx * 30, 150, s.z - fz * 30, s.x + fx * 260, 40, s.z + fz * 260, 70);
  aimSun(mood.light, s.x, s.y, s.z, 100);
});

// ------------------------------------------------------------------ the playable game
const own = (id) => ({ key: 'b' + id, id, name: NAMES[id], n: 64, ...(id === B.SKY_BERRY && !DINO ? { use: 'eat', eat: 25, heal: 30, feed: 'plants' } : {}) });      // the berries of the cloud islands are eaten, not planted
const CATALOGUE = [
  { key: 'axe', icon: 'axe', name: 'الفأس', tool: true },
  ...(D ? D.catalogue(B) : [B.OAK, B.PINE, B.PALM, B.PLANKS, B.OAK_LEAVES, B.PINE_NEEDLES, B.PALM_FROND, B.GRASS, B.DIRT, B.SAND, B.SANDSTONE, B.STONE, B.DEEPROCK, B.GRAVEL,
    B.SNOWBLOCK, B.ICE, B.TUFT, B.FLOWER_R, B.FLOWER_Y, B.FLOWER_B, B.SHRUB, B.REED,
    B.LH_WHITE, B.LH_RED, B.CORAL_BRICK, B.CLOUD, B.SKY_FLOWER, B.SKY_BERRY, B.TOTEM, B.TOTEM_TOP]).map(own),
];
const LANDS = { snow: 'الثلج', forest: 'الغابة', desert: 'البر', sea: 'البحر', plains: 'السهل', beach: 'السيف', mountain: 'الجبل' };
const WORLD = D ? D.KEY : 'barari';                         // the key of saves, quests and shared games
const CLOCK = { morning: ['08:20', 'الصبح'], sunset: ['18:40', 'المغرب'], night: ['23:10', 'الليل'] };

async function startGame() {
  await window.__shot('play');
  stage.live = true;
  const eu = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  const slots = [...SLOTS.map((q) => ({ ...q, id: q.block ? B[q.block] : 0 })), kitItem(K.TORCH, 8), EMPTY].slice(0, hud.shown);
  const kit = createKit({ scene, world, terrain });
  // the fires deep in the caves give real light: those made so far, and those of every chunk made from now on
  for (const f of gen.fires.values()) kit.lit(f.x, f.y, f.z, f.id || K.FIRE);
  gen.onFire = (f) => kit.lit(f.x, f.y, f.z, f.id || K.FIRE);      // (and the lamps at the top of the lighthouses)
  // a chunk forgotten far away takes its fires' lights with it (made again, they light again)
  dropped = () => {
    for (const [k, f] of gen.fires) if (!world.has(Math.floor(f.x / world.C), Math.floor(f.z / world.C))) { gen.fires.delete(k); kit.glow.delete(k); }
  };
  const dinos = DINO ? await import('../../shared/dinos.js') : null;
  const heldBlock = createHeld({ camera, blocks: BLOCKS, materialFor });
  let toolInHand = true, aimed = null, hintTimer = 0, wasNight = false, digT = 0;
  const fpHome = fp.position.clone(), fpRot = fp.rotation.clone();
  const isLiquid = (id) => id === B.WATER || id === B.SWAMPWATER || kit.isLiquid(id);
  /** A block dug next to water lets the water in (no dry holes in the sea or a pond). */
  function letWaterIn(x, y, z) {
    if (world.get(x, y, z) !== 0) return;
    for (const w of DINO ? [B.WATER, B.SWAMPWATER] : [B.WATER]) {
      const wet = world.get(x, y + 1, z) === w || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => world.get(x + a, y, z + b) === w);
      if (wet) { terrain.setBlock(x, y, z, w); return; }
    }
  }
  /** Lava burns whoever stands on it or walks into it (the dinosaur world). */
  let burnt = false;
  function lava(p, dt) {
    if (!vitals || play.state.flying) return;
    const hw = play.tuning.hw, at = (x, y, z) => world.get(Math.floor(x), Math.floor(y), Math.floor(z)) === B.LAVA;
    let hot = play.state.onGround && [[0, 0], [hw, hw], [-hw, -hw], [hw, -hw], [-hw, hw]].some(([a, b]) => at(p.x + a, p.y - 0.2, p.z + b));
    for (let y = Math.floor(p.y); y <= Math.floor(p.y + play.tuning.height - 0.05) && !hot; y++) hot = at(p.x, y, p.z);
    if (hot) { vitals.hurt(18 * dt * (ideas ? ideas.lavaFactor : 1)); if (!burnt) { burnt = true; play.notice('الحمم تحرق! اطلع منها بسرعة.', false, 2600); } } else burnt = false;
  }

  let life = null, weather = null, status = null, vitals = null, ideas = null;
  const play = createPlay({
    camera, canvas: stage.canvas, world, blocks: BLOCKS, terrain,
    spawn: { x: anchors.spawn.x, y: anchors.spawn.y, z: anchors.spawn.z, yaw: eu.y, pitch: eu.x },
    slots, touch: hud.touch ? hud.els : null, maxPixelRatio: 2,
    isLiquid, heightOf: kit.heightOf,
    canBreak: (id, x, y) => y > 0 && id !== B.LAVA && id !== B.TIDE_STONE && id !== B.RESO_BELL,
    hardness: (id) => (kit.hardness(id) ?? hardnessOf(id, BLOCKS[id] && BLOCKS[id].kind)) * (ideas ? ideas.digFactor : 1),      // (a bear that is a friend helps dig)
    dropOf: (id) => (id in DROP ? DROP[id] : kit.dropOf(id)),
    onTarget(h) { pickBox.visible = !!h; if (h) pickBox.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5); hud.setTarget(h ? NAMES[h.id] || kit.nameOf(h.id) || 'مكعب' : null); },
    onBreak(h) { kit.broke(h); if (!h.remote) letWaterIn(h.x, h.y, h.z); },
    onPlace(x, y, z, id) { kit.placed(x, y, z, id, play.state.yaw); if (ideas) ideas.placed(x, y, z, id); },
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
      // the blocks round the player and the far land beyond them
      const r = radiusFor();
      if (r !== terrain.radius) terrain.radius = r;
      terrain.update(p.x, p.z);
      far.update(camera.position.x, camera.position.z, terrain.takeChanged());
      hud.setProgress(d.on ? d.progress : 0);
      kit.update(p, dt, st.time);
      if (vitals) vitals.update(dt);
      if (life) life.update(dt);
      if (weather) weather.update(dt);
      if (status) status.update();
      const land = gen.landOf(p.x, p.z), cold = !DINO && (land === 'snow' || land === 'mountain'), sn = !DINO && ideas ? ideas.season : null, winter = !!(sn && sn.winter);
      hud.setLand(D ? D.ZONES[gen.zoneOf(p.x, p.z)] : LANDS[land] + (sn ? ' · ' + sn.name : ''), ((-st.yaw * 180 / Math.PI) % 360 + 360) % 360);
      if (DINO) lava(p, dt);
      // what the needs do here: thirst comes fastest in the desert; the cold bites only in the snow and up the mountains (less in a fur coat)
      if (vitals) {
        const [water, warm] = vitals.needs, coat = st.gear && st.gear.chest && st.gear.chest.warm;
        water.drain = land === 'desert' || (DINO && land === 'mountain') ? 0.42 : cold ? 0.16 : 0.22;
        warm.drain = cold ? (coat ? 0.14 : 0.5) * (winter ? 1.3 : 1) : winter ? (coat ? 0.04 : 0.15) : -3;      // in barari's winter the cold is everywhere
      }
      const sk = window.__GAME_SKY || {};
      // the night's monsters go to dust when the sun comes up
      // (the hunters of the dinosaur world are about by day too)
      if (!DINO && wasNight && !sk.night && life && life.share.mode !== 'guest') for (const e of life.ents) if (e.k.kind === 'monster' && !e.dead) { e.hp = 0; e.dead = 0.0001; }
      wasNight = !!sk.night;
      // rain over the snow falls as snow: white flakes, and the clock says so
      if (weather) {
        const snowing = sk.rain && (cold || winter);
        weather.rain.material.uniforms.uColor.value.set(snowing ? '#f4f8ff' : '#a6b8cc');
        clockLabel(sk.time, sk.rain, snowing);
      }
      sky.uniforms.uTime.value = st.time;
      const wm = tileMaterial('water', 'liquid');
      if (wm.map) { wm.map.offset.set(st.time * 0.02, st.time * 0.013); if (wm.normalMap) wm.normalMap.offset.copy(wm.map.offset); }
      if (DINO) { const sm = tileMaterial('swampWater', 'liquid'); if (sm.map) sm.map.offset.set(st.time * 0.006, st.time * 0.004); }
      const c = camera.position, cid = world.get(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z));
      setUnder(cid === B.WATER ? 'water' : cid === B.SWAMPWATER ? 'swamp' : false);
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
    groups: [{ title: D ? D.TITLE : 'براري', items: CATALOGUE }, ...KIT_GROUPS],
    seaSpot: gen.seaSpot,                                    // the nearest deep open sea to the start (an underwater village, an island)
    iconOf: (it) => itemIcon(it),
    fontFamily: FONT, accent: ACCENT, line: LINE,
    extra: { label: 'الوقت والجو', onClick: () => weather && weather.open() },
    ...(D ? { world: WORLD, mats: D.mats(B) } : {}),            // the dinosaur world keeps its own saves, quests and rooms, and its own wood and stone
  });
  hud.els.bag.addEventListener('pointerdown', (e) => { if (play.state.running) { bag.toggle(); e.preventDefault(); } });
  hud.setSlots(slots, 0);
  hud.setTarget(null);
  hud.els.hotbar.addEventListener('pointerdown', (e) => { const el = e.target.closest('.slot'); if (el && play.state.running) { play.select(+el.dataset.i); e.preventDefault(); } });
  const panel = createPlayPanel({
    title: D ? D.TITLE : 'براري', tagline: D ? D.TAGLINE : 'أرض ما لها آخر: سهول وغابات وبر وثلج وجبال وبحر. اقطع الشجر، انزل الكهوف، وابنِ بيتك.',
    fontFamily: FONT, accent: ACCENT, line: LINE, touch: hud.touch,
    note: D ? D.NOTE : 'نسخة تجريبية: الوقت والمطر والوحوش تختارها من لوحة Q (وعلى الجوال من زر داخل الحقيبة). الوحوش تطلع في الليل.',
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
  if (DINO) vq('warm').hidden = true;                        // no cold in the world of the dinosaurs: its warmth never runs down
  // creatures: each lives in its own lands (the shared list knows which); the two monsters come out at night
  const L = (x, z) => gen.landOf(x, z);
  const nightly = (k, n) => {
    let set = null;                                          // a test or a tool may pin the number
    Object.defineProperty(k, 'max', { enumerable: true, configurable: true, get: () => (set !== null ? set : window.__GAME_SKY && window.__GAME_SKY.night ? n : 0), set: (v) => { set = v; } });
    return k;
  };
  life = createLife({
    scene, camera, play, world, vitals: () => vitals,
    kinds: dinos ? [...dinos.dinoKinds(gen.landOf), ...extraKinds(WORLD), ...dinos.hatchKinds()] : [
      ...landKinds('barari', gen.landOf),
      ...extraKinds('barari'),
      nightly({ key: 'asfoof', name: 'العاصوف', kind: 'monster', make: () => asfoof(), hp: 14, speed: 2.5, radius: 0.75, height: 1.7, dmg: 7, where: (x, y, z) => ['desert', 'beach', 'plains'].includes(L(x, z)) }, 1),
      nightly({ key: 'zamharir', name: 'الزمهرير', kind: 'monster', make: () => zamharir(), hp: 18, speed: 2.2, radius: 0.6, height: 2.5, dmg: 9, where: (x, y, z) => ['snow', 'mountain', 'forest'].includes(L(x, z)) }, 1),
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
      const here = gen.landOf(play.state.pos.x, play.state.pos.z);
      clockLabel(time, rain, !DINO && rain && (here === 'snow' || here === 'mountain' || !!(ideas && ideas.season && ideas.season.winter)));
    },
  });
  clockLabel('morning', false, false);
  // the wonders of this world, and their part of the quests page (after the shared wonders)
  ideas = IDEAS.createIdeas({ play, kit, life, gen, world, terrain, scene, far, vitals: () => vitals });
  if (bag.wonders) { const page0 = bag.wonders.page; bag.wonders.page = () => page0() + ideas.page(); }
  window.__play = play;
  window.__game = { play, panel, terrain, world, B, slots, bag, kit, camera, vitals, life, weather, status, gen, ideas };
}

installShotApi(stage);
await Promise.all(["500 14px 'Tajawal'", "700 14px 'Tajawal'"].map((f) => document.fonts.load(f, 'براري').catch(() => null)));     // a font that cannot be fetched must not stop the game
if (GAME) await startGame(); else await window.__shot('hero');
markReady();
