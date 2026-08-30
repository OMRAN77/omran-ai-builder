/* Exact image text parsing: keeps user wording out of the image model, then the client draws it verbatim. */
(function(root){
  function firstMatch(source, regex){
    const m = regex.exec(source);
    return m ? { index:m.index, value:m[0] } : null;
  }
  function findTextMarker(source){
    let strong = firstMatch(source, /(?:أكتب|اكتب(?:ي|وا)?|مكتوب(?:ة)?\s+(?:عليها|عليه|فيها|على\s+(?:هذه\s+)?(?:الصورة|الصوره))|write)/i);
    const placed = firstMatch(source, /(?:عليها|عليه|فيها|فوقها|تتضمن|تحمل|على\s+(?:هذه\s+)?(?:الصورة|الصوره)|(?:with|containing|on\s+it)\s+)(?:\s*(?:عبارة|النص|نص|كلمة|الكلام|اسم|دعا[ءدهً]?|شعر|بيت\s+شعر|the\s+text|text|words?|name|quote)\s*)?(?=[«“"'])/i);
    if(placed && (!strong || placed.index < strong.index)) strong = placed;
    const weak = firstMatch(source, /(?:ضع|حط|أضف|اضف|ضيف|put|add)/i);
    if(!weak) return strong;
    const tail = source.slice(weak.index + weak.value.length);
    const weakIsText = /^\s*(?:لي\s+)?(?:عليها|عليه|فوقها|فيها|على\s+(?:هذه\s+)?(?:الصورة|الصوره)|النص|العبارة|الكلام|كلام|كلمة|اسمي|اسم|دعا[ءدهً]?|شعر|بيت\s+شعر|the\s+text|text|words?|name|quote)(?=\s|[:：«“"'\-–—]|$)/i.test(tail) || /[«“"']/.test(tail);
    if(!weakIsText) return strong;
    if(!strong || weak.index < strong.index) return weak;
    return strong;
  }
  function quotedValue(rest){
    const patterns = [/«([\s\S]*?)»/, /“([\s\S]*?)”/, /"([\s\S]*?)"/, /'([\s\S]*?)'/];
    let best = null;
    patterns.forEach((re) => {
      const m = re.exec(rest);
      if(m && (!best || m.index < best.index)) best = { index:m.index, whole:m[0], value:m[1] };
    });
    return best;
  }
  function textFont(source){
    if(/ديواني|diwani/i.test(source)) return 'diwani';
    if(/رقعة|رقعه|ruqaa|ruqa/i.test(source)) return 'ruqaa';
    if(/كوفي|kufi/i.test(source)) return 'kufi';
    if(/عثماني|othmani/i.test(source)) return 'othmani';
    if(/نسخ\s*نوتو|نوتو|noto\s*naskh/i.test(source)) return 'naskh2'; if(/ثلث|thuluth/i.test(source)) return 'thuluth'; if(/فارسي|نستعليق|farsi|nastaliq/i.test(source)) return 'farsi'; if(/مصحف|قرآني|quran/i.test(source)) return 'quran';
    if(/نسخ|naskh/i.test(source)) return 'naskh';
    /* v-font-pretty (طلب عمران): كل كلمة جمالية = الخط المزخرف، لا العادي */
    if(/زخرف|مزخرف|جميل|حلو[ةه]?|مرتب|أنيق|انيق|راقي|فخم|ملكي|مميز|رائع|فني|إبداعي|ابداعي|جذاب|beautiful|fancy|elegant|stylish|decorat|ornate|pretty|nice|royal|calligraph/i.test(source)) return 'diwani';
    return 'default';
  }
  function textColor(source){
    if(/أصفر|اصفر|yellow/i.test(source)) return '#ffd400';
    if(/ذهبي|ذهبية|gold/i.test(source)) return '#f4cf65';
    if(/أسود|اسود|black/i.test(source)) return '#111111';
    if(/أخضر|اخضر|green/i.test(source)) return '#2e8b57';
    if(/أزرق|ازرق|blue/i.test(source)) return '#2979ff';
    if(/أحمر|احمر|red/i.test(source)) return '#d32f2f';
    if(/بيج|beige/i.test(source)) return '#ead9bd';
    /* v-gold-overlay: «بخط جميل ومزخرف» بلا لون محدد = ذهب متدرّج (يفعّل
       المعالجة الذهبية الكاملة في الراسم — كالنموذج الذي اعتمده عمران) */
    if(/زخرف|مزخرف|جميل|حلو[ةه]?|أنيق|انيق|راقي|فخم|ملكي|مميز|رائع|beautiful|fancy|elegant|ornate|royal|decorat|calligraph/i.test(source)) return '#f4cf65';
    return '#ffffff';
  }
  // «فوق الصورة/فوقها» تعني «عليها» لا أعلاها — تُنقّى قبل قراءة الموضع.
  function stripOnImage(source){
    return String(source || '').replace(/فوق\s*(?:هذه\s*|هذي\s*|هال)?(?:الصورة|الصوره)|فوقها|فوقه|على\s*(?:هذه\s*)?(?:الصورة|الصوره)/gi, ' ');
  }
  // موضع مذكور صراحةً؟ إن لا، الرسم يختار أهدأ منطقة بنفسه.
  function positionExplicit(source){
    return /(?:أعلى|اعلى|فوق|وسط|منتصف|المنتصف|المركز|أسفل|اسفل|تحت|يمين|يسار|\btop\b|\bmiddle\b|\bcenter\b|\bbottom\b|\bright\b|\bleft\b)/i.test(stripOnImage(source));
  }
  function textPosition(input){
    const source = stripOnImage(input);
    if(/(?:في|بال|إلى|الى)?\s*(?:أعلى|اعلى|فوق)|\btop\b/i.test(source)) return 'top';
    if(/(?:في|بال)?\s*(?:وسط|منتصف|المنتصف|المركز)|\b(?:middle|center)\b/i.test(source)) return 'center';
    return 'bottom';
  }
  function cleanVisual(value){
    return String(value || '').replace(/\s*(?:و|and)\s*$/i, '').trim();
  }
  // v578: «الخلفيات عدد معيّن» — السبب كان ٣ جمل ثابتة تُرسل للمولّد حرفيًّا مع
  // كلّ نصّ، فتُنتج نفس عائلة الصور. الآن يُركَّب الوصف من أربعة أبناك مستقلّة
  // (مشهد × إضاءة × لوحة لون × عدسة) ⇒ آلاف التشكيلات، وكلّها تخلو من
  // الكليشيهات المحظورة في prayer-plan.js (قارب·غروب·مسجد·كوب·كتاب·مصباح·زيتون·برعم).
  const VIS_SCENE = {
    prayer: ['فناء طيني قديم بعد المطر وقطرات على الجدار الترابي', 'كثبان رملية ناعمة بخطوط ريح دقيقة', 'قمم جبال بازلتية يعلوها ضباب رقيق', 'حقل قمح ناضج تحرّكه نسمة خفيفة', 'ممرّ حجري ضيق بين جدارين عاليين وشعاع ضوء واحد', 'سهل واسع فارغ تحت سحاب رقيق', 'نافورة ماء ساكنة في ساحة حجرية خالية', 'أغصان نخيل عالية تُرى من الأسفل نحو السماء'],
    poetry: ['صحراء ليلية بنجوم كثيفة وأفق منخفض', 'شرفة خشبية عتيقة تطلّ على واد أخضر', 'أزقّة مدينة قديمة بأقواس متتالية', 'ورق شجر متناثر على أرض مبلّطة', 'خيمة في العراء وأثر أقدام على الرمل', 'ضباب صباحي بين أشجار سرو طويلة'],
    flirt: ['حقل زهور برية بضوء ناعم متناثر', 'قماش حريري متموّج بألوان دافئة', 'أضواء مدينة ليلية غير واضحة خلف زجاج مرشوش بالمطر', 'درج رخامي مزيّن بالورد', 'حديقة مسوّرة بياسمين متسلّق', 'فراشة ملوّنة على ساق نبات عالٍ'],
    phrase: ['قمّة جبل صخرية فوق بحر من السحاب', 'مدرّج ملعب فارغ بخطوط هندسية حادّة', 'واجهات زجاجية عالية تعكس السماء', 'طريق مستقيم يشقّ سهلًا واسعًا', 'جسر معلّق بحبال فولاذية في الضباب', 'سطح ماء أملس تنعكس عليه غيوم مضيئة']
  };
  const VIS_LIGHT = ['إضاءة جانبية حادّة تصنع ظلالًا طويلة', 'ضوء منتشر ناعم بعد الغيم', 'ضوء خلفي يرسم هالة حول الحوافّ', 'أشعة تتخلّل غبارًا معلّقًا', 'ضوء أزرق بارد قبل الشروق', 'ضوء نهاري ساطع من الأعلى', 'ظلال متقطّعة عبر مشربية', 'وميض خفيف يعكسه سطح مبلّل'];
  const VIS_PALETTE = ['ألوان ترابية هادئة', 'تباين أزرق داكن مع فضّي', 'أخضر عميق مع بنّي', 'رمادي حجري مع لمسة نحاسية', 'أبيض وبيج بلمسة رملية', 'أزرق فيروزي مع رمل فاتح', 'ألوان باردة أحادية شبه رمادية', 'أسود مطفي مع ذهبي خفيف'];
  const VIS_LENS = ['تصوير واسع الزاوية من موضع منخفض', 'منظور علوي عمودي', 'عدسة تقريب طويلة بعمق ميدان ضحل', 'مستوى النظر بتكوين متوازن', 'زاوية منخفضة تُعلي الموضوع', 'تكوين غير متمركز بمساحة فارغة واسعة'];
  function visPick(list){ return list[Math.floor(Math.random() * list.length)] || ''; }
  function fallbackVisual(kind, exactText){
    const k = (kind === 'prayer' || /(?:اللهم|ربنا|يا\s+رب)/.test(exactText || '')) ? 'prayer'
      : kind === 'poetry' ? 'poetry' : kind === 'flirt' ? 'flirt' : 'phrase';
    return 'مشهد أصيل عالي الجودة: ' + visPick(VIS_SCENE[k] || VIS_SCENE.phrase) + '، ' + visPick(VIS_LIGHT)
      + '، ' + visPick(VIS_PALETTE) + '، ' + visPick(VIS_LENS) + '، تفاصيل واقعية دقيقة، بلا أي كتابة أو حروف أو أرقام في الصورة';
  }
  function textStyleEdit(source){ if(findTextMarker(source)||!/(?:النص|الكتابة|الكتابه|الكلام|الخط|text|writing|font)/i.test(source)) return null; const color=/(?:أصفر|اصفر|ذهبي|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|أبيض|ابيض|بيج|yellow|gold|black|green|blue|red|white|beige)/i.test(source)?textColor(source):null, fontKey=/(?:ديواني|رقعة|رقعه|كوفي|عثماني|نسخ|نوتو|ثلث|فارسي|نستعليق|مصحف|قرآني|diwani|ruqaa|kufi|othmani|naskh|thuluth|farsi|nastaliq|quran)/i.test(source)?textFont(source):null, position=/(?:أعلى|اعلى|فوق|وسط|منتصف|المركز|أسفل|اسفل|تحت|top|middle|center|bottom)/i.test(source)?textPosition(source):null; return color||fontKey||position ? {color,fontKey,position} : null; }
  // تنسيق بلا ذكر «النص»: يُستخدم فقط حين توجد طبقة نصّ محفوظة على الصورة.
  function textStyleEditLoose(source){
    if(findTextMarker(source)) return null;
    const color = /(?:أصفر|اصفر|ذهبي|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|أبيض|ابيض|بيج|yellow|gold|black|green|blue|red|white|beige)/i.test(source) ? textColor(source) : null;
    const fontKey = /(?:ديواني|رقعة|رقعه|كوفي|عثماني|نسخ|نوتو|ثلث|فارسي|نستعليق|مصحف|قرآني|diwani|ruqaa|kufi|othmani|naskh|thuluth|farsi|nastaliq|quran)/i.test(source) ? textFont(source) : null;
    const position = positionExplicit(source) ? textPosition(source) : null;
    return color || fontKey || position ? { color, fontKey, position } : null;
  }
  // وصف طلب («كلام حلو»، «جمله عن النجاح») مقابل نصّ حرفيّ («عمران»).
  const KIND_HEAD_RE = /^(?:أي|اي|شي|شيء)?\s*(كلام|كلمات|كلمتين|جملة|جمله|جمل|عبارة|عباره|عبارات|كلمة|كلمه|حكمة|حكمه|اقتباس|مقولة|مقوله|بيت\s+شعر|أبيات|ابيات|قصيدة|قصيده|دعا[ءدهً]?|[أا]دعي[ةه]|شعر|غزل|تهنئة|تهنئه|معايدة|معايده|رسالة|رساله)(?=$|[\s،,.!?؟:])/;
  const DESCRIBER_RE = /(?:^|[\s،,])(?:حلو|حلوة|حلوه|حلوين|جميل|جميلة|جميله|قصير|قصيرة|قصيره|طويل|طويلة|مؤثر|مؤثرة|مؤثره|قوي|قوية|قويه|رائع|رائعة|أنيق|انيق|مناسب|مناسبة|زين|زينة|عن|nice|short|about)(?=$|[\s،,.!?؟])/;
  function looksLikeRequest(value){
    const s = String(value || '').trim();
    if(!s) return false;
    const words = s.split(/\s+/);
    if(words.length > 9) return false;
    if(/^عن(?=\s)/.test(s)) return true;
    const head = KIND_HEAD_RE.exec(s);
    if(!head) return false;
    return words.length === 1 || DESCRIBER_RE.test(s.slice(head.index + head[0].length));
  }
  function requestKind(s){
    if(/(?:شعر|قصيدة|قصيده|بيت|أبيات|ابيات)/.test(s)) return 'poetry';
    if(/(?:غزل|رومانسي)/.test(s)) return 'flirt';
    if(/(?:دعا[ءدهً]?(?![\u0621-\u064a])|[أا]دعي[ةه])/.test(s)) return 'prayer';
    return 'phrase';
  }
  // نيّة كتابة صريحة: ممنوع على مولّد الصور أن يلمس الصورة في هذه الحالة.
  function imageWriteIntent(input){
    const s = String(input || '').trim();
    if(!s) return false;
    if(/(?:خلفية|الخلفيه|ديكور|كرتون|كارتون|أزل|ازل|امسح|احذف|شيل|background|cartoon|remove|delete)/i.test(s)) return false;
    return /(?:^|[\s،,])(?:اكتب|أكتب|اكتبي|اكتبلي|write)(?=$|[\s،,.!?؟:«"'])/i.test(s)
      || /(?:^|[\s،,])(?:حط|ضع|ضيف|أضف|اضف|put|add)\s*(?:لي\s+)?(?:اسمي|اسم|كلمة|كلمه|نص|النص|عبارة|عباره|كلام|جملة|جمله|name|text)/i.test(s);
  }
  function isExplicitImageEdit(input){
    const source = String(input || '').trim();
    if(!source) return false;
    if(textStyleEdit(source) || parseImageTextSpec(source).wantsText) return true;
    if(/(?:نفس\s+(?:الصورة|الصوره)|هذه\s+(?:الصورة|الصوره)|هذي\s+(?:الصورة|الصوره)|هالصورة|هالصوره|الصورة\s+السابقة|الصوره\s+السابقه|(?:same|this|previous)\s+(?:image|picture))/i.test(source)) return true;
    const editVerb = /(?:^|[\s،,.!?؟])(?:عدل|عدّل|حرر|حرّر|غير|غيّر|بدل|بدّل|احذف|امسح|ازل|أزل|شيل|أضف|اضف|ضيف|حط|اكتب|أكتب|خل|خلي|خلّي|اجعل|سو|سوي|سوّي|حول|حوّل|زيد|قص|كبر|كبّر|صغر|صغّر)(?=$|[\s،,.!?؟]|ها)/i.test(source) || /\b(?:edit|change|modify|remove|delete|add|put|write|resize)\b/i.test(source);
    const imageRef = /(?:الصورة|الصوره|هالصورة|هالصوره|عليها|فيها|منها|لها|\S+ها(?:\s|$)|\bit\b|this\s+(?:image|picture)|the\s+(?:image|picture))/i.test(source);
    const visualTarget = /(?:الخلفية|الخلفيه|الملابس|اللبس|الشعر|الوجه|الإضاءة|الاضاءة|الألوان|الالوان|تسريح[ةه]|قص[ةه]\s+الشعر|فستان|قميص|نظار[ةه]|لحي[ةه]|شنب|مكياج|حجاب|شماغ|كندور[ةه]|قبع[ةه]|تاج|بشر[ةه]|background|outfit|clothes|hair|hairstyle|ponytail|face|lighting|colou?rs?)/i.test(source);
    return editVerb && (imageRef || visualTarget);
  }
  function autoPrayerSpec(input){
    const source = String(input || '').trim();
    if(!/(?:^|[\s،,.!?؟])(?:دعا[ءدهً]?|[أا]دعي[ةه]|شعر|قصيدة|كلام\s+(?:غزل|رومانسي)|غزل|prayer|poem|romantic\s+words?)(?=$|[\s،,.!?؟:：\-–—])/i.test(source)) return null;
    // «النص: دعاء...» أو «اكتب كلمة دعاء» يعني نصًا حرفيًا، لا طلب تأليف.
    if(/(?:النص|العبارة|الكلام|الكلمة|كلمة|text|words?)\s*(?:هو|is)?\s*[:：\-–—]?\s*(?:دعا[ءدهً]?|شعر|قصيدة|غزل|prayer|poem)(?=$|[\s،,.!?؟])/i.test(source)) return null;
    // كل نص بين علامات اقتباس يبقى حرفيًا كما كتبه المستخدم.
    if(quotedValue(source)) return null;
    return { request:source, kind:/(?:شعر|قصيدة|poem)/i.test(source)?'poetry':/(?:غزل|رومانسي|romantic)/i.test(source)?'flirt':'prayer' };
  }
  // «مع كتابة دعاء» أمرٌ للعميل لا وصفٌ للمولّد. تبقى في الوصف ⇒ المولّد يرسم
  // خطًّا عربيًّا مزيّفًا أو اسمًا تحت طبقتنا. تُنزع قبل أن يرى الطلب.
  const TYPE_ALT = 'دعا[ءدهً]?|[أا]دعي[ةه]|شعر|قصيدة|قصيده|بيت\\s+شعر|[أا]بيات|غزل|رومانسي|prayer|poem';
  const WRITE_VERB_RE = new RegExp('\\s*[،,]?\\s*(?:و\\s*)?(?:مع\\s+|وفيها\\s+|وعليها\\s+|عليها\\s+|فيها\\s+)?(?:كتابة|كتابه|اكتب(?:ي|لي)?|أكتب|تكتب|يكتب|حط|ضع|أضف|اضف|ضيف)\\s*(?:لي\\s+)?(?:عليها|عليه|فوقها|فيها)?\\s*(?:النص|نص|عبارة|عباره|كلام|كلمات|جملة|جمله)?\\s*(?:' + TYPE_ALT + ')?', 'gi');
  const WITH_TYPE_RE = new RegExp('\\s*[،,]?\\s*(?:و\\s*)?(?:مع|وفيها|وعليها|عليها|فيها|فيه|تحمل|تتضمن)\\s+(?:النص\\s+|نص\\s+|عبارة\\s+|كلام\\s+)?(?:' + TYPE_ALT + ')(?:\\s+(?:جميل|جميلة|حلو|حلوة|قصير|قصيرة|مؤثر|مؤثرة|مناسب|مناسبة))?', 'gi');
  // v576: النواة تُرجع '' حين لا يوجد تعديل بصريّ صريح — بها نميّز الطلب المركّب.
  const GENERIC_VISUAL_RE = /^(?:(?:أنشئ|انشئ|اصنع|ولد|ولّد|صمم|ارسم|create|generate|make|draw)\s*(?:لي\s*)?)?(?:صورة|صوره|image|picture)?\s*$/i;
  function visualCore(source){
    const v = cleanVisual(stripOnImage(source).replace(WRITE_VERB_RE, ' ').replace(WITH_TYPE_RE, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s،,و]+|[\s،,]+$/g, ''));
    return (!v || GENERIC_VISUAL_RE.test(v)) ? '' : v;
  }
  function authorVisual(source, kind){ return visualCore(source) || fallbackVisual(kind, null); }
  function parseImageTextSpec(input){
    const source = String(input || '').replace(/\r\n?/g, '\n');
    const styleEdit = textStyleEdit(source), autoPrayer = styleEdit ? null : autoPrayerSpec(source), marker = autoPrayer ? null : findTextMarker(source); if(styleEdit) return { wantsText:false, exactText:null, visualPrompt:'', styleEdit, styleEditLoose:styleEdit };
    if(!marker) return autoPrayer ? { wantsText:true, exactText:null, visualPrompt:authorVisual(source, autoPrayer.kind), visualEdit:visualCore(source) || null, prayerRequest:autoPrayer.request, fontKey:textFont(source), color:textColor(source), position:(/(?:يمين|right)/i.test(source)?'right-':/(?:يسار|left)/i.test(source)?'left-':'')+textPosition(source), positionAuto:!positionExplicit(source), kind:autoPrayer.kind, autoAuthored:true } : { wantsText:false, exactText:null, visualPrompt:source.trim(), fontKey:'default', color:'#ffffff', position:'bottom', styleEditLoose:textStyleEditLoose(source) };
    const literalPrayerText = /(?:النص|العبارة|الكلام|الكلمة|كلمة|text|words?)\s*(?:هو|is)?\s*[:：\-–—]?\s*(?:دعا[ءدهً]?|prayer|du[’']?a)(?=$|[\s،,.!?؟])/i.test(source.slice(marker.index));
    let rest = source.slice(marker.index + marker.value.length);
    rest = rest.replace(/^\s*(?:لي\s+)?/i, '');
    rest = rest.replace(/^\s*(?:عليها|عليه|فوقها|فيها|على\s+(?:هذه\s+)?(?:الصورة|الصوره)|فوق\s+(?:الصورة|الصوره)|on\s+(?:the\s+)?(?:image|photo|picture))\s*/i, '');
    rest = rest.replace(/^\s*(?:النص|العبارة|الكلام|الكلمة|كلمة|اسمي|اسم|the\s+text|text|words?|name|quote)?\s*(?:هو|وهو|التالي|is)?\s*[:：\-–—]?\s*/i, '');
    let kind = '';
    const kindMatch = rest.match(/^\s*(دعا[ءدهً]?|الشعر|شعر|بيت\s+شعر|قصيدة)(?=\s|[:：\-–—]|$)\s*[:：\-–—]?\s*/i);
    if(kindMatch && !literalPrayerText){
      kind = /دعاء/i.test(kindMatch[1]) ? 'prayer' : 'poetry';
      rest = rest.slice(kindMatch[0].length);
    }
    const quoted = quotedValue(rest);
    let exactText = null, suffix = '', styleSource = '';
    if(quoted){
      exactText = quoted.value;
      suffix = rest.slice(quoted.index + quoted.whole.length);
      styleSource = rest.slice(0, quoted.index) + ' ' + suffix;
    }else{
      /* v-name-swap: «ويكون بخط حلو وزخرف» ذيل تنسيق لا جزء من النصّ —
         نسمح بقائد (ويكون/خليه) وبأوصاف زخرفة متلاحقة بعد اسم الخط. */
      const styleTail = rest.match(/\s+(?:،|,)?\s*(?:و?\s*(?:يكون|خليه|خله|اجعله)\s+)?(?:(?:بخط|بالخط)\s+\S+(?:\s+و?(?:م?زخرف[ةه]?|حلو[ةه]?|جميل[ةه]?|أنيق[ةه]?|انيق[ةه]?|مرتب[ةه]?|راقي[ةه]?|فخم[ةه]?|رائع[ةه]?|مميز[ةه]?|ملكي[ةه]?|فني[ةه]?|جذاب[ةه]?|ذهبي(?:ة)?|أبيض|ابيض|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|بيج|gold|white|black|green|blue|red|beige))*|(?:بلون|باللون|لون\s+النص)\s+\S+|(?:واجعل|اجعل|وخلي|خلي)\s+النص\s+(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|الوسط|المنتصف|الأسفل|الاسفل))(?:\s+(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|فوق|الوسط|المنتصف|المركز|الأسفل|الاسفل))?\s*$/i);
      if(styleTail && styleTail.index >= 0){ suffix = rest.slice(styleTail.index); rest = rest.slice(0, styleTail.index); }
      styleSource = suffix;
      // ذيل «على الصورة / فوق الصورة» ليس جزءًا من النصّ المكتوب.
      // v576: ذيل «بدون تغيير الصورة» طلبٌ لا نصّ — يُنزع قبل الطباعة.
      exactText = rest.trim().replace(/\s*(?:،|,)?\s*(?:بدون|بلا|دون|من\s+غير)\s*(?:أي\s*)?(?:تغيير|تغير|تعديل|مساس|لمس)(?:\s*(?:في|على|ل)?\s*(?:الصورة|الصوره))?\s*$/i, '').replace(/\s*(?:،|,)?\s*(?:على|فوق|في)\s*(?:هذه\s*|هذي\s*|هال)?(?:الصورة|الصوره)(?:\s*نفسها)?\s*$/i, '').trim();
    }
    if(exactText == null || !exactText.trim() || /^(?:دعا[ءدهً]?|شعر|بيت\s+شعر|قصيدة|نص|كلام|prayer|poem|text)$/i.test(exactText.trim())){
      if(!kind && exactText && exactText.trim()) kind = requestKind(exactText.trim());
      exactText = null;
    }else if(!quoted && !literalPrayerText && looksLikeRequest(exactText)){
      // «اكتب كلام حلو» = طلب تأليف، لا نصّ يُطبَع حرفيًّا.
      if(!kind) kind = requestKind(exactText);
      exactText = null;
    }
    let visualPrompt = cleanVisual(source.slice(0, marker.index));
    const visualSuffix = suffix.replace(/(?:بخط|بالخط)\s+\S+(?:\s+(?:ذهبي(?:ة)?|أبيض|ابيض|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|بيج|gold|white|black|green|blue|red|beige))?|(?:بلون|باللون|لون\s+النص)\s+\S+|(?:واجعل|اجعل|وخلي|خلي)\s+النص\s+(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|الوسط|المنتصف|الأسفل|الاسفل)|(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|فوق|الوسط|المنتصف|المركز|الأسفل|الاسفل)|(?:on|in)\s+(?:the\s+)?(?:image|photo|picture|top|middle|center|bottom)/gi, '').replace(/^[\s،,و]+|[\s،,]+$/g, '');
    if(visualSuffix) visualPrompt = (visualPrompt + ' ' + visualSuffix).trim();
    const visualEdit = (!visualPrompt || GENERIC_VISUAL_RE.test(visualPrompt)) ? null : visualPrompt;
    if(!visualEdit) visualPrompt = fallbackVisual(kind, exactText);
    return { wantsText:true, exactText, visualPrompt, visualEdit, fontKey:textFont(styleSource), color:textColor(styleSource), position:(/(?:يمين|right)/i.test(styleSource)?'right-':/(?:يسار|left)/i.test(styleSource)?'left-':'')+textPosition(styleSource), positionAuto:!positionExplicit(styleSource), kind, prayerRequest:!exactText&&kind?source:undefined, autoAuthored:!exactText&&kind?true:undefined };
  }
  root.__parseImageTextSpec = parseImageTextSpec;
  root.__isExplicitImageEdit = isExplicitImageEdit;
  root.__imageWriteIntent = imageWriteIntent;
  if(typeof module !== 'undefined' && module.exports) module.exports = { parseImageTextSpec, isExplicitImageEdit, imageWriteIntent };
})(typeof window !== 'undefined' ? window : globalThis);
