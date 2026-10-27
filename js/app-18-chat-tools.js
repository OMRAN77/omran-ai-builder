/* ───────── 💬 المحادثة بأدوات — عميل الواجهة ─────────
 *
 * يستهلك بثّ /api/ai?action=chat بنفس بروتوكول وكيل عمران (status · delta ·
 * clientTool · done)، ويعيد نفس شكل callAIWithFallback تمامًا — فمُستدعيه لا
 * يعرف أنّ شيئًا تغيّر.
 *
 * أي فشل هنا = رمية واحدة، والمستدعي يهبط إلى المسار القديم كما كان. الميزة
 * التي تُسقط المحادثة عند أوّل عثرة ليست ميزة.
 */
(function () {
  'use strict';

  if (typeof window.__chatToolsOn === 'undefined') window.__chatToolsOn = true;

  /* v-parallel-chats: كلّ طلب يكتب في شريط حالته هو (onDelta.__status) — والخطوة المفتوحة محفوظة على الشريط
     نفسه لا في متغيّر مشترك — فلا تظهر خطوات محادثة في فقاعة محادثة أخرى تعمل معها. */
  function note(txt, st) {
    try {
      var s = st || window.__chatStatus;
      if (!s || (typeof s.isReleased === 'function' && s.isReleased()) || typeof s.step !== 'function') return;
      if (s.__toolStep && typeof s.__toolStep.done === 'function') s.__toolStep.done();
      s.__toolStep = s.step('•', String(txt).replace(/^[^\u0600-\u06FFa-zA-Z0-9]+/, '').trim() || String(txt));
    } catch (e) { /* شريط الحالة ترفٌ لا يُسقط ردًّا */ }
  }
  function noteEnd(st) {
    try {
      var s = st || window.__chatStatus;
      if (s && s.__toolStep && typeof s.__toolStep.done === 'function') s.__toolStep.done();
      if (s) s.__toolStep = null;
    } catch (e) { /* كسابقه */ }
  }

  /** ينفّذ أداة طلبها الخادم داخل متصفّح المستخدم ويعيد ناتجها عبر نقطة منفصلة. */
  function serveClientTool(ct, rc) {
    (async function () {
      var out;
      try {
        out = window.omranAgentTools
          ? await window.omranAgentTools.run(ct.name, ct.input, rc)
          : 'أداة التنفيذ غير متاحة في هذا المتصفّح.';
      } catch (err) { out = 'تعذّر التنفيذ: ' + ((err && err.message) || err); }
      try {
        await fetch('/api/agent-tool-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ct.id, output: out }),
        });
      } catch (err) { if (window.__swallow) window.__swallow(err, 'chatTools:result'); }
    })();
  }

  /**
   * @param {Array} messages رسائل المحادثة كما تُبنى للمزوّد (تشمل رسائل system).
   * @param {Function} onDelta تُستدعى بالنصّ المتراكم كلّما وصلت قطعة.
   * @returns {{reply:string, providerKey:string, switched:boolean, requestedKey:string}}
   */
  // ⏱️ v-chat-idle — حارس خمول العميل: fetch في المتصفّح بلا مهلة، والحارس
  // الصلب لا يقطع إلا بعد ٥ دقائق، فنصّ طويل يتعثّر تدفّقه = صمت ٥ دقائق يقرأه
  // المستخدم «مافي إجابة». هذا الحارس يقطع بعد صمتٍ فعليّ ويهبط لمزوّد احتياط.
  // v-idle-90 (تشخيص جهاز المالك: «٧١ ثانية · لم يصل · لا خطأ»): ٤٥ث كانت
  // تقطع «تعبئة» النموذج للنصّ الطويل قبل أوّل حرف (المِجسّ قاس ١٤–٢٨ث، وقد
  // يطول للّصق الكبير)، فتهبط لاحتياطٍ يفشل صامتًا. ٩٠ث تسع التعبئة الطويلة،
  // والحارس الصلب (٥ دقائق) يبقى شبكة الأمان النهائيّة ضدّ التعليق الحقيقيّ.
  var __CHAT_IDLE_MS = 90000;   // لا بايت من الخادم هذه المدة (خارج الأدوات) = تعثّر
  var __CHAT_TOOL_MS = 295000;  // أثناء تشغيل أداة محلّيّة نترك القطع للحارس الصلب
  /* v-stall-resume (لقطة المالك ١٢ أكتوبر ١٠:٠٠: «تقدر تسويه كلهم» ← «ما وصل شي من الخادم»، والخادم في اللحظة نفسها أنجز وفتح
     طلب السحب #1012): الجوّال يجمّد التطبيق في الخلفيّة، ومؤقّت ٩٠ ث الذي حلّ موعده أثناء التجميد كان يطلق فور الرجوع قبل أن تُقرأ
     البايتات المنتظرة في المقبس. الآن الصمت يُعدّ وقتًا ظاهرًا حيًّا فقط: نبضة كلّ ثانية، والصفحة المخفيّة أو فجوة أكبر من ٥ ث بين
     نبضتين (تجميد) لا تُحسبان. صمتٌ ظاهر ٩٠ ث يبقى تعثّرًا كما كان (درس #527). */
  function __raceIdle(p, ms, tag) {
    return new Promise(function (resolve, reject) {
      var idle = 0, last = Date.now(), done = false, to = null;
      function finish(fn, v) { if (done) return; done = true; try { clearTimeout(to); } catch (e) { /* guard-ok — تنظيف المؤقّت */ } fn(v); }
      function tick() {
        var now = Date.now(), dt = now - last;
        last = now;
        var shown = (typeof document === 'undefined') || !document.visibilityState || document.visibilityState === 'visible';
        if (shown && dt < 5000) idle += dt;
        if (idle >= ms) { finish(reject, new Error(tag)); return; }
        to = setTimeout(tick, 1000);
      }
      to = setTimeout(tick, 1000);
      p.then(function (v) { finish(resolve, v); }, function (e) { finish(reject, e); });
    });
  }

  /* v-gen-image (أمر المالك ١٣ أكتوبر «اذا شفت الصورة عند مزوّد اقوله عمّم… كل شي موجود في التطبيق نفسه»): «عمّم» من المالك ومعها
     صورة قريبة — مرفقة مع الكلمة، أو في الردّ الذي قبلها، أو مرفقة في السؤال قبله — تُرسل JPEG مضغوطة (دون ٦٤٠ ك.ب) مع الطلب في
     genImage، فيحفظها الخادم برابط من التطبيق يصل المزوّدين العشرة. بلا الكلمة أو مع نفيها أو لغير المالك: لا شيء يُرسل. */
  var __GEN_WORD_RE = /(?:^|[\s،,.!؟?«»"'()-])(?:عمّم|عمم|عمّمه|عممه|عمّمها|عممها|عمّموه)(?=$|[\s،,.!؟?«»"'()-])/i;
  var __GEN_NEG_RE = /(?:لا|ما|مب|مو|مش|بدون)\s+(?:ت|ن|ي)?(?:عمّم|عمم)/;
  function __msgImage(m) {
    var att = (m && Array.isArray(m.attachments)) ? m.attachments : [];
    for (var a = att.length - 1; a >= 0; a--) { var x = att[a]; if (x && x.isImage && typeof x.dataUrl === 'string' && x.dataUrl.indexOf('data:image') === 0) return x.dataUrl; }
    var c = (m && m._imgCache && typeof m._imgCache === 'object') ? m._imgCache : null;
    if (c) { var ks = Object.keys(c); for (var k = ks.length - 1; k >= 0; k--) { var u = c[ks[k]]; if (typeof u === 'string' && u.indexOf('data:image') === 0) return u; } }
    return '';
  }
  function __smallJpeg(du) {
    return new Promise(function (resolve) {
      try {
        var im = new Image();
        im.onload = function () {
          try {
            var steps = [1600, 1400, 1200, 1024, 800, 640], q = [0.88, 0.86, 0.84, 0.8, 0.75, 0.7];
            for (var s = 0; s < steps.length; s++) {
              var r = Math.min(1, steps[s] / Math.max(im.naturalWidth || 1, im.naturalHeight || 1));
              var cv = document.createElement('canvas');
              cv.width = Math.max(1, Math.round((im.naturalWidth || 1) * r)); cv.height = Math.max(1, Math.round((im.naturalHeight || 1) * r));
              var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
              var b64 = cv.toDataURL('image/jpeg', q[s]).split(',')[1] || '';
              if (b64 && b64.length <= 640 * 1024) { resolve({ data: b64, mime: 'image/jpeg', w: cv.width, h: cv.height }); return; }
            }
          } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:genImage'); }
          resolve(null);
        };
        im.onerror = function () { resolve(null); };
        im.src = du;
      } catch (e) { resolve(null); }
    });
  }
  async function __genImageFor(text, proj) {
    if (!(typeof omranOwnerUi === 'function' && omranOwnerUi())) return null;
    var s = String(text || '');
    if (!__GEN_WORD_RE.test(s) || __GEN_NEG_RE.test(s)) return null;
    var cur = proj || ((typeof getCurrent === 'function') ? getCurrent() : null);
    var ms = (cur && Array.isArray(cur.messages)) ? cur.messages : [];
    for (var i = ms.length - 1, seen = 0; i >= 0 && seen < 3; i--) {
      var m = ms[i];
      if (!m || m._loading) continue;
      seen++;
      var du = __msgImage(m);
      if (!du) continue;
      var sm = await __smallJpeg(du);
      if (sm) sm.note = String((m.apiText !== undefined ? m.apiText : m.content) || '').replace(/__IMG_\d+__/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
      return sm;
    }
    return null;
  }

  window.omranGenImageFor = __genImageFor; /* v-gen-image-agent: الوكيل (app-09 runOmranAgent) يرسل الصورة نفسها بالقاعدة نفسها */

  window.callChatWithTools = async function (messages, onDelta, provider, opts) {
    var __rcChat = (onDelta && onDelta.__chat) || ((typeof getCurrent === 'function') ? getCurrent() : null); /* v-img-run-bind: محادثة هذا الطلب (app-09 __sigFn) */
    window.__chatVideoResult = null; /* v-audit-chatcli: فيديو أداة المحادثة صار لمحادثته (__chatVideoByChat في app-17)، والبطاقات في ناتج هذه الدالّة وحده */
    window.__chatVideoReference = null;
    window.__chatLastUserText = '';
    try {
      for (var mi = messages.length - 1; mi >= 0; mi--) {
        var mm = messages[mi];
        if (mm && Array.isArray(mm.images) && mm.images.length) {
          var im = mm.images[mm.images.length - 1];
          if (im && im.dataUrl) { window.__chatVideoReference = { dataUrl: im.dataUrl, mime: im.mime || 'image/png' }; break; }
        }
      }
      /* v-nano-pro-edit: أداة edit_image ترسل أمر النموذج بالإنجليزية؛ كلمات المستخدم الأصلية
         («أقوى/أفخم/فكرة ثانية») تُحفظ هنا ليقرأ الخادم النيّة منها لا من إعادة الصياغة. */
      for (var ui = messages.length - 1; ui >= 0; ui--) {
        var um = messages[ui];
        if (!um || um.role !== 'user') continue;
        var ut = typeof um.content === 'string' ? um.content
          : (Array.isArray(um.content) ? um.content.filter(function (c) { return c && c.type === 'text'; }).map(function (c) { return c.text || ''; }).join(' ') : '');
        /* الملحق «[الصور المرفقة: اسم.png]» يُحذف كي لا يخدع اسمُ ملفٍ مثل render.png قارئَ النيّة */
        window.__chatLastUserText = String(ut || '').slice(0, 800).replace(/\s*\[[^\[\]]*\]\s*$/, '').trim().slice(0, 600); /* v-quad-fix: القصّ قبل الـregex — كانت O(n²) على اللصق الطويل */
        break;
      }
    } catch (e) { /* guard-ok — مرجع الصورة اختياري ولا يجب أن يمنع المحادثة */ }
    // صور هذا الردّ فقط: تُمسح عند كلّ طلب جديد فلا يتراكم عشرات الميغابايت في
    // الذاكرة، وحدّ الأربع يبقى حدَّ ردٍّ لا حدَّ جلسة. الكود المبنيّ يُستبدل فيه
    // الرمز فور وصوله، فلا يضرّه المسح لاحقًا.
    window.__genImages = {};
    /* v-img-run-bind: سياق تشغيل هذا الطلب لأدوات الصور (app-17) — طلب محادثة أخرى يصفّر العامّ ولا يمسّ هذه */
    var __rc = { chat: __rcChat, imgs: window.__genImages, ref: window.__chatVideoReference, userText: window.__chatLastUserText };
    try { if (__rcChat && __rcChat.id != null) (window.__genImagesByChat = window.__genImagesByChat || {})[__rcChat.id] = __rc.imgs; } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:img-bind'); }
    // v-chat-vision: الصور المرفقة كانت تُقصى من هذا المسار فتسقط لمسار قديم
    // أضعف — الآن تُحوَّل لكتل رؤية بصيغة Anthropic وتمر بنفس الخط المباشر
    // القوي (نفس النموذج ونفس قواعد العمق والأدوات).
    messages = messages.map(function (m) {
      if (!m || !m.images || !m.images.length) return m;
      var content = [{ type: 'text', text: String(m.content || 'حلّل هذه الصورة بالتفصيل.') }];
      m.images.forEach(function (img) {
        var b64 = String((img && img.dataUrl) || '').split(',')[1];
        if (b64) content.push({ type: 'image', source: { type: 'base64', media_type: (img && img.mime) || 'image/jpeg', data: b64 } });
      });
      return { role: m.role, content: content };
    });
    var __genImg = null;
    try { __genImg = await __genImageFor(window.__chatLastUserText, __rcChat); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:genImage'); } /* v-gen-image */
    var __sig = (onDelta && onDelta.__signal) || ((typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined); /* v-parallel-chats */
    var res = await __raceIdle(fetch('/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: __sig,
      body: JSON.stringify({
        messages: messages,
        provider: provider || 'claude',
        ownerUiShot: (typeof window.__ownerUiShotTurn === 'boolean') ? window.__ownerUiShotTurn : undefined, /* v-owner-ui-shot-client: قرار الواجهة لهذا الدور (لقطة المالك يطلب تعديلها) — الخادم يتبعه بدل إعادة التخمين من النصّ */
        noTools: (opts && opts.noTools) ? true : undefined, /* v-owner-solo: المسار القديم للمالك (استئذان/إصلاح) بلا أدوات كما كان — الخادم يقبله للمالك وحده */
        genImage: __genImg || undefined, /* v-gen-image: صورة «عمّم» للمالك وحده؛ undefined لغيرها فيسقط الحقل من JSON */
        imgIds: (function () { try { var c = (typeof omranOwnerUi === 'function' && omranOwnerUi()) ? __rcChat : null; return (c && c.agentImgIds && Object.keys(c.agentImgIds).length) ? c.agentImgIds : undefined; } catch (e) { return undefined; } })(), /* v-agent-img: رمز رسمة المحادثة ← معرّفها في المخزن، للمالك وحده */
        histOffset: (opts && Number.isInteger(opts.histOffset) && opts.histOffset >= 0) ? opts.histOffset : undefined, /* v-tokens-window: موضع أوّل رسالة مرسلة في المحادثة — الخادم يثبّت به بداية نافذة التاريخ (كاش)؛ undefined = السلوك القديم */
        /* v-claude-models: النموذج المختار من الإعدادات — على مسار كلود قائمته حصرًا؛ v-provider-models: ولبقيّة
           المزوّدين معرّف OpenRouter من شريط السهم (الخادم يقبله للمالك بالبادئة الصحيحة). */
        model: (function () { try { return ((provider || 'claude') === 'claude' && window.claudeModelGet) ? window.claudeModelGet() : (window.omranModelFor ? window.omranModelFor(provider || 'claude') : ''); } catch (e) { return ''; } })(),
        effort: (function () { try { var __p = provider || 'claude'; return (__p === 'claude' && window.claudeEffortGet) ? (window.claudeEffortGet() || undefined) : (__p === 'openai' && window.gptEffortGet) ? (window.gptEffortGet() || undefined) : undefined; } catch (e) { return undefined; } })(), /* v-owner-claude-all + v-owner-gpt-all: جهد المالك من المنتقي (كلود وGPT)؛ undefined لغيره فيسقط الحقل من JSON وطلبه كما كان بايتًا بايتًا */
        // v-no-region-assume: المنطقة الزمنية الحقيقية للجهاز — الوقت في الرد بها لا بتوقيت الإمارات.
        tz: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })(),
        token: (window.authGet && window.authGet('aiapp_auth_token')) || '',
        guestId: window.getGuestId ? window.getGuestId() : '',
        // v-custom-instructions: تعليمات المستخدم من الإعدادات — الخادم ينظّفها ويحقنها.
        customInstructions: (function () { try { return window.getCustomInstructions ? window.getCustomInstructions() : ''; } catch (e) { return ''; } })(),
      }),
    }), __CHAT_IDLE_MS, '__chat_no_headers__');
    if (!res.ok || !res.body) {
      var errText = '';
      try { errText = await res.text(); } catch (e) { /* لا جسم للخطأ */ }
      throw new Error('chat ' + res.status + ': ' + String(errText).slice(0, 200));
    }

    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var buf = '', full = '', serverErr = null;
    var __planLimit = false; /* v-plans-gate: الخادم علّم الخطأ «حدّ الباقة» (limit) — المستدعي يفتح الباقات ولا يجرّب غيره */
    var __ownerStop = false; /* v-owner-solo: مزوّد المالك المختار فشل والخادم كتب السبب — المستدعي يعرضه ولا يجرّب غيره */
    var __srcAcc = []; /* v-one-brain: مصادر بحث النموذج نفسه — لبطاقات «المصادر» */
    var __cards = null; /* v-cards: حدث البطاقات (آخر واحد في الردّ) */
    var __toolBusy = false; /* أداة محلّيّة قيد التنفيذ → نطيل مهلة الخمول */
    var __tier = null; /* v-tiers: free / free-limit / guest / guest-limit — لشارة «ردّ مجاني» */
    var __model = ''; /* v-claude-models: اسم النموذج الذي أجاب فعلًا (من الخادم) */
    var __served = ''; /* v-owner-identity: الموديل كما أعلنه المزوّد نفسه في ردّه (للمالك) */
    /* v-read-all (المالك: «الوكيل يقرأ ويحلّل كلّ شي — أريد نفس الشي في المزوّدين كلّهم»): كلّ سطر أثر «↳» خطوةٌ في
       سجلّ بصيغة سجلّ الوكيل (m._agParts)، يسبقها «فكّر N ث» حتّى أوّل حرف — يُحفظ في الرسالة فيبقى بعد الردّ. */
    var __t0 = Date.now(), __tFirst = 0, __steps = [], __thinks = [];
    /* v-work-log (المالك ١٣ أكتوبر: «الحينه هذا منظم بي ذمتك» ثمّ لقطة واجهة Claude «سولي نفس هذي بالضبط»): التفكير والخطوات سجلّ
       واحد بترتيب وصولها (__seq)، وكلّ واحد يصل صندوق العمل حيًّا (__omranThinkNote) مع بداية الدور (t0) لعدّاد الوقت.
       مدّة كلّ تفكير منذ آخر حدث لا منذ بداية الدور. */
    var __seq = [], __tLast = __t0;
    /* v-interleave-fix (تدقيق ١٤ أكتوبر): الجملة القصيرة قبل الأداة كانت تتراكم في فقاعة الردّ ملتصقة («أقرأ app-17 أوّلًا.الآن أرفع…»).
       الآن ما كُتب منذ آخر خطوة يصير سطرًا في السجلّ قبلها (كـClaude Code)، والردّ ما بعد آخر خطوة. النصّ الطويل أو الكود يبقى في الردّ
       ويُفصل بسطر فارغ — لا يُقصّ جواب كتبه النموذج قبل أداة. */
    var __segFrom = 0, __moved = [];
    function __moveSeg() {
      if (full.length <= __segFrom) { __segFrom = full.length; return; }
      var seg = full.slice(__segFrom), st = seg.trim();
      if (st && st.length <= 320 && st.indexOf('```') === -1) {
        full = full.slice(0, __segFrom); __moved.push(seg);
        var tp = { t: 'text', s: st }; __seq.push(tp);
        if (typeof window.__omranThinkNote === 'function') { try { window.__omranThinkNote({ step: tp, t0: __t0 }); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:seg'); } }
        if (onDelta) { try { onDelta(full); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:seg-delta'); } }
      } else if (st && !/\n\s*$/.test(full)) full += '\n\n';
      __segFrom = full.length;
    }
    function __logNow() { return __seq.length ? [{ t: 'meta', ms: Date.now() - __t0 }].concat(__seq) : undefined; }
    var __rp = window.omranReadPanel || null; /* v-read-panel: لوحة «الكود المقروء» — ما يُقرأ من GitHub يظهر فيها أثناء البثّ */
    if (__rp) __rp.begin();

    while (true) {
      var chunk;
      try { chunk = await __raceIdle(reader.read(), __toolBusy ? __CHAT_TOOL_MS : __CHAT_IDLE_MS, '__chat_idle__'); }
      catch (e) {
        if (e && e.name === 'AbortError') { try { e.log = __logNow(); } catch (_l) { /* guard-ok — السجلّ ترف */ } throw e; } /* إيقاف المستخدم أو الحارس الصلب — يمرّ كما هو، ومعه سجلّ العمل (v-interleave-fix) */
        try { var __cp = reader.cancel(); if (__cp && __cp.catch) __cp.catch(function () { /* guard-ok — المجرى انقطع أصلًا: إلغاؤه يرفض، وبلا هذا رفضٌ غير معالَج (v-turn-close) */ }); } catch (_e) { /* guard-ok — تحرير المجرى */ }
        if (full.trim()) break; /* عندنا نصّ جزئيّ — نعرضه بدل تضييعه */
        /* v-turn-close (لقطة المالك ١٥ أكتوبر: طلب السحب انفتح والفقاعة «ما وصل شي من الخادم» بلا شيء): انقطاع المقبس كان يُقرأ «صمتًا»،
           ويضيع معه سجلّ العمل (الخطوات والجمل المنقولة إليه) وعلامة سبب الخادم. الآن: الصمت الظاهر ٩٠ ث «stalled» كما كان (#527)، والانقطاع
           «cut» بسببه، والسجلّ وownerStop يبقيان مع الخطأ كما في نهاية المجرى الفارغة. */
        var __se = new Error(serverErr || ((e && e.message === '__chat_idle__') ? 'chat: stalled — no response' : 'chat: cut — ' + String((e && e.message) || e).slice(0, 80)));
        if (__rp) { try { __rp.pack(__steps, full); } catch (_p) { if (window.__swallow) window.__swallow(_p, 'chatTools:cut-pack'); } } /* سقف المقاطع المحفوظة كالنهاية الناجحة — السجلّ يُحفظ في الرسالة */
        if (__ownerStop) __se.ownerStop = true; __se.log = __logNow(); throw __se;
      }
      if (chunk.done) break;
      __toolBusy = false; /* وصلت بايتات جديدة من الخادم → لم نعد بانتظار أداة */
      if (__sig) { try { __sig.__omLastByte = Date.now(); } catch (e) { /* guard-ok — إشارة مجمّدة: حارس الرجوع يقطع كما كان */ } } /* v-stall-resume: آخر بايت على إشارة الطلب — حارس الرجوع (app-09) لا يقطع بثًّا حيًّا */
      buf += dec.decode(chunk.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('data: ') !== 0) continue;
        var ev;
        try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
        /* v-img-box (المالك: «احذف كلمة يرسم الصورة مع أيقونة الرسم»): حالة رسم/تعديل صورة تُظهر مربّع الإنشاء بدل السطر */
        if (ev.status && ev.k === 'stGenImage' && typeof window.__omranImgBox === 'function' && window.__omranImgBox()) { /* المربّع ظهر */ }
        else if (ev.status) note((typeof tStatus === 'function') ? tStatus(ev) : ev.status, onDelta && onDelta.__status);  /* v656 */
        if (ev.status && !/^↳/.test(String(ev.status)) && typeof window.__omranThinkNote === 'function') { try { window.__omranThinkNote({ head: String((typeof tStatus === 'function') ? tStatus(ev) : ev.status).replace(/^[^\u0600-\u06FFa-zA-Z0-9]+/, '').trim(), t0: __t0 }); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:head'); } } /* v-work-log: رأس صندوق العمل = ما يجري الآن */
        if (ev.think && ev.think.s && __thinks.length < 24) { __moveSeg(); /* v-interleave-fix */ /* v-interleave (المالك ١٤ أكتوبر «نفس فكرة كلاود كودي»): التفكير بين الأدوات يظهر سطرًا مطويًّا كما يفكّر — كان v-edit-no-talk يحجبه بعد أوّل أداة */
          var __ts = String(ev.think.s).slice(0, 1200);
          var __tm = Date.now() - __tLast; __tLast = Date.now();
          __thinks.push({ t: 'think', ms: __tm, s: __ts }); __seq.push(__thinks[__thinks.length - 1]); /* محفوظًا مطويًّا: «فكّر N ث ›» يُفتح بالضغط */
          if (typeof window.__omranThinkNote === 'function') { try { window.__omranThinkNote({ s: __ts, ms: __tm, t0: __t0 }); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:think'); } }
        }
        if (ev.status && /^↳/.test(String(ev.status)) && !/^↳\s*💭/.test(String(ev.status)) && __steps.length < 24) {
          var __tt = String((typeof tStatus === 'function') ? tStatus(ev) : ev.status).replace(/^↳\s*/, '');
          __moveSeg(); /* v-interleave-fix: ما كُتب قبل الخطوة سطر قبلها في السجلّ */
          __steps.push({ t: 'tool', name: String(ev.tool || ev.k || ''), title: __tt, cmd: String(ev.cmd || ''), out: String(ev.out || ''), err: (ev.err || /Fail|Err/.test(String(ev.k || ''))) ? 1 : 0, g: 0 }); /* v-interleave-fix: التجميع باسم الأداة لا بمفتاح الترجمة، والفشل أحمر بحكم الخادم */
          var __st = __steps[__steps.length - 1]; __seq.push(__st); __tLast = Date.now();
          if (ev.code && typeof ev.code === 'object') { __st.code = ev.code; __st.g = 1; __st.title = String(ev.code.p || __tt) + '  ' + ev.code.a + '–' + ev.code.b; } /* v-read-panel: يُحفظ مع الخطوة فتعمل الأرقام بعد إعادة التحميل · v-work-log: عنوان قراءة الملفّ مساره وأسطره */
          if (typeof window.__omranThinkNote === 'function') { try { window.__omranThinkNote({ step: __st, t0: __t0 }); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:step'); } }
        }
        if (ev.code && typeof ev.code === 'object' && __rp) { try { __rp.live(ev.code); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:read-live'); } }
        if (ev.clientTool) { __toolBusy = true; serveClientTool(ev.clientTool, __rc); }
        if (ev.delta) {
          if (!__tFirst) __tFirst = Date.now();
          noteEnd(onDelta && onDelta.__status);
          full += ev.delta;
          if (onDelta) { try { onDelta(full); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:delta'); } }
        }
        // patch: الخادم نقّى الردّ كاملًا (روابط مخترعة من الذاكرة تُحذف قبل
        // العرض النهائي). كان يُهمَل هنا فتبقى الروابط المحذوفة ظاهرة للمستخدم.
        if (typeof ev.patch === 'string' && ev.patch.trim()) {
          full = ev.patch;
          __moved.forEach(function (m) { var mi = full.indexOf(m); if (mi !== -1) full = full.slice(0, mi) + full.slice(mi + m.length); }); /* v-interleave-fix: الردّ المنقّى بلا ما نُقل للسجلّ */
          full = full.replace(/^\s+/, ''); __segFrom = full.length;
          if (onDelta) { try { onDelta(full); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:patch'); } }
        }
        if (Array.isArray(ev.sources)) {
          ev.sources.forEach(function (s) {
            if (s && s.url && !__srcAcc.some(function (x) { return x.url === s.url; })) __srcAcc.push(s);
          });
        }
        if (ev.cards && typeof ev.cards === 'object') __cards = ev.cards; /* v-cards */
        if (ev.error) serverErr = ev.error;
        if (ev.error && ev.limit === true) __planLimit = true;
        if (ev.error && ev.ownerStop === true) __ownerStop = true;
        if (typeof ev.tier === 'string' && ev.tier) __tier = ev.tier;
        if (typeof ev.modelLabel === 'string') __model = ev.modelLabel;
        if (typeof ev.served === 'string' && ev.served) __served = ev.served;
        /* v-oa-models: موديل مختار رفضه المفتاح → يُمسح من الاختيار المحفوظ (يعود للافتراضيّ) فلا يتكرّر الرفض مع كلّ رسالة */
        if (ev.deadModel && window.omranForgetModel) { try { window.omranForgetModel(ev.prov || provider || 'claude', ev.deadModel); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:forget-model'); } }
      }
    }
    noteEnd(onDelta && onDelta.__status);

    // لا نصّ = لم يحدث شيء يُعرض؛ نرمي ليهبط المستدعي إلى مساره القديم — إلّا حدّ الباقة: لا مسار آخر يتجاوزه.
    if (!full.trim() && __moved.length) full = __moved[__moved.length - 1].trim(); /* v-interleave-fix: انتهى بأداة بلا كلام بعدها — آخر جملة هي الردّ */
    if (!full.trim()) { var __er = new Error(serverErr || 'chat: empty reply'); if (__ownerStop) __er.ownerStop = true; if (__planLimit) __er.planLimit = true; __er.log = __logNow(); throw __er; } /* v-interleave-fix: السجلّ يبقى مع الخطأ */
    /* v-claude-code-level C3 (المالك: «ما يعطيني شي»): سبب توقّف المالك بعد نصّ (خطأ بعد التمهيد، قطع لطوله، مهلة، رفض) كان يضيع —
       يُلحق تحت الردّ. ownerStop لا يرسله الخادم إلّا للمالك، فغيره كما كان. ردّ قُطع داخل كتلة كود (سياج لم يُغلق) يُغلَق سياجه
       قبل السطر — وإلّا صار السبب جزءًا من الكود المستخرَج (extractReplyRaw) — ويُعلَّم fenceCut ليعرف المستدعي أنّه مقطوع. */
    var __fenceCut = false;
    if (__ownerStop && serverErr) { __fenceCut = ((full.match(/```/g) || []).length % 2) === 1; full = full + (__fenceCut ? '\n```' : '') + '\n\n⚠️ ' + serverErr; if (onDelta) { try { onDelta(full); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:owner-note'); } } }
    var __p = provider || 'claude';
    if (__rp) { try { __rp.pack(__steps, full); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:read-pack'); } } /* v-read-panel: سقف حجم المقاطع المحفوظة */
    window.__genImages = __rc.imgs; /* v-img-run-bind: المستدعي يستبدل رموز الكود (substUserImage) بصور هذا الطلب لا طلب محادثة أخرى */
    var __log = __logNow(); /* v-work-log: بترتيب الوصول، وأوّله مدّة العمل كلّه (v-interleave-fix: كانت حتّى أوّل حرف فـ«عمل ٣ث» لشغل ٣ دقائق) */
    return { reply: full, providerKey: __p, switched: false, requestedKey: __p, model: __model || undefined, served: __served || undefined, sources: __srcAcc.length ? __srcAcc.slice(0, 10) : undefined, tier: __tier || undefined, log: __log, fenceCut: __fenceCut || undefined, cards: __cards || undefined };
  };
})();

// v478: «استوديو الإعلانات» — صفحة مستقلّة (ad-studio.html). زرّ في مجموعة الإبداع.
(function(){
  var b=document.getElementById('btnAdStudio');
  if(b) b.addEventListener('click', function(){ location.href='/ad-studio.html'; });
})();

/* شاشة «ذاكرتي»: عرض الذاكرة المرتبطة بالحساب وتعديلها وحذفها من أي جهاز. */
(function(){
  function tok(){ try{ return sessionStorage.getItem('aiapp_auth_token') || localStorage.getItem('aiapp_auth_token') || ''; }catch(e){ return ''; } }
  function tr(k, fb){ try{ var d = window.__i18nDict ? window.__i18nDict(document.documentElement.lang || 'ar') : null; return (d && d[k]) || fb; }catch(e){ return fb; } }
  function memCall(op, extra){
    var t = tok(); if(!t) return Promise.resolve(null);
    var payload = Object.assign({ token: t, op: op }, extra || {});
    return fetch('/api/system?action=memory', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
  }
  function status(text, bad){
    var el = document.getElementById('memoryStatus'); if(!el) return;
    el.textContent = text || ''; el.style.color = bad ? '#e05555' : '';
  }
  function render(){
    var box = document.getElementById('memoryBox'), clear = document.getElementById('memoryClearBtn'), save = document.getElementById('memorySaveBtn');
    if(!box) return;
    status('');
    if(!tok()){
      box.value = ''; box.placeholder = tr('memoryGuest', 'سجّل دخولك لعرض ذاكرتك.'); box.disabled = true;
      if(clear) clear.style.display = 'none'; if(save) save.style.display = 'none'; return;
    }
    box.disabled = true; box.value = ''; box.placeholder = '…';
    if(save) save.style.display = ''; if(clear) clear.style.display = 'none';
    memCall('get').then(function(d){
      if(!d){ box.placeholder = tr('memoryLoadError', 'تعذّر تحميل الذاكرة الآن.'); status(box.placeholder, true); return; }
      var txt = typeof d.memory === 'string' ? d.memory.trim() : '';
      box.disabled = false; box.value = txt; box.placeholder = tr('memoryEmpty', 'لا توجد معلومات محفوظة عنك بعد.');
      if(clear) clear.style.display = txt ? '' : 'none';
      if(window.setUserMemory) window.setUserMemory(txt);
    });
  }
  window.renderMemorySection = render;
  document.addEventListener('click', function(e){
    var save = e.target && e.target.closest ? e.target.closest('#memorySaveBtn') : null;
    if(save){
      var box = document.getElementById('memoryBox'); if(!box || box.disabled) return;
      save.disabled = true; status('…');
      memCall('set', { memory: box.value }).then(function(d){
        save.disabled = false;
        if(!d){ status(tr('memorySaveError', 'تعذّر الحفظ. حاول مرة أخرى.'), true); return; }
        box.value = d.memory || ''; if(window.setUserMemory) window.setUserMemory(box.value);
        status(tr('memorySaved', 'حُفظت وتزامنت مع حسابك.'));
        var clear = document.getElementById('memoryClearBtn'); if(clear) clear.style.display = box.value.trim() ? '' : 'none';
      });
      return;
    }
    var clear = e.target && e.target.closest ? e.target.closest('#memoryClearBtn') : null;
    if(clear){
      if(!confirm(tr('memoryConfirm', 'حذف كلّ ما يتذكّره التطبيق عنك؟ لا يمكن التراجع.'))) return;
      clear.disabled = true;
      memCall('clear').then(function(d){
        clear.disabled = false;
        if(!d){ status(tr('memorySaveError', 'تعذّر الحذف. حاول مرة أخرى.'), true); return; }
        if(window.setUserMemory) window.setUserMemory(''); render();
      });
      return;
    }
    setTimeout(function(){
      var s = document.getElementById('memorySection'); if(!s) return;
      if(s.classList.contains('settingsPageActive')){ if(s.dataset.memOn !== '1'){ s.dataset.memOn = '1'; render(); } }
      else s.dataset.memOn = '';
    }, 60);
  }, true);
})();

/* v-living-memory + v-living-all (طلب المالك ٤ أكتوبر): «ذاكرتي الحيّة» في إعدادات «ذاكرتي» لكلّ مستخدم مسجَّل — آخر ١٠ حقائق
   تعلّمها المساعد عنه، وزرّ «امسح» لكلّ واحدة، و«امسح كل شي». المصدر Redis عبر memory.js (living_*، ملفّ صاحب الجلسة وحده)،
   ونسخة في localStorage تُرسم فورًا وتبقى إن تعذّر الخادم — موسومة باسم صاحبها فلا يراها مستخدم آخر على الجهاز نفسه.
   livingLearn يُستدعى بعد اكتمال الردّ: طلب منفصل لا يؤخّر ختام البثّ، والخادم يتخطّى ما لا يستحقّ نداء نموذج. */
(function(){
  var KEY = 'aiapp_living_memory', lastLearnAt = 0;
  function tok(){ try{ return sessionStorage.getItem('aiapp_auth_token') || localStorage.getItem('aiapp_auth_token') || ''; }catch(e){ return ''; } }
  function tr(k, fb){ try{ var d = window.__i18nDict ? window.__i18nDict(document.documentElement.lang || 'ar') : null; return (d && d[k]) || fb; }catch(e){ return fb; } }
  function call(op, extra){
    var t = tok(); if(!t) return Promise.resolve(null);
    return fetch('/api/system?action=memory', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(Object.assign({ token: t, op: op }, extra || {})) })
      .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
  }
  function who(){ try{ return String(sessionStorage.getItem('aiapp_username') || localStorage.getItem('aiapp_username') || '').trim().toLowerCase(); }catch(e){ return ''; } }
  function readMirror(){
    try{
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if(d && d.u === who() && Array.isArray(d.facts)) return d.facts;
      if(d) localStorage.removeItem(KEY); // نسخة مستخدم آخر على هذا الجهاز — لا تُعرض ولا تبقى
      return [];
    }catch(e){ return []; }
  }
  function writeMirror(facts){ try{ localStorage.setItem(KEY, JSON.stringify({ u: who(), at: Date.now(), facts: facts })); }catch(e){ if(window.__swallow) window.__swallow(e, 'living:mirror'); } }
  function status(text, bad){ var el = document.getElementById('livingMemStatus'); if(!el) return; el.textContent = text || ''; el.style.color = bad ? '#e05555' : ''; }
  function draw(facts){
    var box = document.getElementById('livingMemList'); if(!box) return;
    box.textContent = '';
    var all = document.getElementById('livingMemClearAll');
    var shown = (facts || []).slice().sort(function(a, b){ return (b.at || 0) - (a.at || 0); }).slice(0, 10);
    if(all) all.style.display = shown.length ? '' : 'none';
    if(!shown.length){
      var empty = document.createElement('div'); empty.style.cssText = 'padding:8px 2px; font-size:12.5px; opacity:.75;';
      empty.textContent = tr('livingMemEmpty', 'لم يتعلّم المساعد شيئًا عنك بعد.'); box.appendChild(empty); return;
    }
    shown.forEach(function(f){
      var row = document.createElement('div'); row.className = 'livingMemRow'; row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid var(--border);';
      var txt = document.createElement('div'); txt.style.cssText = 'flex:1; min-width:0; font-size:13px; line-height:1.7; word-break:break-word;'; txt.textContent = f.text;
      var del = document.createElement('button'); del.type = 'button'; del.setAttribute('data-living-del', f.id); del.textContent = tr('livingMemDelete', 'امسح');
      del.style.cssText = 'flex:none; padding:5px 12px; border-radius:var(--r-2); border:1px solid var(--border); background:var(--panel); color:var(--text); font-size:12px; cursor:pointer;';
      row.appendChild(txt); row.appendChild(del); box.appendChild(row);
    });
  }
  window.livingRefresh = function(){
    var wrap = document.getElementById('livingMemWrap');
    if(wrap) wrap.style.display = tok() ? '' : 'none'; // الزائر بلا حساب: لا بطاقة
    if(!tok()) return;
    draw(readMirror()); status('');
    call('living_get').then(function(d){
      if(!d || !Array.isArray(d.facts)){ status(tr('livingMemLoadError', 'تعذّر تحميل ذاكرتك الحيّة الآن.'), true); return; } // ردّ بلا قائمة لا يمحو المرآة
      writeMirror(d.facts); draw(d.facts);
    });
  };
  window.livingLearn = function(messages){
    if(!tok() || Date.now() - lastLearnAt < 8000) return; // نفس حدّ الخادم (MIN_LEARN_GAP_MS): لا طلب يضيع في الطريق
    var win = (messages || []).filter(function(m){ return m && (m.role === 'user' || m.role === 'assistant') && !m._diag && !m._cc && typeof m.content === 'string' && m.content.trim(); })
      .slice(-20).map(function(m){ return { role: m.role, content: m.content.replace(/```[\s\S]*?(?:```|$)/g, ' ').slice(0, 700) }; });
    if(!win.length) return;
    lastLearnAt = Date.now();
    call('living_learn', { messages: win }).then(function(d){ if(d && Array.isArray(d.facts)) writeMirror(d.facts); });
  };
  document.addEventListener('click', function(e){
    var t = e.target, b = t && t.closest ? t.closest('[data-living-del]') : null, all = t && t.closest ? t.closest('#livingMemClearAll') : null;
    if(!b && !all) return;
    if(all && !confirm(tr('livingMemClearConfirm', 'مسح كلّ ما تعلّمه المساعد عنك؟ لا يمكن التراجع.'))) return;
    var btn = b || all; btn.disabled = true;
    call(b ? 'living_del' : 'living_clear', b ? { id: b.getAttribute('data-living-del') } : {}).then(function(d){
      btn.disabled = false;
      if(!d || !Array.isArray(d.facts)){ status(tr('livingMemDeleteError', 'تعذّر المسح. حاول مرّة أخرى.'), true); return; }
      writeMirror(d.facts); draw(d.facts); status('');
    });
  });
})();
