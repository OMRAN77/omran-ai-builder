/* v-no-lines-2 — أمر المالك: «الخطوط الزائده والموجوده الحينه كامله شلها، فقط عند تمرير الماوس على المكان يكون لون ذهبي، اريدها في التطبيق كامله،
   وتكون الخلفيه فقط لونين نفس درجة الاسود». css/بلا-خطوط.css يُحمَّل آخرًا ويخفي الإطارات الذهبيّة وحدود صندوق الكتابة والأدوات، والذهبيّ عند المرور فقط. */
// v-no-phone-frame: «احذف برواز الهاتف» — على الجوال لا إطار ذهبي حول الشاشة (body::after بلا خلفية).
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
  for (const r of rules) for (const s of r.sels) assert.ok(s.startsWith(P + ' ') || s.startsWith(P + ':not(.mobile-ui) ') || s.startsWith(P + '.mobile-ui ') || s.startsWith('.omran-selected') || s === 'html.mobile-ui:not(.bgimg):not(.skin):not(.skin-wood) body::after', s); /* .omran-selected: الأخضر يُحذف في كلّ الأوضاع (v-no-green) */
});

test('٣. الألوان: شفّاف، أو ذهبيّ إطار اللوحات rgba(212,175,55,.85)، أو #101013، أو توهّج «فسّر» الأبيض، أو الحدّ الشبح — لا رماديّ', () => {
  const noAttr = bare.replace(/\[style\*="[^"]*"\]/g, ''); /* محدِّدات [style*="…"] تطابق نصّ الحدّ داخل العنصر، ليست ألوانًا */
  const vals = noAttr.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) || [];
  assert.ok(vals.length >= 8);
  for (const v of vals) assert.match(v.replace(/\s/g, ''), /^(rgba\(212,175,55,\.85\)|#101013|#fff|rgba\(255,255,255,\.35\)|rgba\(0,0,0,\.06\)|rgba\(0,0,0,\.22\))$/i, v);
});

test('٤. الإطار الذهبيّ ونقاط الخلفيّة وحبيبات الضجيج تختفي، واللوحات تتذهّب عند المرور فقط', () => {
  assert.ok(bare.includes(P + ' body{--om-gold-line:linear-gradient(transparent,transparent); --om-dots:linear-gradient(transparent,transparent);}'));
  const hov = rules.find((r) => r.sels.some((s) => s.includes(':is(#sidebar,#workarea,#omFrameCenter):hover')));
  assert.ok(hov && hov.sels.some((s) => s.includes('main:has(#chatcol:hover) > #omFrameCenter')) && /--om-gold-line:linear-gradient\(rgba\(212,175,55,\.85\)/.test(hov.body));
  assert.ok(bare.includes(P + ' body::after{background-image:none !important;}'));
});

test('٥. صندوق الكتابة وزرّ الإرسال وأسفل الشريط وخطوط om3-line: بلا حدّ، والمرور والتركيز توهّج أبيض مثل «فسّر» لا ذهبيّ', () => {
  const GLOW = 'box-shadow:0 4px 18px rgba(255,255,255,.35) !important';
  const find = (frag, val) => rules.some((r) => r.sels.some((s) => s.includes(frag)) && r.body.includes(val));
  for (const f of ['#composerBox#composerBox', '#composerBox > #btnSend', '#omranSidebarFoot#omranSidebarFoot', '.omUpArt.omUpArt', '.pstyleCard.pstyleCard']) assert.ok(find(f, 'border-color:transparent !important'), f);
  /* خطوط om3-line بالحدّ الشبح (أسود .06) لا transparent: app-41-three-colors.js يعيد التصنيف عند انتهاء كلّ انتقال، والشفّاف يُقرأ «بلا حدّ» فيومض الحدّ الرماديّ بلا نهاية */
  assert.ok(find('.om3-line:not(#om3-a#om3-b)', 'border-color:rgba(0,0,0,.06) !important'));
  for (const f of ['#composerBox#composerBox:is(:hover,:focus-within)', '#composerBox > #btnSend:is(:hover', '.om3-hot.om3-line:not(#om3-a#om3-b):hover', '.omUpArt.omUpArt:is(:hover', '#videoMakerModal .vmk-tab:hover', '.pstyleCard.pstyleCard:is(', '#studioAiTabs .studioAiTabBtn.studioAiTabBtn:is(.active,:hover)']) assert.ok(find(f, GLOW), f);
  /* om3 (أولويّة معرّفين) يسبق قواعد صندوق الكتابة */
  assert.ok(bare.indexOf('.om3-line:not(#om3-a#om3-b){') < bare.indexOf('#composerBox#composerBox:is(:hover'));
});

test('٦. v-main-lines: إطار المحادثة واللوحتين ثابت ذهبيّ على الكمبيوتر وحده؛ v-no-phone-frame: لا برواز في الجوال؛ ولا حدّ ذهبيّ لأيّ عنصر داخل الشاشة', () => {
  const G = 'rgba(212,175,55,.85)';
  const perm = rules.find((r) => r.sels.includes(P + ':not(.mobile-ui) :is(#sidebar,#workarea,#omFrameCenter)'));
  assert.ok(perm && perm.body.includes('--om-gold-line:linear-gradient(' + G + ',' + G + ')'), 'اللوحات والمحادثة بلا :hover، على الكمبيوتر');
  assert.ok(!rules.some((r) => r.sels.includes(P + ' :is(#sidebar,#workarea,#omFrameCenter)')), 'لا حافّة ذهبيّة للدُّرجين في الجوال');
  assert.ok(!/mobile-ui body::after\{background-image:linear-gradient/.test(bare), 'لا برواز ذهبيّ في الجوال');
  assert.ok(rules.some((r) => r.sels.includes('html.mobile-ui:not(.bgimg):not(.skin):not(.skin-wood) body::after') && r.body === 'background:none !important;'), 'برواز الجوال محذوف في كلّ الأوضاع');
  /* نطاق الحذف = نطاق قاعدة الإطار في إطارات-الجوال.css نفسها */
  assert.ok(fs.readFileSync(path.join(ROOT, 'css', 'إطارات-الجوال.css'), 'utf8').includes('html.mobile-ui:not(.bgimg):not(.skin):not(.skin-wood) body::after{'));
  assert.ok(!bare.includes('border-color:' + G), 'لا حدود ذهبيّة داخل الشاشة');
  assert.ok(!bare.includes('#sbSearchWrap'), 'مربّع البحث بلا حدّ ثابت');
});

test('٧. v-white-glow: المحادثة المختارة وتبويبات المعاينة والكود والتبويبات المختارة في الأدوات مثل «فسّر» — #101013 وتوهّج أبيض ونصّ أبيض', () => {
  const GLOW = 'box-shadow:0 4px 18px rgba(255,255,255,.35) !important';
  const hist = rules.find((r) => r.sels.includes(P + ' .hist-item.hist-item:is(.active,:hover)'));
  assert.ok(hist && hist.body.includes('background:#101013 !important') && hist.body.includes('color:#fff !important') && hist.body.includes(GLOW));
  assert.ok(rules.some((r) => r.sels.includes(P + ' .hist-item.hist-item:is(.active,:hover) :is(.hist-title,.hist-thumb,.hist-menu-btn)') && r.body.includes('color:#fff !important')));
  const tab = rules.find((r) => r.sels.includes(P + ' #tabs .tab.tab:not(#om3-a):is(.active,:hover)'));
  assert.ok(tab && tab.body.includes('background:#101013 !important') && tab.body.includes('border-color:transparent !important') && tab.body.includes(GLOW));
  assert.ok(rules.some((r) => r.sels.includes(P + ' #tabs .tab.tab:not(#om3-a):is(.active,:hover) svg') && r.body.includes('stroke:#fff !important')));
  assert.ok(rules.some((r) => r.sels.includes(P + ' #tabs .tab.tab.active::after') && r.body.includes('background:none !important')), 'بلا خطّ ذهبيّ تحت التبويب');
  assert.ok(rules.some((r) => r.sels.some((s) => s.includes('.om3-fill.om3-line:not(#om3-a#om3-b):is(.sel,.selected,.active')) && r.body.includes('background-color:#101013 !important')), 'المختار نفس الدرجة');
  /* صفوف التبويبات المنزلقة لا تقصّ التوهّج */
  assert.ok(rules.some((r) => r.sels.includes(P + ' :is(#religionTabs,#studioAiTabs)') && /padding:14px 18px 22px/.test(r.body) && /margin-left:-18px/.test(r.body)));
  const VED = fs.readFileSync(path.join(ROOT, 'js', 'video-edit.js'), 'utf8');
  assert.ok(VED.includes('#vedModal .ved-item.sel{border-color:transparent;box-shadow:0 4px 18px rgba(255,255,255,.35)}'), 'محرّر الفيديو: المرور والمختار توهّج');
  assert.ok(!/ved-pick:focus-within\{border-color/.test(VED));
});

test('٨. v-no-green («ليش هذا الاخضر احذفه نهائي»): وضع التحديد بلا أخضر — المحدَّد بلا إطار، وتوهّج أبيض في الأسود، ودائرة الصحّ بيضاء/سوداء', () => {
  const base = rules.find((r) => r.sels.includes('.omran-selected.omran-selected'));
  assert.ok(base && base.body.includes('outline:0 !important') && !/16a34a|22,163,74|green/i.test(bare));
  const dark = rules.find((r) => r.sels.includes(P + ' .omran-selected.omran-selected'));
  assert.ok(dark && dark.body.includes('background:#101013 !important') && dark.body.includes('box-shadow:0 4px 18px rgba(255,255,255,.35) !important'));
  assert.ok(rules.some((r) => r.sels.includes(P + ' .omran-selected .omran-select-mark.omran-select-mark') && r.body.includes('background:#fff')));
  /* أولويّة أعلى من أنماط delete-confirm.js (‎.omran-selected .omran-select-mark‎ بلا important، يُحقن بعد الأوراق) */
  assert.ok(rules.some((r) => r.sels.includes('.omran-selected .omran-select-mark.omran-select-mark')));
  assert.ok(fs.readFileSync(path.join(ROOT, 'js', 'delete-confirm.js'), 'utf8').includes('.omran-selected .omran-select-mark{'), 'المحدِّد الذي نغلبه ما زال كما هو');
});
