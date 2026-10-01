// tests/live-social-e2e.test.cjs — v-live-social من الطرف إلى الطرف: معالج المحادثة الحقيقيّ، ونموذج مزيّف يطلب
// web_search، ومزوّدو بحث مزيّفون. يثبت ما لا تثبته الوحدة وحدها: أنّ ما يصل النموذج في tool_result هو الويب والتواصل
// معًا بقسمين، وأنّ السقف يُعدّ مرّة لكلّ نداء بحث بمفتاح المشترك، وأنّ نفاده يرجع نصًّا صادقًا بلا أيّ نداء بحث.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'live-social-e2e-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.TAVILY_API_KEY = 'test-tavily';
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'PERPLEXITY_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX', 'GOOGLE_PLACES_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null),
  kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {},
});
const quota = { calls: [], allow: true };
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async () => ({ allowed: true, username: 'sub-user' }),
  checkAndConsumeCustom: async (token, guestId, ip, bucket, limit) => {
    quota.calls.push({ bucket, limit, hasToken: !!token });
    return quota.allow ? { allowed: true, username: 'sub-user', remaining: limit - quota.calls.length } : { allowed: false, reason: 'limit' };
  },
});
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const toolTurn = (q) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name: 'web_search', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ query: q }) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 1 } },
]);
const textTurn = (t) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);

async function ask(question, q) {
  const log = { model: [], tavily: [] };
  const saved = global.fetch;
  let turn = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/openrouter\.ai/.test(u)) { log.model.push(JSON.parse(init.body)); return turn++ === 0 ? toolTurn(q) : textTurn('تم'); }
    if (/api\.tavily\.com/.test(u)) {
      const b = JSON.parse(init.body); log.tavily.push(b);
      return new Response(JSON.stringify(b.include_domains
        ? { results: [{ url: 'https://www.reddit.com/r/ants/comments/1', title: 'Do ants have hearts?', content: 'Yes, a dorsal vessel that pulses slowly.' }] }
        : { results: [{ url: 'https://www.britannica.com/animal/ant', title: 'Ant | Britannica', content: 'Ants have an open circulatory system.' }] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  let written = '';
  const req = { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: question }], token: token('sub-user'), provider: 'deepseek' } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {} };
  try { await chat(req, res); } finally { global.fetch = saved; }
  const second = log.model[1];
  const tr = second && second.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((c) => c && c.type === 'tool_result');
  return { log, written, toolResult: tr ? String(tr.content) : '' };
}

test('١. سؤال معرفة عامّة: النموذج يستلم الويب والتواصل معًا بقسمين، والسقف يُعدّ مرّة واحدة', async () => {
  quota.calls.length = 0; quota.allow = true;
  const r = await ask('كم دقة قلب النملة؟', 'ant heart rate');
  assert.equal(r.log.model.length, 2, 'نداء للأداة ثمّ ردّ');
  assert.ok(r.log.model[0].tools && r.log.model[0].tools.some((t) => t.name === 'web_search'), 'المشترك عنده الأداة');
  const desc = r.log.model[0].tools.find((t) => t.name === 'web_search').description;
  assert.match(desc, /التواصل الاجتماعي معًا/);
  const social = r.log.tavily.filter((b) => b.include_domains);
  const web = r.log.tavily.filter((b) => !b.include_domains);
  assert.equal(social.length, 1, 'بحث تواصل واحد');
  assert.ok(web.length >= 1, 'بحث ويب');
  assert.match(r.toolResult, /🌐 من الويب:/);
  assert.match(r.toolResult, /britannica\.com/);
  assert.match(r.toolResult, /📱 من التواصل الاجتماعي \(منشورات عامّة\):/);
  assert.match(r.toolResult, /\[Reddit\] Do ants have hearts\?/);
  assert.match(r.toolResult, /تجارب وآراء أفراد لا حقائق موثّقة/);
  assert.deepEqual(quota.calls, [{ bucket: 'chat-search', limit: 100, hasToken: true }]);
  assert.match(r.written, /"delta":"تم"/);
  // بطاقات المصادر للعميل تشمل رابط المنصّة
  assert.match(r.written, /reddit\.com/);
  // قاعدة البحث في نظام المشترك
  const sys = JSON.stringify(r.log.model[0].system || '');
  assert.match(sys, /\[البحث\]: لأيّ سؤال يطلب معلومة أو حقيقة/);
});

test('٢. نفاد السقف: نصّ صادق للنموذج، وصفر نداء بحث', async () => {
  quota.calls.length = 0; quota.allow = false;
  const r = await ask('كم دقة قلب النملة؟', 'ant heart rate');
  assert.equal(r.log.tavily.length, 0, 'لا نداء بحث بعد نفاد الحدّ');
  assert.match(r.toolResult, /انتهى حدّ البحث الحيّ اليوميّ لهذا الحساب \(100 بحث\)/);
  assert.match(r.toolResult, /بلا بحث حيّ/);
  quota.allow = true;
});
