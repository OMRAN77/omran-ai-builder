// scripts/edu-bg-css.mjs — يبني css/تعليم-خلفية.css من assets/edu-bg/meta.json (قياسات scripts/edu-bg-measure.mjs) وقائمة الثيمات الـ٢٤.
// لا يُحرَّر الملفّ بالعين: الاختبار يقارنه بالمولَّد. لكلّ ثيم كتلة متغيّرات (الصورتان وأبعادهما وكسور الشاشة)، والقواعد المشتركة تحسب
// موضع الواجهة فوق الشاشة الفاضية بحساب cover نفسه الذي يرسم به المتصفّح الخلفيّة (وحدات الحاوية cqw/cqh)، فتثبت على كلّ مقاس.
//
//   node scripts/edu-bg-css.mjs [--check]   (--check: يطبع «مطابق» أو يخرج بـ1 إن اختلف الملفّ)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const SKINS = ['wood', 'darkwood', 'marble', 'code', 'cars', 'kids', 'cuisine', 'sunset', 'beach', 'winter', 'garage', 'anime', 'cyber', 'school', 'tactical', 'angel', 'neonanime', 'station', 'rally', 'smoke', 'library', 'cafe', 'workshop', 'modern'];
export const VER = 1; // وسم كسر الكاش لصور assets/edu-bg — ارفعه عند إعادة توليد الصور
// الهندسة المطلوبة من المولّد (thumbs-paid.mjs: EDU_DESK/EDU_PHONE) — تُستعمل لثيم لم يُقَس بعد، والقياس الفعليّ يغلبها
const NOMINAL = { desktop: { w: 2731, h: 1536, rect: { x0: 0.27, y0: 0.07, x1: 0.97, y1: 0.91 } }, mobile: { w: 1792, h: 2400, rect: { x0: 0.06, y0: 0.12, x1: 0.94, y1: 0.86 } } };

// لون الشاشة المطلوب من المولّد لكلّ ثيم (EDU_SKINS في thumbs-paid.mjs) — احتياط حتّى يُقاس اللون الفعليّ من الصورة
export function nominalScreens() {
  const gen = readFileSync('scripts/thumbs-paid.mjs', 'utf8');
  const out = {};
  for (const m of gen.matchAll(/\n  ([a-z]+): \{ screen: '(#[0-9a-f]{6})', style: '/g)) out[m[1]] = m[2];
  return out;
}

export function build(meta, screens = nominalScreens()) {
  const im = (meta && meta.images) || {};
  const vars = (k, dev) => {
    const m = im['skin-' + k + '-' + dev] || NOMINAL[dev];
    const p = dev === 'desktop' ? 'd' : 'm';
    const sc = (im['skin-' + k + '-' + dev] && im['skin-' + k + '-' + dev].screen) || screens[k] || '#000000';
    return '--edu-' + p + ':url("/assets/edu-bg/skin-' + k + '-' + dev + '.webp?v=' + VER + '");--edu-' + p + 'w:' + m.w + ';--edu-' + p + 'h:' + m.h +
      ';--edu-' + p + 'x0:' + m.rect.x0 + ';--edu-' + p + 'y0:' + m.rect.y0 + ';--edu-' + p + 'x1:' + m.rect.x1 + ';--edu-' + p + 'y1:' + m.rect.y1 + ';--edu-' + p + 'sc:' + sc + ';';
  };
  const blocks = SKINS.map((k) => 'html.skin-' + k + ':root:root #eduHubModal{' + vars(k, 'desktop') + vars(k, 'mobile') + '}').join('\n');
  const S = SKINS.map((k) => 'html.skin-' + k + ':root:root #eduHubModal').join(',\n');
  const sel = (rest) => S.split(',\n').map((x) => x + rest).join(',\n');
  return `/* css/تعليم-خلفية.css — مولَّد بـscripts/edu-bg-css.mjs من assets/edu-bg/meta.json، لا يُحرَّر يدويًّا.
   v-edu-scenes (المالك ٢٠ أكتوبر: «نفس هذي الفكرة… ٢٤ ثيم يعني ٤٨… ما أريد شي يكون تحته وتكون الكتابة مرتبة… الخطوط بألوان الثيم»):
   قسم التعليم مع ثيمات «خلفيّات الشاشة» الـ٢٤ مشهدٌ كامل (assets/edu-bg/skin-<ثيم>-desktop|mobile.webp، مولَّد بوضع edu-bg في
   scripts/thumbs-paid.mjs بلا أيّ كتابة) وفيه شاشة فاضية بلون واحد؛ الواجهة الحقيقيّة (الرأس والصفحة والنموذج) توضع فوق الشاشة
   مباشرةً بلا لوح ولا زجاج تحتها، وبألوان الثيم نفسه (--th-ink/--th-gold/--th-muted/--th-btn/--th-field). بلا ثيم لا يتغيّر شيء.
   الموضع: حساب cover نفسه الذي يرسم به المتصفّح الخلفيّة — s = max(100cqw/W, 100cqh/H)، والإزاحة نصف الفائض — فتبقى الواجهة
   داخل الشاشة المرسومة على كلّ مقاس. يُحمَّل آخرًا لأنّ خلفيّة eduWrap مكتوبة في ملفّات قبله بـ!important. */
${blocks}

/* الخشبيّ بملفّه الخاصّ بلا متغيّرات --th-*: قيمه من ألوانه (css/ثيم-خشبي.css) */
html.skin-wood:root:root #eduHubModal{--th-ink:#3b2a1c;--th-muted:#6b5038;--th-gold:#b57750;--th-line2:rgba(120,84,50,.22);--th-btn:var(--wood-copper);--th-btn-ink:#fff8ee;--th-field:rgba(255,255,255,.42);--th-field-line:rgba(120,84,50,.28);--th-field-ink:#3b2a1c;}

/* ===== الخلفيّة: المشهد كلّه، والواجهة فوق الشاشة الفاضية ===== */
${S}{container-type:size;--edu-s:max(calc(100cqw / var(--edu-dw)),calc(100cqh / var(--edu-dh)));--edu-ox:calc((100cqw - var(--edu-dw) * var(--edu-s)) / 2);--edu-oy:calc((100cqh - var(--edu-dh) * var(--edu-s)) / 2);--edu-x0:var(--edu-dx0);--edu-y0:var(--edu-dy0);--edu-x1:var(--edu-dx1);--edu-y1:var(--edu-dy1);--edu-w:var(--edu-dw);--edu-h:var(--edu-dh);--edu-sc:var(--edu-dsc);--edu-bl:calc(var(--edu-ox) + var(--edu-x0) * var(--edu-w) * var(--edu-s));--edu-bt:calc(var(--edu-oy) + var(--edu-y0) * var(--edu-h) * var(--edu-s));--edu-br:calc(var(--edu-ox) + var(--edu-x1) * var(--edu-w) * var(--edu-s));--edu-bb:calc(var(--edu-oy) + var(--edu-y1) * var(--edu-h) * var(--edu-s));background:var(--edu-d) center/cover no-repeat !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;color:var(--th-ink);}
/* حدود الشاشة المرسومة مقصوصة على حدود النافذة: cover يقصّ الجانبين حين تكون النافذة أضيق من نسبة الصورة (١٢٨٠×٩٠٠ مثلًا) فلا تخرج الواجهة عن الشاشة */
${sel(' .eduWrap')}{position:absolute !important;left:max(var(--edu-bl),0px) !important;top:max(var(--edu-bt),0px) !important;width:calc(min(var(--edu-br),100cqw) - max(var(--edu-bl),0px)) !important;height:calc(min(var(--edu-bb),100cqh) - max(var(--edu-bt),0px)) !important;max-width:none !important;background:transparent !important;border:none !important;box-shadow:none !important;color:var(--th-ink);}
${sel(' .eduHead')}{position:relative;z-index:6;background:transparent !important;border-bottom:none !important;padding:14px 22px 8px !important;}
${sel(' .eduBody')}{background:transparent !important;padding:4px 22px 22px;}
/* الجوّال: الصورة الطوليّة وشاشتها؛ عرضها بعد cover أوسع من الشاشة الضيّقة فالواجهة بعرض الجهاز كلّه وحدودها الرأسيّة من الشاشة المرسومة */
@media (max-width:700px){
${S}{--edu-x0:var(--edu-mx0);--edu-y0:var(--edu-my0);--edu-x1:var(--edu-mx1);--edu-y1:var(--edu-my1);--edu-w:var(--edu-mw);--edu-h:var(--edu-mh);--edu-sc:var(--edu-msc);--edu-s:max(calc(100cqw / var(--edu-mw)),calc(100cqh / var(--edu-mh)));--edu-ox:calc((100cqw - var(--edu-mw) * var(--edu-s)) / 2);--edu-oy:calc((100cqh - var(--edu-mh) * var(--edu-s)) / 2);background-image:var(--edu-m) !important;}
${sel(' .eduWrap')}{left:0 !important;width:100% !important;}
${sel(' .eduHead')}{padding-inline:12px !important;}
${sel(' .eduBody')}{padding-inline:12px;}
}

/* ===== الكتابة بألوان الثيم، بلا لوح تحتها ===== */
${sel(' .eduHead h2')}{background:none !important;-webkit-text-fill-color:var(--th-gold) !important;color:var(--th-gold) !important;}
${sel(' .eduHead h2 svg')}{stroke:var(--th-gold) !important;}
${sel(' .eduIconBtn')}{background:transparent !important;border:1px solid var(--th-line2) !important;color:var(--th-ink) !important;}
${sel(' .eduStreak')}{color:var(--th-gold) !important;border-color:var(--th-line2) !important;background:transparent !important;}
${sel(' .eduSecTitle')}{color:var(--th-gold) !important;}
${sel(' :is(.eduPasteToggle,.eduNote,.eduPlusSub,.eduEmpty,.eduLessonMeta,.eduSubjCount)')}{color:var(--th-muted) !important;opacity:1 !important;}
${sel(' .eduEmpty')}{background:transparent !important;border:none !important;}
/* شريط الرفع بزرّ الثيم؛ المنهج والبطاقات والصفوف بحقل الثيم وخطّه الرفيع — لا ذهبيّ مقطّع ولا تدرّج أصفر */
${sel(' .eduUploadBtn')}{border:none !important;background:var(--th-btn) !important;color:var(--th-btn-ink) !important;box-shadow:none !important;}
${sel(' #eduCurricBtn')}{background:var(--th-field) !important;color:var(--th-ink) !important;border:1px solid var(--th-field-line) !important;}
${sel(' :is(.eduPlusTile,.eduLessonRow,.eduSubjCard,.eduUpRow)')}{background:var(--th-field) !important;border:1px solid var(--th-field-line) !important;color:var(--th-ink) !important;box-shadow:none !important;}
${sel(' .eduPlusTile:hover')}{border-color:var(--th-gold) !important;}
${sel(' .eduLessonTitle')}{color:var(--th-ink) !important;}
${sel(' :is(.eduPrimary,.eduUpPick)')}{background:var(--th-btn) !important;color:var(--th-btn-ink) !important;border:none !important;}
${sel(' :is(select,.eduPasteArea textarea)')}{background:var(--th-field) !important;color:var(--th-ink) !important;border:1px solid var(--th-field-line) !important;}
/* نموذج «إضافة محاضرة»: طبقته بلون الشاشة المرسومة نفسه (مقيس من الصورة) فتختفي الرئيسيّة تحته ولا يبقى لوح ولا بطاقة معتمة — الرأس فوقها ليبقى الإغلاق */
${sel(' .eduUpOv')}{background:var(--edu-sc) !important;padding-top:12px !important;}
@media (max-width:700px){${sel(' .eduUpOv')}{padding-top:64px !important;}}
${sel(' .eduUpCard')}{background:transparent !important;border:none !important;box-shadow:none !important;color:var(--th-ink) !important;max-width:520px !important;}
${sel(' .eduUpLab')}{color:var(--th-gold) !important;}
${sel(' .eduUpFld')}{background:var(--th-field) !important;color:var(--th-ink) !important;border:1px solid var(--th-field-line) !important;}
${sel(' .eduUpDrop')}{background:var(--th-field) !important;border:1.5px dashed var(--th-field-line) !important;color:var(--th-ink) !important;}
${sel(' .eduUpList')}{border:1px solid var(--th-field-line) !important;}
/* المقولة في الشريط المرئيّ يسار الشاشة (مكان كتب المالك في نماذجه) — على الحاسوب، وتختفي حين يضيق الشريط (نافذة أضيق من ١٫٥) وعلى الجوّال */
#eduHubModal .eduQuote{display:none;}
${sel(' .eduQuote')}{display:block;position:absolute;left:12px;width:calc(max(var(--edu-bl),0px) - 24px);top:calc(max(var(--edu-bt),0px) + 6px);text-align:center;pointer-events:none;overflow:hidden;color:var(--th-gold);text-shadow:0 1px 2px rgba(0,0,0,.25);}
${sel(' .eduQuote b')}{display:block;font-size:clamp(14px,1.2cqw,24px);line-height:1.4;font-weight:800;}
${sel(' .eduQuote span')}{display:block;margin-top:4px;font-size:clamp(11px,.75cqw,14px);color:var(--th-muted);}
@container (max-aspect-ratio:1.5){${sel(' .eduQuote')}{display:none;}}
@media (max-width:700px){${sel(' .eduQuote')}{display:none;}}
`;
}

const main = process.argv[1] && /edu-bg-css\.mjs$/.test(process.argv[1]);
if (main) {
  const metaPath = 'assets/edu-bg/meta.json';
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  const out = build(meta);
  const target = 'css/تعليم-خلفية.css';
  if (process.argv.includes('--check')) {
    const cur = existsSync(target) ? readFileSync(target, 'utf8') : '';
    if (cur !== out) { console.log('✗ ' + target + ' يختلف عن المولَّد — شغّل node scripts/edu-bg-css.mjs'); process.exit(1); }
    console.log('✓ مطابق');
  } else {
    writeFileSync(target, out);
    console.log('✓ كُتب ' + target + ' (' + SKINS.length + ' ثيمًا، ' + Object.keys((meta.images) || {}).length + ' صورة مقيسة)');
  }
}
