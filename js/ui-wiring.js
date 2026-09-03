/* ===== Omran redesign wiring (واجهة فقط — يستخدم الأزرار/الدوال الموجودة) ===== */
(function(){
  'use strict';
  function $(s){ return document.querySelector(s); }
  function tap(sel){ var el = $(sel); if(el){ try{ el.click(); }catch(e){ __swallow(e, "wiring:ui-wiring#1"); } } }

  /* ---------- 1) الأدوات الست ---------- */
  var ICON = {
    math:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"></path><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"></path></svg>',
    sum:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"></rect><line x1="8" y1="8" x2="16" y2="8"></line><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="13" y2="16"></line></svg>',
    write:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>',
    code:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f0a03c" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
    image:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="9.5" r="1.5"></circle><polyline points="21 16 15.5 10.5 5 20"></polyline></svg>',
    edu:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f472b6" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 9L12 4 2 9l10 5 10-5z"></path><path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5"></path></svg>',
    globe:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="3" y1="12" x2="21" y2="12"></line><path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z"></path></svg>',
    trans:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h9"></path><path d="M8 5c0 5-1.6 8-4 10"></path><path d="M5 12c1.8 2.6 4 4 7 5"></path><path d="M13.5 21l4-11 4 11"></path><path d="M15 17.5h5"></path></svg>',
    list:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
    upload:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>'
  };

  function fillPrompt(text){
    var p = $('#prompt');
    if(!p) return;
    p.value = text;
    try{ p.dispatchEvent(new Event('input', { bubbles:true })); }catch(e){ __swallow(e, "wiring:ui-wiring#2"); }
    try{ p.focus(); p.selectionStart = p.selectionEnd = p.value.length; }catch(e){ __swallow(e, "wiring:ui-wiring#3"); }
  }

  var TOOLS = [
    { icon:'math',  k:'tplMathName', kd:'tplMathDesc', name:'حل مسائل رياضية',      desc:'حل ونمذجة خطوات',                      prompt:'ساعدني في حل مسألة رياضية خطوة بخطوة:\n' },
    { icon:'sum',  k:'tplSumName', kd:'tplSumDesc', name:'تلخيص المقالات',       desc:'تلخيص ذكي وسريع',                      prompt:'لخّص لي هذا المقال تلخيصاً ذكياً وسريعاً:\n' },
    { icon:'write',  k:'tplWriteName', kd:'tplWriteDesc', name:'كتابة محتوى احترافي',  desc:'مقالات ونصوص إبداعية',                 prompt:'اكتب لي محتوى احترافياً عن:\n' },
    { icon:'code',  k:'tplCodeName', kd:'tplCodeDesc', name:'مساعدة في البرمجة',    desc:'كود وحلول تقنية',                      prompt:'ساعدني في البرمجة — المطلوب:\n' },
    { icon:'image',  k:'tplImageName', kd:'tplImageDesc', name:'إنشاء الصور',          desc:'صور احترافية بالذكاء الاصطناعي',       prompt:'أنشئ صورة احترافية لـ:\n' },
    { icon:'edu',  k:'tplEduName', kd:'tplEduDesc', name:'شرح مواضيع معقدة',     desc:'تبسيط وفهم أعمق',                      prompt:'اشرح لي هذا الموضوع بتبسيط وفهم أعمق:\n' }
  ];

  var grid = $('#omranToolsGrid');
  if(grid){
    TOOLS.forEach(function(t){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'omToolCard';
      b.setAttribute('data-omtool', t.name);
      b.innerHTML = '<span class="omToolIcon">' + ICON[t.icon] + '</span>' +
                    '<span class="omToolName" data-i18n="' + t.k + '">' + t.name + '</span>' +
                    '<span class="omToolDesc" data-i18n="' + t.kd + '">' + t.desc + '</span>';
      b.addEventListener('click', function(){ fillPrompt(t.prompt); });
      grid.appendChild(b);
    });
  }

  /* ---------- 2) أدوات سريعة ---------- */
  var QUICK = [
    /* v-wiring-sweep: كان ينقر #btnPreviewToggle — زر غير موجود منذ زمن، فالأداة
       كانت ميتة بصمت. #omranBtnWeb هو زر «المتصفح» الحقيقي (app-10 v361). */
    { icon:'globe',  k:'qtWebSearch', name:'بحث في الإنترنت', run:function(){ tap('#omranBtnWeb'); } },
    { icon:'trans',  k:'qtTranslate', name:'ترجمة نص',        run:function(){ fillPrompt('ترجم النص التالي:\n'); } },
    { icon:'list',  k:'qtSummarize', name:'تلخيص نص',        run:function(){ fillPrompt('لخّص النص التالي:\n'); } },
    { icon:'upload',  k:'qtAnalyzeFile', name:'تحليل ملف',       run:function(){ tap('#btnAttach'); } }
  ];
  ['#omranQuickListMobile'].forEach(function(sel){
    var host = $(sel);
    if(!host) return;
    QUICK.forEach(function(q){
      /* v429: جوال — «بحث في الإنترنت/المتصفح» يظل داخل صندوق الكتابة فقط */
      if(sel === '#omranQuickListMobile' && q.icon === 'globe') return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'omQuickRow';
      b.innerHTML = '<span data-i18n="' + q.k + '">' + q.name + '</span><span class="omQIcon">' + ICON[q.icon] + '</span>';
      b.addEventListener('click', q.run);
      host.appendChild(b);
    });
  });

  /* v445: إعادة تطبيق الترجمة على البطاقات والأدوات المرسومة ديناميكيًا */
  try{ if(typeof applyLanguage === 'function') applyLanguage(); }catch(e){ __swallow(e, "misc:index#omhome-i18n"); }

  /* ---------- 3) وضع الترحيب ---------- */
  var messagesEl = $('#messages');
  function syncWelcome(){
    var empty = !messagesEl || messagesEl.children.length === 0;
    document.body.classList.toggle('omranWelcome', empty);
  }
  if(messagesEl && window.MutationObserver){
    new MutationObserver(syncWelcome).observe(messagesEl, { childList:true });
  }
  syncWelcome();
  setTimeout(syncWelcome, 700);
  setTimeout(syncWelcome, 2500);

  /* ---------- 6) عناصر الهيدر ---------- */
  var burger = $('#omranHamburger'); if(burger) burger.addEventListener('click', function(){ tap('#btnToggleProjects'); });

  /* ---------- 7) الشريط الجانبي ---------- */
  var newBtn = $('#omranNewChatBtn'); if(newBtn) newBtn.addEventListener('click', function(){ tap('#btnNew'); });
  var fd = $('#omranFootDelete'); if(fd) fd.addEventListener('click', function(){ tap('#btnDeleteAll'); });
  var fs = $('#omranFootSettings'); if(fs) fs.addEventListener('click', function(){ tap('#btnSettings'); });

  /* ---------- 8) أزرار الصندوق الجديدة ---------- */
  /* v-wiring-sweep: كان يعيد توجيه النقرة إلى #btnPreviewToggle غير الموجود —
     لا-شيء صامت. المعالج الحقيقي لـ#omranBtnWeb في app-10 (المتصفح v361). */
  var bc = $('#omranBtnClip'); if(bc) bc.addEventListener('click', function(){ tap('#btnAttach'); });
  /* v594: بند «الأدوات» داخل + يفتح مربّع الأدوات ويقفل القائمة */
  var btb = $('#btnToolsBox');
  if(btb) btb.addEventListener('click', function(e){
    e.stopPropagation();
    var p = document.getElementById('plusToolsPopup'); if(p) p.classList.remove('show');
    var o = document.getElementById('sectionsToolsOverlay'); if(o) o.classList.add('show');
  });

  /* ---------- 9) chips الاقتراحات ---------- */
  document.querySelectorAll('.omChip').forEach(function(c){
    c.addEventListener('click', function(){ fillPrompt(c.getAttribute('data-omchip') || ''); });
  });

  /* ---------- 10) شريط التنقل السفلي ---------- */
  var NAV = {
    home:     function(){ tap('#btnNew'); },
    chats:    function(){ tap('#btnToggleProjects'); },
    tools:    function(){ var o=document.getElementById('sectionsToolsOverlay'); if(o) o.classList.add('show'); }, /* v433: تبويب الأدوات يفتح المربع الاحترافي المنفصل */
    files:    function(){ tap('#btnToggleHistory'); },
    settings: function(){ tap('#btnSettings'); }
  };
  document.querySelectorAll('.omNavBtn').forEach(function(b){
    b.addEventListener('click', function(){
      b.__omLastClick = Date.now(); /* v-ios-tap-fallback */
      var k = b.getAttribute('data-omnav');
      document.querySelectorAll('.omNavBtn').forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active');
      /* v-nav-top: الشريط صار فوق الأدراج — تبويب غير درجيّ يغلق أي درج مفتوح
         أولًا حتى لا ينفّذ فعله خلف الدُّرج. (chats/files تبديلهما يتكفّل بذلك) */
      if(k !== 'chats' && k !== 'files'){
        try{ if(typeof closeDrawers === 'function') closeDrawers(); }catch(e){ __swallow(e, "wiring:nav-top"); }
      }
      var f = NAV[k]; if(f) f();
    });
    /* v-ios-tap-fallback: بعض حالات سفاري iOS لا تولّد نقرة click بعد اللمس
       (خصوصًا قرب حافة الشاشة السفلية) فتبدو التبويبات ميتة. إن لم تصل click
       خلال 450ms من نهاية اللمس نطلقها نحن — b.click() يشغّل كل المعالجات
       المربوطة (بما فيها معالج «المرشد» الخاص) بلا ازدواج بفضل ختم الوقت. */
    b.addEventListener('touchend', function(){
      setTimeout(function(){
        if(Date.now() - (b.__omLastClick || 0) < 600) return;
        b.__omLastClick = Date.now();
        try{ b.click(); }catch(e){ __swallow(e, "wiring:ios-tap-fallback"); }
      }, 450);
    }, {passive:true});
  });

  /* ---------- 11) إعادة ربط المقابض (الجهة تُحسب تلقائيًا من موضع المقبض) ---------- */
  function rebindResizer(id, panelSel, min, max, key){
    var old = document.getElementById(id);
    var panel = $(panelSel);
    if(!old || !panel) return;
    try{ var sv = parseInt(localStorage.getItem(key), 10); if(sv >= min && sv <= max) panel.style.width = sv + 'px'; }catch(e){ __swallow(e, "wiring:ui-wiring#4"); }
    var el = old.cloneNode(true);
    old.parentNode.replaceChild(el, old);
    var startX = 0, startW = 0, dragging = false, sgn = 1;
    function move(x){
      var w = startW + sgn * (x - startX);
      w = Math.max(min, Math.min(max, w));
      panel.style.width = w + 'px';
    }
    function up(){
      if(!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.body.classList.remove('resizing-active');
      try{ localStorage.setItem(key, parseInt(panel.style.width, 10)); }catch(e){ __swallow(e, "wiring:ui-wiring#5"); }
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup', up);
    }
    function onMM(e){ move(e.clientX); }
    el.addEventListener('mousedown', function(e){
      if(window.innerWidth <= 860) return;
      dragging = true; startX = e.clientX; startW = panel.getBoundingClientRect().width;
      sgn = (el.getBoundingClientRect().left < panel.getBoundingClientRect().left) ? -1 : 1;
      el.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      document.body.classList.add('resizing-active');
      window.addEventListener('mousemove', onMM);
      window.addEventListener('mouseup', up);
    });
  }
  rebindResizer('resizer1', '#sidebar', 180, 420, 'panelWidthSidebar');
  rebindResizer('resizer2', '#workarea', 240, 700, 'panelWidthWork');
})();

// v-boot-watchdog: إشارة اكتمال الإقلاع — وصول التنفيذ هنا يعني الحزمة
// والأسلاك اشتغلت، فيسكت رقيب selfdiag ويُمحى حارس إعادة المحاولة.
window.__omranBootOk = true;
try{ sessionStorage.removeItem('omranBootRetry'); }catch(e){ /* guard-ok: بلا تخزين لا حارس أصلًا */ }

/* v-toolphotos-1: visual-only photo cards for the seven creative tools. */
(function(){
  'use strict';
  if(!document.querySelector('link[data-omran-tool-photos]')){
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/css/tool-card-images.css?v=2';
    css.setAttribute('data-omran-tool-photos', '');
    document.head.appendChild(css);
  }
  if(!document.querySelector('script[data-omran-tool-photos]')){
    var js = document.createElement('script');
    js.src = '/js/tool-card-images.js?v=1';
    js.async = false;
    js.setAttribute('data-omran-tool-photos', '');
    document.head.appendChild(js);
  }
})();

/* Global delete confirmation — WhatsApp-style selection and warning. */
(function(){
  if(document.getElementById('omranDeleteConfirmLoader')) return;
  var s=document.createElement('script');
  s.id='omranDeleteConfirmLoader';
  s.src='/js/delete-confirm.js?v=20260903';
  s.defer=true;
  (document.head||document.documentElement).appendChild(s);
})();
