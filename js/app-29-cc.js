/* v-cc-bridge (أمر عمران ١٣ سبتمبر «كلاود كود خام… النشر والدمج بأمري فقط»):
   شاشة «Claude Code» في الإعدادات — لحساب المالك وحده (الخادم يتحقّق بالتوقيع؛
   الفحص هنا للعرض فقط). ترسل الرسالة إلى /api/system?action=cc الذي يرحّلها إلى
   جسر Claude Code على خادم المالك ويعيد بثّه: نصّ الردّ لحظة بلحظة، وسطر لكلّ أداة.
   الأزرار الأربعة (انشر · ادمج · تراجع · جلسة جديدة) أوامر صريحة من المالك — الكلمة
   وحدها في الصندوق تعمل عملها أيضًا. انقطاع البثّ لا يضيع التشغيل: يُستأنف بـattach.
   الجوال يرى القسم نفسه (المالك فقط)؛ لا شيء لغيره. */
(function(){
  'use strict';
  function owner(){ try{ return String((window.authGet && window.authGet('aiapp_username')) || '').trim().toLowerCase() === 'omran'; }catch(e){ return false; } }
  function token(){ try{ return (window.authGet && window.authGet('aiapp_auth_token')) || ''; }catch(e){ return ''; } }
  var S = { sessionId: '', runId: '', since: 0, prNumber: 0, prUrl: '', busy: false, ctrl: null, retries: 0 };
  try{ S.sessionId = localStorage.getItem('aiapp_cc_session') || ''; S.prNumber = parseInt(localStorage.getItem('aiapp_cc_pr') || '0', 10) || 0; S.prUrl = localStorage.getItem('aiapp_cc_pr_url') || ''; }catch(e){ /* guard-ok */ }
  function save(){ try{ localStorage.setItem('aiapp_cc_session', S.sessionId || ''); localStorage.setItem('aiapp_cc_pr', String(S.prNumber || 0)); localStorage.setItem('aiapp_cc_pr_url', S.prUrl || ''); }catch(e){ /* guard-ok */ } }

  function commandWord(text){
    var t = String(text || '').trim().replace(/[!.،؟]+$/, '');
    if(/^(انشر|ارفع|publish|push)$/i.test(t)) return 'publish';
    if(/^(ادمج|merge)$/i.test(t)) return 'merge';
    if(/^(ادمج بالقوة|ادمج بالقوّة|force merge)$/i.test(t)) return 'merge-force';
    if(/^(تراجع|reset)$/i.test(t)) return 'reset';
    if(/^(الحالة|status)$/i.test(t)) return 'status';
    if(/^(جلسة جديدة|new session)$/i.test(t)) return 'new';
    if(/^(أوقف|اوقف|stop)$/i.test(t)) return 'stop';
    return '';
  }

  var el = {};
  function h(tag, attrs, html){ var n = document.createElement(tag); for(var k in (attrs || {})) n.setAttribute(k, attrs[k]); if(html != null) n.innerHTML = html; return n; }
  /* v-cc-nav: الإعدادات قائمة من مستويين (v199) — القسم لا يظهر إلّا إن كان في SETTINGS_NAV_IDS
     الذي تُبنى منه القائمة الرئيسيّة (تُعاد كلّ تغيير لغة)، فنسجّله بعد «الوكيل» وأيقونة له. */
  function registerNav(){
    try{
      if(typeof SETTINGS_NAV_IDS !== 'undefined' && SETTINGS_NAV_IDS.indexOf('ccSection') < 0){
        var i = SETTINGS_NAV_IDS.indexOf('agentSection');
        SETTINGS_NAV_IDS.splice(i < 0 ? SETTINGS_NAV_IDS.length : i + 1, 0, 'ccSection');
      }
      if(typeof SETTINGS_NAV_ICONS !== 'undefined' && !SETTINGS_NAV_ICONS.ccSection){
        SETTINGS_NAV_ICONS.ccSection = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>';
      }
      if(typeof renderSettingsNavList === 'function') renderSettingsNavList();
    }catch(e){ /* guard-ok — قائمة الإعدادات غير جاهزة بعد؛ mount يُعاد عند فتحها */ }
  }
  function mount(){
    if(!owner()) return false;
    if(document.getElementById('ccSection')){ registerNav(); return true; }
    var after = document.getElementById('agentSection');
    if(!after || !after.parentNode) return false;
    var sec = h('div', { id: 'ccSection', 'class': 'settingsPageSection', style: 'padding:14px; margin-bottom:18px;' });
    sec.innerHTML =
      '<div class="settingsSectionHeader" onclick="toggleSettingsSection(\'ccSection\')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;">'
      + '<h3 style="margin:0; font-size:14px;">🧑‍💻 Claude Code</h3><span class="settingsSectionArrow" id="ccSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div>'
      + '<div id="ccSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">'
      + '<p style="margin:0 0 10px; font-size:12.5px; color:var(--muted); line-height:1.7;">Claude Code الخام على خادمك، يعمل في نسخة المستودع. النشر والدمج بأمرك وحدك: «انشر» ثمّ «ادمج».</p>'
      + '<div id="ccStatus" style="font-size:12px; color:var(--muted); margin-bottom:8px; line-height:1.7;">…</div>'
      + '<div id="ccLog" dir="auto" style="max-height:52vh; overflow:auto; background:var(--panel2,rgba(255,255,255,.03)); border:1px solid var(--border,#333); border-radius:12px; padding:10px 12px; font-size:13px; line-height:1.8; white-space:pre-wrap; word-break:break-word; min-height:120px;"></div>'
      + '<textarea id="ccInput" rows="3" placeholder="اكتب المهمّة كما تكتبها لـClaude Code… (أو كلمة واحدة: انشر · ادمج · تراجع · الحالة)" style="width:100%; margin-top:10px; padding:10px 12px; border-radius:12px; background:var(--panel2,rgba(255,255,255,.03)); color:var(--text,#eee); border:1px solid var(--border,#333); font-family:inherit; font-size:13.5px; resize:vertical; box-sizing:border-box;"></textarea>'
      + '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">'
      + '<button type="button" class="btn primary" id="ccSend">إرسال</button>'
      + '<button type="button" class="btn" id="ccStop" style="display:none;">إيقاف</button>'
      + '<button type="button" class="btn" id="ccPublish">⬆️ انشر</button>'
      + '<button type="button" class="btn" id="ccMerge">✅ ادمج</button>'
      + '<button type="button" class="btn" id="ccReset">↩️ تراجع</button>'
      + '<button type="button" class="btn" id="ccNew">🆕 جلسة جديدة</button>'
      + '<button type="button" class="btn" id="ccStatusBtn">🔄 الحالة</button>'
      + '</div></div>';
    after.parentNode.insertBefore(sec, after.nextSibling);
    ['ccStatus','ccLog','ccInput','ccSend','ccStop','ccPublish','ccMerge','ccReset','ccNew','ccStatusBtn'].forEach(function(id){ el[id] = document.getElementById(id); });
    el.ccSend.addEventListener('click', submit);
    el.ccStop.addEventListener('click', function(){ api('stop').then(function(){ line('⏹️ طُلب الإيقاف.'); }).catch(function(e){ line('✗ ' + e.message); }); });
    el.ccPublish.addEventListener('click', publish);
    el.ccMerge.addEventListener('click', function(){ merge(false); });
    el.ccReset.addEventListener('click', reset);
    el.ccNew.addEventListener('click', function(){ S.sessionId = ''; save(); line('🆕 جلسة جديدة — الرسالة التالية تبدأ سياقًا جديدًا.'); refreshStatus(); });
    el.ccStatusBtn.addEventListener('click', refreshStatus);
    el.ccInput.addEventListener('keydown', function(e){ if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){ e.preventDefault(); submit(); } });
    registerNav();
    refreshStatus();
    return true;
  }

  function line(text, cls){ var d = document.createElement('div'); d.textContent = text; if(cls === 'tool'){ d.style.cssText = 'color:var(--muted); font-size:12px; direction:ltr; text-align:left; font-family:ui-monospace,Menlo,Consolas,monospace;'; } if(cls === 'err'){ d.style.color = '#ff7b7b'; } el.ccLog.appendChild(d); el.ccLog.scrollTop = el.ccLog.scrollHeight; return d; }
  var cur = null;
  function delta(text){ if(!cur){ cur = document.createElement('div'); el.ccLog.appendChild(cur); } cur.textContent += text; el.ccLog.scrollTop = el.ccLog.scrollHeight; }
  function setBusy(b){ S.busy = b; el.ccSend.disabled = b; el.ccStop.style.display = b ? '' : 'none'; el.ccPublish.disabled = b; el.ccMerge.disabled = b; el.ccReset.disabled = b; }

  function api(op, extra){
    var payload = Object.assign({ op: op, token: token() }, extra || {});
    return fetch('/api/system?action=cc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function(r){ return r.json().then(function(j){ if(!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
  }

  function handle(ev){
    if(ev.run){ S.runId = ev.run; }
    if(ev.init){ S.sessionId = ev.init.sessionId || S.sessionId; save(); line('🧑‍💻 جلسة ' + (S.sessionId || '').slice(0, 8) + ' · النموذج ' + (ev.init.model || ''), 'tool'); }
    if(ev.delta){ delta(ev.delta); }
    if(ev.tool){ cur = null; line('🔧 ' + ev.tool.brief, 'tool'); }
    if(ev.toolError){ line('⚠️ ' + ev.toolError, 'err'); }
    if(ev.result){ cur = null; if(ev.result.text) line(ev.result.text); line('— انتهى (' + (ev.result.turns || 0) + ' جولة' + (ev.result.cost != null ? ' · ' + Number(ev.result.cost).toFixed(3) + '$' : '') + (ev.result.subtype && ev.result.subtype !== 'success' ? ' · ' + ev.result.subtype : '') + ')', 'tool'); }
    if(ev.error){ cur = null; line('✗ ' + ev.error, 'err'); }
    if(ev.done){ S.runId = ''; S.since = 0; }
  }

  function stream(body){
    S.ctrl = new AbortController();
    var gotDone = false;
    return fetch('/api/system?action=cc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: token() }, body)), signal: S.ctrl.signal })
      .then(function(r){
        if(!r.ok || !r.body){ return r.text().then(function(t){ var j = null; try{ j = JSON.parse(t); }catch(e){ j = null; } throw new Error((j && j.error) || ('HTTP ' + r.status)); }); }
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
        function pump(){ return reader.read().then(function(x){
          if(x.done) return;
          buf += dec.decode(x.value, { stream: true });
          var parts = buf.split('\n\n'); buf = parts.pop();
          parts.forEach(function(p){ var l = p.split('\n').filter(function(s){ return s.indexOf('data: ') === 0; })[0]; if(!l) return; var ev = null; try{ ev = JSON.parse(l.slice(6)); }catch(e){ return; } if(ev.ping) return; S.since++; handle(ev); if(ev.done) gotDone = true; });
          return pump();
        }); }
        return pump();
      })
      .then(function(){ return gotDone; });
  }

  function attachLoop(){
    if(!S.runId || S.retries > 6) return Promise.resolve(false);
    S.retries++;
    return stream({ op: 'attach', runId: S.runId, since: S.since }).then(function(done){ if(done) return true; return attachLoop(); }).catch(function(e){ line('… انقطع الاتّصال، أعيد المحاولة (' + S.retries + ')', 'tool'); return new Promise(function(res){ setTimeout(res, 1500); }).then(attachLoop); });
  }

  function submit(){
    var text = String(el.ccInput.value || '').trim();
    if(!text || S.busy) return;
    var cmd = commandWord(text);
    el.ccInput.value = '';
    if(cmd === 'publish') return publish();
    if(cmd === 'merge') return merge(false);
    if(cmd === 'merge-force') return merge(true);
    if(cmd === 'reset') return reset();
    if(cmd === 'status') return refreshStatus();
    if(cmd === 'new'){ S.sessionId = ''; save(); line('🆕 جلسة جديدة.'); return; }
    if(cmd === 'stop'){ el.ccStop.click(); return; }
    var u = document.createElement('div'); u.textContent = '🧑 ' + text; u.style.cssText = 'font-weight:700; margin-top:8px;'; el.ccLog.appendChild(u);
    cur = null; S.since = 0; S.runId = ''; S.retries = 0;
    setBusy(true);
    stream({ op: 'chat', message: text, sessionId: S.sessionId })
      .then(function(done){ if(done) return true; return attachLoop(); })
      .catch(function(e){ if(e && e.name === 'AbortError') return; line('✗ ' + e.message, 'err'); if(S.runId) return attachLoop(); })
      .then(function(){ setBusy(false); refreshStatus(); });
  }

  function publish(){
    if(S.busy) return;
    var title = window.prompt('عنوان طلب السحب (سطر واحد):', '') || '';
    if(!title.trim()) { line('أُلغي النشر — بلا عنوان.', 'tool'); return; }
    line('⬆️ انشر: التزام ودفع وطلب سحب…', 'tool');
    api('publish', { title: title.trim(), message: title.trim() }).then(function(j){
      S.prNumber = j.prNumber || 0; S.prUrl = j.prUrl || ''; save();
      line('✅ نُشر الفرع ' + j.branch + (j.prUrl ? ' — طلب السحب: ' + j.prUrl : ''));
      refreshStatus();
    }).catch(function(e){ line('✗ ' + e.message, 'err'); });
  }
  function merge(force){
    if(S.busy) return;
    var n = S.prNumber || parseInt(window.prompt('رقم طلب السحب:', '') || '0', 10);
    if(!n){ line('لا طلب سحب معروف — انشر أوّلًا أو أدخل الرقم.', 'tool'); return; }
    if(!window.confirm('تدمج طلب السحب #' + n + ' في main الآن؟ Vercel سينشره.' + (force ? ' (بالقوّة رغم فحص أحمر)' : ''))) return;
    line('✅ ادمج #' + n + '…', 'tool');
    api('merge', { prNumber: n, force: !!force }).then(function(j){
      line(j.already ? 'كان مدموجًا من قبل.' : ('تمّ الدمج ' + String(j.sha || '').slice(0, 7) + ' — Vercel ينشر الآن.'));
      S.prNumber = 0; S.prUrl = ''; save(); refreshStatus();
    }).catch(function(e){ line('✗ ' + e.message + (force ? '' : ' — للتجاوز اكتب «ادمج بالقوّة».'), 'err'); });
  }
  function reset(){
    if(S.busy) return;
    if(!window.confirm('تُسقط كلّ التغييرات المحلّيّة وتعود إلى أحدث main؟')) return;
    api('reset', {}).then(function(j){ line('↩️ رجعت نسخة العمل إلى ' + j.base + ' (' + j.head + ').', 'tool'); refreshStatus(); }).catch(function(e){ line('✗ ' + e.message, 'err'); });
  }
  function refreshStatus(){
    api('status').then(function(j){
      el.ccStatus.textContent = 'الفرع: ' + (j.branch || '؟') + ' · تغييرات غير ملتزمة: ' + (j.dirty || 0) + ' · التزامات فوق ' + (j.base || 'main') + ': ' + (j.ahead || 0)
        + ' · النموذج: ' + (j.model || '') + (j.sessionId ? ' · جلسة ' + String(j.sessionId).slice(0, 8) : '') + (j.busy ? ' · ⏳ تشغيل جارٍ' : '') + (S.prUrl ? ' · طلب السحب: ' + S.prUrl : '');
      if(j.busy && j.runId && !S.busy){ S.runId = j.runId; S.since = 0; S.retries = 0; setBusy(true); attachLoop().then(function(){ setBusy(false); refreshStatus(); }); }
    }).catch(function(e){ el.ccStatus.textContent = '⚠️ ' + e.message; });
  }

  if(!mount()){ var n = 0; var id = setInterval(function(){ if(mount() || ++n > 120) clearInterval(id); }, 500); }
  try{ document.addEventListener('omran:auth', function(){ mount(); }); }catch(e){ /* guard-ok */ }
  // v-cc-nav: الدخول قد يتمّ بعد التحميل — كلّ فتح لنافذة الإعدادات يعيد محاولة الإدراج (لا أثر لغير المالك).
  try{
    var dlg = document.getElementById('settingsDialog');
    if(dlg && window.MutationObserver) new MutationObserver(function(){ if(dlg.open) mount(); }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
  }catch(e){ /* guard-ok */ }
})();
