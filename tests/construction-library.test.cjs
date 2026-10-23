// tests/construction-library.test.cjs — v-cx-lib (تدقيق ١٨–١٩ أكتوبر، «تصفّح تصاميم مشابهة محفوظة»):
// ١) نقر مصغّرة المكتبة كان يكتب صورتها فوق «المخطط 2D» الذي ولّده المستخدم، ويترك جدول الكميّات والتقرير
//    لمشروعه — فيختلط مخطّط غريب بتفاصيله. الآن تفتح المصغّرة في المعرض المشترك (omranLightbox) ولا تمسّ النتيجة.
// ٢) المكتبة مشتركة وتسميات كلّ مخطّط بلغة صاحبه، فرأى المستخدم العربيّ مخطّطات إسبانيّة وإندونيسيّة وإنجليزيّة.
//    الآن يُحفظ مع كلّ تصميم لغة تسمياته (ar/ur عربيّ كما يكتبه construction-create)، والواجهة ترسل لغتها،
//    والقائمة لا تعرض إلّا لغته. السجلّات القديمة بلا لغة لا تُعرف لغتها (لا نصّ محفوظ فيها، صورة ومفاتيح فقط)
//    فلا تُعرض في قائمة لغة — ولا يُحذف منها شيء. طلب بلا لغة (عميل قديم مخبوء) يرى كلّ شيء كما كان.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* ── KV وهميّ (قبل تحميل الوحدات) ── */
const kvPath = require.resolve('../api/_lib/kv.js');
const usagePath = require.resolve('../api/_lib/_constructionUsage.js');
const store = new Map();
const puts = [];
require.cache[kvPath] = {
  id: kvPath, filename: kvPath, loaded: true,
  exports: {
    kvList: async (prefix) => [...store.keys()].filter((k) => k.startsWith(prefix)),
    kvGetJSON: async (k) => store.get(k) || null,
    kvPutJSON: async (k, v) => { puts.push([k, v]); store.set(k, v); },
    kvSetIfAbsent: async () => true,
    kvDel: async () => {},
  },
};
require.cache[usagePath] = {
  id: usagePath, filename: usagePath, loaded: true,
  exports: {
    checkConstructionQuota: async () => ({ allowed: true, username: 'test-user', remaining: 5 }),
    consumeConstruction: async () => 4,
    CONSTRUCTION_DAILY_LIMIT: 5,
  },
};
const lib = require('../api/_lib/_constructionLibrary.js');

function seed() {
  store.clear();
  const put = (id, extra) => store.set('db/construction-library/' + id + '.json', Object.assign({ id, buildingType: 'villa', floors: '2', area: '400', planImageBase64: 'x' }, extra));
  put('ar1', { lang: 'ar', createdAt: 9 });
  put('es1', { lang: 'es', createdAt: 8 });
  put('id1', { lang: 'id', createdAt: 7 });
  put('en1', { lang: 'en', createdAt: 6 });
  put('old', { createdAt: 5 }); // قبل v-cx-lib: بلا لغة
  put('ar2', { lang: 'ar', createdAt: 4, buildingType: 'mosque' });
}
const ids = (list) => list.map((d) => d.id).join(',');

test('١. listDesigns: لغة المستخدم وحدها — لا إسبانيّ ولا إندونيسيّ ولا قديم مجهول اللغة لعربيّ', async () => {
  seed();
  assert.equal(ids(await lib.listDesigns({ buildingType: 'villa', floors: 2, area: 400, lang: 'ar' })), 'ar1');
  assert.equal(ids(await lib.listDesigns({ buildingType: 'villa', floors: 2, area: 400, lang: 'ur' })), 'ar1', 'الأردو تسمياتها عربيّة');
  assert.equal(ids(await lib.listDesigns({ buildingType: 'villa', floors: 2, area: 400, lang: 'es' })), 'es1');
  assert.equal(ids(await lib.listDesigns({ buildingType: 'villa', floors: 2, area: 400, lang: 'xx' })), 'en1', 'لغة بلا جدول = تسميات إنجليزيّة');
  // عميل قديم مخبوء لا يرسل لغة: كما كان تمامًا
  assert.equal(ids(await lib.listDesigns({ buildingType: 'villa', floors: 2, area: 400 })), 'ar1,es1,id1,en1,old');
  // لا حذف: السجلّات كلّها باقية في المخزن
  assert.equal(store.size, 6);
});

test('٢. saveDesign يحفظ لغة التسميات، وconstruction-create الحقيقيّ يمرّر لغة التطبيق', async () => {
  puts.length = 0;
  await lib.saveDesign({ buildingType: 'villa', floors: 1, area: 200, lang: 'UR', planImageBase64: 'p' });
  assert.equal(puts[0][1].lang, 'ar', 'ur ← ar (تسميات عربيّة)');
  // المعالج الحقيقيّ بمزوّد وهميّ
  process.env.GEMINI_API_KEY = 'test-key';
  const handler = require('../api/_lib/construction-create.js');
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('image')) return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'PLAN', mimeType: 'image/png' } }] } }] }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '### plan' }] } }] }) };
  };
  try {
    for (const [lg, want] of [['es', 'es'], ['ar', 'ar'], ['ur', 'ar'], [undefined, 'ar']]) {
      puts.length = 0;
      const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() {} };
      const body = { buildingType: 'villa', area: 300, floors: 2, includePlan: true, token: 't' };
      if (lg) body.lang = lg;
      await handler({ method: 'POST', body }, res);
      assert.equal(res.code, 200, JSON.stringify(res.body));
      for (let i = 0; i < 5 && !puts.length; i++) await new Promise((r) => setImmediate(r));
      assert.equal(puts.length, 1, 'حُفظ في المكتبة');
      assert.equal(puts[0][1].lang, want, 'لغة ' + lg);
      assert.equal(puts[0][1].planImageBase64, 'PLAN');
    }
  } finally { global.fetch = realFetch; }
});

test('٣. لغات المكتبة = لغات تسميات construction-create (لا لغة تُوسَم خطأً)', () => {
  const src = read('api/_lib/construction-create.js');
  const m = src.match(/const LANG_NAMES = \{([^}]*)\}/);
  assert.ok(m, 'LANG_NAMES');
  const keys = [...m[1].matchAll(/(\w+):/g)].map((x) => x[1]);
  assert.deepEqual(lib.PLAN_LANGS.slice().sort(), ['ar'].concat(keys).sort());
  assert.match(src, /saveDesign\(\{[\s\S]*?lang: uiLang,[\s\S]*?\}\)/, 'saveDesign يأخذ لغة التطبيق');
  assert.match(read('api/_lib/construction-library.js'), /const \{ buildingType, floors, area, lang \} = body;[\s\S]*listDesigns\(\{ buildingType, floors, area, lang, limit: 12 \}\)/);
});

test('٤. الواجهة: الطلب يحمل اللغة، والمصغّرة تفتح المعرض ولا تكتب فوق مخطّط المستخدم', async () => {
  const S = read('js/app-13-stocks-init.js');
  const a = S.indexOf('  if(libraryBtn){');
  const b = S.indexOf('\n  const showGenerationFailure', a);
  assert.ok(a > 0 && b > a, 'معالج المكتبة');
  const kids = [];
  const opened = [];
  let sent = null;
  const ctx = {
    lang: 'ar', localStorage: { getItem: () => null },
    libraryBtn: { disabled: false }, libraryEmptyEl: { style: {} },
    libraryWrap: { style: {}, innerHTML: 'x', appendChild: (el) => kids.push(el) },
    typeEl: { value: 'villa' }, floorsEl: { value: '2' }, areaEl: { value: '400' },
    resultImageEl: { src: 'data:image/png;base64,MINE' }, downloadLink: { href: 'data:image/png;base64,MINE' },
    resultImageWrap: { style: { display: 'block' }, scrollIntoView() { throw new Error('لا تمرير إلى النتيجة'); } },
    document: { createElement: () => ({ style: {} }) },
    window: { omranLightbox: (u) => opened.push(u) },
    fetch: async (url, init) => { sent = [url, JSON.parse(init.body)]; return { ok: true, json: async () => ({ items: [
      { floors: 2, area: 400, planMimeType: 'image/png', planImageBase64: 'LIB1' },
      { floors: 2, area: 380, planImageBase64: 'LIB2' } ] }) }; },
  };
  vm.runInNewContext(S.slice(a, b), ctx);
  await ctx.libraryBtn.onclick();
  assert.equal(sent[0], '/api/construction-library');
  assert.deepEqual(sent[1], { buildingType: 'villa', floors: '2', area: '400', lang: 'ar' });
  assert.equal(kids.length, 2);
  assert.equal(ctx.libraryWrap.style.display, 'grid');
  kids[0].onclick();
  assert.deepEqual(opened, ['data:image/png;base64,LIB1'], 'المصغّرة في المعرض المشترك');
  assert.equal(ctx.resultImageEl.src, 'data:image/png;base64,MINE', 'مخطّط المستخدم كما هو');
  assert.equal(ctx.downloadLink.href, 'data:image/png;base64,MINE', 'رابط تنزيله كما هو');
  // المعرض نفسه موجود في الحزمة (app-15-cx-ideas) وليس جديدًا
  assert.match(read('js/app-15-cx-ideas.js'), /window\.omranLightbox = function\(url\)\{/);
  assert.ok(read('js/app.bundle.js').includes("if(window.omranLightbox) window.omranLightbox(img.src);"), 'الحزمة مبنيّة');
});
