// The far view of the endless "dhalam": the highlands beyond the blocks as two low height fields that follow the
// camera (out to about 190 and 1150 blocks), in this world's fog. Where a chunk is drawn as blocks the far ground
// leaves a hole (a small texture says which chunks are drawn), so the two never fight. One draw call per ring.
// (The same plan as styles/barari/far.js, with the fog and light of this world.)
import * as THREE from 'three';
import { patch } from './fx.js';

const FRAG_HEAD = 'varying vec3 vFarW;\nuniform sampler2D uMask;\nuniform vec2 uMaskO;\nuniform float uMaskN, uChunk, uHoleR;\nuniform vec2 uHoleC;\n';
const FRAG_CUT = `
  {
    vec2 mc = (vFarW.xz - uMaskO) / uChunk;
    if (mc.x >= 0.0 && mc.y >= 0.0 && mc.x < uMaskN && mc.y < uMaskN && texture2D(uMask, (floor(mc) + 0.5) / uMaskN).r > 0.5) discard;
    vec2 hd = abs(vFarW.xz - uHoleC);
    if (max(hd.x, hd.y) < uHoleR) discard;
  }
`;

export function createFarView({ sample, chunk = 32, isLoaded, rings = [{ step: 4, n: 96 }, { step: 16, n: 144 }], landDrop = 0.6 }) {
  const group = new THREE.Group();
  group.name = 'far';
  const MN = 32;
  const maskData = new Uint8Array(MN * MN * 4);
  const mask = new THREE.DataTexture(maskData, MN, MN, THREE.RGBAFormat, THREE.UnsignedByteType);
  mask.magFilter = mask.minFilter = THREE.NearestFilter; mask.generateMipmaps = false; mask.needsUpdate = true;
  const shared = { uMask: { value: mask }, uMaskO: { value: new THREE.Vector2(-1e6, -1e6) }, uMaskN: { value: MN }, uChunk: { value: chunk } };
  const out = [0, 0, 0, 0, 0];

  const list = rings.map((r, ri) => {
    const n = r.n, nv = (n + 1) * (n + 1);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(nv * 3), colr = new Float32Array(nv * 3);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const k = (i + j * (n + 1)) * 3; pos[k] = (i - n / 2) * r.step; pos[k + 2] = (j - n / 2) * r.step; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    const idx = new Uint32Array(n * n * 6);
    let q = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = i + j * (n + 1), b = a + 1, c = a + n + 1, d = c + 1; idx.set([a, c, b, b, c, d], q); q += 6; }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const half = n / 2 * r.step;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, 0), half * 1.5);
    const mat = patch(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const uniforms = { ...shared, uHoleR: { value: -1 }, uHoleC: { value: new THREE.Vector2() } };
    const fog = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh) => {
      fog(sh);                                                 // this world's fog first; it gives the fragment the world position (vWPos)
      Object.assign(sh.uniforms, uniforms);
      sh.fragmentShader = FRAG_HEAD.replace('varying vec3 vFarW;\n', '') + sh.fragmentShader.replace('void main() {', 'void main() {' + FRAG_CUT.replace(/vFarW/g, 'vWPos'));
    };
    mat.customProgramCacheKey = () => 'dh-far';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'far:' + ri; mesh.frustumCulled = false; mesh.renderOrder = -1;
    mesh.visible = false; mesh.receiveShadow = false; mesh.castShadow = false;
    group.add(mesh);
    return { ...r, half, mesh, geo, uniforms, cx: NaN, cz: NaN, job: null, nextPos: new Float32Array(nv), nextCol: new Float32Array(nv * 3) };
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
        const k = i + j * (n + 1);
        sample(J.cx + (i - n / 2) * R.step, J.cz + (j - n / 2) * R.step, out);
        R.nextPos[k] = out[4] === 1 ? out[3] : out[3] + 1 - landDrop;
        R.nextCol[k * 3] = out[0]; R.nextCol[k * 3 + 1] = out[1]; R.nextCol[k * 3 + 2] = out[2];
      }
      if (performance.now() - t0 > ms) break;
    }
    if (J.row <= n) return false;
    const pos = R.geo.attributes.position.array, col = R.geo.attributes.color.array;
    for (let k = 0; k < R.nextPos.length; k++) pos[k * 3 + 1] = R.nextPos[k];
    col.set(R.nextCol);
    R.geo.computeVertexNormals();
    R.geo.attributes.position.needsUpdate = true; R.geo.attributes.color.needsUpdate = true;
    R.cx = J.cx; R.cz = J.cz; R.job = null;
    R.mesh.position.set(R.cx, 0, R.cz);
    R.mesh.visible = true;
    for (let r = 1; r < list.length; r++) { list[r].uniforms.uHoleC.value.set(list[r - 1].cx, list[r - 1].cz); list[r].uniforms.uHoleR.value = Number.isFinite(list[r - 1].cx) ? list[r - 1].half - list[r - 1].step * 2 : -1; }
    return true;
  }
  let mcx = NaN, mcz = NaN;
  function updateMask(x, z) {
    mcx = Math.floor(x / chunk) - MN / 2; mcz = Math.floor(z / chunk) - MN / 2;
    for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) maskData[(i + j * MN) * 4] = isLoaded(mcx + i, mcz + j) ? 255 : 0;
    mask.needsUpdate = true;
    shared.uMaskO.value.set(mcx * chunk, mcz * chunk);
  }
  return {
    group, rings: list,
    update(x, z, chunksChanged, ms = 2) {
      for (const R of list) { startJob(R, x, z); if (R.job) { runJob(R, ms); break; } }
      if (chunksChanged || Math.floor(x / chunk) - MN / 2 !== mcx || Math.floor(z / chunk) - MN / 2 !== mcz) updateMask(x, z);
    },
    prime(x, z) { for (const R of list) { startJob(R, x, z); if (R.job) runJob(R, 1e9); } updateMask(x, z); },
    get busy() { return list.some((R) => R.job); },
  };
}
