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
  // بنك التعزية وحده يستعمل الفانوس والوردة البيضاء: رموز عزاء لا كليشيه دعاء، ولا يمرّ بمخطّط الأدعية.
  const VIS_SCENE = {
    prayer: ['فناء طيني قديم بعد المطر وقطرات على الجدار الترابي', 'كثبان رملية ناعمة بخطوط ريح دقيقة', 'قمم جبال بازلتية يعلوها ضباب رقيق', 'حقل قمح ناضج تحرّكه نسمة خفيفة', 'ممرّ حجري ضيق بين جدارين عاليين وشعاع ضوء واحد', 'سهل واسع فارغ تحت سحاب رقيق', 'نافورة ماء ساكنة في ساحة حجرية خالية', 'أغصان نخيل عالية تُرى من الأسفل نحو السماء'],
    poetry: ['صحراء ليلية بنجوم كثيفة وأفق منخفض', 'شرفة خشبية عتيقة تطلّ على واد أخضر', 'أزقّة مدينة قديمة بأقواس متتالية', 'ورق شجر متناثر على أرض مبلّطة', 'خيمة في العراء وأثر أقدام على الرمل', 'ضباب صباحي بين أشجار سرو طويلة'],
    flirt: ['حقل زهور برية بضوء ناعم متناثر', 'قماش حريري متموّج بألوان دافئة', 'أضواء مدينة ليلية غير واضحة خلف زجاج مرشوش بالمطر', 'درج رخامي مزيّن بالورد', 'حديقة مسوّرة بياسمين متسلّق', 'فراشة ملوّنة على ساق نبات عالٍ'],
    phrase: ['قمّة جبل صخرية فوق بحر من السحاب', 'مدرّج ملعب فارغ بخطوط هندسية حادّة', 'واجهات زجاجية عالية تعكس السماء', 'طريق مستقيم يشقّ سهلًا واسعًا', 'جسر معلّق بحبال فولاذية في الضباب', 'سطح ماء أملس تنعكس عليه غيوم مضيئة'],
    /* v-text-layers: عبارة عزاء بلا وصف مشهد كانت تأخذ مشهد «عبارة» عامًّا (ملعب، جسر…) — ChatGPT فهم الحزن من الآية نفسها */
    condolence: ['وردة بيضاء واحدة على حجر داكن في ضوء خافت', 'غصن جافّ على قماش رمادي هادئ', 'مقبرة بسيطة بشواهد حجرية بعيدة وسماء غائمة', 'فانوس صغير مطفأ الضوء بجانب زهرة ذابلة', 'طريق ترابي فارغ في ضباب الفجر', 'قطرات مطر على زجاج نافذة وخلفها أفق رمادي']
  };
  const CONDOLENCE_TEXT_RE = /(?:^|[^\u0621-\u064A])(?:[وف]?(?:بال|لل|ال|ب|ل)?(?:عزاء|تعزي[ةه]|تعازي(?:نا)?|وفا[ةه]|وفات|متوف[ىي]|فقيد|مرحوم)(?:ه|ها|هم|كم|نا)?|توف(?:ي|ى|اه|اها)|[اإ]لي?ه\s+ل?(?:[رو]اجعون|رجعون)|البقاء\s*لله|الله\s*ير[حخ]م(?:ه|ها|هم|ك)|عظم\s*الله\s*[أا]جر|[أا]حسن\s*الله\s*عزاء|في\s*ذم[ةه]\s*الله)(?=$|[^\u0621-\u064A])|inna\s+lillahi|rest\s+in\s+peace|\bcondolence/i;
  const VIS_LIGHT = ['إضاءة جانبية حادّة تصنع ظلالًا طويلة', 'ضوء منتشر ناعم بعد الغيم', 'ضوء خلفي يرسم هالة حول الحوافّ', 'أشعة تتخلّل غبارًا معلّقًا', 'ضوء أزرق بارد قبل الشروق', 'ضوء نهاري ساطع من الأعلى', 'ظلال متقطّعة عبر مشربية', 'وميض خفيف يعكسه سطح مبلّل'];
  const VIS_PALETTE = ['ألوان ترابية هادئة', 'تباين أزرق داكن مع فضّي', 'أخضر عميق مع بنّي', 'رمادي حجري مع لمسة نحاسية', 'أبيض وبيج بلمسة رملية', 'أزرق فيروزي مع رمل فاتح', 'ألوان باردة أحادية شبه رمادية', 'أسود مطفي مع ذهبي خفيف'];
  const VIS_LENS = ['تصوير واسع الزاوية من موضع منخفض', 'منظور علوي عمودي', 'عدسة تقريب طويلة بعمق ميدان ضحل', 'مستوى النظر بتكوين متوازن', 'زاوية منخفضة تُعلي الموضوع', 'تكوين غير متمركز بمساحة فارغة واسعة'];
  function visPick(list){ return list[Math.floor(Math.random() * list.length)] || ''; }
  function fallbackVisual(kind, exactText){
    if(CONDOLENCE_TEXT_RE.test(exactText || '')){
      return 'مشهد تعزية هادئ بلا أشخاص ولا وجوه: ' + visPick(VIS_SCENE.condolence) + '، ضوء خافت حزين، ألوان باهتة هادئة، تفاصيل واقعية دقيقة، بلا أي كتابة أو حروف أو أرقام في الصورة';
    }
    const k = (kind === 'prayer' || /(?:اللهم|ربنا|يا\s+رب)/.test(exactText || '')) ? 'prayer'
      : kind === 'poetry' ? 'poetry' : kind === 'flirt' ? 'flirt' : 'phrase';
    return 'مشهد أصيل عالي الجودة: ' + visPick(VIS_SCENE[k] || VIS_SCENE.phrase) + '، ' + visPick(VIS_LIGHT)
      + '، ' + visPick(VIS_PALETTE) + '، ' + visPick(VIS_LENS) + '، تفاصيل واقعية دقيقة، بلا أي كتابة أو حروف أو أرقام في الصورة';
  }
  function textStyleEdit(source){
    const hasTextNoun = /(?:النص|الكتابة|الكتابه|الكلام|الخط|text|writing|font)/i.test(source);
    const moveExisting = hasTextNoun && /(?:حط|ضع|خل|خلي|خلّي|اجعل|حرّك|حرك|انقل|نقل|ودّ|ودي|move|put|place)[^\n]{0,28}(?:يمين|يسار|أعلى|اعلى|فوق|وسط|منتصف|المركز|أسفل|اسفل|تحت|\bright\b|\bleft\b|\btop\b|\bmiddle\b|\bcenter\b|\bbottom\b)/i.test(source);
    if((findTextMarker(source) && !moveExisting) || !hasTextNoun) return null;
    const color=/(?:أصفر|اصفر|ذهبي|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|أبيض|ابيض|بيج|yellow|gold|black|green|blue|red|white|beige)/i.test(source)?textColor(source):null;
    const fontKey=/(?:ديواني|رقعة|رقعه|كوفي|عثماني|نسخ|نوتو|ثلث|فارسي|نستعليق|مصحف|قرآني|diwani|ruqaa|kufi|othmani|naskh|thuluth|farsi|nastaliq|quran)/i.test(source)?textFont(source):null;
    const position=positionExplicit(source)?textPlacement(source):null;
    return color||fontKey||position ? {color,fontKey,position} : null;
  }
  // تنسيق بلا ذكر «النص»: يُستخدم فقط حين توجد طبقة نصّ محفوظة على الصورة.
  function textStyleEditLoose(source){
    if(findTextMarker(source)) return null;
    const color = /(?:أصفر|اصفر|ذهبي|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|أبيض|ابيض|بيج|yellow|gold|black|green|blue|red|white|beige)/i.test(source) ? textColor(source) : null;
    const fontKey = /(?:ديواني|رقعة|رقعه|كوفي|عثماني|نسخ|نوتو|ثلث|فارسي|نستعليق|مصحف|قرآني|diwani|ruqaa|kufi|othmani|naskh|thuluth|farsi|nastaliq|quran)/i.test(source) ? textFont(source) : null;
    const position = positionExplicit(source) ? textPlacement(source) : null;
    return color || fontKey || position ? { color, fontKey, position } : null;
  }
  /* v-text-layers (فيديو المالك: «حوز الكلام الي تحت» نُفّذ نقلًا لا حذفًا): «حوّز/حذف/شل» الخليجيّة أفعال حذف
     أيضًا — بحدود كلمة كي لا تمسك «شلال» و«يحوز». */
  function isTextLayerRemoval(source){
    const s = String(source || '');
    const remove = /(?:احذف|امسح|شيل|ازل|أزل|اخف|أخف|remove|erase|delete|clear)/i.test(s) || /(?:^|[\s،,])(?:حذف|شل|ح[ّ]?و[ّ]?ز(?:ي|وا|ه|ها)?)(?=$|[\s،,.!?؟])/.test(s);
    if(!remove) return false;
    return /(?:النص|الكتابة|الكتابه|الكلام|الكلمات|الحروف|العبارة|العباره|هذا\s+الشي|هالشي|(?:هذا|هذي)(?!\s+(?!الشي)(?:ال)?[\u0621-\u064A])|text|writing|words?|letters?|this\s+(?:thing|text))/i.test(s);
  }
  /* أمر كتابة حقيقيّ غير منفيّ بعد الحذف («احذف الكلام واكتب X») — «المكتوب عليها» وصفٌ للمحذوف، و«اكتبه/لا تكتب» ليسا نصًّا جديدًا. */
  function writeCommandAt(source){
    const s = String(source || ''), re = /(^|[\s،,و])(اكتب(?:ي|لي)?|أكتب|حط|ضع|ضيف|أضف|اضف|write|put|add)(?=[\s:：«"']|$)/gi;
    let m;
    while((m = re.exec(s))){
      const at = m.index + m[1].length;
      if(!/(?:^|\s)(?:لا|ما|not|don'?t|never)\s*$/i.test(s.slice(Math.max(0, at - 10), at))) return { index:at, value:m[2] };
    }
    return null;
  }
  // أيّ نصّ يُحذف: «اللي تحت/فوق/يمين» أو «القديم/الجديد» — بلا هدف = كلّ الكتابة.
  const KEEP_CLAUSE_RE = /(?:^|[\s،,]+)و?\s*(?:خل|خلي|خلّي|خله|خليه|اترك|ابق|أبق|ابقي|keep|leave)(?=\s)[^،,]*?(?=[\s،,]+و?\s*(?:احذف|امسح|شيل|شل|حذف|ح[ّ]?و[ّ]?ز|ازل|أزل|remove|delete|erase)|$)/gi;
  function removalTarget(source){
    const all = stripOnImage(source), s = all.replace(KEEP_CLAUSE_RE, ' ');
    const t = targetWords(s);
    if(t || s === all) return t;
    const kept = targetWords((all.match(KEEP_CLAUSE_RE) || []).join(' '));
    return kept ? Object.assign(kept, { except:true }) : null; // «خل الجديد واحذف الباقي» = كلّ ما عدا الجديد
  }
  function targetWords(s){
    const age = /(?:القديم[ةه]?|الأول|الاول|الأولى|الاولى|السابق[ةه]?|\bold\b|\bfirst\b|\bprevious\b)/i.test(s) ? 'old'
      : (/(?:الجديد[ةه]?|الأخير[ةه]?|الاخير[ةه]?|الثاني[ةه]?|\bnew\b|\blast\b|\blatest\b|\bsecond\b)/i.test(s) ? 'new' : '');
    const side = /(?:يمين|\bright\b)/i.test(s) ? 'right' : (/(?:يسار|\bleft\b)/i.test(s) ? 'left' : '');
    const vertical = /(?:أعلى|اعلى|فوق|\btop\b)/i.test(s) ? 'top' : (/(?:وسط|منتصف|المركز|\bmiddle\b|\bcenter\b)/i.test(s) ? 'center' : (/(?:أسفل|اسفل|تحت|\bbottom\b)/i.test(s) ? 'bottom' : ''));
    return (age || side || vertical) ? { age, side, vertical } : null;
  }
  // «لا… بس مكتوب فيها X» / «بدل الكلام» = استبدال الكتابة الموجودة لا إضافة ثانية فوقها.
  // «لا تغيّر الصورة واكتب…» و«حلوة بس اكتب…» (بس = لكن) إضافة لا استبدال — «لا/مو» ردّ مستقلّ فقط.
  function isReplaceIntent(prefix, source){
    const pre = String(prefix || '').trim();
    return /^(?:لا|لأ|مو|مب)(?:\s*[،,.!?؟]|\s*$|\s+(?:(?:في|على|فوق)\s+)?(?:نفس\s+)?(?:الصورة|الصوره)(?=\s|$)|\s+(?:بس|فقط)(?=\s|$)|\s+(?:كذا|هذا|هذي|صح)(?=\s|$|[،,]))/i.test(pre)
      || /\binstead\b|\breplace\b/i.test(pre)
      || /(?:بدل|بدّل|بدال|مكان|غير|غيّر|غيري|غيّري|استبدل|صحح|صحّح)\s+(?:ال)?(?:كلام|نص|كتابة|كتابه|مكتوب|عبارة|عباره|كلمة|كلمه|قديم)/i.test(source || '');
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
  /* v-text-layers: «ابغي صوره» (فيديو المالك) لم تكن عامّة فوصلت المولّد وحدها بلا موضوع ⇒ صورة عشوائيّة. */
  const GENERIC_VISUAL_RE = /^(?:(?:أنشئ|انشئ|اصنع|ولد|ولّد|صمم|ارسم|ابغي|ابغى|أبغى|أبغي|ابي|أبي|ابى|أريد|اريد|بدي|ودي|عطني|أعطني|اعطني|هات|سوي|سوّي|create|generate|make|draw|i\s+want|give\s+me)\s*(?:لي\s*)?)?(?:صورة|صوره|image|picture)?\s*$/i;
  // «لا في الصوره بس» مقدّمة تصحيح لا وصف مشهد.
  const REPLY_LEADIN_RE = /^(?:لا|لأ|مو|مب)?\s*(?:كذا|هذا|هذي|صح)?\s*[،,]?\s*(?:(?:في|على|فوق)\s*)?(?:نفس\s+)?(?:الصورة|الصوره)?\s*(?:بس|فقط)?\s*$/i;
  // «احذف/غيّر الكلام (القديم/اللي تحت) واكتب…»: شطر الحذف أو الاستبدال أمرٌ للطبقة لا تعديلٌ بصريّ يُرسل للمولّد.
  const REMOVAL_CLAUSE_RE = /^(?:لا\s+)?(?:احذف|امسح|شيل|شل|حذف|ح[ّ]?و[ّ]?ز|ازل|أزل|غير|غيّر|غيري|غيّري|بدل|بدّل|استبدل|صحح|صحّح)\s+(?:ال)?(?:نص|كتابة|كتابه|كلام|كلمات|عبارة|عباره|مكتوب|[إا]سم)(?:\s+(?:القديم[ةه]?|الأول|الاول|السابق[ةه]?|(?:اللي|الي|الّي)\s+\S+))?\s*$/i;
  function isGenericVisual(v){ return !v || GENERIC_VISUAL_RE.test(v) || REPLY_LEADIN_RE.test(v) || REMOVAL_CLAUSE_RE.test(v); }
  function visualCore(source){
    const v = cleanVisual(stripOnImage(source).replace(WRITE_VERB_RE, ' ').replace(WITH_TYPE_RE, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s،,و]+|[\s،,]+$/g, ''));
    return isGenericVisual(v) ? '' : v;
  }
  function authorVisual(source, kind){ return visualCore(source) || fallbackVisual(kind, null); }
  function parseImageTextSpec(input){
    const source = String(input || '').replace(/\r\n?/g, '\n');
    // v-longtext-noimg (بلاغ المالك «قصّة نوح ما ترد»): نصّ طويل ملصوق ليس طلب
    // «صورة عليها نصّ». علامات مثل علامات الاقتباس أو «فيها/عليها» داخل قصّة
    // كانت تُرجع wantsText=true فيُختطف النصّ لمسار توليد صورة النصّ بدل المحادثة.
    // طلب الكتابة على صورة دائمًا قصير؛ أي نصّ >400 حرف = لا صورة، محادثة عادية.
    if(source.length > 400) return { wantsText:false, exactText:null, visualPrompt:source.trim(), fontKey:'default', color:'#ffffff', position:'bottom', styleEditLoose:null };
    // «احذف الكلام واكتب X» استبدال لا حذف — يكمل لقراءة النصّ الجديد.
    const removing = isTextLayerRemoval(source), writeCmd = removing ? writeCommandAt(source) : null;
    if(removing && !writeCmd) return { wantsText:false, exactText:null, visualPrompt:source.trim(), removeText:true, removeTarget:removalTarget(source), fontKey:'default', color:'#ffffff', position:'bottom', styleEditLoose:null };
    const styleEdit = writeCmd ? null : textStyleEdit(source), autoPrayer = (styleEdit || writeCmd) ? null : autoPrayerSpec(source), marker = writeCmd || (autoPrayer ? null : findTextMarker(source)); if(styleEdit) return { wantsText:false, exactText:null, visualPrompt:'', styleEdit, styleEditLoose:styleEdit };
    if(!marker) return autoPrayer ? { wantsText:true, exactText:null, visualPrompt:authorVisual(source, autoPrayer.kind), visualEdit:visualCore(source) || null, prayerRequest:autoPrayer.request, fontKey:textFont(source), color:textColor(source), position:textPlacement(source), positionAuto:!positionExplicit(source), kind:autoPrayer.kind, autoAuthored:true } : { wantsText:false, exactText:null, visualPrompt:source.trim(), fontKey:'default', color:'#ffffff', position:'bottom', styleEditLoose:textStyleEditLoose(source) };
    const literalPrayerText = /(?:النص|العبارة|الكلام|الكلمة|كلمة|text|words?)\s*(?:هو|is)?\s*[:：\-–—]?\s*(?:دعا[ءدهً]?|prayer|du[’']?a)(?=$|[\s،,.!?؟])/i.test(source.slice(marker.index));
    let rest = source.slice(marker.index + marker.value.length);
    rest = rest.replace(/^\s*(?:لي\s+)?/i, '');
    rest = rest.replace(/^\s*(?:عليها|عليه|فوقها|فيها|على\s+(?:هذه\s+)?(?:الصورة|الصوره)|فوق\s+(?:الصورة|الصوره)|on\s+(?:the\s+)?(?:image|photo|picture))\s*/i, '');
    rest = rest.replace(/^\s*(?:النص|العبارة|الكلام|الكلمة|كلمة|اسمي|اسم|the\s+text|text|words?|name|quote)?\s*(?:هو|وهو|التالي|is)?\s*[:：\-–—]?\s*/i, '');
    let visualTail = '';
    /* v-text-layers: ذيل المشهد أوسع من «الصورة تعبّر…»: «والصورة حزينة» و«بخلفية…» وصف لا نصّ، و«عن وفاة…» بعد
       عبارة عزاء تامّة مناسبةٌ لا جزء منها. داخل علامات الاقتباس لا يُقطع شيء. */
    const tailQuote = quotedValue(rest);
    const tailOk = (at) => at > 0 && (!tailQuote || at >= tailQuote.index + tailQuote.whole.length);
    let visualTailAt = rest.search(/\s+(?:و\s*)?(?:(?:تكون|يكون|خلي|خلّي|اجعل)\s+)?(?:الصورة|الصوره|المشهد|الخلفية|الخلفيه)\s+(?:تعبر|تعبّر|يعبر|يعبّر|تدل|يدل|توحي|يوحي|تظهر|يظهر|تكون|يكون|فيها|فيه|تحتوي|يحتوي)(?=\s|$)|\s+و\s*(?:الصورة|الصوره|المشهد|الخلفية|الخلفيه)\s+(?=(?!ال|ل)\S)|\s+(?:و\s*)?(?:بخلفية|بخلفيه|بخلفيّة)(?=\s+(?!(?:في|عن|من|ب)\s)\S|$)/i);
    if(!tailOk(visualTailAt)){
      const occ = /\s+(?:و\s*)?(?:عن|على|بمناسبة|بمناسبه|ل)\s*(?:وفاة|وفات|وفاه|رحيل|فقدان|فقد)(?=\s|$)/i.exec(rest);
      visualTailAt = (occ && /(?:[اإ]لي?ه\s+ل?(?:[رو]اجعون|رجعون)|البقاء\s*لله|الله\s*ير[حخ]م(?:ه|ها|هم))\s*$/.test(rest.slice(0, occ.index))) ? occ.index : -1;
    }
    if(tailOk(visualTailAt)){
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
    let exactText = null, suffix = '', styleSource = '';
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
      const dialectCut = rest.search(/\s+(?:و\s*)?(?:ا?يكون\s+)?(?:بخط|بالخط|بلون|باللون)\s+|\s+و\s*ا?يكون\s+|\s+(?:و\s*)?[أا]?لل?ون(?:ه|ها)?\s+ا?يكون\s+|\s+لا\s+تكتب\s+/i);
      if(dialectCut > 0){
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
    if(exactText == null || !exactText.trim() || /^(?:دعا[ءدهً]?|شعر|بيت\s+شعر|قصيدة|نص|كلام|prayer|poem|text)$/i.test(exactText.trim())){
      if(!kind && exactText && exactText.trim()) kind = requestKind(exactText.trim());
      exactText = null;
    }else if(!quoted && !literalPrayerText && looksLikeRequest(exactText)){
      // «اكتب كلام حلو» = طلب تأليف، لا نصّ يُطبَع حرفيًّا.
      if(!kind) kind = requestKind(exactText);
      exactText = null;
    }
    let visualPrompt = cleanVisual(source.slice(0, marker.index));
    if(isGenericVisual(visualPrompt)) visualPrompt = '';
    if(visualTail) visualPrompt = (visualPrompt + ' ' + visualTail).trim();
    const visualSuffix = suffix.replace(/(?:بخط|بالخط)\s+\S+(?:\s+(?:ذهبي(?:ة)?|أبيض|ابيض|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|بيج|gold|white|black|green|blue|red|beige))?|(?:بلون|باللون|لون\s+النص)\s+\S+|(?:واجعل|اجعل|وخلي|خلي)\s+النص\s+(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|الوسط|المنتصف|الأسفل|الاسفل)|(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|فوق|الوسط|المنتصف|المركز|الأسفل|الاسفل)|(?:on|in)\s+(?:the\s+)?(?:image|photo|picture|top|middle|center|bottom)/gi, '').replace(/^[\s،,و]+|[\s،,]+$/g, '');
    if(visualSuffix) visualPrompt = (visualPrompt + ' ' + visualSuffix).trim();
    const visualEdit = isGenericVisual(visualPrompt) ? null : visualPrompt;
    if(!visualEdit) visualPrompt = fallbackVisual(kind, exactText);
    else if(CONDOLENCE_TEXT_RE.test(exactText || '') && !CONDOLENCE_TEXT_RE.test(visualPrompt)) visualPrompt = 'مشهد تعزية بلا وجوه: ' + visualPrompt;
    return { wantsText:true, exactText, visualPrompt, visualEdit, replaceText:(isReplaceIntent(source.slice(0, marker.index), source) || (removing && !removalTarget(source.slice(0, marker.index)))) || undefined, removeTarget:(removing && removalTarget(source.slice(0, marker.index))) || undefined, fontKey:textFont(styleSource), color:textColor(styleSource), position:textPlacement(styleSource), positionAuto:!positionExplicit(styleSource), kind, prayerRequest:!exactText&&kind?source:undefined, autoAuthored:!exactText&&kind?true:undefined };
  }
  root.__parseImageTextSpec = parseImageTextSpec;
  root.__isExplicitImageEdit = isExplicitImageEdit;
  root.__imageWriteIntent = imageWriteIntent;
  if(typeof module !== 'undefined' && module.exports) module.exports = { parseImageTextSpec, isExplicitImageEdit, imageWriteIntent };
})(typeof window !== 'undefined' ? window : globalThis);
