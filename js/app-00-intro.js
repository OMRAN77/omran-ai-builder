/* v-intro-splash: شاشة الافتتاح الكاملة (مخطط المالك بلا «مها» وبحرف ع).
   الرسم يبدأ من index.html قبل الحزمة؛ هنا التوقيت والإخفاء التام وزر التخطي
   ومفتاح الإعدادات. تظهر مرة لكل فتح للتطبيق (sessionStorage) وتُعطَّل من
   الإعدادات (aiapp_intro = '0'). */
(function(){
  var el = document.getElementById('omranIntro');
  var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
  var MIN = 3200, MAX = 6000, done = false;
  function now(){ return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function out(){
    if(done) return; done = true;
    try{
      if(el){ el.classList.add('oiOut'); }
      setTimeout(function(){
        try{ if(el && el.parentNode) el.parentNode.removeChild(el); }catch(e){ /* guard-ok */ }
        try{ document.documentElement.classList.remove('oiOn'); }catch(e){ /* guard-ok */ }
      }, 1000);
    }catch(e){ __swallow(e, 'intro:out'); }
  }
  if(el){
    el.addEventListener('click', out, { passive: true });
    var img = el.querySelector('.oiImg');
    if(img){ img.addEventListener('error', out); }
    var arm = function(){ var left = Math.max(0, MIN - (now() - t0)); setTimeout(out, left); };
    if(document.readyState === 'complete') arm(); else window.addEventListener('load', arm);
    setTimeout(out, MAX);
  } else {
    done = true;
  }
  window.omranIntro = { skip: out };

  /* مفتاح الإعدادات: «شاشة الافتتاح عند فتح التطبيق» */
  function wire(){
    var chk = document.getElementById('chkIntroSplash');
    if(!chk) return;
    try{ chk.checked = localStorage.getItem('aiapp_intro') !== '0'; }catch(e){ /* guard-ok */ }
    chk.addEventListener('change', function(){
      try{ localStorage.setItem('aiapp_intro', chk.checked ? '1' : '0'); }catch(e){ /* guard-ok */ }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
