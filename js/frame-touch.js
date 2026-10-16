/* js/frame-touch.js — v-frame-gold: لمسة الضغط (مع css/إطارات.css) (أمر المالك بعد معاينتها: «ادمج»): الضغط على فراغ القائمة أو المعاينة ينثر حروفًا وأرقامًا
   ذهبيّة (A-Z a-z 0-9) تتبدّل وتخفت، وموجة تتّسع من مكان الضغط، والسحب يرسم أثرًا. للكمبيوتر وحده بلا الخلفيّات والثيمات،
   ولا تعمل على الأزرار والخانات، ولا في «قلّل الحركة» ولا في الرسم البرمجيّ (html.omCpu). الرسم لا يدور إلّا والحروف ظاهرة. */
(function(){
  var قائمة = document.getElementById('sidebar'), عمل = document.getElementById('workarea');
  if(!قائمة && !عمل) return;
  var html = document.documentElement;
  var حروف = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', CW = 11, CH = 16;
  function حرف(){ return حروف.charAt((Math.random() * حروف.length) | 0); }
  function مسموح(){
    try{
      var c = html.classList;
      if(c.contains('mobile-ui') || c.contains('bgimg') || c.contains('skin') || c.contains('skin-wood') || c.contains('omCpu')) return false;
      if((window.innerWidth || 0) < 861) return false;
      if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      return true;
    }catch(e){ /* guard-ok: فحص بيئة فقط */ return false; }
  }
  function لمسة(host){
    if(!host || !host.addEventListener || !document.createElement) return;
    var cv = null, ctx = null, W = 0, H = 0, cols = 0, rows = 0, I = null, C = null, waves = [], down = false, on = false, dpr = 1;
    function جهّز(){
      if(cv) return !!ctx;
      try{
        cv = document.createElement('canvas');
        cv.className = 'omFx';
        cv.setAttribute('aria-hidden', 'true');
        cv.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:-1;border-radius:22px;';
        host.insertBefore(cv, host.firstChild);
        ctx = cv.getContext('2d');
      }catch(e){ /* guard-ok: بلا لوحة رسم فلا أثر */ ctx = null; }
      return !!ctx;
    }
    function قِس(){
      dpr = window.devicePixelRatio || 1;
      W = host.clientWidth; H = host.clientHeight;
      cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(1, Math.ceil(W / CW)); rows = Math.max(1, Math.ceil(H / CH));
      I = new Float32Array(cols * rows); C = []; for(var k = 0; k < cols * rows; k++) C.push('');
    }
    function موضع(e){ var r = host.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function انثر(x, y, R, p){
      var c0 = Math.max(0, ((x - R) / CW) | 0), c1 = Math.min(cols - 1, ((x + R) / CW) | 0);
      var r0 = Math.max(0, ((y - R) / CH) | 0), r1 = Math.min(rows - 1, ((y + R) / CH) | 0);
      for(var r = r0; r <= r1; r++) for(var c = c0; c <= c1; c++){
        var dx = c * CW + CW / 2 - x, dy = r * CH + CH / 2 - y, d = Math.sqrt(dx * dx + dy * dy);
        if(d > R) continue;
        var f = 1 - d / R;
        if(Math.random() > f * p) continue;
        var k = r * cols + c;
        I[k] = Math.min(1, Math.max(I[k], f * (0.6 + Math.random() * 0.5)));
        C[k] = حرف();
      }
      أيقظ();
    }
    function أيقظ(){ if(!on){ on = true; requestAnimationFrame(ارسم); } }
    function ارسم(now){
      ctx.clearRect(0, 0, W, H);
      var حيّ = false, أقصى = Math.sqrt(W * W + H * H), باقية = [];
      for(var w = 0; w < waves.length; w++){
        var مو = waves[w], نق = (now - مو.t) * 0.55;
        if(نق > أقصى) continue;
        باقية.push(مو);
        var a = 0.5 * (1 - نق / أقصى), n = Math.min(220, نق * 0.8);
        for(var i = 0; i < n; i++){
          var th = Math.random() * 6.283, rr = نق + (Math.random() - 0.5) * 26;
          var cc = ((مو.x + Math.cos(th) * rr) / CW) | 0, ro = ((مو.y + Math.sin(th) * rr) / CH) | 0;
          if(cc < 0 || ro < 0 || cc >= cols || ro >= rows) continue;
          var kk = ro * cols + cc;
          I[kk] = Math.max(I[kk], a * (0.5 + Math.random() * 0.5));
          if(!C[kk]) C[kk] = حرف();
        }
      }
      waves = باقية;
      var فاتح = html.getAttribute('data-mode') === 'light';
      ctx.font = "600 11.5px 'Courier New',monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for(var k = 0; k < I.length; k++){
        var v = I[k];
        if(v < 0.02){ I[k] = 0; continue; }
        حيّ = true;
        if(Math.random() < 0.07) C[k] = حرف();
        ctx.fillStyle = فاتح ? (v > 0.82 ? 'rgba(95,62,8,' + v + ')' : 'rgba(160,118,35,' + (v * 0.95) + ')')
                             : (v > 0.82 ? 'rgba(255,236,190,' + v + ')' : 'rgba(222,190,105,' + (v * 0.95) + ')');
        ctx.fillText(C[k], (k % cols) * CW + CW / 2, ((k / cols) | 0) * CH + CH / 2 + 1);
        I[k] = v * 0.962;
      }
      if(حيّ || waves.length) requestAnimationFrame(ارسم);
      else { on = false; ctx.clearRect(0, 0, W, H); }
    }
    host.addEventListener('pointerdown', function(e){
      if(!مسموح()) return;
      var t = e.target;
      if(t && t.closest && t.closest('button,a,input,textarea,select,label,[role=button],[contenteditable],iframe')) return;
      if(!جهّز()) return;
      if(!on || W !== host.clientWidth || H !== host.clientHeight) قِس();
      down = true;
      var p = موضع(e);
      انثر(p[0], p[1], 140, 1.4);
      waves.push({ x:p[0], y:p[1], t:(window.performance && window.performance.now) ? window.performance.now() : Date.now() });
    });
    host.addEventListener('pointermove', function(e){ if(down && on){ var p = موضع(e); انثر(p[0], p[1], 100, 1.1); } });
    مفلتات.push(function(){ down = false; });
  }
  var مفلتات = [];
  function إفلات(){ for(var i = 0; i < مفلتات.length; i++) مفلتات[i](); }
  window.addEventListener('pointerup', إفلات);
  window.addEventListener('pointercancel', إفلات);
  لمسة(قائمة); لمسة(عمل);
})();
