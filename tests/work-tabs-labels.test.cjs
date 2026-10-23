'use strict';
/* v-work-tabs-labels (تدقيق ١٨ أكتوبر، g06/work-tabs-menu وg06/work-panel-collapse):
   ١) تلميح زرّ النسخ في شريط اللوحة يقول «نسخ الردّ / Copy reply» وهو ينسخ الكود (المفتاح الخطأ copyMsgTitle)،
      ويبقى بلغة الإقلاع بعد تبديل اللغة.
   ٢) aria-label لزرّي «طي اللوحة» و«فتح اللوحة» عربيّ ثابت في كلّ اللغات.
   القرار: copyCodeTitle (موجود بالـ١٤ لغة) ومفتاحان جديدان waCollapseLbl/waReopenLbl بالـ١٤ لغة، والثلاثة موسومة
   data-i18n/data-i18n-title فيحدّثها applyLanguage عند تبديل اللغة (نمط تبويب المعاينة). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const ROOT = path.join(__dirname, '..');
const A5 = fs.readFileSync(path.join(ROOT, 'js/app-05-ui.js'), 'utf8');
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
const AR_RE = /[؀-ۿ]/;
const NEW_KEYS = ['waCollapseLbl', 'waReopenLbl'];

function dict(lg) {
  const DATA = fs.readFileSync(path.join(ROOT, 'js', 'app-03-i18n-data.js'), 'utf8');
  const ast = acorn.parse(DATA, { ecmaVersion: 'latest', sourceType: 'script' });
  const parts = ast.body.filter((n) => (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === 'I18N'))
    || (n.type === 'ExpressionStatement' && DATA.slice(n.start, n.start + 18).startsWith('Object.assign(I18N'))).map((n) => DATA.slice(n.start, n.end));
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(parts.join('\n') + '\nthis.I18N = I18N;', sb);
  return sb.I18N[lg];
}
function lazy(lg) {
  const sb = { I18N: {} }; sb.window = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'i18n', lg + '.js'), 'utf8'), sb);
  return sb.I18N[lg];
}
function v336() {
  const a = A5.indexOf('/* v336: طي/فتح لوحة الكود والمعاينة');
  const b = A5.indexOf('  try{\n    omranBuildCodeViewerBar();', a);
  assert.ok(a > 0 && b > a, 'كتلة v336');
  return A5.slice(a, b);
}

test('١. المفتاحان الجديدان (ومعهما copyCodeTitle) بالعربيّة والإنجليزيّة وفي ملفّات اللغات الـ١٢', () => {
  const ar = dict('ar'), en = dict('en');
  for (const k of NEW_KEYS.concat(['copyCodeTitle'])) {
    assert.ok(typeof ar[k] === 'string' && AR_RE.test(ar[k]), 'ar: ' + k);
    assert.ok(typeof en[k] === 'string' && en[k] && !AR_RE.test(en[k]), 'en: ' + k);
  }
  for (const lg of LANGS) {
    const d = lazy(lg);
    for (const k of NEW_KEYS.concat(['copyCodeTitle'])) {
      assert.ok(typeof d[k] === 'string' && d[k].trim(), lg + ': ' + k);
      if (lg !== 'ur') assert.ok(!AR_RE.test(d[k]), lg + ': ' + k + ' بلا عربيّة');
    }
  }
});

test('٢. لا aria-label عربيّ حرفيّ في كتلة اللوحة، والزرّان موسومان للتبديل', () => {
  const s = v336();
  assert.ok(!/setAttribute\('aria-label',\s*'[؀-ۿ]/.test(s), 'aria-label عربيّ ثابت');
  assert.match(s, /setAttribute\('data-i18n', '\[aria-label\]waCollapseLbl'\)/);
  assert.match(s, /setAttribute\('data-i18n', '\[aria-label\]waReopenLbl'\)/);
});

test('٣. زرّ النسخ: تلميحه copyCodeTitle لا copyMsgTitle، وموسوم للتبديل', () => {
  const s = v336();
  assert.ok(!/t\('copyMsgTitle'\)/.test(s), 'copyMsgTitle خرج من زرّ نسخ اللوحة');
  assert.match(s, /t\('copyCodeTitle'\)/);
  assert.match(s, /setAttribute\('data-i18n-title', 'copyCodeTitle'\)/);
  assert.match(s, /setAttribute\('data-i18n', '\[aria-label\]copyCodeTitle'\)/);
});

test('٤. البناء الحقيقيّ في vm: النصوص من t() بلغة المستخدم عند الإقلاع', () => {
  const made = [];
  const mk = (tag) => {
    const e = { tagName: tag.toUpperCase(), id: '', style: {}, attrs: {}, classList: { toggle() {}, contains: () => false }, children: [],
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] || null; } };
    made.push(e); return e;
  };
  const tabs = mk('div'); tabs.insertBefore = () => {}; tabs.appendChild = () => {}; tabs.firstElementChild = null;
  const wa = mk('div');
  const en = dict('en');
  const ctx = {
    document: { getElementById: (id) => ({ workarea: wa, tabs }[id] || null), createElement: mk, body: { appendChild() {}, classList: { toggle() {} } } },
    t: (k) => (en[k] !== undefined ? en[k] : k), window: {}, __swallow() {}, localStorage: { getItem: () => null, setItem() {} },
  };
  vm.createContext(ctx);
  vm.runInContext(v336() + '\n})();', ctx);
  const byId = (id) => made.find((e) => e.id === id);
  assert.equal(byId('waCollapseBtn').attrs['aria-label'], en.waCollapseLbl);
  assert.equal(byId('waReopen').attrs['aria-label'], en.waReopenLbl);
  assert.equal(byId('waCopyBtn').title, en.copyCodeTitle);
  assert.equal(byId('waCopyBtn').attrs['aria-label'], en.copyCodeTitle);
});
