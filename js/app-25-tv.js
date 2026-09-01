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
    af: ['أفغانستان', 'Afghanistan', '🇦🇫'],
    am: ['أرمينيا', 'Armenia', '🇦🇲'],
    ar_: ['الأرجنتين', 'Argentina', '🇦🇷'],
    at: ['النمسا', 'Austria', '🇦🇹'],
    au: ['أستراليا', 'Australia', '🇦🇺'],
    az: ['أذربيجان', 'Azerbaijan', '🇦🇿'],
    be: ['بلجيكا', 'Belgium', '🇧🇪'],
    bg: ['بلغاريا', 'Bulgaria', '🇧🇬'],
    bo: ['بوليفيا', 'Bolivia', '🇧🇴'],
    br: ['البرازيل', 'Brazil', '🇧🇷'],
    ca: ['كندا', 'Canada', '🇨🇦'],
    ch: ['سويسرا', 'Switzerland', '🇨🇭'],
    cl: ['تشيلي', 'Chile', '🇨🇱'],
    cm: ['الكاميرون', 'Cameroon', '🇨🇲'],
    cn: ['الصين', 'China', '🇨🇳'],
    co: ['كولومبيا', 'Colombia', '🇨🇴'],
    cz: ['التشيك', 'Czechia', '🇨🇿'],
    dk: ['الدنمارك', 'Denmark', '🇩🇰'],
    do: ['الدومينيكان', 'Dominican Rep.', '🇩🇴'],
    ec: ['الإكوادور', 'Ecuador', '🇪🇨'],
    es: ['إسبانيا', 'Spain', '🇪🇸'],
    et: ['إثيوبيا', 'Ethiopia', '🇪🇹'],
    fi: ['فنلندا', 'Finland', '🇫🇮'],
    ge: ['جورجيا', 'Georgia', '🇬🇪'],
    gh: ['غانا', 'Ghana', '🇬🇭'],
    gr: ['اليونان', 'Greece', '🇬🇷'],
    hk: ['هونغ كونغ', 'Hong Kong', '🇭🇰'],
    hr: ['كرواتيا', 'Croatia', '🇭🇷'],
    hu: ['المجر', 'Hungary', '🇭🇺'],
    ie: ['أيرلندا', 'Ireland', '🇮🇪'],
    il: ['إسرائيل', 'Israel', '🇮🇱'],
    it: ['إيطاليا', 'Italy', '🇮🇹'],
    jp: ['اليابان', 'Japan', '🇯🇵'],
    ke: ['كينيا', 'Kenya', '🇰🇪'],
    kr: ['كوريا الجنوبية', 'South Korea', '🇰🇷'],
    kz: ['كازاخستان', 'Kazakhstan', '🇰🇿'],
    mx: ['المكسيك', 'Mexico', '🇲🇽'],
    my: ['ماليزيا', 'Malaysia', '🇲🇾'],
    ng: ['نيجيريا', 'Nigeria', '🇳🇬'],
    nl: ['هولندا', 'Netherlands', '🇳🇱'],
    no: ['النرويج', 'Norway', '🇳🇴'],
    nz: ['نيوزيلندا', 'New Zealand', '🇳🇿'],
    pl: ['بولندا', 'Poland', '🇵🇱'],
    pt: ['البرتغال', 'Portugal', '🇵🇹'],
    py: ['باراغواي', 'Paraguay', '🇵🇾'],
    ro: ['رومانيا', 'Romania', '🇷🇴'],
    rs: ['صربيا', 'Serbia', '🇷🇸'],
    se: ['السويد', 'Sweden', '🇸🇪'],
    sg: ['سنغافورة', 'Singapore', '🇸🇬'],
    sn: ['السنغال', 'Senegal', '🇸🇳'],
    th: ['تايلاند', 'Thailand', '🇹🇭'],
    tw: ['تايوان', 'Taiwan', '🇹🇼'],
    tz: ['تنزانيا', 'Tanzania', '🇹🇿'],
    ua: ['أوكرانيا', 'Ukraine', '🇺🇦'],
    ug: ['أوغندا', 'Uganda', '🇺🇬'],
    uz: ['أوزبكستان', 'Uzbekistan', '🇺🇿'],
    ve: ['فنزويلا', 'Venezuela', '🇻🇪'],
    vn: ['فيتنام', 'Vietnam', '🇻🇳'],
    za: ['جنوب أفريقيا', 'South Africa', '🇿🇦'],
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
    // ——— السعودية (v659)
    { n: 'Al Arabiya English', h: 'AlArabiyaEnglish', c: 'sa', g: 'news' },
    // ——— قطر (v659)
    { n: 'العربي 2', h: 'alarabytv2', c: 'qa', g: 'news' },
    // ——— الكويت (v659)
    { n: 'Alrai', h: 'AlraiTube', c: 'kw', g: 'general' },
    { n: 'ch4teen', h: 'ch4teenTUB', c: 'kw', g: 'religion' },
    // ——— البحرين (v659)
    { n: 'Bahrain International TV', h: 'BahrainInternational', c: 'bh', g: 'general' },
    // ——— مصر (v659)
    { n: 'Alkofiya Live', h: 'AlkofiyaLive', c: 'eg', g: 'news' },
    { n: 'eXtra news', h: 'eXtranews', c: 'eg', g: 'news' },
    // ——— الأردن (v659)
    { n: 'Amman TV', h: 'AmmanTV', c: 'jo', g: 'general' },
    { n: 'Roya News', h: 'RoyaNews', c: 'jo', g: 'news' },
    // ——— لبنان (v659)
    { n: 'AL Jadeed', h: 'Aljadeedprograms', c: 'lb', g: 'general' },
    // ——— العراق (v659)
    { n: 'Payam TV', h: 'payamtvhd', c: 'iq', g: 'news' },
    { n: 'Shams TV', h: 'Shamsnewstv', c: 'iq', g: 'news' },
    { n: 'قناة دجلة الفضائية', h: 'DijlahTV', c: 'iq', g: 'news' },
    // ——— اليمن (v659)
    { n: 'Al-Sahat TV LIVE', h: 'al-sahattvlive6866', c: 'ye', g: 'religion' },
    // ——— المغرب (v659)
    { n: 'CHADA TV', h: 'chadatv', c: 'ma', g: 'general' },
    { n: 'Medi1TV Afrique', h: 'Medi1TVAfrique', c: 'ma', g: 'news' },
    { n: 'Arryadia TV', h: 'ArryadiaTv', c: 'ma', g: 'sports' },
    // ——— الجزائر (v659)
    { n: 'FAIRS TV', h: 'fairs-tv', c: 'dz', g: 'general' },
    { n: 'EL DJAZAIR N1 TV', h: 'eldjazairn1', c: 'dz', g: 'news' },
    { n: 'Echorouk News', h: 'Echourouk_news', c: 'dz', g: 'news' },
    // ——— تونس (v659)
    { n: 'Attessia TV', h: 'AttessiaTVOfficial', c: 'tn', g: 'general' },
    { n: 'Elhiwar Ettounsi', h: 'EttounsiaReplay', c: 'tn', g: 'general' },
    { n: 'IFM', h: 'RadioIfmTunisia', c: 'tn', g: 'general' },
    // ——— ليبيا (v659)
    { n: 'Libya One TV', h: 'LibyaOneTV', c: 'ly', g: 'general' },
    { n: 'Wasat TV', h: 'WasatTV', c: 'ly', g: 'general' },
    { n: 'قناة التناصح الفضائية', h: 'Al-Tanasuh-channel', c: 'ly', g: 'general' },
    { n: '218TV', h: '218tvNet', c: 'ly', g: 'news' },
    { n: 'تلفزيون المسار', h: 'almasartvlibya', c: 'ly', g: 'news' },
    // ——— تركيا (v659)
    { n: 'NOW', h: 'nowtvturkiye', c: 'tr', g: 'general' },
    { n: 'STAR TV', h: 'StarTVResmi', c: 'tr', g: 'general' },
    { n: '360 LIVE', h: '360LiveAdminTeam', c: 'tr', g: 'news' },
    { n: 'Akit TV', h: 'akittv', c: 'tr', g: 'news' },
    { n: 'DEHA TV', h: 'DEHATVpku', c: 'tr', g: 'news' },
    { n: 'EKOTÜRK TV', h: 'EKOTURKTV', c: 'tr', g: 'news' },
    // ——— الهند (v659)
    { n: 'OTV', h: 'otvodisha', c: 'in_', g: 'general' },
    { n: '99tv Live', h: '99tvlive56', c: 'in_', g: 'news' },
    { n: 'Business Today', h: 'BusinessToday', c: 'in_', g: 'news' },
    { n: 'HMtv LIVE', h: 'kilsy183relatos06', c: 'in_', g: 'news' },
    { n: 'News 24', h: 'News24thinkfirst', c: 'in_', g: 'news' },
    { n: 'News Live', h: 'NewsLiveTVofficial', c: 'in_', g: 'news' },
    { n: 'News Nation', h: 'NewsNationTV', c: 'in_', g: 'news' },
    { n: 'REPORTER LIVE', h: 'reporterlive', c: 'in_', g: 'news' },
    { n: 'Sun News', h: 'Sunnewstamil', c: 'in_', g: 'news' },
    { n: 'dnn live', h: 'dnnlive3851', c: 'in_', g: 'news' },
    { n: 'zoom', h: 'zoomtv', c: 'in_', g: 'news' },
    { n: 'JOY TV - ஜாய் டிவி', h: 'joytvchennai', c: 'in_', g: 'religion' },
    // ——— باكستان (v659)
    { n: 'ABN NEWS', h: 'abnnewspk', c: 'pk', g: 'news' },
    { n: 'ARY News', h: 'ArynewsTvofficial', c: 'pk', g: 'news' },
    { n: 'Aaj News', h: 'aajtvofficial', c: 'pk', g: 'news' },
    { n: 'Aik News', h: 'AikNews_', c: 'pk', g: 'news' },
    { n: 'BOL News', h: 'BOLNewsofficial', c: 'pk', g: 'news' },
    { n: 'GTV NETWORK HD', h: 'GTVNewsHD', c: 'pk', g: 'news' },
    // ——— بنغلاديش (v659)
    { n: 'Rtv Live', h: 'RtvLiveBD', c: 'bd', g: 'general' },
    { n: 'ATN News Live', h: 'ATNNewsLive', c: 'bd', g: 'news' },
    { n: 'Bayanno TV', h: 'BayannoTelevision', c: 'bd', g: 'news' },
    { n: 'Desh TV LIVE', h: 'livedeshtv', c: 'bd', g: 'news' },
    { n: 'Ekattor TV', h: 'EkattorTelevision', c: 'bd', g: 'news' },
    // ——— الفلبين (v659)
    { n: 'DZMM Teleradyo', h: 'DZMMTeleRadyo_MSPC', c: 'ph', g: 'news' },
    { n: 'One PH', h: 'OnePHonCignal', c: 'ph', g: 'news' },
    { n: 'PTV 4', h: 'ptv4377', c: 'ph', g: 'news' },
    { n: 'rng luzon', h: 'rngluzon', c: 'ph', g: 'news' },
    // ——— إندونيسيا (v659)
    { n: 'Nusantara TV', h: 'NusantaraTVOfficial', c: 'id_', g: 'general' },
    { n: 'ANTV Official', h: 'ANTV_Official', c: 'id_', g: 'news' },
    { n: 'BeritaSatu', h: 'BeritaSatuChannel', c: 'id_', g: 'news' },
    { n: 'METRO GLOBE NETWORK', h: 'metroglobenetwork', c: 'id_', g: 'news' },
    { n: 'METRO TV', h: 'metrotvnews', c: 'id_', g: 'news' },
    { n: 'Official iNews', h: 'OfficialiNews', c: 'id_', g: 'news' },
    { n: 'Sin Po tv', h: 'sinpotv', c: 'id_', g: 'news' },
    // ——— سريلانكا (v659)
    { n: 'Siyasa TV', h: 'siyasatv8608', c: 'lk', g: 'general' },
    { n: 'TNL Tv', h: 'tnltvsrilanka', c: 'lk', g: 'general' },
    { n: 'UTV HD', h: 'UTVHDLK', c: 'lk', g: 'general' },
    { n: 'Gaja TV Live', h: 'GajaTVLIVE', c: 'lk', g: 'sports' },
    // ——— نيبال (v659)
    { n: 'Anews Nepal', h: 'anewsnepal', c: 'np', g: 'news' },
    { n: 'Avenues Khabar', h: 'avenueskhabar', c: 'np', g: 'news' },
    { n: 'Bhadagaun TV HD', h: 'bhadagauntelevision2432', c: 'np', g: 'news' },
    { n: 'Galaxy 4K', h: 'Galaxy4K', c: 'np', g: 'news' },
    { n: 'Global TV HD', h: 'GlobalTVHD', c: 'np', g: 'news' },
    { n: 'Mountain TV', h: 'MountainTVOfficial', c: 'np', g: 'news' },
    { n: 'Sutra TV HD', h: 'sutratvhd', c: 'np', g: 'news' },
    { n: 'TV Today HD', h: 'TVTodayHD', c: 'np', g: 'news' },
    // ——— أمريكا (v659)
    { n: 'ALF', h: 'ALFtvOfficial', c: 'us', g: 'general' },
    { n: 'ATV', h: 'ATVofficialchannel', c: 'us', g: 'general' },
    { n: 'DTV', h: 'reddtvbolivia', c: 'us', g: 'general' },
    { n: 'JTV', h: 'JTVjewelry', c: 'us', g: 'general' },
    { n: 'TBS', h: 'TBS', c: 'us', g: 'general' },
    { n: 'Nick Jr.', h: 'nickjr', c: 'us', g: 'kids' },
    { n: 'Nickelodeon', h: 'Nickelodeon', c: 'us', g: 'kids' },
    { n: 'Nicktoons', h: 'Nicktoons', c: 'us', g: 'kids' },
    { n: 'Amu TV', h: 'amutv6211', c: 'us', g: 'news' },
    { n: 'Arirang TV', h: 'KOREAarirangTV', c: 'us', g: 'news' },
    { n: 'CNN', h: 'CNN', c: 'us', g: 'news' },
    { n: 'MS NOW', h: 'msnow', c: 'us', g: 'news' },
    { n: 'Reuters', h: 'Reuters', c: 'us', g: 'news' },
    { n: 'TBN24', h: 'Tbn24usa', c: 'us', g: 'news' },
    { n: 'ሀገሬ ቴሌቪዥን Hagerie TV', h: 'hagerietv', c: 'us', g: 'news' },
    { n: 'Newsmax', h: 'NewsmaxTV', c: 'us', g: 'religion' },
    { n: 'ESPN', h: 'espn', c: 'us', g: 'sports' },
    { n: 'Golf Channel', h: 'GolfChannel', c: 'us', g: 'sports' },
    // ——— فرنسا (v659)
    { n: 'AFP', h: 'AFPfr', c: 'fr', g: 'news' },
    { n: 'Africa 24', h: 'Africa24tv', c: 'fr', g: 'news' },
    { n: 'BFM VAR', h: 'BFMToulonVar', c: 'fr', g: 'news' },
    { n: 'LCI', h: 'LCI', c: 'fr', g: 'news' },
    { n: 'Eurosport', h: 'EurosportFrance', c: 'fr', g: 'sports' },
    // ——— ألمانيا (v659)
    { n: 'Mv1', h: 'TTVMv1', c: 'de', g: 'general' },
    { n: 'Meydan TV', h: 'MeydanTelevision', c: 'de', g: 'news' },
    // ——— روسيا (v659)
    { n: 'Red TV', h: 'redtvlebanon', c: 'ru', g: 'general' },
    { n: 'Oplot', h: 'oplot5736', c: 'ru', g: 'news' },
    // ——— أفغانستان (v659)
    { n: '1tv Live', h: 'GPB1tvLive', c: 'af', g: 'general' },
    { n: 'ASR LIVE TV', h: 'ASRLIVETV', c: 'af', g: 'general' },
    // ——— أرمينيا (v659)
    { n: 'ARMA TV', h: 'ARMATV-38', c: 'am', g: 'general' },
    { n: 'BAC TV', h: 'cbsmediapodicast', c: 'am', g: 'news' },
    // ——— الأرجنتين (v659)
    { n: 'C5N', h: 'c5n', c: 'ar_', g: 'news' },
    { n: 'CINCO TV', h: 'CINCO_TV', c: 'ar_', g: 'news' },
    { n: 'Canal 26', h: 'canal26', c: 'ar_', g: 'news' },
    { n: 'Crónica TV', h: 'cronicatv', c: 'ar_', g: 'news' },
    { n: 'El Destape', h: 'ElDestapeTV', c: 'ar_', g: 'news' },
    { n: 'El Once TV', h: 'ElOnceTvSalta', c: 'ar_', g: 'news' },
    { n: 'Fenix TV', h: 'fenixtelevizija', c: 'ar_', g: 'news' },
    { n: 'FOX Sports', h: 'foxsports', c: 'ar_', g: 'sports' },
    // ——— النمسا (v659)
    { n: 'OE24.TV', h: 'oe24TV', c: 'at', g: 'news' },
    { n: 'K19', h: 'K19at', c: 'at', g: 'sports' },
    // ——— أستراليا (v659)
    { n: 'Live 10HD', h: 'live10hd87', c: 'au', g: 'news' },
    // ——— أذربيجان (v659)
    { n: 'ARB TV', h: 'ARBTVAZ', c: 'az', g: 'general' },
    { n: 'APA TV', h: 'APATVOfficial', c: 'az', g: 'news' },
    { n: 'AnewZ', h: 'AnewZ_TV', c: 'az', g: 'news' },
    { n: 'Baku TV', h: 'bakutv', c: 'az', g: 'news' },
    { n: 'Media Turk TV', h: 'MediaTurkTV', c: 'az', g: 'news' },
    { n: 'Xəzər Xəbər', h: 'KhazarNews', c: 'az', g: 'news' },
    // ——— بلجيكا (v659)
    { n: 'KETNET', h: 'ketnet', c: 'be', g: 'general' },
    { n: 'LN24', h: 'LesNews24', c: 'be', g: 'news' },
    // ——— بلغاريا (v659)
    { n: 'Bulgaria ON AIR', h: 'bulgariaonair', c: 'bg', g: 'news' },
    { n: 'PIK TV', h: 'piktv1281', c: 'bg', g: 'news' },
    // ——— بوليفيا (v659)
    { n: 'ATB', h: 'atb', c: 'bo', g: 'general' },
    { n: 'CTV LIVE', h: 'ctvlive-wi5go', c: 'bo', g: 'general' },
    { n: 'SNTV LIVE', h: 'shreyananiyoutube7036', c: 'bo', g: 'news' },
    { n: 'FTV', h: 'FTVBiH', c: 'bo', g: 'sports' },
    // ——— البرازيل (v659)
    { n: 'SIC TV Channel', h: 'CanalSICTV', c: 'br', g: 'general' },
    { n: 'TV Aratu', h: 'TVAratuOficial', c: 'br', g: 'general' },
    { n: 'BR8 LIVE TV', h: 'br8livetv122', c: 'br', g: 'news' },
    { n: 'MAR TV', h: 'martv2548', c: 'br', g: 'news' },
    { n: 'SBT News', h: 'SBTNews', c: 'br', g: 'news' },
    // ——— كندا (v659)
    { n: 'CBC News', h: 'CBCNews', c: 'ca', g: 'news' },
    { n: 'CP24', h: 'CP24', c: 'ca', g: 'news' },
    { n: 'Global News', h: 'globalnews', c: 'ca', g: 'news' },
    { n: 'LCN LIVE', h: 'lcnlive9386', c: 'ca', g: 'news' },
    { n: 'Miracle Channel Official', h: 'MiracleChannelOfficial', c: 'ca', g: 'news' },
    { n: 'TAG TV', h: 'TAGTVCanadaUSA', c: 'ca', g: 'news' },
    { n: 'TV Punjab', h: 'TvPunjab', c: 'ca', g: 'news' },
    // ——— سويسرا (v659)
    { n: 'Blick', h: 'BlickTube', c: 'ch', g: 'general' },
    { n: 'REGA-TV', h: 'rega-tv-fr', c: 'ch', g: 'general' },
    // ——— تشيلي (v659)
    { n: 'TVN', h: 'TVN_Chile', c: 'cl', g: 'general' },
    { n: 'ADN TV', h: 'ADNPodcastOfficial', c: 'cl', g: 'news' },
    { n: 'CNN Chile', h: 'cnnchile', c: 'cl', g: 'news' },
    { n: 'El Tipógrafo', h: 'diarioeltipografo', c: 'cl', g: 'news' },
    { n: 'Turno', h: 'turnoenvivo', c: 'cl', g: 'news' },
    // ——— الكاميرون (v659)
    { n: 'ABC Amba TV', h: 'ABCAmbaTV', c: 'cm', g: 'news' },
    { n: 'INFOTV', h: 'infotv858', c: 'cm', g: 'news' },
    // ——— الصين (v659)
    { n: 'CGTN', h: 'cgtn', c: 'cn', g: 'news' },
    { n: 'CCTV中国中央电视台', h: 'CCTV', c: 'cn', g: 'sports' },
    // ——— كولومبيا (v659)
    { n: 'CABLENOTICIAS', h: 'cablenoticias', c: 'co', g: 'news' },
    { n: 'EL TIEMPO', h: 'ElTiempo', c: 'co', g: 'news' },
    { n: 'El Gen Caribe', h: 'ElGenCaribe', c: 'co', g: 'news' },
    { n: 'NTN24', h: 'ntn24', c: 'co', g: 'news' },
    { n: 'Noticias RCN', h: 'NoticiasRCN', c: 'co', g: 'news' },
    { n: 'Noticiero 90 Minutos', h: 'Noti90Minutos', c: 'co', g: 'news' },
    { n: 'Tv Norte Noticias', h: 'tvnortenoticias5955', c: 'co', g: 'news' },
    // ——— التشيك (v659)
    { n: 'A11 Live', h: 'a11live7', c: 'cz', g: 'general' },
    { n: 'CMS TV', h: 'cmstv9742', c: 'cz', g: 'general' },
    { n: 'Polar', h: 'polar2', c: 'cz', g: 'general' },
    { n: 'CNN Prima NEWS', h: 'CNNPrimaNEWSCZ', c: 'cz', g: 'news' },
    { n: 'V.O.X. TV', h: 'VOXTVCZ', c: 'cz', g: 'news' },
    { n: 'ČT24', h: 'CT24zive', c: 'cz', g: 'news' },
    // ——— الدنمارك (v659)
    { n: 'TV KANT', h: 'tv-kant', c: 'dk', g: 'general' },
    // ——— الدومينيكان (v659)
    { n: 'El Nuevo Diario TV', h: 'ElNuevoDiariodr', c: 'do', g: 'news' },
    // ——— الإكوادور (v659)
    { n: 'TELESUCESOS HD', h: 'TELESUCESOSHD', c: 'ec', g: 'general' },
    { n: 'CORAPE Digital TV', h: 'CORAPEDigitalTV', c: 'ec', g: 'news' },
    // ——— إسبانيا (v659)
    { n: 'TRECE', h: 'TRECE_es', c: 'es', g: 'general' },
    { n: '101TV MALAGA', h: '101TvMalagaMlg', c: 'es', g: 'news' },
    { n: 'BDN Live', h: 'bdnlive4659', c: 'es', g: 'news' },
    { n: 'Canal Red', h: 'canalredtv', c: 'es', g: 'news' },
    { n: 'Córdoba TV', h: 'cordobatvonline', c: 'es', g: 'news' },
    { n: 'EDA', h: 'EDA2012-', c: 'es', g: 'news' },
    { n: 'EL PAÍS', h: 'elpais', c: 'es', g: 'news' },
    { n: 'Malaga 24h', h: 'Malaga24h', c: 'es', g: 'news' },
    // ——— إثيوبيا (v659)
    { n: 'Bst Live Tv', h: 'BSTLIVETV', c: 'et', g: 'general' },
    { n: 'OBN TV', h: 'obntv654', c: 'et', g: 'news' },
    // ——— فنلندا (v659)
    { n: 'MTV Uutiset', h: 'mtv_uutiset', c: 'fi', g: 'news' },
    { n: 'Posi Tv', h: 'positvfi', c: 'fi', g: 'news' },
    // ——— جورجيا (v659)
    { n: 'Euronews Georgia', h: 'euronewsgeorgia', c: 'ge', g: 'news' },
    { n: 'NWBC Live', h: 'nwbclive6780', c: 'ge', g: 'news' },
    { n: 'TV Georgian Times', h: 'TVGeorgianTimes', c: 'ge', g: 'news' },
    // ——— غانا (v659)
    { n: 'Adom TV', h: 'AdomTVGH', c: 'gh', g: 'general' },
    { n: 'ABC News GH', h: 'abcnewsgh', c: 'gh', g: 'news' },
    { n: 'GBC News', h: 'GBCNewsroom', c: 'gh', g: 'news' },
    // ——— اليونان (v659)
    { n: 'Pronews TV', h: 'pronewstv', c: 'gr', g: 'news' },
    { n: 'TRT Live', h: 'halkuu_mod', c: 'gr', g: 'news' },
    // ——— هونغ كونغ (v659)
    { n: 'TVB NEWS Official 無綫新聞', h: 'tvbnewsofficial', c: 'hk', g: 'news' },
    // ——— كرواتيا (v659)
    { n: 'Kanal Ri', h: 'kanalri7051', c: 'hr', g: 'general' },
    { n: 'NOVA TV', h: 'NOVATVHRV', c: 'hr', g: 'general' },
    { n: 'STV LIVE', h: 'skalatvinfo', c: 'hr', g: 'general' },
    { n: 'Trend TV', h: 'TrendTV_ke', c: 'hr', g: 'general' },
    // ——— المجر (v659)
    { n: 'Hír TV', h: 'HIRTVvideok', c: 'hu', g: 'news' },
    // ——— أيرلندا (v659)
    { n: 'Cúla4', h: 'Cula4', c: 'ie', g: 'kids' },
    { n: 'RTÉ News', h: 'rtenews', c: 'ie', g: 'news' },
    // ——— إسرائيل (v659)
    { n: 'ISRAEL PARS TV', h: 'israelparstv8294', c: 'il', g: 'news' },
    { n: 'TV7 Israel News', h: 'tv7israelnews', c: 'il', g: 'news' },
    { n: 'i24NEWS Arabic', h: 'i24NEWS_AR', c: 'il', g: 'news' },
    { n: 'i24NEWS עברית', h: 'i24NEWS_HE', c: 'il', g: 'news' },
    { n: 'ynet', h: 'ynetofficial', c: 'il', g: 'news' },
    // ——— إيطاليا (v659)
    { n: 'Lira Tv', h: 'LiraTvmadrid', c: 'it', g: 'news' },
    { n: 'TCF TV', h: 'tcftvmessina', c: 'it', g: 'news' },
    { n: 'Tgcom24', h: 'tgcom24', c: 'it', g: 'news' },
    // ——— اليابان (v659)
    { n: 'ABEMAニュース【公式】', h: 'News_ABEMA', c: 'jp', g: 'kids' },
    { n: 'MBS NEWS', h: 'mbsnews', c: 'jp', g: 'news' },
    { n: 'NBC長崎放送', h: 'NBCnagasaki', c: 'jp', g: 'news' },
    // ——— كينيا (v659)
    { n: 'GBS Live', h: 'pawangarg-134', c: 'ke', g: 'general' },
    { n: 'GTN TV', h: 'gtntv254', c: 'ke', g: 'general' },
    { n: 'K24 LIVE', h: 'k24live25', c: 'ke', g: 'general' },
    { n: 'KASS TV LIVE', h: 'kasstvlive', c: 'ke', g: 'general' },
    { n: 'MERU TV', h: 'merutv6412', c: 'ke', g: 'general' },
    { n: 'RIRI TV OFFICIAL', h: 'riritvofficial4486', c: 'ke', g: 'general' },
    // ——— كوريا الجنوبية (v659)
    { n: 'ENA 이엔에이', h: 'channel_ena', c: 'kr', g: 'general' },
    { n: 'KTV 국민방송', h: 'KTV_korea', c: 'kr', g: 'general' },
    { n: 'KFN', h: 'kfnmaniagoon', c: 'kr', g: 'news' },
    { n: 'SBS 뉴스', h: 'sbsnews8', c: 'kr', g: 'news' },
    { n: 'YTN', h: 'ytnnews24', c: 'kr', g: 'news' },
    // ——— كازاخستان (v659)
    { n: 'KTK TV', h: 'KTKTVchannel', c: 'kz', g: 'general' },
    { n: 'Khabar & LIVE', h: 'khabarandlive', c: 'kz', g: 'general' },
    // ——— المكسيك (v659)
    { n: 'NMás', h: 'nmas', c: 'mx', g: 'news' },
    { n: 'Vibe Tv LIVE', h: 'vibetvlive4677', c: 'mx', g: 'news' },
    // ——— ماليزيا (v659)
    { n: 'TVS', h: 'tvsarawak122', c: 'my', g: 'general' },
    { n: 'Astro Ceria', h: 'astroceria', c: 'my', g: 'kids' },
    { n: 'Astro 本地圈', h: 'astrobdq', c: 'my', g: 'kids' },
    { n: 'Astro AWANI', h: 'astroawani', c: 'my', g: 'news' },
    { n: 'Berita RTM', h: 'BeritaRTMBES', c: 'my', g: 'news' },
    // ——— نيجيريا (v659)
    { n: 'TVC', h: 'TVCEntertainment', c: 'ng', g: 'general' },
    { n: 'ABN TV', h: 'abnonlinetv', c: 'ng', g: 'news' },
    { n: 'Ait Lagos', h: 'AitLagos', c: 'ng', g: 'news' },
    { n: 'NTA Live', h: 'NTALive', c: 'ng', g: 'news' },
    // ——— هولندا (v659)
    { n: 'AT5', h: 'AT5', c: 'nl', g: 'general' },
    { n: 'RTL Z', h: 'RTLZNieuws', c: 'nl', g: 'news' },
    // ——— النرويج (v659)
    { n: 'TVModum', h: 'tvmodum2307', c: 'no', g: 'general' },
    { n: 'NRK Super', h: 'nrksuper', c: 'no', g: 'kids' },
    { n: 'V Sport Live', h: 'VSportLive-y4z', c: 'no', g: 'sports' },
    // ——— نيوزيلندا (v659)
    { n: 'FACE HD TV', h: 'FACEHDTV', c: 'nz', g: 'general' },
    { n: 'RNZ', h: 'rnznewzealand', c: 'nz', g: 'news' },
    // ——— بولندا (v659)
    { n: 'Super Express', h: 'SuperExpressOfficial', c: 'pl', g: 'news' },
    { n: 'TVP WORLD', h: 'TVPWorld', c: 'pl', g: 'news' },
    { n: 'TVP Wilno', h: 'TVP-Wilno', c: 'pl', g: 'news' },
    { n: 'tvn24', h: 'TVN24', c: 'pl', g: 'news' },
    // ——— البرتغال (v659)
    { n: 'tvi live', h: 'tvilive4383', c: 'pt', g: 'general' },
    { n: 'A BOLA', h: 'ABOLA_PT', c: 'pt', g: 'sports' },
    { n: 'FUEL TV', h: 'fueltv5902', c: 'pt', g: 'sports' },
    // ——— باراغواي (v659)
    { n: 'ABC TV Paraguay', h: 'ABCParaguay', c: 'py', g: 'news' },
    { n: 'NPY', h: 'NPYTV', c: 'py', g: 'news' },
    { n: 'Oviedo Press', h: 'OviedoPress', c: 'py', g: 'news' },
    { n: 'Ñanduti', h: 'nanduti1020', c: 'py', g: 'news' },
    // ——— رومانيا (v659)
    { n: 'Romania TV', h: 'RomaniaTVOFICIAL', c: 'ro', g: 'general' },
    { n: 'TVR', h: 'TVRcanaluloficial', c: 'ro', g: 'general' },
    { n: 'a7tv', h: 'a7tvlive', c: 'ro', g: 'general' },
    { n: 'Aleph News', h: 'AlephNewsOfficial', c: 'ro', g: 'news' },
    { n: 'Antena 3 CNN', h: 'Antena3CNN', c: 'ro', g: 'news' },
    { n: 'Euronews Romania', h: 'euronewsro', c: 'ro', g: 'news' },
    { n: 'Observator News', h: 'ObservatorTV', c: 'ro', g: 'news' },
    // ——— صربيا (v659)
    { n: 'HYPE TV', h: 'hypetvrs', c: 'rs', g: 'general' },
    { n: 'Hype .2', h: 'hype.2118', c: 'rs', g: 'general' },
    { n: 'Dexy TV', h: 'dexytv8278', c: 'rs', g: 'kids' },
    { n: 'Informer', h: 'InformerTelevizija', c: 'rs', g: 'news' },
    { n: 'Kurir', h: 'kurir', c: 'rs', g: 'news' },
    // ——— السويد (v659)
    { n: 'TV4', h: 'tv4', c: 'se', g: 'general' },
    { n: 'Aftonbladet', h: 'aftonbladettv', c: 'se', g: 'news' },
    { n: 'Expressen', h: 'Expressen', c: 'se', g: 'news' },
    // ——— سنغافورة (v659)
    { n: 'CNA', h: 'channelnewsasia', c: 'sg', g: 'news' },
    // ——— السنغال (v659)
    { n: '313 DIGITAL', h: '313DigitalTV', c: 'sn', g: 'news' },
    { n: 'Bantamba TV', h: 'BantambaTV', c: 'sn', g: 'news' },
    { n: 'Prestige Thies', h: 'prestigethies', c: 'sn', g: 'news' },
    { n: 'PublicSn TV', h: 'PublicSNTv', c: 'sn', g: 'news' },
    { n: 'Sunugal 24', h: 'Sunugal24TV', c: 'sn', g: 'news' },
    // ——— تايلاند (v659)
    { n: 'mcu tv live', h: 'mcutvlive1678', c: 'th', g: 'general' },
    { n: 'ช่อง one31', h: 'one31official', c: 'th', g: 'general' },
    { n: 'News1', h: 'NEWS1VDO', c: 'th', g: 'news' },
    { n: 'TOP NEWS LIVE', h: 'TOPNEWSLIVE77', c: 'th', g: 'news' },
    // ——— تايوان (v659)
    { n: 'TVBS NEWS', h: 'TVBSNEWS01', c: 'tw', g: 'news' },
    { n: 'udn live', h: 'udnlive4563', c: 'tw', g: 'news' },
    { n: '台視新聞 TTV NEWS', h: 'TTV_NEWS', c: 'tw', g: 'news' },
    // ——— تنزانيا (v659)
    { n: 'Dodoma Tv', h: 'dodomatv', c: 'tz', g: 'general' },
    // ——— أوكرانيا (v659)
    { n: 'FREEДOM. LIVE', h: 'FREEDOM_LIVE', c: 'ua', g: 'news' },
    { n: 'TSN', h: 'TSN_Sports', c: 'ua', g: 'news' },
    // ——— أوغندا (v659)
    { n: 'ACW UG TV LIVE', h: 'ACWUGTV-live', c: 'ug', g: 'general' },
    { n: 'BBS TV', h: 'bbstv5261', c: 'ug', g: 'general' },
    { n: 'BTM LIVE', h: 'BTMlive2023', c: 'ug', g: 'general' },
    { n: 'KBS TV', h: 'KBSTV.COLOMBO', c: 'ug', g: 'general' },
    // ——— أوزبكستان (v659)
    { n: '8TV 八度空间', h: '8TVAddicts', c: 'uz', g: 'general' },
    { n: 'Mimi TV', h: 'MimiTV-11', c: 'uz', g: 'kids' },
    // ——— فنزويلا (v659)
    { n: 'IVC live', h: 'ivclive2669', c: 've', g: 'general' },
    { n: 'TRP Live', h: 'Trplivesanchore', c: 've', g: 'general' },
    // ——— فيتنام (v659)
    { n: 'HTV3', h: 'HCMC-HTV3', c: 'vn', g: 'general' },
    { n: 'VTV6', h: 'vtv6589', c: 'vn', g: 'sports' },
    // ——— جنوب أفريقيا (v659)
    { n: 'Kiddiwinks', h: 'KiddiwinksSA', c: 'za', g: 'kids' },
    { n: 'BRICS AFRICA CHANNEL', h: 'tvbricsafrica', c: 'za', g: 'news' },
    { n: 'Kruiskyk', h: 'Kruiskyk', c: 'za', g: 'news' },
    { n: 'Newzroom Afrika', h: 'newzroomafrika405', c: 'za', g: 'news' },
    { n: 'SABC News', h: 'sabcdigitalnews', c: 'za', g: 'news' },
    { n: 'eNews Channel Africa', h: 'eNCALabs', c: 'za', g: 'news' },
    { n: 'Gallop TV', h: 'GallopTVza', c: 'za', g: 'sports' },
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
  var TV_CHECKED_AT = 0;                 // v659: زمن آخر فحص يومي
  function loadStatus(){
    return fetch('/tv-status.json', { cache: 'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        TV_STATUS = (d && d.channels) || null;
        TV_CHECKED_AT = (d && d.checkedAt) ? (Date.parse(d.checkedAt) || 0) : 0;
      })
      .catch(function(e){ __swallow(e, 'tv:status'); });
  }
  function stOf(ch){ return (ch.h && TV_STATUS && TV_STATUS[ch.h]) || null; }

  /* v659: رقم البثّ من الفحص اليومي — احتياط حين يصمت السيرفر. يُستعمل فقط
   * إن كان الفحص طازجًا (٣٦ ساعة) والتضمين مسموحًا، وإلّا نرجع للسلوك القديم. */
  function statusLive(handle){
    if(!handle || !TV_CHECKED_AT) return null;
    if((Date.now() - TV_CHECKED_AT) > 36 * 36e5) return null;
    var st = TV_STATUS && TV_STATUS[handle];
    if(st && st.ok && st.live && st.vid && st.embeddable !== false){
      return { channelId: st.id || null, isLive: true, videoId: st.vid, embeddable: true };
    }
    return null;
  }
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
          '<button type="button" id="tvExt" style="display:none;margin-inline-start:auto;background:none;border:1px solid var(--border,rgba(255,255,255,.15));border-radius:10px;padding:6px 12px;color:inherit;cursor:pointer;font-size:12px;">↗ ' + tt('يوتيوب', 'YouTube') + '</button>' +
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
    el.querySelector('#tvExt').onclick = function(){ if(S.nowUrl) openExternal(S.nowUrl); };
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

  /* v659: تشغيل داخل التطبيق — نقطة واحدة يستعملها المسار العادي والاحتياطي */
  function playEmbed(ch, info){
    var el = shell();
    el.querySelector('#tvNowName').textContent = ch.n;
    el.querySelector('#tvFrame').src =
      'https://www.youtube.com/embed/' + encodeURIComponent(info.videoId) + '?autoplay=1&hl=' + (tvIsAr() ? 'ar' : 'en');
    S.nowUrl = 'https://www.youtube.com/watch?v=' + info.videoId;
    var xb = el.querySelector('#tvExt'); if(xb) xb.style.display = '';
    el.querySelector('#tvBrowse').style.display = 'none';
    el.querySelector('#tvPlayerWrap').style.display = 'flex';
  }

  function playChannel(ch, card){
    // قناة بلا بث يوتيوب أصلًا → منصتها الرسمية مباشرة
    if(!ch.h && ch.u){ openExternal(ch.u); return; }
    var el = shell();
    var old = card.innerHTML;
    card.innerHTML = '<span style="font-size:26px;">⏳</span><span style="font-size:13px;">' + tt('جارٍ الفتح...', 'Opening...') + '</span>';
    resolveLive(ch.h).then(function(info){
      card.innerHTML = old;
      // v659: ردّ بلا رقم بثّ (كاش المعرّف أو حجب يوتيوب للسيرفر) لا يعني صمت
      // القناة — الفحص اليومي يحمل الرقم، فنشغّل داخل التطبيق بدل القذف خارجه.
      if(!info || !info.isLive || !info.videoId){
        var alt = statusLive(ch.h);
        if(alt) info = alt;
      }
      if(info.isLive && info.videoId && info.embeddable !== false){ playEmbed(ch, info); return; }
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
      var altc = statusLive(ch.h);
      if(altc){ card.innerHTML = old; playEmbed(ch, altc); return; }
      if(ch.u){ card.innerHTML = old; openExternal(ch.u); return; }
      card.innerHTML = '<span style="font-size:26px;">😴</span><span style="font-size:12px;">' + tt('القناة موقفة البث حاليًا', 'Not streaming right now') + '</span>';
      setTimeout(function(){ card.innerHTML = old; }, 2600);
    });
  }

  function stopPlayer(){
    var el = shell();
    S.nowUrl = '';
    var xb = el.querySelector('#tvExt'); if(xb) xb.style.display = 'none';
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
