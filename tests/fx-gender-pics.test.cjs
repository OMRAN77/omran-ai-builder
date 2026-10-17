// tests/fx-gender-pics.test.cjs — طلب المالك (١٧ أكتوبر): «افحص الازياء… اختار نسائي يكون كجول والموسم نسائي واذا ختار رجالي
// ولا اطفال يثبت نسائي وشريط اختر التعديل مايتحرك» ثمّ «شريط في الصور مايعمل».
// (١) v-fx-gender-pics: صورتا المناسبة والموسم (البطاقة ومعرضها) تتبعان الفئة — كانت من occasion/ وseason/ (امرأة) لكلّ الفئات.
// (٢) v-studio-tabs-move: شريط «② اختر التعديل» في ستايل (٢٤ تبويبًا مصوّرًا، يظهر ١٣) يتحرّك بالعجلة والسحب بالفأرة —
//     أشرطة التمرير مخفيّة في التطبيق كلّه فلم يكن على الكمبيوتر طريق للباقي.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const DG = read('js/design-gen.js');
const A13 = read('js/app-13-stocks-init.js');
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
function kindImgFor(gender) {
  const ctx = { st: { gender } };
  vm.runInNewContext("var LOOKS='assets/fashion/looks/';\n" + block(DG, '  var KIND_LOOK={', '\n  };', true) + '\n' +
    block(DG, '  function kindImg(kind,v){', '\n  }', true) + '\nthis.kindImg = kindImg; this.K = KIND_LOOK;', ctx);
  return ctx;
}

test('١. صورة كلّ مناسبة وموسم تتبع الفئة، والملفّ موجود، والنساء على صورهنّ كما كانت', () => {
  const occ = selectValues('fashionAiOccasion'), sea = selectValues('fashionAiSeason');
  assert.equal(occ.length, 8); assert.equal(sea.length, 4);
  for (const g of ['women', 'men', 'kids']) {
    const { kindImg } = kindImgFor(g);
    for (const [kind, list] of [['occasion', occ], ['season', sea]]) {
      for (const v of list) {
        const url = kindImg(kind, v);
        const file = url.replace(/\?v=\d+$/, '');
        assert.ok(fs.existsSync(path.join(root, file)), 'صورة مفقودة: ' + file);
        if (g === 'women') assert.equal(url, 'assets/fashion/looks/' + kind + '/' + v + '.webp?v=3', 'النساء كما كنّ');
        else assert.ok(url.startsWith('assets/fashion/looks/' + g + '/'), g + '/' + kind + '/' + v + ' ما زالت نسائيّة: ' + url);
      }
    }
    assert.equal(kindImg('occasion', ''), '', 'بلا قيمة بلا صورة');
  }
  // لا تتكرّر صورة داخل المعرض الواحد للفئة
  for (const g of ['men', 'kids']) {
    const { K } = kindImgFor(g);
    for (const kind of ['occasion', 'season']) {
      const vals = Object.values(K[g][kind]);
      assert.equal(new Set(vals).size, vals.length, g + '/' + kind + ' صورة مكرّرة');
    }
  }
});

test('٢. البطاقة ومعرضها يأخذان صورة الفئة، والضغط على فئة يعيد رسم البطاقتين، وإعادة البناء تبدأ قائمة جديدة', () => {
  const b = block(DG, '  function build(){', '\n  window.omranFashionExtras', false);
  assert.equal((b.match(/img:kindImg\(kind,o\.value\)/g) || []).length, 2, 'البطاقة والمعرض');
  assert.doesNotMatch(b, /img:o\.value\?LOOKS\+kind/, 'لا مسار نسائيّ ثابت');
  assert.match(b, /kindTriggers=\[\];/);
  assert.match(b, /kindTriggers\.push\(tr\);/);
  const grid = block(DG, '  function genderGrid(){', '\n  }', true);
  const click = grid.slice(grid.indexOf('c.onclick='));
  assert.ok(click.indexOf('st.gender=r[0]') < click.indexOf('kindTriggers.forEach(function(tr){ tr.refresh(); })'), 'الفئة أوّلًا ثمّ إعادة الرسم');
  const html = read('index.html');
  assert.ok(Number((/\/js\/design-gen\.js\?v=(\d+)/.exec(html) || [])[1]) >= 614, 'وسم design-gen رُفع');
});

/* عنصر وهميّ بقدر ما يحتاجه stHScroll: مستمعون، تمرير محدود بالاتّجاه (RTL من ٠ إلى السالب كما في كروميوم)، وأسر المؤشّر */
function fakeStrip(dir, sw, cw) {
  const h = {};
  let sl = 0;
  const max = sw - cw;
  const el = {
    scrollWidth: sw, clientWidth: cw, style: {}, captured: null,
    get scrollLeft() { return sl; },
    set scrollLeft(v) { sl = dir === 'rtl' ? Math.max(-max, Math.min(0, v)) : Math.max(0, Math.min(max, v)); },
    addEventListener(t, fn) { (h[t] = h[t] || []).push(fn); },
    setPointerCapture(id) { this.captured = id; },
    fire(t, ev) { const e = Object.assign({ defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } }, ev); (h[t] || []).forEach((fn) => fn(e)); return e; },
  };
  return el;
}
function runHScroll(el) {
  const timers = [];
  const ctx = { getComputedStyle: () => ({ direction: el.__dir }), setTimeout: (fn) => timers.push(fn), __swallow() {}, window: { getSelection: () => ({ removeAllRanges() { el.cleared = (el.cleared || 0) + 1; } }),
    addEventListener(t, fn, o) { (el.winListeners = el.winListeners || []).push({ t, fn, o }); } } };
  vm.runInNewContext(block(A13, '  function stHScroll(el){', '\n  stHScroll(tabsWrap);', false) + '\nthis.f = stHScroll;', ctx);
  ctx.f(el);
  return () => { timers.splice(0).forEach((fn) => fn()); };
}

test('٣. العجلة فوق الشريط تمرّره للتبويبات التالية (RTL وLTR)، وعند الطرف تترك الصفحة تتمرّر', () => {
  for (const dir of ['rtl', 'ltr']) {
    const el = fakeStrip(dir, 2238, 1136); el.__dir = dir;
    runHScroll(el);
    let e = el.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 });
    assert.equal(el.scrollLeft, dir === 'rtl' ? -100 : 100, dir + ': نزول العجلة = التبويبات التالية');
    assert.ok(e.defaultPrevented, 'لا تتمرّر الصفحة معه');
    for (let i = 0; i < 30; i++) el.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 });
    assert.equal(Math.abs(el.scrollLeft), 1102, 'بلغ آخر تبويب');
    e = el.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 });
    assert.ok(!e.defaultPrevented, 'عند الطرف تعود الصفحة تتمرّر');
    e = el.fire('wheel', { deltaY: -3, deltaX: 0, deltaMode: 1 });
    assert.equal(Math.abs(el.scrollLeft), 1102 - 120, 'وضع الأسطر (٤٠ بكسل للسطر)');
    e = el.fire('wheel', { deltaY: 10, deltaX: 80, deltaMode: 0 });
    assert.ok(!e.defaultPrevented, 'الأفقيّ من لوحة اللمس للمتصفّح');
    e = el.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0, ctrlKey: true });
    assert.ok(!e.defaultPrevented, 'Ctrl+عجلة تكبير لا تمرير');
  }
  const fit = fakeStrip('rtl', 600, 600); fit.__dir = 'rtl';
  runHScroll(fit);
  assert.ok(!fit.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 }).defaultPrevented, 'شريط يتّسع كلّه لا يمسّ العجلة');
});

test('٤. السحب بالفأرة يحرّك الشريط ولا يختار التبويب الذي انتهى عنده، والنقرة العاديّة تختار، واللمس للمتصفّح', () => {
  const el = fakeStrip('rtl', 2238, 1136); el.__dir = 'rtl';
  const flush = runHScroll(el);
  assert.ok(el.fire('dragstart', {}).defaultPrevented, 'صورة التبويب لا تُسحب');
  el.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 200, pointerId: 1 });
  el.fire('pointermove', { pointerId: 1, clientX: 203, buttons: 1 });
  assert.equal(el.scrollLeft, 0, 'رجفة صغيرة ليست سحبًا');
  el.fire('pointermove', { pointerId: 1, clientX: 800, buttons: 1 });
  assert.equal(el.scrollLeft, -600, 'المحتوى يتبع الفأرة: سحب لليمين يكشف التالي في RTL');
  assert.equal(el.captured, 1);
  assert.equal(el.style.userSelect, 'none', 'السحب لا يظلّل أسماء التبويبات');
  assert.equal(el.cleared, 1, 'والتظليل الذي بدأ يُمسح');
  el.fire('pointerup', { pointerId: 1 });
  const c = el.fire('click', {});
  assert.ok(c.stopped && c.defaultPrevented, 'نهاية السحب ليست نقرة على تبويب');
  assert.equal(el.style.userSelect, '');
  flush();
  // الإفلات خارج الشريط: pointerup النافذة (التقاط، مرّة واحدة) يُنهي الضغطة فلا يخطف الشريط سحبًا لاحقًا يبدأ في مكان آخر
  el.winListeners = [];
  el.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 300, pointerId: 1 });
  assert.deepEqual(el.winListeners.map((w) => w.t + ':' + w.o.capture + ':' + w.o.once), ['pointerup:true:true', 'pointercancel:true:true']);
  el.winListeners[0].fn({});
  el.fire('pointermove', { pointerId: 1, clientX: 900, buttons: 1 });
  assert.equal(el.scrollLeft, -600, 'سحب بدأ خارج الشريط ومرّ فوقه لا يحرّكه');
  flush();
  // ضغطة أُفلتت خارج الشريط قبل ٦ بكسل: المرور بعدها بلا ضغط لا يحرّكه ولا يبتلع النقرة التالية
  el.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 300, pointerId: 1 });
  el.fire('pointermove', { pointerId: 1, clientX: 900, buttons: 0 });
  assert.equal(el.scrollLeft, -600, 'لا يتبع فأرة بلا ضغط');
  flush();
  assert.ok(!el.fire('click', {}).stopped, 'ونقرة لوحة المفاتيح بعدها تمرّ');
  // نقرة بلا سحب تمرّ
  el.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 300, pointerId: 2 });
  el.fire('pointerup', { pointerId: 2 });
  assert.ok(!el.fire('click', {}).stopped, 'النقرة العاديّة تختار');
  flush();
  // اللمس: لا نتدخّل (تمرير المتصفّح الأصليّ على الجوّال كما كان)
  el.fire('pointerdown', { pointerType: 'touch', button: 0, clientX: 300, pointerId: 3 });
  el.fire('pointermove', { pointerId: 3, clientX: 900, buttons: 1 });
  assert.equal(el.scrollLeft, -600, 'اللمس لا يحرّكه هذا الكود');
  // الزرّ الأيمن لا يبدأ سحبًا
  el.fire('pointerdown', { pointerType: 'mouse', button: 2, clientX: 300, pointerId: 4 });
  el.fire('pointermove', { pointerId: 4, clientX: 900, buttons: 2 });
  assert.equal(el.scrollLeft, -600);
});

test('٥. مربوط بشريط «اختر التعديل» وحده بعد حقن الصور، ومبنيّ في الحزمة', () => {
  const i = A13.indexOf('  photoizeStudioTabs();\n');
  assert.ok(i > 0 && A13.indexOf('  stHScroll(tabsWrap);', i) > i, 'بعد حقن الصور');
  assert.match(A13, /el\.addEventListener\('wheel', \(e\) => \{[\s\S]{0,900}\}, \{ passive: false \}\);/, 'passive:false وإلّا لا يمنع تمرير الصفحة');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('stHScroll(tabsWrap);') && bundle.includes('v-studio-tabs-move'), 'الحزمة مبنيّة من الأجزاء');
});

/* ── «تأكّد يغيّر أشكال الشخصيات»: فحص شامل لكلّ صورة شخص في الاستوديو (٥٧ موضعًا) — ما بقي نسائيًّا أُصلح هنا ── */
const LANGS = ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml'];
function dgCtx(gender, extra) {
  const ctx = Object.assign({ st: { gender }, T: (k) => 'T:' + k, localStorage: { getItem: () => null }, lang: 'ar' }, extra || {});
  vm.runInNewContext("var LOOKS='assets/fashion/looks/';\n" +
    block(DG, '  var R34=', '\n  function swapI18n(', false) + '\n' +
    block(DG, '  function swapI18n(', '\n  function applyGenderTexts(', false) + '\n' +
    'this.EXT_PIC=EXT_PIC; this.EXT_ICON=EXT_ICON; this.TXG=TXG; this.extLabel=extLabel; this.extIcon=extIcon; this.swapI18n=swapI18n; this.pickTx=pickTx;', ctx);
  return ctx;
}

test('٦. الإضافات: لا صورة امرأة لرجل أو طفل — صورة فئته إن وُجدت (والملفّ موجود)، وإلّا مربّع الإيموجي', () => {
  const ext = DG.match(/var EXT=\[[^\n]*\];/)[0];
  const keys = [...ext.matchAll(/\['(\w+)','/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['Glasses', 'Watch', 'Handbag', 'Shoes', 'Scarf', 'Makeup']);
  const { EXT_PIC } = dgCtx('men');
  for (const g of ['men', 'kids']) {
    for (const [k, v] of Object.entries(EXT_PIC[g])) {
      assert.ok(keys.includes(k), k);
      const file = v[0].replace(/\?v=\d+$/, '');
      assert.ok(fs.existsSync(path.join(root, file)), g + '/' + k + ': ' + file);
      assert.doesNotMatch(file, /looks\/(extras|women|occasion|season)\//, g + '/' + k + ' صورة نسائيّة');
      assert.equal(v[1].length, 4, 'نسبة الصورة الحقيقيّة (٣:٤) لا ٢:٣ الممطوطة');
    }
  }
  // مسار الصورة في extrasRow: النساء extras/، والرجال والأطفال صورتهم أو لا شيء
  const row = block(DG, '  function extrasRow(){', '\n  /* v-fashion-variety: سطر يشرح', false);
  assert.ok(row.includes("var url=(st.gender==='women'||!EXT_PIC[st.gender]) ? LOOKS+'extras/'+r[0].toLowerCase()+'.webp?v=3' : (ap?ap[0]:'');"));
  assert.ok(row.includes('if(url){'), 'بلا صورة لا عنصر img — يبقى الإيموجي');
  // الرجال: 💼 و🧴 «عناية»، الأطفال ✨ «لمعة خفيفة»، والنساء كما كنّ
  const m = dgCtx('men'), k = dgCtx('kids'), w = dgCtx('women');
  assert.equal(m.extIcon('Handbag', '👜'), '💼'); assert.equal(m.extIcon('Makeup', '💄'), '🧴');
  assert.equal(k.extIcon('Makeup', '💄'), '✨'); assert.equal(w.extIcon('Makeup', '💄'), '💄');
  assert.equal(m.extLabel(['Makeup', '💄', 'fxAccMakeup']), 'عناية');
  assert.equal(k.extLabel(['Makeup', '💄', 'fxAccMakeup']), 'لمعة خفيفة');
  assert.equal(w.extLabel(['Makeup', '💄', 'fxAccMakeup']), 'T:fxAccMakeup');
  assert.equal(m.extLabel(['Glasses', '🕶️', 'fxAccGlasses']), 'T:fxAccGlasses');
});

test('٧. تغيير الفئة يعيد بناء الإضافات ويحفظ الفئة ويبدّل النصوص، والإقلاع يقرأ المحفوظ (نسائي/رجالي/أطفال فقط)', () => {
  const grid = block(DG, '  function genderGrid(){', '\n  function colorRow(){', false);
  const click = grid.slice(grid.indexOf('c.onclick='));
  const at = (s) => { const i = click.indexOf(s); assert.ok(i > 0, s); return i; };
  const fire = "window.dispatchEvent(new CustomEvent('fashion-gender-change'";
  assert.ok(at('st.gender=r[0]') < at('localStorage.setItem(GKEY,st.gender)'));
  assert.ok(at('og.replaceWith(extrasRow())') < at(fire), 'قبل البثّ: app-12 يقرأ ما بعدها');
  assert.ok(at('applyGenderTexts();') < at(fire), 'اسم الزفاف قبل رسم بطاقة النمط');
  assert.match(block(DG, '  function build(){', '\n  window.omranFashionExtras', false), /applyGenderTexts\(\);/);
  const init = block(DG, "  var GKEY='aiapp_fashion_gender';", '\n', true) + block(DG, '  try{ var g0=', '\n', true);
  for (const [stored, want] of [['men', 'men'], ['kids', 'kids'], ['women', 'women'], ['__proto__', 'women'], [null, 'women']]) {
    const ctx = { st: { gender: 'women' }, localStorage: { getItem: () => stored } };
    vm.runInNewContext(init, ctx);
    assert.equal(ctx.st.gender, want, String(stored));
  }
  const thr = { st: { gender: 'women' }, localStorage: { getItem: () => { throw new Error('blocked'); } } };
  vm.runInNewContext(init, thr);
  assert.equal(thr.st.gender, 'women', 'تخزين محجوب = نسائي بلا خطأ');
  // دوائر «خصّصها» تتبع إيموجي البطاقات لا عددها وحده، وزرّ «جرّب» يأخذ إيموجي الحقيبة
  const fx = read('js/app-12-fx-simple.js');
  assert.ok(fx.includes("box.getAttribute('data-sig') !== sig"));
  assert.ok(fx.includes("T(TX.bag).replace(/^\\S+/, (bagOi && bagOi.textContent) || '👜')"));
});

test('٨. نصوص الفئة بالـ١٤ لغة بلا اسم مزوّد، و«ارفعي» للنساء وحدهنّ، و«فستان زفاف» لا يظهر تحت عريس', () => {
  const { TXG, swapI18n, pickTx } = dgCtx('men');
  for (const k of ['grooming', 'sparkle', 'bag', 'dropKids', 'descMen', 'descKids']) {
    assert.deepEqual(Object.keys(TXG[k]).sort(), LANGS.slice().sort(), 'لغات ناقصة: ' + k);
    for (const l of LANGS) {
      assert.ok(TXG[k][l] && TXG[k][l].trim(), k + '/' + l);
      assert.doesNotMatch(TXG[k][l], /gemini|gpt|openai|claude|grok|kimi|flux/i);
    }
  }
  assert.deepEqual(Object.keys(TXG.dropMen), ['ar'], 'العنوان محايد في اللغات الأخرى — العربيّة وحدها تؤنّث');
  assert.equal(TXG.dropMen.ar, 'ارفع صورتك كاملة');
  assert.doesNotMatch(TXG.descMen.ar + TXG.descKids.ar, /فستان|تنورة|كعب/);
  // swapI18n: نصّ الفئة ينزع المفتاح (لا يعيده مُطبِّق اللغة)، وغيابه يعيد المفتاح بنصّه
  const proto = { getAttribute(a) { return this.attrs[a] == null ? null : this.attrs[a]; }, setAttribute(a, v) { this.attrs[a] = v; }, removeAttribute(a) { delete this.attrs[a]; } };
  const el = Object.assign(Object.create(proto), { attrs: { 'data-i18n': 'fashionDropTitle' }, textContent: 'ارفعي صورتك كاملة' });
  swapI18n(el, 'data-i18n', 'fashionDropTitle', TXG.dropMen);
  assert.equal(el.textContent, 'ارفع صورتك كاملة'); assert.equal(el.getAttribute('data-i18n'), null);
  swapI18n(el, 'data-i18n', 'fashionDropTitle', null);
  assert.equal(el.getAttribute('data-i18n'), 'fashionDropTitle'); assert.equal(el.textContent, 'T:fashionDropTitle', 'النساء يرجعن لنصّهنّ');
  const ph = Object.assign(Object.create(proto), { attrs: { 'data-i18n-placeholder': 'fashionAiDescPlaceholder' }, placeholder: 'x' });
  swapI18n(ph, 'data-i18n-placeholder', 'fashionAiDescPlaceholder', TXG.descKids);
  assert.equal(ph.placeholder, TXG.descKids.ar);
  const en = dgCtx('men', { lang: 'en' });
  assert.equal(en.pickTx(en.TXG.dropMen), '', 'الإنجليزيّة: يبقى المفتاح الأصليّ المحايد');
  assert.equal(pickTx(TXG.bag), 'حقيبة');
  // الزفاف: لغير النساء مفتاح المناسبة القائم «💍 زفاف» (موجود في الـ١٤ لغة)
  const app = block(DG, '  function applyGenderTexts(){', '\n  }', true);
  assert.ok(app.includes("wk=(g==='women')?'fashionAiStyleWedding':'fashionOccasionWedding'"));
  const i18n03 = read('js/app-03-i18n-data.js');
  assert.equal((i18n03.match(/fashionOccasionWedding: '/g) || []).length, 2);
  for (const lg of LANGS.filter((l) => l !== 'ar' && l !== 'en')) assert.match(read('i18n/' + lg + '.js'), /fashionOccasionWedding/, lg);
});

test('٩. صورة النمط الاحتياطيّة (امرأة) للنساء وحدهنّ، و«اقترح لي إطلالة» يرسل الفئة', () => {
  const s = read('js/app-12-studios.js');
  assert.ok(s.includes("if(!img.__flat && gender === 'women'){ img.__flat = 1;"));
  assert.ok(s.includes("img2: g === 'women' ? 'assets/fashion/looks/' + v + '.webp' : '',"));
  const f = s.indexOf("const res = await fetch('/api/fashion-suggest'");
  const pay = s.slice(s.lastIndexOf('const payload = {', f), f);
  assert.ok(pay.includes('gender: currentGender(),'));
  assert.ok(read('js/app.bundle.js').includes('gender: currentGender(), /* v-fx-gender-pics'));
});

test('١٠. الخادم: الاقتراح لفئته (المعالج الحقيقيّ بنموذج وهميّ)، وقيمة غريبة = نسائي', async () => {
  const lib = path.join(root, 'api/_lib');
  const stub = (rel, exp) => { const f = require.resolve(path.join(lib, rel)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
  stub('_fashionUsage', { checkFashionQuota: async () => ({ allowed: true }) });
  stub('_usage.js', { checkAndConsumeCustom: async () => ({ allowed: true }), refundCustom: async () => {}, clientIp: () => '1.1.1.1' });
  stub('_oa-light.js', { oaLightFetch: async () => { throw new Error('no'); } });
  const handler = require(path.join(lib, 'fashion-suggest.js'));
  const prev = { fetch: global.fetch, key: process.env.GEMINI_API_KEY };
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  const prompts = [];
  global.fetch = async (url, opt) => {
    prompts.push(JSON.parse(opt.body).contents[0].parts[0].text);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '[{"title":"a","clothing":"b","colors":"c","accessories":"d","matchPercent":90}]' }] } }] }) };
  };
  const run = async (gender) => {
    const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await handler({ method: 'POST', headers: {}, body: { description: 'something nice', occasion: 'wedding', season: 'summer', lang: 'en', token: 't', gender } }, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    return prompts[prompts.length - 1];
  };
  try {
    assert.match(await run('men'), /Category: menswear for a man \(no dresses, skirts, handbags or high heels\)\. Occasion: a wedding/);
    assert.match(await run('men'), /accessory suggestions \(shoes\/watch\/belt or briefcase\)/);
    assert.match(await run('kids'), /Category: age-appropriate children's wear for a child/);
    assert.match(await run('women'), /Category: womenswear for a woman\. /);
    assert.match(await run(undefined), /Category: womenswear for a woman\. [\s\S]*\(bag\/shoes\/jewelry\)/, 'عميل قديم بلا الحقل = كما كان');
    assert.match(await run('constructor'), /Category: womenswear for a woman\. /, 'لا قراءة من النموذج الأوّليّ');
  } finally {
    global.fetch = prev.fetch;
    if (prev.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prev.key;
  }
});

test('١١. سطر التعديل واقتراح الإطلالة بعد نتيجة رجل/طفل: لا «عدّلي» ولا «الفستان» ولا 👜 للرجل', () => {
  const src = read('js/app-12-studios.js');
  const ctx = { gender: 'men', lg: 'ar' };
  vm.runInNewContext(block(src, '  const FX_REFINE_G = {', '\n  };', true) + '\n' + block(src, '  function __refineG(', '\n  }', true) +
    "\nfunction currentGender(){ return G.gender; } function lang7(){ return G.lg; } function __gt2(k, ar, en){ return 'KEY:' + k; }\nthis.g = __refineG; this.M = FX_REFINE_G;", Object.assign(ctx, { G: ctx }));
  assert.deepEqual(Object.keys(ctx.M.ph).sort(), LANGS.slice().sort(), 'المثال بالـ١٤ لغة');
  for (const l of LANGS) assert.doesNotMatch(ctx.M.ph[l], /فستان|dress|robe|vestido|платья|elbise|gaun|裙子|ड्रेस/i, l);
  assert.equal(ctx.g('ph', 'fashionRefinePh'), 'مثال: غيّر لون القميص إلى أزرق فقط');
  assert.equal(ctx.g('btn', 'fashionRefineBtn'), '✏️ عدّل شيئًا محددًا');
  assert.equal(ctx.g('need', 'fashionRefineNeed'), 'اكتب التعديل المطلوب أولًا');
  ctx.lg = 'fr'; assert.equal(ctx.g('btn', 'fashionRefineBtn'), 'KEY:fashionRefineBtn', 'الفرنسيّة محايدة: المفتاح الأصليّ');
  ctx.gender = 'women'; ctx.lg = 'ar'; assert.equal(ctx.g('ph', 'fashionRefinePh'), 'KEY:fashionRefinePh', 'النساء كما كنّ');
  assert.ok(src.includes("window.addEventListener('fashion-gender-change', __refineTexts);"), 'سطر ظاهر يتبع الفئة');
  assert.ok(src.includes("setStatus(__refineG('need', 'fashionRefineNeed',"));
  assert.ok(src.includes("(currentGender() === 'men' ? '💼 ' : '👜 ') + (s.accessories || '')"));
  assert.ok(read('js/app.bundle.js').includes('const FX_REFINE_G = {'), 'الحزمة مبنيّة');
});
