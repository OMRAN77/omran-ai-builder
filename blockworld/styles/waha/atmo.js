// Atmosphere for the "waha" look: one analytic sky model shared by the sky dome and by the
// distance/height fog of every material, so terrain always fades into exactly the sky behind it.
// Everything here is a handful of ALU instructions per pixel: fine for a phone GPU.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { canvasTexture } from '../../shared/stage.js';
import { hash3, mulberry32 } from '../../shared/noise.js';

const srgb = (hex) => new THREE.Color(hex); // THREE converts hex sRGB -> linear working space

// ---- shared uniforms (same objects referenced by every patched material) ----
export const ATM = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uSunHorizon: { value: new THREE.Color() },
  uGlow: { value: new THREE.Color() },
  uGlowParams: { value: new THREE.Vector4(6, 0.5, 90, 0.6) },
  uFog: { value: new THREE.Vector4(0.004, 0.03, 20, 0.96) },
  uNoise: { value: null },
  uWind: { value: new THREE.Vector2(0.94, 0.342) },
  uRipple: { value: 1.0 },
  uRim: { value: new THREE.Vector4(1, 1, 1, 0) },            // rim-light colour and strength for the cast
  uRockLift: { value: new THREE.Vector4(0, 0, 0, 0) },       // sky bounce on vertical rock at night
  uPoolLevel: { value: 20.88 },
  uMilkyPole: { value: new THREE.Vector3(-0.376, 0.789, 0.487).normalize() },
  uSunColor: { value: new THREE.Color() },
  uSkyGain: { value: 1.0 },
  uSunDisc: { value: new THREE.Vector3(0.9996, 40.0, 1.0) }, // cos(radius), brightness, enabled
  uStarFade: { value: 0.0 },
  uCloud: { value: new THREE.Vector4(0.5, 1.0, 0.0, 0.0) }, // amount, warmth
  uCloudLit: { value: new THREE.Color() },
  uCloudDark: { value: new THREE.Color() },
};

// tileable multi-channel noise used for warps and macro variation
export function makeNoiseTexture() {
  const S = 128;
  const rnd = (x, y, s) => hash3(((x % s) + s) % s, ((y % s) + s) % s, 7, 91 + s);
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (u, v, cells) => {
    const x = u * cells, y = v * cells;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = sm(x - ix), fy = sm(y - iy);
    const a = rnd(ix, iy, cells), b = rnd(ix + 1, iy, cells), c = rnd(ix, iy + 1, cells), d = rnd(ix + 1, iy + 1, cells);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const tex = canvasTexture(S, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s;
      const r = vn(u, v, 4) * 0.55 + vn(u, v, 8) * 0.3 + vn(u, v, 16) * 0.15;
      const g = vn(u + 0.37, v + 0.11, 8) * 0.5 + vn(u, v, 16) * 0.3 + vn(u, v, 32) * 0.2;
      const b = vn(u + 0.71, v + 0.53, 16) * 0.5 + vn(u, v, 32) * 0.3 + vn(u, v, 64) * 0.2;
      const i = (y * s + x) * 4;
      img.data[i] = r * 255; img.data[i + 1] = g * 255; img.data[i + 2] = b * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { data: true, repeat: true, anisotropy: 1 });
  return tex;
}

export const ATMO_PARS = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunHorizon;
uniform vec3 uGlow;
uniform vec4 uGlowParams;
uniform vec4 uFog;
uniform float uSkyGain;
vec3 wahaSky(vec3 d) {
  float y = clamp(d.y, 0.0, 1.0);
  vec2 dh = normalize(d.xz + vec2(1e-5, 0.0));
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float az = dot(dh, sh) * 0.5 + 0.5;
  vec3 hor = mix(uHorizon, uSunHorizon, az * az * az);
  float t = 1.0 - exp(-y * 5.0);
  vec3 c = mix(hor, uZenith, t);
  float sd = max(dot(normalize(d), uSunDir), 0.0);
  c += uGlow * (uGlowParams.y * pow(sd, uGlowParams.x) + uGlowParams.w * pow(sd, uGlowParams.z));
  return c * uSkyGain;
}
float wahaFogAmount(vec3 ro, vec3 rd, float dist) {
  float k = rd.y * uFog.y;
  float t = abs(k) < 1e-4 ? dist : (1.0 - exp(-dist * k)) / k;
  float f = uFog.x * exp(-(ro.y - uFog.z) * uFog.y) * t;
  return min(1.0 - exp(-f), uFog.w);
}
vec3 wahaAtmo(vec3 col, vec3 wpos) {
  vec3 v = wpos - cameraPosition;
  float dist = length(v);
  vec3 rd = v / max(dist, 1e-4);
  float f = wahaFogAmount(cameraPosition, rd, dist);
  vec3 fd = normalize(vec3(rd.x, 0.03 + max(rd.y, 0.0) * 0.6, rd.z));
  return mix(col, wahaSky(fd), f);
}
`;

const VOXEL_PARS = /* glsl */`
uniform sampler2D uNoise;
uniform vec2 uWind;
uniform float uRipple;
uniform vec4 uRim;
uniform vec4 uRockLift;
uniform float uPoolLevel;
float wahaHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
`;

/**
 * Patch a built-in material: world-space varyings, shared fog/sky, and optional voxel extras.
 * flags: { voxel: per-block tonal variation + macro variation, sand: smooth dune normals + wind ripples,
 *          variation: number (strength of per-block variation) }
 */
export function patchMaterial(mat, flags = {}) {
  const key = 'waha:' + (flags.voxel ? 'v' : '') + (flags.sand !== undefined ? 's' + flags.sand : '') + (flags.variation ?? '') + (flags.nofog ? 'n' : '') + (flags.backdrop ? 'b' : '')
    + (flags.wet ? 'w' : '') + (flags.firm ? 'f' : '') + (flags.rock ? 'r' : '') + (flags.rim ? 'm' + flags.rim : '') + (flags.dissolve ? 'd' : '');
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    for (const k of Object.keys(ATM)) shader.uniforms[k] = ATM[k];
    if (flags.uniforms) for (const k of Object.keys(flags.uniforms)) shader.uniforms[k] = flags.uniforms[k];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;' + (flags.backdrop ? '\nattribute float aRock;\nattribute float aDip;\nvarying float vRock;\nvarying float vDip;' : '') + (flags.firm ? '\nattribute float aMix;\nvarying float vMix;' : ''))
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wahaWP = vec4(transformed, 1.0);
        vec3 wahaN = objectNormal;
        #ifdef USE_INSTANCING
          wahaWP = instanceMatrix * wahaWP;
          wahaN = mat3(instanceMatrix) * wahaN;
        #endif
        vWPos = (modelMatrix * wahaWP).xyz;
        vWNormal = normalize(mat3(modelMatrix) * wahaN);` + (flags.backdrop ? '\nvRock = aRock; vDip = aDip;' : '') + (flags.firm ? '\nvMix = aMix;' : ''));
    let fs = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\n' + (flags.firm ? 'varying float vMix;\n' : '') + ATMO_PARS + VOXEL_PARS);
    if (flags.voxel) {
      const varAmt = (flags.variation ?? 0.05).toFixed(3);
      const hueAmt = ((flags.variation ?? 0.05) * 0.4).toFixed(4);
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 wn0 = normalize(vWNormal);
          vec3 cell = floor(vWPos - wn0 * 0.5 + 0.001);
          float hv = wahaHash(cell);
          float hv2 = wahaHash(cell + 17.3);
          float macro = texture2D(uNoise, vWPos.xz * 0.011 + vWPos.y * 0.004).r;
          float macro2 = texture2D(uNoise, vWPos.zx * 0.0037 + 0.3).g;
          diffuseColor.rgb *= 1.0 + ${varAmt} * (hv - 0.5) * 2.0;
          diffuseColor.rgb *= vec3(1.0 + ${hueAmt} * (hv2 - 0.5), 1.0, 1.0 - ${hueAmt} * 1.5 * (hv2 - 0.5));
          diffuseColor.rgb *= 0.90 + 0.20 * macro;
          diffuseColor.rgb *= mix(vec3(1.06, 0.99, 0.93), vec3(0.95, 1.0, 1.05), macro2);
        }`);
      if (flags.wet) {
        fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        {
          float wetK = smoothstep(uPoolLevel + 1.0, uPoolLevel + 0.05, vWPos.y);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.50, 0.53, 0.52), wetK);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.55, 0.80, 0.78), smoothstep(uPoolLevel, uPoolLevel - 1.2, vWPos.y));
        }`);
      }
      if (flags.rock) {
        fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse += uRockLift.rgb * uRockLift.a * diffuseColor.rgb * (1.0 - abs(normalize(vWNormal).y));`);
      }
    }
    if (flags.backdrop) {
      fs = fs.replace('#include <common>', '#include <common>\nvarying float vRock;\nvarying float vDip;\nuniform sampler2D uStrata;\nuniform vec3 uSandCol;')
        .replace('#include <color_fragment>', `
        float wahaRockK = 0.0;
        {
          float macro = texture2D(uNoise, vWPos.xz * 0.011 + vWPos.y * 0.004).r;
          float macro2 = texture2D(uNoise, vWPos.zx * 0.0037 + 0.3).g;
          vec3 rockCol = texture2D(uStrata, vec2(0.5, (floor(vWPos.y + 0.2 + vDip) + 0.5) / 160.0)).rgb;
          // anything steeper than a slip face is a rock wall, whatever the coarse grid sampled
          wahaRockK = max(smoothstep(0.35, 0.65, vRock), smoothstep(0.80, 0.62, normalize(vWNormal).y));
          vec3 c = mix(uSandCol, rockCol, wahaRockK);
          c *= 0.90 + 0.20 * macro;
          c *= mix(vec3(1.06, 0.99, 0.93), vec3(0.95, 1.0, 1.05), macro2);
          diffuseColor.rgb *= c;
        }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (wahaRockK > 0.5) {
          // rock near the voxel world is lit as block faces (tops and axis-aligned walls), so the far cliffs
          // carry on the same two-tone light as the voxel cliffs they join
          vec3 wn = normalize(vWNormal);
          vec3 q = wn.y > 0.82 ? vec3(0.0, 1.0, 0.0) : (abs(wn.x) > abs(wn.z) ? vec3(sign(wn.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(wn.z)));
          float nearK = 1.0 - smoothstep(380.0, 700.0, length(vWPos - cameraPosition));
          wn = normalize(mix(wn, q, 0.9 * nearK));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          float step1 = fract(vWPos.y + 0.2 + vDip);
          diffuseColor.rgb *= 1.0 - 0.16 * nearK * (1.0 - smoothstep(0.0, 0.16, step1));
        }`);
    }
    if (flags.sand !== undefined) {
      const amt = Number(flags.sand).toFixed(3);
      fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // wind ripples on loose ground: a procedural normal + tone, faded with distance and toward the terminator
          vec3 wn = normalize(vWNormal);
          float topness = smoothstep(0.30, 0.75, wn.y);
          float warp = texture2D(uNoise, vWPos.xz * 0.019).r * 2.0 - 1.0;
          vec2 wdir = uWind;
          float ph = dot(vWPos.xz, wdir) * 9.5 + warp * 11.0;
          float fade = 1.0 - smoothstep(0.30, 1.4, fwidth(ph));
          float s = sin(ph + 0.6 * sin(ph));
          float c = cos(ph + 0.6 * sin(ph)) * (1.0 + 0.6 * cos(ph));
          float ph2 = dot(vWPos.xz, wdir) * 1.9 + warp * 5.0 + 1.3;
          float fade2 = 1.0 - smoothstep(0.30, 1.4, fwidth(ph2));
          float patchy = 0.45 + 0.75 * texture2D(uNoise, vWPos.zx * 0.013 + 0.61).g;
          float k = uRipple * ${amt} * topness * patchy * smoothstep(0.02, 0.30, dot(wn, uSunDir));
          ${flags.firm ? 'k *= 1.0 - 0.82 * vMix; diffuseColor.rgb *= mix(vec3(1.0), vec3(1.035, 1.03, 1.0), vMix);' : ''}
          vec3 rn = vec3(wdir.x, 0.0, wdir.y) * (-(c * 0.22 * fade + cos(ph2) * 0.05 * fade2) * k);
          vec3 bn = normalize(wn + rn);
          normal = normalize((viewMatrix * vec4(bn, 0.0)).xyz);
          diffuseColor.rgb *= 1.0 + (0.05 * s * fade + 0.03 * sin(ph2) * fade2) * k;
        }`);
    }
    if (flags.rim) {
      fs = fs.replace('#include <envmap_fragment>', `
        {
          float rimF = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);
          vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          float side = smoothstep(-0.45, 0.55, dot(normal, sunV));
          outgoingLight += uRim.rgb * uRim.a * ${Number(flags.rim).toFixed(2)} * rimF * (0.25 + 0.75 * side) * (0.35 + 0.65 * diffuseColor.rgb);
        }
        #include <envmap_fragment>`);
    }
    if (!flags.nofog) {
      fs = fs.replace('#include <fog_fragment>', 'gl_FragColor.rgb = wahaAtmo(gl_FragColor.rgb, vWPos);');
    }
    shader.fragmentShader = fs;
  };
  return mat;
}

// ---- sky dome ----
export function createSky() {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: ATM,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * viewMatrix * vec4(position * 900.0 + cameraPosition, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform sampler2D uNoise;
      uniform vec3 uSunDisc;
      uniform vec3 uSunColor;
      uniform vec4 uCloud;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudDark;
      uniform float uStarFade;
      uniform vec3 uMilkyPole;
      ${ATMO_PARS}
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = wahaSky(d);
        float sd = dot(d, uSunDir);
        // high thin cloud streaks, lit from the sun side
        if (uCloud.x > 0.0 && d.y > 0.0) {
          vec2 p = d.xz / (d.y + 0.22);
          vec2 q = vec2(p.x * 0.9 + p.y * 0.45, p.y * 0.9 - p.x * 0.45);
          float n = texture2D(uNoise, q * vec2(0.035, 0.11) + vec2(0.13, 0.4)).r * 0.6
                  + texture2D(uNoise, q * vec2(0.09, 0.31)).g * 0.3
                  + texture2D(uNoise, q * vec2(0.23, 0.77)).b * 0.1;
          float cov = smoothstep(0.80 - uCloud.x * 0.55, 1.02 - uCloud.x * 0.55, n);
          cov *= smoothstep(0.015, 0.16, d.y) * (1.0 - smoothstep(0.55, 0.95, d.y) * 0.6);
          float lit = pow(max(sd, 0.0), 3.0);
          vec3 cc = mix(uCloudDark, uCloudLit, clamp(lit * 1.4 + 0.25 * (1.0 - d.y), 0.0, 1.0));
          col = mix(col, cc * uSkyGain, cov * 0.75);
        }
        // the river of the milky way: a noisy glowing band with a dark dust lane, on a fixed great circle
        if (uStarFade > 0.0) {
          vec3 pole = uMilkyPole;
          vec3 ba = normalize(cross(pole, vec3(0.0, 1.0, 0.0)));
          vec3 bb = cross(pole, ba);
          float v = dot(d, pole);
          float u = atan(dot(d, bb), dot(d, ba)) / 6.2831853;
          float band = exp(-pow(v * 3.6, 2.0));
          float core = exp(-pow(v * 9.0, 2.0));
          float cl = texture2D(uNoise, vec2(u * 5.0, v * 1.9 + 0.2)).r * 0.55 + texture2D(uNoise, vec2(u * 13.0, v * 4.5)).g * 0.45;
          float lane = smoothstep(0.42, 0.70, texture2D(uNoise, vec2(u * 9.0 + 0.3, v * 5.5 + 0.5)).b) * exp(-pow((v + 0.03) * 7.0, 2.0));
          float along = 0.55 + 0.45 * sin(u * 6.2831853 + 0.9);
          vec3 mw = vec3(0.060, 0.085, 0.160) * band * (0.25 + 1.5 * cl * cl) + vec3(0.150, 0.135, 0.150) * core * (0.2 + 1.6 * cl * cl) * along;
          mw *= 1.0 - 0.55 * lane;
          col += mw * uStarFade * smoothstep(0.0, 0.22, d.y) * (1.0 - 0.7 * smoothstep(0.86, 0.99, sd));
        }
        // sun disc with a soft limb
        if (uSunDisc.z > 0.5) {
          float disc = smoothstep(uSunDisc.x - 0.00012, uSunDisc.x + 0.00006, sd);
          col += uSunColor * uSunDisc.y * disc;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  mesh.name = 'sky';
  return mesh;
}

// ---- stars (points) ----
export function createStars(count = 30000) {
  const rnd = mulberry32(4242);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
  // milky way band: great circle with this pole
  const pole = ATM.uMilkyPole.value.clone().normalize();
  const v = new THREE.Vector3();
  let i = 0;
  while (i < count) {
    const inBand = i > count * 0.40;
    v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue;
    v.normalize();
    if (inBand) {
      const off = v.dot(pole);
      const spread = 0.20 * (rnd() + rnd() + rnd() - 1.5);
      v.addScaledVector(pole, -off + spread).normalize();
    }
    if (v.y < -0.02) continue;
    const m = Math.pow(rnd(), inBand ? 5.5 : 3.6); // most stars are faint
    const temp = rnd();
    const c = temp < 0.2 ? [1.0, 0.82, 0.66] : temp < 0.75 ? [0.93, 0.95, 1.0] : [0.72, 0.82, 1.0];
    const b = (inBand ? 0.55 : 0.80) + m * 3.4;
    pos[i * 3] = v.x * 1900; pos[i * 3 + 1] = v.y * 1900; pos[i * 3 + 2] = v.z * 1900;
    col[i * 3] = c[0] * b; col[i * 3 + 1] = c[1] * b; col[i * 3 + 2] = c[2] * b;
    size[i] = (inBand ? 1.25 : 1.45) + m * 2.3;
    i++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uFade: ATM.uStarFade, uSunDir: ATM.uSunDir },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      attribute float aSize; attribute vec3 color; varying vec3 vC; varying float vH; uniform float uPx; uniform vec3 uSunDir;
      void main() {
        vec3 d = normalize(position);
        vH = smoothstep(0.0, 0.22, d.y);
        float moon = 1.0 - 0.85 * smoothstep(0.90, 0.995, dot(d, uSunDir));
        vC = color * moon;
        vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
        gl_Position = p;
        gl_PointSize = aSize * uPx;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vH; uniform float uFade;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.05, length(q));
        gl_FragColor = vec4(vC * a * vH * uFade, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -90;
  pts.name = 'stars';
  return pts;
}

// ---- moon (textured disc, drawn after the sky) ----
export function createMoon() {
  const tex = canvasTexture(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s * 0.44, s * 0.42, s * 0.05, s / 2, s / 2, s * 0.47);
    g.addColorStop(0, '#fbf6e6'); g.addColorStop(0.75, '#e9e2cd'); g.addColorStop(1, '#bfb9a8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.47, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.47, 0, Math.PI * 2); ctx.clip();
    const maria = [[0.38, 0.36, 0.13], [0.55, 0.3, 0.09], [0.6, 0.5, 0.12], [0.36, 0.58, 0.08], [0.5, 0.68, 0.07], [0.68, 0.36, 0.05]];
    for (const [x, y, r] of maria) {
      const mg = ctx.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
      mg.addColorStop(0, 'rgba(120,124,128,0.50)'); mg.addColorStop(1, 'rgba(120,124,128,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }, { anisotropy: 1 });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  mat.color.setRGB(2.6, 2.7, 3.0);
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat);
  m.renderOrder = -80;
  m.name = 'moon';
  return m;
}

// ---- post: bloom + filmic curve + grade + vignette ----
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uSat: { value: 1.0 },
    uContrast: { value: 1.0 },
    uVig: { value: 0.3 },
    uShadowTint: { value: new THREE.Vector3(0, 0, 0) },
    uHighTint: { value: new THREE.Vector3(0, 0, 0) },
    uLift: { value: 0.0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uExposure, uSat, uContrast, uVig, uLift;
    uniform vec3 uShadowTint, uHighTint;
    vec3 filmic(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.82);
      c *= 1.0 - uVig * smoothstep(0.28, 0.80, length(q));
      c = filmic(c);
      c = pow(c, vec3(1.0 / 2.2));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c += uShadowTint * (1.0 - l) * (1.0 - l) + uHighTint * l * l;
      c = (c - 0.5) * uContrast + 0.5 + uLift;
      c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPipeline(stage, opts = {}) {
  const { renderer, scene, camera } = stage;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.info.autoReset = false;
  const rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, samples: opts.samples ?? 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(8, 8), 0.35, 0.55, 1.25);
  const final = new ShaderPass(FinalShader);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(final);
  const listeners = [];
  // A frame is rendered once per change (shot or resize) and then kept: the canvas preserves its
  // drawing buffer. The 1-pixel read-back makes the GPU finish before the call returns, so a
  // screenshot taken right after never waits on queued work.
  // The running game sets stage.live: every call draws, and nothing waits for the GPU.
  let dirty = true;
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  stage.onResize = (w, h, pr) => {
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    for (const fn of listeners) fn(w, h, pr);
    dirty = true;
  };
  const before = [];
  stage.render = () => {
    if (!dirty && !stage.live) return;
    dirty = false;
    renderer.info.reset();
    for (const fn of before) fn();
    composer.render();
    if (!stage.live) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  stage.invalidate = () => { dirty = true; };
  stage.resize();
  return { composer, bloom, final, onResize: (fn) => listeners.push(fn), beforeRender: (fn) => before.push(fn) };
}

// ---- time-of-day presets ----
export const TIMES = {
  golden: {
    sunAz: -116, sunEl: 11.5,                    // azimuth: degrees from north (-z), negative = west
    sunColor: '#ffb884', sunIntensity: 7.2,
    hemiSky: '#7f98d6', hemiGround: '#a8785c', hemiIntensity: 1.55,
    zenith: '#35568f', horizon: '#c9a79a', sunHorizon: '#ffc98c', glow: '#ff9c4a',
    glowParams: [5, 0.55, 110, 1.6],
    fog: [0.0032, 0.026, 22, 0.97],
    skyGain: 1.0, disc: [0.99955, 60, 1], starFade: 0,
    cloud: 0.55, cloudLit: '#ffd9a8', cloudDark: '#8d7f97',
    exposure: 1.0, sat: 1.08, contrast: 1.12, vig: 0.38,
    shadowTint: [-0.012, 0.0, 0.03], highTint: [0.03, 0.012, -0.02],
    bloom: [0.42, 0.6, 1.15], night: 0,
    water: { deep: [0.006, 0.030, 0.034], shallow: [0.050, 0.085, 0.060], dark: [0.07, 0.065, 0.04], glint: 1 }, lamp: 0.22, windows: 1.3,
    rim: [1.0, 0.62, 0.30, 1.6],
  },
  afternoon: {
    sunAz: -62, sunEl: 33,
    sunColor: '#ffe0b8', sunIntensity: 5.0,
    hemiSky: '#93b0e6', hemiGround: '#b8946e', hemiIntensity: 1.5,
    zenith: '#3f6fb3', horizon: '#cfd3d6', sunHorizon: '#f3e2c4', glow: '#ffe1b0',
    glowParams: [6, 0.25, 140, 0.8],
    fog: [0.0034, 0.04, 22, 0.94],
    skyGain: 1.0, disc: [0.99955, 60, 1], starFade: 0,
    cloud: 0.42, cloudLit: '#fff4e2', cloudDark: '#b9bfcc',
    exposure: 1.02, sat: 1.04, contrast: 1.06, vig: 0.28,
    shadowTint: [-0.008, 0.0, 0.02], highTint: [0.02, 0.008, -0.012],
    bloom: [0.25, 0.5, 1.3], night: 0,
    water: { deep: [0.006, 0.040, 0.048], shallow: [0.055, 0.10, 0.075], dark: [0.10, 0.10, 0.07], glint: 0.6 }, lamp: 0.0, windows: 0.2,
    rim: [1.0, 0.86, 0.66, 0.9],
  },
  night: {
    sunAz: -116, sunEl: 27,                     // this is the moon: behind the camera's left shoulder, so cliff faces and creatures are lit, not silhouetted
    sunColor: '#86a8ff', sunIntensity: 2.25,
    hemiSky: '#3f5fc0', hemiGround: '#1b2448', hemiIntensity: 1.2,
    zenith: '#02050d', horizon: '#0d1933', sunHorizon: '#1a315e', glow: '#6f93e0',
    glowParams: [5, 0.10, 260, 1.1],
    fog: [0.0034, 0.035, 22, 0.93],
    skyGain: 1.0, disc: [2, 0, 0], starFade: 1,
    cloud: 0.0, cloudLit: '#3a4a70', cloudDark: '#101828',
    exposure: 1.2, sat: 1.0, contrast: 1.08, vig: 0.42,
    shadowTint: [-0.012, 0.002, 0.028], highTint: [0.008, 0.006, 0.0],
    bloom: [0.5, 0.65, 1.15], night: 1,
    water: { deep: [0.002, 0.006, 0.012], shallow: [0.006, 0.014, 0.02], dark: [0.004, 0.007, 0.016], glint: 0.5 }, lamp: 1.0, windows: 2.4,
    rim: [0.42, 0.58, 1.0, 1.25], rockLift: [0.22, 0.34, 0.80, 0.14],
  },
};

export function dirFromAzEl(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

/** Apply a preset to the shared uniforms, lights and post chain. */
export function applyTime(p, rig) {
  const dir = dirFromAzEl(p.sunAz, p.sunEl);
  ATM.uSunDir.value.copy(dir);
  ATM.uZenith.value.copy(srgb(p.zenith));
  ATM.uHorizon.value.copy(srgb(p.horizon));
  ATM.uSunHorizon.value.copy(srgb(p.sunHorizon));
  ATM.uGlow.value.copy(srgb(p.glow));
  ATM.uGlowParams.value.set(...p.glowParams);
  ATM.uFog.value.set(...p.fog);
  ATM.uSkyGain.value = p.skyGain;
  ATM.uSunDisc.value.set(...p.disc);
  ATM.uSunColor.value.copy(srgb(p.sunColor));
  ATM.uStarFade.value = p.starFade;
  ATM.uCloud.value.set(p.cloud, 1, 0, 0);
  ATM.uCloudLit.value.copy(srgb(p.cloudLit));
  ATM.uCloudDark.value.copy(srgb(p.cloudDark));
  ATM.uRim.value.set(...(p.rim || [1, 0.8, 0.6, 0]));
  ATM.uRockLift.value.set(...(p.rockLift || [0, 0, 0, 0]));
  rig.sun.color.copy(srgb(p.sunColor));
  rig.sun.intensity = p.sunIntensity;
  rig.hemi.color.copy(srgb(p.hemiSky));
  rig.hemi.groundColor.copy(srgb(p.hemiGround));
  rig.hemi.intensity = p.hemiIntensity;
  rig.sunDir = dir;
  const f = rig.post.final.uniforms;
  f.uExposure.value = p.exposure; f.uSat.value = p.sat; f.uContrast.value = p.contrast; f.uVig.value = p.vig;
  f.uShadowTint.value.set(...p.shadowTint); f.uHighTint.value.set(...p.highTint);
  rig.post.bloom.strength = p.bloom[0]; rig.post.bloom.radius = p.bloom[1]; rig.post.bloom.threshold = p.bloom[2];
  rig.stars.visible = p.starFade > 0;
  rig.moon.visible = p.night === 1;
  rig.night = p.night === 1;
}
