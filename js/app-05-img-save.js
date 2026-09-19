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
  function svgIcon(name){
    const icons = {
      download: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
      share: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
      open: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',
      whatsapp: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 9.5c0-1.4-.6-2.7-1.5-3.6-.9-.9-2.2-1.5-3.5-1.5-2.8 0-5 2.2-5 5 0 .9.2 1.7.6 2.5L6 17l4.6-1.5c.8.4 1.6.6 2.5.6 2.8 0 5-2.2 5-5m-5-7C7.6 2.5 4.5 5.6 4.5 9.5c0 1.4.4 2.8 1.1 3.9L3 20l4.8-1.5c1.1.7 2.5 1 4 1 3.9 0 7-3.1 7-7 0-3.8-3.1-7-7-7z"/></svg>',
      close: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
      check: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    };
    return icons[name] || '';
  }
  function verStamp(){
    const d = document.createElement('div'); d.style.cssText = 'margin-top:8px;font-size:10px;opacity:.45;text-align:center;direction:ltr;';
    try{ const sc = document.querySelector('script[src*="app.bundle.js"]'); const vv = sc ? (String(sc.getAttribute('src') || '').split('v=')[1] || '') : ''; d.textContent = 'v ' + vv.slice(0, 8) + (navigator.canShare ? ' · share:yes' : ' · share:no'); }catch(e){ /* guard-ok */ }
    return d;
  }
  function preparingSheet(){
    try{
      const old = document.getElementById('omranImgSheet'); if(old) old.remove();
      const sheet = document.createElement('div'); sheet.id = 'omranImgSheet';
      sheet.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:rgba(20,20,26,.98);border-top:1px solid rgba(212,175,55,.45);border-radius:18px 18px 0 0;padding:18px 16px calc(22px + env(safe-area-inset-bottom,0px));box-shadow:0 -12px 40px rgba(0,0,0,.5);font-family:inherit;color:#f3efe4;font-weight:800;font-size:15px;text-align:center;display:flex;align-items:center;justify-content:center;gap:10px;';
      const spinner = document.createElement('div');
      spinner.style.cssText = 'width:16px;height:16px;border:2px solid rgba(243,239,228,.3);border-top-color:#f3efe4;border-radius:50%;animation:spin .7s linear infinite;';
      sheet.appendChild(spinner);
      const txt = document.createElement('span');
      txt.textContent = gtx('imgPreparing', 'جارٍ تجهيز الصورة…', 'Preparing the image…');
      sheet.appendChild(txt);
      document.body.appendChild(sheet);
    }catch(e){ /* guard-ok */ }
  }
  function localSheet(blob, file, name, why){
    const old = document.getElementById('omranImgSheet'); if(old) old.remove();
    const sheet = document.createElement('div'); sheet.id = 'omranImgSheet';
    sheet.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:rgba(20,20,26,.98);border-top:1px solid rgba(212,175,55,.45);border-radius:18px 18px 0 0;padding:14px 16px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -12px 40px rgba(0,0,0,.5);font-family:inherit;color:#f3efe4;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-weight:800;font-size:15px;';
    const ttl = document.createElement('span'); ttl.textContent = gtx('imgReadyTitle', 'الصورة جاهزة', 'Image ready');
    const xbtn = document.createElement('button'); xbtn.type = 'button'; xbtn.innerHTML = svgIcon('close');
    xbtn.style.cssText = 'background:none;border:none;color:#9a9a9e;cursor:pointer;padding:2px 8px;display:flex;align-items:center;justify-content:center;';
    xbtn.onclick = function(){ sheet.remove(); };
    head.appendChild(ttl); head.appendChild(xbtn);
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
    const btnCss = 'display:flex;align-items:center;justify-content:center;gap:6px;min-height:46px;border-radius:12px;font-weight:800;font-size:14px;text-decoration:none;cursor:pointer;touch-action:manipulation;';
    const u = URL.createObjectURL(blob);
    const dl = document.createElement('a');
    dl.href = u; dl.setAttribute('download', name); dl.dataset.nativeDownload = '1'; dl.rel = 'noopener';
    dl.style.cssText = btnCss + 'background:#d4af37;color:#111;';
    dl.innerHTML = svgIcon('download') + '<span>' + gtx('imgDlBtn', 'تحميل', 'Download') + '</span>';
    row.appendChild(dl);
    let canShareFile = false;
    try{ canShareFile = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); }catch(e){ canShareFile = false; }
    if(canShareFile){
      const sh = document.createElement('button'); sh.type = 'button';
      sh.style.cssText = btnCss + 'background:none;color:#d4af37;border:1px solid rgba(212,175,55,.55);';
      sh.innerHTML = svgIcon('share') + '<span>' + gtx('imgShareBtn', 'مشاركة', 'Share') + '</span>';
      sh.onclick = function(){ navigator.share({ files: [file], title: 'Omran AI' }).then(function(){ sheet.remove(); }).catch(function(e3){ if(e3 && e3.name === 'AbortError') return; }); };
      row.appendChild(sh);
    } else {
      const op = document.createElement('a');
      op.href = u; op.target = '_blank'; op.rel = 'noopener';
      op.style.cssText = btnCss + 'background:none;color:#f3efe4;border:1px solid rgba(255,255,255,.18);';
      op.innerHTML = svgIcon('open') + '<span>' + gtx('imgOpenBtn', 'فتح', 'Open') + '</span>';
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
    const ttl = document.createElement('span'); ttl.textContent = gtx('imgReadyTitle', 'الصورة جاهزة', 'Image ready');
    const xbtn = document.createElement('button'); xbtn.type = 'button'; xbtn.innerHTML = svgIcon('close');
    xbtn.style.cssText = 'background:none;border:none;color:#9a9a9e;cursor:pointer;padding:2px 8px;display:flex;align-items:center;justify-content:center;';
    xbtn.onclick = function(){ sheet.remove(); };
    head.appendChild(ttl); head.appendChild(xbtn);
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
    const btnCss = 'display:flex;align-items:center;justify-content:center;gap:6px;min-height:46px;border-radius:12px;font-weight:800;font-size:14px;text-decoration:none;cursor:pointer;touch-action:manipulation;';
    const dl = document.createElement('a');
    dl.href = links.dl; dl.setAttribute('download', name); dl.dataset.nativeDownload = '1'; dl.rel = 'noopener';
    dl.style.cssText = btnCss + 'background:#d4af37;color:#111;';
    dl.innerHTML = svgIcon('download') + '<span>' + gtx('imgDlBtn', 'تحميل', 'Download') + '</span>';
    dl.onclick = function(){ setTimeout(function(){ ttl.textContent = gtx('imgDlStarted', 'بدأ التحميل — افتح الإشعارات/التنزيلات', 'Downloading — check notifications/Downloads'); }, 600); };
    row.appendChild(dl);
    const wa = document.createElement('a');
    wa.href = 'https://wa.me/?text=' + encodeURIComponent(links.open); wa.target = '_blank'; wa.rel = 'noopener';
    wa.style.cssText = btnCss + 'background:#25D366;color:#0b1a12;';
    wa.innerHTML = svgIcon('whatsapp') + '<span>' + gtx('imgWaBtn', 'واتساب', 'WhatsApp') + '</span>';
    wa.onclick = function(){ copyText(links.open).then(function(){ ttl.textContent = gtx('imgLinkCopied', 'نُسخ رابط الصورة — الصقه في واتساب', 'Image link copied — paste it in WhatsApp'); }).catch(function(){ /* guard-ok */ }); };
    row.appendChild(wa);
    let canShareFile = false;
    try{ canShareFile = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); }catch(e){ canShareFile = false; }
    if(canShareFile){
      const sh = document.createElement('button'); sh.type = 'button';
      sh.style.cssText = btnCss + 'background:none;color:#d4af37;border:1px solid rgba(212,175,55,.55);';
      sh.innerHTML = svgIcon('share') + '<span>' + gtx('imgShareBtn', 'مشاركة', 'Share') + '</span>';
      sh.onclick = function(){ navigator.share({ files: [file], title: 'Omran AI' }).then(function(){ sheet.remove(); }).catch(function(e3){ if(e3 && e3.name === 'AbortError') return; }); };
      row.appendChild(sh);
    }
    const op = document.createElement('a');
    op.href = links.open; op.target = '_blank'; op.rel = 'noopener';
    op.style.cssText = btnCss + 'background:none;color:#f3efe4;border:1px solid rgba(255,255,255,.18);';
    op.innerHTML = svgIcon('open') + '<span>' + gtx('imgOpenBtn', 'فتح', 'Open') + '</span>';
    op.onclick = function(ev){ try{ const cap2 = window.Capacitor, br2 = cap2 && cap2.Plugins && cap2.Plugins.Browser; if(br2 && typeof br2.open === 'function'){ ev.preventDefault(); br2.open({ url: links.open }); } }catch(e2){ /* guard-ok */ } };
    row.appendChild(op);
    sheet.appendChild(head); sheet.appendChild(row); sheet.appendChild(verStamp());
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
    let canNative = false;
    try{ canNative = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); }catch(e){ canNative = false; }
    if(mobile && canNative){
      const t0 = Date.now();
      try{ await navigator.share({ files: [file], title: 'Omran AI' }); return true; }
      catch(e){ if(e && e.name === 'AbortError' && (Date.now() - t0) > 1500) return true; }
    }
    /* v-share-desktop-both: على الكمبيوتر نطلب لوحة النظام (إن وُجدت) ونعرض ورقتنا خلفها في اللحظة
       نفسها؛ اكتمال اللوحة أو إلغاؤها يزيل ورقتنا، وفشلها الصامت يترك ورقتنا حاضرة. */
    if(!mobile && mode === 'share' && canNative){
      const t1 = Date.now();
      try{
        navigator.share({ files: [file], title: 'Omran AI' }).then(() => { const o = document.getElementById('omranImgSheet'); if(o) o.remove(); }, (e) => { if(e && e.name === 'AbortError' && (Date.now() - t1) > 1500){ const o = document.getElementById('omranImgSheet'); if(o) o.remove(); } });
      }catch(e){ /* guard-ok */ }
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
