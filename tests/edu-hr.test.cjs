// tests/edu-hr.test.cjs — v-edu-hr (تدقيق ١٨–١٩ أكتوبر «ردّ المعلّم يعرض --- كنصّ»؛ الدفعة ٤، من حزمة b9 في ten-a):
// md() في js/edu.js (ملخّص الدرس وردّ المعلّم) يرسم سطر «---» (أو *** أو ___) فراغًا لا نصًّا خامًا ولا خطًّا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'edu.js'), 'utf8');
const s = src.indexOf('function md(src){');
const e = src.indexOf('\n}\n', s) + 3;
const ctx = { esc: (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), mathHtml: (x) => x, String };
vm.createContext(ctx);
vm.runInContext(src.slice(s, e) + '\nthis.md = md;', ctx);

test('١. «---» و«***» و«___» فراغ لا نصّ، وما حولها كما هو', () => {
  for (const sep of ['---', '***', '___', '-----']) {
    const html = ctx.md('أوّلًا\n' + sep + '\nثانيًا');
    assert.doesNotMatch(html, /---|\*\*\*|___/, sep);
    assert.match(html, /<div class="eduGap" style="height:10px"><\/div>/, sep);
    assert.match(html, /<p>أوّلًا<\/p><div class="eduGap"[^>]*><\/div><p>ثانيًا<\/p>/, sep);
  }
});

test('٢. القائمة بشرطة ونقطتين لا تُعدّ فاصلًا، والعنوان والعريض كما كانا', () => {
  assert.match(ctx.md('- بند'), /<ul><li>بند<\/li><\/ul>/);
  assert.match(ctx.md('-- نصّ'), /<p>-- نصّ<\/p>/);
  assert.match(ctx.md('## عنوان\n**مهمّ**'), /<h4>عنوان<\/h4><p><b>مهمّ<\/b><\/p>/);
});
