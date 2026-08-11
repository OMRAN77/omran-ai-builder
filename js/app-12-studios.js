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
  const downloadEl = $('#designAiDownloadLink');
  if(!modal || !btnOpen) return;

  function isEn(){ return localStorage.getItem('aiapp_lang') === 'en'; }
  function t(key){
    const dict = (typeof I18N !== 'undefined') ? I18N[isEn() ? 'en' : 'ar'] : null;
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
    closeHeaderMenu();
  };
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  if(fileBtn) fileBtn.onclick = () => fileInput.click();

  fileInput.onchange = () => {
    const file = fileInput.files && fileInput.files[0];
    if(!file) return;
    selectedFile = file;
    selectedMime = file.type || 'image/jpeg';
    if(fileNameEl) fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      selectedBase64 = dataUrl.split(',')[1] || '';
      sourcePreview.src = dataUrl;
      sourcePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
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

  btnGenerate.onclick = async () => {
    const placeVal = placeEl ? placeEl.value : '';
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
    resultEl.style.display = 'none';
    downloadEl.style.display = 'none';
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
      const data = await res.json();
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
          gridEl.appendChild(a);
        });
        setStatus(t('designAiDone'));
        return;
      }
      const dataUrl = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
      resultEl.src = dataUrl;
      resultEl.style.display = 'block';
      downloadEl.href = dataUrl;
      downloadEl.style.display = 'block';
      setStatus(t('designAiDone'));
    } catch(e){
      setStatus((isEn() ? '❌ Error: ' : '❌ خطأ: ') + (e && e.message ? e.message : String(e)));
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
      const data = await res.json();
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
})();

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
    };
  }
  if(styleEl){
    styleEl.addEventListener('change', refreshStarIcon);
    refreshFavGroup();
    refreshStarIcon();
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
      try{
        const dataUrl = resultEl.src;
        const resp = await fetch(dataUrl);
        const blob = await resp.blob();
        const file = new File([blob], 'omran-portrait-style.png', { type: blob.type || 'image/png' });
        if(navigator.canShare && navigator.canShare({ files: [file] })){
          await navigator.share({ files: [file], title: 'Omran AI', text: 'Omran AI ✨' });
        } else if(navigator.share){
          await navigator.share({ title: 'Omran AI', url: dataUrl });
        } else {
          downloadEl.click();
        }
      } catch(e){ /* user cancelled or unsupported, ignore */ }
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
  function t(key){
    const dict = (typeof I18N !== 'undefined') ? I18N[isEn() ? 'en' : 'ar'] : null;
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
    closeHeaderMenu();
  };
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  if(fileBtn) fileBtn.onclick = () => fileInput.click();

  fileInput.onchange = () => {
    const file = fileInput.files && fileInput.files[0];
    if(!file) return;
    selectedMime = file.type || 'image/jpeg';
    if(fileNameEl) fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      selectedBase64 = dataUrl.split(',')[1] || '';
      sourcePreview.src = dataUrl;
      sourcePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
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
      const data = await res.json();
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
          compareSlider.style.display = 'block';
          compareSlider.value = 50;
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
      setStatus((isEn() ? '❌ Error: ' : '❌ خطأ: ') + (e && e.message ? e.message : String(e)));
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
  function lang7(){ return (typeof currentLang === 'function') ? currentLang() : (localStorage.getItem('aiapp_lang') || 'ar'); }
  function t(key){
    const dict = (typeof window.__i18nDict === 'function') ? window.__i18nDict(lang7()) : ((typeof I18N !== 'undefined') ? I18N[lang7()] : null);
    return (dict && dict[key]) || key;
  }
  function setStatus(text){
    statusEl.style.display = text ? 'block' : 'none';
    statusEl.textContent = text || '';
  }

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

  /* ---- 📊 compare checkboxes (built from style options) ---- */
  function buildCompareChecks(){
    compareChecksEl.innerHTML = '';
    Array.from(styleEl.options).forEach(opt => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--muted,#999); border:1px solid var(--border,#333); border-radius:6px; padding:4px 8px; cursor:pointer;';
      label.innerHTML = '<input type="checkbox" class="fashionCompareCheck" value="' + opt.value + '"> ' + opt.textContent;
      compareChecksEl.appendChild(label);
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
    closeHeaderMenu();
  };
  btnClose.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });

  if(fileBtn) fileBtn.onclick = () => fileInput.click();

  fileInput.onchange = () => {
    const file = fileInput.files && fileInput.files[0];
    if(!file) return;
    selectedMime = file.type || 'image/jpeg';
    if(fileNameEl) fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      selectedBase64 = dataUrl.split(',')[1] || '';
      sourcePreview.src = dataUrl;
      sourcePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
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
    resultEl.style.display = 'none';
    downloadEl.style.display = 'none';
    favSaveBtn.style.display = 'none';
    beforeWrap.style.display = 'none';
    sliderRange.style.display = 'none';
    setStatus(t('fashionAiGenerating'));

    try{
      const payload = { mode, style: styleEl.value, token, multiAngle: !!multiAngleEl.checked };
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
      const data = await res.json();
      if(!res.ok || data.error){
        if(data.error === 'auth_required'){ setStatus(t('fashionAiNeedLogin')); return; }
        if(data.error === 'daily_limit_reached'){ setStatus(t('fashionAiLimitReached')); return; }
        throw new Error(data.error || 'unknown');
      }
      const dataUrl = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
      resultEl.src = dataUrl;
      resultEl.style.display = 'block';
      downloadEl.href = dataUrl;
      downloadEl.style.display = 'block';
      favSaveBtn.style.display = 'block';
      favSaveBtn.textContent = t('fashionFavoriteSaveBtn');
      setupBeforeAfter(dataUrl);
      setStatus(t('fashionAiDone'));
    } catch(e){
      setStatus((isEn() ? '❌ Error: ' : '❌ خطأ: ') + (e && e.message ? e.message : String(e)));
    } finally {
      btnGenerate.disabled = false;
    }
  };

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
      const data = await res.json();
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
      setStatus((isEn() ? '❌ Error: ' : '❌ خطأ: ') + (e && e.message ? e.message : String(e)));
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
        const payload = { mode, style: styleVal, token, multiAngle: false };
        try{ if(window.omranFashionExtras) Object.assign(payload, window.omranFashionExtras()); }catch(err){ console.warn('[fashion] extras merge failed:', err); }
        if(mode === 'image'){ payload.imageBase64 = selectedBase64; payload.mimeType = selectedMime; }
        else { payload.description = descriptionEl.value.trim(); }
        try{
          const res = await fetch('/api/fashion-create', {
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
      const reply = await callGemini(messages, onDelta);
      resultEl.textContent = reply;
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
    connectText: en() ? 'Connect your Gmail account so the AI can read your emails and suggest ready replies you approve before sending.' : 'اربط حساب Gmail الخاص بك ليقرأ الذكاء الاصطناعي إيميلاتك ويقترح ردودًا جاهزة تعتمدها قبل الإرسال.',
    connectBtn: en() ? '🔗 Connect Gmail' : '🔗 ربط Gmail',
    disclaimer: en() ? '⚠️ No reply is ever sent without your explicit approval on each message.' : '⚠️ لن يتم إرسال أي رد إلا بعد موافقتك الصريحة على كل رسالة.',
    title: en() ? '📧 AI Email Assistant' : '📧 مساعد البريد الذكي',
    refresh: en() ? 'Refresh' : 'تحديث',
    loading: en() ? 'Scanning your inbox…' : 'جارٍ فحص بريدك…',
    empty: en() ? 'No new emails need a reply right now.' : 'لا توجد إيميلات جديدة تحتاج ردًا الآن.',
    notConnected: en() ? 'Gmail is not connected, please reconnect.' : 'لم يتم ربط Gmail، يرجى إعادة الربط.',
    send: en() ? '✅ Send' : '✅ إرسال',
    ignore: en() ? '🚫 Ignore this sender' : '🚫 تجاهل هذا المرسل',
    sending: en() ? 'Sending…' : 'جارٍ الإرسال…',
    sent: en() ? '✅ Sent' : '✅ تم الإرسال',
    ignored: en() ? '🚫 Ignored — won\'t show again' : '🚫 تم التجاهل — لن يظهر مرة أخرى',
    error: en() ? '❌ Error: ' : '❌ خطأ: ',
    voiceBtn: en() ? 'Voice summary' : 'ملخص صوتي',
    addToCalendar: en() ? '📅 Add to Calendar' : '📅 أضف للتقويم',
    addingEvent: en() ? 'Adding event…' : 'جارٍ إضافة الموعد…',
    eventAdded: en() ? '✅ Added to your calendar' : '✅ انضاف لتقويمك',
    calReauth: en() ? 'Reconnect Gmail to allow calendar access' : 'أعد ربط Gmail للسماح بالوصول للتقويم',
    voiceLoading: en() ? '🔊 Preparing voice summary…' : '🔊 جارٍ تجهيز الملخص الصوتي…',
    voiceEmpty: en() ? 'No emails to summarize.' : 'لا توجد إيميلات لتلخيصها.',
    urgent: en() ? '🔴 Urgent' : '🔴 عاجل',
    normal: en() ? '🟡 Normal' : '🟡 عادي',
    low: en() ? '⚪ Low' : '⚪ منخفض',
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
        body: JSON.stringify({ token }),
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
      setStatus('');
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
    const clientId = '533765051685-2334rjfvu738sd2i50p7rb8gck1d00i2.apps.googleusercontent.com';
    const redirectUri = window.location.origin + '/api/email-callback';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
      state: token,
    });
    window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
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
