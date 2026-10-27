'use strict';
/* v-code-review-i18n (تدقيق ١٨ أكتوبر، g06/code-review وg06/work-tabs-menu):
   ١) نافذة «مراجعة الكود» (app-24) كلّ نصوصها عربيّة ثابتة — العنوان والأزرار والخانة والتنبيه والحالات وعرض الرقع والتطبيق —
      فتظهر عربيّة في الإنجليزيّ وبقيّة اللغات.
   ٢) قائمة ⋮: «مراجعة» وتلميحها في app-24، و«تعديل · حفظ · نسخ» في omranMoveCodeActionsToMenu (app-05) عربيّة ثابتة.
   القرار: مفاتيح cfx* وcodeReviewMenu/codeReviewTip وcodeBarEdit بالـ١٤ لغة، ومفاتيح قائمة (back · save · copyCode)؛
   تعليمة النموذج تبقى عربيّة (ليست واجهة). وسوم القائمة data-i18n فيحدّثها applyLanguage عند تبديل اللغة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const { makeDom, sseResponse } = require('./_mini-dom.cjs');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const A24 = read('js/app-24-codefix.js');
const A05 = read('js/app-05-ui.js');
const LAZY = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
const AR_RE = /[؀-ۿ]/;

const NEW_KEYS = ['codeReviewMenu', 'codeReviewTip', 'codeBarEdit',
  'cfxTitle', 'cfxPickFile', 'cfxCurCode', 'cfxAskLabel', 'cfxAskPh', 'cfxGo', 'cfxDisclaimer', 'cfxTooBig', 'cfxLines',
  'cfxNoCode', 'cfxNeedFile', 'cfxNeedAsk', 'cfxReading', 'cfxWriting', 'cfxNoPatch', 'cfxError', 'cfxMatchOne',
  'cfxMatchNone', 'cfxMatchMany', 'cfxPatch', 'cfxValidN', 'cfxRejectedN', 'cfxApply', 'cfxNotSaved', 'cfxBackToEdits',
  'cfxAppliedN', 'cfxSkippedN', 'cfxDownload', 'cfxToProject', 'cfxUndo', 'cfxNoProject', 'cfxMoved', 'cfxMoveFail',
  'cfxSyntaxOk', 'cfxJsonOk', 'cfxTagsBad', 'cfxTagsOk', 'cfxNoCheck'];
const PLACEHOLDERS = { cfxTooBig: ['{n}'], cfxLines: ['{n}'], cfxWriting: ['{n}'], cfxError: ['{msg}'], cfxMatchMany: ['{n}'],
  cfxValidN: ['{n}'], cfxRejectedN: ['{n}'], cfxAppliedN: ['{n}'], cfxSkippedN: ['{n}'], cfxTagsBad: ['{o}', '{c}'] };
/* مفاتيح قائمة بالـ١٤ لغة تستعملها النافذة والقائمة */
const OLD_KEYS = ['back', 'save', 'copyCode', 'closeTitle', 'chatFreeLimitMsg', 'chatGuestLimitMsg', 'plansWhyLimit',
  'tierUpgradeBtn', 'tierSignupBtn', 'pricingSectionTitle'];

const CORE = (() => {
  const DATA = read('js/app-03-i18n-data.js');
  const ast = acorn.parse(DATA, { ecmaVersion: 'latest', sourceType: 'script' });
  const parts = ast.body.filter((n) => (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === 'I18N'))
    || (n.type === 'ExpressionStatement' && DATA.slice(n.start, n.start + 18).startsWith('Object.assign(I18N'))).map((n) => DATA.slice(n.start, n.end));
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(parts.join('\n') + '\nthis.I18N = I18N;', sb);
  return sb.I18N;
})();
function lazy(lg) {
  const sb = { I18N: {} }; sb.window = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(read('i18n/' + lg + '.js'), sb);
  return Object.assign({}, CORE[lg] || {}, sb.I18N[lg]);
}
const DICT = { ar: CORE.ar, en: CORE.en };
for (const lg of LAZY) DICT[lg] = lazy(lg);
/* مرآة tRaw في app-04: اللغة ← الإنجليزيّة ← العربيّة ← المفتاح */
const tFor = (lg) => (k) => (DICT[lg][k] !== undefined ? DICT[lg][k] : (DICT.en[k] !== undefined ? DICT.en[k] : (DICT.ar[k] !== undefined ? DICT.ar[k] : k)));

const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };

function load(lg, opts = {}) {
  const { document } = makeDom();
  if (opts.menu) { const dd = document.createElement('div'); dd.id = 'tabsMenuDropdown'; document.body.appendChild(dd); }
  const ctx = {
    document, lang: lg, t: tFor(lg), console,
    sessionStorage: { getItem: () => '' }, localStorage: { getItem: () => '' },
    fetch: opts.fetch || (() => Promise.reject(new Error('no fetch'))),
    TextDecoder, TextEncoder, Intl, setTimeout, clearTimeout, setInterval, clearInterval,
    getCurrent: opts.getCurrent || (() => null),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(A24, ctx);
  return ctx;
}

const FILE = 'var a = 1;\nx();\nx();\n';
const PATCHES = '@@PATCH\n@@WHY rename a\n@@OLD\nvar a = 1;\n@@NEW\nvar a = 3;\n@@END\n'
  + '@@PATCH\n@@WHY ghost\n@@OLD\nvar zzz = 9;\n@@NEW\nvar zzz = 0;\n@@END\n'
  + '@@PATCH\n@@WHY twice\n@@OLD\nx();\n@@NEW\ny();\n@@END';

test('١. المفاتيح الجديدة بالـ١٤ لغة، غير فارغة، بعلاماتها ({n} {msg} {o} {c})، وغير العربيّة/الأرديّة بلا حرف عربيّ', () => {
  for (const lg of ['ar', 'en', ...LAZY]) {
    for (const k of NEW_KEYS) {
      const v = DICT[lg][k];
      assert.equal(typeof v, 'string', lg + ': ' + k + ' مفقود');
      assert.ok(v.trim().length > 0, lg + ': ' + k + ' فارغ');
      for (const ph of (PLACEHOLDERS[k] || [])) assert.ok(v.includes(ph), lg + ': ' + k + ' بلا ' + ph);
      if (lg !== 'ar' && lg !== 'ur') assert.ok(!AR_RE.test(v), lg + ': ' + k + ' فيه عربيّ: ' + v);
    }
    for (const k of OLD_KEYS) assert.equal(typeof DICT[lg][k], 'string', lg + ': المفتاح القائم ' + k);
  }
  /* العربيّة كما كانت حرفيًّا في النافذة والقائمة */
  assert.equal(DICT.ar.codeReviewMenu, 'مراجعة');
  assert.equal(DICT.ar.codeBarEdit, 'تعديل');
  assert.equal(DICT.ar.cfxNoPatch, 'لم يقترح النموذج أيّ تعديل.');
  assert.equal(DICT.ar.cfxTitle, 'مراجعة الكود');
});

test('٢. لا نصّ واجهة عربيّ ثابت في app-24: كلّ سلسلة عربيّة خارج تعليمة النموذج وكتلة الملفّ المرسَلة له ممنوعة', () => {
  const s = A24.indexOf('function buildInstruction(');
  const e = A24.indexOf('\n  }\n', s);
  assert.ok(s > 0 && e > s, 'buildInstruction');
  const bad = [];
  for (const tok of acorn.tokenizer(A24, { ecmaVersion: 'latest' })) {
    if (tok.type.label !== 'string' && tok.type.label !== 'template') continue;
    if (tok.start > s && tok.end < e) continue; /* تعليمة النموذج — ليست واجهة */
    const v = String(tok.value);
    if (v.indexOf('[الملفّ تحت المراجعة') === 0) continue; /* رأس كتلة الملفّ للنموذج */
    if (AR_RE.test(v)) bad.push(v.slice(0, 60));
  }
  assert.deepEqual(bad, [], 'سلاسل عربيّة ثابتة في واجهة المراجعة');
});

test('٣. النافذة كاملة بلغة الواجهة: الاختيار ثمّ الرقع ثمّ التطبيق ثمّ «لا تعديل» — بلا حرف عربيّ في ١٢ لغة، وبالإنجليزيّ نصوصها', async () => {
  for (const lg of ['en', ...LAZY.filter((l) => l !== 'ur')]) {
    const t = tFor(lg);
    let reply = PATCHES;
    const c = load(lg, { fetch: () => Promise.resolve(sseResponse([{ status: '…', k: 'stReading' }, { delta: reply }, { done: true }])) });
    const D = c.document;
    c.omranCodeFixOpenWith('app.js', FILE, 'fix it');
    const ov = D.getElementById('cfxOverlay');
    assert.ok(ov, lg + ': النافذة');
    const pick = D.allText(ov);
    assert.ok(!AR_RE.test(pick), lg + ': شاشة الاختيار فيها عربيّ: ' + (pick.match(/[؀-ۿ][^<"]*/) || [''])[0]);
    assert.ok(pick.includes(t('cfxTitle')) && pick.includes(t('cfxPickFile')) && pick.includes(t('cfxGo')), lg + ': العنوان والأزرار');
    assert.ok(pick.includes(t('cfxAskPh')) && pick.includes(t('cfxDisclaimer')), lg + ': الخانة والتنبيه');
    assert.ok(pick.includes(t('cfxLines').split('{n}').join('4')), lg + ': عدد الأسطر بجانب الاسم');

    D.getElementById('cfxGo').click();
    await settle();
    const patches = D.allText(ov);
    assert.ok(!AR_RE.test(patches), lg + ': عرض الرقع فيه عربيّ: ' + (patches.match(/[؀-ۿ][^<"]*/) || [''])[0]);
    assert.ok(patches.includes(t('cfxMatchOne')) && patches.includes(t('cfxMatchNone')) && patches.includes(t('cfxMatchMany').split('{n}').join('2')), lg + ': وسوم المطابقة');
    assert.ok(patches.includes(t('cfxApply')) && patches.includes(t('back')), lg + ': طبّق ورجوع');

    D.getElementById('cfxApply').click();
    const applied = D.allText(ov);
    assert.ok(!AR_RE.test(applied), lg + ': شاشة التطبيق فيها عربيّ: ' + (applied.match(/[؀-ۿ][^<"]*/) || [''])[0]);
    assert.ok(applied.includes(t('cfxAppliedN').split('{n}').join('1')) && applied.includes(t('cfxSyntaxOk')), lg + ': عدد المطبَّق والفحص');
    assert.ok(applied.includes(t('cfxDownload')) && applied.includes(t('cfxToProject')) && applied.includes(t('cfxUndo')), lg + ': أزرار ما بعد التطبيق');
    D.getElementById('cfxToProj').click(); /* لا مشروع مفتوح */
    assert.equal(D.getElementById('cfxStatus').textContent, t('cfxNoProject'), lg + ': سطر الحالة');

    reply = '@@NONE nothing to change';
    D.getElementById('cfxUndo').click();
    D.getElementById('cfxBack').click();
    D.getElementById('cfxGo').click();
    await settle();
    const none = D.allText(ov);
    assert.ok(!AR_RE.test(none), lg + ': «لا تعديل» فيه عربيّ: ' + (none.match(/[؀-ۿ][^<"]*/) || [''])[0]);
    assert.ok(none.includes(t('cfxNoPatch')), lg + ': «لا تعديل» بلغته');
  }
});

test('٤. زرّ «مراجعة» في قائمة ⋮ بلغة الواجهة ويتبع تبديلها (data-i18n / data-i18n-title)', () => {
  for (const lg of ['en', 'fr', 'zh']) {
    const c = load(lg, { menu: true });
    const b = c.document.getElementById('btnCodeFix');
    assert.ok(b, lg + ': الزرّ في القائمة');
    assert.equal(b.title, tFor(lg)('codeReviewTip'));
    assert.equal(b.getAttribute('data-i18n-title'), 'codeReviewTip');
    assert.ok(b.innerHTML.includes('data-i18n="codeReviewMenu"') && b.innerHTML.includes('>' + tFor(lg)('codeReviewMenu') + '<'), lg + ': الوسم');
    assert.ok(!AR_RE.test(b.innerHTML + b.title), lg + ': بلا عربيّ');
  }
  const ar = load('ar', { menu: true }).document.getElementById('btnCodeFix');
  assert.ok(ar.innerHTML.includes('>مراجعة<') && ar.title === 'مراجعة الكود بالذكاء الاصطناعي', 'العربيّة كما كانت');
});

function moveFn() {
  const head = 'window.omranMoveCodeActionsToMenu = function(){';
  const i = A05.indexOf(head);
  assert.ok(i > 0, 'omranMoveCodeActionsToMenu');
  let depth = 0;
  for (let k = A05.indexOf('{', i); k < A05.length; k++) {
    if (A05[k] === '{') depth++;
    else if (A05[k] === '}' && --depth === 0) return A05.slice(i, k + 1) + ';';
  }
  throw new Error('غير مغلق');
}

test('٥. «تعديل · حفظ · نسخ» المنقولة إلى ⋮ بلغة الواجهة، موسومة data-i18n، والعربيّة كما هي', () => {
  for (const [lg, want] of [['en', ['Edit', 'Save', 'Copy']], ['ar', ['تعديل', 'حفظ', 'نسخ']], ['fr', null], ['ru', null]]) {
    const { document } = makeDom();
    const dd = document.createElement('div'); dd.id = 'tabsMenuDropdown'; document.body.appendChild(dd);
    const bar = document.createElement('div'); bar.id = 'omranCodeViewerBar'; document.body.appendChild(bar);
    for (let i = 0; i < 3; i++) bar.appendChild(document.createElement('button'));
    const cp = document.createElement('button'); cp.id = 'waCopyBtn'; document.body.appendChild(cp);
    const ctx = { document, lang: lg, t: tFor(lg), console };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(moveFn() + '\nwindow.omranMoveCodeActionsToMenu();', ctx);
    const labels = dd.querySelectorAll('.btnLabel');
    assert.equal(labels.length, 3, lg + ': ثلاثة وسوم');
    const got = labels.map((s) => s.textContent);
    const exp = want || [tFor(lg)('codeBarEdit'), tFor(lg)('save'), tFor(lg)('copyCode')];
    assert.deepEqual(got, exp, lg + ': نصوص القائمة');
    assert.deepEqual(labels.map((s) => s.getAttribute('data-i18n')), ['codeBarEdit', 'save', 'copyCode'], lg + ': data-i18n');
    if (lg !== 'ar') assert.ok(!got.some((x) => AR_RE.test(x)), lg + ': بلا عربيّ');
  }
});
