// tests/perf-auth-hang.test.cjs — v-perf-boot-defer (المالك ٢٩ سبتمبر: «مادخل ويتأخر عند الدخول اول شي»).
// جذران في js/app-01-boot-auth.js:
// ١) tabLogin.parentElement بلا فحص null — لو partials-core.js فشل تحميله، استثناء غير ملتقَط يوقف
//    باقي أجزاء الحزمة الملصَقة بعد هذا الملف بالكامل (app-02 إلى app-41).
// ٢) ستّة نداءات fetch في تدفّق الدخول (تسجيل/دخول، إعادة تعيين، نسيت كلمة المرور، رمز إعادة التعيين،
//    verify، oauth-claim آيفون) بلا أيّ مهلة — تعليق شبكة صامت (شائع بالجوّال) يترك الزرّ معطّلًا للأبد
//    بلا رسالة، أو busy=true للأبد في جسر جوجل على آيفون.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SRC = fs.readFileSync('js/app-01-boot-auth.js', 'utf8');

test('١. عناصر مودال الدخول مفحوصة قبل .parentElement، وauthSystem محاط بحماية إضافيّة', () => {
  const guardIdx = SRC.indexOf("if(!overlay || !tabLogin || !tabSignup || !submitBtn){");
  const tabsRowIdx = SRC.indexOf('const tabsRow = tabLogin.parentElement;');
  assert.ok(guardIdx > 0 && tabsRowIdx > guardIdx, 'الحارس يسبق القراءة غير الآمنة');
  assert.match(SRC, /window\.__swallow\(new Error\('auth modal elements missing/, 'الغياب يُسجَّل لا يُرمى بصمت');
  assert.match(SRC, /try\{\n\(function authSystem\(\)\{/, 'authSystem() محاط بـtry من الخارج');
  assert.match(SRC, /\}catch\(e\)\{ window\.__swallow\(e, 'authSystem:uncaught'\); \}/, 'ومحاط بـcatch لا يوقف بقيّة الحزمة');
});

test('٢. الستّة نداءات في تدفّق الدخول كلّها بمهلة زمنيّة (AbortSignal.timeout)', () => {
  const actions = ["action: 'reset'", "action: 'forgotPassword'", "action: 'resetWithToken'", 'action: mode,', "action: 'verify'", "action=oauth-claim"];
  for (const marker of actions) {
    const i = SRC.indexOf(marker);
    assert.ok(i > 0, marker + ' موجود');
    const chunk = SRC.slice(i, i + 400);
    assert.match(chunk, /signal: AbortSignal\.timeout\(\d+\)/, marker + ': بلا مهلة زمنيّة');
  }
});

test('٣. زرّ الدخول يعرض نصّ انتظار ويعيد النصّ الأصليّ في كلّ فرع (لا يبقى ساكنًا بصمت)', () => {
  assert.match(SRC, /const submitBtnLabel = submitBtn\.textContent;/, 'النصّ الأصليّ يُحفَظ مرّة واحدة');
  const setCount = (SRC.match(/submitBtn\.textContent = isEn \? '[^']*' : '[^']*…';/g) || []).length;
  const restoreCount = (SRC.match(/submitBtn\.textContent = submitBtnLabel;/g) || []).length;
  assert.equal(setCount, 4, 'نصّ الانتظار في الفروع الأربعة (reset/forgotEmail/resetToken/login-signup)');
  assert.equal(restoreCount, 4, 'واستعادة النصّ في finally الأربعة كلّها');
});

test('٤. جسر جوجل على آيفون: busy=false مضمونة حتّى مع تعليق الشبكة (مهلة على oauth-claim)', () => {
  const i = SRC.indexOf("action=oauth-claim");
  const chunk = SRC.slice(i, i + 1000);
  assert.match(chunk, /signal: AbortSignal\.timeout\(\d+\)/);
  assert.match(chunk, /\bbusy = false;\n\s*\}\n/, 'busy=false بعد try/catch — تصل دائمًا لأنّ الجلب يستقرّ الآن');
});

test('٥. prefillAccountFields لم يعد يُستدعى عند DOMContentLoaded (نداء شبكة إضافيّ للوحة مخفيّة)، ويبقى عند فتح الإعدادات', () => {
  assert.doesNotMatch(SRC, /document\.addEventListener\('DOMContentLoaded', prefillAccountFields\)/, 'أُزيل نداء الإقلاع');
  assert.match(SRC, /settingsBtnForAcct\.addEventListener\('click', prefillAccountFields\)/, 'نداء الفتح الفعليّ باقٍ');
});

test('٦. memoryLoad(): نداءان متزامنان يتشاركان وعدًا واحدًا فيصدران نداء شبكة واحدًا لا اثنين', async () => {
  const m = /let __memoryLoadPromise = null;\n  async function memoryLoad\(\)\{[\s\S]*?\n  \}\n  function memoryUpdate/.exec(SRC);
  assert.ok(m, 'دالّة memoryLoad موجودة بالشكل المتوقَّع');
  const fnSrc = m[0].replace(/\n  function memoryUpdate$/, '');
  let fetchCalls = 0;
  const ctx = {
    authGet: () => 'test-token',
    __swallow: () => {},
    fetch: async () => { fetchCalls++; await new Promise((r) => setTimeout(r, 5)); return { ok: true, json: async () => ({ memory: 'm', topics: [] }) }; },
    userMemory: '', userTopics: [],
    run: null,
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc + '\nrun = () => Promise.all([memoryLoad(), memoryLoad()]);', ctx);
  await ctx.run();
  assert.equal(fetchCalls, 1, 'نداءان متزامنان = نداء شبكة واحد فقط (لا تزاحم مع verify عند الإقلاع)');
  assert.equal(ctx.userMemory, 'm');
  // بعد اكتمال الأوّل، نداء جديد لاحق يفتح وعدًا جديدًا (لا يعلق للأبد)
  await ctx.run();
  assert.equal(fetchCalls, 2, 'نداء لاحق منفصل يصدر طلبًا جديدًا');
});
