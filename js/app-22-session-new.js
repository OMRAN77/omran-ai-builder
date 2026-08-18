// app-22-session-new.js — v1
// الفكرة: sessionStorage تُمسح عند إغلاق التبويب/المتصفح، localStorage تبقى.
// كل زيارة جديدة = لا علامة في sessionStorage → ننشئ محادثة جديدة تلقائياً.
// المحادثة القديمة تبقى في التاريخ يفتحها المستخدم متى أراد.
(function(){
'use strict';

const SESS_KEY = 'omran_sess_v1';

function newSessionStart(){
  try{
    // ── 1. هل نفس الجلسة؟ ──────────────────────────────────────────────────
    if(sessionStorage.getItem(SESS_KEY)){
      return; // تحديث الصفحة بنفس التبويب — لا شيء نغيره
    }
    // ── 2. دوّن الجلسة الجديدة ───────────────────────────────────────────────
    sessionStorage.setItem(SESS_KEY, '1');

    // ── 3. انتظر اكتمال تحميل IDB (≈800ms يكفي لأبطأ جهاز) ─────────────────
    setTimeout(function(){
      try{
        if(!window.state || !Array.isArray(window.state.projects)) return;

        // هل المحادثة الحالية فارغة أصلاً؟
        var cur = window.state.projects.find(function(p){ return p.id === window.state.currentId; });
        var hasMsg = cur && Array.isArray(cur.messages) && cur.messages.length > 0;
        if(!hasMsg) return; // ما في شيء يُحفظ — لا داعي لمحادثة جديدة

        // هل المستخدم بدأ يكتب؟ — لا نقاطعه
        try{
          var inp = document.getElementById('prompt') || document.getElementById('msgInput');
          if(inp && inp.value && inp.value.trim().length > 0) return;
        }catch(e){ /* guard-ok — prompt element may not exist yet; skip type-check silently */ }

        // ── 4. أنشئ محادثة جديدة وانتقل لها ──────────────────────────────────
        var newId = 'p_' + Date.now();
        var provKey = localStorage.getItem('aiapp_provider') || 'claude';
        var title = (typeof t === 'function')
          ? (t('defaultProjectTitle') || 'محادثة جديدة')
          : 'محادثة جديدة';
        window.state.projects.push({
          id: newId,
          title: title,
          messages: [],
          code: '',
          provider: provKey,
        });
        window.state.currentId = newId;
        try{ if(typeof mahaClearImageRef === 'function') mahaClearImageRef(); }catch(e){ /* guard-ok — optional cleanup; failure is harmless */ }
        try{ if(typeof saveState === 'function') saveState(); }catch(e){ /* guard-ok — save is best-effort; IDB errors must not block session reset */ }
        try{ if(typeof renderAll === 'function') renderAll(); }catch(e){ /* guard-ok — render is best-effort; partial render is acceptable */ }

        // ── 5. بلّغ المستخدم بهدوء ─────────────────────────────────────────────
        showSessionToast();

      }catch(e){ try{ __swallow(e,'session-reset#2'); }catch(_){ /* guard-ok — __swallow may not exist at this point */ } }
    }, 900);

  }catch(e){ try{ __swallow(e,'session-reset#1'); }catch(_){ /* guard-ok — __swallow may not exist at top level */ } }
}

function showSessionToast(){
  try{
    if(document.getElementById('sessToast')) return;
    var isAr = (typeof lang === 'undefined' || !lang || lang==='ar' || lang==='ur');
    var msg = isAr
      ? '✨ جلسة جديدة — المحادثة السابقة محفوظة في التاريخ'
      : '✨ New session — previous chat saved in history';

    var t2 = document.createElement('div');
    t2.id = 'sessToast';
    t2.textContent = msg;
    t2.style.cssText = [
      'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
      'background:var(--accent-surface,rgba(212,175,55,.9))',
      'color:#000','font-weight:600','font-size:13px',
      'padding:9px 18px','border-radius:30px',
      'box-shadow:0 4px 20px rgba(0,0,0,.35)',
      'z-index:99999','opacity:0',
      'transition:opacity .3s','pointer-events:none',
      'white-space:nowrap','max-width:90vw','text-align:center',
    ].join(';');
    document.body.appendChild(t2);
    requestAnimationFrame(function(){ t2.style.opacity='1'; });
    setTimeout(function(){
      t2.style.opacity='0';
      setTimeout(function(){ try{ t2.remove(); }catch(e){ /* guard-ok — toast removal is cosmetic; DOM error ignored */ } }, 400);
    }, 3500);
  }catch(e){ /* guard-ok — toast is cosmetic; any DOM error must not crash the session reset */ }
}

// ── تشغيل بعد تحميل الصفحة ────────────────────────────────────────────────
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', newSessionStart);
} else {
  newSessionStart();
}

})();
