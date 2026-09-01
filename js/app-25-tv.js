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
  ];

  function tvIsAr(){ try{ return (typeof lang === 'undefined' || !lang || lang === 'ar' || lang === 'ur'); }catch(e){ return true; } }
  function tt(ar, en){ return tvIsAr() ? ar : en; }

  var S = { country: 'ae', cat: 'all', q: '' };

  /* حل معرّف القناة الرقمي (UC...) عبر السيرفر — كاش محلي 30 يومًا */
  function resolveChannel(handle){
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

  function renderGrid(){
    var el = shell();
    var grid = el.querySelector('#tvGrid');
    grid.innerHTML = '';
    var q = S.q.toLowerCase();
    var list = TV_CH.filter(function(ch){
      if(q) return (ch.n + ' ' + ch.h).toLowerCase().indexOf(q) !== -1; // البحث يتجاوز فلتر البلد
      if(ch.c !== S.country) return false;
      if(S.cat !== 'all' && ch.g !== S.cat) return false;
      return true;
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
      card.innerHTML = '<span style="font-size:26px;">' + cat[2] + '</span><span style="font-size:13px;font-weight:600;line-height:1.5;">' + ch.n + '</span>';
      card.onclick = function(){ playChannel(ch, card); };
      grid.appendChild(card);
    });
  }

  function playChannel(ch, card){
    var el = shell();
    var old = card.innerHTML;
    card.innerHTML = '<span style="font-size:26px;">⏳</span><span style="font-size:13px;">' + tt('جارٍ الفتح...', 'Opening...') + '</span>';
    resolveChannel(ch.h).then(function(cid){
      card.innerHTML = old;
      el.querySelector('#tvNowName').textContent = ch.n;
      el.querySelector('#tvFrame').src =
        'https://www.youtube.com/embed/live_stream?channel=' + encodeURIComponent(cid) + '&autoplay=1&hl=' + (tvIsAr() ? 'ar' : 'en');
      el.querySelector('#tvBrowse').style.display = 'none';
      el.querySelector('#tvPlayerWrap').style.display = 'flex';
    }).catch(function(e){
      __swallow(e, 'tv:resolve');
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
