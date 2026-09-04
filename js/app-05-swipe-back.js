/* ───────── v-swipe-back (فكرة المالك ٤ سبتمبر: «تلغي X وخليهم كلهم سحب يرجعك إلى الصفحة الي خلفها») ─────────
 * كل شاشات الأدوات بلا زر ✕: سحب من حافة الشاشة (اليمنى أو اليسرى، بالإصبع أو بالفأرة) يسحب
 * الشاشة معك ثم يغلقها ويرجعك لما خلفها — نمط iOS. زر Esc يغلق على الكمبيوتر أيضًا.
 * أزرار ✕ تبقى في الصفحة مخفية لأن منطق الإغلاق معلّق عليها؛ نضغطها برمجيًا.
 * التلفزيون خارج هذا التعديل (أمر المالك). */
(function(){
  'use strict';
  /* الحاوية ← زر الإغلاق */
  var MAP = {
    portraitStyleModal: 'portraitStyleCloseBtn', videoMakerModal: 'videoMakerCloseBtn', designAiModal: 'designAiCloseBtn',
    fashionAiModal: 'fashionAiCloseBtn', studioAiModal: 'studioAiCloseBtn', constructionModal: 'constructionCloseBtn',
    religionModal: 'religionCloseBtn', emailAssistModal: 'emailAssistCloseBtn', stocksModal: 'stocksCloseBtn',
    expModal: 'expCloseBtn', docModal: 'docX', govModal: 'govX', cvModal: 'cvX', eduHubModal: 'eduCloseBtn',
    omranQiblaShell: 'qClose', fbOverlay: 'fbClose', sectionsToolsOverlay: 'stpCloseBtn',
  };
  var EDGE = 34;          /* عرض منطقة الحافة بالبكسل */
  var HINT_KEY = 'aiapp_swipe_hint_v1';
  var HINT = { ar:'اسحب من حافة الشاشة للرجوع', en:'Swipe from the screen edge to go back', zh:'从屏幕边缘滑动返回', hi:'वापस जाने के लिए स्क्रीन के किनारे से स्वाइप करें',
    es:'Desliza desde el borde de la pantalla para volver', fr:'Glissez depuis le bord de l’écran pour revenir', bn:'ফিরে যেতে স্ক্রিনের প্রান্ত থেকে সোয়াইপ করুন',
    ru:'Проведите от края экрана, чтобы вернуться', ur:'واپس جانے کے لیے اسکرین کے کنارے سے سوائپ کریں', id:'Geser dari tepi layar untuk kembali',
    fil:'Mag-swipe mula sa gilid ng screen para bumalik', tr:'Geri dönmek için ekranın kenarından kaydırın', ne:'फर्कन स्क्रिनको किनाराबाट स्वाइप गर्नुहोस्', ml:'തിരികെ പോകാൻ സ്ക്രീനിന്റെ അരികിൽ നിന്ന് സ്വൈപ്പ് ചെയ്യുക' };

  /* ── CSS: إخفاء أزرار ✕ ومقبض الحافة ── */
  var css = document.createElement('style');
  css.id = 'omranSwipeBackCss';
  css.textContent =
    Object.keys(MAP).map(function(k){ return '#' + MAP[k]; }).join(',') + '{display:none !important;}' +
    'i.omranEdgeZone{position:absolute !important;top:0 !important;bottom:0 !important;width:' + EDGE + 'px !important;max-width:' + EDGE + 'px !important;height:auto !important;margin:0 !important;padding:0 !important;border:0 !important;border-radius:0 !important;box-shadow:none !important;z-index:2147483000;touch-action:none;background:transparent !important;display:block !important;font-style:normal;}' +
    '.omranEdgeZone.l{left:0;} .omranEdgeZone.r{right:0;}' +
    '.omranEdgeZone::after{content:"";position:absolute;top:50%;width:4px;height:52px;margin-top:-26px;border-radius:4px;background:rgba(212,175,55,.55);box-shadow:0 0 8px rgba(212,175,55,.35);}' +
    '.omranEdgeZone.l::after{left:5px;} .omranEdgeZone.r::after{right:5px;}' +
    '.omranSwiping{transition:none !important;will-change:transform;}' +
    '.omranSwipeSettle{transition:transform .22s ease !important;}' +
    '#omranSwipeHint{position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483001;background:rgba(20,20,26,.96);color:#f1d98a;border:1px solid rgba(212,175,55,.5);border-radius:999px;padding:9px 16px;font-size:13.5px;font-weight:700;pointer-events:none;opacity:0;transition:opacity .3s;}' +
    '#omranSwipeHint.show{opacity:1;}';
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
  /* الجزء الذي يتحرك مع الإصبع: أول ابن كبير (صندوق المحتوى) وإلا الحاوية نفسها */
  function panel(el){
    var kids = Array.prototype.slice.call(el.children).filter(function(c){ var r = c.getBoundingClientRect(); return r.width > 100 && r.height > 100 && !c.classList.contains('omranEdgeZone'); });
    return kids[0] || el;
  }

  /* ── مناطق الحافة داخل كل حاوية ── */
  function ensureZones(){
    Object.keys(MAP).forEach(function(id){
      var el = document.getElementById(id);
      if(!el || el.__omranZones) return;
      el.__omranZones = true;
      var cs = getComputedStyle(el);
      if(cs.position === 'static') el.style.position = 'relative';
      ['l','r'].forEach(function(side){
        var z = document.createElement('i'); /* ليس div حتى لا تطاله قواعد «> div» للنوافذ */
        z.className = 'omranEdgeZone ' + side;
        z.setAttribute('aria-hidden', 'true');
        z.addEventListener('pointerdown', function(e){ start(e, el, side); });
        el.appendChild(z);
      });
    });
  }

  var drag = null;
  function start(e, el, side){
    if(drag) return;
    if(e.button && e.button !== 0) return;
    var p = panel(el);
    drag = { el: el, p: p, side: side, id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: Date.now(), dx: 0, moved: false, w: window.innerWidth };
    p.classList.add('omranSwiping');
    try{ e.target.setPointerCapture(e.pointerId); }catch(err){ /* guard-ok */ }
    e.preventDefault();
  }
  function move(e){
    if(!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    /* الاتجاه: من الحافة إلى الداخل فقط */
    if(drag.side === 'l' && dx < 0) dx = 0;
    if(drag.side === 'r' && dx > 0) dx = 0;
    if(!drag.moved && Math.abs(dy) > Math.abs(dx) + 8 && Math.abs(dx) < 12) return; /* حركة عمودية — ليست سحبًا */
    drag.moved = true;
    drag.dx = dx;
    drag.p.style.transform = 'translateX(' + dx + 'px)';
    drag.p.style.opacity = String(Math.max(.35, 1 - Math.abs(dx) / drag.w * 0.9));
    e.preventDefault();
  }
  function end(e){
    if(!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag; drag = null;
    var dt = Math.max(1, Date.now() - d.t0), v = Math.abs(d.dx) / dt;
    var go = Math.abs(d.dx) > Math.min(130, d.w * 0.28) || (v > 0.55 && Math.abs(d.dx) > 60);
    d.p.classList.remove('omranSwiping');
    d.p.classList.add('omranSwipeSettle');
    if(go){
      d.p.style.transform = 'translateX(' + (d.side === 'l' ? d.w : -d.w) + 'px)';
      d.p.style.opacity = '0';
      setTimeout(function(){
        closeTool(d.el);
        setTimeout(function(){ d.p.classList.remove('omranSwipeSettle'); d.p.style.transform = ''; d.p.style.opacity = ''; }, 60);
      }, 200);
    } else {
      d.p.style.transform = ''; d.p.style.opacity = '';
      setTimeout(function(){ d.p.classList.remove('omranSwipeSettle'); }, 240);
    }
  }
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  /* Esc يغلق أعلى أداة مفتوحة (الكمبيوتر) */
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    var t = topTool();
    if(t && closeTool(t)) e.preventDefault();
  });

  /* تلميح مرة واحدة لكل جهاز عند أول فتح لأداة */
  function lang(){ try{ return localStorage.getItem('aiapp_lang') || 'ar'; }catch(e){ return 'ar'; } }
  var hinted = false;
  try{ hinted = localStorage.getItem(HINT_KEY) === '1'; }catch(e){ /* guard-ok */ }
  function maybeHint(){
    if(hinted) return;
    var t = topTool();
    if(!t) return;
    hinted = true;
    try{ localStorage.setItem(HINT_KEY, '1'); }catch(e){ /* guard-ok */ }
    var h = document.createElement('div');
    h.id = 'omranSwipeHint';
    h.textContent = '↔ ' + (HINT[lang()] || HINT.en);
    document.body.appendChild(h);
    requestAnimationFrame(function(){ h.classList.add('show'); });
    setTimeout(function(){ h.classList.remove('show'); setTimeout(function(){ try{ h.remove(); }catch(e){ /* guard-ok */ } }, 400); }, 3800);
  }

  function boot(){ ensureZones(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setInterval(function(){ ensureZones(); maybeHint(); }, 900);
  window.omranSwipeBack = { close: function(){ var t = topTool(); return t ? closeTool(t) : false; }, top: topTool };
})();
