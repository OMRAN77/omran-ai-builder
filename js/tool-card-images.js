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
  function applyToolPhotos(){
    Object.keys(TOOL_PHOTOS).forEach(function(id){ upgradeButton(id, srcFor(id)); decorate(id); });
  }
  try{ new MutationObserver(function(){ applyToolPhotos(); setTimeout(applyToolPhotos, 400); setTimeout(applyToolPhotos, 1600); setTimeout(applyToolPhotos, 3200); }).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); }catch(e){ /* بلا مراقب: تُطبَّق عند التحميل فقط */ }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyToolPhotos, { once:true });
  else applyToolPhotos();
  setTimeout(applyToolPhotos, 250);
  setTimeout(applyToolPhotos, 1200);
  setTimeout(applyToolPhotos, 3000); /* بعد وصول ملف اللغة الكسول */
})();
