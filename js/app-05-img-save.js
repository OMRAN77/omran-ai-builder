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
  async function uploadImage(blob, name, purpose){
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
    const r = await fetch('/api/media?action=img', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: b64.slice(i + 1), mime, w, h, token: (typeof authGet === 'function' ? (authGet('aiapp_auth_token') || '') : ''), purpose: purpose || undefined }) }); /* v-share-guard: الرفع برمز الجلسة · v-media-save: «تحميل» في سلّة التنزيل */
    let j = null; try{ j = await r.json(); }catch(e){ j = null; }
    if(r.status === 429) throw new Error(gtx('portraitLimitReached', 'وصلت للحد اليومي المسموح لهذه الميزة، حاول غدًا', 'You reached the daily limit for this feature, try again tomorrow')); /* v-media-save: نصّ الحدّ القائم */
    if(!r.ok || !j || !j.id) throw new Error((j && j.error) ? String(j.error) : ('http ' + r.status));
    const ext = extOf(mime);
    const safe = String(name || 'omran-image').replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9_\-]/g, '-').slice(0, 50) || 'omran-image';
    return {
      open: location.origin + '/i/' + j.id + '.' + ext,
      dl: location.origin + '/i/' + j.id + '.raw.' + ext + '?dl=1&name=' + encodeURIComponent(safe + '.' + ext),
    };
  }
  function toast(m){ try{ if(typeof settingsToast === 'function'){ settingsToast(m); return; } }catch(e){ /* guard-ok */ } try{ alert(m); }catch(e){ /* guard-ok */ } }
  /* v-ready-sheet: copyText وverStamp حُذفا — المكوّن الموحّد (app-05-ui) صار يبني الأزرار والنسخ بنفسه. */
  function preparingSheet(){
    try{
      const old = document.getElementById('omranImgSheet'); if(old) old.remove();
      const sheet = document.createElement('div'); sheet.id = 'omranImgSheet';
      sheet.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:rgba(20,20,26,.98);border-top:1px solid rgba(212,175,55,.45);border-radius:18px 18px 0 0;padding:18px 16px calc(22px + env(safe-area-inset-bottom,0px));box-shadow:0 -12px 40px rgba(0,0,0,.5);font-family:inherit;color:#f3efe4;font-weight:800;font-size:15px;text-align:center;';
      sheet.textContent = gtx('imgPreparing', '⏳ جارٍ تجهيز الصورة…', '⏳ Preparing the image…');
      document.body.appendChild(sheet);
    }catch(e){ /* guard-ok */ }
  }
  /* v-ready-sheet: الورقة المحلّيّة (تعذّر الرفع) تمرّ للمكوّن الموحّد — تنزيل من blob محلّيّ،
     ونسخ صورة/مشاركة بالملفّ؛ بلا رابط خادم فلا واتساب (يكسر عند المستلم). */
  function localSheet(blob, file, name, why){
    if(why) console.warn('[img-save] link unavailable', String(why).slice(0, 200));
    let u = ''; try{ u = URL.createObjectURL(blob); }catch(e){ u = ''; }
    if(typeof window.omranReadySheet === 'function'){
      return window.omranReadySheet({ kind: 'image', name: name, downloadUrl: u, shareFile: file || null, size: (blob && blob.size) || 0, thumbUrl: u });
    }
    return false;
  }
  /* v-ready-sheet: ورقة «الصورة جاهزة» ← المكوّن الموحّد (app-05-ui). links.dl رابط التنزيل (عمر ساعة في وضع الحفظ)،
     links.open الرابط الدائم (٧ أيّام) ويُمرَّر كـshareUrl في وضع المشاركة وحده — v-save-no-wa: رابط الحفظ يموت بعد
     ساعة فلا يُشارَك على واتساب؛ المشاركة بالرابط الدائم. المشاركة بالملفّ تبقى في الوضعين على الجوّال. */
  function readySheet(links, file, name, mode){
    let thumbUrl = ''; try{ if(file) thumbUrl = URL.createObjectURL(file); }catch(e){ thumbUrl = ''; }
    if(typeof window.omranReadySheet === 'function'){
      return window.omranReadySheet({ kind: 'image', name: name, downloadUrl: links.dl, shareUrl: (mode === 'share') ? links.open : '', shareFile: file || null, size: (file && file.size) || 0, thumbUrl: thumbUrl });
    }
    return false;
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
    let canNative = false;
    try{ canNative = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); }catch(e){ canNative = false; }
    if(mobile && canNative){
      const t0 = Date.now();
      try{ await navigator.share({ files: [file], title: 'om ai' }); return true; }
      catch(e){ if(e && e.name === 'AbortError' && (Date.now() - t0) > 1500) return true; }
    }
    /* v-ready-sheet (أمر المالك): لا لوحة مشاركة نظام على الكمبيوتر — لوحة ويندوز تفشل صامتة فيبدو الزرّ ميتًا.
       بطاقة «الملفّ جاهز» (تحميل + نسخ الصورة + واتساب) هي تجربة الكمبيوتر كاملةً عبر المكوّن الموحّد. */
    if(mode !== 'share' && !appish()){ plainDownload(blob, name); return true; }
    /* الورقة تظهر فورًا بحالة «جارٍ التجهيز» — بلا ضغطة تبدو ميتة أثناء الرفع */
    preparingSheet();
    let upErr = '';
    try{ const links = await uploadImage(blob, name, mode === 'share' ? '' : 'download'); return readySheet(links, file, name, mode); }
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
      /* v-reply-export: الصور فقط — ملفّ Word/TXT/PDF كان يُرفع هنا «صورة» (image/jpeg) فتخرج
         روابط التحميل والواتساب مكسورة. اسم بامتداد غير صوريّ يُترك لمساره. */
      const ext = ((a.getAttribute('download') || '').match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || '';
      if(ext && !/^(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i.test(ext) && !/^data:image\//i.test(h)) return;
      if(!appish()) return;
      e.preventDefault(); e.stopPropagation();
      window.omranSaveImage(h, a.getAttribute('download') || 'omran-image.png', 'save');
    }catch(err){ /* guard-ok */ }
  }, true);
})();
