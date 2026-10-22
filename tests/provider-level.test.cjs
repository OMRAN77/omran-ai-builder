// v-provider-level (المالك ٩ أكتوبر: «افحص المزوّدين كلّهم… كلّ واحد تزوّده بمعلومات قويّة، يعني توصله إلى مستواه»):
// كلّ مزوّد عند المالك يأخذ بعد سطر هويّته ملفّ عائلته (قوّته · كيف يصل لأعلى مستواه · ما يعوّضه)، والصغير قواعد تعويض،
// داخل الكتلة الثابتة المخزَّنة فالكاش يبقى؛ وغير المالك كما كان. يشغّل api/_lib/chat.js الحقيقيّ بـfetch مزيّف.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.OWNER_CLAUDE_CHAT = 'on'; // v-claude-chat-off: ردّ Claude للمالك موقوف افتراضيًّا — هذا الاختبار يفحص مساره حين يُعاد تشغيله
process.env.AUTH_SECRET = 'provider-level-test-secret';
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
const anthCredit = () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }), { status: 400 });
const orCredit = () => new Response(JSON.stringify({ error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: 402 } }), { status: 402 });

async function run(user, body, route) {
  usageUser = user;
  const calls = [];
  const out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: String(url), body: b });
    return route(String(url), b);
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user) }, body) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, events, text: events.map((e) => e.delta || '').join('') };
}
const isAnth = (u) => /api\.anthropic\.com/.test(u);
const isOR = (u) => /openrouter\.ai\/api\/v1\/messages/.test(u);
const orModels = (calls) => calls.filter((c) => isOR(c.url)).map((c) => c.body && c.body.model);
const ask = (q) => [{ role: 'user', content: q }];

const sysText = (b) => (Array.isArray(b.system) ? b.system.map((x) => x.text).join('') : String(b.system || ''));
const { levelNote, familyOf } = require(rp('api/_lib/provider-level.js'));

test('١. العائلة من معرّف الموديل لا من اسم المزوّد وحده (Groq = GPT-OSS، صفّ الوسيط = شركة الموديل)', () => {
  const cases = [
    ['claude', 'claude-opus-5-5', 'claude'], ['claude', 'anthropic/claude-haiku-4.5', 'claude'], ['openai', 'gpt-6-sol', 'gpt'],
    ['groq', 'openai/gpt-oss-120b', 'gpt-oss'], ['groq', 'meta-llama/llama-4-maverick', 'llama'], ['gemini', 'google/gemini-3.8-flash', 'gemini'],
    ['deepseek', 'deepseek/deepseek-v4-pro', 'deepseek'], ['mistral', 'mistralai/ministral-14b-2512', 'mistral'], ['cohere', 'cohere/command-a', 'cohere'],
    ['kimi', 'kimi-k3', 'kimi'], ['openrouter', 'x-ai/grok-4.6', 'grok'], ['openrouter', 'qwen/qwen3-max', 'qwen'], ['openrouter', 'anthropic/claude-sonnet-5', 'claude'],
    ['deepseek', '', 'deepseek'], ['openrouter', '', 'grok'],
  ];
  for (const [p, m, k] of cases) assert.equal((familyOf(p, m) || {}).key, k, p + ' ' + m);
  assert.equal(levelNote('openrouter', 'unknown/xyz'), '', 'عائلة مجهولة: المنهج العامّ وحده');
  assert.match(levelNote('deepseek', 'deepseek/deepseek-v4-pro'), /الموديلات المتاحة في هذا التطبيق الآن[^\n]*Fable 5\.1[^\n]*GPT-6[^\n]*Kimi K3/, 'الواقع الحاليّ من التطبيق');
});

test('٢. الموديل الصغير يأخذ قواعد التعويض والكبير لا', () => {
  for (const m of ['claude-haiku-4-5', 'mistralai/ministral-14b-2512', 'openai/gpt-oss-20b', 'gpt-5-mini', 'google/gemini-2.5-flash-lite', 'mistralai/mistral-small-3.2'])
    assert.match(levelNote('', m), /أنت موديل خفيف وسريع/, m);
  for (const m of ['claude-opus-5-5', 'openai/gpt-oss-120b', 'deepseek/deepseek-v4-pro', 'google/gemini-3.8-flash', 'kimi-k3', 'x-ai/grok-4.6', 'mistralai/mistral-medium-3-5'])
    assert.ok(!/موديل خفيف/.test(levelNote('', m)), m);
});

test('٣. المالك: كلّ مزوّد يصله ملفّ مستواه بعد هويّته داخل الكتلة الثابتة المخزَّنة — وغير المالك كما كان', async () => {
  const cases = [['claude', '', /قوّتك: التحليل العميق/], ['deepseek', '', /هذه ساحتك: في أيّ مسألة منطق/], ['mistral', 'mistralai/ministral-14b-2512', /أنت موديل خفيف وسريع/],
    ['cohere', '', /هذه ساحتك: ابحث، اقرأ أقوى مصدر/], ['gemini', '', /سياق طويل جدًّا/], ['openai', '', /تميل إلى الإطالة/], ['openrouter', 'x-ai/grok-4.6', /صراحة ومباشرة/], ['openrouter', '', /أكمل المهمّة في نفس الردّ/]];
  for (const [prov, model, re] of cases) {
    const r = await run('omran', { provider: prov, model, messages: ask('حلّل لي هذا') }, (u) => (isOR(u) || isAnth(u) ? sse('تمام.') : new Response('{}', { status: 404 })));
    const b = r.calls.find((c) => isOR(c.url) || isAnth(c.url)).body;
    const t = sysText(b);
    assert.match(t, /\[مستواك — اعرف نفسك واعمل في أعلى قدرتك\]/, prov);
    assert.match(t, re, prov);
    assert.ok(t.indexOf('[مستواك') > t.indexOf('باسمك الحقيقيّ'), prov + ': بعد سطر الهويّة');
    if (Array.isArray(b.system)) { assert.ok(b.system[0].cache_control, prov); assert.match(b.system[0].text, /\[مستواك/, prov + ': في الثابت المخزَّن (الكاش يبقى)'); }
  }
  const v = await run('vipuser', { provider: 'openai', messages: ask('حلّل لي هذا') }, (u) => (isOR(u) ? sse('تمام.') : new Response('{}', { status: 404 })));
  assert.ok(!/\[مستواك/.test(sysText(v.calls.find((c) => isOR(c.url)).body)), 'غير المالك كما كان');
});

// ── v-claude-code-level (المالك ١٠ أكتوبر: «ولا يبني ولا يقرى… ما يعطيني شي») — المرحلة E: نصوص النظام للمالك وحده ──
// E1 دور بلا أدوات لا يُؤمر بها · E2 لا مجاملة ولا طمأنة ولا «اقترح موديلًا أقوى» · E3 منهج Claude Code في الثابت المخزَّن
// · E4 «الحزمة لم تُبنَ» بدل «ويُرفع معها» · E5 from= متوازية في وصف read_github. وغير المالك حرفًا بحرف كما كان.
const PL = require(rp('api/_lib/provider-level.js'));
const KN = rp('api/_lib/_knowledge.js');
const realKnowledge = (() => { const saved = require.cache[KN]; delete require.cache[KN]; try { return require(KN); } finally { require.cache[KN] = saved; } })();
async function withRealBrief(fn) {
  const s = require.cache[KN].exports; const prev = s.ownerKnowledge;
  s.ownerKnowledge = realKnowledge.ownerKnowledge;
  try { return await fn(); } finally { s.ownerKnowledge = prev; }
}
const upBody = (r) => r.calls.find((c) => isOR(c.url) || isAnth(c.url)).body;
const okText = (u) => (isOR(u) || isAnth(u) ? sse('تمام.') : new Response('{}', { status: 404 }));
const METHOD_HEAD = '[طريقة العمل على مستودع التطبيق — منهج Claude Code نفسه';

test('٤. E2: المالك بلا احتفال ولا طمأنة ولا «اقترح موديلًا أقوى» — النتيجة أوّلًا؛ وغير المالك بشخصيّته كما كانت', async () => {
  const claude = levelNote('claude', 'claude-opus-5-5');
  assert.match(claude, /بلا مجاملة ولا طمأنة — النتيجة أوّلًا/, 'سطر عائلة Claude');
  const small = levelNote('claude', 'claude-haiku-4-5');
  assert.ok(!/موديلًا أقوى/.test(small), 'الصغير لا يُحيل إلى موديل آخر');
  assert.match(small, /استعمل أدواتك[^\n]*edit_github\) حتّى النهاية/, 'بل يعمل بأدواته حتّى النهاية (v-code-not-primary: بلا إحالة إلى التفويض)');
  const r = await run('omran', { provider: 'claude', model: 'claude-haiku-4-5', messages: ask('صلّح زر الإرسال') }, okText);
  const t = sysText(upBody(r));
  assert.ok(!/يحتفل|يطمئنه|موديلًا أقوى/.test(t), 'لا احتفال ولا طمأنة ولا إحالة');
  assert.match(t, /شخصيتك: زميل خبير مباشر؛ الزبدة أولًا/);
  assert.match(t, /بلا مجاملة ولا طمأنة — النتيجة أوّلًا/);
  const v = sysText(upBody(await run('vipuser', { provider: 'claude', messages: ask('صلّح زر الإرسال') }, okText)));
  assert.match(v, /شخصيتك: زميل خبير دافئ يحتفل بإنجاز المستخدم ويطمئنه قبل حل مشكلته؛/, 'غير المالك كما كان');
  assert.ok(!/بلا مجاملة ولا طمأنة|زميل خبير مباشر/.test(v));
});

test('٥. E3: منهج Claude Code للمالك داخل الكتلة الثابتة المخزَّنة (cache_control) لكلّ مزوّد — والقاعدة الأولى باقية، والدمج بـ«ادمج» وحده', async () => {
  assert.ok(PL.OWNER_METHOD.length > 1500 && PL.OWNER_METHOD.length < 3200, 'حجم معقول: ' + PL.OWNER_METHOD.length);
  for (const re of [/DECISIONS\.md[^\n]*PITFALLS\.md[^\n]*read_github/, /from= متوازية في دور واحد/, /read_app_errors[^\n]*test_html[^\n]*فقله للمالك في سطر\. ما لم تره/, /أصغر تغيير يحلّ الجذر/,
    /manage_github \(runs ثمّ run_jobs\)[^\n]*لا «تمّ»/, /مفصولًا صراحةً عمّا لم تتحقّق منه/, /طلب عمران الصريح في رسالته الأخيرة = أمر صريح؛ نفّذه الآن/,
    /افحص CI مرّة واحدة[^\n]*قيد العمل فقل ذلك مع الرابط وأنهِ الردّ — لا تكرّر الفحص في الردّ نفسه/, // لا استطلاع لـCI داخل ردّ واحد (MAX_STEPS/MAX_MS)
    /٤\) الحزمة: js\/app-NN-\*\.js تُبنى[^\n]*js\/partials-\*\.js لا تُحزَم: يكفي رفع رقم \?v=/, /للّغات الأربع عشرة \(js\/app-03-i18n-data\.js وi18n\/\*\.js\)/,
    /لا تستأذن ثانيةً — عدا الأبواب الخمسة المقفلة: موافقة صريحة على البند نفسه/,
    /ولا تُنهَ الردّ بعد القراءة وحدها: الجواب أو التعديل في نفس الدور/]) assert.match(PL.OWNER_METHOD, re);
  assert.ok(!/js\/app-\*\.js وjs\/partials-\*\.js تُبنى/.test(PL.OWNER_METHOD), 'partials لا تُبنى في الحزمة');
  assert.ok(!/Claude Code بطلبه|check_code_task/.test(PL.OWNER_METHOD), 'v-self-only: المنهج لا يدلّ أيّ مزوّد على كودي');
  await withRealBrief(async () => {
    for (const [prov, model] of [['claude', 'claude-opus-5-5'], ['claude', ''], ['openrouter', 'x-ai/grok-4.6']]) {
      const b = upBody(await run('omran', { provider: prov, model, messages: ask('صلّح زر الإرسال') }, okText));
      const t = sysText(b);
      assert.ok(t.includes(PL.OWNER_METHOD), prov + ' ' + model + ': المنهج يصل');
      if (prov === 'claude') assert.ok(Array.isArray(b.system), 'كلود المباشر: النظام كتل كاش');
      if (Array.isArray(b.system)) { assert.ok(b.system[0].cache_control, prov); assert.ok(b.system[0].text.includes(METHOD_HEAD), prov + ': في الثابت المخزَّن'); }
      assert.match(t, /القاعدة الأولى — تعلو على كلّ ما تحتها: لا فعل قبل أمر مكتوب صريح من عمران/, 'القاعدة الأولى باقية');
      assert.doesNotMatch(t, /يدمج طلبه تلقائيًّا/, 'v-self-only: سطر «كودي يدمج تلقائيًّا» القديم زال (موقوف منذ v-cc-off)');
      assert.match(t, /ولا يُدمج طلب إلّا بـ«ادمج» من عمران/, 'الدمج بأمره وحده');
    }
  });
  const v = upBody(await run('vipuser', { provider: 'claude', messages: ask('صلّح زر الإرسال') }, okText));
  assert.ok(!sysText(v).includes(METHOD_HEAD), 'غير المالك بلا منهج المالك');
});

test('٦. E1·E4: دور المالك بلا أدوات لا يُؤمر بها (والثابت المخزَّن نفسه)، و«ويُرفع معها» صارت الحقيقة؛ غير المالك: noTools لا يغيّر حرفًا', async () => {
  await withRealBrief(async () => {
    const withT = upBody(await run('omran', { provider: 'claude', messages: ask('صلّح زر الإرسال') }, okText));
    const noT = upBody(await run('omran', { provider: 'claude', noTools: true, messages: ask('صلّح زر الإرسال') }, okText));
    assert.ok(Array.isArray(withT.tools) && withT.tools.length, 'الدور العاديّ بأدواته');
    assert.equal(noT.tools, undefined, 'بلا أدوات');
    assert.ok(Array.isArray(withT.system) && Array.isArray(noT.system));
    assert.equal(noT.system[0].text, withT.system[0].text, 'الثابت المخزَّن واحد في الدورين — الكاش يبقى');
    // الثابت مستثنى عمدًا من «لا أسماء أدوات» (الكاش): المنهج مشروط بعنوانه، وتنبيه الذيل يُسقط ما فيه عن الأدوات صراحةً
    assert.ok(noT.system[0].text.includes('منهج Claude Code نفسه، حين تصلك أدوات المستودع]'), 'المنهج مشروط بالأدوات');
    assert.ok(PL.NO_TOOLS_NOTE.includes('ما يذكره النظام أعلاه عن الأدوات لا يسري هنا'));
    const tailT = withT.system.slice(1).map((x) => x.text).join(''), tailN = noT.system.slice(1).map((x) => x.text).join('');
    // الدور بأدواته: طريقة العمل وفقرة الصلاحيّة باقيتان، والحزمة بحقيقتها
    assert.ok(tailT.includes('[طريقة العمل على كود المالك]') && tailT.includes('صلاحيّتك على كود التطبيق'));
    assert.ok(!sysText(withT).includes('ويُرفع معها'), 'لا «ويُرفع معها»');
    assert.match(tailT, /app\.bundle\.js مبنيّ منها \(npm run bundle\) — وتبنيه أدوات الرفع في المحادثة تلقائيًّا في الالتزام نفسه/); // v-auto-bundle
    assert.match(tailT, /حين تمسّ js\/app-NN-\*\.js \(v-auto-bundle\)، فلا يُرفع يدويًّا\. وjs\/partials-\*\.js لا تُحزَم: يكفي رفع رقم \?v= لها في index\.html\. الإعدادات:/, 'partials بحقيقتها (build.mjs: ^app-\\d\\d- وحدها)');
    assert.ok(!tailT.includes(PL.NO_TOOLS_NOTE.trim()));
    // بلا أدوات: لا WORK_NOTE ولا فقرة read_github/التفويض ولا أداة رفع أو تفويض، وآخره «لا أدوات» قبل الهويّة
    for (const w of ['[طريقة العمل على كود المالك]', 'صلاحيّتك على كود التطبيق', 'edit_github', 'write_github', 'delegate_code_task', 'merge_github', 'manage_github', 'ويُرفع معها'])
      assert.ok(!tailN.includes(w), 'بلا أدوات: ' + w);
    const iN = tailN.indexOf(PL.NO_TOOLS_NOTE.trim());
    assert.ok(iN > 0 && iN > tailN.indexOf('[معرفة عمران'), 'تنبيه «لا أدوات» بعد الملخّص');
    assert.ok(tailN.indexOf('[هويّتك]') > iN, 'والهويّة آخرًا كما كانت');
    assert.match(tailN, /\[لا أدوات في هذا الدور\]: أجب بالنصّ وحده ولا تدّعِ قراءة أو رفعًا/);
    assert.match(tailN, /القاعدة الأولى — تعلو على كلّ ما تحتها/, 'الملخّص باقٍ عدا فقرة الأدوات');
  });
  // غير المالك: noTools يُهمل كما كان — الطلب نفسه حرفيًّا
  const a = upBody(await run('vipuser', { provider: 'claude', messages: ask('صلّح زر الإرسال') }, okText));
  const b = upBody(await run('vipuser', { provider: 'claude', noTools: true, messages: ask('صلّح زر الإرسال') }, okText));
  const now = (x) => JSON.stringify(x).replace(/\[التاريخ والوقت الآن[^\]]*\]:[^\\]*/g, '');
  assert.equal(now(b.system), now(a.system));
  assert.equal(JSON.stringify(b.tools), JSON.stringify(a.tools));
  assert.ok(!sysText(b).includes(PL.NO_TOOLS_NOTE.trim()));
});

test('٧. E4: رفعة ناجحة تمسّ js/app-NN-*.js = «الحزمة لم تُبنَ» في نتيجة الأداة؛ partials وغيرها والفاشلة والمباشرة ومستودع آخر بلا تنبيه', async () => {
  const R = 'OMRAN77/omran-ai-builder';
  assert.equal(PL.bundleNote({ repo: R, edits: [{ path: 'js/app-09-attach.js' }] }, '✅ رُفع'), PL.BUNDLE_WARN);
  assert.equal(PL.bundleNote({ repo: 'https://github.com/' + R, files: [{ path: 'js/app-05-ui.js' }] }, '✅ رُفع'), PL.BUNDLE_WARN, 'رابط المستودع كذلك');
  assert.equal(PL.bundleNote({ repo: R, delete: ['js/app-41-old.js'] }, '✅ رُفع'), PL.BUNDLE_WARN, 'حذف جزء = تغيير الحزمة');
  // build.mjs يحزم ^app-\d\d- وحدها، وverify لا يفحص partials (تُحمَّل منفصلة بـ?v=) — فلا تنبيه كاذب
  assert.equal(PL.bundleNote({ files: [{ path: 'js/partials-settings.js' }], repo: R }, '✅'), '');
  for (const p of ['js/partials-settings.js', 'js/app.bundle.js', 'js/app-helper.js', 'js/modes.js', 'css/chat.css', 'api/_lib/chat.js', 'index.html']) assert.equal(PL.bundleNote({ repo: R, edits: [{ path: p }] }, '✅ رُفع'), '', p);
  assert.equal(PL.bundleNote({ repo: R, edits: [{ path: 'js/app-09-attach.js' }] }, '✗ لم يُرفع شيء'), '', 'الفاشلة بلا تنبيه');
  assert.equal(PL.bundleNote({ repo: R, edits: [{ path: 'js/app-09-attach.js' }] }, '✅ رُفع\nدُفع مباشرةً إلى main (AGENT_GITHUB_DIRECT مفعّل).'), '', 'المباشر إلى main: bundle.yml يبنيها');
  assert.equal(PL.bundleNote({ repo: 'OMRAN77/other-app', edits: [{ path: 'js/app-09-attach.js' }] }, '✅ رُفع'), '', 'مستودع آخر');
  // v-auto-bundle: الأداة بنت الحزمة في الالتزام نفسه، أو قالت إنّ البناء تعذّر — فلا تنبيه ثانٍ
  assert.equal(PL.bundleNote({ repo: R, edits: [{ path: 'js/app-09-attach.js' }] }, '✅ رُفع\n📦 الحزمة js/app.bundle.js بُنيت تلقائيًّا'), '');
  assert.equal(PL.bundleNote({ repo: R, edits: [{ path: 'js/app-09-attach.js' }] }, '✅ رُفع\n⚠️ تعذّر بناء الحزمة تلقائيًّا: x'), '');
  assert.ok(!PL.BUNDLE_WARN.includes('delegate_code_task'), 'التنبيه بلا إحالة إلى التفويض');
  const GE = require(rp('api/_lib/github-edit.js')); const GW = require(rp('api/_lib/github-write.js'));
  const savedE = GE.editFiles, savedW = GW.pushFiles;
  const ok = { commit: 'abc1234def', repo: 'OMRAN77/omran-ai-builder', branch: 'omran-agent/x', files: 1, commitUrl: 'https://github.com/c', prUrl: 'https://github.com/p/1', prNumber: 1 };
  let res = ok;
  GE.editFiles = async () => res; GW.pushFiles = async () => res;
  const toolOnce = (name, input) => {
    let n = 0;
    return (u) => {
      if (!(isOR(u) || isAnth(u))) return new Response('{}', { status: 404 });
      n++;
      if (n > 1) return sse('رفعت.');
      return new Response([
        { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_e4', name, input: {} } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } },
      ].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
  };
  const toolResult = (r) => {
    const b = r.calls.filter((c) => isOR(c.url) || isAnth(c.url))[1].body;
    for (const m of b.messages) if (Array.isArray(m.content)) for (const x of m.content) if (x.type === 'tool_result' && x.tool_use_id === 'tu_e4') return typeof x.content === 'string' ? x.content : JSON.stringify(x.content);
    return null;
  };
  try {
    const warn = 'الحزمة لم تُبنَ — CI سيفشل والمعاينة لن تتغيّر حتّى الدمج';
    const edit = (p) => ({ repo: 'OMRAN77/omran-ai-builder', message: 'م', edits: [{ path: p, old: 'a', new: 'b' }] });
    let t = toolResult(await run('omran', { provider: 'claude', messages: ask('عدّل زر الإرسال وارفع') }, toolOnce('edit_github', edit('js/app-09-attach.js'))));
    assert.ok(t && t.startsWith('✅') && t.includes(warn), 'edit_github على جزء الواجهة: ' + t);
    t = toolResult(await run('omran', { provider: 'claude', messages: ask('عدّل اللون وارفع') }, toolOnce('edit_github', edit('css/chat.css'))));
    assert.ok(t && t.startsWith('✅') && !t.includes(warn), 'css بلا تنبيه');
    t = toolResult(await run('omran', { provider: 'claude', messages: ask('ارفع الملفّ') }, toolOnce('write_github', { repo: 'OMRAN77/omran-ai-builder', message: 'م', files: [{ path: 'js/app-05-ui.js', content: 'x' }] })));
    assert.ok(t && t.includes(warn), 'write_github على جزء الواجهة');
    t = toolResult(await run('omran', { provider: 'claude', messages: ask('ارفع الملفّ') }, toolOnce('write_github', { repo: 'OMRAN77/omran-ai-builder', message: 'م', files: [{ path: 'js/partials-settings.js', content: 'x' }] })));
    assert.ok(t && t.startsWith('✅') && !t.includes(warn), 'write_github على partials بلا تنبيه كاذب');
    res = { error: 'نصّ قديم غير موجود' };
    t = toolResult(await run('omran', { provider: 'claude', messages: ask('عدّل زر الإرسال وارفع') }, toolOnce('edit_github', edit('js/app-09-attach.js'))));
    assert.ok(t && t.startsWith('✗') && !t.includes(warn), 'الفاشلة بلا تنبيه');
  } finally { GE.editFiles = savedE; GW.pushFiles = savedW; }
});

test('٨. E5: وصف read_github للمالك يذكر from= المتوازية؛ غير المالك يأخذ كائنات الأدوات نفسها حرفيًّا', async () => {
  const { TOOLS, TOOLS_NO_MEDIA } = chat.__imgAsk;
  const base = TOOLS.find((t) => t.name === 'read_github');
  const o = upBody(await run('omran', { provider: 'claude', messages: ask('اقرأ chat.js كامل') }, okText));
  const ro = o.tools.find((t) => t.name === 'read_github');
  assert.ok(ro.description.startsWith(base.description) && /يجوز طلب عدّة from= متوازية في دور واحد/.test(ro.description), 'وصف المالك');
  // v-owner-solo-all: المخطّط نفسه + «commit» (التزام واحد بفرقه) في نسخة المالك وحده
  assert.deepEqual(ro.input_schema.properties.what.enum, base.input_schema.properties.what.enum.concat(['commit', 'map']), 'commit للمالك (وmap — v-codemap)');
  assert.deepEqual(Object.assign({}, ro.input_schema, { properties: Object.assign({}, ro.input_schema.properties, { what: base.input_schema.properties.what }) }), base.input_schema, 'وبقيّة المخطّط نفسه');
  const names = o.tools.map((t) => t.name);
  assert.deepEqual(names.slice(0, TOOLS.length), TOOLS.map((t) => t.name), 'الترتيب نفسه (الكاش)');
  const v = upBody(await run('vipuser', { provider: 'claude', messages: ask('اقرأ chat.js كامل') }, okText));
  const want = [JSON.stringify(TOOLS), JSON.stringify(TOOLS_NO_MEDIA)];
  assert.ok(want.includes(JSON.stringify(v.tools)), 'غير المالك: الأدوات كما هي حرفيًّا');
  assert.ok(!JSON.stringify(v.tools).includes('متوازية'));
});
