// tests/agent-img-push.test.cjs — v-agent-img (المالك ١٣ أكتوبر، رسالة الوكيل لكودي: «الوكيل داخل المحادثة يقدر يرسم صورة ويرفعها
// للمستودع مباشرة، بدون ما المالك يحمّلها ويرفعها من جديد… معيار النجاح: يرسم، ويستدعي write_github بـimage:"__IMG_1__" ومسار
// assets/studio/options/heritage-omani.webp، فيتفتح طلب سحب والصورة فيه»).
// chat.js الحقيقيّ بمزوّد وهميّ وRedis وهميّ وGitHub وهميّ؛ والحفظ بمعالج img-share الحقيقيّ، والتحويل بالمكتبات الحقيقيّة.
// السلسلة: ترسم ← رمز ← رفع ← blob WebP في الشجرة ← طلب سحب.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'agent-img-push-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.GITHUB_TOKEN = 'gh-test-token';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS', 'CHAT_STALL_FIRST_MS', 'CHAT_STALL_IDLE_MS', 'OWNER_USERNAMES', 'OWNER_USERNAME', 'AGENT_GITHUB_DIRECT', 'GITHUB_DEFAULT_REPO']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();   // JSON
const raw = new Map();  // نصّ خامّ (الصور) مع عمره بالثواني
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null),
  kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); raw.delete(k); }, kvExpire: async () => {},
  kvGetRaw: async (k) => (raw.has(k) ? raw.get(k).v : null),
  kvSetRaw: async (k, v, ttl) => { raw.set(k, { v, ttl }); },
  kvSetIfAbsent: async (k, v, ttl) => { if (raw.has(k)) return false; raw.set(k, { v, ttl }); return true; },
  kvIncr: async () => 1, kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvList: async () => [],
});
let user = 'omran';
const refunds = [];
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: user, tier: user === 'omran' ? 'owner' : 'vip', subscriber: true }),
  checkAndConsumeCustom: async () => ({ allowed: true, username: user, remaining: Infinity }),
  refundCustom: async (...a) => { refunds.push(a); },
});
stub('api/_lib/_vip.js', { isVip: async () => false });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
// GitHub خلف حارس safe-url: الاسم يُحلّ إلى عنوان عامّ ثابت بلا شبكة
require('node:dns').promises.lookup = async () => [{ address: '140.82.112.3', family: 4 }];
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const IS = require(rp('api/_lib/img-share.js'));
const AI = require(rp('api/_lib/agent-img.js'));
const IC = require(rp('api/_lib/img-convert.js'));
const GE = require(rp('api/_lib/github-edit.js'));
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

// صورتان حقيقيّتان ٦٤×٤٨ (تدرّج) — PNG كما يرجعها المحرّك، وJPEG كمرفق المالك
function rgba(w, h) { const d = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = x * 4; d[i + 1] = y * 5; d[i + 2] = 128; d[i + 3] = 255; } return d; }
const W = 64, H = 48;
const PNG_B64 = (() => { const p = new PNG({ width: W, height: H }); rgba(W, H).copy(p.data); return PNG.sync.write(p).toString('base64'); })();
const JPG_B64 = Buffer.from(jpeg.encode({ data: rgba(W, H), width: W, height: H }, 90).data).toString('base64');
const P = 'assets/studio/options/heritage-omani.webp';
const REPO = 'OMRAN77/omran-ai-builder';
const isWebp = (b64) => { const b = Buffer.from(b64, 'base64'); return b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP'; };

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
// معالج المخزن الحقيقيّ (POST /api/media?action=img) كما يناديه العميل
async function share(body, who) {
  user = who || 'omran';
  const out = { code: 0, body: null };
  const res = { setHeader() {}, status(c) { out.code = c; return this; }, json(v) { out.body = v; return this; }, send(v) { out.body = v; return this; }, end() {} };
  await IS({ method: 'POST', headers: {}, query: {}, body: Object.assign({ token: token(user) }, body) }, res);
  return out;
}

// GitHub وهميّ: يسجّل كلّ نداء ويردّ بحسب المسار
const ghRes = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
const GH_ROUTES = [
  ['GET', /^\/repos\/[^/]+\/[^/]+$/, () => ghRes({ default_branch: 'main' })],
  ['GET', /\/git\/ref\/heads\/main$/, () => ghRes({ object: { sha: 'basesha' } })],
  ['GET', /\/git\/commits\/basesha$/, () => ghRes({ tree: { sha: 'basetree' } })],
  ['POST', /\/git\/blobs$/, () => ghRes({ sha: 'imgblob' }, 201)],
  ['POST', /\/git\/trees$/, () => ghRes({ sha: 'newtree' }, 201)],
  ['POST', /\/git\/commits$/, () => ghRes({ sha: 'abc1234567', html_url: 'https://github.com/' + REPO + '/commit/abc1234567' }, 201)],
  ['POST', /\/git\/refs$/, () => ghRes({ ref: 'refs/heads/x' }, 201)],
  ['GET', /\/pulls\?/, () => ghRes([])],
  ['POST', /\/pulls$/, () => ghRes({ number: 77, html_url: 'https://github.com/' + REPO + '/pull/77' }, 201)],
];
function ghRoute(gh, url, init) {
  const u = String(url).replace('https://api.github.com', '');
  const method = (init && init.method) || 'GET';
  let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
  gh.push({ method, url: u, body });
  for (const [m, re, r] of GH_ROUTES) if (m === method && re.test(u)) return r();
  return ghRes({ message: 'Not Found' }, 404);
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
// المتصفّح الوهميّ لـgenerate_image: يحفظ الرسمة بالمعالج الحقيقيّ (purpose:'agent') ويرجع سطر app-17 نفسه
async function fakeClientDraw(tok) {
  const s = await share({ data: PNG_B64, mime: 'image/png', purpose: 'agent' });
  assert.equal(s.code, 200, JSON.stringify(s.body));
  return '✅ رُسمت الصورة (engine: test). ضع هذا الرمز حرفيًّا في src بلا أي إضافة: ' + tok + ' رابطها في التطبيق: ' + s.body.url + ' — لرفعها إلى المستودع: write_github ملف {path, image: "' + tok + '"}.';
}
async function run(messages, script, extra) {
  const calls = [], gh = [], out = [], pending = [];
  const save = global.fetch;
  let n = 0;
  global.fetch = async (url, init) => {
    if (/^https:\/\/api\.github\.com\//.test(String(url))) return ghRoute(gh, url, init);
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    if (!/api\.openai\.com\/v1\/responses/.test(String(url))) return new Response('{}', { status: 404 });
    calls.push({ url: String(url), body: b });
    return script[Math.min(n++, script.length - 1)]();
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token('omran'), provider: 'openai', model: 'openai/gpt-6-astra', messages }, extra || {}) };
  const res = {
    setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, end() {}, flushHeaders() {},
    write(c) {
      out.push(String(c));
      for (const l of String(c).split('\n')) {
        if (!l.startsWith('data: ')) continue;
        let e = null; try { e = JSON.parse(l.slice(6)); } catch (err) { e = null; }
        if (e && e.clientTool && e.clientTool.name === 'generate_image') {
          const id = e.clientTool.id;
          pending.push(fakeClientDraw('__IMG_1__').then((output) => { db.set('agent/tool/' + id, { output }); }));
        }
      }
      return true;
    },
  };
  user = 'omran';
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  try { await chat(req, res); await Promise.all(pending); } finally { global.fetch = save; delete process.env.OPENAI_API_KEY; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, gh, events };
}
const outputs = (body) => (body.input || []).filter((x) => x && x.type === 'function_call_output').map((x) => String(x.output));
const reset = () => { db.clear(); raw.clear(); refunds.length = 0; };

test('١. img-convert: PNG وJPEG إلى ‎.webp يتحوّلان WebP بالأبعاد نفسها، والعكس، والصيغة المطابقة كما هي، وGIF يُرفض بسببه', async () => {
  assert.equal(IC.sniff(Buffer.from(PNG_B64, 'base64')), 'png');
  assert.equal(IC.sniff(Buffer.from(JPG_B64, 'base64')), 'jpeg');
  for (const [src, from] of [[PNG_B64, 'png'], [JPG_B64, 'jpeg']]) {
    const c = await IC.toPathFormat(src, P);
    assert.equal(c.converted, true); assert.equal(c.from, from); assert.equal(c.to, 'webp');
    assert.ok(isWebp(c.b64), 'بايتات WebP حقيقيّة');
    const back = await (await IC.__webpLib()).decode(new Uint8Array(Buffer.from(c.b64, 'base64')));
    assert.equal(back.width, W); assert.equal(back.height, H);
  }
  const webp = (await IC.toPathFormat(PNG_B64, P)).b64;
  const png = await IC.toPathFormat(webp, 'a/b.png');
  assert.equal(png.converted, true); assert.equal(IC.sniff(Buffer.from(png.b64, 'base64')), 'png');
  const same = await IC.toPathFormat(PNG_B64, 'a/b.png');
  assert.equal(same.converted, false); assert.equal(same.b64, PNG_B64, 'المطابق يُرفع كما هو');
  const GIF = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1').toString('base64');
  assert.match((await IC.toPathFormat(GIF, P)).error, /GIF لا يُحوَّل/);
  assert.match((await IC.toPathFormat(PNG_B64, 'a/b.txt')).error, /امتداد ليس صورة/);
  assert.match((await IC.toPathFormat(Buffer.from('hello').toString('base64'), P)).error, /ليست PNG ولا JPEG/);
});

test('٢. المخزن: purpose:"agent" للمالك وحده — يوم واحد لا أسبوع، والمعرّف بصمة المحتوى فالصورة نفسها لا تُكتب مرّتين', async () => {
  reset();
  const a = await share({ data: PNG_B64, mime: 'image/png', purpose: 'agent' });
  assert.equal(a.code, 200);
  assert.equal(a.body.id, IS.contentId(PNG_B64)); assert.equal(a.body.url, '/i/' + a.body.id + '.png'); assert.equal(a.body.ttlDays, 1);
  assert.equal(raw.get('db/img/' + a.body.id).ttl, 86400, 'TTL ٢٤ ساعة (Redis قرب الامتلاء)');
  const keys = raw.size;
  const again = await share({ data: PNG_B64, mime: 'image/png', purpose: 'agent' });
  assert.equal(again.body.id, a.body.id); assert.equal(raw.size, keys, 'لا كتابة ثانية');
  const other = await share({ data: PNG_B64, mime: 'image/png', purpose: 'agent' }, 'someone');
  assert.equal(other.code, 403); assert.deepEqual(other.body, { error: 'owner_only' });
  assert.equal(refunds.length, 1, 'حصّة غير المالك تُردّ');
  const plain = await share({ data: JPG_B64, mime: 'image/jpeg' });
  assert.equal(plain.code, 200); assert.equal(plain.body.ttlDays, 7);
  assert.notEqual(plain.body.id, IS.contentId(JPG_B64), 'المشاركة العاديّة كما كانت: معرّف عشوائيّ');
  assert.equal(raw.get('db/img/' + plain.body.id).ttl, 7 * 86400);
});

test('٣. agent-img: خريطة المحادثة بصيغها فقط، ونتيجة الرسم برمز واحد ورابط واحد تسجّل الرمز، والرمز المجهول يُعلَّم', () => {
  assert.deepEqual(AI.seedTokens({ __IMG_1__: 'ABCDEF123456', __IMG_x__: 'abcdef123456', __IMG_2__: '../etc', other: 'abcdef123456' }), { __IMG_1__: 'abcdef123456' });
  assert.deepEqual(AI.seedTokens('x'), {}); assert.deepEqual(AI.seedTokens(['a']), {});
  const m = {};
  AI.noteTokens('✅ رُسمت الصورة: __IMG_2__ رابطها في التطبيق: /i/0123456789abcdef.png — write_github ملف {path, image: "__IMG_2__"}.', m);
  assert.deepEqual(m, { __IMG_2__: '0123456789abcdef' });
  AI.noteTokens('__IMG_3__ و__IMG_4__ /i/aaaaaaaaaaaa.png', m);
  assert.equal(m.__IMG_3__, undefined, 'رمزان مع رابط واحد = لا تخمين');
  assert.deepEqual(AI.resolveImage(' __IMG_2__ ', m), { value: '0123456789abcdef' });
  assert.deepEqual(AI.resolveImage('__IMG_9__', m), { value: '__IMG_9__', unknown: true });
  assert.deepEqual(AI.resolveImage('/i/abc123def456.jpg', m), { value: '/i/abc123def456.jpg' });
});

test('٤. معيار النجاح: المزوّد يرسم ← رمز __IMG_1__ ← write_github بمسار heritage-omani.webp ← blob WebP في الشجرة ← طلب سحب', async () => {
  reset();
  const r = await run([{ role: 'user', content: 'ارسم صورة عماني بكمة وارفعها للمستودع مكان ' + P }], [
    () => R.call('generate_image', { prompt: 'Omani man in dishdasha and kummah, studio portrait' }),
    () => R.call('write_github', { repo: REPO, files: [{ path: P, image: '__IMG_1__' }], message: 'استبدال صورة عماني بكمة', title: 'Heritage Omani image' }),
    () => R.text('رفعت الصورة وفتحت الطلب.'),
  ]);
  assert.ok(r.events.some((e) => e.clientTool && e.clientTool.name === 'generate_image'), 'الرسم في المتصفّح');
  const cid = IS.contentId(PNG_B64);
  assert.equal(raw.get('db/img/' + cid).ttl, 86400, 'الرسمة محفوظة يومًا');
  assert.ok(outputs(r.calls[1].body).some((o) => o.includes('__IMG_1__') && o.includes('/i/' + cid + '.png')), 'الرمز والرابط وصلا النموذج');
  const blob = r.gh.find((c) => c.method === 'POST' && /\/git\/blobs$/.test(c.url));
  assert.ok(blob, 'blob للصورة'); assert.equal(blob.body.encoding, 'base64');
  assert.ok(isWebp(blob.body.content), 'PNG من المحرّك صار WebP قبل الرفع');
  const tree = r.gh.find((c) => c.method === 'POST' && /\/git\/trees$/.test(c.url));
  assert.ok(tree.body.tree.some((e) => e.path === P && e.type === 'blob' && e.sha === 'imgblob'), 'الصورة في الشجرة بمسارها');
  const pr = r.gh.find((c) => c.method === 'POST' && /\/pulls$/.test(c.url));
  assert.ok(pr, 'فُتح طلب سحب'); assert.equal(pr.body.base, 'main'); assert.match(pr.body.head, /^omran-agent\//);
  assert.ok(!r.gh.some((c) => c.method === 'PATCH'), 'لا دفع إلى main ولا دمج');
  const res = outputs(r.calls[2].body).find((o) => o.includes('رُفع'));
  assert.ok(res && res.startsWith('✅ رُفع') && res.includes('طلب السحب #77') && res.includes('🖼️ حُوّلت صيغة الصورة') && res.includes('png→webp'), res);
});

test('٥. دور لاحق: الرمز من خريطة المحادثة (imgIds من العميل) يكفي للرفع، والرمز المجهول يُرفض قبل أيّ نداء لـGitHub', async () => {
  reset();
  const s = await share({ data: PNG_B64, mime: 'image/png', purpose: 'agent' });
  let r = await run([{ role: 'user', content: 'ارفع الصورة اللي رسمتها مكان ' + P }], [
    () => R.call('write_github', { repo: REPO, files: [{ path: P, image: '__IMG_1__' }], message: 'رفع الرسمة' }),
    () => R.text('رفعت.'),
  ], { imgIds: { __IMG_1__: s.body.id } });
  assert.ok(outputs(r.calls[1].body).some((o) => o.startsWith('✅ رُفع')), JSON.stringify(outputs(r.calls[1].body)));
  assert.ok(isWebp(r.gh.find((c) => /\/git\/blobs$/.test(c.url)).body.content));
  r = await run([{ role: 'user', content: 'ارفع الصورة الثانية مكان ' + P }], [
    () => R.call('write_github', { repo: REPO, files: [{ path: P, image: '__IMG_2__' }], message: 'رفع' }),
    () => R.text('ما رفعت.'),
  ], { imgIds: { __IMG_1__: s.body.id } });
  const err = outputs(r.calls[1].body)[0];
  assert.ok(err.startsWith('✗ لم يُرفع شيء') && err.includes('__IMG_2__') && err.includes('لا صورة محفوظة له'), err);
  assert.equal(r.gh.length, 0, 'لا نداء لـGitHub');
});

test('٦. صورة يرفقها المالك في رسالته: تُحفظ يومًا ويصل النموذجَ رابطها /i/، ورفعها إلى ‎.webp يحوّل JPEG إلى WebP', async () => {
  reset();
  const cid = IS.contentId(JPG_B64);
  const url = '/i/' + cid + '.jpg';
  const r = await run([{ role: 'user', content: [{ type: 'text', text: 'ارفع هذي الصورة للمستودع مكان ' + P }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: JPG_B64 } }] }], [
    () => R.call('write_github', { repo: REPO, files: [{ path: P, image: url }], message: 'صورة المالك' }),
    () => R.text('رفعتها.'),
  ]);
  const tail = JSON.stringify(r.calls[0].body.input);
  assert.ok(tail.includes('[صور رسالة المالك محفوظة في التطبيق يومًا') && tail.includes('الصورة 1: ' + url), 'الرابط في ذيل الدور');
  assert.equal(raw.get('db/img/' + cid).ttl, 86400);
  assert.ok(outputs(r.calls[1].body).some((o) => o.startsWith('✅ رُفع') && o.includes('jpeg→webp')));
  assert.ok(isWebp(r.gh.find((c) => /\/git\/blobs$/.test(c.url)).body.content));
  // attachmentLinks مباشرة: حتّى ٦ صور، والمكرّر مفتاح واحد، وغير الصور يُتجاهل
  reset();
  const blocks = [{ type: 'text', text: 'x' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } }];
  const note = await AI.attachmentLinks(blocks);
  assert.equal(note.length, 1);
  assert.ok(note[0].includes('الصورة 1: /i/' + IS.contentId(PNG_B64) + '.png') && note[0].includes('الصورة 2: /i/' + IS.contentId(PNG_B64) + '.png'));
  assert.equal(raw.size, 1, 'الصورة نفسها مرّتين = مفتاح واحد');
  assert.deepEqual(await AI.attachmentLinks([{ type: 'text', text: 'x' }]), []);
});

test('٧. edit_github يقبل images [{path, image}] — رمز الرسمة يُستبدل في الالتزام نفسه بلا تعديل نصّيّ، والتعارض مرفوض', async () => {
  const cid = IS.contentId(PNG_B64);
  const gh = [];
  const o = {
    fetchImpl: async (url, init) => ghRoute(gh, url, init), lookup: async () => [{ address: '140.82.112.3', family: 4 }], env: { GITHUB_TOKEN: 'tok' },
    getImage: async (id) => (id === cid ? { mime: 'image/png', b64: PNG_B64 } : null), imgIds: { __IMG_3__: cid },
  };
  const out = await GE.editFiles({ repo: REPO, images: [{ path: P, image: '__IMG_3__' }], message: 'صورة' }, o);
  assert.equal(out.ok, true, JSON.stringify(out)); assert.equal(out.prNumber, 77);
  assert.deepEqual(out.converted, [P + ' (png→webp)']);
  assert.ok(isWebp(gh.find((c) => /\/git\/blobs$/.test(c.url)).body.content));
  assert.ok(gh.find((c) => /\/git\/trees$/.test(c.url)).body.tree.some((e) => e.path === P && e.sha === 'imgblob'));
  assert.match(GE.validateEdits({ edits: [{ path: P, old: 'a', new: 'b' }], images: [{ path: P, image: '__IMG_3__' }] }).error, /معًا/);
  assert.match(GE.validateEdits({}).error, /images/);
  assert.match((await GE.editFiles({ repo: REPO, images: [{ path: P, image: '__IMG_8__' }] }, o)).error, /لا صورة محفوظة له/);
});

test('٨. الأسلاك: العميل يحفظ رسمة المالك ويرسل خريطة المحادثة، chat.js للمالك وحده، والحزمة مبنيّة، والمكتبة مضمّنة في الدالّة', () => {
  const c17 = read('js/app-17-agent-tools.js'), c18 = read('js/app-18-chat-tools.js'), bundle = read('js/app.bundle.js'), ch = read('api/_lib/chat.js');
  assert.ok(c17.includes("purpose: 'agent'") && c17.includes('cur.agentImgIds = m') && c17.includes("if ((args && args.noRef) || omranAgentOwner())"));
  assert.ok(c17.includes('var eUrl = omranAgentOwner() ? await omranAgentSave(etok'), 'edit_image أيضًا');
  assert.ok(c18.includes('imgIds: (function () {') && c18.includes('omranOwnerUi()') && c18.includes('c.agentImgIds'));
  for (const s of ["purpose: 'agent'", 'cur.agentImgIds = m', 'c.agentImgIds']) assert.ok(bundle.includes(s), 'الحزمة: ' + s);
  assert.ok(ch.includes("imgIds: __ownerReq ? require('./agent-img.js').seedTokens(body && body.imgIds) : {}"));
  assert.ok(ch.includes("if (__ownerReq) require('./agent-img.js').noteTokens(result, __ownerOps.imgIds);"));
  assert.ok(ch.includes('(__ownerReq && toolTurn && lastUserHasImage) ? await require(\'./agent-img.js\').attachmentLinks('));
  assert.ok(ch.includes('pushFiles(input, { imgIds: __ownerOps.imgIds })') && ch.includes('editFiles(input, { imgIds: __ownerOps.imgIds })'));
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies['@jsquash/webp'], 'مكتبة WebP في الاعتماديّات');
  assert.ok(pkg.scripts.test.includes('tests/agent-img-push.test.cjs'));
  const v = JSON.parse(read('vercel.json'));
  assert.equal(v.functions['api/*.js'].includeFiles, 'node_modules/@jsquash/webp/**', 'ملفّات WASM تُضمَّن في الدالّة (الاستيراد بمسار محسوب لا يتتبّعه المجمّع)');
});
