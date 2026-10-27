// tests/owner-see-pics.test.cjs — v-owner-like-me + v-owner-see-repo-img (المالك ١٣ أكتوبر، ردّ GPT-6 Astra على «الحينه شوف هذي الصور اريدك
// ان تغيرها على نفس الاسامي» مع لقطة بطاقات الأزياء: «أدوات إنشاء الصور غير متاحة في هذا الدور، والصور البديلة الموجودة بالمستودع ما قدرت
// أعاينها» ← «صلح»):
// (١) لقطة التطبيق مع طلب صور فيه: generate_image مفتوحة (بـnoRef فلا تتحوّل تعديلًا على اللقطة)، وedit_image والفيديو مقفلان كما كانا،
//     و«احذف هذا المكان» بلا كلمة صور كما كانت.
// (٢) read_github على مسار صورة في المستودع: بايتاتها تُرفق بعد نتائج الخطوة للموديل الذي يرى بلا تبديل في منتصف الدور.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'owner-see-pics-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS', 'CHAT_STALL_FIRST_MS', 'CHAT_STALL_IDLE_MS']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  // أدوات المتصفّح (runInClient): نتيجة جاهزة فورًا بدل انتظار متصفّح
  kvGetJSON: async (k) => (/^agent\/tool\//.test(k) ? { output: '✅ رُسمت الصورة (engine: test). ضع هذا الرمز حرفيًّا في src: __IMG_1__' } : (db.has(k) ? structuredClone(db.get(k)) : null)),
  kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: 'omran', tier: 'owner', subscriber: true }),
});
stub('api/_lib/_vip.js', { isVip: async () => false });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const GR = require(rp('api/_lib/github-read.js'));
const realReadImage = GR.readImageFile;
const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
GR.readImageFile = async (input) => ({ path: input.path, mime: 'image/webp', b64: PNG1, bytes: 70 });
GR.readGithub = async (input) => '📄 ' + (input.path || '') + ' — ملفّ ثنائيّ (70B)، لا يُقرأ نصًّا.';
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const resp = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const done = { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } };
const R = {
  text: (t) => resp([{ type: 'response.created', response: { model: 'gpt-6-astra' } }, { type: 'response.output_text.delta', output_index: 0, delta: t }, done]),
  call: (name, input) => {
    const id = 'call_' + Math.random().toString(36).slice(2, 8), args = JSON.stringify(input);
    return resp([{ type: 'response.created', response: { model: 'gpt-6-astra' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: id, name, arguments: '' } },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: id, name, arguments: args, status: 'completed' } }, done]);
  },
};
const oaSse = (chunks) => new Response(chunks.map((c) => 'data: ' + (typeof c === 'string' ? c : JSON.stringify(c)) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const G = {
  text: (t) => oaSse([{ model: 'm', choices: [{ index: 0, delta: { content: t } }] }, { model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, '[DONE]']),
  call: (name, input) => oaSse([{ model: 'm', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c' + Math.random().toString(36).slice(2, 7), type: 'function', function: { name, arguments: JSON.stringify(input) } }] } }] },
    { model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }, '[DONE]']),
};
async function run(prov, messages, script, extra) {
  const calls = [], out = [];
  const save = global.fetch;
  let n = 0;
  const host = prov === 'groq' ? /api\.groq\.com/ : /api\.openai\.com\/v1\/responses/;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    if (!host.test(String(url))) return new Response('{}', { status: 404 });
    calls.push({ url: String(url), body: b });
    return script[Math.min(n++, script.length - 1)]();
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token('omran'), provider: prov, model: prov === 'openai' ? 'openai/gpt-6-astra' : undefined, messages }, extra || {}) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  process.env.OPENAI_API_KEY = 'sk-openai-test'; process.env.GROQ_API_KEY = 'gsk-test';
  try { await chat(req, res); } finally { global.fetch = save; delete process.env.OPENAI_API_KEY; delete process.env.GROQ_API_KEY; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, events, text: events.map((e) => e.delta || '').join('') };
}
const shot = (t) => [{ role: 'user', content: [{ type: 'text', text: t }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG1 } }] }];
const ASK = 'الحينه شوف هذي الصور اريدك ان تغيرها على نفس الاسامي';
const outputs = (body) => (body.input || []).filter((x) => x && x.type === 'function_call_output').map((x) => x.output);

test('١. لقطة التطبيق + «غيّر هذي الصور»: generate_image تُنفَّذ بـnoRef (اللقطة لا تُعدَّل بدلها)، والتنبيه يرفع الصورة مع التعديل بلا «عمّم»', async () => {
  const r = await run('openai', shot(ASK), [() => R.call('generate_image', { prompt: 'Omani man in dishdasha and kummah' }), () => R.text('رسمت البديل.')], { ownerUiShot: true });
  const tail = JSON.stringify(r.calls[0].body.input);
  assert.ok(tail.includes('لقطة من التطبيق والمطلوب صور فيه'), 'تنبيه الصور لا «مقفلة»');
  assert.ok(tail.includes('الصورة مع التعديل') && tail.includes('write_github') && tail.includes('لا تنتظر «عمّم»'));
  assert.ok(!tail.includes('أدوات الصور والفيديو مقفلة في هذا الدور'));
  const ct = r.events.find((e) => e.clientTool && e.clientTool.name === 'generate_image');
  assert.ok(ct, 'نُفّذت في المتصفّح');
  assert.equal(ct.clientTool.input.noRef, true, 'صورة جديدة لا تعديل على اللقطة');
  assert.ok(outputs(r.calls[1].body).some((o) => o.includes('رُسمت الصورة')), 'النتيجة عادت للموديل');
  const carry = r.calls.slice(1).some((c) => JSON.stringify(c.body && c.body.input).includes('ارفع الصورة الآن بـwrite_github'));
  assert.ok(carry, 'بعد الرسم بلا رفع يُحمَل للكتابة لا لـedit_github');
});

test('٢. وفي الدور نفسه edit_image وgenerate_video مرفوضتان كما كانتا — اللقطة نفسها لا تُعدَّل', async () => {
  const r = await run('openai', shot(ASK), [() => R.call('edit_image', { instruction: 'make it a man' }), () => R.text('ما عدّلت اللقطة.')], { ownerUiShot: true });
  assert.ok(!r.events.some((e) => e.clientTool && e.clientTool.name === 'edit_image'), 'لم تصل المتصفّح');
  assert.ok(outputs(r.calls[1].body).some((o) => o.includes('هذه الأداة مقفلة في هذا الدور')));
});

test('٣. «احذف هذا المكان» مع لقطة (بلا كلمة صور) كما كان: generate_image مرفوضة والتنبيه «مقفلة»', async () => {
  const r = await run('openai', shot('احذف هذا المكان من الواجهة\n\n[مرفقات: image.png]'), [() => R.call('generate_image', { prompt: 'x' }), () => R.text('ما رسمت.')], { ownerUiShot: true });
  assert.ok(JSON.stringify(r.calls[0].body.input).includes('أدوات الصور والفيديو مقفلة في هذا الدور'));
  assert.ok(!r.events.some((e) => e.clientTool && e.clientTool.name === 'generate_image'));
  assert.ok(outputs(r.calls[1].body).some((o) => o.includes('هذه الأداة مقفلة في هذا الدور')));
});

test('٤. read_github على صورة في المستودع: GPT يراها (input_image بعد نتيجة الخطوة)، وGroq gpt-oss النصّيّ يبقى على القراءة النصّيّة بلا تبديل موديل', async () => {
  const P = 'assets/studio/options/heritage-omani.webp';
  let r = await run('openai', [{ role: 'user', content: 'شوف صورة عماني بكمة في المستودع' }], [() => R.call('read_github', { url: 'OMRAN77/omran-ai-builder', path: P }), () => R.text('الصورة امرأة.')]);
  const inp = r.calls[1].body.input;
  const fo = inp.findIndex((x) => x && x.type === 'function_call_output');
  assert.ok(outputs(r.calls[1].body)[0].startsWith('🖼️ ' + P), outputs(r.calls[1].body)[0]);
  const img = inp.slice(fo + 1).find((x) => x && x.role === 'user' && Array.isArray(x.content) && x.content.some((c) => c.type === 'input_image'));
  assert.ok(img, 'الصورة بعد نتيجة الأداة');
  assert.ok(img.content.some((c) => c.type === 'input_image' && c.image_url === 'data:image/webp;base64,' + PNG1));
  assert.ok(img.content.some((c) => c.type === 'input_text' && c.text.includes('[صورة من المستودع: ' + P + ']')));
  r = await run('groq', [{ role: 'user', content: 'شوف صورة عماني بكمة في المستودع' }], [() => G.call('read_github', { url: 'OMRAN77/omran-ai-builder', path: P }), () => G.text('ملفّ ثنائيّ.')]);
  assert.ok(!JSON.stringify(r.calls[1].body).includes('image_url'), 'لا صورة لموديل لا يرى');
  assert.ok(JSON.stringify(r.calls[1].body).includes('ملفّ ثنائيّ'));
  assert.equal(r.calls[0].body.model, r.calls[1].body.model, 'لا تبديل موديل في منتصف الدور');
});

test('٥. readImageFile: بايتات الصورة بترويسة raw ونوعها من الامتداد، والكبيرة والمسار غير الصورة مرفوضان', async () => {
  GR.readImageFile = realReadImage;
  const bytes = Buffer.from(PNG1, 'base64');
  const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url: String(url), accept: init && init.headers && init.headers.Accept }); return new Response(bytes, { status: 200 }); };
  const out = await GR.readImageFile({ url: 'OMRAN77/omran-ai-builder', path: 'assets/a b.webp' }, { fetchImpl, lookup, env: { GITHUB_TOKEN: 't' } });
  assert.equal(out.mime, 'image/webp'); assert.equal(out.b64, PNG1); assert.equal(out.bytes, bytes.length);
  assert.match(seen[0].url, /\/repos\/OMRAN77\/omran-ai-builder\/contents\/assets\/a%20b\.webp$/);
  assert.equal(seen[0].accept, 'application/vnd.github.raw+json');
  const big = await GR.readImageFile({ url: 'o/r', path: 'x.png' }, { fetchImpl: async () => new Response(Buffer.alloc(3500001), { status: 200 }), lookup, env: { GITHUB_TOKEN: 't' } });
  assert.match(big.error, /أكبر من حدّ الرؤية/);
  assert.equal(GR.imagePathOf({ url: 'o/r', path: 'js/app.js' }), null);
  assert.equal(GR.imagePathOf({ url: 'o/r', path: 'a.png', query: 'x' }), null);
  assert.ok(GR.imagePathOf({ url: 'https://github.com/o/r/blob/main/assets/x.JPG' }));
});

test('٦. العميل: noRef يمنع تحويل generate_image إلى تعديل على المرفق، ويحفظ رابط /i/ للرفعة، والحزمة مبنيّة', () => {
  const src = fs.readFileSync(path.join(root, 'js/app-17-agent-tools.js'), 'utf8');
  assert.ok(/var gCreative = !!\(gFirst && gRefB64[^\n]*&& !\(args && args\.noRef\)\);/.test(src));
  // v-agent-img: الحفظ صار لكلّ رسمة للمالك (noRef وغيره) بـpurpose:'agent'، ونصّ noRef «ارفعها الآن» باقٍ
  assert.ok(src.includes("if ((args && args.noRef) || omranAgentOwner())") && src.includes("/api/media?action=img") && src.includes("purpose: 'agent'") && src.includes('write_github ملف') && src.includes('ارفعها الآن'));
  assert.ok(fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8').includes('&& !(args && args.noRef));'));
  assert.ok(fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8').includes('/api/media?action=img'));
});
