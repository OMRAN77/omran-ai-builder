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
})();
