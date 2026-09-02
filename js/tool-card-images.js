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
    btnStocks: '/assets/tool-cards/sections/stocks.png',
    btnOmranTV: '/assets/tool-cards/sections/tv.png',
    btnQibla: '/assets/tool-cards/sections/qibla.png',
    btnExpense: '/assets/tool-cards/sections/expense.png',
    btnOmranEdu: '/assets/tool-cards/sections/education.png',
    btnConstruction: '/assets/tool-cards/sections/construction.png',
    btnReligion: '/assets/tool-cards/sections/religion.png',
    btnCV: '/assets/tool-cards/sections/cv.png',
    btnDocs: '/assets/tool-cards/sections/docs.png',
    btnFeedback: '/assets/tool-cards/sections/feedback.png',
    btnEmailAssist: '/assets/tool-cards/sections/email.png'
  };

  function upgradeButton(id, src){
    var button = document.getElementById(id);
    if(!button || button.classList.contains('hasToolPhoto')) return;
    var oldImage = button.querySelector('img.stp3d');
    if(!oldImage) return;
    var preload = new Image();
    preload.onload = function(){
      oldImage.src = src;
      oldImage.classList.add('toolPhotoImage');
      button.classList.add('hasToolPhoto');
    };
    preload.onerror = function(){ /* Keep the existing icon when a photo cannot load. */ };
    preload.src = src;
  }

  function applyToolPhotos(){
    Object.keys(TOOL_PHOTOS).forEach(function(id){ upgradeButton(id, TOOL_PHOTOS[id]); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyToolPhotos, { once:true });
  else applyToolPhotos();
  setTimeout(applyToolPhotos, 250);
  setTimeout(applyToolPhotos, 1200);
})();
