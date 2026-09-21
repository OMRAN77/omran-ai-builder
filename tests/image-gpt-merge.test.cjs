// tests/image-gpt-merge.test.cjs — v-gpt-multi-merge (٢١ سبتمبر ٢٠٢٦): دليل حيّ من المالك (دمج صورتين ناجح
// فعليًّا عبر تطبيق ChatGPT مباشرة) + توثيق OpenAI الحاليّ يثبتان أنّ images/edits لـgpt-image-2/2.5 يقبل حتى
// ١٦ صورة مرجعيّة، لا صورة واحدة كما افترض v-merge-identity-lock (كان صحيحًا لـgpt-image-1 القديم وحده). خطّ
// إنقاذ GPT في الخادم كان يُسقط صور الدمج (extras) صامتًا؛ ووضع «GPT/نانو الخام» بالعميل كان يرسل أوّل صورة
// فقط (imageAttachments[0]) بلا extraImages إطلاقًا. هذا الاختبار يثبت أنّ الاثنين صارا يحملان كلّ الصور.
// v-gpt-multi-merge-fix (٢١ سبتمبر ٢٠٢٦، لقطة المالك: «400 Duplicate parameter: 'image'»): الاختبار ١ عُدِّل
// — حقل `image` مكرَّر بنفس الاسم يرفضه gpt-image-2.5-sunburst فعليًّا؛ الصيغة الصحيحة لعدّة ملفّات هي `image[]`.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mi = read('api/_lib/maha-image.js');
const attach = read('js/app-09-attach.js');
const bundle = read('js/app.bundle.js');

test('١. الخادم: خطّ إنقاذ GPT يرسل صور الدمج (extras) لـgpt-image-2.5/2 بحقل image[]، لا gpt-image-1 القديم ولا image مكرَّرة', () => {
  const i = mi.indexOf("const __imgField = (extras.length && m !== 'gpt-image-1')");
  assert.ok(i > 0, 'حساب اسم الحقل موجود');
  const block = mi.slice(i, i + 800);
  assert.match(block, /const __imgField = \(extras\.length && m !== 'gpt-image-1'\) \? 'image\[\]' : 'image';/, 'الصورة الأساسيّة تستعمل image[] فقط حين توجد صور دمج، وimage مفردة غير ذلك');
  assert.match(block, /form\.append\(__imgField, new Blob\(\[bytes\]/, 'الصورة الأساسيّة تُرفق بالحقل المحسوب');
  assert.match(block, /if \(extras\.length && m !== 'gpt-image-1'\) \{/, 'يستثني gpt-image-1 من الصور المتعدّدة');
  assert.match(block, /for \(const x of extras\) form\.append\('image\[\]', new Blob\(\[Buffer\.from\(x\.data, 'base64'\)\]/, 'يرفق كلّ صورة إضافيّة بحقل image[] لا image مكرَّرة (كانت تسبّب 400 Duplicate parameter فعليًّا)');
});

test('٢. العميل: omModeRawImage يقبل مصفوفة صور ويبني extraImages من كلّ ما قبل الصورة الأخيرة', () => {
  for (const src of [attach, bundle]) {
    const i = src.indexOf('async function omModeRawImage');
    assert.ok(i > 0, 'الدالّة موجودة');
    const fn = src.slice(i, src.indexOf('\n}', src.indexOf('renderAll(); saveState();', i)));
    assert.match(fn, /const __atts = Array\.isArray\(imgAtts\) \? imgAtts\.filter\(a => a && a\.dataUrl\) : /, 'يقبل مصفوفة أو صورة واحدة (توافق قديم)');
    assert.match(fn, /__atts\[__atts\.length - 1\]/, 'آخر صورة هي الأساسيّة (نفس اتفاقية باقي التطبيق)');
    assert.match(fn, /omranShrinkForEdit\(\(__xa\.dataUrl \|\| ''\)\.split\(','\)\[1\] \|\| '', __xa\.mime \|\| 'image\/png', 1280\)/, 'يبني extraImages لكلّ صورة قبل الأخيرة');
    assert.match(fn, /if\(__extraImgs\)\{ __body\.extraImages = __extraImgs; \}/, 'يرسل extraImages للخادم');
  }
});

test('٣. نقطة الاستدعاء: وضع نانو/GPT الخام يمرّر كلّ الصور المرفقة لا الأولى وحدها', () => {
  for (const src of [attach, bundle]) {
    assert.match(src, /await omModeRawImage\(cur, text, thinkingDiv, window\.__omMode === 'image_gpt' \? 'gpt' : 'nano', imageAttachments\);/);
    assert.ok(!/await omModeRawImage\(cur, text, thinkingDiv, window\.__omMode === 'image_gpt' \? 'gpt' : 'nano', imageAttachments\[0\]\);/.test(src), 'لم يعد يمرّر أوّل صورة فقط');
  }
});
