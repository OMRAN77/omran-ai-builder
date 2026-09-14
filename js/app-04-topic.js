/* v-topic-segments (شكوى المالك ١٤ سبتمبر «المواضيع كلّها تتداخل مع بعضها… إذا أبي أغيّر الموضوع
   لازم محادثة جديدة»): قاعدة «اترك الموضوع القديم» كانت نصًّا في التعليمات فقط، بينما يرى النموذج
   آخر ٢٤ دورًا من الموضوع القديم ومرساةً تعيده إلى «الموضوع الأصليّ». هنا الكشف حتميّ في العميل:
   رسالة مستقلّة (كلمتا محتوى فأكثر) بلا إشارة متابعة وبلا تقاطع كلمات مع الدور السابق = موضوع
   جديد، فتُرسل بلا تاريخ الموضوع القديم وتبدأ شريحةً جديدة (cur.topicAnchor) تحمل ما بعدها فقط.
   «موضوع جديد: …» يفرض التبديل، و«ارجع للموضوع الأوّل/السابق» يرفع الشريحة فيعود التاريخ كلّه.
   دالّة صافية بلا DOM لتُختبر مباشرة (tests/topic-switch.test.cjs). */
(function(){
  'use strict';
  var STOP = {};
  ('في من على عن إلى الى مع هذا هذه هذي ذاك ذلك تلك انا أنا انت أنت هو هي هم نحن كان كانت يكون تكون ما لا لم لن ليس ليست كل بعض اي أي أين متى كيف لماذا ليش هل او أو ثم بس فقط جدا جدًا جداً كثير قليل شي شيء شوي لو اذا إذا ان أن إن حتى حتّى عند عندي عندك لي لك له لها لنا لهم بعد قبل الآن الان اليوم امس أمس غدا غدًا ابي أبي ابغى أبغى اريد أريد ممكن سمحت ياليت رجاء فضلك اكتب أكتب اكتبلي سوي سوّي اعمل أعمل قل قلي عطني أعطني هات ايش وش شو ليه كذا هنا هناك يا نعم لا طيب تمام اوكي أوكي '
   + 'the a an and or of to in on for with is are was were be been it this that these those i you he she we they my your our their me us them will would can could should do does did not no yes please make write give tell about how what why when where which').split(/\s+/).forEach(function(w){ if(w) STOP[w] = 1; });
  function norm(w){
    return String(w || '').toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '').replace(/^(?:و|ف|ب|ل|ك)?ال/, '').replace(/[إأآ]/g, 'ا').replace(/ة$/, 'ه').replace(/ى$/, 'ي');
  }
  /** كلمات المحتوى بعد التطبيع وحذف كلمات الوقف (٣ أحرف فأكثر بعد التطبيع). */
  function words(s){
    var out = [];
    String(s || '').replace(/[\u0600-\u06FF\w]{2,}/g, function(w){
      var lw = w.toLowerCase(); if(STOP[lw]) return '';
      var n = norm(w); if(n.length >= 3 && !STOP[n]) out.push(n);
      return '';
    });
    return out;
  }
  /* إشارات المتابعة: ضمائر إشارة، أفعال تعديل على شيء سابق، «كمل/زد/وضّح»، ورأي في ما سبق. */
  var REF = /(هذا|هذه|هذي|هذول|هاذي|ذاك|ذلك|تلك|نفس|السابق|اللي فوق|الي فوق|اللي قبل|الي قبل|أعلاه|اعلاه|كمل|كمّل|أكمل|اكمل|استمر|تابع|زد|زيد|عدل|عدّل|غير|غيّر|بدل|بدّل|صلح|صلّح|حسن|حسّن|شيل|احذف|اضف|أضف|ضيف|اعد|أعد|كرر|ترجم|لخص|لخّص|اختصر|وسع|وسّع|طول|طوّل|وضح|وضّح|اشرح|رأيك|رايك|ايضا|أيضا|أيضًا|برضو|بعدين|بعدها|والثاني|وثاني|الثاني|فوق|\bit\b|\bthis\b|\bthat\b|\bthese\b|\bthose\b|\bsame\b|\babove\b|\bagain\b|\bcontinue\b|\bmore\b|\balso\b|\bprevious\b)/i;
  var NEW = /^\s*(?:موضوع\s+(?:جديد|ثاني|آخر|اخر)|سؤال\s+(?:ثاني|آخر|اخر|جديد)|new topic|change of topic)/i;
  var BACK = /(ارجع|نرجع|رجعنا|خلنا نرجع|بالنسبة ل|بخصوص|الموضوع (?:الأول|الاول|السابق|القديم)|اللي (?:قبل|كنا)|الي (?:قبل|كنا)|السؤال (?:الأول|الاول|السابق)|go back|back to)/i;

  /**
   * القرار: {kind:'new'|'follow'|'back', reason}.
   * new = موضوع مستقلّ (يُرسل بلا الموضوع القديم)، follow = متابعة (التاريخ كما هو)، back = رجوع صريح لما قبل.
   */
  function decide(text, prevUser, prevAssistant){
    var t = String(text || '').trim();
    if(!t) return { kind: 'follow', reason: 'empty' };
    if(BACK.test(t)) return { kind: 'back', reason: 'back-marker' };
    if(NEW.test(t)) return { kind: 'new', reason: 'explicit' };
    if(!String(prevUser || '').trim()) return { kind: 'follow', reason: 'first' };
    if(REF.test(t)) return { kind: 'follow', reason: 'reference' };
    var nw = words(t);
    if(nw.length < 2) return { kind: 'follow', reason: 'short' };
    var prev = {}; words(prevUser).concat(words(prevAssistant)).forEach(function(w){ prev[w] = 1; });
    var hit = 0; nw.forEach(function(w){ if(prev[w]) hit++; });
    var ratio = hit / nw.length;
    return { kind: ratio <= 0.2 ? 'new' : 'follow', reason: 'overlap ' + ratio.toFixed(2) };
  }
  window.omranTopicSwitch = decide;
  window.omranTopicWords = words;
})();
