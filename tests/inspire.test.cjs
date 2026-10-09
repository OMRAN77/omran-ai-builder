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

test('النصوص الستّة بالـ١٤ لغة، ووسم تحميل اللغات مرفوع إلى 727', () => {
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
  assert.ok(rd('js/app-04-i18n-state.js').includes("'i18n/' + lg + '.js?v=727'"));
});

test('مصادر التجارب لا تُنشر، والمبنيّ يُنشر', () => {
  const ig = rd('.vercelignore');
  assert.match(ig, /^inspire\/src\/$/m);
  assert.doesNotMatch(ig, /^inspire\/city/m);
  assert.match(ig, /^scripts\/$/m);
});
