/* v-gen-wait (أمر المالك: «الموجود فقط كلام يقول جاري توليد الصوره
   من غير اي شي — عطني فكره ذهبيه قويه ينتظر التوليد»، وبعد معاينة النموذج: «نفس الحركه على توليد
   الصور اللي في المحادثه»، ثمّ: «الميزه سويتها في الأنماط والفيديو والازياء الاستايل»):
   بطاقة «استوديو التوليد» الذهبيّة — إطار نابض يدور لمعانه، شيمر يكنس الداخل كأنّ
   العمل يتبلور، نسبة % بمنحنى يتسارع ثمّ يهدأ ولا يتجاوز ٩٢٪ أبدًا (النتيجة تستبدل
   البطاقة فور وصولها فلا تعلق)، مراحل تتبدّل، وعدّاد ثوانٍ مع توقّع صريح للوقت.

   مسارات ثلاثة: فقاعات توليد الصور في المحادثة (نصوص «🎨 أرسم لك…»)، وفيديو المحادثة
   (سطر «🎬 جاري إنشاء الفيديو…» في شريط الحالة داخل فقاعة التفكير — v-gen-wait-chatvideo)،
   ولوحات الأدوات — الفيديو #videoMakerStatus، أنماط الصور #portraitStyleStatus، الأزياء #fashionAiStatus.
   لكلّ أداة مراحلها ومدّتها: الفيديو ~دقيقتين ومقاس عريض ١٦/١٠ مع شريط فلم يجري،
   والأنماط ~٤٥ ثانية، والأزياء ~٤٠ ثانية. اللوحات تُرصد ببادئات حالات الانشغال
   (للفيديو 🚀⏳🎬🎥🎨🎙️🎚️🔗✍️، للأنماط ⏳🎞️، للأزياء 🎨 و«جاري تطبيق») فلا تتأثّر
   بتغيّر الصياغة أو اللغة، وحالات التمّ/الخطأ (✅❌⚠️🔑⛔) تُخفي البطاقة فورًا.
   عدّاد الفيديو لا يصفّره تبدّل نصّ الحالة أثناء التوليد الواحد.

   ذاتيّة بالكامل: MutationObserver + IIFE — بلا تعديل على العارض ولا مسارات التوليد،
   ومسار تعديل الصور ذو النقاط الذهبيّة (الذي اختاره المالك) لا يُمسّ.

   v-gen-scene (المالك ١١ أكتوبر، بصورة «برج الأزياء»: «في الأزياء تطلّع لي هذي عند توليد الصورة، لكن
   تكون ممطرة، والعدّاد يشتغل [يبدأ من الصفر]، ويكون فوق مش تحت»): بطاقة الأزياء صارت مشهدًا — صورة المالك
   خلفيّةً (assets/fashion/gen-scene.webp، وعدّاد «75%» المرسوم فيها مطموس)، فوقها مطر متحرّك وتموّجات على
   الأرضيّة، وعدّاد حيّ في مكان المرسوم: حلقة تمتلئ ورقم يبدأ من ٠ وشريط ومرحلة. وتُركَّب أعلى الاستوديو
   (قبل تبويبَي «من صورة / من وصف») لا تحت زرّ «صمم»، ويُمرَّر إليها. التعديل الموضعيّ («جاري تطبيق…»)
   يبقى تحت سطر الحالة حيث ينظر المستخدم. بلا نصّ جديد: المراحل والتوقّع كما هي. */
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
      busy: ['🚀', '⏳', '🎬', '🎥', '🎨', '🎙️', '🎚️', '🔗', '✍️', '💳'] },
    { id: 'styles', sel: '#portraitStyleStatus', kind: 'styles',
      busy: ['⏳', '🎞️'] },
    { id: 'fashion', sel: '#fashionAiStatus', kind: 'fashion',
      busy: ['🎨', 'جاري تطبيق', 'Applying'],
      /* v-gen-scene: التوليد (🎨) يُركَّب أعلى الاستوديو قبل صفّ التبويبين؛ البطاقة تُبحث في النافذة كلّها */
      scope: '#fashionAiModal', topSel: '#fashionAiTabImage', top: ['🎨'] }
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
      est: 40, scene: '/assets/fashion/gen-scene.webp?v=1',
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

  /* v-gen-scene: بلاطة مطر SVG (خطوط تخفت من أعلاها) — ثلاث طبقات بمقاسات وسرعات مختلفة فلا يبدو المطر شبكة */
  function rainTile(w, h, streaks, sw){
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="#cfeaff" stop-opacity="0"/><stop offset="1" stop-color="#cfeaff" stop-opacity=".9"/></linearGradient></defs>';
    for(var i = 0; i < streaks.length; i++) svg += '<rect x="' + streaks[i][0] + '" y="' + streaks[i][1] + '" width="' + sw + '" height="' + streaks[i][2] + '" fill="url(#g)"/>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg + '</svg>') + '")';
  }
  var ARC_LEN = 276.5; /* محيط حلقة العدّاد (نصف قطر ٤٤ في إطار ١٠٠) */
  function sceneCss(){
    return ''
    + '.genw--scene{width:min(100%,760px);margin:10px auto 14px}'
    + '.genw--scene .genw-frame{animation:genwNeon 2.6s ease-in-out infinite}'
    + '.genw--scene .genw-frame::before{background:linear-gradient(120deg,transparent 15%,rgba(125,249,255,.15) 30%,#bff6ff 45%,#ff7bd5 55%,rgba(125,249,255,.15) 70%,transparent 85%);background-size:280% 100%}'
    + '@keyframes genwNeon{0%,100%{box-shadow:0 0 22px -6px rgba(125,249,255,.4),0 0 60px -18px rgba(255,123,213,.25)}'
    +   '50%{box-shadow:0 0 34px -4px rgba(125,249,255,.6),0 0 90px -14px rgba(255,123,213,.4)}}'
    + '.genw--scene .genw-canvas,html[data-mode="light"] .genw--scene .genw-canvas{display:block;aspect-ratio:1024/559;background:#070b22 center/cover no-repeat}'
    /* المطر: الحاوية مائلة، وكلّ طبقة تنزل بمقدار بلاطتها بالضبط فتتكرّر بلا قفزة (transform وحده — لا إعادة رسم) */
    + '.genw-rain{position:absolute;top:-30%;bottom:-30%;left:-12%;right:-12%;transform:rotate(9deg);pointer-events:none;z-index:1}'
    + '.genw-rain i{position:absolute;left:0;right:0;top:-260px;bottom:0;background-repeat:repeat}'
    + '.genw-rain i:nth-child(1){background-image:' + rainTile(120, 260, [[18, 8, 54], [74, 122, 60], [104, 44, 46], [46, 196, 50]], 1.5) + ';background-size:120px 260px;opacity:.8;animation:genwRain1 .62s linear infinite}'
    + '.genw-rain i:nth-child(2){background-image:' + rainTile(90, 200, [[12, 20, 34], [58, 96, 38], [80, 150, 30], [34, 60, 32]], 1.1) + ';background-size:90px 200px;opacity:.55;animation:genwRain2 .85s linear infinite}'
    + '.genw-rain i:nth-child(3){background-image:' + rainTile(60, 150, [[8, 10, 22], [36, 70, 24], [52, 118, 20], [22, 40, 20]], 0.9) + ';background-size:60px 150px;opacity:.38;animation:genwRain3 1.15s linear infinite}'
    + '@keyframes genwRain1{to{transform:translate3d(0,260px,0)}}'
    + '@keyframes genwRain2{to{transform:translate3d(0,200px,0)}}'
    + '@keyframes genwRain3{to{transform:translate3d(0,150px,0)}}'
    /* تموّجات قطرات على الأرضيّة المبلّلة (الربع السفليّ من الصورة) */
    + '.genw-rip{position:absolute;left:0;right:0;bottom:0;height:24%;pointer-events:none;z-index:1}'
    + '.genw-rip i{position:absolute;width:9%;aspect-ratio:4/1;border:1px solid rgba(190,236,255,.75);border-radius:50%;opacity:0;animation:genwRip 1.9s ease-out infinite}'
    + '.genw-rip i:nth-child(1){left:14%;top:22%}'
    + '.genw-rip i:nth-child(2){left:31%;top:58%;animation-delay:.45s}'
    + '.genw-rip i:nth-child(3){left:47%;top:30%;animation-delay:.9s}'
    + '.genw-rip i:nth-child(4){left:63%;top:66%;animation-delay:.25s}'
    + '.genw-rip i:nth-child(5){left:78%;top:26%;animation-delay:1.3s}'
    + '.genw-rip i:nth-child(6){left:22%;top:74%;animation-delay:1.55s}'
    + '.genw-rip i:nth-child(7){left:55%;top:80%;animation-delay:.7s}'
    + '@keyframes genwRip{0%{transform:scale(.15);opacity:.85}100%{transform:scale(1.5);opacity:0}}'
    /* العدّاد الحيّ فوق موضع العدّاد المرسوم في الصورة (مركزه ٥٠٪ × ٥٧٫٧٪) */
    + '.genw-hud{position:absolute;left:50%;top:57.7%;transform:translate(-50%,-50%);z-index:3;display:flex;flex-direction:column;align-items:center;gap:6px;'
    +   'padding:8px 12px 9px;border-radius:16px;background:rgba(7,11,34,.94);box-shadow:0 0 0 1px rgba(125,249,255,.5),0 0 18px -2px rgba(125,249,255,.45)}'
    + '.genw-ring{position:relative;flex:none;width:clamp(64px,11vw,84px);aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}'
    + '.genw-ring svg{position:absolute;top:0;left:0;width:100%;height:100%;transform:rotate(-90deg)}'
    + '.genw-ring circle{fill:none;stroke-width:7}'
    + '.genw-arc0{stroke:rgba(255,255,255,.14)}'
    + '.genw-arc{stroke:#7df9ff;stroke-linecap:round;stroke-dasharray:' + ARC_LEN + ';stroke-dashoffset:' + ARC_LEN + ';transition:stroke-dashoffset .25s linear}'
    + '.genw--scene .genw-pct,html[data-mode="light"] .genw--scene .genw-pct{font-size:clamp(17px,2.9vw,22px);color:#eafcff;text-shadow:0 0 12px rgba(125,249,255,.7)}'
    + '.genw--scene .genw-pct small{display:none}'
    + '.genw-hudb{width:clamp(126px,22vw,166px)}'
    + '.genw-sbar{height:5px;border-radius:99px;background:rgba(255,255,255,.16);overflow:hidden}'
    + '.genw--scene .genw-fill{background:linear-gradient(90deg,#7df9ff,#ffc4ee);box-shadow:0 0 10px rgba(125,249,255,.6)}'
    + '.genw--scene .genw-stage{font-size:12px;line-height:1.35;min-height:16px;margin-top:5px;text-align:center;color:#eafcff}'
    + '.genw--scene .genw-sub{justify-content:center}'
    /* الجوّال: الحلقة والشريط جنبًا إلى جنب كي لا يغطّي العدّاد نصف المشهد */
    + '@media (max-width:430px){.genw-hud{flex-direction:row;gap:8px;padding:7px 10px}.genw-ring{width:50px}'
    +   '.genw--scene .genw-pct,html[data-mode="light"] .genw--scene .genw-pct{font-size:15px}.genw-hudb{width:118px}.genw--scene .genw-stage{font-size:11px;margin-top:4px}}'
    + 'html.omAndroid .genw-rain i:nth-child(3){display:none}'
    + '@media (prefers-reduced-motion:reduce){.genw--scene .genw-frame,.genw-rain i,.genw-rip i{animation:none}.genw-arc{transition:none}}';
  }

  var AR_DIG = '٠١٢٣٤٥٦٧٨٩';
  function toAr(n){ return String(n).replace(/[0-9]/g, function(d){ return AR_DIG[+d]; }); }
  function isAr(){ try{ return (typeof lang !== 'undefined' ? lang : 'ar') === 'ar'; }catch(e){ return true; } }

  /* منحنى التقدّم: يتسارع ثمّ يهدأ — لا يتجاوز ٩٢٪ مهما طال الانتظار (النتيجة تستبدل البطاقة) */
  function eased(p){ return p >= 1 ? 0.92 : (1 - Math.pow(1 - Math.min(p, 1), 2.2)) * 0.92; }

  function ensureCss(){
    if(document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = CSS + sceneCss(); /* v-gen-scene */
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
    root.className = 'genw' + (cfg.wide ? ' genw--video' : '') + (cfg.scene ? ' genw--scene' : '');
    /* v-gen-scene: مشهد بخلفيّة ومطر وعدّاد حيّ — بالخطّافات نفسها فالنبضة أدناه واحدة للنوعين */
    root.innerHTML = cfg.scene ? (''
      + '<div class="genw-frame"><div class="genw-canvas">'
      +   '<div class="genw-rain"><i></i><i></i><i></i></div>'
      +   '<div class="genw-rip"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>'
      +   '<div class="genw-hud">'
      +     '<div class="genw-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="genw-arc0" cx="50" cy="50" r="44"></circle><circle class="genw-arc" cx="50" cy="50" r="44"></circle></svg>'
      +       '<div class="genw-pct">0%<small></small></div></div>'
      +     '<div class="genw-hudb"><div class="genw-sbar"><div class="genw-fill"></div></div><div class="genw-stage"></div></div>'
      +   '</div>'
      + '</div></div>'
      + '<div class="genw-sub"><span class="genw-timer"></span></div>'
    ) : ''
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
    var arcEl = root.querySelector('.genw-arc'); /* حلقة المشهد — غائبة في البطاقة الذهبيّة */
    if(cfg.scene){ try{ root.querySelector('.genw-canvas').style.backgroundImage = 'url("' + cfg.scene + '")'; }catch(e){ /* guard-ok — بلا خلفيّة يبقى لون المشهد الداكن والعدّاد يعمل */ } }
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
      if(arcEl) arcEl.style.strokeDashoffset = String(Math.round(ARC_LEN * (100 - shown)) / 100);
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

  /* v-gen-wait-chatvideo (المالك: «التوليد موجود في الصور لكن الفيديوات غير موجود»): فيديو
     المحادثة لا يمرّ بفقاعة .msg-text ولا بلوحة أداة — مرحلته تُكتب في شريط الحالة داخل
     فقاعة التفكير («🎬 جاري إنشاء الفيديو…») فبقي بلا بطاقة. نرصد السطر الجاري ونركّب
     بطاقة الفيديو العريضة في الفقاعة نفسها؛ تُرفع معها عند وصول النتيجة. */
  var CHAT_VIDEO_RE = /🎬 (?:جاري إنشاء الفيديو|Creating video)/;

  /* الرصد: فقاعة نصّها أحد أسطر «أرسم لك…» ولا بطاقة فيها ← نركّب بطاقة.
     زمن البداية لكلّ نصّ يُحفظ فلا يصفّره renderAll، ويُنسى حين تختفي الفقاعة. */
  var t0ByText = Object.create(null);
  /* زمن بداية كلّ لوحة: يبقى طول التوليد الواحد (الفيديو يبدّل نصّ حالته 🚀→⏳→🎬)
     ولا يُصفَّر إلا حين ينتهي الاشتغال أو تُزال البطاقة. */
  var t0ByPanel = Object.create(null);

  /* v-gen-scene — عطب قائم كشفه المسبار: v-clean-ui يحذف الإيموجي من نصوص الواجهة بعد ٤٠ مث من كتابتها، والرصد
     يقرأ سطر الحالة بعد ٦٠ مث، فلا يجد بادئة «مشغول» (🎨 / ⏳ / 🚀…) أبدًا — فلم تعد بطاقة أيّ لوحة (فيديو، أنماط،
     أزياء) تظهر منذ تنظيف الواجهة. الآن تُقرأ الحالة لحظة تغيّرها (قبل التنظيف) ويُحفظ نصّها خامًا ومنظَّفًا؛ اللوحة
     «مشغولة» ما دام النصّ الظاهر أحدهما. النصّ الخام يبقى مرجع «أيّ بادئة بدأت» (التوليد 🎨 يصعد، التعديل يبقى). */
  var rawBusy = Object.create(null);
  var cleanBusy = Object.create(null);
  function hasPrefix(txt, list){
    for(var i = 0; txt && list && i < list.length; i++){ if(txt.indexOf(list[i]) === 0) return true; }
    return false;
  }
  function stripEmoji(txt){
    try{ if(typeof window.__noEmoji === 'function') return String(window.__noEmoji(txt)); }catch(e){ /* guard-ok — بلا منظِّف يبقى النصّ بإيموجيه والبادئة تطابق */ }
    return String(txt);
  }
  function noteBusy(p, txt){ rawBusy[p.id] = txt; cleanBusy[p.id] = stripEmoji(txt); }
  function panelBusy(p, ptxt){
    if(hasPrefix(ptxt, p.busy)){ noteBusy(p, ptxt); return true; }
    if(ptxt && cleanBusy[p.id] && ptxt === cleanBusy[p.id]) return true;
    delete rawBusy[p.id]; delete cleanBusy[p.id];
    return false;
  }
  /* تُستدعى مع كلّ دفعة تغيّرات — ثلاث قراءات بالمعرّف فقط */
  function sample(){
    for(var i = 0; i < PANELS.length; i++){
      var el = null, txt = '';
      try{ el = document.querySelector(PANELS[i].sel); txt = el ? String(el.textContent || '').trim() : ''; }catch(e){ txt = ''; }
      if(hasPrefix(txt, PANELS[i].busy)) noteBusy(PANELS[i], txt);
    }
  }

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

    /* فيديو المحادثة: سطر «🎬 جاري إنشاء الفيديو…» الجاري داخل فقاعة التفكير
       (.chat-status-text) ← بطاقة عريضة في الفقاعة؛ اختفى السطر ← تُرفع البطاقة. */
    var cvFound = false;
    var cvEls = document.querySelectorAll('.chat-status-text');
    for(var ci = 0; ci < cvEls.length; ci++){
      var ctxt = '';
      try{ ctxt = String(cvEls[ci].textContent || ''); }catch(e){ continue; }
      if(!CHAT_VIDEO_RE.test(ctxt)) continue;
      var chost = cvEls[ci].closest ? cvEls[ci].closest('.msg.assistant') : null;
      if(!chost) continue;
      cvFound = true;
      if(chost.querySelector('.genw[data-genw-panel="chatvideo"]')) continue;
      if(!t0ByPanel['chatvideo']) t0ByPanel['chatvideo'] = Date.now();
      try{
        var cnode = render({ t0: t0ByPanel['chatvideo'], kind: 'video' });
        cnode.setAttribute('data-genw-panel', 'chatvideo');
        chost.appendChild(cnode);
      }catch(e){ try{ __swallow(e, 'gen-wait:chatvideo'); }catch(_){ /* العرض تجميليّ */ } }
    }
    if(!cvFound){
      var cvStale = document.querySelectorAll('.genw[data-genw-panel="chatvideo"]');
      for(var csi = 0; csi < cvStale.length; csi++){
        try{ cvStale[csi].parentNode.removeChild(cvStale[csi]); }catch(e){ try{ __swallow(e, 'gen-wait:cvdone'); }catch(_){ /* تجميليّ */ } }
      }
      delete t0ByPanel['chatvideo'];
    }

    /* لوحات الأدوات: حالة نصّها بادئة «مشغول» ولا بطاقة بعدها ← نركّب؛ انتهى ← نرفع */
    for(var pi = 0; pi < PANELS.length; pi++){
      var p = PANELS[pi];
      var pel = null;
      try{ pel = document.querySelector(p.sel); }catch(e){ pel = null; }
      if(!pel || !pel.parentNode) continue;
      var ptxt = '';
      try{ ptxt = String(pel.textContent || '').trim(); }catch(e){ ptxt = ''; }
      var busy = panelBusy(p, ptxt); /* v-gen-scene: يصمد لحذف الإيموجي من سطر الحالة */
      var card = null;
      var scopeEl = pel.parentNode; /* v-gen-scene: بطاقة تُركَّب أعلى الاستوديو ليست ابنة حاوية سطر الحالة بالضرورة */
      if(p.scope){ try{ scopeEl = document.querySelector(p.scope) || pel.parentNode; }catch(e){ scopeEl = pel.parentNode; } }
      try{ card = scopeEl.querySelector('.genw[data-genw-panel="' + p.id + '"]'); }catch(e){ card = null; }
      if(busy && !card){
        if(!t0ByPanel[p.id]) t0ByPanel[p.id] = Date.now();
        try{
          var node = render({ t0: t0ByPanel[p.id], kind: p.kind });
          node.setAttribute('data-genw-panel', p.id);
          var mp = mountPoint(p, pel, rawBusy[p.id] || ptxt, document);
          mp.parent.insertBefore(node, mp.before);
          /* فوق = خارج مجال النظر (المستخدم عند زرّ «صمم» أسفل النموذج) — نصعد إليها */
          if(mp.top){ try{ node.scrollIntoView({ behavior: 'smooth', block: 'center' }); }catch(e){ /* guard-ok — التمرير ترف؛ البطاقة مركّبة */ } }
        }catch(e){ try{ __swallow(e, 'gen-wait:panel'); }catch(_){ /* العرض تجميليّ */ } }
      } else if(!busy && card){
        try{ card.parentNode.removeChild(card); }catch(e){ try{ __swallow(e, 'gen-wait:done'); }catch(_){ /* العرض تجميليّ */ } }
        delete t0ByPanel[p.id];
      }
    }
  }

  /* v-gen-scene: أين تُركَّب بطاقة اللوحة — { parent, before, top }. اللوحة التي لها topSel وبدأ نصّ حالتها بإحدى
     بادئات top تُركَّب قبل صفّ ذلك العنصر (أعلى الاستوديو)؛ غيرها — وأيّ مرساة غائبة — بعد سطر الحالة كما كان. */
  function mountPoint(p, pel, ptxt, doc){
    var below = { parent: pel.parentNode, before: pel.nextSibling, top: false };
    if(!p || !p.topSel || !p.top) return below;
    var up = false;
    for(var i = 0; i < p.top.length; i++){ if(String(ptxt || '').indexOf(p.top[i]) === 0){ up = true; break; } }
    if(!up) return below;
    var anchor = null;
    try{ anchor = (doc || document).querySelector(p.topSel); }catch(e){ anchor = null; }
    var row = anchor && anchor.parentNode;
    if(!row || !row.parentNode) return below;
    return { parent: row.parentNode, before: row, top: true };
  }

  var scheduled = false;
  function schedule(){
    if(scheduled) return;
    scheduled = true;
    setTimeout(function(){ scheduled = false; scan(); }, 60);
  }

  if(typeof MutationObserver !== 'undefined' && document.documentElement){
    try{
      new MutationObserver(function(){ sample(); schedule(); }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }catch(e){ try{ __swallow(e, 'gen-wait:observe'); }catch(_){ /* بلا رصد = بلا بطاقة فقط */ } }
  }
  schedule();

  /* v-gen-scene: خلفيّة المشهد تُحمَّل عند فتح استوديو الأزياء لا عند أوّل توليد — فلا يظهر المشهد فارغًا لحظةً */
  var scenePreloaded = false;
  function preloadScenes(){
    if(scenePreloaded) return;
    scenePreloaded = true;
    for(var k in KINDS){ if(KINDS[k].scene){ try{ (new Image()).src = KINDS[k].scene; }catch(e){ /* guard-ok — بلا تحميل مسبق تُحمَّل مع البطاقة */ } } }
  }
  if(document.addEventListener){
    document.addEventListener('click', function(e){
      var tg = e && e.target;
      if(tg && tg.closest && tg.closest('#btnFashionAI')) preloadScenes();
    }, true);
  }

  window.omranGenWait = { render: render, scan: scan, _eased: eased, PHRASES: PHRASES, PANELS: PANELS, KINDS: KINDS };
  window.omranGenWait._mountPoint = mountPoint; /* v-gen-scene: للاختبار */
  window.omranGenWait._panelBusy = panelBusy;
  window.omranGenWait._sample = sample;
})();
