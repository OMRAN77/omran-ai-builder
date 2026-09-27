'use strict';
/* v-chat-math (لقطة المالك ٢٧ سبتمبر «حل سوال 28»): المعادلات في ردّ المحادثة ظهرت LaTeX خامًا ومبعثرة
   («($text{Be}\$)»، «$$\cdot \text{Be} \cdot$$») و«---» نصًّا. الآن تُرسم بلا مكتبة ومعزولة الاتّجاه، وعدد عناصر
   القراءة الصوتيّة يبقى = كلمات الردّ، والأسعار والكود والروابط لا تُمسّ، والبثّ لا يقسم معادلة العرض. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

class Txt { constructor(t){ this.nodeType = 3; this.textContent = t; this.parentNode = null; this.className = ''; } }
class El {
  constructor(tag){
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentNode = null; this.className = ''; this.style = {}; this._attrs = {};
    const self = this;
    this.classList = {
      add(c){ if(!self.classList.contains(c)) self.className = (self.className + ' ' + c).trim(); },
      remove(c){ self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      toggle(c, on){ if(on === undefined ? !this.contains(c) : on) this.add(c); else this.remove(c); },
      contains(c){ return self.className.split(/\s+/).indexOf(c) >= 0; },
    };
  }
  appendChild(n){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; const i = this.childNodes.indexOf(ref); if(i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; }
  removeChild(n){ const i = this.childNodes.indexOf(n); if(i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  get textContent(){ return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v){ this.childNodes = []; if(v !== '' && v != null) this.appendChild(new Txt(String(v))); }
  get innerHTML(){ return this.textContent; }
  set innerHTML(v){ this.childNodes = []; }
  setAttribute(k, v){ this._attrs[k] = String(v); } getAttribute(k){ return this._attrs[k]; }
  querySelectorAll(){ return []; } addEventListener(){}
}
function load(){
  const document = { createElement: (t) => new El(t), createTextNode: (t) => new Txt(t), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, documentElement: new El('html'), head: new El('head'), body: new El('body') };
  const swallowed = [];
  const ctx = { document, navigator: { userAgent: 'node' }, localStorage: { getItem: () => null, setItem(){} }, sessionStorage: { getItem: () => null, setItem(){} },
    $: () => null, __swallow(e, where){ swallowed.push(where); }, console, setTimeout, clearTimeout, setInterval, clearInterval, Audio: function(){}, fetch: () => Promise.reject(new Error('x')), t: (k) => k, lang: 'ar',
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout, URL };
  ctx.window = ctx;
  vm.runInNewContext(read('js/app-02-tts.js') + '\n;this.__x = { buildSpokenWordSpans, renderStreamingAssistant, omranStreamSplitPoint, omranMathText };', ctx);
  return Object.assign({ ctx, swallowed }, ctx.__x);
}
const L = load();
const walk = (n, fn) => { fn(n); (n.childNodes || []).forEach((k) => walk(k, fn)); };
const all = (n, pred) => { const out = []; walk(n, (k) => { if(k.nodeType === 1 && pred(k)) out.push(k); }); return out; };
const has = (el, c) => el.nodeType === 1 && el.className.split(/\s+/).indexOf(c) >= 0;
// النصّ الظاهر: بلا العناصر المخفيّة (display:none)
const visible = (n) => n.nodeType === 3 ? n.textContent : (n.style && n.style.display === 'none' ? '' : n.childNodes.map(visible).join(''));
const render = (txt) => { const box = new El('div'); const words = L.buildSpokenWordSpans(box, txt); return { box, words }; };
const words = (s) => (String(s).match(/\S+/g) || []).length;
const PUA = /[\uE000-\uF8FF]/;

const reply = 'حل السؤال 28:\n\n*   **العنصر هو: البيريليوم ($\\text{Be}$)**\n\n---\n\n### التوضيح:\n\n1.  **الوجود في الزمرد:** حجر الزمرد الكريم نوع من معدن البريل (Beryl) وصيغته الكيميائية $\\text{Be}_3\\text{Al}_2(\\text{SiO}_3)_6$، ويُعدّ البيريليوم مكوّنًا رئيسيًّا فيه.\n2.  **الحالة الفيزيائية:** فلز صلب في درجة حرارة الغرفة والضغط الجوي العادي.\n3.  **الترميز النقطي للإلكترون (تمثيل لويس):** البيريليوم يقع في المجموعة الثانية (عدده الذري 4)، وتوزيعه الإلكتروني هو $1s^2, 2s^2$، ويمتلك **إلكتروني تكافؤ** فقط، فيُمثّل بنقطتين حول رمزه:\n    $$\\cdot \\text{Be} \\cdot$$';

test('١. ردّ المالك: المعادلات مرسومة بلا $ ولا \\text، و«---» خطّ فاصل، ومعادلة العرض في كتلتها', () => {
  const { box } = render(reply);
  const v = visible(box);
  assert.ok(!/[$\\]|text\{|cdot/.test(v), 'لا LaTeX خام ظاهر: ' + v);
  assert.ok(!PUA.test(box.textContent), 'لا رمز حارس في الناتج');
  assert.ok(v.includes('Be₃Al₂(SiO₃)₆'), 'الصيغة بأدلّة يونيكود');
  assert.ok(v.includes('1s², 2s²'), 'التوزيع بأسس يونيكود');
  assert.ok(v.includes('البيريليوم (Be)'), 'الرمز بين قوسين');
  const maths = all(box, (k) => has(k, 'om-math'));
  assert.equal(maths.length, 4);
  maths.forEach((m) => { assert.equal(m._attrs.dir, 'ltr'); assert.equal(m.style.unicodeBidi, 'isolate'); });
  const blk = maths.filter((m) => has(m, 'om-math-block'));
  assert.equal(blk.length, 1, 'سطر $$…$$ وحده معادلة عرض');
  assert.equal(blk[0].textContent, '· Be ·');
  const hr = box.childNodes.filter((b) => has(b, 'md-hr'));
  assert.equal(hr.length, 1, '«---» سطر md-hr');
  assert.equal(visible(hr[0]).trim(), '', 'الخطّ الفاصل بلا نصّ ظاهر');
  // الفاصلة العربيّة خارج عزل المعادلة فتبقى في مكانها من الجملة العربيّة
  const cfg = maths.find((m) => m.textContent.startsWith('1s'));
  assert.equal(cfg.textContent, '1s², 2s²');
  assert.equal(cfg.parentNode.textContent, '1s², 2s²،');
  // ولا غلاف اتّجاه حولها (كلماتها المخفيّة لا تُحسب في طول السلسلة اللاتينيّة)
  maths.filter((m) => !has(m, 'om-math-block')).forEach((m) => assert.ok(has(m.parentNode.parentNode, 'md-line'), 'بلا غلاف: ' + m.textContent));
});

test('٢. القراءة الصوتيّة: عدد tts-word = كلمات الردّ الخامّ، وترتيبها في الشجرة = ترتيب القائمة', () => {
  const samples = [reply,
    'قانون نيوتن $F = m a$ و$E = mc^2$ في سطر، ثمّ:\n$$\n\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n$$\nوالنهاية \\( x + y = 1 \\) هنا.',
    'the value of $x$ in the equation يساوي $\\alpha + \\beta$ تقريبًا',
    'رابط [المعادلة](https://example.com/a) و$a + b$[هنا](https://example.com) و $x^2$'];
  for(const s of samples){
    const { box, words: w } = render(s);
    assert.equal(w.length, words(s), 'العدد مطابق: ' + s.slice(0, 40));
    const inTree = all(box, (k) => has(k, 'tts-word'));
    assert.equal(inTree.length, w.length, 'لا tts-word متداخل ولا مفقود');
    inTree.forEach((k, i) => assert.equal(k, w[i], 'الترتيب ' + i));
  }
});

test('٣. المحوّل: الشائع في الكيمياء والفيزياء بلا بقايا أوامر', () => {
  const cases = [
    ['\\text{Be}_3\\text{Al}_2(\\text{SiO}_3)_6', 'Be₃Al₂(SiO₃)₆'],
    ['1s^2, 2s^2', '1s², 2s²'],
    ['\\cdot \\text{Be} \\cdot', '· Be ·'],
    ['A \\rightarrow B', 'A → B'],
    ['25^\\circ C', '25° C'],
    ['25^{\\circ}\\text{C}', '25°C'],
    ['6.022 \\times 10^{23}', '6.022 × 10²³'],
    ['10^{-3}', '10⁻³'],
    ['\\text{Fe}^{3+}', 'Fe³⁺'],
    ['\\text{SO}_4^{2-}', 'SO₄²⁻'],
    ['H_2SO_4', 'H₂SO₄'],
    ['\\ce{2H2 + O2 -> 2H2O}', '2H₂ + O₂ → 2H₂O'],
    ['\\frac{1}{2}', '1/2'],
    ['\\frac{\\pi}{2}', 'π/2'],
    ['\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', '(-b ± √(b²-4ac))/(2a)'],
    ['\\sqrt{2}', '√2'],
    ['\\sqrt[3]{8}', '³√8'],
    ['\\boxed{x = 5}', 'x = 5'],
    ['\\vec{F} = m\\vec{a}', 'F\u20D7 = ma\u20D7'],
    ['\\mathbb{R}', 'ℝ'],
    ['\\Delta H < 0', 'ΔH < 0'],
    ['\\alpha + \\beta', 'α + β'],
    ['\\pi r^2', 'πr²'],
    ['\\sin\\theta', 'sin θ'],
    ['100\\%', '100%'],
    ['\\left( x \\right)', '( x )'],
    ['v = \\frac{\\Delta x}{\\Delta t}', 'v = (Δx)/(Δt)'],
  ];
  for(const [src, want] of cases) assert.equal(L.omranMathText(src, false), want, src);
  assert.ok(!/begin|end|cases/.test(L.omranMathText('\\begin{cases} x & x > 0 \\\\ -x & x < 0 \\end{cases}', false)));
  assert.equal(L.omranMathText('x = 1 \\\\ y = 2', true), 'x = 1\ny = 2', 'سطور معادلة العرض');
  // ما لا مقابل له في يونيكود يبقى <sup>/<sub>
  const { box } = render('الدالة $e^{x}$ و$x_i$');
  const sup = all(box, (k) => k.tagName === 'SUP'), sub = all(box, (k) => k.tagName === 'SUB');
  assert.equal(sup.length, 1); assert.equal(sup[0].textContent, 'x');
  assert.equal(sub.length, 1); assert.equal(sub[0].textContent, 'i');
});

test('٤. لا تُمسّ: الأسعار والكود والمتغيّرات وأقواس المراجع', () => {
  const keep = [
    'السعر $5 و $10', 'بين $5 و$10', '$5-$10 شهريًّا', '$5/$10', 'الباقة 10$ والأخرى 20$ شهريًّا', 'السعر 10$/شهر و 20$/سنة',
    'from $5,000 to $10,000', 'USD$5 or USD$6', 'echo $HOME$PATH', 'costs $5 (about $6)',
    'مطعم A ($$) والمطعم B ($$$)', 'نكتب $$name للمتغيّر ثمّ $$other',
    'استخدم `${a}` و`${b}`', 'الأمر `cp $(pwd)/$(date).log`', 'قيم ${a}${b} و$(CC)$(CFLAGS)', 'في PHP `$_GET` و$_POST',
    'المرجع \\[1\\] والملاحظة \\(ملاحظة\\)', '```bash\necho $x$ and $$\n```',
  ];
  for(const s of keep){
    const { box, words: w } = render(s);
    assert.equal(all(box, (k) => has(k, 'om-math')).length, 0, 'ليست معادلة: ' + s);
    assert.ok(!PUA.test(box.textContent), 'لا رمز حارس: ' + s);
    assert.equal(w.length, words(s), 'العدد: ' + s);
    assert.equal((box.textContent.match(/\$/g) || []).length, (s.match(/\$/g) || []).length, 'علامات $ باقية: ' + s);
  }
  // معادلة حقيقيّة بجانب سعر في الجملة نفسها
  const mix = render('السعر $5 فقط، والقانون $v = d/t$');
  assert.equal(all(mix.box, (k) => has(k, 'om-math')).length, 1);
  assert.ok(visible(mix.box).includes('$5'), 'السعر باقٍ');
});

test('٥. الروابط والرمز الحارس: لا تسرّب ولا انهيار', () => {
  const a = render('انظر [المعادلة $x^2$ هنا](https://example.com/p) و https://example.com/$a$/b');
  const links = all(a.box, (k) => k.tagName === 'A');
  assert.equal(links.length, 2);
  assert.equal(links[0].href, 'https://example.com/p');
  assert.equal(links[1].href, 'https://example.com/$a$/b');
  assert.ok(!PUA.test(a.box.textContent));
  // نصّ الردّ نفسه فيه أحرف الحارس: لا التقاط ولا خطأ
  const b = render('غريب \uE0000\uE001 و $x^2$');
  assert.ok(b.box.textContent.includes('$x^2$'), 'بلا التقاط حين يوجد الحارس أصلًا');
  // تعثّر رسم معادلة: تبقى خامًا ويكمل الرسم، والعدد سليم
  const orig = L.ctx.omranMathEl;
  L.ctx.omranMathEl = () => { throw new Error('boom'); };
  try{
    const c = render('قبل $a + b$ بعد');
    assert.ok(c.box.textContent.includes('$a + b$'), 'المصدر خامًا');
    assert.equal(c.words.length, words('قبل $a + b$ بعد'));
    assert.ok(L.swallowed.includes('md:math-el'));
  } finally { L.ctx.omranMathEl = orig; }
});

test('٦. الخطّ الفاصل: --- و*** و___ وحدها في سطر، و*** لا يقلب الخطّ العريض لما بعده', () => {
  for(const mk of ['---', '***', '___']){
    const { box, words: w } = render('سطر أول\n' + mk + '\nسطر ثاني');
    const lines = box.childNodes.filter((b) => has(b, 'md-line'));
    assert.equal(lines.length, 3, mk);
    assert.ok(has(lines[1], 'md-hr'), mk + ' خطّ');
    assert.ok(!has(lines[1], 'md-li'), mk + ' ليس نقطة');
    assert.ok(!all(lines[2], (k) => has(k, 'md-bold')).length, mk + ' لا عريض بعده');
    assert.equal(w.length, 5);
  }
  const inText = render('الفرق --- كبير');
  assert.equal(inText.box.childNodes.filter((b) => has(b, 'md-hr')).length, 0, 'داخل الجملة ليس خطًّا');
});

test('٧. الاتّجاه: جملة إنجليزيّة فيها معادلة تبقى سلسلة واحدة، والنصّ اللاتينيّ الملتصق يُعزل معها، والعربيّة rtl', () => {
  const a = render('في الكتاب: the value of $x$ in the equation يساوي خمسة');
  const wraps = all(a.box, (k) => k._attrs.dir === 'ltr' && !has(k, 'om-math') && !has(k, 'md-line'));
  assert.equal(wraps.length, 1, 'غلاف واحد');
  assert.equal(wraps[0].textContent.trim(), 'the value of x in the equation');
  const b = render('المحور $x$-axis هنا و Ca(OH)$_2$ كذلك');
  const tok = all(b.box, (k) => has(k, 'md-math'));
  assert.equal(tok.length, 2);
  tok.forEach((k) => { assert.equal(k._attrs.dir, 'ltr'); assert.equal(k.style.unicodeBidi, 'isolate'); });
  assert.equal(tok[1].textContent, 'Ca(OH)₂');
  const c = render('السرعة $\\text{السرعة} = \\frac{\\text{المسافة}}{\\text{الزمن}}$ هنا');
  const m = all(c.box, (k) => has(k, 'om-math'));
  assert.equal(m.length, 1);
  assert.equal(m[0]._attrs.dir, 'rtl', 'معادلة بمتغيّرات عربيّة تُقرأ من اليمين');
  assert.equal(m[0].textContent, 'السرعة = (المسافة)/(الزمن)');
});

test('٨. البثّ: لا قطع داخل $$ أو \\[ مفتوحة، ولا تعطيل للرسم التدريجيّ بسبب $$ في الكود أو $$$، والنتيجة = البناء الكامل', () => {
  const body = Array.from({ length: 60 }, (_, i) => (i + 1) + '. سطر شرح رقم ' + (i + 1) + ' فيه كلمات كافية للطول.').join('\n');
  const openBlock = body + '\n\nالقانون:\n$$\nE = mc^2 +\n';
  const cut = L.omranStreamSplitPoint(openBlock);
  assert.ok(cut > 0 && !openBlock.slice(cut).startsWith('$$') && openBlock.slice(cut).includes('$$'), 'القطع قبل سطر الفاتح');
  assert.ok(!/\$\$/.test(openBlock.slice(0, cut)), 'الرأس بلا فاتح');
  const openBr = body + '\n\n\\[\nx = \\frac{1}{2}\n';
  assert.ok(!openBr.slice(0, L.omranStreamSplitPoint(openBr)).includes('\\['), '\\[ المفتوحة في الذيل');
  const fencePid = 'مقدّمة\n```bash\necho $$\n```\n' + body + '\n\nخاتمة';
  assert.ok(L.omranStreamSplitPoint(fencePid) > 1000, '$$ داخل الكود لا يعطّل التقسيم');
  const tiers = 'مطعم ($$$) وآخر ($$)\n' + body + '\n\nخاتمة';
  assert.ok(L.omranStreamSplitPoint(tiers) > 0, 'فئات الأسعار لا تعطّل التقسيم');
  const far = 'PHP يستعمل $$name\n' + body + '\n' + body + '\n\nخاتمة';
  assert.ok(L.omranStreamSplitPoint(far) > far.length - 20, 'فاتح بعيد جدًّا ليس معادلة مفتوحة');
  // بثّ حقيقيّ حرفًا حرفًا (بخطوة) ثمّ المطابقة
  const text = body + '\n\nالقانون:\n$$\n\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n$$\nوأيضًا:\n\\[\nE = mc^2\n\\]\nثمّ $x^2$ و**النهاية**.\n' + body;
  const el = new El('div');
  for(let n = 20; n <= text.length + 20; n += 20) L.renderStreamingAssistant(el, text.slice(0, n));
  const full = render(text).box;
  assert.equal(el.textContent, full.textContent, 'النصّ بعد البثّ = البناء الكامل');
  assert.equal(all(el, (k) => has(k, 'om-math')).length, 3);
  assert.ok(!/\$\$|\\\[/.test(visible(el)), 'لا فاتح خام باقٍ');
});

test('٩. الربط: الأنماط في tokens.css (عامّة لا للحاسوب وحده) والوسم مرفوع، وبلا lookbehind في الراسم', () => {
  const css = read('css/tokens.css');
  assert.ok(css.includes('.msg .md-line.md-hr{height:0; overflow:hidden; margin:.7em 0; border-top:1px solid var(--omLine'));
  assert.ok(css.includes('.msg .om-math-block{display:block; text-align:center;'));
  assert.ok(css.includes('.msg .om-math sup, .msg .om-math sub{font-size:.72em; line-height:0;}'));
  assert.ok(css.indexOf('.msg .md-line.md-hr{') > css.indexOf('.msg .md-line, .msg-text div.md-line{'), 'بعد قاعدة md-line كي يغلب هامشها');
  assert.match(read('index.html'), /css\/tokens\.css\?v=725/);
  assert.ok(!/\(\?<[!=]/.test(read('js/app-02-tts.js')), 'لا lookbehind (سفاري قديم)');
  assert.ok(!/[\uE000-\uF8FF]/.test(read('js/app-02-tts.js')), 'الرموز الحارسة مكتوبة بالهروب \\uE000 لا حرفيًّا');
});
