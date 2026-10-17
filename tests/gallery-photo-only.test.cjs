'use strict';
/* v-photo-only (المالك ١٧ أكتوبر بعد بطاقات الأدوات #1141: «فحصة انماط الصور والاستايل والازياء والخ… كلهم الي فيهم صور، اي صوره تحتها
   احذفها نهائي»): كلّ معرض صور في التطبيق — البطاقة صورتها وحدها، لا شريط اسم ووصف تحتها؛ الاسم نصّ فوق أسفل الصورة بتدرّج
   (قاعدة الصور في CLAUDE.md: النصّ فوق الصورة بـHTML لا داخلها). والتدرّج فوق الصورة لا يُسوَّد في الوضع الأسود. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const cut = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, 'مقطع مفقود: ' + a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, 'نهاية مفقودة: ' + b); return s.slice(i, j); };
const OVER = 'position:absolute;inset:auto 0 0 0;';

test('١. «عرض الكل» المشترك (الستايل والأزياء والديكور): الاسم فوق الصورة في كلّ معرض، بلا وصف ولا شريط تحتها', () => {
  const pk = cut(read('js/app-05-ui.js'), 'window.omranPicker = { open: function(cfg){', "sheet.style.display = 'flex';");
  assert.ok(pk.includes("info.style.cssText = '" + OVER), 'الاسم طبقة مطلقة في أسفل الصورة');
  assert.ok(!/if\(cfg\.overlay\)/.test(pk), 'لا فرع خاصّ: كلّ معرض هكذا لا الأقسام الستّة وحدها');
  assert.ok(pk.includes('wrap.appendChild(info); card.appendChild(wrap);') && !pk.includes('card.appendChild(info)'), 'الاسم داخل الصورة لا بعدها');
  assert.ok(!/it\.sub/.test(pk), 'لا سطر وصف');
});

test('٢. أنماط الصور: بطاقة «قبل» صورتها وشارتها فقط، وبطاقات الأنماط الاسم فوق أسفل الصورة بلا وصف ولا اسم إنجليزيّ', () => {
  const r = cut(read('js/app-12-studios.js'), '    /* بطاقة «قبل»', '  if(styleTrigger) styleTrigger.onclick');
  assert.ok(!r.includes('psheetBeforeSub') && r.includes('w.appendChild(im); w.appendChild(tag); bc.appendChild(w);'), '«قبل» بلا شريط تحتها');
  assert.ok(r.includes("info.style.cssText = 'position:absolute; inset:auto 0 0 0;") && r.includes('imgWrap.appendChild(info);'), 'الاسم فوق الصورة');
  assert.ok(!r.includes('card.appendChild(info)') && !r.includes('pstyleSub(v)') && !r.includes('pstyleEn(v)'), 'لا شريط ولا وصف ولا إنجليزيّ');
  assert.ok(r.includes("nameEl.setAttribute('data-pstyle-name', '1')"), 'markActiveCard ما زال يلوّن الاسم المختار');
});

test('٣. بقيّة المعارض: مقارنة الستايل، إضافات الأزياء، لمسات الديكور، الإلهام، الشخصيّة الناطقة، تبويبات صانع الفيديو', () => {
  const core = read('js/partials-core.js');
  assert.match(core, /\.stCmp span\{position:absolute; inset:auto 0 0 0;[^}]*linear-gradient\(0deg,rgba\(0,0,0,\.85\),rgba\(0,0,0,0\)\)/, 'مقارنة الستايل');
  const gen = read('js/design-gen.js');
  assert.ok(gen.includes('<div class="fxAccPic"><span class="oi"></span><span class="ck"></span><div class="ct"></div></div>'), 'اسم الإضافة داخل مربّعها (والعقدة باقية لتلميح الشريط المطويّ)');
  assert.ok(gen.includes("ct.style.cssText='" + OVER), 'اسم الإضافة طبقة');
  const sels = cut(read('js/design-sels.js'), 'function proToggle', 'v-decor-full-page');
  assert.ok(sels.includes("nm.style.cssText='" + OVER) && sels.includes('pic.appendChild(nm); d.appendChild(pic);'), 'لمسات الديكور');
  const ins = read('js/app-35-inspire.js');
  assert.ok(ins.includes('#inspireScreen .insCard .insTxt{position:absolute; inset:auto 0 0 0;') && ins.includes('#inspireScreen .insCard .insCD{display:none;}'), 'الإلهام: العنوان فوق والوصف تلميح');
  assert.ok((ins.match(/title="' \+ esc\(L\(c\.d\)\) \+ '"/g) || []).length === 2, 'الوصف باقٍ تلميحًا للبطاقتين');
  const tc = cut(read('js/app-09-attach.js'), 'window.pickTalkCharacter = window.pickTalkCharacter ||', "ov.innerHTML=");
  assert.ok(tc.includes("<span style=\"" + OVER), 'اسم الشخصيّة فوق صورتها');
  const css = cut(read('css/modules.css'), '/* v-photo-only', '/* بطاقتا النماذج');
  assert.ok(css.includes('html #videoMakerModal .vmk-tab:not(.vmk-tab-noimg) .vmk-tab-lbl{' + OVER), 'اسم التبويب فوق صورته');
  assert.ok(css.includes('html #videoMakerModal .vmk-tab[aria-selected=true]:not(.vmk-tab-noimg){'), 'المختار بإطاره واسم ذهبيّ');
  assert.ok(css.includes('@media (min-width:641px) and (max-width:860px){html #videoMakerModal .vmk-tab:not(.vmk-tab-noimg){min-width:0;max-width:none}}'), 'التابلت: يملأ خانته');
  const mods = read('css/modules.css');
  assert.ok(mods.includes('#videoMakerModal .vmk-sm.has-vid>b{display:none}'), 'لا شريط تحت غلاف النموذج (عنوانه مرسوم فيه)');
  // مراجعة بصريّة: الصفّ يمتدّ لأطول بطاقة، فبلا هذا يبقى فراغ تحت غلاف البطاقة التعليميّة بجانب نموذج نصّيّ
  assert.ok(mods.includes('#videoMakerModal .vmk-sm.has-vid{display:flex;flex-direction:column}') && mods.includes('#videoMakerModal .vmk-sm.has-vid .vmk-sm-p{flex:1 1 auto}'), 'الغلاف يملأ بطاقته');
  assert.ok(mods.includes('#studioAiTabs .studioAiTabBtn:not(.active) > img ~ span{color:#fff}'), 'اسم تبويب الستايل يُقرأ فوق صورته في الفاتح');
  assert.ok(ins.includes('#inspireScreen .insCard.busy .insTxt, #inspireScreen .insCard.fail .insTxt{visibility:hidden;}'), 'رسالة التحميل/الفشل وحدها لا فوق العنوان');
  assert.ok(gen.includes("var ct=d.querySelector('.ct'); if(ct) ct.style.color=on?'#d4af37':'#fff';"), 'اسم الإضافة المختارة ذهبيّ');
  const vid = read('js/video.js');
  assert.ok(vid.includes("te.setAttribute('aria-label',tt0); te.title=tt0;") && vid.includes("el.setAttribute('aria-label',tx); el.title=tx;"), 'العنوان باقٍ تلميحًا');
  const ad = read('ad-studio.html');
  assert.ok(ad.includes('#grid .col>.cap,#cgrid .col>.cap{display:none}'), 'استوديو الإعلانات: لا سطر وصف تحت التصميم');
  assert.ok(ad.includes('<button class="pick">') && ad.includes('dlB'), 'زرّا الاختيار والتنزيل باقيان');
});

test('٤. الوضع الأسود: الطبقة فوق صورة لا تُسوَّد (لا شريط أسود صلب)، وبوستر الديكور خارج المصنّف', () => {
  const src = read('js/app-41-three-colors.js');
  assert.ok(src.includes('if(inTool && !overImage(el, cs)){'), 'التعبئة تتخطّى ما فوق الصور');
  const sb = { getComputedStyle: (el) => ({ backgroundImage: el.__bg || 'none' }) };
  vm.runInNewContext(cut(src, '  function overImage(el, cs){', '  function mark(el, inTool){') + '\nthis.overImage=overImage;', sb);
  const kid = (tag) => ({ tagName: tag, nextElementSibling: null });
  const parent = (kids, bg) => { for (let i = 0; i < kids.length - 1; i++) kids[i].nextElementSibling = kids[i + 1]; return { firstElementChild: kids[0] || null, __bg: bg }; };
  const cap = kid('DIV'), img = kid('IMG');
  cap.parentElement = parent([img, cap]);
  assert.equal(sb.overImage(cap, { position: 'absolute' }), true, 'اسم فوق صورة أخيه');
  assert.equal(sb.overImage(cap, { position: 'static' }), false, 'شريط في التدفّق ليس فوق الصورة');
  const box = kid('DIV'); box.parentElement = parent([kid('SPAN'), box]);
  assert.equal(sb.overImage(box, { position: 'absolute' }), false, 'صندوق مطلق بلا صورة يُسوَّد كما كان');
  const nm = kid('DIV'); nm.parentElement = parent([nm], 'url("assets/design/decor/plants.webp"), linear-gradient(red, blue)');
  assert.equal(sb.overImage(nm, { position: 'absolute' }), true, 'فوق خلفيّة صورة أبيه (لمسات الديكور)');
  const studios = read('js/app-12-studios.js');
  assert.ok(cut(studios, 'function buildIdeaChips(){', 'function hotBtn(').includes("wrap.className = 'om3-skip';"), 'مناطق البوستر لا تصير مربّعات سوداء بعد المرور');
});

test('٥. الأوسمة مرفوعة والحزمة مبنيّة', () => {
  const html = read('index.html');
  const tag = (s, name) => { const i = s.indexOf(name); assert.ok(i >= 0, name); return Number((/v=(\d+)/.exec(s.slice(i, i + 40)) || [])[1] || 0); };
  assert.ok(tag(html, 'css/modules.css') >= 684, 'modules.css');
  assert.ok(tag(html, '/js/partials-core.js') >= 664, 'partials-core.js');
  assert.ok(tag(html, '/js/design-sels.js') >= 575, 'design-sels.js');
  assert.ok(tag(html, '/js/design-gen.js') >= 613, 'design-gen.js');
  assert.ok(tag(html, '/js/video.js') >= 450, 'video.js');
  const b = read('js/app.bundle.js');
  assert.ok(b.includes('if(inTool && !overImage(el, cs)){') && b.includes("wrap.className = 'om3-skip';") && b.includes('imgWrap.appendChild(info);'), 'الحزمة');
});
