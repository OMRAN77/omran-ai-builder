/* v-gen-wait (أمر المالك: «الموجود فقط كلام يقول جاري توليد الصوره من غير اي شي —
   عطني فكره ذهبيه قويه ينتظر التوليد»، وبعد معاينة النموذج: «نفس الحركه على توليد
   الصور اللي في المحادثه»): بطاقة «استوديو التوليد» لرسائل توليد الصور في المحادثة —
   إطار ذهبيّ نابض يدور لمعانه، شيمر يكنس الداخل كأنّ الصورة تتبلور، نسبة % بمنحنى
   يتسارع ثمّ يهدأ ولا يتجاوز ٩٢٪ أبدًا (النتيجة تستبدل الرسالة فور وصولها فلا تعلق)،
   مراحل تتبدّل، وعدّاد ثوانٍ مع توقّع صريح للوقت.

   ذاتيّة بالكامل: ترصد MutationObserver فقاعات «🎨 أرسم لك الصورة… / نسخة ثانية» وتركّب
   البطاقة فيها — بلا تعديل على العارض ولا مسارات التوليد، وبلا أسماء علويّة (IIFE).
   زمن البداية يُحفظ لنصّ الفقاعة فلا يصفّره renderAll، والساعة تتوقّف حين تُزال البطاقة.
   مسار تعديل الصور ذو النقاط الذهبيّة (الذي اختاره المالك) لا يُمسّ. */
(function(){
  if(window.omranGenWait) return;

  var PHRASES = [
    '🎨 أرسم لك الصورة…', '🎨 Generating your image…',
    '🎨 أرسم لك نسخة ثانية…', '🎨 Creating another version…'
  ];

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
    + 'html[data-mode="light"] .genw-pct{color:#8a6500;text-shadow:none}'
    + 'html[data-mode="light"] .genw-pct small,html[data-mode="light"] .genw-timer{color:rgba(90,70,20,.55)}'
    + 'html[data-mode="light"] .genw-track{background:rgba(90,70,20,.12)}'
    + '@media (prefers-reduced-motion:reduce){.genw-frame,.genw-frame::before,.genw-shimmer::after{animation:none}}';

  var AR_DIG = '٠١٢٣٤٥٦٧٨٩';
  function toAr(n){ return String(n).replace(/[0-9]/g, function(d){ return AR_DIG[+d]; }); }
  function isAr(){ try{ return (typeof lang !== 'undefined' ? lang : 'ar') === 'ar'; }catch(e){ return true; } }

  var STAGES = {
    ar: ['نفهم طلبك…', 'نرسم التفاصيل…', 'نلوّن المشهد…', 'اللمسات الأخيرة ✨'],
    en: ['Understanding your request…', 'Drawing the details…', 'Coloring the scene…', 'Final touches ✨']
  };
  var SLOW = { ar: 'ما زال يتولّد — الاتصال أبطأ من المعتاد…', en: 'Still generating — slower than usual…' };
  var HINT = { ar: 'جاري توليد الصورة', en: 'Generating image' };
  var EXPECT = { ar: 'الصور تاخذ ~٣٠ ثانية', en: 'images usually take ~30s' };
  var EST_SEC = 30;

  /* منحنى التقدّم: يتسارع ثمّ يهدأ — لا يتجاوز ٩٢٪ مهما طال الانتظار (النتيجة تستبدل البطاقة) */
  function eased(p){ return p >= 1 ? 0.92 : (1 - Math.pow(1 - Math.min(p, 1), 2.2)) * 0.92; }

  function ensureCss(){
    if(document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* render(opts) → عنصر البطاقة. opts = { t0:Date.now() } */
  function render(opts){
    ensureCss();
    var t0 = (opts && Number(opts.t0)) || Date.now();
    var stages = STAGES[isAr() ? 'ar' : 'en'];
    var hint = HINT[isAr() ? 'ar' : 'en'];
    var expect = EXPECT[isAr() ? 'ar' : 'en'];
    var slowTxt = SLOW[isAr() ? 'ar' : 'en'];

    var root = document.createElement('div');
    root.className = 'genw';
    root.innerHTML = ''
      + '<div class="genw-frame"><div class="genw-canvas">'
      +   '<div class="genw-shimmer"></div>'
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
    function tick(){
      if(!root.isConnected){ clearInterval(iv); return; }
      var el = (Date.now() - t0) / 1000;
      var p = el / EST_SEC;
      var shown = Math.min(99, Math.round(eased(p) * 100));
      pctEl.firstChild.textContent = fmt(shown) + '%';
      fillEl.style.width = shown + '%';
      timerEl.textContent = '⏱ ' + fmt(Math.floor(el)) + (isAr() ? 'ث' : 's') + ' — ' + expect;
      if(el > EST_SEC * 2 && !slow){
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

  window.omranGenWait = { render: render, scan: scan, _eased: eased, PHRASES: PHRASES };
})();
