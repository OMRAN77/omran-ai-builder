// Sky for "barari": a soft gradient, a round sun with a halo, puffy drifting clouds, and a moon with stars at
// night. One inverted sphere that follows the camera, one draw call.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uBelow, uSunCol, uCloudCol, uCloudShade;
uniform vec3 uSunDir, uMoonDir;
uniform float uSunSize, uCloud, uStars, uTime, uHaze;

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, h));
  col = mix(col, uBelow, smoothstep(0.0, -0.2, h));
  // warm glow around the sun, wider near the horizon
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(max(sd, 0.0), 12.0) * 0.35 + pow(max(sd, 0.0), 3.0) * 0.12 * uHaze);
  // the sun disc and its halo
  float disc = smoothstep(uSunSize, uSunSize * 0.7, acos(clamp(dot(d, uSunDir), -1.0, 1.0)));
  col = mix(col, uSunCol * 1.6 + vec3(0.25), disc * step(-0.05, uSunDir.y));
  // stars and the moon at night
  float night = uStars;
  if (night > 0.0) {
    vec3 sp = d * 220.0; vec3 ip = floor(sp);
    float r = hash3(ip);
    float star = step(0.9975, r) * smoothstep(0.4, 0.0, length(fract(sp) - 0.5)) * smoothstep(0.03, 0.3, h);
    col += vec3(0.85, 0.9, 1.0) * star * night * (0.6 + 0.8 * fract(r * 77.0));
    float md = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
    float moon = smoothstep(0.052, 0.046, md);
    vec3 mx = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))), my = cross(mx, uMoonDir);
    vec2 q = vec2(dot(d, mx), dot(d, my)) * 18.0;
    float crater = 0.82 + 0.18 * vnoise(q * 1.7);
    col = mix(col, vec3(0.92, 0.94, 1.0) * crater, moon * night);
    col += vec3(0.5, 0.6, 0.9) * pow(max(dot(d, uMoonDir), 0.0), 60.0) * 0.25 * night;
  }
  // clouds: a layer seen from below, puffy and slow
  if (h > 0.0 && uCloud > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.1 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(uv * 1.4);
    float c = smoothstep(0.62 - uCloud * 0.32, 0.86 - uCloud * 0.2, n) * smoothstep(0.0, 0.18, h);
    float lit = smoothstep(0.3, 0.9, fbm(uv * 1.4 + uSunDir.xz * 0.08));
    vec3 cc = mix(uCloudShade, uCloudCol, 0.55 + 0.45 * lit) + uSunCol * pow(max(sd, 0.0), 6.0) * 0.25;
    col = mix(col, cc, c * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky() {
  const uniforms = {
    uTop: { value: new THREE.Color('#3d8fe0') }, uHorizon: { value: new THREE.Color('#bfe2f7') }, uBelow: { value: new THREE.Color('#9ec6dc') },
    uSunCol: { value: new THREE.Color('#fff2cc') }, uCloudCol: { value: new THREE.Color('#ffffff') }, uCloudShade: { value: new THREE.Color('#c9d8e8') },
    uSunDir: { value: new THREE.Vector3(0.4, 0.6, -0.5).normalize() }, uMoonDir: { value: new THREE.Vector3(-0.4, 0.5, -0.6).normalize() },
    uSunSize: { value: 0.045 }, uCloud: { value: 0.5 }, uStars: { value: 0 }, uTime: { value: 0 }, uHaze: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, uniforms };
}

/** A unit direction from an azimuth (degrees, 0 = north, 90 = east) and an elevation (degrees). */
export function dirFrom(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}
