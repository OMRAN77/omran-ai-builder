// 🩺 Self-diagnosis: the app reports its own JS errors to the server so the
// health monitor can detect and fix them automatically.
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
  // v-boot-watchdog: شكوى عمران ٢٧ أغسطس — آيفون أول ما يفتح «يعلق» ويصلحه
  // الضغط على اسم عمران (وهو إعادة تحميل كاملة). الرقيب يسوي نفس العلاج
  // تلقائيًا: إن لم يكتمل الإقلاع (__omranBootOk من ui-wiring) خلال ٨ ثوانٍ
  // يعيد التحميل مرة واحدة فقط في الجلسة — حارس sessionStorage يمنع الدوران.
  try{
    if(/iPad|iPhone|iPod/.test(navigator.userAgent)){
      var __bootRetried = false;
      try{ __bootRetried = sessionStorage.getItem('omranBootRetry') === '1'; }catch(e){ /* guard-ok: بلا تخزين لا إعادة — أأمن */ __bootRetried = true; }
      if(!__bootRetried){
        setTimeout(function(){
          try{
            // شرطان معًا: الحزمة (آخر شريحة فيها) والأسلاك — فشل أيهما = إقلاع ناقص
            if(window.__omranBootOk === true && window.__omranBundleOk === true) return;
            sessionStorage.setItem('omranBootRetry', '1');
            location.replace(location.pathname + location.search);
          }catch(e){ /* guard-ok: فشل الرقيب لا يزيد العطل */ }
        }, 8000);
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
