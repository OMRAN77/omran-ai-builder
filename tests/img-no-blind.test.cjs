// v-img-no-blind + v-credit-alert + v-owner-sees-engine (١٨ سبتمبر ٢٠٢٦):
// دور فيه صورة لا يهبط أبدًا لمزوّد بلا رؤية، ولا مزوّد يرى = اعتراف صريح لا تأليف؛
// نفاد الرصيد يصل المالك إشعارًا مرّة كلّ ٦ ساعات؛ المالك يرى أيّ محرّك احتياطيّ أجاب.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const fc = require('../api/_lib/free-chain.js');
const tierLib = require('../api/_lib/tier.js');
const alert = require('../api/_lib/_owner-alert.js');

const IMG_CONVO = [
  { role: 'user', content: 'هلا' },
  { role: 'assistant', content: 'هلا بك' },
  { role: 'user', content: [{ type: 'text', text: 'اقرأ اللقطة' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] },
];
function sse(deltas) {
  return deltas.map((d) => 'data: ' + JSON.stringify({ choices: [{ delta: { content: d } }] }) + '\n').join('') + 'data: [DONE]\n';
}

test('convoHasImage: آخر دور للمستخدم فقط', () => {
  assert.equal(fc.convoHasImage(IMG_CONVO), true);
  assert.equal(fc.convoHasImage([{ role: 'user', content: 'نصّ' }]), false);
  assert.equal(fc.convoHasImage(IMG_CONVO.concat([{ role: 'assistant', content: 'x' }, { role: 'user', content: 'بلا صورة' }])), false);
  assert.equal(fc.convoHasImage(null), false);
});

test('requireVision + صورة: المزوّد الأعمى لا يُنادى أصلًا حتّى لو سبق في الترتيب', async () => {
  const env = { GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g', FREE_CHAIN: 'groq,gemini' };
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(sse(['قرأت']), { status: 200 }); };
  const sent = [];
  const r = await fc.streamFreeChain({ system: 'SYS', convo: IMG_CONVO, send: (e) => sent.push(e), env, fetchImpl, log: () => {}, requireVision: true });
  assert.equal(r.ok, true); assert.equal(r.provider, 'gemini');
  assert.equal(calls.length, 1); assert.match(calls[0].url, /googleapis/);
  const last = calls[0].body.messages[calls[0].body.messages.length - 1];
  assert.equal(last.content[1].type, 'image_url', 'الصورة نفسها تصل المزوّد الذي يرى');
  assert.deepEqual(sent, [{ delta: 'قرأت' }]);
  fc.__workingModel.clear();
});

test('requireVision + صورة + لا مزوّد يرى: فشل صريح no-vision-provider ولا نداء ولا حرف', async () => {
  const env = { GROQ_API_KEY: 'q', MISTRAL_API_KEY: 'm' };
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(sse(['تأليف']), { status: 200 }); };
  const sent = [];
  const r = await fc.streamFreeChain({ system: 'SYS', convo: IMG_CONVO, send: (e) => sent.push(e), env, fetchImpl, log: () => {}, requireVision: true });
  assert.equal(r.ok, false); assert.equal(calls, 0); assert.deepEqual(sent, []);
  assert.ok(r.errors.includes('no-vision-provider'), r.errors.join('|'));
  // بلا مفاتيح إطلاقًا يبقى السبب القديم
  const none = await fc.streamFreeChain({ system: 'SYS', convo: IMG_CONVO, send: () => {}, env: {}, fetchImpl, log: () => {}, requireVision: true });
  assert.ok(none.errors.includes('no-provider-keys'));
});

test('requireVision + صورة + Gemini معطّل (429): لا ينزل للأعمى — فشل صريح', async () => {
  const env = { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' };
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return /googleapis/.test(url) ? new Response('quota', { status: 429 }) : new Response(sse(['تأليف']), { status: 200 }); };
  const sent = [];
  const r = await fc.streamFreeChain({ system: 'SYS', convo: IMG_CONVO, send: (e) => sent.push(e), env, fetchImpl, log: () => {}, requireVision: true });
  assert.equal(r.ok, false); assert.deepEqual(sent, []);
  assert.ok(calls.every((u) => /googleapis/.test(u)), 'لا نداء لـGroq: ' + calls.join(','));
  fc.__workingModel.clear();
});

test('بلا requireVision (الطبقة المجانيّة) السلوك القديم كما هو: الأعمى يستلم الملاحظة النصّيّة', async () => {
  const env = { GROQ_API_KEY: 'q' };
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(sse(['ok']), { status: 200 }); };
  const r = await fc.streamFreeChain({ system: 'SYS', convo: IMG_CONVO, send: () => {}, env, fetchImpl, log: () => {} });
  assert.equal(r.ok, true); assert.equal(r.provider, 'groq');
  const last = calls[0].messages[calls[0].messages.length - 1];
  assert.match(String(last.content), /صورة مرفقة/);
  // ونصّ بلا صورة مع requireVision لا يغيّر شيئًا
  const r2 = await fc.streamFreeChain({ system: 'SYS', convo: [{ role: 'user', content: 'هلا' }], send: () => {}, env, fetchImpl, log: () => {}, requireVision: true });
  assert.equal(r2.ok, true); assert.equal(r2.provider, 'groq');
  fc.__workingModel.clear();
});

test('chat.js: هبوط الملك يطلب الرؤية لدور الصورة، ويعترف عند الفشل، والمالك يرى المحرّك', () => {
  const chat = read('api/_lib/chat.js');
  assert.match(chat, /const __fb = await streamFreeChain\(\{ system: __rawOwner \? '' : PERSONA_NOTE \+ '\\n' \+ baseSystem \+ nowNote\(body && body\.tz\), raw: __rawOwner, convo, send, requireVision: lastUserHasImage \}\);/); // v-owner-free: خام للمالك
  assert.match(chat, /if \(lastUserHasImage\) \{ send\(\{ delta: tierLib\.FREE_TEXT\.imageBusy \}\); send\(\{ done: true \}\); res\.end\(\); return; \}/);
  assert.match(chat, /if \(__ownerReq\) send\(\{ modelId: 'fallback', modelLabel: 'احتياط · ' \+ __fb\.provider \+ ' \/ ' \+ __fb\.model \}\);/);
  assert.match(chat, /require\('\.\/_owner-alert\.js'\)\.alertOwnerCredit\(\{ status: upstream\.status, text: errText \}\)/);
  // الطبقة المجانيّة لم تتغيّر: بلا requireVision (قراءة الصور للنسخة الاحترافيّة كما قرّر المالك)
  assert.match(chat, /const __fr = await streamFreeChain\(\{ system: PERSONA_NOTE \+ '\\n' \+ baseSystem \+ nowNote\(body && body\.tz\), convo, send \}\);/);
  assert.ok(tierLib.FREE_TEXT.imageBusy && tierLib.FREE_TEXT.imageBusy.length > 20);
  assert.doesNotMatch(tierLib.FREE_TEXT.imageBusy, /gemini|claude|groq|mistral/i, 'لا اسم مزوّد في نصّ يراه المستخدم');
});

function fakeKv() {
  const store = new Map();
  return {
    store,
    async kvSetIfAbsent(k, v) { if (store.has(k)) return false; store.set(k, v); return true; },
    async kvGetJSON(k) { return store.has(k) ? store.get(k) : null; },
  };
}

test('_owner-alert: 402 أو نصّ رصيد → إشعار للمالك مرّة، والثانية خلال المهلة تُهمل', async () => {
  assert.equal(alert.isCreditFailure(402, ''), true);
  assert.equal(alert.isCreditFailure(400, 'Your credit balance is too low'), true);
  assert.equal(alert.isCreditFailure(500, 'overloaded'), false);
  const env = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };
  const kv = fakeKv();
  kv.store.set('db/push-subs/omran.json', { endpoint: 'https://push.example/1' });
  const pushed = [];
  const webpush = { setVapidDetails() {}, async sendNotification(sub, payload) { pushed.push({ sub, payload: JSON.parse(payload) }); } };
  const r1 = await alert.alertOwnerCredit({ status: 402, text: '', env, kv, webpush, owners: ['omran', 'nobody'] });
  assert.deepEqual(r1, { sent: 1, reason: 'ok' });
  assert.equal(pushed[0].sub.endpoint, 'https://push.example/1');
  assert.match(pushed[0].payload.title, /رصيد/);
  assert.doesNotMatch(pushed[0].payload.title + pushed[0].payload.body, /anthropic|claude/i);
  const r2 = await alert.alertOwnerCredit({ status: 402, text: '', env, kv, webpush, owners: ['omran'] });
  assert.equal(r2.reason, 'recent'); assert.equal(pushed.length, 1);
  assert.equal((await alert.alertOwnerCredit({ status: 500, text: 'boom', env, kv, webpush, owners: ['omran'] })).reason, 'not-credit');
  assert.equal((await alert.alertOwnerCredit({ status: 402, text: '', env: {}, kv: fakeKv(), webpush, owners: ['omran'] })).reason, 'no-vapid');
  assert.equal((await alert.alertOwnerCredit({ status: 402, text: '', env, kv: fakeKv(), webpush, owners: ['omran'] })).reason, 'no-subscription');
});

test('_owner-alert يُحمَّل في بيئة عارية بلا أيّ متغيّر', () => {
  const src = read('api/_lib/_owner-alert.js');
  assert.doesNotMatch(src, /^const .*process\.env/m, 'لا قراءة للبيئة في نطاق الوحدة');
  assert.doesNotMatch(src, /require\('\.\/push-subscribe\.js'\)/, 'push-subscribe يقرأ AUTH_SECRET عند التحميل');
  assert.match(read('api/_lib/push-subscribe.js'), /return 'db\/push-subs\/' \+ encodeURIComponent\(username\) \+ '\.json';/, 'مسار الاشتراك المنسوخ ما زال مطابقًا');
});
