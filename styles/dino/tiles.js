// The painted tiles of the world of the dinosaurs, with the brushes of styles/barari/tiles.js (passed in, so the
// two worlds paint alike): deep jungle grass, fern-covered ground, swamp mud and murky water, black basalt, grey
// ash, glowing lava, banded red rock, jungle wood and leaves, the trunk and fronds of the giant fern, vines,
// ferns, broad leaves, horsetails, amber in the rock and a nest of eggs. No pictures, no text: all from noise.
export function dinoTiles(t) {
  const { T, D, S, clamp, mix, smooth, mod, hex, mix3, mul, h2, fbm, cells, rock, dirtAt, leafy, barkV, rings, blades, R } = t;

  // ---------------------------------------------------------------- ground
  const jungleAt = (u, v) => {
    const n = fbm(u, v, 4, 3, 1101), f = fbm(u, v, 14, 2, 1105);
    let c = mix3(hex('#1f5e22'), hex('#3d8a2c'), n);
    c = mix3(c, hex('#5a9e2e'), smooth(0.62, 0.82, f) * 0.45);
    const leaf = cells(u, v, 9, 1107);                                  // fallen leaves on the floor
    if (leaf.id > 0.82) c = mix3(c, hex('#6a5a26'), (1 - smooth(0.1, 0.24, leaf.d1)) * 0.7);
    const b = h2(Math.floor(u * 64), Math.floor(v * 64), 1109);
    if (b > 0.86) c = mul(c, 1.14); else if (b < 0.12) c = mul(c, 0.84);
    return c;
  };
  T('jungleTop', { nrm: 0.7 }, (u, v, p) => { p.c = jungleAt(u, v); p.h = fbm(u, v, 14, 2, 1105); p.r = 0.95; });
  T('jungleSide', { nrm: 0.8 }, (u, v, p) => {
    const edge = 0.3 + fbm(u, 0.5, 8, 2, 1111) * 0.18 + (h2(Math.floor(u * 32), 0, 1113) > 0.6 ? 0.1 : 0);
    const d = dirtAt(u, v, 1115);
    if (v < edge) { p.c = mul(jungleAt(u, v), mix(1.02, 0.8, v / edge)); p.h = 0.8; }
    else { p.c = mul(mix3(d.c, hex('#4a3020'), 0.35), v < edge + 0.05 ? 0.78 : 1); p.h = d.h; }
    p.r = 0.97;
  });
  const fernAt = (u, v) => {
    const n = fbm(u, v, 4, 3, 1121);
    let c = mix3(hex('#6d9a34'), hex('#a3bd4a'), n);
    // little fronds lying flat: rows of leaflets along a rib
    const cc = cells(u, v, 6, 1123, 0.9), ang = cc.id * 6.283;
    const lx = Math.cos(ang), lz = Math.sin(ang);
    const rib = 1 - smooth(0.02, 0.07, Math.abs(Math.sin((u * lx + v * lz) * 80 + cc.id * 9)) * cc.d1);
    if (cc.d1 < 0.42) c = mix3(c, hex('#4f8a2a'), rib * 0.55);
    const g = h2(Math.floor(u * 96), Math.floor(v * 96), 1125);
    return mul(c, 0.93 + g * 0.12);
  };
  T('fernTop', { nrm: 0.6 }, (u, v, p) => { p.c = fernAt(u, v); p.h = fbm(u, v, 12, 2, 1127); p.r = 0.95; });
  T('fernSide', { nrm: 0.7 }, (u, v, p) => {
    const edge = 0.22 + fbm(u, 0.5, 8, 2, 1131) * 0.14;
    const d = dirtAt(u, v, 1133);
    if (v < edge) { p.c = mul(fernAt(u, v), mix(1.04, 0.86, v / edge)); p.h = 0.8; }
    else { p.c = mul(mix3(d.c, hex('#8a5a32'), 0.2), v < edge + 0.05 ? 0.8 : 1); p.h = d.h; }
    p.r = 0.97;
  });
  const mudAt = (u, v, seed) => {
    const n = fbm(u, v, 5, 3, seed), c0 = cells(u, v, 8, seed + 3);
    let c = mix3(hex('#3e3420'), hex('#5e5230'), n);
    const wet = smooth(0.55, 0.75, fbm(u, v, 3, 2, seed + 7));
    c = mix3(c, hex('#2c2a1c'), wet * 0.5);
    if (c0.id > 0.78) c = mix3(c, hex('#6e6a3a'), (1 - smooth(0.1, 0.22, c0.d1)) * 0.6);
    return { c, h: n * 0.5 + (1 - wet) * 0.3, wet };
  };
  T('mudTop', { nrm: 0.8 }, (u, v, p) => {
    const m = mudAt(u, v, 1141), moss = smooth(0.5, 0.7, fbm(u, v, 6, 3, 1145));
    p.c = mix3(m.c, hex('#4d6a2a'), moss * 0.6); p.h = m.h; p.r = mix(0.95, 0.45, m.wet);
  });
  T('mud', { nrm: 0.9 }, (u, v, p) => { const m = mudAt(u, v, 1151); p.c = m.c; p.h = m.h; p.r = mix(0.97, 0.5, m.wet); });
  T('swampWater', { alpha: true }, (u, v, p) => {
    const n = fbm(u, v, 4, 3, 1161), scum = smooth(0.58, 0.72, fbm(u, v, 3, 3, 1163));
    p.c = mix3(mix3(hex('#2c3c1c'), hex('#4a5a2a'), n), hex('#6e7a34'), scum * 0.6); p.a = 0.72 + scum * 0.2; p.h = n;
  });

  // ---------------------------------------------------------------- the volcano
  const basaltAt = (u, v, seed) => {
    // columns: tall six-sided cells seen from the side are long plates with dark seams
    const c0 = cells(u * 1.0, v * 0.35, 5, seed, 0.6), seam = 1 - smooth(0.0, 0.05, c0.d2 - c0.d1);
    const n = fbm(u, v, 5, 3, seed + 3);
    let c = mix3(hex('#26262b'), hex('#3d3c42'), n * 0.7 + c0.id * 0.3);
    c = mul(c, 1 - seam * 0.5);
    const g = h2(Math.floor(u * 128), Math.floor(v * 128), seed + 5);
    if (g > 0.95) c = mul(c, 1.35);
    return { c, h: (1 - seam) * (0.6 + n * 0.4) };
  };
  T('basalt', { nrm: 1.4 }, (u, v, p) => { const b = basaltAt(u, v, 1201); p.c = b.c; p.h = b.h; p.r = 0.85; });
  T('basaltTop', { nrm: 1.2 }, (u, v, p) => {
    const c0 = cells(u, v, 4, 1211, 0.5), seam = 1 - smooth(0.0, 0.05, c0.d2 - c0.d1), n = fbm(u, v, 5, 3, 1213);
    p.c = mul(mix3(hex('#2a2a30'), hex('#45444b'), n * 0.6 + c0.id * 0.4), 1 - seam * 0.5); p.h = 1 - seam; p.r = 0.85;
  });
  T('ash', { nrm: 0.6 }, (u, v, p) => {
    const n = fbm(u, v, 4, 3, 1221), g = h2(Math.floor(u * 128), Math.floor(v * 128), 1223);
    const drift = fbm(u, v, 9, 2, 1225);
    let c = mix3(hex('#6f6c69'), hex('#9a9692'), n * 0.75 + drift * 0.25);
    if (g > 0.97) c = hex('#2b2a2c'); else if (g < 0.02) c = hex('#b9b3aa');
    p.c = mul(c, 0.94 + g * 0.08); p.h = drift * 0.4 + n * 0.3; p.r = 0.98;
  });
  T('lava', { nrm: 0.9 }, (u, v, p) => {
    // molten rock: bright runs that wind between darker, cooling skins
    const w = fbm(u + fbm(u, v, 3, 2, 1235) * 0.25, v, 3, 3, 1231), run = 1 - smooth(0.0, 0.09, Math.abs(w - 0.5));
    const n = fbm(u, v, 6, 3, 1233), skin = smooth(0.5, 0.72, n) * (1 - run);
    const hot = mix3(hex('#ff4a0c'), hex('#ffb83a'), run * 0.8 + (1 - n) * 0.2);
    p.c = mix3(hot, mix3(hex('#5a1608'), hex('#8a2a0c'), n), skin * 0.85); p.h = 1 - skin; p.r = 0.6;
  });
  T('redRock', { nrm: 1.1 }, (u, v, p) => {
    const w = v + fbm(u, v, 3, 2, 1241) * 0.08, band = Math.floor(w * 6), tt = mod(w * 6, 1);
    const cols = ['#a4492c', '#c06a3a', '#8a3a26', '#d08a52', '#b25a34', '#7a3424'];
    let c = mul(hex(cols[mod(band, 6)]), 0.9 + fbm(u, v, 6, 3, 1243) * 0.2);
    const groove = 1 - smooth(0, 0.07, tt);
    c = mul(c, 1 - groove * 0.25);
    p.c = c; p.h = 1 - groove; p.r = 0.95;
  });
  T('redRockTop', { nrm: 0.8 }, (u, v, p) => {
    const n = fbm(u, v, 5, 3, 1251), c0 = cells(u, v, 5, 1253);
    p.c = mul(mix3(hex('#a8502e'), hex('#c87444'), n), 0.92 + smooth(0, 0.1, c0.d2 - c0.d1) * 0.1); p.h = smooth(0, 0.1, c0.d2 - c0.d1); p.r = 0.95;
  });
  T('amber', { nrm: 1.2 }, (u, v, p) => {
    // grey rock with a few drops of amber, one with a tiny dark insect caught inside
    const r = rock(u, v, 1261, '#6f6a62', '#948e84');
    const c0 = cells(u, v, 3, 1263, 0.7), drop = 1 - smooth(0.16, 0.24, c0.d1);
    if (drop > 0 && c0.id > 0.25) {
      const lit = 1 - smooth(0.0, 0.2, c0.d1);
      let c = mix3(hex('#c8701a'), hex('#ffc650'), lit);
      const bug = c0.id > 0.7 && c0.d1 < 0.07;
      if (bug) c = hex('#3a2010');
      p.c = mix3(r.c, c, drop); p.h = 0.6 + drop * 0.4; p.r = 0.25;
    } else { p.c = r.c; p.h = r.h; p.r = 0.9; }
  });

  // ---------------------------------------------------------------- wood and leaves
  T('jungleBark', { nrm: 1.6 }, (u, v, p) => {
    const r = barkV(u, v, 1301, '#4a3a22', '#6e5a36');
    const moss = smooth(0.55, 0.75, fbm(u, v * 0.5, 4, 3, 1303));
    p.c = mix3(r.c, hex('#3f6a2a'), moss * 0.55); p.h = r.h; p.r = 0.95;
  });
  T('jungleRing', { nrm: 0.8 }, (u, v, p) => { const r = rings(u, v, 1311, '#a8804a', '#c9a064', '#4a3a22'); p.c = r.c; p.h = r.h; p.r = 0.9; });
  T('jungleLeaves', { cutout: true, nrm: 0.8 }, (u, v, p) => { const r = leafy(u, v, 1321, '#14501e', '#3e8a2a', 0.6); p.c = r.c; p.a = r.a; p.h = r.h; p.r = 0.8; });
  T('fernBark', { nrm: 1.6 }, (u, v, p) => {
    // the giant fern's trunk: overlapping scales where old fronds fell
    const c0 = cells(u, v * 0.6, 5, 1331, 0.5), sc = smooth(0.0, 0.12, c0.d2 - c0.d1), n = fbm(u, v, 5, 3, 1333);
    p.c = mul(mix3(hex('#4a3820'), hex('#7a6038'), n * 0.5 + c0.id * 0.5), 0.6 + sc * 0.5); p.h = sc; p.r = 0.95;
  });
  T('fernRing', { nrm: 0.8 }, (u, v, p) => { const r = rings(u, v, 1341, '#8a7040', '#b8955a', '#4a3820'); p.c = r.c; p.h = r.h; p.r = 0.9; });
  T('fernFrond', { cutout: true, nrm: 0.7 }, (u, v, p) => {
    // a mass of small narrow leaflets lying every way, lighter than the jungle's leaves, with gaps between them
    const c0 = cells(u, v * 2, 8, 1351, 0.95), c1 = cells(u * 2 + 0.3, v + 0.1, 8, 1355, 0.95);
    const leaf = Math.min(c0.d1 * 1.1, c1.d1 * 1.25), n = fbm(u, v, 5, 2, 1353);
    p.c = mul(mix3(hex('#3f8a26'), hex('#8cc24a'), clamp((1 - leaf) * 0.8 + n * 0.4 - 0.1)), mix(0.75, 1.08, 1 - smooth(0.15, 0.6, leaf)));
    p.a = leaf < 0.5 || n > 0.66 ? 1 : 0; p.h = 1 - leaf; p.r = 0.8;
  });

  // ---------------------------------------------------------------- plants (paths)
  D('vine', {}, (ctx) => {
    const rnd = R(1401);
    for (const x0 of [30, 64, 98]) {
      let x = x0 + (rnd() - 0.5) * 10;
      ctx.strokeStyle = '#3a6a26'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= S; y += 16) { x += (rnd() - 0.5) * 8; ctx.lineTo(x, y); }
      ctx.stroke();
      for (let y = 8; y < S; y += 13) {
        const sx = rnd() < 0.5 ? -1 : 1, cx = x0 + sx * 7 + (rnd() - 0.5) * 6;
        ctx.fillStyle = rnd() < 0.5 ? '#2f7a2a' : '#4f9a36';
        ctx.beginPath(); ctx.ellipse(cx, y, 7, 4.5, sx * 0.6, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
  D('fern', {}, (ctx) => {
    const rnd = R(1411);
    const frond = (x, y, a, len) => {
      const ex = x + Math.cos(a) * len, ey = y - Math.sin(a) * len;
      ctx.strokeStyle = '#3f7a26'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + ex) / 2, (y + ey) / 2 - 10, ex, ey); ctx.stroke();
      for (let i = 1; i < 10; i++) {
        const t = i / 10, px = mix(x, ex, t), py = mix(y, ey, t) - Math.sin(t * Math.PI) * 6, l = (1 - t) * 14 + 3;
        ctx.fillStyle = i % 2 ? '#4f9a2e' : '#6cb43e';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(px + Math.cos(a + s * 1.4) * l * 0.5, py - Math.sin(a + s * 1.4) * l * 0.5, l * 0.5, 2.6, -(a + s * 1.4), 0, Math.PI * 2); ctx.fill(); }
      }
    };
    for (const a of [0.5, 0.9, 1.35, 1.8, 2.25, 2.65]) frond(S / 2 + (rnd() - 0.5) * 8, S, a + (rnd() - 0.5) * 0.15, S * (0.42 + rnd() * 0.2));
  });
  D('bigLeaf', {}, (ctx) => {
    const rnd = R(1421);
    const leaf = (x, y, a, len, wid, col) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-a);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -wid, len, 0); ctx.quadraticCurveTo(len * 0.5, wid, 0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(200,230,140,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.95, 0); ctx.stroke();
      ctx.lineWidth = 1; for (let i = 1; i < 6; i++) { const px = len * i / 6; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px + len * 0.08, -wid * 0.6); ctx.moveTo(px, 0); ctx.lineTo(px + len * 0.08, wid * 0.6); ctx.stroke(); }
      ctx.restore();
    };
    ctx.strokeStyle = '#3a6a22'; ctx.lineWidth = 4;
    const stems = [[0.75, 0.62], [1.2, 0.8], [1.95, 0.7], [2.4, 0.55], [1.57, 0.9]];
    for (const [a, l] of stems) {
      const ex = S / 2 + Math.cos(a) * S * l * 0.45, ey = S - Math.sin(a) * S * l * 0.6;
      ctx.beginPath(); ctx.moveTo(S / 2, S); ctx.lineTo(ex, ey); ctx.stroke();
      leaf(ex, ey, a + (rnd() - 0.5) * 0.3, S * 0.34, S * 0.13, rnd() < 0.5 ? '#2a7a2c' : '#3f9436');
    }
  });
  D('horsetail', {}, (ctx) => {
    const rnd = R(1431);
    for (let i = 0; i < 9; i++) {
      const x = 14 + rnd() * (S - 28), h = S * (0.55 + rnd() * 0.4), lean = (rnd() - 0.5) * 14;
      ctx.strokeStyle = '#5a8a3a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(x, S); ctx.lineTo(x + lean, S - h); ctx.stroke();
      for (let y = S - 10; y > S - h + 8; y -= 9) {                      // the rings of thin needles
        const t = (S - y) / h, px = x + lean * t;
        ctx.strokeStyle = '#3f7028'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px - 8, y + 4); ctx.lineTo(px, y); ctx.lineTo(px + 8, y + 4); ctx.stroke();
        ctx.fillStyle = '#2c4a1e'; ctx.fillRect(px - 2, y - 1, 4, 2);
      }
      ctx.fillStyle = '#8a7a4a'; ctx.beginPath(); ctx.ellipse(x + lean, S - h, 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    blades(ctx, rnd, 6, ['#4f7a30', '#6a9a3a'], 0.2, 0.4, 2);
  });
  D('nest', {}, (ctx) => {
    const rnd = R(1441);
    // a ring of twigs on the ground with three speckled eggs in it
    const cy = S * 0.82;
    for (let i = 0; i < 60; i++) {
      const a = rnd() * Math.PI, r = S * (0.3 + rnd() * 0.14), x = S / 2 + Math.cos(a) * r * (rnd() < 0.5 ? 1 : -1), y = cy + Math.sin(a) * 10 - rnd() * 10;
      ctx.strokeStyle = rnd() < 0.5 ? '#7a5a30' : '#a07a44'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 9, y + (rnd() - 0.5) * 6); ctx.lineTo(x + 9, y + (rnd() - 0.5) * 6); ctx.stroke();
    }
    for (const [x, sc] of [[S * 0.36, 1], [S * 0.53, 1.12], [S * 0.68, 0.95]]) {
      const ex = x, ey = cy - 26 * sc;
      ctx.fillStyle = '#efe6cf'; ctx.beginPath(); ctx.ellipse(ex, ey, 13 * sc, 19 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(ex - 4 * sc, ey - 7 * sc, 4 * sc, 6 * sc, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a6a3a'; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(ex + (rnd() - 0.5) * 16 * sc, ey + (rnd() - 0.4) * 22 * sc, 1.8, 0, Math.PI * 2); ctx.fill(); }
    }
    for (let i = 0; i < 40; i++) {
      const x = S * 0.22 + rnd() * S * 0.56, y = cy + rnd() * 12 - 4;
      ctx.strokeStyle = rnd() < 0.5 ? '#6a4a26' : '#94703c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y + (rnd() - 0.5) * 5); ctx.stroke();
    }
  });
}
