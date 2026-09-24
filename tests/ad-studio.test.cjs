'use strict';
/* v-ad-suite (مراجع المالك ٢٤ سبتمبر: ثلاث لوحات إعلانيّة احترافيّة — عقاريّ، استثمار، معرض سيّارات).
   الفرق عن الاستوديو لم يكن لونًا بل بنيةً: لوحات معلومات مركّبة (شعار · شارة · عمود مواصفات ·
   شريط صور · مخطّط · خريطة · صفّ مرافق · شريط تواصل) لا «صورة + حجاب + نصّ». وتُرسم كودًا لا
   بمولّد الصور لأنّ نصّها دقيق (٧٩٦ قدم²، ٢٫٥٣ مليون، Q4 2026) والمولّد يهلوس الحروف والأرقام.
   ومعها أربعة أعطاب مثبتة بالمسابر قبل الإصلاح — كلّها محروسة هنا. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('ad-studio.html', 'utf8');
const adimage = fs.readFileSync('api/_lib/adimage.js', 'utf8');
const adchat = fs.readFileSync('api/_lib/adchat.js', 'utf8');

/* يبني النصّ الفعليّ المرسل إلى مولّد الصور، بلا شبكة ولا مفاتيح حقيقيّة. */
async function promptFor(body) {
  const L = '../api/_lib/';
  const stub = (exp) => ({ id: 'x', filename: 'x', loaded: true, exports: exp });
  require.cache[require.resolve(L + '_usage.js')] = stub({ checkAndConsumeCustom: async () => ({ allowed: true, remaining: 7 }) });
  require.cache[require.resolve(L + 'points.js')] = stub({ verifyPointsToken: () => 'omran' });
  delete require.cache[require.resolve(L + 'adimage.js')];
  process.env.OPENAI_API_KEY = 'test-only-not-a-key';
  process.env.GEMINI_API_KEY = '';
  const realFetch = global.fetch;
  let cap = null;
  global.fetch = async (url, init) => { cap = { url, init }; return { ok: false, status: 402, json: async () => ({ error: { message: 'stub' } }) }; };
  try {
    await require(L + 'adimage.js')({ method: 'POST', body }, { setHeader() {}, status() { return this; }, end() {} });
  } finally { global.fetch = realFetch; }
  assert.ok(cap, 'لم يُرسل أيّ طلب إلى المولّد');
  const b = cap.init.body;
  return { url: String(cap.url), prompt: typeof b === 'string' ? JSON.parse(b).prompt : b.get('prompt'),
    images: typeof b === 'string' ? 0 : b.getAll('image[]').length };
}

const BODY = { token: 't', lang: 'ar', ratio: 'tall', look: 'cinema', ac: '',
  title: 'لاندكروزر ٢٠٠٤', spec: 'ممشى ٢١٣٬٠٠٠ · خليجي', price: '٤٩٬٠٠٠', unit: 'درهم',
  tel: '050 504 0108', kick: 'للبيع · دبي', imageBase64: '', mimeType: '' };

test('١. ذيل أمر التوليد يصل فعلًا — فاصلة منقوطة كانت تجعل آخر سطرين جملةً مرميّة', async () => {
  const { prompt } = await promptFor(BODY);
  assert.match(prompt, /no watermark, no logo, no invented or misspelled letters/);
  assert.match(prompt, /Composition must be clean, balanced, symmetric/);
  // الجذر نفسه: لا فاصلة منقوطة تغلق الجملة قبل السطرين
  assert.doesNotMatch(adimage, /at night\. '\)\);/);
});

test('٢. الأسلوب المختار (look) يدخل النصّ — كان يُقرأ ويُرمى', async () => {
  const { prompt } = await promptFor(BODY);
  assert.match(prompt, /cinematic dusk scene/);
  const withPhoto = await promptFor({ ...BODY, imageBase64: 'x'.repeat(200), mimeType: 'image/jpeg' });
  assert.match(withPhoto.prompt, /Art direction: .*cinematic dusk/);
});

test('٣. الفئة والرقائق تُرسلان من الصفحة — بدونهما لا قالب معتمد ولا بطاقات معلومات', async () => {
  assert.match(html, /cat:S\.cat\|\|''/);
  assert.match(html, /chips:\(S\.features&&S\.features\.length\?S\.features:/);
  const withCat = await promptFor({ ...BODY, cat: 'car', chips: ['الموديل ٢٠٠٤', 'الممشى ٢١٣٬٠٠٠ كم'] });
  assert.match(withCat.prompt, /APPROVED LAYOUT TEMPLATE/);
  assert.match(withCat.prompt, /A single horizontal row of 2 small rounded rectangular info cards/);
  assert.equal(withCat.images, 1, 'القالب المعتمد لم يُرفق');
  assert.match(withCat.url, /\/v1\/images\/edits$/);
});

test('٤. اللوحات الثلاث المركّبة موجودة بمناطقها العشر', () => {
  ['posterK', 'posterL', 'posterM'].forEach((f) => assert.ok(html.includes('function ' + f + '('), 'ناقص ' + f));
  ['.cpo .bdg', '.cpo .feat', '.cpo .strip', '.cpo .amen', '.cpo .foot', '.cpo .card', '.cpo .cut']
    .forEach((sel) => assert.ok(html.includes(sel), 'ناقصة منطقة ' + sel));
  ['.K .k-hero', '.K .k-side', '.K .k-strip', '.K .k-mid', '.K .k-amen', '.K .k-foot',
    '.L .l-hero', '.L .l-side', '.L .l-row1', '.L .l-row2', '.L .l-strip',
    '.M .m-head', '.M .m-hero', '.M .m-brands', '.M .m-feat', '.M .m-bar']
    .forEach((sel) => assert.ok(html.includes(sel), 'ناقص تنسيق ' + sel));
  // النصّ كلّه كودًا: لا نداء لمولّد الصور من بنائها
  ['posterK', 'posterL', 'posterM'].forEach((f) => {
    const body = html.slice(html.indexOf('function ' + f + '('), html.indexOf('function ' + f + '(') + 2600);
    assert.doesNotMatch(body, /api\/adimage/);
  });
});

test('٥. المقاس بوحدة --u لا بـem — em داخل em يتراكم فينكسر التناسب عند التنزيل', () => {
  assert.match(html, /cv\.style\.setProperty\('--u'|el\.style\.setProperty\('--u'/);
  assert.match(html, /function cSetU\(el\)\{[\s\S]{0,200}--u/);
  assert.match(html, /addEventListener\('resize',cSetAll\)/);
});

test('٦. التنزيل بجودة طباعة — لا تقلّ عن ١٦٠٠ بكسل على الضلع الأعرض', () => {
  assert.match(html, /Math\.max\(2,Math\.min\(4,Math\.ceil\(1600\//);
});

test('٧. زرّ «أعِد الكلّ لأصله» مربوط بسمته لا بترتيب صنفه', () => {
  assert.match(html, /querySelector\('\.rstAll\[data-i18n="resetAll"\]'\)\.onclick/);
  // أوّل .rstAll في البنية هو مبدّل الخلفيّة الذي يستبدل معالجه لاحقًا
  const bar = html.slice(html.indexOf('class="dragbar"'), html.indexOf('class="dragbar"') + 900);
  assert.ok(bar.indexOf('id="inkT"') < bar.indexOf('data-i18n="resetAll"'), 'ترتيب الزرّين تغيّر — راجع الربط');
});

test('٨. رقائق البيع تمرّ بـesc في كلّ تصميم — أيّ < في كلام المستخدم كان يكسر اللوحة', () => {
  const rend = html.slice(html.indexOf('function render()'), html.indexOf('/* ================= سحب حرّ'));
  const raw = rend.match(/chips(?:\.map\(x=>'<span>'\+x|\[0\]\+'|\.join\(' · '\))/g) || [];
  assert.equal(raw.length, 0, 'ما زالت هناك رقاقة تدخل innerHTML خامًا: ' + raw.join(' | '));
  assert.ok(rend.includes("chips.map(x=>'<span>'+esc(x)"), 'esc غير مطبَّق على الرقائق');
});

test('٩. Escape يغلق التكبير أوّلًا ثمّ يخرج من الصفحة', () => {
  assert.match(html, /if\(z&&z\.classList\.contains\('on'\)\)\{ z\.classList\.remove\('on'\); return; \}/);
});

test('١٠. عقل المحادثة يجمع حقول اللوحة، وسقف الرموز يتّسع لسطر @@AD الأطول', () => {
  ['titleEn', 'badge', 'features', 'amenities', 'landmarks', 'brands', 'deal']
    .forEach((k) => assert.ok(adchat.includes('"' + k + '"'), 'حقل ناقص في @@AD: ' + k));
  assert.match(adchat, /لا تخترع رقمًا ولا مرفقًا ولا معلمًا لم يقله المستخدم/);
  const mt = adchat.match(/max_tokens:\s*(\d+)/);
  assert.ok(mt && Number(mt[1]) >= 1200, 'سقف الرموز أصغر من أن يسع سطر @@AD الجديد');
});

test('١١. «طوابع المدرسة» بعدّاد مستقلّ — كانت تأكل رصيد الإعلانات اليوميّ', () => {
  const stamps = fs.readFileSync('api/_lib/stamps.js', 'utf8');
  assert.match(stamps, /checkAndConsumeCustom\(b\.token, null, null, 'stamps', DAILY\)/);
  assert.doesNotMatch(stamps, /checkAndConsumeCustom\([^)]*'adimage'/);
});

test('١٢. ١٤ لغة بلا مفتاح ناقص، والوسم مرفوع', () => {
  global.window = {};
  delete require.cache[require.resolve('../i18n/ad-studio.js')];
  require('../i18n/ad-studio.js');
  const X = global.window.ADI18N;
  const langs = Object.keys(X);
  assert.equal(langs.length, 14, 'عدد اللغات تغيّر');
  const base = Object.keys(X.ar);
  for (const l of langs) {
    const miss = base.filter((k) => X[l][k] === undefined);
    assert.equal(miss.length, 0, 'مفاتيح ناقصة في ' + l + ': ' + miss.slice(0, 8).join(', '));
  }
  ['cTitle', 'cm0', 'cm1', 'cm2', 'brandTitle', 'mTitle', 'amenDefault', 'dlPrint', 'copyBtn', 'resumeBtn']
    .forEach((k) => assert.ok(base.includes(k), 'مفتاح جديد ناقص: ' + k));
  assert.match(html, /i18n\/ad-studio\.js\?v=604/);
});

test('١٣. «بطاقة مواصفات» تتصدّر العشرة، ومفاتيح السحب تتبع رقم التصميم لا ترتيبه', () => {
  assert.match(html, /const HH=\[A,B,C,D,E,F,G,H,I,J\], ORD=\[9,/);
  assert.match(html, /cv\.dataset\.si=\(cv\.closest\('\.col'\)\|\|\{dataset:\{\}\}\)\.dataset\.ci/);
  assert.match(html, /b\.dataset\.si=col\.dataset\.ci/);
});

test('١٤. هويّة المكتب وجلسة الإعلان تُحفظان محلّيًّا، والصور تبقى خارج التخزين', () => {
  assert.match(html, /const BRKEY='adst-brand-v1'/);
  assert.match(html, /const SKEY='adst-sess-v1'/);
  const fld = html.match(/const SFLD=\[([\s\S]*?)\];/);
  assert.ok(fld, 'قائمة حقول الجلسة غير موجودة');
  ['img', 'thumbs', 'plan', 'map', 'person', 'logo'].forEach((k) =>
    assert.ok(!fld[1].includes("'" + k + "'"), 'صورة تُحفظ في التخزين: ' + k));
});

/* v-ad-tidy (بلاغ المالك بعد الجولة الأولى: «أشوفه جميل لكن معقّد شوي… خلّه أبسط،
   والصورة النهائيّة مقطوعة من فوق مش كاملة»). أُعيد إنتاجه بتنزيل الـPNG فعلًا من
   مسار الزرّ نفسه: الأبعاد سليمة، لكنّ object-fit:cover كان يقصّ أعلى المشهد وأسفله. */
test('١٥. صور اللوحات تُعرض كاملة — contain فوق نسخة مموّهة، لا قصّ بـcover', () => {
  assert.match(html, /\.cpo \.im \.ft\{position:relative;object-fit:contain\}/);
  assert.match(html, /\.cpo \.im \.bl\{position:absolute;inset:0;object-fit:cover;filter:blur/);
  assert.match(html, /function cImg\(src,label\)\{[\s\S]{0,220}class="bl"[\s\S]{0,120}class="ft"/);
  // لا بطل ولا مخطّط ولا خريطة يمرّ بغير الغلاف
  const K = html.slice(html.indexOf('function posterK('), html.indexOf('function posterL('));
  ['MED.hero||S.img', 'MED.map', 'MED.plan'].forEach((src) =>
    assert.ok(K.includes('cImg(' + src), 'صورة خارج الغلاف: ' + src));
});

test('١٦. هامش واحد لكلّ المناطق، والصفّ الأوسط ثلاثة أعمدة متساوية', () => {
  assert.match(html, /--u:5px;--g:calc\(var\(--u\)\*2\.2\)/);
  assert.match(html, /\.K \.k-mid\{[^}]*grid-template-columns:1fr 1fr 1fr;gap:var\(--g\)/);
  ['.K .k-hero{top:var(--g);left:var(--g)', '.K .k-strip{top:calc(', '.L .l-hero{', '.M .m-hero{left:var(--g)']
    .forEach((sel) => assert.ok(html.includes(sel), 'منطقة بلا هامش موحّد: ' + sel));
});

test('١٧. تبسيط: شارتان لا ثلاث، ومرافق بالعربيّة وحدها، وشعار واحد في الشريط', () => {
  assert.match(html, /function cBadges\(\)\{ return \[S\.badge\|\|T\('badgeFb'\), S\.badge3\|\|S\.badge2\|\|''\]/);
  const amen = html.slice(html.indexOf('function cAmenBar('), html.indexOf('function cStrip('));
  assert.doesNotMatch(amen, /<em>/, 'السطر الإنجليزيّ ما زال يضاعف نصّ المرافق');
  const foot = html.slice(html.indexOf('function cFootBar('), html.indexOf('function cAmenBar('));
  assert.equal((foot.match(/cLogo\(\)/g) || []).length, 1, 'الشعار مكرَّر في شريط التواصل');
  assert.doesNotMatch(foot, /class="tag"/, 'السطر التعريفيّ مكرَّر مع الشعار');
});

test('١٨. صفّ الماركات يظهر فقط إن ذُكرت — كان يكرّر المزايا نفسها', () => {
  const M = html.slice(html.indexOf('function posterM('));
  assert.match(M, /const .*hb=br\.length>0/);
  assert.match(M, /\(hb\?'<div class="z m-brands"/);
  assert.doesNotMatch(M, /\(br\.length\?br:f\)/, 'ما زال يرتدّ إلى المزايا عند غياب الماركات');
});
