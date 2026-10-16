/* v-topic-memory (شكوى المالك ١٤ سبتمبر «المواضيع كلّها تتداخل… أتكلّم عن موضوع وأبدّله ثمّ أرجع
   للي قبله فكأنّي ما سألته أيّ شيء»): المطلوب وجهان معًا — تبديل الموضوع لا يجرّ القديم، والرجوع
   إليه لا ينساه. القاعدة القديمة «أجب عن الرسالة الأخيرة وحدها، والتاريخ خلفيّة فقط» كانت تعلّم
   النموذج النسيان. هنا كاشف صافٍ (بلا DOM) يصنّف الرسالة الحاليّة:
     new    = موضوع مستقلّ (لا تقاطع كلمات مع الدور السابق ولا مع أسئلة أقدم) → تعليمة «أجب عن
              الجديد ولا تكمل السابق، والتاريخ كلّه يبقى ذاكرتك».
     back   = عودة إلى موضوع أقدم (إشارة صريحة، أو تقاطع مع سؤال أقدم بلا تقاطع مع الأخير) →
              تعليمة «المستخدم يعود إلى موضوع سابق» مع استدعاء السؤال القديم وجوابه نصًّا.
     follow = متابعة عاديّة (إشارة متابعة، رسالة قصيرة، أو تقاطع مع الدور السابق) → لا تعليمة.
   لا يُحذف شيء من التاريخ أبدًا. tests/topic-switch.test.cjs. */
(function(){
  'use strict';
  var STOP = {};
  ('في من على عن إلى الى مع هذا هذه هذي ذاك ذلك تلك انا أنا انت أنت هو هي هم نحن كان كانت يكون تكون ما لا لم لن ليس ليست كل بعض اي أي أين متى كيف لماذا ليش هل او أو ثم بس فقط جدا جدًا جداً كثير قليل شي شيء شوي لو اذا إذا ان أن إن حتى حتّى عند عندي عندك لي لك له لها لنا لهم بعد قبل الآن الان اليوم امس أمس غدا غدًا ابي أبي ابغى أبغى اريد أريد ممكن سمحت ياليت رجاء فضلك اكتب أكتب اكتبلي سوي سوّي اعمل أعمل قل قلي عطني أعطني هات ايش وش شو ليه كذا هنا هناك يا نعم لا طيب تمام اوكي أوكي '
   + 'the a an and or of to in on for with is are was were be been it this that these those i you he she we they my your our their me us them will would can could should do does did not no yes please make write give tell about how what why when where which').split(/\s+/).forEach(function(w){ if(w) STOP[w] = 1; });
  function norm(w){
    return String(w || '').toLowerCase().replace(/[ً-ٰٟ]/g, '').replace(/^(?:و|ف|ب|ل|ك)?ال/, '').replace(/[إأآ]/g, 'ا').replace(/ة$/, 'ه').replace(/ى$/, 'ي');
  }
  /** كلمات المحتوى بعد التطبيع وحذف كلمات الوقف (٣ أحرف فأكثر بعد التطبيع).
      v-topic-and (لقطة المالك ١٦ أكتوبر: «وين افضل كوفي في عجمان» ثمّ «وفي الشارقه» صُنّفت موضوعًا جديدًا فحُرم النموذج سياق القهوة):
      حرف الجرّ أو أداة السؤال بواو العطف أو فائه («وفي»، «وكيف»، «فهل») وقفٌ — كانت تُحسب كلمة محتوى.
      v-topic-and2 (مراجعة عدائيّة بعد الدمج): القائمة CONJ_FN محصورة لا STOP كلّه — «لم/له/ان/هم» تصطدم بكلمات حقيقيّة
      («فلم»، «فله»، «فان»، «فهم») فكانت تُحذف وتكسر العودة لموضوعها؛ و«وين/مين/منو» أُعيدت كلمات (إضافتها للوقف قلبت «مين حكم بعده»
      و«وين نتغدى قريب منه» إلى موضوع جديد). */
  var CONJ_FN = {};
  'في من على عن الى إلى مع كيف هل متى وين اين أين لو اذا إذا بعد قبل عند ما لا ليش لماذا شو وش ايش كم هذا هذي هذه ثم بس كذا هنا هناك يا'.split(' ').forEach(function(w){ CONJ_FN[w] = 1; });
  function words(s){
    var out = [];
    String(s || '').replace(/[؀-ۿ\w]{2,}/g, function(w){
      var lw = w.toLowerCase(); if(STOP[lw]) return '';
      if((lw.charAt(0) === 'و' || lw.charAt(0) === 'ف') && CONJ_FN[lw.slice(1)]) return '';
      var n = norm(w); if(n.length >= 3 && !STOP[n]) out.push(n);
      return '';
    });
    return out;
  }
  function overlap(nw, text){
    if(!nw.length) return 0;
    var set = {}; words(text).forEach(function(w){ set[w] = 1; });
    var hit = 0; nw.forEach(function(w){ if(set[w]) hit++; });
    return hit / nw.length;
  }
  /** أفضل تقاطع مع الأسئلة الأقدم (الأحدث أوّلًا): {index, ratio}. */
  function bestEarlier(nw, earlier){
    var best = { index: -1, ratio: 0 };
    (earlier || []).forEach(function(t, i){ var r = overlap(nw, t); if(r > best.ratio){ best = { index: i, ratio: r }; } });
    return best;
  }
  /* إشارات المتابعة: ضمائر إشارة، أفعال تعديل على شيء سابق، «كمل/زد/وضّح»، ورأي في ما سبق. */
  var REF = /(هذا|هذه|هذي|هذول|هاذي|ذاك|ذلك|تلك|نفس|السابق|اللي فوق|الي فوق|أعلاه|اعلاه|كمل|كمّل|أكمل|اكمل|استمر|تابع|زد|زيد|عدل|عدّل|غير|غيّر|بدل|بدّل|صلح|صلّح|حسن|حسّن|شيل|احذف|اضف|أضف|ضيف|اعد|أعد|كرر|ترجم|لخص|لخّص|اختصر|وسع|وسّع|طول|طوّل|وضح|وضّح|اشرح|رأيك|رايك|ايضا|أيضا|أيضًا|برضو|بعدين|بعدها|والثاني|وثاني|الثاني|فوق|\bit\b|\bthis\b|\bthat\b|\bthese\b|\bthose\b|\bsame\b|\babove\b|\bagain\b|\bcontinue\b|\bmore\b|\balso\b|\bprevious\b)/i;
  var NEW = /^\s*(?:موضوع\s+(?:جديد|ثاني|آخر|اخر)|سؤال\s+(?:ثاني|آخر|اخر|جديد)|new topic|change of topic)/i;
  var BACK = /(ارجع|نرجع|رجعنا|خلنا نرجع|بالنسبة ل|بخصوص|الموضوع (?:الأول|الاول|السابق|القديم)|اللي (?:قبل|كنا)|الي (?:قبل|كنا)|السؤال (?:الأول|الاول|السابق)|go back|back to)/i;

  /**
   * القرار: {kind:'new'|'follow'|'back', reason, backIndex}.
   * earlierUsers: أسئلة المستخدم الأقدم من الدور السابق، الأحدث أوّلًا؛ backIndex يشير إليها.
   */
  function decide(text, prevUser, prevAssistant, earlierUsers){
    var t = String(text || '').trim();
    var nw = words(t);
    if(!t) return { kind: 'follow', reason: 'empty', backIndex: -1 };
    if(BACK.test(t)) return { kind: 'back', reason: 'back-marker', backIndex: bestEarlier(nw, earlierUsers).index };
    if(NEW.test(t)) return { kind: 'new', reason: 'explicit', backIndex: -1 };
    if(!String(prevUser || '').trim()) return { kind: 'follow', reason: 'first', backIndex: -1 };
    if(REF.test(t)) return { kind: 'follow', reason: 'reference', backIndex: -1 };
    if(nw.length < 2) return { kind: 'follow', reason: 'short', backIndex: -1 };
    var rPrev = overlap(nw, String(prevUser || '') + '\n' + String(prevAssistant || ''));
    if(rPrev > 0.2) return { kind: 'follow', reason: 'overlap ' + rPrev.toFixed(2), backIndex: -1 };
    var best = bestEarlier(nw, earlierUsers);
    if(best.index >= 0 && best.ratio >= 0.3) return { kind: 'back', reason: 'earlier ' + best.ratio.toFixed(2), backIndex: best.index };
    return { kind: 'new', reason: 'overlap ' + rPrev.toFixed(2), backIndex: -1 };
  }
  window.omranTopicSwitch = decide;
  window.omranTopicWords = words;
})();
