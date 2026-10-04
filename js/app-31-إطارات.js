/* v-frame-design — التصميم الجديد للكمبيوتر (css/إطارات.css). هنا ما لا يفعله CSS وحده:
   ① خانة البحث الظاهرة في القائمة (#sbSearch) تمرّر ما يُكتب إلى بحث المشاريع القائم (#projSearchInput) — بحثه في
      العناوين ونصوص الرسائل والكود كما هو، بلا منطق ثانٍ.
   ② صورة المستخدم بجانب رسائله (أمر المالك ٤ أكتوبر: «في المحادثة تطلع جنب رسالة المستخدم الصورة اللي حاطّها في حسابه»):
      ‎--user-av‎ صورته من «حسابي» (aiapp_avatar)، وبلا صورة ‎--user-initial‎ أوّل حرف من اسمه في دائرة ذهبيّة؛
      والصنف html.has-user-av للمسجَّل وحده. تُحدَّث عند الإقلاع وكلّما بدّل صورته (updateAvatarUI) أو دخل أو خرج. */
(function(){
  var sb = document.getElementById('sbSearch');
  if(sb){
    sb.addEventListener('input', function(){
      var real = document.getElementById('projSearchInput');
      if(!real) return;
      real.value = sb.value;
      try{ real.dispatchEvent(new Event('input')); }catch(e){ __swallow(e, 'frame:search'); }
    });
  }

  function صورة(){
    var html = document.documentElement, name = '', av = '';
    try{ name = String(localStorage.getItem('aiapp_username') || '').trim(); av = localStorage.getItem('aiapp_avatar') || ''; }
    catch(e){ __swallow(e, 'frame:avatar-read'); }
    html.classList.toggle('has-user-av', !!name);
    if(!name){ html.style.removeProperty('--user-av'); html.style.removeProperty('--user-initial'); return; }
    if(av){
      html.style.setProperty('--user-av', 'url("' + av.replace(/"/g, '%22') + '")');
      html.style.setProperty('--user-initial', '""');
    } else {
      html.style.removeProperty('--user-av');
      html.style.setProperty('--user-initial', JSON.stringify(Array.from(name)[0].toUpperCase()));
    }
  }
  window.omFrameAvatar = صورة;

  /* ③ سهم طيّ القائمة على سطر «محادثة جديدة» (أمر المالك: «رجّعه وين المحادثة الجديدة»): ارتفاعه من موضع الزرّ نفسه
     لا رقمًا ثابتًا — الشعار صورة يتغيّر ارتفاعها مع التحميل واللغة. */
  var سهم = document.getElementById('sidebarCloseBtn'), جديد = document.getElementById('omranNewChatBtn'), قائمة = document.getElementById('sidebar');
  function ضع(){
    if(!سهم || !جديد || !قائمة || document.documentElement.classList.contains('mobile-ui')) return;
    var h = سهم.offsetHeight || 30;
    قائمة.style.setProperty('--sb-arrow-top', Math.max(0, Math.round(جديد.offsetTop + (جديد.offsetHeight - h) / 2)) + 'px');
  }
  if(قائمة && typeof ResizeObserver === 'function'){ try{ new ResizeObserver(ضع).observe(قائمة); }catch(e){ __swallow(e, 'frame:arrow-ro'); } }
  window.addEventListener('load', ضع);
  ضع();
  window.addEventListener('storage', function(e){ if(!e || e.key === 'aiapp_avatar' || e.key === 'aiapp_username') صورة(); });
  صورة();
})();
