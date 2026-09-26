// app-22-session-new.js — v2
// sessionStorage تُمسح عند إغلاق التبويب/المتصفح, localStorage تبقى.
// كل زيارة جديدة = لا علامة في sessionStorage → ننشئ محادثة جديدة تلقائياً.
// window.__omrS = state يُعيَّن من app-04-i18n-state.js قبل تحميل هذا الملف.
(function(){
'use strict';

var SESS_KEY = 'omran_sess_v1';

// ── اكتشاف الزيارة الجديدة ─────────────────────────────────────────────────
var isNewSession = false;
try{
  if(!sessionStorage.getItem(SESS_KEY)){
    sessionStorage.setItem(SESS_KEY, '1');
    isNewSession = true;
  }
}catch(e){ /* guard-ok — إذا فشل sessionStorage نتجاهل الميزة بهدوء */ }

// ── v-ext-q: سؤال من الرابط (?q=) — إضافة المتصفّح وبحث «om ai» ─────────────
// يُكتب في صندوق المحادثة ولا يُرسل (لا خصم نقاط بلا ضغطة من المستخدم)، ويُمسح من الرابط
// كي لا يعود مع التحديث. يُعاد بعد إنشاء محادثة الزيارة الجديدة فيقع فيها لا في القديمة.
var URL_Q_MAX = 4000;
var urlQ = '';
try{
  var qsp = new URLSearchParams(location.search);
  urlQ = String(qsp.get('q') || '').trim().slice(0, URL_Q_MAX);
  if(qsp.has('q')){
    qsp.delete('q');
    var qrest = qsp.toString();
    history.replaceState(history.state, '', location.pathname + (qrest ? '?' + qrest : '') + location.hash);
  }
}catch(e){ /* guard-ok — رابط غير قابل للقراءة: لا سؤال */ }

function fillUrlQuestion(){
  if(!urlQ) return;
  var inp = document.getElementById('prompt');
  if(!inp){ setTimeout(fillUrlQuestion, 200); return; }
  var cur = String(inp.value || '').trim();
  if(cur && cur !== urlQ) return; // المستخدم بدأ يكتب شيئًا آخر — لا نطمسه
  inp.value = urlQ;
  try{ inp.dispatchEvent(new Event('input', { bubbles: true })); }catch(e){ /* guard-ok — تحجيم الصندوق زينة */ }
  try{ inp.focus(); inp.setSelectionRange(urlQ.length, urlQ.length); }catch(e){ /* guard-ok — التركيز اختياريّ */ }
}

// ── انتظر ظهور المحادثات في القائمة (يعني IDB اكتمل) ─────────────────────
function onHistoryReady(){
  try{
    var s = window.__omrS;
    if(!s || !Array.isArray(s.projects)) return;

    // هل في محادثة فيها رسائل؟
    var anyWithMessages = s.projects.some(function(p){
      return Array.isArray(p.messages) && p.messages.length > 0;
    });
    if(!anyWithMessages) return; // التطبيق أصلاً فارغ

    // المحادثة الحالية موجودة وفيها رسائل؟
    var cur = s.projects.find(function(p){ return p.id === s.currentId; })
           || s.projects[s.projects.length - 1];
    var hasMsgs = cur && Array.isArray(cur.messages) && cur.messages.length > 0;
    if(!hasMsgs) return; // المحادثة الحالية فارغة — لا داعي للتبديل

    // هل المستخدم بدأ يكتب بالفعل؟
    try{
      var inp = document.getElementById('prompt') || document.getElementById('msgInput');
      var typed = inp ? String(inp.value || '').trim() : '';
      if(typed && typed !== urlQ) return;
    }catch(e){ /* guard-ok — فحص اختياري */ }

    // ── أنشئ محادثة جديدة ──────────────────────────────────────────────────
    var newId = 'p_' + Date.now();
    var provKey = '';
    try{ provKey = localStorage.getItem('aiapp_provider') || 'openai'; }catch(e){ /* guard-ok */ provKey = 'openai'; }
    var title = '';
    try{ title = (typeof t === 'function') ? (t('defaultProjectTitle') || 'محادثة جديدة') : 'محادثة جديدة'; }catch(e){ title = 'محادثة جديدة'; }

    s.projects.push({ id: newId, title: title, messages: [], code: '', provider: provKey });
    s.currentId = newId;
    try{ if(typeof mahaClearImageRef === 'function') mahaClearImageRef(); }catch(e){ /* guard-ok — تنظيف اختياري */ }
    try{ if(typeof saveState === 'function') saveState(); }catch(e){ /* guard-ok — فشل الحفظ لا يوقف الميزة */ }
    try{ if(typeof renderAll === 'function') renderAll(); }catch(e){ /* guard-ok — فشل الرسم لا يوقف الميزة */ }

    // ── إشعار خفيف ──────────────────────────────────────────────────────────
    showSessionToast();
    fillUrlQuestion();

  }catch(e){ try{ __swallow(e,'session-new#3'); }catch(_){ /* guard-ok */ } }
}

function waitForHistory(){
  var histEl = document.getElementById('history');
  if(!histEl){ setTimeout(waitForHistory, 200); return; }

  // إذا IDB اكتمل وفي عناصر — شغّل مباشرة
  if(histEl.children.length > 0){ onHistoryReady(); return; }

  // راقب متى تظهر عناصر في القائمة
  var done = false;
  var obs = new MutationObserver(function(){
    if(histEl.children.length > 0 && !done){
      done = true;
      obs.disconnect();
      onHistoryReady();
    }
  });
  try{ obs.observe(histEl, { childList: true }); }catch(e){ /* guard-ok — بيئة قديمة */ }

  // حد أقصى 4 ثانية — نحاول حتى لو ما جاء MutationObserver
  setTimeout(function(){
    if(!done){ done = true; try{ obs.disconnect(); }catch(e){ /* guard-ok */ } onHistoryReady(); }
  }, 4000);
}

function showSessionToast(){
  try{
    if(document.getElementById('sessToast')) return;
    var isAr = (typeof lang === 'undefined' || !lang || lang === 'ar' || lang === 'ur');
    var msg = isAr
      ? '✨ جلسة جديدة — المحادثة السابقة محفوظة في التاريخ'
      : '✨ New session — previous chat saved in history';
    var el = document.createElement('div');
    el.id = 'sessToast';
    el.textContent = msg;
    el.style.cssText = [
      'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
      'background:rgba(212,175,55,.95)','color:#000','font-weight:700','font-size:13px',
      'padding:10px 20px','border-radius:30px','box-shadow:0 4px 24px rgba(0,0,0,.4)',
      'z-index:99999','opacity:0','transition:opacity .35s','pointer-events:none',
      'white-space:nowrap','max-width:90vw','text-align:center',
    ].join(';');
    document.body.appendChild(el);
    requestAnimationFrame(function(){ el.style.opacity = '1'; });
    setTimeout(function(){
      el.style.opacity = '0';
      setTimeout(function(){ try{ el.remove(); }catch(e){ /* guard-ok — عنصر ربما أُزيل */ } }, 400);
    }, 3500);
  }catch(e){ /* guard-ok — Toast زينة فقط، فشله لا يضر */ }
}

// ── ابدأ بعد بناء DOM ──────────────────────────────────────────────────────
// نفس التبويب / تحديث الصفحة = لا محادثة جديدة، والسؤال من الرابط يُكتب في الحاليّة.
function start(){
  fillUrlQuestion();
  if(isNewSession) waitForHistory();
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

})();
