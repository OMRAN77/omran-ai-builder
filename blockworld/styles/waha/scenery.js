// Materials for the voxel tiles, the water (channel blocks + the pool surface with a planar
// reflection), and the far-terrain backdrop (a cheap smooth height-field LOD that continues the same
// terrain function beyond the voxel world).
import * as THREE from 'three';
import { ATM, ATMO_PARS, patchMaterial } from './atmo.js';
import { PAL } from './tiles.js';
import { X0, X1, Z0, Z1, POOL, POOL_LEVEL, terrainAt, strataRaw, strataDip, B } from './world.js';

export const WATER_U = {
  uDeep: { value: new THREE.Color(0.02, 0.06, 0.06) },
  uShallow: { value: new THREE.Color(0.10, 0.22, 0.20) },
  uReflDark: { value: new THREE.Color(0.05, 0.04, 0.03) },
  uGlint: { value: 1.0 },
  uTime: { value: 0.0 },
  uRefl: { value: null },
  uReflOn: { value: 0.0 },
  uRes: { value: new THREE.Vector2(1, 1) },
};

function waterMaterial(pool) {
  return new THREE.ShaderMaterial({
    uniforms: { ...ATM, ...WATER_U },
    defines: pool ? { POOL: 1 } : {},
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vWPos; varying vec3 vN;
      #ifdef POOL
      attribute float aDepth; varying float vDepth;
      #endif
      void main() {
        vN = normal;
        #ifdef POOL
        vDepth = aDepth;
        #endif
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vWPos; varying vec3 vN;
      uniform sampler2D uNoise; uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uReflDark; uniform vec3 uSunColor; uniform float uGlint;
      uniform sampler2D uRefl; uniform float uReflOn; uniform vec2 uRes;
      #ifdef POOL
      varying float vDepth;
      #endif
      ${ATMO_PARS}
      void main() {
        vec3 V = normalize(cameraPosition - vWPos);
        vec3 n = normalize(vN);
        vec2 rip = vec2(0.0);
        if (n.y > 0.5) {
          vec2 p = vWPos.xz;
          vec3 a = texture2D(uNoise, p * 0.071 + uTime * 0.01).rgb;
          vec3 b = texture2D(uNoise, p * 0.193 - uTime * 0.013).rgb;
          rip = vec2(a.r - 0.5 + (b.g - 0.5) * 0.7, a.g - 0.5 + (b.b - 0.5) * 0.7);
          n = normalize(vec3(rip.x * 0.13, 1.0, rip.y * 0.13));
        }
        float fres = 0.04 + 0.96 * pow(abs(1.0 - max(dot(n, V), 0.0)), 3.4);
        vec3 R = reflect(-V, n); R.y = abs(R.y);
        vec3 sky = wahaSky(R);
        float occ = smoothstep(0.12, 0.55, R.y);
        vec3 refl = mix(uReflDark, sky, occ);
        vec3 body = uDeep;
        float alpha = mix(0.80, 0.98, fres);
        #ifdef POOL
          if (uReflOn > 0.5) {
            vec2 suv = gl_FragCoord.xy / uRes;
            suv = vec2(suv.x, 1.0 - suv.y) + rip * vec2(0.012, 0.045);
            refl = texture2D(uRefl, clamp(suv, 0.002, 0.998)).rgb;
          }
          float d = max(vDepth, 0.0);
          body = mix(uShallow, uDeep, 1.0 - exp(-d * 1.6));
          float shore = smoothstep(0.0, 0.10, d);
          alpha = mix(0.0, mix(0.55 + 0.4 * (1.0 - exp(-d * 2.2)), 0.98, fres), shore);
          fres *= 0.35 + 0.65 * smoothstep(0.0, 0.35, d);
        #endif
        vec3 col = mix(body, refl, fres);
        float sp = pow(max(dot(R, uSunDir), 0.0), 520.0);
        float band = pow(max(dot(normalize(R.xz + 1e-4), normalize(uSunDir.xz + 1e-4)), 0.0), 60.0) * smoothstep(0.55, 0.0, abs(R.y - uSunDir.y));
        col += uSunColor * (sp * 14.0 + band * 0.55 * (0.4 + 0.6 * step(0.52, rip.x + 0.5))) * uGlint;
        col = wahaAtmo(col, vWPos);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

export function makeMaterialFor(T) {
  const cache = new Map();
  return (tile, kind) => {
    const k = tile + '|' + kind;
    if (cache.has(k)) return cache.get(k);
    let m;
    if (tile === 'water') m = waterMaterial(false);
    else if (kind === 'cross') {
      m = patchMaterial(new THREE.MeshLambertMaterial({ map: T[tile], alphaTest: 0.5, alphaToCoverage: true }), {});
    } else {
      const loose = tile === 'sand' || tile === 'hardpan' || tile === 'gravel' || tile === 'damp';
      m = new THREE.MeshLambertMaterial({ map: T[tile] });
      if (tile === 'slitLit') { m.emissiveMap = T.slitGlow; m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = 2.0; m.userData.lit = true; }
      patchMaterial(m, {
        voxel: true,
        sand: loose ? (tile === 'sand' ? 1.0 : tile === 'hardpan' ? 0.45 : tile === 'gravel' ? 0.12 : 0.0) : undefined,
        wet: tile === 'damp',
        firm: tile === 'sand' || tile === 'hardpan',
        rock: tile.startsWith('rock') || tile === 'rubble',
        variation: loose ? 0.012 : (tile.startsWith('rock') ? 0.04 : tile === 'sandSide' || tile.startsWith('packed') ? 0.025 : 0.055),
      });
    }
    cache.set(k, m);
    return m;
  };
}

/** The oasis pool: one flat sheet at water level; the sloped bed cuts the shoreline. */
export function buildPool(W) {
  const x0 = Math.floor(POOL.x - POOL.rx * 1.25), x1 = Math.ceil(POOL.x + POOL.rx * 1.25);
  const z0 = Math.floor(POOL.z - POOL.rz * 1.3), z1 = Math.ceil(POOL.z + POOL.rz * 1.3);
  const nx = x1 - x0, nz = z1 - z0;
  const pos = [], nor = [], dep = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i, z = z0 + j;
    pos.push(x, POOL_LEVEL, z); nor.push(0, 1, 0);
    dep.push(POOL_LEVEL - W.surfaceY(x + 1e-3, z + 1e-3));
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = i + j * (nx + 1), b = a + 1, c = a + nx + 1, d = c + 1;
    if (dep[a] < -0.3 && dep[b] < -0.3 && dep[c] < -0.3 && dep[d] < -0.3) continue;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, waterMaterial(true));
  mesh.name = 'pool';
  mesh.renderOrder = 2;
  return mesh;
}

/** Planar reflection for the pool: a small mirrored view of the oasis set (layer 1), drawn before the frame. */
export function createReflection(renderer, scene, camera, lights) {
  const rt = new THREE.WebGLRenderTarget(512, 288, { type: THREE.HalfFloatType });
  rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter; rt.texture.generateMipmaps = false;
  const cam = new THREE.PerspectiveCamera();
  cam.layers.set(1);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(POOL_LEVEL + 0.05));
  const pos = new THREE.Vector3(), dir = new THREE.Vector3();
  WATER_U.uRefl.value = rt.texture;
  let enabled = false;
  return {
    set enabled(v) { enabled = v; WATER_U.uReflOn.value = v ? 1 : 0; },
    get enabled() { return enabled; },
    render() {
      if (!enabled) return;
      camera.getWorldPosition(pos); camera.getWorldDirection(dir);
      cam.fov = camera.fov; cam.aspect = camera.aspect; cam.near = camera.near; cam.far = camera.far;
      cam.updateProjectionMatrix();
      cam.position.set(pos.x, 2 * POOL_LEVEL - pos.y, pos.z);
      cam.up.set(0, 1, 0);
      cam.lookAt(pos.x + dir.x * 50, 2 * POOL_LEVEL - (pos.y + dir.y * 50), pos.z + dir.z * 50);
      cam.updateMatrixWorld(true);
      const shadowFlags = lights.map((l) => l.castShadow);
      lights.forEach((l) => { l.castShadow = false; });
      const prev = renderer.getRenderTarget();
      renderer.clippingPlanes = [plane];
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
      renderer.clippingPlanes = [];
      lights.forEach((l, i) => { l.castShadow = shadowFlags[i]; });
    },
  };
}

/** Far terrain: two nested grids (4 m and 16 m cells) with a hole where the voxel world sits. */
export function buildBackdrop() {
  const positions = [], normals = [], rocks = [], dips = [], indices = [];
  const lin = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  const addGrid = (minX, maxX, minZ, maxZ, step, hole, drop) => {
    const nx = Math.round((maxX - minX) / step), nz = Math.round((maxZ - minZ) / step);
    const base = positions.length / 3;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = minX + i * step, z = minZ + j * step;
      const t = terrainAt(x, z);
      const e = step * 0.5;
      const hx = terrainAt(x + e, z).h - terrainAt(x - e, z).h, hz = terrainAt(x, z + e).h - terrainAt(x, z - e).h;
      const nxx = -hx / (2 * e), nzz = -hz / (2 * e), l = Math.hypot(nxx, 1, nzz);
      positions.push(x, t.h + 0.5 - drop, z);
      normals.push(nxx / l, 1 / l, nzz / l);
      rocks.push(t.surf === 'rock' ? 1 : 0);
      dips.push(strataDip(x, z));
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const xa = minX + i * step, za = minZ + j * step, xb = xa + step, zb = za + step;
      if (xa >= hole[0] && xb <= hole[1] && za >= hole[2] && zb <= hole[3]) continue;
      const a = base + i + j * (nx + 1), b = a + 1, c = a + (nx + 1), d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  };
  addGrid(X0 - 128, X1 + 128, Z0 - 128, Z1 + 128, 4, [X0 + 4, X1 - 4, Z0 + 4, Z1 - 4], 0.7);
  addGrid(-1264, 1456, -1264, 1456, 16, [X0 - 112, X1 + 112, Z0 - 112, Z1 + 112], 2.2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('aRock', new THREE.Float32BufferAttribute(rocks, 1));
  geo.setAttribute('aDip', new THREE.Float32BufferAttribute(dips, 1));
  geo.setIndex(indices);
  // strata lookup (one texel per block of height), the same beds as the voxel cliffs
  const NS = 160;
  const data = new Uint8Array(NS * 4);
  const cols = { [B.ROCK_A]: PAL.rockA, [B.ROCK_B]: PAL.rockB, [B.ROCK_C]: PAL.rockC, [B.ROCK_D]: PAL.rockD };
  for (let y = 0; y < NS; y++) {
    const c = cols[strataRaw(y)] || PAL.rockA;
    data[y * 4] = c[0] * 255; data[y * 4 + 1] = c[1] * 255; data[y * 4 + 2] = c[2] * 255; data[y * 4 + 3] = 255;
  }
  const strata = new THREE.DataTexture(data, 1, NS, THREE.RGBAFormat);
  strata.colorSpace = THREE.SRGBColorSpace; strata.magFilter = THREE.NearestFilter; strata.minFilter = THREE.NearestFilter;
  strata.wrapT = THREE.RepeatWrapping; strata.needsUpdate = true;
  const mat = patchMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff }), {
    backdrop: true,
    uniforms: { uStrata: { value: strata }, uSandCol: { value: lin(PAL.sand).multiplyScalar(0.97) } },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'backdrop';
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}
