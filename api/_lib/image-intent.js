'use strict';
/* image-intent.js — نيّات تعديل الصورة في مكان واحد قابل للاختبار.
   v-nano-pro-edit (المالك ٥ سبتمبر: «عندي نانو وجيمي وكل المفاتيح وآخر شي النتيجة صفر —
   الصورة المزخرفة من نانو والثانية من التطبيق»): طلبات «أقوى/أفخم/أرقى/طوّرها/حسّنها»
   كانت تُصنَّف نصفها تعديلًا موضعيًّا (لا تغيّر شيئًا) ونصفها ترقية مشهد لغرفة، فلا يصل
   شيء منها إلى المحرّك الإبداعي. هنا: قاموس واحد لكل نيّة، يُقرأ من نصّ المستخدم نفسه
   (userText) لا من الأمر الذي أعاد النموذج صياغته بالإنجليزية. */

const SAME_IMAGE_RE = /نفس\s*الصور[ةه]|زيها\s*بالضبط|طبق\s*الأصل|بالضبط\s*نفس|كما\s*هي|same\s*image|exact(?:ly)?\s*same|identical/i;

/* «عدل 3d» / «حوّلها كرتون» / «ستايل أنيمي» = تحويل أسلوب كامل لا تعديل موضعي */
const RESTYLE_RE = /(^|[\s،,])(3d|ثلاثي|مجسم|مجسّم|كرتون|كارتون|أنيمي|انمي|بيكسار|ديزني|زيتي|مائي|رصاص|بكسل|بيكسل|سايبر|نيون|كوميك|كومكس|مانجا|فانتازيا|واقعي|anime|cartoon|pixar|disney|pixel\s*art|cyberpunk|neon\s*(?:style|look|art)|comic|manga|fantasy|watercolor|oil\s*paint(?:ing)?|sketch|realistic|3d\s*render)(?:ي[ةه]?|[ةه]|ات)?(?=$|[\s،,.!؟?])/i;

/* «فكرة ثانية/مختلفة» = مشهد جديد كليًّا من الموضوع نفسه */
const REIMAGINE_RE = /فكرة\s*(ثانية|ثانيه|مختلفة|مختلفه|جديدة|جديده|غير)|فكره\s*(ثانية|ثانيه|مختلفة|مختلفه|جديدة|جديده|غير)|غيّ?ر\s*الفكرة|بشكل\s*مختلف\s*تمام|مختلف\s*تمام|تصميم\s*ثاني|ستايل\s*ثاني|بدّ?ل\s*(الفكرة|التصميم|الستايل)|different\s*(idea|concept|style)|new\s*concept|another\s*(idea|take|concept)|reimagine/i;

/* «أقوى/أفخم/أرقى/أجمل/أبدع/طوّرها/حسّنها/نسخة أفضل…» = الفكرة نفسها مرفوعة بقوة.
   صيغ التفضيل العربية تُلتقط بجذرها (أ/ا + قوى|فخم|رقى|جمل|حلى|روع|بدع|نظف|وضح|حسن|فضل|بهى)
   بحرف الهمزة أو بدونه، مع أو بدون «نسخة/خلها/سوها/من هذي». */
const AR_ELATIVE = '(?:أ|ا|إ)(?:قوى|قوي|فخم|رقى|رقي|جمل|حلى|حلا|روع|بدع|حسن|فضل|بهى|بهر|شيك)';
const ELEVATE_RE = new RegExp([
  /* أقوى / نسخة أفخم / خلها أرقى / سوها أجمل / أفضل من هذي */
  '(?:^|[\\s،,])(?:(?:نسخ[ةه]|صور[ةه]|شكل|تصميم|كرت|بطاق[ةه])\\s*)?(?:خلّ?ي?ها|خلّ?ي?ه|سوّ?ي?ها|سوّ?ي?ه|اجعلها|اجعله|صيّ?رها|عطني|أعطني|اعطني|ابي|أبي|ابغى|أبغى|ابغي|أبغي|أريد|اريد|ودي|ودّي|هات)?\\s*(?:نسخ[ةه]\\s*)?(?:ال)?' + AR_ELATIVE + '(?!\\s+(?:ال\\S|لو\\b|أن\\b|ان\\b|إن\\b|إنك|انك|تخل|تسو|تغي|تحط))(?=$|[\\s،,.!؟?]|\\s*(?:من|بكثير|شوي|شوية|أكثر|اكثر|كثير|مرة))',
  /* فخم / فخمة / راقية / احترافية أكثر / خيالية / جبارة / مبهرة */
  '(?:^|[\\s،,])(?:فخم[ةه]?|فخام[ةه]|راقي[ةه]?|رايق[ةه]?|خيالي[ةه]?|جبار[ةه]?|مبهر[ةه]?|احترافي[ةه]?\\s*(?:أكثر|اكثر)?|إبداعي[ةه]?|ابداعي[ةه]?)(?=$|[\\s،,.!؟?])',
  /* طوّرها / حسّنها / جمّلها / ارفع مستواها / قوّها / رقّيها / زيّنها */
  /* الفعل وحده يُعدّ ترقية فقط إن كان مفعوله الصورة كلها (طوّرها / حسّن الصورة / ارفع مستواها) أو
     جاء بلا مفعول في آخر الجملة؛ «حسّن الإضاءة» و«طوّر الخط» تعديلان موضعيان يبقيان في مسارهما. */
  '(?:^|[\\s،,])(?:[اأ]?(?:طوّ?ر|حسّ?ن|جمّ?ل|قوّ?|رقّ?|زيّ?ن|عزّ?ز)|ارفع|إرفع|ارتقِ?|ابهر|أبهر)(?:(?:ها|ه|يها|يه|ي)(?=$|[\\s،,.!؟?])|\\s*(?:ال)?(?:صور[ةه]|كرت|بطاق[ةه]|تصميم|شكل|مستوى|مستواها|جودتها|النتيجة)(?=$|[\\s،,.!؟?])|(?=$|[،,.!؟?]))',
  /* الإنجليزية */
  /* الإنجليزية: الصفة تُعدّ ترقية للصورة كلها فقط (make it …/… version/رسالة قصيرة من الصفة وحدها) —
     «make the text bolder» و«add a premium badge» تعديلان موضعيان. */
  '\\bmake\\s+(?:it|this|everything|the\\s+(?:whole\\s+|entire\\s+)?(?:image|picture|photo|card|design|scene|look))\\s+(?:much\\s+|way\\s+|a\\s+lot\\s+)?(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|pop|shine|stand\\s*out|more\\s+\\w+)\\b',
  '\\b(?:a\\s+|an\\s+)?(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|enhanced|improved|upgraded|elevated|polished|cleaner|more\\s+(?:powerful|impressive|beautiful|elegant|luxurious|professional|premium|polished|refined|dramatic|striking|attractive))(?:,?\\s+(?:and\\s+)?(?:more\\s+\\w+|\\w+er))*\\s+(?:version|look|take|edition|rendition|variant)\\b',
  '^\\s*(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|more\\s+\\w+)\\s*[.!]*\\s*$',
  '\\b(?:level\\s*up|glow\\s*up|next\\s*level|better\\s+than\\s+(?:this|that|the\\s+original)|best\\s+version|higher\\s+quality|plus\\s+it|(?:enhance|improve|upgrade|elevate|polish)\\s+(?:it|this|everything|overall|the\\s+(?:whole\\s+|entire\\s+|overall\\s+)?(?:image|picture|photo|card|design|scene|look|quality|result)))\\b',
].join('|'), 'i');

/* ترقية مشهد حقيقي (غرفة/مكان) — تبقى على أمر «نفس المكان نفس الزاوية» الفوتوغرافي */
const PLACE_RE = /(?:^|[\s،,])(?:ال|لل|بال|وال)?(?:غرف[ةه]|غرفتي|مكان|مشهد|ديكور|صال[ةه]|مجلس|بيت|منزل|فيلا|فله|مطبخ|حمام|حديق[ةه]|مكتب|محل|مطعم|كوفي|كافيه|مدخل|واجه[ةه])(?:ي|نا|ك|كم|ها|ه|ات)?(?=$|[\s،,.!؟?])|\b(?:room|space|place|interior|exterior|decor|house|villa|kitchen|office|shop|restaurant|cafe|garden|living\s*room|bedroom)s?\b/i;
const APPLY_RECS_RE = /(?:طبّ?ق|نفّ?ذ|سوّ?ي)\s*(?:لي\s*)?(?:كل\s*)?(?:ال)?(?:توصيات|اقتراحات|تحسينات|خطوات)|apply\s+(?:the\s+)?(?:recommendations|suggestions|upgrades)/i;

/**
 * يصنّف طلب تعديل على صورة مصدر.
 * @param {string} text نصّ المستخدم (userText) أو الأمر إن غاب.
 * @param {{sceneUpgrade?:boolean}} [opts]
 * @returns {{sameImage:boolean, restyle:boolean, reimagine:boolean, elevate:boolean, placeUpgradeHint:boolean}}
 */
function detectEditIntent(text, opts) {
  const s = String(text || '');
  const sameImage = SAME_IMAGE_RE.test(s);
  const restyle = RESTYLE_RE.test(s);
  const reimagine = !restyle && !sameImage && REIMAGINE_RE.test(s);
  const elevate = !restyle && !reimagine && !sameImage && ELEVATE_RE.test(s);
  const placeUpgradeHint = PLACE_RE.test(s) || APPLY_RECS_RE.test(s);
  return { sameImage, restyle, reimagine, elevate, placeUpgradeHint };
}

module.exports = { detectEditIntent, SAME_IMAGE_RE, RESTYLE_RE, REIMAGINE_RE, ELEVATE_RE, PLACE_RE, APPLY_RECS_RE };
