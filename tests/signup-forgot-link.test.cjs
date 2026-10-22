'use strict';
/* v-signup-forgot (المالك ٢٠ أكتوبر، لقطة «إنشاء حساب جديد»): «بدل طريقة التسجيل، لكن تحت «عندي حساب» سجّل: نسيت كلمة التسجيل أو المرور».
   رابط «نسيت اسم المستخدم أو كلمة المرور؟» تحت زرّ «عندي حساب — تسجيل الدخول» في شاشة التسجيل وحدها، يفتح الاسترجاع القائم (forgotEmail). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('١. الرابط في المكان الذي أشار إليه المالك: بعد زرّ «عندي حساب — تسجيل الدخول» داخل الكتلة نفسها، ومخفيّ افتراضيًّا', () => {
  const h = read('js/partials-core.js');
  const ov = h.slice(h.indexOf('<div id="authOverlay"'), h.indexOf('<div id="omranEduModal"'));
  const m = ov.match(/<a href="#" id="authSignupForgotLink" style="([^"]*)" data-i18n="authForgotIdLink">نسيت اسم المستخدم أو كلمة المرور؟<\/a>/);
  assert.ok(m, 'الرابط موجود بنصّه ومفتاحه');
  assert.match(m[1], /display:none;/, 'مخفيّ افتراضيًّا (شاشة الدخول لها رابطها)');
  const alt = ov.slice(ov.indexOf('<div id="authAltBlock"'), ov.indexOf('<div id="authEmailOtpSection"'));
  const iSwitch = alt.indexOf('id="authSwitchBtn"'), iLink = alt.indexOf('id="authSignupForgotLink"'), iClose = alt.indexOf('</div>');
  assert.ok(iSwitch > 0 && iLink > iSwitch && iLink < iClose, 'تحت زرّ التبديل وداخل كتلته: ' + [iSwitch, iLink, iClose]);
  /* طريقة التسجيل كما هي: الخانتان والزرّ وجوجل وزرّ التبديل بترتيبها */
  const order = ['id="authUsername"', 'id="authPassword"', 'id="authSubmitBtn"', 'id="authForgotLink"', 'id="authGoogleBtn"', 'id="authSwitchBtn"', 'id="authSignupForgotLink"'].map((k) => ov.indexOf(k));
  assert.ok(order.every((i, j) => i > 0 && (j === 0 || i > order[j - 1])), 'الترتيب: ' + order);
});

/* تشغيل setMode الحقيقيّ من app-01 على DOM مصغّر */
function runSetMode() {
  const a = read('js/app-01-boot-auth.js');
  const src = a.slice(a.indexOf('  function setMode(m){'), a.indexOf("  const togglePassBtn = $('#authTogglePassBtn');"));
  const el = (extra) => Object.assign({ style: {}, classList: { toggle() {} }, textContent: '', onclick: null, setAttribute() {}, removeAttribute() {} }, extra || {});
  const nodes = {
    '#authRememberRow': el(), '#authPhoneRecover': el(), '#authHeading': el(), '#authAltBlock': el(), '#authSwitchBtn': el(), '#authSignupForgotLink': el(),
  };
  const ctx = {
    mode: 'login', errBox: el(), infoMsg: el(), tabLogin: el(), tabSignup: el(), userInput: el(), passInput: el(), tabsRow: el(), passwordRow: el(),
    passLabelText: el(), forgotLink: el(), backToLoginLink: el(), submitBtn: el(), signupForgotLink: nodes['#authSignupForgotLink'],
    $: (q) => nodes[q] || null,
    curT: () => ({ authCreateAccount: 'إنشاء', authHaveAccount: 'عندي', authForgotLink: 'نسيت', authIdPlaceholder: 'id', authUsernameLabel: 'u', authPasswordLabel: 'p', authNewPasswordLabel: 'n', authSubmitForgotEmail: 'f', authSubmitReset: 'r', authSubmitLogin: 'l', authSubmitSignup: 's' }),
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.setModeFn = setMode;', ctx);
  return { ctx, link: nodes['#authSignupForgotLink'], forgot: ctx.forgotLink };
}
test('٢. setMode: الرابط يظهر في التسجيل وحده، ونقره يفتح وضع «نسيت كلمة المرور» القائم نفسه', () => {
  const { ctx, link, forgot } = runSetMode();
  ctx.setModeFn('login');  assert.equal(link.style.display, 'none'); assert.equal(forgot.style.display, '', 'شاشة الدخول: رابطها القديم');
  ctx.setModeFn('signup'); assert.equal(link.style.display, 'block'); assert.equal(forgot.style.display, 'none', 'التسجيل: الجديد بدل القديم');
  ctx.setModeFn('forgotEmail'); assert.equal(link.style.display, 'none');
  ctx.setModeFn('resetToken'); assert.equal(link.style.display, 'none');
  assert.equal(typeof link.onclick, 'function', 'مربوط بالنقر');
  let prevented = false; link.onclick({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented && ctx.mode === 'forgotEmail', 'النقر ← forgotEmail بلا قفزة #');
  assert.equal(link.style.display, 'none', 'يختفي بعد الانتقال');
});

test('٣. النصّ بالـ١٤ لغة (authForgotIdLink)', () => {
  const ar = read('js/app-03-i18n-data.js');
  assert.equal((ar.match(/\bauthForgotIdLink:/g) || []).length, 2, 'ar/en');
  assert.ok(ar.includes("authForgotIdLink: 'نسيت اسم المستخدم أو كلمة المرور؟'") && ar.includes("authForgotIdLink: 'Forgot username or password?'"));
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const s = read('i18n/' + l + '.js');
    const m = s.match(/"?authForgotIdLink"?:\s*"([^"]+)"/);
    assert.ok(m && m[1].length > 5 && m[1] !== 'Forgot username or password?', l);
  }
});

test('٥. أيقونة كلمة المرور رسميّة: عين SVG بلون الكتابة لا إيموجي قرد، والتبديل يبدّل بين العين والعين المشطوبة', () => {
  const h = read('js/partials-core.js');
  const ov = h.slice(h.indexOf('<div id="authOverlay"'), h.indexOf('<div id="omranEduModal"'));
  assert.ok(!/🙈|👁/.test(ov), 'لا إيموجي في شاشة الدخول');
  assert.match(ov, /id="authTogglePassBtn"[^>]*color:var\(--muted\)[^>]*><svg [^>]*stroke="currentColor"[^>]*aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"><\/path><circle cx="12" cy="12" r="3"><\/circle><\/svg><\/button>/, 'عين SVG');
  const a = read('js/app-01-boot-auth.js');
  const tog = a.slice(a.indexOf("  const togglePassBtn = $('#authTogglePassBtn');"), a.indexOf('  function showOverlay(){'));
  assert.ok(!/🙈|👁/.test(tog), 'لا إيموجي في التبديل');
  assert.match(tog, /const EYE_SVG = '<svg [^']*<circle cx="12" cy="12" r="3"><\/circle><\/svg>';/);
  assert.match(tog, /const EYE_OFF_SVG = '<svg [^']*<line x1="1" y1="1" x2="23" y2="23"><\/line><\/svg>';/);
  assert.match(tog, /togglePassBtn\.innerHTML = showing \? EYE_SVG : EYE_OFF_SVG;/);
});

test('٤. الوسمان مرفوعان (partials-core وحزم اللغات) فتصل الواجهة والنصّ معًا', () => {
  assert.ok(Number(read('index.html').match(/\/js\/partials-core\.js\?v=(\d+)/)[1]) >= 670);
  assert.ok(Number(read('js/app-04-i18n-state.js').match(/i18n\/' \+ lg \+ '\.js\?v=(\d+)'/)[1]) >= 762);
});
