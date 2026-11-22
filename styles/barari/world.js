// World generation for "barari": one map with three lands side by side and a sea along the east.
//   north (small z): snow hills, pines, a frozen pond        middle: forest, broadleaf trees, a pond
//   south (large z): dunes, palms, dry shrubs, a water hole   east (large x): beach, then the sea, 8-12 deep
// Natural caves run into the hills from their sides, with coal, gold and diamond in the walls and fires deep inside.
import { VoxelWorld } from '../../shared/voxel.js';
import { makeNoise, hash3 } from '../../shared/noise.js';
import { K } from '../../shared/kit.js';
import { B } from './blocks.js';

export const SX = 176, SY = 80, SZ = 176, SEA = 20;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export const SITE = {
  spawn: { x: 70, z: 110, y: 23 },
  pond: { x: 92, z: 90, rx: 7, rz: 5, y: 22 },
  frozen: { x: 62, z: 34, rx: 8, rz: 6, y: 27 },
  hole: { x: 100, z: 146, rx: 4.5, rz: 4, y: 21 },
};

export function generateWorld() {
  const world = new VoxelWorld(SX, SY, SZ);
  const N = makeNoise(7319);
  const H = new Int16Array(SX * SZ);
  const anchors = { fires: [], caves: [], trees: 0 };

  // ---- which land a column belongs to (weights that blend over about ten blocks)
  const zw = (x, z) => z + N.fbm2(x / 38, z / 38 + 7.7, 2) * 9;
  const coastX = (z) => 134 + N.fbm2(z / 30, 3.3, 2) * 7;
  function weights(x, z) {
    const t = zw(x, z);
    const snow = 1 - smooth(50, 64, t), desert = smooth(110, 124, t);
    return { snow, desert, forest: Math.max(0, 1 - snow - desert), sea: x - coastX(z) };
  }
  /** 'snow' | 'forest' | 'desert' | 'sea' (the beach counts as the land behind it). */
  function landOf(x, z) {
    const w = weights(x, z);
    if (w.sea > 0) return 'sea';
    return w.snow >= w.forest && w.snow >= w.desert ? 'snow' : w.desert > w.forest ? 'desert' : 'forest';
  }

  const HILLS = [
    { x: 26, z: 86, r: 19, h: 15 },      // the forest's big hill on the west side (a cave runs into it)
    { x: 108, z: 72, r: 10, h: 8 },      // a rocky knoll in the forest
    { x: 44, z: 150, r: 13, h: 11, mesa: true },   // a flat-topped sandstone mesa in the desert
  ];
  const FLATS = [
    { x: SITE.spawn.x, z: SITE.spawn.z, rx: 9, rz: 9, y: SITE.spawn.y + 0.5, soft: 0.45 },
    { x: SITE.pond.x, z: SITE.pond.z, rx: SITE.pond.rx + 5, rz: SITE.pond.rz + 5, y: SITE.pond.y + 1.5, soft: 0.4 },
    { x: SITE.frozen.x, z: SITE.frozen.z, rx: SITE.frozen.rx + 5, rz: SITE.frozen.rz + 5, y: SITE.frozen.y + 1.5, soft: 0.45 },
    { x: SITE.hole.x, z: SITE.hole.z, rx: SITE.hole.rx + 6, rz: SITE.hole.rz + 6, y: SITE.hole.y + 1.5, soft: 0.45 },
  ];

  function heightF(x, z) {
    const w = weights(x, z);
    const hf = 23 + N.fbm2(x / 55, z / 55, 3) * 2.6;
    const dune = N.ridge2(x / 40 + N.fbm2(x / 50, z / 50, 2) * 1.5, z / 24, 2);
    const hd = 22 + dune * 2.6 + N.fbm2(x / 70 + 3, z / 70, 2) * 1.6;
    const rise = smooth(66, 18, z);
    const hs = 25 + N.ridge2(x / 32 + 11, z / 32, 4) * 19 * (0.3 + 0.7 * rise) + N.fbm2(x / 20, z / 20, 2) * 3;
    let h = w.snow * hs + w.forest * hf + w.desert * hd;
    for (const q of HILLS) {
      const d = Math.hypot(x - q.x, z - q.z) / q.r;
      if (d < 1.3) h += q.mesa ? q.h * (1 - smooth(0.78, 1.0, d)) : q.h * Math.pow(Math.max(0, 1 - d * d / 1.69), 1.4) * (0.85 + N.fbm2(x / 9, z / 9, 2) * 0.4);
    }
    // the west, north and south edges rise into hills that close the map; the sea is open to the east
    const ed = Math.min(x, z, SZ - 1 - z);
    h += Math.pow(1 - smooth(3, 22, ed), 1.3) * (7 + N.ridge2(x / 20, z / 20, 3) * 12) * smooth(150, 120, x);
    for (const f of FLATS) {
      const d = Math.hypot((x - f.x) / f.rx, (z - f.z) / f.rz);
      h = mix(h, f.y, 1 - smooth(1 - f.soft, 1 + f.soft, d));
    }
    // beach, then the sea floor going down to 8-12 blocks of water
    const s = w.sea;
    if (s < 0) h = mix(h, SEA + 1.4, smooth(-16, -2, s));
    else h = SEA - clamp(0.6 + s * 0.55 + N.fbm2(x / 12, z / 12, 2) * 1.5, 0.6, 12);
    return h;
  }

  // ---- terrain columns
  const blend = (x, z) => clamp(0.5 + N.fbm2(x / 7 + 40, z / 7 + 40, 2) * 0.7 + (hash3(x, 1, z, 5) - 0.5) * 0.25);
  const HF = new Float32Array((SX + 2) * (SZ + 2));
  for (let z = -1; z <= SZ; z++) for (let x = -1; x <= SX; x++) HF[(x + 1) + (z + 1) * (SX + 2)] = heightF(x, z);
  const hf = (x, z) => HF[(x + 1) + (z + 1) * (SX + 2)];
  const hi = (x, z) => clamp(Math.floor(hf(x, z)), 3, SY - 12);
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const h = hi(x, z);
      H[x + z * SX] = h;
      const w = weights(x, z), r = blend(x, z);
      const land = r < w.snow ? 'snow' : r < w.snow + w.forest ? 'forest' : 'desert';
      const slope = Math.hypot(hf(x + 1, z) - hf(x - 1, z), hf(x, z + 1) - hf(x, z - 1)) * 0.5;
      const exposed = hi(x + 1, z) < h || hi(x - 1, z) < h || hi(x, z + 1) < h || hi(x, z - 1) < h;      // a side of the top block shows
      const sea = w.sea > -1 && h < SEA, beach = !sea && w.sea > -18 && h <= SEA + 2;
      for (let y = 0; y <= h; y++) {
        const depth = h - y;
        let id = B.STONE;
        if (sea) id = depth < 2 ? B.SEABED : B.STONE;
        else if (beach) id = land === 'snow' ? (depth < 2 ? B.GRAVEL : B.STONE) : depth < 3 ? B.SAND : depth < 7 ? B.SANDSTONE : B.STONE;
        else if (land === 'desert') id = slope > 1.9 ? (depth < 8 ? B.SANDSTONE : B.STONE) : depth < 3 ? B.SAND : depth < 9 ? B.SANDSTONE : B.STONE;
        else if (land === 'snow') id = depth === 0 ? (exposed || slope > 0.75 ? B.SNOWROCK : h > 44 ? B.SNOWBLOCK : B.SNOW) : depth < 3 && !exposed && slope <= 0.75 ? B.DIRT : B.STONE;
        else if (slope > 1.7 && depth < 6) id = B.STONE;
        else id = depth === 0 ? B.GRASS : depth < 4 ? B.DIRT : B.STONE;
        if (id === B.STONE && y < 8) id = B.DEEPROCK;
        if (y === 0) id = B.DEEPROCK;
        // a little coal everywhere in the rock, gold deeper, diamond deepest
        if ((id === B.STONE || id === B.DEEPROCK) && depth > 2) {
          const o = N.n3(x / 4.2, y / 4.2, z / 4.2);
          if (o > 0.62 && y < 52) id = K.ROCK_COAL;
          else if (o < -0.66 && y < 22 && hash3(x, y, z, 77) < 0.5) id = K.ROCK_GOLD;
          else if (y < 12 && hash3(x, y, z, 79) < 0.0018) id = K.ROCK_DIAMOND;
        }
        world.set(x, y, z, id);
      }
      if (sea) for (let y = h + 1; y <= SEA; y++) world.set(x, y, z, B.WATER);
    }
  }
  const put = (x, y, z, id) => { if (world.inb(x, y, z)) world.set(x, y, z, id); };
  const putAir = (x, y, z, id) => { if (world.inb(x, y, z) && world.get(x, y, z) === 0) world.set(x, y, z, id); };

  // ---- ponds: a bowl dug into the flattened ground and filled; the snow one has a lid of ice
  function pond(P, ice) {
    const R = Math.ceil(Math.max(P.rx, P.rz)) + 2;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = Math.round(P.x) + dx, z = Math.round(P.z) + dz;
      const d = Math.hypot(dx / P.rx, dz / P.rz) * (1 + N.fbm2(x / 5, z / 5, 2) * 0.15);
      if (d >= 1) continue;
      const bottom = Math.floor(P.y - 1 - (1 - d * d) * 3.2);
      for (let y = bottom + 1; y < SY; y++) world.set(x, y, z, y <= P.y ? (ice && y === P.y ? B.ICE : B.WATER) : 0);
      world.set(x, bottom, z, ice ? B.GRAVEL : d > 0.75 ? B.SAND : B.SEABED);
      H[x + z * SX] = bottom;
    }
  }
  pond(SITE.pond, false);
  pond(SITE.frozen, true);
  pond(SITE.hole, false);
  const isWater = (x, y, z) => { const id = world.get(x, y, z); return id === B.WATER || id === B.ICE; };

  // ---- natural caves: a tunnel enters a hill from its side at ground level, winds down, opens into halls
  const carved = [];
  const keepOut = (x, z) => Math.hypot(x - SITE.spawn.x, z - SITE.spawn.z) < 14;
  function carveCell(x, y, z) {
    if (y < 2 || x < 3 || z < 3 || x > SX - 4 || z > SZ - 4 || keepOut(x, z)) return;
    const id = world.get(x, y, z);
    if (!id || id === B.WATER || id === B.ICE) return;
    for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) if (isWater(x + a, y + b, z + c)) return;   // never open a pond or the sea into a cave
    world.set(x, y, z, 0);
    carved.push(x, y, z);
  }
  function blob(cx, cy, cz, rx, ry, rz) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const q = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2;
      if (q < 1) carveCell(x, y, z);
    }
  }
  const topAt = (x, z) => { for (let y = SY - 1; y > 0; y--) { const id = world.get(x, y, z); if (id && id !== B.WATER) return y; } return 0; };
  const halls = [];
  function worm(seed, x, z, ang, len, deep) {
    let y = topAt(Math.round(x), Math.round(z)) + 2.2, pitch = 0;
    const g0 = y;
    for (let k = 0; k < len; k++) {
      const r = 1.65 + hash3(k, seed, 3, 11) * 0.5;
      blob(x, y, z, r, 1.7, r);
      if (k > 9 && y > deep) pitch = -0.42; else pitch = k > 9 ? 0 : 0;
      ang += (hash3(k, seed, 1, 13) - 0.5) * 0.55;
      x += Math.cos(ang); z += Math.sin(ang); y += pitch;
      if (k > 12 && k % 17 === 0) { blob(x, y + 0.8, z, 4.5, 2.8, 4.5); halls.push({ x, y: y - 1.7, z, end: false }); }
      if (x < 6 || z < 6 || x > SX - 7 || z > SZ - 7) break;
    }
    blob(x, y + 1, z, 5.5, 3.2, 5.5);
    halls.push({ x, y: y - 1.7, z, end: true });
    return g0;
  }
  // a cave mouth: on low ground at the foot of a hill, facing into it
  function caveInto(seed, cx, cz, len, deep) {
    const top = topAt(cx, cz);
    let best = null;
    for (let a = 0; a < 16; a++) {
      const ang = a / 16 * Math.PI * 2;
      for (let d = 7; d <= 22; d++) {
        const x = Math.round(cx + Math.cos(ang) * d), z = Math.round(cz + Math.sin(ang) * d);
        if (x < 8 || z < 8 || x > SX - 9 || z > SZ - 9 || keepOut(x, z)) break;
        const t = topAt(x, z);
        if (isWater(x, t, z) || isWater(x, t + 1, z)) break;
        if (top - t >= 7 && (!best || d < best.d)) { best = { x, z, d, ang: ang + Math.PI }; break; }
      }
    }
    if (!best) return;
    const g = worm(seed, best.x + 0.5, best.z + 0.5, best.ang, len, deep);
    anchors.caves.push({ x: best.x, y: Math.round(g - 2.2) + 1, z: best.z, yaw: Math.atan2(-Math.cos(best.ang), -Math.sin(best.ang)) });      // yaw: the heading that looks into the cave
  }
  caveInto(1, 26, 86, 54, 9);           // forest hill
  caveInto(2, 44, 150, 44, 11);         // desert mesa
  caveInto(3, 108, 72, 30, 14);         // forest knoll
  // snow hills: the highest points of a few patches of the north
  for (const [i, ax, az] of [[4, 30, 24], [5, 75, 18], [6, 112, 30], [7, 150, 18]]) {
    let bx = ax, bz = az, bh = 0;
    for (let z = az - 10; z <= az + 10; z += 2) for (let x = ax - 12; x <= ax + 12; x += 2) { if (x < 10 || z < 10 || x > SX - 11) continue; const t = topAt(x, z); if (t > bh) { bh = t; bx = x; bz = z; } }
    caveInto(i, bx, bz, 60, 8);
  }
  // ore in the cave walls: coal is common, gold rarer and deeper, diamond rarest and deepest
  const open = new Set();
  for (let i = 0; i < carved.length; i += 3) open.add(carved[i] + ',' + carved[i + 1] + ',' + carved[i + 2]);
  for (let i = 0; i < carved.length; i += 3) {
    const cx = carved[i], cy = carved[i + 1], cz = carved[i + 2];
    for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0]]) {
      const x = cx + a, y = cy + b, z = cz + c, id = world.get(x, y, z);
      if (id !== B.STONE && id !== B.DEEPROCK && id !== B.SANDSTONE) continue;
      const r = hash3(x, y, z, 301);
      if (y < 13 && r < 0.022) world.set(x, y, z, K.ROCK_DIAMOND);
      else if (y < 24 && r < 0.055) world.set(x, y, z, K.ROCK_GOLD);
      else if (y < 46 && r < 0.14) world.set(x, y, z, K.ROCK_COAL);
    }
  }
  // fires burning deep in the halls (they light the cave)
  for (const hl of halls) {
    if (hl.y > 20 && !hl.end) continue;
    for (let t = 0; t < 12; t++) {
      const x = Math.round(hl.x + (hash3(t, 1, hl.z, 401) - 0.5) * 6), z = Math.round(hl.z + (hash3(t, 2, hl.x, 403) - 0.5) * 6);
      let y = Math.round(hl.y) + 3;
      while (y > 2 && world.get(x, y - 1, z) === 0) y--;
      if (!open.has(x + ',' + y + ',' + z) || world.get(x, y, z) !== 0 || world.get(x, y + 1, z) !== 0) continue;
      const below = world.get(x, y - 1, z);
      if (!below || below === B.WATER) continue;
      world.set(x, y, z, K.FIRE);
      anchors.fires.push({ x, y, z });
      break;
    }
  }

  // ---- trees and plants, on the ground as it is after the caves
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) H[x + z * SX] = topAt(x, z);
  const top = (x, z) => H[clamp(x, 0, SX - 1) + clamp(z, 0, SZ - 1) * SX];
  const taken = new Uint8Array(SX * SZ);
  const free = (x, z, r) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= SX || Z >= SZ || taken[X + Z * SX]) return false; } return true; };
  const mark = (x, z, r) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Z = z + dz; if (X >= 0 && Z >= 0 && X < SX && Z < SZ) taken[X + Z * SX] = 1; } };
  const level = (x, z) => { const t = top(x, z); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.abs(top(x + a, z + b) - t) > 1) return false; return true; };

  function oak(x, z, seed, big) {
    const y0 = top(x, z) + 1, hgt = (big ? 6 : 4) + Math.floor(hash3(x, 2, z, seed) * 2.5), R = big ? 3.3 : 2.5;
    const cy = y0 + hgt - 0.5;
    const ri = Math.ceil(R);
    for (let dy = -ri; dy <= ri; dy++) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
      const q = (dx * dx + dz * dz) / (R * R) + ((dy + 0.4) * (dy + 0.4)) / (R * R * 0.62);
      if (q > 1) continue;
      if (q > 0.72 && hash3(x + dx, cy + dy, z + dz, seed + 5) < 0.42) continue;      // a ragged edge
      putAir(x + dx, Math.round(cy + dy), z + dz, B.OAK_LEAVES);
    }
    for (let y = y0; y < y0 + hgt; y++) put(x, y, z, B.OAK);
    if (big) for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (hash3(x + dx, 9, z + dz, seed) < 0.5) put(x + dx, y0 + hgt - 2, z + dz, B.OAK);
  }
  function pine(x, z, seed, snowy) {
    const y0 = top(x, z) + 1, hgt = 7 + Math.floor(hash3(x, 3, z, seed) * 4);
    const cells2 = [];
    for (let y = y0 + 2; y <= y0 + hgt + 1; y++) {
      const t = (y - y0 - 2) / (hgt - 1), R = (1 - t) * 3.1 + 0.6 + ((y - y0) % 2 ? 0.45 : 0);
      const ri = Math.ceil(R);
      for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dz * dz > R * R) continue;
        if (world.inb(x + dx, y, z + dz) && world.get(x + dx, y, z + dz) === 0) { world.set(x + dx, y, z + dz, B.PINE_NEEDLES); cells2.push(x + dx, y, z + dz); }
      }
    }
    for (let y = y0; y < y0 + hgt; y++) put(x, y, z, B.PINE);
    if (snowy) for (let i = 0; i < cells2.length; i += 3) if (world.get(cells2[i], cells2[i + 1] + 1, cells2[i + 2]) === 0) world.set(cells2[i], cells2[i + 1], cells2[i + 2], B.PINE_SNOWY);
  }
  function palm(x, z, seed) {
    const y0 = top(x, z) + 1, hgt = 5 + Math.floor(hash3(x, 4, z, seed) * 3.5);
    const a = Math.floor(hash3(x, 5, z, seed) * 4), lx = [1, -1, 0, 0][a], lz = [0, 0, 1, -1][a];
    let px = x, pz = z;
    for (let i = 0; i < hgt; i++) {
      put(px, y0 + i, pz, B.PALM);
      if (i === Math.floor(hgt * 0.55) || i === hgt - 2) { px += lx; pz += lz; put(px, y0 + i, pz, B.PALM); }   // the trunk leans a step, joined on the same level
    }
    const ty = y0 + hgt;
    putAir(px, ty - 1, pz, B.PALM);
    // the crown: a tuft on top, a ring round it, four long fronds that droop and four short ones between them
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) putAir(px + dx, ty, pz + dz, B.PALM_FROND);
    putAir(px, ty + 1, pz, B.PALM_FROND);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      putAir(px + dx * 2, ty, pz + dz * 2, B.PALM_FROND);
      putAir(px + dx * 3, ty - 1, pz + dz * 3, B.PALM_FROND); putAir(px + dx * 3, ty, pz + dz * 3, B.PALM_FROND);
      putAir(px + dx * 4, ty - 1, pz + dz * 4, B.PALM_FROND); putAir(px + dx * 4, ty - 2, pz + dz * 4, B.PALM_FROND);
    }
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { putAir(px + dx * 2, ty - 1, pz + dz * 2, B.PALM_FROND); putAir(px + dx * 2, ty - 1, pz + dz, B.PALM_FROND); }
  }

  // the tree that stands in front of the player at the start (the first thing to chop)
  const SP = SITE.spawn;
  oak(SP.x, SP.z - 5, 17, false); mark(SP.x, SP.z - 5, 3);
  mark(SP.x, SP.z, 8);
  for (let z = 4; z < SZ - 4; z++) for (let x = 4; x < SX - 4; x++) {
    const t = top(x, z), id = world.get(x, t, z);
    if (world.get(x, t + 1, z) !== 0) continue;
    const r = hash3(x, 0, z, 501), land = landOf(x, z);
    const w = weights(x, z);
    if (id === B.GRASS && level(x, z)) {
      const glade = N.fbm2(x / 22 + 9, z / 22, 2);      // clearings and thickets
      const dens = 0.075 * smooth(-0.4, 0.2, glade);
      if (r < dens && free(x, z, 2)) { oak(x, z, 31 + (x & 7), hash3(x, 9, z, 7) < 0.25); mark(x, z, 2); anchors.trees++; continue; }
    }
    if ((id === B.SNOW || id === B.SNOWBLOCK || id === B.SNOWROCK || (id === B.GRASS && w.snow > 0.15)) && level(x, z) && r < 0.05 && free(x, z, 2)) { pine(x, z, 41, id !== B.GRASS); mark(x, z, 2); anchors.trees++; continue; }
    if (id === B.SAND && level(x, z)) {
      const nearHole = Math.hypot(x - SITE.hole.x, z - SITE.hole.z) < 10, nearBeach = w.sea > -14 && w.sea < -3 && land !== 'snow';
      const dens = nearHole ? 0.12 : nearBeach ? 0.022 : 0.0025;
      if (r < dens && free(x, z, 3)) { palm(x, z, 51); mark(x, z, 3); anchors.trees++; continue; }
    }
  }
  // ground plants
  for (let z = 3; z < SZ - 3; z++) for (let x = 3; x < SX - 3; x++) {
    const t = top(x, z), id = world.get(x, t, z);
    if (world.get(x, t + 1, z) !== 0 || keepOut(x, z) && Math.hypot(x - SP.x, z - SP.z) < 3) continue;
    const r = hash3(x, 1, z, 601);
    if (id === B.GRASS) {
      const nearPond = Math.hypot((x - SITE.pond.x) / (SITE.pond.rx + 1.5), (z - SITE.pond.z) / (SITE.pond.rz + 1.5)) < 1.15;
      if (nearPond && r < 0.35) world.set(x, t + 1, z, B.REED);
      else if (r < 0.15) world.set(x, t + 1, z, B.TUFT);
      else if (r < 0.165) world.set(x, t + 1, z, B.FLOWER_R);
      else if (r < 0.18) world.set(x, t + 1, z, B.FLOWER_Y);
      else if (r < 0.19) world.set(x, t + 1, z, B.FLOWER_B);
    } else if (id === B.SAND && weights(x, z).sea < -2) {
      if (r < 0.014) world.set(x, t + 1, z, B.SHRUB);
    } else if (id === B.SNOW && r < 0.006) world.set(x, t + 1, z, B.SHRUB);
  }

  const groundY = (x, z) => top(Math.floor(x), Math.floor(z)) + 1;
  anchors.spawn = { x: SP.x + 0.5, y: groundY(SP.x, SP.z), z: SP.z + 0.5, yaw: 0 };
  return { world, anchors, heightF, landOf, weights, groundY, coastX };
}
