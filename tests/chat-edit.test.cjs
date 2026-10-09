// tests/chat-edit.test.cjs — v-chat-edit (المالك ٩ أكتوبر: «اشبك المحادثة مع التصميم… غيّر كذا وسوّ لي كذا»، ولقطة
// «مطاردة في شوارعك»: «الكود الموجود بالمحادثة مقطوع عند step» ودالّة منفصلة لم تُطبَّق).
// الجذر: الخادم كان يقصّ رسالة كود المشروع عند ٦٠ ألف حرف (المالك) و١٢ ألفًا (غيره)، والتجربة ٧٥–٨٣ ألفًا؛ والموديل لا يستطيع
// إعادة ملفّ بهذا الحجم في ردّ واحد؛ وstripMemoryUrls يمسح روابط CDN داخل الكود. الآن: الكود كاملًا، والتعديل رقع تُطبَّق كلّها
// أو لا شيء، وملفّ كبير انقطع لا يحلّ محلّ التصميم.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'chat-edit-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
let usageUser = 'omran';
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }),
});
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (text) => new Response([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
async function run(user, body, route) {
  usageUser = user;
  const calls = [], out = [], save = global.fetch;
  global.fetch = async (url, init) => { let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; } calls.push({ url: String(url), body: b }); return route(String(url), b); };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user) }, body) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, events, text: events.map((e) => e.delta || '').join('') };
}
const up = (r) => r.calls.find((c) => /openrouter\.ai|api\.anthropic\.com/.test(c.url));
const CHASE = read('inspire/city/chase.html');
const codeMsg = (code) => ({ role: 'assistant', content: '```html\n' + code + '\n```' });

// ── الخادم ──
test('١. كود المشروع (٨٠ ألف حرف وأكثر) يصل الموديل كاملًا — للمالك ولغيره، ولو طالت المحادثة', async () => {
  const code = CHASE + '<!--END-OF-DESIGN-->';
  assert.ok(code.length > 70000);
  const route = (u) => (/openrouter\.ai|api\.anthropic\.com/.test(u) ? sse('تمّ.') : new Response('{}', { status: 404 }));
  const o = await run('omran', { provider: 'deepseek', noTools: true, messages: [codeMsg(code), { role: 'user', content: 'عدّل السيارة خلّها زرقاء' }] }, route);
  assert.ok(JSON.stringify(up(o).body.messages).includes('END-OF-DESIGN'), 'المالك: الكود كاملًا (كان يُقصّ عند ٦٠ ألفًا)');
  // غير المالك بمحادثة طويلة (تتجاوز ٣٦ ألف حرف و١٦ رسالة): الضغط كان يرمي رسالة الكود كلّها
  const hist = [];
  for (let i = 0; i < 12; i++) hist.push({ role: 'user', content: 'سؤال ' + i + ' ' + 'ب'.repeat(2000) }, { role: 'assistant', content: 'جواب ' + i + ' ' + 'ج'.repeat(2000) });
  const v = await run('vipuser', { provider: 'claude', messages: [codeMsg(code), ...hist, { role: 'user', content: 'عدّل السيارة' }] }, route);
  const vm0 = up(v).body.messages;
  const flat = JSON.stringify(vm0);
  assert.ok(flat.includes('END-OF-DESIGN'), 'المشترك: الكود باقٍ رغم الضغط');
  assert.equal(vm0[0].role, 'user', 'المحادثة تبدأ بدور مستخدم (أنثروبيك يرفض بداية assistant)');
  assert.ok(flat.indexOf('END-OF-DESIGN') < flat.indexOf('عدّل السيارة'), 'الكود قبل الطلب');
});

test('٢. رسالة نظام بعد دور المستخدم لا تسرق سقفه: الطلب الطويل يصل كاملًا', async () => {
  const route = (u) => (/openrouter\.ai|api\.anthropic\.com/.test(u) ? sse('تمّ.') : new Response('{}', { status: 404 }));
  const big = 'طلب ' + 'د'.repeat(90000) + ' <!--USER-END-->';
  const r = await run('vipuser', { provider: 'claude', messages: [{ role: 'user', content: big }, { role: 'system', content: 'قاعدة أخيرة' }] }, route);
  assert.ok(JSON.stringify(up(r).body).includes('USER-END'), 'كان يُقصّ عند ١٢ ألفًا لأنّ «الأخير» صار رسالة النظام');
});

test('٣. روابط الكود داخل ``` لا تُمسح (CDN وخوادم الخرائط)، وروابط النثر المختلقة تُمسح كما كانت', async () => {
  const reply = 'غيّرت لون السيارة. المصدر https://made-up.example.com/x\n```patch\n@@PATCH\n@@OLD\n<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>\n@@NEW\n<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>\n\n\n<!--x-->\n@@END\n```';
  const r = await run('omran', { provider: 'claude', messages: [{ role: 'user', content: 'غيّر' }] }, (u) => (/api\.anthropic\.com|openrouter/.test(u) ? sse(reply) : new Response('{}', { status: 404 })));
  const fin = (r.events.find((e) => typeof e.patch === 'string') || {}).patch;
  assert.ok(fin, 'حدث التنظيف وصل (رابط النثر أُزيل)');
  assert.ok(!fin.includes('made-up.example.com'), 'رابط النثر المختلق يُمسح');
  assert.ok(fin.includes('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js'), 'رابط الكود باقٍ');
  assert.ok(fin.includes('</script>\n\n\n<!--x-->'), 'أسطر الكود الفارغة لا تُضغط');
});

// ── العميل ──
function loadClient() {
  const src = read('js/app-06-checkout.js');
  const a = src.indexOf('function substUserImage(code){'), b = src.indexOf('function throwProviderError(');
  assert.ok(a > 0 && b > a);
  const ctx = { window: {}, __swallow() {}, getCurrent: () => null, t: (k) => k, console };
  vm.runInNewContext(src.slice(a, b) + '\nthis.X = { extractReply, omranEditParse, omranEditApply, omranEditAsk, OMRAN_EDIT_BIG };', ctx);
  return ctx.X;
}
const P = (oldS, newS) => '@@PATCH\n@@WHY سبب\n@@OLD\n' + oldS + '\n@@NEW\n' + newS + '\n@@END\n';

test('٤. رقعة على «مطاردة في شوارعك» نفسها تُطبَّق، والباقي حرفيًّا كما هو، وشرحها بلا الكود', () => {
  const X = loadClient();
  const OLD = '    const paint = new THREE.MeshPhongMaterial({ color: 0xff4a1c, shininess: 90, specular: 0x777777 });';
  assert.equal(CHASE.split(OLD).length, 2, 'السطر فريد في الملفّ');
  const reply = 'خلّيت السيارة زرقاء.\n```patch\n' + P(OLD, OLD.replace('0xff4a1c', '0x1c6dff')) + '```';
  const r = X.extractReply(reply, CHASE);
  assert.equal(r.codeType, 'html');
  assert.equal(r.code.length, CHASE.length);
  assert.ok(r.code.includes('color: 0x1c6dff') && !r.code.includes('color: 0xff4a1c'));
  assert.equal(r.code.replace('0x1c6dff', '0xff4a1c'), CHASE, 'لا تغيير غيره');
  assert.match(r.explanation, /^خلّيت السيارة زرقاء\./);
  assert.doesNotMatch(r.explanation, /@@PATCH|@@OLD/);
  assert.match(r.explanation, /طُبّقت التعديلات على التصميم \(1\)/);
  assert.equal(r.edits.applied, 1);
});

test('٥. كلّها أو لا شيء: رقعة لا يطابق قديمها (أو تطابق مرّتين) = لا تغيير ورسالة صريحة؛ و<div في الرقعة ليس «ملفًّا كاملًا»', () => {
  const X = loadClient();
  const base = '<!doctype html><html><body>\n<div class="a">1</div>\n<div class="a">1</div>\n<p id="t">قديم</p>\n</body></html>';
  const good = P('<p id="t">قديم</p>', '<p id="t">جديد</p>');
  const miss = P('<p id="t">غير موجود</p>', '<div>x</div>');
  const twice = P('<div class="a">1</div>', '<div class="a">2</div>');
  for (const bad of [miss, twice]) {
    const r = X.extractReply('تعديل\n```patch\n' + good + bad + '```', base);
    assert.equal(r.code, '', 'لا كود = لا يُستبدل المشروع');
    assert.ok(r.edits && r.edits.failed === 1 && r.edits.total === 2);
    assert.match(r.explanation, /ما طبّقت التعديل/);
  }
  const ok = X.extractReply('```patch\n' + good + '```', base);
  assert.equal(ok.code, base.replace('قديم', 'جديد'));
});

test('٦. تسامح المسافة البادئة (الموديل يغيّر الإزاحة) والحذف و$ في البديل', () => {
  const X = loadClient();
  const base = 'function a() {\n    if (x) {\n        go(1);\n    }\n}\n';
  const r = X.omranEditApply(base, [{ old: 'if (x) {\n  go(1);\n}', neu: 'if (x) {\n  go("$&$1");\n  log();\n}' }]);
  assert.ok(r.ok);
  assert.equal(r.code, 'function a() {\n    if (x) {\n      go("$&$1");\n      log();\n    }\n}\n', 'بإزاحة الأصل، و$ حرفيّة');
  const d = X.omranEditApply(base, [{ old: '        go(1);', neu: '' }]);
  assert.ok(d.ok); assert.equal(d.code, 'function a() {\n    if (x) {\n    }\n}\n');
  const cs = X.omranEditParse('@@PATCH\n@@OLD\nhttps@@CS@@a.b/c\n@@NEW\nhttps@@CS@@a.b/d\n@@END');
  assert.equal(cs.blocks[0].old, 'https://a.b/c', 'بديل app-24 للروابط مقبول');
});

test('٧. حارس التصميم الكبير: ملفّ كامل انقطع قبل </html> لا يحلّ محلّه؛ الملفّ الكامل والصغير كما كانا', () => {
  const X = loadClient();
  const cut = 'تمّ:\n```html\n' + CHASE.slice(0, 50000);
  const r = X.extractReply(cut, CHASE);
  assert.equal(r.code, '', 'المقطوع لا يمحو ٨٠ ألف حرف');
  assert.ok(r.edits.truncated);
  assert.match(r.explanation, /الردّ انقطع قبل اكتمال الملفّ/);
  const whole = X.extractReply('```html\n<!doctype html><html><body>جديد</body></html>\n```', CHASE);
  assert.match(whole.code, /جديد/, 'ملفّ كامل جديد يُقبل');
  const small = X.extractReply('```html\n<!doctype html><html><body>ناقص', '<!doctype html><html><body>صغير</body></html>');
  assert.match(small.code, /ناقص/, 'المشروع الصغير: السلوك القديم');
  assert.equal(X.extractReply('```html\n<div>x</div>\n```').code, '<div>x</div>', 'بلا base: كما كان');
});

test('٨. التعليمة تُلحق بالدور الحاليّ فوق الحدّ فقط، والوكيل والإصلاح الذاتيّ وGemini لا يمحون التصميم', () => {
  const X = loadClient();
  assert.equal(X.OMRAN_EDIT_BIG, 24000);
  assert.match(X.omranEditAsk(83000), /83000/);
  assert.match(X.omranEditAsk(83000), /```patch[\s\S]*@@OLD[\s\S]*@@NEW[\s\S]*@@END/);
  const a9 = read('js/app-09-attach.js');
  assert.ok(a9.includes("if(cur && cur.code && cur.codeType !== 'python' && cur.code.length > OMRAN_EDIT_BIG) out += omranEditAsk(cur.code.length);"));
  assert.ok(a9.includes('let { code, explanation, codeType } = extractReply(reply, cur.code);'));
  assert.ok(a9.includes('const parsed = extractReply(full, cur.code);'));
  assert.ok(a9.includes('if(!(parsed && parsed.edits) && idx >= 0 && (full.length - idx) > 300){'), 'رقعة مرفوضة لا تُلتقط كودًا ناقصًا');
  assert.ok(a9.includes('if(!code && !__edits && isBuildTask && !__gateNoBuild){'), 'لا طلب «الملفّ كاملًا» بعد رقعة');
  const a6 = read('js/app-06-checkout.js');
  assert.ok(a6.includes('if(code.length > OMRAN_EDIT_BIG) return code;'), 'الإصلاح الذاتيّ لا يطلب ملفًّا كبيرًا كاملًا');
  // Gemini: دور الكود في المقدّمة يبقى بعد دور مستخدم
  const g = a6.slice(a6.indexOf('function sanitizeGeminiContents'), a6.indexOf('// ===== Checkout'));
  const ctx = {}; vm.runInNewContext(g + '\nthis.f = sanitizeGeminiContents;', ctx);
  const out = ctx.f([{ role: 'model', parts: [{ text: '```html\n<b>x</b>\n```' }] }, { role: 'user', parts: [{ text: 'غيّر' }] }]);
  assert.equal(JSON.stringify(out.map((c) => c.role)), '["user","model","user"]');
  const out2 = ctx.f([{ role: 'model', parts: [{ text: 'مرحبًا' }] }, { role: 'user', parts: [{ text: 'س' }] }]);
  assert.equal(JSON.stringify(out2.map((c) => c.role)), '["user"]', 'مقدّمة غير الكود تُرمى كما كانت');
  const ag = read('api/_lib/agent.js');
  assert.match(ag, /String\(currentCode\)\.slice\(0, 300000\)/);
  assert.match(ag, /الكود الحالي للمشروع/);
  assert.ok(read('js/app.bundle.js').includes('function omranEditApply(base, blocks)'), 'الحزمة مطابقة');
});

test('٩. النصوص الثلاثة بالـ١٤ لغة ووسم اللغات 728', () => {
  const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'ml', 'fil', 'id', 'zh', 'ru', 'tr', 'es'];
  const K = ['editApplied', 'editFailed', 'editTruncated'];
  const d = read('js/app-03-i18n-data.js');
  const blk = d.slice(d.indexOf('/* v-chat-edit'), d.indexOf('/* v650 */'));
  const c = { I18N: { ar: {}, en: {} } }; vm.runInNewContext(blk, c);
  for (const l of ['ar', 'en']) for (const k of K) assert.ok(c.I18N[l][k], l + ':' + k);
  assert.match(c.I18N.ar.editApplied, /\{n\}/);
  for (const l of LANGS) {
    const x = { I18N: {}, window: {}, document: { documentElement: {} }, localStorage: { getItem: () => null } }; x.I18N[l] = {}; x.window.I18N = x.I18N;
    vm.runInNewContext(read('i18n/' + l + '.js'), x);
    for (const k of K) assert.ok(x.I18N[l][k] && x.I18N[l][k].trim(), l + ':' + k);
    assert.match(x.I18N[l].editApplied, /\{n\}/, l);
  }
  assert.ok(read('js/app-04-i18n-state.js').includes("'i18n/' + lg + '.js?v=728'"));
});
