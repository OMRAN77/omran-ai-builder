// v530: مساعد ضغط الصور — يُقلّص الصورة إلى حدّ MAX px ويُصدّرها JPEG 0.85
// يمنع خطأ «Request Entity Too Large» (413) في كل مودالات الاستوديو.
function __compressImg(file, onDone, MAX){
  MAX = MAX || 1024;
  const reader = new FileReader();
  reader.onload = function(){
    const img = new Image();
    img.onload = function(){
      let w = img.width, h = img.height;
      if(Math.max(w,h) > MAX){ const k = MAX/Math.max(w,h); w=Math.round(w*k); h=Math.round(h*k); }
      const c = document.createElement('canvas');
      c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      onDone(c.toDataURL('image/jpeg',0.85));
    };
    img.src = String(reader.result||'');
  };
  reader.readAsDataURL(file);
}
// v530: آمن res.json() — يُرجع كائن خطأ بدل رمي استثناء JSON حين يردّ السيرفر نصًّا (مثل 413)
async function __safeJson(res){
  const txt = await res.text().catch(()=>'');
  try{ return JSON.parse(txt); }
  catch(e){ return { error: txt.slice(0,200) || ('HTTP '+res.status) }; }
}

/* ---------- 🏠 AI Interior Design (Gemini image, server-side owner key) ---------- */
(function(){
  const modal = $('#designAiModal');
  const btnOpen = $('#btnDesignAI');
  const btnClose = $('#designAiCloseBtn');
  const btnGenerate = $('#designAiGenerateBtn');
  const btnSuggest = $('#designAiSuggestBtn');
  const suggestBox = $('#designAiSuggestBox');
  const suggestList = $('#designAiSuggestList');
  const fileInput = $('#designAiFileInput');
  const fileBtn = $('#designAiFileBtn');
  const fileNameEl = $('#designAiFileName');
  const sourcePreview = $('#designAiSourcePreview');
  const placeEl = $('#designAiPlace');
  const gridEl = $('#designAiGrid');
  function syncPlace(){
    const on = !!(placeEl && placeEl.value);
    const dz = modal.querySelector('.dzArea');
    if(dz) dz.style.display = on ? 'none' : '';
    if(on && sourcePreview) sourcePreview.style.display = 'none';
  }
  if(placeEl) placeEl.addEventListener('change', syncPlace);
  if(btnOpen) btnOpen.addEventListener('click', () => setTimeout(syncPlace, 0));
  const styleEl = $('#designAiStyle');
  const lightingEl = $('#designAiLighting');
  const furnitureEl = $('#designAiFurniture');
  const flooringEl = $('#designAiFlooring');
  const fabricEl = $('#designAiFabric');
  const wallColorEl = $('#designAiWallColor');
  const curtainsEl = $('#designAiCurtains');
  const rearrangeEl = $('#designAiRearrange');
  const decorPlantsEl = $('#designAiDecorPlants');
  const decorArtEl = $('#designAiDecorArt');
  const decorAccessoriesEl = $('#designAiDecorAccessories');
  const statusEl = $('#designAiStatus');
  const resultEl = $('#designAiResult');
  const resultWrap = $('#designAiResultWrap'); /* v-decor-fix: كان غير معرّف فيرمي ReferenceError عند كل ضغطة «صمم الغرفة» */
  const downloadEl = $('#designAiDownloadLink');
  if(!modal || !btnOpen) return;

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

  let selectedFile = null;
  let selectedBase64 = '';
  let selectedMime = 'image/jpeg';

  btnOpen.onclick = () => {
    modal.style.display = 'flex';
    /* v651: صفّ «غرفتي بكل الأنماط» يُبنى قبل وصول ملفّ اللغة الكسول فيتجمّد — يُعاد عند الفتح. */
    try { buildCompareStyleRow(); } catch(_e651) { /* guard-ok: rebuilding the compare row is cosmetic — a failure must never block opening the modal. */ }
    closeHeaderMenu();
  };
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  if(fileBtn) fileBtn.onclick = () => fileInput.click();

  fileInput.onchange = () => {
    const file = fileInput.files && fileInput.files[0];
    if(!file) return;
    selectedFile = file;
    selectedMime = 'image/jpeg';
    if(fileNameEl) fileNameEl.textContent = file.name;
    __compressImg(file, function(dataUrl){
      selectedBase64 = dataUrl.split(',')[1] || '';
      sourcePreview.src = dataUrl;
      sourcePreview.style.display = 'block';
    });
  };

  let extraImagesB64 = [];
  const multiWrap = $('#portraitMultiWrap');
  const multiFileInput = $('#portraitMultiFileInput');
  const multiFileBtn = $('#portraitMultiFileBtn');
  const multiPreviewWrap = $('#portraitMultiPreviewWrap');
  const multiLabel = $('#portraitMultiLabel');
  if(multiFileBtn) multiFileBtn.onclick = () => multiFileInput.click();
  if(multiFileInput){
    multiFileInput.onchange = () => {
      const maxCount = (styleEl.value === 'merge2') ? 1 : 3;
      const files = Array.from(multiFileInput.files || []).slice(0, maxCount);
      extraImagesB64 = [];
      if(multiPreviewWrap) multiPreviewWrap.innerHTML = '';
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          extraImagesB64.push({ base64: dataUrl.split(',')[1] || '', mime: file.type || 'image/jpeg' });
          if(multiPreviewWrap){
            const img = document.createElement('img');
            img.src = dataUrl;
            img.style.cssText = 'width:56px; height:56px; object-fit:cover; border-radius:8px;';
            multiPreviewWrap.appendChild(img);
          }
        };
        reader.readAsDataURL(file);
      });
    };
  }

  let variantSrc = null;
  /* v-decor-ideas: أفكار بلا صورة — رقائق لأنواع الأماكن + سطر حرّ «اكتب ما تريد» */
  const ideaChips = document.getElementById('designAiIdeaChips');
  const ideaText = document.getElementById('designAiIdeaText');
  const ideaGo = document.getElementById('designAiIdeaGo');
  const ideaTitle = document.getElementById('designAiIdeasTitle');
  function buildIdeaChips(){
    if(!ideaChips || !placeEl) return;
    ideaChips.innerHTML = '';
    Array.prototype.forEach.call(placeEl.options, function(o){
      if(!o.value) return;
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'btn'; c.dataset.place = o.value;
      c.style.cssText = 'width:auto; padding:6px 11px; font-size:12.5px; border-radius:999px;';
      c.textContent = (window.__optT ? window.__optT(o) : o.textContent).trim();
      c.onclick = function(){ placeEl.value = o.value; if(ideaText) ideaText.value = ''; btnGenerate.onclick(); };
      ideaChips.appendChild(c);
    });
    if(ideaTitle) ideaTitle.textContent = '💡 ' + bT('أفكار بلا صورة — اختر نوع المكان أو اكتب ما تريد', 'Ideas without a photo — pick a place or describe what you want');
    if(ideaText) ideaText.placeholder = bT('مثال: مجلس عربي فخم لعشرين شخصًا', 'e.g. a luxurious Arabic majlis for twenty guests');
    if(ideaGo) ideaGo.textContent = '✨ ' + bT('أعطني أفكارًا', 'Give me ideas');
  }
  buildIdeaChips();
  /* v-decor-gallery: معرض صور حقيقية (عشرات) من الويب — يفتح فورًا، والتوليد بالذكاء زرّ منفصل */
  const ideaStatusEl = document.getElementById('designAiIdeaStatus');
  const ideaGallery = document.getElementById('designAiIdeaGallery');
  const ideaAI = document.getElementById('designAiIdeaAI');
  function ideaStatus(txt){ if(!ideaStatusEl) return; ideaStatusEl.textContent = txt || ''; ideaStatusEl.style.display = txt ? 'block' : 'none'; }
  let ideaReq = 0;
  async function loadIdeas(opts){
    const my = ++ideaReq;
    if(ideaGallery){ ideaGallery.style.display = 'none'; ideaGallery.innerHTML = ''; }
    if(ideaAI) ideaAI.style.display = 'none';
    ideaStatus('⏳ ' + bT('أجمع لك صورًا وتصاميم…', 'Collecting photos and designs…'));
    try{
      const r = await fetch('/api/design-ideas', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ place: opts.place || '', q: opts.q || '', style: styleEl ? styleEl.value : '' }) });
      const d = await __safeJson(r);
      if(my !== ideaReq) return;
      const imgs = Array.isArray(d.images) ? d.images : [];
      if(!imgs.length){
        /* v-ideas-resilient: مصدر الصور متوقف (حصّة) ≠ لا نتائج — نقول الحقيقة */
        if(d && d.error === 'provider') ideaStatus('⚠️ ' + bT('مصدر الصور متوقف مؤقتًا — جرّب بعد قليل، أو ولّد تصاميم بالذكاء.', 'The photo source is temporarily unavailable — try again shortly, or generate AI designs.'));
        else ideaStatus('😕 ' + bT('ما حصلت صورًا لهذا الطلب — جرّب وصفًا آخر، أو ولّد تصاميم بالذكاء.', 'No photos found for this — try another description, or generate AI designs.'));
        if(ideaAI) ideaAI.style.display = ''; return;
      }
      imgs.forEach(function(u){
        const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener';
        a.onclick = function(e){ if(window.omranLightbox){ e.preventDefault(); window.omranLightbox(u); } }; /* v-cx-ideas: معرض داخل التطبيق */
        a.style.cssText = 'display:block; break-inside:avoid; margin-bottom:6px; border-radius:12px; overflow:hidden; background:rgba(255,255,255,.04);';
        const im = document.createElement('img'); im.src = u; im.loading = 'lazy'; im.alt = '';
        im.style.cssText = 'display:block; width:100%; height:auto;';
        im.onerror = function(){ a.remove(); };
        a.appendChild(im); ideaGallery.appendChild(a);
      });
      ideaGallery.style.display = 'block';
      ideaStatus('🖼️ ' + imgs.length + ' ' + bT('صورة وتصميم من الويب — اضغط أي صورة لعرضها كبيرة', 'photos and designs from the web — tap any to open it'));
      if(ideaAI) ideaAI.style.display = '';
      try{ ideaGallery.scrollIntoView({ behavior:'smooth', block:'start' }); }catch(e){ /* guard-ok */ }
    }catch(e){ if(my === ideaReq) ideaStatus('⚠️ ' + bT('تعذّر جلب الصور الآن.', 'Could not fetch photos right now.')); }
  }
  if(ideaChips) Array.prototype.forEach.call(ideaChips.querySelectorAll('button'), function(c){
    c.onclick = function(){ if(placeEl) placeEl.value = c.dataset.place; if(ideaText) ideaText.value = ''; loadIdeas({ place: c.dataset.place }); };
  });
  if(ideaGo) ideaGo.onclick = function(){
    const v = ideaText ? ideaText.value.trim() : '';
    if(!v){ ideaStatus(bT('اكتب ما تريد أو اختر نوع المكان.', 'Describe what you want or pick a place.')); return; }
    if(placeEl) placeEl.value = '';
    loadIdeas({ q: v });
  };
  if(ideaAI) ideaAI.onclick = async function(){
    ideaAI.disabled = true;
    ideaStatus('⏳ ' + bT('يولّد ٤ تصاميم بالذكاء… نحو دقيقة', 'Generating 4 AI designs… about a minute'));
    try{ await btnGenerate.onclick(); }finally{ ideaAI.disabled = false; }
    ideaStatus('');
    try{
      const target = (gridEl && gridEl.style.display !== 'none') ? gridEl : ((resultEl && resultEl.style.display !== 'none') ? resultEl : statusEl);
      if(target) target.scrollIntoView({ behavior:'smooth', block:'start' });
    }catch(e){ /* guard-ok */ }
  };
  if(ideaAI) ideaAI.textContent = '🎨 ' + bT('ولّد ٤ تصاميم بالذكاء الاصطناعي', 'Generate 4 AI designs');
  if(ideaText) ideaText.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); if(ideaGo) ideaGo.onclick(); } });

  btnGenerate.onclick = async () => {
    const idea = ideaText ? ideaText.value.trim() : '';
    const placeVal = (placeEl ? placeEl.value : '') || (idea && !selectedBase64 ? 'custom' : '');
    const notesEl = document.getElementById('designAiNotes');
    if(!selectedBase64 && !placeVal){
      setStatus(t('designAiNeedPick'));
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){
      setStatus(t('designAiNeedLogin'));
      return;
    }

    btnGenerate.disabled = true;
    /* v-fashion-show: الحاوية fashionAiResultWrap كانت تبقى display:none —
       الصورة تتولد وتختفي داخلها («الصور ما تطلع»). تُدار مع الصورة معًا. */
    if(resultWrap) resultWrap.style.display = 'none';
    resultEl.style.display = 'none';
    downloadEl.style.display = 'none';
    baHide();
    if(gridEl){ gridEl.style.display = 'none'; gridEl.innerHTML = ''; }
    setStatus(t('designAiGenerating'));

    try{
      const res = await fetch('/api/design-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: placeVal ? '' : selectedBase64,
          mimeType: selectedMime,
          place: placeVal,
          count: selectedBase64 ? 1 : 4,
          notes: ((placeVal && idea ? idea + '. ' : '') + (notesEl ? String(notesEl.value || '') : '')).slice(0, 400),
          variantOf: variantSrc || '',
          style: styleEl.value,
          lighting: lightingEl ? lightingEl.value : '',
          furniture: furnitureEl ? furnitureEl.value : '',
          flooring: flooringEl ? flooringEl.value : '',
          fabric: fabricEl ? fabricEl.value : '',
          wallColor: wallColorEl ? wallColorEl.value : '',
          curtains: curtainsEl ? curtainsEl.value : '',
          rearrange: !!(rearrangeEl && rearrangeEl.checked),
          decor: [
            decorPlantsEl && decorPlantsEl.checked ? 'plants' : null,
            decorArtEl && decorArtEl.checked ? 'art' : null,
            decorAccessoriesEl && decorAccessoriesEl.checked ? 'accessories' : null,
          ].filter(Boolean),
          token,
        }),
      });
      variantSrc = null;
      variantSrc = null;
      const data = await __safeJson(res);
      if(!res.ok || data.error){
        if(data.error === 'auth_required'){ setStatus(t('designAiNeedLogin')); return; }
        if(data.error === 'daily_limit_reached'){ setStatus(t('designAiLimitReached')); return; }
        throw new Error(data.error || 'unknown');
      }
      if(Array.isArray(data.images) && data.images.length && gridEl){
        gridEl.innerHTML = '';
        gridEl.style.display = 'grid';
        data.images.forEach((im, i) => {
          const u = 'data:' + (im.mimeType || 'image/webp') + ';base64,' + im.imageBase64;
          const a = document.createElement('a');
          a.href = u;
          a.download = 'omran-design-' + (i + 1) + '.webp';
          a.style.cssText = 'display:block; border-radius:var(--r-2); overflow:hidden; background:#000;';
          const g = document.createElement('img');
          g.src = u;
          g.style.cssText = 'width:100%; display:block;';
          a.appendChild(g);
          const cell = document.createElement('div');
          cell.appendChild(a);
          const vb = document.createElement('button');
          vb.type = 'button';
          vb.className = 'btn';
          vb.textContent = bT('\u2728 \u0632\u0648\u0651\u062F\u0646\u064A \u0645\u062B\u0644\u0647','\u2728 More like this');
          vb.style.cssText = 'width:100%; margin-top:5px; font-size:11.5px; padding:5px 4px;';
          vb.onclick = (ev) => { ev.preventDefault(); variantSrc = im.imageBase64; btnGenerate.onclick(); };
          cell.appendChild(vb);
          gridEl.appendChild(cell);
        });
        setStatus(t('designAiDone'));
        return;
      }
      const dataUrl = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
      // v-decor-ba: مع صورة مرفوعة السحّاب يعرض قبل/بعد؛ وبدونها صورة عادية.
      if(selectedBase64 && !placeVal && showBeforeAfter('data:' + selectedMime + ';base64,' + selectedBase64, dataUrl)){
        resultEl.style.display = 'none';
      } else {
        resultEl.src = dataUrl;
        resultEl.style.display = 'block';
      }
      downloadEl.href = dataUrl;
      downloadEl.style.display = 'block';
      setStatus(t('designAiDone'));
    } catch(e){
      setStatus((bT('❌ خطأ: ','❌ Error: ')) + (e && e.message ? e.message : String(e)));
    } finally {
      btnGenerate.disabled = false;
    }
  };

  if(btnSuggest) btnSuggest.onclick = async () => {
    if(!selectedBase64){
      setStatus(t('designAiNeedImage'));
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){
      setStatus(t('designAiNeedLogin'));
      return;
    }
    btnSuggest.disabled = true;
    suggestBox.style.display = 'none';
    setStatus(t('designAiSuggesting'));
    try{
      const res = await fetch('/api/design-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: selectedBase64, mimeType: selectedMime, lang: isEn() ? 'en' : (localStorage.getItem('aiapp_lang') || 'ar'), token }),
      });
      const data = await __safeJson(res);
      if(!res.ok || data.error){
        if(data.error === 'auth_required'){ setStatus(t('designAiNeedLogin')); return; }
        throw new Error(data.error || 'unknown');
      }
      const ideas = Array.isArray(data.suggestions) ? data.suggestions : [];
      suggestList.innerHTML = ideas.map((idea) => '<div style="margin-bottom:6px;">💡 ' + String(idea).replace(/</g,'&lt;') + '</div>').join('');
      suggestBox.style.display = ideas.length ? 'block' : 'none';
      setStatus(ideas.length ? '' : t('designAiSuggestError'));
    } catch(e){
      setStatus(t('designAiSuggestError'));
    } finally {
      btnSuggest.disabled = false;
    }
  };

  /* ---- v-decor-ba: سحّاب قبل/بعد — الأصل يتحوّل للتصميم بسحبة إصبع ---- */
  const baWrap = $('#designBAWrap');
  const baAfter = $('#designBAAfter');
  const baBeforeClip = $('#designBABeforeClip');
  const baBefore = $('#designBABefore');
  const baLine = $('#designBALine');
  const baRange = $('#designBARange');
  function baHide(){ if(baWrap) baWrap.style.display = 'none'; if(baRange) baRange.style.display = 'none'; }
  function baSize(){ if(baWrap && baBefore) baBefore.style.width = baWrap.getBoundingClientRect().width + 'px'; }
  function baSet(p){
    if(baBeforeClip) baBeforeClip.style.width = p + '%';
    if(baLine) baLine.style.left = p + '%';
    baSize();
  }
  if(baRange) baRange.oninput = function(){ baSet(baRange.value); };
  window.addEventListener('resize', function(){ if(baWrap && baWrap.style.display !== 'none') baSize(); });
  function showBeforeAfter(beforeUrl, afterUrl){
    /* v-no-slider (أمر المالك ٤ سبتمبر «احذف شريط السحب»): لا شريط مقارنة — الناتج وحده */
    if(!baWrap || !baAfter || !baBefore) return false;
    baAfter.src = afterUrl;
    baBefore.src = beforeUrl;
    baAfter.onload = baSize;
    baWrap.style.display = 'block';
    baRange.style.display = 'none';
    baRange.value = 0;
    baSet(0);
    return true;
  }
  window.__designShowBA = showBeforeAfter;
  window.__designBAHide = baHide;
  window.__designSourceUrl = function(){ return selectedBase64 ? ('data:' + selectedMime + ';base64,' + selectedBase64) : ''; };

  /* ---- v-decor-compare: «غرفتي بكل الأنماط» — حتى ٣ أنماط جنبًا إلى جنب ---- */
  const cmpChecksEl = $('#designCompareChecks');
  const cmpBtn = $('#designCompareBtn');
  const cmpStatusEl = $('#designCompareStatus');
  const cmpResultsEl = $('#designCompareResults');
  const cmpPicks = [];
  function cmpStatus(txt){
    if(!cmpStatusEl) return;
    cmpStatusEl.style.display = txt ? 'block' : 'none';
    cmpStatusEl.textContent = txt || '';
  }
  function styleTitle(v){
    const o = styleEl && Array.prototype.find.call(styleEl.options, function(x){ return x.value === v; });
    if(!o) return v;
    const den = isEn() && o.getAttribute('data-en');
    if(den) return String(den).trim();
    /* v649: القاموس الحيّ أوّلًا — البطاقة تُبنى قبل وصول ملفّ اللغة الكسول فتلتقط الإنجليزيّة وتتجمّد. */
    const k649 = o.getAttribute('data-i18n');
    if(k649 && typeof t === 'function'){ const v649 = t(k649); if(v649 && v649 !== k649) return String(v649).trim(); }
    /* v651: 39 نمطًا بلا مفتاح i18n كانت تعرض العربيّة في الـ12 لغة — القاموس الثنائيّ __BI يترجمها. */
    const den651 = o.getAttribute('data-en');
    if(!k649 && den651 && typeof window.__bT === 'function') return window.__bT((o.textContent || '').trim(), String(den651).trim());
    return (o.textContent || '').trim();
  }
  function buildCompareStyleRow(){
    if(!cmpChecksEl || !styleEl) return;
    cmpChecksEl.innerHTML = '';
    Array.prototype.forEach.call(styleEl.options, function(o){
      const v = o.value;
      const on = cmpPicks.indexOf(v) >= 0;
      const card = document.createElement('div');
      card.setAttribute('data-dcompare-card', v);
      card.style.cssText = 'position:relative; flex:0 0 96px; aspect-ratio:3/4; border-radius:12px; overflow:hidden; cursor:pointer; scroll-snap-align:start;' +
        ' background:linear-gradient(160deg,#23232a,#101014); display:flex; align-items:center; justify-content:center;' +
        (on ? ' border:2px solid #d4af37; box-shadow:0 0 12px rgba(212,175,55,.35);' : ' border:1px solid var(--border,#333);');
      // v-decor-swatch: لوحة ألوان النمط بدل شارة الإيموجي — شكل رسمي.
      const pal = (typeof window.__decorPal === 'function') ? window.__decorPal('designAiStyle', v) : '';
      if(pal) card.style.background = pal;
      const img = document.createElement('img');
      img.src = 'assets/design/styles/' + v + '.webp';
      img.alt = ''; img.loading = 'lazy';
      img.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; object-fit:cover;';
      img.onerror = function(){ img.remove(); };
      const label = document.createElement('div');
      label.textContent = styleTitle(v);
      /* v649: تسليم التسمية لنظام i18n كي تُترجَم عند تبديل اللغة بلا إعادة بناء الصفّ. */
      const lk649 = o.getAttribute('data-i18n'); if(lk649) label.setAttribute('data-i18n', lk649);
      label.style.cssText = 'position:absolute; left:0; right:0; bottom:0; padding:12px 3px 4px; font-size:10px; font-weight:700; text-align:center; z-index:1;' +
        ' color:' + (on ? '#d4af37' : '#eef0f6') + '; background:linear-gradient(transparent,rgba(0,0,0,.85));';
      if(on){
        const tick = document.createElement('div'); tick.textContent = '✓';
        tick.style.cssText = 'position:absolute; top:5px; inset-inline-start:6px; z-index:2; width:20px; height:20px; border-radius:50%; background:#d4af37; color:#141414; font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center;';
        card.appendChild(tick);
      }
      card.appendChild(img); card.appendChild(label);
      card.onclick = function(){
        const i = cmpPicks.indexOf(v);
        if(i >= 0) cmpPicks.splice(i, 1);
        else { if(cmpPicks.length >= 3){ cmpStatus(bT('الحد ٣ أنماط','Max 3 styles')); return; } cmpPicks.push(v); }
        cmpStatus('');
        buildCompareStyleRow();
      };
      cmpChecksEl.appendChild(card);
    });
  }
  buildCompareStyleRow();
  if(cmpBtn) cmpBtn.onclick = async () => {
    if(!selectedBase64){ cmpStatus(bT('ارفعي صورة غرفتك أولًا','Upload your room photo first')); return; }
    if(cmpPicks.length < 2){ cmpStatus(bT('اختاري نمطين أو ثلاثة','Pick 2-3 styles')); return; }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){ cmpStatus(t('designAiNeedLogin')); return; }
    cmpBtn.disabled = true;
    cmpResultsEl.style.display = 'none';
    cmpResultsEl.innerHTML = '';
    const picks = cmpPicks.slice();
    try{
      for(let i = 0; i < picks.length; i++){
        const v = picks[i];
        cmpStatus((bT('نصمّم ','Designing ')) + styleTitle(v) + ' — ' + (i + 1) + '/' + picks.length + '…');
        const res = await fetch('/api/design-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: selectedBase64, mimeType: selectedMime, style: v, token }),
        });
        const data = await __safeJson(res);
        if(!res.ok || data.error){
          if(data.error === 'daily_limit_reached'){ cmpStatus(t('designAiLimitReached')); break; }
          if(data.error === 'auth_required'){ cmpStatus(t('designAiNeedLogin')); break; }
          cmpStatus((bT('❌ تعثّر عند ','❌ Failed at ')) + styleTitle(v));
          continue;
        }
        const u = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
        const cell = document.createElement('div');
        cell.style.cssText = 'flex:0 0 78%; max-width:340px; scroll-snap-align:start;';
        const im = document.createElement('img');
        im.src = u;
        im.style.cssText = 'width:100%; border-radius:12px; display:block; background:#000;';
        const cap = document.createElement('div');
        cap.textContent = styleTitle(v);
        cap.style.cssText = 'font-size:12px; font-weight:700; text-align:center; margin-top:4px;';
        const pick = document.createElement('button');
        pick.type = 'button'; pick.className = 'btn';
        pick.textContent = bT('👍 اعتمدي هذا','👍 Pick this');
        pick.style.cssText = 'width:100%; margin-top:4px; font-size:11.5px; padding:5px 4px;';
        pick.onclick = function(){
          styleEl.value = v;
          styleEl.dispatchEvent(new Event('change', { bubbles: true }));
          showBeforeAfter('data:' + selectedMime + ';base64,' + selectedBase64, u);
          downloadEl.href = u; downloadEl.style.display = 'block';
          baWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        cell.appendChild(im); cell.appendChild(cap); cell.appendChild(pick);
        cmpResultsEl.appendChild(cell);
        cmpResultsEl.style.display = 'flex';
        if(i === picks.length - 1) cmpStatus(bT('✓ تم — اسحبي وقارني واختاري','✓ Done — swipe and pick'));
      }
    } catch(e){
      cmpStatus((bT('❌ خطأ: ','❌ Error: ')) + (e && e.message ? e.message : String(e)));
    } finally {
      cmpBtn.disabled = false;
    }
  };
})();

/* v-tools-i18n-full: ترجمات أنماط الصور في جميع اللغات */
const STU_XL = {
  'ستايل الأنمي والمانجا': {en:'Anime and Manga Style',fr:'Style Anime et Manga',hi:'एनिमे और मंगा शैली',bn:'অ্যানিমে এবং ম্যাঙ্গা স্টাইল',ne:'एनिमे र म्यांग्गा शैली',id:'Gaya Anime dan Manga',fil:'Anime at Manga Style',tr:'Anime ve Manga Tarzı',zh:'动漫和漫画风格',ru:'Стиль аниме и манги',es:'Estilo Anime y Manga',ml:'അനിമെ കൂടാതെ മംഗ സ്റ്റൈൽ'},
  'كرتون رقمي ناعم': {en:'Soft Digital Cartoon',fr:'Dessin Animé Numérique Doux',hi:'नरम डिजिटल कार्टून',bn:'নরম ডিজিটাল কার্টুন',ne:'नरम डिजिटल कार्टुन',id:'Kartun Digital Lembut',fil:'Malambot na Digital na Kartun',tr:'Yumuşak Dijital Karikatür',zh:'柔和数字卡通',ru:'Мягкий цифровой мультфильм',es:'Caricatura Digital Suave',ml:'മൃദു ഡിജിറ്റൽ കാർട്ടൂൺ'},
  'لوحة زيتية كلاسيكية': {en:'Classical Oil Painting',fr:'Peinture à l\'Huile Classique',hi:'शास्त्रीय तेल चित्रकला',bn:'ক্লাসিক্যাল অয়েল পেইন্টিং',ne:'शास्त्रीय तेल चित्रकला',id:'Lukisan Minyak Klasik',fil:'Klasikong Oil Painting',tr:'Klasik Yağlı Boya',zh:'古典油画',ru:'Классическая масляная живопись',es:'Pintura al Óleo Clásica',ml:'ക്ലാസിക്കൽ ഓയിൽ പെയിന്റിംഗ്'},
  'رسم يدوي بالرصاص': {en:'Pencil Hand Sketch',fr:'Croquis au Crayon',hi:'पेंसिल हाथ स्केच',bn:'পেন্সিল হাতের স্কেচ',ne:'पेंसिल हाथ स्केच',id:'Sketsa Tangan Pensil',fil:'Pencil Hand Sketch',tr:'Kurşun Kalem El Çizimi',zh:'铅笔手绘素描',ru:'Карандашный набросок',es:'Bosquejo de Lápiz Manual',ml:'പെൻസിൽ കൈ സ്കെച്ച്'},
  'بيكسل آرت ريترو': {en:'Retro Pixel Art',fr:'Pixel Art Rétro',hi:'रेट्रो पिक्सेल आर्ट',bn:'রেট্রো পিক্সেল আর্ট',ne:'रेट्रो पिक्सेल आर्ट',id:'Seni Pixel Retro',fil:'Retro Pixel Art',tr:'Retro Piksel Sanatı',zh:'复古像素艺术',ru:'Ретро пиксельная арт',es:'Arte Pixelado Retro',ml:'റെട്രോ പിക്സൽ ആർട്ട്'},
  'كوميكس بخطوط جريئة': {en:'Comics with Bold Lines',fr:'Bandes Dessinées Gras',hi:'साहसी लाइनों वाली कॉमिक्स',bn:'সাহসী লাইন সহ কমিক্স',ne:'साहसी लाइनहरु सहित कमिक्स',id:'Komik dengan Garis Tebal',fil:'Comics na may Bold Lines',tr:'Kalın Çizgili Çizgi Romanlar',zh:'粗线漫画',ru:'Комиксы с жирными линиями',es:'Cómics con Líneas Gruesas',ml:'ധാരസാധ്യ രേഖകളുള്ള കോമിക്സ്'},
  'بوب آرت ملوّن وحيوي': {en:'Colorful Vibrant Pop Art',fr:'Pop Art Coloré et Vibrant',hi:'रंगीन और जीवंत पॉप आर्ट',bn:'রঙিন এবং প্রাণবন্ত পপ আর্ট',ne:'रङ्गीन र जीवन्त पप आर्ट',id:'Pop Art Berwarna Vibran',fil:'Makulay at Vibrant na Pop Art',tr:'Renkli ve Canlı Pop Sanatı',zh:'彩色充满活力的波普艺术',ru:'Яркий и живой поп-арт',es:'Pop Art Colorido y Vibrante',ml:'വർണ്ണിതമായ കൂടാതെ ജീവന്തമായ പോപ്പ് ആർട്ട്'},
  'أسلوب إماراتي تراثي فاخر': {en:'Luxurious Emirati Heritage Style',fr:'Style Patrimonial Émirati Luxueux',hi:'विलासवान एमिराती विरासत शैली',bn:'বিলাসবহুল এমিরাতি ঐতিহ্য শৈলী',ne:'विलासी इमिराती विरासत शैली',id:'Gaya Warisan Emirat Mewah',fil:'Luho Emirati Heritage Style',tr:'Lüks Emiratli Miras Tarzı',zh:'豪华阿联酋遗产风格',ru:'Люксовый стиль Эмиратского наследия',es:'Estilo Patrimonial Emiratí de Lujo',ml:'വിലാസ്യമായ എമിരാതി പാരമ്പര്യ ശൈലി'},
  'كاريكاتير مرح': {en:'Cheerful Caricature',fr:'Caricature Joyeuse',hi:'हंसमुख कारिकेचर',bn:'হাসিখুশি ক্যারিকেচার',ne:'हर्षित क्यारिकेचर',id:'Karikatur Ceria',fil:'Masayang Caricature',tr:'Mutlu Karikatür',zh:'欢快漫画',ru:'Веселая карикатура',es:'Caricatura Alegre',ml:'സന്തോഷകരമായ കാരിക്കേച്ചർ'},
  'إضاءة سينمائية درامية': {en:'Dramatic Cinematic Lighting',fr:'Éclairage Cinématographique Dramatique',hi:'नाटकीय सिनेमाटिक प्रकाश',bn:'নাটকীয় সিনেমাটিক লাইটিং',ne:'नाटकीय सिनेमेटिक प्रकाश',id:'Pencahayaan Sinematik Dramatis',fil:'Dramatikong Cinematic Lighting',tr:'Dramatik Sinematik Aydınlatma',zh:'戏剧性电影照明',ru:'Драматическое кинематографическое освещение',es:'Iluminación Cinematográfica Dramática',ml:'നാടകീയമായ സിനിമാറ്റിക് പ്രകാശം'},
  'شخصيات ثلاثية الأبعاد لطيفة': {en:'Cute 3D Characters',fr:'Personnages 3D Adorables',hi:'प्यारे 3D पात्र',bn:'মসৃণ 3D চরিত্র',ne:'प्यारा 3D क्यारेक्टर',id:'Karakter 3D yang Lucu',fil:'Cute 3D Characters',tr:'Sevimli 3D Karakterler',zh:'可爱的3D角色',ru:'Милые 3D персонажи',es:'Personajes 3D Lindos',ml:'സുന്ദരമായ 3D പാത്രങ്ങൾ'},
  'فيكتور مسطح أنيق': {en:'Elegant Flat Vector',fr:'Vecteur Plat Élégant',hi:'सुरुचिपूर्ण फ्लैट वेक्टर',bn:'মার্জিত সমতল ভেক্টর',ne:'कुलीन फ्लैट भेक्टर',id:'Vektor Datar Elegan',fil:'Elegant Flat Vector',tr:'Zarif Düz Vektör',zh:'优雅的扁平矢量',ru:'Элегантный плоский вектор',es:'Vector Plano Elegante',ml:'മാന്യമായ ഫ്ലാറ്റ് വെക്ടർ'},
  'عالم خيالي بتفاصيل ملحمية': {en:'Epic Fantasy World',fr:'Monde Fantastique Épique',hi:'महाकाव्य कल्पना दुनिया',bn:'মহাকাব্য কল্পনা জগত',ne:'महाकाव्य कल्पना संसार',id:'Dunia Fantasi Epik',fil:'Epic Fantasy World',tr:'Destansı Fantezi Dünyası',zh:'史诗幻想世界',ru:'Эпический мир фантазии',es:'Mundo Fantástico Épico',ml:'ഉജ്ജ്വല കിതാബ് സ്ഥാനം'},
  'طابع وسترن قديم': {en:'Classic Old Western',fr:'Western Classique Ancien',hi:'पुरानी पश्चिमी शैली',bn:'ক্লাসিক পুরানো ওয়েস্টার্ন',ne:'पुरानो पश्चिमी शैली',id:'Western Klasik Tua',fil:'Classic Old Western',tr:'Klasik Eski Western',zh:'经典老西部',ru:'Классический старый вестерн',es:'Western Clásico Antiguo',ml:'ക്ലാസ്സിക് പഴയ വെസ്റ്റേൺ'},
  'أجواء مستقبلية بإضاءة نيون': {en:'Neon Futuristic Vibes',fr:'Ambiance Futuriste Néon',hi:'नीयन भविष्यवादी वातावरण',bn:'নিয়ন ভবিষ্যত পরিবেশ',ne:'नियोन भविष्य वातावरण',id:'Vibes Futuristik Neon',fil:'Neon Futuristic Vibes',tr:'Neon Futuristik Atmosfer',zh:'霓虹未来氛围',ru:'Неоновые футуристические вибрации',es:'Vibraciones Futuristas de Neón',ml:'നിയോൺ ഭാവിഷ്യത് വൈബ്സ്'},
  'فن تجريدي معبّر': {en:'Expressive Abstract Art',fr:'Art Abstrait Expressif',hi:'व्यक्तिपूर्ण अमूर्त कला',bn:'প্রকাশমূলক বিমূর্ত শিল্প',ne:'अभिव्यक्ति अमूर्त कला',id:'Seni Abstrak Ekspresif',fil:'Expressive Abstract Art',tr:'İfadeci Soyut Sanat',zh:'富有表现力的抽象艺术',ru:'Выразительное абстрактное искусство',es:'Arte Abstracto Expresivo',ml:'പ്രകാശിത അമൂർത്ത കലാ'},
  'لوحة مائية بألوان زاهية': {en:'Bright Watercolor Painting',fr:'Peinture Aquarelle Brillante',hi:'चमकीले वाटरकलर पेंटिंग',bn:'উজ্জ্বল জলরঙ রঙ্গ',ne:'उज्ज्वल वाटरकलर पेंटिंग',id:'Lukisan Akuarel Cerah',fil:'Bright Watercolor Painting',tr:'Parlak Suluboya Resmi',zh:'鲜艳水彩画',ru:'Яркая акварельная живопись',es:'Pintura Acuarela Brillante',ml:'തെളിഞ്ഞ വാട്ടർ കളർ പെയിന്റിംഗ്'},
  'منمنمات إسلامية مذهّبة': {en:'Gilded Islamic Miniatures',fr:'Miniatures Islamiques Dorées',hi:'सोने का इस्लामिक लघुचित्र',bn:'সোনালি ইসলামিক মিনিয়েচার',ne:'सुनको इस्लामिक मिनिएचर',id:'Miniatur Islam Berlapis Emas',fil:'Gilded Islamic Miniatures',tr:'Altın Kaplı İslami Minyatürler',zh:'镀金伊斯兰微型画',ru:'Позолоченные исламские миниатюры',es:'Miniaturas Islámicas Doradas',ml:'സ്വർണ്ണപ്പതിത ഇസ്ലാമിക് ചെറുകലാ'},
  'بوستر شخصية لعبة': {en:'Game Character Poster',fr:'Affiche Personnage de Jeu',hi:'गेम चरित्र पोस्टर',bn:'গেম চরিত্র পোস্টার',ne:'गेम क्यारेक्टर पोस्टर',id:'Poster Karakter Game',fil:'Game Character Poster',tr:'Oyun Karakteri Posteri',zh:'游戏角色海报',ru:'Постер персонажа игры',es:'Póster del Personaje del Juego',ml:'ഗെയിം കഥാപാത്ര പോസ്റ്റർ'},
  'كاريكاتير صحفي قديم': {en:'Vintage Newspaper Caricature',fr:'Caricature de Journal Vintage',hi:'विंटेज अखबार कारिकेचर',bn:'ভিন্টেজ সংবাদপত্র ক্যারিকেচার',ne:'भिन्टेज पत्र क्यारिकेचर',id:'Karikatur Koran Vintage',fil:'Vintage Newspaper Caricature',tr:'Vintage Gazete Karikatürü',zh:'复古报纸漫画',ru:'Винтажная газетная карикатура',es:'Caricatura de Periódico Vintage',ml:'വിന്റേജ് സമാചാരപ്പത്ര കാരിക്കേച്ചർ'},
  'أجواء رعب هالوين': {en:'Halloween Horror Vibes',fr:'Ambiance Horreur Halloween',hi:'हैलोवीन恐ब्भ वातावरण',bn:'হ্যালোইন ভয় পরিবেশ',ne:'हेलोइन भय वातावरण',id:'Vibes Horor Halloween',fil:'Halloween Horror Vibes',tr:'Cadılar Bayramı Korku Atmosferi',zh:'万圣节恐怖氛围',ru:'Хэллоуинские ужасные вибрации',es:'Vibraciones de Terror de Halloween',ml:'ഹാലോവീൻ ഭയാനകമായ വൈബ്സ്'},
  'أنمي حركة ياباني': {en:'Japanese Action Anime',fr:'Anime d\'Action Japonais',hi:'जापानी एक्शन एनिमे',bn:'জাপানি অ্যাকশন এনিমে',ne:'जापानी कार्य एनिमे',id:'Anime Aksi Jepang',fil:'Japanese Action Anime',tr:'Japon Aksiyon Animesi',zh:'日本动作动画',ru:'Японское боевое аниме',es:'Anime de Acción Japonés',ml:'ജാപ്പനീസ് നടപടി എനിമെ'},
  'لوحة ملكية كلاسيكية': {en:'Classical Royal Painting',fr:'Peinture Royale Classique',hi:'शास्त्रीय शाही चित्र',bn:'ক্লাসিক্যাল রাজকীয় চিত্র',ne:'शास्त्रीय शाही पेंटिंग',id:'Lukisan Kerajaan Klasik',fil:'Classical Royal Painting',tr:'Klasik Kraliyet Resmi',zh:'古典皇家绘画',ru:'Классическая королевская живопись',es:'Pintura Real Clásica',ml:'ക്ലാസ്സിക്കൽ രാജകീയ പെയിന്റിംഗ്'},
  'زخرفة بالخط العربي': {en:'Arabic Calligraphy Art',fr:'Art de la Calligraphie Arabe',hi:'अरबी सुलेख कला',bn:'আরবি ক্যালিগ্রাফি শিল্প',ne:'अरबी क्यालिग्राफी कला',id:'Seni Kaligrafi Arab',fil:'Arabic Calligraphy Art',tr:'Arap Hat Sanatı',zh:'阿拉伯书法艺术',ru:'Арабское каллиграфическое искусство',es:'Arte de Caligrafía Árabe',ml:'അറബിക് കാലിഗ്രാഫി ആർട്ട്'},
  'إزالة الخلفية بخلفية جاهزة': {en:'Background Removal & Replace',fr:'Suppression et Remplacement du Fond',hi:'पृष्ठभूमि हटाएं और बदलें',bn:'পটভূমি অপসারণ এবং প্রতিস্থাপন',ne:'पृष्ठभूमि हटाएं र बदलें',id:'Penghapusan dan Penggantian Latar',fil:'Background Removal & Replace',tr:'Arka Plan Kaldırma ve Değiştirme',zh:'背景删除和替换',ru:'Удаление и замена фона',es:'Eliminación y Reemplazo de Fondo',ml:'പരിസരം നീക്കം കൂടാതെ പകരം വയ്ക്കുക'},
  'صورة احترافية للعمل والسيرة': {en:'Professional LinkedIn Portrait',fr:'Portrait LinkedIn Professionnel',hi:'पेशेवर LinkedIn पोर्ट्रेट',bn:'পেশাদার LinkedIn পোর্ট্রেট',ne:'पेशेदार LinkedIn पोर्ट्रेट',id:'Potret LinkedIn Profesional',fil:'Professional LinkedIn Portrait',tr:'Profesyonel LinkedIn Portresi',zh:'专业领英肖像',ru:'Профессиональный портрет LinkedIn',es:'Retrato Profesional de LinkedIn',ml:'പ്രൊഫെഷനൽ LinkedIn പോര്ട്രെയ്റ്റ്'},
  'تحسينات خفيفة طبيعية': {en:'Subtle Natural Enhancements',fr:'Améliorations Naturelles Subtiles',hi:'सूक्ष्म प्राकृतिक सुधार',bn:'সূক্ষ্ম প্রাকৃতিক উন্নতি',ne:'सूक्ष्म प्राकृतिक सुधार',id:'Peningkatan Alami Halus',fil:'Subtle Natural Enhancements',tr:'İnce Doğal İyileştirmeler',zh:'微妙自然增强',ru:'Тонкие натуральные улучшения',es:'Mejoras Naturales Sutiles',ml:'സൂക്ഷ്മ പ്രകൃതിക വിഭാഗങ്ങൾ'},
  'إطار احتفالي للعيد': {en:'Festive Holiday Frame',fr:'Cadre de Vacances Festif',hi:'मेहमान छुट्टी फ्रेम',bn:'উৎসবমুখর ছুটির দিনের ফ্রেম',ne:'चहलपहल छुट्टी फ्रेम',id:'Bingkai Liburan Meriah',fil:'Festive Holiday Frame',tr:'Şenlik Tatil Çerçevesi',zh:'节日庆祝框架',ru:'Праздничная праздничная рамка',es:'Marco de Vacaciones Festivo',ml:'ഉത്സവ ശ്രമങ്ങ ഫ്രെയിം'},
  'إطار اليوم الوطني الإماراتي': {en:'UAE National Day Frame',fr:'Cadre Fête Nationale Émirats',hi:'यूएई राष्ट्रीय दिवस फ्रेम',bn:'সংযুক্ত আরব আমিরাত জাতীয় দিবস ফ্রেম',ne:'UAE राष्ट्रीय दिवस फ्रेम',id:'Bingkai Hari Nasional UEA',fil:'UAE National Day Frame',tr:'BAE Ulusal Gün Çerçevesi',zh:'阿联酋国庆框架',ru:'Рамка Национального дня ОАЭ',es:'Marco del Día Nacional de EAU',ml:'യുഎഇ നാഷണൽ ഡേ ഫ്രെയിം'},
  'أجواء رمضانية روحانية': {en:'Spiritual Ramadan Vibes',fr:'Ambiance Ramadan Spirituelle',hi:'आध्यात्मिक रमजान वातावरण',bn:'আধ্যাত্মিক রমজান পরিবেশ',ne:'आध्यात्मिक रमजान वातावरण',id:'Vibes Ramadan Spiritual',fil:'Spiritual Ramadan Vibes',tr:'Manevi Ramazan Atmosferi',zh:'精神斋月氛围',ru:'Духовные вибрации Рамадана',es:'Vibraciones Espirituales de Ramadán',ml:'ആത്മീയമായ റമദാൻ വൈബ്സ്'},
  'شكلك أصغر أو أكبر عمرًا': {en:'Age Shift Younger or Older',fr:'Décalage d\'âge Plus Jeune ou Plus Âgé',hi:'उम्र बदलाव छोटा या बड़ा',bn:'বয়স পরিবর্তন ছোট বা বড়',ne:'उमेर परिवर्तन सानो वा ठुलो',id:'Perubahan Usia Lebih Muda atau Tua',fil:'Age Shift Younger or Older',tr:'Yaş Kayması Daha Genç veya Yaşlı',zh:'年龄转变年轻或年长',ru:'Сдвиг возраста моложе или старше',es:'Cambio de Edad Más Joven u Older',ml:'പ്രായം മാറ്റം പ്രാർത്ഥനയോ വയസ്സാധികയോ'},
  'بوستر بطل رياضي': {en:'Sports Hero Poster',fr:'Affiche Héros du Sport',hi:'खेल हीरो पोस्टर',bn:'ক্রীড়া হিরো পোস্টার',ne:'खेल नायक पोस्टर',id:'Poster Pahlawan Olahraga',fil:'Sports Hero Poster',tr:'Spor Kahramanı Posteri',zh:'运动英雄海报',ru:'Постер спортивного героя',es:'Póster de Héroe Deportivo',ml:'സ്പോർട്സ് നായകൻ പോസ്റ്റർ'},
  'تسريحة ولون شعر جديد': {en:'New Hairstyle and Color',fr:'Nouvelle Coiffure et Couleur',hi:'नई हेयर स्टाइल और रंग',bn:'নতুন চুল স্টাইল এবং রঙ',ne:'नयाँ केश शैली र रंग',id:'Gaya Rambut dan Warna Baru',fil:'New Hairstyle and Color',tr:'Yeni Saç Modası ve Rengi',zh:'新发型和颜色',ru:'Новая прическа и цвет',es:'Nuevo Peinado y Color',ml:'പുതിയ ഹെയർ സ്റ്റൈൽ കൂടാതെ നിറം'},
  'إطلالة زفاف أنيقة': {en:'Elegant Wedding Look',fr:'Apparence Élégante de Mariage',hi:'सुरुचिपूर्ण विवाह देखो',bn:'মার্জিত বিবাহ চেহারা',ne:'मार्जित विवाह रूप',id:'Tampilan Pernikahan Elegan',fil:'Elegant Wedding Look',tr:'Zarif Düğün Görünümü',zh:'优雅的婚礼外观',ru:'Элегантный свадебный вид',es:'Apariencia Elegante de Boda',ml:'മാര്ജിത വിവാഹ ലുക്ക്'},
  'ثوب وقبعة التخرج': {en:'Graduation Gown and Cap',fr:'Robe et Chapeau de Graduation',hi:'स्नातक गाउन और टोपी',bn:'স্নাতক গাউন এবং টুপি',ne:'स्नातक गाउन र टोपी',id:'Gaun dan Topi Kelulusan',fil:'Graduation Gown and Cap',tr:'Mezuniyet Kıyafeti ve Şapkası',zh:'毕业袍和帽子',ru:'Мантия и головной убор выпускника',es:'Túnica y Sombrero de Graduación',ml:'സ്ഥാപനഭരണ വസ്ത്രം കൂടാതെ തൊപ്പി'},
  'بوستر إعلاني باسمك': {en:'Personalized Ad Poster',fr:'Affiche Publicitaire Personnalisée',hi:'व्यक्तिगत विज्ञापन पोस्टर',bn:'ব্যক্তিগত বিজ্ঞাপন পোস্টার',ne:'व्यक्तिगत विज्ञापन पोस्टर',id:'Poster Iklan yang Dipersonalisasi',fil:'Personalized Ad Poster',tr:'Kişiselleştirilmiş Reklam Posteri',zh:'个性化广告海报',ru:'Персонализированный рекламный постер',es:'Póster Publicitario Personalizado',ml:'വ്യക്തിഗതമാക്കിയ വിജ്ഞാപന പോസ്റ്റർ'},
  'صورتك في زمن آخر': {en:'Your Photo in Another Era',fr:'Votre Photo dans une Autre Époque',hi:'दूसरे युग में आपकी तस्वीर',bn:'অন্য যুগে আপনার ছবি',ne:'अन्य युग मा आपको फोटो',id:'Foto Anda di Era Lain',fil:'Your Photo in Another Era',tr:'Fotoğrafınız Başka Bir Çağda',zh:'您在另一个时代的照片',ru:'Ваше фото в другой эпохе',es:'Tu Foto en Otra Era',ml:'അന്ത് കാലത്ത് നിങ്ങളുടെ ഫോട്ടോ'},
  'ستايل موحّد للعائلة': {en:'Unified Family Style',fr:'Style Familial Unifié',hi:'एकीकृत पारिवारिक शैली',bn:'একীভূত পারিবারিক শৈলী',ne:'एकीकृत पारिवारिक शैली',id:'Gaya Keluarga Terpadu',fil:'Unified Family Style',tr:'Birleşik Aile Tarzı',zh:'统一的家庭风格',ru:'Единый семейный стиль',es:'Estilo Familiar Unificado',ml:'ഏകീകൃത കുടുംബ ശൈലി'},
  'دمج صورتين في مشهد': {en:'Merge Two Photos in One Scene',fr:'Fusionner Deux Photos dans une Scène',hi:'दो तस्वीरों को एक दृश्य में मिलाएं',bn:'একটি দৃশ্যে দুটি ছবি মার্জ করুন',ne:'दुई फोटो एक दृश्य मा मिलाउनुहोस्',id:'Menggabungkan Dua Foto dalam Satu Adegan',fil:'Merge Two Photos in One Scene',tr:'İki Fotoğrafı Bir Sahnede Birleştir',zh:'在一个场景中合并两张照片',ru:'Объединить две фотографии в одну сцену',es:'Fusionar Dos Fotos en Una Escena',ml:'ഒരു സീനിൽ രണ്ട് ഫോട്ടോ വിലയിരുത്തുക'},
  'أفاتار متحرك (٦ إطارات)': {en:'Animated Avatar 6 Frames',fr:'Avatar Animé 6 Images',hi:'एनिमेटेड अवतार 6 फ्रेम',bn:'অ্যানিমেটেড অবতার 6 ফ্রেম',ne:'एनिमेटेड अवतार 6 फ्रेमहरु',id:'Avatar Animasi 6 Frame',fil:'Animated Avatar 6 Frames',tr:'Animasyon Avatarı 6 Kare',zh:'动画头像6帧',ru:'Анимированный аватар 6 кадров',es:'Avatar Animado 6 Fotogramas',ml:'അനിമേറ്റഡ് അവതാര 6 ഫ്രെയിമുകൾ'},
  'صورة رسمية للجواز': {en:'Formal Passport Photo',fr:'Photo Officielle de Passeport',hi:'औपचारिक पासपोर्ट फोटो',bn:'আনুষ্ঠানিক পাসপোর্ট ফটো',ne:'आधिकारिक पासपोर्ट फोटो',id:'Foto Paspor Resmi',fil:'Formal Passport Photo',tr:'Resmi Pasaport Fotoğrafı',zh:'正式护照照片',ru:'Официальное паспортное фото',es:'Foto de Pasaporte Oficial',ml:'ഔപചാരിക പാസ്പോർട്ട് ഫോട്ടോ'},
  'ترميم الصور القديمة': {en:'Restore Old Photos',fr:'Restaurer les Vieilles Photos',hi:'पुरानी तस्वीरों को पुनर्स्थापित करें',bn:'পুরানো ফটো পুনরুদ্ধার করুন',ne:'पुरानो तस्वीर पुनः स्थापन गर्नुहोस्',id:'Pulihkan Foto Lama',fil:'Restore Old Photos',tr:'Eski Fotoğrafları Geri Yükle',zh:'恢复旧照片',ru:'Восстановить старые фотографии',es:'Restaurar Fotos Antiguas',ml:'പഴയ ഫോട്ടോകൾ പുനരുദ്ധരിക്കുക'},
  'تلوين الصور القديمة': {en:'Colorize Old Photos',fr:'Colorier les Vieilles Photos',hi:'पुरानी तस्वीरों को रंगित करें',bn:'পুরানো ফটো রঙিন করুন',ne:'पुरानो तस्वीर रङ्गित गर्नुहोस्',id:'Warnai Foto Lama',fil:'Colorize Old Photos',tr:'Eski Fotoğrafları Rengilendir',zh:'给旧照片着色',ru:'Раскрасить старые фотографии',es:'Colorear Fotos Antiguas',ml:'പഴയ ഫോട്ടോകൾ നിറം ചെയ്യുക'},
  'رفع الدقة والوضوح': {en:'Upscale Resolution Quality',fr:'Upscaler la Résolution',hi:'रेजोल्यूशन गुणवत्ता अपस्केल करें',bn:'রেজোলিউশন আপস্কেল করুন',ne:'संकल्प अप्स्केल गरनुहोस्',id:'Tingkatkan Kualitas Resolusi',fil:'Upscale Resolution Quality',tr:'Çözünürlüğü Yükselt',zh:'升级分辨率质量',ru:'Повысить качество разрешения',es:'Aumentar Calidad de Resolución',ml:'വിഭാഗം നിലവാരം ഉയർത്തുക'},
  'إزالة عناصر من الصورة': {en:'Remove Objects from Photo',fr:'Supprimer les Objets de la Photo',hi:'फोटो से ऑब्जेक्ट हटाएं',bn:'ফটো থেকে অবজেক্ট সরান',ne:'फोटोबाट वस्तु हटाउनुहोस्',id:'Hapus Objek dari Foto',fil:'Remove Objects from Photo',tr:'Fotoğraftan Nesneleri Kaldır',zh:'从照片中删除对象',ru:'Удалить объекты с фото',es:'Eliminar Objetos de la Foto',ml:'ഫോട്ടോയിൽ നിന്ന് വസ്തുക്കൾ നീക്കം ചെയ്യുക'},
  'تبديل الملابس في الصورة': {en:'Change Outfit in Photo',fr:'Changer de Vêtements dans la Photo',hi:'फोटो में पोशाक बदलें',bn:'ফটোতে পোশাক পরিবর্তন করুন',ne:'फोटो मा पोशाक परिवर्तन गर्नुहोस्',id:'Ganti Pakaian di Foto',fil:'Change Outfit in Photo',tr:'Fotoğrafta Kıyafeti Değiştir',zh:'更改照片中的服装',ru:'Изменить наряд на фото',es:'Cambiar Atuendo en la Foto',ml:'ഫോട്ടോയിൽ വസ്ത്രം പരിവർത്തനം ചെയ്യുക'},
  'لقطة منتج احترافية': {en:'Professional Product Shot',fr:'Photo de Produit Professionnelle',hi:'पेशेवर उत्पाद शॉट',bn:'পেশাদার পণ্য শট',ne:'पेशेवर उत्पाद शट',id:'Pemotretan Produk Profesional',fil:'Professional Product Shot',tr:'Profesyonel Ürün Fotoğrafı',zh:'专业产品拍摄',ru:'Профессиональная съемка продукта',es:'Foto de Producto Profesional',ml:'പ്രൊഫെഷനൽ ഉൽപ്പാദ്യ ഷോട്ട്'},
  'أجواء الحج والعمرة': {en:'Hajj and Umrah Vibes',fr:'Ambiance Hadj et Omra',hi:'हज और उमराह वातावरण',bn:'হজ এবং উমরা পরিবেশ',ne:'हज र उमरा वातावरण',id:'Vibes Hajj dan Umrah',fil:'Hajj and Umrah Vibes',tr:'Hac ve Umre Atmosferi',zh:'朝觐和副朝氛围',ru:'Атмосфера Хаджа и Умры',es:'Vibraciones de Hajj y Umrah',ml:'ഹജ് കൂടാതെ ഉമ്റ വൈബ്സ്'},
  'احتفال عيد ميلاد': {en:'Birthday Celebration',fr:'Célébration d\'Anniversaire',hi:'जन्मदिन का जश्न',bn:'জন্মদিনের উদযাপন',ne:'जन्मदिनको उदयापन',id:'Perayaan Ulang Tahun',fil:'Birthday Celebration',tr:'Doğum Günü Kutlaması',zh:'生日庆祝',ru:'Празднование дня рождения',es:'Celebración de Cumpleaños',ml:'ജന്മദിനം ആഘോഷം'},
  'تذكار مولود جديد': {en:'Newborn Keepsake',fr:'Souvenir de Nouveau-Né',hi:'नवजात स्मृति',bn:'নবজাত স্মৃতিচিহ্ন',ne:'नवजात स्मरक',id:'Kenang-kenangan Bayi Baru',fil:'Newborn Keepsake',tr:'Yeni Doğan Hatırası',zh:'新生儿纪念品',ru:'Памятка новорожденного',es:'Recuerdo de Recién Nacido',ml:'നവജാത കിതാബ്'},
  'شخصية صلصال لطيفة': {en:'Cute Clay Character',fr:'Personnage d\'Argile Mignon',hi:'प्यारा मिट्टी चरित्र',bn:'সুন্দর মাটির চরিত্র',ne:'प्यारा माटो क्यारेक्टर',id:'Karakter Tanah Liat Lucu',fil:'Cute Clay Character',tr:'Sevimli Kil Karakteri',zh:'可爱粘土角色',ru:'Милый персонаж из глины',es:'Personaje de Arcilla Bonito',ml:'സുന്ദരമായ കളിമണ്ണ് പാത്രം'},
  'تصميم هندسي حديث': {en:'Modern Geometric Design',fr:'Conception Géométrique Moderne',hi:'आधुनिक ज्यामितीय डिजाइन',bn:'আধুনিক জ্যামিতিক ডিজাইন',ne:'आधुनिक ज्यामितीय डिजाइन',id:'Desain Geometris Modern',fil:'Modern Geometric Design',tr:'Modern Geometrik Tasarım',zh:'现代几何设计',ru:'Современный геометрический дизайн',es:'Diseño Geométrico Moderno',ml:'ആധുനിക ജ്യാമിതീയ ഡിസൈൻ'},
  'জরাফিতি শারে جريء': {en:'Bold Street Graffiti',fr:'Graffiti de Rue Audacieux',hi:'साहसी सड़क ग्राफिटी',bn:'সাহসী রাস্তা গ্রাফিটি',ne:'साहसी सड़क ग्राफिटी',id:'Graffiti Jalan Berani',fil:'Bold Street Graffiti',tr:'Cesur Sokak Grafitisi',zh:'大胆街头涂鸦',ru:'Смелое уличное граффити',es:'Graffiti Callejero Audaz',ml:'ധാരസാധ്യ തെരുവ് ഗ്രാഫിറ്റി'},
  'فسيفساء فنية': {en:'Artistic Mosaic',fr:'Mosaïque Artistique',hi:'कलात्मक मोज़ेक',bn:'শিল্পকলা মোজাইক',ne:'कलात्मक मोजैक',id:'Mosaik Artistik',fil:'Artistic Mosaic',tr:'Sanatsal Mozaik',zh:'艺术马赛克',ru:'Художественная мозаика',es:'Mosaico Artístico',ml:'കലാത്മക മോസൈക്ക്'},
  'زجاج معشّق ملوّن': {en:'Colored Stained Glass',fr:'Vitrail Coloré',hi:'रंगीन सना हुआ ग्लास',bn:'রঙিন দাগযুক্ত গ্লাস',ne:'रङ्गीन दाग गरिएको गिलास',id:'Kaca Patri Berwarna',fil:'Colored Stained Glass',tr:'Renkli Vitray Cam',zh:'彩色彩玻璃',ru:'Разноцветное витражное стекло',es:'Vidrio Teñido de Color',ml:'വർണ്ണിത ദാഗ് ഗ്ലാസ്'},
  'فن الورق المقصوص': {en:'Paper Cut Art',fr:'Art du Découpage de Papier',hi:'कागज कला कला',bn:'কাগজ কাটা শিল্প',ne:'कागज काट कला',id:'Seni Potong Kertas',fil:'Paper Cut Art',tr:'Kağıt Kesme Sanatı',zh:'纸艺术',ru:'Искусство вырезания из бумаги',es:'Arte de Corte de Papel',ml:'പേപ്പർ കട് ആർട്ട്'},
  'شخصية كروشيه محبوكة': {en:'Crocheted Character',fr:'Personnage au Crochet',hi:'क्रोचेटेड चरित्र',bn:'ক্রোশেটেড চরিত্র',ne:'क्रोचेटेड क्यारेक्टर',id:'Karakter Rajutan Kait',fil:'Crocheted Character',tr:'Tırtıklı Karakter',zh:'钩针编织角色',ru:'Вязаный крючком персонаж',es:'Personaje de Ganchillo',ml:'ഹുക്കിംഗ് ചെയ്ത പാത്രം'},
  'مجسم منفوخ لامع': {en:'Shiny Inflatable Figure',fr:'Figure Gonflable Brillante',hi:'चमकदार फुलाए जाने योग्य आकृति',bn:'চকচকে স্ফীত চিত্র',ne:'चमकदार फुलाउन योग्य चित्र',id:'Figura Balon Berkilau',fil:'Shiny Inflatable Figure',tr:'Parlak Şişirilebilir Figür',zh:'闪亮充气人物',ru:'Блестящая надувная фигура',es:'Figura Inflable Brillante',ml:'തിളങ്ങുന്ന നിരക്കയോഗ്യ ഫിഗർ'},
  'فن ياباني كلاسيكي': {en:'Classical Japanese Art',fr:'Art Japonais Classique',hi:'शास्त्रीय जापानी कला',bn:'ক্লাসিক্যাল জাপানি শিল्প',ne:'शास्त्रीय जापानी कला',id:'Seni Jepang Klasik',fil:'Classical Japanese Art',tr:'Klasik Japon Sanatı',zh:'古典日本艺术',ru:'Классическое японское искусство',es:'Arte Japonés Clásico',ml:'ക്ലാസ്സിക്കൽ ജാപ്പനീസ് കലാ'},
  'رسم رملي إماراتي': {en:'Emirati Sand Art',fr:'Art du Sable Émirati',hi:'एमिराती रेत कला',bn:'এমিরাতি বালি শিল্প',ne:'इमिराती बालु कला',id:'Seni Pasir Emirat',fil:'Emirati Sand Art',tr:'Emiratli Kum Sanatı',zh:'阿联酋沙画艺术',ru:'Эмиратское искусство из песка',es:'Arte de Arena Emiratí',ml:'എമിരാതി മണ്ണ് കലാ'},
  'لوحة نيون مضيئة': {en:'Glowing Neon Sign',fr:'Enseigne Néon Brillante',hi:'चमकता नीयन संकेत',bn:'উজ্জ্বল নিয়ন চিহ্ন',ne:'चमकदार नियोन संकेत',id:'Tanda Neon Bersinar',fil:'Glowing Neon Sign',tr:'Parlayan Neon İşareti',zh:'发光霓虹灯牌',ru:'Светящийся неоновый знак',es:'Letrero de Neón Brillante',ml:'തിളങ്ങുന്ന നിയോൺ ചിഹ്നം'},
  'تعريض مزدوج فني': {en:'Artistic Double Exposure',fr:'Double Exposition Artistique',hi:'कलात्मक दोहरी जोखिम',bn:'শিল্পকলা দ্বৈত এক্সপোজার',ne:'कलात्मक दोहरो जोखिम',id:'Eksposur Ganda Artistik',fil:'Artistic Double Exposure',tr:'Sanatsal Çift Pozlama',zh:'艺术双曝光',ru:'Художественная двойная экспозиция',es:'Exposición Doble Artística',ml:'കലാത്മക രണ്ടിരട്ടി എക്സ്പോഷർ'},
  'مجسم أكشن في علبة': {en:'Action Figure in Box',fr:'Figurine d\'Action dans une Boîte',hi:'बॉक्स में एक्शन फिगर',bn:'বাক্সে অ্যাকশন ফিগার',ne:'बक्स मा एक्शन फिगर',id:'Aksi Figur dalam Kotak',fil:'Action Figure in Box',tr:'Kutuda Aksiyon Figürü',zh:'盒子里的动作人物',ru:'Фигура действия в коробке',es:'Figura de Acción en Caja',ml:'ബോക്സിൽ സാഹചര്യ ഫിഗർ'},
  'ستايل جيبلي ساحر': {en:'Magical Ghibli Style',fr:'Style Ghibli Magique',hi:'जादुई गिबली शैली',bn:'জাদুকর গিবলি স্টাইল',ne:'जादुई गिबली शैली',id:'Gaya Ghibli Magis',fil:'Magical Ghibli Style',tr:'Sihirli Ghibli Tarzı',zh:'魔幻吉卜力风格',ru:'Волшебный стиль Гибли',es:'Estilo Ghibli Mágico',ml:'മാജിക് ഗിബലി സ്റ്റൈൽ'},
  'شخصية ليغو': {en:'LEGO Character',fr:'Personnage LEGO',hi:'लेगो चरित्र',bn:'লেগো চরিত্র',ne:'लेगो क्यारेक्टर',id:'Karakter LEGO',fil:'LEGO Character',tr:'LEGO Karakteri',zh:'乐高角色',ru:'Персонаж LEGO',es:'Personaje de LEGO',ml:'ലെഗോ പാത്രം'},
  'ملصقات واتساب (٦ تعبيرات)': {en:'WhatsApp Stickers 6 Expressions',fr:'Autocollants WhatsApp 6 Expressions',hi:'व्हाट्सएप स्टिकर 6 भाव',bn:'হোয়াটসঅ্যাপ স্টিকার 6 অভিব্যক্তি',ne:'व्हाट्सएप स्टिकर 6 अभिव्यक्ति',id:'Stiker WhatsApp 6 Ekspresi',fil:'WhatsApp Stickers 6 Expressions',tr:'WhatsApp Etiketleri 6 İfade',zh:'WhatsApp贴纸6种表情',ru:'Стикеры WhatsApp 6 выражений',es:'Pegatinas WhatsApp 6 Expresiones',ml:'വാട്സാപ്പ് സ്റ്റിക്കറുകൾ 6 പ്രകാശനങ്ങൾ'},
  'تشيبي ياباني لطيف': {en:'Cute Japanese Chibi',fr:'Chibi Japonais Mignon',hi:'प्यारा जापानी चिबी',bn:'সুন্দর জাপানি চিবি',ne:'प्यारा जापानी चिबी',id:'Chibi Jepang Lucu',fil:'Cute Japanese Chibi',tr:'Sevimli Japon Chibi',zh:'可爱日本奇比',ru:'Милый японский чиби',es:'Chibi Japonés Bonito',ml:'സുന്ദരമായ ജാപ്പനീസ് ചിബി'},
  'تمثال رخامي كلاسيكي': {en:'Classical Marble Statue',fr:'Statue de Marbre Classique',hi:'शास्त्रीय संगमरमर प्रतिमा',bn:'ক্লাসিক্যাল মার্বেল মূর্তি',ne:'शास्त्रीय संगमरमर प्रतिमा',id:'Patung Marmer Klasik',fil:'Classical Marble Statue',tr:'Klasik Mermer Heykeli',zh:'古典大理石雕像',ru:'Классическая мраморная статуя',es:'Estatua de Mármol Clásica',ml:'ക്ലാസ്സിക്കൽ മാർബിൾ പ്രതിമ'},
  'بولارويد قديمة': {en:'Vintage Polaroid Photo',fr:'Photo Polaroid Vintage',hi:'विंटेज पोलारॉयड फोटो',bn:'ভিন্টেজ পোলারয়েড ফটো',ne:'भिन्टेज पोलारॉयड फोटो',id:'Foto Polaroid Vintage',fil:'Vintage Polaroid Photo',tr:'Vintage Polaroid Fotoğrafı',zh:'复古宝丽来照片',ru:'Винтажное фото Polaroid',es:'Foto Polaroid Vintage',ml:'വിന്റേജ് പോലാരോയ്ഡ് ഫോട്ടോ'},
  'كرتون مع شخصيتك المفضلة': {en:'Cartoon with Your Favorite Character',fr:'Dessin Animé avec Votre Personnage Préféré',hi:'अपने पसंदीदा चरित्र के साथ कार्टून',bn:'আপনার প্রিয় চরিত্র সহ কার্টুন',ne:'आपको मनपर्ने क्यारेक्टर सँग कार्टुन',id:'Kartun dengan Karakter Favorit Anda',fil:'Cartoon with Your Favorite Character',tr:'Favori Karakterinizle Karikatür',zh:'与你最喜欢的角色卡通',ru:'Мультфильм с вашим любимым персонажем',es:'Caricatura con tu Personaje Favorito',ml:'നിങ്ങളുടെ പ്രിയപ്പെട്ട പാത്രം കാർട്ടൂൺ'},
  'مهنة: طبيب، طيار، شرطي…': {en:'Profession: Doctor, Pilot, Police...',fr:'Profession: Médecin, Pilote, Police...',hi:'पेशा: डॉक्टर, पायलट, पुलिस...',bn:'পেশা: ডাক্তার, পাইলট, পুলিশ...',ne:'पेशा: डाक्टर, पायलट, पुलिस...',id:'Profesi: Dokter, Pilot, Polisi...',fil:'Profession: Doctor, Pilot, Police...',tr:'Meslek: Doktor, Pilot, Polis...',zh:'职业：医生、飞行员、警察...',ru:'Профессия: Врач, Пилот, Полицейский...',es:'Profesión: Doctor, Piloto, Policía...',ml:'പ്രൊഫഷൻ: ഡോക്ടർ, പൈലറ്റ്, പോലീസ്...'},
  'بطل خارق بزي كامل': {en:'Superhero in Full Costume',fr:'Superhéros en Costume Complet',hi:'पूर्ण पोशाक में सुपरहीरो',bn:'সম্পূর্ণ পোশাকে সুপারহিরো',ne:'पूर्ण पोशाक मा सुपरहीरो',id:'Superhero dalam Kostum Lengkap',fil:'Superhero in Full Costume',tr:'Tam Kostümlü Süper Kahraman',zh:'全装扮超级英雄',ru:'Супергерой в полном костюме',es:'Superhéroe en Traje Completo',ml:'പൂർണ്ണ കോസ്റ്റ്യൂമിൽ സുപ്പർഹീറോ'},
  'رائد فضاء': {en:'Astronaut',fr:'Astronaute',hi:'अंतरिक्ष यात्री',bn:'মহাকাশচারী',ne:'अंतरिक्ष यात्री',id:'Astronot',fil:'Astronaut',tr:'Uzay Astronotu',zh:'宇航员',ru:'Космонавт',es:'Astronauta',ml:'ബഹിരാകാശ യാത്രികൻ'},
};

function stuL(ar, en){
  var l = (typeof lang !== 'undefined' && lang) ? lang : (typeof pstyleLang === 'function' ? pstyleLang() : 'ar');
  if(l === 'ar' || l === 'ur') return ar;
  if(l === 'en') return en;
  var m = STU_XL[ar];
  return (m && m[l]) || en;
}

/* ---------- 🎨 Portrait Styles (Gemini image, server-side owner key) ---------- */
(function(){
  const modal = $('#portraitStyleModal');
  const btnOpen = $('#btnPortraitStyle');
  const btnClose = $('#portraitStyleCloseBtn');
  const btnGenerate = $('#portraitStyleGenerateBtn');
  const fileInput = $('#portraitStyleFileInput');
  const fileBtn = $('#portraitStyleFileBtn');
  const fileNameEl = $('#portraitStyleFileName');
  const sourcePreview = $('#portraitStyleSourcePreview');
  const styleEl = $('#portraitStyleSelect');
  const backdropWrap = $('#portraitBackdropWrap');
  const backdropEl = $('#portraitBackdropSelect');
  const beautifyWrap = $('#portraitBeautifyWrap');
  const beautifySkinEl = $('#portraitBeautifySkin');
  const beautifyLightEl = $('#portraitBeautifyLight');
  const beautifyTeethEl = $('#portraitBeautifyTeeth');
  const favStarBtn = $('#portraitFavStarBtn');
  const favGroup = $('#portraitFavGroup');
  const FAV_KEY = 'portraitFavStyles';
  function getFavs(){ try{ return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }catch(e){ return []; } }
  function setFavs(arr){ localStorage.setItem(FAV_KEY, JSON.stringify(arr)); }
  function refreshFavGroup(){
    if(!favGroup || !styleEl) return;
    const favs = getFavs();
    favGroup.innerHTML = '';
    favGroup.label = t('portraitFavGroupLabel') || '⭐ المفضلة';
    if(favs.length === 0){ favGroup.style.display = 'none'; return; }
    favGroup.style.display = '';
    favs.forEach((val) => {
      const orig = styleEl.querySelector('option[value="' + val + '"]');
      if(orig && orig.parentNode !== favGroup){
        const clone = orig.cloneNode(true);
        favGroup.appendChild(clone);
      }
    });
  }
  /* v-portrait-style-page: معرض أنماط الصور ملء الشاشة — شبكة عمودية متجاوبة
     (كمبيوتر وهواتف عبر auto-fill)، بطاقة احترافية: صورة نفس الوجه بالستايل +
     عنوان ووصف، المفضلة ⭐ أولًا، وبلا صورة يبقى الإيموجي بأناقة. */
  const styleSheet = $('#portraitStyleSheet');
  const styleCardsGrid = $('#portraitStyleCards');
  const styleTrigger = $('#portraitStyleTrigger');
  const styleSheetClose = $('#portraitStyleSheetClose');
  const styleSheetCount = $('#portraitStyleSheetCount');
  const PSTYLE_SUBS = {
    anime: 'ستايل الأنمي والمانجا', cartoon: 'كرتون رقمي ناعم', oil: 'لوحة زيتية كلاسيكية',
    sketch: 'رسم يدوي بالرصاص', pixel: 'بيكسل آرت ريترو', comic: 'كوميكس بخطوط جريئة',
    pop: 'بوب آرت ملوّن وحيوي', gulf: 'أسلوب إماراتي تراثي فاخر', caricature: 'كاريكاتير مرح',
    cinematic: 'إضاءة سينمائية درامية', disney: 'شخصيات ثلاثية الأبعاد لطيفة', flat: 'فيكتور مسطح أنيق',
    fantasy: 'عالم خيالي بتفاصيل ملحمية', western: 'طابع وسترن قديم', cyberpunk: 'أجواء مستقبلية بإضاءة نيون',
    abstract: 'فن تجريدي معبّر', watercolor: 'لوحة مائية بألوان زاهية', ottoman: 'منمنمات إسلامية مذهّبة',
    gameposter: 'بوستر شخصية لعبة', newspaper: 'كاريكاتير صحفي قديم', horror: 'أجواء رعب هالوين',
    shonen: 'أنمي حركة ياباني', royal: 'لوحة ملكية كلاسيكية', calligraphy: 'زخرفة بالخط العربي',
    removebg: 'إزالة الخلفية بخلفية جاهزة', linkedin: 'صورة احترافية للعمل والسيرة', beautify: 'تحسينات خفيفة طبيعية',
    eid: 'إطار احتفالي للعيد', national: 'إطار اليوم الوطني الإماراتي', ramadan: 'أجواء رمضانية روحانية',
    ageshift: 'شكلك أصغر أو أكبر عمرًا', sportshero: 'بوستر بطل رياضي', hairstyle: 'تسريحة ولون شعر جديد',
    wedding: 'إطلالة زفاف أنيقة', graduation: 'ثوب وقبعة التخرج', adposter: 'بوستر إعلاني باسمك',
    timeshift: 'صورتك في زمن آخر', familystyle: 'ستايل موحّد للعائلة', merge2: 'دمج صورتين في مشهد',
    avatargif: 'أفاتار متحرك (٦ إطارات)', passport: 'صورة رسمية للجواز', restore: 'ترميم الصور القديمة',
    colorize: 'تلوين الصور القديمة', upscale: 'رفع الدقة والوضوح', objectremove: 'إزالة عناصر من الصورة',
    outfit: 'تبديل الملابس في الصورة', productshot: 'لقطة منتج احترافية', hajj: 'أجواء الحج والعمرة',
    birthday: 'احتفال عيد ميلاد', newborn: 'تذكار مولود جديد', claymation: 'شخصية صلصال لطيفة',
    lowpoly: 'تصميم هندسي حديث', graffiti: 'جرافيتي شارع جريء', mosaic: 'فسيفساء فنية',
    stainedglass: 'زجاج معشّق ملوّن', papercraft: 'فن الورق المقصوص', crochet: 'شخصية كروشيه محبوكة',
    inflatable: 'مجسم منفوخ لامع', ukiyoe: 'فن ياباني كلاسيكي', sandart: 'رسم رملي إماراتي',
    neonsign: 'لوحة نيون مضيئة', doubleexposure: 'تعريض مزدوج فني', figurine: 'مجسم أكشن في علبة',
    ghibli: 'ستايل جيبلي ساحر', lego: 'شخصية ليغو', stickerpack: 'ملصقات واتساب (٦ تعبيرات)',
    chibi: 'تشيبي ياباني لطيف', statue: 'تمثال رخامي كلاسيكي', polaroid: 'بولارويد قديمة',
    celebtoon: 'كرتون مع شخصيتك المفضلة', profession: 'مهنة: طبيب، طيار، شرطي…', superhero: 'بطل خارق بزي كامل',
    astronaut: 'رائد فضاء',
  };
  function pstyleLang(){ try{ return localStorage.getItem('aiapp_lang') || 'ar'; }catch(e){ return 'ar'; } }
  /* دمج: الأوصاف مترجمة فعليًا لكل اللغات عبر STU_XL (بدل إخفائها) */
  function pstyleSub(v){
    var ar = PSTYLE_SUBS[v] || '';
    if(!ar) return '';
    var m = STU_XL[ar];
    return stuL(ar, (m && m.en) || '');
  }
  /* v-look-labels-fix: optLabel كانت معرّفة في نطاق الأزياء فقط بينما تُستدعى
     هنا أيضًا — فتعطّل فتح ورقة الأنماط (ReferenceError). نسخة النطاق هذه:
     خيارات البورتريه كلها data-i18n مترجمة فترجع نصّها كما هو. */
  function optLabel(o){
    if(!o) return '';
    var l = pstyleLang();
    /* v651: كانت كلّ لغة غير ar/ur ترى الإنجليزيّة، والأردو ترث العربيّة. */
    if(l.indexOf('ar') !== 0 && !o.hasAttribute('data-i18n')){
      var de = o.getAttribute('data-en');
      if(de) return (typeof window.__bT === 'function') ? window.__bT((o.textContent||'').trim(), String(de).trim()) : de;
    }
    return o.textContent;
  }
  function pstyleOpts(){
    const favs = getFavs();
    const opts = Array.from(styleEl.querySelectorAll('option'))
      .filter((o) => !(o.parentElement && o.parentElement.id === 'portraitFavGroup'));
    opts.sort((a, b) => (favs.includes(b.value) ? 1 : 0) - (favs.includes(a.value) ? 1 : 0));
    return opts;
  }
  function refreshStyleTrigger(){
    if(!styleTrigger || !styleEl) return;
    const opt = styleEl.querySelector('option[value="' + styleEl.value + '"]');
    const img = $('#portraitStyleTriggerImg');
    if(img){ img.src = 'assets/portrait/styles/' + styleEl.value + '.webp'; img.onerror = function(){ img.style.visibility = 'hidden'; }; img.style.visibility = 'visible'; }
    const nameEl = $('#portraitStyleTriggerName'); if(nameEl) nameEl.textContent = opt ? opt.textContent : '';
    const subEl = $('#portraitStyleTriggerSub'); if(subEl) subEl.textContent = pstyleSub(styleEl.value);
  }
  function renderPortraitStyleCards(){
    if(!styleCardsGrid || !styleEl) return;
    const favs = getFavs();
    const opts = pstyleOpts();
    /* v-psub-ar-only: سطر العدّاد صار مفتاح ترجمة لكل اللغات بدل عربي/إنجليزي فقط.
       ملاحظة: t المحلية في هذا الملف تعرف عربي/إنجليزي فقط وتحجب المترجم
       العام — نستدعي window.t (مترجم اللغات الـ14) صراحةً. */
    if(styleSheetCount){
      const __gt = (typeof window !== 'undefined' && typeof window.t === 'function') ? window.t : null;
      const __cntSuffix = (__gt && __gt('psheetCountSuffix') !== 'psheetCountSuffix') ? __gt('psheetCountSuffix') : (pstyleLang().startsWith('en') ? 'styles — same face, every style' : 'ستايلًا — نفس وجهك بكل ستايل');
      styleSheetCount.textContent = opts.length + ' ' + __cntSuffix;
    }
    styleCardsGrid.innerHTML = '';
    opts.forEach((opt) => {
      const v = opt.value;
      const active = v === styleEl.value;
      const title = optLabel(opt).trim();
      const card = document.createElement('div');
      card.setAttribute('data-pstyle-card', v);
      card.style.cssText = 'border-radius:14px; overflow:hidden; cursor:pointer; background:#17171b;' +
        (active ? ' border:2px solid #d4af37; box-shadow:0 0 14px rgba(212,175,55,.3);' : ' border:1px solid var(--border,#2a2a30);');
      const imgWrap = document.createElement('div');
      imgWrap.style.cssText = 'position:relative; aspect-ratio:3/4; background:linear-gradient(160deg,#23232a,#101014); display:flex; align-items:center; justify-content:center;';
      // بلا صورة: شارة صغيرة بحلقة ذهبية — لا إيموجي عملاق يوحي بالألعاب.
      const emoji = document.createElement('div');
      emoji.textContent = (title.match(/^\S+/) || [''])[0];
      emoji.style.cssText = 'width:54px; height:54px; border-radius:50%; border:1px solid rgba(212,175,55,.4); background:rgba(212,175,55,.06); display:flex; align-items:center; justify-content:center; font-size:22px;';
      const img = document.createElement('img');
      img.src = 'assets/portrait/styles/' + v + '.webp';
      img.alt = title; img.loading = 'lazy';
      img.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; object-fit:cover;';
      img.onerror = function(){ img.remove(); };
      imgWrap.appendChild(emoji); imgWrap.appendChild(img);
      if(favs.includes(v)){
        const star = document.createElement('div'); star.textContent = '⭐';
        star.style.cssText = 'position:absolute; top:6px; inset-inline-end:7px; font-size:14px;';
        imgWrap.appendChild(star);
      }
      if(active){
        const tick = document.createElement('div'); tick.textContent = '✓';
        tick.style.cssText = 'position:absolute; top:6px; inset-inline-start:7px; width:22px; height:22px; border-radius:50%; background:#d4af37; color:#141414; font-weight:800; font-size:14px; display:flex; align-items:center; justify-content:center;';
        imgWrap.appendChild(tick);
      }
      const info = document.createElement('div');
      info.style.cssText = 'padding:9px 10px 11px; text-align:center;';
      const nameEl = document.createElement('div');
      nameEl.textContent = title;
      nameEl.style.cssText = 'font-size:12.5px; font-weight:700; color:' + (active ? '#d4af37' : '#eef0f6') + ';';
      const subEl = document.createElement('div');
      subEl.textContent = pstyleSub(v);
      subEl.style.cssText = 'font-size:10.5px; color:#9a9a9e; margin-top:3px; min-height:13px;';
      info.appendChild(nameEl); info.appendChild(subEl);
      card.appendChild(imgWrap); card.appendChild(info);
      card.onclick = function(){
        styleEl.value = v;
        styleEl.dispatchEvent(new Event('change', { bubbles: true }));
        refreshStyleTrigger();
        if(styleSheet) styleSheet.style.display = 'none';
      };
      styleCardsGrid.appendChild(card);
    });
  }
  if(styleTrigger) styleTrigger.onclick = function(){ renderPortraitStyleCards(); if(styleSheet) styleSheet.style.display = 'flex'; };
  if(styleSheetClose) styleSheetClose.onclick = function(){ styleSheet.style.display = 'none'; };
  refreshStyleTrigger();
  function refreshStarIcon(){
    if(!favStarBtn || !styleEl) return;
    const favs = getFavs();
    favStarBtn.textContent = favs.includes(styleEl.value) ? '⭐' : '☆';
  }
  if(favStarBtn){
    favStarBtn.onclick = () => {
      const val = styleEl.value;
      let favs = getFavs();
      if(favs.includes(val)){ favs = favs.filter((v) => v !== val); }
      else { favs.push(val); }
      setFavs(favs);
      refreshFavGroup();
      refreshStarIcon();
      renderPortraitStyleCards(); // شارة ⭐ وترتيب المفضلة أولًا
    };
  }
  if(styleEl){
    styleEl.addEventListener('change', refreshStarIcon);
    styleEl.addEventListener('change', refreshStyleTrigger);
    refreshFavGroup();
    refreshStarIcon();
    refreshStyleTrigger();
    /* v-ptrigger-lang: إعادة الرسم بعد وصول ملف اللغة الكسول */
    setTimeout(refreshStyleTrigger, 1800);
    setTimeout(refreshStyleTrigger, 4000);
  }
  if(styleEl && backdropWrap){
    styleEl.addEventListener('change', () => {
      backdropWrap.style.display = (styleEl.value === 'removebg') ? 'block' : 'none';
      if(beautifyWrap) beautifyWrap.style.display = (styleEl.value === 'beautify') ? 'block' : 'none';
      const ageWrap = $('#portraitAgeWrap');
      if(ageWrap) ageWrap.style.display = (styleEl.value === 'ageshift') ? 'block' : 'none';
      const hairWrap = $('#portraitHairWrap');
      if(hairWrap) hairWrap.style.display = (styleEl.value === 'hairstyle') ? 'block' : 'none';
      const adWrap = $('#portraitAdWrap');
      if(adWrap) adWrap.style.display = (styleEl.value === 'adposter') ? 'block' : 'none';
      const celebWrap = $('#portraitCelebWrap');
      if(celebWrap) celebWrap.style.display = (styleEl.value === 'celebtoon') ? 'block' : 'none';
      const removeWrap = $('#portraitRemoveWrap');
      if(removeWrap) removeWrap.style.display = (styleEl.value === 'objectremove') ? 'block' : 'none';
      const outfitWrap = $('#portraitOutfitWrap');
      if(outfitWrap) outfitWrap.style.display = (styleEl.value === 'outfit') ? 'block' : 'none';
      const profWrap = $('#portraitProfWrap');
      if(profWrap) profWrap.style.display = (styleEl.value === 'profession') ? 'block' : 'none';
      const eraWrap = $('#portraitEraWrap');
      if(eraWrap) eraWrap.style.display = (styleEl.value === 'timeshift') ? 'block' : 'none';
      const multiWrapEl = $('#portraitMultiWrap');
      const isFamily = (styleEl.value === 'familystyle');
      const isMerge = (styleEl.value === 'merge2');
      if(multiWrapEl) multiWrapEl.style.display = (isFamily || isMerge) ? 'block' : 'none';
      const multiLabelEl = $('#portraitMultiLabel');
      if(multiLabelEl) multiLabelEl.setAttribute('data-i18n', isMerge ? 'portraitMultiLabelMerge' : 'portraitMultiLabelFamily');
      if(multiLabelEl && typeof t === 'function') multiLabelEl.textContent = isMerge ? t('portraitMultiLabelMerge') : t('portraitMultiLabelFamily');
    });
  }
  const statusEl = $('#portraitStyleStatus');
  const resultEl = $('#portraitStyleResult');
  const downloadEl = $('#portraitStyleDownloadLink');
  const compareWrap = $('#portraitCompareWrap');
  const compareBefore = $('#portraitCompareBefore');
  const compareAfterWrap = $('#portraitCompareAfterWrap');
  const compareSlider = $('#portraitCompareSlider');
  const shareBtn2 = $('#portraitShareBtn');
  if(shareBtn2){
    shareBtn2.onclick = async () => {
      // ⚠️ v592 — نفس عطب أيقونة الحفظ: السياسة تحجب fetch على data: ⇒ التحويل محليّ.
      const dataUrl = (resultEl && resultEl.src) || '';
      const isData = /^data:/i.test(String(dataUrl));
      const toBlob = (du) => { const s = String(du), i = s.indexOf(','), m = (s.slice(0, i).match(/:([^;,]+)/) || [])[1] || 'image/png', bin = atob(s.slice(i + 1)), u8 = new Uint8Array(bin.length); for(let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k); return new Blob([u8], { type: m }); };
      const nm = 'omran-portrait-style.png';
      try{
        const blob = isData ? toBlob(dataUrl) : await (await fetch(dataUrl)).blob();
        const file = new File([blob], nm, { type: blob.type || 'image/png' });
        if(navigator.canShare && navigator.canShare({ files: [file] })){
          try{ await navigator.share({ files: [file], title: 'Omran AI', text: 'Omran AI ✨' }); return; }
          catch(err){ if(err && err.name === 'AbortError') return; }
        } else if(navigator.share && !isData){
          try{ await navigator.share({ title: 'Omran AI', url: dataUrl }); return; }
          catch(err){ if(err && err.name === 'AbortError') return; }
        }
        const u = URL.createObjectURL(blob), el = document.createElement('a'); el.href = u; el.download = nm; el.click(); setTimeout(() => URL.revokeObjectURL(u), 4000);
      } catch(e){ try{ if(downloadEl) downloadEl.click(); }catch(_){ /* guard-ok — download fallback, nothing useful to do if both fail */ } }
    };
  }
  function updateCompareSlider(){
    if(!compareSlider || !compareAfterWrap) return;
    compareAfterWrap.style.width = compareSlider.value + '%';
    const divider = $('#portraitCompareDivider');
    if(divider) divider.style.left = compareSlider.value + '%';
  }
  function layoutCompareAfter(){
    if(!compareWrap || !resultEl) return;
    const w = compareWrap.offsetWidth;
    if(w) resultEl.style.width = w + 'px';
  }
  if(compareSlider) compareSlider.addEventListener('input', updateCompareSlider);
  window.addEventListener('resize', layoutCompareAfter);
  if(!modal || !btnOpen) return;

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

  let selectedBase64 = '';
  let selectedMime = 'image/jpeg';

  btnOpen.onclick = () => {
    modal.style.display = 'flex';
    /* v-ptrigger-lang (لقطة عمران: الاسم عربي والواجهة إسبانية): البطاقة
       رُسمت عند الإقلاع قبل وصول ملف اللغة الكسول — تُحدَّث عند كل فتح. */
    try{ refreshStyleTrigger(); }catch(e){ /* guard-ok — cosmetic */ }
    closeHeaderMenu();
  };
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  if(fileBtn) fileBtn.onclick = () => fileInput.click();

  fileInput.onchange = () => {
    const file = fileInput.files && fileInput.files[0];
    if(!file) return;
    selectedMime = 'image/jpeg';
    if(fileNameEl) fileNameEl.textContent = file.name;
    __compressImg(file, function(dataUrl){
      selectedBase64 = dataUrl.split(',')[1] || '';
      sourcePreview.src = dataUrl;
      sourcePreview.style.display = 'block';
    });
  };

  btnGenerate.onclick = async () => {
    if(!selectedBase64){
      setStatus(t('portraitNeedImage'));
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){
      setStatus(t('portraitNeedLogin'));
      return;
    }

    btnGenerate.disabled = true;
    resultEl.style.display = 'none';
    if(compareWrap) compareWrap.style.display = 'none';
    if(compareSlider) compareSlider.style.display = 'none';
    downloadEl.style.display = 'none';
    if(shareBtn2) shareBtn2.style.display = 'none';
    setStatus(t('portraitGenerating'));

    try{
      const res = await fetch('/api/portrait-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: selectedBase64, mimeType: selectedMime, style: styleEl.value, backdrop: (backdropEl ? backdropEl.value : ''), beautify: (styleEl.value === 'beautify') ? { skin: !!(beautifySkinEl && beautifySkinEl.checked), light: !!(beautifyLightEl && beautifyLightEl.checked), teeth: !!(beautifyTeethEl && beautifyTeethEl.checked) } : null, ageTarget: (styleEl.value === 'ageshift' && $('#portraitAgeSelect')) ? $('#portraitAgeSelect').value : '', hairStyle: (styleEl.value === 'hairstyle' && $('#portraitHairSelect')) ? $('#portraitHairSelect').value : '', adText: (styleEl.value === 'adposter' && $('#portraitAdTextInput')) ? $('#portraitAdTextInput').value : '', charName: (styleEl.value === 'celebtoon' && $('#portraitCelebInput')) ? $('#portraitCelebInput').value : '', removeText: (styleEl.value === 'objectremove' && $('#portraitRemoveInput')) ? $('#portraitRemoveInput').value : '', outfit: (styleEl.value === 'outfit' && $('#portraitOutfitSelect')) ? $('#portraitOutfitSelect').value : '', profession: (styleEl.value === 'profession' && $('#portraitProfSelect')) ? $('#portraitProfSelect').value : '', era: (styleEl.value === 'timeshift' && $('#portraitEraSelect')) ? $('#portraitEraSelect').value : '', extraImages: (styleEl.value === 'familystyle' || styleEl.value === 'merge2') ? extraImagesB64.map(function(x){ return x.base64; }) : [], token }),
      });
      const data = await __safeJson(res);
      if(!res.ok || data.error){
        if(data.error === 'auth_required'){ setStatus(t('portraitNeedLogin')); return; }
        if(data.error === 'daily_limit_reached'){ setStatus(t('portraitLimitReached')); return; }
        throw new Error(data.error || 'unknown');
      }
      if(styleEl.value === 'avatargif' && Array.isArray(data.frames) && data.frames.length){
        setStatus(t('portraitBuildingGif'));
        const { FFmpeg } = await import('/ffmpeg/lib/index.js');
        const ffmpeg = new FFmpeg();
        await ffmpeg.load({
          coreURL: '/ffmpeg/core/ffmpeg-core.js',
          wasmURL: '/ffmpeg/core/ffmpeg-core.wasm',
          classWorkerURL: '/ffmpeg/lib/worker.js',
        });
        for(let i = 0; i < data.frames.length; i++){
          const bin = atob(data.frames[i]);
          const bytes = new Uint8Array(bin.length);
          for(let j = 0; j < bin.length; j++){ bytes[j] = bin.charCodeAt(j); }
          await ffmpeg.writeFile('f' + i + '.png', bytes);
        }
        await ffmpeg.exec(['-framerate', '2', '-i', 'f%d.png', '-vf', 'fps=6,scale=480:-1:flags=lanczos', '-loop', '0', 'avatar.gif']);
        const gifData = await ffmpeg.readFile('avatar.gif');
        const gifBlob = new Blob([gifData.buffer], { type: 'image/gif' });
        const gifUrl = URL.createObjectURL(gifBlob);
        resultEl.src = gifUrl;
        resultEl.style.display = 'block';
        if(compareWrap) compareWrap.style.display = 'none';
        if(compareSlider) compareSlider.style.display = 'none';
        downloadEl.href = gifUrl;
        downloadEl.setAttribute('download', 'omran-avatar.gif');
        downloadEl.style.display = 'block';
        if(shareBtn2) shareBtn2.style.display = 'none';
        setStatus(t('portraitDone'));
      } else {
        const dataUrl = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
        resultEl.src = dataUrl;
        resultEl.style.display = 'block';
        if(compareWrap && compareBefore && compareSlider){
          compareBefore.src = 'data:' + selectedMime + ';base64,' + selectedBase64;
          compareWrap.style.display = 'block';
          compareSlider.style.display = 'none'; /* v-no-slider */
          compareSlider.value = 100;
          updateCompareSlider();
          layoutCompareAfter();
        }
        downloadEl.href = dataUrl;
        downloadEl.setAttribute('download', 'omran-portrait-style.png');
        downloadEl.style.display = 'block';
        if(shareBtn2) shareBtn2.style.display = 'block';
        setStatus(t('portraitDone'));
      }
    } catch(e){
      setStatus((bT('❌ خطأ: ','❌ Error: ')) + (e && e.message ? e.message : String(e)));
    } finally {
      btnGenerate.disabled = false;
    }
  };
})();

/* ---------- 👗 AI Fashion Design (Gemini image, server-side owner key) ---------- */
(function(){
  const modal = $('#fashionAiModal');
  const btnOpen = $('#btnFashionAI');
  const btnClose = $('#fashionAiCloseBtn');
  const btnGenerate = $('#fashionAiGenerateBtn');
  const tabImage = $('#fashionAiTabImage');
  const tabText = $('#fashionAiTabText');
  const imagePane = $('#fashionAiImagePane');
  const textPane = $('#fashionAiTextPane');
  const fileInput = $('#fashionAiFileInput');
  const fileBtn = $('#fashionAiFileBtn');
  const fileNameEl = $('#fashionAiFileName');
  const sourcePreview = $('#fashionAiSourcePreview');
  const descriptionEl = $('#fashionAiDescription');
  const styleEl = $('#fashionAiStyle');
  const statusEl = $('#fashionAiStatus');
  const resultEl = $('#fashionAiResult');
  const downloadEl = $('#fashionAiDownloadLink');
  const resultWrap = $('#fashionAiResultWrap');
  const beforeWrap = $('#fashionAiBeforeWrap');
  const beforeImg = $('#fashionAiBeforeImg');
  const sliderRange = $('#fashionAiSliderRange');
  const favSaveBtn = $('#fashionAiFavoriteSaveBtn');
  const favoritesBtn = $('#fashionAiFavoritesBtn');
  const favoritesPanel = $('#fashionAiFavoritesPanel');
  const profileHeightEl = $('#fashionProfileHeight');
  const profileWeightEl = $('#fashionProfileWeight');
  const profileSkinEl = $('#fashionProfileSkin');
  const profileHairEl = $('#fashionProfileHair');
  const profileSaveBtn = $('#fashionProfileSaveBtn');
  const occasionEl = $('#fashionAiOccasion');
  const seasonEl = $('#fashionAiSeason');
  const suggestBtn = $('#fashionAiSuggestBtn');
  const suggestionsEl = $('#fashionAiSuggestions');
  const multiAngleEl = $('#fashionAiMultiAngle');
  const compareChecksEl = $('#fashionAiCompareChecks');
  const compareBtn = $('#fashionAiCompareBtn');
  const compareStatusEl = $('#fashionAiCompareStatus');
  const compareResultsEl = $('#fashionAiCompareResults');
  if(!modal || !btnOpen) return;

  function isEn(){ return localStorage.getItem('aiapp_lang') === 'en'; }
  function bT(a,e){ return (typeof window!=='undefined'&&window.__bT) ? window.__bT(a,e) : (isEn()?e:a); }
  /* v-look-labels: خيارات اللوكات القديمة نصها عربي مع data-en — غير العربي
     والأردو يأخذ الإنجليزية (خيارات data-i18n تُترجم أصلًا فلا تُمس). */
  function optLabel(o){
    if(!o) return '';
    var l7 = lang7();
    /* v651: كانت كلّ لغة غير ar/ur ترى الإنجليزيّة، والأردو ترث العربيّة. */
    if(l7 !== 'ar' && !o.hasAttribute('data-i18n')){
      var de = o.getAttribute('data-en');
      if(de) return (typeof window.__bT === 'function') ? window.__bT((o.textContent||'').trim(), String(de).trim()) : de;
    }
    return o.textContent;
  }
  function lang7(){ return (typeof currentLang === 'function') ? currentLang() : (localStorage.getItem('aiapp_lang') || 'ar'); }
  function t(key){
    const dict = (typeof window.__i18nDict === 'function') ? window.__i18nDict(lang7()) : ((typeof I18N !== 'undefined') ? I18N[lang7()] : null);
    return (dict && dict[key]) || key;
  }
  function setStatus(text){
    statusEl.style.display = text ? 'block' : 'none';
    statusEl.textContent = text || '';
  }

  /* ---- v-fashion-thumb-cards: بطاقات الأنماط المصوّرة ----
     نماذج مولّدة بمحرّكنا (أصول ثابتة assets/fashion/looks/<style>.webp) بدل
     سلكت نصّي. تتزامن مع #fashionAiStyle المخفي فكل الأسلاك الخلفية كما هي،
     وإن غابت صورة يبقى تدرّج أنيق مع الاسم — لا بطاقة مكسورة. */
  const styleCardsEl = $('#fashionStyleCards');
  // v-fashion-genders: لكل فئة أنماطها وصورها — العباية نسائية فقط، والصور من
  // looks/<الفئة>/، وما لم يُولَّد بعد يسقط لصور النساء ثم للتدرّج الأنيق.
  // v-fashion-78: نسائي 36 · رجالي 24 · أطفال 18 — «٣٠-٥٠ كلام آخر».
  const GENDER_STYLES = {
    women: ['evening', 'formal', 'casual', 'abaya', 'wedding', 'traditional', 'kaftan', 'jalabiya', 'hijabchic', 'oldmoney', 'streetwear', 'sporty', 'winterlux', 'summer', 'office', 'cocktail', 'ballgown', 'boho', 'vintage', 'y2k', 'minimal', 'glam', 'leather', 'denim', 'pastel', 'monochrome', 'floral', 'velvet', 'silk', 'suitf', 'turkish', 'indian', 'princess', 'safari', 'preppy', 'artgown'],
    men: ['evening', 'formal', 'casual', 'wedding', 'traditional', 'bisht', 'oldmoney', 'streetwear', 'sporty', 'winterlux', 'summer', 'office', 'leather', 'denim', 'minimal', 'monochrome', 'vintage', 'smartcasual', 'threepiece', 'safari', 'preppy', 'athleisure', 'rockstar', 'moroccan'],
    kids: ['evening', 'formal', 'casual', 'wedding', 'traditional', 'sporty', 'winterlux', 'summer', 'school', 'denim', 'pastel', 'floral', 'streetwear', 'minimal', 'vintage', 'preppy', 'eidkids', 'princess'],
  };
  function currentGender(){
    try{ return (window.omranFashionExtras && window.omranFashionExtras().gender) || 'women'; }
    catch(e){ return 'women'; }
  }
  function lookImg(gender, value, alt){
    const img = document.createElement('img');
    img.src = 'assets/fashion/looks/' + gender + '/' + value + '.webp';
    img.alt = alt;
    img.loading = 'eager'; // البطاقات ≈40KB كلها — الكسل يؤخّر ظهورها بلا مكسب
    img.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; object-fit:cover;';
    img.onerror = function(){
      if(!img.__flat){ img.__flat = 1; img.src = 'assets/fashion/looks/' + value + '.webp'; }
      else img.remove();
    };
    return img;
  }
  function fashionOptFor(v){
    return Array.prototype.find.call(styleEl.options, function(o){ return o.value === v; });
  }
  function openFashionPicker(){
    const g = currentGender();
    const list = GENDER_STYLES[g] || GENDER_STYLES.women;
    if(!window.omranPicker) return;
    window.omranPicker.open({
      title: bT('👗 أنماط الأزياء','👗 Fashion styles'),
      count: list.length + ' ' + ((typeof window.t === 'function' && window.t('pickerOptsPick') !== 'pickerOptsPick') ? window.t('pickerOptsPick') : (bT('نمطًا — اختر ما يناسبك','styles — pick yours'))),
      items: list.map(function(v){
        const opt = fashionOptFor(v);
        return opt && {
          v: v, title: optLabel(opt).trim(), active: v === styleEl.value,
          img: 'assets/fashion/looks/' + g + '/' + v + '.webp',
          img2: 'assets/fashion/looks/' + v + '.webp',
        };
      }).filter(Boolean),
      onPick: function(v){ styleEl.value = v; renderStyleCards(); },
    });
  }
  function renderStyleCards(){
    if(!styleCardsEl || !styleEl) return;
    const g = currentGender();
    const list = GENDER_STYLES[g] || GENDER_STYLES.women;
    if(list.indexOf(styleEl.value) < 0) styleEl.value = list[0];
    // v-fashion-full-page: بطاقة مصغّرة «عرض الكل ›» تفتح معرضًا ملء الشاشة —
    // نفس نظام أنماط الصور بالضبط (طلب المالك: كل المنتقيات بحجم صفحة كاملة).
    styleCardsEl.style.display = 'block';
    styleCardsEl.innerHTML = '';
    const opt = fashionOptFor(styleEl.value);
    const trig = document.createElement('div');
    trig.id = 'fashionStyleTrigger';
    trig.style.cssText = 'display:flex; align-items:center; gap:10px; border:1px solid var(--border,#333); border-radius:12px; padding:8px 10px; cursor:pointer; background:var(--panel2,#101014);';
    const img = lookImg(g, styleEl.value, opt ? optLabel(opt) : '');
    img.style.cssText = 'width:44px; height:58px; object-fit:cover; border-radius:8px; background:linear-gradient(160deg,#23232a,#101014); flex:none;';
    const info = document.createElement('div');
    info.style.cssText = 'flex:1; min-width:0;';
    const nm = document.createElement('div');
    nm.textContent = opt ? optLabel(opt) : '';
    nm.style.cssText = 'font-size:13.5px; font-weight:700;';
    const sub = document.createElement('div');
    sub.textContent = list.length + ' ' + ((typeof window.t === 'function' && window.t('pickerStylesForCategory') !== 'pickerStylesForCategory') ? window.t('pickerStylesForCategory') : (bT('نمطًا لهذه الفئة','styles for this category')));
    sub.style.cssText = 'font-size:11px; color:var(--muted,#999);';
    info.appendChild(nm); info.appendChild(sub);
    const all = document.createElement('span');
    all.textContent = (typeof window.t === 'function' && window.t('portraitStyleBrowseAll') !== 'portraitStyleBrowseAll') ? window.t('portraitStyleBrowseAll') : (bT('عرض الكل ›','Browse all ›'));
    all.style.cssText = 'color:#d4af37; font-size:12.5px; font-weight:700; flex:none;';
    trig.appendChild(img); trig.appendChild(info); trig.appendChild(all);
    trig.onclick = openFashionPicker;
    styleCardsEl.appendChild(trig);
  }
  renderStyleCards();
  // تبديل الفئة (نسائي/رجالي/أطفال) يعيد رسم البطاقات وصفّ المقارنة بصور الفئة.
  window.addEventListener('fashion-gender-change', function(){ renderStyleCards(); buildCompareChecks(); });

  /* ---- 👤 saved measurements profile ---- */
  const PROFILE_KEY = 'aiapp_fashion_profile';
  function loadProfile(){
    try{ return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); }catch(e){ return {}; }
  }
  function fillProfileInputs(){
    const p = loadProfile();
    if(profileHeightEl) profileHeightEl.value = p.height || '';
    if(profileWeightEl) profileWeightEl.value = p.weight || '';
    if(profileSkinEl) profileSkinEl.value = p.skin || '';
    if(profileHairEl) profileHairEl.value = p.hair || '';
  }
  fillProfileInputs();
  if(profileSaveBtn) profileSaveBtn.onclick = () => {
    const p = {
      height: profileHeightEl.value.trim(),
      weight: profileWeightEl.value.trim(),
      skin: profileSkinEl.value.trim(),
      hair: profileHairEl.value.trim(),
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    setStatus(t('fashionProfileSaved'));
  };

  /* ---- ❤️ favorites ---- */
  const FAV_KEY = 'aiapp_fashion_favorites';
  function loadFavorites(){
    try{ return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }catch(e){ return []; }
  }
  function saveFavorite(dataUrl, styleLabel){
    const favs = loadFavorites();
    favs.unshift({ img: dataUrl, style: styleLabel || '', ts: Date.now() });
    localStorage.setItem(FAV_KEY, JSON.stringify(favs.slice(0, 30)));
  }
  function renderFavorites(){
    const favs = loadFavorites();
    favoritesPanel.innerHTML = '';
    if(!favs.length){
      favoritesPanel.innerHTML = '<p style="font-size:12px; color:var(--muted,#999); text-align:center;">' + t('fashionNoFavorites') + '</p>';
      return;
    }
    favs.forEach((f, idx) => {
      const card = document.createElement('div');
      card.style.cssText = 'display:flex; align-items:center; gap:8px; border:1px solid var(--border,#333); border-radius:8px; padding:6px;';
      card.innerHTML = '<img src="' + f.img + '" style="width:50px; height:50px; object-fit:cover; border-radius:6px;">' +
        '<span style="flex:1; font-size:11.5px; color:var(--muted,#999);">' + (f.style || '') + '</span>' +
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
    saveFavorite(resultEl.src, styleEl.value);
    favSaveBtn.textContent = t('fashionFavoriteSaved');
    setTimeout(() => { favSaveBtn.textContent = t('fashionFavoriteSaveBtn'); }, 1800);
  };

  /* ---- 🔄 before/after slider ---- */
  function setupBeforeAfter(afterUrl){
    /* v-no-slider (أمر المالك): لا شريط مقارنة قبل/بعد */
    beforeWrap.style.display = 'none';
    sliderRange.style.display = 'none';
    if(true) return;
    if(mode !== 'image' || !selectedBase64){
      beforeWrap.style.display = 'none';
      sliderRange.style.display = 'none';
      return;
    }
    beforeImg.src = 'data:' + selectedMime + ';base64,' + selectedBase64;
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

  /* ---- 📊 v-fashion-compare-cards: صفّ مقارنة يُسحب باليد — بطاقات صور بلا
     كتابة، اختيار حتى ٣ بعلامة ✓ ذهبية. مربّعات الاختيار باقية مخفيّة فقارئ
     زرّ المقارنة (.fashionCompareCheck:checked) كما هو بلا أي تغيير. ---- */
  function buildCompareChecks(){
    if(!compareChecksEl) return;
    const g = currentGender();
    compareChecksEl.innerHTML = '';
    compareChecksEl.style.cssText = 'display:flex; gap:8px; overflow-x:auto; padding-bottom:6px; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch;';
    (GENDER_STYLES[g] || GENDER_STYLES.women).forEach(function(v){
      const opt = Array.prototype.find.call(styleEl.options, function(o){ return o.value === v; });
      if(!opt) return;
      const wrap = document.createElement('div');
      wrap.setAttribute('data-compare-card', v);
      wrap.style.cssText = 'position:relative; flex:0 0 31%; min-width:104px; aspect-ratio:2/3; border-radius:12px; overflow:hidden; cursor:pointer; scroll-snap-align:start;' +
        ' background:linear-gradient(160deg,#23232a,#101014); border:1px solid var(--border,#333);';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'fashionCompareCheck'; cb.value = v;
      cb.style.display = 'none';
      const tick = document.createElement('div');
      tick.textContent = '✓';
      tick.style.cssText = 'position:absolute; top:6px; inset-inline-end:6px; width:22px; height:22px; border-radius:50%; background:#d4af37; color:#141414;' +
        ' font-weight:800; font-size:14px; display:none; align-items:center; justify-content:center; z-index:2;';
      const label = document.createElement('div');
      label.textContent = optLabel(opt);
      label.style.cssText = 'position:absolute; left:0; right:0; bottom:0; padding:14px 6px 6px; font-size:11px; font-weight:700; text-align:center; color:#eef0f6;' +
        ' background:linear-gradient(transparent,rgba(0,0,0,.82));';
      function paint(){
        tick.style.display = cb.checked ? 'flex' : 'none';
        wrap.style.border = cb.checked ? '2px solid #d4af37' : '1px solid var(--border,#333)';
        wrap.style.boxShadow = cb.checked ? '0 0 12px rgba(212,175,55,.35)' : 'none';
      }
      wrap.onclick = function(){
        if(!cb.checked && compareChecksEl.querySelectorAll('.fashionCompareCheck:checked').length >= 3) return; // الحد ٣
        cb.checked = !cb.checked; paint();
      };
      wrap.appendChild(lookImg(g, v, opt.textContent));
      wrap.appendChild(tick); wrap.appendChild(label); wrap.appendChild(cb);
      compareChecksEl.appendChild(wrap);
    });
  }
  buildCompareChecks();

  let mode = 'image';
  let selectedBase64 = '';
  let selectedMime = 'image/jpeg';

  function setMode(next){
    mode = next;
    if(mode === 'image'){
      tabImage.classList.add('primary');
      tabText.classList.remove('primary');
      imagePane.style.display = 'block';
      textPane.style.display = 'none';
    } else {
      tabText.classList.add('primary');
      tabImage.classList.remove('primary');
      imagePane.style.display = 'none';
      textPane.style.display = 'block';
    }
  }
  tabImage.onclick = () => setMode('image');
  tabText.onclick = () => setMode('text');

  btnOpen.onclick = () => {
    modal.style.display = 'flex';
    renderStyleCards(); // تسميات الترجمة قد تكون تغيّرت بعد التهيئة
    /* v651: صفّ «قارن بين الإطلالات» كان يتجمّد على الإنجليزيّة لنفس السبب. */
    try { buildCompareChecks(); } catch(_e651) { /* guard-ok: rebuilding the compare row is cosmetic — a failure must never block opening the modal. */ }
    closeHeaderMenu();
  };
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  if(fileBtn) fileBtn.onclick = (e) => { e.stopPropagation(); fileInput.click(); };
  const dropZone = $('#fashionAiDropZone');
  if(dropZone){
    dropZone.onclick = () => fileInput.click();
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.background = 'rgba(212,175,55,.1)'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.background = 'rgba(212,175,55,.04)'; });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault(); dropZone.style.background = 'rgba(212,175,55,.04)';
      try{ if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){ fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change', { bubbles: true })); } }catch(_){ fileInput.click(); }
    });
  }

  fileInput.onchange = () => {
    const file = fileInput.files && fileInput.files[0];
    if(!file) return;
    selectedMime = 'image/jpeg';
    if(fileNameEl) fileNameEl.textContent = file.name;
    __compressImg(file, function(dataUrl){
      selectedBase64 = dataUrl.split(',')[1] || '';
      sourcePreview.src = dataUrl;
      sourcePreview.style.display = 'block';
    });
  };

  btnGenerate.onclick = async () => {
    if(mode === 'image' && !selectedBase64){
      setStatus(t('fashionAiNeedImage'));
      return;
    }
    if(mode === 'text' && !descriptionEl.value.trim()){
      setStatus(t('fashionAiNeedDescription'));
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){
      setStatus(t('fashionAiNeedLogin'));
      return;
    }

    btnGenerate.disabled = true;
    /* v-fashion-show: الحاوية fashionAiResultWrap كانت تبقى display:none —
       الصورة تتولد وتختفي داخلها («الصور ما تطلع»). تُدار مع الصورة معًا. */
    if(resultWrap) resultWrap.style.display = 'none';
    resultEl.style.display = 'none';
    downloadEl.style.display = 'none';
    favSaveBtn.style.display = 'none';
    beforeWrap.style.display = 'none';
    sliderRange.style.display = 'none';
    setStatus(t('fashionAiGenerating'));

    try{
      const __engineEl = $('#fashionAiEngine');
      window.__fashionEngine = (__engineEl && __engineEl.value) || '';
      const payload = { mode, style: styleEl.value, token, multiAngle: !!multiAngleEl.checked, engine: window.__fashionEngine };
      try{ if(window.omranFashionExtras) Object.assign(payload, window.omranFashionExtras()); }catch(err){ console.warn('[fashion] extras merge failed:', err); }
      if(mode === 'image'){
        payload.imageBase64 = selectedBase64;
        payload.mimeType = selectedMime;
      } else {
        payload.description = descriptionEl.value.trim();
      }
      const res = await fetch('/api/fashion-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await __safeJson(res);
      if(!res.ok || data.error){
        if(data.error === 'auth_required'){ setStatus(t('fashionAiNeedLogin')); return; }
        if(data.error === 'daily_limit_reached'){ setStatus(t('fashionAiLimitReached')); return; }
        throw new Error(data.error || 'unknown');
      }
      const dataUrl = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
      resultEl.src = dataUrl;
      if(resultWrap) resultWrap.style.display = 'block'; /* v-fashion-show */
      resultEl.style.display = 'block';
      try{ resultEl.scrollIntoView({ behavior:'smooth', block:'center' }); }catch(err){ __swallow(err, 'fashion:scroll'); }
      downloadEl.href = dataUrl;
      downloadEl.style.display = 'block';
      favSaveBtn.style.display = 'block';
      favSaveBtn.textContent = t('fashionFavoriteSaveBtn');
      setupBeforeAfter(dataUrl);
      /* v-fashion-refine: احفظ النتيجة كمصدر للتعديل الموضعي وأظهر صفّه */
      __refineRemember(data.imageBase64, data.mimeType || 'image/png');
      setStatus(t('fashionAiDone'));
    } catch(e){
      setStatus((bT('❌ خطأ: ','❌ Error: ')) + (e && e.message ? e.message : String(e)));
    } finally {
      btnGenerate.disabled = false;
    }
  };

  /* ---- ✏️ v-fashion-refine (شكوى المالك ٢٩ أغسطس): تعديل شيء محدد على
     النتيجة نفسها بدل إعادة توليد اللوك كاملًا — النتيجة الأخيرة تُرسل
     كمصدر مع طلب التعديل، والسيرفر يقفل كل ما عداه. ---- */
  let __lastFxB64 = null, __lastFxMime = 'image/png';
  const __gt2 = (k, arFb, enFb) => {
    try{ if(typeof window.t === 'function'){ const v = window.t(k); if(v && v !== k) return v; } }catch(e){ /* المترجم لم يجهز */ }
    return isEn() ? enFb : arFb;
  };
  let refineRow = null, refineInput = null, refineBtn = null;
  function __buildRefineRow(){
    if(refineRow || !resultWrap) return;
    refineRow = document.createElement('div');
    refineRow.id = 'fashionRefineRow';
    refineRow.style.cssText = 'display:none; gap:8px; margin-top:10px; align-items:stretch;';
    refineInput = document.createElement('input');
    refineInput.id = 'fashionRefineInput';
    refineInput.type = 'text';
    refineInput.maxLength = 300;
    refineInput.style.cssText = 'flex:1 1 auto; min-width:0; padding:10px 12px; border-radius:12px; border:1px solid var(--border,#333); background:var(--panel2,#1b1b22); color:var(--text,#eee); font-family:inherit; font-size:13px;';
    refineBtn = document.createElement('button');
    refineBtn.id = 'fashionRefineBtn';
    refineBtn.type = 'button';
    refineBtn.className = 'btn';
    refineBtn.style.cssText = 'flex:0 0 auto; white-space:nowrap;';
    refineRow.appendChild(refineInput);
    refineRow.appendChild(refineBtn);
    resultWrap.appendChild(refineRow);
    refineBtn.onclick = __doRefine;
    refineInput.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); __doRefine(); } });
  }
  function __refineTexts(){
    if(!refineInput) return;
    refineInput.placeholder = __gt2('fashionRefinePh', 'مثال: غيّري لون الفستان إلى أزرق فقط', 'e.g. change only the dress colour to blue');
    refineBtn.textContent = __gt2('fashionRefineBtn', '✏️ عدّلي شيئًا محددًا', '✏️ Edit one specific thing');
  }
  function __refineRemember(b64, mime){
    __lastFxB64 = b64; __lastFxMime = mime;
    __buildRefineRow();
    __refineTexts();
    if(refineRow){ refineRow.style.display = 'flex'; refineInput.value = ''; }
  }
  async function __doRefine(){
    if(!__lastFxB64) return;
    const reqTxt = (refineInput.value || '').trim();
    if(!reqTxt){ setStatus(__gt2('fashionRefineNeed', 'اكتبي التعديل المطلوب أولًا', 'Type the change you want first')); refineInput.focus(); return; }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){ setStatus(t('fashionAiNeedLogin')); return; }
    refineBtn.disabled = true; btnGenerate.disabled = true;
    setStatus(__gt2('fashionRefining', 'جاري تطبيق التعديل…', 'Applying your edit…'));
    try{
      const res = await fetch('/api/fashion-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'refine', imageBase64: __lastFxB64, mimeType: __lastFxMime, editRequest: reqTxt, token, engine: window.__fashionEngine || '' }),
      });
      const data = await __safeJson(res);
      if(!res.ok || data.error){
        if(data.error === 'auth_required'){ setStatus(t('fashionAiNeedLogin')); return; }
        if(data.error === 'daily_limit_reached'){ setStatus(t('fashionAiLimitReached')); return; }
        throw new Error(data.error || 'unknown');
      }
      /* قبل/بعد: «قبل» تصير النتيجة السابقة نفسها ليتضح التعديل الموضعي */
      const prevUrl = 'data:' + __lastFxMime + ';base64,' + __lastFxB64;
      const dataUrl = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
      if(beforeImg){ beforeImg.src = prevUrl; }
      resultEl.src = dataUrl;
      downloadEl.href = dataUrl;
      __lastFxB64 = data.imageBase64; __lastFxMime = data.mimeType || 'image/png';
      refineInput.value = '';
      setStatus(t('fashionAiDone'));
    }catch(e){
      setStatus((bT('❌ خطأ: ','❌ Error: ')) + (e && e.message ? e.message : String(e)));
    }finally{
      refineBtn.disabled = false; btnGenerate.disabled = false;
    }
  }

  /* ---- 💡 suggest a look ---- */
  if(suggestBtn) suggestBtn.onclick = async () => {
    if(mode === 'image' && !selectedBase64 && !descriptionEl.value.trim()){
      setStatus(t('fashionSuggestNeedImage'));
      return;
    }
    if(mode === 'text' && !descriptionEl.value.trim()){
      setStatus(t('fashionSuggestNeedImage'));
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){ setStatus(t('fashionAiNeedLogin')); return; }

    suggestBtn.disabled = true;
    suggestionsEl.style.display = 'none';
    suggestionsEl.innerHTML = '';
    setStatus(t('fashionSuggestGenerating'));
    try{
      const payload = {
        occasion: occasionEl.value, season: seasonEl.value,
        profile: loadProfile(), lang: lang7(), token,
      };
      if(mode === 'image' && selectedBase64){
        payload.imageBase64 = selectedBase64;
        payload.mimeType = selectedMime;
      } else {
        payload.description = descriptionEl.value.trim();
      }
      const res = await fetch('/api/fashion-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await __safeJson(res);
      if(!res.ok || data.error){
        if(data.error === 'auth_required'){ setStatus(t('fashionAiNeedLogin')); return; }
        throw new Error(data.error || 'unknown');
      }
      const list = data.suggestions || [];
      list.forEach(s => {
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid var(--border,#333); border-radius:10px; padding:10px;';
        card.innerHTML =
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
            '<strong style="font-size:13px;">' + (s.title || '') + '</strong>' +
            '<span style="font-size:11.5px; color:#4ade80;">' + t('fashionMatchLabel') + ': ' + s.matchPercent + '%</span>' +
          '</div>' +
          '<p style="font-size:12px; color:var(--muted,#999); margin:6px 0 2px;">' + (s.clothing || '') + '</p>' +
          '<p style="font-size:12px; color:var(--muted,#999); margin:2px 0;">🎨 ' + (s.colors || '') + '</p>' +
          '<p style="font-size:12px; color:var(--muted,#999); margin:2px 0 8px;">👜 ' + (s.accessories || '') + '</p>' +
          '<button type="button" class="btn primary useLookBtn" style="width:100%; font-size:12px; padding:5px;">' + t('fashionUseThisLook') + '</button>';
        card.querySelector('.useLookBtn').onclick = () => {
          if(mode === 'text' || !selectedBase64){
            setMode('text');
            descriptionEl.value = (s.clothing || '') + '. ' + (s.colors ? ('Colors: ' + s.colors + '. ') : '') + (s.accessories ? ('Accessories: ' + s.accessories) : '');
          }
        };
        suggestionsEl.appendChild(card);
      });
      suggestionsEl.style.display = list.length ? 'flex' : 'none';
      setStatus(list.length ? '' : t('fashionSuggestNeedImage'));
    } catch(e){
      setStatus((bT('❌ خطأ: ','❌ Error: ')) + (e && e.message ? e.message : String(e)));
    } finally {
      suggestBtn.disabled = false;
    }
  };

  /* ---- 📊 compare 2-3 looks ---- */
  if(compareBtn) compareBtn.onclick = async () => {
    const checks = Array.from(compareChecksEl.querySelectorAll('.fashionCompareCheck:checked')).map(c => c.value);
    if(checks.length < 2){
      compareStatusEl.style.display = 'block';
      compareStatusEl.textContent = t('fashionCompareNeedTwo');
      return;
    }
    const checkedCount = Math.min(checks.length, 3);
    const stylesToRun = checks.slice(0, 3);
    if(mode === 'image' && !selectedBase64){
      setStatus(t('fashionAiNeedImage'));
      return;
    }
    if(mode === 'text' && !descriptionEl.value.trim()){
      setStatus(t('fashionAiNeedDescription'));
      return;
    }
    const token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : null;
    if(!token){ setStatus(t('fashionAiNeedLogin')); return; }

    compareBtn.disabled = true;
    compareResultsEl.style.display = 'none';
    compareResultsEl.innerHTML = '';
    compareStatusEl.style.display = 'block';
    compareStatusEl.textContent = t('fashionCompareGenerating');

    try{
      const results = await Promise.all(stylesToRun.map(async (styleVal) => {
        // v-fashion-locks: fairness يفعّل قفل عدالة المقارنة في الخادم —
        // نفس الاستوديو والإضاءة والوقفة في كل الخيارات، فتُقارن الملابس لا الإضاءة.
        const payload = { mode, style: styleVal, token, multiAngle: false, fairness: true, engine: (($('#fashionAiEngine') || {}).value) || '' };
        try{ if(window.omranFashionExtras) Object.assign(payload, window.omranFashionExtras()); }catch(err){ console.warn('[fashion] extras merge failed:', err); }
        if(mode === 'image'){ payload.imageBase64 = selectedBase64; payload.mimeType = selectedMime; }
        else { payload.description = descriptionEl.value.trim(); }
        try{
          const res = await fetch('/api/fashion-create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
          const data = await __safeJson(res);
          if(!res.ok || data.error) return { styleVal, error: data.error || 'unknown' };
          return { styleVal, dataUrl: 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64 };
        } catch(e){
          return { styleVal, error: e.message };
        }
      }));
      // v-fashion-cards: بطاقات المقارنة بشكل التصميم المعتمد — تسمية أ/ب/ج،
      // اختيار بإطار ذهبي، والمختارة تصير النتيجة الرئيسية القابلة للتحميل.
      const AR_LABELS = ['أ', 'ب', 'ج'];
      results.forEach((r, ri) => {
        const cell = document.createElement('div');
        cell.style.cssText = 'position:relative; border:1.5px solid var(--border,#333); border-radius:14px; padding:6px; text-align:center; cursor:pointer; transition:border-color .15s, box-shadow .15s;';
        if(r.dataUrl){
          const label = (styleEl.querySelector('option[value="' + r.styleVal + '"]') || {}).textContent || r.styleVal;
          cell.innerHTML = '<span style="position:absolute; top:12px; inset-inline-end:12px; z-index:2; background:rgba(0,0,0,.65); color:#eef0f6; font-weight:700; font-size:12.5px; border-radius:6px; padding:2px 8px;">' + AR_LABELS[ri] + '</span>'
            + '<img src="' + r.dataUrl + '" style="width:100%; border-radius:10px; background:#000;">'
            + '<p style="font-size:11.5px; color:var(--muted,#999); margin:6px 0 2px;">' + label + '</p>'
            + '<p class="fashionPickHint" style="font-size:11.5px; color:#d4af37; margin:0 0 4px;">اضغطي للاختيار ✓</p>';
          cell.onclick = () => {
            compareResultsEl.querySelectorAll(':scope > div').forEach(c => { c.style.borderColor = 'var(--border,#333)'; c.style.boxShadow = 'none'; const h = c.querySelector('.fashionPickHint'); if(h) h.textContent = 'اضغطي للاختيار ✓'; });
            cell.style.borderColor = '#d4af37';
            cell.style.boxShadow = '0 8px 22px -12px rgba(212,175,55,.55)';
            const h = cell.querySelector('.fashionPickHint'); if(h) h.textContent = '✓ اختيارك';
            resultEl.src = r.dataUrl; if(resultWrap) resultWrap.style.display = 'block'; resultEl.style.display = 'block'; /* v-fashion-show */
            downloadEl.href = r.dataUrl; downloadEl.style.display = 'block';
            favSaveBtn.style.display = 'block';
          };
        } else {
          cell.innerHTML = '<p style="font-size:11.5px; color:#f87171;">❌ ' + (r.error || '') + '</p>';
        }
        compareResultsEl.appendChild(cell);
      });
      compareResultsEl.style.display = 'grid';
      compareStatusEl.style.display = 'none';
    } catch(e){
      compareStatusEl.textContent = (bT('❌ خطأ: ','❌ Error: ')) + (e && e.message ? e.message : String(e));
    } finally {
      compareBtn.disabled = false;
    }
  };
})();

/* ---------- 🕌 Religious Insights (verse tafsir / hadith / dream interpretation, text via Gemini) ---------- */
(function(){
  const modal = $('#religionModal');
  const btnOpen = $('#btnReligion');
  const btnClose = $('#religionCloseBtn');
  const btnGenerate = $('#religionGenerateBtn');
  const tabsWrap = $('#religionTabs');
  const inputLabelEl = $('#religionInputLabel');
  const inputEl = $('#religionInput');
  const statusEl = $('#religionStatus');
  const resultEl = $('#religionResult');
  if(!modal || !btnOpen) return;

  let tool = 'verse';

  const SYSTEM_PROMPTS = {
    verse: 'أنت عالم متخصص في تفسير القرآن الكريم. عند إعطائك آية أو اسم سورة ورقم آية، اشرحها بعمق ودقة معتمدًا على أشهر كتب التفسير المعتبرة (تفسير ابن كثير، تفسير الطبري، تفسير السعدي، تفسير القرطبي). اذكر: 1) نص الآية كاملة، 2) سبب النزول إن وجد، 3) المعنى الإجمالي، 4) أهم الفوائد والدروس المستفادة. اكتب بأسلوب واضح ومنظم بعناوين. اختم دائمًا بجملة: "هذا اجتهاد بشري في نقل التفسير المعتمد وليس فتوى شخصية، راجع أهل العلم للتأكد." أجب بنفس لغة سؤال المستخدم.',
    hadith: 'أنت باحث متخصص في الحديث النبوي الشريف. عند إعطائك نص حديث أو موضوعًا، ابحث في معرفتك عن الحديث الأقرب لذلك من الكتب الصحيحة المعتبرة (صحيح البخاري، صحيح مسلم، سنن أبي داود، الترمذي، النسائي، ابن ماجه). اذكر: 1) نص الحديث كاملًا إن استطعت، 2) الراوي ومصدر التخريج، 3) درجة الحديث (صحيح/حسن/ضعيف) بحسب ما هو معروف ومشهور، 4) الشرح والمعنى، 5) الفوائد والأحكام المستفادة. إذا لم تكن متأكدًا من درجة الحديث بدقة تامة، وضّح ذلك صراحة وانصح بالرجوع لموقع الدرر السنية أو مختص. أجب بنفس لغة سؤال المستخدم.',
    dream: 'أنت مفسر أحلام موسوعي متعمق يجمع بين كل الثقافات والأديان. عند إعطائك وصف حلم، قدّم تفسيرًا قويًا وعميقًا ومفصلاً (وليس سطحيًا) من زوايا متعددة، كل زاوية بعنوان واضح: 1) ☪️ التفسير الإسلامي (استنادًا لمنهج ابن سيرين والنابلسي، مع ربط الرموز بمعانيها التقليدية)، 2) ✝️ التفسير المسيحي (استنادًا لتفسيرات الكتاب المقدس والتقليد الكنسي لرموز الأحلام كيوسف ودانيال)، 3) ✡️ التفسير اليهودي (التلمود وتفسيرات الحاخامات التقليدية)، 4) 🕉️ التفسير الهندوسي/البوذي (المعاني الروحية والكارما والرموز الشرقية)، 5) 🧠 علم النفس الحديث (تحليل فرويد ويونغ للرموز واللاوعي والأرشيتايبس)، 6) 🌍 الرمزية الثقافية العامة المتعارف عليها عالميًا. حلل كل رمز رئيسي ذكره المستخدم في حلمه (الألوان، الحيوانات، الأماكن، الأفعال) بعمق داخل كل قسم. اختم بخلاصة عامة تجمع أهم المعاني المشتركة. أجب بنفس لغة سؤال المستخدم، وكن مفصلاً وغنيًا وليس مختصرًا.',
  };

  function setStatus(text){
    statusEl.style.display = text ? 'block' : 'none';
    statusEl.textContent = text || '';
  }

  function setTool(next){
    tool = next;
    tabsWrap.querySelectorAll('.religionTabBtn').forEach(b => b.classList.toggle('active', b.dataset.tool === next));
    const labelKey = 'religionInputLabel' + next.charAt(0).toUpperCase() + next.slice(1);
    const placeholderKey = 'religionInputPlaceholder' + next.charAt(0).toUpperCase() + next.slice(1);
    if(inputLabelEl) inputLabelEl.textContent = t(labelKey);
    if(inputEl) inputEl.setAttribute('placeholder', t(placeholderKey));
    resultEl.style.display = 'none';
    resultEl.textContent = '';
    setStatus('');
  }

  tabsWrap.addEventListener('click', (e) => {
    const b = e.target.closest('.religionTabBtn');
    if(!b) return;
    setTool(b.dataset.tool);
  });

  btnOpen.addEventListener('click', () => {
    modal.style.display = 'flex';
    setTool(tool);
    if(typeof closeHeaderMenu === 'function') closeHeaderMenu();
  });
  btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  btnGenerate.addEventListener('click', async () => {
    const query = (inputEl.value || '').trim();
    if(!query){ setStatus(t('religionNeedInput')); return; }
    btnGenerate.disabled = true;
    setStatus(t('religionGenerating'));
    resultEl.style.display = 'block';
    resultEl.textContent = '';
    try{
      const messages = [
        { role: 'system', content: SYSTEM_PROMPTS[tool] },
        { role: 'user', content: query },
      ];
      const onDelta = (partial) => { resultEl.textContent = partial; };
      /* v-religion-rescue: كانت مربوطة بمزوّد واحد (Gemini) — أول 429 يميت
         الأداة كلها (لقطة المالك). الآن سلسلة الاحتياط الكاملة: أي مزوّد
         مشحون واحد يبقيها حيّة. */
      const res = await callAIWithFallback(messages, onDelta);
      resultEl.textContent = (res && res.reply) || '';
      setStatus(t('religionDone'));
    }catch(e){
      setStatus(t('religionError') + (e && e.message ? (': ' + e.message) : ''));
    }finally{
      btnGenerate.disabled = false;
    }
  });
})();

/* ---------- 📧 AI Email Assistant (Gmail connect, priority + language-matched drafts, approve-to-send) ---------- */
(function(){
  const modal = $('#emailAssistModal');
  const btnOpen = $('#btnEmailAssist');
  const btnClose = $('#emailAssistCloseBtn');
  const connectBox = $('#emailAssistConnectBox');
  const connectedBox = $('#emailAssistConnectedBox');
  const connectBtn = $('#emailAssistConnectBtn');
  const refreshBtn = $('#emailAssistRefreshBtn');
  const gmailLabel = $('#emailAssistGmailLabel');
  const statusEl = $('#emailAssistStatus');
  const listEl = $('#emailAssistList');
  const voiceBtn = $('#emailAssistVoiceBtn');
  let lastLoadedEmails = [];
  let emailSummaryAudio = null;
  if(!modal || !btnOpen) return;

  const en = () => (localStorage.getItem('aiapp_lang') === 'en');
  const T = () => ({
    connectText: t('emailAsst_connectText'),
    connectBtn: t('emailAsst_connectBtn'),
    disclaimer: t('emailAsst_disclaimer'),
    title: t('emailAsst_title'),
    refresh: t('emailAsst_refresh'),
    loading: t('emailAsst_loading'),
    empty: t('emailAsst_empty'),
    notConnected: t('emailAsst_notConnected'),
    send: t('emailAsst_send'),
    ignore: t('emailAsst_ignore'),
    sending: t('emailAsst_sending'),
    sent: t('emailAsst_sent'),
    ignored: t('emailAsst_ignored'),
    error: t('emailAsst_error'),
    voiceBtn: t('emailAsst_voiceBtn'),
    addToCalendar: t('emailAsst_addToCalendar'),
    addingEvent: t('emailAsst_addingEvent'),
    eventAdded: t('emailAsst_eventAdded'),
    calReauth: t('emailAsst_calReauth'),
    voiceLoading: t('emailAsst_voiceLoading'),
    voiceEmpty: t('emailAsst_voiceEmpty'),
    urgent: t('emailAsst_urgent'),
    normal: t('emailAsst_normal'),
    low: t('emailAsst_low'),
  });

  function setStatus(text){
    statusEl.style.display = text ? 'block' : 'none';
    statusEl.textContent = text || '';
  }

  function priorityLabel(p){
    const tr = T();
    return p === 'urgent' ? tr.urgent : (p === 'low' ? tr.low : tr.normal);
  }

  function extractEmailAddress(fromHeader){
    const m = String(fromHeader || '').match(/<([^>]+)>/);
    return m ? m[1] : String(fromHeader || '').trim();
  }

  function renderEmails(emails){
    const tr = T();
    listEl.innerHTML = '';
    if(!emails || !emails.length){
      listEl.innerHTML = '<div style="text-align:center; font-size:13px; color:var(--muted,#999); padding:20px 0;">' + tr.empty + '</div>';
      return;
    }
    emails.forEach((mail) => {
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--panel2,#111); border:1px solid var(--border,#333); border-radius:10px; padding:12px;';
      card.innerHTML =
        '<div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">' +
          '<div style="min-width:0;">' +
            '<div style="font-size:12.5px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + (mail.subject || '').replace(/</g,'&lt;') + '</div>' +
            '<div style="font-size:11.5px; color:var(--muted,#999); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + (mail.from || '').replace(/</g,'&lt;') + '</div>' +
          '</div>' +
          '<span style="font-size:11.5px; white-space:nowrap;">' + priorityLabel(mail.priority) + '</span>' +
        '</div>' +
        '<div style="font-size:12px; color:var(--muted,#999); margin-top:6px;">' + (mail.snippet || '').replace(/</g,'&lt;') + '</div>' +
        '<textarea class="emailDraftInput" rows="4" style="width:100%; margin-top:8px; resize:vertical; font-size:13px;">' + (mail.draft || '') + '</textarea>' +
        '<div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">' +
          '<button type="button" class="btn primary emailSendBtn" style="flex:1; min-width:110px;">' + tr.send + '</button>' +
          '<button type="button" class="btn emailIgnoreBtn" style="flex:1; min-width:110px;">' + tr.ignore + '</button>' +
          (mail.meeting ? '<button type="button" class="btn emailCalBtn" style="flex:1; min-width:110px;">' + tr.addToCalendar + '</button>' : '') +
        '</div>' +
        (mail.meeting ? '<div style="font-size:11.5px; color:var(--muted,#999); margin-top:6px;">📅 ' + String(mail.meeting.title || '').replace(/</g,'&lt;') + ' — ' + String(mail.meeting.start || '').replace('T', ' ') + '</div>' : '') +
        '<div class="emailCardStatus" style="display:none; font-size:12px; margin-top:6px; text-align:center;"></div>';

      const sendBtn = card.querySelector('.emailSendBtn');
      const ignoreBtn = card.querySelector('.emailIgnoreBtn');
      const draftEl = card.querySelector('.emailDraftInput');
      const cardStatus = card.querySelector('.emailCardStatus');
      const calBtn = card.querySelector('.emailCalBtn');

      if(calBtn) calBtn.addEventListener('click', async () => {
        calBtn.disabled = true;
        cardStatus.style.display = 'block';
        cardStatus.textContent = tr.addingEvent;
        try{
          const token = localStorage.getItem('aiapp_auth_token');
          const r = await fetch('/api/email-calendar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, title: mail.meeting.title, start: mail.meeting.start, durationMin: mail.meeting.durationMin || 60, description: (mail.subject || '') + '\n' + (mail.from || '') }),
          });
          const d = await r.json();
          if(!r.ok){
            if(d && d.needsReauth) throw new Error(tr.calReauth);
            throw new Error((d && d.error) || 'calendar failed');
          }
          cardStatus.textContent = tr.eventAdded;
          calBtn.textContent = tr.eventAdded;
        }catch(e){
          cardStatus.textContent = tr.error + (e && e.message ? e.message : String(e));
          calBtn.disabled = false;
        }
      });

      sendBtn.addEventListener('click', async () => {
        const text = (draftEl.value || '').trim();
        if(!text) return;
        sendBtn.disabled = true; ignoreBtn.disabled = true;
        cardStatus.style.display = 'block';
        cardStatus.textContent = tr.sending;
        try{
          const token = localStorage.getItem('aiapp_auth_token');
          const r = await fetch('/api/email-send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, threadId: mail.threadId, to: extractEmailAddress(mail.from), subject: mail.subject, text, messageIdHeader: mail.messageIdHeader }),
          });
          const d = await r.json();
          if(!r.ok) throw new Error(d.error || 'send failed');
          cardStatus.textContent = tr.sent;
          setTimeout(() => { card.remove(); }, 1200);
        }catch(e){
          cardStatus.textContent = tr.error + (e && e.message ? e.message : String(e));
          sendBtn.disabled = false; ignoreBtn.disabled = false;
        }
      });

      ignoreBtn.addEventListener('click', async () => {
        sendBtn.disabled = true; ignoreBtn.disabled = true;
        cardStatus.style.display = 'block';
        try{
          const token = localStorage.getItem('aiapp_auth_token');
          const pattern = extractEmailAddress(mail.from);
          const r = await fetch('/api/email-ignore', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, pattern }),
          });
          const d = await r.json();
          if(!r.ok) throw new Error(d.error || 'ignore failed');
          cardStatus.textContent = tr.ignored;
          setTimeout(() => { card.remove(); }, 1000);
        }catch(e){
          cardStatus.textContent = tr.error + (e && e.message ? e.message : String(e));
          sendBtn.disabled = false; ignoreBtn.disabled = false;
        }
      });

      listEl.appendChild(card);
    });
  }

  async function loadEmails(){
    const tr = T();
    setStatus(tr.loading);
    listEl.innerHTML = '';
    try{
      const token = localStorage.getItem('aiapp_auth_token');
      const r = await fetch('/api/email-list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, lang: (typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar' }),
      });
      const d = await r.json();
      if(!r.ok){
        if(d.notConnected || /invalid_grant/i.test(String(d.error || ''))){
          connectBox.style.display = 'block';
          connectedBox.style.display = 'none';
          setStatus(d.notConnected ? '' : T().notConnected);
          return;
        }
        throw new Error(d.error || 'load failed');
      }
      gmailLabel.textContent = d.gmailAddress || '';
      // v-email-scope: الخادم يشرح نطاق ما عرضه (أو أن الوارد فارغ) بدل الصمت.
      setStatus(d.note || '');
      lastLoadedEmails = d.emails || [];
      renderEmails(d.emails);
    }catch(e){
      setStatus(tr.error + (e && e.message ? e.message : String(e)));
    }
  }

  function applyStaticText(){
    const tr = T();
    const setTxt = (sel, val) => { const el = $(sel); if(el) el.textContent = val; };
    setTxt('#emailAssistHeaderTitle', tr.title);
    setTxt('#emailAssistDisclaimer', tr.disclaimer);
    setTxt('#emailAssistConnectText', tr.connectText);
    if(connectBtn) connectBtn.textContent = tr.connectBtn;
    setTxt('#emailAssistRefreshLabel', tr.refresh);
    setTxt('#emailAssistVoiceLabel', tr.voiceBtn);
  }

  function buildEmailSummaryText(){
    const isEn = en();
    const emails = lastLoadedEmails || [];
    if(!emails.length) return '';
    const urgentOnes = emails.filter(m => m.priority === 'urgent');
    const senderName = (from) => String(from || '').replace(/<[^>]*>/g, '').replace(/["']/g, '').trim() || (isEn ? 'unknown sender' : 'مرسل غير معروف');
    let s;
    if(isEn){
      s = 'Hello! You have ' + emails.length + ' emails waiting. ';
      if(urgentOnes.length) s += urgentOnes.length + ' of them are urgent. ';
      emails.slice(0, 5).forEach((m, i) => {
        s += 'Email ' + (i + 1) + ': from ' + senderName(m.from) + ', subject: ' + (m.subject || 'no subject') + '. ';
      });
      if(emails.length > 5) s += 'Plus ' + (emails.length - 5) + ' more emails.';
    }else{
      s = 'هلا! عندك ' + emails.length + ' إيميلات بانتظارك. ';
      if(urgentOnes.length) s += 'منها ' + urgentOnes.length + ' عاجلة. ';
      emails.slice(0, 5).forEach((m, i) => {
        s += 'الإيميل ' + (i + 1) + ': من ' + senderName(m.from) + '، بخصوص: ' + (m.subject || 'بدون عنوان') + '. ';
      });
      if(emails.length > 5) s += 'وبعد عندك ' + (emails.length - 5) + ' إيميلات إضافية.';
    }
    return s;
  }

  if(voiceBtn) voiceBtn.addEventListener('click', async () => {
    const tr = T();
    if(emailSummaryAudio){ try{ emailSummaryAudio.pause(); }catch(e){ __swallow(e, "misc:app-12-studios#1"); } emailSummaryAudio = null; voiceBtn.style.opacity = ''; setStatus(''); return; }
    const text = buildEmailSummaryText();
    if(!text){ setStatus(tr.voiceEmpty); setTimeout(() => setStatus(''), 2500); return; }
    voiceBtn.disabled = true;
    setStatus(tr.voiceLoading);
    try{
      const resp = await fetch('/api/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: 'nova', text: text.slice(0, 4000) })
      });
      if(!resp.ok){ let msg = 'tts failed'; try{ const j = await resp.json(); if(j && j.error) msg = j.error; }catch(e){ __swallow(e, "misc:app-12-studios#2"); } throw new Error(msg); }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      emailSummaryAudio = new Audio(url);
      emailSummaryAudio.onended = () => { emailSummaryAudio = null; voiceBtn.style.opacity = ''; };
      voiceBtn.style.opacity = '0.6';
      setStatus('');
      await emailSummaryAudio.play();
    }catch(e){
      setStatus(tr.error + (e && e.message ? e.message : String(e)));
    }finally{
      voiceBtn.disabled = false;
    }
  });

  btnOpen.addEventListener('click', () => {
    modal.style.display = 'flex';
    applyStaticText();
    if(typeof closeHeaderMenu === 'function') closeHeaderMenu();
    const token = localStorage.getItem('aiapp_auth_token');
    if(!token){
      connectBox.style.display = 'block';
      connectedBox.style.display = 'none';
      return;
    }
    // Try loading directly — if not connected yet, loadEmails() will show the connect box.
    connectBox.style.display = 'none';
    connectedBox.style.display = 'block';
    loadEmails();
  });
  btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  connectBtn.addEventListener('click', () => {
    const token = localStorage.getItem('aiapp_auth_token');
    if(!token){
      modal.style.display = 'none';
      const authBtn = $('#btnAuthToggle');
      if(authBtn) authBtn.click();
      return;
    }
    /* v-email-start-server: الرابط كان يُبنى هنا بـ window.location.origin ومعرّف
       عميل مكتوب، بينما يبادل الخادم بـ SITE_URL ومعرّف البيئة — وجوجل تشترط
       تطابق redirect_uri حرفًا بحرف، فكان الربط يفشل («مساعد الإيميل لا يعمل»).
       الآن الخادم يبني الرابط بقيمه هو نفسها. (api/_lib/email-google-start.js) */
    const emStartUrl = '/api/system?action=email-google-start&state=' + encodeURIComponent(token);
    /* v-google-safari: داخل تطبيق الآيفون تفويض جوجل داخل الويب-فيو يفشل
       (نفس علة الدخول) — نفتح سفاري، والربط يُخزَّن في الخادم تحت حساب
       المستخدم فيظهر عند العودة والتحديث. */
    let emIosWrap = false;
    /* v-google-safari-2: الكشف بجسر كاباسيتور «bridge» — الغلاف الفعلي بلا جسور omran */
    try { emIosWrap = !!(window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : window.Capacitor.isNative)); } catch(e){ /* guard-ok */ }
    try { if(!emIosWrap){ const mh = window.webkit && window.webkit.messageHandlers; emIosWrap = !!(mh && (mh.bridge || mh.omranShare || mh.omranPdf)); } } catch(e){ /* guard-ok */ }
    if (emIosWrap) { window.open(location.origin + emStartUrl, '_blank'); return; }
    window.location.href = emStartUrl;
  });

  refreshBtn.addEventListener('click', loadEmails);

  // Handle the redirect back from /api/email-callback (?emailconnected=1 or ?emailerror=...)
  (function(){
    try{
      const params = new URLSearchParams(window.location.search);
      const connected = params.get('emailconnected');
      const err = params.get('emailerror');
      if(connected || err){
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        if(connected){
          setTimeout(() => { btnOpen.click(); }, 300);
        }
        if(err){
          setTimeout(() => { alert('⚠️ خطأ ربط Gmail: ' + err); }, 300);
        }
      }
    }catch(e){ /* ignore */ }
  })();
})();
