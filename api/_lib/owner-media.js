'use strict';
/* owner-media.js — v-owner-paid-gate (المالك ١٤ أكتوبر، لقطة: Claude بدأ generate_image وتفكيره «The owner explicitly asked for decor and lighting
   photos, so I'll generate the first image, confirm it saves properly» — «ليش يسوي صوره… خسرة الرصيد أكثر من اللزم على تفاهات»):
   النموذج كان يكمل طلب رسم قديمًا من السجلّ، ويرسم ليشخّص الحفظ؛ وحارس الأدوات المدفوعة لم يكن إلّا لدور السؤال. كلّ رسمة وفيديو من رصيد
   المالك، فالأداة المدفوعة لا تُنفَّذ إلّا بطلب في **رسالته الأخيرة** نفسها — يفحصه الخادم في المحادثة (كلّ المزوّدين) والوكيل. */

// فعل إنشاء صريح: يرسم/يصمّم/يولّد/يسوّي صورة… (أيّ تصريف شائع بالعربيّة والخليجيّة والإنجليزيّة)
const MAKE_RE = /(?:^|[\s،,.!؟?«"'(])(?:و|ف)?(?:ارسم|أرسم|ترسم|يرسم|نرسم|ارسمي|ارسمها|ارسمهم|ارسمه|ارسملي|ارسم\s*لي|رسم\s*لي|صمّ?م|صمّ?مي|صمّ?مها|صمّ?ملي|ولّ?د|ولّ?دي|ولّ?دها|انشئ|أنشئ|سوّ?ي|سوّ?يها|سوّ?يلي|سولي|سوّ?ها|سوّ?\s*لي|اعمل|اعملي|اصنع|draw|generate|create|make|design|render|paint|sketch|illustrate)(?=$|[\s،,.!؟?»"')])/i;
// اسم وسيط مرئيّ: صورة/صور/رسمة/فيديو/شعار…
const MEDIA_NOUN_RE = /(صور[ةه]?|الصور|رسم[ةه]|رسومات|فيديو|مقطع|لوجو|شعار|بوستر|بنر|خلفي[ةه]|أيقون[ةه]|ايقون[ةه]|\bimages?\b|\bpictures?\b|\bphotos?\b|\bvideos?\b|\blogos?\b|\bposters?\b|\bbanners?\b|\bicons?\b|\billustrations?\b)/i;
// تعديل على صورة: عدّل/غيّر/بدّل/حوّل/لوّن…
const EDIT_RE = /(?:^|[\s،,.!؟?«"'(])(?:و|ف)?(?:ت|ي|ن|أ|ا)?(?:عدّ?ل|غيّ?ر|بدّ?ل|حوّ?ل|لوّ?ن|كبّ?ر|صغّ?ر|حسّ?ن|اجعل|خلّ?ي|خلها|ضيف|أضف|اضف|احذف|امسح|شيل|edit|change|turn|convert|recolor|enhance|remove|add|replace)/i; // بأيّ سابقة مضارعة ولاحقة: «تغيرها»، «يبدّلها»
// رفع/إرسال فقط: «ارفع الصور» لا يعني ارسمها من جديد (الرسمة السابقة تُحفظ من المتصفّح — v-agent-img-keep)
const UPLOAD_RE = /(?:^|[\s،,.!؟?«"'(])(?:و|ف)?(?:ارفع|ارفعها|ارفعهم|رفع|ادفع|حمّ?ل|upload|push|commit)(?=$|[\s،,.!؟?»"')])/i;

/** نصّ المالك الأخير (بلا ملحق المرفقات «[…]» في آخره) يطلب رسمًا أو تعديل صورة أو فيديو؟ hasImage = أرفق صورة في هذه الرسالة. */
function askedMedia(text, hasImage) {
  const t = String(text || '').slice(0, 2000).replace(/\n*\[[^\[\]\n]*\]\s*$/, '');
  if (!t.trim()) return !!hasImage; // صورة بلا كلام: المعالج يقرّر (تعديل المرفق) كما كان
  if (MAKE_RE.test(t)) return true; // «ارسم…»، «صمّم…»، «سوّ لي صورة…»
  if (hasImage && EDIT_RE.test(t)) return true; // تعديل الصورة المرفقة
  if (MEDIA_NOUN_RE.test(t) && EDIT_RE.test(t)) return true; // «غيّر الصورة»، «بدّل الصور بغيرها»
  if (MEDIA_NOUN_RE.test(t) && !UPLOAD_RE.test(t) && /(?:^|\s)(?:أبي|ابي|أبغى|ابغى|أريد|اريد|ابغي|أبغي|بدي|عطني|اعطني|هات|want|need|give\s+me)/i.test(t)) return true; // «أبي صورة لـ…»
  return false;
}

const PAID_MEDIA_TOOLS = ['generate_image', 'edit_image', 'generate_video'];
const REFUSAL = '✗ لم يُنفَّذ: المالك لم يطلب رسمًا ولا تعديل صورة ولا فيديو في رسالته الأخيرة، وكلّ تشغيل من رصيده. لا تكمل طلبًا قديمًا من السجلّ، ولا ترسم لتجرّب أو تشخّص. رسمة سابقة تُرفع برمزها (write_github image: "__IMG_N__") بلا رسم جديد. إن احتجت الرسم فعلًا فاسأله في سطر.';

module.exports = { askedMedia, PAID_MEDIA_TOOLS, REFUSAL };
