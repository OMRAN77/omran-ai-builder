// tests/fashion-variety.test.cjs — v-fashion-variety + v-fashion-acc-cards (٢٨ سبتمبر ٢٠٢٦).
// المالك: «الديزينات واحده… الشكل واحد مافي تنوع في الملابس. على الأقل في كل خاصيّة ١٠٠ نوع، وشوف الإضافات
// مش واضحه». الجذر: كلّ نمط جملة وصف ثابتة واحدة ⇒ الأمر نفسه حرفيًّا في كلّ ضغطة؛ والإضافات رقاقات flex تنكمش
// إلى عرض حشوها (~٣٠ بكسل) بعد أن يجعل photoize محتواها absolute.
// هنا: الكتالوج (≥١٠٠ لكلّ نمط ولكلّ إضافة، عاديًّا ومحتشمًا)، والتسلسل (لا تكرار، والهيئة تتغيّر كلّ ضغطة)،
// والمعالج الحقيقيّ بـfetch مزيّف (ما يصل النموذج فعلًا)، وأسلاك العميل، وبطاقات الإضافات، والـ١٤ لغة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const V = require(rp('api/_lib/fashion-variety.js'));

// قوائم الأنماط كما يعرضها العميل لكلّ فئة (مصدر الحقيقة: app-12-studios.js)
const studios = R('js/app-12-studios.js');
const GENDER_STYLES = (() => {
  const m = studios.match(/const GENDER_STYLES = (\{[\s\S]*?\n  \});/);
  assert.ok(m, 'GENDER_STYLES في app-12');
  return JSON.parse(JSON.stringify(vm.runInNewContext('(' + m[1] + ')'))); // مصفوفات هذا السياق لا سياق vm (deepEqual الصارم يقارن النموذج الأصليّ)
})();

test('١. كلّ نمط تعرضه الواجهة له كتالوجه في فئته، و≥١٠٠ تصميم عاديًّا ومحتشمًا', () => {
  let n = 0;
  for (const g of ['women', 'men', 'kids']) {
    for (const s of GENDER_STYLES[g]) {
      assert.ok(Object.prototype.hasOwnProperty.call(V.CATALOG[g], s), g + '/' + s + ': بلا كتالوج خاصّ بالفئة');
      const axes = V.axesFor(g, s, false);
      assert.equal(axes.length, 3, g + '/' + s + ': ثلاثة محاور');
      assert.ok(V.designTotal(g, s, false) >= 100, g + '/' + s + ': أقلّ من ١٠٠ تصميم');
      assert.ok(V.designTotal(g, s, true) >= 100, g + '/' + s + ': أقلّ من ١٠٠ تصميم محتشم');
      n++;
    }
    assert.deepEqual(Object.keys(V.CATALOG[g]).sort(), GENDER_STYLES[g].slice().sort(), g + ': الكتالوج يطابق القائمة بلا زيادة');
  }
  assert.equal(n, 36 + 24 + 18);
  for (const a of Object.keys(V.ACCESSORIES)) for (const g of ['women', 'men', 'kids']) {
    const t = V.accessoryTotal(a, g);
    if (a === 'Makeup' && g !== 'women') assert.equal(t, 1, 'مكياج ' + g + ' لمسة واحدة آمنة عمدًا');
    else assert.ok(t >= 100, a + '/' + g + ': أقلّ من ١٠٠ نوع (' + t + ')');
  }
});

test('٢. نظافة المحتوى: لا تكرار في محور، ولا ماركات ولا شعارات، والأطفال بلا مكياج كبار', () => {
  const BRANDS = /\b(chanel|gucci|dior|herm[eè]s|rolex|cartier|ray-?ban|prada|louis vuitton|fendi|versace|nike|adidas|balenciaga|burberry|wayfarer|clubmaster|logo)\b/i;
  const all = [];
  const specs = [];
  for (const g of ['women', 'men', 'kids']) for (const s of Object.keys(V.CATALOG[g])) specs.push([g + '/' + s, V.CATALOG[g][s]]);
  for (const a of Object.keys(V.ACCESSORIES)) for (const g of Object.keys(V.ACCESSORIES[a])) specs.push([a + '/' + g, V.ACCESSORIES[a][g]]);
  for (const [k, spec] of specs) {
    for (const ax of spec.split(' // ')) {
      const opts = ax.split(' | ').map((o) => o.trim());
      assert.ok(opts.every(Boolean), k + ': خيار فارغ');
      assert.equal(new Set(opts).size, opts.length, k + ': خيار مكرّر في المحور');
      all.push(...opts);
    }
  }
  for (const o of all) {
    assert.doesNotMatch(o, BRANDS, 'اسم ماركة/شعار: ' + o);
    assert.doesNotMatch(o, /["\n]/, 'علامة تكسر الأمر: ' + o);
  }
  const kidsMk = V.ACCESSORIES.Makeup.kids;
  assert.match(kidsMk, /no adult makeup/);
  assert.doesNotMatch(kidsMk, /smoky|red lips|liner|contour/i);
  assert.match(V.ACCESSORIES.Makeup.men, /without changing facial hair or features/, 'قفل الهويّة: لا لحية جديدة');
});

test('٣. التسلسل: لا يتكرّر تصميم حتّى تنفد، والهيئة تتغيّر في كلّ ضغطة حتمًا', () => {
  for (const g of ['women', 'men', 'kids']) for (const s of Object.keys(V.CATALOG[g])) for (const modest of [false, true]) {
    const T = V.designTotal(g, s, modest);
    const seen = new Set();
    let prev = null;
    for (let n = 0; n < T; n++) {
      const d = V.designFor({ gender: g, style: s, variant: n, modest });
      assert.equal(d.total, T);
      seen.add(d.index);
      if (prev) assert.notEqual(d.parts[0], prev.parts[0], g + '/' + s + ' n=' + n + ': الهيئة نفسها مرّتين متتاليتين');
      prev = d;
    }
    assert.equal(seen.size, T, g + '/' + s + (modest ? ' (محتشم)' : '') + ': تكرّر تصميم قبل أن تنفد');
  }
  // الإضافات أيضًا: كلّ الأنواع قبل التكرار، والنوع يتغيّر كلّ مرّة
  for (const a of Object.keys(V.ACCESSORIES)) for (const g of ['women', 'men', 'kids']) {
    const T = V.accessoryTotal(a, g);
    if (T < 2) continue;
    const seen = new Set();
    for (let n = 0; n < T; n++) seen.add(V.accessoryFor(a, { gender: g, variant: n }));
    assert.equal(seen.size, T, a + '/' + g);
  }
  // الرقم نفسه = التصميم نفسه (حتميّ)، ولعميل بلا عدّاد رقم عشوائيّ صالح
  assert.deepEqual(V.designFor({ gender: 'women', style: 'evening', variant: 42 }), V.designFor({ gender: 'women', style: 'evening', variant: 42 }));
  for (const bad of [undefined, null, -3, 'x', NaN]) {
    const n = V.resolveVariant(bad);
    assert.ok(Number.isInteger(n) && n >= 0, String(bad));
  }
});

test('٤. الاحتشام: لا يُختار خيار مكشوف أبدًا، والياقة المكشوفة تُستبدل بأكمام طويلة', () => {
  const immodest = (g, s) => V.CATALOG[g][s].split(' // ').flatMap((ax) => ax.split(' | ')).map((o) => o.trim()).filter((o) => o.startsWith('!')).map((o) => o.slice(1).trim());
  for (const g of ['women', 'men', 'kids']) for (const s of Object.keys(V.CATALOG[g])) {
    const bad = immodest(g, s);
    const T = V.designTotal(g, s, true);
    for (let n = 0; n < T; n++) {
      const d = V.designFor({ gender: g, style: s, variant: n, modest: true });
      for (const b of bad) assert.ok(!d.parts.includes(b), g + '/' + s + ': «' + b + '» في تصميم محتشم');
      assert.doesNotMatch(d.text, /^!|; !/, 'علامة ! لا تصل الأمر');
    }
  }
  const neck = V.axesFor('women', 'evening', true)[1];
  assert.ok(neck.every((o) => /long/.test(o)), 'ياقات السهرة المحتشمة كلّها بأكمام طويلة');
  // وفي غير الاحتشام تبقى الخيارات كاملة بلا علامة !
  assert.ok(V.axesFor('women', 'evening', false).flat().every((o) => !o.startsWith('!')));
});

/* ———————— المعالج الحقيقيّ بـfetch مزيّف ———————— */
process.env.GEMINI_API_KEY = 'test-gemini';
delete process.env.OPENAI_API_KEY; // لا مسار ثانٍ بالتوازي — موضوعنا ما يصل النموذج
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/_fashionUsage.js', {
  FASHION_DAILY_LIMIT: 3,
  checkFashionQuota: async () => ({ allowed: true, username: 'omran' }),
  consumeFashion: async () => 2,
});
const handler = require(rp('api/_lib/fashion-create.js'));

async function run(body) {
  const calls = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    const b = JSON.parse(init.body);
    const text = b.contents[0].parts.filter((p) => p.text).map((p) => p.text).join('\n');
    if (u.includes('image:generateContent')) {
      calls.push({ kind: 'gen', text });
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'UkVTVUxU' } }] } }] });
    }
    calls.push({ kind: 'guard', text });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ sourceIsPhotograph: true, resultIsPhotograph: true, sameVisualMedium: true, identityPreserved: true, onlyRequestedChange: true }) }] } }] });
  };
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(v) { json = v; return this; }, end() { return this; } };
  try {
    await handler({ method: 'POST', body: Object.assign({ mode: 'image', imageBase64: 'UEhPVE8=', mimeType: 'image/jpeg', style: 'evening', gender: 'women', token: 't' }, body) }, res);
  } finally { global.fetch = save; }
  const gen = calls.find((c) => c.kind === 'gen');
  return { status, json, prompt: gen && gen.text, guard: calls.find((c) => c.kind === 'guard') };
}

test('٥. الأمر: تصميم محدّد بعد وصف النمط وقبل قفل الهويّة، ويختلف من ضغطة لأخرى، والردّ يحمل رقمه', async () => {
  const a = await run({ variant: 0 });
  const b = await run({ variant: 1 });
  assert.equal(a.status, 200);
  for (const r of [a, b]) {
    assert.match(r.prompt, /SPECIFIC DESIGN \(follow it exactly/);
    const iStyle = r.prompt.indexOf('an elegant evening gown style');
    const iDesign = r.prompt.indexOf('SPECIFIC DESIGN');
    const iLock = r.prompt.indexOf('CRITICAL: keep the exact same person');
    assert.ok(iStyle >= 0 && iStyle < iDesign && iDesign < iLock, 'الترتيب: النمط ← التصميم ← قفل الهويّة');
    assert.equal(r.json.design.total, 216);
    assert.ok(r.json.design.n >= 1 && r.json.design.n <= 216);
  }
  assert.notEqual(a.prompt, b.prompt, 'ضغطتان = أمران مختلفان (كان الأمر نفسه حرفيًّا)');
  assert.notEqual(a.json.design.n, b.json.design.n);
  const da = V.designFor({ gender: 'women', style: 'evening', variant: 0 });
  const db = V.designFor({ gender: 'women', style: 'evening', variant: 1 });
  assert.ok(a.prompt.includes(da.text) && b.prompt.includes(db.text), 'نصّ التصميم المحسوب هو ما يصل');
  assert.notEqual(da.parts[0], db.parts[0], 'الهيئة تغيّرت');
  // الحارس يعرف التصميم المطلوب فلا يعدّ تفاصيله «تغييرًا غير مطلوب»
  assert.ok(a.guard && a.guard.text.includes(da.parts[0]), 'التصميم في طلب الحارس');
  // عميل قديم بلا عدّاد: يعمل ويأخذ تصميمًا
  const c = await run({});
  assert.equal(c.status, 200);
  assert.match(c.prompt, /SPECIFIC DESIGN/);
  assert.ok(c.json.design && c.json.design.total === 216);
});

test('٦. الألوان والإضافات: لوحة تتبدّل بلا اختيار، ولون المستخدم يغلب، والإضافة نوع محدّد لا اسم عامّ', async () => {
  const noCol = await run({ variant: 5 });
  assert.match(noCol.prompt, /Colour story for this design: /);
  assert.doesNotMatch(noCol.prompt, /Preferred colour palette/);
  const withCol = await run({ variant: 5, colors: ['Red'] });
  assert.match(withCol.prompt, /Preferred colour palette: Red\./);
  assert.doesNotMatch(withCol.prompt, /Colour story/, 'لون المستخدم لا تزاحمه لوحة');
  const bride = await run({ variant: 5, style: 'wedding' });
  assert.doesNotMatch(bride.prompt, /Colour story/, 'فستان العروس بلا لوحة — الأبيض من هويّة النمط');

  const acc = await run({ variant: 9, extras: ['Glasses', 'Watch'] });
  const want = V.accessoriesText(['Glasses', 'Watch'], { gender: 'women', variant: 9 });
  assert.ok(acc.prompt.includes('Add these accessories: ' + want + '.'), 'النوع المحدّد يصل');
  assert.doesNotMatch(acc.prompt, /Add these accessories: Glasses, Watch/, 'لا الاسم العامّ القديم');
  const acc2 = await run({ variant: 10, extras: ['Glasses', 'Watch'] });
  assert.notEqual(acc.prompt.match(/Add these accessories: [^.]*/)[0], acc2.prompt.match(/Add these accessories: [^.]*/)[0], 'الإضافة تتغيّر مع التصميم');
  const unknown = await run({ variant: 1, extras: ['Brooch'] });
  assert.match(unknown.prompt, /Add these accessories: Brooch\./, 'اسم مجهول يبقى كما كان');
});

test('٧. الاحتشام في الأمر، ونسختا الطفل، والوصف النصّيّ يغلب، والتعديل الموضعيّ بلا تصميم', async () => {
  const bad = V.CATALOG.women.evening.split(' // ').flatMap((ax) => ax.split(' | ')).filter((o) => o.trim().startsWith('!')).map((o) => o.trim().slice(1).trim());
  for (let v = 0; v < 12; v++) {
    const r = await run({ variant: v, occasion: 'religious' });
    assert.match(r.prompt, /Modest styling is required/);
    for (const b of bad) assert.ok(!r.prompt.includes(b), 'مناسبة دينيّة وفي الأمر: ' + b);
    assert.equal(r.json.design.total, V.designTotal('women', 'evening', true));
  }
  const kid = await run({ variant: 3, gender: 'kids' });
  assert.match(kid.prompt, /girl: .* \/ boy: /);
  assert.match(kid.prompt, /use only the one that matches the child in the photo\./);

  const txt = await run({ mode: 'text', imageBase64: undefined, description: 'فستان سهرة أزرق طويل', variant: 2 });
  assert.equal(txt.status, 200);
  const iDesc = txt.prompt.indexOf('Specific description: فستان سهرة أزرق طويل');
  const iDir = txt.prompt.indexOf('Design direction for anything the description leaves open (the description wins');
  assert.ok(iDesc >= 0 && iDir > iDesc, 'الوصف أوّلًا ثمّ اتّجاه التصميم لما تركه مفتوحًا');
  assert.doesNotMatch(txt.prompt, /SPECIFIC DESIGN \(follow it exactly/, 'الوضع النصّيّ لا يفرض التصميم على الوصف');

  const refine = await run({ mode: 'refine', editRequest: 'غيّري لون الفستان إلى أزرق فقط', variant: 4 });
  assert.equal(refine.status, 200);
  assert.doesNotMatch(refine.prompt, /SPECIFIC DESIGN|Design direction|Colour story/);
  assert.equal(refine.json.design, undefined, 'التعديل الموضعيّ ليس تصميمًا جديدًا');
});

test('٨. العميل: عدّاد لكلّ فئة×نمط يُرسَل في التوليد والمقارنة، ورقم التصميم في الحالة', () => {
  assert.match(studios, /variant: fxNextVariant\(styleEl\.value\) \};/, 'التوليد يرسل العدّاد');
  assert.match(studios, /fairness: true, engine: [^\n]*variant: fxNextVariant\(styleVal\) \};/, 'المقارنة ترسل عدّادًا لكلّ نمط');
  assert.match(studios, /setStatus\(t\('fashionAiDone'\) \+ \(__dl \? ' ' \+ __dl : ''\)\);/);
  assert.match(studios, /t\('fxStylesPlus'\)/, '«أكثر من ١٠٠ تصميم لكل نمط» تحت بطاقة النمط');

  // الدالّتان الحقيقيّتان في vm: رقم يبدأ عشوائيًّا ويتقدّم لكلّ نمط وحده، ونصّ الرقم
  const a = studios.indexOf('  const FX_VARIANT_KEY');
  const b = studios.indexOf('  function lookImg(');
  assert.ok(a > 0 && b > a);
  const store = {};
  const ctx = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    Math, JSON, Number, __swallow() {},
    gender: 'women',
    t: (k) => (k === 'fxDesignNo' ? 'التصميم رقم {n} من {total} لهذا النمط' : k),
  };
  vm.runInNewContext('function currentGender(){ return gender; }\n' + studios.slice(a, b) + '\nthis.next = fxNextVariant; this.line = fxDesignLine;', ctx);
  const e1 = ctx.next('evening'), e2 = ctx.next('evening'), c1 = ctx.next('casual');
  assert.ok(Number.isInteger(e1) && e1 >= 0 && e1 < 100000);
  assert.equal(e2, e1 + 1, 'الضغطة التالية = التصميم التالي');
  ctx.gender = 'men';
  const m1 = ctx.next('evening');
  const map = JSON.parse(store.aiapp_fashion_variant);
  assert.equal(map['women|evening'], e1 + 2);
  assert.equal(map['women|casual'], c1 + 1);
  assert.equal(map['men|evening'], m1 + 1, 'لكلّ فئة عدّادها');
  store.aiapp_fashion_variant = '{bad json';
  assert.ok(Number.isInteger(ctx.next('evening')), 'تخزين تالف لا يكسر التوليد');
  assert.equal(ctx.line({ n: 37, total: 216 }), 'التصميم رقم 37 من 216 لهذا النمط');
  assert.equal(ctx.line(undefined), '', 'خادم قديم بلا الحقل = لا سطر');
});

test('٩. بطاقات الإضافات: شبكة حقيقيّة، والاسم تحت الصورة، وصورة مقرّبة تغطّي المربّع، والتأجيل على المربّع', () => {
  const dg = R('js/design-gen.js');
  const fn = dg.slice(dg.indexOf('  function extrasRow(){'), dg.indexOf('  /* v-fashion-variety: سطر يشرح'));
  assert.match(fn, /display:grid;grid-template-columns:repeat\(auto-fit,minmax\(92px,1fr\)\)/, 'شبكة لا flex يلتفّ');
  assert.doesNotMatch(fn, /photoize\(/, 'photoize يجعل الاسم absolute فتنكمش البطاقة — لا يُستعمل للإضافات');
  assert.doesNotMatch(fn, /className='chipGrid/);
  assert.match(fn, /__omranWhenSeen\(pic,function\(\)\{ im\.src=url; \}\)/, 'الصورة المزاحة خارج القصّ لا تتقاطع — المراقَب هو المربّع');
  assert.match(dg, /row\.insertAdjacentElement\('afterend',hint\('fxAccHint'\)\);/);
  // focusCss الحقيقيّة: كلّ إضافة لها نقطة تركيز، والصورة (٢:٣) تغطّي المربّع كاملًا بلا فراغ
  const ctx = {};
  vm.runInNewContext(dg.match(/var EXT=\[[^\n]*\];/)[0] + '\n' + dg.match(/  var EXT_FOCUS=\{[^\n]*\};/)[0] + '\n' +
    dg.slice(dg.indexOf('  function focusCss(f){'), dg.indexOf('  function paintAcc(')) + '\nthis.EXT=EXT; this.F=EXT_FOCUS; this.css=focusCss;', ctx);
  for (const r of ctx.EXT) {
    const f = ctx.F[r[0]];
    assert.ok(f, 'نقطة تركيز لـ' + r[0]);
    const css = ctx.css(f);
    const num = (k) => Number(css.match(new RegExp('(?:^|;)' + k + ':(-?[\\d.]+)%'))[1]);
    const w = num('width'), l = num('left'), tp = num('top');
    assert.ok(w >= 100, r[0] + ': تكبير ≥١');
    assert.ok(l <= 0 && l + w >= 100 - 0.1, r[0] + ': فراغ أفقيّ');
    assert.ok(tp <= 0 && tp + 1.5 * w >= 100 - 0.1, r[0] + ': فراغ عموديّ');
  }
});

test('١٠. النصوص الجديدة بالـ١٤ لغة، ووسوم الكاش مرفوعة', () => {
  const langs = ['fr', 'es', 'tr', 'ru', 'id', 'fil', 'hi', 'ur', 'bn', 'ne', 'ml', 'zh'];
  const i18n03 = R('js/app-03-i18n-data.js');
  const count = (s, k) => (s.match(new RegExp('\\b' + k + ': "', 'g')) || []).length;
  for (const k of ['fxDesignNo', 'fxStylesPlus', 'fxAccHint']) assert.equal(count(i18n03, k), 2, k + ' بالعربيّة والإنجليزيّة');
  for (const lg of langs) {
    const s = R('i18n/' + lg + '.js');
    for (const k of ['fxDesignNo', 'fxStylesPlus', 'fxAccHint']) assert.equal(count(s, k), 1, lg + ': ' + k);
    const dn = s.match(/fxDesignNo: "([^"]*)"/)[1];
    assert.ok(dn.includes('{n}') && dn.includes('{total}'), lg + ': العنصران النائبان');
  }
  for (const m of i18n03.matchAll(/fxDesignNo: "([^"]*)"/g)) assert.ok(m[1].includes('{n}') && m[1].includes('{total}'));
  // لا اسم مزوّد أو نموذج في نصّ يراه المستخدم
  const lines = [i18n03, ...langs.map((lg) => R('i18n/' + lg + '.js'))].join('\n').split('\n').filter((l) => /fxDesignNo/.test(l));
  for (const l of lines) assert.doesNotMatch(l, /gemini|gpt|openai|claude|جيمناي|كلود/i);
  assert.match(R('js/app-04-i18n-state.js'), /i18n\/' \+ lg \+ '\.js\?v=707'/);
  assert.match(R('index.html'), /\/js\/design-gen\.js\?v=610/); // v-fx-simple (مراسي data-ext/data-col)
  // الحزمة مبنيّة من الأجزاء (العدّاد ورقم التصميم فيها)
  assert.ok(R('js/app.bundle.js').includes("const FX_VARIANT_KEY = 'aiapp_fashion_variant';"));
});
