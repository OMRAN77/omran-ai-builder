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
    /* v-cc-notify: إشعارات طلبات السحب — قائمة، وفتح إشعار كامل مع ردّ الوكيل، ومراقبة طلب برقمه. */
    if(/^(الإشعارات|الاشعارات|إشعارات|اشعارات|notifications)$/i.test(t)) return { cmd: 'notes', arg: '' };
    if((m = /^(افتح|open)(?:\s*[:：]\s*|\s+)\[?(\d+)\]?$/i.exec(t))) return { cmd: 'open', arg: m[2] };
    if((m = /^(راقب|watch)(?:\s*[:：]\s*|\s+)#?(\d+)$/i.exec(t))) return { cmd: 'watch', arg: m[2] };
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
  function noteTime(at){ try{ return new Date(at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }catch(e){ return ''; } }
  function notesList(j){
    var list = (j && j.notes) || [];
    if(!list.length) return '🔔 لا إشعارات بعد.' + ((j && j.watching && j.watching.length) ? ' أراقب: #' + j.watching.join('، #') : ' أراقب كلّ طلب سحب ينفتح من هنا تلقائيًّا.');
    return '🔔 الإشعارات' + (j.unread ? ' (' + j.unread + ' جديد)' : '') + ':\n'
      + list.map(function(n){ return (n.read ? '' : '🆕 ') + '[' + n.id + '] ' + n.title + ' · ' + noteTime(n.at) + (n.wake ? ' · 🤖 أيقظ الوكيل' : ''); }).join('\n')
      + '\n\nاكتب «افتح ' + list[0].id + '» لقراءة الإشعار كاملًا مع ردّ الوكيل.';
  }
  function noteFull(n){
    if(!n) return 'ما لقيت إشعارًا بهذا الرقم — اكتب «الإشعارات» للقائمة.';
    var out = '🔔 [' + n.id + '] ' + n.title + ' · ' + noteTime(n.at);
    if(n.url) out += '\n' + n.url;
    if(n.body) out += '\n\n' + n.body;
    if(n.wake) out += '\n\n🤖 ردّ الوكيل:\n' + (n.reply || (n.runId ? '⏳ يشتغل عليه الحين — اكتب أيّ رسالة لتلتحق بالتشغيل.' : '⏳ ينتظر دوره.'));
    return out;
  }
  function unreadHint(){
    return api('notes').then(function(j){ return (j && j.unread) ? '\n🔔 ' + j.unread + ' إشعار جديد — اكتب «الإشعارات».' : ''; }).catch(function(){ return ''; });
  }
  /* v-cc-fold (المالك: «مثل تطبيق Claude — الملفات والأكواد مطويّة داخل المحادثة»): الردّ يُحفظ
     أجزاءً بترتيبها (نصّ · مجموعة أدوات)، وكلّ أداة سطر مطويّ ينفتح على الأمر أو التعديل وناتجه. */
  var FOLD_BUDGET = 60000, CODE_FOLD_LINES = 15;
  function capParts(parts){
    var used = 0;
    parts.forEach(function(p){ (p.items || []).forEach(function(it){
      ['detail', 'result'].forEach(function(k){ var s = String(it[k] || ''); if(used + s.length > FOLD_BUDGET){ it[k] = s ? '… (حُذف للحجم)' : ''; } else used += s.length; });
    }); });
    return parts;
  }
  function push(cur, text, parts){
    var m = { role: 'assistant', content: '🧑‍💻 ' + String(text || '').trim(), _cc: true };
    if(parts && parts.some(function(p){ return p.t === 'tools'; })){
      var first = parts.filter(function(p){ return p.t === 'text'; })[0];
      if(first) first.s = '🧑‍💻 ' + first.s.replace(/^\s+/, ''); else parts.unshift({ t: 'text', s: '🧑‍💻' });
      m._ccParts = capParts(parts);
    }
    cur.messages.push(m);
  }
  function foldPre(text, asDiff, isErr){
    var p = document.createElement('pre');
    p.dir = 'ltr';
    p.style.cssText = 'margin:4px 0; padding:8px; max-height:320px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; overflow:auto; border-radius:8px; background:rgba(0,0,0,.25); font-size:11.5px; line-height:1.5; white-space:pre-wrap; word-break:break-word; text-align:left;' + (isErr ? ' color:#f87171;' : '');
    if(asDiff){
      String(text).split('\n').forEach(function(l){
        var sp = document.createElement('span');
        sp.style.cssText = 'display:block; font-family:inherit;' + (/^\+ /.test(l) ? ' color:#4ade80; background:rgba(74,222,128,.08);' : /^- /.test(l) ? ' color:#f87171; background:rgba(248,113,113,.08);' : '');
        sp.textContent = l;
        p.appendChild(sp);
      });
    } else p.textContent = text;
    return p;
  }
  function toolsEl(items){
    var d = document.createElement('details');
    d.className = 'cc-tools';
    d.style.cssText = 'margin:6px 0; padding:2px 10px; border:1px solid var(--line2,rgba(128,128,128,.28)); border-radius:10px; font-size:12.5px;';
    var errs = items.filter(function(it){ return it.err; }).length;
    var s = document.createElement('summary');
    s.style.cssText = 'cursor:pointer; color:var(--muted); padding:5px 0;';
    s.textContent = '🔧 استخدم ' + items.length + ' ' + (items.length === 1 ? 'أداة' : 'أدوات') + (errs ? ' · ⚠️ ' + errs : '');
    d.appendChild(s);
    items.forEach(function(it){
      var x = document.createElement('details');
      x.className = 'cc-tool';
      x.style.cssText = 'margin:3px 0; padding-inline-start:8px; border-inline-start:2px solid var(--line2,rgba(128,128,128,.28));';
      var xs = document.createElement('summary');
      xs.style.cssText = 'cursor:pointer; overflow-wrap:anywhere; padding:2px 0;';
      xs.textContent = (it.err ? '⚠️ ' : '') + (it.brief || it.name || 'أداة');
      x.appendChild(xs);
      if(it.detail) x.appendChild(foldPre(it.detail, /^(Edit|MultiEdit|Write)$/.test(it.name || ''), false));
      if(it.result) x.appendChild(foldPre(it.result, false, it.err));
      if(!it.detail && !it.result){ var e = document.createElement('div'); e.style.cssText = 'color:var(--muted); font-size:11.5px; padding:2px 0 4px;'; e.textContent = 'بلا ناتج.'; x.appendChild(e); }
      d.appendChild(x);
    });
    return d;
  }
  function foldCode(root){
    Array.prototype.slice.call(root.querySelectorAll('.chat-codeblock')).forEach(function(b){
      var pre = b.querySelector('pre');
      if(!pre || (b.parentNode && b.parentNode.className === 'cc-code-fold')) return;
      var n = pre.textContent.replace(/\n+$/, '').split('\n').length;
      if(n <= CODE_FOLD_LINES) return;
      var d = document.createElement('details');
      d.className = 'cc-code-fold';
      d.style.cssText = 'margin:6px 0;';
      var s = document.createElement('summary');
      s.style.cssText = 'cursor:pointer; color:var(--muted); font-size:12.5px; padding:4px 0;';
      var lbl = b.querySelector('.chat-codeblock-head span');
      s.textContent = '📄 ' + ((lbl && lbl.textContent) || 'code') + ' · ' + n + ' سطر';
      b.parentNode.insertBefore(d, b);
      d.appendChild(s); d.appendChild(b);
    });
  }
  /** يستدعيه renderMessages لكلّ ردّ Claude Code: الأجزاء بترتيبها والأدوات مطويّة، والكود الطويل مطويّ. يعيد كلمات القراءة. */
  function decorate(textDiv, m){
    var words = null;
    if(Array.isArray(m._ccParts) && m._ccParts.length && typeof buildSpokenWordSpans === 'function'){
      textDiv.innerHTML = '';
      words = [];
      m._ccParts.forEach(function(p){
        if(p.t === 'tools' && Array.isArray(p.items) && p.items.length){ textDiv.appendChild(toolsEl(p.items)); return; }
        if(p.t !== 'text' || !String(p.s || '').trim()) return;
        var d = document.createElement('div');
        var w = buildSpokenWordSpans(d, p.s);
        if(w && w.length) words = words.concat(w);
        textDiv.appendChild(d);
      });
    }
    foldCode(textDiv);
    return words;
  }
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
        done('⬆️ نُشر الفرع ' + j.branch + (j.prUrl ? '\nطلب السحب: ' + j.prUrl : '') + (j.watching ? '\n🔔 أراقبه: الفحوص والمعاينة والتعليقات — وإذا احمرّ فحص أصحّي الوكيل يصلحه.' : '') + '\nاكتب «ادمج» لدمجه في main بعد المراجعة.');
      }).catch(fail);
    }
    if(c.cmd === 'merge' || c.cmd === 'merge-force'){
      var force = c.cmd === 'merge-force';
      var n = parseInt(c.arg || '0', 10) || S.prNumber;
      if(!n) return Promise.resolve(done('لا طلب سحب معروف — اكتب «انشر» أوّلًا، أو «ادمج 123» برقم الطلب.'));
      if(!window.confirm('تدمج طلب السحب #' + n + ' في main الآن؟ Vercel سينشره.' + (force ? ' (بالقوّة رغم فحص أحمر)' : ''))) return Promise.resolve(done('أُلغي الدمج.'));
      say(cur, thinkingDiv, 'ادمج #' + n + '…');
      return api('merge', { prNumber: n, force: force }).then(function(j){
        if(j.queued) return done('⏳ الفحوص ما خلصت (' + (j.pending || []).join('، ') + ') — بدمج #' + n + ' تلقائيًّا أوّل ما تخضرّ، وإذا احمرّت ألغيه. تابع من «الإشعارات».');
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
    if(c.cmd === 'notes'){
      return api('notes').then(function(j){ done(notesList(j)); return api('notesRead', {}); }).catch(fail);
    }
    if(c.cmd === 'open'){
      var id = parseInt(c.arg, 10) || 0;
      return api('notes').then(function(j){
        var n = ((j && j.notes) || []).filter(function(x){ return x.id === id; })[0];
        done(noteFull(n));
        if(n) return api('notesRead', { ids: [id] });
      }).catch(fail);
    }
    if(c.cmd === 'watch'){
      return api('watch', { prNumber: parseInt(c.arg, 10) || 0 }).then(function(){ done('🔔 أراقب #' + c.arg + ': الفحوص والمعاينة والتعليقات.'); }).catch(fail);
    }
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
    var parts = [];
    var last = function(){ return parts[parts.length - 1]; };
    var onEv = function(ev){
      if(ev.tool){ var it = { id: ev.tool.id || '', name: ev.tool.name || '', brief: ev.tool.brief || '', detail: ev.tool.detail || '' }; if(last() && last().t === 'tools') last().items.push(it); else parts.push({ t: 'tools', items: [it] }); }
      if(ev.toolResult) parts.forEach(function(p){ (p.items || []).forEach(function(it){ if(it.id && it.id === ev.toolResult.id){ it.result = ev.toolResult.text || ''; it.err = !!ev.toolResult.error; } }); });
      if(ev.delta){ if(last() && last().t === 'text') last().s += ev.delta; else parts.push({ t: 'text', s: ev.delta }); }
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
      .then(function(st){ return unreadHint().then(function(h){ return { st: st, hint: h }; }); })
      .then(function(x){
        var st = x.st;
        var body = full.trim();
        if(!body) body = err ? ('✗ ' + err) : '✅ انتهى بلا نصّ.';
        else if(err) body += '\n\n⚠️ ' + err;
        var foot = '';
        // v-cc-strength: النموذج الذي عمل فعلًا (من نتيجة التشغيل) والجهد — لا النموذج المضبوط فقط.
        var ranModel = (result && result.models && result.models.length) ? result.models.join(' + ') : (initModel || (st && st.model) || '');
        if(result) foot += '— ' + (result.turns || 0) + ' جولة' + (result.cost != null ? ' · ' + Number(result.cost).toFixed(3) + '$' : '') + (ranModel ? ' · النموذج: ' + ranModel : '') + (result.effort ? ' · الجهد: ' + result.effort : '');
        if(st){ var s2 = Object.assign({}, st); if(ranModel) delete s2.model; foot += (foot ? '\n' : '') + statusLine(s2) + ((st.dirty || st.ahead) ? '\nاكتب «انشر» لفتح طلب السحب، ثمّ «ادمج».' : ''); }
        var tail = (full.trim() ? (err ? '\n\n⚠️ ' + err : '') : body) + (foot ? '\n\n' + foot : '') + x.hint;
        var ccParts = (prevOut ? [{ t: 'text', s: prevOut }] : []).concat(parts, tail.trim() ? [{ t: 'text', s: tail }] : []);
        push(cur, prevOut + body + (foot ? '\n\n' + foot : '') + x.hint, ccParts);
      });
  }

  function runInChat(cur, text, thinkingDiv, status, atts){
    if(!owner()) { push(cur, 'هذا الوضع لمالك التطبيق وحده.'); return Promise.resolve(); }
    var c = parseCommand(text);
    return c ? runCommand(cur, c, thinkingDiv, status) : runTask(cur, text, thinkingDiv, status, atts);
  }

  window.omranCC = { runInChat: runInChat, owner: owner, parseCommand: parseCommand, packImages: packImages, decorate: decorate, _fold: { push: push, capParts: capParts } };
})();
