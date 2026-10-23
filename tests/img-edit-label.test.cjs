'use strict';
/* v-img-edit-label (تدقيق ١٨–١٩ أكتوبر، g05/attach-image-edit): وقت تعديل الصورة يكتب مربّع النقاط «جارٍ إنشاء الصورة» بدل
   «جاري تعديل الصورة». نداءات __showImgLoading تمرّر عنوانها، لكنّ الغلاف كان يتجاهله منذ v-img-dots-plus (التي وحّدت العنوان
   لترجمته، ولم تقرّر محو عنوان التعديل). الآن: مسار التعديل/التطوير وحده يمرّر مفتاحه stEditImage — العربيّة عنوانه الممرَّر،
   وغيرها المفتاح بالـ١٤ لغة — والمسارات الأخرى «جارٍ إنشاء الصورة»/stGenImage كما هي. الدوالّ الحقيقيّة في vm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-09-attach.js'), 'utf8');
const AST = acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'script' });
const top = (name) => { const n = AST.body.find((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === name); assert.ok(n, name); return SRC.slice(n.start, n.end); };
function nested(name) {
  const core = AST.body.find((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === '__sendPromptCore');
  let fn = null;
  (function walk(n) {
    if (!n || typeof n.type !== 'string' || fn) return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) { fn = n; return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(core);
  assert.ok(fn, name + ' داخل __sendPromptCore');
  return SRC.slice(fn.start, fn.end);
}
const TR = { en: { stGenImage: '🎨 Drawing an image…', stEditImage: 'Editing the image…' }, fr: { stGenImage: "🎨 Dessin d'une image…", stEditImage: "Modification de l'image…" } };
function run(lg) {
  const el = { innerHTML: '', isConnected: true };
  const sb = {
    String, lang: lg, chatStatus: null,
    t: (k) => (TR[lg] && TR[lg][k]) || k,
    document: { getElementById: () => ({}), createElement: () => ({}), head: { appendChild() {} } },
    __mine: () => true,
  };
  vm.createContext(sb);
  vm.runInContext(top('__omranImgDots') + '\n' + nested('__showImgLoading'), sb);
  return { sb, el };
}
const label = (el) => { const m = el.innerHTML.match(/<div class="omGenTxt" dir="[^"]*">([^<]*)<\/div>/); return m ? m[1] : null; };

test('١. مسار التعديل: العربيّة «جاري تعديل الصورة…» كما يمرّرها، والإنجليزيّة والفرنسيّة من مفتاح stEditImage', () => {
  for (const [lg, want] of [['ar', 'جاري تعديل الصورة…'], ['en', 'Editing the image…'], ['fr', "Modification de l'image…"]]) {
    const { sb, el } = run(lg);
    sb.__showImgLoading(el, 'جاري تعديل الصورة…', 'Editing image…', 'stEditImage');
    assert.equal(label(el), want, lg);
    assert.ok(el.innerHTML.includes('aria-label="' + want + '"'), lg + ': aria-label');
  }
});

test('٢. المسارات الأخرى بلا مفتاح تبقى «جارٍ إنشاء الصورة» / stGenImage (قرار v-img-dots-plus)', () => {
  for (const [lg, want] of [['ar', 'جارٍ إنشاء الصورة'], ['en', 'Drawing an image…']]) {
    const { sb, el } = run(lg);
    sb.__showImgLoading(el, 'جارٍ تصميم الطوابع', 'Designing stamps');
    assert.equal(label(el), want, lg);
    const el2 = { innerHTML: '', isConnected: true };
    sb.__omranImgDots(el2, true);
    assert.equal(label(el2), want, lg + ': بلا عنوان');
  }
});

test('٣. نداء مسار التعديل/التطوير في __sendPromptCore يمرّر stEditImage، والمفتاح بالـ١٤ لغة', () => {
  const line = SRC.split('\n').find((l) => l.includes("__showImgLoading(thinkingDiv, (__IMG_UPGRADE || __IMG_ELEVATE) ? 'جاري تطوير الصورة…' : 'جاري تعديل الصورة…'"));
  assert.ok(line, 'نداء التعديل');
  assert.ok(/'stEditImage'\);\s*$/.test(line), 'المفتاح وسيط رابع');
  const d = fs.readFileSync(path.join(ROOT, 'js', 'app-03-i18n-data.js'), 'utf8');
  assert.equal((d.match(/\bstEditImage:/g) || []).length, 2, 'بالعربيّة والإنجليزيّة');
  for (const lg of ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml']) {
    assert.ok(fs.readFileSync(path.join(ROOT, 'i18n', lg + '.js'), 'utf8').includes('"stEditImage"'), 'stEditImage في ' + lg);
  }
});
