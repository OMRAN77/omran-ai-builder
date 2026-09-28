/* v-bg-images — خلفيّات الشاشة (v-bg-once: تظهر مرّة واحدة لكلّ فتح — انظر راقب_الدخول).
   الصور في assets/خلفيات/ وفهرسها فهرس.json (يولّده scripts/خلفيات.mjs مع المصغّرات واللون المهيمن).
   الإعدادات ← المظهر ← خلفيّات الشاشة: شبكة مصغّرات بلا أسماء؛ الاختيار يضع الصورة خلف الشاشة كلّها
   (#bgImgLayer) ويضبط ألوان الكتابة على لونها (html.bgimg-dark / html.bgimg-light في css/خلفيات.css)،
   ويطفئ الخلفيّة الثلاثيّة — خلفيّة واحدة في كلّ وقت (والعكس في applyBg3D). */
(function(){
  var KEY = 'aiapp_bgimg';
  var BASE = '/assets/' + encodeURIComponent('خلفيات') + '/';
  var فهرس = null, تحميل = null;

  function رابط(ملف, مصغّر){ return BASE + (مصغّر ? encodeURIComponent('مصغّرات') + '/' : '') + encodeURIComponent(ملف); }
  function طبقة(){
    var el = document.getElementById('bgImgLayer');
    if(!el){ el = document.createElement('div'); el.id = 'bgImgLayer'; document.body.insertBefore(el, document.body.firstChild); }
    return el;
  }
  function الحاليّ(){
    try{ var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; }
    catch(e){ __swallow(e, 'bgimg:read'); return null; }
  }
  function علّم(ملف){
    var g = document.getElementById('bgImgGrid'); if(!g) return;
    g.querySelectorAll('.bgImgOpt').forEach(function(b){ b.classList.toggle('active', (b.dataset.file || '') === (ملف || '')); });
  }

  function طبّق(صورة, حفظ){
    var html = document.documentElement;
    if(!صورة){
      html.classList.remove('bgimg', 'bgimg-dark', 'bgimg-light');
      var el = document.getElementById('bgImgLayer'); if(el) el.style.backgroundImage = '';
      if(حفظ !== false){ try{ localStorage.removeItem(KEY); }catch(e){ __swallow(e, 'bgimg:clear'); } }
      علّم(null);
      return;
    }
    طبقة().style.backgroundImage = 'url("' + رابط(صورة.ملف) + '")';
    html.style.setProperty('--bgimg-tint', صورة.لون || '#000');
    html.classList.add('bgimg');
    html.classList.toggle('bgimg-light', !!صورة.فاتحة);
    html.classList.toggle('bgimg-dark', !صورة.فاتحة);
    if(حفظ !== false){
      try{ localStorage.setItem(KEY, JSON.stringify({ ملف: صورة.ملف, لون: صورة.لون, فاتحة: !!صورة.فاتحة })); }
      catch(e){ __swallow(e, 'bgimg:save'); }
    }
    try{
      if((localStorage.getItem('aiapp_bg3d') || 'none') !== 'none' && typeof applyBg3D === 'function'){
        applyBg3D('none');
        if(typeof buildBg3DPicker === 'function') buildBg3DPicker();
      }
    }catch(e){ __swallow(e, 'bgimg:3d-off'); }
    علّم(صورة.ملف);
  }

  function حمّل(){
    if(فهرس) return Promise.resolve(فهرس);
    if(!تحميل){
      تحميل = fetch(BASE + encodeURIComponent('فهرس.json'), { cache: 'no-cache' })
        .then(function(r){ if(!r.ok) throw new Error('فهرس الخلفيّات ' + r.status); return r.json(); })
        .then(function(j){ فهرس = (j && j.صور) || []; return فهرس; })
        .catch(function(e){ تحميل = null; __swallow(e, 'bgimg:index'); return []; });
    }
    return تحميل;
  }

  function افتح(){
    var g = document.getElementById('bgImgGrid');
    if(!g || g.dataset.ready) return;
    g.dataset.ready = '1';
    var cur = الحاليّ();
    return حمّل().then(function(list){
      if(!list.length){ g.dataset.ready = ''; return; }
      g.innerHTML = '';
      var none = document.createElement('button');
      none.type = 'button';
      none.className = 'bgImgOpt bgImgNone' + (cur ? '' : ' active');
      none.dataset.file = '';
      none.textContent = (typeof t === 'function' ? t('bgImgNone') : 'بلا خلفيّة');
      none.onclick = function(){ طبّق(null); };
      g.appendChild(none);
      list.forEach(function(ص){
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'bgImgOpt' + (cur && cur.ملف === ص.ملف ? ' active' : '');
        b.dataset.file = ص.ملف;
        b.style.backgroundImage = 'url("' + رابط(ص.ملف, true) + '")';
        b.onclick = function(){ طبّق(ص); };
        g.appendChild(b);
      });
    });
  }

  function استرجع(){ var cur = الحاليّ(); if(cur && cur.ملف) طبّق(cur, false); }

  /* v-bg-once (المالك: «ما أريدها تطلع تلقائيّ، فقط مرّة واحدة عند الدخول»): تظهر مع شاشة
     الدخول الأولى بعد فتح التطبيق، وحين يغادرها المستخدم (أوّل رسالة) تُرفع من الشاشة —
     الاختيار يبقى محفوظًا وعلامته في الإعدادات كما هي — ولا ترجع مع محادثة جديدة حتّى
     الفتح التالي، أو حتّى يختارها بنفسه من الإعدادات. */
  function أخفِ(){
    var html = document.documentElement;
    html.classList.remove('bgimg', 'bgimg-dark', 'bgimg-light');
    var el = document.getElementById('bgImgLayer'); if(el) el.style.backgroundImage = '';
  }
  function راقب_الدخول(){
    if(typeof MutationObserver !== 'function' || !document.body) return;
    var كان = document.body.classList.contains('omranWelcome');
    new MutationObserver(function(){
      var الآن = document.body.classList.contains('omranWelcome');
      if(كان && !الآن && document.documentElement.classList.contains('bgimg')) أخفِ();
      كان = الآن;
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  window.خلفيات = { افتح: افتح, طبّق: طبّق, استرجع: استرجع };
  function ابدأ(){ استرجع(); راقب_الدخول(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ابدأ); else ابدأ();
})();
