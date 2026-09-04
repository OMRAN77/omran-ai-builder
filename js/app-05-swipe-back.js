/* ───────── v-swipe-back (فكرة المالك ٤ سبتمبر: «تلغي X وخليهم كلهم سحب يرجعك إلى الصفحة الي خلفها») ─────────
 * v2 (أمر المالك: «سحب نفس الإعدادات، وشريط السحب احذفه من كل مكان»): نفس سلوك درج الإعدادات
 * حرفيًا — اسحب بالإصبع لليمين من أي مكان في الشاشة فتتبعك الشاشة، وبعد ثلث العرض (أو نفضة
 * سريعة) تنزلق وتُغلق وترجع للصفحة خلفها. لا مقابض ولا أشرطة ولا مناطق حافة. التمرير الرأسي
 * والقوائم الأفقية والمنزلقات لا تتأثر. أزرار ✕ مخفية ويُضغط عليها برمجيًا فيبقى منطق الإغلاق
 * الأصلي. Esc يغلق على الكمبيوتر. التلفزيون خارج هذا التعديل (أمر المالك). */
(function(){
  'use strict';
  var MAP = {
    portraitStyleModal: 'portraitStyleCloseBtn', videoMakerModal: 'videoMakerCloseBtn', designAiModal: 'designAiCloseBtn',
    fashionAiModal: 'fashionAiCloseBtn', studioAiModal: 'studioAiCloseBtn', constructionModal: 'constructionCloseBtn',
    religionModal: 'religionCloseBtn', emailAssistModal: 'emailAssistCloseBtn', stocksModal: 'stocksCloseBtn',
    expModal: 'expCloseBtn', docModal: 'docX', govModal: 'govX', cvModal: 'cvX', eduHubModal: 'eduCloseBtn',
    omranQiblaShell: 'qClose', fbOverlay: 'fbClose', sectionsToolsOverlay: 'stpCloseBtn',
  };

  var css = document.createElement('style');
  css.id = 'omranSwipeBackCss';
  css.textContent =
    Object.keys(MAP).map(function(k){ return '#' + MAP[k]; }).join(',') + '{display:none !important;}' +
    '.omranSwiping{transition:none !important;will-change:transform;}' +
    '.omranSwipeSettle{transition:transform .18s ease-out, opacity .18s ease-out !important;}';
  document.head.appendChild(css);

  function visible(el){
    if(!el) return false;
    var cs = getComputedStyle(el);
    if(cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return r.width > 50 && r.height > 50;
  }
  function topTool(){
    var best = null, bz = -1;
    Object.keys(MAP).forEach(function(id){
      var el = document.getElementById(id);
      if(!visible(el)) return;
      var z = parseInt(getComputedStyle(el).zIndex || '0', 10) || 0;
      if(z >= bz){ bz = z; best = el; }
    });
    return best;
  }
  function closeTool(el){
    var btn = el && document.getElementById(MAP[el.id]);
    if(btn){ try{ btn.click(); return true; }catch(e){ /* guard-ok */ } }
    return false;
  }
  /* الجزء الذي يتحرك مع الإصبع: صندوق المحتوى (أول ابن كبير) وإلا الحاوية نفسها */
  function panel(el){
    var kids = Array.prototype.slice.call(el.children).filter(function(c){ var r = c.getBoundingClientRect(); return r.width > 100 && r.height > 100; });
    return kids[0] || el;
  }
  /* عناصر لا نسحب منها: منزلقات، فيديو، كانفاس، حقول نصية، وأي قائمة تتمرر أفقيًا */
  function blocked(t){
    var e = t;
    for(var i = 0; e && e !== document.body && i < 12; i++){
      var tag = (e.tagName || '').toLowerCase();
      if(tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'video' || tag === 'canvas' || tag === 'iframe') return true;
      try{
        var cs = getComputedStyle(e);
        if((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 4) return true;
      }catch(err){ /* guard-ok */ }
      e = e.parentElement;
    }
    return false;
  }

  function bind(el){
    var t0 = null, dragging = false, w = 0, p = null;
    var setX = function(x, anim){
      if(!p) return;
      p.classList.toggle('omranSwipeSettle', !!anim);
      p.classList.toggle('omranSwiping', !anim);
      p.style.transform = x ? ('translateX(' + x + 'px)') : '';
      p.style.opacity = x ? String(Math.max(.3, 1 - x / Math.max(1, w) * .9)) : '';
    };
    el.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1 || blocked(e.target)){ t0 = null; return; }
      if(topTool() !== el){ t0 = null; return; }
      t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, ts: Date.now() };
      dragging = false;
      p = panel(el);
      w = window.innerWidth || 360;
    }, { passive: true });
    el.addEventListener('touchmove', function(e){
      if(!t0) return;
      var dx = e.touches[0].clientX - t0.x;
      var dy = e.touches[0].clientY - t0.y;
      if(!dragging){
        if(Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return; /* تمرير رأسي */
        if(dx <= 0){ t0 = null; return; } /* لليسار: ليس رجوعًا */
        dragging = true;
      }
      setX(Math.max(0, dx), false);
    }, { passive: true });
    var finish = function(e){
      if(!t0) return;
      var was = dragging;
      var dx = (was && e.changedTouches && e.changedTouches[0]) ? (e.changedTouches[0].clientX - t0.x) : 0;
      var dt = Date.now() - t0.ts;
      t0 = null; dragging = false;
      if(!was) return;
      if(dx > w * 0.35 || (dt < 300 && dx > 70)){
        setX(w + 40, true);
        setTimeout(function(){ closeTool(el); setTimeout(function(){ setX(0, false); if(p){ p.classList.remove('omranSwiping'); } }, 40); }, 190);
      } else {
        setX(0, true);
        setTimeout(function(){ if(p){ p.classList.remove('omranSwipeSettle'); p.classList.remove('omranSwiping'); } }, 220);
      }
    };
    el.addEventListener('touchend', finish, { passive: true });
    el.addEventListener('touchcancel', finish, { passive: true });
  }
  function ensureBound(){
    Object.keys(MAP).forEach(function(id){
      var el = document.getElementById(id);
      if(!el || el.__omranSwipe) return;
      el.__omranSwipe = true;
      bind(el);
    });
  }

  /* Esc يغلق أعلى أداة مفتوحة (الكمبيوتر) */
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    var t = topTool();
    if(t && closeTool(t)) e.preventDefault();
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureBound); else ensureBound();
  setInterval(ensureBound, 900);
  window.omranSwipeBack = { close: function(){ var t = topTool(); return t ? closeTool(t) : false; }, top: topTool };
})();
