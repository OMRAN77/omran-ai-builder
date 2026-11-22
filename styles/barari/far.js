// The far view of "barari": the land beyond the blocks, as two low-detail height fields that follow the camera
// (a finer one out to 256 blocks, a coarse one out to 1280), coloured by land and lit like the rest. Where a chunk
// is drawn as blocks the far ground leaves a hole (a small texture says which chunks are drawn), so the two never
// fight; the fog melts the far edge into the sky. One draw call per ring.
import * as THREE from 'three';

const VERT_HEAD = 'varying vec2 vFarW;\n';
const FRAG_HEAD = 'varying vec2 vFarW;\nuniform sampler2D uMask;\nuniform vec2 uMaskO;\nuniform float uMaskN, uChunk, uHoleR;\nuniform vec2 uHoleC;\n';
const FRAG_CUT = `
  {
    vec2 mc = (vFarW - uMaskO) / uChunk;
    if (mc.x >= 0.0 && mc.y >= 0.0 && mc.x < uMaskN && mc.y < uMaskN && texture2D(uMask, (floor(mc) + 0.5) / uMaskN).r > 0.5) discard;
    vec2 hd = abs(vFarW - uHoleC);
    if (max(hd.x, hd.y) < uHoleR) discard;
  }
`;

/**
 * sample(x, z, out) fills out = [r, g, b, height, water (1 or 0)] (colour in sRGB 0..1). chunk: the block chunk size.
 * isLoaded(cx, cz): is that chunk drawn as blocks.
 */
export function createFarView({ sample, chunk = 32, isLoaded, rings = [{ step: 4, n: 128 }, { step: 16, n: 160 }], landDrop = 0.7 }) {
  const group = new THREE.Group();
  group.name = 'far';
  const MN = 32;                                             // the mask covers 32 x 32 chunks round the camera
  const maskData = new Uint8Array(MN * MN * 4);
  const mask = new THREE.DataTexture(maskData, MN, MN, THREE.RGBAFormat, THREE.UnsignedByteType);
  mask.magFilter = mask.minFilter = THREE.NearestFilter; mask.generateMipmaps = false; mask.needsUpdate = true;
  const shared = { uMask: { value: mask }, uMaskO: { value: new THREE.Vector2(-1e6, -1e6) }, uMaskN: { value: MN }, uChunk: { value: chunk } };
  const out = [0, 0, 0, 0, 0];
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

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
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const uniforms = { ...shared, uHoleR: { value: -1 }, uHoleC: { value: new THREE.Vector2() } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vFarW = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('void main() {', 'void main() {' + FRAG_CUT);
    };
    mat.customProgramCacheKey = () => 'barari-far';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'far:' + ri; mesh.frustumCulled = false; mesh.renderOrder = -1;
    mesh.visible = false;
    group.add(mesh);
    // the next picture of the ring is computed a few rows at a time, then swapped in whole
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
        const water = out[4] === 1;                                        // the water surface keeps its height
        R.nextPos[k] = water ? out[3] : out[3] + 1 - landDrop;
        R.nextCol[k * 3] = lin(out[0]); R.nextCol[k * 3 + 1] = lin(out[1]); R.nextCol[k * 3 + 2] = lin(out[2]);
      }
      if (performance.now() - t0 > ms) break;
    }
    if (J.row <= n) return false;
    // swap in
    const pos = R.geo.attributes.position.array, col = R.geo.attributes.color.array;
    for (let k = 0; k < R.nextPos.length; k++) pos[k * 3 + 1] = R.nextPos[k];
    col.set(R.nextCol);
    R.geo.computeVertexNormals();
    R.geo.attributes.position.needsUpdate = true; R.geo.attributes.color.needsUpdate = true;
    R.cx = J.cx; R.cz = J.cz; R.job = null;
    R.mesh.position.set(R.cx, 0, R.cz);
    R.mesh.visible = true;
    // the coarse ring leaves a hole where the fine one is
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
    /** Every frame: keep the rings round (x, z), a little work per frame; the mask when the drawn chunks changed. */
    update(x, z, chunksChanged, ms = 2) {
      for (const R of list) { startJob(R, x, z); if (R.job) { runJob(R, ms); break; } }
      if (chunksChanged || Math.floor(x / chunk) - MN / 2 !== mcx || Math.floor(z / chunk) - MN / 2 !== mcz) updateMask(x, z);
    },
    /** Everything round (x, z) now. */
    prime(x, z) { for (const R of list) { startJob(R, x, z); if (R.job) runJob(R, 1e9); } updateMask(x, z); },
    get busy() { return list.some((R) => R.job); },
  };
}
