// tests/tokens-window.test.cjs — v-tokens-window (التقييم ١١ أكتوبر: المحادثة الطويلة ٨٣٪ من كلفة بلا كاش).
// العرض: compactConversation يبقي آخر ١٤ رسالة بعد ١٦ — فتتبدّل أوّل رسالة في كلّ دور ويُكتب التاريخ كلّه بسعر ١٫٢٥ ولا يُقرأ أبدًا
// (محاكي الكاش على ١٢ دورًا حقيقيًّا: صفر قراءة للتاريخ). العميل يرسل الآن histOffset، والخادم يثبّت بداية النافذة على موضع مطلق.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'tokens-window-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CHAT_PROMPT_CACHE;
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', { kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {}, kvExpire: async () => {} });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: 'win-u' }) });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));
const { compactConversation, WINDOW } = chat.__tokens2 || {}; // على الكود السابق غير موجود — فيفشل كلّ اختبار بسببه لا بخطأ تحميل

/* نسخة حرفيّة من compactConversation قبل التغيير (8687179) — المرجع: بلا histOffset يجب أن يبقى الناتج هو نفسه. */
function messageSize(content) { if (typeof content === 'string') return content.length; try { return JSON.stringify(content || '').length; } catch (e) { return 0; } }
function isProjectCodeMsg(m) { return !!(m && m.role === 'assistant' && typeof m.content === 'string' && /^```(?:html|python)\n/.test(m.content)); }
function oldCompact(items) {
  const source = Array.isArray(items) ? items.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content) : [];
  if (source.length <= 16 && source.reduce((n, m) => n + messageSize(m.content), 0) <= 36000) return source;
  const tail = [];
  let chars = 0;
  for (let i = source.length - 1; i >= 0 && tail.length < 14; i--) {
    const size = messageSize(source[i].content);
    if (tail.length && chars + size > 32000 && !isProjectCodeMsg(source[i])) continue;
    tail.push(source[i]); chars += size;
  }
  tail.reverse();
  while (tail.length && tail[0].role !== 'user') tail.shift();
  while (tail.length && tail[tail.length - 1].role !== 'user') tail.pop(); const __pc = source.find(isProjectCodeMsg); if (__pc && tail.length && tail.indexOf(__pc) === -1) tail.unshift({ role: 'user', content: 'هذا مشروعي الحالي — اعتمد عليه فيما يلي:' }, __pc);
  return tail.length ? tail : source.slice(-1);
}
// مولّد حتميّ (LCG) لمحادثات بأطوال وأحجام متنوّعة
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function convo(n, r, opts) {
  const o = opts || {};
  const out = o.code ? [{ role: 'assistant', content: '```html\n<!DOCTYPE html><p>مشروع</p>\n```' }] : [];
  for (let i = 0; i < n; i++) out.push({ role: i % 2 ? 'assistant' : 'user', content: (i % 2 ? 'ردّ ' : 'سؤال ') + i + ' ' + 'ن'.repeat(Math.floor(r() * (o.big ? 9000 : 1600))) });
  if (out[out.length - 1].role !== 'user') out.push({ role: 'user', content: 'سؤال أخير' });
  return out;
}

test('١. بلا histOffset (عميل قديم) = السلوك القديم حرفيًّا', () => {
  const r = rng(7);
  for (let k = 0; k < 120; k++) {
    const c = convo(1 + Math.floor(r() * 40), r, { code: k % 3 === 0, big: k % 5 === 0 });
    assert.deepEqual(compactConversation(c), oldCompact(c), 'حالة ' + k);
    assert.deepEqual(compactConversation(c, { lane: 'paid' }), oldCompact(c), 'بلا histOffset صالح ' + k);
    assert.deepEqual(compactConversation(c, { histOffset: -3, lane: 'paid' }), oldCompact(c), 'histOffset سالب = تجاهل');
    assert.deepEqual(compactConversation(c, { histOffset: '4', lane: 'paid' }), oldCompact(c), 'نصّ = تجاهل');
  }
});

test('٢. النافذة المحاذاة: الطول بين MIN وMAX، تبدأ بالمستخدم وتنتهي برسالته الأخيرة، وكود المشروع أوّلًا', () => {
  const r = rng(11);
  for (const lane of ['paid', 'free']) {
    const w = WINDOW[lane];
    for (let n = w.MIN + 1; n <= 24; n++) {
      for (const ho of [0, 1, 2, 7, 30]) {
        for (const code of [false, true]) {
          const c = convo(n, r, { code });
          const conv = c.filter((m) => !isProjectCodeMsg(m));
          const out = compactConversation(c, { histOffset: ho, lane });
          const body = code ? out.slice(2) : out;
          if (code) { assert.equal(out[0].role, 'user'); assert.ok(isProjectCodeMsg(out[1]), 'كود المشروع بعد دور مستخدم'); }
          assert.ok(body.length >= Math.min(w.MIN, conv.length) && body.length <= w.MAX, lane + ' n=' + n + ' ho=' + ho + ' len=' + body.length);
          assert.equal(body[0].role, 'user');
          assert.equal(body[body.length - 1], conv[conv.length - 1], 'الرسالة الأخيرة هي الحاليّة');
          assert.deepEqual(body, conv.slice(conv.length - body.length), 'متّصلة بلا ثغرات');
        }
      }
    }
  }
  // قصيرة (لا تتجاوز MIN) = كاملة؛ وأقصر نافذة لا تتّسع للسقف = الطريق القديم
  const short = convo(9, r);
  assert.deepEqual(compactConversation(short, { histOffset: 0, lane: 'paid' }), short);
  const huge = convo(30, r, { big: true });
  assert.deepEqual(compactConversation(huge, { histOffset: 12, lane: 'paid' }), oldCompact(huge), 'سقف الحروف: الرجوع للقديم');
});

const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const textReply = () => new Response([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'تمام' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
].map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const strip = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'cache_control' ? undefined : x)));
const blocksOf = (m) => (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content);
async function send(messages, extra) {
  let body = null;
  const save = global.fetch;
  global.fetch = async (url, init) => { const b = JSON.parse(init.body); if (b && b.max_tokens && !body) body = b; return textReply(); };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() { return true; }, end() { this.writableEnded = true; }, on() {}, flushHeaders() {} };
  try { await chat({ method: 'POST', headers: {}, body: Object.assign({ messages, token: token('win-u'), provider: 'claude', tz: 'Asia/Dubai' }, extra) }, res); }
  finally { global.fetch = save; }
  return body;
}
// ما خُزّن حتّى علامة آخر رسالة (بلا ذيل الدور)، والطلب التالي يقرؤه إن بدأ به حرفيًّا
function cachedPrefix(b) {
  const msgs = b.messages.map((m) => ({ role: m.role, content: blocksOf(m) }));
  const last = msgs[msgs.length - 1];
  const at = last.content.findIndex((x) => x.cache_control);
  last.content = last.content.slice(0, at + 1);
  return strip(msgs);
}
function startsWith(b, prefix) {
  const msgs = strip(b.messages.map((m) => ({ role: m.role, content: blocksOf(m) })));
  if (msgs.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    const a = prefix[i], x = msgs[i];
    if (a.role !== x.role) return false;
    if (JSON.stringify(a.content) !== JSON.stringify(x.content.slice(0, a.content.length))) return false;
  }
  return true;
}

test('٣. ١٢ دورًا في محادثة طويلة على المعالج الحقيقيّ: بادئة التاريخ تُقرأ في ثلاثة أدوار من كلّ أربعة (كانت صفرًا)', async () => {
  // العميل كما في app-09: آخر ٢٤ رسالة، وhistOffset = عدد ما قبلها
  const TOPIC = 'قاعدة الموضوع (أولوية قصوى): رسالة المستخدم الأخيرة تحدّد الموضوع الحاليّ.';
  const lens = [];
  async function run(withOffset) {
    const H = [];
    for (let i = 0; i < 20; i++) H.push({ role: i % 2 ? 'assistant' : 'user', content: (i % 2 ? 'جواب مفصّل رقم ' : 'سؤال رقم ') + i + ' عن مشروع القهوة. ' + 'تفاصيل '.repeat(60) });
    const bodies = [];
    for (let t = 0; t < 12; t++) {
      H.push({ role: 'user', content: 'سؤال جديد ' + t + ' عن التسويق؟' });
      const sl = H.slice(-24);
      bodies.push(await send([{ role: 'system', content: TOPIC }].concat(sl), withOffset ? { histOffset: H.length - sl.length } : {}));
      H.push({ role: 'assistant', content: 'ردّ الدور ' + t + ' ' + 'شرح '.repeat(80) });
    }
    let hits = 0;
    for (let t = 1; t < bodies.length; t++) {
      assert.equal(JSON.stringify(bodies[t].system), JSON.stringify(bodies[t - 1].system), 'النظام ثابت');
      if (startsWith(bodies[t], cachedPrefix(bodies[t - 1]))) hits++;
      if (withOffset) lens.push(bodies[t].messages.length);
    }
    return hits;
  }
  const hits = await run(true);
  assert.ok(hits >= 8, 'قراءة التاريخ في ' + hits + ' من ١١ انتقالًا (المطلوب ≥ ٨: ثلاثة من أربعة)');
  assert.ok(lens.every((n) => n >= 14 && n <= 22), 'طول النافذة بين ١٤ و٢٢: ' + lens.join(','));
  assert.equal(await run(false), 0, 'العميل القديم (بلا histOffset): النافذة المنزلقة كما كانت — صفر قراءة للتاريخ');
});

test('٤. العميل: app-09 يحسب histOffset (ما قبل الشريحة + ما قُصّ من أوّلها) ويمرّره، وapp-18 يرسله في الطلب', () => {
  const a9 = read('js/app-09-attach.js');
  assert.ok(a9.includes('__histOffset = Math.max(0, __historyMsgs.length - MAX_TURNS) + (__turnsBefore - __turns.length);'));
  assert.ok(a9.indexOf('const __turnsBefore = __turns.length;') < a9.indexOf('while(__turns.length > 2 && __size() > MAX_CHARS) __turns.splice(0, 2);'), 'العدّ قبل القصّ');
  assert.equal((a9.match(/__sigFn\(onDelta\), (?:__effProv|__tp|p\.key), \{ histOffset: __histOffset \}\)/g) || []).length, 3, 'مواضع مسار الأدوات الثلاثة');
  const a18 = read('js/app-18-chat-tools.js');
  assert.ok(a18.includes('histOffset: (opts && Number.isInteger(opts.histOffset) && opts.histOffset >= 0) ? opts.histOffset : undefined,'));
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('{ histOffset: __histOffset }') && bundle.includes('histOffset: (opts && Number.isInteger(opts.histOffset)'), 'الحزمة مبنيّة');
  // الخادم: المالك لا يأخذ النافذة (ownerConversation بوسيط واحد)، والمسار المجّانيّ بقيمه
  const c = read('api/_lib/chat.js');
  assert.ok(c.includes("{ histOffset: body && body.histOffset, lane: __freeLane ? 'free' : 'paid' }"));
  assert.ok(WINDOW.free.MAX <= 16 && WINDOW.paid.MIN === 14 && WINDOW.paid.MAX === 22 && WINDOW.paid.STEP === 8);
});
