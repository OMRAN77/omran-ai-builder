/* ───────── v-swipe-back (فكرة المالك ٤ سبتمبر: «تلغي X وخليهم كلهم سحب يرجعك إلى الصفحة الي خلفها») ─────────
 * v2 (أمر المالك: «سحب نفس الإعدادات، وشريط السحب احذفه من كل مكان»): نفس سلوك درج الإعدادات
 * حرفيًا — اسحب بالإصبع لليمين من أي مكان في الشاشة فتتبعك الشاشة، وبعد ثلث العرض (أو نفضة
 * سريعة) تنزلق وتُغلق وترجع للصفحة خلفها. لا مقابض ولا أشرطة ولا مناطق حافة. التمرير الرأسي
 * والقوائم الأفقية والمنزلقات لا تتأثر. أزرار ✕ مخفية ويُضغط عليها برمجيًا فيبقى منطق الإغلاق
 * الأصلي. Esc يغلق على الكمبيوتر. التلفزيون مشمول بأمر المالك اللاحق. */
(function(){
  'use strict';
  var MAP = {
    portraitStyleModal: 'portraitStyleCloseBtn', videoMakerModal: 'videoMakerCloseBtn', designAiModal: 'designAiCloseBtn',
    fashionAiModal: 'fashionAiCloseBtn', studioAiModal: 'studioAiCloseBtn', constructionModal: 'constructionCloseBtn',
    religionModal: 'religionCloseBtn', emailAssistModal: 'emailAssistCloseBtn', stocksModal: 'stocksCloseBtn',
    expModal: 'expCloseBtn', docModal: 'docX', govModal: 'govX', cvModal: 'cvX',
    eduHubModal: 'eduCloseBtn', omranEduModal: 'omranEduCloseBtn', /* التعليم: المركز، والشاشة القديمة داخل إطار */
    omranQiblaShell: 'qClose', fbOverlay: 'fbClose', sectionsToolsOverlay: 'stpCloseBtn',
    omranTvShell: 'tvClose', /* أمر المالك ٤ سبتمبر: «التلفزيون X ما يستوي — سحب» */
    portraitStyleSheet: 'portraitStyleSheetClose', /* ورقة أنماط الصور */
    /* أمر المالك ٤ سبتمبر: «في الديكور كلها داخل احذف X وخلها سحاب، وفي الاستايل بعد كلها، وفي التعليم»:
       ورقة الخيارات الداخلية الموحّدة (الشعر، المناسبة، نمط الديكور، …) */
    pickerSheet: 'pickerSheetClose',
    inspireScreen: 'inspireCloseBtn', /* v-inspire: شاشة «اقتراحات» — سحب/Esc يغلقها وحدها لا شاشة الأدوات تحتها */
  };

  var css = document.createElement('style');
  css.id = 'omranSwipeBackCss';
  css.textContent =
    Object.keys(MAP).map(function(k){ return '#' + MAP[k]; }).join(',') + '{display:none !important;}' +
    '.omranSwiping{transition:none !important;will-change:transform;}' +
    '.omranSwipeSettle{transition:transform .18s ease-out, opacity .18s ease-out !important;}' +
    'html.omranMouseSwipe, html.omranMouseSwipe *{user-select:none !important; cursor:grabbing !important;}';
  document.head.appendChild(css);

  function visible(el){
    if(!el) return false;
    var cs = getComputedStyle(el);
    if(cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return r.width > 50 && r.height > 50;
  }
  function topTool(){
    var best = null, bz = -1;
    Object.keys(MAP).forEach(function(id){
      var el = document.getElementById(id);
      if(!visible(el)) return;
      var z = parseInt(getComputedStyle(el).zIndex || '0', 10) || 0;
      /* تساوي الطبقة: المتأخر في المستند هو الأعلى بصريًا (التعليم القديم فوق مركز التعليم) */
      var later = best ? !!(best.compareDocumentPosition(el) & 4) : true;
      if(z > bz || (z === bz && later)){ bz = z; best = el; }
    });
    return best;
  }
  function closeTool(el){
    /* شاشة الأدوات فيها مستوى داخلي («عرض الكل»): السحب يرجع منه إلى الصفوف
       أولًا، ولا يغلق شاشة الأدوات إلى المحادثة مباشرة. */
    if(el && typeof el.__omranSwipeBackStep === 'function'){
      try{ if(el.__omranSwipeBackStep()) return true; }catch(e){ /* guard-ok */ }
    }
    var btn = el && document.getElementById(MAP[el.id]);
    /* v-maha-app: أثناء مكالمة مها كانت مراقبة الإغلاق تبتلع هذه النقرة البرمجيّة فتنتهي المكالمة وتبقى النافذة — السحب وEsc يغلقان النافذة وحدها */
    if(btn){ try{ swipeClickGuardUntil = 0; if(typeof mahaActing === 'number') mahaActing++; try{ btn.click(); }finally{ if(typeof mahaActing === 'number') mahaActing--; } if(typeof mahaAppWinSync === 'function') mahaAppWinSync(); return true; }catch(e){ /* guard-ok */ } }
    return false;
  }
  /* الجزء الذي يتحرك مع الإصبع: صندوق المحتوى (أول ابن كبير) وإلا الحاوية نفسها */
  /* الأوراق المعتمة كاملة الشاشة (ورقة الخيارات، ورقة الأنماط، التعليم): تتحرك كلها كوحدة */
  var SELF = { pickerSheet: 1, portraitStyleSheet: 1, omranEduModal: 1 };
  function panel(el){
    if(SELF[el.id]) return el;
    var kids = Array.prototype.slice.call(el.children).filter(function(c){ var r = c.getBoundingClientRect(); return r.width > 100 && r.height > 100; });
    return kids[0] || el;
  }
  /* عناصر لا نسحب منها: منزلقات، فيديو، كانفاس، حقول نصية، وأي قائمة تتمرر أفقيًا */
  /* v-compare-drag-swipe-fix (لقطة المالك ٢١ سبتمبر: «السحب يسحب الشاشة كاملة إلى الخارج» —
     شريط قبل/بعد المحسّن): حاويات المقارنة (v-compare-drag/v-compare-drag-all) صارت سحبًا مباشرًا
     على <div> عاديّ بدل <input type=range> القديم المستثنى هنا صراحة (السطر أعلاه). أيّ سحب عليها
     كان يبدأ أيضًا سحب الورقة/النافذة كاملة للإغلاق (هذا الملف يستمع لأي سحب من أيّ مكان في الأداة)،
     فيتنازع مع سحب المقارنة ويغلبه بصريًّا — بالضبط ما وصفه المالك. نفس منطق استثناء «شريط تمرير أفقي»
     أدناه (overflowX) لكن بالمعرّف مباشرة لأنّ حاويات المقارنة overflow:hidden لا scroll. */
  var COMPARE_DRAG_IDS = { portraitCompareWrap: 1, designBAWrap: 1, fashionAiResultWrap: 1, studioAiResultWrap: 1 };
  function blocked(t){
    var e = t;
    for(var i = 0; e && e !== document.body && i < 12; i++){
      var tag = (e.tagName || '').toLowerCase();
      if(tag === 'video' || tag === 'canvas' || tag === 'iframe') return true;
      if(tag === 'input' && (e.type === 'range' || e.type === 'file')) return true;
      /* الحقول: السحب منها مسموح ما لم تكن قيد الكتابة (شكوى المالك في مولّد السيرة: الصفحة كلها حقول) */
      if((tag === 'input' || tag === 'textarea' || tag === 'select') && document.activeElement === e) return true;
      if(e.id && COMPARE_DRAG_IDS[e.id]) return true;
      /* صفوف الأدوات سحب أفقي دائمًا؛ لا ندع سحب الرجوع العام ينافسها
         حتى خلال لحظة إعادة الرسم أو قبل اكتمال قياس overflow. */
      if(e.classList && e.classList.contains('ptCarousel') && !(e.closest && e.closest('.ptHwGrid'))) return true; /* v-hw-tools-grid: شبكة هواوي لا تتمرّر جانبيًّا */
      try{
        var cs = getComputedStyle(e);
        if((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 4) return true;
      }catch(err){ /* guard-ok */ }
      e = e.parentElement;
    }
    return false;
  }

  function bind(el){
    var t0 = null, dragging = false, w = 0, p = null;
    var setX = function(x, anim){
      if(!p) return;
      p.classList.toggle('omranSwipeSettle', !!anim);
      p.classList.toggle('omranSwiping', !anim);
      p.style.transform = x ? ('translateX(' + x + 'px)') : '';
      p.style.opacity = x ? String(Math.max(.3, 1 - x / Math.max(1, w) * .9)) : '';
    };
    el.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1 || blocked(e.target)){ t0 = null; return; }
      if(topTool() !== el){ t0 = null; return; }
      t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, ts: Date.now() };
      dragging = false;
      p = panel(el);
      w = window.innerWidth || 360;
    }, { passive: true });
    el.addEventListener('touchmove', function(e){
      if(!t0) return;
      var dx = e.touches[0].clientX - t0.x;
      var dy = e.touches[0].clientY - t0.y;
      if(!dragging){
        if(Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return; /* تمرير رأسي */
        if(dx <= 0){ t0 = null; return; } /* لليسار: ليس رجوعًا */
        dragging = true;
      }
      setX(Math.max(0, dx), false);
    }, { passive: true });
    var finish = function(e){
      if(!t0) return;
      var was = dragging;
      var dx = (was && e.changedTouches && e.changedTouches[0]) ? (e.changedTouches[0].clientX - t0.x) : 0;
      var dt = Date.now() - t0.ts;
      t0 = null; dragging = false;
      if(!was) return;
      if(dx > w * 0.35 || (dt < 300 && dx > 70)){
        setX(w + 40, true);
        setTimeout(function(){ closeTool(el); setTimeout(function(){ setX(0, false); if(p){ p.classList.remove('omranSwiping'); } }, 40); }, 190);
      } else {
        setX(0, true);
        setTimeout(function(){ if(p){ p.classList.remove('omranSwipeSettle'); p.classList.remove('omranSwiping'); } }, 220);
      }
    };
    el.addEventListener('touchend', finish, { passive: true });
    el.addEventListener('touchcancel', finish, { passive: true });

    /* سؤال المالك ٤ سبتمبر «في الكمبيوتر ما فيها سحب»: نفس السحب بالفأرة — اضغط واسحب لليمين
       من أي مكان في الأداة فتتبعك وتُغلق. الحقول النصية والمنزلقات مستثناة، والنقرة بعد سحب لا تُحتسب. */
    var m0 = null, mDrag = false;
    var mouseBlocked = function(t){
      var e = t;
      for(var i = 0; e && e !== document.body && i < 12; i++){
        var tag = (e.tagName || '').toLowerCase();
        if(tag === 'input' || tag === 'textarea' || tag === 'select' || e.isContentEditable) return true;
        if(tag === 'video' || tag === 'canvas' || tag === 'iframe') return true;
        e = e.parentElement;
      }
      return blocked(t);
    };
    el.addEventListener('mousedown', function(e){
      if(e.button !== 0 || mouseBlocked(e.target)){ m0 = null; return; }
      if(topTool() !== el){ m0 = null; return; }
      m0 = { x: e.clientX, y: e.clientY, ts: Date.now() };
      mDrag = false; p = panel(el); w = window.innerWidth || 360;
    });
    document.addEventListener('mousemove', function(e){
      if(!m0) return;
      var dx = e.clientX - m0.x, dy = e.clientY - m0.y;
      if(!mDrag){
        if(Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        if(dx <= 0){ m0 = null; return; }
        mDrag = true;
        document.documentElement.classList.add('omranMouseSwipe');
        try{ var sel = window.getSelection(); if(sel && sel.removeAllRanges) sel.removeAllRanges(); }catch(err){ /* guard-ok */ }
      }
      e.preventDefault();
      setX(Math.max(0, dx), false);
    });
    var mouseFinish = function(e){
      if(!m0) return;
      var was = mDrag, dx = was ? (e.clientX - m0.x) : 0, dt = Date.now() - m0.ts;
      m0 = null; mDrag = false;
      document.documentElement.classList.remove('omranMouseSwipe');
      if(!was) return;
      swipeClickGuardUntil = Date.now() + 120;
      if(dx > w * 0.35 || (dt < 300 && dx > 70)){
        setX(w + 40, true);
        setTimeout(function(){ closeTool(el); setTimeout(function(){ setX(0, false); if(p){ p.classList.remove('omranSwiping'); } }, 40); }, 190);
      } else {
        setX(0, true);
        setTimeout(function(){ if(p){ p.classList.remove('omranSwipeSettle'); p.classList.remove('omranSwiping'); } }, 220);
      }
    };
    document.addEventListener('mouseup', mouseFinish);
  }
  /* نقرة تصل بعد سحب بالفأرة مباشرة = ليست نقرة مقصودة */
  var swipeClickGuardUntil = 0;
  document.addEventListener('click', function(e){
    if(Date.now() < swipeClickGuardUntil){ e.stopPropagation(); e.preventDefault(); }
  }, true);
  function ensureBound(){
    Object.keys(MAP).forEach(function(id){
      var el = document.getElementById(id);
      if(!el || el.__omranSwipe) return;
      el.__omranSwipe = true;
      bind(el);
      backWatch(el, ['class', 'style', 'hidden']);
    });
    var sd = document.getElementById('settingsDialog');
    if(sd && !sd.__omranBackWatch) backWatch(sd, ['open']);
  }

  /* شاشة التعليم داخل إطار: السحب فيها يصل رسالةً من الإطار */
  window.addEventListener('message', function(e){
    try{ if(e && e.data && e.data.omranSwipeBack){ var el = document.getElementById('omranEduModal'); if(!visible(el)) el = document.getElementById('eduHubModal'); if(visible(el)) closeTool(el); } }catch(err){ /* guard-ok */ }
  });
  /* العودة من استوديو الإعلانات (صفحة مستقلة) إلى قائمة الأدوات لا المحادثة */
  try{
    if(/[?&]tools=1(&|$)/.test(location.search)){
      var openTools = function(){ var o = document.getElementById('sectionsToolsOverlay'); if(o){ o.classList.add('show'); return true; } return false; };
      if(!openTools()) setTimeout(openTools, 800);
      try{ history.replaceState(null, '', location.pathname + location.hash); }catch(e2){ /* guard-ok */ }
    }
  }catch(e){ /* guard-ok */ }

  /* Esc يغلق أعلى أداة مفتوحة (الكمبيوتر) */
  /* v-back-layers (تدقيق ١٨–١٩ أكتوبر): Esc طبقة واحدة. نافذة dialog مشروطة (ورقة الباقات فوق صانع الفيديو) يغلقها
     Esc الأصليّ — كنّا نغلق الأداة تحتها ثمّ نلغي إغلاقها بـpreventDefault. وما سبق إليه مستمع التقاط (عارض الصور،
     مشغّل الأمثلة، عارض الاقتراحات) لا نمسّه. */
  function modalOpen(){
    try{ return !!document.querySelector('dialog:modal'); }
    catch(err){ return !!document.querySelector('dialog[open]'); /* محرّك بلا :modal */ }
  }
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape' || e.defaultPrevented || modalOpen()) return;
    var t = topTool();
    if(t && closeTool(t)) e.preventDefault();
  });

  /* v-back-layers (تدقيق ١٨–١٩ أكتوبر: «زرّ الرجوع يطلّعك من التطبيق بدل ما يسكّر الأدوات»): فتح الأداة لم يكن يضيف
     مدخلًا في التاريخ (الوحيد «عرض الكل» في app-10)، وغلاف أندرويد يرجع فقط إن canGoBack() — فرجوع المتصفّح وزرّ
     أندرويد كانا يغادران التطبيق. الآن كلّ طبقة (أدوات MAP، والإعدادات/الباقات) تأخذ مدخلًا لحظة فتحها؛ الرجوع يغلق
     أعلاها بمنطق إغلاقها نفسه، وإغلاقها بالسحب أو Esc أو الكود وهي المدخل الحاليّ يسحب مدخلها بـhistory.back() تحت
     علم تجاهل — فلا إغلاق مزدوج ولا تتكدّس المدخلات. لا ✕ ولا زرّ رجوع جديد (v-swipe-back). المدخل يحمل معرّف
     الجلسة: حالة بقيت من قبل إعادة التحميل ليست لنا فلا نسحبها (قد يكون تحتها مستند آخر). */
  var BACK_SID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var backSeq = 0, backStack = [], backIgnore = 0, backIgnoreTimer = 0, backTimer = 0;
  var backMo = (typeof MutationObserver === 'function') ? new MutationObserver(backSchedule) : null;
  function backOurs(st){ return !!(st && st.omranSid === BACK_SID && st.omranSeq); }
  function backState(){ try{ return history.state; }catch(e){ return null; /* بيئة بلا تاريخ */ } }
  function backWatch(el, attrs){
    el.__omranBackWatch = true;
    if(backMo){ try{ backMo.observe(el, { attributes: true, attributeFilter: attrs }); }catch(e){ /* guard-ok */ } }
    backSchedule();
  }
  function backSchedule(){ if(!backTimer) backTimer = setTimeout(function(){ backTimer = 0; backSync(); }, 0); }
  function zOf(el){ return parseInt(getComputedStyle(el).zIndex || '0', 10) || 0; }
  function openLayers(){
    var els = [];
    Object.keys(MAP).forEach(function(id){ var el = document.getElementById(id); if(visible(el)) els.push(el); });
    els.sort(function(a, b){ return (zOf(a) - zOf(b)) || ((a.compareDocumentPosition(b) & 4) ? -1 : 1); });
    var ids = els.map(function(el){ return el.id; });
    var sd = document.getElementById('settingsDialog');
    if(sd && sd.hasAttribute('open')) ids.push('settingsDialog');
    return ids;
  }
  function backPop(){
    backIgnore++;
    clearTimeout(backIgnoreTimer);
    backIgnoreTimer = setTimeout(function(){ backIgnore = 0; backSchedule(); }, 1500);
    try{ history.back(); }catch(e){ backIgnore = 0; /* بلا تاريخ: لا popstate ننتظره */ }
  }
  function backSync(){
    if(backIgnore) return; /* رجوع منّا لم يصل بعد: نكمل عند popstate (دفعٌ قبله يسابقه) */
    var open = openLayers(), st = backState(), cur = backOurs(st) ? st.omranSeq : 0, popCur = false;
    backStack = backStack.filter(function(x){
      if(open.indexOf(x.id) >= 0) return true;
      if(x.seq === cur) popCur = true;
      return false;
    });
    if(popCur){ backPop(); return; }
    open.forEach(function(id){
      if(backStack.some(function(x){ return x.id === id; })) return;
      var below = backState(), seq = ++backSeq;
      try{ history.pushState({ omranTool: id, omranSeq: seq, omranSid: BACK_SID }, '', location.href); }catch(e){ return; /* سقف pushState في سفاري */ }
      backStack.push({ id: id, seq: seq, all: (below && below.omranToolsAll) || 0 });
    });
  }
  function closeLayer(id){
    var el = document.getElementById(id);
    if(id === 'settingsDialog'){
      if(el && el.hasAttribute('open')){ try{ if(typeof closeDialogSafe === 'function') closeDialogSafe(el); else el.close(); }catch(e){ /* guard-ok */ } }
      return;
    }
    if(visible(el)) closeTool(el);
  }
  window.addEventListener('popstate', function(){
    var st = backState(), drop = [];
    if(backIgnore){ backIgnore--; if(!backIgnore) clearTimeout(backIgnoreTimer); }
    else {
      if(backOurs(st)) drop = backStack.filter(function(x){ return x.seq > st.omranSeq; });
      else if(st && st.omranToolsAll){
        /* «عرض الكل» (app-10) مستوى داخل شاشة الأدوات: نغلق ما فُتح فوقه فقط، والمستوى نفسه لـapp-10 */
        for(var i = 0; i < backStack.length; i++){ if(backStack[i].all === st.omranToolsAll){ drop = backStack.slice(i); break; } }
      }
      else drop = backStack.slice();
      backStack = backStack.filter(function(x){ return drop.indexOf(x) < 0; });
      drop.reverse().forEach(function(x){ closeLayer(x.id); });
    }
    /* مدخل أداة أغلقها الكود وهو ليس الحاليّ (تحت أداة أخرى): نتخطّاه فلا تضيع ضغطة رجوع */
    if(backOurs(st) && !backStack.some(function(x){ return x.seq === st.omranSeq; })){ backPop(); return; }
    backSchedule();
  });
  /* الشاشات التي تُنشأ عند فتحها (التلفزيون، القبلة، الاقتراحات) تُلحق بـbody: نربطها ونراقبها لحظتها */
  try{ if(backMo && document.body) new MutationObserver(function(){ ensureBound(); }).observe(document.body, { childList: true }); }catch(e){ /* guard-ok */ }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureBound); else ensureBound();
  setInterval(ensureBound, 900);
  /* الشاشات التي تُنشأ عند فتحها (التلفزيون): نربطها لحظة أول لمسة قبل وصول الحدث إليها */
  document.addEventListener('touchstart', ensureBound, { capture: true, passive: true });
  /* v-maha-win-touch: ids/sheet لمراقبة إغلاق مها — «داخل النافذة» يُقرأ من الخريطة نفسها لا من نسخة */
  window.omranSwipeBack = { close: function(){ var t = topTool(); return t ? closeTool(t) : false; }, top: topTool,
    ids: function(){ return Object.keys(MAP); }, sheet: function(id){ return !!SELF[id]; } };
})();
