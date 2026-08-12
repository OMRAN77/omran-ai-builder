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
    if(/نسخ\s*نوتو|نوتو|noto\s*naskh/i.test(source)) return 'naskh2'; if(/ثلث|thuluth/i.test(source)) return 'thuluth'; if(/فارسي|نستعليق|farsi|nastaliq/i.test(source)) return 'farsi'; if(/مصحف|قرآني|quran/i.test(source)) return 'quran';
    if(/نسخ|naskh/i.test(source)) return 'naskh';
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
  function textStyleEdit(source){ if(findTextMarker(source)||!/(?:النص|الكتابة|الكتابه|الكلام|الخط|text|writing|font)/i.test(source)) return null;
    const color=/(?:أصفر|اصفر|ذهبي|أسود|اسود|أخضر|اخضر|أزرق|ازرق|أحمر|احمر|أبيض|ابيض|بيج|yellow|gold|black|green|blue|red|white|beige)/i.test(source)?textColor(source):null, fontKey=/(?:ديواني|رقعة|رقعه|كوفي|عثماني|نسخ|نوتو|ثلث|فارسي|نستعليق|مصحف|قرآني|diwani|ruqaa|kufi|othmani|naskh|thuluth|farsi|nastaliq|quran)/i.test(source)?textFont(source):null, position=/(?:أعلى|اعلى|فوق|وسط|منتصف|المركز|أسفل|اسفل|تحت|top|middle|center|bottom)/i.test(source)?textPosition(source):null;
    return color||fontKey||position ? {color,fontKey,position} : null; }
  function isExplicitImageEdit(input){
    const source = String(input || '').trim();
    if(!source) return false;
    if(textStyleEdit(source) || parseImageTextSpec(source).wantsText) return true;
    if(/(?:نفس\s+(?:الصورة|الصوره)|هذه\s+(?:الصورة|الصوره)|هذي\s+(?:الصورة|الصوره)|هالصورة|هالصوره|الصورة\s+السابقة|الصوره\s+السابقه|(?:same|this|previous)\s+(?:image|picture))/i.test(source)) return true;
    const editVerb = /(?:^|[\s،,.!?؟])(?:عدل|عدّل|حرر|حرّر|غير|غيّر|بدل|بدّل|احذف|امسح|ازل|أزل|شيل|أضف|اضف|ضيف|حط|اكتب|أكتب|خل|اجعل|كبر|كبّر|صغر|صغّر)(?=$|[\s،,.!?؟]|ها)/i.test(source) || /\b(?:edit|change|modify|remove|delete|add|put|write|resize)\b/i.test(source);
    const imageRef = /(?:الصورة|الصوره|هالصورة|هالصوره|عليها|فيها|منها|لها|\S+ها(?:\s|$)|\bit\b|this\s+(?:image|picture)|the\s+(?:image|picture))/i.test(source);
    const visualTarget = /(?:الخلفية|الخلفيه|الملابس|اللبس|الشعر|الوجه|الإضاءة|الاضاءة|الألوان|الالوان|background|outfit|clothes|hair|face|lighting|colou?rs?)/i.test(source);
    return editVerb && (imageRef || visualTarget);
  }
  function autoPrayerSpec(input){
    const source = String(input || '').trim();
    if(!/(?:^|[\s،,.!?؟])(?:دعاء|شعر|قصيدة|كلام\s+(?:غزل|رومانسي)|غزل|prayer|poem|romantic\s+words?)(?=$|[\s،,.!?؟:：\-–—])/i.test(source)) return null;
    // «النص: دعاء...» أو «اكتب كلمة دعاء» يعني نصًا حرفيًا، لا طلب تأليف.
    if(/(?:النص|العبارة|الكلام|الكلمة|كلمة|text|words?)\s*(?:هو|is)?\s*[:：\-–—]?\s*(?:دعاء|شعر|قصيدة|غزل|prayer|poem)(?=$|[\s،,.!?؟])/i.test(source)) return null;
    // كل نص بين علامات اقتباس يبقى حرفيًا كما كتبه المستخدم.
    if(quotedValue(source)) return null;
    return { request:source, kind:/(?:شعر|قصيدة|poem)/i.test(source)?'poetry':/(?:غزل|رومانسي|romantic)/i.test(source)?'flirt':'prayer' };
  }
  function parseImageTextSpec(input){
    const source = String(input || '').replace(/\r\n?/g, '\n');
    const styleEdit = textStyleEdit(source), autoPrayer = styleEdit ? null : autoPrayerSpec(source), marker = autoPrayer ? null : findTextMarker(source); if(styleEdit) return { wantsText:false, exactText:null, visualPrompt:'', styleEdit };
    if(!marker) return autoPrayer ? { wantsText:true, exactText:null, visualPrompt:source.trim(), prayerRequest:autoPrayer.request, fontKey:textFont(source), color:textColor(source), position:(/(?:يمين|right)/i.test(source)?'right-':/(?:يسار|left)/i.test(source)?'left-':'')+textPosition(source), kind:autoPrayer.kind, autoAuthored:true } : { wantsText:false, exactText:null, visualPrompt:source.trim(), fontKey:'default', color:'#ffffff', position:'bottom' };
    const literalPrayerText = /(?:النص|العبارة|الكلام|الكلمة|كلمة|text|words?)\s*(?:هو|is)?\s*[:：\-–—]?\s*(?:دعاء|prayer|du[’']?a)(?=$|[\s،,.!?؟])/i.test(source.slice(marker.index));
    let rest = source.slice(marker.index + marker.value.length);
    rest = rest.replace(/^\s*(?:لي\s+)?/i, '');
    rest = rest.replace(/^\s*(?:عليها|عليه|فوقها|فيها|على\s+(?:هذه\s+)?(?:الصورة|الصوره)|فوق\s+(?:الصورة|الصوره)|on\s+(?:the\s+)?(?:image|photo|picture))\s*/i, '');
    rest = rest.replace(/^\s*(?:النص|العبارة|الكلام|الكلمة|كلمة|اسم|the\s+text|text|words?|name|quote)?\s*(?:هو|وهو|التالي|is)?\s*[:：\-–—]?\s*/i, '');
    let kind = '';
    const kindMatch = rest.match(/^\s*(دعاء|الشعر|شعر|بيت\s+شعر|قصيدة)(?=\s|[:：\-–—]|$)\s*[:：\-–—]?\s*/i);
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
    return { wantsText:true, exactText, visualPrompt, fontKey:textFont(styleSource), color:textColor(styleSource), position:(/(?:يمين|right)/i.test(styleSource)?'right-':/(?:يسار|left)/i.test(styleSource)?'left-':'')+textPosition(styleSource), kind, prayerRequest:!exactText&&kind?source:undefined, autoAuthored:!exactText&&kind?true:undefined };
  }
  root.__parseImageTextSpec = parseImageTextSpec;
  root.__isExplicitImageEdit = isExplicitImageEdit;
  if(typeof module !== 'undefined' && module.exports) module.exports = { parseImageTextSpec, isExplicitImageEdit };
})(typeof window !== 'undefined' ? window : globalThis);
