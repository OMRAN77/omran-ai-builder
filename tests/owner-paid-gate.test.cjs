// tests/owner-paid-gate.test.cjs — v-owner-paid-gate (المالك ١٤ أكتوبر، لقطة: Claude بدأ generate_image وتفكيره «The owner explicitly asked
// for decor and lighting photos, so I'll generate the first image, confirm it saves properly» — «ليش يسوي صوره… خسرة الرصيد على تفاهات»):
// الأداة المدفوعة (رسم/تعديل صورة/فيديو) لا تُنفَّذ للمالك إلّا بطلب في رسالته الأخيرة نفسها — يفحصه الخادم، في المحادثة (كلّ المزوّدين)
// والوكيل. chat.js الحقيقيّ بمزوّد وهميّ: النموذج يستدعي generate_image بعد «كمّل» ← رفض بلا أيّ نداء للمتصفّح.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'owner-paid-gate-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS', 'OWNER_USERNAMES', 'OWNER_USERNAME']) delete process.env[k];
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (/^agent\/tool\//.test(k) ? { output: '✅ رُسمت الصورة (engine: test). ضع هذا الرمز حرفيًّا في src: __IMG_1__' } : (db.has(k) ? structuredClone(db.get(k)) : null)),
  kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null,
  kvSetRaw: async () => {}, kvIncr: async () => 1, kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: 'omran', tier: 'owner', subscriber: true }) });
stub('api/_lib/_vip.js', { isVip: async () => false });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const OM = require(rp('api/_lib/owner-media.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const resp = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const done = { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } };
const R = {
  text: (t) => resp([{ type: 'response.created', response: { model: 'gpt-6-astra' } }, { type: 'response.output_text.delta', output_index: 0, delta: t }, done]),
  call: (name, input) => { const id = 'call_' + Math.random().toString(36).slice(2, 8), args = JSON.stringify(input);
    return resp([{ type: 'response.created', response: { model: 'gpt-6-astra' } }, { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: id, name, arguments: '' } },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: args }, { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: id, name, arguments: args, status: 'completed' } }, done]); },
};
async function run(ask, script) {
  const calls = [], out = [];
  const save = global.fetch; let n = 0;
  global.fetch = async (url, init) => {
    if (!/api\.openai\.com\/v1\/responses/.test(String(url))) return new Response('{}', { status: 404 });
    calls.push(JSON.parse(init.body)); return script[Math.min(n++, script.length - 1)]();
  };
  const req = { method: 'POST', headers: {}, body: { token: token('omran'), provider: 'openai', model: 'openai/gpt-6-astra', messages: [{ role: 'user', content: 'ارسم صور الإضاءة' }, { role: 'assistant', content: 'تمام.' }, { role: 'user', content: ask }] } };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  try { await chat(req, res); } finally { global.fetch = save; delete process.env.OPENAI_API_KEY; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, events };
}
const outputs = (body) => (body.input || []).filter((x) => x && x.type === 'function_call_output').map((x) => String(x.output));

test('١. askedMedia: طلب الرسم/التعديل/الفيديو في الرسالة الأخيرة نفسها — وعبارات المالك الحقيقيّة', () => {
  const yes = [['ارسم صورة عماني بكمة وارفعها مكان assets/x.webp'], ['احذف الخلفية', true], ['make a logo for my shop'], ['تسوي لي صورة للمطبخ'], ['ارسم صور الإضاءة وارفعها'], ['أبي صورة لعماني بكمة'], ['غيّر الصورة هذي'], ['سوّها 3D', true], ['ارسم الأربع صور'], ['صمّم لي شعار'], ['draw a cat'], ['سولي فيديو للمنتج'], ['الحينه شوف هذي الصور اريدك ان تغيرها على نفس الاسامي', true]];
  const no = ['كمّل', 'جرّب', 'ليش يسوي صوره', 'ارفع صور الإضاءة', 'upload the photos', 'صلّح الزر في الإعدادات', 'عدّل الكود في chat.js', 'خل المزودين يشتغلون', 'تأكد من النشر', 'شو المشكلة',
    'خلاص لا ترسم', 'لا ترسم صور، بس ارفع اللي عندك', 'ما ابي صور', 'سويها كلها في طلب سحب واحد', 'اعمل طلب سحب للتعديل', 'make the save work', 'create a new branch and push', 'غيّر الكود عشان الصور تنحفظ', 'احذف الصور المكررة من الصفحة', 'الصورة ما انرفعت، عدّل الكود', 'ليش ما انرفعت الصور', 'وش صار بالحفظ؟', 'address the issue', 'ليش يسوي صوره؟ صلّح الحفظ'];
  for (const [t, img] of yes) assert.equal(OM.askedMedia(t, !!img), true, 'يُسمح: ' + t);
  for (const t of no) assert.equal(OM.askedMedia(t, false), false, 'يُمنع: ' + t);
  assert.equal(OM.askedMedia('كمّل\n\n[مرفقات: a.png]', false), false, 'ملحق المرفقات لا يُحسب طلبًا');
  /* v-shot-not-draw: لقطة + «تعدّل التطبيق» كانت تُفتح رسمًا لأن CODE_RE بلا «التطبيق» */
  assert.equal(OM.askedMedia('الستائر في الديكور تقدر تعدل التطبيق', true), false, 'لقطة + عدّل التطبيق = كود لا رسم');
  assert.equal(OM.askedMedia('عدّل التطبيق', true), false);
  assert.equal(OM.askedMedia('احذف الخلفية', true), true, 'تعديل المرفق بلا كلمة تطبيق يبقى رسمًا');
  // v-bare-draw (لقطة المالك ١٥ أكتوبر «رسم صور الستائر وارفعها»): «رسم» بلا ألف مع اسم وسيط = طلب؛ شكوى الكود والنفي و«ليش» لا
  for (const t of ['رسم صور الستائر وارفعها', 'رسم صورة الستائر', 'رسم صور الستائر وارفعها للمستودع']) assert.equal(OM.askedMedia(t, false), true, 'يُسمح: ' + t);
  for (const t of ['لا رسم صور', 'ليش رسم صور', 'رسم الصور في الصفحة ما يطلع', 'رسم', 'الرسم ينخصم من رصيدك']) assert.equal(OM.askedMedia(t, false), false, 'يُمنع: ' + t);
  assert.deepEqual(OM.PAID_MEDIA_TOOLS, ['generate_image', 'edit_image', 'generate_video']);
});

test('٢. المحادثة: «كمّل» بعد طلب رسم قديم ← generate_image مرفوضة بسببها بلا نداء للمتصفّح، و«ارسم…» تُنفَّذ', async () => {
  let r = await run('كمّل', [() => R.call('generate_image', { prompt: 'warm lighting decor' }), () => R.text('ما رسمت.')]);
  assert.ok(!r.events.some((e) => e.clientTool), 'لا رسم في المتصفّح');
  assert.ok(outputs(r.calls[1]).some((o) => o.startsWith('✗ لم يُنفَّذ: المالك لم يطلب رسمًا') && o.includes('لا تكمل طلبًا قديمًا')), JSON.stringify(outputs(r.calls[1])));
  r = await run('ارسم صورة إضاءة دافئة', [() => R.call('generate_image', { prompt: 'warm lighting decor' }), () => R.text('رسمت.')]);
  assert.ok(r.events.some((e) => e.clientTool && e.clientTool.name === 'generate_image'), 'الطلب الصريح يُنفَّذ');
});

test('٣. الحارس في الخادم للمحادثة والوكيل، والتعليمة المشتركة تمنع إكمال القديم والرسم للتشخيص', () => {
  assert.ok(read('api/_lib/chat.js').includes("if (__ownerReq && require('./owner-media.js').PAID_MEDIA_TOOLS.indexOf(cb.name) !== -1 && !require('./owner-media.js').askedMedia(lastUserText, lastUserHasImage)) result = require('./owner-media.js').REFUSAL;"));
  assert.ok(read('api/_lib/agent.js').includes("else if (!require('./owner-media.js').askedMedia(living.lastUserText(messages), false)) __draws[cb.id] = { result: require('./owner-media.js').REFUSAL };"));
  assert.ok(read('api/_lib/agent.js').includes('__draws[cb.id] = { p: runInClient(send, cb.name, di) };'), 'رسمات الخطوة متوازية في الوكيل');
  const w = require(rp('api/_lib/github-edit.js')).WORK_NOTE;
  assert.ok(w.includes('لا تكمل طلبًا قديمًا من السجلّ، ولا ترسم لتجرّب أو تشخّص') && !w.includes('ارسم كلّ المطلوب أوّلًا'));
  // v-interleave-fix: لا سطر «🎨 يرسم صورة…» لرسمة يرفضها الحارس (كان يظهر ثمّ يأتي الرفض)
  const C = read('api/_lib/chat.js');
  for (const n of ['generate_image', 'edit_image', 'generate_video']) assert.ok(new RegExp("cb\\.name === '" + n + "' &&[^\\n]*\\(!__ownerReq \\|\\| require\\('\\./owner-media\\.js'\\)\\.askedMedia\\(lastUserText, lastUserHasImage\\)\\)\\) send\\(\\{ status").test(C), n);
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/owner-paid-gate.test.cjs'));
});

test('٤. الحمل والإكمال: شكوى/سؤال/نفي لا يُحمَل تنفيذًا، وخطّة رسم لا تُحمَل بلا طلب رسم — وخطّة تعديل الكود تُحمَل كما كانت', () => {
  const C = require(rp('api/_lib/owner-carry.js')), L = require(rp('api/_lib/owner-loop.js'));
  const PLAN = 'سأرسم الصورة الأولى وأتأكد أنها تُحفظ قبل ما أكمل.';
  assert.equal(C.stalledPlan(PLAN, { usedTools: true, ownerText: 'خلاص لا ترسم، قلي ليش ما انحفظت', prevOwnerText: 'ارسم صور الديكور والإضاءة وارفعها' }), false, 'لقطة المالك');
  assert.equal(C.stalledPlan(PLAN, { usedTools: true, ownerText: 'كمّل', prevOwnerText: 'ارسم صور الديكور' }), false, 'خطّة رسم بلا طلب رسم في الأخيرة');
  assert.equal(C.stalledPlan(PLAN, { usedTools: true, ownerText: 'ارسم صور الديكور وارفعها' }), true, 'بطلب الرسم تُحمَل');
  assert.equal(C.stalledPlan('سأعدّل الزر الآن في app-09.', { usedTools: true, ownerText: 'عدّل الزر' }), true, 'تعديل الكود كما كان');
  assert.ok(!C.ACTION_RE.test('ليش يسوي صوره'), '«سوي» داخل «يسوي» ليست أمرًا');
  const convo = [{ role: 'user', content: 'ارسم صور الإضاءة' }, { role: 'assistant', content: 'رسمت ' + L.resumeMark() }, { role: 'user', content: 'ليش يسوي صوره؟ صلّح الحفظ' }];
  assert.equal(L.resume(convo, 'ليش يسوي صوره؟ صلّح الحفظ'), false, 'الشكوى لا تصير «كمّل المهمّة نفسها»');
});

test('٥. الخادم: حدّ أربع رسمات في الردّ، ومهلة الرسم لا تُفهم «لم يُنفَّذ» فيُعاد الرسم، ورسائل الفشل لا تطلب رسمًا جديدًا', () => {
  const ch = read('api/_lib/chat.js'), ag = read('api/_lib/agent.js'), c17 = read('js/app-17-agent-tools.js');
  assert.ok(ch.includes("(__ownerOps.draws = (__ownerOps.draws || 0) + 1) > 4) result = require('./owner-media.js').CAP_REFUSAL;") && ag.includes("else if ((run.draws = (run.draws || 0) + 1) > 4) __draws[cb.id] = { result: require('./owner-media.js').CAP_REFUSAL };"));
  assert.ok(ch.includes("(lastUserHasImage || __ownerReq) ? 150000 : 75000); if (__ownerReq) result = require('./owner-media.js').waitNote(result);") && ag.includes('generate_image: 150000'));
  assert.match(OM.waitNote('لم يستجب متصفح المستخدم — لم يُنفَّذ الكود.'), /لا تُعِد الرسم/);
  assert.equal(OM.waitNote('✅ رُسمت'), '✅ رُسمت');
  for (const src of [c17, read('api/_lib/github-write.js')]) assert.ok(!src.includes('لا تُرفع بهذا الرمز؛ أعد رسمها') && !src.includes('— ارسمها من جديد') && !src.includes('ارسمها أوّلًا بـgenerate_image'), 'لا «ارسمها من جديد»');
  assert.ok(ch.includes("require('./owner-media.js').picsReplace(lastUserText)") && OM.picsReplace('غيّر هذي الصور') && !OM.picsReplace('احذف الصور المكررة هنا'));
  assert.ok(require(rp('api/_lib/prov-self.js')).GEN_HEAD.includes('سجلّ سابق للاطّلاع لا طلبات قائمة'), 'ذاكرة المزوّدين المشتركة ليست طلبًا قائمًا');
});

test('٦. الرفع: content فارغ مع image لا يُرفع ملفًّا فارغًا فوق الصورة، ومعرّف انتهى عمره يُحفظ من المتصفّح بلا رسم', async () => {
  const GW = require(rp('api/_lib/github-write.js')), AI = require(rp('api/_lib/agent-img.js'));
  assert.deepEqual(GW.validateInput({ files: [{ path: 'a/b.webp', content: '', image: '/i/abcdef123456.png' }] }), { files: [], deletes: [], images: [{ path: 'a/b.webp', id: 'abcdef123456' }] });
  assert.match(GW.validateInput({ files: [{ path: 'a/b.webp', content: 'x', image: '/i/abcdef123456.png' }] }).error, /لا الاثنين/);
  const map = { __IMG_2__: 'aaaaaaaaaaaa' }, asked = [];
  await AI.ensureSaved({ files: [{ path: 'x.webp', image: '__IMG_2__' }] }, map, async (t) => { asked.push(t); return '✅ حُفظت ' + t + ': /i/bbbbbbbbbbbb.png'; }, async () => null);
  assert.deepEqual(asked, ['__IMG_2__'], 'المنتهي يُطلب من المتصفّح');
  assert.equal(map.__IMG_2__, 'bbbbbbbbbbbb');
  const map2 = { __IMG_3__: 'cccccccccccc' }, asked2 = [];
  await AI.ensureSaved({ files: [{ path: 'x.webp', image: '__IMG_3__' }] }, map2, async (t) => { asked2.push(t); return ''; }, async () => ({ b64: 'x' }));
  assert.deepEqual(asked2, [], 'الموجود لا يُطلب');
});
