/* v-cc-chat (أمر عمران ١٤ سبتمبر «الي أريده في المحادثة… مش تخليه قسم بروحه»):
   Claude Code داخل صندوق المحادثة نفسه — وضع «Claude Code» في قائمة @ للمالك وحده
   (js/modes.js). الرسالة تذهب إلى /api/system?action=cc الذي يرحّلها إلى جسر Claude Code
   على خادم المالك ويعيد بثّه: سطور الأدوات في شريط الحالة، والنصّ في فقاعة الردّ، ثمّ
   رسالة مساعد عاديّة في المحادثة تُحفظ مع المشروع. الكلمات «انشر · ادمج · ادمج بالقوّة ·
   تراجع · الحالة · جلسة جديدة · أوقف» أوامر صريحة من المالك تُكتب في الصندوق نفسه
   («انشر: عنوان» و«ادمج 123» تقبلان معطًى). انقطاع البثّ لا يضيع التشغيل: يُستأنف بـattach.
   الخادم يتحقّق من المالك بالتوقيع؛ الفحص هنا للعرض فقط. لا قسم مستقلّ في الإعدادات. */
(function(){
  'use strict';
  function owner(){ try{ return String((window.authGet && window.authGet('aiapp_username')) || '').trim().toLowerCase() === 'omran'; }catch(e){ return false; } }
  function token(){ try{ return (window.authGet && window.authGet('aiapp_auth_token')) || ''; }catch(e){ return ''; } }
  /* الجلسة (sessionId) تعيش في محادثة التطبيق نفسها (cur.ccSessionId) لا هنا — v-cc-session-per-chat. */
  var S = { runId: '', since: 0, prNumber: 0, prUrl: '', lastTask: '', busy: false, retries: 0 };
  try{
    S.prNumber = parseInt(localStorage.getItem('aiapp_cc_pr') || '0', 10) || 0;
    S.prUrl = localStorage.getItem('aiapp_cc_pr_url') || '';
    S.lastTask = localStorage.getItem('aiapp_cc_last') || '';
    localStorage.removeItem('aiapp_cc_session');
  }catch(e){ /* guard-ok */ }
  function save(){
    try{
      localStorage.setItem('aiapp_cc_pr', String(S.prNumber || 0));
      localStorage.setItem('aiapp_cc_pr_url', S.prUrl || '');
      localStorage.setItem('aiapp_cc_last', String(S.lastTask || '').slice(0, 200));
    }catch(e){ /* guard-ok */ }
  }

  /** الكلمة الآمرة في أوّل السطر (وحدها أو بمعطًى): {cmd, arg} أو null = مهمّة عاديّة. */
  function parseCommand(text){
    var t = String(text || '').trim().replace(/[!.،؟]+$/, '');
    var m;
    if((m = /^(ادمج بالقوة|ادمج بالقوّة|force merge)(?:(?:\s*[:：]\s*|\s+)#?(\d+))?$/i.exec(t))) return { cmd: 'merge-force', arg: m[2] || '' };
    if((m = /^(انشر|ارفع|publish|push)(?:\s*[:：]\s*|\s+)(.+)$/i.exec(t))) return { cmd: 'publish', arg: m[2].trim() };
    if((m = /^(ادمج|merge)(?:\s*[:：]\s*|\s+)#?(\d+)$/i.exec(t))) return { cmd: 'merge', arg: m[2] };
    if(/^(انشر|ارفع|publish|push)$/i.test(t)) return { cmd: 'publish', arg: '' };
    if(/^(ادمج|merge)$/i.test(t)) return { cmd: 'merge', arg: '' };
    if(/^(تراجع|reset)$/i.test(t)) return { cmd: 'reset', arg: '' };
    if(/^(الحالة|status)$/i.test(t)) return { cmd: 'status', arg: '' };
    if(/^(جلسة جديدة|new session)$/i.test(t)) return { cmd: 'new', arg: '' };
    if(/^(أوقف|اوقف|stop)$/i.test(t)) return { cmd: 'stop', arg: '' };
    return null;
  }

  function api(op, extra){
    var payload = Object.assign({ op: op, token: token() }, extra || {});
    return fetch('/api/system?action=cc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function(r){ return r.json().then(function(j){ if(!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
  }

  function signal(){ try{ return (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined; }catch(e){ return undefined; } }

  /** بثّ SSE من المرحّل: كلّ حدث إلى onEvent؛ يعود true إن وصل حدث الانتهاء. */
  function stream(body, onEvent){
    var gotDone = false;
    return fetch('/api/system?action=cc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: token() }, body)), signal: signal() })
      .then(function(r){
        if(!r.ok || !r.body){ return r.text().then(function(t){ var j = null; try{ j = JSON.parse(t); }catch(e){ j = null; } throw new Error((j && j.error) || ('HTTP ' + r.status)); }); }
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
        function pump(){ return reader.read().then(function(x){
          if(x.done) return;
          buf += dec.decode(x.value, { stream: true });
          var parts = buf.split('\n\n'); buf = parts.pop();
          parts.forEach(function(p){
            var l = p.split('\n').filter(function(s){ return s.indexOf('data: ') === 0; })[0]; if(!l) return;
            var ev = null; try{ ev = JSON.parse(l.slice(6)); }catch(e){ return; }
            if(ev.ping) return;
            S.since++; onEvent(ev); if(ev.done) gotDone = true;
          });
          return pump();
        }); }
        return pump();
      })
      .then(function(){ return gotDone; });
  }

  /* v-cc-raw-full: المهمّة الطويلة تُتابَع حتّى نهايتها — كلّ ٣٠٠ ثانية يقطع Vercel البثّ فنلتحق
     من النقطة نفسها بلا سقف؛ السقف على الأخطاء المتتالية فقط (٢٠ محاولة بتراجع تدريجيّ). */
  function attachLoop(onEvent, onRetry){
    if(!S.runId) return Promise.resolve(false);
    return stream({ op: 'attach', runId: S.runId, since: S.since }, onEvent)
      .then(function(done){ S.retries = 0; if(done) return true; return attachLoop(onEvent, onRetry); })
      .catch(function(e){
        if(e && e.name === 'AbortError') throw e;
        S.retries++;
        if(S.retries > 20) return false;
        if(onRetry) onRetry(S.retries);
        return new Promise(function(res){ setTimeout(res, Math.min(15000, 1500 * S.retries)); }).then(function(){ return attachLoop(onEvent, onRetry); });
      });
  }

  function statusLine(j){
    return 'الفرع: ' + (j.branch || '؟') + ' · تغييرات غير ملتزمة: ' + (j.dirty || 0) + ' · التزامات فوق ' + (j.base || 'main') + ': ' + (j.ahead || 0)
      + (j.model ? ' · النموذج: ' + j.model : '') + (S.prUrl ? '\nطلب السحب: ' + S.prUrl : '');
  }
  function push(cur, text){ cur.messages.push({ role: 'assistant', content: '🧑‍💻 ' + String(text || '').trim(), _cc: true }); }
  function say(cur, thinkingDiv, text){ try{ thinkingDiv.textContent = '🧑‍💻 ' + text; }catch(e){ /* guard-ok */ } }

  /** الأوامر الصريحة من الصندوق: تنفيذ + رسالة في المحادثة. الدمج والتراجع بتأكيد. */
  function runCommand(cur, c, thinkingDiv, status){
    var step = status.step('🧑‍💻', 'Claude Code: ' + c.cmd);
    var done = function(text){ if(step) step.done(); status.release(); push(cur, text); };
    var fail = function(e){ done('✗ ' + (e && e.message || e)); };
    if(c.cmd === 'publish'){
      var title = (c.arg || (S.lastTask ? S.lastTask.replace(/\s+/g, ' ').slice(0, 70) : '') || 'تعديلات Claude Code').trim();
      say(cur, thinkingDiv, 'انشر: التزام ودفع وطلب سحب…');
      return api('publish', { title: title, message: title }).then(function(j){
        S.prNumber = j.prNumber || 0; S.prUrl = j.prUrl || ''; save();
        done('⬆️ نُشر الفرع ' + j.branch + (j.prUrl ? '\nطلب السحب: ' + j.prUrl : '') + '\nاكتب «ادمج» لدمجه في main بعد المراجعة.');
      }).catch(fail);
    }
    if(c.cmd === 'merge' || c.cmd === 'merge-force'){
      var force = c.cmd === 'merge-force';
      var n = parseInt(c.arg || '0', 10) || S.prNumber;
      if(!n) return Promise.resolve(done('لا طلب سحب معروف — اكتب «انشر» أوّلًا، أو «ادمج 123» برقم الطلب.'));
      if(!window.confirm('تدمج طلب السحب #' + n + ' في main الآن؟ Vercel سينشره.' + (force ? ' (بالقوّة رغم فحص أحمر)' : ''))) return Promise.resolve(done('أُلغي الدمج.'));
      say(cur, thinkingDiv, 'ادمج #' + n + '…');
      return api('merge', { prNumber: n, force: force }).then(function(j){
        S.prNumber = 0; S.prUrl = ''; save();
        done(j.already ? 'كان #' + n + ' مدموجًا من قبل.' : ('✅ دُمج #' + n + ' (' + String(j.sha || '').slice(0, 7) + ') — Vercel ينشر الآن.'));
      }).catch(function(e){ done('✗ ' + e.message + (force ? '' : '\nللتجاوز اكتب «ادمج بالقوّة».')); });
    }
    if(c.cmd === 'reset'){
      if(!window.confirm('تُسقط كلّ التغييرات المحلّيّة وتعود إلى أحدث main؟')) return Promise.resolve(done('أُلغي التراجع.'));
      return api('reset', {}).then(function(j){ done('↩️ رجعت نسخة العمل إلى ' + j.base + ' (' + j.head + ').'); }).catch(fail);
    }
    if(c.cmd === 'status'){
      return api('status').then(function(j){ done(statusLine(j) + (j.busy ? '\n⏳ تشغيل جارٍ.' : '')); }).catch(fail);
    }
    if(c.cmd === 'new'){ cur.ccSessionId = ''; return Promise.resolve(done('🆕 جلسة جديدة — الرسالة التالية تبدأ سياقًا جديدًا.')); }
    if(c.cmd === 'stop'){ return api('stop').then(function(){ done('⏹️ طُلب الإيقاف.'); }).catch(fail); }
    return Promise.resolve(done('أمر غير معروف.'));
  }

  /* v-cc-images: الصور المرفقة → كتل صور للجسر (png/jpeg/webp/gif، حتّى ٤ صور و٣٫٥ مليون حرف base64
     مجتمعة — حدّ جسد طلب Vercel). ما زاد يُذكر في الرسالة بدل أن يضيع بصمت. */
  var IMG_MAX = 4, IMG_BUDGET = 3500000;
  function packImages(atts){
    var out = [], skipped = 0, used = 0;
    (atts || []).forEach(function(a){
      var m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String((a && a.dataUrl) || ''));
      if(!m || out.length >= IMG_MAX || used + m[2].length > IMG_BUDGET){ skipped++; return; }
      used += m[2].length; out.push({ mediaType: m[1], data: m[2] });
    });
    return { images: out, skipped: skipped };
  }

  /** مهمّة عاديّة: بثّ الجسر إلى شريط الحالة والفقاعة، ثمّ رسالة في المحادثة مع حالة git. */
  function runTask(cur, text, thinkingDiv, status, atts){
    var packed = packImages(atts);
    if(packed.skipped) text += '\n\n(' + packed.skipped + ' مرفق لم يُرسل: الصور حتّى ٤ بصيغة png/jpeg/webp/gif وبحجم إجماليّ محدود.)';
    S.lastTask = text; save();
    S.since = 0; S.runId = ''; S.retries = 0;
    var step = status.step('🧑‍💻', 'Claude Code يعمل…');
    var full = '', result = null, err = '', initModel = '';
    var onEv = function(ev){
      if(ev.run) S.runId = ev.run;
      /* v-cc-session-per-chat: جلسة Claude Code مربوطة بمحادثة التطبيق نفسها لا بالمتصفّح كلّه —
         محادثة جديدة في التطبيق = جلسة جديدة، والرجوع لمحادثة قديمة يستأنف جلستها. */
      if(ev.init){ cur.ccSessionId = ev.init.sessionId || cur.ccSessionId || ''; initModel = ev.init.model || ''; }
      if(ev.tool){ if(step) step.done(); step = status.step('🔧', ev.tool.brief); }
      if(ev.toolError){ if(step) step.done(); step = status.step('⚠️', ev.toolError); }
      if(ev.delta){
        if(step){ step.done(); step = null; }
        status.release();
        full += ev.delta;
        /* v-stream-full-agent: النصّ كلّه بالمنسّق التدريجيّ للمحادثة (لا ذيل ٤٠٠ حرف خام)، وكبح ١٥٠مل على الجوال. */
        var now = Date.now();
        if(typeof renderStreamingAssistant !== 'function'){ say(cur, thinkingDiv, full); }
        else if(!document.documentElement.classList.contains('mobile-ui') || !thinkingDiv._omLastRender || now - thinkingDiv._omLastRender >= 150){
          thinkingDiv._omLastRender = now;
          renderStreamingAssistant(thinkingDiv, '🧑‍💻 ' + full);
        }
        try{ if(typeof chatIsNearBottom !== 'function' || chatIsNearBottom()) messagesEl.scrollTop = messagesEl.scrollHeight; }catch(e){ /* guard-ok */ }
      }
      if(ev.result){ result = ev.result; if(!full && ev.result.text) full = ev.result.text; }
      if(ev.error) err = ev.error;
      if(ev.done){ S.runId = ''; S.since = 0; }
    };
    var onRetry = function(n){ if(step) step.done(); step = status.step('🔌', 'انقطع الاتّصال — أعيد الالتحاق بالتشغيل (' + n + ')…'); };
    if(packed.images.length){ var s0 = status.step('🖼️', packed.images.length + ' صورة مرفقة تُرسل إلى Claude Code'); s0.done(); }
    var prevOut = '', busyRetried = false;
    /* v-cc-busy-attach (لقطة المالك «✗ تشغيل جارٍ — انتظر انتهاءه»): الجسر مشغول بتشغيل سابق (من محادثة
       أخرى أو بعد إعادة تحميل) → نلتحق به ونعرضه هنا حتّى ينتهي، ثمّ نرسل الرسالة الجديدة تلقائيًّا
       بدل رفضها؛ ناتج التشغيل السابق يُدرج في الردّ نفسه تحت عنوانه. */
    function drainRunning(){
      return api('status').catch(function(){ return null; }).then(function(st){
        if(!st || !st.busy || !st.runId) return '';
        S.runId = st.runId; S.since = 0; S.retries = 0;
        var pstep = status.step('⏳', 'تشغيل سابق ما زال جاريًا — ألتحق به حتّى ينتهي ثمّ أرسل رسالتك');
        var pfull = '', pres = null;
        var pEv = function(ev){
          if(ev.tool){ if(pstep) pstep.done(); pstep = status.step('🔧', ev.tool.brief); }
          if(ev.toolError){ if(pstep) pstep.done(); pstep = status.step('⚠️', ev.toolError); }
          if(ev.delta){
            if(pstep){ pstep.done(); pstep = null; }
            status.release(); pfull += ev.delta;
            if(typeof renderStreamingAssistant === 'function') renderStreamingAssistant(thinkingDiv, '🧑‍💻 (تشغيل سابق) ' + pfull); else say(cur, thinkingDiv, pfull);
          }
          if(ev.result){ pres = ev.result; if(!pfull && ev.result.text) pfull = ev.result.text; }
          if(ev.done){ S.runId = ''; S.since = 0; }
        };
        return attachLoop(pEv, onRetry).catch(function(e){ if(e && e.name === 'AbortError') throw e; return false; }).then(function(){
          if(pstep) pstep.done();
          status.release();
          try{ thinkingDiv.innerHTML = ''; thinkingDiv._omStreamHead = null; thinkingDiv._omLastRender = 0; }catch(e){ /* guard-ok */ }
          var body = pfull.trim() || 'انتهى بلا نصّ.';
          return '▶ التشغيل السابق (اكتمل قبل رسالتك):\n' + body + (pres ? '\n— ' + (pres.turns || 0) + ' جولة' + (pres.cost != null ? ' · ' + Number(pres.cost).toFixed(3) + '$' : '') : '') + '\n\n▶ ردّ رسالتك:\n';
        });
      });
    }
    function chatOnce(){
      S.since = 0; S.runId = ''; S.retries = 0;
      return stream({ op: 'chat', message: text, sessionId: String(cur.ccSessionId || ''), newSession: !cur.ccSessionId, images: packed.images }, onEv)
        .then(function(done){ if(done) return true; return attachLoop(onEv, onRetry); });
    }
    return drainRunning().then(function(prev){ prevOut = prev || ''; return chatOnce(); })
      .catch(function(e){
        if(e && e.name === 'AbortError'){ api('stop').catch(function(){ /* guard-ok */ }); err = err || 'أُوقف بأمرك.'; return false; }
        var msg = (e && e.message) || String(e);
        if(!busyRetried && /تشغيل جارٍ|409/.test(msg)){
          busyRetried = true;
          return drainRunning().then(function(prev){ prevOut += prev || ''; return chatOnce(); }).catch(function(e2){ if(e2 && e2.name === 'AbortError'){ api('stop').catch(function(){ /* guard-ok */ }); err = 'أُوقف بأمرك.'; return false; } err = (e2 && e2.message) || String(e2); return false; });
        }
        err = err || msg;
        if(S.runId) return attachLoop(onEv, onRetry).catch(function(){ return false; });
        return false;
      })
      .then(function(){
        if(step) step.done();
        status.release();
        return api('status').catch(function(){ return null; });
      })
      .then(function(st){
        var body = full.trim();
        if(!body) body = err ? ('✗ ' + err) : '✅ انتهى بلا نصّ.';
        else if(err) body += '\n\n⚠️ ' + err;
        var foot = '';
        // v-cc-strength: النموذج الذي عمل فعلًا (من نتيجة التشغيل) والجهد — لا النموذج المضبوط فقط.
        var ranModel = (result && result.models && result.models.length) ? result.models.join(' + ') : (initModel || (st && st.model) || '');
        if(result) foot += '— ' + (result.turns || 0) + ' جولة' + (result.cost != null ? ' · ' + Number(result.cost).toFixed(3) + '$' : '') + (ranModel ? ' · النموذج: ' + ranModel : '') + (result.effort ? ' · الجهد: ' + result.effort : '');
        if(st){ var s2 = Object.assign({}, st); if(ranModel) delete s2.model; foot += (foot ? '\n' : '') + statusLine(s2) + ((st.dirty || st.ahead) ? '\nاكتب «انشر» لفتح طلب السحب، ثمّ «ادمج».' : ''); }
        push(cur, prevOut + body + (foot ? '\n\n' + foot : ''));
      });
  }

  function runInChat(cur, text, thinkingDiv, status, atts){
    if(!owner()) { push(cur, 'هذا الوضع لمالك التطبيق وحده.'); return Promise.resolve(); }
    var c = parseCommand(text);
    return c ? runCommand(cur, c, thinkingDiv, status) : runTask(cur, text, thinkingDiv, status, atts);
  }

  window.omranCC = { runInChat: runInChat, owner: owner, parseCommand: parseCommand, packImages: packImages };
})();
