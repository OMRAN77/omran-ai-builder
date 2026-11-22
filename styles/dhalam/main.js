// "dhalam" art direction: scene assembly and the four shots.
import * as THREE from 'three';
import { createStage, defineShot, installShotApi, markReady } from '../../shared/stage.js';
import { createPlay, createPlayPanel, goImmersive, EMPTY } from '../../shared/play.js';
import { createHeld } from '../../shared/held.js';
import { K, KIT_BLOCKS, KIT_GROUPS, kitMaterial, kitIcon, createKit } from '../../shared/kit.js';
import { createBag } from '../../shared/bag.js';
import { createVitals, bars } from '../../shared/vitals.js';
import { createLife, simpleBeast } from '../../shared/life.js';
import { extraKinds } from '../../shared/beasts.js';
import { createWeather } from '../../shared/weather.js';
import { createStatus } from '../../shared/status.js';
import { buildTiles, buildDetailTextures, buildSpriteTextures, buildBoughTexture, buildVoxelDetail, buildCardTextures } from './texgen.js';
import { buildForest } from './trees.js';
import { buildShelterProps, makeTorch } from './props.js';
import { makeSurvivor, makeHound, makeRaven, makeStalker, makeBoneHound, makeGolem, makePick, makeAxe, makeViewArm, makeLantern } from './actors.js';
import { setDetail, mat, box, at, strut, bake, blobShadow } from './kit.js';
import { U, SKY, WATER, EXTRA, patch, makeSky, makePost, makeWater, resizeHooks } from './fx.js';
import { generateWorld, bakeLight, buildWorldMeshes, buildWorldTerrain, buildFarTerrain, B, BLOCKS, SITE, SX, SZ, WL, fromUV, VAL, WATCH, watchRel, gateRel, HERO_CAM } from './world.js';
import { initHud, drawCompass, SLOTS } from './hud.js';

const Q = new URLSearchParams(location.search);
// Game mode: the page is opened to be played (index.html?play, or the launcher sets window.__GAME).
// Without it the page only renders the named shots, as before.
const GAME = window.__GAME || (Q.has('play') ? {} : null);
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const LITE = !!GAME && COARSE;                                 // playing on a phone: lighter settings
const T0 = performance.now();
const stage = createStage({ fov: 42, near: 0.3, far: 3200, antialias: false });
const { scene, camera, renderer } = stage;
scene.add(camera);

// ------------------------------------------------------------------------------------- materials
const T = buildTiles();
const D = buildDetailTextures();
setDetail(D);
const SPR = buildSpriteTextures();
Object.assign(SPR, buildCardTextures());
EXTRA.uDetail.value = buildVoxelDetail();
const NSCALE = { litter: 1.3, heath: 1.2 };
const mats = new Map();
function materialFor(tile, kind) {
  // the shared building kit brings its own materials; here they only get this world's fog and baked light
  // (no grain, no moss), so a painted block keeps its colour, and a soft shoulder so a pale one never burns out
  // (lamps and flames are meant to burn)
  const km = kitMaterial(tile);
  if (km) {
    if (!km.userData.dhalam) {
      km.userData.dhalam = true;
      km.vertexColors = true;                                    // as the mesher sets it; set here because the hand may show the block first
      patch(km, { voxel: true, tint: true, soft: !tile.startsWith('x:lamp') && tile !== 'x:fire' });
      // this world has no sky reflections for a metal to mirror, so gold would come out as dull brown: here it is
      // mostly paint, with a sheen. Diamond and still water get a softer glint from the lantern at the hip.
      if (tile === 'x:gold') { km.metalness = 0.3; km.roughness = 0.42; }
      if (tile === 'x:diamond') km.roughness = 0.3;
      if (tile === 'x:water') km.roughness = 0.4;
    }
    return km;
  }
  const key = tile + '|' + kind;
  let m = mats.get(key);
  if (m) return m;
  const t = T[tile];
  if (kind === 'liquid') {
    m = new THREE.MeshLambertMaterial({ color: 0x0b1319 });            // replaced by the mirror plane below
  } else if (kind === 'cutout') {
    m = new THREE.MeshLambertMaterial({ map: t.map, normalMap: t.normalMap, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide });
  } else if (kind === 'cross') {
    m = new THREE.MeshLambertMaterial({ map: t.map, alphaTest: 0.45, alphaToCoverage: true });
  } else {
    // Lambert + normal map: cheap enough for phones and no grazing-angle sparkle on block edges
    m = new THREE.MeshLambertMaterial({ map: t.map, normalMap: t.normalMap });
    if (NSCALE[tile]) m.normalScale = new THREE.Vector2(NSCALE[tile], NSCALE[tile]);
    if (t.emissiveMap) { m.emissiveMap = t.emissiveMap; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 1.15; }
  }
  const solid = kind !== 'liquid' && kind !== 'cutout' && kind !== 'cross';
  // tint: the game also bakes the light of lamps the player sets down (see kitLight in world.js); the shots do not
  patch(m, { voxel: true, tint: !!GAME, detail: solid, moss: tile === 'rockTop' ? { map: T.moss.map, p: [0.5, 0.07, 0.5] } : null });
  mats.set(key, m);
  return m;
}

// ----------------------------------------------------------------------------------------- world
Object.assign(BLOCKS, KIT_BLOCKS);                           // the shared building kit (painted blocks, lamps, beds, ...): ids 100 and up
const { world, meta } = generateWorld();
const light = bakeLight(world, meta.lights);                 // after the kit is in BLOCKS: half blocks, beds, glass, water and fire let light through
// the lake is one mirror plane (below), so the lake's voxel water is never drawn: not at first, not in a re-meshed chunk.
// Water from the kit is a block of its own and is drawn.
const hideLiquid = (mesh) => { if (mesh.userData.kind === 'liquid' && mesh.userData.tile === 'water') mesh.visible = false; };
// the game needs terrain it can edit; the shots keep the plain static meshes
const terrain = GAME ? buildWorldTerrain(world, light, meta.lights, materialFor, { onMesh: hideLiquid }) : null;
const { root: worldRoot, tris: worldTris } = terrain ? { root: terrain.group, tris: terrain.tris } : buildWorldMeshes(world, light, materialFor);
scene.add(worldRoot);
const forest = buildForest(meta.trees, buildBoughTexture());
scene.add(forest.root);
const farMat = patch(new THREE.MeshLambertMaterial({ vertexColors: true }));
scene.add(buildFarTerrain(farMat));
const sky = makeSky();
scene.add(sky);

// the lake: hide the voxel water surface and lay one mirror plane over it
let wx0 = SX, wx1 = 0, wz0 = SZ, wz1 = 0;
for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) if (world.get(x, WL, z) === 18) { wx0 = Math.min(wx0, x); wx1 = Math.max(wx1, x + 1); wz0 = Math.min(wz0, z); wz1 = Math.max(wz1, z + 1); }
worldRoot.traverse((o) => { if (o.isMesh) hideLiquid(o); });
const lake = makeWater(wx0, wz0, wx1, wz1, WL + 0.82, T.water.normalMap, renderer, { div: LITE ? 3 : 2 });
scene.add(lake);
const shelter = buildShelterProps(meta, SPR, T);
scene.add(shelter.root);

// a small pool of point lights, re-assigned per shot (never more than 8)
const pool = [];
for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); l.visible = false; scene.add(l); pool.push(l); }
function useLights(list) {
  pool.forEach((l, i) => {
    const s = list[i];
    l.visible = !!s;
    if (s) { l.position.copy(s.pos); l.color.set(s.color); l.intensity = s.intensity; l.distance = s.distance; }
  });
}

// ---------------------------------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0x8fa3bd, 0x2a2c2e, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xe8edf5, 1.5);
sun.castShadow = true;
sun.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.08;
scene.add(sun, sun.target);
// the pale break in the overcast acts as a second, broad light from that side of the sky: it grazes
// walls and cliffs that face it (no shadows, about the cost of one more point light)
const skyRim = new THREE.DirectionalLight(0xffe6c8, 0);
scene.add(skyRim, skyRim.target);
function setRim(azDeg, elDeg, intensity, color = 0xffe6c8) {
  const az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
  skyRim.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(100);
  skyRim.target.position.set(0, 0, 0);
  skyRim.intensity = intensity; skyRim.color.set(color);
}

function setSun(azDeg, elDeg) {
  const az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
  U.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}
/** Fit the shadow frustum around a focus point (a game would follow the player the same way). */
function fitShadow(cx, cy, cz, half, depth = 420) {
  const d = U.uSunDir.value;
  sun.target.position.set(cx, cy, cz);
  sun.position.set(cx + d.x * depth * 0.5, cy + d.y * depth * 0.5, cz + d.z * depth * 0.5);
  const c = sun.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = depth;
  c.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
}

const post = makePost(stage, { samples: LITE ? 2 : 4 });
resizeHooks.push(lake.userData.setSize);
const CAST_TURN = 8;                                          // the cast view is turned this many degrees east of the valley axis
function setTime(name, sunAz, sunEl) {
  if (sunAz !== undefined) setSun(sunAz, sunEl);
  setRim(0, 30, 0);
  if (name === 'grey') {
    // bleak afternoon: the same palette with the sun higher, used to present the cast
    setSun(42 + CAST_TURN + 54, 23);
    setRim(42 + CAST_TURN - 132, 32, 7.5, 0xd6e0f0);
    U.uFogColor.value.set(0x7b8996); U.uFogSunColor.value.set(0xb9bbb6);
    U.uFogParams.value.set(0.0062, 0.02, WL + 0.5, 0.2);
    U.uFogMisc.value.set(5, 0.985, 0.9, 0);
    SKY.uZenith.value.set(0x3a4654); SKY.uHorizon.value.set(0x9aa7b3);
    SKY.uGlowColor.value.set(0xe6e2d6); SKY.uGlowAmt.value = 0.9;
    SKY.uCloudDark.value.set(0x303943); SKY.uCloudLight.value.set(0x95a1ae);
    SKY.uCloud.value.set(0.4, 0.97, 3.0, 1.0);
    SKY.uMoon.value.set(0, 0.03, 0, 0);
    SKY.uHaze.value.set(8, 0);
    hemi.color.set(0x8fa4c0); hemi.groundColor.set(0x4a4d50); hemi.intensity = 4.2;
    sun.color.set(0xffeeda); sun.intensity = 15.0;
    U.uBlockColor.value.setRGB(1.0, 0.42, 0.13); U.uBlockGain.value = 4.0;
    U.uSkyOcc.value.set(0.3, 1.0);
    post.bloom.strength = 0.28; post.bloom.radius = 0.5; post.bloom.threshold = 1.0;
    post.grade.uExposure.value = 1.0; post.grade.uSat.value = 0.9; post.grade.uContrast.value = 0.3; post.grade.uVignette.value = 0.38;
  }
  if (name === 'night') {
    U.uFogColor.value.set(0x111926); U.uFogSunColor.value.set(0x46587a);
    U.uFogParams.value.set(0.0052, 0.045, WL + 0.5, 0.15);
    U.uFogMisc.value.set(7, 0.99, 0.9, 0);                       // moon scatter stays within about 25 degrees of the moon
    SKY.uZenith.value.set(0x03060b); SKY.uHorizon.value.set(0x121c2b);
    SKY.uGlowColor.value.set(0x9fb6d8); SKY.uGlowAmt.value = 0.22;
    SKY.uCloudDark.value.set(0x05080e); SKY.uCloudLight.value.set(0x1d2a3d);
    SKY.uCloud.value.set(0.52, 0.9, 7.0, 2.0);
    SKY.uMoonDir.value.copy(U.uSunDir.value);
    SKY.uMoon.value.set(2.6, 0.025, 0.42, 0.7);
    SKY.uHaze.value.set(7, 0);
    hemi.color.set(0x2a3a55); hemi.groundColor.set(0x0b0d12); hemi.intensity = 1.5;
    sun.color.set(0xa9bcdc); sun.intensity = 4.4;
    setRim(sunAz - 62, 24, 1.1, 0x8fa6c8);                       // sky glow off the mist: a thin edge on trunks and shoulders
    U.uBlockColor.value.setRGB(1.0, 0.4, 0.11); U.uBlockGain.value = 12.0;
    U.uSkyOcc.value.set(0.22, 1.0);
    post.bloom.strength = 0.34; post.bloom.radius = 0.6; post.bloom.threshold = 0.95;
    post.grade.uExposure.value = 1.12; post.grade.uSat.value = 0.76; post.grade.uContrast.value = 0.32; post.grade.uVignette.value = 0.5;
  }
  if (name === 'dusk') {
    setSun(20, 10);
    setRim(-42, 16, 5.0);
    U.uFogColor.value.set(0x64768b); U.uFogSunColor.value.set(0xb9bbb8);
    U.uFogParams.value.set(0.0016, 0.025, WL + 0.5, 0.19);
    U.uFogMisc.value.set(5, 0.985, 0.9, 0);
    SKY.uZenith.value.set(0x2a3645); SKY.uHorizon.value.set(0x8c9cae);
    SKY.uGlowColor.value.set(0xe6dfcf); SKY.uGlowAmt.value = 1.25;
    SKY.uCloudDark.value.set(0x222b36); SKY.uCloudLight.value.set(0x8593a5);
    SKY.uCloud.value.set(0.46, 0.97, 3.0, 1.0);
    SKY.uMoon.value.set(0, 0.03, 0, 0);
    SKY.uHaze.value.set(8, 0);
    hemi.color.set(0x8198b8); hemi.groundColor.set(0x34373b); hemi.intensity = 3.2;
    sun.color.set(0xffead2); sun.intensity = 10.0;
    U.uBlockColor.value.setRGB(1.0, 0.42, 0.13); U.uBlockGain.value = 5.0;
    U.uSkyOcc.value.set(0.3, 1.0);
    post.bloom.strength = 0.3; post.bloom.radius = 0.55; post.bloom.threshold = 1.0;
    post.grade.uExposure.value = 1.0; post.grade.uSat.value = 0.86; post.grade.uContrast.value = 0.36; post.grade.uVignette.value = 0.42;
  }
}

// ------------------------------------------------------------------------------------------ cast
const groundAt = (x, z) => world.topY(Math.floor(x), Math.floor(z), (id) => id >= 19) + 1;
const FACE_CAM = Math.atan2(-VAL.dx, -VAL.dz);            // yaw that faces back down the valley (toward the cast camera)
function place(obj, u, v, yaw = 0, dy = 0) {
  const [x, z] = fromUV(u, v);
  obj.position.set(x, groundAt(x, z) + dy, z);
  obj.rotation.y = FACE_CAM + yaw;
  return obj;
}
const cast = new THREE.Group();
cast.name = 'cast';
cast.visible = false;
scene.add(cast);
// the cast stands on the open shore in a shallow arc around the camera, so everyone is seen at the
// same distance and their sizes compare truly. castAt(obj, degrees right of the view axis, metres away, turn)
const CAST_CAM = { u: 46.5, v: -9.5, turn: CAST_TURN };            // the view is turned a little east of the valley axis: lake behind
const castUV = (deg, dist) => { const a = (CAST_CAM.turn + deg) * Math.PI / 180; return [CAST_CAM.u + Math.cos(a) * dist, CAST_CAM.v + Math.sin(a) * dist]; };
const castAt = (obj, deg, dist, yaw = 0, dy = 0) => {
  const [x, z] = fromUV(...castUV(deg, dist));
  const [cx, cz] = fromUV(CAST_CAM.u, CAST_CAM.v);
  obj.position.set(x, groundAt(x, z) + dy, z);
  obj.rotation.y = Math.atan2(cx - x, cz - z) + yaw;
  return obj;
};
const actors = {
  golem: castAt(makeGolem(SPR, T), -19.5, 12.2, 0.3),
  survivor: castAt(makeSurvivor(SPR), -2.4, 9.7, 0.12),
  stalker: castAt(makeStalker(SPR), 5.8, 11.0, -0.2),
  hound: castAt(makeHound(SPR, { headYaw: -0.25 }), 13.8, 9.9, 1.0),
  raven: castAt(makeRaven(), 20.4, 10.8, 1.2, 1.78),
  bone: castAt(makeBoneHound(SPR), 26.8, 10.8, -0.95),
};
const TAGS = {
  golem: ['حارس الأطلال', 'عدائي', 'hostile'], stalker: ['المتربّص', 'عدائي', 'hostile'], survivor: ['الناجي', 'أنت', 'self'],
  hound: ['كلب الصيد', 'رفيق', 'friend'], raven: ['الغراب', 'رفيق', 'friend'], bone: ['ذئب العظم', 'عدائي', 'hostile'],
};
for (const k in actors) {
  const a = actors[k];
  cast.add(a);
  const sh = blobShadow(SPR.glow, k === 'golem' ? 2.3 : k === 'raven' ? 0.25 : k === 'survivor' ? 0.5 : 0.75, k === 'golem' ? 1.5 : k === 'raven' ? 0.25 : 0.55, 0.55);
  sh.position.set(a.position.x, groundAt(a.position.x, a.position.z) + 0.03, a.position.z);
  sh.rotation.z = a.rotation.y;
  cast.add(sh);
}
// the raven's perch: a weathered marker post
{
  const r = actors.raven;
  const wood = mat(0x4a4037, { tex: 'wood', rough: 0.95 });
  const post = at(box(0.17, 1.86, 0.17, wood, { r: 0.03, anchor: 'bottom', taper: [0.85, 0.85] }), r.position.x, r.position.y - 1.84, r.position.z - 0.02, 0.03, 0.4, -0.04);
  cast.add(post);
  cast.add(at(box(0.5, 0.1, 0.07, wood, { r: 0.02 }), r.position.x, r.position.y - 0.42, r.position.z - 0.02, 0, r.rotation.y - 0.7, 0.08));
  cast.add(at(box(0.2, 0.05, 0.2, mat(0x2a2622, { tex: 'cloth', rough: 1 }), { r: 0.015 }), r.position.x, r.position.y - 0.6, r.position.z - 0.02, 0, 0.4, 0));
}
const tagLayer = document.getElementById('tags');
const tagEls = {};
for (const k in TAGS) {
  const el = document.createElement('div');
  el.className = 'tag tag-' + TAGS[k][2];
  el.innerHTML = '<div class="tag-pill"><i class="tag-mark"></i><span class="tag-name">' + TAGS[k][0] + '</span><span class="tag-kind">' + TAGS[k][1] + '</span></div><i class="tag-stem"></i>';
  tagLayer.appendChild(el);
  tagEls[k] = el;
}
const _v = new THREE.Vector3();
function updateTags() {
  if (!cast.visible) return;
  camera.updateMatrixWorld();
  for (const k in tagEls) {
    const a = actors[k];
    a.updateMatrixWorld(true);
    _v.copy(a.userData.tag).applyMatrix4(a.matrixWorld).project(camera);
    const el = tagEls[k];
    el.style.left = ((_v.x * 0.5 + 0.5) * window.innerWidth).toFixed(1) + 'px';
    el.style.top = ((-_v.y * 0.5 + 0.5) * window.innerHeight).toFixed(1) + 'px';
    el.style.display = _v.z < 1 ? '' : 'none';
  }
}
resizeHooks.push(updateTags);
function castLights() {
  const out = [];
  const lp = new THREE.Vector3();
  actors.survivor.userData.lantern.getWorldPosition(lp);
  out.push({ pos: lp.clone().add(new THREE.Vector3(0, -0.08, 0)), color: 0xff8a3a, intensity: 1.5, distance: 3.0 });
  for (const [k, c, i, d] of [['bone', 0x8fedd8, 1.5, 3.5], ['golem', 0x8ff0e6, 2.4, 4.5]]) {
    const p = actors[k].userData.core.clone().applyMatrix4(actors[k].matrixWorld);
    out.push({ pos: p, color: c, intensity: i, distance: d });
  }
  // a far, warm kicker from behind-right (a break in the overcast): the edge light on every silhouette
  const [kx, kz] = fromUV(...castUV(52, 30));
  out.push({ pos: new THREE.Vector3(kx, lp.y + 8.5, kz), color: 0xffd9b0, intensity: 3400, distance: 75 });
  return out;
}

// ---------------------------------------------------------------------------------- night threats
const night = new THREE.Group();
night.name = 'night';
night.visible = false;
scene.add(night);
function faceUV(obj, u, v) {
  const [x, z] = fromUV(u, v);
  obj.rotation.y = Math.atan2(x - obj.position.x, z - obj.position.z);
}
function eyePair(u, v, h, sep, size, color, towardUV) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const m = patch(new THREE.SpriteMaterial({ map: SPR.glow, color, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), { additive: true });
    const sp = new THREE.Sprite(m);
    sp.scale.set(size, size, 1);
    sp.position.set(sx * sep * 0.5, 0, 0);
    g.add(sp);
  }
  const [x, z] = fromUV(u, v);
  g.position.set(x, groundAt(x, z) + h, z);
  faceUV(g, ...towardUV);
  night.add(g);
  return g;
}
const NIGHT_CAM = WATCH;
const GATE_UV = WATCH.gate;
const nightRel = watchRel;
const nightActors = {
  s1: place(makeStalker(SPR, { eyeGain: 1.5 }), ...nightRel(10.5, -1.7)),
  s2: place(makeStalker(SPR, { eyeGain: 1.5 }), ...nightRel(17.5, 5.2)),
  s3: place(makeStalker(SPR, { eyeGain: 1.3 }), 58.5, -3.5),
  bone: place(makeBoneHound(SPR, { glow: 0.6, tint: 0x8fedd8 }), ...nightRel(7.6, 1.9)),
  survivor: place(makeSurvivor(SPR), 0, 0),
  hound: place(makeHound(SPR, { pose: 'wary', headYaw: 0.1 }), 0, 0),
};
{
  const S = SITE.shelter, g = meta.shelter.gate;
  // the survivor stands guard in the gateway, dark against the firelit haze behind him, the hound at his knee
  const gx = S.x + 0.5 + g.ax * (meta.shelter.R + 0.9), gz = S.z + 0.5 + g.az * (meta.shelter.R + 0.9);
  nightActors.survivor.position.set(gx, groundAt(gx, gz), gz);
  nightActors.hound.position.set(gx - g.az * 1.3 + g.ax * 0.5, groundAt(gx - g.az * 1.3 + g.ax * 0.5, gz + g.ax * 1.3 + g.az * 0.5), gz + g.ax * 1.3 + g.az * 0.5);
  // warm haze hanging in the gateway
  { const hz = new THREE.Sprite(patch(new THREE.SpriteMaterial({ map: SPR.glow, color: new THREE.Color(1.0, 0.4, 0.11).multiplyScalar(1.0), opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), { additive: true }));
    hz.scale.set(18, 12, 1); hz.position.set(gx - g.ax * 2.5, groundAt(gx, gz) + 2.2, gz - g.az * 2.5); night.add(hz); }
  for (const k in nightActors) night.add(nightActors[k]);
  nightActors.s2.scale.setScalar(1.08); nightActors.s3.scale.setScalar(0.95);
  for (const k of ['s1', 's2', 'bone', 'survivor', 'hound']) faceUV(nightActors[k], NIGHT_CAM.u, NIGHT_CAM.v);
  nightActors.s1.rotation.y += 0.25; nightActors.s2.rotation.y -= 0.3; nightActors.bone.rotation.y += 1.0;
  faceUV(nightActors.s3, 60, 12);
  const pale = new THREE.Color(0.75, 0.9, 1.0).multiplyScalar(1.6), green = new THREE.Color(0.5, 1.0, 0.84).multiplyScalar(1.3);
  const cam = [NIGHT_CAM.u, NIGHT_CAM.v];
  eyePair(...nightRel(19, -11.5), 2.6, 0.12, 0.2, pale, cam);
  eyePair(...nightRel(24, -8.5), 0.8, 0.13, 0.17, green, cam);
  eyePair(...nightRel(16.5, 11.8), 2.65, 0.12, 0.2, pale, cam);
  eyePair(44, 22, 2.7, 0.15, 0.24, pale, cam);
  eyePair(50.5, 29.5, 2.75, 0.15, 0.24, pale, cam);
  eyePair(47, -1, 2.65, 0.14, 0.22, pale, cam);
  eyePair(66.8, 27.5, 2.7, 0.15, 0.24, pale, cam);
  eyePair(52, 4, 0.8, 0.14, 0.19, green, cam);
}

// ------------------------------------------------------------------------------- first person
const isTouch = () => matchMedia('(pointer: coarse)').matches || window.innerHeight < 500;
if (isTouch()) document.body.classList.add('touch');
const play = new THREE.Group();
play.name = 'play';
play.visible = false;
scene.add(play);
const viewArm = makeViewArm(makePick(0.8));
viewArm.visible = false;
camera.add(viewArm);
const playHound = makeHound(SPR, { pose: 'wary', headYaw: -0.3 });
play.add(playHound);
// something is already watching from the tree line
const playStalker = makeStalker(SPR, { eyeGain: 1.9 });
play.add(playStalker);
// a torch staked beside the path, and mist catching the last light behind the watcher
const playTorch = bake(makeTorch(SPR, 2.3, 'torch'));
play.add(playTorch);
const playMist = new THREE.Sprite(patch(new THREE.SpriteMaterial({ map: SPR.soft, color: new THREE.Color(0.42, 0.5, 0.6), opacity: 0.4, depthWrite: false, transparent: true })));
playMist.scale.set(6.5, 5, 1);
play.add(playMist);
let playSet = null;
/**
 * Loose rock and a wind-thrown trunk on the open ground to the right of the path. P(ahead, right, height) is camera-relative.
 * The shots merge it all into a few meshes. The game passes `pieces` and gets every stone and the trunk as an
 * object of its own, with the spots it rests on, so each can settle when the ground under it is dug away.
 */
function buildPlaySet(P, pieces = null) {
  const g = new THREE.Group();
  const stone = [mat(0x3d4147, { tex: 'plain', rough: 0.95, normalScale: 1.4 }), mat(0x4a4d51, { tex: 'plain', rough: 0.95, normalScale: 1.4 })];
  [[10.6, 6.5, 1.25, 0.8, 0.5], [9.5, 5.9, 0.7, 0.75, 1.3], [11.4, 10.8, 0.85, 0.6, 2.2], [6.0, 4.4, 0.36, 0.65, 0.8], [16.5, 6.0, 1.1, 0.6, 0.2], [7.3, 6.4, 0.3, 0.7, 1.9]].forEach(([f, r, sz, sq, yaw], i) => {
    const [x, y, z] = P(f, r);
    const st = box(sz * 1.2, sz * sq, sz, stone[i % 2], { r: sz * 0.2, seg: 2, taper: [0.66, 0.74], shear: [sz * 0.12, -sz * 0.08], uv: 1.6 });
    st.position.set(x, y + sz * sq * 0.36, z); st.rotation.set(0.1 * (i % 3 - 1), yaw, -0.09); g.add(st);
    if (pieces) pieces.push({ obj: st, pts: [[x, z]] });
  });
  const bark = mat(0x2e2721, { tex: 'wood', rough: 1 }), barkL = mat(0x4a4038, { tex: 'wood', rough: 1 });
  // the trunk lies across the view, its root end toward the path
  const tg = pieces ? new THREE.Group() : g;
  tg.add(strut(P(7.4, 3.9, 0.2), P(8.3, 6.3, 0.2), 0.4, bark, { r: 0.14, taper: 0.86, uv: 1 }));
  tg.add(strut(P(8.3, 6.3, 0.2), P(8.9, 8.6, 0.16), 0.33, bark, { r: 0.12, taper: 0.7, uv: 1 }));
  tg.add(strut(P(7.2, 3.7, 0.2), P(7.05, 3.3, 0.5), 0.2, barkL, { r: 0.05, taper: 0.4 }));                 // torn root stubs
  tg.add(strut(P(7.25, 3.8, 0.24), P(7.5, 3.4, 0.05), 0.16, barkL, { r: 0.04, taper: 0.4 }));
  tg.add(strut(P(7.9, 5.3, 0.36), P(7.7, 5.5, 1.1), 0.08, barkL, { r: 0.03, taper: 0.4 }));                // dead branches
  tg.add(strut(P(8.5, 7.0, 0.32), P(8.8, 6.8, 1.0), 0.07, barkL, { r: 0.025, taper: 0.4 }));
  tg.add(strut(P(8.7, 7.9, 0.28), P(8.4, 8.4, 0.75), 0.055, barkL, { r: 0.02, taper: 0.4 }));
  if (!pieces) return bake(g);
  g.add(bake(tg));
  pieces.push({ obj: tg, pts: [P(7.4, 3.9), P(8.3, 6.3), P(8.9, 8.6)].map(([x, , z]) => [x, z]) });   // it bridges a hole as long as one of the three still holds it
  return g;
}
const playPieces = [];                                       // game only: what can settle (see buildPlaySet)
let playLights = [];                                         // the light list of the play shot, so the game can find its lantern and torch
let oreFace = null;                                          // the lit face of the outcrop's glowing block: where the crystal nubs stand
// selection outline and break cracks on the block under the crosshair
const TB = meta.outcrop;
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012, 1.012, 1.012)), patch(new THREE.LineBasicMaterial({ color: 0xe8edf2, transparent: true, opacity: 0.85 })));
outline.position.set(TB.x + 0.5, TB.y + 0.5, TB.z + 0.5);
play.add(outline);
const crackTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const branch = (x, y, a, len, w, depth) => {
    ctx.beginPath(); ctx.moveTo(x, y);
    const n = 4;
    for (let i = 0; i < n; i++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; ctx.lineTo(x, y); }
    ctx.lineWidth = w; ctx.strokeStyle = 'rgba(8,9,11,0.92)'; ctx.stroke();
    ctx.lineWidth = Math.max(0.6, w * 0.35); ctx.strokeStyle = 'rgba(190,235,230,0.5)'; ctx.stroke();
    if (depth > 0) { branch(x, y, a + 0.6 + rnd() * 0.5, len * 0.62, w * 0.7, depth - 1); if (rnd() < 0.75) branch(x, y, a - 0.6 - rnd() * 0.5, len * 0.55, w * 0.7, depth - 1); }
  };
  for (let i = 0; i < 6; i++) branch(60 + rnd() * 10, 66 + rnd() * 8, i * 1.05 + rnd() * 0.4, 30 + rnd() * 14, 3.2, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const cracks = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), patch(new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
play.add(cracks);
// crystal nubs standing proud of the vein, so the ore is more than a picture on the block face
const oreNubs = new THREE.Group();
{
  // lit crystal with a glow of its own: the facets shade, the tips stay bright
  const dim = mat(0x3c8f88, { tex: null, rough: 0.25, emissive: 0x1f8f84, emissiveIntensity: 0.55 }), hot = mat(0x7fd6cc, { tex: null, rough: 0.2, emissive: 0x55e6d6, emissiveIntensity: 1.3 });
  // [x, y on the face, length, width, tilt, twist, bright]
  const N = [[-0.25, 0.1, 0.15, 0.055, 0.5, -0.4, 0], [-0.2, 0.15, 0.09, 0.04, -0.3, 0.5, 1], [-0.29, 0.06, 0.07, 0.034, 0.2, 1.2, 0], [0.27, -0.1, 0.16, 0.058, 0.35, 0.6, 0], [0.22, -0.06, 0.085, 0.038, -0.5, 0.2, 1],
    [0.31, -0.14, 0.07, 0.034, 0.6, -0.9, 0], [-0.35, 0.37, 0.12, 0.046, 0.3, 0.3, 1], [-0.31, 0.41, 0.06, 0.03, -0.4, 1.0, 0], [0.4, 0.22, 0.08, 0.036, 0.45, -0.2, 0]];
  for (const [x, y, L, w, tilt, twist, b] of N) {
    const c = box(w, L, w * 0.8, b ? hot : dim, { r: 0, taper: [0.22, 0.22], anchor: 'bottom' });
    c.castShadow = false;
    c.position.set(x, y, -0.004);
    c.rotation.set(Math.PI / 2 + tilt * 0.7, twist, tilt * 0.5);
    oreNubs.add(c);
  }
}
play.add(oreNubs);

// compass: heading from the view direction, and the bearing and distance of home (drawn by hud.js)
function setCompass(pos, dir) {
  const S = SITE.shelter, hx = S.x + 0.5 - pos.x, hz = S.z + 0.5 - pos.z;
  drawCompass((Math.atan2(dir.x, -dir.z) * 180 / Math.PI + 360) % 360, Math.atan2(hx, -hz) * 180 / Math.PI, Math.hypot(hx, hz));
}

function showOnly(mode) {
  cast.visible = mode === 'cast';
  if (shelter.jettyTorch) shelter.jettyTorch.visible = mode !== 'cast';
  night.visible = mode === 'night';
  play.visible = mode === 'play';
  heroCast.visible = mode === 'hero';
  viewArm.visible = mode === 'play';
  document.body.dataset.mode = mode;
}

// ----------------------------------------------------------------------------------------- shots
// the survivor and his hound on the ledge at the head of the valley, a lantern set down beside them
const heroCast = new THREE.Group();
heroCast.name = 'heroCast';
heroCast.visible = false;
scene.add(heroCast);
const heroActors = { survivor: makeSurvivor(SPR, { lantern: false }), hound: makeHound(SPR, { headYaw: 0.1 }), lantern: makeLantern(SPR, true) };
heroActors.lantern.scale.setScalar(1.7);
heroCast.add(heroActors.survivor, heroActors.hound, heroActors.lantern);
// loose stones and a dead branch on the ledge: [u, v, size, squash, yaw]
{
  const stone = [mat(0x43474d, { tex: 'plain', rough: 0.95, normalScale: 1.5 }), mat(0x54575a, { tex: 'plain', rough: 0.95, normalScale: 1.5 }), mat(0x363b30, { tex: 'fur', rough: 1 })];
  const clutter = new THREE.Group();
  const S = [[1.2, 0.6, 0.5, 0.6, 0.4], [2.6, 5.9, 0.62, 0.55, 1.2], [3.5, -0.3, 0.34, 0.7, 2.1], [4.6, 6.4, 0.44, 0.6, 0.2], [0.4, 4.6, 0.3, 0.65, 1.7], [6.6, 4.9, 0.36, 0.6, 2.6],
    [2.9, 3.3, 0.2, 0.7, 0.9], [3.3, 3.75, 0.13, 0.8, 0.1], [1.9, 1.9, 0.16, 0.7, 2.2], [5.0, 5.0, 0.22, 0.6, 1.4], [0.2, 2.3, 0.24, 0.6, 0.6], [6.9, 2.0, 0.3, 0.6, 1.9], [4.1, 1.3, 0.12, 0.8, 0.3]];
  S.forEach(([u, v, sz, sq, yaw], i) => {
    const [x, z] = fromUV(u, v);
    // broken, angular lumps: tapered, sheared, sunk a little into the ground
    const st = box(sz * 1.2, sz * sq, sz, stone[i % 2], { r: sz * 0.13, seg: 2, taper: [0.62 + (i % 3) * 0.08, 0.7], shear: [sz * 0.14 * (i % 2 ? 1 : -1), sz * 0.1], uv: 2.2 });
    st.position.set(x, groundAt(x, z) + sz * sq * 0.34, z);
    st.rotation.set((i % 3 - 1) * 0.14, yaw, (i % 2 - 0.5) * 0.2);
    clutter.add(st);
    if (i % 3 === 0) { const m = box(sz * 0.9, sz * 0.2, sz * 0.75, stone[2], { r: sz * 0.09, uv: 2 }); m.position.set(x - sz * 0.1, groundAt(x, z) + sz * sq * 0.86, z); m.rotation.y = yaw; clutter.add(m); }
  });
  // wind-thrown branch near the rim
  const wood = mat(0x3a332c, { tex: 'wood', rough: 1 }), woodL = mat(0x57504a, { tex: 'wood', rough: 1 });
  const bp = (u, v, h) => { const [x, z] = fromUV(u, v); return [x, groundAt(x, z) + h, z]; };
  clutter.add(strut(bp(3.4, 4.5, 0.09), bp(5.4, 6.9, 0.2), 0.13, wood, { r: 0.04, taper: 0.55 }));
  clutter.add(strut(bp(4.2, 5.45, 0.14), bp(4.0, 6.5, 0.42), 0.06, woodL, { r: 0.02, taper: 0.4 }));
  clutter.add(strut(bp(4.8, 6.2, 0.18), bp(5.5, 6.0, 0.55), 0.05, wood, { r: 0.02, taper: 0.4 }));
  clutter.add(strut(bp(3.8, 4.95, 0.12), bp(4.5, 4.6, 0.3), 0.045, woodL, { r: 0.015, taper: 0.4 }));
  heroCast.add(bake(clutter));
}

// ravens wheeling round the broken tower: a few dark chevrons, two triangles each
{
  const K = SITE.keep, pos = [], idx = [];
  const birds = [[4, 70, -3, 0.4, 0.5], [9, 75, 2, 2.1, 0.2], [-3, 79, 5, 4.0, 0.7], [13, 66, -7, 5.2, 0.35], [-9, 72, -2, 1.2, 0.6], [6, 83, 9, 3.1, 0.15], [18, 73, 6, 0.9, 0.45]];
  for (const [dx, y, dz, yaw, flap] of birds) {
    const c = Math.cos(yaw), sn = Math.sin(yaw), span = 1.3, up = (flap - 0.4) * 1.1, b = pos.length / 3;
    const P = (lx, ly, lz) => pos.push(K.x + 6 + dx + lx * c + lz * sn, y + ly, K.z - 5 + dz - lx * sn + lz * c);
    P(0, 0, 0.3); P(0, 0, -0.2); P(span, up, -0.12); P(-span, up, -0.12); P(span * 0.5, up * 0.3, 0.16); P(-span * 0.5, up * 0.3, 0.16);
    idx.push(b, b + 4, b + 1, b + 4, b + 2, b + 1, b, b + 1, b + 5, b + 5, b + 1, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, patch(new THREE.MeshBasicMaterial({ color: 0x0c0e11, side: THREE.DoubleSide })));
  m.name = 'ravens';
  heroCast.add(m);
}

defineShot('hero', () => {
  setTime('dusk');
  const G = SITE.ledge;
  camera.fov = 42; camera.near = 0.3;
  const [cx, cz] = fromUV(HERO_CAM.u, HERO_CAM.v);
  camera.position.set(cx, G.y + 4.3, cz);
  const [tx, tz] = fromUV(95, 1);
  camera.lookAt(tx, 29, tz);
  camera.updateProjectionMatrix();
  const su = 5.6, sv = 2.9;
  place(heroActors.survivor, su, sv, Math.PI - 0.85);
  place(heroActors.hound, su - 0.3, sv - 1.6, Math.PI - 0.45);
  place(heroActors.lantern, su - 0.2, sv + 0.95, 0.5, 0.28);
  showOnly('hero');
  scene.updateMatrixWorld(true);
  const [fx, fz] = fromUV(70, 0);
  fitShadow(fx, 24, fz, 120);
  const lp = heroActors.lantern.position.clone().add(new THREE.Vector3(0, 0.25, 0));
  useLights([...shelter.lights, { pos: lp, color: 0xff9a50, intensity: 4.6, distance: 9 }]);
});

defineShot('night', () => {
  // the moon hangs over the slope behind the shelter, as seen from the forest edge
  const [gx0, gz0] = fromUV(...GATE_UV);
  const [cx, cz] = fromUV(NIGHT_CAM.u, NIGHT_CAM.v);
  const viewAz = Math.atan2(gx0 - cx, -(gz0 - cz)) * 180 / Math.PI;
  setTime('night', viewAz + 4.2, 20.5);
  showOnly('night');
  camera.fov = 41; camera.near = 0.2;
  camera.position.set(cx, groundAt(cx, cz) + 1.45, cz);
  camera.lookAt(gx0, camera.position.y + 4.6, gz0);
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  { const [fx, fz] = fromUV(55, -8); fitShadow(fx, SITE.shelter.y, fz, 46, 300); }
  // the hound's cold light, set a little toward the camera so the near legs are lit by it too
  const core = nightActors.bone.userData.core.clone().applyMatrix4(nightActors.bone.matrixWorld);
  core.add(new THREE.Vector3(cx - core.x, 0, cz - core.z).normalize().multiplyScalar(0.45));
  const lp = new THREE.Vector3();
  nightActors.survivor.userData.lantern.getWorldPosition(lp);
  useLights([...shelter.lights.map((l) => ({ ...l, intensity: l.intensity * 2.4, distance: l.distance * 1.2 })), { pos: core, color: 0x8fedd8, intensity: 0.9, distance: 4.0 }, { pos: lp.add(new THREE.Vector3(0, -0.08, 0)), color: 0xff8a3a, intensity: 2.4, distance: 4 }]);
});

defineShot('play', () => {
  setTime('dusk');
  // the gameplay view sits about half a stop above the key art: you have to see what you are digging
  hemi.intensity = 4.3; post.grade.uExposure.value = 1.12;
  showOnly('play');
  document.body.classList.toggle('touch', isTouch());
  // a few steps outside the gate, on the shore, facing home
  const [px, pz] = gateRel(meta, 10.0, 2.2);
  const eye = groundAt(px, pz) + 1.62;
  camera.fov = isTouch() ? 58 : 62; camera.near = 0.05;
  camera.position.set(px, eye, pz);
  // the crosshair rests on the glowing block, a little off its middle
  const aimAt = new THREE.Vector3(TB.x + 0.56, TB.y + 0.47, TB.z + 0.5);
  camera.lookAt(aimAt);
  camera.updateProjectionMatrix();
  // put the cracks on the face the view ray enters through
  const d = aimAt.clone().sub(camera.position);
  const ax = Math.abs(d.x) > Math.abs(d.z) ? 'x' : 'z';
  if (ax === 'z') { const sgn = d.z > 0 ? -1 : 1; cracks.position.set(TB.x + 0.5, TB.y + 0.5, TB.z + 0.5 + sgn * 0.503); cracks.rotation.set(0, sgn > 0 ? 0 : Math.PI, 0); }
  else { const sgn = d.x > 0 ? -1 : 1; cracks.position.set(TB.x + 0.5 + sgn * 0.503, TB.y + 0.5, TB.z + 0.5); cracks.rotation.set(0, sgn * Math.PI / 2, 0); }
  oreNubs.position.copy(cracks.position); oreNubs.rotation.copy(cracks.rotation);
  oreFace = ax === 'z' ? { nx: 0, nz: d.z > 0 ? -1 : 1 } : { nx: d.x > 0 ? -1 : 1, nz: 0 };
  // the hound waits in the light of the gate, watching the tree line
  const fwd = new THREE.Vector3(d.x, 0, d.z).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  // he has gone up on the bank and turned toward the trees: hackles up, head low
  const hp = camera.position.clone().addScaledVector(fwd, 6.2).addScaledVector(right, -2.7);
  playHound.position.set(hp.x, groundAt(hp.x, hp.z), hp.z);
  playHound.rotation.y = Math.atan2(fwd.x, fwd.z) - 0.82;
  const P = (f, r, h = 0) => { const p = camera.position.clone().addScaledVector(fwd, f).addScaledVector(right, r); return [p.x, groundAt(p.x, p.z) + h, p.z]; };
  if (!playSet) { playSet = buildPlaySet(P, GAME ? playPieces : null); play.add(playSet); }
  const sp = new THREE.Vector3(...P(12.5, 9.8));
  playStalker.position.copy(sp);
  playStalker.rotation.y = Math.atan2(camera.position.x - sp.x, camera.position.z - sp.z) + 0.25;
  playMist.position.copy(sp).addScaledVector(fwd, 2.2).add(new THREE.Vector3(0, 2.0, 0));
  playTorch.position.set(...P(10.0, 5.4));
  setCompass(camera.position, d);
  viewArm.position.set(0.42, -0.23, -0.55);
  viewArm.scale.setScalar(0.9);
  scene.updateMatrixWorld(true);
  fitShadow(px + fwd.x * 30, eye - 2, pz + fwd.z * 30, 70);
  // the lantern on the left hip: a soft light on the arm, and its throw on the ground ahead
  const hip = camera.position.clone().addScaledVector(right, -0.3).add(new THREE.Vector3(0, -0.45, 0)).addScaledVector(fwd, -0.1);
  const throwAt = camera.position.clone().addScaledVector(right, -0.7).add(new THREE.Vector3(0, -0.55, 0)).addScaledVector(fwd, 1.7);
  playLights = [
    ...shelter.lights.filter((l) => l.kind !== 'lantern' && l !== shelter.jettyLight).map((l) => ({ ...l, color: 0xff9046 })),
    { pos: playTorch.userData.lightAt.clone().add(playTorch.position), color: 0xff8a3a, intensity: 20, distance: 10, kind: 'stake' },
    { pos: hip, color: 0xffb47a, intensity: 1.5, distance: 3, kind: 'hip' },
    { pos: throwAt, color: 0xffac6c, intensity: 15, distance: 12, kind: 'throw' },
    { pos: new THREE.Vector3(cracks.position.x, cracks.position.y, cracks.position.z).addScaledVector(fwd, -0.35), color: 0x8ff0e6, intensity: 0.9, distance: 2.6, kind: 'ore' },
  ];
  useLights(playLights);
});

defineShot('cast', () => {
  setTime('grey');
  showOnly('cast');
  const [cx, cz] = fromUV(CAST_CAM.u, CAST_CAM.v);
  const gy = groundAt(...fromUV(...castUV(3, 10)));
  // the line-up is framed for 16:9; on narrower screens widen the lens so nobody is cut off
  const aspect = window.innerWidth / window.innerHeight;
  camera.fov = aspect >= 16 / 9 ? 38 : Math.min(74, 2 * Math.atan(Math.tan(19 * Math.PI / 180) * (16 / 9) / aspect) * 180 / Math.PI);
  camera.near = 0.2;
  camera.position.set(cx, gy + 1.5, cz);
  const [tx, tz] = fromUV(...castUV(0, 12));
  camera.lookAt(tx, gy + 2.45, tz);
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  fitShadow(tx, gy, tz, 24, 260);
  useLights(castLights());
  updateTags();
});
if (Q.has('dev')) {
  // close look at one cast actor: ?dev&zoom=hound&az=40&dist=3
  defineShot('zoom', async () => {
    await window.__shot('cast');
    const a = actors[Q.get('zoom') || 'hound'];
    const az = (Number(Q.get('az') || 35)) * Math.PI / 180 + a.rotation.y, dist = Number(Q.get('dist') || 3.2);
    const hgt = a.userData.height || 1.5;
    camera.fov = 30;
    camera.position.set(a.position.x + Math.sin(az) * dist, a.position.y + hgt * (Number(Q.get('eye') || 0.7)), a.position.z + Math.cos(az) * dist);
    camera.lookAt(a.position.x, a.position.y + hgt * 0.5, a.position.z);
    camera.updateProjectionMatrix();
    document.getElementById('tags').style.visibility = 'hidden';
  });
  defineShot('walk', () => {
    setTime('dusk');
    const S = SITE.shelter, g = meta.shelter.gate;
    const px = S.x + 0.5 + g.ax * 12 + 3, pz = S.z + 0.5 + g.az * 12 + 4;
    const py = world.topY(Math.floor(px), Math.floor(pz)) + 2.7;
    camera.fov = 60; camera.near = 0.1; camera.position.set(px, py, pz);
    camera.lookAt(SITE.keep.x + 10, 40, SITE.keep.z);
    camera.updateProjectionMatrix();
    fitShadow(px, py, pz - 30, 90);
    useLights(shelter.lights);
  });
  defineShot('camp', () => {
    setTime('dusk');
    const S = SITE.shelter;
    camera.fov = 55; camera.near = 0.1; camera.position.set(S.x - 4.5, S.y + 3.2, S.z + 5.5);
    camera.lookAt(S.x + 1.5, S.y + 1.8, S.z - 1);
    camera.updateProjectionMatrix();
    fitShadow(S.x, S.y, S.z, 60);
    useLights(shelter.lights);
  });
  defineShot('top', () => {
    setTime('dusk');
    camera.fov = 40; camera.position.set(SX / 2, 300, SZ / 2 + 1); camera.lookAt(SX / 2, 0, SZ / 2); camera.updateProjectionMatrix();
    fitShadow(SX / 2, 24, SZ / 2, 130);
    U.uFogParams.value.set(0.0, 0.0, WL + 1, 0.11);
    U.uSkyOcc.value.set(1, 1); hemi.intensity = Q.has('sunonly') ? 1.2 : 7; sun.intensity = Q.has('sunonly') ? 40 : 3;
    forest.root.visible = !Q.has('noforest');
    useLights([]);
  });
}

// ------------------------------------------------------------------------- the playable game
const NAMES = {
  [B.ROCK]: 'صخر', [B.ROCK_MOSS]: 'صخر مطحلب', [B.SNOW]: 'صخر مثلج', [B.LITTER]: 'أرض الغابة', [B.HEATH]: 'عشب المرتفعات', [B.SOIL]: 'تراب',
  [B.GRAVEL]: 'حصى', [B.PATH]: 'درب مدكوك', [B.ASH]: 'رماد', [B.TRUNK]: 'جذع صنوبر', [B.NEEDLES]: 'إبر صنوبر', [B.BRICK]: 'حجر الأطلال',
  [B.BRICK_MOSS]: 'حجر أطلال مطحلب', [B.PLANKS]: 'ألواح خشب', [B.STAKE]: 'وتد السور', [B.ORE_IRON]: 'خام حديد', [B.ORE_GLOW]: 'خام متوهّج',
  [B.FERN]: 'سرخس', [B.DRYGRASS]: 'عشب يابس', [B.REEDS]: 'قصب',
};
const EARTH = new Set([B.LITTER, B.HEATH, B.SOIL, B.GRAVEL, B.PATH, B.ASH]), WOOD = new Set([B.TRUNK, B.PLANKS, B.STAKE]), ORE = new Set([B.ORE_IRON, B.ORE_GLOW]);
const kindOf = (id) => BLOCKS[id].kind ?? 'solid';
const iconOf = (id) => (kindOf(id) === 'cross' || id === B.NEEDLES ? 'plant' : ORE.has(id) ? 'ore' : id === B.PLANKS ? 'plank' : WOOD.has(id) ? 'log' : EARTH.has(id) && id !== B.GRAVEL ? 'earth' : 'stone');
const SLOT_ID = { log: B.TRUNK, stone: B.ROCK, plank: B.PLANKS };
/** What digging a block puts in the bag: the bar has one slot per family (and none yet for earth or plants). */
const DROP = {
  [B.TRUNK]: B.TRUNK, [B.PLANKS]: B.PLANKS,
  [B.ROCK]: B.ROCK, [B.ROCK_MOSS]: B.ROCK, [B.SNOW]: B.ROCK, [B.GRAVEL]: B.ROCK, [B.BRICK]: B.ROCK, [B.BRICK_MOSS]: B.ROCK, [B.ORE_IRON]: K.ORE, [B.ORE_GLOW]: K.ORE,            // ore comes out as ore: the workbench turns it into gold
};

async function startGame() {
  await Promise.all(['400', '500', '700'].map((w) => document.fonts.load(w + " 14px 'Plex Arabic'", 'ظلام').catch(() => null)));   // a font that cannot be fetched must not stop the page
  // the shared building kit. Its two lights join the scene before the first picture is drawn, so every shader is
  // built once for the final number of lights. Whatever the kit clears below the lake's level fills with the lake.
  const inLake = (x, y, z) => y <= WL && x >= wx0 && x < wx1 && z >= wz0 && z < wz1;
  const kit = createKit({ scene, world, terrain: { setBlock: (x, y, z, id) => terrain.setBlock(x, y, z, id === 0 && inLake(x, y, z) ? B.WATER : id) } });
  await window.__shot('play');                       // dusk, the HUD and the pick in hand, a few steps outside the gate
  stage.live = true;
  document.body.classList.add('game');
  // the sun and the world stand still, so the shadow map is drawn again only after an edit or when it is moved
  renderer.shadowMap.autoUpdate = false;
  const shadowsChanged = () => { renderer.shadowMap.needsUpdate = true; };
  shadowsChanged();

  const hud = initHud();
  const slots = SLOTS.map((q) => ({ ...q, id: SLOT_ID[q.key] ?? 0 }));
  if (!hud.touch) slots.push(EMPTY);                          // nine squares on a desktop, the ninth empty
  const cell = (x, y, z) => x + SX * (z + SZ * y);
  const isLiquid = (id) => id === B.WATER || kit.isLiquid(id);
  // what stops a body: every block but water and plants (the palisade cells, drawn as a prop, and the kit's blocks too)
  const isSolid = (id) => id !== 0 && !isLiquid(id) && kindOf(id) !== 'cross' && !(BLOCKS[id] && BLOCKS[id].solid === false);     // an open door lets the player through
  const solidCell = (x, y, z) => isSolid(world.get(x, y, z));

  // ---- what may not be dug: the camp stands on its yard, and the props there cannot move
  const guard = new Set();
  {
    const S = SITE.shelter, sh = meta.shelter, g = sh.g;
    for (let z = S.z - 9; z <= S.z + 9; z++) for (let x = S.x - 9; x <= S.x + 9; x++) if (Math.hypot((x - S.x) * 0.93, z - S.z) < sh.R + 0.5) guard.add(cell(x, g, z));
    for (const k of sh.stakes) guard.add(cell(k.x, g, k.z));
    for (let dz = 0; dz <= 4; dz++) for (let dx = 0; dx <= 3; dx++) for (let y = g + 1; y <= g + 3; y++) if (world.get(sh.hut.x + dx, y, sh.hut.z + dz) === B.PLANKS) guard.add(cell(sh.hut.x + dx, y, sh.hut.z + dz));
    for (const t of sh.torches) guard.add(cell(Math.floor(t.x), Math.floor(t.y) - 1, Math.floor(t.z)));
    // the two gate posts (placed as in props.js)
    const gl = Math.hypot(sh.gate.ax, sh.gate.az), ox = sh.gate.ax / gl, oz = sh.gate.az / gl, t = sh.R / Math.hypot(ox * 0.93, oz);
    for (const sg of [-1, 1]) for (const a of [-0.33, 0.33]) for (const b of [-0.33, 0.33]) {
      guard.add(cell(Math.floor(sh.fire.x + ox * t - oz * sg * 2.45 + ox * 0.15 + a), g, Math.floor(sh.fire.z + oz * t + ox * sg * 2.45 + oz * 0.15 + b)));
    }
  }
  // the outermost columns stay too: the world has no wall faces along its border
  const inRing = (x, z) => x > 0 && z > 0 && x < SX - 1 && z < SZ - 1;
  const canBreak = (id, x, y, z) => id !== B.STAKE && inRing(x, z) && !guard.has(cell(x, y, z));
  // ---- where nothing may be built: the outermost columns (a block set there could never be taken back), and the
  // cells the camp's fire, torches and lantern stand in. Water from the kit is not poured into the lake either:
  // the two waters are different blocks, and the lake stays the lake
  const keepOut = new Set();
  {
    const sh = meta.shelter;
    for (let y = 0; y <= 1; y++) keepOut.add(cell(Math.floor(sh.fire.x), Math.floor(sh.fire.y) + y, Math.floor(sh.fire.z)));
    for (const t of sh.torches) for (let y = Math.floor(t.y); y <= Math.floor(t.y + t.h); y++) keepOut.add(cell(Math.floor(t.x), y, Math.floor(t.z)));
  }
  const canPlace = (x, y, z, id) => {
    if (!inRing(x, z) || keepOut.has(cell(x, y, z)) || (kit.isLiquid(id) && world.get(x, y, z) === B.WATER)) return false;
    const t = playTorch.position;                                // the staked torch by the path, wherever it has settled
    return !(x === Math.floor(t.x) && z === Math.floor(t.z) && y >= Math.floor(t.y) && y <= Math.floor(t.y + 2.3));
  };

  // ---- things that stand on the ground near the spawn come down with it
  const stakeLight = pool[playLights.findIndex((l) => l.kind === 'stake')], hipLight = pool[playLights.findIndex((l) => l.kind === 'hip')];
  const throwLight = pool[playLights.findIndex((l) => l.kind === 'throw')], oreLight = pool[playLights.findIndex((l) => l.kind === 'ore')];
  playPieces.push({ obj: playTorch, pts: [[playTorch.position.x, playTorch.position.z]], light: stakeLight });
  for (const o of [playHound, playStalker]) playPieces.push({ obj: o, pts: [[o.position.x, o.position.z]] });
  /** Feet height for something that stood at height y in column (x, z): down to the first solid block. */
  const restY = (x, z, y) => { const fx = Math.floor(x), fz = Math.floor(z); while (y > 1 && !solidCell(fx, y - 1, fz)) y--; return y - 1 + kit.heightOf(world.get(fx, y - 1, fz)); };   // a half block holds it half a block lower
  for (const pc of playPieces) {
    for (const pt of pc.pts) pt[2] = restY(pt[0], pt[1], groundAt(pt[0], pt[1]));
    pc.y0 = pc.obj.position.y; pc.drop = 0;
    if (pc.light) pc.ly0 = pc.light.position.y;
  }
  const treeAt = new Map();
  for (const tr of meta.trees) if (!tr.snag) treeAt.set(tr.x + SX * tr.z, tr);
  /** After any edit: props near the spawn settle, the crystal nubs go with their block, the shadows are redrawn. */
  function edited() {
    for (const pc of playPieces) {
      let drop = Infinity;
      for (const pt of pc.pts) drop = Math.min(drop, pt[2] - restY(pt[0], pt[1], pt[2]));
      if (drop === pc.drop) continue;
      pc.drop = drop;
      pc.obj.position.y = pc.y0 - drop;
      if (pc.light) pc.light.position.y = pc.ly0 - drop;
    }
    const nubs = world.get(TB.x, TB.y, TB.z) === B.ORE_GLOW && world.get(TB.x + oreFace.nx, TB.y, TB.z + oreFace.nz) === 0;
    oreNubs.visible = nubs;
    oreLight.intensity = nubs ? 0.9 : 0;                       // intensity, not visibility: the light count must not change (shaders)
    shadowsChanged();
  }

  // ---- what the hand holds follows the item in the chosen square, whichever square that is: the pick, the axe,
  // or the bare hand for anything that is not a tool (blocks, and the things that are only carried)
  const armAxe = makeViewArm(makeAxe(0.86)), armHand = makeViewArm(new THREE.Group());
  for (const a of [armAxe, armHand]) { a.position.copy(viewArm.position); a.scale.copy(viewArm.scale); a.visible = false; camera.add(a); }
  const ARM = { pick: viewArm, axe: armAxe, hand: armHand }, armHome = viewArm.position.clone(), armScale = viewArm.scale.x;
  // the bare hand carries a small copy of the block its square places (nothing for the things that are only carried)
  const heldBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), []), heldCross = new THREE.Mesh(new THREE.BufferGeometry());
  {
    // the terrain's materials read the mesher's extra attributes: plain white, open sky, no fire or lamp light
    const dress = (geo) => {
      const n = geo.attributes.position.count;
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      geo.setAttribute('aLit', new THREE.BufferAttribute(Float32Array.from({ length: n * 2 }, (v, i) => 1 - (i % 2)), 2));
      geo.setAttribute('aTint', new THREE.BufferAttribute(new Uint8Array(n * 4), 4, true));
    };
    dress(heldBox.geometry);
    const g = heldCross.geometry;                               // a flame: two crossed cards, both sides drawn
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(8).fill([0, 1, 0]).flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1], 2));
    g.setIndex([0, 1, 2, 2, 1, 3, 0, 2, 1, 2, 3, 1, 4, 5, 6, 6, 5, 7, 4, 6, 5, 6, 7, 5]);
    dress(g);
    // receiveShadow as the terrain has it: the same shader programs serve both, and the block darkens in the shade
    for (const m of [heldBox, heldCross]) { m.visible = false; m.frustumCulled = false; m.receiveShadow = true; m.rotation.set(0.42, 0.62, 0.1); armHand.add(m); }
  }
  const HELD = 0.17, heldAt = new THREE.Vector3(-0.03, 0.095, -0.33);     // size and place in the arm's space: resting on the fist
  let heldId = -1;
  function holdBlock(item) {
    const id = item && item.id && BLOCKS[item.id] ? item.id : 0;
    if (id === heldId) return;
    heldId = id;
    heldBox.visible = heldCross.visible = false;
    if (!id) return;
    const d = BLOCKS[id], kind = d.kind ?? 'solid', tile = (f) => (typeof d.tiles === 'string' ? d.tiles : d.tiles[f] ?? d.tiles.side);
    const h = kind === 'cross' ? 1 : d.height ?? 1, m = kind === 'cross' ? heldCross : heldBox;
    if (kind === 'cross') m.material = materialFor(tile('side'), kind);
    else {
      // the rock's top grows its moss by place in the world, which would crawl over a block that is carried about
      const side = materialFor(tile('side'), kind), top = tile('top') === 'rockTop' ? side : materialFor(tile('top'), kind);
      m.material = [side, side, top, materialFor(tile('bottom'), kind), side, side];
    }
    m.scale.set(HELD, HELD * h, HELD);
    m.position.copy(heldAt); m.position.y -= HELD * (1 - h) / 2;
    m.visible = true;
  }
  const PIVOT = new THREE.Vector3(0.4, -0.72, 0.08);          // about the elbow, in the arm's own space
  const STROKE = 0.44;                                         // seconds per blow
  const ease = (t) => t * t * (3 - 2 * t);
  /** Angle of the arm through one blow: lift, strike (the point lands on the block at 0.58), recover. At rest the point already rests by the crosshair. */
  const stroke = (f) => (f < 0.42 ? 0.36 * ease(f / 0.42) : f < 0.58 ? 0.36 - 0.56 * ((f - 0.42) / 0.16) ** 2 : -0.2 * (1 - ease((f - 0.58) / 0.42)));
  let tool = 'pick', swing = 0, swingK = 0, kick = 0, bobK = 0, aimed = LITE ? null : { x: camera.position.x, z: camera.position.z }, hintTimer = 0;
  let throwD = 1.7, throwY = -0.55, throwK = 1, throwSnap = false, grounded = false, jumpWas = false, pushV = 0, under = false;
  const THROW_H = 1.07, throwI = throwLight.intensity;         // the lantern's throw hangs this far above the ground, as in the play shot
  const KIT_LIGHT = 0.5;                                       // strength of the kit's two real lights here (see onFrame)
  const SWIM = 3.4, SURGE = 6.4;                               // the controller's own steady swimming speed; the burst of one stroke
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
  // the axe is quick on wood, the pick on stone and ore; the bare hand is slow on all three. Kit blocks have their own times
  const hardness = (id) => kit.hardness(id) ?? (kindOf(id) === 'cross' ? 0.08 : id === B.NEEDLES ? 0.15 : EARTH.has(id) ? 0.35
    : WOOD.has(id) ? (tool === 'axe' ? 0.5 : 1.0) : ORE.has(id) ? (tool === 'pick' ? 1.0 : 2.0) : (tool === 'pick' ? 0.7 : 1.4));
  const eu = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  const half = LITE ? 46 : 70, home = SITE.shelter;
  // under the lake: the mirror has no underside, so one dark sheet closes the water from below and the fog turns to murk
  const DEEP = 0x0a1a22;
  const lakeUnder = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0, wz1 - wz0), new THREE.MeshBasicMaterial({ color: DEEP, fog: false }));
  lakeUnder.rotation.x = Math.PI / 2;
  lakeUnder.position.set((wx0 + wx1) / 2, WL + 0.8, (wz0 + wz1) / 2);
  lakeUnder.visible = false;
  scene.add(lakeUnder);
  const air = { fog: U.uFogColor.value.clone(), sun: U.uFogSunColor.value.clone(), params: U.uFogParams.value.clone(), misc: U.uFogMisc.value.clone() };
  function setUnder(v) {
    under = v;
    lakeUnder.visible = v;
    if (v) { U.uFogColor.value.set(DEEP); U.uFogSunColor.value.set(DEEP); U.uFogParams.value.set(0.17, 0, WL, 0.1); U.uFogMisc.value.set(air.misc.x, 0.995, 0, 0); }
    else { U.uFogColor.value.copy(air.fog); U.uFogSunColor.value.copy(air.sun); U.uFogParams.value.copy(air.params); U.uFogMisc.value.copy(air.misc); }
  }

  let life = null, weather = null, status = null, toolShown = false;
  const heldTool = createHeld({ camera, blocks: {}, materialFor });
  let vitals = null;                                 // made once the HUD is up; the first frames run without it
  const play = createPlay({
    camera, canvas: stage.canvas, world, blocks: BLOCKS, terrain,
    spawn: { x: camera.position.x, y: camera.position.y - 1.62, z: camera.position.z, yaw: eu.y, pitch: eu.x },
    slots, touch: hud.touch ? hud.els : null, maxPixelRatio: LITE ? 1.5 : 2,
    isLiquid, isSolid, heightOf: kit.heightOf,                  // kit water is water to swim in; half blocks and beds are low
    pickable: (id) => id !== 0 && !isLiquid(id),
    canBreak, canPlace, hardness,
    dropOf: (id) => DROP[id] || kit.dropOf(id),
    onTarget(h) {
      outline.visible = !!h;
      if (h) { const hh = kit.heightOf(h.id); outline.scale.y = hh; outline.position.set(h.x + 0.5, h.y + hh / 2, h.z + 0.5); }   // the box fits a half block too
      hud.setTarget(h ? { name: NAMES[h.id] || kit.nameOf(h.id) || 'مكعب', icon: iconOf(h.id), kit: KIT_BLOCKS[h.id] ? kit.dropOf(h.id) : 0, locked: h.y === 0 || !canBreak(h.id, h.x, h.y, h.z) } : null);
    },
    onBreak(h) {
      // dug below the lake's level under its mirror plane: the water comes in, so the picture and the world agree
      if (inLake(h.x, h.y, h.z)) terrain.setBlock(h.x, h.y, h.z, B.WATER);
      // a pine keeps its boughs as long as the log they grow from is there
      if (h.id === B.TRUNK) { const tr = treeAt.get(h.x + SX * h.z); if (tr && h.y === tr.trunkTop - 1) forest.fell(tr); }
      kit.broke(h);
      // a plant or a flame that stood on the block went with it (the controller clears it without a word):
      // a flame's light goes out too, and under the lake's level the water closes over the gap
      const up = world.get(h.x, h.y + 1, h.z), lit = kit.glow.get(h.x + ',' + (h.y + 1) + ',' + h.z);
      if (lit && up !== lit) kit.broke({ x: h.x, y: h.y + 1, z: h.z, id: lit });
      if (up === 0 && inLake(h.x, h.y + 1, h.z)) terrain.setBlock(h.x, h.y + 1, h.z, B.WATER);
      edited();
    },
    onPlace(x, y, z, id) {
      kit.glow.delete(x + ',' + y + ',' + z);                    // a block set into a flame takes its place: that flame's light is gone
      kit.placed(x, y, z, id, play.state.yaw);
      kick = 1; throwSnap = true; edited();
    },
    onInventory(list, sel) {
      hud.setSlots(list, sel);
      const t = ARM[list[sel].tool] ? list[sel].tool : 'hand';
      // a sword, an axe or a pick from the bag has its own model, shown in place of the arm
      const kitTool = heldTool.show(list[sel].model ? list[sel].id : 0);
      if (t !== tool || kitTool !== toolShown) { tool = t; toolShown = kitTool; for (const k in ARM) ARM[k].visible = !kitTool && k === tool; }
      holdBlock(t === 'hand' && !kitTool ? list[sel] : null);
    },
    onBag() { bag.toggle(); },
    onInteract: (h) => bag.interact(h),
    onMenu() { if (weather) weather.toggle(); },
    onUse: (item) => (life ? life.use(item) : false),
    onFly(on) { play.notice(on ? (hud.touch ? 'الطيران شغّال. زر القفز يطلّعك وزر «نزول» ينزّلك، والمشي ما يطيّحك. القفز مرّتين يوقفه.' : 'الطيران شغّال. المسافة تطلّعك وShift ينزّلك. المسافة مرّتين توقفه.') : 'وقف الطيران.', false, on ? 4500 : 1800); },
    onUnlock() { play.stop(); panel.show('pause'); },
    onFirstLook() { hud.els.look.hidden = true; },
    onFrame(st, dt) {
      const d = st.dig, p = st.pos, c = camera.position, h = st.hit;
      const sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);       // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
      hud.setProgress(d.on ? d.progress : 0);
      // the nearest lamps and fires get the kit's two real lights; flames flicker. Every lamp also has its baked
      // glow here (world.js), so the real lights burn at half strength: the two nearest lamps do not outshine the rest
      kit.update(p, dt, st.time);
      if (vitals) vitals.update(dt);
      if (life) life.update(dt);
      if (weather) weather.update(dt);
      if (status) status.update();
      for (const l of kit.lights) l.intensity = (l.userData.flicker ? l.intensity : l.userData.base || 0) * KIT_LIGHT;
      // cracks spread over the face being dug
      if (d.on && h && kindOf(h.id) !== 'cross') {
        const hh = kit.heightOf(h.id);                             // on a half block or a bed the cracks keep to its own faces
        cracks.position.set(h.x + 0.5 + h.nx * 0.503, h.ny > 0 ? h.y + hh + 0.003 : h.ny < 0 ? h.y - 0.003 : h.y + hh / 2, h.z + 0.5 + h.nz * 0.503);
        cracks.scale.y = h.ny ? 1 : hh;
        cracks.rotation.set(-h.ny * Math.PI / 2, h.nx ? h.nx * Math.PI / 2 : h.nz < 0 ? Math.PI : 0, 0);
        cracks.material.opacity = 0.3 + 0.7 * d.progress;
        cracks.visible = true;
      } else cracks.visible = false;
      // the tool: blow after blow while digging, a short push when a block is set down, a sway with each step
      if (d.on) { swing = (swing + dt / STROKE) % 1; swingK = Math.min(1, swingK + dt * 12); }
      else if (swingK > 0) { swing = (swing + dt / STROKE) % 1; swingK = Math.max(0, swingK - dt * 6); if (!swingK) swing = 0; }
      kick = Math.max(0, kick - dt / 0.22);
      bobK += ((st.onGround ? Math.min(1, st.moving / 4.4) : 0) - bobK) * Math.min(1, dt * 10);
      const a = stroke(swing) * swingK, jab = Math.sin(kick * Math.PI) + 0.6 * swingK * Math.max(0, 1 - Math.abs(swing - 0.58) / 0.07), arm = ARM[tool];
      _q.setFromEuler(_e.set(a - 0.16 * jab, -a * 0.34, -a * 0.2));
      _v.copy(PIVOT).applyQuaternion(_q);
      arm.quaternion.copy(_q);
      arm.position.set(
        armHome.x + (PIVOT.x - _v.x) * armScale + Math.sin(st.time * 5.2) * 0.012 * bobK,
        armHome.y + (PIVOT.y - _v.y) * armScale + Math.abs(Math.sin(st.time * 5.2)) * 0.014 * bobK,
        armHome.z + (PIVOT.z - _v.z) * armScale - 0.05 * jab);
      // the lantern on the hip and its throw on the ground ahead go where you go. The throw keeps its distance
      // from whatever it lights (the ground under it, a wall ahead) and dims when a wall is closer still, so it
      // never burns a surface out
      hipLight.position.set(c.x - cos * 0.3 + sin * 0.1, c.y - 0.45, c.z + sin * 0.3 + cos * 0.1);
      {
        const ey = Math.floor(c.y - 0.2);
        let wall = Infinity;
        for (let dd = 0.1; dd < 2.8; dd += 0.1) if (solidCell(Math.floor(c.x - sin * dd), ey, Math.floor(c.z - cos * dd))) { wall = dd; break; }
        const wd = Math.min(1.7, Math.max(0, wall - THROW_H)), k = throwSnap ? 1 : Math.min(1, dt * 10);
        throwSnap = false;
        throwD += (wd - throwD) * k;
        let side = (0.7 * throwD) / 1.7, lx = c.x - cos * side - sin * throwD, lz = c.z + sin * side - cos * throwD;
        if (solidCell(Math.floor(lx), ey, Math.floor(lz))) { lx += cos * side; lz -= sin * side; }           // no room to the left: keep it on the view line
        let wy = c.y - 0.55;
        for (let y = ey - 1; y >= ey - 3; y--) if (solidCell(Math.floor(lx), y, Math.floor(lz))) { wy = Math.max(wy, y + 1 + THROW_H); break; }
        throwY += (wy - c.y - throwY) * k;
        throwK += (Math.min(1, (wall - wd) / THROW_H) ** 2 - throwK) * k;
        throwLight.position.set(lx, c.y + throwY, lz);
        throwLight.intensity = throwI * throwK;
      }
      // water: the shared controller only rises slowly while jump is held, which lifts a tap by less than half a
      // block and leaves no way back onto a bank. Here every press is a stroke worth about a block (a full jump
      // when you stand on the bottom), and swimming against a bank one block high carries you over its edge.
      // The controller has since learned to leave the water by itself (a jump from the surface, a lift against a
      // bank); both only ever raise the upward speed, as this does, so the stronger of the two wins and they never
      // pull against each other. While flying none of it applies: the height is the controller's alone.
      {
        const inp = play.input, T = play.tuning;
        if (st.flying) { pushV = 0; T.swim = SWIM; }
        else {
          const burst = !st.inWater || !inp.jump ? 0 : grounded && !st.onGround ? T.jump : !jumpWas ? SURGE : 0;
          if (burst) { pushV = burst; if (st.vel.y < pushV) st.vel.y = pushV; }
          else pushV = Math.max(0, pushV - T.gravity * dt);
          const mx = cos * inp.fx - sin * inp.fz, mz = -sin * inp.fx - cos * inp.fz, ml = Math.hypot(mx, mz);
          let climb = false;
          if (st.inWater && ml > 0.25) {
            const fy = Math.floor(p.y + 0.5), px = Math.floor(p.x), pz = Math.floor(p.z), tx = Math.floor(p.x + mx / ml * 0.75), tz = Math.floor(p.z + mz / ml * 0.75);
            climb = (tx !== px || tz !== pz) && solidCell(tx, fy, tz) && !solidCell(tx, fy + 1, tz) && !solidCell(tx, fy + 2, tz) && !solidCell(px, fy + 2, pz);
          }
          if (climb && !inp.jump && st.vel.y < T.jump) st.vel.y = T.jump;          // no jump key needed, like the step-up on land
          T.swim = climb ? T.jump : Math.max(SWIM, pushV);
        }
        jumpWas = inp.jump;
        grounded = st.onGround;
      }
      WATER.uTime.value = st.time;                               // the lake's ripples drift
      if ((c.y < WL + 0.82 && world.get(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)) === B.WATER) !== under) setUnder(!under);
      // compass: heading, and the bearing and distance of the shelter
      const hx = home.x + 0.5 - p.x, hz = home.z + 0.5 - p.z;
      hud.setNav(-st.yaw * 180 / Math.PI, Math.atan2(hx, -hz) * 180 / Math.PI, Math.hypot(hx, hz));
      // keep the shadow map around the player
      if (!aimed || Math.hypot(p.x - aimed.x, p.z - aimed.z) > 14) {
        aimed = { x: Math.round(p.x / 4) * 4, z: Math.round(p.z / 4) * 4 };
        fitShadow(aimed.x, Math.min(p.y, groundAt(p.x, p.z)), aimed.z, half);   // on the ground below when flying high over it
        sun.shadow.normalBias = Math.max(0.08, (half * 2 / sun.shadow.mapSize.x) * 1.17);
        shadowsChanged();
      }
      if (hud.touch && hintTimer >= 0 && (hintTimer += dt) > 7) { hud.els.look.hidden = true; hintTimer = -1; }
    },
    stage, render: () => stage.render(),
    setPixelRatio: (pr) => { stage.pixelRatio = pr; stage.resize(); },
  });
  cracks.visible = false;                                      // nothing is being dug yet
  outline.visible = false;
  play.select(slots.findIndex((q) => q.tool === 'pick'));      // the pick is in hand, as in the picture
  hud.setTarget(null);
  hud.setProgress(0);
  play.advance(0);                                             // aim once, so the block ahead is outlined and named behind the start panel too
  hud.els.bar.addEventListener('pointerdown', (e) => {
    if (!play.state.running) return;
    const el = e.target.closest('.slot');
    if (el) play.select(+el.dataset.i); else if (e.target.closest('.more')) hud.page();
    e.preventDefault();
  });
  // the bag (E, or its button on a phone): this world's own things first, then the shared building kit
  const bag = createBag({
    play, kit, camera, world: 'dhalam', shown: slots.length, onMenu: () => { play.stop(); panel.show('pause'); },
    mats: { wood: { ids: [B.TRUNK, B.PLANKS], name: 'خشب' }, stone: { ids: [B.ROCK], name: 'حجر' }, ore: { ids: [], name: 'خام معدن' } },
    groups: [{ title: 'عدّة ظلام', items: SLOTS.map((q) => ({ ...q, id: SLOT_ID[q.key] ?? 0 })) }, ...KIT_GROUPS],
    iconOf: (it) => (it.kit ? kitIcon(it.id) : hud.icon(it.icon)),
    fontFamily: "'Plex Arabic', system-ui, sans-serif", accent: '#e9853a', line: 'rgba(233, 133, 58, .4)',
    onToggle: (v) => { if (v) bagRow(); },
    extra: { label: 'الوقت والجو', onClick: () => weather && weather.open() },
  });
  // The bag draws a picture in its row of squares only for blocks and tools, so the things this world only carries
  // (torch, meat, bandage) would sit there as empty squares. They are filled in each time the bag has drawn its row.
  function bagRow() {
    play.state.slots.forEach((q, i) => {
      if (q.id || q.tool || !q.icon) return;
      const sq = bag.el.querySelector('[data-sq="' + i + '"]');
      if (!sq || sq.querySelector('i')) return;
      sq.querySelector('.pic').innerHTML = hud.icon(q.icon);
      const n = document.createElement('i');
      n.textContent = q.n;
      sq.appendChild(n);
    });
  }
  bag.el.addEventListener('click', bagRow);                    // added after the bag's own handler, so it runs after each redraw
  hud.els.bag.addEventListener('pointerdown', (e) => { if (play.state.running) { bag.toggle(); e.preventDefault(); } });
  const panel = createPlayPanel({
    title: 'ظلام', tagline: 'احفر واجمع وحصّن ملجأك قبل أن يهبط الليل على الأطلال.',
    fontFamily: "'Plex Arabic', system-ui, sans-serif", accent: '#e9853a', line: 'rgba(233, 133, 58, .4)', touch: hud.touch,
    note: 'نسخة تجريبية: الوقت والمطر والوحوش تختارها من لوحة Q (وعلى الجوال من زر داخل الحقيبة). المشعل والضمادة للحمل فقط.',
    onStart() { if (hud.touch) goImmersive(); else play.lock(); play.start(); },
  });
  panel.show('start');
  window.__play = play;
  // health and warmth are real: warmth runs down in the cold (faster in the lake) and comes back beside a fire
  const vq = (sel) => document.querySelector('.vital.' + sel);
  const write = { hp: bars.cssVar(vq('v-health .v-bar i'), vq('v-health .v-num')), warm: bars.cssVar(vq('v-warm .v-bar i'), vq('v-warm .v-num')) };
  const camp = meta.shelter;
  const heat = [...camp.torches.map((t) => ({ x: t.x, y: t.y, z: t.z })), { x: camp.fire.x, y: camp.fire.y, z: camp.fire.z }];
  vitals = createVitals({
    play, kit, world, hp: 82,
    needs: [{ key: 'warm', start: 46, drain: 0.3, wet: 3, rainDrain: 1.8, nightDrain: 1.4, how: 'fire', gain: 9, range: 4.5, heat, low: 'بردت. اقرب من نار المأوى أو مشعل، أو ولّع نار من الحقيبة.' }],
    render(v) { write.hp(v.hp); write.warm(v.warm); },
  });
  // creatures: mountain ibex can be hunted; the stalker and the bone hound come for the player
  life = createLife({
    scene, camera: stage.camera, play, world, vitals: () => vitals,
    kinds: [
      { key: 'ibex', name: 'الوعل', kind: 'animal', make: () => simpleBeast({ body: 0x5d5147, belly: 0x80746a, horn: 0xcfc8b8 }), hp: 12, speed: 2.1, radius: 0.75, height: 1.5, max: 3, drops: [[200, 2], [201, 1]] },
      ...extraKinds('dhalam'),
      { key: 'stalker', name: 'المتربّص', kind: 'monster', make: () => makeStalker(SPR), hp: 20, speed: 2.4, radius: 0.7, height: 3.0, max: 1, dmg: 11 },
      { key: 'bonehound', name: 'ذئب العظم', kind: 'monster', make: () => makeBoneHound(SPR), hp: 12, speed: 3.4, radius: 0.8, height: 1.1, max: 2, dmg: 7 },
    ],
  });
  // hearts, food, armour and experience over the hotbar; the old health row gives way to the hearts
  status = createStatus({ play, mount: document.querySelector('.bar-wrap'), vitals: () => vitals, life: () => life, accent: '#e9853a', hide: [vq('v-health')] });
  // the world panel (Q): morning, sunset or night, clear or rain. Rain and night are colder
  const CLOCK = { morning: ['08:20', 'الصبح'], sunset: ['18:42', 'الغسق'], night: ['23:10', 'الليل'] };
  weather = createWeather({
    play, scene, camera: stage.camera, time: 'sunset', fontFamily: "'Plex Arabic', system-ui, sans-serif", accent: '#e9853a', line: 'rgba(233, 133, 58, .4)',
    apply(time, rain) {
      if (time === 'night') setTime('night', 62, 26); else setTime(time === 'morning' ? 'grey' : 'dusk');
      if (rain) {
        sun.intensity *= 0.4; hemi.intensity *= 0.8; skyRim.intensity *= 0.4;
        U.uFogParams.value.x *= 2.4; SKY.uCloud.value.x = Math.min(0.95, SKY.uCloud.value.x + 0.35); SKY.uGlowAmt.value *= 0.4;
        U.uFogColor.value.multiplyScalar(0.58); U.uFogSunColor.value.multiplyScalar(0.5); SKY.uZenith.value.multiplyScalar(0.6); SKY.uHorizon.value.multiplyScalar(0.6);
        post.grade.uExposure.value *= 0.9;
      }
      // the air as it is now is what the lake gives back when the head comes out of the water
      air.fog.copy(U.uFogColor.value); air.sun.copy(U.uFogSunColor.value); air.params.copy(U.uFogParams.value); air.misc.copy(U.uFogMisc.value);
      if (under) setUnder(true);
      aimed = null;                                  // the sun moved: fit the shadow map again on the next frame
      const c = CLOCK[time];
      document.querySelector('.clock .c-time').innerHTML = `<span class="num">${c[0]}</span> · ${(rain ? 'مطر · ' : '') + c[1]}`;
    },
  });
  window.__game = { play, panel, terrain, world, B, slots, bag, kit, camera: stage.camera, vitals, life, weather, status };
}

installShotApi(stage);
window.__stats = { worldTris, forestTris: forest.tris, trees: meta.trees.length, ms: Math.round(performance.now() - T0) };
if (Q.has('dev')) {
  window.__dbg = { meta, world, SITE, fromUV, groundAt, stage, camera, scene, actors, nightActors, heroActors, U, SKY, hemi, sun, skyRim, post, setTime, setRim, setSun, fitShadow, useLights, shelter, THREE, light, forest, terrain, materialFor, bakeLight, buildWorldMeshes, playPieces, toUV: (x, z) => [(x - VAL.ox) * VAL.dx + (z - VAL.oz) * VAL.dz, (x - VAL.ox) * VAL.rx + (z - VAL.oz) * VAL.rz] };
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;left:6px;top:6px;margin:0;color:#fff;font:11px monospace;background:#0008;padding:3px;direction:ltr';
  pre.textContent = JSON.stringify(window.__stats);
  document.body.appendChild(pre);
}
if (GAME) { await startGame(); markReady(); }               // awaited: the world picker keeps its loading screen up until the game is drawn
else if (Q.has('fast')) markReady(); else window.__shot('hero').then(markReady);
