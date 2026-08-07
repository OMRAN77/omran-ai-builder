/* اختبار v424 محليًّا — بلا متصفّح وبلا حصّة.
   يقتطع I18N + __i18nDict + t() من البندل، ويحمّل ملفّات اللغة الحقيقية، ثم يؤكّد. */
const fs = require('fs');
const R = '/tmp/vc/src';
const b = fs.readFileSync(R + '/js/app.bundle.js', 'utf8');

const i0 = b.indexOf('const I18N = {');
const i1 = b.indexOf('};window.I18N = I18N;');
if (i0 < 0 || i1 < 0) { console.log('✗ لم أجد كتلة I18N'); process.exit(1); }
const END = '  return merged;\n};';
const helperEnd = b.indexOf(END, b.indexOf('window.__i18nDict = function(lg){')) + END.length;
if (helperEnd < END.length) { console.log('✗ لم أجد نهاية __i18nDict'); process.exit(1); }
const i18nBlock = b.slice(i0, helperEnd);           // I18N + الدالّة الجديدة
const t0 = b.indexOf('function t(key){');
const t1 = b.indexOf('\n}', t0) + 2;
const tFn = b.slice(t0, t1);

const langFiles = {};
for (const lg of ['fr','ur','hi','ne','bn','zh','ru','tr','es','id','fil','ml'])
  langFiles[lg] = fs.readFileSync(`${R}/i18n/${lg}.js`, 'utf8');

const src = `
  const window = {};
  let lang = 'ar';
  ${i18nBlock}
  ${tFn}
  return { I18N, dict: window.__i18nDict, t, setLang: (l)=>{ lang = l; },
           load: (lg, code) => { new Function('I18N', code)(I18N); } };
`;
const env = new Function(src)();
for (const lg in langFiles) env.load(lg, langFiles[lg]);

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + '  ← ' + JSON.stringify(got)); }
}
const D = env.dict;

console.log('— العربية والإنجليزية بلا مساس —');
ok('dict("ar") هو كائن ar نفسه', D('ar') === env.I18N.ar);
ok('dict("en") هو كائن en نفسه', D('en') === env.I18N.en);
ok('ar.sbNewProject عربي', D('ar').sbNewProject === 'مشروع جديد', D('ar').sbNewProject);

console.log('— لغة ناقصة (الصينية: ٣٠ مفتاحًا) —');
ok('مفتاحها الخاص يفوز', D('zh').pricingSectionTitle === '套餐与积分', D('zh').pricingSectionTitle);
ok('الناقص إنجليزي لا عربي', D('zh').sbNewProject === 'New project', D('zh').sbNewProject);
ok('لا حرف عربي في العنوان', !/[\u0600-\u06FF]/.test(String(D('zh').pageTitle)), D('zh').pageTitle);
ok('pageTitle معرّف (كان undefined)', typeof D('zh').pageTitle === 'string');
ok('dir = ltr (كان undefined)', D('zh').dir === 'ltr', D('zh').dir);
ok('عدد المفاتيح ≥ ٧٩٦', Object.keys(D('zh')).length >= 796, Object.keys(D('zh')).length);

console.log('— السبع الناقصة كلّها —');
for (const lg of ['zh','ru','tr','es','id','fil','ml']) {
  const d = D(lg);
  const arLeak = ['sbNewProject','sbProjectsTitle','back','copyCode','thumbUpTitle']
    .filter(k => /[\u0600-\u06FF]/.test(String(d[k])));
  ok(lg + ': لا تسرّب عربي في ٥ مفاتيح شائعة', arLeak.length === 0, arLeak);
}

console.log('— الخمس المكتملة: المفاتيح الجديدة —');
const want = { fr: 'Nouveau projet', ur: 'نیا پراجیکٹ', hi: 'नया प्रोजेक्ट', ne: 'नयाँ परियोजना', bn: 'নতুন প্রকল্প' };
for (const lg in want) {
  ok(lg + '.sbNewProject مترجم', D(lg).sbNewProject === want[lg], D(lg).sbNewProject);
  ok(lg + '.ncNewChatLabel فيه ✨', String(D(lg).ncNewChatLabel).includes('✨'), D(lg).ncNewChatLabel);
  ok(lg + '.sbDeleteAll ليس عربيًّا', lg === 'ur' || !/[\u0600-\u06FF]/.test(D(lg).sbDeleteAll), D(lg).sbDeleteAll);
}
ok('الأردية تبقى rtl', D('ur').dir === 'rtl', D('ur').dir);
ok('الفرنسية تبقى ltr', D('fr').dir === 'ltr', D('fr').dir);

console.log('— t() —');
env.setLang('zh');
ok('t() لمفتاح ناقص = إنجليزي', env.t('sbNewProject') === 'New project', env.t('sbNewProject'));
ok('t() لمفتاح موجود = صيني', env.t('pricingSectionTitle') === '套餐与积分', env.t('pricingSectionTitle'));
env.setLang('ar');
ok('t() بالعربية = عربي', env.t('sbNewProject') === 'مشروع جديد', env.t('sbNewProject'));
env.setLang('fr');
ok('t() بالفرنسية = المفتاح الجديد', env.t('sbProjSearch') === 'Rechercher un projet', env.t('sbProjSearch'));
ok('t() لمفتاح مجهول يعيد المفتاح', env.t('__nope__') === '__nope__', env.t('__nope__'));

console.log('— الذاكرة المؤقّتة —');
ok('نداءان يعيدان الكائن نفسه', D('zh') === D('zh'));

console.log(`\nنتيجة: ${pass} ناجحة · ${fail} فاشلة`);
process.exit(fail ? 1 : 0);
