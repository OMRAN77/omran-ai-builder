/* app-21-screen-guide.js — المرشد البصريّ (طبقة المتصفّح)
 *
 * المسؤوليات:
 *  ١) أمان: قصّ شريط الحالة + تصغير الصورة قبل الرفع (الصورة لا تُخزَّن)
 *  ٢) واجهة: إدارة الجلسة، عرض الخطوات، رسم الإطار على Canvas
 *  ٣) مشاركة: استقبال لقطة الشاشة من زر "مشاركة" في الهاتف مباشرةً
 *  ٤) كشف التوقف: نفس الشاشة مرتين → مسار بديل تلقائياً
 *
 * لا إيموجي — SVG خطيّ فقط.
 * يُصدَّر على window.__screenGuide لربطه من app-09-attach.js وقائمة الأدوات.
 */
(function () {
  'use strict';

  var ENDPOINT     = '/api/ai?action=screen-guide';
  var MAX_EDGE     = 1280;
  var STATUS_RATIO = 0.046;   // نسبة شريط الحالة المقصوص من الأعلى
  var JPEG_Q       = 0.84;
  var SESS_KEY     = 'sg_session_' + Math.random().toString(36).slice(2, 9);

  // ---------- معالجة الصورة ----------

  function imgFromFile(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode_failed')); };
      img.src = url;
    });
  }

  function prepareShot(file, opts) {
    var crop = (opts && opts.cropStatusBar) !== false;
    return imgFromFile(file).then(function (img) {
      var sy   = crop ? Math.round(img.naturalHeight * STATUS_RATIO) : 0;
      var sh   = img.naturalHeight - sy;
      var scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, sh));
      var w    = Math.max(1, Math.round(img.naturalWidth * scale));
      var h    = Math.max(1, Math.round(sh * scale));
      var cv   = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, w, h);
      var dataUrl = cv.toDataURL('image/jpeg', JPEG_Q);
      return { b64: dataUrl.slice(dataUrl.indexOf(',') + 1), mime: 'image/jpeg', w: w, h: h, dataUrl: dataUrl, cv: cv };
    });
  }

  // ---------- رسم الإطار ----------

  function drawHighlight(shot, box) {
    if (!shot || !box) return shot ? shot.dataUrl : null;
    var accent = (typeof getComputedStyle !== 'undefined'
      ? (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#e3b341').trim()
      : '#e3b341');
    var cv = document.createElement('canvas');
    cv.width = shot.w; cv.height = shot.h;
    var ctx = cv.getContext('2d');
    // مصدر مضمون الفكّ: كانفاس التحضير أو Image محمَّلة مسبقًا — Image جديدة من
    // dataUrl قد لا تكون مفكوكة لحظة الرسم فتخرج الخلفية سوداء.
    var src = shot.cv || (shot.img && shot.img.complete && shot.img.naturalWidth ? shot.img : null);
    if (!src) {
      var im = new Image(); im.src = shot.dataUrl;
      if (!(im.complete && im.naturalWidth)) return shot.dataUrl;
      src = im;
    }
    ctx.drawImage(src, 0, 0, cv.width, cv.height);

    var x = box.x * cv.width,  y = box.y * cv.height;
    var w = box.w * cv.width,  h = box.h * cv.height;
    var pad = Math.max(4, Math.round(cv.width * 0.009));
    x -= pad; y -= pad; w += pad * 2; h += pad * 2;

    // تعتيم الخلفية ما عدا الهدف
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.rect(0, 0, cv.width, cv.height);
    ctx.rect(x + w, y, -w, h);
    ctx.fill('evenodd');

    // إطار ذهبي
    var r = Math.max(6, Math.round(Math.min(w, h) * 0.16));
    ctx.strokeStyle = accent;
    ctx.lineWidth   = Math.max(2.5, Math.round(cv.width * 0.005));
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else { ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath(); }
    ctx.stroke();

    // رأس سهم صغير
    var cx = x + w / 2, top = y - Math.max(18, Math.round(cv.height * 0.032));
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(cx, y - 3); ctx.lineTo(cx - 8, top); ctx.lineTo(cx + 8, top);
    ctx.closePath(); ctx.fill();

    return cv.toDataURL('image/jpeg', 0.88);
  }

  // ---------- حالة الجلسة ----------

  var _session = {
    id: SESS_KEY,
    history: [],
    lastHash: null,
    active: false,
  };

  function resetSession() {
    _session.id = 'sg_' + Date.now().toString(36);
    _session.history = [];
    _session.lastHash = null;
    _session.active = false;
  }

  // ---------- الاستدعاء الرئيسي ----------

  function guide(file, goalText, opts) {
    var lang      = (opts && opts.lang) || (typeof t === 'function' ? (document.documentElement.lang || 'ar') : 'ar');
    var appId     = (opts && opts.appId) || null;
    var onStep    = (opts && opts.onStep)    || null;
    var onError   = (opts && opts.onError)   || null;
    var onLoading = (opts && opts.onLoading) || null;
    var token     = (typeof authGet === 'function' ? authGet('aiapp_token') : null) || null;
    var guestId   = (typeof authGet === 'function' ? authGet('aiapp_guest') : null) || null;

    if (onLoading) onLoading(true);

    return prepareShot(file).then(function (shot) {
      // اللقطة المحفوظة للرسم لاحقًا — بدونها لا يُرسم الإطار على الردّ.
      window.__sgLastShot = shot;
      var payload = {
        goal:      goalText,
        imageB64:  shot.b64,
        mime:      shot.mime,
        lang:      lang,
        token:     token,
        guestId:   guestId,
        sessionId: _session.id,
        appId:     appId,
        history:   _session.history.slice(-6),
      };

      return fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }).then(function (resp) {
      return resp.json().then(function (data) {
        if (onLoading) onLoading(false);

        if (data.kind === 'step') {
          // رسم الإطار
          var highlighted = null;
          if (data.box && data.confidence > 0) {
            // نعيد تحضير الصورة للرسم (من الملف الأصلي عبر الـshot المحفوظ)
            try { highlighted = drawHighlight(window.__sgLastShot, data.box); }
            catch (_) { /* الإطار زينة: لقطة مفقودة أو إحداثيات شاذّة تعني إرشادًا
                 بلا تحديد بصريّ — ونصّ الخطوة وحده يكفي المستخدم. */ }
          }
          // حفظ في السجل
          _session.active = true;
          _session.history.push({
            screen: data.screen,
            instruction: data.instruction,
            _imgHash: data._imgHash || null,
          });
          _session.lastHash = data._imgHash || null;
        }

        if (data.kind === 'done' || data.error === 'no_points') {
          resetSession();
        }

        if (onStep) onStep(data);
        return data;
      });
    }).catch(function (err) {
      if (onLoading) onLoading(false);
      if (onError) onError(err);
      return { kind: 'error', message: err.message };
    });
  }

  // ---------- Share Target (مشاركة من الهاتف مباشرة) ----------

  function checkShareTarget() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('share') !== 'screen-guide') return;
    // الصورة تُحفظ في caches['sg-share'] بواسطة sw.js
    if (!('caches' in window)) return;
    caches.open('sg-share').then(function (cache) {
      return cache.match('/__sg_shared_image__');
    }).then(function (resp) {
      if (!resp) return;
      return resp.blob().then(function (blob) {
        var file = new File([blob], 'shared-screenshot.jpg', { type: blob.type || 'image/jpeg' });
        window.__sgSharedFile = file;
        // إزالة من URL بلا reload
        history.replaceState({}, '', window.location.pathname);
        // إطلاق حدث ليلتقطه app-09-attach.js
        window.dispatchEvent(new CustomEvent('sg:shared-screenshot', { detail: { file: file } }));
      });
    }).catch(function () { /* المستخدم ألغى اختيار اللقطة أو رفضها المتصفّح:
         لا حدث مشاركة يُطلَق، والمسار العاديّ (زرّ المشبك) يبقى متاحًا. */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkShareTarget);
  } else {
    checkShareTarget();
  }

  // ---------- تصدير ----------

  window.__screenGuide = {
    guide: guide,
    prepareShot: prepareShot,
    drawHighlight: drawHighlight,
    resetSession: resetSession,
    getSession: function () { return _session; },
  };

})();
