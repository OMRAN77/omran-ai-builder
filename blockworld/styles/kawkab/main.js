// "kawkab" — an alien planet being settled. Scene assembly, moods (dusk / night), post and shots.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createVoxelTerrain } from '../../shared/voxel.js';
import { createPlay, createPlayPanel, goImmersive } from '../../shared/play.js';
import { KIT_BLOCKS, KIT_GROUPS, kitMaterial, kitIcon, createKit } from '../../shared/kit.js';
import { createBag } from '../../shared/bag.js';
import { createHeld } from '../../shared/held.js';
import { createVitals, bars } from '../../shared/vitals.js';
import { createLife } from '../../shared/life.js';
import { createStage, defineShot, installShotApi, markReady } from '../../shared/stage.js';
import { B, BLOCKS } from './blocks.js';
import { tileMaterial, setGlow, tileSpan } from './tiles.js';
import { createSky, bakeEnvironment, dirFrom } from './sky.js';
import { generateWorld, SITE, SX, SY, SZ, SEA } from './world.js';
import { makeWater, makeRidges, makeSpores, makeDropship, makeRover, makeMast, makeSolarArray, makeFlood, makeMist, halo, setPropGlow, bake, MAT, put, rbox, strut } from './props.js';
import { makeAstronaut, makeDrone, makePackBeast, makeCrawler, makeWraith, makeSentry, makeMultitool } from './cast.js';
import { buildHud, SLOTS } from './hud.js';

// Game mode: the page is opened to be played (index.html?play, or the launcher sets window.__GAME).
// Without it the page only renders the named shots, as before.
const GAME = window.__GAME || (new URLSearchParams(location.search).has('play') ? {} : null);
const COARSE = window.matchMedia('(pointer: coarse)').matches;

const stage = createStage({ fov: 50, near: 0.1, far: 900, exposure: 1 });
const { scene, camera, renderer } = stage;
scene.add(camera);

// ------------------------------------------------------------------ world
const gen = generateWorld();
const { world, anchors } = gen;
BLOCKS[B.WATER].kind = 'none';                              // the lake surface is one shared plane (see props.js)
// Some tiles are mapped in world space so their pattern runs across blocks (big crystal facets,
// lake-bed veins, lichen patches) instead of repeating on every face.
function worldSpaceUv(mesh) {
  const span = tileSpan(mesh.name.split(':')[0]);
  if (!span) return;
  const pos = mesh.geometry.attributes.position, nrm = mesh.geometry.attributes.normal, uv = mesh.geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (nrm.getY(i) !== 0) uv.setXY(i, x / span[0], z / span[0]);
    else if (nrm.getX(i) !== 0) uv.setXY(i, z / span[0], y / span[1]);
    else uv.setXY(i, x / span[0], y / span[1]);
  }
  uv.needsUpdate = true;
}
Object.assign(BLOCKS, KIT_BLOCKS);                           // the shared building kit (painted blocks, lamps, beds, ...): ids 100 and up
const terrain = createVoxelTerrain(world, BLOCKS, { materialFor: (tile) => kitMaterial(tile) || tileMaterial(tile), aoCurve: [0.42, 0.62, 0.82, 1.0], onMesh: worldSpaceUv });
const voxels = terrain.group, stats = terrain.stats;
scene.add(voxels);
window.__stats = stats;

// pointed tips on the crystal spires: one merged mesh per crystal kind
const tipMeshes = [];
function buildTips() {
  for (const m of tipMeshes.splice(0)) { scene.remove(m); m.geometry.dispose(); }
  for (const [id, tile] of [[B.CRYSTAL_C, 'crystalC'], [B.CRYSTAL_V, 'crystalV']]) {
  const pos = [], nor = [], uvs = [], col = [], span = tileSpan(tile);
  for (const t of anchors.tips) {
    if (t.id !== id || world.get(t.x, t.y - 1, t.z) !== id || world.get(t.x, t.y, t.z) !== 0) continue;
    const ax = t.x + 0.5 + t.lx * t.h * 1.6, az = t.z + 0.5 + t.lz * t.h * 1.6, ay = t.y + t.h;
    const c = [[t.x, t.z], [t.x + 1, t.z], [t.x + 1, t.z + 1], [t.x, t.z + 1]];
    for (let k = 0; k < 4; k++) {
      const [x0, z0] = c[(k + 1) % 4], [x1, z1] = c[k];          // counter-clockwise seen from outside
      const e1 = new THREE.Vector3(x1 - x0, 0, z1 - z0), e2 = new THREE.Vector3(ax - x0, t.h, az - z0);
      const n = e1.cross(e2).normalize();
      for (const [x, y, z] of [[x0, t.y, z0], [x1, t.y, z1], [ax, ay, az]]) {
        pos.push(x, y, z); nor.push(n.x, n.y, n.z); col.push(1, 1, 1);
        uvs.push((Math.abs(n.x) > Math.abs(n.z) ? z : x) / span[0], y / span[1]);
      }
    }
  }
  if (!pos.length) continue;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const tips = new THREE.Mesh(geo, tileMaterial(tile));
  tips.castShadow = true; tips.receiveShadow = true; tips.name = tile + ':tips';
  scene.add(tips);
  tipMeshes.push(tips);
  }
}
buildTips();

// per-block lake depth (0 = dry or a column standing in the water)
const lakeDepth = (() => {
  const L = SITE.lake, w = Math.ceil(L.rx * 3.2) + 2, h = Math.ceil(L.rz * 3.4) + 2, x0 = Math.floor(L.x - w / 2), z0 = Math.floor(L.z - h / 2);
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + i, z = z0 + j;
    let d = 0;
    if (world.get(x, SEA, z) === B.WATER && world.get(x, SEA + 1, z) === 0) { let y = SEA; while (y > 0 && world.get(x, y, z) === B.WATER) y--; d = SEA + 0.88 - (y + 1); }
    data[(j * w + i) * 4] = Math.min(255, d / 4 * 255); data[(j * w + i) * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return { tex, x0: x0 - 0.0, z0: z0 - 0.0, w, h };
})();
const water = makeWater(SITE.lake, SEA + 0.88, lakeDepth);
scene.add(water);
const ridges = makeRidges(SX / 2, SZ / 2);
scene.add(ridges.group);
const spores = makeSpores(2400, (rnd) => {
  const x = 14 + rnd() * 148, z = 14 + rnd() * 148;
  return [x, gen.surfaceY(x, z) + 0.4 + Math.pow(rnd(), 1.6) * 22, z];
});
scene.add(spores);

// ---- outpost hardware
const G0 = anchors.ground;
const place = (obj, x, y, z, ry = 0) => { obj.position.set(x, y, z); obj.rotation.y = ry; scene.add(obj); return obj; };
place(bake(makeDropship()), anchors.padTop.x, anchors.padTop.y, anchors.padTop.z, 2.2);
place(bake(makeRover()), anchors.rover.x, anchors.rover.y, anchors.rover.z, Math.PI + 0.35);
place(bake(makeMast(26)), anchors.mast.x, anchors.mast.y, anchors.mast.z, 0.4);
for (const a of anchors.solar) place(bake(makeSolarArray()), a.x, a.y, a.z, 0.1);
const floods = anchors.floods.map((a) => place(makeFlood(7.5, Math.atan2(a.tx, a.tz), 0.55, 30), a.x, a.y, a.z));
for (const p of anchors.pylons) { const h = halo(0xffa040, 2.6, 0.5); h.position.set(p.x, p.y, p.z); scene.add(h); }
{ // field lantern on the supply crate at the causeway
  const l = new THREE.Group(), c = anchors.camp;
  l.add(put(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 10), MAT.dark, 0, 0.025, 0), put(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 10), MAT.warm, 0, 0.15, 0), put(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 10), MAT.dark, 0, 0.27, 0));
  l.add(strut(-0.09, 0.28, 0, 0, 0.4, 0, 0.01, MAT.dark, 4), strut(0.09, 0.28, 0, 0, 0.4, 0, 0.01, MAT.dark, 4));
  const h = halo(0xffc27a, 2.2, 0.55); h.position.set(0, 0.16, 0); l.add(h);
  l.position.set(c.x + 0.12, c.y, c.z - 0.1); scene.add(bake(l));
}
// soft warm air-glow over the lit buildings (three additive sprites)
for (const [x, z, size] of [[SITE.hab.x, SITE.hab.z - 3, 34], [SITE.garage.x + 2, SITE.garage.z - 3, 22], [SITE.lab.x, SITE.lab.z - 2, 24]]) { const h = halo(0xff9a52, size, 0.3, 'glowAir'); h.position.set(x, G0 + 4, z); scene.add(h); }
{
  const list = [], PL = SITE.plateau;
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2, k = 0.9 + ((i * 7) % 5) * 0.09;
    const x = PL.x + Math.cos(a) * PL.rx * k, z = PL.z + Math.sin(a) * PL.rz * k * 1.15;
    list.push([x, gen.groundY(x, z) + 2.2, z, 22 + (i % 4) * 5, i % 3 ? 0x2c4a66 : 0x385c7a, 0.8]);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, L = SITE.lake;
    list.push([L.x + Math.cos(a) * L.rx * 0.7, SEA + 2.4, L.z + Math.sin(a) * L.rz * 0.7, 26 + (i % 3) * 6, 0x1f5a66, 0.5]);
  }
  scene.add(makeMist(list));
}

// ---- local lights (8 point lights, no shadows)
const pl = (color, intensity, dist, x, y, z, group = 'lamps') => { const l = new THREE.PointLight(color, intensity, dist, 1.8); l.position.set(x, y, z); l.userData = { base: intensity, group, home: [x, y, z, dist, color] }; scene.add(l); return l; };
const lamps = [
  pl(0xffb469, 60, 34, SITE.hab.x - 4, G0 + 3.5, SITE.hab.z - 9.5),
  pl(0xffb469, 50, 30, SITE.lab.x, G0 + 3.5, SITE.lab.z - 7),
  pl(0xffc27a, 70, 34, anchors.padTop.x - 7, G0 + 4, anchors.padTop.z - 2),
  pl(0xffb469, 50, 30, SITE.garage.x, G0 + 3, SITE.garage.z - 6),
  pl(0xffc98a, 40, 26, SITE.jetty.x + 0.5, SEA + 6, SITE.jetty.z - 8.5),
  pl(0xff6ad0, 30, 22, SITE.green.x, G0 + 3.5, SITE.green.z - 5.5),
  ...[0, 1].map((i) => { const f = anchors.floods[i], k = 15 / Math.hypot(f.tx, f.tz); return pl(0xffe2b8, 0, 46, f.x + f.tx * k, f.y + 1.5, f.z + f.tz * k, 'floods'); }),
];
/** Borrow one of the eight lights for a shot (it goes back home on the next setMood). */
function borrowLamp(i, color, intensity, dist, x, y, z) { const l = lamps[i]; l.color.set(color); l.intensity = intensity; l.distance = dist; l.position.set(x, y, z); }

// ---- cast
const actors = {
  player: bake(makeAstronaut()), drone: bake(makeDrone()), beast: bake(makePackBeast()), sentry: bake(makeSentry()),
  crawlers: [0, 1, 2].map(() => bake(makeCrawler())), wraiths: [0, 1, 2].map(() => bake(makeWraith())),
};
const allActors = [actors.player, actors.drone, actors.beast, actors.sentry, ...actors.crawlers, ...actors.wraiths];
for (const a of allActors) { a.visible = false; scene.add(a); }
function cast(list) {
  for (const a of allActors) a.visible = false;
  for (const [obj, x, y, z, ry = 0, rx = 0, rz = 0] of list) { obj.visible = true; obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); }
}

// ---- first-person rig (held multitool + glove), parented to the camera
const fp = new THREE.Group();
{
  const tool = makeMultitool(true);
  tool.rotation.set(0, Math.PI, 0);
  fp.add(tool);
  const arm = new THREE.Group();
  arm.position.set(0.012, -0.2, 0.16); arm.rotation.set(-0.95, 0, -0.1);
  const glove = new THREE.MeshStandardMaterial({ color: 0x3d434f, roughness: 0.78, metalness: 0.05 });
  arm.add(put(rbox(0.09, 0.11, 0.1, 0.03, 3), glove, 0, 0.06, 0));                 // glove wrapped on the grip
  arm.add(put(rbox(0.1, 0.06, 0.11, 0.025, 3), glove, 0, 0.0, 0.01));
  for (let i = 0; i < 4; i++) arm.add(put(rbox(0.1, 0.024, 0.05, 0.011, 2), glove, 0.004, 0.105 - i * 0.027, 0.055));   // fingers
  arm.add(put(rbox(0.085, 0.07, 0.02, 0.008, 2), MAT.grey, 0, 0.065, -0.058));     // knuckle plate
  arm.add(put(rbox(0.125, 0.12, 0.135, 0.035, 3), MAT.graphite, 0, -0.1, 0.0));    // gauntlet
  arm.add(put(rbox(0.13, 0.03, 0.14, 0.01, 2), MAT.orange, 0, -0.06, 0.0));
  arm.add(put(rbox(0.11, 0.5, 0.12, 0.045, 3), MAT.white, 0, -0.4, 0.0));
  arm.add(put(rbox(0.012, 0.07, 0.07, 0.004, 1), MAT.cyan, -0.066, -0.1, 0.0));
  fp.add(arm);
  fp.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
}
fp.visible = false;
camera.add(fp);

// block highlight for the play shot: twelve thin bars so it keeps its weight at any pixel ratio
const pickBox = new THREE.Group();
{
  const m = new THREE.MeshBasicMaterial({ color: 0xe4fdff, fog: false, transparent: true, opacity: 0.95 });
  const t = 0.022, L = 1.03, h = L / 2;
  for (const [ax, a, b] of [[0, 1, 2], [1, 0, 2], [2, 0, 1]]) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const size = [t, t, t]; size[ax] = L + t;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), m);
    const p = [0, 0, 0]; p[a] = sa * h; p[b] = sb * h;
    bar.position.set(p[0], p[1], p[2]);
    pickBox.add(bar);
  }
}
pickBox.visible = false;
scene.add(pickBox);

// mining beam for the play shot: a thin additive shaft from the emitter to the block, plus a hot spot
const laser = new THREE.Group();
{
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xd8fbff, fog: false }));
  const glowM = new THREE.MeshBasicMaterial({ color: 0x38d8ff, fog: false, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 8, 1, true), glowM);
  const hit = halo(0x8ff4ff, 0.75, 0.95, 'laser'), hit2 = halo(0xffffff, 0.22, 1, 'laser'), muzzle = halo(0x8ff4ff, 0.16, 0.9, 'laser');
  laser.add(core, sheath, hit, hit2, muzzle);
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  laser.userData.set = (a, b) => {
    d.subVectors(b, a); const len = d.length();
    for (const m of [core, sheath]) { m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(up, d.clone().normalize()); }
    hit.position.copy(b); hit2.position.copy(b); muzzle.position.copy(a);
  };
}
laser.visible = false;
scene.add(laser);

// ------------------------------------------------------------------ sky + lights
const sky = createSky();
scene.add(sky.mesh);
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
scene.fog = new THREE.Fog(0x000000, 50, 300);

function aimSun(dir, cx, cy, cz, half, depth = 420) {
  sun.position.set(cx + dir.x * depth * 0.5, cy + dir.y * depth * 0.5, cz + dir.z * depth * 0.5);
  sun.target.position.set(cx, cy, cz);
  const c = sun.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = depth;
  c.updateProjectionMatrix();
  sun.shadow.normalBias = Math.max(0.03, (half * 2 / sun.shadow.mapSize.x) * 4.5);
}

// ------------------------------------------------------------------ post
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: GAME && COARSE ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.6, 0.6, 0.9);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.35 }, uSat: { value: 1.05 }, uLift: { value: new THREE.Color(0, 0, 0) }, uGain: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uSat; uniform vec3 uLift, uGain; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 q = (vUv - 0.5) * vec2(1.0, 0.82);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat) * uGain + uLift * (1.0 - smoothstep(0.0, 0.5, l));
      c.rgb *= mix(1.0 - uVig, 1.0, smoothstep(0.78, 0.22, length(q)));
      gl_FragColor = c; }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());
stage.onResize = (w, h, pr) => { composer.setPixelRatio(pr); composer.setSize(w, h); };
renderer.info.autoReset = false;

// ------------------------------------------------------------------ name tags + HUD
const hud = buildHud(document.getElementById('hud'));
const tagsEl = document.getElementById('tags');
let tags = [];
function setTags(defs) {
  tagsEl.textContent = '';
  tags = defs.map((d) => {
    const el = document.createElement('div');
    el.className = 'tag ' + d.kind;
    const box = document.createElement('div'); box.className = 'tb';
    const name = document.createElement('b'); name.textContent = d.name;
    const role = document.createElement('i'); role.textContent = d.role;
    box.append(name, role);
    const ln = document.createElement('div'); ln.className = 'ln';
    el.append(box, ln);
    tagsEl.appendChild(el);
    return { el, obj: d.obj, h: d.h, dx: d.dx || 0 };
  });
}
const _v = new THREE.Vector3();
function updateTags() {
  if (!tags.length) return;
  camera.updateMatrixWorld();
  for (const t of tags) {
    _v.copy(t.obj.position); _v.y += t.h; _v.x += t.dx;
    _v.project(camera);
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth, y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    t.el.style.visibility = _v.z < 1 ? 'visible' : 'hidden';
  }
}
stage.render = () => {
  renderer.info.reset();
  const u = spores.material.uniforms;
  u.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  u.uMax.value = renderer.domElement.height * 0.03;
  updateTags();
  composer.render();
  if (stage.live) return;                                    // the running game never waits for the GPU
  // Block until the GPU has really finished, so a screenshot taken right after a shot is complete.
  const gl = renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px);
};
const _px = new Uint8Array(4);
stage.resize();

// ------------------------------------------------------------------ moods
const envCache = {};
const MOODS = {
  dusk: {
    sky: { zenith: '#0a4450', mid: '#31508c', horizon: '#c24a86', glow: '#ff8f66', below: '#15111f', cloud: '#7a3f78' },
    stars: 0.55, glowAmt: 1.0, planetGain: 0.82, cloud: 0.55,
    sunDirSky: dirFrom(44, -3), planet: dirFrom(10, 10.8), planetR: 0.098, moon: dirFrom(52, 15), moonR: 0.014,
    fog: '#8a4274', fogNear: 45, fogFar: 300,
    hemiSky: '#9a84da', hemiGround: '#2a4c5c', hemi: 2.1,
    sun: '#bfe4ff', sunI: 2.2, sunDir: dirFrom(-8, 30),
    env: 1.0, exposure: 1.0, bloom: [0.5, 0.6, 0.95], vig: 0.4, sat: 1.02,
    glow: { flora: 1.0, moss: 1.0, ore: 1.0, lake: 1.0, tech: 1.0, hostile: 1.0, visor: 1.0 }, ridge: '#2a2244',
    fx: { halo: 0.5, beam: 0.05, spores: 0.6, lamps: 1.25, floodLight: 0, mist: 0.35, glowAir: 1 },
  },
  night: {
    sky: { zenith: '#030711', mid: '#0b1736', horizon: '#1a3a52', glow: '#1f6a70', below: '#04070c', cloud: '#101c30' },
    stars: 1.3, glowAmt: 0.5, planetGain: 0.42, cloud: 0.3,
    sunDirSky: dirFrom(44, -30), planet: dirFrom(10, 10.8), planetR: 0.098, moon: dirFrom(52, 15), moonR: 0.014,
    fog: '#0a1b30', fogNear: 20, fogFar: 200,
    hemiSky: '#2a4486', hemiGround: '#0a1c26', hemi: 0.9,
    sun: '#8fb4ff', sunI: 1.0, sunDir: dirFrom(-8, 34),
    env: 0.35, exposure: 1.0, bloom: [0.55, 0.6, 0.92], vig: 0.5, sat: 1.04,
    glow: { flora: 1.5, moss: 1.2, ore: 1.9, lake: 1.5, tech: 0.88, hostile: 1.3, visor: 1.0 }, ridge: '#070b16',
    fx: { halo: 0.7, beam: 0.62, spores: 1.1, lamps: 0.7, floodLight: 120, mist: 0.36, glowAir: 0.32 },
  },
};
let mood = null, skyAt = null;
function setMood(name, over = {}) {
  const m = { ...MOODS[name], ...over };
  mood = m;
  const u = sky.uniforms;
  u.uZenith.value.set(m.sky.zenith); u.uMid.value.set(m.sky.mid); u.uHorizon.value.set(m.sky.horizon);
  u.uGlow.value.set(m.sky.glow); u.uBelow.value.set(m.sky.below); u.uCloudCol.value.set(m.sky.cloud);
  u.uStars.value = m.stars; u.uGlowAmt.value = m.glowAmt; u.uPlanetGain.value = m.planetGain; u.uCloud.value = m.cloud;
  u.uSunDir.value.copy(m.sunDirSky); u.uPlanetDir.value.copy(m.planet); u.uPlanetR.value = m.planetR;
  u.uMoonDir.value.copy(m.moon); u.uMoonR.value = m.moonR;
  u.uPlanetLight.value.set(0.8, -0.42, 0).addScaledVector(m.planet, -0.3).normalize();
  scene.fog.color.set(m.fog); scene.fog.near = m.fogNear; scene.fog.far = m.fogFar;
  hemi.color.set(m.hemiSky); hemi.groundColor.set(m.hemiGround); hemi.intensity = m.hemi;
  sun.color.set(m.sun); sun.intensity = m.sunI;
  if (!envCache[name]) envCache[name] = bakeEnvironment(renderer, sky);
  scene.environment = envCache[name];
  scene.environmentIntensity = m.env;
  renderer.toneMappingExposure = m.exposure;
  bloom.strength = m.bloom[0]; bloom.radius = m.bloom[1]; bloom.threshold = m.bloom[2];
  grade.uniforms.uVig.value = m.vig; grade.uniforms.uSat.value = m.sat;
  setGlow(m.glow);
  setPropGlow({ ...m.glow, ...m.fx });
  for (const l of lamps) {
    const h = l.userData.home;
    l.position.set(h[0], h[1], h[2]); l.distance = h[3]; l.color.set(h[4]);
    l.intensity = l.userData.base * (m.fx[l.userData.group] ?? 1) + (l.userData.group === 'floods' ? m.fx.floodLight : 0);
  }
  const sunAz = Math.atan2(m.sunDirSky.x, m.sunDirSky.z);
  const hz = new THREE.Color(m.sky.horizon), gl = new THREE.Color(m.sky.glow), tmp = new THREE.Color();
  skyAt = (az) => { const a = Math.max(0, Math.cos(az - sunAz)); const k = (Math.pow(a, 5) + 0.35 * a * a) * m.glowAmt; return tmp.setRGB(hz.r + gl.r * k, hz.g + gl.g * k, hz.b + gl.b * k); };
  ridges.tint(skyAt, new THREE.Color(m.ridge));
  spores.material.uniforms.uFog.value.set(m.fogNear, m.fogFar * 0.8);
  water.userData.setFog(m.fog, m.fogNear, m.fogFar);
}

function look(px, py, pz, tx, ty, tz, fov = 50) {
  camera.fov = fov; camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
const solidAt = (x, y, z) => { const id = world.get(Math.floor(x), Math.floor(y), Math.floor(z)); return id && (BLOCKS[id].kind ?? 'solid') === 'solid'; };
/** Feet height for a figure standing in column (x, z), starting the search near y. */
function standY(x, z, near) { let y = Math.floor(near); while (solidAt(x, y, z)) y++; while (y > 1 && !solidAt(x, y - 1, z)) y--; return y; }
function common({ hudOn = false, fpOn = false } = {}) {
  hud.show(hudOn); fp.visible = fpOn; pickBox.visible = false; laser.visible = false; setTags([]);
  for (const f of floods) f.userData.reset();
}

// ------------------------------------------------------------------ shots
const shot = defineShot;
shot('hero', () => {
  common();
  setMood('dusk', { sunDir: dirFrom(-42, 26), sunI: 2.3 });      // three-quarter back light: rims plus some modelling on the slopes
  aimSun(mood.sunDir, 92, 24, 86, 95);
  look(57, 32, 38, 100, 27, 112, 44);
  // the engineer on the tip of the causeway, looking across the lake at the outpost
  const gx = 65.5, gz = 60.5, gy = standY(gx, gz, 24), ry = Math.atan2(SITE.hab.x - gx, SITE.hab.z - gz);
  cast([
    [actors.player, gx, gy, gz, ry + 0.15], [actors.drone, gx + 1.0, gy + 2.05, gz + 0.9, ry - 0.4, 0.08, 0],
    [actors.beast, 73.5, standY(73.5, 96.5, 21), 96.5, 2.3],
  ]);
  borrowLamp(6, 0xffb469, 9, 9, anchors.camp.x + 0.12, anchors.camp.y + 0.45, anchors.camp.z - 0.1);    // the field lantern at the engineer's kit
});

shot('night', () => {
  common();
  setMood('night');
  // From the lake shore outside the perimeter: the floodlights rake down the slope from the right,
  // the lake and its stinger glow on the dark side.
  const cam = new THREE.Vector3(66, 22.4, 92.5), tgt = new THREE.Vector3(92, 27.4, 101.5);
  aimSun(mood.sunDir, 80, 24, 98, 44);
  look(cam.x, cam.y, cam.z, tgt.x, tgt.y, tgt.z, 56);
  const f = new THREE.Vector3(tgt.x - cam.x, 0, tgt.z - cam.z).normalize(), r = new THREE.Vector3(-f.z, 0, f.x);
  const yawToCam = Math.atan2(-f.x, -f.z);
  /** A spot d metres ahead of the camera and s metres to its right. */
  const at = (d, s) => [cam.x + f.x * d + r.x * s, cam.z + f.z * d + r.z * s];
  const on = (o, d, s, turn = 0, up = 0, near = 22) => { const [x, z] = at(d, s); return [o, x, standY(x, z, near) + up, z, yawToCam + turn]; };
  const fly = (o, d, s, y, turn = 0) => { const [x, z] = at(d, s); return [o, x, y, z, yawToCam + turn]; };
  cast([
    fly(actors.wraiths[0], 6.6, -2.5, 22.75, 0.35), fly(actors.wraiths[1], 27, -15, 26.8, -0.3), fly(actors.wraiths[2], 30, 6, 29.5, 0.2),
    on(actors.crawlers[0], 5.4, 0.9, 0.7), on(actors.crawlers[1], 13.5, -3.9, -0.3),
    on(actors.sentry, 12.5, 7.4, 0.3, 0, 24),
  ]);
  // floodlight pools: one on the sand ahead, one further along the shore
  const pool = [[...at(12.2, 0.5)], [101, 93]];
  pool.forEach(([x, z], i) => {
    const y = standY(x, z, 22), h = floods[i].userData.aimAt(x, y, z, i ? 0.3 : 0.26);
    floods[i].userData.shaft(i ? 1.2 : 2.4);
    const k = 0.62;
    borrowLamp(6 + i, 0xffe2b8, i ? 60 : 85, 34, h.x + (x - h.x) * k, h.y + (y - h.y) * k, h.z + (z - h.z) * k);
  });
  { const [x, z] = at(6.6, -2.5); borrowLamp(5, 0xd070ff, 16, 12, x, 23.6, z); }
});

shot('cast', () => {
  common();
  const S = { x: SITE.cast.x, z: SITE.cast.z - 4.5 };
  const g0 = standY(S.x, S.z, SITE.cast.y);
  const gy = (dx, dz) => standY(S.x + dx, S.z + dz, g0);
  setMood('dusk', { sun: '#ffcfa6', sunDir: dirFrom(34, 21), sunI: 3.3, hemi: 1.35, exposure: 1.08, fog: '#232a57', fogNear: 13, fogFar: 108 });
  aimSun(mood.sunDir, S.x, g0, S.z, 16, 200);
  look(S.x - 0.32, g0 + 1.42, S.z + 9.9, S.x - 0.27, g0 + 2.12, S.z, 34);
  const at = (o, dx, dz, ry, up = 0) => [o, S.x + dx, gy(dx, dz) + up, S.z + dz, ry];
  cast([
    at(actors.beast, 3.55, -1.0, -0.92), at(actors.player, 1.1, 1.0, -0.12), at(actors.drone, 2.25, 0.3, -0.3, 2.12),
    at(actors.sentry, -0.8, -1.3, 0.3), at(actors.crawlers[0], -3.0, 1.45, 0.72), at(actors.wraiths[0], -4.0, -1.7, 0.3, 0.5),
  ]);
  borrowLamp(4, 0xffd9a0, 3.5, 7, S.x + 3.55 + 1.1, g0 + 1.45, S.z - 1.0 + 1.0);
  borrowLamp(0, 0xff4fa0, 16, 10, S.x - 3.7, g0 + 2.0, S.z - 3.0);          // rim on the hostiles
  borrowLamp(1, 0x49e8ff, 16, 10, S.x + 2.9, g0 + 2.8, S.z - 3.1);          // rim on the friendlies
  setTags([
    { obj: actors.player, h: 2.02, name: 'المهندس', role: 'أنت', kind: 'ally' },
    { obj: actors.drone, h: 0.62, name: 'المسّاح', role: 'رفيقك الآلي', kind: 'ally', dx: 0.25 },
    { obj: actors.beast, h: 2.05, name: 'الحمّال', role: 'دابّة أليفة', kind: 'ally' },
    { obj: actors.sentry, h: 2.72, name: 'الحارس المعطوب', role: 'آلة متمرّدة', kind: 'foe' },
    { obj: actors.crawlers[0], h: 1.52, name: 'الزاحف', role: 'مفترس', kind: 'foe', dx: 0.95 },
    { obj: actors.wraiths[0], h: 2.9, name: 'الطيف', role: 'لاسع طافٍ', kind: 'foe' },
  ]);
});

shot('play', () => {
  common({ hudOn: true, fpOn: true });
  setMood('dusk');
  const px = 62.0, pz = 60.5, py = standY(62.5, pz, 24) + 1.62;
  const tx = 64, tz = 64, ty = standY(tx + 0.5, tz + 0.5, 23) - 1;          // the flat-topped block of the sky-crystal outcrop
  aimSun(mood.sunDir, px + 14, py, pz + 30, 70);
  look(px, py, pz, tx + 0.5, ty + 0.62, tz + 0.5, 70);
  pickBox.position.set(tx + 0.5, ty + 0.5, tz + 0.5); pickBox.visible = true;
  fp.position.set(0.34, -0.25, -0.66); fp.rotation.set(0.16, 0.24, 0.06);
  const f = new THREE.Vector3(tx + 0.5 - px, 0, tz + 0.5 - pz).normalize(), r = new THREE.Vector3(-f.z, 0, f.x);
  cast([[actors.drone, px + f.x * 5.2 + r.x * -3.1, py + 0.35, pz + f.z * 5.2 + r.z * -3.1, Math.atan2(f.x, f.z) + 0.9, 0.05, 0]]);
  // mining beam from the emitter to the face of the block
  camera.updateMatrixWorld(true);
  const a = fp.localToWorld(new THREE.Vector3(0, 0, -0.262)), cdir = new THREE.Vector3(tx + 0.5 - px, ty + 0.62 - py, tz + 0.5 - pz).normalize();
  let t = 0; while (t < 8 && !solidAt(px + cdir.x * t, py + cdir.y * t, pz + cdir.z * t)) t += 0.01;
  laser.userData.set(a, new THREE.Vector3(px + cdir.x * (t - 0.02), py + cdir.y * (t - 0.02), pz + cdir.z * (t - 0.02)));
  laser.visible = true;
});

// ------------------------------------------------------------------ the playable game
const NAMES = {
  [B.LICHEN_A]: 'أشنة', [B.LICHEN_B]: 'أشنة', [B.LICHEN_G]: 'أشنة متوهّجة', [B.SOIL]: 'تربة', [B.SLATE]: 'أردواز', [B.ORE]: 'خام متوهّج', [B.ORE_V]: 'خام بنفسجي',
  [B.BASALT]: 'بازلت', [B.SHORE]: 'رمل الشاطئ', [B.LAKEBED]: 'قاع البحيرة', [B.CRYSTAL_C]: 'بلّور سماوي', [B.CRYSTAL_V]: 'بلّور بنفسجي', [B.STALK]: 'ساق فطر',
  [B.CAP]: 'قبعة فطر', [B.CAP_RIM]: 'قبعة فطر', [B.BARK]: 'لحاء', [B.TENDRIL]: 'محلاق', [B.FERN]: 'سرخس', [B.BULB]: 'بصيلة مضيئة', [B.REED]: 'قصب', [B.FRINGE]: 'هدب',
  [B.HULL_W]: 'لوح هيكل', [B.HULL_W2]: 'لوح هيكل', [B.HULL_S]: 'لوح هيكل', [B.HULL_G]: 'لوح هيكل داكن', [B.HAZARD]: 'لوح تحذير', [B.WINDOW]: 'نافذة', [B.PAD]: 'منصّة هبوط',
  [B.SOLAR]: 'لوح شمسي', [B.LAMP]: 'مصباح', [B.GLASS]: 'زجاج', [B.BEAM]: 'عارضة', [B.CARGO]: 'صندوق شحن', [B.GROW]: 'ضوء زراعة', [B.AMBER]: 'لوح إضاءة', [B.CYAN]: 'لوح إضاءة',
};
const SLOT_ID = { hull: B.HULL_W, basalt: B.BASALT, soil: B.SOIL, crystal: B.CRYSTAL_C, ore: B.ORE, lamp: B.LAMP, cap: B.CAP };
/** What digging a block puts in the bag (the hotbar has one slot per family). */
const DROP = {
  [B.LICHEN_A]: B.SOIL, [B.LICHEN_B]: B.SOIL, [B.LICHEN_G]: B.SOIL, [B.SOIL]: B.SOIL, [B.SHORE]: B.SOIL, [B.LAKEBED]: B.SOIL,
  [B.SLATE]: B.BASALT, [B.BASALT]: B.BASALT, [B.BARK]: B.BASALT,
  [B.ORE]: B.ORE, [B.ORE_V]: B.ORE, [B.CRYSTAL_C]: B.CRYSTAL_C, [B.CRYSTAL_V]: B.CRYSTAL_C,
  [B.STALK]: B.CAP, [B.CAP]: B.CAP, [B.CAP_RIM]: B.CAP,
  [B.HULL_W]: B.HULL_W, [B.HULL_W2]: B.HULL_W, [B.HULL_S]: B.HULL_W, [B.HULL_G]: B.HULL_W, [B.HAZARD]: B.HULL_W, [B.PAD]: B.HULL_W, [B.BEAM]: B.HULL_W, [B.CARGO]: B.HULL_W, [B.SOLAR]: B.HULL_W,
  [B.LAMP]: B.LAMP, [B.AMBER]: B.LAMP, [B.CYAN]: B.LAMP, [B.GROW]: B.LAMP,
};
const SOFT = new Set([B.LICHEN_A, B.LICHEN_B, B.LICHEN_G, B.SOIL, B.SHORE, B.LAKEBED, B.CAP, B.CAP_RIM, B.STALK]);
const HARD = new Set([B.CRYSTAL_C, B.CRYSTAL_V, B.ORE, B.ORE_V, B.HULL_W, B.HULL_W2, B.HULL_S, B.HULL_G, B.HAZARD, B.PAD, B.BEAM]);
const GOAL = 12;

async function startGame() {
  await window.__shot('play');                       // dusk light, HUD and the held tool, standing at the crystal outcrop
  stage.live = true;
  laser.visible = false;
  const eu = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  const slots = SLOTS.map((q) => ({ ...q, id: SLOT_ID[q.key] ?? 0 })).slice(0, hud.shown);
  const kit = createKit({ scene, world, terrain });
  const heldBlock = createHeld({ camera, blocks: BLOCKS, materialFor: (tile) => kitMaterial(tile) || tileMaterial(tile) });
  let toolInHand = true;
  const fpHome = fp.position.clone(), drone = actors.drone, v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const isCrystal = (id) => id === B.CRYSTAL_C || id === B.CRYSTAL_V;
  let aimed = null, hintTimer = 0;

  let life = null;
  let vitals = null;                                 // made once the HUD is up; the first frames run without it
  const play = createPlay({
    camera, canvas: stage.canvas, world, blocks: BLOCKS, terrain,
    spawn: { x: camera.position.x, y: camera.position.y - 1.62, z: camera.position.z, yaw: eu.y, pitch: eu.x },
    slots, touch: hud.touch ? hud.els : null, maxPixelRatio: 2,
    isLiquid: (id) => id === B.WATER || kit.isLiquid(id), heightOf: kit.heightOf,
    hardness: (id) => kit.hardness(id) ?? ((BLOCKS[id].kind === 'cross') ? 0.08 : SOFT.has(id) ? 0.3 : HARD.has(id) ? 0.7 : 0.45),
    dropOf: (id) => DROP[id] || kit.dropOf(id),
    onTarget(h) { pickBox.visible = !!h; if (h) pickBox.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5); hud.setTarget(h ? NAMES[h.id] || kit.nameOf(h.id) || 'مكعب' : null); },
    onBreak(h) { kit.broke(h); if (isCrystal(h.id)) buildTips(); },
    onPlace(x, y, z, id) { kit.placed(x, y, z, id, play.state.yaw); if (isCrystal(id) || isCrystal(world.get(x, y - 1, z))) buildTips(); },
    onInventory(list, sel) {
      hud.setSlots(list, sel); showGoal(list);
      const it = list[sel], block = it && it.id && (!it.tool || it.weapon) && (BLOCKS[it.id] || it.weapon) ? it.id : 0;   // a block, or the sword, is what the hand shows
      heldBlock.show(block); toolInHand = !block; fp.visible = toolInHand;
    },
    onBag() { bag.toggle(); },
    onUse: (item) => (life ? life.use(item) : false),
    onFly(on) { play.notice(on ? (hud.touch ? 'الطيران شغّال. زر القفز يطلّعك، وادفع العصا تطير وين ما تطالع. القفز مرّتين يوقفه.' : 'الطيران شغّال. المسافة تطلّعك وShift ينزّلك. المسافة مرّتين توقفه.') : 'وقف الطيران.', false, on ? 4500 : 1800); },
    onUnlock() { play.stop(); panel.show('pause'); },
    onFirstLook() { hud.els.lookzone.hidden = true; },
    onFrame(st, dt) {
      const d = st.dig, p = st.pos;
      hud.setProgress(d.on ? d.progress : 0);
      kit.update(p, dt, st.time);
      if (vitals) vitals.update(dt);
      if (life) life.update(dt);
      // the mining beam, from the emitter to the point where the view ray meets the block
      if (d.on && st.hit && toolInHand) {
        const h = st.hit, a = fp.localToWorld(v1.set(0, 0, -0.262));
        v2.set(h.px, h.py, h.pz).sub(camera.position).multiplyScalar(1 - 0.03 / Math.max(0.2, h.t)).add(camera.position);
        laser.userData.set(a, v2); laser.visible = true;
      } else laser.visible = false;
      // the held tool sways a little with each step
      const bob = st.onGround ? Math.min(1, st.moving / 4) : 0;
      fp.position.set(fpHome.x + Math.sin(st.time * 4.6) * 0.008 * bob, fpHome.y + Math.abs(Math.sin(st.time * 9.2)) * 0.012 * bob, fpHome.z);
      // the survey drone keeps station ahead and to the left
      const sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);
      v1.set(p.x - sin * 4.6 - cos * 2.8, p.y + 2.25 + Math.sin(st.time * 1.7) * 0.14, p.z - cos * 4.6 + sin * 2.8);
      drone.position.lerp(v1, 1 - Math.exp(-2.2 * dt));
      drone.rotation.set(0.05, Math.atan2(p.x - drone.position.x, p.z - drone.position.z), 0);
      // compass + distance to the habitat
      hud.setNav(-st.yaw * 180 / Math.PI, Math.atan2(SITE.hab.x - p.x, -(SITE.hab.z - p.z)) * 180 / Math.PI, Math.hypot(SITE.hab.x - p.x, SITE.hab.z - p.z));
      // keep the shadow map centred near the player
      if (!aimed || Math.hypot(p.x - aimed.x, p.z - aimed.z) > 14) { aimed = { x: Math.round(p.x / 4) * 4, z: Math.round(p.z / 4) * 4 }; aimSun(mood.sunDir, aimed.x, p.y, aimed.z, 60); }
      if (hud.touch && hintTimer >= 0 && (hintTimer += dt) > 7) { hud.els.lookzone.hidden = true; hintTimer = -1; }
    },
    stage, render: () => stage.render(),
    setPixelRatio: (pr) => { stage.pixelRatio = pr; stage.resize(); },
  });
  /** The crystal count of the goal is whatever the hotbar holds now (the player may have moved things around). */
  function showGoal(list) { const c = list.find((q) => q.id === B.CRYSTAL_C); if (c) hud.setGoal(Math.min(GOAL, c.n), GOAL); }
  const bag = createBag({
    play, shown: hud.shown,
    groups: [{ title: 'عدّة كوكب', items: SLOTS.map((q) => ({ ...q, id: SLOT_ID[q.key] ?? 0 })) }, ...KIT_GROUPS],
    iconOf: (it) => (it.kit ? kitIcon(it.id) : hud.icon(it.icon)),
    fontFamily: "'Plex Arabic', sans-serif", accent: '#7df1ff', line: 'rgba(125, 241, 255, .4)',
  });
  hud.els.bag.addEventListener('pointerdown', (e) => { if (play.state.running) { bag.toggle(); e.preventDefault(); } });
  hud.setSlots(slots, 0);
  showGoal(slots);
  hud.setTarget(null);
  pickBox.visible = false;
  hud.els.hotbar.addEventListener('pointerdown', (e) => { const el = e.target.closest('.slot'); if (el && play.state.running) { play.select(+el.dataset.i); e.preventDefault(); } });
  const panel = createPlayPanel({
    title: 'كوكب', tagline: 'احفر، اجمع البلّور، وابنِ قاعدتك على كوكب غريب.',
    fontFamily: "'Plex Arabic', sans-serif", accent: '#7df1ff', line: 'rgba(125, 241, 255, .4)', touch: hud.touch,
    note: 'نسخة تجريبية: الحيوانات والوحوش تتحرك الحين، والصيد يعطي لحم. الوقت ثابت، والتقدّم ما ينحفظ.',
    onStart() { if (hud.touch) goImmersive(); else play.lock(); play.start(); },
  });
  panel.show('start');
  // health, oxygen and suit power are real: oxygen runs down away from the habitat and refills near it,
  // power is spent by the drill and by flying and recovers at rest
  const vq = (sel) => document.querySelector('#hud .vit.' + sel);
  const write = { hp: bars.width(vq('hp .bar i'), vq('hp .num')), o2: bars.width(vq('o2 .bar i'), vq('o2 .num'), '%'), pw: bars.width(vq('pw .bar i'), vq('pw .num'), '%') };
  vitals = createVitals({
    play, kit, world, hp: 86,
    needs: [
      { key: 'o2', start: 72, drain: 0.3, how: 'home', home: { x: SITE.hab.x, z: SITE.hab.z }, range: 18, gain: 12, low: 'الأكسجين قليل. ارجع صوب القاعدة يتعبّى.' },
      { key: 'pw', start: 34, how: 'rest', gain: 1.6, hurts: false, use: (s) => (s.dig.on && toolInHand ? 3 : 0) + (s.flying ? 2.2 : 0), low: 'طاقة البدلة قليلة. وقّف الحفر والطيران شوي.', onEmpty: (s) => { if (s.flying) play.setFlying(false); } },
    ],
    render(v) { write.hp(v.hp); write.o2(v.o2); write.pw(v.pw); vq('pw').classList.toggle('warn', v.pw < 40); vq('o2').classList.toggle('warn', v.o2 < 25); },
  });
  // creatures: the pack beast grazes and can be hunted; crawlers and stingers come for the player
  life = createLife({
    scene, camera, play, world, vitals: () => vitals,
    kinds: [
      { key: 'beast', name: 'الحمّال', kind: 'animal', make: () => bake(makePackBeast()), hp: 14, speed: 1.5, radius: 0.95, height: 1.7, max: 3, meat: 2 },
      { key: 'crawler', name: 'الزاحف', kind: 'monster', make: () => bake(makeCrawler()), hp: 16, speed: 3.0, radius: 0.95, height: 1.0, max: 2, dmg: 9 },
      { key: 'stinger', name: 'الطيف', kind: 'monster', make: () => bake(makeWraith()), hp: 10, speed: 2.3, radius: 0.8, height: 2.0, max: 1, dmg: 7, fly: 1.6 },
    ],
  });
  window.__play = play;
  window.__game = { play, panel, terrain, world, B, slots, bag, kit, camera, vitals, life };
}

installShotApi(stage);
await Promise.all(["500 14px 'Plex Arabic'", "700 14px 'Plex Arabic'", "400 14px 'Plex Arabic'", '500 14px Rajdhani', '700 14px Rajdhani']
  .map((f) => document.fonts.load(f, f.includes('Plex') ? 'كوكب' : '0123').catch(() => null)));     // a font that cannot be fetched must not stop the game
if (GAME) await startGame(); else await window.__shot('hero');
markReady();
