// tests/gov-hint.test.cjs — v-gov-hint: ملاحظة المحادثة (تحت الردّ) لا تقترح «المعاملات الحكومية» المتقاعدة،
// ولا يلتصق نصّها بالرابط بعد منظّف الإيموجي (v-clean-ui).
// العرض (تدقيق ١٨ أكتوبر): «كيف أجدد الإقامة؟» ← «ملاحظة: تقدر تسوي هذا عن طريقالمعاملات الحكومية» ← النافذة ← «retired» بالإنجليزي (410).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const ui = read('js/app-05-ui.js');
const state = read('js/app-04-i18n-state.js');
const cleanSrc = read('js/app-36-clean-ui.js');

// الكتالوج الحقيقيّ كما يقتطعه tools-pause وarabic-wordb.
const capBlock = ui.slice(ui.indexOf('var OMRAN_PAUSED_TOOLS'), ui.indexOf('// ميزة الشخصية الكرتونية الناطقة'))
  + ui.slice(ui.indexOf('function capabilityHintFor'), ui.indexOf('// أيقونة القدرات'));
const CAP = new Function('document', '__swallow', capBlock + '; return { APP_CAPABILITIES, capabilityHintFor };')({ getElementById: () => null }, () => {});

// منظّف الإيموجي الحقيقيّ (fixText كما هو في v-clean-ui).
const cleanBlock = cleanSrc.slice(cleanSrc.indexOf('var EMO;'), cleanSrc.indexOf('function fixAttrs'));
const CLEAN = new Function('window', cleanBlock + '; return { fixText };')({});

// DOM صغير يكفي كتلة الملاحظة: عقد نصّ وعناصر بأبنائها. الملاحظة تُلحق بعمود الفقاعة لا بـ.msg، فلا استثناء من المنظّف.
class TextNode { constructor(v) { this.nodeType = 3; this.nodeValue = String(v); this.parentElement = null; } get textContent() { return this.nodeValue; } }
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.childNodes = []; this.style = { cssText: '' }; this.parentElement = null; }
  appendChild(c) { c.parentElement = this; this.childNodes.push(c); return c; }
  set textContent(v) { this.childNodes = []; this.appendChild(new TextNode(v)); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  closest() { return null; }
}
const doc = { createElement: (t) => new El(t), createTextNode: (v) => new TextNode(v) };

// كتلة «ملاحظة تلقائية آخر الردّ» من renderAll كما هي.
const hs = state.lastIndexOf('\n', state.indexOf('ملاحظة تلقائية آخر الرد'));
const he = state.indexOf('messagesEl.appendChild(bubbleCol);', hs);
assert.ok(hs > 0 && he > hs, 'كتلة الملاحظة موجودة');
const hintFn = new Function('m', 'mIdx', 'cur', 'capabilityHintFor', 'document', 'lang', 'bubbleCol', 'openFeatureById', '__swallow', 't', state.slice(hs, he));

// القواميس الحقيقيّة (app-03 للعربيّة والإنجليزيّة، وi18n/*.js للبقيّة فوق الإنجليزيّ كما في الصفحة) — v-cap-hint-i18n
const vm = require('node:vm');
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
const D = (() => {
  const ctx = { $: () => null, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-03-i18n-data.js').replace(/^const (codeEl|previewFrame|emptyState|historyEl) = .*$/mg, '') + '\n;this.I18N = I18N;', ctx);
  for (const l of LANGS) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  const out = { ar: ctx.I18N.ar, en: ctx.I18N.en, own: {} };
  for (const l of LANGS) { out[l] = Object.assign({}, ctx.I18N.en, ctx.I18N[l]); out.own[l] = ctx.I18N[l]; }
  return out;
})();
const tFor = (l) => (k) => (D[l][k] !== undefined ? D[l][k] : k);

/** يرسم ملاحظة ردّ على رسالة المستخدم ثمّ يمرّ عليها المنظّف كما في الصفحة، ويرجع النصّ الظاهر (أو null بلا ملاحظة). */
function renderHint(userText, lng) {
  const bubbleCol = new El('div');
  const m = { role: 'assistant', content: 'جواب' };
  const opened = [];
  let err = null;
  hintFn(m, 1, { messages: [{ role: 'user', content: userText }, m] }, CAP.capabilityHintFor, doc, lng, bubbleCol, (id) => opened.push(id), (e) => { err = e; }, tFor(lng));
  assert.equal(err, null, 'لا خطأ في بناء الملاحظة');
  const note = bubbleCol.childNodes[0];
  if (!note) return null;
  (function walk(n) { if (n.nodeType === 3) CLEAN.fixText(n); else n.childNodes.forEach(walk); })(note);
  const a = note.childNodes.find((c) => c.tagName === 'A');
  if (a) a.onclick({ preventDefault() {}, stopPropagation() {} });
  return { text: note.textContent, opened };
}

test('١. «المعاملات الحكومية» متقاعدة في الخادم ومخفيّة لكلّ أحد — فالمحادثة لا تقترحها', () => {
  // سبب القرار ثابت في الكود: الخادم يردّ 410 بلا معالج، والزرّ مخفيّ بقاعدة v473.
  assert.match(read('api/_lib/_retired.js'), /gov: 'المعاملات الحكومية'/);
  const rule = /\n(#btnTemplates[^{]*)\{ display: none !important; \}/.exec(read('index.html'));
  assert.ok(rule && /#btnGov\b/.test(rule[1]), 'زرّ الحكوميّة مخفيّ');
  const hidden = Array.from(rule[1].matchAll(/#(\w+)/g), (x) => x[1]);
  for (const c of CAP.APP_CAPABILITIES) assert.ok(!hidden.includes(c.id), c.id + ': اقتراح يفتح أداة مخفيّة');
  assert.ok(!CAP.APP_CAPABILITIES.some((c) => c.id === 'btnGov'));
  for (const q of ['كيف أجدد الإقامة؟', 'تجديد الإقامة', 'ابي رخصة تجارية', 'How do I renew my residence visa?', 'government services'])
    assert.equal(CAP.capabilityHintFor(q), null, q);
  assert.equal(renderHint('كيف أجدد الإقامة؟', 'ar'), null, 'لا ملاحظة تحت ردّ سؤال الإقامة');
});

test('٢. الاقتراحات الأخرى باقية وتفتح أداتها', () => {
  assert.equal(CAP.capabilityHintFor('حلل هذا العقد').id, 'btnDocs');
  assert.equal(CAP.capabilityHintFor('ما حكم الصيام').id, 'btnReligion');
  assert.deepEqual(renderHint('حلل هذا العقد', 'ar').opened, ['btnDocs']);
});

test('٣. بعد منظّف الإيموجي تبقى المسافة بين نصّ الملاحظة والرابط (عربيّ وإنجليزيّ) ولا إيموجي ظاهر', () => {
  assert.ok(CAP.APP_CAPABILITIES.length > 0);
  const probe = { btnCV: 'اكتب لي سيرة ذاتية', btnDocs: 'حلل هذا العقد', btnReligion: 'ما حكم الصيام' };
  for (const c of CAP.APP_CAPABILITIES) {
    const q = probe[c.id];
    assert.ok(q, c.id + ': أضف سؤالًا يطابقه هنا');
    const ar = renderHint(q, 'ar').text;
    assert.equal(ar, 'ملاحظة: تقدر تسوي هذا عن طريق ' + D.ar[c.key], c.id + ' عربيّ');
    const en = renderHint(q, 'en').text;
    assert.equal(en, 'Note: you can do this with ' + D.en[c.key], c.id + ' إنجليزيّ');
  }
});

// v-cap-hint-i18n (تدقيق ١٨–١٩ أكتوبر، g03 chat-capability-hint): الملاحظة قالت «Religious Guidance» والأداة اسمها «Religious Insights»
// (أسماء الكتالوج ثابتة عربيّ/إنجليزيّ لا من مفاتيح الأداة)، والجملة القائدة ثنائيّة: الفرنسيّة والعشر الباقية تأخذ ملاحظة عربيّة.
test('٤. اسم الأداة في الملاحظة هو اسمها في الواجهة (مفتاحها)، والجملة القائدة بلغة الواجهة', () => {
  for (const c of CAP.APP_CAPABILITIES) assert.ok(c.key && D.en[c.key], c.id + ': مفتاح اسم الأداة');
  assert.equal(CAP.APP_CAPABILITIES.find((c) => c.id === 'btnReligion').key, 'religionMenuLabel');
  assert.equal(CAP.APP_CAPABILITIES.find((c) => c.id === 'btnDocs').key, 'docsTitle');
  assert.equal(renderHint('ما حكم الصيام', 'en').text, 'Note: you can do this with Religious Insights');
  const fr = renderHint('ما حكم الصيام', 'fr').text;
  assert.equal(fr, D.fr.capHintLead + ' ' + D.fr.religionMenuLabel);
  assert.doesNotMatch(fr, /[؀-ۿ]/, 'الفرنسيّة بلا عربيّ: ' + fr);
  for (const l of LANGS.filter((x) => x !== 'ur')) assert.doesNotMatch(renderHint('حلل هذا العقد', l).text, /[؀-ۿ]/, l);
});

test('٥. capHintLead بالـ١٤ لغة: مترجم في ملفّ كلّ لغة، بلا اسم مزوّد، والعربيّ والإنجليزيّ كما كانا حرفًا', () => {
  assert.equal(D.ar.capHintLead, 'ملاحظة: تقدر تسوي هذا عن طريق');
  assert.equal(D.en.capHintLead, 'Note: you can do this with');
  const PROV = /gemini|google|openai|gpt|claude|anthropic|groq|mistral|deepseek|grok|جيمناي|كلود|غروق/i;
  for (const l of LANGS) {
    const v = D.own[l].capHintLead;
    assert.ok(v && v.trim().length > 3, l + ': capHintLead غير موجود في i18n/' + l + '.js');
    assert.notEqual(v, D.en.capHintLead, l + ': منسوخ من الإنجليزيّ');
    assert.doesNotMatch(v, PROV, l);
    if (l !== 'ur') assert.doesNotMatch(v, /[؀-ۿ]/, l + ': فيه عربيّ');
  }
});
