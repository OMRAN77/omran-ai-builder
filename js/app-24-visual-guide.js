/* ================================================================
   المرشد البصري — Visual Guide  (v701)
   ================================================================
   شريحة حزمة مستقلة: js/app-24-visual-guide.js
   تُدمج تلقائيًا عبر `npm run bundle` (تطابق النمط app-NN-*.js).

   ستة أوضاع («عين عمران»):
     describe  — وصف مستمر للمحيط (التقاط ذكي حسب تغيّر المشهد)
     read      — قراءة النصوص واللافتات حرفيًا
     steps     — إرشاد خطوة بخطوة مع ذاكرة الخطوات السابقة
     translate — ترجمة أي نص تراه الكاميرا للغة المستخدم (لمسة = التقاط)
     ask       — اسأل عمّا تراه: خبير فوري لأي شيء أمام الكاميرا
     tour      — جولة داخل التطبيق (بلا كاميرا)

   الالتزامات المعمارية:
   · لا تحرير لأي ملف قائم — كل شيء هنا وفي css/visual-guide.css
   · لا `catch {}` فارغة (قاعدة guard.mjs ج)
   · لا قراءة عارية وقت التحميل لاسم يُعرَّف في شريحة لاحقة (قاعدة د)
   · يعتمد على: callGemini (app-06) · speakSmart/stopAllSpeaking (app-02)
     · __swallow (بذرة index.html) — كلها أسبق في ترتيب الدمج
   ================================================================ */
(function omranVisualGuide() {

  /* ---------------- إعدادات ---------------- */

  var CFG = {
    tickMs: 4000,          // كل كم يفحص المشهد محليًا (مجاني)
    minGapMs: 9000,        // أقل فاصل بين نداءين فعليين للنموذج
    maxSilenceMs: 26000,   // أقصى صمت مسموح — بعده يصف حتى لو لم يتغيّر المشهد
    diffThreshold: 0.10,   // نسبة البكسل المتغيّر التي تعني «مشهد جديد»
    maxDim: 1024,          // أقصى بُعد للإطار المرسل
    jpegQ: 0.82,
    probeSize: 48          // مقاس صورة المقارنة المصغّرة
  };

  var S = {
    open: false,
    mode: 'describe',
    stream: null,
    timer: null,
    busy: false,
    lastCallAt: 0,
    lastProbe: null,
    stepNo: 0,
    history: [],
    speakOn: true,
    torch: false,
    request: null,
    recognition: null,
    epoch: 0
  };

  /* ---------------- أدوات صغيرة ---------------- */

  function $id(id) { return document.getElementById(id); }

  function isAr() {
    var d = document.documentElement.getAttribute('dir');
    return d !== 'ltr';
  }

  /* v-vg-i18n (طلب عمران: «المرشد حوّل كل واحد بلغته — 14»): ar/ur عربي،
     وإلا لغة التطبيق من جدول VG_XL (يُبنى في نهاية الملف) ثم الإنجليزية. */
  /* v-vg-i18n: ترجمات المرشد لكل اللغات — المفتاح النص العربي حرفيًا */
  var VG_XL = {"تعذّر فتح الكاميرا. افتح الإعدادات واسمح للتطبيق باستخدام الكاميرا.":{"fr":"Caméra indisponible. Veuillez autoriser l'accès à la caméra dans les paramètres.","hi":"कैमरा उपलब्ध नहीं है। कृपया सेटिंग्स में कैमरा एक्सेस की अनुमति दें।","bn":"ক্যামেরা উপলব্ধ নয়। অনুগ্রহ করে সেটিংসে ক্যামেরা অ্যাক্সেসের অনুমতি দিন।","ne":"क्यामेरा उपलब्ध छैन। कृपया सेटिङ्समा क्यामेरा पहुँच अनुमति दिनुहोस्।","id":"Kamera tidak tersedia. Silakan izinkan akses kamera di pengaturan.","fil":"Hindi available ang camera. Mangyaring payagan ang camera access sa settings.","tr":"Kamera kullanılamıyor. Lütfen ayarlardan kamera erişimine izin verin.","zh":"摄像头不可用。请在设置中允许应用访问摄像头。","ru":"Камера недоступна. Пожалуйста, разрешите доступ к камере в параметрах.","es":"Cámara no disponible. Permita el acceso a la cámara en la configuración.","ml":"ക്യാമറ ലഭ്യമല്ല। ക്രുത്യയാ സെറ്റിങ്ങുകളിൽ ക്യാമറ ആക്സസ് അനുവദിക്കുക."},"الإضاءة غير مدعومة على هذا الجهاز.":{"fr":"Lampe torche non supportée sur cet appareil.","hi":"इस डिवाइस पर टॉर्च समर्थित नहीं है।","bn":"এই ডিভাইসে টর্চ সমর্থিত নয়।","ne":"यो यन्त्रमा टर्च समर्थित छैन।","id":"Senter tidak didukung di perangkat ini.","fil":"Torch hindi sinusuportahan sa device na ito.","tr":"El feneri bu cihazda desteklenmiyor.","zh":"此设备不支持手电筒。","ru":"Фонарик не поддерживается на этом устройстве.","es":"Linterna no soportada en este dispositivo.","ml":"ഈ ഉപകരണത്തിൽ ടോർച്ച് സപ്പോർട്ട് ചെയ്യുന്നില്ല."},"لم تثبت الصورة بعد…":{"fr":"Stabilisation en cours…","hi":"स्थिर हो रहा है…","bn":"স্থিতিশীল হচ্ছে…","ne":"स्थिर हुँदै छ…","id":"Menstabilkan…","fil":"Nag-stabilise…","tr":"Dengeleniyor…","zh":"正在稳定…","ru":"Стабилизация…","es":"Estabilizando…","ml":"സ്ഥിരീകരിക്കുന്നു…"},"أنظر…":{"fr":"Regarder…","hi":"देख रहा हूँ…","bn":"দেখছি…","ne":"हेर्दै छु…","id":"Melihat…","fil":"Tinutignan…","tr":"Bakıyor…","zh":"正在查看…","ru":"Смотрю…","es":"Mirando…","ml":"നോക്കുന്നു…"},"لم أتبيّن شيئًا — قرّب الكاميرا.":{"fr":"Rien de clair — rapprochez la caméra.","hi":"कुछ स्पष्ट नहीं — कैमरा करीब लाएं।","bn":"কিছু স্পষ্ট নয় — ক্যামেরা কাছে নিয়ে আসুন।","ne":"केहि स्पष्ट छैन — क्यामेरा नजिक गर्नुहोस्।","id":"Tidak ada yang jelas — dekatkan kamera.","fil":"Walang malinaw — dalhin ang camera mas malapit.","tr":"Hiçbir şey net değil — kamerayı yaklaştırın.","zh":"看不清 — 把摄像头移近。","ru":"Ничего не видно — приблизьте камеру.","es":"Nada claro — acerque la cámara.","ml":"എന്തും വ്യക്തമല്ല — ക്യാമറ അടുപ്പിക്കുക."},"انتهت حصة المرشد اليوم.":{"fr":"Limite quotidienne du guide visuel atteinte.","hi":"विजुअल गाइड की दैनिक सीमा पहुंच गई।","bn":"ভিজুয়াল গাইডের দৈনিক সীমা পৌঁছেছে।","ne":"विजुअल गाइडको दैनिक सीमा पहुँचेको छ।","id":"Batas harian Panduan Visual tercapai.","fil":"Naabot na ang daily limit ng Visual Guide.","tr":"Görsel Rehber günlük sınırına ulaşıldı.","zh":"视觉指南每日限额已达。","ru":"Достигнут дневной лимит визуального руководства.","es":"Se alcanzó el límite diario de la guía visual.","ml":"വിജ്ഞാപന ഗൈഡിന്റെ ദൈനിക പരിധി എത്തിയിരിക്കുന്നു."},"انتهت حصة المرشد البصري اليوم. تعود غدًا.":{"fr":"Votre allocation de guide visuel est utilisée pour aujourd'hui. Elle réinitialise demain.","hi":"आपका विजुअल गाइड भत्ता आज के लिए उपयोग हो गया है। यह कल रीसेट होगा।","bn":"আপনার ভিজুয়াল গাইড ভাতা আজকের জন্য ব্যবহার হয়েছে। এটি আগামীকাল রিসেট হবে।","ne":"तपाईंको विजुअल गाइड भत्ता आज को लागि प्रयोग भएको छ। यो भोलि रिसेट हुनेछ।","id":"Tunjangan Panduan Visual Anda telah digunakan untuk hari ini. Akan direset besok.","fil":"Ang iyong Visual Guide allowance ay nagamit na para sa araw na ito. Ire-reset bukas.","tr":"Görsel Rehber ödetiginiz bugün için kullanıldı. Yarın sıfırlanacak.","zh":"您的视觉指南配额已用于今天。明天会重置。","ru":"Ваш лимит визуального руководства использован на сегодня. Он сбросится завтра.","es":"Su asignación de guía visual se utilizó para hoy. Se restablecerá mañana.","ml":"നിങ്ങളുടെ വിജ്ഞാപന ഗൈഡ് അനുവദം ഇന്നത്തെ ദിനത്തിന് ഉപയോഗിക്കപ്പെട്ടിരിക്കുന്നു. ഇത് നാളെ പുനരാരംഭിക്കപ്പെടും."},"تعذّر التحليل — أعد المحاولة.":{"fr":"Échec de l'analyse — réessayez.","hi":"विश्लेषण विफल — फिर से कोशिश करें।","bn":"বিশ্লেষণ ব্যর্থ — আবার চেষ্টা করুন।","ne":"विश्लेषण असफल — फेरि प्रयास गर्नुहोस्।","id":"Analisis gagal — coba lagi.","fil":"Nabigong mag-analisa — subukan ulit.","tr":"Analiz başarısız — tekrar deneyin.","zh":"分析失败 — 请重试。","ru":"Анализ не удался — повторите попытку.","es":"Análisis fallido — intente de nuevo.","ml":"വിശകലനം പരാജയപ്പെട്ടു — വീണ്ടും ശ്രമിക്കുക."},"أراقب وأصف تلقائيًا — والمس الشاشة لسؤال فوري.":{"fr":"Observation et description — tapotez l'écran pour poser une question maintenant.","hi":"देख रहा हूँ और वर्णन कर रहा हूँ — अभी पूछने के लिए स्क्रीन टैप करें।","bn":"দেখছি এবং বর্ণনা করছি — এখনই প্রশ্ন করতে স্ক্রিন ট্যাপ করুন।","ne":"हेर्दै र वर्णन गर्दै छु — अहिले सोध्न स्क्रिन ट्याप गर्नुहोस्।","id":"Menonton dan menjelaskan — ketuk layar untuk bertanya sekarang.","fil":"Nanonood at naglalarawan — i-tap ang screen para magtanong ngayon.","tr":"İzliyor ve anlatıyor — sorulmak için ekrana dokunun.","zh":"正在观察和描述 — 点击屏幕立即提问。","ru":"Смотрю и описываю — коснитесь экрана, чтобы спросить сейчас.","es":"Observando y describiendo — toque la pantalla para preguntar ahora.","ml":"നിരീക്ഷണം ചെയ്യുന്നു കൂടാതെ വിവരിക്കുന്നു — ഇപ്പോൾ പ്രശ്നം ചോദിക്കാൻ സ്ക്രീൻ ടാപ് ചെയ്യുക."},"وضع وصف المحيط. حرّك الهاتف ببطء وسأصف لك ما يتغيّر. اضغط على الشاشة لسؤال فوري.":{"fr":"Mode description. Bougez lentement et je décrirai ce qui change. Tapotez l'écran pour poser une question maintenant.","hi":"विवरण मोड। धीरे-धीरे चलाएं और मैं बताऊंगा कि क्या बदल रहा है। अभी पूछने के लिए स्क्रीन टैप करें।","bn":"বর্ণনা মোড। ধীরে ধীরে নড়ান এবং আমি বলব কী পরিবর্তন হচ্ছে। এখনই প্রশ্ন করতে স্ক্রিন ট্যাপ করুন।","ne":"वर्णन मोड। बिस्तारै सार्नुहोस् र मैले बताउँछु कि के परिवर्तन हुँदै छ। अहिले सोध्न स्क्रिन ट्याप गर्नुहोस्।","id":"Mode deskripsi. Bergerak perlahan dan saya akan menjelaskan apa yang berubah. Ketuk layar untuk bertanya sekarang.","fil":"Describe mode. Gumalaw nang mabagal at aaraw-arayan ko ang nagbabago. I-tap ang screen para magtanong ngayon.","tr":"Açıklama modu. Yavaş hareket edin ve ne değiştiğini anlatacağım. Sorulmak için ekrana dokunun.","zh":"描述模式。缓慢移动，我会描述变化。点击屏幕立即提问。","ru":"Режим описания. Двигайтесь медленно, и я опишу, что изменяется. Коснитесь экрана, чтобы спросить сейчас.","es":"Modo descripción. Muévase lentamente y describiré lo que cambia. Toque la pantalla para preguntar ahora.","ml":"വിവരണ മോഡ്. സാവധാനം നീങ്ങുക, ഞാൻ എന്താണ് മാറിക്കൊണ്ടിരിക്കുന്നതെന്ന് വിവരിക്കും. ഇപ്പോൾ പ്രശ്നം ചോദിക്കാൻ സ്ക്രീൻ ടാപ് ചെയ്യുക."},"👆 وجّه الكاميرا إلى النص ثم المس الشاشة لألتقط وأقرأ.":{"fr":"👆 Pointez sur le texte, puis tapotez l'écran pour capturer.","hi":"👆 पाठ की ओर इशारा करें, फिर कैप्चर करने के लिए स्क्रीन टैप करें।","bn":"👆 পাঠের দিকে নির্দেশ করুন, তারপর ক্যাপচার করতে স্ক্রিন ট্যাপ করুন।","ne":"👆 पाठ तर्फ औंल्याउनुहोस्, त्यसपछी क्याप्चर गर्न स्क्रिन ट्याप गर्नुहोस्।","id":"👆 Arahkan ke teks, lalu ketuk layar untuk menangkap.","fil":"👆 Ituro ang texto, tapos i-tap ang screen para makuha.","tr":"👆 Metne işaret edin, ardından ekrana dokunarak yakala.","zh":"👆 指向文本，然后点击屏幕捕获。","ru":"👆 Укажите на текст, затем коснитесь экрана, чтобы захватить.","es":"👆 Señale el texto, luego toque la pantalla para capturar.","ml":"👆 വാചകത്തിലേക്ക് ചൂണ്ടിക്കാണിക്കുക, തുടർന്ന് ക്യാപ്ചർ ചെയ്യാൻ സ്ക്രീൻ ടാപ് ചെയ്യുക."},"وضع القراءة. وجّه الكاميرا إلى النص ثم اضغط على الشاشة.":{"fr":"Mode lecture. Pointez sur le texte, puis tapotez l'écran.","hi":"पढ़ने का मोड। पाठ की ओर इशारा करें, फिर स्क्रीन टैप करें।","bn":"পড়ার মোড। পাঠের দিকে নির্দেশ করুন, তারপর স্ক্রিন ট্যাপ করুন।","ne":"पठन मोड। पाठ तर्फ औंल्याउनुहोस्, त्यसपछी स्क्रिन ट्याप गर्नुहोस्।","id":"Mode baca. Arahkan ke teks, lalu ketuk layar.","fil":"Read mode. Ituro ang texto, tapos i-tap ang screen.","tr":"Okuma modu. Metne işaret edin, ardından ekrana dokunun.","zh":"阅读模式。指向文本，然后点击屏幕。","ru":"Режим чтения. Укажите на текст, затем коснитесь экрана.","es":"Modo lectura. Señale el texto, luego toque la pantalla.","ml":"വായന മോഡ്. വാചകത്തിലേക്ക് ചൂണ്ടിക്കാണിക്കുക, തുടർന്ന് സ്ക്രീൻ ടാപ് ചെയ്യുക."},"👆 وجّه الكاميرا إلى أي نص ثم المس الشاشة وسأترجمه.":{"fr":"👆 Pointez sur n'importe quel texte, puis tapotez l'écran pour traduire.","hi":"👆 किसी भी पाठ की ओर इशारा करें, फिर अनुवाद करने के लिए स्क्रीन टैप करें।","bn":"👆 যেকোনো পাঠের দিকে নির্দেশ করুন, তারপর অনুবাদ করতে স্ক্রিন ট্যাপ করুন।","ne":"👆 कुनै पनि पाठ तर्फ औंल्याउनुहोस्, त्यसपछी अनुवाद गर्न स्क्रिन ट्याप गर्नुहोस्।","id":"👆 Arahkan ke teks apa pun, lalu ketuk layar untuk menerjemahkan.","fil":"👆 Ituro ang anumang teksto, tapos i-tap ang screen para isalin.","tr":"👆 Herhangi bir metne işaret edin, ardından ekrana dokunarak çevirin.","zh":"👆 指向任何文本，然后点击屏幕翻译。","ru":"👆 Укажите на любой текст, затем коснитесь экрана, чтобы перевести.","es":"👆 Señale cualquier texto, luego toque la pantalla para traducir.","ml":"👆 ഏതെങ്കിലും വാചകത്തിലേക്ക് ചൂണ്ടിക്കാണിക്കുക, തുടർന്ന് വിവർത്തനം ചെയ്യാൻ സ്ക്രീൻ ടാപ് ചെയ്യുക."},"وضع الترجمة. وجّه الكاميرا إلى أي نص — لافتة أو قائمة أو عبوة — ثم اضغط على الشاشة وسأترجمه لك.":{"fr":"Mode traduction. Pointez sur n'importe quel texte — une pancarte, un menu ou un emballage — puis tapotez l'écran et je vais le traduire.","hi":"अनुवाद मोड। किसी भी पाठ की ओर इशारा करें — एक संकेत, मेनू या पैकेज — फिर स्क्रीन टैप करें और मैं इसका अनुवाद करूंगा।","bn":"অনুবাদ মোড। যেকোনো পাঠের দিকে নির্দেশ করুন — একটি চিহ্ন, মেনু বা প্যাকেজ — তারপর স্ক্রিন ট্যাপ করুন এবং আমি এটি অনুবাদ করব।","ne":"अनुवाद मोड। कुनै पनि पाठ तर्फ औंल्याउनुहोस् — एक चिह्न, मेनु वा प्याकेज — त्यसपछी स्क्रिन ट्याप गर्नुहोस् र मैले यसको अनुवाद गर्छु।","id":"Mode terjemahan. Arahkan ke teks apa pun — papan, menu atau paket — lalu ketuk layar dan saya akan menerjemahkannya.","fil":"Translate mode. Ituro ang anumang teksto — isang sign, menu o package — tapos i-tap ang screen at ituturo ko ito.","tr":"Çeviri modu. Herhangi bir metne işaret edin — bir işaret, menü veya paket — ardından ekrana dokunun ve ben çevireceğim.","zh":"翻译模式。指向任何文本——标签、菜单或包装——然后点击屏幕，我会翻译它。","ru":"Режим перевода. Укажите на любой текст — вывеску, меню или упаковку — затем коснитесь экрана, и я переведу его.","es":"Modo traducción. Señale cualquier texto — un cartel, menú o paquete — luego toque la pantalla y lo traduciré.","ml":"വിവർത്തന മോഡ്. ഏതെങ്കിലും വാചകത്തിലേക്ക് ചൂണ്ടിക്കാണിക്കുക — ഒരു ചിഹ്നം, മെനു അല്ലെങ്കിൽ പാക്കേജ് — തുടർന്ന് സ്ക്രീൻ ടാപ് ചെയ്യുക, ഞാൻ അത് വിവർത്തനം ചെയ്യും."},"👆 المس الشاشة، أو اضغط زر الميكروفون واسأل بصوتك.":{"fr":"👆 Tapotez l'écran, ou appuyez sur le bouton micro et posez votre question par voix.","hi":"👆 स्क्रीन टैप करें, या माइक बटन दबाएं और अपनी आवाज में पूछें।","bn":"👆 স্ক্রিন ট্যাপ করুন, অথবা মাইক বাটন চাপুন এবং আপনার কণ্ঠে প্রশ্ন করুন।","ne":"👆 स्क्रिन ट्याप गर्नुहोस्, वा माइक बटन दबाउनुहोस् र आफ्नो आवाजमा सोध्नुहोस्।","id":"👆 Ketuk layar, atau tekan tombol mikrofon dan tanyakan dengan suara Anda.","fil":"👆 I-tap ang screen, o pindutin ang mic button at magtanong ng boses.","tr":"👆 Ekrana dokunun, veya mikrofon düğmesine basıp sesinizle sorun.","zh":"👆 点击屏幕，或按麦克风按钮用语音提问。","ru":"👆 Коснитесь экрана или нажмите кнопку микрофона и спросите голосом.","es":"👆 Toque la pantalla, o presione el botón de micrófono y pregunte por voz.","ml":"👆 സ്ക്രീൻ ടാപ് ചെയ്യുക അല്ലെങ്കിൽ മൈക് ബട്ടൺ അമർത്തി വോയിസിൽ ചോദിക്കുക."},"وضع السؤال. وجّه الكاميرا إلى أي شيء ثم اضغط على الشاشة، أو اضغط زر الميكروفون واسأل بصوتك.":{"fr":"Mode question. Pointez sur n'importe quoi puis tapotez l'écran, ou appuyez sur le bouton microphone et posez votre question par voix.","hi":"सवाल का मोड। कुछ भी इशारा करें फिर स्क्रीन टैप करें, या माइक्रोफोन बटन दबाएं और अपनी आवाज में पूछें।","bn":"প্রশ্ন মোড। যেকোনো কিছুর দিকে নির্দেশ করুন তারপর স्크ीন ট्যाप करুन, अथबा माइक्रोफोन बटन दबाएं।","ne":"सवाल मोड। कुनै पनि कुरा तर्फ औंल्याउनुहोस् त्यसपछी स्क्रिन ट्याप गर्नुहोस्, वा माइक्रोफोन बटन दबाउनुहोस् र आफ्नो आवाजमा सोध्नुहोस्।","id":"Mode tanya. Arahkan ke apa pun lalu ketuk layar, atau tekan tombol mikrofon dan tanyakan dengan suara Anda.","fil":"Ask mode. Ituro ang anumang bagay tapos i-tap ang screen, o pindutin ang microphone button at magtanong ng boses.","tr":"Soru modu. Herhangi bir şeye işaret edin sonra ekrana dokunun, veya mikrofon düğmesine basıp sesinizle sorun.","zh":"提问模式。指向任何东西然后点击屏幕，或按麦克风按钮用语音提问。","ru":"Режим вопроса. Укажите на что-то, затем коснитесь экрана, или нажмите кнопку микрофона и спросите голосом.","es":"Modo pregunta. Señale cualquier cosa, luego toque la pantalla, o presione el botón de micrófono y pregunte por voz.","ml":"ചോദ്യ മോഡ്. എന്തെങ്കിലും ചൂണ്ടിക്കാണിക്കുക തുടർന്ന് സ്ക്രീൻ ടാപ് ചെയ്യുക, അല്ലെങ്കിൽ മൈക്രോഫോൻ ബട്ടൺ അമർത്തി വോയിസിൽ ചോദിക്കുക."},"أرشدك تلقائيًا خطوة بخطوة — أرني ما بين يديك.":{"fr":"Je vous guide étape par étape — montrez-moi vos mains.","hi":"मैं आपको चरण दर चरण मार्गदर्शन कर रहा हूँ — मुझे अपने हाथ दिखाएं।","bn":"আমি আপনাকে ধাপে ধাপে গাইড করছি — আমাকে আপনার হাত দেখান।","ne":"मैले तपाईंलाई चरण दर चरण मार्गदर्शन गर्दै छु — मलाई आपको हाथ देखाउनुहोस्।","id":"Saya membimbing Anda langkah demi langkah — tunjukkan tangan Anda.","fil":"Ginagabayan kita hakbang sa hakbang — ipakita mo ang iyong mga kamay.","tr":"Sizi adım adım rehber ediyorum — ellerinizi bana gösterin.","zh":"我正在逐步指导您 — 让我看看你的手。","ru":"Я направляю вас шаг за шагом — покажите мне свои руки.","es":"Te guío paso a paso — muéstrame tus manos.","ml":"ഞാൻ നിങ്ങളെ ഘട്ടം ഘട്ടമായി നയിക്കുന്നു — എനിക്ക് നിങ്ങളുടെ കൈകൾ കാണിക്കുക."},"وضع الإرشاد خطوة بخطوة. أرني ما بين يديك وسأرشدك.":{"fr":"Mode étape par étape. Montrez-moi vos mains et je vous guiderai.","hi":"चरण दर चरण मोड। मुझे अपने हाथ दिखाएं और मैं आपको मार्गदर्शन दूंगा।","bn":"ধাপে ধাপে মোড। আমাকে আপনার হাত দেখান এবং আমি আপনাকে গাইড করব।","ne":"चरण दर चरण मोड। मलाई आपको हाथ देखाउनुहोस् र मैले तपाईंलाई मार्गदर्शन गर्छु।","id":"Mode langkah demi langkah. Tunjukkan tangan Anda dan saya akan membimbing Anda.","fil":"Step by step mode. Ipakita mo ang iyong mga kamay at gagabayan kita.","tr":"Adım adım modu. Ellerinizi bana gösterin ve sizi rehber edeceğim.","zh":"逐步模式。让我看看你的手，我会指导你。","ru":"Пошаговый режим. Покажите мне свои руки, и я вас направлю.","es":"Modo paso a paso. Muéstrame tus manos y te guiaré.","ml":"ഘട്ടം ഘട്ടമായുള്ള മോഡ്. എനിക്ക് നിങ്ങളുടെ കൈകൾ കാണിക്കുക, ഞാൻ നിങ്ങളെ നയിക്കും."},"خطوة ":{"fr":"Étape ","hi":"चरण ","bn":"ধাপ ","ne":"चरण ","id":"Langkah ","fil":"Hakbang ","tr":"Adım ","zh":"步骤 ","ru":"Шаг ","es":"Paso ","ml":"ഘട്ടം "},"اكتب سؤالك:":{"fr":"Tapez votre question :","hi":"अपना सवाल टाइप करें:","bn":"আপনার প্রশ্ন টাইপ করুন:","ne":"आफ्नो सवाल टाइप गर्नुहोस्:","id":"Ketik pertanyaan Anda:","fil":"I-type ang iyong tanong:","tr":"Sorunuzu yazın:","zh":"输入您的问题:","ru":"Введите ваш вопрос:","es":"Escriba su pregunta:","ml":"നിങ്ങളുടെ ചോദ്യം ടൈപ്പ് ചെയ്യുക:"},"أسمعك…":{"fr":"Je vous écoute…","hi":"सुन रहा हूँ…","bn":"শুনছি…","ne":"सुन्दै छु…","id":"Mendengarkan…","fil":"Nakikinig…","tr":"Dinleniyor…","zh":"正在倾听…","ru":"Слушаю…","es":"Escuchando…","ml":"കേൾക്കുന്നു…"},"لم أسمع شيئًا.":{"fr":"Je n'ai pas entendu.","hi":"मैं समझ नहीं सका।","bn":"আমি বুঝতে পারিনি।","ne":"मैले सुन्न सकिनँ।","id":"Saya tidak mendengar itu.","fil":"Hindi ko narinig iyan.","tr":"Onu anlamadım.","zh":"没有听清。","ru":"Я не расслышал.","es":"No escuché eso.","ml":"ഞാൻ സ്വീകരിച്ചില്ല."},"أوقفت الوصف التلقائي.":{"fr":"Description automatique désactivée.","hi":"स्वचालित विवरण बंद।","bn":"স্বয়ংক্রিয় বর্ণনা বন্ধ।","ne":"स्वचालित विवरण बंद।","id":"Deskripsi otomatis mati.","fil":"Auto description off.","tr":"Otomatik açıklama kapalı.","zh":"自动描述关闭。","ru":"Автоматическое описание отключено.","es":"Descripción automática desactivada.","ml":"സ്വയംക്രിയ വിവരണം അണ്ടാൻ."},"شغّلت الوصف التلقائي.":{"fr":"Description automatique activée.","hi":"स्वचालित विवरण चालू।","bn":"স্বয়ংক্রিয় বর্ণনা চালু।","ne":"स्वचालित विवरण चालू।","id":"Deskripsi otomatis aktif.","fil":"Auto description on.","tr":"Otomatik açıklama açık.","zh":"自动描述开启。","ru":"Автоматическое описание включено.","es":"Descripción automática activada.","ml":"സ്വയംക്രിയ വിവരണം ഓൻ."},"هذا شريط علوي فيه اسم التطبيق وقائمة الخيارات على الطرف.":{"fr":"La barre supérieure : le nom de l'application et le menu des options sur le bord.","hi":"ऊपरी बार: एप्लिकेशन का नाम और विकल्पों का मेनू किनारे पर।","bn":"শীর্ষ বার: অ্যাপের নাম এবং প্রান্তের বিকল্প মেনু।","ne":"शीर्ष पट्टी: एप्लिकेशनको नाम र किनारामा विकल्पहरूको मेनु।","id":"Bilah atas: nama aplikasi dan menu opsi di tepi.","fil":"Ang top bar: app name at ang options menu sa gilid.","tr":"Üst çubuk: uygulama adı ve kenarındaki seçenekler menüsü.","zh":"顶部栏：应用程序名称和边缘的选项菜单。","ru":"Верхняя панель: имя приложения и меню параметров на краю.","es":"La barra superior: nombre de la aplicación y menú de opciones en el borde.","ml":"മുകളിലെ ബാർ: അപ്ലിക്കേഷനിന്റെ പേരും അരികിലെ ഓപ്ഷനുകളുടെ മെനു."},"هذه منطقة المحادثة. كل ما تكتبه ويرد به الذكاء يظهر هنا.":{"fr":"La zone de chat. Tout ce que vous et l'IA dites s'affiche ici.","hi":"चैट क्षेत्र। आप और कृत्रिम बुद्धि जो कुछ भी कहते हैं वह यहाँ दिखाई देता है।","bn":"চ্যাট এলাকা। আপনি এবং কৃত্রিম বুদ্ধিমত্তা যা কিছু বলেন তা এখানে দেখা যায়।","ne":"च्याट क्षेत्र। तपाई र कृत्रिम बुद्धि जो कुरा भन्नु भएको हुन्छ सबै यहाँ देखा पर्छ।","id":"Area obrolan. Semua yang Anda dan AI katakan muncul di sini.","fil":"Ang chat area. Ang lahat ng sinasabi mo at ng AI ay lalabas dito.","tr":"Sohbet alanı. Siz ve AI tarafından söylenen her şey burada görüntülenir.","zh":"聊天区域。您和人工智能说的一切都显示在这里。","ru":"Область чата. Все, что вы и ИИ говорите, отображается здесь.","es":"El área de chat. Todo lo que usted y la IA dicen aparece aquí.","ml":"ചാറ്റ് പ്രദേശം. നിങ്ങൾ സ്ഥാപിതനും കൃത്രിമ ബുദ്ധിയും പറയുന്ന എല്ലാ കാര്യങ്ങളും ഇവിടെ പ്രത്യക്ഷപ്പെടുന്നു."},"هنا تكتب طلبك. اكتب ما تريد بناءه أو اسأل أي سؤال.":{"fr":"Tapez votre demande ici — ce que vous voulez construire ou n'importe quelle question.","hi":"यहाँ अपना अनुरोध टाइप करें — क्या बनाना है या कोई भी सवाल।","bn":"এখানে আপনার অনুরোধ টাইप করুন — কী তৈরি করতে হবে বা কোনো প্রশ্ন।","ne":"यहाँ आफ्नो अनुरोध टाइप गर्नुहोस् — के बनाउनु हो वा कुनै सवाल।","id":"Ketik permintaan Anda di sini — apa yang ingin Anda buat atau pertanyaan apa pun.","fil":"I-type ang iyong request dito — ano ang gusto mong itayo o anumang tanong.","tr":"Talebinizi buraya yazın — ne inşa etmek istediğiniz veya herhangi bir soru.","zh":"在此输入您的请求 — 要构建的内容或任何问题。","ru":"Введите ваш запрос здесь — что вы хотите построить или любой вопрос.","es":"Escriba su solicitud aquí — qué desea construir o cualquier pregunta.","ml":"നിങ്ങളുടെ അഭ്യർത്ഥന ഇവിടെ ടൈപ്പ് ചെയ്യുക — എന്താണ് നിർമ്മാണം ചെയ്യണ്ടതെന്ന് അല്ലെങ്കിൽ ഏതെങ്കിലും ചോദ്യം."},"هذا زر مها، المساعدة الصوتية. اضغطه لتتحدث معها بصوتك، ويمكنك سحبه لأي مكان.":{"fr":"C'est Maha, l'assistant vocal. Appuyez pour parler, faites-la glisser pour la déplacer.","hi":"यह माहा है, आवाज सहायक। बात करने के लिए टैप करें, इसे स्थानांतरित करने के लिए खींचें।","bn":"এটি মাহা, ভয়েস সহায়ক। কথা বলতে ট্যাপ করুন, এটি সরাতে ড্র্যাগ করুন।","ne":"यो माहा हो, आवाज सहायक। कुरा गर्न ट्याप गर्नुहोस्, यसलाई सार्न ड्र्याग गर्नुहोस्।","id":"Ini Maha, asisten suara. Sentuh untuk berbicara, seret untuk memindahkannya.","fil":"Ito si Maha, ang voice assistant. Mag-tap para magsalita, i-drag para ilipat ito.","tr":"Bu Maha, sesli asistan. Konuşmak için dokunun, taşımak için sürükleyin.","zh":"这是玛哈，语音助手。点击说话，拖动移动。","ru":"Это Маха, голосовой помощник. Нажмите, чтобы говорить, перетащите, чтобы переместить.","es":"Este es Maha, el asistente de voz. Toque para hablar, arrastre para moverlo.","ml":"ഇതാണ് മാഹ, വോയിസ് അസിസ്ട്യന്റ്. സംസാരിക്കാൻ ടാപ് ചെയ്യുക, നീക്കാൻ വലിച്ചിടുക."},"وهذا المرشد البصري الذي تستخدمه الآن — عينك على ما حولك.":{"fr":"C'est le guide visuel que vous utilisez maintenant — vos yeux sur le monde.","hi":"यह विजुअल गाइड है जो आप अभी उपयोग कर रहे हैं — दुनिया पर आपकी नजर।","bn":"এটি ভিজুয়াল গাইড যা আপনি এখন ব্যবহার করছেন — বিশ্বে আপনার চোখ।","ne":"यो भिजुअल गाइड हो जुन तपाई अहिले प्रयोग गर्दै हुनुहुन्छ — संसारमा आपको आँखा।","id":"Ini adalah Panduan Visual yang Anda gunakan sekarang — mata Anda di dunia.","fil":"Ito ang Visual Guide na ginagamit mo ngayon — ang iyong mga mata sa mundo.","tr":"Bu, şu anda kullandığınız Görsel Rehber — dünyadaki gözleriniz.","zh":"这是你现在使用的视觉指南 — 你对世界的眼睛。","ru":"Это визуальное руководство, которое вы сейчас используете — ваши глаза на мир.","es":"Esta es la Guía Visual que estás usando ahora — tus ojos en el mundo.","ml":"ഇതാണ് നിങ്ങൾ ഇപ്പോൾ ഉപയോഗിക്കുന്ന വിഷ്വൽ ഗൈഡ് — ലോകത്തിൽ നിങ്ങളുടെ കണ്ണ്."},"المحادثات: كل مشاريعك ومحادثاتك السابقة محفوظة هنا.":{"fr":"Chats : tous vos projets enregistrés et conversations passées.","hi":"चैट: आपकी सभी सहेजी गई परियोजनाएं और पिछली बातचीत।","bn":"চ্যাট: আপনার সমস্ত সংরক্ষিত প্রকল্প এবং অতীত কথোপকথন।","ne":"च्याटहरू: तपाईको सबै सहेजिएको परियोजनाहरू र अघिल्लो कुराकानी।","id":"Obrolan: semua proyek tersimpan dan percakapan masa lalu Anda.","fil":"Chats: lahat ng iyong saved projects at nakaraang conversations.","tr":"Sohbetler: kayıtlı projeleriniz ve geçmiş konuşmalarınız.","zh":"聊天：所有已保存的项目和过去的对话。","ru":"Чаты: все ваши сохраненные проекты и прошлые беседы.","es":"Chats: todos sus proyectos guardados y conversaciones pasadas.","ml":"ചാറ്റുകൾ: നിങ്ങളുടെ സമ്പൂർണ്ണ സംരക്ഷിത പ്രകൽപനങ്ങളും കഴിഞ്ഞ സംഭാഷണങ്ങളും."},"الإعدادات: اللغة والصوت والحساب. تجد اللغة العربية وثلاث عشرة لغة أخرى.":{"fr":"Paramètres : langue, voix et compte.","hi":"सेटिंग्स: भाषा, आवाज और खाता।","bn":"সেটিংস: ভাষা, ভয়েস এবং অ্যাকাউন্ট।","ne":"सेटिङ्सहरू: भाषा, आवाज र खाता।","id":"Pengaturan: bahasa, suara dan akun.","fil":"Settings: wika, tinig at account.","tr":"Ayarlar: dil, ses ve hesap.","zh":"设置：语言、语音和帐户。","ru":"Параметры: язык, голос и аккаунт.","es":"Configuración: idioma, voz y cuenta.","ml":"സെറ്റിങ്ങുകൾ: ഭാഷ, വോയിസ് കൂടാതെ അക്കൌണ്ട്."}};
  function vgLang() {
    try { var l = (typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar'; return l === 'ur' ? 'ar' : l; }
    catch (e) { return 'ar'; }
  }
  function t(ar, en) {
    var l = vgLang();
    if (l === 'ar') return ar;
    if (l === 'en') return en;
    var m = (typeof VG_XL !== 'undefined') && VG_XL[ar];
    return (m && m[l]) || en;
  }

  function authToken() {
    try { return typeof authGet === 'function' ? authGet('aiapp_auth_token') : null; }
    catch (e) { return null; }
  }
  function guestId() {
    try { return typeof window.getGuestId === 'function' ? window.getGuestId() : null; }
    catch (e) { return null; }
  }
  function cancelPending() {
    if (S.request && typeof S.request.abort === 'function') {
      try { S.request.abort(); } catch (e) { __swallow(e, 'vg:abort'); }
    }
    S.request = null;
  }
  function stopListening() {
    if (S.recognition && typeof S.recognition.stop === 'function') {
      try { S.recognition.stop(); } catch (e) { __swallow(e, 'vg:stop-listening'); }
    }
    S.recognition = null;
  }

  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 30); }
    catch (e) { /* الاهتزاز رفاهية — غيابه لا يعطّل شيئًا */ }
  }

  /** يعلن نصًا لقارئ الشاشة وينطقه إن كان الصوت مفعّلًا */
  function announce(text, speak) {
    var live = $id('vgLive');
    if (live) live.textContent = text;
    if (speak && S.speakOn && typeof speakSmart === 'function') {
      try { speakSmart(text); }
      catch (e) { __swallow(e, 'vg:speak'); }
    }
  }

  function setStatus(text) {
    var el = $id('vgStatus');
    if (el) el.textContent = text;
  }

  function setResult(text) {
    var el = $id('vgResult');
    if (!el) return;
    el.textContent = text;
    el.scrollTop = 0;
  }

  function shutUp() {
    if (typeof stopAllSpeaking === 'function') {
      try { stopAllSpeaking(); }
      catch (e) { __swallow(e, 'vg:stopspeak'); }
    }
  }

  /* ---------------- الكاميرا ---------------- */

  /* v-vg-cam2: فشل الكاميرا كان رسالة واحدة عامة بلا أثر — الآن نميّز السبب
   * (إذن مرفوض / لا كاميرا / مشغولة)، نبلّغ لوحة الأخطاء حتى نشخّص عن بُعد،
   * وداخل تطبيق أندرويد نفتح إعدادات التطبيق مباشرة ليمنح الإذن. */
  function camFail(err) {
    var name = (err && err.name) || '';
    console.error('[visual-guide] camera denied:', name, err);
    try {
      fetch('/api/system?action=client-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'VG CAMERA FAIL: ' + (name || '?') + ' — ' + String((err && err.message) || err).slice(0, 200),
          source: 'visual-guide',
          url: location.href,
          ua: navigator.userAgent
        }),
        keepalive: true
      }).catch(function () { /* guard-ok: الإبلاغ نفسه لا يعطّل شيئًا */ });
    } catch (e) { __swallow(e, 'vg:report'); }

    var inApp = false;
    try { inApp = typeof window.omranLikelyApp === 'function' && window.omranLikelyApp(); }
    catch (e) { __swallow(e, 'vg:inapp'); }

    var msg;
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
      msg = t('لم أجد كاميرا على هذا الجهاز.', 'No camera found on this device.');
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      msg = t('الكاميرا مشغولة بتطبيق آخر — أغلقه وجرّب من جديد.',
              'Camera is busy in another app — close it and retry.');
    } else if (inApp) {
      msg = t('إذن الكاميرا مرفوض — أفتح لك إعدادات التطبيق: اضغط «الأذونات» واسمح بالكاميرا ثم ارجع.',
              'Camera permission denied — opening app settings: tap Permissions, allow Camera, then come back.');
      // v10 من تطبيق أندرويد يفهم هذا الرابط ويفتح صفحة إعدادات التطبيق؛
      // النسخ الأقدم تتجاهله بصمت فلا ضرر.
      setTimeout(function () {
        try { location.href = 'omran-app://settings'; }
        catch (e) { __swallow(e, 'vg:appset'); }
      }, 1600);
    } else {
      msg = t('تعذّر فتح الكاميرا. اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح.',
              'Camera unavailable. Please allow camera access in browser settings.');
    }
    announce(msg, true);
  }

  async function camOn() {
    if (S.stream) return true;
    // v-vg-cam3: NotReadableError يعني الكاميرا محجوزة — قد تكون ميزة ثانية
    // عندنا (كاميرا مها) ما زالت ماسكتها، فنحررها قبل المحاولة
    try { if (typeof mahaCameraOff === 'function') mahaCameraOff(); }
    catch (e) { __swallow(e, 'vg:mahacam'); }
    var lastErr = null;
    for (var attempt = 0; attempt < 3 && !S.stream; attempt++) {
      if (attempt === 2) {
        // المحاولة الثالثة فقط لحجز عابر للكاميرا — ننتظر ثم نعيد
        var n = lastErr && lastErr.name;
        if (n !== 'NotReadableError' && n !== 'TrackStartError' && n !== 'AbortError') break;
        await new Promise(function (r) { setTimeout(r, 900); });
      }
      try {
        S.stream = await navigator.mediaDevices.getUserMedia(attempt === 0
          ? { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }
          : { video: true, audio: false });
      } catch (e) {
        if (e && e.name) lastErr = e; else if (!lastErr) lastErr = e;
      }
    }
    if (!S.stream) { camFail(lastErr); return false; }
    var v = $id('vgVideo');
    if (v) {
      v.srcObject = S.stream;
      v.setAttribute('playsinline', '');
      try { await v.play(); }
      catch (e) { __swallow(e, 'vg:play'); }
    }
    return true;
  }

  function camOff() {
    if (S.stream) {
      try { S.stream.getTracks().forEach(function (tr) { tr.stop(); }); }
      catch (e) { __swallow(e, 'vg:camoff'); }
      S.stream = null;
    }
    var v = $id('vgVideo');
    if (v) v.srcObject = null;
    S.torch = false;
    var b = $id('vgTorch');
    if (b) b.classList.remove('on');
  }

  async function toggleTorch() {
    if (!S.stream) return;
    var track = S.stream.getVideoTracks()[0];
    if (!track) return;
    var caps = {};
    try { caps = track.getCapabilities ? track.getCapabilities() : {}; }
    catch (e) { __swallow(e, 'vg:caps'); }
    if (!caps.torch) {
      announce(t('الإضاءة غير مدعومة على هذا الجهاز.', 'Torch not supported on this device.'), true);
      return;
    }
    S.torch = !S.torch;
    try { await track.applyConstraints({ advanced: [{ torch: S.torch }] }); }
    catch (e) { __swallow(e, 'vg:torch'); }
    var b = $id('vgTorch');
    if (b) b.classList.toggle('on', S.torch);
  }

  /* ---------------- الالتقاط ---------------- */

  function grabCanvas(maxDim) {
    var v = $id('vgVideo');
    if (!v || !v.videoWidth) return null;
    var scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(v.videoWidth * scale));
    c.height = Math.max(1, Math.round(v.videoHeight * scale));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c;
  }

  function grabFrame() {
    var c = grabCanvas(CFG.maxDim);
    return c ? c.toDataURL('image/jpeg', CFG.jpegQ) : null;
  }

  /*
   * بوّابة التكلفة: قبل أي نداء للنموذج نقارن إطارًا مصغّرًا جدًا
   * (48×48 رمادي) بالإطار السابق محليًا. إن لم يتغيّر المشهد فعليًا
   * لا نُنفق نداءً. هذا يحوّل «وصف مستمر» من ٦٠ نداءً في الدقيقة
   * إلى بضعة نداءات عند الحركة الحقيقية فقط.
   */
  function sceneProbe() {
    var c = grabCanvas(CFG.probeSize);
    if (!c) return null;
    var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    var gray = new Uint8Array(c.width * c.height);
    for (var i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    }
    return gray;
  }

  function sceneChanged() {
    var now = sceneProbe();
    if (!now) return false;
    var prev = S.lastProbe;
    S.lastProbe = now;
    if (!prev || prev.length !== now.length) return true;
    var diff = 0;
    for (var i = 0; i < now.length; i++) {
      if (Math.abs(now[i] - prev[i]) > 26) diff++;
    }
    return (diff / now.length) > CFG.diffThreshold;
  }

  /* ---------------- التوجيهات لكل وضع ---------------- */

  function systemFor(mode) {
    var common = 'أنت عين لشخص كفيف أو ضعيف البصر ينظر عبر كاميرا هاتفه. '
      + 'أجب بلغة السؤال نفسها. اكتب نصًا منطوقًا: بلا رموز، بلا نقاط تعداد، بلا مقدمات، بلا وصف لنفسك. ';

    if (mode === 'read') {
      return common
        + 'مهمتك الآن القراءة الحرفية: اقرأ كل نص ظاهر في الصورة كما هو تمامًا — '
        + 'الأدوية والجرعات، الفواتير والمبالغ، اللافتات، القوائم، التواريخ، أرقام الهواتف. '
        + 'لا تلخّص ولا تعيد الصياغة. إن كان النص بلغة أخرى فاقرأه ثم ترجمه في جملة واحدة. '
        + 'إن لم يكن هناك نص واضح فقل ذلك في جملة واحدة واقترح تقريب الكاميرا أو تثبيتها.';
    }
    if (mode === 'steps') {
      return common
        + 'أنت ترشده في مهمة عملية خطوة بخطوة وأنت ترى يديه. '
        + 'قل ما يفعله الآن في جملة أو جملتين فقط — الخطوة الحالية لا الخطة كلها. '
        + 'إن رأيت خطأ أو خطرًا نبّه فورًا وبوضوح قبل أي شيء آخر. '
        + 'إن اكتملت الخطوة فقل ذلك وانتقل للتالية. كن موجزًا: هذا كلام منطوق أثناء العمل.';
    }
    return common
      + 'صف المشهد بإيجاز عملي: أهم ثلاثة عناصر ومواضعها بالنسبة له (يمينك، يسارك، أمامك مباشرة، على بعد خطوتين). '
      + 'ابدأ بأي خطر أو عائق إن وُجد — درج، عتبة، باب مفتوح، سيارة، حفرة. '
      + 'اذكر أي نص بارز باختصار. جملتان إلى ثلاث كحد أقصى.';
  }

  function userFor(mode, question) {
    if (question) return question;
    if (mode === 'read') return 'اقرأ لي كل ما هو مكتوب هنا.';
    if (mode === 'translate') return 'ترجم لي كل النص الظاهر هنا.';
    if (mode === 'ask') return 'ما هذا الذي أمامي؟ أجب باختصار مفيد.';
    if (mode === 'steps') {
      S.stepNo++;
      var tail = S.history.length
        ? ' سبق أن قلتَ لي: «' + S.history.slice(-2).join(' ثم ') + '». ماذا أفعل الآن؟'
        : ' ما أول خطوة؟';
      return 'أنا في الخطوة رقم ' + S.stepNo + '.' + tail;
    }
    return 'صف لي ما أمامي الآن.';
  }

  /* ---------------- النداء ---------------- */

  async function analyze(question) {
    if (S.busy || !S.open || !S.stream) return;
    var frame = grabFrame();
    if (!frame) { setStatus(t('لم تثبت الصورة بعد…', 'Stabilising…')); return; }
    var epoch = S.epoch;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    S.request = controller; S.busy = true; S.lastCallAt = Date.now();
    setStatus(t('أنظر…', 'Looking…'));
    var shell = $id('vgShell'); if (shell) shell.classList.add('vg-busy');
    try {
      var response = await fetch('/api/ai?action=visual-guide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller ? controller.signal : undefined,
        body: JSON.stringify({ image: frame, token: authToken(), guestId: guestId(), lang: vgLang(), mode: S.mode, question: userFor(S.mode, question) })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) { var error = new Error(data.error || ('http_' + response.status)); error.status = response.status; throw error; }
      if (epoch !== S.epoch || !S.open) return;
      var text = String(data.text || '').trim();
      if (!text) setStatus(t('لم أتبيّن شيئًا — قرّب الكاميرا.', 'Nothing clear — move closer.'));
      else {
        setResult(text); setStatus('');
        if (S.mode === 'steps') { S.history.push(text.slice(0, 160)); if (S.history.length > 6) S.history.shift(); }
        buzz(20); announce(text, true);
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (epoch !== S.epoch || !S.open) return;
      console.error('[visual-guide] vision failed:', e);
      if ((e && e.status === 429) || /limit|quota|429/i.test(String((e && e.message) || ''))) {
        setStatus(t('انتهت حصة المرشد اليوم.', 'Visual Guide daily limit reached.'));
        announce(t('انتهت حصة المرشد البصري اليوم. تعود غدًا.', 'Your Visual Guide allowance is used for today. It resets tomorrow.'), true);
        stopLoop();
      } else setStatus(t('تعذّر التحليل — أعد المحاولة.', 'Analysis failed — try again.'));
    } finally {
      if (S.request === controller) S.request = null;
      if (epoch === S.epoch) { S.busy = false; if (shell) shell.classList.remove('vg-busy'); }
    }
  }

  /* ---------------- الحلقة المختلطة ---------------- */

  function tick() {
    if (!S.open || S.busy || S.mode === 'tour') return;

    var since = Date.now() - S.lastCallAt;
    if (since < CFG.minGapMs) return;

    // بوّابة التكلفة: لا ننفق نداءً على مشهد لم يتغيّر…
    var changed = sceneChanged();

    // …إلا أن الصمت الطويل نفسه مقلق لمن لا يرى. نبضة اطمئنان
    // بعد maxSilenceMs حتى لو كان المشهد ساكنًا تمامًا.
    if (!changed && since < CFG.maxSilenceMs) return;

    analyze(null);
  }

  function startLoop() {
    stopLoop();
    S.lastProbe = null;
    S.timer = setInterval(tick, CFG.tickMs);
    var b = $id('vgAuto');
    if (b) b.classList.add('on');
  }

  function stopLoop() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    var b = $id('vgAuto');
    if (b) b.classList.remove('on');
  }

  function autoOn() { return !!S.timer; }

  /* ---------------- الأوضاع ---------------- */

  var MODE_LABEL = {
    describe: ['وصف المحيط', 'Describe'],
    read: ['قراءة نص', 'Read text'],
    steps: ['خطوة بخطوة', 'Step by step'],
    translate: ['ترجمة فورية', 'Live translate'],
    ask: ['اسأل عمّا تراه', 'Ask about it'],
    tour: ['جولة التطبيق', 'App tour']
  };

  async function setMode(mode) {
    if (!MODE_LABEL[mode]) return;
    var modeEpoch = ++S.epoch;
    cancelPending();
    stopListening();
    S.mode = mode;
    S.history = [];
    S.stepNo = 0;
    S.lastProbe = null;
    shutUp();

    document.querySelectorAll('.vgModeBtn').forEach(function (b) {
      var on = b.getAttribute('data-vgmode') === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    var shell = $id('vgShell');
    if (shell) shell.setAttribute('data-mode', mode);

    if (mode === 'tour') {
      stopLoop();
      camOff();
      startTour();
      return;
    }

    if (shell) shell.classList.remove('vg-tour');
    var ok = await camOn();
    if (modeEpoch !== S.epoch || !S.open) { camOff(); return; }
    if (!ok) return;

    setResult('');
    /* v-eye-hint: التعليمة كانت صوتية فقط (#vgLive مقصوص لقارئات الشاشة) —
       جوال صامت = مستخدم يبدّل الوضع ولا يرى شيئًا فيظنه معطوبًا (شكوى
       عمران: «القراءة وما بعدها لا يعمل»). الآن تظهر مكتوبة في شريط الحالة. */
    if (mode === 'describe') {
      startLoop();
      setStatus(t('أراقب وأصف تلقائيًا — والمس الشاشة لسؤال فوري.', 'Watching and describing — tap the screen to ask now.'));
      announce(t(
        'وضع وصف المحيط. حرّك الهاتف ببطء وسأصف لك ما يتغيّر. اضغط على الشاشة لسؤال فوري.',
        'Describe mode. Move slowly and I will describe what changes. Tap the screen to ask now.'
      ), true);
    } else if (mode === 'read') {
      stopLoop();
      setStatus(t('👆 وجّه الكاميرا إلى النص ثم المس الشاشة لألتقط وأقرأ.', '👆 Point at the text, then tap the screen to capture.'));
      announce(t(
        'وضع القراءة. وجّه الكاميرا إلى النص ثم اضغط على الشاشة.',
        'Read mode. Point at the text, then tap the screen.'
      ), true);
    } else if (mode === 'translate') {
      stopLoop();
      setStatus(t('👆 وجّه الكاميرا إلى أي نص ثم المس الشاشة وسأترجمه.', '👆 Point at any text, then tap the screen to translate.'));
      announce(t(
        'وضع الترجمة. وجّه الكاميرا إلى أي نص — لافتة أو قائمة أو عبوة — ثم اضغط على الشاشة وسأترجمه لك.',
        'Translate mode. Point at any text — a sign, menu or package — then tap the screen and I will translate it.'
      ), true);
    } else if (mode === 'ask') {
      stopLoop();
      setStatus(t('👆 المس الشاشة، أو اضغط زر الميكروفون واسأل بصوتك.', '👆 Tap the screen, or press the mic button and ask by voice.'));
      announce(t(
        'وضع السؤال. وجّه الكاميرا إلى أي شيء ثم اضغط على الشاشة، أو اضغط زر الميكروفون واسأل بصوتك.',
        'Ask mode. Point at anything then tap the screen, or press the microphone button and ask by voice.'
      ), true);
    } else if (mode === 'steps') {
      startLoop();
      setStatus(t('أرشدك تلقائيًا خطوة بخطوة — أرني ما بين يديك.', 'Guiding you step by step — show me your hands.'));
      announce(t(
        'وضع الإرشاد خطوة بخطوة. أرني ما بين يديك وسأرشدك.',
        'Step by step mode. Show me your hands and I will guide you.'
      ), true);
    }
  }

  /* ---------------- جولة داخل التطبيق ---------------- */

  var TOUR = [
    { sel: 'header', ar: 'هذا شريط علوي فيه اسم التطبيق وقائمة الخيارات على الطرف.', en: 'The top bar: app name and the options menu at the edge.' },
    { sel: '#messages', ar: 'هذه منطقة المحادثة. كل ما تكتبه ويرد به الذكاء يظهر هنا.', en: 'The chat area. Everything you and the AI say appears here.' },
    { sel: '#composerBox', ar: 'هنا تكتب طلبك. اكتب ما تريد بناءه أو اسأل أي سؤال.', en: 'Type your request here — what to build, or any question.' },
    { sel: '#btnMaha', ar: 'هذا زر مها، المساعدة الصوتية. اضغطه لتتحدث معها بصوتك، ويمكنك سحبه لأي مكان.', en: 'This is Maha, the voice assistant. Tap to talk, drag to move it.' },
    { sel: '[data-omnav="guide"]', ar: 'وهذا المرشد البصري الذي تستخدمه الآن — عينك على ما حولك.', en: 'This is the Visual Guide you are using now — your eyes on the world.' },
    { sel: '[data-omnav="chats"]', ar: 'المحادثات: كل مشاريعك ومحادثاتك السابقة محفوظة هنا.', en: 'Chats: all your saved projects and past conversations.' },
    { sel: '[data-omnav="settings"]', ar: 'الإعدادات: اللغة والصوت والحساب. تجد اللغة العربية وثلاث عشرة لغة أخرى.', en: 'Settings: language, voice and account.' }
  ];

  var tourIdx = 0;

  function clearTourHighlight() {
    document.querySelectorAll('.vg-tour-target').forEach(function (el) {
      el.classList.remove('vg-tour-target');
    });
  }

  function tourStep(i) {
    clearTourHighlight();
    if (i < 0 || i >= TOUR.length) { endTour(); return; }
    tourIdx = i;
    var step = TOUR[i];
    var el = document.querySelector(step.sel);
    /* v-wiring-sweep: بعض المحدّدات ([data-omnav]) لها نسختان — شريط الجوال
       وشريط الكمبيوتر المخفي. querySelector يرجع الأولى في الـDOM وهي المخفية
       على الجوال (حجمها صفر) فتضيع حلقة الجولة. نلتقط الظاهرة فعلًا. */
    if (el && !el.offsetParent) {
      var cands = document.querySelectorAll(step.sel);
      for (var ci = 0; ci < cands.length; ci++) {
        if (cands[ci].offsetParent) { el = cands[ci]; break; }
      }
    }
    var text = t(step.ar, step.en);

    if (el) {
      el.classList.add('vg-tour-target');
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      catch (e) { __swallow(e, 'vg:scroll'); }
    }
    setResult(text);
    setStatus(t('خطوة ', 'Step ') + (i + 1) + ' / ' + TOUR.length);
    announce(text, true);
    buzz(15);
  }

  function startTour() {
    var shell = $id('vgShell');
    if (shell) shell.classList.add('vg-tour');
    tourStep(0);
  }

  function endTour() {
    clearTourHighlight();
    var shell = $id('vgShell');
    if (shell) shell.classList.remove('vg-tour');
    setStatus('');
    setMode('describe');
  }

  /* ---------------- سؤال بالصوت ---------------- */

  function askByVoice() {
    stopListening();
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { var typed = window.prompt(t('اكتب سؤالك:', 'Type your question:')); if (typed) analyze(typed); return; }
    var rec = new SR(); S.recognition = rec;
    var __recMap = { ar: 'ar-SA', en: 'en-US', fr: 'fr-FR', hi: 'hi-IN', bn: 'bn-BD', ne: 'ne-NP', id: 'id-ID', fil: 'fil-PH', tr: 'tr-TR', zh: 'zh-CN', ru: 'ru-RU', es: 'es-ES', ml: 'ml-IN' };
    rec.lang = __recMap[vgLang()] || 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    setStatus(t('أسمعك…', 'Listening…')); buzz(40);
    rec.onresult = function (ev) {
      if (!S.open || S.recognition !== rec) return;
      var q = (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
      if (q) analyze(q); else setStatus('');
    };
    rec.onerror = function (ev) { if (S.open && S.recognition === rec) { setStatus(t('لم أسمع شيئًا.', 'Did not catch that.')); console.warn('[visual-guide] speech error:', ev && ev.error); } };
    rec.onend = function () { if (S.recognition === rec) S.recognition = null; if (S.open && !S.busy) setStatus(''); };
    try { rec.start(); } catch (e) { __swallow(e, 'vg:sr'); S.recognition = null; }
  }

  /* ---------------- فتح وإغلاق ---------------- */

  async function open(mode) {
    var shell = $id('vgShell');
    if (!shell) return;
    S.epoch++;
    cancelPending();
    stopListening();
    S.open = true;
    shell.classList.add('show');
    shell.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('vg-open');
    await setMode(mode || 'describe');
    var first = document.querySelector('.vgModeBtn.active');
    if (first) first.focus();
  }

  function close() {
    S.epoch++;
    cancelPending();
    stopListening();
    S.busy = false;
    S.open = false;
    stopLoop();
    camOff();
    shutUp();
    clearTourHighlight();
    var shell = $id('vgShell');
    if (shell) {
      shell.classList.remove('show', 'vg-tour');
      shell.setAttribute('aria-hidden', 'true');
    }
    document.documentElement.classList.remove('vg-open');
  }

  /* ---------------- التوصيل ---------------- */

  function wire() {
    var shell = $id('vgShell');
    if (!shell || shell.getAttribute('data-wired') === '1') return;
    shell.setAttribute('data-wired', '1');

    // زر الشريط السفلي (ui-wiring.js يتولّى تمييز التبويب النشط وحده)
    document.querySelectorAll('[data-omnav="guide"]').forEach(function (b) {
      b.addEventListener('click', function () { open('describe'); });
    });

    var closeBtn = $id('vgClose');
    if (closeBtn) closeBtn.addEventListener('click', close);

    /* v-vg-quiet (شكوى عمران: «إذا طلعت من الصفحة يظل يتكلم ولازم أطلع من
       التطبيق عشان يسكت»): الخروج عبر أزرار التنقل السفلية لا يمر بزر
       الإغلاق — أي نقرة تنقل لغير المرشد تغلقه وتسكته، وإخفاء التطبيق
       (تبديل/قفل الشاشة) يسكته فورًا. */
    document.addEventListener('click', function (e) {
      if (!S.open) return;
      var nb = (e.target && e.target.closest) ? e.target.closest('[data-omnav]') : null;
      if (nb && nb.getAttribute('data-omnav') !== 'guide') { close(); return; }
      /* v-vg-quiet2: زر الشعار ما عاد ينقر تبويب الرئيسية (v-logo-keep) —
         نغلق عليه مباشرة، وكذلك أي زر رأس يغادر صفحة المرشد */
      var hb = (e.target && e.target.closest) ? e.target.closest('header h1, #brandTitle') : null;
      if (hb) close();
    }, true);
    /* v-vg-quiet2: رجوع المتصفح/الجهاز (غلاف WebView الجديد) يغلق ويسكت */
    window.addEventListener('popstate', function () { if (S.open) close(); });
    /* حارس أخير: أي اختفاء فعلي لواجهة المرشد والصوت شغال → إسكات فوري،
       مهما كان مسار الخروج الذي فاتنا */
    setInterval(function () {
      if (!S.open) return;
      var shell = $id('vgShell');
      /* لا offsetParent هنا: القشرة position:fixed فيرجع null دائمًا */
      if (!shell || !shell.classList.contains('show') ||
          getComputedStyle(shell).display === 'none' ||
          !document.documentElement.classList.contains('vg-open')) close();
    }, 600);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && S.open) { shutUp(); stopListening(); stopLoop(); }
    });
    window.addEventListener('pagehide', function () { if (S.open) shutUp(); });

    document.querySelectorAll('.vgModeBtn').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-vgmode')); });
    });

    // الشاشة كلها زر التقاط — أهم قرار وصولٍ في هذه الميزة
    var stage = $id('vgStage');
    if (stage) {
      stage.addEventListener('click', function () {
        if (S.mode === 'tour') { tourStep(tourIdx + 1); return; }
        shutUp(); buzz(30); analyze(null);
      });
      stage.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); stage.click();
      });
    }

    var ask = $id('vgAsk');
    if (ask) ask.addEventListener('click', function (e) { e.stopPropagation(); askByVoice(); });

    var auto = $id('vgAuto');
    if (auto) auto.addEventListener('click', function (e) {
      e.stopPropagation();
      if (autoOn()) {
        stopLoop();
        announce(t('أوقفت الوصف التلقائي.', 'Auto description off.'), true);
      } else {
        startLoop();
        announce(t('شغّلت الوصف التلقائي.', 'Auto description on.'), true);
      }
    });

    var mute = $id('vgMute');
    if (mute) mute.addEventListener('click', function (e) {
      e.stopPropagation();
      S.speakOn = !S.speakOn;
      mute.classList.toggle('on', S.speakOn);
      if (!S.speakOn) shutUp();
      buzz(20);
    });

    var torch = $id('vgTorch');
    if (torch) torch.addEventListener('click', function (e) { e.stopPropagation(); toggleTorch(); });

    var tourPrev = $id('vgTourPrev');
    if (tourPrev) tourPrev.addEventListener('click', function () { tourStep(tourIdx - 1); });
    var tourNext = $id('vgTourNext');
    if (tourNext) tourNext.addEventListener('click', function () { tourStep(tourIdx + 1); });

    var repeat = $id('vgRepeat');
    if (repeat) repeat.addEventListener('click', function (e) {
      e.stopPropagation();
      var r = $id('vgResult');
      if (r && r.textContent.trim()) announce(r.textContent.trim(), true);
    });

    document.addEventListener('keydown', function (e) {
      if (!S.open) return;
      if (e.key === 'Escape') { close(); return; }
      if (S.mode === 'tour') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') tourStep(tourIdx + 1);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') tourStep(tourIdx - 1);
      }
    });

    // وفّر البطارية والحصّة حين يغيب التطبيق عن الشاشة
    document.addEventListener('visibilitychange', function () {
      if (!S.open) return;
      if (document.hidden) { stopLoop(); shutUp(); }
      else if (S.mode === 'describe' || S.mode === 'steps') startLoop();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }

  /* واجهة برمجية صغيرة — تسمح لمها أو لأي زر آخر بفتح المرشد */
  window.omranGuide = {
    open: open,
    close: close,
    setMode: setMode,
    ask: function (q) { return analyze(q); },
    state: function () {
      return { open: S.open, mode: S.mode, auto: autoOn(), speak: S.speakOn, busy: S.busy };
    }
  };
})();

/* v-boot-watchdog: آخر شريحة في الحزمة — وصول التنفيذ هنا يعني الحزمة كلها اشتغلت. */
window.__omranBundleOk = true;
