// tests/formal-account-plans.test.cjs — v-formal-account (أمر المالك ٨ أكتوبر ٢٠٢٦: «احذف الأيقونات اللي في الحساب الاشتراك
// وخلّها شيء رسميّ»): صفحتا «حسابي» و«الباقات والنقاط» نصّ وحده بخطّ التطبيق — لا رمز تعبيريّ ولا أيقونة زخرفيّة،
// بالـ١٤ لغة وفي قالبيهما. مكان الصورة بلا صورة = الحرف الأوّل من الاسم (بلا اسم: دائرة فارغة).
// يبقى الوظيفيّ: سهم الرجوع (رأس الصفحة، خارج القسمين)، أسهم الصفوف ›، ✓ و× في قوائم المزايا (CSS)، قائمة العملة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
// الرموز التعبيريّة: Extended_Pictographic، ومحدِّد العرض الملوّن FE0F، وأعلام الدول (أزواج المؤشّرات الإقليميّة)، وغطاء الأرقام 20E3
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}\u{1F1E6}-\u{1F1FF}]/u;

// قالب الإعدادات كما يُكتب في الصفحة (String.raw داخل partials-settings.js)
function template() {
  const src = read('js/partials-settings.js');
  const m = src.match(/var H = String\.raw`([\s\S]*?)`;/);
  assert.ok(m, 'قالب الإعدادات');
  return m[1];
}
function section(H, id) {
  const start = H.indexOf('<div id="' + id + '" class="settingsPageSection"');
  assert.ok(start >= 0, id);
  const next = H.indexOf('class="settingsPageSection"', start + 60);
  const end = next < 0 ? H.length : H.lastIndexOf('<div id=', next);
  return H.slice(start, end);
}
// سهم الأكورديون ▶ في رأس القسم وظيفيّ ومخفيّ في وضع الصفحة (.settingsPageActive .settingsSectionHeader{display:none}) — مستثنى
const visible = (html) => html.replace(/<span class="settingsSectionArrow"[^>]*>▶<\/span>/g, '');

// القواميس كما يقرؤها التطبيق: العربيّة والإنجليزيّة كما هما، والبقيّة فوق الإنجليزيّة (__i18nDict في app-04)
function dicts() {
  const ctx = { $: () => null, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const a3 = read('js/app-03-i18n-data.js').replace(/^const (codeEl|previewFrame|emptyState|historyEl) = .*$/mg, '');
  vm.runInContext(a3 + '\n;this.I18N = I18N;', ctx);
  for (const l of LANGS) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  const I = ctx.I18N;
  const out = { ar: I.ar, en: I.en };
  for (const l of LANGS) out[l] = Object.assign({}, I.en, I[l]);
  return out;
}

test('١. قالبا «حسابي» و«الباقات والنقاط» بلا رمز تعبيريّ ولا أيقونة زخرفيّة', () => {
  const H = template();
  const acct = visible(section(H, 'accountSection'));
  const price = visible(section(H, 'pricingSection'));
  for (const [name, html] of [['حسابي', acct], ['الباقات', price]]) {
    const bad = html.split('\n').filter((l) => EMOJI.test(l)).map((l) => l.trim().slice(0, 90));
    assert.deepEqual(bad, [], name + ': رموز باقية');
  }
  // أيقونات SVG: في «حسابي» أسهم الصفوف وحدها (›)، وفي «الباقات» لا شيء (أيقونة البرق بجانب رصيد النقاط حُذفت)
  const svgs = acct.match(/<svg[\s\S]*?<\/svg>/g) || [];
  assert.ok(svgs.length >= 4, 'أسهم الصفوف باقية');
  for (const s of svgs) assert.match(s, /<polyline points="9 18 15 12 9 6"><\/polyline><\/svg>$/, 'لا SVG في «حسابي» إلّا سهم الصفّ');
  assert.equal((price.match(/<svg/g) || []).length, 0, 'لا SVG في «الباقات والنقاط»');
  // صفّ «تنظيف التطبيق» كبقيّة الصفوف: النصّ ثمّ السهم، بلا أيقونة سلّة ولا غلاف لها
  assert.match(acct, /onclick="acctToggleRow\('acctRowCleanup',this\)"[^>]*><span data-i18n="acctCleanupLabel">تنظيف التطبيق<\/span><svg/);
  // الوظيفيّ باقٍ: ✓ و× في قوائم المزايا، وقائمة العملة، وأقسام الباقات الأربعة
  assert.ok(price.includes('.pcard li::before{content:"✓";') && price.includes('.pcard li.off::before{content:"×";}'));
  assert.ok(price.includes('<select id="setCurSel"'));
  for (const k of ['chat', 'media', 'maha', 'pts']) assert.ok(price.includes('data-tab="' + k + '" onclick="showPriceTab(\'' + k + '\')"'), k);
  // سهم الرجوع في رأس الصفحة (خارج القسمين) باقٍ
  assert.ok(H.includes('id="settingsPageBackBtn"') && H.includes('id="settingsBackSvg"'));
});

test('٢. نصوص الصفحتين بالـ١٤ لغة بلا رمز تعبيريّ (كلّ مفتاح في القالبين وما تكتبه الواجهة فيهما)', () => {
  const H = template();
  const keys = new Set();
  for (const html of [section(H, 'accountSection'), section(H, 'pricingSection')]) {
    for (const m of html.matchAll(/data-i18n(?:-title|-placeholder)?="(?:\[[^\]]+\])?([^"]+)"/g)) keys.add(m[1]);
  }
  assert.ok(keys.size > 60, 'مفاتيح القالبين: ' + keys.size);
  // تكتبها الواجهة داخل الصفحتين: سطور المتبقّي والجودة (app-06)، سطر السبب (app-33)، رسائل الحفظ والهاتف والنسخ والإحالة (app-01 · app-05)
  ['mixLeft', 'mediaImgPlain', 'mediaOr', 'mediaVidEco', 'mediaLeftImg', 'mediaLeftVid', 'mediaVidCine', 'mediaHighEq', 'mahaLeft', 'mahaMinUnit',
    'pricingPointsUnit', 'autoRenewOnHint', 'autoRenewOffHint', 'plansWhyPoints', 'plansWhyLimit', 'plansWhyExpired', 'plansWhyExpiring',
    'acctReferralBonusCount', 'acctReferralCopied', 'acctSaving', 'acctSaved', 'acctNetError', 'acctGenericError', 'acctInvalidEmail',
    'acctFillUsername', 'acctFillPasswords', 'acctAvatarTooBig', 'phoneWaiting', 'phoneLinkedOk', 'phoneTaken', 'phoneExpired', 'phoneNoUser',
  ].forEach((k) => keys.add(k));
  const D = dicts();
  assert.equal(Object.keys(D).length, 14);
  const bad = [];
  for (const [l, d] of Object.entries(D)) {
    for (const k of keys) {
      const v = d[k];
      if (l === 'ar' || l === 'en') assert.ok(v !== undefined, l + ' ' + k + ' موجود');
      if (v !== undefined && EMOJI.test(String(v))) bad.push(l + ':' + k + ' = ' + String(v).slice(0, 40));
    }
  }
  assert.deepEqual(bad, [], 'نصوص برموز');
  // الصياغة كما هي: الرمز وحده خرج
  assert.equal(D.ar.priceTabChat, 'المحادثة');
  assert.equal(D.ar.priceTabMedia, 'صور وفيديو');
  assert.equal(D.en.acctAvatarBtn, 'Change photo');
  assert.equal(D.fr.acctPhoneLabel, 'Numéro de téléphone (pour la récupération)');
  assert.equal(D.ar.acctSaved, 'تم الحفظ');
  for (const [l, d] of Object.entries(D)) {
    for (const k of keys) if (d[k] !== undefined) assert.equal(String(d[k]), String(d[k]).trim(), l + ':' + k + ' بلا فراغ مكان الرمز');
  }
});

test('٣. صفحة «عن البرنامج» لا تتغيّر برابطي الشروط والخصوصيّة المشتركين: رمزاها في قالبها لا في النصّ', () => {
  const about = section(template(), 'aboutSection');
  assert.ok(about.includes('>🔒 <span data-i18n="privacyLink">سياسة الخصوصية</span></a>'));
  assert.ok(about.includes('>📜 <span data-i18n="termsLink">الشروط والأحكام</span></a>'));
});

test('٤. مكان الصورة بلا صورة: الحرف الأوّل من اسم المستخدم داخل الدائرة، وبلا اسم دائرة فارغة، والصورة المرفوعة كما كانت', () => {
  const H = template();
  const ph = H.match(/<div id="acctAvatarPlaceholder"[^>]*>([^<]*)<\/div>/);
  assert.ok(ph, 'الدائرة في القالب');
  assert.equal(ph[1], '', 'لا 👤 في القالب');
  assert.match(ph[0], /border-radius:50%/);
  assert.match(ph[0], /color:var\(--muted/, 'لون محايد');

  const a1 = read('js/app-01-boot-auth.js');
  const src = a1.slice(a1.indexOf('  function updateAvatarUI(){'), a1.indexOf('  function showRecoveryModal('));
  assert.ok(src.length > 100, 'updateAvatarUI');
  const mk = () => ({ style: { display: '' }, textContent: '', src: '' });
  function run(user, avatar) {
    const els = { '#acctAvatarPreview': mk(), '#acctAvatarPlaceholder': mk() };
    const store = { aiapp_avatar: avatar || '' };
    const fn = new Function('$', 'localStorage', 'authGet', 'window', src + '; return updateAvatarUI;')(
      (s) => els[s] || null,
      { getItem: (k) => (k in store ? store[k] : null) },
      (k) => (k === 'aiapp_username' ? user : null),
      {});
    fn();
    return { pv: els['#acctAvatarPreview'], ph: els['#acctAvatarPlaceholder'] };
  }
  let r = run('omran', '');
  assert.equal(r.ph.textContent, 'O');
  assert.equal(r.ph.style.display, 'flex');
  assert.equal(r.pv.style.display, 'none');
  assert.equal(run('عمران', '').ph.textContent, 'ع');
  assert.equal(run('  sara  ', '').ph.textContent, 'S');
  assert.equal(run('𝒜lpha', '').ph.textContent, '𝒜', 'حرف خارج BMP لا يُقسم نصفين');
  assert.equal(run('', '').ph.textContent, '', 'بلا اسم: دائرة فارغة');
  assert.equal(run(null, '').ph.textContent, '');
  r = run('omran', 'data:image/png;base64,AAA');
  assert.equal(r.pv.src, 'data:image/png;base64,AAA');
  assert.equal(r.pv.style.display, 'block');
  assert.equal(r.ph.style.display, 'none');

  // تغيير الاسم يحدّث الحرف فورًا
  const save = a1.slice(a1.indexOf("authSet('aiapp_username', data.username);"));
  assert.ok(save.slice(0, 200).includes('updateAvatarUI();'), 'الحرف يتبع الاسم الجديد');
  assert.ok(read('js/app.bundle.js').includes(src.trim().split('\n').find((l) => /acctAvatarPlaceholder|textContent = /.test(l) && /Array\.from/.test(l)).trim()), 'الحزمة مبنيّة');
});

test('٥. ما تكتبه الواجهة في «حسابي» بنصّ ثابت: زرّ تنظيف المالك وأزرار المشاركة والباركود بلا رمز', () => {
  const a1 = read('js/app-01-boot-auth.js');
  const line = a1.split('\n').find((l) => l.includes("$('#acctCleanupHintEl')"));
  assert.ok(line && !EMOJI.test(line), 'نصّ تنظيف المالك');
  assert.ok(line.includes("__b.textContent = 'نظّف الآن';"));
  const acct = section(template(), 'accountSection');
  for (const id of ['acctShareBtn', 'acctQrBtn']) {
    const m = acct.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
    assert.ok(m && m[1].trim() && !EMOJI.test(m[1]), id + ': ' + (m && m[1]));
  }
});

test('٦. كسر الكاش: وسم الإعدادات ٦٩٣ ووسم ملفّات اللغات ٧٢٦', () => {
  assert.ok(read('index.html').includes('/js/partials-settings.js?v=693'));
  assert.ok(read('js/app-04-i18n-state.js').includes("'i18n/' + lg + '.js?v=726'"));
});
