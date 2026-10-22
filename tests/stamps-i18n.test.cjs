'use strict';
/* v-stamps-i18n (تدقيق ١٨–١٩ أكتوبر، g05/stamps): نافذة الطوابع كلّها عربيّة في الواجهة الإنجليزيّة (العنوان والأقسام والخيارات
   وأسماء الثيمات و«فاجئني» و«إلغاء»، وdir="rtl" ثابت)، ورسائل الفشل message_ar العربيّة من الخادم لكلّ لغة.
   القرار: كلّ نصّ في اللوحة مفتاح stamp* بالـ١٤ لغة، وdata-k يبقى عربيًّا لأنّه ما يُرسل للخادم (hint)، والاتّجاه من الصفحة.
   اللوحة الحقيقيّة (window.__stPickTheme داخل __sendPromptCore) تُبنى هنا في vm بـDOM مزيّف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-09-attach.js'), 'utf8');
const AST = acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'script' });
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
const AR_RE = /[؀-ۿ]/;

function pickerSrc() {
  let fn = null;
  (function walk(n) {
    if (!n || typeof n.type !== 'string' || fn) return;
    if (n.type === 'AssignmentExpression' && n.left && n.left.type === 'MemberExpression' && n.left.property && n.left.property.name === '__stPickTheme'
      && n.right && n.right.type === 'LogicalExpression' && n.right.right && n.right.right.type === 'FunctionExpression') { fn = n.right.right; return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(AST);
  assert.ok(fn, 'window.__stPickTheme');
  return SRC.slice(fn.start, fn.end);
}
const KEYS = [...new Set((pickerSrc().match(/\bt\('([A-Za-z0-9_]+)'\)/g) || []).map((x) => x.slice(3, -2)))];
/* قاموس الإنجليزيّة الحقيقيّ من app-03 (القسم الإنجليزيّ يبدأ بعد «en: {») */
const DATA = fs.readFileSync(path.join(ROOT, 'js', 'app-03-i18n-data.js'), 'utf8');
function dict(lg) {
  const ast = acorn.parse(DATA, { ecmaVersion: 'latest', sourceType: 'script' });
  const parts = ast.body.filter((n) => (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === 'I18N'))
    || (n.type === 'ExpressionStatement' && DATA.slice(n.start, n.start + 18).startsWith('Object.assign(I18N'))).map((n) => DATA.slice(n.start, n.end));
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(parts.join('\n') + '\nthis.I18N = I18N;', sb);
  return sb.I18N[lg];
}

function buildPanel(lg, d, opt = {}) {
  const els = [];
  const mk = () => { const e = { style: {}, innerHTML: '', children: [], appendChild(c) { this.children.push(c); return c; }, removeChild() {}, querySelectorAll: () => [], querySelector: () => ({}), addEventListener() {} }; els.push(e); return e; };
  const sb = {
    Promise, JSON, String, Number, console,
    lang: lg, t: (k) => (d[k] !== undefined ? d[k] : k),
    localStorage: { getItem: () => null, setItem() {} }, __swallow() {},
    document: { createElement: mk, body: mk(), documentElement: { dir: lg === 'ar' || lg === 'ur' ? 'rtl' : 'ltr' } },
  };
  sb.window = sb;
  sb.__stOpts = { count: 12, shape: 'mixed', style: 'real' };
  sb.__stImgCount = opt.imgs || 1;
  vm.createContext(sb);
  const pick = vm.runInContext('(' + pickerSrc() + ')', sb);
  pick();
  const ov = sb.document.body.children[0];
  assert.ok(ov && ov.innerHTML, 'اللوحة أُضيفت للصفحة');
  return ov.innerHTML;
}

test('١. اللوحة بالإنجليزيّة بلا حرف عربيّ ظاهر (data-k وحده عربيّ لأنّه ما يُرسل للخادم)، والاتّجاه من الصفحة', () => {
  const en = dict('en');
  for (const imgs of [1, 3]) {
    const html = buildPanel('en', en, { imgs });
    assert.ok(/data-k="فضاء"/.test(html), 'data-k عربيّ كما يتوقّعه الخادم');
    const visible = html.replace(/data-k="[^"]*"/g, '').replace(/data-v="[^"]*"/g, '').replace(/data-key="[^"]*"/g, '');
    const bad = visible.match(new RegExp('.{0,30}' + AR_RE.source + '.{0,30}', 'g'));
    assert.equal(bad, null, 'نصّ عربيّ ظاهر: ' + (bad || []).slice(0, 3).join(' | '));
    assert.ok(/dir="ltr"/.test(html) && !/dir="rtl"/.test(html), 'dir من الصفحة');
    assert.ok(html.includes(en.stampTitle) && html.includes(en.stampThSpace) && html.includes(en.cancel), 'نصوص المفاتيح');
  }
  /* العربيّة كما كانت حرفيًّا في العناوين الأساسيّة */
  const ar = dict('ar');
  const h = buildPanel('ar', ar);
  for (const s of ['اختر ثيم الطوابع', 'عدد الطوابع', 'فاجئني', 'إلغاء', 'سبونج بوب', 'للصغار']) assert.ok(h.includes(s), 'ar: ' + s);
  assert.ok(/dir="rtl"/.test(h));
});

test('٢. كلّ مفاتيح اللوحة (ومعها stampNeedPhoto) بالعربيّة والإنجليزيّة وفي ملفّات اللغات الـ١٢', () => {
  assert.ok(KEYS.length >= 50, 'مفاتيح اللوحة: ' + KEYS.length);
  const all = KEYS.filter((k) => k !== 'cancel').concat(['stampNeedPhoto']);
  const ar = dict('ar'), en = dict('en');
  for (const k of all) {
    assert.ok(typeof ar[k] === 'string' && ar[k], 'ar: ' + k);
    assert.ok(typeof en[k] === 'string' && en[k] && !AR_RE.test(en[k]), 'en: ' + k);
  }
  for (const lg of LANGS) {
    const f = fs.readFileSync(path.join(ROOT, 'i18n', lg + '.js'), 'utf8');
    const sb = { I18N: {} }; sb.window = sb; sb.self = sb;
    vm.createContext(sb);
    vm.runInContext(f, sb);
    const d = sb.I18N[lg];
    for (const k of all.concat(['cancel'])) assert.ok(typeof d[k] === 'string' && d[k].trim(), lg + ': ' + k);
    if (lg !== 'ur') for (const k of all) assert.ok(!AR_RE.test(d[k].replace(/[٠-٩]/g, '')), lg + ': ' + k + ' بلا عربيّة');
  }
});

test('٣. رسائل الطوابع: الفشل بغير العربيّة نصّ مترجم لا message_ar، والنقاط سطر الباقات؛ وطلب بلا صورة بمفتاحه', () => {
  const n = AST.body.find((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === 'omranStampFailText');
  assert.ok(n, 'omranStampFailText خارج __sendPromptCore');
  const T = { voiceImageFailed: 'FAILED', plansWhyPoints: 'POINTS' };
  const mk = (lg) => { const sb = { lang: lg, t: (k) => T[k] || k }; vm.createContext(sb); return vm.runInContext('(' + SRC.slice(n.start, n.end) + ')', sb); };
  assert.equal(mk('en')({ message_ar: 'تعذّر', error: 'stamps_failed' }), 'FAILED');
  assert.equal(mk('fr')({ message_ar: 'نقاطك', error: 'points_insufficient' }), 'POINTS');
  assert.equal(mk('en')(null), 'FAILED');
  assert.equal(mk('ar')({ message_ar: 'رسالة الخادم' }), 'رسالة الخادم');
  assert.equal(mk('ar')(null), 'تعذّر تصميم الطوابع، حاول مجدداً.');
  /* لا نصّ فشل ثنائيّ ar/en ثابت باقٍ في فرع الطوابع، وطلب بلا صورة بمفتاحه */
  assert.ok(!SRC.includes("'Stamps design failed.'"), 'لا «Stamps design failed.» ثابتة');
  assert.ok(!/__stData(?:Ov)?&&__stData(?:Ov)?\.message_ar\)\|\|/.test(SRC), 'لا message_ar لكلّ اللغات');
  assert.ok(SRC.includes("content: t('stampNeedPhoto')"), 'طلب بلا صورة');
});
