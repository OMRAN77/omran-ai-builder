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
