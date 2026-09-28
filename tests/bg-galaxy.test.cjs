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
  const canvas = { width: 0, height: 0, style: {}, last: null, ctxOpts: null, puts: 0 };
  const ctx = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img) => { canvas.puts++; canvas.last = { w: img.width, h: img.height, data: Uint8ClampedArray.from(img.data) }; },
  };
  canvas.getContext = (type, opts) => { canvas.ctxOpts = opts || null; return ctx; };
  return canvas;
}
/* doc.activeElement يحاكي حقل الكتابة المركَّز (لوحة المفاتيح) */
function loadGalaxy(touch, doc){
  const a = ui.indexOf('function bg3dGalaxy('), b = ui.indexOf('function initCustomBg3D(');
  assert.ok(a > 0 && b > a, 'bg3dGalaxy قبل initCustomBg3D');
  const window = { matchMedia: (q) => ({ matches: !!touch && /coarse/.test(q) }) };
  const ctx = { window, document: doc || { activeElement: null }, performance, Math, Float32Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Uint8ClampedArray };
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

/* معدّل الطيران: إطار A عند tA وB عند tB، ثمّ أيّ مقياس حول المركز يُرجع B إلى A (ترابط على حلقة بعيدة عن المركز) */
function flight(step){
  const G = loadGalaxy(false);
  const c = fakeCanvas(), g = G(c, DARK);
  g.resize(564, 890, 1);
  let t = 0, tA = 0;
  for(; t <= 6000; t += step) g.draw(t);
  tA = t - step; const A = gray(c.last);
  for(; t <= 6400; t += step) g.draw(t);
  const tB = t - step, B = gray(c.last), W = 564, H = 890, cx = W / 2, cy = H / 2, dt = (tB - tA) / 1000;
  const corr = (sc) => {
    let sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0, n = 0;
    for(let y = 0; y < H; y += 1) for(let x = 0; x < W; x += 1){
      const r = Math.hypot(x - cx, y - cy); if(r < 120 || r > 400) continue;
      const bx = Math.round(cx + (x - cx) * sc), by = Math.round(cy + (y - cy) * sc);
      if(bx < 0 || by < 0 || bx >= W || by >= H) continue;
      const a = A[y * W + x], b = B[by * W + bx];
      sa += a; sb += b; sab += a * b; saa += a * a; sbb += b * b; n++;
    }
    return (sab - sa * sb / n) / Math.sqrt((saa - sa * sa / n) * (sbb - sb * sb / n));
  };
  let best = 1, bestC = -1;
  for(let sc = 1; sc <= 1.2001; sc += 0.005){ const v = corr(sc); if(v > bestC){ bestC = v; best = sc; } }
  return { gain: bestC - corr(1), rate: Math.log(best) / dt };
}

test('٤. الطيران للأمام من المركز بمعدّل الفيديو (≈0.24/ث)، بالزمن لا بعدد الإطارات (30 و60 إطارًا/ث سواء)', () => {
  const r30 = flight(33), r60 = flight(1000 / 60);
  assert.ok(r30.gain > 0.1, 'الحركة شعاعيّة للخارج: كسب الترابط ' + r30.gain.toFixed(3));
  assert.ok(r30.rate > 0.18 && r30.rate < 0.32, 'معدّل الطيران عند 30 إطارًا/ث ' + r30.rate.toFixed(3) + '/ث');
  assert.ok(r60.rate > 0.18 && r60.rate < 0.32, 'معدّل الطيران عند 60 إطارًا/ث ' + r60.rate.toFixed(3) + '/ث');
  assert.ok(Math.abs(r60.rate - r30.rate) < 0.05, 'المعدّل لا يتبع عدد الإطارات');
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

test('٦. المتانة: أحجام شاذّة، سقف البكسلات، وقفزة زمن بعد تبويب مخفيّ محصورة في الإطار نفسه', () => {
  const G = loadGalaxy(false);
  const c = fakeCanvas(), g = G(c, DARK);
  g.resize(1, 1, 1); g.draw(0); g.draw(16);
  g.resize(5000, 3000, 2); g.draw(1e7); g.draw(1e7 + 33);
  assert.ok(c.width * c.height <= 4.3e6, 'سقف البكسلات ' + c.width + 'x' + c.height);
  assert.equal(c.style.width, '5000px');
  /* القفزة بلا تحجيم بينهما: الإطار الأوّل بعد دقيقة غياب والتالي له بالكثافة نفسها (بلا حصر dt تهرب النجوم كلّها) */
  const c2 = fakeCanvas(), g2 = G(c2, DARK);
  g2.resize(564, 890, 1);
  let t = 0; for(; t <= 3000; t += 33) g2.draw(t);
  for(const j of [60000, 60066]){
    g2.draw(t + j);
    const d = starsPerMP(c2.last, median(gray(c2.last)));
    assert.ok(d > 5000 && d < 12000, 'الكثافة بعد القفزة +' + j + ': ' + Math.round(d));
  }
});

test('٧. التحجيم: لوحة المفاتيح لا تعيد البذر، وتقسيم الشاشة يُحجَّم، والحاسوب يبقي النجوم في مواضعها، ولا إطار أسود بعد الدوران', () => {
  const TEXTAREA = { activeElement: { tagName: 'TEXTAREA' } };
  /* جوّال: شبكة الفيديو (الضلع الأقصر ≥564 بكسل، ≤2 لكلّ بكسل CSS) */
  const drive = (G, kb) => {
    const pc = fakeCanvas(), pg = G(pc, DARK);
    pg.resize(412, 915, 2.625);
    assert.deepEqual([pc.width, pc.height], [564, 1253]);
    for(let t = 0; t <= 2000; t += 33){ if(kb && t === 990) pg.resize(412, 560, 2.625); if(kb && t === 1485) pg.resize(412, 915, 2.625); pg.draw(t); }
    return pc;
  };
  const ctrl = drive(loadGalaxy(true, TEXTAREA), false), kb = drive(loadGalaxy(true, TEXTAREA), true);
  assert.deepEqual([kb.width, kb.height, kb.style.height], [564, 1253, '915px'], 'فتح لوحة المفاتيح لا يغيّر اللوحة');
  assert.ok(Buffer.from(kb.last.data).equals(Buffer.from(ctrl.last.data)), 'ولا يعيد البذر: الإطار مطابق لمن لم تُفتح له لوحة');
  /* بلا حقل مركَّز: قصر الارتفاع تقسيمُ شاشة لا لوحة مفاتيح — يُحجَّم ويعود مركز الطيران إلى الوسط */
  const S = loadGalaxy(true, { activeElement: null }), sc = fakeCanvas(), sg = S(sc, DARK);
  sg.resize(412, 915, 2.625); sg.draw(0);
  sg.resize(412, 450, 2.625);
  assert.equal(sc.style.height, '450px');
  assert.deepEqual([sc.width, sc.height], [564, 616]);
  /* الدوران على اللمس (إيقاع 30/ث عند 60 هرتز): الإطار التالي للتحجيم يُرسم حتمًا — اللوحة المعاد تحجيمها سوداء */
  const R = loadGalaxy(true), rc = fakeCanvas(), rg = R(rc, LIGHT);
  rg.resize(400, 860, 2); let t = 0;
  for(; t <= 1000; t += 1000 / 60) rg.draw(t);
  assert.ok(rc.puts > 20 && rc.puts < 40, 'اللمس بنصف المعدّل: ' + rc.puts + ' إطارًا في ثانية');
  rg.resize(860, 400, 2);
  for(let k = 0; k < 3; k++){ const p0 = rc.puts; rg.draw(t); t += 1000 / 60; if(k === 0) assert.equal(rc.puts, p0 + 1, 'الإطار الأوّل بعد الدوران يُرسم'); }
  assert.deepEqual([rc.last.w, rc.last.h], [rc.width, rc.height]);
  /* الحاسوب: توسيع النافذة يبقي كلّ نجم في موضعه، والمساحة الجديدة بكثافة الحالة المستقرّة فورًا */
  const D = loadGalaxy(false), dc = fakeCanvas(), dg = D(dc, DARK);
  dg.resize(1280, 720, 1);
  for(t = 0; t <= 3000; t += 33) dg.draw(t);
  const tl = t - 33, A = gray(dc.last);
  dg.resize(1300, 720, 1); dg.draw(tl);
  const B = gray(dc.last);
  let same = 0, tot = 0;
  for(let y = 20; y < 700; y++) for(let x = 20; x < 1260; x++){ const a = A[y * 1280 + x], b = B[y * 1300 + x]; if(a > 40 || b > 40){ tot++; if(Math.abs(a - b) <= 2) same++; } }
  assert.ok(same / tot > 0.98, 'النجوم في مواضعها بعد التوسيع: ' + (same / tot).toFixed(3));
  dg.resize(1920, 1080, 1); dg.draw(tl);
  const F = dc.last, g8 = gray(F), sub = (x0, x1, y0, y1) => { const w = x1 - x0, h = y1 - y0, d = new Uint8ClampedArray(w * h * 4); for(let y = 0; y < h; y++) for(let x = 0; x < w; x++) d[(y * w + x) * 4] = g8[(y + y0) * F.w + x + x0]; return { w, h, data: d }; };
  const dNew = starsPerMP(sub(1340, 1920, 0, 1080), 4), dOld = starsPerMP(sub(0, 1280, 0, 720), 4);
  assert.ok(dNew > 5000 && dNew < 12000, 'المساحة الجديدة ' + Math.round(dNew));
  assert.ok(dOld > 5000, 'القديمة ' + Math.round(dOld));
});
