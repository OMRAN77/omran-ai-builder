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
  window.callChatWithTools = async function (messages, onDelta, provider) {
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
    var res = await fetch('/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
      body: JSON.stringify({
        messages: messages,
        provider: provider || 'claude',
        token: (window.authGet && window.authGet('aiapp_auth_token')) || '',
        guestId: window.getGuestId ? window.getGuestId() : '',
      }),
    });
    if (!res.ok || !res.body) {
      var errText = '';
      try { errText = await res.text(); } catch (e) { /* لا جسم للخطأ */ }
      throw new Error('chat ' + res.status + ': ' + String(errText).slice(0, 200));
    }

    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var buf = '', full = '', serverErr = null;

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('data: ') !== 0) continue;
        var ev;
        try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
        if (ev.status) note(ev.status);
        if (ev.clientTool) serveClientTool(ev.clientTool);
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
        if (ev.error) serverErr = ev.error;
      }
    }
    noteEnd();

    // لا نصّ = لم يحدث شيء يُعرض؛ نرمي ليهبط المستدعي إلى مساره القديم.
    if (!full.trim()) throw new Error(serverErr || 'chat: empty reply');
    var __p = provider || 'claude';
    return { reply: full, providerKey: __p, switched: false, requestedKey: __p };
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
