/* v424: أساس الاحتياط للّغات. سبعة ملفّات لغة ناقصة (٣٠ مفتاحًا من ٧٩٦) كانت
   تُظهر العربية لمن لا يقرأها. الإنجليزية أساسٌ أصدق، ولغة الملفّ تبقى فوقه.
   العربية والإنجليزية تُعادان كما هما — لا دمج ولا كلفة على الجمهور الأوّل. */
var __i18nDictCache = {};
window.__i18nDict = function(lg){
  var own = I18N[lg];
  if(lg === 'ar' || lg === 'en') return own || I18N.en || I18N.ar || {};
  var base = I18N.en || I18N.ar || {};
  if(!own) return base;
  var c = __i18nDictCache[lg];
  if(c && c.src === own) return c.dict;
  var merged = Object.assign({}, base, own);
  __i18nDictCache[lg] = { src: own, dict: merged };
  return merged;
};
const I18N_LAZY = ['fr','hi','ur','bn','ne','id','fil','tr','zh','ru','es','ml'];
const I18N_LOADING = {};
function loadLangFile(lg){
  return new Promise(function(res){
    if(I18N[lg] || I18N_LAZY.indexOf(lg) < 0) return res();
    if(I18N_LOADING[lg]){ I18N_LOADING[lg].push(res); return; }
    I18N_LOADING[lg] = [res];
    var sc = document.createElement('script');
    sc.src = 'i18n/' + lg + '.js?v=611'; /* v602: استكمال الـ44 مفتاحًا الناقصة */
    sc.onload = sc.onerror = function(){
      (I18N_LOADING[lg]||[]).forEach(function(f){ try{ f(); }catch(_){ __swallow(_, "misc:app-04-i18n-state#1"); }});
      delete I18N_LOADING[lg];
    };
    document.head.appendChild(sc);
  });
}

let lang = localStorage.getItem('aiapp_lang') || (function(){
  // 🌍 كشف لغة الهاتف تلقائيًا عند أول زيارة — الاختيار اليدوي المحفوظ له الأولوية دائمًا
  try {
    const navs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']).map(x => String(x).toLowerCase());
    const map = { ar:'ar', en:'en', fr:'fr', hi:'hi', ur:'ur', bn:'bn', ne:'ne', id:'id', 'in':'id', fil:'fil', tl:'fil', tr:'tr', zh:'zh', ru:'ru', es:'es', ml:'ml' };
    for(const nav of navs){
      for(const p in map){ if(nav === p || nav.startsWith(p + '-')) return map[p]; }
    }
  } catch(e){ __swallow(e, "misc:app-04-i18n-state#2"); }
  return 'en';
})();
// Language-specific shareable links: /ar, /en, /fr, /hi, /ur, /bn, /ne
// Opening one of these paths forces that language immediately (no need to
// open settings and switch manually) — meant for sending direct links to
// people who speak a specific language.
(function(){
  try {
    const urlLangMatch = location.pathname.match(/^\/(ar|en|fr|hi|ur|bn|ne|id|fil|tr|zh|ru|es|ml)\/?$/i);
    if(urlLangMatch){
      lang = urlLangMatch[1].toLowerCase();
      localStorage.setItem('aiapp_lang', lang);
    }
  } catch(e){ __swallow(e, "save:app-04-i18n-state#3"); }
})();

function mahaPersonaName(){
  var male = false;
  try { male = localStorage.getItem('aiapp_voice_gender') === 'male'; } catch(e) { /* guard-ok: unavailable storage falls back to the default persona. */ }
  var isAr = false;
  try { isAr = (typeof lang !== 'undefined' && lang === 'ar'); } catch(e) { /* guard-ok: unavailable language state falls back to English. */ }
  if (male) return isAr ? 'عبدالله' : 'Abdullah';
  return isAr ? 'مها' : 'Maha';
}
function __voiceFill(v){
  if (typeof v !== 'string' || v.indexOf('{voice') === -1) return v;
  var male = false;
  try { male = localStorage.getItem('aiapp_voice_gender') === 'male'; } catch(e) { /* guard-ok: unavailable storage keeps the default voice label. */ }
  return v.split('{voiceAdj}').join(male ? 'الصوتي' : 'الصوتية')
          .split('{voice}').join(mahaPersonaName());
}
function t(key){
  var v = tRaw(key);
  if (typeof v === 'string' && v.indexOf('{voice') !== -1) {
    var male = false;
    try { male = localStorage.getItem('aiapp_voice_gender') === 'male'; } catch(e) { /* guard-ok: unavailable storage keeps the default translation. */ }
    return v.split('{voiceAdj}').join(male ? 'الصوتي' : 'الصوتية')
            .split('{voice}').join(mahaPersonaName());
  }
  return v;
}
function tRaw(key){
  const v = I18N[lang] ? I18N[lang][key] : undefined;
  if (v !== undefined) return v;
  // v424: الإنجليزية قبل العربية — الناقص كان يخرج عربيًّا في واجهة صينية
  const vEn = I18N.en ? I18N.en[key] : undefined;
  if (vEn !== undefined) return vEn;
  const fb = I18N.ar ? I18N.ar[key] : undefined;
  return fb !== undefined ? fb : key;
}

/* قفل t: عالميّ و writable — كودٌ خارجيّ (إضافة متصفّح، سطر مُحقَّن) يكتب t = شيء
 * فيُسقط كلّ ترجمة بعده؛ استُنسخ حيًّا (عمود ٢٩ في renderCodeAndPreview).
 * القفل يحوّل الاختطاف إلى لا-عمليّة صامتة بلا كسر أيّ قراءة. */
try{ Object.defineProperty(window, "t", { writable: false }); }catch(_){ __swallow(_, "lock:app-04-t"); }

function applyLanguage(){
  if(!I18N[lang] && I18N_LAZY.indexOf(lang) >= 0){
    loadLangFile(lang).then(function(){ if(I18N[lang]) { applyLanguage(); try{ renderAll(); }catch(_){ __swallow(_, "misc:app-04-i18n-state#4"); } } });
  }
  const dict = window.__i18nDict ? window.__i18nDict(lang) : (I18N[lang] || I18N.en || I18N.ar);
  try{ if(window.__syncBrandTitle) window.__syncBrandTitle(); }catch(_){ __swallow(_, "misc:app-04-i18n-state#5"); }
  try{ if(window.__tickerRelabel) window.__tickerRelabel(); }catch(_){ __swallow(_, "misc:app-04-i18n-state#tick"); }
  /* v655 — أسماء أزرار المزوّدين تتبع اللغة (تُستدعى ثانيةً بعد وصول ملفّ
     اللغة الكسول عبر applyLanguage نفسها). */
  try{ if(typeof relabelProviders === 'function') relabelProviders(); }catch(_){ __swallow(_, "misc:app-04-i18n-state#prov"); }
  document.documentElement.lang = lang;
  /* v652 — الأردو كانت تنقلب ltr لحظة ثمّ ترجع rtl (الشعار يقفز عرض الشاشة):
     ملفّات اللغات الكسولة بلا مفتاح dir، فحتّى وصول ur.js يأتي القاموس
     الاحتياطيّ الإنجليزيّ ومعه ltr. الاتّجاه صفة لغة لا صفة قاموس. */
  document.documentElement.dir = (lang === 'ar' || lang === 'ur') ? 'rtl' : (dict.dir || 'ltr');
  if (dict.pageTitle && dict.pageTitle.trim()) document.title = dict.pageTitle;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const raw = el.getAttribute('data-i18n');
    const m = raw.match(/^\[(.+)\]([\s\S]+)$/);
    if(m){
      const attrName = m[1];
      const key = m[2];
      if(dict[key] !== undefined) el.setAttribute(attrName, dict[key]);
    } else if(dict[raw] !== undefined){
      el.innerHTML = __voiceFill(dict[raw]);
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = dict[el.getAttribute('data-i18n-placeholder')];
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if(dict[key] !== undefined) el.setAttribute('title', dict[key]);
  });
  // v212: refresh settings nav list + open page title on language switch
  try{
    if(typeof renderSettingsNavList === 'function') renderSettingsNavList();
    const act = document.querySelector('.settingsPageSection.settingsPageActive');
    if(act && typeof stripUiEmoji === 'function'){
      const h3 = act.querySelector('.settingsSectionHeader h3');
      const t = document.getElementById('settingsPageTitle');
      if(h3 && t) t.textContent = stripUiEmoji(h3.textContent);
    }
  }catch(_){ __swallow(_, "misc:app-04-i18n-state#6"); }
  document.querySelectorAll('.langFlagBtn').forEach(b => b.classList.remove('active'));
  const idMap = {
    ar: ['btnLangAr','btnAuthLangAr'],
    en: ['btnLangEn','btnAuthLangEn'],
    fr: ['btnLangFr','btnAuthLangFr'],
    hi: ['btnLangHi','btnAuthLangHi'],
    ur: ['btnLangUr','btnAuthLangUr'],
    bn: ['btnLangBn','btnAuthLangBn'],
    ne: ['btnLangNe','btnAuthLangNe'],
    id: ['btnLangId'],
    fil: ['btnLangFil'],
    tr: ['btnLangTr'],
    zh: ['btnLangZh'],
    ru: ['btnLangRu'],
    es: ['btnLangEs'],
    ml: ['btnLangMl'],
  };
  const activeIds = idMap[lang] || idMap.ar;
  activeIds.forEach(id => { const el = $('#'+id); if(el) el.classList.add('active'); });
  localStorage.setItem('aiapp_lang', lang);
  renderQuickChips();
  renderOmranBotChips();
  try{ if(window.__refreshProjMenuLabels) window.__refreshProjMenuLabels(); }catch(_){ __swallow(_, "save:app-04-i18n-state#7"); }
  /* v-boot-l10n: ستار الإقلاع (index.html) يُرفع فقط بعد تطبيق قاموس اللغة
     الحقيقي — قبل ذلك كانت الصفحة تظهر عربية كاملة ثم تنقلب أمام المستخدم. */
  try{ if(lang === 'ar' || lang === 'en' || I18N[lang]) document.documentElement.classList.remove('l10nPending'); }catch(_){ __swallow(_, "misc:app-04-l10nveil"); }
}

const QUICK_SUGGESTIONS = [
  {icon:'🎮', ar:'صمم لي لعبة', en:'Design a game', fr:'Créer un jeu', hi:'गेम डिज़ाइन करें', ur:'گیم بنائیں', bn:'গেম ডিজাইন', ne:'गेम डिजाइन', ml:"ഗെയിം ഡിസൈൻ", fil:"Gumawa ng Laro", id:"Desain Game", zh:"设计游戏", ru:"Создать игру", tr:"Oyun Tasarla", es:"Diseñar un juego", prompt:{ar:'صمم لي لعبة بسيطة وممتعة', en:'Design a simple, fun game', fr:'Crée-moi un jeu simple et amusant', hi:'मेरे लिए एक सरल और मज़ेदार गेम बनाएं', ur:'میرے لیے ایک آسان اور دلچسپ گیم بنائیں', bn:'আমার জন্য একটি সহজ এবং মজার গেম তৈরি করুন', ne:'मेरो लागि एक सरल र रमाइलो गेम बनाउनुहोस्'}},
  {icon:'🍽️', ar:'موقع مطعم', en:'Restaurant site', fr:'Site de restaurant', hi:'रेस्टोरेंट साइट', ur:'ریسٹورنٹ سائٹ', bn:'রেস্তোরাঁ সাইট', ne:'रेस्टुरेन्ट साइट', ml:"റെസ്റ്റോറന്റ് സൈറ്റ്", fil:"Website ng Restaurant", id:"Situs Restoran", zh:"餐厅网站", ru:"Сайт ресторана", tr:"Restoran Sitesi", es:"Sitio de restaurante", prompt:{ar:'أنشئ لي موقع لمطعم يعرض القائمة والحجوزات', en:'Build a restaurant website with a menu and reservations', fr:'Crée-moi un site de restaurant avec menu et réservations', hi:'मेरे लिए मेन्यू और आरक्षण वाली रेस्टोरेंट वेबसाइट बनाएं', ur:'میرے لیے مینو اور ریزرویشن والی ریسٹورنٹ ویب سائٹ بنائیں', bn:'আমার জন্য মেনু এবং রিজার্ভেশন সহ একটি রেস্তোরাঁ ওয়েবসাইট তৈরি করুন', ne:'मेरो लागि मेनु र आरक्षण भएको रेस्टुरेन्ट वेबसाइट बनाउनुहोस्'}},
  {icon:'💼', ar:'بورتفوليو', en:'Portfolio', fr:'Portfolio', hi:'पोर्टफोलियो', ur:'پورٹ فولیو', bn:'পোর্টফোলিও', ne:'पोर्टफोलियो', ml:"പോർട്ട്ഫോളിയോ", fil:"Portfolio", id:"Portofolio", zh:"作品集", ru:"Портфолио", tr:"Portfolyo", es:"Portafolio", prompt:{ar:'أنشئ لي صفحة بورتفوليو شخصي احترافية', en:'Build a professional personal portfolio page', fr:'Crée-moi une page de portfolio personnel professionnel', hi:'मेरे लिए एक पेशेवर पर्सनल पोर्टफोलियो पेज बनाएं', ur:'میرے لیے ایک پیشہ ورانہ ذاتی پورٹ فولیو صفحہ بنائیں', bn:'আমার জন্য একটি পেশাদার ব্যক্তিগত পোর্টফোলিও পেজ তৈরি করুন', ne:'मेरो लागि एक व्यावसायिक व्यक्तिगत पोर्टफोलियो पेज बनाउनुहोस्'}},
  {icon:'✅', ar:'تطبيق مهام', en:'Task app', fr:'App de tâches', hi:'टास्क ऐप', ur:'ٹاسک ایپ', bn:'টাস্ক অ্যাপ', ne:'टास्क एप', ml:"ടാസ്ക് ആപ്പ്", fil:"App ng Gawain", id:"Aplikasi Tugas", zh:"任务应用", ru:"Приложение задач", tr:"Görev Uygulaması", es:"App de tareas", prompt:{ar:'أنشئ لي تطبيق قائمة مهام يومية', en:'Build a daily to-do list app', fr:'Crée-moi une application de liste de tâches quotidiennes', hi:'मेरे लिए एक दैनिक टू-डू लिस्ट ऐप बनाएं', ur:'میرے لیے روزانہ ٹو ڈو لسٹ ایپ بنائیں', bn:'আমার জন্য একটি দৈনিক টু-ডু লিস্ট অ্যাপ তৈরি করুন', ne:'मेरो लागि दैनिक टु-डु लिस्ट एप बनाउनुहोस्'}},
  {icon:'🧮', ar:'آلة حاسبة', en:'Calculator', fr:'Calculatrice', hi:'कैलकुलेटर', ur:'کیلکولیٹر', bn:'ক্যালকুলেটর', ne:'क्यालकुलेटर', ml:"കാൽക്കുലേറ്റർ", fil:"Calculator", id:"Kalkulator", zh:"计算器", ru:"Калькулятор", tr:"Hesap Makinesi", es:"Calculadora", prompt:{ar:'أنشئ لي آلة حاسبة أنيقة', en:'Build a sleek calculator', fr:'Crée-moi une calculatrice élégante', hi:'मेरे लिए एक स्टाइलिश कैलकुलेटर बनाएं', ur:'میرے لیے ایک خوبصورت کیلکولیٹر بنائیں', bn:'আমার জন্য একটি সুন্দর ক্যালকুলেটর তৈরি করুন', ne:'मेरो लागि एक स्टाइलिश क्यालकुलेटर बनाउनुहोस्'}},
  {icon:'📊', ar:'لوحة تحكم', en:'Dashboard', fr:'Tableau de bord', hi:'डैशबोर्ड', ur:'ڈیش بورڈ', bn:'ড্যাশবোর্ড', ne:'ड्यासबोर्ड', ml:"ഡാഷ്ബോർഡ്", fil:"Dashboard", id:"Dasbor", zh:"仪表盘", ru:"Панель управления", tr:"Kontrol Paneli", es:"Panel de control", prompt:{ar:'أنشئ لي لوحة تحكم بإحصائيات وهمية', en:'Build a dashboard with mock stats', fr:'Crée-moi un tableau de bord avec des statistiques fictives', hi:'मेरे लिए मॉक आँकड़ों के साथ एक डैशबोर्ड बनाएं', ur:'میرے لیے فرضی اعداد و شمار کے ساتھ ڈیش بورڈ بنائیں', bn:'আমার জন্য নকল পরিসংখ্যান সহ একটি ড্যাশবোর্ড তৈরি করুন', ne:'मेरो लागि नक्कली तथ्याङ्कसहितको ड्यासबोर्ड बनाउनुहोस्'}},
  {icon:'📝', ar:'مدونة', en:'Blog', fr:'Blog', hi:'ब्लॉग', ur:'بلاگ', bn:'ব্লগ', ne:'ब्लग', ml:"ബ്ലോഗ്", fil:"Blog", id:"Blog", zh:"博客", ru:"Блог", tr:"Blog", es:"Blog", prompt:{ar:'أنشئ لي موقع مدونة بسيط بتصميم أنيق', en:'Build a simple, stylish blog website', fr:'Crée-moi un site de blog simple et élégant', hi:'मेरे लिए एक सरल, स्टाइलिश ब्लॉग वेबसाइट बनाएं', ur:'میرے لیے ایک سادہ اور خوبصورت بلاگ ویب سائٹ بنائیں', bn:'আমার জন্য একটি সাধারণ, স্টাইলিশ ব্লগ ওয়েবসাইট তৈরি করুন', ne:'मेरो लागि एक साधारण, स्टाइलिश ब्लग वेबसाइट बनाउनुहोस्'}},
  {icon:'⏳', ar:'عداد تنازلي', en:'Countdown', fr:'Compte à rebours', hi:'काउंटडाउन', ur:'کاؤنٹ ڈاؤن', bn:'কাউন্টডাউন', ne:'काउन्टडाउन', ml:"കൗണ്ട്ഡൗൺ", fil:"Countdown", id:"Hitung Mundur", zh:"倒计时", ru:"Обратный отсчёт", tr:"Geri Sayım", es:"Cuenta atrás", prompt:{ar:'أنشئ لي عداد تنازلي لمناسبة قادمة', en:'Build a countdown timer for an upcoming event', fr:'Crée-moi un compte à rebours pour un événement à venir', hi:'मेरे लिए आने वाले इवेंट के लिए काउंटडाउन टाइमर बनाएं', ur:'میرے لیے آنے والے ایونٹ کے لیے کاؤنٹ ڈاؤن ٹائمر بنائیں', bn:'আমার জন্য একটি আসন্ন ইভেন্টের জন্য কাউন্টডাউন টাইমার তৈরি করুন', ne:'मेरो लागि आगामी कार्यक्रमको लागि काउन्टडाउन टाइमर बनाउनुहोस्'}},
  {icon:'📬', ar:'نموذج تواصل', en:'Contact form', fr:'Formulaire de contact', hi:'संपर्क फ़ॉर्म', ur:'رابطہ فارم', bn:'যোগাযোগ ফর্ম', ne:'सम्पर्क फारम', ml:"കോൺടാക്റ്റ് ഫോം", fil:"Contact Form", id:"Formulir Kontak", zh:"联系表单", ru:"Форма обратной связи", tr:"İletişim Formu", es:"Formulario de contacto", prompt:{ar:'أنشئ لي صفحة تواصل معنا بتصميم جميل', en:'Build a nicely designed contact-us page', fr:'Crée-moi une belle page de contact', hi:'मेरे लिए एक खूबसूरत संपर्क पेज बनाएं', ur:'میرے لیے ایک خوبصورت رابطہ صفحہ بنائیں', bn:'আমার জন্য একটি সুন্দর ডিজাইন করা যোগাযোগ পেজ তৈরি করুন', ne:'मेरो लागि राम्रोसँग डिजाइन गरिएको सम्पर्क पेज बनाउनुहोस्'}},
  {icon:'🛒', ar:'متجر إلكتروني', en:'Online store', fr:'Boutique en ligne', hi:'ऑनलाइन स्टोर', ur:'آن لائن اسٹور', bn:'অনলাইন স্টোর', ne:'अनलाइन स्टोर', ml:"ഓൺലൈൻ സ്റ്റോർ", fil:"Online Store", id:"Toko Online", zh:"在线商店", ru:"Интернет-магазин", tr:"Çevrimiçi Mağaza", es:"Tienda en línea", prompt:{ar:'أنشئ لي صفحة متجر إلكتروني بمنتجات وسلة شراء', en:'Build an online store page with products and a shopping cart', fr:'Crée-moi une boutique en ligne avec des produits et un panier', hi:'मेरे लिए उत्पादों और शॉपिंग कार्ट के साथ एक ऑनलाइन स्टोर बनाएं', ur:'میرے لیے مصنوعات اور شاپنگ کارٹ کے ساتھ آن لائن اسٹور بنائیں', bn:'আমার জন্য পণ্য এবং শপিং কার্ট সহ একটি অনলাইন স্টোর পেজ তৈরি করুন', ne:'मेरो लागि उत्पादन र शपिङ कार्ट भएको अनलाइन स्टोर पेज बनाउनुहोस्'}},
  {icon:'🎯', ar:'لعبة تخمين', en:'Guessing game', fr:'Jeu de devinettes', hi:'अनुमान खेल', ur:'اندازہ گیم', bn:'অনুমান খেলা', ne:'अनुमान खेल', ml:"ഊഹക്കളി", fil:"Larong Hulaan", id:"Permainan Tebak-tebakan", zh:"猜谜游戏", ru:"Игра в угадайку", tr:"Tahmin Oyunu", es:"Juego de adivinanzas", prompt:{ar:'أنشئ لي لعبة تخمين رقم ممتعة', en:'Build a fun number-guessing game', fr:'Crée-moi un jeu amusant de devinette de nombre', hi:'मेरे लिए एक मज़ेदार नंबर-गेसिंग गेम बनाएं', ur:'میرے لیے ایک دلچسپ نمبر گیسنگ گیم بنائیں', bn:'আমার জন্য একটি মজার সংখ্যা অনুমান খেলা তৈরি করুন', ne:'मेरो लागि रमाइलो नम्बर अनुमान खेल बनाउनुहोस्'}},
  {icon:'🌦️', ar:'تطبيق طقس', en:'Weather app', fr:'App météo', hi:'मौसम ऐप', ur:'موسم ایپ', bn:'আবহাওয়া অ্যাপ', ne:'मौसम एप', ml:"വെതർ ആപ്പ്", fil:"Weather App", id:"Aplikasi Cuaca", zh:"天气应用", ru:"Приложение погоды", tr:"Hava Durumu Uygulaması", es:"App del clima", prompt:{ar:'أنشئ لي تطبيق طقس بتصميم جميل وبيانات وهمية', en:'Build a nicely designed weather app with mock data', fr:'Crée-moi une application météo bien conçue avec des données fictives', hi:'मेरे लिए मॉक डेटा के साथ एक अच्छी तरह से डिज़ाइन की गई मौसम ऐप बनाएं', ur:'میرے لیے فرضی ڈیٹا کے ساتھ ایک خوبصورت موسم ایپ بنائیں', bn:'আমার জন্য নকল ডেটা সহ একটি সুন্দর ডিজাইন করা আবহাওয়া অ্যাপ তৈরি করুন', ne:'मेरो लागि नक्कली डाटा सहितको राम्रो डिजाइन गरिएको मौसम एप बनाउनुहोस्'}},
  {icon:'📷', ar:'معرض صور', en:'Photo gallery', fr:'Galerie photo', hi:'फ़ोटो गैलरी', ur:'فوٹو گیلری', bn:'ফটো গ্যালারি', ne:'फोटो ग्यालेरी', ml:"ഫോട്ടോ ഗാലറി", fil:"Photo Gallery", id:"Galeri Foto", zh:"照片库", ru:"Фотогалерея", tr:"Fotoğraf Galerisi", es:"Galería de fotos", prompt:{ar:'أنشئ لي معرض صور تفاعلي بتأثيرات جميلة', en:'Build an interactive photo gallery with nice effects', fr:'Crée-moi une galerie photo interactive avec de beaux effets', hi:'मेरे लिए अच्छे इफेक्ट्स के साथ एक इंटरैक्टिव फ़ोटो गैलरी बनाएं', ur:'میرے لیے اچھے اثرات کے ساتھ ایک انٹرایکٹو فوٹو گیلری بنائیں', bn:'আমার জন্য সুন্দর প্রভাব সহ একটি ইন্টারেক্টিভ ফটো গ্যালারি তৈরি করুন', ne:'मेरो लागि राम्रो प्रभावसहितको इन्टरएक्टिभ फोटो ग्यालेरी बनाउनुहोस्'}},
  {icon:'🧠', ar:'اختبار ذكاء', en:'Quiz app', fr:'App de quiz', hi:'क्विज़ ऐप', ur:'کوئز ایپ', bn:'কুইজ অ্যাপ', ne:'क्विज एप', ml:"ക്വിസ് ആപ്പ്", fil:"Quiz App", id:"Aplikasi Kuis", zh:"问答应用", ru:"Приложение викторин", tr:"Bilgi Yarışması Uygulaması", es:"App de preguntas", prompt:{ar:'أنشئ لي تطبيق اختبار أسئلة وأجوبة تفاعلي', en:'Build an interactive quiz app', fr:'Crée-moi une application de quiz interactive', hi:'मेरे लिए एक इंटरैक्टिव क्विज़ ऐप बनाएं', ur:'میرے لیے ایک انٹرایکٹو کوئز ایپ بنائیں', bn:'আমার জন্য একটি ইন্টারেক্টিভ কুইজ অ্যাপ তৈরি করুন', ne:'मेरो लागि इन्टरएक्टिभ क्विज एप बनाउनुहोस्'}},
  {icon:'🍳', ar:'كتاب وصفات', en:'Recipe book', fr:'Livre de recettes', hi:'रेसिपी बुक', ur:'ریسپی بک', bn:'রেসিপি বই', ne:'रेसिपी बुक', ml:"റെസിപ്പി ബുക്ക്", fil:"Aklat ng Recipe", id:"Buku Resep", zh:"食谱书", ru:"Книга рецептов", tr:"Yemek Tarifi Kitabı", es:"Libro de recetas", prompt:{ar:'أنشئ لي موقع كتاب وصفات طبخ', en:'Build a recipe book website', fr:'Crée-moi un site de livre de recettes', hi:'मेरे लिए एक रेसिपी बुक वेबसाइट बनाएं', ur:'میرے لیے ایک ریسپی بک ویب سائٹ بنائیں', bn:'আমার জন্য একটি রেসিপি বই ওয়েবসাইট তৈরি করুন', ne:'मेरो लागि रेसिपी बुक वेबसाइट बनाउनुहोस्'}},
  {icon:'📄', ar:'سيرة ذاتية', en:'Resume', fr:'CV', hi:'रिज़्यूमे', ur:'ریزیومے', bn:'জীবনবৃত্তান্ত', ne:'बायोडाटा', ml:"റെസ്യൂമെ", fil:"Resume", id:"Resume", zh:"简历", ru:"Резюме", tr:"Özgeçmiş", es:"Currículum", prompt:{ar:'أنشئ لي صفحة سيرة ذاتية احترافية', en:'Build a professional resume page', fr:'Crée-moi une page de CV professionnelle', hi:'मेरे लिए एक पेशेवर रिज़्यूमे पेज बनाएं', ur:'میرے لیے ایک پیشہ ورانہ ریزیومے صفحہ بنائیں', bn:'আমার জন্য একটি পেশাদার জীবনবৃত্তান্ত পেজ তৈরি করুন', ne:'मेरो लागि व्यावसायिक बायोडाटा पेज बनाउनुहोस्'}},
  {icon:'🎵', ar:'مشغل موسيقى', en:'Music player', fr:'Lecteur de musique', hi:'म्यूज़िक प्लेयर', ur:'میوزک پلیئر', bn:'মিউজিক প্লেয়ার', ne:'म्युजिक प्लेयर', ml:"മ്യൂസിക് പ്ലെയർ", fil:"Music Player", id:"Pemutar Musik", zh:"音乐播放器", ru:"Музыкальный плеер", tr:"Müzik Çalar", es:"Reproductor de música", prompt:{ar:'أنشئ لي واجهة مشغل موسيقى أنيقة', en:'Build a sleek music player UI', fr:'Crée-moi une interface de lecteur de musique élégante', hi:'मेरे लिए एक स्टाइलिश म्यूज़िक प्लेयर UI बनाएं', ur:'میرے لیے ایک خوبصورت میوزک پلیئر UI بنائیں', bn:'আমার জন্য একটি সুন্দর মিউজিক প্লেয়ার ইউআই তৈরি করুন', ne:'मेरो लागि स्टाइलिश म्युजिक प्लेयर UI बनाउनुहोस्'}},
  {icon:'⚖️', ar:'بوت استشارات قانونية', en:'Legal advice bot', priority:true, fr:"Bot de conseils juridiques", hi:"कानूनी सलाह बॉट", ur:"قانونی مشاورت بوٹ", bn:"আইনি পরামর্শ বট", ml:"നിയമോപദേശ ബോട്ട്", ne:"कानुनी सल्लाह बोट", fil:"Bot ng Legal na Payo", id:"Bot Konsultasi Hukum", zh:"法律咨询机器人", ru:"Бот юридических консультаций", tr:"Hukuki Danışma Botu", es:"Bot de asesoría legal", prompt:{ar:'أنشئ لي صفحة ويب واحدة (HTML/CSS/JS) اسمها "بوت استشارات قانونية — قوانين دولة الإمارات". لكل سؤال يكتبه المستخدم: أولاً أرسل fetch POST إلى المسار النسبي /api/search بالجسم {query: السؤال + " قانون الإمارات المادة", lang:"ar", domains:["uaelegislation.gov.ae","moj.gov.ae","u.ae","elaws.moj.gov.ae"]} (JSON)، انتظر النتيجة. إذا رجعت نتائج قليلة أو فارغة أعد المحاولة مرة واحدة بدون حقل domains. ثم اعرض الإجابة بهذه الصيغة الإلزامية: 1) 📜 اسم القانون ورقمه وسنته، 2) 🔢 رقم المادة، 3) النص من نتائج البحث الفعلية (title/url/content)، 4) 💡 شرح مبسط بالعربي، 5) 🔗 رابط المصدر الرسمي. لا تختلق نص مواد أو أرقام قوانين من عندك أبدًا؛ إن لم تجد المادة في النتائج قل صراحة "لم أجد نص المادة في المصادر الرسمية" واعرض الروابط. أضف أسفل كل إجابة تنويه: "هذه معلومات إرشادية وليست استشارة قانونية رسمية". إن فشل البحث اعرض "تعذر جلب معلومات دقيقة الآن". صمم الواجهة بسيطة ونظيفة بدون مربعات/حدود، نفس أسلوب التطبيق (خلفية شفافة، نص فقط، أيقونة نسخ SVG تحت كل رد).', en:'Build a single-page web app (HTML/CSS/JS) called "UAE Legal Advice Bot". For every user question: first send a POST fetch to the relative path /api/search with body {query: question + " UAE law article", lang:"en", domains:["uaelegislation.gov.ae","moj.gov.ae","u.ae","elaws.moj.gov.ae"]} (JSON), wait for the result. If results are empty or too few, retry once without the domains field. Then answer in this mandatory format: 1) 📜 law name, number and year, 2) 🔢 article number, 3) the text taken from the actual search results (title/url/content), 4) 💡 simple explanation, 5) 🔗 official source link. Never invent article texts or law numbers; if the article text is not in the results, say clearly "Article text not found in official sources" and show the links. Add under every answer: "This is guidance information, not official legal advice". If the search fails show "Could not fetch accurate information right now". Keep the UI clean, no boxes/borders, matching the app style (transparent background, text only, SVG copy icon under each reply).'}},
  {icon:'🩺', ar:'بوت استشارات طبية', en:'Medical advice bot', priority:true, fr:"Bot de conseils médicaux", hi:"चिकित्सा सलाह बॉट", ur:"طبی مشاورت بوٹ", bn:"চিকিৎসা পরামর্শ বট", ml:"മെഡിക്കൽ ഉപദേശ ബോട്ട്", ne:"चिकित्सा सल्लाह बोट", fil:"Bot ng Medikal na Payo", id:"Bot Konsultasi Medis", zh:"医疗咨询机器人", ru:"Бот медицинских консультаций", tr:"Tıbbi Danışma Botu", es:"Bot de asesoría médica", prompt:{ar:'أنشئ لي صفحة ويب واحدة (HTML/CSS/JS) اسمها "بوت استشارات طبية أولية". لكل سؤال يكتبه المستخدم عن أعراض أو معلومات صحية: أولاً أرسل fetch POST إلى المسار النسبي /api/search بالجسم {query, lang:"ar"} (JSON)، انتظر النتيجة، ثم اعرض ملخصاً دقيقاً مبنياً فعلياً على نتائج البحث المرجعة (title/url/content) مع ذكر المصادر كروابط. لا تختلق معلومات طبية من عندك؛ إن فشل البحث اعرض رسالة "تعذر جلب معلومات دقيقة الآن". صمم الواجهة بسيطة ونظيفة بدون مربعات/حدود، نفس أسلوب التطبيق (خلفية شفافة، نص فقط، أيقونة نسخ SVG تحت كل رد).', en:'Build a single-page web app (HTML/CSS/JS) called "Preliminary Medical Advice Bot". For every symptom/health question: first send a POST fetch to the relative path /api/search with body {query, lang:"en"} (JSON), wait for the result, then show an accurate summary based on the actual returned search results (title/url/content), citing sources as links. Do not invent medical information; if the search fails show "Could not fetch accurate information right now". Keep the UI clean, no boxes/borders, matching the app style (transparent background, text only, SVG copy icon under each reply).'}},
  {icon:'🎓', ar:'بوت مساعدة طلابية', en:'Student helper bot', priority:true, fr:"Bot d’aide aux étudiants", hi:"छात्र सहायक बॉट", ur:"طلبہ معاون بوٹ", bn:"শিক্ষার্থী সহায়ক বট", ml:"വിദ്യാർത്ഥി സഹായി ബോട്ട്", ne:"विद्यार्थी सहायक बोट", fil:"Bot Tulong sa Mag-aaral", id:"Bot Bantuan Siswa", zh:"学生助手机器人", ru:"Бот-помощник для студентов", tr:"Öğrenci Yardımcı Botu", es:"Bot de ayuda estudiantil", prompt:{ar:'أنشئ لي صفحة ويب واحدة (HTML/CSS/JS) اسمها "بوت مساعدة طلابية". لكل سؤال دراسي/منهجي يكتبه الطالب: أولاً أرسل fetch POST إلى المسار النسبي /api/search بالجسم {query, lang:"ar"} (JSON)، انتظر النتيجة، ثم اشرح الإجابة بأسلوب مبسط تعليمي مبني فعلياً على نتائج البحث المرجعة (title/url/content) مع ذكر المصادر كروابط للمزيد من القراءة. لا تختلق معلومات من عندك؛ إن فشل البحث اعرض رسالة "تعذر جلب معلومات دقيقة الآن". صمم الواجهة بسيطة ونظيفة بدون مربعات/حدود، نفس أسلوب التطبيق (خلفية شفافة، نص فقط، أيقونة نسخ SVG تحت كل رد).', en:'Build a single-page web app (HTML/CSS/JS) called "Student Helper Bot". For every curriculum/study question: first send a POST fetch to the relative path /api/search with body {query, lang:"en"} (JSON), wait for the result, then explain the answer in a simple educational style based on the actual returned search results (title/url/content), citing sources as links for further reading. Do not invent information; if the search fails show "Could not fetch accurate information right now". Keep the UI clean, no boxes/borders, matching the app style (transparent background, text only, SVG copy icon under each reply).'}},
];

function renderQuickChips(){
  const wrap = $('#quickChips');
  if(!wrap) return;
  const order = QUICK_SUGGESTIONS.map((s,i) => i)
    .sort((a,b) => {
      const pa = QUICK_SUGGESTIONS[a].priority ? 0 : 1;
      const pb = QUICK_SUGGESTIONS[b].priority ? 0 : 1;
      if(pa !== pb) return pa - pb;
      return (QUICK_SUGGESTIONS[a][lang]||QUICK_SUGGESTIONS[a].en).length - (QUICK_SUGGESTIONS[b][lang]||QUICK_SUGGESTIONS[b].en).length;
    });
  wrap.innerHTML = order.map(i => {
    const s = QUICK_SUGGESTIONS[i];
    return `<button type="button" class="btn quickChip" data-idx="${i}" style="display:block; width:100%; text-align:right; background:none; border:none; box-shadow:none; color:var(--text); font-size:13px; padding:5px 8px; min-height:0; line-height:1.4;">${s[lang] || s.en}</button>`;
  }).join('');
  wrap.querySelectorAll('.quickChip').forEach(btn => {
    btn.onclick = () => {
      const s = QUICK_SUGGESTIONS[+btn.dataset.idx];
      $('#prompt').value = s.prompt[lang] || s.prompt.en;
      closeQuickTemplates();
      sendPrompt();
    };
  });
}

/* v532: بوتات جاهزة كشرائح تحت صندوق المحادثة — نفس مصدر «الاقتراحات» عند ＋ */
function renderOmranBotChips(){
  const wrap = $('#omranChips');
  if(!wrap) return;
  wrap.innerHTML = '';
  QUICK_SUGGESTIONS.filter(s => s.priority).forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'omChip';
    b.textContent = (s.icon ? s.icon + ' ' : '') + (s[lang] || s.en);
    b.setAttribute('data-omchip', s.prompt[lang] || s.prompt.en);
    b.onclick = () => {
      const p = $('#prompt');
      if(!p) return;
      p.value = b.getAttribute('data-omchip') || '';
      try{ p.dispatchEvent(new Event('input', { bubbles:true })); }catch(_){ __swallow(_, "ui:botchips#input"); }
      try{ p.focus(); p.selectionStart = p.selectionEnd = p.value.length; }catch(_){ __swallow(_, "ui:botchips#focus"); }
    };
    wrap.appendChild(b);
  });
}

// v549: رصف شريط الاقتراحات داخل مربّع الأدوات — يُفتح في مكانه لا يقذف المستخدم إلى المحادثة
(function(){
  const OV  = () => document.getElementById('sectionsToolsOverlay');
  const POP = () => document.getElementById('sectionsToolsPopup');
  const W   = () => document.getElementById('chatQuickChipsWrap');
  let home = null, homeNext = null, homeStyle = null;
  const DOCK_STYLE = 'display:block; position:static; inset:auto; margin:2px 2px 6px; max-height:38vh; overflow-y:auto; background:rgba(255,255,255,.02); border:1px solid var(--omGoldSoft); border-radius:var(--r-3); padding:8px; box-shadow:none; z-index:auto;';
  function isDocked(){ const w = W(), pop = POP(); return !!(w && pop && pop.contains(w)); }
  window.__sugDock = function(){
    const w = W(), pop = POP();
    if(!w || !pop || isDocked()) return;
    home = w.parentNode; homeNext = w.nextSibling; homeStyle = w.getAttribute('style') || '';
    pop.appendChild(w);
    w.setAttribute('style', DOCK_STYLE);
    try{ w.scrollIntoView({ block:'nearest', behavior:'smooth' }); }catch(_){ __swallow(_, "ui:sugdock#scroll"); }
  };
  window.__sugUndock = function(){
    const w = W();
    if(!w || !isDocked()) return;
    try{ if(home) home.insertBefore(w, homeNext || null); }catch(_){ __swallow(_, "ui:sugdock#restore"); }
    if(homeStyle !== null) w.setAttribute('style', homeStyle);
    w.style.display = 'none';
    home = null; homeNext = null; homeStyle = null;
  };
  const ov = OV();
  if(ov && window.MutationObserver){
    new MutationObserver(() => {
      if(!ov.classList.contains('show') && isDocked()){
        window.__sugUndock();
        const b = document.getElementById('btnQuickTemplates');
        if(b) b.classList.remove('active');
      }
    }).observe(ov, { attributes:true, attributeFilter:['class'] });
  }
  const chips = document.getElementById('quickChips');
  if(chips) chips.addEventListener('click', (e) => {
    if(!isDocked()) return;
    if(!e.target.closest || !e.target.closest('button')) return;
    setTimeout(() => {
      try{ const o = OV(); if(o) o.classList.remove('show'); }catch(_){ __swallow(_, "ui:sugdock#pick"); }
    }, 60);
  }, true);
})();

function closeQuickTemplates(){
  const wrap = $('#chatQuickChipsWrap');
  try{ if(typeof __sugUndock === 'function') __sugUndock(); }catch(_){ __swallow(_, "ui:quicksug#undock"); }
  if(wrap) wrap.style.display = 'none';
  const btn = $('#btnQuickTemplates');
  if(btn) btn.classList.remove('active');
  const msgs = $('#messages');
  if(msgs) msgs.style.visibility = '';
}
function toggleQuickTemplates(){
  const wrap = $('#chatQuickChipsWrap');
  if(!wrap) return;
  const willShow = wrap.style.display === 'none' || !wrap.style.display;
  try{
    const _ov = document.getElementById('sectionsToolsOverlay');
    if(willShow && _ov && _ov.classList.contains('show')){ if(typeof __sugDock === 'function') __sugDock(); }
    else if(!willShow){ if(typeof __sugUndock === 'function') __sugUndock(); }
  }catch(_){ __swallow(_, "ui:quicksug#dock"); }
  wrap.style.display = willShow ? 'block' : 'none';
  const btn = $('#btnQuickTemplates');
  if(btn) btn.classList.toggle('active', willShow);
  const msgs = $('#messages');
  if(msgs) msgs.style.visibility = '';
  if(willShow){ try{ const p = document.getElementById('plusToolsPopup'); if(p){ p.classList.remove('show'); p.classList.remove('open'); } }catch(_){ __swallow(_, "ui:quicksug#close-plus"); } }
}
if($('#btnQuickTemplates')) $('#btnQuickTemplates').onclick = (e) => { e.stopPropagation(); toggleQuickTemplates(); };
document.addEventListener('click', (e) => {
  const wrap = $('#chatQuickChipsWrap');
  if(!wrap || wrap.style.display === 'none' || !wrap.style.display) return;
  if(wrap.contains(e.target) || e.target === $('#btnQuickTemplates')) return;
  closeQuickTemplates();
});

function toggleLang(){
  lang = lang === 'ar' ? 'en' : 'ar';
  applyLanguage();
  renderAll();
}
function setLang(newLang){ try{ setTimeout(()=>{ if(typeof markActiveLang==="function") markActiveLang(); },0); }catch(e){ __swallow(e, "misc:app-04-i18n-state#8"); }
  if(lang === newLang) return;
  lang = newLang;
  applyLanguage();
  renderAll();
  try { populateVoicePicker(); } catch(e){ __swallow(e, "misc:app-04-i18n-state#9"); }
}
if($('#btnLangAr')) $('#btnLangAr').onclick = () => setLang('ar');
if($('#btnLangEn')) $('#btnLangEn').onclick = () => setLang('en');
if($('#btnLangFr')) $('#btnLangFr').onclick = () => setLang('fr');
if($('#btnLangHi')) $('#btnLangHi').onclick = () => setLang('hi');
if($('#btnLangUr')) $('#btnLangUr').onclick = () => setLang('ur');
if($('#btnLangBn')) $('#btnLangBn').onclick = () => setLang('bn');
if($('#btnLangNe')) $('#btnLangNe').onclick = () => setLang('ne');
if($('#btnLangId')) $('#btnLangId').onclick = () => setLang('id');
if($('#btnLangFil')) $('#btnLangFil').onclick = () => setLang('fil');
if($('#btnLangTr')) $('#btnLangTr').onclick = () => setLang('tr');
if($('#btnLangZh')) $('#btnLangZh').onclick = () => setLang('zh');
if($('#btnLangRu')) $('#btnLangRu').onclick = () => setLang('ru');
if($('#btnLangEs')) $('#btnLangEs').onclick = () => setLang('es');
if($('#btnLangMl')) $('#btnLangMl').onclick = () => setLang('ml');
function markActiveLang(){
  const map={ar:'Ar',en:'En',fr:'Fr',hi:'Hi',ur:'Ur',bn:'Bn',ne:'Ne',id:'Id',fil:'Fil',tr:'Tr',zh:'Zh',ru:'Ru',es:'Es',ml:'Ml'};
  const cur=map[(typeof lang!=='undefined'&&lang)?lang:(localStorage.getItem('aiapp_lang')||'ar')]||'Ar';
  document.querySelectorAll('#langListWrap .langFlagBtn').forEach(b=>{
    const on=b.id==='btnLang'+cur;
    const c=b.querySelector('.langCheck'); if(c) c.style.display=on?'block':'none';
    b.style.background=on?'rgba(var(--accent-rgb),.12)':'none';
    b.style.fontWeight=on?'700':'400';
  });
}
markActiveLang();

// The login/signup overlay sits above the header (so it can fully block the
// app until the user authenticates), which means the header's own language
// buttons are not reachable while it's open. Mirror the same controls here so
// users can still switch AR/EN from the login screen itself.
const authLangArInit = $('#btnAuthLangAr');
const authLangEnInit = $('#btnAuthLangEn');
if(authLangArInit) authLangArInit.onclick = () => setLang('ar');
if(authLangEnInit) authLangEnInit.onclick = () => setLang('en');

let state = {
  projects: safeParseLS('aiapp_projects', []),
  currentId: null,
};
// v-idb-mirror (جذر «البيت الأسود» و«المحادثات الفاضية» — ٢٧ أغسطس): المشاريع
// صارت في IndexedDB وحده، والإقلاع يبدأ فاضيًا بانتظار تحميله — وعلى iOS PWA
// هذا التحميل قد يتجمد للأبد (علة WebKit موثقة). المرآة المنحّفة في
// localStorage تُقرأ فورًا فتظهر المحادثات من أول لحظة، والنسخة الكاملة
// من IndexedDB تحل محلها عند وصولها.
if(!state.projects.length){
  const __slimBoot = safeParseLS('aiapp_projects_slim', []);
  if(Array.isArray(__slimBoot) && __slimBoot.length){
    state.projects = __slimBoot;
    window.__usingSlimProjects = true;
  }
}
// v-idb-mirror: استرجاع المحادثة الحالية كان حبيس كتلة تحميل IndexedDB —
// إن علّق التحميل لا يُسترجع أبدًا فتبقى الشاشة سوداء رغم وجود المشاريع.
// يُسترجع هنا من أول لحظة؛ وكتلة التحميل اللاحقة تظل تعمل (شرطها !currentId).
if(!state.currentId && state.projects.length){
  try{
    const __savedCur = localStorage.getItem('aiapp_current_id');
    const __curP = state.projects.find(q => q.id === __savedCur) || state.projects[state.projects.length - 1];
    if(__curP) state.currentId = __curP.id;
  }catch(e){ __swallow(e, 'boot:app-04#cur-early'); }
}
// v522: نكشف state على window حتى يقدر app-22-session-new.js يصل إليه من داخل IIFE
window.__omrS = state;

// 💾 IndexedDB storage — سعة بالجيجات بدل حد 5MB في localStorage.
// المشاريع/المحادثات/الصور تنحفظ هنا؛ localStorage يبقى للإعدادات الصغيرة فقط.
const IDB_NAME = 'aiapp_db', IDB_STORE = 'kv';
function idbOpen(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(IDB_STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbSet(key, val){
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => { db.close(); res(); };
    tx.onerror = () => { db.close(); rej(tx.error); };
  }));
}
function idbGet(key){
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const rq = tx.objectStore(IDB_STORE).get(key);
    rq.onsuccess = () => { db.close(); res(rq.result); };
    rq.onerror = () => { db.close(); rej(rq.error); };
  }));
}
let __idbBroken = false;

// Strips old image data (keeps a small placeholder) to free up localStorage
// space. Keeps the most recent images in the active project untouched so the
// current conversation still looks right; purges everything older/elsewhere.
function purgeOldImages(keepCount){
  if(keepCount === undefined) keepCount = 4;
  let purgedAny = false;
  const currentId = state.currentId;
  state.projects.forEach(p => {
    const isCurrent = p.id === currentId;
    const msgs = p.messages || [];
    msgs.forEach((m, idx) => {
      const keepThis = isCurrent && keepCount > 0 && idx >= msgs.length - keepCount;
      if(keepThis) return;
      if(m.attachments && m.attachments.length){
        m.attachments.forEach(a => {
          if(a.isImage && a.dataUrl){ a.dataUrl = ''; a.purged = true; purgedAny = true; }
        });
      }
      if(m.apiImages && m.apiImages.length){
        m.apiImages.forEach(a => { if(a.dataUrl){ a.dataUrl = ''; purgedAny = true; } });
      }
    });
  });
  return purgedAny;
}

// 🕰️ آلة الزمن — لقطة تلقائية لكل تغيير في كود المشروع
function pushCodeSnapshot(){
  try{
    const cur = getCurrent();
    if(!cur || !cur.code) return;
    cur.codeHistory = cur.codeHistory || [];
    const last = cur.codeHistory[cur.codeHistory.length - 1];
    if(last && last.code === cur.code) return;
    // 🧹 v308: اللقطات بدون وسائط مضمنة — نسخة واحدة كاملة تكفي (المشروع نفسه)،
    // أما 12 لقطة × صور base64 عملاقة = انفجار تخزين iOS واختفاء المحادثات.
    let snapCode = cur.code;
    if(snapCode.length > 500000){
      snapCode = snapCode.replace(/data:(image|audio|video)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]{200,}/g, 'data:image/png;base64,SNAPSHOT_MEDIA_OMITTED');
      if(snapCode.length > 500000) snapCode = snapCode.slice(0, 500000);
    }
    // v318: الكود المقصوص يولّد لقطة مختلفة عن الأصل كل مرة → انفجار لقطات. قارن اللقطة نفسها.
    if(last && last.code === snapCode) return;
    cur.codeHistory.push({ ts: Date.now(), code: snapCode, codeType: cur.codeType || 'html' });
    if(cur.codeHistory.length > 12) cur.codeHistory.splice(0, cur.codeHistory.length - 12);
  }catch(e){ __swallow(e, "misc:app-04-i18n-state#10"); }
}
/* v318: الحفظ المجمّع — بدل نسخ JSON كامل لكل المشاريع عشرات المرات أثناء
   الرد الواحد (كان يجمّد الخيط الرئيسي ويطلّع «يستجيب ببطء»)، نجمع الطلبات
   ونكتب مرة كل 1.5 ثانية كحد أقصى، مع حفظة فورية مضمونة عند إخفاء/إغلاق الصفحة. */
let __saveTimer = null;
let __saveDirty = false;
// v-idb-mirror: كتابة المرآة المنحّفة — chatsSlimForServer تُعرَّف لاحقًا في هذا
// الملف والاستدعاء يحدث بعد اكتمال التحميل، فالمرجع آمن وقت التنفيذ.
let __mirrorAt = 0;
function __writeChatsMirror(){
  try{ localStorage.setItem('aiapp_projects_slim', JSON.stringify(chatsSlimForServer())); }
  catch(e){ /* guard-ok: المرآة رفاهية إقلاع — امتلاء التخزين لا يكسر الحفظ الأصلي */ }
}
window.__writeChatsMirror = __writeChatsMirror;
function __saveFlush(){
  if(!__saveDirty) return;
  __saveDirty = false;
  try{ clearTimeout(__saveTimer); }catch(e){ __swallow(e, "save:app-04-i18n-state#11"); }
  __saveTimer = null;
  if(!__idbBroken && window.indexedDB){
    try{
      // v714: حارس حجم صريح — المنظّف القديم كان لا يعمل إلا عند امتلاء localStorage،
      // ومع IndexedDB لا يمتلئ أبدًا، فتتكدّس صور base64 (بوسترات الإعلانات خاصة)
      // حتى يصير الحفظ الدوري كل 1.5 ثانية يجمّد الصفحة كلها. الآن: إذا تجاوز
      // الحجم ~12MB نمسح بيانات الصور القديمة (تبقى آخر 6 رسائل في المشروع المفتوح).
      try{
        if(__projectsToJson().length > 12000000){ purgeOldImages(6); __projJsonCache = new WeakMap(); }
      }catch(e){ __swallow(e, 'save:sizeGuard#v714'); }
      idbSet('aiapp_projects', state.projects).catch(err => {
        console.error('IDB save failed → fallback to localStorage', err);
        __idbBroken = true;
        saveStateLocal();
      });
      // v-idb-mirror: تحديث المرآة المنحّفة (سقف 2MB) كل ١٠ ثوانٍ كحد أقصى —
      // هي اللي تجعل الإقلاع القادم يعرض المحادثات فورًا دون انتظار IndexedDB.
      if(Date.now() - __mirrorAt > 10000){ __mirrorAt = Date.now(); __writeChatsMirror(); }
      return;
    }catch(err){
      // كائن غير قابل للاستنساخ البنيوي → نسخة JSON نظيفة مرة واحدة.
      try{
        idbSet('aiapp_projects', JSON.parse(JSON.stringify(state.projects))).catch(() => { __idbBroken = true; saveStateLocal(); });
        return;
      }catch(e2){ __idbBroken = true; }
    }
  }
  saveStateLocal();
}
window.addEventListener('pagehide', __saveFlush);
window.addEventListener('pagehide', __writeChatsMirror); /* v-idb-mirror: مرآة طازجة عند كل مغادرة */
document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'hidden') __saveFlush(); });
function saveState(){
  pushCodeSnapshot();
  try{ localStorage.setItem('aiapp_current_id', state.currentId || ''); }catch(e){ __swallow(e, "save:app-04-i18n-state#12"); }
  // ☁️ v306: مزامنة صامتة مؤجَّلة مع السيرفر للمستخدمين المسجّلين.
  try{ scheduleChatsServerSync(); }catch(e){ __swallow(e, "save:app-04-i18n-state#13"); }
  __saveDirty = true;
  if(__saveTimer) return;
  __saveTimer = setTimeout(__saveFlush, 1500);
}
// ⚡ v320: الحفظ يعالج المشروع المفتوح فقط — الباقي من نسخة نصية جاهزة (كاش).
let __projJsonCache = new WeakMap();
function __projectsToJson(){
  const curId = state.currentId;
  const parts = state.projects.map(p => {
    if(p.id !== curId){
      const c = __projJsonCache.get(p);
      if(c !== undefined) return c;
    }
    const s = JSON.stringify(p);
    __projJsonCache.set(p, s);
    return s;
  });
  return '[' + parts.join(',') + ']';
}
function saveStateLocal(){
  try{
    localStorage.setItem('aiapp_projects', __projectsToJson());
  }catch(err){
    console.error('saveState failed, attempting auto-cleanup of old images', err);
    __projJsonCache = new WeakMap(); // الكاش قد يصير قديمًا بعد التنظيف
    // Progressive cleanup: first try keeping only the last 4 messages' images,
    // then last 2, then just the very last message (the one currently being
    // sent to the AI providers) — never 0, so an in-flight send never loses
    // its own image data out from under it.
    const steps = [4, 2, 1];
    for(const keepCount of steps){
      const purged = purgeOldImages(keepCount);
      if(!purged) continue;
      try{
        localStorage.setItem('aiapp_projects', JSON.stringify(state.projects));
        renderHistory();
        return; // recovered silently, no need to alarm the user
      }catch(err2){
        console.error('saveState failed again after cleanup (keepCount=' + keepCount + ')', err2);
      }
    }
    // Quota exceeded (usually from many/large image attachments piling up in
    // history) must never silently break the send flow. Surface it instead.
    if(!saveState._warned){
      saveState._warned = true;
      setTimeout(() => { saveState._warned = false; }, 15000);
      alert(t('storageFullWarning'));
    }
  }
}

/* ☁️ v306: مزامنة المحادثات مع السيرفر للمستخدمين المسجّلين فقط.
   iOS Safari يمسح localStorage/IndexedDB أحيانًا → المحادثات تختفي.
   الحل: نسخة احتياطية في السيرفر (chats:{username}) تُدمج عند فتح التطبيق.
   الضيوف بدون أي تغيير. أخطاء الشبكة صامتة تمامًا. */
let __chatsSyncTimer = null;
let __chatsLoadedFor = null;
function chatsAuthToken(){
  try{ return (window.authGet && window.authGet('aiapp_auth_token')) || ''; }catch(e){ return ''; }
}
/* v381: تطبيع الرسالة قبل الرفع — الصور الكبيرة تُستبدل بـ serverThumb المضغوط.
   الصور الصغيرة (< 150KB base64) تبقى كما هي. بدون thumb + كبيرة = [media]. */
function __msgForServer(m){
  try{
    var o = JSON.parse(JSON.stringify(m));
    // المرفقات: استخدم serverThumb إذا موجود، أو احتفظ بالصغيرة
    function fixImg(a){
      if(!a || !a.isImage) return;
      if(a.serverThumb){
        a.dataUrl = a.serverThumb;
        delete a.serverThumb;
      } else if(a.dataUrl && a.dataUrl.length > 150000){
        a.dataUrl = '[media]';
      }
      // الصغيرة تبقى كما هي
    }
    if(o.attachments) o.attachments.forEach(fixImg);
    if(o.apiImages) o.apiImages.forEach(fixImg);
    // النص الطويل
    if(o && typeof o.content === 'string' && o.content.length > 12001){
      o.content = o.content.slice(0, 12000) + '…';
    }
    // الكود المضمن في المحتوى
    if(o && typeof o.content === 'string'){
      o.content = o.content.replace(/data:(image|audio|video)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]{200,}/g, '[media]');
    }
    return o || m;
  }catch(e){ return m; }
}
function chatsSlimForServer(){
  let list = (state.projects || []).map(p => ({
    id: p.id,
    title: p.title || '',
    provider: p.provider || '',
    messages: Array.isArray(p.messages) ? p.messages.map(__msgForServer) : [],
    code: (typeof p.code === 'string') ? p.code : '',
  })).filter(p => p.id);
  const size = l => { try{ return JSON.stringify(l).length; }catch(e){ return Infinity; } };
  // v381: رفع الحد لـ 2MB عشان الصور المضغوطة تمر
  let i = 0;
  while(size(list) > 2000000 && i < list.length){
    if(list[i].code) list[i] = Object.assign({}, list[i], { code: '' });
    i++;
  }
  while(size(list) > 2000000 && list.length > 0) list.shift();
  return list;
}
// v311: أي صورة داخل المحادثة يفشل تحميلها (انحذفت من المزامنة) تختفي
// بهدوء بدل ما يظهر «⚠️ Load failed» ويشوه المحادثة.
document.addEventListener('error', function(e){
  try{
    const t = e.target;
    if(t && t.tagName === 'IMG' && t.closest && t.closest('.msg')) t.style.display = 'none';
  }catch(err){ __swallow(err, "ui:app-04-i18n-state#14"); }
}, true);
/* v375: سجل المحادثات المحذوفة عمدًا — المزامنة ممنوعة ترجّعها أبدًا. */
function chatsDeletedIds(){
  try{ const a = JSON.parse(localStorage.getItem('aiapp_deleted_chats') || '[]'); return Array.isArray(a) ? a : []; }catch(e){ return []; }
}
window.chatsMarkDeleted = function(id){
  if(!id) return;
  try{
    const ids = chatsDeletedIds();
    if(ids.indexOf(id) === -1){
      ids.push(id);
      while(ids.length > 300) ids.shift();
      localStorage.setItem('aiapp_deleted_chats', JSON.stringify(ids));
    }
  }catch(e){ __swallow(e, "save:app-04-i18n-state#15"); }
};
/* v375: رفع فوري للسيرفر (بدون انتظار 4 ثواني) — يُستدعى بعد الحذف مباشرة. */
window.chatsServerSaveNow = function(){
  try{ clearTimeout(__chatsSyncTimer); }catch(e){ __swallow(e, "save:app-04-i18n-state#16"); }
  try{ chatsServerSave(); }catch(e){ __swallow(e, "sync:app-04-i18n-state#17"); }
};
/* v376: دمج نسخة السيرفر مع المحلي — دالة مشتركة يستخدمها
   الفتح + المزامنة الدورية + الدمج قبل كل رفع. ترجّع true إذا تغيّر شيء. */
function __chatsMergeServer(server, deletedIds){
  var hasServer = Array.isArray(server) && server.length > 0;
  var hasDeleted = Array.isArray(deletedIds) && deletedIds.length > 0;
  if(!hasServer && !hasDeleted) return false;
  // v383: بناء قائمة المحذوفات من السيرفر
  var delSet = Object.create(null);
  if(hasDeleted) for(var di=0; di<deletedIds.length; di++) delSet[deletedIds[di]] = 1;
  // v382: بصمة سريعة قبل الدمج — لو ما تغيّر شي نتجاوز إعادة الرسم
  var __fingerprint = function(list){
    var fp = '';
    for(var i=0; i<list.length; i++){
      var p = list[i];
      if(!p || !p.id) continue;
      var ml = Array.isArray(p.messages) ? p.messages.length : 0;
      fp += p.id + ':' + ml + ':' + (p.title||'') + ':' + (p.provider||'') + ';';
    }
    return fp;
  };
  var fpBefore = __fingerprint(state.projects);
  // v381c: بسّط — السيرفر هو المصدر الوحيد.
  const localById = Object.create(null);
  state.projects.forEach(p => { if(p && p.id) localById[p.id] = p; });
  const result = [];
  const seen = Object.create(null);
  server.forEach(sp => {
    if(!sp || !sp.id) return;
    seen[sp.id] = 1;
    const local = localById[sp.id];
    if(local){
      const lMsgs = Array.isArray(local.messages) ? local.messages : [];
      const sMsgs = Array.isArray(sp.messages) ? sp.messages : [];
      if(sMsgs.length > lMsgs.length){
        // v456: دمج ذكي — لو الرسالة المحلية فيها محتوى والسيرفر فاضي، نحتفظ بالمحلي
        const merged = sMsgs.map((sm, idx) => {
          const lm = lMsgs[idx];
          if(!lm) return sm;
          // لو المحلي فيه محتوى والسيرفر فاضي → خذ المحلي
          if(lm.content && (!sm.content || sm.content === '[media]')) return lm;
          // لو المحلي أطول بكثير → خذ المحلي (السيرفر مقصوص)
          if(lm.content && sm.content && lm.content.length > sm.content.length + 50) return lm;
          return sm;
        });
        local.messages = merged;
      }
      if(sp.title && !local.title) local.title = sp.title;
      if(sp.code && !local.code) local.code = sp.code;
      if(sp.provider && !local.provider) local.provider = sp.provider;
      result.push(local);
    } else {
      result.push(sp);
    }
  });
  state.projects.forEach(p => {
    if(p && p.id && !seen[p.id] && !delSet[p.id]) result.push(p);
  });
  state.projects = result;
  var fpAfter = __fingerprint(result);
  if(fpAfter === fpBefore){
    // v382: لا تغيير → لا إعادة رسم = لا وميض
    return false;
  }
  try{ saveState(); }catch(e){ __swallow(e, "save:app-04-i18n-state#18"); }
  try{ renderHistory(); }catch(e){ __swallow(e, "save:app-04-i18n-state#19"); }
  try{ if(typeof renderAll === 'function') renderAll(); }catch(e){ __swallow(e, "save:app-04-i18n-state#20"); }
  try{ if(typeof buildChatList === 'function') buildChatList(); }catch(e){ __swallow(e, "save:app-04-i18n-state#21"); }
  return true;
}
/* v376: تنزيل نسخة السيرفر ودمجها ثم استدعاء cb. */
function chatsServerPull(cb){
  const token = chatsAuthToken();
  if(!token){ if(cb) cb(); return; }
  fetch('/api/account?action=chats_load', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).then(r => {
    // v378: رد خطأ من السيرفر (500/429...) = فشل، مو قائمة فاضية.
    if(!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }).then(d => {
    const server = (d && Array.isArray(d.projects)) ? d.projects : [];
    const __deletedIds = (d && Array.isArray(d.deletedIds)) ? d.deletedIds : [];
    window.__chatsServerCount = server.length;
    try{
      var mergeResult = __chatsMergeServer(server, __deletedIds);
      window.__chatsMergeResult = mergeResult ? 'changed' : 'no-change';
      window.__chatsMergeErr = '';
    }catch(e){
      window.__chatsMergeErr = String(e && e.message || e).slice(0,60);
      window.__chatsMergeResult = 'ERROR';
    }
    window.__chatsLastPull = Date.now(); window.__chatsLastPullErr = '';
    if(cb) cb(true);
  }).catch(err => { window.__chatsLastPullErr = String(err && err.message || err).slice(0,40); if(cb) cb(false); });
}
function __chatsPushNow(){
  const token = chatsAuthToken();
  if(!token) return;
  const __slim = chatsSlimForServer();
  // v311: قائمة بلا أي رسالة = لا ترفع أبدًا (لا تمسح النسخة الاحتياطية).
  let __total = 0;
  try{ (__slim || []).forEach(p => { __total += (Array.isArray(p.messages) ? p.messages.length : 0); }); }catch(e){ __swallow(e, "misc:app-04-i18n-state#22"); }
  if(!__total) return;
  try{
    fetch('/api/account?action=chats_save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, projects: __slim }),
    }).then(r => {
      if(r && r.ok){ window.__chatsLastPush = Date.now(); window.__chatsLastPushErr = ''; }
      else { window.__chatsLastPushErr = 'http ' + (r ? r.status : '?'); }
    }).catch(err => { window.__chatsLastPushErr = String(err && err.message || err).slice(0,40); });
  }catch(e){ __swallow(e, "misc:app-04-i18n-state#23"); }
}
function chatsServerSave(){
  const token = chatsAuthToken();
  if(!token) return;
  // v378: البوابة الوحيدة = اكتمال تحميل المحادثات المحلية (IndexedDB) —
  // لو لسه ما اكتمل نعيد الجدولة بدل ما نمنع الرفع للأبد.
  if(!window.__localChatsLoaded){ scheduleChatsServerSync(); return; }
  // v376/v378: دمج قبل كل رفع — والرفع فقط بعد سحب "ناجح" حتى لا نكتب
  // فوق شغل جهاز آخر عند فشل الشبكة.
  chatsServerPull(ok => {
    if(ok === false){ scheduleChatsServerSync(); return; }
    window.__chatsMergeDone = true;
    try{ __chatsPushNow(); }catch(e){ __swallow(e, "sync:app-04-i18n-state#24"); }
  });
}
window.appFullCleanup = function(){
  var msg = 'سيتم حذف كل المحادثات والمشاريع نهائيًا. هل أنت متأكد؟';
  try{ var m = (typeof t === 'function') ? t('acctCleanupConfirm') : ''; if(m && m !== 'acctCleanupConfirm') msg = m; }catch(e){ __swallow(e, "misc:app-04-i18n-state#25"); }
  if(!confirm(msg)) return;
  try{ clearTimeout(__chatsSyncTimer); }catch(e){ __swallow(e, "sync:app-04-i18n-state#26"); }
  window.__chatsMergeDone = false;
  var token = '';
  try{ token = chatsAuthToken(); }catch(e){ __swallow(e, "sync:app-04-i18n-state#27"); }
  var finish = function(){
    try{ localStorage.removeItem('aiapp_projects'); }catch(e){ __swallow(e, "sync:app-04-i18n-state#28"); }
    try{ localStorage.removeItem('aiapp_current_id'); }catch(e){ __swallow(e, "misc:app-04-i18n-state#29"); }
    try{ localStorage.removeItem('aiapp_provider_projects'); }catch(e){ __swallow(e, "misc:app-04-i18n-state#30"); }
    try{ if(window.indexedDB) indexedDB.deleteDatabase('aiapp_db'); }catch(e){ __swallow(e, "save:app-04-i18n-state#31"); }
    setTimeout(function(){ location.reload(); }, 400);
  };
  if(token){
    fetch('/api/account?action=chats_wipe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(function(e){ window.__swallow && window.__swallow(e,'chats.wipe'); }).finally(finish);
  } else { finish(); }
};
function scheduleChatsServerSync(){
  if(!chatsAuthToken()) return;
  try{ clearTimeout(__chatsSyncTimer); }catch(e){ __swallow(e, "sync:app-04-i18n-state#32"); }
  __chatsSyncTimer = setTimeout(chatsServerSave, 4000);
}
window.chatsSyncOnAuth = function(){
  const token = chatsAuthToken();
  if(!token || __chatsLoadedFor === token) return;
  __chatsLoadedFor = token;
  // v378: ننتظر اكتمال تحميل IndexedDB "فعليًا" (ترتيب حتمي) بدل مهلة عمياء 1500ms.
  var __waited = 0;
  var __tick = function(){
    if(!window.__localChatsLoaded && __waited < 10000){ __waited += 200; setTimeout(__tick, 200); return; }
    chatsServerPull(ok => {
      // v378: فشل التنزيل (شبكة/خطأ سيرفر) → إعادة المحاولة تلقائيًا بعد 8 ثواني.
      if(ok === false){ __chatsLoadedFor = null; setTimeout(function(){ try{ window.chatsSyncOnAuth(); }catch(e){ __swallow(e, "sync:app-04-i18n-state#33"); } }, 8000); return; }
      // بعد أول دمج ناجح: يُسمح بالرفع + رفع نسخة موحّدة.
      window.__chatsMergeDone = true;
      scheduleChatsServerSync();
      // v376: مزامنة مستمرة — نفس الحساب = نفس المحادثات على كل الأجهزة.
      __chatsStartLiveSync();
    });
  };
  __tick();
};
/* v376: مزامنة حيّة — سحب دوري من السيرفر + كل ما يرجع المستخدم للتطبيق. */
var __chatsLivePollTimer = null;
var __chatsLastPull = 0;
function __chatsPullMerge(){
  if(!chatsAuthToken() || !window.__chatsMergeDone) return;
  __chatsLastPull = Date.now();
  try{ chatsServerPull(() => {}); }catch(e){ __swallow(e, "sync:app-04-i18n-state#34"); }
}
function __chatsStartLiveSync(){
  if(__chatsLivePollTimer) return;
  // سحب كل 20 ثانية طول ما التطبيق مفتوح وظاهر.
  __chatsLivePollTimer = setInterval(() => {
    if(document.visibilityState === 'visible') __chatsPullMerge();
  }, 20000);
  // رجوع للتطبيق (فتح تبويب/عودة من الخلفية) → سحب فوري مع تهدئة 5 ثواني.
  var onFocus = () => {
    if(document.visibilityState !== 'visible') return;
    if(Date.now() - __chatsLastPull < 5000) return;
    __chatsPullMerge();
  };
  try{ document.addEventListener('visibilitychange', onFocus); }catch(e){ __swallow(e, "sync:app-04-i18n-state#35"); }
  try{ window.addEventListener('focus', onFocus); }catch(e){ __swallow(e, "sync:app-04-i18n-state#36"); }
}

function getCurrent(){
  return state.projects.find(p => p.id === state.currentId);
}

// 🧹 v307: تنظيف الكود قبل إرساله للمزود — الصور المضمنة base64 (عدة ميغا)
// تُستبدل بعلامة قصيرة + سقف للحجم، حتى لا يتجاوز الطلب حد التوكنات ويفشل.
function codeForApi(code){
  let c = String(code || '');
  c = c.replace(/data:(image|audio|video)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]{200,}/g, 'data:image/png;base64,EMBEDDED_MEDIA_OMITTED');
  if(c.length > 300000) c = c.slice(0, 300000) + '\n<!-- … الكود طويل جدًا: تم اقتطاع الباقي … -->';
  return c;
}

function renderHistory(){
  historyEl.innerHTML = '';
  // 🆕 (27/7) كل مزود يشوف مشاريعه فقط — أي مشروع بلا وسم ينتمي للمزود الحالي
  const provKey = localStorage.getItem('aiapp_provider') || 'claude';
  let provDirty = false;
  state.projects.forEach(p => { if(!p.provider){ p.provider = provKey; provDirty = true; } });
  if(provDirty) saveState();
  // v380: القائمة تعرض كل المحادثات من كل المزودات — حساب واحد، قائمة وحدة.
  [...state.projects].reverse().forEach(p => {
    const div = document.createElement('div');
    div.className = 'hist-item' + (p.id === state.currentId ? ' active' : '');
    div.dataset.pid = String(p.id); // v-chat-search: يربط العنصر بمشروعه للبحث داخل المحتوى

    const thumb = document.createElement('div');
    thumb.className = 'hist-thumb';
    if(p.code && p.codeType !== 'python'){
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', '');
      iframe.setAttribute('loading', 'lazy');
      iframe.srcdoc = p.code;
      thumb.appendChild(iframe);
    } else {
      const ph = document.createElement('span');
      ph.className = 'hist-thumb-emoji';
      ph.innerHTML = p.codeType === 'python'
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
      thumb.appendChild(ph);
    }
    div.appendChild(thumb);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'hist-title';
    titleSpan.textContent = p.title;
    titleSpan.onclick = () => {
      // v380: الضغط على محادثة من مزود آخر → ينتقل لمزودها تلقائيًا (بدون إنشاء محادثة جديدة)
      try{
        const cur = localStorage.getItem('aiapp_provider') || 'claude';
        if(p.provider && p.provider !== cur){
          localStorage.setItem('aiapp_provider', p.provider);
          const sel = document.getElementById('provider');
          if(sel) sel.value = p.provider;
          let pm = {};
          try{ pm = JSON.parse(localStorage.getItem('aiapp_provider_projects') || '{}'); }catch(e){ __swallow(e, "save:app-04-i18n-state#37"); }
          pm[p.provider] = p.id;
          localStorage.setItem('aiapp_provider_projects', JSON.stringify(pm));
          if(typeof updateProviderQuickBarActive === 'function') updateProviderQuickBarActive();
        }
      }catch(e){ __swallow(e, "save:app-04-i18n-state#38"); }
      state.currentId = p.id; mahaClearImageRef(); renderAll();
    };
    div.appendChild(titleSpan);

    // v202: بدل أزرار الحذف/المشاركة الظاهرة — زر ⋮ صغير يفتح قائمة (إعادة تسمية / حذف / مشاركة)
    const menuBtn = document.createElement('button');
    menuBtn.className = 'hist-menu-btn';
    menuBtn.type = 'button';
    menuBtn.title = '';
    menuBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      openHistItemMenu(menuBtn, p, provKey);
    };
    div.appendChild(menuBtn);

    historyEl.appendChild(div);
  });
}

// v202: قائمة ⋮ الصغيرة لكل مشروع — إعادة تسمية / حذف (بتأكيد) / مشاركة
function ensureHistItemMenu(){
  let m = document.getElementById('histItemMenu');
  if(!m){
    m = document.createElement('div');
    m.id = 'histItemMenu';
    document.body.appendChild(m);
    document.addEventListener('click', (e) => {
      if(!e.target.closest('#histItemMenu') && !e.target.closest('.hist-menu-btn')) m.classList.remove('show');
    });
    window.addEventListener('resize', () => m.classList.remove('show'));
  }
  return m;
}
function histRenameProject(p){
  const isAr = (typeof lang === 'undefined' || !lang || lang === 'ar' || lang === 'ur');
  const nv = prompt(isAr ? 'الاسم الجديد للمشروع:' : 'New project name:', p.title);
  if(nv === null) return;
  const clean = String(nv).trim();
  if(!clean) return;
  p.title = clean;
  saveState();
  renderAll();
}
function histDeleteProject(p, provKey){
  if(!confirm(t('confirmDeleteProject').replace('{name}', p.title))) return;
  const __delId = p.id;
  try{ if(window.chatsMarkDeleted) chatsMarkDeleted(__delId); }catch(e){ __swallow(e, 'hist:delete#tombstone'); }
  state.projects = state.projects.filter(x => x.id !== __delId);
  if(state.currentId === __delId){
    const sameProv = state.projects.filter(x => (x.provider || provKey) === provKey);
    state.currentId = sameProv.length ? sameProv[sameProv.length - 1].id : null;
    mahaClearImageRef();
  }
  if(!state.currentId){
    const id = 'p_' + Date.now();
    state.projects.push({id, title: t('defaultProjectTitle'), messages: [], code: '', provider: provKey});
    state.currentId = id;
    mahaClearImageRef();
  }
  saveState();
  // v715: أخبر السيرفر بالحذف (tombstone) — بدونه تجيب المزامنة المحادثة راجعة
  try{
    const tok = (typeof chatsAuthToken === 'function') ? chatsAuthToken() : '';
    if(tok){
      fetch('/api/account?action=chats_delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok, ids: [__delId] }),
      }).catch(() => {});
    }
  }catch(e){ __swallow(e, 'hist:delete#server'); }
  renderAll();
}
function openHistItemMenu(anchorBtn, p, provKey){
  const m = ensureHistItemMenu();
  const isAr = (typeof lang === 'undefined' || !lang || lang === 'ar' || lang === 'ur');
  m.innerHTML = '';
  const mkBtn = (label, svg, cls, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    if(cls) b.className = cls;
    b.innerHTML = svg + '<span>' + label + '</span>';
    b.onclick = (e) => { e.stopPropagation(); m.classList.remove('show'); fn(); };
    m.appendChild(b);
  };
  const svgPre = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  mkBtn(isAr ? 'إعادة تسمية' : 'Rename',
    svgPre + '<path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"></path></svg>',
    '', () => histRenameProject(p));
  mkBtn(t('shareProjectBtnTitle') || (isAr ? 'مشاركة' : 'Share'),
    svgPre + '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
    '', () => { if(typeof openShareModal === 'function') openShareModal(p); });
  mkBtn(isAr ? 'حذف' : 'Delete',
    svgPre + '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
    'danger', () => histDeleteProject(p, provKey));
  // موضع القائمة بجانب زر ⋮ مع البقاء داخل الشاشة
  m.classList.add('show');
  const r = anchorBtn.getBoundingClientRect();
  const mw = m.offsetWidth || 140, mh = m.offsetHeight || 100;
  let left = document.documentElement.dir === 'rtl' ? r.left - mw + r.width : r.right - mw;
  left = Math.max(6, Math.min(left, window.innerWidth - mw - 6));
  let top = r.bottom + 4;
  if(top + mh > window.innerHeight - 6) top = Math.max(6, r.top - mh - 4);
  m.style.left = left + 'px';
  m.style.top = top + 'px';
}

// 🔀 محرك الفروقات — line diff بين كود المشروع الحالي وإصدار المزود
function computeLineDiff(oldText, newText){
  const a = String(oldText || '').split('\n');
  const b = String(newText || '').split('\n');
  const MAX = 2500;
  if(a.length > MAX || b.length > MAX){
    return null; // too large for in-browser LCS
  }
  // trim common prefix/suffix to shrink LCS matrix
  let start = 0;
  while(start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while(endA > start && endB > start && a[endA - 1] === b[endB - 1]){ endA--; endB--; }
  const ca = a.slice(start, endA), cb = b.slice(start, endB);
  const n = ca.length, mm = cb.length;
  const dp = new Uint16Array((n + 1) * (mm + 1));
  for(let i = n - 1; i >= 0; i--){
    for(let j = mm - 1; j >= 0; j--){
      dp[i * (mm + 1) + j] = ca[i] === cb[j]
        ? dp[(i + 1) * (mm + 1) + j + 1] + 1
        : Math.max(dp[(i + 1) * (mm + 1) + j], dp[i * (mm + 1) + j + 1]);
    }
  }
  const ops = [];
  for(let k = 0; k < start; k++) ops.push({ t: ' ', line: a[k] });
  let i = 0, j = 0;
  while(i < n && j < mm){
    if(ca[i] === cb[j]){ ops.push({ t: ' ', line: ca[i] }); i++; j++; }
    else if(dp[(i + 1) * (mm + 1) + j] >= dp[i * (mm + 1) + j + 1]){ ops.push({ t: '-', line: ca[i] }); i++; }
    else { ops.push({ t: '+', line: cb[j] }); j++; }
  }
  while(i < n){ ops.push({ t: '-', line: ca[i] }); i++; }
  while(j < mm){ ops.push({ t: '+', line: cb[j] }); j++; }
  for(let k = endA; k < a.length; k++) ops.push({ t: ' ', line: a[k] });
  return ops;
}
function showCodeDiff(oldCode, newCode, label){
  const isAr = (typeof lang === 'undefined' || !lang || lang === 'ar' || lang === 'ur');
  const ops = computeLineDiff(oldCode, newCode);
  let old = document.getElementById('diffOverlay');
  if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'diffOverlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:900; background:rgba(0,0,0,.75); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:16px;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#12151d; border-radius:14px; max-width:920px; width:100%; max-height:88vh; display:flex; flex-direction:column; overflow:hidden;';
  const added = ops ? ops.filter(o => o.t === '+').length : 0;
  const removed = ops ? ops.filter(o => o.t === '-').length : 0;
  const head = document.createElement('div');
  head.style.cssText = 'display:flex; align-items:center; gap:10px; padding:12px 16px; font-size:13px; font-weight:700;';
  head.innerHTML = '<span>🔀 ' + (isAr ? 'الفروقات' : 'Differences') + (label ? ' — ' + label : '') + '</span>'
    + '<span style="color:#2ecc71;">+' + added + '</span><span style="color:#ff5f56;">−' + removed + '</span>'
    + '<span style="flex:1;"></span>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✖';
  closeBtn.style.cssText = 'background:none; border:none; color:#fff; cursor:pointer; font-size:15px;';
  closeBtn.onclick = () => ov.remove();
  head.appendChild(closeBtn);
  box.appendChild(head);
  const body = document.createElement('div');
  body.style.cssText = 'overflow:auto; flex:1; padding:0 8px 12px; direction:ltr; font-family:monospace; font-size:12px; line-height:1.5; white-space:pre;';
  if(!ops){
    body.style.cssText += 'direction:rtl; font-family:inherit; padding:16px; white-space:normal;';
    body.textContent = isAr ? 'الكود كبير جدًا للمقارنة التفصيلية — الفروقات بالحجم: '
      + (String(newCode||'').length - String(oldCode||'').length) + ' حرف'
      : 'Code too large for a detailed diff.';
  } else {
    let shown = 0;
    let skipRun = 0;
    const flushSkip = () => {
      if(skipRun > 3){
        const gap = document.createElement('div');
        gap.style.cssText = 'color:#5a6070; padding:2px 8px;';
        gap.textContent = '··· ' + (skipRun) + ' ···';
        body.appendChild(gap);
      }
      skipRun = 0;
    };
    for(let k = 0; k < ops.length; k++){
      const o = ops[k];
      const nearChange = ops.slice(Math.max(0, k - 2), k + 3).some(x => x.t !== ' ');
      if(o.t === ' ' && !nearChange){ skipRun++; continue; }
      flushSkip();
      const row = document.createElement('div');
      row.textContent = (o.t === ' ' ? '  ' : o.t + ' ') + o.line;
      row.style.cssText = o.t === '+' ? 'background:rgba(46,204,113,.14); color:#7ee2a8;'
        : o.t === '-' ? 'background:rgba(255,95,86,.12); color:#ff9d97;' : 'color:#98a0b3;';
      body.appendChild(row);
      if(++shown > 1200){ const more = document.createElement('div'); more.textContent = '…'; body.appendChild(more); break; }
    }
    flushSkip();
    if(!added && !removed){
      body.style.cssText += 'direction:rtl; font-family:inherit; padding:16px; white-space:normal;';
      body.textContent = isAr ? 'لا توجد فروقات — الكودان متطابقان ✅' : 'No differences — identical ✅';
    }
  }
  box.appendChild(body);
  ov.appendChild(box);
  ov.onclick = (e) => { if(e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
/* ═══ v555 — بطاقات الخيارات داخل ردّ المساعد (معالج الكتالوج) ═══ */
function omranOptCss(){
  if(document.getElementById('omranOptCss')) return;
  const st = document.createElement('style');
  st.id = 'omranOptCss';
  st.textContent = '.omranOpts{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 2px;}'
    + '.omranOpt{padding:8px 14px;border-radius:14px;border:1px solid var(--border,rgba(255,255,255,.16));background:rgba(255,255,255,.05);color:var(--text,#eee);font:inherit;font-size:13.5px;cursor:pointer;transition:.15s;}'
    + '.omranOpt:hover{border-color:var(--accent2,#a78bfa);transform:translateY(-1px);}'
    + '.omranOpt.on{background:var(--accent2,#a78bfa);color:#fff;border-color:transparent;}'
    + '.omranOptDone{padding:8px 18px;border-radius:14px;border:0;background:linear-gradient(135deg,var(--accent2,#a78bfa),#06b6d4);color:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;}'
    + '.omranOptDone:disabled{opacity:.45;cursor:default;}';
  document.head.appendChild(st);
}
function omranExtractOptions(txt){
    if(!txt || txt.indexOf('[[') < 0) return null;
    const blocks = [];
    const source = String(txt);
    let clean = source.replace(/\[\[(OPT|MULTI)\]\]([\s\S]*?)\[\[\/(?:OPT|MULTI)\]\]/g, function(m, kind, body){
      const items = body.split('|').map(function(x){ return x.trim(); }).filter(Boolean);
      if(items.length) blocks.push({ multi: kind === 'MULTI', items: items.slice(0, 28) });
      return '';
    });
    // Accept the occasional malformed form: [[OPT:]] [one| [[OPT:]] [two]].
    // A reply must show usable buttons rather than raw model markup.
    if(!blocks.length){
      clean = source.replace(/\[\[(OPT|MULTI):\]\]\s*\[?([\s\S]*?)\]\](?=\s*$)/g, function(m, kind, body){
        const repeat = new RegExp('\\|\\s*\\[\\[' + kind + ':\\]\\]\\s*\\[?', 'g');
        const items = body.replace(repeat, '|').split('|').map(function(x){
          return x.replace(/^\s*\[|\]\s*$/g, '').trim();
        }).filter(Boolean);
        if(items.length) blocks.push({ multi: kind === 'MULTI', items: items.slice(0, 28) });
        return '';
      });
    }
    clean = clean.replace(/\n{3,}/g, '\n\n').trim();
    return blocks.length ? { text: clean, blocks: blocks } : null;
    }
function omranSendOption(val){
  const el = document.getElementById('prompt');
  if(!el || typeof sendPrompt !== 'function') return;
  el.value = val;
  try{ el.dispatchEvent(new Event('input', { bubbles: true })); }catch(e){ __swallow(e, "misc:app-04-i18n-state#opt"); }
  sendPrompt();
}
function omranRenderOptions(host, blocks){
  omranOptCss();
  blocks.forEach(function(b){
    const wrap = document.createElement('div');
    wrap.className = 'omranOpts';
    const picked = [];
    let doneBtn = null;
    b.items.forEach(function(label){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'omranOpt';
      btn.textContent = label;
      btn.onclick = function(){
        if(!b.multi){ omranSendOption(label); return; }
        const i = picked.indexOf(label);
        if(i < 0){ picked.push(label); btn.classList.add('on'); }
        else { picked.splice(i, 1); btn.classList.remove('on'); }
        if(doneBtn) doneBtn.disabled = !picked.length;
      };
      wrap.appendChild(btn);
    });
    if(b.multi){
      doneBtn = document.createElement('button');
      doneBtn.type = 'button';
      doneBtn.className = 'omranOptDone';
      doneBtn.disabled = true;
      doneBtn.textContent = ((localStorage.getItem('aiapp_lang') || 'ar') === 'ar') ? 'تمّ ✅' : 'Done ✅';
      doneBtn.onclick = function(){ if(picked.length) omranSendOption(picked.join('، ')); };
      wrap.appendChild(doneBtn);
    }
    host.appendChild(wrap);
  });
}
function renderMessages(keepScroll){
  const prevScrollTop = keepScroll ? messagesEl.scrollTop : null;
  messagesEl.innerHTML = '';
  const cur = getCurrent();
  const chipsWrap = $('#chatQuickChipsWrap');
  if(chipsWrap && cur && cur.messages && cur.messages.length) chipsWrap.style.display = 'none';
  if(!cur) return;
  let compareGroup = null;
  cur.expandedAskAllBatches = cur.expandedAskAllBatches || [];
  // ⚡ v320: نافذة عرض — نرسم آخر 30 رسالة فقط؛ الأقدم تظهر بزر عند الطلب.
  const __MSGWIN = 30;
  const __winStart = cur.__showAllMsgs ? 0 : Math.max(0, cur.messages.length - __MSGWIN);
  if(__winStart > 0){
    const __OLDT = { ar:'عرض الرسائل الأقدم', en:'Show older messages', fr:'Afficher les messages plus anciens', hi:'पुराने संदेश दिखाएँ', ur:'پرانے پیغامات دکھائیں', bn:'পুরনো বার্তা দেখান', ne:'पुराना सन्देशहरू देखाउनुहोस्', id:'Tampilkan pesan lama', fil:'Ipakita ang mga lumang mensahe', tr:'Eski mesajları göster', zh:'显示较早的消息', ru:'Показать старые сообщения', es:'Mostrar mensajes anteriores', ml:'പഴയ സന്ദേശങ്ങൾ കാണിക്കുക' };
    const __uiL = localStorage.getItem('aiapp_lang') || 'ar';
    const olderBtn = document.createElement('button');
    olderBtn.type = 'button';
    olderBtn.textContent = '⬆ ' + (__OLDT[__uiL] || __OLDT.en) + ' (' + __winStart + ')';
    olderBtn.style.cssText = 'display:block; margin:8px auto 14px; padding:7px 16px; border-radius:20px; border:1px solid var(--border,rgba(255,255,255,.15)); background:transparent; color:var(--accent2,#a78bfa); font-size:12.5px; cursor:pointer;';
    olderBtn.onclick = () => { cur.__showAllMsgs = true; renderMessages(false); };
    messagesEl.appendChild(olderBtn);
  }
  cur.messages.forEach((m, mIdx) => {
    if(mIdx < __winStart) return;
    // v463: فقط الردود المعلّمة askAllReply تدخل compare-row — الردود العادية تُعرض طبيعي
    const isAskAllReply = !!(m.askAllReply && m.providerLabel) && !m.isMergeHeader;
    if(m.askAllReply && !m.isMergeHeader && m.batchId && !cur.expandedAskAllBatches.includes(m.batchId) && cur.messages.some(x => x !== m && (x.isMergeHeader || x.isAskAllPrep) && x.batchId === m.batchId)){
      return; // individual per-provider replies stay hidden until the user expands them
    }
    let rowWrap = null;
    if(isAskAllReply){
      rowWrap = document.createElement('div');
      rowWrap.style.cssText = 'display:flex; align-items:flex-start; gap:6px; max-width:100%;';
    }
    const div = document.createElement('div');
    const _isLastUser = m.role === 'user' && mIdx === cur.messages.length - 1 && window.__userAnimUntil > Date.now();
    div.className = 'msg ' + (m.role === 'user' ? 'user' : 'assistant') + (_isLastUser ? ' msg-anim' : '');
    if(isAskAllReply) div.style.flex = '1 1 auto';
    let copyMsgBtn = null;
    let pColor = null;
    if(m.providerLabel){
      const label = document.createElement('div');
      pColor = getProviderColors()[m.providerLabel] || null;
      // v311: اسم المزود يظهر كامل داخل الشاشة بدون قص (سفاري الآيفون).
      label.style.cssText = 'font-size:11px; font-weight:700; color:' + (pColor || 'var(--accent2)') + '; margin-bottom:4px; display:block; unicode-bidi:isolate; max-width:100%; overflow-wrap:anywhere; white-space:normal;';
      /* v-prov-status-i18n: الاسم المحفوظ كان بلغة وقت التوليد — يُعاد حلّه بلغة
         الواجهة الحالية من providerKey عند العرض. */
      let __plbl = m.providerLabel;
      try{
        if(m.providerKey && typeof functionalLabel === 'function'){
          __plbl = (/^🔄\s*/.test(__plbl || '') ? '🔄 ' : '') + functionalLabel(m.providerKey);
        }
      }catch(e){ /* الاسم المحفوظ احتياط */ }
      label.textContent = __plbl;
      if(isAskAllReply) div.appendChild(label); // v464: اسم المزود يظهر في «اسأل الكل» فقط (أمر عمران: «أخفِ»)
    }
    const textDiv = document.createElement('div');
    textDiv.className = 'msg-text';
    if(pColor) textDiv.style.setProperty('--msg-accent', pColor);
    if(m._uid) textDiv.dataset.askuid = m._uid;
    if(m._loading && !m.content){
      const dots = document.createElement('span');
      dots.className = 'ask-all-typing-dots';
      dots.textContent = '⏳';
      textDiv.appendChild(dots);
    }
    // 🎨 رمز الصورة (__IMG_n__) عقدٌ بين النموذج والعميل لبناء المواقع — لا نصّ
    // يُقرأ. كان يُطبع خامًّا في الدردشة؛ الآن يصير صورةً ويُنزع من الكلام.
    let __mc = m.content, __genShown = null;
    // 🎬 v522: __ACTION_VIDEO: — رمز يُطلقه الذكاء الاصطناعي ليفتح صانع الفيديو تلقائياً
    if(m.role !== 'user' && typeof __mc === 'string' && __mc.indexOf('__ACTION_VIDEO:') !== -1){
      const __vidMatch = __mc.match(/__ACTION_VIDEO:\s*([^\n]+)/);
      if(__vidMatch){
        const __vidPrompt = (__vidMatch[1] || '').trim();
        __mc = __mc.replace(/__ACTION_VIDEO:\s*[^\n]*/g, '').replace(/\n{3,}/g, '\n\n').trim();
        if(__vidPrompt && mIdx === cur.messages.length - 1){
          setTimeout(function(){
            try{ if(typeof window.omranOpenVideoMaker === 'function') window.omranOpenVideoMaker(__vidPrompt); }catch(e){ try{ __swallow(e,'chat:video-open'); }catch(_){ /* guard-ok */ } }
          }, 800);
        }
      }
    }
    if(m.role !== 'user' && typeof __mc === 'string' && __mc.indexOf('__IMG_') !== -1){
      __genShown = [];
      __mc = __mc.replace(/!?\[[^\]]*\]\(\s*(__IMG_\d+__)\s*\)|`?(__IMG_\d+__)`?/g, (whole, a, b) => {
        const tok = a || b;
        // v735 — احتفظ بالصورة داخل الرسالة نفسها حتى بعد إعادة تعيين __genImages
        m._imgCache = m._imgCache || {};
        const url = m._imgCache[tok] || (window.__genImages || {})[tok];
        if(url) m._imgCache[tok] = url;
        if(!url) return '';
        if(__genShown.indexOf(url) === -1) __genShown.push(url);
        return '';
      }).replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if(!__mc && !__genShown.length) __mc = m.content;
    }
    // روابط خرائط Google لا تُعرض في المحادثة: الأماكن تظهر بأسمائها فقط.
    // يزيل ذلك أيضًا روابط محفوظة في ردود قديمة.
    if(m.role !== 'user' && typeof __mc === 'string'){
      const __mapUrlRe = /https?:\/\/(?:www\.)?(?:maps\.google\.[^\s)]+|google\.[^/\s)]+\/maps(?:[/?][^\s)]*)?)[^\s)]*/i;
      __mc = __mc.split('\n').filter(line => !__mapUrlRe.test(line)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    let msgWordEls = null;
    if(m.role !== 'user' && __mc){
      const __oOpt = omranExtractOptions(__mc);
      msgWordEls = buildSpokenWordSpans(textDiv, __oOpt ? __oOpt.text : __mc);
      if(__oOpt && mIdx === cur.messages.length - 1) omranRenderOptions(textDiv, __oOpt.blocks);
    } else {
      textDiv.textContent = __mc;
    }
    if(__genShown && __genShown.length){
      const genStrip = document.createElement('div');
      genStrip.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:6px 0';
      __genShown.slice(0, 4).forEach((url) => {
        const gimg = document.createElement('img');
        gimg.src = url; gimg.alt = ''; gimg.loading = 'lazy';
        gimg.style.cssText = 'max-width:min(100%,320px);border-radius:12px';
        gimg.onerror = () => { gimg.remove(); };
        if(window.__omranImgTools){ const gb = document.createElement('div'); gb.style.cssText = 'position:relative;display:inline-block;max-width:100%'; gb.appendChild(gimg); window.__omranImgTools(gb, url); genStrip.appendChild(gb); }
        else genStrip.appendChild(gimg);
      });
      div.appendChild(genStrip);
    }
    // 🖼️ Feature ② — image strip ABOVE the reply text: up to 4 live images
    // returned by the search backend, ChatGPT-style horizontal scroller.
    // 🖼️ v610 — أُعيد فتحه بأمر عمران: شريط الصور فوق الردّ مثل ChatGPT.
    // الصور تأتي من مزوّد البحث نفسه (Tavily، ومعه احتياطيّ Google CSE بـsafe=active).
    const SEARCH_IMG_ON = true;
    if(SEARCH_IMG_ON && m.role !== 'user' && Array.isArray(m.searchImages) && m.searchImages.length){
      const imgStrip = document.createElement('div');
      imgStrip.className = 'msgSearchImgStrip';
      m.searchImages.slice(0, 4).forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        img.alt = '';
        img.onerror = () => { img.remove(); };
        imgStrip.appendChild(img);
      });
      div.appendChild(imgStrip);
    }
    div.appendChild(textDiv);
    // AppGallery: وسم صريح للمحتوى المولّد بالذكاء الاصطناعي على كل ردّ مساعد.
    if(m.role !== 'user' && __mc){
      const aiTag = document.createElement('div');
      aiTag.className = 'aiGenTag';
      aiTag.textContent = lang === 'ar' ? '✨ محتوى مولّد بالذكاء الاصطناعي' : '✨ AI-generated content';
      aiTag.style.cssText = 'font-size:10px;opacity:.5;margin-top:6px;user-select:none;';
      div.appendChild(aiTag);
    }
    if(m.role !== 'user' && m._stopped && !document.documentElement.classList.contains('mobile-ui')){
      const stoppedNote = document.createElement('div');
      stoppedNote.className = 'msgStoppedNote';
      stoppedNote.textContent = lang === 'ar' ? 'تم إيقاف الرد' : 'Response stopped';
      div.appendChild(stoppedNote);
    }
    // 📚 اجمع الروابط المضمّنة في نص الرد + روابط المصادر في قائمة واحدة
    {
      // استخرج الروابط الخارجية من markdown المُعرَض واستبدلها بنص عادي
      const __inlineLinks = [];
      if(m.role !== 'user' && !m._loading){
        textDiv.querySelectorAll('a[href^="http"]').forEach(a => {
          const url = a.href || '';
          const title = a.textContent.trim() || url;
          if(url && title.length > 2 && !__inlineLinks.some(l => l.url === url)){
            __inlineLinks.push({ url, title });
          }
          // حوّل الرابط إلى نص بلا href حتى لا يتفرّق
          const span = document.createElement('span');
          span.className = 'msgInlineRef';
          span.textContent = a.textContent;
          a.parentNode.replaceChild(span, a);
        });
      }
      // ادمج الروابط: المصادر أولاً ثم الروابط المضمّنة (بلا تكرار)
       const __isMapUrl = (url) => /https?:\/\/(?:www\.)?(?:maps\.google\.[^\s)]+|google\.[^/\s)]+\/maps(?:[/?][^\s)]*)?)[^\s)]*/i.test(String(url || ''));
       const __srcBase = Array.isArray(m.sources) ? m.sources.filter(s => s && s.url && !__isMapUrl(s.url)) : [];
       const __srcExtra = __inlineLinks.filter(l => !__isMapUrl(l.url) && !__srcBase.some(s => s.url === l.url));
      const validSrcs = [...__srcBase, ...__srcExtra].slice(0, 15);

      if(validSrcs.length){
        // زر «المصادر» المدمج — يجمع كل الروابط في مكان واحد
        const btn = document.createElement('button');
        btn.className = 'msgSrcBtn';
        btn.type = 'button';
        // معاينة أيقونات (أول 3)
        const favStack = document.createElement('span');
        favStack.className = 'msgSrcFavs';
        validSrcs.slice(0, 3).forEach(s => {
          let host = ''; try{ host = new URL(s.url).hostname.replace(/^www\./, ''); }catch(_){ return; }
          const img = document.createElement('img');
          img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=32';
          img.alt = ''; img.loading = 'lazy'; img.onerror = () => img.remove();
          favStack.appendChild(img);
        });
        btn.appendChild(favStack);
        const lbl = document.createElement('span');
        lbl.className = 'msgSrcLabel';
        lbl.textContent = (lang === 'ar' ? 'المصادر' : 'Sources');
        btn.appendChild(lbl);
        const cnt = document.createElement('span');
        cnt.className = 'msgSrcCount';
        cnt.textContent = validSrcs.length;
        btn.appendChild(cnt);

        // قائمة منسدلة بكل الروابط
        const drop = document.createElement('div');
        drop.className = 'msgSrcDrop';
        drop.hidden = true;
        validSrcs.forEach(s => {
          let host = ''; try{ host = new URL(s.url).hostname.replace(/^www\./, ''); }catch(_){ return; }
          const row = document.createElement('a');
          row.className = 'msgSrcItem';
          row.href = s.url; row.target = '_blank'; row.rel = 'noopener noreferrer';
          const fav = document.createElement('img');
          fav.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=32';
          fav.alt = ''; fav.onerror = () => fav.remove();
          const info = document.createElement('span');
          info.className = 'msgSrcItemInfo';
          const title = document.createElement('span');
          title.className = 'msgSrcItemTitle';
          title.textContent = (s.title && /^(إنستغرام|تيك توك|إكس|يوتيوب|فيسبوك|سناب شات) · /.test(s.title)) ? s.title : (s.title || host);
          const domain = document.createElement('span');
          domain.className = 'msgSrcItemDomain';
          domain.textContent = host;
          info.appendChild(title); info.appendChild(domain);
          row.appendChild(fav); row.appendChild(info);
          drop.appendChild(row);
        });

        btn.onclick = (e) => {
          e.stopPropagation();
          const open = !drop.hidden;
          drop.hidden = open;
          btn.classList.toggle('msgSrcBtnOpen', !open);
          /* v-src-unclip: content-visibility (v-tap-fast) تقصّ ما يتدلى خارج
             حدود الرسالة — القائمة كانت تفتح مقصوصة غير مرئية. نرفع القصّ
             عن هذه الرسالة ما دامت القائمة مفتوحة. */
          const msgEl = btn.closest('.msg');
          if(msgEl) msgEl.style.contentVisibility = open ? '' : 'visible';
          if(!open){
            const close = (ev) => { if(!drop.contains(ev.target) && ev.target !== btn){ drop.hidden = true; btn.classList.remove('msgSrcBtnOpen'); if(msgEl) msgEl.style.contentVisibility = ''; document.removeEventListener('click', close); } };
            setTimeout(() => document.addEventListener('click', close), 10);
          }
        };

        const wrap = document.createElement('div');
        wrap.className = 'msgSrcWrap';
        wrap.appendChild(btn);
        wrap.appendChild(drop);
        div.appendChild(wrap);
      }
    }
    if(m.attachments && m.attachments.length){
      const wrap = document.createElement('div');
      wrap.className = 'msg-attachments';
      m.attachments.forEach(a => {
        if(a.isVideo && a.url){
          const vid = document.createElement('video');
          vid.src = a.url;
          vid.controls = true;
          vid.playsInline = true;
          vid.style.maxWidth = 'min(320px, 100%)';
          vid.style.borderRadius = '10px';
          wrap.appendChild(vid);
          const dl = document.createElement('a');
          dl.href = a.url;
          dl.download = a.name || 'video.mp4';
          dl.target = '_blank';
          dl.className = 'file-chip';
          dl.textContent = '⬇️ ' + (lang === 'ar' ? 'تنزيل الفيديو' : 'Download video');
          dl.style.textDecoration = 'none';
          dl.style.alignSelf = 'center';
          wrap.appendChild(dl);
        } else if(a.isImage && a.purged){
          const chip = document.createElement('div');
          chip.className = 'file-chip';
          chip.textContent = '🗑️ ' + t('imagePurgedNote');
          wrap.appendChild(chip);
        } else if(a.isImage){
          const img = document.createElement('img');
          img.src = a.dataUrl;
          img.title = a.name;
          img.style.cursor = 'pointer';
          // v531: صور المساعد مولَّدة ⇒ تُعرض كبيرة. مرفقات المستخدم تبقى رقاقات صغيرة.
          if(m.role !== 'user' && !a._fromMemory) img.classList.add('genImg');
          img.onclick = () => {
            previewFrame.style.display = 'block';
            $('#pyConsole').style.display = 'none';
            emptyState.style.display = 'none';
            previewFrame._imageView = true;
            previewFrame._lastSrc = null;
            previewFrame.srcdoc = '<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="' + a.dataUrl + '" style="max-width:100%;max-height:100vh;object-fit:contain;"></body></html>';
            switchWorkTab('preview');
            closeDrawers();
            if(localStorage.getItem('previewEnabled') !== 'off'){
              workareaEl.classList.add('open');
              backdropEl.classList.add('show');
            }
          };
          if(m.role !== 'user' && !a._fromMemory && window.__omranImgTools){
            const ibox = document.createElement('div');
            ibox.style.cssText = 'position:relative;display:block;min-width:0;width:fit-content;max-width:min(460px,100%)';
            ibox.appendChild(img); window.__omranImgTools(ibox, a.dataUrl); wrap.appendChild(ibox);
          } else wrap.appendChild(img);
        } else {
          const chip = document.createElement('div');
          chip.className = 'file-chip';
          chip.textContent = '📄 ' + a.name;
          if(a.text){
            chip.style.cursor = 'pointer';
            chip.title = a.name;
            chip.onclick = () => {
              previewFrame.style.display = 'block';
              $('#pyConsole').style.display = 'none';
              emptyState.style.display = 'none';
              const esc = (a.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
              previewFrame.srcdoc = '<html><body style="margin:0;background:#111;color:#eee;font-family:monospace;white-space:pre-wrap;word-break:break-word;padding:16px;">' + esc + '</body></html>';
              switchWorkTab('preview');
              closeDrawers();
              if(localStorage.getItem('previewEnabled') !== 'off'){
                workareaEl.classList.add('open');
                backdropEl.classList.add('show');
              }
            };
          }
          wrap.appendChild(chip);
        }
      });
      div.appendChild(wrap);
    }
    if((m.content && m.content.trim()) || (m.role !== 'user' && m.attachments && m.attachments.some(a => a && (a.isImage || a.isVideo)))){ // v669: الأيقونات تظهر تحت الصور حتى بلا نص
      const actionBar = document.createElement('div');
      actionBar.className = 'msgActionBar';
      const copyIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
      const checkIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      if(m.role !== 'user'){
        // ↻ إعادة توليد آخر الدور من سؤال المستخدم نفسه — بلا فقاعة مكررة.
        if(!document.documentElement.classList.contains('mobile-ui') && !m._loading && !m.askAllReply && !m.isAskAllPrep){
          const retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.title = lang === 'ar' ? 'إعادة توليد الرد' : 'Regenerate response';
          retryBtn.setAttribute('aria-label', retryBtn.title);
          retryBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M6.1 9a7 7 0 0 1 11.5-2.6L20 9"></path><path d="M17.9 15a7 7 0 0 1-11.5 2.6L4 15"></path></svg>';
          retryBtn.onclick = () => { if(window.chatRegenerateMessage) window.chatRegenerateMessage(mIdx); };
          actionBar.appendChild(retryBtn);
        }
        // ⋮ more (convert) menu
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.title = t('moreOptionsTitle') || 'خيارات إضافية';
        moreBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';
        moreBtn.onclick = (e) => { e.stopPropagation(); openMsgMoreMenu(moreBtn, m.content); };
        actionBar.appendChild(moreBtn);

        // 🔗 v631 — أمر عمران: زرّ مشاركة الرسالة محذوف (الإرسال كان رابطًا لا محتوى).

        // 🔊 listen — exact existing speakSmart logic, icon-based
        const speakIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>';
        const stopSpeakIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1.5"></rect></svg>';
        const speakBtn = document.createElement('button');
        speakBtn.type = 'button';
        speakBtn.title = t('speakBtn') || 'استماع';
        speakBtn.innerHTML = speakIconSVG;
        speakBtn.onclick = () => {
          if(speakBtn._speaking){
            stopAllSpeaking();
            speakBtn.innerHTML = speakIconSVG;
            speakBtn.style.color = '';
            speakBtn._speaking = false;
            return;
          }
          speakBtn._speaking = true;
          speakBtn.innerHTML = stopSpeakIconSVG;
          speakBtn.style.color = 'var(--accent2,#00e0b8)';
          speakSmart(m.content, null, () => { speakBtn.innerHTML = speakIconSVG; speakBtn.style.color = ''; speakBtn._speaking = false; }, true, msgWordEls);
        };
        actionBar.appendChild(speakBtn);

        // 👎 / 👍 feedback (mutually exclusive, in-memory only)
        const thumbDownIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>';
        const thumbUpIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>';
        const thumbDownBtn = document.createElement('button');
        thumbDownBtn.type = 'button';
        thumbDownBtn.title = t('thumbDownTitle') || 'غير مفيد';
        thumbDownBtn.innerHTML = thumbDownIconSVG;
        const thumbUpBtn = document.createElement('button');
        thumbUpBtn.type = 'button';
        thumbUpBtn.title = t('thumbUpTitle') || 'مفيد';
        thumbUpBtn.innerHTML = thumbUpIconSVG;
        thumbDownBtn.onclick = () => {
          m._feedback = m._feedback === 'down' ? null : 'down';
          thumbDownBtn.classList.toggle('msgThumbDownActive', m._feedback === 'down');
          thumbUpBtn.classList.remove('msgThumbActive');
        };
        thumbUpBtn.onclick = () => {
          m._feedback = m._feedback === 'up' ? null : 'up';
          thumbUpBtn.classList.toggle('msgThumbActive', m._feedback === 'up');
          thumbDownBtn.classList.remove('msgThumbDownActive');
        };
        if(m._feedback === 'down') thumbDownBtn.classList.add('msgThumbDownActive');
        if(m._feedback === 'up') thumbUpBtn.classList.add('msgThumbActive');
        actionBar.appendChild(thumbDownBtn);
        actionBar.appendChild(thumbUpBtn);

        // 🚩 report inappropriate AI content (Store policy 11.16)
        const flagIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>';
        const reportBtn = document.createElement('button');
        reportBtn.type = 'button';
        reportBtn.title = t('reportMsgTitle') || 'الإبلاغ عن محتوى غير لائق';
        reportBtn.innerHTML = flagIconSVG;
        reportBtn.onclick = async () => {
          if(reportBtn._done) return;
          if(!confirm(t('reportConfirm') || 'هل تريد الإبلاغ عن هذا الرد كمحتوى غير لائق؟')) return;
          reportBtn._done = true;
          reportBtn.style.color = '#ff5c6c';
          try{
            let u='guest'; try{ u = (typeof authGet==='function'&&authGet('aiapp_username'))||'guest'; }catch(_){ __swallow(_, "ui:app-04-i18n-state#39"); }
            fetch('/api/system?action=feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'report',content:String(m.content||'').slice(0,2000),provider:(m.provider||''),user:u,lang:(typeof lang!=='undefined'?lang:'')})});
          }catch(e){ /* ignore */ }
          if(typeof settingsToast === 'function') settingsToast(t('reportSentToast') || 'تم استلام البلاغ — شكرًا لك');
        };
        actionBar.appendChild(reportBtn);

        // ✨ v631 — أمر عمران: أيقونة «شنو أقدر أسوي» محذوفة من شريط الرسالة.
      } else if(!document.documentElement.classList.contains('mobile-ui')){
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.title = lang === 'ar' ? 'تعديل الرسالة' : 'Edit message';
        editBtn.setAttribute('aria-label', editBtn.title);
        editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"></path></svg>';
        editBtn.onclick = () => { if(window.chatStartEditMessage) window.chatStartEditMessage(mIdx); };
        actionBar.appendChild(editBtn);
      }

      // v204 fix: this used to be built directly into the `copyMsgBtn`
      // variable, which was then REASSIGNED a few lines below to the whole
      // `actionBar` (so it could be appended alongside the message bubble).
      // Because the onclick/onmouseenter/onmouseleave closures below
      // captured that same variable by reference (not by value), by the
      // time the user actually clicked, `copyMsgBtn` inside the closures
      // pointed at `actionBar`, not the button — so
      // `copyMsgBtn.innerHTML = checkIconSVG` wiped out the ENTIRE action
      // bar's HTML (all buttons for that message, i.e. the whole message's
      // action row) instead of just swapping the copy icon. Using a
      // dedicated `copyBtnEl` for the button itself (never reassigned)
      // fixes this: only the copy icon markup ever changes, nothing else
      // in the DOM is touched.
      const copyBtnEl = document.createElement('button');
      copyBtnEl.type = 'button';
      copyBtnEl.onmouseenter = () => { copyBtnEl.style.color = 'var(--accent2,#00e0b8)'; };
      copyBtnEl.onmouseleave = () => { copyBtnEl.style.color = 'var(--muted,#98a0b3)'; };
      copyBtnEl.innerHTML = copyIconSVG;
      copyBtnEl.title = t('copyMsgTitle') || 'نسخ';
      copyBtnEl.onclick = async (e) => {
        e.stopPropagation();
        try{
          try{
            await navigator.clipboard.writeText(m.content);
          }catch(e1){
            const ta = document.createElement('textarea');
            ta.value = m.content;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
          }
          copyBtnEl.innerHTML = checkIconSVG;
          setTimeout(() => { copyBtnEl.innerHTML = copyIconSVG; }, 1500);
        }catch(e2){ /* never let a copy failure affect the rest of the UI */ }
      };
      actionBar.appendChild(copyBtnEl);
      // زر النسخ يبقى تحت رسالة المستخدم على الجوال؛ بقية الإجراءات لا تظهر
      // للمستخدم هناك، لذلك لا يعود الشريط طافيًا أو مزدحمًا.
      copyMsgBtn = actionBar;
    }
    if(m.code && m.providerLabel){
      const isActive = cur.code === m.code;
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.cssText = 'margin-top:8px; margin-inline-end:8px; font-size:12px; padding:6px 12px;' + (isActive ? ' opacity:.85;' : '');
      btn.textContent = isActive ? '✅ ' + t('useThisVersion') : t('useThisVersion');
      btn.onclick = () => {
        cur.code = m.code;
        cur.codeType = m.codeType;
        saveState();
        renderAll(true);
        if(window.innerWidth <= 860 && localStorage.getItem('previewEnabled') !== 'off'){
          switchWorkTab('preview');
          setTimeout(() => openDrawer($('#workarea')), 200);
        }
      };
      div.appendChild(btn);
      // 🔀 زر الفروقات — أُزيل بطلب المستخدم
    }
    if(m.isMergeHeader && m.batchId && m.batchCount){
      const expanded = cur.expandedAskAllBatches.includes(m.batchId);
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn';
      toggleBtn.style.cssText = 'margin-top:8px; font-size:12px; padding:6px 12px;';
      toggleBtn.textContent = '📋 ' + t('viewIndividualReplies').replace('{n}', m.batchCount);
      toggleBtn.onclick = () => {
        const pos = cur.expandedAskAllBatches.indexOf(m.batchId);
        if(pos === -1) cur.expandedAskAllBatches.push(m.batchId);
        else cur.expandedAskAllBatches.splice(pos, 1);
        saveState();
        renderMessages(true);
      };
      div.appendChild(toggleBtn);
      void expanded;
    }
    if(isAskAllReply){
      const providerFailed = !m.code && /^⚠️/.test(m.content || '');
      // 🔑 المفتاح مخزّن داخل الرسالة نفسها (m.providerKey) — مطابقة الاسم كانت
      // تفشل بصمت مع فقاعات البديل «🔄 …» فيصير زر ✅ بلا مفعول.
      const __cleanLbl = String(m.providerLabel || '').replace(/^🔄\s*/, '');
      const providerKey = m.providerKey || Object.keys(PROVIDER_KEY_LABELS).find(k => PROVIDER_KEY_LABELS[k] === __cleanLbl);
      if(!cur.continueProviders) cur.continueProviders = [];
      const isChosen = providerKey && cur.continueProviders.includes(providerKey);
      const chooseBtn = document.createElement('button');
      chooseBtn.className = 'btn';
      chooseBtn.title = t('continueWithProvider');
      chooseBtn.setAttribute('aria-label', t('continueWithProvider'));
      chooseBtn.style.cssText = 'flex:0 0 auto; align-self:flex-start; margin-top:4px; width:30px; height:30px; border-radius:50%; padding:0; font-size:15px; line-height:1; display:flex; align-items:center; justify-content:center;' + (isChosen ? ' background:var(--accent2,#2ecc71); color:#fff; border-color:var(--accent2,#2ecc71);' : ' opacity:.55;');
      chooseBtn.textContent = isChosen ? '✅' : '○';
      chooseBtn.onclick = () => {
        if(!cur.continueProviders) cur.continueProviders = [];
        const pos = providerKey ? cur.continueProviders.indexOf(providerKey) : -1;
        if(pos === -1){
          if(providerKey) cur.continueProviders.push(providerKey);
          if(m.code){ cur.code = m.code; cur.codeType = m.codeType; }
          // اختيار مزود ✅ = المستخدم يريد الاستمرار معه → أطفئ زر 🧠 «اسأل الكل».
          if(window.__resetAskAllToggle) window.__resetAskAllToggle();
        } else {
          cur.continueProviders.splice(pos, 1);
        }
        saveState();
        renderAll(true);
        // v204: removed the "✅ أسئلتك القادمة ستذهب إلى: ... فقط" toast
        // entirely per spec — provider switching itself is unchanged, only
        // the confirmation popup is gone.
      };
      if(copyMsgBtn){
        const bubbleCol = document.createElement('div');
        bubbleCol.style.cssText = 'display:flex; flex-direction:column; align-items:' + (m.role === 'user' ? 'flex-end' : 'flex-start') + '; flex:1 1 auto; min-width:0;';
        bubbleCol.appendChild(div);
        bubbleCol.appendChild(copyMsgBtn);
        rowWrap.appendChild(bubbleCol);
      } else {
        rowWrap.appendChild(div);
      }
      // v208: أيقونة اختيار المزود ○/✅ أُزيلت نهائيًا — شريط المزودات يغني عنها
      void providerFailed; void chooseBtn;
      if(!compareGroup){
        const layout = localStorage.getItem('askAllLayout') || 'horizontal';
        compareGroup = document.createElement('div');
        compareGroup.className = 'ask-all-compare-row';
        if(layout === 'vertical'){
          compareGroup.style.cssText = 'display:flex; flex-direction:column; gap:10px; max-width:100%; padding-bottom:6px; align-items:stretch;';
        } else {
          compareGroup.style.cssText = 'display:flex; gap:10px; overflow-x:auto; max-width:100%; padding-bottom:6px; align-items:flex-start; scroll-snap-type:x proximity;';
        }
        messagesEl.appendChild(compareGroup);
      }
      const layoutNow = localStorage.getItem('askAllLayout') || 'horizontal';
      if(layoutNow === 'vertical'){
        rowWrap.style.cssText += ' width:100%; max-width:100%;';
      } else {
        rowWrap.style.cssText += ' min-width:260px; max-width:340px; flex:1 0 260px; scroll-snap-align:start;';
      }
      compareGroup.appendChild(rowWrap);
    } else {
      compareGroup = null;
      if(copyMsgBtn){
        const bubbleCol = document.createElement('div');
        bubbleCol.style.cssText = 'display:flex; flex-direction:column; align-items:' + (m.role === 'user' ? 'flex-end' : 'flex-start') + '; max-width:100%;';
        bubbleCol.appendChild(div);
        bubbleCol.appendChild(copyMsgBtn);
        // ✨ v363: ملاحظة تلقائية آخر الرد تقترح الميزة المناسبة من رسالة المستخدم السابقة
        try{
          if(m.role !== 'user' && m.content && m.content.trim() && !m.code &&
             !(m.attachments && m.attachments.some(a => a && (a.isImage || a.isVideo)))){
            let __prevU = '';
            for(let __j = mIdx - 1; __j >= 0; __j--){
              if(cur.messages[__j] && cur.messages[__j].role === 'user'){ __prevU = String(cur.messages[__j].content || ''); break; }
            }
            const __hint = capabilityHintFor(__prevU);
            if(__hint){
              const __isEn = (typeof lang!=='undefined' && lang==='en');
              const __note = document.createElement('div');
              __note.style.cssText = 'font-size:12px; color:var(--muted,#98a0b3); margin-top:6px; line-height:1.7; max-width:100%;';
              const __lbl = __isEn ? __hint.en : __hint.ar;
              __note.appendChild(document.createTextNode('💡 ' + (__isEn ? 'Note: you can do this with ' : 'ملاحظة: تقدر تسوي هذا عن طريق ')));
              const __a = document.createElement('a');
              __a.textContent = __hint.icon + ' ' + __lbl;
              __a.href = 'javascript:void(0)';
              __a.style.cssText = 'color:var(--accent2,#a78bfa); text-decoration:none; font-weight:500; cursor:pointer;';
              __a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openFeatureById(__hint.id); };
              __note.appendChild(__a);
              bubbleCol.appendChild(__note);
            }
          }
        }catch(__e){ __swallow(__e, "misc:app-04-i18n-state#40"); }
        messagesEl.appendChild(bubbleCol);
      } else {
        messagesEl.appendChild(div);
      }
    }
  });
  if(keepScroll){
    messagesEl.scrollTop = prevScrollTop;
  } else {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  try{ if(typeof syncChatJumpButton === 'function') syncChatJumpButton(); }catch(e){ __swallow(e, "ui:chatJump"); }
  // v462: أنيميشن رسالة المستخدم — CSS class msg-anim يضاف أثناء بناء العنصر (سطر 973)
}
