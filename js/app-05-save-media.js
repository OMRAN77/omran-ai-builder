/* ───────── v-save-media (شكوى المالك «الفيديو والصور ما يتحمّلون»): حفظ موحّد ─────────
 * روابط <a download> على هواوي/أندرويد داخل التطبيق لا تنزّل شيئًا (data: وblob: محظوران
 * برمجيًا، والنقر البرمجي مرفوض). v-media-dl (٤ سبتمبر — «كلهم يشتكون»): على أي جوال
 * نسلك طريق الـPDF الذي يعمل في كل غلاف: الصورة تُرفع للخادم وتصير رابط HTTPS برأس
 * attachment، والفيديو يمرّ من بروكسي التنزيل، ثم ورقة ثابتة بأزرار حقيقية بلمسة المستخدم
 * (تحميل / مشاركة / فتح). الكمبيوتر يبقى على التنزيل المباشر. */
(function(){
  'use strict';
  function dataUrlToBlob(du){
    var s = String(du), i = s.indexOf(','), m = (s.slice(0, i).match(/:([^;,]+)/) || [])[1] || 'application/octet-stream';
    var bin = atob(s.slice(i + 1)), u8 = new Uint8Array(bin.length);
    for(var k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    return new Blob([u8], { type: m });
  }
  function sameOrigin(url){ try{ return new URL(url, location.href).origin === location.origin; }catch(e){ return false; } }
  function proxied(url){
    if(/^(data:|blob:|\/)/.test(url)) return url;
    if(sameOrigin(url)) return url;
    return '/api/video-download?url=' + encodeURIComponent(url);
  }
  function guessName(url, name){
    if(name) return name;
    var ext = /^data:video/.test(url) ? 'mp4' : (/^data:image\/webp/.test(url) ? 'webp' : (/^data:image\/jpe?g/.test(url) ? 'jpg' : (/\.mp4(\?|$)/i.test(url) ? 'mp4' : 'png')));
    return 'omran-' + Date.now() + '.' + ext;
  }
  function isMobile(){
    try{
      if(typeof omranLikelyApp === 'function' && omranLikelyApp()) return true;
      if(/Android|HarmonyOS|HUAWEI|HONOR|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent)) return true;
      if(navigator.maxTouchPoints > 1 && /Mac|Linux/i.test(navigator.platform || '')) return true;
    }catch(e){ /* guard-ok */ }
    return false;
  }
  function isVideoUrl(url, name){
    return /^data:video|^blob:.*video|\.mp4(\?|$)|\.webm(\?|$)|video-download|veo-download|video\?action=/i.test(url) || /\.(mp4|webm|mov)$/i.test(name || '');
  }
  /* الصورة تُضغط JPEG ≤1600px قبل الرفع (حدّ جسم الطلب في Vercel) */
  function shrinkToJpeg(blob){
    return new Promise(function(resolve){
      try{
        var img = new Image(); var u = URL.createObjectURL(blob);
        img.onload = function(){
          try{
            var s = Math.min(1, 1600 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
            var c = document.createElement('canvas');
            c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * s)); c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * s));
            var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
            var du = c.toDataURL('image/jpeg', 0.9);
            URL.revokeObjectURL(u);
            resolve({ b64: du.split(',')[1] || '', w: c.width, h: c.height });
          }catch(e){ resolve(null); }
        };
        img.onerror = function(){ URL.revokeObjectURL(u); resolve(null); };
        img.src = u;
      }catch(e){ resolve(null); }
    });
  }
  async function uploadImage(blob, name){
    var sh = await shrinkToJpeg(blob);
    if(!sh || !sh.b64) return null;
    var r = await fetch('/api/media?action=img', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ data: sh.b64, mime: 'image/jpeg', w: sh.w, h: sh.h }) });
    var d = r.ok ? await r.json() : null;
    if(!d || !d.id) return null;
    var nm = String(name || '').replace(/\.(png|webp)$/i, '.jpg') || ('omran-' + d.id + '.jpg');
    return { dl: '/i/' + d.id + '.jpg?dl=1&name=' + encodeURIComponent(nm), open: '/i/' + d.id + '.jpg', name: nm };
  }
  function showSheet(link, file, name, kind, openUrl){
    if(typeof omranPdfReadySheet === 'function') return omranPdfReadySheet(link, file, name, kind, openUrl);
    return false;
  }
  window.omranSaveMedia = async function(url, name){
    url = String(url || ''); if(!url) return false;
    var nm = guessName(url, name);
    var video = isVideoUrl(url, nm);
    /* ── الجوال/الأغلفة: رابط خادم حقيقي + ورقة أزرار ── */
    if(isMobile()){
      try{
        if(video){
          if(/^(data:|blob:)/i.test(url)){
            /* فيديو محلي (دمج مشاهد): المشاركة بالملف هي الطريق الوحيد داخل الأغلفة */
            var vb = /^data:/i.test(url) ? dataUrlToBlob(url) : await (await fetch(url)).blob();
            var vf = new File([vb], nm, { type: vb.type || 'video/mp4' });
            if(navigator.canShare && navigator.canShare({ files: [vf] })){
              try{ await navigator.share({ files: [vf], title: 'Omran AI' }); return true; }catch(err){ if(err && err.name === 'AbortError') return true; }
            }
            if(showSheet(URL.createObjectURL(vb), vf, nm, 'video')) return true;
          } else {
            if(showSheet(proxied(url), null, nm, 'video')) return true;
          }
        } else {
          var ib = /^data:/i.test(url) ? dataUrlToBlob(url) : await (await fetch(proxied(url))).blob();
          var ifile = null;
          try{ ifile = new File([ib], nm, { type: ib.type || 'image/png' }); }catch(e){ ifile = null; }
          var link = await uploadImage(ib, nm).catch(function(){ return null; });
          if(link && showSheet(link.dl, ifile, link.name, 'image', link.open)) return true;
          /* تعذّر الرفع: المشاركة بالملف ثم الفتح */
          if(ifile && navigator.canShare && navigator.canShare({ files: [ifile] })){
            try{ await navigator.share({ files: [ifile], title: 'Omran AI' }); return true; }catch(err){ if(err && err.name === 'AbortError') return true; }
          }
          if(showSheet(URL.createObjectURL(ib), ifile, nm, 'image')) return true;
        }
      }catch(e){ /* guard-ok — نكمل بالمسار العام */ }
    }
    /* ── الكمبيوتر والمسار العام ── */
    var blob;
    try{ blob = /^data:/i.test(url) ? dataUrlToBlob(url) : await (await fetch(proxied(url))).blob(); }
    catch(e){ blob = null; }
    if(blob){
      try{
        var file = new File([blob], nm, { type: blob.type || 'application/octet-stream' });
        if(isMobile() && navigator.canShare && navigator.canShare({ files: [file] })){
          try{ await navigator.share({ files: [file], title: 'Omran AI' }); return true; }
          catch(err){ if(err && err.name === 'AbortError') return true; }
        }
      }catch(e){ /* guard-ok — نكمل بالرابط */ }
      try{
        var u = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = u; a.download = nm; a.rel = 'noopener'; a.dataset.nativeDownload = '1'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(u); }, 15000);
        return true;
      }catch(e){ /* guard-ok */ }
    }
    try{ window.open(proxied(url), '_blank', 'noopener'); return true; }catch(e){ return false; }
  };
  /* كل روابط التحميل في التطبيق تمرّ من الحافظ الموحّد — نقرة المستخدم فقط
     (v-pdf-loop: النقرات البرمجية من مصدّر الـPDF ومن هذا الحافظ لا تُلتقط) */
  document.addEventListener('click', function(e){
    if(!e.isTrusted) return;
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if(!a || a.dataset.nativeDownload === '1') return;
    var href = a.getAttribute('href') || '';
    if(!href || href === '#') return;
    e.preventDefault();
    window.omranSaveMedia(href, a.getAttribute('download') || '');
  }, true);
})();
