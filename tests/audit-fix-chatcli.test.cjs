'use strict';
/* v-audit-chatcli — دفعة «أدوات المحادثة» من تدقيق التطبيق كلّه (أكتوبر ٢٠٢٦):
   cli-chat-rest-2/3  «مراجعة الكود» (app-24): ملفّات ES Module/JSX كانت تُرفض في فحص الصياغة، وملفّات ويندوز (CRLF) لا تطابق رقعها.
   cli-chat-rest-4    فيديو المحادثة والبطاقات في متغيّر عامّ: مع المحادثات المتوازية يضيع أو يلتصق بمحادثة أخرى.
   cli-chat-rest-5    استطلاع فيديو المحادثة يترك المهمّة عند أوّل عثرة شبكة، وسقف Runway ١٨٠ ث والخادم ينتظر ٢٩٠ ث.
   cli-chat-rest-6 · x-i18n-2  مفاتيح حالة يبثّها الخادم بلا ترجمة، و«تحليل الكود» يعرض حالته خامًا.
   cli-chat-rest-7    بطاقة انتظار التوليد بالعربيّة والإنجليزيّة فقط.
   x-i18n-4           «تحليل الكود» (app-27) بجدول لغتين محلّيّ.
   x-i18n-5           نصوص عربيّة ثابتة («ورّني وأبنيه» وغيرها) لكلّ اللغات.
   الاختبارات تحمّل الكود الحقيقيّ في vm بدوم مصغّر وt() مزيّفة ترجع «T:مفتاح» — المفاتيح الجديدة تُدمج في القواميس مركزيًّا. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeDom, sseResponse } = require('./_mini-dom.cjs');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const AR_RE = /[؀-ۿ]/;
const settle = async (n = 60) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
/* t() مزيّفة: المفتاح المعروف ← «T:مفتاح»، فيظهر في الناتج أيّ مفتاح قُرئ؛ والمجهول يرجع نفسه كـt الحقيقيّة */
const fakeT = (known) => (k) => (known === true || (known && known.has(k)) ? 'T:' + k : k);

/* ───────── app-24: مراجعة الكود ───────── */
const A24 = read('js/app-24-codefix.js');
function load24(opts = {}) {
  const { document } = makeDom();
  const saved = [];
  const ctx = {
    document, lang: opts.lang || 'en', t: (k) => 'T:' + k, console,
    sessionStorage: { getItem: () => '' }, localStorage: { getItem: () => '' },
    fetch: opts.fetch || (() => Promise.reject(new Error('no fetch'))),
    TextDecoder, TextEncoder, Intl, Blob, setTimeout, clearTimeout, setInterval, clearInterval,
    getCurrent: () => null,
    omranSaveBlob: (b, name) => { saved.push({ b, name }); },
    FileReader: opts.FileReader,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(A24, ctx);
  ctx.__saved = saved;
  return ctx;
}
const patchReply = (oldS, newS) => '@@PATCH\n@@WHY change\n@@OLD\n' + oldS + '\n@@NEW\n' + newS + '\n@@END';
async function reviewApply(name, text, reply) {
  const c = load24({ fetch: () => Promise.resolve(sseResponse([{ delta: reply }, { done: true }])) });
  c.omranCodeFixOpenWith(name, text, 'fix it');
  c.document.getElementById('cfxGo').click();
  await settle();
  const D = c.document;
  const listed = D.getElementById('cfxBody').innerHTML;
  const apply = D.getElementById('cfxApply');
  if (apply) apply.click();
  return { c, listed, after: D.getElementById('cfxBody').innerHTML };
}

test('cli-chat-rest-2: ملفّ ES Module (.mjs وimport/export في .js) وJSX تُحفظ رقعه — لا «لم يُحفظ» لصياغة لا يفهمها new Function', async () => {
  const cases = [
    ['app.mjs', "import fs from 'node:fs';\nexport const a = 1;\n", 'export const a = 1;', 'export const a = 2;'],
    ['util.js', "import { x } from './x.js';\nexport function f() { return x; }\n", 'return x;', 'return x + 1;'],
    ['App.jsx', 'export default function App() {\n  return <div className="a">hi</div>;\n}\n', '<div className="a">hi</div>', '<div className="b">hi</div>'],
    ['App.tsx', 'const n: number = 1;\nexport default n;\n', 'const n: number = 1;', 'const n: number = 2;'],
    ['react.js', 'function App() {\n  return <div>hi</div>;\n}\n', '<div>hi</div>', '<span>hi</span>'], /* JSX داخل .js: الأصل نفسه لا يفهمه الفحص */
    ['cli.js', '#!/usr/bin/env node\nconsole.log(1);\n', 'console.log(1);', 'console.log(2);'],
    ['meta.js', 'const u = import.meta.url;\nconsole.log(u);\n', 'console.log(u);', 'console.log(String(u));'],
  ];
  for (const [name, text, o, n] of cases) {
    const r = await reviewApply(name, text, patchReply(o, n));
    assert.ok(r.listed.includes('T:cfxMatchOne'), name + ': الرقعة مطابقة');
    assert.ok(!r.after.includes('T:cfxNotSaved'), name + ': رُفض الحفظ: ' + r.after.slice(0, 300));
    assert.ok(r.after.includes('T:cfxAppliedN'), name + ': طُبّقت');
  }
});

test('cli-chat-rest-2: الفحص باقٍ حارسًا للسكربت العاديّ — رقعة تكسر ملفّ .js سليمًا تُرفض كما كانت، والسليمة «الصياغة سليمة»', async () => {
  const text = 'function f() {\n  return 1;\n}\n';
  const bad = await reviewApply('a.js', text, patchReply('return 1;', 'return (1;'));
  assert.ok(bad.after.includes('T:cfxNotSaved'), 'رقعة مكسورة على سكربت سليم تُرفض');
  const good = await reviewApply('a.js', text, patchReply('return 1;', 'return 2;'));
  assert.ok(good.after.includes('T:cfxSyntaxOk'), 'السليمة تُفحص فعلًا');
  const cjs = await reviewApply('a.cjs', "const fs = require('fs');\nmodule.exports = 1;\n", patchReply('module.exports = 1;', 'module.exports = (2;'));
  assert.ok(cjs.after.includes('T:cfxNotSaved'), '.cjs ما زال يُفحص');
});

test('cli-chat-rest-3: ملفّ بأسطر ويندوز (CRLF) تطابق رقعه متعدّدة الأسطر، ويُنزَّل بأسطره الأصليّة', async () => {
  const text = 'function f() {\r\n  var a = 1;\r\n  return a;\r\n}\r\n';
  const reply = patchReply('  var a = 1;\n  return a;', '  var a = 2;\n  return a * 2;');
  /* (١) التسليم من «تحليل الكود» (omranCodeFixOpenWith) */
  const r = await reviewApply('win.js', text, reply);
  assert.ok(r.listed.includes('T:cfxMatchOne'), 'الرقعة متعدّدة الأسطر مطابقة: ' + r.listed.slice(0, 200));
  assert.ok(r.after.includes('T:cfxAppliedN'), 'طُبّقت');
  r.c.document.getElementById('cfxDl').click();
  assert.equal(r.c.__saved.length, 1, 'نُزّل الملفّ');
  const out = await r.c.__saved[0].b.text();
  assert.equal(out, 'function f() {\r\n  var a = 2;\r\n  return a * 2;\r\n}\r\n', 'بأسطر CRLF كما رُفع');

  /* (٢) اختيار ملفّ من الجهاز (FileReader) */
  class FR { readAsText() { this.result = text; this.onload(); } }
  const c = load24({ FileReader: FR, fetch: () => Promise.resolve(sseResponse([{ delta: reply }, { done: true }])) });
  c.omranCodeFixOpen();
  c.document.getElementById('cfxFile').onchange({ target: { files: [{ name: 'win.js', size: text.length }] } });
  c.document.getElementById('cfxAsk').value = 'fix';
  c.document.getElementById('cfxGo').click();
  await settle();
  assert.ok(c.document.getElementById('cfxBody').innerHTML.includes('T:cfxMatchOne'), 'من الجهاز أيضًا');

  /* (٣) ملفّ LF كما هو بلا تحويل عند التنزيل */
  const lf = await reviewApply('lf.js', 'var a = 1;\nvar b = 2;\n', patchReply('var a = 1;\nvar b = 2;', 'var a = 3;\nvar b = 4;'));
  lf.c.document.getElementById('cfxDl').click();
  assert.equal(await lf.c.__saved[0].b.text(), 'var a = 3;\nvar b = 4;\n');
});

/* ───────── app-17/18/09: فيديو المحادثة ───────── */
const A17 = read('js/app-17-agent-tools.js');
const A18 = read('js/app-18-chat-tools.js');
const A09 = read('js/app-09-attach.js');
/* ساعة مزيّفة: كلّ setTimeout يقدّم الساعة بمدّته ويُطلق فورًا، فيُقاس زمن الانتظار الذي يراه الخادم بلا انتظار حقيقيّ */
function load17(opts = {}) {
  const clock = { now: 1e12 };
  class FakeDate extends Date { static now() { return clock.now; } }
  const calls = [];
  const sb = {
    console, lang: 'ar', t: (k) => k, Date: FakeDate,
    authGet: () => 'tok', localStorage: { getItem: () => null },
    setTimeout: (fn, ms) => { clock.now += Number(ms) || 0; setImmediate(fn); return 1; }, clearTimeout: () => {},
    fetch: async (url, init) => { calls.push(String(url)); return opts.fetch(String(url), init, calls); },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(A17, sb);
  sb.__clock = clock; sb.__calls = calls;
  return sb;
}
const jsonRes = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const createOk = (url) => (/video-create/.test(url) ? jsonRes({ id: 'task-77' }) : (/veo-create/.test(url) ? jsonRes({ op: 'op-88' }) : null));

test('cli-chat-rest-4: فيديو أداة المحادثة يُحفظ لمحادثة طلبه لا في window.__chatVideoResult العامّ', async () => {
  const sb = load17({ fetch: (url) => createOk(url) || jsonRes({ status: 'SUCCEEDED', output: ['https://cdn.example/v.mp4'] }) });
  const chatA = { id: 'A', messages: [] };
  const out = await sb.omranAgentTools.run('generate_video', { prompt: 'a cat' }, { chat: chatA, imgs: {}, ref: null, userText: 'make a video' });
  assert.match(out, /^✅/);
  assert.equal(sb.__chatVideoResult, undefined, 'لا متغيّر عامّ يصفّره طلب محادثة أخرى أو يلتقطه ردّها');
  assert.deepEqual(JSON.parse(JSON.stringify(sb.__chatVideoByChat || null)), { A: { url: 'https://cdn.example/v.mp4', name: 'chat-video.mp4', provider: 'runway' } });
});

test('cli-chat-rest-4: محادثتان متوازيتان — طلب (ب) أثناء فيديو (أ) لا يمحوه، وردّ (ب) لا يأخذه', async () => {
  const { document } = makeDom();
  let toolDone; const toolP = new Promise((r) => { toolDone = r; });
  let releaseA; const holdA = new Promise((r) => { releaseA = r; });
  const enc = new TextEncoder();
  /* بثّ (أ): أداة generate_video ثمّ ينتظر ناتجها كما ينتظره الخادم (runInClient) قبل أن يكمل */
  const streamA = () => {
    const chunks = [{ clientTool: { id: 'c1', name: 'generate_video', input: { prompt: 'a cat' } } }, '__wait__', { delta: 'done A' }];
    let i = 0;
    return { ok: true, status: 200, body: { getReader() { return { async read() {
      if (i >= chunks.length) return { done: true };
      const c = chunks[i++];
      if (c === '__wait__') { await toolP; return { done: false, value: enc.encode(': ka\n\n') }; }
      return { done: false, value: enc.encode('data: ' + JSON.stringify(c) + '\n\n') };
    }, cancel() { return Promise.resolve(); } }; } } };
  };
  const sb = {
    console, document, lang: 'en', t: (k) => k, Image: function () {}, Intl, TextDecoder, TextEncoder,
    setTimeout, clearTimeout, setInterval, clearInterval,
    authGet: () => 'tok', getGuestId: () => 'g', localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null },
  };
  sb.window = sb;
  sb.fetch = async (url, init) => {
    url = String(url);
    if (url.startsWith('/api/ai?action=chat')) return JSON.parse(init.body).messages[0].content === 'A' ? streamA() : sseResponse([{ delta: 'done B' }]);
    if (url.startsWith('/api/agent-tool-result')) { toolDone(); return jsonRes({ ok: true }); }
    if (/video-create/.test(url)) return jsonRes({ id: 'task-77' });
    if (/video-status/.test(url)) { await holdA; return jsonRes({ status: 'SUCCEEDED', output: ['https://cdn.example/a.mp4'] }); }
    throw new Error('unexpected ' + url);
  };
  vm.createContext(sb);
  sb.setTimeout = (fn, ms) => setTimeout(fn, ms >= 5000 && ms <= 8000 ? 1 : ms); /* استطلاع الفيديو بلا انتظار حقيقيّ */
  vm.runInContext(A17, sb);
  vm.runInContext(A18, sb);
  const chatA = { id: 'A', messages: [] }, chatB = { id: 'B', messages: [] };
  const dA = () => {}; dA.__chat = chatA;
  const dB = () => {}; dB.__chat = chatB;
  const pA = sb.callChatWithTools([{ role: 'user', content: 'A' }], dA, 'claude');
  await settle(200);
  const rB = await sb.callChatWithTools([{ role: 'user', content: 'B' }], dB, 'claude'); /* (ب) يبدأ وينتهي والفيديو قيد الإنشاء */
  assert.equal(rB.reply, 'done B');
  releaseA();
  const rA = await pA;
  assert.equal(rA.reply, 'done A');
  const byChat = sb.__chatVideoByChat || {};
  assert.equal(byChat.A && byChat.A.url, 'https://cdn.example/a.mp4', 'فيديو (أ) محفوظ لـ(أ) رغم طلب (ب)');
  assert.equal(byChat.B, undefined, '(ب) بلا فيديو');
  assert.ok(!sb.__chatVideoResult, 'العامّ فارغ فلا يلتقطه ردّ أيّ محادثة');
});

test('cli-chat-rest-4: الواجهة تقرأ فيديو المحادثة وبطاقاتها لطلبها — لا window.__chatCardsResult ولا عامّ الفيديو وحده', () => {
  const cardsGlobal = /window\.__chatCardsResult\s*=|\(window\.__chatCardsResult\)/;
  assert.ok(!cardsGlobal.test(A09) && !cardsGlobal.test(A18), 'لا بطاقات في متغيّر عامّ');
  assert.ok(A09.includes('let __ctLog = null, __ctCards = null;'), 'بطاقات الطلب في متغيّره بلا سطر جديد في __sendPromptCore');
  assert.ok(A09.includes('__ctCards = __ct.cards || null;') && A09.includes('cards: __ctCards || undefined'), 'تُحفظ في رسالة طلبها');
  const reads = A09.match(/const __cv = [^;]+;|var __chatVideo = [^;]+;/g) || [];
  assert.equal(reads.length, 2, 'موضعا القراءة (الردّ العاديّ واسأل الكلّ)');
  for (const r of reads) assert.ok(r.includes('window.__chatVideoByChat[cur.id]'), 'بمحادثة الطلب: ' + r);
  assert.ok(!/window\.__chatVideoResult = \{ url: videoUrl/.test(A17), 'app-17 لا يكتب العامّ بمحادثة معروفة');
});

test('cli-chat-rest-5: عثرة شبكة في الاستطلاع لا تُسقط الفيديو، وRunway يُنتظر بعد ١٨٠ ث حتّى يكتمل', async () => {
  let polls = 0;
  const sb = load17({ fetch: (url) => {
    const c = createOk(url); if (c) return c;
    polls++;
    if (polls === 1 || polls === 7) throw new TypeError('Failed to fetch');
    return jsonRes(polls >= 42 ? { status: 'SUCCEEDED', output: ['https://cdn.example/late.mp4'] } : { status: 'RUNNING' });
  } });
  const t0 = sb.__clock.now;
  const rc = { chat: { id: 'A' }, imgs: {}, ref: null, userText: 'video' };
  const out = await sb.omranAgentTools.run('generate_video', { prompt: 'x' }, rc);
  assert.match(out, /^✅/, 'اكتمل: ' + out);
  assert.ok(sb.__clock.now - t0 > 180000, 'انتظر بعد سقف ١٨٠ ث القديم');
  assert.equal(sb.__chatVideoByChat.A.url, 'https://cdn.example/late.mp4');
});

test('cli-chat-rest-5: المهلة بسقف واحد قبل مهلة الخادم (٢٩٠ ث) للمحرّكين، ورسالتها بمعرّف المهمّة ولا تدعو لإعادة الطلب', async () => {
  for (const [provider, id] of [['runway', 'task-77'], ['veo', 'op-88']]) {
    const sb = load17({ fetch: (url) => createOk(url) || jsonRes({ status: 'RUNNING' }) });
    const t0 = sb.__clock.now;
    const out = await sb.omranAgentTools.run('generate_video', { prompt: 'x', provider }, { chat: { id: 'A' }, imgs: {}, ref: null, userText: 'video' });
    const waited = sb.__clock.now - t0;
    assert.ok(waited >= 270000 && waited <= 285000, provider + ': انتظر ' + waited + ' مث');
    assert.ok(out.includes(id), provider + ': معرّف المهمّة في الناتج: ' + out);
    assert.ok(!/حاول مرة أخرى/.test(out), provider + ': لا دعوة لإعادة الطلب');
    assert.match(out, /generate_video/, provider + ': ينهى النموذج عن استدعائها ثانية');
  }
  /* veo بعثرة أيضًا */
  let n = 0;
  const sb = load17({ fetch: (url) => { const c = createOk(url); if (c) return c; n++; if (n === 2) throw new TypeError('network'); return jsonRes(n >= 4 ? { status: 'SUCCEEDED', output: 'https://cdn.example/veo.mp4' } : { status: 'RUNNING' }); } });
  const out = await sb.omranAgentTools.run('generate_video', { prompt: 'x', provider: 'veo' }, { chat: { id: 'V' }, imgs: {}, ref: null, userText: 'video' });
  assert.match(out, /^✅/);
  assert.equal(sb.__chatVideoByChat.V.url, 'https://cdn.example/veo.mp4');
});
