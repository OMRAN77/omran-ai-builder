// The four wonders of the desert (the owner's ideas for «واحة»), all found by playing, none told in advance:
//
//   سراب البوابات   at sunset a mirage shimmers on the open sand ahead; walk into it and the sand opens on steps down
//                    to a hidden room with a chest. When the sun is gone (night, or day again) the mirage is gone and
//                    the way down is sanded over.
//   أبراج الرياح    clay towers with turning sails draw water from under the sand: round each one the sand turns into
//                    a garden, with water channels, soil, grass and tilled plots, and seeds planted there grow faster.
//                    There is one near the camp, ruined ones by some oases, and the player builds one: three mud
//                    bricks one on another and a palm log on top.
//   الجمال السحابية  a soft camel made of cloud wanders the open desert by day. Fed dates it stays with the player,
//                    carries 27 places of things, and, asked with the mattock, digs beside the player.
//   مزولة الشمس     a great sundial on the fort's north-east tower, and four bronze mirrors in the courtyard. Turned
//                    (the place button) to face the dial while the sun is up, each throws a beam of light onto it;
//                    when all four do, the sun vault under the courtyard opens on its treasure.
//
// Blocks go into the world through the controller (play.put, and a dig the shared game hears of), so they are saved
// and seen by everyone in a shared game. The mirage, the sails, the beams and the camel are drawn here.
//
//   createWonders(ctx)      (game.js, once the bag exists). Coordinates: the grid (the controller's) unless named "w".
import * as THREE from 'three';
import { K, kitItem } from '../../shared/kit.js';
import { EMPTY } from '../../shared/play.js';
import { mulberry32 } from '../../shared/noise.js';
import { B, SY, GROUND, WATER_Y, FORT, WIND, OXC, OZC, isMirror, homeDist } from './world.js';
import { ATM, ATMO_PARS, patchMaterial } from './atmo.js';
import { buildPalms, buildLantern } from './props.js';
import { saduTexture, PAL } from './tiles.js';

const lambert = (o, flags = {}) => patchMaterial(new THREE.MeshLambertMaterial(o), flags);
const lin = (c, k = 1) => new THREE.Color().setRGB(c[0] * k, c[1] * k, c[2] * k, THREE.SRGBColorSpace);
const SOFTTOP = new Set([B.SAND, B.PACKED, B.HARDPAN, B.SALT, B.GRAVEL]);
const GARDEN = new Set([B.DAMP, B.WATER, B.FALAJ, K.FARMLAND]);
const LOOSE = new Set([B.SAND, B.PACKED, B.HARDPAN, B.DAMP, B.GRAVEL, B.SALT]);
const ROCKY = new Set([B.RUBBLE, B.ROCK_A, B.ROCK_B, B.ROCK_C, B.ROCK_D, B.STONE, B.FALAJ]);

// ---------------------------------------------------------------------------------------------- models
/** A shimmering pool: the sky mirrored in a sheet that is not there. */
function mirageMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...ATM, uTime: { value: 0 }, uFade: { value: 1 } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vWPos; varying vec2 vUv;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += 0.05 * sin(wp.x * 1.7 + uTime * 3.0) * sin(wp.z * 1.3 - uTime * 2.2);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vWPos; varying vec2 vUv;
      uniform float uTime; uniform float uFade;
      ${ATMO_PARS}
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;
        vec3 V = normalize(cameraPosition - vWPos);
        float w = sin(vWPos.x * 2.3 + uTime * 4.0) * 0.06 + sin(vWPos.z * 3.1 - uTime * 3.3) * 0.05;
        vec3 R = reflect(-V, normalize(vec3(w, 1.0, w * 0.7)));
        R.y = abs(R.y) * 0.6 + 0.04;
        vec3 col = wahaSky(normalize(R)) * 1.15;
        float edge = 1.0 - smoothstep(0.55, 1.0, r);
        float flick = 0.75 + 0.25 * sin(uTime * 5.0 + vWPos.x * 0.7);
        gl_FragColor = vec4(col, edge * flick * 0.85 * uFade);
      }`,
  });
}
function buildMirage() {
  const g = new THREE.Group();
  const mat = mirageMaterial();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40), mat);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.12; disc.renderOrder = 3;
  g.add(disc);
  const palms = buildPalms([{ x: -2.6, y: 0, z: -3.1, h: 7.5, seed: 9001 }, { x: 3.0, y: 0, z: -2.2, h: 6.2, seed: 9002 }, { x: 0.6, y: 0, z: -4.4, h: 8.4, seed: 9003 }]);
  palms.traverse((o) => { if (o.isMesh) { o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 3; } });
  g.add(palms);
  // a whirl of sand marks the middle when one comes close
  const n = 90, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) seed[i] = i / n;
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf0d2a0, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }));
  pts.frustumCulled = false;
  g.add(pts);
  g.userData = { mat, palms, pts, seed };
  return g;
}

/** Four cloth sails on spars round a hub; the group turns about its z axis. */
let sailMats = null;                               // made once: painting the cloth's texture is slow
function buildSails() {
  const g = new THREE.Group(), rot = new THREE.Group();
  if (!sailMats) {
    const tex = saduTexture(1); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    sailMats = { wood: lambert({ color: lin(PAL.woodDark, 1.5) }), cloth: lambert({ map: tex, side: THREE.DoubleSide }) };
  }
  const { wood, cloth } = sailMats;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), wood); hub.rotation.x = Math.PI / 2; rot.add(hub);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.08), wood); spar.position.y = 1.05; arm.add(spar);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.55), cloth); sail.position.set(0.34, 1.25, 0.02); sail.rotation.y = 0.25; arm.add(sail);
    rot.add(arm);
  }
  g.add(rot);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.rot = rot;
  return g;
}

/** The sundial: a plastered dial with twelve marks and a bronze gnomon. */
function buildDial() {
  const g = new THREE.Group();
  const plaster = lambert({ color: lin(PAL.plaster, 1.02) }), dark = lambert({ color: lin(PAL.woodDark, 1.1) });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.35, metalness: 0.8, emissive: 0x3a2408, emissiveIntensity: 0.25 });
  patchMaterial(bronze, {});
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.45, 0.22, 36), plaster); disc.position.y = 0.11; g.add(disc);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, m = new THREE.Mesh(new THREE.BoxGeometry(i % 3 === 0 ? 0.12 : 0.07, 0.04, i % 3 === 0 ? 0.62 : 0.4), dark);
    m.position.set(Math.sin(a) * 1.85, 0.24, Math.cos(a) * 1.85); m.rotation.y = a; g.add(m);
  }
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(1.9, 0); shape.lineTo(0, 2.4); shape.lineTo(0, 0);
  const gn = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false }), bronze);
  gn.position.set(-0.07, 0.22, -0.95); gn.rotation.y = -Math.PI / 2; g.add(gn);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.06, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 1.0), transparent: true, opacity: 0 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; g.add(ring);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { ring };
  return g;
}

/** A bronze mirror on a wooden stand; the disc faces +z. */
function buildMirror() {
  const g = new THREE.Group(), head = new THREE.Group();
  const wood = lambert({ color: lin(PAL.woodDark, 1.4) });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xd8b070, roughness: 0.18, metalness: 0.9, emissive: 0x6a4a18, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  patchMaterial(bronze, {});
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), wood); post.position.y = 0.5; g.add(post);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), wood); foot.position.y = 0.04; g.add(foot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 24), wood); head.add(rim);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.41, 24), bronze); disc.position.z = 0.01; head.add(disc);
  head.position.y = 1.35; head.rotation.x = -0.25;
  g.add(head);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { head, bronze };
  return g;
}
function buildBeam() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 1.0), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.renderOrder = 4; m.frustumCulled = false; m.visible = false;
  return m;
}

/** The cloud camel: an original creature of soft puffs, two cumulus humps, wisps for legs, saddle bags of sadu weave. */
function buildCloudCamel() {
  const g = new THREE.Group(), body = new THREE.Group();
  const cloud = lambert({ color: new THREE.Color(1.0, 0.98, 1.04) }, { rim: 0.9 }), shade = lambert({ color: new THREE.Color(0.82, 0.84, 0.98) }, { rim: 0.9 });
  const wisp = new THREE.MeshLambertMaterial({ color: 0xeef0ff, transparent: true, opacity: 0.55, depthWrite: false });
  const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.6, 2.2) });
  const tex = saduTexture(2); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const bag = lambert({ map: tex });
  const rnd = mulberry32(4242);
  const puff = (r, x, y, z, m = cloud) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m); s.position.set(x, y, z); s.rotation.set(rnd() * 3, rnd() * 3, 0); body.add(s); return s; };
  // body: a long soft barrel of puffs
  for (let i = 0; i < 7; i++) { const t = i / 6; puff(0.42 + 0.08 * Math.sin(t * Math.PI), (rnd() - 0.5) * 0.1, 1.15 + Math.sin(t * Math.PI) * 0.06, -0.75 + t * 1.5, i % 2 ? shade : cloud); }
  // two humps like towering cumulus
  for (const hz of [-0.32, 0.28]) { puff(0.36, 0, 1.55, hz); puff(0.26, 0.06, 1.85, hz + 0.04); puff(0.17, -0.04, 2.05, hz - 0.02); }
  // the neck rises forward in a curve, the head is a small cloud with a darker muzzle
  const neck = [[0, 1.3, 0.85, 0.24], [0, 1.6, 1.05, 0.2], [0, 1.95, 1.12, 0.19], [0, 2.22, 1.08, 0.2]];
  for (const [x, y, z, r] of neck) puff(r, x, y, z);
  puff(0.26, 0, 2.38, 1.25); puff(0.18, 0, 2.3, 1.5, shade);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eye); e.position.set(s * 0.17, 2.46, 1.38); body.add(e);
    puff(0.08, s * 0.15, 2.62, 1.18, shade);                                                          // ears
  }
  // tail: a trailing wisp
  puff(0.14, 0, 1.2, -1.15, shade); puff(0.1, 0, 1.05, -1.32, shade);
  // legs: wisps that thin out into nothing above the ground
  const legs = [];
  for (const [x, z] of [[-0.24, 0.55], [0.24, 0.55], [-0.24, -0.55], [0.24, -0.55]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.03, 0.85, 7, 1, true), wisp); l.position.set(x, 0.62, z); body.add(l); legs.push(l);
    puff(0.13, x, 0.98, z);
  }
  // saddle bags hanging either side of the humps, and a red cord
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.62), bag); b.position.set(s * 0.52, 1.18, -0.02); b.rotation.z = s * 0.12; body.add(b);
  }
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.03, 5, 20, Math.PI), lambert({ color: 0x9a2a22 })); cord.position.set(0, 1.25, -0.02); cord.rotation.y = Math.PI / 2; body.add(cord);
  g.add(body);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== wisp; o.receiveShadow = false; } });
  g.userData = { body, legs };
  return g;
}

// ---------------------------------------------------------------------------------------------- the wonders
export function createWonders(ctx) {
  const { play, kit, bag, D, scene, touch, put, dig, canDig } = ctx;
  const st = play.state;
  const OX = OXC, OZ = OZC;
  const host = () => !(window.__GAME_NET && window.__GAME_NET.role === 'guest');
  const sky = () => window.__GAME_SKY || { time: 'noon', night: false };
  const daylight = () => !sky().night;
  /** A note once per play session per key (and again after `again` seconds when given). */
  const told = new Map();
  function tell(k, text, ms = 6000, again = 0) {
    const t = told.get(k), now = st.time;
    if (t !== undefined && (!again || now - t < again)) return false;
    told.set(k, now);
    play.notice(text, false, ms);
    return true;
  }
  const eye = new THREE.Vector3(), look = new THREE.Vector3();
  function aimAt(wx, wy, wz, reach = 5, r = 0.9) {
    eye.set(st.pos.x + OX, st.pos.y + play.tuning.eye, st.pos.z + OZ);
    const cp = Math.cos(st.pitch);
    look.set(-Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp);
    const cx = wx - eye.x, cy = wy - eye.y, cz = wz - eye.z, t = cx * look.x + cy * look.y + cz * look.z;
    return t > 0 && t < reach && cx * cx + cy * cy + cz * cz - t * t < r * r;
  }
  const held = () => st.slots[st.sel];
  const ground = (gx, gz) => D.surfaceY(gx, gz);

  // ======================================================================== 4. the sundial and the mirrors
  // (made first: they are part of the home map, and must stand before the save is read back)
  const F = FORT, DIAL = { x: 126.5, y: 35, z: 62.5 };
  const MIRRORS = [{ x: 110, z: 78, start: 5 }, { x: 126, z: 78, start: 3 }, { x: 118, z: 70, start: 6 }, { x: 122, z: 62, start: 7 }].map((m) => ({ ...m, y: F.y }));
  const VAULT = { x0: 111, x1: 122, z0: 74, z1: 82, y0: 17, y1: 23, hatch: [116, 118, 77, 79] };
  const g = (wx, wz) => [wx - OX, wz - OZ];
  // the vault under the courtyard: a shell of carved stone, steps down from the hatch, two chests and two lanterns
  {
    const V = VAULT;
    for (let x = V.x0; x <= V.x1; x++) for (let z = V.z0; z <= V.z1; z++) for (let y = V.y0; y <= V.y1; y++) {
      const shell = x === V.x0 || x === V.x1 || z === V.z0 || z === V.z1 || y === V.y0 || y === V.y1;
      const [gx, gz] = g(x, z);
      ctx.setQuiet(gx, y, gz, shell ? B.VAULT : 0);
    }
    for (const [x, y] of [[117, 22], [116, 21], [115, 20], [114, 19], [113, 18]]) { const [gx, gz] = g(x, 78); ctx.setQuiet(gx, y, gz, B.VAULT); }
    for (const [x, z] of [[121, 80], [121, 76]]) { const [gx, gz] = g(x, z); ctx.setQuiet(gx, 18, gz, K.CHEST); }
    for (const [x, z] of [[112, 81], [112, 75]]) { const [gx, gz] = g(x, z); ctx.lantern(gx, 18, gz); }
  }
  const hatchOpen = () => { const [gx, gz] = g(117, 78); return D.get(gx, VAULT.y1, gz) === 0; };
  // the mirrors stand in the courtyard, each turned away from the dial
  for (const m of MIRRORS) { const [gx, gz] = g(m.x, m.z); m.gx = gx; m.gz = gz; ctx.setQuiet(gx, m.y, gz, B.MIRROR + m.start); }
  // the gnomon's cells are solid; the dial sits on the tower top
  { const [gx, gz] = g(126, 62); ctx.obstacle(gx, 35, gz); ctx.obstacle(gx, 36, gz); }
  const dial = buildDial();
  dial.position.set(DIAL.x, DIAL.y, DIAL.z);
  scene.add(dial);
  const beams = MIRRORS.map(() => { const b = buildBeam(); scene.add(b); return b; });
  const mirrorProps = MIRRORS.map((m) => { const p = buildMirror(); p.position.set(m.x + 0.5, m.y, m.z + 0.5); scene.add(p); p.userData.yaw = null; return p; });
  const want = MIRRORS.map((m) => { const a = Math.atan2(DIAL.x - (m.x + 0.5), -(DIAL.z - (m.z + 0.5))); return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; });
  const facing = (i) => { const id = D.get(MIRRORS[i].gx, MIRRORS[i].y, MIRRORS[i].gz); return isMirror(id) ? id - B.MIRROR : -1; };
  let lastAligned = -1, dialLit = 0;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  function tickDial(dt) {
    let aligned = 0;
    const day = daylight();
    MIRRORS.forEach((m, i) => {
      const f = facing(i), p = mirrorProps[i];
      p.visible = f >= 0;
      if (f < 0) { beams[i].visible = false; return; }
      // the mirror turns smoothly to where it now faces (0: north, then clockwise in eighths)
      const target = Math.PI - f * Math.PI / 4;
      if (p.userData.yaw === null) p.userData.yaw = target;
      let d = target - p.userData.yaw; d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      p.userData.yaw += d * Math.min(1, dt * 6);
      p.rotation.y = p.userData.yaw;
      const ok = f === want[i];
      if (ok) aligned++;
      const b = beams[i];
      b.visible = ok && day;
      if (b.visible) {
        p.userData.head.getWorldPosition(_a); _b.set(DIAL.x, DIAL.y + 1.2, DIAL.z);
        _m.copy(_b).sub(_a); const len = _m.length();
        b.position.copy(_a).addScaledVector(_m, 0.5); b.scale.set(1, len, 1);
        _q.setFromUnitVectors(UP, _m.normalize()); b.quaternion.copy(_q);
        b.material.opacity = 0.35 + 0.2 * Math.sin(st.time * 3 + i);
      }
      p.userData.bronze.emissiveIntensity = ok && day ? 1.2 : 0.35;
    });
    const open = hatchOpen();
    dialLit += ((open ? 1 : aligned / 4) * (day ? 1 : 0.2) - dialLit) * Math.min(1, dt * 2);
    dial.userData.ring.material.opacity = dialLit;
    // what the player hears of it
    const px = st.pos.x + OX, pz = st.pos.z + OZ, py = st.pos.y;
    const nearMirror = MIRRORS.some((m) => Math.hypot(m.x + 0.5 - px, m.z + 0.5 - pz) < 6 && Math.abs(py - m.y) < 4);
    if (nearMirror && !open) tell('mirror', touch ? 'مراية برونز قديمة. وجّه عليها واضغط زر البناء عشان تلفّها. فوق البرج الشمالي الشرقي مزولة شمس: لفّ المرايا الأربع لين تأشّر عليها، والشمس طالعة.' : 'مراية برونز قديمة. اضغط عليها بالزر الأيمن عشان تلفّها. فوق البرج الشمالي الشرقي مزولة شمس: لفّ المرايا الأربع لين تأشّر عليها، والشمس طالعة.', 8000);
    if (Math.hypot(DIAL.x - px, DIAL.z - pz) < 5 && py > DIAL.y - 1.5 && !open) tell('dial', 'مزولة الشمس! أربع مرايا في ساحة الحصن لازم كلها ترمي نورها هني والشمس طالعة. كل مراية تأشّر صح يطلع منها شعاع.', 8000);
    if (aligned !== lastAligned && lastAligned >= 0 && !open && aligned > lastAligned) {
      if (!day) tell('dialNight', 'المرايا تبي الشمس. رجّع الوقت نهار وشوف.', 4000, 20);
      else if (aligned < 4) play.notice((aligned === 1 ? 'مراية وحدة' : aligned === 2 ? 'مرايتين' : 'ثلاث مرايا') + ' من أربع ترمي نورها على المزولة.', false, 3200);
    }
    lastAligned = aligned;
    if (aligned === 4 && day && !open && host()) openVault();
  }
  function openVault() {
    const [h0, h1, k0, k1] = VAULT.hatch;
    for (let x = h0; x <= h1; x++) for (let z = k0; z <= k1; z++) { const [gx, gz] = g(x, z); dig(gx, VAULT.y1, gz); }
    const c1 = kit.chestAt(...g3(121, 18, 80)), c2 = kit.chestAt(...g3(121, 18, 76));
    const fill = (c, list) => { c.fill(null); list.forEach(([id, n], i) => { c[i] = kitItem(id, n); }); };
    fill(c1, [[K.GOLD, 4], [K.DIAMOND, 1], [K.GEM, 2], [K.LUCKY, 1]]);
    fill(c2, [[K.EMERALD, 2], [K.RUBY, 2], [K.AMETHYST, 2], [K.GOLDEN_APPLE, 1], [K.DATES, 8]]);
    st.sunVault = 1;
    if (play.sound && play.sound.level) play.sound.level();
    play.notice('المرايا الأربع رمت نورها على المزولة… وانفتحت خزنة الشمس تحت ساحة الحصن! انزل الدرج وافتح الصناديق.', false, 9000);
  }
  function g3(x, y, z) { return [x - OX, y, z - OZ]; }
  // the place button on a mirror turns it an eighth clockwise
  play.onUseFirst((h) => {
    if (!h || !isMirror(h.id)) return false;
    const next = B.MIRROR + ((h.id - B.MIRROR + 1) % 8);
    put(h.x, h.y, h.z, next);
    if (play.sound && play.sound.ui) play.sound.ui();
    return true;
  });

  // ======================================================================== 2. the wind towers
  const towers = new Map();                     // "x,y,z" (grid; the head) -> { x, y, z, sails, done, at, t }
  const tkey = (x, y, z) => x + ',' + y + ',' + z;
  function addTower(x, y, z) {
    const k = tkey(x, y, z);
    if (!towers.has(k)) towers.set(k, { x, y, z, sails: null, ring: 0, t: Math.random() * 0.5, idle: false });
  }
  for (const r of D.chunks.values()) for (const t of r.towers) addTower(...t);
  const prevOnChunk = D.onChunk;
  D.onChunk = (r) => { if (prevOnChunk) prevOnChunk(r); for (const t of r.towers) addTower(...t); };
  // the one by the camp, on the open sand east of the worksite
  {
    const wx = 138, wz = 101, [gx, gz] = g(wx, wz), top = D.topAt(gx, gz);
    if (top > 0 && !D.get(gx, top + 1, gz)) {
      for (let y = top + 1; y <= top + 3; y++) ctx.setQuiet(gx, y, gz, y === top + 3 ? B.BRICK : B.ADOBE);
      ctx.setQuiet(gx, top + 4, gz, B.WINDHEAD);
      addTower(gx, top + 4, gz);
    }
  }
  // garden cells round a tower, nearest first
  const RING = [];
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) { const d = Math.hypot(dx, dz); if (d > 0.5 && d <= 6.3) RING.push([dx, dz, d]); }
  RING.sort((a, b) => a[2] - b[2]);
  const isBrick = (id) => id === B.BRICK || id === B.ADOBE || id === B.ADOBE_DARK;
  /** The player put a block: a palm log on three mud bricks is a new wind tower. */
  function placed(x, y, z, id) {
    if (id === B.WINDHEAD) { addTower(x, y, z); return; }
    if (id !== B.WOOD) return;
    if (!(isBrick(D.get(x, y - 1, z)) && isBrick(D.get(x, y - 2, z)) && isBrick(D.get(x, y - 3, z)))) return;
    if (!host()) return;
    put(x, y, z, B.WINDHEAD);
    addTower(x, y, z);
    play.notice('بنيت برج ريح! أشرعته بتدور وبيسحب الماي من تحت الرمل، والأرض حوله بتصير بستان.', false, 6000);
  }
  const towerIdOk = (t) => D.get(t.x, t.y, t.z) === B.WINDHEAD;
  function growGarden(t) {
    // one cell at a time: water channels on the four arms, wet soil with grass between them, and tilled plots
    const base = t.y - 4;
    for (let n = 0; n < RING.length; n++) {
      const [dx, dz] = RING[(t.ring + n) % RING.length];
      const x = t.x + dx, z = t.z + dz, top = D.topAt(x, z);
      if (Math.abs(top - base) > 2) continue;
      const id = D.get(x, top, z);
      if (GARDEN.has(id) || !SOFTTOP.has(id)) continue;
      const above = D.get(x, top + 1, z);
      if (above && !(above >= B.REED && above <= B.SHRUB)) continue;
      const arm = (dx === 0 || dz === 0) && Math.max(Math.abs(dx), Math.abs(dz)) >= 2;
      const byArm = !arm && (Math.abs(dx) <= 1 || Math.abs(dz) <= 1);
      const h = ((x * 73856093) ^ (z * 19349663)) >>> 0;
      if (above) dig(x, top + 1, z);
      if (arm) { put(x, top - 1, z, B.FALAJ); put(x, top, z, B.WATER); }
      else if (!byArm && (Math.abs(dx) + Math.abs(dz)) % 2 === 0 && Math.max(Math.abs(dx), Math.abs(dz)) >= 2 && Math.hypot(dx, dz) <= 5) put(x, top, z, K.FARMLAND);
      else {
        put(x, top, z, B.DAMP);
        const r = (h % 100) / 100;
        const plant = byArm ? (r < 0.45 ? B.REED : r < 0.7 ? B.TUFT : 0) : (r < 0.35 ? B.TUFT : r < 0.47 ? B.SHRUB : 0);
        if (plant && top + 1 < SY) put(x, top + 1, z, plant);
      }
      t.ring = (t.ring + n + 1) % RING.length;
      return true;
    }
    return false;
  }
  function tickTowers(dt) {
    const px = st.pos.x, pz = st.pos.z;
    for (const [k, t] of towers) {
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d > 160 || !D.has(t.x >> 5, t.z >> 5)) { if (t.sails) { t.sails.visible = false; } continue; }
      if (!towerIdOk(t)) { if (t.sails) { scene.remove(t.sails); t.sails.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); t.sails = null; } towers.delete(k); continue; }
      if (!t.sails) {
        t.sails = buildSails();
        // the sails face the wind, on the windward side of the head
        const yaw = Math.atan2(WIND[0], WIND[1]) + Math.PI;
        t.sails.rotation.y = yaw;
        t.sails.position.set(t.x + OX + 0.5 - Math.sin(yaw) * 0.62, t.y + 0.5, t.z + OZ + 0.5 - Math.cos(yaw) * 0.62);
        scene.add(t.sails);
      }
      t.sails.visible = true;
      t.sails.userData.rot.rotation.z += dt * 1.3;
      if (d < 11) tell('tower', 'برج ريح طيني: أشرعته تسحب الماي من تحت الرمل، والرمل حوله يصير بستان. ازرع حبوب جنبه وتكبر أسرع. تقدر تبني برجك: ثلاث طوب طين فوق بعض وفوقها جذع نخل.', 9000);
      if (d < 48 && host() && !t.idle && (t.t += dt) > 0.7) { t.t = 0; if (!growGarden(t)) t.idle = true; }
    }
    // seeds planted in a tower's garden grow faster (the farm grows them; the tower's water adds to it)
    const farm = bag.farm;
    if (farm && host() && towers.size) {
      for (const c of farm.crops.values()) {
        if (c.stage >= 3) continue;
        for (const t of towers.values()) if (Math.abs(c.x - t.x) <= 7 && Math.abs(c.z - t.z) <= 7 && Math.abs(c.y - t.y) < 8) { c.grow += dt * 1.5; c.water = true; break; }
      }
    }
  }

  // ======================================================================== 1. the mirage gate
  const mirage = { obj: buildMirage(), on: false, x: 0, z: 0, top: 0, open: false, sealed: false, looked: 0, tries: 0 };
  mirage.obj.visible = false; scene.add(mirage.obj);
  let wasSunset = false;
  /** A place on the open sand 26-50 blocks ahead of the player for the mirage, its steps and its room. */
  /** Can the player see the ground at (x, z) (grid), over the dunes between? */
  function inSight(x, z, top) {
    const ex = st.pos.x, ey = st.pos.y + play.tuning.eye, ez = st.pos.z, ty = top + 2.5;
    for (let k = 1; k < 24; k++) { const f = k / 24, qx = ex + (x - ex) * f, qz = ez + (z - ez) * f; if (D.surfaceY(qx, qz) > ey + (ty - ey) * f) return false; }
    return true;
  }
  function mirageSpot() {
    const px = st.pos.x, pz = st.pos.z;
    let fallback = null;
    for (let i = 0; i < 30; i++) {
      const a = st.yaw + Math.PI + (Math.random() - 0.5) * 1.3, r = 26 + Math.random() * 24;
      const cx = Math.round(px + Math.sin(a) * r), cz = Math.round(pz + Math.cos(a) * r);
      if (homeDist(cx + OX, cz + OZ) < 16) continue;
      const top = D.topAt(cx, cz);
      if (top < GROUND - 1 || top > SY - 8 || top - 7 < 3) continue;
      let ok = true;
      for (let dz = -4; dz <= 11 && ok; dz += 1) for (let dx = -4; dx <= 4 && ok; dx += 1) {
        const t = D.topAt(cx + dx, cz + dz), id = D.get(cx + dx, t, cz + dz);
        if (Math.abs(t - top) > 3 || id === B.WATER || id === K.WATER || !LOOSE.has(id) && !ROCKY.has(id)) ok = false;
        if (D.get(cx + dx, t + 1, cz + dz) === 29) ok = false;
      }
      if (!ok) continue;
      if (inSight(cx + 0.5, cz + 0.5, top)) return { x: cx, z: cz, top };
      if (!fallback) fallback = { x: cx, z: cz, top };
    }
    return mirage.tries > 2 ? fallback : null;
  }
  function openMirage() {
    const { x, z, top } = mirage;
    mirage.open = true;
    // steps down along +z, then a room of 5 x 5 x 3 lined with stone, a palm-wood ceiling, a chest and two lanterns
    for (let k = 0; k <= 4; k++) {
      const zz = z + k;
      put(x, top - 1 - k, zz, B.STONE);
      for (let y = top - k; y <= top - k + 2; y++) if (D.get(x, y, zz)) dig(x, y, zz);
    }
    const fy = top - 6;
    for (let zz = z + 4; zz <= z + 10; zz++) for (let xx = x - 3; xx <= x + 3; xx++) {
      const wall = xx === x - 3 || xx === x + 3 || zz === z + 4 || zz === z + 10;
      for (let y = fy; y <= fy + 4; y++) {
        if (wall) { if (!(xx === x && zz === z + 4 && y > fy && y < fy + 4)) { if (y > fy && y < fy + 4) put(xx, y, zz, B.FALAJ); } continue; }
        if (y === fy) put(xx, y, zz, B.PLASTER);
        else if (y === fy + 4) put(xx, y, zz, B.BEAM);
        else if (D.get(xx, y, zz)) dig(xx, y, zz);
      }
    }
    put(x, fy + 1, z + 9, K.CHEST);
    const c = kit.chestAt(x, fy + 1, z + 9);
    const r = Math.random();
    const loot = [[K.DATES, 6], [K.GOLD, 2], [K.GEM, 1], [r < 0.33 ? K.EMERALD : r < 0.66 ? K.RUBY : K.AMETHYST, 2]];
    if (Math.random() < 0.3) loot.push([K.LUCKY, 1]);
    c.fill(null); loot.forEach(([id, n], i) => { c[i] = kitItem(id, n); });
    ctx.lantern(x - 2, fy + 1, z + 9, true); ctx.lantern(x + 2, fy + 1, z + 9, true);
    st.mirages = (st.mirages || 0) + 1;
    if (play.sound && play.sound.level) play.sound.level();
    play.notice('انشقّ الرمل تحت السراب! درج ينزل لغرفة مخفية فيها صندوق. انزل قبل لا يروح المغرب.', false, 7000);
  }
  function sealMirage() {
    const { x, z, top } = mirage;
    for (let k = 0; k <= 2; k++) for (let y = top - 1 - k + 1; y <= top; y++) if (!D.get(x, y, z + k)) put(x, y, z + k, B.SAND);
    mirage.sealed = true;
  }
  function inMirageRoom() {
    const { x, z, top } = mirage, px = st.pos.x, pz = st.pos.z, py = st.pos.y;
    return px > x - 4 && px < x + 5 && pz > z - 1 && pz < z + 11 && py < top + 0.5;
  }
  function tickMirage(dt) {
    const s = sky(), sunset = s.time === 'sunset';
    if (sunset && !wasSunset) { mirage.tries = 0; mirage.on = false; mirage.open = false; mirage.sealed = false; }
    wasSunset = sunset;
    const o = mirage.obj, u = o.userData;
    u.mat.uniforms.uTime.value = st.time;
    if (!sunset) {
      if (mirage.on) {
        o.visible = false; mirage.on = false;
        if (mirage.open && !mirage.sealed) mirage.closing = true;
        else tell('mirageGone', 'راح السراب مع الشمس.', 3000, 30);
      }
      if (mirage.closing && !inMirageRoom()) { if (host()) sealMirage(); mirage.closing = false; tell('mirageShut', 'راح السراب، وانسدّ الدرج تحت الرمل.', 4000, 30); }
      // by day, out in the open desert, the old saying
      if (!sunset && !s.night && homeDist(st.pos.x + OX, st.pos.z + OZ) > 50) tell('mirageHint', 'يقولون البدو: الواحة اللي تلمع وقت المغرب تخبّي درب تحت الرمل. جرّب تخلي الوقت مغرب (' + (touch ? 'من زر الوقت والجو في الحقيبة' : 'لوحة Q') + ') وأنت في البر.', 9000);
      return;
    }
    if (!mirage.on && !mirage.open) {
      if ((mirage.look = (mirage.look || 0) - dt) > 0) return;
      mirage.look = 2;
      if (homeDist(st.pos.x + OX, st.pos.z + OZ) < 4 && mirage.tries > 3) return;
      mirage.tries++;
      const sp = mirageSpot();
      if (!sp) return;
      Object.assign(mirage, sp, { on: true });
      o.position.set(sp.x + OX + 0.5, ground(sp.x + 0.5, sp.z + 0.5), sp.z + OZ + 0.5);
      o.visible = true;
      tell('mirageSeen', 'شف بعيد قدامك… واحة تلمع وقت المغرب! يمكن سراب. امشِ لها قبل لا يروح المغرب.', 6000, 60);
      return;
    }
    if (!mirage.on) return;
    const d = Math.hypot(st.pos.x - (mirage.x + 0.5), st.pos.z - (mirage.z + 0.5));
    if (d > 120) { o.visible = false; mirage.on = false; return; }
    // close up it trembles and thins; the sand whirls where its middle is
    const fade = mirage.open ? Math.max(0, (u.mat.uniforms.uFade.value - dt * 1.5)) : 0.35 + 0.65 * Math.min(1, Math.max(0, (d - 4) / 14));
    u.mat.uniforms.uFade.value = fade;
    u.palms.traverse((m) => { if (m.isMesh) m.material.opacity = 0.55 * fade; });
    u.palms.scale.y = 1 + 0.03 * Math.sin(st.time * 4);
    const near = Math.max(0, Math.min(1, (16 - d) / 10));
    u.pts.visible = near > 0 && !mirage.open;
    if (u.pts.visible) {
      const p = u.pts.geometry.attributes.position;
      for (let i = 0; i < u.seed.length; i++) {
        const q = u.seed[i], a = q * 37 + st.time * (1.5 + q), h = ((q * 7.3 + st.time * 0.6) % 1) * 2.4, rr = 0.25 + h * 0.5;
        p.setXYZ(i, Math.cos(a) * rr, h, Math.sin(a) * rr);
      }
      p.needsUpdate = true;
      u.pts.material.opacity = 0.9 * near;
    }
    if (d < 12 && !mirage.open) tell('mirageNear', 'السراب يرتجف… كأن الرمل يلفّ في وسطه. ادخل في الوسط!', 4000, 40);
    if (d < 2.4 && !mirage.open && host()) openMirage();
    if (mirage.open && fade <= 0) o.visible = false;
  }

  // ======================================================================== 3. the cloud camels
  const SAVEKEY = 'bw-waha-caravan';
  const camel = { obj: buildCloudCamel(), on: false, tame: false, dig: false, x: 0, y: 0, z: 0, yaw: 0, t: 0, tx: 0, tz: 0, wait: 0, bag: new Array(27).fill(null), spawnT: 8, aimed: false };
  camel.obj.visible = false; scene.add(camel.obj);
  try {
    const s = JSON.parse(window.localStorage.getItem(SAVEKEY) || 'null');
    if (s && s.tame) { camel.tame = true; camel.dig = !!s.dig; (s.bag || []).forEach((q, i) => { if (i < 27) camel.bag[i] = q || null; }); }
  } catch (e) { /* no caravan kept: a new one is met in the desert */ }
  function saveCamel() { try { window.localStorage.setItem(SAVEKEY, JSON.stringify({ tame: camel.tame, dig: camel.dig, bag: camel.bag })); } catch (e) { /* storage closed: it is not kept */ } }
  window.addEventListener('pagehide', saveCamel);
  let camelSaveT = 0;
  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;left:50%;top:64%;transform:translateX(-50%);z-index:20;pointer-events:none;direction:rtl;padding:5px 12px;border-radius:8px;background:rgba(8,11,16,.82);border:1px solid rgba(239,217,160,.5);color:#f1f4f8;font:700 13px/1.4 Tajawal,system-ui,sans-serif;white-space:nowrap;';
  tag.hidden = true; document.body.appendChild(tag);
  function showCamel(gx, gz) {
    camel.x = gx; camel.z = gz; camel.y = ground(gx, gz); camel.on = true; camel.obj.visible = true; camel.tx = gx; camel.tz = gz;
  }
  function stepCamel(tx, tz, speed, dt) {
    const dx = tx - camel.x, dz = tz - camel.z, d = Math.hypot(dx, dz);
    if (d < 0.1) return false;
    const v = Math.min(d, speed * dt), nx = camel.x + dx / d * v, nz = camel.z + dz / d * v;
    const gy = ground(nx, nz);
    if (gy - camel.y > 1.6 && !camel.tame) return false;                                   // a wild one does not climb walls
    camel.x = nx; camel.z = nz;
    camel.yaw += ((((Math.atan2(dx, dz) - camel.yaw) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 5);
    return true;
  }
  /** The camel digs blocks beside the one the player dug: up to two of the same kind of ground, into its own bags. */
  function helpDig(h) {
    const fam = LOOSE.has(h.id) ? LOOSE : ROCKY.has(h.id) ? ROCKY : null;
    const same = (id) => (fam ? fam.has(id) : id === h.id);
    let n = 0;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]]) {
      if (n >= 2) break;
      const x = h.x + dx, y = h.y + dy, z = h.z + dz, id = D.get(x, y, z);
      if (!id || !same(id) || y < 2 || !canDig(id, x, y, z)) continue;
      dig(x, y, z);
      const it = play.itemOf ? play.itemOf(ctx.dropOf(id)) : null;
      if (it) { const s = camel.bag.find((q) => q && q.id === it.id); if (s) s.n = Math.min(999, (s.n || 0) + 1); else { const i = camel.bag.indexOf(null); if (i >= 0) camel.bag[i] = { ...it, n: 1 }; } }
      n++;
    }
    if (n) { camel.puff = 0.6; camelSaveT = 99; }
  }
  play.onBreakAny((h) => {
    if (!camel.tame || !camel.dig || !camel.on || h.remote) return;
    if (Math.hypot(camel.x - (h.x + 0.5), camel.z - (h.z + 0.5)) > 9) return;
    helpDig(h);
  });
  play.onUseFirst(() => {
    if (!camel.on || !camel.aimed || st.modal) return false;
    const s = held();
    if (!camel.tame) {
      if (s && (s.id === K.DATES || s.key === 'dates') && s.n > 0) {
        s.n--; if (!(s.n > 0)) play.setSlot(st.sel, EMPTY);
        camel.tame = true; camel.love = 1; play.changed(); saveCamel();
        if (play.sound && play.sound.level) play.sound.level();
        play.notice('الجمل السحابي أكل التمر وصار صاحبك! بيمشي وراك ويشيل أغراضك. اضغط عليه يفتح خرجه، وبالمعول أو المجرفة يساعدك بالحفر.', false, 8000);
        return true;
      }
      play.notice('الجمل السحابي يشمّ يدك… يبي تمر. (التمر يطيح من النخل.)', false, 3200);
      return true;
    }
    if (s && (s.key === 'mattock' || s.key === 'spade' || (s.tool && s.dig))) {
      camel.dig = !camel.dig; saveCamel();
      play.notice(camel.dig ? 'الجمل السحابي بيساعدك بالحفر: كل ما حفرت جنبه يحفر معك مكعبين من نفس الأرض ويحطهم في خرجه.' : 'الجمل السحابي وقف عن الحفر.', false, 5000);
      return true;
    }
    return bag.openStore(camel.bag, 'خرج الجمل السحابي');
  });
  function tickCamel(dt) {
    const px = st.pos.x, pz = st.pos.z;
    const out = homeDist(px + OX, pz + OZ);
    if (!camel.on) {
      if (camel.tame) showCamel(px + 2, pz + 2);
      else if (daylight() && out > 30 && (camel.spawnT -= dt) <= 0) {
        camel.spawnT = 20;
        for (let i = 0; i < 10; i++) {
          const a = st.yaw + Math.PI + (Math.random() - 0.5) * 1.6, r = 22 + Math.random() * 16, x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
          const t = D.topAt(Math.floor(x), Math.floor(z)), id = D.get(Math.floor(x), t, Math.floor(z));
          if (id === B.WATER || id === K.WATER || t < WATER_Y) continue;
          showCamel(x, z); break;
        }
      }
      if (!camel.on) return;
    }
    camel.t += dt;
    const d = Math.hypot(camel.x - px, camel.z - pz);
    if (!camel.tame) {
      if (d > 90 || (!daylight() && d > 20)) { camel.on = false; camel.obj.visible = false; return; }
      // it drifts about, slowly, stopping to look
      if ((camel.wait -= dt) <= 0) { camel.wait = 3 + Math.random() * 4; const a = Math.random() * 6.28; camel.tx = camel.x + Math.sin(a) * 6; camel.tz = camel.z + Math.cos(a) * 6; }
      camel.moving = stepCamel(camel.tx, camel.tz, 0.9, dt);
      if (d < 18) tell('camelSeen', 'جمل سحابي! ناعم مثل الغيم ويطوف فوق الرمل. ' + (touch ? 'وجّه عليه التمر واضغط زر البناء' : 'امسك تمر واضغط عليه بالزر الأيمن') + ' ويصير صاحبك.', 7000, 120);
    } else {
      if (d > 40) { camel.x = px - Math.sin(st.yaw) * -2.5; camel.z = pz - Math.cos(st.yaw) * -2.5; camel.y = ground(camel.x, camel.z); }
      // it keeps a few steps behind the player's shoulder
      const tx = px + Math.sin(st.yaw) * 2.8 + Math.cos(st.yaw) * 1.4, tz = pz + Math.cos(st.yaw) * 2.8 - Math.sin(st.yaw) * 1.4;
      camel.moving = Math.hypot(tx - camel.x, tz - camel.z) > 1.2 ? stepCamel(tx, tz, Math.min(9, 2 + Math.hypot(tx - camel.x, tz - camel.z) * 1.5), dt) : false;
      if ((camelSaveT += dt) > 12) { camelSaveT = 0; saveCamel(); }
    }
    const gy = ground(camel.x, camel.z);
    camel.y += (gy - camel.y) * Math.min(1, dt * 6);
    const o = camel.obj, u = o.userData;
    o.position.set(camel.x + OX, camel.y + 0.25 + Math.sin(camel.t * 1.6) * 0.08, camel.z + OZ);
    o.rotation.y = camel.yaw;
    u.body.rotation.z = Math.sin(camel.t * 1.1) * 0.03;
    u.legs.forEach((l, i) => { l.rotation.x = camel.moving ? Math.sin(camel.t * 7 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.35 : 0; });
    if (camel.puff > 0) { camel.puff -= dt; o.scale.setScalar(1 + 0.08 * Math.sin(camel.puff * 20)); } else o.scale.setScalar(1);
    camel.aimed = !st.modal && aimAt(camel.x + OX, camel.y + 1.5, camel.z + OZ, 5, 1.1);
    const text = camel.aimed ? (camel.tame ? 'الجمل السحابي · زر البناء: خرجه' + (camel.dig ? ' · يحفر معك' : '') : 'جمل سحابي · يبي تمر') : '';
    if (tag.textContent !== text) tag.textContent = text;
    if (tag.hidden === !!text) tag.hidden = !text;
  }

  play.onTick((s, dt) => {
    if (dt <= 0) return;
    tickDial(dt);
    tickTowers(dt);
    tickMirage(dt);
    tickCamel(dt);
  });
  const api = { mirage, towers, camel, dial, mirrors: MIRRORS, want, facing, hatchOpen, placed, openVault, openMirage, saveCamel, VAULT };
  window.__WAHA = api;
  return api;
}
