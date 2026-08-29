(function(){
'use strict';
/* ============ 🎓 التعليم (Edu Hub) — omran-ai-builder v306 ============ */
var LS_GUEST='eduHubLessons', LS_STREAK='eduHubStreak', LS_INTRO='eduHubIntroSeen';
var PALETTE=['#6b7280','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#b8860b'];
var RTL_LANGS=['ar','ur'];
function appLang(){ try{ return localStorage.getItem('aiapp_lang')||'ar'; }catch(e){ return 'ar'; } }
var I18N={
ar:{title:'التعليم',oldEdu:'📚 دورات وشروحات',upload:'ارفع محاضرة جديدة',uploadSub:'PDF أو صور أو DOCX',orPaste:'أو الصق نصًا',pastePh:'الصق نص المحاضرة هنا...',analyze:'حلّل المحاضرة',analyzing:'⏳ نحلل المحاضرة… قد يستغرق الأمر دقيقة',mySubjects:'📚 موادي',empty:'لا توجد دروس بعد — ارفع أول محاضرة وابدأ المذاكرة!',lessonsWord:'درس',summaryTab:'📄 الملخص',cardsTab:'🎴 بطاقات',quizTab:'✍️ اختبار',labTab:'🧪 تجربة حية',know:'أعرفه ✅',review:'أراجعه 🔄',tapFlip:'اضغط على البطاقة لقلبها',retry:'أعد الاختبار',yourScore:'نتيجتك',great:'ممتاز! أنت جاهز للامتحان 🌟',good:'جيد جدًا! راجع الأخطاء وستتقنها 💪',keepGoing:'بداية طيبة — راجع الملخص والبطاقات ثم أعد المحاولة 📖',del:'حذف',confirmDel:'حذف هذا الدرس نهائيًا؟',err:'حدث خطأ، حاول مرة أخرى.',guestNote:'أنت غير مسجّل — تُحفظ دروسك على هذا الجهاز فقط.',intro:'جديد: 🎓 التعليم — ارفع محاضرتك واحصل على ملخص وبطاقات واختبار',introBtn:'جرّبه الآن',hint:'💡 جرّب قسم «التعليم»: ارفع محاضرتك واحصل على ملخص وبطاقات واختبار تلقائيًا',docxFail:'تعذر قراءة ملف DOCX — جرّب حفظه كـ PDF ورفعه.',tooBig:'الملف كبير جدًا (الحد حوالي 10 ميغابايت).',cardsDone:'أنهيت كل البطاقات! 🎉',finish:'إنهاء',next:'التالي',streakWord:'يوم'},
en:{title:'Education',oldEdu:'📚 Courses & Lessons',upload:'Upload a new lecture',uploadSub:'PDF, images or DOCX',orPaste:'or paste text',pastePh:'Paste your lecture text here...',analyze:'Analyze lecture',analyzing:'⏳ Analyzing your lecture… this may take a minute',mySubjects:'📚 My subjects',empty:'No lessons yet — upload your first lecture to start studying!',lessonsWord:'lesson(s)',summaryTab:'📄 Summary',cardsTab:'🎴 Flashcards',quizTab:'✍️ Quiz',labTab:'🧪 Live Lab',know:'I know it ✅',review:'Review 🔄',tapFlip:'Tap the card to flip it',retry:'Retake quiz',yourScore:'Your score',great:'Excellent! You are exam-ready 🌟',good:'Very good! Review your mistakes and you will master it 💪',keepGoing:'Good start — review the summary and cards, then try again 📖',del:'Delete',confirmDel:'Delete this lesson permanently?',err:'Something went wrong, please try again.',guestNote:'You are not signed in — lessons are saved on this device only.',intro:'New: 🎓 Education — upload a lecture and get a summary, flashcards and a quiz',introBtn:'Try it now',hint:'💡 Try "Education": upload your lecture and get a summary, flashcards and a quiz automatically',docxFail:'Could not read the DOCX file — try saving it as PDF.',tooBig:'File too large (limit is about 10 MB).',cardsDone:'You finished all the cards! 🎉',finish:'Finish',next:'Next',streakWord:'day(s)'},
fr:{title:'Mes cours',oldEdu:'📚 Cours et tutoriels',upload:'Téléverser un nouveau cours',orPaste:'ou coller du texte',analyze:'Analyser le cours',analyzing:'⏳ Analyse du cours en cours…',mySubjects:'📚 Mes matières',empty:'Aucune leçon — téléversez votre premier cours !',summaryTab:'📄 Résumé',cardsTab:'🎴 Cartes',quizTab:'✍️ Quiz',know:'Je sais ✅',review:'À revoir 🔄',tapFlip:'Touchez la carte pour la retourner',retry:'Refaire le quiz',yourScore:'Votre score',great:'Excellent ! Vous êtes prêt 🌟',good:'Très bien ! Revoyez vos erreurs 💪',keepGoing:'Bon début — relisez le résumé puis réessayez 📖',del:'Supprimer',confirmDel:'Supprimer cette leçon ?',err:'Une erreur est survenue.',guestNote:'Non connecté — leçons enregistrées sur cet appareil.',intro:'Nouveau : 🎓 Mes cours — résumé, cartes et quiz automatiques',introBtn:'Essayer',hint:'💡 Essayez « Mes cours » : résumé, cartes et quiz automatiques',next:'Suivant',finish:'Terminer'},
hi:{title:'मेरे पाठ',oldEdu:'📚 कोर्स और पाठ',upload:'नया लेक्चर अपलोड करें',orPaste:'या टेक्स्ट पेस्ट करें',analyze:'लेक्चर का विश्लेषण करें',analyzing:'⏳ लेक्चर का विश्लेषण हो रहा है…',mySubjects:'📚 मेरे विषय',empty:'अभी कोई पाठ नहीं — पहला लेक्चर अपलोड करें!',summaryTab:'📄 सारांश',cardsTab:'🎴 कार्ड',quizTab:'✍️ क्विज़',know:'आता है ✅',review:'दोहराना 🔄',tapFlip:'पलटने के लिए कार्ड पर टैप करें',retry:'क्विज़ दोबारा दें',yourScore:'आपका स्कोर',great:'शानदार! आप तैयार हैं 🌟',good:'बहुत अच्छा! गलतियाँ दोहराएँ 💪',keepGoing:'अच्छी शुरुआत — सारांश पढ़कर फिर कोशिश करें 📖',del:'हटाएँ',confirmDel:'यह पाठ हटाएँ?',err:'कुछ गलत हुआ, फिर कोशिश करें।',guestNote:'लॉगिन नहीं — पाठ इसी डिवाइस पर सहेजे जाते हैं।',intro:'नया: 🎓 मेरे पाठ — सारांश, कार्ड और क्विज़ अपने आप',introBtn:'आज़माएँ',hint:'💡 «मेरे पाठ» आज़माएँ: लेक्चर से सारांश, कार्ड और क्विज़',next:'आगे',finish:'समाप्त'},
ur:{title:'میرے اسباق',oldEdu:'📚 کورسز اور اسباق',upload:'نیا لیکچر اپ لوڈ کریں',orPaste:'یا متن پیسٹ کریں',analyze:'لیکچر کا تجزیہ کریں',analyzing:'⏳ لیکچر کا تجزیہ ہو رہا ہے…',mySubjects:'📚 میرے مضامین',empty:'ابھی کوئی سبق نہیں — پہلا لیکچر اپ لوڈ کریں!',summaryTab:'📄 خلاصہ',cardsTab:'🎴 کارڈز',quizTab:'✍️ کوئز',know:'آتا ہے ✅',review:'دہرانا 🔄',tapFlip:'پلٹنے کے لیے کارڈ پر ٹیپ کریں',retry:'کوئز دوبارہ دیں',yourScore:'آپ کا اسکور',great:'زبردست! آپ تیار ہیں 🌟',good:'بہت خوب! غلطیاں دہرائیں 💪',keepGoing:'اچھی شروعات — خلاصہ پڑھ کر دوبارہ کوشش کریں 📖',del:'حذف کریں',confirmDel:'یہ سبق حذف کریں؟',err:'کچھ غلط ہوا، دوبارہ کوشش کریں۔',guestNote:'لاگ اِن نہیں — اسباق صرف اسی ڈیوائس پر محفوظ ہوتے ہیں۔',intro:'نیا: 🎓 میرے اسباق — خلاصہ، کارڈز اور کوئز خودکار',introBtn:'آزمائیں',hint:'💡 «میرے اسباق» آزمائیں: لیکچر سے خلاصہ، کارڈز اور کوئز',next:'اگلا',finish:'ختم'},
bn:{title:'আমার পাঠ',oldEdu:'📚 কোর্স ও পাঠ',upload:'নতুন লেকচার আপলোড করুন',orPaste:'বা টেক্সট পেস্ট করুন',analyze:'লেকচার বিশ্লেষণ করুন',analyzing:'⏳ লেকচার বিশ্লেষণ চলছে…',mySubjects:'📚 আমার বিষয়',empty:'এখনও কোনো পাঠ নেই — প্রথম লেকচার আপলোড করুন!',summaryTab:'📄 সারাংশ',cardsTab:'🎴 কার্ড',quizTab:'✍️ কুইজ',know:'জানি ✅',review:'আবার 🔄',tapFlip:'উল্টাতে কার্ডে ট্যাপ করুন',retry:'আবার কুইজ দিন',yourScore:'আপনার স্কোর',great:'চমৎকার! আপনি প্রস্তুত 🌟',good:'খুব ভালো! ভুলগুলো দেখুন 💪',keepGoing:'ভালো শুরু — সারাংশ পড়ে আবার চেষ্টা করুন 📖',del:'মুছুন',confirmDel:'এই পাঠ মুছবেন?',err:'সমস্যা হয়েছে, আবার চেষ্টা করুন।',guestNote:'লগইন নেই — পাঠ এই ডিভাইসেই সংরক্ষিত।',intro:'নতুন: 🎓 আমার পাঠ — সারাংশ, কার্ড ও কুইজ স্বয়ংক্রিয়',introBtn:'চেষ্টা করুন',hint:'💡 «আমার পাঠ» দেখুন: লেকচার থেকে সারাংশ, কার্ড ও কুইজ',next:'পরবর্তী',finish:'শেষ'},
ne:{title:'मेरा पाठहरू',oldEdu:'📚 कोर्स र पाठहरू',upload:'नयाँ लेक्चर अपलोड गर्नुहोस्',orPaste:'वा टेक्स्ट टाँस्नुहोस्',analyze:'लेक्चर विश्लेषण गर्नुहोस्',analyzing:'⏳ लेक्चर विश्लेषण हुँदैछ…',mySubjects:'📚 मेरा विषयहरू',empty:'अहिले कुनै पाठ छैन — पहिलो लेक्चर अपलोड गर्नुहोस्!',summaryTab:'📄 सारांश',cardsTab:'🎴 कार्ड',quizTab:'✍️ क्विज',know:'थाहा छ ✅',review:'दोहोर्‍याउने 🔄',tapFlip:'पल्टाउन कार्डमा ट्याप गर्नुहोस्',retry:'क्विज फेरि दिनुहोस्',yourScore:'तपाईंको स्कोर',great:'उत्कृष्ट! तपाईं तयार हुनुहुन्छ 🌟',good:'धेरै राम्रो! गल्ती हेर्नुहोस् 💪',keepGoing:'राम्रो सुरुवात — सारांश पढेर फेरि प्रयास गर्नुहोस् 📖',del:'हटाउनुहोस्',confirmDel:'यो पाठ हटाउने?',err:'केही गडबड भयो, फेरि प्रयास गर्नुहोस्।',guestNote:'लगइन छैन — पाठ यही डिभाइसमा मात्र सुरक्षित।',intro:'नयाँ: 🎓 मेरा पाठहरू — सारांश, कार्ड र क्विज स्वतः',introBtn:'प्रयास गर्नुहोस्',hint:'💡 «मेरा पाठहरू» हेर्नुहोस्: लेक्चरबाट सारांश, कार्ड र क्विज',next:'अर्को',finish:'सकियो'},
id:{title:'Pelajaranku',oldEdu:'📚 Kursus & Pelajaran',upload:'Unggah kuliah baru',orPaste:'atau tempel teks',analyze:'Analisis kuliah',analyzing:'⏳ Menganalisis kuliah…',mySubjects:'📚 Mata pelajaranku',empty:'Belum ada pelajaran — unggah kuliah pertamamu!',summaryTab:'📄 Ringkasan',cardsTab:'🎴 Kartu',quizTab:'✍️ Kuis',know:'Sudah paham ✅',review:'Ulangi 🔄',tapFlip:'Ketuk kartu untuk membalik',retry:'Ulangi kuis',yourScore:'Skormu',great:'Luar biasa! Kamu siap ujian 🌟',good:'Bagus sekali! Tinjau kesalahanmu 💪',keepGoing:'Awal yang baik — baca ringkasan lalu coba lagi 📖',del:'Hapus',confirmDel:'Hapus pelajaran ini?',err:'Terjadi kesalahan, coba lagi.',guestNote:'Belum masuk — pelajaran disimpan di perangkat ini saja.',intro:'Baru: 🎓 Pelajaranku — ringkasan, kartu, dan kuis otomatis',introBtn:'Coba sekarang',hint:'💡 Coba "Pelajaranku": unggah kuliah, dapatkan ringkasan, kartu & kuis',next:'Berikutnya',finish:'Selesai'},
fil:{title:'Aking Aralin',oldEdu:'📚 Mga Kurso at Aralin',upload:'Mag-upload ng bagong lektura',orPaste:'o mag-paste ng teksto',analyze:'Suriin ang lektura',analyzing:'⏳ Sinusuri ang lektura…',mySubjects:'📚 Aking mga asignatura',empty:'Wala pang aralin — i-upload ang unang lektura!',summaryTab:'📄 Buod',cardsTab:'🎴 Cards',quizTab:'✍️ Pagsusulit',know:'Alam ko ✅',review:'Ulitin 🔄',tapFlip:'I-tap ang card para baligtarin',retry:'Ulitin ang pagsusulit',yourScore:'Iskor mo',great:'Mahusay! Handa ka na 🌟',good:'Napakahusay! Balikan ang mga mali 💪',keepGoing:'Magandang simula — basahin ang buod at subukan muli 📖',del:'Burahin',confirmDel:'Burahin ang araling ito?',err:'May naganap na error, subukan muli.',guestNote:'Hindi naka-login — dito lang sa device naka-save.',intro:'Bago: 🎓 Aking Aralin — buod, cards at pagsusulit nang awtomatiko',introBtn:'Subukan',hint:'💡 Subukan ang "Aking Aralin": buod, cards at quiz mula sa lektura',next:'Susunod',finish:'Tapos'},
tr:{title:'Derslerim',oldEdu:'📚 Kurslar ve Dersler',upload:'Yeni ders yükle',orPaste:'veya metin yapıştır',analyze:'Dersi analiz et',analyzing:'⏳ Ders analiz ediliyor…',mySubjects:'📚 Derslerim',empty:'Henüz ders yok — ilk dersini yükle!',summaryTab:'📄 Özet',cardsTab:'🎴 Kartlar',quizTab:'✍️ Sınav',know:'Biliyorum ✅',review:'Tekrar 🔄',tapFlip:'Çevirmek için karta dokun',retry:'Sınavı tekrarla',yourScore:'Puanın',great:'Mükemmel! Sınava hazırsın 🌟',good:'Çok iyi! Hatalarını gözden geçir 💪',keepGoing:'İyi başlangıç — özeti oku ve tekrar dene 📖',del:'Sil',confirmDel:'Bu ders silinsin mi?',err:'Bir hata oluştu, tekrar dene.',guestNote:'Giriş yapılmadı — dersler yalnızca bu cihazda saklanır.',intro:'Yeni: 🎓 Derslerim — otomatik özet, kart ve sınav',introBtn:'Şimdi dene',hint:'💡 "Derslerim"i dene: dersinden özet, kart ve sınav',next:'İleri',finish:'Bitir'},
zh:{title:'我的课程',oldEdu:'📚 课程与讲解',upload:'上传新讲义',orPaste:'或粘贴文本',analyze:'分析讲义',analyzing:'⏳ 正在分析讲义…',mySubjects:'📚 我的科目',empty:'还没有课程——上传第一份讲义吧！',summaryTab:'📄 摘要',cardsTab:'🎴 卡片',quizTab:'✍️ 测验',know:'我会了 ✅',review:'再复习 🔄',tapFlip:'点击卡片翻面',retry:'重新测验',yourScore:'你的得分',great:'太棒了！你已准备好考试 🌟',good:'很好！复习一下错题 💪',keepGoing:'不错的开始——先看摘要再试一次 📖',del:'删除',confirmDel:'确定删除该课程？',err:'出错了，请重试。',guestNote:'未登录——课程仅保存在本设备。',intro:'新功能：🎓 我的课程——自动生成摘要、卡片和测验',introBtn:'立即体验',hint:'💡 试试「我的课程」：上传讲义自动生成摘要、卡片和测验',next:'下一题',finish:'完成'},
ru:{title:'Мои уроки',oldEdu:'📚 Курсы и уроки',upload:'Загрузить новую лекцию',orPaste:'или вставьте текст',analyze:'Анализировать лекцию',analyzing:'⏳ Анализируем лекцию…',mySubjects:'📚 Мои предметы',empty:'Пока нет уроков — загрузите первую лекцию!',summaryTab:'📄 Конспект',cardsTab:'🎴 Карточки',quizTab:'✍️ Тест',know:'Знаю ✅',review:'Повторить 🔄',tapFlip:'Нажмите на карточку, чтобы перевернуть',retry:'Пройти тест снова',yourScore:'Ваш результат',great:'Отлично! Вы готовы к экзамену 🌟',good:'Очень хорошо! Повторите ошибки 💪',keepGoing:'Хорошее начало — перечитайте конспект и попробуйте снова 📖',del:'Удалить',confirmDel:'Удалить этот урок?',err:'Произошла ошибка, попробуйте снова.',guestNote:'Вы не вошли — уроки хранятся только на этом устройстве.',intro:'Новое: 🎓 Мои уроки — конспект, карточки и тест автоматически',introBtn:'Попробовать',hint:'💡 Попробуйте «Мои уроки»: конспект, карточки и тест из лекции',next:'Далее',finish:'Готово'},
es:{title:'Mis lecciones',oldEdu:'📚 Cursos y lecciones',upload:'Subir una nueva clase',orPaste:'o pega el texto',analyze:'Analizar la clase',analyzing:'⏳ Analizando la clase…',mySubjects:'📚 Mis materias',empty:'Aún no hay lecciones — ¡sube tu primera clase!',summaryTab:'📄 Resumen',cardsTab:'🎴 Tarjetas',quizTab:'✍️ Examen',know:'Lo sé ✅',review:'Repasar 🔄',tapFlip:'Toca la tarjeta para girarla',retry:'Repetir examen',yourScore:'Tu puntuación',great:'¡Excelente! Estás listo 🌟',good:'¡Muy bien! Repasa tus errores 💪',keepGoing:'Buen comienzo — repasa el resumen e inténtalo de nuevo 📖',del:'Eliminar',confirmDel:'¿Eliminar esta lección?',err:'Ocurrió un error, inténtalo de nuevo.',guestNote:'Sin iniciar sesión — las lecciones se guardan solo en este dispositivo.',intro:'Nuevo: 🎓 Mis lecciones — resumen, tarjetas y examen automáticos',introBtn:'Pruébalo',hint:'💡 Prueba «Mis lecciones»: resumen, tarjetas y examen de tu clase',next:'Siguiente',finish:'Terminar'},
ml:{title:'എന്റെ പാഠങ്ങൾ',oldEdu:'📚 കോഴ്സുകളും പാഠങ്ങളും',upload:'പുതിയ ലക്ചർ അപ്‌ലോഡ് ചെയ്യുക',orPaste:'അല്ലെങ്കിൽ ടെക്സ്റ്റ് ഒട്ടിക്കുക',analyze:'ലക്ചർ വിശകലനം ചെയ്യുക',analyzing:'⏳ ലക്ചർ വിശകലനം ചെയ്യുന്നു…',mySubjects:'📚 എന്റെ വിഷയങ്ങൾ',empty:'ഇതുവരെ പാഠങ്ങളില്ല — ആദ്യ ലക്ചർ അപ്‌ലോഡ് ചെയ്യൂ!',summaryTab:'📄 സംഗ്രഹം',cardsTab:'🎴 കാർഡുകൾ',quizTab:'✍️ ക്വിസ്',know:'അറിയാം ✅',review:'വീണ്ടും 🔄',tapFlip:'മറിക്കാൻ കാർഡിൽ ടാപ്പ് ചെയ്യുക',retry:'ക്വിസ് വീണ്ടും',yourScore:'നിങ്ങളുടെ സ്കോർ',great:'മികച്ചത്! നിങ്ങൾ തയ്യാർ 🌟',good:'വളരെ നല്ലത്! തെറ്റുകൾ അവലോകനം ചെയ്യുക 💪',keepGoing:'നല്ല തുടക്കം — സംഗ്രഹം വായിച്ച് വീണ്ടും ശ്രമിക്കൂ 📖',del:'ഇല്ലാതാക്കുക',confirmDel:'ഈ പാഠം ഇല്ലാതാക്കണോ?',err:'പിശക് സംഭവിച്ചു, വീണ്ടും ശ്രമിക്കുക.',guestNote:'ലോഗിൻ ചെയ്തിട്ടില്ല — പാഠങ്ങൾ ഈ ഉപകരണത്തിൽ മാത്രം.',intro:'പുതിയത്: 🎓 എന്റെ പാഠങ്ങൾ — സംഗ്രഹം, കാർഡുകൾ, ക്വിസ്',introBtn:'ഇപ്പോൾ ശ്രമിക്കൂ',hint:'💡 «എന്റെ പാഠങ്ങൾ» ശ്രമിക്കൂ: ലക്ചറിൽ നിന്ന് സംഗ്രഹവും കാർഡുകളും ക്വിസും',next:'അടുത്തത്',finish:'പൂർത്തിയാക്കുക'}
};
function T(k){ var L=appLang(); var d=I18N[L]||I18N.en; return d[k]||I18N.en[k]||I18N.ar[k]||k; }
function isRTL(){ return RTL_LANGS.indexOf(appLang())>=0; }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function getToken(){ try{ return (typeof authGet==='function'?authGet('aiapp_auth_token'):null)||localStorage.getItem('aiapp_auth_token')||sessionStorage.getItem('aiapp_auth_token')||''; }catch(e){ return ''; } }
function api(payload){
  payload=payload||{}; payload.token=getToken()||undefined;
  return fetch('/api/edu',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error((j&&j.error)||('HTTP '+r.status)); return j; }); });
}
/* ---------- guest local store ---------- */
function localLessons(){ try{ return JSON.parse(localStorage.getItem(LS_GUEST)||'[]')||[]; }catch(e){ return []; } }
function saveLocalLessons(arr){ try{ localStorage.setItem(LS_GUEST,JSON.stringify(arr.slice(0,60))); }catch(e){ __swallow(e, "save:index#7"); } }
/* ---------- streak ---------- */
function localStreak(){ try{ return JSON.parse(localStorage.getItem(LS_STREAK)||'{}')||{}; }catch(e){ return {}; } }
function bumpStreak(){
  try{
    var st=localStreak(); var today=new Date().toISOString().slice(0,10);
    if(st.lastActive!==today){
      var y=new Date(Date.now()-86400000).toISOString().slice(0,10);
      st.streak=(st.lastActive===y)?((st.streak||0)+1):1; st.lastActive=today;
      localStorage.setItem(LS_STREAK,JSON.stringify(st));
    }
    renderStreak();
  }catch(e){ __swallow(e, "save:index#8"); }
}
function mergeServerStreak(sv){
  try{
    if(!sv) return; var st=localStreak();
    if((sv.streak||0)>(st.streak||0)||(!st.lastActive&&sv.lastActive)){
      localStorage.setItem(LS_STREAK,JSON.stringify({streak:sv.streak||0,lastActive:sv.lastActive||st.lastActive||''}));
    }
    renderStreak();
  }catch(e){ __swallow(e, "save:index#9"); }
}
function renderStreak(){
  var el=document.getElementById('eduStreakBadge'); if(!el) return;
  var st=localStreak(); var n=st.streak||0;
  var today=new Date().toISOString().slice(0,10), y=new Date(Date.now()-86400000).toISOString().slice(0,10);
  if(st.lastActive!==today&&st.lastActive!==y) n=0;
  el.style.display=n>0?'':'none'; el.textContent='🔥 '+n;
}
/* ---------- data layer (server for registered, localStorage for guests) ---------- */
function listLessons(){
  if(!getToken()) return Promise.resolve({lessons:localLessons()});
  return api({action:'list'}).then(function(j){
    if(j.guest) return {lessons:localLessons()};
    mergeServerStreak(j.streak);
    return {lessons:j.lessons||[]};
  }).catch(function(){ return {lessons:localLessons()}; });
}
function getLesson(id){
  if(!getToken()){ var f=localLessons().filter(function(l){return l.id===id;})[0]; return f?Promise.resolve(f):Promise.reject(new Error(T('err'))); }
  return api({action:'get',id:id}).then(function(j){
    if(j.guest){ var f=localLessons().filter(function(l){return l.id===id;})[0]; if(!f) throw new Error(T('err')); return f; }
    return j.lesson;
  });
}
function persistLesson(lesson){
  bumpStreak();
  if(!getToken()){ var arr=localLessons().filter(function(l){return l.id!==lesson.id;}); arr.unshift(lesson); saveLocalLessons(arr); return Promise.resolve(lesson.id); }
  return api({action:'save',lesson:lesson}).then(function(j){
    if(j.guest){ var arr=localLessons().filter(function(l){return l.id!==lesson.id;}); arr.unshift(lesson); saveLocalLessons(arr); return lesson.id; }
    return j.id;
  });
}
function deleteLesson(id){
  if(!getToken()){ saveLocalLessons(localLessons().filter(function(l){return l.id!==id;})); return Promise.resolve(); }
  return api({action:'delete',id:id}).then(function(j){ if(j.guest) saveLocalLessons(localLessons().filter(function(l){return l.id!==id;})); });
}
function saveProgress(id,fields){
  bumpStreak();
  var arr=localLessons(); var found=null;
  arr.forEach(function(l){ if(l.id===id){ found=l; if(typeof fields.bestScore==='number') l.bestScore=Math.max(l.bestScore||0,fields.bestScore); if(typeof fields.cardsKnown==='number') l.cardsKnown=fields.cardsKnown;
    if(fields.scores){ l.scores=l.scores||{}; ['basic','mid','advanced'].forEach(function(k){ if(typeof fields.scores[k]==='number') l.scores[k]=Math.max(l.scores[k]||0,fields.scores[k]); }); } } });
  if(found) saveLocalLessons(arr);
  if(!getToken()) return Promise.resolve();
  var p={action:'progress',id:id}; if(typeof fields.bestScore==='number') p.bestScore=fields.bestScore; if(typeof fields.cardsKnown==='number') p.cardsKnown=fields.cardsKnown; if(fields.scores) p.scores=fields.scores;
  return api(p).then(function(j){ if(j&&j.streak) mergeServerStreak(j.streak); }).catch(function(){});
}
/* ---------- mini markdown renderer ---------- */
function md(src){
  var lines=String(src||'').split(/\r?\n/); var out=[],list=null;
  function closeList(){ if(list){ out.push(list==='ul'?'</ul>':'</ol>'); list=null; } }
  function inline(s){ return esc(s).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\*([^*]+)\*/g,'<i>$1</i>').replace(/`([^`]+)`/g,'<code>$1</code>'); }
  lines.forEach(function(ln){
    var t=ln.trim();
    if(!t){ closeList(); return; }
    var h=t.match(/^(#{1,6})\s+(.*)$/);
    if(h){ closeList(); var lv=Math.min(h[1].length+2,5); out.push('<h'+lv+'>'+inline(h[2])+'</h'+lv+'>'); return; }
    var ul=t.match(/^[-*•]\s+(.*)$/);
    if(ul){ if(list!=='ul'){ closeList(); out.push('<ul>'); list='ul'; } out.push('<li>'+inline(ul[1])+'</li>'); return; }
    var ol=t.match(/^\d+[.)]\s+(.*)$/);
    if(ol){ if(list!=='ol'){ closeList(); out.push('<ol>'); list='ol'; } out.push('<li>'+inline(ol[1])+'</li>'); return; }
    closeList(); out.push('<p>'+inline(t)+'</p>');
  });
  closeList(); return out.join('');
}
/* ---------- view engine ---------- */
var modal=document.getElementById('eduHubModal');
var body=document.getElementById('eduBody');
var backBtn=document.getElementById('eduBackBtn');
var navStack=[];
function setBack(show){ backBtn.style.display=show?'':'none'; }
function openModal(){
  modal.classList.add('open');
  modal.setAttribute('dir',isRTL()?'rtl':'ltr');
  document.getElementById('eduTitleTxt').textContent=T('title');
  renderStreak(); showHome();
}
function closeModal(){ modal.classList.remove('open'); navStack=[]; }
document.getElementById('eduCloseBtn').onclick=closeModal;
backBtn.onclick=function(){ var fn=navStack.pop(); if(fn) fn(); else showHome(); };
modal.addEventListener('click',function(e){ if(e.target===modal) closeModal(); });
/* ---------- HOME ---------- */
function subjectColor(subjects,name){ var i=subjects.indexOf(name); return PALETTE[(i>=0?i:subjects.length)%PALETTE.length]; }
function showHome(){
  setBack(false); navStack=[];
  body.innerHTML=''
   +'<button class="eduUploadBtn" id="eduUploadBtn">'
   +'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>'
   +'<span>'+esc(T('upload'))+'</span></button>'
   +'<input type="file" id="eduFileInput" accept=".pdf,.docx,.zip,image/*" multiple style="display:none;">'
   +'<button class="eduPasteToggle" id="eduPasteToggle">'+esc(T('orPaste'))+'</button>'
   +'<div class="eduPasteArea" id="eduPasteArea">'
   +'<textarea id="eduPasteTxt" placeholder="'+esc(T('pastePh'))+'"></textarea>'
   +'<button class="eduPrimary" id="eduAnalyzeTxtBtn">'+esc(T('analyze'))+'</button></div>'
   +'<button class="eduUploadBtn" id="eduCurricBtn" style="margin-top:10px;"><span style="font-size:20px;">📚</span><span>'+esc((typeof AL==='function'&&AL()==='en')?'Lesson from curriculum — pick country, grade & subject':'درس من المنهج — اختر البلد والصف والمادة')+'</span></button>'
   +(getToken()?'':'<div class="eduNote">'+esc(T('guestNote'))+'</div>')
   +eduExamLangControl()
   +'<div class="eduSecTitle">'+esc(T('mySubjects'))+'</div>'
   +'<div id="eduSubjWrap"><div class="eduEmpty">…</div></div>'
   /* v306: entry to the OLD education modal so nothing old is lost */
   +'<div class="eduLessonRow" id="eduOldEduRow" style="margin-top:18px;">'
   +'<div class="eduLessonTitle">'+esc(T('oldEdu'))+'</div>'
   +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7;'+(isRTL()?'transform:scaleX(-1);':'')+'"><polyline points="9 18 15 12 9 6"></polyline></svg></div>';
  bindEduExamLang();
  document.getElementById('eduUploadBtn').onclick=function(){ document.getElementById('eduFileInput').click(); };
  document.getElementById('eduFileInput').onchange=function(){
    // احتفظ بالملفات قبل تفريغ الحقل (خصوصًا في Safari)، واستدعِ النسخة
    // المعلنة صراحةً كي لا تنكسر صفحات/كاش قديمة كانت تستدعي handleFiles عالميًا.
    var selected=this.files;
    this.value='';
    if(typeof window.handleFiles==='function') window.handleFiles(selected);
    else if(typeof handleFiles==='function') handleFiles(selected);
    else { alert(T('err')); }
  };
  document.getElementById('eduPasteToggle').onclick=function(){ var a=document.getElementById('eduPasteArea'); a.style.display=a.style.display==='block'?'none':'block'; };
  document.getElementById('eduAnalyzeTxtBtn').onclick=function(){
    var txt=(document.getElementById('eduPasteTxt').value||'').trim();
    if(!txt) return;
    processContent({text:txt,lang:appLang()});
  };
  var __cb=document.getElementById('eduCurricBtn'); if(__cb) __cb.onclick=showCurriculum;
  var oldRow=document.getElementById('eduOldEduRow');
  if(oldRow) oldRow.onclick=function(){ closeModal(); if(typeof window.openOmranEduModal==='function') window.openOmranEduModal(); };
  listLessons().then(function(r){ renderSubjects(r.lessons||[]); }).catch(function(){ renderSubjects([]); });
}
function renderSubjects(lessons){
  var wrap=document.getElementById('eduSubjWrap'); if(!wrap) return;
  if(!lessons.length){ wrap.innerHTML='<div class="eduEmpty">'+esc(T('empty'))+'</div>'; return; }
  var bySub={},order=[];
  lessons.forEach(function(l){ var s=l.subject||'—'; if(!bySub[s]){ bySub[s]=[]; order.push(s); } bySub[s].push(l); });
  var html='<div class="eduSubjGrid">';
  order.forEach(function(s,idx){
    var arr=bySub[s]; var col=PALETTE[idx%PALETTE.length];
    var scored=arr.filter(function(l){ return typeof l.bestScore==='number'&&l.bestScore!==null; });
    var avg=scored.length?Math.round(scored.reduce(function(a,l){return a+l.bestScore;},0)/scored.length):0;
    html+='<div class="eduSubjCard" data-sub="'+esc(s)+'" style="background:linear-gradient(150deg,'+col+'33,'+col+'14);border-color:'+col+'55;">'
      +'<div><div class="eduSubjName">'+esc(s)+'</div>'
      +'<div class="eduSubjCount">'+arr.length+' '+esc(T('lessonsWord'))+(scored.length?' · '+avg+'%':'')+'</div></div>'
      +'<div class="eduBar"><i style="width:'+avg+'%;background:'+col+';"></i></div></div>';
  });
  html+='</div>';
  wrap.innerHTML=html;
  wrap.querySelectorAll('.eduSubjCard').forEach(function(c){
    c.onclick=function(){ showLessons(c.getAttribute('data-sub'),lessons); };
  });
}
/* ---------- lessons list ---------- */
function showLessons(subject,lessons){
  setBack(true); navStack=[showHome];
  var arr=(lessons||[]).filter(function(l){ return (l.subject||'—')===subject; });
  var html='<div class="eduSecTitle">'+esc(subject)+'</div>';
  arr.forEach(function(l){
    html+='<div class="eduLessonRow" data-id="'+esc(l.id)+'">'
      +'<div style="flex:1;"><div class="eduLessonTitle">'+esc(l.title)+'</div>'
      +'<div class="eduLessonMeta">'+(l.createdAt?new Date(l.createdAt).toLocaleDateString():'')+(typeof l.bestScore==='number'&&l.bestScore!==null?' · '+l.bestScore+'%':'')+'</div></div>'
      +'<button class="eduDelBtn" data-del="'+esc(l.id)+'" title="'+esc(T('del'))+'"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div>';
  });
  body.innerHTML=html;
  body.querySelectorAll('.eduLessonRow').forEach(function(row){
    row.onclick=function(e){
      if(e.target.closest('[data-del]')) return;
      var id=row.getAttribute('data-id');
      body.innerHTML='<div class="eduBusyBox"><div class="eduSpin"></div></div>';
      getLesson(id).then(function(l){ showLesson(l,function(){ listLessons().then(function(r){ showLessons(subject,r.lessons||[]); }); }); })
        .catch(function(err){ alert(err.message||T('err')); showHome(); });
    };
  });
  body.querySelectorAll('[data-del]').forEach(function(btn){
    btn.onclick=function(e){
      e.stopPropagation();
      if(!confirm(T('confirmDel'))) return;
      deleteLesson(btn.getAttribute('data-del')).then(function(){
        listLessons().then(function(r){
          var left=(r.lessons||[]).filter(function(l){return (l.subject||'—')===subject;});
          if(left.length) showLessons(subject,r.lessons||[]); else showHome();
        });
      });
    };
  });
}
/* ---------- lesson view (tabs) ---------- */
function showLesson(lesson,backFn){
  setBack(true); navStack=[backFn||showHome];
  var html='<div class="eduSecTitle" style="margin-top:0;">'+esc(lesson.title)+'</div>'
    +'<div class="eduTabs">'
    +'<button class="eduTab on" data-tab="sum">'+esc(T('summaryTab'))+'</button>'
    +'<button class="eduTab" data-tab="cards">'+esc(T('cardsTab'))+' ('+(lesson.flashcards||[]).length+')</button>'
    +'<button class="eduTab" data-tab="quiz">'+esc(T('quizTab'))+' ('+(lesson.quiz||[]).length+')</button>'
    +'<button class="eduTab" data-tab="lab">'+esc(T('labTab'))+'</button>'
    +'</div><div id="eduTabPane"></div>';
  body.innerHTML=html;
  var pane=document.getElementById('eduTabPane');
  function activate(tab){
    body.querySelectorAll('.eduTab').forEach(function(b){ b.classList.toggle('on',b.getAttribute('data-tab')===tab); });
    if(tab==='sum') pane.innerHTML='<div class="eduSummary">'+md(lesson.summary)+'</div>';
    else if(tab==='cards') renderCards(pane,lesson);
    else if(tab==='lab') renderLab(pane,lesson);
    else renderQuiz(pane,lesson);
  }
  body.querySelectorAll('.eduTab').forEach(function(b){ b.onclick=function(){ activate(b.getAttribute('data-tab')); }; });
  activate('sum');
}
/* v-edu-questions: درس وصل ببطاقات (0) واختبار (0) — شقّ الأسئلة تعثر وقتها.
   بدل شرطة ميتة: زر يولّد الأسئلة وحدها من الملخص الموجود ويحفظها. */
function eduRegenQuestions(pane,lesson,tab){
  function TL(ar,en){ return (typeof AL==='function'&&AL()==='en')?en:ar; }
  pane.innerHTML='<div class="eduCenter" style="padding:16px 6px;"><p style="font-size: var(--fs-3);line-height:1.8;">'+esc(TL('لم تصل أسئلة هذا الدرس — ولّدها الآن من الملخص خلال نحو دقيقة.','Questions did not arrive — generate them from the summary in about a minute.'))+'</p>'
    +'<button class="eduPrimary" id="eduRegenQsBtn">'+esc(TL('✨ ولّد الأسئلة الآن','✨ Generate questions'))+'</button></div>';
  var b=document.getElementById('eduRegenQsBtn');
  if(b) b.onclick=function(){
    pane.innerHTML='<div class="eduBusyBox"><div class="eduSpin"></div><div style="font-size: var(--fs-3);">'+esc(TL('⏳ نولّد البطاقات والاختبار…','⏳ Generating cards and quiz…'))+'</div></div>';
    api({action:'questions',summary:lesson.summary,lang:appLang(),nativeLang:eduNativeLang(),examLang:eduExamLang()})
      .then(function(j){
        if(!j||!Array.isArray(j.quiz)||!j.quiz.length) throw new Error(TL('تعذر التوليد — أعد المحاولة.','Generation failed — try again.'));
        lesson.flashcards=j.flashcards||[]; lesson.quiz=j.quiz||[]; lesson.written=j.written||[];
        persistLesson(lesson);
        showLesson(lesson);
      })
      .catch(function(e){
        pane.innerHTML='<div class="eduCenter"><p style="color:#f87171;font-size: var(--fs-3);line-height:1.8;">'+esc(e.message||T('err'))+'</p>'
          +'<button class="eduPrimary" id="eduRegenQsRetry">'+esc(T('retry'))+'</button></div>';
        var r=document.getElementById('eduRegenQsRetry'); if(r) r.onclick=function(){ eduRegenQuestions(pane,lesson,tab); };
      });
  };
}
/* ---------- flashcards ---------- */
function renderCards(pane,lesson){
  var cards=lesson.flashcards||[]; var i=0,known=0,flipped=false;
  if(!cards.length){ eduRegenQuestions(pane,lesson,'cards'); return; }
  function draw(){
    if(i>=cards.length){
      pane.innerHTML='<div class="eduCenter"><div class="eduScoreBig">'+known+'/'+cards.length+'</div><p>'+esc(T('cardsDone'))+'</p>'
        +'<button class="eduPrimary" id="eduCardsAgain">'+esc(T('review'))+'</button></div>';
      document.getElementById('eduCardsAgain').onclick=function(){ i=0;known=0;flipped=false;draw(); };
      saveProgress(lesson.id,{cardsKnown:known});
      return;
    }
    var c=cards[i];
    pane.innerHTML='<div style="text-align:center;font-size:12px;opacity:.65;margin-bottom:10px;">'+(i+1)+' / '+cards.length+'</div>'
      +'<div class="eduCardStage"><div class="eduCard'+(flipped?' flipped':'')+'" id="eduCardEl">'
      +'<div class="eduCardFace eduCardFront">'+esc(c.q)+'</div>'
      +'<div class="eduCardFace eduCardBack">'+esc(c.a)+'</div></div></div>'
      +'<div class="eduHintTxt">'+esc(T('tapFlip'))+'</div>'
      +'<div class="eduCardBtns"><button class="eduKnowBtn" id="eduKnow">'+esc(T('know'))+'</button>'
      +'<button class="eduReviewBtn" id="eduRev">'+esc(T('review'))+'</button></div>';
    document.getElementById('eduCardEl').onclick=function(){ flipped=!flipped; this.classList.toggle('flipped',flipped); };
    document.getElementById('eduKnow').onclick=function(){ known++; i++; flipped=false; draw(); };
    document.getElementById('eduRev').onclick=function(){ cards.push(cards[i]); i++; flipped=false; draw(); };
  }
  draw();
}
/* ---------- quiz ---------- */
function renderQuiz(pane,lesson){
  var all=(lesson.quiz||[]).slice();
  var written=(lesson.written||[]).slice();
  if(!all.length){ eduRegenQuestions(pane,lesson,'quiz'); return; }

  var LEVELS=['basic','mid','advanced'];
  var LABEL={basic:T2('أساسي','Basic'),mid:T2('متوسط','Intermediate'),advanced:T2('متقدّم','Advanced')};
  function T2(ar,en){ return (typeof AL==='function'&&AL()==='en')?en:ar; }

  /* Legacy lessons saved before levels existed carry no `level` — treat the
     whole set as one "mid" pool so old lessons still work unchanged. */
  var byLevel={basic:[],mid:[],advanced:[]};
  var tagged=false;
  all.forEach(function(q){
    var lv=(q.level||'').toLowerCase();
    if(LEVELS.indexOf(lv)>-1){ byLevel[lv].push(q); tagged=true; }
    else byLevel.mid.push(q);
  });

  var ROUND=5;
  var level=tagged?'mid':'mid';           /* start mid: never insult, never crush */
  var used={basic:0,mid:0,advanced:0};
  var stats={basic:{right:0,total:0},mid:{right:0,total:0},advanced:{right:0,total:0}};
  var round=[], i=0, roundRight=0;

  function nextRound(){
    var pool=byLevel[level].slice(used[level]);
    if(!pool.length){
      /* level exhausted — slide to any level that still has questions */
      var alt=LEVELS.filter(function(l){ return byLevel[l].length>used[l]; });
      if(!alt.length){ finish(); return false; }
      level=alt[alt.length-1];
      pool=byLevel[level].slice(used[level]);
    }
    round=pool.slice(0,ROUND);
    used[level]+=round.length;
    i=0; roundRight=0;
    return true;
  }

  function pct(o){ return o.total?Math.round(o.right/o.total*100):null; }

  function finish(){
    var s3={};
    LEVELS.forEach(function(l){ var v=pct(stats[l]); if(v!==null) s3[l]=v; });
    var done=LEVELS.filter(function(l){ return stats[l].total; });
    var overallR=0,overallT=0;
    done.forEach(function(l){ overallR+=stats[l].right; overallT+=stats[l].total; });
    var overall=overallT?Math.round(overallR/overallT*100):0;

    var html='<div class="eduCenter"><div style="font-size: var(--fs-3);opacity:.7;">'+esc(T('yourScore'))+'</div>'
      +'<div class="eduScoreBig">'+overall+'%</div>'
      +'<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:14px 0 4px;">';
    LEVELS.forEach(function(l){
      var v=s3[l];
      if(v===undefined) return;
      var col=v>=80?'#2e9e6b':(v>=50?'#c98a10':'#c0453f');
      html+='<div style="min-width:96px;padding:10px 12px;border-radius:var(--r-3);background:rgba(127,127,127,.10);">'
        +'<div style="font-size: var(--fs-5);opacity:.75;margin-bottom:4px;">'+esc(LABEL[l])+'</div>'
        +'<div style="font-size: var(--fs-1);font-weight: var(--w-bold);color:'+col+';">'+v+'%</div></div>';
    });
    html+='</div>';

    /* The weakest level is the actual advice — say it plainly. */
    var weak=null;
    done.forEach(function(l){ if(weak===null||s3[l]<s3[weak]) weak=l; });
    if(weak!==null&&s3[weak]<70){
      html+='<p style="font-size: var(--fs-3);line-height:1.8;max-width:340px;margin:6px auto 0;">'
        +esc(T2('ركّز مراجعتك على مستوى ','Focus your review on the '))
        +'<b>'+esc(LABEL[weak])+'</b>'
        +esc(T2('.','level.'))+'</p>';
    }
    html+='<div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">'
      +'<button class="eduPrimary" id="eduRetry">'+esc(T('retry'))+'</button>';
    if(written.length) html+='<button class="eduPrimary" id="eduWritten" style="background:transparent;border:1px solid currentColor;">'+esc(T2('أسئلة مقالية ✍️','Written questions ✍️'))+'</button>';
    html+='</div></div>';
    pane.innerHTML=html;

    document.getElementById('eduRetry').onclick=function(){
      used={basic:0,mid:0,advanced:0};
      stats={basic:{right:0,total:0},mid:{right:0,total:0},advanced:{right:0,total:0}};
      level='mid'; if(nextRound()) draw();
    };
    var wb=document.getElementById('eduWritten');
    if(wb) wb.onclick=function(){ renderWritten(pane,lesson,written); };

    saveProgress(lesson.id,{bestScore:overall,scores:s3});
  }

  function draw(){
    if(i>=round.length){
      /* 4+/5 → step up, <3/5 → step down. Otherwise stay. */
      var idx=LEVELS.indexOf(level);
      if(roundRight>=4&&idx<2) level=LEVELS[idx+1];
      else if(roundRight<3&&idx>0) level=LEVELS[idx-1];
      var remaining=LEVELS.some(function(l){ return byLevel[l].length>used[l]; });
      if(!remaining||stats.basic.total+stats.mid.total+stats.advanced.total>=15){ finish(); return; }
      if(!nextRound()) return;
    }
    var q=round[i];
    var html='<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;opacity:.7;margin-bottom:8px;">'
      +'<span>'+(i+1)+' / '+round.length+'</span>'
      +'<span style="padding:3px 9px;border-radius:var(--r-4);background:rgba(127,127,127,.14);">'+esc(LABEL[level])+'</span></div>'
      +'<div style="font-size: var(--fs-2);font-weight: var(--w-bold);margin-bottom:14px;line-height:1.7;">'+esc(q.q)+'</div>';
    (q.options||[]).forEach(function(o,idx){ html+='<button class="eduQOpt" data-idx="'+idx+'">'+esc(o)+'</button>'; });
    html+='<div id="eduExpl"></div><div style="text-align:center;margin-top:14px;"><button class="eduPrimary" id="eduNextQ" style="display:none;">'+esc(T('next'))+'</button></div>';
    pane.innerHTML=html;

    var answered=false;
    pane.querySelectorAll('.eduQOpt').forEach(function(btn){
      btn.onclick=function(){
        if(answered) return; answered=true;
        var idx=parseInt(btn.getAttribute('data-idx'),10);
        pane.querySelectorAll('.eduQOpt').forEach(function(b,bi){
          if(bi===q.correct) b.classList.add('right');
          else if(bi===idx) b.classList.add('wrong');
          b.style.cursor='default';
        });
        var ok=(idx===q.correct);
        if(ok){ roundRight++; stats[level].right++; }
        stats[level].total++;
        var ex='';
        if(q.explain) ex+='💡 '+esc(q.explain);
        /* Wrong answer points back into the summary, not just "incorrect". */
        if(!ok&&q.section) ex+=(ex?'<br>':'')+'📌 '+esc(T2('راجع: ','Review: '))+'<b>'+esc(q.section)+'</b>';
        if(ex) document.getElementById('eduExpl').innerHTML='<div class="eduExplain">'+ex+'</div>';
        document.getElementById('eduNextQ').style.display='';
      };
    });
    document.getElementById('eduNextQ').onclick=function(){ i++; draw(); };
  }

  if(nextRound()) draw();
}

/* ---------- 🧪 v-edu-lab: الدرس الحي — تجربة تفاعلية مولّدة من الدرس ---------- */
function renderLab(pane,lesson){
  function TL(ar,en){ return (typeof AL==='function'&&AL()==='en')?en:ar; }
  function showFrame(html){
    pane.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap;">'
      +'<span style="font-size:12.5px;opacity:.75;">'+esc(TL('العب بالمفهوم بيدك — كل الأزرار داخل التجربة تعمل','Play with the concept — everything inside is interactive'))+'</span>'
      +'<button class="eduPrimary" id="eduLabRedo" style="padding:7px 12px;font-size:12px;background:transparent;border:1px solid currentColor;">'+esc(TL('🔄 توليد تجربة جديدة','🔄 Regenerate'))+'</button></div>';
    var fr=document.createElement('iframe');
    fr.setAttribute('sandbox','allow-scripts');
    fr.style.cssText='width:100%;height:min(70vh,620px);border:1px solid rgba(212,175,55,.35);border-radius:14px;background:#0b0b0f;display:block;';
    fr.srcdoc=html;
    pane.appendChild(fr);
    var rb=document.getElementById('eduLabRedo');
    if(rb) rb.onclick=function(){ build(true); };
  }
  function build(force){
    pane.innerHTML='<div class="eduBusyBox"><div class="eduSpin"></div><div style="font-size: var(--fs-3);">'+esc(TL('🧪 نبني تجربتك الحية… تحتاج دقيقة إلى دقيقتين — تستاهل الانتظار','🧪 Building your live lab… takes one to two minutes'))+'</div></div>';
    api({action:'lab',id:lesson.id,title:lesson.title,subject:lesson.subject,summary:lesson.summary,lang:appLang(),nativeLang:eduNativeLang(),force:force||undefined})
      .then(function(j){
        if(!j||!j.html) throw new Error(TL('وصلت تجربة فارغة — أعد المحاولة.','Empty lab returned — try again.'));
        lesson.__labHtml=j.html;
        showFrame(j.html);
      })
      .catch(function(e){
        pane.innerHTML='<div class="eduCenter"><p style="color:#f87171;font-size: var(--fs-3);line-height:1.8;">'+esc(e.message||T('err'))+'</p>'
          +'<button class="eduPrimary" id="eduLabRetry">'+esc(T('retry'))+'</button></div>';
        var b=document.getElementById('eduLabRetry'); if(b) b.onclick=function(){ build(force); };
      });
  }
  if(lesson.__labHtml){ showFrame(lesson.__labHtml); return; }
  pane.innerHTML='<div class="eduCenter" style="padding:18px 6px;">'
    +'<div style="font-size:40px;margin-bottom:10px;">🧪</div>'
    +'<p style="font-size: var(--fs-2);font-weight: var(--w-bold);margin:0 0 8px;">'+esc(T('labTab'))+'</p>'
    +'<p style="font-size: var(--fs-3);line-height:1.9;max-width:380px;margin:0 auto 16px;opacity:.85;">'
    +esc(TL('نحوّل هذا الدرس إلى تجربة تفاعلية تلعب فيها بالمفهوم بيدك: منزلقات وأزرار ترى نتيجتها فورًا، ثم وضع تحدٍّ بنقاط. الدرس الذي تلعبه لا تنساه.',
            'We turn this lesson into an interactive lab: sliders and buttons with instant results, then a challenge mode with points. A lesson you play, you never forget.'))+'</p>'
    +'<button class="eduPrimary" id="eduLabBuild">'+esc(TL('✨ ابنِ تجربتي الحية','✨ Build my live lab'))+'</button></div>';
  var bb=document.getElementById('eduLabBuild'); if(bb) bb.onclick=function(){ build(false); };
}

/* ---------- written questions graded by the model against a rubric ---------- */
function renderWritten(pane,lesson,written){
  var i=0;
  function draw(){
    if(i>=written.length){
      pane.innerHTML='<div class="eduCenter"><div style="font-size:34px;margin-bottom:10px;">✍️</div>'
        +'<p style="font-size: var(--fs-2);">'+esc(TW('أنهيت الأسئلة المقالية.','You finished the written questions.'))+'</p>'
        +'<button class="eduPrimary" id="eduBackQuiz">'+esc(TW('رجوع','Back'))+'</button></div>';
      document.getElementById('eduBackQuiz').onclick=function(){ renderQuiz(pane,lesson); };
      return;
    }
    var w=written[i];
    pane.innerHTML='<div style="font-size:12px;opacity:.7;margin-bottom:8px;">'+(i+1)+' / '+written.length+' · ✍️</div>'
      +'<div style="font-size: var(--fs-2);font-weight: var(--w-bold);margin-bottom:12px;line-height:1.7;">'+esc(w.q)+'</div>'
      +'<textarea id="eduAns" rows="6" placeholder="'+esc(TW('اكتب إجابتك هنا…','Write your answer here…'))+'" '
      +'style="width:100%;box-sizing:border-box;padding:12px;border-radius:var(--r-2);border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit;line-height:1.8;resize:vertical;"></textarea>'
      +'<div style="text-align:center;margin-top:12px;"><button class="eduPrimary" id="eduGrade">'+esc(TW('صحّح إجابتي','Grade my answer'))+'</button></div>'
      +'<div id="eduGradeOut"></div>';
    document.getElementById('eduGrade').onclick=function(){ grade(w,document.getElementById('eduAns').value,null); };
  }

  function TW(ar,en){ return (typeof AL==='function'&&AL()==='en')?en:ar; }

  function grade(w,answer,dispute){
    var out=document.getElementById('eduGradeOut');
    var btn=document.getElementById('eduGrade');
    if(!answer||!answer.trim()){ out.innerHTML='<div class="eduExplain">'+esc(TW('اكتب إجابتك أولًا.','Write your answer first.'))+'</div>'; return; }
    if(btn){ btn.disabled=true; btn.textContent=TW('جارٍ التصحيح…','Grading…'); }
    api({action:'grade',question:w.q,rubric:w.rubric||[],answer:answer,dispute:dispute||undefined})
      .then(function(j){
        var g=j.grade||{};
        var col=g.score>=8?'#2e9e6b':(g.score>=5?'#c98a10':'#c0453f');
        var html='<div style="margin-top:16px;padding:14px;border-radius:var(--r-3);background:rgba(127,127,127,.10);">'
          +'<div style="font-size: var(--fs-1);font-weight: var(--w-bold);color:'+col+';margin-bottom:10px;">'+g.score+' / '+g.max+'</div>';
        if((g.covered||[]).length){
          html+='<div style="font-size: var(--fs-3);line-height:1.9;margin-bottom:8px;"><b>✅ '+esc(TW('أصبتَ في:','You covered:'))+'</b><ul style="margin:4px 0 0;padding-inline-start:20px;">';
          g.covered.forEach(function(c){ html+='<li>'+esc(c)+'</li>'; }); html+='</ul></div>';
        }
        if((g.missing||[]).length){
          html+='<div style="font-size: var(--fs-3);line-height:1.9;margin-bottom:8px;"><b>⚠️ '+esc(TW('نقصك:','You missed:'))+'</b><ul style="margin:4px 0 0;padding-inline-start:20px;">';
          g.missing.forEach(function(c){ html+='<li>'+esc(c)+'</li>'; }); html+='</ul></div>';
        }
        if(g.feedback) html+='<p style="font-size: var(--fs-3);line-height:1.8;margin:8px 0 0;">'+esc(g.feedback)+'</p>';
        if(g.review) html+='<p style="font-size:13px;opacity:.8;margin:8px 0 0;">📌 '+esc(TW('راجع: ','Review: '))+'<b>'+esc(g.review)+'</b></p>';
        /* The model is not infallible — always show the rubric it judged
           against, and let the student contest the result. */
        if((g.rubric||[]).length){
          html+='<details style="margin-top:10px;"><summary style="font-size:12px;opacity:.75;cursor:pointer;">'+esc(TW('على أي أساس صُحِّحت إجابتي؟','What was I graded against?'))+'</summary>'
            +'<ul style="font-size:12px;line-height:1.9;margin:6px 0 0;padding-inline-start:20px;opacity:.85;">';
          g.rubric.forEach(function(r){ html+='<li>'+esc(r)+'</li>'; });
          html+='</ul></details>';
        }
        html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">'
          +'<button class="eduPrimary" id="eduNextW">'+esc(i===written.length-1?TW('إنهاء','Finish'):TW('التالي','Next'))+'</button>'
          +'<button class="eduPrimary" id="eduDispute" style="background:transparent;border:1px solid currentColor;">'+esc(TW('راجع تصحيحي','Contest this'))+'</button>'
          +'</div><p style="font-size: var(--fs-5);opacity:.6;margin:10px 0 0;">'+esc(TW('هذا تقدير للمذاكرة، وليس درجة رسمية.','This is a study estimate, not an official grade.'))+'</p></div>';
        out.innerHTML=html;
        if(btn){ btn.disabled=false; btn.textContent=TW('صحّح إجابتي','Grade my answer'); }
        document.getElementById('eduNextW').onclick=function(){ i++; draw(); };
        document.getElementById('eduDispute').onclick=function(){
          var why=prompt(TW('لماذا ترى أن التصحيح غير منصف؟','Why do you think the grading was unfair?'));
          if(why&&why.trim()) grade(w,document.getElementById('eduAns').value,why.trim());
        };
      })
      .catch(function(e){
        out.innerHTML='<div class="eduExplain">'+esc(e.message||TW('تعذّر التصحيح.','Grading failed.'))+'</div>';
        if(btn){ btn.disabled=false; btn.textContent=TW('صحّح إجابتي','Grade my answer'); }
      });
  }
  draw();
}
/* ---------- processing (upload / paste) ---------- */
function showBusy(){ setBack(false); body.innerHTML='<div class="eduBusyBox"><div class="eduSpin"></div><div style="font-size: var(--fs-3);">'+esc(T('analyzing'))+'</div></div>'; }
/* Language bridge: the student may study in one language and be examined in
   another. Native language follows the app UI; exam language is chosen once
   and remembered. Empty exam language = same as native, i.e. bridge off. */
/* One-line control: "I study in X but my exam is in Y". Off by default —
   only students who actually need the bridge ever see a difference. */
var EDU_EXAM_LANGS=[['','—'],['ar','العربية'],['en','English'],['fr','Français'],['hi','हिन्दी'],['ur','اردو'],['ml','മലയാളം'],['bn','বাংলা'],['id','Bahasa'],['tr','Türkçe'],['es','Español'],['zh','中文'],['ru','Русский']];
function eduExamLangControl(){
  var cur=eduExamLang();
  var isEn=(typeof AL==='function'&&AL()==='en');
  var label=isEn?'My exam language':'لغة امتحاني';
  var hint=isEn?'Explanations stay in your language; terms follow the exam.':'الشرح بلغتك، والمصطلحات بلغة الامتحان.';
  var h='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 2px;font-size: var(--fs-3);">'
    +'<span style="opacity:.85;">'+esc(label)+'</span>'
    +'<select id="eduExamLangSel" style="padding:7px 10px;border-radius:var(--r-2);border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit;font-size: var(--fs-3);">';
  EDU_EXAM_LANGS.forEach(function(o){
    h+='<option value="'+esc(o[0])+'"'+(o[0]===cur?' selected':'')+'>'+esc(o[1])+'</option>';
  });
  h+='</select></div><div style="font-size: var(--fs-5);opacity:.6;line-height:1.7;margin-bottom:4px;">'+esc(hint)+'</div>';
  return h;
}
function bindEduExamLang(){
  var el=document.getElementById('eduExamLangSel');
  if(el) el.onchange=function(){ setEduExamLang(el.value); };
}

function eduNativeLang(){ try{ return AL()||'ar'; }catch(e){ return 'ar'; } }
function eduExamLang(){ try{ return localStorage.getItem('edu_exam_lang')||''; }catch(e){ return ''; } }
function setEduExamLang(v){ try{ if(v) localStorage.setItem('edu_exam_lang',v); else localStorage.removeItem('edu_exam_lang'); }catch(e){ __swallow(e, "save:index#10"); } }

/* v655: درس من المنهج — الطالب يختار البلد والمرحلة والصف والمادة واسم الدرس،
   والذكاء الاصطناعي يؤلف شرحًا كاملًا + بطاقات + اختبار عبر action:'explain'. */
var EDU_COUNTRIES=['الإمارات','السعودية','مصر','الأردن','الكويت','قطر','البحرين','عُمان','العراق','سوريا','لبنان','فلسطين','اليمن','المغرب','الجزائر','تونس','ليبيا','السودان','منهج بريطاني IGCSE','منهج أمريكي','بكالوريا دولية IB'];
function showCurriculum(){
  setBack(true); navStack=[showHome];
  var isEn=(typeof AL==='function'&&AL()==='en');
  function W(a,e){ return isEn?e:a; }
  var fld='width:100%;box-sizing:border-box;padding:11px;border-radius:var(--r-2);border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit;font-size:var(--fs-3);';
  var lab='display:block;margin:12px 0 5px;font-size:var(--fs-3);opacity:.85;';
  var stages=[W('ابتدائي','Primary'),W('إعدادي / متوسط','Middle school'),W('ثانوي','High school'),W('جامعة','University'),W('كلية / معهد','College / institute')];
  var h='<div style="font-size:var(--fs-3);line-height:1.8;opacity:.8;margin-bottom:4px;">'+esc(W('اختر منهجك وبيانات الدرس، وبيتألف لك شرح كامل + بطاقات مراجعة + اختبار.','Pick your curriculum and lesson details — you get a full explanation, flashcards and a quiz.'))+'</div>'
   +'<label style="'+lab+'">'+esc(W('البلد / المنهج','Country / curriculum'))+'</label>'
   +'<input id="eduCurCountry" list="eduCountryList" placeholder="'+esc(W('مثال: الإمارات','e.g. UAE'))+'" style="'+fld+'"><datalist id="eduCountryList">'+EDU_COUNTRIES.map(function(c){return '<option value="'+esc(c)+'">';}).join('')+'</datalist>'
   +'<label style="'+lab+'">'+esc(W('المرحلة','Stage'))+'</label><select id="eduCurStage" style="'+fld+'">'+stages.map(function(st){return '<option value="'+esc(st)+'">'+esc(st)+'</option>';}).join('')+'</select>'
   +'<label style="'+lab+'">'+esc(W('الصف / السنة','Grade / year'))+'</label><input id="eduCurGrade" placeholder="'+esc(W('مثال: الصف التاسع أو السنة الثانية','e.g. Grade 9 or 2nd year'))+'" style="'+fld+'">'
   +'<label style="'+lab+'">'+esc(W('المادة','Subject'))+'</label><input id="eduCurSubject" placeholder="'+esc(W('مثال: رياضيات، فيزياء، أحياء…','e.g. Math, Physics, Biology…'))+'" style="'+fld+'">'
   +'<label style="'+lab+'">'+esc(W('اسم الدرس أو موضوعه','Lesson name or topic'))+'</label><input id="eduCurLesson" placeholder="'+esc(W('مثال: المعادلات التربيعية','e.g. Quadratic equations'))+'" style="'+fld+'">'
   +'<div id="eduCurErr" style="color:#f87171;font-size:var(--fs-4);margin-top:8px;display:none;"></div>'
   +'<button class="eduPrimary" id="eduCurGo" style="margin-top:14px;width:100%;">'+esc(W('✨ ألّف لي الدرس','✨ Generate my lesson'))+'</button>';
  body.innerHTML=h;
  document.getElementById('eduCurGo').onclick=function(){
    var v=function(id){ var el=document.getElementById(id); return el?String(el.value||'').trim():''; };
    var subj=v('eduCurSubject'), les=v('eduCurLesson');
    var err=document.getElementById('eduCurErr');
    if(!subj||!les){ err.textContent=W('اكتب المادة واسم الدرس على الأقل.','Enter at least the subject and lesson name.'); err.style.display='block'; return; }
    processContent({country:v('eduCurCountry'),stage:v('eduCurStage'),grade:v('eduCurGrade'),subject:subj,lesson:les,lang:appLang()},'explain');
  };
}
function processContent(payload,__act){
  showBusy();
  api(Object.assign({action:__act||'process',nativeLang:eduNativeLang(),examLang:eduExamLang()},payload)).then(function(j){
    var L=j.lesson||{};
    return listLessons().then(function(r){
      var subs=[]; (r.lessons||[]).forEach(function(x){ if(subs.indexOf(x.subject||'—')<0) subs.push(x.subject||'—'); });
      var subj=L.subject||'عام';
      var lesson={
        id:'l'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
        subject:subj,
        color:(subs.indexOf(subj)>=0?subs.indexOf(subj):subs.length)%PALETTE.length,
        title:L.title||subj, summary:L.summary||'', flashcards:L.flashcards||[], quiz:L.quiz||[],
        written:L.written||[],
        createdAt:Date.now(), bestScore:null, scores:{}, cardsKnown:0
      };
      return persistLesson(lesson).then(function(){ showLesson(lesson,showHome); });
    });
  }).catch(function(err){
    body.innerHTML='<div class="eduCenter"><p style="color:#f87171;font-size: var(--fs-3);line-height:1.8;">'+esc(err.message||T('err'))+'</p>'
      +'<button class="eduPrimary" id="eduErrBack">'+esc(T('retry'))+'</button></div>';
    document.getElementById('eduErrBack').onclick=showHome;
    setBack(true); navStack=[showHome];
  });
}
function fileToBase64(file){
  return new Promise(function(res,rej){
    var r=new FileReader();
    r.onload=function(){ res(String(r.result).split(',')[1]||''); };
    r.onerror=function(){ rej(new Error(T('err'))); };
    r.readAsDataURL(file);
  });
}
function handleFiles(files){
  files=Array.prototype.slice.call(files||[]);
  if(!files.length) return;
  var total=files.reduce(function(a,f){return a+f.size;},0);
  if(total>10*1024*1024){ alert(T('tooBig')); return; }
  var f0=files[0];
  var name=(f0.name||'').toLowerCase();
  if(/\.docx$/.test(name)){ handleDocx(f0); return; }
  // v412: الأرشيف كان يسقط في «حدث خطأ» بلا دلالة — الآن يُفكّ ويُستخرج نصّه هنا.
  if(/\.(zip|jar)$/.test(name)){ handleArchive(f0); return; }
  if(/pdf/.test(f0.type)||/\.pdf$/.test(name)){
    showBusy();
    fileToBase64(f0).then(function(b64){ processContent({fileBase64:b64,mime:'application/pdf',fileName:f0.name,lang:appLang()}); })
      .catch(function(e){ alert(e.message||T('err')); showHome(); });
    return;
  }
  var imgs=files.filter(function(f){ return /^image\//.test(f.type); }).slice(0,10);
  if(!imgs.length){
    // v412: الرسالة العامة «حدث خطأ» كانت تترك المستخدم يظن أن ملفه تالف.
    alert('نوع الملف غير مدعوم هنا. رفع المحاضرة يقبل: PDF أو DOCX أو ZIP أو صور.\n\n' +
      'أما ملفات الكود والمشاريع فتُرفع من زر 📎 إرفاق داخل المحادثة.');
    return;
  }
  showBusy();
  Promise.all(imgs.map(function(f){ return fileToBase64(f).then(function(b64){ return {base64:b64,mime:f.type}; }); }))
    .then(function(arr){ processContent({images:arr,lang:appLang()}); })
    .catch(function(e){ alert(e.message||T('err')); showHome(); });
}
// بعض نسخ الواجهة القديمة كانت تستدعي الدالة من معالج HTML عام. إبقاء هذا
// الاسم متاحًا يمنع ReferenceError عند تداخل كاش الـPWA أثناء التحديث.
window.handleFiles=handleFiles;
/* v412: فكّ الأرشيف داخل المتصفح واستخراج نصّه للتحليل التعليمي */
function handleArchive(file){
  showBusy();
  function fail(msg){
    body.innerHTML='<div class="eduCenter"><p style="font-size: var(--fs-3);line-height:1.9">'+esc(msg)+'</p>'+
      '<button class="eduPrimary" id="eduErrBack">حسنًا</button></div>';
    document.getElementById('eduErrBack').onclick=showHome; setBack(true); navStack=[showHome];
  }
  function run(){
    file.arrayBuffer().then(function(buf){ return window.JSZip.loadAsync(buf); })
      .then(function(zip){
        var TEXT=/\.(txt|md|markdown|csv|json|html?|xml|rtf)$/i;
        var names=Object.keys(zip.files).filter(function(n){
          return !zip.files[n].dir && TEXT.test(n) && !/(^|\/)(__MACOSX|node_modules)\//.test(n);
        }).slice(0,25);
        if(!names.length) throw new Error('لا يوجد نص قابل للقراءة داخل الأرشيف. ارفع PDF أو صورًا للمحاضرة.');
        return Promise.all(names.map(function(n){
          return zip.files[n].async('string').then(function(t){ return '— '+n+' —\n'+t; });
        })).then(function(parts){ return parts.join('\n\n').slice(0,60000); });
      })
      .then(function(txt){
        if(!txt.trim()) throw new Error('الأرشيف فارغ من النصوص.');
        processContent({text:txt,lang:appLang()});
      })
      .catch(function(e){ fail(e.message||'تعذّر فتح الأرشيف.'); });
  }
  if(window.JSZip) run();
  else{
    var sc=document.createElement('script');
    sc.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    sc.onload=run; sc.onerror=function(){ fail('تعذّر تحميل أداة فكّ الضغط. تحقّق من الاتصال.'); };
    document.head.appendChild(sc);
  }
}
function handleDocx(file){
  showBusy();
  function fail(){ body.innerHTML='<div class="eduCenter"><p style="font-size: var(--fs-3);">'+esc(T('docxFail'))+'</p><button class="eduPrimary" id="eduErrBack">OK</button></div>'; document.getElementById('eduErrBack').onclick=showHome; setBack(true); navStack=[showHome]; }
  function run(){
    file.arrayBuffer().then(function(buf){ return window.JSZip.loadAsync(buf); })
      .then(function(zip){ var f=zip.file('word/document.xml'); if(!f) throw new Error('no xml'); return f.async('string'); })
      .then(function(xml){
        var text=xml.replace(/<w:p[ >]/g,'\n<w:p ').replace(/<[^>]+>/g,' ').replace(/[ \t]+/g,' ').replace(/\n\s*/g,'\n').trim();
        if(!text||text.length<20) throw new Error('empty');
        processContent({text:text.slice(0,180000),lang:appLang()});
      }).catch(fail);
  }
  if(window.JSZip){ run(); return; }
  var s=document.createElement('script');
  s.src='https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
  s.onload=run; s.onerror=fail;
  document.head.appendChild(s);
}
/* ---------- integrations (all additive, guarded) ---------- */
/* v306: the dedicated menu button was merged into the single «التعليم» button
   (btnOmranEdu), whose handler calls window.eduHubOpen(). */
window.eduHubOpen=openModal;
/* first-open announcement */
try{
  if(!localStorage.getItem(LS_INTRO)){
    setTimeout(function(){
      var card=document.getElementById('eduIntroCard'); if(!card) return;
      document.getElementById('eduIntroTxt').textContent=T('intro');
      document.getElementById('eduIntroOpen').textContent=T('introBtn');
      card.setAttribute('dir',isRTL()?'rtl':'ltr');
      card.classList.add('show');
      document.getElementById('eduIntroOpen').onclick=function(){ localStorage.setItem(LS_INTRO,'1'); card.classList.remove('show'); openModal(); };
      document.getElementById('eduIntroClose').onclick=function(){ localStorage.setItem(LS_INTRO,'1'); card.classList.remove('show'); };
    },2500);
  }
}catch(e){ __swallow(e, "save:index#11"); }
/* chat smart hint (purely additive listener) */
try{
  var hintShown=false;
  var HINT_RE=/(لخص|لخّص|اختبرني|بطاقات مراجعة|محاضرة|مذاكرة|ذاكر|امتحان|study|summarize lecture|quiz me)/i;
  function maybeHint(txt){
    if(hintShown||!txt||!HINT_RE.test(txt)) return;
    hintShown=true;
    var h=document.getElementById('eduChatHint'); if(!h) return;
    document.getElementById('eduChatHintTxt').textContent=T('hint');
    document.getElementById('eduChatHintBtn').textContent=T('title');
    h.setAttribute('dir',isRTL()?'rtl':'ltr');
    h.classList.add('show');
    document.getElementById('eduChatHintBtn').onclick=function(){ h.classList.remove('show'); openModal(); };
    setTimeout(function(){ h.classList.remove('show'); },12000);
  }
  document.addEventListener('click',function(e){
    try{ if(e.target&&e.target.closest&&e.target.closest('#btnSend')){ var p=document.getElementById('prompt'); maybeHint(p?p.value:''); } }catch(err){ __swallow(err, "ui:index#12"); }
  },true);
  document.addEventListener('keydown',function(e){
    try{ if(e.key==='Enter'&&!e.shiftKey&&e.target&&e.target.id==='prompt'){ maybeHint(e.target.value); } }catch(err){ __swallow(err, "misc:index#13"); }
  },true);
}catch(e){ __swallow(e, "misc:index#14"); }
renderStreak();
})();
