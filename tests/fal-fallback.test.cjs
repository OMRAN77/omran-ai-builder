// tests/fal-fallback.test.cjs — v-fal-backup (أمر المالك ٣ نوفمبر ٢٠٢٦: «تنبيه قبل ما يخلص الرصيد، أو مزوّد احتياطي — موجود خارجي
// وصله»): نفاد رصيد Gemini (402 أو 429 «prepayment credits are depleted») يحوّل الطلب إلى النموذج نفسه عند fal، والمالك يصله إشعار
// مرّة كلّ ٦ ساعات، والزحام العاديّ والمفتاح المرفوض لا يحوّلان، والسقف اليوميّ يمنع الصرف بلا حدّ. بلا شبكة: kv وfetch مزيّفان.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, 'api/_lib', f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'fal-fallback-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.FAL_KEY = 'fal-test-key';
delete process.env.FAL_BACKUP; delete process.env.FAL_BACKUP_CAP_CENTS;
delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;

const store = new Map();
const ttl = new Map();
stub('kv.js', {
  kvGetJSON: async () => null, kvPutJSON: async () => true, kvDel: async (k) => { store.delete(k); },
  kvGetRaw: async (k) => (store.has(k) ? store.get(k) : null),
  kvSetRaw: async (k, v, t) => { store.set(k, v); if (t) ttl.set(k, t); },
  kvSetIfAbsent: async (k, v, t) => { if (store.has(k)) return false; store.set(k, v); if (t) ttl.set(k, t); return true; },
  kvIncr: async (k) => { const n = Number(store.get(k) || 0) + 1; store.set(k, n); return n; },
  kvIncrBy: async (k, by) => { const n = Number(store.get(k) || 0) + Number(by); store.set(k, n); return n; },
  kvDecrBy: async (k, by) => { const n = Number(store.get(k) || 0) - Number(by); store.set(k, n); return n; },
  kvExpire: async () => {},
});
const logged = [];
stub('log-error.js', { logError: (s, e) => { logged.push(s + ': ' + (e && e.message)); }, logErrorAndFlush: async (s, e) => { logged.push(s + ': ' + (e && e.message)); } });

const fb = require(rp('fal-fallback.js'));
const alert = require(rp('_owner-alert.js'));

const PNG_B64 = Buffer.from('fal-png').toString('base64');
const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';
const calls = [];
let falMode = 'ok';
function fakeFetch(geminiStatus, geminiText) {
  return async (url, init) => {
    const u = String(url);
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ u, body, headers: (init && init.headers) || {} });
    if (/generativelanguage\.googleapis\.com/.test(u)) {
      if (geminiStatus === 200) return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('gemini-png').toString('base64') } }] } }] }), text: async () => '' };
      return { ok: false, status: geminiStatus, json: async () => ({ error: { message: geminiText } }), text: async () => JSON.stringify({ error: { message: geminiText } }) };
    }
    if (/^https:\/\/fal\.run\//.test(u)) {
      if (falMode === 'locked') return { ok: false, status: 403, text: async () => '{"detail":"User is locked. Reason: Exhausted balance."}' };
      return { ok: true, status: 200, text: async () => JSON.stringify({ images: [{ url: 'data:image/png;base64,' + PNG_B64, content_type: 'image/png' }] }) };
    }
    if (/^https:\/\/queue\.fal\.run\//.test(u)) {
      if (/\/status$/.test(u)) return { ok: true, status: 200, json: async () => ({ status: 'COMPLETED' }), text: async () => '{"status":"COMPLETED"}' };
      if (init && init.method === 'POST') return { ok: true, status: 200, text: async () => JSON.stringify({ request_id: 'req-123', status_url: 'https://queue.fal.run/google/gemini-omni-flash/requests/req-123/status', response_url: 'https://queue.fal.run/google/gemini-omni-flash/requests/req-123' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ video: { url: 'https://v3.fal.media/files/out.mp4' } }) };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}
function reset() { store.clear(); ttl.clear(); calls.length = 0; logged.length = 0; falMode = 'ok'; }

test('١. الشرط: الرصيد والفوترة الموقوفة فقط — لا الزحام ولا المفتاح المرفوض', () => {
  assert.equal(fb.geminiCreditOut(429, DEPLETED), true, '429 الرصيد المسبق');
  assert.equal(fb.geminiCreditOut(402, ''), true);
  assert.equal(fb.geminiCreditOut(403, 'BILLING_DISABLED: billing_disabled for project'), true);
  assert.equal(fb.geminiCreditOut(429, 'Resource has been exhausted (e.g. check quota).'), false, 'زحام عابر');
  assert.equal(fb.geminiCreditOut(429, 'You exceeded your current quota, please check your plan and billing details.'), false, 'حصّة الدقيقة');
  assert.equal(fb.geminiCreditOut(400, 'API key not valid. Please pass a valid API key.'), false, 'مفتاح مرفوض = عطبنا لا الرصيد');
  assert.equal(fb.geminiCreditOut(500, 'Internal error'), false);
  assert.equal(fb.falCreditOut(403, 'User is locked. Reason: Exhausted balance.'), true);
  assert.equal(fb.falCreditOut(429, 'rate limited'), false);
});

test('٢. جسم Gemini ← مدخل fal بالنموذج نفسه: الصور بالترتيب وعلاماتها، الدقّة والنسبة والحرارة والتعليمات', () => {
  const body = {
    systemInstruction: { parts: [{ text: 'Be faithful.' }] },
    contents: [{ role: 'user', parts: [{ text: 'Photo 1 of 2:' }, { inlineData: { mimeType: 'image/jpeg', data: 'AAA' } }, { text: 'Photo 2 of 2:' }, { inlineData: { mimeType: 'image/png', data: 'BBB' } }, { text: 'Put them together.' }] }],
    generationConfig: { temperature: 0.15, imageConfig: { imageSize: '2K', aspectRatio: '3:4' } },
  };
  const pro = fb.inputFromGemini('gemini-3-pro-image', body);
  assert.equal(pro.model, 'fal-ai/nano-banana-pro/edit');
  assert.deepEqual(pro.input.image_urls, ['data:image/jpeg;base64,AAA', 'data:image/png;base64,BBB']);
  assert.equal(pro.input.prompt, 'Photo 1 of 2:\n[image 1]\nPhoto 2 of 2:\n[image 2]\nPut them together.');
  assert.equal(pro.input.resolution, '2K');
  assert.equal(pro.input.aspect_ratio, '3:4');
  assert.equal(pro.input.temperature, 0.15);
  assert.equal(pro.input.system_prompt, 'Be faithful.');
  assert.equal(pro.input.sync_mode, true);
  assert.equal(fb.inputFromGemini('gemini-3.1-flash-image', body).model, 'fal-ai/nano-banana-2/edit');
  const lite = fb.inputFromGemini('gemini-2.5-flash-image', body);
  assert.equal(lite.model, 'fal-ai/nano-banana/edit');
  assert.ok(!('resolution' in lite.input) && !('temperature' in lite.input), 'النسخة الخفيفة بلا دقّة ولا حرارة');
  const t2i = fb.inputFromGemini('gemini-3-pro-image', { contents: [{ parts: [{ text: 'a red apple on a table' }] }] });
  assert.equal(t2i.model, 'fal-ai/nano-banana-pro');
  assert.equal(t2i.input.aspect_ratio, '1:1', 'بلا صورة ولا نسبة = مربّع كما يفعل Gemini');
  const hist = fb.inputFromGemini('gemini-3-pro-image', { contents: [{ role: 'user', parts: [{ text: 'draw a cat' }] }, { role: 'model', parts: [{ inlineData: { mimeType: 'image/png', data: 'CCC' } }] }, { role: 'user', parts: [{ text: 'make it orange' }] }] });
  assert.match(hist.input.prompt, /Your previous result: \[image 1\]\nmake it orange$/);
});

test('٣. الاستوديو الحقيقيّ: 429 الرصيد ← صورة fal، والعلم يُكتب، والإشعار مرّة واحدة، والطلب الثاني بلا نداء Gemini', async () => {
  reset();
  process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv';
  const sent = [];
  const realPush = alert.pushToOwners;
  // الإرسال الفعليّ مزيّف عبر حقن web-push في alertOwnerMedia
  const wp = { setVapidDetails() {}, sendNotification: async (sub, p) => { sent.push(JSON.parse(p)); } };
  store.set('db/push-subs/omran.json', null);
  const kvMod = require(rp('kv.js'));
  kvMod.kvGetJSON = async (k) => (k === 'db/push-subs/omran.json' ? { endpoint: 'https://push.test/x' } : null);
  const ownerMod = require(rp('_owner.js'));
  const realOwners = ownerMod.ownerList;
  ownerMod.ownerList = () => ['omran'];
  require.cache[require.resolve('web-push')] = { id: 'web-push', filename: require.resolve('web-push'), loaded: true, exports: wp };
  const studioCreate = require(rp('studio-create.js'));
  const realFetch = global.fetch;
  try {
    global.fetch = fakeFetch(429, DEPLETED);
    const r = await studioCreate.__geminiImage('gm-test', [{ text: 'Change only the hair to black.' }, { inlineData: { mimeType: 'image/jpeg', data: 'SRC' } }], 'hair');
    assert.equal(r.b64, PNG_B64, 'الصورة من fal');
    assert.ok(store.get(fb.OUT_KEY), 'علم «Gemini خارج الرصيد»');
    assert.equal(ttl.get(fb.OUT_KEY), 300);
    const falCall = calls.find((c) => /^https:\/\/fal\.run\//.test(c.u));
    assert.equal(falCall.u, 'https://fal.run/fal-ai/nano-banana-pro/edit');
    assert.equal(falCall.headers.Authorization, 'Key fal-test-key');
    assert.equal(falCall.body.resolution, '2K');
    assert.equal(sent.length, 1, 'إشعار واحد');
    assert.match(sent[0].title, /رصيد Gemini/);
    // الثاني خلال المهلة: مباشرة إلى fal، ولا إشعار ثانٍ
    calls.length = 0;
    const r2 = await studioCreate.__geminiImage('gm-test', [{ text: 'Change only the hair to red.' }], 'hair');
    assert.equal(r2.b64, PNG_B64);
    assert.ok(!calls.some((c) => /generativelanguage/.test(c.u)), 'بلا نداء Gemini فاشل قبله');
    assert.equal(sent.length, 1, 'لا إشعار ثانٍ خلال ٦ ساعات');
    const day = new Date().toISOString().slice(0, 10);
    assert.equal(Number(store.get(fb.spentKey(day))), 30, 'صورتان Pro 2K = ٣٠ سنتًا في العدّاد');
  } finally {
    global.fetch = realFetch; ownerMod.ownerList = realOwners; alert.pushToOwners = realPush;
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  }
});

test('٤. الزحام العاديّ لا يحوّل، وfal الموقوف يرجع للمسار القديم مع إشعار «الاحتياط رفض» ويُردّ الحجز', async () => {
  reset();
  const studioCreate = require(rp('studio-create.js'));
  const realFetch = global.fetch;
  try {
    global.fetch = fakeFetch(429, 'Resource has been exhausted (e.g. check quota).');
    const busy = await studioCreate.__geminiImage('gm-test', [{ text: 'x' }], 'hair');
    assert.ok(!busy.b64 && busy.error, 'الزحام يبقى خطأ زحام');
    assert.ok(!calls.some((c) => /fal\.run/.test(c.u)), 'لا صرف عند fal على زحام');
    reset(); falMode = 'locked';
    global.fetch = fakeFetch(402, '');
    const out = await studioCreate.__geminiImage('gm-test', [{ text: 'x' }], 'hair');
    assert.ok(!out.b64 && out.error, 'المسار القديم: خطأ «الخدمة متوقّفة»');
    assert.ok(store.get('db/alerts/media-fal-out'), 'إشعار «الاحتياط رفض» محجوز');
    const day = new Date().toISOString().slice(0, 10);
    assert.equal(Number(store.get(fb.spentKey(day)) || 0), 0, 'الحجز رُدّ: fal لم يُنتج شيئًا');
  } finally { global.fetch = realFetch; }
});

test('٥. السقف اليوميّ: فوقه لا نداء fal، وFAL_BACKUP=off أو بلا مفتاح = لا احتياط', async () => {
  reset();
  process.env.FAL_BACKUP_CAP_CENTS = '20';
  const realFetch = global.fetch;
  try {
    global.fetch = fakeFetch(429, DEPLETED);
    const a = await fb.imageFromGemini('gemini-3-pro-image', { contents: [{ parts: [{ text: 'a cat' }] }] }, { where: 't' });
    assert.ok(a.b64, 'الأولى ١٥ سنتًا تحت السقف');
    const b = await fb.imageFromGemini('gemini-3-pro-image', { contents: [{ parts: [{ text: 'a dog' }] }] }, { where: 't' });
    assert.equal(b.error, 'fal_cap', 'الثانية تتجاوز ٢٠');
    assert.equal(calls.filter((c) => /fal\.run/.test(c.u)).length, 1);
    assert.ok(store.get('db/alerts/media-fal-cap'), 'إشعار السقف');
    process.env.FAL_BACKUP = 'off';
    assert.equal(fb.enabled(), false);
    assert.equal(await fb.rescueImage(429, DEPLETED, 'gemini-3-pro-image', {}, {}), null);
    delete process.env.FAL_BACKUP;
    const k = process.env.FAL_KEY; delete process.env.FAL_KEY;
    assert.equal(fb.enabled(), false, 'بلا مفتاح');
    process.env.FAL_KEY = k;
  } finally { global.fetch = realFetch; delete process.env.FAL_BACKUP_CAP_CENTS; }
});

test('٦. الفيديو: Omni عند fal بالطابور (مرجع/إطار/نصّ)، ورقم fal/<id>، والمتابعة تعطي الرابط', async () => {
  reset();
  assert.equal(fb.videoInput({ prompt: 'p' }).model, 'google/gemini-omni-flash');
  const img = fb.videoInput({ prompt: 'p', image: { b64: 'IMG', mime: 'image/png' }, portrait: true, durationSec: 12 });
  assert.equal(img.model, 'google/gemini-omni-flash/image-to-video');
  assert.equal(img.input.image_url, 'data:image/png;base64,IMG');
  assert.equal(img.input.aspect_ratio, '9:16');
  assert.equal(img.input.duration, 10, 'السقف ١٠ ثوانٍ');
  const refs = fb.videoInput({ prompt: 'p <IMAGE_REF_0>', refs: [{ b64: 'R0' }, { b64: 'R1' }] });
  assert.equal(refs.model, 'google/gemini-omni-flash/reference-to-video');
  assert.equal(refs.input.image_urls.length, 2);
  const realFetch = global.fetch;
  try {
    global.fetch = fakeFetch(429, DEPLETED);
    const s = await fb.startVideo({ prompt: 'a dancer', image: { b64: 'IMG' }, durationSec: 8 }, { where: 'veo-create' });
    assert.equal(s.op, 'fal/req-123');
    assert.match(s.rec.s, /^https:\/\/queue\.fal\.run\//);
    const day = new Date().toISOString().slice(0, 10);
    assert.equal(Number(store.get(fb.spentKey(day))), 100, '٨ ثوانٍ × ١٢٫٥ سنت');
    const p = await fb.pollVideo(s.rec);
    assert.deepEqual(p, { state: 'SUCCEEDED', url: 'https://v3.fal.media/files/out.mp4' });
    assert.equal((await fb.pollVideo({ s: 'https://evil.test/x', r: 'https://evil.test/y' })).state, 'FAILED', 'لا مفتاح لنطاق آخر');
  } finally { global.fetch = realFetch; }
});

test('٧. «خطأ جديد» لا يصل بجانب إشعار رصيد الصور، ولا اسم مزوّد في ردّ المستخدم', async () => {
  const r = await alert.alertOwnerError({ route: 'studio', message: 'upstream 429: ' + DEPLETED }, { env: {} });
  assert.equal(r.reason === 'not-credit' || r.reason === 'media-credit', true);
  const r2 = await alert.alertOwnerError({ route: 'veo', message: 'fal submit 403 User is locked. Reason: Exhausted balance.' }, { env: {} });
  assert.equal(r2.reason, 'media-credit');
});
