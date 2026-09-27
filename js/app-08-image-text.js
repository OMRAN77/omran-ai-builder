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
    ['أبيض|ابيض|بيضاء|white', '#fdfdfd'] /* أبيض صريح ≠ الافتراضيّ #ffffff (= «انسجم مع الصورة») */
  ];
  const COLOR = TEXT_COLORS.map((c) => c[0]).join('|');
  const COLOR_RES = TEXT_COLORS.map((c) => [word('[وف]?(?:بال|لل|ال|ب|ل)?(?:' + c[0] + ')'), c[1]]);
  const hasColor = (s) => COLOR_RES.some((c) => c[0].test(s));
  /* v-font-pretty: كلمة جمال واحدة = الخطّ المزخرف (ديواني)، وبلا لون = الذهب المتدرّج */
  const PRETTY = 'م?زخرف[ةه]?|زخرفي|جميل[ةه]?|حلو[ةه]?|مرتب[ةه]?|أنيق[ةه]?|انيق[ةه]?|راقي[ةه]?|فخم[ةه]?|ملكي|مميز|رائع|فني|إبداعي|ابداعي|جذاب|beautiful|fancy|elegant|stylish|ornate|royal|decorative|calligraphy';
  const FONTS = [['diwani', 'ديواني|diwani'], ['ruqaa', 'رقعة|رقعه|ruqaa|ruqa'], ['kufi', 'كوفي|kufi'], ['othmani', 'عثماني|othmani'], ['naskh2', 'نسخ\\s*نوتو|نوتو|noto\\s*naskh'], ['thuluth', 'ثلث|thuluth'], ['farsi', 'فارسي|نستعليق|farsi|nastaliq'], ['quran', 'مصحف|قرآني|quran'], ['naskh', 'نسخ|naskh']];
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
    ['small', 'و?ب?(?:صغير[ةه]?|small|tiny)'], ['large', 'و?ب?(?:كبير[ةه]?|ضخم[ةه]?|عريض[ةه]?|big|large|huge)']].map((x) => [x[0], word(x[1])]);
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
  const STYLE_LEAD = '(?:و\\s*)?(?:ا?يكون\\s+)?(?:بخط|بالخط|بلون|باللون|ب?لون(?:ه|ها)|لون\\s+(?:النص|الخط|الكتاب[ةه]|الكلام))|(?:و\\s*)?(?:بال|ب|لل)(?:' + COLOR + ')|in\\s+(?:' + COLOR + ')|big|small|large|bigger|smaller|bold';
  const STYLE_WORD = '(?:و\\s*)?(?:بال|ال|ب)?(?:' + COLOR + '|' + SIZE_W + '|' + PRETTY + '|' + FONT_W + '|فاتح|غامق|خفيف|هادي|هادئ|خط|لون|لونه|لونها)';
  const TABLES = [
    { name:'filler', L:'لي|لنا|بال(?:عربي|انجليزي|إنجليزي|انقليزي|إنقليزي)|in\\s+(?:english|arabic)|[وف]?(?:عليها|عليه|فيها|فوقها|فوقه)|(?:على|فوق|في)\\s+(?:هذه\\s+|هذي\\s+)?(?:ال|هال)صور[ةه](?:\\s+نفسها)?|on\\s+(?:it|(?:the|this)\\s+(?:image|photo|picture))|بدال(?:ها|ه)|مكان(?:ها|ه)|لو\\s+سمحت|من\\s+فضلك|please',
      R:'(?:على|فوق|في)\\s+(?:هذه\\s+|هذي\\s+)?(?:ال|هال)صور[ةه](?:\\s+نفسها)?|عليها|فيها|لو\\s+سمحت|من\\s+فضلك|please|(?:on|to)\\s+(?:it|(?:the|this)\\s+(?:image|photo|picture))|(?:بدون|بلا|دون|من\\s+غير)\\s*(?:أي\\s*)?(?:تغيير|تغير|تعديل|مساس|لمس)(?:\\s*(?:في|على|ل)?\\s*(?:ال)?صور[ةه])?' },
    { name:'position', L:POS_RUN, R:POS_RUN },
    { name:'style', L:'(?:' + STYLE_LEAD + ')(?:\\s+(?:' + STYLE_LEAD + '|' + STYLE_WORD + ')){0,5}', R:'(?:' + STYLE_LEAD + ')(?:\\s+(?:' + STYLE_LEAD + '|' + STYLE_WORD + ')){0,5}' },
    { name:'bare', R:'(?!بني)(?:' + COLOR + ')(?:\\s+(?:و\\s*)?(?:' + COLOR + '|' + SIZE_W + '))*' },   /* «مشكور اخوي احمر وكبير» */
    { name:'link', R:'(?:و\\s*)?(?:يكون|خليه|خله|خلّه|خل|خلي|خلّي|خلها|خليها|حط|حطه|حطها|اجعله|اجعلها|تكون|ايكون)|و' },
    { name:'label', L:'اسمي|اسم|my\\s+name|the\\s+name|name|the\\s+text|text', textOnly:true }
  ].map((t) => ({ name:t.name, textOnly:t.textOnly, L:t.L && new RegExp('^(?:' + t.L + ')(?=' + B + '|$)', 'i'), R:t.R && new RegExp('(?:^|' + B + ')(' + t.R + ')[.!؟?]*$', 'i') }));
  /* في النصّ: «ملك اليمين» تبقى (كلمة معرَّفة وحدها بلا حرف جرّ)، و«اكتب وردي» تبقى (لون مجرّد بلا نصّ قبله) */
  function allowed(t, piece, before, isText){
    if(!isText) return true;
    if(t.name === 'position' && /^[وف]?ال\S+$/.test(piece.trim())) return false;
    if(t.name === 'bare' && !before.trim()) return false;
    return true;
  }
  function peel(src, out, isText, skip){
    let s = String(src || '').replace(TRIM_RE, '');
    for(let guard = 0; guard < 40; guard++){
      let hit = false;
      for(const t of TABLES){
        if((t.textOnly && !isText) || (skip && skip.indexOf(t.name) >= 0)) continue;
        const l = t.L && t.L.exec(s);
        if(l && allowed(t, l[0], s.slice(l[0].length), isText)){ out.push(l[0]); s = s.slice(l[0].length); hit = true; break; }
        const r = t.R && t.R.exec(s);
        if(r && allowed(t, r[1], s.slice(0, r.index), isText)){ out.push(r[1]); s = s.slice(0, r.index); hit = true; break; }
      }
      s = s.replace(TRIM_RE, '');
      if(!hit) break;
    }
    return s;
  }
  /* ذيل المشهد («و الخلفيه زرقاء»، «وتكون فيها العاب نارية»، «والصورة تعبّر عن…») يذهب للمولّد لا فوق الصورة */
  const SCENE_RE = /(?:^|\s)و\s*(?:ال)?(?:صور[ةه]|خلفي[ةه]|مشهد|رسم[ةه])(?=\s+(?!ال|ل)\S|$)|(?:^|\s)و\s*(?:ت|ي)عبّ?ر\s+عن\s+|(?:^|\s)و\s*(?:تكون|يكون|خل|خلي|خلّي|خله|خلها|اجعل|اجعلها|سو|سوي|سوّي|حط|ضيف|أضف|اضف|ارسم)\s+(?:لي\s+)?(?:فيها|فيه|عليها|ال?صور[ةه]|ال?خلفي[ةه]|المشهد|لون\s+ال?خلفي[ةه])(?=\s|$)|\s+(?:(?:تكون|يكون|خلي|خلّي|اجعل)\s+)?ال(?:صور[ةه]|مشهد|خلفي[ةه])\s+(?:تعبر|تعبّر|يعبر|يعبّر|تدل|يدل|توحي|يوحي|تظهر|يظهر|تكون|يكون|فيها|فيه|تحتوي|يحتوي)(?=\s|$)/i;
  function cutScene(s, minAt){
    const i = s.search(SCENE_RE);
    return i >= minAt ? [s.slice(0, i), s.slice(i).replace(/^[\s،,]*و?\s*/, '').trim()] : [s, ''];
  }
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
    ['strong', /(?:^|[\s،,.!؟?:«"])([وف]?(?:اكتب(?:ي|وا|لي|يلي|ه|ها|يه|يها)?|أكتب(?:ي|لي)?|كتبلي|كتبيلي|[تي]كتب(?:ي|ين|ون|ها|ه|لي)?|كتاب[ةه]|write|type|مكتوب[ةه]?\s+(?:عليها|عليه|فيها|على\s+(?:هذه\s+)?(?:ال)?صور[ةه])))(?=$|[\s،,.!؟?:：«"'])/gi],
    ['placed', /(?:^|[\s،,])([وف]?(?:عليها|عليه|فيها|فوقها|تتضمن|تحمل)|على\s+(?:هذه\s+)?(?:ال)?صور[ةه]|with|containing)(?=\s*(?:(?:عبار[ةه]|النص|نص|كلم[ةه]|الكلام|اسم|دعا[ءدهً]?|شعر|بيت\s+شعر|the\s+text|text|words?|name|quote)\s*)?[«“"'])/gi],
    ['weak', /(?:^|[\s،,.!؟?])([وف]?(?:حط(?:لي|ي|وا)?|ضع(?:ي)?|أضف|اضف|ضيف(?:ي|لي)?|put|add))(?=$|[\s:«"'])/gi]
  ];
  const WEAK_OBJ_RE = new RegExp('^\\s*(?:لي\\s+)?(?:(?:عليها|عليه|فوقها|فيها|على\\s+(?:ال)?صور[ةه])\\s+)?(?:' + TEXT_NOUN_W + ')', 'i');
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
        /* النفي: «لا تكتب» (مضارع مجزوم)، أمّا «لا اكتب…» فـ«لا» فيها تصحيح والأمر قائم */
        const before = s.slice(Math.max(0, at - 14), at);
        if(/(?:^|\s)(?:ما|مو|بدون|بلا|دون|غير|not|don'?t|never)(?:\s+(?:ابي|أبي|ابغى|أبغى|ابغا|اريد|أريد|ودي|بدي))?\s*$/i.test(before) || (/(?:^|\s)لا\s*$/.test(before) && /^[وف]?[تي]/.test(m[1]))) continue;
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
  const HEAD_RE = /^(?:(?:أي|اي)\s+)?(كلام|كلمات|كلمتين|كلم[ةه]|جمل[ةه]|جمل|عبار[ةه]|عبارات|حكم[ةه]|اقتباس|مقول[ةه]|بيت\s+شعر|[أا]بيات|قصيد[ةه]|دعا[ءدهً]?|[أا]دعي[ةه]|شعر|غزل|تهنئ[ةه]|معايد[ةه]|رسال[ةه]|نكت[ةه]|نكت|خاطر[ةه]|خواطر|تعليق|وصف|نص|شي|شيء|something|(?:(?:an?|some)\s+)?(?:[a-z]+\s+)?(?:quote|poem|caption|message|saying|words))(?=$|[\s،,.!?؟])/i;
  const DESCRIBER_RE = /^(?:[لب]\S+|عن|حلو\S*|جميل\S*|قصير\S*|طويل\S*|مؤثر\S*|قوي\S*|رائع\S*|مناسب\S*|تحفيزي\S*|رومانسي\S*|زين\S*|راقي\S*|فخم\S*|nice|short|about|for)$/i;
  function requestKind(s){
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
  const REMOVE_VERB = 'احذف|حذف|امسح|مسح|شيل|شيلي|شل|ازل|أزل|ازيل|أزيل|إزال[ةه]|ازال[ةه]|حوز|حوّز|حوزي|نظف|نظّف|اخف|أخف|remove|delete|erase|clear';
  const REMOVE_TEXT_RE = new RegExp('(?:^|[\\s،,])(?:' + REMOVE_VERB + ')\\s*(?:لي\\s+)?(?:(?:هذا|هذه|هذي|هاذا|هاذي)\\s+)?(?:(?:ال)?(?:كلام|كتاب[ةه]|نص|مكتوب|عبار[ةه]|جمل[ةه]|خط|كلمات|حروف)|(?:the\\s+)?(?:text|writing|words?|caption|letters))(?=$|[\\s،,.!؟?])', 'i');
  const WITHOUT_TEXT_RE = /(?:^|\s)(?:بدون|بلا|من\s+غير)\s+(?:ال)?(?:كلام|كتاب[ةه]|نص)(?=$|[\s،,.!؟?])|(?:^|\s)(?:ما|مو)\s+(?:ابي|أبي|ابغى|أبغى|ابغا)\s+(?:ال)?(?:كلام|كتاب[ةه]|نص)|(?:^|\s)(?:امسح|احذف|شيل)\s+(?:اللي|الي)\s+(?:كتبته|كتبتها|مكتوب|انكتب)/i;
  const VAGUE_REMOVE_RE = new RegExp('(?:^|\\s)(?:' + REMOVE_VERB + ')\\s+(?:هذا\\s+الشي|هذا\\s+الشيء|هالشي|هذا|هذي|هذه)\\s*[.!]*$', 'i');  /* «احذف هذا الشي» لا «احذف هذي الشجرة» */
  const isRemoval = (s) => REMOVE_TEXT_RE.test(s) || WITHOUT_TEXT_RE.test(s) || VAGUE_REMOVE_RE.test(s);
  function textRemoveIntent(input){
    const s = String(input || '').trim();
    if(!s || s.length > 120 || findMarker(s)) return false;
    return REMOVE_TEXT_RE.test(unquote(s)) || WITHOUT_TEXT_RE.test(unquote(s));
  }
  const TEXT_NOUN_RE = word('[وف]?(?:ال|لل)(?:نص|كتاب[ةه]|كلام|خط|كلمات|حروف|عبار[ةه]|مكتوب)|[وف]?(?:ب|بال|ل)?خط|text|writing|font|words|caption');
  const IT_RE = word('(?:خل|خلّ|خلي|خلّي|حط|ود|ودّ|نزل|نزّل|ارفع|طلع|طلّع|حرك|حرّك|انقل|اجعل|سو|سوّ|سوي|ابي|أبي|ابغا|ابغى|أبغى|كبر|كبّر|صغر|صغّر|لون|لوّن)ه|it');
  const MOVE_VERB_RE = /(?:حط|ضع|خل|خلي|خلّي|اجعل|حرّ?ك|انقل|نقل|ودّ?|نزّ?ل|ارفع|move|put|place)/i;
  const VISUAL_TARGET_RE = word('[وف]?(?:بال|ال|لل)?(?:خلفي[ةه]?|خلفيات|سما|سماء|بحر|لبس|ملابس|لبسها|لبسه|فستان|فستانها|قميص|ثوب|شعر|شعرها|شعره|وجه|وجهها|وجهه|عيون|عيونها|جدار|كنب[ةه]?|ورد[ةه]?|ورود|زهر[ةه]?|زهور|سيار[ةه]|غرف[ةه]|أرض|ارض|إضاء[ةه]|اضاء[ةه])|background|dress|shirt|hair|sky|wall|sofa|flowers?');
  function styleFields(src){
    const s = String(src || ''), pretty = PRETTY_FONT_RE.test(s), p = positionOf(s);
    const nudge = p ? null : (/(?:^|\s)نزّ?ل/.test(s) ? 'bottom' : (/(?:^|\s)(?:ارفع|طلّ?ع)/.test(s) ? 'top' : null));
    const out = { color:hasColor(s) ? textColor(s) : (pretty ? '#f4cf65' : null), fontKey:namedFont(s) || (pretty ? 'diwani' : null), position:p ? p.position : nudge, size:textSize(s) };
    return out.color || out.fontKey || out.position || out.size ? out : null;
  }
  function textStyleEdit(input){
    const s = unquote(input);
    if(!TEXT_NOUN_RE.test(s) || isRemoval(s)) return null;
    if(findMarker(input) && (s !== String(input) || !MOVE_VERB_RE.test(s) || !positionOf(s))) return null;
    return styleFields(s);
  }
  function onlyStyle(s){          /* «يمين»، «لا، على اليمين»؛ والرابط «خلها» لا يُحسب تنسيقًا («خلها أبيض وأسود» للصورة) */
    const out = [];
    return !peel(s.replace(/(?:^|\s)(?:لا|بس|شوي|ليش|طيب)(?=[\s،,؟?!.]|$)/g, ' '), out, false, ['link']).replace(/[\s،,؟?!.]+/g, '') && out.length > 0;
  }
  function textStyleEditLoose(input){
    const s = unquote(input);
    if(findMarker(input) || isRemoval(s) || VISUAL_TARGET_RE.test(s)) return null;
    if(!TEXT_NOUN_RE.test(s) && !IT_RE.test(s) && !onlyStyle(s)) return null;
    return styleFields(s);
  }

  /* ── الاستبدال على طبقتنا (R14) ── */
  const SWAP_WRITE_RE = /^(?:لا\s+)?(?:(?:ابي|أبي|ابغى|أبغى|ابغي)\s+)?(?:بدال|بدل|مكان)\s+(?!ال?(?:كلام|كتاب|نص))[«"']?([^«»"'\s]+(?:\s+[^«»"'\s]+){0,2}?)[»"']?\s+(?:اكتب|تكتب|حط)\s+[«"']?(.+?)[»"']?\s*[.!]*$/i;
  function textReplaceIntent(input){
    const s = String(input || '').trim();
    if(!s || s.length > 160 || findMarker(s) || textStyleEdit(s)) return null;
    const m = /^(?:لا\s+)?(?:غير|غيّر|غيري|بدل|بدّل|بدلي|خل|خلي|خلّي|خليه|خليها|اجعل|صحح|صحّح|عدل|عدّل)\s+(?:ال)?(?:كلام|كتاب[ةه]|نص|مكتوب|عبار[ةه]|جمل[ةه]|كلم[ةه]|اسم)\s+(?:الى|إلى|لـ|يصير|تصير|يكون|تكون|:)?\s*(.+)$/i.exec(s)
      || /^(?:غير|غيّر|بدل|بدّل)(?:ها|ه)\s+(?:الى|إلى|لـ|ل)\s*(.+)$/i.exec(s)
      || /^(?:change|replace|make)\s+(?:the\s+)?(?:text|words?|writing)\s+(?:to|into|with|say)\s+(.+)$/i.exec(s);
    if(!m) return null;
    const q = quotedValue(m[1]), t = fixKnownPhrases((q ? q.value : m[1]).trim());
    return t && t.length <= 120 && peel(t, [], false) ? t : null;          /* «خلي الكتابه ذهبي» تنسيق لا استبدال */
  }
  function layerWordSwap(input, layerText){
    const s = String(input || '').trim(), t = String(layerText || '');
    if(!s || !t || s.length > 160) return null;
    const m = SWAP_WRITE_RE.exec(s) || /^(?:لا\s+)?(?:غير|غيّر|غيري|بدل|بدّل|بدلي|استبدل|صحح|صحّح)\s+(?:(?:ال)?(?:كلم[ةه]|اسم|جمل[ةه])\s+)?[«"']?(.+?)[»"']?\s+(?:الى|إلى|حط|وحط|خلها|خله|تصير|يصير|مكانها|مكانه|بـ|ب)\s*[«"']?(.+?)[»"']?\s*[.!]*$/i.exec(s);
    if(!m) return null;
    const from = m[1].trim(), to = fixKnownPhrases(m[2].trim());
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
    return /(?:^|[\s،,])(?:اكتب|أكتب|اكتبي|اكتبلي|كتبلي|تكتب|write)(?=$|[\s،,.!?؟:«"'])/i.test(s)
      || /(?:^|[\s،,])(?:حط|ضع|ضيف|أضف|اضف|put|add)\s*(?:لي\s+)?(?:اسمي|اسم|كلمة|كلمه|نص|النص|عبارة|عباره|كلام|جملة|جمله|name|text)/i.test(s);
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
  function visualFields(scene, kind, exact){
    const v = cleanVisual(scene), visualEdit = v && !isGenericVisual(v) ? v : null;
    return { visualPrompt:!visualEdit ? fallbackVisual(kind, exact) : (isCondolence(exact) && !isCondolence(v) ? 'مشهد تعزية بلا وجوه: ' + v : v), visualEdit };
  }
  function parseImageTextSpec(input){
    const source = String(input || '').replace(/\r\n?/g, '\n');
    const none = (extra) => Object.assign({ wantsText:false, exactText:null, visualPrompt:source.trim(), fontKey:'default', color:'#ffffff', position:'bottom', styleEditLoose:null }, extra);
    if(source.length > 400) return none();                                             /* v-longtext-noimg */
    const bare = unquote(source), marker = findMarker(source), removal = isRemoval(bare);
    if(removal && !marker) return none({ removeText:true });                             /* «احذف الكلام وحط وردة» حذفٌ فقط */
    const restyle = removal ? null : textStyleEdit(source);
    if(restyle) return { wantsText:false, exactText:null, visualPrompt:'', styleEdit:restyle, styleEditLoose:restyle, positionFlex:!!((positionOf(bare) || {}).flex) };
    if(SWAP_WRITE_RE.test(source.trim())) return none();                                /* «بدال مشكور اكتب شكراً» تبديل داخل الطبقة */
    const prayer = removal ? null : autoPrayerSpec(source);
    if(prayer){
      const at = Math.min(marker ? marker.index : Infinity, source.search(PRAYER_WORD_RE)), color = textColor(source);
      return Object.assign({ wantsText:true, exactText:null }, visualFields(source.slice(0, Math.max(0, at)), prayer.kind, null), { prayerRequest:prayer.request, fontKey:textFont(source), color, colorSet:color !== '#ffffff', size:textSize(source) }, place(source), { kind:prayer.kind, autoAuthored:true });
    }
    if(!marker) return none({ styleEditLoose:textStyleEditLoose(source) });
    return writeSpec(source, marker);
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
      exact = q.value.trim() ? q.value : null;
      const left = rest.slice(0, q.index), cs = cutScene(rest.slice(q.index + q.whole.length), 0);
      ins.push(left);
      if(/دعا|[أا]دعي|شعر|قصيد|بيت/.test(left)) kind = requestKind(left);
      const leftover = peel(cs[0], ins, false);
      scene.push(isGenericVisual(leftover) ? '' : leftover, cs[1]);
    }else{
      let t = rest, literal = false;
      const c = /^([^:：\n]{0,40})[:：]\s*/.exec(t);
      if(c && peel(c[1], [], false).split(/\s+/).every((w) => !w || LABEL_WORD_RE.test(w))){ ins.push(c[1]); t = t.slice(c[0].length); literal = true; }
      const cs = cutScene(t, 1);
      scene.push(cs[1]);
      t = peel(cs[0], ins, true);
      const cut = t.search(CUT_RE);
      if(cut > 0){ ins.push(t.slice(cut)); t = peel(t.slice(0, cut), ins, true); }
      const r = literal ? { text:t } : classify(t);
      if(r.kind) kind = r.kind;
      else exact = r.text.trim() ? fixKnownPhrases(r.text.trim()) : null;
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
