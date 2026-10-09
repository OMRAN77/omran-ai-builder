/* v-bg-images — خلفيّات الشاشة.
   الصور في assets/خلفيات/ وفهرسها فهرس.json (يولّده scripts/خلفيات.mjs مع المصغّرات واللون المهيمن).
   الإعدادات ← المظهر ← خلفيّات الشاشة: شبكة مصغّرات بلا أسماء؛ الاختيار يضع الصورة خلف الشاشة كلّها
   (#bgImgLayer) ويضبط ألوان الكتابة على لونها (html.bgimg-dark / html.bgimg-light في css/خلفيات.css)،
   ويطفئ الخلفيّة الثلاثيّة — خلفيّة واحدة في كلّ وقت (والعكس في applyBg3D).
   v-bg-custom-rotate: «أضف صورة من جهازك» (تُصغَّر على Canvas وتُحفظ على الجهاز aiapp_bgimg_custom بمعرّف
   custom:…) مع × لحذفها، و«تبديل تلقائيّ» كلّ ١٠ دقائق / ٣٠ دقيقة / ساعة (aiapp_bgimg_rotate بالدقائق؛
   آخر تبديل aiapp_bgimg_rotate_at فيُكمل العدّ بعد إعادة الفتح) يمرّ على صور الجهاز ثمّ صور المجلّد بالترتيب.
   v-skin-wood (أمر المالك ٤ أكتوبر بصورة «أعطني بالضبط مرتّبة نفس هذي في الخلفيّات، إذا اختارها يستوي نفسها»): الثيمات
   خلفيّات تكسو الواجهة كلّها لا الشاشة وحدها — «خشبي» أوّلها (css/ثيم-خشبي.css، خاماته assets/ثيمات/خشبي/). مصغّره في
   الشبكة بعد «صورة من جهازك»، ويُحفظ كأيّ خلفيّة ({ ملف:'ثيم:خشبي', ثيم:'wood' })، ولا يدخل التبديل التلقائيّ.
   («بيت» لوحة المعاينة الفارغة — الشعار النحاسيّ وزرّ + وآخر المحادثات والأزرار الدائريّة — شيل بأمر المالك بعد الثيمات:
   «شيل هذا من البنّيّ»؛ اللوحة الفارغة بكتّانها وحده كبقيّة الثيمات.) */
(function(){
  var KEY = 'aiapp_bgimg', KEY_CUSTOM = 'aiapp_bgimg_custom', KEY_ROT = 'aiapp_bgimg_rotate', KEY_ROT_AT = 'aiapp_bgimg_rotate_at';
  var BASE = '/assets/' + encodeURIComponent('خلفيات') + '/';
  var CUSTOM = 'custom:', MAX_PX = 1600, MAX_CUSTOM = 12;
  /* v-bg-fresh (المالك ٩ أكتوبر بعد دمج الخلفيّات الموضَّحة: «بعده الصور نفس الشي»): الصور بالأسماء نفسها، وعامل الخدمة يعرضها
     من الكاش أوّلًا (stale-while-revalidate) والـCDN يحفظها يومًا — فالقديمة تبقى. وسم إصدار على رابط الصورة والمصغّر يجلب الجديدة فورًا؛
     ارفعه عند كلّ تبديل لصور المجلّد. */
  var BG_VER = 2;
  var فهرس = null, تحميل = null, مؤقّت = null;
  var ثيمات = { 'خشبي': { ملف: 'ثيم:خشبي', ثيم: 'wood', عنوان: 'bgThemeWood', لون: '#ece3d3', فاتحة: true, مصغّر: '/assets/' + encodeURIComponent('ثيمات') + '/' + encodeURIComponent('خشبي') + '/' + encodeURIComponent('مصغّر.jpg') + '?v=1' } };
  /* v-themes (أمر المالك ٤ أكتوبر: «كمّل الثيمات الباقية» — نفس فكرة الخشبيّ على التصميم الجديد): ثلاثة عشر ثيمًا تكسوها
     css/ثيمات.css بمتغيّرات --th-* تحت html.skin + skin-<معرّف>؛ ثيمات المشهد (صور المالك: الغروب والشاطئ والشتاء، وشاشات
     الترحيب الأربع بلا كتابتها) تضيف skin-scene: الصورة خلف الشاشة واللوحتان الجانبيّتان زجاج ملوّن فوقها. خاماتها
     assets/ثيمات/<المجلّد>/ يولّدها scripts/ثيمات.mjs. [المجلّد، المعرّف، مفتاح الاسم، اللون، فاتحة؟، مشهد؟] */
  [['خشب-داكن', 'darkwood', 'bgThemeDarkwood', '#2a1c12', false], ['رخام', 'marble', 'bgThemeMarble', '#111112', false],
   ['برمجة', 'code', 'bgThemeCode', '#0f161b', false], ['مركبات', 'cars', 'bgThemeCars', '#17181b', false],
   ['أطفال', 'kids', 'bgThemeKids', '#efe9fb', true], ['طهي', 'cuisine', 'bgThemeCuisine', '#f7f1ee', true],
   ['غروب', 'sunset', 'bgThemeSunset', '#7a4a5a', false, true], ['شاطئ', 'beach', 'bgThemeBeach', '#8fd0e0', true, true],
   ['شتاء', 'winter', 'bgThemeWinter', '#d5dce4', true, true], ['كراج', 'garage', 'bgThemeGarage', '#141416', false, true],
   ['أنمي', 'anime', 'bgThemeAnime', '#1d1430', false, true], ['أمن-سيبراني', 'cyber', 'bgThemeCyber', '#06121f', false, true],
   ['فصل', 'school', 'bgThemeSchool', '#3a3226', false, true],
   /* v-themes-ten (المالك ٩ أكتوبر «عطني ١٠ أشكال جديدة… أنمي ٤ وسيارات ٣ ودراسيّة ٣»): عشر ثيمات مشهد من صوره */
   ['أنمي-قتالي', 'tactical', 'bgThemeTactical', '#7a0f2e', false, true],
   ['ملاك', 'angel', 'bgThemeAngel', '#c9d8ea', true, true],
   ['أنمي-نيون', 'neonanime', 'bgThemeNeonAnime', '#050607', false, true],
   ['محطّة', 'station', 'bgThemeStation', '#3a3f44', false, true],
   ['سباق', 'rally', 'bgThemeRally', '#5a5440', false, true],
   ['دخان', 'smoke', 'bgThemeSmoke', '#071a33', false, true],
   ['مكتبة', 'library', 'bgThemeLibrary', '#cfeef0', true, true],
   ['مقهى', 'cafe', 'bgThemeCafe', '#e8d8c2', true, true],
   ['ورشة', 'workshop', 'bgThemeWorkshop', '#1a1830', false, true],
   ['عصري', 'modern', 'bgThemeModern', '#d9d2c6', true, true]].forEach(function(a){
    ثيمات[a[0]] = { ملف: 'ثيم:' + a[0], ثيم: a[1], عنوان: a[2], لون: a[3], فاتحة: a[4], مشهد: !!a[5],
      مصغّر: '/assets/' + encodeURIComponent('ثيمات') + '/' + encodeURIComponent(a[0]) + '/' + encodeURIComponent('مصغّر.jpg') + '?v=2' }; // v-bg-fresh: مصغّرات الثلاثة عشر أُعيد توليدها (v-scene-clear/sharp)
  });
  function ثيم(اسم){ return ثيمات[اسم] || null; }

  function نصّ(k, d){ return typeof t === 'function' ? (t(k) || d) : d; }
  function خاصّة(){
    try{ var s = localStorage.getItem(KEY_CUSTOM); var a = s ? JSON.parse(s) : []; return Array.isArray(a) ? a : []; }
    catch(e){ __swallow(e, 'bgimg:custom-read'); return []; }
  }
  function احفظ_خاصّة(a){
    try{ localStorage.setItem(KEY_CUSTOM, JSON.stringify(a)); return true; }
    catch(e){ __swallow(e, 'bgimg:custom-save'); return false; }
  }
  function رابط(ملف, مصغّر){
    if(ملف.indexOf(CUSTOM) === 0){
      var id = ملف.slice(CUSTOM.length), hit = خاصّة().filter(function(s){ return s.id === id; })[0];
      return hit ? hit.data : '';
    }
    return BASE + (مصغّر ? encodeURIComponent('مصغّرات') + '/' : '') + encodeURIComponent(ملف) + '?v=' + BG_VER;
  }
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
    g.querySelectorAll('.bgImgOpt').forEach(function(b){ if(!b.classList.contains('bgImgAdd')) b.classList.toggle('active', (b.dataset.file || '') === (ملف || '')); });
  }

  function طبّق(صورة, حفظ){
    var html = document.documentElement;
    كسوة(صورة && صورة.ثيم ? صورة.ثيم : '');
    if(!صورة){
      html.classList.remove('bgimg', 'bgimg-dark', 'bgimg-light');
      var el = document.getElementById('bgImgLayer'); if(el) el.style.backgroundImage = '';
      if(حفظ !== false){ try{ localStorage.removeItem(KEY); }catch(e){ __swallow(e, 'bgimg:clear'); } }
      دوّر(0); // بلا خلفيّة = بلا تبديل
      علّم(null);
      return;
    }
    var src = صورة.ثيم ? '' : رابط(صورة.ملف);
    if(!src && !صورة.ثيم){ طبّق(null); return; } // صورة جهاز حُذفت
    طبقة().style.backgroundImage = src ? 'url("' + src + '")' : ''; // الثيم: خامة الطبقة من CSS الثيم
    html.style.setProperty('--bgimg-tint', صورة.لون || '#000');
    html.classList.add('bgimg');
    html.classList.toggle('bgimg-light', !!صورة.فاتحة);
    html.classList.toggle('bgimg-dark', !صورة.فاتحة);
    if(حفظ !== false){
      try{ localStorage.setItem(KEY, JSON.stringify(صورة.ثيم ? { ملف: صورة.ملف, ثيم: صورة.ثيم, لون: صورة.لون, فاتحة: !!صورة.فاتحة } : { ملف: صورة.ملف, لون: صورة.لون, فاتحة: !!صورة.فاتحة })); }
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

  // ── الثيمات (v-skin-wood) ──
  function كسوة(اسم){
    var html = document.documentElement;
    var مدخل = null;
    Object.keys(ثيمات).forEach(function(k){ var c = 'skin-' + ثيمات[k].ثيم; if(c !== 'skin-' + اسم) html.classList.remove(c); else مدخل = ثيمات[k]; });
    if(اسم) html.classList.add('skin-' + اسم);
    // الخشبيّ بملفّه (css/ثيم-خشبي.css)؛ الباقي بالمتغيّرات العامّة، والمشهد يُعرف من السجلّ لا من المحفوظ
    html.classList.toggle('skin', !!مدخل && اسم !== 'wood');
    html.classList.toggle('skin-scene', !!(مدخل && مدخل.مشهد));
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

  // ── صور الجهاز ──
  function اقرأ(file){
    // تصغير إلى ١٦٠٠ بكسل على الأكثر (JPEG) ولون مهيمن كما في scripts/خلفيات.mjs
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        try{
          var k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var s = document.createElement('canvas'); s.width = 16; s.height = 16;
          var sx = s.getContext('2d'); sx.drawImage(c, 0, 0, 16, 16);
          var d = sx.getImageData(0, 0, 16, 16).data, r = 0, g = 0, b = 0;
          for(var i = 0; i < d.length; i += 4){ r += d[i]; g += d[i + 1]; b += d[i + 2]; }
          var n = d.length / 4; r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
          var luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          res({ id: String(Date.now()), data: c.toDataURL('image/jpeg', 0.82),
                لون: '#' + [r, g, b].map(function(v){ return v.toString(16).padStart(2, '0'); }).join(''), فاتحة: luma > 0.55 });
        }catch(e){ rej(e); }
        finally{ URL.revokeObjectURL(url); }
      };
      img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('صورة غير صالحة')); };
      img.src = url;
    });
  }
  function أضف(صورة){
    var a = خاصّة().filter(function(s){ return s.id !== صورة.id; });
    a.unshift({ id: صورة.id, data: صورة.data, لون: صورة.لون, فاتحة: !!صورة.فاتحة });
    while(a.length > MAX_CUSTOM) a.pop();
    if(!احفظ_خاصّة(a)){ if(typeof alert === 'function') alert(نصّ('bgImgFull', 'لا مساحة كافية على الجهاز لهذه الصورة')); return false; }
    ابنِ();
    طبّق({ ملف: CUSTOM + صورة.id, لون: صورة.لون, فاتحة: صورة.فاتحة });
    return true;
  }
  function احذف(id){
    احفظ_خاصّة(خاصّة().filter(function(s){ return s.id !== id; }));
    var cur = الحاليّ();
    ابنِ();
    if(cur && cur.ملف === CUSTOM + id) طبّق(null);
  }
  function اختر(){
    var inp = document.getElementById('bgImgFile'); if(!inp) return;
    inp.value = '';
    inp.onchange = function(){
      var f = inp.files && inp.files[0]; if(!f) return;
      اقرأ(f).then(أضف).catch(function(e){ __swallow(e, 'bgimg:file'); if(typeof alert === 'function') alert(نصّ('bgImgBad', 'تعذّر قراءة الصورة')); });
    };
    inp.click();
  }

  // ── التبديل التلقائيّ ──
  function دقائق(){ var v = parseInt(localStorage.getItem(KEY_ROT) || '0', 10); return v > 0 ? v : 0; }
  function كلّها(){ return خاصّة().map(function(s){ return { ملف: CUSTOM + s.id, لون: s.لون, فاتحة: s.فاتحة }; }).concat(فهرس || []); }
  function التالي(){
    return حمّل().then(function(){
      var list = كلّها(); if(!list.length) return;
      var cur = الحاليّ(), i = -1;
      if(cur) list.forEach(function(s, k){ if(s.ملف === cur.ملف) i = k; });
      طبّق(list[(i + 1) % list.length]);
      try{ localStorage.setItem(KEY_ROT_AT, String(Date.now())); }catch(e){ __swallow(e, 'bgimg:rotate-at'); }
    });
  }
  function جدول(){
    if(مؤقّت){ clearTimeout(مؤقّت); مؤقّت = null; }
    var m = دقائق(); if(!m) return;
    var آخر = parseInt(localStorage.getItem(KEY_ROT_AT) || '0', 10) || 0;
    var باقٍ = Math.max(1000, m * 60000 - (Date.now() - آخر));
    مؤقّت = setTimeout(function(){ مؤقّت = null; التالي().then(جدول); }, باقٍ);
  }
  function دوّر(m){
    m = m > 0 ? m : 0;
    try{
      if(m){ localStorage.setItem(KEY_ROT, String(m)); localStorage.setItem(KEY_ROT_AT, String(Date.now())); }
      else { localStorage.removeItem(KEY_ROT); localStorage.removeItem(KEY_ROT_AT); }
    }catch(e){ __swallow(e, 'bgimg:rotate-save'); }
    علّم_تبديل();
    جدول();
    if(m && !الحاليّ()) التالي(); // اختار مدّة بلا خلفيّة: نبدأ بأوّل صورة فورًا
  }
  function علّم_تبديل(){
    var box = document.getElementById('bgImgRotateOpts'); if(!box) return;
    var m = دقائق();
    box.querySelectorAll('.bgImgRotOpt').forEach(function(b){ b.classList.toggle('active', parseInt(b.dataset.min || '0', 10) === m); });
  }

  // ── الشبكة ──
  function ابنِ(){
    var g = document.getElementById('bgImgGrid');
    if(!g || !فهرس) return;
    var cur = الحاليّ();
    g.innerHTML = '';
    var none = document.createElement('button');
    none.type = 'button';
    none.className = 'bgImgOpt bgImgNone' + (cur ? '' : ' active');
    none.dataset.file = '';
    none.textContent = نصّ('bgImgNone', 'بلا خلفيّة');
    none.onclick = function(){ طبّق(null); };
    g.appendChild(none);
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'bgImgOpt bgImgAdd';
    add.textContent = '+ ' + نصّ('bgImgAdd', 'صورة من جهازك');
    add.onclick = اختر;
    g.appendChild(add);
    Object.keys(ثيمات).forEach(function(اسم){
      var ث = ثيمات[اسم], b = document.createElement('button');
      b.type = 'button';
      b.className = 'bgImgOpt bgImgTheme' + (cur && cur.ملف === ث.ملف ? ' active' : '');
      b.dataset.file = ث.ملف;
      b.title = نصّ(ث.عنوان, اسم);
      b.setAttribute('aria-label', b.title);
      b.style.backgroundImage = 'url("' + ث.مصغّر + '")';
      b.onclick = function(){ طبّق(ث); };
      g.appendChild(b);
    });
    كلّها().forEach(function(ص){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bgImgOpt' + (ص.ملف.indexOf(CUSTOM) === 0 ? ' bgImgCustom' : '') + (cur && cur.ملف === ص.ملف ? ' active' : '');
      b.dataset.file = ص.ملف;
      b.style.backgroundImage = 'url("' + رابط(ص.ملف, true) + '")';
      b.onclick = function(){ طبّق(ص); };
      if(ص.ملف.indexOf(CUSTOM) === 0){
        var x = document.createElement('span');
        x.className = 'bgImgDel';
        x.textContent = '×';
        x.title = نصّ('bgImgDelete', 'حذف');
        x.onclick = function(ev){ if(ev && ev.stopPropagation) ev.stopPropagation(); احذف(ص.ملف.slice(CUSTOM.length)); };
        b.appendChild(x);
      }
      g.appendChild(b);
    });
  }
  function افتح(){
    var g = document.getElementById('bgImgGrid');
    if(!g || g.dataset.ready) return;
    g.dataset.ready = '1';
    var box = document.getElementById('bgImgRotateOpts');
    if(box && !box.dataset.ready){
      box.dataset.ready = '1';
      box.querySelectorAll('.bgImgRotOpt').forEach(function(b){ b.onclick = function(){ دوّر(parseInt(b.dataset.min || '0', 10)); }; });
      علّم_تبديل();
    }
    return حمّل().then(function(list){
      if(!list.length){ g.dataset.ready = ''; return; }
      ابنِ();
    });
  }

  function استرجع(){
    var cur = الحاليّ(); if(cur && cur.ملف) طبّق(cur, false);
    جدول();
  }

  window.خلفيات = { افتح: افتح, طبّق: طبّق, استرجع: استرجع, أضف: أضف, احذف: احذف, دوّر: دوّر, التالي: التالي, ثيم: ثيم };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', استرجع); else استرجع();
})();
