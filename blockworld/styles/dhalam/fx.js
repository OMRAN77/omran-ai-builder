// Atmosphere and post: analytic height fog shared by every material, baked voxel light
// (sky occlusion + flood-filled fire light) hook, sky dome, bloom + grade pass.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

// ---------------------------------------------------------------------------------------------
// Shared uniforms
// ---------------------------------------------------------------------------------------------
export const U = {
  uFogColor: { value: new THREE.Color(0x7f8b98) },
  uFogSunColor: { value: new THREE.Color(0xb9b5aa) },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogParams: { value: new THREE.Vector4(0.002, 0.03, 16, 0.12) }, // global density, low-fog density, base height, falloff
  uFogMisc: { value: new THREE.Vector4(6, 0.98, 0, 0) },            // sun-scatter power, max fog, patchiness, -
  uBlockColor: { value: new THREE.Color(1.0, 0.42, 0.13) },
  uBlockGain: { value: 1.0 },
  uSkyOcc: { value: new THREE.Vector2(0.22, 1.0) },                 // ambient at zero sky light, at full
};

const FOG_PARS = /* glsl */`
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec3 uSunDir;
uniform vec4 uFogParams;
uniform vec4 uFogMisc;
varying vec3 vWPos;
float dhHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dhNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dhHash(i), dhHash(i + vec2(1.0, 0.0)), f.x), mix(dhHash(i + vec2(0.0, 1.0)), dhHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float dhFogFactor(vec3 wpos, out vec3 dir) {
  vec3 d = wpos - cameraPosition;
  float L = length(d);
  dir = d / max(L, 1e-4);
  float a = uFogParams.w;
  float hc = exp(min(-(cameraPosition.y - uFogParams.z) * a, 4.0));
  float hf = exp(min(-(wpos.y - uFogParams.z) * a, 4.0));
  float dy = (wpos.y - cameraPosition.y) * a;
  float avg = abs(dy) > 1e-3 ? (hc - hf) / dy : hc;
  // slow patchiness so the low fog reads as drifting banks rather than a flat gradient
  float fogPatch = 1.0 + uFogMisc.z * (dhNoise(wpos.xz * 0.045) + 0.5 * dhNoise(wpos.xz * 0.11 + 7.0) - 0.75);
  float tau = L * (uFogParams.x + uFogParams.y * max(avg, 0.0) * fogPatch);
  return min(1.0 - exp(-tau), uFogMisc.y);
}
vec3 dhFogColor(vec3 dir) {
  float s = pow(max(dot(dir, uSunDir), 0.0), uFogMisc.x);
  return mix(uFogColor, uFogSunColor, s);
}
vec3 dhApplyFog(vec3 col, vec3 wpos) {
  vec3 dir;
  float f = dhFogFactor(wpos, dir);
  return mix(col, dhFogColor(dir), f);
}
`;

const WPOS_VERT = /* glsl */`
{
  vec4 dhWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    dhWp = instanceMatrix * dhWp;
  #endif
  vWPos = (modelMatrix * dhWp).xyz;
}
`;

/** Strength of the baked lamp light (`tint`) next to the baked fire light. */
const TINT_GAIN = 0.6;

/** Uniforms shared by the optional shader extras below. */
export const EXTRA = {
  uDetail: { value: null },                                   // grey grain (g) + its normal (r, b), tiling
  uFuzz: { value: new THREE.Color(0.1, 0.12, 0.15) },         // sky colour picked up by rough fur at grazing angles
};

/**
 * Patch a built-in material: height fog always; `voxel` adds the baked light attribute
 * (aLit.x = sky occlusion for ambient, aLit.y = flood-filled fire light).
 *   tint:   with `voxel`, in the playable game only: a second baked light with a colour of its own per vertex
 *           (aTint.rgb = colour, aTint.a = level), for the lamps and fires the player sets down. The shots
 *           never ask for it, so their shaders are the ones they always had.
 *   soft:   roll the brightest light off (a shoulder above 0.55) so the surface never burns out. For the pale
 *           blocks of the building kit: the lights of this world are set for dark rock, and a white wall in the
 *           low sun or under the lantern would otherwise be a flat white patch with a bloom halo.
 *   detail: multiply a small tiling grain texture in at 4x / 13x the tile frequency (and bend the
 *           normal with it) so block faces keep texture when the camera is right in front of them
 *   moss:   { map, p: [threshold, softness, crackBias] } blend a moss texture in by a world-space
 *           noise mask, pushed into the low parts of the tile (height is in the tile's alpha)
 *   fuzz:   strength of a soft sky-coloured rim (rough fur)
 */
export function patch(mat, opts = {}) {
  const { voxel = false, additive = false, detail = false, moss = null, fuzz = 0 } = opts;
  const tint = voxel && !!opts.tint, soft = !!opts.soft;
  mat.onBeforeCompile = (shader) => {
    for (const k in U) shader.uniforms[k] = U[k];
    if (detail) shader.uniforms.uDetail = EXTRA.uDetail;
    if (moss) { shader.uniforms.uMossMap = { value: moss.map }; shader.uniforms.uMossP = { value: new THREE.Vector3(moss.p[0], moss.p[1], moss.p[2]) }; }
    if (fuzz) { shader.uniforms.uFuzz = EXTRA.uFuzz; shader.uniforms.uFuzzK = { value: fuzz }; }
    if (mat.isSpriteMaterial) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;');
    } else {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\n' + (voxel ? 'attribute vec2 aLit;\nvarying vec2 vLit;\n' : '') + (tint ? 'attribute vec4 aTint;\nvarying vec4 vTint;\n' : ''))
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + WPOS_VERT + (voxel ? 'vLit = aLit;\n' : '') + (tint ? 'vTint = aTint;\n' : ''));
    }
    let fs = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + FOG_PARS
      + (voxel ? 'varying vec2 vLit;\nuniform vec3 uBlockColor;\nuniform float uBlockGain;\nuniform vec2 uSkyOcc;\n' : '')
      + (tint ? 'varying vec4 vTint;\n' : '')
      + (detail ? 'uniform sampler2D uDetail;\n' : '')
      + (moss ? 'uniform sampler2D uMossMap;\nuniform vec3 uMossP;\n' : '')
      + (fuzz ? 'uniform vec3 uFuzz;\nuniform float uFuzzK;\n' : ''));
    if (additive) {
      fs = fs.replace('#include <fog_fragment>', '{ vec3 dhDir; gl_FragColor.rgb *= 1.0 - dhFogFactor(vWPos, dhDir); }');
    } else {
      fs = fs.replace('#include <fog_fragment>', 'gl_FragColor.rgb = dhApplyFog(gl_FragColor.rgb, vWPos);');
    }
    if (voxel) {
      fs = fs.replace('#include <lights_fragment_maps>', 'irradiance *= mix(uSkyOcc.x, uSkyOcc.y, vLit.x);\n#include <lights_fragment_maps>')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uBlockColor * (uBlockGain * vLit.y * vLit.y * (0.35 + 0.65 * vLit.y));'
          // lamp light: the same falloff as the fire light. It mostly falls on the pale blocks built around a lamp, in a
          // picture exposed for dark rock, so it is eased off as it gets strong (a soft knee) instead of burning them out
          + (tint ? '\n{ vec3 dhLamp = diffuseColor.rgb * vTint.rgb * (' + TINT_GAIN.toFixed(2) + ' * uBlockGain * vTint.a * vTint.a * (0.35 + 0.65 * vTint.a));'
            + ' totalEmissiveRadiance += dhLamp / (1.0 + 0.8 * max(dhLamp.r, max(dhLamp.g, dhLamp.b))); }' : ''));
    }
    if (detail || moss) {
      let add = 'vec2 dhNrmAdd = vec2(0.0);\nfloat dhNrmKeep = 1.0;\n';
      if (moss) add += /* glsl */`
        {
          float dhH = diffuseColor.a;
          diffuseColor.a = 1.0;
          vec2 mp = vWPos.xz;
          float mc = dhNoise(mp * 0.19 + 3.1) * 0.5 + dhNoise(mp * 0.57 + 9.4) * 0.3 + dhNoise(mp * 1.9 + 1.3) * 0.2;
          float mk = smoothstep(uMossP.x - uMossP.y, uMossP.x + uMossP.y, mc + (0.55 - dhH) * uMossP.z);
          vec3 mossC = texture2D(uMossMap, vMapUv).rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, mossC, mk);
          dhNrmKeep = 1.0 - 0.75 * mk;
        }
      `;
      if (detail) add += /* glsl */`
        {
          vec3 d1 = texture2D(uDetail, vMapUv * 4.0).rgb;
          vec3 d2 = texture2D(uDetail, vMapUv * 13.0 + 0.37).rgb;
          diffuseColor.rgb *= 0.56 + 0.56 * d1.g + 0.32 * d2.g;
          dhNrmAdd = (d1.rb - 0.5) * 0.9 + (d2.rb - 0.5) * 0.6;
        }
      `;
      fs = fs.replace('#include <map_fragment>', '#include <map_fragment>\n' + add)
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale;\n\tmapN.xy = mapN.xy * dhNrmKeep + dhNrmAdd;'));
    }
    if (soft) {
      fs = fs.replace('#include <opaque_fragment>', '{ float dhM = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b)); if (dhM > 0.55) outgoingLight *= (0.55 + (dhM - 0.55) / (1.0 + (dhM - 0.55))) / dhM; }\n#include <opaque_fragment>');
    }
    if (fuzz) {
      fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uFuzz * (uFuzzK * pow(abs(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0)), 2.0));');
    }
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'dh|' + (voxel ? 1 : 0) + '|' + (additive ? 1 : 0) + '|' + (mat.isSpriteMaterial ? 1 : 0) + '|' + (detail ? 1 : 0) + '|' + (moss ? 1 : 0) + '|' + (fuzz ? 1 : 0) + (tint ? '|t' : '') + (soft ? '|s' : '');
  return mat;
}

// ---------------------------------------------------------------------------------------------
// Sky dome
// ---------------------------------------------------------------------------------------------
export const SKY = {
  uZenith: { value: new THREE.Color(0x3b4654) },
  uHorizon: { value: new THREE.Color(0x8f9aa6) },
  uGlowColor: { value: new THREE.Color(0xd9d2c2) },
  uGlowAmt: { value: 1.0 },
  uCloudDark: { value: new THREE.Color(0x2e3640) },
  uCloudLight: { value: new THREE.Color(0x8d98a6) },
  uCloud: { value: new THREE.Vector4(0.5, 1.0, 0.0, 0.0) },     // cover, opacity, offset x, offset z
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  uMoon: { value: new THREE.Vector4(0, 0.03, 0, 0) },           // intensity, angular radius, halo, stars
  uMoonColor: { value: new THREE.Color(0xdfe8f2) },
  uHaze: { value: new THREE.Vector2(9.0, 0.0) },                // horizon haze falloff, terrain band (for reflections)
};

const SKY_FRAG = /* glsl */`
uniform vec3 uZenith, uHorizon, uGlowColor, uCloudDark, uCloudLight, uMoonColor;
uniform float uGlowAmt;
uniform vec4 uCloud, uMoon;
uniform vec3 uMoonDir;
uniform vec2 uHaze;
uniform vec3 uFogColor, uFogSunColor, uSunDir;
uniform vec4 uFogMisc;
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(abs(h), 0.5));
  float sd = max(dot(d, uSunDir), 0.0);
  float flat_sd = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
  // a pale break in the overcast, low on the horizon toward the light
  float band = exp(-pow(abs((d.y - uSunDir.y) * 5.5), 2.0));
  col += uGlowColor * uGlowAmt * (pow(abs(flat_sd), 5.0) * band * 0.9 + pow(abs(sd), 60.0) * 0.8);
  // cloud deck
  vec2 cp = d.xz / (d.y + 0.16) * 1.1 + uCloud.zw;
  float c1 = fbm(cp * 0.8);
  float c2 = fbm(cp * 2.6 + 3.7);
  float cover = smoothstep(uCloud.x - 0.28, uCloud.x + 0.25, c1 * 0.72 + c2 * 0.28);
  float belly = smoothstep(0.35, 0.8, c1 * 0.6 + c2 * 0.4);
  vec3 cc = mix(uCloudLight, uCloudDark, belly);
  // the deck thins toward the horizon and glows on the side of the low sun
  float low = exp(-h * 4.5);
  cc = mix(cc, uHorizon * 1.25, low * 0.75);
  cc += uGlowColor * uGlowAmt * (pow(abs(flat_sd), 2.0) * (0.25 + 0.75 * low) * (1.0 - belly * 0.6) * 0.5 + pow(abs(flat_sd), 3.0) * band * (1.0 - belly) * 0.55);
  // moon behind / through the clouds
  float md = max(dot(d, uMoonDir), 0.0);
  float disc = smoothstep(cos(uMoon.y) - 0.00025, cos(uMoon.y) + 0.00012, md);
  vec3 moon = uMoonColor * uMoon.x * (disc * (0.75 + 0.25 * vn(d.xy * 90.0)));
  vec3 halo = uMoonColor * uMoon.z * (pow(abs(md), 900.0) * 1.2 + pow(abs(md), 120.0) * 0.38 + pow(abs(md), 14.0) * 0.1);
  col += moon + halo * 0.6;
  cc += uMoonColor * uMoon.z * (pow(abs(md), 60.0) * 0.5 + pow(abs(md), 8.0) * 0.12) * (1.0 - belly * 0.7);
  // faint stars in the gaps
  vec2 sp = d.xz / (d.y + 0.4) * 140.0;
  float st = step(0.9965, h21(floor(sp))) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5));
  col += vec3(0.8, 0.88, 1.0) * st * uMoon.w * smoothstep(0.1, 0.4, d.y);
  // the deck thins in front of the moon: a clean disc behind a veil, not a ragged hole
  float veil = 1.0 - 0.8 * smoothstep(0.9985, 0.99975, md) * step(0.001, uMoon.x);
  col = mix(col, cc + moon * 0.12, cover * veil * uCloud.y * smoothstep(0.0, 0.1, d.y + 0.02));
  // horizon haze matches the scene fog so distant ridges melt into the sky
  float hz = exp(-h * uHaze.x);
  vec3 fc = mix(uFogColor, uFogSunColor, pow(abs(sd), uFogMisc.x));
  fc += uGlowColor * uGlowAmt * pow(abs(flat_sd), 6.0) * exp(-h * 14.0) * 0.25;
  col = mix(col, fc, clamp(hz, 0.0, 1.0));
  if (d.y < 0.0) col = fc;
  // dark hills band, only used when baking the reflection map for the lake
  if (uHaze.y > 0.0) {
    float edge = uHaze.y * (0.55 + 0.9 * vn(vec2(atan(d.z, d.x) * 5.0, 1.0)));
    col = mix(col, uFogColor * 0.28, smoothstep(edge + 0.03, edge - 0.02, d.y));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export function makeSky(radius = 1400) {
  const uniforms = { ...SKY, uFogColor: U.uFogColor, uFogSunColor: U.uFogSunColor, uSunDir: U.uSunDir, uFogMisc: U.uFogMisc };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec3 vDir;\nvoid main() { vDir = position; vec4 p = modelViewMatrix * vec4(position, 0.0); gl_Position = projectionMatrix * vec4(p.xyz, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return mesh;
}

/** Bake the current sky into a small PMREM for the lake's reflections. */
export function bakeSkyEnv(renderer, sky) {
  const scene = new THREE.Scene();
  const m = new THREE.Mesh(sky.geometry, sky.material);
  m.frustumCulled = false;
  scene.add(m);
  const prev = SKY.uHaze.value.y;
  SKY.uHaze.value.y = 0.4;
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0, 0.1, 3000);
  SKY.uHaze.value.y = prev;
  pm.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------------------------------------
// Post: bloom + filmic grade
// ---------------------------------------------------------------------------------------------
const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uSat: { value: 0.9 },
    uContrast: { value: 0.25 },
    uShadowTint: { value: new THREE.Color(0.0, 0.012, 0.03) },
    uHighTint: { value: new THREE.Color(1.0, 0.99, 0.97) },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.012 },
  },
  vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
uniform sampler2D tDiffuse;
uniform float uExposure, uSat, uContrast, uVignette, uGrain;
uniform vec3 uShadowTint, uHighTint;
varying vec2 vUv;
vec3 dhRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 dhAces(vec3 color) {
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  color = I * color; color = dhRRT(color); color = O * color;
  return clamp(color, 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = dhAces(texture2D(tDiffuse, vUv).rgb);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  c += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l));
  c *= mix(vec3(1.0), uHighTint, smoothstep(0.4, 1.0, l));
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.32, 0.95, length(q * vec2(1.05, 1.25)));
  c += (hash(vUv * vec2(1931.0, 1087.0)) - 0.5) * uGrain;
  c = clamp(c, 0.0, 1.0);
  // linear -> sRGB
  c = mix(c * 12.92, 1.055 * pow(abs(c), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  gl_FragColor = vec4(c, 1.0);
}
`,
};

export const resizeHooks = [];

export function makePost(stage, { samples = 4 } = {}) {
  const { renderer, scene, camera } = stage;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.6, 1.0);
  composer.addPass(bloom);
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);
  renderer.info.autoReset = false;
  // The scene is static between shots, so a frame is only drawn when something changed
  // (new shot, new size). After drawing we read one pixel back, which blocks until the GPU has
  // really finished: a screenshot taken afterwards never races a slow software rasteriser.
  const state = { dirty: true };
  const px = new Uint8Array(4);
  stage.onResize = (w, h, pr) => { composer.setPixelRatio(pr); composer.setSize(w, h); for (const fn of resizeHooks) fn(w * pr, h * pr); state.dirty = true; };
  stage.render = () => {
    if (!state.dirty && !stage.live) return;
    state.dirty = false;
    renderer.info.reset();
    composer.render();
    if (stage.live) return;                                   // the running game draws every frame and never waits for the GPU
    const gl = renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  stage.invalidate = () => { state.dirty = true; };
  stage.resize();
  return { composer, bloom, grade: grade.material.uniforms };
}

// ---------------------------------------------------------------------------------------------
// Lake: one flat mirror plane (planar reflection at 1 / div of the screen, half by default) with ripple distortion
// ---------------------------------------------------------------------------------------------
export const WATER = {
  uTime: { value: 0 },
  uWater: { value: new THREE.Vector4(0.5, 0.05, 0.42, 1.0) },   // ripple, distortion, base reflectivity, reflection gain
};

export function makeWater(x0, z0, x1, z1, y, normalTex, renderer, { div = 2 } = {}) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const shader = {
    name: 'dhWater',
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
    vertexShader: /* glsl */`
uniform mat4 textureMatrix;
varying vec4 vUvP;
varying vec3 vWPos;
void main() {
  vUvP = textureMatrix * vec4(position, 1.0);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: /* glsl */`
uniform vec3 color;
uniform sampler2D tDiffuse;
uniform sampler2D tNormal;
uniform float uTime;
uniform vec4 uWater;
varying vec4 vUvP;
` + FOG_PARS + /* glsl */`
void main() {
  vec3 V = cameraPosition - vWPos;
  float dist = length(V);
  V /= dist;
  vec2 p = vWPos.xz;
  vec2 n = (texture2D(tNormal, p * 0.085 + vec2(uTime * 0.012, uTime * 0.007)).xy - 0.5)
         + (texture2D(tNormal, p * 0.029 - vec2(uTime * 0.006, -uTime * 0.004)).xy - 0.5);
  n *= uWater.x;
  vec3 N = normalize(vec3(n.x, 1.0, n.y));
  float fres = pow(abs(1.0 - clamp(dot(N, V), 0.0, 1.0)), 4.0);
  vec4 uvp = vUvP;
  uvp.xy += n * uWater.y * uvp.w / (1.0 + dist * 0.02);
  vec3 refl = texture2DProj(tDiffuse, uvp).rgb * uWater.w;
  float k = clamp(uWater.z + (1.0 - uWater.z) * fres, 0.0, 1.0);
  vec3 col = mix(dhApplyFog(color, vWPos), refl, k);
  gl_FragColor = vec4(col, 1.0);
}`,
  };
  const water = new Reflector(geo, { color: 0x05090c, textureWidth: Math.round(size.x / div), textureHeight: Math.round(size.y / div), clipBias: 0.02, shader, multisample: 0 });
  const u = water.material.uniforms;
  for (const k in U) u[k] = U[k];
  u.tNormal = { value: normalTex };
  u.uTime = WATER.uTime; u.uWater = WATER.uWater;
  water.rotation.x = -Math.PI / 2;
  water.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  water.name = 'lake';
  water.userData.setSize = (w, h) => water.getRenderTarget().setSize(Math.max(2, Math.round(w / div)), Math.max(2, Math.round(h / div)));
  return water;
}
