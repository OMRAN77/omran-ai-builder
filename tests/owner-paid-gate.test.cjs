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
async function run(ask, script, img) {
  const calls = [], out = [];
  const save = global.fetch; let n = 0;
  global.fetch = async (url, init) => {
    if (!/api\.openai\.com\/v1\/responses/.test(String(url))) return new Response('{}', { status: 404 });
    calls.push(JSON.parse(init.body)); return script[Math.min(n++, script.length - 1)]();
  };
  // img: الرسالة الأخيرة تحمل صورة مرفقة كما يرسلها العميل (كتلة صورة + ملحق «[مرفقات: …]» في آخر النصّ)
  const last = img ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }, { type: 'text', text: ask + '\n\n[مرفقات: car.jpg]' }] : ask;
  const req = { method: 'POST', headers: {}, body: { token: token('omran'), provider: 'openai', model: 'openai/gpt-6-astra', messages: [{ role: 'user', content: 'ارسم صور الإضاءة' }, { role: 'assistant', content: 'تمام.' }, { role: 'user', content: last }] } };
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
  assert.ok(read('api/_lib/chat.js').includes("if (__ownerReq && require('./owner-media.js').PAID_MEDIA_TOOLS.indexOf(cb.name) !== -1 && !require('./owner-media.js').askedTool(cb.name, lastUserText, lastUserHasImage)) result = require('./owner-media.js').REFUSAL;")); // v-gate-attach: الحارس باسم الأداة
  assert.ok(read('api/_lib/agent.js').includes("else if (!require('./owner-media.js').askedMedia(living.lastUserText(messages), false)) __draws[cb.id] = { result: require('./owner-media.js').REFUSAL };"));
  assert.ok(read('api/_lib/agent.js').includes('__draws[cb.id] = { p: runInClient(send, cb.name, di) };'), 'رسمات الخطوة متوازية في الوكيل');
  const w = require(rp('api/_lib/github-edit.js')).WORK_NOTE;
  assert.ok(w.includes('لا تكمل طلبًا قديمًا من السجلّ، ولا ترسم لتجرّب أو تشخّص') && !w.includes('ارسم كلّ المطلوب أوّلًا'));
  // v-interleave-fix: لا سطر «🎨 يرسم صورة…» لرسمة يرفضها الحارس (كان يظهر ثمّ يأتي الرفض)
  const C = read('api/_lib/chat.js');
  // v-gate-attach: سطر كلّ أداة يسأل الحارس الذي يحكم تنفيذها — edit_image بحارسها الموسّع، والرسم والفيديو بـaskedMedia كما كانا
  for (const n of ['generate_image', 'edit_image', 'generate_video']) assert.ok(new RegExp("cb\\.name === '" + n + "' &&[^\\n]*\\(!__ownerReq \\|\\| require\\('\\./owner-media\\.js'\\)\\." + (n === 'edit_image' ? "askedTool\\('edit_image', " : 'askedMedia\\(') + "lastUserText, lastUserHasImage\\)\\)\\) send\\(\\{ status").test(C), n);
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

test('٧. v-gate-attach: صورة مرفقة + «حط/ركّب/نزّل/ظلّل/سولي…/عطني أشكال» تفتح edit_image وحدها — وبلا صورة أو بسياق كود أو منتج غير الصورة تبقى مقفلة', async () => {
  const A = (t, img) => OM.askedTool('edit_image', img ? t + '\n\n[مرفقات: car.jpg]' : t, !!img);
  // جدول المالك ٢١ نوفمبر (العمود الذي كان يُرفض) وأخواته القريبة
  const yes = ['حط جنوط سوداء', 'ركّب سبويلر', 'ركب سبويلر', 'سولي جنوط سوداء', 'نزّل السيارة وظلّل القزاز', 'ظلل القزاز', 'عطني ٣ أشكال للسيارة', 'عطني أشكال لسيارتي',
    'وحط جنوط سوداء', 'حطلي جنوط ذهبية', 'حط لي سبويلر خلفي', 'ممكن تحط جنوط سوداء', 'ركب لها دعامية', 'ابيك تركب بودي كت', 'نزّل لي السيارة شوي', 'نزل الموتر', 'ظلّلها',
    'سو لي بودي كت رياضي', 'سوي لي السيارة مرفوعة', 'تسوي لي جنوط', 'اعمل لي فتحة سقف', 'سولي قصة شعر جديدة',
    'حط إطار ذهبي', 'ركّب شاشة في السيارة', 'حط جنوط على هذي السيارة',
    'أبي أشوف سيارتي بلون ثاني', 'عطني السيارة بألوان مختلفة', 'عطني شكل ثاني', 'أبي تصميمين مختلفين', 'هات ٤ ستايلات', 'أبي نسخة ثانية', 'put black rims on it', 'lower the car and tint the windows'];
  for (const t of yes) {
    assert.equal(A(t, true), true, 'مع صورة يُسمح: ' + t);
    assert.equal(A(t, false), false, 'بلا صورة يُمنع: ' + t);
    assert.equal(OM.askedMedia(t + '\n\n[مرفقات: car.jpg]', true), false, 'الرسم والفيديو لا يُفتحان بها: ' + t);
    assert.equal(OM.askedTool('generate_image', t + '\n\n[مرفقات: car.jpg]', true), false, 'generate_image: ' + t);
    assert.equal(OM.askedTool('generate_video', t + '\n\n[مرفقات: car.jpg]', true), false, 'generate_video: ' + t);
  }
  // مع صورة مرفقة وتبقى مقفلة: كود/واجهة، منتج غير الصورة، نفي، سؤال، شكوى، وكلمات تشبه الأفعال
  const no = ['حط زر جديد في الإعدادات', 'حط أيقونة فوق', 'حط الشريط فوق', 'ركّب القسم الجديد', 'سولي الشاشة أغمق', 'حط الإطار ذهبي', 'ركّب المكتبة في الكود', 'نزّل التطبيق', 'نزل الملف', 'سولي صفحة هبوط', 'سولي موقع لمطعم', 'سولي ملخص', 'سولي جدول بالأسعار',
    'سو لي تقرير عن السيارة', 'اعمل لي خطة تسويق', 'اعمل نسخة احتياطية', 'سويها كلها في طلب سحب واحد', 'لا تحط جنوط', 'ما أبي أشكال', 'بدون ما تركب سبويلر', 'لا تسوي شي', 'ليش حط جنوط', 'كيف أركب سبويلر؟', 'تقدر تنزل السيارة؟',
    'ركبتي تعورني', 'منزل جميل', 'حطام السفينة', 'نزلة برد', 'حطيت جنوط', 'الذكاء يسوي أخطاء', 'اللي يسوي كذا غلطان', 'شكلها حلو', 'عطني رأيك في الشكل', 'أبي شرح بشكل مبسط', 'عطني أفكار', 'هاتف جديد بأشكال',
    'خل المزودين يشتغلون', 'كمّل', 'شو المشكلة', 'اقرأ النص', 'ترجم الصورة'];
  for (const t of no) assert.equal(A(t, true), false, 'مع صورة يُمنع: ' + t);
  // بلا تشكيل «ركّب» = «ركِب» و«نزّل» = «نزَل»: المفعول يفرّق — ركوب، ونزول لغير مركبة، وتحميل الصورة/الملف تبقى مقفلة
  for (const t of ['ركب السيارة', 'ابوي ركب السيارة', 'ركب الخيل', 'بنتي تركب الدراجة', 'ركب معي', 'اركب السيارة', 'نزل السوق جديد', 'نزل تحديث جديد', 'نزل المطر', 'نزّل شوي',
    'نزل الصورة', 'نزّل لي الصورة', 'نزللي الصورة', 'نزل هذي الصورة', 'نزل الفيديو']) assert.equal(A(t, true), false, 'مع صورة يُمنع: ' + t);
  // الضمير يعود على الصورة نفسها (حطها خلفيّة، نزّلها لي = حمّلها) — تبقى مقفلة
  for (const t of ['حطها خلفية', 'حطها في الانستقرام', 'حطه', 'ركبها', 'نزلها شوي', 'نزّلها لي']) assert.equal(A(t, true), false, 'مع صورة يُمنع: ' + t);
  // ما كان مسموحًا يبقى، والأدوات الأخرى على حكم askedMedia كما هو
  for (const [t, img] of [['احذف الخلفية', true], ['سوّها 3D', true], ['غيّر لون السيارة أسود مطفي', true], ['ارسم صورة عماني بكمة'], ['سولي فيديو للمنتج']]) {
    for (const n of OM.PAID_MEDIA_TOOLS) assert.equal(OM.askedTool(n, t, !!img), OM.askedMedia(t, !!img), n + ': ' + t);
    assert.equal(OM.askedMedia(t, !!img), true, t);
  }
  // chat.js الحقيقيّ: صورة + «حط جنوط سوداء» ← edit_image تُنفَّذ في المتصفّح؛ بلا صورة ← رفض؛ ومع الصورة generate_image وgenerate_video مرفوضتان
  const NOTE_A = 'أمّا صورة حقيقيّة لا لقطة واجهة (سيّارة، شخص، مكان، منتج) ومعها أمر على ما فيها', NOTE_B = 'ولعدّة أشكال استدعِها مرّة لكلّ شكل (حتّى ٤ في الردّ)';
  // ملفّ المالك حاضر كما في الإنتاج (المستعار أعلاه فارغ): به يأخذ دور الصورة فرع المالك من التعليمة
  const KN = require.cache[rp('api/_lib/_knowledge.js')].exports, kn0 = KN.ownerKnowledge;
  KN.ownerKnowledge = () => '\n\n[ملفّ المالك للاختبار]';
  let r;
  try {
    r = await run('حط جنوط سوداء', [() => R.call('edit_image', { instruction: 'Fit black alloy wheels; keep the same car, angle and background.' }), () => R.text('عدّلت.')], true);
    assert.ok(r.events.some((e) => e.clientTool && e.clientTool.name === 'edit_image'), 'صورة + حط = تعديل يُنفَّذ');
    assert.ok(r.events.some((e) => /يعدّل الصورة/.test(String(e.status || ''))), 'سطر «يعدّل الصورة» يظهر مع التنفيذ');
    assert.ok(!outputs(r.calls[1]).some((o) => o.startsWith('✗ لم يُنفَّذ')), JSON.stringify(outputs(r.calls[1])));
    // تعليمة دور الصورة للمالك تصل المزوّد وتطابق الحارس: صورة حقيقيّة + أمر عليها = edit_image مباشرةً، وعدّة أشكال = مرّة لكلّ شكل
    assert.ok(JSON.stringify(r.calls[0]).includes(NOTE_A) && JSON.stringify(r.calls[0]).includes(NOTE_B), 'التعليمة في طلب المزوّد حين تُرفق صورة');
    r = await run('حط جنوط سوداء', [() => R.call('edit_image', { instruction: 'Fit black alloy wheels.' }), () => R.text('ما عدّلت.')]);
    assert.ok(!r.events.some((e) => e.clientTool), 'بلا صورة مرفقة لا تعديل');
    assert.ok(outputs(r.calls[1]).some((o) => o.startsWith('✗ لم يُنفَّذ: المالك لم يطلب رسمًا')), JSON.stringify(outputs(r.calls[1])));
    assert.ok(!JSON.stringify(r.calls[0]).includes(NOTE_A), 'بلا صورة لا تعليمة');
    for (const n of ['generate_image', 'generate_video']) {
      r = await run('حط جنوط سوداء', [() => R.call(n, { prompt: 'a car with black rims' }), () => R.text('ما رسمت.')], true);
      assert.ok(!r.events.some((e) => e.clientTool), n + ' لا تُنفَّذ بأمر تعديل المرفق');
      assert.ok(outputs(r.calls[1]).some((o) => o.startsWith('✗ لم يُنفَّذ: المالك لم يطلب رسمًا')), n);
    }
  } finally { KN.ownerKnowledge = kn0; }
  const C = read('api/_lib/chat.js');
  assert.ok(C.includes("وgenerate_image فقط إن طلب رسم صورة صراحةً.' + ' " + NOTE_A), 'التعليمة ملحقة بفرع المالك وحده، على سطره');
  assert.equal(C.split(NOTE_A).length - 1, 1, 'مرّة واحدة — لا تصل المستخدم العاديّ');
  assert.ok(C.includes("askedTool(cb.name, lastUserText, lastUserHasImage)) result = require('./owner-media.js').REFUSAL;"), 'الحارس يسأل عن الأداة نفسها');
});

test('٨. v-gate-attach (الواجهة): المستخدم العاديّ — صورة + «ركّب/نزّل/ظلّل» تعديل على المرفق كـ«حط»، بالتعبيرين نفسيهما في الخادم', () => {
  const vm = require('node:vm');
  const A9 = read('js/app-09-attach.js');
  const from = A9.indexOf('const OMRAN_ATTMOD_RE = '), to = A9.indexOf('\n}\n', A9.indexOf('function omranAttachModAsk(')) + 3;
  assert.ok(from > 0 && to > from, 'omranAttachModAsk وثابتاها متجاورة');
  assert.ok(A9.indexOf('function omranAttachModAsk(') < A9.indexOf('async function __sendPromptCore('), 'خارج __sendPromptCore (سقّاطة البنية)');
  const ctx = vm.createContext({});
  vm.runInContext(A9.slice(from, to) + '\nthis.f = omranAttachModAsk; this.re = OMRAN_ATTMOD_RE; this.neg = OMRAN_ATTMOD_NEG_RE;', ctx);
  assert.equal(ctx.re.source, OM.ATTACH_MOD_RE.source, 'تعبير الأفعال نسخة حرفيّة من الخادم');
  assert.equal(ctx.neg.source, OM.NEG_ATTACH_RE.source, 'تعبير النفي نسخة حرفيّة من الخادم');
  assert.equal(ctx.re.flags, OM.ATTACH_MOD_RE.flags);
  for (const t of ['ركّب سبويلر', 'ركب سبويلر', 'نزّل السيارة وظلّل القزاز', 'ظلل القزاز', 'حط جنوط سوداء', 'ابيك تركب بودي كت', 'نزّل لي السيارة شوي', 'lower the car']) assert.equal(ctx.f(t), true, 'تعديل: ' + t);
  for (const t of ['', 'نزل الصورة', 'نزّل لي الصورة', 'نزل هذا الملف', 'نزل السوق جديد', 'نزلها', 'حطها خلفية', 'ركب السيارة', 'ركب معي', 'لا تركب سبويلر', 'بدون ما تركب سبويلر', 'تقدر تنزل السيارة؟', 'كيف أركب سبويلر؟',
    'ركبتي تعورني', 'منزل جميل', 'شو يناسب سيارتي', 'ركّب سبويلر ' + 'و'.repeat(230)]) assert.equal(ctx.f(t), false, 'ليس تعديلًا: ' + t.slice(0, 40));
  // «سولي» و«عطني أشكال» خارج هذه الدالّة: الأولى في __imgEditRe أصلًا، والثانية تبقى للمحادثة (عدّة أشكال = عدّة تعديلات مدفوعة — قرار مالك)
  for (const t of ['سولي جنوط سوداء', 'عطني ٣ أشكال للسيارة']) assert.equal(ctx.f(t), false, t);
  // القرار نفسه في الواجهة: الدالّة داخل شرط «صورة مرفقة الآن» وحده، بحرّاسه كما هي (لا كود، لا قراءة/وصف، لا صورة جديدة)
  assert.ok(A9.includes("const __ATT_EDIT = !!(__srcImg && !__srcImg._fromMemory && text && text.length <= 220 && (__imgEditRe.test(text) || omranAttachModAsk(text) /* v-gate-attach */) && (!__IMGF_NOT_RE.test(text) || __IMG_EDIT_VERB_RE.test(text)) && !__IMGF_NEW_RE.test(text) && !__ATT_VISION_RE.test(text) && !__codeWordRe.test(text));"));
  assert.equal(A9.split('omranAttachModAsk(').length - 1, 2, 'تعريف واحد واستعمال واحد');
  const B = read('js/app.bundle.js');
  assert.ok(B.includes('function omranAttachModAsk(') && B.includes('|| omranAttachModAsk(text) /* v-gate-attach */)'), 'الحزمة تحمل التعديل');
});
