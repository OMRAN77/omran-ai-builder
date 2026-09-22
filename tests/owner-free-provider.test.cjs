'use strict';
/* v-owner-free (أمر المالك ٢٢ سبتمبر): «ما عندي حرّيّة الاستخدام في المزوّدين؟ … الصلاحيّة التامّة لي —
   أنا صاحب التطبيق». للمالك وحده: المزوّد الذي يختاره هو الذي يردّ (لا تحويل قسريّ إلى كلود
   للبناء/الإصلاح/الرؤية، ولا قفل خيط)، والاحتياط المجّانيّ على الخادم خام كالمسار الرئيسيّ.
   غير المالك لا يتغيّر عنده شيء. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

const attach = fs.readFileSync('js/app-09-attach.js', 'utf8');
const checkout = fs.readFileSync('js/app-06-checkout.js', 'utf8');
const bundle = fs.readFileSync('js/app.bundle.js', 'utf8');
const chat = fs.readFileSync('api/_lib/chat.js', 'utf8');

test('العميل: للمالك المزوّد المختار يردّ — بلا تحويل قسريّ ولا قفل ولا تجاوز رؤية', () => {
  for (const s of [attach, bundle]) {
    assert.ok(s.includes("const __ownerFree = (typeof omranOwnerUi === 'function' && omranOwnerUi());"), 'العلم');
    assert.ok(s.includes("const __respectExplicit = __ownerFree || (!__provUiHidden() && !!localStorage.getItem('aiapp_provider_explicit'));"), 'الاختيار الصريح = المالك');
    assert.ok(s.includes('const __visionOverride = (!__ownerFree && imageAttachments.length && text && '), 'لا تجاوز رؤية للمالك');
    assert.ok(s.includes('var __pinProv = __ownerFree;'), 'التثبيت = المالك');
    assert.ok(s.includes("const __effProv0 = (!__pinProv && (__gateNoBuild || __routeFix)) ? 'claude' : (__visionOverride || __specProv || __selProv);"), 'قرار المزوّد كما هو لغير المالك');
  }
});

test('قفل الخيط: الاختيار الصريح (المالك) يتجاوزه، وغير المالك يبقى مقفولًا', () => {
  const start = checkout.indexOf('function __convLockProvider');
  const end = checkout.indexOf('// ٦ قواعد التوجيه');
  assert.ok(start > 0 && end > start);
  const ctx = { __swallow() {}, saveState() {} };
  vm.runInNewContext(checkout.slice(start, end) + '\nthis.lock = __convLockProvider;', ctx);
  const conv = { aiProvider: 'claude' };
  assert.equal(ctx.lock(conv, 'openai', false, true, false), 'openai', 'المالك: اختياره يغلب القفل');
  assert.equal(ctx.lock(conv, 'openai', false, false, false), 'claude', 'غير المالك: الخيط مقفول على أوّل مزوّد');
});

test('الخادم: الاحتياط المجّانيّ خام للمالك المتحقَّق منه (بلا بصمة ولا ملاحظة الوضع المجّانيّ)', () => {
  assert.ok(chat.includes("const __fb = await streamFreeChain({ system: __rawOwner ? '' : PERSONA_NOTE + '\\n' + baseSystem + nowNote(body && body.tz), raw: __rawOwner, convo, send, requireVision: lastUserHasImage });"));
  assert.ok(chat.includes('const __rawOwner = __ownerReq && !(body && body.raw === false);'), 'الخام للمالك كما في v-owner-raw2، بتوثيق الرمز على الخادم');
  const fc = fs.readFileSync('api/_lib/free-chain.js', 'utf8');
  assert.ok(fc.includes("const system = args.raw ? '' : String(args.system || '') + FREE_NOTE;"));
  const { toOpenAIMessages } = require('../api/_lib/free-chain.js');
  const convo = [{ role: 'user', content: 'انته اي محرك' }];
  assert.equal(toOpenAIMessages('', convo, false).filter((m) => m.role === 'system').length, 0, 'نظام فارغ = لا رسالة نظام');
  assert.equal(toOpenAIMessages('x', convo, false).filter((m) => m.role === 'system').length, 1);
});
