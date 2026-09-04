// 📿 القبلة والمواقيت — مواقيت الصلاة (aladhan) + بوصلة القبلة + تنبيه
// اختياري قبل كل صلاة (يركب على نظام تذكيرات مها: type:'prayer' + Web Push).
// المصادر مجانية والواجهة بلغة المستخدم.
(function(){
  'use strict';

  var KAABA = { lat: 21.4225, lng: 39.8262 };
  var PRAYERS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

  // اللغة الحالية من الـ14 المدعومة
  function qLang(){ try{ var l = String((typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar'); return (l === 'fil' || l === 'tl') ? 'fil' : l.slice(0,2); }catch(e){ return 'ar'; } }
  function qIsRtl(){ var l = qLang(); return l === 'ar' || l === 'ur'; }

  // أسماء الصلوات بالـ14 لغة
  var PR = {
    Fajr:    { ar:'الفجر', en:'Fajr', fr:'Fajr', hi:'फ़ज्र', ur:'فجر', bn:'ফজর', ne:'फजर', fil:'Fajr', id:'Subuh', zh:'晨礼', ru:'Фаджр', tr:'Sabah', ml:'ഫജ്ർ', es:'Fajr' },
    Sunrise: { ar:'الشروق', en:'Sunrise', fr:'Lever', hi:'सूर्योदय', ur:'طلوعِ آفتاب', bn:'সূর্যোদয়', ne:'सूर्योदय', fil:'Pagsikat', id:'Terbit', zh:'日出', ru:'Восход', tr:'Güneş', ml:'സൂര്യോദയം', es:'Amanecer' },
    Dhuhr:   { ar:'الظهر', en:'Dhuhr', fr:'Dhuhr', hi:'ज़ुहर', ur:'ظہر', bn:'যোহর', ne:'जुहर', fil:'Dhuhr', id:'Zuhur', zh:'晌礼', ru:'Зухр', tr:'Öğle', ml:'ദുഹ്ർ', es:'Dhuhr' },
    Asr:     { ar:'العصر', en:'Asr', fr:'Asr', hi:'अस्र', ur:'عصر', bn:'আসর', ne:'असर', fil:'Asr', id:'Asar', zh:'晡礼', ru:'Аср', tr:'İkindi', ml:'അസ്ർ', es:'Asr' },
    Maghrib: { ar:'المغرب', en:'Maghrib', fr:'Maghrib', hi:'मग़रिब', ur:'مغرب', bn:'মাগরিব', ne:'मगरिब', fil:'Maghrib', id:'Magrib', zh:'昏礼', ru:'Магриб', tr:'Akşam', ml:'മഗ്‌രിബ്', es:'Maghrib' },
    Isha:    { ar:'العشاء', en:'Isha', fr:'Isha', hi:'इशा', ur:'عشاء', bn:'ইশা', ne:'इशा', fil:'Isha', id:'Isya', zh:'宵礼', ru:'Иша', tr:'Yatsı', ml:'ഇശാ', es:'Isha' },
  };
  function prName(k){ var m = PR[k]; return (m && (m[qLang()] || m.en)) || k; }

  // نصوص الواجهة بالـ14 لغة
  var TX = {
    title:   { ar:'القبلة والمواقيت', en:'Qibla & Prayer Times', fr:'Qibla et Prières', hi:'क़िबला और नमाज़ का समय', ur:'قبلہ اور اوقاتِ نماز', bn:'কিবলা ও নামাজের সময়', ne:'किब्ला र नमाज समय', fil:'Qibla at Oras ng Dasal', id:'Kiblat & Waktu Salat', zh:'朝向与礼拜时间', ru:'Кибла и время намаза', tr:'Kıble ve Namaz Vakitleri', ml:'ഖിബ്‌ല & നമസ്കാര സമയം', es:'Qibla y Oración' },
    times:   { ar:'المواقيت', en:'Times', fr:'Horaires', hi:'समय', ur:'اوقات', bn:'সময়', ne:'समय', fil:'Oras', id:'Waktu', zh:'时间', ru:'Время', tr:'Vakitler', ml:'സമയം', es:'Horarios' },
    qibla:   { ar:'القبلة', en:'Qibla', fr:'Qibla', hi:'क़िबला', ur:'قبلہ', bn:'কিবলা', ne:'किब्ला', fil:'Qibla', id:'Kiblat', zh:'朝向', ru:'Кибла', tr:'Kıble', ml:'ഖിബ്‌ല', es:'Qibla' },
    next:    { ar:'الصلاة القادمة', en:'Next prayer', fr:'Prochaine prière', hi:'अगली नमाज़', ur:'اگلی نماز', bn:'পরবর্তী নামাজ', ne:'अर्को नमाज', fil:'Susunod na dasal', id:'Salat berikutnya', zh:'下一次礼拜', ru:'Следующий намаз', tr:'Sonraki namaz', ml:'അടുത്ത നമസ്കാരം', es:'Próxima oración' },
    method:  { ar:'طريقة الحساب', en:'Calculation method', fr:'Méthode de calcul', hi:'गणना विधि', ur:'حساب کا طریقہ', bn:'গণনা পদ্ধতি', ne:'गणना विधि', fil:'Paraan ng pagtutuos', id:'Metode perhitungan', zh:'计算方法', ru:'Метод расчёта', tr:'Hesaplama yöntemi', ml:'കണക്കാക്കൽ രീതി', es:'Método de cálculo' },
    locating:{ ar:'جارٍ تحديد موقعك وحساب المواقيت...', en:'Locating and computing times...', fr:'Localisation en cours...', hi:'स्थान ज्ञात किया जा रहा है...', ur:'مقام کا تعین ہو رہا ہے...', bn:'অবস্থান নির্ণয় হচ্ছে...', ne:'स्थान पत्ता लगाइँदै...', fil:'Hinahanap ang lokasyon...', id:'Menentukan lokasi...', zh:'正在定位...', ru:'Определение местоположения...', tr:'Konum belirleniyor...', ml:'സ്ഥാനം കണ്ടെത്തുന്നു...', es:'Localizando...' },
    locFail: { ar:'تعذّر تحديد موقعك. فعّل خدمة الموقع وأعد المحاولة.', en:'Could not get your location. Enable location and retry.', fr:'Localisation impossible. Activez la localisation.', hi:'स्थान नहीं मिला। लोकेशन चालू करें।', ur:'مقام معلوم نہیں ہوا۔ لوکیشن آن کریں۔', bn:'অবস্থান পাওয়া যায়নি। লোকেশন চালু করুন।', ne:'स्थान पत्ता लागेन। लोकेसन सक्रिय गर्नुहोस्।', fil:'Hindi makuha ang lokasyon. I-enable ang location.', id:'Lokasi gagal. Aktifkan lokasi.', zh:'无法获取位置，请开启定位。', ru:'Не удалось определить местоположение.', tr:'Konum alınamadı. Konumu açın.', ml:'സ്ഥാനം ലഭിച്ചില്ല. ലൊക്കേഷൻ ഓണാക്കുക.', es:'No se pudo obtener la ubicación.' },
    retry:   { ar:'إعادة', en:'Retry', fr:'Réessayer', hi:'पुनः प्रयास', ur:'دوبارہ', bn:'আবার', ne:'फेरि', fil:'Ulitin', id:'Coba lagi', zh:'重试', ru:'Повторить', tr:'Tekrar', ml:'വീണ്ടും', es:'Reintentar' },
    ah:      { ar:'هـ', en:'AH', fr:'H', hi:'हिजरी', ur:'ھ', bn:'হিজরি', ne:'हिजरी', fil:'AH', id:'H', zh:'伊历', ru:'г.х.', tr:'H', ml:'AH', es:'AH' },
    alertHint:{ ar:'اضغط الجرس بجانب أي صلاة لتفعيل تنبيه قبلها (يصلك حتى والتطبيق مغلق).', en:'Tap the bell beside a prayer to get an alert before it (arrives even when the app is closed).', fr:'Touchez la cloche pour une alerte avant la prière.', hi:'नमाज़ से पहले सूचना के लिए घंटी दबाएँ।', ur:'نماز سے پہلے اطلاع کے لیے گھنٹی دبائیں۔', bn:'নামাজের আগে সতর্কতার জন্য ঘণ্টায় চাপুন।', ne:'नमाज अघि सूचना दिन घण्टी थिच्नुहोस्।', fil:'Pindutin ang kampana para sa abiso bago ang dasal.', id:'Ketuk lonceng untuk peringatan sebelum salat.', zh:'点击铃铛设置礼拜前提醒。', ru:'Нажмите колокол для напоминания перед намазом.', tr:'Namazdan önce uyarı için zile dokunun.', ml:'നമസ്കാരത്തിന് മുമ്പ് അറിയിപ്പിന് മണി അമർത്തുക.', es:'Toca la campana para una alerta antes de la oración.' },
    approx:  { ar:'موقع تقريبي (من الشبكة) — فعّل خدمة الموقع لدقة أعلى', en:'Approximate location (network) — enable location for accuracy', fr:'Position approximative — activez la localisation', hi:'अनुमानित स्थान — सटीकता हेतु लोकेशन चालू करें', ur:'تخمینی مقام — درستگی کے لیے لوکیشن آن کریں', bn:'আনুমানিক অবস্থান — নির্ভুলতার জন্য লোকেশন চালু করুন', ne:'अनुमानित स्थान — शुद्धताको लागि लोकेसन सक्रिय गर्नुहोस्', fil:'Tinatayang lokasyon — i-enable ang location', id:'Lokasi perkiraan — aktifkan lokasi untuk akurasi', zh:'大致位置（网络）— 开启定位更准确', ru:'Приблизительное местоположение — включите геолокацию', tr:'Yaklaşık konum — hassasiyet için konumu açın', ml:'ഏകദേശ സ്ഥാനം — കൃത്യതയ്ക്ക് ലൊക്കേഷൻ ഓണാക്കുക', es:'Ubicación aproximada — activa la ubicación' },
    signIn:  { ar:'تسجيل الدخول مطلوب لتفعيل التنبيهات.', en:'Please sign in to enable alerts.', fr:'Connectez-vous pour activer les alertes.', hi:'सूचना हेतु साइन इन करें।', ur:'اطلاعات کے لیے سائن ان کریں۔', bn:'সতর্কতার জন্য সাইন ইন করুন।', ne:'सूचनाका लागि साइन इन गर्नुहोस्।', fil:'Mag-sign in para sa abiso.', id:'Masuk untuk mengaktifkan peringatan.', zh:'请登录以启用提醒。', ru:'Войдите, чтобы включить уведомления.', tr:'Uyarılar için giriş yapın.', ml:'അറിയിപ്പിന് സൈൻ ഇൻ ചെയ്യുക.', es:'Inicia sesión para activar alertas.' },
    minsBefore:{ ar:'كم دقيقة قبل {p}؟ (0 = وقت الأذان)', en:'How many minutes before {p}? (0 = at adhan)', fr:'Combien de minutes avant {p} ? (0 = à l\'adhan)', hi:'{p} से कितने मिनट पहले? (0 = अज़ान पर)', ur:'{p} سے کتنے منٹ پہلے؟ (0 = اذان پر)', bn:'{p} এর কত মিনিট আগে? (0 = আজানে)', ne:'{p} भन्दा कति मिनेट अघि? (0 = अजानमा)', fil:'Ilang minuto bago ang {p}? (0 = sa adhan)', id:'Berapa menit sebelum {p}? (0 = saat azan)', zh:'{p}前几分钟？(0=宣礼时)', ru:'За сколько минут до {p}? (0 = во время азана)', tr:'{p} vaktinden kaç dakika önce? (0 = ezanda)', ml:'{p} ന് എത്ര മിനിറ്റ് മുമ്പ്? (0 = അദാനിൽ)', es:'¿Cuántos minutos antes de {p}? (0 = en el adhan)' },
    atAdhan:{ ar:'عند الأذان', en:'At adhan', fr:'À l\'adhan', hi:'अज़ान पर', ur:'اذان کے وقت', bn:'আযানের সময়', ne:'अजानमा', fil:'Sa adhan', id:'Saat azan', zh:'宣礼时', ru:'Во время азана', tr:'Ezan vakti', ml:'അദാൻ സമയത്ത്', es:'Al adhan' },
    minUnit:{ ar:'دقيقة قبل', en:'min before', fr:'min avant', hi:'मिनट पहले', ur:'منٹ پہلے', bn:'মিনিট আগে', ne:'मिनेट अघि', fil:'min bago', id:'menit sebelum', zh:'分钟前', ru:'мин до', tr:'dk önce', ml:'മിനിറ്റ് മുമ്പ്', es:'min antes' },
    locUnavail:{ ar:'تعذّر تحديد الموقع.', en:'Location unavailable.', fr:'Position indisponible.', hi:'स्थान उपलब्ध नहीं।', ur:'مقام دستیاب نہیں۔', bn:'অবস্থান নেই।', ne:'स्थान उपलब्ध छैन।', fil:'Walang lokasyon.', id:'Lokasi tidak tersedia.', zh:'无法获取位置。', ru:'Местоположение недоступно.', tr:'Konum yok.', ml:'സ്ഥാനം ലഭ്യമല്ല.', es:'Ubicación no disponible.' },
    saveFail:{ ar:'تعذّر حفظ التنبيه.', en:'Could not save alert.', fr:'Échec de l\'enregistrement.', hi:'सूचना सहेजी नहीं गई।', ur:'اطلاع محفوظ نہیں ہوئی۔', bn:'সতর্কতা সংরক্ষণ ব্যর্থ।', ne:'सूचना सुरक्षित भएन।', fil:'Hindi na-save.', id:'Gagal menyimpan.', zh:'无法保存提醒。', ru:'Не удалось сохранить.', tr:'Kaydedilemedi.', ml:'സേവ് ചെയ്യാനായില്ല.', es:'No se pudo guardar.' },
    qHead:   { ar:'اتجاه القبلة من موقعك', en:'Qibla direction from your location', fr:'Direction de la Qibla', hi:'आपके स्थान से क़िबला दिशा', ur:'آپ کے مقام سے قبلہ کی سمت', bn:'আপনার অবস্থান থেকে কিবলা দিক', ne:'तपाईंको स्थानबाट किब्ला दिशा', fil:'Direksyon ng Qibla', id:'Arah kiblat dari lokasi Anda', zh:'从您的位置看朝向', ru:'Направление киблы', tr:'Konumunuzdan kıble yönü', ml:'നിങ്ങളുടെ സ്ഥാനത്തുനിന്ന് ഖിബ്‌ല ദിശ', es:'Dirección de la Qibla' },
    clockwise:{ ar:'من الشمال باتجاه عقارب الساعة', en:'clockwise from North', fr:'sens horaire depuis le Nord', hi:'उत्तर से दक्षिणावर्त', ur:'شمال سے گھڑی وار', bn:'উত্তর থেকে ঘড়ির কাঁটার দিকে', ne:'उत्तरबाट घडीको दिशामा', fil:'clockwise mula Hilaga', id:'searah jarum jam dari Utara', zh:'从北方顺时针', ru:'по часовой от Севера', tr:'Kuzeyden saat yönünde', ml:'വടക്കുനിന്ന് ഘടികാരദിശയിൽ', es:'horario desde el Norte' },
    facing:  { ar:'✅ أنت تواجه القبلة الآن', en:'✅ You are facing the Qibla', fr:'✅ Vous faites face à la Qibla', hi:'✅ आप क़िबला की ओर हैं', ur:'✅ آپ قبلہ رخ ہیں', bn:'✅ আপনি কিবলামুখী', ne:'✅ तपाईं किब्लातिर हुनुहुन्छ', fil:'✅ Nakaharap ka sa Qibla', id:'✅ Anda menghadap kiblat', zh:'✅ 您正朝向朝向', ru:'✅ Вы обращены к кибле', tr:'✅ Kıbleye dönüksünüz', ml:'✅ നിങ്ങൾ ഖിബ്‌ലയ്ക്ക് അഭിമുഖം', es:'✅ Estás mirando a la Qibla' },
    rotate:  { ar:'أدر هاتفك حتى يومض السهم أخضر', en:'Rotate your phone until the arrow turns green', fr:'Tournez le téléphone jusqu\'au vert', hi:'तीर हरा होने तक फ़ोन घुमाएँ', ur:'تیر سبز ہونے تک فون گھمائیں', bn:'তীর সবুজ না হওয়া পর্যন্ত ফোন ঘোরান', ne:'तीर हरियो नभएसम्म फोन घुमाउनुहोस्', fil:'Iikot ang telepono hanggang maging berde', id:'Putar ponsel hingga panah hijau', zh:'旋转手机直到箭头变绿', ru:'Поворачивайте телефон до зелёной стрелки', tr:'Ok yeşil olana dek telefonu çevirin', ml:'അമ്പ് പച്ചയാകുന്നത് വരെ ഫോൺ തിരിക്കുക', es:'Gira el teléfono hasta que la flecha sea verde' },
    calib:   { ar:'حرّك هاتفك على شكل ٨ للمعايرة.', en:'Move your phone in a figure-8 to calibrate.', fr:'Bougez en forme de 8 pour calibrer.', hi:'कैलिब्रेट हेतु फ़ोन को 8 आकार में घुमाएँ।', ur:'کیلبریٹ کے لیے فون کو 8 کی شکل میں گھمائیں۔', bn:'ক্যালিব্রেট করতে ফোন 8 আকারে নাড়ুন।', ne:'क्यालिब्रेट गर्न फोनलाई ८ आकारमा घुमाउनुहोस्।', fil:'Igalaw sa hugis-8 para mag-calibrate.', id:'Gerakkan ponsel bentuk 8 untuk kalibrasi.', zh:'以8字形移动手机以校准。', ru:'Двигайте телефон восьмёркой для калибровки.', tr:'Kalibrasyon için 8 çizin.', ml:'കാലിബ്രേറ്റ് ചെയ്യാൻ ഫോൺ 8 ആകൃതിയിൽ ചലിപ്പിക്കുക.', es:'Mueve el teléfono en forma de 8 para calibrar.' },
    enableLoc:{ ar:'فعّل خدمة الموقع لعرض القبلة.', en:'Enable location to show Qibla.', fr:'Activez la localisation pour la Qibla.', hi:'क़िबला हेतु लोकेशन चालू करें।', ur:'قبلہ کے لیے لوکیشن آن کریں۔', bn:'কিবলা দেখতে লোকেশন চালু করুন।', ne:'किब्ला हेर्न लोकेसन सक्रिय गर्नुहोस्।', fil:'I-enable ang location para sa Qibla.', id:'Aktifkan lokasi untuk kiblat.', zh:'开启定位以显示朝向。', ru:'Включите геолокацию для киблы.', tr:'Kıble için konumu açın.', ml:'ഖിബ്‌ല കാണിക്കാൻ ലൊക്കേഷൻ ഓണാക്കുക.', es:'Activa la ubicación para la Qibla.' },
    enableCompass:{ ar:'تفعيل البوصلة', en:'Enable compass', fr:'Activer la boussole', hi:'कम्पास चालू करें', ur:'قطب نما فعال کریں', bn:'কম্পাস চালু করুন', ne:'कम्पास सक्रिय गर्नुहोस्', fil:'I-enable ang compass', id:'Aktifkan kompas', zh:'启用指南针', ru:'Включить компас', tr:'Pusulayı aç', ml:'കോമ്പസ് ഓണാക്കുക', es:'Activar brújula' },
    noSensor:{ ar:'جهازك بلا حساس بوصلة — وجّه نحو الزاوية بالأعلى (من الشمال).', en:'No compass sensor — aim at the angle above (from North).', fr:'Pas de boussole — visez l\'angle ci-dessus.', hi:'कम्पास सेंसर नहीं — ऊपर दिए कोण की ओर।', ur:'قطب نما سینسر نہیں — اوپر والے زاویے کی طرف۔', bn:'কম্পাস সেন্সর নেই — উপরের কোণে লক্ষ্য করুন।', ne:'कम्पास सेन्सर छैन — माथिको कोणतिर।', fil:'Walang compass sensor — sundin ang anggulo sa itaas.', id:'Tanpa sensor kompas — arahkan ke sudut di atas.', zh:'无指南针传感器 — 对准上方角度。', ru:'Нет датчика компаса — по углу выше.', tr:'Pusula sensörü yok — yukarıdaki açıya yönelin.', ml:'കോമ്പസ് സെൻസർ ഇല്ല — മുകളിലെ കോണിലേക്ക്.', es:'Sin sensor de brújula — apunta al ángulo de arriba.' },
    opening: { ar:'جارٍ الفتح...', en:'Opening...', fr:'Ouverture...', hi:'खुल रहा है...', ur:'کھل رہا ہے...', bn:'খুলছে...', ne:'खुल्दै...', fil:'Binubuksan...', id:'Membuka...', zh:'正在打开...', ru:'Открытие...', tr:'Açılıyor...', ml:'തുറക്കുന്നു...', es:'Abriendo...' },
    alert:   { ar:'تنبيه', en:'Alert', fr:'Alerte', hi:'सूचना', ur:'اطلاع', bn:'সতর্কতা', ne:'सूचना', fil:'Abiso', id:'Peringatan', zh:'提醒', ru:'Оповещение', tr:'Uyarı', ml:'അറിയിപ്പ്', es:'Alerta' },
  };
  /* v-prayer-local: حالة الإشعارات بعد تفعيل الجرس + تنبيه محلي والتطبيق مفتوح */
  TX.pushOk = { ar:'✅ التنبيه مفعّل، وسيصلك إشعار حتى والتطبيق مغلق.', en:'✅ Alert on — you will get a notification even when the app is closed.' };
  TX.pushDenied = { ar:'⚠️ الإشعارات مرفوضة على هذا الجهاز. اسمح بها من إعدادات التطبيق؛ وحتى ذلك يصلك التنبيه فقط والتطبيق مفتوح.', en:'⚠️ Notifications are blocked on this device. Allow them in the app settings; until then the alert only fires while the app is open.' };
  TX.pushUnavail = { ar:'⚠️ هذا الجهاز لا يدعم إشعارات الدفع (مثل أجهزة هواوي بلا خدمات جوجل). سيصلك التنبيه والتطبيق مفتوح أو في الخلفية فقط.', en:'⚠️ Push notifications are not available on this device (e.g. Huawei without Google services). The alert fires only while the app is open or in the background.' };
  TX.localTitle = { ar:'عمران — مواقيت الصلاة', en:'Omran — Prayer times' };
  function tx(key){ var m = TX[key]; return (m && (m[qLang()] || m.en)) || (m && m.ar) || key; }
  function qt(ar, en){ return qIsRtl() ? ar : en; } // للنصوص المركّبة القليلة المتبقية

  // طرق الحساب بالـ14 لغة (أسماء الهيئات — تُترجم وصفيًا)
  var METHODS = [
    { v: 4, t: { ar:'أم القرى (مكة)', en:'Umm al-Qura (Makkah)', fr:'Oumm al-Qoura', hi:'उम्म अल-क़ुरा (मक्का)', ur:'ام القریٰ (مکہ)', bn:'উম্মুল কুরা (মক্কা)', ne:'उम्म अल-कुरा (मक्का)', fil:'Umm al-Qura (Makkah)', id:'Umm al-Qura (Makkah)', zh:'古拉大学（麦加）', ru:'Умм аль-Кура (Мекка)', tr:'Ümmü\'l-Kura (Mekke)', ml:'ഉമ്മുൽ ഖുറാ (മക്ക)', es:'Umm al-Qura (La Meca)' } },
    { v: 3, t: { ar:'رابطة العالم الإسلامي', en:'Muslim World League', fr:'Ligue islamique mondiale', hi:'मुस्लिम वर्ल्ड लीग', ur:'رابطہ عالم اسلامی', bn:'মুসলিম ওয়ার্ল্ড লীগ', ne:'मुस्लिम वर्ल्ड लिग', fil:'Muslim World League', id:'Liga Dunia Muslim', zh:'世界穆斯林联盟', ru:'Всемирная мусульманская лига', tr:'İslam Dünyası Birliği', ml:'മുസ്‌ലിം വേൾഡ് ലീഗ്', es:'Liga Mundial Musulmana' } },
    { v: 8, t: { ar:'الخليج', en:'Gulf Region', fr:'Région du Golfe', hi:'खाड़ी क्षेत्र', ur:'خلیجی خطہ', bn:'উপসাগরীয় অঞ্চল', ne:'खाडी क्षेत्र', fil:'Rehiyon ng Golpo', id:'Kawasan Teluk', zh:'海湾地区', ru:'Персидский залив', tr:'Körfez Bölgesi', ml:'ഗൾഫ് മേഖല', es:'Región del Golfo' } },
    { v: 5, t: { ar:'الهيئة المصرية', en:'Egyptian Authority', fr:'Autorité égyptienne', hi:'मिस्री प्राधिकरण', ur:'مصری ادارہ', bn:'মিশরীয় কর্তৃপক্ষ', ne:'इजिप्टियन प्राधिकरण', fil:'Awtoridad ng Ehipto', id:'Otoritas Mesir', zh:'埃及总局', ru:'Египетское управление', tr:'Mısır Kurumu', ml:'ഈജിപ്ഷ്യൻ അതോറിറ്റി', es:'Autoridad Egipcia' } },
    { v: 1, t: { ar:'كراتشي', en:'Karachi', fr:'Karachi', hi:'कराची', ur:'کراچی', bn:'করাচি', ne:'कराची', fil:'Karachi', id:'Karachi', zh:'卡拉奇', ru:'Карачи', tr:'Karaçi', ml:'കറാച്ചി', es:'Karachi' } },
    { v: 2, t: { ar:'أمريكا الشمالية (ISNA)', en:'North America (ISNA)', fr:'Amérique du Nord (ISNA)', hi:'उत्तरी अमेरिका (ISNA)', ur:'شمالی امریکہ (ISNA)', bn:'উত্তর আমেরিকা (ISNA)', ne:'उत्तर अमेरिका (ISNA)', fil:'Hilagang Amerika (ISNA)', id:'Amerika Utara (ISNA)', zh:'北美 (ISNA)', ru:'Северная Америка (ISNA)', tr:'Kuzey Amerika (ISNA)', ml:'വടക്കേ അമേരിക്ക (ISNA)', es:'Norteamérica (ISNA)' } },
  ];
  function methodName(m){ return (m.t && (m.t[qLang()] || m.t.en)) || m.t.ar; }

  function qIsAr(){ return qIsRtl(); }
  function getMethod(){ try{ return parseInt(localStorage.getItem('aiapp_pray_method') || '4', 10); }catch(e){ return 4; } }

  var S = { timings: null, dateStr: null, loc: null, ticker: null };

  /* v-geo-fallback: GPS أولًا، وإن رُفض/تعذّر نسقط على موقع تقريبي من IP —
     فالمواقيت والقبلة تعمل على أي جهاز حتى بلا إذن موقع دقيق. */
  function ipLoc(){
    return fetch('/api/system?action=ip-geo')
      .then(function(r){ return r.json(); })
      .then(function(d){ return (d && typeof d.lat === 'number') ? { lat: d.lat, lng: d.lng, approx: true } : null; })
      .catch(function(){ return null; });
  }
  function gpsLoc(){
    return new Promise(function(res){
      try{
        var cached = JSON.parse(localStorage.getItem('aiapp_last_geo') || 'null');
        /* v-pray-fresh (شكوى المالك: «التوقيت يثبت على آخر منطقة»): الذاكرة دقيقتان لا ساعة */
        if(!S.forceFresh && cached && (Date.now() - cached.ts) < 120000){ res({ lat: cached.lat, lng: cached.lng }); return; }
      }catch(e){ /* guard-ok */ }
      if(!navigator.geolocation){ res(null); return; }
      var done = false;
      var finish = function(v){ if(done) return; done = true; res(v); };
      // مهلة قصيرة حتى لا يعلق المستخدم إن لم يستجب الحساس؛ الاحتياط IP بعدها
      setTimeout(function(){ finish(null); }, 4500);
      navigator.geolocation.getCurrentPosition(
        function(p){
          var l = { lat: p.coords.latitude, lng: p.coords.longitude };
          try{ localStorage.setItem('aiapp_last_geo', JSON.stringify(Object.assign({ ts: Date.now() }, l))); }catch(e){ /* guard-ok */ }
          finish(l);
        },
        function(){ finish(null); },
        { timeout: 4500, maximumAge: S.forceFresh ? 0 : 120000, enableHighAccuracy: false });
      S.forceFresh = false;
    });
  }
  function loc(){
    if(S.loc) return Promise.resolve(S.loc);
    return gpsLoc().then(function(l){
      if(l){ S.loc = l; return l; }
      return ipLoc().then(function(ip){ if(ip){ S.loc = ip; } return ip; });
    });
  }

  function fetchTimings(){
    return loc().then(function(l){
      if(!l) return Promise.reject(new Error('no-location'));
      var d = new Date();
      var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return fetch('https://api.aladhan.com/v1/timings/' + ds
        + '?latitude=' + l.lat + '&longitude=' + l.lng + '&method=' + getMethod())
        .then(function(r){ return r.json(); })
        .then(function(data){
          if(!data || !data.data || !data.data.timings) throw new Error('bad-data');
          S.timings = data.data.timings;
          S.dateStr = new Date().toDateString();
          S.hijri = data.data.date && data.data.date.hijri;
          return S.timings;
        });
    });
  }

  /* الصلاة القادمة والعد التنازلي */
  function nextPrayer(){
    if(!S.timings) return null;
    var now = new Date();
    for(var i = 0; i < PRAYERS.length; i++){
      var k = PRAYERS[i];
      var hm = (S.timings[k] || '').split(':');
      if(hm.length < 2) continue;
      var t = new Date(now); t.setHours(+hm[0], +hm[1], 0, 0);
      if(t > now) return { key: k, at: t };
    }
    // بعد العشاء → فجر الغد
    var fhm = (S.timings.Fajr || '').split(':');
    var ft = new Date(now); ft.setDate(ft.getDate() + 1); ft.setHours(+fhm[0], +fhm[1], 0, 0);
    return { key: 'Fajr', at: ft };
  }

  function fmtDur(ms){
    if(ms < 0) ms = 0;
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  function qiblaBearing(l){
    var φ1 = l.lat * Math.PI / 180, φ2 = KAABA.lat * Math.PI / 180;
    var Δλ = (KAABA.lng - l.lng) * Math.PI / 180;
    var y = Math.sin(Δλ) * Math.cos(φ2);
    var x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /* ============ الواجهة ============ */
  function shell(){
    var el = document.getElementById('omranQiblaShell');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'omranQiblaShell';
    el.dir = 'rtl';
    el.style.cssText = 'position:fixed;inset:0;z-index:9500;background:var(--bg,#0a0b10);display:none;flex-direction:column;overflow:hidden;';
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));">' +
        '<h2 style="margin:0;font-size:17px;flex:1;">📿 ' + tx('title') + '</h2>' +
        '<button type="button" id="qClose" aria-label="close" style="background:none;border:1px solid var(--border,rgba(255,255,255,.15));border-radius:50%;width:34px;height:34px;color:inherit;font-size:15px;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="display:flex;gap:6px;padding:10px 14px 0;">' +
        '<button type="button" id="qTabTimes" style="flex:1;padding:9px;border-radius:10px;border:1px solid var(--omGoldSoft,rgba(212,175,55,.35));background:var(--omGold,#d4af37);color:#141414;font-weight:700;cursor:pointer;">' + tx('times') + '</button>' +
        '<button type="button" id="qTabQibla" style="flex:1;padding:9px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.12));background:rgba(255,255,255,.04);color:inherit;cursor:pointer;">' + tx('qibla') + '</button>' +
      '</div>' +
      '<div id="qBody" style="flex:1;min-height:0;overflow-y:auto;padding:14px calc(14px) calc(24px + env(safe-area-inset-bottom,0px));"></div>';
    document.body.appendChild(el);
    el.querySelector('#qClose').onclick = closeQibla;
    el.querySelector('#qTabTimes').onclick = function(){ setTab('times'); };
    el.querySelector('#qTabQibla').onclick = function(){ setTab('qibla'); };
    return el;
  }

  function setTab(tab){
    var el = shell();
    var tb = el.querySelector('#qTabTimes'), qb = el.querySelector('#qTabQibla');
    var on = 'background:var(--omGold,#d4af37);color:#141414;font-weight:700;';
    var off = 'background:rgba(255,255,255,.04);color:inherit;';
    tb.setAttribute('style', tb.getAttribute('style').replace(/background:[^;]+;color:[^;]+;(font-weight:700;)?/, (tab === 'times' ? on : off)));
    qb.setAttribute('style', qb.getAttribute('style').replace(/background:[^;]+;color:[^;]+;(font-weight:700;)?/, (tab === 'qibla' ? on : off)));
    if(S.ticker){ clearInterval(S.ticker); S.ticker = null; }
    stopCompass();
    if(tab === 'times') renderTimes(); else renderQibla();
  }

  function renderTimes(){
    var el = shell();
    var body = el.querySelector('#qBody');
    if(!S.timings){
      body.innerHTML = '<div style="text-align:center;color:var(--muted,#98a0b3);padding:30px 0;">⏳ ' + tx('locating') + '</div>';
      fetchTimings().then(function(){ renderTimes(); }).catch(function(e){
        __swallow(e, 'qibla:times');
        body.innerHTML = '<div style="text-align:center;color:var(--muted,#98a0b3);padding:30px 0;">' + tx('locFail') + '<br><br><button id="qRetry" style="padding:8px 16px;border-radius:10px;border:1px solid var(--omGoldSoft);background:rgba(212,175,55,.1);color:inherit;cursor:pointer;">' + tx('retry') + '</button></div>';
        var rb = body.querySelector('#qRetry'); if(rb) rb.onclick = function(){ S.loc = null; renderTimes(); };
      });
      return;
    }
    var np = nextPrayer();
    var mOpts = METHODS.map(function(m){ return '<option value="' + m.v + '"' + (m.v === getMethod() ? ' selected' : '') + ' style="background:#141420;color:#fff;">' + methodName(m) + '</option>'; }).join('');
    var rows = PRAYERS.map(function(k){
      var isNext = np && np.key === k;
      return '<div style="display:flex;align-items:center;gap:10px;padding:13px 14px;border-radius:12px;margin-bottom:7px;' +
        (isNext ? 'background:rgba(212,175,55,.14);border:1px solid var(--omGoldSoft,rgba(212,175,55,.4));' : 'background:rgba(255,255,255,.03);border:1px solid var(--border,rgba(255,255,255,.07));') + '">' +
        '<span style="font-size:15px;font-weight:' + (isNext ? '800' : '600') + ';flex:1;">' + prName(k) + (isNext ? ' •' : '') + '</span>' +
        '<span style="font-size:16px;font-weight:700;letter-spacing:.5px;">' + (S.timings[k] || '--') + '</span>' +
        (k !== 'Sunrise' ? '<button type="button" class="qBell" data-p="' + k + '" title="' + tx('alert') + '" style="background:none;border:none;font-size:18px;cursor:pointer;opacity:.85;">' + (hasAlert(k) ? '🔔' : '🔕') + '</button>' : '') +
        '</div>';
    }).join('');
    var hij = S.hijri ? (S.hijri.day + ' ' + (qIsAr() ? S.hijri.month.ar : S.hijri.month.en) + ' ' + S.hijri.year + ' ' + tx('ah')) : '';
    var approxNote = (S.loc && S.loc.approx) ? '<div style="text-align:center;font-size:11.5px;color:var(--muted,#98a0b3);margin-bottom:10px;">📶 ' + tx('approx') + '</div>' : '';
    body.innerHTML =
      (np ? '<div style="text-align:center;background:linear-gradient(135deg,rgba(212,175,55,.16),rgba(212,175,55,.04));border:1px solid var(--omGoldSoft,rgba(212,175,55,.35));border-radius:16px;padding:16px;margin-bottom:14px;">' +
        '<div style="font-size:13px;color:var(--muted,#98a0b3);">' + tx('next') + '</div>' +
        '<div style="font-size:22px;font-weight:800;margin:4px 0;">' + prName(np.key) + '</div>' +
        '<div id="qCountdown" style="font-size:28px;font-weight:800;letter-spacing:2px;font-variant-numeric:tabular-nums;color:var(--omGold,#d4af37);">--:--:--</div>' +
        '</div>' : '') +
      (hij ? '<div style="text-align:center;font-size:13px;color:var(--muted,#98a0b3);margin-bottom:12px;">📅 ' + hij + '</div>' : '') +
      approxNote +
      rows +
      '<div style="margin-top:14px;font-size:13px;color:var(--muted,#98a0b3);">' + tx('method') + '</div>' +
      '<select id="qMethod" style="width:100%;margin-top:6px;padding:10px;border-radius:10px;background:rgba(255,255,255,.04);color:inherit;border:1px solid var(--border,rgba(255,255,255,.12));font-size:14px;">' + mOpts + '</select>' +
      '<div style="font-size:12px;color:var(--muted,#98a0b3);margin-top:12px;line-height:1.7;">🔔 ' + tx('alertHint') + '</div>' +
      '<div id="qAlertStatus" style="display:none;font-size:12.5px;margin-top:8px;line-height:1.7;padding:8px 10px;border-radius:10px;background:rgba(212,175,55,.08);border:1px solid var(--omGoldSoft,rgba(212,175,55,.35));"></div>';

    body.querySelector('#qMethod').onchange = function(){
      try{ localStorage.setItem('aiapp_pray_method', this.value); }catch(e){ /* guard-ok */ }
      S.timings = null; renderTimes();
    };
    Array.prototype.forEach.call(body.querySelectorAll('.qBell'), function(b){
      b.onclick = function(){ toggleAlert(b.getAttribute('data-p'), b); };
    });
    if(np){
      S.ticker = setInterval(function(){
        var cd = document.getElementById('qCountdown');
        if(!cd){ clearInterval(S.ticker); S.ticker = null; return; }
        var left = np.at - new Date();
        if(left <= 0){ S.timings = null; renderTimes(); return; }
        cd.textContent = fmtDur(left);
      }, 1000);
    }
  }

  /* ==== التنبيهات (تُخزَّن محليًا للعرض + تُرسل للسيرفر) ==== */
  function alertsMap(){ try{ return JSON.parse(localStorage.getItem('aiapp_pray_alerts') || '{}'); }catch(e){ return {}; } }
  function hasAlert(k){ return !!alertsMap()[k]; }
  function alertId(v){ return (v && typeof v === 'object') ? v.id : v; }
  function alertOff(v){ return (v && typeof v === 'object' && Number.isFinite(v.off)) ? v.off : 0; }
  function setAlertStatus(txt){ var el = document.getElementById('qAlertStatus'); if(el){ el.textContent = txt || ''; el.style.display = txt ? '' : 'none'; } }

  /* v-prayer-local: اشتراك الدفع يُطلب عند كل تفعيل (لا مرة واحدة بالجلسة) ويعيد سبب الفشل بدل الصمت */
  function ensurePush(){
    return new Promise(function(res){
      (async function(){
        try{
          if(!('Notification' in window)) return res({ ok:false, reason:'unsupported' });
          var perm = Notification.permission;
          if(perm === 'default') perm = await Notification.requestPermission();
          if(perm !== 'granted') return res({ ok:false, reason:'denied' });
          if(!('serviceWorker' in navigator) || !('PushManager' in window)) return res({ ok:false, reason:'nopush' });
          var token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : '';
          if(!token) return res({ ok:false, reason:'auth' });
          var reg = await navigator.serviceWorker.ready;
          var sub = await reg.pushManager.getSubscription();
          if(!sub){
            var kd = await (await fetch('/api/vapid-public-key')).json();
            if(!kd || !kd.publicKey) return res({ ok:false, reason:'novapid' });
            var conv = (typeof urlBase64ToUint8Array === 'function') ? urlBase64ToUint8Array : function(b){ var pad = '='.repeat((4 - b.length % 4) % 4); var raw = atob((b + pad).replace(/-/g, '+').replace(/_/g, '/')); var out = new Uint8Array(raw.length); for(var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; };
            sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: conv(kd.publicKey) });
          }
          var r = await fetch('/api/push-subscribe', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token }, body: JSON.stringify({ subscription: sub.toJSON() }) });
          res({ ok: r.ok, reason: r.ok ? '' : 'server' });
        }catch(e){ res({ ok:false, reason:'pushfail:' + ((e && e.name) || '') }); }
      })();
    });
  }
  window.omranEnsurePush = ensurePush; /* v-news-push: تنبيهات الأخبار في الإعدادات تعيد استخدام الاشتراك نفسه */
  function pushStatusText(st){
    if(st.ok) return tx('pushOk');
    if(st.reason === 'denied') return tx('pushDenied');
    return tx('pushUnavail');
  }

  /* v-prayer-local: تنبيه محلي من الجهاز نفسه عند حلول الوقت — يعمل والتطبيق
     مفتوح أو في الخلفية حتى لو تعذّر الدفع (هواوي بلا خدمات جوجل، أو إذن مرفوض).
     يُعتمد على مواقيت الشاشة نفسها فلا يختلف الوقت عن المعروض. */
  /* v-pray-toast: alert() لا يعمل داخل أغلفة أندرويد/هواوي — تنبيه داخل التطبيق مع صوت قصير */
  function localToast(msg){
    try{
      var old = document.getElementById('qLocalToast'); if(old) old.remove();
      var t = document.createElement('div');
      t.id = 'qLocalToast';
      t.style.cssText = 'position:fixed;left:50%;top:calc(16px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:2147483001;max-width:92vw;background:rgba(20,20,26,.97);color:#f1d98a;border:1px solid rgba(212,175,55,.6);border-radius:14px;padding:12px 16px;font-size:15px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.5);text-align:center;';
      t.textContent = msg;
      t.onclick = function(){ t.remove(); };
      document.body.appendChild(t);
      setTimeout(function(){ try{ t.remove(); }catch(e){ /* guard-ok */ } }, 60000);
      try{ var ctx = new (window.AudioContext || window.webkitAudioContext)(); [880, 660, 880].forEach(function(hz, i){ var o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = hz; g.gain.value = .25; o.start(ctx.currentTime + i * .3); o.stop(ctx.currentTime + i * .3 + .22); }); }catch(e){ /* guard-ok */ }
      if(navigator.vibrate) try{ navigator.vibrate([300, 150, 300]); }catch(e){ /* guard-ok */ }
    }catch(e){ /* guard-ok */ }
  }
  function firedMap(){ try{ return JSON.parse(localStorage.getItem('aiapp_pray_fired') || '{}'); }catch(e){ return {}; } }
  function markFired(key){ var f = firedMap(); var ds = new Date().toDateString(); Object.keys(f).forEach(function(x){ if(x.indexOf(ds) !== 0) delete f[x]; }); f[key] = 1; try{ localStorage.setItem('aiapp_pray_fired', JSON.stringify(f)); }catch(e){ /* guard-ok */ } }
  function localTargets(){
    if(!S.timings) return [];
    var m = alertsMap(), out = [];
    Object.keys(m).forEach(function(k){
      var hm = String(S.timings[k] || '').split(':'); if(hm.length < 2) return;
      var t = new Date(); t.setHours(+hm[0], +hm[1], 0, 0);
      var off = alertOff(m[k]);
      out.push({ k:k, off:off, at: t.getTime() - off * 60000 });
    });
    return out;
  }
  function notifyLocal(x){
    var title = tx('localTitle');
    var body = x.off > 0 ? qt('باقي ' + x.off + ' دقيقة على ' + prName(x.k), x.off + ' min to ' + prName(x.k)) : qt('حان وقت ' + prName(x.k), prName(x.k) + ' time');
    try{ if(navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); }catch(e){ /* guard-ok */ }
    try{
      if(!('Notification' in window) || Notification.permission !== 'granted'){ localToast('🕌 ' + body); return; }
      var opts = { body: body, icon: './icons/icon-192-v2.png?icon=gold-20260819', badge: './icons/icon-192-v2.png?icon=gold-20260819', tag: 'prayer-local-' + x.k, vibrate: [300, 150, 300, 150, 300], requireInteraction: true };
      if('serviceWorker' in navigator){
        navigator.serviceWorker.ready.then(function(reg){ return reg.showNotification(title, opts); }).catch(function(){ try{ new Notification(title, opts); }catch(e){ localToast('🕌 ' + body); } });
      } else { new Notification(title, opts); }
    }catch(e){ try{ localToast('🕌 ' + body); }catch(_){ /* guard-ok */ } }
  }
  function checkLocal(){
    var now = Date.now(), ds = new Date().toDateString(), f = firedMap();
    localTargets().forEach(function(x){
      var key = ds + '|' + x.k + '|' + x.off;
      if(f[key]) return;
      var d = now - x.at;
      if(d >= 0 && d < 10 * 60000){ markFired(key); notifyLocal(x); }
    });
  }
  function quietLoc(){
    if(S.loc) return Promise.resolve(S.loc);
    try{ var c = JSON.parse(localStorage.getItem('aiapp_last_geo') || 'null'); if(c && typeof c.lat === 'number'){ S.loc = { lat:c.lat, lng:c.lng }; return Promise.resolve(S.loc); } }catch(e){ /* guard-ok */ }
    return ipLoc().then(function(ip){ if(ip) S.loc = ip; return ip; });
  }
  var localBooted = false;
  function bootLocalAlerts(){
    if(localBooted) return; localBooted = true;
    function ensureToday(){
      var ds = new Date().toDateString();
      if(S.timings && S.dateStr === ds) return Promise.resolve();
      return quietLoc().then(function(l){ if(!l) return; return fetchTimings().then(function(){ S.dateStr = ds; }); }).catch(function(e){ __swallow(e, 'qibla:local-times'); });
    }
    function tickLocal(){ if(!Object.keys(alertsMap()).length) return; ensureToday().then(checkLocal); }
    setTimeout(tickLocal, 4000);
    setInterval(tickLocal, 20000);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) tickLocal(); });
  }
  function toggleAlert(k, btn){
    var token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : '';
    if(!token){ setAlertStatus(tx('signIn')); return; }
    var m = alertsMap();
    if(m[k]){ // إيقاف
      var id = alertId(m[k]);
      delete m[k];
      try{ localStorage.setItem('aiapp_pray_alerts', JSON.stringify(m)); }catch(e){ /* guard-ok */ }
      if(btn) btn.textContent = '🔕';
      setAlertStatus('');
      fetch('/api/reminders?id=' + encodeURIComponent(id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
        .catch(function(e){ __swallow(e, 'qibla:del'); });
      return;
    }
    // تفعيل — اختيار الدقائق من ورقة صغيرة (v-pray-picker: prompt() لا يعمل داخل أغلفة أندرويد/هواوي فكان الجرس صامتًا)
    pickMinutes(k, btn, function(off){ armAlert(k, btn, off); });
  }
  function pickMinutes(k, btn, cb){
    var old = document.getElementById('qMinsPick'); if(old) old.remove();
    var host = btn && btn.closest ? btn.closest('div') : null;
    var box = document.createElement('div');
    box.id = 'qMinsPick';
    box.style.cssText = 'margin:6px 0 10px;padding:10px 12px;border-radius:12px;background:rgba(212,175,55,.10);border:1px solid var(--omGoldSoft,rgba(212,175,55,.45));font-size:13px;';
    var title = document.createElement('div');
    title.style.cssText = 'margin-bottom:8px;color:var(--muted,#98a0b3);';
    title.textContent = tx('minsBefore').replace('{p}', prName(k)).replace(/\s*\(.*\)\s*$/, '');
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    [0, 5, 10, 15, 30].forEach(function(v){
      var b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = 'padding:8px 12px;border-radius:999px;border:1px solid var(--omGoldSoft,rgba(212,175,55,.5));background:' + (v === 10 ? 'rgba(212,175,55,.25)' : 'rgba(255,255,255,.04)') + ';color:inherit;font:inherit;font-size:13px;cursor:pointer;';
      b.textContent = v === 0 ? tx('atAdhan') : (v + ' ' + tx('minUnit'));
      b.onclick = function(){ box.remove(); cb(v); };
      row.appendChild(b);
    });
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.style.cssText = 'padding:8px 12px;border-radius:999px;border:none;background:none;color:var(--muted,#98a0b3);font:inherit;font-size:13px;cursor:pointer;';
    cancel.textContent = '✕';
    cancel.onclick = function(){ box.remove(); };
    row.appendChild(cancel);
    box.appendChild(title); box.appendChild(row);
    if(host && host.parentNode) host.parentNode.insertBefore(box, host.nextSibling);
    else { var body = document.querySelector('#qBody'); if(body) body.insertBefore(box, body.firstChild); }
  }
  function armAlert(k, btn, off){
    var token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : '';
    if(btn) btn.textContent = '⏳';
    loc().then(function(l){
      if(!l){ if(btn) btn.textContent = '🔕'; setAlertStatus(tx('locUnavail')); return; }
      try{ localStorage.setItem('aiapp_pray_alert_loc', JSON.stringify({ lat: l.lat, lng: l.lng })); }catch(e){ /* guard-ok */ }
      return fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          type: 'prayer', prayerName: k, offsetMinutes: off, lat: l.lat, lng: l.lng, method: getMethod(),
          message: off > 0 ? qt('باقي ' + off + ' دقيقة على ' + prName(k), off + ' min to ' + prName(k)) : qt('حان وقت ' + prName(k), prName(k) + ' time'),
        }),
      }).then(function(r){ return r.json(); }).then(function(d){
        if(d && d.ok && d.reminder){
          var mm = alertsMap(); mm[k] = { id: d.reminder.id, off: off };
          try{ localStorage.setItem('aiapp_pray_alerts', JSON.stringify(mm)); }catch(e){ /* guard-ok */ }
          if(btn) btn.textContent = '🔔';
          setAlertStatus('⏳');
          ensurePush().then(function(st){ setAlertStatus(pushStatusText(st)); });
          bootLocalAlerts();
        } else { if(btn) btn.textContent = '🔕'; setAlertStatus(tx('saveFail')); }
      });
    }).catch(function(e){ __swallow(e, 'qibla:alert'); if(btn) btn.textContent = '🔕'; });
  }

  /* ==== بوصلة القبلة ==== */
  var compassHandler = null;
  function renderQibla(){
    var el = shell();
    var body = el.querySelector('#qBody');
    body.innerHTML = '<div style="text-align:center;color:var(--muted,#98a0b3);padding:20px 0;">⏳</div>';
    loc().then(function(l){
      if(!l){ body.innerHTML = '<div style="text-align:center;color:var(--muted,#98a0b3);padding:30px 0;">' + tx('enableLoc') + '</div>'; return; }
      var bearing = qiblaBearing(l);
      body.innerHTML =
        '<div style="text-align:center;">' +
          '<div style="font-size:14px;color:var(--muted,#98a0b3);margin-bottom:6px;">' + tx('qHead') + '</div>' +
          '<div style="font-size:34px;font-weight:800;color:var(--omGold,#d4af37);margin-bottom:4px;">' + Math.round(bearing) + '°</div>' +
          '<div style="font-size:12.5px;color:var(--muted,#98a0b3);margin-bottom:18px;">' + tx('clockwise') + '</div>' +
          '<div id="qCompass" style="position:relative;width:230px;height:230px;margin:0 auto;border-radius:50%;border:2px solid var(--border,rgba(255,255,255,.15));background:radial-gradient(circle,rgba(255,255,255,.03),transparent);">' +
            '<div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);font-size:12px;color:var(--muted,#98a0b3);">N</div>' +
            '<div id="qNeedle" style="position:absolute;top:50%;left:50%;width:4px;height:96px;background:linear-gradient(to top,transparent,var(--omGold,#d4af37));transform-origin:bottom center;transform:translate(-50%,-100%) rotate(' + bearing + 'deg);border-radius:3px;"></div>' +
            '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:26px;">🕋</div>' +
          '</div>' +
          '<div id="qCompassHint" style="font-size:12.5px;color:var(--muted,#98a0b3);margin-top:16px;line-height:1.7;"></div>' +
        '</div>';
      startCompass(bearing);
    }).catch(function(e){ __swallow(e, 'qibla:compass'); });
  }

  function startCompass(bearing){
    var hint = document.getElementById('qCompassHint');
    var gotHeading = false;   // v-desktop-nosensor: هل وصل حدث بوصلة فعلي؟
    function apply(heading){
      var needle = document.getElementById('qNeedle');
      if(!needle) return;
      // زاوية الإبرة = اتجاه القبلة - اتجاه الجهاز (تدور مع الهاتف)
      var rel = (bearing - heading + 360) % 360;
      needle.style.transform = 'translate(-50%,-100%) rotate(' + rel + 'deg)';
      var diff = Math.min(rel, 360 - rel);
      needle.style.background = diff < 8
        ? 'linear-gradient(to top,transparent,#22c55e)'
        : 'linear-gradient(to top,transparent,var(--omGold,#d4af37))';
      if(hint) hint.textContent = diff < 8
        ? tx('facing')
        : tx('rotate');
    }
    function onOrient(e){
      var heading = null;
      if(typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading; // iOS
      else if(e.absolute && typeof e.alpha === 'number') heading = 360 - e.alpha;      // أندرويد مطلق
      if(heading != null){ gotHeading = true; apply(heading); }
    }
    function attach(){
      compassHandler = onOrient;
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      window.addEventListener('deviceorientation', onOrient, true);
      if(hint) hint.textContent = tx('calib');
      // v-desktop-nosensor: DeviceOrientationEvent موجود على الكمبيوتر (وبعض
      // متصفحات الأندرويد) لكن لا يصل أي حدث بوصلة فعلي — كانت تظهر «حرّك هاتفك
      // على شكل ٨» والإبرة ميتة. بعد مهلة قصيرة بلا حدث نعرض إرشاد الزاوية
      // الثابتة (٢٥٨° من الشمال) بدل رسالة المعايرة المضلّلة.
      setTimeout(function(){ if(!gotHeading && hint) hint.textContent = tx('noSensor'); }, 1800);
    }
    // iOS 13+ يحتاج إذنًا صريحًا
    if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
      if(hint) hint.innerHTML = '<button id="qCompassPerm" style="padding:8px 16px;border-radius:10px;border:1px solid var(--omGoldSoft);background:rgba(212,175,55,.1);color:inherit;cursor:pointer;">' + tx('enableCompass') + '</button>';
      var pb = document.getElementById('qCompassPerm');
      if(pb) pb.onclick = function(){
        DeviceOrientationEvent.requestPermission().then(function(st){
          if(st === 'granted') attach();
          else if(hint) hint.textContent = qt('رُفض إذن الحساس — استخدم الزاوية بالأعلى.', 'Sensor denied — use the angle above.');
        }).catch(function(){ if(hint) hint.textContent = qt('البوصلة غير مدعومة — استخدم الزاوية بالأعلى.', 'Compass unsupported — use the angle above.'); });
      };
    } else if(window.DeviceOrientationEvent){
      attach();
    } else if(hint){
      hint.textContent = tx('noSensor');
    }
  }
  function stopCompass(){
    if(compassHandler){
      window.removeEventListener('deviceorientationabsolute', compassHandler, true);
      window.removeEventListener('deviceorientation', compassHandler, true);
      compassHandler = null;
    }
  }

  /* v-pray-fresh: عند كل فتح نعيد تحديد الموقع؛ إن تغيّر عن السابق بأكثر من ~3 كم نعيد جلب المواقيت
     وننقل تنبيهات الصلاة المسجّلة في الخادم إلى الموقع الجديد */
  function distKm(a, b){ var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function moveAlertsTo(l){
    var token = (typeof authGet === 'function') ? authGet('aiapp_auth_token') : '';
    var m = alertsMap(); var keys = Object.keys(m);
    if(!token || !keys.length) return;
    keys.forEach(function(k){
      var old = m[k], off = (old && typeof old === 'object') ? (old.off || 0) : 0, oldId = alertId(old);
      fetch('/api/reminders', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token },
        body: JSON.stringify({ type:'prayer', prayerName:k, offsetMinutes:off, lat:l.lat, lng:l.lng, method:getMethod(),
          message: off > 0 ? qt('باقي ' + off + ' دقيقة على ' + prName(k), off + ' min to ' + prName(k)) : qt('حان وقت ' + prName(k), prName(k) + ' time') }) })
        .then(function(r){ return r.json(); }).then(function(d){
          if(d && d.ok && d.reminder){
            var mm = alertsMap(); mm[k] = { id: d.reminder.id, off: off };
            try{ localStorage.setItem('aiapp_pray_alerts', JSON.stringify(mm)); }catch(e){ /* guard-ok */ }
            if(oldId) fetch('/api/reminders?id=' + encodeURIComponent(oldId), { method:'DELETE', headers:{ Authorization:'Bearer ' + token } }).catch(function(){ /* guard-ok: حذف التذكير القديم تحسين لا شرط */ });
          }
        }).catch(function(e){ __swallow(e, 'qibla:move-alert'); });
    });
  }
  function openQibla(){
    var el = shell();
    el.style.display = 'flex';
    S.loc = null;
    S.timings = null;
    S.forceFresh = true; /* أول قراءة بعد الفتح من الحساس مباشرة لا من الذاكرة */
    setTab('times');
    /* بعد الرسم: لو تغيّر الموقع فعليًا ننقل التنبيهات معه */
    loc().then(function(l){
      if(!l) return;
      var last = null; try{ last = JSON.parse(localStorage.getItem('aiapp_pray_alert_loc') || 'null'); }catch(e){ last = null; }
      var moved = !last || distKm(last, l) > 3;
      if(moved){
        try{ localStorage.setItem('aiapp_pray_alert_loc', JSON.stringify({ lat: l.lat, lng: l.lng })); }catch(e){ /* guard-ok */ }
        if(last) moveAlertsTo(l);
      }
    }).catch(function(e){ __swallow(e, 'qibla:open-loc'); });
  }
  function closeQibla(){
    if(S.ticker){ clearInterval(S.ticker); S.ticker = null; }
    stopCompass();
    var el = document.getElementById('omranQiblaShell');
    if(el) el.style.display = 'none';
  }

  var btn = document.getElementById('btnQibla');
  if(btn) btn.onclick = openQibla;
  window.omranQibla = { open: openQibla, close: closeQibla, checkLocal: checkLocal, _S: S };
  /* v-prayer-local: إن كان للمستخدم تنبيهات محفوظة نراقبها محليًا منذ فتح التطبيق */
  try{ if(Object.keys(alertsMap()).length) bootLocalAlerts(); }catch(e){ __swallow(e, 'qibla:boot-local'); }
})();
