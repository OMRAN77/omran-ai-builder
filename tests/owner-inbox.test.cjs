// tests/owner-inbox.test.cjs — v-owner-inbox (المالك ٢٠ أكتوبر «اريد كلام المستخدمين يكون الخطاء يحول عندي ولا فيه شتيمه ولا متضايق من
// التطبيق كيف اعرف» ← «نعم ابدا»): صندوق المالك. كلام غير المالك (شتيمة · تذمّر من التطبيق · فشل ردّ أمامه) يُحفظ بلاغًا بمقطع ≤٢٠٠ حرف،
// يصل المالك Push مرّة في الساعة لكلّ مستخدم ونوع، يُقرأ من لوحته (المالك وحده)، وإيميل يوميّ مجمّع من جرد البريد. المالك لا يُبلَّغ عن نفسه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'owner-inbox-secret';
process.env.OPENROUTER_API_KEY = 'test-or-key';
process.env.ANTHROPIC_API_KEY = 'test-anth-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'OWNER_USERNAMES', 'MONITOR_KEY', 'CRON_SECRET']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
const kvStub = {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async (k) => (db.has(k) ? db.get(k) : null), kvSetRaw: async (k, v) => { db.set(k, v); }, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async (k, v) => { if (db.has(k)) return false; db.set(k, v); return true; }, kvList: async () => [],
};
stub('api/_lib/kv.js', kvStub);
const pushes = [];
stub('api/_lib/_owner-alert.js', { pushToOwners: async (p) => { pushes.push(p); return { sent: 1 }; }, alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), isCreditFailure: () => false });
let usageUser = 'vipuser';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }) });
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const IB = require(rp('api/_lib/owner-inbox.js'));
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (evs) => new Response(evs.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'm', usage: { input_tokens: 1, output_tokens: 0 } } });
const textTurn = (t) => sse([start(), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }]);
const fail500 = () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });

async function turn(user, provider, text, script) {
  usageUser = user;
  const save = global.fetch; let i = 0; const events = [];
  global.fetch = async (url, init) => {
    if (!/openrouter\.ai\/api\/v1\/messages|api\.anthropic\.com\/v1\/messages/.test(String(url))) return new Response('{}', { status: 404 });
    return (script[Math.min(i++, script.length - 1)])();
  };
  const req = { method: 'POST', headers: {}, body: { token: token(user), provider, messages: [{ role: 'user', content: text }] } };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write(s) { for (const l of String(s).split('\n')) if (l.startsWith('data: ')) { try { events.push(JSON.parse(l.slice(6))); } catch (e) { /* ليس JSON */ } } return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  await new Promise((r) => setTimeout(r, 30)); // بلاغ الخطأ يُكتب بعد send بلا انتظار
  return { events };
}
const items = () => ((db.get(IB.LIST_KEY) || {}).items || []);

test('١ — المصنّف: شتيمة وتذمّر عن التطبيق يُلتقطان، والكلام العاديّ وتذمّر عن غير التطبيق لا', () => {
  for (const t of ['يا غبي ما تفهم', 'انت كلب', 'حمار انت', 'this app is stupid', 'you are such an idiot', 'طز فيكم', 'what the fuck is this', 'ياحمار']) assert.equal(IB.classify(t), 'insult', t);
  for (const t of ['التطبيق خايس ما يرد', 'انت بطيء وايد', 'ضيعت وقتي معكم', 'الغوا اشتراكي', 'نفس الخطأ كل مرة', 'شو هذا التطبيق ما يرد', 'التطبيق زبالة', 'this app is useless', 'the bot keeps failing', 'متضايق من الردود', 'المساعد ما يفهم علي', 'this site is a scam']) assert.equal(IB.classify(t), 'complaint', t);
  for (const t of ['وش أفضل مطعم في العين؟', 'ابي كود يحسب الضريبة', 'المكيف ما يشتغل كيف أصلحه؟', 'my car is broken, how do I fix it', 'سؤال: ما الفرق بين الخطأ والغلط لغويًّا؟', 'هلا', 'اكتب لي قصة عن كلب وفيّ', '']) assert.equal(IB.classify(t), null, t || '(فارغ)');
  assert.equal(IB.excerpt('أ'.repeat(500)).length, 201, 'مقطع ٢٠٠ حرف + علامة القصّ');
  assert.equal(IB.excerpt('سطر\nثانٍ\t  ثالث'), 'سطر ثانٍ ثالث');
});

/* v-inbox-near أُلغي قبل الدمج (PR #1265): بلاغ «grace» الكاذب (طلب صنع فيه «broken» و«you») حاول أربعة استثناءات — كلّ مراجعة عدائيّة
   وجدت شكاوى حقيقيّة أسكتها الاستثناء (٣٠٠+ نصّ: «can you make it again the last one was terrible»، «سوّ لي صورة ثانية الاولى طلعت زبالة»،
   «can you make the broken voice button work»…). في هذا التطبيق الطلب والشكوى يأتيان في جملة واحدة، وقائمة الكلمات لا تفرّقهما.
   القرار: بلاغ كاذب أحيانًا أهون من شكوى ضائعة. هذا الحارس يمنع أيّ استثناء قادم يُسكت هذه النصوص. */
test('١ب — حارس: شكاوى حقيقيّة من مراجعات PR #1265 بلاغ كلّها، وبلاغ «grace» الكاذب مقبول عمدًا (لا استثناء بقوائم الكلمات)', () => {
  for (const t of ["the app can't even generate an image, useless", 'I tried to create a video 3 times and it failed, your app is a joke', 'I asked you to write code and you failed',
    'make it work! the app is broken', 'ارسم لي قطة. التطبيق ما يرد من ساعة', 'قلت لك سوي لي صورة وما سويت، التطبيق خربان', 'صمّم لي شعار — بس التطبيق اليوم بطيء مرة',
    'شو اعمل التطبيق ما يفتح', 'كل ما اكتب لك سؤال انت ما ترد', 'ابني يقول التطبيق ما يفتح عنده', 'عندي ولد صغير يقول التطبيق ما يفتح عنده', 'تخيل التطبيق ما يشتغل من امس',
    'your design is terrible', "I can't make your app work, it's useless", 'you generate terrible images',
    'التطبيق من يوم ما نزلت التحديث الجديد امس وهو ما يشتغل', 'I paid for the subscription and your assistant still gives me the same wrong answers, terrible', "The app keeps crashing. It's useless.",
    'مها كل ما اكتب لها ما ترد', 'المساعد كل ما اكتب له سؤال ما يرد علي', 'التطبيق كل ما اعمل له تحديث يعلق', 'اكتب ليه ما يرد المساعد',
    'Build failed on your site again', "Generate button doesn't work in your app", 'Render is so slow on your site', 'Make video button is broken in your app', '«ارسم» ما يشتغل في التطبيق',
    'I asked you to make a video and it failed', 'I told you to make it faster and it is still slow', 'can you make one image without an error for once', 'I want to create an account but it fails every time on your site',
    'التطبيق من امس وانا احاول ادخل حسابي\nما يفتح', 'I love your app. But today when I opened it to check my old projects everything was slow',
    'can you make it again the last one was terrible', 'can you make the video again its stuck', 'can you make the chat less slow', 'can you make an image the upload is broken',
    'can you make a new image because the last one was bad', 'hey bot, make me a better image this one is terrible', 'can you make it again same bad result',
    'يا مها ارسم لي قطة الحين صار لي ساعة انتظر بطيء مرة', 'يا مها اكتب لي ملخص الزر خربان ما اقدر انسخ', 'ارسم لي قطة ولا تتأخر خايس هالتطبيق',
    'يا مها ارسم لي قطة والتطبيق بطيء', 'يا مها سوّ لي صورة وللحين معلق', 'قلت لك يا مها ارسم لي قطة وطلعت زفت', 'يا مها كل ما اقول ارسم لي شي يطلع زفت',
    'يا مها سوّ لي صورة ثانية الاولى طلعت زبالة', 'يا مها ارسم لي قطة ثانية اللي قبل زبالة', 'ارسم لي قطه زين لا تطلعها زباله مثل كل مره يا مها',
    /* المراجعة الرابعة */
    'can you make the broken voice button work', 'can you make my broken project open', 'can you write working code instead of broken junk',
    'can you make a video without broken audio for once', 'can you make me a logo it keeps giving me terrible results']) {
    assert.equal(IB.classify(t), 'complaint', t);
  }
  assert.equal(IB.classify('i want you to build for me the Dandora community filled with litters broken drainge systems and a dumpsite with sick villagers'), 'complaint', 'مقبول عمدًا: انظر التعليق');
  for (const s of ['bad '.repeat(495) + 'x x x x x x x ' + 'you '.repeat(495), 'your app is broken ok' + '❤️'.repeat(1985) + 'ok', 'you bad a' + '\u200d'.repeat(3989) + 'b']) {
    const t0 = process.hrtime.bigint();
    IB.classify(s);
    assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 100, 'classify ≤ ١٠٠م.ث قبل كلّ دور: ' + s.slice(0, 12));
  }
});

test('٢ — المحادثة الحقيقيّة: كلام مستخدم بشتيمة يصير بلاغًا ويدفع للمالك مرّة في الساعة؛ المالك لا يُبلَّغ عن نفسه؛ الكلام العاديّ لا يُحفظ', async () => {
  db.clear(); pushes.length = 0;
  await turn('vipuser', 'gemini', 'التطبيق خايس ما يرد عليّ', [() => textTurn('أعتذر…')]);
  let list = items();
  assert.equal(list.length, 1);
  assert.equal(list[0].user, 'vipuser'); assert.equal(list[0].kind, 'complaint'); assert.equal(list[0].prov, 'gemini'); assert.equal(list[0].via, 'chat');
  assert.equal(list[0].text, 'التطبيق خايس ما يرد عليّ');
  assert.equal(pushes.length, 1); assert.match(pushes[0].title, /متضايق/); assert.ok(pushes[0].body.includes('vipuser') && pushes[0].body.includes('خايس'));
  await turn('vipuser', 'gemini', 'التطبيق خايس ما يرد عليّ', [() => textTurn('…')]);
  assert.equal(items().length, 1, 'نفس النصّ خلال ١٠ دقائق لا يتكرّر');
  await turn('vipuser', 'gemini', 'يا غبي ليش ما تفهم', [() => textTurn('…')]);
  assert.equal(items().length, 2, 'بلاغ ثانٍ يُحفظ'); assert.equal(items()[1].kind, 'insult');
  assert.equal(pushes.length, 2, 'نوع آخر = إشعار'); assert.match(pushes[1].title, /شتيمة/);
  await turn('vipuser', 'gemini', 'انت بطيء وايد اليوم', [() => textTurn('…')]);
  assert.equal(items().length, 3); assert.equal(items()[2].kind, 'complaint');
  assert.equal(pushes.length, 2, 'لا إشعار ثانٍ لنفس المستخدم والنوع خلال ساعة');
  await turn('vipuser', 'gemini', 'وش أفضل مطعم في العين؟', [() => textTurn('…')]);
  assert.equal(items().length, 3, 'الكلام العاديّ لا يُحفظ');
  await turn('omran', 'gemini', 'التطبيق خايس ما يرد', [() => textTurn('…')]);
  assert.equal(items().length, 3, 'المالك لا يُبلَّغ عن كلامه');
  assert.equal(pushes.length, 2);
});

test('٣ — فشل ردّ أمام مستخدم (حدث error من الخادم) = بلاغ error بمقطع رسالته ونصّ الخطأ؛ وفشل أمام المالك لا', async () => {
  db.clear(); pushes.length = 0;
  const r = await turn('vipuser', 'gemini', 'اشرح لي الضريبة', [fail500, fail500, fail500, fail500]);
  assert.ok(r.events.some((e) => e.error), 'الخادم أرسل error للمستخدم: ' + JSON.stringify(r.events.slice(-2)));
  const list = items();
  assert.ok(list.length >= 1, 'بلاغ محفوظ');
  assert.equal(list[0].kind, 'error'); assert.equal(list[0].user, 'vipuser'); assert.equal(list[0].text, 'اشرح لي الضريبة'); assert.ok(list[0].detail && list[0].detail.length > 0, 'نصّ الخطأ محفوظ');
  assert.equal(pushes.filter((p) => /فشل ردّ/.test(p.title)).length, 1, 'إشعار واحد');
  db.clear(); pushes.length = 0;
  await turn('omran', 'gemini', 'اشرح لي الضريبة', [fail500, fail500, fail500, fail500]);
  assert.equal(items().length, 0, 'فشل أمام المالك ليس بلاغًا');
});

test('٤ — المسار: GET للمالك وحده (الأحدث أوّلًا) وPOST clear يمسح؛ غير المالك ٤٠٣', async () => {
  db.clear();
  await IB.record({ user: 'a', prov: 'groq', kind: 'insult', text: 'قديم' }, { kv: kvStub, now: 1000, push: async () => ({}) });
  await IB.record({ user: 'b', prov: 'groq', kind: 'complaint', text: 'جديد' }, { kv: kvStub, now: 2000, push: async () => ({}) });
  const call = async (method, query, body) => { let code = 0, out = null; const res = { setHeader() {}, status(c) { code = c; return this; }, json(o) { out = o; return this; }, end() {} }; await IB({ method, query, body, headers: {} }, res); return { code, out }; };
  assert.equal((await call('GET', {})).code, 403);
  assert.equal((await call('GET', { token: token('vipuser') })).code, 403);
  const ok = await call('GET', { token: token('omran') });
  assert.equal(ok.code, 200); assert.equal(ok.out.count, 2); assert.equal(ok.out.items[0].text, 'جديد', 'الأحدث أوّلًا');
  const cl = await call('POST', {}, { action: 'clear', token: token('omran') });
  assert.equal(cl.code, 200); assert.equal(items().length, 0);
  assert.ok(read('api/system.js').includes("case 'owner-inbox': return require('./_lib/owner-inbox.js');"), 'المسار مسجَّل');
});

test('٥ — الإيميل اليوميّ: ما جدّ منذ آخر إرسال وحده، مرّة؛ بلا جديد لا إيميل؛ ومربوط بجرد البريد', async () => {
  db.clear();
  const mails = [];
  const env = { OWNER_NOTIFY_EMAIL: 'owner@example.com', RESEND_API_KEY: 'k' };
  const sendMail = async (to, subject, html) => { mails.push({ to, subject, html }); return true; };
  await IB.record({ user: 'zayed', prov: 'groq', kind: 'complaint', text: 'ضيعت وقتي معكم' }, { kv: kvStub, now: 5000, push: async () => ({}) });
  await IB.record({ user: 'noor', prov: 'gemini', kind: 'error', text: 'اشرح لي', detail: 'HTTP 500' }, { kv: kvStub, now: 6000, push: async () => ({}) });
  const d1 = await IB.dailyDigest({ kv: kvStub, env, sendMail, now: 10000 });
  assert.equal(d1.sent, true); assert.equal(d1.count, 2); assert.equal(mails.length, 1);
  assert.ok(mails[0].to === 'owner@example.com' && mails[0].subject.includes('2') && mails[0].html.includes('zayed') && mails[0].html.includes('ضيعت وقتي') && mails[0].html.includes('HTTP 500') && mails[0].html.includes('متضايق من التطبيق'), 'الإيميل يحمل البلاغات');
  const d2 = await IB.dailyDigest({ kv: kvStub, env, sendMail, now: 20000 });
  assert.equal(d2.sent, false); assert.equal(mails.length, 1, 'بلا جديد لا إيميل');
  await IB.record({ user: 'zayed', prov: 'groq', kind: 'insult', text: 'كلب' }, { kv: kvStub, now: 30000, push: async () => ({}) });
  const d3 = await IB.dailyDigest({ kv: kvStub, env, sendMail, now: 40000 });
  assert.equal(d3.count, 1, 'الجديد وحده');
  assert.equal((await IB.dailyDigest({ kv: kvStub, env: {}, sendMail, now: 50000 })).reason, 'off', 'بلا إيميل مالك = لا شيء');
  assert.ok(read('api/_lib/email-sweep.js').includes("require('./owner-inbox.js').dailyDigest()"), 'جرد البريد يستدعيه');
});

test('٦ — الربط والواجهة: المحادثة والوكيل يمرّران كلام غير المالك، والزرّ والقائمة في لوحة المالك، والمفاتيح بالـ١٤ لغة والوسم مرفوع', () => {
  const chatSrc = read('api/_lib/chat.js');
  assert.ok(chatSrc.includes("require('./owner-inbox.js').scanTurn({ user: usage.username, prov: reqProv || prov, text: lastUserText })"), 'المحادثة');
  assert.ok(chatSrc.includes("if (obj && obj.error && !__ownerReq) { try { require('./owner-inbox.js').noteFailure("), 'حدث الخطأ');
  assert.ok(read('api/_lib/agent.js').includes("require('./owner-inbox.js').scanTurn({ user: runUser, prov: 'claude', via: 'agent'"), 'الوكيل');
  const ui = read('js/app-05-ui.js');
  assert.ok(ui.includes('<button id="inboxOwnerBtn" type="button" style="display:none;"></button>') && ui.includes("ib.textContent = t('inboxOwnerBtn')") && ui.includes("action=owner-inbox&token=") && ui.includes("fbEsc(t('inboxEmpty'))"), 'زرّ المالك والقائمة');
  assert.ok(ui.includes("fbEsc(it.text||'')") && ui.includes('fbEsc(it.user||'), 'كلّ حقل مهرَّب');
  const keys = ['inboxOwnerBtn', 'inboxEmpty', 'inboxKindInsult', 'inboxKindComplaint', 'inboxKindError'];
  const data = read('js/app-03-i18n-data.js');
  for (const k of keys) assert.ok((data.match(new RegExp(k + ': "')) || []).length && data.split(k + ': "').length - 1 === 2, 'ar+en · ' + k);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) { const src = read('i18n/' + lg + '.js'); for (const k of keys) assert.ok(src.includes(k + ': "'), lg + ' · ' + k); }
  // الرقم يُقرأ من الملفّ لا يُثبَّت (سقّاطة vPinTests). v-plans-real-balance (764): رفعٌ لاحق يضع سببه في الرأس، فالشرط وجود السبب
  // والوسم الحاليّ ≥ رقمه (كان: سببه هو الرأس — فيفشل مع كلّ رفع بعده)
  const st4 = read('js/app-04-i18n-state.js');
  const cur = Number((/'\.js\?v=(\d+)'/.exec(st4) || [])[1]);
  const tag = st4.match(/v-owner-inbox \((\d+)\): خمسة مفاتيح لصندوق المالك/);
  assert.ok(tag && cur >= Number(tag[1]), 'الوسم مرفوع وسببه في التعليق');
  assert.ok(read('js/app.bundle.js').includes('inboxOwnerBtn'), 'الحزمة مبنيّة');
});

/* v-inbox-own-words (لقطة المالك ٥ نوفمبر): مواصفات GameTracker ملصوقة من luki (مرفق «📄 Pasted code · 4 KB») صارت «متضايق من التطبيق»
   لأنّ المواصفات فيها crash/errors/slow مع «the app». المرفق مادّة لا كلام المستخدم — المصنّف يقرأ ما كتبه هو قبل أوّل مرفق. */
test('٧ — المرفق الملصوق ليس كلام المستخدم: مواصفات فيها crash/errors لا بلاغ، وما يكتبه هو يُقرأ كما كان', async () => {
  const spec = 'Build a complete app called GameTracker\nCreate a modern, professional gaming statistics app called GameTracker. The app should allow users to track how much time they spend playing each game.\n\nRequirements:\n- Show clear errors if a save fails\n- No slow screens; the app must never crash\n- Your app is useless without charts, so add charts';
  const att = (name, body) => '📄 ' + name + ':\n```\n' + body + '\n```';
  assert.equal(IB.classify(att('Pasted code · 4 KB', spec)), null, 'مرفق وحده');
  assert.equal(IB.classify('ابني لي هذا\n\n' + att('Pasted text · 2 KB', spec)), null, 'طلب + مرفق');
  assert.equal(IB.classify('التطبيق خايس ما يرد\n\n' + att('app.js', 'throw new Error("failed")')), 'complaint', 'كلامه قبل المرفق يُقرأ');
  assert.equal(IB.classify('No slow screens; the app must never crash'), 'complaint', 'الكلمات نفسها مكتوبةً = كما كانت');
  assert.equal(IB.classify('يا غبي\n\n' + att('a.txt', 'x')), 'insult');
  assert.equal(IB.ownWords('سؤال\n\n' + att('a.txt', 'x') + '\n\n' + att('b.txt', 'y')), 'سؤال');
  db.clear(); pushes.length = 0;
  await turn('vipuser', 'gemini', att('Pasted code · 4 KB', spec), [() => textTurn('تفضّل…')]);
  assert.equal(items().length, 0, 'المحادثة الحقيقيّة: لا بلاغ');
  assert.equal(pushes.length, 0);
  const mails = [];
  await IB.record({ user: 'luki', prov: 'openai', kind: 'complaint', text: 'how do I cancel?' }, { kv: kvStub, now: Date.now(), push: async () => ({}) });
  await IB.dailyDigest({ kv: kvStub, env: { OWNER_NOTIFY_EMAIL: 'o@x.com', RESEND_API_KEY: 'k' }, sendMail: async (to, subject, html) => { mails.push(html); return true; } });
  assert.ok(mails[0] && mails[0].includes('<div dir="auto">how do I cancel?</div>'), 'النصّ الإنجليزيّ في سطره بلا قلب ترتيبه');
});
