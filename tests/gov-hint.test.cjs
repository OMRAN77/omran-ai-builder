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
const hintFn = new Function('m', 'mIdx', 'cur', 'capabilityHintFor', 'document', 'lang', 'bubbleCol', 'openFeatureById', '__swallow', state.slice(hs, he));

/** يرسم ملاحظة ردّ على رسالة المستخدم ثمّ يمرّ عليها المنظّف كما في الصفحة، ويرجع النصّ الظاهر (أو null بلا ملاحظة). */
function renderHint(userText, lng) {
  const bubbleCol = new El('div');
  const m = { role: 'assistant', content: 'جواب' };
  const opened = [];
  let err = null;
  hintFn(m, 1, { messages: [{ role: 'user', content: userText }, m] }, CAP.capabilityHintFor, doc, lng, bubbleCol, (id) => opened.push(id), (e) => { err = e; });
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
    assert.equal(ar, 'ملاحظة: تقدر تسوي هذا عن طريق ' + c.ar, c.id + ' عربيّ');
    const en = renderHint(q, 'en').text;
    assert.equal(en, 'Note: you can do this with ' + c.en, c.id + ' إنجليزيّ');
  }
});
