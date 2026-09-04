/* ───────── v-save-media (شكوى المالك «الفيديو والصور ما يتحمّلون»): حفظ موحّد ─────────
 * روابط <a download> على هواوي/أندرويد داخل التطبيق لا تنزّل شيئًا (data: وblob: محظوران
 * برمجيًا، والنقر البرمجي مرفوض). الحلّ: أي رابط تحميل في التطبيق يمرّ من هنا:
 *  ١) الملف يُحوَّل إلى Blob (محليًا لـdata:، وعبر بروكسي الخادم للروابط الخارجية)،
 *  ٢) ورقة المشاركة بالملف (تحفظ في المعرض على أندرويد/آيفون)،
 *  ٣) وإلا رابط Blob بنقرة، وإلا فتحه في تبويب جديد ليحفظه المستخدم بيده. */
(function(){
  'use strict';
  function dataUrlToBlob(du){
    var s = String(du), i = s.indexOf(','), m = (s.slice(0, i).match(/:([^;,]+)/) || [])[1] || 'application/octet-stream';
    var bin = atob(s.slice(i + 1)), u8 = new Uint8Array(bin.length);
    for(var k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    return new Blob([u8], { type: m });
  }
  function proxied(url){
    if(/^(data:|blob:|\/)/.test(url)) return url;
    try{ if(new URL(url, location.href).origin === location.origin) return url; }catch(e){ /* guard-ok */ }
    return '/api/video-download?url=' + encodeURIComponent(url);
  }
  function guessName(url, name){
    if(name) return name;
    var ext = /^data:video/.test(url) ? 'mp4' : (/^data:image\/webp/.test(url) ? 'webp' : (/^data:image\/jpe?g/.test(url) ? 'jpg' : (/\.mp4(\?|$)/i.test(url) ? 'mp4' : 'png')));
    return 'omran-' + Date.now() + '.' + ext;
  }
  window.omranSaveMedia = async function(url, name){
    url = String(url || ''); if(!url) return false;
    var nm = guessName(url, name);
    var blob;
    try{ blob = /^data:/i.test(url) ? dataUrlToBlob(url) : await (await fetch(proxied(url))).blob(); }
    catch(e){ blob = null; }
    if(blob){
      try{
        var file = new File([blob], nm, { type: blob.type || 'application/octet-stream' });
        if(navigator.canShare && navigator.canShare({ files: [file] })){
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
  /* كل روابط التحميل في التطبيق تمرّ من الحافظ الموحّد */
  document.addEventListener('click', function(e){
    /* v-pdf-loop (شكوى المالك «تحميل الـPDF»): النقرات البرمجية (a.click() من مصدّر
       الـPDF ومن هذا الحافظ نفسه) كانت تُلتقط هنا وتدور بلا تنزيل — نلتقط نقرة المستخدم فقط */
    if(!e.isTrusted) return;
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if(!a || a.dataset.nativeDownload === '1') return;
    var href = a.getAttribute('href') || '';
    if(!href || href === '#') return;
    e.preventDefault();
    window.omranSaveMedia(href, a.getAttribute('download') || '');
  }, true);
})();
