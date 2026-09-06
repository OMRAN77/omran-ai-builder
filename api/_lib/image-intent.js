'use strict';
/* image-intent.js — نيّات تعديل الصورة في مكان واحد قابل للاختبار.
   v-nano-pro-edit (المالك ٥ سبتمبر: «عندي نانو وجيمي وكل المفاتيح وآخر شي النتيجة صفر —
   الصورة المزخرفة من نانو والثانية من التطبيق»): طلبات «أقوى/أفخم/أرقى/طوّرها/حسّنها»
   كانت تُصنَّف نصفها تعديلًا موضعيًّا (لا تغيّر شيئًا) ونصفها ترقية مشهد لغرفة، فلا يصل
   شيء منها إلى المحرّك الإبداعي. هنا: قاموس واحد لكل نيّة، يُقرأ من نصّ المستخدم نفسه
   (userText) لا من الأمر الذي أعاد النموذج صياغته بالإنجليزية.
   تنبيه: \b في JavaScript حدّ كلمات لاتينيّ فقط — لا يعمل بعد حرف عربي؛ الحدود العربية هنا
   دائمًا (?:^|[\s،,]) قبل الكلمة و(?=$|[\s،,.!؟?]) بعدها. */

/* «نفس الصورة/زيها بالضبط» — والإنجليزية بعبارات كاملة كي لا تلتقط «Keep layout identical» في أوامر الديكور */
const SAME_IMAGE_RE = /نفس\s*الصور[ةه]|زيها\s*بالضبط|طبق\s*الأصل|بالضبط\s*نفس|كما\s*هي|\bsame\s+(?:image|picture|photo)\b|\bexact(?:ly)?\s+(?:the\s+)?same\b|\bidentical\s+(?:image|picture|photo|copy)\b|\bidentical\s+to\s+the\s+(?:source|original)\b|\bkeep\s+(?:it|everything)\s+(?:exactly\s+)?(?:the\s+same|identical|as\s+is)\b/i;

/* «عدل 3d» / «حوّلها كرتون» / «ستايل أنيمي» = تحويل أسلوب كامل لا تعديل موضعي.
   ألوان «رصاصي/زيتي/مائي» ليست أساليب — الأسلوب فقط في «رسم رصاص/لوحة زيتية/ألوان مائية».
   الإنجليزية تشمل أوامر الديكور المهندسة («Redesign this room in a … style / architectural render»). */
const RESTYLE_RE = /(^|[\s،,])(3d|ثلاثي|مجسم|مجسّم|كرتون|كارتون|أنيمي|انمي|بيكسار|ديزني|بكسل|بيكسل|سايبر|نيون|كوميك|كومكس|مانجا|فانتازيا|واقعي|اسكتش|سكتش|anime|cartoon|pixar|disney|pixel\s*art|cyberpunk|neon\s*(?:style|look|art)|comic|manga|fantasy|watercolor|oil\s*paint(?:ing)?|sketch|realistic|3d\s*render)(?:ي[ةه]?|[ةه]|ات)?(?=$|[\s،,.!؟?])|(?:^|[\s،,])(?:ب|ل|لل|بال|كال)?(?:رسم[ةه]?|لوح[ةه])\s*(?:ب)?(?:قلم\s*)?(?:ال)?رصاص(?:ي[ةه]?)?(?=$|[\s،,.!؟?])|(?:^|[\s،,])(?:ب|ل|لل|بال|كال)?(?:لوح[ةه]|رسم[ةه]?|ألوان|الوان|أسلوب|اسلوب|ستايل|طابع)\s*(?:ال)?(?:زيتي[ةه]?|مائي[ةه]?)(?=$|[\s،,.!؟?])|\b(?:redesign|restyle|re-?render|repaint|redraw|transform|convert|turn)\s+(?:it|this|the\s+(?:whole\s+|entire\s+)?(?:image|picture|photo|card|design|scene|room|interior|space|restaurant|house|kitchen|office|shop|place|cafe|garden))\b|\b(?:architectural|photorealistic|cinematic)\s+render(?:ing)?\b/i;

/* «فكرة ثانية/مختلفة» = مشهد جديد كليًّا من الموضوع نفسه */
const REIMAGINE_RE = /فكرة\s*(ثانية|ثانيه|مختلفة|مختلفه|جديدة|جديده|غير)|فكره\s*(ثانية|ثانيه|مختلفة|مختلفه|جديدة|جديده|غير)|غيّ?ر\s*الفكرة|بشكل\s*مختلف\s*تمام|مختلف\s*تمام|تصميم\s*ثاني|ستايل\s*ثاني|بدّ?ل\s*(الفكرة|التصميم|الستايل)|different\s*(idea|concept|style)|new\s*concept|another\s*(idea|take|concept)|reimagine/i;

/* الصفة تصف عنصرًا واحدًا حين تلي اسمَه مباشرة: «حط إطار أفخم» / «اجعل الخلفية أجمل» / «ضيف لمسة فخمة» /
   «بخط احترافي» / «عدل الخط وخله أجمل» — تعديلات موضعية. أمّا «طوّرها بالألوان» و«خلها فخمة من فوق»
   و«make it stronger but keep the text» فالصفة تصف الصورة كلها والاسم مجرّد جانب — ترقية كاملة. */
const AR_LOCAL_NOUN = '(?:إطار|اطار|برواز|خلفي[ةه]|خط|نص|كلم[ةه]|كلمات|جمل[ةه]|عبار[ةه]|اسم|أسماء|اسماء|رقم|أرقام|ارقام|تاريخ|لون|ألوان|الوان|شعار|لوجو|عنوان|إضاء[ةه]|اضاء[ةه]|نور|ظل|ظلال|توهج|تأثير|فلتر|زر|أيقون[ةه]|ايقون[ةه]|حدود|حاف[ةه]|زاوي[ةه]|جزء|منطق[ةه]|جهة|سماء|سما|غيوم|قب[ةه]|مئذن[ةه]|شجر|أشجار|اشجار|نخل|نجوم|قمر|شمس|وجه|شعر|عيون|عين|فم|ابتسام[ةه]|ملابس|قميص|فستان|ثوب|شماغ|نظار[ةه]|سيار[ةه]|طاول[ةه]|كرسي|جدار|أرضي[ةه]|ارضي[ةه]|سقف|باب|نافذ[ةه]|شباك|لمس[ةه]|لمسات)(?:ي|نا|ك|كم|ها|ه|ات|ين)?';
const AR_ELEVATE_ADJ = '(?:فخم[ةه]?|فخام[ةه]|راقي[ةه]?|رايق[ةه]?|خيالي[ةه]?|جبار[ةه]?|مبهر[ةه]?|احترافي[ةه]?|إبداعي[ةه]?|ابداعي[ةه]?|تجنن|لايق[ةه]?)';
/* «أقوى/أفخم/أرقى/أجمل/أبدع/طوّرها/حسّنها/زخرفها/نسخة أفضل…» = الفكرة نفسها مرفوعة بقوة.
   صيغ التفضيل العربية تُلتقط بجذرها (أ/ا/إ + قوى|فخم|رقى|جمل|حلى|روع|بدع|حسن|فضل|بهى|بهر|شيك)
   بحرف الهمزة أو بدونه، مع أو بدون «نسخة/خلها/سوها/من هذي».
   «أفضّل لو/أن تغيّر…» (أُفضّل = I prefer) ليست ترقية — تُستثنى بما يليها. */
const AR_ELATIVE = '(?:أ|ا|إ)(?:قوى|قوي|فخم|رقى|رقي|جمل|حلى|حلا|روع|بدع|حسن|فضل|بهى|بهر|شيك)';
const AR_NOT_PREFER = '(?!\\s+(?:ال\\S|(?:لو|أن|ان|إن|إنك|انك|إنه|انه)(?=[\\s،,]|$)|تخل|تسو|تغي|تحط|تكتب|تشيل|تضيف|تحذف|' + AR_LOCAL_NOUN + '(?=$|[\\s،,.!؟?])))';
const AR_ELEVATE_VERBS = '(?:[اأ]?(?:طوّ?ر|حسّ?ن|جمّ?ل|قوّ?|رقّ?|زيّ?ن|عزّ?ز|زخرف|فخّ?م)|ارفع|إرفع|ارتقِ?|ابهر|أبهر)';
const ELEVATE_RE = new RegExp([
  /* أقوى / نسخة أفخم / خلها أرقى / سوها أجمل / أفضل من هذي */
  '(?:^|[\\s،,])(?:(?:نسخ[ةه]|صور[ةه]|شكل|تصميم|كرت|بطاق[ةه])\\s*)?(?:خلّ?ي?ها|خلّ?ي?ه|سوّ?ي?ها|سوّ?ي?ه|اجعلها|اجعله|صيّ?رها|عطني|أعطني|اعطني|ابي|أبي|ابغى|أبغى|ابغي|أبغي|أريد|اريد|ودي|ودّي|هات)?\\s*(?:نسخ[ةه]\\s*)?(?:ال)?' + AR_ELATIVE + AR_NOT_PREFER + '(?=$|[\\s،,.!؟?]|\\s*(?:من|بكثير|شوي|شوية|أكثر|اكثر|كثير|مرة))',
  /* فخم / فخمة / راقية / احترافية أكثر / خيالية / جبارة / مبهرة / تجنن / لايقة */
  '(?:^|[\\s،,])' + AR_ELEVATE_ADJ + '(?:\\s*(?:أكثر|اكثر))?(?=$|[\\s،,.!؟?])',
  /* طوّرها / حسّنها / جمّلها / زخرفها / فخّمها / ابهرني / ارفع مستواها / حسّن الكرت —
     الفعل يُعدّ ترقية إن كان مفعوله الصورة كلها (ضمير أو «الصورة/الكرت/المستوى»)؛
     «حسّن الإضاءة» و«طوّر الخط» تعديلان موضعيان يبقيان في مسارهما. */
  '(?:^|[\\s،,])' + AR_ELEVATE_VERBS + '(?:(?:ها|ه|يها|يه|ي|ني)(?=$|[\\s،,.!؟?])|\\s*(?:ال)?(?:صور[ةه]|كرت|بطاق[ةه]|تصميم|شكل|مستوى|مستواها|جودتها|جودة\\s*الصور[ةه]|النتيجة)(?=$|[\\s،,.!؟?]))',
  /* الفعل بلا مفعول = الرسالة كلها فقط («حسن» / «طور») — لا «اكتب اسم حسن» ولا «الاسم زين» */
  '^\\s*' + AR_ELEVATE_VERBS + '\\s*[،,.!؟?]*\\s*$',
  /* زوّد الزخارف / زيد الفخامة */
  '(?:^|[\\s،,])(?:زوّ?د|زيد|كثّ?ر|ضاعف)\\s*(?:ال(?:زخارف|زخرف[ةه]|تفاصيل|إبداع|ابداع|جمال|فخام[ةه]|إبهار|ابهار|روع[ةه])|(?:زخارف|تفاصيل|فخام[ةه]|جمال|روع[ةه])(?:ها|ه))(?=$|[\\s،,.!؟?])',
  /* الإنجليزية: الصفة تُعدّ ترقية للصورة كلها فقط (make it …/… version/رسالة قصيرة من الصفة وحدها) —
     «make the text bolder» و«add a premium badge» تعديلان موضعيان. */
  '\\bmake\\s+(?:it|this|everything|the\\s+(?:whole\\s+|entire\\s+)?(?:image|picture|photo|card|design|scene|look))\\s+(?:much\\s+|way\\s+|a\\s+lot\\s+)?(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|pop|shine|stand\\s*out|more\\s+\\w+)\\b',
  '\\b(?:a\\s+|an\\s+)?(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|enhanced|improved|upgraded|elevated|polished|cleaner|more\\s+(?:powerful|impressive|beautiful|elegant|luxurious|professional|premium|polished|refined|dramatic|striking|attractive))(?:,?\\s+(?:and\\s+)?(?:more\\s+\\w+|\\w+er))*\\s+(?:version|look|take|edition|rendition|variant)\\b',
  '^\\s*(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|more\\s+\\w+)\\s*[.!]*\\s*$',
  '\\b(?:level\\s*up|glow\\s*up|next\\s*level|better\\s+than\\s+(?:this|that|the\\s+original)|best\\s+version|higher\\s+quality|plus\\s+it|(?:enhance|improve|upgrade|elevate|polish)\\s+(?:it|this|everything|overall|the\\s+(?:whole\\s+|entire\\s+|overall\\s+)?(?:image|picture|photo|card|design|scene|look|quality|result)))\\b',
].join('|'), 'i');

const LOCAL_ELATIVE_RE = new RegExp('(?:^|[\\s،,])(?:ال|لل|بال|وال|ول|ب|ل)?' + AR_LOCAL_NOUN + '\\s+(?:و?(?:خلّ?ي?ه|خلّ?ي?ها|اجعله|اجعلها|سوّ?ي?ه|سوّ?ي?ها|صيّ?ره|صيّ?رها)\\s+)?(?:ال)?(?:' + AR_ELATIVE + '|' + AR_ELEVATE_ADJ + ')(?=$|[\\s،,.!؟?])', 'i');

/* ترقية مشهد حقيقي (غرفة/مكان) — تبقى على أمر «نفس المكان نفس الزاوية» الفوتوغرافي */
const PLACE_RE = /(?:^|[\s،,])(?:ال|لل|بال|وال)?(?:غرف[ةه]|غرفتي|مكان|مشهد|ديكور|صال[ةه]|مجلس|بيت|منزل|فيلا|فله|مطبخ|حمام|حديق[ةه]|مكتب|محل|مطعم|كوفي|كافيه|مدخل|واجه[ةه])(?:ي|نا|ك|كم|ها|ه|ات)?(?=$|[\s،,.!؟?])|\b(?:room|space|place|interior|exterior|decor|house|villa|kitchen|office|shop|restaurant|cafe|garden|living\s*room|bedroom)s?\b/i;
const APPLY_RECS_RE = /(?:طبّ?ق|نفّ?ذ|سوّ?ي)\s*(?:لي\s*)?(?:كل\s*)?(?:ال)?(?:توصيات|اقتراحات|تحسينات|خطوات)|apply\s+(?:the\s+)?(?:recommendations|suggestions|upgrades)/i;

/**
 * يصنّف طلب تعديل على صورة مصدر.
 * @param {string} text نصّ المستخدم (userText) أو الأمر إن غاب.
 * @returns {{sameImage:boolean, restyle:boolean, reimagine:boolean, elevate:boolean, placeUpgradeHint:boolean}}
 */
function detectEditIntent(text) {
  const s = String(text || '');
  const sameImage = SAME_IMAGE_RE.test(s);
  const restyle = RESTYLE_RE.test(s);
  const reimagine = !restyle && !sameImage && REIMAGINE_RE.test(s);
  const elevate = !restyle && !reimagine && !sameImage && ELEVATE_RE.test(s) && !LOCAL_ELATIVE_RE.test(s);
  const placeUpgradeHint = PLACE_RE.test(s) || APPLY_RECS_RE.test(s);
  return { sameImage, restyle, reimagine, elevate, placeUpgradeHint };
}

module.exports = { detectEditIntent, SAME_IMAGE_RE, RESTYLE_RE, REIMAGINE_RE, ELEVATE_RE, LOCAL_ELATIVE_RE, PLACE_RE, APPLY_RECS_RE };
