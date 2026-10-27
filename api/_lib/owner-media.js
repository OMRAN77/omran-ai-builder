'use strict';
/* owner-media.js — v-owner-paid-gate (المالك ١٤ أكتوبر، لقطة: Claude بدأ generate_image وتفكيره «The owner explicitly asked for decor and lighting
   photos, so I'll generate the first image, confirm it saves properly» — «ليش يسوي صوره… خسرة الرصيد أكثر من اللزم على تفاهات»):
   النموذج كان يكمل طلب رسم قديمًا من السجلّ، ويرسم ليشخّص الحفظ؛ وحارس الأدوات المدفوعة لم يكن إلّا لدور السؤال. كلّ رسمة وفيديو من رصيد
   المالك، فالأداة المدفوعة لا تُنفَّذ إلّا بطلب في **رسالته الأخيرة** نفسها — يفحصه الخادم في المحادثة (كلّ المزوّدين) والوكيل. */

// الحدود: بداية كلمة (مسافة أو ترقيم) — لا «سوي» داخل «يسوي» ولا «add» داخل «address»
const B = '(?:^|[\\s،,.!؟?«"\'(])(?:و|ف)?';
const E = '(?=$|[\\s،,.!؟?»"\')])';
// فعل رسم صريح يكفي وحده: ارسم/صمّم/ولّد/draw/generate…
const DRAW_RE = new RegExp(B + '(?:ارسم|أرسم|ترسم|يرسم|نرسم|ارسمي|ارسمها|ارسمهم|ارسمه|ارسملي|ارسم\\s*لي|رسم\\s*لي|صمّ?م|صمّ?مي|صمّ?مها|صمّ?ملي|ولّ?د|ولّ?دي|ولّ?دها|draw|generate|render|paint|sketch|illustrate)' + E, 'i');
/* v-bare-draw (لقطة المالك ١٥ أكتوبر: «رسم صور الستائر وارفعها» بعد أن طُلب منه «ارسم…»): «رسم» بلا ألف أمرٌ في كتابته — يكفي مع اسم
   وسيط (صور/صورة…) وبلا سياق كود، أو مع رفع («…وارفعها للمستودع»). النفي و«ليش» قبله كما هما. */
const BARE_DRAW_RE = new RegExp(B + 'رسم' + E, 'i');
// فعل عامّ لا يكفي وحده: سوّي/اعمل/اصنع/make/create/design — يحتاج اسم وسيط مرئيّ («سوّ لي صورة»، «make a logo»)
const MAKE_RE = new RegExp(B + '(?:ت|ي)?(?:سوّ?ي|سوّ?يها|سوّ?يلي|سولي|سوّ?ها|سوّ?\\s*لي|اعمل|اعملي|اصنع|انشئ|أنشئ|make|create|design)' + E, 'i');
// اسم وسيط مرئيّ: صورة/صور/رسمة/فيديو/شعار…
const MEDIA_NOUN_RE = /(صور[ةه]?|الصور|رسم[ةه]|رسومات|فيديو|مقطع|لوجو|شعار|بوستر|بنر|خلفي[ةه]|أيقون[ةه]|ايقون[ةه]|\bimages?\b|\bpictures?\b|\bphotos?\b|\bvideos?\b|\blogos?\b|\bposters?\b|\bbanners?\b|\bicons?\b|\billustrations?\b)/i;
// تعديل على صورة بأيّ سابقة مضارعة ولاحقة («تغيرها»، «يبدّلها»)؛ الحذف تعديلٌ للمرفق وحده (EDIT_ATTACH_RE)
const EDIT_RE = new RegExp(B + '(?:ت|ي|ن|أ|ا)?(?:عدّ?ل|غيّ?ر|بدّ?ل|حوّ?ل|لوّ?ن|كبّ?ر|صغّ?ر|حسّ?ن|اجعل|edit|change|turn|convert|recolor|enhance|replace)', 'i');
const EDIT_ATTACH_RE = new RegExp(B + '(?:ت|ي|ن|أ|ا)?(?:عدّ?ل|غيّ?ر|بدّ?ل|حوّ?ل|لوّ?ن|كبّ?ر|صغّ?ر|حسّ?ن|اجعل|خلّ?ي|خلها|ضيف|أضف|اضف|احذف|امسح|شيل|سوّ?ها|سوها|edit|change|turn|convert|recolor|enhance|remove|add|replace)', 'i');
// رفع فقط: «ارفع الصور» لا يعني ارسمها (الرسمة السابقة تُحفظ من المتصفّح — v-agent-img-keep)
const UPLOAD_RE = new RegExp(B + '(?:ارفع|ارفعها|ارفعهم|رفع|ادفع|حمّ?ل|upload|push|commit)' + E, 'i');
// نفي قبل الرسم أو الصور بكلمتين على الأكثر: «لا ترسم»، «ما ابي صور»، «بدون صور»، «خلاص لا…»
const NEG_RE = /(?:^|[\s،,.!؟?«"'(])(?:لا|ما|بدون|بلا|مو|مب|مش|وقف|وقّف|بطّ?ل|don'?t|do\s+not|no|stop)\s+(?:\S+\s+){0,2}?(?:ت|ي)?(?:رسم|ارسم|ترسم|صمّ?م|صور|الصور|صوره|صورة|رسم[ةه]|فيديو|images?|pictures?|photos?|draw|generate|video)/i;
// سؤال عن السبب أو الحال: شكوى أو استيضاح لا طلب رسم
const WHY_RE = /(?:^|[\s،,.!؟?«"'(])(?:ليش|ليه|لماذا|لم|علامك|وش\s+صار|شو\s+صار|ايش\s+صار|why|what\s+happened)(?=$|[\s،,.!؟?»"')])/i;
// سياق كود: الصور مذكورة في عمل على الكود/المستودع لا طلب رسم («غيّر الكود عشان الصور تنحفظ»)
const CODE_RE = /(كود|الكود|ملف|ملفّ|الحفظ|تنحفظ|انحفظ|الصفحة|الصفحه|الواجهة|التطبيق|الزر|زر\s|المستودع|طلب\s*سحب|فرع|دمج|ادمج|انشر|الخادم|السيرفر|\bcode\b|\bfile\b|\bbranch\b|\bPR\b|\bpull\s+request\b|\bcommit\b|\bsave\b|\bapp\b)/i;

/** نصّ المالك الأخير (بلا ملحق المرفقات «[…]» في آخره) يطلب رسمًا أو تعديل صورة أو فيديو؟ hasImage = أرفق صورة في هذه الرسالة. */
function askedMedia(text, hasImage) {
  const t = String(text || '').slice(0, 2000).replace(/\n*\[[^\[\]\n]*\]\s*$/, '');
  if (!t.trim()) return !!hasImage; // صورة بلا كلام: المعالج يقرّر (تعديل المرفق) كما كان
  if (NEG_RE.test(t)) return false; // «خلاص لا ترسم»، «ما ابي صور»
  if (WHY_RE.test(t) && !DRAW_RE.test(t)) return false; // سؤال «ليش/وش صار» عن الصور شكوى لا طلب: «ليش يسوي صوره»
  const noun = MEDIA_NOUN_RE.test(t), code = CODE_RE.test(t);
  if (DRAW_RE.test(t)) return true; // «ارسم…»، «صمّم…» — طلب صريح ولو مع كود («ارسم صورة وارفعها للمستودع»)
  if (noun && BARE_DRAW_RE.test(t) && (!code || UPLOAD_RE.test(t))) return true; // v-bare-draw: «رسم صور الستائر وارفعها» (بلا ألف) — لا «رسم الصور في الصفحة ما يطلع»
  if (MAKE_RE.test(t) && noun && !code) return true; // «سوّ لي صورة»، «make a logo» — لا «سوّها في طلب سحب»
  if (hasImage && !code && EDIT_ATTACH_RE.test(t)) return true; // تعديل الصورة المرفقة («سوّها 3D»، «احذف الخلفية»)
  if (noun && !code && EDIT_RE.test(t)) return true; // «غيّر الصورة»، «اريدك ان تغيرها» — لا «غيّر الكود عشان الصور»
  if (noun && !code && !UPLOAD_RE.test(t) && /(?:^|\s)(?:أبي|ابي|أبغى|ابغى|أريد|اريد|ابغي|أبغي|بدي|عطني|اعطني|هات|want|need|give\s+me)/i.test(t)) return true; // «أبي صورة لـ…»
  return false;
}

const PAID_MEDIA_TOOLS = ['generate_image', 'edit_image', 'generate_video'];
const REFUSAL = '✗ لم يُنفَّذ: المالك لم يطلب رسمًا ولا تعديل صورة ولا فيديو في رسالته الأخيرة، وكلّ تشغيل من رصيده. لا تكمل طلبًا قديمًا من السجلّ، ولا ترسم لتجرّب أو تشخّص. رسمة سابقة تُرفع برمزها (write_github image: "__IMG_N__") بلا رسم جديد. إن احتجت الرسم فعلًا فاسأله في سطر.';

/** رسالة المالك سؤال «ليش/وش صار» أو نفي أو تنتهي بعلامة استفهام — شكوى أو استيضاح لا أمر بإكمال شغل سابق */
function notACommand(text) {
  const t = String(text || '').slice(0, 2000).replace(/\n*\[[^\[\]\n]*\]\s*$/, '').trim();
  return WHY_RE.test(t) || NEG_RE.test(t) || /[?؟]\s*$/.test(t);
}
/** خطّة النموذج المتوقّفة رسمٌ؟ («سأرسم الصورة الأولى…») — لا تُحمَل للتنفيذ إلّا بطلب رسم في الرسالة الأخيرة */
const PLAN_DRAW_RE = /(?:سأرسم|سوف\s+أرسم|راح\s+أرسم|بأرسم|برسم\s+(?:ال)?صور|خلّ?ني\s+أرسم|أرسم\s+(?:أوّ?ل\s+)?(?:ال)?صور|generate_image|edit_image|(?:I'?ll|will|let\s+me)\s+(?:generate|draw|create)\s+(?:the\s+|an?\s+)?(?:first\s+)?(?:image|picture|photo))/i;
/** لقطة التطبيق + «الصور»: استبدال صور (يُرسم) لا حذفها أو إصلاح عرضها (كود) */
const PICS_FIX_RE = /(?:احذف|حذف|شيل|امسح|صلّ?ح|أصلح|اصلح|خبّ?ي|أخف|اخف|ما\s+تظهر|ما\s+تطلع|delete|remove|hide|fix)/i;
function picsReplace(text) { return !PICS_FIX_RE.test(String(text || '')); }
const CAP_REFUSAL = '✗ لم يُنفَّذ: أربع رسمات في الردّ الواحد حدّ مقصود (كلّ رسمة من رصيد المالك). ارفع ما رُسم برموزه، وأكمل في ردّ لاحق إن طلب المالك.';
/** مهلة المتصفّح انتهت والرسمة قد تكون ما زالت جارية (مدفوعة): لا يُفهم «لم يُنفَّذ» فيُعاد الرسم */
function waitNote(result) {
  const r = String(result || '');
  return /^لم يستجب متصفح المستخدم/.test(r) ? '⏳ الرسمة ما زالت جارية في متصفّح المالك أو تعذّر وصول نتيجتها — لا تُعِد الرسم في هذا الردّ (كلّ رسمة من رصيده). قل له إنّها قيد الإنشاء، وإن ظهرت ارفعها برمزها.' : r;
}

module.exports = { askedMedia, notACommand, picsReplace, PLAN_DRAW_RE, PAID_MEDIA_TOOLS, REFUSAL, CAP_REFUSAL, waitNote };
