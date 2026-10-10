// tests/fx-simple.test.cjs — v-fx-simple (تبسيط استوديو الأزياء، طلب المالك «الي يدخل يضيع فيه»):
// ثلاث خطوات ظاهرة ثمّ «صمم»، والباقي تحت «🎨 خصّصها ▾» بشريط يعرض ما في الداخل، وأوّل زيارة مفتوح،
// و«جرّب» بعد النتيجة، ومنتقي المحرّك (اسم مزوّد) للمالك وحده. ويثبّت الإصلاح المرافق: المناسبة تقود
// النمط — لمّا طُوي منتقي النمط صار افتراضه «سهرة» يُطبَّق بصمت على مناسبة «كاجوال».
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const SRC = read('js/app-12-fx-simple.js');
const STUDIOS = read('js/app-12-studios.js');
const PARTIAL = read('js/partials-core.js');

function block(src, start, end, keepEnd) {
  const i = src.indexOf(start);
  let j = src.indexOf(end, i);
  assert.ok(i >= 0 && j > i, 'كتلة غير موجودة: ' + start);
  if (keepEnd) j += end.length;
  return src.slice(i, j);
}
function selectValues(id) {
  const i = PARTIAL.indexOf('id="' + id + '"');
  const j = PARTIAL.indexOf('</select>', i);
  return [...PARTIAL.slice(i, j).matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
}

test('١. المناسبة تقود النمط: كلّ مناسبة مغطّاة لكلّ فئة، والنمط موجود في قائمة الفئة وفي النموذج', () => {
  const ctx = {};
  vm.runInNewContext(block(STUDIOS, 'const GENDER_STYLES = {', '\n  };', true) + '\n' +
    block(STUDIOS, 'const FX_OCC_STYLE = {', '\n  };', true) + '\nthis.G = GENDER_STYLES; this.M = FX_OCC_STYLE;', ctx);
  const occasions = selectValues('fashionAiOccasion');
  const styles = selectValues('fashionAiStyle');
  assert.equal(occasions.length, 8);
  for (const occ of occasions) {
    assert.ok(ctx.M[occ], 'مناسبة بلا نمط: ' + occ);
    for (const g of ['women', 'men', 'kids']) {
      const v = ctx.M[occ][g];
      assert.ok(v, occ + '/' + g + ' بلا نمط');
      assert.ok(ctx.G[g].indexOf(v) >= 0, occ + '/' + g + ' → ' + v + ' ليس في قائمة الفئة');
      assert.ok(styles.includes(v), v + ' ليس خيارًا في النموذج');
    }
  }
  // التطابقات التي كانت تتناقض بالنصّ نفسه
  assert.equal(ctx.M.casual.women, 'casual');
  assert.equal(ctx.M.wedding.women, 'wedding');
  assert.equal(ctx.M.religious.women, 'abaya');
  assert.equal(ctx.M.work.kids, 'school', 'الأطفال بلا «دوام أنيق»');
});

test('٢. التوصيل: المناسبة تغيّر النمط، والاختيار اليدويّ يغلب ويبقى إن وُجد في الفئة الجديدة، والافتراضيّ يُصلَح', () => {
  assert.match(STUDIOS, /onPick: function\(v\)\{ styleEl\.value = v; fxStyleManual = v; renderStyleCards\(\); \}/, 'المعرض يسجّل الاختيار اليدويّ');
  assert.match(STUDIOS, /occasionEl\.addEventListener\('change', function\(\)\{ fxStyleManual = ''; fxApplyOccasionStyle\(\); \}\);/, 'آخر فعل يغلب');
  assert.match(STUDIOS, /if\(fxStyleManual && list\.indexOf\(fxStyleManual\) >= 0\)\{ styleEl\.value = fxStyleManual; renderStyleCards\(\); \}/);
  assert.match(STUDIOS, /fxApplyOccasionStyle\(\); \/\* الافتراضيّ نفسه كان متناقضًا/);
  // مستمع الفئة الجديد بعد القائم (renderStyleCards يقصر النمط على أوّل القائمة أوّلًا)
  const a = STUDIOS.indexOf("window.addEventListener('fashion-gender-change', function(){ renderStyleCards(); buildCompareChecks(); });");
  const b = STUDIOS.indexOf("window.addEventListener('fashion-gender-change', function(){\n    const list");
  assert.ok(a > 0 && b > a, 'ترتيب المستمعين');
  // العلَم معرَّف قبل أوّل استعمال
  assert.ok(STUDIOS.indexOf("let fxStyleManual = '';") < STUDIOS.indexOf('fxStyleManual = v'));
});

test('٣. الطيّ نقل لا بناء: العقد القائمة تُنقل إلى المطويّ، ولا يُفرَّغ ولا يُحذف شيء من النموذج', () => {
  assert.match(SRC, /customNodes\(\)\.forEach\(function\(n\)\{ custom\.appendChild\(n\); \}\);/);
  for (const anchor of ["$('fashionAiSeason')", "q('.colorRow')", "q('.fxAccGrid')", "$('fashionStyleCards')", "$('fashionAiMultiAngle')", "$('fashionAiEngine')"]) {
    assert.ok(SRC.includes(anchor), 'مرساة: ' + anchor);
  }
  // التفريغ الوحيد لحاوياتنا نحن (الدوائر و«جرّب»)، لا لعقدة من النموذج
  const clears = SRC.match(/(\w+)\.innerHTML = ''/g) || [];
  assert.deepEqual(clears.sort(), ["box.innerHTML = ''", "box.innerHTML = ''"].sort());
  assert.ok(!/\.remove\(\)/.test(SRC), 'لا حذف');
  // المطويّ قبل «صمم» مباشرة، و«اقترح» بعده
  assert.match(SRC, /gen\.insertAdjacentElement\('beforebegin', bar\);/);
  assert.match(SRC, /gen\.insertAdjacentElement\('afterend', sug\);/);
  // يُعاد بعد إعادة بناء design-gen عند تغيير اللغة (يمسح .f417 ويعيدها بعد مرساته)
  assert.match(SRC, /new MutationObserver\(function\(\)\{ setTimeout\(layout, 0\); \}\)\.observe\(document\.documentElement, \{ attributes:true, attributeFilter:\['lang'\] \}\)/);
  assert.ok(!/class(Name)?\s*=\s*['"][^'"]*f417/.test(SRC), 'حاوياتنا بلا f417 فلا يمسحها design-gen');
});

test('٤. منتقي المحرّك: للمالك وحده، وغيره يرجع للافتراضيّ (لا اسم مزوّد، ولا تغيّر كلفة)', () => {
  const fn = block(SRC, 'function syncEngine(){', '\n  }', true);
  const run = (plan, value) => {
    const wrap = { style: { display: 'block' } };
    const eng = { value, parentElement: wrap };
    const ctx = { window: { __omranPlan: plan }, $: () => eng };
    vm.runInNewContext(fn + '\nsyncEngine();', ctx);
    return [wrap.style.display, eng.value];
  };
  assert.deepEqual(run('owner', 'openai'), ['', 'openai'], 'المالك يراه ويبقى اختياره');
  assert.deepEqual(run('max', 'openai'), ['none', ''], 'مشترك: مخفيّ ويرجع للافتراضيّ');
  assert.deepEqual(run('free', ''), ['none', '']);
  assert.deepEqual(run(undefined, 'openai'), ['none', ''], 'قبل معرفة الطبقة: مخفيّ (الأسلم)');
  // النصّان في القالب فيهما اسما المزوّدين فعلًا — لذلك لا يُريان لغير المالك
  assert.match(PARTIAL, /data-i18n="fashionEngineGemini">Gemini/);
});

test('٥. أوّل زيارة مفتوح، وبعدها مطويّ، وآخر فعل يدويّ يُتذكّر', () => {
  const code = block(SRC, 'function isOpen(){', '  /* ── الشريط', false);
  const run = (stored) => {
    const store = new Map(stored === null ? [] : [['aiapp_fx_custom', stored]]);
    const custom = { style: { display: 'none' } };
    const btn = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const ctx = {
      KEY: 'aiapp_fx_custom', refresh() {},
      $: (id) => (id === 'fxCustom' ? custom : id === 'fxCustomBtn' ? btn : null),
      localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    };
    vm.runInNewContext(code + '\napplyFirstVisit();\nthis.setOpen = setOpen;', ctx);
    return { open: custom.style.display === 'block', stored: store.get('aiapp_fx_custom'), aria: btn.attrs['aria-expanded'], ctx, store };
  };
  const first = run(null);
  assert.deepEqual([first.open, first.stored, first.aria], [true, 'seen', 'true'], 'أوّل زيارة: مفتوح ويُسجَّل أنّه رآه');
  assert.equal(run('seen').open, false, 'الزيارة التالية بلا فعل يدويّ: مطويّ');
  assert.equal(run('1').open, true, 'فتحه بيده آخر مرّة: مفتوح');
  assert.equal(run('0').open, false, 'طواه بيده: مطويّ');
  // الفعل اليدويّ يُحفظ، والتلقائيّ لا
  const r = run('seen');
  r.ctx.setOpen(true, true);
  assert.equal(r.store.get('aiapp_fx_custom'), '1');
  r.ctx.setOpen(false, false);
  assert.equal(r.store.get('aiapp_fx_custom'), '1', 'الطيّ الآليّ لا يغيّر ذاكرة المستخدم');
});

test('٦. «لون آخر»: لون واحد مختلف بالتدوير', () => {
  const code = block(SRC, "var COLOR_CYCLE = [", '];', true) + '\n' + block(SRC, 'function nextColor(){', '\n  }', true);
  const make = (selected) => {
    const els = ['Black', 'White', 'Navy', 'Red', 'Gold', 'Green', 'Beige', 'Multi'].map((c) => ({
      c, sel: selected.includes(c),
      classList: { contains: (k) => k === 'sel' && this_sel(c) },
      getAttribute: () => c,
      click() { this.sel = !this.sel; },
    }));
    const byC = (c) => els.find((e) => e.c === c);
    function this_sel(c) { return byC(c).sel; }
    const ctx = {
      document: { querySelectorAll: () => els.filter((e) => e.sel) },
      q: (s) => byC((s.match(/data-col="(\w+)"/) || [])[1]),
    };
    vm.runInNewContext(code + '\nthis.nextColor = nextColor;', ctx);
    return { ctx, sel: () => els.filter((e) => e.sel).map((e) => e.c) };
  };
  let e = make([]); e.ctx.nextColor(); assert.deepEqual(e.sel(), ['Gold'], 'بلا لون: الذهبيّ أوّلًا');
  e.ctx.nextColor(); assert.deepEqual(e.sel(), ['Navy']);
  e = make(['Black', 'Red']); e.ctx.nextColor(); assert.deepEqual(e.sel(), ['White'], 'عدّة ألوان: تصير لونًا واحدًا بعد آخرها');
  e = make(['Beige']); e.ctx.nextColor(); assert.deepEqual(e.sel(), ['Gold'], 'يدور من الأوّل');
});

test('٧. «جرّب» بعد النتيجة: يظهر مع النتيجة، ويخفي ما طُبّق، ويعيد التصميم عبر زرّ «صمم» نفسه', () => {
  assert.match(SRC, /if\(!resultShown\(\)\)\{ box\.style\.display = 'none'; return; \}/);
  assert.match(SRC, /if\(bag && !bag\.classList\.contains\('sel'\)\)/, 'الحقيبة المختارة لا تُقترح');
  assert.match(SRC, /var to = sea\.value === 'winter' \? 'summer' : 'winter';/, 'شتويّ ↔ صيفيّ');
  assert.match(SRC, /if\(ma && !ma\.checked\)/, 'الزوايا المفعّلة لا تُقترح');
  assert.match(SRC, /b\.onclick = function\(\)\{ if\(busy\(\)\) return; fn\(\); refresh\(\); regenerate\(\); \};/);
  assert.match(SRC, /var g = \$\('fashionAiGenerateBtn'\); if\(g && !g\.disabled\) g\.click\(\);/, 'الزرّ نفسه: نفس الحصّة والتأكيد');
  assert.match(SRC, /observe\(rw, \{ attributes:true, attributeFilter:\['style'\] \}\)/);
  // دائرة الإضافة في الشريط تعرّف ولا تختار
  const openAt = block(SRC, 'function openAt(key){', '\n  }', true);
  assert.ok(!/\.click\(\)/.test(openAt), 'الدائرة لا تختار الإضافة نيابةً عنه');
});

test('٨. مراسي design-gen ووسم إصداره، والنصوص بالـ14 لغة بلا اسم مزوّد، والحزمة', () => {
  const dg = read('js/design-gen.js');
  assert.match(dg, /d\.setAttribute\('data-col',r\[0\]\);/);
  assert.match(dg, /d\.setAttribute\('data-ext',r\[0\]\);/);
  assert.ok(read('index.html').includes('/js/design-gen.js?v=610'), 'وسم الإصدار رُفع');
  const ctx = {};
  vm.runInNewContext(block(SRC, 'var TX = {', '\n  };', true) + '\nthis.TX = TX;', ctx);
  const LANGS = ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml'];
  for (const k of Object.keys(ctx.TX)) {
    assert.equal(Object.keys(ctx.TX[k]).sort().join(','), LANGS.slice().sort().join(','), 'لغات ناقصة في: ' + k);
    for (const l of LANGS) assert.ok(!/gemini|chatgpt|gpt|openai|claude|veo/i.test(ctx.TX[k][l]), 'اسم مزوّد في ' + k + '/' + l);
  }
  assert.ok(read('js/app.bundle.js').includes("bar.id = 'fxCustomBar'"), 'الجزء داخل الحزمة');
});
