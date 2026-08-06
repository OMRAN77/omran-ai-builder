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
  window.addEventListener('error', function(e){
    report(e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', function(e){
    var r = e.reason;
    report((r && r.message) || String(r), '', 0, 0, r && r.stack);
  });
})();
