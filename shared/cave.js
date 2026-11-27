// The cave: a way down into the ground, carved fresh for the day (a different cave tomorrow), with torches
// along it, a fire burning in its hall, and veins of coal, gold and diamond in its walls. Everyone in the same world on the same day gets the
// same cave, so friends in a shared game walk the same tunnels.
//
//   const cave = makeCave({ play, kit, rnd, spawn });      -> { mouth: { x, y, z }, cells, coal, gold, diamond, fires } | null

import { K } from './kit.js';

export function makeCave({ play, kit, rnd, spawn }) {
  const w = kit.world, solid = (x, y, z) => w.inb(x, y, z) && play.isSolid(w.get(x, y, z)), wet = (x, y, z) => w.inb(x, y, z) && play.isLiquid(w.get(x, y, z));
  const A = w.area || { x0: 0, z0: 0, x1: w.sx, z1: w.sz };      // where the mouth may be: all of a small world, a square round the start of an endless one
  const top = (x, z) => { for (let y = w.sy - 3; y > 1; y--) if (solid(x, y - 1, z)) return w.get(x, y, z) === 0 ? y : null; return null; };
  // the mouth: open, fairly level ground with plenty of rock under it, not on top of the start
  let mouth = null, dir = null;
  for (let i = 0; i < 400 && !mouth; i++) {
    const x = A.x0 + 16 + Math.floor(rnd() * (A.x1 - A.x0 - 32)), z = A.z0 + 16 + Math.floor(rnd() * (A.z1 - A.z0 - 32)), y = top(x, z), d = Math.hypot(x - spawn.x, z - spawn.z);
    if (y === null || y < 13 || d < 16 || d > 90) continue;
    const a = Math.floor(rnd() * 4), dx = [1, -1, 0, 0][a], dz = [0, 0, 1, -1][a];
    let ok = true;
    for (let k = -2; k <= 26 && ok; k++) { const t = top(x + dx * k, z + dz * k); if (t === null || Math.abs(t - y) > (k < 4 ? 1 : 7)) ok = false; }
    // where the hall will really be: the stair goes 18 paces and down one step every two (8 in all), the hall 4 paces on.
    // (This looked at pace 14 before, so a hall could fall under a lake and fill with water: the dark world, 27 November.)
    const hx = x + dx * 22, hz = z + dz * 22, hy = y - 8 + 2;
    for (let yy = hy - 3; yy <= hy + 4 && ok; yy++) if (!solid(hx, yy, hz)) ok = false;                     // rock all through the hall's middle
    for (let oy = -4; oy <= 5 && ok; oy++) for (let oz = -8; oz <= 8 && ok; oz += 2) for (let ox = -8; ox <= 8 && ok; ox += 2) if (wet(hx + ox, hy + oy, hz + oz)) ok = false;      // and no water in or around it
    for (let k = 0; k <= 22 && ok; k++) for (let yy = y - 9; yy <= y + 3 && ok; yy++) if (wet(x + dx * k, yy, z + dz * k)) ok = false;       // nor along the way down
    if (ok) { mouth = { x, y, z }; dir = [dx, dz]; }
  }
  if (!mouth) return null;
  const carve = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
  const dig = (x, y, z) => { if (y > 1 && x > 2 && z > 2 && x < w.sx - 3 && z < w.sz - 3) carve.set(key(x, y, z), [x, y, z]); };
  const room = (cx, cy, cz, rx, ry, rz) => { for (let y = -ry; y <= ry; y++) for (let z = -rz; z <= rz; z++) for (let x = -rx; x <= rx; x++) if ((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2 <= 1.05 && y >= -ry + 1) dig(cx + x, cy + y, cz + z); };
  const [dx, dz] = dir, px = -dz, pz = dx, floor = [];
  // the way down: a stair two wide and three high, one step down every two paces
  let x = mouth.x, y = mouth.y, z = mouth.z;
  for (let k = 0; k < 18; k++) {
    if (k && k % 2 === 0 && y > 4) y--;
    for (const s of [0, 1]) for (let h = 0; h < 3 + (k < 3 ? 2 : 0); h++) dig(x + px * s, y + h, z + pz * s);
    floor.push([x, y, z]);
    x += dx; z += dz;
  }
  // the hall, and two or three passages off it, each ending in a pocket
  const hall = { x: x + dx * 4, y: y + 2, z: z + dz * 4 };
  room(hall.x, hall.y, hall.z, 6, 3, 6);
  floor.push([hall.x, y, hall.z]);
  const arms = 2 + Math.floor(rnd() * 2);
  for (let a = 0; a < arms; a++) {
    let ang = Math.atan2(dz, dx) + (a - (arms - 1) / 2) * 1.25 + (rnd() - 0.5) * 0.5, ax = hall.x, az = hall.z, ay = y;
    const len = 9 + Math.floor(rnd() * 8);
    for (let k = 0; k < len; k++) {
      ang += (rnd() - 0.5) * 0.5; ax += Math.cos(ang); az += Math.sin(ang);
      if (k % 4 === 3 && ay > 3 && rnd() < 0.6) ay--;
      const fx = Math.round(ax), fz = Math.round(az);
      for (const [ox, oz] of [[0, 0], [1, 0], [0, 1]]) for (let h = 0; h < 3; h++) dig(fx + ox, ay + h, fz + oz);
      if (k % 5 === 2) floor.push([fx, ay, fz]);
    }
    room(Math.round(ax), ay + 1, Math.round(az), 3, 2, 3);
    floor.push([Math.round(ax), ay, Math.round(az)]);
  }
  // never open a lake into the cave: a cell that touches water stays rock
  const cells = [...carve.values()].filter(([cx, cy, cz]) => !wet(cx, cy, cz) && !wet(cx + 1, cy, cz) && !wet(cx - 1, cy, cz) && !wet(cx, cy, cz + 1) && !wet(cx, cy, cz - 1) && !wet(cx, cy + 1, cz));
  const open = new Set(cells.map(([cx, cy, cz]) => key(cx, cy, cz)));
  for (const [cx, cy, cz] of cells) if (w.get(cx, cy, cz) !== 0) kit.setBlock(cx, cy, cz, 0);
  // veins in the walls: rock that borders the open cave, below the stair's upper half
  const walls = [];
  for (const [cx, cy, cz] of cells) { if (cy > mouth.y - 5) continue; for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) { const k = key(cx + ox, cy + oy, cz + oz); if (!open.has(k) && solid(cx + ox, cy + oy, cz + oz)) walls.push([cx + ox, cy + oy, cz + oz]); } }
  const veins = { coal: [], gold: [], diamond: [] }, used = new Set();
  const vein = (list, id, n) => { for (let i = 0; i < n * 30 && list.length < n && walls.length; i++) { const c = walls[Math.floor(rnd() * walls.length)], k = key(c[0], c[1], c[2]); if (used.has(k)) continue; used.add(k); kit.setBlock(c[0], c[1], c[2], id); list.push(c); } };
  vein(veins.diamond, K.ROCK_DIAMOND, 6);
  vein(veins.gold, K.ROCK_GOLD, 10);
  vein(veins.coal, K.ROCK_COAL, 16);
  // the rare stones, fewer and deeper in: emerald, ruby, and amethyst that glows in the dark
  veins.emerald = []; veins.ruby = []; veins.amethyst = [];
  vein(veins.emerald, K.ROCK_EMERALD, 5);
  vein(veins.ruby, K.ROCK_RUBY, 4);
  vein(veins.amethyst, K.ROCK_AMETHYST, 6);
  for (const [x, y, z] of veins.amethyst) if (kit.lit) kit.lit(x, y, z, K.ROCK_AMETHYST);
  // torches along the way, standing on the floor; in the middle of the hall a fire burns (it warms, and it burns whoever walks into it)
  let lit = 0;
  const fires = [];
  for (const [fx, fy, fz] of floor) {
    if (!open.has(key(fx, fy, fz)) || !solid(fx, fy - 1, fz) || w.get(fx, fy, fz) !== 0) continue;
    const fire = fx === hall.x && fz === hall.z;
    kit.setBlock(fx, fy, fz, fire ? K.FIRE : K.TORCH); if (kit.lit) kit.lit(fx, fy, fz, fire ? K.FIRE : K.TORCH);
    if (fire) fires.push([fx, fy, fz]); else lit++;
  }
  return { mouth, hall, cells: cells.length, coal: veins.coal, gold: veins.gold, diamond: veins.diamond, torches: lit, fires };
}
