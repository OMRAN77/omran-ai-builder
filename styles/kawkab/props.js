// Props for "kawkab": everything that is not a terrain block — lake surface, distant ridges,
// spores, the dropship, rover, antenna mast, solar arrays, floodlights and light halos.
// All built in code from boxes / cylinders; a handful of draw calls each.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../../shared/stage.js';
import { mulberry32 } from '../../shared/noise.js';
import { tileMaterial } from './tiles.js';

// ------------------------------------------------------------------ material kit
const glowMats = [];
export function emis(color, intensity, group = 'tech', base = 0x0c0e12) {
  const m = new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.1 });
  glowMats.push({ mat: m, base: intensity, group });
  return m;
}
export function registerGlow(mat, group) { glowMats.push({ mat, base: mat.emissiveIntensity, group }); return mat; }
const fx = [];                                              // sprites / cones whose strength follows the mood
export function setPropGlow(levels) {
  for (const g of glowMats) g.mat.emissiveIntensity = g.base * (levels[g.group] ?? 1);
  for (const f of fx) f.set(levels[f.group] ?? 1);
}
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...o });

export const MAT = {
  white: std(0xd3d7de, { roughness: 0.4, metalness: 0.15 }),
  grey: std(0x7f8693, { roughness: 0.5, metalness: 0.35 }),
  graphite: std(0x2b2f38, { roughness: 0.45, metalness: 0.5 }),
  dark: std(0x15171c, { roughness: 0.62, metalness: 0.35 }),
  rubber: std(0x101114, { roughness: 0.9, metalness: 0 }),
  orange: std(0xe0661a, { roughness: 0.5, metalness: 0.1 }),
  glass: std(0x0a1a24, { roughness: 0.06, metalness: 0.7 }),
  amber: emis(0xffa63a, 2.4),
  cyan: emis(0x5cf2ff, 2.4),
  red: emis(0xff3524, 3.2),
  warm: emis(0xffe0ad, 2.6),
  canopy: emis(0x46d9ee, 0.5, 'tech', 0x06141c),
};
MAT.canopy.roughness = 0.08; MAT.canopy.metalness = 0.6;

const texClones = new Map();
const tiledCache = new Map();
/** Repeat-wrapped copy of a block tile material, for prop geometry with UVs in block units. */
export function tiled(name) {
  let m = tiledCache.get(name);
  if (m) return m;
  const src = tileMaterial(name);
  m = src.clone();
  for (const k of ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'emissiveMap']) {
    const t = src[k];
    if (!t) continue;
    let c = texClones.get(t);
    if (!c) { c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true; texClones.set(t, c); }
    m[k] = c;
  }
  m.vertexColors = false;
  if (src.userData.baseEI) glowMats.push({ mat: m, base: src.userData.baseEI, group: src.userData.glow || 'tech' });
  tiledCache.set(name, m);
  return m;
}

export function put(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
/** Box whose UVs are in block units (k tiles per unit) so tiled() materials keep their scale. */
export function tboxGeo(w, h, d, k = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const j = f * 4 + i; uv.setXY(j, uv.getX(j) * dims[f][0] * k, uv.getY(j) * dims[f][1] * k); }
  return g;
}
const geoCache = new Map();
const cached = (key, make) => { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; };
export const rbox = (w, h, d, r = 0.04, seg = 2) => cached(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r));
export const boxG = (w, h, d) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cylG = (rt, rb, h, seg = 12, open = false) => cached(`c${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
export const sphG = (r, ws = 14, hs = 10, phiL = Math.PI * 2, th0 = 0, thL = Math.PI) => cached(`s${r},${ws},${hs},${phiL},${th0},${thL}`, () => new THREE.SphereGeometry(r, ws, hs, 0, phiL, th0, thL));

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** Cylinder strut between two points. */
export function strut(ax, ay, az, bx, by, bz, r, mat, seg = 6, r2 = r) {
  _a.set(ax, ay, az); _b.set(bx, by, bz);
  const len = _a.distanceTo(_b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, seg), mat);
  m.position.copy(_a).add(_b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ halos + beams
const haloTex = canvasTexture(128, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});
export function halo(color, size, strength = 1, group = 'halo') {
  const mat = new THREE.SpriteMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: strength, fog: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  fx.push({ group, set: (k) => { mat.opacity = Math.min(1, strength * k); s.visible = mat.opacity > 0.004; } });
  return s;
}
/** Additive light cone (floodlight shaft in mist). Apex at the origin, pointing along -Y. */
export function beam(color, length, radius, strength = 1, group = 'beam') {
  const geo = new THREE.CylinderGeometry(0.15, radius, length, 80, 1, true);
  geo.translate(0, -length / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: strength }, uLen: { value: length } },
    vertexShader: `varying vec3 vN, vV; varying float vT; uniform float uLen;
      void main(){ vT = -position.y / uLen; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN, vV; varying float vT; uniform vec3 uColor; uniform float uI;
      void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float a = f * pow(abs(1.0 - vT), 1.6) * smoothstep(0.0, 0.04, vT);
        gl_FragColor = vec4(uColor * a * uI, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  fx.push({ group, set: (k) => { mat.uniforms.uI.value = strength * k; m.visible = k > 0.004; } });
  return m;
}

// ------------------------------------------------------------------ lake surface
// One plane with a half-resolution planar reflection (three's Reflector) and a rippled Fresnel
// shader; the glowing lake bed shows through where the view is steep. `depth` is a small
// per-block depth map: the shallows stay clear and luminous, the middle turns deep and mirror-like.
export function makeWater(L, y, depth) {
  const S = 128;
  const rnd = mulberry32(99);
  const waves = [];
  for (let i = 0; i < 9; i++) {
    const fx_ = Math.round((rnd() - 0.5) * (4 + i * 2.2)), fy_ = Math.round((rnd() - 0.5) * (4 + i * 2.2));
    waves.push([fx_ || 1, fy_ || -1, rnd() * 6.283, 1 / (1 + i * 0.55)]);
  }
  const hgt = new Float32Array(S * S), data = new Uint8Array(S * S * 4);
  const T = Math.PI * 2;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S;
    let h = 0;
    for (const [a, b, p, w] of waves) h += Math.sin(T * (a * u + b * v) + p) * w;
    hgt[j * S + i] = h * 0.3;
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = hgt[j * S + (i + 1) % S] - hgt[j * S + (i + S - 1) % S], dy = hgt[((j + 1) % S) * S + i] - hgt[((j + S - 1) % S) * S + i];
    let nx = -dx * 3.0, ny = -dy * 3.0, nz = 1; const l = Math.hypot(nx, ny, nz);
    const k = (j * S + i) * 4;
    data[k] = (nx / l * 0.5 + 0.5) * 255; data[k + 1] = (ny / l * 0.5 + 0.5) * 255; data[k + 2] = (nz / l * 0.5 + 0.5) * 255; data[k + 3] = 255;
  }
  const nrm = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.magFilter = THREE.LinearFilter; nrm.minFilter = THREE.LinearMipmapLinearFilter;
  nrm.generateMipmaps = true; nrm.anisotropy = 8; nrm.needsUpdate = true;
  const geo = new THREE.PlaneGeometry(L.rx * 3.2, L.rz * 3.4);
  const shader = {
    name: 'KawkabWater',
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tNormal: { value: nrm },
      uDeep: { value: new THREE.Color(0x041f2b) }, uGlow: { value: new THREE.Color(0x10a89c) }, uGlowI: { value: 0.3 },
      uOpacity: { value: 0.5 }, uRefl: { value: 1.0 }, uRipple: { value: 0.13 }, uDistort: { value: 0.03 },
      tDepth: { value: depth.tex }, uDepthBox: { value: new THREE.Vector4(depth.x0, depth.z0, depth.w, depth.h) },
      uFogColor: { value: new THREE.Color(0) }, uFog: { value: new THREE.Vector2(50, 300) },
    },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vR; varying vec3 vW;
      void main(){ vR = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D tDiffuse, tNormal, tDepth; uniform vec3 uDeep, uGlow, uFogColor; uniform vec2 uFog; uniform vec4 uDepthBox;
      uniform float uOpacity, uRefl, uRipple, uDistort, uGlowI; varying vec4 vR; varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        vec2 n1 = texture2D(tNormal, p / 9.0).xy * 2.0 - 1.0;
        vec2 n2 = texture2D(tNormal, p.yx / 23.0 + 0.37).xy * 2.0 - 1.0;
        vec2 nn = n1 * 0.55 + n2 * 0.45;
        vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;
        vec3 N = normalize(vec3(nn.x * uRipple, 1.0, nn.y * uRipple));
        float fres = 0.04 + 0.96 * pow(abs(1.0 - max(dot(N, V), 0.0)), 4.5);
        // reflections smear along the line of sight (vertical streaks), hardly sideways
        vec2 rb = vR.xy + vec2(nn.x * 0.3, nn.y) * uDistort * vR.w; float sm = 0.011 * vR.w;
        vec3 refl = (texture2DProj(tDiffuse, vec4(rb, vR.zw)).rgb * 0.34 + texture2DProj(tDiffuse, vec4(rb + vec2(0.0, sm), vR.zw)).rgb * 0.26
          + texture2DProj(tDiffuse, vec4(rb - vec2(0.0, sm), vR.zw)).rgb * 0.22 + texture2DProj(tDiffuse, vec4(rb + vec2(0.0, sm * 2.2), vR.zw)).rgb * 0.18);
        float dpt = texture2D(tDepth, (p - uDepthBox.xy) / uDepthBox.zw).r * 4.0;      // metres of water
        float shallow = 1.0 - smoothstep(0.35, 2.3, dpt);
        float rim = smoothstep(1.25, 0.75, dpt) * (0.75 + 0.25 * nn.x);                // luminous shoreline
        vec3 body = mix(uDeep, uGlow * (0.3 + 0.7 * uGlowI), shallow * 0.55) + uGlow * uGlowI * (0.25 + rim * 1.05);
        vec3 col = mix(body, refl * uRefl, fres);
        float a = mix(mix(0.9, uOpacity * 0.7, shallow), 1.0, fres);
        col = mix(col, uFogColor, smoothstep(uFog.x, uFog.y, dist) * 0.8);
        gl_FragColor = vec4(col, a);
      }`,
  };
  const m = new Reflector(geo, { textureWidth: 1024, textureHeight: 576, clipBias: 0.02, multisample: 0, shader });
  m.rotation.x = -Math.PI / 2;
  m.position.set(L.x, y, L.z);
  m.material.transparent = true;
  m.material.depthWrite = false;
  m.renderOrder = 2;
  m.name = 'water';
  const u = m.material.uniforms;
  fx.push({ group: 'lake', set: (k) => { u.uGlowI.value = 0.3 * k; } });
  m.userData.setFog = (color, near, far) => { u.uFogColor.value.set(color); u.uFog.value.set(near, far); };
  return m;
}

// ------------------------------------------------------------------ distant ridges (far LOD silhouettes)
export function makeRidges(cx, cz) {
  const rings = [];
  const group = new THREE.Group();
  group.name = 'ridges';
  const defs = [
    { r: 205, base: 22, amp: 30, seed: 3, t: 0.34, spires: 0.035 },
    { r: 290, base: 30, amp: 62, seed: 7, t: 0.6, spires: 0.02 },
    { r: 420, base: 40, amp: 120, seed: 11, t: 0.8, spires: 0.008 },
  ];
  for (const d of defs) {
    const rnd = mulberry32(d.seed * 977);
    const N = 540;
    const terms = [];
    for (let k = 0; k < 7; k++) terms.push([2 + Math.floor(rnd() * 3) + k * (3 + Math.floor(rnd() * 4)), rnd() * 6.283, 1 / (1 + k * 0.8)]);
    const prof = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const a = ((i % N) / N) * Math.PI * 2;
      let n = 0, w = 0;
      for (const [f, p, amp] of terms) { n += (1 - Math.abs(Math.sin(a * f * 0.5 + p))) * amp; w += amp; }
      n = n / w;
      prof[i] = d.base + d.amp * Math.pow(n, 1.7) * 1.6;
    }
    const pos = [], col = [], az = [], top = [], idx = [];
    const vert = (a, h, r, isTop) => { pos.push(cx + Math.sin(a) * r, h, cz + Math.cos(a) * r); az.push(a); top.push(isTop); col.push(1, 1, 1); };
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const b = pos.length / 3;
      vert(a0, -30, d.r, 0); vert(a0, prof[i], d.r, 1); vert(a1, -30, d.r, 0); vert(a1, prof[i + 1], d.r, 1);
      idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
      if (rnd() < d.spires) {                                 // crystal spire
        const w = (0.5 + rnd() * 0.9) * (Math.PI * 2 / N), h = prof[i] + d.amp * (0.25 + rnd() * 0.5), lean = (rnd() - 0.5) * 0.02;
        const c = pos.length / 3, am = (a0 + a1) / 2;
        vert(am - w, -30, d.r - 2, 0); vert(am + w, -30, d.r - 2, 0); vert(am + lean, h, d.r - 2, 1);
        idx.push(c, c + 2, c + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    group.add(mesh);
    rings.push({ mesh, az, top, t: d.t });
  }
  /** skyAt(azimuthRadians) -> THREE.Color of the sky right at the horizon; sil = near silhouette colour. */
  function tint(skyAt, sil) {
    const c = new THREE.Color();
    for (const r of rings) {
      const attr = r.mesh.geometry.attributes.color;
      for (let i = 0; i < r.az.length; i++) {
        c.copy(sil).lerp(skyAt(r.az[i]), r.top[i] ? r.t : Math.min(1, r.t + 0.42));
        attr.setXYZ(i, c.r, c.g, c.b);
      }
      attr.needsUpdate = true;
    }
  }
  return { group, tint };
}

// ------------------------------------------------------------------ spores
export function makeSpores(count, sample) {
  const rnd = mulberry32(4242);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
  const pal = [[0.35, 1.0, 0.86], [0.35, 1.0, 0.86], [0.72, 0.5, 1.0], [1.0, 0.86, 0.7], [0.45, 0.85, 1.0]];
  for (let i = 0; i < count; i++) {
    const p = sample(rnd);
    pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
    const c = pal[Math.floor(rnd() * pal.length)], k = 0.5 + rnd() * 0.9;
    col[i * 3] = c[0] * k; col[i * 3 + 1] = c[1] * k; col[i * 3 + 2] = c[2] * k;
    size[i] = 0.1 + rnd() * rnd() * 0.34;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 }, uI: { value: 1 }, uFog: { value: new THREE.Vector2(60, 300) }, uMax: { value: 30 } },
    vertexShader: `attribute float aSize; attribute vec3 color; varying vec3 vC; uniform float uScale, uMax; uniform vec2 uFog;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = -mv.z;
        float s = aSize * uScale / d; gl_PointSize = min(s, uMax);
        vC = color * (1.0 - smoothstep(uFog.x, uFog.y, d)) * smoothstep(0.6, 2.5, d) * min(1.0, (uMax * uMax) / (s * s) + 0.35); }`,
    fragmentShader: `varying vec3 vC; uniform float uI;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a = a * a * (0.35 + 0.65 * smoothstep(0.5, 0.0, d));
        gl_FragColor = vec4(vC * a * uI, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'spores';
  fx.push({ group: 'spores', set: (k) => { mat.uniforms.uI.value = k; } });
  return pts;
}

// ------------------------------------------------------------------ outpost hardware
export function makeMast(H = 24) {
  const g = new THREE.Group();
  const G = MAT.graphite, W = MAT.white;
  g.add(put(tboxGeo(2.6, 0.5, 2.6, 1), tiled('hullG'), 0, 0.25, 0));
  const half = (y) => 1.05 - 0.8 * (y / H);
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const [sx, sz] of corners) g.add(strut(sx * half(0.5), 0.5, sz * half(0.5), sx * half(H), H, sz * half(H), 0.09, G, 5, 0.05));
  const step = 3;
  for (let y = 0.5; y < H - 0.1; y += step) {
    const y1 = Math.min(H, y + step), a = half(y), b = half(y1);
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = corners[i], [x1, z1] = corners[(i + 1) % 4];
      g.add(strut(x0 * b, y1, z0 * b, x1 * b, y1, z1 * b, 0.04, G, 4));
      g.add(strut(x0 * a, y, z0 * a, x1 * b, y1, z1 * b, 0.035, G, 4));
    }
  }
  // service platform + dishes
  const py = H * 0.62;
  g.add(put(boxG(1.9, 0.12, 1.9), G, 0, py, 0));
  for (const [sx, sz] of corners) g.add(strut(sx * 0.92, py, sz * 0.92, sx * 0.92, py + 0.8, sz * 0.92, 0.03, MAT.orange, 4));
  for (let i = 0; i < 4; i++) { const [x0, z0] = corners[i], [x1, z1] = corners[(i + 1) % 4]; g.add(strut(x0 * 0.92, py + 0.8, z0 * 0.92, x1 * 0.92, py + 0.8, z1 * 0.92, 0.03, MAT.orange, 4)); }
  const dish = (r, y, yaw, pitch) => {
    const d = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 20, 6, 0, Math.PI * 2, 0, 0.93), new THREE.MeshStandardMaterial({ color: 0xd3d7de, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }));
    bowl.rotation.x = -Math.PI / 2; bowl.position.z = r * 1.25 - r * 0.5; bowl.castShadow = true;
    d.add(bowl);
    d.add(strut(0, 0, -r * 0.7, 0, 0, r * 0.75, 0.035, G, 4));
    d.add(put(sphG(0.09, 8, 6), MAT.amber, 0, 0, r * 0.78));
    d.position.set(0, y, 0); d.rotation.set(pitch, yaw, 0, 'YXZ');
    d.translateZ(0.75);
    return d;
  };
  g.add(dish(1.25, H * 0.5, -2.5, -0.35), dish(0.8, H * 0.74, 0.5, -0.15), dish(0.6, H * 0.84, 2.2, -0.1));
  // whip antennas and beacon
  g.add(strut(0, H, 0, 0, H + 5, 0, 0.05, G, 5, 0.02));
  g.add(strut(0.2, H, 0.15, 0.5, H + 2.6, 0.3, 0.025, G, 4));
  g.add(put(boxG(0.7, 0.35, 0.7), W, 0, H + 0.1, 0));
  g.add(put(sphG(0.2, 10, 8), MAT.red, 0, H + 5.1, 0));
  const hb = halo(0xff4a30, 5, 0.75); hb.position.set(0, H + 5.1, 0); g.add(hb);
  g.add(put(sphG(0.12, 8, 6), MAT.red, 0.3, H * 0.62 + 1.0, 0.3));
  g.userData.beacon = new THREE.Vector3(0, H + 5.1, 0);
  return g;
}

export function makeSolarArray() {
  const g = new THREE.Group();
  g.add(put(cylG(0.14, 0.2, 1.7, 8), MAT.graphite, 0, 0.85, 0));
  g.add(put(boxG(0.9, 0.2, 0.9), MAT.graphite, 0, 0.1, 0));
  const head = new THREE.Group();
  head.position.set(0, 1.8, 0); head.rotation.set(-0.62, 0, 0);
  head.add(put(tboxGeo(5.6, 0.1, 3.0, 0.5), tiled('solar'), 0, 0.08, 0));
  head.add(put(boxG(5.8, 0.12, 3.2), MAT.grey, 0, 0, 0));
  head.add(put(boxG(0.25, 0.25, 2.6), MAT.graphite, 0, -0.15, 0));
  g.add(head);
  return g;
}

/** Floodlight pole. The head turns (yaw) and tilts (pitch below the horizon); a shot can re-aim it
 *  with userData.aimAt(x, y, z, spread) and set the strength of its shaft with userData.shaft(k). */
export function makeFlood(height = 7, yaw = 0, pitch = 0.9, reach = 30) {
  const g = new THREE.Group();
  const pole = new THREE.Group();
  pole.add(put(tboxGeo(0.9, 0.4, 0.9, 1), tiled('hullG'), 0, 0.2, 0));
  pole.add(put(boxG(0.26, height, 0.26), MAT.graphite, 0, height / 2, 0));
  pole.add(strut(0.3, 0.3, 0.3, 0, height * 0.45, 0, 0.04, MAT.graphite, 4));
  pole.add(strut(-0.3, 0.3, -0.3, 0, height * 0.45, 0, 0.04, MAT.graphite, 4));
  g.add(bake(pole));
  const head = new THREE.Group();
  head.position.set(0, height + 0.15, 0);
  head.add(put(boxG(1.5, 0.12, 0.3), MAT.graphite, 0, -0.1, 0));
  const tilt = new THREE.Group();                 // -Y of this group is the beam axis
  tilt.position.set(0, 0.12, 0);
  const lamps = new THREE.Group();
  for (const dx of [-0.42, 0.42]) {
    lamps.add(put(boxG(0.7, 0.34, 0.55), MAT.graphite, dx, 0.17, 0));
    lamps.add(put(boxG(0.6, 0.04, 0.45), MAT.warm, dx, -0.01, 0));
  }
  tilt.add(bake(lamps));
  const L0 = 30, shaft = beam(0xffe4b8, L0, L0 * 0.3, 0.5);
  let own = 1, moodK = 1;
  const strength = shaft.material.uniforms.uI;
  // the mood drives every shaft; `own` scales this one on top of it
  const apply = () => { strength.value = 0.5 * moodK * own; shaft.visible = strength.value > 0.004; };
  fx.push({ group: 'beam', set: (k) => { moodK = k; apply(); } });
  tilt.add(shaft);
  head.add(tilt);
  const h = halo(0xffe0b0, 6, 0.8); h.position.set(0, 0.1, 0.3); head.add(h);
  g.add(head);
  const aim = (yw, pt, len, spread = 0.3) => {
    head.rotation.y = yw; tilt.rotation.x = pt - Math.PI / 2;      // rotate -Y towards +Z, tilted down by `pt`
    shaft.scale.set(len * spread / (L0 * 0.3), len / L0, len * spread / (L0 * 0.3));
  };
  aim(yaw, pitch, reach);
  g.userData.aimAt = (x, y, z, spread = 0.3, over = 1.06) => {
    const hx = g.position.x, hy = g.position.y + height + 0.27, hz = g.position.z;
    const dx = x - hx, dy = y - hy, dz = z - hz, hd = Math.hypot(dx, dz);
    aim(Math.atan2(dx, dz), Math.atan2(-dy, hd), Math.hypot(hd, dy) * over, spread);
    return { x: hx, y: hy, z: hz };
  };
  g.userData.shaft = (k) => { own = k; apply(); };
  g.userData.reset = () => { own = 1; apply(); aim(yaw, pitch, reach); };
  return g;
}

export function makeDropship() {
  const g = new THREE.Group();
  const W = tiled('hullW'), G = tiled('hullG'), S = tiled('hullS');
  // fuselage (nose towards +Z)
  g.add(put(tboxGeo(3.4, 1.0, 7.2, 0.5), W, 0, 3.4, -0.2));
  g.add(put(tboxGeo(3.4, 1.0, 7.2, 1), S, 0, 2.4, -0.2));
  g.add(put(tboxGeo(3.0, 0.5, 6.8, 0.5), G, 0, 1.65, -0.2));
  g.add(put(tboxGeo(1.3, 0.3, 4.6, 0.5), G, 0, 4.03, -0.9));
  // nose and canopy
  g.add(put(tboxGeo(3.0, 1.2, 1.8, 0.5), W, 0, 2.3, 4.2));
  g.add(put(tboxGeo(2.2, 0.8, 1.2, 0.5), G, 0, 2.05, 5.5));
  g.add(put(rbox(2.7, 1.25, 2.3, 0.12), MAT.canopy, 0, 3.15, 3.75, 0.42, 0, 0));
  g.add(put(boxG(3.0, 0.12, 0.2), MAT.graphite, 0, 3.86, 2.85, 0.42, 0, 0));
  // stub wings + engine nacelles
  for (const s of [-1, 1]) {
    g.add(put(tboxGeo(2.6, 0.28, 2.6, 0.5), W, s * 2.8, 3.25, -1.1, 0, 0, s * 0.1));
    const n = new THREE.Group();
    n.position.set(s * 4.3, 3.2, -1.1);
    n.add(put(cylG(1.0, 1.0, 3.3, 14), MAT.white, 0, 0, 0, Math.PI / 2, 0, 0));
    n.add(put(cylG(1.06, 1.06, 0.4, 14), MAT.orange, 0, 0, 1.2, Math.PI / 2, 0, 0));
    n.add(put(cylG(0.82, 1.0, 0.5, 14), MAT.graphite, 0, 0, 1.9, Math.PI / 2, 0, 0));
    n.add(put(cylG(0.9, 0.7, 0.7, 14), MAT.graphite, 0, 0, -2.0, Math.PI / 2, 0, 0));
    n.add(put(cylG(0.62, 0.62, 0.06, 14), MAT.cyan, 0, 0, -2.36, Math.PI / 2, 0, 0));
    n.add(put(cylG(0.7, 0.55, 0.6, 12), MAT.graphite, 0, -1.15, 0));
    n.add(put(cylG(0.5, 0.5, 0.05, 12), MAT.cyan, 0, -1.46, 0));
    n.add(put(sphG(0.11, 8, 6), s < 0 ? MAT.amber : MAT.cyan, s * 1.02, 0, 0.6));
    g.add(n);
    // V tail
    g.add(put(tboxGeo(0.22, 2.2, 1.7, 0.5), W, s * 1.35, 4.75, -3.0, -0.25, 0, -s * 0.42));
    g.add(put(boxG(0.24, 0.45, 1.72), MAT.orange, s * 1.76, 5.66, -3.24, -0.25, 0, -s * 0.42));
    // landing legs
    for (const fz of [2.6, -2.9]) {
      g.add(strut(s * 1.3, 1.6, fz, s * 2.05, 0.2, fz + Math.sign(fz) * 0.5, 0.13, MAT.grey, 6));
      g.add(strut(s * 1.3, 2.4, fz, s * 1.75, 0.9, fz + Math.sign(fz) * 0.3, 0.07, MAT.graphite, 5));
      g.add(put(cylG(0.5, 0.56, 0.16, 10), MAT.graphite, s * 2.05, 0.08, fz + Math.sign(fz) * 0.5));
    }
  }
  // rear ramp with a warm cargo-bay glow
  g.add(put(tboxGeo(2.3, 0.14, 3.2, 0.5), G, 0, 0.85, -5.05, -0.5, 0, 0));
  g.add(put(boxG(2.3, 1.7, 0.06), MAT.warm, 0, 2.5, -3.82));
  g.add(put(tboxGeo(3.4, 0.35, 0.5, 0.5), G, 0, 3.5, -3.9));
  for (const s of [-1, 1]) g.add(put(tboxGeo(0.5, 2.2, 0.5, 0.5), G, s * 1.45, 2.5, -3.9));
  // roof antenna + beacon
  g.add(strut(0.4, 4.1, -2.4, 0.4, 5.6, -2.7, 0.03, MAT.graphite, 4));
  g.add(put(sphG(0.12, 8, 6), MAT.red, 0, 4.25, 0.6));
  const hr = halo(0xffc890, 7, 0.55); hr.position.set(0, 2.2, -4.6); g.add(hr);
  return g;
}

export function makeRover() {
  const g = new THREE.Group();
  const W = tiled('hullW'), G = tiled('hullG');
  g.add(put(tboxGeo(2.0, 0.45, 4.0, 1), G, 0, 0.95, 0));
  g.add(put(tboxGeo(1.9, 1.05, 1.7, 1), W, 0, 1.7, 0.75));
  g.add(put(rbox(1.7, 0.8, 0.9, 0.08), MAT.canopy, 0, 1.78, 1.55, 0.3, 0, 0));
  g.add(put(boxG(1.94, 0.16, 1.74), MAT.orange, 0, 1.3, 0.75));
  g.add(put(tboxGeo(1.7, 0.1, 1.3, 0.5), tiled('solar'), 0, 2.3, 0.7, -0.08, 0, 0));
  // cargo bed
  g.add(put(tboxGeo(0.85, 0.8, 0.85, 1), tiled('cargo'), -0.45, 1.58, -1.25));
  g.add(put(tboxGeo(0.7, 0.6, 0.7, 1), tiled('cargo'), 0.5, 1.48, -1.0, 0, 0.3, 0));
  g.add(put(cylG(0.22, 0.22, 0.9, 10), MAT.orange, 0.5, 1.4, -1.65, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) {
    g.add(put(boxG(0.06, 0.4, 1.9), MAT.graphite, s * 0.97, 1.36, -1.1));
    for (const z of [-1.45, 0, 1.45]) {
      const wh = new THREE.Group();
      wh.position.set(s * 1.22, 0.58, z);
      wh.add(put(cylG(0.58, 0.58, 0.42, 16), MAT.rubber, 0, 0, 0, 0, 0, Math.PI / 2));
      wh.add(put(cylG(0.3, 0.3, 0.46, 10), MAT.grey, 0, 0, 0, 0, 0, Math.PI / 2));
      wh.add(put(cylG(0.12, 0.12, 0.5, 8), MAT.orange, 0, 0, 0, 0, 0, Math.PI / 2));
      g.add(wh);
      g.add(strut(s * 0.9, 0.95, z, s * 1.05, 0.58, z, 0.09, MAT.grey, 5));
    }
    g.add(put(boxG(0.34, 0.16, 0.06), MAT.warm, s * 0.6, 1.02, 2.02));
  }
  g.add(strut(-0.7, 2.2, 0.1, -0.7, 3.7, -0.1, 0.025, MAT.graphite, 4));
  g.add(put(sphG(0.07, 6, 5), MAT.amber, -0.7, 3.72, -0.1));
  const h = halo(0xffe0b0, 4, 0.5); h.position.set(0, 1.0, 2.3); g.add(h);
  return g;
}

// ------------------------------------------------------------------ mist banks (night)
const mistTex = canvasTexture(128, (ctx, s) => {
  const rnd = mulberry32(77);
  for (let i = 0; i < 26; i++) {
    const x = s * (0.25 + rnd() * 0.5), y = s * (0.38 + rnd() * 0.24), r = s * (0.12 + rnd() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.13)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }
});
export function makeMist(list) {
  const g = new THREE.Group();
  g.name = 'mist';
  for (const [x, y, z, size, color, op] of list) {
    const mat = new THREE.SpriteMaterial({ map: mistTex, color, transparent: true, opacity: op, depthWrite: false, fog: true });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z); sp.scale.set(size, size * 0.42, 1);
    fx.push({ group: 'mist', set: (k) => { mat.opacity = op * k; sp.visible = mat.opacity > 0.003; } });
    g.add(sp);
  }
  return g;
}

// ------------------------------------------------------------------ static batching
/** Merge every opaque mesh under `root` into one mesh per material (what a shipped build would do). */
export function bake(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), gone = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isReflector || !o.material.isMeshStandardMaterial || o.material.transparent) return;
    const geo = o.geometry.index ? o.geometry.clone() : null;
    if (!geo || !geo.attributes.normal || !geo.attributes.uv) return;
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    let b = buckets.get(o.material);
    if (!b) { b = []; buckets.set(o.material, b); }
    b.push(geo);
    gone.push(o);
  });
  for (const o of gone) o.parent.remove(o);
  for (const [mat, geos] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = true; m.receiveShadow = true;
    root.add(m);
  }
  return root;
}
