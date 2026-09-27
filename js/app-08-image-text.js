/* Exact image text parsing: keeps user wording out of the image model, then the client draws it verbatim. */
(function(root){
  function firstMatch(source, regex){
    const m = regex.exec(source);
    return m ? { index:m.index, value:m[0] } : null;
  }
  function findTextMarker(source){
    let strong = firstMatch(source, /(?:أكتب|اكتب(?:ي|وا)?|مكتوب(?:ة)?\s+(?:عليها|عليه|فيها|على\s+(?:هذه\s+)?(?:الصورة|الصوره))|write)/i);
    const placed = firstMatch(source, /(?:عليها|عليه|فيها|فوقها|تتضمن|تحمل|على\s+(?:هذه\s+)?(?:الصورة|الصوره)|(?:with|containing|on\s+it)\s+)(?:\s*(?:عبارة|النص|نص|كلمة|الكلام|اسم|دعا[ءدهً]?|شعر|بيت\s+شعر|the\s+text|text|words?|name|quote)\s*)?\s*(?=[«“"'])/i);
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
  /* v-text-colors (لقطة المالك: «اكتب حبيبه قلبي بخط لونه وردي» خرجت بيضاء — «وردي» لم يكن لونًا معروفًا، وكلّ قاعدة
     كانت تحمل قائمة ألوانها الخاصّة): خريطة واحدة تقرؤها textColor وتعديل التنسيق وذيل الأسلوب. كلمات كاملة لا مقاطع
     («ابني» ليست «بني»، و«hundred» ليست «red»)، بسوابق «ب/بال/ال/و». الترتيب مهمّ: «وردي فاتح» قبل «وردي»، و«سماوي» قبل «أزرق». */
  const TEXT_COLORS = [
    ['أصفر|اصفر|صفراء|yellow', '#ffd400'],
    ['ذهبي|ذهبية|ذهبيه|golden|gold', '#f4cf65'],
    ['أسود|اسود|سوداء|black', '#111111'],
    ['أخضر|اخضر|خضراء|green', '#2e8b57'],
    ['سماوي|سماويه|سماوية|لبني|(?:أزرق|ازرق)\\s+فاتح|sky\\s*blue|light\\s*blue', '#5ec8ff'],
    ['كحلي|كحليه|كحلية|navy', '#1c2f66'],
    ['أزرق|ازرق|زرقاء|blue', '#2979ff'],
    ['وردي\\s+(?:فاتح|خفيف|هادي|هادئ)|light\\s*pink', '#ffb3d1'],
    ['وردي|ورديه|وردية|زهري|زهريه|زهرية|بمبي|بينك|pink', '#ff4f9a'],
    ['بنفسجي|بنفسجيه|بنفسجية|موف|ليلكي|purple|violet|lilac', '#a05ad6'],
    ['برتقالي|برتقاليه|برتقالية|orange', '#ff8a1f'],
    ['عنابي|عنابيه|عنابية|خمري|maroon|burgundy', '#8e1b3a'],
    ['أحمر|احمر|حمراء|red', '#d32f2f'],
    ['تركوازي|تركواز|فيروزي|turquoise|teal', '#18b6a4'],
    ['فضي|فضيه|فضية|silver', '#d7dbe0'],
    ['رمادي|رماديه|رمادية|رصاصي|gr[ae]y', '#9aa0a6'],
    ['بني|بنيه|بنية|brown', '#8b5a2b'],
    ['بيج|beige', '#ead9bd'],
    ['أبيض|ابيض|بيضاء|white', '#fdfdfd'] /* أبيض صريح ≠ الافتراضيّ: لا يصير ذهبًا مع الخطّ المزخرف، ويغلب لون الكتابة السابقة */
  ];
  const COLOR_WORD = '(?:' + TEXT_COLORS.map(function(c){ return c[0]; }).join('|') + ')';
  const colorWordRe = function(alt){ return new RegExp('(?:^|[^\\u0621-\\u064Aa-z])(?:و)?(?:بال|ال|ب|باللون\\s+ال|باللون\\s+|بلون\\s+)?(?:' + alt + ')(?=$|[^\\u0621-\\u064Aa-z])', 'i'); };
  const COLOR_RES = TEXT_COLORS.map(function(c){ return [colorWordRe(c[0]), c[1]]; });
  const ANY_COLOR_RE = colorWordRe(COLOR_WORD.slice(3, -1));
  function hasColorWord(source){ return ANY_COLOR_RE.test(String(source || '')); }
  function hasColorOrSize(source){ return hasColorWord(source) || !!textSize(source); }
  function textColor(source){
    const s = String(source || '');
    for(let i = 0; i < COLOR_RES.length; i++) if(COLOR_RES[i][0].test(s)) return COLOR_RES[i][1];
    /* v-gold-overlay: «بخط جميل ومزخرف» بلا لون محدد = ذهب متدرّج (يفعّل
       المعالجة الذهبية الكاملة في الراسم — كالنموذج الذي اعتمده عمران) */
    if(/زخرف|مزخرف|جميل|حلو[ةه]?|أنيق|انيق|راقي|فخم|ملكي|مميز|رائع|beautiful|fancy|elegant|ornate|royal|decorat|calligraph/i.test(s)) return '#f4cf65';
    return '#ffffff';
  }
  /* v-text-size (نفس اللقطة: «بخط صغير» طُبعت كلامًا — الحجم لم يكن يُقرأ أصلًا). مقارنة («أصغر/كبّر») قبل المطلق («صغير»). */
  const AR_B = '(?:^|[^\\u0621-\\u064Aa-z])', AR_E = '(?=$|[^\\u0621-\\u064Aa-z])';
  const SIZE_SMALLER_RE = new RegExp(AR_B + '(?:و)?(?:أصغر|اصغر|صغّ?ر|صغّ?ري|صغّ?روا|smaller|shrink)' + AR_E, 'i');
  const SIZE_LARGER_RE = new RegExp(AR_B + '(?:و)?(?:أكبر|اكبر|كبّ?ر|كبّ?ري|كبّ?روا|bigger|larger|enlarge)' + AR_E, 'i');
  const SIZE_SMALL_RE = new RegExp(AR_B + '(?:و)?(?:ب)?(?:صغير|صغيره|صغيرة|small|tiny)' + AR_E, 'i');
  const SIZE_LARGE_RE = new RegExp(AR_B + '(?:و)?(?:ب)?(?:كبير|كبيره|كبيرة|ضخم|ضخمه|ضخمة|عريض|عريضه|عريضة|big|large|huge)' + AR_E, 'i');
  function textSize(source){
    const s = String(source || '');
    if(SIZE_SMALLER_RE.test(s)) return 'smaller';
    if(SIZE_LARGER_RE.test(s)) return 'larger';
    if(SIZE_SMALL_RE.test(s)) return 'small';
    if(SIZE_LARGE_RE.test(s)) return 'large';
    return null;
  }
  /* «جولة تنسيق»: فاتح («بخط/بلون/لونه/بالوردي») ثمّ كلمات وصفه المتتالية (ألوان، فاتح/غامق، أحجام، زخرفة، أسماء خطوط).
     ما بعدها نصٌّ أو وصفُ مشهد — «اكتب بخط وردي حبيبة قلبي» نصّها «حبيبة قلبي»، و«بخط لونه وردي والخلفية زرقاء» لون كتابتها
     ورديّ لا أزرق (مراجعة #804). */
  const STYLE_LEAD_TOKEN = new RegExp('^(?:و)?(?:(?:ا?يكون)|بخط|بالخط|بلون|باللون|ب?لونه|ب?لونها|(?:بال|ب)(?:' + COLOR_WORD.slice(3, -1) + ')[ةه]?)$', 'i');
  const STYLE_WORD_TOKEN = new RegExp('^(?:و)?(?:بال|ال|ب)?(?:' + COLOR_WORD.slice(3, -1) + '|فاتح|غامق|خفيف|هادي|هادئ|صغير[ةه]?|كبير[ةه]?|أصغر|اصغر|أكبر|اكبر|عريض[ةه]?|ضخم[ةه]?|م?زخرف[ةه]?|زخرفي|حلو[ةه]?|جميل[ةه]?|أنيق[ةه]?|انيق[ةه]?|فخم[ةه]?|راقي[ةه]?|مرتب[ةه]?|ملكي|فني|ديواني|رقع[ةه]|كوفي|عثماني|نسخ|ثلث|فارسي|نستعليق|مصحف|قرآني|نوتو|لون|اللون|لونه|لونها|خط|الخط)$', 'i');
  function splitStyleRuns(value){
    const toks = String(value || '').trim().split(/\s+/).filter(Boolean), keep = [], style = [];
    for(let i = 0; i < toks.length; i++){
      const lead = STYLE_LEAD_TOKEN.test(toks[i]) && !(/^و?ا?يكون$/.test(toks[i]) && !(toks[i + 1] && STYLE_LEAD_TOKEN.test(toks[i + 1])));
      if(!lead){ keep.push(toks[i]); continue; }
      style.push(toks[i]);
      while(i + 1 < toks.length && (STYLE_WORD_TOKEN.test(toks[i + 1]) || /^و$/.test(toks[i + 1]) && toks[i + 2] && STYLE_WORD_TOKEN.test(toks[i + 2]))) style.push(toks[++i]);
    }
    return { style: style.join(' '), rest: keep.join(' ') };
  }
  /* الجولة الأولى وحدها إن بدأ بها الكلام — «بخط وردي حبيبة قلبي بخط كبير»: الجولة «بخط وردي» والباقي نصّ وذيله. */
  function leadingStyleRun(value){
    const toks = String(value || '').trim().split(/\s+/).filter(Boolean);
    if(!toks.length || !STYLE_LEAD_TOKEN.test(toks[0]) || /^و?ا?يكون$/.test(toks[0])) return null;
    let i = 1;
    while(i < toks.length && (STYLE_WORD_TOKEN.test(toks[i]) || /^و$/.test(toks[i]) && toks[i + 1] && STYLE_WORD_TOKEN.test(toks[i + 1]))) i++;
    return { style: toks.slice(0, i).join(' '), rest: toks.slice(i).join(' ') };
  }
  /* كلمات التنسيق وحدها (لون/حجم/زخرفة/«خط») — ذيلٌ لا يبقى منه شيء بعد نزعها ليس وصف مشهد. */
  const STYLE_WORDS_RE = new RegExp('(?:^|\\s)(?:و)?(?:بال|ال|ب|باللون\\s+ال|بلون\\s+)?(?:' + COLOR_WORD.slice(3, -1) + '|صغير[ةه]?|كبير[ةه]?|أصغر|اصغر|أكبر|اكبر|عريض[ةه]?|ضخم[ةه]?|م?زخرف[ةه]?|زخرفي|حلو[ةه]?|جميل[ةه]?|أنيق[ةه]?|انيق[ةه]?|فخم[ةه]?|خط)(?=\\s|$)', 'gi');
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
  function textPlacement(input){
    const source = stripOnImage(input);
    const side = /(?:يمين|\bright\b)/i.test(source) ? 'right' : (/(?:يسار|\bleft\b)/i.test(source) ? 'left' : '');
    const verticalNamed = /(?:أعلى|اعلى|فوق|وسط|منتصف|المنتصف|المركز|أسفل|اسفل|تحت|\btop\b|\bmiddle\b|\bcenter\b|\bbottom\b)/i.test(source);
    const vertical = side && !verticalNamed ? 'center' : textPosition(source);
    return side ? side + '-' + vertical : vertical;
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
    phrase: ['قمّة جبل صخرية فوق بحر من السحاب', 'مدرّج ملعب فارغ بخطوط هندسية حادّة', 'واجهات زجاجية عالية تعكس السماء', 'طريق مستقيم يشقّ سهلًا واسعًا', 'جسر معلّق بحبال فولاذية في الضباب', 'سطح ماء أملس تنعكس عليه غيوم مضيئة'],
    /* v-condolence-scene (فيديو المالك مقابل ChatGPT: عبارة عزاء بلا وصف كانت تأخذ مشهد «عبارة» عامًّا — ملعب، جسر).
       بنك التعزية وحده يستعمل الفانوس والوردة البيضاء: رموز عزاء لا كليشيه دعاء، ولا يمرّ بمخطّط الأدعية. */
    condolence: ['وردة بيضاء واحدة على حجر داكن في ضوء خافت', 'غصن جافّ على قماش رمادي هادئ', 'مقبرة بسيطة بشواهد حجرية بعيدة وسماء غائمة', 'فانوس صغير مطفأ الضوء بجانب زهرة ذابلة', 'طريق ترابي فارغ في ضباب الفجر', 'قطرات مطر على زجاج نافذة وخلفها أفق رمادي']
  };
  // كلمات عزاء كاملة لا مقاطع: لا «الأعزاء» ولا تحيّة «ورحمة الله» ولا «حجاجنا راجعون». التشكيل يُنزع قبل الفحص.
  const CONDOLENCE_TEXT_RE = /(?:^|[^\u0621-\u064A])(?:[وف]?(?:بال|لل|ال|ب|ل)?(?:عزاء|تعزي[ةه]|تعازي(?:نا)?|وفا[ةه]|وفات|متوف[ىي]|فقيد|مرحوم)(?:ه|ها|هم|كم|نا)?|توف(?:ي|ى|اه|اها)|[اإ]لي?ه\s+ل?(?:[رو]اجعون|رجعون)|البقاء\s*لله|الله\s*ير[حخ]م(?:ه|ها|هم|ك)|عظم\s*الله\s*[أا]جر|[أا]حسن\s*الله\s*عزاء|في\s*ذم[ةه]\s*الله)(?=$|[^\u0621-\u064A])|inna\s+lillahi|rest\s+in\s+peace|\bcondolence/i;
  function isCondolenceText(t){ return CONDOLENCE_TEXT_RE.test(String(t || '').replace(/[\u064B-\u0652\u0670\u0640]/g, '')); }
  const VIS_LIGHT = ['إضاءة جانبية حادّة تصنع ظلالًا طويلة', 'ضوء منتشر ناعم بعد الغيم', 'ضوء خلفي يرسم هالة حول الحوافّ', 'أشعة تتخلّل غبارًا معلّقًا', 'ضوء أزرق بارد قبل الشروق', 'ضوء نهاري ساطع من الأعلى', 'ظلال متقطّعة عبر مشربية', 'وميض خفيف يعكسه سطح مبلّل'];
  const VIS_PALETTE = ['ألوان ترابية هادئة', 'تباين أزرق داكن مع فضّي', 'أخضر عميق مع بنّي', 'رمادي حجري مع لمسة نحاسية', 'أبيض وبيج بلمسة رملية', 'أزرق فيروزي مع رمل فاتح', 'ألوان باردة أحادية شبه رمادية', 'أسود مطفي مع ذهبي خفيف'];
  const VIS_LENS = ['تصوير واسع الزاوية من موضع منخفض', 'منظور علوي عمودي', 'عدسة تقريب طويلة بعمق ميدان ضحل', 'مستوى النظر بتكوين متوازن', 'زاوية منخفضة تُعلي الموضوع', 'تكوين غير متمركز بمساحة فارغة واسعة'];
  function visPick(list){ return list[Math.floor(Math.random() * list.length)] || ''; }
  function fallbackVisual(kind, exactText){
    if(isCondolenceText(exactText)){
      return 'مشهد تعزية هادئ بلا أشخاص ولا وجوه: ' + visPick(VIS_SCENE.condolence) + '، ضوء خافت حزين، ألوان باهتة هادئة، تفاصيل واقعية دقيقة، بلا أي كتابة أو حروف أو أرقام في الصورة';
    }
    const k = (kind === 'prayer' || /(?:اللهم|ربنا|يا\s+رب)/.test(exactText || '')) ? 'prayer'
      : kind === 'poetry' ? 'poetry' : kind === 'flirt' ? 'flirt' : 'phrase';
    return 'مشهد أصيل عالي الجودة: ' + visPick(VIS_SCENE[k] || VIS_SCENE.phrase) + '، ' + visPick(VIS_LIGHT)
      + '، ' + visPick(VIS_PALETTE) + '، ' + visPick(VIS_LENS) + '، تفاصيل واقعية دقيقة، بلا أي كتابة أو حروف أو أرقام في الصورة';
  }
  const NAMED_FONT_RE = /(?:ديواني|رقعة|رقعه|كوفي|عثماني|نسخ|نوتو|ثلث|فارسي|نستعليق|مصحف|قرآني|diwani|ruqaa|kufi|othmani|naskh|thuluth|farsi|nastaliq|quran)/i;
  /* «بخط مزخرف/خط حلو»: كلمة جمال مقرونة بالخط = اختيار الخط المزخرف (بلا «خط» قد تصف المشهد: «صورة حلوة»). */
  const PRETTY_FONT_RE = /(?:^|[^ء-ي])(?:ب|بال|ال)?خط\s+(?:\S+\s+)?(?:و\s*)?(?:م?زخرف[ةه]?|زخرفي|مزخرف|حلو[ةه]?|جميل[ةه]?|أنيق[ةه]?|انيق[ةه]?|مرتب[ةه]?|راقي[ةه]?|فخم[ةه]?|ملكي|فني|beautiful|fancy|elegant|ornate)/i;
  const FONT_NOUN_RE = /(?:^|[^ء-ي])(?:ب|بال|ال|و)?(?:خط|الخط)(?=$|[^ء-ي])|font/i;
  function styleFields(source, withPretty){
    const color = hasColorWord(source) ? textColor(source) : null;
    const fontKey = NAMED_FONT_RE.test(source) || (withPretty && PRETTY_FONT_RE.test(source)) ? textFont(source) : null;
    const position = positionExplicit(source) ? textPlacement(source) : null;
    const size = textSize(source);
    /* «بخط مزخرف» بلا لون = الذهب المتدرّج نفسه الذي يأخذه النصّ الجديد بهذا الوصف */
    const col = color || (fontKey && withPretty && PRETTY_FONT_RE.test(source) && textColor(source) !== '#ffffff' ? textColor(source) : null);
    return col || fontKey || position || size ? { color:col, fontKey, position, size } : null;
  }
  function textStyleEdit(source){
    const hasTextNoun = /(?:النص|الكتابة|الكتابه|الكلام|الخط|text|writing|font)/i.test(source) || FONT_NOUN_RE.test(source);
    const moveExisting = hasTextNoun && /(?:حط|ضع|خل|خلي|خلّي|اجعل|حرّك|حرك|انقل|نقل|ودّ|ودي|move|put|place)[^\n]{0,28}(?:يمين|يسار|أعلى|اعلى|فوق|وسط|منتصف|المركز|أسفل|اسفل|تحت|\bright\b|\bleft\b|\btop\b|\bmiddle\b|\bcenter\b|\bbottom\b)/i.test(source);
    if(textRemoveIntent(source) || (findTextMarker(source) && !moveExisting) || !hasTextNoun) return null;
    return styleFields(source, true);
  }
  // تنسيق بلا ذكر «النص»: يُستخدم فقط حين توجد طبقة نصّ محفوظة على الصورة.
  /* «خليه وردي» تنسيقٌ للكتابة، أمّا «خلي الخلفية وردي» فتعديلٌ للمشهد — هدف بصريّ مسمّى لا يُقرأ تنسيقًا للنصّ. */
  const VISUAL_TARGET_RE = /(?:^|[^ء-ي])(?:و)?(?:بال|ال|لل)?(?:خلفي[ةه]?|خلفيات|سما|سماء|بحر|لبس|ملابس|لبسها|لبسه|فستان|فستانها|قميص|ثوب|شعر|شعرها|شعره|وجه|وجهها|وجهه|عيون|عيونها|جدار|كنب|كنب[ةه]|ورد[ةه]?|ورود|زهر[ةه]?|زهور|سيار[ةه]|غرف[ةه]|أرض|ارض)(?=$|[^ء-ي])|\b(?:background|dress|shirt|hair|sky|wall|sofa|flowers?)\b/i;
  function textStyleEditLoose(source){
    if(findTextMarker(source) || textRemoveIntent(source) || VISUAL_TARGET_RE.test(source)) return null;
    return styleFields(source, true);
  }
  function isTextLayerRemoval(source){
    const s = String(source || '');
    const remove = /(?:احذف|امسح|شيل|ازل|أزل|اخف|أخف|remove|erase|delete|clear)/i.test(s);
    if(!remove) return false;
    return /(?:النص|الكتابة|الكتابه|الكلام|الكلمات|الحروف|العبارة|العباره|هذا\s+الشي|هالشي|هذا|هذي|text|writing|words?|letters?|this\s+(?:thing|text))/i.test(s);
  }
  /* «احذف الكلام واكتب X» = استبدال لا حذف فقط (كان X يضيع). أمر كتابة حقيقيّ غير منفيّ: «المكتوب عليها» وصفٌ للمحذوف،
     و«اكتبه/لا تكتب» ليسا نصًّا جديدًا. */
  function writeCommandAt(source){
    const s = String(source || ''), re = /(^|[\s،,و])(اكتب(?:ي|لي)?|أكتب|حط|ضع|ضيف|أضف|اضف|write|put|add)(?=[\s:：«"']|$)/gi;
    let m;
    while((m = re.exec(s))){
      const at = m.index + m[1].length;
      if(/(?:^|\s)(?:لا|ما|not|don'?t|never)\s*$/i.test(s.slice(Math.max(0, at - 10), at))) continue;
      /* «حط/ضع/ضيف» فعل كتابة فقط إن تلاه نصّ أو اسمه — «احذف الكلام وحط وردة» وضعُ شيء في المشهد لا كتابة «وردة» */
      if(!/^(?:اكتب|أكتب|write)/i.test(m[2]) && !/^\s*(?:لي\s+)?(?:(?:عليها|عليه|فوقها|فيها)\s*)?(?:[«“"']|(?:النص|نص|العبارة|عبارة|الكلام|كلام|كلمة|اسمي|اسم|the\s+text|text|words?|name)(?=\s|[:：«"'\-–—]|$))/i.test(s.slice(at + m[2].length))) continue;
      return { index:at, value:m[2] };
    }
    return null;
  }
  // وصف طلب («كلام حلو»، «جمله عن النجاح») مقابل نصّ حرفيّ («عمران»).
  const KIND_HEAD_RE = /^(?:أي|اي|شي|شيء)?\s*(كلام|كلمات|كلمتين|جملة|جمله|جمل|عبارة|عباره|عبارات|كلمة|كلمه|حكمة|حكمه|اقتباس|مقولة|مقوله|بيت\s+شعر|أبيات|ابيات|قصيدة|قصيده|دعا[ءدهً]?|[أا]دعي[ةه]|شعر|غزل|تهنئة|تهنئه|معايدة|معايده|رسالة|رساله|خاطرة|خاطره|خواطر)(?=$|[\s،,.!?؟:])/;
  /* v-text-design (لقطة المالك: «اكتب عليها كلا م حب زوجين» طُبعت حرفيًّا فوق وجه الرجل): «كلام حب/غزل/لزوجين/لحبيبتي…» طلب تأليف */
  /* مراجعة #805: قائمة واحدة لكلمات الحبّ — «كلام لزوجتي» غزل لا «عبارة» عامّة */
  const LOVE_WORDS = 'حب|غرام|عشق|هوى|زوجين|زوج|زوجة|زوجه|زوجي|زوجتي|حبيب|حبيبي|حبيبتي|حبيبة|حبيبه|عرسان|عروس|عريس|خطيب|خطيبي|خطيبتي';
  const DESCRIBER_RE = new RegExp('(?:^|[\\s،,])(?:حلو|حلوة|حلوه|حلوين|جميل|جميلة|جميله|قصير|قصيرة|قصيره|طويل|طويلة|مؤثر|مؤثرة|مؤثره|قوي|قوية|قويه|رائع|رائعة|أنيق|انيق|مناسب|مناسبة|يناسب|تناسب|يليق|زين|زينة|عن|راقي|راقية|راقيه|فخم|فخمة|فخمه|رومانسي|رومانسية|رومانسيه|[لب]?ل?(?:ال)?(?:' + LOVE_WORDS + ')|nice|short|about|love)(?=$|[\\s،,.!?؟])');
  function looksLikeRequest(value){
    const s = String(value || '').trim().replace(/(^|\s)كلا\s+م(?=\s|$)/g, '$1كلام'); /* «كلا م» خطأ كتابة لـ«كلام» */
    if(!s) return false;
    const words = s.split(/\s+/);
    if(words.length > 9) return false;
    if(/^عن(?=\s)/.test(s)) return true;
    const head = KIND_HEAD_RE.exec(s);
    if(!head) return false;
    return words.length === 1 || DESCRIBER_RE.test(s.slice(head.index + head[0].length));
  }
  const LOVE_KIND_RE = new RegExp('(?:^|[\\s،,])[لب]?ل?(?:ال)?(?:' + LOVE_WORDS + ')(?=$|[\\s،,.!?؟])');
  function requestKind(s){
    if(/(?:شعر|قصيدة|قصيده|بيت|أبيات|ابيات)/.test(s)) return 'poetry';
    if(/(?:غزل|رومانسي)/.test(s) || LOVE_KIND_RE.test(s)) return 'flirt';
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
    // v-longtext-noimg: تعليمة تعديل صورة قصيرة دائمًا؛ نصّ طويل (قصّة/شرح) ليس
    // أمر تعديل صورة مهما حوى «عدّل/غيّر/دعاء…». يمنع اختطاف النصوص الطويلة.
    if(source.length > 220) return false;
    if(textStyleEdit(source) || parseImageTextSpec(source).wantsText) return true;
    if(/(?:نفس\s+(?:الصورة|الصوره)|هذه\s+(?:الصورة|الصوره)|هذي\s+(?:الصورة|الصوره)|هالصورة|هالصوره|الصورة\s+السابقة|الصوره\s+السابقه|(?:same|this|previous)\s+(?:image|picture))/i.test(source)) return true;
    const editVerb = /(?:^|[\s،,.!?؟])(?:عدل|عدّل|حرر|حرّر|غير|غيّر|بدل|بدّل|احذف|امسح|ازل|أزل|شيل|أضف|اضف|ضيف|حط|اكتب|أكتب|خل|خلي|خلّي|اجعل|سو|سوي|سوّي|حول|حوّل|زيد|قص|كبر|كبّر|صغر|صغّر)(?=$|[\s،,.!?؟]|ها)/i.test(source) || /\b(?:edit|change|modify|remove|delete|add|put|write|resize)\b/i.test(source);
    const imageRef = /(?:الصورة|الصوره|هالصورة|هالصوره|عليها|فيها|منها|لها|\S+ها(?:\s|$)|\bit\b|this\s+(?:image|picture)|the\s+(?:image|picture))/i.test(source);
    const visualTarget = /(?:الخلفية|الخلفيه|الملابس|اللبس|الشعر|الوجه|الإضاءة|الاضاءة|الألوان|الالوان|تسريح[ةه]|قص[ةه]\s+الشعر|فستان|قميص|نظار[ةه]|لحي[ةه]|شنب|مكياج|حجاب|شماغ|كندور[ةه]|قبع[ةه]|تاج|بشر[ةه]|background|outfit|clothes|hair|hairstyle|ponytail|face|lighting|colou?rs?)/i.test(source);
    return editVerb && (imageRef || visualTarget);
  }
  function autoPrayerSpec(input){
    const source = String(input || '').trim();
    // v-longtext-noimg (بلاغ المالك المتكرر «قصّة نوح ما ترد»): نصّ طويل ملصوق
    // (قصّة/شرح فيه «دعا»/«شعر») ليس طلب «صورة دعاء» — كان يُصنَّف wantsText=true
    // فيُختطف لمسار توليد صورة النصّ بدل المحادثة. أي نصّ >220 حرفًا لا يُعامَل
    // كطلب تأليف صورة إطلاقًا. الطلبات الحقيقية قصيرة («صورة فيها دعاء الجمعة»).
    if(source.length > 220) return null;
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
  // «ابغى صوره» و«لا في الصوره بس» بلا وصف مشهد = طلب عامّ لا تعديل بصريّ.
  function isGenericVisual(v){
    /* «غيّر الاسم/احذف الكلام واكتب…»: شطر الكتابة أمرٌ للطبقة لا تعديلٌ بصريّ يُرسل للمولّد (كان «غير الاسم» يذهب نداءً مدفوعًا). */
    if(/^(?:لا\s+)?(?:احذف|امسح|شيل|شل|حذف|ح[ّ]?و[ّ]?ز|ازل|أزل|غير|غيّر|غيري|غيّري|بدل|بدّل|استبدل|صحح|صحّح)\s+(?:ال)?(?:نص|كتابة|كتابه|كلام|كلمات|عبارة|عباره|مكتوب|[إا]سم)(?:ي|ه|ها|ك)?(?:\s+\S+){0,3}\s*$/i.test(String(v || '').trim())) return true; /* «احذف الكلام الي تحت»، «غير اسمي» */
    const s = String(v || '').replace(/(?:^|\s)(?:لا|لأ|بس|فقط|ابغى|أبغى|ابغي|أبغي|ابي|أبي|اريد|أريد|ودي|بدي|عطني|اعطني|أعطني|لي|في|على|نفس|هذي|هذه|ال?صور[ةه]|image|picture)(?=\s|$)/gi, ' ').trim();
    return !s || GENERIC_VISUAL_RE.test(s);
  }
  const ISTIRJA = 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ';
  const KNOWN_PHRASES = [
    [/(^|[\s«"'])[اإأآ]نّ?ن?ّ?[اهى]?\s*(?:ال|ل)?لّ?ل?ه\s*و\s*[اإأآ]نّ?ن?ّ?[اهى]?\s*[اإأ]ل[يى]ه\s*[رو]اجع[وي]ن(?=$|[\s.،,!»"'])/g, '$1' + ISTIRJA] /* «وآنه» كما كتبها المالك في الفيديو */
  ];
  function fixKnownPhrases(value){
    let out = String(value == null ? '' : value);
    KNOWN_PHRASES.forEach(function(p){ out = out.replace(p[0], p[1]); });
    return out;
  }
  function isKnownPhrase(value){ return String(value || '').trim() === ISTIRJA; }
  // «حوز/احذف/شيل الكلام الي تحت» = إزالة طبقة الكتابة التي رسمناها.
  function textRemoveIntent(input){
    const s = String(input || '').trim();
    if(!s || s.length > 120 || findTextMarker(s)) return false;
    return /(?:^|[\s،,])(?:احذف|حذف|امسح|مسح|شيل|شيلي|ازل|أزل|ازيل|أزيل|إزال[ةه]|ازال[ةه]|حوز|حوّز|حوزي|نظف|نظّف|remove|delete|erase|clear)\s*(?:لي\s+)?(?:(?:هذا|هذه|هذي|هاذا|هاذي)\s+)?(?:ال)?(?:كلام|كتاب[ةه]|كتابه|نص|مكتوب|عبار[ةه]|جمل[ةه]|خط|text|writing|words?|caption)(?=$|[\s،,.!؟?])/i.test(s)
      || /^(?:بدون|بلا|من\s+غير)\s+(?:ال)?(?:كلام|كتاب[ةه]|كتابه|نص)\s*[.!]*$/i.test(s);
  }
  // «و الصوره تعبر عن…» وصف للمشهد يأتي بعد النصّ بلا علامات تنصيص — لا يُطبع.
  const DESC_TAIL_RE = /\s+و\s*(?:ال)?(?:صور[ةه]|صوره|خلفي[ةه]|خلفيه|مشهد|رسم[ةه]|رسمه)(?=\s+(?!ال|ل)\S|$)|\s+و\s*(?:ت|ي)عبّ?ر\s+عن\s+|\s+و\s*(?:تكون|يكون|خل|خلي|خلّي|خله|خلها|اجعل|اجعلها|سو|سوي|سوّي|حط|ضيف|أضف|اضف|ارسم)\s+(?:لي\s+)?(?:فيها|فيه|عليها|ال?صور[ةه]|ال?صوره|ال?خلفي[ةه]|ال?خلفيه|المشهد|لونها|لون\s+ال?خلفي)(?=\s|$)/i;
  // «عمران بالذهبي» و«… في الاعلى»: لون أو موضع في آخر النصّ غير المنصَّص تنسيقٌ لا كلام.
  const TAIL_POS = '(?:و\\s*)?(?:في|ف|بال|على|من)\\s*(?:الأعلى|الاعلى|فوق|الأسفل|الاسفل|تحت|الوسط|المنتصف|النص)';
  const TAIL_COLOR = '(?:و\\s*)?(?:بال|باللون\\s+ال?)' + COLOR_WORD + '[ةه]?';
  const TAIL_STYLE_RE = new RegExp('\\s+(?:' + TAIL_COLOR + '|' + TAIL_POS + ')(?:\\s+(?:' + TAIL_COLOR + '|' + TAIL_POS + '))?\\s*$', 'i');
  // «غير الكلام الى مبروك» / «خلي الكتابه مبروك»: استبدال نصّ طبقتنا — يستعمله العميل فقط حين تكون آخر صورة ناتج الطبقة.
  function textReplaceIntent(input){
    const s = String(input || '').trim();
    if(!s || s.length > 160 || findTextMarker(s) || textStyleEdit(s)) return null;
    const m = /^(?:لا\s+)?(?:غير|غيّر|غيري|بدل|بدّل|بدلي|خل|خلي|خلّي|خليه|خليها|اجعل|صحح|صحّح|عدل|عدّل)\s+(?:ال)?(?:كلام|كتاب[ةه]|كتابه|نص|مكتوب|عبار[ةه]|عباره|جمل[ةه]|جمله|كلم[ةه]|كلمه)\s+(?:الى|إلى|لـ|يصير|تصير|يكون|تكون|:)?\s*(.+)$/i.exec(s);
    if(!m) return null;
    const q = quotedValue(m[1]);
    const t = fixKnownPhrases((q ? q.value : m[1]).trim());
    return t && t.length <= 120 ? t : null;
  }
  // «اكتب قوف شكراً» = اكتب فوق «شكراً»: كلمة موضع في أوّل النصّ غير المنصَّص.
  const LEAD_POS_RE = /^(?:فوق|قوف|تحت|(?:في|ف|بال)\s*(?:الأعلى|الاعلى|الأسفل|الاسفل|الوسط|النص|المنتصف)|بالنص|بالوسط|فالنص)\s+(?=\S)/;
  // «غير اخوي الى صديقي» على نصّ طبقتنا: تبديل كلمة داخل النصّ المحفوظ نفسه — null إن لم تكن الكلمة فيه.
  function layerWordSwap(input, layerText){
    const s = String(input || '').trim(), t = String(layerText || '');
    if(!s || !t || s.length > 160) return null;
    const m = /^(?:لا\s+)?(?:غير|غيّر|غيري|بدل|بدّل|بدلي|استبدل|صحح|صحّح)\s+(?:(?:ال)?(?:كلم[ةه]|كلمه|اسم|جمل[ةه]|جمله)\s+)?[«"']?(.+?)[»"']?\s+(?:الى|إلى|حط|وحط|خلها|خله|تصير|يصير|مكانها|مكانه|بـ|ب(?=\s))\s*[«"']?(.+?)[»"']?\s*[.!]*$/i.exec(s);
    if(!m) return null;
    const from = m[1].trim(), to = fixKnownPhrases(m[2].trim());
    if(!from || !to || from === to || t.indexOf(from) < 0) return null;
    return t.split(from).join(to);
  }
  function parseImageTextSpec(input){
    const source = String(input || '').replace(/\r\n?/g, '\n');
    // v-longtext-noimg (بلاغ المالك «قصّة نوح ما ترد»): نصّ طويل ملصوق ليس طلب
    // «صورة عليها نصّ». علامات مثل علامات الاقتباس أو «فيها/عليها» داخل قصّة
    // كانت تُرجع wantsText=true فيُختطف النصّ لمسار توليد صورة النصّ بدل المحادثة.
    // طلب الكتابة على صورة دائمًا قصير؛ أي نصّ >400 حرف = لا صورة، محادثة عادية.
    if(source.length > 400) return { wantsText:false, exactText:null, visualPrompt:source.trim(), fontKey:'default', color:'#ffffff', position:'bottom', styleEditLoose:null };
    const writeCmd = isTextLayerRemoval(source) ? writeCommandAt(source) : null;
    if(isTextLayerRemoval(source) && !writeCmd) return { wantsText:false, exactText:null, visualPrompt:source.trim(), removeText:true, fontKey:'default', color:'#ffffff', position:'bottom', styleEditLoose:null };
    const styleEdit = writeCmd ? null : textStyleEdit(source), autoPrayer = (styleEdit || writeCmd) ? null : autoPrayerSpec(source), marker = writeCmd || (autoPrayer ? null : findTextMarker(source)); if(styleEdit) return { wantsText:false, exactText:null, visualPrompt:'', styleEdit, styleEditLoose:styleEdit };
    if(!marker) return autoPrayer ? { wantsText:true, exactText:null, visualPrompt:authorVisual(source, autoPrayer.kind), visualEdit:visualCore(source) || null, prayerRequest:autoPrayer.request, fontKey:textFont(source), color:textColor(source), position:textPlacement(source), positionAuto:!positionExplicit(source), kind:autoPrayer.kind, autoAuthored:true } : { wantsText:false, exactText:null, visualPrompt:source.trim(), fontKey:'default', color:'#ffffff', position:'bottom', styleEditLoose:textStyleEditLoose(source) };
    const literalPrayerText = /(?:النص|العبارة|الكلام|الكلمة|كلمة|text|words?)\s*(?:هو|is)?\s*[:：\-–—]?\s*(?:دعا[ءدهً]?|prayer|du[’']?a)(?=$|[\s،,.!?؟])/i.test(source.slice(marker.index));
    let rest = source.slice(marker.index + marker.value.length);
    /* «اكتبه/اكتبها بخط وردي»: ضمير المفعول الملتصق بالفعل يعود على النصّ الموجود، لا يُطبع حرفًا «ه». */
    if(/^(?:اكتب|أكتب)$/.test(marker.value)) rest = rest.replace(/^(?:ه|ها|هم)(?=\s|$)/, '');
    rest = rest.replace(/^\s*(?:لي\s+)?/i, '');
    rest = rest.replace(/^\s*(?:عليها|عليه|فوقها|فيها|على\s+(?:هذه\s+)?(?:الصورة|الصوره)|فوق\s+(?:الصورة|الصوره)|on\s+(?:the\s+)?(?:image|photo|picture))\s*/i, '');
    rest = rest.replace(/^\s*(?:النص|العبارة|الكلام|الكلمة|كلمة|اسمي|اسم|the\s+text|text|words?|name|quote)?\s*(?:هو|وهو|التالي|is)?\s*[:：\-–—]?\s*/i, '');
    let visualTail = '';
    const visualTailAt = rest.search(/\s+(?:و\s*)?(?:(?:تكون|يكون|خلي|خلّي|اجعل)\s+)?(?:الصورة|الصوره|المشهد|الخلفية|الخلفيه)\s+(?:تعبر|تعبّر|يعبر|يعبّر|تدل|يدل|توحي|يوحي|تظهر|يظهر|تكون|يكون|فيها|فيه|تحتوي|يحتوي)(?=\s|$)/i);
    if(visualTailAt > 0){
      visualTail = rest.slice(visualTailAt).replace(/^\s*(?:و\s*)?/, '').trim();
      rest = rest.slice(0, visualTailAt).trim();
    }
    let kind = '';
    const kindMatch = rest.match(/^\s*(دعا[ءدهً]?|الشعر|شعر|بيت\s+شعر|قصيدة)(?=\s|[:：\-–—]|$)\s*[:：\-–—]?\s*/i);
    if(kindMatch && !literalPrayerText){
      kind = /دعاء/i.test(kindMatch[1]) ? 'prayer' : 'poetry';
      rest = rest.slice(kindMatch[0].length);
    }
    const quoted = quotedValue(rest);
    let exactText = null, suffix = '', styleSource = '', descTail = '';
    if(!quoted){
      const lead = LEAD_POS_RE.exec(rest.trim());
      if(lead){ styleSource = lead[0].replace(/^قوف/, 'فوق'); rest = rest.trim().slice(lead[0].length); }
      const dc = rest.search(DESC_TAIL_RE);
      if(dc > 0){ descTail = rest.slice(dc).replace(/^[\s،,]*و?\s*/, ''); rest = rest.slice(0, dc); }
      const ts = rest.search(TAIL_STYLE_RE);
      if(ts > 0){ styleSource = (styleSource + ' ' + rest.slice(ts)).trim(); rest = rest.slice(0, ts); }
    }
    const leadStyle = styleSource;
    if(quoted){
      exactText = quoted.value;
      suffix = rest.slice(quoted.index + quoted.whole.length);
      styleSource = rest.slice(0, quoted.index) + ' ' + suffix;
    }else{
      /* v-tail-dialect (لقطة عمران: «اكتب روضه عمري و ايكون بخط زخرفي بس اكتب
         روضه عمري لا تكتب شي و ألون ايكون ذهبي» طُبعت بذيلها كاملًا): العامية
         تكتب «ايكون» و«ألون» فلا يمسكها ذيل الفصحى المثبَّت في آخر الجملة.
         أول «بخط/بلون/ويكون/لا تكتب» يقطع النصّ — ما بعده تنسيقٌ وأوامر تُقرأ
         منها الألوان والخط، ولا يُطبع منها حرف ولا يصل لمولّد الصور. */
      /* v-text-colors: «اكتب بخط صغير ومزخرف» — القاطع في أوّل الكلام يعني «لا نصّ جديد»، والذيل كلّه تنسيق (كان يُطبع).
         و«اكتب حبيبة قلبي لونه وردي» بلا «بخط» ذيلُ لونٍ أيضًا. */
      const dialectCut = rest.search(/(?:^|\s+)(?:و\s*)?(?:ا?يكون\s+)?(?:بخط|بالخط|بلون|باللون)(?:\s+|$)|\s+و\s*ا?يكون\s+|\s+(?:و\s*)?[أا]?لل?ون(?:ه|ها)?\s+ا?يكون\s+|\s+(?:و\s*)?ب?لون(?:ه|ها)\s+(?=\S)|\s+لا\s+تكتب\s+/i);
      const leadRun = leadingStyleRun(rest);
      if(leadRun){
        const leadStyle0 = leadRun.style, leadRest = leadRun.rest;
        const cut2 = leadRest.search(/\s+(?:و\s*)?(?:ا?يكون\s+)?(?:بخط|بالخط|بلون|باللون)(?:\s+|$)|\s+و\s*ا?يكون\s+|\s+(?:و\s*)?ب?لون(?:ه|ها)\s+(?=\S)|\s+لا\s+تكتب\s+/i);
        styleSource = (leadStyle0 + ' ' + (cut2 > 0 ? leadRest.slice(cut2) : '')).trim();
        exactText = (cut2 > 0 ? leadRest.slice(0, cut2) : leadRest).trim();
      }else if(dialectCut > 0){
        styleSource = rest.slice(dialectCut);
        exactText = rest.slice(0, dialectCut).trim();
      }else{
      /* v-name-swap: «ويكون بخط حلو وزخرف» ذيل تنسيق لا جزء من النصّ —
         نسمح بقائد (ويكون/خليه) وبأوصاف زخرفة متلاحقة بعد اسم الخط. */
      const styleTail = rest.match(/\s+(?:،|,)?\s*(?:و?\s*(?:يكون|خليه|خله|اجعله)\s+)?(?:(?:بخط|بالخط)\s+\S+(?:\s+و?(?:م?زخرف[ةه]?|حلو[ةه]?|جميل[ةه]?|أنيق[ةه]?|انيق[ةه]?|مرتب[ةه]?|راقي[ةه]?|فخم[ةه]?|رائع[ةه]?|مميز[ةه]?|ملكي[ةه]?|فني[ةه]?|جذاب[ةه]?|ذهبي(?:ة)?|أبيض|ابيض|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|بيج|gold|white|black|green|blue|red|beige))*|(?:بلون|باللون|لون\s+النص)\s+\S+|(?:واجعل|اجعل|وخلي|خلي)\s+النص\s+(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|الوسط|المنتصف|الأسفل|الاسفل))(?:\s+(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|فوق|الوسط|المنتصف|المركز|الأسفل|الاسفل))?\s*$/i);
      if(styleTail && styleTail.index >= 0){ suffix = rest.slice(styleTail.index); rest = rest.slice(0, styleTail.index); }
      styleSource = suffix;
      exactText = rest.trim();
      }
      // ذيل «على الصورة / فوق الصورة» ليس جزءًا من النصّ المكتوب.
      // v576: ذيل «بدون تغيير الصورة» طلبٌ لا نصّ — يُنزع قبل الطباعة.
      exactText = exactText.replace(/\s*(?:،|,)?\s*(?:بدون|بلا|دون|من\s+غير)\s*(?:أي\s*)?(?:تغيير|تغير|تعديل|مساس|لمس)(?:\s*(?:في|على|ل)?\s*(?:الصورة|الصوره))?\s*$/i, '').replace(/\s*(?:،|,)?\s*(?:على|فوق|في)\s*(?:هذه\s*|هذي\s*|هال)?(?:الصورة|الصوره)(?:\s*نفسها)?\s*$/i, '').trim();
    }
    if(leadStyle) styleSource = (leadStyle + ' ' + styleSource).trim();
    if(descTail) suffix = (suffix + ' ' + descTail).trim();
    /* v-text-colors (لقطة المالك: صورة مرفوعة طُبع عليها «بخط صغير ومزخرف»): أمر كتابة بلا نصّ وذيله تنسيق فقط =
       إعادة تنسيق الكتابة الموجودة (لون/خط/حجم)، لا نصّ جديد. العميل يطبّقه على الطبقة، أو يطلب النصّ إن لم توجد. */
    /* «اكتبها بالوردي»: نصٌّ كلّه كلمات تنسيق بسابقة «ب/بال» تنسيقٌ لا كلام («اكتب وردي» بلا سابقة تبقى نصًّا). */
    if(!quoted && exactText && /^(?:و\s*)?(?:بال|ب)/.test(exactText.trim()) && hasColorOrSize(exactText) && !exactText.replace(STYLE_WORDS_RE, ' ').trim()){
      styleSource = (exactText + ' ' + styleSource).trim(); exactText = '';
    }
    if(!quoted && !kind && !(exactText && exactText.trim())){
      const se = styleFields(styleSource, true);
      if(se) return { wantsText:false, exactText:null, visualPrompt:'', styleEdit:se, styleEditLoose:se, styleOnlyWrite:true };
    }
    if(exactText) exactText = fixKnownPhrases(exactText);
    if(exactText == null || !exactText.trim() || /^(?:دعا[ءدهً]?|شعر|بيت\s+شعر|قصيدة|نص|كلام|prayer|poem|text)$/i.test(exactText.trim())){
      if(!kind && exactText && exactText.trim()) kind = requestKind(exactText.trim());
      exactText = null;
    }else if(!quoted && !literalPrayerText && looksLikeRequest(exactText)){
      // «اكتب كلام حلو» = طلب تأليف، لا نصّ يُطبَع حرفيًّا.
      if(!kind) kind = requestKind(exactText);
      exactText = null;
    }
    let visualPrompt = cleanVisual(source.slice(0, marker.index));
    if(visualTail) visualPrompt = (visualPrompt + ' ' + visualTail).trim();
    const visualSuffix = (quoted ? splitStyleRuns(suffix).rest : suffix).replace(/(?:بخط|بالخط)\s+\S+(?:\s+(?:ذهبي(?:ة)?|أبيض|ابيض|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|بيج|gold|white|black|green|blue|red|beige))?|(?:بلون|باللون|لون\s+النص)\s+\S+|(?:واجعل|اجعل|وخلي|خلي)\s+النص\s+(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|الوسط|المنتصف|الأسفل|الاسفل)|(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|فوق|الوسط|المنتصف|المركز|الأسفل|الاسفل)|(?:on|in)\s+(?:the\s+)?(?:image|photo|picture|top|middle|center|bottom)/gi, '').replace(/^[\s،,و]+|[\s،,]+$/g, '');
    const visualRest = (quoted ? splitStyleRuns(suffix).rest : suffix).replace(STYLE_WORDS_RE, ' ').replace(/(?:^|\s)(?:و|و?ب?لون(?:ه|ها)?|باللون|بس|فقط)(?=\s|$)/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s،,و]+|[\s،,]+$/g, '');
    if(visualRest) visualPrompt = (visualPrompt + ' ' + visualSuffix).trim(); /* «بخط لونه وردي» بعد النصّ المنصَّص ليس وصفًا يُرسل للمولّد */
    const visualEdit = (!visualPrompt || GENERIC_VISUAL_RE.test(visualPrompt) || isGenericVisual(visualPrompt)) ? null : visualPrompt;
    if(!visualEdit) visualPrompt = fallbackVisual(kind, exactText);
    else if(isCondolenceText(exactText) && !isCondolenceText(visualPrompt)) visualPrompt = 'مشهد تعزية بلا وجوه: ' + visualPrompt; /* النصّ عزاء فالمشهد عزاء */
    const runs = quoted ? splitStyleRuns(styleSource) : null;
    const color = textColor(runs && runs.style ? runs.style : styleSource);
    return { wantsText:true, exactText, visualPrompt, visualEdit, fontKey:textFont(styleSource), color, colorSet:color !== '#ffffff' || hasColorWord(styleSource), size:textSize(styleSource), position:textPlacement(styleSource), positionAuto:!positionExplicit(styleSource), kind, prayerRequest:!exactText&&kind?source:undefined, autoAuthored:!exactText&&kind?true:undefined };
  }
  root.__parseImageTextSpec = parseImageTextSpec;
  root.__isExplicitImageEdit = isExplicitImageEdit;
  root.__imageWriteIntent = imageWriteIntent;
  root.__imageTextRemoveIntent = textRemoveIntent;
  root.__fixKnownPhrases = fixKnownPhrases;
  root.__isKnownPhrase = isKnownPhrase;
  root.__imageTextReplace = textReplaceIntent;
  root.__layerWordSwap = layerWordSwap;
  if(typeof module !== 'undefined' && module.exports) module.exports = { parseImageTextSpec, isExplicitImageEdit, imageWriteIntent, textRemoveIntent, textReplaceIntent, layerWordSwap, fixKnownPhrases, isKnownPhrase };
})(typeof window !== 'undefined' ? window : globalThis);
