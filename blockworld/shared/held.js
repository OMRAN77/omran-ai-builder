// What the hand holds when the selected square is a block: a small copy of that block at the lower right
// of the view, in place of the world's tool. The world keeps its own tool model and hides it meanwhile.
//
//   const held = createHeld({ camera, blocks, materialFor });
//   held.show(blockId)   // 0 hides it; returns true while a block is shown

import * as THREE from 'three';
import { kitTool } from './kit.js';

export function createHeld({ camera, blocks, materialFor, at = [0.4, -0.34, -0.72], size = 0.25 }) {
  const group = new THREE.Group();
  group.position.set(at[0], at[1], at[2]);
  group.rotation.set(0.3, 0.62, 0.05);
  group.visible = false;
  camera.add(group);
  const white = (geo) => { const n = geo.attributes.position.count, c = new Float32Array(n * 3).fill(1); geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo; };   // block materials read vertex colours
  const box = new THREE.Mesh(white(new THREE.BoxGeometry(1, 1, 1)), []);
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5], 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1], 2));
  cg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(8).fill([0, 1, 0]).flat(), 3));
  cg.setIndex([0, 1, 2, 2, 1, 3, 0, 2, 1, 2, 3, 1, 4, 5, 6, 6, 5, 7, 4, 6, 5, 6, 7, 5]);
  const cross = new THREE.Mesh(white(cg), null);
  for (const m of [box, cross]) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.visible = false; group.add(m); }
  // tools from the bag (sword, axe, pick): one model each, its metal tinted by what it is made of
  const metal = new THREE.MeshStandardMaterial({ color: 0x8fe9f7, roughness: 0.3, metalness: 0.3, emissive: 0x1c6f80, emissiveIntensity: 0.35 });
  const woodM = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 }), brass = new THREE.MeshStandardMaterial({ color: 0xc9a35a, roughness: 0.4, metalness: 0.4 });
  const part = (g, w, h, d, x, y, m, rz = 0) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, 0); q.rotation.z = rz; q.frustumCulled = false; g.add(q); };
  const tools = { sword: new THREE.Group(), axe: new THREE.Group(), pick: new THREE.Group() };
  part(tools.sword, 0.05, 0.5, 0.012, 0, 0.33, metal); part(tools.sword, 0.03, 0.08, 0.012, 0, 0.61, metal); part(tools.sword, 0.17, 0.03, 0.035, 0, 0.07, brass); part(tools.sword, 0.032, 0.13, 0.032, 0, -0.01, woodM); part(tools.sword, 0.045, 0.03, 0.045, 0, -0.085, brass);
  part(tools.axe, 0.034, 0.6, 0.034, 0, 0.2, woodM); part(tools.axe, 0.17, 0.15, 0.02, 0.09, 0.42, metal); part(tools.axe, 0.05, 0.19, 0.02, 0.19, 0.42, metal);
  part(tools.pick, 0.034, 0.6, 0.034, 0, 0.2, woodM); part(tools.pick, 0.34, 0.045, 0.03, 0, 0.47, metal); part(tools.pick, 0.09, 0.04, 0.028, -0.19, 0.44, metal, 0.5); part(tools.pick, 0.09, 0.04, 0.028, 0.19, 0.44, metal, -0.5);
  for (const g of Object.values(tools)) { g.position.set(0.02, -0.12, 0.04); g.rotation.set(-0.5, -0.5, -0.32); g.visible = false; group.add(g); }
  let shown = -1;
  const tile = (def, face) => (typeof def.tiles === 'string' ? def.tiles : def.tiles[face] ?? def.tiles.side ?? def.tiles.top);
  return {
    group,
    show(id) {
      if (id === shown) return !!id;
      shown = id;
      const def = id ? blocks[id] : null;
      const tool = kitTool(id);
      group.visible = !!def || !!tool; box.visible = cross.visible = false;
      for (const k in tools) tools[k].visible = !!tool && tool.model === k;
      if (tool) { metal.color.set(tool.tier); metal.emissive.set(tool.tier).multiplyScalar(0.25); return true; }
      if (!def) return false;
      const kind = def.kind ?? 'solid';
      if (kind === 'cross') { cross.material = materialFor(tile(def, 'side'), kind); cross.scale.setScalar(size); cross.position.set(0, 0, 0); cross.visible = true; return true; }
      const h = kind === 'slab' ? def.height ?? 0.5 : 1, sc = def.heldScale || [1, h, 1];       // a door is shown as a thin leaf
      const side = materialFor(tile(def, 'side'), kind), top = materialFor(tile(def, 'top'), kind), bottom = materialFor(tile(def, 'bottom'), kind);
      box.material = [side, side, top, bottom, side, side];       // BoxGeometry groups: +x, -x, +y, -y, +z, -z
      box.scale.set(size * sc[0], size * sc[1], size * sc[2]); box.position.set(0, -size * (1 - sc[1]) / 2, 0); box.visible = true;
      return true;
    },
  };
}
