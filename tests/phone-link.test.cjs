// tests/phone-link.test.cjs — v-phone-link (أمر المالك ٤ أكتوبر: «ربط الهاتف… بالواتساب أو تيليجرام، اللي يرسل بالمجان»).
// على المعالجات الحقيقيّة (auth وبوت تيليجرام وويب هوك واتساب) بـKV في الذاكرة وشبكة مزيّفة: المستخدم هو من يرسل الرمز،
// فلا رسالة مدفوعة؛ تيليجرام يقبل رقم صاحب الحساب وحده، وواتساب موقَّع بسرّ التطبيق؛ ورابط الاسترجاع يصل محادثة الرقم
// نفسه لا المتصفّح الذي يحمل الرمز (من خدع غيره ليرسل رمزًا لا يأخذ شيئًا).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

process.env.AUTH_SECRET = 'test-secret-phone-link';
process.env.UPSTASH_REDIS_REST_URL = 'http://local-test';
process.env.TELEGRAM_BOT_TOKEN = 'test-tg-token';
process.env.TG_WEBHOOK_SECRET = 'tg-hook-secret';
process.env.TELEGRAM_BOT_USERNAME = '@OmranAIBuilder_bot';
delete process.env.WHATSAPP_NUMBER; delete process.env.WHATSAPP_APP_SECRET;
delete process.env.WHATSAPP_TOKEN; delete process.env.WHATSAPP_PHONE_ID; delete process.env.WHATSAPP_VERIFY_TOKEN;

const root = path.resolve(__dirname, '..');
const store = new Map();
const kvPath = require.resolve('../api/_lib/kv.js');
require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvDel: async (k) => { store.delete(k); }, kvList: async () => [...store.keys()],
  kvIncr: async () => 1, kvExpire: async () => {}, kvIncrBy: async () => 1, kvDecrBy: async () => 1,
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvGetRaw: async (k) => store.get(k) || null, kvSetRaw: async (k, v) => { store.set(k, String(v)); },
} };
const sent = []; // { url, body }
global.fetch = async (url, init) => {
  const u = String(url);
  sent.push({ url: u, body: init && init.body ? JSON.parse(init.body) : null });
  if (/api\.telegram\.org/.test(u)) return new Response('{"ok":true}', { status: 200 });
  if (/graph\.facebook\.com/.test(u)) return new Response('{"messages":[{"id":"w1"}]}', { status: 200 });
  return new Response('{}', { status: 404 });
};
const auth = require('../api/_lib/auth.js');
const pl = require('../api/_lib/phone-link.js');
const telegram = require('../api/telegram.js');
const webhook = require('../api/webhook.js');

function mkRes() {
  return { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { this.body = b === undefined ? this.body : b; return this; } };
}
async function call(body, ip) {
  const res = mkRes();
  await auth({ method: 'POST', headers: ip ? { 'x-forwarded-for': ip } : {}, body }, res);
  return res;
}
async function tgUpdate(message) {
  const res = mkRes();
  await telegram({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'tg-hook-secret' }, body: { message } }, res);
  return res;
}
const tgReplies = () => sent.filter((s) => /api\.telegram\.org/.test(s.url)).map((s) => s.body);
async function waPost(payload, secret) {
  const buf = Buffer.from(JSON.stringify(payload));
  const req = Readable.from([buf]);
  req.method = 'POST';
  req.query = { src: 'wa' };
  req.headers = { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', secret).update(buf).digest('hex') };
  const res = mkRes();
  await webhook(req, res);
  return res;
}
const waMsg = (from, text) => ({ entry: [{ changes: [{ value: { messages: [{ from, type: 'text', text: { body: text } }] } }] }] });
async function signup(username) {
  const r = await call({ action: 'signup', username, password: 'pass12345' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  return r.body.token;
}

test('١. تيليجرام: ‎/start الرمز‎ ← زرّ «شارك رقمي» ← رقم صاحب الحساب يُربط بحسابه', async () => {
  const token = await signup('salem');
  const st = await call({ action: 'phone-link-start', channel: 'telegram', token }, '10.0.0.1');
  assert.equal(st.code, 200, JSON.stringify(st.body));
  assert.match(st.body.link, /^https:\/\/t\.me\/OmranAIBuilder_bot\?start=PL[A-HJ-NP-Z2-9]{8}$/);
  sent.length = 0;
  await tgUpdate({ chat: { id: 77 }, from: { id: 77 }, text: '/start ' + st.body.code });
  const kb = tgReplies()[0].reply_markup.keyboard[0][0];
  assert.equal(kb.request_contact, true, 'زرّ مشاركة الرقم');
  assert.equal((await call({ action: 'phone-link-status', code: st.body.code })).body.status, 'pending');
  await tgUpdate({ chat: { id: 77 }, from: { id: 77 }, contact: { user_id: 77, phone_number: '971501234567' } });
  assert.equal((await auth.getUser('salem')).phone, '+971501234567');
  const s2 = (await call({ action: 'phone-link-status', code: st.body.code })).body;
  assert.equal(s2.status, 'linked');
  assert.equal(s2.phone, '+971•••••67', 'الرقم مقنَّع في الحالة');
  assert.equal((await call({ action: 'getProfile', token })).body.phone, '+971501234567');
  assert.match(tgReplies().at(-1).text, /تمّ ربط رقمك/);
});

test('٢. تيليجرام: رقم شخص آخر (contact.user_id ≠ from.id) يُرفض، وبلا رمز سابق لا شيء', async () => {
  const token = await signup('fahad');
  const st = await call({ action: 'phone-link-start', channel: 'telegram', token }, '10.0.0.2');
  await tgUpdate({ chat: { id: 88 }, from: { id: 88 }, text: '/start ' + st.body.code });
  sent.length = 0;
  await tgUpdate({ chat: { id: 88 }, from: { id: 88 }, contact: { user_id: 99, phone_number: '+971509999999' } });
  assert.equal((await auth.getUser('fahad')).phone, undefined);
  assert.match(tgReplies()[0].text, /شارك رقمك أنت/);
  await tgUpdate({ chat: { id: 90 }, from: { id: 90 }, contact: { user_id: 90, phone_number: '+971508888888' } });
  assert.match(tgReplies().at(-1).text, /افتح رابط الربط من التطبيق/);
});

test('٣. واتساب: الرمز في رسالة موقَّعة يربط رقم المرسل؛ توقيع خاطئ ٤٠١ بلا ربط؛ وGET تحقّق Meta', async () => {
  const token = await signup('mariam');
  const off = await call({ action: 'phone-link-start', channel: 'whatsapp', token }, '10.0.0.3');
  assert.equal(off.code, 503, 'واتساب غير مهيّأ → ٥٠٣ برسالة');
  assert.match(off.body.error, /جرّب تيليجرام/);
  process.env.WHATSAPP_NUMBER = '+971 50 000 0000';
  process.env.WHATSAPP_APP_SECRET = 'meta-app-secret';
  process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
  const st = await call({ action: 'phone-link-start', channel: 'whatsapp', token }, '10.0.0.3');
  assert.equal(st.code, 200, JSON.stringify(st.body));
  assert.ok(st.body.link.startsWith('https://wa.me/971500000000?text='));
  assert.ok(decodeURIComponent(st.body.link.split('text=')[1]).includes(st.body.code), 'الرسالة الجاهزة فيها الرمز');
  const bad = await waPost(waMsg('971502222222', 'ربط — رمز: ' + st.body.code), 'wrong-secret');
  assert.equal(bad.code, 401);
  assert.equal((await auth.getUser('mariam')).phone, undefined, 'التوقيع الخاطئ لا يربط');
  const ok = await waPost(waMsg('971502222222', 'ربط رقمي بحسابي في Omran AI — رمز: ' + st.body.code.toLowerCase()), 'meta-app-secret');
  assert.equal(ok.code, 200);
  assert.equal((await auth.getUser('mariam')).phone, '+971502222222');
  const res = mkRes();
  await webhook({ method: 'GET', query: { src: 'wa', 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': 'ch42' }, headers: {} }, res);
  assert.equal(res.code, 200); assert.equal(res.body, 'ch42');
  const res2 = mkRes();
  await webhook({ method: 'GET', query: { src: 'wa', 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': 'x' }, headers: {} }, res2);
  assert.equal(res2.code, 403);
});

test('٤. الرقم لحساب واحد: ربطه بحساب ثانٍ ← taken، والأوّل باقٍ', async () => {
  const token = await signup('khalid');
  const st = await call({ action: 'phone-link-start', channel: 'telegram', token }, '10.0.0.4');
  await tgUpdate({ chat: { id: 55 }, from: { id: 55 }, text: '/start ' + st.body.code });
  await tgUpdate({ chat: { id: 55 }, from: { id: 55 }, contact: { user_id: 55, phone_number: '+971501234567' } }); // رقم salem
  assert.equal((await call({ action: 'phone-link-status', code: st.body.code })).body.status, 'taken');
  assert.equal((await auth.getUser('khalid')).phone, undefined);
  assert.equal((await pl.phoneOwner('+971501234567')).key, 'salem');
});

test('٥. الاسترجاع: الرابط يصل محادثة الرقم وحدها (لا المتصفّح)، مرّة واحدة ولو كرّرت Meta الإرسال، ويعيد كلمة المرور', async () => {
  // واتساب بلا رمز ردّ → الاسترجاع عبره غير متاح (لا مكان يصل فيه الرابط)
  const no = await call({ action: 'phone-recover-start', channel: 'whatsapp' }, '10.0.0.5');
  assert.equal(no.code, 503);
  process.env.WHATSAPP_TOKEN = 'wa-token'; process.env.WHATSAPP_PHONE_ID = '1234';
  const st = await call({ action: 'phone-recover-start', channel: 'whatsapp' }, '10.0.0.5');
  assert.equal(st.code, 200, JSON.stringify(st.body));
  assert.match(decodeURIComponent(st.body.link), /لا ترسلها إن لم تطلبها أنت/);
  sent.length = 0;
  const payload = waMsg('971502222222', 'استرجاع — رمز: ' + st.body.code); // رقم mariam
  await waPost(payload, 'meta-app-secret');
  await waPost(payload, 'meta-app-secret'); // إعادة إرسال من Meta
  const replies = sent.filter((s) => /graph\.facebook\.com\/v\d+\.\d+\/1234\/messages/.test(s.url));
  assert.equal(replies.length, 1, 'ردّ واحد لا اثنان');
  assert.equal(replies[0].body.to, '971502222222', 'إلى الرقم نفسه');
  const m = /resetToken=([0-9a-f]{48})&ru=mariam/.exec(replies[0].body.text.body);
  assert.ok(m, 'رابط الاسترجاع في الردّ: ' + replies[0].body.text.body);
  const s = (await call({ action: 'phone-link-status', code: st.body.code })).body;
  assert.equal(s.status, 'verified');
  assert.ok(!('resetToken' in s) && !('username' in s) && !/resetToken|mariam/.test(JSON.stringify(s)), 'المتصفّح لا يأخذ الرابط ولا اسم الحساب');
  const r = await call({ action: 'resetWithToken', username: 'mariam', resetToken: m[1], newPassword: 'newpass123' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal((await call({ action: 'login', username: 'mariam', password: 'newpass123' })).code, 200);
});

test('٦. الاسترجاع عبر تيليجرام: الرابط في محادثة البوت؛ ورقم بلا حساب ← nouser', async () => {
  const st = await call({ action: 'phone-recover-start', channel: 'telegram' }, '10.0.0.6');
  await tgUpdate({ chat: { id: 77 }, from: { id: 77 }, text: '/start ' + st.body.code });
  sent.length = 0;
  await tgUpdate({ chat: { id: 77 }, from: { id: 77 }, contact: { user_id: 77, phone_number: '+971501234567' } });
  assert.match(tgReplies()[0].text, /حسابك: salem[\s\S]*resetToken=[0-9a-f]{48}&ru=salem/);
  assert.equal((await call({ action: 'phone-link-status', code: st.body.code })).body.status, 'verified');
  const st2 = await call({ action: 'phone-recover-start', channel: 'telegram' }, '10.0.0.6');
  await tgUpdate({ chat: { id: 66 }, from: { id: 66 }, text: '/start ' + st2.body.code });
  sent.length = 0;
  await tgUpdate({ chat: { id: 66 }, from: { id: 66 }, contact: { user_id: 66, phone_number: '+966500000001' } });
  assert.equal((await call({ action: 'phone-link-status', code: st2.body.code })).body.status, 'nouser');
  assert.ok(!/resetToken/.test(tgReplies()[0].text));
});

test('٧. حدود: خمسة رموز لكلّ عنوان في ربع ساعة، والربط يحتاج جلسة', async () => {
  assert.equal((await call({ action: 'phone-link-start', channel: 'telegram' }, '10.0.0.7')).code, 401);
  for (let i = 0; i < 5; i++) assert.equal((await call({ action: 'phone-recover-start', channel: 'telegram' }, '10.0.0.8')).code, 200);
  const r = await call({ action: 'phone-recover-start', channel: 'telegram' }, '10.0.0.8');
  assert.equal(r.code, 429);
  assert.match(r.body.error, /محاولات كثيرة/);
});

test('٨. الواجهة: صفّ «رقم الهاتف» في حسابي، وزرّا الاسترجاع في «نسيت كلمة المرور» وحدها، والنصوص بالـ١٤ لغة', () => {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  assert.match(read('js/partials-settings.js'), /id="acctRowPhone"[\s\S]*data-phone-link="whatsapp"[\s\S]*data-phone-link="telegram"/);
  assert.match(read('js/partials-core.js'), /id="authPhoneRecover"[\s\S]*data-recover="1"/);
  const a1 = read('js/app-01-boot-auth.js');
  assert.match(a1, /phoneRecover\.style\.display = m === 'forgotEmail' \? 'block' : 'none'/);
  assert.match(a1, /closest\('\[data-phone-link\]'\)/);
  assert.ok(!/resetToken/.test(a1.slice(a1.indexOf('async function phoneFlow'), a1.indexOf("closest('[data-phone-link]')"))), 'المتصفّح لا يتعامل مع رابط الاسترجاع');
  const html = read('index.html');
  assert.ok(html.includes('/js/partials-core.js?v=656') && html.includes('/js/partials-settings.js?v=694'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=732'"));
  const keys = ['acctPhoneLabel', 'phoneNotLinked', 'phoneViaWa', 'phoneViaTg', 'phoneWaiting', 'phoneLinkedOk', 'phoneTaken', 'phoneNoUser', 'phoneExpired', 'phoneRecoverTitle', 'phoneRecoverSent'];
  const a3 = read('js/app-03-i18n-data.js');
  for (const k of keys) assert.equal((a3.match(new RegExp('^    ' + k + ': ', 'gm')) || []).length, 2, 'ar+en: ' + k);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const f = read('i18n/' + lg + '.js');
    for (const k of keys) assert.ok(f.includes('"' + k + '":'), lg + ': ' + k);
  }
});
