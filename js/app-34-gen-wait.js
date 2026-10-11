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
   يبقى تحت سطر الحالة حيث ينظر المستخدم. بلا نصّ جديد: المراحل والتوقّع كما هي.

   v-gen-scene-exact (المالك بلقطة من جوّاله بعد النشر: «الفكرة كلّها خطأ… هذا التصميم الذي أريده بالضبط: العدّاد يكون
   نفس الفكرة داخل [الصورة] ونفس التصميم، وهذه الصورة تكون نفس مكان رفع الصورة»): (١) لوحة العدّاد الداكنة التي غطّت
   البرج أُزيلت — العدّاد الآن عدّاد الصورة نفسه في موضعه وبمقاسه: الحلقة الورديّة من الأصل، وداخلها قوس التقدّم الأبيض
   والرقم، وتحتها الشريط و«NN% COMPLETE»، تُرسم كلّها SVG بإحداثيّات الصورة (viewBox) فتكبر وتصغر معها بالضبط.
   الأرقام لاتينيّة و«COMPLETE» كما في تصميمه (جزء من الرسمة لا نصّ واجهة). (٢) المشهد يُركَّب قبل لوح الصورة
   ويُخفى مربّع «ارفعي صورتك» ما دام ظاهرًا — فهو في مكانه تمامًا؛ وفي «من وصف نصّي» فوق حقل الوصف.
   (٣) «أريد الحركة داخل، خلف العدّاد — مكان الأنبوب الخلفيّ»: المطر المائل على الصورة كلّها أُزيل؛ الحركة الآن ستارة
   الماء والأرقام النازلة داخل أنبوب البرج نفسه (٣٦٦..٦٥٩ × ٠..٤١٤ من الصورة)، تحت العدّاد الذي يُرسم وجهه وإطاره
   فوقها، وتموّجات على بركة قاعدته. */
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
      /* v-gen-scene-exact: التوليد (🎨) يُركَّب مكان مربّع الرفع — قبل لوح الصورة، والمربّع يُخفى ما دامت البطاقة؛
         البطاقة تُبحث في النافذة كلّها */
      scope: '#fashionAiModal', topSel: '#fashionAiImagePane', hideSel: '#fashionAiDropZone', top: ['🎨'] }
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
      est: 40, scene: '/assets/fashion/gen-scene.webp?v=2',
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

  /* v-gen-scene-exact: بلاطة جريان SVG لداخل الأنبوب — بلا مقاس ذاتيّ (viewBox + preserveAspectRatio=none) فتتمدّد
     على background-size بالنِّسَب، وخطوطها تخفت من أعلاها. rects = [x, y, w, h, opacity] */
  function flowTile(w, h, rects){
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="#d6f2ff" stop-opacity="0"/><stop offset="1" stop-color="#d6f2ff" stop-opacity="1"/></linearGradient></defs>';
    for(var i = 0; i < rects.length; i++) svg += '<rect x="' + rects[i][0] + '" y="' + rects[i][1] + '" width="' + rects[i][2] + '" height="' + rects[i][3] + '" fill="url(#g)" opacity="' + rects[i][4] + '"/>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg + '</svg>') + '")';
  }
  var SCENE_H = 559;
  var ARC_LEN = 246.9;
  var BAR_W = 175;
  var HUD_FONT = '"DIN Condensed","Bahnschrift","Roboto Condensed","Avenir Next Condensed","Arial Narrow","sans-serif-condensed",Impact,sans-serif';
  function sceneCss(){
    return ''
    + '.genw--scene{width:min(100%,760px);margin:12px auto 10px}'
    + '.genw--scene .genw-frame{animation:genwNeon 2.6s ease-in-out infinite}'
    + '.genw--scene .genw-frame::before{background:linear-gradient(120deg,transparent 15%,rgba(125,249,255,.15) 30%,#bff6ff 45%,#ff7bd5 55%,rgba(125,249,255,.15) 70%,transparent 85%);background-size:280% 100%}'
    + '@keyframes genwNeon{0%,100%{box-shadow:0 0 22px -6px rgba(125,249,255,.4),0 0 60px -18px rgba(255,123,213,.25)}'
    +   '50%{box-shadow:0 0 34px -4px rgba(125,249,255,.6),0 0 90px -14px rgba(255,123,213,.4)}}'
    + '.genw--scene .genw-canvas,html[data-mode="light"] .genw--scene .genw-canvas{display:block;aspect-ratio:1024/559;background:#070b22 center/cover no-repeat}'
    /* الجوّال: إطار أطول يقصّ جانبَي الصورة فيكبر البرج وعدّاده (المقياس = الارتفاع ÷ ٥٥٩، والعدّاد في منتصف العرض) */
    + '@media (max-width:520px){.genw--scene .genw-canvas,html[data-mode="light"] .genw--scene .genw-canvas{aspect-ratio:5/4}}'
    /* الحركة داخل الأنبوب (خلف العدّاد): حاوية فوق عمود الضوء في الصورة (٣٦٦..٦٥٩ × ٠..٤١٤) تخفت عند حافّتيه وطرفيه،
       وفيها ثلاث طبقات تنزل بنصف ارتفاعها بالضبط (= عدد صحيح من البلاطات) فتتكرّر بلا قفزة — transform وحده.
       screen يجمع ضوءها مع ضوء الأنبوب فتبدو ماءً يجري فيه لا خطوطًا فوقه. */
    + '.genw-tube{position:absolute;left:50%;top:0;width:calc(var(--u,0px) * 293);height:calc(var(--u,0px) * 414);margin-left:calc(var(--u,0px) * -146.5);'
    +   'overflow:hidden;pointer-events:none;z-index:1;mix-blend-mode:screen;opacity:0;'
    +   '-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 10%,#000 90%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 10%,#000 90%,transparent 100%)}'
    + '.genw--fit .genw-tube{opacity:1}'
    + '.genw-tube span{position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;'
    +   '-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 7%,#000 84%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 7%,#000 84%,transparent 100%)}'
    + '.genw-tube b{position:absolute;left:0;right:0;top:-100%;height:200%;background-repeat:repeat}'
    /* ستائر عريضة ناعمة — بطيئة */
    + '.genw-tube b:nth-child(1){background-image:' + flowTile(100, 300, [[6, 20, 9, 170, 0.34], [38, 120, 12, 160, 0.26], [72, 0, 8, 150, 0.3]]) + ';background-size:34% 50%;opacity:.8;animation:genwFlow 3.6s linear infinite}'
    /* خيوط ماء طويلة — سريعة */
    + '.genw-tube b:nth-child(2){background-image:' + flowTile(60, 200, [[8, 10, 2.4, 70, 1], [27, 95, 2.2, 85, 0.9], [44, 30, 2.4, 60, 0.95], [53, 130, 1.8, 50, 0.8], [17, 150, 1.8, 40, 0.7]]) + ';background-size:20.5% 25%;opacity:.95;animation:genwFlow 1.25s linear infinite}'
    /* شرطات قصيرة كأرقام نازلة — وسط */
    + '.genw-tube b:nth-child(3){background-image:' + flowTile(40, 120, [[5, 6, 3, 9, 1], [5, 22, 3, 9, 0.7], [5, 38, 3, 9, 0.45], [19, 50, 3, 9, 1], [19, 66, 3, 9, 0.7], [19, 82, 3, 9, 0.45], [32, 14, 3, 9, 0.9], [32, 30, 3, 9, 0.6], [32, 98, 3, 9, 0.9]]) + ';background-size:14% 16.667%;opacity:.9;animation:genwFlow 2.2s linear infinite}'
    + '@keyframes genwFlow{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,50%,0)}}'
    /* تموّجات على بركة قاعدة الأنبوب (٣٢٢..٧٠٢ × ٤٠٥..٤٩٠ من الصورة) — حيث ينزل الماء */
    + '.genw-rip{position:absolute;left:50%;top:calc(var(--u,0px) * 405);width:calc(var(--u,0px) * 380);height:calc(var(--u,0px) * 85);margin-left:calc(var(--u,0px) * -190);pointer-events:none;z-index:1;opacity:0}'
    + '.genw--fit .genw-rip{opacity:1}'
    + '.genw-rip i{position:absolute;width:13%;aspect-ratio:4/1;border:1px solid rgba(190,236,255,.75);border-radius:50%;opacity:0;animation:genwRip 1.9s ease-out infinite}'
    + '.genw-rip i:nth-child(1){left:6%;top:30%}'
    + '.genw-rip i:nth-child(2){left:24%;top:62%;animation-delay:.45s}'
    + '.genw-rip i:nth-child(3){left:43%;top:20%;animation-delay:.9s}'
    + '.genw-rip i:nth-child(4){left:60%;top:66%;animation-delay:.25s}'
    + '.genw-rip i:nth-child(5){left:78%;top:28%;animation-delay:1.3s}'
    + '.genw-rip i:nth-child(6){left:14%;top:78%;animation-delay:1.55s}'
    + '.genw-rip i:nth-child(7){left:50%;top:80%;animation-delay:.7s}'
    + '@keyframes genwRip{0%{transform:scale(.15);opacity:.85}100%{transform:scale(1.5);opacity:0}}'
    /* العدّاد الحيّ: إطار SVG فوق مستطيل العدّاد في الصورة — --u بكسل الشاشة لكلّ بكسل من الصورة (يُقاس من ارتفاع المشهد) */
    + '.genw-live{position:absolute;left:50%;top:calc(var(--u,0px) * 246);width:calc(var(--u,0px) * 200);height:calc(var(--u,0px) * 152);margin-left:calc(var(--u,0px) * -100);'
    +   'z-index:3;overflow:visible;pointer-events:none;direction:ltr;opacity:0}'
    + '.genw--fit .genw-live{opacity:1}'
    + '.genw-live circle{fill:none}'
    /* وجه العدّاد وإطاره فوق الجريان: القرص ولوحتا الشريط والنصّ بألوان الصورة، والحلقة الورديّة وإطار الشريط */
    + '.genw-live .genw-face{fill:rgb(70,92,149)}'
    + '.genw-plate{fill:rgb(49,68,112)}'
    + '.genw-plate2{fill:rgb(51,76,129)}'
    + '.genw-rim{stroke:rgba(255,198,214,.92);stroke-width:1.5}'
    + '.genw-rail{fill:none;stroke:rgba(214,200,255,.85);stroke-width:1}'
    + '.genw-in{stroke:rgba(196,206,255,.55);stroke-width:.9}'
    + '.genw-arc0{stroke:rgba(255,255,255,.1);stroke-width:4.2}'
    + '.genw-arcg{stroke:rgba(190,235,255,.3);stroke-width:8}'
    + '.genw-arc{stroke:#e6f8ff;stroke-width:4.2}'
    + '.genw-arc,.genw-arcg{stroke-dasharray:' + ARC_LEN + ';stroke-dashoffset:' + ARC_LEN + ';transition:stroke-dashoffset .25s linear}'
    + '.genw-num{font:700 37px/1 ' + HUD_FONT + ';fill:#aee8f9}'
    + '.genw-bar{fill:#dbe9ff;transition:width .25s linear}'
    + '.genw-cap{font:700 19.5px/1 ' + HUD_FONT + ';fill:#a5e1f6}'
    + '.genw--scene .genw-stage{text-align:center}'
    + '.genw--scene .genw-sub{justify-content:center}'
    /* مربّع الرفع يُخفى ما دام المشهد في مكانه (له display سطريّ فلا بدّ من !important) */
    + '[data-genw-hide]{display:none !important}'
    /* أندرويد: بلا دمج ضوئيّ (أخفّ على المعالج الرسوميّ) وبطبقتين */
    + 'html.omAndroid .genw-tube{mix-blend-mode:normal}'
    + 'html.omAndroid .genw-tube b:nth-child(1){display:none}'
    + '@media (prefers-reduced-motion:reduce){.genw--scene .genw-frame,.genw-tube b,.genw-rip i{animation:none}.genw-arc,.genw-arcg,.genw-bar{transition:none}}';
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
      +   '<div class="genw-tube"><span><b></b><b></b><b></b></span></div>'
      +   '<div class="genw-rip"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>'
      +   '<svg class="genw-live" viewBox="412 246 200 152" aria-hidden="true">'
      +     '<circle class="genw-face" cx="512" cy="297" r="42.6"></circle>'
      +     '<circle class="genw-rim" cx="512" cy="297" r="45.2"></circle>'
      +     '<rect class="genw-plate" x="423.6" y="356.4" width="176.6" height="9.6" rx="4.8"></rect>'
      +     '<rect class="genw-rail" x="421.6" y="354.6" width="180.6" height="13.2" rx="6.6"></rect>'
      +     '<rect class="genw-plate2" x="463" y="373" width="98" height="19" rx="2"></rect>'
      +     '<circle class="genw-in" cx="512" cy="297" r="35.5"></circle>'
      +     '<circle class="genw-arc0" cx="512" cy="297" r="39.3"></circle>'
      +     '<circle class="genw-arcg" cx="512" cy="297" r="39.3" transform="rotate(-90 512 297)"></circle>'
      +     '<circle class="genw-arc" cx="512" cy="297" r="39.3" transform="rotate(-90 512 297)"></circle>'
      +     '<text class="genw-num" x="512" y="310.6" text-anchor="middle" lengthAdjust="spacingAndGlyphs">0%</text>'
      +     '<rect class="genw-bar" x="424.6" y="357.3" width="0" height="7.8" rx="3.9"></rect>'
      +     '<text class="genw-cap" x="512" y="389.2" text-anchor="middle" lengthAdjust="spacingAndGlyphs">0% COMPLETE</text>'
      +   '</svg>'
      + '</div></div>'
      + '<div class="genw-stage"></div>'
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
    var pctSmall = pctEl ? pctEl.querySelector('small') : null;
    var fillEl = root.querySelector('.genw-fill');
    var stageEl = root.querySelector('.genw-stage');
    var timerEl = root.querySelector('.genw-timer');
    /* v-gen-scene-exact: عناصر عدّاد الصورة — غائبة في البطاقة الذهبيّة */
    var canvasEl = root.querySelector('.genw-canvas');
    var arcEl = root.querySelector('.genw-arc'), arcGlow = root.querySelector('.genw-arcg');
    var numEl = root.querySelector('.genw-num'), barEl = root.querySelector('.genw-bar'), capEl = root.querySelector('.genw-cap');
    if(cfg.scene){ try{ canvasEl.style.backgroundImage = 'url("' + cfg.scene + '")'; }catch(e){ /* guard-ok — بلا خلفيّة يبقى لون المشهد الداكن والعدّاد يعمل */ } }
    /* المقياس: بكسل الشاشة لكلّ بكسل من الصورة = ارتفاع المشهد ÷ ٥٥٩ (الصورة تملأ الارتفاع دائمًا: cover مع إطار لا يزيد عرضًا عنها) */
    var lastU = 0;
    function fit(){
      if(!cfg.scene || !canvasEl) return;
      var h = canvasEl.clientHeight;
      if(!(h > 0)) return;
      var u = Math.round(h / SCENE_H * 10000) / 10000;
      if(u === lastU) return;
      lastU = u;
      root.style.setProperty('--u', u + 'px');
      if(root.className.indexOf('genw--fit') === -1) root.className += ' genw--fit';
    }
    root.__genwFit = fit;
    /* الرقم والقوس والشريط والنصّ — أرقام لاتينيّة كما في تصميم المالك، بعرض حروف الأصل (٧٥% = ٤٦ بكسل، ونصّه = ٩١٫٣) */
    function paintScene(shown){
      var digits = String(shown).length;
      numEl.textContent = shown + '%';
      numEl.setAttribute('textLength', String(Math.round((digits * 13.5 + 19) * 10) / 10));
      var off = String(Math.round(ARC_LEN * (100 - shown)) / 100);
      arcEl.style.strokeDashoffset = off; arcGlow.style.strokeDashoffset = off;
      barEl.setAttribute('width', String(Math.round(BAR_W * shown) / 100));
      capEl.textContent = shown + '% COMPLETE';
      capEl.setAttribute('textLength', String(Math.round((digits * 7.1 + 77.1) * 10) / 10));
    }
    if(pctSmall) pctSmall.textContent = hint;
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
      if(cfg.scene){ fit(); paintScene(shown); }
      else { pctEl.firstChild.textContent = fmt(shown) + '%'; fillEl.style.width = shown + '%'; }
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
          if(mp.top) node.setAttribute('data-genw-top', '1');
          mp.parent.insertBefore(node, mp.before);
          if(node.__genwFit){ try{ node.__genwFit(); }catch(e){ /* guard-ok — النبضة الأولى تضبط المقياس */ } }
          /* فوق = خارج مجال النظر (المستخدم عند زرّ «صمم» أسفل النموذج) — نصعد إليها */
          if(mp.top){ try{ node.scrollIntoView({ behavior: 'smooth', block: 'center' }); }catch(e){ /* guard-ok — التمرير ترف؛ البطاقة مركّبة */ } }
        }catch(e){ try{ __swallow(e, 'gen-wait:panel'); }catch(_){ /* العرض تجميليّ */ } }
      } else if(!busy && card){
        try{ card.parentNode.removeChild(card); }catch(e){ try{ __swallow(e, 'gen-wait:done'); }catch(_){ /* العرض تجميليّ */ } }
        delete t0ByPanel[p.id];
      }
      /* v-gen-scene-exact: المشهد في مكان مربّع الرفع — المربّع مخفيّ ما دامت بطاقة «فوق» موجودة، ويعود فور رفعها */
      if(p.hideSel){
        try{
          var hideEl = scopeEl.querySelector(p.hideSel);
          var topCard = scopeEl.querySelector('.genw[data-genw-panel="' + p.id + '"][data-genw-top]');
          if(hideEl){
            if(topCard && !hideEl.hasAttribute('data-genw-hide')) hideEl.setAttribute('data-genw-hide', '1');
            else if(!topCard && hideEl.hasAttribute('data-genw-hide')) hideEl.removeAttribute('data-genw-hide');
          }
        }catch(e){ try{ __swallow(e, 'gen-wait:hide'); }catch(_){ /* العرض تجميليّ */ } }
      }
    }
  }

  /* v-gen-scene-exact: أين تُركَّب بطاقة اللوحة — { parent, before, top }. اللوحة التي لها topSel وبدأ نصّ حالتها بإحدى
     بادئات top تُركَّب قبل ذلك العنصر نفسه (لوح الصورة: فتقع مكان مربّع الرفع المخفيّ)؛ غيرها — وأيّ مرساة غائبة —
     بعد سطر الحالة كما كان. */
  function mountPoint(p, pel, ptxt, doc){
    var below = { parent: pel.parentNode, before: pel.nextSibling, top: false };
    if(!p || !p.topSel || !p.top) return below;
    if(!hasPrefix(String(ptxt || ''), p.top)) return below;
    var anchor = null;
    try{ anchor = (doc || document).querySelector(p.topSel); }catch(e){ anchor = null; }
    if(!anchor || !anchor.parentNode) return below;
    return { parent: anchor.parentNode, before: anchor, top: true };
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
