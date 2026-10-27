// tests/agent-mode-img.test.cjs — v-agent-img-mode (المالك ١٤ أكتوبر، ردّ وكيل التطبيق بعد دمج #1047: «الصور ما تبدّلت. التعديل #1047
// يشتغل في المحادثة العادية بس، وأنت الحين في وضع الوكيل… ما فيه أداة رسم في الوكيل، والرفع ما يعرف الرموز، والخريطة ما توصل الوكيل»).
// agent.js الحقيقيّ بمحرّك وهميّ وRedis وهميّ وGitHub وهميّ، والحفظ بمعالج img-share الحقيقيّ، والتحويل بالمكتبات الحقيقيّة:
// وضع الوكيل يرسم ← رمز __IMG_1__ ← write_github بمسار heritage-omani.webp ← blob WebP في الشجرة ← طلب سحب.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.OWNER_AGENT_CLAUDE = 'on'; // v-agent-claude-off: الاختبار يفحص الوكيل وهو شغّال
process.env.AUTH_SECRET = 'agent-mode-img-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.GITHUB_TOKEN = 'gh-test-token';
for (const k of ['OPENROUTER_API_KEY', 'OWNER_USERNAMES', 'OWNER_USERNAME', 'AGENT_GITHUB_DIRECT', 'GITHUB_DEFAULT_REPO', 'TAVILY_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();   // JSON
const raw = new Map();  // نصّ خامّ (الصور) مع عمره
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
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: user, tier: 'owner', subscriber: true }),
  checkAndConsumeCustom: async () => ({ allowed: true, username: user, remaining: Infinity }),
  refundCustom: async () => {},
});
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
require('node:dns').promises.lookup = async () => [{ address: '140.82.112.3', family: 4 }]; // GitHub خلف safe-url بلا شبكة
const agent = require(rp('api/_lib/agent.js'));
const IS = require(rp('api/_lib/img-share.js'));
const { PNG } = require('pngjs');

const W = 64, H = 48;
const PNG_B64 = (() => { const p = new PNG({ width: W, height: H }); for (let i = 0; i < W * H; i++) { p.data[i * 4] = i % 256; p.data[i * 4 + 1] = 90; p.data[i * 4 + 2] = 160; p.data[i * 4 + 3] = 255; } return PNG.sync.write(p).toString('base64'); })();
const P = 'assets/studio/options/heritage-omani.webp';
const REPO = 'OMRAN77/omran-ai-builder';
const isWebp = (b64) => { const b = Buffer.from(b64, 'base64'); return b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP'; };

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
async function share(body) {
  const out = { code: 0, body: null };
  const res = { setHeader() {}, status(c) { out.code = c; return this; }, json(v) { out.body = v; return this; }, send(v) { out.body = v; return this; }, end() {} };
  await IS({ method: 'POST', headers: {}, query: {}, body: Object.assign({ token: token(user) }, body) }, res);
  return out;
}
// المتصفّح الوهميّ لـgenerate_image: يحفظ بالمعالج الحقيقيّ (purpose:'agent') ويرجع سطر app-17 نفسه
async function fakeClientDraw(tok) {
  const s = await share({ data: PNG_B64, mime: 'image/png', purpose: 'agent' });
  assert.equal(s.code, 200, JSON.stringify(s.body));
  return '✅ رُسمت الصورة (engine: test). ضع هذا الرمز حرفيًّا في src بلا أي إضافة: ' + tok + ' رابطها في التطبيق: ' + s.body.url + ' — لرفعها إلى المستودع: write_github ملف {path, image: "' + tok + '"}.';
}

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
  ['POST', /\/pulls$/, () => ghRes({ number: 88, html_url: 'https://github.com/' + REPO + '/pull/88' }, 201)],
];

const sse = (events) => new Response(events.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 5, output_tokens: 0 } } };
const toolTurn = (name, input) => () => sse([start,
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_' + Math.random().toString(36).slice(2, 8), name, input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'tool_use' } }]);
const textTurn = (t) => () => sse([start, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }]);

const saves = [];
async function run(ask, script, extra) {
  const calls = [], gh = [], pending = []; saves.length = 0;
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/^https:\/\/api\.github\.com\//.test(u)) {
      const p = u.replace('https://api.github.com', ''), method = (init && init.method) || 'GET';
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
      gh.push({ method, url: p, body });
      for (const [m, re, r] of GH_ROUTES) if (m === method && re.test(p)) return r();
      return ghRes({ message: 'Not Found' }, 404);
    }
    if (!/api\.anthropic\.com\/v1\/messages/.test(u)) return new Response('{}', { status: 404 });
    calls.push(JSON.parse(init.body));
    return script[Math.min(i++, script.length - 1)]();
  };
  let written = '';
  const req = { method: 'POST', headers: { host: 'x' }, body: Object.assign({ messages: [{ role: 'user', content: ask }], token: token('omran') }, extra || {}) };
  const res = {
    setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, end() {}, flush() {},
    write(c) {
      written += String(c || '');
      for (const l of String(c).split('\n')) {
        if (!l.startsWith('data: ')) continue;
        let e = null; try { e = JSON.parse(l.slice(6)); } catch (err) { e = null; }
        if (e && e.clientTool && e.clientTool.name === 'save_image') { // المتصفّح يحفظ الرسمة التي عنده برمزها — بلا رسم
          const id = e.clientTool.id, t = e.clientTool.input.token;
          saves.push(t);
          if (t === '__IMG_2__') db.set('agent/tool/' + id, { output: 'تعذّر: لا صورة للرمز ' + t + ' في هذا المتصفّح — ارسمها من جديد.' }); // رمز لا رسمة له في المتصفّح
          else pending.push(share({ data: PNG_B64, mime: 'image/png', purpose: 'agent' }).then((sv) => { db.set('agent/tool/' + id, { output: '✅ حُفظت ' + t + ': ' + sv.body.url }); }));
        }
        if (e && e.clientTool && e.clientTool.name === 'generate_image') {
          const id = e.clientTool.id;
          pending.push(fakeClientDraw('__IMG_1__').then((output) => { db.set('agent/tool/' + id, { output }); }));
        }
      }
    },
  };
  user = 'omran';
  try { await agent(req, res); await Promise.all(pending); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { calls, gh, events };
}
const toolResults = (body) => { const last = body.messages[body.messages.length - 1]; return (Array.isArray(last.content) ? last.content : []).filter((b) => b.type === 'tool_result').map((b) => String(b.content)); };

test('١. وضع الوكيل: أداتا الرسم للمالك وحده (بعنوان الخطوة أوّلًا)، ومهلة المتصفّح بحسب الأداة', () => {
  const { toolsFor, CLIENT_WAIT_MS } = agent.__test;
  const names = (u) => toolsFor(u).map((t) => t.name);
  assert.ok(names('omran').includes('generate_image') && names('omran').includes('edit_image'));
  assert.ok(!names('someone').includes('generate_image') && !names('someone').includes('edit_image'));
  for (const t of toolsFor('omran').filter((x) => /_image$/.test(x.name))) assert.equal(Object.keys(t.input_schema.properties)[0], 'step_title');
  const gen = toolsFor('omran').find((t) => t.name === 'generate_image');
  assert.ok(gen.description.includes('__IMG_1__') && gen.description.includes('write_github'), 'الوصف يقول كيف تُرفع');
  assert.deepEqual(CLIENT_WAIT_MS, { generate_image: 150000, edit_image: 150000, save_image: 30000 }, 'مهلة chat.js نفسها — لا ٢٥ ثانية');
  const src = read('api/_lib/agent.js');
  assert.ok(src.includes('const waitMs = CLIENT_WAIT_MS[name] || 25000;'), 'run_js وtest_html على ٢٥ ثانية كما كانا');
});

test('٢. معيار النجاح في وضع الوكيل: يرسم ← رمز __IMG_1__ ← write_github بمسار heritage-omani.webp ← blob WebP في الشجرة ← طلب سحب', async () => {
  db.clear(); raw.clear();
  const ASK = 'ارسم صورة عماني بكمة وارفعها مكان ' + P;
  const r = await run(ASK, [
    toolTurn('generate_image', { step_title: 'رسم عماني بكمة', prompt: 'Omani man in white dishdasha and embroidered kummah, studio portrait' }),
    toolTurn('write_github', { repo: REPO, files: [{ path: P, image: '__IMG_1__' }], message: 'استبدال صورة عماني بكمة' }),
    textTurn('رفعت الصورة وفتحت الطلب.'),
  ]);
  const ct = r.events.find((e) => e.clientTool && e.clientTool.name === 'generate_image');
  assert.ok(ct, 'الرسم طُلب من المتصفّح');
  assert.equal(ct.clientTool.input.userText, ASK, 'كلمات المالك تصل أداة الرسم كما في المحادثة');
  assert.ok(r.events.some((e) => e.status === '🎨 الوكيل يرسم صورة…'));
  const cid = IS.contentId(PNG_B64);
  assert.equal(raw.get('db/img/' + cid).ttl, 86400, 'الرسمة محفوظة يومًا');
  assert.ok(toolResults(r.calls[1]).some((o) => o.includes('__IMG_1__') && o.includes('/i/' + cid + '.png')), 'الرمز والرابط وصلا النموذج');
  const blob = r.gh.find((c) => c.method === 'POST' && /\/git\/blobs$/.test(c.url));
  assert.ok(blob && blob.body.encoding === 'base64' && isWebp(blob.body.content), 'PNG صار WebP قبل الرفع');
  assert.ok(r.gh.find((c) => /\/git\/trees$/.test(c.url)).body.tree.some((e) => e.path === P && e.sha === 'imgblob'), 'الصورة في الشجرة بمسارها');
  const pr = r.gh.find((c) => c.method === 'POST' && /\/pulls$/.test(c.url));
  assert.ok(pr && pr.body.base === 'main' && /^omran-agent\//.test(pr.body.head), 'طلب سحب على فرع الوكيل');
  assert.ok(!r.gh.some((c) => c.method === 'PATCH'), 'لا دفع إلى main ولا دمج');
  const res = toolResults(r.calls[2]).find((o) => o.includes('رُفع'));
  assert.ok(res && res.startsWith('✅ رُفع') && res.includes('طلب السحب #88') && res.includes('png→webp'), res);
  const dones = r.events.filter((e) => e.act && e.act.k === 'done');
  assert.ok(dones.length === 2 && dones.every((d) => d.act.ok), 'الخطوتان ناجحتان في السجلّ');
  assert.ok(r.events.some((e) => typeof e.status === 'string' && e.status.startsWith('↳ رسمتُ صورة: «Omani man')), 'سطر الأثر بالعربيّة بلا اسم أداة');
});

test('٣. تشغيل لاحق: خريطة المحادثة (imgIds من app-09) تكفي للرفع، والرمز المجهول يُرفض قبل أيّ نداء لـGitHub', async () => {
  db.clear(); raw.clear();
  const s = await share({ data: PNG_B64, mime: 'image/png', purpose: 'agent' });
  let r = await run('ارفع الصورة اللي رسمتها مكان ' + P, [
    toolTurn('write_github', { repo: REPO, files: [{ path: P, image: '__IMG_1__' }], message: 'رفع الرسمة' }),
    textTurn('رفعت.'),
  ], { imgIds: { __IMG_1__: s.body.id } });
  assert.ok(toolResults(r.calls[1])[0].startsWith('✅ رُفع'), toolResults(r.calls[1])[0]);
  assert.ok(isWebp(r.gh.find((c) => /\/git\/blobs$/.test(c.url)).body.content));
  r = await run('ارفع الصورة الثانية', [
    toolTurn('edit_github', { repo: REPO, images: [{ path: P, image: '__IMG_2__' }], message: 'رفع' }),
    textTurn('ما رفعت.'),
  ], { imgIds: { __IMG_1__: s.body.id } });
  const err = toolResults(r.calls[1])[0];
  assert.ok(err.startsWith('✗ لم يُرفع شيء') && err.includes('__IMG_2__') && err.includes('لا صورة محفوظة له'), err);
  assert.equal(r.gh.filter((c) => c.method === 'POST').length, 0, 'لا كتابة في GitHub');
});

test('٤. العميل: وضع الوكيل يصفّر حالة الرسم لكلّ تشغيل كما يفعل app-18، ويرسل خريطة المحادثة، والحزمة مبنيّة', () => {
  const a9 = read('js/app-09-attach.js'), bundle = read('js/app.bundle.js');
  const fn = a9.slice(a9.indexOf('async function runOmranAgent('));
  const reset = "window.__genImages = {}; window.__chatVideoReference = null; window.__chatLastUserText = '';";
  assert.ok(fn.indexOf(reset) > 0 && fn.indexOf(reset) < fn.indexOf("fetch('/api/ai?action=agent'"), 'التصفير قبل الطلب');
  assert.ok(fn.includes('genImage: __genImg || undefined, imgIds: __imgIds }'));
  assert.ok(fn.includes('if(ev.clientTool && window.omranAgentTools)'), 'أدوات المتصفّح نفسها (app-17) تنفّذ الرسم');
  for (const s of [reset, 'imgIds: __imgIds']) assert.ok(bundle.includes(s), 'الحزمة: ' + s);
  assert.ok(read('js/app-18-chat-tools.js').includes('window.__genImages = {};'), 'المحادثة تصفّر في كلّ طلب — الوكيل صار مثلها');
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/agent-mode-img.test.cjs'));
});

test('٥. v-agent-img-size: الرسمة فوق ٢٫٥ م.ب تُعاد JPEG قبل الحفظ (حدّ المخزن ٣ م.ب)، وفشل الحفظ يُقال للنموذج بسببه لا بصمت', () => {
  const c = read('js/app-17-agent-tools.js'), bundle = read('js/app.bundle.js');
  const save = c.slice(c.indexOf('async function omranAgentSave('));
  assert.ok(save.indexOf("if (String(b64 || '').length > 2500000) { var sh = await omranAgentShrink(b64, mime);") < save.indexOf("fetch('/api/media?action=img'"), 'التصغير قبل الرفع');
  assert.ok(c.includes("c.toDataURL('image/jpeg', q)") && c.includes('while (d.length > 2500000 && q > 0.5)'));
  assert.ok(c.includes("window.__agentSaveWhy = 'HTTP ' + up.status"));
  assert.ok(c.includes('⚠️ لم تُحفظ بعد في مخزن التطبيق (') && c.includes('ارفعها برمزها كما هو') && c.includes('لا تُعِد رسمها.') && !c.includes('أعد رسمها.'), 'v-owner-paid-gate: الفشل لا يطلب رسمًا جديدًا');
  assert.ok(bundle.includes('function omranAgentShrink(b64, mime)'), 'الحزمة مبنيّة');
  assert.equal(require(rp('api/_lib/img-share.js')).AGENT_TTL_SEC, 86400);
});

test('٦. v-agent-img-keep: رمز رسمة لم تُحفظ ← الخادم يطلب من المتصفّح حفظها (save_image) فيُرفع بلا رسم جديد ولا رصيد، والمحادثة مثل الوكيل', async () => {
  db.clear(); raw.clear();
  const r = await run('ارفع الصورة اللي رسمتها مكان ' + P, [
    toolTurn('write_github', { repo: REPO, files: [{ path: P, image: '__IMG_3__' }], message: 'رفع' }),
    textTurn('رفعت.'),
  ]);
  assert.deepEqual(saves, ['__IMG_3__'], 'طُلب الحفظ مرّة للرمز نفسه');
  assert.ok(!r.events.some((e) => e.clientTool && e.clientTool.name === 'generate_image'), 'لا رسم جديد');
  assert.ok(toolResults(r.calls[1])[0].startsWith('✅ رُفع'), toolResults(r.calls[1])[0]);
  assert.ok(isWebp(r.gh.find((c) => /\/git\/blobs$/.test(c.url)).body.content));
  const ch = read('api/_lib/chat.js'), c17 = read('js/app-17-agent-tools.js');
  assert.ok(ch.includes("ensureSaved(input, __ownerOps.imgIds, (t) => runInClient(send, 'save_image', { token: t }, 30000)).then(() => require('./github-write.js').pushFiles("), 'المحادثة: كلّ المزوّدين');
  assert.ok(ch.includes(".then(() => require('./github-edit.js').editFiles("));
  assert.ok(c17.includes("if (name === 'save_image') {") && c17.includes('sms[si]._imgCache[stok]'), 'الرسمة من ذاكرة المتصفّح أو من رسالتها');
  assert.ok(c17.includes('if (u || again) return u;') && c17.includes('return sh ? omranAgentSave1(tok, sh.b64, sh.mime, chat)'), 'الحفظ الفاشل يُعاد مصغّرًا مرّة (v-img-run-bind: في محادثة التشغيل)');
  assert.ok(read('js/app.bundle.js').includes("if (name === 'save_image') {"));
});

test('٧. v-owner-self-drive: طريقة العمل المشتركة (المحادثة لكلّ المزوّدين والوكيل) — ارسم ثمّ ارفع مرّة، لا رسم لتشخيص، والفشل يجرّب طريقًا آخر', () => {
  const w = require(rp('api/_lib/github-edit.js')).WORK_NOTE;
  assert.ok(w.includes('ارسم المطلوب، ثمّ ارفعها كلّها في رفعة واحدة') && w.includes('لا تكمل طلبًا قديمًا من السجلّ') && w.includes('رسمة «لم تُحفظ» لا تُعاد رسمًا'));
  assert.ok(w.includes('لا تُعِد رسمًا ولا تشغيلًا مكلفًا لتعرف سبب عطل') && w.includes('جرّب الطريق الآخر بنفسك في الردّ نفسه'));
  assert.ok(read('api/_lib/agent.js').includes('const OWNER_ENGINEERING_NOTE = githubEdit.WORK_NOTE;'), 'الوكيل يقرؤها');
  assert.ok(read('api/_lib/chat.js').includes("require('./github-edit.js').WORK_NOTE"), 'والمحادثة لكلّ المزوّدين');
});

test('٨. v-owner-paid-gate في الوكيل: «كمّل» ← generate_image مرفوضة بلا رسم في المتصفّح (لا رصيد على طلب قديم)', async () => {
  db.clear(); raw.clear();
  const r = await run('كمّل', [toolTurn('generate_image', { prompt: 'warm lighting' }), textTurn('ما رسمت.')]);
  assert.ok(!r.events.some((e) => e.clientTool), 'لا نداء للمتصفّح');
  assert.ok(toolResults(r.calls[1])[0].startsWith('✗ لم يُنفَّذ: المالك لم يطلب رسمًا'));
});

test('٩. v-img-tok-unique: رموز رسمات المالك مستمرّة في المحادثة (لا __IMG_1__ في كلّ دور يطغى على رسمة سابقة)', () => {
  const c = read('js/app-17-agent-tools.js'), vm = require('node:vm');
  assert.ok(c.includes('var tok = omranNextTok(IMGS, CHAT());') && c.includes('var etok = omranNextTok(IMGS, CHAT());'), 'v-img-run-bind: عدّ محادثة التشغيل وخريطة صورها');
  const fn = c.slice(c.indexOf('  function omranNextTok(imgs, chat) {'), c.indexOf('  function omranAgentOwner() {'));
  const cur = { agentImgIds: { __IMG_3__: 'aaaaaaaaaaaa' } };
  const sb = { window: { __genImages: {} }, getCurrent: () => cur, omranAgentOwner: () => true, Number, Math, Object };
  vm.runInNewContext(fn + '; this.next = omranNextTok;', sb);
  assert.equal(sb.next(), '__IMG_4__', 'بعد آخر رمز محفوظ');
  sb.window.__genImages.__IMG_4__ = 'x';
  assert.equal(sb.next(), '__IMG_5__', 'الرسمة الثانية في الدور نفسه');
  sb.window.__genImages = {}; // طلب جديد (app-18 يصفّر)
  assert.equal(sb.next(), '__IMG_6__', 'الدور التالي يكمل العدّ لا يبدأ من ١');
  sb.omranAgentOwner = () => false; const sb2 = { window: { __genImages: {} }, getCurrent: () => cur, omranAgentOwner: () => false, Number, Math, Object };
  vm.runInNewContext(fn + '; this.next = omranNextTok;', sb2);
  assert.equal(sb2.next(), '__IMG_1__', 'غير المالك كما كان');
  assert.ok(read('js/app.bundle.js').includes('function omranNextTok(imgs, chat)'));
});
