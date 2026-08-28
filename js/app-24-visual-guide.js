/* ================================================================
   المرشد البصري — Visual Guide  (v701)
   ================================================================
   شريحة حزمة مستقلة: js/app-24-visual-guide.js
   تُدمج تلقائيًا عبر `npm run bundle` (تطابق النمط app-NN-*.js).

   ستة أوضاع («عين عمران»):
     describe  — وصف مستمر للمحيط (التقاط ذكي حسب تغيّر المشهد)
     read      — قراءة النصوص واللافتات حرفيًا
     steps     — إرشاد خطوة بخطوة مع ذاكرة الخطوات السابقة
     translate — ترجمة أي نص تراه الكاميرا للغة المستخدم (لمسة = التقاط)
     ask       — اسأل عمّا تراه: خبير فوري لأي شيء أمام الكاميرا
     tour      — جولة داخل التطبيق (بلا كاميرا)

   الالتزامات المعمارية:
   · لا تحرير لأي ملف قائم — كل شيء هنا وفي css/visual-guide.css
   · لا `catch {}` فارغة (قاعدة guard.mjs ج)
   · لا قراءة عارية وقت التحميل لاسم يُعرَّف في شريحة لاحقة (قاعدة د)
   · يعتمد على: callGemini (app-06) · speakSmart/stopAllSpeaking (app-02)
     · __swallow (بذرة index.html) — كلها أسبق في ترتيب الدمج
   ================================================================ */
(function omranVisualGuide() {

  /* ---------------- إعدادات ---------------- */

  var CFG = {
    tickMs: 4000,          // كل كم يفحص المشهد محليًا (مجاني)
    minGapMs: 9000,        // أقل فاصل بين نداءين فعليين للنموذج
    maxSilenceMs: 26000,   // أقصى صمت مسموح — بعده يصف حتى لو لم يتغيّر المشهد
    diffThreshold: 0.10,   // نسبة البكسل المتغيّر التي تعني «مشهد جديد»
    maxDim: 1024,          // أقصى بُعد للإطار المرسل
    jpegQ: 0.82,
    probeSize: 48          // مقاس صورة المقارنة المصغّرة
  };

  var S = {
    open: false,
    mode: 'describe',
    stream: null,
    timer: null,
    busy: false,
    lastCallAt: 0,
    lastProbe: null,
    stepNo: 0,
    history: [],
    speakOn: true,
    torch: false,
    request: null,
    recognition: null,
    epoch: 0
  };

  /* ---------------- أدوات صغيرة ---------------- */

  function $id(id) { return document.getElementById(id); }

  function isAr() {
    var d = document.documentElement.getAttribute('dir');
    return d !== 'ltr';
  }

  function t(ar, en) { return isAr() ? ar : en; }

  function authToken() {
    try { return typeof authGet === 'function' ? authGet('aiapp_auth_token') : null; }
    catch (e) { return null; }
  }
  function guestId() {
    try { return typeof window.getGuestId === 'function' ? window.getGuestId() : null; }
    catch (e) { return null; }
  }
  function cancelPending() {
    if (S.request && typeof S.request.abort === 'function') {
      try { S.request.abort(); } catch (e) { __swallow(e, 'vg:abort'); }
    }
    S.request = null;
  }
  function stopListening() {
    if (S.recognition && typeof S.recognition.stop === 'function') {
      try { S.recognition.stop(); } catch (e) { __swallow(e, 'vg:stop-listening'); }
    }
    S.recognition = null;
  }

  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 30); }
    catch (e) { /* الاهتزاز رفاهية — غيابه لا يعطّل شيئًا */ }
  }

  /** يعلن نصًا لقارئ الشاشة وينطقه إن كان الصوت مفعّلًا */
  function announce(text, speak) {
    var live = $id('vgLive');
    if (live) live.textContent = text;
    if (speak && S.speakOn && typeof speakSmart === 'function') {
      try { speakSmart(text); }
      catch (e) { __swallow(e, 'vg:speak'); }
    }
  }

  function setStatus(text) {
    var el = $id('vgStatus');
    if (el) el.textContent = text;
  }

  function setResult(text) {
    var el = $id('vgResult');
    if (!el) return;
    el.textContent = text;
    el.scrollTop = 0;
  }

  function shutUp() {
    if (typeof stopAllSpeaking === 'function') {
      try { stopAllSpeaking(); }
      catch (e) { __swallow(e, 'vg:stopspeak'); }
    }
  }

  /* ---------------- الكاميرا ---------------- */

  async function camOn() {
    if (S.stream) return true;
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false
      });
    } catch (e) {
      console.error('[visual-guide] camera denied:', e);
      announce(t(
        'تعذّر فتح الكاميرا. افتح الإعدادات واسمح للتطبيق باستخدام الكاميرا.',
        'Camera unavailable. Please allow camera access in settings.'
      ), true);
      return false;
    }
    var v = $id('vgVideo');
    if (v) {
      v.srcObject = S.stream;
      v.setAttribute('playsinline', '');
      try { await v.play(); }
      catch (e) { __swallow(e, 'vg:play'); }
    }
    return true;
  }

  function camOff() {
    if (S.stream) {
      try { S.stream.getTracks().forEach(function (tr) { tr.stop(); }); }
      catch (e) { __swallow(e, 'vg:camoff'); }
      S.stream = null;
    }
    var v = $id('vgVideo');
    if (v) v.srcObject = null;
    S.torch = false;
    var b = $id('vgTorch');
    if (b) b.classList.remove('on');
  }

  async function toggleTorch() {
    if (!S.stream) return;
    var track = S.stream.getVideoTracks()[0];
    if (!track) return;
    var caps = {};
    try { caps = track.getCapabilities ? track.getCapabilities() : {}; }
    catch (e) { __swallow(e, 'vg:caps'); }
    if (!caps.torch) {
      announce(t('الإضاءة غير مدعومة على هذا الجهاز.', 'Torch not supported on this device.'), true);
      return;
    }
    S.torch = !S.torch;
    try { await track.applyConstraints({ advanced: [{ torch: S.torch }] }); }
    catch (e) { __swallow(e, 'vg:torch'); }
    var b = $id('vgTorch');
    if (b) b.classList.toggle('on', S.torch);
  }

  /* ---------------- الالتقاط ---------------- */

  function grabCanvas(maxDim) {
    var v = $id('vgVideo');
    if (!v || !v.videoWidth) return null;
    var scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(v.videoWidth * scale));
    c.height = Math.max(1, Math.round(v.videoHeight * scale));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c;
  }

  function grabFrame() {
    var c = grabCanvas(CFG.maxDim);
    return c ? c.toDataURL('image/jpeg', CFG.jpegQ) : null;
  }

  /*
   * بوّابة التكلفة: قبل أي نداء للنموذج نقارن إطارًا مصغّرًا جدًا
   * (48×48 رمادي) بالإطار السابق محليًا. إن لم يتغيّر المشهد فعليًا
   * لا نُنفق نداءً. هذا يحوّل «وصف مستمر» من ٦٠ نداءً في الدقيقة
   * إلى بضعة نداءات عند الحركة الحقيقية فقط.
   */
  function sceneProbe() {
    var c = grabCanvas(CFG.probeSize);
    if (!c) return null;
    var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    var gray = new Uint8Array(c.width * c.height);
    for (var i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    }
    return gray;
  }

  function sceneChanged() {
    var now = sceneProbe();
    if (!now) return false;
    var prev = S.lastProbe;
    S.lastProbe = now;
    if (!prev || prev.length !== now.length) return true;
    var diff = 0;
    for (var i = 0; i < now.length; i++) {
      if (Math.abs(now[i] - prev[i]) > 26) diff++;
    }
    return (diff / now.length) > CFG.diffThreshold;
  }

  /* ---------------- التوجيهات لكل وضع ---------------- */

  function systemFor(mode) {
    var common = 'أنت عين لشخص كفيف أو ضعيف البصر ينظر عبر كاميرا هاتفه. '
      + 'أجب بلغة السؤال نفسها. اكتب نصًا منطوقًا: بلا رموز، بلا نقاط تعداد، بلا مقدمات، بلا وصف لنفسك. ';

    if (mode === 'read') {
      return common
        + 'مهمتك الآن القراءة الحرفية: اقرأ كل نص ظاهر في الصورة كما هو تمامًا — '
        + 'الأدوية والجرعات، الفواتير والمبالغ، اللافتات، القوائم، التواريخ، أرقام الهواتف. '
        + 'لا تلخّص ولا تعيد الصياغة. إن كان النص بلغة أخرى فاقرأه ثم ترجمه في جملة واحدة. '
        + 'إن لم يكن هناك نص واضح فقل ذلك في جملة واحدة واقترح تقريب الكاميرا أو تثبيتها.';
    }
    if (mode === 'steps') {
      return common
        + 'أنت ترشده في مهمة عملية خطوة بخطوة وأنت ترى يديه. '
        + 'قل ما يفعله الآن في جملة أو جملتين فقط — الخطوة الحالية لا الخطة كلها. '
        + 'إن رأيت خطأ أو خطرًا نبّه فورًا وبوضوح قبل أي شيء آخر. '
        + 'إن اكتملت الخطوة فقل ذلك وانتقل للتالية. كن موجزًا: هذا كلام منطوق أثناء العمل.';
    }
    return common
      + 'صف المشهد بإيجاز عملي: أهم ثلاثة عناصر ومواضعها بالنسبة له (يمينك، يسارك، أمامك مباشرة، على بعد خطوتين). '
      + 'ابدأ بأي خطر أو عائق إن وُجد — درج، عتبة، باب مفتوح، سيارة، حفرة. '
      + 'اذكر أي نص بارز باختصار. جملتان إلى ثلاث كحد أقصى.';
  }

  function userFor(mode, question) {
    if (question) return question;
    if (mode === 'read') return 'اقرأ لي كل ما هو مكتوب هنا.';
    if (mode === 'translate') return 'ترجم لي كل النص الظاهر هنا.';
    if (mode === 'ask') return 'ما هذا الذي أمامي؟ أجب باختصار مفيد.';
    if (mode === 'steps') {
      S.stepNo++;
      var tail = S.history.length
        ? ' سبق أن قلتَ لي: «' + S.history.slice(-2).join(' ثم ') + '». ماذا أفعل الآن؟'
        : ' ما أول خطوة؟';
      return 'أنا في الخطوة رقم ' + S.stepNo + '.' + tail;
    }
    return 'صف لي ما أمامي الآن.';
  }

  /* ---------------- النداء ---------------- */

  async function analyze(question) {
    if (S.busy || !S.open || !S.stream) return;
    var frame = grabFrame();
    if (!frame) { setStatus(t('لم تثبت الصورة بعد…', 'Stabilising…')); return; }
    var epoch = S.epoch;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    S.request = controller; S.busy = true; S.lastCallAt = Date.now();
    setStatus(t('أنظر…', 'Looking…'));
    var shell = $id('vgShell'); if (shell) shell.classList.add('vg-busy');
    try {
      var response = await fetch('/api/ai?action=visual-guide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller ? controller.signal : undefined,
        body: JSON.stringify({ image: frame, token: authToken(), guestId: guestId(), lang: isAr() ? 'ar' : 'en', mode: S.mode, question: userFor(S.mode, question) })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) { var error = new Error(data.error || ('http_' + response.status)); error.status = response.status; throw error; }
      if (epoch !== S.epoch || !S.open) return;
      var text = String(data.text || '').trim();
      if (!text) setStatus(t('لم أتبيّن شيئًا — قرّب الكاميرا.', 'Nothing clear — move closer.'));
      else {
        setResult(text); setStatus('');
        if (S.mode === 'steps') { S.history.push(text.slice(0, 160)); if (S.history.length > 6) S.history.shift(); }
        buzz(20); announce(text, true);
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (epoch !== S.epoch || !S.open) return;
      console.error('[visual-guide] vision failed:', e);
      if ((e && e.status === 429) || /limit|quota|429/i.test(String((e && e.message) || ''))) {
        setStatus(t('انتهت حصة المرشد اليوم.', 'Visual Guide daily limit reached.'));
        announce(t('انتهت حصة المرشد البصري اليوم. تعود غدًا.', 'Your Visual Guide allowance is used for today. It resets tomorrow.'), true);
        stopLoop();
      } else setStatus(t('تعذّر التحليل — أعد المحاولة.', 'Analysis failed — try again.'));
    } finally {
      if (S.request === controller) S.request = null;
      if (epoch === S.epoch) { S.busy = false; if (shell) shell.classList.remove('vg-busy'); }
    }
  }

  /* ---------------- الحلقة المختلطة ---------------- */

  function tick() {
    if (!S.open || S.busy || S.mode === 'tour') return;

    var since = Date.now() - S.lastCallAt;
    if (since < CFG.minGapMs) return;

    // بوّابة التكلفة: لا ننفق نداءً على مشهد لم يتغيّر…
    var changed = sceneChanged();

    // …إلا أن الصمت الطويل نفسه مقلق لمن لا يرى. نبضة اطمئنان
    // بعد maxSilenceMs حتى لو كان المشهد ساكنًا تمامًا.
    if (!changed && since < CFG.maxSilenceMs) return;

    analyze(null);
  }

  function startLoop() {
    stopLoop();
    S.lastProbe = null;
    S.timer = setInterval(tick, CFG.tickMs);
    var b = $id('vgAuto');
    if (b) b.classList.add('on');
  }

  function stopLoop() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    var b = $id('vgAuto');
    if (b) b.classList.remove('on');
  }

  function autoOn() { return !!S.timer; }

  /* ---------------- الأوضاع ---------------- */

  var MODE_LABEL = {
    describe: ['وصف المحيط', 'Describe'],
    read: ['قراءة نص', 'Read text'],
    steps: ['خطوة بخطوة', 'Step by step'],
    translate: ['ترجمة فورية', 'Live translate'],
    ask: ['اسأل عمّا تراه', 'Ask about it'],
    tour: ['جولة التطبيق', 'App tour']
  };

  async function setMode(mode) {
    if (!MODE_LABEL[mode]) return;
    var modeEpoch = ++S.epoch;
    cancelPending();
    stopListening();
    S.mode = mode;
    S.history = [];
    S.stepNo = 0;
    S.lastProbe = null;
    shutUp();

    document.querySelectorAll('.vgModeBtn').forEach(function (b) {
      var on = b.getAttribute('data-vgmode') === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    var shell = $id('vgShell');
    if (shell) shell.setAttribute('data-mode', mode);

    if (mode === 'tour') {
      stopLoop();
      camOff();
      startTour();
      return;
    }

    if (shell) shell.classList.remove('vg-tour');
    var ok = await camOn();
    if (modeEpoch !== S.epoch || !S.open) { camOff(); return; }
    if (!ok) return;

    setResult('');
    /* v-eye-hint: التعليمة كانت صوتية فقط (#vgLive مقصوص لقارئات الشاشة) —
       جوال صامت = مستخدم يبدّل الوضع ولا يرى شيئًا فيظنه معطوبًا (شكوى
       عمران: «القراءة وما بعدها لا يعمل»). الآن تظهر مكتوبة في شريط الحالة. */
    if (mode === 'describe') {
      startLoop();
      setStatus(t('أراقب وأصف تلقائيًا — والمس الشاشة لسؤال فوري.', 'Watching and describing — tap the screen to ask now.'));
      announce(t(
        'وضع وصف المحيط. حرّك الهاتف ببطء وسأصف لك ما يتغيّر. اضغط على الشاشة لسؤال فوري.',
        'Describe mode. Move slowly and I will describe what changes. Tap the screen to ask now.'
      ), true);
    } else if (mode === 'read') {
      stopLoop();
      setStatus(t('👆 وجّه الكاميرا إلى النص ثم المس الشاشة لألتقط وأقرأ.', '👆 Point at the text, then tap the screen to capture.'));
      announce(t(
        'وضع القراءة. وجّه الكاميرا إلى النص ثم اضغط على الشاشة.',
        'Read mode. Point at the text, then tap the screen.'
      ), true);
    } else if (mode === 'translate') {
      stopLoop();
      setStatus(t('👆 وجّه الكاميرا إلى أي نص ثم المس الشاشة وسأترجمه.', '👆 Point at any text, then tap the screen to translate.'));
      announce(t(
        'وضع الترجمة. وجّه الكاميرا إلى أي نص — لافتة أو قائمة أو عبوة — ثم اضغط على الشاشة وسأترجمه لك.',
        'Translate mode. Point at any text — a sign, menu or package — then tap the screen and I will translate it.'
      ), true);
    } else if (mode === 'ask') {
      stopLoop();
      setStatus(t('👆 المس الشاشة، أو اضغط زر الميكروفون واسأل بصوتك.', '👆 Tap the screen, or press the mic button and ask by voice.'));
      announce(t(
        'وضع السؤال. وجّه الكاميرا إلى أي شيء ثم اضغط على الشاشة، أو اضغط زر الميكروفون واسأل بصوتك.',
        'Ask mode. Point at anything then tap the screen, or press the microphone button and ask by voice.'
      ), true);
    } else if (mode === 'steps') {
      startLoop();
      setStatus(t('أرشدك تلقائيًا خطوة بخطوة — أرني ما بين يديك.', 'Guiding you step by step — show me your hands.'));
      announce(t(
        'وضع الإرشاد خطوة بخطوة. أرني ما بين يديك وسأرشدك.',
        'Step by step mode. Show me your hands and I will guide you.'
      ), true);
    }
  }

  /* ---------------- جولة داخل التطبيق ---------------- */

  var TOUR = [
    { sel: 'header', ar: 'هذا شريط علوي فيه اسم التطبيق وقائمة الخيارات على الطرف.', en: 'The top bar: app name and the options menu at the edge.' },
    { sel: '#messages', ar: 'هذه منطقة المحادثة. كل ما تكتبه ويرد به الذكاء يظهر هنا.', en: 'The chat area. Everything you and the AI say appears here.' },
    { sel: '#composerBox', ar: 'هنا تكتب طلبك. اكتب ما تريد بناءه أو اسأل أي سؤال.', en: 'Type your request here — what to build, or any question.' },
    { sel: '#btnMaha', ar: 'هذا زر مها، المساعدة الصوتية. اضغطه لتتحدث معها بصوتك، ويمكنك سحبه لأي مكان.', en: 'This is Maha, the voice assistant. Tap to talk, drag to move it.' },
    { sel: '[data-omnav="guide"]', ar: 'وهذا المرشد البصري الذي تستخدمه الآن — عينك على ما حولك.', en: 'This is the Visual Guide you are using now — your eyes on the world.' },
    { sel: '[data-omnav="chats"]', ar: 'المحادثات: كل مشاريعك ومحادثاتك السابقة محفوظة هنا.', en: 'Chats: all your saved projects and past conversations.' },
    { sel: '[data-omnav="settings"]', ar: 'الإعدادات: اللغة والصوت والحساب. تجد اللغة العربية وثلاث عشرة لغة أخرى.', en: 'Settings: language, voice and account.' }
  ];

  var tourIdx = 0;

  function clearTourHighlight() {
    document.querySelectorAll('.vg-tour-target').forEach(function (el) {
      el.classList.remove('vg-tour-target');
    });
  }

  function tourStep(i) {
    clearTourHighlight();
    if (i < 0 || i >= TOUR.length) { endTour(); return; }
    tourIdx = i;
    var step = TOUR[i];
    var el = document.querySelector(step.sel);
    /* v-wiring-sweep: بعض المحدّدات ([data-omnav]) لها نسختان — شريط الجوال
       وشريط الكمبيوتر المخفي. querySelector يرجع الأولى في الـDOM وهي المخفية
       على الجوال (حجمها صفر) فتضيع حلقة الجولة. نلتقط الظاهرة فعلًا. */
    if (el && !el.offsetParent) {
      var cands = document.querySelectorAll(step.sel);
      for (var ci = 0; ci < cands.length; ci++) {
        if (cands[ci].offsetParent) { el = cands[ci]; break; }
      }
    }
    var text = isAr() ? step.ar : step.en;

    if (el) {
      el.classList.add('vg-tour-target');
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      catch (e) { __swallow(e, 'vg:scroll'); }
    }
    setResult(text);
    setStatus(t('خطوة ', 'Step ') + (i + 1) + ' / ' + TOUR.length);
    announce(text, true);
    buzz(15);
  }

  function startTour() {
    var shell = $id('vgShell');
    if (shell) shell.classList.add('vg-tour');
    tourStep(0);
  }

  function endTour() {
    clearTourHighlight();
    var shell = $id('vgShell');
    if (shell) shell.classList.remove('vg-tour');
    setStatus('');
    setMode('describe');
  }

  /* ---------------- سؤال بالصوت ---------------- */

  function askByVoice() {
    stopListening();
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { var typed = window.prompt(t('اكتب سؤالك:', 'Type your question:')); if (typed) analyze(typed); return; }
    var rec = new SR(); S.recognition = rec;
    rec.lang = isAr() ? 'ar-SA' : 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    setStatus(t('أسمعك…', 'Listening…')); buzz(40);
    rec.onresult = function (ev) {
      if (!S.open || S.recognition !== rec) return;
      var q = (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
      if (q) analyze(q); else setStatus('');
    };
    rec.onerror = function (ev) { if (S.open && S.recognition === rec) { setStatus(t('لم أسمع شيئًا.', 'Did not catch that.')); console.warn('[visual-guide] speech error:', ev && ev.error); } };
    rec.onend = function () { if (S.recognition === rec) S.recognition = null; if (S.open && !S.busy) setStatus(''); };
    try { rec.start(); } catch (e) { __swallow(e, 'vg:sr'); S.recognition = null; }
  }

  /* ---------------- فتح وإغلاق ---------------- */

  async function open(mode) {
    var shell = $id('vgShell');
    if (!shell) return;
    S.epoch++;
    cancelPending();
    stopListening();
    S.open = true;
    shell.classList.add('show');
    shell.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('vg-open');
    await setMode(mode || 'describe');
    var first = document.querySelector('.vgModeBtn.active');
    if (first) first.focus();
  }

  function close() {
    S.epoch++;
    cancelPending();
    stopListening();
    S.busy = false;
    S.open = false;
    stopLoop();
    camOff();
    shutUp();
    clearTourHighlight();
    var shell = $id('vgShell');
    if (shell) {
      shell.classList.remove('show', 'vg-tour');
      shell.setAttribute('aria-hidden', 'true');
    }
    document.documentElement.classList.remove('vg-open');
  }

  /* ---------------- التوصيل ---------------- */

  function wire() {
    var shell = $id('vgShell');
    if (!shell || shell.getAttribute('data-wired') === '1') return;
    shell.setAttribute('data-wired', '1');

    // زر الشريط السفلي (ui-wiring.js يتولّى تمييز التبويب النشط وحده)
    document.querySelectorAll('[data-omnav="guide"]').forEach(function (b) {
      b.addEventListener('click', function () { open('describe'); });
    });

    var closeBtn = $id('vgClose');
    if (closeBtn) closeBtn.addEventListener('click', close);

    document.querySelectorAll('.vgModeBtn').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-vgmode')); });
    });

    // الشاشة كلها زر التقاط — أهم قرار وصولٍ في هذه الميزة
    var stage = $id('vgStage');
    if (stage) {
      stage.addEventListener('click', function () {
        if (S.mode === 'tour') { tourStep(tourIdx + 1); return; }
        shutUp(); buzz(30); analyze(null);
      });
      stage.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); stage.click();
      });
    }

    var ask = $id('vgAsk');
    if (ask) ask.addEventListener('click', function (e) { e.stopPropagation(); askByVoice(); });

    var auto = $id('vgAuto');
    if (auto) auto.addEventListener('click', function (e) {
      e.stopPropagation();
      if (autoOn()) {
        stopLoop();
        announce(t('أوقفت الوصف التلقائي.', 'Auto description off.'), true);
      } else {
        startLoop();
        announce(t('شغّلت الوصف التلقائي.', 'Auto description on.'), true);
      }
    });

    var mute = $id('vgMute');
    if (mute) mute.addEventListener('click', function (e) {
      e.stopPropagation();
      S.speakOn = !S.speakOn;
      mute.classList.toggle('on', S.speakOn);
      if (!S.speakOn) shutUp();
      buzz(20);
    });

    var torch = $id('vgTorch');
    if (torch) torch.addEventListener('click', function (e) { e.stopPropagation(); toggleTorch(); });

    var tourPrev = $id('vgTourPrev');
    if (tourPrev) tourPrev.addEventListener('click', function () { tourStep(tourIdx - 1); });
    var tourNext = $id('vgTourNext');
    if (tourNext) tourNext.addEventListener('click', function () { tourStep(tourIdx + 1); });

    var repeat = $id('vgRepeat');
    if (repeat) repeat.addEventListener('click', function (e) {
      e.stopPropagation();
      var r = $id('vgResult');
      if (r && r.textContent.trim()) announce(r.textContent.trim(), true);
    });

    document.addEventListener('keydown', function (e) {
      if (!S.open) return;
      if (e.key === 'Escape') { close(); return; }
      if (S.mode === 'tour') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') tourStep(tourIdx + 1);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') tourStep(tourIdx - 1);
      }
    });

    // وفّر البطارية والحصّة حين يغيب التطبيق عن الشاشة
    document.addEventListener('visibilitychange', function () {
      if (!S.open) return;
      if (document.hidden) { stopLoop(); shutUp(); }
      else if (S.mode === 'describe' || S.mode === 'steps') startLoop();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }

  /* واجهة برمجية صغيرة — تسمح لمها أو لأي زر آخر بفتح المرشد */
  window.omranGuide = {
    open: open,
    close: close,
    setMode: setMode,
    ask: function (q) { return analyze(q); },
    state: function () {
      return { open: S.open, mode: S.mode, auto: autoOn(), speak: S.speakOn, busy: S.busy };
    }
  };
})();

/* v-boot-watchdog: آخر شريحة في الحزمة — وصول التنفيذ هنا يعني الحزمة كلها اشتغلت. */
window.__omranBundleOk = true;
