// js/app-23-alerts.js — v525
// نظام تنبيهات الطوارئ والأخبار العاجلة — يستطلع السيرفر كل 5 دقائق
// ويعرض popup للطوارئ وبانر للأخبار العاجلة بدون إذن push notifications
(function(){
  'use strict';

  const POLL_MS   = 5 * 60 * 1000;   // استطلاع كل 5 دقائق
  const SEEN_KEY  = 'aiapp_alerts_seen'; // مفتاح localStorage للتنبيهات المشاهَدة
  const MAX_SEEN  = 200;               // حد أقصى للتنبيهات المحفوظة

  function isAr(){ return localStorage.getItem('aiapp_lang') !== 'en'; }

  /* ===== قراءة/كتابة قائمة التنبيهات المشاهَدة ===== */
  function getSeenIds(){
    try{ return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
    catch(e){ return new Set(); }
  }
  function markSeen(id){
    try{
      const s = getSeenIds(); s.add(id);
      const arr = Array.from(s).slice(-MAX_SEEN);
      localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    }catch(e){ /* localStorage ممتلئ — لا بأس */ }
  }

  /* ===== بانر أخبار عاجلة (مستوى breaking) ===== */
  function showBreakingBanner(item){
    let banner = document.getElementById('omranBreakingBanner');
    if(!banner){
      banner = document.createElement('div');
      banner.id = 'omranBreakingBanner';
      banner.style.cssText = [
        'position:fixed','top:0','left:0','right:0','z-index:99998',
        'background:linear-gradient(135deg,#b45309,#78350f)',
        'color:#fff','padding:10px 50px 10px 16px',
        'font-size:14px','font-weight:600','line-height:1.4',
        'box-shadow:0 2px 12px rgba(0,0,0,.4)',
        'cursor:pointer','direction:rtl','text-align:right',
      ].join(';');
      const close = document.createElement('button');
      close.textContent = '✕';
      close.style.cssText = 'position:absolute;top:50%;right:10px;transform:translateY(-50%);background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:4px 8px;';
      close.onclick = function(e){ e.stopPropagation(); banner.remove(); };
      banner.appendChild(close);
      banner.onclick = function(){ if(item.url) window.open(item.url,'_blank'); banner.remove(); };
      document.body.prepend(banner);
    }
    banner.insertBefore(document.createTextNode('📢 ' + item.title), banner.firstChild);
    // يختفي تلقائياً بعد 30 ثانية
    setTimeout(function(){ try{ banner.remove(); }catch(e){ /* guard-ok: البانر قد يكون أُزيل يدويًا أو بالنقر عليه */ } }, 30000);
  }

  /* ===== نافذة طوارئ (مستوى emergency) ===== */
  function showEmergencyModal(item){
    const modal = document.getElementById('omranEmergencyModal');
    if(!modal) return;
    const title  = modal.querySelector('#omranEmAlertTitle');
    const body   = modal.querySelector('#omranEmAlertBody');
    const source = modal.querySelector('#omranEmAlertSource');
    if(title)  title.textContent  = isAr() ? '🚨 تحذير طارئ' : '🚨 Emergency Alert';
    if(body)   body.textContent   = item.title + (item.snippet ? '\n\n' + item.snippet.slice(0, 300) : '');
    if(source) source.textContent = item.url || '';
    modal.style.display = 'flex';
    // صوت تنبيه
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 660, 880].forEach(function(hz, i){
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = hz; g.gain.value = 0.3;
        o.start(ctx.currentTime + i * 0.25);
        o.stop(ctx.currentTime + i * 0.25 + 0.2);
      });
    }catch(e){ /* صوت اختياري */ }
  }

  /* ===== الاستطلاع الرئيسي ===== */
  async function poll(){
    try{
      const res = await fetch('/api/breaking-news', { cache: 'no-store' });
      if(!res.ok) return;
      const data = await res.json();
      const items = data && Array.isArray(data.items) ? data.items : [];
      const seen  = getSeenIds();

      for(const item of items){
        if(seen.has(item.id)) continue;
        markSeen(item.id);
        if(item.level === 'emergency'){
          showEmergencyModal(item);
          break; // نافذة واحدة كافية
        } else if(item.level === 'breaking'){
          showBreakingBanner(item);
          break;
        }
      }
    }catch(e){ /* شبكة — نحاول مرة ثانية بعد 5 دقائق */ }
  }

  /* نبدأ بعد 30 ثانية من فتح الصفحة (نعطي الصفحة وقت للتحميل الكامل) */
  setTimeout(function(){
    poll();
    setInterval(poll, POLL_MS);
  }, 30000);

  /* زر "حسناً" في نافذة الطوارئ */
  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById('omranEmAlertOk');
    const modal = document.getElementById('omranEmergencyModal');
    if(btn && modal) btn.onclick = function(){ modal.style.display = 'none'; };
  });
})();
