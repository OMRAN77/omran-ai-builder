// 🩺 Self-diagnosis: the app reports its own JS errors to the server so the
// health monitor can detect and fix them automatically.
/* v-cv-webkit: بوابة content-visibility — سفاري وكل متصفحات iOS (محرك WebKit)
   لا يرسم العناصر المؤجّلة أبدًا فتسوّد المحادثة (حريق ٢٨ أغسطس، ٣ هواتف).
   الصنف cv-ok يوضع فقط على كروميوم/فايرفوكس الحقيقيين؛ بدونه قاعدة
   html.cv-ok .msg في tokens.css لا تنطبق ويرجع الرسم التقليدي الآمن. */
(function(){
  try{
    var ua = navigator.userAgent || '';
    if(/Chrome\/\d+/.test(ua) || /Firefox\/\d+/.test(ua)){
      document.documentElement.classList.add('cv-ok');
    }
  }catch(e){ /* guard-ok: بلا الصنف يبقى الرسم التقليدي — آمن دائمًا */ }
})();
/* v-store-safe: رفض AppGallery (قاعدة 11.4 — عملات أجنبية وكريبتو تتطلب
   حساب شركة وتراخيص). حزمة متجر هواوي تدخل برابط ?store=huawei فتُخفى
   كل الواجهات المالية (شريط الأسهم، سوق الأسهم، المحفظة) — العلامة تُحفظ
   فتبقى بعد أول فتحة، والويب ومتاجر أخرى بلا أي تغيير. */
(function(){
  try{
    var sp = new URLSearchParams(location.search).get('store');
    if(sp) localStorage.setItem('aiapp_store', String(sp).slice(0, 20));
    if((localStorage.getItem('aiapp_store') || '') === 'huawei'){
      document.documentElement.classList.add('store-safe');
    }
  }catch(e){ /* guard-ok: بلا العلامة تبقى النسخة الكاملة */ }
})();
/* v-sat-revert (لقطة Asma ٢٨ أغسطس): افتراض v-sat-measure كان خاطئًا —
   innerHeight أقل من ارتفاع الشاشة بسبب حاشية «القاع» (شريط الهوم)، فصفّرنا
   حاشية «القمة» غلطًا وطلع الشعار تحت الساعة (بلا كيبورد إطلاقًا — حالة
   ساكنة لا تصلها ملاءمة v644/v645 لأنها تعمل فقط والمنفذ منزاح/الكيبورد
   مفتوح). لا يوجد API يميّز إزاحة القمة عن القاع، فالحاشية ترجع env()
   دائمًا (بسقف 62px في CSS) كما كانت طوال عمر التطبيق قبل اليوم. */
(function(){
  try{ document.documentElement.style.setProperty('--omran-sat', 'env(safe-area-inset-top, 0px)'); }
  catch(e){ /* guard-ok: CSS يملك نفس القيمة احتياطيًا في var() */ }
})();
/* v-diag-pill (مؤقت — يطفئ نفسه بعد 2026-09-05): حبة تشخيص صغيرة على آيفون
   فقط تعرض أرقام المنفذ حيّة سبع دقائق من الإقلاع (v643: تكفي لدخول المحادثة) (تُقفل باللمس).
   لقطة شاشة واحدة معها تحسم مصدر الفراغ فوق الهيدر: تمرير؟ حاشية env؟
   أم إزاحة أصلية من الغلاف لا تراها JS أصلًا (كل الأرقام سليمة والفراغ
   ظاهر بالصورة = إزاحة contentInset أصلية، وعلاجها في الغلاف لا الويب). */
(function diagPill(){
  try{
    if(!/iPad|iPhone|iPod/.test(navigator.userAgent || '')) return;
    /* v646: بوابة صريحة — لا تظهر إلا بطلب (…/?diag=1). العيب مُصلح، فلا تُفرض على الزوار. */
    if(!/[?&#]diag=1(?:[&#]|$)/.test(location.search + location.hash)) return;
    if(Date.now() > 1788566400000 /* 2026-09-05 UTC */) return;
    var start = function(){
      try{
        if(document.getElementById('omranDiagPill')) return;
        var d = document.createElement('div');
        d.id = 'omranDiagPill';
        d.style.cssText = 'position:fixed;left:8px;right:8px;bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:2147483645;background:rgba(8,14,28,.88);border:1px solid rgba(212,175,55,.5);color:#ffe9a8;font:10.5px/1.6 -apple-system,Menlo,monospace;padding:7px 10px;border-radius:12px;direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-all;pointer-events:auto;';
        d.addEventListener('click', function(){ try{ d.remove(); clearInterval(t); }catch(e){ /* guard-ok: إغلاق الحبة لا يفشل بصوت */ } });
        var probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;top:0;left:-9999px;padding-top:env(safe-area-inset-top,0px);visibility:hidden;';
        document.body.appendChild(probe);
        var bsrc = ''; try{ bsrc = (document.querySelector('script[src*="app.bundle.js"]') || {}).src || ''; }catch(e){ /* guard-ok: زينة تشخيصية */ }
        var build = (bsrc.match(/v=([0-9a-f]+)/) || [])[1] || '?';
        var mxEnv = 0, mxHd = 0;
        var cssv = function(n){ try{ return ((document.querySelector('link[href*="' + n + '.css"]') || {}).href || '').replace(/^.*v=/, '') || '?'; }catch(e){ return '?'; } };
        var upd = function(){
          try{
            var h = document.querySelector('header');
            var hr = h ? h.getBoundingClientRect() : null;
            var vv = window.visualViewport;
            var sat = '';
            try{ sat = getComputedStyle(document.documentElement).getPropertyValue('--omran-sat').trim(); }catch(e){ /* guard-ok: زينة تشخيصية */ }
            var envNow = Math.round(parseFloat(getComputedStyle(probe).paddingTop) || 0);
            if(envNow > mxEnv) mxEnv = envNow;
            if(hr && Math.round(hr.top) > mxHd) mxHd = Math.round(hr.top);
            var pwa = false;
            try{ pwa = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); }catch(e){ /* guard-ok: زينة تشخيصية */ }
            var bd = '—';
            try{ bd = Math.round(document.body.getBoundingClientRect().top) + (getComputedStyle(document.body).position || '?').charAt(0); }catch(e){ /* guard-ok: زينة تشخيصية */ }
            d.textContent = '🩺 صوّر الشاشة كاملة مع هذا الصندوق\n'
              + 'b:' + build + ' css:' + cssv('tokens') + '/' + cssv('redesign')
              + ' sw:' + ((navigator.serviceWorker && navigator.serviceWorker.controller) ? 1 : 0)
              + ' ' + (pwa ? 'pwa' : 'br')
              + ' ua:' + (/Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent) ? 'saf' : 'wrap') + '\n'
              + 'env:' + envNow + '/' + mxEnv + ' sat:' + (sat || '—')
              + ' ih:' + window.innerHeight + ' sc:' + screen.height
              + ' vv:' + (vv ? Math.round(vv.height) + '/' + Math.round(vv.offsetTop) + '/' + Math.round(vv.pageTop) : '—') + '\n'
              + 'sy:' + Math.round(window.scrollY) + ' de:' + Math.round(document.documentElement.scrollTop)
              + ' bd:' + bd
              + ' hd:' + (hr ? Math.round(hr.top) + '/' + Math.round(hr.height) : '—') + ' mx:' + mxHd
              + ' hp:' + (h ? Math.round(parseFloat(getComputedStyle(h).paddingTop) || 0) : '—');
          }catch(e){ /* guard-ok */ }
        };
        var t = setInterval(upd, 1000);
        upd();
        (document.body || document.documentElement).appendChild(d);
        setTimeout(function(){ try{ d.remove(); probe.remove(); clearInterval(t); }catch(e){ /* guard-ok: تنظيف الحبة ترف */ } }, 420000);
      }catch(e){ /* guard-ok: الحبة ترف تشخيصي */ }
    };
    if(document.body) setTimeout(start, 2500);
    else window.addEventListener('DOMContentLoaded', function(){ setTimeout(start, 2500); });
  }catch(e){ /* guard-ok */ }
})();
(function(){
  var reported = {};
  function report(msg, src, line, col, stack){
    try{
      msg = String(msg || '');
      if(!msg) return;
      var sig = msg + '|' + line;
      if(reported[sig]) return; // once per session per error
      reported[sig] = 1;
      fetch('/api/system?action=client-errors', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          message: msg, source: String(src || ''), line: line || 0, col: col || 0,
          stack: String(stack || '').slice(0, 1500),
          url: location.pathname, ua: navigator.userAgent
        })
      }).catch(function(){}); // guard-ok: مُبلِّغ الأخطاء لا يُبلّغ عن فشل إبلاغه — وإلّا صار الإبلاغ سببًا لإبلاغ جديد (حلقة لا تنتهي)
    }catch(e){ __swallow(e, "misc:index#6"); }
  }
  // v-err-banner: على الجوال يظهر الخطأ الأول شريطًا أحمر مع رقم البنية —
  // لقطة شاشة واحدة من المستخدم تكشف العطل بدل التخمين عن بُعد.
  function showBanner(msg, src, line){
    try{
      if(document.getElementById('omranErrBanner')) return;
      if(!document.documentElement.classList.contains('mobile-ui')) return;
      // ضجيج لا يستحق شريطًا: أخطاء سكربتات خارجية مبهمة (Script error) وأعطال
      // الشبكة والإضافات — نفس فلتر الخادم، فلا إنذارات كاذبة على شاشة المستخدم.
      if(/Script error\.?$|Failed to fetch|NetworkError|Load failed|ResizeObserver|extension/i.test(String(msg || ''))) return;
      var bsrc = ''; try{ bsrc = (document.querySelector('script[src*="app.bundle.js"]') || {}).src || ''; }catch(e){ /* guard-ok: رقم البنية زينة تشخيصية */ }
      var build = (bsrc.match(/v=([0-9a-f]+)/) || [])[1] || '؟';
      var d = document.createElement('div');
      d.id = 'omranErrBanner';
      d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#7f1d1d;color:#fff;font:12px/1.7 -apple-system,Tahoma,sans-serif;padding:calc(8px + env(safe-area-inset-top,0px)) 14px 8px;direction:rtl;text-align:right;word-break:break-word;';
      d.textContent = '⚠️ خطأ تقني (بنية ' + build + '): ' + String(msg || '').slice(0, 150)
        + ' — ' + String(src || '').split('/').pop().split('?')[0].slice(0, 40) + ':' + (line || 0)
        + ' · صوّر هذا الشريط وأرسله، واضغط عليه للإغلاق';
      d.onclick = function(){ try{ d.remove(); }catch(e){ /* guard-ok: إغلاق الشريط لا يفشل بصوت */ } };
      var mount = function(){ try{ (document.body || document.documentElement).appendChild(d); }catch(e){ /* guard-ok: إن تعذّر العرض يبقى الإبلاغ للخادم */ } };
      if(document.body) mount(); else window.addEventListener('DOMContentLoaded', mount);
    }catch(e){ /* الشريط ترف تشخيصي — لا يُسقط المُبلِّغ */ }
  }
  window.addEventListener('error', function(e){
    report(e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
    showBanner(e.message, e.filename, e.lineno);
  });
  window.addEventListener('unhandledrejection', function(e){
    var r = e.reason;
    report((r && r.message) || String(r), '', 0, 0, r && r.stack);
  });

  // v-diag-nav: وضع تشخيص حي للتبويبات — يعمل فقط عند فتح الرابط بـ ?diag=1
  // يعرض: البنية، بيئة التشغيل، ماذا يغطي كل تبويب، وعدّادًا حيًّا للمسات
  // واصلة فعلًا لكل زر. لقطة شاشة واحدة تحسم مكان العطل.
  function diagPanel(){
    try{
      var lines = [];
      var bsrc = ''; try{ bsrc = (document.querySelector('script[src*="app.bundle.js"]') || {}).src || ''; }catch(e){ /* guard-ok: زينة */ }
      lines.push('بنية: ' + ((bsrc.match(/v=([0-9a-f]+)/) || [])[1] || '؟')
        + ' · مثبّت: ' + (navigator.standalone === true ? 'نعم' : 'لا')
        + ' · شاشة: ' + window.innerWidth + 'x' + window.innerHeight
        + (window.visualViewport ? ' · مرئي: ' + Math.round(window.visualViewport.height) + '+' + Math.round(window.visualViewport.offsetTop) : ''));
      var ua = navigator.userAgent || '';
      var m = ua.match(/iPhone OS [\d_]+|Android [\d.]+/);
      lines.push('نظام: ' + (m ? m[0] : ua.slice(0, 50)) + (/(Safari)/.test(ua) && !/(CriOS|FxiOS|EdgiOS)/.test(ua) ? ' سفاري' : ' متصفح آخر/غلاف'));
      var nav = document.getElementById('omranBottomNav');
      if(!nav){ lines.push('⚠️ شريط التبويبات غير موجود في الصفحة!'); }
      else{
        var nr = nav.getBoundingClientRect();
        lines.push('الشريط: قاعه عند ' + Math.round(nr.bottom) + ' / نافذة ' + window.innerHeight + ' · طبقة ' + getComputedStyle(nav).zIndex);
        var tabs = nav.querySelectorAll('.omNavBtn');
        for(var i = 0; i < tabs.length; i++){
          var b = tabs[i], r = b.getBoundingClientRect();
          var el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          var name = el ? (el.id || String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : (el.className || '')).slice(0, 22) || el.tagName) : 'لا شيء';
          var ok = el && (b === el || b.contains(el));
          lines.push((ok ? '✓ ' : '✗ غطاء! ') + b.textContent.trim() + ' ← ' + name);
        }
      }
      var d = document.createElement('div');
      d.id = 'omranDiagPanel';
      d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0b2a4a;color:#fff;font:12px/1.8 -apple-system,Tahoma,sans-serif;padding:calc(8px + env(safe-area-inset-top,0px)) 12px 10px;direction:rtl;text-align:right;white-space:pre-wrap;word-break:break-word;';
      var counts = document.createElement('div');
      counts.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.3);font-weight:bold;';
      counts.textContent = '👇 الحين اضغط كل تبويب تحت مرة وحدة ثم صوّر الشاشة';
      d.textContent = lines.join('\n');
      d.appendChild(counts);
      (document.body || document.documentElement).appendChild(d);
      // عدّاد حي: أي لمسة/نقرة تصل فعلًا لأي تبويب تُطبع هنا فورًا
      var got = {};
      function bump(kind, label){
        got[label] = got[label] || {};
        got[label][kind] = (got[label][kind] || 0) + 1;
        var out = [];
        for(var k in got){ out.push(k + '(' + Object.keys(got[k]).map(function(x){ return x + got[k][x]; }).join(' ') + ')'); }
        counts.textContent = '✋ وصل: ' + out.join(' · ') + ' — صوّر الشاشة الآن';
      }
      document.querySelectorAll('#omranBottomNav .omNavBtn').forEach(function(b){
        var label = b.textContent.trim().slice(0, 10);
        ['touchstart', 'click'].forEach(function(t){
          b.addEventListener(t, function(){ bump(t === 'touchstart' ? 'لمس' : 'نقر', label); }, true);
        });
      });
      // ولو لمس مكان الشريط بلا وصول للزر — نلتقطه من الوثيقة ونبيّن أين ذهب
      document.addEventListener('touchstart', function(e){
        try{
          var t = e.touches[0]; if(!t) return;
          var nav2 = document.getElementById('omranBottomNav'); if(!nav2) return;
          var rr = nav2.getBoundingClientRect();
          if(t.clientY < rr.top) return;
          var el = document.elementFromPoint(t.clientX, t.clientY);
          if(el && el.closest && el.closest('.omNavBtn')) return;
          counts.textContent = '⚠️ لمسة على منطقة الشريط ذهبت إلى: ' + (el ? (el.id || String(el.className).slice(0, 25) || el.tagName) : 'خارج الصفحة') + ' — صوّر الشاشة';
        }catch(err){ /* guard-ok: التشخيص لا يعطّل */ }
      }, true);
    }catch(e){ /* guard-ok: لوحة التشخيص ترف — لا تُسقط الصفحة */ }
  }
  // v-boot-watchdog3: التحديث اليومي كان يترك أول فتحة على الآيفون نصف نسخة
  // قديمة عالقة — وأمر إعادة التحميل من عامل الخدمة (client.navigate) لا يدعمه
  // سفاري iOS أصلًا. القناة البديلة: العامل الجديد يرسل رسالة، وهذا الملف
  // (يُحمَّل مبكرًا حتى في صفحة معطوبة) يعيد التحميل فورًا عند استلامها.
  try{
    if(navigator.serviceWorker){
      var __swReloadedAt = 0;
      navigator.serviceWorker.addEventListener('message', function(ev){
        try{
          if(!ev.data || ev.data.type !== 'omran-reload') return;
          if(Date.now() - __swReloadedAt < 3000) return;
          __swReloadedAt = Date.now();
          sessionStorage.setItem('omranHealed', '1');
          location.reload();
        }catch(e){ /* guard-ok: قناة الإنقاذ لا تكسر شيئًا */ }
      });
    }
  }catch(e){ /* guard-ok: بلا عامل خدمة لا حاجة للقناة */ }
  // توست «تم التحديث تلقائيًا» بعد أي إنقاذ — يشوف عمران أن الرقيب اشتغل.
  try{
    if(sessionStorage.getItem('omranHealed') === '1'){
      sessionStorage.removeItem('omranHealed');
      var __showHeal = function(){
        try{
          var h = document.createElement('div');
          h.style.cssText = 'position:fixed;top:calc(10px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:2147483646;background:rgba(10,20,10,.92);border:1.5px solid #4ade80;color:#d9ffe3;font:13px/1.6 -apple-system,Tahoma,sans-serif;padding:8px 16px;border-radius:999px;direction:rtl;box-shadow:0 8px 26px rgba(0,0,0,.5);';
          h.textContent = '✓ تم تحديث التطبيق تلقائيًا';
          (document.body || document.documentElement).appendChild(h);
          setTimeout(function(){ try{ h.remove(); }catch(e){ /* guard-ok */ } }, 2800);
        }catch(e){ /* guard-ok: التوست زينة */ }
      };
      if(document.body) __showHeal(); else window.addEventListener('DOMContentLoaded', __showHeal);
    }
  }catch(e){ /* guard-ok */ }
  // v-boot-watchdog: شكوى عمران ٢٧ أغسطس — آيفون أول ما يفتح «يعلق» ويصلحه
  // الضغط على اسم عمران (وهو إعادة تحميل كاملة). الرقيب يسوي نفس العلاج
  // تلقائيًا: إن لم يكتمل الإقلاع (__omranBootOk من ui-wiring) خلال ٥ ثوانٍ
  // يعيد التحميل مرة واحدة فقط في الجلسة — حارس sessionStorage يمنع الدوران.
  try{
    if(/iPad|iPhone|iPod/.test(navigator.userAgent)){
      var __bootRetried = false;
      try{ __bootRetried = sessionStorage.getItem('omranBootRetry') === '1'; }catch(e){ /* guard-ok: بلا تخزين لا إعادة — أأمن */ __bootRetried = true; }
      if(!__bootRetried){
        setTimeout(function(){
          try{
            // شرطان معًا: الحزمة (آخر شريحة فيها) والأسلاك — فشل أيهما = إقلاع ناقص
            var bootDone = window.__omranBootOk === true && window.__omranBundleOk === true;
            // المرحلة الثانية (لقطة عمران ٢٧ أغسطس): الإقلاع «مكتمل» لكن الشاشة
            // «بيت أسود» — لا رسائل مرسومة ولا شاشة ترحيب ظاهرة. نحاول إعادة
            // الرسم أولًا (أرخص من الريلود)، وإن بقيت سوداء نعاملها كإقلاع معطوب.
            var blackHome = false;
            if(bootDone){
              try{
                var me = document.getElementById('messages');
                var hero = document.getElementById('omranHero');
                var heroVis = !!(hero && hero.offsetParent !== null);
                var cur = (typeof getCurrent === 'function') ? getCurrent() : null;
                var want = (cur && cur.messages && cur.messages.length) || 0;
                if(me && !me.childNodes.length && !heroVis){
                  try{ if(typeof renderAll === 'function') renderAll(); }catch(e){ /* guard-ok: الرسم قد يفشل بنفس العلة */ }
                  heroVis = !!(hero && hero.offsetParent !== null);
                  blackHome = !me.childNodes.length && !heroVis;
                  report('v-boot-heal: msgs=' + want + ' hero=' + heroVis + ' — إعادة الرسم ' + (blackHome ? 'فشلت، ريلود' : 'نجحت'), 'selfdiag.js', 0, 0, '');
                }
              }catch(e){ /* guard-ok: فحص المحتوى ترف — لا يعطّل */ }
            }
            if(bootDone && !blackHome) return;
            if(!bootDone) report('v-boot-heal: إقلاع ناقص bundle=' + (window.__omranBundleOk === true) + ' wiring=' + (window.__omranBootOk === true) + ' — ريلود', 'selfdiag.js', 0, 0, '');
            sessionStorage.setItem('omranBootRetry', '1');
            sessionStorage.setItem('omranHealed', '1');
            location.replace(location.pathname + location.search);
          }catch(e){ /* guard-ok: فشل الرقيب لا يزيد العطل */ }
        }, 5000);
      }
    }
  }catch(e){ /* guard-ok: الرقيب ترف أمان */ }
  try{
    if(/[?&#]diag=2/.test(location.search + location.hash)){
      if(document.readyState === 'complete') setTimeout(diagPanel, 1500);
      else window.addEventListener('load', function(){ setTimeout(diagPanel, 1500); });
    }
  }catch(e){ /* guard-ok: قراءة الرابط آمنة */ }
})();
