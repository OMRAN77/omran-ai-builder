'use strict';
/* v-religion-owner — المالك (٢١ سبتمبر): «التفسير الديني كان يفسّر كل الأديان والحين يفسّر شي واحد»،
   ثمّ «الأحلام ماتفتح فقط الي الديانه الاسلاميه». الجذر: api/ai.js كان ينزع نظام العميل لحساب المالك
   (v-owner-raw2، ١٧ سبتمبر) فلا يصل موجّه الأحلام الستّة أيّ مزوّد، وتقوية النصّ لم تصله أصلًا.
   القرار: النزع صار اختياريًّا بـraw:true كما في chat.js (v-owner-full)، والتبويبات ثلاثة بأمر المالك. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
process.env.AUTH_SECRET = 'religion-tools-test-secret';

const STUDIOS = fs.readFileSync(path.join(root, 'js/app-12-studios.js'), 'utf8');
const PROMPTS_AT = STUDIOS.indexOf('const SYSTEM_PROMPTS = {');
const PROMPTS = STUDIOS.slice(PROMPTS_AT, STUDIOS.indexOf('\n  };', PROMPTS_AT));
const DREAM = (PROMPTS.match(/\n\s*dream: '([^']+)'/) || [])[1];

const PROVIDERS = ['claude', 'gemini', 'openai', 'groq'];
const captured = {};
for (const p of PROVIDERS) {
  const r = require.resolve(path.join(root, 'api/_lib', p + '.js'));
  require.cache[r] = { id: r, filename: r, loaded: true, exports: async (req, res) => { captured[p] = JSON.parse(JSON.stringify(req.body)); res.status(200).json({ ok: true }); } };
}
const hive = require.resolve(path.join(root, 'api/_lib/collective.js'));
require.cache[hive] = { id: hive, filename: hive, loaded: true, exports: { block: () => '' } };
const ai = require('../api/ai.js');

function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}

const DREAM_Q = 'حلمت أني أطير فوق البحر ثمّ سقطت في الماء';
// شكل الجسم كما يبنيه العميل في js/app-06-checkout.js لكلّ مزوّد عبر الوسيط.
function bodyFor(a, extra) {
  if (a === 'claude') return Object.assign({ model: 'm', system: DREAM, messages: [{ role: 'user', content: DREAM_Q }], stream: true, mode: 'balanced' }, extra);
  if (a === 'gemini') return Object.assign({ model: 'm', contents: [{ role: 'user', parts: [{ text: DREAM_Q }] }], systemInstruction: { parts: [{ text: DREAM }] }, stream: true, mode: 'balanced' }, extra);
  const b = { model: 'm', messages: [{ role: 'system', content: DREAM }, { role: 'user', content: DREAM_Q }], stream: true };
  if (a === 'openai') b.mode = 'balanced';
  return Object.assign(b, extra);
}
function systemOf(a, b) {
  if (a === 'claude') return String(b.system || '');
  if (a === 'gemini') return ((b.systemInstruction && b.systemInstruction.parts) || []).map((p) => String(p.text || '')).join('\n');
  return (b.messages || []).filter((m) => m && m.role === 'system').map((m) => String(m.content || '')).join('\n');
}
async function systemSent(a, extra) {
  delete captured[a];
  const res = { headers: {}, setHeader() {}, getHeader() {}, status() { return this; }, json() { return this; }, end() { return this; }, write() {} };
  await ai({ method: 'POST', query: { action: a }, headers: { 'x-vercel-ip-country': 'AE' }, body: bodyFor(a, extra), url: '/api/ai?action=' + a }, res);
  assert.ok(captured[a], a + ': الطلب وصل المزوّد');
  return systemOf(a, captured[a]);
}
const hasDream = (s) => s.includes('ابن سيرين') && s.includes('فرويد') && s.includes('جميع التفسيرات الستة');

test('١. المالك: موجّه الأحلام الستّة يصل كلّ مزوّد عبر الوسيط (لا يُنزع افتراضيًّا)', async () => {
  assert.ok(DREAM, 'موجّه الأحلام مقروء من app-12-studios.js');
  for (const a of PROVIDERS) {
    const s = await systemSent(a, { token: token('omran') });
    assert.ok(hasDream(s), a + ': موجّه الأحلام وصل المزوّد لحساب المالك');
    assert.ok(s.includes('تعليمات المالك') || s.includes('[التاريخ'), a + ': ملاحظة الخادم ما زالت تُحقن بعد الموجّه');
  }
});

test('٢. المالك مع raw:true: خام كما كان — النزع اختياريّ لا افتراضيّ', async () => {
  for (const a of PROVIDERS) {
    const s = await systemSent(a, { token: token('omran'), raw: true });
    assert.ok(!s.includes('ابن سيرين'), a + ': raw:true ينزع نظام العميل');
  }
});

test('٣. المستخدم العاديّ: الموجّه يصل كما كان', async () => {
  for (const a of PROVIDERS) {
    const s = await systemSent(a, { token: token('someuser') });
    assert.ok(hasDream(s), a + ': موجّه الأحلام وصل المزوّد للمستخدم');
  }
});

test('٤. ثلاثة تبويبات فقط (آية، حديث، أحلام) ولكلّ تبويب موجّه', () => {
  const core = fs.readFileSync(path.join(root, 'js/partials-core.js'), 'utf8');
  const tabsAt = core.indexOf('id="religionTabs"');
  const tabsHtml = core.slice(tabsAt, core.indexOf('</div>', tabsAt));
  const tools = [...tabsHtml.matchAll(/class="btn religionTabBtn[^"]*" data-tool="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tools, ['verse', 'hadith', 'dream']);
  const keys = [...PROMPTS.matchAll(/\n\s{4}([a-z]+): '/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['verse', 'hadith', 'dream'], 'SYSTEM_PROMPTS مطابق للتبويبات — لا تبويب بلا موجّه ولا موجّه بلا تبويب');
});

test('٥. موجّه الأحلام يفرض التفسيرات الستّة', () => {
  assert.match(DREAM, /يجب عليك دائماً تقديم جميع التفسيرات الستة/);
  for (const mark of ['☪️', '✝️', '✡️', '🕉️', '🧠', '🌍']) assert.ok(DREAM.includes(mark), 'القسم ' + mark + ' موجود');
});

test('٦. نصوص التبويبات الثلاثة في الـ١٤ لغة، ولا أثر للأديان الأربعة المحذوفة', () => {
  const KEYS = ['Verse', 'Hadith', 'Dream'].flatMap((x) => ['religionTab' + x, 'religionInputLabel' + x, 'religionInputPlaceholder' + x]);
  const GONE = /religion(Tab|InputLabel|InputPlaceholder)(Bible|Torah|Buddhism|Hinduism)/;
  const keyRe = (k) => new RegExp('["\']?' + k + '["\']?\\s*:', 'g');
  const data = fs.readFileSync(path.join(root, 'js/app-03-i18n-data.js'), 'utf8');
  for (const k of KEYS) assert.ok((data.match(keyRe(k)) || []).length >= 2, 'ar/en: ' + k);
  assert.doesNotMatch(data, GONE, 'app-03-i18n-data.js بلا مفاتيح الأديان الأربعة');
  for (const lang of ['fr', 'hi', 'ur', 'bn', 'ne', 'ru', 'es', 'zh', 'fil', 'id', 'tr', 'ml']) {
    const src = fs.readFileSync(path.join(root, 'i18n', lang + '.js'), 'utf8');
    for (const k of KEYS) assert.ok(keyRe(k).test(src), lang + ': ' + k);
    assert.doesNotMatch(src, GONE, lang + ': بلا مفاتيح الأديان الأربعة');
  }
  for (const f of ['js/partials-core.js', 'js/app-12-studios.js', 'js/app.bundle.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, f), 'utf8'), GONE, f + ': بلا أثر للأديان الأربعة');
  }
});
