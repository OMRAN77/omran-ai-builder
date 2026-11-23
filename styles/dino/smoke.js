// The smoke over the volcanoes of the dinosaur world: a slow column of soft puffs rising from each crater near the
// player and leaning with the wind, and a red glow over the crater that shows at night. Billboards with a puff
// painted once on a canvas (no pictures). They fade with distance, so none floats alone beyond the fog.
import * as THREE from 'three';

const PUFFS = 16, PLUMES = 2;

function puffTexture() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  // a few overlapping soft blobs: a lumpy cloud rather than a perfect disc
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 9; i++) {
    const cx = S / 2 + (rnd() - 0.5) * S * 0.36, cy = S / 2 + (rnd() - 0.5) * S * 0.36, r = S * (0.22 + rnd() * 0.16);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glowTexture() {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,160,60,1)'); g.addColorStop(0.4, 'rgba(255,90,20,0.45)'); g.addColorStop(1, 'rgba(255,60,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSmoke() {
  const group = new THREE.Group();
  group.name = 'smoke';
  const puff = puffTexture(), glowTex = glowTexture();
  const plumes = [];
  for (let p = 0; p < PLUMES; p++) {
    const sprites = [];
    for (let i = 0; i < PUFFS; i++) {
      const m = new THREE.SpriteMaterial({ map: puff, color: 0x6e6862, transparent: true, depthWrite: false, fog: false, opacity: 0 });
      const s = new THREE.Sprite(m);
      s.renderOrder = 2; s.visible = false;
      group.add(s); sprites.push(s);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.renderOrder = 3; glow.visible = false; group.add(glow);
    plumes.push({ sprites, glow, v: null });
  }
  const _w = new THREE.Vector2(0.8, 0.35).normalize();
  return {
    group,
    /**
     * volcanoes: [{ x, z, top, lava }] nearest first; t: seconds; cam: the camera position; fogFar: how far one
     * sees now; night: 0..1 (the glow); dark: 0..1 (the smoke goes darker at night).
     */
    update(volcanoes, t, cam, fogFar, night = 0, dark = 0) {
      plumes.forEach((pl, pi) => {
        const v = volcanoes[pi] || null;
        const dist = v ? Math.hypot(v.x - cam.x, v.z - cam.z) : 1e9;
        const fade = v ? 1 - Math.min(1, Math.max(0, (dist - fogFar * 0.55) / (fogFar * 0.4))) : 0;
        pl.glow.visible = fade > 0 && night > 0.05;
        for (let i = 0; i < PUFFS; i++) {
          const s = pl.sprites[i];
          s.visible = fade > 0;
          if (!s.visible) continue;
          const ph = ((t * 0.018 + i / PUFFS + pi * 0.37) % 1 + 1) % 1, wob = Math.sin(i * 12.9898 + pi) * 0.5;
          const rise = ph * 150, lean = ph * ph * 70;
          s.position.set(v.x + _w.x * lean + wob * 6, v.top + 4 + rise, v.z + _w.y * lean + wob * 6);
          const sc = 14 + ph * 70;
          s.scale.set(sc, sc, 1);
          s.material.opacity = fade * 0.62 * Math.min(1, ph * 8) * Math.pow(1 - ph, 1.3);
          s.material.color.setRGB(0.43 - dark * 0.3, 0.41 - dark * 0.3, 0.39 - dark * 0.28);
          s.material.rotation = i * 1.7 + t * 0.02;
        }
        if (pl.glow.visible) { pl.glow.position.set(v.x, v.top + 6, v.z); pl.glow.scale.set(70, 40, 1); pl.glow.material.opacity = fade * night * (0.75 + Math.sin(t * 1.3 + pi) * 0.08); }
      });
    },
  };
}
