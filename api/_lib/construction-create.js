// Vercel Serverless Function: "🏗️ تصاميم المقاولات والبناء".
// Takes a text description of a construction/building project and asks
// Gemini for (1) a concept architectural render image and (2) a short
// text plan: rough material list + rough cost estimate range + a mandatory
// disclaimer that this is NOT an engineering document / building permit.
// Server-side owner API key only (GEMINI_API_KEY).
const { checkConstructionQuota, consumeConstruction, CONSTRUCTION_DAILY_LIMIT } = require('./_constructionUsage');
const { saveDesign } = require('./_constructionLibrary');
const { fetchImageWithRetry, isImageTimeoutError } = require('./image-fetch');

const TEXT_TIMEOUT_MS = 60000;
const GENERATION_ERROR = 'construction_generation_failed';

const BUILDING_LABELS = {
  villa: 'a residential villa',
  apartment: 'an apartment building',
  office: 'an office building',
  warehouse: 'an industrial warehouse',
  mosque: 'a mosque',
  shop: 'a retail shop/storefront',
  rest: 'a private weekend rest house (istiraha) with a majlis and outdoor seating',
  farm: 'a farm house with surrounding agricultural land',
  annexhome: 'a small residential annex / guest house',
  mall: 'a small commercial retail mall',
  school: 'a school building with classrooms',
  hall: 'a wedding and events hall',
};

const BUILDING_LABELS_AR = {
  villa: 'فيلا سكنية',
  apartment: 'عمارة سكنية',
  office: 'مبنى مكاتب',
  warehouse: 'مستودع صناعي',
  mosque: 'مسجد',
  shop: 'محل تجاري',
  rest: 'استراحة',
  farm: 'مزرعة',
  annexhome: 'ملحق سكني',
  mall: 'مجمّع تجاري',
  school: 'مدرسة',
  hall: 'صالة أفراح',
};

const STYLE_LABELS = {
  modern: 'modern minimalist architectural style, clean lines, large glass windows',
  classic: 'classic elegant architectural style, columns, warm stone finishes',
  gulf: 'traditional Gulf/Emirati architectural style, mashrabiya patterns, sand-tone facade',
  luxury: 'luxurious high-end architectural style, premium materials, dramatic lighting',
  industrial: 'industrial architectural style, exposed steel and concrete',
  andalusi: 'Andalusian Moorish architectural style, horseshoe arches, carved plasterwork, patterned tilework, inner courtyard',
  islamic: 'contemporary Islamic architectural style, geometric mashrabiya screens, clean modern volumes, subtle pointed arches',
  mediterranean: 'Mediterranean architectural style, white stucco walls, terracotta roof tiles, arched openings, wooden shutters',
  najdi: 'traditional Najdi architectural style, thick earth-tone walls, triangular openings, exposed wooden roof beams',
  neoclassic: 'neo-classical architectural style, symmetrical facade, ornate cornices, tall columns, cream stone finish',
};

const STYLE_LABELS_AR = {
  modern: 'عصري بسيط',
  classic: 'كلاسيكي',
  gulf: 'خليجي تراثي',
  luxury: 'فخم',
  industrial: 'صناعي',
  andalusi: 'أندلسي',
  islamic: 'إسلامي معاصر',
  mediterranean: 'متوسطي',
  najdi: 'نجدي',
  neoclassic: 'نيو كلاسيك',
};

const ANNEX_LABELS_AR = {
  majlis: 'مجلس رجال منفصل',
  servant: 'ملحق خادمة/سائق',
  pool: 'مسبح',
  carport: 'مواقف سيارات مغطاة',
  garden: 'حديقة/برجولة',
  laundry: 'غرفة غسيل/تخزين',
  elevator: 'مصعد داخلي',
  storage: 'مخزن خارجي',
  tank: 'خزان مياه',
  solar: 'ألواح طاقة شمسية',
  playground: 'ملعب خارجي',
  carport2: 'مظلة سيارات إضافية',
};
const ANNEX_LABELS_EN = {
  majlis: 'a separate men\'s majlis annex',
  servant: 'a servant/driver room annex',
  pool: 'a swimming pool',
  carport: 'a covered car parking area',
  garden: 'a garden with pergola',
  laundry: 'a laundry/storage room',
  elevator: 'an internal passenger elevator',
  storage: 'an external storage room',
  tank: 'a water tank room',
  solar: 'rooftop solar panels',
  playground: 'an outdoor sports court',
  carport2: 'an additional covered car canopy',
};

const BUDGET_RANGE_AR = {
  b1: 'حتى 300 ألف درهم',
  b2: '300 - 600 ألف درهم',
  b3: '600 ألف - 1 مليون درهم',
  b4: 'أكثر من 1 مليون درهم',
};
const BUDGET_LABELS_AR = {
  b1: 'اقتصادية (تشطيبات عادية، مواد محلية موفّرة)',
  b2: 'متوسطة (تشطيبات جيدة متوازنة بين الجودة والسعر)',
  b3: 'جيدة جدًا (تشطيبات راقية، مواد مستوردة جزئيًا)',
  b4: 'فاخرة (تشطيبات فاخرة، مواد مستوردة، تجهيزات عالية الجودة)',
};
const BUDGET_LABELS_EN = {
  b1: 'modest, economical finishes',
  b2: 'good mid-range finishes',
  b3: 'very good finishes, partly imported materials',
  b4: 'ultra luxurious, high-end imported finishes and materials',
};

const ROOM_LABELS_AR = {
  living: 'الصالة الرئيسية',
  majlis: 'المجلس',
  bedroom: 'غرفة النوم الرئيسية',
  kitchen: 'المطبخ',
  bathroom: 'الحمام',
  dining: 'غرفة الطعام',
};
const ROOM_LABELS_EN = {
  living: 'main living room',
  majlis: 'majlis / formal sitting room',
  bedroom: 'master bedroom',
  kitchen: 'kitchen',
  bathroom: 'bathroom',
  dining: 'dining room',
};

const EMIRATE_LABELS_AR = {
  dubai: 'دبي — بلدية دبي · هيئة كهرباء ومياه دبي (ديوا) · الدفاع المدني',
  abudhabi: 'أبوظبي — دائرة البلديات والنقل (DMT) · شركة أبوظبي للتوزيع · الدفاع المدني',
  sharjah: 'الشارقة — بلدية الشارقة · هيئة كهرباء ومياه وغاز الشارقة (سيوا) · الدفاع المدني',
  ajman: 'عجمان — بلدية ودائرة التخطيط بعجمان · اتحاد الماء والكهرباء · الدفاع المدني',
  ummalquwain: 'أم القيوين — بلدية أم القيوين · اتحاد الماء والكهرباء · الدفاع المدني',
  rasalkhaimah: 'رأس الخيمة — بلدية رأس الخيمة · دائرة الكهرباء والماء · الدفاع المدني',
  fujairah: 'الفجيرة — بلدية الفجيرة · اتحاد الماء والكهرباء · الدفاع المدني',
};

const ANGLE_LABELS_AR = {
  front: 'الواجهة الأمامية',
  side: 'الواجهة الجانبية',
  back: 'الواجهة الخلفية',
  aerial: 'منظر جوي علوي',
};
const ANGLE_LABELS_EN = {
  front: 'front facade view, eye level',
  side: 'side facade view, eye level',
  back: 'rear facade view, eye level',
  aerial: 'aerial drone top-down view of the whole building and plot',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { buildingType, floors, area, style, notes, token, annexes, includeInterior, budget, includePlan, includePhoto, plotArea, emirate } = body;
    const wantPlan = includePlan !== false; // default true
    const wantPhoto = !!includePhoto;
    if (!buildingType || !area) {
      res.status(400).json({ error: 'Missing buildingType or area' });
      return;
    }
    const annexList = Array.isArray(annexes) ? annexes.filter((a) => ANNEX_LABELS_AR[a]) : [];

    const quota = await checkConstructionQuota(token);
    if (!quota.allowed) {
      if (quota.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'daily_limit_reached' });
      }
      return;
    }

    const buildingDesc = BUILDING_LABELS[buildingType] || 'a building';
    const styleDesc = STYLE_LABELS[style] || STYLE_LABELS.modern;
    const floorsText = floors ? (floors + '-floor ') : '';
    const notesText = notes ? (' Additional requirements: ' + notes + '.') : '';

    const plotNum = (plotArea && !isNaN(Number(plotArea)) && Number(plotArea) > 0) ? Number(plotArea) : null;
    const emirateText = (emirate && EMIRATE_LABELS_AR[emirate]) ? EMIRATE_LABELS_AR[emirate] : '';
    const plotEnText = plotNum ? (' The total plot area is ' + plotNum + ' square meters — draw the building footprint inside the plot boundary with visible setbacks, driveway and garden space.') : '';

    const annexEnText = annexList.length ? (' The design also includes: ' + annexList.map((a) => ANNEX_LABELS_EN[a]).join(', ') + '.') : '';
    const annexArText = annexList.length ? annexList.map((a) => ANNEX_LABELS_AR[a]).join('، ') : '';

    const budgetEnText = budget && BUDGET_LABELS_EN[budget] ? (' Budget/finish level: ' + BUDGET_LABELS_EN[budget] + '.') : '';
    const budgetArText = budget && BUDGET_LABELS_AR[budget] ? BUDGET_LABELS_AR[budget] : '';
    const budgetRangeArText = budget && BUDGET_RANGE_AR[budget] ? BUDGET_RANGE_AR[budget] : '';

    const imgEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;

    const planPrompt =
      'A clean 2D architectural floor plan (top-down blueprint style, black and white line drawing) of ' +
      floorsText + buildingDesc + ', approximately ' + area + ' square meters.' + plotEnText + notesText + annexEnText +
      ' Show clearly labeled rooms with their approximate dimensions in meters written inside each room, walls, doors, and windows. ' +
      'Professional architectural floor plan style, straight lines, no color rendering, no perspective, no people, no furniture photos — just a clear labeled technical floor plan drawing.';
    const planReqBody = { contents: [{ parts: [{ text: planPrompt }] }], generationConfig: { imageConfig: { imageSize: '2K' } } };

    const photoPrompt =
      'A photorealistic architectural exterior render of ' + floorsText + buildingDesc +
      ', approximately ' + area + ' square meters, in ' + styleDesc + '.' + notesText + annexEnText + budgetEnText +
      ' STRICT CONSISTENCY: this exterior must match the floor plan of the same request exactly — same number of floors, same garage capacity, pool and annexes only if requested and in their requested location. Do not invent extra floors or elements.' +
      ' Daytime, clear sky, professional architectural visualization, high detail, no people, no text overlays.';
    const photoReqBody = { contents: [{ parts: [{ text: photoPrompt }] }], generationConfig: { imageConfig: { imageSize: '2K' } } };

    const textPrompt =
      'أنت مستشار مقاولات وبناء في الإمارات. بناءً على هذا الوصف: ' + (floors ? (floors + ' أدوار — ') : '') + (BUILDING_LABELS_AR[buildingType] || 'مبنى') + '، المساحة تقريبًا ' + area + ' متر مربع، ' +
      'الطراز: ' + (STYLE_LABELS_AR[style] || 'عصري') + '.' + (notes ? (' ملاحظات إضافية: ' + notes + '.') : '') +
      (annexArText ? (' الملاحق المطلوبة: ' + annexArText + '.') : '') + '\n\n' +
      'أعطني بالعربية وبإيجاز شديد (نقاط قصيرة، بدون مقدمات)، بهذا الترتيب بالضبط تحت عناوين واضحة:\n\n' +
      '### 📐 مساحات الغرف التقريبية\n' +
      'وزّع المساحة الكلية على الغرف المناسبة لنوع المبنى (صالة، غرف نوم، مطبخ، حمامات، مجلس، إلخ) مع مساحة تقريبية بالمتر المربع لكل غرفة.\n\n' +
      '### 🧱 المواد وكمياتها التقديرية\n' +
      'اذكر تقديرًا تقريبيًا لكل من:\n' +
      '- كمية الخرسانة (م³) للأساسات والأعمدة والأسقف\n' +
      '- عدد الطابوق التقريبي\n' +
      '- كمية الأسمنت (عدد الأكياس التقريبي)\n' +
      '- حديد التسليح (طن تقريبي)\n' +
      '- 3-5 مواد إضافية أساسية (تشطيبات، عزل، إلخ)\n' +
      (annexArText ? ('اعتبر الملاحق التالية ضمن الكميات والتكلفة: ' + annexArText + '.\n') : '') + '\n' +
      '### 💰 تقدير التكلفة\n' +
      'الميزانية المختارة: ' + (budgetRangeArText || 'غير محددة') + (budgetArText ? (' — ' + budgetArText) : '') + '.\n' +
      'اعتمد أسعار السوق الإماراتي الحالية للمتر المربع حسب مستوى التشطيب أعلاه، واذكر أرقامًا صريحة بالدرهم لكل بند:\n' +
      '- سعر المتر المربع التقريبي (درهم/م²)\n' +
      '- العظم والهيكل الإنشائي\n' +
      '- التشطيبات\n' +
      '- الكهرباء والسباكة\n' +
      '- التكييف\n' +
      '- الملاحق الإضافية\n' +
      '- **الإجمالي التقريبي: رقم واحد صريح بالدرهم**\n' +
      '- قارن الإجمالي بالميزانية المختارة وقل بوضوح: ضمن الميزانية أم يتجاوزها وبكم.\n' +
      'ثم أضف سطرًا أخيرًا: "هذا المبلغ تقريبي فقط ولا يشمل أجرة المقاول، وقد يختلف حسب المنطقة وأسعار السوق."\n\n' +
      (plotNum ? (
        '### 📏 نسبة البناء والارتدادات\n' +
        'مساحة الأرض ' + plotNum + ' م² ومساحة البناء ' + area + ' م².\n' +
        '- احسب نسبة البناء (البناء ÷ الأرض × 100) واذكرها نسبة مئوية صريحة.\n' +
        '- قل بوضوح: ضمن الحدود المعتادة في الإمارات لهذا النوع أم تتجاوزها.\n' +
        '- اذكر الارتدادات المعتادة بالمتر (أمامي/جانبي/خلفي) والمساحة المتبقية للحديقة والمواقف.\n\n'
      ) : '') +
      '### 🗓️ الجدول الزمني التنفيذي\n' +
      'سطر واحد لكل مرحلة بصيغة: المرحلة — المدة بالأسابيع. غطِّ: التصميم والرخصة، الحفر والأساسات، الهيكل الخرساني، الطابوق والتمديدات، اللياسة والعزل، التشطيبات، الأعمال الخارجية، التسليم. ثم اذكر المدة الإجمالية بالأشهر.\n\n' +
      (emirateText ? (
        '### 📋 الموافقات والرخص\n' +
        'الإمارة: ' + emirateText + '.\n' +
        'اذكر خطوات الترخيص بالترتيب، كل خطوة بسطر: الخطوة — الجهة المسؤولة — المدة التقريبية.\n\n'
      ) : '') +
      'كن مختصرًا جدًا وواضحًا، استخدم نقاط قصيرة فقط تحت كل عنوان.\n\n' +
      'وفي نهاية ردّك تمامًا أضف جدول الكميات بهذه الصيغة الحرفية بلا أي نص بعده:\n' +
      '<<<BOQ>>>\n' +
      'البند|الوحدة|الكمية|سعر الوحدة (درهم)|الإجمالي (درهم)\n' +
      '<<<END>>>\n' +
      'املأه بـ 14-18 بندًا يغطي: الحفر والردم، الأساسات، الخرسانة، حديد التسليح، الطابوق، اللياسة، العزل، البلاط والرخام، الأبواب والشبابيك، الدهانات، الكهرباء، السباكة، التكييف، المطبخ، الأدوات الصحية، الأعمال الخارجية، والملاحق المطلوبة. الكميات والأسعار أرقام مجردة بلا فواصل أو رموز، وآخر سطر للإجمالي.';

    const textEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
    const textReqBody = { contents: [{ parts: [{ text: textPrompt }] }] };

    const requestImage = (requestBody) => fetchImageWithRetry({
      url: imgEndpoint,
      makeInit: () => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }),
    });
    const fetchTasks = [
      wantPlan ? requestImage(planReqBody) : Promise.resolve(null),
      fetch(textEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(textReqBody),
        signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
      }),
      wantPhoto ? requestImage(photoReqBody) : Promise.resolve(null),
    ];

    if (includeInterior) {
      const interiorPrompt =
        'A photorealistic interior design render of a ' + styleDesc + ' main living room / majlis inside ' +
        floorsText + buildingDesc + notesText + annexEnText +
        ' Warm lighting, tasteful furniture, high-end interior design magazine quality, no people, no text overlays.';
      const interiorReqBody = { contents: [{ parts: [{ text: interiorPrompt }] }], generationConfig: { imageConfig: { imageSize: '2K' } } };
      fetchTasks.push(requestImage(interiorReqBody));
    }

    const results = await Promise.all(fetchTasks);
    const [planResult, textUpstream, photoResult, interiorResult] = results;
    if (planResult && planResult.error) throw planResult.error;

    const planUpstream = planResult && planResult.response;
    const planData = planResult ? planResult.data : null;
    const textData = await textUpstream.json();
    const photoData = photoResult ? photoResult.data : null;
    const interiorData = interiorResult ? interiorResult.data : null;

    if (wantPlan && planUpstream && !planUpstream.ok) {
      res.status(planUpstream.status).json({ error: GENERATION_ERROR });
      return;
    }

    let planImageBase64 = null;
    let planMimeType = null;
    if (planData) {
      const pParts = (((planData.candidates || [])[0] || {}).content || {}).parts || [];
      const pPart = pParts.find((p) => p.inlineData && p.inlineData.data);
      if (pPart) {
        planImageBase64 = pPart.inlineData.data;
        planMimeType = pPart.inlineData.mimeType || 'image/png';
      } else if (wantPlan) {
        res.status(500).json({ error: 'لم يرجع الموديل صورة المخطط. حاول بوصف آخر.' });
        return;
      }
    }

    let photoImageBase64 = null;
    let photoMimeType = null;
    if (photoData) {
      const phParts = (((photoData.candidates || [])[0] || {}).content || {}).parts || [];
      const phPart = phParts.find((p) => p.inlineData && p.inlineData.data);
      if (phPart) {
        photoImageBase64 = phPart.inlineData.data;
        photoMimeType = phPart.inlineData.mimeType || 'image/png';
      }
    }

    let interiorImageBase64 = null;
    let interiorMimeType = null;
    if (interiorData) {
      const iParts = (((interiorData.candidates || [])[0] || {}).content || {}).parts || [];
      const iPart = iParts.find((p) => p.inlineData && p.inlineData.data);
      if (iPart) {
        interiorImageBase64 = iPart.inlineData.data;
        interiorMimeType = iPart.inlineData.mimeType || 'image/png';
      }
    }

    let planText = '';
    try {
      const tParts = (((textData.candidates || [])[0] || {}).content || {}).parts || [];
      planText = tParts.map((p) => p.text || '').join('\n').trim();
    } catch (e) {
      planText = '';
    }
    let boq = null;
    try {
      const bm = planText.match(/<<<BOQ>>>([\s\S]*?)<<<END>>>/);
      if (bm) {
        boq = bm[1].trim().split('\n')
          .map((r) => r.split('|').map((x) => x.trim().replace(/^\*+|\*+$/g, '')))
          .filter((r) => r.length >= 3 && r.join('').replace(/[-|\s]/g, '').length > 0);
        planText = planText.replace(bm[0], '').trim();
        if (boq.length < 2) boq = null;
      }
    } catch (e) { boq = null; }

    const disclaimer = '\n\n⚠️ تصور أولي فقط لأغراض العرض — لا يغني عن مهندس مرخّص أو رخصة بناء رسمية.';

    const remaining = await consumeConstruction(quota.username);

    // Best-effort: save this generated design into the shared library so
    // future users with similar requirements can browse it before generating
    // a brand-new one. Fire-and-forget — never blocks or fails the response.
    if (planImageBase64) {
      saveDesign({
        buildingType,
        floors,
        area,
        style,
        budget,
        annexes: annexList,
        planImageBase64,
        planMimeType,
      }).catch(() => {});
    }

    res.status(200).json({
      imageBase64: planImageBase64,
      mimeType: planMimeType,
      photoImageBase64,
      photoMimeType,
      interiorImageBase64,
      interiorMimeType,
      planText: (planText || '') + disclaimer,
      boq,
      remaining,
      dailyLimit: CONSTRUCTION_DAILY_LIMIT,
    });
  } catch (e) {
    const status = isImageTimeoutError(e) ? 504 : 500;
    res.status(status).json({ error: GENERATION_ERROR });
  }
};
