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
  function authToken(){ try{ return (window.authGet && window.authGet('aiapp_auth_token')) || ''; }catch(e){ return ''; } }
  /* v-dl-ticket (المراجعة المعاكسة): رمز الجلسة (٣٠ يومًا) لا يدخل أيّ رابط — كان يتسرّب من سجلّات الطلبات وزرّ «فتح»
     والمشاركة. الجلب يرسله في ترويسة Authorization، والرابط الذي يُنقر أو يُفتح خارج التطبيق يحمل تذكرة تنزيل قصيرة
     (ticketLink). ورابط بروكسي من زرّ «تحميل» (صانع الفيديو/الترند) يُفكّ إلى الوسيط نفسه فتُضاف المصادقة هنا. */
  function unwrap(url){
    try{
      var u = new URL(url, location.href);
      if(u.origin === location.origin && u.pathname === '/api/video-download'){ var raw = u.searchParams.get('url') || ''; if(/^https:\/\//.test(raw)) return raw; }
    }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:24'); /* guard-ok — رابط لا يُحلَّل يبقى كما هو */ }
    return url;
  }
  function proxied(url){
    if(/^(data:|blob:|\/)/.test(url)) return url;
    if(sameOrigin(url)) return url;
    return '/api/video-download?url=' + encodeURIComponent(url);
  }
  /* v-video-open-lock: ردّ البروكسي غير الناجح (بلا جلسة، أو السقف اليوميّ) لا يُحفظ ملفًّا — كان يُحفظ نصّ الخطأ باسم صورة */
  async function proxiedBlob(url){
    var p = proxied(url), tk = authToken();
    var r = await fetch(p, (tk && p !== url) ? { headers: { Authorization: 'Bearer ' + tk } } : undefined);
    if(!r.ok) throw new Error('proxy ' + r.status);
    return r.blob();
  }
  /* v-dl-ticket: تذكرة لرابط واحد وساعة واحدة يصدرها الخادم بطلب يحمل الجلسة في الترويسة، وتُحفظ في الذاكرة حتّى قبيل
     انتهائها. تعذّرها (بلا جلسة، السقف اليوميّ) = الرابط الأصليّ نفسه — لا رابط يفتح JSON خطأ. */
  var dlTickets = {};
  async function ticketLink(url){
    var p = proxied(url);
    if(p === url) return url;
    var hit = dlTickets[url];
    if(hit && hit.exp - Date.now() > 5 * 60 * 1000) return hit.link;
    var tk = authToken();
    if(!tk) return url;
    try{
      var r = await fetch(p + '&action=ticket', { headers: { Authorization: 'Bearer ' + tk } });
      var d = r.ok ? await r.json() : null;
      if(d && d.ticket){
        var link = p + '&dt=' + encodeURIComponent(d.ticket);
        dlTickets[url] = { link: link, exp: Date.now() + (Number(d.ttl) || 0) * 1000 };
        return link;
      }
    }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:57'); /* guard-ok — بلا تذكرة يُفتح الرابط الأصليّ */ }
    return url;
  }
  /* v-media-save: حدّ التنزيل اليوميّ — نصّ الحدّ القائم بالـ١٤ لغة */
  function limitNote(){
    try{ var m = (typeof window.t === 'function') ? window.t('portraitLimitReached') : ''; if(m && m !== 'portraitLimitReached' && typeof settingsToast === 'function') settingsToast(m); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:62'); /* guard-ok — التنبيه ترف */ }
  }
  function guessName(url, name){
    if(name) return name;
    var ext = /^data:video/.test(url) ? 'mp4' : (/^data:image\/webp/.test(url) ? 'webp' : (/^data:image\/jpe?g/.test(url) ? 'jpg' : (/\.mp4(\?|$)/i.test(url) ? 'mp4' : 'png')));
    return 'omran-' + Date.now() + '.' + ext;
  }
  function isMobile(){
    try{
      if(typeof omranDesktopApp === 'function' && omranDesktopApp()) return false; /* v-desktop-app: تطبيق ويندوز/ماك حاسوب — تنزيل مباشر لا لوحة النظام */
      if(typeof omranLikelyApp === 'function' && omranLikelyApp()) return true;
      if(/Android|HarmonyOS|HUAWEI|HONOR|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent)) return true;
      if(navigator.maxTouchPoints > 1 && /Mac|Linux/i.test(navigator.platform || '')) return true;
    }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:75'); /* guard-ok */ }
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
    var r = await fetch('/api/media?action=img', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ data: sh.b64, mime: 'image/jpeg', w: sh.w, h: sh.h, token: (typeof authGet === 'function' ? (authGet('aiapp_auth_token') || '') : ''), purpose: 'download' }) }); /* v-share-guard: الرفع برمز الجلسة · v-media-save: تنزيل لا مشاركة */
    if(r.status === 429) limitNote();
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
    url = unwrap(String(url || '')); if(!url) return false;
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
              try{ await navigator.share({ files: [vf], title: 'om ai' }); return true; }catch(err){ if(err && err.name === 'AbortError') return true; }
            }
            if(showSheet(URL.createObjectURL(vb), vf, nm, 'video')) return true;
          } else {
            if(showSheet(await ticketLink(url), null, nm, 'video')) return true; /* v-dl-ticket: تذكرة لا جلسة؛ وتعذّرها = الرابط الأصليّ */
          }
        } else {
          var ib = /^data:/i.test(url) ? dataUrlToBlob(url) : await proxiedBlob(url);
          var ifile = null;
          try{ ifile = new File([ib], nm, { type: ib.type || 'image/png' }); }catch(e){ ifile = null; }
          var link = await uploadImage(ib, nm).catch(function(){ return null; });
          if(link && showSheet(link.dl, ifile, link.name, 'image', link.open)) return true;
          /* تعذّر الرفع: المشاركة بالملف ثم الفتح */
          if(ifile && navigator.canShare && navigator.canShare({ files: [ifile] })){
            try{ await navigator.share({ files: [ifile], title: 'om ai' }); return true; }catch(err){ if(err && err.name === 'AbortError') return true; }
          }
          if(showSheet(URL.createObjectURL(ib), ifile, nm, 'image')) return true;
        }
      }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:147'); /* guard-ok — نكمل بالمسار العام */ }
    }
    /* ── الكمبيوتر والمسار العام ── */
    var blob;
    try{ blob = /^data:/i.test(url) ? dataUrlToBlob(url) : await proxiedBlob(url); }
    catch(e){ blob = null; }
    if(blob){
      try{
        var file = new File([blob], nm, { type: blob.type || 'application/octet-stream' });
        if(isMobile() && navigator.canShare && navigator.canShare({ files: [file] })){
          try{ await navigator.share({ files: [file], title: 'om ai' }); return true; }
          catch(err){ if(err && err.name === 'AbortError') return true; }
        }
      }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:160'); /* guard-ok — نكمل بالرابط */ }
      try{
        var u = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = u; a.download = nm; a.rel = 'noopener'; a.dataset.nativeDownload = '1'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(u); }, 15000);
        return true;
      }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:166'); /* guard-ok */ }
    }
    /* v-dl-ticket: فشل البروكسي (401/429) يفتح الرابط الأصليّ — كان يفتح ردّ JSON خامًّا، وصار الضيف لا يحفظ أيّ صورة خارجيّة */
    try{ window.open(url, '_blank', 'noopener'); return true; }catch(e){ return false; }
  };
  /* ───────── v-video-autosave (طلب المالك ٩ نوفمبر: «اريد خاصيه في الفيديوهات اول مايخلص يتحمل الي الاستوديو») ─────────
     كان autoSaveVideo خطّافًا فارغًا منذ v526 (النقر البرمجيّ يسقط صامتًا في WebView هواوي). الآن الفيديو المكتمل يُحفظ في الجهاز
     بلا ضغطة حيث يسمح النظام، وبضغطة واحدة حيث لا يسمح:
     - غلاف هواوي (WebView): جسره OmranBlobSave (v-hw-blob-save) يكتبه في «التنزيلات» عبر MediaStore، والمعرض يعرضه.
     - غلاف بجسر مشاركة (تطبيق الآيفون، OmranAndroidShare): ورقة النظام تنفتح وحدها، و«حفظ الفيديو» يضعه في الصور.
     - سفاري الآيفون/الآيباد: آبل لا تحفظ في الصور إلّا بلمسة — شريط بزرّ واحد يفتح ورقة النظام بالملفّ الجاهز.
     - كروم أندرويد وTWA والكمبيوتر: <a download> برمجيّ إلى «التنزيلات» (ومعرض الجوّال يعرضها).
     مرّة واحدة لكلّ رابط، والعطل يُبتلع: زرّ «تحميل الفيديو» باقٍ كما كان. */
  var autoSaved = {};
  function autoT(k, ar, en){
    try{ var v = (typeof window.t === 'function') ? window.t(k) : ''; if(v && v !== k) return v; }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:autoT'); /* guard-ok — النصّ الاحتياطيّ أدناه */ }
    var lg = ''; try{ lg = String(document.documentElement.lang || ''); }catch(e){ lg = ''; }
    return /^(ar|ur)/.test(lg) || !lg ? ar : en;
  }
  /* v-video-saved-note (المالك: «اريد فيه تنبيه تم حفظ الفيديو»): التنبيه ٤٫٥ ث لا ٢٫٢، ومن كان خارج التطبيق حين اكتمل الحفظ
     (الفيديو يأخذ دقائق) يراه أوّل ما يرجع — لا يُعرض على صفحة مخفيّة فيضيع */
  function autoNote(msg){
    try{
      var show = function(){ if(typeof settingsToast === 'function') settingsToast(msg, 4500); };
      if(document.hidden){
        var back = function(){ if(document.hidden) return; document.removeEventListener('visibilitychange', back); show(); };
        document.addEventListener('visibilitychange', back);
        return;
      }
      show();
    }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:autoNote'); /* guard-ok — التنبيه ترف */ }
  }
  function vidName(type, name){
    var ext = /webm/i.test(type || '') ? 'webm' : (/quicktime/i.test(type || '') ? 'mov' : 'mp4');
    var nm = String(name || '').trim();
    if(!nm) return 'omran-video-' + Date.now() + '.' + ext;
    return /\.(mp4|webm|mov)$/i.test(nm) ? nm.replace(/\.(mp4|webm|mov)$/i, '.' + ext) : nm + '.' + ext; /* v-vmk-dl-ext: الامتداد من نوع الملفّ */
  }
  function isIOSDevice(){
    try{ var ua = navigator.userAgent || ''; return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1); }
    catch(e){ return false; }
  }
  async function videoBlob(url){
    if(/^data:/i.test(url)) return dataUrlToBlob(url);
    if(/^blob:/i.test(url)){ var r = await fetch(url); if(!r.ok) throw new Error('blob ' + r.status); return r.blob(); }
    return proxiedBlob(url); /* رابط المزوّد: البروكسي بالجلسة في الترويسة (v-dl-ticket)؛ ردّ غير ناجح يرمي ولا يُحفظ نصّ خطأ */
  }
  /* عقد الجسر نفسه الذي يستعمله غلاف هواوي لتنزيلات blob: (BLOB_SAVE_JS): أجزاء ٧٦٨ ك.ب (من مضاعفات ٣ فلا حشو base64 في الوسط) */
  function bridgeSave(B, blob, nm){
    return new Promise(function(resolve, reject){
      var id = B.begin(nm, blob.type || 'video/mp4', blob.size);
      if(id < 0) return reject(new Error('bridge begin'));
      var CH = 786432, off = 0;
      (function next(){
        if(off >= blob.size){ B.end(id); resolve(true); return; }
        var fr = new FileReader();
        fr.onload = function(){ var s = String(fr.result); B.chunk(id, s.slice(s.indexOf(',') + 1)); off += CH; next(); };
        fr.onerror = function(){ B.fail(id); reject(new Error('bridge read')); };
        fr.readAsDataURL(blob.slice(off, off + CH));
      })();
    });
  }
  /* سفاري الآيفون: navigator.share يرفض بلا لمسة — شريط صغير بزرّ واحد، والملفّ جاهز قبل اللمسة فلا انتظار يُسقط إذنها */
  function tapBar(file, url, nm){
    var old = document.getElementById('omranVidSaveBar'); if(old) old.remove();
    var bar = document.createElement('div'); bar.id = 'omranVidSaveBar'; bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:2147482000;width:min(440px,calc(100vw - 24px));box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(24,24,30,.97);color:#eef0f6;border:1px solid rgba(212,175,55,.45);box-shadow:0 10px 30px rgba(0,0,0,.5);font-size:13.5px;line-height:1.6;';
    var txt = document.createElement('span'); txt.style.cssText = 'flex:1;min-width:0;';
    txt.textContent = autoT('vidAutoSaveTap', '📲 ضغطة وحدة ويصير في الاستوديو: اضغط الزرّ ثمّ «حفظ الفيديو»', '📲 One tap to keep it: press the button, then “Save Video”');
    var go = document.createElement('button'); go.type = 'button';
    go.textContent = autoT('vidAutoSaveBtn', '💾 حفظ في الاستوديو', '💾 Save to Photos');
    go.style.cssText = 'flex:none;padding:8px 14px;border-radius:10px;border:0;background:#d4af37;color:#111;font-weight:800;font-family:inherit;font-size:13.5px;cursor:pointer;touch-action:manipulation;';
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕';
    x.setAttribute('aria-label', autoT('closeTitle', 'إغلاق', 'Close'));
    x.style.cssText = 'flex:none;background:none;border:0;color:#9a9a9e;font-size:15px;cursor:pointer;padding:4px 6px;';
    var close = function(){ try{ bar.remove(); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:bar-close'); /* guard-ok */ } };
    go.onclick = function(){
      try{
        navigator.share({ files: [file], title: 'om ai' }).then(function(){ close(); autoNote(autoT('vidAutoSaved', '✅ تم حفظ الفيديو — تلقاه في الاستوديو أو التنزيلات', '✅ Video saved — find it in your gallery or Downloads')); }).catch(function(err){
          if(err && err.name === 'AbortError') return; /* أغلق الورقة بنفسه — الشريط باقٍ لمحاولة ثانية */
          typeof __swallow === 'function' && __swallow(err, 'app-05-save-media:bar-share');
          close(); window.omranSaveMedia(url, nm);
        });
      }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:bar-share2'); close(); window.omranSaveMedia(url, nm); }
    };
    x.onclick = close;
    bar.appendChild(txt); bar.appendChild(go); bar.appendChild(x);
    document.body.appendChild(bar);
    setTimeout(close, 180000);
    return true;
  }
  window.omranAutoSaveVideo = async function(url, name){
    url = unwrap(String(url || ''));
    if(!url || autoSaved[url]) return false;
    autoSaved[url] = 1;
    try{
      var blob = await videoBlob(url);
      if(!blob || !blob.size) throw new Error('empty video');
      var nm = vidName(blob.type, name);
      var hw = window.OmranBlobSave;
      if(hw && typeof hw.begin === 'function'){
        await bridgeSave(hw, blob, nm);
        autoNote(autoT('vidAutoSaved', '✅ تم حفظ الفيديو — تلقاه في الاستوديو أو التنزيلات', '✅ Video saved — find it in your gallery or Downloads'));
        return true;
      }
      if(typeof omranNativeBridge === 'function' && omranNativeBridge('omranShare') && typeof msgDownloadBlob === 'function'){
        msgDownloadBlob(blob, nm); /* ورقة النظام تنفتح وحدها بالملفّ */
        autoNote(autoT('vidAutoSaveHint', '📲 اختر «حفظ الفيديو» عشان ينحفظ في الاستوديو', '📲 Choose “Save Video” to keep it in your Photos'));
        return true;
      }
      if(isIOSDevice()){
        var file = null;
        try{ file = new File([blob], nm, { type: blob.type || 'video/mp4' }); }catch(e){ file = null; }
        if(file && navigator.canShare && navigator.canShare({ files: [file] })) return tapBar(file, url, nm);
        return window.omranSaveMedia(url, nm);
      }
      var u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = nm; a.rel = 'noopener'; a.dataset.nativeDownload = '1'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ try{ URL.revokeObjectURL(u); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:autosave-revoke'); /* guard-ok */ } }, 60000);
      autoNote(autoT('vidAutoSaved', '✅ تم حفظ الفيديو — تلقاه في الاستوديو أو التنزيلات', '✅ Video saved — find it in your gallery or Downloads'));
      return true;
    }catch(e){
      delete autoSaved[url];
      typeof __swallow === 'function' && __swallow(e, 'app-05-save-media:autosave'); /* guard-ok — زرّ «تحميل الفيديو» باقٍ */
      return false;
    }
  };
  window.autoSaveVideo = window.omranAutoSaveVideo; /* الاسم القديم الذي تناديه المحادثة ومخرج التطبيق والترندات وأداة الوكيل */
  /* كل روابط التحميل في التطبيق تمرّ من الحافظ الموحّد — نقرة المستخدم فقط
     (v-pdf-loop: النقرات البرمجية من مصدّر الـPDF ومن هذا الحافظ لا تُلتقط) */
  /* v-audit-shell (cli-ui-shell-2): مصيدة app-05-img-save تُسجَّل قبل هذه على document نفسه وتملك صور data:/blob: داخل الأغلفة —
     stopPropagation فيها لا يوقف مستمعًا آخر على العقدة نفسها، فكانت النقرة الواحدة ترفع الصورة مرّتين (سلّة media-save-img) وتفتح ورقتين.
     نقرة منعها مستمع قبلنا = لها مالك: لا نلمسها. */
  document.addEventListener('click', function(e){
    if(!e.isTrusted || e.defaultPrevented) return;
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if(!a || a.dataset.nativeDownload === '1') return;
    var href = a.getAttribute('href') || '';
    if(!href || href === '#') return;
    e.preventDefault();
    window.omranSaveMedia(href, a.getAttribute('download') || '');
  }, true);
})();
