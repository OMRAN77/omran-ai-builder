'use strict';
/* v-religion-chain + v-religion-paint + v-religion-race + v-religion-tabs + v-religion-field — المالك ١٧ أكتوبر بعد فحص «التفسير الديني»:
   «صلح الثلاث… اريده نفس قبل… الديانات كلها نفس قبل ومااريد ازرار زياده»، و«التبويبات يصير نفس فسّر» (بالضبط، بلا فرق للمختار)،
   ومكان الكتابة «مايكون مربع… علو نفس المستوى» بلا أصفر، ومن إضافاتي اختار: مسار المزوّد لحسابه، الحقل يطول، الميكروفون دائرة،
   والإغلاق يوقف الطلب.
   ١) موجّه التبويب يصل كلّ مزوّد (Kimi كان يُنزع)، والمالك على السلسلة القديمة نفسها لا مسار المحادثة بمنهج المستودع.
   ٢) النتيجة تُرسم بعارض المحادثة (لا «##» و«**» خامًا).  ٣) تغيير التبويب أو الإغلاق أثناء الكتابة يلغي الطلب ولا يكتب «تم» بلا شيء.
   ٤) التبويبات بصنف «فسّر» نفسه و«فسّر» كما هو.  ٥) الحقل بزوايا «فسّر» وارتفاعه ويطول مع النصّ، والميكروفون دائرة بالارتفاع نفسه. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const slice = (src, from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, 'مقطع: ' + from); return src.slice(a, b); };

const CO = read('js/app-06-checkout.js');
const ST = read('js/app-12-studios.js');
const ROUTING = slice(CO, 'const TOOL_PROVIDERS', 'async function callAI(messages)')
  + slice(CO, '// Providers tried in order', '// v262 — 🎯 مصنّف التخصص')
  + slice(CO, 'var __FALLBACK_IDLE_MS', '// ⚠️ ٦ أغسطس');
const GROUPS = slice(read('js/app-05-ui.js'), 'const FUNCTIONAL_GROUPS = {', 'function funcPrimaryOf');
const RELIGION = slice(ST, '/* ---------- 🕌 Religious Insights', '/* ---------- 📧 AI Email Assistant');
const DREAM = (RELIGION.match(/\n\s*dream: '([^']+)'/) || [])[1];

/* سياق التوجيه الحقيقيّ: كلّ مزوّد دالّة تسجّل ما وصلها */
function routingCtx(owner, sel) {
  const seen = {};
  const store = { aiapp_provider: sel };
  const mk = (k) => async (messages) => { seen[k] = messages; return 'تفسير تجريبيّ كامل.'; };
  const ctx = {
    console, Date, setInterval, clearInterval, setTimeout, clearTimeout, Promise, Error, String, Number, Object, Array, JSON,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    window: {}, t: (k) => k, __swallow() {}, functionalLabel: (k) => k, genAbortController: null, lang: 'ar',
    omranOwnerUi: () => owner,
    callGemini: mk('gemini'), callGroq: mk('groq'), callClaude: mk('claude'), callOpenRouter: mk('openrouter'),
    callPerplexity: mk('perplexity'), callMistral: mk('mistral'), callDeepSeek: mk('deepseek'), callCohere: mk('cohere'),
    callOpenAILike: mk('openai'),
  };
  ctx.window.callChatWithTools = async (messages, onDelta, provider, opts) => { seen['chat:' + provider] = messages; seen['chatOpts:' + provider] = opts; return { reply: 'ردّ مسار المحادثة' }; };
  vm.createContext(ctx);
  vm.runInContext(GROUPS + '\n' + ROUTING + '\nthis.callAIWithFallback = callAIWithFallback;', ctx);
  return { ctx, seen };
}
const sysOf = (msgs) => (msgs || []).filter((m) => m && m.role === 'system').map((m) => String(m.content)).join('\n');
const ALL = ['claude', 'gemini', 'openai', 'groq', 'mistral', 'deepseek', 'cohere', 'openrouter', 'perplexity', 'kimi'];

test('١. موجّه الأحلام الستّة يصل كلّ مزوّد مختار — للمالك ولغيره، وKimi لم يعد يُنزع', async () => {
  assert.ok(DREAM && DREAM.includes('جميع التفسيرات الستة'), 'موجّه الأحلام مقروء');
  for (const owner of [true, false]) {
    for (const sel of ALL) {
      const { ctx, seen } = routingCtx(owner, sel);
      const r = await ctx.callAIWithFallback([{ role: 'system', content: DREAM }, { role: 'user', content: 'حلمت أني أطير' }], () => {}, null, { taskPrompt: true });
      const via = seen[r.providerKey] || seen['chat:' + r.providerKey];
      assert.equal(r.providerKey, sel, (owner ? 'المالك' : 'المستخدم') + ': ' + sel + ' هو من أجاب');
      assert.ok(sysOf(via).includes('جميع التفسيرات الستة'), (owner ? 'المالك' : 'المستخدم') + ': الموجّه وصل ' + sel);
      if (sel === 'kimi') assert.equal((seen['chatOpts:kimi'] || {}).noTools, true, (owner ? 'المالك' : 'المستخدم') + ': Kimi بلا أدوات المستودع');
      if (sel !== 'kimi') assert.ok(!seen['chat:' + sel], (owner ? 'المالك' : 'المستخدم') + ': ' + sel + ' على مساره المباشر القديم لا مسار المحادثة');
    }
  }
});

test('٢. بقيّة المستدعين للمالك بلا تغيير (v-owner-solo-all): بلا taskPrompt يبقى مزوّده وحده عبر مسار المحادثة', async () => {
  const { ctx, seen } = routingCtx(true, 'claude');
  await ctx.callAIWithFallback([{ role: 'system', content: 'تعليمات أداة' }, { role: 'user', content: 'س' }], () => {});
  assert.ok(seen['chat:claude'] && !seen.claude, 'المالك بلا taskPrompt على مسار المحادثة كما كان');
  assert.ok(RELIGION.includes('callAIWithFallback(messages, onDelta, null, { taskPrompt: true })'), 'التفسير الدينيّ يطلب taskPrompt');
});

/* DOM مصغّر يكفي لتشغيل كود الأداة الحقيقيّ */
function fakeEl(id, extra) {
  const ls = {};
  const cls = new Set();
  const el = Object.assign({
    id, style: {}, dataset: {}, disabled: false, value: '', textContent: '', offsetHeight: 34, scrollHeight: 32,
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; if (v) cls.add(c); else cls.delete(c); return v; } },
    addEventListener: (ty, f) => { (ls[ty] = ls[ty] || []).push(f); },
    fire: (ty, ev) => Promise.all((ls[ty] || []).map((f) => f(ev || { target: el }))),
    setAttribute: (k, v) => { el['attr:' + k] = v; },
    closest: () => null, querySelector: () => null, querySelectorAll: () => [],
  }, extra || {});
  return el;
}
function religionCtx(extra) {
  const tabs = ['verse', 'hadith', 'dream'].map((tool) => { const b = fakeEl('tab-' + tool); b.dataset.tool = tool; b.closest = () => b; return b; });
  const mic = fakeEl('mic');
  const els = {
    mic,
    religionModal: fakeEl('religionModal', { querySelector: (s) => (s === '.mini-mic-btn' ? mic : null) }), btnReligion: fakeEl('btnReligion'), religionCloseBtn: fakeEl('religionCloseBtn'),
    religionGenerateBtn: fakeEl('religionGenerateBtn'), religionInputLabel: fakeEl('religionInputLabel'),
    religionInput: fakeEl('religionInput'), religionStatus: fakeEl('religionStatus'), religionResult: fakeEl('religionResult'),
    religionTabs: fakeEl('religionTabs', { querySelectorAll: () => tabs, querySelector: () => tabs[0] }),
  };
  const calls = [];
  const painted = [];
  const ctx = {
    console, Promise, Error, String, Math, AbortController,
    $: (sel) => els[sel.replace(/^#/, '')] || null, t: (k) => k, __swallow() {}, closeHeaderMenu() {},
    renderStreamingAssistant: (el, txt) => painted.push(['stream', txt]),
    buildSpokenWordSpans: (el, txt) => painted.push(['final', txt]),
    callAIWithFallback: (messages, onDelta, pref, opts) => new Promise((resolve, reject) => {
      calls.push({ messages, onDelta, opts, resolve, reject });
      if (onDelta.__signal) onDelta.__signal.addEventListener('abort', () => { const e = new Error('Generation stopped'); e.name = 'AbortError'; reject(e); });
    }),
  };
  Object.assign(ctx, extra || {});
  vm.createContext(ctx);
  vm.runInContext(RELIGION, ctx);
  return { els, tabs, calls, painted };
}
const tick = () => new Promise((r) => setImmediate(r));

test('٣. الرسم بعارض المحادثة: حيّ أثناء البثّ ونهائيّ بعده، والموجّه موجّه التبويب', async () => {
  const { els, tabs, calls, painted } = religionCtx();
  await els.btnReligion.fire('click');
  await els.religionTabs.fire('click', { target: tabs[2] });
  els.religionInput.value = 'حلمت أني أطير فوق البحر';
  const done = els.religionGenerateBtn.fire('click');
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].messages[0].content, DREAM, 'موجّه الأحلام هو رسالة النظام');
  assert.equal(calls[0].opts.taskPrompt, true);
  calls[0].onDelta('## ☪️ التفسير الإسلامي\n**الطيران**');
  assert.deepEqual(painted.pop(), ['stream', '## ☪️ التفسير الإسلامي\n**الطيران**'], 'البثّ بعارض المحادثة');
  calls[0].resolve({ reply: '## ☪️ التفسير الإسلامي\n**الطيران**: علوّ' });
  await done;
  assert.deepEqual(painted.pop(), ['final', '## ☪️ التفسير الإسلامي\n**الطيران**: علوّ'], 'الرسم النهائيّ بعارض المحادثة');
  const n = painted.length;
  calls[0].onDelta('نصّ متأخّر من مزوّد تجاوزه حارس الخمول');
  assert.equal(painted.length, n, 'ما يصل بعد الجواب لا يُرسم فوقه');
  assert.equal(els.religionResult.textContent, '', 'لا textContent خام');
  assert.equal(els.religionStatus.textContent, 'religionDone');
  assert.equal(els.religionGenerateBtn.disabled, false);
});

test('٤. تغيير التبويب أثناء الكتابة: الطلب يُلغى، ولا «تم» بلا شيء، والزرّ يرجع فورًا', async () => {
  const { els, tabs, calls, painted } = religionCtx();
  await els.btnReligion.fire('click');
  await els.religionTabs.fire('click', { target: tabs[2] });
  els.religionInput.value = 'حلمت';
  const done = els.religionGenerateBtn.fire('click');
  await tick();
  assert.equal(els.religionGenerateBtn.disabled, true, 'معطّل أثناء الكتابة');
  const sig = calls[0].onDelta.__signal;
  assert.ok(sig && !sig.aborted, 'للطلب إشارة إيقاف خاصّة به');
  await els.religionTabs.fire('click', { target: tabs[0] });
  assert.equal(sig.aborted, true, 'تغيير التبويب أوقف الطلب');
  assert.equal(els.religionGenerateBtn.disabled, false, 'الزرّ يرجع فورًا للتبويب الجديد');
  const n = painted.length;
  calls[0].onDelta('نصّ متأخّر');
  await done;
  assert.equal(painted.length, n, 'ما يصل بعد الإلغاء لا يُرسم');
  assert.equal(els.religionStatus.textContent, '', 'لا «تم التفسير» ولا خطأ في التبويب الجديد');
  assert.equal(els.religionResult.style.display, 'none');
  /* والإغلاق يوقف الطلب كذلك */
  els.religionInput.value = 'البقرة 255';
  const d2 = els.religionGenerateBtn.fire('click');
  await tick();
  await els.religionCloseBtn.fire('click');
  assert.equal(calls[1].onDelta.__signal.aborted, true, 'الإغلاق أوقف الطلب');
  await d2;
  assert.ok(!/religionDone|religionError/.test(els.religionStatus.textContent), 'الطلب الملغى لا يكتب نتيجة ولا خطأ');
  await els.btnReligion.fire('click');
  assert.equal(els.religionStatus.textContent, '', 'الفتح من جديد نظيف');
  assert.equal(els.religionGenerateBtn.disabled, false);
});

test('٥. الشكل: التبويبات الثلاثة نسخة «فسّر» بلا فرق للمختار، و«فسّر» كما هو، والحقل بزوايا «فسّر» بلا لون جديد', () => {
  const core = read('js/partials-core.js');
  const at = core.indexOf('id="religionModal"');
  const modal = core.slice(at, core.indexOf('<div id="emailAssistModal"', at));
  const gen = (modal.match(/<button[^>]*id="religionGenerateBtn"[^>]*>/) || [''])[0];
  assert.match(gen, /class="btn primary" id="religionGenerateBtn" style="width:100%; margin-top:14px;"/, '«فسّر» لم يُلمس');
  const tabs = modal.match(/<button[^>]*class="[^"]*religionTabBtn[^"]*"[^>]*>/g) || [];
  assert.equal(tabs.length, 3, 'ثلاثة تبويبات فقط');
  for (const b of tabs) {
    assert.match(b, /class="btn primary religionTabBtn( relOn)?"/, 'التبويب بصنف «فسّر» نفسه، وعلامة المختار relOn لا active (مصنّف الألوان يستثني .active من الأسود)');
    assert.match(b, /style="white-space:nowrap;flex:1;"/, 'لا شكل خاصّ بالتبويب (لا كبسولة ولا توسيط) — نفس «فسّر»');
  }
  const css = read('css/tokens.css');
  assert.doesNotMatch(css, /religionTabBtn/, 'لا قاعدة CSS تميّز التبويب المختار');
  assert.ok(!RELIGION.includes("classList.toggle('active'"), 'المختار لا يأخذ active');
  const row = (modal.match(/<div id="religionTabs" style="([^"]*)"/) || ['', ''])[1];
  assert.match(row, /overflow-x:auto/, 'الصفّ يبقى يتمرّر للأسماء الطويلة');
  assert.match(row, /margin:-10px -18px -18px; padding:16px 18px 22px;/, 'حشو يتّسع للوهج فلا يُقصّ، والموضع كما كان');
  assert.match(modal, /<textarea id="religionInput" rows="1" style="width:100%;"/, 'الحقل سطر واحد بلا حدّ مضمَّن');
  assert.match(modal, /id="religionResult" class="msg-text"/);
  const rule = css.slice(css.indexOf('/* v-religion-field'), css.indexOf('#religionModal .mini-mic-btn{'));
  assert.match(rule, /#religionModal #religionInput\{[^}]*border-radius:var\(--r-2\);/, 'زوايا الحقل زوايا ‎.btn‎ («فسّر»)');
  assert.doesNotMatch(rule.replace(/\/\*[\s\S]*?\*\//g, ''), /212,\s*175,\s*55|#d4af37|gold|border(-color)?:/i, 'لا لون ولا حدّ جديد («بدون أصفر»)');
  assert.match(css, /#religionModal \.mini-mic-btn\{margin-top:0; border-radius:50%;\}/, 'الميكروفون دائرة');
});

test('٦. الحقل والميكروفون بارتفاع «فسّر» عند الفتح، والحقل يطول مع النصّ الطويل حتّى ١٥٠px', async () => {
  const { els } = religionCtx();
  els.religionGenerateBtn.offsetHeight = 33;
  els.religionInput.scrollHeight = 20; /* سطر واحد قصير */
  els.religionInput.clientHeight = 31; els.religionInput.offsetHeight = 33; /* حدّ ١px من كلّ جهة */
  await els.btnReligion.fire('click');
  assert.equal(els.religionInput.style.height, '33px', 'سطر واحد = ارتفاع «فسّر»');
  assert.equal(els.mic.style.width, '33px');
  assert.equal(els.mic.style.height, '33px', 'الميكروفون بالارتفاع نفسه');
  els.religionInput.scrollHeight = 90;
  await els.religionInput.fire('input');
  assert.equal(els.religionInput.style.height, '92px', 'يطول مع النصّ');
  els.religionInput.scrollHeight = 400;
  await els.religionInput.fire('input');
  assert.equal(els.religionInput.style.height, '150px', 'سقف ١٥٠px');
});

/* تدقيق ١٨ أكتوبر: الخطأ كان «حدث خطأ، حاول مرة أخرى: … (الاحتياط فشل أيضًا — …)» تحته صندوق نتيجة فارغ، ومثال الأحلام مقصوص على الجوّال */
test('٧. حدّ الباقة: نصّ الباقات وحده ويفتحها، بلا «الاحتياط» ولا صندوق فارغ', async () => {
  const opened = [];
  const { els, calls } = religionCtx({ window: { omranOpenPlans: (a, b) => opened.push([a, b]) } });
  await els.btnReligion.fire('click');
  els.religionInput.value = 'البقرة 255';
  const done = els.religionGenerateBtn.fire('click');
  await tick();
  const e = new Error('وصلت حدّ باقتك (الاحتياط فشل أيضًا — السريع: 402)'); e.planLimit = true;
  calls[0].reject(e);
  await done;
  assert.equal(els.religionStatus.textContent, 'plansWhyLimit');
  assert.doesNotMatch(els.religionStatus.textContent, /الاحتياط/);
  assert.deepEqual(opened, [['limit', 'chat']], 'الباقات تُفتح من حدّ الدردشة');
  assert.equal(els.religionResult.style.display, 'none', 'لا صندوق نتيجة فارغ تحت الرسالة');
  assert.equal(els.religionGenerateBtn.disabled, false);
});

test('٨. خطأ عاديّ: «حدث خطأ» وحده والتفاصيل للكونسول؛ وما كُتب قبل الخطأ يبقى ظاهرًا', async () => {
  const warned = [];
  const cons = Object.assign(Object.create(console), { warn: (...a) => warned.push(a.join(' ')) });
  const extra = { console: cons, renderStreamingAssistant: (el, txt) => { el.textContent = txt; } };
  let { els, calls } = religionCtx(extra);
  await els.btnReligion.fire('click');
  els.religionInput.value = 'حديث';
  let done = els.religionGenerateBtn.fire('click');
  await tick();
  calls[0].reject(new Error('quota 402 (الاحتياط فشل أيضًا — fast: 402)'));
  await done;
  assert.equal(els.religionStatus.textContent, 'religionError', 'بلا نصّ تقنيّ ملصوق');
  assert.ok(warned.some((w) => /الاحتياط فشل/.test(w)), 'التفاصيل في الكونسول');
  assert.equal(els.religionResult.style.display, 'none');
  ({ els, calls } = religionCtx(extra));
  await els.btnReligion.fire('click');
  els.religionInput.value = 'حديث';
  done = els.religionGenerateBtn.fire('click');
  await tick();
  calls[0].onDelta('## بداية الجواب');
  calls[0].reject(new Error('انقطع'));
  await done;
  assert.equal(els.religionResult.style.display, 'block', 'جواب جزئيّ لا يُخفى');
});

test('٩. تبديل التبويب يعيد مقاس الحقل لمثاله (الأحلام سطران على الجوّال)', async () => {
  const { els, tabs } = religionCtx();
  els.religionGenerateBtn.offsetHeight = 33;
  els.religionInput.scrollHeight = 20; els.religionInput.clientHeight = 31; els.religionInput.offsetHeight = 33;
  await els.btnReligion.fire('click');
  assert.equal(els.religionInput.style.height, '33px');
  els.religionInput.scrollHeight = 46; // مثال الأحلام الطويل على هاتف ٣٩٠
  await els.religionTabs.fire('click', { target: tabs[2] });
  assert.equal(els.religionInput.style.height, '48px', 'الحقل يطول لمثال التبويب');
  els.religionInput.scrollHeight = 20;
  await els.religionTabs.fire('click', { target: tabs[0] });
  assert.equal(els.religionInput.style.height, '33px', 'ويرجع لمثال قصير');
});
