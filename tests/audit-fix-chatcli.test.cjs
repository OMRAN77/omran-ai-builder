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
