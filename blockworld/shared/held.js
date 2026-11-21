// What the hand holds when the selected square is a block: a small copy of that block at the lower right
// of the view, in place of the world's tool. The world keeps its own tool model and hides it meanwhile.
//
//   const held = createHeld({ camera, blocks, materialFor });
//   held.show(blockId)   // 0 hides it; returns true while a block is shown

import * as THREE from 'three';

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
  let shown = -1;
  const tile = (def, face) => (typeof def.tiles === 'string' ? def.tiles : def.tiles[face] ?? def.tiles.side ?? def.tiles.top);
  return {
    group,
    show(id) {
      if (id === shown) return !!id;
      shown = id;
      const def = id ? blocks[id] : null;
      group.visible = !!def; box.visible = cross.visible = false;
      if (!def) return false;
      const kind = def.kind ?? 'solid';
      if (kind === 'cross') { cross.material = materialFor(tile(def, 'side'), kind); cross.scale.setScalar(size); cross.position.set(0, 0, 0); cross.visible = true; return true; }
      const h = kind === 'slab' ? def.height ?? 0.5 : 1;
      const side = materialFor(tile(def, 'side'), kind), top = materialFor(tile(def, 'top'), kind), bottom = materialFor(tile(def, 'bottom'), kind);
      box.material = [side, side, top, bottom, side, side];       // BoxGeometry groups: +x, -x, +y, -y, +z, -z
      box.scale.set(size, size * h, size); box.position.set(0, -size * (1 - h) / 2, 0); box.visible = true;
      return true;
    },
  };
}
