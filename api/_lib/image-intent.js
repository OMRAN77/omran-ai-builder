'use strict';
/* image-intent.js — نيّات تعديل الصورة في مكان واحد قابل للاختبار.
   v-nano-pro-edit (المالك ٥ سبتمبر: «عندي نانو وجيمي وكل المفاتيح وآخر شي النتيجة صفر —
   الصورة المزخرفة من نانو والثانية من التطبيق»): طلبات «أقوى/أفخم/أرقى/طوّرها/حسّنها»
   كانت تُصنَّف نصفها تعديلًا موضعيًّا (لا تغيّر شيئًا) ونصفها ترقية مشهد لغرفة، فلا يصل
   شيء منها إلى المحرّك الإبداعي. هنا: قاموس واحد لكل نيّة، يُقرأ من نصّ المستخدم نفسه
   (userText) لا من الأمر الذي أعاد النموذج صياغته بالإنجليزية.
   تنبيه: \b في JavaScript حدّ كلمات لاتينيّ فقط — لا يعمل بعد حرف عربي؛ الحدود العربية هنا
   دائمًا (?:^|[\s،,]) قبل الكلمة و(?=$|[\s،,.!؟?]) بعدها. */

const END = '(?=$|[\\s،,.!؟?])';

/* «نفس الصورة/زيها بالضبط» — والإنجليزية بعبارات كاملة كي لا تلتقط «Keep layout identical» في أوامر الديكور */
const SAME_IMAGE_RE = /نفس\s*الصور[ةه]|زيها\s*بالضبط|طبق\s*الأصل|بالضبط\s*نفس|كما\s*هي|\bsame\s+(?:image|picture|photo)\b|\bexact(?:ly)?\s+(?:the\s+)?same\b|\bidentical\s+(?:image|picture|photo|copy)\b|\bidentical\s+to\s+the\s+(?:source|original)\b|\bkeep\s+(?:it|everything)\s+(?:exactly\s+)?(?:the\s+same|identical|as\s+is)\b/i;

/* «عدل 3d» / «حوّلها كرتون» / «ستايل أنيمي» = تحويل أسلوب كامل لا تعديل موضعي.
   ألوان «رصاصي/زيتي/مائي» ليست أساليب — الأسلوب فقط في «رسم (بقلم) رصاص/لوحة زيتية/ألوان مائية» بحروف الجرّ.
   الإنجليزية: أوامر الديكور المهندسة («Redesign this room… / architectural render»)، و«make it in a … style»،
   و«turn/convert it into a … style|look|painting» — لا «turn the image upside down» ولا «convert it to png». */
const EN_WHOLE = '(?:it|this|the\\s+(?:whole\\s+|entire\\s+)?(?:image|picture|photo|card|design|scene|room|interior|space|restaurant|house|kitchen|office|shop|place|cafe|garden))';
const RESTYLE_RE = new RegExp([
  '(^|[\\s،,])(3d|ثلاثي|مجسم|مجسّم|كرتون|كارتون|أنيمي|انمي|بيكسار|ديزني|بكسل|بيكسل|سايبر|نيون|كوميك|كومكس|مانجا|فانتازيا|واقعي|اسكتش|سكتش|anime|cartoon|pixar|disney|pixel\\s*art|cyberpunk|neon\\s*(?:style|look|art)|comic|manga|fantasy|watercolor|oil\\s*paint(?:ing)?|sketch|realistic|3d\\s*render)(?:ي[ةه]?|[ةه]|ات)?' + END,
  '(?:^|[\\s،,])(?:ب|ل|لل|بال|كال)?(?:رسم[ةه]?|لوح[ةه])\\s*(?:ب)?(?:قلم\\s*)?(?:ال)?رصاص(?:ي[ةه]?)?' + END,
  '(?:^|[\\s،,])(?:ب|ل|لل|بال|كال)?(?:لوح[ةه]|رسم[ةه]?|ألوان|الوان|أسلوب|اسلوب|ستايل|طابع)\\s*(?:ال)?(?:زيتي[ةه]?|مائي[ةه]?)' + END,
  '\\b(?:redesign|restyle|re-?render|repaint|redraw)\\s+' + EN_WHOLE + '\\b',
  '\\b(?:transform|convert|turn|make|render|draw|paint|do)\\s+' + EN_WHOLE + '\\s+(?:into|to|in|as)\\s+(?:a|an|the)?\\s*(?!same\\b|similar\\b|current\\b)[A-Za-z-]+(?:\\s+[A-Za-z-]+){0,3}\\s+(?:style|look|painting|drawing|illustration|render(?:ing)?|artwork)\\b',
  '^\\s*(?:in\\s+)?(?:a|an)?\\s*(?!same\\b|similar\\b|current\\b)[A-Za-z-]+(?:\\s+[A-Za-z-]+){0,2}\\s+style\\s*[.!]*\\s*$',
  '\\b(?:architectural|photorealistic|cinematic)\\s+render(?:ing)?\\b',
].join('|'), 'i');

/* «فكرة ثانية/مختلفة» = مشهد جديد كليًّا من الموضوع نفسه */
const REIMAGINE_RE = /فكرة\s*(ثانية|ثانيه|مختلفة|مختلفه|جديدة|جديده|غير)|فكره\s*(ثانية|ثانيه|مختلفة|مختلفه|جديدة|جديده|غير)|غيّ?ر\s*الفكرة|بشكل\s*مختلف\s*تمام|مختلف\s*تمام|تصميم\s*ثاني|ستايل\s*ثاني|بدّ?ل\s*(الفكرة|التصميم|الستايل)|different\s*(idea|concept|style)|new\s*concept|another\s*(idea|take|concept)|reimagine/i;

/* عناصر الصورة (مؤنّث/مذكّر — للتوافق مع ضمير «خلها/خله»)، بلواحق الملكية وتاء مربوطة تصير تاءً قبلها («خلفيتها») */
const AR_SUF = '(?:ي|نا|ك|كم|ها|ه)?';
const AR_PRE = '(?:ال|لل|بال|وال|ول|ب|ل)?';
const AR_NOUN_F = '(?:خلفي[ةهت]|كلم[ةهت]|كلمات|جمل[ةهت]|عبار[ةهت]|إضاء[ةهت]|اضاء[ةهت]|أيقون[ةهت]|ايقون[ةهت]|أيقونات|ايقونات|حاف[ةهت]|زاوي[ةهت]|منطق[ةهت]|جه[ةهت]|سماء|سما|غيوم|قب[ةهت]|مئذن[ةهت]|ابتسام[ةهت]|نظار[ةهت]|سيار[ةهت]|طاول[ةهت]|أرضي[ةهت]|ارضي[ةهت]|نافذ[ةهت]|لمس[ةهت]|لمسات|ألوان|الوان|أسماء|اسماء|أرقام|ارقام|حدود|ظلال|أشجار|اشجار|نجوم|عيون|عين|شمس|ملابس)';
const AR_NOUN_M = '(?:إطار|اطار|برواز|خط|نص|اسم|رقم|تاريخ|لون|شعار|لوجو|عنوان|نور|ظل|توهج|تأثير|فلتر|زر|جزء|شجر|نخل|قمر|وجه|شعر|فم|قميص|فستان|ثوب|شماغ|كرسي|جدار|سقف|باب|شباك)';
const AR_NOUN_ANY = '(?:' + AR_NOUN_F + '|' + AR_NOUN_M + ')';

/* «أقوى/أفخم/أرقى/أجمل/أبدع/طوّرها/حسّنها/زخرفها/نسخة أفضل…» = الفكرة نفسها مرفوعة بقوة.
   صيغ التفضيل العربية تُلتقط بجذرها (أ/ا/إ + قوى|فخم|رقى|جمل|حلى|روع|بدع|حسن|فضل|بهى|بهر|شيك)
   بحرف الهمزة أو بدونه، مع أو بدون «نسخة/خلها/سوها/من هذي».
   «أفضّل لو/أن تغيّر…» (أُفضّل = I prefer) و«أفضل لونها أزرق» و«أجمل خط» (الصفة تصف الاسم بعدها) ليست ترقية. */
const AR_ELATIVE = '(?:أ|ا|إ)(?:قوى|قوي|فخم|رقى|رقي|جمل|حلى|حلا|روع|بدع|حسن|فضل|بهى|بهر|شيك)';
/* الاسم مباشرة بعد الصفة (بلا حرف جرّ) = الصفة تصفه: «أفضل لونها» «أجمل خط»؛ أمّا «أفخم بالألوان» فجانب لا مفعول */
const AR_NOT_ELEMENT_NEXT = '(?!\\s+(?:ال)?' + AR_NOUN_ANY + AR_SUF + END + ')';
const AR_NOT_PREFER = '(?!\\s+(?:ال\\S|(?:لو|أن|ان|إن|إنك|انك|إنه|انه)(?=[\\s،,]|$)|تخل|تسو|تغي|تحط|تكتب|تشيل|تضيف|تحذف))' + AR_NOT_ELEMENT_NEXT;
const AR_ELEVATE_ADJ = '(?:فخم[ةه]?|فخام[ةه]|راقي[ةه]?|رايق[ةه]?|خيالي[ةه]?|جبار[ةه]?|مبهر[ةه]?|احترافي[ةه]?|إبداعي[ةه]?|ابداعي[ةه]?|تجنن|لايق[ةه]?)';
const AR_ELEVATE_VERBS = '(?:[اأ]?(?:طوّ?ر|حسّ?ن|جمّ?ل|قوّ?|رقّ?|زيّ?ن|عزّ?ز|زخرف|فخّ?م)|ارفع|إرفع|ارتقِ?|ابهر|أبهر)';
const AR_WHOLE_OBJ = '(?:ال)?(?:صور[ةه]|كرت|بطاق[ةه]|تصميم|شكل|مستوى|مستواها|جودتها|جودة\\s*الصور[ةه]|النتيجة)';
const EN_ELEMENT = '(?:text|name|logo|title|font|background|frame|border|button|icon|caption|date|number|word|headline|slogan|price|color|colour)';
const ELEVATE_RE = new RegExp([
  /* أقوى / نسخة أفخم / خلها أرقى / سوها أجمل / أفضل من هذي */
  '(?:^|[\\s،,])(?:(?:نسخ[ةه]|صور[ةه]|شكل|تصميم|كرت|بطاق[ةه])\\s*)?(?:خلّ?ي?ها|خلّ?ي?ه|سوّ?ي?ها|سوّ?ي?ه|اجعلها|اجعله|صيّ?رها|عطني|أعطني|اعطني|ابي|أبي|ابغى|أبغى|ابغي|أبغي|أريد|اريد|ودي|ودّي|هات)?\\s*(?:نسخ[ةه]\\s*)?(?:ال)?' + AR_ELATIVE + AR_NOT_PREFER + '(?=$|[\\s،,.!؟?]|\\s*(?:من|بكثير|شوي|شوية|أكثر|اكثر|كثير|مرة))',
  /* فخم / فخمة / راقية / احترافية أكثر / خيالية / جبارة / مبهرة / تجنن / لايقة — لا «فخم الإطار» (فعل على عنصر) */
  '(?:^|[\\s،,])' + AR_ELEVATE_ADJ + '(?:\\s*(?:أكثر|اكثر))?' + AR_NOT_ELEMENT_NEXT + END,
  /* طوّرها / حسّنها / جمّلها / زخرفها / فخّمها / ابهرني / ارفع مستواها / حسّن الكرت —
     الفعل يُعدّ ترقية إن كان مفعوله الصورة كلها (ضمير أو «الصورة/الكرت/المستوى»)؛
     «حسّن الإضاءة» و«طوّر الخط» تعديلان موضعيان يبقيان في مسارهما. */
  '(?:^|[\\s،,])' + AR_ELEVATE_VERBS + '(?:(?:ها|ه|يها|يه|ي|ني)' + END + '|\\s*' + AR_WHOLE_OBJ + END + ')',
  /* الفعل بلا مفعول = الرسالة كلها فقط («حسن» / «طور») — لا «اكتب اسم حسن» ولا «الاسم زين» */
  '^\\s*' + AR_ELEVATE_VERBS + '\\s*[،,.!؟?]*\\s*$',
  /* زوّد الزخارف / زيد الفخامة / زود زخارف / زيد جمال الصورة — لا «زيد جمال» (اسم) */
  '(?:^|[\\s،,])(?:زوّ?د|زيد|كثّ?ر|ضاعف)\\s*(?:ال(?:زخارف|زخرف[ةه]|تفاصيل|إبداع|ابداع|جمال|فخام[ةه]|إبهار|ابهار|روع[ةه])|(?:زخارف|تفاصيل|فخام[ةه]|روع[ةه])(?:ها|ه)?|جمال(?:ها|ه|\\s+' + AR_WHOLE_OBJ + '))' + END,
  /* الإنجليزية: الصفة تُعدّ ترقية للصورة كلها فقط (make it …/… version/رسالة قصيرة من الصفة وحدها) —
     «make the text bolder» و«add a premium badge» و«give the title a bolder look» و«a bolder version of the logo» تعديلات موضعية. */
  '\\bmake\\s+(?:it|this|everything|the\\s+(?:whole\\s+|entire\\s+)?(?:image|picture|photo|card|design|scene|look))\\s+(?:much\\s+|way\\s+|a\\s+lot\\s+)?(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|pop|shine|stand\\s*out|more\\s+\\w+)\\b',
  '(?<!\\b(?:give|make|get)\\s+(?:the\\s+|my\\s+|this\\s+)?' + EN_ELEMENT + '\\s+(?:a\\s+|an\\s+)?)\\b(?:a\\s+|an\\s+)?(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|enhanced|improved|upgraded|elevated|polished|cleaner|more\\s+(?:powerful|impressive|beautiful|elegant|luxurious|professional|premium|polished|refined|dramatic|striking|attractive))(?:,?\\s+(?:and\\s+)?(?:more\\s+\\w+|\\w+er))*\\s+(?:version|look|take|edition|rendition|variant)\\b(?!\\s+(?:of|for)\\s+(?:the\\s+|my\\s+|this\\s+)?' + EN_ELEMENT + '\\b)',
  '^\\s*(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|more\\s+\\w+)\\s*[.!]*\\s*$',
  '\\b(?:level\\s*up|glow\\s*up|next\\s*level|better\\s+than\\s+(?:this|that|the\\s+original)|best\\s+version|higher\\s+quality|plus\\s+it|(?:enhance|improve|upgrade|elevate|polish)\\s+(?:it|this|everything|overall|the\\s+(?:whole\\s+|entire\\s+|overall\\s+)?(?:image|picture|photo|card|design|scene|look|quality|result)))\\b',
].join('|'), 'i');

/* الصفة تصف عنصرًا واحدًا حين تلي اسمَه (ولو بكلمة أو كلمتين بينهما): «حط إطار (ذهبي) أفخم» / «اجعل الخلفية
   أجمل» / «ضيف لمسة فخمة» / «بخط احترافي» / «عدل الخط وخله أجمل» / «خلفيتها أجمل» — تعديلات موضعية.
   الضمير المؤنّث «خلها» بعد اسم مذكّر («غير الخط وخلها أقوى») يعود على الصورة لا على العنصر. */
const FEM_PRON = '(?:و?(?:خلّ?ي?ها|اجعلها|سوّ?ي?ها|صيّ?رها))';
const MASC_PRON = '(?:و?(?:خلّ?ي?ه|اجعله|سوّ?ي?ه|صيّ?ره))';
const MID = '(?:(?!' + FEM_PRON + '\\s)(?!' + MASC_PRON + '\\s)\\S+\\s+){0,2}?';
const ADJ_ANY = '(?:ال)?(?:' + AR_ELATIVE + '|' + AR_ELEVATE_ADJ + ')' + END;
const LOCAL_ELATIVE_SRC = '(?:^|[\\s،,])' + AR_PRE + '(?:' + AR_NOUN_F + AR_SUF + '\\s+' + MID + '(?:' + FEM_PRON + '\\s+)?|' + AR_NOUN_M + AR_SUF + '\\s+' + MID + '(?:' + MASC_PRON + '\\s+)?)' + ADJ_ANY;
const LOCAL_ELATIVE_RE = new RegExp(LOCAL_ELATIVE_SRC, 'i');
const LOCAL_ELATIVE_G = new RegExp(LOCAL_ELATIVE_SRC, 'gi');
/* علامات «الصورة كلها» التي تغلب بوّابة العنصر: الصفة تتصدّر الطلب («أقوى وحط إطار أفخم»)، أو فعل بضمير الصورة
   («طوّرها»)، أو «خلها أفخم» خارج أي عنصر، أو «الصورة كلها». */
const LEAD_ELEVATE_RE = new RegExp('^\\s*(?:(?:ابي|أبي|ابغى|أبغى|ابغي|أبغي|أبيها|ابيها|أبغاها|ابغاها|أريد|اريد|ودي|ودّي|عطني|أعطني|اعطني|هات|ممكن|لو\\s*سمحت|سو|سوي|سوّي|سولي|سوّلي|خل|خلي|خلها|خليها|خلّها|خلّيها|خله|اجعلها|صيرها|صيّرها|طلع|طلّع|طلعلي)\\s*(?:لي\\s*)?)*(?:(?:نسخ[ةه]|صور[ةه]|شكل|تصميم|كرت|بطاق[ةه]|شي|شيء|الكرت|الصور[ةه]|التصميم|البطاق[ةه])\\s*)?(?:ال)?(?:' + AR_ELATIVE + '|' + AR_ELEVATE_ADJ + ')' + END, 'i');
const VERB_PRON_RE = new RegExp('(?:^|[\\s،,])' + AR_ELEVATE_VERBS + '(?:ها|ه|يها|يه|ي|ني)' + END, 'i');
const FEM_MARKER_RE = new RegExp('(?:^|[\\s،,])' + FEM_PRON + '\\s+' + ADJ_ANY, 'i');
const WHOLE_RE = /(?:^|[\s،,])(?:ال)?(?:صور[ةه]|كرت|بطاق[ةه]|تصميم)\s+(?:كلها|كله|كاملة|كامل)(?=$|[\s،,.!؟?])/i;

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
  let elevate = false;
  if (!restyle && !reimagine && !sameImage && ELEVATE_RE.test(s)) {
    elevate = !LOCAL_ELATIVE_RE.test(s) || LEAD_ELEVATE_RE.test(s) || VERB_PRON_RE.test(s) || WHOLE_RE.test(s)
      || FEM_MARKER_RE.test(s.replace(LOCAL_ELATIVE_G, ' '));
  }
  const placeUpgradeHint = PLACE_RE.test(s) || APPLY_RECS_RE.test(s);
  return { sameImage, restyle, reimagine, elevate, placeUpgradeHint };
}

module.exports = { detectEditIntent, SAME_IMAGE_RE, RESTYLE_RE, REIMAGINE_RE, ELEVATE_RE, LOCAL_ELATIVE_RE, LEAD_ELEVATE_RE, PLACE_RE, APPLY_RECS_RE };
