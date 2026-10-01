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
const places = { list: [], calls: [] }; // v-loc-offers: بطاقات الأماكن قابلة للضبط لكلّ اختبار
stub('api/_lib/search.js', { fetchPlaces: async (key, q) => { places.calls.push(q); return places.list; }, isPlacesAsk: () => false, regionOf: () => '' });
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

async function ask(question, q, opts) {
  const o = opts || {};
  const log = { model: [], tavily: [], pplx: [] };
  const saved = global.fetch;
  let turn = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/openrouter\.ai/.test(u)) { log.model.push(JSON.parse(init.body)); return turn++ === 0 ? toolTurn(q) : textTurn('تم'); }
    if (/api\.perplexity\.ai/.test(u) && o.pplx) { const b = JSON.parse(init.body); log.pplx.push(b); return new Response(JSON.stringify(o.pplx(b)), { status: 200 }); }
    if (/api\.tavily\.com/.test(u)) {
      const b = JSON.parse(init.body); log.tavily.push(b);
      if (o.tavily) return new Response(JSON.stringify(o.tavily(b)), { status: 200 });
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

/* v-live-fresh (المالك: «نعم ضيفها… اريد المعلومات التواريخ الجديدة، ما اريد ابحث اليوم ويعطيني تاريخ قديم») */
const today = () => new Date().toISOString().slice(0, 10);
const posts = (n) => ({ results: Array.from({ length: n }, (_, i) => ({ url: 'https://www.reddit.com/r/gold/comments/' + (i + 1), title: 'Gold post ' + (i + 1), content: 'price talk', published_date: '2026-09-2' + i })) });

test('٣. الحداثة: سنة ذاكرة النموذج تُحذف، والويب والتواصل مقيّدان بآخر سنة، ومع النتيجة تاريخ اليوم', async () => {
  quota.calls.length = 0; quota.allow = true;
  const r = await ask('كم سعر الذهب في دبي؟', 'gold price Dubai 2024', {
    tavily: (b) => (b.include_domains ? posts(3) : { results: [{ url: 'https://www.goldprice.org/ae', title: 'Gold price UAE', content: '...', published_date: '2026-09-30' }] }),
  });
  const web = r.log.tavily.find((b) => !b.include_domains);
  const social = r.log.tavily.find((b) => b.include_domains);
  assert.equal(web.query, 'gold price Dubai', 'سنة لم يذكرها المستخدم تُحذف من استعلام الويب');
  assert.equal(social.query, 'gold price Dubai', 'ومن استعلام التواصل');
  assert.equal(web.time_range, 'year');
  assert.equal(social.time_range, 'year');
  assert.match(r.toolResult, /\[الحداثة — إلزاميّ\]: اليوم \d{4}-\d{2}-\d{2}، والبحث مقيّد بـآخر سنة/);
  assert.ok(r.toolResult.includes('اليوم ' + today()), 'تاريخ اليوم الفعليّ');
  assert.match(r.toolResult, /أحدث ما وجدته بتاريخ كذا/);
  // ثلاثة منشورات من منصّة واحدة تبقى ثلاثة (فرز التكرار كان يطويها في أوّلها) — وكلّ منشور بتاريخه
  for (const i of [1, 2, 3]) assert.match(r.toolResult, new RegExp('\\[Reddit\\] Gold post ' + i + ' \\(2026-09-2' + (i - 1) + '\\)'));
});

test('٤. سؤال عن الماضي: السنة التي ذكرها المستخدم تبقى، وبلا قيد زمنيّ', async () => {
  quota.calls.length = 0; quota.allow = true;
  const r = await ask('من فاز بكأس العالم ٢٠٢٢؟', 'World Cup 2022 winner');
  const web = r.log.tavily.find((b) => !b.include_domains);
  const social = r.log.tavily.find((b) => b.include_domains);
  assert.equal(web.query, 'World Cup 2022 winner');
  assert.equal(web.time_range, undefined);
  assert.equal(social.time_range, undefined);
  assert.match(r.toolResult, /\[التاريخ\]: اليوم \d{4}-\d{2}-\d{2}\. اذكر تاريخ كلّ معلومة/);
  assert.ok(!/\[الحداثة/.test(r.toolResult));
});

test('٥. المسار المخصّص (الأرقام): القائمة كما هي حرفيًّا، ثمّ قسم التواصل بعدها بأمر عرضه', async () => {
  quota.calls.length = 0; quota.allow = true;
  const r = await ask('ابي رقم سيارة مميز', 'ارقام سيارات مميزة للبيع دبي');
  assert.equal(r.log.tavily.length, 1, 'نداء التواصل وحده — قائمة الأرقام ثابتة بلا بحث ويب');
  assert.ok(r.log.tavily[0].include_domains);
  assert.ok(r.toolResult.startsWith('1. إكس بليت'), 'القائمة أوّلًا وبلا عنوان «من الويب»');
  assert.match(r.toolResult, /اعرض هذه الروابط السبعة كلّها بالترتيب/, 'أمر القائمة الأصليّ باقٍ');
  const i = r.toolResult.indexOf('📱 من التواصل الاجتماعي (منشورات عامّة):');
  assert.ok(i > r.toolResult.indexOf('mourjan.com'), 'التواصل بعد القائمة');
  assert.match(r.toolResult, /اعرض القائمة أعلاه أوّلًا كما أُمرت بحرفها وتنسيقها/);
  assert.match(r.toolResult, /تخصّ القائمة أعلاه ولا تمنع هذا القسم/);
  assert.match(r.toolResult, /ألّا يُدفع مال لصاحب منشور قبل التحقّق/);
  assert.ok(!/🌐 من الويب|\[الحداثة/.test(r.toolResult));
});

test('٦. Perplexity: نافذة سنة وتاريخ اليوم في تعليمته، وتاريخ كلّ مصدر بجانبه', async () => {
  quota.calls.length = 0; quota.allow = true;
  process.env.PERPLEXITY_API_KEY = 'test-pplx';
  try {
    const r = await ask('كم دقة قلب النملة؟', 'ant heart rate', {
      pplx: () => ({ choices: [{ message: { content: 'ant heart pulses slowly' } }], search_results: [{ url: 'https://www.nature.com/x', title: 'Insect hearts', date: '2026-03-04' }] }),
    });
    const web = r.log.pplx.find((b) => b.model === 'sonar-pro');
    assert.equal(web.search_recency_filter, 'year');
    assert.ok(web.messages[0].content.includes('اليوم ' + today()), 'تاريخ اليوم في تعليمة محرّك البحث');
    assert.match(r.toolResult, /Insect hearts \(2026-03-04\)\nhttps:\/\/www\.nature\.com\/x/);
  } finally { delete process.env.PERPLEXITY_API_KEY; }
});

/* v-loc-offers (لقطتا المالك ١ أكتوبر: «اريد عروضات في عجمان» رجعت أسماء سوبرماركتات بلا أيّ عرض، و«دي تو دي عجمان —
   عطني الموقع» رجعت فارغة) — الخادم: العروض تبحث في العروض لا في الخرائط، وطلب الموقع يأخذ العنوان ورابط الخريطة. */
const SHOPS = [{ name: 'نستو هايبرماركت', address: 'Al Mushairef, Ajman', url: 'https://maps.google.com/?cid=11' }, { name: 'D2D Ajman', address: 'Al Nuaimiya 1, Ajman', url: 'https://maps.google.com/?cid=42' }];

test('٧. العروض: لا بطاقات أماكن، بل بحث العروض بقيد البلد ونافذة شهر وروابط العروض', async () => {
  quota.calls.length = 0; quota.allow = true; places.list = SHOPS; places.calls.length = 0;
  const r = await ask('اريد عروضات في عجمان', 'عروضات سوبرماركت عجمان', {
    tavily: (b) => (b.include_domains ? posts(1) : { results: [{ url: 'https://www.offers.ae/ajman/nesto', title: 'Nesto Ajman weekly offers', content: '50% off', published_date: '2026-09-29' }] }),
  });
  places.list = [];
  assert.equal(places.calls.length, 0, 'سؤال العروض لا يُختصر في بطاقات الخرائط');
  const web = r.log.tavily.find((b) => !b.include_domains);
  assert.ok(web, 'بحث عروض فعليّ');
  assert.equal(web.country, 'united arab emirates');
  assert.equal(web.time_range, 'month');
  assert.match(web.query, /^deals discounts offers /);
  assert.match(r.toolResult, /offers\.ae\/ajman\/nesto/);
  assert.ok(!/اكتب الأسماء فقط/.test(r.toolResult));
});

test('٨. طلب الموقع: العنوان ورابط الخريطة لكلّ مكان (لا «الأسماء فقط»)، والرابطان يبقيان', async () => {
  quota.calls.length = 0; quota.allow = true; places.list = SHOPS; places.calls.length = 0;
  const r = await ask('دي تو دي عجمان\n\n\nعطني الموقع', 'D2D Ajman');
  places.list = [];
  assert.equal(places.calls.length, 1);
  assert.match(r.toolResult, /D2D Ajman — Al Nuaimiya 1, Ajman\nhttps:\/\/maps\.google\.com\/\?cid=42/);
  assert.match(r.toolResult, /https:\/\/maps\.google\.com\/\?cid=11/, 'فرز التكرار بالنطاق لا يُسقط المكان الثاني');
  assert.match(r.toolResult, /\[📍 الموقع على الخريطة\]\(الرابط\)/);
  assert.ok(!/اكتب الأسماء فقط/.test(r.toolResult));
});

test('٩. قائمة أماكن بلا طلب موقع: الأسماء فقط كما قرّر المالك', async () => {
  quota.calls.length = 0; quota.allow = true; places.list = SHOPS; places.calls.length = 0;
  const r = await ask('هايبرماركتات في عجمان', 'هايبرماركت عجمان');
  places.list = [];
  assert.match(r.toolResult, /^1\. نستو هايبرماركت\n2\. D2D Ajman\n\n\[إلزاميّ في عرض هذه الأماكن\]: اختر/);
  assert.ok(!/maps\.google\.com|Al Nuaimiya/.test(r.toolResult), 'لا عنوان ولا رابط خريطة في القائمة');
});

test('١٠. «عروس» ليست «عروض»: فساتين العروس تبقى بطاقات أماكن', async () => {
  quota.calls.length = 0; quota.allow = true; places.list = SHOPS; places.calls.length = 0;
  const r = await ask('فساتين عروس في عجمان', 'فساتين عروس عجمان');
  places.list = [];
  assert.equal(places.calls.length, 1);
  assert.ok(!r.log.tavily.some((b) => !b.include_domains && /^deals/.test(b.query)), 'لا بحث عروض');
});
