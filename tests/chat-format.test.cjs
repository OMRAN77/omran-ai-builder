'use strict';
/* v-md-blocks + v-num-plain + v-inline-links-stay + v-chat-font-plex + v-site-guide (المالك ٢٣ سبتمبر):
   «الكتابة غير نظاميّة وغير مرتّبة في أوقات، والخطّ مش جميل، والأرقام تطلع باللون الذهبيّ — أريد فقط الروابط اللي
   تفتح ذهبيّة… يقول ادخل الرابط على طول… يعطيني مرّة أو مرّتين صحّ والباقي يخربط». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

class Txt { constructor(t){ this.nodeType = 3; this.textContent = t; this.parentNode = null; this.className = ''; } }
class El {
  constructor(tag){ this.tagName = tag; this.nodeType = 1; this.childNodes = []; this.parentNode = null; this.className = ''; this.style = {}; this._attrs = {}; this.classList = { add: (c) => { this.className += ' ' + c; }, remove(){}, toggle(){}, contains(){ return false; } }; }
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
  vm.runInNewContext(read('js/app-02-tts.js') + '\n;this.__b = buildSpokenWordSpans;', ctx);
  return ctx.__b;
}
const reply = '## أفضل ٣ مطاعم\nقائمة لعام 2026:\n\n1. **مطعم الشرق** — التقييم 4.8\n3. **Zuma Dubai** — الحجز على zuma.com\n- الأسعار تقريبية\n```js\nconst a = 1;\n```\nThis whole line is plain English text only.';

test('١. كلّ سطر كتلة باتّجاه صريح: سطر يبدأ بالإنجليزيّ في ردّ عربيّ يبقى يمينًا، والإنجليزيّ الخالص يسارًا', () => {
  const build = load();
  const box = new El('div');
  const words = build(box, reply);
  const lines = box.childNodes.filter((n) => /\bmd-line\b/.test(n.className));
  const byText = (s) => lines.find((l) => l.textContent.includes(s));
  assert.equal(byText('Zuma Dubai')._attrs.dir, 'rtl', 'سطر القائمة الذي يبدأ بالإنجليزيّ لا ينقلب');
  assert.equal(byText('plain English')._attrs.dir, 'ltr');
  assert.equal(byText('قائمة لعام')._attrs.dir, 'rtl');
  assert.ok(box.childNodes.some((n) => n.className === 'chat-codeblock'), 'صندوق الكود كتلة مستقلّة');
  assert.ok(words.length > 20, 'عناصر القراءة الصوتيّة باقية');
  assert.ok(!box.childNodes.some((n) => n.nodeType === 3), 'لا نصّ خام بين الكتل');
});

test('٢. علامات القائمة معلّقة: الرقم والنقطة عنصر md-mk، والعنوان كتلة md-hb', () => {
  const build = load();
  const box = new El('div');
  build(box, reply);
  const lines = box.childNodes.filter((n) => /\bmd-line\b/.test(n.className));
  const oli = lines.filter((l) => /\bmd-oli\b/.test(l.className));
  assert.equal(oli.length, 2);
  assert.match(oli[0].childNodes.find((k) => /md-mk/.test(k.className)).textContent, /^1\.$/);
  assert.ok(lines.some((l) => /\bmd-li\b/.test(l.className)), 'النقطة');
  assert.ok(/\bmd-hb\b/.test(lines[0].className), 'العنوان');
  const css = read('css/tokens.css');
  assert.ok(css.includes('.msg .md-line, .msg-text div.md-line{unicode-bidi:isolate;'), 'الاتّجاه الصريح يغلب plaintext');
  assert.ok(css.includes('.msg .md-line[dir="rtl"] .tts-word.md-mk{right:0; left:auto;}'));
});

test('٣. الأرقام بلون النصّ: مُلوِّن الأرقام الذهبيّ (.numHL) أُزيل، والروابط وحدها ذهبيّة', () => {
  const html = read('index.html');
  assert.ok(!/\.numHL\s*\{/.test(html) && !html.includes("sp.className = 'numHL'"), 'لا مُلوِّن أرقام');
  assert.ok(html.includes('.msg.assistant a{color:#e3b341 !important;'), 'الروابط ذهبيّة');
});

test('٤. الروابط في النصّ تبقى روابط تُفتح مهما كان عددها، والمصادر لا تكرّرها', () => {
  const s = read('js/app-04-i18n-state.js');
  assert.ok(!s.includes("span.className = 'msgInlineRef';"), 'لا تحويل للروابط إلى نصّ');
  assert.ok(s.includes('const validSrcs = __srcBase.filter(s => !__inlineLinks.some(l => __normU(l.url) === __normU(s.url))).slice(0, 15);'));
  assert.ok(read('js/app.bundle.js').includes('v-inline-links-stay'), 'الحزمة مطابقة');
});

test('٥. الخطّ الافتراضيّ IBM Plex Sans Arabic محمَّل، وتجوال باقٍ خيارًا', () => {
  const f = read('js/app-19-fonts.js');
  assert.ok(f.includes(`{id:'default', ar:'الافتراضي', en:'Default', family:"'IBM Plex Sans Arabic'", google:'', line:1.8},`));
  assert.ok(f.includes(`{id:'tajawal', ar:'تجوال', en:'Tajawal', family:"'Tajawal'"`));
  assert.ok(read('index.html').includes('family=IBM+Plex+Sans+Arabic:wght@400;500;700'), 'يُحمَّل مع الصفحة');
  assert.ok(read('css/tokens.css').includes(":root{--omran-chat-font:'IBM Plex Sans Arabic',"));
});

test('٦. الإرشاد داخل موقع: خطوات بأسماء الأزرار من صفحة مُتحقَّقة، لا رابط عميق من الذاكرة', () => {
  const c = read('api/_lib/chat.js');
  assert.ok(c.includes('[الإرشاد داخل موقع'));
  assert.ok(c.includes('ممنوع رابط عميق لم تفتحه'));
  assert.ok(c.includes('اطلب لقطة شاشة وأكمل منها خطوة خطوة'));
});
