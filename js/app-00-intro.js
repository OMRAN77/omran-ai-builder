/* v-intro-splash: شاشة الافتتاح الكاملة (مخطط المالك بلا «مها» وبحرف ع).
   الرسم يبدأ من index.html قبل الحزمة؛ تبقى بوميضها حتى يضغط المستخدم ثم تُحذف تمامًا،
   ومفتاح الإعدادات. تظهر مرة لكل فتح للتطبيق (sessionStorage) وتُعطَّل من
   الإعدادات (aiapp_intro = '0'). */
(function(){
  var el = document.getElementById('omranIntro');
  var done = false;
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
    /* طلب المالك: تبقى الشاشة بوميضها حتى يضغط المستخدم — لا مؤقّت إغلاق تلقائي */
    el.addEventListener('touchend', out, { passive: true });
    el.addEventListener('keydown', out);
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
