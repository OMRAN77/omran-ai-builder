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
  // v-idle-90 (تشخيص جهاز المالك: «٧١ ثانية · لم يصل · لا خطأ»): ٤٥ث كانت
  // تقطع «تعبئة» النموذج للنصّ الطويل قبل أوّل حرف (المِجسّ قاس ١٤–٢٨ث، وقد
  // يطول للّصق الكبير)، فتهبط لاحتياطٍ يفشل صامتًا. ٩٠ث تسع التعبئة الطويلة،
  // والحارس الصلب (٥ دقائق) يبقى شبكة الأمان النهائيّة ضدّ التعليق الحقيقيّ.
  var __CHAT_IDLE_MS = 90000;   // لا بايت من الخادم هذه المدة (خارج الأدوات) = تعثّر
  var __CHAT_TOOL_MS = 295000;  // أثناء تشغيل أداة محلّيّة نترك القطع للحارس الصلب
  function __raceIdle(p, ms, tag) {
    var to;
    var timer = new Promise(function (_res, rej) { to = setTimeout(function () { rej(new Error(tag)); }, ms); });
    return Promise.race([p, timer]).finally(function () { try { clearTimeout(to); } catch (e) { /* guard-ok — تنظيف المؤقّت */ } });
  }

  window.callChatWithTools = async function (messages, onDelta, provider) {
    window.__chatVideoResult = null;
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
        /* v-claude-models: النموذج المختار من الإعدادات — على مسار كلود قائمته حصرًا؛ v-provider-models: ولبقيّة
           المزوّدين معرّف OpenRouter من شريط السهم (الخادم يقبله للمالك بالبادئة الصحيحة). */
        model: (function () { try { return ((provider || 'claude') === 'claude' && window.claudeModelGet) ? window.claudeModelGet() : (window.omranModelFor ? window.omranModelFor(provider || 'claude') : ''); } catch (e) { return ''; } })(),
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
    var __toolBusy = false; /* أداة محلّيّة قيد التنفيذ → نطيل مهلة الخمول */
    var __tier = null; /* v-tiers: free / free-limit / guest / guest-limit — لشارة «ردّ مجاني» */
    var __model = ''; /* v-claude-models: اسم النموذج الذي أجاب فعلًا (من الخادم) */
    /* v-read-all (المالك: «الوكيل يقرأ ويحلّل كلّ شي — أريد نفس الشي في المزوّدين كلّهم»): كلّ سطر أثر «↳» خطوةٌ في
       سجلّ بصيغة سجلّ الوكيل (m._agParts)، يسبقها «فكّر N ث» حتّى أوّل حرف — يُحفظ في الرسالة فيبقى بعد الردّ. */
    var __t0 = Date.now(), __tFirst = 0, __steps = [];

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
        /* v-img-box (المالك: «احذف كلمة يرسم الصورة مع أيقونة الرسم»): حالة رسم/تعديل صورة تُظهر مربّع الإنشاء بدل السطر */
        if (ev.status && ev.k === 'stGenImage' && typeof window.__omranImgBox === 'function' && window.__omranImgBox()) { /* المربّع ظهر */ }
        else if (ev.status) note((typeof tStatus === 'function') ? tStatus(ev) : ev.status);  /* v656 */
        if (ev.status && /^↳/.test(String(ev.status)) && __steps.length < 24) {
          var __tt = String((typeof tStatus === 'function') ? tStatus(ev) : ev.status).replace(/^↳\s*/, '');
          __steps.push({ t: 'tool', name: String(ev.k || ''), title: __tt, cmd: String(ev.cmd || ''), out: String(ev.out || ''), err: /Fail|Err/.test(String(ev.k || '')) ? 1 : 0, g: 0 });
        }
        if (ev.clientTool) { __toolBusy = true; serveClientTool(ev.clientTool); }
        if (ev.delta) {
          if (!__tFirst) __tFirst = Date.now();
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
        if (ev.error && ev.limit === true) __planLimit = true;
        if (ev.error && ev.ownerStop === true) __ownerStop = true;
        if (typeof ev.tier === 'string' && ev.tier) __tier = ev.tier;
        if (typeof ev.modelLabel === 'string') __model = ev.modelLabel;
        /* v-oa-models: موديل مختار رفضه المفتاح → يُمسح من الاختيار المحفوظ (يعود للافتراضيّ) فلا يتكرّر الرفض مع كلّ رسالة */
        if (ev.deadModel && window.omranForgetModel) { try { window.omranForgetModel(ev.prov || provider || 'claude', ev.deadModel); } catch (e) { if (window.__swallow) window.__swallow(e, 'chatTools:forget-model'); } }
      }
    }
    noteEnd();

    // لا نصّ = لم يحدث شيء يُعرض؛ نرمي ليهبط المستدعي إلى مساره القديم — إلّا حدّ الباقة: لا مسار آخر يتجاوزه.
    if (!full.trim()) { var __er = new Error(serverErr || 'chat: empty reply'); if (__ownerStop) __er.ownerStop = true; if (__planLimit) __er.planLimit = true; throw __er; }
    var __p = provider || 'claude';
    var __log = __steps.length ? [{ t: 'think', ms: (__tFirst || Date.now()) - __t0, s: '' }].concat(__steps) : undefined;
    return { reply: full, providerKey: __p, switched: false, requestedKey: __p, model: __model || undefined, sources: __srcAcc.length ? __srcAcc.slice(0, 10) : undefined, tier: __tier || undefined, log: __log };
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
