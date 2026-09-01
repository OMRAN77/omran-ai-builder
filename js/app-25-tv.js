// 📺 تلفزيون عمران — دليل قنوات عالمي بمصادر رسمية فقط (بث يوتيوب الرسمي).
// المبدأ الثابت: لا روابط m3u8 مسرّبة ولا إعادة بث — أي بلاغ حقوق يقتل
// التطبيق من المتاجر. تضمين live_stream يشير دائمًا لبث القناة الجاري،
// فلا روابط تموت ولا صيانة يدوية.
(function(){
  'use strict';

  /* البلدان — الكود ← الاسم والعلم */
  var TV_COUNTRIES = {
    ae: ['الإمارات', 'UAE', '🇦🇪'],
    sa: ['السعودية', 'Saudi Arabia', '🇸🇦'],
    qa: ['قطر', 'Qatar', '🇶🇦'],
    kw: ['الكويت', 'Kuwait', '🇰🇼'],
    bh: ['البحرين', 'Bahrain', '🇧🇭'],
    om: ['عُمان', 'Oman', '🇴🇲'],
    eg: ['مصر', 'Egypt', '🇪🇬'],
    jo: ['الأردن', 'Jordan', '🇯🇴'],
    lb: ['لبنان', 'Lebanon', '🇱🇧'],
    iq: ['العراق', 'Iraq', '🇮🇶'],
    ps: ['فلسطين', 'Palestine', '🇵🇸'],
    ye: ['اليمن', 'Yemen', '🇾🇪'],
    sd: ['السودان', 'Sudan', '🇸🇩'],
    ma: ['المغرب', 'Morocco', '🇲🇦'],
    dz: ['الجزائر', 'Algeria', '🇩🇿'],
    tn: ['تونس', 'Tunisia', '🇹🇳'],
    ly: ['ليبيا', 'Libya', '🇱🇾'],
    tr: ['تركيا', 'Turkey', '🇹🇷'],
    in_: ['الهند', 'India', '🇮🇳'],
    pk: ['باكستان', 'Pakistan', '🇵🇰'],
    bd: ['بنغلاديش', 'Bangladesh', '🇧🇩'],
    ph: ['الفلبين', 'Philippines', '🇵🇭'],
    id_: ['إندونيسيا', 'Indonesia', '🇮🇩'],
    lk: ['سريلانكا', 'Sri Lanka', '🇱🇰'],
    np: ['نيبال', 'Nepal', '🇳🇵'],
    uk: ['بريطانيا', 'UK', '🇬🇧'],
    us: ['أمريكا', 'USA', '🇺🇸'],
    fr: ['فرنسا', 'France', '🇫🇷'],
    de: ['ألمانيا', 'Germany', '🇩🇪'],
    ru: ['روسيا', 'Russia', '🇷🇺'],
    intl: ['عالمية', 'International', '🌍'],
  };

  var TV_CATS = {
    news: ['أخبار', 'News', '📰'],
    sports: ['رياضة', 'Sports', '⚽'],
    general: ['عامة', 'General', '📺'],
    religion: ['دينية', 'Religion', '🕌'],
    kids: ['أطفال', 'Kids', '🧸'],
    biz: ['اقتصاد', 'Business', '📊'],
  };

  /* الدليل: n الاسم · h معرّف قناة يوتيوب الرسمي · c البلد · g القسم.
   * قناة لا يستدلّ السيرفر على بثها تُعلَن «غير متاحة الآن» — لا شاشة سوداء. */
  var TV_CH = [
    // ——— الإمارات
    { n: 'سكاي نيوز عربية', h: 'skynewsarabia', c: 'ae', g: 'news' },
    { n: 'العربية', h: 'AlArabiya', c: 'ae', g: 'news' },
    { n: 'الحدث', h: 'AlHadath', c: 'ae', g: 'news' },
    { n: 'تلفزيون دبي', h: 'dubaitv', c: 'ae', g: 'general' },
    { n: 'قناة الشارقة', h: 'sharjahtv', c: 'ae', g: 'general' },
    { n: 'أبوظبي الرياضية', h: 'ADSportsTV', c: 'ae', g: 'sports' },
    { n: 'دبي الرياضية', h: 'DubaiSportsTV', c: 'ae', g: 'sports' },
    { n: 'الشارقة الرياضية', h: 'sharjahsporttv', c: 'ae', g: 'sports' },
    { n: 'CNBC عربية', h: 'cnbcarabia', c: 'ae', g: 'biz' },
    { n: 'الشرق للأخبار', h: 'asharqnews', c: 'ae', g: 'news' },
    { n: 'الشرق بلومبرغ', h: 'AsharqBusiness', c: 'ae', g: 'biz' },
    // ——— السعودية
    { n: 'الإخبارية', h: 'alekhbariyatv', c: 'sa', g: 'news' },
    { n: 'قناة SSC الرياضية', h: 'ssc_sports', c: 'sa', g: 'sports' },
    { n: 'قناة القرآن الكريم — مكة', h: 'quraantv', c: 'sa', g: 'religion' },
    { n: 'قناة السنة النبوية — المدينة', h: 'sunnahtv', c: 'sa', g: 'religion' },
    { n: 'روتانا خليجية', h: 'RotanaKhalijia', c: 'sa', g: 'general' },
    { n: 'العربية الحدث السعودي', h: 'alarabiya_saudi', c: 'sa', g: 'news' },
    // ——— قطر
    { n: 'الجزيرة', h: 'aljazeera', c: 'qa', g: 'news' },
    { n: 'الجزيرة مباشر', h: 'aljazeeramubasher', c: 'qa', g: 'news' },
    { n: 'الجزيرة الإنجليزية', h: 'AlJazeeraEnglish', c: 'qa', g: 'news' },
    { n: 'قطر التلفزيون', h: 'QatarTelevision', c: 'qa', g: 'general' },
    { n: 'الكأس الرياضية', h: 'AlkassTV', c: 'qa', g: 'sports' },
    // ——— الكويت / البحرين / عُمان
    { n: 'تلفزيون الكويت', h: 'KTVKuwait', c: 'kw', g: 'general' },
    { n: 'تلفزيون البحرين', h: 'BahrainTV', c: 'bh', g: 'general' },
    { n: 'عُمان التلفزيون', h: 'OmanTV', c: 'om', g: 'general' },
    // ——— مصر
    { n: 'القاهرة الإخبارية', h: 'AlQaheraNews', c: 'eg', g: 'news' },
    { n: 'إكسترا نيوز', h: 'ExtraNewsEG', c: 'eg', g: 'news' },
    { n: 'صدى البلد', h: 'baladtv', c: 'eg', g: 'general' },
    { n: 'MBC مصر', h: 'MBCMASR', c: 'eg', g: 'general' },
    { n: 'أون سبورت', h: 'ONTimeSports', c: 'eg', g: 'sports' },
    { n: 'النهار', h: 'AlNaharTV', c: 'eg', g: 'general' },
    { n: 'قناة مدرستنا', h: 'MadrasetnaEG', c: 'eg', g: 'kids' },
    // ——— الأردن / لبنان / العراق / فلسطين
    { n: 'المملكة', h: 'AlMamlakaTV', c: 'jo', g: 'news' },
    { n: 'رؤيا', h: 'RoyaTV', c: 'jo', g: 'general' },
    { n: 'الجديد', h: 'aljadeedonline', c: 'lb', g: 'general' },
    { n: 'MTV لبنان', h: 'mtvlebanon', c: 'lb', g: 'general' },
    { n: 'الشرقية', h: 'alsharqiyatv', c: 'iq', g: 'general' },
    { n: 'العراقية الإخبارية', h: 'IMNchannel', c: 'iq', g: 'news' },
    { n: 'تلفزيون فلسطين', h: 'PalestineTvLive', c: 'ps', g: 'general' },
    // ——— اليمن / السودان / المغرب العربي
    { n: 'بلقيس', h: 'BelqeesTV', c: 'ye', g: 'news' },
    { n: 'سودانية 24', h: 'Sudania24TV', c: 'sd', g: 'general' },
    { n: 'ميدي 1 تيفي', h: 'Medi1TVArabic', c: 'ma', g: 'news' },
    { n: 'الشروق الجزائرية', h: 'echorouktv', c: 'dz', g: 'news' },
    { n: 'النهار الجزائرية', h: 'EnnaharTv', c: 'dz', g: 'news' },
    { n: 'الوطنية التونسية', h: 'WataniaReplay', c: 'tn', g: 'general' },
    { n: 'ليبيا الأحرار', h: 'LibyaAlAhrarTV', c: 'ly', g: 'news' },
    // ——— تركيا
    { n: 'TRT عربي', h: 'TRTArabi', c: 'tr', g: 'news' },
    { n: 'TRT World', h: 'trtworld', c: 'tr', g: 'news' },
    // ——— الهند
    { n: 'India Today', h: 'IndiaToday', c: 'in_', g: 'news' },
    { n: 'NDTV 24x7', h: 'NDTV', c: 'in_', g: 'news' },
    { n: 'Aaj Tak (هندي)', h: 'aajtak', c: 'in_', g: 'news' },
    { n: 'ABP News (هندي)', h: 'ABPNEWS', c: 'in_', g: 'news' },
    { n: 'Zee News (هندي)', h: 'zeenews', c: 'in_', g: 'news' },
    { n: 'WION', h: 'WION', c: 'in_', g: 'news' },
    { n: 'Republic TV', h: 'RepublicWorld', c: 'in_', g: 'news' },
    { n: 'TV9 (تيلوغو)', h: 'tv9telugulive', c: 'in_', g: 'news' },
    { n: 'Asianet News (مالايالام)', h: 'asianetnews', c: 'in_', g: 'news' },
    { n: 'Manorama News (مالايالام)', h: 'manoramanews', c: 'in_', g: 'news' },
    { n: 'Polimer News (تاميل)', h: 'PolimerNews', c: 'in_', g: 'news' },
    { n: 'Star Sports (يوتيوب)', h: 'StarSportsIndia', c: 'in_', g: 'sports' },
    // ——— باكستان
    { n: 'Geo News (أردو)', h: 'GeoNews', c: 'pk', g: 'news' },
    { n: 'ARY News (أردو)', h: 'ARYNEWSTV', c: 'pk', g: 'news' },
    { n: 'Dunya News (أردو)', h: 'DunyaNews', c: 'pk', g: 'news' },
    { n: 'Samaa TV (أردو)', h: 'SamaaTVNews', c: 'pk', g: 'news' },
    { n: 'Express News (أردو)', h: 'ExpressNewsPK', c: 'pk', g: 'news' },
    { n: 'PTV Sports', h: 'PTVSportsOfficial', c: 'pk', g: 'sports' },
    // ——— بنغلاديش
    { n: 'Somoy TV (بنغالي)', h: 'SomoyTV', c: 'bd', g: 'news' },
    { n: 'Jamuna TV (بنغالي)', h: 'JamunaTVbd', c: 'bd', g: 'news' },
    { n: 'Channel 24 (بنغالي)', h: 'Channel24Digital', c: 'bd', g: 'news' },
    { n: 'Ekattor TV (بنغالي)', h: 'EkattorTV', c: 'bd', g: 'news' },
    { n: 'Channel i (بنغالي)', h: 'ChanneliTv', c: 'bd', g: 'general' },
    // ——— الفلبين
    { n: 'GMA News (فلبيني)', h: 'gmanews', c: 'ph', g: 'news' },
    { n: 'ABS-CBN News (فلبيني)', h: 'ABSCBNNews', c: 'ph', g: 'news' },
    { n: 'Rappler', h: 'rappler', c: 'ph', g: 'news' },
    { n: 'PTV Philippines', h: 'PTVPhilippines', c: 'ph', g: 'general' },
    // ——— إندونيسيا / سريلانكا / نيبال
    { n: 'Kompas TV (إندونيسي)', h: 'KompasTVNews', c: 'id_', g: 'news' },
    { n: 'CNN Indonesia', h: 'CNNIndonesiaOfficial', c: 'id_', g: 'news' },
    { n: 'tvOne (إندونيسي)', h: 'tvOneNews', c: 'id_', g: 'news' },
    { n: 'Ada Derana (سنهالي)', h: 'adaderana', c: 'lk', g: 'news' },
    { n: 'Hiru News (سنهالي)', h: 'HiruNews', c: 'lk', g: 'news' },
    { n: 'Kantipur TV (نيبالي)', h: 'KantipurTV', c: 'np', g: 'news' },
    // ——— بريطانيا / أمريكا
    { n: 'Sky News', h: 'SkyNews', c: 'uk', g: 'news' },
    { n: 'BBC News (يوتيوب)', h: 'BBCNews', c: 'uk', g: 'news' },
    { n: 'ABC News Live', h: 'ABCNews', c: 'us', g: 'news' },
    { n: 'NBC News Now', h: 'NBCNews', c: 'us', g: 'news' },
    { n: 'CBS News', h: 'CBSNews', c: 'us', g: 'news' },
    { n: 'Bloomberg TV', h: 'markets', c: 'us', g: 'biz' },
    { n: 'CNBC', h: 'CNBC', c: 'us', g: 'biz' },
    // ——— فرنسا / ألمانيا / روسيا
    { n: 'فرانس 24 عربي', h: 'France24_ar', c: 'fr', g: 'news' },
    { n: 'France 24 English', h: 'FRANCE24English', c: 'fr', g: 'news' },
    { n: 'euronews عربي', h: 'euronewsarabic', c: 'fr', g: 'news' },
    { n: 'DW عربية', h: 'dwarabia', c: 'de', g: 'news' },
    { n: 'DW News', h: 'dwnews', c: 'de', g: 'news' },
    { n: 'RT Arabic', h: 'RTarabic', c: 'ru', g: 'news' },
    // ——— عالمية
    { n: 'الحرة', h: 'alhurra', c: 'intl', g: 'news' },
    { n: 'بي بي سي عربي', h: 'BBCArabic', c: 'intl', g: 'news' },
    { n: 'CGTN Arabic', h: 'cgtnarabic', c: 'intl', g: 'news' },
    { n: 'ناشونال جيوغرافيك أبوظبي', h: 'NatGeoAD', c: 'intl', g: 'general' },
    { n: 'CNA (سنغافورة)', h: 'CNA', c: 'intl', g: 'news' },
    { n: 'Africanews', h: 'africanews', c: 'intl', g: 'news' },
    // ——— توسعة الإمارات (قنوات دبي وأبوظبي — الاحتياط منصتها الرسمية)
    { n: 'سما دبي', h: 'samadubaitv', c: 'ae', g: 'general', u: 'https://awaan.ae/live' },
    { n: 'دبي ريسينغ', h: 'dubairacing', c: 'ae', g: 'sports', u: 'https://awaan.ae/live' },
    { n: 'نور دبي', h: 'noordubaitv', c: 'ae', g: 'general', u: 'https://awaan.ae/live' },
    { n: 'دبي ون (المنصة)', u: 'https://awaan.ae/live', c: 'ae', g: 'general' },
    { n: 'دبي زمان (المنصة)', u: 'https://awaan.ae/live', c: 'ae', g: 'general' },
    { n: 'قناة أبوظبي', h: 'ADtvae', c: 'ae', g: 'general', u: 'https://www.adtv.ae/live' },
    { n: 'الإمارات (المنصة)', u: 'https://www.adtv.ae/live', c: 'ae', g: 'general' },
    { n: 'ماجد للأطفال (المنصة)', u: 'https://www.adtv.ae/live', c: 'ae', g: 'kids' },
    { n: 'الظفرة', h: 'AlDhafraTV', c: 'ae', g: 'general' },
    { n: 'عجمان', h: 'AjmanTV', c: 'ae', g: 'general' },
    // ——— توسعة السعودية
    { n: 'السعودية', h: 'saudiatv', c: 'sa', g: 'general' },
    { n: 'SBC', h: 'sbc_sa', c: 'sa', g: 'general' },
    { n: 'الثقافية السعودية', h: 'saudiactv', c: 'sa', g: 'general' },
    { n: 'العربية Business', h: 'AlArabiyaBusiness', c: 'sa', g: 'biz' },
    // ——— توسعة مصر
    { n: 'MBC مصر (شاهد)', u: 'https://shahid.mbc.net/ar/live', c: 'eg', g: 'general' },
    { n: 'DMC', h: 'dmctveg', c: 'eg', g: 'general' },
    { n: 'الحياة', h: 'AlHayahTV', c: 'eg', g: 'general' },
    { n: 'المحور', h: 'MehwarTv', c: 'eg', g: 'general' },
    { n: 'الحدث اليوم', h: 'AlhadathAlyoumTv', c: 'eg', g: 'news' },
    { n: 'TeN TV', h: 'TeNTVChannel', c: 'eg', g: 'general' },
    // ——— دينية إضافية
    { n: 'هدى TV', h: 'HudaTv', c: 'sa', g: 'religion' },
    { n: 'اقرأ', h: 'iqraatv', c: 'sa', g: 'religion' },
    { n: 'الرسالة', h: 'AlresalahTv', c: 'sa', g: 'religion' },
    // ——— أطفال إضافية
    { n: 'سبيستون', h: 'spacetoon', c: 'intl', g: 'kids' },
    { n: 'طيور الجنة', h: 'toyoraljanahtv', c: 'jo', g: 'kids' },
    { n: 'طيور بيبي', h: 'ToyorBabyChannel', c: 'jo', g: 'kids' },
    // ——— توسعة الهند
    { n: 'Times Now', h: 'TimesNow', c: 'in_', g: 'news' },
    { n: 'CNN News18', h: 'CNNNews18', c: 'in_', g: 'news' },
    { n: 'CNBC TV18', h: 'CNBCTV18', c: 'in_', g: 'biz' },
    { n: 'DD News', h: 'DDNews', c: 'in_', g: 'news' },
    { n: 'DD India', h: 'DDIndia', c: 'in_', g: 'news' },
    { n: 'Sun News (تاميل)', h: 'sunnews', c: 'in_', g: 'news' },
    { n: 'News18 (هندي)', h: 'News18India', c: 'in_', g: 'news' },
    // ——— توسعة باكستان
    { n: 'Hum News (أردو)', h: 'HumNewsPakistan', c: 'pk', g: 'news' },
    { n: 'Bol News (أردو)', h: 'BOLNetworkOfficial', c: 'pk', g: 'news' },
    { n: 'GNN (أردو)', h: 'GNNHDOfficial', c: 'pk', g: 'news' },
    { n: '92 News (أردو)', h: '92NewsHD', c: 'pk', g: 'news' },
    // ——— توسعة بنغلاديش
    { n: 'RTV (بنغالي)', h: 'rtvonline', c: 'bd', g: 'general' },
    { n: 'NTV (بنغالي)', h: 'ntvdigitalbd', c: 'bd', g: 'news' },
    { n: 'DBC News (بنغالي)', h: 'dbcnews', c: 'bd', g: 'news' },
    // ——— توسعة الفلبين / نيبال / سريلانكا
    { n: 'UNTV (فلبيني)', h: 'UNTVNewsRescue', c: 'ph', g: 'news' },
    { n: 'News5 (فلبيني)', h: 'News5Everywhere', c: 'ph', g: 'news' },
    { n: 'Himalaya TV (نيبالي)', h: 'HimalayaTV', c: 'np', g: 'news' },
    { n: 'News24 Nepal (نيبالي)', h: 'News24Nepal', c: 'np', g: 'news' },
    { n: 'News 1st (سنهالي)', h: 'newsfirstsrilanka', c: 'lk', g: 'news' },
    // ——— توسعة تركيا
    { n: 'CNN Türk (تركي)', h: 'cnnturk', c: 'tr', g: 'news' },
    { n: 'Habertürk (تركي)', h: 'haberturktv', c: 'tr', g: 'news' },
    { n: 'A Haber (تركي)', h: 'ahaber', c: 'tr', g: 'news' },
    { n: 'Halk TV (تركي)', h: 'halktvcomtr', c: 'tr', g: 'news' },
    // ——— توسعة أوروبا/أمريكا/أستراليا
    { n: 'GB News', h: 'gbnewsonline', c: 'uk', g: 'news' },
    { n: 'Sky News Australia', h: 'SkyNewsAustralia', c: 'uk', g: 'news' },
    { n: 'ABC News Australia', h: 'abcnewsaustralia', c: 'uk', g: 'news' },
    { n: 'Fox News (مقاطع حية)', h: 'FoxNews', c: 'us', g: 'news' },
    { n: 'BFMTV (فرنسي)', h: 'BFMTV', c: 'fr', g: 'news' },
    { n: 'CNEWS (فرنسي)', h: 'CNEWS', c: 'fr', g: 'news' },
    { n: 'franceinfo (فرنسي)', h: 'franceinfo', c: 'fr', g: 'news' },
    { n: 'WELT (ألماني)', h: 'WELTVideoTV', c: 'de', g: 'news' },
    { n: 'tagesschau24 (ألماني)', h: 'tagesschau', c: 'de', g: 'news' },
    { n: 'Phoenix (ألماني)', h: 'phoenix', c: 'de', g: 'news' },
    // ——— أمريكا اللاتينية (إسباني)
    { n: 'Noticias Caracol (إسباني)', h: 'NoticiasCaracol', c: 'intl', g: 'news' },
    { n: 'Milenio (إسباني)', h: 'MilenioTelevision', c: 'intl', g: 'news' },
    { n: 'DW Español', h: 'dwespanol', c: 'intl', g: 'news' },
  ];

  /* منصات رسمية — تفتح بتطبيقها/موقعها الرسمي بحساب المستخدم نفسه.
   * القيمة: قنوات الاشتراك والقنوات التي لا تبث يوتيوب (دراما MBC، دبي ون...) */
  var TV_PLATFORMS = [
    { n: 'شاهد', d: 'كل قنوات MBC مباشر', u: 'https://shahid.mbc.net/ar/live', i: '🎬' },
    { n: 'عوان', d: 'كل قنوات دبي مباشر', u: 'https://awaan.ae/live', i: '🏙️' },
    { n: 'ADtv', d: 'قنوات أبوظبي وماجد', u: 'https://www.adtv.ae/live', i: '🦅' },
    { n: 'TOD', d: 'beIN باشتراكك', u: 'https://www.tod.tv', i: '⚽' },
    { n: 'روتانا+', d: 'قنوات روتانا', u: 'https://rotanaplus.net', i: '🎵' },
    { n: 'نتفلكس', d: 'باشتراكك', u: 'https://www.netflix.com', i: '🍿' },
    { n: 'OSN+', d: 'باشتراكك', u: 'https://www.osnplus.com', i: '📀' },
    { n: 'ستارزبلاي', d: 'باشتراكك', u: 'https://www.starzplay.com', i: '⭐' },
  ];

  function tvIsAr(){ try{ return (typeof lang === 'undefined' || !lang || lang === 'ar' || lang === 'ur'); }catch(e){ return true; } }
  function tt(ar, en){ return tvIsAr() ? ar : en; }

  var S = { country: 'ae', cat: 'all', q: '' };

  /* v-tv-verified: فاحص GitHub Actions اليومي يكتب tv-status.json —
   * قناة ok:false تُخفى (معرّف خاطئ/محذوف)، وok مع live تأخذ 🔴.
   * غياب الملف = لا فلترة (أول نشر). */
  var TV_STATUS = null;
  function loadStatus(){
    return fetch('/tv-status.json', { cache: 'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ TV_STATUS = (d && d.channels) || null; })
      .catch(function(e){ __swallow(e, 'tv:status'); });
  }
  function stOf(ch){ return (ch.h && TV_STATUS && TV_STATUS[ch.h]) || null; }
  function chVisible(ch){
    if(!ch.h) return true;                 // قناة منصة فقط
    var st = stOf(ch);
    if(!st) return true;                   // لا بيانات فحص بعد
    return st.ok !== false || !!ch.u;      // معرّف ميت بلا احتياط → تُخفى
  }

  /* حل معرّف القناة الرقمي (UC...) — من ملف الفحص اليومي أولًا، ثم السيرفر */
  function resolveChannel(handle){
    var st = TV_STATUS && TV_STATUS[handle];
    if(st && st.ok && st.id) return Promise.resolve(st.id);
    var KEY = 'aiapp_tv_' + handle;
    try{
      var c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if(c && c.id && (Date.now() - c.ts) < 30 * 864e5) return Promise.resolve(c.id);
    }catch(e){ /* guard-ok: كاش تالف — نحل من السيرفر */ }
    return fetch('/api/system?action=tv-resolve&handle=' + encodeURIComponent(handle))
      .then(function(r){ return r.json().then(function(d){ return r.ok ? d : Promise.reject(d); }); })
      .then(function(d){
        if(!d || !d.channelId) throw new Error('no-id');
        try{ localStorage.setItem(KEY, JSON.stringify({ id: d.channelId, ts: Date.now() })); }
        catch(e){ /* guard-ok: تخزين ممتلئ — يُحل كل مرة */ }
        return d.channelId;
      });
  }

  function shell(){
    var el = document.getElementById('omranTvShell');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'omranTvShell';
    el.dir = 'rtl';
    el.style.cssText = 'position:fixed;inset:0;z-index:9500;background:var(--bg,#0a0b10);display:none;flex-direction:column;overflow:hidden;';
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px calc(6px);border-bottom:1px solid var(--border,rgba(255,255,255,.08));">' +
        '<h2 style="margin:0;font-size:17px;flex:1;">📺 ' + tt('تلفزيون', 'TV') + '</h2>' +
        '<button type="button" id="tvClose" aria-label="close" style="background:none;border:1px solid var(--border,rgba(255,255,255,.15));border-radius:50%;width:34px;height:34px;color:inherit;font-size:15px;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div id="tvPlayerWrap" style="display:none;flex-direction:column;flex:1;min-height:0;">' +
        '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;">' +
          '<button type="button" id="tvBack" style="background:none;border:1px solid var(--border,rgba(255,255,255,.15));border-radius:10px;padding:6px 14px;color:inherit;cursor:pointer;">→ ' + tt('رجوع', 'Back') + '</button>' +
          '<span id="tvNowName" style="font-size:14px;font-weight:700;"></span>' +
        '</div>' +
        '<div style="flex:1;min-height:0;background:#000;"><iframe id="tvFrame" style="width:100%;height:100%;border:0;" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>' +
      '</div>' +
      '<div id="tvBrowse" style="display:flex;flex-direction:column;flex:1;min-height:0;">' +
        '<div style="padding:8px 14px 0;"><input id="tvSearch" type="search" placeholder="🔍 ' + tt('ابحث عن قناة...', 'Search channels...') + '" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.12));background:rgba(255,255,255,.04);color:inherit;font-size:14px;"></div>' +
        '<div id="tvCountries" style="display:flex;gap:6px;overflow-x:auto;padding:10px 14px 4px;-webkit-overflow-scrolling:touch;"></div>' +
        '<div id="tvCats" style="display:flex;gap:6px;overflow-x:auto;padding:6px 14px;-webkit-overflow-scrolling:touch;"></div>' +
        '<div id="tvGrid" style="flex:1;min-height:0;overflow-y:auto;padding:8px 14px calc(20px + env(safe-area-inset-bottom,0px));display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start;"></div>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('#tvClose').onclick = closeTv;
    el.querySelector('#tvBack').onclick = stopPlayer;
    el.querySelector('#tvSearch').oninput = function(){ S.q = this.value.trim(); renderGrid(); };
    return el;
  }

  function chipCss(active){
    return 'flex:0 0 auto;border-radius:999px;padding:7px 13px;font-size:13px;cursor:pointer;white-space:nowrap;' +
      (active
        ? 'background:var(--omGold,#d4af37);color:#141414;border:1px solid var(--omGold,#d4af37);font-weight:700;'
        : 'background:rgba(255,255,255,.05);color:inherit;border:1px solid var(--border,rgba(255,255,255,.12));');
  }

  function renderChips(){
    var el = shell();
    var cw = el.querySelector('#tvCountries');
    cw.innerHTML = '';
    Object.keys(TV_COUNTRIES).forEach(function(code){
      if(!TV_CH.some(function(ch){ return ch.c === code; })) return;
      var meta = TV_COUNTRIES[code];
      var b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = chipCss(S.country === code);
      b.textContent = meta[2] + ' ' + tt(meta[0], meta[1]);
      b.onclick = function(){ S.country = code; renderChips(); renderGrid(); };
      cw.appendChild(b);
    });
    var gw = el.querySelector('#tvCats');
    gw.innerHTML = '';
    var allB = document.createElement('button');
    allB.type = 'button';
    allB.style.cssText = chipCss(S.cat === 'all');
    allB.textContent = tt('الكل', 'All');
    allB.onclick = function(){ S.cat = 'all'; renderChips(); renderGrid(); };
    gw.appendChild(allB);
    Object.keys(TV_CATS).forEach(function(g){
      var meta = TV_CATS[g];
      var b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = chipCss(S.cat === g);
      b.textContent = meta[2] + ' ' + tt(meta[0], meta[1]);
      b.onclick = function(){ S.cat = g; renderChips(); renderGrid(); };
      gw.appendChild(b);
    });
  }

  /* فتح رابط خارجي: داخل غلاف أندرويد نغيّر الموقع — معالج الروابط في
   * الغلاف يحوّل المضيف الغريب لتطبيق/متصفح النظام ولا يبحر بصفحتنا؛
   * في المتصفح العادي نافذة جديدة. */
  function openExternal(url){
    var inApp = false;
    try{ inApp = typeof window.omranLikelyApp === 'function' && window.omranLikelyApp(); }
    catch(e){ __swallow(e, 'tv:inapp'); }
    if(inApp){ try{ location.href = url; return; }catch(e){ __swallow(e, 'tv:extapp'); } }
    try{ window.open(url, '_blank', 'noopener'); }catch(e){ __swallow(e, 'tv:extwin'); }
  }

  function renderPlatforms(grid){
    var head = document.createElement('div');
    head.style.cssText = 'grid-column:1/-1;font-size:13px;color:var(--muted,#98a0b3);padding:2px 2px 0;';
    head.textContent = tt('منصات رسمية — تفتح بحسابك', 'Official platforms — opens with your account');
    grid.appendChild(head);
    var row = document.createElement('div');
    row.style.cssText = 'grid-column:1/-1;display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;';
    TV_PLATFORMS.forEach(function(pf){
      var b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = 'flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 14px;border-radius:14px;border:1px solid var(--omGoldSoft,rgba(212,175,55,.35));background:rgba(212,175,55,.06);color:inherit;cursor:pointer;min-width:96px;';
      b.innerHTML = '<span style="font-size:22px;">' + pf.i + '</span><span style="font-size:13px;font-weight:700;">' + pf.n + ' ↗</span><span style="font-size:10.5px;color:var(--muted,#98a0b3);">' + pf.d + '</span>';
      b.onclick = function(){ openExternal(pf.u); };
      row.appendChild(b);
    });
    grid.appendChild(row);
    var sep = document.createElement('div');
    sep.style.cssText = 'grid-column:1/-1;font-size:13px;color:var(--muted,#98a0b3);padding:6px 2px 0;';
    sep.textContent = tt('قنوات مباشرة داخل التطبيق', 'Live channels inside the app');
    grid.appendChild(sep);
  }

  function renderGrid(){
    var el = shell();
    var grid = el.querySelector('#tvGrid');
    grid.innerHTML = '';
    var q = S.q.toLowerCase();
    if(!q && S.cat === 'all') renderPlatforms(grid);
    var list = TV_CH.filter(function(ch){
      if(!chVisible(ch)) return false;
      if(q) return (ch.n + ' ' + (ch.h || '')).toLowerCase().indexOf(q) !== -1; // البحث يتجاوز فلتر البلد
      if(ch.c !== S.country) return false;
      if(S.cat !== 'all' && ch.g !== S.cat) return false;
      return true;
    });
    // الحيّ الآن أولًا
    list.sort(function(a, b){
      var la = stOf(a) && stOf(a).live ? 1 : 0;
      var lb = stOf(b) && stOf(b).live ? 1 : 0;
      return lb - la;
    });
    if(!list.length){
      var empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;color:var(--muted,#98a0b3);padding:24px 0;text-align:center;';
      empty.textContent = tt('لا توجد قنوات مطابقة', 'No matching channels');
      grid.appendChild(empty);
      return;
    }
    list.forEach(function(ch){
      var card = document.createElement('button');
      card.type = 'button';
      card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 8px;border-radius:14px;border:1px solid var(--border,rgba(255,255,255,.1));background:rgba(255,255,255,.03);color:inherit;cursor:pointer;text-align:center;';
      var cat = TV_CATS[ch.g] || TV_CATS.general;
      var st = stOf(ch);
      var badge = (st && st.live)
        ? '<span style="font-size:10px;color:#ff5b5b;font-weight:800;">🔴 ' + tt('مباشر الآن', 'LIVE') + '</span>'
        : (!ch.h ? '<span style="font-size:10px;color:var(--muted,#98a0b3);">↗ ' + tt('المنصة الرسمية', 'Official site') + '</span>' : '');
      card.innerHTML = '<span style="font-size:26px;">' + cat[2] + '</span><span style="font-size:13px;font-weight:600;line-height:1.5;">' + ch.n + '</span>' + badge;
      card.onclick = function(){ playChannel(ch, card); };
      grid.appendChild(card);
    });
  }

  /* v-tv-live: الفحص اللحظي عند الضغطة — تضمين live_stream القديم لا يعمل
   * لأغلب القنوات وبعضها يمنع التضمين. السيرفر يرجع رقم فيديو البث الجاري:
   * مسموح تضمينه → داخل التطبيق؛ ممنوع → تطبيق يوتيوب على البث نفسه. */
  function resolveLive(handle){
    return fetch('/api/system?action=tv-resolve&handle=' + encodeURIComponent(handle) + '&live=1')
      .then(function(r){ return r.json().then(function(d){ return r.ok ? d : Promise.reject(d); }); })
      .catch(function(e){
        // احتياط: بيانات الفحص اليومي
        var st = TV_STATUS && TV_STATUS[handle];
        if(st && st.ok) return { channelId: st.id, isLive: !!st.live, videoId: st.vid || null, embeddable: st.embeddable !== false };
        return Promise.reject(e);
      });
  }

  function playChannel(ch, card){
    // قناة بلا بث يوتيوب أصلًا → منصتها الرسمية مباشرة
    if(!ch.h && ch.u){ openExternal(ch.u); return; }
    var el = shell();
    var old = card.innerHTML;
    card.innerHTML = '<span style="font-size:26px;">⏳</span><span style="font-size:13px;">' + tt('جارٍ الفتح...', 'Opening...') + '</span>';
    resolveLive(ch.h).then(function(info){
      card.innerHTML = old;
      if(info.isLive && info.videoId && info.embeddable !== false){
        el.querySelector('#tvNowName').textContent = ch.n;
        el.querySelector('#tvFrame').src =
          'https://www.youtube.com/embed/' + encodeURIComponent(info.videoId) + '?autoplay=1&hl=' + (tvIsAr() ? 'ar' : 'en');
        el.querySelector('#tvBrowse').style.display = 'none';
        el.querySelector('#tvPlayerWrap').style.display = 'flex';
        return;
      }
      if(info.isLive && info.videoId){
        // القناة تمنع التضمين — البث نفسه في تطبيق يوتيوب
        openExternal('https://www.youtube.com/watch?v=' + info.videoId);
        return;
      }
      // ليست حية الآن → منصتها الرسمية أو صفحة قناتها
      if(ch.u){ openExternal(ch.u); return; }
      if(info.channelId){ openExternal('https://www.youtube.com/channel/' + info.channelId + '/live'); return; }
      card.innerHTML = '<span style="font-size:26px;">😴</span><span style="font-size:12px;">' + tt('القناة موقفة البث حاليًا', 'Not streaming right now') + '</span>';
      setTimeout(function(){ card.innerHTML = old; }, 2600);
    }).catch(function(e){
      __swallow(e, 'tv:resolve');
      if(ch.u){ card.innerHTML = old; openExternal(ch.u); return; }
      card.innerHTML = '<span style="font-size:26px;">😴</span><span style="font-size:12px;">' + tt('القناة موقفة البث حاليًا', 'Not streaming right now') + '</span>';
      setTimeout(function(){ card.innerHTML = old; }, 2600);
    });
  }

  function stopPlayer(){
    var el = shell();
    el.querySelector('#tvFrame').src = 'about:blank';
    el.querySelector('#tvPlayerWrap').style.display = 'none';
    el.querySelector('#tvBrowse').style.display = 'flex';
  }

  function openTv(){
    var el = shell();
    renderChips();
    renderGrid();
    el.style.display = 'flex';
    if(TV_STATUS === null){
      loadStatus().then(function(){ if(el.style.display === 'flex') renderGrid(); });
    }
  }
  function closeTv(){
    stopPlayer();
    var el = document.getElementById('omranTvShell');
    if(el) el.style.display = 'none';
  }

  var btn = document.getElementById('btnOmranTV');
  if(btn) btn.onclick = openTv;
  window.omranTv = { open: openTv, close: closeTv };
})();
