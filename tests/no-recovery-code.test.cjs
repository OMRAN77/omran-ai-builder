'use strict';
/* v-no-recovery-code (أمر المالك ١٠ أكتوبر «أريد إلغاء هذي الفكرة من التطبيق»): لا رمز استرجاع في التطبيق —
   لا نافذة بعد التسجيل، ولا خانة ولا رابط في «نسيت كلمة المرور»، ولا إجراء reset في الخادم، ولا نصوص في الـ١٤ لغة.
   يبقى الاسترجاع بالإيميل وبالهاتف (واتساب/تيليجرام) وجوجل. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const core = R('js/partials-core.js');
for (const id of ['authRecoveryModal', 'authRecoveryRow', 'authRecoveryCode', 'authUseCodeLink', 'authCopyRecoveryBtn', 'authAckRecoveryBtn']) {
  assert.ok(!core.includes(id), 'partials-core بلا ' + id);
}
assert.ok(core.includes('id="authForgotLink"') && core.includes('id="authPhoneRecover"'), '«نسيت كلمة المرور» والاسترجاع بالهاتف باقيان');

const a1 = R('js/app-01-boot-auth.js');
for (const k of ['showRecoveryModal', 'recoveryCode', "mode === 'reset'", "'reset'", 'useCodeLink', 'pendingAuthed', 'authRecovery']) {
  assert.ok(!a1.includes(k), 'app-01 بلا ' + k);
}
assert.ok(a1.includes("if(m === 'forgotEmail'){") && a1.includes("action: 'forgotPassword'") && a1.includes("action: 'resetWithToken'"), 'مسار الإيميل باقٍ');
assert.match(a1, /authSet\('aiapp_auth_token', data\.token\);\n\s*if\(mode === 'signup'\)\{\n\s*localStorage\.removeItem\('aiapp_pending_ref'\);\n\s*\}\n\s*onAuthed\(data\.username, data\.avatar\);/, 'التسجيل الناجح يدخل مباشرة بلا نافذة');

const auth = R('api/_lib/auth.js');
for (const k of ["action === 'reset'", 'genRecoveryCode', 'recoveryCode', 'recoveryHash', 'recoverySalt']) assert.ok(!auth.includes(k), 'auth.js بلا ' + k);
assert.ok(auth.includes("action === 'forgotPassword'") && auth.includes("action === 'resetWithToken'"), 'الاسترجاع بالإيميل باقٍ');
assert.ok(!/رمز الاسترجاع|recovery code/i.test(auth), 'لا ذكر لرمز الاسترجاع في رسائل الخادم');
// حساب بلا إيميل: يُحال إلى الهاتف إن كان مربوطًا، وإلّا يُقال له صراحة أنّ لا طريق من هنا
assert.match(auth, /if \(!user\.email\) \{\n\s*res\.status\(400\)\.json\(\{ error: user\.phone\n/, 'رسالة «لا إيميل» تتفرّع على user.phone');
assert.ok(auth.includes('لا يوجد إيميل ولا رقم هاتف مرتبط بهذا الحساب'), 'رسالة صريحة لمن لا إيميل له ولا هاتف');
const g = R('api/_lib/auth-google-callback.js');
assert.ok(!g.includes('genRecoveryCode') && !g.includes('recoveryHash'), 'google-callback بلا رمز');

const bundle = R('js/app.bundle.js');
assert.ok(!bundle.includes('showRecoveryModal') && !bundle.includes('authRecoveryModalTitle'), 'الحزمة أُعيد بناؤها بلا الرمز');

// الـ١٤ لغة بلا مفاتيح الرمز، وكلّ ملفّ يُجمَّع (الحذف لم يكسر الكائن)
const KEYS = /\b(authRecoveryLabel|authUseCodeLink|authRecoveryModalTitle|authRecoveryModalDesc|authCopyBtn|authAckBtn|authCopied)\b/;
// ١٢ ملفّ لغة في i18n/ (ad-studio.js ليس لغة) + العربيّة والإنجليزيّة في app-03 = ١٤ لغة
const langs = ['js/app-03-i18n-data.js', ...fs.readdirSync(path.join(__dirname, '..', 'i18n')).filter((f) => f.endsWith('.js') && f !== 'ad-studio.js').map((f) => 'i18n/' + f)];
assert.equal(langs.length, 13, 'ملفّات اللغات: ' + langs.join(', '));
for (const f of langs) {
  const src = R(f);
  assert.ok(!KEYS.test(src), f + ' بلا مفاتيح الرمز');
  new vm.Script(src, { filename: f });
}

assert.ok(R('index.html').includes('/js/partials-core.js?v=656'), 'وسم partials-core رُفع إلى 656');
assert.ok(R('js/app-04-i18n-state.js').includes("'.js?v=734'"), 'وسم ملفّات اللغات رُفع إلى 733 بعد حذف المفاتيح');
assert.ok(!R('scripts/e2e-prod.mjs').includes('authRecoveryModal'), 'المسبار لا ينتظر النافذة');
console.log('✓ no-recovery-code: لا رمز استرجاع في العميل ولا الخادم ولا الحزمة ولا الـ١٤ لغة');
