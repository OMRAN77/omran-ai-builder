// tests/hw-1316-listing.test.cjs — v-hw-1316 (رفض هواوي 1.3.15، ٣ نوفمبر ٢٠٢٦، بالقاعدة 1.14 وحدها: «لقطة الشاشة لا تطابق محتوى التطبيق
// ووظائفه الفعليّة» في «بيئة متعدّدة اللغات»): اللغة تتبع الهاتف داخل تطبيق هواوي، ولا نصّ ظاهر يَعِد ببناء تطبيقات، واحتياط WebView
// أقدم (Chromium 99) لشاشات اللقطات، ولقطات جديدة فيها الرئيسيّة والمحادثة. كلّه في الموقع — 1.3.15 نفسها تُعاد بلا بناء.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function langBoot({ huawei, phone, saved, manual, webview = true }) {
  const src = read('js/app-04-i18n-state.js');
  const a = src.indexOf('function omranLangAuto(){');
  const b = src.indexOf("if(omranLangAuto()){ try { localStorage.setItem('aiapp_lang', lang); }");
  assert.ok(a > 0 && b > a, 'كتلة لغة الإقلاع');
  const block = src.slice(a, src.indexOf('\n', b)) + '\nthis.__lang = lang;';
  const local = Object.assign({}, saved ? { aiapp_lang: saved } : {}, manual ? { aiapp_lang_manual: '1' } : {});
  const ctx = {
    __swallow: (e) => { throw e; },
    window: webview ? { OmranRender: { mode: () => 'cpu' } } : {},
    navigator: { languages: [phone], language: phone },
    sessionStorage: { getItem: (k) => (k === 'aiapp_store' && huawei ? 'huawei' : null) },
    localStorage: { getItem: (k) => (k in local ? local[k] : null), setItem: (k, v) => { local[k] = String(v); } },
  };
  vm.runInNewContext(block, ctx);
  return { lang: ctx.__lang, saved: local.aiapp_lang };
}

test('١. تطبيق هواوي يتبع لغة الهاتف في كلّ تشغيل ويحفظها فورًا، والاختيار باليد يغلب، والموقع كما كان', () => {
  // المراجع: هاتف صينيّ ثمّ إنجليزيّ ثمّ عربيّ على التخزين نفسه
  let r = langBoot({ huawei: true, phone: 'zh-CN' });
  assert.deepEqual(r, { lang: 'zh', saved: 'zh' }, 'أوّل تشغيل');
  r = langBoot({ huawei: true, phone: 'en-US', saved: 'zh' });
  assert.deepEqual(r, { lang: 'en', saved: 'en' }, 'بدّل الهاتف للإنجليزيّة: تتبعه — كانت تبقى صينيّة');
  r = langBoot({ huawei: true, phone: 'ar-AE', saved: 'en' });
  assert.equal(r.lang, 'ar');
  assert.equal(langBoot({ huawei: true, phone: 'zh-CN', saved: 'fr', manual: true }).lang, 'fr', 'اختار الفرنسيّة بيده: تبقى');
  assert.equal(langBoot({ huawei: false, phone: 'en-US', saved: 'zh' }).lang, 'zh', 'الموقع: المحفوظ يغلب كما كان');
  assert.deepEqual(langBoot({ huawei: true, webview: false, phone: 'en-US', saved: 'ar' }), { lang: 'ar', saved: 'ar' },
    'TWA داخل Chrome (بلا جسر OmranRender): التخزين مشترك مع الموقع — لا يمحو لغة اختارها الموقع');
  assert.equal(langBoot({ huawei: false, phone: 'en-US' }).lang, 'en', 'الموقع: أوّل زيارة من الهاتف');
  // setLang وحده يكتب العلم — قبل «اللغة نفسها؟ ارجع» (اختيار الظاهرة اختيار)
  const src = read('js/app-04-i18n-state.js');
  const s = src.slice(src.indexOf('function setLang(newLang){'), src.indexOf('function setLang(newLang){') + 600);
  const flag = s.indexOf("localStorage.setItem('aiapp_lang_manual', '1')"), early = s.indexOf('if(lang === newLang) return;');
  assert.ok(flag > 0 && flag < early, 'العلم في setLang قبل الرجوع المبكّر');
  assert.equal(src.split("setItem('aiapp_lang_manual'").length, 2, 'لا كاتب آخر للعلم (لا applyLanguage ولا مسار /ar ولا hl)');
  assert.match(read('js/selfdiag.js'), /sessionStorage\.setItem\('aiapp_store'/, 'علم الحزمة من selfdiag');
  const html = read('index.html');
  assert.ok(html.indexOf('/js/selfdiag.js?v=') < html.indexOf('/js/app.bundle.js?v='), 'selfdiag يسبق الحزمة');
  // سكربت الرأس: الاتّجاه والستار من لغة الهاتف في الحالة نفسها (كان يرسم عربيًّا ثانيةً ثمّ ينقلب)
  const boot = html.slice(html.indexOf("var l = localStorage.getItem('aiapp_lang') || 'ar';"), html.indexOf("if(l === 'ar'){ document.title"));
  assert.match(boot, /store=huawei[\s\S]*window\.OmranRender[\s\S]*aiapp_lang_manual[\s\S]*navigator\.languages/);
});

test('٢. نائب صندوق الكتابة في الـ١٤ لغة «اكتب رسالتك هنا» — لا «صف التطبيق أو اللعبة أو الموقع… لعبة الثعبان»، والوسم مرفوع', () => {
  const EXPECT = { fr: 'Écrivez votre message ici ...', es: 'Escribe tu mensaje aquí ...', tr: 'Mesajınızı buraya yazın ...', ru: 'Напишите сообщение здесь ...',
    hi: 'अपना संदेश यहाँ लिखें ...', ur: 'اپنا پیغام یہاں لکھیں ...', bn: 'আপনার বার্তা এখানে লিখুন ...', ne: 'आफ्नो सन्देश यहाँ लेख्नुहोस् ...',
    fil: 'Isulat ang iyong mensahe dito ...', id: 'Tulis pesan Anda di sini ...', zh: '在此输入您的消息...', ml: 'നിങ്ങളുടെ സന്ദേശം ഇവിടെ എഴുതുക ...' };
  for (const [l, v] of Object.entries(EXPECT)) {
    const m = [...read('i18n/' + l + '.js').matchAll(/"?promptPlaceholder"?:\s*"((?:[^"\\]|\\.)*)"/g)];
    assert.equal(m.length, 1, l + ': مفتاح واحد');
    assert.equal(m[0][1], v, l);
  }
  const a3 = read('js/app-03-i18n-data.js');
  assert.match(a3, /promptPlaceholder: 'اكتب رسالتك هنا \.\.\.'/);
  assert.match(a3, /promptPlaceholder: 'Type your message here \.\.\.'/);
  const line = read('js/app-04-i18n-state.js').split('\n').find((x) => x.includes("sc.src = 'i18n/' + lg + '.js?v="));
  const t = /\.js\?v=(\d+)';[^\n]*v-hw-1316 \((\d+)\): /.exec(line || '');
  assert.ok(t && Number(t[1]) >= Number(t[2]) && Number(t[2]) >= 781, 'وسم ملفّات اللغة مرفوع والسبب ملحق');
});

test('٣. داخل تطبيق هواوي: لا حبّة «يبني تطبيقك فورًا»، ولا «منصّة لبناء التطبيقات» في «عن التطبيق»، ووصف البيان أدوات ومحادثة', () => {
  const f10 = read('js/app-10-features.js');
  assert.ok(f10.includes("if(!localStorage.getItem('askAllHintSeen') && !(typeof omranHwPackage === 'function' && omranHwPackage())){"), 'الحبّة لا تُنشأ في الحزمة');
  const u = read('js/app-05-ui.js');
  const i = u.indexOf("__hwNb.id = 'hwNoBuilderCss';");
  assert.ok(i > 0 && u.lastIndexOf('if(omranHwPackage()){', i) > u.indexOf('function omranHwPackage(){'), 'تحت omranHwPackage()');
  const css = u.slice(i, u.indexOf('appendChild(__hwNb)', i));
  for (const k of ['aboutTagline', 'aboutFeatChat', 'aboutMoreSummary', 'aboutText']) assert.ok(css.includes('[data-i18n=\\"' + k + '\\"]') || css.includes('[data-i18n="' + k + '"]'), k);
  assert.match(css, /\{display:none !important;\}'\s*\n\s*\+ 'details:has\(/, 'قاعدة :has مستقلّة — محدِّد مجهول في WebView 99 لا يُسقط الأولى');
  assert.match(u, /e\.parentElement\.style\.display = 'none'[\s\S]{0,200}e\.closest\('details'\)/, 'وبالكود للحاضنات (WebView 99 بلا :has: بطاقة 💬 وصندوق فارغان)');
  const ps = read('js/partials-settings.js');
  for (const k of ['aboutTagline', 'aboutFeatChat', 'aboutMoreSummary', 'aboutText']) assert.match(ps, new RegExp('data-i18n="' + k + '"'), k + ' في الإعدادات');
  const d = JSON.parse(read('manifest-huawei.json')).description;
  assert.doesNotMatch(d, /مُنشئ تطبيقات|ألعاب|تلفزيون|سيرة ذاتية/, 'لا بناء تطبيقات ولا أدوات موقوفة');
  assert.match(d, /مساعد محادثة/);
});

test('٤. WebView أقدم (Chromium 99): خطوط cqw داخل @supports، واحتياط @container، وأسماء غرف الديكور ١٠px، وبطاقة القبلة بلا :has', () => {
  const c = read('css/رفع-الصور.css');
  const sup = c.indexOf('@supports (font-size:1cqw){');
  assert.ok(sup > 0, '@supports للخطّ النسبيّ');
  assert.ok(c.indexOf('font-size:max(14px,var(--ts,3.8cqw))') > sup && c.indexOf('font-size:max(12px,var(--bs,1.7cqw))') > sup, 'max(…cqw) داخله وحده');
  assert.match(c, /\.omUpArt \.omUpT\{top:var\(--t\);font-weight:900;font-size:clamp\(14px,2\.6vw,26px\) !important;letter-spacing/, 'القاعدة الأساسيّة clamp وحده');
  assert.match(c, /\.omUpArt \.omUpB\{font-size:clamp\(12px,1\.6vw,17px\) !important;color/);
  const ns = c.indexOf('@supports not (container-type:inline-size){'), ct = c.indexOf('@container (max-width:560px){');
  assert.ok(ns > 0 && ns < ct, 'احتياط @container قبله (ترتيب يحفظ اختبار layout-direction)');
  assert.match(read('index.html'), /css\/رفع-الصور\.css\?v=(\d+)/);
  assert.ok(Number(/css\/رفع-الصور\.css\?v=(\d+)/.exec(read('index.html'))[1]) >= 7, 'وسم CSS مرفوع');
  assert.match(read('js/app-12-studios.js'), /' font-size:10px; font-size:clamp\(10px, 1\.5cqw, 14px\); font-weight:800;/, 'cqw مجهول يُسقط clamp وحده');
  assert.match(read('js/app-12-studios.js'), /cap\.style\.width = 'max-content';\s*\n\s*cap\.style\.maxWidth = '124%';/, '«Restaurant» كاملة لا «Restaura/nt» (الاسم يُترجم بعد البناء فلا يُقاس)');
  assert.match(c, /#studioAiSlots\.two \.omUpStyle :is\(\.omUpB,\.omUpL\)\{font-size:9px !important;\}/, 'وضع الدمج ٩px كالحديث');
  const u = read('js/app-05-ui.js');
  assert.match(u, /__hwPrev\.classList\.add\('hwOddLast'\)/);
  const r = read('css/redesign.css');
  assert.match(r, /\.huawei-tools-grid > \.hwToolCard\.hwOddLast\{grid-column:1 \/ -1; justify-self:center; width:calc\(50% - 6px\);\}/);
  assert.ok(Number(/css\/redesign\.css\?v=(\d+)/.exec(read('index.html'))[1]) >= 698);
});

test('٥. اللقطات الجديدة: الرئيسيّة والمحادثة، والمربّع بأقسامه الثلاثة، بلغة هاتف حقيقيّة (locale) لا aiapp_lang وحده', () => {
  const sh = read('store/huawei/shots.mjs');
  const names = [...sh.matchAll(/\{ name: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(names, ['01-home-chat', '02-tools-creative', '03-tools-business', '04-tools-life', '05-fashion-studio', '06-decor-ai', '07-construction', '08-qibla-prayer']);
  assert.match(sh, /name: '01-home-chat', js: TOUR \+ 'document\.getElementById\("stpCloseBtn"\)\.click\(\); '/, 'الرئيسيّة بعد إغلاق المربّع كما يفعل الرجوع');
  assert.match(sh, /name: '04-tools-life', js: group\('grpLife'\)/);
  const ui = read('scripts/ui-shot.mjs');
  assert.match(ui, /const PHONE_LOCALE = LANG === 'zh' \? 'zh-CN' : \(LANG === 'ar' \? 'ar' : \(LANG === 'en' \? 'en-US' : LANG\)\);/);
  assert.equal(ui.split('locale: PHONE_LOCALE').length, 3, 'سياقا الهاتف والحاسوب');
  const notes = read('store/huawei/REVIEW-NOTES.md');
  assert.match(notes, /إعادة تقديم 1\.3\.15 نفسها \(v-hw-1316، بلا APK جديد\)/);
  assert.match(notes, /اجعله \*\*«عمران AI»\*\* في كلّ لغة/, 'اسم AGC = اسم الهاتف');
  assert.doesNotMatch(notes, /يبقى كما هو — يطابق|unchanged in AGC|لا يتغيّر — يطابق|six tools|ستّ أدوات/, 'لا سطر قديم يناقض الجديد');
  assert.match(notes, /\*\*قبل Submit:\*\* انتظر تأكيد وصول التحديث إلى الموقع/);
});
