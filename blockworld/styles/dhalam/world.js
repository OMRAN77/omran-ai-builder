// World generation for "dhalam": a cold highland valley with a lake, a ruined keep on a crag,
// pine forest, exposed ore veins and a survivor's shelter. Also bakes voxel lighting
// (sky occlusion + flood-filled fire light) into vertex attributes, the way a block game would.

import * as THREE from 'three';
import { VoxelWorld, buildVoxelMeshes, createVoxelTerrain } from '../../shared/voxel.js';
import { makeNoise, hash3 } from '../../shared/noise.js';

export const SX = 160, SY = 84, SZ = 160, WL = 15;

export const B = {
  ROCK: 1, ROCK_MOSS: 2, SNOW: 3, LITTER: 4, HEATH: 5, SOIL: 6, GRAVEL: 7, PATH: 8, ASH: 9,
  TRUNK: 10, NEEDLES: 11, BRICK: 12, BRICK_MOSS: 13, PLANKS: 14, STAKE: 15, ORE_IRON: 16, ORE_GLOW: 17,
  WATER: 18, FERN: 19, DRYGRASS: 20, REEDS: 21,
};

export const BLOCKS = {
  [B.ROCK]: { tiles: { top: 'rockTop', side: 'rockSide', bottom: 'rockSide' } },
  // rock tops share one material: moss is blended in by a world-space mask in the shader, so it
  // grows in organic patches and in the cracks instead of filling whole blocks
  [B.ROCK_MOSS]: { tiles: { top: 'rockTop', side: 'rockSideMoss', bottom: 'rockSide' } },
  [B.SNOW]: { tiles: { top: 'snow', side: 'rockSide', bottom: 'rockSide' } },
  [B.LITTER]: { tiles: { top: 'litter', side: 'soil', bottom: 'soil' } },
  [B.HEATH]: { tiles: { top: 'heath', side: 'soil', bottom: 'soil' } },
  [B.SOIL]: { tiles: 'soil' },
  [B.GRAVEL]: { tiles: 'gravel' },
  [B.PATH]: { tiles: { top: 'path', side: 'soil', bottom: 'soil' } },
  [B.ASH]: { tiles: { top: 'ash', side: 'soil', bottom: 'soil' } },
  [B.TRUNK]: { tiles: { top: 'barkTop', side: 'bark', bottom: 'barkTop' } },
  [B.NEEDLES]: { tiles: 'needles', kind: 'cutout', occludes: true },
  [B.BRICK]: { tiles: { top: 'brickTop', side: 'brick', bottom: 'brick' } },
  [B.BRICK_MOSS]: { tiles: { top: 'brickTop', side: 'brickMoss', bottom: 'brick' } },
  [B.PLANKS]: { tiles: 'planks' },
  // palisade cell: holds a row of sharpened logs drawn as a block model (props.js); it still shades
  // its neighbours and stops light like a solid block
  [B.STAKE]: { tiles: 'bark', kind: 'none', occludes: true },
  [B.ORE_IRON]: { tiles: 'oreIron' },
  [B.ORE_GLOW]: { tiles: 'oreGlow' },
  [B.WATER]: { tiles: 'water', kind: 'liquid' },
  [B.FERN]: { tiles: 'fern', kind: 'cross', height: 0.95, shade: 0.55 },
  [B.DRYGRASS]: { tiles: 'dryGrass', kind: 'cross', height: 0.9, shade: 0.5 },
  [B.REEDS]: { tiles: 'reeds', kind: 'cross', height: 1.5, shade: 0.55 },
};

/** World-space UV scale per tile: 0.5 = one texture spans two blocks. */
export const UV_SCALE = { bark: 1, barkTop: 1, water: 0.2 };

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// --- layout -------------------------------------------------------------------------------------
// Valley frame: u runs along the valley from its head (where the hero camera stands) to the north,
// v across it (positive to the east).
const AZ = 42 * Math.PI / 180;
export const VAL = { ox: 30, oz: 150, dx: Math.sin(AZ), dz: -Math.cos(AZ), rx: Math.cos(AZ), rz: Math.sin(AZ) };
export const toUV = (x, z) => [(x - VAL.ox) * VAL.dx + (z - VAL.oz) * VAL.dz, (x - VAL.ox) * VAL.rx + (z - VAL.oz) * VAL.rz];
export const fromUV = (u, v) => [VAL.ox + u * VAL.dx + v * VAL.rx, VAL.oz + u * VAL.dz + v * VAL.rz];

const pt = (u, v) => { const [x, z] = fromUV(u, v); return { x: Math.round(x), z: Math.round(z) }; };
export const SITE = {
  keep: { ...pt(125, -27), y: 43 },
  shelter: { ...pt(58, 16), y: 19 },
  lake: { u: 91, v: -2, ru: 28, rv: 18 },
  ledge: { ...pt(1, 3), y: 34 },
  stage: { u: 53, v: -4.5, hu: 11, hv: 10.5, y: WL + 2 },      // open shore at the near end of the lake
};
/** Forest edge facing the shelter gate: where the night shot looks from. */
export const WATCH = { u: 47.5, v: -25.5, gate: [61.6, 9.6] };
/** Valley coordinates of a point `ahead` metres toward the gate and `right` metres to the side of the watch spot. */
export function watchRel(ahead, right) {
  const du = WATCH.gate[0] - WATCH.u, dv = WATCH.gate[1] - WATCH.v, L = Math.hypot(du, dv), a = du / L, b = dv / L;
  return [WATCH.u + ahead * a - right * b, WATCH.v + ahead * b + right * a];
}
function watchCoords(x, z) {
  const [u, v] = toUV(x, z);
  const du = WATCH.gate[0] - WATCH.u, dv = WATCH.gate[1] - WATCH.v, L = Math.hypot(du, dv), a = du / L, b = dv / L;
  const eu = u - WATCH.u, ev = v - WATCH.v;
  return [eu * a + ev * b, -eu * b + ev * a];
}
/** Where the hero camera stands (valley coordinates) and the pines that frame its view: [u, v, height, dead top]. */
export const HERO_CAM = { u: -5, v: 3 };
const HERO_TREES = [[13.6, -12.6, 16, false], [10.8, 15.4, 16, false]];
/** Pines near the gate, seen from the play view: [metres out from the gate, metres right of its axis, height]. */
const PLAY_TREES = [[-2.6, 15.5, 8]];        // a young one: from the ledge it stays below the palisade tops
/** A few hand-set pines at the watch spot: [ahead, right, height]. */
const WATCH_TREES = [[6.3, -5.0, 18], [9.4, 6.6, 21], [3.6, 7.4, 19], [13.5, 11.0, 12], [-2.5, -5.5, 17], [-4, 3.2, 15]];

/** 0..1 inside the open shore clearing. */
export function stageMask(x, z, grow = 0) {
  const [u, v] = toUV(x, z);
  const S = SITE.stage;
  return sstep(S.hu + 3 + grow, S.hu + grow, Math.abs(u - S.u)) * sstep(S.hv + 3 + grow, S.hv + grow, Math.abs(v - S.v));
}

const noise = makeNoise(20261);
const noiseB = makeNoise(977);

/** Continuous terrain height; also used for the low-detail distant terrain outside the voxel area. */
export function terrainH(x, z) {
  const [u, v] = toUV(x, z);
  const n1 = noise.fbm2(x / 46, z / 46, 4);
  const n2 = noise.ridge2(x / 74 + 3.1, z / 74 - 1.7, 4);
  const n3 = noiseB.fbm2(x / 17, z / 17, 3);
  const av = Math.abs(v) * (v < 0 ? 1.0 : 0.92);
  const side = sstep(13, 96, av + n1 * 13);
  let h = 13.5 + 41 * Math.pow(side, 1.1);
  h += 20 * Math.pow(sstep(70, -6, u), 1.3);                  // valley head, where we stand
  h += 7 * sstep(118, 190, u) * (1 - side * 0.5);             // the floor climbs to a pass in the north
  h += n1 * 7 * (0.35 + side) + (n2 - 0.45) * 17 * side + n3 * 1.6 * (0.4 + side);

  // lake basin
  const L = SITE.lake;
  const ld = Math.hypot((u - L.u) / L.ru, (v - L.v) / L.rv) + n1 * 0.22 + n3 * 0.05;
  const lm = sstep(1.22, 0.9, ld);
  h = lerp(h, WL + 1.6 - 8 * sstep(1.0, 0.5, ld), lm);

  // crag carrying the keep: steep mesa
  const K = SITE.keep;
  const kd = Math.hypot((x - K.x) / 21, (z - K.z) / 15) + n3 * 0.07 + n1 * 0.05;
  const km = sstep(1.42, 0.86, kd);
  // three sheer rock bands with narrow ledges between them
  const NB = 3, kf = Math.pow(km, 0.75) * NB, kfl = Math.floor(kf), kfr = kf - kfl;
  const kt = Math.min(1, (kfl + sstep(0.6, 0.9, kfr)) / NB);
  h = lerp(h, K.y + n3 * 0.5, kt);
  // talus at the foot of the crag
  h += 5 * sstep(1.9, 1.2, kd) * (1 - km) * (1 - lm * 0.6);

  // shelter terrace
  const S = SITE.shelter;
  const sd = Math.hypot(x - S.x, z - S.z);
  h = lerp(h, S.y + 0.4, sstep(19, 10.5, sd + n3 * 1.5));

  // open, level shore on the east side of the lake
  h = lerp(h, SITE.stage.y + 0.3, stageMask(x, z));

  // the forest edge beside it is level too (the watch spot of the night shot)
  { const [wu, wv] = [u - 51.5, v + 21]; h = lerp(h, SITE.stage.y + 0.3, sstep(12.5, 8, Math.hypot(wu, wv))); }

  // rock ledge at the valley head: a flat slab with a crisp rim and a sheer drop toward the valley
  const G = SITE.ledge;
  const gd = Math.hypot(x - G.x, z - G.z);
  const rim = ledgeRim(x, z);
  if (gd < rim) h = G.y + 0.4;
  else {
    h = lerp(h, G.y + 0.4, sstep(rim + 6, rim, gd));
    const [gu] = toUV(G.x, G.z);
    // on the valley side the ground falls away at once
    if (u - gu > -1.5) h = lerp(Math.min(h, G.y - 2.6 - (gd - rim) * 0.75 + n3 * 0.8), h, sstep(rim + 3, rim + 9, gd));
  }
  return h;
}
/** Radius of the ledge slab in the direction of (x, z). */
export function ledgeRim(x, z) {
  const G = SITE.ledge;
  const a = Math.atan2(z - G.z, x - G.x);
  return 6.3 + 1.1 * Math.sin(a * 3 + 1.2) + 0.5 * Math.sin(a * 7 + 0.4);
}

/** 0..1: how rocky/cliffy the column is, before slope is known. */
function rockiness(x, z, h) {
  const [, v] = toUV(x, z);
  const n = noiseB.fbm2(x / 30 + 9, z / 30 - 4, 3);
  return sstep(0.1, 0.5, n + (h - 40) / 40 + (v > 30 ? 0.12 : 0));
}

export function generateWorld() {
  const world = new VoxelWorld(SX, SY, SZ);
  const H = new Int16Array(SX * SZ);
  const hf = (x, z) => H[Math.min(SX - 1, Math.max(0, x)) + SX * Math.min(SZ - 1, Math.max(0, z))];

  // heights, with terraced cliffs where the ground is rocky
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    let h = terrainH(x, z);
    let rk = rockiness(x, z, h);
    const kdd = Math.hypot((x - SITE.keep.x) / 21, (z - SITE.keep.z) / 15);
    if (rk > 0 && h > WL + 3 && kdd > 1.5) {
      const step = 6;
      const f = h / step, fl = Math.floor(f), fr = f - fl;
      const terr = (fl + sstep(0.55, 0.95, fr)) * step;
      h = lerp(h, terr, rk * 0.75);
    }
    H[x + SX * z] = Math.max(2, Math.min(SY - 26, Math.round(h)));
  }

  const meta = { H, hf, trees: [], stumps: [], lights: [] };
  const K = SITE.keep, S = SITE.shelter;

  // columns
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    const h = hf(x, z);
    const slope = Math.max(Math.abs(hf(x + 1, z) - h), Math.abs(hf(x - 1, z) - h), Math.abs(hf(x, z + 1) - h), Math.abs(hf(x, z - 1) - h));
    const rk = rockiness(x, z, h);
    const r1 = hash3(x, 3, z, 5), r2 = hash3(x, 9, z, 7);
    const kd = Math.hypot((x - K.x) / 21, (z - K.z) / 15);
    const sd = Math.hypot(x - S.x, z - S.z);
    let kind;
    if (h <= WL) kind = 'bed';
    else if (h <= WL + 1 && sd > 12) kind = r1 < 0.8 ? 'gravel' : 'rock';
    else if (slope >= 3 || rk > 0.62 + r1 * 0.2 || (kd < 1.5 && slope >= 2)) kind = 'rock';
    else if (kd < 1.0) kind = 'court';
    else kind = 'forest';
    const stg = h > WL && stageMask(x, z) > 0.5;
    if (stg) kind = 'stage';
    const ld = Math.hypot(x - SITE.ledge.x, z - SITE.ledge.z);
    const onLedge = ld < ledgeRim(x, z) + 2.5;
    if (onLedge) kind = 'rock';
    const clearing = noiseB.fbm2(x / 21 - 5, z / 21 + 8, 3);
    for (let y = 0; y <= h; y++) {
      let id = B.ROCK;
      const d = h - y;
      if (kind === 'bed') id = d < 2 ? (r1 < 0.6 ? B.GRAVEL : B.SOIL) : B.ROCK;
      else if (kind === 'gravel') id = d < 2 ? B.GRAVEL : B.ROCK;
      else if (kind === 'rock') {
        if (d === 0 && onLedge) id = B.ROCK;
        else if (d === 0) {
          if (h > 55 + r2 * 5) id = B.SNOW;
          else if (h < 50 && r2 < 0.72 - (h - 20) * 0.006) id = B.ROCK_MOSS;
        } else if (d <= 2 && h < 44 && r2 < 0.25) id = B.ROCK_MOSS;
      } else if (kind === 'stage') {
        const [su] = toUV(x, z);
        if (d === 0) id = su > SITE.stage.u + 8.5 + r2 * 2.5 ? B.GRAVEL : B.HEATH;
        else if (d < 3) id = B.SOIL;
      } else if (kind === 'court') {
        if (d === 0) id = clearing > 0.05 ? B.HEATH : (r1 < 0.5 ? B.ROCK_MOSS : B.LITTER);
        else if (d < 2) id = B.SOIL;
      } else {
        if (d === 0) id = h > 56 + r2 * 4 ? B.SNOW : (clearing > 0.22 ? B.HEATH : B.LITTER);
        else if (d < 3) id = B.SOIL;
      }
      world.set(x, y, z, id);
    }
    for (let y = h + 1; y <= WL; y++) world.set(x, y, z, B.WATER);
  }

  addLedge(world, meta);
  addOre(world, meta);
  buildKeep(world, meta);
  buildShelter(world, meta);
  addBoulders(world, meta);
  addTrees(world, meta);
  addWatchTrees(world, meta);
  addOutcrop(world, meta);
  addPlants(world, meta);
  return { world, meta };
}

// --- the ledge at the head of the valley: a few raised blocks so its rim reads as stepped rock ----
function addLedge(world, meta) {
  const G = SITE.ledge;
  const [gu, gv] = toUV(G.x, G.z);
  // [metres down the valley from the ledge centre, metres to the right, height, block]
  const rocks = [[-1.5, -5.5, 2, B.ROCK], [-0.5, -5.5, 1, B.ROCK_MOSS], [-2.5, -4.8, 3, B.ROCK], [-2.4, -5.9, 2, B.ROCK_MOSS], [0.6, -6.0, 1, B.ROCK],
    [1.5, 5.6, 1, B.ROCK_MOSS], [0.4, 6.0, 2, B.ROCK], [-0.8, 5.6, 1, B.ROCK], [2.6, -4.6, 1, B.ROCK]];
  for (const [du, dv, hgt, id] of rocks) {
    const [fx, fz] = fromUV(gu + du, gv + dv);
    const x = Math.floor(fx), z = Math.floor(fz);
    const g = world.topY(x, z);
    for (let y = g + 1; y <= g + hgt; y++) world.set(x, y, z, y === g + hgt ? id : B.ROCK);
  }
  for (const [du, dv] of [[0.8, -3.6], [3.4, 4.4], [4.6, -2.6], [5.3, 2.3]]) {
    const [fx, fz] = fromUV(gu + du, gv + dv);
    const x = Math.floor(fx), z = Math.floor(fz);
    const g = world.topY(x, z);
    if (world.get(x, g, z) === B.ROCK) world.set(x, g + 1, z, B.DRYGRASS);
  }
}

// --- ore veins in exposed rock ---------------------------------------------------------------
function addOre(world, meta) {
  const K = SITE.keep;
  for (let z = 1; z < SZ - 1; z++) for (let x = 1; x < SX - 1; x++) {
    const h = meta.hf(x, z);
    for (let y = Math.max(WL - 1, h - 14); y <= h; y++) {
      if (world.get(x, y, z) !== B.ROCK) continue;
      // only blocks that touch air on a side are worth changing
      if (world.get(x + 1, y, z) && world.get(x - 1, y, z) && world.get(x, y, z + 1) && world.get(x, y, z - 1)) continue;
      const v = Math.abs(noiseB.n3(x / 11, y / 4.5, z / 11));
      const m = noise.n3(x / 23 + 4, y / 19, z / 23 - 2);
      if (v < 0.035 && m > 0.12) world.set(x, y, z, B.ORE_IRON);
      // glowing veins: a few pockets low on the crag's lake face and on the eastern wall
      const g = Math.abs(noise.n3(x / 7 + 11, y / 3.2, z / 7 + 5));
      const gm = noiseB.n3(x / 16 - 3, y / 12, z / 16 + 6);
      const nearCrag = Math.hypot(x - K.x, z - K.z) < 30 && y < K.y - 6 && y > WL;
      if (g < 0.045 && gm > (nearCrag ? 0.2 : 0.42)) world.set(x, y, z, B.ORE_GLOW);
    }
  }
}

// --- ruined keep -------------------------------------------------------------------------------
function buildKeep(world, meta) {
  const K = SITE.keep;
  const gy = (x, z) => meta.hf(x, z);
  const brick = (x, y, z) => {
    // lower and more sheltered courses are mossier
    const base = gy(x, z);
    const m = hash3(x, y, z, 31) + noiseB.n3(x / 5, y / 5, z / 5) * 0.5;
    world.set(x, y, z, m < 0.34 - (y - base) * 0.012 ? B.BRICK_MOSS : B.BRICK);
  };
  /** Wall column from the ground up to K.y + top, eroded by `cut`. */
  const column = (x, z, top, cut = 0) => {
    const t = Math.round(K.y + top - cut);
    for (let y = Math.min(gy(x, z), K.y) - 1; y <= t; y++) if (y > gy(x, z) - 2) brick(x, y, z);
    return t;
  };

  // main tower: 9 x 9, hollow. The west wall and the north-west corner still stand to full height,
  // pierced by a tall arch; the rest has come down in big uneven bites.
  const tx0 = K.x + 3, tz0 = K.z - 9, TW = 9, TH = 26;
  const profW = [26, 26, 26, 25, 25, 19, 19, 22, 17];      // west wall (dx = 0), north to south
  const profS = [17, 16, 12, 12, 14, 9, 5, 6, 3];          // south wall (dz = 8), west to east
  const profN = [26, 15, 13, 13, 12, 12, 9, 8, 6];         // north wall (dz = 0), west to east
  const profE = [6, 7, 5, 8, 4, 4, 2, 3, 3];               // east wall (dx = 8), north to south
  const wallTop = (dx, dz) => Math.max(dx === 0 ? profW[dz] : 0, dz === TW - 1 ? profS[dx] : 0, dz === 0 ? profN[dx] : 0, dx === TW - 1 ? profE[dz] : 0);
  for (let dz = 0; dz < TW; dz++) for (let dx = 0; dx < TW; dx++) {
    const x = tx0 + dx, z = tz0 + dz;
    const edge = dx === 0 || dz === 0 || dx === TW - 1 || dz === TW - 1;
    const inner = dx === 1 || dz === 1 || dx === TW - 2 || dz === TW - 2;
    if (edge) {
      const top = wallTop(dx, dz);
      for (let y = gy(x, z) - 1; y <= K.y + top; y++) {
        const hy = y - K.y;
        // the great arch in the west wall: three wide, pointed
        if (dx === 0 && ((dz >= 1 && dz <= 3 && hy >= 14 && hy <= 18) || (dz === 2 && hy === 19))) continue;
        // arrow slits
        if (dx === 0 && dz === 7 && (hy === 8 || hy === 9)) continue;
        if (dx === 0 && dz === 2 && (hy === 6 || hy === 7)) continue;
        if (dz === TW - 1 && ((dx === 1 && (hy === 9 || hy === 10)) || (dx === 4 && (hy === 8 || hy === 9)))) continue;
        // doorway
        if (dz === TW - 1 && dx >= 3 && dx <= 5 && hy >= 1 && hy <= (dx === 4 ? 4 : 3)) continue;
        // weathered top course: the odd stone has dropped out
        if (hy === top && top < 25 && hash3(x, 13, z, 5) < 0.3) continue;
        brick(x, y, z);
      }
      // battlements on the part that still stands at full height
      if (top >= 25 && ((dx + dz) % 2 === 0)) brick(x, K.y + top + 1, z);
    } else if (inner) {
      const near = Math.max(wallTop(dx === 1 ? 0 : dx === TW - 2 ? TW - 1 : dx, dz === 1 ? 0 : dz === TW - 2 ? TW - 1 : dz), 0);
      for (let y = gy(x, z); y <= K.y + Math.min(3, near); y++) brick(x, y, z);                 // thick footing
      // floor remnants clinging to the standing wall
      if (dx === 1 && dz <= 4 && hash3(x, 2, z, 9) < 0.75) { world.set(x, K.y + 13, z, B.PLANKS); if (dz <= 2) world.set(x, K.y + 20, z, B.PLANKS); }
    } else {
      if (dx === 2 && dz <= 3 && hash3(x, 2, z, 9) < 0.5) world.set(x, K.y + 13, z, B.PLANKS);
      world.set(x, K.y, z, B.BRICK);
      // the fallen masonry lies in a heap inside the shell and spills out through the south-east corner
      const heap = Math.round(4.2 - Math.hypot(dx - 6, dz - 6) * 1.1 + hash3(x, 4, z, 6) * 2.2);
      for (let y = 1; y <= heap; y++) brick(x, K.y + y, z);
    }
  }
  for (let dz = -2; dz <= TW + 3; dz++) for (let dx = 2; dx <= TW + 4; dx++) {
    if (dx < TW && dz < TW && dz >= 0) continue;                                              // only outside the shell
    const x = tx0 + dx, z = tz0 + dz;
    const g = world.topY(x, z);
    if (g < K.y - 1 || g > K.y + 1) continue;
    const heap = Math.round(3.2 - Math.hypot(dx - TW, dz - TW) * 0.75 + hash3(x, 8, z, 6) * 2.0);
    for (let y = 1; y <= heap; y++) brick(x, g + y, z);
  }

  // curtain wall running west from the tower, with a gate arch, buttresses and loopholes
  const wz = K.z - 8;
  for (let x = K.x - 17; x < tx0; x++) {
    const along = tx0 - x;
    const breach = Math.max(0, 5.5 - Math.abs(along - 13) * 1.4) + Math.max(0, noiseB.fbm2(x / 4, 3.3, 2) * 4 - 0.6) + (hash3(x, 3, 1, 44) < 0.25 ? 1 : 0);
    for (let t = 0; t < 2; t++) {
      const z = wz + t;
      const top = 7 - breach;
      if (top < 0.5) { if (hash3(x, 5, z, 2) < 0.6) brick(x, gy(x, z) + 1, z); if (hash3(x, 6, z, 2) < 0.3) brick(x, gy(x, z) + 2, z); continue; }
      const tt = column(x, z, top);
      const gate = along >= 5 && along <= 7;
      if (gate) for (let y = K.y + 1; y <= K.y + (along === 6 ? 5 : 4); y++) world.set(x, y, z, 0);
      if (!gate && along % 4 === 2 && top > 5.5) for (let y = K.y + 4; y <= K.y + 5; y++) world.set(x, y, z, 0);     // loophole
      if (breach < 0.4 && t === 0 && x % 2 === 0) brick(x, tt + 1, z);
    }
    // buttress piers on the outer face
    if (along % 5 === 3 && 7 - breach > 4) { const z = wz + 2; for (let y = gy(x, z); y <= K.y + 7 - breach - 2; y++) brick(x, y, z); }
  }
  // ruined turret at the west end
  const ux0 = K.x - 21, uz0 = K.z - 10;
  for (let dz = 0; dz < 5; dz++) for (let dx = 0; dx < 5; dx++) {
    const x = ux0 + dx, z = uz0 + dz;
    const edge = dx === 0 || dz === 0 || dx === 4 || dz === 4;
    const fall = Math.max(0, (dz - dx + 1) * 1.6 + noiseB.fbm2(x / 2.7, z / 2.7, 2) * 3.5);
    if (edge) column(x, z, 12, fall); else world.set(x, K.y, z, B.BRICK);
  }
  // wall running south from the tower: mostly fallen
  const wx = K.x + 10;
  for (let z = tz0 + TW; z <= K.z + 11; z++) {
    const along = z - (tz0 + TW);
    const top = 6 - along * 0.35 - Math.max(0, noiseB.fbm2(7.7, z / 3, 2) * 5) - (along > 6 ? 2 : 0);
    for (let t = 0; t < 2; t++) {
      const x = wx + t;
      if (top < 0.5) { if (hash3(x, 5, z, 4) < 0.5) brick(x, gy(x, z) + 1, z); continue; }
      const tt = column(x, z, top);
      if (t === 1 && z % 2 === 0 && top > 4.5) brick(x, tt + 1, z);
    }
  }
  // low parapet fragments along the cliff edge (south-west)
  for (let i = 0; i < 26; i++) {
    const x = K.x - 16 + i, z = K.z + 9 + Math.round(Math.sin(i * 0.4) * 1.5);
    if (hash3(x, 6, z, 8) < 0.45 && gy(x, z) >= K.y - 1) brick(x, gy(x, z) + 1, z);
  }
  // paved court around the tower door and rubble everywhere
  for (let z = K.z - 6; z <= K.z + 6; z++) for (let x = K.x - 10; x <= K.x + 9; x++) {
    const g = gy(x, z);
    if (g !== K.y) continue;
    if (!world.get(x, g + 1, z) && hash3(x, 7, z, 12) < 0.3 + 0.4 * sstep(8, 2, Math.hypot(x - (tx0 + 4), z - (tz0 + TW)))) world.set(x, g, z, B.BRICK);
  }
  for (let i = 0; i < 150; i++) {
    const a = hash3(i, 1, 0, 77) * Math.PI * 2, r = 3 + hash3(i, 2, 0, 77) * 23;
    const x = Math.round(K.x + Math.cos(a) * r * 1.2), z = Math.round(K.z + Math.sin(a) * r * 0.9);
    if (!world.inb(x, 0, z)) continue;
    const g = world.topY(x, z);
    const id = world.get(x, g, z);
    if (id === B.WATER || id === B.NEEDLES || g > K.y + 2 || g <= WL) continue;
    if (g < K.y - 2 && g > WL + 5) continue;                    // none clinging to the cliff face
    brick(x, g + 1, z);
    if (hash3(i, 3, 0, 77) < 0.25) brick(x, g + 2, z);
  }
  meta.keep = { tx0, tz0, TW, TH, top: K.y + TH };
}

// --- survivor's shelter --------------------------------------------------------------------
function buildShelter(world, meta) {
  const S = SITE.shelter;
  const g = S.y;                                   // top ground block; you stand at g + 1
  const R = 7.4;
  meta.shelter = { stakes: [], torches: [], fire: { x: S.x + 0.5, y: g + 1, z: S.z + 0.5 }, g };
  const gate = { ax: -0.31, az: -0.95 };           // gate faces the lake (north-north-west)
  for (let z = S.z - 12; z <= S.z + 12; z++) for (let x = S.x - 12; x <= S.x + 12; x++) {
    const dx = x - S.x, dz = z - S.z;
    const d = Math.hypot(dx * 0.93, dz);
    const top = meta.hf(x, z);
    if (d < R + 0.5) {
      // level the yard
      for (let y = top; y > g; y--) world.set(x, y, z, 0);
      for (let y = Math.min(top, g) - 1; y <= g; y++) if (y >= 0) world.set(x, y, z, y === g ? B.PATH : B.SOIL);
      meta.H[x + SX * z] = g;
      if (d < 2.3) world.set(x, g, z, B.ASH);
    }
    if (Math.abs(d - R) < 0.55) {
      const dot = (dx * gate.ax + dz * gate.az) / Math.max(0.01, Math.hypot(dx, dz));
      if (dot > 0.955) continue;                   // gate opening
      const hgt = 3 + (hash3(x, 4, z, 21) < 0.45 ? 1 : 0);
      for (let y = g + 1; y <= g + hgt; y++) world.set(x, y, z, B.STAKE);
      meta.shelter.stakes.push({ x, y: g + hgt + 1, z });
    }
  }
  // lean-to hut against the east side: plank back and side walls (roof is a prop)
  const hx = S.x + 3, hz = S.z - 2;
  for (let dz = 0; dz <= 4; dz++) for (let dx = 0; dx <= 3; dx++) {
    const x = hx + dx, z = hz + dz;
    world.set(x, g, z, B.PLANKS);
    const wall = dx === 3 || dz === 0 || dz === 4;
    if (wall) for (let y = g + 1; y <= g + (dx === 3 ? 2 : 3 - Math.max(0, dx - 1)); y++) world.set(x, y, z, B.PLANKS);
  }
  meta.shelter.hut = { x: hx, z: hz, g };
  // path from the gate down to the shore and a short jetty
  let px = S.x + gate.ax * (R + 0.5), pz = S.z + gate.az * (R + 0.5);
  let jetty = null;
  for (let i = 0; i < 40; i++) {
    px += gate.ax * 0.9 + Math.sin(i * 0.5) * 0.25; pz += gate.az * 0.9;
    const x = Math.round(px), z = Math.round(pz);
    const top = world.topY(x, z, (id) => id === B.WATER);
    if (top <= WL) { jetty = { x, z, i }; break; }
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1]]) {
      const t = world.topY(x + ox, z + oz, (id) => id === B.WATER);
      const id = world.get(x + ox, t, z + oz);
      if (t > WL && (id === B.LITTER || id === B.HEATH || id === B.GRAVEL || id === B.ROCK_MOSS)) world.set(x + ox, t, z + oz, B.PATH);
    }
  }
  if (jetty) {
    for (let i = 0; i < 7; i++) {
      const x = Math.round(jetty.x + gate.ax * i), z = Math.round(jetty.z + gate.az * i);
      for (const ox of [0, 1]) world.set(x + ox, WL + 1, z, B.PLANKS);
      if (i % 3 === 0) for (const ox of [0, 1]) for (let y = world.topY(x + ox, z, (id) => id === B.WATER || id === B.PLANKS) + 1; y <= WL; y++) world.set(x + ox, y, z, B.TRUNK);
      if (i === 6) meta.shelter.jettyEnd = { x: x + 1, y: WL + 2, z };
    }
  }
  // stumps outside: the forest has been cut back around the wall
  for (let i = 0; i < 26; i++) {
    const a = hash3(i, 1, 5, 41) * Math.PI * 2, r = R + 2.5 + hash3(i, 2, 5, 41) * 9;
    const x = Math.round(S.x + Math.cos(a) * r), z = Math.round(S.z + Math.sin(a) * r);
    const t = world.topY(x, z);
    const id = world.get(x, t, z);
    if (id !== B.LITTER && id !== B.HEATH) continue;
    if (stageMask(x, z, 1) > 0.02) continue;
    world.set(x, t + 1, z, B.TRUNK);
    meta.stumps.push({ x, y: t + 1, z });
  }
  // torches: two at the gate, one at the end of the jetty, a lantern under the lean-to
  const tor = meta.shelter.torches;
  for (const sgn of [-1, 1]) {
    const tx = S.x + 0.5 + gate.ax * (R + 1.2) - gate.az * sgn * 3.1, tz = S.z + 0.5 + gate.az * (R + 1.2) + gate.ax * sgn * 3.1;
    const ty = world.topY(Math.floor(tx), Math.floor(tz)) + 1;
    tor.push({ x: tx, y: ty, z: tz, h: 2.5, kind: 'torch' });
  }
  if (meta.shelter.jettyEnd) { const j = meta.shelter.jettyEnd; tor.push({ x: j.x + 0.2, y: j.y, z: j.z + 0.5, h: 2.0, kind: 'torch' }); }
  tor.push({ x: hx - 0.25, y: g + 1, z: hz + 2.5, h: 2.35, kind: 'lantern' });
  meta.shelter.gate = gate; meta.shelter.R = R;
  // the palisade itself: sharpened logs set shoulder to shoulder along the ring, each a little
  // different in girth, height and lean; a rail is lashed along the outside
  {
    const logs = [];
    const gl = Math.hypot(gate.ax, gate.az);
    let a = 0;
    for (let i = 0; a < Math.PI * 2; i++) {
      const dx = Math.cos(a) * R / 0.93, dz = Math.sin(a) * R;
      const rr = Math.hypot(dx, dz);
      const r = 0.175 + hash3(i, 1, 7, 87) * 0.06;
      a += (r * 2 + 0.015) / rr;
      const dot = (dx * gate.ax + dz * gate.az) / (rr * gl);
      if (dot > 0.957) continue;
      const jit = (hash3(i, 2, 7, 87) - 0.5) * 0.12;
      const nearGate = sstep(0.9, 0.957, dot);
      const tall = hash3(i, 3, 7, 87);
      logs.push({
        x: S.x + 0.5 + dx * (1 + jit / rr), z: S.z + 0.5 + dz * (1 + jit / rr), y: g + 1, r,
        h: 3.15 + tall * 0.75 + (tall > 0.86 ? 0.45 : 0) + nearGate * 0.5,
        lean: 0.012 + hash3(i, 4, 7, 87) * 0.04, leanAz: hash3(i, 5, 7, 87) * Math.PI * 2,
        ox: dx / rr, oz: dz / rr, seed: i,
      });
    }
    meta.shelter.logs = logs;
  }
  // baked fire light sources (flood filled later)
  meta.lights.push({ x: S.x, y: g + 1, z: S.z, level: 19 });
  for (const t of tor) {
    const lx = Math.floor(t.x), ly = Math.floor(t.y + t.h), lz = Math.floor(t.z);
    if (!world.get(lx, ly, lz)) meta.lights.push({ x: lx, y: ly, z: lz, level: t.kind === 'torch' ? 13 : 11 });
  }
}

// --- boulders ----------------------------------------------------------------------------------
function addBoulders(world, meta) {
  for (let i = 0; i < 90; i++) {
    const x = 4 + Math.floor(hash3(i, 1, 9, 51) * (SX - 8)), z = 4 + Math.floor(hash3(i, 2, 9, 51) * (SZ - 8));
    const t = world.topY(x, z);
    const id = world.get(x, t, z);
    if (id !== B.LITTER && id !== B.HEATH && id !== B.GRAVEL) continue;
    if (Math.hypot(x - SITE.shelter.x, z - SITE.shelter.z) < 11) continue;
    if (stageMask(x, z, 2) > 0.02) continue;
    const r = 1.1 + hash3(i, 3, 9, 51) * 1.7;
    for (let dy = 0; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const d = Math.hypot(dx, dy * 1.5, dz) + hash3(x + dx, dy, z + dz, 3) * 0.7;
      if (d > r) continue;
      const g = world.topY(x + dx, z + dz, (b) => b === B.WATER || b === B.FERN || b === B.DRYGRASS || b === B.REEDS);
      for (let y = g + 1; y <= t + 1 + dy; y++) world.set(x + dx, y, z + dz, hash3(x + dx, y, z + dz, 8) < 0.55 ? B.ROCK_MOSS : B.ROCK);
    }
  }
}

// --- pines -------------------------------------------------------------------------------------
function plantPine(world, x, g, z, Hh) {
  // voxel logs up to where the boughs get dense; the boughs themselves are a prop (trees.js)
  const trunkTop = g + Math.max(5, Math.round(Hh * 0.5));
  for (let y = g + 1; y <= trunkTop; y++) world.set(x, y, z, B.TRUNK);
  return trunkTop + 1;
}

function plantSnag(world, x, g, z, Hh, seed) {
  for (let y = g + 1; y <= g + Hh; y++) world.set(x, y, z, B.TRUNK);
  for (let i = 0; i < 3; i++) {
    const y = g + Math.round(Hh * (0.45 + i * 0.2));
    const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(hash3(x, i, z, seed) * 4)];
    world.set(x + dir[0], y, z + dir[1], B.TRUNK);
    if (hash3(x, i + 5, z, seed) < 0.5) world.set(x + dir[0] * 2, y + 1, z + dir[1] * 2, B.TRUNK);
  }
}

function addTrees(world, meta) {
  const S = SITE.shelter, K = SITE.keep, G = SITE.ledge;
  const cell = 4;
  for (let cz = 1; cz < SZ / cell - 1; cz++) for (let cx = 1; cx < SX / cell - 1; cx++) {
    const x = Math.floor(cx * cell + hash3(cx, 1, cz, 61) * cell), z = Math.floor(cz * cell + hash3(cx, 2, cz, 61) * cell);
    if (x < 4 || z < 4 || x > SX - 5 || z > SZ - 5) continue;
    const g = meta.hf(x, z);
    const id = world.get(x, g, z);
    if (world.get(x, g + 1, z)) continue;
    const forestFloor = id === B.LITTER || id === B.HEATH;
    const rocky = id === B.ROCK_MOSS;
    if (!forestFloor && !rocky) continue;
    const dens = noiseB.fbm2(x / 34 + 2, z / 34 - 6, 3);
    let p = id === B.LITTER ? 0.8 + dens * 0.5 : id === B.HEATH ? 0.2 + dens * 0.4 : 0.1;
    if (g > 52) p *= 0.45;
    const sd = Math.hypot(x - S.x, z - S.z);
    if (sd < 13.5) continue;
    if (sd < 20) p *= 0.3;
    if (stageMask(x, z, 1.5) > 0.02) continue;
    { const [wa, wr] = watchCoords(x, z); if (wa > -6 && wa < 30 && Math.abs(wr) < 7 + Math.max(0, wa) * 0.75) continue; }
    const kd = Math.hypot((x - K.x) / 21, (z - K.z) / 15);
    if (kd < 1.02) continue;
    // keep the view from the ledge open: no trees in a cone down the valley
    const [u, v] = toUV(x, z);
    const [gu, gv] = toUV(G.x, G.z);
    const du = u - gu, dv = v - gv;
    if (du > -2 && du < 40 && Math.abs(dv) < 4 + du * 0.42) continue;
    if (Math.hypot(x - G.x, z - G.z) < 15) continue;
    // the hero view is framed by two hand-set pines; nothing else stands close in its field of view
    { const hu = u - HERO_CAM.u, hv = v - HERO_CAM.v; if (Math.hypot(hu, hv) < 31 && Math.abs(Math.atan2(hv, hu)) < 0.64) continue; }
    if (hash3(cx, 3, cz, 61) > p) continue;
    const r = hash3(cx, 4, cz, 61);
    if (r < 0.06 || (kd < 1.5 && r < 0.4)) {
      plantSnag(world, x, g, z, 5 + Math.floor(hash3(cx, 5, cz, 61) * 6), cx * 131 + cz);
      meta.trees.push({ x, z, g, h: 6, snag: true });
      continue;
    }
    const Hh = Math.round(9 + hash3(cx, 5, cz, 61) * 10 + dens * 3 - (g > 50 ? 3 : 0));
    const trunkTop = plantPine(world, x, g, z, Hh);
    meta.trees.push({ x, z, g, h: Hh, seed: cx * 131 + cz, trunkTop });
  }
}

function addWatchTrees(world, meta) {
  const hand = WATCH_TREES.map(([ahead, right, Hh]) => [...watchRel(ahead, right), Hh]).concat(HERO_TREES);
  hand.forEach(([u, v, Hh, dead], i) => {
    const [fx, fz] = fromUV(u, v);
    const x = Math.floor(fx), z = Math.floor(fz);
    const g = world.topY(x, z);
    const id = world.get(x, g, z);
    if (id === B.WATER || id === B.TRUNK) return;
    const trunkTop = plantPine(world, x, g, z, Hh);
    meta.trees.push({ x, z, g, h: Hh, seed: 9000 + i * 17, trunkTop, dead: !!dead });
  });
  for (const [out, right, Hh] of PLAY_TREES) {
    const [fx, fz] = gateRel(meta, out, right);
    const x = Math.floor(fx), z = Math.floor(fz);
    const g = world.topY(x, z);
    const id = world.get(x, g, z);
    if (id === B.WATER || id === B.TRUNK || id === B.STAKE || id === B.PLANKS) continue;
    const trunkTop = plantPine(world, x, g, z, Hh);
    meta.trees.push({ x, z, g, h: Hh, seed: 9500 + Hh, trunkTop, dead: false });
  }  // undergrowth right in front of the watch spot: you are looking out of the brush
  for (const [ahead, right, id] of [[2.4, -1.7, B.FERN], [3.2, 1.5, B.FERN], [4.4, -0.3, B.DRYGRASS], [2.0, 0.7, B.DRYGRASS], [5.2, -2.6, B.FERN], [4.0, 3.0, B.FERN], [6.4, 1.2, B.DRYGRASS]]) {
    const [fx, fz] = fromUV(...watchRel(ahead, right));
    const x = Math.floor(fx), z = Math.floor(fz);
    const g = world.topY(x, z);
    if (world.get(x, g, z) < 19 && world.get(x, g, z) !== B.WATER && world.get(x, g, z) !== B.TRUNK) world.set(x, g + 1, z, id);
  }
}

/** World position `out` metres outside the shelter gate along its axis and `right` metres to the right as you face the gate. */
export function gateRel(meta, out, right) {
  const S = SITE.shelter, g = meta.shelter.gate, L = Math.hypot(g.ax, g.az);
  const ox = g.ax / L, oz = g.az / L;
  const gx = S.x + 0.5 + ox * meta.shelter.R, gz = S.z + 0.5 + oz * meta.shelter.R;
  // facing the gate you look along (-ox, -oz); your right is (oz, -ox)
  return [gx + ox * out + oz * right, gz + oz * out - ox * right];
}

/** A low outcrop with a glowing vein a few steps outside the gate: something worth mining close to home. */
function addOutcrop(world, meta) {
  const [fx, fz] = gateRel(meta, 4.7, 3.3);
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const g = world.topY(x0, z0 - 1, (b) => b >= 19);
  // -z is the side you approach it from (the lake shore); the glowing block sits at eye level on that side
  const cells = [
    [-1, 1, -1, B.ROCK_MOSS], [0, 1, -1, B.ROCK], [0, 2, -1, B.ORE_GLOW], [1, 1, -1, B.ORE_IRON],
    [-2, 1, 0, B.ROCK_MOSS], [-1, 1, 0, B.ROCK], [-1, 2, 0, B.ROCK_MOSS], [0, 1, 0, B.ROCK], [0, 2, 0, B.ROCK_MOSS],
    [1, 1, 0, B.ROCK], [1, 2, 0, B.ORE_GLOW], [2, 1, 0, B.ROCK_MOSS],
    [-1, 1, 1, B.ROCK], [0, 1, 1, B.ROCK], [0, 2, 1, B.ROCK_MOSS], [1, 1, 1, B.ROCK_MOSS], [1, 2, 1, B.ROCK],
  ];
  for (const [dx, dy, dz, id] of cells) {
    const gy = world.topY(x0 + dx, z0 + dz, (b) => b >= 19);
    for (let y = gy + 1; y < g + dy; y++) world.set(x0 + dx, y, z0 + dz, B.ROCK);
    world.set(x0 + dx, g + dy, z0 + dz, id);
  }
  meta.outcrop = { x: x0, y: g + 2, z: z0 - 1, g };
}

function addPlants(world, meta) {
  for (let z = 2; z < SZ - 2; z++) for (let x = 2; x < SX - 2; x++) {
    const t = meta.hf(x, z);
    const id = world.get(x, t, z);
    if (world.get(x, t + 1, z)) continue;
    if (Math.hypot(x - SITE.ledge.x, z - SITE.ledge.z) < 10) continue;          // the ledge stays bare rock
    let r = hash3(x, 11, z, 71);
    if (stageMask(x, z) > 0.3) { if (hash3(x, 12, z, 71) < 0.75) continue; r = r * 0.5 + 0.25; }
    if (id === B.LITTER) { if (r < 0.05) world.set(x, t + 1, z, B.FERN); else if (r > 0.975) world.set(x, t + 1, z, B.DRYGRASS); }
    else if (id === B.HEATH) { if (r < 0.2) world.set(x, t + 1, z, B.DRYGRASS); else if (r > 0.95) world.set(x, t + 1, z, B.FERN); }
    else if (id === B.GRAVEL && t === WL + 1) { if (r < 0.22) world.set(x, t + 1, z, B.REEDS); }
    else if (id === B.ROCK_MOSS) { if (r < 0.035) world.set(x, t + 1, z, B.DRYGRASS); }
  }
}

// ---------------------------------------------------------------------------------------------
// Voxel light: sky occlusion and fire light, flood filled through air
// ---------------------------------------------------------------------------------------------
export function bakeLight(world, lights) {
  const { sx, sy, sz } = world;
  const N = sx * sy * sz;
  const data = world.data;
  const idx = (x, y, z) => x + sx * (z + sz * y);
  // 0 = blocks light fully, 1 = air, 2 = thins light (needles)
  const pass = new Uint8Array(256);
  pass[0] = 1;
  for (const k in BLOCKS) {
    const kind = BLOCKS[k].kind ?? 'solid';
    pass[k] = kind === 'solid' || (kind === 'none' && BLOCKS[k].occludes) ? 0 : kind === 'cutout' ? 2 : 1;
  }
  const sky = new Uint8Array(N), blk = new Uint8Array(N);
  const q = new Int32Array(N * 3);
  let qh = 0, qt = 0;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    let lv = 15;
    for (let y = sy - 1; y >= 0 && lv > 0; y--) {
      const i = idx(x, y, z), p = pass[data[i]];
      if (p === 0) break;
      if (p === 2) lv = Math.max(0, lv - 2);
      sky[i] = lv;
      if (lv > 1) q[qt++] = i;
    }
  }
  const flood = (arr) => {
    while (qh < qt) {
      const i = q[qh++];
      const lv = arr[i];
      if (lv <= 1) continue;
      const x = i % sx, r = (i - x) / sx, z = r % sz, y = (r - z) / sz;
      const tryN = (nx, ny, nz) => {
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) return;
        const j = idx(nx, ny, nz), p = pass[data[j]];
        if (p === 0) return;
        const nl = lv - (p === 2 ? 2 : 1);
        if (arr[j] < nl) { arr[j] = nl; q[qt++] = j; }
      };
      tryN(x + 1, y, z); tryN(x - 1, y, z); tryN(x, y + 1, z); tryN(x, y - 1, z); tryN(x, y, z + 1); tryN(x, y, z - 1);
    }
  };
  flood(sky);
  qh = qt = 0;
  for (const l of lights) {
    const i = idx(l.x, l.y, l.z);
    if (blk[i] < l.level) { blk[i] = l.level; q[qt++] = i; }
  }
  flood(blk);
  return { sky, blk, pass, idx };
}

// ---------------------------------------------------------------------------------------------
// Meshing: chunks, world-space UVs, baked light attribute, slow colour drift
// ---------------------------------------------------------------------------------------------
const CH = 32;
const MESH_OPTS = { aoCurve: [0.3, 0.52, 0.78, 1.0], edgeFaces: false, liquidDrop: 0.18 };

/** The mesher sees one chunk at a time, in chunk-local coordinates (the chunk's group carries the offset). */
function chunkView(world, cx, cz) {
  return {
    sx: Math.min(CH, world.sx - cx), sy: world.sy, sz: Math.min(CH, world.sz - cz),
    inb: (x, y, z) => world.inb(x + cx, y, z + cz),
    get: (x, y, z) => world.get(x + cx, y, z + cz),
    set: (x, y, z, id) => world.set(x + cx, y, z + cz, id),
  };
}

/**
 * Finishes one meshed bucket of the chunk at (cx, cz): world-space UVs, the baked light attribute
 * (read from the light volume as it is now) and the slow colour drift. Used for the static meshes
 * and again for every chunk the game re-meshes.
 */
function makeDresser(world, light) {
  const { sky, blk, pass } = light;
  const { sx, sy, sz } = world;
  const data = world.data;
  const K = light.kit || null;                                 // the game's lamp light (see kitLight); the shots have none
  const sample = (arr, x, y, z) => {
    if (x < 0 || z < 0 || x >= sx || z >= sz || y < 0) return -1;
    if (y >= sy) return arr === sky ? 15 : 0;
    const i = x + sx * (z + sz * y);
    if (pass[data[i]] === 0) return -1;
    return arr[i];
  };
  const tint = makeNoise(4242);
  return function dress(mesh, cx, cz) {
    // mesh.name is "<tile>:<kind>"; the tiles of the shared building kit have colons of their own ("x:paint:#c33d2e")
    const cut = mesh.name.lastIndexOf(':');
    const tile = mesh.name.slice(0, cut), kind = mesh.name.slice(cut + 1);
    // kit blocks keep the mesher's own UVs (one picture per face) and their own colours: no world-space mapping, no drift
    const own = !tile.startsWith('x:');
    const geo = mesh.geometry;
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, col = geo.attributes.color;
    const lit = new Float32Array(pos.count * 2);
    // lamp light: colour and level per vertex, one byte each (all zero until the first lamp or fire is set down)
    const tin = K ? new Uint8Array(pos.count * 4) : null, lamps = K && K.any;
    const s = UV_SCALE[tile] ?? 0.5;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i) + cx, py = pos.getY(i), pz = pos.getZ(i) + cz;
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      let sSum = 0, bSum = 0, n = 0, kSum = 0, kr = 0, kg = 0, kb = 0;
      if (kind === 'cross') {
        const sv = sample(sky, Math.floor(px), Math.floor(py + 0.01), Math.floor(pz));
        const bv = sample(blk, Math.floor(px), Math.floor(py + 0.01), Math.floor(pz));
        sSum = Math.max(0, sv); bSum = Math.max(0, bv); n = 1;
        if (lamps && sv >= 0 && py + 0.01 < sy) {
          const j = Math.floor(px) + sx * (Math.floor(pz) + sz * Math.floor(py + 0.01)), lv = K.lv[j];
          if (lv) { const c = K.pal[K.col[j]]; kSum = lv; kr = c[0] * lv; kg = c[1] * lv; kb = c[2] * lv; }
        }
      } else {
        // the four air cells that meet at this corner, in the layer in front of the face
        const rx = Math.round(px), ry = Math.round(py), rz = Math.round(pz);
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
          let x, y, z;
          if (nx !== 0) { x = nx > 0 ? rx : rx - 1; y = ry - a; z = rz - b; }
          // the top of a half block or a bed lies inside its own cell: it takes that cell's light, whatever stands above it
          else if (ny !== 0) { y = ny < 0 ? ry - 1 : own || py === ry ? ry : Math.floor(py); x = rx - a; z = rz - b; }
          else { z = nz > 0 ? rz : rz - 1; x = rx - a; y = ry - b; }
          const sv = sample(sky, x, y, z);
          if (sv < 0) continue;
          sSum += sv; bSum += sample(blk, x, y, z); n++;
          if (lamps && y < sy) {
            const j = x + sx * (z + sz * y), lv = K.lv[j];
            if (lv) { const c = K.pal[K.col[j]]; kSum += lv; kr += c[0] * lv; kg += c[1] * lv; kb += c[2] * lv; }
          }
        }
        if (own) {
          if (ny !== 0) uv.setXY(i, px * s, pz * s);
          else if (nx !== 0) uv.setXY(i, pz * s, py * s);
          else uv.setXY(i, px * s, py * s);
        }
      }
      lit[i * 2] = n ? sSum / n / 15 : 0;
      lit[i * 2 + 1] = n ? Math.min(1, bSum / n / 15) : 0;
      if (kSum) { const q = 255 / kSum; tin[i * 4] = kr * q; tin[i * 4 + 1] = kg * q; tin[i * 4 + 2] = kb * q; tin[i * 4 + 3] = Math.min(255, kSum / n * (255 / LAMP)); }
      // slow brightness / warmth drift so large surfaces never look stamped
      if (kind !== 'liquid' && own) {
        const t1 = tint.n3(px / 13, py / 9, pz / 13), t2 = tint.n3(px / 31 + 5, py / 23, pz / 31 - 3);
        const k = 1 + t1 * 0.13 + t2 * 0.1;
        const w = t2 * 0.05;
        col.setXYZ(i, col.getX(i) * k * (1 + w), col.getY(i) * k, col.getZ(i) * k * (1 - w));
      }
    }
    geo.setAttribute('aLit', new THREE.BufferAttribute(lit, 2));
    if (tin) geo.setAttribute('aTint', new THREE.BufferAttribute(tin, 4, true));
    uv.needsUpdate = true; col.needsUpdate = true;
    mesh.userData.kind = kind; mesh.userData.tile = tile;
    if (kind === 'cross') mesh.castShadow = false;
  };
}

export function buildWorldMeshes(world, light, materialFor) {
  const root = new THREE.Group();
  root.name = 'world';
  let tris = 0;
  const dress = makeDresser(world, light);
  for (let cz = 0; cz < world.sz; cz += CH) for (let cx = 0; cx < world.sx; cx += CH) {
    const { group, stats } = buildVoxelMeshes(chunkView(world, cx, cz), BLOCKS, { materialFor, ...MESH_OPTS });
    tris += stats.triangles;
    group.position.set(cx, 0, cz);
    for (const mesh of group.children) dress(mesh, cx, cz);
    root.add(group);
  }
  return { root, tris };
}

/**
 * The same terrain for the playable game: every chunk is an editable createVoxelTerrain, so the
 * picture and the draw calls are those of buildWorldMeshes until a block changes. An edit re-bakes
 * the light around it, then re-meshes the 16 x 16 pieces whose faces or light it can reach.
 *   const terrain = buildWorldTerrain(world, light, lights, materialFor, { onMesh });
 *   scene.add(terrain.group);  terrain.setBlock(x, y, z, id);  terrain.flush();   // flush once per frame
 */
export function buildWorldTerrain(world, light, lights, materialFor, { onMesh } = {}) {
  const root = new THREE.Group();
  root.name = 'world';
  const SUB = 16;
  const K = light.kit = kitLight(world);
  const dress = makeDresser(world, light);
  const relight = makeRelight(world, light, lights);
  const { sx, sz, sy } = world;
  const ncx = Math.ceil(sx / CH), ncz = Math.ceil(sz / CH);
  const parts = [];
  let tris = 0;
  for (let cz = 0; cz < sz; cz += CH) for (let cx = 0; cx < sx; cx += CH) {
    const view = chunkView(world, cx, cz);
    const terrain = createVoxelTerrain(view, BLOCKS, { materialFor, ...MESH_OPTS, chunk: SUB, onMesh: (mesh) => { dress(mesh, cx, cz); if (onMesh) onMesh(mesh); } });
    tris += terrain.stats.triangles;
    terrain.group.position.set(cx, 0, cz);
    root.add(terrain.group);
    parts.push({ cx, cz, view, terrain });
  }
  const partAt = (x, z) => parts[Math.floor(z / CH) * ncx + Math.floor(x / CH)];
  /**
   * Queue the 16 x 16 piece that holds column (x, z) for re-meshing although none of its blocks changed
   * (its baked light did). createVoxelTerrain only marks pieces through setBlock, so one cell at the top
   * of the world is flipped and put back; the world ends up exactly as it was.
   */
  function remesh(x, z) {
    const p = partAt(x, z);
    const lx = Math.min(p.view.sx - 1, Math.floor((x - p.cx) / SUB) * SUB + (SUB >> 1)), lz = Math.min(p.view.sz - 1, Math.floor((z - p.cz) / SUB) * SUB + (SUB >> 1));
    const cur = p.view.get(lx, sy - 1, lz);
    p.view.set(lx, sy - 1, lz, cur ? 0 : 1);
    p.terrain.setBlock(lx, sy - 1, lz, cur);
  }
  const edits = [];
  return {
    group: root, tris,
    /** Change one block. Returns false when nothing changed. */
    setBlock(x, y, z, id) {
      if (!world.inb(x, y, z)) return false;
      const old = world.get(x, y, z);
      if (old === id) return false;
      // a lamp or a fire of the building kit (a block with `light`) is a source for the baked lamp light, whoever sets or clears it
      const was = BLOCKS[old] && BLOCKS[old].light, now = BLOCKS[id] && BLOCKS[id].light;
      if (was || now) {
        const i = x + sx * (z + sz * y);
        if (now) { K.src.set(i, { x, z, i, level: BLOCKS[id].flicker ? LAMP - 1 : LAMP, c: K.colour(now) }); K.any = true; } else K.src.delete(i);
      }
      // every chunk within one cell of the edit must hear about it: faces and AO reach across the seam
      const x0 = Math.floor(Math.max(0, x - 1) / CH), x1 = Math.floor(Math.min(sx - 1, x + 1) / CH), z0 = Math.floor(Math.max(0, z - 1) / CH), z1 = Math.floor(Math.min(sz - 1, z + 1) / CH);
      for (let pz = z0; pz <= z1; pz++) for (let px = x0; px <= x1; px++) {
        const p = parts[pz * ncx + px];
        world.set(x, y, z, old);
        p.terrain.setBlock(x - p.cx, y, z - p.cz, id);
      }
      const n = edits.length;
      if (!(n && edits[n - 2] === x && edits[n - 1] === z)) edits.push(x, z);
      return true;
    },
    /** Re-bake the light around this frame's edits and rebuild what they touched. Returns the number of pieces rebuilt. */
    flush() {
      for (let i = 0; i < edits.length; i += 2) {
        const b = relight(edits[i], edits[i + 1]);
        if (!b) continue;
        // a face reads the light of the air cells around it, so reach two cells past the change
        const bx0 = Math.max(0, b.x0 - 2), bx1 = Math.min(sx - 1, b.x1 + 2), bz0 = Math.max(0, b.z0 - 2), bz1 = Math.min(sz - 1, b.z1 + 2);
        for (let z = Math.floor(bz0 / SUB) * SUB; z <= bz1; z += SUB) for (let x = Math.floor(bx0 / SUB) * SUB; x <= bx1; x += SUB) remesh(x, z);
      }
      edits.length = 0;
      let n = 0;
      for (const p of parts) n += p.terrain.flush();
      return n;
    },
    liveChunks() { let n = 0; for (const p of parts) n += p.terrain.liveChunks(); return n; },
  };
}

/**
 * Light of the building kit's lamps and fires (the game only): a flood-filled volume of its own beside the fire
 * light, because each lamp has a colour. lv = level 0..LAMP; col = which colour reached the cell with the most
 * light (an index into pal); src = the lamps and fires now standing, by cell index.
 * A lamp starts at LAMP and loses one level per block, so its glow is full beside it and gone six blocks away.
 * The reach is short on purpose: with the two cells a face reads around itself, setting or taking a lamp never
 * re-meshes more than the four 16 x 16 pieces any other edit can touch. (The nearest lamps also get the kit's
 * real lights, which carry further.)
 */
const LAMP = 7;
function kitLight(world) {
  const N = world.sx * world.sy * world.sz;
  const pal = [[0, 0, 0]], index = new Map();
  return {
    lv: new Uint8Array(N), col: new Uint8Array(N), pal, src: new Map(), any: false,
    /** Palette index of a light colour ('#rrggbb'), brought to full strength so every lamp carries as far as its level says. */
    colour(hex) {
      let i = index.get(hex);
      if (i === undefined) { const c = new THREE.Color(hex), m = Math.max(c.r, c.g, c.b, 1e-3); i = pal.length; pal.push([c.r / m, c.g / m, c.b / m]); index.set(hex, i); }
      return i;
    },
  };
}

/**
 * Local re-bake of the light volume after one block changed in column (ex, ez). Light never
 * travels further than its level (fire starts at 19), so everything the edit can change lies in
 * a box of that radius; the box is cleared and filled again from the open sky above it, the fires
 * inside it and the untouched cells around it. Returns the x / z bounds of the cells whose light
 * changed, or null.
 */
function makeRelight(world, light, lights) {
  const R = 18;
  const { sx, sy, sz } = world;
  const data = world.data;
  const { sky, blk, pass } = light;
  const K = light.kit;                                         // lamp light: re-baked the same way once there is any
  const W = 2 * R + 1;
  const oldSky = new Uint8Array(W * W * sy), oldBlk = new Uint8Array(W * W * sy), oldLv = new Uint8Array(W * W * sy), oldCol = new Uint8Array(W * W * sy);
  const q = [];
  const bounds = { x0: 0, x1: 0, z0: 0, z1: 0 };
  let x0 = 0, x1 = 0, z0 = 0, z1 = 0;
  /** tag: a second volume whose value travels with the light (the lamp's colour). */
  const flood = (arr, tag = null) => {
    let from = 0;
    const spread = (j, lv) => {
      const p = pass[data[j]];
      if (p === 0) return;
      const nl = lv - (p === 2 ? 2 : 1);
      if (arr[j] < nl) { arr[j] = nl; if (tag) tag[j] = tag[from]; q.push(j); }
    };
    for (let h = 0; h < q.length; h++) {
      const i = q[h], lv = arr[i];
      if (lv <= 1) continue;
      from = i;
      const x = i % sx, r = (i - x) / sx, z = r % sz, y = (r - z) / sz;
      // only cells inside the box are written; the ring around it only feeds light in
      if (z >= z0 && z <= z1) { if (x < x1) spread(i + 1, lv); if (x > x0) spread(i - 1, lv); }
      if (x >= x0 && x <= x1) {
        if (z < z1) spread(i + sx, lv); if (z > z0) spread(i - sx, lv);
        if (z >= z0 && z <= z1) { if (y < sy - 1) spread(i + sx * sz, lv); if (y > 0) spread(i - sx * sz, lv); }
      }
    }
    q.length = 0;
  };
  /** Cells just outside the box keep their light and shine into it. */
  const ring = (arr) => {
    const seed = (x, z) => { for (let y = 0; y < sy; y++) { const i = x + sx * (z + sz * y); if (arr[i] > 1) q.push(i); } };
    for (let x = x0; x <= x1; x++) { if (z0 > 0) seed(x, z0 - 1); if (z1 < sz - 1) seed(x, z1 + 1); }
    for (let z = z0; z <= z1; z++) { if (x0 > 0) seed(x0 - 1, z); if (x1 < sx - 1) seed(x1 + 1, z); }
  };
  return function relight(ex, ez) {
    x0 = Math.max(0, ex - R); x1 = Math.min(sx - 1, ex + R); z0 = Math.max(0, ez - R); z1 = Math.min(sz - 1, ez + R);
    let k = 0;
    for (let y = 0; y < sy; y++) for (let z = z0; z <= z1; z++) {
      let i = x0 + sx * (z + sz * y);
      for (let x = x0; x <= x1; x++, i++, k++) { oldSky[k] = sky[i]; oldBlk[k] = blk[i]; sky[i] = 0; blk[i] = 0; }
    }
    q.length = 0;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      let lv = 15;
      for (let y = sy - 1; y >= 0 && lv > 0; y--) {
        const i = x + sx * (z + sz * y), p = pass[data[i]];
        if (p === 0) break;
        if (p === 2) lv = Math.max(0, lv - 2);
        sky[i] = lv;
        if (lv > 1) q.push(i);
      }
    }
    ring(sky);
    flood(sky);
    for (const l of lights) {
      if (l.x < x0 || l.x > x1 || l.z < z0 || l.z > z1) continue;
      const i = l.x + sx * (l.z + sz * l.y);
      if (pass[data[i]] === 0) continue;                       // a fire that has been built over lights nothing
      if (blk[i] < l.level) { blk[i] = l.level; q.push(i); }
    }
    ring(blk);
    flood(blk);
    // lamp light: a lamp is a solid block, so its own cell holds the light and only its neighbours carry it on
    const lamps = K && K.any;
    if (lamps) {
      const lv = K.lv, col = K.col;
      k = 0;
      for (let y = 0; y < sy; y++) for (let z = z0; z <= z1; z++) {
        let i = x0 + sx * (z + sz * y);
        for (let x = x0; x <= x1; x++, i++, k++) { oldLv[k] = lv[i]; oldCol[k] = col[i]; lv[i] = 0; col[i] = 0; }
      }
      for (const l of K.src.values()) {
        if (l.x < x0 || l.x > x1 || l.z < z0 || l.z > z1) continue;
        lv[l.i] = l.level; col[l.i] = l.c; q.push(l.i);
      }
      ring(lv);
      flood(lv, col);
    }
    let bx0 = sx, bx1 = -1, bz0 = sz, bz1 = -1;
    k = 0;
    for (let y = 0; y < sy; y++) for (let z = z0; z <= z1; z++) {
      let i = x0 + sx * (z + sz * y);
      for (let x = x0; x <= x1; x++, i++, k++) {
        if (oldSky[k] === sky[i] && oldBlk[k] === blk[i] && (!lamps || (oldLv[k] === K.lv[i] && oldCol[k] === K.col[i]))) continue;
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
      }
    }
    if (bx1 < 0) return null;
    bounds.x0 = bx0; bounds.x1 = bx1; bounds.z0 = bz0; bounds.z1 = bz1;
    return bounds;
  };
}

// ---------------------------------------------------------------------------------------------
// Distant terrain beyond the voxel area: a coarse height mesh from the same height function
// ---------------------------------------------------------------------------------------------
export function buildFarTerrain(material, { reach = 700, step = 8 } = {}) {
  const x0 = -reach, x1 = SX + reach, z0 = -reach, z1 = SZ + reach;
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  const far = makeNoise(31337);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * step, z = z0 + j * step;
    const inside = x > 6 && z > 6 && x < SX - 6 && z < SZ - 6;
    const d = Math.max(0, Math.max(-x, x - SX, -z, z - SZ));
    // mountains grow with distance from the valley
    const grow = sstep(30, 380, d);
    const rid = far.ridge2(x / 230 + 1.3, z / 230 - 0.4, 5, 2.1, 0.52);
    let h = terrainH(x, z) + grow * (18 + 120 * rid * rid) + far.fbm2(x / 70, z / 70, 3) * 9 * sstep(0, 80, d);
    if (d < 30) h -= 3;
    if (inside) h = -6;                                   // hidden under the voxel world
    pos.push(x, h, z);
    const snow = sstep(92, 128, h + far.fbm2(x / 37, z / 37, 2) * 14);
    const forest = sstep(60, 40, h) * 0.85;
    const mott = 0.75 + 0.5 * far.fbm2(x / 23, z / 23, 3);
    c.setRGB(0.04 * mott, 0.046 * mott, 0.055 * mott).lerp(new THREE.Color(0.014, 0.021, 0.019), forest).lerp(new THREE.Color(0.13, 0.145, 0.17), snow * (0.6 + 0.4 * mott));
    col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'farTerrain';
  mesh.receiveShadow = false; mesh.castShadow = false;
  return mesh;
}
