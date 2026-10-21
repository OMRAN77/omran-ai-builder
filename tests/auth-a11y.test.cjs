'use strict';
/* v-auth-a11y (تدقيق ١٨ أكتوبر، g01/auth-open · auth-login · auth-google · session-diag):
   ١) أوصاف قارئ الشاشة لزرّ ✕ وخانتي الاسم وكلمة المرور عربيّة ثابتة في partials-core، وsetMode يحدّث placeholder وحده —
      فتبقى عربيّة في الإنجليزيّ وبقيّة اللغات.
   ٢) زرّ إظهار كلمة المرور بلا وصف (title=«👁» ولا aria-label) ولا حالة (aria-pressed).
   ٣) في العربيّ: خانة الاسم الفارغة بـdir=auto تصير ltr فيذهب نصّها الدليليّ يسارًا وكلمة المرور يمينًا؛ وحشوة كلمة المرور
      فيزيائيّة (يمين) والزرّ منطقيّ (يسار في RTL) فيجري النصّ الطويل تحت الزرّ.
   ٤) تلميح زرّ Google إنجليزيّ ثابت «Continue with Google» في كلّ اللغات.
   ٥) «سبب آخر خروج» في ?diag=1: تاريخ ISO داخل خليّة RTL بلا عزل فيُقلب «19T20:38:38.509Z-10-2026».
   القرار: data-i18n="[aria-label]…" بمفاتيح موجودة، وsetMode يضبط aria-label ومفتاحه مع الوضع؛ مفتاحا authShowPass/authHidePass
   بالـ١٤ لغة وaria-pressed؛ قاعدة placeholder-shown للعربيّ وحشوة padding-inline؛ data-i18n-title لـGoogle؛ وLRI/PDI حول
   التواريخ ووكيل المتصفّح في لوحة التشخيص. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PCORE = read('js/partials-core.js');
const A01 = read('js/app-01-boot-auth.js');
const LAZY = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
const AR_RE = /[؀-ۿ]/;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}]/u;

const CORE = (() => {
  const DATA = read('js/app-03-i18n-data.js');
  const ast = acorn.parse(DATA, { ecmaVersion: 'latest', sourceType: 'script' });
  const parts = ast.body.filter((n) => (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === 'I18N'))
    || (n.type === 'ExpressionStatement' && DATA.slice(n.start, n.start + 18).startsWith('Object.assign(I18N'))).map((n) => DATA.slice(n.start, n.end));
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(parts.join('\n') + '\nthis.I18N = I18N;', sb);
  return sb.I18N;
})();
function lazy(lg) {
  const sb = { I18N: {} }; sb.window = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(read('i18n/' + lg + '.js'), sb);
  return Object.assign({}, CORE[lg] || {}, sb.I18N[lg]);
}
const DICT = { ar: CORE.ar, en: CORE.en };
for (const lg of LAZY) DICT[lg] = lazy(lg);

const H = (() => { const m = PCORE.match(/var H = String\.raw`([\s\S]*?)`;/); assert.ok(m, 'قالب partials-core'); return m[1]; })();
const tagOf = (id) => { const m = H.match(new RegExp('<(?:input|button)[^>]*\\sid="' + id + '"[^>]*>')); assert.ok(m, id); return m[0]; };
const in14 = (k) => { for (const [lg, d] of Object.entries(DICT)) assert.ok(typeof d[k] === 'string' && d[k].trim(), lg + ': ' + k); };

function makeEl(id, attrs) {
  return {
    id, style: {}, textContent: '', value: '', placeholder: '', readOnly: false, autocomplete: '', type: 'password',
    attrs: Object.assign({}, attrs),
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
  };
}

test('١. ✕ وخانتا الاسم وكلمة المرور: وصف قارئ الشاشة بمفتاح ترجمة موجود بالـ١٤ لغة، وapplyLanguage يعرف صيغة [سمة]', () => {
  assert.ok(tagOf('authCloseBtn').includes('data-i18n="[aria-label]closeTitle"'), 'authCloseBtn');
  assert.ok(tagOf('authUsername').includes('data-i18n="[aria-label]authIdPlaceholder"'), 'authUsername');
  assert.ok(tagOf('authPassword').includes('data-i18n="[aria-label]authPasswordLabel"'), 'authPassword');
  for (const k of ['closeTitle', 'authIdPlaceholder', 'authPasswordLabel', 'authUsernameLabel', 'authNewPasswordLabel']) in14(k);
  assert.ok(read('js/app-04-i18n-state.js').includes('const m = raw.match(/^\\[(.+)\\]([\\s\\S]+)$/);'), 'applyLanguage يضبط السمة من [سمة]مفتاح');
});

test('٢. setMode يضبط aria-label ومفتاحه مع الوضع بلغة الواجهة (الإنجليزيّة والفرنسيّة)', () => {
  const s = A01.indexOf('  function setMode(m){');
  const e = A01.indexOf("  tabLogin.onclick = () => setMode('login');");
  assert.ok(s > 0 && e > s, 'setMode بحدوده');
  const src = A01.slice(s, e);
  function run(lg, m) {
    const els = {};
    for (const id of ['errBox', 'infoMsg', 'tabLogin', 'tabSignup', 'userInput', 'passInput', 'submitBtn', 'tabsRow', 'passwordRow', 'forgotLink', 'backToLoginLink', 'passLabelText', 'signupForgotLink']) els[id] = makeEl(id);
    const setMode = new Function('$', 'curT', ...Object.keys(els), 'let mode = "login";\n' + src + '\nreturn setMode;')(() => null, () => DICT[lg], ...Object.values(els));
    setMode(m);
    return els;
  }
  let r = run('en', 'login');
  assert.equal(r.userInput.getAttribute('aria-label'), 'Username or email');
  assert.equal(r.userInput.getAttribute('data-i18n'), '[aria-label]authIdPlaceholder');
  assert.equal(r.passInput.getAttribute('aria-label'), 'Password');
  assert.equal(r.passInput.getAttribute('data-i18n'), '[aria-label]authPasswordLabel');
  r = run('en', 'signup');
  assert.equal(r.userInput.getAttribute('aria-label'), 'Username');
  assert.equal(r.userInput.getAttribute('data-i18n'), '[aria-label]authUsernameLabel', 'applyLanguage اللاحق يُبقي وصف الوضع');
  r = run('en', 'resetToken');
  assert.equal(r.passInput.getAttribute('aria-label'), 'New password');
  assert.equal(r.passInput.getAttribute('data-i18n'), '[aria-label]authNewPasswordLabel');
  r = run('en', 'forgotEmail');
  assert.equal(r.userInput.getAttribute('aria-label'), 'Username or email');
  r = run('fr', 'login');
  assert.equal(r.userInput.getAttribute('aria-label'), DICT.fr.authIdPlaceholder);
  assert.doesNotMatch(r.userInput.getAttribute('aria-label'), AR_RE);
});

test('٣. زرّ إظهار كلمة المرور: وصف بمفتاح وaria-pressed بدل title=«👁»، والنقر يبدّل الوصف والحالة ومفتاحها', () => {
  const tag = tagOf('authTogglePassBtn');
  assert.ok(!tag.includes('title="👁"'), 'لا title رمزيّ');
  assert.ok(tag.includes('data-i18n="[aria-label]authShowPass"') && tag.includes('aria-pressed="false"'), tag.slice(0, 160));
  for (const k of ['authShowPass', 'authHidePass']) {
    in14(k);
    for (const [lg, d] of Object.entries(DICT)) assert.doesNotMatch(d[k], EMOJI, lg + ': ' + k);
    assert.doesNotMatch(DICT.en[k], AR_RE, 'en: ' + k);
  }
  for (const [lg, d] of Object.entries(DICT)) assert.notEqual(d.authShowPass, d.authHidePass, lg);
  assert.ok(tag.includes('aria-label="' + DICT.ar.authShowPass + '"'), 'الوصف العربيّ الافتراضيّ قبل applyLanguage');

  const s = A01.indexOf("  const togglePassBtn = $('#authTogglePassBtn');");
  const e = A01.indexOf('  function showOverlay(){');
  assert.ok(s > 0 && e > s, 'معالج الزرّ بحدوده');
  const btn = makeEl('authTogglePassBtn', { 'data-i18n': '[aria-label]authShowPass', 'aria-pressed': 'false' });
  const pass = makeEl('authPassword');
  new Function('$', 'passInput', 'curT', A01.slice(s, e))((q) => (q === '#authTogglePassBtn' ? btn : null), pass, () => DICT.en);
  btn.onclick();
  assert.equal(pass.type, 'text');
  assert.deepEqual([btn.getAttribute('aria-label'), btn.getAttribute('aria-pressed'), btn.getAttribute('data-i18n')], ['Hide password', 'true', '[aria-label]authHidePass']);
  btn.onclick();
  assert.equal(pass.type, 'password');
  assert.deepEqual([btn.getAttribute('aria-label'), btn.getAttribute('aria-pressed'), btn.getAttribute('data-i18n')], ['Show password', 'false', '[aria-label]authShowPass']);
});

test('٤. تلميح زرّ Google بلغة الواجهة: data-i18n-title بالمفتاح نفسه، بلا «Continue with Google» ثابت', () => {
  const tag = tagOf('authGoogleBtn');
  assert.ok(tag.includes('data-i18n-title="authGoogleBtn"'), tag.slice(0, 120));
  assert.ok(!tag.includes('Continue with Google'), 'لا تلميح إنجليزيّ ثابت');
  assert.ok(tag.includes('title="' + DICT.ar.authGoogleBtn + '"'), 'التلميح العربيّ الافتراضيّ');
  in14('authGoogleBtn');
});

