// tests/tokens-share.test.cjs — v-tokens-shared · v-tokens-s0 · v-tokens-tail · v-tokens-owner-tools (التقييم ١١ أكتوبر: الطريق إلى ١٠/١٠ في التوكنز).
// العرض (محاكي كاش على أجسام العميل الحقيقيّة ومعالج chat.js الحقيقيّ): أوّل دور في كلّ جلسة يقرأ صفرًا (١٢٣٪ من بلا كاش) لأنّ علامة النظام
// الوحيدة بعد ذاكرة المستخدم؛ ملاحظة عميل (قواعد الصورة، مرساة «📌»، الإعلان) تقع داخل الكتلة الثابتة فتبطلها (دور الصورة ٨٧٤٠ مقابل ١٠٧٤)؛
// ذيل الدور يحمل ~١٩٠ توكنًا من قواعد الوقت والموقع الثابتة خارج الكاش في كلّ نداء؛ ولقطة المالك تبدّل قائمة الأدوات فتفوت البادئة كلّها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'tokens-share-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.OWNER_USERNAMES = 'share-owner';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CHAT_PROMPT_CACHE;
const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const db = new Map();
stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, v); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {} });
let curUser = 'u';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: curUser }) });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));
const T2 = chat.__tokens2;

const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const textReply = () => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'تمام' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
const mediaCall = (name) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu-m', name } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"prompt":"x","instruction":"x"}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
]);
const MEM = {
  sara: '[عن المستخدم]\n- الاسم: سارة، تعمل في التسويق الرقمي، تسكن أبوظبي.\n- تفضّل الإجابات المختصرة.',
  lina: '[عن المستخدم]\n- الاسم: لينا، طالبة هندسة في الشارقة.\n- تحبّ الرسم الرقميّ.',
};
const IMG = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
const ATTACHED = 'The user has ATTACHED an image with this message. You MUST look at the attached image carefully and answer based on its actual visual content in detail.';
const IMG_RULE = 'صورة مرفقة — القاعدة الأولى والأهم:\n0) إذا كتب المستخدم مع الصورة سؤالًا أو طلبًا محددًا فأجب عن طلبه هو فقط.';
const ANCHOR = '📌 موضوع هذه المحادثة الأصلي (للرجوع إليه عند الأسئلة المتصلة فقط):\n- السلام عليكم، أفكّر أفتح مشروع قهوة\n⛔ لا تفتح موضوعًا قديمًا من نفسك إذا كان سؤال المستخدم الجديد غير متعلق به.';
const AD = 'ADVERTISEMENT POSTER DESIGN — HIGHEST PRIORITY\n\nYou are a world-class Arabic advertising designer.';
const marks = (b) => JSON.stringify(b).split('"cache_control"').length - 1;
const sysText = (b) => (Array.isArray(b.system) ? b.system.map((x) => x.text).join('') : String(b.system || ''));
const lastBlocks = (b) => { const m = b.messages[b.messages.length - 1]; return typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content; };
const tailOf = (b) => { const t = lastBlocks(b).filter((x) => x.type === 'text' && String(x.text).startsWith('\n\n[سياق هذا الدور')); return t.length ? t[0].text : ''; };

async function turn(user, messages, opts) {
  const o = opts || {};
  curUser = user; db.clear();
  if (MEM[user]) db.set('db/memory/' + user + '.json', { memory: MEM[user], updatedAt: Date.now() - 3600e3, topics: [], pending: [] });
  const bodies = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    let b = {}; try { b = JSON.parse(init.body); } catch (e) { /* ليس JSON — نداء جانبيّ */ }
    if (b && b.max_tokens) { bodies.push(b); return o.onModel ? o.onModel(bodies.length) : textReply(); }
    if (o.urls) o.urls.push(String(url));
    return textReply();
  };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write(c) { if (o.writes) o.writes.push(String(c)); return true; }, end() { this.writableEnded = true; }, on() {}, flushHeaders() {} };
  try { await chat({ method: 'POST', headers: { 'x-vercel-ip-country': o.country === undefined ? 'AE' : o.country, 'x-vercel-ip-city': 'Abu%20Dhabi' }, body: Object.assign({ messages, token: token(user), provider: 'claude', tz: 'Asia/Dubai' }, o.body || {}) }, res); }
  finally { global.fetch = save; }
  return bodies;
}
const Q = [{ role: 'user', content: 'وش أفضل طريقة أسجل رخصة تجارية في أبوظبي؟' }];

test('١. v-tokens-shared: مستخدمان بذاكرة وتعليمات مختلفة — الكتلة الأولى (البصمة والإتقان) واحدة بايتًا بايتًا ومعلَّمة، وثابت كلّ مستخدم بعدها بعلامته', async () => {
  const a = (await turn('sara', Q))[0];
  const b = (await turn('lina', [{ role: 'user', content: 'كيف أتعلّم الرسم الرقميّ؟' }], { body: { customInstructions: 'ردّ بالفصحى المبسّطة واذكر مثالًا.' } }))[0];
  const c = (await turn('omar', Q))[0];
  for (const x of [a, b, c]) assert.ok(Array.isArray(x.system) && x.system[0].cache_control, 'الكتلة الأولى معلَّمة');
  assert.equal(a.system[0].text, b.system[0].text, 'بادئة النظام مشتركة بين المستخدمين (كانت تحمل ذاكرة كلّ واحد فلا تُقرأ لغيره)');
  assert.equal(c.system[0].text, a.system[0].text, 'مستخدم بلا ذاكرة ولا تعليمات: كتلته الثابتة هي المشتركة نفسها');
  assert.ok(!a.system[0].text.includes('سارة') && !b.system[0].text.includes('لينا'), 'لا شيء خاصّ بالمستخدم في المشتركة');
  assert.ok(a.system[1].cache_control && a.system[1].text.includes('سارة'), 'ثابت سارة كتلة ثانية معلَّمة');
  assert.ok(b.system[1].cache_control && b.system[1].text.includes('لينا') && b.system[1].text.includes('ردّ بالفصحى المبسّطة'), 'ثابت لينا (الذاكرة والتعليمات) بعلامته');
  assert.equal(JSON.stringify(a.tools), JSON.stringify(b.tools), 'الأدوات نفسها قبل النظام');
  for (const x of [a, b, c]) assert.ok(marks(x) <= 4, 'أربع علامات على الأكثر (الحدّ)');
  assert.equal(marks(a), 3, 'المشتركة + ثابت المستخدم + آخر رسالة');
});

test('٢. المالك والدور الاجتماعيّ على الشكل القديم: علامة نظام واحدة', async () => {
  const o = (await turn('share-owner', Q))[0];
  assert.equal(o.system.filter((x) => x.cache_control).length, 1, 'المالك: ثابته (بهويّة المزوّد) كتلة واحدة معلَّمة كما كان');
  const g = (await turn('sara', [{ role: 'user', content: 'هلا' }]))[0];
  assert.equal(g.system.filter((x) => x.cache_control).length, 1, 'التحيّة: كتلة معلَّمة واحدة');
});

test('٣. v-tokens-s0: دور نصّ ودور صورة ودور مرساة ودور إعلان — الكتلتان الثابتتان بايتًا بايتًا، وملاحظات العميل بنصّها في المتغيّر قبل قواعد الصورة', async () => {
  const plain = (await turn('sara', Q))[0];
  const image = (await turn('sara', [{ role: 'system', content: ATTACHED }, { role: 'user', content: [{ type: 'text', text: 'وش المكتوب في هذي الصورة؟' }, IMG] }, { role: 'system', content: IMG_RULE }]))[0];
  const anchor = (await turn('sara', [{ role: 'system', content: ANCHOR }].concat(Q)))[0];
  const ad = (await turn('sara', [{ role: 'system', content: AD }].concat(Q)))[0];
  for (const [name, x] of [['صورة', image], ['مرساة', anchor], ['إعلان', ad]]) {
    assert.equal(x.system[0].text, plain.system[0].text, name + ': الكتلة المشتركة كما هي');
    assert.equal(x.system[1].text, plain.system[1].text, name + ': ثابت المستخدم كما هو (كانت الملاحظة داخله فتبطله)');
    assert.equal(x.system.filter((b) => b.cache_control).length, 2);
  }
  const it = sysText(image);
  assert.ok(it.includes(ATTACHED) && it.includes(IMG_RULE), 'ملاحظتا الصورة باقيتان بنصّهما');
  assert.ok(it.indexOf(ATTACHED) < it.indexOf(IMG_RULE), 'بترتيبهما');
  assert.ok(it.indexOf(IMG_RULE) < it.indexOf(chat.__vimg.IMAGE_READ_NOTE.trim()), 'v-img-read: قاعدة العميل قبل «اقرأ اللقطة أوّلًا»');
  assert.ok(it.indexOf(IMG_RULE) > it.indexOf(MEM.sara.split('\n')[1]), 'الملاحظة بعد ذاكرة المستخدم (رأس المتغيّر)');
  assert.ok(sysText(anchor).includes(ANCHOR) && sysText(ad).includes(AD), 'المرساة والإعلان باقيان بنصّهما');
  assert.ok(!plain.system.some((b) => b.text.includes('📌')), 'بلا ملاحظات = بلا شيء زائد');
});

test('٤. v-tokens-tail: الذيل يحمل القيم وحدها، وقواعد الوقت والموقع مرّة واحدة في النظام (تُقرأ من الكاش)', async () => {
  const b = (await turn('sara', Q))[0];
  const tail = tailOf(b), sys = sysText(b);
  assert.match(tail, /\[التاريخ والوقت الآن بتوقيت جهاز المستخدم\]: .+\./);
  assert.ok(tail.includes('[تلميح موقع من الشبكة — ليس مؤكّدًا]: Abu Dhabi، '), 'المدينة والدولة في الذيل');
  assert.ok(!tail.includes('تجاهل أي تاريخ من بيانات تدريبك') && !tail.includes('قواعد إلزامية') && !tail.includes('get_location'), 'لا نصّ قاعدة في الذيل (كان ~١٩٠ توكنًا في كلّ نداء)');
  assert.ok(tail.length < 700, 'الذيل قصير: ' + tail.length + ' حرفًا');
  assert.equal(sys.split(T2.LOC_HINT_RULES).length - 1, 1, 'قواعد الموقع مرّة واحدة في النظام');
  assert.equal(sys.split(T2.NOW_RULE).length - 1, 1, 'قاعدة الوقت مرّة واحدة');
  assert.ok(sys.includes('فممنوع الجواب منها؛ استدعِ get_location'), 'v-geo-precise باقية');
  assert.ok(!sys.includes('التاريخ والوقت الآن'), 'لا وقت بالدقيقة في النظام');
  // الموقع المجهول: سطر قصير في الذيل وقاعدته في النظام
  const u = (await turn('sara', Q, { country: '' }))[0];
  assert.ok(tailOf(u).includes('\n[الموقع]: غير معروف.') && !tailOf(u).includes('لا تفترض'));
  assert.ok(sysText(u).includes(T2.LOC_UNKNOWN_RULE), 'v-no-region-assume: «لا تفترض دولة» في النظام');
  assert.equal(JSON.stringify(u.system), JSON.stringify(b.system), 'النظام لا يتبدّل بالموقع (ثابت بين الأدوار)');
  // النصّ الكامل القديم كما هو للسلسلة المجّانيّة: nowNote/countryNote = القيمة + القاعدة حرفيًّا
  assert.equal(T2.nowNote('Asia/Dubai'), T2.nowLine('Asia/Dubai') + T2.NOW_RULE);
  assert.equal(T2.countryNote('AE', 'Abu%20Dhabi'), T2.countryLine('AE', 'Abu%20Dhabi') + T2.LOC_HINT_RULES);
  assert.equal(T2.countryNote('', ''), '\n[الموقع]: غير معروف' + T2.LOC_UNKNOWN_RULE);
});

test('٥. v-tokens-owner-tools: لقطة المالك بقائمة الأدوات نفسها (بادئة الكاش)، وأدوات الصور تُرفض عند التنفيذ بلا نداء ولا سطر حالة', async () => {
  const shotMsg = [{ role: 'user', content: [IMG, { type: 'text', text: 'احذف هذا المكان' }] }];
  const normal = (await turn('share-owner', Q))[0];
  const shot = (await turn('share-owner', shotMsg, { body: { ownerUiShot: true } }))[0];
  assert.ok(shot.tools.some((t) => t.name === 'edit_image'), 'القائمة كاملة');
  assert.equal(JSON.stringify(shot.tools), JSON.stringify(normal.tools), 'الأدوات بايتًا بايتًا بين دور اللقطة والدور العاديّ');
  assert.equal(shot.system[0].text, normal.system[0].text, 'والكتلة الثابتة كذلك');
  assert.ok(tailOf(shot).includes(T2.OWNER_NO_MEDIA_NOTE), 'التنبيه في ذيل الدور');
  assert.ok(!tailOf(normal).includes(T2.OWNER_NO_MEDIA_NOTE));
  for (const name of ['edit_image', 'generate_image', 'generate_video']) {
    const writes = [], urls = [];
    const calls = await turn('share-owner', shotMsg, { body: { ownerUiShot: true }, writes, urls, onModel: (n) => (n === 1 ? mediaCall(name) : textReply()) });
    assert.ok(calls.length >= 2, name + ': جولة بعد الرفض');
    assert.ok(JSON.stringify(calls[1].messages).includes(T2.OWNER_NO_MEDIA_REFUSAL), name + ': نتيجة الأداة هي الرفض');
    assert.ok(!writes.some((w) => /stGenImage|stGenVideo|↳ /.test(w)), name + ': لا سطر «يرسم» ولا «↳»');
    assert.ok(!writes.some((w) => w.includes('"clientTool"')), name + ': لا طلب تنفيذ للعميل (runInClient)');
  }
  // رسالة المالك الطويلة (تحليل) كذلك؛ وصورة حقيقيّة من المالك (ownerUiShot:false) ترسم كما كانت
  const long = (await turn('share-owner', [{ role: 'user', content: 'سجل:\n' + 'سطر من سجلّ الأخطاء الطويل\n'.repeat(40) }]))[0];
  assert.equal(JSON.stringify(long.tools), JSON.stringify(normal.tools));
  assert.ok(tailOf(long).includes(T2.OWNER_NO_MEDIA_NOTE));
  const photo = (await turn('share-owner', shotMsg, { body: { ownerUiShot: false } }))[0];
  assert.ok(!tailOf(photo).includes(T2.OWNER_NO_MEDIA_NOTE), 'صورة حقيقيّة: أدوات الصور متاحة');
});
