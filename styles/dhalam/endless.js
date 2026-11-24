// The endless highlands of "dhalam" (the game only; the shots keep the hand-made valley on its own).
//
// The hand-made valley (world.js generateWorld) is the home at the middle of a world 8192 blocks a side; round it the
// highlands go on in every direction, made a chunk at a time the first time a chunk is needed (shared/stream.js
// PagedWorld), the same every time: moors of heath and pine forest, rocky ground terraced into cliffs, misty lakes,
// snow on the high tops, caves with ore and crystal, and now and then a ruin, an old fog tower or a chasm.
//
// Near the valley the height of the land is a blend of the valley's own height function (which goes on outside the
// map) and the highlands', so there is no edge. Every feature the mysteries need (mysteries.js) is told by
// featuresNear(); they are pure functions of their region, so a chunk made again is made the same.
//
//   const E = createEndless({ home: world, meta, K });  E.world (PagedWorld), E.treesOf(cx, cz), E.featuresNear(x, z, r)

import { PagedWorld } from '../../shared/stream.js';
import { makeNoise, hash3 } from '../../shared/noise.js';
import { B, WL, SX as HX, SZ as HZ, columnH } from './world.js';

export const SIZE = 8192, C = 32, OX = 4000, OZ = 4000;       // OX, OZ: where the corner of the hand-made map lies (chunk-aligned)
export const BLEND = 56;                                     // blocks outside the map over which its land turns into the highlands
const SY = 84;

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** The four kinds of place the mysteries live in, and where the first of each stands (map coordinates, near home). */
const FIRST = [
  { kind: 'tower', lx: 214, lz: 108 },
  { kind: 'chasm', lx: 118, lz: -52 },
  { kind: 'ruin', lx: -46, lz: 74 },
];
const RG = 176;                                              // one feature at most in each RG x RG region

export function createEndless({ home, meta, K }) {
  const t0 = performance.now();
  const N1 = makeNoise(5101), N2 = makeNoise(5203), N3 = makeNoise(5309), N4 = makeNoise(5407), N5 = makeNoise(5501), N6 = makeNoise(5603), NC = makeNoise(5711);

  // ------------------------------------------------------------------ height
  /** The highlands on their own, before the blend with the valley (float). */
  function wildH(x, z) {
    const big = N1.fbm2(x / 170, z / 170, 4);                  // broad uplands
    const mt = sstep(0.02, 0.42, N4.fbm2(x / 420 + 3.3, z / 420 - 7.1, 3));       // where the mountains stand
    const rid = N2.ridge2(x / 96 + 5.2, z / 96 - 3.7, 4);
    const fine = N3.fbm2(x / 21, z / 21, 3);
    let h = 27 + big * 13 + mt * (8 + rid * rid * 40) + fine * (1.4 + mt * 2.5);
    // terraced cliffs where the ground is rocky, as in the valley
    const rk = sstep(0.1, 0.5, N5.fbm2(x / 34 + 9, z / 34 - 4, 3) + (h - 38) / 36);
    if (rk > 0 && h > WL + 3) { const f = h / 6, fl = Math.floor(f), fr = f - fl; h = lerp(h, (fl + sstep(0.55, 0.95, fr)) * 6, rk * 0.75); }
    // misty lakes in the low basins
    const lk = N6.fbm2(x / 230 + 11, z / 230 - 7, 3);
    const lm = sstep(-0.16, -0.3, lk) * (1 - mt * 0.85);
    if (lm > 0) h = lerp(h, WL - 2 - 5 * sstep(-0.3, -0.46, lk), lm);
    return h;
  }
  const outside = (x, z) => Math.max(OX - x, x - (OX + HX - 1), OZ - z, z - (OZ + HZ - 1), 0);
  /** Height of column (x, z) of the world, float; the valley's own function inside and near the map. */
  function heightF(x, z) {
    const d = outside(x, z);
    if (d >= BLEND) return wildH(x, z);
    const hv = columnH(x - OX, z - OZ);
    if (d <= 0) return hv;
    return lerp(hv, wildH(x, z), sstep(0, BLEND, d));
  }
  const heightAt = (x, z) => Math.max(2, Math.min(SY - 14, Math.round(heightF(x, z))));
  /** How much of the highlands' own look a column has (0 in the valley, 1 well outside it). */
  const wildness = (x, z) => sstep(0, BLEND, outside(x, z));
  const forestAt = (x, z) => N3.fbm2(x / 88 - 21, z / 88 + 13, 3);           // > 0: pine forest; below: open moor
  const rockyAt = (x, z, h) => sstep(0.1, 0.5, N5.fbm2(x / 34 + 9, z / 34 - 4, 3) + (h - 38) / 36);

  // ------------------------------------------------------------------ features (ruins, towers, chasms)
  const feats = new Map();
  /** The feature of region (rx, rz), or null. Pure: the same region always gives the same feature. */
  function featureOf(rx, rz) {
    const key = rx * 4096 + rz;
    if (feats.has(key)) return feats.get(key);
    let f = null;
    // the first three stand where the forced spots say; no region near the map has another
    const x0 = rx * RG, z0 = rz * RG;
    const first = FIRST.find((q) => { const x = OX + q.lx, z = OZ + q.lz; return x >= x0 && x < x0 + RG && z >= z0 && z < z0 + RG; });
    if (first) f = makeFeature(first.kind, OX + first.lx, OZ + first.lz, rx, rz);
    else {
      const cx = x0 + 34 + Math.floor(hash3(rx, 1, rz, 901) * (RG - 68)), cz = z0 + 34 + Math.floor(hash3(rx, 2, rz, 903) * (RG - 68));
      if (outside(cx, cz) > 70) {
        const r = hash3(rx, 3, rz, 905);
        const kind = r < 0.3 ? 'ruin' : r < 0.52 ? 'tower' : r < 0.7 ? 'chasm' : null;
        if (kind) f = makeFeature(kind, cx, cz, rx, rz);
      }
    }
    if (feats.size > 600) feats.clear();
    feats.set(key, f);
    return f;
  }
  /** Every feature whose middle is within r of (x, z). */
  function featuresNear(x, z, r) {
    const out = [];
    for (let rz = Math.floor((z - r) / RG); rz <= Math.floor((z + r) / RG); rz++) for (let rx = Math.floor((x - r) / RG); rx <= Math.floor((x + r) / RG); rx++) {
      const f = featureOf(rx, rz);
      if (f && Math.hypot(f.x - x, f.z - z) <= r + f.R) out.push(f);
    }
    return out;
  }
  /** The feature whose footprint holds column (x, z) (with a margin), or null. */
  function featureAt(x, z, margin = 0) {
    for (const f of featuresNear(x, z, 40)) if (Math.abs(x - f.x) <= f.R + margin && Math.abs(z - f.z) <= f.R + margin) return f;
    return null;
  }

  /**
   * A feature: its middle, its reach R (the stamp covers [x - R, x + R] x [z - R, z + R]), the ground it stands on (g),
   * and `cells`: a Map of "x,y,z" -> block id written over the land, plus what the mysteries need to know.
   */
  function makeFeature(kind, x, z, rx, rz) {
    const seed = rx * 7919 + rz * 104729;
    const g = Math.max(WL + 3, heightAt(x, z));
    const f = { kind, x, z, g, R: 0, cells: new Map(), cols: new Map(), seed, key: kind + ':' + x + ',' + z };
    const put = (cx, cy, cz, id) => f.cells.set(cx + ',' + cy + ',' + cz, id);
    // a column levelled to height top (rock under it up from deep down, air above it up to clear)
    const level = (cx, cz, top, clear, id = B.ROCK) => f.cols.set(cx + ',' + cz, { top, clear, id });
    const rnd = (i) => hash3(seed, i, 77, 911);
    if (kind === 'ruin') buildRuin(f, put, level, rnd);
    else if (kind === 'tower') buildTower(f, put, level, rnd);
    else buildChasm(f, put, level, rnd);
    return f;
  }

  // a ruined hall round a clock room. The clock room: gears in its north wall, the dials that say how to set them
  // over its door, and behind the gears a vault with a chest and a passage of time
  function buildRuin(f, put, level, rnd) {
    const { x, z, g } = f;
    f.R = 9;
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d <= 7) level(x + dx, z + dz, g, g + 9, B.BRICK);
      else if (d === 8) level(x + dx, z + dz, g, g, B.ROCK);
    }
    const brick = (cx, cy, cz) => put(cx, cy, cz, hash3(cx, cy, cz, 31) < 0.4 ? B.BRICK_MOSS : B.BRICK);
    // the outer hall: walls 15 x 15, eroded, with a gap on each side
    for (let i = -7; i <= 7; i++) for (const [ax, az] of [[i, -7], [i, 7], [-7, i], [7, i]]) {
      if (Math.abs(i) <= 1 && (az === 7 || ax === -7)) continue;                                // two ways in
      const top = Math.round(1 + rnd(40 + i * 4 + (ax === 7 ? 1 : 0) + (az === 7 ? 2 : 0)) * 5 - (Math.abs(i) < 4 ? 1.5 : 0));
      for (let y = 1; y <= top; y++) brick(x + ax, g + y, z + az);
    }
    // the clock room: inside x 0..3, z 0..3 (from x - 2, z - 2), walls around, a roof at 4; door in the south wall
    const ox = x - 2, oz = z - 1;
    const room = (lx, lz, y, id) => put(ox + lx, g + y, oz + lz, id);
    for (let lz = -5; lz <= 4; lz++) for (let lx = -1; lx <= 4; lx++) {
      const wall = lx === -1 || lx === 4 || lz === -1 || lz === 4 || lz === -5;
      for (let y = 1; y <= 3; y++) room(lx, lz, y, wall ? B.WARD : 0);
      room(lx, lz, 4, B.WARD);
      room(lx, lz, 0, B.WARD);
      if (rnd(200 + lx * 13 + lz) < 0.55) room(lx, lz, 5, B.BRICK_MOSS);                         // rubble on the roof
    }
    // the door (two wide) into the clock room, from the south
    for (const lx of [1, 2]) for (const y of [1, 2]) room(lx, 4, y, 0);
    // the vault behind: lz -4..-2; the secret door in the wall between (lz = -1), under the gears
    f.target = [0, 1, 2, 3].map((i) => Math.floor(rnd(300 + i) * 4));
    f.gears = [0, 1, 2, 3].map((i) => ({ x: ox + i, y: g + 3, z: oz - 1 }));
    f.dials = [0, 1, 2, 3].map((i) => ({ x: ox + 3 - i, y: g + 3, z: oz + 4 }));      // seen from inside, left to right like the gears
    f.door = [];
    for (const lx of [1, 2]) for (const y of [1, 2]) { room(lx, -1, y, B.SECRET); f.door.push({ x: ox + lx, y: g + y, z: oz - 1 }); }
    f.gears.forEach((p, i) => { let s = Math.floor(rnd(400 + i) * 4); if (s === f.target[i]) s = (s + 1 + Math.floor(rnd(410 + i) * 3)) % 4; put(p.x, p.y, p.z, B.GEAR0 + s); });
    f.dials.forEach((p, i) => put(p.x, p.y, p.z, B.DIAL0 + f.target[i]));
    f.chest = { x: ox + 1, y: g + 1, z: oz - 4 };
    put(f.chest.x, f.chest.y, f.chest.z, K.CHEST);
    f.gate = { x: ox + 3, y: g + 1, z: oz - 3 };
    put(f.gate.x, f.gate.y, f.gate.z, B.TIMEGATE);
    // a few fallen blocks in the hall and a dead pine by the wall
    for (let i = 0; i < 9; i++) { const dx = Math.round((rnd(500 + i) - 0.5) * 12), dz = Math.round((rnd(520 + i) - 0.5) * 12); if (Math.abs(dx) > 4 || dz > 4 || dz < -6) brick(x + dx, g + 1, z + dz); }
    f.room = { x0: ox - 1, x1: ox + 4, z0: oz - 5, z1: oz + 4 };
  }

  // an old fog tower: a hollow round tower 20 high, a socket for a glowing crystal at its foot inside, the crystal
  // that burns at the top once the socket is fed; glowing ore in the rocks round its foot
  function buildTower(f, put, level, rnd) {
    const { x, z, g } = f;
    f.R = 7;
    const H = 18 + Math.floor(rnd(1) * 5);
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) if (Math.hypot(dx, dz) <= 6.2) level(x + dx, z + dz, g, g + H + 4, Math.hypot(dx, dz) < 3.6 ? B.BRICK : B.ROCK);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const r = Math.hypot(dx, dz);
      if (r > 3.4) continue;
      const wall = r > 2.2;
      for (let y = 1; y <= H; y++) {
        if (!wall) { put(x + dx, g + y, z + dz, 0); continue; }
        if (dz === 3 && Math.abs(dx) <= 0 && y <= 3) { put(x + dx, g + y, z + dz, 0); continue; }        // the door, facing south
        if (y > H - 4 && rnd(60 + dx * 7 + dz * 3 + y) < 0.3) continue;                              // broken battlements
        if ((y % 5 === 3) && (dx === 0 || dz === 0) && dz !== 3) { put(x + dx, g + y, z + dz, 0); continue; }      // slits
        put(x + dx, g + y, z + dz, hash3(x + dx, y, z + dz, 33) < 0.35 ? B.BRICK_MOSS : B.BRICK);
      }
    }
    // a stair of planks up the inside wall to a floor under the crystal
    const ring = [[-1, 1], [-2, 0], [-1, -1], [0, -2], [1, -1], [2, 0], [1, 1], [0, 2]];
    for (let y = 1; y < H - 1; y++) { const [dx, dz] = ring[(y - 1) % ring.length]; put(x + dx, g + y, z + dz, B.PLANKS); }
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dz) < 2.2 && !(dx === 0 && dz === 0)) put(x + dx, g + H - 1, z + dz, B.PLANKS);
    f.socket = { x, y: g + 1, z };
    put(x, g + 1, z, B.SOCKET);
    f.top = { x, y: g + H, z };
    put(x, g + H - 1, z, B.BRICK);
    put(x, g + H, z, B.BEACON);
    // glowing ore in two boulders by the door
    for (const [bx, bz] of [[4, 4], [-4, 5]]) for (let dy = 1; dy <= 2; dy++) for (const [ex, ez] of [[0, 0], [1, 0], [0, 1]]) {
      put(x + bx + ex, g + dy, z + bz + ez, dy === 2 && ex + ez === 0 ? B.ORE_GLOW : (ex === 1 && dy === 1 ? B.ORE_GLOW : B.ROCK_MOSS));
    }
    // where the hidden place shows itself once the crystal burns: off to one side, 22..34 blocks away
    const a = rnd(5) * Math.PI * 2, d = 22 + rnd(6) * 12;
    f.hidden = { x: Math.round(x + Math.cos(a) * d), z: Math.round(z + Math.sin(a) * d) };
  }

  // a chasm round an island of rock: a chest on the island, and a bridge of shadow-and-light stones across, seen only
  // in lantern light; a torch at its near end shows the first stones
  function buildChasm(f, put, level, rnd) {
    const { x, z, g } = f;
    f.R = 13;
    const dir = Math.floor(rnd(1) * 4), [ax, az] = [[0, 1], [1, 0], [0, -1], [-1, 0]][dir];
    for (let dz = -13; dz <= 13; dz++) for (let dx = -13; dx <= 13; dx++) {
      const r = Math.hypot(dx, dz) + (hash3(x + dx, 5, z + dz, 41) - 0.5) * 0.8;
      if (r <= 4.2) level(x + dx, z + dz, g, g + 12, B.ROCK_MOSS);
      else if (r <= 10.2) level(x + dx, z + dz, 3 + Math.floor(hash3(x + dx, 6, z + dz, 43) * 3), g + 14, B.GRAVEL);
      else if (r <= 12.8) level(x + dx, z + dz, g, g + 10, r < 11.5 ? B.ROCK : B.HEATH);
    }
    // the bridge: two wide, from the rim (r 10.5) to the island (r 4)
    f.glim = [];
    const px = -az, pz = ax;                                                    // across the bridge
    for (let s = 4; s <= 10; s++) for (const w of [0, 1]) {
      const bx = x + ax * s + px * w, bz = z + az * s + pz * w;
      put(bx, g, bz, B.GLIM_OFF);
      f.glim.push({ x: bx, y: g, z: bz });
    }
    f.head = { x: x + ax * 12, z: z + az * 12 };
    put(x + ax * 12 - px, g + 1, z + az * 12 - pz, K.TORCH);
    f.torch = { x: x + ax * 12 - px, y: g + 1, z: z + az * 12 - pz };
    f.chest = { x: x - ax, y: g + 1, z: z - az };
    put(f.chest.x, f.chest.y, f.chest.z, K.CHEST);
    // a standing stone with glowing ore beside the chest: what draws the eye across
    for (let y = 1; y <= 3; y++) put(x + px * 2, g + y, z + pz * 2, y === 3 ? B.ORE_GLOW : B.ROCK_MOSS);
    f.dir = [ax, az];
  }

  // ------------------------------------------------------------------ caves and ore
  const caveAt = (x, y, z) => {
    const a = NC.n3(x / 30, y / 17, z / 30), b = NC.n3(x / 30 + 41.3, y / 17 + 7.7, z / 30 - 19.1);
    return a * a + b * b < 0.0088;
  };
  const caveZone = (x, z) => N4.fbm2(x / 140 - 17, z / 140 + 5, 2) > -0.02;

  // ------------------------------------------------------------------ one chunk
  const W = C + 2, HC = new Int16Array(W * W);               // heights of the chunk and a ring round it (for slopes)
  const treesBy = new Map();                                  // chunk key -> trees standing in it (as made)
  const torchesBy = new Map();
  const homeTrees = new Map();
  for (const tr of meta.trees) {                              // the valley's pines, by the chunk they stand in (meta is in world coordinates)
    const k = Math.floor(tr.x / C) * Math.ceil(SIZE / C) + Math.floor(tr.z / C);
    if (!homeTrees.has(k)) homeTrees.set(k, []);
    homeTrees.get(k).push(tr);
  }
  const homeData = home.data, hsx = home.sx, hsz = home.sz;
  const inHome = (cx, cz) => cx * C >= OX && cx * C < OX + HX && cz * C >= OZ && cz * C < OZ + HZ;

  function fillChunk(cx, cz, d) {
    const X0 = cx * C, Z0 = cz * C, key = cx * Math.ceil(SIZE / C) + cz;
    if (inHome(cx, cz)) {
      // the hand-made valley, cell for cell
      for (let y = 0; y < SY; y++) for (let z = 0; z < C; z++) {
        const s = (X0 - OX) + hsx * ((Z0 - OZ + z) + hsz * y), t = (z << 5) + (y << 10);
        for (let x = 0; x < C; x++) d[t + x] = homeData[s + x];
      }
      treesBy.set(key, homeTrees.get(key) || []);
      return null;
    }
    for (let z = -1; z <= C; z++) for (let x = -1; x <= C; x++) HC[(x + 1) + (z + 1) * W] = heightAt(X0 + x, Z0 + z);
    const trees = [];
    const near = featuresNear(X0 + C / 2, Z0 + C / 2, C);
    const inFeat = (x, z, m) => { for (const f of near) if (Math.abs(x - f.x) <= f.R + m && Math.abs(z - f.z) <= f.R + m) return f; return null; };
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const wx = X0 + x, wz = Z0 + z;
      const h = HC[(x + 1) + (z + 1) * W];
      const slope = Math.max(Math.abs(HC[(x + 2) + (z + 1) * W] - h), Math.abs(HC[x + (z + 1) * W] - h), Math.abs(HC[(x + 1) + (z + 2) * W] - h), Math.abs(HC[(x + 1) + z * W] - h));
      const rk = rockyAt(wx, wz, h), r1 = hash3(wx, 3, wz, 5), r2 = hash3(wx, 9, wz, 7);
      const fo = forestAt(wx, wz);
      let kind;
      if (h <= WL) kind = 'bed';
      else if (h <= WL + 1) kind = r1 < 0.8 ? 'gravel' : 'rock';
      else if (slope >= 3 || rk > 0.62 + r1 * 0.2) kind = 'rock';
      else kind = fo > 0.02 ? 'forest' : 'moor';
      const col = (z << 5) + x;
      for (let y = 0; y <= h; y++) {
        let id = B.ROCK;
        const dd = h - y;
        if (kind === 'bed') id = dd < 2 ? (r1 < 0.6 ? B.GRAVEL : B.SOIL) : B.ROCK;
        else if (kind === 'gravel') id = dd < 2 ? B.GRAVEL : B.ROCK;
        else if (kind === 'rock') {
          if (dd === 0) { if (h > 57 + r2 * 5) id = B.SNOW; else if (h < 52 && r2 < 0.7 - (h - 20) * 0.006) id = B.ROCK_MOSS; }
          else if (dd <= 2 && h < 46 && r2 < 0.25) id = B.ROCK_MOSS;
        } else {
          if (dd === 0) id = h > 58 + r2 * 4 ? B.SNOW : kind === 'forest' ? (fo < 0.12 && r2 < 0.5 ? B.HEATH : B.LITTER) : (r2 < 0.12 ? B.ROCK_MOSS : B.HEATH);
          else if (dd < 3) id = B.SOIL;
        }
        if (y === 0) id = B.ROCK;
        d[col + (y << 10)] = id;
      }
      // water: the valley's lake stays the valley's (it is inside the map); the highlands' lakes are meres
      for (let y = h + 1; y <= WL; y++) d[col + (y << 10)] = B.MERE;
    }
    // caves: winding tunnels under the ground, now and then breaking out on a hill side
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const wx = X0 + x, wz = Z0 + z;
      if (!caveZone(wx, wz)) continue;
      const h = HC[(x + 1) + (z + 1) * W];
      const mouth = h > WL + 6 && N2.n2(wx / 23 + 3.1, wz / 23 - 8.4) > 0.5;
      const top = mouth ? h : h - 4;
      const col = (z << 5) + x;
      // never under a lake or beside one: the water would hang in the air of the cave
      const low = Math.min(h, HC[(x + 2) + (z + 1) * W], HC[x + (z + 1) * W], HC[(x + 1) + (z + 2) * W], HC[(x + 1) + z * W]) <= WL + 1;
      for (let y = 3; y <= top; y++) if (caveAt(wx, y, wz)) {
        if (low && y <= WL + 3) continue;
        const i = col + (y << 10), id = d[i];
        if (id === B.MERE) continue;
        d[i] = 0;
      }
    }
    // ore in the rock: on cave walls, cliff faces and in veins; what kind by depth
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const wx = X0 + x, wz = Z0 + z, h = HC[(x + 1) + (z + 1) * W], col = (z << 5) + x;
      for (let y = 2; y <= h; y++) {
        const i = col + (y << 10);
        if (d[i] !== B.ROCK) continue;
        const open = (x > 0 && !d[i - 1]) || (x < C - 1 && !d[i + 1]) || (z > 0 && !d[i - 32]) || (z < C - 1 && !d[i + 32]) || !d[i + 1024] || !d[i - 1024];
        const r = hash3(wx, y, wz, 61);
        const deep = h - y;
        // open faces deep down (cave walls) show ore often, the land's own cliffs seldom; veins wait inside the rock
        const p = open ? (deep > 3 ? 0.06 : 0.006) : r < 0.3 && Math.abs(N5.n3(wx / 9, y / 5, wz / 9)) < 0.045 && N6.n3(wx / 31, y / 19, wz / 31) > 0.28 ? 0.3 : 0;
        if (r >= p) continue;
        const q = hash3(wx, y, wz, 67);
        let ore = 0;
        if (y < 12 && q < 0.12) ore = K.ROCK_DIAMOND;
        else if (y < 22 && q < 0.2) ore = K.ROCK_RUBY;
        else if (y < 24 && q < 0.34) ore = K.ROCK_AMETHYST;
        else if (y < 30 && q < 0.42) ore = K.ROCK_GOLD;
        else if (y > 36 && q < 0.5) ore = K.ROCK_EMERALD;
        else if (q < 0.62 && deep > 2) ore = B.ORE_GLOW;
        else if (q < 0.8) ore = B.ORE_IRON;
        else ore = K.ROCK_COAL;
        d[i] = ore;
      }
    }
    // the features: a column levelled under them, their blocks written over the land
    for (const f of near) {
      for (const [k, c] of f.cols) {
        const [fx, fz] = k.split(',').map(Number);
        if (fx < X0 || fx >= X0 + C || fz < Z0 || fz >= Z0 + C) continue;
        const col = ((fz - Z0) << 5) + (fx - X0);
        for (let y = 1; y <= c.top; y++) d[col + (y << 10)] = y === c.top ? c.id : c.id === B.HEATH && y >= c.top - 2 ? B.SOIL : B.ROCK;
        for (let y = c.top + 1; y <= Math.min(SY - 1, c.clear); y++) d[col + (y << 10)] = 0;
      }
      for (const [k, id] of f.cells) {
        const [fx, fy, fz] = k.split(',').map(Number);
        if (fx < X0 || fx >= X0 + C || fz < Z0 || fz >= Z0 + C || fy < 1 || fy >= SY) continue;
        d[((fz - Z0) << 5) + (fx - X0) + (fy << 10)] = id;
      }
      if (f.torch && f.torch.x >= X0 && f.torch.x < X0 + C && f.torch.z >= Z0 && f.torch.z < Z0 + C) { if (!torchesBy.has(key)) torchesBy.set(key, []); torchesBy.get(key).push(f.torch); }
    }
    // pines: on the forest floor (fewer on the moor), in a loose grid of 4 x 4 cells
    const cell = 4;
    for (let gz = Z0 / cell; gz < (Z0 + C) / cell; gz++) for (let gx = X0 / cell; gx < (X0 + C) / cell; gx++) {
      const x = gx * cell + Math.floor(hash3(gx, 1, gz, 61) * cell) - X0, z = gz * cell + Math.floor(hash3(gx, 2, gz, 61) * cell) - Z0;
      if (x < 1 || z < 1 || x > C - 2 || z > C - 2) continue;
      const wx = X0 + x, wz = Z0 + z, h = HC[(x + 1) + (z + 1) * W];
      const col = (z << 5) + x, id = d[col + (h << 10)];
      if (d[col + ((h + 1) << 10)] || (id !== B.LITTER && id !== B.HEATH && id !== B.ROCK_MOSS)) continue;
      if (inFeat(wx, wz, 3)) continue;
      const fo = forestAt(wx, wz);
      let p = id === B.LITTER ? 0.42 + fo * 1.3 + N1.fbm2(wx / 37, wz / 37, 2) * 0.35 : id === B.HEATH ? 0.06 + Math.max(0, fo) * 0.5 : 0.04;
      if (h > 52) p *= 0.45;
      if (hash3(gx, 3, gz, 61) > p) continue;
      const r = hash3(gx, 4, gz, 61), seed = gx * 131 + gz * 7;
      if (r < 0.07) {
        const Hh = 5 + Math.floor(hash3(gx, 5, gz, 61) * 5);
        for (let y = h + 1; y <= h + Hh && y < SY - 2; y++) d[col + (y << 10)] = B.TRUNK;
        trees.push({ x: wx, z: wz, g: h, h: Hh, snag: true });
        continue;
      }
      const Hh = Math.round(9 + hash3(gx, 5, gz, 61) * 9 + fo * 3 - (h > 50 ? 3 : 0));
      const trunkTop = h + Math.max(5, Math.round(Hh * 0.5));
      if (trunkTop + Hh * 0.6 > SY - 2) continue;
      for (let y = h + 1; y <= trunkTop; y++) d[col + (y << 10)] = B.TRUNK;
      trees.push({ x: wx, z: wz, g: h, h: Hh, seed, trunkTop: trunkTop + 1 });
    }
    // undergrowth, reeds by the meres, and a boulder here and there
    for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) {
      const wx = X0 + x, wz = Z0 + z, col = (z << 5) + x;
      let t = SY - 2; while (t > 1 && !d[col + (t << 10)]) t--;
      const id = d[col + (t << 10)];
      if (d[col + ((t + 1) << 10)] || t >= SY - 2) continue;
      const r = hash3(wx, 11, wz, 71);
      if (id === B.LITTER) { if (r < 0.06) d[col + ((t + 1) << 10)] = B.FERN; else if (r > 0.975) d[col + ((t + 1) << 10)] = B.DRYGRASS; }
      else if (id === B.HEATH) { if (r < 0.11) d[col + ((t + 1) << 10)] = B.DRYGRASS; else if (r > 0.96) d[col + ((t + 1) << 10)] = B.FERN; }
      else if (id === B.GRAVEL && t === WL + 1) { if (r < 0.25) d[col + ((t + 1) << 10)] = B.REEDS; }
      else if (id === B.ROCK_MOSS) { if (r < 0.03) d[col + ((t + 1) << 10)] = B.DRYGRASS; }
      if ((id === B.HEATH || id === B.GRAVEL) && r > 0.9985 && x > 2 && z > 2 && x < C - 3 && z < C - 3 && !inFeat(wx, wz, 2)) {
        for (let dy = 0; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (Math.hypot(dx, dy * 1.6, dz) + hash3(wx + dx, dy, wz + dz, 3) * 0.6 > 1.6) continue;
          d[col + dx + (dz << 5) + ((t + 1 + dy) << 10)] = hash3(wx + dx, dy, wz + dz, 8) < 0.55 ? B.ROCK_MOSS : B.ROCK;
        }
      }
    }
    treesBy.set(key, trees);
    return null;
  }

  const world = new PagedWorld({ sx: SIZE, sy: SY, sz: SIZE, chunk: C, generate: fillChunk });
  const api = {
    world, heightAt, heightF, wildness, forestAt, featuresNear, featureAt, OX, OZ, C, SIZE,
    /** The pines (and dead snags) made in chunk (cx, cz); the valley's own ones in its chunks. */
    treesOf(cx, cz) { world.chunk(cx, cz); return treesBy.get(cx * Math.ceil(SIZE / C) + cz) || []; },
    /** The torches the land put down in chunk (cx, cz) (they burn like the kit's). */
    torchesOf(cx, cz) { world.chunk(cx, cz); return torchesBy.get(cx * Math.ceil(SIZE / C) + cz) || []; },
    /** Forget what belongs to a chunk that the world forgot (it is made again, the same, if needed). */
    prune() { for (const m of [treesBy, torchesBy]) for (const k of m.keys()) { const cx = Math.floor(k / Math.ceil(SIZE / C)), cz = k - cx * Math.ceil(SIZE / C); if (!world.has(cx, cz)) m.delete(k); } },
    /** Colour and height of the land at (x, z) for the far view: out = [r, g, b, height, water]. */
    farSample(x, z, out) {
      const hf = heightF(x, z), h = Math.round(hf);
      // the far land's colours are those of the valley's old far view: dark under the overcast, pale only on the snow
      if (h <= WL) { out[0] = 0.012; out[1] = 0.017; out[2] = 0.022; out[3] = WL + 0.8; out[4] = 1; return out; }
      const rk = rockyAt(x, z, h), fo = forestAt(x, z), sl = Math.abs(heightF(x + 3, z) - hf) + Math.abs(heightF(x, z + 3) - hf);
      let r, g, b;
      if (h > 58) { r = 0.13; g = 0.145; b = 0.17; }
      else if (sl > 4.5 || rk > 0.7) { r = 0.04; g = 0.046; b = 0.055; }
      else if (fo > 0.02) { r = 0.014; g = 0.021; b = 0.019; }
      else { r = 0.045; g = 0.042; b = 0.034; }
      const m = 0.85 + 0.3 * N3.fbm2(x / 19, z / 19, 2);
      out[0] = r * m; out[1] = g * m; out[2] = b * m; out[3] = hf; out[4] = 0;
      return out;
    },
    ms: 0,
  };
  api.ms = performance.now() - t0;
  return api;
}
