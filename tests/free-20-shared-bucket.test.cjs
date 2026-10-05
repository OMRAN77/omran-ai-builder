// tests/free-20-shared-bucket.test.cjs — v-free-20-daily (أمر المالك: «المجاني ما يكلّفني
// شي، ٢٠ رسالة في اليوم»): مسارات المحادثة النصّية المستقلّة (groq.js/mistral.js/gemini.js/
// openrouter.js) كانت تعدّ كلّ مزوّد في سلّة منفصلة، فمسجَّل مجاني يقدر يضاعف سقفه اليوميّ
// بتبديل المزوّد (تعطيل الأدوات أو إرفاق صورة يهبطان على هذه المسارات مباشرة — انظر
// js/app-09-attach.js و callAIWithFallback في app-06-checkout.js). الآن checkAndConsume
// تقبل { chatBucket: true } فتُعدّ غير المشترك على سلّة 'chat' واحدة بغضّ النظر عن المزوّد،
// تمامًا كما يفعل chat.js (المسار الرئيسيّ) أصلًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-free-20-shared-bucket';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));

// ── Redis مزيّف داخل العملية: تخزين بسيط لعدّادات التعرفة، بلا شبكة ──
const store = new Map();
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (store.has(k) ? store.get(k) : null),
  kvPutJSON: async (k, v) => { store.set(k, v); },
  kvDel: async (k) => { store.delete(k); },
  kvIncr: async (k) => { const v = (store.get(k) || 0) + 1; store.set(k, v); return v; },
  kvExpire: async () => {},
});

// auth.js الحقيقيّ، لكن getUser (تبحث عن سجلّ غير موجود بـ٤ محاولات وتأخير متصاعد)
// تُستبدل بردّ فوريّ null — لا حساب حقيقيّ هنا، والسرعة لا تغيّر السلوك المختبَر.
const realAuth = require(rp('api/_lib/auth.js'));
stub('api/_lib/auth.js', Object.assign({}, realAuth, { getUser: async () => null }));
const { makeToken } = realAuth;
const { checkAndConsume } = require(rp('api/_lib/_usage.js'));

// الطبقة مُمرَّرة جاهزة (كما تفعل chat.js بـ{ tier: __tier }) لتفادي الاعتماد على
// سجلّ مستخدم حقيقيّ في Redis — إعادة محاولات getUser على حساب غير موجود بطيئة عمدًا.
const freeTier = { tier: 'free', plan: null, cap: 20, subscriber: false };

test('غير المشترك: تبديل المزوّد لا يضاعف سقف ٢٠ اليوميّ عند تمرير chatBucket', async () => {
  const token = makeToken('free-tester-1');
  // ١٩ رسالة على groq بسلّة 'chat' المشتركة تصل حتّى ١٩ مقبولة.
  for (let i = 0; i < 19; i++) {
    const u = await checkAndConsume(token, null, 'groq', '1.2.3.4', { chatBucket: true, tier: freeTier });
    assert.equal(u.allowed, true, 'رسالة ' + (i + 1) + ' على groq');
    assert.equal(u.tier, 'free');
  }
  // الرسالة العشرون (آخر المسموح) على مزوّد آخر — نفس السلّة، تُقبل.
  const u20 = await checkAndConsume(token, null, 'gemini', '1.2.3.4', { chatBucket: true, tier: freeTier });
  assert.equal(u20.allowed, true, 'الرسالة ٢٠ على مزوّد مختلف تستهلك السلّة نفسها');
  // الحادية والعشرون على مزوّد ثالث يجب أن تُرفض — لو كانت السلال منفصلة لمرّت.
  const u21 = await checkAndConsume(token, null, 'mistral', '1.2.3.4', { chatBucket: true, tier: freeTier });
  assert.equal(u21.allowed, false, 'بعد ٢٠ رسالة مجمّعة عبر المزوّدات يُرفض الطلب ولو بمزوّد لم يُستعمل بعد');
  assert.equal(u21.reason, 'limit');
  assert.equal(u21.tier, 'free');
  // ورابع مزوّد (openrouter) أيضًا مرفوض لنفس السبب.
  const u22 = await checkAndConsume(token, null, 'openrouter', '1.2.3.4', { chatBucket: true, tier: freeTier });
  assert.equal(u22.allowed, false);
});

test('مسارات أخرى بلا chatBucket تبقى بسلّتها المستقلّة (لا تمسّ الأدوات الأخرى)', async () => {
  const token = makeToken('free-tester-2');
  // استهلاك سلّة 'chat' المشتركة بالكامل (٢٠).
  for (let i = 0; i < 20; i++) {
    const u = await checkAndConsume(token, null, 'groq', '5.6.7.8', { chatBucket: true, tier: freeTier });
    assert.equal(u.allowed, true);
  }
  const blocked = await checkAndConsume(token, null, 'groq', '5.6.7.8', { chatBucket: true, tier: freeTier });
  assert.equal(blocked.allowed, false);
  // نداء بلا chatBucket (مثل card-extract.js/text-swap.js) على بروفايدر 'gemini' —
  // سلّة 'gemini' المستقلّة لم تُلمس بعد، فيُقبل رغم استنفاد سلّة 'chat'.
  const toolCall = await checkAndConsume(token, null, 'gemini', '5.6.7.8', { tier: freeTier });
  assert.equal(toolCall.allowed, true, 'أداة أخرى غير المحادثة النصّية لا تتأثّر بسلّة chat المشتركة');
});

test('المشترك: chatBucket = سلّة الباقة الواحدة plan — تبديل المزوّد لا يضاعف حدّه (v-model-lock، قرار المالك ٥ أكتوبر)', async () => {
  const subscriberTier = { tier: 'sub', plan: 'pro', cap: 100, subscriber: true };
  const token = makeToken('sub-tester-1');
  // نمرّر الطبقة جاهزة (كما تفعل chat.js) لتفادي الاعتماد على سجلّ مستخدم حقيقيّ.
  for (let i = 0; i < 5; i++) {
    const g = await checkAndConsume(token, null, 'groq', '9.9.9.9', { chatBucket: true, tier: subscriberTier });
    assert.equal(g.allowed, true);
  }
  // كانت لكلّ مزوّد سلّة («٥٠ رسالة» تتضاعف بعدد الروابط) — الآن سلّة واحدة: gemini يكمل من حيث توقّف groq.
  const geminiNext = await checkAndConsume(token, null, 'gemini', '9.9.9.9', { chatBucket: true, tier: subscriberTier });
  assert.equal(geminiNext.allowed, true);
  assert.equal(geminiNext.remaining, subscriberTier.cap - 6, 'سلّة واحدة للمشترك على كلّ الروابط');
  // وهي سلّة chat.js نفسها ('plan')
  const planNext = await checkAndConsume(token, null, 'plan', '9.9.9.9', { tier: subscriberTier });
  assert.equal(planNext.remaining, subscriberTier.cap - 7, 'chat.js والروابط المباشرة في السلّة نفسها');
});
