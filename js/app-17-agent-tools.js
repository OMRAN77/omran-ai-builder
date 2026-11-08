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

  /* v-prov-self (المالك ١١ أكتوبر «كلّ واحد ونفسه»): رسم/تعديل يطلبه المزوّد بأداته يُنفَّذ بمحرّك شركته إن كان لها محرّك صور —
     GPT ← GPT Image، Gemini ← Gemini Image — والخادم يقبل forceEngine للمالك وحده (maha-image). غيرهما = سلسلة المحرّكات
     المعتادة، واسم المحرّك يعود في نتيجة الأداة فيقوله المزوّد. */
  function provEngine() {
    try {
      if (!(typeof omranOwnerUi === 'function' && omranOwnerUi())) return undefined;
      var p = localStorage.getItem('aiapp_provider') || (typeof omranDefaultProv === 'function' ? omranDefaultProv() : 'openai'); // v-owner-solo-all: افتراضيّ المالك الحقيقيّ (كروك) لا GPT Image الخام على جهاز جديد
      return p === 'openai' ? 'gpt' : (p === 'gemini' ? 'nano' : undefined);
    } catch (e) { return undefined; } // guard-ok — بلا تخزين = السلسلة المعتادة
  }

  /* v-owner-img-why (لقطة المالك ١٣ أكتوبر: GPT-6 Astra حاول رسم بدائل بطاقات الأزياء فرجع «image_generation_busy» مرّتين وقال «العائق توليد
     الصور» بلا سبب): السبب الحقيقيّ في __diag من الخادم (رسالة المحرّك: رصيد، صلاحيّة، موديل…) كان يُرمى هنا. للمالك وحده يصل نتيجةَ الأداة —
     بلا مفاتيح — فيقوله المزوّد كما هو ولا يسمّيه «مشغول». غير المالك كما كان (لا أسماء محرّكات تصل ردّه). */
  /* v-agent-img: رسمة المزوّد للمالك تُحفظ في مخزن التطبيق يومًا (purpose:'agent' — الخادم يتحقّق أنّه المالك) ويُسجَّل رمزها ←
     معرّفها في المحادثة (agentImgIds) فيرسله app-18 مع كلّ طلب، ويقبل write_github الرمز في دور لاحق أيضًا. يرجع الرابط أو ''. */
  /* v-img-tok-unique: الرموز كانت تبدأ من __IMG_1__ في كلّ طلب (app-18 يصفّر __genImages)، فرسمة الدور الثاني تأخذ رمز الأولى وتحلّ محلّها
     في خريطة المحادثة — «ارفع صورة العماني» يرفع آخر رسمة لا العماني. للمالك: العدّ مستمرّ في المحادثة (cur.imgSeq)، وغيره كما كان. */
  function omranNextTok(imgs, chat) {
    var n = Object.keys(imgs || window.__genImages || {}).length + 1;
    try {
      var cur = omranAgentOwner() ? (chat || ((typeof getCurrent === 'function') ? getCurrent() : null)) : null;
      if (cur) { var base = Number(cur.imgSeq) || 0; Object.keys(cur.agentImgIds || {}).forEach(function (k) { var m = /^__IMG_(\d+)__$/.exec(k); if (m && +m[1] > base) base = +m[1]; }); n = Math.max(n, base + 1); cur.imgSeq = n; }
    } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:img-seq'); }
    return '__IMG_' + n + '__';
  }
  function omranAgentOwner() { try { return typeof omranOwnerUi === 'function' && !!omranOwnerUi(); } catch (e) { return false; } }
  /* v-agent-img-size (وضع الوكيل ١٤ أكتوبر: من أربع رسمات حُفظت واحدة — JPEG — والثلاث PNG فوق حدّ المخزن ٣ م.ب فرُدّت 413 بصمت):
     الكبيرة تُعاد JPEG بجودة متدرّجة وأبعاد ≤ ١٦٠٠ قبل الحفظ؛ الرفع يحوّلها لصيغة المسار بعدها. */
  function omranAgentShrink(b64, mime) {
    return new Promise(function (resolve) {
      try {
        var im = new Image();
        im.onload = function () {
          try {
            var k = Math.min(1, 1600 / Math.max(im.naturalWidth || 1, im.naturalHeight || 1));
            var c = document.createElement('canvas');
            c.width = Math.max(1, Math.round((im.naturalWidth || 1) * k)); c.height = Math.max(1, Math.round((im.naturalHeight || 1) * k));
            var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(im, 0, 0, c.width, c.height);
            var q = 0.92, d = '';
            do { d = c.toDataURL('image/jpeg', q).split(',')[1] || ''; q -= 0.08; } while (d.length > 2500000 && q > 0.5);
            resolve(d ? { b64: d, mime: 'image/jpeg' } : null);
          } catch (e) { resolve(null); }
        };
        im.onerror = function () { resolve(null); };
        im.src = 'data:' + (mime || 'image/png') + ';base64,' + b64;
      } catch (e) { resolve(null); }
    });
  }
  /* v-agent-img-keep (المالك ١٤ أكتوبر: «لا ترفعلي الضغط… هذا رصيدي يخلص»): الحفظ الفاشل لا يكلّف رسمة ثانية — يُعاد مرّة مصغّرًا JPEG
     مهما كان السبب، والرسمة تبقى في المتصفّح فيطلب الخادم حفظها (save_image) عند الرفع بدل إعادة الرسم. */
  async function omranAgentSave(tok, b64, mime, again, chat) {
    var u = await omranAgentSave1(tok, b64, mime, chat);
    if (u || again) return u;
    var sh = await omranAgentShrink(b64, mime);
    return sh ? omranAgentSave1(tok, sh.b64, sh.mime, chat) : '';
  }
  async function omranAgentSave1(tok, b64, mime, chat) {
    try {
      if (String(b64 || '').length > 2500000) { var sh = await omranAgentShrink(b64, mime); if (sh) { b64 = sh.b64; mime = sh.mime; } }
      var up = await fetch('/api/media?action=img', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: b64, mime: mime || 'image/png', purpose: 'agent', token: (window.authGet && window.authGet('aiapp_auth_token')) || '' }) });
      var uj = null; try { uj = await up.json(); } catch (e2) { uj = null; }
      if (!up.ok || !uj || !uj.url || !uj.id) { window.__agentSaveWhy = 'HTTP ' + up.status + ((uj && uj.error) ? ' ' + uj.error : ''); return ''; }
      try {
        var cur = chat || ((typeof getCurrent === 'function') ? getCurrent() : null); // v-img-run-bind: محادثة التشغيل لا المعروضة
        if (cur) {
          var m = Object.assign({}, cur.agentImgIds || {});
          m[tok] = String(uj.id);
          var keys = Object.keys(m); if (keys.length > 30) keys.slice(0, keys.length - 30).forEach(function (k) { delete m[k]; });
          cur.agentImgIds = m;
        }
      } catch (e3) { if (window.__swallow) window.__swallow(e3, 'chatTools:agent-img-map'); }
      return String(uj.url);
    } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:pics-share'); return ''; }
  }
  function engineWhy(j) {
    try {
      if (!(typeof omranOwnerUi === 'function' && omranOwnerUi()) || !j || !j.__diag) return '';
      var d = j.__diag;
      var w = String(d.openai && d.openai !== 'no-rescue' ? d.openai : (d.gErr || d.nano || d.openai || d.free || '')).replace(/sk-[A-Za-z0-9_*\-]{6,}/g, 'sk-…').replace(/\s+/g, ' ').trim().slice(0, 220);
      return w ? ' — السبب من المحرّك: ' + w + ' — قله للمالك كما هو؛ إن كان رصيدًا أو صلاحيّة أو موديلًا غير متاح فلا تسمّه «مشغول» ولا تعِد المحاولة' : '';
    } catch (e) { return ''; } // guard-ok — السبب إضافة؛ بلاه الرسالة كما كانت
  }

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
    run: async function (name, args, rc) {
      /* v-img-run-bind (فحص سجلّ العمل، المالك ١٤ أكتوبر «صلّح الثلاثة الباقية»): مع المحادثات المتوازية كانت حالة الصور كلّها عامّة —
         رسمة المحادثة أ تُكتب في المحادثة المعروضة ب (agentImgIds وlastEditedImage)، وedit_image في أ يعدّل صورة ب (تعديل مدفوع للصورة
         الخطأ)، وطلب ب يصفّر __genImages فتضيع رسمات أ ويُعاد رمزها. rc = سياق تشغيل الطلب (app-18 وapp-09): محادثته وخريطة صوره
         ومرجع صورته وكلمات مستخدمه، تُقرأ هنا بدل العامّ. بلا rc (مستدعٍ قديم) كما كان. */
      var RC = (rc && typeof rc === 'object') ? rc : null;
      var IMGS = (RC && RC.imgs) ? RC.imgs : (window.__genImages = window.__genImages || {});
      var CHAT = function () { if (RC && RC.chat) return RC.chat; try { return (typeof getCurrent === 'function') ? getCurrent() : null; } catch (e) { return null; } };
      var REF = RC ? RC.ref : window.__chatVideoReference;
      var UTXT = RC ? String(RC.userText || '') : String(window.__chatLastUserText || '');
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
          var vT0 = Date.now(); /* v-audit-chatcli: مهلة الخادم (runInClient ٢٩٠ ث) تبدأ من طلب الأداة، وتأكيد النقاط منها */
          var va = args || {};
          var vp = String(va.prompt || '').trim();
          if (!vp) return 'وصف الفيديو فارغ — لم يبدأ التوليد.';
          if (typeof omranVideoWriteAsk === 'function' && omranVideoWriteAsk(UTXT, false)) return 'لم يبدأ أيّ توليد: المستخدم يطلب الكتابة على فيديو قائم، والتطبيق لا يكتب على الفيديو بعد. قل له ذلك بجملة واحدة ولا تدّعِ التنفيذ، واعرض كتابته على لقطة من الفيديو أو صورة يرسلها.'; // v-video-write-ask
          /* v-video-trends: الترند يحدد المحرك والنسبة ويُبنى أمره على الخادم */
          if (va.trend && typeof omranHwHidden === 'function' && omranHwHidden('trend', String(va.trend))) va.trend = ''; // v-hw-resubmit-2
          var trendMeta = null;
          try { trendMeta = (window.__VIDEO_TRENDS && va.trend) ? (window.__VIDEO_TRENDS.trends || []).filter(function (t) { return t.key === va.trend; })[0] : null; } catch (e) { trendMeta = null; }
          var engine = trendMeta ? trendMeta.engine : (String(va.provider || 'runway').toLowerCase() === 'veo' ? 'veo' : 'runway');
          var vr = String(va.ratio || '').toLowerCase();
          var ratio = trendMeta ? trendMeta.ratio : (vr === 'portrait' || vr === '9:16' ? '720:1280' : '1280:720');
          var ref = va.use_reference_image === false ? null : REF;
          /* v-video-photo-identity: بلا نسبة صريحة من النموذج كانت عرضيّة دائمًا، فتُقصّ صورة الجوّال الطوليّة
             من وسطها ويضيع الرأس — النسبة تتبع اتّجاه الصورة المرجعيّة (طوليّة/مربّعة ⇒ ٩:١٦). */
          if (!trendMeta && !vr && ref && ref.dataUrl) {
            try {
              var dims = await new Promise(function (resolve) {
                var im = new Image();
                im.onload = function () { resolve({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height }); };
                im.onerror = function () { resolve(null); };
                im.src = ref.dataUrl;
              });
              if (dims && dims.w > 0 && dims.h > 0) ratio = dims.h >= dims.w ? '720:1280' : '1280:720';
            } catch (e) { /* guard-ok — بلا أبعاد تبقى النسبة الافتراضيّة */ }
          }
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
          if (trendMeta) { payload.trend = va.trend; payload.params = { name: va.trend_name || '', text: va.trend_text || '' }; if (engine === 'veo') payload.durationSeconds = 8; }
          /* v-chat-trend-scenes (المالك، الخيار «أ»): ترند المشاهد (قصّة بيكسار) كان يصل باسم ونصّ فقط فتُرمى قصّة المستخدم ويخرج
             مشهد الصباح الافتراضيّ. الآن مقطع واحد يجمع مشاهده بالترتيب (oneClip): trend_scenes، أو trend_text يقسمه الخادم
             («المشهد الأول: …») أو يصير هو المشهد. والنصّ لا يصير اسم الطفل؛ كلمة واحدة بلا اسم = اسم. بلا قصّة = الافتراضيّ كما كان. */
          if (trendMeta && trendMeta.scenes > 1) {
            var tName = String(va.trend_name || '').trim(), tStory = String(va.trend_text || '').trim();
            var tScenes = (Array.isArray(va.trend_scenes) ? va.trend_scenes : []).filter(function (s) { return typeof s === 'string' && s.trim(); }).slice(0, 5);
            if (!tName && !tScenes.length && tStory && !/\s/.test(tStory)) { tName = tStory; tStory = ''; }
            payload.params = { name: tName, text: tName, oneClip: true };
            if (tScenes.length) payload.params.scenes = tScenes;
            else if (tStory && tStory !== tName) payload.params.extra = tStory;
          }
          if (ref && ref.dataUrl) {
            var comma = String(ref.dataUrl).indexOf(',');
            if (comma > 0) { payload.imageBase64 = String(ref.dataUrl).slice(comma + 1); payload.imageMime = ref.mime || String(ref.dataUrl).slice(5, comma).split(';')[0] || 'image/png'; }
          }
          var vrsp = window.postWithConfirm ? await window.postWithConfirm(endpoint, payload) : await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          var vjson = null; try { vjson = await vrsp.json(); } catch (e) { vjson = null; }
          if (vrsp.status === 428) return 'لم يتم تشغيل الفيديو لأن المستخدم لم يؤكد خصم النقاط.';
          if (!vrsp.ok || !vjson) return 'تعذّر بدء الفيديو: ' + String((vjson && typeof omranVideoCodeText === 'function' && omranVideoCodeText(vjson.error, vjson.retryAfter)) || (vjson && vjson.error) || ('HTTP ' + vrsp.status)).slice(0, 160); // v-chat-video-cooldown: النموذج يرى المهلة بالدقائق لا الرمز
          var videoUrl = null;
          /* v-audit-chatcli (cli-chat-rest-5): عثرة شبكة في استطلاع واحد كانت ترمي إلى catch العامّ («تعذّر التنفيذ: Failed to fetch») فيُترك
             فيديو مدفوع يكتمل عند المزوّد ولا يراه أحد، وسقف Runway ‏٣٦×٥ ث = ١٨٠ ث والخادم ينتظر الأداة ٢٩٠ ث. الآن كلّ استطلاع في try يُعاد
             بعد مهلته، والانتظار للمحرّكين حتّى ٢٨٠ ث من طلب الأداة (قبل مهلة الخادم)، ولا خروج إلّا بنتيجة أو فشل أو انتهاء الوقت. */
          var vStep = engine === 'veo' ? 8000 : 5000;
          /* v-cinema-omni (مراجعة ٢٧ أكتوبر): «سينمائي» على Omni متزامن — قد يستهلك الإنشاء نافذة الانتظار كلّها والناتج محفوظ لحظة الردّ
             (omni/…)؛ استطلاع فوريّ واحد ولو انتهت النافذة، وإلّا يُردّ فيديو مكتمل مدفوع ولا يراه أحد */
          var vReady = engine === 'veo' && /^omni\//.test(String(vjson.op || ''));
          while (vReady || Date.now() + vStep <= vT0 + 280000) {
            if (!vReady) await new Promise(function (resolve) { setTimeout(resolve, vStep); });
            vReady = false;
            var sj = null;
            try {
              var sr = engine === 'veo'
                ? await fetch('/api/video?action=veo-status&op=' + encodeURIComponent(vjson.op || ''))
                : await fetch('/api/video-status?id=' + encodeURIComponent(vjson.id || ''));
              try { sj = await sr.json(); } catch (e2) { sj = null; }
            } catch (e3) { sj = null; /* guard-ok — عثرة شبكة عابرة: المهمّة قائمة عند المزوّد، نستطلعها ثانية */ }
            if (sj && sj.status === 'SUCCEEDED') { videoUrl = Array.isArray(sj.output) ? sj.output[0] : sj.output; break; }
            if (sj && sj.status === 'FAILED') return 'فشل إنشاء الفيديو: ' + String(sj.failure || sj.error || 'سبب غير معروف').slice(0, 180);
            if (sj && sj.error === 'unavailable') return 'تعذّر إكمال الفيديو: ' + t('svcPaused') + ' (رُدّت نقاط المستخدم).'; // v-credit-out: الخادم سوّى التذكرة — لا انتظار ٤٫٥ دقيقة
          }
          if (!videoUrl) return 'لم يصل الفيديو خلال مهلة الانتظار هنا (نحو ٤ دقائق ونصف) والمهمّة ما زالت عند المزوّد (المعرّف: ' + String(vjson.id || vjson.op || '') + '). لا تقل إنّه فشل، ولا تستدعِ generate_video من جديد الآن — طلب جديد يُخصم مرّة ثانية ويصطدم بقفل الفيديو الجاري. قل للمستخدم بجملة واحدة إنّ الفيديو أخذ أطول من المعتاد ولم يصل إلى المحادثة.';
          /* v-audit-chatcli (cli-chat-rest-4): الفيديو لمحادثة طلبه — كان في window.__chatVideoResult العامّ، يصفّره طلب محادثة أخرى (app-18)
             أو يلتقطه ردّها (app-09) مع المحادثات المتوازية، كما رُبطت الصور بمحادثتها (v-img-run-bind). بلا محادثة معروفة كما كان. */
          var vRes = { url: videoUrl, name: 'chat-video.mp4', provider: engine }, vChat = CHAT();
          if (vChat && vChat.id != null) (window.__chatVideoByChat = window.__chatVideoByChat || {})[vChat.id] = vRes;
          else window.__chatVideoResult = vRes;
          return '✅ تم إنشاء الفيديو بنجاح. سيظهر الآن داخل المحادثة مع زر التنزيل.';
        }
        // 🎨 صورة حقيقية بدل رابط عشوائي. تُخزَّن محليًّا ويُعاد للنموذج رمز قصير
        // (__IMG_n__) يضعه في src؛ العميل يستبدله بـdata URI قبل العرض — فلا
        // تدخل مئات الكيلوبايت في سياق النموذج ولا في سجلّ المحادثة.
        /* v-agent-img-keep: حفظ رسمة موجودة في المتصفّح برمزها — بلا رسم جديد ولا رصيد */
        if (name === 'save_image') {
          var stok = String((args && args.token) || '');
          var ssrc = IMGS[stok] || '';
          if (!ssrc) { try { var scur = CHAT(); var sms = (scur && scur.messages) || []; for (var si = sms.length - 1; si >= 0 && !ssrc; si--) if (sms[si] && sms[si]._imgCache && sms[si]._imgCache[stok]) ssrc = sms[si]._imgCache[stok]; } catch (e) { ssrc = ''; } }
          var sm = String(ssrc).match(/^data:([^;,]+);base64,(.+)$/);
          if (!sm) return 'تعذّر: لا صورة للرمز ' + stok + ' في هذا المتصفّح (أُغلقت الصفحة أو ليست هذه المحادثة) — لا تُعِد رسمها من نفسك: قل للمالك السبب، والرسم من جديد بطلبه وحده.'; // v-owner-paid-gate
          var surl = await omranAgentSave(stok, sm[2], sm[1], false, CHAT());
          return surl ? ('✅ حُفظت ' + stok + ': ' + surl) : ('تعذّر حفظ ' + stok + ' (' + (window.__agentSaveWhy || 'سبب غير معروف') + ')');
        }
        if (name === 'generate_image') {
          var prompt = String((args && args.prompt) || '').trim();
          if (!prompt) return 'وصف الصورة فارغ — لم تُرسم.';
          if (Object.keys(IMGS).length >= 4) {
            return 'بلغتَ حدّ أربع صور في هذا الردّ. أكمل الصفحة بخلفيات CSS بدل صور إضافية.';
          }
          /* v-nano-pro-edit (تتبّع المالك: صورة مرفقة + «أقوى» → النموذج اختار generate_image فرسم مسجدًا آخر
             بلا علاقة): إن كانت كلمات المستخدم نفسها طلبًا إبداعيًا على صورته المرفقة في هذا الدور، فالصورة
             الجديدة تُبنى على المصدر (تعديل) لا من الوصف وحده. */
          var gUserText = String((args && args.userText) || UTXT || '').replace(/\s*\[[^\[\]]*\]\s*$/, '').slice(0, 600);
          var gRef = REF;
          var gRefB64 = gRef && gRef.dataUrl ? String(gRef.dataUrl).split(',')[1] : '';
          var gNewImage = /(?:صور[ةه]|كرت|بطاق[ةه]|تصميم|لوجو|شعار|بوستر|بنر|غلاف)\s*(?:جديد[ةه]?|ثاني[ةه]?|أخرى|اخرى|غير)|(?:^|[\s،,])(?:ارسم|أرسم|اصنع|انشئ|أنشئ|صمم|صمّم|ولّد|ولد|draw|create|generate|design)\s*(?:لي\s*)?(?:صور[ةه]|كرت|بطاق[ةه]|لوجو|شعار|بوستر|بنر|image|picture|card|logo|poster|banner)|\b(?:new|another|different)\s+(?:image|picture|photo|card|design|logo|poster|banner)\b/i.test(gUserText);
          /* الحواجز نفسها التي تطبّقها بوابة المحادثة: لا سؤال، لا كود/بناء، لا قراءة/مواصفات/وصفة/دعم — وأول صورة في الردّ فقط،
             كي لا تُختطف صور الصفحة كلها في طلب بناء يذكر صفة جودة مع شعار مرفق. */
          var gNotEdit = /^\s*(?:وش|شو|ايش|أيش|ليش|كيف|متى|وين|فين|هل|مين|كم|لماذا|ماذا|why|how|what|where|when|who|which)(?=$|[\s،,])|(?:كود|تطبيق|موقع|صفحة|زر\s|لعبة|سكربت|بوت|code|app|website|page|button|game|script|bot|html|css)|(?:ترجم|اقرأ|اقري|وصف|اوصف|حلل|حلّل|قارن|مواصفات|سعر|بكم|موديل|وصفة|وصفه|طبق|طبخ|مشكل|خطأ|ما\s*يشتغل|translate|read|describe|analy|compare|specs|price|recipe|dish|cook|problem|error|issue)/i.test(gUserText);
          var gFirst = Object.keys(IMGS).length === 0;
          /* v-owner-like-me: noRef من الخادم = صورة جديدة يحتاجها التطبيق في دور لقطة المالك — اللقطة المرفقة لا تُعدَّل بدلها */
          var gCreative = !!(gFirst && gRefB64 && gUserText && gUserText.length <= 120 && !gNewImage && !gNotEdit && typeof __IMG_CREATIVE_RE !== 'undefined' && __IMG_CREATIVE_RE.test(gUserText) && !/[؟?]\s*$/.test(gUserText) && !(args && args.noRef));
          if (gCreative) return await window.omranAgentTools.run('edit_image', { instruction: prompt, userText: gUserText }, RC);
          // v-maha-image-rescue: زحام عابر (retryable) يستحق محاولة ثانية بعد
          // مهلة قصيرة قبل إعلان الفشل — المستخدم لا يعيد طلبه بنفسه.
          var resp = null, j = null;
          for (var __att = 1; __att <= 2; __att++) {
            resp = await fetch('/api/media?action=maha-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: prompt,
                userText: gUserText,
                token: (window.authGet && window.authGet('aiapp_auth_token')) || '',
                guestId: window.getGuestId ? window.getGuestId() : '',
                forceEngine: provEngine(),
              }),
            });
            j = null;
            try { j = await resp.json(); } catch (e) { j = null; }
            if (resp.ok && j && j.imageBase64) break;
            if (!(j && j.retryable) || j.billed === true || __att === 2) break; // v-img-no-rebill: قد تكون حُسبت — لا رسمة ثانية
            await new Promise(function (r3) { setTimeout(r3, 2500); });
          }
          if (!resp.ok || !j || !j.imageBase64) {
            return 'تعذّر رسم الصورة: ' + (((j && j.error) || ('HTTP ' + resp.status)) + '').slice(0, 120) + engineWhy(j) +
                   '. لا تخترع رابط صورة — استعمل خلفية CSS بدلها.';
          }
          var tok = omranNextTok(IMGS, CHAT());
          IMGS[tok] = 'data:' + (j.mimeType || 'image/png') + ';base64,' + j.imageBase64;
          /* v-tool-chain (لقطة المالك «غير الشخصيات الي 3d» بعد صورة من الأدوات → سؤال نصي): صورة الأدوات لم تكن تدخل سلسلة
             التعديل، فالرسالة التالية تذهب للنموذج النصي. الآن هي آخر صورة وسلسلة جديدة، فتعمل عليها «3d/أقوى/غيّر…» مباشرة. */
          try { var gcur = CHAT(); if (gcur) { gcur.lastEditedImage = { b64: j.imageBase64, mime: j.mimeType || 'image/png' }; gcur.lastMsgWasImageEdit = true; gcur.imageTurns = []; } } catch (e) { /* guard-ok — السلسلة اختيارية */ }
          // v-img-engine-tag: اسم المحرك يظهر في سطر الأثر — يحسم «أي محرك نفّذ» فورًا.
          var gLine = '✅ رُسمت الصورة (engine: ' + (j.engine || 'gemini') + '). ضع هذا الرمز حرفيًّا في src بلا أي إضافة: ' + tok;
          /* v-img-with-edit: دور لقطة + صور = احفظ رابط /i/ فورًا كي تُرفع مع التعديل بلا انتظار «عمّم» */
          /* v-agent-img (المالك ١٣ أكتوبر: «الوكيل يرسم صورة ويرفعها للمستودع مباشرة»): كلّ رسمة للمالك تُحفظ في المخزن يومًا
             (purpose:'agent') ويصل النموذجَ رابطها مع رمزها، فيرفعها write_github بـimage:"__IMG_N__" أو بالرابط. */
          if ((args && args.noRef) || omranAgentOwner()) {
            var gUrl = await omranAgentSave(tok, j.imageBase64, j.mimeType || 'image/png', false, CHAT());
            if (gUrl && args && args.noRef) gLine += ' رابطها في التطبيق: ' + gUrl + ' — ارفعها الآن بـwrite_github ملف {path: مسار الصورة في المستودع كما قرأته, image: "' + gUrl + '"} في هذا الردّ نفسه. لا تنتظر «عمّم».';
            else if (gUrl) gLine += ' رابطها في التطبيق: ' + gUrl + ' — لرفعها إلى المستودع: write_github ملف {path, image: "' + tok + '"}.';
            else if (omranAgentOwner()) gLine += ' ⚠️ لم تُحفظ بعد في مخزن التطبيق (' + (window.__agentSaveWhy || 'سبب غير معروف') + ') — الرسمة في المتصفّح: ارفعها برمزها كما هو (image: "' + tok + '") والخادم يحفظها عند الرفع. لا تُعِد رسمها.'; // v-owner-paid-gate: «أعد رسمها» كانت تكلّف رسمة لكلّ فشل
          }
          return gLine;
        }
        /* v-edit-image-tool: تعديل الصورة المرفقة في هذا الدور بنفس محرك التطبيق
           (المصدر: آخر صورة أرفقها المستخدم — app-18 يحفظها في __chatVideoReference). */
        if (name === 'edit_image') {
          var instr = String((args && args.instruction) || '').trim();
          if (!instr) return 'تعليمة التعديل فارغة — لم يُعدَّل شيء.';
          var ref = REF;
          var srcB64 = ref && ref.dataUrl ? String(ref.dataUrl).split(',')[1] : '';
          /* v-nano-pro-edit: بلا مرفق في هذا الدور نعود لآخر صورة في المحادثة (المرفوعة أو المولّدة)
             بدل الاعتذار — فكان النموذج يهرب إلى generate_image ويرسم صورة جديدة بلا علاقة بالمصدر. */
          if (!srcB64) {
            try {
              var cur = CHAT();
              if (cur && cur.lastEditedImage && cur.lastEditedImage.b64) { srcB64 = cur.lastEditedImage.b64; ref = { mime: cur.lastEditedImage.mime || 'image/png' }; }
            } catch (e) { /* guard-ok — المحادثة الحالية اختيارية هنا */ }
          }
          if (!srcB64) return 'لا توجد صورة مرفقة في هذه الرسالة لتعديلها — اطلب من المستخدم إرفاقها.';
          /* v-image-memory: متابعة على آخر نتيجة = نرسل أدوار السلسلة السابقة كسياق */
          var tcur = null; try { tcur = CHAT(); } catch (e) { tcur = null; }
          var tFollow = !!(tcur && tcur.lastEditedImage && tcur.lastEditedImage.b64 === srcB64);
          var tHist = (tFollow && Array.isArray(tcur.imageTurns) && tcur.imageTurns.length) ? tcur.imageTurns.slice(-3) : undefined;
          var er = null, ej = null;
          try {
            er = await fetch('/api/media?action=maha-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: instr,
                userText: String((args && args.userText) || UTXT || '').replace(/\s*\[[^\[\]]*\]\s*$/, '').slice(0, 600),
                editImageBase64: srcB64,
                editMimeType: ref.mime || 'image/png',
                history: tHist,
                token: (window.authGet && window.authGet('aiapp_auth_token')) || '',
                guestId: window.getGuestId ? window.getGuestId() : '',
                forceEngine: provEngine(),
              }),
            });
            try { ej = await er.json(); } catch (e) { ej = null; }
          } catch (e) { return 'تعذّر تعديل الصورة: ' + String((e && e.message) || e).slice(0, 100); }
          if (!er.ok || !ej || !ej.imageBase64) {
            /* v-img-honest: الخادم قاس الناتج فوجده الصورة نفسها — النموذج يعرف ذلك فلا يروي «تمّ» */
            if (ej && ej.error === 'image_unchanged') return 'لم يُنفَّذ التعديل: رجعت الصورة نفسها بلا تغيير (مقيسة بالبكسل)، فلم تُعرض ولم تُحسب على المستخدم. قل له ذلك بصراحة، لا تدّعِ أنّ شيئًا تغيّر، واقترح صياغة أوضح.';
            return 'تعذّر تعديل الصورة: ' + (((ej && ej.error) || ('HTTP ' + er.status)) + '').slice(0, 120) + engineWhy(ej);
          }
          var etok = omranNextTok(IMGS, CHAT());
          IMGS[etok] = 'data:' + (ej.mimeType || 'image/png') + ';base64,' + ej.imageBase64;
          var eUrl = omranAgentOwner() ? await omranAgentSave(etok, ej.imageBase64, ej.mimeType || 'image/png', false, CHAT()) : ''; // v-agent-img
          /* v-tool-chain: نتيجة أداة التعديل تصير آخر صورة في السلسلة كي تعمل عليها الرسالة التالية مباشرة */
          try { if (tcur) { tcur.lastEditedImage = { b64: ej.imageBase64, mime: ej.mimeType || 'image/png' }; tcur.lastMsgWasImageEdit = true; } } catch (e) { /* guard-ok */ }
          /* v-image-memory: نسجّل الدور هنا أيضًا (كلمات المستخدم + مصغّر النتيجة) */
          try {
            if (tcur && typeof omranShrinkForEdit === 'function') {
              if (!tFollow || !Array.isArray(tcur.imageTurns)) tcur.imageTurns = [];
              var tRes = await omranShrinkForEdit(ej.imageBase64, ej.mimeType || 'image/png', 768, true);
              var tTurn = { text: String((args && args.userText) || UTXT || instr || '').slice(0, 400), resultBase64: tRes.b64, resultMime: tRes.mime };
              if (!tcur.imageTurns.length) { var tSrc = await omranShrinkForEdit(srcB64, ref.mime || 'image/png', 768, true); tTurn.sourceBase64 = tSrc.b64; tTurn.sourceMime = tSrc.mime; }
              tcur.imageTurns = tcur.imageTurns.concat([tTurn]).slice(-4);
            }
          } catch (e) { /* guard-ok — الذاكرة اختيارية */ }
          /* v-img-honest (المالك: «يقولي شي والتنفيذ صفر»): النموذج كان يرى «✅» وحدها فيروي «تمّ تغيير كلّ شيء» مهما خرج.
             الآن يصله حكم التنفيذ (ej.verdict) وتقرير ما يُرى فعلًا، ويُطلب منه ألّا يدّعي أكثر منه. */
          var ev = ej.verdict === 'not_done' ? ' — الفحص: الطلب لم يظهر في الصورة' : (ej.verdict === 'partial' ? ' — الفحص: نُفّذ جزء فقط' : (ej.verdict === 'done' ? ' — الفحص: نُفّذ' : ''));
          return (ej.verdict === 'not_done' ? '⚠️' : '✅') + ' عُدّلت الصورة (engine: ' + (ej.engine || 'gemini') + ')' + ev + (ej.caption ? '. ما يُرى فعلًا: «' + String(ej.caption).slice(0, 400) + '» — صِف للمستخدم هذا وحده ولا تدّعِ أكثر منه' : '') + '. ضع هذا الرمز وحده في سطر داخل ردّك: ' + etok + (eUrl ? ' — رابطها في التطبيق: ' + eUrl + ' — لرفعها إلى المستودع: write_github ملف {path, image: "' + etok + '"}.' : ''); // v-agent-img
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
