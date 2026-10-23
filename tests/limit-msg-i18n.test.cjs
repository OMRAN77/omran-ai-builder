// tests/limit-msg-i18n.test.cjs — v-limit-msg-i18n (تدقيق ١٨–١٩ أكتوبر، g03/g04/g05/g06/g12): ردّ نفاد الرسائل المجّانيّة أو التجربة
// نصّ عربيّ ثابت من الخادم (tier.js FREE_TEXT) يُحفظ محتوى الرسالة كما هو، فيظهر عربيًّا في الواجهة الإنجليزيّة والفرنسيّة…،
// والشارة فوقه ثنائيّة ar/en (الأردو تأخذ العربيّ، والعشر الباقية الإنجليزيّ). ومسار البناء القديم يكتب للمجّانيّ «وصلت حدّ باقتك»
// ويفتح الباقات بالسطر نفسه — الحدّ نفسه بنصّين.
// الآن: الترجمة عند العرض في العميل وحده (نصّ الخادم وترتيب إرساله كما هما — tiers ‏١٩٤): العربيّة تبقى بنصّ الخادم بأرقامه،
// وبقيّة اللغات بمفتاح بلا أرقام فلا يخالف السقوف أبدًا. والشارة وزرّها بمفاتيح t() بالـ١٤ لغة (العربيّ والإنجليزيّ كما كانا حرفًا).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
const ALL = ['ar', 'en'].concat(LANGS);
const KEYS = ['chatFreeLimitMsg', 'chatGuestLimitMsg', 'tierFreeReply', 'tierFreeLimitTitle', 'tierGuestLimitTitle', 'tierUpgradeBtn', 'tierSignupBtn', 'spendConfirm'];
const ARABIC = /[؀-ۿ]/;
const DIGITS = /[0-9٠-٩۰-۹०-९০-৯൦-൯]/;
const PROV = /gemini|google|openai|gpt|claude|anthropic|groq|mistral|deepseek|grok|جيمناي|جيميني|كلود|غروق/i;
const SERVER_FREE = 'انتهت رسائلك المجانية لليوم. اشترك لترفع حدّك إلى 50–250 رسالة يوميًّا بالنسخة الاحترافية.';
const SERVER_GUEST = 'سجّل حسابًا مجانيًّا لتبدأ الدردشة: 20 رسالة في أوّل يوم، ثمّ 3 يوميًّا، و٧٠ نقطة ترحيب.';

function dicts() {
  const ctx = { $: () => null, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const a3 = read('js/app-03-i18n-data.js').replace(/^const (codeEl|previewFrame|emptyState|historyEl) = .*$/mg, '');
  vm.runInContext(a3 + '\n;this.I18N = I18N;', ctx);
  for (const l of LANGS) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  const I = ctx.I18N;
  const out = { ar: I.ar, en: I.en, own: {} };
  for (const l of LANGS) { out[l] = Object.assign({}, I.en, I[l]); out.own[l] = I[l]; }
  return out;
}
const D = dicts();
const tFor = (l) => (k) => (D[l][k] !== undefined ? D[l][k] : k);

test('١. المفاتيح الثمانية بالـ١٤ لغة: مترجمة في ملفّ كلّ لغة، بلا أرقام ولا اسم مزوّد', () => {
  for (const k of KEYS) {
    for (const l of ALL) {
      const v = String(D[l][k] || '');
      assert.ok(v.trim().length > 1, l + ': ' + k + ' فارغ');
      assert.doesNotMatch(v, PROV, l + ': ' + k + ' فيه اسم مزوّد');
      if (k === 'spendConfirm') {
        assert.equal(v.split('{n}').length, 2, l + ': spendConfirm بموضع {n} واحد');
        assert.doesNotMatch(v.replace('{n}', ''), DIGITS, l + ': spendConfirm بلا رقم ثابت');
      } else {
        assert.doesNotMatch(v, DIGITS, l + ': ' + k + ' بلا أرقام (السقوف من الخادم وحده)');
      }
      if (LANGS.includes(l)) {
        assert.ok(D.own[l][k], l + ': ' + k + ' غير موجود في i18n/' + l + '.js');
        assert.notEqual(D.own[l][k], D.en[k], l + ': ' + k + ' منسوخ من الإنجليزيّ');
      }
      if (l !== 'ar' && l !== 'ur') assert.doesNotMatch(v, ARABIC, l + ': ' + k + ' فيه عربيّ');
    }
  }
  // العربيّ والإنجليزيّ للشارة كما كانا حرفًا قبل الإصلاح
  assert.deepEqual([D.ar.tierFreeReply, D.ar.tierFreeLimitTitle, D.ar.tierGuestLimitTitle, D.ar.tierUpgradeBtn, D.ar.tierSignupBtn],
    ['ردّ مجاني', 'انتهت الرسائل المجانية لليوم', 'انتهت رسائل التجربة', 'اشترك للنسخة الاحترافية', 'سجّل مجانًا']);
  assert.deepEqual([D.en.tierFreeReply, D.en.tierFreeLimitTitle, D.en.tierGuestLimitTitle, D.en.tierUpgradeBtn, D.en.tierSignupBtn],
    ['Free reply', 'Free messages used up for today', 'Trial messages used up', 'Upgrade to Pro', 'Sign up free']);
});

function helper(l) {
  const a4 = read('js/app-04-i18n-state.js');
  const s = a4.indexOf('function omranTierLimitText(');
  assert.ok(s > 0, 'omranTierLimitText غير موجودة في app-04');
  const src = a4.slice(s, a4.indexOf('\n}\n', s) + 3);
  const ctx = { lang: l, t: tFor(l), String };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.omranTierLimitText;
}

test('٢. omranTierLimitText: العربيّة بنصّ الخادم، وكلّ لغة أخرى بمفتاحها بلا عربيّ', () => {
  const ar = helper('ar');
  assert.equal(ar({ role: 'assistant', tier: 'free-limit', content: SERVER_FREE }), SERVER_FREE);
  assert.equal(ar({ role: 'assistant', tier: 'guest-limit', content: SERVER_GUEST }), SERVER_GUEST);
  for (const l of ['en'].concat(LANGS)) {
    const f = helper(l);
    const free = f({ role: 'assistant', tier: 'free-limit', content: SERVER_FREE });
    const guest = f({ role: 'assistant', tier: 'guest-limit', content: SERVER_GUEST });
    assert.equal(free, D[l].chatFreeLimitMsg, l + ': free-limit');
    assert.equal(guest, D[l].chatGuestLimitMsg, l + ': guest-limit');
    if (l !== 'ur') { assert.doesNotMatch(free, ARABIC, l); assert.doesNotMatch(guest, ARABIC, l); }
    // ردّ مجّانيّ عاديّ (tier: free) نصّ نموذج — لا يُستبدل
    assert.equal(f({ role: 'assistant', tier: 'free', content: 'Hi there' }), 'Hi there', l + ': ردّ عاديّ');
    assert.equal(f({ role: 'assistant', content: 'plain' }), 'plain', l + ': بلا طبقة');
  }
});

// الشارة فوق الردّ في DOM مزيّف: العنوان والزرّ من t() لكلّ لغة
function badge(l, tier) {
  const a4 = read('js/app-04-i18n-state.js');
  const s = a4.indexOf("if(m.role !== 'user' && (m.tier === 'free' || m.tier === 'free-limit'");
  const e = a4.indexOf("const textDiv = document.createElement('div');", s);
  assert.ok(s > 0 && e > s, 'كتلة الشارة');
  const block = a4.slice(s, e);
  const mk = (tag) => ({ tag, children: [], style: {}, textContent: '', appendChild(c) { this.children.push(c); return c; } });
  const div = mk('div');
  const ctx = { lang: l, t: tFor(l), m: { role: 'assistant', tier, content: 'x' }, div, document: { createElement: mk, getElementById: () => null }, __swallow(e) { throw e; }, openCheckout() {} };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  const tb = div.children[0];
  return { title: tb.children[0].textContent, btn: tb.children[1].textContent, block };
}

test('٣. الشارة وزرّها بمفاتيح الـ١٤ لغة لا ثنائيّة __isArT (الأردو كانت تأخذ العربيّ، والعشر الإنجليزيّ)', () => {
  const { block } = badge('en', 'free');
  assert.doesNotMatch(block, /__isArT/, 'لا ثنائيّة ar/en في كتلة الشارة');
  assert.doesNotMatch(block, /'[^'\n]*[؀-ۿ][^'\n]*'/, 'لا نصّ عربيّ ثابت في الكتلة');
  for (const l of ALL) {
    assert.deepEqual(Object.values(badge(l, 'free')).slice(0, 2), [D[l].tierFreeReply, D[l].tierUpgradeBtn], l + ': free');
    assert.deepEqual(Object.values(badge(l, 'free-limit')).slice(0, 2), [D[l].tierFreeLimitTitle, D[l].tierUpgradeBtn], l + ': free-limit');
    assert.deepEqual(Object.values(badge(l, 'guest-limit')).slice(0, 2), [D[l].tierGuestLimitTitle, D[l].tierSignupBtn], l + ': guest-limit');
    assert.deepEqual(Object.values(badge(l, 'guest')).slice(0, 2), [D[l].tierFreeReply, D[l].tierSignupBtn], l + ': guest');
  }
  assert.equal(badge('ur', 'free-limit').title, D.own.ur.tierFreeLimitTitle, 'الأردو بنصّها لا العربيّ');
  assert.equal(badge('fr', 'free-limit').btn, D.own.fr.tierUpgradeBtn, 'الفرنسيّة بنصّها لا الإنجليزيّ');
});

test('٤. جسم الفقاعة يمرّ بالمساعد، وفرع حدّ البناء القديم يأخذ نصّ المجّانيّ وطبقته، والباقات بالسطر نفسه للمجّانيّ', () => {
  const a4 = read('js/app-04-i18n-state.js');
  assert.match(a4, /let __mc = \(m\.role !== 'user'\) \? omranTierLimitText\(m\) : m\.content, __genShown = null;/, 'renderMessages: الجسم من omranTierLimitText');
  const a9 = read('js/app-09-attach.js');
  const s = a9.indexOf('} else if(err && err.planLimit){');
  const blk = a9.slice(s, a9.indexOf('} else {', s));
  assert.match(blk, /cur\.messages\.push\(omranPlanLimitMsg\(err\)\);/, 'فرع planLimit: رسالته من omranPlanLimitMsg');
  const h = a9.indexOf('function omranPlanLimitMsg(err){');
  assert.ok(h > 0, 'omranPlanLimitMsg في app-09');
  const helperSrc = a9.slice(h, a9.indexOf('\n}\n', h) + 3);
  // الفرع الحقيقيّ ومساعده في vm: المجّانيّ ← نصّه وطبقته (فيأخذ الشارة نفسها)، والضيف ← نصّه، والمشترك ← «وصلت حدّ باقتك» كما كان
  const run = (err, plan) => {
    const cur = { messages: [] }; const opened = [];
    const ctx = { err, cur, t: (k) => '«' + k + '»', window: { __omranPlan: plan, omranOpenPlans: (a, b) => opened.push([a, b]) }, __swallow(e) { throw e; } };
    vm.createContext(ctx);
    vm.runInContext(helperSrc + '\nif(false){' + blk + '}', ctx);
    return { msg: cur.messages[0], opened };
  };
  let r = run({ planLimit: true, limitTier: 'free' }, '');
  assert.deepEqual([r.msg.content, r.msg.tier], ['«chatFreeLimitMsg»', 'free-limit']);
  assert.deepEqual(r.opened, [['limit', 'chat']]);
  r = run({ planLimit: true }, 'free');
  assert.deepEqual([r.msg.content, r.msg.tier], ['«chatFreeLimitMsg»', 'free-limit'], 'بلا طبقة في الجسم: باقة الواجهة');
  r = run({ planLimit: true, limitTier: 'guest' }, '');
  assert.deepEqual([r.msg.content, r.msg.tier], ['«chatGuestLimitMsg»', 'guest-limit']);
  r = run({ planLimit: true, limitTier: 'sub' }, 'pro');
  assert.deepEqual([r.msg.content, r.msg.tier], ['⚠️ «plansWhyLimit»', undefined], 'المشترك كما كان');
  r = run({ planLimit: true, subscribeOnly: true, limitTier: 'free' }, 'free');
  assert.deepEqual([r.msg.content, r.msg.tier], ['⚠️ «plansWhyLimit»', undefined], 'رفض المدفوع ثمّ فشل المجّانيّين ليس نفادًا — السطر القديم');
  // سطر السبب في الباقات: المجّانيّ يأخذ المفتاح نفسه
  const a33 = read('js/app-33-plans-gate.js');
  const part = (from, to) => { const i = a33.indexOf(from); assert.ok(i > 0, from); return a33.slice(i, a33.indexOf(to, i) + to.length); };
  const why = (plan, reason) => {
    const ctx = { window: { __omranPlan: plan }, t: (k) => '«' + k + '»', String, Object };
    vm.createContext(ctx);
    vm.runInContext(part('var WHY = ', '};') + '\n' + part('function fill(', '\n  }') + '\n' + part('function whyText(', '\n  }') + '\n' + part('function pointsWhy(', '\n  }'), ctx); // الدفعة ١: whyText ينادي pointsWhy للنقاط
    return ctx.whyText(reason, {});
  };
  assert.equal(why('free', 'limit'), '«chatFreeLimitMsg»', 'app-33: سطر السبب للمجّانيّ = نصّ الفقاعة');
  assert.equal(why('pro', 'limit'), '«plansWhyLimit»', 'المشترك كما كان');
  assert.equal(why('', 'limit'), '«plansWhyLimit»', 'باقة غير معروفة كما كان');
  assert.equal(why('free', 'points'), '«plansWhyPoints»', 'النقاط كما كانت');
});
