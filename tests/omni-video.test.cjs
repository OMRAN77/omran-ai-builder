// tests/omni-video.test.cjs — v-omni-video: المحرّك السينمائيّ (Gemini Omni) أُضيف
// رابعًا بجانب Runway/Veo/MiniMax. متزامن عبر Interactions API. يثبت: الموجّه،
// بناء الطلب الصحيح واستخراج الفيديو من steps (fetch مزيّف + مالك يتجاوز النقاط)،
// الكلفة، والواجهة + الترجمات.
process.env.AUTH_SECRET = 'synthetic-test-secret-' + 'x'.repeat(40);
process.env.OWNER_USERNAME = 'omran';
process.env.GEMINI_API_KEY = 'g-test-key';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { makeToken } = require('../api/_lib/auth.js');

function fakeRes() {
  return { headers: {}, code: 0, body: null,
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
}

test('١. الموجّه يسجّل omni-create', () => {
  assert.ok(read('api/video.js').includes("case 'omni-create': return require('./_lib/omni-create.js');"));
});

test('٢. omni-create: طلب Interactions صحيح ويرجّع رابط veo-download من uri', async () => {
  const handler = require('../api/_lib/omni-create.js');
  const realFetch = global.fetch;
  let sent = null;
  global.fetch = async (url, init) => {
    sent = { url: String(url), body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({
      object: 'interaction', status: 'completed', id: 'v1_x',
      steps: [
        { type: 'user_input', content: [{ type: 'text', text: 'hi' }] },
        { type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://generativelanguage.googleapis.com/v1beta/files/AB:download?alt=media' }] },
      ],
    }) };
  };
  const res = fakeRes();
  await handler({ method: 'POST', body: { promptText: 'قطة تلعب', ratio: '720:1280', token: makeToken('omran') } }, res);
  global.fetch = realFetch;
  // الطلب: نقطة Interactions، النموذج، وطلب الفيديو كـuri بنسبة عموديّة
  assert.ok(/\/v1beta\/interactions$/.test(sent.url), 'نقطة Interactions');
  assert.equal(sent.body.model, 'gemini-omni-1.1-flash');
  assert.equal(sent.body.response_format.type, 'video');
  assert.equal(sent.body.response_format.delivery, 'uri');
  assert.equal(sent.body.response_format.aspect_ratio, '9:16');
  assert.ok(Array.isArray(sent.body.input) && sent.body.input.some((b) => b.type === 'text'), 'input نصّيّ');
  // الردّ: رابط عبر بروكسي veo-download
  assert.equal(res.code, 200);
  assert.ok(/^\/api\/video\?action=veo-download&uri=/.test(res.body.url), 'رابط veo-download');
});

test('٣. omni-create: صورة مرفقة تدخل input، والاكتمال بلا فيديو = خطأ', async () => {
  const handler = require('../api/_lib/omni-create.js');
  const realFetch = global.fetch;
  // صورة → input يحوي عنصر image
  let sent = null;
  global.fetch = async (url, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => ({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/Z:download?alt=media' }] }] }) }; };
  let res = fakeRes();
  await handler({ method: 'POST', body: { promptText: 'حرّكها', imageBase64: 'AAAA', imageMime: 'image/jpeg', token: makeToken('omran') } }, res);
  assert.ok(sent.input.some((b) => b.type === 'image' && b.mime_type === 'image/jpeg'), 'صورة في input');
  // اكتمال بلا فيديو (محجوب) → 502
  global.fetch = async () => ({ ok: true, json: async () => ({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'blocked' }] }] }) });
  res = fakeRes();
  await handler({ method: 'POST', body: { promptText: 'x', token: makeToken('omran') } }, res);
  assert.equal(res.code, 502);
  global.fetch = realFetch;
});

/* v-omni-store / v-video-stream (المالك بلقطة: «الفيديوات كلّها ما تشتغل») — العطل وصل الإنتاج لأنّ
   الـfetch المزيّف أعلاه يردّ ok:true دائمًا ولا يفحص store ولا المهلة. هذي الاختبارات تسدّ الثغرة. */
test('٥. طلب الفيديو كرابط يشترط store:true، ومهلة خاصّة تتجاوز حارس الثلاثين ثانية', async () => {
  const handler = require('../api/_lib/omni-create.js');
  const realFetch = global.fetch;
  let sent = null, init0 = null;
  global.fetch = async (url, init) => {
    init0 = init; sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/Q:download?alt=media' }] }] }) };
  };
  const res = fakeRes();
  await handler({ method: 'POST', body: { promptText: 'مشهد', token: makeToken('omran') } }, res);
  global.fetch = realFetch;
  // الجذر: delivery:'uri' مع store:false يرفضه المزوّد («store=true is required…») قبل التوليد
  assert.equal(sent.response_format.delivery, 'uri');
  assert.equal(sent.store, true, 'delivery=uri يشترط store=true');
  assert.equal(sent.background, false);
  assert.equal(sent.stream, false);
  // الجدار الثاني: بلا signal يقطع حارس _fetch-timeout النداء عند ٣٠ث والتوليد المتزامن يحجب دقائق
  assert.ok(init0.signal, 'بلا signal خاصّ يُجهَض النداء عند ٣٠ ثانية');
  assert.equal(typeof init0.signal.aborted, 'boolean');
  assert.equal(res.code, 200);
});

test('٦. فشل النداء يستّرجع النقاط ويفكّ القفل ولا يسرّب اسم مزوّد', async () => {
  const path2 = require.resolve('../api/_lib/points.js');
  const realPoints = require.cache[path2];
  const refunds = [];
  require.cache[path2] = { id: path2, filename: path2, loaded: true, exports: {
    COSTS: { omni_video: 350 },
    verifyPointsToken: () => 'sara',
    requireConfirmation: () => null,
    spendPoints: async () => ({ ok: true, owner: false }),
    refundPoints: async (u, n) => { refunds.push([u, n]); },
  } };
  const ag = require.resolve('../api/_lib/abuse-guard.js');
  const realAg = require.cache[ag];
  const unlocks = [];
  require.cache[ag] = { id: ag, filename: ag, loaded: true, exports: {
    videoLock: async () => ({ ok: true }), releaseVideoLock: async (u) => { unlocks.push(u); },
  } };
  delete require.cache[require.resolve('../api/_lib/omni-create.js')];
  const handler = require('../api/_lib/omni-create.js');
  const realFetch = global.fetch;
  global.fetch = async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; };
  const res = fakeRes();
  await handler({ method: 'POST', body: { promptText: 'مشهد', token: makeToken('sara'), confirmPoints: true } }, res);
  global.fetch = realFetch;
  if (realPoints) require.cache[path2] = realPoints; else delete require.cache[path2];
  if (realAg) require.cache[ag] = realAg; else delete require.cache[ag];
  delete require.cache[require.resolve('../api/_lib/omni-create.js')];
  assert.equal(res.code, 500);
  assert.deepEqual(refunds, [['sara', 350]], 'النقاط لم تُسترجع عند انقطاع الشبكة');
  assert.deepEqual(unlocks, ['sara'], 'قفل الفيديو لم يُفكّ');
  assert.doesNotMatch(String(res.body.error), /GEMINI|Gemini|Omni|Veo|MiniMax|Proxy error/, 'اسم مزوّد أو نصّ تقنيّ في رسالة المستخدم');
  assert.match(String(res.body.error), /تعذّر توليد الفيديو/);
});

test('٧. بروكسي التسليم يبثّ المقطع ولا يحمّله في الذاكرة (حدّ جسم الردّ ٤٫٥م)', async () => {
  const src = read('api/_lib/veo-download.js');
  assert.doesNotMatch(src, /arrayBuffer\(\)/, 'ما زال يحمّل المقطع كاملًا');
  assert.match(src, /getReader\(\)/, 'لا بثّ');
  assert.match(src, /once\('drain'/, 'بلا backpressure');
  assert.doesNotMatch(src, /GEMINI_API_KEY' \}\)|Veo download error/, 'اسم مزوّد في رسالة المستخدم');
  // تشغيل فعليّ: مقطع ٦م يصل كاملًا قطعة قطعة
  const handler = require('../api/_lib/veo-download.js');
  const realFetch = global.fetch;
  const CHUNK = 512 * 1024, N = 12; // ٦ ميغابايت — فوق حدّ ٤٫٥م لو حُمّل دفعة واحدة
  let i = 0;
  global.fetch = async () => ({
    ok: true, status: 200,
    headers: { get: (k) => (k === 'content-type' ? 'video/mp4' : (k === 'content-length' ? String(CHUNK * N) : null)) },
    body: { getReader: () => ({ read: async () => (i++ < N ? { done: false, value: new Uint8Array(CHUNK) } : { done: true }) }) },
  });
  let written = 0, ended = false;
  const res = Object.assign(fakeRes(), {
    write(b) { written += b.length; return true; },
    once() {}, end() { ended = true; return this; },
  });
  await handler({ query: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/A:download?alt=media' } }, res);
  global.fetch = realFetch;
  assert.equal(res.code, 200);
  assert.equal(written, CHUNK * N, 'لم يصل المقطع كاملًا');
  assert.ok(ended, 'الردّ لم يُغلق');
  assert.equal(res.headers['Content-Type'], 'video/mp4');
});

test('٨. فحص المفتاح قبل خصم النقاط في مسار Veo', () => {
  const src = read('api/_lib/veo-create.js');
  const key = src.indexOf('const apiKey = process.env.GEMINI_API_KEY;');
  const spend = src.indexOf('spendPoints(');
  assert.ok(key > 0 && spend > 0 && key < spend, 'فحص المفتاح ما زال بعد الخصم — تحترق نقاط المستخدم');
  assert.doesNotMatch(src.slice(key, key + 320), /error: 'Server is missing/, 'اسم المفتاح يظهر للمستخدم');
});

test('٤. الكلفة والواجهة والترجمات', () => {
  assert.ok(/omni_video:\s*\d+/.test(read('api/_lib/points.js')), 'كلفة omni_video');
  assert.ok(read('js/partials-core.js').includes('value="omni"'), 'خيار omni في القائمة');
  const client = read('js/app-11-video.js');
  assert.ok(client.includes("creationMode === 'omni'") && client.includes('action=omni-create'), 'فرع العميل');
  const i18n = read('js/app-03-i18n-data.js');
  assert.ok((i18n.match(/videoModeOmni/g) || []).length >= 2, 'ترجمة الحزمة (عربي+إنجليزي)');
  const langs = fs.readdirSync(path.join(root, 'i18n')).filter((f) => f.endsWith('.js') && read('i18n/' + f).includes('videoModeMinimax'));
  for (const f of langs) assert.ok(read('i18n/' + f).includes('videoModeOmni'), 'ترجمة videoModeOmni في ' + f);
});

console.log('✓ omni-video: المحرّك السينمائيّ (Gemini Omni) مضاف رابعًا — موجّه، طلب Interactions، واجهة وترجمات');
