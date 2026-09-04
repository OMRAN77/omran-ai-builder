/* Tool card photo upgrade: visual-only; preserves every existing button and handler. */
(function(){
  'use strict';
  var TOOL_PHOTOS = {
    btnPortraitStyle: '/assets/tool-cards/portrait.png',
    btnQuickTemplates: '/assets/tool-cards/suggestions.png',
    btnVideoMaker: '/assets/tool-cards/video.png',
    btnDesignAI: '/assets/tool-cards/decor.png',
    btnFashionAI: '/assets/tool-cards/fashion.png',
    btnStudioAI: '/assets/tool-cards/style.png',
    btnAdStudio: '/assets/tool-cards/ads.png',
    btnStocks: '/assets/tool-cards/sections/stocks.png?v=2',
    btnOmranTV: '/assets/tool-cards/sections/tv.png?v=2',
    btnQibla: '/assets/tool-cards/sections/qibla.png?v=2',
    btnExpense: '/assets/tool-cards/sections/expense.png?v=2',
    btnOmranEdu: '/assets/tool-cards/sections/education.png?v=2',
    btnConstruction: '/assets/tool-cards/sections/construction.png?v=2',
    btnReligion: '/assets/tool-cards/sections/religion.png?v=2',
    btnCV: '/assets/tool-cards/sections/cv.png?v=2',
    btnDocs: '/assets/tool-cards/sections/docs.png?v=2',
    btnFeedback: '/assets/tool-cards/sections/feedback.png?v=2',
    btnEmailAssist: '/assets/tool-cards/sections/email.png?v=2'
  };

  /* v-tools-owner-cards: بالعربية تُعرض بطاقات المالك الجاهزة (صورة كاملة
     بعنوانها ووصفها وسهمها) مقصوصةً من تصميمه حرفيًا — كلّ الثماني عشرة.
     خارج العربية تبقى الصور السابقة مع العنوان النصّي. */
  var FULL_AR_IDS = ['btnVideoMaker','btnQuickTemplates','btnPortraitStyle','btnStudioAI','btnFashionAI','btnDesignAI','btnAdStudio','btnStocks','btnOmranTV','btnQibla','btnExpense','btnOmranEdu','btnConstruction','btnReligion','btnCV','btnDocs','btnFeedback','btnEmailAssist'];
  function isAr(){ return String(document.documentElement.lang || 'ar').toLowerCase().indexOf('ar') === 0; }
  function srcFor(id){
    if(isAr() && FULL_AR_IDS.indexOf(id) !== -1) return '/assets/tool-cards/full/' + id + '.png?v=4';
    return TOOL_PHOTOS[id];
  }

  function upgradeButton(id, src){
    var button = document.getElementById(id);
    if(!button) return;
    var cur = button.querySelector('img.stp3d.toolPhotoImage');
    if(button.classList.contains('hasToolPhoto')){
      if(cur && cur.getAttribute('src') !== src){ cur.src = src; button.classList.toggle('toolPhotoCard', src.indexOf('/full/') !== -1 || src.indexOf('/sections/') !== -1); }
      return;
    }
    var oldImage = button.querySelector('img.stp3d');
    var preload = new Image();
    preload.onload = function(){
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
      /* بطاقة كاملة بعنوان مطبوع → يُخفى عنوانها النصي بالعربية (CSS) */
      if(src.indexOf('/full/') !== -1 || src.indexOf('/sections/') !== -1) button.classList.add('toolPhotoCard');
    };
    preload.onerror = function(){ /* Keep the existing icon when a photo cannot load. */ };
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
  function decorate(id){
    var b = document.getElementById(id); if(!b) return;
    var lab = b.querySelector('.btnLabel'); if(!lab) return;
    var meta = b.querySelector('.tcMeta');
    if(isAr()){ if(meta) meta.remove(); b.classList.remove('tcTxt'); return; }
    if(!meta){
      meta = document.createElement('span'); meta.className = 'tcMeta';
      var txt = document.createElement('span'); txt.className = 'tcTxt';
      var sub = document.createElement('span'); sub.className = 'tcSub'; sub.setAttribute('data-i18n', 'tcSub_' + id);
      var arr = document.createElement('span'); arr.className = 'tcArrow'; arr.setAttribute('aria-hidden', 'true'); arr.textContent = '›';
      lab.parentNode.insertBefore(meta, lab);
      txt.appendChild(lab); txt.appendChild(sub); meta.appendChild(txt); meta.appendChild(arr);
    }
    var s = meta.querySelector('.tcSub'); if(s){ var v = subFor(id); if(v) s.textContent = v; }
    b.classList.add('tcTxt');
  }
  function applyToolPhotos(){
    Object.keys(TOOL_PHOTOS).forEach(function(id){ upgradeButton(id, srcFor(id)); decorate(id); });
  }
  try{ new MutationObserver(applyToolPhotos).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); }catch(e){ /* بلا مراقب: تُطبَّق عند التحميل فقط */ }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyToolPhotos, { once:true });
  else applyToolPhotos();
  setTimeout(applyToolPhotos, 250);
  setTimeout(applyToolPhotos, 1200);
  setTimeout(applyToolPhotos, 3000); /* بعد وصول ملف اللغة الكسول */
})();
