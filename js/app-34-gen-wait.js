/* v-gen-wait (أمر المالك: «الموجود فقط كلام يقول جاري توليد الصوره من غير اي شي —
   عطني فكره ذهبيه قويه ينتظر التوليد»، وبعد معاينة النموذج: «نفس الحركه على توليد
   الصور اللي في المحادثه»، ثمّ: «الميزه سويتها في الأنماط والفيديو والازياء الاستايل»):
   بطاقة «استوديو التوليد» الذهبيّة — إطار نابض يدور لمعانه، شيمر يكنس الداخل كأنّ
   العمل يتبلور، نسبة % بمنحنى يتسارع ثمّ يهدأ ولا يتجاوز ٩٢٪ أبدًا (النتيجة تستبدل
   البطاقة فور وصولها فلا تعلق)، مراحل تتبدّل، وعدّاد ثوانٍ مع توقّع صريح للوقت.

   مساران: فقاعات توليد الصور في المحادثة (نصوص «🎨 أرسم لك…»)، ولوحات الأدوات —
   الفيديو #videoMakerStatus، أنماط الصور #portraitStyleStatus، الأزياء #fashionAiStatus.
   لكلّ أداة مراحلها ومدّتها: الفيديو ~دقيقتين ومقاس عريض ١٦/١٠ مع شريط فلم يجري،
   والأنماط ~٤٥ ثانية، والأزياء ~٤٠ ثانية. اللوحات تُرصد ببادئات حالات الانشغال
   (للفيديو 🚀⏳🎬🎥🎨🎙️🎚️🔗✍️، للأنماط ⏳🎞️، للأزياء 🎨 و«جاري تطبيق») فلا تتأثّر
   بتغيّر الصياغة أو اللغة، وحالات التمّ/الخطأ (✅❌⚠️🔑⛔) تُخفي البطاقة فورًا.
   عدّاد الفيديو لا يصفّره تبدّل نصّ الحالة أثناء التوليد الواحد.

   ذاتيّة بالكامل: MutationObserver + IIFE — بلا تعديل على العارض ولا مسارات التوليد،
   ومسار تعديل الصور ذو النقاط الذهبيّة (الذي اختاره المالك) لا يُمسّ. */
(function(){
  if(window.omranGenWait) return;

  var PHRASES = [
    '🎨 أرسم لك الصورة…', '🎨 Generating your image…',
    '🎨 أرسم لك نسخة ثانية…', '🎨 Creating another version…'
  ];

  /* لوحات الأدوات: عنصر الحالة + نوع البطاقة + بادئات «مشغول». البادئة إيموجي فتعمل
     مع كلّ اللغات، وبادئات التمّ/الخطأ (✅❌⚠️🔑⛔) منفصلة عنها فلا تصطدم. */
  var PANELS = [
    { id: 'video', sel: '#videoMakerStatus', kind: 'video',
      busy: ['🚀', '⏳', '🎬', '🎥', '🎨', '🎙️', '🎚️', '🔗', '✍️'] },
    { id: 'styles', sel: '#portraitStyleStatus', kind: 'styles',
      busy: ['⏳', '🎞️'] },
    { id: 'fashion', sel: '#fashionAiStatus', kind: 'fashion',
      busy: ['🎨', 'جاري تطبيق', 'Applying'] }
  ];

  /* لكلّ نوع: مدّة التقدير، التلميح، التوقّع الصريح، المراحل، ونصّ البطء */
  var KINDS = {
    image: {
      est: 30,
      hint: { ar: 'جاري توليد الصورة', en: 'Generating image' },
      expect: { ar: 'الصور تاخذ ~٣٠ ثانية', en: 'images usually take ~30s' },
      stages: {
        ar: ['نفهم طلبك…', 'نرسم التفاصيل…', 'نلوّن المشهد…', 'اللمسات الأخيرة ✨'],
        en: ['Understanding your request…', 'Drawing the details…', 'Coloring the scene…', 'Final touches ✨']
      },
      slow: { ar: 'ما زال يتولّد — الاتصال أبطأ من المعتاد…', en: 'Still generating — slower than usual…' }
    },
    video: {
      est: 120, wide: true, film: true,
      hint: { ar: 'جاري توليد الفيديو', en: 'Generating video' },
      expect: { ar: 'الفيديو ياخذ ١-٣ دقائق', en: 'video usually takes 1-3 min' },
      stages: {
        ar: ['نبني المشاهد…', 'نحرّك الإطارات…', 'نركّب الحركة…', 'اللمسات الأخيرة ✨'],
        en: ['Building the scenes…', 'Animating the frames…', 'Compositing the motion…', 'Final touches ✨']
      },
      slow: { ar: 'ما زال يتولّد — المشاهد السينمائيّة تاخذ وقتًا…', en: 'Still rendering — cinematic scenes take time…' }
    },
    styles: {
      est: 45,
      hint: { ar: 'جاري توليد الأنماط', en: 'Generating styles' },
      expect: { ar: 'الأنماط تاخذ ~٤٥ ثانية', en: 'styles usually take ~45s' },
      stages: {
        ar: ['نحلّل ملامح الصورة…', 'نطبّق الأنماط…', 'نضبط الإضاءة…', 'اللمسات الأخيرة ✨'],
        en: ['Reading your features…', 'Applying the styles…', 'Tuning the light…', 'Final touches ✨']
      },
      slow: { ar: 'ما زال يتولّد — الاتصال أبطأ من المعتاد…', en: 'Still generating — slower than usual…' }
    },
    fashion: {
      est: 40,
      hint: { ar: 'جاري تصميم الإطلالة', en: 'Designing the look' },
      expect: { ar: 'الإطلالات تاخذ ~٤٠ ثانية', en: 'looks usually take ~40s' },
      stages: {
        ar: ['نفهم ذوقك…', 'نرسم القطع…', 'ننسّق الإطلالة…', 'اللمسات الأخيرة ✨'],
        en: ['Reading your taste…', 'Sketching the pieces…', 'Styling the look…', 'Final touches ✨']
      },
      slow: { ar: 'ما زال يتولّد — الاتصال أبطأ من المعتاد…', en: 'Still generating — slower than usual…' }
    }
  };

  var CSS_ID = 'omran-genwait-css';
  var CSS = ''
    + '.genw{display:flex;flex-direction:column;gap:10px;margin:8px 0 2px;width:min(100%,320px)}'
    + '.genw-frame{position:relative;border-radius:16px;animation:genwPulse 2.4s ease-in-out infinite}'
    + '.genw-frame::before{content:"";position:absolute;inset:0;border-radius:16px;padding:2px;pointer-events:none;z-index:3;'
    +   'background:linear-gradient(120deg,transparent 15%,rgba(255,217,120,.15) 30%,#ffe9b0 45%,#d4af37 55%,rgba(255,217,120,.15) 70%,transparent 85%);'
    +   'background-size:280% 100%;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;'
    +   'mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;animation:genwSweep 3.2s linear infinite}'
    + '@keyframes genwSweep{from{background-position:220% 0}to{background-position:-80% 0}}'
    + '@keyframes genwPulse{0%,100%{box-shadow:0 0 22px -6px rgba(212,175,55,.35),0 0 60px -18px rgba(255,233,176,.2)}'
    +   '50%{box-shadow:0 0 34px -4px rgba(212,175,55,.55),0 0 90px -14px rgba(255,233,176,.35)}}'
    + '.genw-canvas{position:relative;border-radius:16px;overflow:hidden;aspect-ratio:1/1;background:#0e1a28;display:flex;align-items:center;justify-content:center}'
    + '.genw-shimmer{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 110%,rgba(212,175,55,.16),transparent 55%),linear-gradient(180deg,#101f30,#0b1622)}'
    + '.genw-shimmer::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 20%,rgba(255,233,176,.14) 50%,transparent 80%);animation:genwShimmer 1.6s linear infinite}'
    + '@keyframes genwShimmer{from{transform:translateX(-110%)}to{transform:translateX(110%)}}'
    + '.genw--video{width:min(100%,360px)}'
    + '.genw--video .genw-canvas{aspect-ratio:16/10}'
    + '.genw-film{position:absolute;left:0;right:0;bottom:0;height:24px;z-index:2;background:'
    +   'repeating-linear-gradient(90deg,transparent 0 6px,rgba(255,233,176,.28) 6px 10px) left top/100% 5px no-repeat,'
    +   'repeating-linear-gradient(90deg,transparent 0 6px,rgba(255,233,176,.28) 6px 10px) left bottom/100% 5px no-repeat,'
    +   'repeating-linear-gradient(90deg,rgba(255,233,176,.07) 0 27px,rgba(255,255,255,.045) 27px 30px) 0 0/100% 100%;'
    +   'background-color:rgba(6,10,16,.55);animation:genwFilm 1.1s linear infinite}'
    + '@keyframes genwFilm{from{background-position:0 0,0 100%,0 0}to{background-position:-30px 0,-30px 100%,-30px 0}}'
    + '.genw-pct{position:relative;z-index:2;text-align:center;font-weight:800;font-size:44px;line-height:1;color:#ffe9b0;text-shadow:0 2px 24px rgba(212,175,55,.5);font-variant-numeric:tabular-nums}'
    + '.genw-pct small{display:block;font-size:12px;font-weight:500;color:rgba(255,255,255,.48);margin-top:6px}'
    + '.genw-track{height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}'
    + '.genw-fill{height:100%;width:0%;border-radius:99px;background:linear-gradient(90deg,#d4af37,#ffe9b0);box-shadow:0 0 12px rgba(255,233,176,.5)}'
    + '.genw-stage{font-size:14px;font-weight:700;min-height:20px;transition:opacity .3s}'
    + '.genw-stage.genw-swap{opacity:0}'
    + '.genw-sub{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}'
    + '.genw-timer{font-size:12px;color:rgba(255,255,255,.48);font-variant-numeric:tabular-nums}'
    + 'html[data-mode="light"] .genw-canvas{background:#f4ecd9}'
    + 'html[data-mode="light"] .genw-shimmer{background:radial-gradient(120% 90% at 50% 110%,rgba(212,175,55,.18),transparent 55%),linear-gradient(180deg,#f8f1e0,#efe4cb)}'
    + 'html[data-mode="light"] .genw-film{background-color:rgba(120,90,30,.18)}'
    + 'html[data-mode="light"] .genw-pct{color:#8a6500;text-shadow:none}'
    + 'html[data-mode="light"] .genw-pct small,html[data-mode="light"] .genw-timer{color:rgba(90,70,20,.55)}'
    + 'html[data-mode="light"] .genw-track{background:rgba(90,70,20,.12)}'
    + '@media (prefers-reduced-motion:reduce){.genw-frame,.genw-frame::before,.genw-shimmer::after,.genw-film{animation:none}}';

  var AR_DIG = '٠١٢٣٤٥٦٧٨٩';
  function toAr(n){ return String(n).replace(/[0-9]/g, function(d){ return AR_DIG[+d]; }); }
  function isAr(){ try{ return (typeof lang !== 'undefined' ? lang : 'ar') === 'ar'; }catch(e){ return true; } }

  /* منحنى التقدّم: يتسارع ثمّ يهدأ — لا يتجاوز ٩٢٪ مهما طال الانتظار (النتيجة تستبدل البطاقة) */
  function eased(p){ return p >= 1 ? 0.92 : (1 - Math.pow(1 - Math.min(p, 1), 2.2)) * 0.92; }

  function ensureCss(){
    if(document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* render(opts) → عنصر البطاقة. opts = { t0:Date.now(), kind:'image'|'video'|'styles'|'fashion' } */
  function render(opts){
    ensureCss();
    var t0 = (opts && Number(opts.t0)) || Date.now();
    var kind = (opts && opts.kind && KINDS[opts.kind]) ? opts.kind : 'image';
    var cfg = KINDS[kind];
    var stages = cfg.stages[isAr() ? 'ar' : 'en'];
    var hint = cfg.hint[isAr() ? 'ar' : 'en'];
    var expect = cfg.expect[isAr() ? 'ar' : 'en'];
    var slowTxt = cfg.slow[isAr() ? 'ar' : 'en'];

    var root = document.createElement('div');
    root.className = 'genw' + (cfg.wide ? ' genw--video' : '');
    root.innerHTML = ''
      + '<div class="genw-frame"><div class="genw-canvas">'
      +   '<div class="genw-shimmer"></div>'
      +   (cfg.film ? '<div class="genw-film"></div>' : '')
      +   '<div class="genw-pct">0%<small></small></div>'
      + '</div></div>'
      + '<div class="genw-track"><div class="genw-fill"></div></div>'
      + '<div class="genw-stage"></div>'
      + '<div class="genw-sub"><span class="genw-timer"></span></div>';

    var pctEl = root.querySelector('.genw-pct');
    var pctSmall = pctEl.querySelector('small');
    var fillEl = root.querySelector('.genw-fill');
    var stageEl = root.querySelector('.genw-stage');
    var timerEl = root.querySelector('.genw-timer');
    pctSmall.textContent = hint;
    stageEl.textContent = stages[0];

    var stageIdx = 0, slow = false;
    function fmt(n){ return isAr() ? toAr(n) : String(n); }
    timerEl.textContent = '⏱ ' + fmt(0) + (isAr() ? 'ث' : 's') + ' — ' + expect;
    /* الساعة تبدأ بعد ما تُركّب البطاقة: أول نبضة قد تأتي والعنصر لم يُلحق بعد
       (render يُستدعى ثمّ يُلحق الناتج) فلا نطفئها إلا بعد اتصالٍ سابق. */
    var wasConnected = false;
    function tick(){
      if(!root.isConnected){
        if(wasConnected) clearInterval(iv);
        return;
      }
      wasConnected = true;
      var el = (Date.now() - t0) / 1000;
      var p = el / cfg.est;
      var shown = Math.min(99, Math.round(eased(p) * 100));
      pctEl.firstChild.textContent = fmt(shown) + '%';
      fillEl.style.width = shown + '%';
      timerEl.textContent = '⏱ ' + fmt(Math.floor(el)) + (isAr() ? 'ث' : 's') + ' — ' + expect;
      if(el > cfg.est * 2 && !slow){
        slow = true;
        stageEl.classList.add('genw-swap');
        setTimeout(function(){ stageEl.textContent = slowTxt; stageEl.classList.remove('genw-swap'); }, 300);
      } else if(!slow){
        var want = Math.min(stages.length - 1, Math.floor(p * stages.length));
        if(want !== stageIdx){
          stageIdx = want;
          stageEl.classList.add('genw-swap');
          setTimeout(function(){ stageEl.textContent = stages[stageIdx]; stageEl.classList.remove('genw-swap'); }, 300);
        }
      }
    }
    var iv = setInterval(tick, 150);
    tick();
    return root;
  }

  /* الرصد: فقاعة نصّها أحد أسطر «أرسم لك…» ولا بطاقة فيها ← نركّب بطاقة.
     زمن البداية لكلّ نصّ يُحفظ فلا يصفّره renderAll، ويُنسى حين تختفي الفقاعة. */
  var t0ByText = Object.create(null);
  /* زمن بداية كلّ لوحة: يبقى طول التوليد الواحد (الفيديو يبدّل نصّ حالته 🚀→⏳→🎬)
     ولا يُصفَّر إلا حين ينتهي الاشتغال أو تُزال البطاقة. */
  var t0ByPanel = Object.create(null);
  function scan(){
    if(!document.body) return;
    var active = Object.create(null);
    var els = document.querySelectorAll('.msg-text');
    for(var i = 0; i < els.length; i++){
      var el = els[i];
      var txt = '';
      try{ txt = String(el.textContent || '').trim(); }catch(e){ continue; }
      if(PHRASES.indexOf(txt) === -1) continue;
      var host = el.parentNode;
      if(!host || host.querySelector('.genw')) { active[txt] = 1; continue; }
      active[txt] = 1;
      if(!t0ByText[txt]) t0ByText[txt] = Date.now();
      try{ host.appendChild(render({ t0: t0ByText[txt] })); }catch(e){ try{ __swallow(e, 'gen-wait:scan'); }catch(_){ /* لا سجلّ هنا — العرض تجميليّ */ } }
    }
    for(var k in t0ByText){ if(!active[k]) delete t0ByText[k]; }

    /* لوحات الأدوات: حالة نصّها بادئة «مشغول» ولا بطاقة بعدها ← نركّب؛ انتهى ← نرفع */
    for(var pi = 0; pi < PANELS.length; pi++){
      var p = PANELS[pi];
      var pel = null;
      try{ pel = document.querySelector(p.sel); }catch(e){ pel = null; }
      if(!pel || !pel.parentNode) continue;
      var ptxt = '';
      try{ ptxt = String(pel.textContent || '').trim(); }catch(e){ ptxt = ''; }
      var busy = false;
      for(var bi = 0; ptxt && bi < p.busy.length; bi++){
        if(ptxt.indexOf(p.busy[bi]) === 0){ busy = true; break; }
      }
      var card = null;
      try{ card = pel.parentNode.querySelector('.genw[data-genw-panel="' + p.id + '"]'); }catch(e){ card = null; }
      if(busy && !card){
        if(!t0ByPanel[p.id]) t0ByPanel[p.id] = Date.now();
        try{
          var node = render({ t0: t0ByPanel[p.id], kind: p.kind });
          node.setAttribute('data-genw-panel', p.id);
          pel.parentNode.insertBefore(node, pel.nextSibling);
        }catch(e){ try{ __swallow(e, 'gen-wait:panel'); }catch(_){ /* العرض تجميليّ */ } }
      } else if(!busy && card){
        try{ card.parentNode.removeChild(card); }catch(e){ try{ __swallow(e, 'gen-wait:done'); }catch(_){ /* العرض تجميليّ */ } }
        delete t0ByPanel[p.id];
      }
    }
  }

  var scheduled = false;
  function schedule(){
    if(scheduled) return;
    scheduled = true;
    setTimeout(function(){ scheduled = false; scan(); }, 60);
  }

  if(typeof MutationObserver !== 'undefined' && document.documentElement){
    try{
      new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }catch(e){ try{ __swallow(e, 'gen-wait:observe'); }catch(_){ /* بلا رصد = بلا بطاقة فقط */ } }
  }
  schedule();

  window.omranGenWait = { render: render, scan: scan, _eased: eased, PHRASES: PHRASES, PANELS: PANELS, KINDS: KINDS };
})();
