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
   فوقها، وتموّجات على بركة قاعدته.
   (٤) «الشغل جميل لكن الصورة مغبّشة، وشيل التضليل اللي داخل العدّاد — يكون رقم فقط، وهذه الصورة [الذهبيّة] نفس الفكرة:
   مرّة هذي ومرّة الثانية عند التوليد»: الصورتان موضَّحتان (Real-ESRGAN ×٢) ويُمحى منهما ما يُرسم حيًّا بملء من الجوار لا
   بقرص مسطّح؛ داخل الحلقة رقم فقط (لا قرص ولا مجرى ولا دائرة — والجريان مثقوب عند الحلقة فيبقى خلفها)؛ والمشهدان
   SCENES يتبادلان توليدًا بعد توليد، كلّ واحد بإحداثيّات صورته وألوانها. التموضع CSS صرف (نِسَب من إطار بنسبة الصورة).

   v-gen-steady (المالك بلقطة من الموقع: «العدّاد الخارجيّ الصغير اللي مكتوب نرسم تحت فيه وميض قويّ»): سطر الوقت كان يُكتب
   كلّ ١٥٠ مث ببادئة ⏱، ومنظِّف الواجهة يمسحها بعد ٤٠ مث — فيتبدّل النصّ ~١٣ مرّة في الثانية ويقفز السطر (وهو موسَّط).
   الآن النصّ يُنظَّف قبل كتابته خارج المحادثة (المنظِّف لا يجد ما يمسحه) ولا يُكتب إلّا حين يتغيّر (مرّة في الثانية)،
   والثواني وحدها في خانة ثابتة العرض (`.genw-timer b`) فتبدّل رقم بآخر أعرض منه لا يزحزح السطر بكسلًا.
   والتعديل الموضعيّ للأزياء يصعد هو أيضًا مكان مربّع الرفع — النتيجة صارت هناك (v-fashion-result-inplace في app-12).

   v-style-scene (المالك ١١ أكتوبر بخمس صور «برج الستايل»: «ستايل الذكاء الاصطناعي — نفس فكرة الأزياء سوّها في ستايل»):
   استوديو الستايل (#studioAiStatus) لم تكن له بطاقة أصلًا. صار له نوع studio بخمسة مشاهد STYLE_SCENES تتبادل بالدور
   (فضّيّ، ذهبيّ، أبيض، عربيّ، نيون) — بالقواعد نفسها التي ثبّتها المالك في الأزياء: عدّاد الصورة نفسه حيّ في موضعه (الحلقة
   والرقم والشريط والنصّ، والمشهد العربيّ بأرقامه العربيّة و«كاملة» كما رُسم)، الحركة داخل الأنبوب خلف العدّاد، الصور موضَّحة،
   والمشهد مكان خانة «صورتك» (تُخفى هي وعنوانها ما دام). بلا نصّ واجهة جديد: المراحل والتوقّع من نصوص قائمة.

   v-scene-kinds (المالك ١١ أكتوبر بمجلّد صور للفيديو وصورة للديكور: «اللي في الملف للفيديوات وزّعه للفيديوات، والثانية للديكور…
   وكلّهم نفس الأفكار»، ثمّ: «لا تخلط الديكور مع الفيديوهات»): ثلاث مجموعات مشاهد لا تختلط — صانع الفيديو (VIDEO_SCENES، مكان
   شاشة المعاينة)، الترندات (TREND_SCENES، حيث تظهر نتيجتها)، والديكور (DECOR_SCENES، مكان صندوق الأفكار والرفع). صوره ليست
   قالبًا واحدًا: بعضها حلقة ورقم وشريط، وبعضها شريط فقط، وبعضها حلقة على لوحة جانبيّة أو بلا عدّاد — فأجزاء العدّاد صارت
   اختياريّة (ring/num/bar/cap) ويُرسم حيًّا ما رُسم في الصورة نفسها لا غير، ونصوصها («الفيديو جاهز»…) تبقى من الصورة. */
(function(){
  if(window.omranGenWait) return;

  var PHRASES = [
    '🎨 أرسم لك الصورة…', '🎨 Generating your image…',
    '🎨 أرسم لك نسخة ثانية…', '🎨 Creating another version…'
  ];

  /* لوحات الأدوات: عنصر الحالة + نوع البطاقة + بادئات «مشغول». البادئة إيموجي فتعمل
     مع كلّ اللغات، وبادئات التمّ/الخطأ (✅❌⚠️🔑⛔) منفصلة عنها فلا تصطدم. */
  var PANELS = [
    /* v-scene-kinds: صانع الفيديو — المشهد مكان شاشة المعاينة (.vmk-stage) وتُخفى ما دام؛ النتيجة تعود فيها نفسها */
    { id: 'video', sel: '#videoMakerStatus', kind: 'vmaker',
      /* v-ai-video-speed: ⬇️ (تحميل الناتج) جزء من الانتظار — كان يُسقط البطاقة فيبدأ العدّاد من الصفر. ✅/✨ (الترقية في الخلفية) ليست انتظارًا */
      busy: ['🚀', '⏳', '🎬', '🎥', '🎨', '🎙️', '🎚️', '🔗', '✍️', '💳', '⬇️'],
      scope: '#videoMakerModal', topSel: '#videoMakerModal .vmk-stage', hideSel: '.vmk-stage',
      top: ['🚀', '⏳', '🎬', '🎥', '🎨', '🎙️', '🎚️', '🔗', '✍️', '💳', '⬇️'] },
    /* v-pstyle-scene (المالك ١٥ أكتوبر بصورة «معرض البطاقات الزجاجيّ» وعدّاد «12» في وسطه: «ادخل ستايل، شوف كيف توليد الصورة ووين مكانه —
       نفس الفكرة في أنماط الصور»): المشهد مكان صورة النتيجة (قبل شريط «قبل/بعد» #portraitCompareWrap في لوحة العمل) وتُخفى النتيجة
       السابقة وزرّا التحميل والمشاركة ما دام؛ النتيجة الجديدة تعود في المكان نفسه. الحالة «⏳ جارٍ التحويل…» (ومسار GIF 🎞️) */
    { id: 'styles', sel: '#portraitStyleStatus', kind: 'styles',
      busy: ['⏳', '🎞️'],
      /* النطاق الصفحة كلّها: لوحة العمل (#portraitWork بالحالة والشريط) تُنقل مع ورقة الأنماط خارج #portraitStyleModal
         (تحت #omranWelcome)، فنطاق النافذة كان لا يجد البطاقة ويركّب نسخة في كلّ مسح (٥٣ نسخة في المسبار) */
      scope: 'body', topSel: '#portraitCompareWrap', top: ['⏳', '🎞️'],
      hideSel: '#portraitCompareWrap, #portraitStyleDownloadLink, #portraitShareBtn' },
    { id: 'fashion', sel: '#fashionAiStatus', kind: 'fashion',
      busy: ['🎨', 'جاري تطبيق', 'Applying'],
      /* v-gen-scene-exact: البطاقة تُركَّب مكان مربّع الرفع — قبل لوح الصورة، والمربّع يُخفى ما دامت البطاقة؛
         البطاقة تُبحث في النافذة كلّها. v-gen-steady: والتعديل الموضعيّ أيضًا (النتيجة نفسها صارت هناك) — فتُخفى معه النتيجة
         السابقة وأزرارها ما دام المشهد، ليحلّ مكانها وتعود الجديدة فيه */
      scope: '#fashionAiModal', topSel: '#fashionAiImagePane', top: ['🎨', 'جاري تطبيق', 'Applying'],
      hideSel: '#fashionAiDropZone, #fashionAiResultWrap, #fxTry, #fashionAiDownloadLink, #fashionAiFavoriteSaveBtn' },
    /* v-style-scene: استوديو الستايل — المشهد قبل عنوان «① صورتك» (مكان خانة الصورة)، وتُخفى الخانة وعنوانها والنتيجة
       السابقة وأزرارها ما دام. الحالة «🎨 جاري التوليد…» ومعها تقدّم السلسلة «— … (٢/٣)» */
    { id: 'studio', sel: '#studioAiStatus', kind: 'studio',
      busy: ['🎨'],
      scope: '#studioAiModal', topSel: '#studioAiModal .stStep[data-i18n="studioStepPhoto"]', top: ['🎨'],
      hideSel: '.stStep[data-i18n="studioStepPhoto"], #studioAiSlots, #studioAiResultWrap, #studioMultiResults, #studioAiDownloadLink, #studioAiFavoriteSaveBtn' },
    /* v-scene-kinds: الترندات — سطر حالتها يُبنى مع لوحة كلّ ترند، والمشهد تحته حيث تظهر النتيجة (#vtOut). وسطر الحالة تحت زرّ «اصنع» في آخر
       اللوحة، فالمشهد يُركَّب عند حافّة الشاشة السفلى — يُمرَّر إليه (scroll) */
    /* v-trend-scene-live: نصوص الترندات تُكتب بلا إيموجي أصلًا (ui ← noEmoji) فلم تُعرف «مشغولة» قطّ بالمسار الحقيقيّ — «مشغول» سمة
       صريحة تضبطها اللوحة نفسها (busyAttr)، تصمد لكلّ لغة ولتبدّل النصّ («المشهد ٢ من ٣…»، العدّ التنازليّ بين المشاهد). */
    { id: 'vtrend', sel: '#vtStatus', kind: 'vtrend', busyAttr: 'data-genw-busy', scroll: true },
    /* v-scene-kinds: الديكور — المشهد مكان صندوق الأفكار (#designAiIdeas، تحت الرفع منذ v-decor-upload-top) ويُخفى ما دام هو والنتيجة السابقة؛ الرفع لا يُخفى */
    { id: 'decor', sel: '#designAiStatus', kind: 'decor',
      busy: ['🎨'],
      scope: '#designAiModal', topSel: '#designAiIdeas', top: ['🎨'],
      hideSel: '#designAiIdeas, #designBAWrap, #designAiResult, #designAiGrid, #designAiDownloadLink' }
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
      est: 40, /* v-gen-scene-exact: scenes تُربط أدناه بعد تعريف SCENES */
      hint: { ar: 'جاري تصميم الإطلالة', en: 'Designing the look' },
      expect: { ar: 'الإطلالات تاخذ ~٤٠ ثانية', en: 'looks usually take ~40s' },
      stages: {
        ar: ['نفهم ذوقك…', 'نرسم القطع…', 'ننسّق الإطلالة…', 'اللمسات الأخيرة ✨'],
        en: ['Reading your taste…', 'Sketching the pieces…', 'Styling the look…', 'Final touches ✨']
      },
      slow: { ar: 'ما زال يتولّد — الاتصال أبطأ من المعتاد…', en: 'Still generating — slower than usual…' }
    }
  };
  /* v-style-scene: الستايل — بلا نصّ جديد: مراحله وتوقّعه مركّبة من نصوص الأنواع القائمة (scenes تُربط أدناه) */
  KINDS.studio = {
    est: 30,
    hint: KINDS.image.hint,
    expect: KINDS.image.expect,
    stages: {
      ar: [KINDS.styles.stages.ar[0], KINDS.image.stages.ar[1], KINDS.styles.stages.ar[2], KINDS.image.stages.ar[3]],
      en: [KINDS.styles.stages.en[0], KINDS.image.stages.en[1], KINDS.styles.stages.en[2], KINDS.image.stages.en[3]]
    },
    slow: KINDS.image.slow
  };
  /* v-scene-kinds: صانع الفيديو والترندات بنصوص الفيديو، والديكور بنصوص الصور — بلا نصّ جديد (scenes تُربط أدناه) */
  KINDS.vmaker = { est: 120, hint: KINDS.video.hint, expect: KINDS.video.expect, stages: KINDS.video.stages, slow: KINDS.video.slow };
  KINDS.vtrend = { est: 120, hint: KINDS.video.hint, expect: KINDS.video.expect, stages: KINDS.video.stages, slow: KINDS.video.slow };
  KINDS.decor = { est: 30, hint: KINDS.image.hint, expect: KINDS.image.expect, stages: KINDS.image.stages, slow: KINDS.image.slow };

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
    /* v-gen-steady: خانة الثواني — عرضها بعدد الخانات (يُضبط في paintTimer) والرقم ملاصق لحرف الوحدة */
    + '.genw-timer b{display:inline-block;text-align:end;font-weight:inherit}'
    + 'html[data-mode="light"] .genw-canvas{background:#f4ecd9}'
    + 'html[data-mode="light"] .genw-shimmer{background:radial-gradient(120% 90% at 50% 110%,rgba(212,175,55,.18),transparent 55%),linear-gradient(180deg,#f8f1e0,#efe4cb)}'
    + 'html[data-mode="light"] .genw-film{background-color:rgba(120,90,30,.18)}'
    + 'html[data-mode="light"] .genw-pct{color:#8a6500;text-shadow:none}'
    + 'html[data-mode="light"] .genw-pct small,html[data-mode="light"] .genw-timer{color:rgba(90,70,20,.55)}'
    + 'html[data-mode="light"] .genw-track{background:rgba(90,70,20,.12)}'
    + '@media (prefers-reduced-motion:reduce){.genw-frame,.genw-frame::before,.genw-shimmer::after,.genw-film{animation:none}}';

  /* v-gen-scene-exact: بلاطة جريان SVG لداخل الأنبوب — بلا مقاس ذاتيّ (viewBox + preserveAspectRatio=none) فتتمدّد
     على background-size بالنِّسَب، وخطوطها تخفت من أعلاها. rects = [x, y, w, h, opacity] */
  function flowTile(w, h, rects, color){
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="' + color + '" stop-opacity="0"/><stop offset="1" stop-color="' + color + '" stop-opacity="1"/></linearGradient></defs>';
    for(var i = 0; i < rects.length; i++) svg += '<rect x="' + rects[i][0] + '" y="' + rects[i][1] + '" width="' + rects[i][2] + '" height="' + rects[i][3] + '" fill="url(#g)" opacity="' + rects[i][4] + '"/>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg + '</svg>') + '")';
  }
  /* طبقات الجريان الثلاث: ستائر عريضة ناعمة (بطيئة)، خيوط طويلة (سريعة)، شرطات قصيرة كأرقام نازلة (وسط) */
  var FLOW_TILES = [
    [100, 300, [[6, 20, 9, 170, 0.34], [38, 120, 12, 160, 0.26], [72, 0, 8, 150, 0.3]]],
    [60, 200, [[8, 10, 2.4, 70, 1], [27, 95, 2.2, 85, 0.9], [44, 30, 2.4, 60, 0.95], [53, 130, 1.8, 50, 0.8], [17, 150, 1.8, 40, 0.7]]],
    [40, 120, [[5, 6, 3, 9, 1], [5, 22, 3, 9, 0.7], [5, 38, 3, 9, 0.45], [19, 50, 3, 9, 1], [19, 66, 3, 9, 0.7], [19, 82, 3, 9, 0.45], [32, 14, 3, 9, 0.9], [32, 30, 3, 9, 0.6], [32, 98, 3, 9, 0.9]]]
  ];
  var HUD_FONT = '"DIN Condensed","Bahnschrift","Roboto Condensed","Avenir Next Condensed","Arial Narrow","sans-serif-condensed",Impact,sans-serif';
  /* مشهدا الأزياء — صورتا المالك، يتبادلان توليدًا بعد توليد. كلّ القيم بإحداثيّات الصورة نفسها (w×h):
     ring = مركز الحلقة ونصف قطر قوس التقدّم وسمكه و«ثقب» الجريان حولها؛ num/cap = خطّ القاعدة والمقاس وعرض الحروف كما رُسمت
     («75%» و«75% COMPLETE»)؛ bar = تعبئة الشريط؛ refl = انعكاس النصّ على الأرضيّة؛ tube = عمود الضوء الذي تجري فيه
     الحركة — ينتهي فوق الشريط فلا يمسّه ولا النصّ؛ rip = بركة قاعدته. داخل الحلقة قرص الصورة نفسه (مُنظَّف من أرقامه). */
  var SCENES = [
    { id: 'neon', src: '/assets/fashion/gen-scene.webp?v=4', w: 1024, h: 559,
      ring: { cx: 512, cy: 297, r: 39.3, sw: 4.2, hole: 43.4 },
      num: { y: 310.6, size: 37, dw: 13.5, pw: 19 },
      bar: { x: 424.6, y: 357.3, w: 175, h: 7.8 },
      cap: { y: 389.2, size: 19.5, dw: 7.1, rest: 77.1 },
      refl: null,
      tube: { x: 366, y: 0, w: 293, h: 350, blend: 'screen' },
      rip: { x: 322, y: 405, w: 380, h: 85, color: 'rgba(190,236,255,.75)' },
      ink: '#aee8f9', arc: '#e6f8ff', glow: 'rgba(190,235,255,.3)', barFill: '#dbe9ff', capInk: '#a5e1f6', flow: '#d6f2ff' },
    { id: 'gold', src: '/assets/fashion/gen-scene-gold.webp?v=2', w: 1280, h: 699,
      ring: { cx: 640, cy: 372, r: 49.6, sw: 6.7, hole: 57.5 },
      num: { y: 388.2, size: 45, dw: 16.6, pw: 23.5 },
      bar: { x: 530, y: 446.4, w: 229, h: 10.4 },
      cap: { y: 487.3, size: 23, dw: 8.9, rest: 96.7 },
      refl: { y: 572.3, sy: 1.32, ink: 'rgba(214,178,104,.5)' },
      tube: { x: 455, y: 0, w: 370, h: 440, blend: 'multiply' },
      rip: null,
      ink: '#fff3cf', arc: '#fff8e6', glow: 'rgba(255,236,190,.35)', barFill: '#fff6e0', capInk: '#ffeeb8', flow: '#b9822c' }
  ];
  KINDS.fashion.scenes = SCENES;
  /* v-style-scene: مشاهد «برج الستايل» الخمسة — صور المالك، بالتصميم نفسه وخمسة أثواب. القياس واحد للأربعة (١٢٨٠×٦٩٩)
     والنيون نسخة ٠٫٨ منه (١٠٢٤×٥٥٩). الجديد عن مشهدَي الأزياء: bar.grad تدرّج تعبئة الشريط كما رُسم، tube.gap حزام بلا
     جريان عند الشريط والنصّ (الأنبوب هنا يمتدّ تحتهما)، dig أرقام المشهد العربيّ، وcap.suffix/cap.word نصّه «NN% كاملة»
     (الكلمة ثابتة في موضعها والرقم يمينها كما في الصورة). */
  var AR_HUD_FONT = '"Tajawal","IBM Plex Sans Arabic","Segoe UI","Geeza Pro","Noto Sans Arabic",Tahoma,sans-serif';
  function stScene(id, file, o){
    var sc = { id: id, src: '/assets/studio/gen-scene-' + file + '.webp?v=1', w: 1280, h: 699,
      ring: { cx: 640.5, cy: 341.2, r: 36.6, sw: 3.8, hole: 47.5 },
      num: { x: 641.5, y: 352.8, size: 30, dw: 12.5, pw: 17.6 },
      bar: { x: 577, y: 401.5, w: 127.5, h: 8 },
      cap: { x: 640.8, y: 427.3, size: 12.8, dw: 4.8, rest: 56.6 },
      refl: null, rip: null,
      tube: { x: 545, y: 172, w: 190, h: 376, blend: 'screen', gap: [393, 433] } };
    for(var k in o){
      if(sc[k] && typeof sc[k] === 'object' && o[k] && typeof o[k] === 'object'){ for(var j in o[k]) sc[k][j] = o[k][j]; }
      else sc[k] = o[k];
    }
    return sc;
  }
  var STYLE_SCENES = [
    stScene('stSilver', 'silver', { bg: '#39434f', bar: { grad: ['#cfcce9', '#c2f0fa'] },
      ink: '#f0fefe', arc: '#f8ffff', glow: 'rgba(214,244,255,.34)', capInk: '#edfcfd', flow: '#e2f6ff' }),
    stScene('stGold', 'gold', { bg: '#8a6a3c', tube: { blend: 'multiply' }, bar: { grad: ['#f8e0b0', '#fff6cf'] },
      ink: '#fffcd4', arc: '#fffbd8', glow: 'rgba(255,240,190,.38)', capInk: '#fff7c8', flow: '#b9822c' }),
    stScene('stWhite', 'white', { bg: '#cfd2d2', tube: { blend: 'multiply' }, bar: { grad: ['#d8e0f7', '#defcff'] },
      ink: '#f6fdfe', arc: '#f2ffff', glow: 'rgba(190,232,255,.45)', capInk: '#f2fbfc', flow: '#7f9fbd' }),
    stScene('stArab', 'arab', { bg: '#4a2a12', dig: '٠١٢٣٤٥٦٧٨٩', bar: { grad: ['#f9d187', '#fff0ae'] },
      num: { x: 640.5, y: 352, size: 33.5, dw: 13.3, pw: 20.8 },
      tube: { x: 553, y: 205, w: 186, h: 335, gap: [393, 435] },
      cap: { x: 647.2, anchor: 'start', y: 429.3, size: 16, dw: 6.65, rest: 10.4, suffix: '', word: { text: 'كاملة', x: 628, y: 429.4, size: 15.5, len: 30.6 } },
      ink: '#f9eeba', arc: '#fffdcb', glow: 'rgba(255,224,140,.4)', capInk: '#ecd48d', flow: '#fff1c9' }),
    stScene('stNeon', 'neon', { bg: '#0a1230', w: 1024, h: 559,
      ring: { cx: 512, cy: 272.75, r: 29.15, sw: 3, hole: 38 },
      num: { x: 513, y: 281.8, size: 23.2, dw: 9.95, pw: 14.4 },
      bar: { x: 462, y: 321.5, w: 98.5, h: 5.7, grad: ['#a99fe0', '#8fdcf2'] },
      cap: { x: 512.3, y: 341.3, size: 9.7, dw: 3.74, rest: 44 },
      tube: { x: 436, y: 138, w: 152, h: 300, gap: [314.5, 346] },
      ink: '#caf3fb', arc: '#dafeff', glow: 'rgba(150,232,255,.38)', capInk: '#bbe7f4', flow: '#c4f1ff' })
  ];
  KINDS.studio.scenes = STYLE_SCENES;
  KINDS.studio.sceneKey = 'aiapp_st_scene';
  /* v-pstyle-scene: مشهد «أنماط الصور» — صورة المالك (قاعة رخام عاكس، أسطوانة زجاجيّة ببطاقات بورتريه حولها، وعدّاد في وسطها).
     موضَّحة ×٤ (١٦٠٠×٨٠٤) ومُحي منها ما يُرسم حيًّا: رقم العدّاد (ملء قرصه من بكسلاته الداكنة) وقوسه الساطع (بلون مجراه الخافت).
     v-pstyle-mix: ١٢ مشهدًا من شبكات المالك الثلاث (٢×٢ لكلّ منها) — ثلاث ألوان (ثلجيّ، ذهبيّ، نيون بأربعة ألوان) × أربعة أشكال
     (حلزون، مكعّبات، كرة، قوس)، مقصوصة وموضَّحة ×٢ (١٦٠٠ عرضًا). الدور ممزوج: لا لون ولا شكل يتكرّر في مشهدين متتاليين (دائريًّا).
     v-pstyle-counter (المالك: «وين العدّاد؟ شيل الكود من ستايل، الفكرة كاملة، وطبّقها في الأنماط — فقط غيّر الأشكال»): عدّاد الستايل
     نفسه (stScene: حلقة ورقم وشريط بتدرّجه ونصّ «NN% COMPLETE» وحزام الأنبوب) على الـ١٣ كلّها، مكبَّرًا بنسبة ١٦٠٠/١٢٨٠ وما فوق، في
     وسط هيكل كلّ شكل (الأسطوانة، الكتلة، لوح الكرة، فتحة القوس). الصور بلا عدّاد مرسوم فيُرسم معه قرصه الداكن ومجرى حلقته
     ومجرى شريطه الخافتان (disc/track/trough) — فيُقرأ كما يُقرأ في الستايل. */
  /* الأنبوب (الجريان) = المنطقة الداكنة وسط الهيكل بنِسَب الصورة [x0, y0, x1, y1]٪ — من قياس بكسلات الشبكات: عمود الحلزون يمين
     المنتصف (٤٩٫٥–٥٩٫٥٪)، كتلة المكعّبات، لوح الكرة (٤٤٫٥–٦٢٪)، فتحة القوس. العدّاد في مركز تلك المنطقة (PS_CX/PS_CY) وبمعامل
     يناسب عرضها (PS_K: عمود الحلزون ضيّق ١٦٠ بكسل فمعامله ١٫١ وشريطه ١٤٠؛ الباقي ١٫٣٦٦). الهياكل كلّها داخل قصّ الجوّال ٥:٤. */
  var PS_TUBE = { spiral: [49.5, 18, 59.5, 62], cubes: [39.5, 57, 60.5, 82], sphere: [44.5, 18.5, 62, 51], arch: [40.7, 37, 58.1, 68] };
  var PS_CX = { spiral: 872, cubes: 800, sphere: 852, arch: 790 };
  var PS_CY = { spiral: 36, cubes: 65, sphere: 31, arch: 49 };
  var PS_K = { spiral: 1.1, cubes: 1.366, sphere: 1.366, arch: 1.366 };
  var PS_HUE = {
    ice: { bg: '#2b3a49', flow: '#d9ecff', ink: '#f0fefe', arc: '#f8ffff', glow: 'rgba(214,244,255,.34)', grad: ['#cfcce9', '#c2f0fa'], capInk: '#edfcfd' },
    gold: { bg: '#3d2d22', flow: '#f1dcb0', ink: '#fffcd4', arc: '#fffbd8', glow: 'rgba(255,240,190,.38)', grad: ['#f8e0b0', '#fff6cf'], capInk: '#fff7c8' },
    blue: { bg: '#172a52', flow: '#9fd4ff', ink: '#caf3fb', arc: '#dafeff', glow: 'rgba(150,232,255,.38)', grad: ['#a99fe0', '#8fdcf2'], capInk: '#bbe7f4' },
    green: { bg: '#1c3a24', flow: '#b9ffc8', ink: '#e3ffe9', arc: '#f0fff3', glow: 'rgba(170,255,200,.38)', grad: ['#8fe3a5', '#c9ffd6'], capInk: '#d4ffdf' },
    purple: { bg: '#331e45', flow: '#e0b8ff', ink: '#f3e4ff', arc: '#f8efff', glow: 'rgba(220,180,255,.4)', grad: ['#c79bff', '#efd9ff'], capInk: '#ead6ff' },
    amber: { bg: '#3d2d1a', flow: '#ffe49a', ink: '#fff3cf', arc: '#fff8e6', glow: 'rgba(255,236,190,.35)', grad: ['#f5c96a', '#ffeab0'], capInk: '#ffeeb8' },
    gallery: { bg: '#2a221b', flow: '#f1dcb0', ink: '#fff3d6', arc: '#ffe6a8', glow: 'rgba(255,220,150,.35)', grad: ['#f8e0b0', '#fff6cf'], capInk: '#fff7c8' }
  };
  var PS_DISC = 'rgba(6,9,18,.5)', PS_TRACK = 'rgba(255,255,255,.2)', PS_TROUGH = 'rgba(255,255,255,.16)';
  /* عدّاد الستايل (stScene على ١٢٨٠) مكبَّرًا بمعامل k حول مركز (cx, cy): مقاديره نِسَب من قياسات صور الستايل نفسها */
  function psCounter(cx, cy, k){
    var m = function(v){ return Math.round(v * k * 10) / 10; }, at = function(d){ return Math.round((cy + d * k) * 10) / 10; };
    return {
      ring: { cx: cx, cy: cy, r: m(36.6), sw: m(3.8), hole: m(47.5), disc: PS_DISC, track: PS_TRACK },
      num: { x: cx, y: at(11.6), size: m(30), dw: m(12.5), pw: m(17.6) },
      bar: { x: Math.round((cx - 63.75 * k) * 2) / 2, y: at(60.3), w: Math.round(127.5 * k * 2) / 2, h: m(8), trough: PS_TROUGH }, /* أنصاف — فجمع x+w في تدرّج الشريط بلا كسور عائمة */
      cap: { x: cx, y: at(86.1), size: m(12.8), dw: m(4.8), rest: m(56.6) },
      gap: [at(51.8), at(91.8)]
    };
  }
  function psScene(id, file, h, hue, shape){
    var t = PS_TUBE[shape], c = PS_HUE[hue], k = psCounter(PS_CX[shape], Math.round(PS_CY[shape] * h / 100), PS_K[shape]);
    k.bar.grad = c.grad;
    return { id: id, src: '/assets/portrait/gen-scene-' + file + '.webp?v=2', w: 1600, h: h, hue: hue, shape: shape, bg: c.bg, flow: c.flow,
      ring: k.ring, num: k.num, bar: k.bar, cap: k.cap,
      tube: { x: Math.round(t[0] * 16), y: Math.round(t[1] * h / 100), w: Math.round((t[2] - t[0]) * 16), h: Math.round((t[3] - t[1]) * h / 100), blend: 'screen', gap: k.gap },
      refl: null, rip: null, ink: c.ink, arc: c.arc, glow: c.glow, capInk: c.capInk };
  }
  /* معرض البطاقات: عدّاده مرسوم في صورة المالك (حلقة ٧٢ ورقم، وتحتهما شريط أبيض ٤٥٨–٤٧٨ ونصّ ٤٩٠–٥٠٨) — مُحي كلّه ويُرسم حيًّا
     في مواضعه بقياساته (الشريط والنصّ في منتصف الحلقة؛ كانا أيسر منها ببضع بكسلات في الرسم) */
  var PS_GALLERY = (function(){
    var c = PS_HUE.gallery;
    return { id: 'psGallery', src: '/assets/portrait/gen-scene-gallery.webp?v=4', w: 1600, h: 804, hue: 'gallery', shape: 'cylinder', bg: c.bg, flow: c.flow,
      ring: { cx: 802, cy: 346, r: 72, sw: 9, hole: 86, disc: PS_DISC, track: PS_TRACK },
      num: { x: 802, y: 366, size: 50, dw: 20, pw: 28 },
      bar: { x: 692, y: 459, w: 220, h: 18, trough: 'rgba(30,22,14,.4)', grad: c.grad }, /* مجرى داكن — زجاج المعرض فاتح فالمجرى الأبيض الخافت لا يُرى */
      cap: { x: 802, y: 507, size: 19, dw: 7.1, rest: 84 },
      tube: { x: 560, y: 30, w: 480, h: 650, blend: 'screen', gap: [449, 517] },
      refl: null, rip: null, ink: c.ink, arc: c.arc, glow: c.glow, capInk: c.capInk };
  })();
  var PORTRAIT_SCENES = [
    PS_GALLERY,
    psScene('psNeonSpiral', 'neon-spiral', 796, 'blue', 'spiral'),
    psScene('psGoldCubes', 'gold-cubes', 797, 'gold', 'cubes'),
    psScene('psIceSphere', 'ice-sphere', 797, 'ice', 'sphere'),
    psScene('psNeonArch', 'neon-arch', 790, 'amber', 'arch'),
    psScene('psIceSpiral', 'ice-spiral', 792, 'ice', 'spiral'),
    psScene('psGoldSphere', 'gold-sphere', 798, 'gold', 'sphere'),
    psScene('psNeonCubes', 'neon-cubes', 782, 'green', 'cubes'),
    psScene('psGoldArch', 'gold-arch', 801, 'gold', 'arch'),
    psScene('psIceCubes', 'ice-cubes', 796, 'ice', 'cubes'),
    psScene('psGoldSpiral', 'gold-spiral', 793, 'gold', 'spiral'),
    psScene('psNeonSphere', 'neon-sphere', 804, 'purple', 'sphere'),
    psScene('psIceArch', 'ice-arch', 801, 'ice', 'arch')
  ];
  KINDS.styles.scenes = PORTRAIT_SCENES;
  KINDS.styles.sceneKey = 'aiapp_ps_scene';
  /* @vd-scenes:start — مولَّد من قياسات الصور (لا يُحرَّر يدويًّا: يُعاد توليده مع أيّ صورة جديدة) */
  var VD_FONT = { family: "'Bahnschrift','Segoe UI','Helvetica Neue','Roboto',Arial,sans-serif", weight: 300 };
  var VIDEO_SCENES = [
    { id: 'vdMain', src: '/assets/videos/scenes/main.webp?v=1', w: 1365, h: 768, bg: '#2c2f29', tube: { x: 446, y: 70, w: 484, h: 500, blend: 'screen', gap: [402, 474] }, flow: '#d4fcf3', bar: { x: 575.2, y: 411.3, w: 228.6, h: 12.9, grad: ['#93f7e2', '#d6fdf0'] }, sprite: true, font: VD_FONT, ring: { cx: 687.6, cy: 319.2, hole: 79.5, img: { src: '/assets/videos/scenes/main-r1.webp?v=1', x: 613, y: 244.5, w: 149, h: 149 } }, num: { x: 690.8, y: 334.5, size: 45.5, dw: 22.4, pw: 31.2 }, ink: '#d6fbf9' },
    { id: 'vdDesign', src: '/assets/videos/scenes/design.webp?v=1', w: 692, h: 384, bg: '#2a2d27', tube: { x: 227, y: 36, w: 236, h: 254, blend: 'screen', gap: [209, 253] }, flow: '#d9fbf4', bar: { x: 289.7, y: 215.3, w: 111.4, h: 6.9, grad: ['#a0f5e4', '#8dfae3'] }, sprite: true, font: VD_FONT, ring: { cx: 346.8, cy: 165.8, hole: 40.5, img: { src: '/assets/videos/scenes/design-r1.webp?v=1', x: 308, y: 127, w: 77, h: 77 } }, num: { x: 347.3, y: 174, size: 23.4, dw: 11.1, pw: 15.5 }, ink: '#d6f8ec' },
    { id: 'vdQuantum', src: '/assets/videos/scenes/quantum.webp?v=1', w: 692, h: 384, bg: '#2c201b', tube: { x: 227, y: 36, w: 236, h: 254, blend: 'screen', gap: [209, 253] }, flow: '#fccfc6', bar: { x: 289.7, y: 215.3, w: 111.4, h: 6.4, grad: ['#f78671', '#fb987e'] } },
    { id: 'vd2050', src: '/assets/videos/scenes/world2050.webp?v=1', w: 673, h: 384, bg: '#3b4948', tube: { x: 229, y: 36, w: 236, h: 254, blend: 'screen', gap: [210, 254] }, flow: '#d3fbfb', bar: { x: 290.2, y: 215.8, w: 113.4, h: 6.9, grad: ['#91f5f5', '#98f8f7'] } },
    { id: 'vdMain2', src: '/assets/videos/scenes/main2.webp?v=1', w: 1000, h: 563, bg: '#282a24', tube: { x: 322, y: 52, w: 356, h: 372, blend: 'screen', gap: [293, 346] }, flow: '#d2fff4', bar: { x: 417.7, y: 300.8, w: 162.9, h: 9.9, grad: ['#8efee4', '#d3fef2'] }, sprite: true, font: VD_FONT, ring: { cx: 498.7, cy: 235, hole: 60, img: { src: '/assets/videos/scenes/main2-r1.webp?v=1', x: 442.5, y: 179, w: 112, h: 112 } }, num: { x: 502, y: 245.5, size: 33.1, dw: 16.5, pw: 22.9 }, ink: '#dffbf9' },
    { id: 'vdNet', src: '/assets/videos/scenes/network.webp?v=1', w: 673, h: 384, bg: '#1c2d3a', tube: { x: 229, y: 36, w: 236, h: 254, blend: 'screen', gap: [210, 254] }, flow: '#dff7ff', bar: { x: 290.2, y: 216.3, w: 113.4, h: 6.9, grad: ['#afecff', '#ccf5ff'] }, sprite: true, font: VD_FONT, ring: { cx: 346.4, cy: 165.7, hole: 42, img: { src: '/assets/videos/scenes/network-r1.webp?v=1', x: 306, y: 125.5, w: 80, h: 80 } }, num: { x: 348.8, y: 175, size: 23.4, dw: 11.1, pw: 15.5 }, ink: '#c9f1f8' },
    { id: 'vdSea', src: '/assets/videos/scenes/sea.webp?v=1', w: 692, h: 384, bg: '#11242c', tube: { x: 224, y: 36, w: 236, h: 254, blend: 'screen', gap: [208, 252] }, flow: '#c3edf9', bar: { x: 288.7, y: 213.8, w: 106.4, h: 6.9, grad: ['#68d3f1', '#e5ede0'] } },
    { id: 'vdPortal', src: '/assets/videos/scenes/portal.webp?v=1', w: 692, h: 384, bg: '#15242d', tube: { x: 224, y: 36, w: 236, h: 254, blend: 'screen', gap: [208, 252] }, flow: '#c5e9f4', bar: { x: 289.2, y: 213.8, w: 105.9, h: 7.4, grad: ['#6fc7e4', '#e0ddd8'] } },
    { id: 'vdGalaxy', src: '/assets/videos/scenes/galaxy.webp?v=1', w: 692, h: 384, bg: '#1d1e23', tube: { x: 224, y: 36, w: 236, h: 254, blend: 'screen', gap: [208, 252] }, flow: '#c6f2fd', bar: { x: 288.2, y: 213.8, w: 106.9, h: 6.9, grad: ['#71defa', '#c2f7ff'] } },
    { id: 'vdGreen', src: '/assets/videos/scenes/green.webp?v=1', w: 673, h: 384, bg: '#3d4b49', tube: { x: 229, y: 36, w: 236, h: 254, blend: 'screen', gap: [210, 254] }, flow: '#d7fefe', bar: { x: 290.2, y: 216.3, w: 113.4, h: 6.4, grad: ['#9afcfc', '#c4fefe'] } },
    { id: 'vdMind', src: '/assets/videos/scenes/mind.webp?v=1', w: 692, h: 384, bg: '#2d231f', tube: { x: 227, y: 36, w: 236, h: 254, blend: 'screen', gap: [209, 253] }, flow: '#f5cfc5', bar: { x: 289.7, y: 214.8, w: 110.9, h: 6.9, grad: ['#e6866e', '#ea8e76'] } },
    { id: 'vdDna', src: '/assets/videos/scenes/dna.webp?v=1', w: 673, h: 384, bg: '#3e4b49', tube: { x: 227, y: 36, w: 236, h: 254, blend: 'screen', gap: [208, 252] }, flow: '#d0faf5', bar: { x: 291.7, y: 214.3, w: 105.9, h: 7.4, grad: ['#8af2e5', '#b0fbed'] } },
    { id: 'vdHeritage', src: '/assets/videos/scenes/heritage.webp?v=1', w: 673, h: 384, bg: '#3e4845', tube: { x: 226, y: 36, w: 236, h: 254, blend: 'screen', gap: [208, 252] }, flow: '#cdf8f3', bar: { x: 291.2, y: 214.3, w: 105.9, h: 6.9, grad: ['#83ede1', '#d3f8e3'] } },
    { id: 'vdBrief', src: '/assets/videos/scenes/brief.webp?v=1', w: 673, h: 384, bg: '#394544', tube: { x: 226, y: 36, w: 236, h: 254, blend: 'screen', gap: [208, 252] }, flow: '#cff6f5', bar: { x: 291.7, y: 214.3, w: 104.9, h: 6.9, grad: ['#88e8e5', '#def3e7'] } }
  ];
  var TREND_SCENES = [
    { id: 'vtStory', src: '/assets/videos/scenes/trend-story.webp?v=1', w: 692, h: 384, bg: '#2e2e33', tube: { x: 228, y: 36, w: 236, h: 254, blend: 'screen' }, flow: '#e5f6ff', sprite: true, font: VD_FONT, ring: { cx: 443.4, cy: 92.4, hole: 21.2, img: { src: '/assets/videos/scenes/trend-story-r1.webp?v=1', x: 425.5, y: 72, w: 35.5, h: 40.5 } }, num: { x: 444.8, y: 95.6, size: 8.8, dw: 5, pw: 7 }, ink: '#f0f4f6' },
    { id: 'vtAnime', src: '/assets/videos/scenes/trend-anime.webp?v=1', w: 673, h: 384, bg: '#404d50', tube: { x: 230, y: 36, w: 236, h: 254, blend: 'multiply' }, flow: '#567886', sprite: true, font: VD_FONT, ring: { cx: 200.3, cy: 150.4, hole: 20.6, img: { src: '/assets/videos/scenes/trend-anime-r1.webp?v=1', x: 182, y: 130.5, w: 37, h: 39.5 } }, num: { x: 200.3, y: 154.6, size: 10.2, dw: 6, pw: 8.3 }, ink: '#eef4f4' },
    { id: 'vtVoice', src: '/assets/videos/scenes/trend-voice.webp?v=1', w: 692, h: 384, bg: '#152432', tube: { x: 224, y: 36, w: 236, h: 254, blend: 'screen', gap: [207, 251] }, flow: '#c9ebfa', bar: { x: 289.2, y: 213.3, w: 105.4, h: 7.9, grad: ['#78cef2', '#b2b9cd'] } },
    { id: 'vtAnim', src: '/assets/videos/scenes/trend-animation.webp?v=1', w: 673, h: 384, bg: '#3a474a', tube: { x: 227, y: 36, w: 236, h: 254, blend: 'screen', gap: [208, 252] }, flow: '#d1f9fa', bar: { x: 292.2, y: 214.3, w: 104.9, h: 6.9, grad: ['#8cf0f2', '#e6f8f3'] } }
  ];
  var DECOR_SCENES = [
    { id: 'dcBed', src: '/assets/decor/scenes/bedroom.webp?v=1', w: 689, h: 382, bg: '#342c28', tube: { x: 232, y: 34, w: 226, h: 246, blend: 'screen' }, flow: '#e5f6ff' },
    { id: 'dcLiving', src: '/assets/decor/scenes/living.webp?v=1', w: 676, h: 382, bg: '#2b3036', tube: { x: 222, y: 34, w: 226, h: 246, blend: 'screen' }, flow: '#e5f6ff', sprite: true, font: VD_FONT, ring: { cx: 136.1, cy: 131.4, hole: 35.2, img: { src: '/assets/decor/scenes/living-r1.webp?v=1', x: 105, y: 98, w: 61.5, h: 66.5 } }, num: { x: 136.9, y: 137.8, size: 19, dw: 8.2, pw: 11.3 }, ink: '#e1eaed', more: [{ cx: 522.1, cy: 128.5, hole: 29.9, img: { src: '/assets/decor/scenes/living-r2.webp?v=1', x: 495, y: 100.5, w: 54, h: 56 }, num: { x: 521.7, y: 133.8, size: 13.5, dw: 6.6, pw: 9.2 }, ink: '#dfe6f2' }] },
    { id: 'dcKitchen', src: '/assets/decor/scenes/kitchen.webp?v=1', w: 689, h: 386, bg: '#252d2d', tube: { x: 232, y: 34, w: 226, h: 250, blend: 'screen' }, flow: '#e5f6ff', sprite: true, font: VD_FONT, ring: { cx: 560.8, cy: 132.6, hole: 33.2, img: { src: '/assets/decor/scenes/kitchen-r1.webp?v=1', x: 531, y: 101, w: 59, h: 62.5 } }, num: { x: 560.6, y: 137.2, size: 12.7, dw: 7.1, pw: 9.9 }, ink: '#deede5' },
    { id: 'dcCafe', src: '/assets/decor/scenes/cafe.webp?v=1', w: 676, h: 386, bg: '#29221e', tube: { x: 228, y: 34, w: 226, h: 250, blend: 'screen' }, flow: '#e5f6ff', sprite: true, font: VD_FONT, ring: { cx: 342.9, cy: 79.6, hole: 32.3, img: { src: '/assets/decor/scenes/cafe-r1.webp?v=1', x: 313.5, y: 50, w: 59, h: 59 } }, num: { x: 343.4, y: 85, size: 14.1, dw: 7.7, pw: 10.7 }, ink: '#ebe7dc' }
  ];
  /* @vd-scenes:end */
  KINDS.vmaker.scenes = VIDEO_SCENES; KINDS.vmaker.sceneKey = 'aiapp_vd_scene';
  KINDS.vtrend.scenes = TREND_SCENES; KINDS.vtrend.sceneKey = 'aiapp_vt_scene';
  KINDS.decor.scenes = DECOR_SCENES; KINDS.decor.sceneKey = 'aiapp_dc_scene';
  /* التبادل: مشهد لكلّ توليد بالدور، ويُتذكّر الدور بين الجلسات. v-style-scene: دور لكلّ نوع (cfg.scenes + cfg.sceneKey)؛
     بلا وسيط = الأزياء كما كان. peek = المشهد القادم بلا تقديم الدور (للتحميل المسبق). */
  var SCENE_KEY = 'aiapp_fx_scene';
  var sceneTurns = Object.create(null);
  function nextScene(cfg, peek){
    var list = (cfg && cfg.scenes) || SCENES, key = (cfg && cfg.sceneKey) || SCENE_KEY;
    var sceneTurn = sceneTurns[key];
    if(sceneTurn == null){ sceneTurn = 0; try{ sceneTurn = parseInt(localStorage.getItem(key), 10) || 0; }catch(e){ sceneTurn = 0; } }
    var sc = list[sceneTurn % list.length];
    if(peek){ sceneTurns[key] = sceneTurn; return sc; }
    sceneTurn = (sceneTurn + 1) % list.length;
    sceneTurns[key] = sceneTurn;
    try{ localStorage.setItem(key, String(sceneTurn)); }catch(e){ /* guard-ok — بلا تخزين يبدأ الدور من الأوّل في كلّ فتح */ }
    return sc;
  }
  function pc(v, total){ return (Math.round(v / total * 100000) / 1000) + '%'; }
  function arcLen(sc){ return Math.round(2 * Math.PI * sc.ring.r * 10) / 10; }
  /* هيكل المشهد: إطار تأثيرات بنسبة الصورة (يطابقها بأيّ مقاس وبأيّ قصّ جانبيّ) فيه الأنبوب والتموّجات وعدّاد الصورة SVG بإحداثيّاتها.
     داخل الحلقة رقم فقط؛ القوس يمتلئ على حافّتها، والجريان مثقوب عندها فيبقى خلفها. */
  function sceneHtml(sc){
    /* v-scene-kinds: الحلقة والرقم والشريط والنصّ والأنبوب اختياريّة — يُبنى ما في بيانات المشهد فقط. الجريان يُثقب عند الحلقة إن
       كانت داخل الأنبوب (حلقات اللوحات الجانبيّة خارجه). مشهدا الأزياء ومشاهد الستايل فيها الكلّ فهيكلها كما كان حرفًا. */
    var t = sc.tube, r = sc.ring, L = r ? arcLen(sc) : 0;
    var inTube = !!(r && t && r.cx > t.x && r.cx < t.x + t.w && r.cy > t.y && r.cy < t.y + t.h);
    var hole = inTube ? 'radial-gradient(ellipse ' + pc(r.hole, t.w) + ' ' + pc(r.hole, t.h) + ' at ' + pc(r.cx - t.x, t.w) + ' ' + pc(r.cy - t.y, t.h) + ',transparent 0,transparent 96%,#000 100%)' : '';
    var rot = r ? ' transform="rotate(-90 ' + r.cx + ' ' + r.cy + ')"' : '';
    /* خطّ أرقام المشهد إن خالف الافتراضيّ (أرقام صور الفيديو والديكور نحيفة غير مضغوطة) — نمط سطريّ يغلب قاعدة الصنف */
    var fst = sc.font ? ' style="font-family:' + sc.font.family + ';font-weight:' + sc.font.weight + '"' : '';
    /* v-style-scene: حزام بلا جريان (tube.gap = [من، إلى] بإحداثيّات الصورة) — يخفت الجريان فوق الشريط ويعود تحت النصّ */
    var band = '';
    if(t && t.gap){
      var g0 = (t.gap[0] - t.y) / t.h * 100, g1 = (t.gap[1] - t.y) / t.h * 100, rd = function(v){ return (Math.round(v * 100) / 100) + '%'; };
      var bm = 'linear-gradient(180deg,transparent 0,#000 6%,#000 ' + rd(g0 - 3.5) + ',transparent ' + rd(g0) + ',transparent ' + rd(g1) + ',#000 ' + rd(g1 + 3.5) + ',#000 94%,transparent 100%)';
      band = ' style="-webkit-mask-image:' + bm + ';mask-image:' + bm + '"';
    }
    var h = '<div class="genw-frame"><div class="genw-canvas"><div class="genw-fx">';
    if(t) h += '<div class="genw-tube" style="left:' + pc(t.x, sc.w) + ';top:' + pc(t.y, sc.h) + ';width:' + pc(t.w, sc.w) + ';height:' + pc(t.h, sc.h) + ';mix-blend-mode:' + t.blend + '">'
      +   '<span' + band + '><em' + (hole ? ' style="-webkit-mask-image:' + hole + ';mask-image:' + hole + '"' : '') + '><b></b><b></b><b></b></em></span></div>';
    if(sc.rip) h += '<div class="genw-rip" style="left:' + pc(sc.rip.x, sc.w) + ';top:' + pc(sc.rip.y, sc.h) + ';width:' + pc(sc.rip.w, sc.w) + ';height:' + pc(sc.rip.h, sc.h) + ';color:' + sc.rip.color + '"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>';
    /* v-scene-kinds: قوس الحلقة صورةً (ring.img) — قصّة شفّافة من الصورة الأصليّة فوق موضعها، تُكشف بقناع مخروطيّ من الأعلى مع عقارب
       الساعة. بها يبقى القوس بتدرّج ألوانه وميل لوحته كما رُسم بالضبط؛ الخلفيّة تحتها مجراه الخافت. */
    var arcImg = function(g){ return '<i class="genw-arcimg" style="left:' + pc(g.x, sc.w) + ';top:' + pc(g.y, sc.h) + ';width:' + pc(g.w, sc.w) + ';height:' + pc(g.h, sc.h) + ';background-image:url(' + g.src + ')"></i>'; };
    if(r && r.img) h += arcImg(r.img);
    for(var ai = 0; sc.more && ai < sc.more.length; ai++){ if(sc.more[ai].img) h += arcImg(sc.more[ai].img); }
    h += '<svg class="genw-live" viewBox="0 0 ' + sc.w + ' ' + sc.h + '" aria-hidden="true">';
    /* v-style-scene: تعبئة الشريط بتدرّجه كما رُسم (على طول المجرى كلّه — فيظهر منه بقدر التقدّم)، وصفر المشهد بأرقامه */
    var barFill = sc.barFill, zero = sc.dig ? sc.dig.charAt(0) : '0', capSfx = !sc.cap ? '' : (sc.cap.suffix == null ? ' COMPLETE' : sc.cap.suffix);
    if(sc.bar && sc.bar.grad){
      barFill = 'url(#genwBarG-' + sc.id + ')';
      h += '<defs><linearGradient id="genwBarG-' + sc.id + '" gradientUnits="userSpaceOnUse" x1="' + sc.bar.x + '" y1="0" x2="' + (sc.bar.x + sc.bar.w) + '" y2="0">'
        + '<stop offset="0" stop-color="' + sc.bar.grad[0] + '"/><stop offset="1" stop-color="' + sc.bar.grad[1] + '"/></linearGradient></defs>';
    }
    /* v-pstyle-counter: صورة بلا عدّاد مرسوم — قرصه الداكن ومجرى حلقته يُرسمان قبل القوس (المشاهد الأخرى: في صورها) */
    if(r && r.disc) h += '<circle class="genw-disc" cx="' + r.cx + '" cy="' + r.cy + '" r="' + (Math.round((r.r + r.sw * 1.2) * 10) / 10) + '" fill="' + r.disc + '"></circle>';
    if(r && r.track) h += '<circle class="genw-track" cx="' + r.cx + '" cy="' + r.cy + '" r="' + r.r + '" stroke="' + r.track + '" stroke-width="' + r.sw + '"></circle>';
    if(r && !r.img) h += '<circle class="genw-arcg" cx="' + r.cx + '" cy="' + r.cy + '" r="' + r.r + '"' + rot + ' stroke="' + sc.glow + '" stroke-width="' + (Math.round(r.sw * 19) / 10) + '" stroke-dasharray="' + L + '" stroke-dashoffset="' + L + '"></circle>'
      + '<circle class="genw-arc" cx="' + r.cx + '" cy="' + r.cy + '" r="' + r.r + '"' + rot + ' stroke="' + sc.arc + '" stroke-width="' + r.sw + '" stroke-dasharray="' + L + '" stroke-dashoffset="' + L + '"></circle>';
    if(sc.num) h += '<text class="genw-num" x="' + (sc.num.x || r.cx) + '" y="' + sc.num.y + '" text-anchor="middle" lengthAdjust="spacingAndGlyphs" font-size="' + sc.num.size + '" fill="' + sc.ink + '"' + fst + '>' + zero + '%</text>';
    if(sc.bar && sc.bar.trough) h += '<rect class="genw-trough" x="' + sc.bar.x + '" y="' + sc.bar.y + '" width="' + sc.bar.w + '" height="' + sc.bar.h + '" rx="' + (sc.bar.h / 2) + '" fill="' + sc.bar.trough + '"></rect>';
    if(sc.bar) h += '<rect class="genw-bar" x="' + sc.bar.x + '" y="' + sc.bar.y + '" width="0" height="' + sc.bar.h + '" rx="' + (sc.bar.h / 2) + '" fill="' + barFill + '"></rect>';
    if(sc.cap) h += '<text class="genw-cap" x="' + (sc.cap.x || r.cx) + '" y="' + sc.cap.y + '" text-anchor="' + (sc.cap.anchor || 'middle') + '" lengthAdjust="spacingAndGlyphs" font-size="' + sc.cap.size + '" fill="' + sc.capInk + '">' + zero + '%' + capSfx + '</text>';
    /* حلقات إضافيّة (لوحة جانبيّة ثانية بعدّادها): قوس ووهج ورقم لكلّ واحدة، تمشي مع الرئيسيّة */
    for(var mi = 0; sc.more && mi < sc.more.length; mi++){
      var m = sc.more[mi], ml = Math.round(2 * Math.PI * m.r * 10) / 10, mrot = ' transform="rotate(-90 ' + m.cx + ' ' + m.cy + ')"';
      if(!m.img) h += '<circle class="genw-xarcg" cx="' + m.cx + '" cy="' + m.cy + '" r="' + m.r + '"' + mrot + ' stroke="' + (m.glow || sc.glow) + '" stroke-width="' + (Math.round(m.sw * 19) / 10) + '" stroke-dasharray="' + ml + '" stroke-dashoffset="' + ml + '"></circle>'
        + '<circle class="genw-xarc" cx="' + m.cx + '" cy="' + m.cy + '" r="' + m.r + '"' + mrot + ' stroke="' + (m.arc || sc.arc) + '" stroke-width="' + m.sw + '" stroke-dasharray="' + ml + '" stroke-dashoffset="' + ml + '"></circle>';
      if(m.num) h += '<text class="genw-xnum" x="' + (m.num.x || m.cx) + '" y="' + m.num.y + '" text-anchor="middle" lengthAdjust="spacingAndGlyphs" font-size="' + m.num.size + '" fill="' + (m.ink || sc.ink) + '"' + fst + '>' + zero + '%</text>';
    }
    if(sc.cap && sc.cap.word) h += '<text class="genw-capw" x="' + sc.cap.word.x + '" y="' + (sc.cap.word.y || sc.cap.y) + '" text-anchor="middle" lengthAdjust="spacingAndGlyphs" textLength="' + sc.cap.word.len + '" font-size="' + (sc.cap.word.size || sc.cap.size) + '" fill="' + sc.capInk + '">' + sc.cap.word.text + '</text>';
    if(sc.refl) h += '<text class="genw-refl" x="' + r.cx + '" y="0" transform="matrix(1 0 0 -' + sc.refl.sy + ' 0 ' + sc.refl.y + ')" text-anchor="middle" lengthAdjust="spacingAndGlyphs" font-size="' + sc.cap.size + '" fill="' + sc.refl.ink + '">0% COMPLETE</text>';
    return h + '</svg></div></div></div>'
      + '<div class="genw-stage"></div>'
      + '<div class="genw-sub"><span class="genw-timer"></span></div>';
  }
  function sceneCss(){
    return ''
    + '.genw--scene{width:min(100%,760px);margin:12px auto 10px}'
    /* النيون بإطار سماويّ ورديّ؛ الذهبيّ يبقى على إطار البطاقة الذهبيّ الأصليّ */
    + '.genw--neon .genw-frame{animation:genwNeon 2.6s ease-in-out infinite}'
    + '.genw--neon .genw-frame::before{background:linear-gradient(120deg,transparent 15%,rgba(125,249,255,.15) 30%,#bff6ff 45%,#ff7bd5 55%,rgba(125,249,255,.15) 70%,transparent 85%);background-size:280% 100%}'
    + '@keyframes genwNeon{0%,100%{box-shadow:0 0 22px -6px rgba(125,249,255,.4),0 0 60px -18px rgba(255,123,213,.25)}'
    +   '50%{box-shadow:0 0 34px -4px rgba(125,249,255,.6),0 0 90px -14px rgba(255,123,213,.4)}}'
    + '.genw--scene .genw-canvas,html[data-mode="light"] .genw--scene .genw-canvas{display:block;aspect-ratio:var(--ar);background:#070b22 center/cover no-repeat}'
    /* الجوّال: إطار أطول يقصّ جانبَي الصورة فيكبر البرج وعدّاده (العدّاد في منتصف العرض) */
    + '@media (max-width:520px){.genw--scene .genw-canvas,html[data-mode="light"] .genw--scene .genw-canvas{aspect-ratio:5/4}}'
    /* إطار التأثيرات: بارتفاع المشهد ونسبة الصورة ومنتصفه منتصفها — فما بداخله بنِسَب من الصورة نفسها */
    + '.genw-fx{position:absolute;top:0;left:50%;height:100%;aspect-ratio:var(--ar);transform:translateX(-50%);pointer-events:none}'
    /* الحركة داخل الأنبوب (خلف العدّاد): تخفت عند حافّتيه وطرفيه، وثلاث طبقات تنزل بنصف ارتفاعها بالضبط (= عدد صحيح من
       البلاطات) فتتكرّر بلا قفزة — transform وحده. الدمج (screen/multiply) من بيانات المشهد. */
    + '.genw-tube{position:absolute;overflow:hidden;z-index:1;'
    +   '-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 10%,#000 90%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 10%,#000 90%,transparent 100%)}'
    + '.genw-tube span,.genw-tube em{position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden}'
    + '.genw-tube span{-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 7%,#000 93%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 7%,#000 93%,transparent 100%)}'
    + '.genw-tube b{position:absolute;left:0;right:0;top:-100%;height:200%;background-repeat:repeat}'
    + '.genw-tube b:nth-child(1){background-size:34% 50%;opacity:.8;animation:genwFlow 3.6s linear infinite}'
    + '.genw-tube b:nth-child(2){background-size:20.5% 25%;opacity:.95;animation:genwFlow 1.25s linear infinite}'
    + '.genw-tube b:nth-child(3){background-size:14% 16.667%;opacity:.9;animation:genwFlow 2.2s linear infinite}'
    + '@keyframes genwFlow{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,50%,0)}}'
    /* تموّجات على بركة قاعدة الأنبوب — حيث ينزل الماء */
    + '.genw-rip{position:absolute;z-index:1}'
    + '.genw-rip i{position:absolute;width:13%;aspect-ratio:4/1;border:1px solid currentColor;border-radius:50%;opacity:0;animation:genwRip 1.9s ease-out infinite}'
    + '.genw-rip i:nth-child(1){left:6%;top:30%}'
    + '.genw-rip i:nth-child(2){left:24%;top:62%;animation-delay:.45s}'
    + '.genw-rip i:nth-child(3){left:43%;top:20%;animation-delay:.9s}'
    + '.genw-rip i:nth-child(4){left:60%;top:66%;animation-delay:.25s}'
    + '.genw-rip i:nth-child(5){left:78%;top:28%;animation-delay:1.3s}'
    + '.genw-rip i:nth-child(6){left:14%;top:78%;animation-delay:1.55s}'
    + '.genw-rip i:nth-child(7){left:50%;top:80%;animation-delay:.7s}'
    + '@keyframes genwRip{0%{transform:scale(.15);opacity:.85}100%{transform:scale(1.5);opacity:0}}'
    /* عدّاد الصورة: SVG يملأ إطار التأثيرات وإحداثيّاته إحداثيّات الصورة */
    + '.genw-live{position:absolute;top:0;left:0;width:100%;height:100%;z-index:3;overflow:visible;direction:ltr}'
    + '.genw-live circle{fill:none}'
    + '.genw-live circle.genw-disc{fill:var(--genw-disc,rgba(6,9,18,.5))}'
    + '.genw-arc,.genw-arcg,.genw-xarc,.genw-xarcg{transition:stroke-dashoffset .25s linear}'
    /* قوس الصورة: فوق الجريان وتحت الأرقام، مخفيّ حتى أوّل رسم */
    + '.genw-arcimg{position:absolute;z-index:2;background:center/100% 100% no-repeat;-webkit-mask-image:conic-gradient(#000 0,transparent 0);mask-image:conic-gradient(#000 0,transparent 0)}'
    + '.genw-num,.genw-cap,.genw-refl,.genw-xnum{font-family:' + HUD_FONT + ';font-weight:700}'
    + '.genw-bar{transition:width .25s linear}'
    + '.genw--scene .genw-stage{text-align:center}'
    + '.genw--scene .genw-sub{justify-content:center}'
    /* v-style-scene: إطار كلّ ثوب — النيون سماويّ ورديّ كنيون الأزياء، الفضّيّ والأبيض أبيض ثلجيّ، الذهبيّ والعربيّ على الذهبيّ الأصليّ؛
       والمشهد العربيّ بخطّ عربيّ لأرقامه وكلمته */
    + '.genw--stNeon .genw-frame{animation:genwNeon 2.6s ease-in-out infinite}'
    + '.genw--stNeon .genw-frame::before{background:linear-gradient(120deg,transparent 15%,rgba(125,249,255,.15) 30%,#bff6ff 45%,#ff7bd5 55%,rgba(125,249,255,.15) 70%,transparent 85%);background-size:280% 100%}'
    + '.genw--stSilver .genw-frame,.genw--stWhite .genw-frame{animation:genwIce 2.6s ease-in-out infinite}'
    + '.genw--stSilver .genw-frame::before,.genw--stWhite .genw-frame::before{background:linear-gradient(120deg,transparent 15%,rgba(214,244,255,.18) 30%,#ffffff 45%,#bfeaff 55%,rgba(214,244,255,.18) 70%,transparent 85%);background-size:280% 100%}'
    + '@keyframes genwIce{0%,100%{box-shadow:0 0 22px -6px rgba(200,236,255,.38),0 0 60px -18px rgba(255,255,255,.2)}'
    +   '50%{box-shadow:0 0 34px -4px rgba(200,236,255,.58),0 0 90px -14px rgba(255,255,255,.34)}}'
    + '.genw--stArab .genw-num,.genw--stArab .genw-cap,.genw-capw{font-family:' + AR_HUD_FONT + ';font-weight:700}'
    /* أرقام هذه الصور أنحف من أرقام مشهدَي الأزياء */
    + '.genw--stSilver text,.genw--stGold text,.genw--stWhite text,.genw--stNeon text{font-weight:600}'
    /* أنبوب هذه الصور أضيق من برج الأزياء — بلاطات أعرض كي تبقى الخيوط ظاهرة (الارتفاعات كما هي: نصف الطبقة = عدد صحيح من البلاطات) */
    + '.genw[class*="genw--st"] .genw-tube b:nth-child(1){background-size:50% 50%}'
    + '.genw[class*="genw--st"] .genw-tube b:nth-child(2){background-size:31% 25%}'
    + '.genw[class*="genw--st"] .genw-tube b:nth-child(3){background-size:21% 16.667%}'
    + '@media (prefers-reduced-motion:reduce){.genw--stNeon .genw-frame,.genw--stSilver .genw-frame,.genw--stWhite .genw-frame{animation:none}}'
    /* v-scene-kinds: في صانع الفيديو المشهد مكان شاشة المعاينة — بعرض عمودها وبلا هامش علويّ؛ وأنبوب صور الفيديو والديكور أعرض
       من برج الستايل فبلاطاته بين المقاسين */
    + '.vmk-side .genw--scene{width:100%;margin:0 0 10px}'
    + '.genw[class*="genw--vd"] .genw-tube b:nth-child(1),.genw[class*="genw--vt"] .genw-tube b:nth-child(1),.genw[class*="genw--dc"] .genw-tube b:nth-child(1){background-size:42% 50%}'
    + '.genw[class*="genw--vd"] .genw-tube b:nth-child(2),.genw[class*="genw--vt"] .genw-tube b:nth-child(2),.genw[class*="genw--dc"] .genw-tube b:nth-child(2){background-size:26% 25%}'
    + '.genw[class*="genw--vd"] .genw-tube b:nth-child(3),.genw[class*="genw--vt"] .genw-tube b:nth-child(3),.genw[class*="genw--dc"] .genw-tube b:nth-child(3){background-size:18% 16.667%}'
    /* مربّع الرفع يُخفى ما دام المشهد في مكانه (له display سطريّ فلا بدّ من !important) */
    + '[data-genw-hide]{display:none !important}'
    /* أندرويد: بلا دمج ضوئيّ (أخفّ على المعالج الرسوميّ) وبطبقتين */
    + 'html.omAndroid .genw-tube{mix-blend-mode:normal !important}'
    + 'html.omAndroid .genw-tube b:nth-child(1){display:none}'
    + '@media (prefers-reduced-motion:reduce){.genw--neon .genw-frame,.genw-tube b,.genw-rip i{animation:none}.genw-arc,.genw-arcg,.genw-bar{transition:none}}';
  }

  var AR_DIG = '٠١٢٣٤٥٦٧٨٩';
  function toAr(n){ return String(n).replace(/[0-9]/g, function(d){ return AR_DIG[+d]; }); }
  /* أعرض رقم مقيس بخطّ سطر الوقت: ٠٫٥٧٤em عربيًّا و٠٫٦em لاتينيًّا (مسبار الأرقام، ١٢ بكسل) */
  var SEC_DIGIT_EM = 0.62;
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

    var sc = cfg.scenes ? nextScene(cfg) : null; /* v-gen-scene-exact: مشهد هذا التوليد (بالدور) — v-style-scene: بدور نوعه */
    var root = document.createElement('div');
    root.className = 'genw' + (cfg.wide ? ' genw--video' : '') + (sc ? ' genw--scene genw--' + sc.id : '');
    /* v-gen-scene: مشهد بخلفيّة ومطر وعدّاد حيّ — بالخطّافات نفسها فالنبضة أدناه واحدة للنوعين */
    root.innerHTML = sc ? sceneHtml(sc) : ''
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
    var arcEl = root.querySelector('.genw-arc'), arcGlow = root.querySelector('.genw-arcg');
    var numEl = root.querySelector('.genw-num'), barEl = root.querySelector('.genw-bar'), capEl = root.querySelector('.genw-cap'), reflEl = root.querySelector('.genw-refl');
    if(sc){
      try{
        root.style.setProperty('--ar', sc.w + '/' + sc.h);
        root.querySelector('.genw-canvas').style.backgroundImage = 'url("' + sc.src + '")';
        if(sc.bg) root.querySelector('.genw-canvas').style.backgroundColor = sc.bg; /* v-style-scene: لون المشهد ريثما تُحمَّل صورته */
        var flows = root.querySelectorAll('.genw-tube b');
        for(var fi = 0; fi < flows.length && fi < FLOW_TILES.length; fi++) flows[fi].style.backgroundImage = flowTile(FLOW_TILES[fi][0], FLOW_TILES[fi][1], FLOW_TILES[fi][2], sc.flow);
      }catch(e){ /* guard-ok — بلا خلفيّة أو جريان يبقى لون المشهد الداكن والعدّاد يعمل */ }
    }
    /* الرقم والقوس والشريط والنصّ (وانعكاسه) — أرقام لاتينيّة كما في تصميم المالك، بعرض حروف الأصل */
    var sceneArc = (sc && sc.ring) ? arcLen(sc) : 0;
    /* v-scene-kinds: الحلقات الإضافيّة وأرقامها (غائبة في أغلب المشاهد) */
    var xArcs = root.querySelectorAll('.genw-xarc'), xGlows = root.querySelectorAll('.genw-xarcg'), xNums = root.querySelectorAll('.genw-xnum');
    var arcImgs = root.querySelectorAll('.genw-arcimg');
    function paintScene(shown){
      var digits = String(shown).length;
      /* v-style-scene: أرقام المشهد كما رُسمت فيه (sc.dig للعربيّ) ولاحقة نصّه — لا لغة الواجهة */
      var txt = sc.dig ? String(shown).replace(/[0-9]/g, function(d){ return sc.dig.charAt(+d); }) : String(shown);
      /* v-scene-kinds: يُرسم ما في المشهد فقط — رقم، قوس، شريط، نصّ؛ كلٌّ إن وُجد عنصره */
      if(numEl){
        numEl.textContent = txt + '%';
        numEl.setAttribute('textLength', String(Math.round((digits * sc.num.dw + sc.num.pw) * 10) / 10));
      }
      var off = String(Math.round(sceneArc * (100 - shown)) / 100);
      if(arcEl){ arcEl.style.strokeDashoffset = off; arcGlow.style.strokeDashoffset = off; }
      if(barEl) barEl.setAttribute('width', String(Math.round(sc.bar.w * shown) / 100));
      if(capEl){
        var capTxt = txt + '%' + (sc.cap.suffix == null ? ' COMPLETE' : sc.cap.suffix);
        var capLen = String(Math.round((digits * sc.cap.dw + sc.cap.rest) * 10) / 10);
        capEl.textContent = capTxt;
        capEl.setAttribute('textLength', capLen);
        if(reflEl){ reflEl.textContent = capTxt; reflEl.setAttribute('textLength', capLen); }
      }
      if(sc.sprite){
        var cone = 'conic-gradient(#000 ' + shown + '%,transparent 0)';
        for(var ci = 0; ci < arcImgs.length; ci++){ arcImgs[ci].style.webkitMaskImage = cone; arcImgs[ci].style.maskImage = cone; }
      }
      if(sc.more){
        for(var xi = 0; xi < sc.more.length; xi++){
          var xm = sc.more[xi], xoff = String(Math.round(2 * Math.PI * xm.r * (100 - shown) * 10) / 1000);
          if(xArcs[xi]) xArcs[xi].style.strokeDashoffset = xoff;
          if(xGlows[xi]) xGlows[xi].style.strokeDashoffset = xoff;
          if(xNums[xi] && xm.num){ xNums[xi].textContent = txt + '%'; xNums[xi].setAttribute('textLength', String(Math.round((digits * xm.num.dw + xm.num.pw) * 10) / 10)); }
        }
      }
    }
    if(pctSmall) pctSmall.textContent = hint;
    stageEl.textContent = stages[0];

    var stageIdx = 0, slow = false;
    function fmt(n){ return isAr() ? toAr(n) : String(n); }
    /* v-gen-steady: خارج المحادثة يمسح منظِّف الواجهة الإيموجي — نكتب النصّ منظَّفًا أصلًا فلا يرمش؛ داخلها (.msg) يبقى كما هو */
    var inChat = null, lastSec = -1, secEl = null;
    function uiText(txt){
      if(inChat === null) inChat = !!(root.closest && root.closest('.msg'));
      return inChat ? txt : stripEmoji(txt);
    }
    /* سطر الوقت يُبنى مرّة (بادئة + خانة الثواني + الوحدة والمتوقَّع) ثمّ لا يتغيّر فيه إلّا رقم الخانة، مرّة في الثانية */
    function paintTimer(sec){
      if(sec === lastSec) return;
      lastSec = sec;
      var num = fmt(sec);
      if(!secEl){
        timerEl.textContent = uiText('⏱ ');
        secEl = document.createElement('b');
        timerEl.appendChild(secEl);
        timerEl.appendChild(document.createTextNode((isAr() ? 'ث' : 's') + ' — ' + expect));
      }
      secEl.style.minWidth = (num.length * SEC_DIGIT_EM) + 'em';
      secEl.textContent = num;
    }
    /* قبل أوّل نبضة موصولة (≤١٥٠ مث) السطر نصّ عاديّ يحفظ ارتفاعه؛ بعدها يبنيه paintTimer بخانته */
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
      if(sc) paintScene(shown);
      else { pctEl.firstChild.textContent = fmt(shown) + '%'; fillEl.style.width = shown + '%'; }
      paintTimer(Math.floor(el));
      if(el > cfg.est * 2 && !slow){
        slow = true;
        stageEl.classList.add('genw-swap');
        setTimeout(function(){ stageEl.textContent = uiText(slowTxt); stageEl.classList.remove('genw-swap'); }, 300);
      } else if(!slow){
        var want = Math.min(stages.length - 1, Math.floor(p * stages.length));
        if(want !== stageIdx){
          stageIdx = want;
          stageEl.classList.add('genw-swap');
          setTimeout(function(){ stageEl.textContent = uiText(stages[stageIdx]); stageEl.classList.remove('genw-swap'); }, 300);
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
  /* v-audit-attach (x-i18n-6): سطرا فيديو المحادثة صارا بمفتاح الـ١٤ لغة في app-09 (axAttachVidCreating/axAttachVidCreatingShort) —
     التعبير الحرفيّ وحده يُسقط البطاقة عن الفرنسيّة والهنديّة وغيرهما، فيُطابَق نصّ اللغة الحاليّة أيضًا (بلا نقاط الختام). */
  function chatVideoLine(s){
    if(CHAT_VIDEO_RE.test(s)) return true;
    if(s.indexOf('🎬') < 0 || typeof t !== 'function') return false;
    var ks = ['axAttachVidCreating', 'axAttachVidCreatingShort'];
    for(var i = 0; i < ks.length; i++){
      var v = '';
      try{ v = String(t(ks[i]) || ''); }catch(e){ v = ''; }
      v = v.replace(/[\s….]+$/, '');
      if(v && v !== ks[i] && s.indexOf(v) !== -1) return true;
    }
    return false;
  }

  /* ١٥ أكتوبر ٢٠٢٦ — طلب المالك إرجاع انتظار صور المحادثة لما قبل البطاقة:
     تبقى رسالة «أرسم لك الصورة…» من العارض، بلا عدّاد إضافي. بقية اللوحات كما هي. */
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
  /* v-scene-kinds: لوحة حالتها لا تبدأ دائمًا بالإيموجي (الترند المتعدّد المشاهد) تُعرف بوجوده في النصّ — busyHas */
  function busyText(p, txt){
    if(hasPrefix(txt, p.busy)) return true;
    for(var i = 0; txt && p.busyHas && i < p.busyHas.length; i++){ if(txt.indexOf(p.busyHas[i]) >= 0) return true; }
    return false;
  }
  function panelBusy(p, ptxt){
    if(busyText(p, ptxt)){ noteBusy(p, ptxt); return true; }
    if(ptxt && cleanBusy[p.id] && ptxt === cleanBusy[p.id]) return true;
    delete rawBusy[p.id]; delete cleanBusy[p.id];
    return false;
  }
  /* v-trend-scene-live: لوحة تعلن انشغالها بسمة على سطر حالتها — لا نصّ يُفسَّر */
  function attrBusy(p, pel){ try{ return !!pel && pel.getAttribute(p.busyAttr) === '1'; }catch(e){ return false; } }
  /* تُستدعى مع كلّ دفعة تغيّرات — ثلاث قراءات بالمعرّف فقط */
  function sample(){
    for(var i = 0; i < PANELS.length; i++){
      var el = null, txt = '';
      try{ el = document.querySelector(PANELS[i].sel); txt = el ? String(el.textContent || '').trim() : ''; }catch(e){ txt = ''; }
      if(busyText(PANELS[i], txt)) noteBusy(PANELS[i], txt);
    }
  }

  function scan(){
    if(!document.body) return;
    /* فيديو المحادثة: سطر «🎬 جاري إنشاء الفيديو…» الجاري داخل فقاعة التفكير
       (.chat-status-text) ← بطاقة عريضة في الفقاعة؛ اختفى السطر ← تُرفع البطاقة. */
    var cvFound = false;
    var cvEls = document.querySelectorAll('.chat-status-text');
    for(var ci = 0; ci < cvEls.length; ci++){
      var ctxt = '';
      try{ ctxt = String(cvEls[ci].textContent || ''); }catch(e){ continue; }
      if(!chatVideoLine(ctxt)) continue;
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
      var busy = p.busyAttr ? attrBusy(p, pel) : panelBusy(p, ptxt); /* v-gen-scene: يصمد لحذف الإيموجي من سطر الحالة */
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
          /* v-gen-steady: الإخفاء قبل التمرير — وإلّا حُسب موضع البطاقة تحت نتيجة ستختفي فيتجاوزها التمرير */
          applyHide(p, scopeEl);
          /* فوق = خارج مجال النظر (المستخدم عند زرّ «صمم» أسفل النموذج) — نصعد إليها */
          if(mp.top){ try{ node.scrollIntoView({ behavior: 'smooth', block: 'center' }); }catch(e){ /* guard-ok — التمرير ترف؛ البطاقة مركّبة */ } }
          else if(p.scroll){ try{ node.scrollIntoView({ behavior: 'smooth', block: 'center' }); }catch(e){ /* guard-ok — التمرير ترف؛ البطاقة مركّبة */ } }
        }catch(e){ try{ __swallow(e, 'gen-wait:panel'); }catch(_){ /* العرض تجميليّ */ } }
      } else if(!busy && card){
        try{ card.parentNode.removeChild(card); }catch(e){ try{ __swallow(e, 'gen-wait:done'); }catch(_){ /* العرض تجميليّ */ } }
        delete t0ByPanel[p.id];
      }
      applyHide(p, scopeEl);
    }
  }

  /* v-gen-scene-exact: المشهد في مكان مربّع الرفع — المربّع مخفيّ ما دامت بطاقة «فوق» موجودة، ويعود فور رفعها.
     v-gen-steady: hideSel قد يسمّي عدّة عناصر (مربّع الرفع، والنتيجة السابقة وأزرارها) — كلّها تُخفى وتعود معًا. */
  function applyHide(p, scopeEl){
    if(!p.hideSel) return;
    try{
      var hideEls = scopeEl.querySelectorAll(p.hideSel);
      var topCard = scopeEl.querySelector('.genw[data-genw-panel="' + p.id + '"][data-genw-top]');
      for(var hi = 0; hi < hideEls.length; hi++){
        var hideEl = hideEls[hi];
        if(topCard && !hideEl.hasAttribute('data-genw-hide')) hideEl.setAttribute('data-genw-hide', '1');
        else if(!topCard && hideEl.hasAttribute('data-genw-hide')) hideEl.removeAttribute('data-genw-hide');
      }
    }catch(e){ try{ __swallow(e, 'gen-wait:hide'); }catch(_){ /* العرض تجميليّ */ } }
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
    for(var k = 0; k < SCENES.length; k++){ try{ (new Image()).src = SCENES[k].src; }catch(e){ /* guard-ok — بلا تحميل مسبق تُحمَّل مع البطاقة */ } }
  }
  if(document.addEventListener){
    document.addEventListener('click', function(e){
      var tg = e && e.target;
      if(tg && tg.closest && tg.closest('#btnFashionAI')) preloadScenes();
      /* v-style-scene: خمسة مشاهد — يُحمَّل القادم وحده عند فتح الاستوديو وعند كلّ «ولّد» (لا الخمسة) */
      if(tg && tg.closest && tg.closest('#btnStudioAI, #studioAiGenerateBtn')){ try{ (new Image()).src = nextScene(KINDS.studio, true).src; }catch(err){ /* guard-ok — بلا تحميل مسبق تُحمَّل مع البطاقة */ } }
      if(tg && tg.closest && tg.closest('#btnPortraitStyle, #portraitStyleGenerateBtn')){ try{ (new Image()).src = nextScene(KINDS.styles, true).src; }catch(err){ /* guard-ok — بلا تحميل مسبق تُحمَّل مع البطاقة */ } }
      /* v-scene-kinds: القادم وحده لكلّ مجموعة — عند فتح الأداة وعند زرّ التوليد */
      var pre = !tg || !tg.closest ? null : (tg.closest('#btnVideoMaker, #videoMakerGenerateBtn') ? KINDS.vmaker : (tg.closest('#vtGrid, #vtGo') ? KINDS.vtrend : (tg.closest('#btnDesignAI, #designAiGenerateBtn, #designAiIdeaAI') ? KINDS.decor : null)));
      if(pre && pre.scenes && pre.scenes.length){ try{ (new Image()).src = nextScene(pre, true).src; }catch(err){ /* guard-ok — بلا تحميل مسبق تُحمَّل مع البطاقة */ } }
    }, true);
  }

  window.omranGenWait = { render: render, scan: scan, _eased: eased, PHRASES: PHRASES, PANELS: PANELS, KINDS: KINDS };
  window.omranGenWait._mountPoint = mountPoint; /* v-gen-scene: للاختبار */
  window.omranGenWait._panelBusy = panelBusy;
  window.omranGenWait._sample = sample;
  window.omranGenWait._scenes = SCENES; window.omranGenWait._nextScene = nextScene; window.omranGenWait._sceneHtml = sceneHtml; /* v-gen-scene-exact: للاختبار */
  window.omranGenWait._secDigitEm = SEC_DIGIT_EM; window.omranGenWait._applyHide = applyHide; /* v-gen-steady: للاختبار */
  window.omranGenWait._styleScenes = STYLE_SCENES; window.omranGenWait._portraitScenes = PORTRAIT_SCENES; /* v-pstyle-scene: للاختبار */ /* v-style-scene: للاختبار */
  window.omranGenWait._attrBusy = attrBusy; /* v-trend-scene-live: للاختبار */
  window.omranGenWait._videoScenes = VIDEO_SCENES; window.omranGenWait._trendScenes = TREND_SCENES; window.omranGenWait._decorScenes = DECOR_SCENES; /* v-scene-kinds: للاختبار */
})();
