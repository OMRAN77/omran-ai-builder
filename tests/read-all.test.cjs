// v-read-all: كلّ المزوّدين يقرؤون ويحلّلون كالوكيل — الطبقة المجانية تقرأ الروابط قبل الردّ بلا تكلفة،
// وكلّ ردّ استعمل أدوات يحفظ سجلّ خطواته («فكّر N ث» + ما قُرئ ومُدخله ومقتطف ناتجه) كسجلّ الوكيل.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-read-all-' + 'x'.repeat(40);
const fr = require('../api/_lib/free-read.js');

const trailLine = (name, input, result) => ({ text: 'قرأتُ ' + input.url + ' — ' + String(result).length, k: /^فشل/.test(result) ? 'trFetchFail' : 'trFetch', p: { h: input.url } });

test('استخراج الروابط: بسقف ثلاثة، بلا تكرار، وبلا علامة الترقيم الأخيرة', () => {
  assert.deepStrictEqual(fr.extractUrls('شوف https://a.com/x، و https://b.com/y. ثمّ https://a.com/x'), ['https://a.com/x', 'https://b.com/y']);
  assert.strictEqual(fr.extractUrls('1 https://a.com 2 https://b.com 3 https://c.com 4 https://d.com').length, 3);
  assert.deepStrictEqual(fr.extractUrls('بلا رابط'), []);
});

test('ملفّ GitHub بصفحة blob يُقرأ نصًّا خامًّا', () => {
  assert.strictEqual(fr.readableUrl('https://github.com/o/r/blob/main/api/x.js'), 'https://raw.githubusercontent.com/o/r/main/api/x.js');
  assert.strictEqual(fr.readableUrl('https://example.com/p'), 'https://example.com/p');
});

test('preRead يقرأ الرابط، يبثّ الحالة وسطر الأثر بمُدخله ومقتطفه، ويُلحق المقروء بآخر رسالة', async () => {
  const sent = [];
  const fetched = [];
  const convo = [{ role: 'assistant', content: 'أهلًا' }, { role: 'user', content: 'حلّل https://github.com/o/r/blob/main/a.js' }];
  const out = await fr.preRead({ convo, send: (e) => sent.push(e), trailLine, fetchPage: async (u) => { fetched.push(u); return 'const a = 1; // ملفّ'; } });
  assert.deepStrictEqual(fetched, ['https://raw.githubusercontent.com/o/r/main/a.js']);
  assert.strictEqual(out.read, 1);
  assert.strictEqual(sent[0].k, 'stFetchPage');
  assert.ok(/^↳ /.test(sent[1].status));
  assert.strictEqual(sent[1].cmd, 'https://github.com/o/r/blob/main/a.js');
  assert.strictEqual(sent[1].out, 'const a = 1; // ملفّ');
  const last = out.convo[1];
  assert.ok(Array.isArray(last.content));
  const all = last.content.map((b) => b.text).join('');
  assert.ok(all.includes('حلّل https://github.com'));
  assert.ok(all.includes('[قرأ التطبيق هذا المحتوى الآن من https://github.com/o/r/blob/main/a.js]'));
  assert.ok(all.includes('const a = 1;'));
  assert.strictEqual(convo[1].content, 'حلّل https://github.com/o/r/blob/main/a.js', 'المحادثة الأصليّة لا تُمسّ');
});

test('بلا رابط لا جلب ولا حالة؛ والفشل يُبلَّغ في الأثر ولا يُلحَق نصّه كأنّه محتوى', async () => {
  const sent = [];
  const convo = [{ role: 'user', content: 'مرحبا' }];
  const none = await fr.preRead({ convo, send: (e) => sent.push(e), trailLine, fetchPage: async () => { throw new Error('لا يُستدعى'); } });
  assert.strictEqual(none.convo, convo);
  assert.strictEqual(sent.length, 0);
  const bad = await fr.preRead({ convo: [{ role: 'user', content: 'https://x.test/a' }], send: (e) => sent.push(e), trailLine, fetchPage: async () => 'فشل فتح الصفحة: HTTP 404' });
  assert.strictEqual(bad.read, 0);
  assert.strictEqual(bad.convo[0].content, 'https://x.test/a');
  assert.strictEqual(sent[1].k, 'trFetchFail');
});

test('سطر الأثر في حلقة الأدوات يحمل المُدخل ومقتطف الناتج لأدوات القراءة وحدها', () => {
  const { trailDetail } = require('../api/_lib/chat.js').__vread;
  assert.deepStrictEqual(trailDetail('fetch_page', { url: 'https://a.com' }, 'نصّ'), { cmd: 'https://a.com', out: 'نصّ' });
  assert.deepStrictEqual(trailDetail('web_search', { query: 'سعر الذهب' }, '1. x'), { cmd: 'سعر الذهب', out: '1. x' });
  assert.strictEqual(trailDetail('read_github', { url: 'o/r', path: 'a.js' }, 'x').cmd, 'o/r a.js');
  assert.strictEqual(trailDetail('fetch_page', { url: 'https://a.com' }, 'x'.repeat(2000)).out.length, 400);
  assert.deepStrictEqual(trailDetail('generate_image', { prompt: 'قطّة' }, '__IMG_1__'), {});
  const src = read('api/_lib/chat.js');
  assert.ok(src.includes("send(Object.assign({ status: '↳ ' + __tl.text, k: __tl.k, p: __tl.p }, trailDetail(cb.name, input, result)));"));
});

test('الطبقة المجانية تقرأ قبل البثّ وتمرّر المحادثة المقروءة، والملاحظة تأمرها بالتحليل والاستشهاد', () => {
  const src = read('api/_lib/chat.js');
  const i = src.indexOf("require('./free-read.js').preRead({ convo, send, fetchPage, trailLine })");
  const j = src.indexOf('convo: __pre.convo, send, requireVision: lastUserHasImage');
  assert.ok(i > 0 && j > i, 'القراءة قبل السلسلة المجانية ونتيجتها هي ما يُبثّ منه');
  const { FREE_NOTE } = require('../api/_lib/free-chain.js');
  assert.ok(FREE_NOTE.includes('قُرئ فعلًا'));
  assert.ok(FREE_NOTE.includes('واستشهد بما فيه'));
  assert.ok(FREE_NOTE.includes('لا تقل إنك لا تستطيع فتح الروابط'));
});

function loadChatTools(events) {
  const src = read('js/app-18-chat-tools.js');
  const body = src.slice(0, src.indexOf('// v478'));
  const lines = events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('');
  const enc = new TextEncoder();
  let sentOnce = false;
  const window = {};
  const ctx = {
    window, TextDecoder, TextEncoder, Promise, setTimeout, clearTimeout, JSON, String, Array, Date, Error,
    tStatus: (ev) => ev.status,
    fetch: async () => ({ ok: true, body: { getReader: () => ({ read: async () => { if (sentOnce) return { done: true }; sentOnce = true; return { done: false, value: enc.encode(lines) }; }, cancel() {} }) } }),
  };
  vm.runInNewContext(body, ctx);
  return window.callChatWithTools;
}

test('العميل يبني السجلّ: «فكّر» ثمّ خطوة لكلّ سطر أثر بمُدخلها وناتجها؛ وبلا أثر لا سجلّ', async () => {
  const call = loadChatTools([
    { status: '💭 يقرأ سؤالك…', k: 'stReading' },
    { status: '🌐 يقرأ صفحة…', k: 'stFetchPage' },
    { status: '↳ قرأتُ a.com — حصلتُ 3 حرفًا', k: 'trFetch', cmd: 'https://a.com', out: 'abc' },
    { status: '↳ قرأتُ b.com — فشل', k: 'trFetchFail', cmd: 'https://b.com', out: 'فشل فتح الصفحة' },
    { delta: 'الجواب' },
    { done: true },
  ]);
  const r = await call([{ role: 'user', content: 'x' }], null, 'gemini');
  assert.strictEqual(r.reply, 'الجواب');
  assert.strictEqual(r.log.length, 3);
  assert.strictEqual(r.log[0].t, 'think');
  assert.ok(r.log[0].ms >= 0);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.log.slice(1))), [
    { t: 'tool', name: 'trFetch', title: 'قرأتُ a.com — حصلتُ 3 حرفًا', cmd: 'https://a.com', out: 'abc', err: 0, g: 0 },
    { t: 'tool', name: 'trFetchFail', title: 'قرأتُ b.com — فشل', cmd: 'https://b.com', out: 'فشل فتح الصفحة', err: 1, g: 0 },
  ]);
  const plain = await loadChatTools([{ status: '💭', k: 'stReading' }, { delta: 'مرحبا' }, { done: true }])([{ role: 'user', content: 'x' }], null, 'gemini');
  assert.strictEqual(plain.log, undefined);
});

test('الردّ يحفظ السجلّ في الرسالة فيرسمه عارض سجلّ الوكيل بعد الانتهاء', () => {
  const a = read('js/app-09-attach.js');
  assert.ok(a.includes('if(Array.isArray(__ct.log) && __ct.log.length) __ctLog = __ct.log;'));
  assert.ok(a.includes('_agParts: __ctLog || undefined,'));
  assert.ok(read('js/app-04-i18n-state.js').includes('window.omranAgentLog.render(m._agParts)'));
  assert.ok(read('js/app.bundle.js').includes('_agParts: __ctLog || undefined,'), 'الحزمة مبنيّة من الأجزاء');
});
