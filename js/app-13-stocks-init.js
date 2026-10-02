/* ---------- 📈 Stocks (Twelve Data, server-side owner key) ---------- */
(function(){
  /* v-store-safe-revert (أمر عمران صريح ٢٢ سبتمبر — بعد تحذيره من مخاطرة رفض
     هواوي بقاعدة 11.4): الأسهم تبقى ظاهرة وتعمل حتى داخل حزمة AppGallery.
     كانت v-store-safe تُرجع مبكرًا هنا فتمنع كل نداء أسعار تحت store-safe؛
     أُزيل الحارس بأمر صريح — راجع knowledge/DECISIONS.md لهذا التاريخ. */
  const modal = $('#stocksModal');
  const btnOpen = $('#btnStocks');
  if(!modal || !btnOpen) return;
  const btnClose = $('#stocksCloseBtn');
  const input = $('#stockSymbolInput');
  const loadBtn = $('#stockLoadBtn');
  const chips = $('#stockChips');
  const intervalSel = $('#stockInterval');
  const statusEl = $('#stockStatus');
  const card = $('#stockQuoteCard');
  const chart = $('#stockChart');

  function setStatus(t){ statusEl.style.display = t ? 'block' : 'none'; statusEl.textContent = t || ''; }

  async function api(payload){
    const r = await fetch('/api/tools?action=stocks', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error || 'HTTP '+r.status);
    return j;
  }

  function fmt(n, d){ return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString('en-US', {maximumFractionDigits: d==null?2:d}) : '—'; }

  function drawChart(values){
    if(!values || values.length < 2){ chart.style.display='none'; return; }
    const ctx = chart.getContext('2d');
    const W = chart.width, H = chart.height, P = 50;
    ctx.clearRect(0,0,W,H);
    const closes = values.map(v=>v.c);
    let min = Math.min(...closes), max = Math.max(...closes);
    if(max === min){ max += 1; min -= 1; }
    const x = i => P + (W - 2*P) * i / (values.length - 1);
    const y = c => H - P - (H - 2*P) * (c - min) / (max - min);
    // grid + labels
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '20px sans-serif'; ctx.lineWidth = 1;
    for(let g=0; g<=4; g++){
      const val = min + (max-min)*g/4, gy = y(val);
      ctx.beginPath(); ctx.moveTo(P, gy); ctx.lineTo(W-P, gy); ctx.stroke();
      ctx.fillText(fmt(val), 4, gy+6);
    }
    const up = closes[closes.length-1] >= closes[0];
    const col = up ? '#22c55e' : '#ef4444';
    // area fill
    const grad = ctx.createLinearGradient(0, P, 0, H-P);
    grad.addColorStop(0, up ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    values.forEach((v,i)=>{ i ? ctx.lineTo(x(i), y(v.c)) : ctx.moveTo(x(0), y(v.c)); });
    ctx.lineTo(x(values.length-1), H-P); ctx.lineTo(x(0), H-P); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    // line
    ctx.beginPath();
    values.forEach((v,i)=>{ i ? ctx.lineTo(x(i), y(v.c)) : ctx.moveTo(x(0), y(v.c)); });
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    // date labels (first, middle, last)
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    [0, Math.floor(values.length/2), values.length-1].forEach(i=>{
      const label = String(values[i].t).slice(0, 10);
      ctx.fillText(label, Math.min(x(i), W - 130), H - 12);
    });
    chart.style.display = 'block';
  }

  async function loadSymbol(sym){
    sym = String(sym || input.value || '').trim().toUpperCase();
    if(!sym) return;
    input.value = sym;
    setStatus('⏳ ...');
    card.style.display = 'none'; chart.style.display = 'none';
    try{
      const [q, s] = await Promise.all([
        api({ mode:'quote', symbol: sym }),
        api({ mode:'series', symbol: sym, interval: intervalSel.value }),
      ]);
      setStatus('');
      $('#stockName').textContent = (q.name || sym) + ' (' + (q.symbol || sym) + ')';
      $('#stockExchange').textContent = [q.exchange, q.currency].filter(Boolean).join(' · ');
      $('#stockPrice').textContent = fmt(q.price);
      const chEl = $('#stockChange');
      const up = (q.change || 0) >= 0;
      chEl.textContent = (up?'▲ +':'▼ ') + fmt(q.change) + ' (' + fmt(q.changePct) + '%)';
      chEl.style.color = up ? '#22c55e' : '#ef4444';
      $('#stockDetails').innerHTML = '';
      [['O', q.open], ['H', q.high], ['L', q.low], ['Vol', q.volume]].forEach(function(pair){
        const sp = document.createElement('span');
        sp.textContent = pair[0] + ': ' + fmt(pair[1], pair[0]==='Vol'?0:2);
        $('#stockDetails').appendChild(sp);
      });
      card.style.display = 'block';
      drawChart(s.values);
    }catch(err){
      setStatus('⚠️ ' + (err && err.message || err));
    }
  }

  /* ----- Live ticker bar ----- */
  const tickerWrap = $('#stockTicker');
  const tickerTrack = $('#stockTickerTrack');
  // v-ticker-noflicker: طبقة GPU ثابتة + إخفاء الوجه الخلفيّ يمنعان وميض النصّ
  // أثناء الحركة على WebView الجوال (بلا أيّ تغيير في السرعة).
  try{
    tickerTrack.style.backfaceVisibility = 'hidden'; tickerTrack.style.webkitBackfaceVisibility = 'hidden';
    // v-ticker-css-anim: تعريف حركة CSS مرّة واحدة — تعمل على معالج الرسم (GPU)
    // بلا جافاسكربت لكلّ إطار وبلا قراءة scrollWidth (كانت تُجبر إعادة تخطيط كلّ
    // إطار = وميض)، ولا تتأثّر بخفض معدّل rAF عند اللمس (لا تسارع عند الضغط).
    if(!document.getElementById('omran-ticker-css')){
      const st = document.createElement('style'); st.id = 'omran-ticker-css';
      st.textContent = '@keyframes omranTickerScroll{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}';
      document.head.appendChild(st);
    }
  }catch(e){ /* guard-ok */ }
  const TICKER_SYMS = (function(){
    try{ const s = JSON.parse(localStorage.getItem('stockTickerSyms')||'null'); if(Array.isArray(s) && s.length) return s.slice(0,5); }catch(e){ __swallow(e, "misc:app-13-stocks-init#1"); }
    return ['AAPL','TSLA','NVDA','MSFT','GOOGL']; /* v-no-crypto: أُزيلت BTC/USD امتثالًا لسياسة متجر هواوي (لا عملات رقمية) */
  })();
  let tickerTimer = null; // v-ticker-css-anim: الحركة صارت CSS، لا rAF

  function renderTicker(items){
    if(!items || !items.length){ tickerWrap.style.display='none'; return; }
    let html = '';
    items.forEach(function(it){
      const up = (it.change||0) >= 0;
      const col = up ? '#22c55e' : '#ef4444';
      html += '<span data-tsym="'+(it.gold?'__GOLD':it.symbol)+'" style="cursor:pointer; padding:0 18px; font-size:13px; font-weight:500;">' +
        it.symbol + ' <span style="color:'+col+';">' + (up?'▲':'▼') + ' ' + fmt(it.price) + (it.unit?(' '+it.unit):'') + (it.noPct?'':' (' + fmt(it.changePct) + '%)') + '</span></span><span style="color:rgba(255,255,255,0.2);">|</span>';
    });
    tickerTrack.innerHTML = html + html; // نسخة مكرّرة للّفّة السلسة (‑50% = نسخة واحدة)
    tickerWrap.style.display = 'block';
    // v-ticker-css-anim: نشغّل حركة CSS بدل حلقة rAF. المسار المكرّر عرضه ضعف نسخة
    // واحدة، فتحريكه ‑50% = نسخة كاملة → لفّة سلسة. المدّة = عرض نسخة ÷ السرعة، تُقرأ
    // scrollWidth مرّة واحدة هنا فقط (لا كلّ إطار). لا وميض، ولا تسارع عند الضغط.
    try{
      const __TSPEED = 36; // بكسل/ثانية = ٠.٦px عند ٦٠ إطار/ث (نفس السرعة الأصلية)
      tickerTrack.style.animation = 'none';
      void tickerTrack.offsetWidth; // يُعيد ضبط الحركة قبل إعادة تشغيلها بالمدّة الجديدة
      const oneCopy = tickerTrack.scrollWidth / 2;
      const dur = (oneCopy > 0) ? (oneCopy / __TSPEED) : 30;
      tickerTrack.style.animation = 'omranTickerScroll ' + dur + 's linear infinite';
    }catch(e){ /* guard-ok — حركة الشريط ترفٌ لا يُسقط العرض */ }
  }

  // v598: تسميات الذهب تُبنى من القاموس، فتُحفظ البيانات الخام ويُعاد الوسم عند تبديل اللغة
  let tickerRaw = null;
  function tickerItems(){
    if(!tickerRaw) return [];
    const items = (tickerRaw.syms || []).slice();
    const g = tickerRaw.gold;
    if(g && g.ozUsd){
      const kt = t('goldKt') || 'Gold {k}K', aed = t('aedUnit') || 'AED';
      [['24',g.gram24],['22',g.gram22],['21',g.gram21],['18',g.gram18]].forEach(function(p){ if(p[1]) items.push({ symbol: kt.replace('{k}', p[0]), price:p[1], change:g.change, changePct:g.changePct, unit:aed, gold:1, noPct:1 }); });
      const ozA = g.ozAed || (g.ozUsd * 3.6725);
      items.push({ symbol: (t('goldOunce')||'Gold Ounce'), price:ozA, change:g.change, changePct:g.changePct, unit:aed, gold:1 });
    }
    return items;
  }
  async function refreshTicker(){
    try{
      const j = await api({ mode:'ticker', symbols: TICKER_SYMS.join(',') });
      let g = null;
      try{ g = await api({ mode:'gold' }); }catch(e){ __swallow(e, "misc:app-13-stocks-init#2"); }
      tickerRaw = { syms: (j && j.items) ? j.items : [], gold: g };
      window.__tickerLatest = tickerRaw; /* v-live-cards: بطاقة الأسهم الحيّة */
      renderTicker(tickerItems());
    }catch(e){ /* keep old ticker on error */ }
  }
  window.__tickerRelabel = function(){ try{ if(tickerRaw) renderTicker(tickerItems()); }catch(e){ __swallow(e, "misc:app-13-stocks-init#relabel"); } };

  function tickerIsCollapsed(){ return localStorage.getItem('tickerCollapsed') === '1'; }
  function applyTickerCollapse(){
    const collapsed = tickerIsCollapsed();
    tickerTrack.style.display = collapsed ? 'none' : 'inline-block';
    tickerWrap.style.minHeight = '';
    tickerWrap.style.padding = collapsed ? '0' : '6px 0';
    tickerWrap.style.height = collapsed ? '0' : '';
    tickerWrap.style.borderBottom = collapsed ? 'none' : '1px solid rgba(255,255,255,0.08)';
    tickerWrap.style.overflow = collapsed ? 'visible' : 'hidden';
    const tbtn = document.getElementById('stockTickerToggle');
    if(tbtn){
      tbtn.style.top = collapsed ? '2px' : '50%';
      tbtn.style.transform = collapsed ? 'none' : 'translateY(-50%)';
      // v-ticker-ai: المطويّ = أيقونة ذكاء ذهبيّة تومض؛ المفتوح = سهم الطيّ العاديّ.
      tbtn.classList.toggle('tickerAiCollapsed', collapsed);
    }
    const icon = document.getElementById('stockTickerToggleIcon');
    if(icon) icon.style.transform = collapsed ? 'rotate(180deg)' : '';
    if(collapsed){
      if(tickerTimer){ clearInterval(tickerTimer); tickerTimer = null; }
      try{ tickerTrack.style.animation = 'none'; }catch(e){ /* guard-ok */ } // v-ticker-css-anim
    }
  }
  function startTicker(){
    tickerWrap.style.display = 'block';
    applyTickerCollapse();
    if(tickerIsCollapsed()) return;
    refreshTicker();
    if(!tickerTimer) tickerTimer = setInterval(refreshTicker, 900000);
  }
  function stopTicker(){
    if(tickerTimer){ clearInterval(tickerTimer); tickerTimer = null; }
    try{ tickerTrack.style.animation = 'none'; }catch(e){ /* guard-ok */ } // v-ticker-css-anim
    tickerWrap.style.display = 'none';
  }
  window.__tickerStart = startTicker;
  window.__tickerStop = stopTicker;
  tickerTrack.addEventListener('click', function(e){
    const s = e.target.closest('[data-tsym]');
    if(s){
      modal.style.display = 'flex';
      const sym = s.getAttribute('data-tsym');
      if(sym === '__GOLD'){ if(window.__stkShowTab) window.__stkShowTab('global'); return; }
      if(window.__stkShowTab) window.__stkShowTab('search');
      loadSymbol(sym);
    }
  });
  // v214: زر طي/فتح بنفس المكان — يسكر الشريط ويفتحه بدون حذف
  try{ if(localStorage.getItem('tickerHidden') === '1'){ localStorage.setItem('tickerCollapsed','1'); localStorage.removeItem('tickerHidden'); } }catch(err){ __swallow(err, "save:app-13-stocks-init#3"); }
  // v-ticker-ai (طلب المالك): الشريط يبدأ مطويًّا كأيقونة ذكاء تومض ما لم يختر المستخدم غير ذلك سابقًا.
  try{ if(localStorage.getItem('tickerCollapsed') === null) localStorage.setItem('tickerCollapsed','1'); }catch(err){ __swallow(err, "save:app-13-stocks-init#3b"); }
  const tickerToggleBtn = $('#stockTickerToggle');
  if(tickerToggleBtn) tickerToggleBtn.addEventListener('click', function(e){
    e.stopPropagation();
    try{ localStorage.setItem('tickerCollapsed', tickerIsCollapsed() ? '0' : '1'); }catch(err){ __swallow(err, "save:app-13-stocks-init#4"); }
    startTicker();
  });
  // الشريط خارجي: يظهر لكل من يفتح التطبيق (ما لم يوقفه المستخدم من الإعدادات).
  startTicker();

  /* ----- AI analyst ----- */
  const analyzeWrap = $('#stockAnalyzeWrap');
  const analyzeBtn = $('#stockAnalyzeBtn');
  const questionEl = $('#stockQuestion');
  const analysisEl = $('#stockAnalysis');
  let currentSym = '';

  analyzeBtn.addEventListener('click', async function(){
    if(!currentSym) return;
    analyzeBtn.disabled = true;
    analysisEl.style.display = 'block';
    analysisEl.textContent = '🤖 ...';
    try{
      const lang = (localStorage.getItem('aiapp_lang')||'ar').slice(0,2);
      const j = await api({ mode:'analyze', symbol: currentSym, question: questionEl.value.trim(), lang: lang });
      analysisEl.textContent = j.analysis || '⚠️';
    }catch(err){
      analysisEl.textContent = '⚠️ ' + (err && err.message || err);
    }
    analyzeBtn.disabled = false;
  });

  /* ----- Learn trading (live-market lessons) ----- */
  const learnBtn = $('#stocksLearnBtn');
  const learnWrap = $('#stockLearnWrap');
  const learnChips = $('#stockLearnChips');
  const learnQ = $('#stockLearnQ');
  const learnAskBtn = $('#stockLearnAskBtn');
  const lessonEl = $('#stockLesson');
  let lessonBusy = false;

  learnBtn.addEventListener('click', function(){ stkShowTab('learn'); });

  async function runLesson(topic, question){
    if(lessonBusy) return;
    lessonBusy = true;
    lessonEl.style.display = 'block';
    lessonEl.textContent = '🎓 ...';
    try{
      const lang = (localStorage.getItem('aiapp_lang')||'ar').slice(0,2);
      const j = await api({ mode:'learn', topic: topic||'', question: question||'', symbol: currentSym || 'AAPL', lang: lang });
      lessonEl.textContent = j.lesson || ('⚠️ ' + (j.claudeError || ''));
    }catch(err){
      lessonEl.textContent = '⚠️ ' + (err && err.message || err);
    }
    lessonBusy = false;
  }
  learnChips.addEventListener('click', function(e){
    const b = e.target.closest('[data-topic]');
    if(b) runLesson(b.getAttribute('data-topic'), '');
  });
  learnAskBtn.addEventListener('click', function(){
    const q = learnQ.value.trim();
    if(q) runLesson('', q);
  });
  learnQ.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); learnAskBtn.click(); } });

  /* ----- 🌍 Global markets ----- */
  const globalWrap = $('#stockGlobalWrap');
  let globalLoaded = false;
  function uiLang(){ return (localStorage.getItem('aiapp_lang')||'ar').slice(0,2); }
  function setTvChart(sym){
    $('#tvChart').src = 'https://s.tradingview.com/widgetembed/?symbol=' + encodeURIComponent(sym) +
      '&interval=60&theme=dark&style=1&locale=' + uiLang() + '&hide_side_toolbar=1&allow_symbol_change=1&withdateranges=1';
  }
  async function loadGlobal(){
    setTvChart('OANDA:XAUUSD');
    const ov = { colorTheme:'dark', dateRange:'1D', showChart:false, locale: uiLang(), isTransparent:true, width:'100%', height:400,
      tabs:[
        { title:'Indices', symbols:[{s:'AMEX:DIA',d:'Dow Jones'},{s:'NASDAQ:QQQ',d:'NASDAQ 100'},{s:'AMEX:SPY',d:'S&P 500'},{s:'FOREXCOM:GRXEUR',d:'DAX'},{s:'TVC:NI225',d:'Nikkei 225'}] },
        { title:'Commodities', symbols:[{s:'OANDA:XAUUSD',d:'Gold'},{s:'TVC:SILVER',d:'Silver'},{s:'TVC:USOIL',d:'Oil WTI'},{s:'TVC:UKOIL',d:'Brent'}] },
        { title:'Forex', symbols:[{s:'FX:EURUSD'},{s:'FX:GBPUSD'},{s:'FX:USDJPY'},{s:'FX_IDC:USDAED',d:'USD/AED'}] }
        /* v-no-crypto: قسم «Crypto» (Bitcoin/Ethereum) أُزيل امتثالًا لسياسة متجر هواوي */
      ] };
    $('#tvOverview').src = 'https://s.tradingview.com/embed-widget/market-overview/?locale=' + uiLang() + '#' + encodeURIComponent(JSON.stringify(ov));
    try{
      const g = await api({ mode:'gold' });
      if(g && g.ozUsd){
        $('#goldOz').textContent = '$' + fmt(g.ozUsd) + '/oz';
        const up = (g.change||0) >= 0;
        const chg = $('#goldChg'); chg.style.color = up ? '#22c55e' : '#ef4444';
        chg.textContent = (up?'▲':'▼') + ' ' + fmt(g.changePct) + '%';
        $('#goldG24').textContent = fmt(g.gram24); $('#goldG22').textContent = fmt(g.gram22); $('#goldG21').textContent = fmt(g.gram21);
        $('#goldCard').style.display = 'block';
      }
    }catch(e){ __swallow(e, "ui:app-13-stocks-init#5"); }
  }
  function showGlobal(){
    globalWrap.style.display = 'block';
    if(!globalLoaded){ globalLoaded = true; loadGlobal(); }
  }
  $('#globalChips').addEventListener('click', function(e){
    const b = e.target.closest('[data-tv]');
    if(b) setTvChart(b.getAttribute('data-tv'));
  });

  /* ----- Fullscreen market-screen mode ----- */
  const fullBtn = $('#stocksFullBtn');
  const panel = modal.firstElementChild;
  let isFull = false;
  fullBtn.addEventListener('click', function(){
    isFull = !isFull;
    if(isFull){
      panel.style.maxWidth = '100%'; panel.style.maxHeight = '100vh'; panel.style.height = '100vh';
      panel.style.borderRadius = '0'; modal.style.padding = '0';
      fullBtn.textContent = '🗗';
      if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function(){ /* المتصفّح يرفض ملء الشاشة بلا إيماءة مستخدم */ });
    }else{
      panel.style.maxWidth = '560px'; panel.style.maxHeight = '90vh'; panel.style.height = '';
      panel.style.borderRadius = '16px'; modal.style.padding = '20px';
      fullBtn.textContent = '🖥️';
      if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function(){ /* لم نكن في ملء الشاشة — لا شيء يُغلق */ });
    }
  });

  const origLoad = loadSymbol;
  loadSymbol = async function(sym){
    await origLoad(sym);
    currentSym = String(input.value || '').trim().toUpperCase();
    if(currentSym && card.style.display !== 'none') analyzeWrap.style.display = 'block';
  };

  const searchWrap = $('#stockSearchWrap');
  const pfWrap = $('#stockPfWrap'); /* v-stocks-paper */
  const stkTabBtns = { global: $('#stocksGlobalBtn'), search: $('#stocksSearchBtn'), learn: learnBtn, pf: $('#stocksPfBtn') };
  function stkShowTab(t){
    searchWrap.style.display = t==='search' ? 'block' : 'none';
    learnWrap.style.display = t==='learn' ? 'block' : 'none';
    globalWrap.style.display = t==='global' ? 'block' : 'none';
    if(pfWrap) pfWrap.style.display = t==='pf' ? 'block' : 'none';
    Object.keys(stkTabBtns).forEach(function(k){ var b = stkTabBtns[k]; if(b) b.style.background = (k===t) ? 'rgba(107,114,128,0.45)' : ''; });
    if(t==='global') showGlobal();
    if(t==='pf') pfLoad();
  }
  window.__stkShowTab = stkShowTab;
  $('#stocksGlobalBtn').addEventListener('click', function(){ stkShowTab('global'); });
  $('#stocksSearchBtn').addEventListener('click', function(){ stkShowTab('search'); });
  var pfBtnEl = $('#stocksPfBtn');
  if(pfBtnEl) pfBtnEl.addEventListener('click', function(){ stkShowTab('pf'); });

  /* ============ 💼 v-stocks-paper: المحفظة التعليمية ============ */
  function pfTok(){ try{ return (window.authGet && authGet('aiapp_auth_token')) || ''; }catch(e){ return ''; } }
  function pfEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function pfCol(v){ return v > 0 ? '#2E9E6B' : (v < 0 ? '#e05252' : 'var(--muted)'); }
  function pfMoney(n){ return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString('en-US', {maximumFractionDigits: 0}) : '—'; }
  var pfBusy = false;

  /* v-pf-i18n (شكوى المالك ٢٩ أغسطس: نافذة الأسهم عربية وسط واجهة المليالم):
     عربي/أردو ← عربي، وغير ذلك ← إنجليزي — نفس قاعدة v-tools-i18n. */
  function stT(arTxt, enTxt){ return (window.__bT) ? window.__bT(arTxt, enTxt) : (isEn()?enTxt:arTxt); }
  function pfRender(d){
    if(!pfWrap) return;
    var p = d.portfolio, bd = d.board || { top: [], rank: null, total: 0 };
    var h = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">'
      + '<span style="font-size:11.5px;background:rgba(212,175,55,.14);border:1px solid rgba(212,175,55,.4);color:#d4af37;border-radius:999px;padding:4px 11px;">' + stT('🎓 وضع تعليمي — أموال افتراضية 100٪','🎓 Learning mode — 100% virtual money') + '</span></div>'
      // البطاقة العلوية: القيمة الكلية والربح/الخسارة
      + '<div style="border:1px solid var(--border,#333);border-radius:14px;padding:14px;background:rgba(255,255,255,.02);margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">'
      + '<div><div style="font-size:11px;color:var(--muted);">' + stT('قيمة المحفظة','Portfolio value') + '</div><div style="font-size:22px;font-weight:700;">$' + pfMoney(p.equity) + '</div></div>'
      + '<div><div style="font-size:11px;color:var(--muted);">' + stT('الكاش المتاح','Available cash') + '</div><div style="font-size:16px;font-weight:600;">$' + pfMoney(p.cash) + '</div></div>'
      + '<div><div style="font-size:11px;color:var(--muted);">' + stT('الربح/الخسارة','Profit/Loss') + '</div><div style="font-size:16px;font-weight:700;color:' + pfCol(p.pl) + ';">' + (p.pl >= 0 ? '+' : '') + pfMoney(p.pl) + ' (' + p.plPct + '%)</div></div>'
      + '</div></div>'
      // نموذج الصفقة
      + '<div style="border:1px solid var(--border,#333);border-radius:14px;padding:12px;margin-bottom:12px;">'
      + '<div style="font-size:12.5px;margin-bottom:8px;font-weight:600;">' + stT('صفقة جديدة (بالسعر الحي الحقيقي)','New trade (at the real live price)') + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      + '<input id="pfSym" placeholder="' + stT('الرمز مثل AAPL','Symbol e.g. AAPL') + '" style="flex:2;min-width:110px;padding:9px;border-radius:9px;border:1px solid var(--border,#444);background:transparent;color:inherit;font:inherit;text-transform:uppercase;">'
      + '<input id="pfQty" type="number" min="1" placeholder="' + stT('الكمية','Quantity') + '" style="flex:1;min-width:70px;padding:9px;border-radius:9px;border:1px solid var(--border,#444);background:transparent;color:inherit;font:inherit;">'
      + '<button class="btn" id="pfBuy" style="background:#2E9E6B;color:#fff;border:none;">' + stT('شراء','Buy') + '</button>'
      + '<button class="btn" id="pfSell" style="background:#e05252;color:#fff;border:none;">' + stT('بيع','Sell') + '</button>'
      + '</div><div id="pfMsg" style="font-size:12px;margin-top:8px;line-height:1.7;"></div></div>';
    // المراكز
    h += '<div style="font-size:12.5px;font-weight:600;margin:0 0 6px;">' + stT('مراكزك','Your positions') + ' (' + p.positions.length + ')</div>';
    if(!p.positions.length){
      h += '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">' + stT('ما عندك أسهم بعد — جرّب أول صفقة تعليمية! اكتب رمزًا مثل AAPL وكمية واضغط شراء.','No shares yet — try your first practice trade! Type a symbol like AAPL, a quantity, then press Buy.') + '</div>';
    } else {
      p.positions.forEach(function(pos){
        h += '<div style="display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(128,128,128,.15);padding:8px 2px;font-size:12.5px;flex-wrap:wrap;">'
          + '<b style="min-width:56px;">' + pfEsc(pos.symbol) + '</b>'
          + '<span style="color:var(--muted);">' + pos.qty + ' ' + stT('سهم','shares') + ' × $' + pos.price + '</span>'
          + '<span style="margin-inline-start:auto;font-weight:700;color:' + pfCol(pos.pl) + ';">' + (pos.pl >= 0 ? '+' : '') + pfMoney(pos.pl) + ' (' + pos.plPct + '%)</span>'
          + '<button class="btn" data-pfsell="' + pfEsc(pos.symbol) + '" data-pfqty="' + pos.qty + '" style="padding:4px 10px;font-size:11px;">' + stT('بيع الكل','Sell all') + '</button>'
          + '<button class="btn" data-pfwhy="' + pfEsc(pos.symbol) + '" style="padding:4px 10px;font-size:11px;">' + stT('🎓 علّمني','🎓 Teach me') + '</button>'
          + '</div>';
      });
    }
    // الترتيب
    h += '<div style="font-size:12.5px;font-weight:600;margin:14px 0 6px;">🏆 ' + stT('ترتيب المتداولين','Traders leaderboard') + ''
      + (bd.rank ? stT(' — مركزك: ', ' — your rank: ') + bd.rank + stT(' من ', ' of ') + bd.total : '') + '</div>';
    (bd.top || []).forEach(function(r){
      h += '<div style="display:flex;gap:8px;font-size:12px;padding:4px 2px;' + '">'
        + '<span style="min-width:26px;">' + (r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank + '.') + '</span>'
        + '<span style="flex:1;">' + pfEsc(r.user) + '</span>'
        + '<b style="color:' + pfCol(r.plPct) + ';">' + (r.plPct >= 0 ? '+' : '') + r.plPct + '%</b></div>';
    });
    // آخر الصفقات + إعادة الضبط
    if((p.trades || []).length){
      h += '<div style="font-size:12.5px;font-weight:600;margin:14px 0 6px;">' + stT('آخر صفقاتك','Your recent trades') + '</div>';
      p.trades.forEach(function(t){
        h += '<div style="font-size:11.5px;color:var(--muted);padding:2px 2px;">' + (t.side === 'buy' ? stT('🟢 شراء','🟢 Buy') : stT('🔴 بيع','🔴 Sell')) + ' ' + t.qty + ' × ' + pfEsc(t.sym) + ' @ $' + t.price + '</div>';
      });
    }
    h += '<div id="pfLesson" style="display:none;margin-top:12px;border:1px solid rgba(212,175,55,.35);border-radius:12px;padding:12px;font-size:12.5px;line-height:1.9;white-space:pre-wrap;"></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;gap:8px;flex-wrap:wrap;">'
      + '<span style="font-size:10.5px;color:var(--muted);">' + stT('تداول تجريبي تعليمي — أسعار حقيقية وأموال افتراضية، ليست نصيحة استثمارية.','Educational paper trading — real prices, virtual money. Not investment advice.') + '</span>'
      + '<button class="btn" id="pfReset" style="font-size:11px;padding:5px 11px;">' + stT('🔄 ابدأ من جديد (100 ألف)','🔄 Start over (100k)') + '</button></div>';
    pfWrap.innerHTML = h;
    pfWire();
  }

  function pfMsgShow(txt, ok){ var m = $('#pfMsg'); if(m){ m.textContent = txt; m.style.color = ok ? '#2E9E6B' : '#e05252'; } }

  function pfTrade(side, sym, qty){
    if(pfBusy) return;
    sym = String(sym || ($('#pfSym') && $('#pfSym').value) || '').trim().toUpperCase();
    qty = Math.floor(Number(qty != null ? qty : ($('#pfQty') && $('#pfQty').value)));
    if(!sym || !qty || qty <= 0){ pfMsgShow(stT('اكتب رمز السهم والكمية أولًا','Enter a stock symbol and quantity first'), false); return; }
    pfBusy = true; pfMsgShow(stT('⏳ ننفذ الصفقة بالسعر الحي…','⏳ Executing at the live price…'), true);
    api({ mode:'pf-trade', side: side, tradeSymbol: sym, qty: qty, token: pfTok(), guestId: (window.getGuestId ? getGuestId() : '') })
      .then(function(d){
        pfBusy = false; pfRender(d);
        var last = d.portfolio.trades && d.portfolio.trades[0];
        pfMsgShow(last ? ('✅ تمت: ' + (last.side === 'buy' ? 'شراء' : 'بيع') + ' ' + last.qty + ' × ' + last.sym + ' بسعر $' + last.price + (last.side === 'buy' ? ' — 🎓 درس: لا تضع كل كاشك في سهم واحد، التنويع يحميك.' : ' — 🎓 درس: البيع يثبّت الربح أو يوقف الخسارة، والقرار الجيد يُتخذ بخطة لا بعاطفة.')) : '✅ تمت الصفقة', true);
      })
      .catch(function(e){ pfBusy = false; pfMsgShow('⚠️ ' + (e.message || stT('تعذرت الصفقة','Trade failed')), false); });
  }

  function pfWire(){
    var b1 = $('#pfBuy'), b2 = $('#pfSell'), rs = $('#pfReset');
    if(b1) b1.onclick = function(){ pfTrade('buy'); };
    if(b2) b2.onclick = function(){ pfTrade('sell'); };
    if(rs) rs.onclick = function(){
      if(!confirm('تبدأ من جديد بـ 100 ألف افتراضية؟ محفظتك الحالية وصفقاتك ستُمسح.')) return;
      api({ mode:'pf-reset', token: pfTok() }).then(pfRender).catch(function(e){ pfMsgShow('⚠️ ' + e.message, false); });
    };
    pfWrap.querySelectorAll('[data-pfsell]').forEach(function(b){
      b.onclick = function(){ pfTrade('sell', b.getAttribute('data-pfsell'), b.getAttribute('data-pfqty')); };
    });
    pfWrap.querySelectorAll('[data-pfwhy]').forEach(function(b){
      b.onclick = function(){
        var sym = b.getAttribute('data-pfwhy');
        var box = $('#pfLesson');
        box.style.display = 'block'; box.textContent = '🎓 معلمك يجهز درسًا على ' + sym + ' بالأرقام الحية…';
        api({ mode:'learn', symbol: sym, question: 'أنا مبتدئ وأملك هذا السهم في محفظتي التعليمية. علمني ماذا أراقب فيه الآن (الاتجاه، الدعم والمقاومة، متى أفكر بالبيع) بالأرقام الحية.', lang: (typeof lang !== 'undefined' ? lang : 'ar'), token: pfTok(), guestId: (window.getGuestId ? getGuestId() : '') })
          .then(function(d){ box.textContent = d.lesson || 'تعذر الدرس الآن — حاول بعد قليل.'; })
          .catch(function(e){ box.textContent = '⚠️ ' + (e.message || 'تعذر الدرس'); });
      };
    });
  }

  /* v649: قراءة من قاموس اللغة مع سقوط آمن على العربيّة إن غاب المفتاح. */
  function pfT(k, ar){ try{ var v = (typeof t === 'function') ? t(k) : ''; return (v && v !== k) ? v : ar; }catch(e){ return ar; } }
  function pfLoad(){
    if(!pfWrap) return;
    if(!pfTok()){
      pfWrap.innerHTML = '<div style="text-align:center;padding:26px 10px;font-size:13px;line-height:2;"><b>' + pfT('pfGuestTitle', '💼 المحفظة التعليمية') + '</b><br>' + pfT('pfGuestIntro', '100 ألف افتراضية تتداول بها بأسعار السوق الحقيقية وتنافس بقية المستخدمين 🏆') + '<br><span style="color:var(--muted);font-size:12px;">' + pfT('pfGuestLogin', 'سجّل الدخول لبدء محفظتك — تقدمك يُحفظ في حسابك.') + '</span></div>';
      return;
    }
    pfWrap.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px;">' + pfT('pfLoadingBox', '⏳ نجهز محفظتك…') + '</div>';
    api({ mode:'pf-get', token: pfTok() }).then(pfRender)
      .catch(function(e){ pfWrap.innerHTML = '<div style="text-align:center;padding:20px;color:#e05252;font-size:13px;">⚠️ ' + pfEsc(e.message || pfT('pfLoadFail', 'تعذر تحميل المحفظة')) + '</div>'; });
  }
  btnOpen.addEventListener('click', function(){ modal.style.display = 'flex'; stkShowTab('global'); });
  btnClose.addEventListener('click', function(){
    modal.style.display = 'none';
    if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function(){ /* لم نكن في ملء الشاشة — لا شيء يُغلق */ });
  });
  modal.addEventListener('click', function(e){ if(e.target === modal && !isFull){ modal.style.display = 'none'; } });
  loadBtn.addEventListener('click', function(){ loadSymbol(); });
  input.addEventListener('keydown', function(e){ if(e.key === 'Enter') loadSymbol(); });
  intervalSel.addEventListener('change', function(){ if(input.value.trim()) loadSymbol(); });
  chips.addEventListener('click', function(e){
    const b = e.target.closest('[data-sym]');
    if(b) loadSymbol(b.getAttribute('data-sym'));
  });
})();


/* ---------- 🏗️ Construction/Contracting Design (Gemini text+image, server-side owner key) ---------- */
(function(){
  const modal = $('#constructionModal');
  const btnOpen = $('#btnConstruction');
  const btnClose = $('#constructionCloseBtn');
  const btnRun = $('#constructionRunBtn');
  const typeEl = $('#constructionType');
  const floorsEl = $('#constructionFloors');
  const areaEl = $('#constructionArea');
  const styleEl = $('#constructionStyle');
  const notesEl = $('#constructionNotes');
  const budgetEl = $('#constructionBudget');
  const statusEl = $('#constructionStatus');
  const resultImageWrap = $('#constructionResultImageWrap');
  const resultImageEl = $('#constructionResultImage');
  const downloadLink = $('#constructionDownloadLink');
  const photoWrap = $('#constructionPhotoImageWrap');
  const photoImageEl = $('#constructionPhotoImage');
  const photoDownloadLink = $('#constructionPhotoDownloadLink');
  const interiorWrap = $('#constructionInteriorImageWrap');
  const interiorImageEl = $('#constructionInteriorImage');
  const interiorDownloadLink = $('#constructionInteriorDownloadLink');
  const modePlanEl = $('#constructionModePlan');
  const modePhotoEl = $('#constructionModePhoto');
  const libraryBtn = $('#constructionLibraryBtn');
  const libraryWrap = $('#constructionLibraryWrap');
  const libraryEmptyEl = $('#constructionLibraryEmpty');
  const planTextEl = $('#constructionPlanText');
  const viewsSection = $('#constructionViewsSection');
  const angleBtns = document.querySelectorAll('#constructionViewsSection [data-angle]');
  const angleStatusEl = $('#constructionAngleStatus');
  const angleImageWrap = $('#constructionAngleImageWrap');
  const angleImageEl = $('#constructionAngleImage');
  const angleDownloadLink = $('#constructionAngleDownloadLink');
  const roomSelectEl = $('#constructionRoomSelect');
  const roomColorEl = $('#constructionRoomColor');
  const roomViewBtn = $('#constructionRoomViewBtn');
  const roomStatusEl = $('#constructionRoomStatus');
  const roomImageWrap = $('#constructionRoomImageWrap');
  const roomImageEl = $('#constructionRoomImage');
  const roomDownloadLink = $('#constructionRoomDownloadLink');
  const plotEl = $('#constructionPlot');
  const emirateEl = $('#constructionEmirate');
  const boqWrap = $('#constructionBoqWrap');
  const exportRow = $('#constructionExportRow');
  const boqBtn = $('#constructionBoqBtn');
  const pdfBtn = $('#constructionPdfBtn');
  let lastData = null;
  if(!modal || !btnOpen) return;

  function currentParams(){
    return {
      buildingType: typeEl.value,
      floors: floorsEl.value,
      area: areaEl.value,
      style: styleEl.value,
      notes: notesEl.value,
      plotArea: plotEl ? plotEl.value : '',
      emirate: emirateEl ? emirateEl.value : '',
    };
  }

  function csvEsc(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function boqRows(){ return (lastData && Array.isArray(lastData.boq) && lastData.boq.length > 1) ? lastData.boq : null; }
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderBoq(rows){
    if(!boqWrap) return;
    if(!rows){ boqWrap.style.display = 'none'; boqWrap.innerHTML = ''; return; }
    let html = '<table style="width:100%; border-collapse:collapse; font-size:12.5px;">';
    rows.forEach(function(r, i){
      const g = i === 0 ? 'th' : 'td';
      html += '<tr>' + r.map(function(c){
        return '<' + g + ' style="border:1px solid var(--border,#333); padding:5px 7px; text-align:start;' + (i === 0 ? 'background:rgba(15,118,110,.28);' : '') + '">' + esc(c) + '</' + g + '>';
      }).join('') + '</tr>';
    });
    boqWrap.innerHTML = html + '</table>';
    boqWrap.style.display = 'block';
  }

  function isEn(){ return localStorage.getItem('aiapp_lang') === 'en'; }
  function bT(a,e){ return (typeof window!=='undefined'&&window.__bT) ? window.__bT(a,e) : (isEn()?e:a); }
  function t(key){
    /* v-global-first: المترجم العام (الـ14 لغة) أولًا — المحلي يعرف عربي/إنجليزي فقط */
    try{ if(typeof window.t === 'function' && window.t !== t){ const g = window.t(key); if(g && g !== key) return g; } }catch(e){ /* لم يجهز بعد */ }
    const dict = (typeof I18N !== 'undefined') ? I18N[bT('ar','en')] : null;
    return (dict && dict[key]) || key;
  }
  function setStatus(text){
    statusEl.style.display = text ? 'block' : 'none';
    statusEl.textContent = text || '';
  }
  let refImage = null;
  function showQuota(d){
    const b = $('#constructionQuotaBadge');
    if(!b || !d || typeof d.remaining !== 'number') return;
    b.style.display = 'inline-block';
    b.textContent = (bT('المتبقّي اليوم: ','Left today: ')) + d.remaining + ' / ' + (d.dailyLimit || 6);
  }
  function shrinkRef(b64, mime){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try{
          const s = Math.min(1, 768 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
        }catch(e){ resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = 'data:' + (mime || 'image/png') + ';base64,' + b64;
    });
  }

  btnOpen.onclick = () => {
    modal.style.display = 'flex';
    if(typeof closeHeaderMenu === 'function') closeHeaderMenu();
  };
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  if(libraryBtn){
    libraryBtn.onclick = async () => {
      libraryBtn.disabled = true;
      libraryEmptyEl.style.display = 'none';
      libraryWrap.style.display = 'none';
      libraryWrap.innerHTML = '';
      try{
        const res = await fetch('/api/construction-library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ buildingType: typeEl.value, floors: floorsEl.value, area: areaEl.value }),
        });
        const data = await res.json();
        const items = (data && data.items) || [];
        if(!items.length){
          libraryEmptyEl.style.display = 'block';
        }else{
          items.forEach((item) => {
            const img = document.createElement('img');
            img.src = 'data:' + (item.planMimeType || 'image/png') + ';base64,' + item.planImageBase64;
            img.style.cssText = 'width:100%; aspect-ratio:1; object-fit:cover; border-radius:6px; cursor:pointer; background:#000;';
            img.title = (item.floors || '') + ' | ' + (item.area || '') + ' m²';
            img.onclick = () => {
              resultImageEl.src = img.src;
              downloadLink.href = img.src;
              resultImageWrap.style.display = 'block';
              resultImageWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            };
            libraryWrap.appendChild(img);
          });
          libraryWrap.style.display = 'grid';
        }
      }catch(e){
        libraryEmptyEl.style.display = 'block';
      }finally{
        libraryBtn.disabled = false;
      }
    };
  }

  const showGenerationFailure = () => setStatus(bT('⚠️ تعذّر إكمال التصميم الآن؛ قد تستغرق العملية وقتًا أطول أو تكون الخدمة مشغولة مؤقتًا. حاول مرة أخرى.','⚠️ Design generation took too long or the service is temporarily busy. Please try again.'));

  btnRun.onclick = async () => {
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){
      setStatus(t('designAiNeedLogin'));
      return;
    }
    if(modePlanEl && modePhotoEl && !modePlanEl.checked && !modePhotoEl.checked){
      setStatus(bT('اختر نوع نتيجة واحدًا على الأقل.','Pick at least one output type.'));
      return;
    }
    btnRun.disabled = true;
    photoWrap.style.display = 'none';
    interiorWrap.style.display = 'none';
    resultImageWrap.style.display = 'none';
    planTextEl.style.display = 'none';
    viewsSection.style.display = 'none';
    lastData = null;
    renderBoq(null);
    if(exportRow) exportRow.style.display = 'none';
    setStatus(t('constructionGenerating'));

    try{
      const params = Object.assign(currentParams(), {
        /* v-cons-i18n: التقرير بلغة التطبيق */
        lang: (typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar',
        budget: budgetEl ? budgetEl.value : '',
        annexes: Array.from(document.querySelectorAll('.constructionAnnex:checked')).map((el) => el.value),
        includeInterior: !!($('#constructionIncludeInterior') && $('#constructionIncludeInterior').checked),
        includePlan: !modePlanEl || modePlanEl.checked,
        includePhoto: !!(modePhotoEl && modePhotoEl.checked),
        token,
      });
      const parts = [];
      if(params.includePlan) parts.push('plan');
      if(params.includePhoto) parts.push('photo');
      if(params.includeInterior) parts.push('interior');
      let data = {};
      let jobTicket = null;

      for(let i = 0; i < parts.length; i++){
        setStatus(t('constructionGenerating') + ' (' + (i + 1) + '/' + parts.length + ')');
        const res = await fetch('/api/construction-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({}, params, { part: parts[i], parts, jobTicket })),
        });
        const partData = await res.json();
        if(!res.ok){
          if(partData.error === 'auth_required'){
            setStatus(t('designAiNeedLogin'));
          }else if(partData.error === 'daily_limit_reached'){
            setStatus(t('designAiLimitReached'));
          }else{
            showGenerationFailure();
          }
          return;
        }
        jobTicket = partData.jobTicket || jobTicket;
        ['imageBase64', 'mimeType', 'photoImageBase64', 'photoMimeType', 'interiorImageBase64', 'interiorMimeType', 'planText', 'boq', 'remaining', 'dailyLimit'].forEach((key) => {
          if(partData[key] !== null && partData[key] !== undefined) data[key] = partData[key];
        });
        if(data.imageBase64){
          resultImageEl.src = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
          downloadLink.href = resultImageEl.src;
          resultImageWrap.style.display = 'block';
        }
        if(data.photoImageBase64){
          photoImageEl.src = 'data:' + (data.photoMimeType || 'image/png') + ';base64,' + data.photoImageBase64;
          photoDownloadLink.href = photoImageEl.src;
          photoWrap.style.display = 'block';
        }
        if(data.interiorImageBase64){
          interiorImageEl.src = 'data:' + (data.interiorMimeType || 'image/png') + ';base64,' + data.interiorImageBase64;
          interiorDownloadLink.href = interiorImageEl.src;
          interiorWrap.style.display = 'block';
        }
        lastData = data;
        if(data.planText){
          planTextEl.textContent = data.planText;
          planTextEl.style.display = 'block';
        }
        renderBoq(boqRows());
        if(exportRow && (data.planText || boqRows())) exportRow.style.display = 'grid';
        showQuota(data);
      }

      viewsSection.style.display = 'block';
      angleImageWrap.style.display = 'none';
      roomImageWrap.style.display = 'none';
      refImage = data.photoImageBase64 ? await shrinkRef(data.photoImageBase64, data.photoMimeType) : null;
      setStatus('');
    }catch(e){
      showGenerationFailure();
    }finally{
      btnRun.disabled = false;
    }
  };

  if(boqBtn) boqBtn.onclick = function(){
    const rows = boqRows();
    if(!rows){ setStatus(bT('⚠️ لا يوجد جدول كميات في هذه النتيجة.','⚠️ This result has no bill of quantities.')); return; }
    const csv = '\ufeff' + rows.map(function(r){ return r.map(csvEsc).join(','); }).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'omran-boq.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ try{ URL.revokeObjectURL(a.href); a.remove(); }catch(e){} }, 1500);
  };

  if(pdfBtn) pdfBtn.onclick = async function(){
    if(!lastData){ setStatus(bT('⚠️ ولّد التصميم أولًا.','⚠️ Generate a design first.')); return; }
    const fig = function(b64, mime, cap){
      return b64 ? ('<figure><img src="data:' + (mime || 'image/png') + ';base64,' + b64 + '"><figcaption>' + cap + '</figcaption></figure>') : '';
    };
    const rows = boqRows();
    let tbl = '';
    if(rows){
      tbl = '<h2>📊 جدول الكميات</h2><table>' + rows.map(function(r, i){
        const g = i === 0 ? 'th' : 'td';
        return '<tr>' + r.map(function(c){ return '<' + g + '>' + esc(c) + '</' + g + '>'; }).join('') + '</tr>';
      }).join('') + '</table>';
    }
    const oTxt = function(el){ return (el && el.options[el.selectedIndex]) ? el.options[el.selectedIndex].text : ''; };
    const meta = [oTxt(typeEl), floorsEl.value + ' أدوار', areaEl.value + ' م² بناء',
      (plotEl && plotEl.value ? plotEl.value + ' م² أرض' : ''), oTxt(styleEl),
      (emirateEl && emirateEl.value ? oTxt(emirateEl) : '')].filter(Boolean).join(' · ');
    const __docHtml = ('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير مشروع البناء</title><style>'
      + 'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:0;padding:0 26px 26px;color:#111;}'
      + 'header{background:linear-gradient(135deg,#0f766e,#134e4a);color:#fff;margin:0 -26px 18px;padding:20px 26px;}'
      + 'header h1{margin:0;font-size:21px}header p{margin:6px 0 0;font-size:13px;opacity:.92}'
      + 'h2{font-size:16px;border-bottom:2px solid #0f766e;padding-bottom:4px;margin:20px 0 8px}'
      + 'table{width:100%;border-collapse:collapse;font-size:12px}'
      + 'th,td{border:1px solid #bbb;padding:5px 7px;text-align:right}th{background:#e6f2f0}'
      + 'figure{margin:0 0 12px;page-break-inside:avoid}img{width:100%;border:1px solid #ccc;border-radius:6px}'
      + 'figcaption{font-size:11.5px;color:#555;margin-top:4px;text-align:center}'
      + 'pre{white-space:pre-wrap;font-family:inherit;font-size:12.5px;line-height:1.85;margin:0}'
      + 'footer{margin-top:22px;font-size:11px;color:#666;border-top:1px solid #ddd;padding-top:8px}'
      + '@media print{header,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
      + '</style></head><body><header><h1>🏗️ تقرير مشروع البناء</h1><p>' + esc(meta)
      + '</p><p>' + esc(new Date().toLocaleDateString('ar-AE')) + '</p></header>'
      + fig(lastData.imageBase64, lastData.mimeType, 'المخطط المعماري')
      + fig(lastData.photoImageBase64, lastData.photoMimeType, 'الواجهة الخارجية')
      + fig(lastData.interiorImageBase64, lastData.interiorMimeType, 'التصميم الداخلي')
      + '<h2>📋 التفاصيل والتكلفة</h2><pre>' + esc(lastData.planText || '') + '</pre>' + tbl
      + '<footer>تصوّر أولي فقط — لا يغني عن مهندس مرخّص أو رخصة بناء رسمية. صادر من تطبيق عمران.</footer>'
      + '</body></html>');
    /* v-cons-pdf (شكوى عمران «موضوع PDF ما يشتغل»): داخل التطبيق نافذة الطباعة
       ميتة — نصدّر ملف PDF حقيقيًا؛ والطباعة تبقى للكمبيوتر. */
    let __inApp = false; try{ __inApp = typeof window.omranLikelyApp === 'function' && window.omranLikelyApp(); }catch(e){ /* guard-ok — cosmetic */ }
    async function __fileExport(){
      if(typeof window.omranExportHtmlAsPdfFile !== 'function') return false;
      try{
        const __st = (__docHtml.match(/<style[\s\S]*?<\/style>/gi) || []).join('');
        const __bm = __docHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        await window.omranExportHtmlAsPdfFile(__st + (__bm ? __bm[1] : __docHtml), { rtl: true, fileName: 'omran-construction.pdf' });
        return true;
      }catch(e){ return false; }
    }
    if(__inApp && await __fileExport()) return;
    const w = window.open('', '_blank');
    if(!w){
      if(await __fileExport()) return;
      setStatus(bT('⚠️ اسمح بالنوافذ المنبثقة لتصدير التقرير.','⚠️ Allow pop-ups to export the report.'));
      return;
    }
    w.document.write(__docHtml);
    w.document.close();
    setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 800);
  };

  angleBtns.forEach((btn) => {
    btn.onclick = async () => {
      const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
      if(!token){ angleStatusEl.style.display = 'block'; angleStatusEl.textContent = t('designAiNeedLogin'); return; }
      angleBtns.forEach((b) => { b.disabled = true; });
      angleImageWrap.style.display = 'none';
      angleStatusEl.style.display = 'block';
      angleStatusEl.textContent = t('constructionGenerating');
      try{
        const res = await fetch('/api/construction-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign(currentParams(), { mode: 'angle', angle: btn.getAttribute('data-angle'), refImageBase64: refImage, token })),
        });
        const data = await res.json();
        if(!res.ok){
          if(data.error === 'auth_required') angleStatusEl.textContent = t('designAiNeedLogin');
          else if(data.error === 'daily_limit_reached') angleStatusEl.textContent = t('designAiLimitReached');
          else angleStatusEl.textContent = (bT('❌ خطأ: ','❌ Error: ')) + (data.error || 'unknown');
          return;
        }
        angleImageEl.src = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
        angleDownloadLink.href = angleImageEl.src;
        angleImageWrap.style.display = 'block';
        angleStatusEl.style.display = 'none';
        showQuota(data);
      }catch(e){
        angleStatusEl.textContent = (bT('❌ خطأ: ','❌ Error: ')) + (e && e.message ? e.message : String(e));
      }finally{
        angleBtns.forEach((b) => { b.disabled = false; });
      }
    };
  });

  roomViewBtn.onclick = async () => {
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){ roomStatusEl.style.display = 'block'; roomStatusEl.textContent = t('designAiNeedLogin'); return; }
    roomViewBtn.disabled = true;
    roomImageWrap.style.display = 'none';
    roomStatusEl.style.display = 'block';
    roomStatusEl.textContent = t('constructionGenerating');
    try{
      const res = await fetch('/api/construction-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign(currentParams(), { mode: 'room', room: roomSelectEl.value, color: roomColorEl.value, token })),
      });
      const data = await res.json();
      if(!res.ok){
        if(data.error === 'auth_required') roomStatusEl.textContent = t('designAiNeedLogin');
        else if(data.error === 'daily_limit_reached') roomStatusEl.textContent = t('designAiLimitReached');
        else roomStatusEl.textContent = (bT('❌ خطأ: ','❌ Error: ')) + (data.error || 'unknown');
        return;
      }
      roomImageEl.src = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
      roomDownloadLink.href = roomImageEl.src;
      roomImageWrap.style.display = 'block';
      roomStatusEl.style.display = 'none';
      showQuota(data);
    }catch(e){
      roomStatusEl.textContent = (bT('❌ خطأ: ','❌ Error: ')) + (e && e.message ? e.message : String(e));
    }finally{
      roomViewBtn.disabled = false;
    }
  };
})();

/* ---------- 💄 AI Style Studio (Gemini image, server-side owner key) ---------- */
(function(){
  const modal = $('#studioAiModal');
  const btnOpen = $('#btnStudioAI');
  const btnClose = $('#studioAiCloseBtn');
  const btnGenerate = $('#studioAiGenerateBtn');
  const tabsWrap = $('#studioAiTabs');
  const imageAWrap = $('#studioAiImageAWrap');
  const imageBWrap = $('#studioAiImageBWrap');
  const imageALabelEl = $('#studioAiImageALabelEl');
  const fileBtnA = $('#studioAiFileBtnA');
  const fileInputA = $('#studioAiFileInputA');
  const fileNameA = $('#studioAiFileNameA');
  const previewA = $('#studioAiSourcePreviewA');
  const fileBtnB = $('#studioAiFileBtnB');
  const fileInputB = $('#studioAiFileInputB');
  const fileNameB = $('#studioAiFileNameB');
  const previewB = $('#studioAiSourcePreviewB');
  const styleWrap = $('#studioAiStyleWrap');
  const styleEl = $('#studioAiStyle');
  const descriptionEl = $('#studioAiDescription');
  const statusEl = $('#studioAiStatus');
  const resultEl = $('#studioAiResult');
  const downloadEl = $('#studioAiDownloadLink');
  const resultWrap = $('#studioAiResultWrap');
  const beforeWrap = $('#studioAiBeforeWrap');
  const beforeImg = $('#studioAiBeforeImg');
  const multiAngleEl = $('#studioAiMultiAngle');
  const favSaveBtn = $('#studioAiFavoriteSaveBtn');
  const favoritesBtn = $('#studioAiFavoritesBtn');
  const favoritesPanel = $('#studioAiFavoritesPanel');
  const profileFaceShapeEl = $('#studioProfileFaceShape');
  const profileSkinEl = $('#studioProfileSkin');
  const profileHairEl = $('#studioProfileHair');
  const profileSaveBtn = $('#studioProfileSaveBtn');
  const occasionEl = $('#studioAiOccasion');
  const suggestBtn = $('#studioAiSuggestBtn');
  const suggestionsEl = $('#studioAiSuggestions');
  const compareChecksEl = $('#studioAiCompareChecks');
  const compareBtn = $('#studioAiCompareBtn');
  const compareStatusEl = $('#studioAiCompareStatus');
  const compareResultsEl = $('#studioAiCompareResults');
  const heritageCompareWrap = $('#studioAiHeritageCompareWrap');
  const heritageCompareBtn = $('#studioAiHeritageCompareBtn');
  const heritageCompareStatusEl = $('#studioAiHeritageCompareStatus');
  const heritageCompareResultsEl = $('#studioAiHeritageCompareResults');
  if(!modal || !btnOpen) return;

  function isEn(){ return localStorage.getItem('aiapp_lang') === 'en'; }
  function bT(a,e){ return (typeof window!=='undefined'&&window.__bT) ? window.__bT(a,e) : (isEn()?e:a); }
  function lang7(){ return (typeof currentLang === 'function') ? currentLang() : (localStorage.getItem('aiapp_lang') || 'ar'); }
  function t2(key){
    const dict = (typeof window.__i18nDict === 'function') ? window.__i18nDict(lang7()) : ((typeof I18N !== 'undefined') ? I18N[lang7()] : null);
    return (dict && dict[key]) || key;
  }

  // Per-feature dropdown options. Only ar/en are fully authored; other UI
  // languages fall back to the English label for these short tag words
  // (same approach as system voice names elsewhere in the app).
  const STUDIO_OPTIONS = {
    hair: [
      { value:'black', ar:'⚫ أسود', en:'⚫ Black', fr:'⚫ Noir', hi:'⚫ काला', ur:'⚫ کالا', bn:'⚫ কালো', ne:'⚫ कालो' },
      { value:'brown', ar:'🟤 بني', en:'🟤 Brown', fr:'🟤 Brun', hi:'🟤 भूरा', ur:'🟤 بھورا', bn:'🟤 বাদামী', ne:'🟤 खैरो' },
      { value:'blonde', ar:'🟡 أشقر', en:'🟡 Blonde', fr:'🟡 Blond', hi:'🟡 सुनहरे', ur:'🟡 سنہرا', bn:'🟡 সোনালি', ne:'🟡 सुनौलो' },
      { value:'red', ar:'🔴 أحمر', en:'🔴 Red', fr:'🔴 Rouge', hi:'🔴 लाल', ur:'🔴 سرخ', bn:'🔴 লাল', ne:'🔴 रातो' },
      { value:'silver', ar:'⚪ فضي/رمادي', en:'⚪ Silver/Gray', fr:'⚪ Argenté/Gris', hi:'⚪ चांदी/स्लेटी', ur:'⚪ چاندی/سرمئی', bn:'⚪ রূপালি/ধূসর', ne:'⚪ चाँदी/खरानी' },
      { value:'colorful', ar:'🌈 ملوّن', en:'🌈 Colorful', fr:'🌈 Coloré', hi:'🌈 रंगीन', ur:'🌈 رنگین', bn:'🌈 রঙিন', ne:'🌈 रंगीन' },
      { value:'ombre', ar:'🎨 أومبري', en:'🎨 Ombre' },
      { value:'highlights', ar:'✨ هايلايت', en:'✨ Highlights' },
      { value:'platinum', ar:'❄️ بلاتيني', en:'❄️ Platinum' },
      { value:'burgundy', ar:'🍷 عنابي', en:'🍷 Burgundy' },
      { value:'blue', ar:'💙 أزرق جريء', en:'💙 Electric blue' },
      { value:'rose', ar:'🌹 وردي ذهبي', en:'🌹 Rose gold' },
      { value:'curly', ar:'🌀 كيرلي', en:'🌀 Curly' },
      { value:'straight', ar:'📏 مفرود ناعم', en:'📏 Sleek straight' },
      { value:'waves', ar:'🌊 ويفي هوليودي', en:'🌊 Hollywood waves' },
      { value:'bob', ar:'💇 بوب قصير', en:'💇 Bob cut' },
      { value:'pixie', ar:'🧚 بيكسي', en:'🧚 Pixie cut' },
      { value:'longlayers', ar:'👩‍🦱 طبقات طويلة', en:'👩‍🦱 Long layers' },
      /* v-studio-more-looks: دفعة الأشكال الجديدة (طلب المالك «زيد الأشكال») */
      { value:'balayage', ar:'🎨 بالياج مدمج', en:'🎨 Balayage' },
      { value:'copper', ar:'🔶 نحاسي لامع', en:'🔶 Copper' },
      { value:'ashbrown', ar:'🌫️ بني رمادي', en:'🌫️ Ash brown' },
      { value:'honey', ar:'🍯 عسلي', en:'🍯 Honey beige' },
      { value:'braids', ar:'🪢 ضفائر', en:'🪢 Braids' },
      { value:'updo', ar:'👑 شينيون مرفوع', en:'👑 Elegant updo' },
      { value:'bangs', ar:'✂️ غرة أمامية', en:'✂️ Full bangs' },
      { value:'shag', ar:'🎸 شاغ طبقات', en:'🎸 Shag cut' },
      { value:'jetwaves', ar:'🌀 موجات كلاسيكية', en:'🌀 Finger waves' },
      { value:'darkroots', ar:'🌓 جذور غامقة', en:'🌓 Shadow roots' },
      /* v-studio-100: دفعة الـ١٠٠ شكل */
      { value:'blueblack', ar:'🌑 أسود مزرقّ', en:'Blue-black' },
      { value:'espresso', ar:'☕ إسبريسو', en:'Espresso' },
      { value:'mocha', ar:'🍫 موكا', en:'Mocha' },
      { value:'caramelhair', ar:'🍯 كراميل', en:'Caramel' },
      { value:'toffee', ar:'🍬 توفي', en:'Toffee' },
      { value:'beigeblonde', ar:'🥂 أشقر بيج', en:'Beige blonde' },
      { value:'butterblonde', ar:'🧈 أشقر زبدة', en:'Butter blonde' },
      { value:'strawberryblonde', ar:'🍓 أشقر فراولي', en:'Strawberry blonde' },
      { value:'gingerhair', ar:'🦊 زنجبيلي', en:'Ginger' },
      { value:'mahogany', ar:'🍷 ماهوجني', en:'Mahogany' },
      { value:'cherryred', ar:'🍒 أحمر كرزي', en:'Cherry red' },
      { value:'plumhair', ar:'🍆 برقوقي', en:'Plum' },
      { value:'lavenderhair', ar:'💜 لافندر', en:'Lavender' },
      { value:'pastelpink', ar:'🌸 وردي باستيل', en:'Pastel pink' },
      { value:'peachhair', ar:'🍑 خوخي', en:'Peach' },
      { value:'minthair', ar:'🌿 نعناعي', en:'Mint' },
      { value:'tealhair', ar:'🦚 تركوازي', en:'Teal' },
      { value:'navyhair', ar:'🔵 أزرق كحلي', en:'Navy' },
      { value:'emeraldhair', ar:'💚 زمردي', en:'Emerald' },
      { value:'charcoalhair', ar:'🩶 رمادي فحمي', en:'Charcoal' },
      { value:'sunsetombre', ar:'🌅 أومبري غروب', en:'Sunset ombré' },
      { value:'moneypiece', ar:'💫 خصلات أمامية', en:'Money piece' },
      { value:'babylights', ar:'✨ بيبي لايتس', en:'Babylights' },
      { value:'lowlights', ar:'🌑 لو لايتس', en:'Lowlights' },
      { value:'chunky90s', ar:'🎞️ خصلات التسعينات', en:'Chunky 90s' },
      { value:'peekaboo', ar:'🙈 لون مخفيّ', en:'Peekaboo colour' },
      { value:'underlayer', ar:'🎨 الطبقة السفلية ملوّنة', en:'Coloured underlayer' },
      { value:'splitdye', ar:'🪓 لونان منفصلان', en:'Split dye' },
      { value:'ecaille', ar:'🐢 إيكاي', en:'Tortoiseshell' },
      { value:'bronde', ar:'🌗 برونزي أشقر', en:'Bronde' },
      { value:'butterflycut', ar:'🦋 قصّة فراشة', en:'Butterfly cut' },
      { value:'wolfcut', ar:'🐺 وولف كت', en:'Wolf cut' },
      { value:'bluntcut', ar:'📏 قصّة مستقيمة', en:'Blunt cut' },
      { value:'lob', ar:'💇‍♀️ لوب', en:'Lob' },
      { value:'frenchbob', ar:'🇫🇷 بوب فرنسي', en:'French bob' },
      { value:'curtainbangs', ar:'🪟 غرة ستارة', en:'Curtain bangs' },
      { value:'babybangs', ar:'✂️ غرة قصيرة', en:'Baby bangs' },
      { value:'sidebangs', ar:'↘️ غرة جانبية', en:'Side bangs' },
      { value:'curlybob', ar:'🌀 بوب كيرلي', en:'Curly bob' },
      { value:'mullet', ar:'🎸 مولت', en:'Modern mullet' },
      { value:'feathered', ar:'🪶 ريشي', en:'Feathered' },
      { value:'beachwaves', ar:'🏖️ موج الشاطئ', en:'Beach waves' },
      { value:'deepwaves', ar:'🌊 موج عميق', en:'Deep waves' },
      { value:'tightcurls', ar:'➰ كيرلي ناعم', en:'Tight curls' },
      { value:'afrohair', ar:'🦱 أفرو', en:'Afro' },
      { value:'coils', ar:'🌀 كويلز', en:'Coils' },
      { value:'crimped', ar:'〰️ مكرمش', en:'Crimped' },
      { value:'sleekbun', ar:'🎀 كعكة ناعمة', en:'Sleek bun' },
      { value:'highpony', ar:'🐴 ذيل مرفوع', en:'High ponytail' },
      { value:'lowpony', ar:'🎗️ ذيل منخفض', en:'Low ponytail' },
      { value:'bubblebraid', ar:'🫧 ضفيرة فقاعية', en:'Bubble braid' },
      { value:'fishtail', ar:'🐟 ضفيرة سمكة', en:'Fishtail braid' },
      { value:'dutchbraids', ar:'🧵 ضفائر هولندية', en:'Dutch braids' },
      { value:'halobraid', ar:'👼 ضفيرة تاج', en:'Halo braid' },
      { value:'spacebuns', ar:'🪐 كعكتان', en:'Space buns' },
      { value:'topknot', ar:'🍥 توب نوت', en:'Top knot' },
      { value:'messybun', ar:'🪺 كعكة عفوية', en:'Messy bun' },
      { value:'clawclip', ar:'🦀 ملقط', en:'Claw clip' },
      { value:'halfup', ar:'🎀 نصف مرفوع', en:'Half up' },
      { value:'wetlook', ar:'💧 مبلّل', en:'Wet look' },
      { value:'blowout', ar:'💨 سشوار منفوش', en:'Voluminous blowout' },
      { value:'bouffant', ar:'👑 بوفان', en:'Bouffant' },
      { value:'victoryrolls', ar:'🎺 فكتوري رولز', en:'Victory rolls' },
      { value:'slickedback', ar:'🕶️ مسحوب للخلف', en:'Slicked back' },
      { value:'sidepart2', ar:'↔️ فرق جانبي عميق', en:'Deep side part' },
      { value:'middlepart', ar:'🪞 فرق وسط', en:'Middle part' },
      { value:'hairbraidsgulf', ar:'🧶 ضفائر خليجية', en:'Gulf braids' },
      { value:'cornrows', ar:'🌽 كورن رو', en:'Cornrows' },
      { value:'locs', ar:'🪢 لوكس', en:'Locs' },
      { value:'twistout', ar:'🔁 تويست آوت', en:'Twist out' },
      { value:'perm', ar:'💈 برم', en:'Perm' },
      { value:'keratin', ar:'🪶 كيراتين', en:'Keratin smooth' },
      { value:'volumeshort', ar:'⬆️ حجم للشعر القصير', en:'Volumised short' },
      { value:'thinning', ar:'🌾 كثافة أعلى', en:'Fuller hair' },
      { value:'greyblend', ar:'🩶 دمج الشيب', en:'Grey blending' },
      { value:'naturalgrey', ar:'⚪ شيب طبيعي أنيق', en:'Natural silver' },
    ],
    nails: [
      { value:'red', ar:'🔴 أحمر', en:'🔴 Red', fr:'🔴 Rouge', hi:'🔴 लाल', ur:'🔴 سرخ', bn:'🔴 লাল', ne:'🔴 रातो' },
      { value:'nude', ar:'🟤 نودي', en:'🟤 Nude', fr:'🟤 Nude', hi:'🟤 न्यूड', ur:'🟤 نیوڈ', bn:'🟤 নুড', ne:'🟤 न्युड' },
      { value:'black', ar:'⚫ أسود', en:'⚫ Black', fr:'⚫ Noir', hi:'⚫ काला', ur:'⚫ کالا', bn:'⚫ কালো', ne:'⚫ कालो' },
      { value:'french', ar:'⚪ فرنشي', en:'⚪ French', fr:'⚪ Française', hi:'⚪ फ्रेंच', ur:'⚪ فرانسیسی', bn:'⚪ ফরাসি', ne:'⚪ फ्रेन्च' },
      { value:'pink', ar:'🌸 وردي', en:'🌸 Pink', fr:'🌸 Rose', hi:'🌸 गुलाबी', ur:'🌸 گلابی', bn:'🌸 গোলাপি', ne:'🌸 गुलाबी' },
      { value:'gold', ar:'🟡 ذهبي', en:'🟡 Gold', fr:'🟡 Doré', hi:'🟡 सुनहरा', ur:'🟡 سنہری', bn:'🟡 সোনালি', ne:'🟡 सुनौलो' },
      { value:'ombrenails', ar:'🎨 أومبري متدرج', en:'🎨 Ombre' },
      { value:'glitter', ar:'✨ جليتر', en:'✨ Glitter' },
      { value:'mattegray', ar:'🩶 مطفي أنيق', en:'🩶 Matte greige' },
      { value:'chrome', ar:'🪞 كروم مرايا', en:'🪞 Chrome' },
      { value:'marble', ar:'🏛️ رخامي', en:'🏛️ Marble art' },
      { value:'artnails', ar:'🌸 رسم زهري', en:'🌸 Floral art' },
      /* v-studio-more-looks */
      { value:'coffin', ar:'⚰️ كوفن طويل', en:'⚰️ Coffin' },
      { value:'stiletto', ar:'📌 ستيليتو مدبب', en:'📌 Stiletto' },
      { value:'squareshort', ar:'◼️ مربع قصير', en:'◼️ Short square' },
      { value:'almond', ar:'🌰 لوزي', en:'🌰 Almond' },
      { value:'babyboomer', ar:'🤍 بيبي بومر', en:'🤍 Baby boomer' },
      { value:'velvetnails', ar:'🟣 مخملي', en:'🟣 Velvet' },
      { value:'auranails', ar:'🌈 أورا متوهج', en:'🌈 Aura' },
      { value:'catseyenails', ar:'🐈 عين القطة', en:'🐈 Cat-eye' },
      { value:'pearlnails', ar:'🦪 لؤلؤي', en:'🦪 Pearl' },
      { value:'animalprint', ar:'🐆 نمري', en:'🐆 Leopard print' },
      { value:'khaleejinails', ar:'✨ خليجي بالفويل', en:'✨ Gulf gold foil' },
      { value:'frenchcolor', ar:'🎀 فرنشي ملوّن', en:'🎀 Colour French' },
      /* v-studio-100: دفعة الـ١٠٠ شكل */
      { value:'oval', ar:'🥚 بيضاوي', en:'Oval' },
      { value:'squoval', ar:'🔲 مربع بأطراف ناعمة', en:'Squoval' },
      { value:'ballerina', ar:'🩰 باليرينا', en:'Ballerina' },
      { value:'flarenails', ar:'📐 مفتوح الأطراف', en:'Flare' },
      { value:'lipsticknails', ar:'💄 قصّة مائلة', en:'Lipstick cut' },
      { value:'extrashort', ar:'✂️ قصير جدًّا', en:'Extra short' },
      { value:'xlnails', ar:'📏 طويل جدًّا', en:'Extra long' },
      { value:'whitenails', ar:'⚪ أبيض', en:'Milky white' },
      { value:'navynails', ar:'🔵 كحلي', en:'Navy' },
      { value:'emeraldnails', ar:'💚 زمردي', en:'Emerald' },
      { value:'lilacnails', ar:'💜 ليلكي', en:'Lilac' },
      { value:'mintnails', ar:'🌿 نعناعي', en:'Mint' },
      { value:'peachnails', ar:'🍑 خوخي', en:'Peach' },
      { value:'burgundynails', ar:'🍷 عنّابي', en:'Burgundy' },
      { value:'taupenails', ar:'🤎 تاوبي', en:'Taupe' },
      { value:'cherrynails', ar:'🍒 كرزي', en:'Cherry' },
      { value:'coralnails', ar:'🪸 مرجاني', en:'Coral' },
      { value:'skybluenails', ar:'🩵 سماوي', en:'Sky blue' },
      { value:'mustardnails', ar:'🟡 خردلي', en:'Mustard' },
      { value:'chocolatenails', ar:'🍫 شوكولاتي', en:'Chocolate' },
      { value:'rosegoldnails', ar:'🌹 وردي ذهبي', en:'Rose gold' },
      { value:'bronzenails', ar:'🥉 برونزي', en:'Bronze' },
      { value:'tealnails', ar:'🦚 تركوازي غامق', en:'Teal' },
      { value:'holographic', ar:'🌈 هولوغرافيك', en:'Holographic' },
      { value:'jellynails', ar:'🍬 جيلي شفاف', en:'Jelly' },
      { value:'glazeddonut', ar:'🍩 جليزد دونت', en:'Glazed donut' },
      { value:'sugarnails', ar:'🧂 سكّري', en:'Sugar' },
      { value:'foilnails', ar:'🪙 فويل معدني', en:'Foil' },
      { value:'shimmernails', ar:'✨ شيمر ناعم', en:'Shimmer' },
      { value:'microfrench', ar:'🤏 فرنشي رفيع', en:'Micro French' },
      { value:'doublefrench', ar:'⚡ فرنشي مزدوج', en:'Double French' },
      { value:'vfrench', ar:'📌 فرنشي مثلّث', en:'V French' },
      { value:'diagonalfrench', ar:'↗️ فرنشي مائل', en:'Diagonal French' },
      { value:'reversefrench', ar:'🌗 فرنشي معكوس', en:'Reverse French' },
      { value:'halfmoon', ar:'🌙 نصف قمر', en:'Half moon' },
      { value:'swirlnails', ar:'🌀 دوّامات', en:'Swirls' },
      { value:'checkernails', ar:'🏁 شطرنج', en:'Checkerboard' },
      { value:'polkadots', ar:'⚪ نقاط', en:'Polka dots' },
      { value:'stripesnails', ar:'📏 خطوط', en:'Stripes' },
      { value:'plaidnails', ar:'🧣 كاروهات', en:'Plaid' },
      { value:'zebranails', ar:'🦓 زيبرا', en:'Zebra' },
      { value:'cownails', ar:'🐄 بقري', en:'Cow print' },
      { value:'flamesnails', ar:'🔥 لهب', en:'Flames' },
      { value:'smileynails', ar:'🙂 سمايلات', en:'Smileys' },
      { value:'starsnails', ar:'⭐ نجوم', en:'Stars' },
      { value:'heartsnails', ar:'💗 قلوب', en:'Hearts' },
      { value:'evileyenails', ar:'🧿 عين زرقاء', en:'Evil eye' },
      { value:'butterflynails', ar:'🦋 فراشات', en:'Butterflies' },
      { value:'fruitnails', ar:'🍓 فواكه', en:'Fruit' },
      { value:'floralnails2', ar:'🌷 زهور رسم يدوي', en:'Hand-painted florals' },
      { value:'tortoiseshell', ar:'🐢 تورتواز', en:'Tortoiseshell' },
      { value:'watercolornails', ar:'🎨 ألوان مائية', en:'Watercolour' },
      { value:'negativenails', ar:'⬜ فراغ سالب', en:'Negative space' },
      { value:'lacenails', ar:'🕸️ دانتيل', en:'Lace' },
      { value:'abstractnails', ar:'➰ خطوط حرّة', en:'Abstract' },
      { value:'auroranails', ar:'🌌 أورورا', en:'Aurora' },
      { value:'crystalnails', ar:'💎 كريستالات', en:'Crystals' },
      { value:'pearlnails2', ar:'🦪 لؤلؤ ثلاثي الأبعاد', en:'3D pearls' },
      { value:'flowers3d', ar:'🌸 زهور بارزة', en:'3D flowers' },
      { value:'charmnails', ar:'🔗 تعليقات', en:'Charms' },
      { value:'chromebutterfly', ar:'🦋 كروم لامع', en:'Chrome art' },
      { value:'bridalnails', ar:'👰 نيلز عروس', en:'Bridal' },
      { value:'eidnails', ar:'🌙 نيلز العيد', en:'Eid' },
      { value:'ramadannails', ar:'🕌 نيلز رمضان', en:'Ramadan' },
      { value:'nationalnails', ar:'🇦🇪 اليوم الوطني', en:'National day' },
      { value:'graduationnails', ar:'🎓 نيلز التخرّج', en:'Graduation' },
      { value:'partynails', ar:'🎉 سهرة جليتر', en:'Party glitter' },
      { value:'officenails', ar:'💼 دوام هادئ', en:'Office nude' },
      { value:'gelnatural', ar:'💅 جل طبيعي', en:'Natural gel' },
      { value:'builderclear', ar:'🧴 تقوية شفّافة', en:'Clear builder' },
      { value:'khaleejibride', ar:'👑 خليجي فاخر', en:'Gulf luxe' },
      { value:'minimalline', ar:'➖ خطّ واحد', en:'Single line' },
      { value:'duotone', ar:'🎭 لونان', en:'Two tone' },
      { value:'accentonly', ar:'☝️ إصبع مميّز', en:'One accent' },
      { value:'gradientglitter', ar:'🌠 جليتر متدرّج', en:'Glitter fade' },
      { value:'velvetred', ar:'❤️‍🔥 مخملي أحمر', en:'Red velvet' },
      { value:'snownails', ar:'❄️ ثلجي', en:'Snowflake' },
    ],
    makeup: [
      { value:'natural', ar:'🌿 طبيعي خفيف', en:'🌿 Natural', fr:'🌿 Naturel', hi:'🌿 प्राकृतिक', ur:'🌿 قدرتی', bn:'🌿 প্রাকৃতিক', ne:'🌿 प्राकृतिक' },
      { value:'glam', ar:'✨ سهرة فخمة', en:'✨ Glam Evening', fr:'✨ Soirée glamour', hi:'✨ ग्लैम इवनिंग', ur:'✨ گلیم ایوننگ', bn:'✨ গ্ল্যাম ইভনিং', ne:'✨ ग्ल्याम साँझ' },
      { value:'smokey', ar:'⚫ سموكي', en:'⚫ Smokey Eyes', fr:'⚫ Yeux smoky', hi:'⚫ स्मोकी आइज़', ur:'⚫ اسموکی آئیز', bn:'⚫ স্মোকি আইজ', ne:'⚫ स्मोकी आँखा' },
      { value:'redlips', ar:'💋 أحمر شفاه جريء', en:'💋 Bold Red Lips', fr:'💋 Lèvres rouges audacieuses', hi:'💋 बोल्ड रेड लिप्स', ur:'💋 بولڈ ریڈ لپس', bn:'💋 বোল্ড রেড লিপস', ne:'💋 बोल्ड रातो ओठ' },
      { value:'bridal', ar:'👰 عروس', en:'👰 Bridal', fr:'👰 Mariée', hi:'👰 दुल्हन', ur:'👰 دلہن', bn:'👰 কনে', ne:'👰 दुलही' },
      { value:'softglam', ar:'🌟 سوفت قلام', en:'🌟 Soft glam' },
      { value:'kohl', ar:'🖤 كحل عربي', en:'🖤 Arabic kohl' },
      { value:'dewy', ar:'💧 ديوي مشرق', en:'💧 Dewy glow' },
      { value:'matte', ar:'🤎 مطفي كامل', en:'🤎 Full matte' },
      { value:'editorial', ar:'🎨 جريء ملوّن', en:'🎨 Editorial' },
      /* v-studio-variety: أربعة خيارات مكياج جديدة (طلب المالك «زيد من التنويع») */
      { value:'coral', ar:'🍑 كورال صيفي', en:'🍑 Summer coral' },
      { value:'goldeye', ar:'🥇 عيون ذهبية', en:'🥇 Gold shimmer eyes' },
      { value:'glassskin', ar:'🫧 بشرة زجاجية', en:'🫧 Glass skin' },
      { value:'berry', ar:'🍇 توتي غامق', en:'🍇 Deep berry' },
      /* v-studio-more-looks */
      { value:'bronzed', ar:'🥉 برونزي شمسي', en:'🥉 Bronzed' },
      { value:'cutcrease', ar:'✂️ كت كريز', en:'✂️ Cut crease' },
      { value:'siren', ar:'🐍 عيون سايرن', en:'🐍 Siren eyes' },
      { value:'dolleyes', ar:'🎀 عيون دمية', en:'🎀 Doll eyes' },
      { value:'latte', ar:'☕ لاتيه ترابي', en:'☕ Latte' },
      { value:'cherry', ar:'🍒 كرزي لامع', en:'🍒 Cherry' },
      { value:'festival', ar:'🎉 قليتر مهرجانات', en:'🎉 Festival glitter' },
      { value:'softmatteGulf', ar:'🖤 سهرة خليجية', en:'🖤 Gulf soirée' },
      { value:'lashliner', ar:'🪶 خطّ الرموش فقط', en:'Lash line only' },
      { value:'bridgecontour', ar:'👃 نحت الأنف', en:'Nose sculpt' },
      { value:'romanticglow', ar:'💞 رومانسي', en:'Romantic glow' },
      /* v-studio-100: دفعة الـ١٠٠ شكل */
      { value:'wingedliner', ar:'➰ آيلاينر مجنّح', en:'Winged liner' },
      { value:'doubleliner', ar:'⚡ آيلاينر مزدوج', en:'Double liner' },
      { value:'whiteliner', ar:'🤍 آيلاينر أبيض', en:'White liner' },
      { value:'smudgedliner', ar:'🖤 كحل مدخّن', en:'Smudged liner' },
      { value:'haloeye', ar:'🌗 عين الهالة', en:'Halo eye' },
      { value:'sunseteyes', ar:'🌅 عيون الغروب', en:'Sunset eyes' },
      { value:'purplesmokey', ar:'💜 سموكي بنفسجي', en:'Purple smokey' },
      { value:'bluesmokey', ar:'💙 سموكي أزرق', en:'Blue smokey' },
      { value:'greensmokey', ar:'💚 سموكي أخضر', en:'Green smokey' },
      { value:'coppereye', ar:'🥉 عيون نحاسية', en:'Copper eye' },
      { value:'silvereye', ar:'🥈 عيون فضّية', en:'Silver eye' },
      { value:'glittercut', ar:'✨ كت كريز بالجليتر', en:'Glitter cut crease' },
      { value:'floatingliner', ar:'🛸 آيلاينر عائم', en:'Floating liner' },
      { value:'foxeye', ar:'🦊 عيون الثعلب', en:'Fox eye' },
      { value:'puppyeye', ar:'🐶 عيون مستديرة', en:'Puppy eye' },
      { value:'lowerlash', ar:'👁️ تركيز سفلي', en:'Lower lash focus' },
      { value:'coloredmascara', ar:'🎨 ماسكارا ملوّنة', en:'Coloured mascara' },
      { value:'spikylashes', ar:'🌵 رموش شوكية', en:'Spiky lashes' },
      { value:'boldbrows', ar:'🪶 حواجب كثّة', en:'Bold brows' },
      { value:'bleachbrow', ar:'🎭 حواجب باهتة', en:'Editorial brows' },
      { value:'nudeover', ar:'💋 شفاه مرسومة', en:'Overlined nude' },
      { value:'ninetieslip', ar:'🤎 بنّي التسعينات', en:'90s brown lip' },
      { value:'winelip', ar:'🍷 شفاه نبيذية', en:'Wine lip' },
      { value:'fuchsialip', ar:'💗 فوشيا', en:'Fuchsia lip' },
      { value:'glasslips', ar:'💧 شفاه زجاجية', en:'Glass lips' },
      { value:'blurredlip', ar:'🌫️ شفاه ضبابية', en:'Blurred lip' },
      { value:'lipstain', ar:'🍓 تنت طبيعي', en:'Lip stain' },
      { value:'blushdraping', ar:'🩰 بلاشر ممتد', en:'Blush draping' },
      { value:'freckledlook', ar:'🟤 نمش مرسوم', en:'Faux freckles' },
      { value:'strobing', ar:'💡 هايلايتر قوي', en:'Strobing' },
      { value:'heavycontour', ar:'🪄 كونتور قوي', en:'Sculpted contour' },
      { value:'monochromepink', ar:'🌸 مونوكروم وردي', en:'Pink monochrome' },
      { value:'monochromepeach', ar:'🍑 مونوكروم خوخي', en:'Peach monochrome' },
      { value:'cleangirl', ar:'🧼 كلين جيرل', en:'Clean girl' },
      { value:'oldmoneymakeup', ar:'🏛️ أولد ماني', en:'Old money' },
      { value:'igari', ar:'🌡️ خدود محمّرة', en:'Igari flush' },
      { value:'arabicglam', ar:'🖤 قلام عربي', en:'Arabic glam' },
      { value:'turkishglam', ar:'🇹🇷 قلام تركي', en:'Turkish glam' },
      { value:'bollywoodmakeup', ar:'🪷 بوليوود', en:'Bollywood' },
      { value:'sixtiesmod', ar:'👓 ستّينات مود', en:'60s mod' },
      { value:'seventiesdisco', ar:'🪩 سبعينات ديسكو', en:'70s disco' },
      { value:'eightiesneon', ar:'🎸 ثمانينات نيون', en:'80s neon' },
      { value:'ninetiesgrunge', ar:'🎧 تسعينات غرنج', en:'90s grunge' },
      { value:'ytwokfrost', ar:'💿 واي تو كي', en:'Y2K frost' },
      { value:'gothicmakeup', ar:'🦇 قوطي', en:'Gothic' },
      { value:'avantgarde', ar:'🖼️ فنّي جريء', en:'Avant-garde' },
      { value:'rhinestone', ar:'💎 كريستالات', en:'Rhinestones' },
      { value:'mermaidpearl', ar:'🧜 لؤلؤي', en:'Pearl glow' },
      { value:'butterflyliner', ar:'🦋 آيلاينر فراشة', en:'Butterfly liner' },
      { value:'hennanightmakeup', ar:'🌿 ليلة الحنّاء', en:'Henna night' },
      { value:'bridalgulf', ar:'👰 عروس خليجية', en:'Gulf bride' },
      { value:'bridalindian', ar:'🪔 عروس هندية', en:'Indian bride' },
      { value:'engagementsoft', ar:'💍 خطوبة ناعم', en:'Engagement soft' },
      { value:'eidmakeup', ar:'🌙 مكياج العيد', en:'Eid' },
      { value:'ramadanmakeup', ar:'🕌 مكياج رمضان', en:'Ramadan soft' },
      { value:'photoshoothd', ar:'📸 تصوير احترافي', en:'HD photoshoot' },
      { value:'tvstudio', ar:'🎬 استوديو تلفزيوني', en:'TV studio' },
      { value:'officemakeup', ar:'💼 دوام يومي', en:'Everyday office' },
      { value:'gymproof', ar:'🏃 مقاوم للعرق', en:'Sweat-proof' },
      { value:'sensitiveminimal', ar:'🌱 بشرة حسّاسة', en:'Minimal sensitive' },
      { value:'dramaticlashes', ar:'👁️‍🗨️ رموش دراماتيكية', en:'Dramatic lashes' },
      { value:'underliner', ar:'🔻 خطّ سفلي ملوّن', en:'Coloured underliner' },
      { value:'siren2', ar:'🌊 سايرن ناعم', en:'Soft siren' },
      { value:'cherryblush', ar:'🍒 بلاشر كرزي', en:'Cherry blush' },
      { value:'sunkissedfreckle', ar:'☀️ برونزي بنمش', en:'Sun-kissed' },
      { value:'porcelain', ar:'🏺 بورسلين', en:'Porcelain' },
      { value:'blackgold', ar:'🖤🥇 أسود وذهبي', en:'Black & gold' },
      { value:'nudegloss', ar:'🤍 نود لامع', en:'Nude gloss' },
      { value:'sharpcontourlip', ar:'💄 شفاه محدّدة', en:'Defined lip' },
      { value:'duochrome', ar:'🪞 ظلال متبدّلة', en:'Duochrome' },
      { value:'smokeybrown', ar:'🤎 سموكي بنّي', en:'Brown smokey' },
      { value:'whitepearleye', ar:'🐚 لؤلؤ أبيض', en:'Pearl eye' },
      { value:'graphicdots', ar:'⚪ نقاط فنّية', en:'Graphic dots' },
      { value:'bronzeglow', ar:'🌞 توهّج برونزي', en:'Bronze glow' },
      { value:'coolgirl', ar:'🧊 كول قيرل', en:'Cool girl' },
      { value:'softpinkeye', ar:'🌷 عيون وردية', en:'Soft pink eye' },
    ],
    beard: [
      { value:'full', ar:'🧔 لحية كاملة', en:'🧔 Full Beard', fr:'🧔 Barbe complète', hi:'🧔 पूरी दाढ़ी', ur:'🧔 مکمل داڑھی', bn:'🧔 পূর্ণ দাড়ি', ne:'🧔 पूरा दाह्री' },
      { value:'stubble', ar:'🪒 لحية خفيفة', en:'🪒 Light Stubble', fr:'🪒 Léger chaume', hi:'🪒 हल्की स्टबल', ur:'🪒 ہلکی داڑھی', bn:'🪒 হালকা দাড়ি', ne:'🪒 हल्का दाह्री' },
      { value:'mustache', ar:'👨 شنب فقط', en:'👨 Mustache Only', fr:'👨 Moustache seulement', hi:'👨 सिर्फ मूंछ', ur:'👨 صرف مونچھیں', bn:'👨 শুধু গোঁফ', ne:'👨 जुँगा मात्र' },
      { value:'goatee', ar:'🐐 لحية عنزة', en:'🐐 Goatee', fr:'🐐 Bouc', hi:'🐐 गोटी दाढ़ी', ur:'🐐 بکری داڑھی', bn:'🐐 ছাগল দাড়ি', ne:'🐐 गोटी दाह्री' },
      { value:'clean', ar:'✨ حليق نظيف', en:'✨ Clean Shave', fr:'✨ Rasé de près', hi:'✨ क्लीन शेव', ur:'✨ صاف شیو', bn:'✨ ক্লিন শেভ', ne:'✨ सफा सेभ' },
      { value:'boxed', ar:'◼️ مربعة قصيرة', en:'◼️ Short boxed' },
      { value:'vandyke', ar:'🎩 فان دايك', en:'🎩 Van Dyke' },
      { value:'faded', ar:'💈 متدرجة فيد', en:'💈 Faded' },
      { value:'longbeard', ar:'🧔‍♂️ طويلة كثة', en:'🧔‍♂️ Long thick' },
      { value:'anchor', ar:'⚓ أنكور', en:'⚓ Anchor' },
      /* v-studio-more-looks */
      { value:'ducktail', ar:'🦆 ذيل البطة', en:'🦆 Ducktail' },
      { value:'chinstrap', ar:'➰ خط الفك', en:'➰ Chinstrap' },
      { value:'circlebeard', ar:'⭕ دائرية', en:'⭕ Circle beard' },
      { value:'mutton', ar:'🧔‍♂️ سوالف عريضة', en:'🧔‍♂️ Mutton chops' },
      { value:'greybeard', ar:'🩶 ملح وفلفل', en:'🩶 Salt & pepper' },
      { value:'shapedbeard', ar:'💈 حواف مرسومة', en:'💈 Barber-shaped' },
      /* v-studio-catalog-100 */
      { value:'bdfullnat', ar:'🧔 كاملة — لونها', en:'full beard — natural colour' },
      { value:'bdfullblk', ar:'🧔 كاملة — أسود', en:'full beard — black' },
      { value:'bdfullbrn', ar:'🧔 كاملة — بنّي', en:'full beard — dark brown' },
      { value:'bdfullgrey', ar:'🧔 كاملة — شايب', en:'full beard — salt & pepper' },
      { value:'bdfullhenna', ar:'🧔 كاملة — محنّاة', en:'full beard — henna red' },
      { value:'bdshortnat', ar:'🧔 قصيرة — لونها', en:'short beard — natural colour' },
      { value:'bdshortblk', ar:'🧔 قصيرة — أسود', en:'short beard — black' },
      { value:'bdshortbrn', ar:'🧔 قصيرة — بنّي', en:'short beard — dark brown' },
      { value:'bdshortgrey', ar:'🧔 قصيرة — شايب', en:'short beard — salt & pepper' },
      { value:'bdshorthenna', ar:'🧔 قصيرة — محنّاة', en:'short beard — henna red' },
      { value:'bdstubblenat', ar:'🧔 خفيفة — لونها', en:'stubble — natural colour' },
      { value:'bdstubbleblk', ar:'🧔 خفيفة — أسود', en:'stubble — black' },
      { value:'bdstubblebrn', ar:'🧔 خفيفة — بنّي', en:'stubble — dark brown' },
      { value:'bdstubblegrey', ar:'🧔 خفيفة — شايب', en:'stubble — salt & pepper' },
      { value:'bdstubblehenna', ar:'🧔 خفيفة — محنّاة', en:'stubble — henna red' },
      { value:'bdgoateenat', ar:'🧔 سكسوكة — لونها', en:'goatee — natural colour' },
      { value:'bdgoateeblk', ar:'🧔 سكسوكة — أسود', en:'goatee — black' },
      { value:'bdgoateebrn', ar:'🧔 سكسوكة — بنّي', en:'goatee — dark brown' },
      { value:'bdgoateegrey', ar:'🧔 سكسوكة — شايب', en:'goatee — salt & pepper' },
      { value:'bdgoateehenna', ar:'🧔 سكسوكة — محنّاة', en:'goatee — henna red' },
      { value:'bdvandykenat', ar:'🧔 فان دايك — لونها', en:'Van Dyke — natural colour' },
      { value:'bdvandykeblk', ar:'🧔 فان دايك — أسود', en:'Van Dyke — black' },
      { value:'bdvandykebrn', ar:'🧔 فان دايك — بنّي', en:'Van Dyke — dark brown' },
      { value:'bdvandykegrey', ar:'🧔 فان دايك — شايب', en:'Van Dyke — salt & pepper' },
      { value:'bdvandykehenna', ar:'🧔 فان دايك — محنّاة', en:'Van Dyke — henna red' },
      { value:'bdboxednat', ar:'🧔 مربّعة — لونها', en:'boxed — natural colour' },
      { value:'bdboxedblk', ar:'🧔 مربّعة — أسود', en:'boxed — black' },
      { value:'bdboxedbrn', ar:'🧔 مربّعة — بنّي', en:'boxed — dark brown' },
      { value:'bdboxedgrey', ar:'🧔 مربّعة — شايب', en:'boxed — salt & pepper' },
      { value:'bdboxedhenna', ar:'🧔 مربّعة — محنّاة', en:'boxed — henna red' },
      { value:'bdducktailnat', ar:'🧔 ذيل البطة — لونها', en:'ducktail — natural colour' },
      { value:'bdducktailblk', ar:'🧔 ذيل البطة — أسود', en:'ducktail — black' },
      { value:'bdducktailbrn', ar:'🧔 ذيل البطة — بنّي', en:'ducktail — dark brown' },
      { value:'bdducktailgrey', ar:'🧔 ذيل البطة — شايب', en:'ducktail — salt & pepper' },
      { value:'bdducktailhenna', ar:'🧔 ذيل البطة — محنّاة', en:'ducktail — henna red' },
      { value:'bdgaribaldinat', ar:'🧔 غاريبالدي — لونها', en:'Garibaldi — natural colour' },
      { value:'bdgaribaldiblk', ar:'🧔 غاريبالدي — أسود', en:'Garibaldi — black' },
      { value:'bdgaribaldibrn', ar:'🧔 غاريبالدي — بنّي', en:'Garibaldi — dark brown' },
      { value:'bdgaribaldigrey', ar:'🧔 غاريبالدي — شايب', en:'Garibaldi — salt & pepper' },
      { value:'bdgaribaldihenna', ar:'🧔 غاريبالدي — محنّاة', en:'Garibaldi — henna red' },
      { value:'bdanchornat', ar:'🧔 أنكور — لونها', en:'anchor — natural colour' },
      { value:'bdanchorblk', ar:'🧔 أنكور — أسود', en:'anchor — black' },
      { value:'bdanchorbrn', ar:'🧔 أنكور — بنّي', en:'anchor — dark brown' },
      { value:'bdanchorgrey', ar:'🧔 أنكور — شايب', en:'anchor — salt & pepper' },
      { value:'bdanchorhenna', ar:'🧔 أنكور — محنّاة', en:'anchor — henna red' },
      { value:'bdchinstrapnat', ar:'🧔 خطّ الفك — لونها', en:'chinstrap — natural colour' },
      { value:'bdchinstrapblk', ar:'🧔 خطّ الفك — أسود', en:'chinstrap — black' },
      { value:'bdchinstrapbrn', ar:'🧔 خطّ الفك — بنّي', en:'chinstrap — dark brown' },
      { value:'bdchinstrapgrey', ar:'🧔 خطّ الفك — شايب', en:'chinstrap — salt & pepper' },
      { value:'bdchinstraphenna', ar:'🧔 خطّ الفك — محنّاة', en:'chinstrap — henna red' },
      { value:'bdcirclenat', ar:'🧔 دائرية — لونها', en:'circle — natural colour' },
      { value:'bdcircleblk', ar:'🧔 دائرية — أسود', en:'circle — black' },
      { value:'bdcirclebrn', ar:'🧔 دائرية — بنّي', en:'circle — dark brown' },
      { value:'bdcirclegrey', ar:'🧔 دائرية — شايب', en:'circle — salt & pepper' },
      { value:'bdcirclehenna', ar:'🧔 دائرية — محنّاة', en:'circle — henna red' },
      { value:'bdmuttonnat', ar:'🧔 سوالف — لونها', en:'mutton chops — natural colour' },
      { value:'bdmuttonblk', ar:'🧔 سوالف — أسود', en:'mutton chops — black' },
      { value:'bdmuttonbrn', ar:'🧔 سوالف — بنّي', en:'mutton chops — dark brown' },
      { value:'bdmuttongrey', ar:'🧔 سوالف — شايب', en:'mutton chops — salt & pepper' },
      { value:'bdmuttonhenna', ar:'🧔 سوالف — محنّاة', en:'mutton chops — henna red' },
      { value:'bdlongnat', ar:'🧔 طويلة — لونها', en:'long beard — natural colour' },
      { value:'bdlongblk', ar:'🧔 طويلة — أسود', en:'long beard — black' },
      { value:'bdlongbrn', ar:'🧔 طويلة — بنّي', en:'long beard — dark brown' },
      { value:'bdlonggrey', ar:'🧔 طويلة — شايب', en:'long beard — salt & pepper' },
      { value:'bdlonghenna', ar:'🧔 طويلة — محنّاة', en:'long beard — henna red' },
      { value:'bdfadednat', ar:'🧔 فيد — لونها', en:'faded — natural colour' },
      { value:'bdfadedblk', ar:'🧔 فيد — أسود', en:'faded — black' },
      { value:'bdfadedbrn', ar:'🧔 فيد — بنّي', en:'faded — dark brown' },
      { value:'bdfadedgrey', ar:'🧔 فيد — شايب', en:'faded — salt & pepper' },
      { value:'bdfadedhenna', ar:'🧔 فيد — محنّاة', en:'faded — henna red' },
      { value:'bdsharpnat', ar:'🧔 حواف حادّة — لونها', en:'sharp lines — natural colour' },
      { value:'bdsharpblk', ar:'🧔 حواف حادّة — أسود', en:'sharp lines — black' },
      { value:'bdsharpbrn', ar:'🧔 حواف حادّة — بنّي', en:'sharp lines — dark brown' },
      { value:'bdsharpgrey', ar:'🧔 حواف حادّة — شايب', en:'sharp lines — salt & pepper' },
      { value:'bdsharphenna', ar:'🧔 حواف حادّة — محنّاة', en:'sharp lines — henna red' },
      { value:'bdmustachenat', ar:'🧔 شنب — لونها', en:'mustache — natural colour' },
      { value:'bdmustacheblk', ar:'🧔 شنب — أسود', en:'mustache — black' },
      { value:'bdmustachebrn', ar:'🧔 شنب — بنّي', en:'mustache — dark brown' },
      { value:'bdmustachegrey', ar:'🧔 شنب — شايب', en:'mustache — salt & pepper' },
      { value:'bdmustachehenna', ar:'🧔 شنب — محنّاة', en:'mustache — henna red' },
      { value:'bdhandlebarnat', ar:'🧔 شنب مفتول — لونها', en:'handlebar — natural colour' },
      { value:'bdhandlebarblk', ar:'🧔 شنب مفتول — أسود', en:'handlebar — black' },
      { value:'bdhandlebarbrn', ar:'🧔 شنب مفتول — بنّي', en:'handlebar — dark brown' },
      { value:'bdhandlebargrey', ar:'🧔 شنب مفتول — شايب', en:'handlebar — salt & pepper' },
      { value:'bdhandlebarhenna', ar:'🧔 شنب مفتول — محنّاة', en:'handlebar — henna red' },
      { value:'bdchevronnat', ar:'🧔 شنب شيفرون — لونها', en:'chevron — natural colour' },
      { value:'bdchevronblk', ar:'🧔 شنب شيفرون — أسود', en:'chevron — black' },
      { value:'bdchevronbrn', ar:'🧔 شنب شيفرون — بنّي', en:'chevron — dark brown' },
      { value:'bdchevrongrey', ar:'🧔 شنب شيفرون — شايب', en:'chevron — salt & pepper' },
      { value:'bdchevronhenna', ar:'🧔 شنب شيفرون — محنّاة', en:'chevron — henna red' },
      { value:'bdbalbonat', ar:'🧔 بالبو — لونها', en:'Balbo — natural colour' },
      { value:'bdbalboblk', ar:'🧔 بالبو — أسود', en:'Balbo — black' },
      { value:'bdbalbobrn', ar:'🧔 بالبو — بنّي', en:'Balbo — dark brown' },
      { value:'bdbalbogrey', ar:'🧔 بالبو — شايب', en:'Balbo — salt & pepper' },
      { value:'bdbalbohenna', ar:'🧔 بالبو — محنّاة', en:'Balbo — henna red' },
      { value:'bdkhaleejinat', ar:'🧔 خليجية مرتّبة — لونها', en:'Gulf trim — natural colour' },
      { value:'bdkhaleejiblk', ar:'🧔 خليجية مرتّبة — أسود', en:'Gulf trim — black' },
      { value:'bdkhaleejibrn', ar:'🧔 خليجية مرتّبة — بنّي', en:'Gulf trim — dark brown' },
      { value:'bdkhaleejigrey', ar:'🧔 خليجية مرتّبة — شايب', en:'Gulf trim — salt & pepper' },
      { value:'bdkhaleejihenna', ar:'🧔 خليجية مرتّبة — محنّاة', en:'Gulf trim — henna red' },
      { value:'bdcleannat', ar:'🧔 حلاقة كاملة — لونها', en:'clean shave — natural colour' },
      { value:'bdcleanblk', ar:'🧔 حلاقة كاملة — أسود', en:'clean shave — black' },
      { value:'bdcleanbrn', ar:'🧔 حلاقة كاملة — بنّي', en:'clean shave — dark brown' },
      { value:'bdcleangrey', ar:'🧔 حلاقة كاملة — شايب', en:'clean shave — salt & pepper' },
      { value:'bdcleanhenna', ar:'🧔 حلاقة كاملة — محنّاة', en:'clean shave — henna red' },
    ],
    skin: [
      { value:'subtle', ar:'✨ تنعيم خفيف', en:'✨ Subtle Smoothing', fr:'✨ Lissage subtil', hi:'✨ हल्का स्मूदिंग', ur:'✨ ہلکی ہمواری', bn:'✨ হালকা মসৃণতা', ne:'✨ हल्का चिल्लो' },
      { value:'glow', ar:'🌟 توهج طبيعي', en:'🌟 Natural Glow', fr:'🌟 Éclat naturel', hi:'🌟 प्राकृतिक चमक', ur:'🌟 قدرتی چمک', bn:'🌟 প্রাকৃতিক উজ্জ্বলতা', ne:'🌟 प्राकृतिक चमक' },
      { value:'circles', ar:'👁️ تقليل الهالات', en:'👁️ Reduce Dark Circles', fr:'👁️ Réduire les cernes', hi:'👁️ डार्क सर्कल कम करें', ur:'👁️ ڈارک سرکلز کم کریں', bn:'👁️ ডার্ক সার্কেল কমান', ne:'👁️ अँध्यारो घेरा घटाउनुहोस्' },
      { value:'tan', ar:'🌞 تان ذهبي', en:'🌞 Golden tan' },
      { value:'matteskin', ar:'🧴 مطفي بلا لمعة', en:'🧴 Matte finish' },
      { value:'freckles', ar:'✨ نمش طبيعي', en:'✨ Freckles' },
      /* v-studio-more-looks */
      { value:'poreless', ar:'🫧 بلا مسام', en:'🫧 Poreless' },
      { value:'acneclear', ar:'🧼 إزالة الحبوب', en:'🧼 Clear blemishes' },
      { value:'scarfree', ar:'🩹 تخفيف الآثار', en:'🩹 Fade scars' },
      { value:'hydrated', ar:'💦 ترطيب ممتلئ', en:'💦 Hydrated' },
      { value:'evenTone', ar:'🎚️ توحيد اللون', en:'🎚️ Even tone' },
      { value:'softfilter', ar:'🌫️ نعومة الاستوديو', en:'🌫️ Soft focus' },
      /* v-studio-catalog-100 */
      { value:'skglowm', ar:'✨ توهّج — مطفي', en:'glow — matte' },
      { value:'skglows', ar:'✨ توهّج — ساتان', en:'glow — satin' },
      { value:'skglowd', ar:'✨ توهّج — ندي', en:'glow — dewy' },
      { value:'skevenm', ar:'✨ توحيد اللون — مطفي', en:'even tone — matte' },
      { value:'skevens', ar:'✨ توحيد اللون — ساتان', en:'even tone — satin' },
      { value:'skevend', ar:'✨ توحيد اللون — ندي', en:'even tone — dewy' },
      { value:'skclearm', ar:'✨ إزالة الحبوب — مطفي', en:'clear skin — matte' },
      { value:'skclears', ar:'✨ إزالة الحبوب — ساتان', en:'clear skin — satin' },
      { value:'skcleard', ar:'✨ إزالة الحبوب — ندي', en:'clear skin — dewy' },
      { value:'skscarsm', ar:'✨ آثار الحبوب — مطفي', en:'fade scars — matte' },
      { value:'skscarss', ar:'✨ آثار الحبوب — ساتان', en:'fade scars — satin' },
      { value:'skscarsd', ar:'✨ آثار الحبوب — ندي', en:'fade scars — dewy' },
      { value:'skcirclesm', ar:'✨ الهالات — مطفي', en:'dark circles — matte' },
      { value:'skcircless', ar:'✨ الهالات — ساتان', en:'dark circles — satin' },
      { value:'skcirclesd', ar:'✨ الهالات — ندي', en:'dark circles — dewy' },
      { value:'skporesm', ar:'✨ المسام — مطفي', en:'refine pores — matte' },
      { value:'skporess', ar:'✨ المسام — ساتان', en:'refine pores — satin' },
      { value:'skporesd', ar:'✨ المسام — ندي', en:'refine pores — dewy' },
      { value:'skshinem', ar:'✨ اللمعة الدهنية — مطفي', en:'oil control — matte' },
      { value:'skshines', ar:'✨ اللمعة الدهنية — ساتان', en:'oil control — satin' },
      { value:'skshined', ar:'✨ اللمعة الدهنية — ندي', en:'oil control — dewy' },
      { value:'skrednessm', ar:'✨ الاحمرار — مطفي', en:'calm redness — matte' },
      { value:'skrednesss', ar:'✨ الاحمرار — ساتان', en:'calm redness — satin' },
      { value:'skrednessd', ar:'✨ الاحمرار — ندي', en:'calm redness — dewy' },
      { value:'sktan1m', ar:'✨ سمرة خفيفة — مطفي', en:'light tan — matte' },
      { value:'sktan1s', ar:'✨ سمرة خفيفة — ساتان', en:'light tan — satin' },
      { value:'sktan1d', ar:'✨ سمرة خفيفة — ندي', en:'light tan — dewy' },
      { value:'sktan2m', ar:'✨ سمرة متوسّطة — مطفي', en:'medium tan — matte' },
      { value:'sktan2s', ar:'✨ سمرة متوسّطة — ساتان', en:'medium tan — satin' },
      { value:'sktan2d', ar:'✨ سمرة متوسّطة — ندي', en:'medium tan — dewy' },
      { value:'sktan3m', ar:'✨ سمرة برونزية — مطفي', en:'bronze tan — matte' },
      { value:'sktan3s', ar:'✨ سمرة برونزية — ساتان', en:'bronze tan — satin' },
      { value:'sktan3d', ar:'✨ سمرة برونزية — ندي', en:'bronze tan — dewy' },
      { value:'skfreshm', ar:'✨ انتعاش — مطفي', en:'fresh — matte' },
      { value:'skfreshs', ar:'✨ انتعاش — ساتان', en:'fresh — satin' },
      { value:'skfreshd', ar:'✨ انتعاش — ندي', en:'fresh — dewy' },
      { value:'skfrecklem', ar:'✨ نمش — مطفي', en:'freckles — matte' },
      { value:'skfreckles', ar:'✨ نمش — ساتان', en:'freckles — satin' },
      { value:'skfreckled', ar:'✨ نمش — ندي', en:'freckles — dewy' },
      { value:'skwrinklesm', ar:'✨ التجاعيد — مطفي', en:'soften lines — matte' },
      { value:'skwrinkless', ar:'✨ التجاعيد — ساتان', en:'soften lines — satin' },
      { value:'skwrinklesd', ar:'✨ التجاعيد — ندي', en:'soften lines — dewy' },
      { value:'skglassm', ar:'✨ بشرة زجاجية — مطفي', en:'glass skin — matte' },
      { value:'skglasss', ar:'✨ بشرة زجاجية — ساتان', en:'glass skin — satin' },
      { value:'skglassd', ar:'✨ بشرة زجاجية — ندي', en:'glass skin — dewy' },
      { value:'skbabym', ar:'✨ نعومة — مطفي', en:'smooth — matte' },
      { value:'skbabys', ar:'✨ نعومة — ساتان', en:'smooth — satin' },
      { value:'skbabyd', ar:'✨ نعومة — ندي', en:'smooth — dewy' },
      { value:'skhydram', ar:'✨ ترطيب — مطفي', en:'hydrated — matte' },
      { value:'skhydras', ar:'✨ ترطيب — ساتان', en:'hydrated — satin' },
      { value:'skhydrad', ar:'✨ ترطيب — ندي', en:'hydrated — dewy' },
      { value:'skspotsm', ar:'✨ البقع — مطفي', en:'fade spots — matte' },
      { value:'skspotss', ar:'✨ البقع — ساتان', en:'fade spots — satin' },
      { value:'skspotsd', ar:'✨ البقع — ندي', en:'fade spots — dewy' },
      { value:'sksunburnm', ar:'✨ حروق الشمس — مطفي', en:'sunburn fix — matte' },
      { value:'sksunburns', ar:'✨ حروق الشمس — ساتان', en:'sunburn fix — satin' },
      { value:'sksunburnd', ar:'✨ حروق الشمس — ندي', en:'sunburn fix — dewy' },
      { value:'skbeardshadowm', ar:'✨ ظلّ اللحية — مطفي', en:'soften shadow — matte' },
      { value:'skbeardshadows', ar:'✨ ظلّ اللحية — ساتان', en:'soften shadow — satin' },
      { value:'skbeardshadowd', ar:'✨ ظلّ اللحية — ندي', en:'soften shadow — dewy' },
      { value:'skradiantm', ar:'✨ إشراق — مطفي', en:'radiant — matte' },
      { value:'skradiants', ar:'✨ إشراق — ساتان', en:'radiant — satin' },
      { value:'skradiantd', ar:'✨ إشراق — ندي', en:'radiant — dewy' },
      { value:'skwarmm', ar:'✨ دفء اللون — مطفي', en:'warmer — matte' },
      { value:'skwarms', ar:'✨ دفء اللون — ساتان', en:'warmer — satin' },
      { value:'skwarmd', ar:'✨ دفء اللون — ندي', en:'warmer — dewy' },
      { value:'skcoolm', ar:'✨ برودة اللون — مطفي', en:'cooler — matte' },
      { value:'skcools', ar:'✨ برودة اللون — ساتان', en:'cooler — satin' },
      { value:'skcoold', ar:'✨ برودة اللون — ندي', en:'cooler — dewy' },
      { value:'skmattem', ar:'✨ مطفي — مطفي', en:'matte — matte' },
      { value:'skmattes', ar:'✨ مطفي — ساتان', en:'matte — satin' },
      { value:'skmatted', ar:'✨ مطفي — ندي', en:'matte — dewy' },
      { value:'skcontourm', ar:'✨ نحت خفيف — مطفي', en:'sculpt — matte' },
      { value:'skcontours', ar:'✨ نحت خفيف — ساتان', en:'sculpt — satin' },
      { value:'skcontourd', ar:'✨ نحت خفيف — ندي', en:'sculpt — dewy' },
      { value:'sklipsm', ar:'✨ شفاه صحّية — مطفي', en:'healthy lips — matte' },
      { value:'sklipss', ar:'✨ شفاه صحّية — ساتان', en:'healthy lips — satin' },
      { value:'sklipsd', ar:'✨ شفاه صحّية — ندي', en:'healthy lips — dewy' },
      { value:'skneckm', ar:'✨ الرقبة — مطفي', en:'neck — matte' },
      { value:'sknecks', ar:'✨ الرقبة — ساتان', en:'neck — satin' },
      { value:'skneckd', ar:'✨ الرقبة — ندي', en:'neck — dewy' },
      { value:'skforeheadm', ar:'✨ الجبهة — مطفي', en:'forehead — matte' },
      { value:'skforeheads', ar:'✨ الجبهة — ساتان', en:'forehead — satin' },
      { value:'skforeheadd', ar:'✨ الجبهة — ندي', en:'forehead — dewy' },
      { value:'sknosem', ar:'✨ الأنف — مطفي', en:'nose — matte' },
      { value:'sknoses', ar:'✨ الأنف — ساتان', en:'nose — satin' },
      { value:'sknosed', ar:'✨ الأنف — ندي', en:'nose — dewy' },
      { value:'skchinm', ar:'✨ الذقن — مطفي', en:'chin — matte' },
      { value:'skchins', ar:'✨ الذقن — ساتان', en:'chin — satin' },
      { value:'skchind', ar:'✨ الذقن — ندي', en:'chin — dewy' },
      { value:'skundereyem', ar:'✨ تحت العين — مطفي', en:'under-eye — matte' },
      { value:'skundereyes', ar:'✨ تحت العين — ساتان', en:'under-eye — satin' },
      { value:'skundereyed', ar:'✨ تحت العين — ندي', en:'under-eye — dewy' },
      { value:'skvitaminm', ar:'✨ فيتامين سي — مطفي', en:'vitamin glow — matte' },
      { value:'skvitamins', ar:'✨ فيتامين سي — ساتان', en:'vitamin glow — satin' },
      { value:'skvitamind', ar:'✨ فيتامين سي — ندي', en:'vitamin glow — dewy' },
      { value:'skspam', ar:'✨ بعد السبا — مطفي', en:'spa fresh — matte' },
      { value:'skspas', ar:'✨ بعد السبا — ساتان', en:'spa fresh — satin' },
      { value:'skspad', ar:'✨ بعد السبا — ندي', en:'spa fresh — dewy' },
      { value:'sksummerm', ar:'✨ بشرة صيفية — مطفي', en:'summer skin — matte' },
      { value:'sksummers', ar:'✨ بشرة صيفية — ساتان', en:'summer skin — satin' },
      { value:'sksummerd', ar:'✨ بشرة صيفية — ندي', en:'summer skin — dewy' },
    ],
    glasses: [
      { value:'sunglasses', ar:'🕶️ شمسية كلاسيكية', en:'🕶️ Classic Sunglasses', fr:'🕶️ Lunettes de soleil classiques', hi:'🕶️ क्लासिक सनग्लासेज़', ur:'🕶️ کلاسک دھوپ کے چشمے', bn:'🕶️ ক্লাসিক সানগ্লাস', ne:'🕶️ क्लासिक घाम चश्मा' },
      { value:'round', ar:'⭕ دائرية', en:'⭕ Round', fr:'⭕ Rondes', hi:'⭕ गोल', ur:'⭕ گول', bn:'⭕ গোলাকার', ne:'⭕ गोलो' },
      { value:'catseye', ar:'🐱 عين القطة', en:'🐱 Cat-Eye', fr:'🐱 Œil de chat', hi:'🐱 कैट-आई', ur:'🐱 کیٹ آئی', bn:'🐱 ক্যাট-আই', ne:'🐱 क्याट-आई' },
      { value:'aviator', ar:'✈️ طيار', en:'✈️ Aviator', fr:'✈️ Aviateur', hi:'✈️ एविएटर', ur:'✈️ ایویٹر', bn:'✈️ এভিয়েটর', ne:'✈️ एभिएटर' },
      { value:'rimless', ar:'🔲 بدون إطار', en:'🔲 Rimless', fr:'🔲 Sans monture', hi:'🔲 रिमलेस', ur:'🔲 بغیر فریم', bn:'🔲 রিমলেস', ne:'🔲 रिमलेस' },
      { value:'wayfarer', ar:'🕶️ وايفيرر', en:'🕶️ Wayfarer' },
      { value:'oversized', ar:'👓 كبيرة فاشن', en:'👓 Oversized' },
      { value:'sportglasses', ar:'🚴 رياضية', en:'🚴 Sport' },
      { value:'goldframe', ar:'🥇 إطار ذهبي', en:'🥇 Gold frame' },
      { value:'retroglasses', ar:'🕰️ ريترو ملوّنة', en:'🕰️ Retro tinted' },
      { value:'hexagon', ar:'⬡ سداسية', en:'⬡ Hexagon' },
      { value:'clearframe', ar:'🧊 إطار شفاف', en:'🧊 Clear frame' },
      /* v-studio-more-looks */
      { value:'browline', ar:'🕶️ براولاين', en:'🕶️ Browline' },
      { value:'octagon', ar:'🛑 ثمانية أضلاع', en:'🛑 Octagon' },
      { value:'halfrim', ar:'➗ نصف إطار', en:'➗ Half-rim' },
      { value:'bluelight', ar:'💻 حماية الشاشات', en:'💻 Blue-light' },
      { value:'mirrored', ar:'🪩 عاكسة', en:'🪩 Mirrored' },
      { value:'tinyframe', ar:'🔹 صغيرة ترند', en:'🔹 Tiny frame' },
      /* v-studio-catalog-100 */
      { value:'grectblk', ar:'👓 مستطيلة — أسود', en:'Rectangle — black' },
      { value:'grectgld', ar:'👓 مستطيلة — ذهبي', en:'Rectangle — gold' },
      { value:'grecttort', ar:'👓 مستطيلة — تورتواز', en:'Rectangle — tortoiseshell' },
      { value:'grectclr', ar:'👓 مستطيلة — شفّاف', en:'Rectangle — clear' },
      { value:'grectslv', ar:'👓 مستطيلة — فضّي', en:'Rectangle — silver' },
      { value:'grectred', ar:'👓 مستطيلة — أحمر', en:'Rectangle — red' },
      { value:'grectwht', ar:'👓 مستطيلة — أبيض', en:'Rectangle — white' },
      { value:'grectnvy', ar:'👓 مستطيلة — كحلي', en:'Rectangle — navy' },
      { value:'groundblk', ar:'👓 دائرية — أسود', en:'Round — black' },
      { value:'groundgld', ar:'👓 دائرية — ذهبي', en:'Round — gold' },
      { value:'groundtort', ar:'👓 دائرية — تورتواز', en:'Round — tortoiseshell' },
      { value:'groundclr', ar:'👓 دائرية — شفّاف', en:'Round — clear' },
      { value:'groundslv', ar:'👓 دائرية — فضّي', en:'Round — silver' },
      { value:'groundred', ar:'👓 دائرية — أحمر', en:'Round — red' },
      { value:'groundwht', ar:'👓 دائرية — أبيض', en:'Round — white' },
      { value:'groundnvy', ar:'👓 دائرية — كحلي', en:'Round — navy' },
      { value:'gcatblk', ar:'👓 عين القطة — أسود', en:'Cat-eye — black' },
      { value:'gcatgld', ar:'👓 عين القطة — ذهبي', en:'Cat-eye — gold' },
      { value:'gcattort', ar:'👓 عين القطة — تورتواز', en:'Cat-eye — tortoiseshell' },
      { value:'gcatclr', ar:'👓 عين القطة — شفّاف', en:'Cat-eye — clear' },
      { value:'gcatslv', ar:'👓 عين القطة — فضّي', en:'Cat-eye — silver' },
      { value:'gcatred', ar:'👓 عين القطة — أحمر', en:'Cat-eye — red' },
      { value:'gcatwht', ar:'👓 عين القطة — أبيض', en:'Cat-eye — white' },
      { value:'gcatnvy', ar:'👓 عين القطة — كحلي', en:'Cat-eye — navy' },
      { value:'gaviblk', ar:'👓 طيّار — أسود', en:'Aviator — black' },
      { value:'gavigld', ar:'👓 طيّار — ذهبي', en:'Aviator — gold' },
      { value:'gavitort', ar:'👓 طيّار — تورتواز', en:'Aviator — tortoiseshell' },
      { value:'gaviclr', ar:'👓 طيّار — شفّاف', en:'Aviator — clear' },
      { value:'gavislv', ar:'👓 طيّار — فضّي', en:'Aviator — silver' },
      { value:'gavired', ar:'👓 طيّار — أحمر', en:'Aviator — red' },
      { value:'gaviwht', ar:'👓 طيّار — أبيض', en:'Aviator — white' },
      { value:'gavinvy', ar:'👓 طيّار — كحلي', en:'Aviator — navy' },
      { value:'gwayblk', ar:'👓 وايفيرر — أسود', en:'Wayfarer — black' },
      { value:'gwaygld', ar:'👓 وايفيرر — ذهبي', en:'Wayfarer — gold' },
      { value:'gwaytort', ar:'👓 وايفيرر — تورتواز', en:'Wayfarer — tortoiseshell' },
      { value:'gwayclr', ar:'👓 وايفيرر — شفّاف', en:'Wayfarer — clear' },
      { value:'gwayslv', ar:'👓 وايفيرر — فضّي', en:'Wayfarer — silver' },
      { value:'gwayred', ar:'👓 وايفيرر — أحمر', en:'Wayfarer — red' },
      { value:'gwaywht', ar:'👓 وايفيرر — أبيض', en:'Wayfarer — white' },
      { value:'gwaynvy', ar:'👓 وايفيرر — كحلي', en:'Wayfarer — navy' },
      { value:'govalblk', ar:'👓 بيضاوية — أسود', en:'Oval — black' },
      { value:'govalgld', ar:'👓 بيضاوية — ذهبي', en:'Oval — gold' },
      { value:'govaltort', ar:'👓 بيضاوية — تورتواز', en:'Oval — tortoiseshell' },
      { value:'govalclr', ar:'👓 بيضاوية — شفّاف', en:'Oval — clear' },
      { value:'govalslv', ar:'👓 بيضاوية — فضّي', en:'Oval — silver' },
      { value:'govalred', ar:'👓 بيضاوية — أحمر', en:'Oval — red' },
      { value:'govalwht', ar:'👓 بيضاوية — أبيض', en:'Oval — white' },
      { value:'govalnvy', ar:'👓 بيضاوية — كحلي', en:'Oval — navy' },
      { value:'gsqblk', ar:'👓 مربّعة — أسود', en:'Square — black' },
      { value:'gsqgld', ar:'👓 مربّعة — ذهبي', en:'Square — gold' },
      { value:'gsqtort', ar:'👓 مربّعة — تورتواز', en:'Square — tortoiseshell' },
      { value:'gsqclr', ar:'👓 مربّعة — شفّاف', en:'Square — clear' },
      { value:'gsqslv', ar:'👓 مربّعة — فضّي', en:'Square — silver' },
      { value:'gsqred', ar:'👓 مربّعة — أحمر', en:'Square — red' },
      { value:'gsqwht', ar:'👓 مربّعة — أبيض', en:'Square — white' },
      { value:'gsqnvy', ar:'👓 مربّعة — كحلي', en:'Square — navy' },
      { value:'ghexblk', ar:'👓 سداسية — أسود', en:'Hexagon — black' },
      { value:'ghexgld', ar:'👓 سداسية — ذهبي', en:'Hexagon — gold' },
      { value:'ghextort', ar:'👓 سداسية — تورتواز', en:'Hexagon — tortoiseshell' },
      { value:'ghexclr', ar:'👓 سداسية — شفّاف', en:'Hexagon — clear' },
      { value:'ghexslv', ar:'👓 سداسية — فضّي', en:'Hexagon — silver' },
      { value:'ghexred', ar:'👓 سداسية — أحمر', en:'Hexagon — red' },
      { value:'ghexwht', ar:'👓 سداسية — أبيض', en:'Hexagon — white' },
      { value:'ghexnvy', ar:'👓 سداسية — كحلي', en:'Hexagon — navy' },
      { value:'goctblk', ar:'👓 ثمانية — أسود', en:'Octagon — black' },
      { value:'goctgld', ar:'👓 ثمانية — ذهبي', en:'Octagon — gold' },
      { value:'gocttort', ar:'👓 ثمانية — تورتواز', en:'Octagon — tortoiseshell' },
      { value:'goctclr', ar:'👓 ثمانية — شفّاف', en:'Octagon — clear' },
      { value:'goctslv', ar:'👓 ثمانية — فضّي', en:'Octagon — silver' },
      { value:'goctred', ar:'👓 ثمانية — أحمر', en:'Octagon — red' },
      { value:'goctwht', ar:'👓 ثمانية — أبيض', en:'Octagon — white' },
      { value:'goctnvy', ar:'👓 ثمانية — كحلي', en:'Octagon — navy' },
      { value:'gbrowblk', ar:'👓 براولاين — أسود', en:'Browline — black' },
      { value:'gbrowgld', ar:'👓 براولاين — ذهبي', en:'Browline — gold' },
      { value:'gbrowtort', ar:'👓 براولاين — تورتواز', en:'Browline — tortoiseshell' },
      { value:'gbrowclr', ar:'👓 براولاين — شفّاف', en:'Browline — clear' },
      { value:'gbrowslv', ar:'👓 براولاين — فضّي', en:'Browline — silver' },
      { value:'gbrowred', ar:'👓 براولاين — أحمر', en:'Browline — red' },
      { value:'gbrowwht', ar:'👓 براولاين — أبيض', en:'Browline — white' },
      { value:'gbrownvy', ar:'👓 براولاين — كحلي', en:'Browline — navy' },
      { value:'gshieldblk', ar:'👓 درع — أسود', en:'Shield — black' },
      { value:'gshieldgld', ar:'👓 درع — ذهبي', en:'Shield — gold' },
      { value:'gshieldtort', ar:'👓 درع — تورتواز', en:'Shield — tortoiseshell' },
      { value:'gshieldclr', ar:'👓 درع — شفّاف', en:'Shield — clear' },
      { value:'gshieldslv', ar:'👓 درع — فضّي', en:'Shield — silver' },
      { value:'gshieldred', ar:'👓 درع — أحمر', en:'Shield — red' },
      { value:'gshieldwht', ar:'👓 درع — أبيض', en:'Shield — white' },
      { value:'gshieldnvy', ar:'👓 درع — كحلي', en:'Shield — navy' },
      { value:'goverblk', ar:'👓 كبيرة — أسود', en:'Oversized — black' },
      { value:'govergld', ar:'👓 كبيرة — ذهبي', en:'Oversized — gold' },
      { value:'govertort', ar:'👓 كبيرة — تورتواز', en:'Oversized — tortoiseshell' },
      { value:'goverclr', ar:'👓 كبيرة — شفّاف', en:'Oversized — clear' },
      { value:'goverslv', ar:'👓 كبيرة — فضّي', en:'Oversized — silver' },
      { value:'goverred', ar:'👓 كبيرة — أحمر', en:'Oversized — red' },
      { value:'goverwht', ar:'👓 كبيرة — أبيض', en:'Oversized — white' },
      { value:'governvy', ar:'👓 كبيرة — كحلي', en:'Oversized — navy' },
      { value:'gsrectdk', ar:'🕶️ مستطيلة شمسية — عدسة داكنة', en:'Rectangle sunglasses — dark lenses' },
      { value:'gsrectgrd', ar:'🕶️ مستطيلة شمسية — عدسة متدرّجة', en:'Rectangle sunglasses — gradient lenses' },
      { value:'gsrounddk', ar:'🕶️ دائرية شمسية — عدسة داكنة', en:'Round sunglasses — dark lenses' },
      { value:'gsroundgrd', ar:'🕶️ دائرية شمسية — عدسة متدرّجة', en:'Round sunglasses — gradient lenses' },
      { value:'gscatdk', ar:'🕶️ عين القطة شمسية — عدسة داكنة', en:'Cat-eye sunglasses — dark lenses' },
      { value:'gscatgrd', ar:'🕶️ عين القطة شمسية — عدسة متدرّجة', en:'Cat-eye sunglasses — gradient lenses' },
      { value:'gsavidk', ar:'🕶️ طيّار شمسية — عدسة داكنة', en:'Aviator sunglasses — dark lenses' },
      { value:'gsavigrd', ar:'🕶️ طيّار شمسية — عدسة متدرّجة', en:'Aviator sunglasses — gradient lenses' },
      { value:'gswaydk', ar:'🕶️ وايفيرر شمسية — عدسة داكنة', en:'Wayfarer sunglasses — dark lenses' },
      { value:'gswaygrd', ar:'🕶️ وايفيرر شمسية — عدسة متدرّجة', en:'Wayfarer sunglasses — gradient lenses' },
      { value:'gsovaldk', ar:'🕶️ بيضاوية شمسية — عدسة داكنة', en:'Oval sunglasses — dark lenses' },
      { value:'gsovalgrd', ar:'🕶️ بيضاوية شمسية — عدسة متدرّجة', en:'Oval sunglasses — gradient lenses' },
    ],
    tattoo: [
      { value:'sleeve', ar:'💪 كم كامل', en:'💪 Full Sleeve', fr:'💪 Manche complète', hi:'💪 फुल स्लीव', ur:'💪 فل سلیو', bn:'💪 ফুল স্লিভ', ne:'💪 पूरा स्लिभ' },
      { value:'wrist', ar:'✋ صغير بالمعصم', en:'✋ Small Wrist', fr:'✋ Petit poignet', hi:'✋ छोटी कलाई', ur:'✋ چھوٹی کلائی', bn:'✋ ছোট কব্জি', ne:'✋ सानो नाडी' },
      { value:'back', ar:'🔙 على الظهر', en:'🔙 Back Piece', fr:'🔙 Dos', hi:'🔙 पीठ पर', ur:'🔙 پیٹھ پر', bn:'🔙 পিঠে', ne:'🔙 ढाडमा' },
      { value:'tribal', ar:'⚫ قبلي', en:'⚫ Tribal', fr:'⚫ Tribal', hi:'⚫ ट्राइबल', ur:'⚫ قبائلی', bn:'⚫ ট্রাইবাল', ne:'⚫ ट्राइबल' },
      { value:'custom', ar:'📝 حسب الوصف', en:'📝 Custom (from description)', fr:'📝 Personnalisé (selon description)', hi:'📝 कस्टम (विवरण अनुसार)', ur:'📝 حسب تفصیل', bn:'📝 কাস্টম (বর্ণনা অনুযায়ী)', ne:'📝 कस्टम (विवरण अनुसार)' },
      { value:'geometric', ar:'🔷 هندسي رفيع', en:'🔷 Geometric' },
      { value:'minimalline', ar:'➖ خط بسيط', en:'➖ Minimal line' },
      { value:'arabictattoo', ar:'🖋️ خط عربي', en:'🖋️ Arabic calligraphy' },
      { value:'floraltattoo', ar:'🌿 نباتي مفصّل', en:'🌿 Floral' },
      /* v-studio-more-looks */
      { value:'japanese', ar:'🌊 ياباني إيرزومي', en:'🌊 Japanese irezumi' },
      { value:'blackwork', ar:'⬛ بلاك ورك', en:'⬛ Blackwork' },
      { value:'watercolortattoo', ar:'🎨 ألوان مائية', en:'🎨 Watercolour' },
      { value:'necktattoo', ar:'👤 على الرقبة', en:'👤 Neck' },
      { value:'chesttattoo', ar:'🫀 على الصدر', en:'🫀 Chest piece' },
      { value:'ankletattoo', ar:'🦶 حول الكاحل', en:'🦶 Ankle band' },
      { value:'dotwork', ar:'⚪ نقطي ماندالا', en:'⚪ Dotwork mandala' },
      /* v-studio-catalog-100 */
      { value:'ttrosefa', ar:'🎨 وردة — الساعد', en:'rose — forearm' },
      { value:'ttrosewr', ar:'🎨 وردة — المعصم', en:'rose — wrist' },
      { value:'ttrosesh', ar:'🎨 وردة — الكتف', en:'rose — shoulder' },
      { value:'ttrosehd', ar:'🎨 وردة — ظهر اليد', en:'rose — back of the hand' },
      { value:'ttlionfa', ar:'🎨 أسد — الساعد', en:'lion — forearm' },
      { value:'ttlionwr', ar:'🎨 أسد — المعصم', en:'lion — wrist' },
      { value:'ttlionsh', ar:'🎨 أسد — الكتف', en:'lion — shoulder' },
      { value:'ttlionhd', ar:'🎨 أسد — ظهر اليد', en:'lion — back of the hand' },
      { value:'ttfalconfa', ar:'🎨 صقر — الساعد', en:'falcon — forearm' },
      { value:'ttfalconwr', ar:'🎨 صقر — المعصم', en:'falcon — wrist' },
      { value:'ttfalconsh', ar:'🎨 صقر — الكتف', en:'falcon — shoulder' },
      { value:'ttfalconhd', ar:'🎨 صقر — ظهر اليد', en:'falcon — back of the hand' },
      { value:'ttwolffa', ar:'🎨 ذئب — الساعد', en:'wolf — forearm' },
      { value:'ttwolfwr', ar:'🎨 ذئب — المعصم', en:'wolf — wrist' },
      { value:'ttwolfsh', ar:'🎨 ذئب — الكتف', en:'wolf — shoulder' },
      { value:'ttwolfhd', ar:'🎨 ذئب — ظهر اليد', en:'wolf — back of the hand' },
      { value:'tteaglefa', ar:'🎨 نسر — الساعد', en:'eagle — forearm' },
      { value:'tteaglewr', ar:'🎨 نسر — المعصم', en:'eagle — wrist' },
      { value:'tteaglesh', ar:'🎨 نسر — الكتف', en:'eagle — shoulder' },
      { value:'tteaglehd', ar:'🎨 نسر — ظهر اليد', en:'eagle — back of the hand' },
      { value:'ttcompassfa', ar:'🎨 بوصلة — الساعد', en:'compass — forearm' },
      { value:'ttcompasswr', ar:'🎨 بوصلة — المعصم', en:'compass — wrist' },
      { value:'ttcompasssh', ar:'🎨 بوصلة — الكتف', en:'compass — shoulder' },
      { value:'ttcompasshd', ar:'🎨 بوصلة — ظهر اليد', en:'compass — back of the hand' },
      { value:'ttclockfa', ar:'🎨 ساعة — الساعد', en:'clock — forearm' },
      { value:'ttclockwr', ar:'🎨 ساعة — المعصم', en:'clock — wrist' },
      { value:'ttclocksh', ar:'🎨 ساعة — الكتف', en:'clock — shoulder' },
      { value:'ttclockhd', ar:'🎨 ساعة — ظهر اليد', en:'clock — back of the hand' },
      { value:'ttmoonfa', ar:'🎨 هلال — الساعد', en:'crescent moon — forearm' },
      { value:'ttmoonwr', ar:'🎨 هلال — المعصم', en:'crescent moon — wrist' },
      { value:'ttmoonsh', ar:'🎨 هلال — الكتف', en:'crescent moon — shoulder' },
      { value:'ttmoonhd', ar:'🎨 هلال — ظهر اليد', en:'crescent moon — back of the hand' },
      { value:'ttsunfa', ar:'🎨 شمس — الساعد', en:'sun — forearm' },
      { value:'ttsunwr', ar:'🎨 شمس — المعصم', en:'sun — wrist' },
      { value:'ttsunsh', ar:'🎨 شمس — الكتف', en:'sun — shoulder' },
      { value:'ttsunhd', ar:'🎨 شمس — ظهر اليد', en:'sun — back of the hand' },
      { value:'ttwavefa', ar:'🎨 موجة — الساعد', en:'wave — forearm' },
      { value:'ttwavewr', ar:'🎨 موجة — المعصم', en:'wave — wrist' },
      { value:'ttwavesh', ar:'🎨 موجة — الكتف', en:'wave — shoulder' },
      { value:'ttwavehd', ar:'🎨 موجة — ظهر اليد', en:'wave — back of the hand' },
      { value:'ttmountainfa', ar:'🎨 جبال — الساعد', en:'mountains — forearm' },
      { value:'ttmountainwr', ar:'🎨 جبال — المعصم', en:'mountains — wrist' },
      { value:'ttmountainsh', ar:'🎨 جبال — الكتف', en:'mountains — shoulder' },
      { value:'ttmountainhd', ar:'🎨 جبال — ظهر اليد', en:'mountains — back of the hand' },
      { value:'tttreefa', ar:'🎨 شجرة — الساعد', en:'tree — forearm' },
      { value:'tttreewr', ar:'🎨 شجرة — المعصم', en:'tree — wrist' },
      { value:'tttreesh', ar:'🎨 شجرة — الكتف', en:'tree — shoulder' },
      { value:'tttreehd', ar:'🎨 شجرة — ظهر اليد', en:'tree — back of the hand' },
      { value:'ttfeatherfa', ar:'🎨 ريشة — الساعد', en:'feather — forearm' },
      { value:'ttfeatherwr', ar:'🎨 ريشة — المعصم', en:'feather — wrist' },
      { value:'ttfeathersh', ar:'🎨 ريشة — الكتف', en:'feather — shoulder' },
      { value:'ttfeatherhd', ar:'🎨 ريشة — ظهر اليد', en:'feather — back of the hand' },
      { value:'ttbutterflyfa', ar:'🎨 فراشة — الساعد', en:'butterfly — forearm' },
      { value:'ttbutterflywr', ar:'🎨 فراشة — المعصم', en:'butterfly — wrist' },
      { value:'ttbutterflysh', ar:'🎨 فراشة — الكتف', en:'butterfly — shoulder' },
      { value:'ttbutterflyhd', ar:'🎨 فراشة — ظهر اليد', en:'butterfly — back of the hand' },
      { value:'ttdragonfa', ar:'🎨 تنين — الساعد', en:'dragon — forearm' },
      { value:'ttdragonwr', ar:'🎨 تنين — المعصم', en:'dragon — wrist' },
      { value:'ttdragonsh', ar:'🎨 تنين — الكتف', en:'dragon — shoulder' },
      { value:'ttdragonhd', ar:'🎨 تنين — ظهر اليد', en:'dragon — back of the hand' },
      { value:'ttsnakefa', ar:'🎨 أفعى — الساعد', en:'snake — forearm' },
      { value:'ttsnakewr', ar:'🎨 أفعى — المعصم', en:'snake — wrist' },
      { value:'ttsnakesh', ar:'🎨 أفعى — الكتف', en:'snake — shoulder' },
      { value:'ttsnakehd', ar:'🎨 أفعى — ظهر اليد', en:'snake — back of the hand' },
      { value:'ttkoifa', ar:'🎨 سمكة كوي — الساعد', en:'koi fish — forearm' },
      { value:'ttkoiwr', ar:'🎨 سمكة كوي — المعصم', en:'koi fish — wrist' },
      { value:'ttkoish', ar:'🎨 سمكة كوي — الكتف', en:'koi fish — shoulder' },
      { value:'ttkoihd', ar:'🎨 سمكة كوي — ظهر اليد', en:'koi fish — back of the hand' },
      { value:'ttmandalafa', ar:'🎨 ماندالا — الساعد', en:'mandala — forearm' },
      { value:'ttmandalawr', ar:'🎨 ماندالا — المعصم', en:'mandala — wrist' },
      { value:'ttmandalash', ar:'🎨 ماندالا — الكتف', en:'mandala — shoulder' },
      { value:'ttmandalahd', ar:'🎨 ماندالا — ظهر اليد', en:'mandala — back of the hand' },
      { value:'ttgeometricfa', ar:'🎨 هندسي — الساعد', en:'geometric — forearm' },
      { value:'ttgeometricwr', ar:'🎨 هندسي — المعصم', en:'geometric — wrist' },
      { value:'ttgeometricsh', ar:'🎨 هندسي — الكتف', en:'geometric — shoulder' },
      { value:'ttgeometrichd', ar:'🎨 هندسي — ظهر اليد', en:'geometric — back of the hand' },
      { value:'ttarabicfa', ar:'🎨 خط عربي — الساعد', en:'Arabic calligraphy — forearm' },
      { value:'ttarabicwr', ar:'🎨 خط عربي — المعصم', en:'Arabic calligraphy — wrist' },
      { value:'ttarabicsh', ar:'🎨 خط عربي — الكتف', en:'Arabic calligraphy — shoulder' },
      { value:'ttarabichd', ar:'🎨 خط عربي — ظهر اليد', en:'Arabic calligraphy — back of the hand' },
      { value:'ttnamefa', ar:'🎨 اسم — الساعد', en:'name script — forearm' },
      { value:'ttnamewr', ar:'🎨 اسم — المعصم', en:'name script — wrist' },
      { value:'ttnamesh', ar:'🎨 اسم — الكتف', en:'name script — shoulder' },
      { value:'ttnamehd', ar:'🎨 اسم — ظهر اليد', en:'name script — back of the hand' },
      { value:'ttdatefa', ar:'🎨 تاريخ — الساعد', en:'date numerals — forearm' },
      { value:'ttdatewr', ar:'🎨 تاريخ — المعصم', en:'date numerals — wrist' },
      { value:'ttdatesh', ar:'🎨 تاريخ — الكتف', en:'date numerals — shoulder' },
      { value:'ttdatehd', ar:'🎨 تاريخ — ظهر اليد', en:'date numerals — back of the hand' },
      { value:'ttheartfa', ar:'🎨 قلب — الساعد', en:'heart — forearm' },
      { value:'ttheartwr', ar:'🎨 قلب — المعصم', en:'heart — wrist' },
      { value:'ttheartsh', ar:'🎨 قلب — الكتف', en:'heart — shoulder' },
      { value:'tthearthd', ar:'🎨 قلب — ظهر اليد', en:'heart — back of the hand' },
      { value:'ttstarfa', ar:'🎨 نجوم — الساعد', en:'stars — forearm' },
      { value:'ttstarwr', ar:'🎨 نجوم — المعصم', en:'stars — wrist' },
      { value:'ttstarsh', ar:'🎨 نجوم — الكتف', en:'stars — shoulder' },
      { value:'ttstarhd', ar:'🎨 نجوم — ظهر اليد', en:'stars — back of the hand' },
      { value:'tttribalfa', ar:'🎨 قبلي — الساعد', en:'tribal — forearm' },
      { value:'tttribalwr', ar:'🎨 قبلي — المعصم', en:'tribal — wrist' },
      { value:'tttribalsh', ar:'🎨 قبلي — الكتف', en:'tribal — shoulder' },
      { value:'tttribalhd', ar:'🎨 قبلي — ظهر اليد', en:'tribal — back of the hand' },
    ],
    anime: [
      { value:'classic', ar:'🎌 أنمي ياباني كلاسيكي', en:'🎌 Classic Anime', fr:'🎌 Anime classique', hi:'🎌 क्लासिक एनीमे', ur:'🎌 کلاسک اینیمے', bn:'🎌 ক্লাসিক অ্যানিমে', ne:'🎌 क्लासिक एनिमे' },
      { value:'chibi', ar:'🧸 تشيبي', en:'🧸 Chibi', fr:'🧸 Chibi', hi:'🧸 चिबी', ur:'🧸 چیبی', bn:'🧸 চিবি', ne:'🧸 चिबी' },
      { value:'ghibli', ar:'🌱 ستايل غيبلي', en:'🌱 Ghibli Style', fr:'🌱 Style Ghibli', hi:'🌱 घिबली स्टाइल', ur:'🌱 غبلی اسٹائل', bn:'🌱 ঘিবলি স্টাইল', ne:'🌱 घिब्ली शैली' },
      { value:'cyberpunk', ar:'🌆 سايبربنك أنمي', en:'🌆 Cyberpunk Anime', fr:'🌆 Anime cyberpunk', hi:'🌆 साइबरपंक एनीमे', ur:'🌆 سائبرپنک اینیمے', bn:'🌆 সাইবারপাঙ্ক অ্যানিমে', ne:'🌆 साइबरपंक एनिमे' },
      { value:'manga', ar:'⬛ مانجا أبيض وأسود', en:'⬛ Manga B&W', fr:'⬛ Manga N&B', hi:'⬛ मंगा ब्लैक एंड व्हाइट', ur:'⬛ مانگا بلیک اینڈ وائٹ', bn:'⬛ মাঙ্গা সাদাকালো', ne:'⬛ मंगा कालो-सेतो' },
      { value:'shonenstudio', ar:'⚡ شونين أكشن', en:'⚡ Shonen action' },
      { value:'kawaii', ar:'🌸 كاواي باستيل', en:'🌸 Kawaii' },
      { value:'webtoon', ar:'📱 ويبتون', en:'📱 Webtoon' },
      { value:'retro90s', ar:'📼 أنمي التسعينات', en:'📼 Retro 90s' },
      /* v-studio-more-looks */
      { value:'seinen', ar:'🎬 سينين واقعي', en:'🎬 Seinen' },
      { value:'mecha', ar:'🤖 ميكا وروبوت', en:'🤖 Mecha' },
      { value:'isekai', ar:'🗡️ إيسيكاي فانتازي', en:'🗡️ Isekai fantasy' },
      { value:'magicalgirl', ar:'🪄 فتاة سحرية', en:'🪄 Magical girl' },
      { value:'cinematicanime', ar:'🎞️ أنمي سينمائي', en:'🎞️ Cinematic anime' },
      { value:'sportanime', ar:'⚽ أنمي رياضي', en:'⚽ Sports anime' },
      { value:'shojo', ar:'🌷 شوجو بريق', en:'🌷 Shojo sparkle' },
      /* v-studio-catalog-100 */
      { value:'anclassicwarm', ar:'🎭 كلاسيكي — دافئ', en:'classic anime — warm' },
      { value:'anclassiccool', ar:'🎭 كلاسيكي — بارد', en:'classic anime — cool' },
      { value:'anclassicvivid', ar:'🎭 كلاسيكي — ألوان قوية', en:'classic anime — vivid' },
      { value:'anclassicpastel', ar:'🎭 كلاسيكي — باستيل', en:'classic anime — pastel' },
      { value:'anghibliwarm', ar:'🎭 غيبلي — دافئ', en:'Ghibli-inspired — warm' },
      { value:'anghiblicool', ar:'🎭 غيبلي — بارد', en:'Ghibli-inspired — cool' },
      { value:'anghiblivivid', ar:'🎭 غيبلي — ألوان قوية', en:'Ghibli-inspired — vivid' },
      { value:'anghiblipastel', ar:'🎭 غيبلي — باستيل', en:'Ghibli-inspired — pastel' },
      { value:'anshonenwarm', ar:'🎭 شونين — دافئ', en:'shonen action — warm' },
      { value:'anshonencool', ar:'🎭 شونين — بارد', en:'shonen action — cool' },
      { value:'anshonenvivid', ar:'🎭 شونين — ألوان قوية', en:'shonen action — vivid' },
      { value:'anshonenpastel', ar:'🎭 شونين — باستيل', en:'shonen action — pastel' },
      { value:'anshojowarm', ar:'🎭 شوجو — دافئ', en:'shojo — warm' },
      { value:'anshojocool', ar:'🎭 شوجو — بارد', en:'shojo — cool' },
      { value:'anshojovivid', ar:'🎭 شوجو — ألوان قوية', en:'shojo — vivid' },
      { value:'anshojopastel', ar:'🎭 شوجو — باستيل', en:'shojo — pastel' },
      { value:'anseinenwarm', ar:'🎭 سينين — دافئ', en:'seinen — warm' },
      { value:'anseinencool', ar:'🎭 سينين — بارد', en:'seinen — cool' },
      { value:'anseinenvivid', ar:'🎭 سينين — ألوان قوية', en:'seinen — vivid' },
      { value:'anseinenpastel', ar:'🎭 سينين — باستيل', en:'seinen — pastel' },
      { value:'anchibiwarm', ar:'🎭 تشيبي — دافئ', en:'chibi — warm' },
      { value:'anchibicool', ar:'🎭 تشيبي — بارد', en:'chibi — cool' },
      { value:'anchibivivid', ar:'🎭 تشيبي — ألوان قوية', en:'chibi — vivid' },
      { value:'anchibipastel', ar:'🎭 تشيبي — باستيل', en:'chibi — pastel' },
      { value:'anmechawarm', ar:'🎭 ميكا — دافئ', en:'mecha pilot — warm' },
      { value:'anmechacool', ar:'🎭 ميكا — بارد', en:'mecha pilot — cool' },
      { value:'anmechavivid', ar:'🎭 ميكا — ألوان قوية', en:'mecha pilot — vivid' },
      { value:'anmechapastel', ar:'🎭 ميكا — باستيل', en:'mecha pilot — pastel' },
      { value:'anisekaiwarm', ar:'🎭 إيسيكاي — دافئ', en:'isekai fantasy — warm' },
      { value:'anisekaicool', ar:'🎭 إيسيكاي — بارد', en:'isekai fantasy — cool' },
      { value:'anisekaivivid', ar:'🎭 إيسيكاي — ألوان قوية', en:'isekai fantasy — vivid' },
      { value:'anisekaipastel', ar:'🎭 إيسيكاي — باستيل', en:'isekai fantasy — pastel' },
      { value:'anmagicalwarm', ar:'🎭 فتاة سحرية — دافئ', en:'magical-girl — warm' },
      { value:'anmagicalcool', ar:'🎭 فتاة سحرية — بارد', en:'magical-girl — cool' },
      { value:'anmagicalvivid', ar:'🎭 فتاة سحرية — ألوان قوية', en:'magical-girl — vivid' },
      { value:'anmagicalpastel', ar:'🎭 فتاة سحرية — باستيل', en:'magical-girl — pastel' },
      { value:'ancyberwarm', ar:'🎭 سايبربنك — دافئ', en:'cyberpunk anime — warm' },
      { value:'ancybercool', ar:'🎭 سايبربنك — بارد', en:'cyberpunk anime — cool' },
      { value:'ancybervivid', ar:'🎭 سايبربنك — ألوان قوية', en:'cyberpunk anime — vivid' },
      { value:'ancyberpastel', ar:'🎭 سايبربنك — باستيل', en:'cyberpunk anime — pastel' },
      { value:'anmangawarm', ar:'🎭 مانجا — دافئ', en:'black-and-white manga — warm' },
      { value:'anmangacool', ar:'🎭 مانجا — بارد', en:'black-and-white manga — cool' },
      { value:'anmangavivid', ar:'🎭 مانجا — ألوان قوية', en:'black-and-white manga — vivid' },
      { value:'anmangapastel', ar:'🎭 مانجا — باستيل', en:'black-and-white manga — pastel' },
      { value:'anwebtoonwarm', ar:'🎭 ويبتون — دافئ', en:'webtoon — warm' },
      { value:'anwebtooncool', ar:'🎭 ويبتون — بارد', en:'webtoon — cool' },
      { value:'anwebtoonvivid', ar:'🎭 ويبتون — ألوان قوية', en:'webtoon — vivid' },
      { value:'anwebtoonpastel', ar:'🎭 ويبتون — باستيل', en:'webtoon — pastel' },
      { value:'anretro90warm', ar:'🎭 تسعينات — دافئ', en:'1990s cel anime — warm' },
      { value:'anretro90cool', ar:'🎭 تسعينات — بارد', en:'1990s cel anime — cool' },
      { value:'anretro90vivid', ar:'🎭 تسعينات — ألوان قوية', en:'1990s cel anime — vivid' },
      { value:'anretro90pastel', ar:'🎭 تسعينات — باستيل', en:'1990s cel anime — pastel' },
      { value:'anretro80warm', ar:'🎭 ثمانينات — دافئ', en:'1980s anime — warm' },
      { value:'anretro80cool', ar:'🎭 ثمانينات — بارد', en:'1980s anime — cool' },
      { value:'anretro80vivid', ar:'🎭 ثمانينات — ألوان قوية', en:'1980s anime — vivid' },
      { value:'anretro80pastel', ar:'🎭 ثمانينات — باستيل', en:'1980s anime — pastel' },
      { value:'ankawaiiwarm', ar:'🎭 كاواي — دافئ', en:'kawaii — warm' },
      { value:'ankawaiicool', ar:'🎭 كاواي — بارد', en:'kawaii — cool' },
      { value:'ankawaiivivid', ar:'🎭 كاواي — ألوان قوية', en:'kawaii — vivid' },
      { value:'ankawaiipastel', ar:'🎭 كاواي — باستيل', en:'kawaii — pastel' },
      { value:'ansportswarm', ar:'🎭 رياضي — دافئ', en:'sports anime — warm' },
      { value:'ansportscool', ar:'🎭 رياضي — بارد', en:'sports anime — cool' },
      { value:'ansportsvivid', ar:'🎭 رياضي — ألوان قوية', en:'sports anime — vivid' },
      { value:'ansportspastel', ar:'🎭 رياضي — باستيل', en:'sports anime — pastel' },
      { value:'ansamuraiwarm', ar:'🎭 ساموراي — دافئ', en:'samurai anime — warm' },
      { value:'ansamuraicool', ar:'🎭 ساموراي — بارد', en:'samurai anime — cool' },
      { value:'ansamuraivivid', ar:'🎭 ساموراي — ألوان قوية', en:'samurai anime — vivid' },
      { value:'ansamuraipastel', ar:'🎭 ساموراي — باستيل', en:'samurai anime — pastel' },
      { value:'anidolwarm', ar:'🎭 آيدول — دافئ', en:'idol anime — warm' },
      { value:'anidolcool', ar:'🎭 آيدول — بارد', en:'idol anime — cool' },
      { value:'anidolvivid', ar:'🎭 آيدول — ألوان قوية', en:'idol anime — vivid' },
      { value:'anidolpastel', ar:'🎭 آيدول — باستيل', en:'idol anime — pastel' },
      { value:'anhorrorwarm', ar:'🎭 رعب — دافئ', en:'horror anime — warm' },
      { value:'anhorrorcool', ar:'🎭 رعب — بارد', en:'horror anime — cool' },
      { value:'anhorrorvivid', ar:'🎭 رعب — ألوان قوية', en:'horror anime — vivid' },
      { value:'anhorrorpastel', ar:'🎭 رعب — باستيل', en:'horror anime — pastel' },
      { value:'ancinematicwarm', ar:'🎭 سينمائي — دافئ', en:'cinematic anime film — warm' },
      { value:'ancinematiccool', ar:'🎭 سينمائي — بارد', en:'cinematic anime film — cool' },
      { value:'ancinematicvivid', ar:'🎭 سينمائي — ألوان قوية', en:'cinematic anime film — vivid' },
      { value:'ancinematicpastel', ar:'🎭 سينمائي — باستيل', en:'cinematic anime film — pastel' },
      { value:'anwatercolorwarm', ar:'🎭 مائي — دافئ', en:'watercolour anime — warm' },
      { value:'anwatercolorcool', ar:'🎭 مائي — بارد', en:'watercolour anime — cool' },
      { value:'anwatercolorvivid', ar:'🎭 مائي — ألوان قوية', en:'watercolour anime — vivid' },
      { value:'anwatercolorpastel', ar:'🎭 مائي — باستيل', en:'watercolour anime — pastel' },
      { value:'ancel3dwarm', ar:'🎭 ثلاثي الأبعاد — دافئ', en:'3D cel-shaded anime — warm' },
      { value:'ancel3dcool', ar:'🎭 ثلاثي الأبعاد — بارد', en:'3D cel-shaded anime — cool' },
      { value:'ancel3dvivid', ar:'🎭 ثلاثي الأبعاد — ألوان قوية', en:'3D cel-shaded anime — vivid' },
      { value:'ancel3dpastel', ar:'🎭 ثلاثي الأبعاد — باستيل', en:'3D cel-shaded anime — pastel' },
      { value:'anpixelwarm', ar:'🎭 بكسل — دافئ', en:'pixel-art anime — warm' },
      { value:'anpixelcool', ar:'🎭 بكسل — بارد', en:'pixel-art anime — cool' },
      { value:'anpixelvivid', ar:'🎭 بكسل — ألوان قوية', en:'pixel-art anime — vivid' },
      { value:'anpixelpastel', ar:'🎭 بكسل — باستيل', en:'pixel-art anime — pastel' },
      { value:'anarabicwarm', ar:'🎭 عربي — دافئ', en:'Arabian-nights anime — warm' },
      { value:'anarabiccool', ar:'🎭 عربي — بارد', en:'Arabian-nights anime — cool' },
      { value:'anarabicvivid', ar:'🎭 عربي — ألوان قوية', en:'Arabian-nights anime — vivid' },
      { value:'anarabicpastel', ar:'🎭 عربي — باستيل', en:'Arabian-nights anime — pastel' },
      { value:'anschoolwarm', ar:'🎭 مدرسي — دافئ', en:'school-life anime — warm' },
      { value:'anschoolcool', ar:'🎭 مدرسي — بارد', en:'school-life anime — cool' },
      { value:'anschoolvivid', ar:'🎭 مدرسي — ألوان قوية', en:'school-life anime — vivid' },
      { value:'anschoolpastel', ar:'🎭 مدرسي — باستيل', en:'school-life anime — pastel' },
    ],
    heritage: [
      { value:'kandora', ar:'👳 كندورة وغترة خليجية', en:'👳 Gulf Kandora & Ghutra', fr:'👳 Kandora du Golfe', hi:'👳 खाड़ी कंदुरा', ur:'👳 خلیجی کندورہ', bn:'👳 উপসাগরীয় কান্দুরা', ne:'👳 खाडी कान्दुरा' },
      { value:'bisht', ar:'🧥 بشت فاخر', en:'🧥 Luxury Bisht Cloak', fr:'🧥 Cape Bisht de luxe', hi:'🧥 शानदार बिश्त', ur:'🧥 پرتعیش بشت', bn:'🧥 বিলাসবহুল বিশত', ne:'🧥 विलासी बिश्त' },
      { value:'abaya', ar:'🖤 عباءة تقليدية', en:'🖤 Traditional Abaya', fr:'🖤 Abaya traditionnelle', hi:'🖤 पारंपरिक अबाया', ur:'🖤 روایتی عبایہ', bn:'🖤 ঐতিহ্যবাহী আবায়া', ne:'🖤 परम्परागत अबाया' },
      { value:'embroidered', ar:'🧵 ثوب نشل مطرز', en:'🧵 Embroidered Thobe Nashal', fr:'🧵 Robe brodée', hi:'🧵 कढ़ाई वाला थोब', ur:'🧵 کڑھائی والا لباس', bn:'🧵 সূচিকর্ম করা পোশাক', ne:'🧵 कसीदाकारी पोशाक' },
      { value:'saudi', ar:'🇸🇦 ثوب سعودي وشماغ', en:'🇸🇦 Saudi Thobe & Shemagh', fr:'🇸🇦 Thobe saoudien', hi:'🇸🇦 सऊदी थोब', ur:'🇸🇦 سعودی لباس', bn:'🇸🇦 সৌদি পোশাক', ne:'🇸🇦 साउदी पोशाक' },
      { value:'emirati', ar:'🇦🇪 كافتان إماراتي مطرز', en:'🇦🇪 Emirati Embroidered Kaftan', fr:'🇦🇪 Caftan émirati', hi:'🇦🇪 इमिराती काफ्तान', ur:'🇦🇪 اماراتی قفطان', bn:'🇦🇪 আমিরাতি কাফতান', ne:'🇦🇪 इमिराती काफ्तान' },
      { value:'omani', ar:'🇴🇲 عماني بكمة', en:'🇴🇲 Omani' },
      { value:'saudimen2', ar:'🧥 بشت وشماغ', en:'🧥 Bisht & shemagh' },
      { value:'moroccanher', ar:'🇲🇦 جلباب مغربي', en:'🇲🇦 Moroccan djellaba' },
      { value:'palestinian', ar:'🇵🇸 ثوب مطرّز', en:'🇵🇸 Embroidered thobe' },
      /* v-studio-more-looks */
      { value:'kuwaitiher', ar:'🇰🇼 دراعة كويتية', en:'🇰🇼 Kuwaiti daraa' },
      { value:'qatarither', ar:'🇶🇦 ثوب نشل قطري', en:'🇶🇦 Qatari nashal' },
      { value:'bahrainiher', ar:'🇧🇭 ثوب بحريني', en:'🇧🇭 Bahraini dress' },
      { value:'omaniwomen', ar:'🇴🇲 زيّ عماني نسائي', en:'🇴🇲 Omani women\'s dress' },
      { value:'yemeni', ar:'🇾🇪 زيّ يمني', en:'🇾🇪 Yemeni' },
      { value:'egyptian', ar:'🇪🇬 جلابية مصرية', en:'🇪🇬 Egyptian galabeya' },
      { value:'sudanesedress', ar:'🇸🇩 زيّ سوداني', en:'🇸🇩 Sudanese' },
      { value:'levantine', ar:'🌿 زيّ شامي', en:'🌿 Levantine' },
      /* v-studio-catalog-100 */
      { value:'hruaeMc', ar:'🏛️ إماراتي رجالي — كلاسيكي', en:'Emirati men — classic' },
      { value:'hruaeMf', ar:'🏛️ إماراتي رجالي — احتفالي', en:'Emirati men — festive' },
      { value:'hruaeWc', ar:'🏛️ إماراتي نسائي — كلاسيكي', en:'Emirati women — classic' },
      { value:'hruaeWf', ar:'🏛️ إماراتي نسائي — احتفالي', en:'Emirati women — festive' },
      { value:'hrksaMc', ar:'🏛️ سعودي رجالي — كلاسيكي', en:'Saudi men — classic' },
      { value:'hrksaMf', ar:'🏛️ سعودي رجالي — احتفالي', en:'Saudi men — festive' },
      { value:'hrksaWc', ar:'🏛️ سعودي نسائي — كلاسيكي', en:'Saudi women — classic' },
      { value:'hrksaWf', ar:'🏛️ سعودي نسائي — احتفالي', en:'Saudi women — festive' },
      { value:'hrkwMc', ar:'🏛️ كويتي رجالي — كلاسيكي', en:'Kuwaiti men — classic' },
      { value:'hrkwMf', ar:'🏛️ كويتي رجالي — احتفالي', en:'Kuwaiti men — festive' },
      { value:'hrkwWc', ar:'🏛️ كويتي نسائي — كلاسيكي', en:'Kuwaiti women — classic' },
      { value:'hrkwWf', ar:'🏛️ كويتي نسائي — احتفالي', en:'Kuwaiti women — festive' },
      { value:'hrqaMc', ar:'🏛️ قطري رجالي — كلاسيكي', en:'Qatari men — classic' },
      { value:'hrqaMf', ar:'🏛️ قطري رجالي — احتفالي', en:'Qatari men — festive' },
      { value:'hrqaWc', ar:'🏛️ قطري نسائي — كلاسيكي', en:'Qatari women — classic' },
      { value:'hrqaWf', ar:'🏛️ قطري نسائي — احتفالي', en:'Qatari women — festive' },
      { value:'hrbhMc', ar:'🏛️ بحريني رجالي — كلاسيكي', en:'Bahraini men — classic' },
      { value:'hrbhMf', ar:'🏛️ بحريني رجالي — احتفالي', en:'Bahraini men — festive' },
      { value:'hrbhWc', ar:'🏛️ بحريني نسائي — كلاسيكي', en:'Bahraini women — classic' },
      { value:'hrbhWf', ar:'🏛️ بحريني نسائي — احتفالي', en:'Bahraini women — festive' },
      { value:'hromMc', ar:'🏛️ عماني رجالي — كلاسيكي', en:'Omani men — classic' },
      { value:'hromMf', ar:'🏛️ عماني رجالي — احتفالي', en:'Omani men — festive' },
      { value:'hromWc', ar:'🏛️ عماني نسائي — كلاسيكي', en:'Omani women — classic' },
      { value:'hromWf', ar:'🏛️ عماني نسائي — احتفالي', en:'Omani women — festive' },
      { value:'hryeMc', ar:'🏛️ يمني رجالي — كلاسيكي', en:'Yemeni men — classic' },
      { value:'hryeMf', ar:'🏛️ يمني رجالي — احتفالي', en:'Yemeni men — festive' },
      { value:'hryeWc', ar:'🏛️ يمني نسائي — كلاسيكي', en:'Yemeni women — classic' },
      { value:'hryeWf', ar:'🏛️ يمني نسائي — احتفالي', en:'Yemeni women — festive' },
      { value:'hregMc', ar:'🏛️ مصري رجالي — كلاسيكي', en:'Egyptian men — classic' },
      { value:'hregMf', ar:'🏛️ مصري رجالي — احتفالي', en:'Egyptian men — festive' },
      { value:'hregWc', ar:'🏛️ مصري نسائي — كلاسيكي', en:'Egyptian women — classic' },
      { value:'hregWf', ar:'🏛️ مصري نسائي — احتفالي', en:'Egyptian women — festive' },
      { value:'hrmaMc', ar:'🏛️ مغربي رجالي — كلاسيكي', en:'Moroccan men — classic' },
      { value:'hrmaMf', ar:'🏛️ مغربي رجالي — احتفالي', en:'Moroccan men — festive' },
      { value:'hrmaWc', ar:'🏛️ مغربي نسائي — كلاسيكي', en:'Moroccan women — classic' },
      { value:'hrmaWf', ar:'🏛️ مغربي نسائي — احتفالي', en:'Moroccan women — festive' },
      { value:'hrpsMc', ar:'🏛️ فلسطيني رجالي — كلاسيكي', en:'Palestinian men — classic' },
      { value:'hrpsMf', ar:'🏛️ فلسطيني رجالي — احتفالي', en:'Palestinian men — festive' },
      { value:'hrpsWc', ar:'🏛️ فلسطيني نسائي — كلاسيكي', en:'Palestinian women — classic' },
      { value:'hrpsWf', ar:'🏛️ فلسطيني نسائي — احتفالي', en:'Palestinian women — festive' },
      { value:'hrsdMc', ar:'🏛️ سوداني رجالي — كلاسيكي', en:'Sudanese men — classic' },
      { value:'hrsdMf', ar:'🏛️ سوداني رجالي — احتفالي', en:'Sudanese men — festive' },
      { value:'hrsdWc', ar:'🏛️ سوداني نسائي — كلاسيكي', en:'Sudanese women — classic' },
      { value:'hrsdWf', ar:'🏛️ سوداني نسائي — احتفالي', en:'Sudanese women — festive' },
      { value:'hriqMc', ar:'🏛️ عراقي رجالي — كلاسيكي', en:'Iraqi men — classic' },
      { value:'hriqMf', ar:'🏛️ عراقي رجالي — احتفالي', en:'Iraqi men — festive' },
      { value:'hrjoc', ar:'🏛️ أردني — كلاسيكي', en:'Jordanian — classic' },
      { value:'hrjof', ar:'🏛️ أردني — احتفالي', en:'Jordanian — festive' },
      { value:'hrlbc', ar:'🏛️ شامي — كلاسيكي', en:'Levantine — classic' },
      { value:'hrlbf', ar:'🏛️ شامي — احتفالي', en:'Levantine — festive' },
      { value:'hrtnc', ar:'🏛️ تونسي — كلاسيكي', en:'Tunisian — classic' },
      { value:'hrtnf', ar:'🏛️ تونسي — احتفالي', en:'Tunisian — festive' },
      { value:'hrdzc', ar:'🏛️ جزائري — كلاسيكي', en:'Algerian — classic' },
      { value:'hrdzf', ar:'🏛️ جزائري — احتفالي', en:'Algerian — festive' },
      { value:'hrtrc', ar:'🏛️ تركي عثماني — كلاسيكي', en:'Ottoman — classic' },
      { value:'hrtrf', ar:'🏛️ تركي عثماني — احتفالي', en:'Ottoman — festive' },
      { value:'hrinc', ar:'🏛️ هندي — كلاسيكي', en:'Indian — classic' },
      { value:'hrinf', ar:'🏛️ هندي — احتفالي', en:'Indian — festive' },
      { value:'hrpkc', ar:'🏛️ باكستاني — كلاسيكي', en:'Pakistani — classic' },
      { value:'hrpkf', ar:'🏛️ باكستاني — احتفالي', en:'Pakistani — festive' },
      { value:'hrjpc', ar:'🏛️ ياباني — كلاسيكي', en:'Japanese — classic' },
      { value:'hrjpf', ar:'🏛️ ياباني — احتفالي', en:'Japanese — festive' },
      { value:'hrkrc', ar:'🏛️ كوري — كلاسيكي', en:'Korean — classic' },
      { value:'hrkrf', ar:'🏛️ كوري — احتفالي', en:'Korean — festive' },
      { value:'hrcnc', ar:'🏛️ صيني — كلاسيكي', en:'Chinese — classic' },
      { value:'hrcnf', ar:'🏛️ صيني — احتفالي', en:'Chinese — festive' },
      { value:'hrscc', ar:'🏛️ اسكتلندي — كلاسيكي', en:'Scottish — classic' },
      { value:'hrscf', ar:'🏛️ اسكتلندي — احتفالي', en:'Scottish — festive' },
      { value:'hrmxc', ar:'🏛️ مكسيكي — كلاسيكي', en:'Mexican — classic' },
      { value:'hrmxf', ar:'🏛️ مكسيكي — احتفالي', en:'Mexican — festive' },
      { value:'hrngc', ar:'🏛️ نيجيري — كلاسيكي', en:'Nigerian — classic' },
      { value:'hrngf', ar:'🏛️ نيجيري — احتفالي', en:'Nigerian — festive' },
      { value:'hrma2c', ar:'🏛️ أمازيغي — كلاسيكي', en:'Amazigh — classic' },
      { value:'hrma2f', ar:'🏛️ أمازيغي — احتفالي', en:'Amazigh — festive' },
      { value:'hrkzc', ar:'🏛️ كازاخي — كلاسيكي', en:'Kazakh — classic' },
      { value:'hrkzf', ar:'🏛️ كازاخي — احتفالي', en:'Kazakh — festive' },
      { value:'hrmyc', ar:'🏛️ ماليزي — كلاسيكي', en:'Malay — classic' },
      { value:'hrmyf', ar:'🏛️ ماليزي — احتفالي', en:'Malay — festive' },
      { value:'hridc', ar:'🏛️ إندونيسي — كلاسيكي', en:'Indonesian — classic' },
      { value:'hridf', ar:'🏛️ إندونيسي — احتفالي', en:'Indonesian — festive' },
      { value:'hrirc', ar:'🏛️ فارسي — كلاسيكي', en:'Persian — classic' },
      { value:'hrirf', ar:'🏛️ فارسي — احتفالي', en:'Persian — festive' },
      { value:'hrafc', ar:'🏛️ أفغاني — كلاسيكي', en:'Afghan — classic' },
      { value:'hraff', ar:'🏛️ أفغاني — احتفالي', en:'Afghan — festive' },
      { value:'hrsoc', ar:'🏛️ صومالي — كلاسيكي', en:'Somali — classic' },
      { value:'hrsof', ar:'🏛️ صومالي — احتفالي', en:'Somali — festive' },
      { value:'hretc', ar:'🏛️ إثيوبي — كلاسيكي', en:'Ethiopian — classic' },
      { value:'hretf', ar:'🏛️ إثيوبي — احتفالي', en:'Ethiopian — festive' },
      { value:'hrruc', ar:'🏛️ روسي — كلاسيكي', en:'Russian — classic' },
      { value:'hrruf', ar:'🏛️ روسي — احتفالي', en:'Russian — festive' },
      { value:'hrgrc', ar:'🏛️ يوناني — كلاسيكي', en:'Greek — classic' },
      { value:'hrgrf', ar:'🏛️ يوناني — احتفالي', en:'Greek — festive' },
      { value:'hresc', ar:'🏛️ أندلسي — كلاسيكي', en:'Andalusian — classic' },
      { value:'hresf', ar:'🏛️ أندلسي — احتفالي', en:'Andalusian — festive' },
      { value:'hrvnc', ar:'🏛️ فيتنامي — كلاسيكي', en:'Vietnamese — classic' },
      { value:'hrvnf', ar:'🏛️ فيتنامي — احتفالي', en:'Vietnamese — festive' },
      { value:'hrbedMc', ar:'🏛️ بدوي — كلاسيكي', en:'Bedouin — classic' },
      { value:'hrbedMf', ar:'🏛️ بدوي — احتفالي', en:'Bedouin — festive' },
      { value:'hrdiverc', ar:'🏛️ غوّاص لؤلؤ — كلاسيكي', en:'pearl diver — classic' },
      { value:'hrdiverf', ar:'🏛️ غوّاص لؤلؤ — احتفالي', en:'pearl diver — festive' },
    ],
    merge: [],
  };
  /* v-studio-14: الميزات الأربع عشرة الجديدة (app-12-studio-more.js) */
  const MORE = window.__STUDIO_MORE || { features: [], options: {} };
  Object.keys(MORE.options).forEach((k) => { STUDIO_OPTIONS[k] = MORE.options[k]; });
  const PREVIEW_API = (f, v) => '/api/studio-preview?feature=' + encodeURIComponent(f) + '&value=' + encodeURIComponent(v);
  /* v-studio-more-looks: صور خيارات المكياج الجاهزة لقطات جسم كامل لا يظهر فيها المكياج،
     فبدت العشرة صورة واحدة في المنتقي. لهذه الميزات المعاينة المولّدة (وجه قريب من
     /api/studio-preview، تُولَّد مرّة وتُخزَّن) أوّلًا، والصورة الجاهزة احتياطًا. */
  /* v-nails-previews (المالك ٢ أكتوبر، لقطة المقارنة: «غيّر الأشكال، السطر كامل اللي فوق مع ٣ اللي تحتهم، على نفس الأسامي»):
     صور الأظافر الجاهزة الاثنتا عشرة (assets/studio/options/nails-*.webp) فساتين وأيادٍ عامّة لا تُظهر اللون ولا الشكل.
     الأظافر صارت معاينة-أوّلًا كالمكياج: يد قريبة بالأظافر المطلوبة من وصفها نفسه، تُولَّد مرّة وتُخزَّن للجميع. */
  const PREVIEW_FIRST = ['makeup', 'nails'];
  function optionImgs(f, v){
    const asset = 'assets/studio/options/' + f + '-' + v + '.webp';
    const gen = PREVIEW_API(f, v);
    return PREVIEW_FIRST.indexOf(f) !== -1 ? { img: gen, img2: asset } : { img: asset, img2: gen };
  }
  const IS_MORE = (f) => !!MORE.options[f];
  function moreLabel(obj){
    const lg = (typeof lang !== 'undefined' && lang) ? lang : (localStorage.getItem('aiapp_lang') || 'ar');
    return obj[lg] || obj.en || obj.ar;
  }
  function injectMoreTabs(){
    if(!tabsWrap || !MORE.features.length) return;
    const mergeBtn = tabsWrap.querySelector('.studioAiTabBtn[data-feature="merge"]');
    MORE.features.forEach((f) => {
      let b = tabsWrap.querySelector('.studioAiTabBtn[data-feature="' + f.key + '"]');
      if(!b){
        b = document.createElement('button');
        b.type = 'button'; b.className = 'btn studioAiTabBtn'; b.dataset.feature = f.key; b.dataset.more = '1';
        b.style.whiteSpace = 'nowrap';
        if(mergeBtn) tabsWrap.insertBefore(b, mergeBtn); else tabsWrap.appendChild(b);
      }
      const sp = b.querySelector('span');
      if(sp) sp.textContent = moreLabel(f.labels); else b.textContent = moreLabel(f.labels);
    });
  }
  injectMoreTabs();
  try{ new MutationObserver(injectMoreTabs).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); }catch(e){ /* guard-ok */ }

  let feature = 'hair';
  let selectedBase64A = '', selectedMimeA = 'image/jpeg';
  let selectedBase64B = '', selectedMimeB = 'image/jpeg';

  function setStatus(text){
    statusEl.style.display = text ? 'block' : 'none';
    statusEl.textContent = text || '';
  }

  function populateStyleSelect(){
    const opts = STUDIO_OPTIONS[feature] || [];
    const langKey = (typeof lang !== 'undefined' && lang) ? lang : 'ar';
    styleEl.innerHTML = opts.map((o) => '<option value="' + o.value + '">' + (o[langKey] || (window.__bT ? window.__bT(o.ar, o.en) : o.en)) + '</option>').join('');
  }

  /* ---- 👤 saved face profile ---- */
  const PROFILE_KEY = 'aiapp_studio_profile';
  function loadProfile(){
    try{ return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); }catch(e){ return {}; }
  }
  function fillProfileInputs(){
    const p = loadProfile();
    if(profileFaceShapeEl) profileFaceShapeEl.value = p.faceShape || '';
    if(profileSkinEl) profileSkinEl.value = p.skin || '';
    if(profileHairEl) profileHairEl.value = p.hair || '';
  }
  fillProfileInputs();
  if(profileSaveBtn) profileSaveBtn.onclick = () => {
    const p = {
      faceShape: profileFaceShapeEl.value.trim(),
      skin: profileSkinEl.value.trim(),
      hair: profileHairEl.value.trim(),
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    setStatus(t2('studioProfileSaved'));
  };

  /* ---- ❤️ favorites ---- */
  const FAV_KEY = 'aiapp_studio_favorites';
  function loadFavorites(){
    try{ return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }catch(e){ return []; }
  }
  function saveFavorite(dataUrl, featureLabel, styleLabel){
    const favs = loadFavorites();
    favs.unshift({ img: dataUrl, feature: featureLabel || '', style: styleLabel || '', ts: Date.now() });
    localStorage.setItem(FAV_KEY, JSON.stringify(favs.slice(0, 30)));
  }
  function renderFavorites(){
    const favs = loadFavorites();
    favoritesPanel.innerHTML = '';
    if(!favs.length){
      favoritesPanel.innerHTML = '<p style="font-size:12px; color:var(--muted,#999); text-align:center;">' + t2('studioNoFavorites') + '</p>';
      return;
    }
    favs.forEach((f, idx) => {
      const card = document.createElement('div');
      card.style.cssText = 'display:flex; align-items:center; gap:8px; border:1px solid var(--border,#333); border-radius:8px; padding:6px;';
      card.innerHTML = '<img src="' + f.img + '" style="width:50px; height:50px; object-fit:cover; border-radius:6px;">' +
        '<span style="flex:1; font-size:11.5px; color:var(--muted,#999);">' + (f.feature || '') + (f.style ? (' · ' + f.style) : '') + '</span>' +
        '<button type="button" class="btn iconBtn" data-idx=' + idx + '" style="padding:2px 8px; font-size:12px;">✕</button>';
      card.querySelector('button').onclick = () => {
        const arr = loadFavorites();
        arr.splice(idx, 1);
        localStorage.setItem(FAV_KEY, JSON.stringify(arr));
        renderFavorites();
      };
      favoritesPanel.appendChild(card);
    });
  }
  if(favoritesBtn) favoritesBtn.onclick = () => {
    const showing = favoritesPanel.style.display !== 'none' && favoritesPanel.style.display !== '';
    if(showing){ favoritesPanel.style.display = 'none'; return; }
    renderFavorites();
    favoritesPanel.style.display = 'flex';
  };
  if(favSaveBtn) favSaveBtn.onclick = () => {
    if(!resultEl.src) return;
    const styleLabel = (styleEl.querySelector('option[value="' + styleEl.value + '"]') || {}).textContent || styleEl.value;
    saveFavorite(resultEl.src, feature, styleLabel);
    favSaveBtn.textContent = t2('studioFavoriteSaved');
    setTimeout(() => { favSaveBtn.textContent = t2('studioFavoriteSaveBtn'); }, 1800);
  };

  /* ---- 🔄 before/after slider ----
     v-compare-drag-all (طلب المالك ٢١ سبتمبر «غيّرها»): كانت مُقفلة كليًّا (`if(true) return;`) منذ
     v-no-slider — السحب صار مباشرة على resultWrap نفسه بدل <input type=range> مخفيّ. */
  function updateSliderClip(pct){
    pct = Math.max(0, Math.min(100, pct));
    beforeWrap.style.width = pct + '%';
    beforeImg.style.width = resultWrap.clientWidth + 'px';
  }
  function setupBeforeAfter(){
    if(feature === 'merge' || !selectedBase64A){
      beforeWrap.style.display = 'none';
      return;
    }
    beforeImg.src = 'data:' + selectedMimeA + ';base64,' + selectedBase64A;
    beforeWrap.style.display = 'block';
    updateSliderClip(50);
  }
  let __studioBaDragging = false;
  function studioBaPctFromEvent(ev){
    const rect = resultWrap.getBoundingClientRect();
    if(!rect.width) return 50;
    return ((ev.clientX - rect.left) / rect.width) * 100;
  }
  if(resultWrap){
    resultWrap.style.touchAction = 'none';
    resultWrap.addEventListener('pointerdown', (ev) => {
      if(!beforeWrap || beforeWrap.style.display === 'none') return;
      __studioBaDragging = true;
      try{ resultWrap.setPointerCapture(ev.pointerId); }catch(e){ /* guard-ok */ }
      updateSliderClip(studioBaPctFromEvent(ev));
      ev.preventDefault();
    });
    resultWrap.addEventListener('pointermove', (ev) => { if(__studioBaDragging) updateSliderClip(studioBaPctFromEvent(ev)); });
    ['pointerup', 'pointercancel'].forEach((evt) => resultWrap.addEventListener(evt, () => { __studioBaDragging = false; }));
  }

  /* v-studio-variants (طلب المالك «أكثر من ١٠٠ في كلّ شكل»): عدّاد على الجهاز لكلّ
     ميزة+خيار يرتفع مع كلّ توليد، فيصل الخادم رقم شكلٍ جديد في كلّ ضغطة — المشترك
     لا يرى التصميم نفسه مرّتين. تعذّر التخزين لا يوقف التوليد: رقم عشوائيّ. */
  function nextVariant(f, v){
    const key = 'aiapp_studio_var_' + f + '_' + v;
    try{
      const n = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1;
      localStorage.setItem(key, String(n));
      return n;
    }catch(e){ return Math.floor(Math.random() * 100000); } /* guard-ok — بلا تخزين: عشوائيّ */
  }

  /* v-edit-no-change: كود الخطأ يُترجَم برسائل imgErrFriendly القائمة، وما لا ترجمة له يبقى كما هو */
  function studioErrText(e){
    const code = (e && e.message) ? String(e.message) : String(e);
    try{
      const isAr = !((typeof lang !== 'undefined' && lang) ? String(lang) : (localStorage.getItem('aiapp_lang') || 'ar')).startsWith('en');
      const friendly = (typeof imgErrFriendly === 'function') ? imgErrFriendly(code, isAr) : null;
      if(friendly) return '⚠️ ' + friendly;
    }catch(err){ /* guard-ok — بلا ترجمة نعرض الكود */ }
    return (bT('❌ خطأ: ','❌ Error: ')) + code;
  }

  /* ---- 📊 compare checkboxes (built from style options) ---- */
  function buildCompareChecks(){
    /* v-studio-compare-cards (لقطة المالك «كيف الشخص يعرف الشكل»): كلّ خيار بطاقة بصورته (optionImgs نفسها)
       بدل مربّع نصّيّ، وثلاثة كحدّ أقصى. الصور تُحمَّل عند ظهورها فقط. */
    compareChecksEl.innerHTML = '';
    Array.from(styleEl.options).forEach(opt => {
      const label = document.createElement('label');
      label.className = 'stCmp';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'studioCompareCheck'; cb.value = opt.value;
      const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy';
      const srcs = optionImgs(feature, opt.value);
      if(window.__omranWhenSeen) window.__omranWhenSeen(img, function(){ img.src = srcs.img; }); else img.src = srcs.img;
      img.onerror = function(){ if(!img.__alt){ img.__alt = 1; img.src = srcs.img2; } else img.style.visibility = 'hidden'; };
      const nm = document.createElement('span'); nm.textContent = opt.textContent.trim();
      cb.onchange = () => {
        if(cb.checked && compareChecksEl.querySelectorAll('.studioCompareCheck:checked').length > 3){ cb.checked = false; return; }
        label.classList.toggle('on', cb.checked);
      };
      label.appendChild(cb); label.appendChild(img); label.appendChild(nm);
      compareChecksEl.appendChild(label);
    });
  }

  /* v-studio-cards: بطاقات الخيارات المصوّرة — صورة من assets/studio/options/
     <الميزة>-<القيمة>.webp، وبلا صورة شارة أنيقة بحلقة ذهبية. السلكت مخفيّ
     ومتزامن فقارئا التوليد والمقارنة عليه بلا تغيير. */
  const studioCardsEl = $('#studioStyleCards');
  function featureTitle(){
    const b = tabsWrap.querySelector('.studioAiTabBtn[data-feature="' + feature + '"]');
    return b ? b.textContent.trim() : '';
  }
  function openStudioPicker(){
    if(!window.omranPicker || !styleEl) return;
    const opts = Array.from(styleEl.options);
    window.omranPicker.open({
      title: featureTitle() || (bT('✨ ستايل الذكاء الاصطناعي','✨ AI style')),
      count: opts.length + (bT(' خيارًا — اختر ما يناسبك',' options — pick yours')),
      items: opts.map((opt) => Object.assign({
        v: opt.value, title: opt.textContent.trim(), active: opt.value === styleEl.value,
      }, optionImgs(feature, opt.value))), /* v-studio-14 + v-studio-more-looks: معاينة مولّدة على الخادم */
      onPick: function(v){ styleEl.value = v; renderStudioStyleCards(); },
    });
  }
  function renderStudioStyleCards(){
    if(!studioCardsEl || !styleEl) return;
    // v-studio-full-page: بطاقة مصغّرة «عرض الكل ›» تفتح معرضًا ملء الشاشة —
    // نفس نظام أنماط الصور بالضبط (طلب المالك: كل المنتقيات بحجم صفحة كاملة).
    studioCardsEl.style.display = 'block';
    studioCardsEl.innerHTML = '';
    const cur = Array.from(styleEl.options).find((o) => o.value === styleEl.value) || styleEl.options[0];
    if(!cur) return;
    const trig = document.createElement('div');
    trig.id = 'studioStyleTrigger';
    trig.style.cssText = 'display:flex; align-items:center; gap:10px; border:1px solid var(--border,#333); border-radius:12px; padding:8px 10px; cursor:pointer; background:var(--panel2,#101014);';
    const img = document.createElement('img');
    img.alt = cur.textContent.trim(); img.loading = 'lazy';
    img.style.cssText = 'width:44px; height:58px; object-fit:cover; border-radius:8px; background:linear-gradient(160deg,#23232a,#101014); flex:none;';
    /* v-art-defer: داخل #studioAiModal المغلق — المقاس ثابت 44×58 فالتأجيل آمن. */
    const __srcs = optionImgs(feature, cur.value); /* v-studio-more-looks */
    if(window.__omranWhenSeen) window.__omranWhenSeen(img, function(){ img.src = __srcs.img; });
    else img.src = __srcs.img;
    img.onerror = function(){ if(!img.__alt){ img.__alt = 1; img.src = __srcs.img2; } else img.style.visibility = 'hidden'; }; /* v-studio-14 */
    const info = document.createElement('div');
    info.style.cssText = 'flex:1; min-width:0;';
    const nm = document.createElement('div');
    nm.textContent = cur.textContent.trim();
    nm.style.cssText = 'font-size:13.5px; font-weight:700;';
    const sub = document.createElement('div');
    sub.textContent = styleEl.options.length + ' ' + (typeof window.t==='function'&&window.t('pickerOptsForFeature')!=='pickerOptsForFeature'?window.t('pickerOptsForFeature'):(bT('خيارًا لهذه الميزة','options for this feature')));
    sub.style.cssText = 'font-size:11px; color:var(--muted,#999);';
    info.appendChild(nm); info.appendChild(sub);
    const all = document.createElement('span');
    all.textContent = (typeof window.t==='function'&&window.t('portraitStyleBrowseAll')!=='portraitStyleBrowseAll'?window.t('portraitStyleBrowseAll'):(bT('عرض الكل ›','Browse all ›')));
    all.style.cssText = 'color:#d4af37; font-size:12.5px; font-weight:700; flex:none;';
    trig.appendChild(img); trig.appendChild(info); trig.appendChild(all);
    trig.onclick = openStudioPicker;
    studioCardsEl.appendChild(trig);
    renderStudioBasket(); /* v-studio-chain */
  }
  /* v-studio-combo-removed (أمر المالك ٤ سبتمبر «احذف هذي الميزة»): سلّة المجموعة أُزيلت */
  /* v-studio-chain (طلب المالك ٣٠ سبتمبر «خلّ المستخدم يختار كذا شيء مش شيء واحد» — «الاثنين»):
     سلّة حتّى ٥ اختيارات. ميزات مختلفة ⇒ صورة واحدة فيها الكلّ (شعر + مكياج + نظّارة…)؛ أكثر من خيار
     من الميزة نفسها ⇒ صورة لكلّ خيار (حتّى ٣ صور). السلسلة تجري **من العميل خطوةً خطوة** — كلّ خطوة
     نداء مستقلّ بمهلته وحارسه، والناتج يُضغط JPEG قبل الخطوة التالية. المجموعة القديمة (٤ سبتمبر) كانت
     سلسلة داخل نداء خادم واحد: مهلة الدالّة تقطعها بعد خطوة فيطبّق «شيئًا واحدًا فقط»، وناتج PNG بدقّة
     2K يتجاوز حدّ جسم الطلب. وكلّ خطوة بعد الأولى تُرسل الأصل ليُفحص الشخص مقابله لا مقابل ناتج سابق. */
  const STUDIO_BASKET_MAX = 5, STUDIO_IMAGES_MAX = 3;
  const CHAIN_ORDER = ['body', 'age', 'hair', 'menhair', 'beard', 'skin', 'makeup', 'eyes', 'glasses', 'henna', 'nails', 'tattoo', 'heritage', 'hijab', 'gulfmen', 'wedding', 'seasons', 'iconic', 'palette', 'idphoto', 'accessories', 'background', 'anime'];
  let studioBasket = [];
  function studioBasketLabel(f, v){
    const tb = tabsWrap.querySelector('.studioAiTabBtn[data-feature="' + f + '"]');
    const ft = tb ? tb.textContent.trim() : f;
    const o = f === feature ? Array.from(styleEl.options).find((x) => x.value === v) : null;
    return { ft, vt: o ? o.textContent.trim() : v };
  }
  function studioCombos(){
    const groups = {};
    studioBasket.forEach((it) => { (groups[it.f] = groups[it.f] || []).push(it); });
    const feats = Object.keys(groups).sort((a, b) => CHAIN_ORDER.indexOf(a) - CHAIN_ORDER.indexOf(b));
    let combos = [[]];
    feats.forEach((f) => { const next = []; combos.forEach((c) => groups[f].forEach((it) => next.push(c.concat([it])))); combos = next; });
    return combos.slice(0, STUDIO_IMAGES_MAX);
  }
  function renderStudioBasket(){
    if(!studioCardsEl) return;
    let box = document.getElementById('studioBasket');
    if(!box){ box = document.createElement('div'); box.id = 'studioBasket'; }
    studioCardsEl.appendChild(box);
    box.style.cssText = 'margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; align-items:center;';
    box.innerHTML = '';
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'btn';
    addBtn.style.cssText = 'font-size:12.5px; padding:6px 12px; border-radius:999px;';
    const inB = studioBasket.some((it) => it.f === feature && it.v === styleEl.value);
    addBtn.textContent = inB ? bT('✓ مضاف للاختيارات', '✓ Added') : bT('➕ أضف هذا للاختيارات', '➕ Add to selection');
    addBtn.disabled = inB || feature === 'merge';
    addBtn.onclick = () => {
      if(studioBasket.length >= STUDIO_BASKET_MAX){ setStatus(bT('الحدّ ' + STUDIO_BASKET_MAX + ' اختيارات — احذف واحدًا لتضيف غيره.', 'Up to ' + STUDIO_BASKET_MAX + ' picks — remove one first.')); return; }
      const lb = studioBasketLabel(feature, styleEl.value);
      studioBasket.push({ f: feature, v: styleEl.value, ft: lb.ft, vt: lb.vt });
      renderStudioBasket(); refreshGenerateLabel();
    };
    box.appendChild(addBtn);
    studioBasket.forEach((it, i) => {
      const chip = document.createElement('span');
      chip.style.cssText = 'display:inline-flex; align-items:center; gap:6px; border:1px solid #d4af37; color:#d4af37; border-radius:999px; padding:4px 10px; font-size:12px;';
      chip.textContent = it.vt;
      const x = document.createElement('button');
      x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', '✕');
      x.style.cssText = 'background:none; border:none; color:inherit; cursor:pointer; padding:0; font-size:12px;';
      x.onclick = () => { studioBasket.splice(i, 1); renderStudioBasket(); refreshGenerateLabel(); };
      chip.appendChild(x);
      box.appendChild(chip);
    });
    if(studioBasket.length){
      const n = studioCombos().length;
      const note = document.createElement('div');
      note.style.cssText = 'width:100%; font-size:11px; color:var(--muted,#999);';
      note.textContent = n > 1
        ? bT('سيُولَّد ' + n + ' صور — صورة لكلّ خيار. كلّ تعديل يُحسب من رصيدك اليومي.', n + ' images will be generated — one per option. Each edit counts toward your daily limit.')
        : bT('صورة واحدة فيها كلّ اختياراتك. كلّ تعديل يُحسب من رصيدك اليومي.', 'One image with all your picks. Each edit counts toward your daily limit.');
      box.appendChild(note);
    }
  }
  function refreshGenerateLabel(){
    if(!btnGenerate || studioMissing()) return;
    const n = studioBasket.length;
    btnGenerate.textContent = n ? bT('✨ ولّد بالاختيارات (' + n + ')', '✨ Generate with picks (' + n + ')') : t('studioAiGenerateBtn');
  }
  async function studioChainOne(combo, token, onStep){
    let b64 = selectedBase64A, mime = selectedMimeA, last = null;
    for(let i = 0; i < combo.length; i++){
      const it = combo[i];
      onStep(i, it);
      const payload = { feature: it.f, style: it.v, token, imageBase64: b64, mimeType: mime, multiAngle: false, variant: nextVariant(it.f, it.v) };
      if(i === 0 && descriptionEl.value.trim()) payload.description = descriptionEl.value.trim();
      if(i > 0){ payload.originalBase64 = selectedBase64A; payload.originalMime = selectedMimeA; }
      const res = await fetch('/api/studio-create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      let data = {};
      try{ data = await res.json(); }catch(e){ data = { error: 'HTTP ' + res.status }; } /* guard-ok — جسم غير JSON (413/504) */
      if(!res.ok || data.error) return { combo, error: data.error || 'unknown', last, stoppedAt: it };
      last = { b64: data.imageBase64, mime: data.mimeType || 'image/png' };
      if(i < combo.length - 1){
        const blob = await (await fetch('data:' + last.mime + ';base64,' + last.b64)).blob();
        const n = await normalizeStudioPhoto(new File([blob], 'step.png', { type: last.mime }));
        if(!n || !n.b64) return { combo, error: 'image_generation_failed', last, stoppedAt: it };
        b64 = n.b64; mime = n.mime;
      }
    }
    return { combo, last };
  }
  async function runStudioBasket(token){
    const combos = studioCombos();
    const multi = combos.length > 1;
    let multiEl = document.getElementById('studioMultiResults');
    if(!multiEl){
      multiEl = document.createElement('div'); multiEl.id = 'studioMultiResults';
      resultWrap.parentNode.insertBefore(multiEl, resultWrap.nextSibling);
    }
    multiEl.innerHTML = ''; multiEl.style.display = 'none';
    const steps = combos.reduce((n, c) => n + c.length, 0);
    let doneSteps = 0;
    const onStep = (i, it) => { setStatus(t('studioAiGenerating') + ' — ' + it.vt + ' (' + (++doneSteps) + '/' + steps + ')'); };
    const results = [];
    for(const c of combos) results.push(await studioChainOne(c, token, onStep));
    const ok = results.filter((r) => r.last);
    if(!multi){
      const r = results[0];
      if(r.last){
        const dataUrl = 'data:' + r.last.mime + ';base64,' + r.last.b64;
        resultWrap.style.display = 'block'; resultEl.src = dataUrl; resultEl.style.display = 'block';
        downloadEl.href = dataUrl; downloadEl.style.display = 'block';
        favSaveBtn.style.display = 'block'; favSaveBtn.textContent = t2('studioFavoriteSaveBtn');
        setupBeforeAfter();
      }
      if(r.error){
        if(r.error === 'daily_limit_reached'){ setStatus(t('studioAiLimitReached')); return; }
        const partial = r.last ? bT(' — توقّفت عند «' + r.stoppedAt.vt + '» وهذه النتيجة حتّى ما قبلها.', ' — stopped at “' + r.stoppedAt.vt + '”; showing the result up to the step before.') : '';
        setStatus(studioErrText(new Error(r.error)) + partial);
        return;
      }
      setStatus(t('studioAiDone'));
      return;
    }
    multiEl.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; margin-top:14px;';
    results.forEach((r) => {
      const cell = document.createElement('div');
      cell.style.cssText = 'border:1px solid var(--border,#333); border-radius:10px; padding:6px; text-align:center;';
      const cap = document.createElement('div');
      cap.style.cssText = 'font-size:12px; margin-bottom:5px;';
      cap.textContent = r.combo.map((it) => it.vt).join(' + ');
      cell.appendChild(cap);
      if(r.last){
        const url = 'data:' + r.last.mime + ';base64,' + r.last.b64;
        const im = document.createElement('img'); im.src = url; im.alt = cap.textContent;
        im.style.cssText = 'width:100%; border-radius:8px; display:block;';
        const a = document.createElement('a'); a.href = url; a.download = 'omran-style.png'; a.textContent = bT('⬇️ تحميل', '⬇️ Download');
        a.style.cssText = 'display:inline-block; margin-top:5px; font-size:12px; color:#d4af37;';
        cell.appendChild(im); cell.appendChild(a);
      }
      if(r.error){
        const er = document.createElement('div');
        er.style.cssText = 'font-size:11px; color:#e0a0a0; margin-top:4px;';
        er.textContent = studioErrText(new Error(r.error));
        cell.appendChild(er);
      }
      multiEl.appendChild(cell);
    });
    setStatus(ok.length ? t('studioAiDone') : studioErrText(new Error(results[0].error || 'unknown')));
  }
  /* v-studio-tabs: تبويبات الميزات بطاقات مصوّرة من assets/studio/features/. */
  function photoizeStudioTabs(){
    Array.from(tabsWrap.querySelectorAll('.studioAiTabBtn')).forEach((b) => {
      if(b.querySelector('img')) return;
      const f = b.dataset.feature;
      b.style.cssText += ';position:relative; overflow:hidden; min-width:86px; height:104px; border-radius:12px; display:flex; align-items:flex-end; justify-content:center; padding:0 4px 5px; font-size:11px; font-weight:700;';
      const img = document.createElement('img');
      img.src = 'assets/studio/features/' + f + '.webp';
      img.alt = ''; img.loading = 'lazy';
      img.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0;';
      img.onerror = function(){ if(!img.__alt && IS_MORE(f)){ img.__alt = 1; img.src = PREVIEW_API(f, '__tab'); } else img.remove(); }; /* v-studio-14 */
      const shade = document.createElement('div');
      shade.style.cssText = 'position:absolute; left:0; right:0; bottom:0; height:44%; background:linear-gradient(transparent,rgba(0,0,0,.88)); z-index:1;';
      b.insertBefore(shade, b.firstChild);
      b.insertBefore(img, b.firstChild);
      const txt = Array.from(b.childNodes).find((n) => n.nodeType === 3);
      if(txt){ const sp = document.createElement('span'); sp.textContent = txt.textContent; sp.style.cssText = 'position:relative; z-index:2;'; b.replaceChild(sp, txt); }
    });
  }
  photoizeStudioTabs();
  function setFeature(next){
    feature = next;
    photoizeStudioTabs(); // ترجمة i18n تمسح حقن الصور — أعد حقن ما نقص
    Array.from(tabsWrap.querySelectorAll('.studioAiTabBtn')).forEach((b) => {
      b.classList.toggle('active', b.dataset.feature === next);
      b.classList.toggle('primary', b.dataset.feature === next);
    });
    const slotsRow = $('#studioAiSlots'); if(slotsRow) slotsRow.classList.toggle('two', feature === 'merge'); /* v-studio-slots */
    if(feature === 'merge'){
      imageBWrap.style.display = 'block';
      styleWrap.style.display = 'none';
      if(imageALabelEl) imageALabelEl.textContent = t('studioAiImageALabel');
    } else {
      imageBWrap.style.display = 'none';
      styleWrap.style.display = 'block';
      if(imageALabelEl) imageALabelEl.textContent = t('studioAiImageALabel');
    }
    populateStyleSelect();
    renderStudioStyleCards();
    buildCompareChecks();
    heritageCompareWrap.style.display = (feature === 'heritage') ? 'block' : 'none';
    resultWrap.style.display = 'none';
    resultEl.style.display = 'none';
    downloadEl.style.display = 'none';
    favSaveBtn.style.display = 'none';
    beforeWrap.style.display = 'none';
    setStatus('');
    if(typeof studioUpdateCta === 'function') studioUpdateCta();
  }

  Array.from(tabsWrap.querySelectorAll('.studioAiTabBtn')).forEach((b) => {
    b.onclick = () => setFeature(b.dataset.feature);
  });

  btnOpen.onclick = () => {
    modal.style.display = 'flex';
    closeHeaderMenu();
    setFeature(feature);
  };
  // بطاقة الخيارات جاهزة من الإقلاع — لا تنتظر أول فتح (أي مسار فتح يجدها).
  populateStyleSelect();
  renderStudioStyleCards();
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  if(fileBtnA) fileBtnA.onclick = () => fileInputA.click();
  if(fileBtnB) fileBtnB.onclick = () => fileInputB.click();

  /* v-face-lock: الصورة تُعاد ترميزها في المتصفح (يثبّت اتجاه EXIF ويحدّ الحجم بـ2048)
     حتى تتطابق إحداثيات قناع الوجه في الخادم مع البكسلات الفعلية. */
  function normalizeStudioPhoto(file){
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const raw = { b64: dataUrl.split(',')[1] || '', mime: file.type || 'image/jpeg', dataUrl };
        try{
          const img = new Image();
          img.onload = () => {
            try{
              /* v-face-composite: قصّ مركزي إلى أقرب نسبة يدعمها محرّك القناع (2:3، 3:2، 1:1)
                 وبأبعاد ناتجه نفسها — فالناتج يطابق الأصل بكسلًا ببكسل ويُلصق الوجه بلا انزياح */
              const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
              const ar = iw / ih;
              const target = (ar < 0.82) ? [1024, 1536] : (ar > 1.22 ? [1536, 1024] : [1024, 1024]);
              const tw = target[0], th = target[1], tr = tw / th;
              let sw = iw, sh = ih;
              if (ar > tr) sw = Math.round(ih * tr); else sh = Math.round(iw / tr);
              const sx = Math.round((iw - sw) / 2), sy = Math.round((ih - sh) / 2);
              const c = document.createElement('canvas');
              c.width = tw; c.height = th;
              c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
              const out = c.toDataURL('image/jpeg', 0.92);
              const b64 = out.split(',')[1] || '';
              resolve(b64 ? { b64, mime: 'image/jpeg', dataUrl: out } : raw);
            }catch(e){ resolve(raw); }
          };
          img.onerror = () => resolve(raw);
          img.src = dataUrl;
        }catch(e){ resolve(raw); }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
  /* v-studio-slots (أمر المالك ٣٠ سبتمبر «ترتيب تسهيل للمستخدم في إضافة الصور»): خانتا الصورة مصدر واحد —
     كاميرا / معرض، وسحب وإفلات ولصق، وحذف وتبديل. الصورتان تمرّان بـnormalizeStudioPhoto
     (الثانية كانت تُرفع بحجمها الأصليّ فتتخطّى حدّ الرفع). */
  const slotEls = { A: $('#studioAiSlotA'), B: $('#studioAiSlotB') };
  /* v-studio-no-recent (أمر المالك «احذف آخر صوري عندما أرفع الصور»): «آخر صوري» أُزيلت — لا تُحفظ صورة على الجهاز،
     وما حُفظ سابقًا يُمسح مرّة عند الإقلاع. */
  try{ localStorage.removeItem('omStudioRecent'); }catch(e){ /* guard-ok: تخزين محجوب = لا شيء محفوظ أصلًا */ }
  function studioRenderSlot(which){
    const el = slotEls[which]; if(!el) return;
    const has = which === 'A' ? !!selectedBase64A : !!selectedBase64B;
    el.classList.toggle('has', has);
    const pv = which === 'A' ? previewA : previewB;
    if(!has && pv){ pv.removeAttribute('src'); pv.style.display = 'none'; }
    studioUpdateCta();
  }
  function studioMissing(){ return !selectedBase64A ? 'A' : ((feature === 'merge' && !selectedBase64B) ? 'B' : ''); }
  function studioUpdateCta(){
    if(!btnGenerate) return;
    btnGenerate.textContent = studioMissing() ? t('studioAddPhotoCta') : t('studioAiGenerateBtn');
    refreshGenerateLabel(); /* v-studio-chain: العدد على الزرّ */
  }
  function studioSetPhoto(which, file){
    if(!file || !/^image\//.test(file.type || 'image/')) return;
    normalizeStudioPhoto(file).then((r) => {
      if(!r) return;
      const pv = which === 'A' ? previewA : previewB;
      if(which === 'A'){ selectedMimeA = r.mime; selectedBase64A = r.b64; if(fileNameA) fileNameA.textContent = file.name || ''; }
      else { selectedMimeB = r.mime; selectedBase64B = r.b64; if(fileNameB) fileNameB.textContent = file.name || ''; }
      if(pv){ pv.src = r.dataUrl; pv.style.display = 'block'; }
      studioRenderSlot(which);
      setStatus('');
    });
  }
  function studioClearPhoto(which){
    if(which === 'A'){ selectedBase64A = ''; if(fileInputA) fileInputA.value = ''; if(fileNameA) fileNameA.textContent = ''; beforeWrap.style.display = 'none'; }
    else { selectedBase64B = ''; if(fileInputB) fileInputB.value = ''; if(fileNameB) fileNameB.textContent = ''; }
    studioRenderSlot(which);
  }
  let studioCam = null;
  function studioCamera(which){
    if(!studioCam){
      studioCam = document.createElement('input');
      studioCam.type = 'file'; studioCam.accept = 'image/*'; studioCam.setAttribute('capture', 'user'); studioCam.style.display = 'none';
      document.body.appendChild(studioCam);
    }
    studioCam.onchange = () => { const f = studioCam.files && studioCam.files[0]; studioCam.value = ''; if(f) studioSetPhoto(which, f); };
    studioCam.click();
  }
  function studioCloseMenu(){ const m = document.getElementById('studioSrcMenu'); if(m) m.remove(); const bd = document.getElementById('studioSrcBackdrop'); if(bd) bd.remove(); }
  function studioOpenMenu(which){
    studioCloseMenu();
    const anchor = slotEls[which]; if(!anchor) return;
    const menu = document.createElement('div'); menu.id = 'studioSrcMenu'; menu.className = 'stSrcMenu';
    const add = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = (e) => { e.stopPropagation(); studioCloseMenu(); fn(); }; menu.appendChild(b); };
    let coarse = false; try{ coarse = window.matchMedia('(pointer:coarse)').matches; }catch(e){ coarse = false; }
    if(coarse) add(t('studioSrcCamera'), () => studioCamera(which));
    add(t('studioSrcGallery'), () => (which === 'A' ? fileInputA : fileInputB).click());
    /* v-studio-sheet (لقطة المالك «شوف وين تتحرك عند الإضافة»): القائمة كانت تطفو وسط الشاشة فوق الميزات بعيدًا
       عن الخانة. اللمس: ورقة من أسفل الشاشة بخلفيّة معتمة (نمط الجوّال المعتاد)؛ الحاسوب: تحت الخانة مباشرةً،
       وفوقها إن لم يتّسع ما تحتها. */
    if(coarse){
      menu.classList.add('sheet');
      const bd = document.createElement('div'); bd.id = 'studioSrcBackdrop'; bd.className = 'stSrcBackdrop';
      bd.onclick = (e) => { e.stopPropagation(); studioCloseMenu(); };
      document.body.appendChild(bd);
      document.body.appendChild(menu);
    } else {
      document.body.appendChild(menu);
      const r = anchor.getBoundingClientRect(), mh = menu.offsetHeight, mw = menu.offsetWidth;
      const below = r.bottom + 8, above = r.top - mh - 8;
      menu.style.top = ((below + mh <= window.innerHeight - 10 || above < 10) ? Math.min(below, window.innerHeight - mh - 10) : above) + 'px';
      menu.style.left = Math.max(10, Math.min(r.left + r.width / 2 - mw / 2, window.innerWidth - mw - 10)) + 'px';
    }
    setTimeout(() => document.addEventListener('click', studioCloseMenu, { once: true }), 0);
  }
  ['A', 'B'].forEach((which) => {
    const el = slotEls[which]; if(!el) return;
    el.addEventListener('click', (e) => {
      const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      e.stopPropagation();
      if(act === 'remove'){ studioClearPhoto(which); return; }
      studioOpenMenu(which);
    });
    el.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); studioOpenMenu(which); } });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); el.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if(f) studioSetPhoto(which, f);
    });
  });
  /* اللصق (Ctrl+V) والنافذة مفتوحة: الخانة الفارغة أوّلًا، وإلّا الأولى */
  document.addEventListener('paste', (e) => {
    if(modal.style.display !== 'flex') return;
    const tg = e.target; if(tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT')) return;
    const items = (e.clipboardData && e.clipboardData.items) ? Array.from(e.clipboardData.items) : [];
    const it = items.find((x) => x.kind === 'file' && /^image\//.test(x.type)); if(!it) return;
    const f = it.getAsFile(); if(!f) return;
    e.preventDefault();
    studioSetPhoto(studioMissing() || 'A', f);
  });
  fileInputA.onchange = () => { const f = fileInputA.files && fileInputA.files[0]; if(f) studioSetPhoto('A', f); };
  fileInputB.onchange = () => { const f = fileInputB.files && fileInputB.files[0]; if(f) studioSetPhoto('B', f); };

  btnGenerate.onclick = async () => {
    if(feature === 'merge'){
      if(!selectedBase64A || !selectedBase64B){
        setStatus(t('studioAiNeedTwoImages'));
        studioOpenMenu(studioMissing()); /* v-studio-slots: الزرّ يرشد إلى الخانة الناقصة */
        return;
      }
    } else if(!selectedBase64A){
      setStatus(t('studioAiNeedImage'));
      studioOpenMenu('A');
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){
      setStatus(t('studioAiNeedLogin'));
      return;
    }

    btnGenerate.disabled = true;
    resultWrap.style.display = 'none';
    resultEl.style.display = 'none';
    downloadEl.style.display = 'none';
    favSaveBtn.style.display = 'none';
    beforeWrap.style.display = 'none';
    setStatus(t('studioAiGenerating'));
    { const mr = document.getElementById('studioMultiResults'); if(mr){ mr.innerHTML = ''; mr.style.display = 'none'; } }

    /* v-studio-chain: اختيارات متعدّدة ⇒ سلسلة/صور متعدّدة */
    if(studioBasket.length && feature !== 'merge'){
      try{ await runStudioBasket(token); }
      catch(e){ setStatus(studioErrText(e)); }
      finally{ btnGenerate.disabled = false; }
      return;
    }

    try{
      const payload = {
        feature,
        style: styleEl.value,
        description: descriptionEl.value.trim(),
        token,
        imageBase64: selectedBase64A,
        mimeType: selectedMimeA,
        multiAngle: !!(multiAngleEl && multiAngleEl.checked),
        variant: nextVariant(feature, styleEl.value), /* v-studio-variants */
      };
      if(feature === 'merge'){
        payload.imageBase64B = selectedBase64B;
        payload.mimeTypeB = selectedMimeB;
      }
      const res = await fetch('/api/studio-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if(!res.ok || data.error){
        if(data.error === 'auth_required'){ setStatus(t('studioAiNeedLogin')); return; }
        if(data.error === 'daily_limit_reached'){ setStatus(t('studioAiLimitReached')); return; }
        throw new Error(data.error || 'unknown');
      }
      const dataUrl = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
      resultWrap.style.display = 'block';
      resultEl.src = dataUrl;
      resultEl.style.display = 'block';
      downloadEl.href = dataUrl;
      downloadEl.style.display = 'block';
      favSaveBtn.style.display = 'block';
      favSaveBtn.textContent = t2('studioFavoriteSaveBtn');
      setupBeforeAfter();
      setStatus(t('studioAiDone'));
    } catch(e){
      setStatus(studioErrText(e)); /* v-edit-no-change: كان هذا الموضع يعرض الكود الخامّ (image_edit_identity_mismatch) */
    } finally {
      btnGenerate.disabled = false;
    }
  };

  /* ---- 💡 suggest a style ---- */
  if(suggestBtn) suggestBtn.onclick = async () => {
    if(!selectedBase64A){
      setStatus(t('studioAiNeedImage'));
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){ setStatus(t('studioAiNeedLogin')); return; }

    suggestBtn.disabled = true;
    suggestionsEl.style.display = 'none';
    suggestionsEl.innerHTML = '';
    setStatus(t2('studioSuggestGenerating'));
    try{
      const payload = {
        imageBase64: selectedBase64A, mimeType: selectedMimeA,
        feature, occasion: occasionEl.value,
        profile: loadProfile(), lang: lang7(), token,
      };
      const res = await fetch('/api/studio-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if(!res.ok || data.error){
        if(data.error === 'auth_required'){ setStatus(t('studioAiNeedLogin')); return; }
        throw new Error(data.error || 'unknown');
      }
      const list = data.suggestions || [];
      list.forEach(s => {
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid var(--border,#333); border-radius:10px; padding:10px;';
        card.innerHTML =
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
            '<strong style="font-size:13px;">' + (s.title || '') + '</strong>' +
            '<span style="font-size:11.5px; color:#4ade80;">' + t2('fashionMatchLabel') + ': ' + s.matchPercent + '%</span>' +
          '</div>' +
          '<p style="font-size:12px; color:var(--muted,#999); margin:6px 0 2px;">' + (s.description || '') + '</p>' +
          '<p style="font-size:12px; color:var(--muted,#999); margin:2px 0 8px;">🎨 ' + (s.colors || '') + '</p>';
        suggestionsEl.appendChild(card);
      });
      suggestionsEl.style.display = list.length ? 'flex' : 'none';
      setStatus(list.length ? '' : t('studioAiNeedImage'));
    } catch(e){
      /* v-edit-no-change: رسالة عربيّة مفهومة بدل كود الخطأ الخام (المالك رأى image_edit_identity_mismatch) */
      setStatus(studioErrText(e));
    } finally {
      suggestBtn.disabled = false;
    }
  };

  /* ---- 📊 compare 2-3 styles ---- */
  if(compareBtn) compareBtn.onclick = async () => {
    const checks = Array.from(compareChecksEl.querySelectorAll('.studioCompareCheck:checked')).map(c => c.value);
    if(checks.length < 2){
      compareStatusEl.style.display = 'block';
      compareStatusEl.textContent = t2('fashionCompareNeedTwo');
      return;
    }
    const stylesToRun = checks.slice(0, 3);
    if(!selectedBase64A){
      setStatus(t('studioAiNeedImage'));
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){ setStatus(t('studioAiNeedLogin')); return; }

    compareBtn.disabled = true;
    compareResultsEl.style.display = 'none';
    compareResultsEl.innerHTML = '';
    compareStatusEl.style.display = 'block';
    compareStatusEl.textContent = t2('fashionCompareGenerating');

    try{
      const results = await Promise.all(stylesToRun.map(async (styleVal) => {
        const payload = { feature, style: styleVal, token, imageBase64: selectedBase64A, mimeType: selectedMimeA, multiAngle: false, variant: nextVariant(feature, styleVal) }; /* v-studio-variants */
        try{
          const res = await fetch('/api/studio-create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
          const data = await res.json();
          if(!res.ok || data.error) return { styleVal, error: data.error || 'unknown' };
          return { styleVal, dataUrl: 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64 };
        } catch(e){
          return { styleVal, error: e.message };
        }
      }));
      results.forEach(r => {
        const cell = document.createElement('div');
        cell.style.cssText = 'border:1px solid var(--border,#333); border-radius:8px; padding:6px; text-align:center;';
        if(r.dataUrl){
          const label = (styleEl.querySelector('option[value="' + r.styleVal + '"]') || {}).textContent || r.styleVal;
          cell.innerHTML = '<img src="' + r.dataUrl + '" style="width:100%; border-radius:6px; background:#000;"><p style="font-size:11.5px; color:var(--muted,#999); margin:4px 0 0;">' + label + '</p>';
        } else {
          cell.innerHTML = '<p style="font-size:11.5px; color:#f87171;">❌ ' + (r.error || '') + '</p>';
        }
        compareResultsEl.appendChild(cell);
      });
      compareResultsEl.style.display = 'grid';
      compareStatusEl.style.display = 'none';
    } catch(e){
      compareStatusEl.textContent = studioErrText(e);
    } finally {
      compareBtn.disabled = false;
    }
  };

  /* ---- 🏛️ heritage: compare casual ⟷ formal ---- */
  if(heritageCompareBtn) heritageCompareBtn.onclick = async () => {
    if(!selectedBase64A){
      setStatus(t('studioAiNeedImage'));
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){ setStatus(t('studioAiNeedLogin')); return; }

    heritageCompareBtn.disabled = true;
    heritageCompareResultsEl.style.display = 'none';
    heritageCompareResultsEl.innerHTML = '';
    heritageCompareStatusEl.style.display = 'block';
    heritageCompareStatusEl.textContent = t2('fashionCompareGenerating');

    const variants = [
      { key: 'casual', extra: 'Style it in a relaxed, everyday casual way, simple and comfortable.' },
      { key: 'formal', extra: 'Style it in an elegant, formal ceremonial way, suited for a special formal occasion.' },
    ];

    try{
      const results = await Promise.all(variants.map(async (v) => {
        const baseDesc = descriptionEl.value.trim();
        const payload = {
          feature: 'heritage', style: styleEl.value, token,
          imageBase64: selectedBase64A, mimeType: selectedMimeA, multiAngle: false,
          variant: nextVariant('heritage', styleEl.value), /* v-studio-variants */
          description: (baseDesc ? (baseDesc + '. ') : '') + v.extra,
        };
        try{
          const res = await fetch('/api/studio-create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
          const data = await res.json();
          if(!res.ok || data.error) return { key: v.key, error: data.error || 'unknown' };
          return { key: v.key, dataUrl: 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64 };
        } catch(e){
          return { key: v.key, error: e.message };
        }
      }));
      results.forEach(r => {
        const cell = document.createElement('div');
        cell.style.cssText = 'border:1px solid var(--border,#333); border-radius:8px; padding:6px; text-align:center;';
        const label = r.key === 'casual' ? t2('studioHeritageCasualLabel') : t2('studioHeritageFormalLabel');
        if(r.dataUrl){
          cell.innerHTML = '<img src="' + r.dataUrl + '" style="width:100%; border-radius:6px; background:#000;"><p style="font-size:11.5px; color:var(--muted,#999); margin:4px 0 0;">' + label + '</p>';
        } else {
          cell.innerHTML = '<p style="font-size:11.5px; color:#f87171;">❌ ' + (r.error || '') + '</p>';
        }
        heritageCompareResultsEl.appendChild(cell);
      });
      heritageCompareResultsEl.style.display = 'grid';
      heritageCompareStatusEl.style.display = 'none';
    } catch(e){
      heritageCompareStatusEl.textContent = studioErrText(e);
    } finally {
      heritageCompareBtn.disabled = false;
    }
  };
})();
window.updateVersionLabel = function(){
  var APP_VERSION = 'v461';
  var el = document.getElementById('appVersionLabel');
  if (!el) return;
  var u = '';
  try { u = (typeof authGet === 'function') ? (authGet('aiapp_username') || '') : (localStorage.getItem('aiapp_username') || ''); } catch(e){ __swallow(e, "misc:app-13-stocks-init#6"); }
  if (String(u).trim().toLowerCase() === 'omran') {
    var fmt = function(ts){ if(!ts) return '—'; try{ var d=new Date(ts); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2); }catch(e){ return '—'; } };
    var pull = (typeof window.__chatsLastPull === 'number') ? window.__chatsLastPull : 0;
    var push = (typeof window.__chatsLastPush === 'number') ? window.__chatsLastPush : 0;
    var n = 0; try{ n = (state.projects||[]).length; }catch(e){ __swallow(e, "misc:app-13-stocks-init#7"); }
    var pullErr = window.__chatsLastPullErr ? (' ⚠️' + window.__chatsLastPullErr) : '';
    var pushErr = window.__chatsLastPushErr ? (' ⚠️' + window.__chatsLastPushErr) : '';
    var srvN = (typeof window.__chatsServerCount === 'number') ? window.__chatsServerCount : '?';
    var mrgR = window.__chatsMergeResult || '—';
    var mrgE = window.__chatsMergeErr || '';
    // v-bundle-ver: بصمة البندل من وسم السكربت — تكشف أي نسخة يشغّلها الجهاز فعلًا
    // (تأكيد وصول التحديث بدل التخمين).
    var __bv = '';
    try{ var __s = document.querySelector('script[src*="app.bundle.js"]'); if(__s){ var __mm = (__s.getAttribute('src')||'').match(/[?&]v=([a-z0-9]+)/i); if(__mm) __bv = __mm[1]; } }catch(e){ /* guard-ok */ }
    el.textContent = 'Omran AI Builder — ' + APP_VERSION
      + ' · بندل: ' + (__bv || '؟')
      + ' · سحب: ' + fmt(pull) + pullErr
      + ' · رفع: ' + fmt(push) + pushErr
      + ' · سيرفر: ' + srvN
      + ' · محلي: ' + n
      + ' · دمج: ' + mrgR
      + (mrgE ? (' ⚠️' + mrgE) : '');
    el.style.display = '';
    if (!window.__verLabelTimer) { window.__verLabelTimer = setInterval(function(){ try{ window.updateVersionLabel(); }catch(e){ __swallow(e, "ui:app-13-stocks-init#8"); } }, 5000); }
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
};
