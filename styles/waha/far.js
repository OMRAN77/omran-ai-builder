// The far view of "waha": the desert beyond the blocks, out to the horizon, as two low-detail height fields that follow
// the camera (a finer one out to 256 blocks, a coarse one out to 1280). Drawn with the material of the old fixed
// backdrop (sand that turns to bedded rock on the steep and rocky parts, the same haze as everything else), plus the
// water of the oases and the sea and the white of the salt flats. Where a region is drawn as blocks the far ground
// leaves a hole (a small texture says which regions are drawn), so the two never fight. One draw call per ring.
import * as THREE from 'three';
import { patchMaterial } from './atmo.js';
import { PAL } from './tiles.js';
import { terrainAt, strataRaw, strataDip, B, OXC, OZC, POOL_LEVEL } from './world.js';

const lin = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

function strataTexture() {
  const NS = 160, data = new Uint8Array(NS * 4);
  const cols = { [B.ROCK_A]: PAL.rockA, [B.ROCK_B]: PAL.rockB, [B.ROCK_C]: PAL.rockC, [B.ROCK_D]: PAL.rockD };
  for (let y = 0; y < NS; y++) {
    const c = cols[strataRaw(y)] || PAL.rockA;
    data[y * 4] = c[0] * 255; data[y * 4 + 1] = c[1] * 255; data[y * 4 + 2] = c[2] * 255; data[y * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, 1, NS, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  return t;
}

/**
 * isLoaded(rx, rz): is that region (of `region` columns, grid coordinates) drawn as blocks.
 * rings: [{ step, n }] from fine to coarse.
 */
export function createFarView({ isLoaded, region = 64, rings = [{ step: 4, n: 128 }, { step: 16, n: 160 }] }) {
  const group = new THREE.Group();
  group.name = 'far';
  const MN = 32;                                             // the mask covers 32 x 32 regions round the camera
  const maskData = new Uint8Array(MN * MN * 4);
  const mask = new THREE.DataTexture(maskData, MN, MN, THREE.RGBAFormat, THREE.UnsignedByteType);
  mask.magFilter = mask.minFilter = THREE.NearestFilter; mask.generateMipmaps = false; mask.needsUpdate = true;
  const shared = { uMask: { value: mask }, uMaskO: { value: new THREE.Vector2(-1e6, -1e6) }, uMaskN: { value: MN }, uChunk: { value: region } };
  const strata = strataTexture();

  const list = rings.map((r, ri) => {
    const n = r.n, nv = (n + 1) * (n + 1);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(nv * 3);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const k = (i + j * (n + 1)) * 3; pos[k] = (i - n / 2) * r.step; pos[k + 2] = (j - n / 2) * r.step; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    geo.setAttribute('aRock', new THREE.BufferAttribute(new Float32Array(nv), 1));
    geo.setAttribute('aDip', new THREE.BufferAttribute(new Float32Array(nv), 1));
    geo.setAttribute('aWet', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    const idx = new Uint32Array(n * n * 6);
    let q = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = i + j * (n + 1), b = a + 1, c = a + n + 1, d = c + 1; idx.set([a, c, b, b, c, d], q); q += 6; }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const uniforms = { ...shared, uHoleR: { value: -1 }, uHoleC: { value: new THREE.Vector2() }, uStrata: { value: strata }, uSandCol: { value: lin(PAL.sand).multiplyScalar(0.97) } };
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff }), { backdrop: true, uniforms });
    // on top of the backdrop look: the hole where blocks are drawn, the water and the salt
    const inner = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh) => {
      inner(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aWet;\nvarying vec2 vWet;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vWet = aWet;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWet;\nuniform sampler2D uMask;\nuniform vec2 uMaskO;\nuniform float uMaskN, uChunk, uHoleR;\nuniform vec2 uHoleC;')
        .replace('void main() {', `void main() {
          {
            vec2 mc = (vWPos.xz - uMaskO) / uChunk;
            if (mc.x >= 0.0 && mc.y >= 0.0 && mc.x < uMaskN && mc.y < uMaskN && texture2D(uMask, (floor(mc) + 0.5) / uMaskN).r > 0.5) discard;
            vec2 hd = abs(vWPos.xz - uHoleC);
            if (max(hd.x, hd.y) < uHoleR) discard;
          }`)
        .replace('diffuseColor.rgb *= c;', `diffuseColor.rgb *= c;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.88), clamp(vWet.y, 0.0, 1.0) * (1.0 - wahaRockK));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.085, 0.095), clamp(vWet.x, 0.0, 1.0));`);
      for (const k of Object.keys(uniforms)) sh.uniforms[k] = uniforms[k];
    };
    mat.customProgramCacheKey = () => 'waha-far';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'far:' + ri; mesh.frustumCulled = false; mesh.renderOrder = -1;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.visible = false;
    mesh.layers.enable(1);                                    // the pool mirrors the far desert too
    group.add(mesh);
    // the next picture of the ring is worked out a few rows at a time, then swapped in whole
    return { ...r, half: n / 2 * r.step, mesh, geo, uniforms, cx: NaN, cz: NaN, job: null, nH: new Float32Array(nv), nRock: new Float32Array(nv), nDip: new Float32Array(nv), nWet: new Float32Array(nv * 2), drop: ri === 0 ? 0.7 : 2.2 };
  });

  function startJob(R, x, z) {
    const snap = R.step * 8, cx = Math.round(x / snap) * snap, cz = Math.round(z / snap) * snap;
    if (cx === R.cx && cz === R.cz) return false;
    if (R.job && R.job.cx === cx && R.job.cz === cz) return false;
    R.job = { cx, cz, row: 0 };
    return true;
  }
  function runJob(R, ms) {
    const J = R.job, n = R.n, t0 = performance.now();
    while (J.row <= n) {
      const j = J.row++;
      for (let i = 0; i <= n; i++) {
        const k = i + j * (n + 1), x = J.cx + (i - n / 2) * R.step, z = J.cz + (j - n / 2) * R.step;
        const t = terrainAt(x, z);
        const wet = t.h + 0.5 < POOL_LEVEL - 0.05;
        R.nH[k] = wet ? POOL_LEVEL - 0.05 : t.h + 0.5 - R.drop;
        R.nRock[k] = t.surf === 'rock' ? 1 : 0;
        R.nDip[k] = strataDip(x, z);
        R.nWet[k * 2] = wet ? 1 : 0; R.nWet[k * 2 + 1] = t.surf === 'salt' ? 1 : 0;
      }
      if (performance.now() - t0 > ms) break;
    }
    if (J.row <= n) return false;
    // swap in
    const g = R.geo, pos = g.attributes.position.array;
    for (let k = 0; k < R.nH.length; k++) pos[k * 3 + 1] = R.nH[k];
    g.attributes.aRock.array.set(R.nRock); g.attributes.aDip.array.set(R.nDip); g.attributes.aWet.array.set(R.nWet);
    g.computeVertexNormals();
    for (const a of ['position', 'aRock', 'aDip', 'aWet']) g.attributes[a].needsUpdate = true;
    R.cx = J.cx; R.cz = J.cz; R.job = null;
    R.mesh.position.set(R.cx, 0, R.cz);
    R.mesh.updateMatrixWorld();
    R.mesh.visible = true;
    // the coarse ring leaves a hole where the fine one is
    for (let r = 1; r < list.length; r++) { list[r].uniforms.uHoleC.value.set(list[r - 1].cx, list[r - 1].cz); list[r].uniforms.uHoleR.value = Number.isFinite(list[r - 1].cx) ? list[r - 1].half - list[r - 1].step * 2 : -1; }
    return true;
  }
  // the mask is laid out in world coordinates, over regions of the grid
  let mrx = NaN, mrz = NaN;
  const regionAt = (wx, wz) => [Math.floor((wx - OXC) / region), Math.floor((wz - OZC) / region)];
  function updateMask(x, z) {
    const [rx, rz] = regionAt(x, z);
    mrx = rx - MN / 2; mrz = rz - MN / 2;
    for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) maskData[(i + j * MN) * 4] = isLoaded(mrx + i, mrz + j) ? 255 : 0;
    mask.needsUpdate = true;
    shared.uMaskO.value.set(mrx * region + OXC, mrz * region + OZC);
  }

  return {
    group, rings: list,
    /** Every frame (world coordinates): keep the rings round (x, z), a little work per frame; the mask when the drawn regions changed. */
    update(x, z, regionsChanged, ms = 2) {
      for (const R of list) { startJob(R, x, z); if (R.job) { runJob(R, ms); break; } }
      const [rx, rz] = regionAt(x, z);
      if (regionsChanged || rx - MN / 2 !== mrx || rz - MN / 2 !== mrz) updateMask(x, z);
    },
    /** Everything round (x, z) now. */
    prime(x, z) { for (const R of list) { startJob(R, x, z); if (R.job) runJob(R, 1e9); } updateMask(x, z); },
    get busy() { return list.some((R) => R.job); },
  };
}
