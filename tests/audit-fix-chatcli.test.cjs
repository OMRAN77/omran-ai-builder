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

/* ───────── القواميس الأربعة عشر (كما يقرؤها tRaw في app-04) ───────── */
const LAZY = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
const DICT = (() => {
  const acorn = require('acorn');
  const DATA = read('js/app-03-i18n-data.js');
  const ast = acorn.parse(DATA, { ecmaVersion: 'latest', sourceType: 'script' });
  const parts = ast.body.filter((n) => (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === 'I18N'))
    || (n.type === 'ExpressionStatement' && DATA.slice(n.start, n.start + 18).startsWith('Object.assign(I18N'))).map((n) => DATA.slice(n.start, n.end));
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(parts.join('\n') + '\nthis.I18N = I18N;', sb);
  const out = { ar: sb.I18N.ar, en: sb.I18N.en };
  for (const lg of LAZY) {
    const s2 = { I18N: {} }; s2.window = s2; s2.self = s2;
    vm.createContext(s2);
    vm.runInContext(read('i18n/' + lg + '.js'), s2);
    out[lg] = Object.assign({}, sb.I18N[lg] || {}, s2.I18N[lg]);
  }
  return out;
})();
/* مفاتيح جديدة تُدمج في القواميس مركزيًّا (ناتج هذه الدفعة i18nKeys) — ما دامت غائبة يقبلها الاختبار، وحين تحضر يشترط اللغات الأربع عشرة */
const CENTRAL = {
  stWriting: [], stGenVideo: [], stCarry: [], stGithub: ['{repo}'], stAnalyze: ['{n}', '{lines}'], axChatcliStAnalyzeWriting: ['{n}'],
};
function checkKeys(keys, label) {
  for (const k of keys) {
    const has = Object.keys(DICT).filter((lg) => typeof DICT[lg][k] === 'string');
    if (!has.length) { assert.ok(Object.prototype.hasOwnProperty.call(CENTRAL, k), label + ': المفتاح ' + k + ' غائب عن القواميس كلّها'); continue; }
    assert.equal(has.length, 14, label + ': ' + k + ' في ' + has.length + ' لغة فقط');
    for (const lg of has) {
      const v = DICT[lg][k];
      assert.ok(v.trim(), lg + ': ' + k + ' فارغ');
      for (const ph of (CENTRAL[k] || [])) assert.ok(v.includes(ph), lg + ': ' + k + ' بلا ' + ph);
      if (lg !== 'ar' && lg !== 'ur') assert.ok(!AR_RE.test(v), lg + ': ' + k + ' فيه عربيّ');
    }
  }
}

test('cli-chat-rest-6 · x-i18n-2: كلّ مفتاح حالة يبثّه الخادم (k) له ترجمة بالأربع عشرة لغة — لا نصّ الخادم العربيّ في الإنجليزيّ', () => {
  for (const f of ['api/_lib/chat.js', 'api/_lib/code-analyze.js']) {
    const src = read(f);
    /* stModelFallback خارج هذه الدفعة: بالعربيّة والإنجليزيّة وحدهما ويحمل اسم النموذج نفسه ({model}) — مذكور في ملاحظات الدفعة */
    const keys = [...new Set([...src.matchAll(/\bk:\s*'((?:st[A-Z]|axChatcliSt)\w*)'/g)].map((m) => m[1]))].filter((k) => k !== 'stModelFallback');
    assert.ok(keys.length >= (f.includes('chat.js') ? 10 : 3), f + ': ' + keys.join(','));
    checkKeys(keys, f);
  }
  /* المفاتيح الثلاثة التي ثبّت الفحص غيابها لها ترجمة هنا */
  for (const k of ['stWriting', 'stGenVideo', 'stCarry', 'stGithub', 'stAnalyze']) assert.ok(k in CENTRAL || typeof DICT.en[k] === 'string', k);
});

test('x-i18n-2: «تحليل الكود» يبثّ أرقام حالته بارامترات (p) فتُترجم كاملة، وكتابة التحليل بمفتاحها لا بمفتاح «المزوّد يكتب»', () => {
  const ca = read('api/_lib/code-analyze.js');
  assert.match(ca, /k: 'stGithub', p: \{ repo: /, 'المستودع بارامتر');
  assert.match(ca, /k: 'stAnalyze', p: \{ n: col\.files\.length, lines: metrics\.totals\.lines \}/, 'الملفّات والأسطر بارامتران');
  assert.match(ca, /k: 'axChatcliStAnalyzeWriting', p: \{ n \}/, 'عدد الحروف بارامتر');
  assert.ok(!/k: 'stWriting'/.test(ca), 'لا يشارك stWriting نصًّا آخر');
  /* tStatus الحقيقيّ (app-04) يملأ البارامترات */
  const A04 = read('js/app-04-i18n-state.js');
  const src = A04.slice(A04.indexOf('function tStatus(ev){'), A04.indexOf("try{ window.tStatus = tStatus;"));
  const sb = { __swallow() {}, t: (k) => ({ stAnalyze: '🔎 Reading {n} files · {lines} lines…' })[k] || k };
  vm.createContext(sb);
  vm.runInContext(src + ';this.tStatus = tStatus;', sb);
  assert.equal(sb.tStatus({ status: 'عربيّ', k: 'stAnalyze', p: { n: 3, lines: 120 } }), '🔎 Reading 3 files · 120 lines…');
  assert.equal(sb.tStatus({ status: '✍️ يكتب', k: 'axChatcliStAnalyzeWriting', p: { n: 1500 } }), '✍️ يكتب', 'غياب الترجمة = نصّ الخادم كما كان');
});

/* ───────── app-27: تحليل الكود وتقييمه ───────── */
const A27 = read('js/app-27-codescore.js');
const REPORT = {
  parsed: true, score: 72, grade: 'B', language: 'JavaScript', summary: 's', verdict: 'v', engine: 'free', deep: '# d\n- x',
  reading: { toolCalls: 3, rounds: 2, pool: 5 },
  categories: { correctness: 80, security: 60, performance: 70, readability: 75, maintainability: 70, best_practices: 65 },
  recommendations: ['r1', 'r2'], strengths: ['s1'],
  files: [{ name: 'a.js', score: 80, note: 'n' }, { name: 'b.js', score: 60, note: 'm' }],
  issues: [{ severity: 'high', category: 'security', title: 'XSS', file: 'a.js', line: 3, detail: 'd', fix: 'esc()' }, { severity: 'low', category: 'best_practices', title: '', detail: 'd2' }],
  counts: { high: 1, low: 1 },
  metrics: { totals: { files: 2, lines: 40, comments: 4, languages: ['js'] }, files: [{ name: 'a.js', flags: [], truncated: true }] },
  skipped: [{ name: 'big.bin' }],
};
function load27(lg, opts = {}) {
  const { document } = makeDom();
  const dd = document.createElement('div'); dd.id = 'tabsMenuDropdown'; document.body.appendChild(dd);
  const ctx = {
    document, lang: lg, t: opts.t || fakeT(true), tStatus: opts.tStatus, console,
    sessionStorage: { getItem: () => '' }, localStorage: { getItem: () => '' },
    fetch: opts.fetch || (() => Promise.reject(new Error('no fetch'))),
    TextDecoder, TextEncoder, Intl, setTimeout, clearTimeout, setInterval, clearInterval, getCurrent: () => null,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(A27, ctx);
  return ctx;
}
function pasteAndGo(c) {
  const D = c.document;
  D.getElementById('csPasteName').value = 'a.js';
  D.getElementById('csPaste').value = 'var a = 1;';
  D.getElementById('csPasteAdd').click();
  D.getElementById('csGo').click();
}

test('x-i18n-4: «تحليل الكود» كلّه من قاموس الواجهة (axChatcliCs*) — الزرّ وتلميحه بـdata-i18n، والاختيار والتقرير والخطورة والفئات', async () => {
  for (const lg of ['fr', 'zh', 'ur']) {
    let release; const hold = new Promise((r) => { release = r; });
    const enc = new TextEncoder();
    const evs = [{ status: '🔎 يقرأ ١ ملفًّا', k: 'stAnalyze', p: { n: 1, lines: 1 } }, '__hold__', { report: REPORT }];
    let i = 0;
    const res = { ok: true, status: 200, body: { getReader() { return { async read() {
      if (i >= evs.length) return { done: true };
      const e = evs[i++];
      if (e === '__hold__') { await hold; return { done: false, value: enc.encode(': ka\n\n') }; }
      return { done: false, value: enc.encode('data: ' + JSON.stringify(e) + '\n\n') };
    } }; } } };
    const c = load27(lg, { fetch: () => Promise.resolve(res), tStatus: (ev) => 'TS:' + ev.k });
    const D = c.document;
    const b = D.getElementById('btnCodeScore');
    assert.equal(b.title, 'T:axChatcliCsMenuTitle', lg + ': التلميح');
    assert.equal(b.getAttribute('data-i18n-title'), 'axChatcliCsMenuTitle', lg + ': التلميح يتبع تبديل اللغة');
    assert.ok(b.innerHTML.includes('data-i18n="axChatcliCsMenu"') && b.innerHTML.includes('>T:axChatcliCsMenu<'), lg + ': الوسم');
    c.omranCodeScoreOpen();
    const ov = D.getElementById('csOverlay');
    const pick = D.allText(ov);
    for (const k of ['Title', 'PickFiles', 'Current', 'Paste', 'Add', 'PasteName', 'PastePh', 'Ask', 'Github', 'GithubPh', 'GithubAdd', 'AskPh', 'Go', 'Note']) {
      assert.ok(pick.includes('T:axChatcliCs' + k), lg + ': شاشة الاختيار بلا axChatcliCs' + k);
    }
    assert.ok(!AR_RE.test(pick.replace(/T:axChatcliCs\w+/g, '')), lg + ': عربيّ ثابت في شاشة الاختيار');
    assert.ok(pick.includes('aria-label="T:closeTitle"'), lg + ': زرّ الإغلاق بلغته');
    let asked = null; c.omranCodeFixOpenWith = (n, txt, ask) => { asked = ask; };
    pasteAndGo(c);
    await settle();
    assert.equal(D.getElementById('csProg').textContent, 'TS:stAnalyze', lg + ': الحالة بـtStatus لا نصّ الخادم الخامّ');
    release();
    await settle();
    const rep = D.getElementById('csBody').innerHTML;
    for (const k of ['EngineFree', 'Verdict', 'FreeNote', 'Upgrade', 'Deep', 'ReadNote', 'Recs', 'Best', 'Ranking', 'Strengths', 'Issues', 'Fix', 'Metrics', 'Files', 'Lines', 'CommentRatio', 'Truncated', 'Skipped', 'Download', 'Copy', 'Again', 'FixBtn',
      'SevHigh', 'SevLow', 'CatCorrectness', 'CatSecurity', 'CatPerformance', 'CatReadability', 'CatMaintainability', 'CatBestPractices']) {
      assert.ok(rep.includes('T:axChatcliCs' + k), lg + ': التقرير بلا axChatcliCs' + k);
    }
    assert.ok(!AR_RE.test(rep.replace(/T:axChatcliCs\w+/g, '')), lg + ': عربيّ ثابت في التقرير');
    /* «أصلح أهمّ المشاكل» يسلّم طلبًا بلغة الواجهة */
    D.getElementById('csFix').click();
    assert.ok(asked && asked.startsWith('T:axChatcliCsFixAsk\n'), lg + ': طلب الإصلاح: ' + asked);
  }
});

test('x-i18n-4: بلا مفتاح في القاموس يبقى الجدول احتياطًا (العربيّة والإنجليزيّة كما كانتا)، والحدّ بمفاتيح المحادثة القائمة', async () => {
  const ar = load27('ar', { t: (k) => k });
  ar.omranCodeScoreOpen();
  assert.ok(ar.document.getElementById('csBody').innerHTML.includes('حلّل وقيّم كلّ شيء'));
  assert.ok(ar.document.getElementById('btnCodeScore').innerHTML.includes('>تحليل<'));
  const en = load27('en', { t: (k) => k });
  en.omranCodeScoreOpen();
  assert.ok(en.document.getElementById('csBody').innerHTML.includes('Analyze &amp; rate everything'));
  const lim = load27('fr', { fetch: () => Promise.resolve(sseResponse([{ tier: 'free-limit', error: 'نصّ الخادم العربيّ' }])) });
  lim.omranCodeScoreOpen();
  pasteAndGo(lim);
  await settle();
  const h = lim.document.getElementById('csBody').innerHTML;
  assert.ok(h.includes('T:chatFreeLimitMsg') && !h.includes('نصّ الخادم العربيّ'), 'رسالة الحدّ بلغة الواجهة: ' + h.slice(0, 200));
});

/* ───────── app-34: بطاقة انتظار التوليد ───────── */
const A34 = read('js/app-34-gen-wait.js');
function load34(lg, t) {
  const { document } = makeDom();
  document.readyState = 'loading';
  document.head = document.createElement('head'); document.documentElement.appendChild(document.head);
  const sb = { document, lang: lg, t, console, MutationObserver: function () { return { observe() {} }; },
    setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {}, localStorage: { getItem: () => null, setItem() {} } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(A34, sb);
  return sb.omranGenWait;
}
const card = (W, kind) => { const r = W.render({ kind, t0: Date.now() }); return { stage: r.querySelector('.genw-stage').textContent, timer: r.querySelector('.genw-timer').textContent }; };
const GENW_KINDS = { image: 'Image', video: 'Video', styles: 'Styles', fashion: 'Fashion', studio: 'Styles', vmaker: 'Video', vtrend: 'Video', decor: 'Image' };

test('cli-chat-rest-7: مراحل بطاقة الانتظار وسطر وقتها بلغة الواجهة (axChatcliGenw*) في كلّ الأنواع — لا إنجليزيّة للفرنسيّ ولا للأرديّ', () => {
  for (const lg of ['fr', 'ur', 'zh']) {
    const W = load34(lg, fakeT(true));
    for (const [kind, fam] of Object.entries(GENW_KINDS)) {
      const c = card(W, kind);
      assert.equal(c.stage, 'T:axChatcliGenw' + fam + 'S1', lg + '/' + kind + ': المرحلة الأولى');
      assert.ok(c.timer.includes('T:axChatcliGenwSec') && c.timer.includes('T:axChatcliGenw' + (kind === 'studio' ? 'Image' : fam) + 'Expect'), lg + '/' + kind + ': سطر الوقت: ' + c.timer);
      assert.ok(!/usually|images|Understanding/.test(c.stage + c.timer), lg + '/' + kind + ': إنجليزيّة ثابتة');
    }
    /* التلميح والبطء والمرحلة الأخيرة مفاتيح أيضًا */
    const K = W.KINDS;
    assert.equal(K.image.hint.k, 'axChatcliGenwImageHint');
    assert.equal(K.video.slow.k, 'axChatcliGenwVideoSlow');
    assert.equal(K.image.slow.k, 'axChatcliGenwSlow');
    assert.deepEqual(Array.from(K.fashion.stages.k), ['axChatcliGenwFashionS1', 'axChatcliGenwFashionS2', 'axChatcliGenwFashionS3', 'axChatcliGenwFinal']);
    assert.deepEqual(Array.from(K.studio.stages.k), ['axChatcliGenwStylesS1', 'axChatcliGenwImageS2', 'axChatcliGenwStylesS3', 'axChatcliGenwFinal']);
  }
  /* بلا مفتاح في القاموس: العربيّة للعربيّ والإنجليزيّة لغيره كما كانتا */
  const ar = card(load34('ar', (k) => k), 'image'), en = card(load34('fr', (k) => k), 'image');
  assert.equal(ar.stage, 'نفهم طلبك…');
  assert.ok(ar.timer.includes('ث — الصور تاخذ ~٣٠ ثانية'), ar.timer);
  assert.equal(en.stage, 'Understanding your request…');
  assert.ok(en.timer.includes('s — images usually take ~30s'), en.timer);
});

/* ───────── x-i18n-5: «ورّني وأبنيه» ومتفرّقات عربيّة ثابتة ───────── */
const A16 = read('js/app-16-snapbuild.js');
function fnOf(src, head) { /* دالّة علويّة كاملة بنصّها (قوسها الأخير) */
  const i = src.indexOf(head);
  assert.ok(i >= 0, head);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('غير مغلق: ' + head);
}
function load16(lg, t, replies, extra) {
  const { document } = makeDom();
  const btn = document.createElement('button'); btn.id = 'btnSnapBuild'; document.body.appendChild(btn);
  const input = document.createElement('input'); input.id = 'snapInput'; document.body.appendChild(input);
  const state = { projects: [], currentId: null };
  const statuses = [];
  const ctx = {
    document, lang: lg, t, console: { log() {}, warn() {}, error() {} }, state, __swallow() {}, setTimeout: () => 0, setInterval: () => 0,
    saveState() {}, renderHistory() {}, renderMessages() {}, renderCodeAndPreview() {}, switchWorkTab() {},
    workareaEl: { classList: { contains: () => true } }, openDrawer() {},
    matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null },
    FileReader: class { readAsDataURL() { this.result = 'data:image/png;base64,QUJD'; this.onload(); } },
    /* ردّ الوسيط بحالته كـfetch الحقيقيّ: withSt(402, {...}) للمرفوض، وغيره 200 */
    claudeProxyRequest: async () => { const r = replies.shift(); if (r instanceof Error) throw r; const st = (r && r.__st) || 200; return { ok: st < 400, status: st, json: async () => r }; },
  };
  Object.assign(ctx, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(A16, ctx);
  const fire = async () => {
    input.files = [{ name: 'menu.png' }];
    for (const fn of input._ls.change) fn.call(input, {});
    const el = document.getElementById('snapBuildStatus');
    statuses.push(el && el.textContent);
    await settle();
    statuses.push(el && el.textContent);
  };
  return { ctx, state, fire, statuses };
}
const READ_JSON = { content: [{ text: '{"kind":"menu","title":"","sections":[{"name":"Main","items":[{"name":"Tea","price":"5?"}]}],"screens":[{"name":"s","elements":[]}]}' }] };
const BUILT = { content: [{ text: 'ok\n```html\n<!DOCTYPE html><html><body>x</body></html>\n```' }] };
const withSt = (st, body) => Object.assign({ __st: st }, body);

test('x-i18n-5: «ورّني وأبنيه» بلغة الواجهة — الحالات واسم المشروع ورسالة المحادثة وملخّص المقروء (axChatcliSnap*)', async () => {
  /* قوالب الملخّص بعلاماتها كما في القاموس، فيظهر فيها اسم النوع والأعداد */
  const phT = (k) => 'T:' + k + (/Snap(Read|Counts|Screens|Unsure)$/.test(k) ? ' {kind}{s}{n}' : '');
  for (const lg of ['en', 'zh', 'ur']) {
    const w = load16(lg, phT, [READ_JSON, BUILT]);
    await w.fire();
    assert.equal(w.statuses[0], 'T:axChatcliSnapReading', lg + ': حالة القراءة');
    const p = w.state.projects[0];
    assert.ok(p, lg + ': المشروع بُني');
    assert.equal(p.title, 'T:axChatcliSnapTitle', lg + ': اسم المشروع');
    const msg = p.messages[0].content;
    for (const k of ['SnapRead', 'SnapKindMenu', 'SnapCounts', 'SnapScreens', 'SnapUnsure', 'SnapDone']) assert.ok(msg.includes('T:axChatcli' + k), lg + ': الرسالة بلا ' + k + ': ' + msg);
    assert.ok(!AR_RE.test(msg.replace(/T:axChatcli\w+/g, '')), lg + ': عربيّ ثابت في الرسالة: ' + msg);
  }
  /* الفشل: نصّ المزوّد الخامّ لا يظهر — سطر مترجَم بدله؛ وردّ ناجح لا يُقرأ وحده «صوّرها بإضاءة أوضح» */
  const bad = load16('en', fakeT(true), [withSt(529, { error: { message: 'overloaded_error: upstream says no' } })]);
  await bad.fire();
  assert.equal(bad.statuses[1], '⚠️ T:axChatcliSnapFail');
  const blurry = load16('en', fakeT(true), [{ content: [{ text: 'I cannot make out this photo' }] }]);
  await blurry.fire();
  assert.equal(blurry.statuses[1], '⚠️ T:axChatcliSnapReadFail');
  const boom = load16('en', fakeT(true), [new Error('chat 500: {"type":"error"}')]);
  await boom.fire();
  assert.equal(boom.statuses[1], '⚠️ T:axChatcliSnapFail', 'عطل مجهول = سطر عامّ مترجَم');
  const noCode = load16('fr', fakeT(true), [READ_JSON, { content: [{ text: 'no code here' }] }]);
  await noCode.fire();
  assert.equal(noCode.statuses[1], '⚠️ T:axChatcliSnapNoCode');
  /* بلا مفتاح في القاموس: العربيّة كما كانت */
  const ar = load16('ar', (k) => k, [READ_JSON, BUILT]);
  await ar.fire();
  assert.equal(ar.statuses[0], '📸 يقرأ الصورة بدقة (الأسعار والنصوص حرفيًا)…');
  assert.equal(ar.state.projects[0].title, 'من الصورة 📸');
  assert.ok(ar.state.projects[0].messages[0].content.includes('📸 قرأتُ من الصورة: **قائمة طعام**') && ar.state.projects[0].messages[0].content.includes('✅ بنيته لك'));
});

test('x-i18n-5: «ورّني وأبنيه» ردّ الوسيط المرفوض (401 جلسة، 402 حدّ يوميّ) بسببه — العربيّ يرى نصّ الخادم، وغيره مفتاح الدخول أو الحدّ، لا «صوّرها بإضاءة أوضح»', async () => {
  const LIMIT_AR = 'وصلت للحد اليومي المجاني (20 رسالة) لهذا المزوّد. جرّب مزودًا آخر بمفتاحك الخاص أو انتظر الغد.';
  const SESSION_AR = 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد';
  /* العربيّ: نصّ الخادم العربيّ كما كان قبل الدفعة (الحدّ والجلسة)، لا سطر الإضاءة */
  for (const [st, msg] of [[402, LIMIT_AR], [401, SESSION_AR]]) {
    const w = load16('ar', fakeT(true), [withSt(st, { error: msg })], { __omranPlan: 'free' });
    await w.fire();
    assert.equal(w.statuses[1], '⚠️ ' + msg, 'ar/' + st);
    assert.equal(w.state.projects.length, 0);
  }
  /* غير العربيّ (والأرديّ منه): مفتاح قائم بالـ١٤ لغة بحسب الحالة والطبقة، ولا حرف من نصّ الخادم */
  for (const lg of ['en', 'fr', 'ur']) {
    for (const [st, plan, key] of [[402, 'free', 'chatFreeLimitMsg'], [402, 'guest', 'chatGuestLimitMsg'], [402, 'plus', 'portraitLimitReached'], [401, 'free', 'portraitNeedLogin']]) {
      const w = load16(lg, fakeT(true), [withSt(st, { error: st === 402 ? LIMIT_AR : SESSION_AR })], { __omranPlan: plan });
      await w.fire();
      assert.equal(w.statuses[1], '⚠️ T:' + key, lg + '/' + st + '/' + plan);
    }
  }
  /* 429 من الوسيط = زحام المزوّد بعد إعادتين في الخادم (لا حدّ المستخدم): سطر عامّ مترجَم */
  const busy = load16('fr', fakeT(true), [withSt(429, { type: 'error', error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit' } })], { __omranPlan: 'free' });
  await busy.fire();
  assert.equal(busy.statuses[1], '⚠️ T:axChatcliSnapFail');
  /* البناء طلب ثانٍ يُحسب: حدّه بعد قراءة ناجحة بسببه، لا «لم يصل كود صالح» */
  const late = load16('en', fakeT(true), [READ_JSON, withSt(402, { error: LIMIT_AR })], { __omranPlan: 'free' });
  await late.fire();
  assert.equal(late.statuses[1], '⚠️ T:chatFreeLimitMsg');
  assert.equal(late.state.projects.length, 0);
  /* بلا مفتاح في القاموس: احتياط عربيّ للمفتاح القائم */
  const fb = load16('ur', (k) => k, [withSt(401, { error: SESSION_AR })]);
  await fb.fire();
  assert.equal(fb.statuses[1], '⚠️ يرجى تسجيل الدخول لاستخدام هذه الميزة');
});

test('x-i18n-5: أخطاء قراءة الملفّ والأرشيف في شريط المرفقات بلغة الواجهة (axChatcliAtt*)', async () => {
  const src = fnOf(A09, 'function omranAttTx(') + '\n' + fnOf(A09, 'async function fileToBase64(file){') + '\n' + fnOf(A09, 'async function processArchiveAttachment(file, attachment, preReadB64){')
    + '\nconst MAX_ARCHIVE_DIRECT_BYTES = 3 * 1024 * 1024;\nthis.f2b = fileToBase64; this.arc = processArchiveAttachment;';
  const mk = (over) => {
    const ctx = Object.assign({ t: fakeT(true), lang: 'fr', console: { error() {}, warn() {} }, btoa, renderAttachStrip() {}, authGet: () => '', unzipInBrowser: async () => { throw new Error('local'); } }, over);
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    return ctx;
  };
  const c = mk();
  await assert.rejects(c.f2b({ arrayBuffer: async () => { throw Object.assign(new Error('x'), { name: 'NotReadableError' }); } }), (e) => e.message === 'T:axChatcliAttReadFail' || (e.message.startsWith('T:axChatcliAttReadFail') && !AR_RE.test(e.message)));
  await assert.rejects(c.f2b({ arrayBuffer: async () => new ArrayBuffer(0) }), { message: 'T:axChatcliAttEmpty' });
  const att = {};
  await c.arc({ name: 'big.zip', size: 9 * 1048576 }, att);
  assert.ok(att.error && att.text.includes('T:axChatcliAttZipBig') && !AR_RE.test(att.text), 'حدّ الحجم: ' + att.text);
  const c2 = mk({ fetch: async () => ({ ok: false, status: 502, json: async () => ({}) }) });
  const att2 = {};
  await c2.arc({ name: 'p.zip', size: 10 }, att2, 'QUJD');
  assert.ok(att2.text.includes('T:axChatcliAttZipFail') && !AR_RE.test(att2.text), 'فشل الخادم: ' + att2.text);
  /* نصّ الخادم العربيّ الثابت لا يظهر لغير العربيّ (ولا للأرديّ): الدخول والحدّ اليوميّ بمفتاحيهما القائمين، وغيرهما فشل التحليل */
  for (const [status, key] of [[401, 'portraitNeedLogin'], [429, 'portraitLimitReached'], [400, 'axChatcliAttZipFail']]) {
    for (const lg of ['fr', 'ur']) {
      const cs = mk({ lang: lg, fetch: async () => ({ ok: false, status, json: async () => ({ error: 'نصّ الخادم العربيّ' }) }) });
      const a = {};
      await cs.arc({ name: 'p.zip', size: 10 }, a, 'QUJD');
      assert.ok(a.text.includes('T:' + key) && !a.text.includes('نصّ الخادم العربيّ'), lg + '/' + status + ': ' + a.text);
    }
  }
  const cAr = mk({ lang: 'ar', fetch: async () => ({ ok: false, status: 429, json: async () => ({ error: 'نصّ الخادم العربيّ' }) }) });
  const aAr = {};
  await cAr.arc({ name: 'p.zip', size: 10 }, aAr, 'QUJD');
  assert.ok(aAr.text.includes('نصّ الخادم العربيّ'), 'العربيّ يرى نصّ الخادم كما كان');
  /* بلا مفتاح: العربيّة كما كانت بأرقامها */
  const c3 = mk({ t: (k) => k });
  const att3 = {};
  await c3.arc({ name: 'big.zip', size: 9 * 1048576 }, att3);
  assert.ok(att3.text.includes('الملف 9.0 م.ب — الحد 3 م.ب للتحليل على الخادم'), att3.text);
});

test('x-i18n-5: المتفرّقات تُقرأ بمفاتيحها مع الاحتياط العربيّ — المحفظة، الدخول، الحظر، رسالة الإدارة، Gmail، المايك، نسخ الرابط', () => {
  const A13 = read('js/app-13-stocks-init.js'), A01 = read('js/app-01-boot-auth.js'), A12 = read('js/app-12-studios.js'), A08 = read('js/app-08-maha.js'), A10 = read('js/app-10-features.js');
  const want = [
    [A13, "confirm(pfT('axChatcliPfResetConfirm', 'تبدأ من جديد بـ 100 ألف افتراضية؟ محفظتك الحالية وصفقاتك ستُمسح.'))"],
    [A13, "pfT('axChatcliPfLessonLoading', '🎓 معلمك يجهز درسًا على {sym} بالأرقام الحية…').split('{sym}').join(sym)"],
    [A13, "pfT('axChatcliPfLessonFail', 'تعذر الدرس الآن — حاول بعد قليل.')"],
    /* الدخول والحظر ورسالة الإدارة صارت authMsg بمفاتيح axBoot* (cli-boot-6)، وتنبيه Gmail بمفاتيح axSearchEmLink* (srv-search-7) — نفس الإصلاح من مجموعتين */
    [A01, "alert(authMsg('axBootSecurityCheck'"],
    [A01, "authMsg('axBootAdminMsg'"],
    [A01, "authMsg('axBootBanned'"],
    [A12, "'axSearchEmLinkFailed'"],
    [A08, "'axChatcliMahaMicWarn'"],
    [A10, "'axChatcliCopyLinkPrompt'"],
  ];
  for (const [src, s] of want) assert.ok(src.includes(s), 'غائب: ' + s);
  /* لا يبقى النصّ العربيّ خارج احتياطه */
  assert.ok(!A13.includes("box.textContent = '🎓 معلمك"), 'المحفظة');
  assert.ok(!/alert\('تعذّر إكمال تسجيل الدخول/.test(A01) && !/alert\('📩 رسالة من الإدارة/.test(A01), 'الدخول والإدارة');
  assert.ok(!/alert\('⚠️ خطأ ربط Gmail: ' \+ err\)/.test(A12), 'Gmail');
  assert.ok(!A08.includes("st.textContent = '⚠️ صوتك ما يوصل — تحقق من المايك'"), 'المايك');
  assert.ok(!A10.includes("prompt('انسخ الرابط:', shareUrl)"), 'نسخ الرابط');
  /* تنبيه تحقّق جوجل يأتي في الإقلاع قبل القاموس (app-03/04) — يؤجَّل حتّى يجهز ملفّ اللغة */
  const i = A01.indexOf('axBootSecurityCheck');
  assert.ok(/setTimeout\(/.test(A01.slice(i - 400, i + 400)) && A01.slice(i - 400, i + 400).includes('loadLangFile'), 'مؤجَّل حتّى ملفّ اللغة');
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
