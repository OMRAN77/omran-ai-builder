// Sky dome for "kawkab": gradient sky, stars, high streak clouds, a ringed gas giant and a
// small moon, all in one fragment shader on a single inverted sphere (one draw call).
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
uniform vec3 uZenith, uMid, uHorizon, uGlow, uBelow;
uniform vec3 uSunDir;        // direction to the (set) star, drives the horizon glow
uniform vec3 uPlanetLight;   // direction the planet, rings and moon are lit from
uniform vec3 uPlanetDir;     // unit direction to the planet centre
uniform float uPlanetR;      // angular radius (radians)
uniform vec3 uRingN;         // ring plane normal
uniform vec3 uMoonDir; uniform float uMoonR;
uniform float uStars, uGlowAmt, uPlanetGain, uCloud;
uniform vec3 uCloudCol;

float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }

float stars(vec3 d, float scale, float thr) {
  vec3 p = d * scale; vec3 ip = floor(p); vec3 fp = fract(p) - 0.5;
  float r = hash(ip);
  float s = step(thr, r) * smoothstep(0.32, 0.0, length(fp));
  return s * (0.5 + 0.5 * fract(r * 91.7));
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.26, h));
  col = mix(col, uZenith, smoothstep(0.16, 0.72, h));
  col = mix(col, uBelow, smoothstep(0.0, -0.25, h));
  // glow where the star went down
  vec3 sd = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
  float az = max(dot(normalize(vec3(d.x, 0.0001, d.z)), sd), 0.0);
  col += uGlow * (pow(az, 5.0) * exp(-abs(h) * 6.5) + 0.35 * pow(az, 2.0) * exp(-abs(h) * 12.0)) * uGlowAmt;

  // stars (fade towards the horizon haze)
  float sv = smoothstep(0.08, 0.5, h) * uStars;
  col += vec3(0.85, 0.92, 1.0) * (stars(d, 150.0, 0.9972) * 1.6 + stars(d, 310.0, 0.9965) * 0.7) * sv;

  // ---- moon
  float md = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
  if (md < uMoonR) {
    vec3 mx = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))), my = cross(mx, uMoonDir);
    vec2 q = vec2(dot(d, mx), dot(d, my)) / sin(uMoonR);
    vec3 n = normalize(q.x * mx + q.y * my - sqrt(max(0.0, 1.0 - dot(q, q))) * uMoonDir);
    float lit = smoothstep(-0.05, 0.35, dot(n, uPlanetLight));
    float tex = 0.75 + 0.25 * vnoise(q * 5.0 + 3.0);
    float aa = smoothstep(uMoonR, uMoonR * 0.94, md);
    col = mix(col, vec3(0.95, 0.86, 0.92) * tex * uPlanetGain, lit * aa * 0.92);
  }

  // ---- ringed planet: unit-distance sphere of radius R
  float R = sin(uPlanetR);
  vec3 C = uPlanetDir;
  float b = dot(d, C);
  float disc = b * b - (1.0 - R * R);
  float tS = 1e9;
  vec3 pc = vec3(0.0); float pa = 0.0;
  if (disc > 0.0 && b > 0.0) {
    tS = b - sqrt(disc);
    vec3 n = normalize(d * tS - C);
    float lit = smoothstep(-0.12, 0.55, dot(n, uPlanetLight));
    // latitude bands around the ring axis
    float lat = dot(n, uRingN);
    float bands = 0.5 + 0.5 * sin(lat * 15.0 + 2.5 * fbm(vec2(lat * 5.0, dot(n, cross(uRingN, vec3(1.0, 0.0, 0.0))) * 1.5)));
    vec3 pcol = mix(vec3(0.98, 0.80, 0.72), vec3(0.66, 0.70, 0.96), bands);
    pcol = mix(pcol, vec3(0.52, 0.90, 0.92), smoothstep(0.45, 1.0, abs(lat)) * 0.8);
    float limb = pow(1.0 - max(dot(n, -d), 0.0), 2.5);
    float edge = smoothstep(0.0, 0.0009, disc);
    pc = pcol * (lit * 1.05 + 0.03) + vec3(0.55, 0.75, 1.0) * limb * 0.22 * lit;
    pa = edge * (lit * 0.9 + 0.1 + limb * 0.14);
  }
  // ring plane
  float dn = dot(d, uRingN);
  float tR = dot(C, uRingN) / (abs(dn) < 1e-5 ? 1e-5 : dn);
  vec3 rc = vec3(0.0); float ra = 0.0;
  if (tR > 0.0) {
    vec3 s = d * tR - C;
    float rr = length(s) / R;
    float inner = 1.32, outer = 2.38;
    float m = smoothstep(inner, inner + 0.04, rr) * smoothstep(outer, outer - 0.05, rr);
    if (m > 0.0) {
      float k = (rr - inner) / (outer - inner);
      float dens = 0.55 + 0.45 * sin(k * 38.0) * sin(k * 11.0 + 1.0);
      dens *= 1.0 - 0.85 * smoothstep(0.035, 0.0, abs(k - 0.42));      // a clean gap
      dens *= 1.0 - 0.6 * smoothstep(0.02, 0.0, abs(k - 0.78));
      dens *= 0.55 + 0.45 * smoothstep(0.0, 0.25, k);
      // planet shadow falling on the ring
      float along = dot(s, uPlanetLight);
      float perp = length(s - along * uPlanetLight);
      float shadow = (along < 0.0) ? smoothstep(R * 0.96, R * 1.04, perp) : 1.0;
      vec3 rcol = mix(vec3(0.98, 0.78, 0.74), vec3(0.72, 0.80, 0.98), k);
      rc = rcol * (0.25 + 0.75 * shadow);
      ra = m * dens * (0.18 + 0.72 * shadow);
    }
  }
  float hz = smoothstep(-0.02, 0.10, h);                 // sink into the horizon haze
  if (tR < tS) {            // ring in front of (or beside) the planet
    col = mix(col, pc * uPlanetGain, pa * hz);
    col = mix(col, rc * uPlanetGain, ra * hz);
  } else {
    col = mix(col, rc * uPlanetGain, ra * hz);
    col = mix(col, pc * uPlanetGain, pa * hz);
  }

  // long streak clouds low over the horizon, lit from below
  float ang = atan(d.z, d.x);
  float cn = fbm(vec2(ang * 5.0, h * 26.0 + 1.7)) * 0.65 + fbm(vec2(ang * 13.0 + 4.0, h * 60.0)) * 0.35;
  float cm = smoothstep(0.50, 0.74, cn) * smoothstep(0.015, 0.07, h) * smoothstep(0.42, 0.14, h);
  col = mix(col, uCloudCol + uGlow * pow(az, 3.0) * 0.5 * uGlowAmt, cm * uCloud);

  gl_FragColor = vec4(col, 1.0);
}`;

export function dirFrom(azDeg, elDeg) {
  const a = THREE.MathUtils.degToRad(azDeg), e = THREE.MathUtils.degToRad(elDeg);
  // azimuth 0 = +z, 90 = +x
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}

export function createSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() }, uBelow: { value: new THREE.Color() }, uCloudCol: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() }, uPlanetLight: { value: new THREE.Vector3(0, 1, 0) }, uPlanetDir: { value: new THREE.Vector3() }, uPlanetR: { value: 0.16 },
    uRingN: { value: new THREE.Vector3(0.2, 0.93, 0.3).normalize() },
    uMoonDir: { value: new THREE.Vector3() }, uMoonR: { value: 0.02 },
    uStars: { value: 0.5 }, uGlowAmt: { value: 1 }, uPlanetGain: { value: 1 }, uCloud: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return { mesh, uniforms };
}

/** Bake the sky into a small prefiltered environment map (ambient + reflections). */
export function bakeEnvironment(renderer, sky) {
  const s = new THREE.Scene();
  const parent = sky.mesh.parent;
  s.add(sky.mesh);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.03, 0.1, 100);
  pm.dispose();
  if (parent) parent.add(sky.mesh);
  return rt.texture;
}
