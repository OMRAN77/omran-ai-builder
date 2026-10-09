'use strict';
/* v-special-tokens + v-cohere-reasoning (لقطة المالك ٤ أكتوبر ٩:٤٣): ردّ Cohere Command A بدأ بـ«<EOS_TOKEN>» حرفيًّا ثمّ تفكير بصيغة الغائب
   («يبدو أن المستخدم يطلب… دعنا نطلب توضيحًا.») ملتصقًا بالجواب. (١) الرموز الخاصّة تُحذف أثناء البثّ ولو انقسمت بين دلتا، بلا مسّ
   لوسوم HTML ومقارنات «<». (٢) Cohere (موديل تفكير) لا يُرسَل له إطفاء التفكير الذي يُخرجه نصًّا؛ والبقيّة كما كانوا. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'special-tokens-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'COHERE_API_KEY', 'DEEPSEEK_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
const db = new Map();
stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvSetIfAbsent: async () => true });
let who = 'omran';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: who }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });
const { makeTokenStripper, stripSpecialTokens } = require(rp('api/_lib/_special-tokens.js'));
const chat = require(rp('api/_lib/chat.js'));

const run = (chunks) => { const s = makeTokenStripper(); let o = ''; for (const c of chunks) o += s.push(c); return o + s.flush(); };

test('١. المُرشِّح: الرموز الخاصّة تُحذف ولو انقسمت بين دلتا، وما سواها يمرّ كما هو', () => {
  assert.equal(run(['<EOS_TOKEN>يبدو أن المستخدم']), 'يبدو أن المستخدم');
  assert.equal(run(['<EOS_', 'TOKEN>مرحبا ', '<|END_OF_TURN_TOKEN|>']), 'مرحبا ');
  assert.equal(run(['<|im', '_start|>نصّ', '<BOS_TOKEN>']), 'نصّ');
  assert.equal(run(['<E', 'O', 'S_TOKEN', '>ردّ']), 'ردّ', 'حرفًا حرفًا');
  assert.equal(stripSpecialTokens('أ<EOS_TOKEN>ب<|CHATBOT_TOKEN|>ج'), 'أبج');
  // لا مسّ لوسوم HTML ولا للمقارنات ولا <s>
  assert.equal(run(['<s>شطب</s> <div class="a">', 'x</div>']), '<s>شطب</s> <div class="a">x</div>');
  assert.equal(run(['إذا كان a < b', ' فإنّ c <= d']), 'إذا كان a < b فإنّ c <= d');
  assert.equal(run(['if (a <', 'b) {}']), 'if (a <b) {}');
  assert.equal(run(['<b>', 'غامق</b>']), '<b>غامق</b>');
  // ذيل محجوز لم يكتمل رمزًا يُعرض عند النهاية لا يضيع
  assert.equal(run(['النتيجة <EOS_TO']), 'النتيجة <EOS_TO');
  assert.equal(run(['س <']), 'س <');
  assert.equal(run([]), '');
});

// ── المعالج الحقيقيّ بوسيط مزيّف ───────────────────────────────────────────────────────────────
const token = (u) => {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
};
const stream = (texts) => new Response([{ type: 'message_start', message: { model: 'cohere/command-a-plus', usage: { input_tokens: 1, output_tokens: 0 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'text' } }]
  .concat(texts.map((t) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })))
  .concat([{ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }])
  .map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

async function turn(user, provider, text, deltas) {
  who = user;
  const sent = [];
  let upstream = null;
  const save = global.fetch;
  global.fetch = async (url, o) => { if (/openrouter\.ai/.test(String(url))) { upstream = JSON.parse(o.body); return stream(deltas); } return new Response('{}', { status: 404 }); };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write(c) { sent.push(String(c)); }, end() {}, flush() {} };
  try { await chat({ method: 'POST', body: { messages: [{ role: 'user', content: text }], provider, token: token(user) }, headers: {} }, res); } finally { global.fetch = save; }
  const events = sent.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { upstream, events, text: events.filter((e) => e.delta).map((e) => e.delta).join(''), patches: events.filter((e) => e.patch) };
}

test('٢. chat.js: ردّ يبدأ بـ«<EOS_TOKEN>» (ولو انقسم) يصل العميل بلا الرمز، ولا تصحيح ختاميّ يومض به', async () => {
  const r = await turn('omran', 'cohere', 'الوكيل شوف شو ملكته', ['<EOS_', 'TOKEN>يبدو أن المستخدم يطلب', ' توضيحًا<|END_OF_TURN_TOKEN|>']);
  assert.equal(r.text, 'يبدو أن المستخدم يطلب توضيحًا');
  assert.ok(!/EOS_TOKEN|END_OF_TURN/.test(JSON.stringify(r.events)), 'لا رمز في أيّ حدث');
  assert.equal(r.patches.length, 0);
  // كلّ المزوّدين (لا Cohere وحده)، وغير المالك أيضًا
  const other = await turn('sara', 'claude', 'اشرح لي TCP بجملة', ['<EOS_TOKEN>TCP يضمن الوصول.']);
  assert.equal(other.text, 'TCP يضمن الوصول.');
  // وما فيه وسوم/مقارنات يمرّ حرفيًّا
  const code = await turn('sara', 'claude', 'اكتب وسم غامق', ['استعمل <b>غامق</b> و', 'a < b']);
  assert.equal(code.text, 'استعمل <b>غامق</b> وa < b');
});

test('٣. Cohere (موديل تفكير) لا يُرسَل له إطفاء التفكير؛ والمزوّدون الآخرون على الوسيط كما كانوا', async () => {
  const c = await turn('omran', 'cohere', 'الوكيل شوف شو ملكته', ['تمام']);
  assert.ok(c.upstream, 'وصل الطلب إلى الوسيط');
  assert.ok(/cohere/.test(c.upstream.model), c.upstream.model);
  assert.ok(!('thinking' in c.upstream) && !('reasoning' in c.upstream), 'لا حقول إطفاء: ' + JSON.stringify(Object.keys(c.upstream)));
  const d = await turn('omran', 'deepseek', 'شكرًا', ['تمام']); // v-owner-think-all: سؤال المالك يفكّر؛ المجاملة وحدها بحقول الإطفاء
  assert.ok(d.upstream && d.upstream.thinking && d.upstream.thinking.type === 'disabled', 'DeepSeek كما كان: ' + JSON.stringify(Object.keys(d.upstream || {})));
  assert.equal(d.upstream.reasoning && d.upstream.reasoning.enabled, false);
});

test('٤. الأسلاك: المُرشِّح في دلتا النصّ، والتفريغ بعد البثّ، والتصحيح الختاميّ، واستثناء Cohere في __quickFor', () => {
  const s = read('api/_lib/chat.js');
  assert.match(s, /const __td = __tokStrip\.push\(ev\.delta\.text\); if \(__td\) \{/);
  assert.match(s, /const __rest = __tokStrip\.flush\(\); if \(__rest\)/);
  assert.match(s, /const _cleaned = stripSpecialTokens\(stripMemoryUrls\(fullText, toolCorpus\)\);/);
  assert.match(s, /if \(!viaOR \|\| prov === 'claude' \|\| prov === 'cohere' \|\| \(__ownerReq && __ownerThink\)\) return \{\};/);
  assert.ok(!/process\.env/.test(read('api/_lib/_special-tokens.js')));
});
