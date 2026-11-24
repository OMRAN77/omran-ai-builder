// World of "barari": an endless land (see gen.js for how the ground is made), kept as chunks that are made the
// first time they are needed. The map is 16384 blocks a side with the start near the middle, so its walls are
// thousands of blocks away; the lands, seas, mountains and caves go on everywhere.
import { PagedWorld } from '../../shared/stream.js';
import { K } from '../../shared/kit.js';
import { makeGen, SY, SEA, C, SIZE } from './gen.js';
import { B } from './blocks.js';
import { DINO } from './mode.js';

export { SY, SEA };
// the world of the dinosaurs makes its ground with its own generator (the same contract, the same sizes)
const makeLand = DINO ? (await import('../dino/gen.js')).makeGen : makeGen;
const SOFT = new Set([B.SWAMPWATER, B.VINE, B.FERN, B.BIGLEAF, B.NEST, B.HORSETAIL]);
export const SX = SIZE, SZ = SIZE;

export function generateWorld() {
  const t0 = performance.now();
  const g = makeLand(K);
  const fires = new Map();                  // "x,y,z" -> { x, y, z }: the fires burning in the caves made so far
  const anchors = { fires: [], caves: [], trees: 0 };
  const world = new PagedWorld({
    sx: SX, sy: SY, sz: SZ, chunk: C,
    generate: (cx, cz, d) => g.fillChunk(cx, cz, d),
    onChunk: (cx, cz, lit) => { for (const f of lit || []) { const k = f.x + ',' + f.y + ',' + f.z; if (!fires.has(k)) { fires.set(k, f); if (api.onFire) api.onFire(f); } } },
  });
  const sp = g.spawn;
  // the part of the world the shared pages look at (the quest map, the day's treasure and cave, the sky island,
  // the maze): a square round the start, the same size as a whole small world
  const A = 224;
  world.area = { x0: sp.x - A / 2, z0: sp.z - A / 2, x1: sp.x + A / 2, z1: sp.z + A / 2 };
  const groundY = (x, z) => { const X = Math.floor(x), Z = Math.floor(z); let y = SY - 2; while (y > 1 && !solid(world.get(X, y - 1, Z))) y--; return y; };
  const solid = (id) => !!id && id !== B.WATER && !(id >= B.TUFT && id <= B.REED) && id !== K.WATER && id !== K.FIRE && id !== K.TORCH && !SOFT.has(id);
  anchors.spawn = { x: sp.x + 0.5, y: groundY(sp.x, sp.z), z: sp.z + 0.5, yaw: sp.yaw };
  for (const c of g.cavesIn(sp.x - 160, sp.x + 160, sp.z - 160, sp.z + 160)) anchors.caves.push(c.mouth);
  // the open sea near the start: the middle of the nearest 16 x 16 square ([x - 8, x + 8) x [z - 8, z + 8)) where
  // the sea (not a lake or a pond) is at least 6 deep everywhere, within maxR of the start; null if there is none.
  // Read from the generator's columns, so nothing is made or drawn; searched ring by ring, 8 blocks apart.
  const seaSpots = new Map();
  const deepAt = (x, z) => { const c = g.column(x, z); return c.s < 0 && c.wl - Math.max(3, Math.floor(c.hf)) >= 6; };
  function seaSpot(maxR = 600) {
    if (seaSpots.has(maxR)) return seaSpots.get(maxR);
    let found = null;
    for (let r = 0; r <= maxR && !found; r += 8) {
      const n = Math.max(1, Math.ceil(Math.PI * 2 * r / 8));
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, x = Math.round(sp.x + Math.cos(a) * r), z = Math.round(sp.z + Math.sin(a) * r);
        if (!deepAt(x, z)) continue;
        let ok = true;
        for (let dz = -8; dz <= 7 && ok; dz += 3) for (let dx = -8; dx <= 7 && ok; dx += 3) if (!deepAt(x + dx, z + dz)) ok = false;
        for (const [dx, dz] of [[7, 7], [7, -8], [-8, 7]]) if (ok && !deepAt(x + dx, z + dz)) ok = false;      // the far corners too
        if (ok) { found = { x, z }; break; }
      }
    }
    seaSpots.set(maxR, found);
    return found;
  }
  const api = {
    world, anchors, fires, onFire: null,
    landOf: g.landOf, heightAt: g.heightAt, farSample: g.farSample, column: g.column, groundY, spawn: sp,
    cavesIn: g.cavesIn, seaSpot, zoneOf: g.zoneOf || null, volcanoesNear: g.volcanoesNear || null, SEA,
    // the wonders of each world (ideas.js): barari's lighthouses, cloud islands and seasons; the dinosaur world's towers and fossil caves
    lighthousesNear: g.lighthousesNear || null, lighthouseOf: g.lighthouseOf || null, LC: g.LC || 0, islesNear: g.islesNear || null, setSeason: g.setSeason || null,
    towersNear: g.towersNear || null, fossilsNear: g.fossilsNear || null,
    ms: performance.now() - t0,
  };
  return api;
}
