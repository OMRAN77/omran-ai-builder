// tests/liked-reply.test.cjs — v-liked-reply (المالك ٢٠ أكتوبر «موضوع التعميم مش بالمستوى المطلوب»).
// كانت «عجبني» درسًا يستخرجه الموديل إن استدعى teach_users: إن لم يستدعها (أكثر المزوّدين) لم يُعمَّم شيء، وإن استدعاها وصل الناسَ وصفُ
// الطريقة لا الردّ نفسه. الآن الخادم يحفظ الردّ الذي أعجب المالك مع سؤاله، منشورًا لكلّ المستخدمين وكلّ المزوّدين، قبل ردّ الدور، ويُحقن
// ما يناسب موضوع رسالة كلّ مستخدم منه ومن المعمّم (صلة الكلمات ثمّ الأحدث). يثبت بـchat.js الحقيقيّ (مزوّد وهميّ يسجّل النظام المرسَل).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'liked-reply-secret';
process.env.OPENROUTER_API_KEY = 'test-or-key';
process.env.ANTHROPIC_API_KEY = 'test-anth-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'OWNER_USERNAMES']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
let usageUser = 'omran';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }) });
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const PS = require(rp('api/_lib/prov-self.js'));
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (evs) => new Response(evs.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'm', usage: { input_tokens: 1, output_tokens: 0 } } });
const textTurn = (t) => sse([start(), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }]);
const sysOf = (b) => (typeof b.system === 'string' ? b.system : Array.isArray(b.system) ? b.system.map((x) => x.text || '').join('') : '');

// دور محادثة بالمعالج الحقيقيّ: script = ردود المزوّد الوهميّ بالترتيب؛ يرجع الأجسام المرسَلة ونظام أوّلها
async function turn(user, provider, text, script, history) {
  usageUser = user;
  const bodies = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (!/openrouter\.ai\/api\/v1\/messages|api\.anthropic\.com\/v1\/messages/.test(u)) return new Response('{}', { status: 404 });
    bodies.push(JSON.parse(init.body));
    return (script[Math.min(i++, script.length - 1)])();
  };
  const req = { method: 'POST', headers: {}, body: { token: token(user), provider, messages: history || [{ role: 'user', content: text }] } };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() { return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  return { bodies, sys: bodies[0] ? sysOf(bodies[0]) : '' };
}
const blockOf = (sys, head) => { const at = sys.indexOf(head); if (at < 0) return ''; const end = sys.indexOf('\n\n[', at + head.length); return sys.slice(at, end > 0 ? end : undefined); };

const Q = 'وش أفضل بذور للزراعة في حوش البيت بالإمارات؟';
const A = 'أفضل البذور للزراعة في حوش البيت بالإمارات في الشتاء: الطماطم الكرزيّة، والخيار البلديّ، والفلفل الحلو، والجرجير، والبقدونس. '
  + 'ازرعها من أكتوبر إلى فبراير، واسقِ الصباح الباكر، والتربة مخلوطة ببيتموس وسماد عضويّ. للتواصل: 0501234567 أو omran@example.com';

test('١ — إعادة الإنتاج: «عجبني» وموديل لا يستدعي الأداة — الخادم يحفظ الردّ بنفسه ويصل كلّ مستخدم على كلّ مزوّد', async () => {
  db.clear(); PS.__resetCache();
  const hist = [{ role: 'user', content: Q }, { role: 'assistant', content: A }, { role: 'user', content: 'عجبني' }];
  const r = await turn('omran', 'groq', '', [() => textTurn('✅ عُمِّم على الجميع — طريقة البذور.')], hist);
  assert.ok(r.sys.includes('[أمر «عجبني»') && r.sys.includes('لا تسأل «وش تقصد»') && r.sys.includes('حفظه الآن'), 'أمر الدور: محفوظ، لا سؤال');
  assert.ok(db.has('db/liked.json'), 'حُفظ بلا استدعاء أداة (كان لا يُحفظ شيء)');
  const items = db.get('db/liked.json').items;
  assert.equal(items.length, 1);
  assert.equal(items[0].q, Q);
  assert.ok(items[0].text.includes('الطماطم الكرزيّة') && items[0].text.includes('سماد عضويّ'), 'الردّ نفسه لا وصفه');
  assert.equal(items[0].by, 'groq');
  assert.equal(items[0].scope, 'all', 'سؤال وردّ عامّان بلا شيء شخصيّ = للمستخدمين أيضًا');
  assert.ok(r.sys.includes('ونُشر لكلّ المستخدمين لأنّه عامّ'), 'أمر الدور يقول إنّه نُشر');
  assert.ok(!items[0].text.includes('0501234567') && !items[0].text.includes('omran@example.com') && items[0].text.includes('«محذوف»'), 'الهاتف والإيميل يُحذفان');
  for (const p of ['gemini', 'deepseek', 'claude', 'openrouter']) {
    const u = await turn('vipuser', p, 'ابي ازرع بذور في حوش بيتي', [() => textTurn('…')]);
    assert.ok(u.sys.includes(PS.LIKED_HEAD) && u.sys.includes('— سؤال: ' + Q) && u.sys.includes('— ردّ معتمد: ') && u.sys.includes('الطماطم الكرزيّة'), 'يصل المستخدم · ' + p);
    assert.ok(!u.sys.includes('[أمر «عجبني»'), 'أمر الدور للمالك وحده · ' + p);
  }
  const o = await turn('omran', 'mistral', 'وش أزرع بالشتاء؟', [() => textTurn('…')]);
  assert.ok(o.sys.includes('الطماطم الكرزيّة'), 'والمالك على مزوّد آخر');
  const same = await turn('omran', 'groq', '', [() => textTurn('…')], hist.concat([{ role: 'assistant', content: '✅ عُمِّم على الجميع.' }, { role: 'user', content: 'زين، وش كمان أزرع؟' }]));
  assert.ok(!same.sys.includes(PS.LIKED_HEAD), 'في المحادثة نفسها لا يُعاد ما فيها');
  await turn('omran', 'groq', '', [() => textTurn('…')], hist);
  assert.equal(db.get('db/liked.json').items.length, 1, '«عجبني» ثانيةً على الردّ نفسه لا تضاعف');
});

test('٢ — النفي لا يحفظ؛ وبلا ردّ سابق يسأل بسطر؛ وغير المالك لا يعمّم', async () => {
  db.clear(); PS.__resetCache();
  for (const neg of ['ما عجبني هالردّ', 'مو عاجبني', 'لا يعجبني']) {
    await turn('omran', 'claude', '', [() => textTurn('…')], [{ role: 'user', content: Q }, { role: 'assistant', content: A }, { role: 'user', content: neg }]);
    assert.ok(!db.has('db/liked.json'), 'النفي: ' + neg);
  }
  const r = await turn('omran', 'claude', 'عجبني', [() => textTurn('…')]);
  assert.ok(r.sys.includes('لا ردّ سابق في هذه المحادثة'), 'بلا ردّ سابق: يسأل بسطر');
  assert.ok(!db.has('db/liked.json'));
  await turn('vipuser', 'claude', '', [() => textTurn('…')], [{ role: 'user', content: Q }, { role: 'assistant', content: A }, { role: 'user', content: 'عجبني' }]);
  assert.ok(!db.has('db/liked.json'), 'غير المالك لا يعمّم');
  // سطر التأكيد وسؤال المعنى لا يُحفظان ردًّا معتمدًا — يُؤخذ الردّ الحقيقيّ قبلهما
  await turn('omran', 'claude', '', [() => textTurn('…')], [{ role: 'user', content: Q }, { role: 'assistant', content: A }, { role: 'user', content: 'عمّم' }, { role: 'assistant', content: 'صارت عند العشرة.' }, { role: 'user', content: 'عجبني' }]);
  const it = db.get('db/liked.json').items;
  assert.equal(it.length, 1); assert.ok(it[0].text.includes('الطماطم الكرزيّة')); assert.equal(it[0].q, Q, 'السؤال الأصليّ لا «عمّم»');
});

test('٣ — الصلة: المستخدم يأخذ الردود المعتمدة الأقرب لسؤاله لا الأحدث وحدها، ضمن السقف؛ وبلا موضوع الأحدث', async () => {
  db.clear(); PS.__resetCache();
  const topics = ['بذور الزراعة في الحوش', 'تصليح مكيّف السيارة', 'وصفة كبسة اللحم', 'تسجيل شركة في دبي', 'أفضل جوّال للتصوير', 'فتح مطعم جديد', 'دراسة الماجستير في بريطانيا', 'تذاكر الطيران الرخيصة', 'تربية القطط', 'تعلّم البرمجة'];
  const items = [];
  for (let i = 0; i < 40; i++) { const t = topics[i % topics.length]; items.push({ id: 'K' + i, q: 'سؤال ' + i + ': ' + t, text: 'ردّ معتمد رقم ' + i + ' عن ' + t + ' ' + 'م'.repeat(1400), by: 'claude', at: i, scope: 'all' }); }
  db.set('db/liked.json', { items });
  const u = await turn('vipuser', 'gemini', 'ابي اسوي كبسة لحم اليوم', [() => textTurn('…')]);
  const blk = blockOf(u.sys, PS.LIKED_HEAD);
  assert.ok(blk && blk.length <= PS.LIKED_INJECT, 'ضمن السقف (' + blk.length + ')');
  for (const i of [2, 12, 22, 32]) assert.ok(blk.includes('ردّ معتمد رقم ' + i + ' عن وصفة كبسة'), 'الكبسة كلّها، القديمة والجديدة · ' + i);
  assert.ok(!blk.includes('ردّ معتمد رقم 38 '), 'الأحدث غير المتّصل لا يزاحم المتّصل');
  assert.ok(blk.indexOf('رقم 2 عن') < blk.indexOf('رقم 32 عن'), 'العرض بترتيبه الزمنيّ');
  const g = await turn('vipuser', 'gemini', 'هلا', [() => textTurn('…')]);
  assert.ok(g.sys.includes('ردّ معتمد رقم 39 ') && !g.sys.includes('ردّ معتمد رقم 2 عن'), 'بلا موضوع: الأحدث');
  // وحدة: الحذف لا يمسّ التواريخ والأسعار
  assert.equal(PS.redactPii('الموعد 2026-10-20 12:30 والسعر 12000 درهم و١٢٬٠٠٠ درهم'), 'الموعد 2026-10-20 12:30 والسعر 12000 درهم و١٢٬٠٠٠ درهم');
  assert.equal(PS.redactPii('اتّصل +971 50 123 4567 أو 050-123-4567 أو a.b+c@mail.co'), 'اتّصل «محذوف» أو «محذوف» أو «محذوف»');
});

test('٤ — مخزن المالك المعمّم: المعلومة القديمة المتّصلة بالسؤال تصل المزوّد ضمن ٤٠ ألف توكن بدل الأحدث وحده؛ وبلا موضوع كما كان', async () => {
  db.clear(); PS.__resetCache();
  const big = []; for (let i = 0; i < 100; i++) big.push({ id: 'g' + i, text: (i === 3 ? 'المالك: كم سعر الذهب اليوم؟\nسعر غرام الذهب ٤٢٠ درهمًا. ' : 'معلومة رقم ' + i + ' ') + 'م'.repeat(3990), at: i, by: 'claude' });
  db.set('db/owner-gen.json', { items: big });
  const r = await turn('omran', 'groq', 'بكم غرام الذهب؟', [() => textTurn('…')]);
  const blk = blockOf(r.sys, PS.GEN_HEAD);
  assert.ok(blk.includes('سعر غرام الذهب ٤٢٠'), 'القديم المتّصل يُحقن (كان يسقط لأنّه ليس من الأحدث)');
  assert.ok(blk.includes('معلومة رقم 99 ') && blk.includes('معلومة رقم 80 '), 'والأحدث معه');
  assert.ok(blk.length <= PS.GEN_INJECT, 'ضمن ٤٠ ألف توكن (' + blk.length + ')');
  assert.ok(blk.indexOf('سعر غرام الذهب') < blk.indexOf('معلومة رقم 99 '), 'بترتيبه الزمنيّ');
  const g = await turn('omran', 'groq', 'هلا', [() => textTurn('…')]);
  assert.ok(!g.sys.includes('سعر غرام الذهب ٤٢٠') && g.sys.includes('معلومة رقم 99 '), 'بلا موضوع: الأحدث كما كان');
  assert.equal(PS.genBlock([{ text: 'أ'.repeat(80) }, { text: 'ب'.repeat(80) }], PS.GEN_HEAD.length + 80, '', 'كمّل').length, PS.GEN_HEAD.length + 80, 'بلا صلة: القصّ القديم');
});

test('٥ — الربط: المسارات الثلاثة تمرّر سؤال المستخدم، ووصف الأداة يقول إنّ الخادم حفظ، والسقف ٦٠ يبقي الأحدث، والمسار القديم يستلم', async () => {
  const chatSrc = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');
  const agentSrc = fs.readFileSync(path.join(root, 'api/_lib/agent.js'), 'utf8');
  const aiSrc = fs.readFileSync(path.join(root, 'api/ai.js'), 'utf8');
  assert.ok(chatSrc.includes(": { lastUserText: lastUserText } /* v-liked-reply"), 'المحادثة تمرّر السؤال لغير المالك');
  assert.ok(chatSrc.includes("nowNote(body && body.tz) + __provSelfSys"), 'السلسلة المجّانيّة تأخذ الكتل');
  assert.ok(agentSrc.includes(": { lastUserText: living.lastUserText(messages) } /* v-liked-reply */"), 'الوكيل');
  assert.ok(aiSrc.includes("systemBlocks(!!b.__ownerFactory, action, { lastUserText: lastUserText(action, b) }"), 'المسار القديم');
  assert.match(PS.TEACH_TOOL.description, /الخادم يحفظ ردّك نفسه مع سؤاله/);
  assert.match(PS.TEACH_TOOL.description, /«عجبني» = تعميم بخطوة واحدة/);
  assert.match(PS.TEACH_TOOL.description, /«عمّم» ليست هذه الأداة/);
  db.clear(); PS.__resetCache();
  const items = []; for (let i = 0; i < PS.LIKED_MAX; i++) items.push({ id: 'K' + i, q: 'س', text: 'ردّ قديم رقم ' + i + ' ' + 'ن'.repeat(30), by: '', at: i, scope: 'all' });
  db.set('db/liked.json', { items });
  const huge = 'ك'.repeat(PS.LIKED_A_MAX + 500);
  await turn('omran', 'claude', '', [() => textTurn('…')], [{ role: 'user', content: 'سؤال جديد' }, { role: 'assistant', content: 'ردّ جديد يستحقّ الحفظ لكلّ الناس. ' + huge }, { role: 'user', content: 'عجبني' }]);
  const after = db.get('db/liked.json').items;
  assert.equal(after.length, PS.LIKED_MAX, 'السقف ٦٠');
  assert.ok(after[after.length - 1].text.startsWith('ردّ جديد') && after[after.length - 1].text.length <= PS.LIKED_A_MAX + 1, 'الأحدث يدخل مقصوصًا عند ٦٠٠٠');
  assert.ok(!after.some((x) => x.text.includes('رقم 0 ')), 'الأقدم يسقط');
  // المسار القديم (api/ai.js → مزوّد بملفّه): الردّ المعتمد يصل نظام المزوّد
  let seen = null;
  stub('api/_lib/gemini.js', async (req, res) => { seen = req.body; res.status(200).json({ ok: true }); });
  delete require.cache[rp('api/ai.js')];
  const ai = require(rp('api/ai.js'));
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, end() {}, getHeader() { return null; } };
  await ai({ method: 'POST', headers: { host: 'x' }, query: { action: 'gemini' }, body: { contents: [{ role: 'user', parts: [{ text: 'سؤال جديد' }] }], systemInstruction: 'أنت مساعد.' } }, res);
  const si = seen && (typeof seen.systemInstruction === 'string' ? seen.systemInstruction : JSON.stringify(seen.systemInstruction));
  assert.ok(si && si.includes('ردّ جديد يستحقّ الحفظ'), 'المسار القديم: ' + String(si).slice(-200));
});

// أمر المالك ٢٠ أكتوبر: «الرد اللي يعجبني… ينتقل لي أنا عند المزوّدين العشرة. لا تنشرها لباقي المستخدمين إلا إذا كان الرد عام وما فيه أي شي شخصي عني».
test('٦ — المدى: ردّ فيه ما يخصّ المالك أو تطبيقه يصل المالك على العشرة ولا يصل المستخدمين؛ «عجبني للكل» تنشره؛ والعامّ يُنشر وحده', async () => {
  db.clear(); PS.__resetCache();
  const PQ = 'كيف أرتّب إعدادات تطبيقي عشان المستخدمين يشوفون الباقات؟';
  const PA = 'افتح حسابك في Vercel وفعّل متغيّر PLANS_ON، ثمّ في المستودع عدّل ملفّ tier.js — الباقات تظهر لكلّ مستخدم بعد النشر.';
  const r = await turn('omran', 'claude', '', [() => textTurn('…')], [{ role: 'user', content: PQ }, { role: 'assistant', content: PA }, { role: 'user', content: 'عجبني' }]);
  let items = db.get('db/liked.json').items;
  assert.equal(items.length, 1); assert.equal(items[0].scope, 'owner', 'فيه ما يخصّه = للمالك وحده');
  assert.ok(r.sys.includes('ولم يُنشر للمستخدمين') && r.sys.includes('لك وحدك'), 'أمر الدور يقول إنّه له وحده');
  for (const p of ['groq', 'gemini', 'deepseek', 'kimi']) {
    const o = await turn('omran', p, 'وين أرتّب إعدادات الباقات في تطبيقي؟', [() => textTurn('…')]);
    assert.ok(o.sys.includes('PLANS_ON'), 'المالك يأخذه على · ' + p);
  }
  for (const p of ['gemini', 'deepseek', 'claude']) {
    const u = await turn('vipuser', p, 'كيف أرتّب إعدادات تطبيقي؟', [() => textTurn('…')]);
    assert.ok(!u.sys.includes('PLANS_ON') && !u.sys.includes(PS.LIKED_HEAD), 'المستخدم لا يراه · ' + p);
  }
  await turn('omran', 'claude', '', [() => textTurn('…')], [{ role: 'user', content: PQ }, { role: 'assistant', content: PA }, { role: 'user', content: 'عجبني للكل' }]);
  items = db.get('db/liked.json').items;
  assert.equal(items.length, 1); assert.equal(items[0].scope, 'all', '«عجبني للكل» = قرار المالك الصريح ينشره');
  const u2 = await turn('vipuser', 'gemini', 'كيف أرتّب إعدادات تطبيقي؟', [() => textTurn('…')]);
  assert.ok(u2.sys.includes('PLANS_ON'), 'بعد «للكل» يصل المستخدم');
  // وحدة: ما يُعدّ شخصيًّا أو شغلًا على التطبيق
  assert.equal(PS.isGeneral('وش أفضل بذور للزراعة في الإمارات؟', 'الطماطم الكرزيّة والخيار البلديّ.'), true);
  assert.equal(PS.isGeneral('وش أفضل مطعم في العين؟', 'مطعم الفنر، والأسعار معقولة.'), true);
  assert.equal(PS.isGeneral('وش أفضل مطعم في العين؟', 'أنا أنصحك بمطعم الفنر — أنا جرّبته.'), false, '«أنا» = شخصيّ');
  assert.equal(PS.isGeneral('كم رصيدي؟', 'رصيدك ٤٠ نقطة.'), false);
  assert.equal(PS.isGeneral('عدّل لون الزرّ', 'غيّرته إلى الأزرق.'), false, 'أمر شغل على التطبيق');
  assert.equal(PS.isGeneral('وش قصّة مقهى عمران؟', 'مقهى قديم في السوق.'), false, 'اسم المالك');
  assert.equal(PS.isGeneral('كيف أربط GitHub بـVercel؟', 'من الإعدادات.'), false);
  assert.equal(PS.isGeneral('كيف أسوّي كبسة؟', 'الرزّ أوّلًا ثمّ اللحم. My tip: استعمل البهارات.'), false, 'my = شخصيّ');
  // ما بلا مدى (محفوظ قبل هذا القرار) للمالك وحده
  assert.equal(PS.likedBlock([{ text: 'بلا مدى'.padEnd(40, '.') }], 'بلا', 2000, null, false), '', 'بلا scope لا يصل المستخدم');
  assert.ok(PS.likedBlock([{ text: 'بلا مدى'.padEnd(40, '.') }], 'بلا', 2000, null, true).includes('بلا مدى'), 'ويصل المالك');
});
