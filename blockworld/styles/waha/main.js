// "waha" art direction: scene assembly and the named shots.
import * as THREE from 'three';
import { createTerrain } from './mesher.js';
import { createStage, defineShot, installShotApi, markReady } from '../../shared/stage.js';
import { ATM, TIMES, applyTime, createSky, createStars, createMoon, createPipeline, makeNoiseTexture } from './atmo.js';
import { buildTiles } from './tiles.js';
import { buildWorld, BLOCKS, B, FORT, POOL, CAMP, GROUND, POOL_LEVEL, WATER_Y, terrainAt, heroCrestX, colIndex } from './world.js';
import { makeMaterialFor, buildBackdrop, buildPool, createReflection, WATER_U } from './scenery.js';
import { buildRanger, buildCamel, buildOryx, buildWraith, buildScorpion, buildFalcon, buildHeldTool } from './actors.js';
import { buildHud, createTags } from './hud.js';
import { buildMerlons, buildBeams, buildPalms, buildLantern, buildTent, buildRug, buildCushion, buildFire, buildFlag } from './props.js';

// Game mode: the page is opened to be played (index.html?play, or the launcher sets window.__GAME).
// Without it the page only renders the named shots, as before.
const GAME = window.__GAME || (new URLSearchParams(location.search).has('play') ? {} : null);
const COARSE = window.matchMedia('(pointer: coarse)').matches;
// blocks that only the running game puts in the world; neither is meshed (see game.js)
const GID = { OBSTACLE: 27, LANTERN: 28 };

const stage = createStage({ fov: 42, near: 0.3, far: 2600 });
const { scene, camera, renderer } = stage;
renderer.shadowMap.type = THREE.PCFShadowMap;
const post = createPipeline(stage, { samples: GAME && COARSE ? 2 : 4 });

// ---- world ----
const T = buildTiles();
const W = buildWorld();
ATM.uNoise.value = makeNoiseTexture();
ATM.uPoolLevel.value = POOL_LEVEL;
const materialFor = makeMaterialFor(T);
// the oasis (fort, palms, near cliffs) is its own set of meshes: it is what the pool reflects
const inOasis = (x, z) => (x >= 34 && x < 152 && z >= 4 && z < 130 ? 1 : 0);
// The pool's water is drawn by one sheet (buildPool), so the mesher leaves those columns' water alone.
// The set is fixed here: a column the player digs in must not start drawing its water a second time.
const poolCol = W.nat.map((n, i) => (n === 1 && W.top[i] < WATER_Y ? 1 : 0));
const isPool = (x, y, z) => poolCol[colIndex(x, z)] === 1;
const terrain = createTerrain(W, BLOCKS, {
  materialFor, aoCurve: [0.50, 0.68, 0.85, 1.0], regionOf: inOasis, skipLiquid: isPool,
  notGround: (id) => (id >= B.WATER && id <= B.SHRUB) || id === GID.OBSTACLE || id === GID.LANTERN,
  onMesh: (m) => { if (m.userData.region === 1) m.layers.enable(1); },
});
const voxels = terrain.group, stats = terrain.stats;
scene.add(voxels);
const pool = buildPool(W);
scene.add(pool);
const backdrop = buildBackdrop();
backdrop.layers.enable(1);
scene.add(backdrop);
window.__stats = stats;

// ---- props ----
const A = W.anchors;
const merlons = buildMerlons(A.merlons), beams = buildBeams(A.beams), palms = buildPalms(A.palms);
scene.add(merlons, beams, palms);
// things lying or standing on the camp ground, with the half size of their footprint (for the game)
const campProps = [];
const flag = buildFlag(); flag.position.set(A.flags[0].x, A.flags[0].y, A.flags[0].z); scene.add(flag);
const campY = GROUND + 1;
const tent = buildTent(CAMP.x + 3, campY, CAMP.z - 3.5, { rot: -0.5 }); scene.add(tent);
const fire = buildFire(); fire.group.position.set(CAMP.x - 3.2, campY, CAMP.z + 2.6); scene.add(fire.group);
campProps.push([tent, 5.6, 3.1], [fire.group, 1.3, 1.3]);
{
  const r1 = buildRug(3.0, 1.9, 0); r1.position.set(CAMP.x + 0.2, campY + 0.03, CAMP.z + 0.6); r1.rotation.y = -0.5; scene.add(r1);
  const r2 = buildRug(2.6, 1.6, 2); r2.position.set(CAMP.x - 5.6, campY + 0.03, CAMP.z + 4.2); r2.rotation.y = 0.9; scene.add(r2);
  const r3 = buildRug(3.2, 2.0, 1); r3.position.set(CAMP.x + 3.4, campY + 0.03, CAMP.z - 3.2); r3.rotation.y = -0.5; scene.add(r3);
  const c1 = buildCushion(1); c1.position.set(CAMP.x + 0.9, campY + 0.18, CAMP.z - 0.1); c1.rotation.y = -0.5; scene.add(c1);
  const c2 = buildCushion(0); c2.position.set(CAMP.x - 0.6, campY + 0.18, CAMP.z + 1.1); c2.rotation.y = 0.6; scene.add(c2);
  campProps.push([r1, 1.5, 0.95], [r2, 1.3, 0.8], [r3, 1.6, 1.0]);
}
A.lanterns.push({ x: CAMP.x - 2.2, y: campY + 2.0, z: CAMP.z - 1.2, wall: 'pole' });
const lanterns = A.lanterns.map((a) => { const l = buildLantern(a); l.anchor = a; scene.add(l.group, l.light); return l; });

// ---- cast ----
const actors = {
  ranger: buildRanger(), camel: buildCamel(), oryx: buildOryx(), wraith: buildWraith(1), scorpion: buildScorpion(), falcon: buildFalcon(),
};
const horde = { wraiths: [buildWraith(2), buildWraith(3), buildWraith(4)], scorpions: [buildScorpion()] };
for (const k of Object.keys(actors)) { actors[k].visible = false; scene.add(actors[k]); }
for (const o of [...horde.wraiths, ...horde.scorpions]) { o.visible = false; scene.add(o); }
function place(obj, x, z, rotY = 0, y = null, scale = 1) {
  obj.userData.seat = [x, z, rotY, y, scale];
  obj.position.set(x, y ?? groundY(x, z), z);
  obj.rotation.set(0, rotY, 0);
  const span = obj.userData.span;
  if (span && y === null) {
    // long-bodied animals stand square on a slope: pitch and roll to the ground under their feet
    const fx = Math.sin(rotY), fz = Math.cos(rotY), l = span[0] * scale, w = span[1] * scale;
    const hf = groundY(x + fx * l, z + fz * l), hb = groundY(x - fx * l, z - fz * l);
    const hl = groundY(x + fz * w, z - fx * w), hr = groundY(x - fz * w, z + fx * w);
    obj.rotation.order = 'YXZ';
    const lim = (v) => Math.max(-0.34, Math.min(0.34, v));                      // follow the slope fully so no foot hangs in the air
    obj.rotation.set(lim(-Math.atan2(hf - hb, 2 * l)), rotY, lim(Math.atan2(hl - hr, 2 * w)));
    obj.position.y = (hf + hb + hl + hr) / 4;
  }
  obj.scale.setScalar(scale);
  obj.visible = true;
  obj.updateMatrixWorld(true);
  return obj;
}
function hideActors() {
  for (const k of Object.keys(actors)) actors[k].visible = false;
  for (const o of [...horde.wraiths, ...horde.scorpions]) o.visible = false;
}

// first-person arm + tool rides on the camera
scene.add(camera);
const held = buildHeldTool();
held.visible = false;
camera.add(held);

// ---- HTML overlays ----
const hudEl = document.getElementById('hud');
const hud = buildHud(hudEl);
const tags = createTags(document.getElementById('tags'), camera);
post.onResize(() => tags.update());
function overlays(mode) {
  hudEl.hidden = mode !== 'hud';
  held.visible = mode === 'hud';
  if (mode !== 'tags') tags.clear();
  if (typeof targetBox !== 'undefined') targetBox.visible = false;
}

// ---- sky + lights ----
const sky = createSky();
const stars = createStars();
const moon = createMoon();
scene.add(sky, stars, moon);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(GAME && COARSE ? 2048 : 4096, GAME && COARSE ? 2048 : 4096);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.35;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
scene.add(hemi);
const rig = { sun, hemi, stars, moon, post, sunDir: new THREE.Vector3(0, 1, 0), night: false };
// pool reflection: the oasis set (layer 1) mirrored into a small target before each frame
for (const o of [sky, moon, sun, hemi, flag, tent, fire.group]) o.traverse((c) => c.layers.enable(1));
scene.traverse((o) => { if (o.name === 'palms' || o.name === 'merlons' || o.name === 'beams') o.traverse((c) => c.layers.enable(1)); });
for (const l of lanterns) { l.group.traverse((c) => c.layers.enable(1)); l.light.layers.enable(1); }
const reflection = createReflection(renderer, scene, camera, [sun]);
post.beforeRender(() => reflection.render());
post.onResize((w, h, pr) => { WATER_U.uRes.value.set(w * pr, h * pr); });
post.onResize((w, h, pr) => { stars.material.uniforms.uPx.value = pr * Math.max(1, h / 900); });

function aimShadow(cx, cy, cz, size, depth = 420) {
  sun.target.position.set(cx, cy, cz);
  sun.position.set(cx, cy, cz).addScaledVector(rig.sunDir, depth * 0.5);
  const c = sun.shadow.camera;
  c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 1; c.far = depth;
  c.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
}

function lightLantern(l, lamp) {
  l.light.intensity = 13 * lamp;
  l.light.visible = lamp > 0;
  l.core.material.color.setRGB(0.5 + 6.5 * Math.min(1, lamp * 3), 0.35 + 3.0 * Math.min(1, lamp * 3), 0.2 + 0.9 * Math.min(1, lamp * 3));
  l.glow.visible = lamp > 0;
  l.glow.material.opacity = 0.5 + 0.5 * lamp;
  l.glow.scale.setScalar(1.2 + 0.9 * lamp);
}

function setTime(name, over = {}) {
  const p = { ...TIMES[name], ...over };
  applyTime(p, rig);
  moon.position.copy(camera.position).addScaledVector(rig.sunDir, 1500);
  moon.scale.setScalar(1500 * 0.034);
  moon.lookAt(camera.position);
  const w = p.water || {};
  WATER_U.uDeep.value.setRGB(...(w.deep || [0.02, 0.06, 0.06]));
  WATER_U.uShallow.value.setRGB(...(w.shallow || [0.16, 0.26, 0.22]));
  WATER_U.uReflDark.value.setRGB(...(w.dark || [0.06, 0.045, 0.03]));
  WATER_U.uGlint.value = w.glint ?? 1;
  // lamps, fire and lit windows follow the time of day
  const lamp = p.lamp ?? 0;
  rig.lamp = lamp;
  for (const l of lanterns) lightLantern(l, lamp);
  fire.light.intensity = 60 * lamp;
  fire.light.visible = lamp > 0;
  fire.flames.visible = lamp > 0;
  fire.glow.visible = lamp > 0;
  fire.glow.scale.setScalar(2.4 + 1.2 * lamp);
  for (const m of voxels.children) if (m.material && m.material.userData.lit) m.material.emissiveIntensity = p.windows ?? 1;
  return p;
}

function groundY(x, z) { return W.surfaceY(x, z); }
window.__dbg = { W, groundY, terrainAt, camera, scene, rig };

function look(px, py, pz, tx, ty, tz, fov) {
  camera.position.set(px, py, pz);
  camera.fov = fov ?? 42;
  camera.lookAt(tx, ty, tz);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

// ---- shots ----
defineShot('hero', () => {
  overlays('none'); hideActors(); reflection.enabled = true;
  const cz = 185, cx = heroCrestX(cz) + 0.5;
  look(cx, groundY(cx, cz) + 4.2, cz, 99, 31, 80, 46);
  setTime('golden');
  aimShadow(96, 24, 110, 125, 600);
  // the ranger and his camel on the lit windward shoulder of the dune, looking down at the oasis
  const rz = 174, rx = heroCrestX(rz) - 2.6;
  place(actors.ranger, rx, rz, Math.PI + 0.30);
  place(actors.camel, rx - 3.7, rz - 3.5, 2.35);
  place(actors.falcon, CAMP.x - 0.5, CAMP.z - 2.4, 0.4);
  place(actors.oryx, 84.5, 110.5, -2.2);                                     // come down to drink
});

defineShot('night', () => {
  overlays('none'); hideActors(); reflection.enabled = true;
  const cz = 185, cx = heroCrestX(cz) + 0.5;
  look(cx, groundY(cx, cz) + 4.2, cz, 99, 31, 80, 46);
  const nq = new URLSearchParams(location.search), nOver = {};
  if (nq.get('naz')) nOver.sunAz = Number(nq.get('naz'));
  if (nq.get('nel')) nOver.sunEl = Number(nq.get('nel'));
  if (nq.get('lift')) nOver.rockLift = [0.22, 0.34, 0.80, Number(nq.get('lift'))];
  setTime('night', nOver);
  aimShadow(96, 24, 110, 125, 600);
  // what comes out of the dunes after dark
  const c = (z) => heroCrestX(z);
  // creatures near the crest stand far enough back from it that their shadows stay on this slope
  place(actors.wraith, c(173.5) - 4.9, 173.5, 0.66, null, 1.15);             // the nearest one has noticed us
  place(horde.wraiths[0], 101.5, 116.5, Math.PI + 0.35, null, 1.3);          // already down at the camp, drawn to the fire
  place(horde.wraiths[1], 124, 105, -2.78, null, 1.3);                       // crossing the open ground toward the gate
  place(horde.wraiths[2], 139, 121, -2.6, null, 1.3);
  place(actors.scorpion, c(163) - 4.4, 163, Math.PI / 2 + 0.45);             // below the crest line, against the pool
  place(horde.scorpions[0], 133, 112.5, -2.7, null, 1.2);
  place(actors.falcon, CAMP.x - 0.5, CAMP.z - 2.4, 0.4);
});

// cast line-up: positions are (right, depth) in the camera's own ground frame
function stageCast(ox, oz, viewAz, dist, fov) {
  const a = THREE.MathUtils.degToRad(viewAz);
  const f = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), r = new THREE.Vector3(-f.z, 0, f.x);
  const P = (right, depth) => ({ x: ox + r.x * right + f.x * depth, z: oz + r.z * right + f.z * depth });
  const face = (yaw) => Math.atan2(-f.x, -f.z) + yaw;          // 0 = looking straight at the camera
  const gy = groundY(ox, oz);
  const cam = P(0, -dist);
  look(cam.x, gy + 1.45, cam.z, ox, gy + 2.55, oz, fov);
  const put = (obj, right, depth, yaw, scale = 1) => { const p = P(right, depth); place(obj, p.x, p.z, face(yaw), gy, scale); };
  // spread so that nothing overlaps and all six stay inside a 4:3 crop of the frame
  put(actors.scorpion, -3.15, 0.2, 0.42);
  put(actors.wraith, -0.8, 1.0, 0.22, 1.05);
  put(actors.ranger, 0.55, -0.6, -0.10);
  put(actors.falcon, 1.5, -1.2, -0.35);
  put(actors.oryx, 2.5, 0.5, -0.66);
  put(actors.camel, 4.7, 2.4, -0.90);
}

defineShot('cast', () => {
  overlays('tags'); hideActors(); reflection.enabled = false;
  stageCast(126, 105.5, -35, 9.6, 40);
  setTime('afternoon', { sunAz: -152, sunEl: 31 });
  aimShadow(118, 22, 96, 50, 300);
  tags.clear();
  tags.add(actors.ranger, 'الرحّال', 'اللاعب', 'player');
  tags.add(actors.camel, 'الذلول', 'رفيق', 'friendly');
  tags.add(actors.oryx, 'المها', 'مسالم', 'friendly');
  tags.add(actors.falcon, 'الصقر', 'رفيق', 'friendly');
  tags.add(actors.wraith, 'غول الرمال', 'عدائي', 'hostile');
  tags.add(actors.scorpion, 'عقرب الصخر', 'عدائي', 'hostile');
  tags.update();
});

const targetBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012, 1.012, 1.012)), new THREE.LineBasicMaterial({ color: 0xffe2a0, fog: false }));
targetBox.visible = false;
scene.add(targetBox);

defineShot('play', () => {
  overlays('hud'); hideActors(); reflection.enabled = false;
  // standing at the edge of the dig, mattock in hand, the next block of the wall under the crosshair
  const wk = A.work, px = wk.x + 0.5, pz = wk.z + 5.5;
  const t = wk.target;
  targetBox.position.set(t[0] + 0.5, t[1] + 0.5, t[2] + 0.5);
  targetBox.visible = true;
  look(px, groundY(px, pz) + 1.62, pz, t[0] + 0.5, t[1] + 0.5, t[2] + 1.0, 66);
  setTime('afternoon', { sunAz: -141, sunEl: 31 });
  aimShadow(px - 2, 22, pz - 14, 60, 300);
  place(actors.camel, wk.x + 8.9, wk.z - 3.8, -Math.PI / 2 + 0.5);
  place(actors.falcon, wk.x - 6.5, wk.z - 4.6, 0.6);
  held.position.set(hud.touch ? 0.27 : 0, hud.touch ? 0.12 : 0, 0);         // on phones the fist sits clear of the belt and the build button
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  hud.setHeading((Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360);
});

// debug: ?c=px,py,pz,tx,ty,tz,fov&t=golden&az=..&el=..
defineShot('dbg', () => {
  const q = new URLSearchParams(location.search);
  const c = (q.get('c') || '96,140,96,96,20,95.9,50').split(',').map(Number);
  look(c[0], c[1], c[2], c[3], c[4], c[5], c[6] || 45);
  const over = {};
  if (q.get('az')) over.sunAz = Number(q.get('az'));
  if (q.get('el')) over.sunEl = Number(q.get('el'));
  overlays('none'); reflection.enabled = !q.get('norefl');
  setTime(q.get('t') || 'golden', over);
  hideActors();
  if (q.get('actors')) {
    const [ax, az] = q.get('actors').split(',').map(Number);
    place(actors.scorpion, ax - 4.2, az + 0.5, 0.5);
    place(actors.wraith, ax - 1.9, az - 0.6, 0.25);
    place(actors.ranger, ax, az + 0.8, 0.0);
    place(actors.oryx, ax + 1.9, az + 0.3, -0.5);
    place(actors.camel, ax + 3.6, az - 1.6, -0.75);
    place(actors.falcon, ax + 0.9, az + 1.4, -0.2);
  }
  if (q.get('solo')) {
    // turntable: ?solo=name&ang=deg&dist=m
    const a = actors[q.get('solo')];
    const ang = THREE.MathUtils.degToRad(Number(q.get('ang') || 30)), dist = Number(q.get('dist') || 5);
    const sx = 112.5, sz = 99.5, gy = groundY(sx, sz);
    place(a, sx, sz, 0);
    const hh = (a.userData.height || 2) * 0.5;
    look(sx + Math.sin(ang) * dist, gy + hh + dist * 0.12, sz + Math.cos(ang) * dist, sx, gy + hh, sz, 34);
    aimShadow(sx, gy, sz, 14, 200);
  }
  if (q.get('noshadow')) sun.castShadow = false;
  if (q.get('rip')) ATM.uRipple.value = Number(q.get('rip'));
  if (q.get('exp')) post.final.uniforms.uExposure.value = Number(q.get('exp'));
  aimShadow(c[3], 24, c[5], Number(q.get('ss') || 125), 600);
});

installShotApi(stage);
if (GAME) {
  // the playable game: the controller and everything that reacts to digging and building live in game.js
  const { startGame } = await import('./game.js');
  await Promise.all(["700 20px 'Reem Kufi'", "500 14px 'Reem Kufi'", '500 14px Tajawal', '700 14px Tajawal']
    .map((f) => document.fonts.load(f, 'واحة 0123').catch(() => null)));      // a font that cannot be fetched must not stop the game
  await startGame({
    GID, stage, W, terrain, hud, held, targetBox, actors, place, aimShadow, rig, lanterns, lightLantern,
    merlons, beams, flag, campProps,
  });
  markReady();
} else window.__shot('hero').then(markReady);
