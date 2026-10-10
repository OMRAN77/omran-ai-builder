'use strict';
/* v-stream-incremental — الرسم الحيّ للردّ أثناء البثّ لا يعيد بناء النصّ كلّه
   في كلّ نبضة: الجزء المستقرّ يُرسم مرّة، والذيل وحده يُعاد. الاختبار يشغّل
   app-02-tts.js على DOM مصغّر ويعدّ العقد المُنشأة عبر بثّ ردّ طويل، ويقارنها
   بالبناء الكامل القديم، ويتأكّد أنّ النصّ النهائيّ مطابق حرفيًّا. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let created = 0;
class Txt { constructor(t){ this.nodeType = 3; this.textContent = t; this.parentNode = null; this.className = ''; } remove(){ if(this.parentNode) this.parentNode.removeChild(this); } }
class El {
  constructor(tag){ created++; this.tagName = tag; this.nodeType = 1; this.childNodes = []; this.parentNode = null; this.className = ''; this.style = {}; this._attrs = {}; this.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } }; }
  appendChild(n){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; const i = this.childNodes.indexOf(ref); if(i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; }
  removeChild(n){ const i = this.childNodes.indexOf(n); if(i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove(){ if(this.parentNode) this.parentNode.removeChild(this); }
  get textContent(){ return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v){ this.childNodes = []; if(v !== '' && v != null) this.appendChild(new Txt(String(v))); }
  get innerHTML(){ return this.textContent; }
  set innerHTML(v){ this.childNodes = []; if(v) this.appendChild(new Txt('')); }
  setAttribute(k, v){ this._attrs[k] = v; } getAttribute(k){ return this._attrs[k]; }
  querySelectorAll(){ return []; } addEventListener(){}
}
const document = { createElement: (t) => new El(t), createTextNode: (t) => new Txt(t), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, documentElement: new El('html'), head: new El('head'), body: new El('body') };
const ctx = {
  window: {}, document, navigator: { userAgent: 'node' }, localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  $: () => null, __swallow: () => {}, console, setTimeout, clearTimeout, setInterval, clearInterval, Audio: function(){}, fetch: () => Promise.reject(new Error('no-net')),
  t: (k) => k, lang: 'ar', requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout, URL,
};
ctx.window = ctx; ctx.globalThis = ctx;
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-02-tts.js'), 'utf8');
vm.runInNewContext(src + '\n;this.__x = { buildSpokenWordSpans, renderStreamingAssistant, omranStreamSplitPoint };', ctx, { filename: 'app-02-tts.js' });
const { buildSpokenWordSpans, renderStreamingAssistant, omranStreamSplitPoint } = ctx.__x;

// ردّ طويل: ١٢٠ سطرًا مرقّمًا مع عناوين وعريض
const lines = [];
for (let i = 1; i <= 120; i++) {
  if (i % 30 === 1) lines.push('## المرحلة ' + Math.ceil(i / 30));
  lines.push(i + '. **حدث رقم ' + i + '**: تفصيل قصير عن هذا الحدث في السيرة مع بعض الكلمات الإضافية للطول.');
}
const text = lines.join('\n');
assert.ok(text.length > 5000, 'نصّ الاختبار طويل بما يكفي: ' + text.length);

// ١) البناء الكامل القديم لكلّ بادئة (المرجع)
created = 0;
const STEP = 25;
let naiveEl = null;
for (let n = STEP; n <= text.length + STEP; n += STEP) { naiveEl = new El('div'); created--; buildSpokenWordSpans(naiveEl, text.slice(0, n)); }
const naiveCreated = created;

// ٢) الرسم التزايديّ الجديد على العنصر نفسه
created = 0;
const el = new El('div'); created--;
for (let n = STEP; n <= text.length + STEP; n += STEP) renderStreamingAssistant(el, text.slice(0, n));
const incCreated = created;
console.log('nodes created — full rebuild: ' + naiveCreated + ' · incremental: ' + incCreated + ' (' + Math.round(100 * incCreated / naiveCreated) + '%)');
assert.ok(incCreated < naiveCreated * 0.12, 'التزايديّ يُنشئ أقلّ من ١٢٪ من عقد البناء الكامل');

// ٣) النتيجة النهائيّة مطابقة حرفيًّا للبناء الكامل
const full = new El('div'); buildSpokenWordSpans(full, text);
assert.strictEqual(el.textContent, full.textContent, 'النصّ الظاهر بعد البثّ يطابق البناء الكامل');
assert.ok(el.childNodes.length === 2 && el.childNodes[0].className === 'omStreamHead' && el.childNodes[1].className === 'omStreamTail', 'رأس وذيل');

// ٤) نصّ قصير = بناء كامل بلا تقسيم؛ كتلة كود مفتوحة لا تُقسَم
assert.strictEqual(omranStreamSplitPoint('سطر\nسطر آخر'), -1, 'القصير لا يُقسَم');
const openFence = 'مقدّمة\n\n```js\n' + 'x = 1;\n'.repeat(120) + '\n\ny = 2;';
assert.strictEqual(omranStreamSplitPoint(openFence), -1, 'لا قطع داخل كتلة كود مفتوحة');
const beforeFence = 'مقدّمة\n\n```js\n' + 'x = 1;\n'.repeat(120) + 'y = 2;';
assert.strictEqual(omranStreamSplitPoint(beforeFence), 'مقدّمة'.length, 'القطع قبل الكتلة المفتوحة يُبقيها كاملةً في الذيل');
const closedFence = 'مقدّمة\n\n```js\n' + 'x = 1;\n'.repeat(120) + '```\n\nخاتمة تُكتب الآن';
assert.ok(omranStreamSplitPoint(closedFence) > 'مقدّمة'.length, 'بعد إغلاق الكود يعود التقسيم بعده');

// ٥) مصدر: الكمبيوتر ما زال يرسم كلّ نبضة (الوتيرة كما هي) لكن عبر الدالّة التزايديّة، واللوحة تنسّق الماركداون
const attach = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
assert.ok(attach.includes('renderStreamingAssistant(thinkingDiv, shownTxt);'), 'مسار البثّ يستعمل الدالّة');
const state = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-04-i18n-state.js'), 'utf8');
/* لوحة قراءة الردّ الطويل أُزيلت بطلب المالك (v-long-reply-off) — يبقى فحص غيابها فقط */
assert.ok(!state.includes('function omranOpenReplyInPanel('), 'لوحة القراءة أُزيلت (v-long-reply-off)');
// ٦) v-bidi-punct: «Omran AI Builder،» تبقى سلسلة لاتينيّة واحدة معزولة الاتّجاه رغم الفاصلة العربيّة الملتصقة
const bidi = new El('div'); buildSpokenWordSpans(bidi, 'أنت مالك تطبيق Omran AI Builder، ومشروعك قيد التطوير.');
// v-md-blocks: كلّ سطر كتلة، فالغلاف داخل كتلة السطر
const ltrWraps = bidi.childNodes.flatMap((b) => b.childNodes || []).filter((n) => n.nodeType === 1 && n._attrs && n._attrs.dir === 'ltr');
assert.strictEqual(ltrWraps.length, 1, 'غلاف اتّجاه واحد للسلسلة اللاتينيّة');
assert.strictEqual(ltrWraps[0].textContent.trim(), 'Omran AI Builder،', 'الغلاف يضمّ الكلمات الثلاث والفاصلة');
console.log('✓ stream-render: الرسم الحيّ تزايديّ، والنصّ مطابق، واللوحة منسَّقة، والاتّجاه سليم مع الترقيم');
