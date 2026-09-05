/* Tool card photo upgrade: visual-only; preserves every existing button and handler. */
(function(){
  'use strict';
  /* v-tools-clean (المالك ٥ سبتمبر: «جبتلك الصور نظيفة — غيّر الصور كاملة بالترتيب ونفس المقاس مع 14 لغة»):
     ثماني عشرة صورة نظيفة بلا نصّ مطبوع، كلها بمقاس واحد 1200×720، لكل اللغات بما فيها العربية.
     العنوان والوصف يُكتبان نصًّا مترجمًا فوق البطاقة (tcMeta) بالـ14 لغة. */
  var CLEAN_V = '1';
  var IDS = ['btnPortraitStyle','btnQuickTemplates','btnVideoMaker','btnDesignAI','btnFashionAI','btnStudioAI','btnAdStudio','btnStocks','btnOmranTV','btnQibla','btnExpense','btnOmranEdu','btnConstruction','btnReligion','btnCV','btnDocs','btnFeedback','btnEmailAssist'];
  var TOOL_PHOTOS = {};
  IDS.forEach(function(id){ TOOL_PHOTOS[id] = '/assets/tool-cards/clean/' + id + '.jpg?v=' + CLEAN_V; });
  function isAr(){ return String(document.documentElement.lang || 'ar').toLowerCase().indexOf('ar') === 0; }
  function srcFor(id){ return TOOL_PHOTOS[id]; }

  function upgradeButton(id, src){
    var button = document.getElementById(id);
    if(!button) return;
    var cur = button.querySelector('img.stp3d.toolPhotoImage');
    if(button.classList.contains('hasToolPhoto')){
      if(cur && cur.getAttribute('src') !== src){ cur.src = src; }
      button.classList.remove('toolPhotoCard');
      return;
    }
    /* سباق تحميل: نداءان متتاليان قبل اكتمال أول تحميل كانا يضيفان صورتين للزر (لقطة المالك: اقتراحات) */
    if(button.__tcLoading === src) return;
    button.__tcLoading = src;
    var preload = new Image();
    preload.onload = function(){
      var oldImage = button.querySelector('img.stp3d');
      if(button.classList.contains('hasToolPhoto')) return;
      if(oldImage){
        oldImage.src = src;
        oldImage.classList.add('toolPhotoImage');
      } else {
        oldImage = document.createElement('img');
        oldImage.className = 'stp3d toolPhotoImage';
        oldImage.loading = 'lazy';
        oldImage.alt = '';
        oldImage.src = src;
        button.insertBefore(oldImage, button.firstChild);
      }
      button.classList.add('has3d', 'hasToolPhoto');
    };
    preload.onerror = function(){ button.__tcLoading = null; /* Keep the existing icon when a photo cannot load. */ };
    preload.src = src;
  }

  /* v-tools-14 (المالك: «ترتب مكان واحد وكأنه ما عندي 14 لغة»): خارج العربية تُبنى البطاقة
     نفسها نصًّا مترجمًا — العنوان، الوصف، والسهم — بدل عنوان وحيد وفراغ. */
  function subFor(id){
    var k = 'tcSub_' + id;
    try{ if(typeof window.t === 'function'){ var v = window.t(k); if(v && v !== k) return v; } }catch(e){ /* guard-ok */ }
    try{ var I = window.I18N, L = document.documentElement.lang || 'en'; if(I){ if(I[L] && I[L][k]) return I[L][k]; if(I.en && I.en[k]) return I.en[k]; } }catch(e){ /* guard-ok */ }
    return '';
  }
  /* v-tools-accent (المالك ٥ سبتمبر): لون تمييزي لكل أداة + أيقونة مسطّحة صغيرة في زاوية الصورة */
  var ACCENT = {
    btnPortraitStyle: '#d4af37', btnQuickTemplates: '#f2b94a', btnVideoMaker: '#e0555b', btnDesignAI: '#f28c5a',
    btnFashionAI: '#ff6fae', btnStudioAI: '#5ad1ff', btnAdStudio: '#ff5fa2', btnStocks: '#34d399', btnExpense: '#22c55e',
    btnCV: '#60a5fa', btnDocs: '#a78bfa', btnEmailAssist: '#fb923c', btnConstruction: '#fbbf24', btnQibla: '#d4af37',
    btnOmranTV: '#ef4444', btnOmranEdu: '#38bdf8', btnReligion: '#10b981', btnGov: '#94a3b8', btnFeedback: '#f472b6'
  };
  function decorate(id){
    var b = document.getElementById(id); if(!b) return;
    var lab = b.querySelector('.btnLabel'); if(!lab) return;
    try{ b.style.setProperty('--tc', ACCENT[id] || '#d4af37'); }catch(e){ /* guard-ok */ }
    if(!b.querySelector('.tcIco')){
      var src = b.querySelector(':scope > svg');
      if(src){ var ico = document.createElement('span'); ico.className = 'tcIco'; ico.setAttribute('aria-hidden', 'true'); ico.appendChild(src.cloneNode(true)); b.appendChild(ico); }
    }
    var meta = b.querySelector('.tcMeta');
    if(!meta){
      meta = document.createElement('span'); meta.className = 'tcMeta';
      var txt = document.createElement('span'); txt.className = 'tcTxt';
      var sub = document.createElement('span'); sub.className = 'tcSub'; sub.setAttribute('data-i18n', 'tcSub_' + id);
      var arr = document.createElement('span'); arr.className = 'tcArrow'; arr.setAttribute('aria-hidden', 'true'); arr.textContent = '›';
      lab.parentNode.insertBefore(meta, lab);
      txt.appendChild(lab); txt.appendChild(sub); meta.appendChild(txt); meta.appendChild(arr);
    }
    var s = meta.querySelector('.tcSub'); if(s){ var v = subFor(id); if(v) s.textContent = v; }
    /* العنوان نظيف بلا إيموجي في أوله (بعض المفاتيح تبدأ برمز) */
    try{ var clean = String(lab.textContent || '').replace(/^[^\p{L}\p{N}]+/u, '').trim(); if(clean && clean !== lab.textContent) lab.textContent = clean; }catch(e){ /* guard-ok */ }
    b.classList.add('tcTxt');
  }
  /* v-live-cards: بيانات حيّة على البطاقة — القبلة (الصلاة القادمة ووقتها واتجاه القبلة) والأسهم (أول سهم في الشريط) */
  function liveChip(id, txt){
    var b = document.getElementById(id); if(!b) return;
    var c = b.querySelector('.tcLive');
    if(!txt){ if(c) c.remove(); return; }
    if(!c){ c = document.createElement('span'); c.className = 'tcLive'; b.appendChild(c); }
    c.textContent = txt;
  }
  function fmtNum(n){ try{ return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }catch(e){ return String(n); } }
  function liveCards(){
    try{
      if(window.omranQibla && typeof window.omranQibla.live === 'function'){
        window.omranQibla.live().then(function(v){
          if(!v || !v.name) return;
          liveChip('btnQibla', '🕋 ' + v.name + ' ' + v.time + (v.bearing != null ? ' · ' + v.bearing + '°' : ''));
        }).catch(function(){ /* guard-ok */ });
      }
      var tk = window.__tickerLatest;
      if(tk && tk.syms && tk.syms[0]){
        var it = tk.syms[0], up = (it.change || 0) >= 0;
        liveChip('btnStocks', it.symbol + ' ' + (up ? '▲' : '▼') + ' ' + fmtNum(it.price));
        var lb = document.querySelector('#btnStocks .tcLive'); if(lb) lb.style.color = up ? '#34d399' : '#f87171';
      }
    }catch(e){ /* guard-ok */ }
  }
  var liveTimer = null;
  function watchOverlay(){
    var o = document.getElementById('sectionsToolsOverlay'); if(!o || o.__tcLive) return; o.__tcLive = 1;
    var tick = function(){ if(o.classList.contains('show')){ liveCards(); if(!liveTimer) liveTimer = setInterval(function(){ if(o.classList.contains('show')) liveCards(); }, 60000); } };
    try{ new MutationObserver(tick).observe(o, { attributes: true, attributeFilter: ['class'] }); }catch(e){ /* guard-ok */ }
    tick();
  }
  function applyToolPhotos(){
    watchOverlay();
    Object.keys(TOOL_PHOTOS).forEach(function(id){ upgradeButton(id, srcFor(id)); decorate(id); });
  }
  try{ new MutationObserver(function(){ applyToolPhotos(); setTimeout(applyToolPhotos, 400); setTimeout(applyToolPhotos, 1600); setTimeout(applyToolPhotos, 3200); }).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); }catch(e){ /* بلا مراقب: تُطبَّق عند التحميل فقط */ }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyToolPhotos, { once:true });
  else applyToolPhotos();
  setTimeout(applyToolPhotos, 250);
  setTimeout(applyToolPhotos, 1200);
  setTimeout(applyToolPhotos, 3000); /* بعد وصول ملف اللغة الكسول */
})();
