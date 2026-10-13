'use strict';
/* v-gpt-format (المالك ١٣ أكتوبر: «المحادثة العاديه قلت اريدها مرتبه» ثمّ «نفس gpt» بلقطتي ChatGPT): جدول الماركداون الكامل يُرسم
   جدولًا حقيقيًّا (رأس عريض وخطوط صفوف) بدل سطور «• … — …»، و`الكود` المضمّن رقاقة بلا علامات ` ظاهرة. عنصر لكلّ كلمة كما كان،
   فالقراءة الصوتيّة لا تنزاح. الراسم الحقيقيّ (app-02) في vm بصفحة مصغّرة كاختبار chat-format. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

class Txt { constructor(t){ this.nodeType = 3; this.textContent = t; this.parentNode = null; this.className = ''; } }
class El {
  constructor(tag){ this.tagName = tag.toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentNode = null; this.className = ''; this.style = {}; this._attrs = {}; this.classList = { add: (c) => { this.className += ' ' + c; }, remove(){}, toggle(){}, contains(){ return false; } }; }
  appendChild(n){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; const i = this.childNodes.indexOf(ref); if(i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; }
  removeChild(n){ const i = this.childNodes.indexOf(n); if(i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  replaceChild(n, o){ const i = this.childNodes.indexOf(o); this.childNodes[i] = n; n.parentNode = this; o.parentNode = null; return o; }
  get textContent(){ return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v){ this.childNodes = []; if(v !== '' && v != null) this.appendChild(new Txt(String(v))); }
  get innerHTML(){ return this.textContent; }
  set innerHTML(v){ this.childNodes = []; }
  setAttribute(k, v){ this._attrs[k] = v; } getAttribute(k){ return this._attrs[k]; }
  querySelectorAll(){ return []; } addEventListener(){}
}
function load(){
  const document = { createElement: (t) => new El(t), createTextNode: (t) => new Txt(t), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, documentElement: new El('html'), head: new El('head'), body: new El('body') };
  const ctx = { document, navigator: { userAgent: 'node' }, localStorage: { getItem: () => null, setItem(){} }, sessionStorage: { getItem: () => null, setItem(){} },
    $: () => null, __swallow(){}, console, setTimeout, clearTimeout, setInterval, clearInterval, Audio: function(){}, fetch: () => Promise.reject(new Error('x')), t: (k) => k, lang: 'ar',
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout, URL };
  ctx.window = ctx;
  vm.runInNewContext(read('js/app-02-tts.js') + '\n;this.__b = buildSpokenWordSpans; this.__t2l = mdTablesToLines;', ctx);
  return ctx;
}
const all = (n, f, out = []) => { (n.childNodes || []).forEach((c) => { if (f(c)) out.push(c); all(c, f, out); }); return out; };
const shown = (n) => (n.style && n.style.display === 'none') ? '' : (n.nodeType === 3 ? n.textContent : n.childNodes.map(shown).join(''));
const TABLE = '| الوقت | الحرارة |\n|---|---|\n| 7 مساءً | **32°** |\n| 8 مساءً | `32` |\n| 9 مساءً | [المركز](https://www.ncm.gov.ae) |';
const reply = 'أكيد هذا الطقس.\n\n## 🌙 درجات الحرارة الليلة\n\n' + TABLE + '\n\n**نصيحتي:** خذ معك ماي.';

test('١. الجدول الكامل جدول حقيقيّ: رأس وصفوف وخلايا بعريضها وكودها ورابطها، كتلة مستقلّة يمينيّة، بلا | ظاهرة', () => {
  const c = load();
  const box = new El('div');
  c.__b(box, reply);
  const wrap = box.childNodes.find((n) => n.className === 'md-table-wrap');
  assert.ok(wrap, 'كتلة الجدول بين الأسطر لا داخل سطر');
  assert.equal(wrap._attrs.dir, 'rtl');
  const table = wrap.childNodes.find((n) => n.tagName === 'TABLE');
  assert.equal(table.className, 'md-table');
  const ths = all(table, (n) => n.tagName === 'TH').map((n) => n.textContent);
  assert.deepEqual(ths, ['الوقت', 'الحرارة']);
  const rows = all(table, (n) => n.tagName === 'TR');
  assert.equal(rows.length, 4, 'رأس + ثلاثة صفوف');
  assert.ok(all(table, (n) => n.tagName === 'STRONG' && n.textContent === '32°').length === 1, 'العريض');
  assert.ok(all(table, (n) => n.tagName === 'CODE' && /md-ic/.test(n.className) && n.textContent === '32').length === 1, 'الكود');
  const a = all(table, (n) => n.tagName === 'A')[0];
  assert.equal(a.href, 'https://www.ncm.gov.ae'); assert.equal(a.textContent, 'المركز');
  assert.ok(!/\|/.test(shown(box)), 'لا | ظاهرة: ' + shown(box));
});

test('٢. القراءة الصوتيّة كما كانت: كلمات سطور الجدول القديمة عناصر tts-word مخفيّة داخله، والعدد الكلّيّ لم يتغيّر', () => {
  const c = load();
  const box = new El('div');
  const words = c.__b(box, reply);
  const old = (c.__t2l(reply).match(/\S+/g) || []).length;
  assert.equal(words.length, old, 'عدد عناصر القراءة = عدد كلمات الردّ بعد تحويل الجدول كما كان');
  const wrap = box.childNodes.find((n) => n.className === 'md-table-wrap');
  const hidden = wrap.childNodes.filter((n) => n.className === 'tts-word' && n.style.display === 'none');
  assert.equal(hidden.length, (c.__t2l(TABLE).match(/\S+/g) || []).length);
});

test('٣. لا يُمسّ: جدول داخل سياج كود، وجدول بلا سطر فاصل يبقى سطورًا كما كان', () => {
  const c = load();
  const fenced = new El('div');
  c.__b(fenced, '```\n| a | b |\n|---|---|\n| 1 | 2 |\n```');
  assert.ok(!all(fenced, (n) => n.className === 'md-table-wrap').length, 'داخل الكود');
  assert.ok(all(fenced, (n) => n.className === 'chat-codeblock').length === 1);
  const loose = new El('div');
  c.__b(loose, 'قائمة:\n| أ | ب |\n| ج | د |');
  assert.ok(!all(loose, (n) => n.className === 'md-table-wrap').length, 'بلا فاصل = سطور');
  assert.match(shown(loose), /• أ — ب/);
});

test('٤. `الكود` المضمّن رقاقة بلا علامات: في الكلمة نفسها، والعربيّ بخطّ النصّ، والممتدّ على كلمات موصول، والسطر الجديد يغلقه', () => {
  const c = load();
  const box = new El('div');
  const raw = 'اضغط `الإعدادات` ثمّ شغّل `npm run ci` الآن\nوالسطر `مفتوح\nبعده عاديّ';
  const words = c.__b(box, raw);
  assert.equal(words.length, raw.split(/\s+/).filter(Boolean).length, 'عنصر لكلّ كلمة كما كان');
  assert.ok(!/`/.test(shown(box)), 'لا علامة ` ظاهرة: ' + shown(box));
  const chips = all(box, (n) => /\bmd-ic\b/.test(n.className) && !/md-ic-gap/.test(n.className));
  const ar = chips.find((n) => n.textContent === 'الإعدادات');
  assert.equal(ar.tagName, 'SPAN', 'العربيّ رقاقة span: خطّ المحادثة يفرض الخطّ الثابت على كلّ code');
  assert.match(ar.className, /md-ic-ar/);
  const run = chips.filter((n) => ['npm', 'run', 'ci'].includes(n.textContent));
  assert.deepEqual(run.map((n) => n.tagName + ':' + n.className.replace('md-ic', '').trim()), ['CODE:md-ic-pe', 'CODE:md-ic-ps md-ic-pe', 'CODE:md-ic-ps']);
  assert.equal(all(box, (n) => /md-ic-gap/.test(n.className)).length, 2, 'فراغان ملوّنان يصلان الرقائق الثلاث');
  const after = words.find((w) => w.textContent === 'عاديّ');
  assert.ok(after && !all(after, (n) => /md-ic/.test(n.className)).length, 'السطر الجديد أغلق الكود المفتوح');
  assert.ok(all(box, (n) => n.tagName === 'A').length === 0, 'لا رابط داخل الكود');
});

test('٥. الأنماط: جدول كامل العرض رغم .msg table{display:block}، وخطوط رفيعة بلا إطار، والرقاقة', () => {
  const css = read('css/tokens.css');
  assert.ok(css.includes('.msg .md-table{display:table; width:100%;'), 'يغلب القاعدة العامّة .msg table{display:block}');
  for (const sel of ['.md-table-wrap{display:block; width:100%;', '.md-table th{', '.md-table td{', '.md-table tbody tr:last-child td{border-bottom:0;}', '.md-ic{', '.md-ic-ar{font-family:inherit;', '.md-ic-gap{']) assert.ok(css.includes(sel), sel);
  const src = read('js/app-02-tts.js');
  assert.ok(src.includes("if(n.nodeType === 1 && (n.className === 'chat-codeblock' || n.className === 'md-table-wrap' || n.className === 'md-gallery')){ out.push(n); newLine(); return; }"), 'الجدول كتلة (والمعرض منذ v-rich-reply)');
  assert.ok(read('js/app.bundle.js').includes('function omranMdTableMark('), 'الحزمة مبنيّة من الأجزاء');
});
