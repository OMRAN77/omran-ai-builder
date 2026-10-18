'use strict';
// tests/call-agent-paid-chat.test.cjs — v-call-agent-paid
// العرض: المالك ١٨ أكتوبر: «الاتصال الالي مايشتغل لي المستخدمين» — propose_call كان في أدوات المالك وحده، فالمشترك لا يرى الكرت أصلًا.
// القرار: الأداة لصاحب باقة سارية (tier 'sub') آخر القائمة، والكرت يُحفظ باسمه ليقبله المعالج.
// الاختبار (PITFALLS: «إصلاح للمالك وحده يترك المشترك على العطل»): دور كامل لمشترك Pro في المعالج الحقيقيّ api/_lib/chat.js على
// مساره الفعليّ (Gemini المباشر) بمزوّد مزيّف — الأداة في الطلب، والنداء يُنفَّذ، والكرت يصل، والاقتراح في KV باسم المشترك.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
process.env.AUTH_SECRET = 'call-agent-paid-chat-test';
for (const k of ['MISTRAL_API_KEY', 'CHAT_CLAUDE_MODEL', 'TAVILY_API_KEY', 'BRAVE_API_KEY', 'SERPER_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'GOOGLE_PLACES_API_KEY']) delete process.env[k];
Object.assign(process.env, { OPENROUTER_API_KEY: 'or-test', ANTHROPIC_API_KEY: 'ant-test', GROQ_API_KEY: 'gq-test', OPENAI_API_KEY: 'oa-test', GEMINI_API_KEY: 'gm-test' });
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const store = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async (k) => { store.delete(k); }, kvExpire: async () => {},
  kvSetIfAbsent: async () => false, kvGetRaw: async (k) => (store.has(k) ? store.get(k) : null), kvSetRaw: async (k, v) => { store.set(k, String(v)); },
});
const who = { name: 'pro-user', tier: 'sub' };
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async () => ({ allowed: true, username: who.name, subscriber: true, tier: who.tier }),
  todayCount: async () => 0, bumpCount: async () => {}, takeMeter: async () => true, giveMeter: async () => {},
});
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });
const tierLib = require(rp('api/_lib/tier.js'));
const chat = require(rp('api/_lib/chat.js'));

function token(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); }
const sse = (lines) => new Response(lines.map((l) => 'data: ' + (typeof l === 'string' ? l : JSON.stringify(l)) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const lane = (u) => /generativelanguage/.test(u) ? 'gemini' : /api\.openai\.com/.test(u) ? 'openai' : /api\.anthropic\.com/.test(u) ? 'claude' : /openrouter\.ai/.test(u) ? 'or' : 'other';
const gemCall = (name, args) => sse([{ choices: [{ delta: { role: 'assistant', tool_calls: [{ id: 'function-call-1', type: 'function', function: { name, arguments: JSON.stringify(args) }, extra_content: { google: { thought_signature: 'SIG-A' } } }] }, finish_reason: 'tool_calls', index: 0 }], model: 'gemini-3.8-flash' }, '[DONE]']);
const gemText = (t) => sse([{ choices: [{ delta: { role: 'assistant', content: t }, index: 0 }], model: 'gemini-3.8-flash' }, { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] }, '[DONE]']);

async function turn(tier, text) {
  const calls = []; const prev = global.fetch; const realTier = tierLib.resolveTier;
  global.fetch = async (url, init) => {
    const p = lane(String(url));
    let body = null; try { body = JSON.parse(init.body); } catch (e) { body = null; }
    calls.push({ p, body });
    if (p !== 'gemini') return new Response('{}', { status: 404 });
    const n = calls.filter((c) => c.p === 'gemini').length;
    return n === 1 ? gemCall('propose_call', { business: 'عيادة ابتسامة', goal: 'حجز تنظيف الأحد بعد العصر', phone: '0501234567' }) : gemText('جهّزت الكرت ولم أتّصل بأحد بعد.');
  };
  tierLib.resolveTier = async () => tier;
  let out = '';
  const res = { headersSent: false, writableEnded: false, setHeader() {}, status() { return this; }, flushHeaders() {}, json(v) { out += 'JSON ' + JSON.stringify(v); }, write(c) { out += String(c || ''); return true; }, end() { this.writableEnded = true; }, on() {}, once() {}, removeListener() {} };
  const ce = console.error; const cw = console.warn; console.error = () => {}; console.warn = () => {};
  try { await chat({ method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: text }], token: token(who.name), provider: 'claude', tz: 'Asia/Dubai' } }, res); }
  finally { global.fetch = prev; tierLib.resolveTier = realTier; console.error = ce; console.warn = cw; }
  const events = out.split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  const toolNames = (c) => ((c && c.body && c.body.tools) || []).map((t) => (t.function ? t.function.name : t.name));
  return { calls, events, firstTools: toolNames(calls.find((c) => c.p === 'gemini')) };
}

test('١. مشترك Pro: propose_call في أدوات طلبه، والنداء يُنفَّذ، والكرت يصل بالسعر، والاقتراح محفوظ باسمه', async () => {
  store.clear(); who.name = 'pro-user'; who.tier = 'sub';
  const r = await turn({ tier: 'sub', plan: 'pro', cap: 100, subscriber: true }, 'اتصل على عيادة ابتسامة 0501234567 واحجز لي تنظيف الأحد بعد العصر');
  assert.ok(r.firstTools.includes('propose_call'), 'الأداة وصلت مزوّد الباقة: ' + r.firstTools.join(','));
  assert.equal(r.firstTools[r.firstTools.length - 1], 'propose_call', 'آخر القائمة');
  const ev = r.events.find((e) => e.cards && e.cards.kind === 'call');
  assert.ok(ev, 'وصل كرت الاتّصال');
  assert.equal(ev.cards.call.ptsPerMin, 45); assert.equal(ev.cards.call.phoneReady, true);
  assert.equal(ev.cards.call.phoneMasked.includes('1234567'), false, 'الرقم كاملًا لا يصل العميل');
  const props = [...store.entries()].filter(([k]) => k.startsWith('call/prop/'));
  assert.equal(props.length, 1);
  assert.equal(JSON.parse(props[0][1]).owner, 'pro-user', 'باسم المشترك — المعالج يقبله');
});

test('٢. VIP بلا باقة: لا أداة propose_call في طلبه (القائمة ثابتة لكلّ فئة)', async () => {
  store.clear(); who.name = 'vip-user'; who.tier = 'vip';
  const r = await turn({ tier: 'vip', plan: null, subscriber: true }, 'اتصل على عيادة ابتسامة واحجز لي');
  assert.ok(r.calls.length > 0);
  for (const c of r.calls.filter((x) => x.body && Array.isArray(x.body.tools))) {
    assert.equal(((c.body.tools || []).map((t) => (t.function ? t.function.name : t.name))).includes('propose_call'), false);
  }
  assert.equal([...store.keys()].some((k) => k.startsWith('call/prop/')), false);
});
