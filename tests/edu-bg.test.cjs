'use strict';
/* v-edu-bg (المالك ١٩ أكتوبر): «قسم التعليم يتغيّر شكله مع الثيم، مو بس اللون» — خلفيّة لكلّ ثيم من الـ٢٤ بلا أيّ كتابة، الوسط هادئ،
   webp أقلّ من ٢٠٠KB، والبطاقات HTML فوقها. المفتاح من ثيم «خلفيّات الشاشة» ثمّ لون الدوائر، ويتبدّل فورًا. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CSS = read('css/تعليم-خلفية.css');
const EDU = read('js/edu.js');
const GEN = read('scripts/thumbs-paid.mjs');
const HTML = read('index.html');

/* ثيمات خلفيّات الشاشة كما في js/app-25-خلفيات.js: الخشبي + كلّ معرّف في القوائم */
const SKIN_SRC = read('js/app-25-خلفيات.js');
const SKINS = ['wood', ...[...SKIN_SRC.matchAll(/\['[^']+', '([a-z]+)', 'bgTheme[A-Za-z]+'/g)].map((m) => m[1])];
const ACCENT = ['classic', 'space'];

test('١. الثيمات الـ٢٤ كلّها: كتلة CSS ونسخة حاسوب وجوّال، والدوائر (classic وspace) بنسخة فاتحة أيضًا', () => {
  assert.strictEqual(SKINS.length, 24, 'خشبي + ٢٣ مشهدًا');
  for (const k of [...SKINS, ...ACCENT]) {
    assert.ok(CSS.includes('#eduHubModal[data-edu-bg="' + k + '"]{--edu-art-d:'), 'كتلة ' + k);
    const need = ['desktop', 'mobile'].concat(ACCENT.includes(k) ? ['light'] : []);
    for (const v of need) assert.ok(fs.existsSync(path.join(ROOT, 'assets/edu-bg/' + k + '-' + v + '.webp')), 'ملفّ ' + k + '-' + v);
  }
});

test('٢. كلّ صورة webp حقيقيّة أقلّ من ٢٠٠KB (قرار المالك)', () => {
  const dir = path.join(ROOT, 'assets/edu-bg');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webp'));
  assert.ok(files.length >= 24 * 2 + 6, 'العدد ' + files.length);
  for (const f of files) {
    const b = fs.readFileSync(path.join(dir, f));
    assert.ok(b.length < 200 * 1024, f + ' ' + b.length);
    assert.strictEqual(b.toString('latin1', 0, 4) + b.toString('latin1', 8, 12), 'RIFFWEBP', f);
  }
});

test('٣. المولّد: وضع edu-bg لكلّ الثيمات، بلا نصّ داخل الصورة والزخرفة على الأطراف، وWebP تحت الحدّ', () => {
  const m = GEN.match(/const EDU_SKINS = \{([\s\S]*?)\n\};/);
  assert.ok(m, 'EDU_SKINS');
  const keys = [...m[1].matchAll(/^  ([a-z]+): '/gm)].map((x) => x[1]);
  assert.deepStrictEqual(keys.sort(), [...SKINS].sort());
  assert.ok(/EDU_BG_COMMON[\s\S]*?Absolutely no text, no letters, no numbers/.test(GEN), 'ممنوع النصّ');
  assert.ok(/outer edges and corners/.test(GEN) && /central area, about 60 percent/.test(GEN), 'الوسط هادئ');
  assert.ok(/const EDU_MAX = 195 \* 1024/.test(GEN), 'حدّ الحجم');
  assert.ok(/edubg: 'assets\/edu-bg'/.test(GEN), 'المسار');
});

/* دالّة اختيار المفتاح من edu.js نفسها في بيئة معزولة */
function keyFor(classes, appTheme) {
  const src = EDU.match(/var EDU_BG_SKINS=[\s\S]*?\nfunction eduBgKey\(\)\{[\s\S]*?\n\}\n/)[0];
  const ctx = {
    document: { documentElement: { classList: { contains: (c) => classes.includes(c) } } },
    localStorage: { getItem: (k) => (k === 'appTheme' ? appTheme : null) },
    __swallow() {},
  };
  vm.createContext(ctx);
  vm.runInContext(src + ';this.k=eduBgKey();', ctx);
  return ctx.k;
}
test('٤. المفتاح: ثيم الخلفيّة أوّلًا ثمّ لون الدوائر، وما لا صورة له يبقى كما كان', () => {
  assert.strictEqual(keyFor(['skin', 'skin-cyber'], 'purple'), 'cyber');
  assert.strictEqual(keyFor(['skin', 'skin-wood'], null), 'wood');
  assert.strictEqual(keyFor([], 'gold'), 'classic');
  assert.strictEqual(keyFor([], null), 'classic', 'الافتراضيّ ذهبيّ');
  assert.strictEqual(keyFor([], 'purple'), 'space');
  assert.strictEqual(keyFor([], 'red'), '', 'لا صورة بعد لهذا اللون');
  assert.strictEqual(keyFor(['skin', 'skin-other'], 'purple'), '', 'ثيم آخر لا يأخذ لون الدوائر');
  for (const s of SKINS) assert.strictEqual(keyFor(['skin', 'skin-' + s], 'gold'), s);
});

test('٥. يتبدّل فورًا: مراقب على class وstyle وdata-mode للصفحة ويُستدعى عند الفتح', () => {
  assert.ok(/new MutationObserver\(syncEduBg\)\.observe\(document\.documentElement,\{attributes:true,attributeFilter:\['class','style','data-mode'\]\}\)/.test(EDU));
  assert.ok(/syncEduBg\(\);\nif\(window\.MutationObserver\)/.test(EDU));
});

test('٦. CSS: يعلو قواعد eduWrap القديمة (!important) ويُحمَّل آخرًا، والجوّال والفاتح، والبطاقات زجاج بلا تغيير وظيفة', () => {
  assert.ok(HTML.indexOf('css/تعليم-خلفية.css?v=') > HTML.indexOf('css/بلا-خطوط.css?v='), 'آخرًا');
  assert.ok(Number(HTML.match(/تعليم-خلفية\.css\?v=(\d+)/)[1]) >= 4);
  assert.ok(Number(HTML.match(/\/js\/edu\.js\?v=(\d+)/)[1]) >= 670);
  assert.ok(CSS.includes('html:root:root #eduHubModal[data-edu-bg]{background:var(--edu-art-d) center/cover no-repeat, var(--edu-base) !important;'));
  assert.ok(CSS.includes('@media (max-width:700px){html:root:root #eduHubModal[data-edu-bg]{background-image:var(--edu-art-m) !important;}}'));
  assert.ok(CSS.includes('html.mobile-ui:root:root #eduHubModal[data-edu-bg]{background-image:var(--edu-art-m) !important;}'));
  assert.ok(CSS.includes('html[data-mode="light"]:root:root #eduHubModal[data-edu-bg="classic"]'));
  assert.ok(/:is\(\.eduUploadBtn,\.eduPlusTile,\.eduLessonRow\)\{background:rgba\(var\(--edu-glass\),\.66\)/.test(CSS));
  assert.ok(!/display\s*:\s*none/.test(CSS) && !/pointer-events\s*:\s*none/.test(CSS), 'لا إخفاء ولا تعطيل — شكل فقط');
  assert.ok(CSS.includes('.eduHead h2{background:none !important;-webkit-text-fill-color:var(--edu-head) !important;'), 'العنوان بلون الثيم');
  assert.ok(CSS.includes(':is(.eduSecTitle,.eduPasteToggle,.eduLinkBtn){color:var(--edu-head) !important;}') && CSS.includes('.eduPlusSub,.eduNote,.eduEmpty){color:var(--edu-muted) !important;}'), 'الكتابة بألوان الثيم');
  for (const k of [...SKINS, ...ACCENT]) {
    const b = CSS.match(new RegExp('#eduHubModal\\[data-edu-bg="' + k + '"\\]\\{([^}]*)\\}'))[1];
    for (const v of ['--edu-base', '--edu-glass', '--edu-gold', '--edu-r', '--edu-bw', '--edu-shadow', '--edu-ink', '--edu-head', '--edu-muted']) assert.ok(b.includes(v + ':'), k + ' ' + v);
  }
});
