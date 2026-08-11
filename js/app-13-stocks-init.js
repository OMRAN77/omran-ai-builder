/* ---------- 📈 Stocks (Twelve Data, server-side owner key) ---------- */
(function(){
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
  const TICKER_SYMS = (function(){
    try{ const s = JSON.parse(localStorage.getItem('stockTickerSyms')||'null'); if(Array.isArray(s) && s.length) return s.slice(0,5); }catch(e){ __swallow(e, "misc:app-13-stocks-init#1"); }
    return ['AAPL','TSLA','NVDA','MSFT','BTC/USD'];
  })();
  let tickerTimer = null, tickerAnim = null, tickerX = 0;

  function renderTicker(items){
    if(!items || !items.length){ tickerWrap.style.display='none'; return; }
    let html = '';
    items.forEach(function(it){
      const up = (it.change||0) >= 0;
      const col = up ? '#22c55e' : '#ef4444';
      html += '<span data-tsym="'+(it.gold?'__GOLD':it.symbol)+'" style="cursor:pointer; padding:0 18px; font-size:13px; font-weight:500;">' +
        it.symbol + ' <span style="color:'+col+';">' + (up?'▲':'▼') + ' ' + fmt(it.price) + (it.unit?(' '+it.unit):'') + (it.noPct?'':' (' + fmt(it.changePct) + '%)') + '</span></span><span style="color:rgba(255,255,255,0.2);">|</span>';
    });
    tickerTrack.innerHTML = html + html; // duplicate for seamless loop
    tickerWrap.style.display = 'block';
    if(!tickerAnim){
      const step = function(){
        tickerX -= 0.6;
        const half = tickerTrack.scrollWidth / 2;
        if(half > 0 && -tickerX >= half) tickerX = 0;
        tickerTrack.style.transform = 'translateX(' + tickerX + 'px)';
        tickerAnim = requestAnimationFrame(step);
      };
      tickerAnim = requestAnimationFrame(step);
    }
  }

  async function refreshTicker(){
    try{
      const j = await api({ mode:'ticker', symbols: TICKER_SYMS.join(',') });
      try{ const g = await api({ mode:'gold' }); if(g && g.ozUsd && j && j.items){
        const kt = t('goldKt') || 'Gold {k}K', aed = t('aedUnit') || 'AED';
        [['24',g.gram24],['22',g.gram22],['21',g.gram21],['18',g.gram18]].forEach(function(p){ if(p[1]) j.items.push({ symbol: kt.replace('{k}', p[0]), price:p[1], change:g.change, changePct:g.changePct, unit:aed, gold:1, noPct:1 }); });
        const ozA = g.ozAed || (g.ozUsd * 3.6725);
        j.items.push({ symbol: (t('goldOunce')||'Gold Ounce'), price:ozA, change:g.change, changePct:g.changePct, unit:aed, gold:1 });
      } }catch(e){ __swallow(e, "misc:app-13-stocks-init#2"); }
      renderTicker(j.items);
    }catch(e){ /* keep old ticker on error */ }
  }

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
    if(tbtn){ tbtn.style.top = collapsed ? '2px' : '50%'; tbtn.style.transform = collapsed ? 'none' : 'translateY(-50%)'; }
    const icon = document.getElementById('stockTickerToggleIcon');
    if(icon) icon.style.transform = collapsed ? 'rotate(180deg)' : '';
    if(collapsed){
      if(tickerTimer){ clearInterval(tickerTimer); tickerTimer = null; }
      if(tickerAnim){ cancelAnimationFrame(tickerAnim); tickerAnim = null; }
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
    if(tickerAnim){ cancelAnimationFrame(tickerAnim); tickerAnim = null; }
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
        { title:'Indices', symbols:[{s:'DJ:DJI',d:'Dow Jones'},{s:'NASDAQ:IXIC',d:'NASDAQ'},{s:'SP:SPX',d:'S&P 500'},{s:'XETR:DAX',d:'DAX'},{s:'TVC:NI225',d:'Nikkei 225'}] },
        { title:'Commodities', symbols:[{s:'OANDA:XAUUSD',d:'Gold'},{s:'TVC:SILVER',d:'Silver'},{s:'TVC:USOIL',d:'Oil WTI'},{s:'TVC:UKOIL',d:'Brent'}] },
        { title:'Forex', symbols:[{s:'FX:EURUSD'},{s:'FX:GBPUSD'},{s:'FX:USDJPY'},{s:'FX_IDC:USDAED',d:'USD/AED'}] },
        { title:'Crypto', symbols:[{s:'BITSTAMP:BTCUSD',d:'Bitcoin'},{s:'BITSTAMP:ETHUSD',d:'Ethereum'}] }
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
  const stkTabBtns = { global: $('#stocksGlobalBtn'), search: $('#stocksSearchBtn'), learn: learnBtn };
  function stkShowTab(t){
    searchWrap.style.display = t==='search' ? 'block' : 'none';
    learnWrap.style.display = t==='learn' ? 'block' : 'none';
    globalWrap.style.display = t==='global' ? 'block' : 'none';
    Object.keys(stkTabBtns).forEach(function(k){ var b = stkTabBtns[k]; if(b) b.style.background = (k===t) ? 'rgba(107,114,128,0.45)' : ''; });
    if(t==='global') showGlobal();
  }
  window.__stkShowTab = stkShowTab;
  $('#stocksGlobalBtn').addEventListener('click', function(){ stkShowTab('global'); });
  $('#stocksSearchBtn').addEventListener('click', function(){ stkShowTab('search'); });
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
  function t(key){
    const dict = (typeof I18N !== 'undefined') ? I18N[isEn() ? 'en' : 'ar'] : null;
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
    b.textContent = (isEn() ? 'Left today: ' : 'المتبقّي اليوم: ') + d.remaining + ' / ' + (d.dailyLimit || 6);
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

  const showGenerationFailure = () => setStatus(isEn()
    ? '⚠️ Design generation took too long or the service is temporarily busy. Please try again.'
    : '⚠️ تعذّر إكمال التصميم الآن؛ قد تستغرق العملية وقتًا أطول أو تكون الخدمة مشغولة مؤقتًا. حاول مرة أخرى.');

  btnRun.onclick = async () => {
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){
      setStatus(t('designAiNeedLogin'));
      return;
    }
    if(modePlanEl && modePhotoEl && !modePlanEl.checked && !modePhotoEl.checked){
      setStatus(isEn() ? 'Pick at least one output type.' : 'اختر نوع نتيجة واحدًا على الأقل.');
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
      const res = await fetch('/api/construction-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign(currentParams(), {
          budget: budgetEl.value,
          annexes: Array.from(document.querySelectorAll('.constructionAnnex:checked')).map((el) => el.value),
          includeInterior: !!($('#constructionIncludeInterior') && $('#constructionIncludeInterior').checked),
          includePlan: !modePlanEl || modePlanEl.checked,
          includePhoto: !!(modePhotoEl && modePhotoEl.checked),
          token,
        })),
      });
      const data = await res.json();
      if(!res.ok){
        if(data.error === 'auth_required'){
          setStatus(t('designAiNeedLogin'));
        }else if(data.error === 'daily_limit_reached'){
          setStatus(t('designAiLimitReached'));
        }else{
          showGenerationFailure();
        }
        return;
      }
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
      viewsSection.style.display = 'block';
      angleImageWrap.style.display = 'none';
      roomImageWrap.style.display = 'none';
      showQuota(data);
      refImage = data.photoImageBase64 ? await shrinkRef(data.photoImageBase64, data.photoMimeType) : null;
      setStatus((modePhotoEl && modePhotoEl.checked && !data.photoImageBase64) ? (isEn() ? '⚠️ Exterior render failed — plan only.' : '⚠️ تعذّر توليد الصورة الفوتوغرافية — المخطط فقط.') : '');
    }catch(e){
      showGenerationFailure();
    }finally{
      btnRun.disabled = false;
    }
  };

  if(boqBtn) boqBtn.onclick = function(){
    const rows = boqRows();
    if(!rows){ setStatus(isEn() ? '⚠️ This result has no bill of quantities.' : '⚠️ لا يوجد جدول كميات في هذه النتيجة.'); return; }
    const csv = '\ufeff' + rows.map(function(r){ return r.map(csvEsc).join(','); }).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'omran-boq.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ try{ URL.revokeObjectURL(a.href); a.remove(); }catch(e){} }, 1500);
  };

  if(pdfBtn) pdfBtn.onclick = function(){
    if(!lastData){ setStatus(isEn() ? '⚠️ Generate a design first.' : '⚠️ ولّد التصميم أولًا.'); return; }
    const w = window.open('', '_blank');
    if(!w){ setStatus(isEn() ? '⚠️ Allow pop-ups to export the report.' : '⚠️ اسمح بالنوافذ المنبثقة لتصدير التقرير.'); return; }
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
    w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير مشروع البناء</title><style>'
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
          else angleStatusEl.textContent = (isEn() ? '❌ Error: ' : '❌ خطأ: ') + (data.error || 'unknown');
          return;
        }
        angleImageEl.src = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
        angleDownloadLink.href = angleImageEl.src;
        angleImageWrap.style.display = 'block';
        angleStatusEl.style.display = 'none';
        showQuota(data);
      }catch(e){
        angleStatusEl.textContent = (isEn() ? '❌ Error: ' : '❌ خطأ: ') + (e && e.message ? e.message : String(e));
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
        else roomStatusEl.textContent = (isEn() ? '❌ Error: ' : '❌ خطأ: ') + (data.error || 'unknown');
        return;
      }
      roomImageEl.src = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
      roomDownloadLink.href = roomImageEl.src;
      roomImageWrap.style.display = 'block';
      roomStatusEl.style.display = 'none';
      showQuota(data);
    }catch(e){
      roomStatusEl.textContent = (isEn() ? '❌ Error: ' : '❌ خطأ: ') + (e && e.message ? e.message : String(e));
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
  const sliderRange = $('#studioAiSliderRange');
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
    ],
    nails: [
      { value:'red', ar:'🔴 أحمر', en:'🔴 Red', fr:'🔴 Rouge', hi:'🔴 लाल', ur:'🔴 سرخ', bn:'🔴 লাল', ne:'🔴 रातो' },
      { value:'nude', ar:'🟤 نودي', en:'🟤 Nude', fr:'🟤 Nude', hi:'🟤 न्यूड', ur:'🟤 نیوڈ', bn:'🟤 নুড', ne:'🟤 न्युड' },
      { value:'black', ar:'⚫ أسود', en:'⚫ Black', fr:'⚫ Noir', hi:'⚫ काला', ur:'⚫ کالا', bn:'⚫ কালো', ne:'⚫ कालो' },
      { value:'french', ar:'⚪ فرنشي', en:'⚪ French', fr:'⚪ Française', hi:'⚪ फ्रेंच', ur:'⚪ فرانسیسی', bn:'⚪ ফরাসি', ne:'⚪ फ्रेन्च' },
      { value:'pink', ar:'🌸 وردي', en:'🌸 Pink', fr:'🌸 Rose', hi:'🌸 गुलाबी', ur:'🌸 گلابی', bn:'🌸 গোলাপি', ne:'🌸 गुलाबी' },
      { value:'gold', ar:'🟡 ذهبي', en:'🟡 Gold', fr:'🟡 Doré', hi:'🟡 सुनहरा', ur:'🟡 سنہری', bn:'🟡 সোনালি', ne:'🟡 सुनौलो' },
    ],
    makeup: [
      { value:'natural', ar:'🌿 طبيعي خفيف', en:'🌿 Natural', fr:'🌿 Naturel', hi:'🌿 प्राकृतिक', ur:'🌿 قدرتی', bn:'🌿 প্রাকৃতিক', ne:'🌿 प्राकृतिक' },
      { value:'glam', ar:'✨ سهرة فخمة', en:'✨ Glam Evening', fr:'✨ Soirée glamour', hi:'✨ ग्लैम इवनिंग', ur:'✨ گلیم ایوننگ', bn:'✨ গ্ল্যাম ইভনিং', ne:'✨ ग्ल्याम साँझ' },
      { value:'smokey', ar:'⚫ سموكي', en:'⚫ Smokey Eyes', fr:'⚫ Yeux smoky', hi:'⚫ स्मोकी आइज़', ur:'⚫ اسموکی آئیز', bn:'⚫ স্মোকি আইজ', ne:'⚫ स्मोकी आँखा' },
      { value:'redlips', ar:'💋 أحمر شفاه جريء', en:'💋 Bold Red Lips', fr:'💋 Lèvres rouges audacieuses', hi:'💋 बोल्ड रेड लिप्स', ur:'💋 بولڈ ریڈ لپس', bn:'💋 বোল্ড রেড লিপস', ne:'💋 बोल्ड रातो ओठ' },
      { value:'bridal', ar:'👰 عروس', en:'👰 Bridal', fr:'👰 Mariée', hi:'👰 दुल्हन', ur:'👰 دلہن', bn:'👰 কনে', ne:'👰 दुलही' },
    ],
    beard: [
      { value:'full', ar:'🧔 لحية كاملة', en:'🧔 Full Beard', fr:'🧔 Barbe complète', hi:'🧔 पूरी दाढ़ी', ur:'🧔 مکمل داڑھی', bn:'🧔 পূর্ণ দাড়ি', ne:'🧔 पूरा दाह्री' },
      { value:'stubble', ar:'🪒 لحية خفيفة', en:'🪒 Light Stubble', fr:'🪒 Léger chaume', hi:'🪒 हल्की स्टबल', ur:'🪒 ہلکی داڑھی', bn:'🪒 হালকা দাড়ি', ne:'🪒 हल्का दाह्री' },
      { value:'mustache', ar:'👨 شنب فقط', en:'👨 Mustache Only', fr:'👨 Moustache seulement', hi:'👨 सिर्फ मूंछ', ur:'👨 صرف مونچھیں', bn:'👨 শুধু গোঁফ', ne:'👨 जुँगा मात्र' },
      { value:'goatee', ar:'🐐 لحية عنزة', en:'🐐 Goatee', fr:'🐐 Bouc', hi:'🐐 गोटी दाढ़ी', ur:'🐐 بکری داڑھی', bn:'🐐 ছাগল দাড়ি', ne:'🐐 गोटी दाह्री' },
      { value:'clean', ar:'✨ حليق نظيف', en:'✨ Clean Shave', fr:'✨ Rasé de près', hi:'✨ क्लीन शेव', ur:'✨ صاف شیو', bn:'✨ ক্লিন শেভ', ne:'✨ सफा सेभ' },
    ],
    skin: [
      { value:'subtle', ar:'✨ تنعيم خفيف', en:'✨ Subtle Smoothing', fr:'✨ Lissage subtil', hi:'✨ हल्का स्मूदिंग', ur:'✨ ہلکی ہمواری', bn:'✨ হালকা মসৃণতা', ne:'✨ हल्का चिल्लो' },
      { value:'glow', ar:'🌟 توهج طبيعي', en:'🌟 Natural Glow', fr:'🌟 Éclat naturel', hi:'🌟 प्राकृतिक चमक', ur:'🌟 قدرتی چمک', bn:'🌟 প্রাকৃতিক উজ্জ্বলতা', ne:'🌟 प्राकृतिक चमक' },
      { value:'circles', ar:'👁️ تقليل الهالات', en:'👁️ Reduce Dark Circles', fr:'👁️ Réduire les cernes', hi:'👁️ डार्क सर्कल कम करें', ur:'👁️ ڈارک سرکلز کم کریں', bn:'👁️ ডার্ক সার্কেল কমান', ne:'👁️ अँध्यारो घेरा घटाउनुहोस्' },
    ],
    glasses: [
      { value:'sunglasses', ar:'🕶️ شمسية كلاسيكية', en:'🕶️ Classic Sunglasses', fr:'🕶️ Lunettes de soleil classiques', hi:'🕶️ क्लासिक सनग्लासेज़', ur:'🕶️ کلاسک دھوپ کے چشمے', bn:'🕶️ ক্লাসিক সানগ্লাস', ne:'🕶️ क्लासिक घाम चश्मा' },
      { value:'round', ar:'⭕ دائرية', en:'⭕ Round', fr:'⭕ Rondes', hi:'⭕ गोल', ur:'⭕ گول', bn:'⭕ গোলাকার', ne:'⭕ गोलो' },
      { value:'catseye', ar:'🐱 عين القطة', en:'🐱 Cat-Eye', fr:'🐱 Œil de chat', hi:'🐱 कैट-आई', ur:'🐱 کیٹ آئی', bn:'🐱 ক্যাট-আই', ne:'🐱 क्याट-आई' },
      { value:'aviator', ar:'✈️ طيار', en:'✈️ Aviator', fr:'✈️ Aviateur', hi:'✈️ एविएटर', ur:'✈️ ایویٹر', bn:'✈️ এভিয়েটর', ne:'✈️ एभिएटर' },
      { value:'rimless', ar:'🔲 بدون إطار', en:'🔲 Rimless', fr:'🔲 Sans monture', hi:'🔲 रिमलेस', ur:'🔲 بغیر فریم', bn:'🔲 রিমলেস', ne:'🔲 रिमलेस' },
    ],
    tattoo: [
      { value:'sleeve', ar:'💪 كم كامل', en:'💪 Full Sleeve', fr:'💪 Manche complète', hi:'💪 फुल स्लीव', ur:'💪 فل سلیو', bn:'💪 ফুল স্লিভ', ne:'💪 पूरा स्लिभ' },
      { value:'wrist', ar:'✋ صغير بالمعصم', en:'✋ Small Wrist', fr:'✋ Petit poignet', hi:'✋ छोटी कलाई', ur:'✋ چھوٹی کلائی', bn:'✋ ছোট কব্জি', ne:'✋ सानो नाडी' },
      { value:'back', ar:'🔙 على الظهر', en:'🔙 Back Piece', fr:'🔙 Dos', hi:'🔙 पीठ पर', ur:'🔙 پیٹھ پر', bn:'🔙 পিঠে', ne:'🔙 ढाडमा' },
      { value:'tribal', ar:'⚫ قبلي', en:'⚫ Tribal', fr:'⚫ Tribal', hi:'⚫ ट्राइबल', ur:'⚫ قبائلی', bn:'⚫ ট্রাইবাল', ne:'⚫ ट्राइबल' },
      { value:'custom', ar:'📝 حسب الوصف', en:'📝 Custom (from description)', fr:'📝 Personnalisé (selon description)', hi:'📝 कस्टम (विवरण अनुसार)', ur:'📝 حسب تفصیل', bn:'📝 কাস্টম (বর্ণনা অনুযায়ী)', ne:'📝 कस्टम (विवरण अनुसार)' },
    ],
    anime: [
      { value:'classic', ar:'🎌 أنمي ياباني كلاسيكي', en:'🎌 Classic Anime', fr:'🎌 Anime classique', hi:'🎌 क्लासिक एनीमे', ur:'🎌 کلاسک اینیمے', bn:'🎌 ক্লাসিক অ্যানিমে', ne:'🎌 क्लासिक एनिमे' },
      { value:'chibi', ar:'🧸 تشيبي', en:'🧸 Chibi', fr:'🧸 Chibi', hi:'🧸 चिबी', ur:'🧸 چیبی', bn:'🧸 চিবি', ne:'🧸 चिबी' },
      { value:'ghibli', ar:'🌱 ستايل غيبلي', en:'🌱 Ghibli Style', fr:'🌱 Style Ghibli', hi:'🌱 घिबली स्टाइल', ur:'🌱 غبلی اسٹائل', bn:'🌱 ঘিবলি স্টাইল', ne:'🌱 घिब्ली शैली' },
      { value:'cyberpunk', ar:'🌆 سايبربنك أنمي', en:'🌆 Cyberpunk Anime', fr:'🌆 Anime cyberpunk', hi:'🌆 साइबरपंक एनीमे', ur:'🌆 سائبرپنک اینیمے', bn:'🌆 সাইবারপাঙ্ক অ্যানিমে', ne:'🌆 साइबरपंक एनिमे' },
      { value:'manga', ar:'⬛ مانجا أبيض وأسود', en:'⬛ Manga B&W', fr:'⬛ Manga N&B', hi:'⬛ मंगा ब्लैक एंड व्हाइट', ur:'⬛ مانگا بلیک اینڈ وائٹ', bn:'⬛ মাঙ্গা সাদাকালো', ne:'⬛ मंगा कालो-सेतो' },
    ],
    heritage: [
      { value:'kandora', ar:'👳 كندورة وغترة خليجية', en:'👳 Gulf Kandora & Ghutra', fr:'👳 Kandora du Golfe', hi:'👳 खाड़ी कंदुरा', ur:'👳 خلیجی کندورہ', bn:'👳 উপসাগরীয় কান্দুরা', ne:'👳 खाडी कान्दुरा' },
      { value:'bisht', ar:'🧥 بشت فاخر', en:'🧥 Luxury Bisht Cloak', fr:'🧥 Cape Bisht de luxe', hi:'🧥 शानदार बिश्त', ur:'🧥 پرتعیش بشت', bn:'🧥 বিলাসবহুল বিশত', ne:'🧥 विलासी बिश्त' },
      { value:'abaya', ar:'🖤 عباءة تقليدية', en:'🖤 Traditional Abaya', fr:'🖤 Abaya traditionnelle', hi:'🖤 पारंपरिक अबाया', ur:'🖤 روایتی عبایہ', bn:'🖤 ঐতিহ্যবাহী আবায়া', ne:'🖤 परम्परागत अबाया' },
      { value:'embroidered', ar:'🧵 ثوب نشل مطرز', en:'🧵 Embroidered Thobe Nashal', fr:'🧵 Robe brodée', hi:'🧵 कढ़ाई वाला थोब', ur:'🧵 کڑھائی والا لباس', bn:'🧵 সূচিকর্ম করা পোশাক', ne:'🧵 कसीदाकारी पोशाक' },
      { value:'saudi', ar:'🇸🇦 ثوب سعودي وشماغ', en:'🇸🇦 Saudi Thobe & Shemagh', fr:'🇸🇦 Thobe saoudien', hi:'🇸🇦 सऊदी थोब', ur:'🇸🇦 سعودی لباس', bn:'🇸🇦 সৌদি পোশাক', ne:'🇸🇦 साउदी पोशाक' },
      { value:'emirati', ar:'🇦🇪 كافتان إماراتي مطرز', en:'🇦🇪 Emirati Embroidered Kaftan', fr:'🇦🇪 Caftan émirati', hi:'🇦🇪 इमिराती काफ्तान', ur:'🇦🇪 اماراتی قفطان', bn:'🇦🇪 আমিরাতি কাফতান', ne:'🇦🇪 इमिराती काफ्तान' },
    ],
    merge: [],
  };

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
    styleEl.innerHTML = opts.map((o) => '<option value="' + o.value + '">' + (o[langKey] || o.en) + '</option>').join('');
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

  /* ---- 🔄 before/after slider ---- */
  function setupBeforeAfter(){
    if(feature === 'merge' || !selectedBase64A){
      beforeWrap.style.display = 'none';
      sliderRange.style.display = 'none';
      return;
    }
    beforeImg.src = 'data:' + selectedMimeA + ';base64,' + selectedBase64A;
    beforeWrap.style.display = 'block';
    sliderRange.style.display = 'block';
    updateSliderClip(sliderRange.value);
  }
  function updateSliderClip(val){
    const pct = Math.max(0, Math.min(100, Number(val)));
    beforeWrap.style.width = pct + '%';
    beforeImg.style.width = resultWrap.clientWidth + 'px';
  }
  if(sliderRange) sliderRange.oninput = () => updateSliderClip(sliderRange.value);

  /* ---- 📊 compare checkboxes (built from style options) ---- */
  function buildCompareChecks(){
    compareChecksEl.innerHTML = '';
    Array.from(styleEl.options).forEach(opt => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--muted,#999); border:1px solid var(--border,#333); border-radius:6px; padding:4px 8px; cursor:pointer;';
      label.innerHTML = '<input type="checkbox" class="studioCompareCheck" value="' + opt.value + '"> ' + opt.textContent;
      compareChecksEl.appendChild(label);
    });
  }

  function setFeature(next){
    feature = next;
    Array.from(tabsWrap.querySelectorAll('.studioAiTabBtn')).forEach((b) => {
      b.classList.toggle('active', b.dataset.feature === next);
      b.classList.toggle('primary', b.dataset.feature === next);
    });
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
    buildCompareChecks();
    heritageCompareWrap.style.display = (feature === 'heritage') ? 'block' : 'none';
    resultWrap.style.display = 'none';
    resultEl.style.display = 'none';
    downloadEl.style.display = 'none';
    favSaveBtn.style.display = 'none';
    beforeWrap.style.display = 'none';
    sliderRange.style.display = 'none';
    setStatus('');
  }

  Array.from(tabsWrap.querySelectorAll('.studioAiTabBtn')).forEach((b) => {
    b.onclick = () => setFeature(b.dataset.feature);
  });

  btnOpen.onclick = () => {
    modal.style.display = 'flex';
    closeHeaderMenu();
    setFeature(feature);
  };
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  if(fileBtnA) fileBtnA.onclick = () => fileInputA.click();
  if(fileBtnB) fileBtnB.onclick = () => fileInputB.click();

  fileInputA.onchange = () => {
    const file = fileInputA.files && fileInputA.files[0];
    if(!file) return;
    selectedMimeA = file.type || 'image/jpeg';
    if(fileNameA) fileNameA.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      selectedBase64A = dataUrl.split(',')[1] || '';
      previewA.src = dataUrl;
      previewA.style.display = 'block';
    };
    reader.readAsDataURL(file);
  };

  fileInputB.onchange = () => {
    const file = fileInputB.files && fileInputB.files[0];
    if(!file) return;
    selectedMimeB = file.type || 'image/jpeg';
    if(fileNameB) fileNameB.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      selectedBase64B = dataUrl.split(',')[1] || '';
      previewB.src = dataUrl;
      previewB.style.display = 'block';
    };
    reader.readAsDataURL(file);
  };

  btnGenerate.onclick = async () => {
    if(feature === 'merge'){
      if(!selectedBase64A || !selectedBase64B){
        setStatus(t('studioAiNeedTwoImages'));
        return;
      }
    } else if(!selectedBase64A){
      setStatus(t('studioAiNeedImage'));
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
    sliderRange.style.display = 'none';
    setStatus(t('studioAiGenerating'));

    try{
      const payload = {
        feature,
        style: styleEl.value,
        description: descriptionEl.value.trim(),
        token,
        imageBase64: selectedBase64A,
        mimeType: selectedMimeA,
        multiAngle: !!(multiAngleEl && multiAngleEl.checked),
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
      setStatus((lang === 'ar' ? '❌ خطأ: ' : '❌ Error: ') + (e && e.message ? e.message : String(e)));
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
      setStatus((isEn() ? '❌ Error: ' : '❌ خطأ: ') + (e && e.message ? e.message : String(e)));
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
        const payload = { feature, style: styleVal, token, imageBase64: selectedBase64A, mimeType: selectedMimeA, multiAngle: false };
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
      compareStatusEl.textContent = (isEn() ? '❌ Error: ' : '❌ خطأ: ') + (e && e.message ? e.message : String(e));
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
      heritageCompareStatusEl.textContent = (isEn() ? '❌ Error: ' : '❌ خطأ: ') + (e && e.message ? e.message : String(e));
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
    el.textContent = 'Omran AI Builder — ' + APP_VERSION
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
