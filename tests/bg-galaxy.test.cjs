'use strict';
/* v-bg-galaxy (فيديو المالك ٢٨ سبتمبر «اريد تضيف هذي في خاصية الألوان والمظاهر خلفية ٣ الابعاد»): مجرّة لا نهائيّة —
   حقل نجوم ثلاثيّ الأبعاد يطير نحوك من مركز الشاشة، مبنيّ بالرسم لا بالفيديو (الفيديو تسجيل شاشة بواجهة تطبيق آخر
   لخلفيّة شخص آخر)، ومضبوط على قياسات الفيديو: الكثافة وخليط السطوع وسرعة الطيران وبلا دوران. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ui = fs.readFileSync(path.join(__dirname, '..', 'js/app-05-ui.js'), 'utf8');

/* لوحة وهميّة: ImageData حقيقيّ الذاكرة، وputImageData يحفظ آخر إطار */
function fakeCanvas(){
  const canvas = { width: 0, height: 0, style: {}, last: null, ctxOpts: null };
  const ctx = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img) => { canvas.last = { w: img.width, h: img.height, data: Uint8ClampedArray.from(img.data) }; },
  };
  canvas.getContext = (type, opts) => { canvas.ctxOpts = opts || null; return ctx; };
  return canvas;
}
function loadGalaxy(touch){
  const a = ui.indexOf('function bg3dGalaxy('), b = ui.indexOf('function initCustomBg3D(');
  assert.ok(a > 0 && b > a, 'bg3dGalaxy قبل initCustomBg3D');
  const window = { matchMedia: (q) => ({ matches: !!touch && /coarse/.test(q) }) };
  const ctx = { window, performance, Math, Float32Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Uint8ClampedArray };
  vm.createContext(ctx);
  vm.runInContext(ui.slice(a, b) + ';this.G = bg3dGalaxy;', ctx);
  return ctx.G;
}
const DARK = () => ({ light: false, galaxyBg: '#000000', galaxyStar: '255,255,255' });
const LIGHT = () => ({ light: true, galaxyBg: '#eef2f8', galaxyStar: '55,72,105' });
const gray = (f) => { const g = new Uint8Array(f.w * f.h); for(let i = 0; i < g.length; i++) g[i] = f.data[i * 4]; return g; };
function run(G, pal, w, h, dpr, ms){
  const c = fakeCanvas(), g = G(c, pal);
  g.resize(w, h, dpr);
  for(let t = 0; t <= ms; t += 33) g.draw(t);
  return { c, g };
}
function starsPerMP(f, bg){ /* عدد النقاط المضيئة (بكسل أسطع من الخلفيّة بـ40 وأسطع من جيرانه الأربعة) لكلّ ميغابكسل */
  const g = gray(f); let n = 0;
  for(let y = 1; y < f.h - 1; y++) for(let x = 1; x < f.w - 1; x++){
    const i = y * f.w + x, v = g[i];
    if(v > bg + 40 && v >= g[i - 1] && v > g[i + 1] && v >= g[i - f.w] && v > g[i + f.w]) n++;
  }
  return n / (f.w * f.h) * 1e6;
}
const median = (arr) => { const s = Array.from(arr).sort((p, q) => p - q); return s[s.length >> 1]; };

/* القائمة كما يقيّمها المتصفّح فعلًا (لا نصّها): مفتاح مكرّر في كائن يُسقط الأوّل بصمت */
function effects(){
  const a = ui.indexOf('const BG3D_EFFECTS = ['), b = ui.indexOf('const loadedScripts', a);
  const ctx = { lang: 'ar' };
  vm.createContext(ctx);
  vm.runInContext(ui.slice(a, b).replace('const BG3D_EFFECTS', 'this.E') + ';this.label = bgEffLabel;', ctx);
  return ctx;
}

test('١. الخيار في قائمة الخلفيّات ثلاثيّة الأبعاد بالرسم اليدويّ، باسمه في اللغات الـ١٤ كما تُعرض، وبلا اسم مزوّد', () => {
  const ctx = effects(), E = ctx.E;
  const ids = E.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'معرّفات فريدة');
  assert.equal(ids[1], 'galaxy', 'أوّل الخيارات بعد «بدون خلفية» — طلب المالك الأحدث');
  const g = E.find((e) => e.id === 'galaxy');
  assert.equal(g.lib, 'custom');
  assert.equal(g.ar, 'مجرّة لا نهائية');
  const seen = new Set();
  for(const l of ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ne', 'es', 'zh', 'fil', 'id', 'ml', 'ru', 'tr']){
    ctx.lang = l;
    const t = ctx.label(g);
    assert.ok(t && t !== 'galaxy' && (l === 'en' || t !== g.en), l + ': ' + t);
    assert.doesNotMatch(t, /Claude|Gemini|GPT|Groq|OpenAI|كلود|جيمناي/i);
    seen.add(t);
  }
  assert.equal(seen.size, 14, 'اسم مستقلّ لكلّ لغة');
  /* الإندونيسيّة لا تعرض معرّفًا خامًّا لأيّ خيار (كان eff['id'] = 'net'…) */
  ctx.lang = 'id';
  for(const e of E) assert.notEqual(ctx.label(e), e.id, e.id);
});

test('٢. الربط: فرع المجرّة قبل السياق والتحجيم العامّين، ومستمع التحجيم مسجَّل ليزيله destroyBg3D، واللوحة من bg3dPalette', () => {
  const f = ui.slice(ui.indexOf('function initCustomBg3D('), ui.indexOf('function getBg3DAccentColorHex('));
  const br = f.indexOf("if(id === 'galaxy'){"), ctx2d = f.indexOf("const ctx = canvas.getContext('2d');"), rs = f.indexOf('resize();');
  assert.ok(br > 0 && br < ctx2d && br < rs, 'الفرع قبل getContext العامّ وقبل resize العامّ');
  const body = f.slice(br, ctx2d);
  assert.match(body, /bg3dGalaxy\(canvas, bg3dPalette\)/);
  assert.match(body, /currentCustomBg = \{ raf: null, resizeHandler: onResize, canvas \}/);
  assert.match(body, /window\.addEventListener\('resize', onResize\)/);
  assert.match(body, /G\.draw\(ts\)/);
  assert.match(body, /return;\s*\}\s*$/);
  const pal = ui.slice(ui.indexOf('function bg3dPalette('), ui.indexOf('const BG3D_LIGHT_EXTRA'));
  assert.equal((pal.match(/galaxyBg:'#[0-9a-f]{6}', galaxyStar:'\d+,\d+,\d+'/g) || []).length, 2, 'مفتاحا المجرّة في الوضعين');
});

test('٣. الشكل كالفيديو: سواد شبه تامّ ونجوم كثيفة (الفيديو ≈٨٠٠٠ نجم لكلّ ميغابكسل) بلا لون', () => {
  const G = loadGalaxy(false);
  const { c } = run(G, DARK, 564, 890, 1, 6000);
  assert.equal(c.width, 564); assert.equal(c.height, 890);
  assert.equal(c.ctxOpts && c.ctxOpts.alpha, false, 'سياق بلا شفافيّة');
  const f = c.last, bg = median(gray(f));
  assert.ok(bg >= 2 && bg <= 8, 'الخلفيّة ' + bg + ' (الفيديو 4)');
  const d = starsPerMP(f, bg);
  assert.ok(d > 5000 && d < 12000, 'كثافة ' + Math.round(d));
  let bright = 0; for(let i = 0; i < f.data.length; i += 4){ assert.equal(f.data[i], f.data[i + 2], 'بيضاء بلا صبغة'); if(f.data[i] > 150) bright++; }
  assert.ok(bright > 50, 'نجوم ساطعة موجودة');
});

test('٤. الطيران للأمام من المركز: الإطار اللاحق مصغَّرًا حول المركز يطابق السابق أكثر من نفسه، وبمعدّل الفيديو (≈0.24/ث)', () => {
  const G = loadGalaxy(false);
  const c = fakeCanvas(), g = G(c, DARK);
  g.resize(564, 890, 1);
  for(let t = 0; t <= 6000; t += 33) g.draw(t);
  const A = gray(c.last);
  for(let t = 6033; t <= 6400; t += 33) g.draw(t);
  g.draw(6400);
  const B = gray(c.last), W = 564, H = 890, cx = W / 2, cy = H / 2, dt = 0.4 - (6000 % 33) / 1000;
  const corr = (s) => { /* يقارن A بـB بعد إرجاعه بالمقياس s حول المركز، على حلقة بعيدة عن المركز */
    let sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0, n = 0;
    for(let y = 0; y < H; y += 1) for(let x = 0; x < W; x += 1){
      const r = Math.hypot(x - cx, y - cy); if(r < 120 || r > 400) continue;
      const bx = Math.round(cx + (x - cx) * s), by = Math.round(cy + (y - cy) * s);
      if(bx < 0 || by < 0 || bx >= W || by >= H) continue;
      const a = A[y * W + x], b = B[by * W + bx];
      sa += a; sb += b; sab += a * b; saa += a * a; sbb += b * b; n++;
    }
    return (sab - sa * sb / n) / Math.sqrt((saa - sa * sa / n) * (sbb - sb * sb / n));
  };
  let best = 1, bestC = -1;
  for(let s = 1; s <= 1.2001; s += 0.01){ const v = corr(s); if(v > bestC){ bestC = v; best = s; } }
  assert.ok(bestC > corr(1) + 0.1, 'الحركة شعاعيّة للخارج: ' + bestC.toFixed(3) + ' مقابل ' + corr(1).toFixed(3));
  const rate = Math.log(best) / dt;
  assert.ok(rate > 0.12 && rate < 0.4, 'معدّل الطيران ' + rate.toFixed(3) + '/ث');
});

test('٥. الوضع الفاتح: خلفيّة فاتحة ونجوم داكنة، واللوحة تُقرأ كلّ إطار (قلب الوضع حيًّا)', () => {
  const G = loadGalaxy(false);
  let mode = 'light';
  const c = fakeCanvas(), g = G(c, () => (mode === 'light' ? LIGHT() : DARK()));
  g.resize(400, 600, 1);
  for(let t = 0; t <= 3000; t += 33) g.draw(t);
  let f = c.last, bgL = median(gray(f));
  assert.equal(bgL, 0xee, 'خلفيّة #eef2f8');
  let darker = 0; for(let i = 0; i < f.data.length; i += 4) if(f.data[i] < 0xee - 40) darker++;
  assert.ok(darker > 100, 'نجوم داكنة على الفاتح');
  mode = 'dark';
  g.draw(3033); g.draw(3066);
  assert.ok(median(gray(c.last)) < 10, 'انقلب إلى الداكن في الإطار التالي');
  /* لوحة بلا مفاتيح المجرّة → ألوان الوضع الاحتياطيّة لا سواد في الفاتح */
  const c2 = fakeCanvas(), g2 = G(c2, () => ({ light: true }));
  g2.resize(200, 200, 1); g2.draw(0); g2.draw(33);
  assert.equal(median(gray(c2.last)), 0xee);
});

test('٦. المتانة: أحجام شاذّة، سقف البكسلات، قفزة زمن بعد تبويب مخفيّ، ولوحة المفاتيح على اللمس لا تعيد البذر', () => {
  const G = loadGalaxy(false);
  const c = fakeCanvas(), g = G(c, DARK);
  g.resize(1, 1, 1); g.draw(0); g.draw(16);
  g.resize(5000, 3000, 2); g.draw(1e7); g.draw(1e7 + 33);
  assert.ok(c.width * c.height <= 4.3e6, 'سقف البكسلات ' + c.width + 'x' + c.height);
  assert.equal(c.style.width, '5000px');
  g.resize(1920, 1080, 1);
  for(let t = 2e7; t <= 2e7 + 400; t += 33) g.draw(t);
  const d = starsPerMP(c.last, median(gray(c.last)));
  assert.ok(d > 5000 && d < 12000, 'الكثافة ثابتة بعد القفزة ' + Math.round(d));
  /* جوّال: شبكة الفيديو (الضلع الأقصر ≥564 بكسل، ≤2 لكلّ بكسل CSS) */
  const T = loadGalaxy(true), pc = fakeCanvas(), pg = T(pc, DARK);
  pg.resize(412, 915, 2.625);
  assert.deepEqual([pc.width, pc.height], [564, 1253]);
  pg.draw(0); pg.draw(40);
  pg.resize(412, 560, 2.625);
  assert.deepEqual([pc.width, pc.height], [564, 1253], 'فتح لوحة المفاتيح لا يغيّر شيئًا');
  assert.equal(pc.style.height, '915px');
});
