// Renderer / camera setup and the screenshot contract used by tools/shot.cjs.
//
//   const stage = createStage({ fov: 60, far: 500, exposure: 1 });
//   defineShot('hero', () => { stage.camera.position.set(...); stage.camera.lookAt(...); });
//   installShotApi(stage);     // exposes window.__shot(name) and window.__info()
//   markReady();               // tools/shot.cjs waits for this
//
// A shot function may be async and may change anything (camera, lights, time of day,
// which HUD is visible). installShotApi re-renders a few frames after it returns.

import * as THREE from 'three';

export function createStage(opts = {}) {
  let canvas = opts.canvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'stage';
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;';
    document.body.prepend(canvas);
  }
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: opts.antialias !== false,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = opts.toneMapping ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1;
  renderer.shadowMap.enabled = opts.shadows !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 60, 1, opts.near ?? 0.1, opts.far ?? 600);

  const stage = { renderer, scene, camera, canvas, render: null, resize: null };
  stage.resize = function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(stage.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 3));   // stage.pixelRatio: set by the game for dynamic resolution
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (typeof stage.onResize === 'function') stage.onResize(w, h, renderer.getPixelRatio());
  };
  // Replace stage.render if you render through an EffectComposer.
  stage.render = function render() { renderer.render(scene, camera); };
  window.addEventListener('resize', stage.resize);
  stage.resize();
  return stage;
}

const shots = new Map();

/** Register a named camera/scene preset. */
export function defineShot(name, apply) {
  shots.set(name, apply);
  window.__shots = [...shots.keys()];
}

export function installShotApi(stage) {
  window.__shots = [...shots.keys()];
  window.__shot = async (name) => {
    const fn = shots.get(name);
    if (!fn) throw new Error('unknown shot "' + name + '" (have: ' + [...shots.keys()].join(', ') + ')');
    await fn();
    stage.resize();
    for (let i = 0; i < 3; i++) {
      stage.render();
      await new Promise((r) => requestAnimationFrame(r));
    }
    document.documentElement.dataset.shot = name;
    return true;
  };
  window.__info = () => {
    const i = stage.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  };
}

export function markReady() {
  window.__READY = true;
}

/**
 * Procedural texture from a 2D canvas painter: painter(ctx, size).
 * pixelated: true -> crisp texels (NearestFilter); false -> smooth with mipmaps.
 */
export function canvasTexture(size, painter, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  painter(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = opts.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (opts.pixelated) {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
  } else {
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  tex.generateMipmaps = true;
  tex.anisotropy = opts.anisotropy ?? 8;
  tex.needsUpdate = true;
  return tex;
}
