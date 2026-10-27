// tests/chat-owner-maxtokens.test.cjs — v-claude-code-level C2 (المالك: «ولا يبني… ما يعطيني شي»):
// stop_reason=max_tokens كان يُعامل نهايةً عاديّة — البناء الطويل واستدعاء write_github يُقطعان بصمت، وتنبيه «نفّذ الآن»
// (owner-carry) قد يعيد خطّة مقطوعة. الآن للمالك: إكمال من آخر حرف حتّى مرّتين داخل الوقت (قبل فحص owner-carry)، واستدعاء أداة
// مقطوع لا يُنفَّذ أبدًا بل يُطلب تقسيمه، وبعد المرّتين سطر «انقطع لطوله — اكتب: كمل» تحت النصّ. يشغّل chat.js الحقيقيّ بـfetch مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'chat-owner-maxtokens-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS', 'CHAT_STALL_FIRST_MS', 'CHAT_STALL_IDLE_MS']) delete process.env[k];

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
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }),
});
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const pushes = [];
require(rp('api/_lib/github-write.js')).pushFiles = async (input) => { pushes.push(input); return { ok: true, url: 'https://github.com/x/y/pull/1' }; };
require(rp('api/_lib/github-read.js')).readGithub = async () => 'FILE x\n1| //';
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const { CARRY_NOTE } = require(rp('api/_lib/owner-carry.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sseResp = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'claude-x', usage: { input_tokens: 10, output_tokens: 0 } } });
const textTurn = (text, reason) => sseResp([start(), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: reason || 'end_turn' }, usage: { output_tokens: 5 } }]);
// نصّ ثمّ write_github بـJSON مقطوع في منتصفه، والبثّ ينتهي بـmax_tokens (كما يقطعه المزوّد)
const cutWrite = (pre) => {
  const json = JSON.stringify({ repo: 'OMRAN77/omran-ai-builder', files: [{ path: 'game.html', content: '<!DOCTYPE html><html><body>' + 'x'.repeat(400) + '</body></html>' }] });
  return sseResp([start(), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: pre } }, { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_cut', name: 'write_github', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: json.slice(0, Math.floor(json.length / 2)) } },
    { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 16000 } }]);
};
const isAnth = (u) => /api\.anthropic\.com/.test(u);
const isUp = (u) => isAnth(u) || /openrouter\.ai\/api\/v1\/messages/.test(u);
const texts = (m) => (Array.isArray(m.content) ? m.content.filter((x) => x.type === 'text').map((x) => x.text).join('\n') : String(m.content));

async function run(user, body, route) {
  usageUser = user; pushes.length = 0;
  const calls = [], out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: String(url), body: b });
    return route(String(url), b, calls.filter((c) => isUp(c.url)).length);
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user) }, body) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const raw = out.join('');
  const events = raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls: calls.filter((c) => isUp(c.url)), events, raw, text: events.map((e) => e.delta || '').join('') };
}
const app18 = fs.readFileSync(path.join(root, 'js/app-18-chat-tools.js'), 'utf8');
const app18Core = app18.slice(0, app18.indexOf('// v478:'));
async function client(raw) {
  const ctx = { window: { authGet: () => 'tok', claudeModelGet: () => '' }, fetch: async () => new Response(raw, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    TextDecoder, setTimeout, clearTimeout, Promise, Error, String, JSON, Date, Array, Math, console, Intl, Object, Number, RegExp };
  vm.runInNewContext(app18Core, ctx);
  try { const out = await ctx.window.callChatWithTools([{ role: 'user', content: 'x' }], null, 'claude'); return { reply: out.reply, fenceCut: out.fenceCut }; }
  catch (e) { return { error: e.message, ownerStop: !!e.ownerStop }; }
}
const BUILD = [{ role: 'user', content: 'اكتب لي صفحة لعبة ثعبان كاملة' }];

test('١. max_tokens ← النداء الثاني يحمل الجزء المقطوع ثمّ «أكمل من آخر حرف بلا تكرار»، والنصّ موصول', async () => {
  const r = await run('omran', { provider: 'claude', messages: BUILD }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 })
    : n === 1 ? textTurn('الجزء الأوّل من الصفحة ', 'max_tokens') : textTurn('والجزء الثاني.')));
  assert.equal(r.calls.length, 2, 'نداء إكمال واحد');
  const msgs = r.calls[1].body.messages;
  assert.equal(msgs[msgs.length - 2].role, 'assistant');
  assert.equal(texts(msgs[msgs.length - 2]), 'الجزء الأوّل من الصفحة ');
  assert.match(texts(msgs[msgs.length - 1]), /أكمل من آخر حرف بلا تكرار/);
  assert.equal(r.text, 'الجزء الأوّل من الصفحة والجزء الثاني.');
  assert.ok(!r.events.some((e) => e.ownerStop), 'اكتمل — لا سطر قطع');
  assert.equal((await client(r.raw)).reply, 'الجزء الأوّل من الصفحة والجزء الثاني.');
});

test('٢. write_github مقطوع لطوله لا يُنفَّذ، ويُطلب تقسيمه في النداء التالي', async () => {
  const r = await run('omran', { provider: 'claude', messages: [{ role: 'user', content: 'ارفع لعبة الثعبان إلى مستودعي في ملفّ game.html' }] },
    (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 }) : n === 1 ? cutWrite('سأرفع الملف الآن:') : textTurn('قسّمت الملفّ وسأرفعه برقع.')));
  assert.equal(pushes.length, 0, 'لا رفع من استدعاء مقطوع');
  assert.ok(r.calls.length >= 2, 'نداء القطع ثمّ طلب التقسيم');
  const msgs = r.calls[1].body.messages;
  assert.ok(!JSON.stringify(msgs).includes('tu_cut'), 'الاستدعاء المقطوع لا يدخل التاريخ (لا tool_use بلا نتيجة)');
  assert.match(texts(msgs[msgs.length - 1]), /انقطع استدعاء الأداة لطوله/);
  assert.match(texts(msgs[msgs.length - 1]), /edit_github/);
});

test('٣. الإكمال يسبق owner-carry: خطّة مقطوعة لطولها تُكمَل أوّلًا ثمّ تُحمَل إن توقّفت بلا تنفيذ', async () => {
  const r = await run('omran', { provider: 'claude', messages: [{ role: 'user', content: 'احذف قائمة المشاريع من الواجهة' }] },
    (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 }) : n === 1 ? textTurn('سأقرأ الملفّ أوّلًا ثمّ أحذف العنصر وأتتبّع مراجعه', 'max_tokens') : textTurn(' — تمّ التحديد.')));
  assert.ok(r.calls.length >= 2, 'إكمال القطع أولًا');
  const lastText = texts(r.calls[1].body.messages[r.calls[1].body.messages.length - 1]);
  assert.match(lastText, /أكمل من آخر حرف/);
  assert.ok(!lastText.includes(CARRY_NOTE), 'الإكمال أوّلًا ليس تنبيه owner-carry');
  assert.equal(r.calls.length, 3, 'بعد اكتمال القطع: وصف بلا تنفيذ يُحمَل (v-prov-finish-edit)');
  assert.ok(JSON.stringify(r.calls[2].body.messages).includes(CARRY_NOTE.slice(0, 60)), 'ثمّ نفّذ الآن');
  assert.ok(r.events.some((e) => e.k === 'stCarry'), 'ينفّذ بعد الإكمال لا أثناءه');
});

test('٤. حدّ الإكمال مرّتان ← سطر «انقطع لطوله — اكتب: كمل» تحت النصّ عند المالك', async () => {
  const r = await run('omran', { provider: 'claude', messages: BUILD }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 }) : textTurn('مقطع' + n + ' ', 'max_tokens')));
  assert.equal(r.calls.length, 3, 'الأصل + إكمالان');
  const stop = r.events.find((e) => e.ownerStop);
  assert.ok(stop && stop.error === 'انقطع لطوله — اكتب: كمل', JSON.stringify(stop));
  assert.ok(r.events.some((e) => e.done), 'نهاية عاديّة بعد السطر');
  assert.equal((await client(r.raw)).reply, 'مقطع1 مقطع2 مقطع3 \n\n⚠️ انقطع لطوله — اكتب: كمل');
});

test('٥. غير المالك كما كان: max_tokens نهاية بلا إكمال ولا سطر', async () => {
  const r = await run('vipuser', { provider: 'claude', messages: BUILD }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 }) : textTurn('جزء ', 'max_tokens')));
  assert.equal(r.calls.length, 1);
  assert.ok(!r.events.some((e) => e.ownerStop));
  assert.equal(r.text, 'جزء ');
});

test('٦. قطع داخل كتلة كود ← السياج يُغلَق قبل سطر السبب فلا يدخل الكود المستخرَج، وfenceCut للمستدعي', async () => {
  const r = await run('omran', { provider: 'claude', messages: BUILD }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 })
    : n === 1 ? textTurn('هذه الصفحة:\n```html\n<!DOCTYPE html><html><body>', 'max_tokens') : textTurn('<div id="g' + n + '"></div>', 'max_tokens')));
  assert.equal(r.calls.length, 3);
  const c = await client(r.raw);
  assert.equal(c.reply, 'هذه الصفحة:\n```html\n<!DOCTYPE html><html><body><div id="g2"></div><div id="g3"></div>\n```\n\n⚠️ انقطع لطوله — اكتب: كمل');
  assert.equal(c.fenceCut, true, 'المستدعي يعرف أنّ الكود مقطوع');
  const m = c.reply.match(/```(\w*)\s*\n?([\s\S]*?)```/); // نمط extractReplyRaw (app-06) للسياج المغلق
  assert.ok(m && !m[2].includes('⚠️') && !m[2].includes('كمل'), 'السبب خارج الكود');
  const plain = await run('omran', { provider: 'claude', messages: BUILD }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 }) : textTurn('نصّ' + n + ' ', 'max_tokens')));
  assert.equal((await client(plain.raw)).fenceCut, undefined, 'بلا سياج مفتوح لا علامة');
});
