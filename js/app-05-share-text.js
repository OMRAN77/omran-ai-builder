/* v-share-reply (المالك ٤ سبتمبر: «شعار المشاركة غير موجود في آخر شي»): مشاركة نصّ الردّ.
   ١) ورقة النظام (navigator.share بالنصّ) حيث تتوفّر.
   ٢) وإلا ورقة صغيرة: واتساب، تيليجرام، X، البريد، نسخ — روابط نصّية تفتح التطبيق مباشرة،
      تعمل داخل أغلفة المتجر بلا Web Share (المتصفح/الغلاف يحوّل الرابط للتطبيق). */
(function(){
  'use strict';
  function tt(k, ar, en){ try{ var v = (typeof window.t === 'function') ? window.t(k) : k; if(v && v !== k) return v; }catch(e){ /* guard-ok */ } return ((document.documentElement.lang || 'ar') === 'ar') ? ar : en; }
  function copyText(txt){
    try{ if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt); return true; } }catch(e){ /* guard-ok */ }
    try{ var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; }catch(e){ /* guard-ok */ }
    return false;
  }
  function toast(msg){ try{ if(typeof settingsToast === 'function'){ settingsToast(msg); return; } }catch(e){ /* guard-ok */ } try{ alert(msg); }catch(e){ /* guard-ok */ } }
  function openExternal(url){
    try{ var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(a); a.click(); setTimeout(function(){ try{ a.remove(); }catch(e){ /* guard-ok */ } }, 1000); return true; }catch(e){ /* guard-ok */ }
    try{ window.open(url, '_blank'); return true; }catch(e){ /* guard-ok */ }
    return false;
  }
  function css(){
    if(document.getElementById('oShTxtCss')) return;
    var st = document.createElement('style'); st.id = 'oShTxtCss';
    st.textContent = '.oStOv{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.58);display:flex;align-items:flex-end;justify-content:center}'
      + '.oStSh{width:100%;max-width:520px;background:#15171b;color:#f1f2f4;border:1px solid rgba(212,175,55,.25);border-bottom:0;border-radius:20px 20px 0 0;padding:16px 16px calc(20px + env(safe-area-inset-bottom,0px));box-shadow:0 -20px 60px rgba(0,0,0,.55)}'
      + '.oStHd{display:flex;align-items:center;justify-content:space-between;font-size:16px;font-weight:700;margin:0 2px 12px}'
      + '.oStX{background:0;border:0;color:inherit;opacity:.7;font-size:15px;cursor:pointer;padding:4px 6px;font-family:inherit}'
      + '.oStGr{display:grid;grid-template-columns:repeat(4,1fr);gap:14px 4px;margin-bottom:6px}'
      + '.oStT{display:flex;flex-direction:column;align-items:center;gap:7px;background:0;border:0;padding:0;color:inherit;font-family:inherit;font-size:11.5px;cursor:pointer}'
      + '.oStT i{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:999px;font-style:normal;font-size:22px;font-weight:800;color:#fff}'
      + '.oStT:active i{transform:scale(.92)}'
      + 'html[data-mode="light"] .oStSh{background:#fff;color:#14161a}';
    document.head.appendChild(st);
  }
  function sheet(text){
    css();
    var ov = document.createElement('div'); ov.className = 'oStOv';
    var sh = document.createElement('div'); sh.className = 'oStSh'; ov.appendChild(sh);
    var close = function(){ try{ ov.remove(); }catch(e){ /* guard-ok */ } };
    ov.onclick = function(e){ if(e.target === ov) close(); };
    var hd = document.createElement('div'); hd.className = 'oStHd';
    hd.innerHTML = '<span>' + tt('msgShareReply', 'مشاركة الردّ', 'Share reply') + '</span>';
    var xb = document.createElement('button'); xb.type = 'button'; xb.className = 'oStX'; xb.textContent = tt('closeBtn', 'إغلاق', 'Close'); xb.onclick = close; hd.appendChild(xb);
    sh.appendChild(hd);
    var gr = document.createElement('div'); gr.className = 'oStGr'; sh.appendChild(gr);
    var enc = encodeURIComponent(text);
    var APPS = [
      { n: 'WhatsApp', g: '✆', c: '#25D366', u: 'https://wa.me/?text=' + enc },
      { n: 'Telegram', g: '➤', c: '#229ED9', u: 'https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + enc },
      { n: 'X', g: 'X', c: '#000', u: 'https://twitter.com/intent/tweet?text=' + enc },
      { n: tt('emailWord', 'البريد', 'Email'), g: '✉', c: '#EA4335', u: 'mailto:?body=' + enc },
      { n: tt('copyMsgTitle', 'نسخ الردّ', 'Copy reply'), g: '⧉', c: '#d4af37', copy: true },
    ];
    APPS.forEach(function(a){
      var b = document.createElement('button'); b.type = 'button'; b.className = 'oStT';
      b.innerHTML = '<i style="background:' + a.c + '">' + a.g + '</i><span>' + a.n + '</span>';
      b.onclick = function(){ if(a.copy){ if(copyText(text)) toast(tt('msgShareCopied', 'نُسخ الردّ — الصقه في التطبيق الذي تريده', 'Reply copied — paste it in the app you want')); close(); return; } openExternal(a.u); close(); };
      gr.appendChild(b);
    });
    /* طابع الإصدار (رمادي صغير) — للتشخيص من لقطة الشاشة */
    try{
      var sc = document.querySelector('script[src*="app.bundle.js"]');
      var vv = sc ? (String(sc.getAttribute('src') || '').split('v=')[1] || '') : '';
      var vd = document.createElement('div'); vd.style.cssText = 'margin-top:8px;font-size:10px;opacity:.45;text-align:center;direction:ltr;';
      vd.textContent = 'v ' + vv.slice(0, 8) + (typeof navigator.share === 'function' ? ' · share:yes' : ' · share:no');
      sh.appendChild(vd);
    }catch(e){ /* guard-ok */ }
    document.body.appendChild(ov);
    return ov;
  }
  /* v-share-native (المالك: «هذي صور مش من الهاتف نفسه»): داخل غلاف المتجر لا توجد navigator.share،
     والجسر الأصلي يشارك ملفًا فقط — نرسم الردّ بطاقةً صورة بخط الصفحة ونرسلها عبر الجسر، فتفتح
     ورقة مشاركة الهاتف الحقيقية بتطبيقاته. */
  function textCard(text){
    var W = 1080, pad = 72, fs = 40, lh = Math.round(fs * 1.75);
    var rtl = /[\u0600-\u06FF]/.test(text);
    var fam = '';
    try{ fam = getComputedStyle(document.body).fontFamily || ''; }catch(e){ /* guard-ok */ }
    var font = fs + 'px ' + (fam || 'system-ui, sans-serif');
    var c = document.createElement('canvas'); c.width = W; c.height = 400;
    var x = c.getContext('2d'); x.font = font;
    var maxW = W - pad * 2, lines = [];
    String(text).split(/\r?\n/).forEach(function(par){
      var words = par.split(/\s+/).filter(Boolean), cur = '';
      if(!words.length){ lines.push(''); return; }
      words.forEach(function(w){
        var t = cur ? cur + ' ' + w : w;
        if(x.measureText(t).width <= maxW) cur = t; else { if(cur) lines.push(cur); cur = w; }
      });
      lines.push(cur);
    });
    if(lines.length > 70){ lines = lines.slice(0, 70); lines.push('…'); }
    var head = 150, foot = 90;
    c.height = head + lines.length * lh + foot + pad;
    x = c.getContext('2d');
    x.fillStyle = '#0b0b0d'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#d4af37'; x.font = 'bold 44px ' + (fam || 'system-ui, sans-serif');
    x.textBaseline = 'alphabetic';
    x.direction = rtl ? 'rtl' : 'ltr'; x.textAlign = rtl ? 'right' : 'left';
    var ax = rtl ? W - pad : pad;
    x.fillText('عمران AI', ax, 92);
    x.fillStyle = 'rgba(212,175,55,.45)'; x.fillRect(pad, 118, W - pad * 2, 2);
    x.fillStyle = '#f3efe4'; x.font = font;
    lines.forEach(function(l, i){ x.fillText(l, ax, head + (i + 1) * lh - Math.round(lh * 0.3)); });
    x.fillStyle = '#8f8a7c'; x.font = '26px ' + (fam || 'system-ui, sans-serif');
    x.fillText('omran-ai-builder.vercel.app', ax, c.height - 44);
    return c;
  }
  function cardBlob(text, cb){
    try{ var c = textCard(text); c.toBlob(function(b){ cb(b || null); }, 'image/png'); }catch(e){ cb(null); }
  }
  function bridgeShare(text){
    try{
      if(typeof omranNativeBridge !== 'function' || !omranNativeBridge('omranShare') || typeof msgDownloadBlob !== 'function') return false;
      cardBlob(text, function(b){ if(b) msgDownloadBlob(b, 'omran-reply-' + Date.now() + '.png'); else sheet(text); });
      return true;
    }catch(e){ return false; }
  }
  window.omranShareTextCard = textCard;
  window.omranShareText = function(text){
    text = String(text || '').trim();
    if(!text) return false;
    if(bridgeShare(text)) return true;
    /* v-share-native-first (أمر المالك ٥ سبتمبر: «في شي يسمونه رسمي مش رسمة من عندك»): ورقة النظام أولًا.
       v-share-desktop-both (المالك: «نفس المشكلة» على ويندوز): لوحة ويندوز أحيانًا لا تفتح ولا ترفض ولا
       يمكن كشفها بيقين. على الكمبيوتر: نطلب لوحة النظام ونعرض ورقتنا خلفها في اللحظة نفسها — إن فتحت
       اللوحة فهي فوق ورقتنا وتُزال ورقتنا عند اكتمالها أو إلغائها؛ وإن لم تفتح فورقتنا حاضرة. على الجوال:
       لوحة النظام وحدها، وورقتنا فقط عند رفضها. */
    var mobile = false;
    try{ mobile = (typeof omranMobileUA === 'function') ? omranMobileUA() : /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''); }catch(e){ mobile = false; }
    if(typeof navigator.share === 'function'){
      if(mobile){
        try{
          var t0 = Date.now();
          var pr = navigator.share({ text: text });
          if(pr && pr.catch) pr.catch(function(err){
            if(err && err.name === 'AbortError' && (Date.now() - t0) > 1500) return;
            sheet(text);
          });
          return true;
        }catch(e){ /* guard-ok */ }
      } else {
        var ov = null;
        try{ ov = sheet(text); }catch(e){ ov = null; }
        try{
          var t1 = Date.now();
          var pr2 = navigator.share({ text: text });
          if(pr2 && pr2.then) pr2.then(function(){ try{ if(ov) ov.remove(); }catch(e){ /* guard-ok */ } }, function(err){
            /* إلغاء حقيقي من المستخدم (بعد وقت) → لا نُبقي شيئًا؛ فشل فوري → ورقتنا تبقى */
            if(err && err.name === 'AbortError' && (Date.now() - t1) > 1500){ try{ if(ov) ov.remove(); }catch(e){ /* guard-ok */ } }
          });
        }catch(e){ /* guard-ok — ورقتنا حاضرة */ }
        return true;
      }
    }
    sheet(text);
    return true;
  };
})();
