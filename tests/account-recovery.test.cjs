// v-acct-recovery (طلب عمران «نفذ الكل»): الاسترجاع والهويّة.
//
// ١. الإيميل لا يتكرّر عند التسجيل (الاسم كان فريدًا أصلًا، والبريد لا).
// ٢. «نسيت كلمة المرور» يقبل الإيميل وحده، وبردّ واحد وُجد الحساب أم لا.
// ٣. الاسترجاع برقم الهاتف (رمز برسالة): ربط الرقم من «حسابي» ثمّ استرجاع به.
// ٤. صندوق «رصيد النقاط» حُذف من «حسابي»، وشريحة «أنت داخل الحساب» في الشريط الجانبيّ.
//
// يشغّل api/_lib/auth.js الحقيقيّ: مخزن في الذاكرة بدل Redis، وfetch مزيّف
// يقوم مقام خدمتي البريد والرسائل.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function check(ok, label) { assert.ok(ok, label); console.log('  ✓ ' + label); }
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

process.env.AUTH_SECRET = 'سرّ-الفحص';
process.env.UPSTASH_REDIS_REST_URL = 'http://فحص-محلّيّ';
process.env.SITE_URL = 'https://example.test';
process.env.RESEND_API_KEY = 'فحص-بريد';

const store = new Map();
const kvPath = require.resolve('../api/_lib/kv.js');
require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvDel: async (k) => { store.delete(k); },
  kvList: async () => [...store.keys()],
  kvIncr: async () => 1, kvExpire: async () => {}, kvIncrBy: async () => 1,
  kvDecrBy: async () => 1, kvSetIfAbsent: async () => true,
  kvGetRaw: async (k) => store.get(k) || null, kvSetRaw: async (k, v) => store.set(k, v),
} };

const mails = [];
const sms = [];
let smsCode = '123456';
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('api.resend.com')) { mails.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({}) }; }
  if (u.includes('verify.twilio.com')) {
    const p = new URLSearchParams(opts.body);
    if (u.endsWith('/Verifications')) { sms.push(p.get('To')); return { ok: true, status: 201, json: async () => ({ status: 'pending' }) }; }
    if (u.endsWith('/VerificationCheck')) return { ok: true, status: 200, json: async () => ({ status: p.get('Code') === smsCode ? 'approved' : 'pending' }) };
  }
  throw new Error('نداء خارجيّ غير متوقّع: ' + u);
};

const auth = require('../api/_lib/auth.js');
async function call(body) {
  const res = { code: 0, body: null };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  await auth({ method: 'POST', body }, res);
  return res;
}

(async () => {
  console.log('١. الإيميل فريد عند التسجيل');
  const a = await call({ action: 'signup', username: 'Sara', password: 'pass-12345678', email: 'Sara@Example.com' });
  check(a.code === 200 && a.body.token, 'التسجيل الأوّل بالبريد يمرّ');
  const dup = await call({ action: 'signup', username: 'other', password: 'pass-12345678', email: ' sara@example.COM ' });
  check(dup.code === 409 && /مرتبط بحساب آخر/.test(dup.body.error), 'البريد نفسه بحالة أحرف أخرى يُرفض 409');
  check(!(await auth.getUserOnce('other')), 'ولا يُنشأ الحساب الثاني');
  const dupName = await call({ action: 'signup', username: 'SARA', password: 'pass-12345678' });
  check(dupName.code === 409, 'والاسم ما زال فريدًا بلا حساسيّة للأحرف');

  console.log('٢. الاسترجاع بالإيميل وحده');
  const f1 = await call({ action: 'forgotPassword', email: 'sara@example.com' });
  check(f1.code === 200 && mails.length === 1 && mails[0].to[0] === 'sara@example.com', 'رابط الاسترجاع يُرسل للبريد بلا اسم مستخدم');
  check(/ru=Sara/.test(mails[0].html) && /Sara/.test(mails[0].html), 'والرسالة تحمل اسم الحساب لمن نسيه');
  check(!!(await auth.getUserOnce('sara')).resetTokenHash, 'ورمز الاسترجاع حُفظ على الحساب');
  const f2 = await call({ action: 'forgotPassword', email: 'nobody@example.com' });
  check(f2.code === 200 && f2.body.message === f1.body.message && mails.length === 1, 'بريد غير مسجّل: الردّ نفسه ولا رسالة (لا كشف للبريد)');
  const f3 = await call({ action: 'forgotPassword', username: 'sara@example.com' });
  check(f3.code === 200 && mails.length === 2, 'البريد مكتوبًا في خانة الاسم يُعامل بريدًا');

  console.log('٣. الهاتف');
  const tok = a.body.token;
  const off = await call({ action: 'phone-otp-request', purpose: 'link', token: tok, phone: '+971501234567' });
  check(off.code === 503 && /غير مهيأة/.test(off.body.error) && sms.length === 0, 'بلا مفاتيح الرسائل: 503 واضحة ولا إرسال');

  process.env.TWILIO_ACCOUNT_SID = 'AC-فحص';
  process.env.TWILIO_AUTH_TOKEN = 'فحص';
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VA-فحص';
  const bad = await call({ action: 'phone-otp-request', purpose: 'link', token: tok, phone: '0501234567' });
  check(bad.code === 400, 'رقم بلا صيغة دوليّة يُرفض');
  const noTok = await call({ action: 'phone-otp-request', purpose: 'link', phone: '+971501234567' });
  check(noTok.code === 401, 'الربط يتطلّب جلسة');
  const r1 = await call({ action: 'phone-otp-request', purpose: 'link', token: tok, phone: '00971 50 123 4567' });
  check(r1.code === 200 && sms[0] === '+971501234567', 'الرمز يُرسل للرقم بعد توحيده إلى +971…');
  const wrong = await call({ action: 'phone-otp-verify', purpose: 'link', token: tok, phone: '+971501234567', otp: '000000' });
  check(wrong.code === 401 && !(await auth.getUserOnce('sara')).phone, 'رمز خاطئ لا يربط');
  const ok = await call({ action: 'phone-otp-verify', purpose: 'link', token: tok, phone: '+971501234567', otp: smsCode });
  check(ok.code === 200 && (await auth.getUserOnce('sara')).phone === '+971501234567', 'الرمز الصحيح يربط الرقم بالحساب');
  const prof = await call({ action: 'getProfile', token: tok });
  check(prof.body.phone === '+971501234567' && prof.body.email === 'sara@example.com', 'getProfile يعيد الرقم والبريد');

  const b = await call({ action: 'signup', username: 'second', password: 'pass-12345678' });
  const steal = await call({ action: 'phone-otp-request', purpose: 'link', token: b.body.token, phone: '+971501234567' });
  check(steal.code === 409 && sms.length === 1, 'رقم مرتبط بحساب آخر لا يُدّعى ولا تُرسل له رسالة');

  const unknown = await call({ action: 'phone-otp-request', purpose: 'recover', phone: '+971509999999' });
  check(unknown.code === 200 && sms.length === 1, 'استرجاع برقم غير مرتبط: ردّ عامّ ولا رسالة مدفوعة');
  const rr = await call({ action: 'phone-otp-request', purpose: 'recover', phone: '+971501234567' });
  check(rr.code === 200 && rr.body.message === unknown.body.message && sms.length === 2, 'برقم مرتبط: الرسالة تُرسل والردّ نفسه');
  const short = await call({ action: 'phone-otp-verify', purpose: 'recover', phone: '+971501234567', otp: smsCode, newPassword: '123' });
  check(short.code === 400, 'كلمة مرور قصيرة تُرفض');
  const rec = await call({ action: 'phone-otp-verify', purpose: 'recover', phone: '+971501234567', otp: smsCode, newPassword: 'new-pass-9999' });
  check(rec.code === 200 && rec.body.username === 'Sara' && rec.body.token, 'الاسترجاع يعيد الاسم وجلسة');
  const login = await call({ action: 'login', username: 'sara', password: 'new-pass-9999' });
  check(login.code === 200, 'وكلمة المرور الجديدة تعمل في الدخول');

  sms.length = 0;
  for (let i = 0; i < 3; i++) await call({ action: 'phone-otp-request', purpose: 'link', token: b.body.token, phone: '+971507777777' });
  const limited = await call({ action: 'phone-otp-request', purpose: 'link', token: b.body.token, phone: '+971507777777' });
  check(limited.code === 429 && sms.length === 3, 'ثلاث رسائل لكلّ رقم في عشر دقائق ثمّ 429');

  console.log('٤. الواجهة');
  const src = auth.toString() + read('api/_lib/auth.js');
  check(!/^const\s+\w+\s*=\s*process\.env\.TWILIO/m.test(src), 'مفاتيح الرسائل تُقرأ عند النداء لا في نطاق الوحدة');
  const boot = read('js/app-01-boot-auth.js');
  check(/email: \(mode === 'signup' \?/.test(boot), 'نموذج التسجيل يرسل الإيميل أخيرًا (كان يُهمل)');
  check(/action: 'forgotPassword', email: username/.test(boot), '«نسيت كلمة المرور» يرسل البريد حين يُكتب');
  check(/phone-otp-verify', purpose: 'recover'/.test(boot) && /purpose: 'link'/.test(boot), 'وضع الاسترجاع بالهاتف وربط الرقم من «حسابي»');
  const core = read('js/partials-core.js');
  check(['authPhoneRow', 'authPhoneSendBtn', 'authPhoneCode', 'authUsePhoneLink', 'authUserLabelText'].every((id) => core.includes('id="' + id + '"')), 'حقول الهاتف في شاشة الدخول');
  const settings = read('js/partials-settings.js');
  check(!settings.includes('acctPointsBox') && !settings.includes('acctPointsValue'), 'صندوق «رصيد النقاط» حُذف من «حسابي»');
  check(['acctPhone', 'acctPhoneSendBtn', 'acctPhoneCode', 'acctPhoneVerifyBtn'].every((id) => settings.includes('id="' + id + '"')), 'صفّ الهاتف في «حسابي»');
  const co = read('js/app-06-checkout.js');
  check(!/acctPointsBox|acctPointsValue/.test(co), 'refreshAcctPoints لا يعتمد على الصندوق المحذوف');
  const html = read('index.html');
  check(/id="omranUserChip" hidden/.test(html) && /html:not\(\.mobile-ui\) body #omranUserChip\{/.test(html), 'شريحة الحساب في الشريط الجانبيّ للحاسوب وحده');
  check(/function syncUserChip\(/.test(boot) && /showSettingsPage\('accountSection'\)/.test(boot), 'الشريحة تفتح «حسابي» أو شاشة الدخول');
  check(html.includes('/js/partials-core.js?v=645') && html.includes('/js/partials-settings.js?v=671') && read('js/app-04-i18n-state.js').includes(".js?v=693'"), 'وسوم الكاش رُفعت');

  const keys = ['authSubmitForgotEmail', 'authUserOrEmailLabel', 'authPhoneLabel', 'authPhoneSendBtn', 'authUsePhoneLink', 'authPhoneInvalid', 'acctPhoneLabel', 'acctPhoneVerifyBtn', 'sbUserChipLogin', 'sbUserChipTitle'];
  const i18n = read('js/app-03-i18n-data.js');
  for (const l of ['ar', 'en']) assert.ok(keys.every((k) => new RegExp('I18N\\.' + l + ', \\{[^\\n]*"' + k + '"').test(i18n)), l);
  for (const l of ['fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml']) assert.ok(keys.every((k) => read('i18n/' + l + '.js').includes('"' + k + '"')), l);
  check(true, 'النصوص الجديدة في اللغات الـ14');

  console.log('account recovery tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
