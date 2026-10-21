// tests/ai-tag-system-msg.test.cjs — v-chat-sys-msg (تدقيق ١٨–١٩ أكتوبر، g03 composer-stop وchat-regenerate وchat-copy وchat-plans-gate،
// وg04 attach-image-analyze، وg06 chat-build-app).
// العرض: رسائل يكتبها التطبيق نفسه (الإيقاف، الانقطاع، حدّ الباقة، ردّ بوّابة الحدّ، التشخيص) عليها وسم «✨ محتوى مولّد بالذكاء
// الاصطناعي» وزرّا الاستماع والإعادة — وإعادة ردّ البوّابة تعيد الحدّ نفسه. والإيقاف بلا نصّ جزئيّ مكرّر: «تم إيقاف الرد قبل اكتماله.»
// وتحته «تم إيقاف الرد» (عربيّ/إنجليزيّ فقط). وزرّ نسخ رسالة المستخدم عنوانه «نسخ الردّ».
// الآن: رسائل التطبيق تُعلَّم (_sys) فلا وسم ولا استماع، والإعادة تُخفى للحدّ وتبقى للانقطاع، ورسالة الإيقاف بمفتاح الـ١٤ لغة بلا
// ملاحظة ثانية، ونسخ رسالة المستخدم «نسخ».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const a4 = read('js/app-04-i18n-state.js');
const a9 = read('js/app-09-attach.js');
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i + a.length); assert.ok(j > i, b); return src.slice(i, j); };

class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.style = {}; this.classes = new Set(); this.textContent = ''; }
  get classList() { const c = this.classes; return { add: (x) => c.add(x), remove: (x) => c.delete(x), contains: (x) => c.has(x), toggle: (x, f) => (f === undefined ? !c.has(x) : f) ? c.add(x) : c.delete(x) }; }
  set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return Array.from(this.classes).join(' '); }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html || ''; }
  get firstChild() { return this.children[0] || null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(el) { this.children.push(el); el.parentNode = this; return el; }
  insertBefore(el, other) { const i = this.children.indexOf(other); this.children.splice(i < 0 ? this.children.length : i, 0, el); el.parentNode = this; return el; }
}
const doc = (mobile) => ({ createElement: (t) => new Node(t), documentElement: { classList: { contains: (c) => c === 'mobile-ui' && mobile } } });

// كتلة الوسم وملاحظة الإيقاف من renderMessages كما هي
const tagBlock = between(a4, '    // AppGallery: وسم صريح', '    // 📚 اجمع الروابط');
function tags(m, mobile) {
  const div = new Node('div');
  const ctx = { m, __mc: m.content, div, document: doc(!!mobile), t: (k) => k };
  vm.createContext(ctx);
  vm.runInContext(tagBlock, ctx);
  return { aiTag: div.children.some((c) => c.classes.has('aiGenTag')), stopped: div.children.some((c) => c.classes.has('msgStoppedNote')) };
}

// شريط الأيقونات الحقيقيّ (نمط reply-toolbar)
const bar = between(a4, "    if((m.content && m.content.trim()) || (m.role !== 'user' && m.attachments", '    if(m.code && m.providerLabel){');
function toolbar(m, mobile) {
  const ctx = { document: doc(!!mobile), window: {}, navigator: {}, t: (k) => k, lang: 'ar', __swallow() {}, setTimeout() {}, clearTimeout() {} };
  vm.createContext(ctx);
  vm.runInContext('this.render = function(m, mIdx, textDiv, msgWordEls){ let copyMsgBtn = null;\n' + bar + '\nreturn copyMsgBtn; };', ctx);
  return ctx.render(Object.assign({ attachments: [] }, m), 3, { innerText: '' }, []).children.map((b) => b.title);
}

test('١. الوسم على ردّ النموذج وحده — لا على رسائل التطبيق ولا ردّ بوّابة الحدّ', () => {
  assert.equal(tags({ role: 'assistant', content: 'جواب' }).aiTag, true, 'ردّ عاديّ موسوم (AppGallery)');
  assert.equal(tags({ role: 'assistant', content: 'جزء من الردّ', _stopped: true }).aiTag, true, 'الردّ الجزئيّ الموقوف نصّ من النموذج');
  for (const m of [
    { role: 'assistant', content: 'تم إيقاف الرد', _stopped: true, _stopEmpty: true, _sys: 'stop' },
    { role: 'assistant', content: '⚠️ انقطع الاتصال', _sys: 'err' },
    { role: 'assistant', content: '⚠️ وصلت حدّ باقتك', _sys: 'limit' },
    { role: 'assistant', content: '🔧 تشخيص', _diag: true },
    { role: 'assistant', content: 'انتهت رسائلك المجانية', tier: 'free-limit' },
    { role: 'assistant', content: 'سجّل حسابًا', tier: 'guest-limit' },
  ]) assert.equal(tags(m).aiTag, false, JSON.stringify(m));
});

test('٢. ملاحظة «تم إيقاف الرد» لا تتكرّر تحت رسالة الإيقاف نفسها، وتبقى تحت الردّ الجزئيّ', () => {
  assert.equal(tags({ role: 'assistant', content: 'تم إيقاف الرد', _stopped: true, _stopEmpty: true, _sys: 'stop' }).stopped, false);
  assert.equal(tags({ role: 'assistant', content: 'جزء', _stopped: true }).stopped, true);
  assert.equal(tags({ role: 'assistant', content: 'جزء', _stopped: true }, true).stopped, false, 'الجوّال كما كان');
});

test('٣. الأيقونات: ردّ عاديّ كامل؛ الحدّ بلا إعادة ولا استماع؛ الانقطاع يبقى بإعادته بلا استماع', () => {
  assert.deepEqual(toolbar({ role: 'assistant', content: 'جواب' }), ['copyMsgTitle', 'speakBtn', 'msgRegenerate', 'moreOptionsTitle']);
  for (const m of [{ tier: 'free-limit' }, { tier: 'guest-limit' }, { _sys: 'limit' }])
    assert.deepEqual(toolbar(Object.assign({ role: 'assistant', content: 'حدّ' }, m)), ['copyMsgTitle', 'moreOptionsTitle'], JSON.stringify(m));
  assert.deepEqual(toolbar({ role: 'assistant', content: '⚠️ انقطع', _sys: 'err' }), ['copyMsgTitle', 'msgRegenerate', 'moreOptionsTitle']);
  assert.deepEqual(toolbar({ role: 'assistant', content: 'تم إيقاف الرد', _stopped: true, _stopEmpty: true, _sys: 'stop' }), ['copyMsgTitle', 'msgRegenerate', 'moreOptionsTitle']);
  assert.deepEqual(toolbar({ role: 'assistant', content: '🔧', _diag: true }), ['copyMsgTitle', 'msgRegenerate', 'moreOptionsTitle']);
});

test('٤. زرّ نسخ رسالة المستخدم «نسخ» (copyCode بالـ١٤ لغة) لا «نسخ الردّ»', () => {
  assert.deepEqual(toolbar({ role: 'user', content: 'سؤالي' }), ['تعديل الرسالة', 'copyCode']);
  assert.deepEqual(toolbar({ role: 'user', content: 'سؤالي' }, true), ['copyCode']);
  assert.equal(toolbar({ role: 'assistant', content: 'جواب' })[0], 'copyMsgTitle', 'ردّ المساعد «نسخ الردّ» كما كان');
  const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
  assert.equal((read('js/app-03-i18n-data.js').match(/\bcopyCode:\s*'[^']+'/g) || []).length, 2, 'copyCode في ar وen');
  for (const l of LANGS) assert.match(read('i18n/' + l + '.js'), /["']?copyCode["']?\s*:\s*["'][^"']+["']/, l);
});

// مساعد رسالة الإيقاف الحقيقيّ في vm
function stopMsg(lng, partial, timedOut) {
  const s = a9.indexOf('function omranStopMsg(');
  assert.ok(s > 0, 'omranStopMsg في app-09');
  const D = { ar: { msgStopped: 'تم إيقاف الرد', stTimeout: '⏱️ انتهت مهلة الردّ.' }, fr: { msgStopped: 'Réponse arrêtée', stTimeout: '⏱️ Délai de réponse dépassé.' } };
  const ctx = { t: (k) => D[lng][k] || k };
  vm.createContext(ctx);
  vm.runInContext(a9.slice(s, a9.indexOf('\n}\n', s) + 3) + '\nthis.f = omranStopMsg;', ctx);
  return ctx.f(partial, timedOut, ['log']);
}

test('٥. رسالة الإيقاف: بلا نصّ جزئيّ بمفتاح لغة الواجهة ومعلَّمة رسالة نظام؛ والجزئيّ كما كان', () => {
  const ar = stopMsg('ar', '', false);
  assert.equal(ar.content, 'تم إيقاف الرد');
  assert.deepEqual([ar.role, ar._stopped, ar._stopEmpty, ar._sys, ar.askAllReply, ar._agParts], ['assistant', true, true, 'stop', false, ['log']]);
  assert.equal(stopMsg('fr', '', false).content, 'Réponse arrêtée', 'الفرنسيّة لا تأخذ الإنجليزيّ');
  assert.equal(stopMsg('fr', '', true).content, '⏱️ Délai de réponse dépassé.');
  const p = stopMsg('ar', 'جزء من الجواب', false);
  assert.equal(p.content, 'جزء من الجواب');
  assert.equal(p._stopped, true);
  assert.equal(p._sys, undefined);
  assert.equal(p._stopEmpty, undefined);
  // الفرع في __sendPromptCore يمرّ بالمساعد، بلا نصوص ثنائيّة ثابتة
  const blk = between(a9, "if(err && err.name === 'AbortError'){", '} else if(err && err.premiumNoPoints){');
  assert.match(blk, /cur\.messages\.push\(omranStopMsg\(partial, __run\.timedOut, /);
  assert.ok(!blk.includes('تم إيقاف الرد قبل اكتماله') && !blk.includes('stopped before it completed'));
});

test('٦. دفعات العميل الأخرى معلَّمة: الانقطاع/الخطأ (err) وحدّ الباقة (limit)', () => {
  const s = a9.indexOf('function omranPlanLimitMsg(err){');
  const helper = a9.slice(s, a9.indexOf('\n}\n', s) + 3);
  const run = (err, plan) => { const ctx = { t: (k) => k, window: { __omranPlan: plan } }; vm.createContext(ctx); vm.runInContext(helper + '\nthis.f = omranPlanLimitMsg;', ctx); return ctx.f(err); };
  assert.equal(run({ planLimit: true }, 'pro')._sys, 'limit');
  assert.equal(run({ planLimit: true, limitTier: 'free' }, '')._sys, 'limit');
  const els = between(a9, '      var __primaryErr = \'\';', '  }finally{');
  assert.match(els, /cur\.messages\.push\(\{role: 'assistant', _sys: 'err', content: '⚠️ ' \+ __friendlyErr\(err\)/);
});
