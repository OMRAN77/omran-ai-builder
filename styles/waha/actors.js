// The cast. Every model faces +Z, stands on y = 0, and is merged to one mesh per material.
// Forms are lofted skins and bevelled boxes with smooth normals; every surface carries a painted texture.
import * as THREE from 'three';
import { Rig, SURF, surf, glowMat, glowSprite, bend, rimPoint, V3, hex, mul } from './rig.js';
import { saduTexture, glowTexture, paint, base, pv, sstep, mix3 } from './tiles.js';
import { mulberry32 } from '../../shared/noise.js';

// ---- shared materials ----
const MT = {
  linen: () => surf('linen', () => SURF.linen(hex(0xc6b795), 301), { tile: 2.4, double: true }),
  sirwal: () => surf('sirwal', () => SURF.linen(hex(0x8d8266), 311), { tile: 2.4 }),
  bisht: () => surf('bisht', () => SURF.wool(hex(0x2f313b), 321), { tile: 2.2, double: true }),
  trim: () => surf('trim', () => SURF.wool(hex(0x9c7a36), 325), { tile: 6 }),
  agal: () => surf('agal', () => SURF.wool(hex(0x1c1a1c), 327), { tile: 6 }),
  leather: () => surf('leather', () => SURF.leather(hex(0x6b4528), 331), { tile: 4 }),
  leatherDark: () => surf('leatherDark', () => SURF.leather(hex(0x3c2a1d), 333), { tile: 4 }),
  hide: () => surf('hide', () => SURF.leather(hex(0x5a4330), 335), { tile: 3 }),
  skin: () => surf('skin', () => SURF.skin(hex(0x73543f), 341), { tile: 3, rim: 0.5 }),
  shemagh: () => surf('shemagh', SURF.shemagh, { tile: 2.6, double: true }),
  brass: () => surf('brass', () => SURF.steel(hex(0x8a6c36), 351), { tile: 6, rim: 0.6 }),
  steel: () => surf('steel', () => SURF.steel(hex(0x7d7c79), 353), { tile: 5 }),
  wood: () => surf('wood', () => SURF.wood(hex(0x7a5a3a), 355), { tile: 3, rim: 0.6 }),
  dark: () => surf('dark', () => SURF.skin(hex(0x16110e), 357), { tile: 2 }),
  sadu0: () => surf('sadu0', () => { const t = saduTexture(0); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }, { tile: 1.6, double: true }),
  sadu1: () => surf('sadu1', () => { const t = saduTexture(1); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }, { tile: 1.6 }),
  sadu2: () => surf('sadu2', () => { const t = saduTexture(2); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }, { tile: 1.6 }),
  furWhite: () => surf('furWhite', () => SURF.fur(hex(0xded4bf), 401, 0.7), { tile: 3 }),
  furDark: () => surf('furDark', () => SURF.fur(hex(0x3b2c22), 403), { tile: 4 }),
  horn: () => surf('horn', () => paint(64, (u, t) => {
    const c = base(hex(0x4a423a), u, t, { seed: 407, blotch: 0.1, grain: 0.04, grad: 0, edge: 0 });
    return mul(c, 0.78 + 0.34 * (0.5 + 0.5 * Math.sin(t * 6.2832 * 4)));
  }, null, { repeat: true }), { tile: 9 }),
  hoof: () => surf('hoof', () => SURF.skin(hex(0x2b231d), 409), { tile: 3 }),
};

// A mattock built along +Y from the head (origin) to the butt of the haft. The broad adze blade runs out
// along +X and curls back toward the user; a short poll balances it on the other side.
function mattock(r, L, blade = 1) {
  const wood = MT.wood(), steel = MT.steel(), leather = MT.leatherDark();
  r.loft(wood, [{ p: [0, -0.035, 0], rx: 0.021, ry: 0.025 }, { p: [0, 0.10, 0], rx: 0.019, ry: 0.022 }, { p: [0, L * 0.6, 0], rx: 0.0165, ry: 0.019 }, { p: [0, L, 0], rx: 0.019, ry: 0.022 }], { seg: 8 }, 0.12);
  r.loft(leather, [{ p: [0, L - 0.25, 0], rx: 0.0195, ry: 0.0225 }, { p: [0, L - 0.07, 0], rx: 0.021, ry: 0.024 }], { seg: 8, cap0: false, cap1: false });
  r.box(steel, 0.064, 0.058, 0.062, 0, 0, 0, 0, 0, 0, 0, [0.72, 0.72, 0.74], 0.012);
  r.box(steel, 0.05, 0.044, 0.05, -0.052, 0, 0, 0, 0, 0, 0, [0.8, 0.8, 0.82], 0.01);                       // poll
  const b = blade;
  r.loft(steel, [
    { p: [0.028, 0.0, 0], rx: 0.030, ry: 0.019 }, { p: [0.11 * b, 0.012, 0], rx: 0.046, ry: 0.012 },
    { p: [0.19 * b, 0.045, 0], rx: 0.062, ry: 0.007 }, { p: [0.245 * b, 0.085, 0], rx: 0.070, ry: 0.003 },
  ], { seg: 8, n: 4.5, up: [0, 1, 0] }, 0, [0.95, 0.95, 0.97]);
  // the ground edge, bright from use
  r.loft(steel, [{ p: [0.225 * b, 0.068, 0], rx: 0.0695, ry: 0.0052 }, { p: [0.2475 * b, 0.088, 0], rx: 0.0715, ry: 0.003 }], { seg: 8, n: 4.5, up: [0, 1, 0] }, 0, [1.7, 1.7, 1.75]);
}

// ============================================================================================
// The player: a desert ranger, 1.78 m to the crown, seven heads tall.
// ============================================================================================
export function buildRanger() {
  const r = new Rig();
  const linen = MT.linen(), sirwal = MT.sirwal(), bisht = MT.bisht(), trim = MT.trim(), leather = MT.leather(), leatherDark = MT.leatherDark();
  const skin = MT.skin(), wrap = MT.shemagh(), brass = MT.brass(), dark = MT.dark(), hide = MT.hide();

  // ---- legs: weight on his right leg, the left relaxed, foot forward and turned out
  const legs = [
    { hip: [-0.085, 0.93, 0.0], knee: [-0.092, 0.50, 0.018], ankle: [-0.098, 0.10, -0.012], yaw: 0.10 },
    { hip: [0.085, 0.93, 0.0], knee: [0.108, 0.51, 0.075], ankle: [0.135, 0.10, 0.105], yaw: -0.38 },
  ];
  for (const l of legs) {
    r.tube(sirwal, [[...l.hip, 0.088], [...l.knee, 0.064], [l.ankle[0], 0.26, l.ankle[2] + (l.knee[2] - l.ankle[2]) * 0.38, 0.056]], {}, 0.2);
    r.tube(leatherDark, [[l.ankle[0] + (l.knee[0] - l.ankle[0]) * 0.45, 0.30, l.ankle[2] + (l.knee[2] - l.ankle[2]) * 0.45, 0.061], [l.ankle[0], 0.08, l.ankle[2], 0.054]], {});
    r.push(l.ankle[0], 0, l.ankle[2], 0, l.yaw, 0);
    r.tbox(leatherDark, 0.105, 0.085, 0.275, 0.86, 0.78, 0, 0.0425, 0.062, 0, 0, 0, 0.1, 0, -0.02, null, 0.03);
    r.box(leatherDark, 0.108, 0.022, 0.28, 0, 0.011, 0.062, 0, 0, 0, 0, [0.6, 0.6, 0.6], 0.008);       // sole
    r.pop();
  }

  // ---- thobe: fitted through the chest, belted at the waist, falling to the calf with a front vent
  r.loft(linen, [
    { p: [0, 1.06, 0], rx: 0.166, ry: 0.116 }, { p: [0.004, 0.93, 0], rx: 0.190, ry: 0.134 }, { p: [0.008, 0.72, 0.008], rx: 0.202, ry: 0.150 },
    { p: [0.010, 0.62, 0.012], rx: 0.208, ry: 0.156, gap: 0.02 }, { p: [0.012, 0.46, 0.018], rx: 0.218, ry: 0.166, gap: 0.26 }, { p: [0.014, 0.31, 0.022], rx: 0.230, ry: 0.176, gap: 0.50 },
  ], { seg: 16, cap0: false, cap1: false }, 0.22);
  r.loft(linen, [
    { p: [0, 1.03, 0], rx: 0.166, ry: 0.116 }, { p: [0, 1.20, 0.004], rx: 0.178, ry: 0.120 }, { p: [0, 1.34, 0.006], rx: 0.190, ry: 0.127 },
    { p: [0, 1.425, 0], rx: 0.184, ry: 0.112 }, { p: [0, 1.475, -0.004], rx: 0.085, ry: 0.078 },
  ], { seg: 14, cap0: false }, 0.08);

  // ---- arms (two-bone IK). Right hand closes round the top of the mattock haft; left hangs easy.
  const haftTop = V3(-0.335, 1.045, 0.205), headAt = V3(-0.425, 0.04, 0.285);
  const haftDir = haftTop.clone().sub(headAt).normalize();
  const grip = haftTop.clone().addScaledVector(haftDir, -0.055);
  const arms = [
    { s: V3(-0.190, 1.418, 0.0), w: grip.clone().add(V3(0.035, 0.03, -0.062)), pole: [-0.6, -0.2, -1] },
    { s: V3(0.190, 1.418, 0.0), w: V3(0.268, 0.905, 0.075), pole: [0.5, 0.1, -1] },
  ];
  for (const a of arms) {
    const e = bend(a.s, a.w, 0.30, 0.265, a.pole);
    const f = a.w.clone().sub(e).normalize();
    const wb = a.w.clone().addScaledVector(f, -0.10);
    r.tube(linen, [[a.s.x, a.s.y, a.s.z, 0.062], [(a.s.x + e.x) / 2, (a.s.y + e.y) / 2, (a.s.z + e.z) / 2, 0.057], [e.x, e.y, e.z, 0.053], [wb.x, wb.y, wb.z, 0.048]], {}, 0.06);
    r.tube(leather, [[wb.x - f.x * 0.01, wb.y - f.y * 0.01, wb.z - f.z * 0.01, 0.052], [a.w.x, a.w.y, a.w.z, 0.044]], {});
    r.tube(brass, [[wb.x, wb.y, wb.z, 0.0535], [wb.x + f.x * 0.014, wb.y + f.y * 0.014, wb.z + f.z * 0.014, 0.0525]], {});
    // bisht shoulder: a short loose over-sleeve that follows the upper arm
    const u = e.clone().sub(a.s).normalize();
    r.tube(bisht, [[a.s.x - u.x * 0.075, a.s.y - u.y * 0.075 + 0.004, a.s.z - u.z * 0.075, 0.03], [a.s.x - u.x * 0.04, a.s.y - u.y * 0.04 + 0.006, a.s.z - u.z * 0.04, 0.062], [a.s.x + u.x * 0.03, a.s.y + u.y * 0.03 + 0.004, a.s.z + u.z * 0.03, 0.074], [a.s.x + u.x * 0.12, a.s.y + u.y * 0.12, a.s.z + u.z * 0.12, 0.076], [a.s.x + u.x * 0.21, a.s.y + u.y * 0.21, a.s.z + u.z * 0.21, 0.074]], { cap1: false, seg: 10 }, 0.1);
    a.e = e; a.f = f;
  }
  // left hand: relaxed, fingers lightly curled
  {
    const a = arms[1];
    r.aim(a.w, a.f, 0.5);
    r.box(skin, 0.074, 0.085, 0.034, 0, 0.05, 0, 0, 0, 0, 0, null, 0.014);
    r.box(skin, 0.068, 0.07, 0.028, 0, 0.115, 0.012, 0.42, 0, 0, 0, [0.95, 0.95, 0.95], 0.012);
    r.box(skin, 0.022, 0.06, 0.024, 0.043, 0.07, 0.014, 0.25, 0, -0.5, 0, null, 0.009);
    r.pop();
  }
  // right hand: a fist round the haft
  {
    r.aim(grip, haftDir, 0.2);
    r.box(skin, 0.05, 0.088, 0.086, 0.036, 0, -0.012, 0, 0, 0, 0, null, 0.02);                             // back of the hand
    for (let i = 0; i < 4; i++) r.box(skin, 0.07, 0.0195, 0.036, 0.0, -0.033 + i * 0.022, 0.03, 0, 0.25, 0, 0, [0.93, 0.93, 0.93], 0.008);
    r.box(skin, 0.026, 0.03, 0.07, -0.01, 0.048, -0.008, 0, 0.5, 0, 0, null, 0.01);                        // thumb over the top
    r.pop();
  }

  // ---- bisht: a dark wool over-robe worn open, hanging from the shoulders to the knee
  const robe = [
    { p: [0, 1.488, -0.008], rx: 0.112, ry: 0.088, ryB: 0.092, gap: 1.75 }, { p: [0, 1.452, -0.004], rx: 0.208, ry: 0.128, ryB: 0.132, gap: 1.62 },
    { p: [0, 1.33, 0.0], rx: 0.226, ry: 0.146, ryB: 0.152, gap: 1.42 }, { p: [0, 1.06, 0], rx: 0.228, ry: 0.146, ryB: 0.155, gap: 1.46 },
    { p: [0.004, 0.90, 0], rx: 0.245, ry: 0.160, ryB: 0.172, gap: 1.46 }, { p: [0.008, 0.62, 0.004], rx: 0.268, ry: 0.182, ryB: 0.196, gap: 1.50 },
    { p: [0.010, 0.44, 0.008], rx: 0.280, ry: 0.192, ryB: 0.206, gap: 1.56 },
  ];
  r.loft(bisht, robe, { seg: 16 }, 0.2);
  for (const sd of [-1, 1]) {
    r.loft(trim, robe.map((q) => { const e = rimPoint(q, Math.PI / 2 + sd * q.gap / 2); return { p: [e[0] - sd * 0.004, e[1], e[2] + 0.004], rx: 0.011, ry: 0.006 }; }), { seg: 6, n: 4, up: [0, 0, 1] });
  }

  // ---- belt, buckle, khanjar
  r.loft(leather, [{ p: [0, 1.02, 0], rx: 0.174, ry: 0.124 }, { p: [0, 1.075, 0], rx: 0.174, ry: 0.123 }], { seg: 16, cap0: false, cap1: false, n: 2.3 });
  r.box(brass, 0.052, 0.046, 0.014, 0.012, 1.048, 0.124, 0, 0, 0, 0, null, 0.005);
  r.loft(brass, [{ p: [-0.072, 1.075, 0.130], rx: 0.021, ry: 0.012 }, { p: [-0.078, 0.985, 0.138], rx: 0.019, ry: 0.011 }, { p: [-0.062, 0.925, 0.142], rx: 0.014, ry: 0.009 }, { p: [-0.028, 0.895, 0.142], rx: 0.008, ry: 0.006 }], { seg: 6, up: [0, 0, 1] });
  r.box(dark, 0.03, 0.062, 0.02, -0.070, 1.112, 0.128, 0, 0, 0.05, 0, [2.2, 1.7, 1.3], 0.006);
  r.box(brass, 0.046, 0.014, 0.024, -0.069, 1.148, 0.128, 0, 0, 0.05, 0, null, 0.004);

  // ---- cross strap, satchel on the left hip, water skin behind the right, bedroll across the back
  r.loft(leather, [{ p: [-0.125, 1.462, 0.055], rx: 0.022, ry: 0.006 }, { p: [-0.03, 1.31, 0.132], rx: 0.022, ry: 0.006 }, { p: [0.10, 1.12, 0.128], rx: 0.022, ry: 0.006 }, { p: [0.205, 1.0, 0.045], rx: 0.022, ry: 0.006 }], { seg: 6, n: 4, up: [0, 0, 1] });
  r.loft(leather, [{ p: [-0.125, 1.462, -0.06], rx: 0.022, ry: 0.006 }, { p: [-0.03, 1.31, -0.142], rx: 0.022, ry: 0.006 }, { p: [0.10, 1.12, -0.150], rx: 0.022, ry: 0.006 }, { p: [0.205, 1.0, -0.05], rx: 0.022, ry: 0.006 }], { seg: 6, n: 4, up: [0, 0, -1] });
  r.push(0.262, 0.905, -0.005, 0, 0.08, -0.07);
  r.box(leather, 0.095, 0.205, 0.245, 0, 0, 0, 0, 0, 0, 0.25, null, 0.022);
  r.box(leatherDark, 0.10, 0.105, 0.255, 0.004, 0.055, 0, 0, 0, 0, 0, null, 0.02);
  r.box(brass, 0.016, 0.03, 0.03, 0.056, 0.012, 0, 0, 0, 0, 0, null, 0.005);
  r.pop();
  r.loft(hide, [{ p: [-0.215, 1.03, -0.115], rx: 0.02, ry: 0.02 }, { p: [-0.245, 0.95, -0.135], rx: 0.058, ry: 0.052 }, { p: [-0.25, 0.83, -0.14], rx: 0.074, ry: 0.066 }, { p: [-0.24, 0.73, -0.13], rx: 0.03, ry: 0.03 }], { seg: 8 }, 0.25);
  r.loft(MT.sadu1(), [{ p: [-0.215, 1.285, -0.2], rx: 0.068, ry: 0.068 }, { p: [0.215, 1.30, -0.2], rx: 0.068, ry: 0.068 }], { seg: 10, fit: true });
  for (const x of [-0.12, 0.12]) r.loft(leatherDark, [{ p: [x - 0.012, 1.292, -0.2], rx: 0.071, ry: 0.071 }, { p: [x + 0.012, 1.293, -0.2], rx: 0.071, ry: 0.071 }], { seg: 10, cap0: false, cap1: false });

  // ---- head: wrapped in a checked shemagh held by an agal; only the eyes show above the veil
  r.push(0, 1.47, -0.004, 0.02, -0.24, 0.0);
  r.tube(skin, [[0, -0.03, 0, 0.05], [0, 0.09, 0.006, 0.047]], { cap0: false, cap1: false });
  r.loft(skin, [
    { p: [0, 0.062, 0.016], rx: 0.044, ry: 0.052 }, { p: [0, 0.108, 0.010], rx: 0.066, ry: 0.084 }, { p: [0, 0.168, 0.006], rx: 0.076, ry: 0.094 },
    { p: [0, 0.225, 0.004], rx: 0.079, ry: 0.098 }, { p: [0, 0.275, 0.0], rx: 0.071, ry: 0.090 }, { p: [0, 0.305, -0.004], rx: 0.04, ry: 0.055 },
  ], { seg: 12 });
  r.box(skin, 0.024, 0.052, 0.03, 0, 0.184, 0.094, -0.18, 0, 0, 0, null, 0.01);                              // bridge of the nose
  for (const sd of [-1, 1]) {
    r.box(dark, 0.034, 0.013, 0.012, sd * 0.034, 0.197, 0.086, 0, sd * 0.25, 0, 0, [2.6, 1.9, 1.5], 0.004);   // socket
    r.box(dark, 0.013, 0.011, 0.008, sd * 0.034, 0.196, 0.0905, 0, sd * 0.25, 0, 0, null, 0.003);             // eye
    r.box(dark, 0.040, 0.008, 0.014, sd * 0.035, 0.213, 0.088, 0, sd * 0.25, sd * -0.10, 0, [1.3, 1.1, 1.0], 0.003);   // brow
  }
  // veil across nose and mouth, wound down into the collar
  r.loft(wrap, [{ p: [0, -0.05, 0.0], rx: 0.118, ry: 0.098 }, { p: [0, 0.03, 0.004], rx: 0.090, ry: 0.092 }, { p: [0, 0.10, 0.010], rx: 0.083, ry: 0.103 }, { p: [0, 0.172, 0.010], rx: 0.084, ry: 0.111 }], { seg: 14, cap0: false, cap1: false }, 0.1);
  // ghutra: a draped wedge over the crown, open round the face, falling to the shoulders and down the back
  r.loft(wrap, [
    { p: [0, 0.328, -0.006], rx: 0.03, ry: 0.04 }, { p: [0, 0.317, -0.004], rx: 0.070, ry: 0.086 }, { p: [0, 0.288, 0.0], rx: 0.089, ry: 0.107 },
    { p: [0, 0.236, 0.004], rx: 0.094, ry: 0.113 }, { p: [0, 0.196, 0.004], rx: 0.100, ry: 0.115, ryB: 0.118, gap: 1.75 }, { p: [0, 0.11, 0.0], rx: 0.116, ry: 0.116, ryB: 0.124, gap: 2.25 },
    { p: [0, 0.01, -0.006], rx: 0.152, ry: 0.118, ryB: 0.132, gap: 2.65 }, { p: [0, -0.07, -0.012], rx: 0.176, ry: 0.122, ryB: 0.140, gap: 3.0 }, { p: [0, -0.17, -0.02], rx: 0.150, ry: 0.11, ryB: 0.150, gap: 3.6 },
  ], { seg: 16 }, 0.06);
  const agal = MT.agal();
  r.loft(agal, [{ p: [0, 0.262, 0.002], rx: 0.0965, ry: 0.1155 }, { p: [0, 0.278, 0.001], rx: 0.0955, ry: 0.1140 }], { seg: 16, cap0: false, cap1: false });
  r.loft(agal, [{ p: [0, 0.283, 0.001], rx: 0.0935, ry: 0.1115 }, { p: [0, 0.298, 0.0], rx: 0.0900, ry: 0.1080 }], { seg: 16, cap0: false, cap1: false });
  // one loose tail of the wrap over the left shoulder and chest
  r.loft(wrap, [{ p: [0.088, 0.115, 0.086], rx: 0.045, ry: 0.007 }, { p: [0.104, -0.02, 0.128], rx: 0.05, ry: 0.007 }, { p: [0.10, -0.16, 0.146], rx: 0.047, ry: 0.007 }, { p: [0.088, -0.275, 0.142], rx: 0.036, ry: 0.006 }], { seg: 6, n: 4, up: [0, 0, 1] }, 0.1);
  const head = r.world(0, 0.34, 0);
  r.pop();

  // ---- the mattock, stood on its head beside his right foot
  r.aim(headAt, haftDir, -Math.PI / 2 - 0.25);
  mattock(r, haftTop.distanceTo(headAt) + 0.03, 1.25);
  r.pop();

  const g = r.build('ranger');
  g.userData.tag = head.clone().add(V3(0, 0.10, 0));
  g.userData.height = 1.82;
  return g;
}

// ============================================================================================
// Arabian oryx: white coat, dark face mask and legs, long straight horns swept back.
// ============================================================================================
function oryxHeadTex() {
  return paint(128, (u, t) => {
    let c = base(hex(0xded4bf), u, t, { seed: 421, blotch: 0.06, grain: 0.03, grad: 0, edge: 0 });
    const drk = hex(0x2e221b);
    const du = Math.abs(u - 0.5);                           // 0 on the bridge of the nose, 0.5 under the jaw
    let k = 0;
    k = Math.max(k, sstep(0.105, 0.075, du) * sstep(0.44, 0.52, t) * sstep(0.97, 0.90, t));           // blaze down the muzzle
    k = Math.max(k, sstep(0.14 - (t - 0.12) * 0.5, 0.10 - (t - 0.12) * 0.5, du) * sstep(0.10, 0.15, t) * sstep(0.33, 0.27, t));   // forehead patch
    const line = 0.22 + (t - 0.30) * 0.62;                                                             // stripe from the eye down to the jaw
    k = Math.max(k, sstep(0.05, 0.028, Math.abs(du - line)) * sstep(0.27, 0.32, t) * sstep(0.74, 0.66, t));
    k = Math.max(k, sstep(0.36, 0.42, du) * sstep(0.50, 0.58, t) * sstep(0.92, 0.84, t));            // under the jaw
    k = Math.max(k, sstep(0.93, 0.96, t));                                                             // nose
    c = mix3(c, mul(drk, 0.9 + 0.3 * pv(u, t, 30, 6, 5)), k);
    return c;
  }, null, {});
}
export function buildOryx() {
  const r = new Rig();
  const white = MT.furWhite(), drk = MT.furDark(), horn = MT.horn(), hoof = MT.hoof(), dark = MT.dark();
  const face = surf('oryxFace', oryxHeadTex, { tile: 1 });
  // barrel: deep chest, a hump over the shoulder, tucked flank, rounded quarters
  r.loft(white, [
    { p: [0, 0.99, -0.66], rx: 0.05, ry: 0.07, ryB: 0.06 }, { p: [0, 1.00, -0.58], rx: 0.155, ry: 0.16, ryB: 0.16 }, { p: [0, 1.01, -0.42], rx: 0.192, ry: 0.185, ryB: 0.20 },
    { p: [0, 1.00, -0.18], rx: 0.182, ry: 0.165, ryB: 0.19 }, { p: [0, 0.99, 0.06], rx: 0.192, ry: 0.175, ryB: 0.225 }, { p: [0, 1.00, 0.28], rx: 0.198, ry: 0.225, ryB: 0.25 },
    { p: [0, 1.02, 0.44], rx: 0.182, ry: 0.235, ryB: 0.24 }, { p: [0, 1.02, 0.57], rx: 0.135, ry: 0.19, ryB: 0.21 }, { p: [0, 1.0, 0.65], rx: 0.06, ry: 0.10, ryB: 0.12 },
  ], { seg: 14, n: 2.5 }, 0.16);
  // legs
  const leg = (x, front, sh, kn, ft) => {
    // sh: shoulder / hip, kn: knee / hock, ft: fetlock; all [y, z]
    if (front) {
      r.tube(white, [[x * 0.9, sh[0] + 0.12, sh[1], 0.085, 0.10], [x, sh[0], sh[1], 0.062, 0.075], [x, kn[0] + 0.03, kn[1], 0.036, 0.04]], { cap0: false }, 0.1);
    } else {
      const st = [sh[0] - 0.22, sh[1] + 0.085];                                                            // stifle
      r.tube(white, [[x * 0.85, sh[0] + 0.08, sh[1] + 0.02, 0.10, 0.15], [x, sh[0] - 0.10, sh[1] + 0.05, 0.078, 0.125], [x, st[0], st[1], 0.058, 0.085], [x, kn[0] + 0.03, kn[1], 0.034, 0.042]], { cap0: false }, 0.1);
    }
    r.tube(drk, [[x, kn[0] + 0.045, kn[1], 0.035, 0.04], [x, kn[0], kn[1], 0.031, 0.036], [x, ft[0] + 0.07, ft[1], 0.022, 0.025], [x, ft[0] + 0.02, ft[1], 0.027, 0.03]], {});
    r.tube(white, [[x, ft[0] + 0.03, ft[1], 0.0275, 0.0305], [x, ft[0] - 0.035, ft[1] + 0.012, 0.027, 0.03]], {}, 0, [0.95, 0.93, 0.9]);
    r.tbox(hoof, 0.062, 0.055, 0.082, 0.82, 0.8, x, ft[0] - 0.062, ft[1] + 0.024, 0, 0, 0, 0, 0, -0.01, null, 0.014);
  };
  leg(-0.115, true, [0.84, 0.43], [0.47, 0.445], [0.09, 0.43]);
  leg(0.115, true, [0.84, 0.47], [0.48, 0.53], [0.09, 0.555]);
  leg(-0.125, false, [0.93, -0.50], [0.47, -0.60], [0.09, -0.555]);
  leg(0.125, false, [0.93, -0.46], [0.48, -0.50], [0.09, -0.44]);
  // tail with a dark tuft
  r.tube(white, [[0, 1.12, -0.64, 0.028], [0, 0.98, -0.72, 0.017], [0, 0.78, -0.735, 0.013]], { seg: 6 });
  r.tube(drk, [[0, 0.80, -0.735, 0.016], [0, 0.70, -0.74, 0.03], [0, 0.56, -0.735, 0.012]], { seg: 6 });
  // neck: a thick wedge rising out of the shoulder, turned a little toward the viewer
  r.push(0, 1.08, 0.50, 0, 0.30, 0);
  r.loft(white, [{ p: [0, -0.05, -0.05], rx: 0.125, ry: 0.19, ryB: 0.17 }, { p: [0, 0.16, 0.10], rx: 0.095, ry: 0.13, ryB: 0.125 }, { p: [0, 0.35, 0.215], rx: 0.074, ry: 0.092, ryB: 0.09 }, { p: [0, 0.455, 0.265], rx: 0.064, ry: 0.07, ryB: 0.07 }], { seg: 12, cap0: false, up: [0, 1, 0] }, 0.1);
  // head: long face carried level-and-down, ears out, horns sweeping back
  r.push(0, 0.47, 0.25, 0, 0.26, 0);
  const hd = V3(0, -0.62, 0.785).normalize(), H = (t, o = 0) => [0, hd.y * t + o * 0.785, hd.z * t + o * 0.62];
  r.loft(face, [
    { p: H(-0.045), rx: 0.03, ry: 0.035 }, { p: H(-0.01), rx: 0.064, ry: 0.066 }, { p: H(0.06), rx: 0.078, ry: 0.076, ryB: 0.085 }, { p: H(0.13), rx: 0.074, ry: 0.066, ryB: 0.08 },
    { p: H(0.21), rx: 0.056, ry: 0.052, ryB: 0.066 }, { p: H(0.29), rx: 0.046, ry: 0.042, ryB: 0.05 }, { p: H(0.335), rx: 0.042, ry: 0.038, ryB: 0.042 }, { p: H(0.36), rx: 0.026, ry: 0.024 },
  ], { seg: 12, fit: true, n: 2.6 });
  for (const sd of [-1, 1]) {
    const e = H(0.118, 0.022);
    r.box(dark, 0.012, 0.024, 0.03, sd * 0.071, e[1], e[2], 0.65, 0, 0, 0, null, 0.005);                 // eye
    const er = H(0.02, 0.045);
    r.push(sd * 0.062, er[1], er[2], -0.5, sd * 0.5, sd * -1.05);
    r.tbox(white, 0.05, 0.13, 0.014, 0.25, 1, 0, 0.065, 0, 0, 0, 0, 0, 0, 0, [0.93, 0.9, 0.86], 0.005);
    r.pop();
    // horn: ringed, almost straight, leaning back over the neck
    const hb = H(0.035, 0.062);
    const b0 = V3(sd * 0.036, hb[1], hb[2]), dir = V3(sd * 0.10, 0.80, -0.59).normalize();
    const pts = [];
    for (let i = 0; i <= 4; i++) { const t = i / 4, len = 0.66 * t; pts.push([b0.x + dir.x * len, b0.y + dir.y * len + 0.02 * Math.sin(t * Math.PI), b0.z + dir.z * len - 0.05 * t * t, 0.019 - 0.0155 * t]); }
    r.tube(horn, pts, { seg: 6 });
  }
  const head = r.world(0, 0.0, 0.0);
  r.pop(2);
  const g = r.build('oryx');
  g.userData.tag = V3(head.x, head.y + 0.72, head.z - 0.2);
  g.userData.height = 2.0;
  return g;
}

// ============================================================================================
// First-person view: the ranger's sleeve, bracer and fist round a mattock, parented to the camera.
// ============================================================================================
export function buildHeldTool() {
  const r = new Rig();
  const linen = MT.linen(), leather = MT.leather(), skin = MT.skin(), brass = MT.brass();
  const grip = V3(0.57, -0.47, -1.0), elbow = V3(1.04, -0.98, -0.50);
  const hd = V3(-0.30, 0.74, -0.60).normalize();
  // tool: the head is up and away from us, blade turned across the view
  r.aim(grip.clone().addScaledVector(hd, 0.40), hd.clone().negate(), 0.75);
  mattock(r, 0.66, 1.1);
  r.pop();
  // fist round the haft
  r.aim(grip, hd, -0.9);
  r.box(skin, 0.052, 0.092, 0.092, 0.04, 0, -0.008, 0, 0, 0, 0, null, 0.022);
  for (let i = 0; i < 4; i++) {
    r.box(skin, 0.05, 0.0205, 0.04, 0.012, -0.036 + i * 0.0235, 0.036, 0, -0.3, 0, 0, [0.96, 0.96, 0.96], 0.009);     // first joints
    r.box(skin, 0.045, 0.0195, 0.03, -0.026, -0.036 + i * 0.0235, 0.028, 0, 0.6, 0, 0, [0.9, 0.9, 0.9], 0.008);      // finger tips wrapping round
  }
  r.box(skin, 0.028, 0.034, 0.075, -0.004, 0.052, -0.004, 0, 0.5, 0, 0, null, 0.011);                                 // thumb
  const wrist = r.world(0.062, 0.0, -0.03);
  r.pop();
  // wrist, bracer with brass bands, linen sleeve running off the bottom-right corner
  const f = elbow.clone().sub(wrist), fl = f.length(); f.normalize();
  const at = (t, rad) => [wrist.x + f.x * fl * t, wrist.y + f.y * fl * t, wrist.z + f.z * fl * t, rad];
  r.tube(skin, [at(-0.02, 0.036), at(0.06, 0.04)], { seg: 10 });
  r.tube(leather, [at(0.05, 0.047), at(0.30, 0.058)], { seg: 10 });
  r.tube(brass, [at(0.05, 0.0495), at(0.07, 0.0505)], { seg: 10 });
  r.tube(brass, [at(0.28, 0.0595), at(0.30, 0.0605)], { seg: 10 });
  r.tube(linen, [at(0.28, 0.066), at(0.5, 0.082), at(1.0, 0.105), at(1.9, 0.135)], { seg: 10, cap0: false });   // long enough to leave the frame on any screen
  const g = r.build('heldTool');
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  return g;
}

// ============================================================================================
// Camel (dromedary) with a riding saddle and woven bags.
// ============================================================================================
export function buildCamel() {
  const r = new Rig();
  const fur = (k, c, s) => surf(k, () => SURF.fur(hex(c), s), { tile: 2.5 });
  const hair = fur('camel', 0xb8946a, 431), hairDark = fur('camelDark', 0x8f6c48, 433), hairLight = fur('camelLight', 0xcbae86, 435);
  const pad = MT.hoof(), dark = MT.dark(), wood = MT.wood(), leather = MT.leather();
  const sadu = MT.sadu0(), sadu2 = MT.sadu2();
  const red = surf('redWool', () => SURF.wool(hex(0x8a2a22), 437), { tile: 6 }), rope = surf('rope', () => SURF.wool(hex(0xb49a72), 439), { tile: 8 });
  // barrel: deep chest, belly tucking up toward the quarters
  r.loft(hair, [
    { p: [0, 1.50, -1.05], rx: 0.07, ry: 0.09, ryB: 0.10 }, { p: [0, 1.53, -0.95], rx: 0.215, ry: 0.21, ryB: 0.25 }, { p: [0, 1.56, -0.66], rx: 0.285, ry: 0.25, ryB: 0.33 },
    { p: [0, 1.56, -0.28], rx: 0.318, ry: 0.25, ryB: 0.385 }, { p: [0, 1.55, 0.12], rx: 0.328, ry: 0.25, ryB: 0.43 }, { p: [0, 1.55, 0.46], rx: 0.30, ry: 0.25, ryB: 0.455 },
    { p: [0, 1.50, 0.70], rx: 0.23, ry: 0.22, ryB: 0.39 }, { p: [0, 1.43, 0.85], rx: 0.10, ry: 0.13, ryB: 0.22 },
  ], { seg: 14, n: 2.5 }, 0.2);
  r.loft(hairDark, [{ p: [0, 1.70, -0.10], rx: 0.25, ry: 0.52 }, { p: [0, 1.93, -0.13], rx: 0.205, ry: 0.36 }, { p: [0, 2.10, -0.155], rx: 0.135, ry: 0.22 }, { p: [0, 2.185, -0.17], rx: 0.05, ry: 0.08 }], { seg: 12, cap0: false }, 0.12);
  // legs: long, knock-kneed, broad pads. The off hind leg is cocked.
  const leg = (x, front, dz, cock = 0) => {
    if (front) {
      r.tube(hair, [[x * 0.85, 1.44, 0.50 + dz * 0.3, 0.125, 0.16], [x, 1.20, 0.53 + dz * 0.5, 0.088, 0.108], [x * 0.96, 0.78, 0.56 + dz, 0.058, 0.066]], { cap0: false }, 0.1);
      r.tube(hairDark, [[x * 0.96, 0.80, 0.56 + dz, 0.062, 0.07], [x * 0.96, 0.72, 0.568 + dz, 0.066, 0.074], [x * 0.96, 0.65, 0.56 + dz, 0.05, 0.055]], {});
      r.tube(hairLight, [[x * 0.96, 0.67, 0.56 + dz, 0.049, 0.054], [x, 0.18, 0.55 + dz * 1.3, 0.04, 0.045], [x, 0.10, 0.555 + dz * 1.3, 0.052, 0.058]], {}, 0.12);
      r.tbox(pad, 0.185, 0.09, 0.235, 0.72, 0.72, x, 0.045, 0.585 + dz * 1.3, 0, 0, 0, 0, 0, -0.02, null, 0.03);
    } else {
      const hk = [0.84 + cock * 0.06, -0.90 + dz + cock * 0.10], ft = [0.10 + cock * 0.05, -0.80 + dz * 1.4 + cock * 0.30];
      r.tube(hair, [[x * 0.85, 1.48, -0.74 + dz * 0.3, 0.14, 0.21], [x, 1.20, -0.72 + dz * 0.5, 0.105, 0.16], [x, hk[0] + 0.04, hk[1], 0.058, 0.074]], { cap0: false }, 0.1);
      r.tube(hairDark, [[x, hk[0] + 0.06, hk[1], 0.06, 0.076], [x, hk[0] - 0.02, hk[1] - 0.012, 0.056, 0.066], [x, hk[0] - 0.09, hk[1] + 0.005, 0.046, 0.052]], {});
      r.tube(hairLight, [[x, hk[0] - 0.07, hk[1], 0.046, 0.052], [x, ft[0] + 0.08, ft[1], 0.04, 0.045], [x, ft[0], ft[1] + 0.008, 0.052, 0.058]], {}, 0.12);
      r.push(x, ft[0] - 0.10, ft[1], cock * 0.75, 0, 0);
      r.tbox(pad, 0.185, 0.09, 0.235, 0.72, 0.72, 0, 0.045, 0.03, 0, 0, 0, 0, 0, -0.02, null, 0.03);
      r.pop();
    }
  };
  leg(-0.215, true, 0.0); leg(0.215, true, 0.09);
  leg(-0.215, false, 0.02); leg(0.215, false, 0.10, 0.4);
  // tail
  r.tube(hair, [[0, 1.62, -1.02, 0.04], [0, 1.34, -1.10, 0.026], [0, 1.08, -1.10, 0.02]], { seg: 6 });
  r.tube(dark, [[0, 1.10, -1.10, 0.022], [0, 1.0, -1.10, 0.034], [0, 0.88, -1.095, 0.012]], { seg: 6 }, 0, [2.2, 1.7, 1.4]);
  // neck: one long S out of the chest
  r.loft(hair, [
    { p: [0, 1.38, 0.62], rx: 0.19, ry: 0.22, ryB: 0.27 }, { p: [0, 1.36, 0.96], rx: 0.145, ry: 0.165, ryB: 0.20 }, { p: [0, 1.52, 1.22], rx: 0.118, ry: 0.13, ryB: 0.15 },
    { p: [0, 1.82, 1.33], rx: 0.102, ry: 0.112, ryB: 0.122 }, { p: [0, 2.14, 1.31], rx: 0.094, ry: 0.10, ryB: 0.105 }, { p: [0, 2.36, 1.27], rx: 0.09, ry: 0.094 }, { p: [0, 2.47, 1.30], rx: 0.086, ry: 0.088 },
  ], { seg: 12, cap0: false, up: [0, 1, 0] }, 0.1);
  // head: long skull, drooping lip, heavy-lidded eyes, small ears laid back
  r.push(0, 2.50, 1.27, 0, 0.16, 0, 1.2);
  const hd = V3(0, -0.27, 0.963).normalize(), H = (t, o = 0) => [0, hd.y * t + o * 0.963, hd.z * t + o * 0.27];
  r.loft(hair, [
    { p: H(-0.07), rx: 0.04, ry: 0.045 }, { p: H(-0.01), rx: 0.086, ry: 0.082, ryB: 0.09 }, { p: H(0.10), rx: 0.097, ry: 0.086, ryB: 0.098 }, { p: H(0.22), rx: 0.078, ry: 0.068, ryB: 0.092 },
    { p: H(0.34), rx: 0.068, ry: 0.060, ryB: 0.082 }, { p: H(0.43), rx: 0.066, ry: 0.058, ryB: 0.07 }, { p: H(0.485), rx: 0.04, ry: 0.036, ryB: 0.045 },
  ], { seg: 12, n: 2.7 }, 0.1);
  { const n = H(0.455, 0.012); r.box(hairDark, 0.105, 0.05, 0.075, 0, n[1], n[2], 0.27, 0, 0, 0, null, 0.02); }            // nose and upper lip
  { const m = H(0.40, -0.066); r.box(dark, 0.12, 0.012, 0.13, 0, m[1], m[2], 0.27, 0, 0, 0, [2.0, 1.5, 1.2], 0.004); }       // mouth line
  for (const sd of [-1, 1]) {
    const e = H(0.10, 0.03);
    r.box(dark, 0.02, 0.034, 0.046, sd * 0.09, e[1], e[2], 0.27, 0, 0, 0, null, 0.008);
    r.box(hairDark, 0.03, 0.02, 0.066, sd * 0.094, e[1] + 0.022, e[2], 0.27, 0, 0, 0, null, 0.008);                         // heavy lid
    const er = H(-0.02, 0.07);
    r.push(sd * 0.075, er[1], er[2], -0.9, sd * 0.4, sd * -0.5);
    r.tbox(hair, 0.055, 0.10, 0.02, 0.35, 1, 0, 0.05, 0, 0, 0, 0, 0, 0, 0, null, 0.008);
    r.pop();
    const ns = H(0.462, 0.034);
    r.box(dark, 0.014, 0.012, 0.03, sd * 0.03, ns[1], ns[2], 0.27, sd * 0.5, 0, 0, null, 0.004);                             // nostril
  }
  // halter
  { const a = H(0.33), b = H(0.35); r.loft(red, [{ p: a, rx: 0.073, ry: 0.066, ryB: 0.088 }, { p: b, rx: 0.072, ry: 0.065, ryB: 0.087 }], { seg: 12, cap0: false, cap1: false }); }
  for (const sd of [-1, 1]) { const a = H(0.33, 0.01), b = H(0.03, 0.02); r.tube(red, [[sd * 0.072, a[1], a[2], 0.011], [sd * 0.094, b[1], b[2], 0.011]], { seg: 5 }); }
  const head = r.world(0, 0.0, 0.1);
  r.pop();
  // saddle blanket over the back, frame horns fore and aft of the hump, bags, girth and tassels
  r.loft(sadu, [{ p: [0, 1.565, -0.60], rx: 0.305, ry: 0.268, ryB: 0.35, gap: 2.55 }, { p: [0, 1.56, -0.10], rx: 0.338, ry: 0.268, ryB: 0.41, gap: 2.5 }, { p: [0, 1.555, 0.50], rx: 0.318, ry: 0.268, ryB: 0.455, gap: 2.5 }],
    { seg: 14, n: 2.5, gapAt: -Math.PI / 2, fit: true });
  r.tbox(wood, 0.07, 0.36, 0.07, 0.7, 0.7, 0, 2.0, 0.44, 0.22, 0, 0, 0.1, 0, 0, null, 0.02);
  r.tbox(wood, 0.07, 0.34, 0.07, 0.7, 0.7, 0, 2.02, -0.66, -0.28, 0, 0, 0.1, 0, 0, null, 0.02);
  r.box(wood, 0.46, 0.05, 0.06, 0, 1.87, 0.40, 0.2, 0, 0, 0, null, 0.02);
  r.box(wood, 0.44, 0.05, 0.06, 0, 1.88, -0.60, -0.2, 0, 0, 0, null, 0.02);
  for (const sd of [-1, 1]) {
    r.box(sadu2, 0.15, 0.40, 0.52, sd * 0.40, 1.50, -0.34, 0, 0, sd * -0.10, 0.2, null, 0.045);
    r.box(leather, 0.16, 0.05, 0.54, sd * 0.395, 1.69, -0.34, 0, 0, sd * -0.10, 0, null, 0.02);
    for (const z of [-0.50, -0.10, 0.20, 0.44]) r.tube(red, [[sd * 0.345, 1.38, z, 0.012], [sd * 0.35, 1.30, z, 0.022], [sd * 0.35, 1.19, z, 0.014]], { seg: 5 });
  }
  r.loft(rope, [{ p: [0, 1.55, 0.26], rx: 0.335, ry: 0.272, ryB: 0.45 }, { p: [0, 1.55, 0.31], rx: 0.333, ry: 0.272, ryB: 0.452 }], { seg: 14, n: 2.5, cap0: false, cap1: false });
  const g = r.build('camel');
  g.userData.tag = V3(head.x, head.y + 0.28, head.z);
  g.userData.height = 2.6;
  g.userData.span = [0.65, 0.22];
  return g;
}

// ============================================================================================
// Sand wraith: a hooded figure of wind-carved sandstone. Below the ribs it is no longer a body, only a
// column of sand that pours down and streams away on the wind.
// ============================================================================================
export function buildWraith(seed = 1) {
  const r = new Rig();
  const rnd = mulberry32(seed * 977 + 5);
  const stone = surf('wrStone', () => SURF.sandstone(hex(0xa98258), 501), { tile: 2.6 });
  const stoneDark = surf('wrStoneDark', () => SURF.sandstone(hex(0x7a5b40), 503), { tile: 2.6 });
  const cloth = surf('wrCloth', () => SURF.sandstone(hex(0x98774f), 505), { tile: 1.6, double: true });
  const flow = surf('wrFlow', () => SURF.sandFlow(hex(0xd0a675), 507, false), { alpha: true, double: true });
  const ribbon = surf('wrRibbon', () => SURF.sandFlow(hex(0xd8b283), 509, true), { alpha: true, double: true });
  const grain = surf('wrGrain', () => SURF.skin(hex(0xc79a68), 511), { tile: 2 });
  const voidM = surf('wrVoid', () => SURF.skin(hex(0x0b0807), 513), { rim: 0 });
  const ember = glowMat('ember', 7.0, 2.3, 0.45), emberDim = glowMat('emberDim', 2.4, 0.62, 0.10);

  // torso: a hunched ribcage of layered stone, cracked, with fire inside
  r.loft(stone, [
    { p: [0, 1.16, 0.0], rx: 0.12, ry: 0.10 }, { p: [0, 1.40, 0.03], rx: 0.17, ry: 0.14 }, { p: [0, 1.66, 0.09], rx: 0.25, ry: 0.185, ryB: 0.20 },
    { p: [0, 1.88, 0.165], rx: 0.33, ry: 0.20, ryB: 0.23 }, { p: [0, 2.02, 0.22], rx: 0.21, ry: 0.16 }, { p: [0, 2.12, 0.26], rx: 0.10, ry: 0.10 },
  ], { seg: 12, cap0: false, n: 2.8 }, 0.3);
  for (const [x, y, w, a] of [[0.02, 1.80, 0.20, 0.10], [-0.03, 1.69, 0.24, -0.07], [0.03, 1.575, 0.18, 0.14], [-0.01, 1.47, 0.11, -0.10]]) {
    const z = 0.085 + (y - 1.40) * 0.25 + 0.175 - Math.max(0, 1.6 - y) * 0.14;
    r.box(emberDim, w, 0.02, 0.02, x, y, z, 0.22, 0, a, 0, null, 0);
    r.box(ember, w * 0.45, 0.011, 0.022, x + w * 0.12, y, z + 0.002, 0.22, 0, a, 0, null, 0);
  }
  r.box(emberDim, 0.018, 0.30, 0.02, 0.0, 1.63, 0.268, 0.22, 0, 0.06, 0, null, 0);

  // hood and mantle: one heavy cowl, peak tipped forward, hanging off the shoulders in a broad wedge
  r.loft(cloth, [
    { p: [0, 2.60, 0.40], rx: 0.02, ry: 0.03 }, { p: [0, 2.54, 0.33], rx: 0.12, ry: 0.15 }, { p: [0, 2.42, 0.32], rx: 0.20, ry: 0.22, gap: 0.9 },
    { p: [0, 2.26, 0.32], rx: 0.235, ry: 0.235, ryB: 0.25, gap: 1.75 }, { p: [0, 2.10, 0.28], rx: 0.27, ry: 0.22, ryB: 0.27, gap: 2.05 }, { p: [0, 1.97, 0.21], rx: 0.43, ry: 0.24, ryB: 0.30, gap: 2.3 },
    { p: [0, 1.78, 0.12], rx: 0.52, ry: 0.27, ryB: 0.34, gap: 2.5 }, { p: [0, 1.52, 0.03], rx: 0.51, ry: 0.26, ryB: 0.36, gap: 2.75 }, { p: [-0.03, 1.30, -0.03], rx: 0.44, ry: 0.20, ryB: 0.38, gap: 3.1 },
  ], { seg: 16, n: 2.6 }, 0.28);
  r.loft(voidM, [{ p: [0, 2.10, 0.27], rx: 0.13, ry: 0.13 }, { p: [0, 2.26, 0.30], rx: 0.185, ry: 0.17 }, { p: [0, 2.42, 0.30], rx: 0.13, ry: 0.13 }], { seg: 10 });
  // eyes: two narrow slits slanting down toward the centre
  const eyes = [];
  for (const sd of [-1, 1]) {
    r.box(ember, 0.078, 0.021, 0.012, sd * 0.066, 2.272, 0.462, 0.1, 0, sd * 0.42, 0, null, 0);
    eyes.push(V3(sd * 0.066, 2.272, 0.475));
  }
  // right arm: reaching, stone claws out of a wide torn sleeve
  r.loft(cloth, [{ p: [-0.36, 1.92, 0.17], rx: 0.11, ry: 0.11 }, { p: [-0.50, 1.60, 0.40], rx: 0.125, ry: 0.13 }, { p: [-0.45, 1.40, 0.72], rx: 0.15, ry: 0.17 }, { p: [-0.40, 1.34, 0.90], rx: 0.17, ry: 0.20 }], { seg: 10, cap0: false, cap1: false }, 0.2);
  r.tube(stoneDark, [[-0.47, 1.50, 0.56, 0.06], [-0.41, 1.34, 0.92, 0.05], [-0.39, 1.30, 1.02, 0.058]], { seg: 6 });
  for (let f = -1; f <= 2; f++) {
    const a = f * 0.36 - 0.18;
    r.tube(stone, [[-0.39 + Math.sin(a) * 0.03, 1.30, 1.02, 0.024], [-0.39 + Math.sin(a) * 0.12, 1.24 - Math.abs(f - 0.5) * 0.02, 1.16, 0.019], [-0.39 + Math.sin(a) * 0.17, 1.10 - Math.abs(f - 0.5) * 0.02, 1.25, 0.004]], { seg: 5 });
  }
  // left arm: the sleeve hangs, and what should be a hand is pouring away
  r.loft(cloth, [{ p: [0.36, 1.92, 0.17], rx: 0.11, ry: 0.11 }, { p: [0.53, 1.56, 0.20], rx: 0.125, ry: 0.13 }, { p: [0.53, 1.22, 0.30], rx: 0.15, ry: 0.16 }, { p: [0.51, 1.10, 0.33], rx: 0.17, ry: 0.18 }], { seg: 10, cap0: false, cap1: false }, 0.2);
  r.loft(flow, [{ p: [0.52, 1.20, 0.31], rx: 0.10, ry: 0.10 }, { p: [0.50, 0.85, 0.33], rx: 0.085, ry: 0.085 }, { p: [0.42, 0.40, 0.30], rx: 0.13, ry: 0.12 }, { p: [0.20, 0.03, 0.26], rx: 0.26, ry: 0.2 }], { seg: 10, fit: true, cap0: false, cap1: false });

  // below the ribs: a tapering column of falling sand around a last sliver of stone
  r.tube(stoneDark, [[0, 1.30, 0.0, 0.115], [0, 0.95, -0.01, 0.07], [-0.04, 0.55, 0, 0.028], [-0.08, 0.30, 0, 0.004]], { seg: 8, cap0: false });
  r.loft(flow, [
    { p: [0, 1.38, 0.0], rx: 0.165, ry: 0.135 }, { p: [0, 1.08, -0.01], rx: 0.150, ry: 0.13 }, { p: [-0.03, 0.72, 0.0], rx: 0.17, ry: 0.15 },
    { p: [-0.10, 0.38, 0.0], rx: 0.24, ry: 0.21 }, { p: [-0.22, 0.14, 0.0], rx: 0.34, ry: 0.28 }, { p: [-0.32, 0.03, 0.0], rx: 0.42, ry: 0.33 },
  ], { seg: 14, fit: true, cap0: false, cap1: false });
  for (let i = 0; i < 4; i++) r.box(emberDim, 0.012, 0.16 + rnd() * 0.12, 0.012, (rnd() - 0.5) * 0.14, 1.02 + rnd() * 0.22, 0.10 + rnd() * 0.02, 0, 0, (rnd() - 0.5) * 0.5, 0, null, 0);
  // ribbons of sand unwinding from the mantle and the column, carried off down-wind (-X)
  for (let i = 0; i < 14; i++) {
    const a0 = (i / 14) * Math.PI * 2 + rnd() * 0.5, top = 0.95 + rnd() * 0.6, turn = 1.6 + rnd() * 1.6, drift = 0.9 + rnd() * 1.5, w = 0.035 + rnd() * 0.045;
    const rings = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, a = a0 + turn * t, rad = 0.20 + 0.34 * t;
      rings.push({ p: [Math.cos(a) * rad - drift * t * t, Math.max(0.03, top * (1 - Math.pow(t, 0.85))), Math.sin(a) * rad * 0.85], rx: w * (0.8 + 1.0 * t), ry: 0.004 });
    }
    r.loft(ribbon, rings, { seg: 4, fit: true, cap0: false, cap1: false, n: 4 });
  }
  // torn strips of the mantle's hem, blown back
  for (let i = 0; i < 6; i++) {
    const x = -0.40 + i * 0.16 + (rnd() - 0.5) * 0.05, len = 0.35 + rnd() * 0.4, zb = -0.30 - (1 - Math.abs(x) * 1.6) * 0.07;
    r.loft(cloth, [{ p: [x, 1.36, zb], rx: 0.075, ry: 0.006 }, { p: [x - 0.05, 1.36 - len * 0.5, zb - 0.06], rx: 0.062, ry: 0.006 }, { p: [x - 0.16, 1.36 - len, zb - 0.10], rx: 0.02, ry: 0.004 }], { seg: 4, n: 4, up: [0, 0, 1], cap0: false, cap1: false }, 0.3);
  }
  // grains still holding together on the wind
  for (let i = 0; i < 56; i++) {
    const t = rnd(), s = 0.022 + rnd() * 0.05 * (1 - t * 0.5);
    r.box(grain, s, s, s, -0.2 - t * 1.9 + (rnd() - 0.5) * 0.4, s / 2 + rnd() * rnd() * 1.0 * (1 - t * 0.55), (rnd() - 0.5) * (0.5 + t * 0.7), rnd() * 3, rnd() * 3, rnd() * 3, 0, null, 0);
  }
  const g = r.build('wraith');
  for (const e of eyes) { const s = glowSprite(new THREE.Color(1.0, 0.40, 0.10), 0.20, 0.75); s.position.copy(e); g.add(s); }
  const chest = glowSprite(new THREE.Color(1.0, 0.35, 0.08), 0.75, 0.22); chest.position.set(0, 1.66, 0.34); g.add(chest);
  const core = glowSprite(new THREE.Color(1.0, 0.38, 0.10), 0.9, 0.16); core.position.set(0, 1.08, 0.08); g.add(core);
  const dustTex = glowTexture();
  for (const [x, y, z, sc, op] of [[-0.2, 0.3, 0, 1.9, 0.26], [-0.9, 0.3, 0.1, 1.6, 0.20], [-1.7, 0.35, 0, 1.4, 0.13]]) {
    const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: new THREE.Color(0.78, 0.60, 0.40), depthWrite: false, transparent: true, opacity: op, fog: false }));
    d.position.set(x, y, z); d.scale.set(sc, sc * 0.7, 1); d.renderOrder = 4; d.userData.dust = true;
    g.add(d);
  }
  g.userData.tag = V3(0, 2.70, 0.3);
  g.userData.height = 2.7;
  g.userData.eyes = eyes;
  return g;
}

// ============================================================================================
// Rock scorpion: slab-armoured, as long as a camel, tail arched to strike.
// ============================================================================================
export function buildScorpion() {
  const r = new Rig();
  const ch = (k, c, s) => surf(k, () => SURF.chitin(hex(c), s), { tile: 1.8 });
  const plate = ch('scPlate', 0x5a463a, 601), plateDark = ch('scPlateDark', 0x3e312b, 603), edge = ch('scEdge', 0xa07c54, 605), under = ch('scUnder', 0x2e2624, 607);
  const joint = ch('scJoint', 0x77593f, 609), sting = ch('scSting', 0x6e2a18, 611), tip = ch('scTip', 0x1c1412, 613);
  const ember = glowMat('ember', 7.0, 2.3, 0.45);
  const H = 0.50;                                       // body height off the ground
  r.push(0, H, 0, -0.06, 0, 0);
  // head shield: broad at the back, narrowing to the mouth
  r.push(0, 0, 0.30);
  r.zseg(plate, 1.00, 0.30, 0.86, 0.62, 0.7, 0.2);
  r.zseg(edge, 0.60, 0.06, 0.70, 0.55, 1, 0, 0.17);
  r.zseg(under, 0.80, 0.14, 0.80, 0.7, 1, 0, -0.20);
  for (const s of [-1, 1]) {
    r.box(ember, 0.055, 0.04, 0.035, s * 0.085, 0.165, 0.62);
    r.box(ember, 0.028, 0.022, 0.028, s * 0.30, 0.10, 0.80);
    r.box(ember, 0.028, 0.022, 0.028, s * 0.335, 0.09, 0.72);
    r.push(s * 0.12, -0.10, 0.78, 0.5, s * -0.12, 0);
    r.zseg(joint, 0.12, 0.13, 0.30, 0.45, 0.5);        // chelicera
    r.pop();
  }
  const eyes = [r.world(-0.085, 0.165, 0.66), r.world(0.085, 0.165, 0.66)];
  r.pop();
  // back plates: overlapping like roof tiles, each with a paler rear lip and a rock spur
  for (let i = 0; i < 6; i++) {
    const w = 1.06 - i * 0.085, z = 0.30 - i * 0.275;
    r.push(0, 0.02 - i * 0.006, z, -0.09, Math.PI, 0);
    r.zseg(i % 2 ? plateDark : plate, w, 0.29 - i * 0.012, 0.34, 0.93, 0.9, 0.2);
    r.box(edge, w * 0.94, 0.04, 0.05, 0, 0.14 - i * 0.006, 0.30);
    r.zseg(under, w * 0.8, 0.12, 0.30, 0.95, 1, 0, -0.19);
    if (i % 2 === 0) for (const s of [-1, 1]) r.tbox(plateDark, 0.12, 0.16, 0.14, 0.3, 0.3, s * w * 0.30, 0.20, 0.16, 0.2, 0, s * -0.25);
    r.pop();
  }
  // tail: five armoured blocks arching up and over, then the sting
  r.push(0, 0.05, -1.34, 0, Math.PI, 0);
  const bendA = [-0.52, -0.84, -0.78, -0.70, -0.62];
  for (let i = 0; i < 5; i++) {
    const w = 0.33 - i * 0.02, len = 0.50 - i * 0.012;
    r.push(0, 0, 0, bendA[i], 0, 0);
    r.zseg(i % 2 ? plate : plateDark, w, w * 0.92, len, 0.93, 0.93, 0.15);
    r.zseg(edge, w * 0.42, 0.035, len * 0.86, 0.9, 1, 0, w * 0.46);
    r.box(joint, w * 0.7, w * 0.6, 0.08, 0, 0, len - 0.02);
    r.push(0, 0, len - 0.04);
  }
  r.push(0, 0, 0, -0.55, 0, 0);
  r.zseg(sting, 0.27, 0.27, 0.36, 0.62, 0.62, 0.15);
  r.push(0, -0.02, 0.33, -0.95, 0, 0);
  r.zseg(tip, 0.09, 0.09, 0.36, 0.12, 0.12);
  r.box(ember, 0.03, 0.03, 0.05, 0, 0, 0.36);
  const stingTip = r.world(0, 0, 0.36);
  r.pop(2);
  r.pop(11);
  // legs: four pairs, arched like tent ribs
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = 0.52 - i * 0.37, yaw = -s * (0.70 - i * 0.50);
    r.push(s * 0.40, -0.10, z, 0, yaw, 0);
    r.push(0, 0, 0, 0, 0, s * 2.25);                     // out and up
    r.seg(joint, 0.14, 0.44, 0.15, 0.85, 0.85);
    r.push(0, -0.42, 0, 0, 0, s * -0.95);                // across, a little down
    r.seg(plate, 0.125, 0.50, 0.135, 0.8, 0.8);
    r.push(0, -0.48, 0, 0, 0, s * -1.00);                // down to the ground
    r.seg(joint, 0.10, 0.66, 0.105, 0.3, 0.3);
    r.pop(4);
  }
  // pincers: raised in threat, the left one higher, jaws open
  for (const s of [-1, 1]) {
    const lift = s > 0 ? -0.62 : -0.36;
    r.push(s * 0.38, -0.02, 0.98, lift, s * 0.95, 0);
    r.zseg(joint, 0.17, 0.17, 0.56, 0.9, 0.9);
    r.push(0, 0, 0.54, 0.30, s * -1.25, 0);
    r.zseg(plate, 0.17, 0.18, 0.50, 1.2, 1.15);
    r.push(0, 0, 0.48, 0.12, s * -0.12, 0);
    r.zseg(plateDark, 0.36, 0.25, 0.42, 0.9, 0.85, 0.2);                 // the hand
    r.box(edge, 0.26, 0.035, 0.32, 0, 0.13, 0.21);
    r.push(s * 0.10, 0, 0.38, 0, s * -0.16, 0);
    r.zseg(plate, 0.15, 0.17, 0.56, 0.18, 0.25);                         // fixed finger
    r.pop();
    r.push(s * -0.11, 0, 0.36, 0, s * 0.55, 0);
    r.zseg(edge, 0.12, 0.14, 0.50, 0.18, 0.25);                          // moving finger, open
    r.pop();
    r.pop(3);
  }
  r.pop();
  const g = r.build('scorpion');
  for (const e of eyes) { const s = glowSprite(new THREE.Color(1.0, 0.45, 0.10), 0.28, 0.8); s.position.copy(e); g.add(s); }
  const st = glowSprite(new THREE.Color(1.0, 0.4, 0.1), 0.3, 0.7); st.position.copy(stingTip); g.add(st);
  g.userData.tag = V3(0, 2.0, -1.3);
  g.userData.height = 2.3;
  g.userData.span = [0.9, 0.7];
  return g;
}

// ============================================================================================
// Saker falcon, hooded, on a padded block perch.
// ============================================================================================
export function buildFalcon() {
  const r = new Rig();
  const wood = MT.wood(), leather = MT.leather();
  const back = surf('falBack', () => SURF.feather(hex(0x5e4a38), hex(0xa58a66), 701), { tile: 9 });
  const breast = surf('falBreast', () => SURF.feather(hex(0xdccfb2), hex(0x8a6e50), 703), { tile: 11 });
  const hood = surf('falHood', () => SURF.leather(hex(0x7a2a22), 705), { tile: 8 });
  const cere = surf('falCere', () => SURF.skin(hex(0xc9a23a), 707), { tile: 4 });
  const beak = surf('falBeak', () => SURF.skin(hex(0x3a3a3c), 709), { tile: 4 });
  // perch: a turned post with a padded leather block
  r.tube(wood, [[0, 0, 0, 0.05], [0, 0.06, 0, 0.034], [0, 0.94, 0, 0.028], [0, 0.98, 0, 0.05]], { seg: 8 }, 0.2);
  r.tube(leather, [[0, 0.975, 0, 0.11], [0, 1.0, 0, 0.125], [0, 1.045, 0, 0.125], [0, 1.065, 0, 0.10]], { seg: 10 });
  r.push(0, 1.065, 0, -0.10, 0.5, 0);
  for (const s of [-1, 1]) { r.box(cere, 0.022, 0.03, 0.07, s * 0.034, 0.012, 0.03, 0, 0, 0, 0, null, 0.008); r.tube(cere, [[s * 0.034, 0.02, 0.0, 0.012], [s * 0.034, 0.09, -0.005, 0.016]], { seg: 5 }); }
  // body: upright, deep-breasted
  r.loft(breast, [{ p: [0, 0.05, -0.03], rx: 0.03, ry: 0.035 }, { p: [0, 0.11, -0.012], rx: 0.07, ry: 0.07 }, { p: [0, 0.22, 0.0], rx: 0.088, ry: 0.094, ryB: 0.08 }, { p: [0, 0.32, -0.006], rx: 0.074, ry: 0.076, ryB: 0.07 }, { p: [0, 0.385, 0.0], rx: 0.05, ry: 0.052 }], { seg: 10 }, 0.1);
  // folded wings and mantle
  r.loft(back, [{ p: [0, 0.37, -0.022], rx: 0.062, ry: 0.01, ryB: 0.06, gap: 0.2 }, { p: [0, 0.30, -0.02], rx: 0.098, ry: 0.02, ryB: 0.085, gap: 0.2 }, { p: [0, 0.18, -0.02], rx: 0.10, ry: 0.01, ryB: 0.092, gap: 0.2 }, { p: [0, 0.06, -0.05], rx: 0.065, ry: 0.0, ryB: 0.08, gap: 0.2 }, { p: [0, -0.06, -0.095], rx: 0.03, ry: 0.0, ryB: 0.04, gap: 0.2 }], { seg: 10, cap0: false, cap1: false }, 0.15);
  r.tbox(back, 0.085, 0.24, 0.02, 0.55, 1, 0, -0.07, -0.105, 0.33, 0, 0, 0.2, 0, 0, [0.8, 0.8, 0.8], 0.006);     // tail
  // head under a leather hood with a top-knot
  r.loft(hood, [{ p: [0, 0.37, 0.002], rx: 0.05, ry: 0.052 }, { p: [0, 0.415, 0.008], rx: 0.058, ry: 0.062 }, { p: [0, 0.46, 0.006], rx: 0.05, ry: 0.054 }, { p: [0, 0.485, 0.0], rx: 0.02, ry: 0.022 }], { seg: 10 });
  r.tube(leather, [[0, 0.48, 0, 0.008], [0, 0.515, -0.004, 0.006], [0, 0.535, -0.012, 0.012]], { seg: 5 });
  r.box(cere, 0.03, 0.022, 0.03, 0, 0.412, 0.06, 0, 0, 0, 0, null, 0.008);
  r.tbox(beak, 0.026, 0.045, 0.03, 0.3, 0.4, 0, 0.398, 0.078, 2.2, 0, 0, 0, 0, 0, null, 0.008);
  r.pop();
  const g = r.build('falcon');
  g.userData.tag = V3(0, 1.72, 0);
  g.userData.height = 1.7;
  return g;
}
