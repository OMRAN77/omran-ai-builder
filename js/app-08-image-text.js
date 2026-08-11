/* Exact image text parsing: keeps user wording out of the image model, then the client draws it verbatim. */
(function(root){
  function firstMatch(source, regex){
    const m = regex.exec(source);
    return m ? { index:m.index, value:m[0] } : null;
  }
  function findTextMarker(source){
    let strong = firstMatch(source, /(?:أكتب|اكتب(?:ي|وا)?|مكتوب(?:ة)?\s+(?:عليها|عليه|فيها|على\s+(?:هذه\s+)?(?:الصورة|الصوره))|write)/i);
    const placed = firstMatch(source, /(?:عليها|عليه|فيها|فوقها|تتضمن|تحمل|على\s+(?:هذه\s+)?(?:الصورة|الصوره)|(?:with|containing|on\s+it)\s+)(?:\s*(?:عبارة|النص|نص|كلمة|الكلام|اسم|دعاء|شعر|بيت\s+شعر|the\s+text|text|words?|name|quote)\s*)?(?=[«“"'])/i);
    if(placed && (!strong || placed.index < strong.index)) strong = placed;
    const weak = firstMatch(source, /(?:ضع|حط|أضف|اضف|ضيف|put|add)/i);
    if(!weak) return strong;
    const tail = source.slice(weak.index + weak.value.length);
    const weakIsText = /^\s*(?:لي\s+)?(?:عليها|عليه|فوقها|فيها|على\s+(?:هذه\s+)?(?:الصورة|الصوره)|النص|العبارة|الكلام|كلمة|اسم|دعاء|شعر|بيت\s+شعر|the\s+text|text|words?|name|quote)(?=\s|[:：«“"'\-–—]|$)/i.test(tail) || /[«“"']/.test(tail);
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
    if(/نسخ|naskh/i.test(source)) return 'naskh';
    return 'modern';
  }
  function textColor(source){
    if(/ذهبي|ذهبية|gold/i.test(source)) return '#f4cf65';
    if(/أسود|اسود|black/i.test(source)) return '#111111';
    if(/أخضر|اخضر|green/i.test(source)) return '#2e8b57';
    if(/أزرق|ازرق|blue/i.test(source)) return '#2979ff';
    if(/أحمر|احمر|red/i.test(source)) return '#d32f2f';
    if(/بيج|beige/i.test(source)) return '#ead9bd';
    return '#ffffff';
  }
  function textPosition(source){
    if(/(?:في|بال|إلى|الى)?\s*(?:أعلى|اعلى|فوق)|\btop\b/i.test(source)) return 'top';
    if(/(?:في|بال)?\s*(?:وسط|منتصف|المنتصف|المركز)|\b(?:middle|center)\b/i.test(source)) return 'center';
    return 'bottom';
  }
  function cleanVisual(value){
    return String(value || '').replace(/\s*(?:و|and)\s*$/i, '').trim();
  }
  function fallbackVisual(kind, exactText){
    if(kind === 'prayer' || /(?:اللهم|ربنا|يا\s+رب)/.test(exactText || '')) return 'خلفية هادئة ومهيبة مناسبة لدعاء عربي';
    if(kind === 'poetry') return 'خلفية فنية أصيلة مناسبة لشعر عربي';
    return 'خلفية فنية أنيقة مناسبة للنص المطلوب';
  }
  function isExplicitImageEdit(input){
    const source = String(input || '').trim();
    if(!source) return false;
    if(/(?:نفس\s+(?:الصورة|الصوره)|هذه\s+(?:الصورة|الصوره)|هذي\s+(?:الصورة|الصوره)|هالصورة|هالصوره|الصورة\s+السابقة|الصوره\s+السابقه|(?:same|this|previous)\s+(?:image|picture))/i.test(source)) return true;
    const editVerb = /(?:^|[\s،,.!?؟])(?:عدل|عدّل|حرر|حرّر|غير|غيّر|بدل|بدّل|احذف|امسح|ازل|أزل|شيل|أضف|اضف|ضيف|حط|اكتب|أكتب|خل|اجعل|كبر|كبّر|صغر|صغّر)(?=$|[\s،,.!?؟]|ها)/i.test(source) || /\b(?:edit|change|modify|remove|delete|add|put|write|resize)\b/i.test(source);
    const imageRef = /(?:الصورة|الصوره|هالصورة|هالصوره|عليها|فيها|منها|لها|\S+ها(?:\s|$)|\bit\b|this\s+(?:image|picture)|the\s+(?:image|picture))/i.test(source);
    return editVerb && imageRef;
  }
  function autoPrayerSpec(source){ const m = !/(?:النص|العبارة|الكلام|الكلمة|كلمة)\s*[:：\-–—]?\s*دعاء/i.test(source) && String(source || '').match(/(?:^|\s)(دعاء(?:\s+(?:الاستخارة|الصباح|المساء|السفر|(?:قبل|عند)\s+النوم|النوم|(?:بعد\s+)?الاستيقاظ|المطر|المرض|الشفاء|للوالدين|للأبوين|الرزق|المغفرة|التوبة|الدراسة|النجاح|التوفيق|الزواج|دخول\s+البيت|الخروج\s+من\s+البيت))?)(?=\s*(?:بخط|بالخط|بلون|باللون|في\s+(?:الأعلى|الاعلى|الوسط|المنتصف|الأسفل|الاسفل)|$))/i); if(!m) return null; const prayers = [[/استخار/,'اللهم إني أستخيرك بعلمك، وأستقدرك بقدرتك، وأسألك من فضلك العظيم، فإنك تقدر ولا أقدر، وتعلم ولا أعلم، وأنت علام الغيوب. اللهم إن كنت تعلم أن هذا الأمر خير لي في ديني ومعاشي وعاقبة أمري، فاقدره لي ويسره لي، ثم بارك لي فيه، وإن كنت تعلم أن هذا الأمر شر لي في ديني ومعاشي وعاقبة أمري، فاصرفه عني واصرفني عنه، واقدر لي الخير حيث كان، ثم أرضني به.'],[/صباح/,'أصبحنا وأصبح الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير. رب أسألك خير ما في هذا اليوم وخير ما بعده، وأعوذ بك من شر ما في هذا اليوم وشر ما بعده.'],[/مساء/,'أمسينا وأمسى الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير. رب أسألك خير ما في هذه الليلة وخير ما بعدها، وأعوذ بك من شر ما في هذه الليلة وشر ما بعدها.'],[/سفر/,'سبحان الذي سخر لنا هذا وما كنا له مقرنين، وإنا إلى ربنا لمنقلبون. اللهم إنا نسألك في سفرنا هذا البر والتقوى، ومن العمل ما ترضى. اللهم هون علينا سفرنا هذا واطو عنا بعده.'],[/استيقاظ/,'الحمد لله الذي أحيانا بعدما أماتنا وإليه النشور.'],[/نوم/,'باسمك اللهم أموت وأحيا.'],[/مطر/,'اللهم صيبا نافعا.'],[/(?:مرض|شفاء)/,'اللهم رب الناس، أذهب البأس، واشف أنت الشافي، لا شفاء إلا شفاؤك، شفاء لا يغادر سقما.'],[/(?:الوالدين|الأبوين)/,'رب ارحمهما كما ربياني صغيرا.'],[/رزق/,'اللهم إني أسألك علما نافعا، ورزقا طيبا، وعملا متقبلا.'],[/(?:مغفر|توب)/,'رب اغفر لي وتب علي، إنك أنت التواب الرحيم.'],[/(?:دراسة|نجاح|توفيق)/,'رب اشرح لي صدري، ويسر لي أمري، واحلل عقدة من لساني يفقهوا قولي.'],[/زواج/,'ربنا هب لنا من أزواجنا وذرياتنا قرة أعين، واجعلنا للمتقين إماما.'],[/دخول\s+البيت/,'اللهم إني أسألك خير المولج وخير المخرج، باسم الله ولجنا، وباسم الله خرجنا، وعلى الله ربنا توكلنا.'],[/الخروج\s+من\s+البيت/,'بسم الله، توكلت على الله، ولا حول ولا قوة إلا بالله.']]; const hit = prayers.find((item) => item[0].test(m[1])); return { title:m[1], text:hit ? hit[1] : 'ربنا آتنا في الدنيا حسنة، وفي الآخرة حسنة، وقنا عذاب النار.' }; }
  function parseImageTextSpec(input){
    const source = String(input || '').replace(/\r\n?/g, '\n');
    const autoPrayer = autoPrayerSpec(source), marker = autoPrayer ? null : findTextMarker(source);
    if(!marker) return autoPrayer ? { wantsText:true, exactText:autoPrayer.text, visualPrompt:'مشهد فني هادئ ومهيب مستوحى من ' + autoPrayer.title + '، بتكوين وإضاءة مناسبين لمعناه دون كتابة', fontKey:textFont(source), color:textColor(source), position:textPosition(source), kind:'prayer', autoAuthored:true } : { wantsText:false, exactText:null, visualPrompt:source.trim(), fontKey:'modern', color:'#ffffff', position:'bottom' };
    let rest = source.slice(marker.index + marker.value.length);
    rest = rest.replace(/^\s*(?:لي\s+)?/i, '');
    rest = rest.replace(/^\s*(?:عليها|عليه|فوقها|فيها|على\s+(?:هذه\s+)?(?:الصورة|الصوره)|فوق\s+(?:الصورة|الصوره)|on\s+(?:the\s+)?(?:image|photo|picture))\s*/i, '');
    rest = rest.replace(/^\s*(?:النص|العبارة|الكلام|الكلمة|كلمة|اسم|the\s+text|text|words?|name|quote)?\s*(?:هو|وهو|التالي|is)?\s*[:：\-–—]?\s*/i, '');
    let kind = '';
    const kindMatch = rest.match(/^\s*(دعاء|الشعر|شعر|بيت\s+شعر|قصيدة)(?=\s|[:：\-–—]|$)\s*[:：\-–—]?\s*/i);
    if(kindMatch){
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
      const styleTail = rest.match(/\s+(?:،|,)?\s*(?:(?:بخط|بالخط)\s+\S+(?:\s+(?:ذهبي(?:ة)?|أبيض|ابيض|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|بيج|gold|white|black|green|blue|red|beige))?|(?:بلون|باللون|لون\s+النص)\s+\S+|(?:واجعل|اجعل|وخلي|خلي)\s+النص\s+(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|الوسط|المنتصف|الأسفل|الاسفل))(?:\s+(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|فوق|الوسط|المنتصف|المركز|الأسفل|الاسفل))?\s*$/i);
      if(styleTail && styleTail.index >= 0){ suffix = rest.slice(styleTail.index); rest = rest.slice(0, styleTail.index); }
      styleSource = suffix;
      exactText = rest.trim();
    }
    if(exactText == null || !exactText.trim() || /^(?:دعاء|شعر|بيت\s+شعر|قصيدة|نص|كلام|prayer|poem|text)$/i.test(exactText.trim())) exactText = null;
    let visualPrompt = cleanVisual(source.slice(0, marker.index));
    const visualSuffix = suffix.replace(/(?:بخط|بالخط)\s+\S+(?:\s+(?:ذهبي(?:ة)?|أبيض|ابيض|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|بيج|gold|white|black|green|blue|red|beige))?|(?:بلون|باللون|لون\s+النص)\s+\S+|(?:واجعل|اجعل|وخلي|خلي)\s+النص\s+(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|الوسط|المنتصف|الأسفل|الاسفل)|(?:في|بال|إلى|الى)\s*(?:الأعلى|الاعلى|فوق|الوسط|المنتصف|المركز|الأسفل|الاسفل)|(?:on|in)\s+(?:the\s+)?(?:image|photo|picture|top|middle|center|bottom)/gi, '').replace(/^[\s،,و]+|[\s،,]+$/g, '');
    if(visualSuffix) visualPrompt = (visualPrompt + ' ' + visualSuffix).trim();
    if(!visualPrompt || /^(?:(?:أنشئ|انشئ|اصنع|ولد|ولّد|صمم|ارسم|create|generate|make|draw)\s*(?:لي\s*)?)?(?:صورة|صوره|image|picture)?\s*$/i.test(visualPrompt)) visualPrompt = fallbackVisual(kind, exactText);
    return { wantsText:true, exactText, visualPrompt, fontKey:textFont(styleSource), color:textColor(styleSource), position:textPosition(styleSource), kind };
  }
  root.__parseImageTextSpec = parseImageTextSpec;
  root.__isExplicitImageEdit = isExplicitImageEdit;
  if(typeof module !== 'undefined' && module.exports) module.exports = { parseImageTextSpec, isExplicitImageEdit };
})(typeof window !== 'undefined' ? window : globalThis);
