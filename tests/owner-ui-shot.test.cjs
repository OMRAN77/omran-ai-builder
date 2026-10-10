// tests/owner-ui-shot.test.cjs — v-owner-ui-shot-client: لقطة المالك + «احذف هذا المكان» تصل المحادثة لا محرّر الصور.
// العرض: لقطة المالك ١٠ أكتوبر — «احذف هذا المكان» مع لقطة من التطبيق ← «جارٍ إنشاء الصورة». إصلاح #967 كان في الخادم،
// لكنّ العميل يرسلها إلى /api/maha-image قبله (مسبار محلّيّ بـsendPrompt الحقيقيّ). وفي المسبار نفسه: «سوّ لي فيديو إعلان»
// كانت تخرج صورة إعلان، و«حط شعار … في الصفحة الرئيسية» للمالك كانت تجلب صور شعارات من البحث.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const C = require('../api/_lib/owner-carry.js');
const src = read('js/app-09-attach.js');

function clientRe(name) {
  const m = src.match(new RegExp('const ' + name + ' = (/.+/[a-z]*);\\n'));
  assert.ok(m, name + ' موجود في العميل');
  return vm.runInNewContext(m[1]);
}
function clientFn(user) {
  const start = src.indexOf('const OMRAN_UI_VERB_RE');
  const end = src.indexOf('\n}\n', src.indexOf('function omranOwnerUiShotTurn')) + 3;
  assert.ok(start > 0 && end > start);
  const ctx = { authGet: () => user };
  vm.runInNewContext(src.slice(start, end) + '\nthis.f = omranOwnerUiShotTurn;', ctx);
  return ctx.f;
}

test('تعابير العميل نسخة حرفيّة من تعابير الخادم (uiEditTurn)', () => {
  assert.equal(clientRe('OMRAN_UI_VERB_RE').source, C.UI_VERB_RE.source);
  assert.equal(clientRe('OMRAN_UI_REF_RE').source, C.UI_REF_RE.source);
  assert.equal(clientRe('OMRAN_UI_IMG_RE').source, C.IMG_WORD_RE.source);
});

test('الخادم: ملاحظة المرفقات التي يُلحقها العميل لا تُقرأ كلمة صورة', () => {
  assert.equal(C.uiEditTurn('احذف هذا المكان\n\n[مرفقات: image.png]'), true);
  assert.equal(C.uiEditTurn('احذف هذا المكان\n\n[attachments: image.png, Screenshot 2026.png]'), true);
  assert.equal(C.uiEditTurn('احذف الخلفية من الصورة\n\n[مرفقات: pasted-1.png]'), false);
  assert.equal(C.uiEditTurn('[مرفقات: image.png]'), false);
});

test('omranOwnerUiShotTurn: لقطة المالك + أمر على عنصر = تعديل التطبيق، وصورة الكاميرا تبقى تعديل صورة', () => {
  const f = clientFn('omran');
  const shot = { isImage: true, _screenshot: true };
  const photo = { isImage: true };
  assert.equal(f('احذف هذا المكان', shot), true);
  assert.equal(f('كبّر هذا', shot), true);
  assert.equal(f('غيّر لون هذا للأخضر', shot), true);
  assert.equal(f('شيل الزر هذا', photo), true, 'عنصر واجهة مسمًّى يكفي بلا علامة لقطة');
  assert.equal(f('احذف هذا المكان', photo), false, 'صورة بلا علامة لقطة وبلا عنصر مسمًّى = تعديل صورة كما كان');
  assert.equal(f('شيل الشجرة هذي', photo), false);
  assert.equal(f('احذف الخلفية من الصورة', shot), false);
  assert.equal(f('وش هذا؟', shot), false);
  assert.equal(f('', shot), false);
  assert.equal(f('احذف هذا المكان', { isImage: true, _screenshot: true, _fromMemory: true }), false, 'صورة الذاكرة ليست مرفقًا جديدًا');
  assert.equal(f('احذف هذا المكان', null), false);
  assert.equal(clientFn('ahmed')('احذف هذا المكان', shot), false, 'للمالك وحده');
  assert.equal(clientFn('')('احذف هذا المكان', shot), false);
});

test('الربط: بوّابة الوسائط تُقفل لدور اللقطة قبل أوّل مسار وسائط، ولا يُحقن دور «المساعد البصري»', () => {
  const gate = src.indexOf("const __ownerUiShot = omranOwnerUiShotTurn(text, pendingAttachments.filter(a => a && a.isImage).slice(-1)[0]);\n  if(__ownerUiShot) __mediaLane = 'none';");
  assert.ok(gate > 0, 'البوّابة موجودة');
  assert.ok(gate < src.indexOf('if(text && __VID_MAKE_RE.test(text)'), 'قبل مسار الفيديو');
  assert.ok(gate < src.indexOf('const __ATT_EDIT = '), 'قبل مسار تعديل الصورة');
  assert.ok(src.includes("if(imageAttachments.length && !cur.adMode && !__ownerUiShot && imageAttachments.some(a => a && a._screenshot)){"));
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('function omranOwnerUiShotTurn(text, att){'), 'الحزمة مبنيّة');
});

test('v-video-ad-route: «سوّ لي فيديو إعلان» تفتح صانع الفيديو، وإعلان الفيديو لا يذهب لصورة الإعلان', () => {
  const m = src.match(/const __VID_MAKE_RE = (\/.+\/i);\n/);
  assert.ok(m);
  const VID = vm.runInNewContext(m[1]);
  assert.ok(VID.test('سوّ لي فيديو إعلان لمطعم'));
  assert.ok(VID.test('سو فيديو عن دبي'));
  assert.ok(VID.test('سوي لي فيديو عن دبي'), 'كما كان');
  assert.ok(!VID.test('سوّ لي شعار لشركة'), 'لا فيديو = لا صانع فيديو');
  assert.ok(src.includes("else if(text && __adIntentRe.test(text) && !__blockAutoImage && __mediaLane !== 'none' /* v-media-gate */ && !/(?:فيديو|ڤيديو|video|clip|reel)/i.test(text) /* v-video-ad-route"), 'مسار صورة الإعلان يتخطّى طلب الفيديو');
});

test('v-owner-logo-place: «حط شعار … في الصفحة الرئيسية» للمالك لا تجلب صور شعارات', () => {
  assert.match(src, /const __isLogoFetch = [^\n]*&& !__ownerAppPlace;/);
  const m = src.match(/const __ownerAppPlace = [^\n]*\n\s*&& (\/.+\/i)\.test\(text\);/);
  assert.ok(m);
  const PLACE = vm.runInNewContext(m[1]);
  assert.ok(PLACE.test('حط شعار الدائرة الاقتصادية في الصفحة الرئيسية'));
  assert.ok(!PLACE.test('عطني شعار شرطة دبي'), 'جلب الشعار الرسميّ كما كان');
});

test('الخادم حين يصله دور اللقطة من العميل: المالك بلا أدوات صور ومعه ملاحظة اللقطة، وغيره كما كان', async () => {
  const crypto = require('node:crypto');
  process.env.AUTH_SECRET = 'owner-ui-shot-test-secret';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  delete process.env.ANTHROPIC_API_KEY;
  process.env.OWNER_USERNAMES = 'ui-owner';
  const rp = (f) => require.resolve(path.join(root, f));
  const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
  const db = new Map();
  stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? db.get(k) : null), kvPutJSON: async (k, v) => { db.set(k, v); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {} });
  stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: 'u' }) });
  stub('api/_lib/search.js', { fetchPlaces: async () => [] });
  const chat = require(rp('api/_lib/chat.js'));
  const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
  const done = new Response('data: ' + JSON.stringify({ type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } }) + '\n'
    + 'data: ' + JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }) + '\n'
    + 'data: ' + JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'تمام' } }) + '\n'
    + 'data: ' + JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }) + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  async function send(user) {
    const bodies = [];
    const save = global.fetch;
    global.fetch = async (url, o) => { try { bodies.push(JSON.parse(o.body)); } catch (e) { bodies.push({}); } return done.clone(); };
    // شكل الدور كما يبنيه العميل (app-06-checkout.js): صورة base64 + النصّ وملاحظة المرفقات.
    const content = [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }, { type: 'text', text: 'احذف هذا المكان\n\n[مرفقات: image.png]' }];
    const req = { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content }], token: token(user), provider: 'claude' } };
    const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() {}, end() {} };
    try { await chat(req, res); } finally { global.fetch = save; }
    const up = bodies.find((b) => b && Array.isArray(b.tools));
    assert.ok(up, user + ': وصل طلب المزوّد بأدوات');
    const sys = Array.isArray(up.system) ? up.system.map((b) => b.text || '').join('\n') : String(up.system || '');
    return { tools: up.tools.map((t) => t.name), sys };
  }
  const owner = await send('ui-owner');
  assert.ok(!owner.tools.includes('edit_image') && !owner.tools.includes('generate_image'), 'المالك: أدوات الصور مرفوعة');
  assert.ok(owner.tools.includes('edit_github') && owner.tools.includes('read_github'), 'المالك: أدوات الكود حاضرة');
  assert.ok(owner.sys.includes('[لقطة من التطبيق — هذا الدور]'), 'المالك: ملاحظة اللقطة في النظام');
  const user = await send('someone');
  assert.ok(user.tools.includes('edit_image'), 'غير المالك كما كان');
  assert.ok(!user.sys.includes('[لقطة من التطبيق — هذا الدور]'));
});
