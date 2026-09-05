/* v-img-save-universal (شكوى المالك ٥ سبتمبر: «تحميل الصور ومشاركة واتساب ما تشتغل» في أنماط الصور،
   و«لا تحط أزرار ما تشتغل»): أغلفة المتجر لا تنفّذ <a download> على data:/blob: ولا navigator.share.
   مسار موحّد لكل صور الاستوديوهات:
   ① جسر التطبيق (iOS/أندرويد) → ورقة مشاركة النظام (حفظ في المعرض/واتساب…)
   ② navigator.share بملف (متصفحات الجوال)
   ③ داخل غلاف بلا جسر: رفع الصورة للسيرفر → ورقة بأزرار حقيقية: تحميل عبر رابط HTTPS برأس
      attachment (منزّل النظام)، واتساب (رابط + نسخ)، فتح، ومشاركة إن توفّرت.
   ④ الكمبيوتر/المتصفح العادي: تنزيل <a download> كما كان.
   كل روابط <a download> على data:/blob: في التطبيق تُحوَّل لهذا المسار تلقائيًا. */
(function(){
  function isAr(){ try{ const l = (typeof lang !== 'undefined' && lang) ? lang : (localStorage.getItem('aiapp_lang') || 'ar'); return l === 'ar' || l === 'ur'; }catch(e){ return true; } }
  function gtx(k, ar, en){ try{ if(typeof window.t === 'function'){ const v = window.t(k); if(v && v !== k) return v; } }catch(e){ /* guard-ok */ } return isAr() ? ar : en; }
  function appish(){
    try{
      if(typeof omranNativeBridge === 'function' && omranNativeBridge('omranShare')) return true;
      if(typeof omranLikelyApp === 'function' && omranLikelyApp()) return true;
      const ua = navigator.userAgent || '';
      if(/\bwv\b/.test(ua) || /Version\/\d+\.\d+.*Chrome\//.test(ua) || !!window.OmranAndroidShare) return true;
    }catch(e){ /* guard-ok */ }
    return false;
  }
  function dataUrlToBlob(du){
    const s = String(du), i = s.indexOf(',');
    const m = (s.slice(0, i).match(/:([^;,]+)/) || [])[1] || 'image/png';
    const bin = atob(s.slice(i + 1)), u8 = new Uint8Array(bin.length);
    for(let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    return new Blob([u8], { type: m });
  }
  async function toBlob(src){
    if(src instanceof Blob) return src;
    const s = String(src || '');
    if(s.slice(0, 5) === 'data:') return dataUrlToBlob(s);
    if(!s) return null;
    const r = await fetch(s); return await r.blob();
  }
  function extOf(mime){ return mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : (mime === 'image/gif' ? 'gif' : 'jpg')); }
  /* رفع للسيرفر: مخزن الروابط (Upstash) يرفض القيم الكبيرة (≈1MB) — كانت صورة PNG
     بحجم ١.٥MB تفشل صامتة فيسقط الزر لتنزيل عادي. الآن تُحوَّل دائمًا JPEG بحجم متدرّج
     حتى تنزل تحت ٩٠٠KB base64 (نفس نمط مشاركة صور الدردشة). */
  function shrinkForUpload(blob, maxDim, q){
    return new Promise((resolve) => {
      try{
        const du0 = URL.createObjectURL(blob);
        const im = new Image();
        im.onload = () => {
          try{
            const k = Math.min(1, maxDim / Math.max(im.naturalWidth || 1, im.naturalHeight || 1));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round((im.naturalWidth || 1) * k)); c.height = Math.max(1, Math.round((im.naturalHeight || 1) * k));
            const cx = c.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(im, 0, 0, c.width, c.height);
            URL.revokeObjectURL(du0);
            resolve({ data: c.toDataURL('image/jpeg', q), w: c.width, h: c.height, mime: 'image/jpeg' });
          }catch(e){ resolve(null); }
        };
        im.onerror = () => resolve(null);
        im.src = du0;
      }catch(e){ resolve(null); }
    });
  }
  const UPLOAD_MAX_B64 = 640 * 1024; /* حدّ طلب Upstash ≈1MB مع هامش (PDF يستخدم 700KB) */
  async function uploadImage(blob, name){
    let b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || '')); fr.onerror = rej; fr.readAsDataURL(blob); });
    let mime = blob.type || 'image/png', w, h;
    if(b64.length > UPLOAD_MAX_B64 || mime === 'image/gif'){
      const steps = [[1400, 0.88], [1200, 0.84], [1024, 0.8], [800, 0.75], [640, 0.7]];
      for(let i = 0; i < steps.length; i++){
        const sm = await shrinkForUpload(blob, steps[i][0], steps[i][1]);
        if(!sm) break;
        b64 = sm.data; mime = sm.mime; w = sm.w; h = sm.h;
        if(b64.length <= UPLOAD_MAX_B64) break;
      }
    }
    const i = b64.indexOf(',');
    const r = await fetch('/api/media?action=img', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: b64.slice(i + 1), mime, w, h }) });
    let j = null; try{ j = await r.json(); }catch(e){ j = null; }
    if(!r.ok || !j || !j.id) throw new Error((j && j.error) ? String(j.error) : ('http ' + r.status));
    const ext = extOf(mime);
    const safe = String(name || 'omran-image').replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9_\-]/g, '-').slice(0, 50) || 'omran-image';
    return {
      open: location.origin + '/i/' + j.id + '.' + ext,
      dl: location.origin + '/i/' + j.id + '.raw.' + ext + '?dl=1&name=' + encodeURIComponent(safe + '.' + ext),
    };
  }
  function toast(m){ try{ if(typeof settingsToast === 'function'){ settingsToast(m); return; } }catch(e){ /* guard-ok */ } try{ alert(m); }catch(e){ /* guard-ok */ } }
  function copyText(s){ try{ if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s); }catch(e){ /* guard-ok */ } return Promise.reject(new Error('no-clipboard')); }
  function preparingSheet(){
    try{
      const old = document.getElementById('omranImgSheet'); if(old) old.remove();
      const sheet = document.createElement('div'); sheet.id = 'omranImgSheet';
      sheet.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:rgba(20,20,26,.98);border-top:1px solid rgba(212,175,55,.45);border-radius:18px 18px 0 0;padding:18px 16px calc(22px + env(safe-area-inset-bottom,0px));box-shadow:0 -12px 40px rgba(0,0,0,.5);font-family:inherit;color:#f3efe4;font-weight:800;font-size:15px;text-align:center;';
      sheet.textContent = gtx('imgPreparing', '⏳ جارٍ تجهيز الصورة…', '⏳ Preparing the image…');
      document.body.appendChild(sheet);
    }catch(e){ /* guard-ok */ }
  }
  function localSheet(blob, file, name, why){
    const old = document.getElementById('omranImgSheet'); if(old) old.remove();
    const sheet = document.createElement('div'); sheet.id = 'omranImgSheet';
    sheet.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:rgba(20,20,26,.98);border-top:1px solid rgba(212,175,55,.45);border-radius:18px 18px 0 0;padding:14px 16px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -12px 40px rgba(0,0,0,.5);font-family:inherit;color:#f3efe4;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-weight:800;font-size:15px;';
    const ttl = document.createElement('span'); ttl.textContent = gtx('imgReadyTitle', '✅ الصورة جاهزة', '✅ Image ready');
    const x = document.createElement('button'); x.textContent = '✕'; x.type = 'button';
    x.style.cssText = 'background:none;border:none;color:#9a9a9e;font-size:18px;cursor:pointer;padding:2px 8px;';
    x.onclick = function(){ sheet.remove(); };
    head.appendChild(ttl); head.appendChild(x);
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
    const btnCss = 'display:flex;align-items:center;justify-content:center;gap:6px;min-height:46px;border-radius:12px;font-weight:800;font-size:14px;text-decoration:none;cursor:pointer;touch-action:manipulation;';
    const u = URL.createObjectURL(blob);
    const dl = document.createElement('a');
    dl.href = u; dl.setAttribute('download', name); dl.dataset.nativeDownload = '1'; dl.rel = 'noopener';
    dl.style.cssText = btnCss + 'background:#d4af37;color:#111;';
    dl.textContent = gtx('imgDlBtn', '⬇️ تحميل', '⬇️ Download');
    row.appendChild(dl);
    let canShareFile = false;
    try{ canShareFile = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); }catch(e){ canShareFile = false; }
    if(canShareFile){
      const sh = document.createElement('button'); sh.type = 'button';
      sh.style.cssText = btnCss + 'background:none;color:#d4af37;border:1px solid rgba(212,175,55,.55);';
      sh.textContent = gtx('imgShareBtn', '📤 مشاركة', '📤 Share');
      sh.onclick = function(){ navigator.share({ files: [file], title: 'Omran AI' }).then(function(){ sheet.remove(); }).catch(function(e3){ if(e3 && e3.name === 'AbortError') return; }); };
      row.appendChild(sh);
    } else {
      const op = document.createElement('a');
      op.href = u; op.target = '_blank'; op.rel = 'noopener';
      op.style.cssText = btnCss + 'background:none;color:#f3efe4;border:1px solid rgba(255,255,255,.18);';
      op.textContent = gtx('imgOpenBtn', '🔗 فتح', '🔗 Open');
      row.appendChild(op);
    }
    const sub = document.createElement('div');
    sub.style.cssText = 'margin-top:10px;font-size:11px;color:#9a9a9e;text-align:center;direction:ltr;';
    sub.textContent = 'link unavailable' + (why ? ' · ' + why.slice(0, 60) : '');
    sheet.appendChild(head); sheet.appendChild(row); sheet.appendChild(sub);
    document.body.appendChild(sheet);
    setTimeout(function(){ try{ sheet.remove(); URL.revokeObjectURL(u); }catch(e){ /* guard-ok */ } }, 120000);
    return true;
  }
  function readySheet(links, file, name){
    const old = document.getElementById('omranImgSheet'); if(old) old.remove();
    const sheet = document.createElement('div'); sheet.id = 'omranImgSheet';
    sheet.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:rgba(20,20,26,.98);border-top:1px solid rgba(212,175,55,.45);border-radius:18px 18px 0 0;padding:14px 16px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -12px 40px rgba(0,0,0,.5);font-family:inherit;color:#f3efe4;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-weight:800;font-size:15px;';
    const ttl = document.createElement('span'); ttl.textContent = gtx('imgReadyTitle', '✅ الصورة جاهزة', '✅ Image ready');
    const x = document.createElement('button'); x.textContent = '✕'; x.type = 'button';
    x.style.cssText = 'background:none;border:none;color:#9a9a9e;font-size:18px;cursor:pointer;padding:2px 8px;';
    x.onclick = function(){ sheet.remove(); };
    head.appendChild(ttl); head.appendChild(x);
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
    const btnCss = 'display:flex;align-items:center;justify-content:center;gap:6px;min-height:46px;border-radius:12px;font-weight:800;font-size:14px;text-decoration:none;cursor:pointer;touch-action:manipulation;';
    const dl = document.createElement('a');
    dl.href = links.dl; dl.setAttribute('download', name); dl.dataset.nativeDownload = '1'; dl.rel = 'noopener';
    dl.style.cssText = btnCss + 'background:#d4af37;color:#111;';
    dl.textContent = gtx('imgDlBtn', '⬇️ تحميل', '⬇️ Download');
    dl.onclick = function(){ setTimeout(function(){ ttl.textContent = gtx('imgDlStarted', '📥 بدأ التحميل — افتح الإشعارات/التنزيلات', '📥 Downloading — check notifications/Downloads'); }, 600); };
    row.appendChild(dl);
    const wa = document.createElement('a');
    wa.href = 'https://wa.me/?text=' + encodeURIComponent(links.open); wa.target = '_blank'; wa.rel = 'noopener';
    wa.style.cssText = btnCss + 'background:#25D366;color:#0b1a12;';
    wa.textContent = gtx('imgWaBtn', '💬 واتساب', '💬 WhatsApp');
    wa.onclick = function(){ copyText(links.open).then(function(){ ttl.textContent = gtx('imgLinkCopied', 'نُسخ رابط الصورة — الصقه في واتساب', 'Image link copied — paste it in WhatsApp'); }).catch(function(){ /* guard-ok */ }); };
    row.appendChild(wa);
    let canShareFile = false;
    try{ canShareFile = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); }catch(e){ canShareFile = false; }
    if(canShareFile){
      const sh = document.createElement('button'); sh.type = 'button';
      sh.style.cssText = btnCss + 'background:none;color:#d4af37;border:1px solid rgba(212,175,55,.55);';
      sh.textContent = gtx('imgShareBtn', '📤 مشاركة', '📤 Share');
      sh.onclick = function(){ navigator.share({ files: [file], title: 'Omran AI' }).then(function(){ sheet.remove(); }).catch(function(e3){ if(e3 && e3.name === 'AbortError') return; }); };
      row.appendChild(sh);
    }
    const op = document.createElement('a');
    op.href = links.open; op.target = '_blank'; op.rel = 'noopener';
    op.style.cssText = btnCss + 'background:none;color:#f3efe4;border:1px solid rgba(255,255,255,.18);';
    op.textContent = gtx('imgOpenBtn', '🔗 فتح', '🔗 Open');
    op.onclick = function(ev){ try{ const cap2 = window.Capacitor, br2 = cap2 && cap2.Plugins && cap2.Plugins.Browser; if(br2 && typeof br2.open === 'function'){ ev.preventDefault(); br2.open({ url: links.open }); } }catch(e2){ /* guard-ok */ } };
    row.appendChild(op);
    sheet.appendChild(head); sheet.appendChild(row);
    document.body.appendChild(sheet);
    setTimeout(function(){ try{ sheet.remove(); }catch(e){ /* guard-ok */ } }, 120000);
    return true;
  }
  function plainDownload(blob, name){
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; a.rel = 'noopener'; a.dataset.nativeDownload = '1';
    a.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ try{ a.remove(); URL.revokeObjectURL(u); }catch(e){ /* guard-ok */ } }, 60000);
  }
  /* mode: 'save' (زر تحميل) أو 'share' (زر مشاركة) */
  window.omranSaveImage = async function(src, name, mode){
    name = name || ('omran-image-' + Date.now() + '.png');
    let blob = null;
    try{ blob = await toBlob(src); }catch(e){ blob = null; }
    if(!blob) return false;
    try{
      if(typeof omranNativeBridge === 'function' && omranNativeBridge('omranShare') && typeof msgDownloadBlob === 'function'){ msgDownloadBlob(blob, name); return true; }
    }catch(e){ /* guard-ok */ }
    let file = null;
    try{ if(typeof File === 'function') file = new File([blob], name, { type: blob.type || 'image/png' }); }catch(e){ file = null; }
    /* v-share-native-first (أمر المالك): ورقة النظام أولًا على كل الأجهزة (الكمبيوتر أيضًا) عند المشاركة؛
       وعلى الجوال عند الحفظ كذلك. رفض AbortError خلال أقل من ١.٥ ثانية = فشل اللوحة (ويندوز) لا إلغاء. */
    const mobile = (typeof omranMobileUA === 'function' && omranMobileUA()) || appish();
    if((mobile || mode === 'share') && file && navigator.canShare){
      let ok = false; try{ ok = navigator.canShare({ files: [file] }); }catch(e){ ok = false; }
      if(ok){
        const t0 = Date.now();
        try{ await navigator.share({ files: [file], title: 'Omran AI' }); return true; }
        catch(e){ if(e && e.name === 'AbortError' && (Date.now() - t0) > 1500) return true; }
      }
    }
    if(mode !== 'share' && !appish()){ plainDownload(blob, name); return true; }
    /* الورقة تظهر فورًا بحالة «جارٍ التجهيز» — بلا ضغطة تبدو ميتة أثناء الرفع */
    preparingSheet();
    let upErr = '';
    try{ const links = await uploadImage(blob, name); return readySheet(links, file, name); }
    catch(e){ upErr = (e && e.message) ? String(e.message) : 'upload'; }
    /* تعذّر الرفع: الورقة لا تختفي — تنزيل محلي مباشر + مشاركة إن توفّرت + سبب مختصر */
    try{ return localSheet(blob, file, name, upErr); }catch(e){ /* guard-ok */ }
    plainDownload(blob, name);
    return true;
  };
  /* روابط التنزيل المحلية داخل الأغلفة → المسار الموحّد */
  document.addEventListener('click', function(e){
    try{
      const a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
      if(!a || a.dataset.nativeDownload) return;
      const h = a.getAttribute('href') || '';
      if(!/^(data:|blob:)/i.test(h)) return;
      if(!appish()) return;
      e.preventDefault(); e.stopPropagation();
      window.omranSaveImage(h, a.getAttribute('download') || 'omran-image.png', 'save');
    }catch(err){ /* guard-ok */ }
  }, true);
})();
