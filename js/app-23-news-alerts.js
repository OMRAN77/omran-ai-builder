/* v-news-push (طلب المالك: «الي يريد أخبار … تخليها في الإعدادات زر تفعيل فقط»):
   مفتاح واحد في الإعدادات ← التنبيهات. التفعيل يطلب إذن الإشعارات ويشترك بالدفع
   (نفس اشتراك تنبيهات الصلاة) ويسجّل اشتراك «news» في الخادم؛ كرون التذكيرات
   يدفع كل خبر عاجل/طارئ جديد مرة واحدة حتى والتطبيق مغلق. */
(function(){
  'use strict';
  var KEY_ON = 'aiapp_news_alerts', KEY_ID = 'aiapp_news_alert_id';
  function T(k){ try{ return (typeof t === 'function') ? t(k) : k; }catch(e){ return k; } }
  function token(){ try{ return (typeof authGet === 'function') ? authGet('aiapp_auth_token') : (localStorage.getItem('aiapp_auth_token') || ''); }catch(e){ return ''; } }
  function status(msg){ var el = document.getElementById('newsAlertsStatus'); if(el) el.textContent = msg || ''; }
  function setLocal(on, id){
    try{ localStorage.setItem(KEY_ON, on ? '1' : '0'); if(id) localStorage.setItem(KEY_ID, id); else localStorage.removeItem(KEY_ID); }catch(e){ /* guard-ok */ }
  }
  async function enable(chk){
    var tk = token();
    if(!tk){ chk.checked = false; status(T('newsAlertsLogin')); return; }
    status('…');
    var st = (typeof window.omranEnsurePush === 'function') ? await window.omranEnsurePush() : { ok:false, reason:'nopush' };
    if(!st.ok){
      chk.checked = false;
      status(st.reason === 'denied' ? T('newsAlertsDenied') : (st.reason === 'auth' ? T('newsAlertsLogin') : T('newsAlertsUnavail')));
      return;
    }
    try{
      var r = await fetch('/api/reminders', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + tk }, body: JSON.stringify({ type:'news', message:'الأخبار العاجلة' }) });
      var j = r.ok ? await r.json() : null;
      if(!j || !j.ok){ chk.checked = false; status(T('newsAlertsUnavail')); return; }
      setLocal(true, j.reminder && j.reminder.id);
      status(T('newsAlertsOn'));
    }catch(e){ chk.checked = false; status(T('newsAlertsUnavail')); }
  }
  async function disable(){
    var tk = token(), id = '';
    try{ id = localStorage.getItem(KEY_ID) || ''; }catch(e){ /* guard-ok */ }
    setLocal(false, '');
    status(T('newsAlertsOff'));
    if(tk && id){
      try{ await fetch('/api/reminders?id=' + encodeURIComponent(id), { method:'DELETE', headers:{ Authorization:'Bearer ' + tk } }); }catch(e){ /* guard-ok */ }
    }
  }
  function wire(){
    var chk = document.getElementById('chkNewsAlerts');
    if(!chk || chk.dataset.wired === '1') return;
    chk.dataset.wired = '1';
    try{ chk.checked = localStorage.getItem(KEY_ON) === '1'; }catch(e){ /* guard-ok */ }
    chk.addEventListener('change', function(){ if(chk.checked) enable(chk); else disable(); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  window.omranNewsAlerts = { enable: function(){ var c = document.getElementById('chkNewsAlerts'); if(c){ c.checked = true; enable(c); } } };
})();
