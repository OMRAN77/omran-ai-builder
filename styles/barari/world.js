// World of "barari": an endless land (see gen.js for how the ground is made), kept as chunks that are made the
// first time they are needed. The map is 16384 blocks a side with the start near the middle, so its walls are
// thousands of blocks away; the lands, seas, mountains and caves go on everywhere.
import { PagedWorld } from '../../shared/stream.js';
import { K } from '../../shared/kit.js';
import { makeGen, SY, SEA, C, SIZE } from './gen.js';
import { B } from './blocks.js';

export { SY, SEA };
export const SX = SIZE, SZ = SIZE;

export function generateWorld() {
  const t0 = performance.now();
  const g = makeGen(K);
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
  const solid = (id) => !!id && id !== B.WATER && !(id >= B.TUFT && id <= B.REED) && id !== K.WATER && id !== K.FIRE && id !== K.TORCH;
  anchors.spawn = { x: sp.x + 0.5, y: groundY(sp.x, sp.z), z: sp.z + 0.5, yaw: sp.yaw };
  for (const c of g.cavesIn(sp.x - 160, sp.x + 160, sp.z - 160, sp.z + 160)) anchors.caves.push(c.mouth);
  const api = {
    world, anchors, fires, onFire: null,
    landOf: g.landOf, heightAt: g.heightAt, farSample: g.farSample, column: g.column, groundY, spawn: sp,
    cavesIn: g.cavesIn,
    ms: performance.now() - t0,
  };
  return api;
}
