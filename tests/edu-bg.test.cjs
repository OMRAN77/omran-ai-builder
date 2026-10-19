'use strict';
/* v-edu-bg (المالك ١٩ أكتوبر): «قسم التعليم يتغيّر شكله مع الثيم، مو بس اللون» — الآن ثيمان فقط بأمره: المكتبة (الذهبيّ) والفضاء (البنفسجيّ)؛
   الباقي بعد موافقته. خلفيّة بلا أيّ كتابة، الوسط هادئ، webp أقلّ من ٢٠٠KB؛ والصفحة بتصميمه design/edu-mock/p1.html بالترتيب والمقاسات؛
   بطاقات شبه شفّافة بتغبيش خفيف بلا لوح معتم فوق الخلفيّة. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CSS = read('css/تعليم-خلفية.css');
const EDU = read('js/edu.js');
const PLUS = read('js/edu-plus.js');
const GEN = read('scripts/thumbs-paid.mjs');
const HTML = read('index.html');
const THEMES = ['classic', 'space'];

test('١. الثيمان: كتلة CSS وثلاث نسخ (حاسوب وجوّال وفاتح) لكلّ منهما، ولا شيء لغيرهما قبل موافقة المالك', () => {
  for (const k of THEMES) {
    assert.ok(CSS.includes('#eduHubModal[data-edu-bg="' + k + '"]{--edu-art-d:'), 'كتلة ' + k);
    for (const v of ['desktop', 'mobile', 'light']) assert.ok(fs.existsSync(path.join(ROOT, 'assets/edu-bg/' + k + '-' + v + '.webp')), k + '-' + v);
  }
  assert.deepStrictEqual(fs.readdirSync(path.join(ROOT, 'assets/edu-bg')).filter((f) => f.endsWith('.webp')).length, 6, 'ستّ صور فقط');
  assert.ok(!/data-edu-bg="(wood|darkwood|marble|code|cars|kids|cuisine|sunset|beach|winter|garage|anime|cyber|school|tactical|angel|neonanime|station|rally|smoke|library|cafe|workshop|modern)"/.test(CSS), 'لا ثيمات أخرى');
});

test('٢. كلّ صورة webp حقيقيّة أقلّ من ٢٠٠KB (قرار المالك)', () => {
  const dir = path.join(ROOT, 'assets/edu-bg');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.webp'))) {
    const b = fs.readFileSync(path.join(dir, f));
    assert.ok(b.length < 200 * 1024, f + ' ' + b.length);
    assert.strictEqual(b.toString('latin1', 0, 4) + b.toString('latin1', 8, 12), 'RIFFWEBP', f);
  }
});

test('٣. المولّد: وضع edu-bg بلا نصّ داخل الصورة والزخرفة على الأطراف والوسط هادئ وWebP تحت الحدّ', () => {
  assert.ok(/const EDU_BG = \{\s*[^]*?classic: \{[^]*?space: \{/.test(GEN), 'classic وspace');
  assert.ok(/EDU_BG_COMMON[\s\S]*?Absolutely no text, no letters, no numbers/.test(GEN), 'ممنوع النصّ');
  assert.ok(/outer edges and corners/.test(GEN) && /central area, about 60 percent/.test(GEN), 'الوسط هادئ');
  assert.ok(/const EDU_MAX = 195 \* 1024/.test(GEN), 'حدّ الحجم');
  assert.ok(/edubg: 'assets\/edu-bg'/.test(GEN), 'المسار');
});

function keyFor(classes, appTheme) {
  const src = EDU.match(/var EDU_BG_ACCENT=[\s\S]*?\nfunction eduBgKey\(\)\{[\s\S]*?\n\}\n/)[0];
  const ctx = {
    document: { documentElement: { classList: { contains: (c) => classes.includes(c) } } },
    localStorage: { getItem: (k) => (k === 'appTheme' ? appTheme : null) },
    __swallow() {},
  };
  vm.createContext(ctx);
  vm.runInContext(src + ';this.k=eduBgKey();', ctx);
  return ctx.k;
}
test('٤. المفتاح: الذهبيّ (والافتراضيّ) ← classic، البنفسجيّ ← space، وغيرهما وثيمات «خلفيّات الشاشة» يبقى كما كان', () => {
  assert.strictEqual(keyFor([], 'gold'), 'classic');
  assert.strictEqual(keyFor([], null), 'classic', 'الافتراضيّ ذهبيّ');
  assert.strictEqual(keyFor([], 'purple'), 'space');
  assert.strictEqual(keyFor([], 'red'), '');
  assert.strictEqual(keyFor(['skin', 'skin-cyber'], 'purple'), '', 'ثيم خلفيّة آخر لا يُمسّ');
});

test('٥. يتبدّل فورًا: مراقب على class وstyle وdata-mode للصفحة ويُستدعى عند الفتح', () => {
  assert.ok(/new MutationObserver\(syncEduBg\)\.observe\(document\.documentElement,\{attributes:true,attributeFilter:\['class','style','data-mode'\]\}\)/.test(EDU));
  assert.ok(/syncEduBg\(\);\nif\(window\.MutationObserver\)/.test(EDU));
});

test('٦. CSS: خلفيّة على الصفحة كلّها بلا لوح معتم، وبطاقات شبه شفّافة بتغبيش خفيف، ويعلو القواعد القديمة ويُحمَّل آخرًا', () => {
  assert.ok(HTML.indexOf('css/تعليم-خلفية.css?v=') > HTML.indexOf('css/بلا-خطوط.css?v='), 'آخرًا');
  assert.ok(Number(HTML.match(/تعليم-خلفية\.css\?v=(\d+)/)[1]) >= 9);
  assert.ok(Number(HTML.match(/\/js\/edu\.js\?v=(\d+)/)[1]) >= 671);
  assert.ok(Number(HTML.match(/\/js\/edu-plus\.js\?v=(\d+)/)[1]) >= 3);
  assert.ok(CSS.includes('html:root:root #eduHubModal[data-edu-bg]{background:var(--edu-art-d) center/cover no-repeat, var(--edu-base) !important;'));
  assert.ok(CSS.includes('.eduWrap{background:transparent !important;border:none !important;box-shadow:none !important;max-width:min(1280px,100%) !important;}'), 'لا لوح معتم');
  assert.ok(!/\.eduWrap\{[^}]*rgb\(var\(--edu-glass\)\)/.test(CSS) && !/\.eduWrap\{[^}]*rgba\(var\(--edu-glass\)/.test(CSS), 'لا تعتيم على العمود');
  assert.ok(/:is\(\.eduBx,\.eduLessonRow,\.eduPlusTile,\.eduUpCard,\.eduUpDrop\)\{background:rgba\(var\(--edu-glass\),\.5\) !important;-webkit-backdrop-filter:blur\(7px\);backdrop-filter:blur\(7px\);/.test(CSS), 'شبه شفّافة + blur');
  assert.ok(CSS.includes('@media (max-width:700px){html:root:root #eduHubModal[data-edu-bg]{background-image:var(--edu-art-m) !important;}'));
  assert.ok(CSS.includes('html[data-mode="light"]:root:root #eduHubModal[data-edu-bg]{background-image:var(--edu-art-l) !important;}'));
  assert.ok(!/display\s*:\s*none[^}]*}\s*$/m.test(CSS.split('\n').filter((l) => /eduUploadBtn|eduPlusTile|eduBody/.test(l)).join('\n')), 'لا إخفاء للوظائف');
});

test('٧. تصميم المالك p1.html: الترتيب والمقاسات (عنوان ٢٦، رفع ٢٢/١٣، صفّ ١٥.٥، بطاقة ١٦/١٢.٥ بارتفاع ١١٢، عمود جانبيّ ٣٠٠)', () => {
  for (const frag of ['.eduHead h2{background:none !important;-webkit-text-fill-color:var(--edu-head) !important;color:var(--edu-head) !important;font-size:26px',
    '.eduUpTxt b{font-size:22px', '.eduUpTxt small{font-size:13px', 'padding:12px 20px;font-size:15.5px', 'min-height:112px;padding:14px',
    '.eduPlusTitle{display:block;font-size:16px', '.eduPlusSub{display:block;font-size:12.5px', '.eduSide{width:300px;flex:0 0 300px',
    '.eduQuote b{display:block;font-size:22px', '.eduBk{height:44px', 'grid-template-columns:repeat(4,1fr);gap:14px', '.eduTwo{display:grid;grid-template-columns:1fr 1fr;gap:14px'])
    assert.ok(CSS.includes(frag), frag);
  /* الترتيب في المارك أب: رفع ← لصق ← منهج ← بطاقات ← (لغة | موادي) ← صانع الفيديو، وعمود جانبيّ بعده */
  const h = EDU.slice(EDU.indexOf('function showHome()'));
  const order = ['id="eduUploadBtn"', 'id="eduPasteToggle"', 'id="eduCurricBtn"', 'id="eduPlusHome"', 'class="eduTwo"', 'id="eduUpWrap"', 'id="eduOldEduRow"', 'eduSideHtml()'].map((x) => h.indexOf(x));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'الترتيب ' + order);
  assert.ok(/class="eduUpTxt"><b>'\+esc\(T\('upload'\)\)\+'<\/b><small>'\+esc\(T\('uploadSub'\)\)\+'<\/small>/.test(EDU), 'العنوان الفرعيّ من مفتاح الـ١٤ لغة');
  assert.ok(/#eduHubModal:not\(\[data-edu-bg\]\) \.eduSide\{display:none;\}/.test(CSS), 'من لا ثيم له لا عمود جانبيّ');
});

test('٨. نصوص العمود الجانبيّ بالـ١١ لغة غير العربيّة والإنجليزيّة (القاموس الجاهز __EDU_XL2)', () => {
  const L = ['fr', 'hi', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(PLUS.slice(PLUS.indexOf('window.__EDU_XL2 = {'), PLUS.indexOf('\n};', PLUS.indexOf('window.__EDU_XL2 = {')) + 3), ctx);
  for (const k of ['المعرفة', 'تبدأ من هنا', 'كل إنجاز يبدأ بخطوة', 'أيام متتالية', 'ذاكر اليوم عشان ما تنقطع', 'الرياضيات', 'العلوم', 'اللغة العربية', 'اللغة الإنجليزية', 'التاريخ'])
    for (const l of L) assert.ok(ctx.window.__EDU_XL2[k] && ctx.window.__EDU_XL2[k][l], k + ' ' + l);
  for (const k of ['المعرفة', 'تبدأ من هنا', 'كل إنجاز يبدأ بخطوة', 'أيام متتالية', 'ذاكر اليوم عشان ما تنقطع'])
    assert.ok(EDU.includes("eduL('" + k + "'"), 'مستعمل: ' + k);
  for (const k of ['الرياضيات', 'العلوم', 'اللغة العربية', 'اللغة الإنجليزية', 'التاريخ']) assert.ok(EDU.includes("['" + k + "','"), 'كتاب: ' + k);
});
