/* v-no-lines-2 — أمر المالك: «الخطوط الزائده والموجوده الحينه كامله شلها، فقط عند تمرير الماوس على المكان يكون لون ذهبي، اريدها في التطبيق كامله،
   وتكون الخلفيه فقط لونين نفس درجة الاسود». css/بلا-خطوط.css يُحمَّل آخرًا ويخفي الإطارات الذهبيّة وحدود صندوق الكتابة والأدوات، والذهبيّ عند المرور فقط. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'بلا-خطوط.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const P = 'html:not([data-mode="light"]):not(.skin):not(.skin-wood):not(.bgimg)';
const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = bare.replace(/\[style\*="[^"]*"\]/g, '[style]').split('}').filter((b) => b.includes('{')).map((b) => { const [s, d] = b.split('{'); return { sels: s.split(/,(?![^()]*\))/).map((x) => x.trim()).filter(Boolean), body: d.trim() }; });

test('١. الملفّ مربوط بوسم كاش بعد أدوات-أسود.css ورفع-الصور.css (آخر ورقة أنماط تغلب)', () => {
  const i = HTML.indexOf('href="css/بلا-خطوط.css?v=');
  assert.ok(i > 0, 'مربوط');
  assert.ok(i > HTML.indexOf('href="css/أدوات-أسود.css?v=') && i > HTML.indexOf('href="css/رفع-الصور.css?v=') && i > HTML.indexOf('href="css/إطارات-الجوال.css?v='));
});

test('٢. كلّ قاعدة للوضع الأسود وحده: لا الفاتح ولا الثيمات ولا الخشبيّ ولا صور الخلفيّة', () => {
  assert.ok(rules.length >= 10);
  for (const r of rules) for (const s of r.sels) assert.ok(s.startsWith(P + ' ') || s.startsWith(P + ':not(.mobile-ui) ') || s.startsWith(P + '.mobile-ui '), s);
});

test('٣. الألوان: شفّاف، أو ذهبيّ المرور rgba(212,175,55,.85)، أو #101013 — لا رماديّ ولا أبيض', () => {
  const noAttr = bare.replace(/\[style\*="[^"]*"\]/g, ''); /* محدِّدات [style*="…"] تطابق نصّ الحدّ داخل العنصر، ليست ألوانًا */
  const vals = noAttr.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) || [];
  assert.ok(vals.length >= 8);
  for (const v of vals) assert.match(v.replace(/\s/g, ''), /^(rgba\(212,175,55,\.85\)|#101013)$/i, v);
});

test('٤. الإطار الذهبيّ ونقاط الخلفيّة وحبيبات الضجيج تختفي، واللوحات تتذهّب عند المرور فقط', () => {
  assert.ok(bare.includes(P + ' body{--om-gold-line:linear-gradient(transparent,transparent); --om-dots:linear-gradient(transparent,transparent);}'));
  const hov = rules.find((r) => r.sels.some((s) => s.includes(':is(#sidebar,#workarea,#omFrameCenter):hover')));
  assert.ok(hov && hov.sels.some((s) => s.includes('main:has(#chatcol:hover) > #omFrameCenter')) && /--om-gold-line:linear-gradient\(rgba\(212,175,55,\.85\)/.test(hov.body));
  assert.ok(bare.includes(P + ' body::after{background-image:none !important;}'));
});

test('٥. صندوق الكتابة وزرّ الإرسال وأسفل الشريط وخطوط om3-line: شفّافة، وذهبيّة عند المرور أو التركيز', () => {
  const find = (frag, val) => rules.some((r) => r.sels.some((s) => s.includes(frag)) && r.body.includes('border-color:' + val + ' !important'));
  for (const f of ['#composerBox#composerBox', '#composerBox > #btnSend', '#omranSidebarFoot#omranSidebarFoot', '.om3-line:not(#om3-a#om3-b)', '.omUpArt.omUpArt', '.pstyleCard']) assert.ok(find(f, 'transparent'), f);
  for (const f of ['#composerBox#composerBox:is(:hover,:focus-within)', '#composerBox > #btnSend:is(:hover', '.om3-hot.om3-line:not(#om3-a#om3-b):hover', '.omUpArt.omUpArt:is(:hover', '#videoMakerModal .vmk-tab:hover']) assert.ok(find(f, 'rgba(212,175,55,.85)'), f);
  /* om3 (أولويّة معرّفين) يسبق قواعد صندوق الكتابة، وإلّا غلب تذهيبَه عند المرور */
  assert.ok(bare.indexOf('.om3-line:not(#om3-a#om3-b){') < bare.indexOf('#composerBox#composerBox:is(:hover'));
});

test('٦. v-main-lines («فقط ثبت الخطوط في الشاشة الرئيسه»): خطوط الشاشة الرئيسيّة ثابتة ذهبيّة بلا مرور، وآخر الملفّ', () => {
  const G = 'rgba(212,175,55,.85)';
  const perm = rules.find((r) => r.sels.includes(P + ' :is(#sidebar,#workarea,#omFrameCenter)'));
  assert.ok(perm && perm.body.includes('--om-gold-line:linear-gradient(' + G + ',' + G + ')'), 'اللوحات والمحادثة بلا :hover');
  assert.ok(rules.some((r) => r.sels.includes(P + '.mobile-ui body::after') && r.body.includes('background-image:linear-gradient(' + G + ',' + G + ') !important')), 'إطار المحادثة في الجوال');
  const fix = rules.find((r) => r.sels.includes(P + ' #composerBox#composerBox:not(#om3-a#om3-b)'));
  assert.ok(fix && fix.body === 'border-color:' + G + ' !important;');
  for (const f of ['#composerBox > #btnSend:not(#om3-a#om3-b)', '#omranSidebarFoot#omranSidebarFoot:not(#om3-a#om3-b)', '#sbSearchWrap:not(#om3-a#om3-b)']) assert.ok(fix.sels.includes(P + ' ' + f), f);
  /* بعد قواعد الشفافيّة (نفس الأولويّة أو أعلى) فتغلبها */
  assert.ok(bare.lastIndexOf('#composerBox#composerBox:not(#om3-a#om3-b)') > bare.indexOf('.om3-line:not(#om3-a#om3-b){border-color:transparent'));
  assert.ok(bare.indexOf(P + '.mobile-ui body::after') > bare.indexOf(P + ' body::after{background-image:none'));
});
