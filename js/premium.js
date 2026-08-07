(function(){
  // Premium is always OFF on each app open (never persisted).
  window.__premiumOn = false;
  const PREMIUM_COST_UI = { claude:20, openai:15, gemini:12 };

  function isPremiumProvider(){
    const p = localStorage.getItem('aiapp_provider') || 'claude';
    return p === 'claude' || p === 'openai' || p === 'gemini';
  }
  window.isPremiumProvider = isPremiumProvider;

  function currentPremiumCost(){
    const p = localStorage.getItem('aiapp_provider') || 'claude';
    return PREMIUM_COST_UI[p] || 0;
  }

  function applyToggleStyle(){
    const btn = document.getElementById('btnPremiumToggle');
    if(!btn) return;
    btn.classList.toggle('premium-on', window.__premiumOn === true);
  }

  function updatePremiumToggleVisibility(){
    const wrap = document.getElementById('premiumToggleWrap');
    const chip = document.getElementById('premiumPointsChip');
    if(!wrap) return;
    if(isPremiumProvider()){
      wrap.classList.add('pt-visible');
      // v452 — أيقونة الزر = شعار عمران ثابتًا (أمر عمران ٧ أغسطس ٢٠٢٦). لا شعار مزوّد.
      try{
        const iconWrap = document.getElementById('premIconWrap');
        if(iconWrap && !iconWrap.querySelector('img')) iconWrap.innerHTML = '<img src="/icons/omran-mark-64.png" alt="" width="17" height="17">';
      }catch(_){ __swallow(_, "misc:index#15"); }
      const hint = document.getElementById('premiumCostHint');
      if(hint) hint.textContent = '\u2212' + currentPremiumCost() + ' \u26A1';
      applyToggleStyle();
      // Fair-Use: balance counter is only shown where a points-charged feature (professional reply) is available.
      if(chip) chip.classList.add('pp-visible');
    } else {
      // Not premium-capable: force OFF + hide toggle AND the points counter (normal usage feels free).
      window.__premiumOn = false;
      applyToggleStyle();
      wrap.classList.remove('pt-visible');
      if(chip) chip.classList.remove('pp-visible');
    }
  }
  window.updatePremiumToggleVisibility = updatePremiumToggleVisibility;

  async function refreshPremiumPoints(){
    const valEl = document.getElementById('premiumPointsChipValue');
    let token = '';
    try{ token = (window.authGet && window.authGet('aiapp_auth_token')) || ''; }catch(_){ __swallow(_, "auth:index#16"); }
    if(!token){ if(valEl) valEl.textContent = '0'; window.__pointsBalance = 0; return; }
    try{
      const r = await fetch('/api/points', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'balance', token }) });
      const d = await r.json();
      if(d && d.ok && d.authed){
        window.__pointsBalance = d.unlimited ? Infinity : d.points;
        if(valEl) valEl.textContent = d.unlimited ? '\u221E' : String(d.points);
      }
    }catch(_){ /* silent */ }
  }
  window.refreshPremiumPoints = refreshPremiumPoints;

  // Floating "−N ⚡" deduction animation near the points chip (~1.2s fade).
  function showPremiumDeduction(){
    try{
      const wrap = document.getElementById('premiumToggleWrap');
      if(!wrap || window.__pointsBalance === Infinity) return;
      const fly = document.createElement('span');
      fly.className = 'premium-deduct-fly';
      fly.textContent = '\u2212' + currentPremiumCost() + ' \u26A1';
      wrap.appendChild(fly);
      requestAnimationFrame(() => { fly.classList.add('gone'); });
      setTimeout(() => { try{ fly.remove(); }catch(_){ __swallow(_, "points:index#17"); } }, 1300);
    }catch(_){ __swallow(_, "points:index#18"); }
  }
  window.showPremiumDeduction = showPremiumDeduction;

  // Open the points/pricing UI so the user can top up.
  function openPremiumBuyPoints(){
    try{
      const btn = document.getElementById('btnSettings');
      if(btn){ btn.click(); }
      if(typeof showSettingsPage === 'function'){ setTimeout(() => { try{ showSettingsPage('pricingSection'); }catch(_){ __swallow(_, "points:index#19"); } }, 60); }
    }catch(_){ __swallow(_, "points:index#20"); }
  }
  window.openPremiumBuyPoints = openPremiumBuyPoints;

  function wireToggle(){
    const btn = document.getElementById('btnPremiumToggle');
    if(!btn || btn._premWired) return;
    btn._premWired = true;
    btn.addEventListener('click', function(){
      let token = '';
      try{ token = (window.authGet && window.authGet('aiapp_auth_token')) || ''; }catch(_){ __swallow(_, "auth:index#21"); }
      if(!token){
        try{ settingsToast(t('premiumNeedLogin')); }catch(_){ __swallow(_, "auth:index#22"); }
        try{ if(window.requireLogin) window.requireLogin('premium'); }catch(_){ __swallow(_, "auth:index#23"); }
        return;
      }
      window.__premiumOn = !window.__premiumOn;
      applyToggleStyle();
      if(window.__premiumOn){
        try{ settingsToast(t('premiumOn')); }catch(_){ __swallow(_, "auth:index#24"); }
      }
    });
  }

  function initPremium(){
    wireToggle();
    updatePremiumToggleVisibility();
    refreshPremiumPoints();
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initPremium);
  } else {
    initPremium();
  }
})();
