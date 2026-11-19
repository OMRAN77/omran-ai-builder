/* عملات الدول — محرّك مشترك.
   الجدول والدوال منقولة حرفيًّا من pricing.html (v5): sha256(RAW)=42885871581a206a
   الواجهة: window.OmranCur.mount(rootEl, selectEl) */
(function () {
  if (window.OmranCur) return;

  var RAW = `
AE|الإمارات|🇦🇪|AED|د.إ|3.6725|الخليج والعالم العربي
SA|السعودية|🇸🇦|SAR|ر.س|3.75|الخليج والعالم العربي
KW|الكويت|🇰🇼|KWD|د.ك|0.307|الخليج والعالم العربي
QA|قطر|🇶🇦|QAR|ر.ق|3.64|الخليج والعالم العربي
BH|البحرين|🇧🇭|BHD|د.ب|0.376|الخليج والعالم العربي
OM|عُمان|🇴🇲|OMR|ر.ع|0.3845|الخليج والعالم العربي
JO|الأردن|🇯🇴|JOD|د.أ|0.709|الخليج والعالم العربي
EG|مصر|🇪🇬|EGP|ج.م|48.5|الخليج والعالم العربي
MA|المغرب|🇲🇦|MAD|د.م|9.9|الخليج والعالم العربي
DZ|الجزائر|🇩🇿|USD|$|1|الخليج والعالم العربي
TN|تونس|🇹🇳|TND|د.ت|3.12|الخليج والعالم العربي
LY|ليبيا|🇱🇾|LYD|د.ل|4.85|الخليج والعالم العربي
IQ|العراق|🇮🇶|USD|$|1|الخليج والعالم العربي
SD|السودان|🇸🇩|USD|$|1|الخليج والعالم العربي
SY|سوريا|🇸🇾|USD|$|1|الخليج والعالم العربي
YE|اليمن|🇾🇪|USD|$|1|الخليج والعالم العربي
LB|لبنان|🇱🇧|USD|$|1|الخليج والعالم العربي
PS|فلسطين|🇵🇸|ILS|₪|3.70|الخليج والعالم العربي
MR|موريتانيا|🇲🇷|MRU|أوقية|39.8|الخليج والعالم العربي
SO|الصومال|🇸🇴|USD|$|1|الخليج والعالم العربي
DJ|جيبوتي|🇩🇯|USD|$|1|الخليج والعالم العربي
KM|جزر القمر|🇰🇲|USD|$|1|الخليج والعالم العربي
US|الولايات المتحدة|🇺🇸|USD|$|1|الأمريكتان
CA|كندا|🇨🇦|CAD|C$|1.39|الأمريكتان
MX|المكسيك|🇲🇽|MXN|MX$|20.2|الأمريكتان
BR|البرازيل|🇧🇷|BRL|R$|5.78|الأمريكتان
AR|الأرجنتين|🇦🇷|USD|$|1|الأمريكتان
CL|تشيلي|🇨🇱|USD|$|1|الأمريكتان
CO|كولومبيا|🇨🇴|USD|$|1|الأمريكتان
PE|بيرو|🇵🇪|PEN|S/|3.78|الأمريكتان
UY|أوروغواي|🇺🇾|UYU|$U|42.5|الأمريكتان
PY|باراغواي|🇵🇾|USD|$|1|الأمريكتان
BO|بوليفيا|🇧🇴|BOB|Bs|6.91|الأمريكتان
VE|فنزويلا|🇻🇪|VES|Bs|45|الأمريكتان
EC|الإكوادور|🇪🇨|USD|$|1|الأمريكتان
PA|بنما|🇵🇦|USD|$|1|الأمريكتان
SV|السلفادور|🇸🇻|USD|$|1|الأمريكتان
GT|غواتيمالا|🇬🇹|GTQ|Q|7.72|الأمريكتان
CR|كوستاريكا|🇨🇷|USD|$|1|الأمريكتان
HN|هندوراس|🇭🇳|HNL|L|25.3|الأمريكتان
NI|نيكاراغوا|🇳🇮|NIO|C$|36.8|الأمريكتان
DO|الدومينيكان|🇩🇴|DOP|RD$|60.5|الأمريكتان
JM|جامايكا|🇯🇲|USD|$|1|الأمريكتان
TT|ترينيداد وتوباغو|🇹🇹|TTD|TT$|6.80|الأمريكتان
HT|هايتي|🇭🇹|USD|$|1|الأمريكتان
GY|غيانا|🇬🇾|USD|$|1|الأمريكتان
BS|الباهاما|🇧🇸|BSD|B$|1|الأمريكتان
DE|ألمانيا|🇩🇪|EUR|€|0.92|أوروبا
FR|فرنسا|🇫🇷|EUR|€|0.92|أوروبا
IT|إيطاليا|🇮🇹|EUR|€|0.92|أوروبا
ES|إسبانيا|🇪🇸|EUR|€|0.92|أوروبا
NL|هولندا|🇳🇱|EUR|€|0.92|أوروبا
BE|بلجيكا|🇧🇪|EUR|€|0.92|أوروبا
AT|النمسا|🇦🇹|EUR|€|0.92|أوروبا
PT|البرتغال|🇵🇹|EUR|€|0.92|أوروبا
IE|أيرلندا|🇮🇪|EUR|€|0.92|أوروبا
GR|اليونان|🇬🇷|EUR|€|0.92|أوروبا
FI|فنلندا|🇫🇮|EUR|€|0.92|أوروبا
LU|لوكسمبورغ|🇱🇺|EUR|€|0.92|أوروبا
CY|قبرص|🇨🇾|EUR|€|0.92|أوروبا
MT|مالطا|🇲🇹|EUR|€|0.92|أوروبا
SK|سلوفاكيا|🇸🇰|EUR|€|0.92|أوروبا
SI|سلوفينيا|🇸🇮|EUR|€|0.92|أوروبا
EE|إستونيا|🇪🇪|EUR|€|0.92|أوروبا
LV|لاتفيا|🇱🇻|EUR|€|0.92|أوروبا
LT|ليتوانيا|🇱🇹|EUR|€|0.92|أوروبا
HR|كرواتيا|🇭🇷|EUR|€|0.92|أوروبا
GB|بريطانيا|🇬🇧|GBP|£|0.79|أوروبا
CH|سويسرا|🇨🇭|CHF|Fr|0.88|أوروبا
SE|السويد|🇸🇪|SEK|kr|10.9|أوروبا
NO|النرويج|🇳🇴|NOK|kr|11.0|أوروبا
DK|الدنمارك|🇩🇰|DKK|kr|6.87|أوروبا
PL|بولندا|🇵🇱|PLN|zł|4.05|أوروبا
CZ|التشيك|🇨🇿|CZK|Kč|23.4|أوروبا
HU|المجر|🇭🇺|USD|$|1|أوروبا
RO|رومانيا|🇷🇴|RON|lei|4.58|أوروبا
BG|بلغاريا|🇧🇬|BGN|лв|1.80|أوروبا
RS|صربيا|🇷🇸|USD|$|1|أوروبا
UA|أوكرانيا|🇺🇦|UAH|₴|41.5|أوروبا
TR|تركيا|🇹🇷|TRY|₺|34.5|أوروبا
IS|آيسلندا|🇮🇸|USD|$|1|أوروبا
AL|ألبانيا|🇦🇱|ALL|L|92|أوروبا
BA|البوسنة والهرسك|🇧🇦|BAM|KM|1.80|أوروبا
MK|مقدونيا الشمالية|🇲🇰|MKD|ден|57|أوروبا
MD|مولدوفا|🇲🇩|MDL|L|17.9|أوروبا
GE|جورجيا|🇬🇪|GEL|₾|2.72|أوروبا
AM|أرمينيا|🇦🇲|USD|$|1|أوروبا
AZ|أذربيجان|🇦🇿|AZN|₼|1.70|أوروبا
RU|روسيا|🇷🇺|RUB|₽|92|أوروبا
IN|الهند|🇮🇳|INR|₹|84|آسيا
PK|باكستان|🇵🇰|USD|$|1|آسيا
BD|بنغلاديش|🇧🇩|USD|$|1|آسيا
LK|سريلانكا|🇱🇰|USD|$|1|آسيا
NP|نيبال|🇳🇵|USD|$|1|آسيا
MV|المالديف|🇲🇻|MVR|Rf|15.4|آسيا
CN|الصين|🇨🇳|CNY|¥|7.15|آسيا
JP|اليابان|🇯🇵|USD|$|1|آسيا
KR|كوريا الجنوبية|🇰🇷|USD|$|1|آسيا
TW|تايوان|🇹🇼|TWD|NT$|32.5|آسيا
HK|هونغ كونغ|🇭🇰|HKD|HK$|7.79|آسيا
SG|سنغافورة|🇸🇬|SGD|S$|1.34|آسيا
MY|ماليزيا|🇲🇾|MYR|RM|4.42|آسيا
ID|إندونيسيا|🇮🇩|USD|$|1|آسيا
TH|تايلاند|🇹🇭|THB|฿|34.3|آسيا
VN|فيتنام|🇻🇳|USD|$|1|آسيا
PH|الفلبين|🇵🇭|PHP|₱|58.5|آسيا
KH|كمبوديا|🇰🇭|USD|$|1|آسيا
MM|ميانمار|🇲🇲|USD|$|1|آسيا
LA|لاوس|🇱🇦|USD|$|1|آسيا
BN|بروناي|🇧🇳|BND|B$|1.34|آسيا
MN|منغوليا|🇲🇳|USD|$|1|آسيا
KZ|كازاخستان|🇰🇿|USD|$|1|آسيا
UZ|أوزبكستان|🇺🇿|USD|$|1|آسيا
KG|قيرغيزستان|🇰🇬|KGS|с|86|آسيا
TJ|طاجيكستان|🇹🇯|TJS|SM|10.9|آسيا
TM|تركمانستان|🇹🇲|TMT|m|3.50|آسيا
AF|أفغانستان|🇦🇫|AFN|؋|68|آسيا
ZA|جنوب أفريقيا|🇿🇦|ZAR|R|17.8|أفريقيا
NG|نيجيريا|🇳🇬|USD|$|1|أفريقيا
KE|كينيا|🇰🇪|USD|$|1|أفريقيا
GH|غانا|🇬🇭|GHS|₵|15.8|أفريقيا
TZ|تنزانيا|🇹🇿|USD|$|1|أفريقيا
UG|أوغندا|🇺🇬|USD|$|1|أفريقيا
ET|إثيوبيا|🇪🇹|USD|$|1|أفريقيا
RW|رواندا|🇷🇼|USD|$|1|أفريقيا
ZM|زامبيا|🇿🇲|ZMW|ZK|27.2|أفريقيا
AO|أنغولا|🇦🇴|USD|$|1|أفريقيا
MZ|موزمبيق|🇲🇿|MZN|MT|63.9|أفريقيا
BW|بوتسوانا|🇧🇼|BWP|P|13.6|أفريقيا
NA|ناميبيا|🇳🇦|NAD|N$|17.8|أفريقيا
MU|موريشيوس|🇲🇺|MUR|Rs|46.5|أفريقيا
SN|السنغال|🇸🇳|USD|$|1|أفريقيا
CI|ساحل العاج|🇨🇮|USD|$|1|أفريقيا
ML|مالي|🇲🇱|USD|$|1|أفريقيا
BF|بوركينا فاسو|🇧🇫|USD|$|1|أفريقيا
NE|النيجر|🇳🇪|USD|$|1|أفريقيا
BJ|بنين|🇧🇯|USD|$|1|أفريقيا
TG|توغو|🇹🇬|USD|$|1|أفريقيا
GN|غينيا|🇬🇳|USD|$|1|أفريقيا
CM|الكاميرون|🇨🇲|USD|$|1|أفريقيا
GA|الغابون|🇬🇦|USD|$|1|أفريقيا
TD|تشاد|🇹🇩|USD|$|1|أفريقيا
CG|الكونغو|🇨🇬|USD|$|1|أفريقيا
CD|الكونغو الديمقراطية|🇨🇩|USD|$|1|أفريقيا
CV|الرأس الأخضر|🇨🇻|USD|$|1|أفريقيا
MW|مالاوي|🇲🇼|USD|$|1|أفريقيا
MG|مدغشقر|🇲🇬|USD|$|1|أفريقيا
ZW|زيمبابوي|🇿🇼|USD|$|1|أفريقيا
SC|سيشل|🇸🇨|SCR|₨|14.5|أفريقيا
GM|غامبيا|🇬🇲|GMD|D|71|أفريقيا
SL|سيراليون|🇸🇱|SLE|Le|22.7|أفريقيا
LR|ليبيريا|🇱🇷|USD|$|1|أفريقيا
BI|بوروندي|🇧🇮|USD|$|1|أفريقيا
SS|جنوب السودان|🇸🇸|USD|$|1|أفريقيا
SZ|إسواتيني|🇸🇿|SZL|E|17.8|أفريقيا
LS|ليسوتو|🇱🇸|LSL|L|17.8|أفريقيا
AU|أستراليا|🇦🇺|AUD|A$|1.53|أوقيانوسيا
NZ|نيوزيلندا|🇳🇿|NZD|NZ$|1.68|أوقيانوسيا
FJ|فيجي|🇫🇯|FJD|FJ$|2.26|أوقيانوسيا
PG|بابوا غينيا الجديدة|🇵🇬|PGK|K|3.95|أوقيانوسيا
NC|كاليدونيا الجديدة|🇳🇨|USD|$|1|أوقيانوسيا
`;

  var L = RAW.trim().split('\n').map(function (s) {
    var p = s.split('|');
    return { c: p[0], n: p[1], f: p[2], cc: p[3], sy: p[4], r: parseFloat(p[5]), g: p[6] };
  });

  var STEPS = [0.01,0.02,0.05,0.1,0.25,0.5,1,2.5,5,10,25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000,250000,500000];

  function pretty(raw) {
    if (!(raw > 0)) return 0;
    for (var i = STEPS.length - 1; i >= 0; i--) {
      var s = STEPS[i];
      var c = Math.ceil(raw / s) * s;
      if (c >= raw - 1e-9 && c / raw <= 1.045) return Math.round(c * 1e6) / 1e6;
    }
    return Math.ceil(raw * 100) / 100;
  }

  function fnum(v) {
    var d = 0;
    if (Math.abs(v - Math.round(v)) > 1e-9) d = Math.abs(v * 10 - Math.round(v * 10)) > 1e-9 ? 2 : 1;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function loc(usd, C) { return fnum(pretty(usd * C.r)) + ' ' + C.sy; }

  var C = L[0];

  function has(c) { return !!L.find(function (x) { return x.c === c; }); }

  function detect() {
    var code = window.OmranGeo ? window.OmranGeo.country(has) : 'AE';
    return has(code) ? code : 'AE';
  }

  function set(code) { C = L.find(function (x) { return x.c === code; }) || L[0]; return C; }

  function render(root) {
    var r = root || document;
    r.querySelectorAll('[data-usd]').forEach(function (e) {
      var u = parseFloat(e.dataset.usd);
      if (!isFinite(u)) return;
      // العملة الأساس: يُعرض السعر كما هو، بلا تقريب.
      e.textContent = fnum(C.r === 1 ? u : pretty(u * C.r));
    });
    r.querySelectorAll('.cursym').forEach(function (e) {
      var sy = shownSym(C);
      e.textContent = sy;
      if (e.classList) e.classList.toggle('curCode', /^[A-Z]{2,4}$/.test(sy));
    });
  }
  /* v-cur-display (تدقيق ١٨ أكتوبر، pricing-section وcurrency-select؛ موافقة المالك ٢١ أكتوبر «عرض فقط بدون تغيير الأسعار»): الرمز العربيّ
     (د.إ، ر.س، د.ك…) كان يظهر في الواجهة الإنجليزيّة وبقيّة اللغات — خارج العربيّة يُعرض رمز ISO (AED، SAR…) بدله، والرموز اللاتينيّة
     ($، A$، €…) كما هي. ترتيب «$10» في الإنجليزيّة بالـCSS (partials-settings). لا سعر ولا سعر صرف ولا تقريب تغيّر. */
  function shownSym(x) {
    var sy = String((x && x.sy) || '');
    return (curLang() !== 'ar' && /[\u0600-\u06FF]/.test(sy)) ? (x.cc || sy) : sy;
  }

  /* v658: اسم الدولة بلغة المستخدم عبر Intl.DisplayNames (بلا جدول ترجمة)،
     وعنوان المجموعة عبر القاموس الثنائيّ __BI. كانت ١٦١ دولة عربيّة في كلّ اللغات. */
  var GRP_EN = { 'الخليج والعالم العربي':'Gulf & Arab world', 'آسيا':'Asia', 'أفريقيا':'Africa',
    'أوروبا':'Europe', 'أوقيانوسيا':'Oceania', 'الأمريكتان':'Americas' };
  function curLang(){
    try{ if(typeof lang !== 'undefined' && lang) return String(lang);
      return localStorage.getItem('aiapp_lang') || 'ar'; }
    catch(_){ /* guard-ok: language probe falls back to Arabic. */ return 'ar'; }
  }
  /* v-i18n-14 (مسح اللغات): Chromium بلا أسماء الدول بالنيباليّة فيعيد Intl الإنجليزيّة — ١٦١ سطرًا إنجليزيًّا في الأسعار بالنيباليّة.
     جدول مولَّد آليًّا من ICU الكامل (Node: Intl.DisplayNames ne)، وفلسطين «प्यालेस्टाइन» كما في بقيّة التطبيق. */
  var NE_REGION = {"AE":"संयुक्त अरब इमिराट्स","SA":"साउदी अरब","KW":"कुवेत","QA":"कतार","BH":"बहराइन","OM":"ओमन","JO":"जोर्डन","EG":"इजिप्ट","MA":"मोरोक्को","DZ":"अल्जेरिया","TN":"ट्युनिसिया","LY":"लिबिया","IQ":"इराक","SD":"सुडान","SY":"सिरिया","YE":"येमेन","LB":"लेबनन","PS":"प्यालेस्टाइन","MR":"माउरिटानिया","SO":"सोमालिया","DJ":"डिजिबुटी","KM":"कोमोरोस","US":"संयुक्त राज्य","CA":"क्यानाडा","MX":"मेक्सिको","BR":"ब्राजिल","AR":"अर्जेन्टिना","CL":"चिली","CO":"कोलोम्बिया","PE":"पेरू","UY":"उरूग्वे","PY":"प्याराग्वे","BO":"बोलिभिया","VE":"भेनेजुएला","EC":"इक्वेडोर","PA":"प्यानामा","SV":"एल् साल्भाडोर","GT":"ग्वाटेमाला","CR":"कोष्टारिका","HN":"हन्डुरास","NI":"निकारागुवा","DO":"डोमिनिकन गणतन्त्र","JM":"जमैका","TT":"त्रिनिडाड एण्ड टोबागो","HT":"हैटी","GY":"गुयाना","BS":"बहामास","DE":"जर्मनी","FR":"फ्रान्स","IT":"इटली","ES":"स्पेन","NL":"नेदरल्याण्ड","BE":"बेल्जियम","AT":"अष्ट्रिया","PT":"पोर्चुगल","IE":"आयरल्याण्ड","GR":"ग्रीस","FI":"फिनल्याण्ड","LU":"लक्जेमबर्ग","CY":"साइप्रस","MT":"माल्टा","SK":"स्लोभाकिया","SI":"स्लोभेनिया","EE":"इस्टोनिया","LV":"लाट्भिया","LT":"लिथुएनिया","HR":"क्रोएशिया","GB":"संयुक्त अधिराज्य","CH":"स्विजरल्याण्ड","SE":"स्विडेन","NO":"नर्वे","DK":"डेनमार्क","PL":"पोल्याण्ड","CZ":"चेकिया","HU":"हङ्गेरी","RO":"रोमेनिया","BG":"बुल्गेरिया","RS":"सर्बिया","UA":"युक्रेन","TR":"तुर्किये","IS":"आइस्ल्याण्ड","AL":"अल्बेनिया","BA":"बोस्निया एण्ड हर्जगोभिनिया","MK":"उत्तर म्यासेडोनिया","MD":"माल्डोभा","GE":"जर्जिया","AM":"आर्मेनिया","AZ":"अजरबैजान","RU":"रूस","IN":"भारत","PK":"पाकिस्तान","BD":"बङ्गलादेश","LK":"श्रीलङ्का","NP":"नेपाल","MV":"माल्दिभ्स","CN":"चीन","JP":"जापान","KR":"दक्षिण कोरिया","TW":"ताइवान","HK":"हङकङ चिनियाँ विशेष प्रशासनिक क्षेत्र","SG":"सिङ्गापुर","MY":"मलेसिया","ID":"इन्डोनेशिया","TH":"थाइल्याण्ड","VN":"भिएतनाम","PH":"फिलिपिन्स","KH":"कम्बोडिया","MM":"म्यान्मार (बर्मा)","LA":"लाओस","BN":"ब्रुनाइ","MN":"मङ्गोलिया","KZ":"काजाकस्तान","UZ":"उज्बेकिस्तान","KG":"किर्गिस्तान","TJ":"ताजिकिस्तान","TM":"तुर्कमेनिस्तान","AF":"अफगानिस्तान","ZA":"दक्षिण अफ्रिका","NG":"नाइजेरिया","KE":"केन्या","GH":"घाना","TZ":"तान्जानिया","UG":"युगाण्डा","ET":"इथियोपिया","RW":"रवाण्डा","ZM":"जाम्बिया","AO":"अङ्गोला","MZ":"मोजाम्बिक","BW":"बोट्स्वाना","NA":"नामिबिया","MU":"मौरिसियस","SN":"सेनेगल","CI":"कोट दिभोर","ML":"माली","BF":"बुर्किना फासो","NE":"नाइजर","BJ":"बेनिन","TG":"टोगो","GN":"गिनी","CM":"क्यामरून","GA":"गावोन","TD":"चाड","CG":"कङ्गो ब्राजाभिल","CD":"कङ्गो - किन्शासा","CV":"केप भर्डे","MW":"मालावी","MG":"माडागास्कर","ZW":"जिम्बाबवे","SC":"सेचेलेस","GM":"गाम्विया","SL":"सिएर्रा लिओन","LR":"लाइबेरिया","BI":"बुरूण्डी","SS":"दक्षिण सुडान","SZ":"स्वाजिल्याण्ड","LS":"लेसोथो","AU":"अस्ट्रेलिया","NZ":"न्युजिल्याण्ड","FJ":"फिजी","PG":"पपुआ न्यू गाइनिया","NC":"न्यु क्यालेडोनिया"};
  function curName(x){
    var Lg = curLang(); if(Lg === 'ar') return x.n;
    if(Lg === 'ne' && NE_REGION[x.c]) return NE_REGION[x.c];
    try{ var d = new Intl.DisplayNames([Lg, 'en'], { type: 'region' });
      var nm = d.of(x.c); if(nm && nm !== x.c) return nm; }
    catch(_){ typeof __swallow === 'function' && __swallow(_, 'currency:242'); /* guard-ok: unsupported locale falls back to the Arabic table. */ }
    return x.n;
  }
  function relabelCur(sel){
    if(!sel) return;
    var by = {}; L.forEach(function (x) { by[x.c] = x; });
    Array.prototype.forEach.call(sel.querySelectorAll('optgroup'), function (og) {
      var ar = og.getAttribute('data-ar') || og.label;
      og.label = (typeof window.__bT === 'function') ? window.__bT(ar, GRP_EN[ar] || ar) : ar;
    });
    Array.prototype.forEach.call(sel.options, function (o) {
      var x = by[o.value]; if(x) o.textContent = x.f + '  ' + curName(x) + ' — ' + x.cc;
    });
  }
  window.__curRelabel = function(){
    Array.prototype.forEach.call(document.querySelectorAll('select[data-cur-filled="1"]'), relabelCur);
    if (document.querySelector('.cursym')) render(document); // v-cur-display: الرمز يتبع تبديل اللغة
  };

  function fillSelect(sel) {
    if (!sel || sel.dataset.curFilled) return;
    var seen = {}, groups = [];
    L.forEach(function (x) { if (!seen[x.g]) { seen[x.g] = 1; groups.push(x.g); } });
    groups.forEach(function (g) {
      var og = document.createElement('optgroup');
      og.label = g;
      og.setAttribute('data-ar', g);
      L.filter(function (x) { return x.g === g; }).forEach(function (x) {
        var o = document.createElement('option');
        o.value = x.c;
        o.textContent = x.f + '  ' + x.n + ' — ' + x.cc;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.dataset.curFilled = '1';
    relabelCur(sel);
  }

  function mount(root, sel) {
    fillSelect(sel);
    set(detect());
    if (sel) {
      sel.value = C.c;
      sel.addEventListener('change', function () {
        set(sel.value);
        if (window.OmranGeo) window.OmranGeo.remember(sel.value);
        render(root);
      });
    }
    render(root);
  }

  window.OmranCur = {
    list: L, pretty: pretty, fnum: fnum, loc: loc,
    cur: function () { return C; },
    set: set, detect: detect, render: render, fillSelect: fillSelect, mount: mount
  };
})();
