/* تحليل طلب «الكتابة على الصورة» (إعادة كتابة من الصفر، نهج مختصر):
   ١) ما بين علامتي التنصيص حرفيّ دائمًا. ٢) الباقي تُقشَّر حوافّه بجداول مسمّاة (حشو، موضع، تنسيق، رابط، وسم)
   مرارًا حتّى يثبت، وما قُشِّر تعليماتٌ تُقرأ ولا تُطبع. ٣) ما بقي: نصّ حرفيّ، أو طلب تأليف، أو لا شيء (تنسيق فقط).
   العميل يرسم النصّ حرفيًّا؛ مولّد الصور لا يرى إلّا وصف المشهد. */
(function(root){
  const AL = '\\u0621-\\u064A';
  const B = '[\\s،,:：\\-–—()]';                                   /* فاصل بين الكلمات */
  const TRIM_RE = /^[\s،,:：\-–—()]+|[\s،,:：\-–—()]+$/g;
  /* كلمة كاملة في أيّ موضع: «ابني» ليست «بني»، و«أعلى الصورة» ليست «على الصورة» */
  const word = (alt, flags) => new RegExp('(?:^|[^' + AL + 'a-z])(?:' + alt + ')(?![' + AL + 'a-z])', flags || 'i');

  /* ── معجم الألوان (خريطة واحدة؛ الترتيب مهمّ: «وردي فاتح» قبل «وردي»، «سماوي» قبل «أزرق») ── */
  /* v-parser-review: صيغ الخليج بلا همزة («بيضا/سودا/حمرا») و«فوشي» و«بلون الذهب» و«الأزرق الفاتح» ألوانٌ لا نصّ */
  const TEXT_COLORS = [
    ['أصفر|اصفر|صفراء|صفرا|yellow', '#ffd400'],
    ['ذهبي|ذهبية|ذهبيه|لون\\s+(?:ال)?ذهب|golden|gold', '#f4cf65'],
    ['أسود|اسود|سوداء|سودا|black', '#111111'],
    ['أخضر|اخضر|خضراء|خضرا|green', '#2e8b57'],
    ['سماوي|سماويه|سماوية|لبني|(?:أزرق|ازرق)\\s+(?:ال)?فاتح|sky\\s*blue|light\\s*blue', '#5ec8ff'],
    ['كحلي|كحليه|كحلية|navy', '#1c2f66'],
    ['أزرق|ازرق|زرقاء|زرقا|blue', '#2979ff'],
    ['وردي\\s+(?:ال)?(?:فاتح|خفيف|هادي|هادئ)|light\\s*pink', '#ffb3d1'],
    ['وردي|ورديه|وردية|زهري|زهريه|زهرية|بمبي|بينك|فوشيا|فوشي|pink|fuchsia|magenta', '#ff4f9a'],
    ['بنفسجي|بنفسجيه|بنفسجية|موف|ليلكي|purple|violet|lilac', '#a05ad6'],
    ['برتقالي|برتقاليه|برتقالية|orange', '#ff8a1f'],
    ['عنابي|عنابيه|عنابية|خمري|maroon|burgundy', '#8e1b3a'],
    ['أحمر|احمر|حمراء|حمرا|red', '#d32f2f'],
    ['تركوازي|تركواز|فيروزي|turquoise|teal', '#18b6a4'],
    ['فضي|فضيه|فضية|لون\\s+(?:ال)?فض[ةه]|silver', '#d7dbe0'],
    ['رمادي|رماديه|رمادية|رصاصي|gr[ae]y', '#9aa0a6'],
    ['بني|بنيه|بنية|brown', '#8b5a2b'],
    ['بيج|beige', '#ead9bd'],
    ['أبيض|ابيض|بيضاء|بيضا|white', '#fdfdfd'] /* أبيض صريح ≠ الافتراضيّ #ffffff (= «انسجم مع الصورة») */
  ];
  const COLOR = TEXT_COLORS.map((c) => c[0]).join('|');
  const COLOR_RES = TEXT_COLORS.map((c) => [word('[وف]?(?:بال|لل|ال|ب|ل)?(?:' + c[0] + ')'), c[1]]);
  const hasColor = (s) => COLOR_RES.some((c) => c[0].test(s));
  /* v-font-pretty: كلمة جمال واحدة = الخطّ المزخرف (ديواني)، وبلا لون = الذهب المتدرّج */
  const PRETTY = 'م?زخرف[ةه]?|زخرفي|جميل[ةه]?|حلو[ةه]?|مرتب[ةه]?|أنيق[ةه]?|انيق[ةه]?|راقي[ةه]?|فخم[ةه]?|ملكي|مميز|رائع|فني|إبداعي|ابداعي|جذاب|beautiful|fancy|elegant|stylish|ornate|royal|decorative|calligraphy';
  /* v-image-fonts: أربعة خطوط فقط للصور — والأسماء الأخرى إلى أقربها: رقعة ← ديواني، نسخ/قرآني/عثماني ← ثلث، نستعليق ← فارسي */
  const FONTS = [['diwani', 'ديواني|diwani'], ['diwani', 'رقعة|رقعه|ruqaa|ruqa'], ['kufi', 'كوفي|kufi'], ['thuluth', 'ثلث|thuluth'], ['farsi', 'فارسي|نستعليق|farsi|nastaliq'], ['thuluth', 'عثماني|othmani|نسخ\\s*نوتو|نوتو|noto\\s*naskh|مصحف|قرآني|quran|نسخ|naskh']];
  const FONT_W = FONTS.map((f) => f[1]).join('|');
  const namedFont = (s) => { const f = FONTS.find((x) => new RegExp(x[1], 'i').test(s)); return f ? f[0] : null; };
  const PRETTY_RE = new RegExp(PRETTY, 'i');
  const PRETTY_FONT_RE = new RegExp('(?:^|[^' + AL + '])(?:ب|بال|ال|ل)?خط\\s+(?:\\S+\\s+)?(?:و\\s*)?(?:' + PRETTY + ')', 'i');
  function textFont(s){ return namedFont(s) || (PRETTY_RE.test(s) ? 'diwani' : 'default'); }
  function textColor(s){
    const c = COLOR_RES.find((x) => x[0].test(s));
    return c ? c[1] : (PRETTY_RE.test(s) ? '#f4cf65' : '#ffffff');
  }
  /* الحجم: المقارن («أصغر/كبّرها») قبل المطلق («صغير») */
  const SIZE_W = 'صغير[ةه]?|كبير[ةه]?|أصغر|اصغر|أكبر|اكبر|عريض[ةه]?|ضخم[ةه]?';
  const SIZES = [['smaller', 'و?(?:أصغر|اصغر|صغّ?ر(?:ه|ها|ي|وا)?|نقص|قلل|smaller|shrink)'], ['larger', 'و?(?:أكبر|اكبر|كبّ?ر(?:ه|ها|ي|وا)?|زيد|bigger|larger|enlarge)'],
    ['small', 'و?(?:بال|ال|ب)?(?:صغير[ةه]?|small|tiny)'], ['large', 'و?(?:بال|ال|ب)?(?:كبير[ةه]?|ضخم[ةه]?|عريض[ةه]?|big|large|huge)']].map((x) => [x[0], word(x[1])]);
  function textSize(s){ const z = SIZES.find((x) => x[1].test(s)); return z ? z[0] : null; }

  /* ── معجم المواضع (واحد للقراءة وللتقشير) ── */
  const PFX = '[وف]?(?:عا?ل|بال|فال|لل|ال|ب|ل)?';
  const SIDE_R = 'يمين(?:اً|ًا|ا)?|يمنى|أيمن|ايمن', SIDE_L = 'يسار(?:اً|ًا|ا)?|يسرى|أيسر|ايسر';
  const V_TOP = 'فوق|قوف|فوج|أعلى|اعلى|علوي[ةه]?', V_BOT = 'تحت(?:ها|ه)?|جوه|جوا|أسفل|اسفل|سفلي[ةه]?', V_MID = 'وسط|منتصف|مركز';
  const MID_NS = '(?:في|ف)\\s+(?:ال)?نص|(?:بال|فال|ب)نص';               /* «بالنص» موضع، و«النص» وحده اسم الكتابة */
  const CORE = PFX + '(?:' + [SIDE_R, SIDE_L, V_TOP, V_BOT, V_MID].join('|') + ')|' + MID_NS;
  const PREP = '(?:على|ع|عا|في|ف|من|الى|إلى|ل|ب|[وف]?(?:عا?ل|بال|فال|ال|ب|ف)?(?:جه[ةه]|جانب|جنب|ناحي[ةه]|طرف|ركن|صوب|زاوي[ةه]))';
  const UNIT = '(?:' + PREP + '\\s+){0,3}(?:' + CORE + ')(?:\\s+(?:من\\s+)?(?:ال|لل)صور[ةه])?';
  const EN_POS = '(?:(?:at|on|in|to)\\s+)?(?:the\\s+)?(?:(?:top|bottom|upper|lower)(?:[\\s-]+(?:left|right))?|left|right|middle|center|centre)(?:\\s+(?:corner|side))?(?:\\s+of\\s+(?:the\\s+)?(?:image|photo|picture))?';
  const POS_RUN = '(?:' + UNIT + ')(?:\\s+(?:و\\s*)?(?:' + UNIT + ')){0,3}|' + EN_POS;
  const CLAUSE_POS_RE = new RegExp('(?:^|\\s)و\\s*(' + POS_RUN + ')$', 'i');         /* موضع يفتح جملته بـ«و» قبل فعل الكتابة */
  const ON_IMAGE_RE = new RegExp('(?:^|[^' + AL + '])(?:(?:فوق|على)\\s*(?:هذه\\s*|هذي\\s*|هال)?(?:ال)?صور[ةه]|فوقها|فوقه)(?![' + AL + '])', 'gi');
  const NOT_POS_RE = /(?:^|\s)(?:مو|مش|موب|مب|not|اللي|الي|التي|الذي)\s+(?:على\s+|في\s+|من\s+)?\S+/gi; /* «مو اليسار»، «اللي تحت» ليسا موضعًا */
  const P_RIGHT = word(PFX + '(?:' + SIDE_R + ')|right'), P_LEFT = word(PFX + '(?:' + SIDE_L + ')|left');
  const P_TOP = word(PFX + '(?:' + V_TOP + ')|top|upper'), P_BOT = word(PFX + '(?:' + V_BOT + ')|bottom|lower'), P_MID = word(PFX + '(?:' + V_MID + ')|' + MID_NS + '|middle|center|centre');
  /* يمين/يسار بلا عمود = «جانب-وسط» مع positionFlex (للراسم أن يختار أعلى/وسط/أسفل ذلك الجانب) */
  function positionOf(src){
    const s = String(src || '').replace(ON_IMAGE_RE, ' ').replace(NOT_POS_RE, ' ');
    const side = P_RIGHT.test(s) ? 'right' : (P_LEFT.test(s) ? 'left' : '');
    const v = P_TOP.test(s) ? 'top' : (P_BOT.test(s) ? 'bottom' : (P_MID.test(s) ? 'center' : ''));
    if(!side && !v) return null;
    return { position: side ? side + '-' + (v || 'center') : v, flex: !!side && !v };
  }

  /* ── جداول التقشير: تُنزع من طرفي النصّ غير المنصَّص حتّى يثبت ── */
  /* v-parser-review: علامة الترقيم المفصولة والإيموجي بعد عبارة التعليمات لا تحجبها («على اليمين 🙏»، «على اليمين ؟») */
  const EMO = '(?:[\\u2600-\\u27BF\\u2B50\\uFE0F\\u200D]|\\uD83C[\\uDC00-\\uDFFF]|\\uD83D[\\uDC00-\\uDFFF]|\\uD83E[\\uDD00-\\uDFFF])';
  const END_TAIL = '(?:\\s*(?:[.!؟?…]|' + EMO + '))*$';
  /* «…وخليه كبير»، «…وخله صغير»: فعل الربط (بالواو) قائدُ تنسيق — من اليمين يُقرأ ما بعده، و«خلها على الله» بلا واو نصّ */
  const STYLE_LEAD = '(?:و\\s*)?(?:ا?يكون\\s+)?(?:بخط|بالخط|بلون|باللون|ب?لون(?:ه|ها)|لون\\s+(?:النص|الخط|الكتاب[ةه]|الكلام))|(?:و\\s*)?(?:بال|ب|لل)(?:' + COLOR + ')|(?:و\\s*)?بال(?:' + FONT_W + ')|(?:و\\s*)?ب?حجم|(?:و\\s*)?(?:ال)?خط(?=\\s+(?:' + FONT_W + '))|و\\s*(?:خليه|خله|خلّه|خلها|خليها|خلّيها|اجعله|اجعلها|ا?يكون|تكون|حطه|حطها)|in\\s+(?:' + COLOR + ')|big|small|large|bigger|smaller|bold';
  const STYLE_WORD = '(?:و\\s*)?(?:بال|ال|ب)?(?:' + COLOR + '|' + SIZE_W + '|' + PRETTY + '|' + FONT_W + '|فاتح|غامق|خفيف|هادي|هادئ|خط|لون|لونه|لونها)';
  const STYLE_RUN = '(?:' + STYLE_LEAD + ')(?:\\s+(?:' + STYLE_LEAD + '|' + STYLE_WORD + ')){0,5}';
  /* «وخل الكتابة (يمين)»: فاعل التعليمة هو كتابتنا — يُقرأ إن لاصق موضعًا أو تنسيقًا */
  const SUBJECT = '(?:و\\s*)?(?:خل|خلّ|خلي|خلّي|خليه|خليها|خله|خلها|حط|حطي|اجعل|سو|سوي|ا?يكون|تكون|ابي|أبي|ابغى|أبغى)\\s+(?:لي\\s+)?ال(?:كتاب[ةه]|كلام|نص|خط|مكتوب|كلمات)|و\\s*ال(?:كتاب[ةه]|كلام|نص|خط|مكتوب|كلمات)' +
    '|(?:و\\s*)?ال(?:كتاب[ةه]|كلام|نص|خط|مكتوب|كلمات)\\s+(?:ا?يكون|تكون|خله|خليه|خلها|خليها|ابيه|أبيه|ابيها|أبيها|ابغاه|ابغاها)';   /* «الكلام يكون يمين، اكتب…» */
  /* v-parser-review-2: «له/لها/لك/لكم» مستلِمٌ يُقشَّر فقط قبل إطار كتابة (تهنئة، تحيّة، طلب تأليف، اسم) — «اكتب له الجنة»،
     «اكتب لك وحشة»، «اكتب لكم منا أجمل التهاني» جملٌ للمستخدم تبقى كاملة */
  const FOR_FRAME = '(?:ال)?(?:كلام|كلمات|كلم[ةه]|عبار[ةه]|عبارات|جمل[ةه]|دعا[ءدهً]?|[أا]دعي[ةه]|شعر|قصيد[ةه]|بيت|[أا]بيات|غزل|تهنئ[ةه]|معايد[ةه]|رسال[ةه]|خاطر[ةه]|تعليق|شي|شيء|آي[ةه]|حديث|ذكر|كابشن|اسم\\S*)' +
    '|مبروك[ةه]?|مبارك|[أا]لف|كل\\s+عام|كل\\s+سن[ةه]|عيد\\S*|(?:الله|ربي)\\s+ي\\S{2,}|عساك|عساه|عساها|تستاهل\\S*|يستاهل|تهاني(?:نا)?|شكر[اًا]*|مشكور[ةه]?|يعطيك|صباح|مساء|تصبح\\S*|سلامات|سلامتك|الحمد\\s+لله\\s+على|حمد\\s+لله|يا\\s+\\S+|[أا]هلا|هلا|مرحبا|حياك\\S*|نورت\\S*|منور[ةه]?|[أا]حبك|بحبك|وحشتني|happy|congrat\\S*|thank\\S*|welcome|good\\s+(?:morning|night|luck)';
  const TABLES = [
    { name:'filler', L:'لي|لنا|(?:له|لها|لهم|لك|لكم)(?=[\\s:：]+(?:' + FOR_FRAME + ')(?![' + AL + ']))|تكفى|تكفا|بس|كذا|بال(?:عربي|انجليزي|إنجليزي|انقليزي|إنقليزي)|in\\s+(?:english|arabic)|[وف]?(?:عليها|عليه|فيها|فوقها|فوقه)|(?:على|فوق|في)\\s+(?:هذه\\s+|هذي\\s+)?(?:ال|هال)صور[ةه](?:\\s+نفسها)?|on\\s+(?:it|(?:the|this)\\s+(?:image|photo|picture))|بدال(?:ها|ه)|مكان(?:ها|ه)|لو\\s+سمحت|من\\s+فضلك|please',
      R:'(?:على|فوق|في)\\s+(?:هذه\\s+|هذي\\s+)?(?:ال|هال)صور[ةه](?:\\s+نفسها)?|عليها|فيها|لو\\s+سمحت|لو\\s+تكرمت|من\\s+فضلك|تكفى|تكفا|تكفين|تكفون|و\\s*بس|و?\\s*خلاص|(?:مثل|زي)\\s+ما\\s+قلت(?:\\s+لك)?|please|pls|plz|' +
        '(?:و\\s*)?(?:(?:ال)?صور[ةه]\\s+)?(?:لا|ما)\\s+(?:تغير|تغيّر|تعدل|تعدّل|تلمس|تمس|تخرب)(?:ها|ين|ون)(?:\\s+(?:ابد[اًا]?|أبد[اًا]?))?|(?:on|to)\\s+(?:it|(?:the|this)\\s+(?:image|photo|picture))|(?:بدون|بلا|دون|من\\s+غير)\\s*(?:أي\\s*)?(?:تغيير|تغير|تعديل|مساس|لمس)(?:\\s*(?:في|على|ل)?\\s*(?:ال)?صور[ةه])?' +
        '|(?:و\\s*)?(?:(?:لا|ما)\\s+|بدون\\s+ما\\s+)(?:تغير|تغيّر|تعدل|تعدّل|تلمس|تمس|تخرب)(?:\\s+(?:شي|شيء|أي\\s+شي|اي\\s+شي))?(?:\\s+(?:في|على|ب))?\\s*(?:ال)?صور[ةه](?:\\s+(?:ابد[اًا]?|أبد[اًا]?))?' },
    { name:'position', L:POS_RUN, R:POS_RUN },
    { name:'style', L:STYLE_RUN, R:STYLE_RUN + '|و\\s*(?:' + SIZE_W + ')' },   /* «…بالنص وكبير» */
    { name:'bare', R:'(?!بني)(?:' + COLOR + ')(?:\\s+(?:و\\s*)?(?:' + COLOR + '|' + SIZE_W + '|(?:ال)?فاتح|(?:ال)?غامق))*' },   /* «مشكور اخوي احمر وكبير»، «احمر غامق» */
    { name:'subject', L:SUBJECT, R:SUBJECT },
    { name:'link', R:'(?:و\\s*)?(?:يكون|خليه|خله|خلّه|خل|خلي|خلّي|خلها|خليها|حط|حطه|حطها|اجعله|اجعلها|تكون|ايكون)|و' },
    { name:'label', L:'اسمه|اسمها|اسمي|اسم\\s+(?:بنتي|ولدي|ابني|أمي|امي|ابوي|أبوي|زوجتي|زوجي|اختي|أختي|اخوي|أخوي|حبيبي|حبيبتي|صديقي|صديقتي|محلي|شركتي|مطعمي|مشروعي|متجري|فريقي|المحل|الشركة|الشركه|المطعم|المشروع|المتجر|الكافيه|الكوفي|المقهى|العريس|العروس|المولود|المولودة|المولوده|الطفل|الطفلة|البنت|الولد|الفريق)|اسم|my\\s+name|the\\s+name|name|the\\s+text|text', textOnly:true }
  ].map((t) => ({ name:t.name, textOnly:t.textOnly, L:t.L && new RegExp('^(?:' + t.L + ')(?=' + B + '|$)', 'i'), R:t.R && new RegExp('(?:^|' + B + ')(' + t.R + ')' + END_TAIL, 'i') }));
  const INSTR_TABLES = TABLES.filter((t) => /^(?:filler|position|style|bare)$/.test(t.name));
  const LABEL_TABLE = TABLES.find((t) => t.name === 'label');
  /* الاسمان «يمنى/يسرى» وحدهما بعد الفعل أو الوسم نصٌّ لا موضع («اكتب اسمي يسرى على اليسار») */
  const NAME_POS_RE = /^[\s،,]*(?:يمنى|يسرى)(?=[\s،,]|$)/;
  const IDAFA_MID_RE = /(?:^|\s)(?:وسط|منتصف|يمين|يسار)\s*$/;                 /* مجرّدة يليها معرَّف: «وسط البلد»، «يمين الله» */
  /* في النصّ: «ملك اليمين» تبقى (كلمة معرَّفة وحدها بلا حرف جرّ)، و«اكتب وردي» تبقى (لون مجرّد بلا نصّ قبله) */
  function allowed(t, piece, rest, isText, side, prev){
    if(!isText) return true;
    if(t.name === 'position'){
      if(/^[وف]?ال\S+$/.test(piece.trim())) return false;
      if(NAME_POS_RE.test(piece) && !String(rest).replace(LABEL_TABLE.L, '').replace(TRIM_RE, '')) return false;
      if(side === 'L' && IDAFA_MID_RE.test(piece) && /^[\s،,]*ال(?!صور)\S/.test(rest)) return false;   /* «وسط البلد» إضافة لا موضع */
    }
    if(t.name === 'bare' && !rest.trim()) return false;
    if(t.name === 'subject') return side === 'R' ? /^(?:position|style|bare)$/.test(prev || '') : INSTR_TABLES.some((x) => x.L && x.L.test(String(rest).replace(TRIM_RE, '')));
    return true;
  }
  /* ذيل كلاميّ بعد عبارة تعليمات («…على اليمين الله يعافيك / شوي / وخلاص / عشان تبان») لا يحجبها: يُقرأ ولا يُطبع */
  const TAIL_B_RE = new RegExp('(?:^|' + B + ')((?:[.!؟?…،,]|' + EMO + ')+|الله\\s+(?:يعافيك|يخليك|يسعدك|يحفظك|يجزاك\\s+خير)|يعطيك\\s+العافي[ةه]|يا\\s*(?:ال)?غالي|يالغالي|بس|شوي|و?شكرا|و?شكراً|thanks|thx|(?:عشان|علشان|حتى)(?:\\s+\\S+){1,4}|كبير[ةه]?|صغير[ةه]?|ضخم[ةه]?|عريض[ةه]?)' + END_TAIL, 'i');
  /* جهةٌ معرَّفة («على اليمين») كاملةٌ لا تضاف لما بعدها: كلمة أو كلمتان مجهولتان بعدها لا تحجبانها — تُقرأ الجهة
     ويبقى ما بعدها نصًّا («…على اليمين يالطيب»)؛ أمّا «على يمين العرش» فإضافة تبقى نصًّا كما هي */
  const SIDE_DEF_RE = new RegExp('(?:^|' + B + ')((?:' + PREP + '\\s+){0,3}[وف]?(?:عا?ل|بال|فال|لل|ال)(?:' + SIDE_R + '|' + SIDE_L + ')(?:\\s+(?:من\\s+)?(?:ال|لل)صور[ةه])?(?:\\s+(?:و\\s*)?(?:' + UNIT + ')){0,2})\\s+((?!ال)[^\\s«»"\']+(?:\\s+[^\\s«»"\']+){0,2})' + END_TAIL, 'i');
  const SIDE_WORD_RE = new RegExp('(?:عا?ل|بال|فال|لل|ال)(?:' + SIDE_R + '|' + SIDE_L + ')\\s+\\S');      /* فحص رخيص قبل التعبير الكبير */
  const endsWithInstr = (x) => INSTR_TABLES.some((t) => { const r = t.R && t.R.exec(x); return r && allowed(t, r[1], x.slice(0, r.index), true, 'R'); });
  /* v-parser-review-2: جملة «و…» بعد الجهة نصٌّ للمستخدم («…على اليمين ولله الحمد») إلّا أن تكون هي أمرًا للتطبيق («وخله…»، «ولا تغير…») */
  const INSTR_CLAUSE_RE = /^و\s*(?:(?:لا|ما)\s+(?:تغير|تغيّر|تعدل|تعدّل|تلمس|تمس|تخرب|تكتب|تحط|تضيف|تشيل|تمسح|تحذف|تكبر|تصغر|ابي|أبي|ابغى|أبغى)|بدون|بلا|خل|خلّ|خلي|خلّي|خليه|خليها|خله|خلها|حط|حطه|حطها|حطي|اجعل|اجعله|اجعلها|سو|سوي|سوّي|كبر|كبّر|كبره|كبرها|صغر|صغّر|صغره|صغرها|غير|غيّر|لون|لوّن|ضيف|اضف|أضف|شيل|امسح|احذف|ارسم|تكون|يكون|ايكون|خلاص|شكر\S*|ال(?:خط|كتاب[ةه]|كلام|نص|مكتوب|كلمات|لون|حجم)|(?:ب|بال)?(?:خط|لون|حجم)|لون(?:ه|ها))(?=\s|$)/;
  const INSTR_TAIL2_RE = new RegExp('^و\\s*(?:(?:لا|ما)\\s+ت\\S+(?:ه|ها|هم)|(?:حجم|خط|لون|شكل)(?:ه|ها)|' + PRETTY + '|واضح[ةه]?|بشكل\\s+\\S+|نفس(?:\\s+ال\\S+)?|تكفى|تكفين|يا\\s*ليت\\S*)(?=[\\s،,.!؟?]|$)');
  const instrClause = (x) => INSTR_CLAUSE_RE.test(x) || INSTR_TAIL2_RE.test(x) || !peel(x, [], false).replace(/[\s،,.!؟?]+/g, '');
  function peelTail(s, out){
    const tb = TAIL_B_RE.exec(s), tbBefore = tb ? s.slice(0, tb.index).replace(TRIM_RE, '') : '';
    if(tbBefore && endsWithInstr(tbBefore)){ out.push(tb[1]); return tbBefore; }
    const sd = SIDE_WORD_RE.test(s) && SIDE_DEF_RE.exec(s), sdBefore = sd ? s.slice(0, sd.index).replace(TRIM_RE, '') : '';
    if(sdBefore && allowed(TABLES[1], sd[1], sdBefore, true, 'R')){
      out.push(sd[1]); if(/^و/.test(sd[2]) && instrClause(sd[2])){ out.push(sd[2]); return sdBefore; }
      return sdBefore + ' ' + sd[2];
    }
    return null;
  }
  /* الطرف الأيمن: أقصر عبارة مقبولة — إن رُفضت «يمنى على اليمين» كلّها جُرّبت «على اليمين» وحدها */
  function execRight(t, s, isText, prev){
    for(let from = 0; from < s.length;){
      const r = t.R.exec(s.slice(from));
      if(!r) return null;
      const at = from + r.index;
      if(allowed(t, r[1], s.slice(0, at), isText, 'R', prev)) return { index:at, piece:r[1] };
      const sp = s.slice(at + 1).search(/\s/);
      if(sp < 0) return null;
      from = at + 1 + sp;
    }
    return null;
  }
  function peel(src, out, isText, skip){
    let s = String(src || '').replace(TRIM_RE, ''), prev = '';
    for(let guard = 0; guard < 40; guard++){
      let hit = false;
      for(const t of TABLES){
        if((t.textOnly && !isText) || (skip && skip.indexOf(t.name) >= 0)) continue;
        const l = t.L && t.L.exec(s);
        if(l && allowed(t, l[0], s.slice(l[0].length), isText, 'L', prev)){ out.push(l[0]); s = s.slice(l[0].length); hit = t.name; break; }
        const r = t.R && execRight(t, s, isText, prev);
        if(r){ out.push(r.piece); s = s.slice(0, r.index); hit = t.name; break; }
      }
      if(!hit && isText){ const tl = peelTail(s, out); if(tl != null){ s = tl; hit = 'tail'; } }
      s = s.replace(TRIM_RE, '');
      if(!hit) break;
      prev = hit;
    }
    return s;
  }
  /* ذيل المشهد («و الخلفيه زرقاء»، «وتكون فيها العاب نارية»، «والصورة تعبّر عن…») يذهب للمولّد لا فوق الصورة */
  const SCENE_RE = /(?:^|\s)و\s*(?:ال)?(?:صور[ةه]|خلفي[ةه]|مشهد|رسم[ةه])(?=\s+(?!ال|ل)\S|$)|(?:^|\s)و\s*(?:ت|ي)عبّ?ر\s+عن\s+|(?:^|\s)و\s*(?:تكون|يكون|خل|خلي|خلّي|خله|خلها|اجعل|اجعلها|سو|سوي|سوّي|حط|ضيف|أضف|اضف|ارسم)\s+(?:لي\s+)?(?:فيها|فيه|عليها|ال?صور[ةه]|ال?خلفي[ةه]|المشهد|لون\s+ال?خلفي[ةه])(?=\s|$)|\s+(?:(?:تكون|يكون|خلي|خلّي|اجعل)\s+)?ال(?:صور[ةه]|مشهد|خلفي[ةه])\s+(?:تعبر|تعبّر|يعبر|يعبّر|تدل|يدل|توحي|يوحي|تظهر|يظهر|تكون|يكون|فيها|فيه|تحتوي|يحتوي)(?=\s|$)|(?:^|\s)(?:و\s*)?مع\s+(?:ال)?خلفي[ةه](?=\s|$)/i;
  /* v-parser-review: «…وخل الصورة زي ما هي / على حالها / نفسها» طلبُ إبقاء لا وصفُ مشهد — لا يذهب للمولّد */
  const KEEP_PHOTO_RE = /^(?:(?:خل|خلّ|خلي|خلّي|خليها|خلها|اترك|اتركها|خلوا|ابي|أبي|ابغى|أبغى)\s+)?(?:ال)?(?:صور[ةه]|خلفي[ةه])\s+(?:(?:تبقى|تظل|تكون)\s+)?(?:(?:زي|مثل|كما|كذا)\s*(?:ما\s+)?(?:هي|هو|كانت)|على\s+حال(?:ها|ه)|نفس(?:ها|ه)|بدون\s+(?:أي\s+|اي\s+)?(?:تغيير|تعديل)|(?:ما|لا)\s+(?:تتغير|تتغيّر))\s*[.!؟?]*$/i;
  function cutScene(s, minAt){
    const i = s.search(SCENE_RE);
    return i >= minAt ? [s.slice(0, i), s.slice(i).replace(/^[\s،,]*و?\s*/, '').trim()] : [s, ''];
  }
  const sceneOf = (clause, ins) => { if(KEEP_PHOTO_RE.test(clause)){ ins.push(clause); return ''; } return clause; };
  /* v-tail-dialect: أوّل «بخط/بلون/ويكون/ألون ايكون/لا تكتب» بعد النصّ يقطعه — ما بعده أوامر تُقرأ ولا تُطبع */
  const CUT_RE = /\s+(?:و\s*)?(?:ا?يكون\s+)?(?:بخط|بالخط|بلون|باللون)(?=\s|$)|\s+و\s*ا?يكون\s+|\s+(?:و\s*)?[أا]?لل?ون(?:ه|ها)?\s+ا?يكون\s+|\s+(?:و\s*)?ب?لون(?:ه|ها)\s+(?=\S)|\s+لا\s+تكتب(?:\s+|$)/i;
  /* قبل «:» كلمات وسمٍ فقط؟ فما بعدها نصّ حرفيّ («اكتب كذا: الله يحفظك»، «النص: دعاء للوالدين») */
  const LABEL_WORD_RE = /^(?:ال)?(?:نص|عبار[ةه]|كلم[ةه]|كلام|جمل[ةه])$|^(?:اسمي|اسم|التالي|التالية|التاليه|هو|كذا|هذا|هذي|هذه|بس|فقط|وحد[ةه]|واحد[ةه]|text|the|name|my|following)$/i;

  /* ── أفعال الكتابة (R3): القويّ دائمًا، و«مكتوب عليها»، وتنصيص موضوع، والضعيف (حط/ضيف) مع اسم نصّ أو تنصيص فقط ── */
  const QUOTE_PAIRS = { '«':'»', '“':'”', '"':'"', "'":"'" };
  function findQuotes(src){
    const out = []; let i = 0;
    while(i < src.length){
      const ch = src[i], close = QUOTE_PAIRS[ch];
      if(close && !(ch === "'" && i > 0 && /[A-Za-z0-9]/.test(src[i - 1]))){
        let j = src.indexOf(close, i + 1);
        if(ch === "'") while(j > 0 && j + 1 < src.length && /[A-Za-z]/.test(src[j + 1])) j = src.indexOf(close, j + 1);
        if(j > i){ out.push({ index:i, end:j + 1, value:src.slice(i + 1, j) }); i = j + 1; continue; }
      }
      i++;
    }
    return out;
  }
  function quotedValue(s){ s = String(s || ''); const q = findQuotes(s)[0]; return q ? { index:q.index, whole:s.slice(q.index, q.end), value:q.value } : null; }
  const unquote = (s) => { s = String(s || ''); let out = '', at = 0; findQuotes(s).forEach((q) => { out += s.slice(at, q.index) + ' «» '; at = q.end; }); return out + s.slice(at); };
  const TEXT_NOUN_W = '(?:ال)?(?:نص|عبار[ةه]|كلام|كلم[ةه]|كلمات|جمل[ةه]|اسمي|اسم|عنوان(?:ًا|ا|اً)?|تعليق|دعا[ءدهً]?|[أا]دعي[ةه]|شعر|تهنئ[ةه]|حكم[ةه]|اقتباس|خاطر[ةه])(?=$|[\\s:：«"\'\\-–—])|(?:(?:the|my|a|an|some)\\s+)?(?:[a-z]+\\s+)?(?:text|name|words?|quote|caption|title|message)\\b';
  const MARKERS = [
    ['strong', /(?:^|[\s،,.!؟?:«"])([وف]?(?:اكتب(?:ي|وا|لي|يلي|ه|ها|يه|يها)?|أكتب(?:ي|لي)?|كتبلي|كتبيلي|تكتب(?:ي|ين|ون|ها|ه|لي|يلي|يها|يه)?|كتاب[ةه]|write|type|مكتوب[ةه]?\s+(?:عليها|عليه|فيها|على\s+(?:هذه\s+)?(?:ال)?صور[ةه])))(?=$|[\s،,.!؟?:：«"'])/gi],
    ['placed', /(?:^|[\s،,])([وف]?(?:عليها|عليه|فيها|فوقها|تتضمن|تحمل)|على\s+(?:هذه\s+)?(?:ال)?صور[ةه]|with|containing)(?=\s*(?:(?:عبار[ةه]|النص|نص|كلم[ةه]|الكلام|اسم|دعا[ءدهً]?|شعر|بيت\s+شعر|the\s+text|text|words?|name|quote)\s*)?[«“"'])/gi],
    ['weak', /(?:^|[\s،,.!؟?])([وف]?(?:حط(?:لي|ي|وا)?|ضع(?:ي)?|أضف|اضف|ضيف(?:ي|لي)?|put|add))(?=$|[\s:«"'])/gi]
  ];
  const WEAK_OBJ_RE = new RegExp('^\\s*(?:لي\\s+)?(?:(?:عليها|عليه|فوقها|فيها|على\\s+(?:ال)?صور[ةه])\\s+)?(?:' + TEXT_NOUN_W + ')', 'i');
  /* v-parser-review: الأمر للتطبيق وحده كتابة. «تكتب/كتابة/type» طلبٌ فقط في إطار الطلب («ممكن تكتب»، «ابيك تكتب»،
     «الرجاء كتابة»، «مع كتابة»، أوّل الرسالة) أو يليها «عليها/لي/تنصيص» — «ولد يكتب»، «آلة كتابة»، «can type fast» وصفٌ للمشهد */
  const FRAMED_RE = /^[وف]?(?:تكتب|كتاب|type)/i;
  const ASK_FRAME_RE = /(?:^|[\s،,])(?:ممكن|تقدر|تقدرين|تقدرون|يمديك|لو\s+سمحت|لو\s+تكرمت|من\s+فضلك|ابيك|أبيك|ابغاك|أبغاك|ابغيك|اريدك|أريدك|ودي|بدي|ابي|أبي|ابغى|أبغى|ابغا|ابغي|اريد|أريد|نبي|نبغى|يا\s*ليت|ياليت|عسى|الرجاء|رجاء|رجاءً|مع|please|pls|plz|can\s+you|could\s+you|would\s+you)(?:\s+(?:انك|إنك|ان|أن|إن))?\s*$/i;
  const AFTER_FRAME_RE = /^\s*(?:(?:عليها|عليه|فيها|فوقها|فوقه|لي|لنا|على\s+(?:هذه\s+|هذي\s+)?(?:ال)?صور[ةه])(?=$|[\s،,.!؟?:«"'])|[«“"'])/;
  /* النفي: «لا تكتب» (مضارع مجزوم)، «ما ابيك تكتب»؛ أمّا «لا اكتب…» فـ«لا» فيها تصحيح والأمر قائم */
  const NEG_BEFORE_RE = /(?:^|\s)(?:ما|مو|بدون|بلا|دون|غير|not|don'?t|never)(?:\s+(?:ابي|أبي|ابغى|أبغى|ابغا|اريد|أريد|ودي|بدي|ابيك|أبيك|ابغاك|أبغاك|ابغيك|اريدك|أريدك|بغيتك))?(?:\s+(?:انك|إنك|ان|أن))?\s*$/i;
  /* v-parser-review-2: «وتكتب» معطوفةٌ على أمرٍ للتطبيق أوّلَ الرسالة («ارسم قمر وتكتب…»، «ممكن ترسم وردة وتكتب…»، «ابيك تسوي صورة وتكتب…»)
     كتابة، ما لم يسبقها فعلُ وصفٍ للمشهد («ارسم بنت تقرأ وتكتب»)؛ و«صورة عليها كتابة مبروك» كتابة، أمّا «فيها كتابة بخط اليد/عربية» فوصف */
  const APP_VERB = 'ارسم|ارسمي|ارسملي|سو|سوي|سوّي|سولي|سويلي|صمم|صمّم|صممي|اصنع|ولد|ولّد|أنشئ|انشئ|اعمل|عطني|اعطني|أعطني|عطيني|هات|جيب|ترسم|ترسمي|ترسملي|تسوي|تسوين|تسويلي|تصمم|تصمملي|تعطيني|تعمل|تصنع|تجيب|تجيبلي|draw|make|create|generate|design';
  const ASK_W = 'ممكن|تقدر|تقدرين|يمديك|لو\\s+سمحت|ابيك|أبيك|ابغاك|أبغاك|ابغيك|اريدك|أريدك|ودي|بدي|ابي|أبي|ابغى|أبغى|ابغا|اريد|أريد|please|can\\s+you|could\\s+you';
  const APP_CMD_START_RE = new RegExp('^[\\s،,]*(?:(?:' + ASK_W + ')(?:\\s+(?:انك|إنك|ان|أن))?\\s+(?:(?:لي\\s+)?صور[ةه]|' + APP_VERB + ')|' + APP_VERB + ')(?=[\\s،,]|$)', 'i');
  const KITABA_DESC_RE = new RegExp('^\\s*(?:$|[.!؟?]|[وف]?(?:بال|ب|ال)?(?:خط|لون|حجم|يد|يدوي[ةه]?|عربي[ةه]?|انجليزي[ةه]?|إنجليزي[ةه]?|قديم[ةه]?|واضح[ةه]?|كثير[ةه]?|غريب[ةه]?|غامض[ةه]?|[جغ]رافيتي|نيون|graffiti|neon|قلم|رصاص|طباشير|حبر|فرشا[ةه]|' + SIZE_W + '|' + COLOR + '|' + PRETTY + ')(?![' + AL + 'a-z]))', 'i');
  /* مراجعة (الجولة ٣): شخص في المشهد قبل «وتكتب» = هو الكاتب في الصورة، لا أمر للتطبيق */
  const PERSON_RE = /(?:^|\s)(?:ال)?(?:بنت|بنات|بنيّ?[ةه]|ولد|اولاد|أولاد|عيال|طفل|طفل[ةه]|اطفال|أطفال|رجل|رجال|امرأ[ةه]|امراه|مرأ[ةه]|حرم[ةه]|شخص|اشخاص|أشخاص|طالب|طالب[ةه]|طلاب|معلم|معلم[ةه]|مدرس|مدرس[ةه]|شاب|شاب[ةه]|فتا[ةه]|فتى|صبي|صبي[ةه]|بزر|ياهل|كاتب|كاتب[ةه]|موظف|موظف[ةه]|دكتور|دكتور[ةه]|جد[ةه]?|ام|أم|ابو|أبو|قط[ةه]?|girl|boy|man|woman|child|kid|student)(?=[\s،,]|$)/i;
  function joinedWrite(s, at, end, word){
    if(/^و\s*تكتب/.test(word)){
      const head = APP_CMD_START_RE.exec(s);
      if(!head || head[0].length > at || !/\S/.test(s.slice(end))) return false;
      const prev = s.slice(head[0].length, at).trim().split(/\s+/).pop() || '', obj = /^\s*(?:على|في|فوق)\s+(ال\S+)/.exec(s.slice(end));
      if(obj && !/صور[ةه]/.test(obj[1]) && !positionOf(obj[0])) return false;      /* «…وتكتب على السبورة» مشهد */
      if(PERSON_RE.test(s.slice(head[0].length, at))) return false;                /* «ارسم بنت جالسة وتكتب رسالة» الشخص في المشهد هو الكاتب */
      return !/^ت\S{2,}[^ةه]$/.test(prev);                                         /* «بنت تقرأ وتكتب» فعلُ وصف */
    }
    return /^كتاب/.test(word) && /(?:^|\s)(?:عليها|عليه|فيها|فيه|فوقها|فوقه)\s*$/.test(s.slice(0, at)) && !KITABA_DESC_RE.test(s.slice(end));
  }
  function liveWriteVerb(s, at, end, word){
    const before = s.slice(Math.max(0, at - 22), at);
    if(NEG_BEFORE_RE.test(before) || (/(?:^|\s)لا\s*$/.test(before) && /^[وف]?[تي]/.test(word))) return false;
    if(!FRAMED_RE.test(word)) return true;
    const lead = s.slice(0, at).replace(/[\s،,.!؟?:«"]+$/, '');
    if(/^type/i.test(word)) return !lead || /^(?:please|pls|plz|can\s+you|could\s+you|would\s+you)$/i.test(lead);
    return !lead || ASK_FRAME_RE.test(s.slice(0, at)) || /^[وف]?تكتب(?:لي|يلي)$/.test(word) || AFTER_FRAME_RE.test(s.slice(end))
      || (/^[وف]?كتاب/.test(word) && /^\s*(?:\S+\s+){0,2}?[«“"']/.test(s.slice(end))) || joinedWrite(s, at, end, word);
  }
  function findMarker(source){
    const raw = String(source || ''), map = [];
    let s = '';
    for(let i = 0; i < raw.length; i++){ if(/[\u0640\u064B-\u065F\u0670]/.test(raw[i])) continue; map.push(i); s += raw[i]; }
    map.push(raw.length);
    let best = null;
    MARKERS.forEach(([kind, re]) => {
      re.lastIndex = 0; let m;
      while((m = re.exec(s))){
        const at = m.index + m[0].length - m[1].length, end = m.index + m[0].length;
        if(kind === 'strong' ? !liveWriteVerb(s, at, end, m[1]) : NEG_BEFORE_RE.test(s.slice(Math.max(0, at - 22), at))) continue;
        if(kind === 'weak' && !WEAK_OBJ_RE.test(s.slice(end)) && !/[«“"]/.test(s.slice(end))) continue;
        if(!best || at < best.index) best = { index:at, end };
        break;
      }
    });
    return best && { index:map[best.index], end:map[best.end] };
  }

  /* ── طلب تأليف (R4): رأس نوع + أيّ تكملة = يؤلَّف؛ رأس يليه معرَّف («كلام الناس…») = نصّ حرفيّ ── */
  const LOVE = 'حب|غرام|عشق|هوى|زوجين|زوج|زوجة|زوجه|زوجي|زوجتي|حبيب|حبيبي|حبيبتي|حبيبة|حبيبه|عرسان|عروس|عريس|خطيب|خطيبي|خطيبتي|love';
  const LOVE_RE = word('[وف]?[لب]?ل?(?:ال)?(?:' + LOVE + ')');
  const HEAD_RE = /^(?:(?:أي|اي)\s+)?(كلام|كلمات|كلمتين|كلم[ةه]|جمل[ةه]|جمل|عبار[ةه]|عبارات|حكم[ةه]|اقتباس|مقول[ةه]|بيت\s+شعر|[أا]بيات|قصيد[ةه]|دعا[ءدهً]?|[أا]دعي[ةه]|شعر|غزل|تهنئ[ةه]|معايد[ةه]|رسال[ةه]|نكت[ةه]|نكت|خاطر[ةه]|خواطر|تعليق|وصف|نص|شي|شيء|آي[ةه]|آيات|اي[ةه]|حديث|ذكر|[أا]ذكار|كابشن|بوست|something|(?:(?:an?|some)\s+)?(?:[a-z]+\s+)?(?:quote|poem|caption|message|saying|words|post))(?=$|[\s،,.!?؟])/i;
  const DESCRIBER_RE = /^(?:[لب]\S+|عن|حلو\S*|جميل\S*|قصير\S*|طويل\S*|مؤثر\S*|قوي\S*|رائع\S*|مناسب\S*|تحفيزي\S*|رومانسي\S*|زين\S*|راقي\S*|فخم\S*|nice|short|about|for)$/i;
  /* v-parser-review: «آية/حديث/ذكر» طلب تأليف دينيّ (مسار الدعاء)، و«كابشن» عبارة — لا تُطبع جملة الطلب */
  const SACRED_HEAD_RE = /(?:^|\s)(?:آي[ةه]|آيات|اي[ةه]|حديث|ذكر|[أا]ذكار)(?=\s|$)/;
  function requestKind(s){
    if(SACRED_HEAD_RE.test(s)) return 'prayer';
    if(/شعر|قصيد|بيت|[أا]بيات|poem/i.test(s)) return 'poetry';
    if(/غزل|رومانسي|romantic/i.test(s) || LOVE_RE.test(s)) return 'flirt';
    if(/دعا[ءدهً]?(?![ء-ي])|[أا]دعي[ةه]|prayer/i.test(s)) return 'prayer';
    return 'phrase';
  }
  function classify(t){                                 /* ← { kind } طلب تأليف | { text } نصّ */
    const s = t.replace(/(^|\s)كلا\s+م(?=\s|$)/g, '$1كلام').trim();
    if(!s || s.split(/\s+/).length > 9) return { text:t };
    if(/^عن\s/.test(s)) return { kind:requestKind(s) };
    const m = HEAD_RE.exec(s);
    if(!m) return { text:t };
    const after = s.slice(m[0].length).trim(), next = after.split(/\s+/)[0];
    if(!after || DESCRIBER_RE.test(next)) return { kind:requestKind(s) };
    if(/^ال/.test(next)) return /^(?:كلم[ةه]|عبار[ةه]|جمل[ةه])$/.test(m[1]) ? { text:t.replace(/^\s*\S+\s+/, '') } : { text:t };
    if(/^(?:كلم[ةه]|عبار[ةه])$/.test(m[1]) && after.split(/\s+/).length === 1 && /^(?:ال)?(?:شكر|تقدير|ترحيب|تهنئ[ةه]|اعتذار|تحفيز|مواسا[ةه]|وداع|حب|شوق)$/.test(next)) return { kind:requestKind(s) };
    if(/^كلم[ةه]$/.test(m[1]) && after.split(/\s+/).length === 1) return { text:after };   /* «ضيف كلمة شكرا» */
    return { kind:requestKind(s) };
  }

  /* ── حذف طبقة الكتابة (R6)، وإعادة التنسيق/النقل (R7، R8) ── */
  const REMOVE_VERB = 'احذف|احذفي|حذف|تحذف|تحذفين|امسح|امسحي|مسح|تمسح|تمسحين|شيل|شيلي|تشيل|تشيلين|تزيل|شل|ازل|أزل|ازيل|أزيل|إزال[ةه]|ازال[ةه]|حوز|حوّز|حوزي|نظف|نظّف|اخف|أخف|remove|delete|erase|clear';
  const REMOVE_TEXT_RE = new RegExp('(?:^|[\\s،,])(?:' + REMOVE_VERB + ')\\s*(?:لي\\s+)?(?:كل\\s+)?(?:(?:هذا|هذه|هذي|هاذا|هاذي)\\s+)?(?:(?:ال)?(?:كلام|كتاب[ةه]|نص|مكتوب|عبار[ةه]|جمل[ةه]|خط|كلمات|حروف)|(?:the\\s+)?(?:(?:red|gold|golden|white|black|blue|pink|yellow|green|big|small|large|arabic|english)\\s+)?(?:text|writing|words?|caption|letters))(?=$|[\\s،,.!؟?])', 'i');
  const WITHOUT_TEXT_RE = /(?:^|\s)(?:بدون|بلا|من\s+غير)\s+(?:ال)?(?:كلام|كتاب[ةه]|نص)(?=$|[\s،,.!؟?])|(?:^|\s)(?:ما|مو)\s+(?:ابي|أبي|ابغى|أبغى|ابغا)\s+(?:ال)?(?:كلام|كتاب[ةه]|نص)|(?:^|\s)(?:امسح|احذف|شيل)\s+(?:اللي|الي)\s+(?:كتبته|كتبتها|مكتوب|انكتب)/i;
  const VAGUE_REMOVE_RE = new RegExp('(?:^|\\s)(?:' + REMOVE_VERB + ')\\s+(?:هذا\\s+الشي|هذا\\s+الشيء|هالشي|هذا|هذي|هذه)\\s*[.!]*$', 'i');  /* «احذف هذا الشي» لا «احذف هذي الشجرة» */
  /* v-parser-review: الحذف مربوط بكتابتنا. «الكتابة اللي على التيشيرت/بالخلفية» كتابةٌ في الصورة لا طبقتنا */
  const OTHER_TEXT_RE = /^\s*(?:(?:اللي|الي|التي|الّي|يلي)\s+(?:(?:على|في|فوق|تحت|من|عند|جنب)\s+)?|(?:on|in|from)\s+(?:the\s+)?)([^\s،,.!؟?]+)/i;
  /* v-parser-review-2: وصفٌ بلون كتابتنا أو حجمها أو خطّها أو لغتها أو زاويتها («اللي بالأحمر/بالخط الكبير/بالعربي/بالزاوية») يعيّن طبقتنا لا شيئًا آخر */
  const OUR_QUAL_RE = new RegExp('^[وف]?(?:بال|ال|لل|ب|ل|عال|فال)?(?:' + COLOR + '|' + SIZE_W + '|' + FONT_W + '|خط(?:ها|ه)?|لون(?:ها|ه)?|حجم|حروف|لغ[ةه]|عربي|انجليزي|إنجليزي|انقليزي|إنقليزي|زاوي[ةه]|ركن|طرف|جنب|جانب|جه[ةه]|ناحي[ةه])(?![' + AL + 'a-z])|^(?:english|arabic|corner|big|small|large|bold)$', 'i');
  function removesOurText(s){
    const m = REMOVE_TEXT_RE.exec(s);
    if(!m) return false;
    const tail = s.slice(m.index + m[0].length), q = OTHER_TEXT_RE.exec(tail);
    if(!q) return true;
    const w = q[1];
    if(OUR_QUAL_RE.test(w)){                                              /* «اللي بالأحمر على التيشيرت»: الشيء المسمّى بعدها يغلب */
      const o = /(?:^|\s)(?:على|في|فوق|عند|من)\s+((?:ال|بال)\S+)/.exec(tail.slice(q.index + q[0].length));
      return !o || !!positionOf(o[0]) || OUR_QUAL_RE.test(o[1]) || /صور[ةه]/.test(o[1]);
    }
    if(positionOf(w) || /صور[ةه]|image|photo|picture|top|bottom|left|right/i.test(w)) return true;
    return !/^(?:ب|بال|عال|ال|فال)\S{2,}|^[a-z]{3,}$/i.test(w);        /* «اللي كتبتها/تحت» لنا؛ «اللي على التيشيرت» لغيرنا */
  }
  /* «بدون كتابة» حذفٌ لطبقتنا فقط إن لم يبق في الرسالة غيره («ابيها/سويها بدون كتابة»، «بدون كتابة احسن»، «ما ابي الكلام») —
     «سو لي صورة قطة بدون كتابة» صورة جديدة، و«ما ابي كلام كثير اختصر» طلب محادثة */
  const WITHOUT_KEEP_RE = /(?:^|\s)(?:لا|لأ|بس|خلاص|طيب|ابيها|أبيها|ابغاها|أبغاها|ابيه|أبيه|ابي|أبي|ابغى|أبغى|اريدها|أريدها|رجعها|رجّعها|رجعيها|رجعه|رجّعه|خلها|خليها|خلّيها|خله|خليه|خلّيه|سويها|سوّيها|سوها|سويه|اياها|إياها|هي|نفسها|نفس|ال?صور[ةه]|كذا|اوكي|أوكي|تكفى|لو|سمحت|please|اللي|الي|[أا]حسن|[أا]حلى|[أا]جمل|[أا]فضل)(?=\s|$)/g;
  function withoutTextAlone(s){
    if(!WITHOUT_TEXT_RE.test(s)) return false;
    const rest = s.replace(new RegExp(WITHOUT_TEXT_RE.source, 'gi'), ' ').replace(WITHOUT_KEEP_RE, ' ');
    return !peel(rest, [], false).replace(/[\s،,.!؟?]+/g, '');
  }
  const isRemoval = (s) => removesOurText(s) || withoutTextAlone(s) || VAGUE_REMOVE_RE.test(s);
  function textRemoveIntent(input){
    const s = String(input || '').trim();
    if(!s || s.length > 120 || findMarker(s)) return false;
    return removesOurText(unquote(s)) || withoutTextAlone(unquote(s));
  }
  /* «الاسم» كتابتنا حين يُنقل أو يُنسَّق («خلي الاسم أكبر»، «خل الاسم يمين») */
  const TEXT_NOUN_RE = word('[وف]?(?:ال|لل)(?:نص|كتاب[ةه]|كلام|خط|كلمات|حروف|عبار[ةه]|مكتوب|اسم)|[وف]?(?:ب|بال|ل)?خط|text|writing|font|words|caption');
  /* ضمير المتابعة: «خله/خلها/خليها/وديه/رجعه/نزلها» — الطبقة القائمة يقرّرها العميل، والمحلّل يعيد تنسيقًا مرنًا */
  const IT_RE = word('(?:خل|خلّ|خلي|خلّي|حط|ود|ودّ|ودي|نزل|نزّل|انزل|ارفع|طلع|طلّع|حرك|حرّك|انقل|اجعل|سو|سوّ|سوي|ابي|أبي|ابغا|ابغى|أبغى|كبر|كبّر|صغر|صغّر|لون|لوّن|رجع|رجّع)(?:ه|ها|يه|يها)|it');
  const COLOR_NOUN_RE = word('[وف]?(?:ال|لل)لون');                      /* «اللون ذهبي»، «بدل اللون للأسود» — لا «لون السيارة» */
  /* v-parser-review-2: متابعة مجرّدة بلا ضمير ولا اسم («كبر شوي»، «أصغر»، «لون ابيض») تنسيقٌ مرن يطبّقه العميل على طبقتنا إن وُجدت */
  const BARE_STYLE_RE = new RegExp('^(?:(?:لا|بس|طيب)[\\s،,]+)?(?:(?:كبّ?ر|صغّ?ر|[أا]كبر|[أا]صغر)(?:\\s+(?:شوي[ةه]?|زياد[ةه]|[أا]كثر|بعد|كمان|حبتين|حب[ةه]))*|لون\\s+(?:بال|ال|ب)?(?:' + COLOR + '))[\\s.!؟?]*$', 'i');
  /* «الصورة كبرها»: المفعول هو الصورة نفسها لا كتابتنا — و«يمين الصورة/على الصورة» موضعٌ لا مفعول */
  const PHOTO_POS_RE = /\S*(?:على|فوق|في|من|عن|يمين|يسار|يمنى|يسرى|أعلى|اعلى|أسفل|اسفل|تحت|وسط|منتصف|نص|طرف|جنب|جانب|زاوي[ةه]|ركن|ناحي[ةه]|جه[ةه])\s+(?:(?:هذه|هذي|من)\s+)?(?:ال|هال|لل)صور[ةه]/g;
  /* مراجعة (الجولة ٣): «الصورة» في جملة مدح أو تعليل لا تجعلها المفعول — «الصورة حلوة بس خلها يمين»، «خلها ذهبي عشان الصورة غامقة» تنسيق للكتابة */
  const photoIsObject = (s) => {
    const t = s.replace(PHOTO_POS_RE, ' ').split(/\s(?:بس|لكن|بَس)\s/).pop().split(/\s(?:عشان|علشان|لان|لأن|لانها|لأنها|because)\s/)[0];
    return /(?:^|\s)(?:ال|هال)صور[ةه](?=[\s،,.!؟?]|$)/.test(t);
  };
  /* v-parser-review-2: «بالأبيض والأسود» و«خلها بخلفية بيضاء» تعديلٌ للصورة (فلتر/خلفية) لا لونٌ للكتابة */
  const PHOTO_FILTER_RE = /(?:أبيض|ابيض)\s*(?:و|&)\s*(?:ال)?(?:أسود|اسود)|(?:أسود|اسود)\s*(?:و|&)\s*(?:ال)?(?:أبيض|ابيض)|black\s*(?:and|&)\s*white|\bb\s*&\s*w\b/i;
  const MOVE_VERB_RE = /(?:حط|ضع|خل|خلي|خلّي|اجعل|حرّ?ك|انقل|نقل|ودّ?|نزّ?ل|ارفع|move|put|place)/i;
  const VISUAL_TARGET_RE = word('[وف]?(?:بال|ال|لل|ب)?(?:خلفي[ةه]?|خلفيات|سما|سماء|بحر|لبس|ملابس|لبسها|لبسه|فستان|فستانها|قميص|ثوب|شعر|شعرها|شعره|وجه|وجهها|وجهه|عيون|عيونها|جدار|كنب[ةه]?|ورد[ةه]?|ورود|زهر[ةه]?|زهور|سيار[ةه]|غرف[ةه]|أرض|ارض|إضاء[ةه]|اضاء[ةه])|background|dress|shirt|hair|sky|wall|sofa|flowers?');
  function styleFields(src){
    const s = String(src || ''), pretty = PRETTY_FONT_RE.test(s), p = positionOf(s);
    const nudge = p ? null : (/(?:^|\s)ا?نزّ?ل/.test(s) ? 'bottom' : (/(?:^|\s)(?:ارفع|طلّ?ع)/.test(s) ? 'top' : null));
    const out = { color:hasColor(s) ? textColor(s) : (pretty ? '#f4cf65' : null), fontKey:namedFont(s) || (pretty ? 'diwani' : null), position:p ? p.position : nudge, size:textSize(s) };
    return out.color || out.fontKey || out.position || out.size ? out : null;
  }
  function textStyleEdit(input){
    const s = unquote(input);
    if(!TEXT_NOUN_RE.test(s) || isRemoval(s) || REMOVE_TEXT_RE.test(s)) return null;   /* جملة حذفٍ لا تصير تنسيقًا («شيل الكتابة اللي بالأحمر على التيشيرت») */
    const marker = findMarker(input);
    /* «خل الكتابة يمين واكتب مشكور اخوي» كتابةٌ بموضع، لا نقلٌ للقديم يُسقط النصّ الجديد */
    if(marker && (s !== String(input) || !MOVE_VERB_RE.test(s) || !positionOf(s)
      || (/^[وف]?(?:اكتب|أكتب|كتبلي|كتبيلي|تكتب|write|type)/i.test(String(input).slice(marker.index, marker.end)) && writeSpec(String(input), marker).wantsText))) return null;
    return styleFields(s);
  }
  function onlyStyle(s){          /* «يمين»، «لا، على اليمين»؛ والرابط «خلها» لا يُحسب تنسيقًا («خلها أبيض وأسود» للصورة) */
    const out = [];
    return !peel(s.replace(/(?:^|\s)(?:لا|بس|شوي|ليش|طيب)(?=[\s،,؟?!.]|$)/g, ' '), out, false, ['link']).replace(/[\s،,؟?!.]+/g, '') && out.length > 0;
  }
  function textStyleEditLoose(input){
    const s = unquote(input);
    if(findMarker(input) || isRemoval(s) || REMOVE_TEXT_RE.test(s) || VISUAL_TARGET_RE.test(s) || PHOTO_FILTER_RE.test(s)) return null;
    if(!TEXT_NOUN_RE.test(s) && (photoIsObject(s) || (!IT_RE.test(s) && !COLOR_NOUN_RE.test(s) && !BARE_STYLE_RE.test(s.trim()) && !onlyStyle(s)))) return null;
    return styleFields(s);
  }

  /* ── الاستبدال على طبقتنا (R14) ── */
  const SWAP_WRITE_RE = /^(?:لا\s+)?(?:(?:ابي|أبي|ابغى|أبغى|ابغي)\s+)?(?:بدال|بدل|مكان)\s+(?!ال?(?:كلام|كتاب|نص))[«"']?([^«»"'\s]+(?:\s+[^«»"'\s]+){0,2}?)[»"']?\s+(?:اكتب|تكتب|حط)\s+[«"']?(.+?)[»"']?\s*[.!]*$/i;
  /* هدفٌ كلّه لون/حجم/خطّ/موضع («أكبر»، «بيضا»، «يمين») تنسيقٌ لا نصّ جديد */
  const STYLE_ONLY_WORD_RE = new RegExp('(?:^|\\s)(?:[وف]?(?:بال|ال|ب|لل)?(?:' + SIZE_W + '|' + FONT_W + '|فاتح|غامق|شوي|زيادة|اكثر|أكثر|بعد|شوية))(?=\\s|$)', 'gi');
  const styleOnlyTarget = (t) => !peel(String(t).replace(STYLE_ONLY_WORD_RE, ' '), [], false).replace(/[\s،,.!؟?]+/g, '');
  /* «غيرها الى كرتون/ليل/رسم زيتي» تحويلٌ للصورة لا نصٌّ جديد */
  const RESTYLE_TARGET_RE = /^(?:[وف]?(?:بال|ال|لل|ب|ل)?(?:كرتون|كارتون|كرتوني[ةه]?|انمي|أنمي|ليل|ليلي[ةه]?|نهار|شتا|شتاء|صيف|ربيع|خريف|رسم|رسم[ةه]|زيتي|زيتي[ةه]|مائي|مائي[ةه]|واقعي|واقعي[ةه]|اسلوب|أسلوب|ستايل|كاريكاتير|لوح[ةه]|سينمائي|سينمائي[ةه]|قديم[ةه]?|ريترو|بكسل|ثلاثي|ثري\s*دي|3d|غروب|شروق|ثلج|مطر|ضباب|فن|فني[ةه]?|نسخ[ةه]))(?=\s|$)/i;
  function textReplaceIntent(input){
    const s = String(input || '').trim();
    if(!s || s.length > 160 || findMarker(s) || textStyleEdit(s)) return null;
    /* «صحح كتابة الاسم» إضافة (كتابةُ الاسم) لا «اجعل الكتابة: الاسم» */
    const m1 = /^(?:لا\s+)?(?:غير|غيّر|غيري|بدل|بدّل|بدلي|خل|خلي|خلّي|خليه|خليها|اجعل|صحح|صحّح|عدل|عدّل)\s+(?:ال(?:كلام|كتاب[ةه]|نص|مكتوب|عبار[ةه]|جمل[ةه]|كلم[ةه])\s+|(?:كلام|كتاب[ةه]|نص|مكتوب|عبار[ةه]|جمل[ةه]|كلم[ةه])\s+(?!ال(?!ى\s)))(?:الى|إلى|لـ|يصير|تصير|يكون|تكون|:)?\s*(.+)$/i.exec(s);
    const m2 = m1 ? null : /^(?:غير|غيّر|بدل|بدّل)(?:ها|ه)\s+(?:الى|إلى|لـ|ل)\s*(.+)$/i.exec(s);
    const m = m1 || m2 || /^(?:change|replace|make)\s+(?:the\s+)?(?:text|words?|writing)\s+(?:to|into|with|say)\s+(.+)$/i.exec(s);
    if(!m) return null;
    const q = quotedValue(m[1]), t = fixKnownPhrases((q ? q.value : m[1]).trim());
    if(m2 && !q && (RESTYLE_TARGET_RE.test(t) || VISUAL_TARGET_RE.test(t))) return null;
    return t && t.length <= 120 && (q || !styleOnlyTarget(t)) ? t : null;          /* «خلي الكتابه ذهبي» تنسيق لا استبدال */
  }
  /* «للغالي» = «ل» + «الغالي»، و«لسارة» = «ل» + «سارة»؛ الأسماء المبدوءة باللام تبقى */
  const LAM_NAME_RE = /^(?:ليلى|ليلي|لمى|لما|لمياء|لينا|لين|لانا|لارا|لؤي|لطيفة|لطيفه|لولوة|لولوه|لجين|لبنى|ليث|لبيب|لقمان|لؤلؤ[ةه]?|لوجين|ليان|لميس)(?=\s|$)/;
  /* v-parser-review-2: «لليلى/للمى/لليث» = «ل» + الاسم لا «ال» + بقيّته */
  const dropLam = (x) => /^لله(?=\s|$)/.test(x) ? x : (/^لل\S/.test(x) ? (LAM_NAME_RE.test(x.slice(1)) ? x.slice(1) : 'ال' + x.slice(2)) : (/^ل\S{2,}/.test(x) && !LAM_NAME_RE.test(x) ? x.slice(1) : x));
  function layerWordSwap(input, layerText){
    const s = String(input || '').trim(), t = String(layerText || '');
    if(!s || !t || s.length > 160) return null;
    /* «بدل الاسم الى محمد» على طبقة كلمتها واحدة = الاسم نفسه؛ على عبارة أطول يُترك لمسار تبديل الاسم داخل الصورة */
    const nm = /^(?:لا\s+)?(?:غير|غيّر|غيري|بدل|بدّل|بدلي|صحح|صحّح|خل|خلي|خلّي|اجعل)\s+(?:ال)?اسم\s+((?:الى|إلى|يصير|يكون|لـ|:)\s*)?(.+?)\s*[.!]*$/i.exec(s);
    if(nm){
      const q = quotedValue(nm[2]), to = q ? q.value.trim() : (nm[1] ? nm[2].trim() : dropLam(nm[2].trim()));
      return !/\s/.test(t.trim()) && to && to !== t.trim() && (q || !styleOnlyTarget(to)) ? to : null;
    }
    const m = SWAP_WRITE_RE.exec(s) || /^(?:لا\s+)?(?:غير|غيّر|غيري|بدل|بدّل|بدلي|استبدل|صحح|صحّح)\s+(?:(?:ال)?(?:كلم[ةه]|اسم|جمل[ةه])\s+)?[«"']?(.+?)[»"']?(?:\s+(?:الى|إلى|حط|وحط|خلها|خله|تصير|يصير|مكانها|مكانه|بـ|ب|لـ)\s*|\s+(?=(ل)\S))[«"']?(.+?)[»"']?\s*[.!]*$/i.exec(s);
    if(!m) return null;
    const lam = m.length > 3 && m[2] === 'ل', from = m[1].trim(), to = fixKnownPhrases(lam ? dropLam(m[3].trim()) : m[m.length > 3 ? 3 : 2].trim());
    if(!from || !to || from === to || t.indexOf(from) < 0) return null;
    return t.split(from).join(to);
  }

  /* ── وصف المشهد: ما قاله المستخدم عن الصورة، وإلّا مشهد عشوائيّ من أبناك مستقلّة (v578) ── */
  const VIS_SCENE = {
    prayer: ['فناء طيني قديم بعد المطر وقطرات على الجدار الترابي', 'كثبان رملية ناعمة بخطوط ريح دقيقة', 'قمم جبال بازلتية يعلوها ضباب رقيق', 'حقل قمح ناضج تحرّكه نسمة خفيفة', 'ممرّ حجري ضيق بين جدارين عاليين وشعاع ضوء واحد', 'سهل واسع فارغ تحت سحاب رقيق', 'نافورة ماء ساكنة في ساحة حجرية خالية', 'أغصان نخيل عالية تُرى من الأسفل نحو السماء'],
    poetry: ['صحراء ليلية بنجوم كثيفة وأفق منخفض', 'شرفة خشبية عتيقة تطلّ على واد أخضر', 'أزقّة مدينة قديمة بأقواس متتالية', 'ورق شجر متناثر على أرض مبلّطة', 'خيمة في العراء وأثر أقدام على الرمل', 'ضباب صباحي بين أشجار سرو طويلة'],
    flirt: ['حقل زهور برية بضوء ناعم متناثر', 'قماش حريري متموّج بألوان دافئة', 'أضواء مدينة ليلية غير واضحة خلف زجاج مرشوش بالمطر', 'درج رخامي مزيّن بالورد', 'حديقة مسوّرة بياسمين متسلّق', 'فراشة ملوّنة على ساق نبات عالٍ'],
    phrase: ['قمّة جبل صخرية فوق بحر من السحاب', 'مدرّج ملعب فارغ بخطوط هندسية حادّة', 'واجهات زجاجية عالية تعكس السماء', 'طريق مستقيم يشقّ سهلًا واسعًا', 'جسر معلّق بحبال فولاذية في الضباب', 'سطح ماء أملس تنعكس عليه غيوم مضيئة'],
    /* v-condolence-scene: عبارة عزاء بلا وصف = مشهد عزاء هادئ بلا وجوه */
    condolence: ['وردة بيضاء واحدة على حجر داكن في ضوء خافت', 'غصن جافّ على قماش رمادي هادئ', 'مقبرة بسيطة بشواهد حجرية بعيدة وسماء غائمة', 'فانوس صغير مطفأ الضوء بجانب زهرة ذابلة', 'طريق ترابي فارغ في ضباب الفجر', 'قطرات مطر على زجاج نافذة وخلفها أفق رمادي']
  };
  const VIS_LIGHT = ['إضاءة جانبية حادّة تصنع ظلالًا طويلة', 'ضوء منتشر ناعم بعد الغيم', 'ضوء خلفي يرسم هالة حول الحوافّ', 'أشعة تتخلّل غبارًا معلّقًا', 'ضوء أزرق بارد قبل الشروق', 'ضوء نهاري ساطع من الأعلى', 'ظلال متقطّعة عبر مشربية', 'وميض خفيف يعكسه سطح مبلّل'];
  const VIS_PALETTE = ['ألوان ترابية هادئة', 'تباين أزرق داكن مع فضّي', 'أخضر عميق مع بنّي', 'رمادي حجري مع لمسة نحاسية', 'أبيض وبيج بلمسة رملية', 'أزرق فيروزي مع رمل فاتح', 'ألوان باردة أحادية شبه رمادية', 'أسود مطفي مع ذهبي خفيف'];
  const VIS_LENS = ['تصوير واسع الزاوية من موضع منخفض', 'منظور علوي عمودي', 'عدسة تقريب طويلة بعمق ميدان ضحل', 'مستوى النظر بتكوين متوازن', 'زاوية منخفضة تُعلي الموضوع', 'تكوين غير متمركز بمساحة فارغة واسعة'];
  const pick = (list) => list[Math.floor(Math.random() * list.length)] || '';
  /* كلمات عزاء كاملة: لا «الأعزاء» ولا «ورحمة الله» ولا «حجاجنا راجعون» ولا «رحم الله امرأ» */
  const CONDOLENCE_RE = /(?:^|[^ء-ي])(?:[وف]?(?:بال|لل|ال|ب|ل)?(?:عزاء|تعزي[ةه]|تعازي(?:نا)?|وفا[ةه]|وفات|متوف[ىي]|فقيد|مرحوم)(?:ه|ها|هم|كم|نا)?|توف(?:ي|ى|اه|اها)|[اإ]لي?ه\s+ل?(?:[رو]اجعون|رجعون)|البقاء\s*لله|الله\s*ير[حخ]م(?:ه|ها|هم|ك)|عظم\s*الله\s*[أا]جر|[أا]حسن\s*الله\s*عزاء|في\s*ذم[ةه]\s*الله)(?=$|[^ء-ي])|inna\s+lillahi|rest\s+in\s+peace|\bcondolence/i;
  const isCondolence = (t) => CONDOLENCE_RE.test(String(t || '').replace(/[ً-ْٰـ]/g, ''));
  function fallbackVisual(kind, text){
    if(isCondolence(text)) return 'مشهد تعزية هادئ بلا أشخاص ولا وجوه: ' + pick(VIS_SCENE.condolence) + '، ضوء خافت حزين، ألوان باهتة هادئة، تفاصيل واقعية دقيقة، بلا أي كتابة أو حروف أو أرقام في الصورة';
    const k = (kind === 'prayer' || /(?:اللهم|ربنا|يا\s+رب)/.test(text || '')) ? 'prayer' : (VIS_SCENE[kind] && kind !== 'condolence' ? kind : 'phrase');
    return 'مشهد أصيل عالي الجودة: ' + pick(VIS_SCENE[k]) + '، ' + pick(VIS_LIGHT) + '، ' + pick(VIS_PALETTE) + '، ' + pick(VIS_LENS) + '، تفاصيل واقعية دقيقة، بلا أي كتابة أو حروف أو أرقام في الصورة';
  }
  const cleanVisual = (v) => String(v || '').replace(/(?:^|\s)(?:و|and|مع|وفيها|وعليها|عليها|فيها)\s*$/i, '').replace(/[\s،,]+$/, '').trim();
  const GENERIC_VISUAL_RE = /^(?:(?:أنشئ|انشئ|اصنع|ولد|ولّد|صمم|ارسم|سو|سوي|سوّي|create|generate|make|draw)\s*(?:لي\s*)?)?(?:صورة|صوره|image|picture)?\s*$/i;
  function isGenericVisual(v){
    /* «غيّر الاسم/احذف الكلام الي تحت واكتب…»: شطر الكتابة أمرٌ للطبقة لا تعديلٌ للصورة (v574) */
    if(/^(?:لا\s+)?(?:احذف|امسح|شيل|شل|حذف|ح[ّ]?و[ّ]?ز|ازل|أزل|غير|غيّر|غيري|غيّري|بدل|بدّل|استبدل|صحح|صحّح)\s+(?:ال)?(?:نص|كتابة|كتابه|كلام|كلمات|عبارة|عباره|مكتوب|[إا]سم)(?:ي|ه|ها|ك)?(?:\s+\S+){0,3}\s*$/i.test(String(v || '').trim())) return true;
    const s = String(v || '').replace(/(?:^|\s)(?:لا|لأ|بس|فقط|ابغى|أبغى|ابغي|أبغي|ابي|أبي|ابيك|أبيك|اريد|أريد|ودي|بدي|عطني|اعطني|أعطني|ممكن|الرجاء|رجاء|لو|سمحت|فضلك|please|can|you|لي|في|على|من|نفس|هذي|هذه|ال?صور[ةه]|image|picture)(?=\s|$)/gi, ' ').replace(/[\s،,.!؟?]+/g, ' ').trim();
    return !s || GENERIC_VISUAL_RE.test(s);
  }

  /* ── دعاء/شعر/غزل بلا نصّ منصَّص (R5) ── */
  const PRAYER_WORD_RE = /(?:^|[\s،,.!?؟])(?:دعا[ءدهً]?|[أا]دعي[ةه]|شعر|قصيدة|كلام\s+(?:غزل|رومانسي)|غزل|prayer|poem|romantic\s+words?)(?=$|[\s،,.!?؟:：\-–—])/i;
  function autoPrayerSpec(source){
    const s = String(source || '').trim();
    if(s.length > 220 || quotedValue(s) || !PRAYER_WORD_RE.test(s)) return null;   /* v-longtext-noimg */
    if(/(?:النص|العبارة|الكلام|الكلمة|كلمة|text|words?)\s*(?:هو|is)?\s*[:：\-–—]?\s*(?:دعا[ءدهً]?|شعر|قصيدة|غزل|prayer|poem)(?=$|[\s،,.!?؟])/i.test(s)) return null;
    return { request:s, kind:/(?:شعر|قصيدة|poem)/i.test(s) ? 'poetry' : (/(?:غزل|رومانسي|romantic)/i.test(s) ? 'flirt' : 'prayer'), at:s.search(PRAYER_WORD_RE) };
  }

  /* R13: الاسترجاع بصيغه الشائعة يُكتب برسم المصحف؛ ولا شيء غيره يُمسّ (لهجة المالك تبقى كما كتبها) */
  const ISTIRJA = 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ';
  const KNOWN_PHRASES = [[/(^|[\s«"'])[اإأآ]نّ?ن?ّ?[اهى]?\s*(?:ال|ل)?لّ?ل?ه\s*و\s*[اإأآ]نّ?ن?ّ?[اهى]?\s*[اإأ]ل[يى]ه\s*[رو]اجع[وي]ن(?=$|[\s.،,!»"'])/g, '$1' + ISTIRJA]];
  function fixKnownPhrases(value){ let out = String(value == null ? '' : value); KNOWN_PHRASES.forEach((p) => { out = out.replace(p[0], p[1]); }); return out; }
  function isKnownPhrase(value){ return String(value || '').trim() === ISTIRJA; }

  function imageWriteIntent(input){                      /* v574: نيّة كتابة ⇒ لا يلمس المولّد الصورة */
    const s = String(input || '').trim();
    if(!s || /(?:خلفية|الخلفيه|ديكور|كرتون|كارتون|أزل|ازل|امسح|احذف|شيل|background|cartoon|remove|delete)/i.test(s)) return false;
    /* v-parser-review: «لا تكتب شي وخلها ليل» و«ما ابيك تكتب» نفيٌ لا نيّة كتابة — التعديل يمضي للصورة */
    const re = /(?:^|[\s،,])(اكتب|أكتب|اكتبي|اكتبلي|كتبلي|تكتب|write)(?=$|[\s،,.!?؟:«"'])|(?:^|[\s،,])((?:حط|ضع|ضيف|أضف|اضف|put|add)\s*(?:لي\s+)?(?:اسمي|اسم|كلمة|كلمه|نص|النص|عبارة|عباره|كلام|جملة|جمله|name|text))/gi;
    let m;
    while((m = re.exec(s))){
      const w = m[1] || m[2], at = m.index + m[0].length - w.length;
      if(liveWriteVerb(s, at, at + w.length, w)) return true;
    }
    return SWAP_WRITE_RE.test(s);                                                       /* «ابي بدل مشكور تكتب يعطيك العافية» */
  }
  function isExplicitImageEdit(input){
    const s = String(input || '').trim();
    if(!s || s.length > 220) return false;
    if(textStyleEdit(s) || parseImageTextSpec(s).wantsText) return true;
    if(/(?:نفس\s+(?:الصورة|الصوره)|هذه\s+(?:الصورة|الصوره)|هذي\s+(?:الصورة|الصوره)|هالصورة|هالصوره|الصورة\s+السابقة|الصوره\s+السابقه|(?:same|this|previous)\s+(?:image|picture))/i.test(s)) return true;
    const editVerb = /(?:^|[\s،,.!?؟])(?:عدل|عدّل|حرر|حرّر|غير|غيّر|بدل|بدّل|احذف|امسح|ازل|أزل|شيل|أضف|اضف|ضيف|حط|اكتب|أكتب|خل|خلي|خلّي|اجعل|سو|سوي|سوّي|حول|حوّل|زيد|قص|كبر|كبّر|صغر|صغّر)(?=$|[\s،,.!?؟]|ها)/i.test(s) || /\b(?:edit|change|modify|remove|delete|add|put|write|resize)\b/i.test(s);
    const imageRef = /(?:الصورة|الصوره|هالصورة|هالصوره|عليها|فيها|منها|لها|\S+ها(?:\s|$)|\bit\b|this\s+(?:image|picture)|the\s+(?:image|picture))/i.test(s);
    const visualTarget = /(?:الخلفية|الخلفيه|الملابس|اللبس|الشعر|الوجه|الإضاءة|الاضاءة|الألوان|الالوان|تسريح[ةه]|قص[ةه]\s+الشعر|فستان|قميص|نظار[ةه]|لحي[ةه]|شنب|مكياج|حجاب|شماغ|كندور[ةه]|قبع[ةه]|تاج|بشر[ةه]|background|outfit|clothes|hair|hairstyle|ponytail|face|lighting|colou?rs?)/i.test(s);
    return editVerb && (imageRef || visualTarget);
  }

  /* ── المحلّل: حذف ← إعادة تنسيق/نقل ← تبديل كلمة ← تأليف دعاء ← كتابة ← لا شيء نصّيّ ── */
  function place(ins){ const p = positionOf(ins); return { position:p ? p.position : 'bottom', positionAuto:!p, positionFlex:!!(p && p.flex) }; }
  /* لقطة المالك «غيرالخلفيه واكتب دعاء الاولاد»: فعل التعديل ملتصق بـ«ال» — يُفصل كي يفهمه محرّر الصورة */
  const GLUED_EDIT_RE = /(^|\s)(غير|غيّر|بدل|بدّل|شيل|امسح|احذف|خل|خلي|حط|ضيف|لون|لوّن)(ال)(?=\S)/g;
  function visualFields(scene, kind, exact){
    const v = cleanVisual(scene).replace(GLUED_EDIT_RE, '$1$2 $3'), visualEdit = v && !isGenericVisual(v) ? v : null;
    return { visualPrompt:!visualEdit ? fallbackVisual(kind, exact) : (isCondolence(exact) && !isCondolence(v) ? 'مشهد تعزية بلا وجوه: ' + v : v), visualEdit };
  }
  function parseImageTextSpec(input){
    const source = String(input || '').replace(/\r\n?/g, '\n');
    const none = (extra) => Object.assign({ wantsText:false, exactText:null, visualPrompt:source.trim(), fontKey:'default', color:'#ffffff', position:'bottom', positionFlex:false, styleEditLoose:null }, extra);
    if(source.length > 400) return none();                                             /* v-longtext-noimg */
    const bare = unquote(source), marker = findMarker(source), removal = isRemoval(bare);
    if(removal && !marker) return none({ removeText:true });                             /* «احذف الكلام وحط وردة» حذفٌ فقط */
    const restyle = removal ? null : textStyleEdit(source);
    if(restyle) return { wantsText:false, exactText:null, visualPrompt:'', styleEdit:restyle, styleEditLoose:restyle, positionFlex:!!((positionOf(bare) || {}).flex) };
    if(SWAP_WRITE_RE.test(source.trim())) return none();                                /* «بدال مشكور اكتب شكراً» تبديل داخل الطبقة */
    const prayer = removal ? null : autoPrayerSpec(source);
    if(prayer){
      const pw = source.search(PRAYER_WORD_RE), at = Math.min(marker ? marker.index : Infinity, pw), color = textColor(source);
      /* v-parser-review: ذيل المشهد بعد كلمة الدعاء («…دعاء للوالدين وخل الخلفية بحر») يذهب للمولّد لا يضيع */
      const after = source.slice(Math.max(0, pw)), edit = /(?:^|\s)و\s*((?:غير|غيّر|بدل|بدّل|خل|خلّ|خلي|خلّي|حط|ضيف|اضف|أضف|شيل|امسح|احذف|ارسم|سو|سوي|سوّي|اجعل)(?:ال)?\s*\S[\s\S]*)$/.exec(after);
      /* «اكتب دعاء الاولاد وغير الخلفيه»: «و + فعل تعديل» بعد كلمة الدعاء مشهدٌ للمحرّر وإن لم يسمِّ الخلفيّة بلونها */
      const tail = sceneOf(cutScene(after, 1)[1], []) || (edit ? edit[1] : '');
      return Object.assign({ wantsText:true, exactText:null }, visualFields([cleanVisual(source.slice(0, Math.max(0, at))), tail].filter(Boolean).join(' '), prayer.kind, null), { prayerRequest:prayer.request, fontKey:textFont(source), color, colorSet:color !== '#ffffff', size:textSize(source) }, place(source), { kind:prayer.kind, autoAuthored:true });
    }
    if(!marker){
      const loose = textStyleEditLoose(source);                                         /* «خله يمين»: الجانب وحده مرن كصيغة «خل الكتابة يمين» */
      return none({ styleEditLoose:loose, positionFlex:!!(loose && loose.position && (positionOf(bare) || {}).flex) });
    }
    return writeSpec(source, marker);
  }
  /* نهاية النصّ الحرّ: علامة مفصولة أو إيموجي أو «!» من كلام الطلب لا من النصّ؛ و«؟» في «ممكن تكتب…؟» علامة الطلب
     v-parser-review-2: «.» و«؟» الملاصقتان من نصّ المستخدم («صباح الخير.»، «ممكن تكتب كيف حالك؟») — «؟» الطلب تُنزع فقط إن لم يكن النصّ سؤالًا */
  const END_JUNK_RE = new RegExp('(?:\\s+(?:[.!؟?…،,]|' + EMO + ')+|' + EMO + '+|!+)$');
  const ASK_Q_RE = /^\s*(?:ممكن|تقدر|تقدرين|يمديك|لو\s+سمحت|can\s+you|could\s+you)(?=\s)/i;
  const QUESTION_W_RE = /(?:^|\s)(?:كيف|شلون\S*|وش|ايش|إيش|شو|شنو|متى|وين|فين|أين|اين|ليش|لماذا|ماذا|هل|مين|منو|كم|what|how|why|when|where|who|which)(?=[\s؟?]|$)/i;
  function trimEnd(t, source){
    let x = String(t);
    for(let i = 0; i < 6; i++){
      let y = x.replace(END_JUNK_RE, '');
      if(ASK_Q_RE.test(source) && !QUESTION_W_RE.test(y)) y = y.replace(/[؟?]+$/, '');
      y = y.replace(/\.+$/, '').replace(TRIM_RE, '');                        /* مراجعة (الجولة ٣): نقطة ختام الجملة لا تُطبع («اكتب مشكور اخوي. على اليمين») */
      if(y === x) break;
      x = y;
    }
    return x.trim() ? x : t;
  }
  function writeSpec(source, marker){
    const ins = [], scene = [], pre = [];
    let prefix = cleanVisual(source.slice(0, marker.index)), rest = source.slice(marker.end), exact = null, kind = '';
    const preLeft = peel(prefix, pre, false);
    const own = CLAUSE_POS_RE.exec(prefix);                                             /* «صورة بحر وعلى اليمين اكتب…» */
    if(pre.length && isGenericVisual(preLeft)){ ins.push.apply(ins, pre); prefix = preLeft; }   /* «عاليمين اكتب عمران» */
    else if(own){ ins.push(own[1]); prefix = cleanVisual(prefix.slice(0, own.index)); }
    scene.push(prefix);
    let q = quotedValue(rest);
    if(!q && /(?:ه|ها|يه|يها)$/.test(source.slice(marker.index, marker.end))){
      const pq = quotedValue(prefix);
      if(pq){ scene[scene.length - 1] = cleanVisual(prefix.slice(0, pq.index)); ins.push(prefix.slice(pq.index + pq.whole.length)); q = { index:0, whole:'', value:pq.value }; }
    }
    if(q){                                                                              /* R1: المنصَّص حرفيّ، وما حوله تعليمات */
      exact = q.value.trim() ? fixKnownPhrases(q.value) : null;                         /* الاسترجاع المنصَّص برسم المصحف في كلّ المسارات */
      const left = rest.slice(0, q.index), cs = cutScene(rest.slice(q.index + q.whole.length), 0);
      ins.push(left);
      if(/دعا|[أا]دعي|شعر|قصيد|بيت/.test(left)) kind = requestKind(left);
      const leftover = peel(cs[0], ins, false);
      scene.push(isGenericVisual(leftover) ? '' : leftover, sceneOf(cs[1], ins));
    }else{
      let t = rest, literal = false;
      const c = /^([^:：\n]{0,40})[:：]\s*/.exec(t);
      if(c && peel(c[1], [], false).split(/\s+/).every((w) => !w || LABEL_WORD_RE.test(w))){ ins.push(c[1]); t = t.slice(c[0].length); literal = true; }
      const cs = cutScene(t, 1);
      scene.push(sceneOf(cs[1], ins));
      t = peel(cs[0], ins, true);
      const cut = t.search(CUT_RE);
      if(cut > 0){ ins.push(t.slice(cut)); t = peel(t.slice(0, cut), ins, true); }
      const r = literal ? { text:t } : classify(t);
      if(r.kind) kind = r.kind;
      else exact = r.text.trim() ? fixKnownPhrases(literal ? r.text.trim() : trimEnd(r.text.trim(), source)) : null;
    }
    const insStr = ins.join(' ');
    if(!q && !exact && !kind){                                                          /* R8: «اكتب بخط صغير ومزخرف» = إعادة تنسيق */
      const se = styleFields(insStr);
      if(se) return { wantsText:false, exactText:null, visualPrompt:'', styleEdit:se, styleEditLoose:se, styleOnlyWrite:true, positionFlex:!!((positionOf(insStr) || {}).flex) };
    }
    const color = textColor(insStr);
    return Object.assign({ wantsText:true, exactText:exact }, visualFields(scene.filter(Boolean).join(' '), kind, exact),
      { fontKey:textFont(insStr), color, colorSet:color !== '#ffffff' || hasColor(insStr), size:textSize(insStr) }, place(insStr),
      { kind, prayerRequest:!exact && kind ? source : undefined, autoAuthored:!exact && kind ? true : undefined });
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
