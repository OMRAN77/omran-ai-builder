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
// النصّ الظاهر: بلا العناصر المخفيّة (display:none) ولا علامة المشاركة المخفيّة بصريًّا (om-math-sr)، وبلا
// الفواصل غير المرئيّة (NBSP ⇐ مسافة، ووصلة الكلمة وفرصة الالتفاف تُحذفان)
const norm = (s) => s.replace(/\u00A0/g, ' ').replace(/[\u2060\u200B]/g, '');
const visible = (n) => n.nodeType === 3 ? norm(n.textContent) : (n.style && n.style.display === 'none') || has(n, 'om-math-sr') ? '' : n.childNodes.map(visible).join('');
const txt = visible;
// نصّ المشاركة (innerText): يشمل علامة om-math-sr
const share = (n) => n.nodeType === 3 ? norm(n.textContent) : (n.style && n.style.display === 'none') ? '' : n.childNodes.map(share).join('');
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
  const cfg = maths.find((m) => txt(m).startsWith('1s'));
  assert.equal(txt(cfg), '1s², 2s²');
  assert.equal(txt(cfg.parentNode), '1s², 2s²،');
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
  const S = (x) => '\u0001' + x + '\u0002', B = (x) => '\u0003' + x + '\u0004';
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
    ['v = \\frac{\\Delta x}{\\Delta t}', 'v = Δx/Δt'],
    // مراجعة ١: أمر ملتصق بأمر لا يندمج اسماهما فيسقطان
    ['\\Delta\\text{H} = -286\\,\\text{kJ/mol}', 'ΔH = -286 kJ/mol'],
    ['\\text{kJ}\\cdot\\text{mol}^{-1}', 'kJ · mol⁻¹'],
    ['5\\,\\mu\\text{m}', '5 μm'],
    ['\\cdot\\text{Be}\\cdot', '· Be ·'],
    ['\\vec{F} = q\\vec{v}\\times\\vec{B}', 'F\u20D7 = qv\u20D7 × B\u20D7'],
    ['\\text{m}\\cdot\\text{s}^{-1}', 'm · s⁻¹'],
    // الكسر مجموعة واحدة
    ['\\frac{1}{2}', '½'],
    ['KE = \\frac{1}{2}mv^2', 'KE = ½mv²'],
    ['d = v_0t + \\frac{1}{2}at^2', 'd = v₀t + ½at²'],
    ['2\\frac{1}{2}', '2½'],
    ['3\\frac{3}{4} = \\frac{15}{4}', '3¾ = 15/4'],
    ['2\\frac{5}{7}', '2 5/7'],
    ['\\frac{a}{b}^2', '(a/b)²'],
    ['\\frac{a}{b}c', '(a/b)c'],
    ['\\frac{\\pi}{4}r^2', '(π/4)r²'],
    ['\\frac{2}{5}\\frac{3}{7} = \\frac{6}{35}', '⅖(3/7) = 6/35'],
    // مراجعة ٢: المشتقّات بلا أقواس زائدة
    ['\\frac{dy}{dx}', 'dy/dx'],
    ['\\frac{d^2y}{dx^2}', 'd²y/dx²'],
    ['\\frac{\\partial f}{\\partial x}', '∂f/∂x'],
    ['\\frac{d}{dx} x^2', 'd/dx x²'],
    // المصفوفة بأقواسها، والحالات بقوسها وقيمة، شرط
    ['A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}', 'A = (1 2; 3 4)'],
    ['\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}', '[1 0; 0 1]'],
    ['f(x) = \\begin{cases} x^2 & x \\geq 0 \\\\ -x & x < 0 \\end{cases}', 'f(x) = { x², x ≥ 0; -x, x < 0'],
    // مراجعة ٢: شحنات \ce، والنفي والعلاقات، والنظيم، والمعيار، والمحدِّد الفارغ، و\limits
    ['\\ce{Cu2+}', 'Cu²⁺'],
    ['\\ce{Fe3+}', 'Fe³⁺'],
    ['\\ce{NH4+}', 'NH₄⁺'],
    ['\\ce{Na+}', 'Na⁺'],
    ['\\ce{SO4^2-}', 'SO₄²⁻'],
    ['\\ce{H2O <=> H+ + OH-}', 'H₂O ⇌ H⁺ + OH⁻'],
    ['\\ce{Ca2+ + CO3^2- -> CaCO3 v}', 'Ca²⁺ + CO₃²⁻ → CaCO₃ ↓'],
    ['x \\not= 0', 'x ≠ 0'],
    ['a \\not\\in B', 'a ∉ B'],
    ['x \\lt 5', 'x < 5'],
    ['N_2 + 3H_2 \\xrightleftharpoons{Fe} 2NH_3', 'N₂ + 3H₂ ⇌' + S('Fe') + ' 2NH₃'],
    ['\\bigcup_{i=1}^{n} A_i', '⋃' + B('i=1') + 'ⁿ A' + B('i')],
    ['\\lbrace 1, 2 \\rbrace', '{ 1, 2 }'],
    ['5\\,\\text{\\AA}', '5 Å'],
    ['\\mathring{A}', 'A\u030A'],
    ['a \\equiv b \\pmod{n}', 'a ≡ b (mod n)'],
    ['17 \\bmod 5 = 2', '17 mod 5 = 2'],
    ['\\|\\vec{v}\\| = 5', '‖v\u20D7‖ = 5'],
    ['\\left. x^2 \\right|_0^1 = 1', 'x² |₀¹ = 1'],
    ['\\sum\\limits_{i=1}^{n} i^2', '∑' + B('i=1') + 'ⁿ i²'],
    ['\\lim\\limits_{x \\to 0} f(x)', 'lim' + B('x → 0') + ' f(x)'],
    ['\\overrightarrow{AB} = \\vec{b} - \\vec{a}', '\u0005AB\u0006 = b\u20D7 - a\u20D7'],
    ['\\foo x', '\\foo x'],
  ];
  for(const [src, want] of cases) assert.equal(L.omranMathText(src, false), want, src);
  assert.equal(L.omranMathText('x = 1 \\\\ y = 2', true), 'x = 1\ny = 2', 'سطور معادلة العرض');
  assert.equal(L.omranMathText('\\begin{aligned} x &= 2 + 3 \\\\ &= 5 \\end{aligned}', true), 'x = 2 + 3\n= 5');
  // ما لا مقابل له في يونيكود يبقى <sup>/<sub>
  const { box } = render('الدالة $e^{x}$ و$x_i$');
  const sup = all(box, (k) => k.tagName === 'SUP'), sub = all(box, (k) => k.tagName === 'SUB');
  assert.equal(sup.length, 1); assert.equal(txt(sup[0]), 'x');
  assert.equal(sub.length, 1); assert.equal(txt(sub[0]), 'i');
  // متّجه اسمه حرفان: سهم فوق الاسم كلّه
  const vec = all(render('المتّجه $\\overrightarrow{AB}$ هنا').box, (k) => has(k, 'om-vec'));
  assert.equal(vec.length, 1); assert.equal(txt(vec[0]), 'AB');
});

// ما يجب أن يُرسم: لا $ ولا \( ظاهرة بعد الرسم
const drawn = [
  'ثاني أكسيد الكربون CO$_2$ والماء H$_2$O والأيونات Na$^+$ وCl$^-$ والنظير $^{14}$C عند 25$^\\circ$C',
  'قانون السرعة: $ع = \\frac{ف}{ز}$ حيث $ف$ المسافة و$ز$ الزمن، والحدّ $n$th',
  'الجذران $x = 2$ و $3$ والنقطة $(2, 3)$ والاحتمال $1/6$ و$-5$ والفترة $[0, 1]$ والنسبة $3:4$ والناتج $12$.',
  'Let \\( x \\) be the number where \\( x > 0 \\) and \\( a + b \\) and \\( 12 \\) and \\( f(x) \\).',
  'نفرض أن \\( x \\) عدد الساعات، و\\[ (x - 2)(x + 3) \\]',
  '$NaOH$ و$NaCl$ و$AgCl$ و$KCl$ والمربع $ABCD$ و$PQRS$ و$Area = lw$ و$arcsin(x)$ و$sinx$ و$AaBb$',
  'حل المعادلة $2س + 3 = 11$ فنجد $س = 4$ والحجم $ح = ط × ع × ل$',
  'Water boils at $100^{\\circ}$C, a 3$\\times$3 matrix, the $(k+1)$th term, the $x_i$s, $1.0 \\times 10^{-3}$M, $H_2O$(l), 5$\\pm$0.1 cm, $\\sim$10',
  'المشتقّة $f\'$ و$f\'\'$ والصورة $A\'$',
  'The factored form is:\n$$(x - 2)(x - 3)$$',
  'الجواب:\n$$\n42\n$$',
  '$$\nx = 5\n$$ where $x$ is the solution.',
  'We get: $$\nx = 5\n$$',
  'If a pen costs $\\$2$, then 3 pens cost $3 \\times \\$2 = \\$6$.',
  'In French notation $x \\in ]0, 1[$',
];

test('٤. لا تُمسّ: الأسعار والكود والمتغيّرات وأقواس المراجع وتعابير regex، ويُرسم ما هو معادلة فعلًا', () => {
  const keep = [
    'السعر $5 و $10', 'بين $5 و$10', '$5-$10 شهريًّا', '$5/$10', 'الباقة 10$ والأخرى 20$ شهريًّا', 'السعر 10$/شهر و 20$/سنة',
    'from $5,000 to $10,000', 'USD$5 or USD$6', 'echo $HOME$PATH', 'costs $5 (about $6)',
    'مطعم A ($$) والمطعم B ($$$)', 'نكتب $$name للمتغيّر ثمّ $$other',
    'استخدم `${a}` و`${b}`', 'الأمر `cp $(pwd)/$(date).log`', 'قيم ${a}${b} و$(CC)$(CFLAGS)', 'في PHP `$_GET` و$_POST',
    'المرجع \\[1\\] والملاحظة \\(ملاحظة\\)', '```bash\necho $x$ and $$\n```',
    // مراجعة ١: $$ في كلام إنجليزيّ وقوائم (فئات أسعار، PID، PHP، SQL)
    'أفضل المطاعم في دبي:\n1. **Zuma** – $$$\n2. **La Petite Maison** – $$\n3. **Il Borro** – $$\n4. **Ravi** – $',
    'مطاعم مقترحة:\n- Zuma Dubai ($$)\n- Ravi Restaurant ($$)',
    '1. Zuma ($$$) - Japanese\n2. Nobu ($$) - sushi\n3. Salt ($$) - burgers',
    'Restaurant tiers: $$ (moderate), $$ (moderate)', 'Restaurant A ($$) and restaurant B ($$) are both cheap.',
    'The PID is $$ and the parent is $PPID; kill $$ to stop.', 'In bash, $$ gives the PID and echo $$ prints it.',
    'PHP variable variables: $$name and $$other', 'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;',
    'Price: $$ (moderate). Parking: $$ extra.',
    // مراجعة ٢: $$ داخل السطر في باش وPHP وSQL
    'echo $$ > /tmp/pid; kill -9 $$', 'tmp=/tmp/a.$$; log=/tmp/b.$$', "PHP variable variables: $$name = 'x'; echo $$name;",
    'AS $$ SELECT a + b $$', "CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;",
    // رأس عمود «($)» وسعر ثمّ رمز عملة
    '| Month | Revenue ($) | Cost ($) | Profit ($) |\n|---|---|---|---|\n| Jan | 5,000 | 3,000 | 2,000 |',
    'Revenue ($) and Cost ($) are shown below.', '**Revenue ($)** vs **Cost ($)** for Q1.', 'Price ($): 5, Total ($): 50',
    'Revenue grew from $5M to US$ 7M.', 'Costs $5 in the US and about A$ 8 in Australia.', 'Price: $5 (previously 10$).',
    'It costs $5 (A$ 7) in Australia.', 'Price: $5 or C$ 7.', '$5 vs A$ 8', 'about $3 (S$ 4)', 'from $2 to R$ 10', '=$A2^$B2',
    // regex وjQuery وMake خارج علامات الكود
    'match \\(\\d+\\) groups', 'Regex: \\[\\w+\\]', 'regex /^\\s*$/ and /^\\d+$/', 'grep "^$" file and grep "x$"', 'Makefile $<$@', '$.ajax();$.get()',
    'Use the regex ^$|^\\s+$ to match blank lines.', 'Integer or decimal: ^\\d+$|^\\d+\\.\\d+$',
    'Use the regex \\([^)]*\\) to remove text in parentheses.', 'Regex \\[[^\\]]*\\] matches [text].', "sed 's/\\([^,]*\\),\\(.*\\)/\\2 \\1/' swaps fields",
    // أقواس مهرّبة حول snake_case وفهرسة
    'The key \\(user_id\\) is required.', 'See \\[TODO_ITEM\\] and \\[file_name.txt\\] in the list.', 'المفتاح \\(api_key\\) مطلوب', 'مصفوفة arr\\[i_j\\] هنا',
    // $$ و\[ لا تعبران كتلة كود، ومعادلة ملتصقة بعلامة كود غالقة
    'Use $$ for PID, e.g.\n```bash\necho $$\nkill -9 $$\n```\nand then continue.',
    'Escape brackets like \\[ in a regex:\n```js\nconst re = /\\]/;\n```\nDone.',
    // جولة ٣: رموز الأسهم والعملات الرقميّة ومراجع Excel وأسماء متغيّرات PHP ومدى الأسعار
    '$AAPL and $TSLA are up today', '$AAPL, $TSLA and $MSFT', '$AAPL/$TSLA pair', 'Buy $BTC at $60k', '$BTC hit $100k and $ETH $3,500',
    'سهم $AAPL وسهم $TSLA ارتفعا', '$AAPL ($TSLA)', '$AAPL rose 5% while $TSLA fell 2%', '$NVDA: $120 → $135', '$BTC 10$',
    '=$A$1+$B$2', '=SUM($A$1:$A$10)', 'use $A$1 as an absolute reference and $B2 as mixed', '=VLOOKUP($A2,$D$2:$E$100,2,FALSE)',
    'echo $a$b', 'echo $HOME/bin:$PATH', 'export PATH=$PATH:$HOME/bin', 'cost is $5.99/mo or $59/yr', '$5 + $10 = $15', 'I have $2 and you have $3',
    'jQuery $(".x").hide(); $("#y")', 'SQL: WHERE price > $1 AND qty < $2', 'Perl: my $x = $y + $z;', 'من بين $BTC $_GET$HOME درهم',
    '$5 ,20$ فقط', 'السعر $5 - 10$ تقريبًا', 'costs $1,000 20$', '${a} A$ هنا',
  ];
  for(const s of keep){
    const { box, words: w } = render(s);
    assert.equal(all(box, (k) => has(k, 'om-math')).length, 0, 'ليست معادلة: ' + s);
    assert.ok(!PUA.test(box.textContent), 'لا رمز حارس: ' + s);
    if(!/^\|/m.test(s)) assert.equal(w.length, words(s), 'العدد: ' + s);
    assert.equal((box.textContent.match(/\$/g) || []).length, (s.match(/\$/g) || []).length, 'علامات $ باقية: ' + s);
  }
  const tiers = render('1. Zuma ($$$) - Japanese\n2. Nobu ($$) - sushi\n3. Salt ($$) - burgers');
  assert.equal(tiers.box.childNodes.filter((b) => has(b, 'md-oli')).length, 3, 'ثلاثة بنود مستقلّة');
  const mix = render('السعر $5 فقط، والقانون $v = d/t$');
  assert.equal(all(mix.box, (k) => has(k, 'om-math')).length, 1);
  assert.ok(visible(mix.box).includes('$5'), 'السعر باقٍ');
  const pid = render('Use echo $$ to print the PID; the area is $$\\pi r^2$$.');
  const pm = all(pid.box, (k) => has(k, 'om-math'));
  assert.equal(pm.length, 1); assert.equal(txt(pm[0]), 'πr²');
  assert.ok(visible(pid.box).includes('echo $$ to'), 'الـPID باقٍ');
  // المعادلة القصيرة لا تنكسر (om-math-nw)، والطويلة تلتفّ عند معاملاتها لا بين حرف وأسّه
  const nb = all(render('الوحدة $\\text{kJ}\\cdot\\text{mol}^{-1}$ والمتّجه $\\overrightarrow{AB} = \\vec{b} - \\vec{a}$ هنا').box, (k) => has(k, 'om-math'));
  nb.forEach((k) => assert.ok(has(k, 'om-math-nw'), 'القصيرة لا تنكسر: ' + txt(k)));
  assert.equal(txt(nb[0]), 'kJ · mol⁻¹');
  const lg = all(render('$a_1^2+a_2^2+a_3^2+a_4^2+a_5^2+a_6^2+a_7^2+a_8^2+a_9^2+b_1^2+b_2^2+b_3^2$').box, (k) => has(k, 'om-math'))[0];
  assert.ok(!has(lg, 'om-math-nw') && /\+\u200B/.test(lg.textContent), 'الطويلة تلتفّ بعد «+»');
  // ما هو معادلة فعلًا يُرسم (مراجعة ٢: أرقام، \( x \)، صيغ كيميائيّة، متغيّرات عربيّة، وحدات بعدها، شرطات، معادلات عرض)
  for(const s of drawn){
    const { box, words: w } = render(s);
    const v = visible(box);
    assert.ok(!/\$|\\\(|\\\[/.test(v.replace(/\$[26]/g, '')), 'مرسومة: ' + s + ' ⇐ ' + v);
    assert.equal(w.length, words(s), 'العدد: ' + s);
  }
  const arr = render('نجمع:\n$$\n\\begin{array}{r}\n  123 \\\\\n+ 456 \\\\\n\\hline\n  579\n\\end{array}\n$$');
  assert.equal(all(arr.box, (k) => has(k, 'om-math-block')).length, 1, 'البيئة كتلة');
  assert.equal(arr.box.childNodes.filter((b) => has(b, 'md-li')).length, 0, '«+ 456» ليس بند قائمة');
  const money = all(render(drawn[13]).box, (k) => has(k, 'om-math'));
  assert.equal(money.length, 2); assert.equal(txt(money[1]), '3 × $2 = $6');
});

test('٥. الروابط والكود والرمز الحارس: لا تسرّب ولا انهيار، والعدد سليم', () => {
  const a = render('انظر [المعادلة $x^2$ هنا](https://example.com/p) و https://example.com/$a$/b');
  const links = all(a.box, (k) => k.tagName === 'A');
  assert.equal(links.length, 2);
  assert.equal(links[0].href, 'https://example.com/p');
  assert.equal(links[1].href, 'https://example.com/$a$/b');
  assert.ok(!PUA.test(a.box.textContent));
  const leaks = [
    'Run ```npm i``` then $x^2$', '```\ncode```\n$a b$', 'a`b ```\n$x y$\n```', '```\ncode\n```$a b$', '```js\nx\n```$x^2 + y^2$ هنا نص', '```js\nlet a = 1;\n```$x + y$ بعد',
    'مثال:```python\nx = 1\n```\nوالقيمة $y^2$ هنا.', '[a\n$x$](https://b.com)', "[a\nc](https://x.com/'$b$')",
    'المجال [0, 1) والقيمة $x^2$ موجبة.\nالمصدر: [ويكيبيديا](https://ar.wikipedia.org/wiki/Math)',
    'انظر [المعادلة $E=mc^2$\nهنا](https://example.com)',
  ];
  for(const s of leaks){
    const { box, words: w } = render(s);
    assert.ok(!PUA.test(box.textContent), 'لا حارس في النصّ: ' + s);
    all(box, (k) => k.tagName === 'A').forEach((k) => assert.ok(!PUA.test(k.href) && !PUA.test(k.title || ''), 'لا حارس في الرابط: ' + s));
    const inTree = all(box, (k) => has(k, 'tts-word'));
    assert.equal(inTree.length, w.length, 'tts-word في الشجرة = القائمة: ' + s);
    if(!/\]\(/.test(s)) assert.equal(w.length, words(s), 'العدد كما كان: ' + s);
  }
  // مراجعة ٢: حرف الحارس في نصّ الردّ نفسه لا يغيّر شيئًا (لا روابط تسقط ولا أرقام تُحذف)
  const b = render('غريب \uE0000\uE001 هنا و $x^2$ و https://a.com/x الآن');
  assert.ok(b.box.textContent.includes('\uE0000\uE001') && b.box.textContent.includes('$x^2$'), 'بلا التقاط ولا حذف');
  assert.equal(all(b.box, (k) => k.tagName === 'A').length, 1, 'الرابط باقٍ');
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

test('٧. الاتّجاه: سلسلة إنجليزيّة واحدة، والمعادلة اللاتينيّة ltr ولو بتسميات عربيّة، والعربيّة rtl بأسهم معكوسة، والأقواس والسوابق خارج العزل', () => {
  const a = render('في الكتاب: the value of $x$ in the equation يساوي خمسة');
  const wraps = all(a.box, (k) => k._attrs.dir === 'ltr' && !has(k, 'om-math') && !has(k, 'md-line'));
  assert.equal(wraps.length, 1, 'غلاف واحد');
  assert.equal(txt(wraps[0]).trim(), 'the value of x in the equation');
  const b = render('المحور $x$-axis هنا و Ca(OH)$_2$ كذلك');
  const tok = all(b.box, (k) => has(k, 'md-math'));
  assert.equal(tok.length, 2);
  tok.forEach((k) => { const iso = k.childNodes[0]; assert.equal(iso._attrs.dir, 'ltr'); assert.equal(iso.style.unicodeBidi, 'isolate'); assert.equal(k.childNodes.length, 1); });
  assert.equal(txt(tok[1]), 'Ca(OH)₂');
  const deg = all(render('عند 25$^\\circ$C، والضغط').box, (k) => has(k, 'md-math'))[0];
  assert.equal(deg.childNodes[0]._attrs.dir, 'ltr'); assert.equal(txt(deg.childNodes[0]), '25°C'); assert.equal(deg.childNodes[1].textContent, '،');
  // مراجعة ٢: قوس شريكه خارج التوكن يبقى خارج العزل (وإلّا رُسم بلا انعكاس)، والسابقة العربيّة خارجه
  const br = all(render('غاز ثاني أكسيد الكربون (مثل CO$_2$) مهم، والأيونات (Na$^+$ و Cl$^-$) في الملح، ثمّ وCl$^-$ هنا').box, (k) => has(k, 'md-math'));
  assert.equal(br.length, 4);
  assert.deepEqual(br[0].childNodes.map((k) => k.nodeType === 3 ? 'T:' + k.textContent : 'I:' + txt(k)), ['I:CO₂', 'T:)']);
  assert.deepEqual(br[1].childNodes.map((k) => k.nodeType === 3 ? 'T:' + k.textContent : 'I:' + txt(k)), ['T:(', 'I:Na⁺']);
  assert.deepEqual(br[2].childNodes.map((k) => k.nodeType === 3 ? 'T:' + k.textContent : 'I:' + txt(k)), ['I:Cl⁻', 'T:)']);
  assert.deepEqual(br[3].childNodes.map((k) => k.nodeType === 3 ? 'T:' + k.textContent : 'I:' + txt(k)), ['T:و', 'I:Cl⁻']);
  const c = render('السرعة $\\text{السرعة} = \\frac{\\text{المسافة}}{\\text{الزمن}}$ هنا');
  const m = all(c.box, (k) => has(k, 'om-math'));
  assert.equal(m.length, 1);
  assert.equal(m[0]._attrs.dir, 'rtl', 'معادلة بمتغيّرات عربيّة تُقرأ من اليمين');
  assert.equal(txt(m[0]), 'السرعة = (المسافة)/(الزمن)');
  const d = render('البناء الضوئي:\n$$6CO_2 + 6H_2O \\xrightarrow{\\text{ضوء الشمس}} C_6H_{12}O_6 + 6O_2$$');
  const dm = all(d.box, (k) => has(k, 'om-math'))[0];
  assert.equal(dm._attrs.dir, 'ltr');
  assert.ok(txt(dm).startsWith('6CO₂ + 6H₂O →'), txt(dm));
  assert.equal(txt(all(dm, (k) => k.tagName === 'SUP')[0]), 'ضوء الشمس');
  const e = render('التفاعل $\\text{المتفاعلات} \\rightarrow \\text{النواتج}$ والقانون $ع = \\frac{ف}{ز} \\Rightarrow ف = ع \\times ز$ والمتّزن $\\text{المتفاعلات} \\rightleftharpoons \\text{النواتج}$ و$2س + 3 = 11$');
  const em = all(e.box, (k) => has(k, 'om-math'));
  assert.equal(em.length, 4);
  em.forEach((x) => assert.equal(x._attrs.dir, 'rtl', txt(x)));
  assert.equal(txt(em[0]), 'المتفاعلات ← النواتج');
  assert.ok(txt(em[1]).startsWith('ع = ف/ز') && txt(em[1]).includes('⇐'), txt(em[1]));
  assert.equal(txt(em[2]), 'المتفاعلات ⇋ النواتج');
  const f = render('Issue #\nمرحبا');
  assert.equal(all(f.box, (k) => k._attrs.dir === 'ltr' && !has(k, 'md-line')).length, 1, 'الغلاف كما كان');
});

test('٨. البثّ: لا قطع داخل $$ أو \\[ مفتوحة، ولا تعطيل للرسم التدريجيّ بسبب $$ في الكود أو الكلام، والنتيجة = البناء الكامل', () => {
  const body = Array.from({ length: 60 }, (_, i) => (i + 1) + '. سطر شرح رقم ' + (i + 1) + ' فيه كلمات كافية للطول.').join('\n');
  const openBlock = body + '\n\nالقانون:\n$$\nE = mc^2 +\n';
  const cut = L.omranStreamSplitPoint(openBlock);
  assert.ok(cut > 0 && !openBlock.slice(cut).startsWith('$$') && openBlock.slice(cut).includes('$$'), 'القطع قبل سطر الفاتح');
  assert.ok(!/\$\$/.test(openBlock.slice(0, cut)), 'الرأس بلا فاتح');
  const openBr = body + '\n\n\\[\nx = \\frac{1}{2}\n';
  assert.ok(!openBr.slice(0, L.omranStreamSplitPoint(openBr)).includes('\\['), '\\[ المفتوحة في الذيل');
  const midBr = body + '\nالمعادلة هي \\[\nx = \\frac{1}{2}\n';
  assert.ok(!midBr.slice(0, L.omranStreamSplitPoint(midBr)).includes('\\['), '\\[ وسط السطر في الذيل');
  const fencePid = 'مقدّمة\n```bash\necho $$\n```\n' + body + '\n\nخاتمة';
  assert.ok(L.omranStreamSplitPoint(fencePid) > 1000, '$$ داخل الكود لا يعطّل التقسيم');
  const tiers = 'مطعم ($$$) وآخر ($$)\n' + body + '\n\nخاتمة';
  assert.ok(L.omranStreamSplitPoint(tiers) > 0, 'فئات الأسعار لا تعطّل التقسيم');
  const far = 'PHP يستعمل $$name\n' + body + '\n' + body + '\n\nخاتمة';
  assert.ok(L.omranStreamSplitPoint(far) > far.length - 20, 'فاتح بعيد جدًّا ليس معادلة مفتوحة');
  const midPid = body + '\nفي باش المتغيّر $$ يعطي رقم العمليّة.\n\nخاتمة الكلام';
  assert.ok(L.omranStreamSplitPoint(midPid) > midPid.length - 20, '$$ وسط الجملة ليس فاتحًا');
  // بثّ حقيقيّ بخطوات مختلفة ثمّ المطابقة — مع $$ شاردة قبل الكتل، و\[ وسط السطر
  const blocks = '\n\nالقانون:\n$$\n\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n$$\n\nوأيضًا:\n\\[\nE = mc^2\n\\]\n\nثمّ $x^2$ و**النهاية**.\nالمعادلة هي \\[\nx = \\frac{-b}{2a}\n\\]\nوهذا هو الحلّ.\n';
  for(const lead of ['مقدّمة\n', 'مطعم ($$$) وآخر ($$)\n', 'PHP يستعمل $$name\n', 'في باش المتغيّر $$ يعطي رقم العمليّة.\n', 'اضغط \\[ ثم\n']){
    const text = lead + body + blocks + body;
    const full = render(text).box;
    for(const step of [7, 20, 50]){
      const el = new El('div');
      for(let n = step; n <= text.length + step; n += step) L.renderStreamingAssistant(el, text.slice(0, n));
      assert.equal(el.textContent, full.textContent, 'البثّ = البناء الكامل (' + lead.trim() + ' / ' + step + ')');
      assert.equal(all(el, (k) => has(k, 'om-math')).length, all(full, (k) => has(k, 'om-math')).length);
    }
    assert.equal(all(full, (k) => has(k, 'om-math')).length, 4, lead);
  }
  // «[» داخل معادلة مغلقة ليس رابطًا ناقصًا أثناء البثّ، والرابط الناقص فعلًا يُخفى كما كان
  const sm = L.ctx.streamingMarkdownDisplayText;
  assert.equal(sm('الدالة معرّفة على الفترة $x \\in [0, 1)$ وتتزايد'), 'الدالة معرّفة على الفترة $x \\in [0, 1)$ وتتزايد');
  assert.equal(sm('انظر [ويكيبيديا'), 'انظر ويكيبيديا');
  assert.equal(sm('السعر $5 انظر [الرابط'), 'السعر $5 انظر الرابط');
});

test('٩. المشاركة والنسخ: الأسّ والدليل المرسومان بعنصر يحملان ^( ) و_( ) نصًّا مخفيًّا بصريًّا', () => {
  const { box } = render('الدالة $f(x) = e^{-x}$ و$2^{x+1} = 16$ و$a_{n+1} = a_n + d$ و$x^2$');
  const sh = share(box);
  ['f(x) = e^(-x)', '2^(x+1) = 16', 'a_(n+1) = a_n + d', 'x²'].forEach((x) => assert.ok(sh.includes(x), x + ' في: ' + sh));
  assert.ok(!/[\u2060\u200B]/.test(sh));
});

test('١٠. الربط: الأنماط في tokens.css (عامّة لا للحاسوب وحده) والوسم مرفوع، وبلا lookbehind في الراسم', () => {
  const css = read('css/tokens.css');
  assert.ok(css.includes('.msg .md-line.md-hr{height:0; overflow:hidden; margin:.7em 0; border-top:1px solid var(--omLine'));
  assert.ok(css.includes('.msg .om-math-block{display:table; margin:.3em auto; text-align:start;}'));
  assert.ok(css.includes('.msg .om-math sup, .msg .om-math sub{font-size:.72em; line-height:0; unicode-bidi:isolate;}'));
  assert.ok(css.includes('.msg .om-math-sr{font-size:0;'), 'علامة المشاركة بخطّ صفريّ: لا display:none (تسقط من innerText) ولا position:absolute (تكسر السطر)');
  assert.ok(css.includes('.msg .om-rows{display:inline-block;'));
  assert.ok(css.includes('.msg .om-vec{'));
  assert.ok(css.includes('.msg .om-math-nw{white-space:nowrap;}'));
  assert.ok(css.indexOf('.msg .md-line.md-hr{') > css.indexOf('.msg .md-line, .msg-text div.md-line{'), 'بعد قاعدة md-line كي يغلب هامشها');
  assert.match(read('index.html'), /css\/tokens\.css\?v=725/);
  const src = read('js/app-02-tts.js');
  assert.ok(!/\(\?<[!=]/.test(src), 'لا lookbehind (سفاري قديم)');
  assert.ok(!/[\uE000-\uF8FF\u200B\u2060\u20D7\u0338\uFEFF]/.test(src), 'الرموز الخاصّة مكتوبة بالهروب لا حرفيًّا');
});
