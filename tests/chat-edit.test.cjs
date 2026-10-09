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
function loadClient(win) {
  const src = read('js/app-06-checkout.js');
  const a = src.indexOf('function substUserImage(code){'), b = src.indexOf('function throwProviderError(');
  assert.ok(a > 0 && b > a);
  const ctx = { window: win || {}, __swallow() {}, getCurrent: () => null, t: (k) => k, console };
  vm.runInNewContext(src.slice(a, b) + '\nthis.X = { extractReply, omranEditParse, omranEditApply, omranEditAsk, omranEditScriptErrors, OMRAN_EDIT_BIG };', ctx);
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
  assert.ok(a6.includes('if(code.length > OMRAN_HEAL_MAX) return code;'), 'الإصلاح الذاتيّ لا يطلب ملفًّا أكبر من ردّ واحد');
  assert.ok(a6.includes("const fixed = extractReply((res && res.reply) || '', current);"), 'وردّه يُقرأ بحارس التصميم');
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

test('٩. نصوص النتيجة الخمسة بالـ١٤ لغة ووسم اللغات 728', () => {
  const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'ml', 'fil', 'id', 'zh', 'ru', 'tr', 'es'];
  const K = ['editApplied', 'editFailed', 'editTruncated', 'editPartial', 'editBroke'];
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
  assert.ok(read('js/app-04-i18n-state.js').includes("'i18n/' + lg + '.js?v=731'"));
});

// ── المراجعة المعاكسة (٢٠ ملاحظة مؤكَّدة) ──
const ASK = '\n\n[تعديل تصميم كبير — إلزاميّ إن طلبتُ أيّ تغيير]: كود مشروعي الحاليّ في رسالة سابقة، طوله 87873 حرفًا\n```patch\n@@PATCH\n@@OLD\n(…)\n@@NEW\n(…)\n@@END\n```\n' + 'ق'.repeat(700);
test('١٠. تعليمة الرقع الملحقة لا تغيّر تصنيف الدور على الخادم: الأدوات والتحيّة كما بلا تعليمة، والتعليمة تصل الموديل', async () => {
  const route = (u) => (/openrouter\.ai|api\.anthropic\.com/.test(u) ? sse('تمّ.') : new Response('{}', { status: 404 }));
  const body = (txt) => ({ provider: 'claude', messages: [codeMsg(CHASE), { role: 'user', content: txt }] });
  for (const q of ['وش أحدث إصدار من three؟', 'ارسم لي صورة قطة', 'كيف حالك']) {
    const plain = up(await run('vipuser', body(q), route)).body;
    const withAsk = up(await run('vipuser', body(q + ASK), route)).body;
    const names = (b) => JSON.stringify((b.tools || []).map((t) => t.name).sort());
    assert.equal(names(withAsk), names(plain), q + ': الأدوات نفسها (كانت تنطفئ كلّها)');
    assert.equal(withAsk.max_tokens, plain.max_tokens, q + ': سقف الردّ نفسه (التحيّة ٣٥٠ لا ١٦ ألفًا)');
    if (q !== 'كيف حالك') assert.ok(JSON.stringify(withAsk.messages).includes('تعديل تصميم كبير'), q + ': التعليمة نفسها تصل الموديل');
  }
  const src = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'latin1');
  assert.ok(src.includes("    : '').replace(/\\n\\n\\[") , 'القصّ على lastUserText وحده');
});

test('١١. رقعة انقطعت (حدّ الردّ) أو كتلة معطوبة = لا شيء يُطبَّق ورسالة «وصل ناقصًا»؛ نسيان @@END مع سياج مغلق مقبول', () => {
  const X = loadClient();
  const base = '<!doctype html><html><body>\n<p id="a">أ</p>\n<p id="b">ب</p>\n<script>\nfunction init(){ go(1); }\n</script>\n</body></html>' + '\n<!--' + 'x'.repeat(30000) + '-->';
  const good = P('<p id="a">أ</p>', '<p id="a">أأ</p>');
  const cut = '```patch\n' + good + '@@PATCH\n@@WHY ب\n@@OLD\nfunction init(){ go(1); }\n@@NEW\nfunction init(){ go(2';
  const cases = {
    'انقطع وسط @@NEW': cut,
    'انقطع وسط @@OLD': '```patch\n' + good + '@@PATCH\n@@OLD\n<p id="b">',
    'قديم فارغ': '```patch\n' + good + '@@PATCH\n@@OLD\n@@NEW\n<p>جديد</p>\n@@END\n```',
    '@@REPLACE بدل @@NEW': '```patch\n' + good + '@@PATCH\n@@OLD\n<p id="b">ب</p>\n@@REPLACE\n<p id="b">بب</p>\n@@END\n```',
    'الجديد قبل القديم': '```patch\n' + good + '@@PATCH\n@@NEW\n<p id="b">بب</p>\n@@OLD\n<p id="b">ب</p>\n@@END\n```',
    'بلا @@END ونثر بعد السياج وهو مفتوح': '```patch\n' + good + '@@PATCH\n@@OLD\n<p id="b">ب</p>\n@@NEW\n<p id="b">بب</p>\n``` جرّبها الحين',
  };
  for (const [k, txt] of Object.entries(cases)) {
    const r = X.extractReply('عدّلت.\n' + txt, base);
    assert.equal(r.code, '', k + ': لا يُستبدل المشروع');
    assert.ok(r.edits && r.edits.partial >= 1, k);
    assert.match(r.explanation, /وصل ناقصًا/, k);
    assert.doesNotMatch(r.explanation, /@@OLD|go\(2/, k + ': بلا كود في الفقاعة');
  }
  const noEnd = X.extractReply('عدّلت.\n```patch\n@@PATCH\n@@OLD\n<p id="b">ب</p>\n@@NEW\n<p id="b">بب</p>\n```\nجرّبها الحين', base);
  assert.equal(noEnd.code, base.replace('<p id="b">ب</p>', '<p id="b">بب</p>'), 'سياج مغلق على سطره يغني عن @@END، والنثر بعده لا يدخل الكود');
  assert.match(noEnd.explanation, /^عدّلت\.\n\nجرّبها الحين\n\nطُبّقت/);
});

test('١٢. التكرار: الكتلة نفسها مرّتين تُطبَّق مرّة، وقديم واحد بجديدين = تعارض لا يُطبَّق؛ ومسوّدة <think> لا تُحسب', () => {
  const X = loadClient();
  const base = '<!doctype html><html><body>\n<script>\nconst hud = document.createElement("div");\n</script>\n</body></html>' + 'x'.repeat(30000);
  const OLD = 'const hud = document.createElement("div");';
  const ins = P(OLD, OLD + '\nconst speedo = 1;');
  const twice = X.extractReply('أضفت العدّاد.\n```patch\n' + ins + '```\nالخلاصة:\n```patch\n' + ins + '```', base);
  assert.equal(twice.code.split('const speedo').length, 2, 'إعلان واحد لا اثنان');
  assert.equal(X.omranEditScriptErrors(twice.code), 0);
  const clash = X.extractReply('```patch\n' + ins + P(OLD, OLD + '\nconst speedo = 2;') + '```', base);
  assert.equal(clash.code, '');
  assert.ok(clash.edits.partial === 1);
  const think = X.extractReply('<think>مسوّدة:\n```patch\n' + P(OLD, OLD + '\nconst speedo = 0;') + '```</think>\n```patch\n' + ins + '```', base);
  assert.equal(think.code.split('const speedo').length, 2);
  assert.ok(think.code.includes('const speedo = 1;') && !think.code.includes('speedo = 0'));
  assert.doesNotMatch(think.explanation, /think|مسوّدة/);
});

test('١٣. رقعة تكسر صياغة السكربت لا تُطبَّق («كان سيكسر الكود»)، وخطأ قديم في الأصل لا يمنع رقعة سليمة', () => {
  const X = loadClient();
  const OLD = '    const paint = new THREE.MeshPhongMaterial({ color: 0xff4a1c, shininess: 90, specular: 0x777777 });';
  const broke = X.extractReply('خلّيتها خضراء.\n```patch\n' + P(OLD, '    const paint = new THREE.MeshPhongMaterial({ color: 0x22aa44;') + '```', CHASE);
  assert.equal(broke.code, '');
  assert.ok(broke.edits.broke);
  assert.match(broke.explanation, /كان سيكسر كود التصميم/);
  assert.equal(X.omranEditScriptErrors(CHASE), 0, 'سكربتات التجربة سليمة أصلًا');
  const pre = CHASE.replace('</body>', '<script>var x = ;</script>\n</body>');
  const ok = X.extractReply('```patch\n' + P(OLD, OLD.replace('0xff4a1c', '0x1c6dff')) + '```', pre);
  assert.ok(ok.code.includes('0x1c6dff'), 'الخطأ السابق لا يُحسب على الرقعة');
  assert.equal(X.omranEditScriptErrors('<script type="module">import x from "y";</script><script type="application/json">{"a":</script><script src="a.js"></script>'), 0, 'الوحدات وJSON والخارجيّ لا تُفحص');
});

// مقتطف فوق ٢٠٠ حرف — يلتقطه مسار v490 ويغلّفه بمستند كامل فيه </html>
const SNIP = '<div id=speedo>0</div>\n<script>let v = 0; setInterval(() => { v++; document.getElementById("speedo").textContent = v; }, 100);</script>\n<style>#speedo{position:fixed;top:12px;left:12px;padding:6px 10px;background:#000;color:#fff;font:600 14px system-ui}</style>';
test('١٤. لا يحلّ محلّ التصميم الكبير: رقعة لم تُقرأ، ومقتطف بلا رأس مستند، وملفّ «كامل» مختصر بتعليق؛ والملفّ الجديد الكامل يُقبل', () => {
  const X = loadClient();
  const replies = {
    'بلا رأس @@PATCH': 'غيّرت.\n```patch\n@@WHY ب\n@@OLD\n</body>\n</html>\n@@NEW\n<div id="s"></div>\n</body>\n</html>\n@@END\n```',
    'حروف صغيرة': 'غيّرت.\n```patch\n@@patch\n@@old\n<div>a</div></html>\n@@new\n<div>b</div></html>\n@@end\n```',
    'diff موحّد': 'غيّرت.\n```diff\n- <div>a</div>\n+ <div>b</div>\n</html>\n```',
    'مقتطف بلا سياج': 'أضفت عدّاد السرعة:\n' + SNIP,
    'مقتطف نهاية الملفّ': 'ضعه قبل نهاية الملفّ:\n```html\n<div id="s"></div>\n<script>let s = 1;</script>\n</body></html>\n```',
    'ملفّ مختصر': '```html\n' + CHASE.slice(0, 1500) + '\n// ... باقي الكود كما هو ...\n</script></body></html>\n```',
  };
  for (const [k, txt] of Object.entries(replies)) {
    const r = X.extractReply(txt, CHASE);
    assert.equal(r.code, '', k + ': التصميم يبقى');
    assert.ok(r.edits && r.edits.partial, k);
    assert.doesNotMatch(r.explanation, /@@|<div|<script/i, k + ': بلا كود في الفقاعة');
  }
  const fresh = X.extractReply('```html\n<!doctype html><html><body><h1>لعبة جديدة</h1><script>let a = 1;</script></body></html>\n```', CHASE);
  assert.match(fresh.code, /لعبة جديدة/, 'ملفّ جديد كامل يُقبل كما كان');
  const small = X.extractReply('أضفت:\n' + SNIP, '<!doctype html><html><body>صغير</body></html>');
  assert.ok(small.code, 'المشروع الصغير: مسار المقتطف القديم كما هو');
});

test('١٥. الإزاحة النسبيّة تبقى (بايثون)، وصور الأداة في الرقعة تُستبدل، والشرح لا يسرّب الكود ولو كان في الجديد ```', () => {
  const X = loadClient({ __genImages: { __IMG_1__: 'data:image/png;base64,AAAA' } });
  const py = 'def f(x):\n    for i in x:\n        if i:\n            g(i)\n    return 1\n';
  const r = X.omranEditApply(py, [{ old: '  for i in x:\n      if i:\n          g(i)\n  return 1', neu: '  for i in x:\n      if i:\n          g(i)\n  return 2' }]);
  assert.ok(r.ok);
  assert.equal(r.code, 'def f(x):\n    for i in x:\n        if i:\n            g(i)\n    return 2\n', 'return خارج الحلقة كما كان');
  const base = '<!doctype html><html><body>\n<div id="hero"></div>\n</body></html>' + 'x'.repeat(30000);
  const img = X.extractReply('```patch\n' + P('<div id="hero"></div>', '<div id="hero"><img src="__IMG_1__"></div>') + '```', base);
  assert.ok(img.code.includes('src="data:image/png;base64,AAAA"') && !img.code.includes('__IMG_1__'));
  const md = X.extractReply('دعمت كتل الكود.\n```patch\n' + P('<div id="hero"></div>', '<div id="hero"></div>\n<script>function md(s){ return s.replace(/```(\\w+)?/g, "<pre>"); }</script>') + '```\nجرّبها.', base);
  assert.ok(md.code.includes('function md(s)'));
  assert.equal(md.explanation, 'دعمت كتل الكود.\n\nجرّبها.\n\nطُبّقت التعديلات على التصميم (1).');
  const a6 = read('js/app-06-checkout.js');
  const ls = a6.slice(a6.indexOf('function liveStripCode(text){'), a6.indexOf('function stripCodeFromChat('));
  const c = { localStorage: { getItem: () => 'ar' } }; vm.runInNewContext(ls + '\nthis.f = liveStripCode;', c);
  assert.equal(c.f('غيّرتها:\n@@PATCH\n@@OLD\nconst paint = 1;'), 'غيّرتها:\n\n⏳ يكتب الكود الآن…', 'رقعة بلا سياج لا تُبثّ خامًا');
});

test('١٦. المسارات: البوّابة والعنوان والتاريخ وإعادة «اسأل الكلّ» والوكيل والصوت', () => {
  const a9 = read('js/app-09-attach.js');
  assert.ok(a9.includes('&& !omranEditBigOpen(getCurrent())){'), 'تعديل على تصميم كبير لا يدخل بوّابة البناء');
  assert.ok(a9.includes('if(cur.messages.length === 0 && !cur.inspire){'), 'التجربة تبقى باسمها');
  assert.ok(a9.includes("(role === 'assistant' && !m.code && cur.code) ? String(__src || '').replace(/```[\\s\\S]*?```/g, '[مقتطف كود في الردّ — لم يُطبَّق على المشروع]')"), 'مقتطف لم يُطبَّق لا يُروى «نجاحًا»');
  assert.ok(a9.includes('const __r2 = extractReply(__strictReply, cur.code);'), 'إعادة «اسأل الكلّ» تُقرأ بالحارس');
  assert.ok(a9.includes("cur.codeType = parsed.edits ? (cur.codeType || 'html') : (parsed.codeType || 'html');"), 'رقعة الوكيل لا تغيّر نوع المشروع');
  assert.equal(a9.split('(omranEditBigOpen(cur) ? OMRAN_EDIT_APPROVE_NOTE : \'\')').length, 3, 'رسالتا الموافقة تقولان «رقعًا» على تصميم كبير');
  const v = read('js/app-07-voice.js');
  assert.ok(v.includes("content: promptText + (omranEditBigOpen(cur) ? omranEditAsk(cur.code.length) : '')") && v.includes('extractReply(reply, cur.code)'), 'الصوت كالمحادثة');
  // الوكيل: نصّ الرسالة ذيل ما بعد آخر خطوة + سطر النتيجة
  const fn = a9.slice(a9.indexOf('async function __agentApplyResult('), a9.indexOf('const agentMsg = {', a9.indexOf('async function __agentApplyResult(')));
  const X = loadClient();
  const base = '<!doctype html><html><body>\n<p id="a">أ</p>\n</body></html>' + 'x'.repeat(30000);
  const ctx = { extractReply: X.extractReply, omranEditParse: X.omranEditParse, stripCodeFromChat: (s) => String(s).replace(/```[\s\S]*?```/g, '').trim(), t: (k) => k, lang: 'ar' };
  vm.runInNewContext(fn + 'this.out = { chatText, codeProducedThisTurn }; }\nthis.run = __agentApplyResult;', ctx);
  const cur = { code: base, codeType: 'html' };
  const full = 'خطّتي: أقرأ الملفّ ثمّ أعدّل.\nعدّلت الفقرة.\n```patch\n' + P('<p id="a">أ</p>', '<p id="a">أأ</p>') + '```';
  return ctx.run(cur, full, { log: [{ t: 'text' }, { t: 'tool' }], tail: 'عدّلت الفقرة.\n```patch\n' + P('<p id="a">أ</p>', '<p id="a">أأ</p>') + '```' }).then(() => {
    assert.ok(cur.code.includes('أأ'));
    assert.equal(ctx.out.chatText, 'عدّلت الفقرة.\n\nطُبّقت التعديلات على التصميم (1).', 'بلا تكرار سرد الخطوات');
  });
});
