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

  var _step = null;
  function note(txt) {
    try {
      var s = window.__chatStatus;
      if (!s || (typeof s.isReleased === 'function' && s.isReleased()) || typeof s.step !== 'function') return;
      if (_step && typeof _step.done === 'function') _step.done();
      _step = s.step('•', String(txt).replace(/^[^\u0600-\u06FFa-zA-Z0-9]+/, '').trim() || String(txt));
    } catch (e) { /* شريط الحالة ترفٌ لا يُسقط ردًّا */ }
  }
  function noteEnd() {
    try { if (_step && typeof _step.done === 'function') _step.done(); } catch (e) { /* كسابقه */ }
    _step = null;
  }

  /** ينفّذ أداة طلبها الخادم داخل متصفّح المستخدم ويعيد ناتجها عبر نقطة منفصلة. */
  function serveClientTool(ct) {
    (async function () {
      var out;
      try {
        out = window.omranAgentTools
          ? await window.omranAgentTools.run(ct.name, ct.input)
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
  var __CHAT_IDLE_MS = 45000;   // لا بايت من الخادم هذه المدة (خارج الأدوات) = تعثّر
  var __CHAT_TOOL_MS = 295000;  // أثناء تشغيل أداة محلّيّة نترك القطع للحارس الصلب
  function __raceIdle(p, ms, tag) {
    var to;
    var timer = new Promise(function (_res, rej) { to = setTimeout(function () { rej(new Error(tag)); }, ms); });
    return Promise.race([p, timer]).finally(function () { try { clearTimeout(to); } catch (e) { /* guard-ok — تنظيف المؤقّت */ } });
  }

  window.callChatWithTools = async function (messages, onDelta, provider) {
    window.__chatVideoResult = null;
    window.__chatVideoReference = null;
    try {
      for (var mi = messages.length - 1; mi >= 0; mi--) {
        var mm = messages[mi];
        if (mm && Array.isArray(mm.images) && mm.images.length) {
          var im = mm.images[mm.images.length - 1];
          if (im && im.dataUrl) { window.__chatVideoReference = { dataUrl: im.dataUrl, mime: im.mime || 'image/png' }; break; }
        }
      }
    } catch (e) { /* guard-ok — مرجع الصورة اختياري ولا يجب أن يمنع المحادثة */ }
    // صور هذا الردّ فقط: تُمسح عند كلّ طلب جديد فلا يتراكم عشرات الميغابايت في
    // الذاكرة، وحدّ الأربع يبقى حدَّ ردٍّ لا حدَّ جلسة. الكود المبنيّ يُستبدل فيه
    // الرمز فور وصوله، فلا يضرّه المسح لاحقًا.
    window.__genImages = {};
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
    var res = await __raceIdle(fetch('/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      body: JSON.stringify({
        messages: messages,
        provider: provider || 'claude',
        // v-no-region-assume: المنطقة الزمنية الحقيقية للجهاز — الوقت في الرد بها لا بتوقيت الإمارات.
        tz: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })(),
        token: (window.authGet && window.authGet('aiapp_auth_token')) || '',
        guestId: window.getGuestId ? window.getGuestId() : '',
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
    var __srcAcc = []; /* v-one-brain: مصادر بحث النموذج نفسه — لبطاقات «المصادر» */
    var __toolBusy = false; /* أداة محلّيّة قيد التنفيذ → نطيل مهلة الخمول */

    while (true) {
      var chunk;
      try { chunk = await __raceIdle(reader.read(), __toolBusy ? __CHAT_TOOL_MS : __CHAT_IDLE_MS, '__chat_idle__'); }
      catch (e) {
        if (e && e.name === 'AbortError') throw e; /* إيقاف المستخدم أو الحارس الصلب — يمرّ كما هو */
        try { reader.cancel(); } catch (_e) { /* guard-ok — تحرير المجرى */ }
        if (full.trim()) break; /* عندنا نصّ جزئيّ — نعرضه بدل تضييعه */
        throw new Error(serverErr || 'chat: stalled — no response');
      }
      if (chunk.done) break;
      __toolBusy = false; /* وصلت بايتات جديدة من الخادم → لم نعد بانتظار أداة */
      buf += dec.decode(chunk.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('data: ') !== 0) continue;
        var ev;
        try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
        if (ev.status) note((typeof tStatus === 'function') ? tStatus(ev) : ev.status);  /* v656 */
        if (ev.clientTool) { __toolBusy = true; serveClientTool(ev.clientTool); }
        if (ev.delta) {
          noteEnd();
          full += ev.delta;
          if (onDelta) { try { onDelta(full); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:delta'); } }
        }
        // patch: الخادم نقّى الردّ كاملًا (روابط مخترعة من الذاكرة تُحذف قبل
        // العرض النهائي). كان يُهمَل هنا فتبقى الروابط المحذوفة ظاهرة للمستخدم.
        if (typeof ev.patch === 'string' && ev.patch.trim()) {
          full = ev.patch;
          if (onDelta) { try { onDelta(full); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:patch'); } }
        }
        if (Array.isArray(ev.sources)) {
          ev.sources.forEach(function (s) {
            if (s && s.url && !__srcAcc.some(function (x) { return x.url === s.url; })) __srcAcc.push(s);
          });
        }
        if (ev.error) serverErr = ev.error;
      }
    }
    noteEnd();

    // لا نصّ = لم يحدث شيء يُعرض؛ نرمي ليهبط المستدعي إلى مساره القديم.
    if (!full.trim()) throw new Error(serverErr || 'chat: empty reply');
    var __p = provider || 'claude';
    return { reply: full, providerKey: __p, switched: false, requestedKey: __p, sources: __srcAcc.length ? __srcAcc.slice(0, 10) : undefined };
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
