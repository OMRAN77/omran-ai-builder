// tests/inspire.test.cjs — v-inspire (٩ أكتوبر ٢٠٢٦): «اقتراحات» صارت شاشة بتبويبين («الإلهام» و«اقتراحات سريعة»)،
// وقسم «مدينتك الحقيقيّة» عشر تجارب ثلاثيّة الأبعاد على حيّ المستخدم الحقيقيّ تنفتح مشروعًا بلا موديل.
// يفحص: البيانات بالـ١٤ لغة، وجود كلّ تجربة وصورتها، أنّ المبنيّ مطابق لمصدره، رياضيّات النواة، وربط الزرّ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const LANGS = ['ar','en','fr','hi','ur','bn','ne','ml','fil','id','zh','ru','tr','es'];
const KEYS = ['inspTabInspire','inspTabQuick','inspCityTitle','inspCitySub','inspLoading','inspFail'];
const EMOJI = /[\u{1F300}-\u{1FAFF}☀-➿️]/u;
const VENDORS = /claude|anthropic|gemini|openai|\bgpt\b|grok|groq|mistral|deepseek|cohere|kimi|perplexity|llama|qwen|كلود|جيمناي|غروك|جروك/i;

function loadCity(){
  const src = rd('js/app-35-inspire.js');
  const start = src.indexOf('const INSPIRE_CITY');
  const end = src.indexOf('(function(){');
  assert.ok(start >= 0 && end > start, 'كتلة INSPIRE_CITY موجودة');
  const ctx = {};
  vm.runInNewContext(src.slice(start, end) + '\nthis.C = INSPIRE_CITY;', ctx);
  return { C: ctx.C, src };
}

function loadCore(){
  const ctx = { window: {}, document: { documentElement: { lang: 'ar' } }, navigator: { language: 'ar' }, localStorage: null, console };
  vm.runInNewContext(rd('inspire/src/core.js'), ctx);
  return ctx.window.CityKit;
}

test('عشر تجارب بمعرّفات فريدة، وكلّ عنوان ووصف بالـ١٤ لغة بلا رموز تعبيريّة ولا اسم مزوّد', () => {
  const { C } = loadCity();
  assert.equal(C.length, 10);
  assert.equal(new Set(C.map((c) => c.id)).size, 10);
  for (const c of C) {
    assert.match(c.id, /^[a-z]+$/);
    for (const l of LANGS) {
      for (const f of ['t', 'd']) {
        const s = c[f] && c[f][l];
        assert.ok(s && s.trim(), `${c.id}.${f}.${l} ناقص`);
        assert.doesNotMatch(s, EMOJI, `${c.id}.${f}.${l} فيه رمز تعبيريّ`);
        assert.doesNotMatch(s, VENDORS, `${c.id}.${f}.${l} فيه اسم مزوّد`);
      }
    }
  }
});

test('لكلّ تجربة ملفّ مبنيّ يحمل النواة وthree@0.160.0، وصورة بطاقة JPEG بمقاس ٦٠٠×٣٦٠', () => {
  const { C } = loadCity();
  for (const c of C) {
    const html = rd(`inspire/city/${c.id}.html`);
    assert.ok(html.includes('window.CityKit = CK'), `${c.id}: النواة غير ملصوقة`);
    assert.ok(!html.includes('<!--CITYKIT-->'), `${c.id}: علامة اللصق باقية`);
    assert.match(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/build\/three\.min\.js/);
    assert.match(html, /<html\b[^>]*>/i, `${c.id}: وسم html مطلوب لتمرير لغة التطبيق`);
    assert.doesNotMatch(html, /type=["']module["']/, `${c.id}: لا وحدات ES`);
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)/g)].map((m) => m[1]);
    assert.deepEqual(scripts, ['https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js'], `${c.id}: سكربت خارجيّ زائد`);
    const jpg = fs.readFileSync(path.join(root, `assets/inspire/city/${c.id}.jpg`));
    assert.equal(jpg[0], 0xff); assert.equal(jpg[1], 0xd8, `${c.id}: ليست JPEG`);
    let i = 2, size = null;
    while (i < jpg.length) {
      if (jpg[i] !== 0xff) break;
      const m = jpg[i + 1], len = jpg.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xc3) { size = [jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)]; break; }
      i += 2 + len;
    }
    assert.deepEqual(size, [600, 360], `${c.id}: مقاس الصورة`);
    assert.ok(jpg.length < 120 * 1024, `${c.id}: الصورة أثقل من ١٢٠ ك.ب`);
  }
});

test('الملفّات المبنيّة مطابقة لمصادرها (build.mjs --check)', () => {
  const r = spawnSync(process.execPath, ['scripts/inspire/build.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('النواة: الإسقاط والارتفاعات من وسوم الخريطة وترتيب المباني', async () => {
  const CK = loadCore();
  const { makeFixture } = await import(path.join(root, 'scripts/inspire/fixture.mjs'));
  const osm = makeFixture(24.699, 46.685, 600);
  const d = CK.parse(osm, 24.699, 46.685);
  assert.ok(d.buildings.length > 100, 'مبانٍ من الخريطة');
  assert.ok(d.roads.length > 10, 'طرق');
  assert.ok(d.water.length >= 1, 'ماء');
  for (let i = 1; i < d.buildings.length; i++) assert.ok(d.buildings[i - 1].h >= d.buildings[i].h, 'الأعلى أوّلًا');
  // متر شرقًا = (Δlon × cos(lat) × 111320): نقطة على بعد 0.001° شرقًا ≈ 101 م في الرياض
  const one = CK.parse({ elements: [{ type: 'way', id: 1, tags: { highway: 'primary' }, geometry: [{ lat: 24.699, lon: 46.685 }, { lat: 24.698, lon: 46.686 }] }] }, 24.699, 46.685);
  const [x, z] = one.roads[0].pts[1];
  assert.ok(Math.abs(x - 101.1) < 0.5, 'شرقًا ' + x);
  assert.ok(Math.abs(z - 110.5) < 0.5, 'جنوبًا ' + z);
  const tags = (t) => CK.parse({ elements: [{ type: 'way', id: 7, tags: Object.assign({ building: 'yes' }, t), geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.0001 }, { lat: 0.0001, lon: 0.0001 }, { lat: 0.0001, lon: 0 }, { lat: 0, lon: 0 }] }] }, 0, 0).buildings[0].h;
  assert.equal(tags({ height: '120' }), 120);
  assert.equal(tags({ 'building:levels': '10' }), 33);
});

test('النواة: خطّ الرؤية يحجبه مبنى أعلى ولا يحجبه مبنى أوطأ، والمكان داخل المضلّع', () => {
  const CK = loadCore();
  const sq = (x0, z0, s, h) => ({ id: 1, poly: [[x0, z0], [x0 + s, z0], [x0 + s, z0 + s], [x0, z0 + s]], h, box: [x0, z0, x0 + s, z0 + s] });
  const idx = CK.index({ buildings: [sq(40, -10, 20, 50)] });
  assert.ok(idx.at(50, 0), 'النقطة داخل المبنى');
  assert.equal(idx.at(10, 0), null);
  assert.equal(idx.heightAt(50, 0), 50);
  assert.equal(idx.los({ x: 0, y: 2, z: 0 }, { x: 100, y: 2, z: 0 }), false, 'محجوب على مستوى الشارع');
  assert.equal(idx.los({ x: 0, y: 80, z: 0 }, { x: 100, y: 80, z: 0 }), true, 'فوق المبنى مكشوف');
  assert.equal(idx.los({ x: 0, y: 2, z: 30 }, { x: 100, y: 2, z: 30 }), true, 'بجانبه مكشوف');
});

test('النواة: الشمس — ظهر الرياض في الانقلاب الصيفيّ عالية جنوبًا قليلًا، ومنتصف الليل تحت الأفق', () => {
  const CK = loadCore();
  // ٢١ يونيو ٢٠٢٦ — الظهر الشمسيّ في الرياض (٤٦.٦٨° شرقًا) قرابة ٠٨:٥٠ بتوقيت غرينتش
  const noon = CK.sunDir(24.699, 46.685, Date.UTC(2026, 5, 21, 8, 50));
  const deg = (r) => r * 180 / Math.PI;
  assert.ok(deg(noon.alt) > 86 && deg(noon.alt) < 90, 'الارتفاع ' + deg(noon.alt));
  const night = CK.sunDir(24.699, 46.685, Date.UTC(2026, 5, 20, 21, 0));
  assert.ok(night.alt < 0, 'منتصف الليل تحت الأفق');
  // الشتاء: الظهر منخفض وجنوبيّ (z موجب = جنوب)
  const w = CK.sunDir(24.699, 46.685, Date.UTC(2026, 11, 21, 9, 0));
  assert.ok(deg(w.alt) > 38 && deg(w.alt) < 45, 'ارتفاع الشتاء ' + deg(w.alt));
  assert.ok(w.z > 0, 'الشمس جنوبًا في الشتاء');
  const morning = CK.sunDir(24.699, 46.685, Date.UTC(2026, 2, 20, 4, 0));
  assert.ok(morning.x > 0, 'الصباح شرقًا');
});

test('زرّ «اقتراحات» يفتح الشاشة، والاقتراحات السريعة تمرّ بـ__runQuickSuggestion نفسها، والفتح بلا موديل', () => {
  const { src } = loadCity();
  assert.ok(rd('js/app-04-i18n-state.js').includes("if(typeof openInspireScreen === 'function') openInspireScreen(); else toggleQuickTemplates();"));
  assert.match(src, /__runQuickSuggestion\(list\[\+b\.dataset\.i\]\)/);
  assert.match(src, /fetch\('\/inspire\/city\/' \+ id \+ '\.html'/);
  assert.match(src, /code\.indexOf\(MARK\) === -1/, 'المجلوب يُتحقّق منه قبل أن يصير مشروعًا');
  const open = src.slice(src.indexOf('async function openInspireExperience'), src.indexOf('function openInspireScreen'));
  assert.doesNotMatch(open, /sendPrompt|callAI|\/api\//, 'لا نداء موديل عند الفتح');
  assert.match(open, /state\.projects\.push\(cur\)/);
  assert.doesNotMatch(src, EMOJI, 'لا رموز تعبيريّة في الشاشة');
  const b = rd('js/app.bundle.js');
  assert.ok(b.includes('const INSPIRE_CITY = ['), 'الوحدة في الحزمة');
});

test('النصوص الستّة بالـ١٤ لغة، ووسم تحميل اللغات مرفوع', () => {
  const data = rd('js/app-03-i18n-data.js');
  const ctx = { I18N: { ar: {}, en: {} } };
  const blk = data.slice(data.indexOf('/* v-inspire'), data.indexOf('/* v650 */'));
  vm.runInNewContext(blk, ctx);
  for (const l of ['ar', 'en']) for (const k of KEYS) assert.ok(ctx.I18N[l][k], `${l}: ${k}`);
  for (const l of LANGS.slice(2)) {
    const c = { I18N: {}, window: {}, document: { documentElement: {} }, localStorage: { getItem: () => null } }; c.I18N[l] = {}; c.window.I18N = c.I18N;
    vm.runInNewContext(rd(`i18n/${l}.js`), c);
    for (const k of KEYS) {
      assert.ok(c.I18N[l][k] && c.I18N[l][k].trim(), `${l}: ${k}`);
      assert.doesNotMatch(c.I18N[l][k], EMOJI);
    }
  }
  assert.ok(rd('js/app-04-i18n-state.js').includes("'i18n/' + lg + '.js?v=728'"));
});

test('مصادر التجارب لا تُنشر، والمبنيّ يُنشر', () => {
  const ig = rd('.vercelignore');
  assert.match(ig, /^inspire\/src\/$/m);
  assert.doesNotMatch(ig, /^inspire\/city/m);
  assert.match(ig, /^scripts\/$/m);
});

test('النواة لا تكتب بيانات الخرائط في localStorage (مشترك مع مشاريع المستخدم)، وتمسح «ck1:» القديم، وتعيد المنطقة من الذاكرة', async () => {
  const src = rd('inspire/src/core.js');
  // الاستثناء الوحيد: تفضيل واحد من بايت واحد (صور جوّيّة مفعّلة/لا) — لا بيانات خرائط
  assert.doesNotMatch(src.replace("localStorage.setItem('ck-imagery', v ? '1' : '0')", ''), /localStorage\.setItem/, 'لا كتابة في localStorage من النواة');
  const store = { 'ck1:25.0805,55.1403,600': 'x'.repeat(10), aiapp_projects: '[]' };
  const ls = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  let calls = 0;
  const fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ elements: [{ type: 'way', id: 1, tags: {}, geometry: [] }] }) }; };
  const ctx = { window: {}, document: { documentElement: { lang: 'ar' } }, navigator: { language: 'ar' }, localStorage: ls, fetch, AbortController, setTimeout, clearTimeout, console };
  vm.runInNewContext(src, ctx);
  const CK = ctx.window.CityKit;
  assert.deepEqual(Object.keys(store), ['aiapp_projects'], 'المفتاح القديم مُسح وبقيت مشاريع المستخدم');
  const a = await CK.fetchArea(25.0805, 55.1403, 600);
  const b = await CK.fetchArea(25.0805, 55.1403, 600);
  assert.equal(calls, 1, 'الطلب الثاني من الذاكرة');
  assert.equal(a, b);
  assert.deepEqual(Object.keys(store), ['aiapp_projects'], 'لا شيء جديد في localStorage');
});

test('مشروع التجربة بمعرّف p_ (يُرتَّب في أعلى السجلّ كالمشاريع الجديدة)، وصورته في السجلّ صورة البطاقة لا صفحة بيضاء', () => {
  const { src } = loadCity();
  assert.match(src, /id: 'p_' \+ Date\.now\(\)/);
  const app = rd('js/app-04-i18n-state.js');
  const fn = app.slice(app.indexOf('let __histThumbIO = null;'), app.indexOf('function renderHistory(){'));
  const mkEl = (tag) => ({ tagName: tag, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); }, querySelector(q) { return this.children.find((c) => c.tagName === q) || null; } });
  const sb = { String, document: { createElement: mkEl } };
  vm.createContext(sb);
  vm.runInContext(fn + '\nthis.lazy = __histThumbLazy;', sb);
  const th = mkEl('div');
  sb.lazy(th, { inspire: 'sun', code: '<html><body><script>x</script></body></html>' });
  assert.equal(th.children.length, 1);
  assert.equal(th.children[0].tagName, 'img');
  assert.equal(th.children[0].attrs.src, '/assets/inspire/city/sun.jpg?v=1');
  const th2 = mkEl('div');
  sb.lazy(th2, { inspire: '../x', code: '<h1>a</h1>' });
  assert.equal(th2.children[0].tagName, 'iframe', 'معرّف غير صالح ← المعاينة العاديّة');
});

/* ── v-inspire (٢): مراجعة ما بعد الدمج — سلوك يُشغَّل لا نصّ يُطابَق ── */
function loadModule(fetchImpl) {
  const src = rd('js/app-35-inspire.js');
  const state = { projects: [], currentId: null };
  const calls = { save: 0, render: 0 };
  const ctx = {
    lang: 'en', state, fetch: fetchImpl, console, setTimeout, clearTimeout,
    saveState: () => { calls.save++; }, renderAll: () => { calls.render++; }, switchWorkTab: () => {}, openDrawer: () => {}, workareaEl: { classList: { contains: () => true } },
    __swallow: () => {}, t: (k) => k, closeQuickTemplates: () => {}, QUICK_SUGGESTIONS: [], __quickSugLabel: () => '', __runQuickSuggestion: () => {},
    document: { getElementById: () => null, activeElement: null, head: { appendChild() {} }, createElement: () => ({ setAttribute() {}, addEventListener() {}, querySelector: () => null, classList: { add() {}, remove() {}, contains: () => false } }), body: { appendChild() {} } },
  };
  ctx.window = ctx; ctx.window.matchMedia = () => ({ matches: false });
  vm.runInNewContext(src, ctx);
  return { ctx, state, calls };
}
const okBody = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><script>window.CityKit = CK</script></body></html>';

test('فتح بطاقة: صفحة التطبيق بدل التجربة (احتياط العامل أوفلاين) تُرفض بلا مشروع، والصالحة مشروع واحد p_ بلغة التطبيق ووسمها', async () => {
  const bad = loadModule(async () => ({ ok: true, status: 200, text: async () => '<!doctype html><html><head></head><body>app</body></html>' }));
  assert.equal(await bad.ctx.openInspireExperience('sun'), false);
  assert.equal(bad.state.projects.length, 0);
  const good = loadModule(async () => ({ ok: true, status: 200, text: async () => okBody }));
  assert.equal(await good.ctx.openInspireExperience('sun'), true);
  assert.equal(good.state.projects.length, 1);
  const p = good.state.projects[0];
  assert.match(p.id, /^p_\d+$/);
  assert.equal(good.state.currentId, p.id);
  assert.equal(p.inspire, 'sun');
  assert.match(p.code, /^<!doctype html><html lang="en" dir="ltr"><head><meta name="omran-inspire" content="sun">/);
  assert.equal(good.calls.save, 1);
});

test('نقرة ثانية أثناء التحميل لا تصنع مشروعًا ثانيًا، والإغلاق أثناء التحميل يلغي الفتح', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const m = loadModule(async () => { await gate; return { ok: true, status: 200, text: async () => okBody }; });
  const first = m.ctx.openInspireExperience('sun');
  assert.equal(await m.ctx.openInspireExperience('view'), false, 'الثانية مرفوضة');
  release(); assert.equal(await first, true);
  assert.equal(m.state.projects.length, 1);
  let rel2; const gate2 = new Promise((r) => { rel2 = r; });
  const m2 = loadModule(async () => { await gate2; return { ok: true, status: 200, text: async () => okBody }; });
  const p = m2.ctx.openInspireExperience('sun');
  m2.ctx.closeInspireScreen();
  rel2(); assert.equal(await p, false);
  assert.equal(m2.state.projects.length, 0, 'أُغلقت الشاشة: لا مشروع ولا قفز');
});

test('الشاشة في نظام السحب/Esc للتطبيق (تُغلق وحدها لا الأدوات تحتها)، ولا مستمع Esc خاصّ بها', () => {
  assert.match(rd('js/app-05-swipe-back.js'), /inspireScreen: 'inspireCloseBtn'/);
  const src = rd('js/app-35-inspire.js');
  assert.match(src, /id="inspireCloseBtn"/);
  assert.doesNotMatch(src, /'Escape'/);
  for (const { id } of loadCity().C) assert.ok(rd(`inspire/city/${id}.html`).startsWith('<!doctype html><html lang="ar" dir="rtl"><head>'), id + ': رأس ثابت لوسم اللغة والتجربة');
});

function coreCtx(fetchImpl) {
  const ctx = { window: {}, document: { documentElement: { lang: 'ar' } }, navigator: { language: 'ar' }, localStorage: null, fetch: fetchImpl, AbortController, setTimeout, clearTimeout, console };
  vm.runInNewContext(rd('inspire/src/core.js'), ctx);
  return ctx.window.CityKit;
}

test('النواة: خطأ Overpass بردّ 200 و«remark» يُجرَّب بعده المرآة التالية ولا يُخزَّن، والمنطقة الفارغة لا تُخزَّن', async () => {
  const replies = [{ elements: [], remark: 'runtime error: Query timed out in "query" at line 1 after 26 seconds.' }, { elements: [{ type: 'way', id: 1, tags: { highway: 'primary' }, geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }] }] }];
  let n = 0; const urls = [];
  const CK = coreCtx(async (u) => { urls.push(u); const j = replies[Math.min(n++, 1)]; return { ok: true, status: 200, json: async () => j }; });
  const a = await CK.fetchArea(10, 10, 600);
  assert.equal(a.elements.length, 1, 'الردّ الصالح من المرآة الثانية');
  assert.equal(urls[0], CK.OVERPASS[0]); assert.equal(urls[1], CK.OVERPASS[1]);
  let m = 0;
  const E = coreCtx(async () => { m++; return { ok: true, status: 200, json: async () => ({ elements: [] }) }; });
  await E.fetchArea(10, 10, 600); await E.fetchArea(10, 10, 600);
  assert.equal(m, 2, 'الفارغ يُطلب من جديد');
});

test('النواة: علاقات المباني تُخاط، الوصلات بنوع أصلها، track محفوظ، المظلّة ٤ م، وخطّ ١٨٠ يلتفّ', async () => {
  const CK = coreCtx();
  const { makeFixture } = await import(path.join(root, 'scripts/inspire/fixture.mjs'));
  const d = CK.parse(makeFixture(25.0805, 55.1403, 600), 25.0805, 55.1403);
  const mall = d.buildings.find((b) => b.name === 'المجمّع');
  assert.ok(mall && mall.poly.length === 4, 'المبنى من قطعتين خارجيّتين');
  assert.equal(Math.round(mall.h), 14);
  const link = d.roads.find((r) => r.link);
  assert.equal(link.kind, 'motorway'); assert.ok(Math.abs(link.w - 16 * 0.7) < 1e-9);
  const one = (tags, geom) => CK.parse({ elements: [{ type: 'way', id: 9, tags, geometry: geom }] }, 0, 0);
  assert.equal(one({ highway: 'track' }, [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }]).roads.length, 1);
  const sq = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.0001 }, { lat: 0.0001, lon: 0.0001 }, { lat: 0.0001, lon: 0 }, { lat: 0, lon: 0 }];
  assert.equal(one({ building: 'roof' }, sq).buildings[0].h, 4);
  const w = CK.parse({ elements: [{ type: 'way', id: 3, tags: { highway: 'primary' }, geometry: [{ lat: -16.8, lon: 179.999 }, { lat: -16.8, lon: -179.999 }] }] }, -16.8, 179.999);
  const x = w.roads[0].pts[1][0];
  assert.ok(x > 0 && x < 300, 'عبر خطّ ١٨٠ أمتار قليلة لا ٣٨ ألف كم: ' + x);
  assert.equal(JSON.stringify(CK.stitch([[[0, 0], [10, 0], [10, 10]], [[0, 0], [0, 10], [10, 10]]]).map((r) => r.length)), '[4]');
});

test('النواة: البحر من خطّ الساحل — يمين اتّجاه الخطّ ماء ويساره يابسة، في الاتّجاهات الأربعة', () => {
  const CK = coreCtx();
  const isSea = (coast, x, z) => CK.seaPolys(coast, 300, 20).some((p) => CK.inPoly(x, z, p));
  // شرقًا: الماء جنوبًا (z موجب)
  assert.equal(isSea([[[-400, 0], [400, 0]]], 0, 100), true); assert.equal(isSea([[[-400, 0], [400, 0]]], 0, -100), false);
  // غربًا: الماء شمالًا
  assert.equal(isSea([[[400, 0], [-400, 0]]], 0, -100), true); assert.equal(isSea([[[400, 0], [-400, 0]]], 0, 100), false);
  // شمالًا (z يتناقص): الماء شرقًا
  assert.equal(isSea([[[0, 400], [0, -400]]], 100, 0), true); assert.equal(isSea([[[0, 400], [0, -400]]], -100, 0), false);
  // زاوية (رأس مشترك): خليج مربّع — شرقًا ثمّ جنوبًا، الماء يمين الاثنين
  const corner = [[[-400, 0], [0, 0], [0, 400]]];
  assert.equal(isSea(corner, 100, -100), false, 'شمال شرق الزاوية يابسة'); assert.equal(isSea(corner, -100, 100), true, 'جنوب غرب الزاوية ماء');
  assert.equal(CK.seaPolys([], 300).length, 0);
});

test('النواة: المسطّحات (ماء/حدائق) هندسة واحدة لا شبكة لكلّ مضلّع، وسطر مصدر البيانات ظاهر، وإطار قبل onCity', () => {
  const src = rd('inspire/src/core.js');
  const pm = src.slice(src.indexOf('function polysMesh'), src.indexOf('// ── تحكّم الكاميرا'));
  assert.equal((pm.match(/new THREE\.Mesh\(/g) || []).length, 1, 'شبكة واحدة');
  assert.ok(pm.indexOf('new THREE.Mesh(') > pm.indexOf('if (pos.length)'), 'تُبنى بعد جمع كلّ المضلّعات');
  assert.match(src, /https:\/\/www\.openstreetmap\.org\/copyright/);
  assert.match(src, /مساهمو OpenStreetMap/);
  assert.ok(src.indexOf('setTimeout(r, 16)') < src.indexOf('await opt.onCity(ctx, city)'));
});

// ── v-inspire-ux (المالك ٩ أكتوبر: «تفتح كامل… والمحادثة تبقى وأقدر أحرّك السحب أكثر»، و«اللوحة تختفي بنقرة الشاشة كالنوافذ المنبثقة») ──
test('سقف سحب لوحة المعاينة يتّسع للنافذة (كان ٧٠٠ ثابتًا في ui-wiring)، والمحادثة تبقى ٣٢٠ فأكثر', () => {
  const src = rd('js/ui-wiring.js');
  assert.ok(!/rebindResizer\('resizer2', '#workarea', 240, 700,/.test(src), 'لا سقف ٧٠٠ ثابت');
  assert.match(src, /rebindResizer\('resizer2', '#workarea', 240, workMax, 'panelWidthWork'\)/);
  assert.match(src, /w = Math\.max\(min, Math\.min\(capOf\(\), w\)\)/, 'السحب يقرأ السقف حيًّا');
  assert.match(src, /sv <= capOf\(\)/, 'والمحفوظ يُفحص بالسقف نفسه');
  const m = src.match(/function workMax\(\)\{[\s\S]*?\n  \}/); assert.ok(m, 'workMax موجودة');
  const run = (w, sb) => { const c = { window: { innerWidth: w }, document: { getElementById: () => (sb == null ? null : { getBoundingClientRect: () => ({ width: sb }) }) } }; vm.runInNewContext(m[0] + '\nthis.f = workMax();', c); return c.f; };
  assert.equal(run(1535, 250), 905, 'نافذة ١٥٣٥ وقائمة ٢٥٠: يبقى للمحادثة ٣٢٠+');
  assert.equal(run(1535, 0), 1155, 'القائمة مطويّة: أوسع');
  assert.equal(run(900, 250), 700, 'النافذة الضيّقة: لا ينزل عن ٧٠٠ القديم');
  assert.equal(run(1535, null), 1155, 'بلا قائمة في الصفحة');
  assert.match(rd('index.html'), /\/js\/ui-wiring\.js\?v=660/, 'وسم الملفّ مرفوع كي لا يبقى سقف ٧٠٠ في كاش المتصفّح');
});

test('فتح تجربة «الإلهام» يوسّع اللوحة لسقفها دون تخزين، ولا يمسّ الجوّال، ويعيد العرض حين يُعرض مشروع آخر ما لم يحرّكه المستخدم', () => {
  const { src } = loadCity();
  const a = src.indexOf('let widened = null;'), b = src.indexOf('  try{\n    if(typeof renderCodeAndPreview');
  assert.ok(a > 0 && b > a, 'كتلة التوسيع موجودة');
  const mk = (o) => {
    const wa = { style: { width: o.style || '' }, getBoundingClientRect: () => ({ width: parseInt(wa.style.width, 10) || o.def || 380 }) };
    const ctx = { window: { innerWidth: o.inner || 1535, omranWorkMax: () => o.cap == null ? 905 : o.cap }, document: { documentElement: { classList: { contains: () => !!o.mobile } }, getElementById: (id) => (id === 'workarea' ? wa : null) }, __swallow() {} };
    vm.runInNewContext(src.slice(a, b) + '\nthis.F = { widenWork, restoreWork, isExp };', ctx);
    return { wa, F: ctx.F };
  };
  let t = mk({ style: '690px' });
  t.F.widenWork(); assert.equal(t.wa.style.width, '905px', 'يتّسع لسقفه');
  t.F.restoreWork(); assert.equal(t.wa.style.width, '690px', 'ويعود لما كان');
  t = mk({ style: '690px' });
  t.F.widenWork(); t.wa.style.width = '1000px'; t.F.restoreWork();
  assert.equal(t.wa.style.width, '1000px', 'سحبه المستخدم بعدها: لا يُمسّ');
  t = mk({ style: '690px' });
  t.F.widenWork(); t.F.widenWork(); t.F.restoreWork();
  assert.equal(t.wa.style.width, '690px', 'فتح تجربتين متتاليتين يحفظ العرض الأصليّ لا الموسَّع');
  t = mk({ style: '', def: 380 }); t.F.widenWork(); t.F.restoreWork();
  assert.equal(t.wa.style.width, '', 'العرض الافتراضيّ (بلا قيمة) يعود افتراضيًّا');
  t = mk({ style: '690px', mobile: true }); t.F.widenWork(); assert.equal(t.wa.style.width, '690px', 'الجوّال: لا تغيير');
  t = mk({ style: '690px', inner: 800 }); t.F.widenWork(); assert.equal(t.wa.style.width, '690px', 'النافذة الضيّقة: لا تغيير');
  t = mk({ style: '900px', cap: 905 }); t.F.widenWork(); assert.equal(t.wa.style.width, '900px', 'العرض قريب من السقف أصلًا: لا تغيير');
  assert.ok(t.F.isExp({ inspire: 'chase' }) && t.F.isExp({ code: '<head><meta name="omran-inspire" content="sun">' }) && !t.F.isExp({ code: '<html></html>' }) && !t.F.isExp(null));
  assert.ok(!/localStorage\.setItem\([^)]*panelWidthWork/.test(src), 'التوسيع لا يكتب في التخزين');
  assert.match(src, /widenWork\(\);\n/, 'يُستدعى بعد فتح المشروع');
});

test('لوحة التجربة نافذة منبثقة على الحاسوب فقط: زرّ يفتحها ويطويها، ونقرة الشاشة (لا السحب) تطويها في ألعاب القيادة، والجوّال كما كان', () => {
  const core = rd('inspire/src/core.js');
  const css = core.slice(core.indexOf('const CSS = `'), core.indexOf('CK.ui = function'));
  assert.match(css, /\.ck-toggle\{display:none;/, 'الزرّ مخفيّ افتراضيًّا (الجوّال)');
  const desk = css.slice(css.indexOf('@media (min-width:641px){'), css.indexOf('@media (max-width:640px)'));
  assert.ok(desk.includes('.ck-toggle{display:flex}') && desk.includes('.ck-ui.ck-off{opacity:0;') && desk.includes('visibility:hidden;pointer-events:none'), 'الطيّ والزرّ في قاعدة الحاسوب وحدها');
  assert.ok(!/@media \(max-width:640px\)\{[^}]*ck-off/.test(css), 'لا قاعدة طيّ للجوّال');
  assert.match(core, /box-sizing:border-box;width:min\(360px/, 'عرض اللوحة ٣٦٠ كلّه (كان ٣٩٠ بالحشو فيغطّي العدّاد)');
  assert.match(core, /aria-expanded/); assert.match(core, /setAttribute\('aria-controls', 'ckbox'\)/);
  assert.match(core, /show: \(\) => set\(true\), hide: \(\) => set\(false\), isOpen: \(\) => open/);
  assert.match(core, /if \(opt\.autoHide\)[\s\S]*Math\.hypot\(e\.clientX - dn\.x, e\.clientY - dn\.y\) < 6[\s\S]*ui\.hide\(\)/, 'نقرة قصيرة بلا سحب');
  const built = (id) => rd('inspire/city/' + id + '.html');
  for (const id of ['chase', 'drone']) assert.match(built(id), /autoHide: true/, id + ': ألعاب القيادة تطوي بنقرة الشاشة');
  for (const id of ['billboard', 'explore', 'fireworks', 'lights', 'noise', 'sun', 'tower', 'view', 'walkshade']) assert.ok(!/autoHide: true/.test(built(id).replace(/if \(opt\.autoHide\)/g, '')), id + ': أرقامها في اللوحة فلا تُطوى بنقرة');
  for (const id of ['billboard', 'chase', 'drone', 'explore', 'fireworks', 'lights', 'noise', 'sun', 'tower', 'view', 'walkshade']) assert.match(built(id), /ck-toggle\{display:none;/, id + ': النواة المضمّنة جديدة');
  assert.match(built('chase'), /if \(X && X\.ui && X\.ui\.hide\) X\.ui\.hide\(\);/, 'بدء السباق يطوي اللوحة');
  assert.match(built('tower'), /body\.tw-walk \.ck-ui,body\.tw-walk \.ck-toggle\{display:none\}/, 'وضع المشي: لا زرّ لوحة مخفيّة');
});

// ── v-inspire-imagery: صور جوّيّة بلا مفتاح على أرض المدينة وأسطح مبانيها (٧ تجارب نهاريّة) ──
test('الصور الجوّيّة: بلاطات XYZ تغطّي دائرة المدينة، مستطيلها بالأمتار المحلّيّة يحوي المركز، والشمال أعلى (z أصغر)', () => {
  const CK = coreCtx();
  const L = CK.tileList(25.0805, 55.1403, 750, 17);
  assert.equal(L.z, 17); assert.equal(L.x0 <= 85611 && 85611 <= L.x1, true, 'بلاطة المركز x=85611 ضمن النطاق');
  assert.equal(L.y0 <= 56098 && 56098 <= L.y1, true, 'بلاطة المركز y=56098 ضمن النطاق');
  assert.equal(L.tiles.length, L.cols * L.rows); assert.ok(L.tiles.length >= 16 && L.tiles.length <= 100, 'عدد معقول من البلاطات: ' + L.tiles.length);
  const r = L.rect;
  assert.ok(r.minX < -750 && r.maxX > 750 && r.minZ < -750 && r.maxZ > 750, 'المستطيل يغطّي ±٧٥٠ م');
  assert.ok(r.minZ < r.maxZ && r.minX < r.maxX, 'الشمال z أصغر (كإسقاط CK.parse)');
  const w = (r.maxX - r.minX) / L.cols;
  assert.ok(Math.abs(w - 276.8) < 1.2, 'عرض البلاطة عند ز١٧ وعرض ٢٥° ≈ ٢٧٦٫٨ م: ' + w);
  const h = (r.maxZ - r.minZ) / L.rows; assert.ok(Math.abs(h - 275) < 1.5 && Math.abs(h / w - 1) < 0.015, 'البلاطة مربّعة تقريبًا (مركاتور يحفظ النسبة): ' + h);
  assert.deepEqual(JSON.parse(JSON.stringify(L.tiles[0])), { x: L.x0, y: L.y0, col: 0, row: 0 }); assert.equal(L.tiles[L.tiles.length - 1].row, L.rows - 1);
  assert.ok(CK.tileList(25, 55, 3000, 17).tiles.length > 100, 'منطقة كبيرة جدًّا ترفضها drape (سقف ١٠٠ بلاطة)');
  assert.doesNotThrow(() => CK.tileList(0, 179.9999, 700, 17)); assert.doesNotThrow(() => CK.tileList(84, -179.99, 700, 17));
});

test('الصور الجوّيّة: بلا مفتاح، بنسب مصدر ظاهرة، تفضيل بايت واحد، وسبع تجارب نهاريّة فقط (لا المظلمة التي تُعيد تلوين المدينة)', () => {
  const core = rd('inspire/src/core.js');
  const im = core.slice(core.indexOf('CK.IMAGERY = {'), core.indexOf('CK.IMAGERY = {') + 400);
  assert.match(im, /https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
  assert.doesNotMatch(im.split('\n')[0], /key=|token=|apikey|access_token|\bsk-/i, 'لا مفتاح في العنوان');
  assert.match(im, /attr: 'Esri, Maxar, Earthstar Geographics'/); assert.match(core, /الصور: ', 'Imagery: '\) \+ CK\.IMAGERY\.attr/, 'السطر يظهر مع الصور وحدها');
  assert.match(core, /\.ck-img\[hidden\]\{display:none\}/, 'الصفّ مخفيّ في التجارب التي لا تدعمها');
  assert.match(core, /if \(ok < L\.tiles\.length \* 0\.5 \|\| ctx\.city !== city\) return false;/, 'أقلّ من نصف البلاطات أو تبدّلت المدينة: المشهد كما كان');
  assert.match(core, /h > IM\.roofMax/, 'أسطح المباني العالية (إزاحة المنظور) لا تُغطّى بالصورة');
  assert.match(core, /crossOrigin = 'anonymous'/);
  assert.match(core, /if \(city && city\.imgOff\) city\.imgOff\(\);\n\s+if \(cityGroup\)/, 'تُحرَّر الطبقة قبل استبدال المدينة');
  const withImg = ['billboard', 'chase', 'explore', 'sun', 'tower', 'view', 'walkshade'], without = ['drone', 'fireworks', 'lights', 'noise'];
  for (const id of withImg) assert.match(rd('inspire/city/' + id + '.html'), /\bimagery: true,/, id + ' فيها الصور');
  for (const id of without) assert.doesNotMatch(rd('inspire/city/' + id + '.html'), /\bimagery: true,/, id + ' مظلمة: بلا صور');
  assert.ok(!INSPIRE_HERO_REMOVED(), 'لا بطاقة جديدة في «الإلهام»: ' + 'مدينتك الحيّة' + ' غير مضافة');
  assert.ok(!fs.existsSync(path.join(root, 'inspire/src/live.html')), 'لا تجربة جديدة');
});
function INSPIRE_HERO_REMOVED() { return rd('js/app-35-inspire.js').indexOf("id:'live'") !== -1; }
