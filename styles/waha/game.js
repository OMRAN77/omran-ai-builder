// The playable game for "waha": wires the shared first-person controller, shared/play.js, to this
// world. Loaded only in game mode (main.js). Everything visual stays here and in main.js; the
// controller only reports what happened.
import * as THREE from 'three';
import { createPlay, createPlayPanel, goImmersive } from '../../shared/play.js';
import { KIT_GROUPS, createKit } from '../../shared/kit.js';
import { createBag } from '../../shared/bag.js';
import { createHeld } from '../../shared/held.js';
import { createVitals, bars } from '../../shared/vitals.js';
import { createLife } from '../../shared/life.js';
import { extraKinds } from '../../shared/beasts.js';
import { createWeather } from '../../shared/weather.js';
import { createStatus } from '../../shared/status.js';
import { ATM } from './atmo.js';
import { buildOryx, buildWraith, buildScorpion } from './actors.js';
import { B, BLOCKS, X0, X1, Z0, Z1, SX, SY, SZ, colIndex, cornerIndex } from './world.js';
import { SLOTS } from './hud.js';
import { buildLantern } from './props.js';
import { WATER_U } from './scenery.js';

const NAMES = {
  [B.SAND]: 'رمل', [B.PACKED]: 'رمل متماسك', [B.HARDPAN]: 'أرض صلبة', [B.DAMP]: 'تراب رطب', [B.GRAVEL]: 'حصى', [B.RUBBLE]: 'ركام صخري',
  [B.ROCK_A]: 'حجر رملي', [B.ROCK_B]: 'حجر رملي أحمر', [B.ROCK_C]: 'حجر رملي فاتح', [B.ROCK_D]: 'حجر رملي داكن',
  [B.ADOBE]: 'جدار طين', [B.ADOBE_DARK]: 'جدار طين', [B.BRICK]: 'طوب طين', [B.BAND]: 'إفريز طين', [B.PLASTER]: 'جص', [B.STONE]: 'حجر بناء', [B.FALAJ]: 'حجر الفلج',
  [B.WOOD]: 'جذع نخل', [B.BEAM]: 'عمود خشب', [B.THATCH]: 'سعف نخل', [B.SLIT]: 'كوّة', [B.SLIT_LIT]: 'كوّة مضيئة',
  [B.REED]: 'قصب', [B.TUFT]: 'عشب', [B.SHRUB]: 'شجيرة',
};
/** What digging a block puts on the belt (one slot per family of materials). */
const DROP = {
  [B.SAND]: B.SAND, [B.PACKED]: B.SAND, [B.HARDPAN]: B.SAND, [B.DAMP]: B.SAND,
  [B.GRAVEL]: B.ROCK_A, [B.RUBBLE]: B.ROCK_A, [B.ROCK_A]: B.ROCK_A, [B.ROCK_B]: B.ROCK_A, [B.ROCK_C]: B.ROCK_A, [B.ROCK_D]: B.ROCK_A, [B.STONE]: B.ROCK_A, [B.FALAJ]: B.ROCK_A,
  [B.ADOBE]: B.BRICK, [B.ADOBE_DARK]: B.BRICK, [B.BRICK]: B.BRICK, [B.BAND]: B.BRICK, [B.PLASTER]: B.BRICK, [B.SLIT]: B.BRICK, [B.SLIT_LIT]: B.BRICK,
  [B.WOOD]: B.WOOD, [B.BEAM]: B.WOOD, [B.THATCH]: B.WOOD,
};
const LOOSE = new Set([B.SAND, B.PACKED, B.HARDPAN, B.DAMP, B.GRAVEL]);
const ROCK = new Set([B.RUBBLE, B.ROCK_A, B.ROCK_B, B.ROCK_C, B.ROCK_D, B.STONE, B.FALAJ]);
const EYE = 1.62;
const ease = (t) => t * t * (3 - 2 * t);

export async function startGame(ctx) {
  const { GID, stage, W, terrain, hud, held, targetBox, actors, place, aimShadow, setTime, rig, lanterns, lightLantern, merlons, beams, flag, campProps } = ctx;
  const { scene, camera, renderer } = stage, { world } = W, A = W.anchors;
  const OBSTACLE = GID.OBSTACLE, LANTERN = GID.LANTERN;
  // Two blocks exist only while playing; the mesher draws neither.
  //   OBSTACLE  fills the space a prop takes (palm trunks, the camel, the falcon's perch) so the player cannot walk through it
  //   LANTERN   a lantern the player has put down; it is drawn as the same small prop as the fort's lanterns
  BLOCKS[OBSTACLE] = { tiles: 'beam', kind: 'none' };
  BLOCKS[LANTERN] = { tiles: 'beam', kind: 'none' };
  NAMES[LANTERN] = 'فانوس'; DROP[LANTERN] = LANTERN;

  // ------------------------------------------------------------------ the controller's view of the world
  // shared/play.js walls the world in at x = 0 and z = 0, but this world's grid starts at (X0, Z0) < 0.
  // So the controller runs in its own coordinates, shifted to start at zero, and everything it reports
  // is shifted back here.
  const OX = X0, OZ = Z0;
  const pworld = { sx: SX, sy: SY, sz: SZ, get: (x, y, z) => world.get(x + OX, y, z + OZ), inb: (x, y, z) => world.inb(x + OX, y, z + OZ) };

  // The shared building kit lives in the controller's coordinates as well: it is told where blocks go in
  // those, and it puts its lamp and fire lights at the places it was told. The lights hang from a group
  // that carries the shift, so they shine where the blocks really are. Made before the first frame is
  // drawn: the number of lights in the scene never changes after that.
  const kitRoot = new THREE.Group();
  kitRoot.name = 'kitLights';
  kitRoot.position.set(OX, 0, OZ);
  scene.add(kitRoot);
  const kit = createKit({
    scene: kitRoot, world: pworld,
    // the kit lays and lifts the second half of a bed itself; whatever stands on or in that cell hears of it as for any other block
    terrain: { setBlock: (x, y, z, id) => { const done = pterrain.setBlock(x, y, z, id); if (done) { if (id) filled(x + OX, y, z + OZ); else gone(x + OX, y, z + OZ); } return done; } },
  });
  for (const l of kit.lights) l.layers.enable(1);   // the pool's mirror image is lit by the same set of lights

  await window.__shot('play');                       // afternoon light, the HUD and the mattock in hand, standing at the worksite
  stage.live = true;
  // Nothing in the scene moves on its own yet, so the shadow map is drawn again only when something
  // changed (a dig, a block put down, the light following the player) instead of every frame.
  renderer.shadowMap.autoUpdate = false;
  const redrawShadows = () => { renderer.shadowMap.needsUpdate = true; };
  redrawShadows();

  const kindOf = (id) => (id && BLOCKS[id] ? (BLOCKS[id].kind ?? 'solid') : 'air');
  const cube = (id) => kindOf(id) === 'solid';
  /** Anything that fills its cell for the player: a cube, or the kit's half blocks, beds and glass. */
  const built = (id) => { const k = kindOf(id); return k === 'solid' || k === 'slab' || k === 'translucent'; };
  const inCols = (x, z) => x >= X0 && x < X1 && z >= Z0 && z < Z1;
  const key = (x, y, z) => (y * SZ + (z - Z0)) * SX + (x - X0);

  // ------------------------------------------------------------------ props that depend on blocks
  const guard = new Map();          // ground that cannot be dug (something that cannot move stands on it) -> what the HUD calls it
  const onGone = new Map();         // cell -> what to do when its block is dug away
  const onFill = new Map();         // cell -> what to do when a block is put there
  const hook = (map, k, fn) => { const a = map.get(k); if (a) a.push(fn); else map.set(k, [fn]); };
  const run = (map, k) => { const a = map.get(k); if (a) { map.delete(k); for (const fn of a) fn(); } };
  /** Guard the ground block of column (xf, zf); with `tall`, also fill that many cells above it. */
  const protect = (xf, zf, label, tall = 0) => {
    const x = Math.floor(xf), z = Math.floor(zf);
    if (!inCols(x, z)) return;
    const t = W.top[colIndex(x, z)];
    if (t < 0) return;
    guard.set(key(x, t, z), label);
    for (let k = 1; k <= tall; k++) if (!world.get(x, t + k, z)) world.set(x, t + k, z, OBSTACLE);
  };
  /** First solid block at or under (x, y, z), a few cells down. */
  const under = (x, y, z) => { for (let k = 0; k < 4; k++) if (cube(world.get(x, y - k, z))) return [x, y - k, z]; return null; };
  /** The block a piece at (x, y, z) rests on: that cell, or the nearest solid one beside it. */
  const holder = (x, y, z) => {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) if (cube(world.get(x + dx, y, z + dz))) return [x + dx, y, z + dz];
    return null;
  };

  // merlons and timber are instanced props: one loses its block, it goes
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const drop = (mesh, i) => () => { mesh.setMatrixAt(i, ZERO); mesh.instanceMatrix.needsUpdate = true; redrawShadows(); };
  A.merlons.forEach((a, i) => {
    const x = Math.floor(a.x), y = Math.floor(a.y), z = Math.floor(a.z), hide = drop(merlons, i), s = holder(x, y - 1, z);
    if (s) hook(onGone, key(s[0], s[1], s[2]), hide);
    hook(onFill, key(x, y, z), hide);
  });
  {
    const poles = A.beams.filter((a) => !a.spout), spouts = A.beams.filter((a) => a.spout);
    const [poleMesh, spoutMesh, stainMesh] = beams.children;
    const wire = (a, hide, hideStain) => {
      const y = Math.floor(a.y), x = Math.floor(a.x - a.dx * 0.5), z = Math.floor(a.z - a.dz * 0.5);      // the wall block it is set in
      hook(onGone, key(x, y, z), hide);
      hook(onFill, key(Math.floor(a.x + a.dx * 0.5), y, Math.floor(a.z + a.dz * 0.5)), hide);
      if (hideStain) for (let k = 1; k < 4; k++) hook(onGone, key(x, y - k, z), hideStain);                // the run-off stain below a spout
    };
    poles.forEach((a, i) => wire(a, drop(poleMesh, i)));
    if (spoutMesh) spouts.forEach((a, i) => { const sp = drop(spoutMesh, i), st = drop(stainMesh, i); wire(a, () => { sp(); st(); }, st); });
  }
  // the fort's lanterns and the pennant go with the block that carries them
  for (const l of lanterns) {
    const a = l.anchor, x = Math.floor(a.x), z = Math.floor(a.z);
    if (a.wall === 'pole') { protect(a.x - 0.4, a.z, 'أرض المخيّم'); continue; }
    const s = a.wall === 'z' ? holder(x, Math.floor(a.y + 0.62), Math.floor(a.z - 0.5)) : a.wall === 'hang' ? holder(x, Math.floor(a.y + 1), z) : under(x, Math.floor(a.y), z);
    if (s) hook(onGone, key(s[0], s[1], s[2]), () => { l.group.visible = false; redrawShadows(); });
  }
  {
    const s = under(Math.floor(flag.position.x), Math.floor(flag.position.y) - 1, Math.floor(flag.position.z));
    if (s) hook(onGone, key(s[0], s[1], s[2]), () => { flag.visible = false; redrawShadows(); });
  }
  // palms: the trunk is solid and the block under it stays
  for (const p of A.palms) {
    const x = Math.floor(p.x), z = Math.floor(p.z);
    if (!inCols(x, z)) continue;
    protect(p.x, p.z, 'جذور نخلة');
    const [lx, lz] = p.lean || [0, 0];
    for (let y = W.top[colIndex(x, z)] + 1; y < p.y + p.h - 0.2 && y < SY; y++) {
      const u = Math.max(0, (y + 0.5 - p.y) / p.h), cx = Math.floor(p.x + lx * u * u), cz = Math.floor(p.z + lz * u * u);
      if (inCols(cx, cz) && !world.get(cx, y, cz)) world.set(cx, y, cz, OBSTACLE);
    }
  }
  // the camp: nobody digs the floor out from under the tent, the fire and the rugs
  for (const [obj, hw, hd] of campProps) {
    const c = Math.cos(obj.rotation.y), s = Math.sin(obj.rotation.y);
    for (let u = -hw; u <= hw + 1e-6; u += 0.45) for (let v = -hd; v <= hd + 1e-6; v += 0.45) protect(obj.position.x + c * u + s * v, obj.position.z - s * u + c * v, 'أرض المخيّم');
  }
  // the animals of the play shot stand where they are: solid, and their ground stays
  const seated = [];
  if (actors.camel.visible) {
    const o = actors.camel, [x, z, ry] = o.userData.seat, k = o.scale.x, fx = Math.sin(ry), fz = Math.cos(ry);
    const bb = new THREE.Box3();
    for (const m of o.children) if (m.isMesh) { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox); }
    for (let d = bb.min.z + 0.3; d <= bb.max.z - 0.3; d += 0.4) for (let w = bb.min.x + 0.1; w <= bb.max.x - 0.1; w += 0.3) protect(x + (fx * d + fz * w) * k, z + (fz * d - fx * w) * k, 'تحت الذلول', 2);
    seated.push(o);
  }
  if (actors.falcon.visible) { const o = actors.falcon, [x, z] = o.userData.seat; protect(x, z, 'تحت الصقر', 2); seated.push(o); }
  /** Stand the animals on the ground again after it changed shape near them. */
  const reseat = (x, z) => {
    for (const o of seated) { const s = o.userData.seat; if (Math.abs(s[0] - x) < 5 && Math.abs(s[1] - z) < 5) place(o, s[0], s[1], s[2], s[3], s[4]); }
  };

  // ------------------------------------------------------------------ edits, as the controller makes them
  // This world's own water (the pool, the falaj) is the only water that moves. The kit's water is a block
  // like any other: it stays where it is put and never sets this rule off.
  const wet = (x, y, z) => world.get(x, y, z) === B.WATER;
  const SPREAD = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  /** Water at (x, y, z) runs into the open cells it can reach without rising, a bounded number of them. */
  function flood(x, y, z) {
    const todo = [x, y, z];
    for (let i = 0, n = 0; i < todo.length && n < 96; i += 3) {
      for (const [dx, dy, dz] of SPREAD) {
        const qx = todo[i] + dx, qy = todo[i + 1] + dy, qz = todo[i + 2] + dz;
        if (qy < 1 || !world.inb(qx, qy, qz) || world.get(qx, qy, qz) !== 0) continue;
        terrain.setBlock(qx, qy, qz, B.WATER);
        todo.push(qx, qy, qz);
        if (++n >= 96) break;
      }
    }
  }
  const pterrain = {
    setBlock(x, y, z, id) {
      x += OX; z += OZ;
      // A hole dug beside or under water fills up, and the water runs on into whatever dry digging it
      // now reaches. There is no other water simulation: it never drains and nothing flows by itself.
      const fill = id === 0 && built(world.get(x, y, z)) && (wet(x, y + 1, z) || wet(x + 1, y, z) || wet(x - 1, y, z) || wet(x, y, z + 1) || wet(x, y, z - 1));
      const done = terrain.setBlock(x, y, z, fill ? B.WATER : id);
      if (done && fill) flood(x, y, z);
      return done;
    },
    flush() { const n = terrain.flush(); if (n) redrawShadows(); return n; },
    liveChunks: () => terrain.liveChunks(),
  };
  const eyes = new THREE.Object3D();                 // the controller moves this; the real camera follows it, shifted back

  // spawn: where the play shot stands, feet on the block grid, crosshair on the same block of the wall
  const wt = A.work.target, sx = camera.position.x, sz = camera.position.z;
  const solidAt = (x, y, z) => { const id = world.get(Math.floor(x), y, Math.floor(z)); return id === OBSTACLE || cube(id); };
  let fy = Math.round(camera.position.y - EYE);
  while (solidAt(sx, fy, sz)) fy++;
  while (fy > 1 && !solidAt(sx, fy - 1, sz)) fy--;
  const ax = wt[0] + 0.5 - sx, ay = wt[1] + 0.5 - (fy + EYE), az = wt[2] + 1.0 - sz;

  const SLOT_ID = { sand: B.SAND, stone: B.ROCK_A, brick: B.BRICK, wood: B.WOOD, lantern: LANTERN };
  const ownItems = () => SLOTS.map((q) => ({ ...q, id: SLOT_ID[q.key] ?? 0 }));
  // The belt. The bag may put any item in any square, so nothing below goes by a square's number:
  // what a square does follows the item that is in it now.
  const slots = ownItems().slice(0, hud.shown);

  // ------------------------------------------------------------------ the highlight on the targeted block
  // On untouched sand the block's top is the sloped dune surface, so the frame follows it.
  const boxPos = targetBox.geometry.attributes.position, boxHome = boxPos.array.slice();
  targetBox.frustumCulled = false;
  // A half block or a bed is framed at its own height, and a lantern standing on one is framed where it stands.
  function frameBlock(x, y, z, id) {
    const lamp = id === LANTERN ? lamps.get(key(x, y, z)) : null;
    targetBox.position.set(x + 0.5, y + 0.5 - (lamp ? lamp.sunk : 0), z + 0.5);
    const ci = colIndex(x, z), sloped = W.nat[ci] === 1 && W.top[ci] === y, a = boxPos.array, tall = kit.heightOf(id);
    for (let i = 0; i < a.length; i += 3) {
      let py = boxHome[i + 1];
      if (py > 0) {
        if (tall < 1) py = tall - 0.5 + 0.006;
        else if (sloped) { const k = cornerIndex(x + (boxHome[i] > 0 ? 1 : 0), z + (boxHome[i + 2] > 0 ? 1 : 0)); if (W.smooth[k]) py = W.hc[k] - (y + 0.5) + 0.006; }
      }
      a[i + 1] = py;
    }
    boxPos.needsUpdate = true;
  }

  // ------------------------------------------------------------------ lanterns the player puts down
  const lamps = new Map();          // cell -> { l, x, y, z, hold, sunk }   sunk: how far below its cell's floor it stands (on a half block or a bed)
  const lampsOn = new Map();        // the block that carries them -> [cells]
  function putLantern(x, y, z, h) {
    // h: the face it was put against, in the controller's coordinates
    let nx = 0, ny = 1, nz = 0, hold = key(x, y - 1, z), sunk = 0;
    if (h && !(h.x + OX === x && h.y === y && h.z + OZ === z)) { nx = h.nx; ny = h.ny; nz = h.nz; hold = key(h.x + OX, h.y, h.z + OZ); }
    let l;
    if (ny > 0) {                                    // standing on the ground (on the dune surface where the sand is untouched, on the real top of a half block or a bed)
      const ci = colIndex(x, z), dune = W.nat[ci] === 1 && W.top[ci] === y - 1;
      if (!dune) sunk = 1 - kit.heightOf(world.get(x, y - 1, z));
      l = buildLantern({ x: x + 0.5, y: (dune ? W.surfaceY(x + 0.5, z + 0.5) : y - sunk) + 0.21, z: z + 0.5 });
    } else if (ny < 0) {                             // hanging under a block on a short chain
      l = buildLantern({ x: x + 0.5, y: y + 0.45, z: z + 0.5 });
      const chain = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), l.group.children[1].material);
      chain.position.y = 0.455; chain.castShadow = true; l.group.add(chain);
    } else {                                         // on a wall, from a bracket like the ones at the gate
      l = buildLantern({ x: x + 0.5, y: y + 0.3, z: z + 0.5, wall: 'z' });
      l.group.rotation.y = Math.atan2(nx, nz);
    }
    lightLantern(l, rig.lamp ?? 0);
    scene.add(l.group);
    const k = key(x, y, z);
    lamps.set(k, { l, x, y, z, hold, sunk });
    hook(lampsOn, hold, k);
    redrawShadows();
  }
  function takeLantern(k) {
    const e = lamps.get(k);
    if (!e) return;
    lamps.delete(k);
    scene.remove(e.l.group);
    e.l.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } else if (o.isSprite) o.material.dispose(); });
    const a = lampsOn.get(e.hold);
    if (a) a.splice(a.indexOf(k), 1);
    redrawShadows();
  }
  /** The block that carried lanterns is gone: they go back on the belt, into whichever square holds lanterns now. */
  function lanternsOff(k) {
    const a = lampsOn.get(k);
    if (!a) return;
    lampsOn.delete(k);
    for (const lk of a) {
      const e = lamps.get(lk);
      if (!e) continue;
      terrain.setBlock(e.x, e.y, e.z, 0); takeLantern(lk);
      const q = slots.find((s) => s.id === LANTERN);
      if (q) q.n = Math.min(999, (q.n || 0) + 1);
    }
    hud.setSlots(slots, play.state.sel);
  }
  /** What every prop is told when the block at (x, y, z) goes, whoever took it away. */
  function gone(x, y, z) {
    const k = key(x, y, z);
    run(onGone, k);
    lanternsOff(k);
    reseat(x, z);
  }
  /** ... and when a block is put there. */
  function filled(x, y, z) {
    run(onFill, key(x, y, z));
    reseat(x, z);
  }

  // ------------------------------------------------------------------ the arm and the mattock
  // The held tool hangs from a joint at the elbow, so a swing turns the forearm and the tool together.
  const ELBOW = new THREE.Vector3(1.04, -0.98, -0.5);
  const arm = new THREE.Group();
  arm.position.copy(held.position).add(ELBOW);
  held.position.copy(ELBOW).negate();
  camera.add(arm); arm.add(held);
  const armHome = arm.position.clone();
  const heldBlock = createHeld({ camera, blocks: BLOCKS, materialFor: ctx.materialFor });
  const sun0 = rig.sun.target.position;              // where the play shot centred the shadow map
  let swing = 0, push = 0, stride = 0, sway = 0, hintT = 0, shadowAt = { x: sun0.x, y: sun0.y, z: sun0.z };

  let life = null, weather = null, status = null;
  let vitals = null;                                 // made once the HUD is up; the first frames run without it
  const play = createPlay({
    camera: eyes, canvas: stage.canvas, world: pworld, blocks: BLOCKS, terrain: pterrain,
    spawn: { x: sx - OX, y: fy, z: sz - OZ, yaw: Math.atan2(-ax, -az), pitch: Math.atan2(ay, Math.hypot(ax, az)) },
    slots, touch: hud.touch ? hud.els : null, maxPixelRatio: 2,
    isLiquid: (id) => id === B.WATER || kit.isLiquid(id),
    isSolid: (id) => id === OBSTACLE || (BLOCKS[id] && BLOCKS[id].solid != null ? BLOCKS[id].solid : built(id)),      // a door says for itself (shut: solid, open: not)
    heightOf: kit.heightOf,
    pickable: (id) => id === LANTERN || built(id) || kindOf(id) === 'cross' || !!(BLOCKS[id] && BLOCKS[id].pick),
    // The item in the selected square decides, wherever the bag has put it: the spade is quick in loose
    // ground and slow in rock; the mattock, and anything else in the hand, is the all-rounder. Kit blocks
    // come away the same in every world.
    hardness: (id) => {
      const k = kit.hardness(id);
      if (k !== null) return k;
      if (kindOf(id) === 'cross') return 0.08;
      if (id === LANTERN) return 0.15;
      const item = slots[play.state.sel], spade = !!item && item.key === 'spade';
      if (LOOSE.has(id)) return spade ? 0.16 : 0.32;
      if (ROCK.has(id)) return spade ? 1.3 : 0.75;
      if (id === B.THATCH) return 0.25;
      return spade ? 0.8 : 0.5;
    },
    dropOf: (id) => DROP[id] || kit.dropOf(id),
    // not under something that cannot move, and not in the outermost rows (the far-terrain sheet starts under them)
    canBreak: (id, x, y, z) => { x += OX; z += OZ; return !guard.has(key(x, y, z)) && x >= X0 + 6 && x < X1 - 6 && z >= Z0 + 6 && z < Z1 - 6; },
    onTarget(h) {
      targetBox.visible = !!h;
      if (!h) { hud.setTarget(null); return; }
      const x = h.x + OX, z = h.z + OZ;
      frameBlock(x, h.y, z, h.id);
      hud.setTarget(guard.get(key(x, h.y, z)) ?? NAMES[h.id] ?? (kit.nameOf(h.id) || 'مكعب'));
    },
    onBreak(h) {
      const x = h.x + OX, z = h.z + OZ;
      if (h.id === LANTERN) takeLantern(key(x, h.y, z));
      kit.broke(h);
      // a fire that burned on the block went with it (the controller clears a plant off a dug block without a word): its light goes too
      const up = h.x + ',' + (h.y + 1) + ',' + h.z;
      if (kit.glow.has(up) && pworld.get(h.x, h.y + 1, h.z) === 0) kit.broke({ x: h.x, y: h.y + 1, z: h.z, id: kit.glow.get(up) });
      gone(x, h.y, z);
    },
    onPlace(px, y, pz, id) {
      const x = px + OX, z = pz + OZ, was = px + ',' + y + ',' + pz;
      if (kit.glow.has(was)) kit.broke({ x: px, y, z: pz, id: kit.glow.get(was) });      // the block took the place of a fire
      if (id === LANTERN) putLantern(x, y, z, play.state.hit);
      kit.placed(px, y, pz, id, play.state.yaw);
      filled(x, y, z);
      push = 1;
    },
    onInventory(list, sel) {
      hud.setSlots(list, sel);
      const it = list[sel], block = it && it.id && ((!it.tool && BLOCKS[it.id]) || it.model) ? it.id : 0;      // a block in the selected square is what the hand shows
      arm.visible = !heldBlock.show(block);
    },
    onBag() { bag.toggle(); },
    onInteract: (h) => bag.interact(h),
    onMenu() { if (weather) weather.toggle(); },
    onUse: (item) => (life ? life.use(item) : false),
    onFly(on) { play.notice(on ? (hud.touch ? 'الطيران شغّال. زر القفز يطلّعك، وادفع العصا تطير وين ما تطالع. القفز مرّتين يوقفه.' : 'الطيران شغّال. المسافة تطلّعك وShift ينزّلك. المسافة مرّتين توقفه.') : 'وقف الطيران.', false, on ? 4500 : 1800); },
    onUnlock() { play.stop(); panel.show('pause'); },
    onFirstLook() { hud.els.look.hidden = true; },
    onFrame(st, dt) {
      const p = st.pos, px = p.x + OX, pz = p.z + OZ;
      camera.position.set(eyes.position.x + OX, eyes.position.y, eyes.position.z + OZ);
      camera.quaternion.copy(eyes.quaternion);
      camera.updateMatrixWorld(true);
      hud.setProgress(st.dig.on ? st.dig.progress : 0);
      kit.update(p, dt, st.time);
      if (vitals) vitals.update(dt);
      if (life) life.update(dt);
      if (weather) weather.update(dt);
      if (status) status.update();
      hud.setHeading(((Math.round(-st.yaw * 360 / Math.PI) / 2) % 360 + 360) % 360);
      // the mattock: raised, brought down on the block, and back, for as long as the dig is held; a short
      // dip when a block goes down. `a` turns the forearm about the elbow: + up and back, - forward and down.
      const digging = play.input.dig;
      if (digging || swing > 0) { swing += dt / 0.44; if (swing >= 1) swing = digging ? swing % 1 : 0; }
      let a = 0;
      if (swing < 0.45) a = 0.38 * ease(swing / 0.45);
      else if (swing < 0.6) { const k = (swing - 0.45) / 0.15; a = 0.38 - 0.54 * k * k; }
      else a = -0.16 * (1 - ease((swing - 0.6) / 0.4));
      if (push > 0) { push = Math.max(0, push - dt / 0.22); a -= 0.13 * Math.sin(push * Math.PI); }
      arm.rotation.set(a, -a * 0.5, a * 0.1);
      // a light sway with each step
      sway += ((st.onGround ? Math.min(1, st.moving / 4) : 0) - sway) * Math.min(1, dt * 8);
      stride += dt * Math.min(st.moving, 7) * 1.55;
      arm.position.set(armHome.x + Math.sin(stride) * 0.012 * sway, armHome.y + Math.abs(Math.cos(stride)) * 0.016 * sway - 0.006 * sway, armHome.z);
      WATER_U.uTime.value = st.time;
      // keep the shadow map centred near the player
      if (Math.hypot(px - shadowAt.x, pz - shadowAt.z) > 16 || Math.abs(p.y - shadowAt.y) > 14) {
        shadowAt = { x: Math.round(px / 4) * 4, y: Math.round(p.y), z: Math.round(pz / 4) * 4 };
        aimShadow(shadowAt.x, shadowAt.y, shadowAt.z, 60, 300);
        redrawShadows();
      }
      if (hud.touch && hintT >= 0 && (hintT += dt) > 7) { hud.els.look.hidden = true; hintT = -1; }
    },
    stage, render: () => stage.render(),
    setPixelRatio: (pr) => { stage.pixelRatio = pr; stage.resize(); },
  });
  // The moment the mouse is captured, a browser can report one move with a huge jump (the headless one
  // the tests run in does: the pointer snaps to a corner), and if that move arrives after the capture
  // is announced the controller would spin the view with it. Mouse movement in the first instant after
  // capture is dropped here, before the controller's own listener sees it.
  let lockedAt = -1;
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== stage.canvas) { lockedAt = -1; return; }
    const now = performance.now();
    if (lockedAt < 0) lockedAt = now;
    if (now - lockedAt < 90) e.stopImmediatePropagation();
  }, true);
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== stage.canvas) lockedAt = -1; else everLocked = true; });
  // Closing the bag captures the mouse again, and a browser refuses a burst of such requests (Chrome: a
  // fifth one within a few seconds, "too many pointer lock requests"). The controller reads any refusal as
  // "this browser cannot capture the mouse" and falls back to drag-to-look for good. Once the mouse has
  // been captured in this session that is not what a refusal means, so it is kept from the controller:
  // the mouse stays free, and the next click on the game captures it, as the first one did.
  let everLocked = false;
  {
    const canvas = stage.canvas, ask = canvas.requestPointerLock ? canvas.requestPointerLock.bind(canvas) : null;
    const refused = () => play.notice('انقر مرّة على اللعبة عشان ترجع الفأرة.', false, 5000);
    if (ask) canvas.requestPointerLock = (...a) => {
      let r;
      try { r = ask(...a); } catch (e) { if (!everLocked) throw e; refused(); return undefined; }
      return r && r.catch ? r.catch((e) => { if (!everLocked) throw e; refused(); }) : r;
    };
    window.addEventListener('pointerlockerror', (e) => { if (everLocked) { e.stopImmediatePropagation(); refused(); } }, true);
  }

  hud.setSlots(slots, 0);
  hud.setTarget(null);
  hud.els.belt.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-i]');
    if (!el || !play.state.running) return;
    if (+el.dataset.i < slots.length) play.select(+el.dataset.i);
    e.preventDefault();
  });
  hud.els.pause.addEventListener('click', () => { if (play.state.running) { play.stop(); panel.show('pause'); } });

  // the bag (E, or its button on a phone): this world's own things first, then the building kit
  const KUFI = "'Reem Kufi', 'Tajawal', sans-serif", BODY = "'Tajawal', sans-serif";
  const bag = createBag({
    play, kit, camera, world: 'waha', shown: hud.shown, onMenu: () => { play.stop(); panel.show('pause'); },
    mats: { wood: { ids: [B.WOOD], name: 'خشب' }, stone: { ids: [B.ROCK_A, B.BRICK], name: 'حجر أو طوب' }, ore: { ids: [B.SAND], name: 'رمل (يصفّى منه الذهب)' } },
    groups: [{ title: 'عدّة الواحة', items: ownItems() }, ...KIT_GROUPS],
    iconOf: hud.icon,
    fontFamily: BODY, accent: '#efd9a0', line: 'rgba(201, 163, 90, .85)',
    extra: { label: 'الوقت والجو', onClick: () => weather && weather.open() },
  });
  // a tap, not a press: the finger is up again before the bag is under it, so the same touch cannot pick an item
  hud.els.bag.addEventListener('click', () => { if (play.state.running) bag.toggle(); });

  const panel = createPlayPanel({
    title: 'واحة', tagline: 'احفر الرمل، ابنِ بالطوب، وعمّر حصنك عند الواحة.',
    fontFamily: BODY, accent: '#efd9a0', line: 'rgba(201, 163, 90, .85)', touch: hud.touch,
    note: 'نسخة تجريبية: الوقت والمطر والوحوش تختارها من لوحة Q (وعلى الجوال من زر داخل الحقيبة). التقدّم ما ينحفظ.',
    onStart() { if (hud.touch) goImmersive(); else play.lock(); play.start(); },
  });
  for (const el of panel.el.querySelectorAll('h1, button')) el.style.fontFamily = KUFI;      // headings in the HUD's kufi
  panel.show('start');
  window.__play = play;
  // world and terrain are the controller's (zero-based) view; W is the world itself and origin the shift between them
  // health and water are real: thirst grows in the heat (faster running) and standing in water quenches it
  const vq = (sel) => document.querySelector('#hud .vital.' + sel);
  const write = { hp: bars.segments([...vq('hp').querySelectorAll('.v-bar i')], vq('hp .v-num')), wt: bars.segments([...vq('wt').querySelectorAll('.v-bar i')], vq('wt .v-num')) };
  vitals = createVitals({
    play, kit, world: pworld, hp: 82,
    needs: [{ key: 'wt', start: 57, drain: 0.28, run: 1.9, how: 'water', gain: 14, rain: 3, nightDrain: 0.5, low: 'عطشت. انزل بركة الواحة أو أي ماي واشرب.' }],
    render(v) { write.hp(v.hp); write.wt(v.wt); },
  });
  // creatures: oryx graze and can be hunted; sand wraiths and rock scorpions come for the player
  life = createLife({
    scene: stage.scene, camera: stage.camera, play, world: pworld, vitals: () => vitals, offset: { x: OX, z: OZ },
    kinds: [
      { key: 'oryx', name: 'المها', kind: 'animal', make: () => buildOryx(), hp: 12, speed: 2.0, radius: 0.8, height: 1.5, max: 3, drops: [[200, 2], [201, 1]] },
      ...extraKinds('waha'),
      { key: 'wraith', name: 'غول الرمال', kind: 'monster', make: () => buildWraith(2), hp: 16, speed: 2.6, radius: 0.8, height: 2.1, max: 2, dmg: 8 },
      { key: 'scorpion', name: 'عقرب الصخر', kind: 'monster', make: () => buildScorpion(), hp: 18, speed: 2.2, radius: 1.1, height: 1.0, max: 1, dmg: 10 },
    ],
  });
  // hearts, food, armour and experience over the belt; the old health row gives way to the hearts
  status = createStatus({ play, mount: document.querySelector('#hud .belt-wrap'), vitals: () => vitals, life: () => life, accent: '#efd9a0', hide: [vq('hp')] });
  // the world panel (Q): the hour of the day, clear or rain. In rain the water skin fills by itself; the night is cooler
  const TIME_OF = { morning: ['afternoon', { sunAz: 124, sunEl: 24, sunColor: '#ffe9cc' }], noon: ['afternoon', { sunAz: -141, sunEl: 31 }], sunset: ['golden', {}], night: ['night', {}] };
  const CLOCK = { morning: 'الصبح · 7:30', noon: 'العصر · 4:40', sunset: 'المغرب · 6:20', night: 'الليل · 11:00' };
  weather = createWeather({
    play, scene: stage.scene, camera: stage.camera, time: 'noon', times: [['morning', 'الصبح'], ['noon', 'العصر'], ['sunset', 'المغرب'], ['night', 'الليل']],
    fontFamily: BODY, accent: '#efd9a0', line: 'rgba(201, 163, 90, .85)',
    apply(time, rain) {
      const [name, over] = TIME_OF[time];
      setTime(name, over);
      if (rain) {
        rig.sun.intensity *= 0.4; rig.hemi.intensity *= 0.85;
        ATM.uFog.value.x *= 2.6; ATM.uCloud.value.x = 0.95; ATM.uSunDisc.value.z = 0;
        ATM.uSkyGain.value *= 0.6;                     // a grey lid over the desert
        rig.post.final.uniforms.uExposure.value *= 0.86;
      }
      aimShadow(shadowAt.x, shadowAt.y, shadowAt.z, 60, 300);
      redrawShadows();
      document.querySelector('#hud .day .d-txt span').textContent = (rain ? 'مطر · ' : '') + CLOCK[time];
    },
  });
  weather.el.querySelector('h2').style.fontFamily = KUFI;
  window.__game = { play, panel, terrain: pterrain, world: pworld, B, slots, W, origin: [OX, OZ], bag, kit, camera: stage.camera, vitals, life, weather, status };
}
