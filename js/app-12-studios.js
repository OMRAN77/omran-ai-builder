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
  btnGenerate.onclick = async () => {
    const placeVal = placeEl ? placeEl.value : '';
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
          notes: notesEl ? String(notesEl.value || '').slice(0, 400) : '',
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
          vb.textContent = isEn() ? '\u2728 More like this' : '\u2728 \u0632\u0648\u0651\u062F\u0646\u064A \u0645\u062B\u0644\u0647';
          vb.style.cssText = 'width:100%; margin-top:5px; font-size:11.5px; padding:5px 4px;';
          vb.onclick = (ev) => { ev.preventDefault(); variantSrc = im.imageBase64; btnGenerate.onclick(); };
          cell.appendChild(vb);
          gridEl.appendChild(cell);
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
  function pstyleSub(v){ return pstyleLang().startsWith('en') ? '' : (PSTYLE_SUBS[v] || ''); }
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
    if(styleSheetCount) styleSheetCount.textContent = opts.length + (pstyleLang().startsWith('en') ? ' styles — same face, every style' : ' ستايلًا — نفس وجهك بكل ستايل');
    styleCardsGrid.innerHTML = '';
    opts.forEach((opt) => {
      const v = opt.value;
      const active = v === styleEl.value;
      const title = opt.textContent.trim();
      const card = document.createElement('div');
      card.setAttribute('data-pstyle-card', v);
      card.style.cssText = 'border-radius:14px; overflow:hidden; cursor:pointer; background:#17171b;' +
        (active ? ' border:2px solid #d4af37; box-shadow:0 0 14px rgba(212,175,55,.3);' : ' border:1px solid var(--border,#2a2a30);');
      const imgWrap = document.createElement('div');
      imgWrap.style.cssText = 'position:relative; aspect-ratio:3/4; background:linear-gradient(160deg,#23232a,#101014); display:flex; align-items:center; justify-content:center;';
      const emoji = document.createElement('div');
      emoji.textContent = (title.match(/^\S+/) || [''])[0];
      emoji.style.cssText = 'font-size:34px;';
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

  /* ---- v-fashion-thumb-cards: بطاقات الأنماط المصوّرة ----
     نماذج مولّدة بمحرّكنا (أصول ثابتة assets/fashion/looks/<style>.webp) بدل
     سلكت نصّي. تتزامن مع #fashionAiStyle المخفي فكل الأسلاك الخلفية كما هي،
     وإن غابت صورة يبقى تدرّج أنيق مع الاسم — لا بطاقة مكسورة. */
  const styleCardsEl = $('#fashionStyleCards');
  // v-fashion-genders: لكل فئة أنماطها وصورها — العباية نسائية فقط، والصور من
  // looks/<الفئة>/، وما لم يُولَّد بعد يسقط لصور النساء ثم للتدرّج الأنيق.
  const GENDER_STYLES = {
    women: ['evening', 'formal', 'casual', 'abaya', 'wedding', 'traditional'],
    men: ['evening', 'formal', 'casual', 'wedding', 'traditional'],
    kids: ['evening', 'formal', 'casual', 'wedding', 'traditional'],
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
  function renderStyleCards(){
    if(!styleCardsEl || !styleEl) return;
    const g = currentGender();
    const list = GENDER_STYLES[g] || GENDER_STYLES.women;
    if(list.indexOf(styleEl.value) < 0) styleEl.value = list[0];
    styleCardsEl.innerHTML = '';
    list.forEach(function(v){
      const opt = Array.prototype.find.call(styleEl.options, function(o){ return o.value === v; });
      if(!opt) return;
      const active = v === styleEl.value;
      const card = document.createElement('div');
      card.setAttribute('data-style-card', v);
      card.style.cssText = 'position:relative; aspect-ratio:2/3; border-radius:12px; overflow:hidden; cursor:pointer;' +
        ' background:linear-gradient(160deg,#23232a,#101014);' +
        (active ? ' border:2px solid #d4af37; box-shadow:0 0 12px rgba(212,175,55,.35);' : ' border:1px solid var(--border,#333);');
      const label = document.createElement('div');
      label.textContent = opt.textContent;
      label.style.cssText = 'position:absolute; left:0; right:0; bottom:0; padding:14px 6px 6px; font-size:11.5px; font-weight:700; text-align:center;' +
        ' color:' + (active ? '#d4af37' : '#eef0f6') + '; background:linear-gradient(transparent,rgba(0,0,0,.82));';
      card.appendChild(lookImg(g, v, opt.textContent)); card.appendChild(label);
      card.onclick = function(){ styleEl.value = v; renderStyleCards(); };
      styleCardsEl.appendChild(card);
    });
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
      label.textContent = opt.textContent;
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
            resultEl.src = r.dataUrl; resultEl.style.display = 'block';
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
