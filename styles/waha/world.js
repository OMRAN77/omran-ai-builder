// World generation for "waha": a barchan dune sea, a layered sandstone escarpment cut by a wadi,
// an oasis pool fed by a falaj, a mud-brick fort with a stepped round tower and a wind tower, a camp.
//
// The block grid is 1 m everywhere. Loose ground (sand, hardpan, gravel, damp earth) that nobody has
// dug or built on is drawn with sloped tops: the mesher moves the corners of those blocks onto the
// continuous terrain height, so dunes read as sculpted surfaces while the dig grid stays cubic.
// Any column the player (or the fort builder below) has touched snaps back to plain cubes.
import { VoxelWorld } from '../../shared/voxel.js';
import { makeNoise, hash3 } from '../../shared/noise.js';

export const X0 = -80, X1 = 272, Z0 = -112, Z1 = 208;
export const SX = X1 - X0, SZ = Z1 - Z0, SY = 80;
export const GROUND = 21;                       // top block index of the basin floor
export const WATER_Y = 20;
export const POOL_LEVEL = WATER_Y + 0.88;

export const B = {
  SAND: 1, HARDPAN: 2, DAMP: 3, GRAVEL: 4, ROCK_A: 5, ROCK_B: 6, ROCK_C: 7, ROCK_D: 8,
  ADOBE: 9, BRICK: 10, BAND: 11, PLASTER: 12, STONE: 13, FALAJ: 14, WOOD: 15, THATCH: 16,
  SLIT: 17, SLIT_LIT: 18, WATER: 19, REED: 20, TUFT: 21, SHRUB: 22, BEAM: 23, ADOBE_DARK: 24,
  PACKED: 25, RUBBLE: 26,
};
export const BLOCKS = {
  [B.SAND]: { tiles: { top: 'sand', side: 'sandSide', bottom: 'sand' } },
  [B.PACKED]: { tiles: { top: 'packedTop', side: 'packed', bottom: 'packedTop' } },
  [B.HARDPAN]: { tiles: { top: 'hardpan', side: 'sandSide', bottom: 'hardpan' } },
  [B.DAMP]: { tiles: 'damp' },
  [B.GRAVEL]: { tiles: 'gravel' },
  [B.RUBBLE]: { tiles: { top: 'rockCTop', side: 'rubble', bottom: 'rockCTop' } },
  [B.ROCK_A]: { tiles: { top: 'rockATop', side: 'rockA', bottom: 'rockATop' } },
  [B.ROCK_B]: { tiles: { top: 'rockBTop', side: 'rockB', bottom: 'rockBTop' } },
  [B.ROCK_C]: { tiles: { top: 'rockCTop', side: 'rockC', bottom: 'rockCTop' } },
  [B.ROCK_D]: { tiles: { top: 'rockDTop', side: 'rockD', bottom: 'rockDTop' } },
  [B.ADOBE]: { tiles: { top: 'adobeTop', side: 'adobe', bottom: 'adobeTop' } },
  [B.ADOBE_DARK]: { tiles: { top: 'adobeTop', side: 'adobe', bottom: 'adobeTop' }, shade: 0.8 },
  [B.BRICK]: { tiles: { top: 'adobeTop', side: 'adobeBrick', bottom: 'adobeTop' } },
  [B.BAND]: { tiles: { top: 'adobeTop', side: 'adobeBand', bottom: 'adobeTop' } },
  [B.PLASTER]: { tiles: 'plaster' },
  [B.STONE]: { tiles: 'stone' },
  [B.FALAJ]: { tiles: 'falaj' },
  [B.WOOD]: { tiles: { top: 'beam', side: 'wood', bottom: 'beam' } },
  [B.BEAM]: { tiles: 'beam' },
  [B.THATCH]: { tiles: 'thatch' },
  [B.SLIT]: { tiles: { top: 'adobeTop', side: 'slit', bottom: 'adobeTop' } },
  [B.SLIT_LIT]: { tiles: { top: 'adobeTop', side: 'slitLit', bottom: 'adobeTop' } },
  [B.WATER]: { tiles: 'water', kind: 'liquid' },
  [B.REED]: { tiles: 'reed', kind: 'cross', height: 1.5 },
  [B.TUFT]: { tiles: 'tuft', kind: 'cross', height: 0.75 },
  [B.SHRUB]: { tiles: 'shrub', kind: 'cross', height: 0.95 },
};
const SOFT = new Set([B.SAND, B.HARDPAN, B.DAMP, B.GRAVEL]);
const isPlantOrWater = (id) => id >= B.WATER && id <= B.SHRUB;

export const FORT = { x0: 100, x1: 128, z0: 60, z1: 82, y: 24 };   // y: first wall course
export const POOL = { x: 70, z: 100, rx: 11.5, rz: 8.5 };
export const CAMP = { x: 101, z: 108 };
export const WIND = [0.94, 0.342];                                // blows toward +x, a little south

const N = makeNoise(20261);
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function wadiX(z) {
  // runs north from behind the fort, roughly along the hero camera's line of sight
  const d = Math.max(0, 60 - z);
  return 113.5 - 0.062 * d + (2.5 + Math.min(14, d * 0.05)) * Math.sin(z * 0.035 + 1.2) + 3 * N.n2(z * 0.017, 3.3);
}
function cliffZ(x) {
  const west = Math.max(0, 58 - x), east = Math.max(0, x - 150);
  return 46 + 7 * N.fbm2(x * 0.016 + 1.7, 0.31, 3) + 3 * N.n2(x * 0.06, 7.7) - west * 0.95 - east * 0.35;
}

// joints in the rock: thin lines where the walls are cut back into gullies
function gullyAt(x, z) {
  const a = 1 - Math.abs(N.n2(x * 0.071 + 3.1, z * 0.071 + 8.2));
  const b = 1 - Math.abs(N.n2(x * 0.029 + 13.1, z * 0.029 + 1.2));
  return Math.min(1.5, 0.9 * Math.pow(a, 6) + 1.2 * Math.pow(b, 9));
}

// Escarpment profile across the cliff line ("cliff and slope"): a scree apron with fans under the
// gullies, then three walls separated by debris slopes; every wall is cut back further by the gullies
// than the one below it. r: metres into the rock mass (negative = out on the plain).
function cliffParams(x, z) {
  const n1 = N.n2(x * 0.021 + 11.3, z * 0.021 + 4.1), n2 = N.n2(x * 0.033 + 2.7, z * 0.033 + 9.9);
  const n3 = N.n2(x * 0.083 + 5.5, z * 0.083 + 1.5), n4 = N.n2(x * 0.12 + 9.5, z * 0.12 + 6.5);
  const g = gullyAt(x, z), g1 = Math.min(1, g);
  const P = { n2 };
  P.reach = 4.0 + 8.0 * g1 + 1.6 * n3;
  P.talH = 3.6 + 2.2 * g1 + 0.9 * n2;
  P.e1 = 3.0 + 1.6 * g + 0.7 * n4; P.w1 = 0.5 + 2.2 * Math.max(0, n3); P.c1 = 10.5 + 3.5 * n1;
  P.e2 = P.e1 + P.w1 + 4.2 + 2.4 * n2 + 1.2 * n4 + 2.4 * g; P.w2 = 0.5 + 2.4 * Math.max(0, -n3); P.c2 = 7.5 + 2.5 * n2;
  P.e3 = P.e2 + P.w2 + 4.4 + 2.4 * n1 + 1.0 * n3 + 3.2 * g; P.w3 = 0.5 + 1.6 * Math.max(0, n4); P.c3 = 4.5 + 1.5 * n1;
  P.s1 = 2.6 + 0.8 * n4; P.s2 = 2.3 + 0.8 * n3;
  return P;
}
const CE = { h: 0, wall: 0, tal: 0, bench: 0 };
function cliffEval(P, r) {
  if (r < -13) { CE.h = 0; CE.wall = 0; CE.tal = 0; CE.bench = 0; return CE; }
  const tal = P.talH * Math.pow(sm(-P.reach, 3.4, r), 1.7);
  const wall = P.c1 * sm(P.e1, P.e1 + P.w1, r) + P.c2 * sm(P.e2, P.e2 + P.w2, r) + P.c3 * sm(P.e3, P.e3 + P.w3, r);
  const t1 = Math.min(1, Math.max(0, (r - P.e1 - P.w1) / (P.e2 - P.e1 - P.w1))), t2 = Math.min(1, Math.max(0, (r - P.e2 - P.w2) / (P.e3 - P.e2 - P.w2)));
  const slope = P.s1 * Math.pow(t1, 1.4) + P.s2 * Math.pow(t2, 1.4) + (1.2 + 1.2 * P.n2) * sm(P.e3 + P.w3, P.e3 + P.w3 + 16, r);
  CE.h = tal + wall + slope; CE.wall = wall; CE.tal = tal;
  // 1 on the debris slopes between the walls (loose ground), 0 on rock
  CE.bench = Math.max(sm(0.1, 0.3, t1) * (1 - sm(0.82, 0.97, t1)), sm(0.1, 0.3, t2) * (1 - sm(0.82, 0.97, t2)));
  return CE;
}
function rockSdf(x, z, out) {
  const jit = 3.4 * N.fbm2(x * 0.03, z * 0.03, 2) + 1.6 * N.n2(x * 0.062 + 2.2, z * 0.062 + 5.1);
  const dS = cliffZ(x) - z + jit;
  const wx = wadiX(z);
  const half = 15 + 3.0 * N.n2(z * 0.05, 1.9) + Math.max(0, z - 22) * 0.75 + Math.min(10, Math.max(0, -z) * 0.03);
  const dW = Math.abs(x - wx) - half + jit * 0.5;
  out.r = Math.min(dS, dW); out.dW = dW; out.half = half; out.wx = wx;
  return out;
}

// the designed dune whose knife-edge crest leads the eye from the hero camera to the oasis
export function heroCrestX(z) { return 117 - 7.5 * Math.sin((z - 122) / 17); }
function heroDune(x, z) {
  const along = sm(110, 186, z);
  const A = 26 * along * (0.94 + 0.06 * Math.sin(z / 7.5));
  if (A < 0.05) return 0;
  const d = x - heroCrestX(z);
  let p;
  if (d < 0) { const t = Math.max(0, 1 + d / 52); p = 0.55 * (t * t * (3 - 2 * t)) + 0.45 * Math.pow(t, 1.6); }
  else { const t = Math.max(0, 1 - d / (A * 1.5 + 3)); p = Math.pow(t, 1.12); }
  return A * p;
}

// Barchan field: crescent dunes with a long gentle windward back (about 12 degrees), a sharp brink and
// a steep slip face (about 32 degrees). Horns run ahead down-wind; neighbours merge into ridges.
function duneField(x, z) {
  const u = x * WIND[0] + z * WIND[1], v = -x * WIND[1] + z * WIND[0];
  const wu = u + 15 * N.n2(x * 0.0062 + 9.1, z * 0.0062 + 2.2);
  const wv = v + 20 * N.n2(x * 0.0062 + 4.4, z * 0.0062 + 7.7);
  const CU = 76, CV = 62;
  const iu0 = Math.floor(wu / CU), iv0 = Math.floor(wv / CV);
  let h = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const iu = iu0 + di, iv = iv0 + dj;
    const r1 = hash3(iu, 3, iv, 811), r2 = hash3(iu, 4, iv, 812), r3 = hash3(iu, 5, iv, 813), r4 = hash3(iu, 6, iv, 814);
    const pu = (iu + 0.22 + 0.56 * r1 + ((iv & 1) ? 0.5 : 0)) * CU, pv = (iv + 0.2 + 0.6 * r2) * CV;
    const H = 6.5 + 9.5 * r3 * r3 + 3.0 * r3;
    const Wd = 30 + 20 * r4 + H * 0.8;
    const lv = (wv - pv) / Wd;
    if (lv <= -1 || lv >= 1) continue;
    const Hl = H * Math.pow(1 - lv * lv, 0.85);
    const du = wu - (pu + 0.6 * Wd * lv * lv);
    let p;
    if (du < 0) {
      const t = 1 + du / (Hl * 4.6 + 6);
      if (t <= 0) continue;
      p = 0.55 * (t * t * (3 - 2 * t)) + 0.45 * Math.pow(t, 1.5);
    } else {
      const t = 1 - du / (Hl * 1.58 + 0.5);
      if (t <= 0) continue;
      p = Math.pow(t, 1.1);
    }
    const hh = Hl * p;
    if (hh > h) h = hh;
  }
  // low sand sheets between the dunes
  const sheet = 1.3 * Math.pow(N.ridge2(x * 0.021 + 1.3, z * 0.013 + 4.4, 2), 2.2) + 1.1 * (0.5 + 0.5 * N.n2(x * 0.011 + 7, z * 0.011 + 3));
  return h + sheet + 0.6;
}

const SD = { r: 0, dW: 0, half: 0, wx: 0 };
/** Continuous terrain description at any (x, z), also far outside the voxel world. */
export function terrainAt(x, z) {
  const far = Math.hypot(x - 96, z - 96);
  // --- escarpment + wadi
  const sd = rockSdf(x, z, SD);
  const r = sd.r, dW = sd.dW, half = sd.half, wx = sd.wx;
  const cp = r < -13 ? cliffEval(null, -99) : cliffEval(cliffParams(x, z), r);
  const cpH = cp.h, cpWall = cp.wall, cpTal = cp.tal, cpBench = cp.bench;
  // --- dunes: none in the oasis basin, none on the rock
  const be = Math.hypot((x - 97) / 50, (z - 90) / 30) + 0.10 * N.n2(x * 0.03 + 5, z * 0.03);
  const inWadi = z < 70 ? sm(half + 16, half + 2, Math.abs(x - wx)) : 0;
  const dm = (0.55 * sm(0.92, 1.45, be) + 0.45 * sm(1.2, 2.3, be)) * (1 - sm(-16, 1, r)) * (1 - inWadi);
  const grow = 1 + 0.9 * sm(300, 900, far);
  const hmask = sm(70, 26, Math.abs(x - heroCrestX(z))) * sm(108, 128, z);
  const hero = heroDune(x, z);
  const dune = dm * duneField(x, z) * grow * (1 - 0.92 * hmask) + hero;
  // --- isolated rock knobs in the sand sea
  let crop = 0;
  const cn = N.n2(x * 0.03 + 40.5, z * 0.03 + 7.25);
  if (cn > 0.50 && dm > 0.4 && hmask < 0.05) {
    crop = 13 * Math.pow(sm(0.50, 0.86, cn), 0.8) * (0.8 + 0.3 * N.n2(x * 0.13, z * 0.13)) - 1.5;
    if (crop < 0) crop = 0;
  }
  // --- far mesas for the horizon silhouette
  let mount = 0;
  if (far > 330) {
    const peaks = [[-560, -260, 70, 150], [-300, -640, 95, 210], [760, -560, 85, 220], [-820, 300, 70, 200], [480, 860, 60, 200], [-150, -1050, 110, 260], [330, -900, 80, 180]];
    for (const [px, pz, ph, pw] of peaks) {
      const d = Math.hypot(x - px, z - pz) / pw + 0.16 * N.n2(x * 0.006, z * 0.006);
      if (d < 1.3) mount = Math.max(mount, ph * (0.75 * sm(0.78, 0.60, d) + 0.25 * sm(1.25, 0.70, d)) * (0.9 + 0.1 * N.n2(x * 0.01, z * 0.01)));
    }
  }
  // --- basin floor
  const bump = Math.max(0, N.fbm2(x * 0.05 + 3, z * 0.05 + 8, 2) - 0.30) * 4 * sm(0.55, 0.9, be);
  let h = GROUND + 0.5 + bump + dune + Math.max(cpH, crop) + mount;
  // fort terrace
  const dxr = Math.max(FORT.x0 - x, 0, x - FORT.x1), dzr = Math.max(FORT.z0 - z, 0, z - FORT.z1);
  const tw = 1 - sm(4.5, 11, Math.hypot(dxr, dzr));
  if (tw > 0) h = lerp(h, FORT.y - 0.5, tw);
  // pool
  const pr = Math.hypot((x - POOL.x) / POOL.rx, (z - POOL.z) / POOL.rz) + 0.16 * N.n2(x * 0.11, z * 0.11);
  if (pr < 1.7) {
    const hp = pr < 1 ? 20.5 - 3.4 * (1 - sm(0.35, 1.0, pr)) : 20.5;
    h = lerp(hp, h, sm(1.0, 1.7, pr));
  }
  const isRock = (cpWall > 0.9 && cpBench < 0.5) || crop > 1.4 || mount > 5;
  let surf = 'sand';
  if (isRock) surf = 'rock';
  else if (pr < 1.45) surf = 'damp';
  else if (cpWall > 0.9) surf = N.fbm2(x * 0.05 + 21, z * 0.05 + 4, 2) > -0.12 ? 'sand' : 'gravel';      // drifts on the debris slopes
  else if (cpTal > 0.45 || crop > 0.1 || (dW < 3.5 && z < cliffZ(x) + 30)) surf = 'gravel';
  else if (dm < 0.06) surf = 'hardpan';
  return { h, surf, dm, pr, rock: Math.max(cpWall, crop), tw, be, r };
}

// sandstone beds, bottom to top: thick warm beds (A), red beds (B), soft pale beds that weather back (C)
// and thin dark hard beds that stand out as ledges (D)
const STRATA = [];
{
  const A_ = B.ROCK_A, B_ = B.ROCK_B, C_ = B.ROCK_C, D_ = B.ROCK_D;
  const seq = [A_, A_, A_, B_, B_, A_, A_, C_, A_, A_, D_, A_, A_, A_, B_, B_, B_, A_, A_, C_, C_, A_, D_,
    B_, B_, A_, A_, A_, A_, C_, A_, A_, D_, A_, A_, B_, A_, A_, C_, A_, A_, A_, D_, A_, B_, B_, A_, A_, C_, A_, D_];
  for (let i = 0; i < 160; i++) STRATA.push(seq[(i + 31) % seq.length]);
}
export function strataDip(x, z) { return 2.4 * N.n2(x * 0.018, z * 0.018) + 0.02 * x; }
export function strataRaw(y) { return STRATA[Math.max(0, y) % STRATA.length]; }
export function strataAt(x, y, z) {
  return STRATA[Math.max(0, Math.floor(y + strataDip(x, z))) % STRATA.length];
}

class World extends VoxelWorld {
  constructor() { super(SX, SY, SZ); }
  inb(x, y, z) { return x >= X0 && x < X1 && z >= Z0 && z < Z1 && y >= 0 && y < SY; }
  get(x, y, z) { return this.inb(x, y, z) ? this.data[(x - X0) + SX * ((z - Z0) + SZ * y)] : 0; }
  set(x, y, z, id) { if (this.inb(x, y, z)) this.data[(x - X0) + SX * ((z - Z0) + SZ * y)] = id; }
}
export const colIndex = (x, z) => (x - X0) + (z - Z0) * SX;
export const cornerIndex = (x, z) => (x - X0) + (z - Z0) * (SX + 1);

export function buildWorld() {
  const world = new World();
  const surf = new Array(SX * SZ);
  const origTop = new Int16Array(SX * SZ), origId = new Uint8Array(SX * SZ);
  const anchors = { palms: [], lanterns: [], beams: [], poles: [], flags: [], merlons: [] };

  // ---------- terrain ----------
  const SDL = { r: 0, dW: 0, half: 0, wx: 0 };
  const BED_OFF = { [B.ROCK_A]: 0, [B.ROCK_B]: 0.55, [B.ROCK_C]: 1.5, [B.ROCK_D]: -0.95 };
  for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
    const t = terrainAt(x + 0.5, z + 0.5);
    const top = Math.min(SY - 3, Math.floor(t.h));
    const ci = colIndex(x, z);
    surf[ci] = t.surf;
    for (let y = 0; y <= top; y++) {
      let id;
      const depth = top - y;
      if (t.surf === 'rock') {
        id = strataAt(x, y, z);
        // drifts of sand on the cap rock
        if (depth === 0 && t.rock > 20 && N.fbm2(x * 0.06 + 1, z * 0.06 + 6, 2) > 0.16) id = B.SAND;
      } else if (depth === 0) {
        id = t.surf === 'damp' ? B.DAMP : t.surf === 'gravel' ? B.GRAVEL : B.SAND;
      } else if (depth < 4 && t.rock < 0.9) id = t.surf === 'damp' ? B.DAMP : B.PACKED;
      else id = strataAt(x, y, z);
      world.set(x, y, z, id);
    }
    origTop[ci] = top; origId[ci] = world.get(x, top, z);
    for (let y = top + 1; y <= WATER_Y; y++) world.set(x, y, z, B.WATER);
  }
  // ---------- the cliff faces in 3D: every bed weathers differently (soft pale beds recede, thin hard
  //            beds stand proud), and the face wanders with height, so walls are never ruled planes ----------
  for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
    const sd = rockSdf(x + 0.5, z + 0.5, SDL);
    if (sd.r < -1 ) continue;
    const P = cliffParams(x + 0.5, z + 0.5);
    if (sd.r > P.e3 + P.w3 + 5) continue;
    const ci = colIndex(x, z);
    const top = origTop[ci];
    const base = terrainAt(x + 0.5, z + 0.5).h - cliffEval(P, sd.r).h;        // everything that is not cliff
    const dip = strataDip(x, z);
    const isRock = surf[ci] === 'rock';
    const yMax = Math.min(SY - 3, Math.floor(base + P.talH + P.c1 + P.c2 + P.c3 + P.s1 + P.s2 + 4));
    const capFade = 1 - 0.85 * sm(P.e3 + P.w3 + 0.5, P.e3 + P.w3 + 3.5, sd.r);
    for (let y = GROUND + 2; y <= yMax; y++) {
      const bi = Math.max(0, Math.floor(y + dip));
      const bed = STRATA[bi % STRATA.length];
      const delta = (BED_OFF[bed] + (hash3(bi, 7, 0, 55) - 0.5) * 0.9 + 1.1 * N.n3(x * 0.034, y * 0.07, z * 0.034)) * capFade;
      const hh = Math.floor(base + cliffEval(P, sd.r - delta).h);
      const solid = y <= hh;
      if (y <= top) {
        if (!solid && isRock && y > GROUND + 2) world.set(x, y, z, 0);
      } else if (solid && sd.r < P.e3 + P.w3 + 0.5) world.set(x, y, z, bed);
    }
  }
  const topSolid = (x, z) => world.topY(x, z, isPlantOrWater);
  // boulders that have come down onto the scree
  for (let z = Z0 + 3; z < Z1 - 3; z++) for (let x = X0 + 3; x < X1 - 3; x++) {
    const ci = colIndex(x, z);
    if (surf[ci] !== 'gravel' || hash3(x, 31, z, 5) > 0.012) continue;
    if (x > FORT.x0 - 14 && x < FORT.x1 + 14 && z > FORT.z0 - 14 && z < FORT.z1 + 30) continue;
    if (Math.abs(x - wadiX(z)) < 9) continue;
    const s = hash3(x, 32, z, 6), ty = origTop[ci];
    const w = s > 0.7 ? 2 : 1, hgt = s > 0.85 ? 2 : 1;
    for (let dz = 0; dz < w; dz++) for (let dx = 0; dx < w; dx++) for (let dy = 0; dy <= hgt; dy++) {
      if (dy === hgt && (dx || dz) && hash3(x + dx, 33, z + dz, 7) < 0.6) continue;
      if (surf[colIndex(x + dx, z + dz)] !== 'gravel') continue;
      world.set(x + dx, Math.min(origTop[colIndex(x + dx, z + dz)], ty) + dy, z + dz, dy === hgt ? B.RUBBLE : strataAt(x + dx, ty + 9 + dy, z + dz));
    }
  }

  // ---------- falaj ----------
  const flat = (x, z, id) => {         // force a column to basin level with a given top block
    for (let y = GROUND + 1; y < GROUND + 6; y++) world.set(x, y, z, 0);
    world.set(x, GROUND, z, id);
    if (!world.get(x, GROUND - 1, z) || world.get(x, GROUND - 1, z) === B.WATER) world.set(x, GROUND - 1, z, B.FALAJ);
  };
  const falajCells = new Set();
  const key = (x, z) => x + ',' + z;
  const channel = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      let [x, z] = pts[i]; const [x1, z1] = pts[i + 1];
      for (let guard = 0; guard < 600; guard++) {
        falajCells.add(key(x, z));
        if (x === x1 && z === z1) break;
        if (Math.abs(x1 - x) * (hash3(x, 5, z, 3) < 0.5 ? 1.2 : 0.8) > Math.abs(z1 - z)) x += Math.sign(x1 - x); else z += Math.sign(z1 - z);
      }
    }
  };
  // down the wadi, round the west side of the fort, then straight across the open ground to the pool
  channel([[Math.round(wadiX(-100)) - 2, Z0 + 3], [Math.round(wadiX(-60)) - 3, -60], [Math.round(wadiX(-20)) - 2, -20], [Math.round(wadiX(8)) - 2, 8],
    [Math.round(wadiX(26)) - 3, 26], [Math.round(wadiX(40)) - 6, 40], [98, 50], [91, 56], [91, 95], [82, 95]]);
  channel([[91, 64], [79, 64]]);                    // branches through the date garden
  channel([[91, 74], [79, 74]]);
  channel([[91, 84], [79, 84]]);
  for (const k of falajCells) {
    const [x, z] = k.split(',').map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const kk = key(x + dx, z + dz);
      if (!falajCells.has(kk) && terrainAt(x + dx + 0.5, z + dz + 0.5).pr > 1.02) flat(x + dx, z + dz, B.FALAJ);
    }
  }
  for (const k of falajCells) {
    const [x, z] = k.split(',').map(Number);
    if (terrainAt(x + 0.5, z + 0.5).pr > 1.0) { flat(x, z, B.WATER); world.set(x, GROUND - 1, z, B.FALAJ); }
  }

  // ---------- date garden: sunken plots between low mud borders ----------
  const plots = [[79, 57, 89, 63], [79, 66, 89, 73], [79, 76, 89, 83], [79, 86, 89, 91]];
  for (const [x0, z0, x1, z1] of plots) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (falajCells.has(key(x, z)) || world.get(x, GROUND, z) === B.FALAJ) continue;
      const border = x === x0 || x === x1 || z === z0 || z === z1;
      for (let y = GROUND + 1; y < GROUND + 5; y++) world.set(x, y, z, 0);
      world.set(x, GROUND, z, border ? B.ADOBE : B.DAMP);
      if (!border && hash3(x, 2, z, 41) < 0.30) world.set(x, GROUND + 1, z, B.TUFT);
    }
    for (let z = z0 + 2; z <= z1 - 1; z += 3) for (let x = x0 + 2; x <= x1 - 1; x += 3) {
      if (falajCells.has(key(x, z)) || world.get(x, GROUND, z) === B.FALAJ) continue;
      world.set(x, GROUND + 1, z, 0);
      anchors.palms.push({ x: x + 0.5, y: GROUND + 1, z: z + 0.5, h: 5.5 + hash3(x, 7, z, 1) * 3.5, seed: x * 31 + z });
    }
  }

  // ---------- fort ----------
  const F = FORT, Y = F.y;
  const WALL_TOP = Y + 6;                 // last full course; parapet at +1, merlons at +2
  const set = (x, y, z, id) => world.set(x, y, z, id);
  // clear the footprint above ground and pave the yard
  for (let z = F.z0 - 8; z <= F.z1 + 8; z++) for (let x = F.x0 - 8; x <= F.x1 + 8; x++) {
    const inside = x >= F.x0 && x <= F.x1 && z >= F.z0 && z <= F.z1;
    if (inside) { for (let y = Y; y < SY; y++) set(x, y, z, 0); for (let y = Y - 4; y < Y; y++) set(x, y, z, y === Y - 1 ? B.HARDPAN : B.PACKED); }
  }
  const wallCourse = (y, outer) => {
    const k = y - Y;
    if (k <= 1) return B.STONE;
    if (k === 5 && outer) return B.BAND;
    return B.ADOBE;
  };
  for (let z = F.z0; z <= F.z1; z++) for (let x = F.x0; x <= F.x1; x++) {
    const d = Math.min(x - F.x0, F.x1 - x, z - F.z0, F.z1 - z);
    if (d > 1) continue;
    for (let y = Y; y <= WALL_TOP; y++) set(x, y, z, wallCourse(y, d === 0));
    if (d === 0) {
      set(x, WALL_TOP + 1, z, B.BRICK);
      const alongX = (z === F.z0 || z === F.z1);
      anchors.merlons.push({ x: x + 0.5, y: WALL_TOP + 2, z: z + 0.5, rot: alongX ? 0 : Math.PI / 2 });
    }
  }
  // battered stone plinth outside the wall
  for (let z = F.z0 - 1; z <= F.z1 + 1; z++) for (let x = F.x0 - 1; x <= F.x1 + 1; x++) {
    const out = x < F.x0 || x > F.x1 || z < F.z0 || z > F.z1;
    if (out) set(x, Y, z, B.STONE);
  }

  // round tiers helper
  const disc = (cx, cz, r, y0, y1, fn) => {
    for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r + 1); z++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d > r) continue;
      const ang = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
      for (let y = y0; y <= y1; y++) { const id = fn(x, y, z, d, ang); if (id !== undefined) set(x, y, z, id); }
    }
  };
  const roundTier = (cx, cz, r, y0, rows, opts = {}) => {
    const top = y0 + rows - 1;
    disc(cx, cz, r, y0, top, (x, y, z, d) => {
      const outer = d > r - 1.05;
      if (opts.stone && y - y0 < 2) return B.STONE;
      if (outer && y === top - 1) return B.BAND;
      return B.ADOBE;
    });
    disc(cx, cz, r, top + 1, top + 1, (x, y, z, d) => (d <= r - 1.05 ? undefined : B.BRICK));
    const n = Math.round((2 * Math.PI * (r - 0.45)) / 1.02);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      anchors.merlons.push({ x: cx + Math.cos(ang) * (r - 0.5), y: top + 2, z: cz + Math.sin(ang) * (r - 0.5), rot: -ang + Math.PI / 2, round: true });
    }
    return top;
  };
  // stepped round watchtower on the south-west corner
  const TW = { x: F.x0 + 0.5, z: F.z1 + 0.5 };
  anchors.tower = { x: TW.x, z: TW.z };
  let t1 = roundTier(TW.x, TW.z, 6.6, Y, 7, { stone: true });
  // plinth ring
  disc(TW.x, TW.z, 7.6, Y, Y, (x, y, z, d) => (d > 6.6 ? B.STONE : undefined));
  let t2 = roundTier(TW.x, TW.z, 4.7, t1 + 1, 5);
  let t3 = roundTier(TW.x, TW.z, 3.1, t2 + 1, 4);
  anchors.towerTop = t3 + 1;
  // slits on the tower (south and west faces, some lit)
  const slitRing = (cx, cz, r, y, angs) => {
    for (const [ang, lit] of angs) {
      const x = Math.floor(cx + Math.cos(ang) * (r - 0.5)), z = Math.floor(cz + Math.sin(ang) * (r - 0.5));
      if (world.get(x, y, z)) set(x, y, z, lit ? B.SLIT_LIT : B.SLIT);
    }
  };
  slitRing(TW.x, TW.z, 6.6, Y + 3, [[Math.PI / 2, 0], [Math.PI * 0.8, 1], [Math.PI * 1.05, 0], [Math.PI * 0.28, 0]]);
  slitRing(TW.x, TW.z, 4.7, t1 + 3, [[Math.PI / 2, 1], [Math.PI * 0.95, 0], [Math.PI * 0.22, 0], [Math.PI * 0.68, 0]]);
  slitRing(TW.x, TW.z, 3.1, t2 + 2, [[Math.PI / 2, 1], [Math.PI, 1], [0, 0]]);

  // north-east square tower
  const sq = { x0: F.x1 - 5, x1: F.x1 + 1, z0: F.z0 - 1, z1: F.z0 + 5, top: Y + 10 };
  for (let z = sq.z0; z <= sq.z1; z++) for (let x = sq.x0; x <= sq.x1; x++) {
    const edge = x === sq.x0 || x === sq.x1 || z === sq.z0 || z === sq.z1;
    for (let y = Y; y <= sq.top; y++) set(x, y, z, y - Y < 2 ? B.STONE : (edge && y === sq.top - 1 ? B.BAND : B.ADOBE));
    if (edge) { set(x, sq.top + 1, z, B.BRICK); anchors.merlons.push({ x: x + 0.5, y: sq.top + 2, z: z + 0.5, rot: (z === sq.z0 || z === sq.z1) ? 0 : Math.PI / 2 }); }
  }
  set(sq.x0 + 3, Y + 6, sq.z1, B.SLIT_LIT); set(sq.x1, Y + 6, sq.z0 + 3, B.SLIT); set(sq.x0, Y + 7, sq.z0 + 3, B.SLIT);
  // small round turret, south-east
  const TE = { x: F.x1 + 0.5, z: F.z1 + 0.5 };
  roundTier(TE.x, TE.z, 3.6, Y, 9, { stone: true });
  slitRing(TE.x, TE.z, 3.6, Y + 5, [[Math.PI / 2, 0], [0, 1]]);

  // gatehouse in the south wall
  const gx = Math.round((F.x0 + F.x1) / 2) + 2;        // door centre x
  const gz = F.z1;
  for (let x = gx - 4; x <= gx + 4; x++) for (let z = gz - 1; z <= gz + 1; z++) {
    for (let y = Y; y <= WALL_TOP + 2; y++) set(x, y, z, y - Y < 2 ? B.STONE : (z === gz + 1 && y === WALL_TOP + 1 ? B.BAND : B.ADOBE));
    const edge = z === gz + 1 || z === gz - 1 || x === gx - 4 || x === gx + 4;
    if (edge) { set(x, WALL_TOP + 3, z, B.BRICK); anchors.merlons.push({ x: x + 0.5, y: WALL_TOP + 4, z: z + 0.5, rot: (z === gz + 1 || z === gz - 1) ? 0 : Math.PI / 2 }); } else set(x, WALL_TOP + 3, z, 0);
  }
  // door: pointed arch, recessed timber leaves, gypsum surround
  for (let x = gx - 2; x <= gx + 2; x++) for (let y = Y; y <= Y + 5; y++) {
    const ax = Math.abs(x - gx);
    const open = (ax <= 1 && y <= Y + 3) || (ax === 0 && y === Y + 4);
    if (open) { set(x, y, gz + 1, 0); set(x, y, gz, B.WOOD); set(x, y, gz - 1, 0); }
    else if (ax === 2 || y >= Y + 4) set(x, y, gz + 1, B.PLASTER);
  }
  set(gx - 1, WALL_TOP, gz + 1, B.SLIT_LIT); set(gx + 1, WALL_TOP, gz + 1, B.SLIT_LIT);
  // steps down from the terrace
  for (let s = 0; s < 3; s++) for (let x = gx - 2 - s; x <= gx + 2 + s; x++) for (let z = gz + 2; z <= gz + 2 + s * 2 + 1; z++) {
    const lvl = Y - 1 - Math.floor((z - gz - 2) / 2);
    if (lvl < GROUND + 1) continue;
    for (let y = lvl + 1; y < Y + 3; y++) if (world.get(x, y, z) !== B.STONE || y > lvl) set(x, y, z, 0);
    set(x, lvl, z, B.STONE);
  }
  anchors.gate = { x: gx + 0.5, z: gz + 2, y: Y };
  anchors.lanterns.push({ x: gx - 2.5, y: Y + 3.6, z: gz + 2.45, wall: 'z' }, { x: gx + 3.5, y: Y + 3.6, z: gz + 2.45, wall: 'z' });

  // majlis block against the north wall with the wind tower (barjeel)
  const mj = { x0: F.x0 + 3, x1: F.x0 + 17, z0: F.z0 + 2, z1: F.z0 + 8, top: Y + 5 };
  for (let z = mj.z0; z <= mj.z1; z++) for (let x = mj.x0; x <= mj.x1; x++) {
    const edge = x === mj.x0 || x === mj.x1 || z === mj.z0 || z === mj.z1;
    for (let y = Y; y <= mj.top; y++) set(x, y, z, edge ? (y - Y < 1 ? B.STONE : B.ADOBE) : (y === mj.top ? B.ADOBE : 0));
    if (edge) set(x, mj.top + 1, z, B.BRICK);
  }
  for (let x = mj.x0 + 2; x <= mj.x1 - 2; x += 3) set(x, Y + 3, mj.z1, B.SLIT_LIT);
  set(mj.x0 + 7, Y, mj.z1, B.WOOD); set(mj.x0 + 7, Y + 1, mj.z1, B.WOOD); set(mj.x0 + 7, Y + 2, mj.z1, B.WOOD);
  // shaded arcade (palm-frond roof on posts) in front of the majlis
  for (let x = mj.x0; x <= mj.x1; x++) for (let z = mj.z1 + 1; z <= mj.z1 + 3; z++) {
    set(x, Y + 4, z, B.THATCH);
    if (z === mj.z1 + 3 && (x - mj.x0) % 4 === 0) for (let y = Y; y < Y + 4; y++) set(x, y, z, B.BEAM);
  }
  const bj = { x0: mj.x0 + 9, z0: mj.z0 + 1, shaft: Y + 10, vent: 5 };
  for (let dz = 0; dz < 5; dz++) for (let dx = 0; dx < 5; dx++) {
    const x = bj.x0 + dx, z = bj.z0 + dz;
    const edge = dx === 0 || dx === 4 || dz === 0 || dz === 4;
    for (let y = Y; y <= bj.shaft; y++) set(x, y, z, y - Y < 1 ? B.STONE : (edge && y === bj.shaft ? B.BAND : B.ADOBE));
    for (let k = 1; k <= bj.vent; k++) {
      const y = bj.shaft + k;
      const pillar = edge && (dx % 2 === 0) && (dz % 2 === 0);
      const cross = !edge && (dx === dz || dx + dz === 4);
      set(x, y, z, pillar ? B.ADOBE : cross ? B.ADOBE_DARK : 0);
    }
    set(x, bj.shaft + bj.vent + 1, z, edge ? B.PLASTER : B.ADOBE);
    if (edge) anchors.merlons.push({ x: x + 0.5, y: bj.shaft + bj.vent + 2, z: z + 0.5, rot: (dz === 0 || dz === 4) ? 0 : Math.PI / 2 });
  }
  anchors.barjeel = { x: bj.x0 + 2.5, z: bj.z0 + 2.5, y0: bj.shaft, y1: bj.shaft + bj.vent + 1 };
  // courtyard well
  for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
    const x = F.x1 - 8 + dx, z = F.z1 - 9 + dz;
    set(x, Y, z, dx === 1 && dz === 1 ? B.WATER : B.STONE);
  }
  anchors.palms.push({ x: F.x0 + 7.5, y: Y, z: F.z1 - 7.5, h: 9.5, seed: 77 }, { x: F.x1 - 12.5, y: Y, z: F.z1 - 5.5, h: 7.5, seed: 78 });
  anchors.lanterns.push({ x: F.x0 + 11.5, y: Y + 3.2, z: mj.z1 + 3.5, wall: 'hang' });
  anchors.lanterns.push({ x: TW.x, y: t3 + 2.1, z: TW.z, wall: 'top' });
  // timber water spouts under the parapets
  for (let x = F.x0 + 3; x <= F.x1 - 2; x += 3) {
    if (Math.abs(x - gx) > 5 && Math.hypot(x - TW.x, F.z1 - TW.z) > 8 && Math.hypot(x - TE.x, F.z1 - TE.z) > 5) anchors.beams.push({ x: x + 0.5, y: WALL_TOP - 0.4, z: F.z1 + 1, dx: 0, dz: 1, spout: true });
  }
  for (let z = F.z0 + 8; z <= F.z1 - 7; z += 3) anchors.beams.push({ x: F.x0, y: WALL_TOP - 0.4, z: z + 0.5, dx: -1, dz: 0, spout: true });
  for (let z = F.z0 + 8; z <= F.z1 - 5; z += 3) anchors.beams.push({ x: F.x1 + 1, y: WALL_TOP - 0.4, z: z + 0.5, dx: 1, dz: 0, spout: true });
  // barjeel poles
  for (const k of [0.5, 2.5, 4.5]) for (const yy of [bj.shaft + 0.6, bj.shaft + bj.vent + 0.4]) {
    anchors.beams.push({ x: bj.x0 + k, y: yy, z: bj.z0 + 5, dx: 0, dz: 1, len: 1.0 });
    anchors.beams.push({ x: bj.x0, y: yy, z: bj.z0 + k, dx: -1, dz: 0, len: 1.0 });
    anchors.beams.push({ x: bj.x0 + 5, y: yy, z: bj.z0 + k, dx: 1, dz: 0, len: 1.0 });
    anchors.beams.push({ x: bj.x0 + k, y: yy, z: bj.z0, dx: 0, dz: -1, len: 1.0 });
  }
  anchors.flags.push({ x: TW.x, y: t3 + 2, z: TW.z });

  // ---------- oasis planting ----------
  const prAt = (x, z) => terrainAt(x + 0.5, z + 0.5).pr;
  for (let z = 70; z < 130; z++) for (let x = 40; x < 100; x++) {
    const pr = prAt(x, z);
    if (pr > 2.2) continue;
    const ty = topSolid(x, z);
    if (ty < 0 || world.get(x, ty + 1, z)) continue;
    const top = world.get(x, ty, z);
    if (top !== B.DAMP && top !== B.SAND && top !== B.HARDPAN) continue;
    const r = hash3(x, 11, z, 17);
    if (pr > 0.93 && pr < 1.12 && r < 0.55) world.set(x, ty + 1, z, B.REED);
    else if (pr >= 1.05 && pr < 1.9 && r < 0.20) world.set(x, ty + 1, z, B.TUFT);
  }
  // palms ringing the pool
  {
    let placed = 0;
    for (let i = 0; i < 400 && placed < 20; i++) {
      const ang = hash3(i, 1, 0, 301) * Math.PI * 2;
      const rad = 1.12 + hash3(i, 2, 0, 302) * 0.62;
      const x = Math.floor(POOL.x + Math.cos(ang) * POOL.rx * rad), z = Math.floor(POOL.z + Math.sin(ang) * POOL.rz * rad);
      // keep the view from the south-east open, and the falaj mouth clear
      if (ang > -0.75 && ang < 1.35 && hash3(i, 3, 0, 303) < 0.85) continue;
      if (x > 78 && z > 90 && z < 100) continue;
      if (falajCells.has(key(x, z)) || world.get(x, GROUND, z) === B.FALAJ || anchors.palms.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6)) continue;
      const ty = topSolid(x, z);
      if (world.get(x, ty, z) === B.WATER || world.get(x, ty + 1, z) === B.WATER || ty < WATER_Y) continue;
      world.set(x, ty + 1, z, 0);
      anchors.palms.push({ x: x + 0.5, y: ty + 1, z: z + 0.5, h: 6 + hash3(i, 4, 0, 304) * 6, seed: 500 + i });
      placed++;
    }
  }
  // a few along the falaj and by the camp
  for (const [x, z, h] of [[95, 58, 9.5], [95, 50, 7.5], [102, 45, 8.5], [76, 60, 8], [CAMP.x + 9, CAMP.z - 3, 8], [CAMP.x + 11, CAMP.z + 2, 6.5], [62, 84, 9], [57, 90, 7.5], [76, 70, 9.5], [75, 80, 8.5]]) {
    const ty = topSolid(x, z);
    world.set(x, ty + 1, z, 0);
    anchors.palms.push({ x: x + 0.5, y: ty + 1, z: z + 0.5, h, seed: x * 13 + z });
  }

  // ---------- scrub ----------
  for (let z = Z0 + 2; z < Z1 - 2; z++) for (let x = X0 + 2; x < X1 - 2; x++) {
    const s = surf[colIndex(x, z)];
    const r = hash3(x, 21, z, 23);
    const clump = sm(0.05, 0.45, N.fbm2(x * 0.07 + 31, z * 0.07 + 17, 2));
    const p = (s === 'gravel' ? 0.07 : s === 'hardpan' ? 0.035 : s === 'sand' ? 0.006 : 0) * clump;
    if (r >= p) continue;
    const ty = topSolid(x, z);
    if (ty < GROUND || world.get(x, ty + 1, z)) continue;
    const top = world.get(x, ty, z);
    if (top !== B.SAND && top !== B.HARDPAN && top !== B.GRAVEL) continue;
    if (x >= F.x0 - 2 && x <= F.x1 + 2 && z >= F.z0 - 2 && z <= F.z1 + 2) continue;
    world.set(x, ty + 1, z, hash3(x, 22, z, 29) < 0.6 ? B.SHRUB : B.TUFT);
  }

  // camp ground: level, firm
  for (let z = CAMP.z - 7; z <= CAMP.z + 7; z++) for (let x = CAMP.x - 9; x <= CAMP.x + 9; x++) {
    const ty = topSolid(x, z);
    for (let y = GROUND + 1; y <= ty + 1; y++) world.set(x, y, z, 0);
    const pad = Math.hypot((x - CAMP.x - 1) / 7.5, (z - CAMP.z + 1) / 5.2) + 0.25 * N.n2(x * 0.2, z * 0.2) < 1;
    if (world.get(x, GROUND, z) !== B.FALAJ && world.get(x, GROUND, z) !== B.WATER) world.set(x, GROUND, z, pad ? B.HARDPAN : B.SAND);
  }

  // ---------- the player's worksite in front of the gate: a stepped dig and a wall going up beside it ----------
  {
    const wx = 119, wz = 99;                                  // the wall column the player is working on
    for (let z = wz - 5; z <= wz + 4; z++) for (let x = wx - 10; x <= wx + 5; x++) for (let y = GROUND + 1; y < GROUND + 5; y++) world.set(x, y, z, 0);
    // sandstone starts shallow here, so the dig goes through loose sand and packed sand onto rock
    const pit = { x0: wx - 7, x1: wx - 2, z0: wz - 2, z1: wz + 2 };
    for (let z = pit.z0 - 2; z <= pit.z1 + 2; z++) for (let x = pit.x0 - 2; x <= pit.x1 + 2; x++) {
      for (let y = GROUND - 7; y <= GROUND - 2; y++) world.set(x, y, z, strataAt(x, y + 13, z));
      world.set(x, GROUND - 1, z, B.PACKED);
    }
    for (let z = pit.z0; z <= pit.z1; z++) for (let x = pit.x0; x <= pit.x1; x++) {
      let depth = 2;
      if (x >= pit.x1 - 1 && z >= pit.z1 - 1) depth = 1;                 // the step down, on the near side
      if (x <= pit.x0 + 3 && z <= pit.z0 + 1) depth = 3;                 // the deep end, cut into the sandstone
      if (x <= pit.x0 + 1 && z <= pit.z0) depth = 4;
      for (let d = 0; d < depth; d++) world.set(x, GROUND - d, z, 0);
    }
    // spoil heap on the far rim
    for (const [dx, dz, h] of [[-9, -1, 1], [-9, 0, 1]]) for (let y = 1; y <= h; y++) world.set(wx + dx, GROUND + y, wz + dz, B.SAND);
    // mud-brick wall under construction, stepping up to the right, with a spare stack beside it
    const wall = [[0, 0, 2], [1, 0, 3], [2, 0, 2], [2, -1, 1], [2, -2, 1]];
    for (const [dx, dz, h] of wall) for (let y = 1; y <= h; y++) world.set(wx + dx, GROUND + y, wz + dz, B.BRICK);
    world.set(wx + 4, GROUND + 1, wz - 3, B.BRICK); world.set(wx + 5, GROUND + 1, wz - 3, B.BRICK); world.set(wx + 5, GROUND + 2, wz - 3, B.BRICK); world.set(wx + 5, GROUND + 1, wz - 4, B.BRICK);
    anchors.work = { x: wx, z: wz, target: [wx, GROUND + 2, wz], pit };
  }

  // ---------- which columns are still untouched loose ground, and the smooth corner heights ----------
  const top = new Int16Array(SX * SZ), nat = new Uint8Array(SX * SZ), colMax = new Int16Array(SX * SZ);
  for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
    const ci = colIndex(x, z);
    let m = SY - 1; while (m >= 0 && !world.get(x, m, z)) m--;
    colMax[ci] = m;
    const ty = topSolid(x, z);
    top[ci] = ty;
    const above = world.get(x, ty + 1, z);
    nat[ci] = (surf[ci] !== 'rock' && ty === origTop[ci] && world.get(x, ty, z) === origId[ci] && SOFT.has(origId[ci]) && (!above || isPlantOrWater(above))) ? 1 : 0;
  }
  const hc = new Float32Array((SX + 1) * (SZ + 1)), smooth = new Uint8Array((SX + 1) * (SZ + 1)), firm = new Float32Array((SX + 1) * (SZ + 1));
  const natAt = (x, z) => (x < X0 || x >= X1 || z < Z0 || z >= Z1) ? 1 : nat[colIndex(x, z)];
  for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) {
    const k = cornerIndex(x, z);
    smooth[k] = natAt(x - 1, z - 1) & natAt(x, z - 1) & natAt(x - 1, z) & natAt(x, z);
    const t = terrainAt(x, z);
    if (smooth[k]) hc[k] = t.h + 0.5;
    // how firm the ground is here: wind-packed flats carry few ripples, drifts carry many
    firm[k] = (1 - sm(0.03, 0.40, t.dm)) * sm(-0.22, 0.20, N.fbm2(x * 0.04 + 7, z * 0.04 + 3, 3)) * (1 - sm(1.0, 3.0, t.h - GROUND - 0.5) * 0.7);
  }
  // a corner's smooth height must stay within reach of every column that shares it
  for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) {
    const k = cornerIndex(x, z);
    if (!smooth[k]) continue;
    let lo = -1e9, hi = 1e9;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const cx = x + dx, cz = z + dz;
      if (cx < X0 || cx >= X1 || cz < Z0 || cz >= Z1) continue;
      const s = top[colIndex(cx, cz)] + 1;
      lo = Math.max(lo, s - 1.6); hi = Math.min(hi, s + 1.6);
    }
    if (lo <= hi) hc[k] = Math.min(hi, Math.max(lo, hc[k]));
  }
  /** corner height as used by a given column */
  const cornerY = (x, z, colTopPlus1) => { const k = cornerIndex(x, z); return smooth[k] ? hc[k] : colTopPlus1; };
  /** walkable ground height at any point: sloped on untouched ground, block top elsewhere */
  const surfaceY = (xf, zf) => {
    const x = Math.floor(xf), z = Math.floor(zf);
    if (x < X0 || x >= X1 || z < Z0 || z >= Z1) return terrainAt(xf, zf).h + 0.5;
    const ci = colIndex(x, z), s = top[ci] + 1;
    if (!nat[ci]) return s;
    const fx = xf - x, fz = zf - z;
    const a = cornerY(x, z, s), b = cornerY(x + 1, z, s), c = cornerY(x, z + 1, s), d = cornerY(x + 1, z + 1, s);
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  };
  for (const p of anchors.palms) p.y = Math.min(p.y, surfaceY(p.x, p.z)) - 0.15;

  return { world, anchors, topSolid, top, nat, colMax, hc, smooth, firm, surf, surfaceY };
}
