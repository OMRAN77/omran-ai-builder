/* ───────── تنفيذ أدوات الوكيل في المتصفح ─────────
 *
 * الوكيل يطلب تشغيل كود؛ التنفيذ يجري هنا لا على الخادم — فالمتصفح عند
 * المستخدم وليس عندك، والفشل يكلّفه هو لا خادمك.
 *
 * SECURITY: نفس قرار «جرّبه لي» — sandbox بلا allow-same-origin. الكود الذي
 * يكتبه النموذج لا يصل إلى localStorage ولا الجلسة ولا الكوكيز. أُثبت هذا
 * عمليًا سابقًا: parent.localStorage → SecurityError.
 */
(function () {
  'use strict';

  function runInSandbox(html, timeoutMs) {
    return new Promise(function (resolve) {
      var token = 'ag_' + Math.random().toString(36).slice(2);
      var logs = [], errors = [], done = false;
      var probe = '<scr' + 'ipt>(function(){' +
        'var TK=' + JSON.stringify(token) + ';' +
        'function send(p){try{parent.postMessage(Object.assign({__agentRun:TK},p),"*");}catch(e){}}' +
        'var _l=console.log;console.log=function(){try{send({t:"log",v:Array.prototype.map.call(arguments,function(a){' +
        ' try{return typeof a==="object"?JSON.stringify(a):String(a);}catch(e){return String(a);}}).join(" ")});}catch(e){}' +
        ' return _l.apply(console,arguments);};' +
        'window.addEventListener("error",function(e){send({t:"err",v:(e.message||"Script error")+(e.lineno?" [line "+e.lineno+"]":"")});});' +
        'window.addEventListener("unhandledrejection",function(e){send({t:"err",v:"Unhandled rejection: "+((e.reason&&e.reason.message)||e.reason)});});' +
        'setTimeout(function(){send({t:"end"});},' + (timeoutMs - 300) + ');' +
        '})();</scr' + 'ipt>';

      var full = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + probe; }) : probe + html;
      var frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:900px;height:600px;visibility:hidden';

      function finish() {
        if (done) return; done = true;
        window.removeEventListener('message', onMsg);
        try { frame.remove(); } catch (e) { __swallow(e, 'misc:agentrun'); }
        resolve({ logs: logs.slice(0, 40), errors: errors.slice(0, 10) });
      }
      function onMsg(e) {
        var d = e.data;
        if (!d || d.__agentRun !== token) return;
        if (d.t === 'log' && logs.length < 40) logs.push(String(d.v).slice(0, 600));
        else if (d.t === 'err' && errors.indexOf(d.v) < 0 && errors.length < 10) errors.push(String(d.v).slice(0, 400));
        else if (d.t === 'end') finish();
      }
      window.addEventListener('message', onMsg);
      frame.srcdoc = full;
      document.body.appendChild(frame);
      setTimeout(finish, timeoutMs);
    });
  }

  // 📋 أثر تشخيصي لأداة الموقع في «سلسلة آخر الأحداث» (?diag=1): ما أعاده
  // المتصفّح فعلًا — منطقة ودقّة أو سبب فشل. لا إحداثيات أبدًا، ولا إرسال لخادم.
  function geoTrail(txt) {
    try {
      var entry = { reason: ('موقع: ' + txt).slice(0, 90), at: new Date().toISOString() };
      var trail = [];
      try { trail = JSON.parse(localStorage.getItem('aiapp_session_notes') || '[]'); } catch (e) { trail = []; }
      trail.unshift(entry);
      localStorage.setItem('aiapp_session_notes', JSON.stringify(trail.slice(0, 5)));
    } catch (e) { /* التشخيص ترف لا يُسقط أداة */ }
  }

  /** ينفّذ أداة واحدة ويعيد نصًّا يفهمه النموذج. */
  window.omranAgentTools = {
    run: async function (name, args) {
      try {
        if (name === 'run_js') {
          var code = String((args && args.code) || '');
          var wrapped = '<!doctype html><html><head><meta charset="utf-8"></head><body><scr' + 'ipt>' +
            'try{ var __r = (function(){ ' + code + ' })(); if(__r !== undefined) console.log("→", __r); }' +
            'catch(e){ console.log("✗ " + (e && e.message || e)); }' +
            '</scr' + 'ipt></body></html>';
          var r = await runInSandbox(wrapped, 6000);
          if (!r.logs.length && !r.errors.length) return 'نُفِّذ بلا ناتج ولا أخطاء.';
          return (r.logs.length ? 'الناتج:\n' + r.logs.join('\n') : '') +
                 (r.errors.length ? '\nأخطاء:\n' + r.errors.join('\n') : '');
        }
        if (name === 'test_html') {
          var r2 = await runInSandbox(String((args && args.html) || ''), 4000);
          if (!r2.errors.length) return '✅ شُغِّل بلا أخطاء تشغيل.' + (r2.logs.length ? '\nالطرفية:\n' + r2.logs.join('\n') : '');
          return '⚠️ أخطاء تشغيل:\n' + r2.errors.join('\n');
        }
        // 🎬 إنشاء فيديو من داخل المحادثة — يستخدم نفس محركات صانع الفيديو الحالي.
        if (name === 'generate_video') {
          var va = args || {};
          var vp = String(va.prompt || '').trim();
          if (!vp) return 'وصف الفيديو فارغ — لم يبدأ التوليد.';
          var engine = String(va.provider || 'runway').toLowerCase() === 'veo' ? 'veo' : 'runway';
          var vr = String(va.ratio || '').toLowerCase();
          var ratio = vr === 'portrait' || vr === '9:16' ? '720:1280' : '1280:720';
          var ref = va.use_reference_image === false ? null : window.__chatVideoReference;
          var token = (window.authGet && window.authGet('aiapp_auth_token')) || '';
          var payload;
          var endpoint;
          if (engine === 'veo') {
            endpoint = '/api/video?action=veo-create';
            payload = { promptText: vp, ratio: ratio, token: token, quality: va.quality === 'high' ? 'high' : 'fast' };
            var vd = parseInt(va.durationSeconds, 10);
            if ([4, 6, 8].indexOf(vd) !== -1) payload.durationSeconds = vd;
          } else {
            endpoint = '/api/video?action=video-create';
            payload = { promptText: vp, ratio: ratio, token: token, duration: parseInt(va.durationSeconds, 10) >= 8 ? 10 : 5, style: va.style === 'anime' ? 'anime' : 'realistic', longMode: false };
          }
          if (ref && ref.dataUrl) {
            var comma = String(ref.dataUrl).indexOf(',');
            if (comma > 0) { payload.imageBase64 = String(ref.dataUrl).slice(comma + 1); payload.imageMime = ref.mime || String(ref.dataUrl).slice(5, comma).split(';')[0] || 'image/png'; }
          }
          var vrsp = window.postWithConfirm ? await window.postWithConfirm(endpoint, payload) : await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          var vjson = null; try { vjson = await vrsp.json(); } catch (e) { vjson = null; }
          if (vrsp.status === 428) return 'لم يتم تشغيل الفيديو لأن المستخدم لم يؤكد خصم النقاط.';
          if (!vrsp.ok || !vjson) return 'تعذّر بدء الفيديو: ' + String((vjson && vjson.error) || ('HTTP ' + vrsp.status)).slice(0, 160);
          var videoUrl = null;
          var maxPoll = engine === 'veo' ? 34 : 36;
          for (var pi = 0; pi < maxPoll; pi++) {
            await new Promise(function (resolve) { setTimeout(resolve, engine === 'veo' ? 8000 : 5000); });
            var sr = engine === 'veo'
              ? await fetch('/api/video?action=veo-status&op=' + encodeURIComponent(vjson.op || ''))
              : await fetch('/api/video-status?id=' + encodeURIComponent(vjson.id || ''));
            var sj = null; try { sj = await sr.json(); } catch (e2) { sj = null; }
            if (sj && sj.status === 'SUCCEEDED') { videoUrl = Array.isArray(sj.output) ? sj.output[0] : sj.output; break; }
            if (sj && sj.status === 'FAILED') return 'فشل إنشاء الفيديو: ' + String(sj.failure || sj.error || 'سبب غير معروف').slice(0, 180);
          }
          if (!videoUrl) return 'انتهت مهلة انتظار الفيديو قبل وصول النتيجة. حاول مرة أخرى إذا لم يظهر خلال دقائق.';
          window.__chatVideoResult = { url: videoUrl, name: 'chat-video.mp4', provider: engine };
          return '✅ تم إنشاء الفيديو بنجاح. سيظهر الآن داخل المحادثة مع زر التنزيل.';
        }
        // 🎨 صورة حقيقية بدل رابط عشوائي. تُخزَّن محليًّا ويُعاد للنموذج رمز قصير
        // (__IMG_n__) يضعه في src؛ العميل يستبدله بـdata URI قبل العرض — فلا
        // تدخل مئات الكيلوبايت في سياق النموذج ولا في سجلّ المحادثة.
        if (name === 'generate_image') {
          var prompt = String((args && args.prompt) || '').trim();
          if (!prompt) return 'وصف الصورة فارغ — لم تُرسم.';
          window.__genImages = window.__genImages || {};
          if (Object.keys(window.__genImages).length >= 4) {
            return 'بلغتَ حدّ أربع صور في هذا الردّ. أكمل الصفحة بخلفيات CSS بدل صور إضافية.';
          }
          // v-maha-image-rescue: زحام عابر (retryable) يستحق محاولة ثانية بعد
          // مهلة قصيرة قبل إعلان الفشل — المستخدم لا يعيد طلبه بنفسه.
          var resp = null, j = null;
          for (var __att = 1; __att <= 2; __att++) {
            resp = await fetch('/api/media?action=maha-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: prompt,
                token: (window.authGet && window.authGet('aiapp_auth_token')) || '',
                guestId: window.getGuestId ? window.getGuestId() : '',
              }),
            });
            j = null;
            try { j = await resp.json(); } catch (e) { j = null; }
            if (resp.ok && j && j.imageBase64) break;
            if (!(j && j.retryable) || __att === 2) break;
            await new Promise(function (r3) { setTimeout(r3, 2500); });
          }
          if (!resp.ok || !j || !j.imageBase64) {
            return 'تعذّر رسم الصورة: ' + (((j && j.error) || ('HTTP ' + resp.status)) + '').slice(0, 120) +
                   '. لا تخترع رابط صورة — استعمل خلفية CSS بدلها.';
          }
          var tok = '__IMG_' + (Object.keys(window.__genImages).length + 1) + '__';
          window.__genImages[tok] = 'data:' + (j.mimeType || 'image/png') + ';base64,' + j.imageBase64;
          return '✅ رُسمت الصورة. ضع هذا الرمز حرفيًّا في src بلا أي إضافة: ' + tok;
        }
        /* v-edit-image-tool: تعديل الصورة المرفقة في هذا الدور بنفس محرك التطبيق
           (المصدر: آخر صورة أرفقها المستخدم — app-18 يحفظها في __chatVideoReference). */
        if (name === 'edit_image') {
          var instr = String((args && args.instruction) || '').trim();
          if (!instr) return 'تعليمة التعديل فارغة — لم يُعدَّل شيء.';
          var ref = window.__chatVideoReference;
          var srcB64 = ref && ref.dataUrl ? String(ref.dataUrl).split(',')[1] : '';
          if (!srcB64) return 'لا توجد صورة مرفقة في هذه الرسالة لتعديلها — اطلب من المستخدم إرفاقها.';
          window.__genImages = window.__genImages || {};
          var er = null, ej = null;
          try {
            er = await fetch('/api/media?action=maha-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: instr,
                editImageBase64: srcB64,
                editMimeType: ref.mime || 'image/png',
                token: (window.authGet && window.authGet('aiapp_auth_token')) || '',
                guestId: window.getGuestId ? window.getGuestId() : '',
              }),
            });
            try { ej = await er.json(); } catch (e) { ej = null; }
          } catch (e) { return 'تعذّر تعديل الصورة: ' + String((e && e.message) || e).slice(0, 100); }
          if (!er.ok || !ej || !ej.imageBase64) {
            return 'تعذّر تعديل الصورة: ' + (((ej && ej.error) || ('HTTP ' + er.status)) + '').slice(0, 120);
          }
          var etok = '__IMG_' + (Object.keys(window.__genImages).length + 1) + '__';
          window.__genImages[etok] = 'data:' + (ej.mimeType || 'image/png') + ';base64,' + ej.imageBase64;
          return '✅ عُدّلت الصورة. ضع هذا الرمز وحده في سطر داخل ردّك: ' + etok;
        }
        // 📍 موقع المستخدم الحالي — يُطلب إذن المتصفح هنا فقط، عند استدعاء
        // الأداة فعلًا، لا عند فتح الصفحة. الإحداثيات تُستهلك في نداء التحويل
        // وتُنسى: لا تُكتب في localStorage ولا في أي سجلّ دائم.
        if (name === 'get_location') {
          if (!navigator.geolocation) return 'تعذّر: هذا المتصفّح لا يدعم تحديد الموقع.';
          var pos;
          try {
            pos = await new Promise(function (res, rej) {
              navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
            });
          } catch (ge) {
            if (ge && ge.code === 1) { geoTrail('رفض-الإذن'); return 'رفض المستخدم إذن الموقع في المتصفّح. اشرح له أنه يستطيع تفعيله من أيقونة القفل بجانب العنوان ثم إعادة السؤال، ولا تكرّر المحاولة الآن.'; }
            if (ge && ge.code === 3) { geoTrail('مهلة'); return 'انتهت مهلة تحديد الموقع دون إشارة GPS كافية. اقترح عليه المحاولة في مكان مكشوف أو تفعيل GPS.'; }
            geoTrail('خطأ');
            return 'تعذّر تحديد الموقع: ' + String((ge && ge.message) || 'خطأ غير معروف').slice(0, 120);
          }
          var glat = pos.coords.latitude, glon = pos.coords.longitude;
          var rg = null;
          try {
            var rr = await fetch('/api/system?action=revgeo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: glat, lon: glon }),
            });
            if (rr.ok) rg = await rr.json();
          } catch (e2) { rg = null; }
          var gacc = Math.round(pos.coords.accuracy || 0);
          geoTrail((rg && rg.label ? String(rg.label).split('،').slice(0, 2).join('،') : 'بلا-عنوان') + ' · دقة ' + (gacc > 999 ? (gacc / 1000).toFixed(1) + 'كم' : gacc + 'م'));
          if (rg && rg.label) {
            // دقة خشنة (كمبيوتر بلا GPS — تحديد من الشبكة) قد تخطئ كيلومترات:
            // نصارح النموذج بذلك ليصارح المستخدم بدل يقين زائف.
            if (gacc > 3000) {
              return 'موقع المستخدم تقريبيّ فقط (دقّة نحو ' + (gacc / 1000).toFixed(1) + ' كم — المتصفّح حدّده من الشبكة لا من GPS): ' + rg.label
                + '. قل له صراحةً إن التحديد تقريبي وقد ينحرف كيلومترات، وإن أراد دقّة أعلى فليجرّب من الجوال مع تفعيل GPS.';
            }
            // فوق ~200م = تحديد شبكة (كمبيوتر بلا GPS) — دقّته المعلنة متفائلة
            // أحيانًا والانحراف الفعلي قد يبلغ كيلومترات، فيُصارَح المستخدم.
            if (gacc > 200) {
              return 'موقع المستخدم عبر الشبكة لا عبر GPS (دقّة معلنة نحو ' + gacc + ' مترًا، وقد ينحرف فعليًّا أكثر): ' + rg.label
                + '. اذكر له أن هذا تحديد شبكة من جهاز بلا GPS وقد ينحرف، وللدقّة الكاملة يسأل من جوّاله.';
            }
            return 'موقع المستخدم الحالي (دقّة نحو ' + gacc + ' مترًا): ' + rg.label;
          }
          return 'حُدّدت الإحداثيات لكن تعذّر تحويلها إلى عنوان الآن. قل للمستخدم إن التحديد نجح تقريبًا حول خطّ عرض ' + glat.toFixed(2) + ' وخطّ طول ' + glon.toFixed(2) + ' وإن اسم المنطقة غير متاح مؤقتًا.';
        }
        return 'أداة غير معروفة: ' + name;
      } catch (e) {
        return 'تعذّر التنفيذ: ' + String(e && e.message || e);
      }
    },
  };
})();
