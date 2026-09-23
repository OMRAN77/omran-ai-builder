/* ============ 🎓 إضافات التعليم (v-edu-plus) ============
 * طلب المالك (٢٣ سبتمبر): «صلحها كلها مرة وحدة» بعد فحص قسم التعليم:
 *   💬 اسأل المعلّم داخل الدرس · 🧩 حلّ مسألة خطوة بخطوة · 🔁 مراجعة متباعدة للبطاقات
 *   📊 تقدّمي + خطّة امتحان · 🔊 استمع للدرس · 🎮 مسار «خوارزميات الألعاب» (edu-algo.js، يُحمَّل عند الطلب)
 * يعتمد على window.__eduCore الذي يكشفه edu.js (نفس المحرّك والتنقّل والتخزين).
 * الدوالّ الحسابيّة (srsNext، srsDue، buildExamPlan) نقيّة ومكشوفة للاختبار في window.__eduPlus.lib. */
(function(){
'use strict';
/* نصوص الإضافات بالـ14 لغة: العربيّة والأرديّة ← النصّ العربيّ، الإنجليزيّة ← الثاني، والبقيّة من هنا (eduL في edu.js يقرأه) */
window.__EDU_XL2 = {
"💬 اسأل المعلّم":{"fr": "💬 Demander au tuteur", "hi": "💬 शिक्षक से पूछें", "bn": "💬 শিক্ষককে জিজ্ঞাসা করুন", "ne": "💬 शिक्षकलाई सोध्नुहोस्", "id": "💬 Tanya tutor", "fil": "💬 Magtanong sa tutor", "tr": "💬 Öğretmene sor", "zh": "💬 问老师", "ru": "💬 Спросить учителя", "es": "💬 Pregunta al tutor", "ml": "💬 അധ്യാപകനോട് ചോദിക്കൂ"},
"أعد المحاولة":{"fr": "Réessayer", "hi": "फिर से कोशिश करें", "bn": "আবার চেষ্টা করুন", "ne": "फेरि प्रयास गर्नुहोस्", "id": "Coba lagi", "fil": "Subukan muli", "tr": "Tekrar dene", "zh": "重试", "ru": "Попробовать снова", "es": "Reintentar", "ml": "വീണ്ടും ശ്രമിക്കൂ"},
"لا توجد بطاقات مستحقّة اليوم.":{"fr": "Aucune carte à réviser aujourd’hui.", "hi": "आज कोई कार्ड दोहराने के लिए नहीं है।", "bn": "আজ পুনরালোচনার কোনো কার্ড নেই।", "ne": "आज दोहोर्याउने कुनै कार्ड छैन।", "id": "Tidak ada kartu yang jatuh tempo hari ini.", "fil": "Walang kard na dapat balikan ngayon.", "tr": "Bugün tekrar edilecek kart yok.", "zh": "今天没有到期的卡片。", "ru": "Сегодня нет карточек для повторения.", "es": "Hoy no hay tarjetas pendientes.", "ml": "ഇന്ന് ആവർത്തിക്കാൻ കാർഡുകളില്ല."},
"كلّ بطاقة تحكم عليها في أيّ درس تُجدوَل هنا تلقائيًّا: يوم، ثمّ ٣ أيّام، ثمّ أسبوع، ثمّ أسبوعان، ثمّ شهر.":{"fr": "Chaque carte notée dans une leçon est planifiée ici automatiquement : 1 jour, 3 jours, une semaine, deux semaines, puis un mois.", "hi": "किसी भी पाठ में आप जिस कार्ड को आँकते हैं वह यहाँ अपने-आप तय होता है: 1 दिन, 3 दिन, एक सप्ताह, दो सप्ताह, फिर एक महीना।", "bn": "যেকোনো পাঠে আপনি যে কার্ড মূল্যায়ন করেন তা এখানে স্বয়ংক্রিয়ভাবে নির্ধারিত হয়: ১ দিন, ৩ দিন, এক সপ্তাহ, দুই সপ্তাহ, তারপর এক মাস।", "ne": "कुनै पनि पाठमा मूल्याङ्कन गरेको कार्ड यहाँ आफैँ तालिकाबद्ध हुन्छ: १ दिन, ३ दिन, एक हप्ता, दुई हप्ता, त्यसपछि एक महिना।", "id": "Setiap kartu yang kamu nilai di pelajaran mana pun dijadwalkan otomatis di sini: 1 hari, 3 hari, seminggu, dua minggu, lalu sebulan.", "fil": "Bawat kard na minarkahan mo sa anumang aralin ay awtomatikong nakaiskedyul dito: 1 araw, 3 araw, isang linggo, dalawang linggo, saka isang buwan.", "tr": "Herhangi bir derste değerlendirdiğin her kart burada otomatik planlanır: 1 gün, 3 gün, bir hafta, iki hafta, sonra bir ay.", "zh": "你在任何课程中评过的卡片都会自动排到这里：1天、3天、1周、2周，然后1个月。", "ru": "Каждая оценённая карточка автоматически планируется здесь: 1 день, 3 дня, неделя, две недели, затем месяц.", "es": "Cada tarjeta que calificas en cualquier lección se programa aquí automáticamente: 1 día, 3 días, una semana, dos semanas y luego un mes.", "ml": "ഏത് പാഠത്തിലും നിങ്ങൾ വിലയിരുത്തുന്ന ഓരോ കാർഡും ഇവിടെ സ്വയം ക്രമീകരിക്കും: 1 ദിവസം, 3 ദിവസം, ഒരാഴ്ച, രണ്ടാഴ്ച, പിന്നെ ഒരു മാസം."},
"أنهيت مراجعة اليوم! 🎉":{"fr": "Révision du jour terminée ! 🎉", "hi": "आज की दोहराई पूरी! 🎉", "bn": "আজকের পুনরালোচনা শেষ! 🎉", "ne": "आजको दोहोर्याइ सकियो! 🎉", "id": "Tinjauan hari ini selesai! 🎉", "fil": "Tapos na ang balik-aral ngayon! 🎉", "tr": "Bugünkü tekrar bitti! 🎉", "zh": "今天的复习完成了！🎉", "ru": "Повторение на сегодня завершено! 🎉", "es": "¡Terminaste el repaso de hoy! 🎉", "ml": "ഇന്നത്തെ ആവർത്തനം പൂർത്തിയായി! 🎉"},
"مراجعة اليوم":{"fr": "Révision du jour", "hi": "आज की दोहराई", "bn": "আজকের পুনরালোচনা", "ne": "आजको दोहोर्याइ", "id": "Tinjauan hari ini", "fil": "Balik-aral ngayon", "tr": "Bugünkü tekrar", "zh": "今日复习", "ru": "Повторение на сегодня", "es": "Repaso de hoy", "ml": "ഇന്നത്തെ ആവർത്തനം"},
"استمع للدرس":{"fr": "Écouter la leçon", "hi": "पाठ सुनें", "bn": "পাঠ শুনুন", "ne": "पाठ सुन्नुहोस्", "id": "Dengarkan pelajaran", "fil": "Pakinggan ang aralin", "tr": "Dersi dinle", "zh": "听课文", "ru": "Прослушать урок", "es": "Escuchar la lección", "ml": "പാഠം കേൾക്കൂ"},
"إيقاف":{"fr": "Arrêter", "hi": "रोकें", "bn": "থামান", "ne": "रोक्नुहोस्", "id": "Berhenti", "fil": "Ihinto", "tr": "Durdur", "zh": "停止", "ru": "Стоп", "es": "Detener", "ml": "നിർത്തൂ"},
"ما فهمت — اشرحها بطريقة أبسط":{"fr": "Je ne comprends pas — explique plus simplement", "hi": "समझ नहीं आया — और आसान तरीके से समझाइए", "bn": "বুঝিনি — আরও সহজভাবে বুঝিয়ে দিন", "ne": "बुझिनँ — अझ सजिलो तरिकाले बुझाउनुहोस्", "id": "Aku belum paham — jelaskan lebih sederhana", "fil": "Hindi ko maintindihan — ipaliwanag nang mas simple", "tr": "Anlamadım — daha basit anlat", "zh": "我没懂——请讲得更简单些", "ru": "Не понял — объясни проще", "es": "No lo entiendo — explícalo más fácil", "ml": "മനസ്സിലായില്ല — ലളിതമായി വിശദീകരിക്കൂ"},
"أعطني مثالًا من الحياة":{"fr": "Donne-moi un exemple concret", "hi": "जीवन से एक उदाहरण दीजिए", "bn": "বাস্তব জীবনের একটি উদাহরণ দিন", "ne": "जीवनबाट एउटा उदाहरण दिनुहोस्", "id": "Beri contoh dari kehidupan nyata", "fil": "Magbigay ng halimbawa mula sa totoong buhay", "tr": "Gerçek hayattan bir örnek ver", "zh": "举一个生活中的例子", "ru": "Приведи пример из жизни", "es": "Dame un ejemplo de la vida real", "ml": "ജീവിതത്തിൽ നിന്ന് ഒരു ഉദാഹരണം തരൂ"},
"لخّص الدرس في ٣ نقاط":{"fr": "Résume la leçon en 3 points", "hi": "पाठ को 3 बिंदुओं में सारांशित करें", "bn": "পাঠটি ৩টি পয়েন্টে সংক্ষেপ করুন", "ne": "पाठलाई ३ बुँदामा सारांश गर्नुहोस्", "id": "Ringkas pelajaran dalam 3 poin", "fil": "Ibuod ang aralin sa 3 punto", "tr": "Dersi 3 maddede özetle", "zh": "用3点总结这课", "ru": "Кратко изложи урок в 3 пунктах", "es": "Resume la lección en 3 puntos", "ml": "പാഠം 3 പോയിന്റുകളിൽ ചുരുക്കൂ"},
"اختبرني بسؤال واحد":{"fr": "Pose-moi une question", "hi": "मुझसे एक प्रश्न पूछें", "bn": "আমাকে একটি প্রশ্নে পরীক্ষা করুন", "ne": "मलाई एउटा प्रश्न सोध्नुहोस्", "id": "Uji aku dengan satu pertanyaan", "fil": "Subukin ako ng isang tanong", "tr": "Beni tek soruyla sına", "zh": "用一道题考考我", "ru": "Задай мне один вопрос", "es": "Hazme una pregunta", "ml": "ഒരു ചോദ്യം കൊണ്ട് പരീക്ഷിക്കൂ"},
"اسأل عن أيّ نقطة في الدرس…":{"fr": "Pose une question sur la leçon…", "hi": "पाठ के किसी भी हिस्से के बारे में पूछें…", "bn": "পাঠের যেকোনো বিষয়ে জিজ্ঞাসা করুন…", "ne": "पाठको कुनै पनि कुरा सोध्नुहोस्…", "id": "Tanyakan apa saja tentang pelajaran ini…", "fil": "Magtanong tungkol sa anumang bahagi ng aralin…", "tr": "Dersle ilgili her şeyi sor…", "zh": "关于这课的任何问题都可以问…", "ru": "Спроси о чём угодно в этом уроке…", "es": "Pregunta lo que sea de esta lección…", "ml": "ഈ പാഠത്തെക്കുറിച്ച് എന്തും ചോദിക്കൂ…"},
"إرسال":{"fr": "Envoyer", "hi": "भेजें", "bn": "পাঠান", "ne": "पठाउनुहोस्", "id": "Kirim", "fil": "Ipadala", "tr": "Gönder", "zh": "发送", "ru": "Отправить", "es": "Enviar", "ml": "അയയ്ക്കൂ"},
"محادثة جديدة":{"fr": "Nouvelle conversation", "hi": "नई बातचीत", "bn": "নতুন কথোপকথন", "ne": "नयाँ कुराकानी", "id": "Percakapan baru", "fil": "Bagong usapan", "tr": "Yeni sohbet", "zh": "新对话", "ru": "Новый разговор", "es": "Nueva conversación", "ml": "പുതിയ സംഭാഷണം"},
"أنا معلّمك لهذا الدرس. اسألني عن أيّ شيء لم تفهمه.":{"fr": "Je suis ton tuteur pour cette leçon. Demande-moi ce que tu n’as pas compris.", "hi": "मैं इस पाठ का आपका शिक्षक हूँ। जो समझ न आए, पूछिए।", "bn": "আমি এই পাঠের আপনার শিক্ষক। যা বোঝেননি জিজ্ঞাসা করুন।", "ne": "म यो पाठको तपाईंको शिक्षक हुँ। नबुझेको कुरा सोध्नुहोस्।", "id": "Aku tutormu untuk pelajaran ini. Tanyakan apa pun yang belum kamu pahami.", "fil": "Ako ang tutor mo sa araling ito. Itanong ang anumang hindi mo naintindihan.", "tr": "Bu dersin öğretmeniyim. Anlamadığın her şeyi sor.", "zh": "我是这课的老师，有不懂的尽管问。", "ru": "Я твой учитель по этому уроку. Спрашивай всё, что непонятно.", "es": "Soy tu tutor en esta lección. Pregúntame lo que no entendiste.", "ml": "ഈ പാഠത്തിന്റെ അധ്യാപകൻ ഞാനാണ്. മനസ്സിലാകാത്തത് ചോദിക്കൂ."},
"تعذّر الردّ الآن — حاول مرة أخرى.":{"fr": "Réponse impossible pour l’instant — réessaie.", "hi": "अभी उत्तर नहीं दे सके — फिर कोशिश करें।", "bn": "এখন উত্তর দেওয়া গেল না — আবার চেষ্টা করুন।", "ne": "अहिले जवाफ दिन सकिएन — फेरि प्रयास गर्नुहोस्।", "id": "Tidak bisa membalas sekarang — coba lagi.", "fil": "Hindi makasagot ngayon — subukan muli.", "tr": "Şu an yanıt verilemedi — tekrar dene.", "zh": "暂时无法回复——请重试。", "ru": "Сейчас не удалось ответить — попробуй снова.", "es": "No se pudo responder ahora — inténtalo de nuevo.", "ml": "ഇപ്പോൾ മറുപടി നൽകാനായില്ല — വീണ്ടും ശ്രമിക്കൂ."},
"تعذّر قراءة الصورة.":{"fr": "Impossible de lire l’image.", "hi": "छवि पढ़ी नहीं जा सकी।", "bn": "ছবিটি পড়া যায়নি।", "ne": "तस्बिर पढ्न सकिएन।", "id": "Gambar tidak bisa dibaca.", "fil": "Hindi mabasa ang larawan.", "tr": "Görsel okunamadı.", "zh": "无法读取图片。", "ru": "Не удалось прочитать изображение.", "es": "No se pudo leer la imagen.", "ml": "ചിത്രം വായിക്കാനായില്ല."},
"حلّ مسألة خطوة بخطوة":{"fr": "Résoudre un problème pas à pas", "hi": "सवाल को चरण-दर-चरण हल करें", "bn": "ধাপে ধাপে সমস্যা সমাধান", "ne": "समस्या चरणबद्ध हल गर्नुहोस्", "id": "Selesaikan soal langkah demi langkah", "fil": "Lutasin ang problema hakbang-hakbang", "tr": "Soruyu adım adım çöz", "zh": "逐步解题", "ru": "Решить задачу пошагово", "es": "Resolver un problema paso a paso", "ml": "പ്രശ്നം ഘട്ടം ഘട്ടമായി പരിഹരിക്കൂ"},
"صوّر السؤال أو اكتبه. تظهر لك الخطوات واحدة واحدة مع تلميح قبل كلّ خطوة — لتتعلّم الطريقة لا تنسخ الجواب.":{"fr": "Photographie ou tape la question. Les étapes apparaissent une par une avec un indice avant chacune — pour apprendre la méthode, pas copier la réponse.", "hi": "प्रश्न की फ़ोटो लें या लिखें। चरण एक-एक करके दिखेंगे, हर चरण से पहले संकेत के साथ — ताकि आप तरीका सीखें, उत्तर न उतारें।", "bn": "প্রশ্নের ছবি তুলুন বা লিখুন। ধাপগুলো একে একে দেখাবে, প্রতিটির আগে একটি ইঙ্গিত সহ — যাতে আপনি পদ্ধতি শেখেন, উত্তর নকল না করেন।", "ne": "प्रश्नको फोटो खिच्नुहोस् वा लेख्नुहोस्। चरणहरू एक-एक गरी देखिन्छन्, हरेक अघि सङ्केतसहित — उत्तर सार्न होइन, तरिका सिक्न।", "id": "Foto atau ketik soalnya. Langkah muncul satu per satu dengan petunjuk sebelum setiap langkah — agar kamu belajar caranya, bukan menyalin jawaban.", "fil": "Kunan ng larawan o i-type ang tanong. Isa-isang lalabas ang mga hakbang na may pahiwatig bago ang bawat isa — para matutunan mo ang paraan, hindi kopyahin ang sagot.", "tr": "Soruyu fotoğrafla ya da yaz. Adımlar tek tek, her birinden önce bir ipucuyla gelir — cevabı kopyalamak için değil, yöntemi öğrenmen için.", "zh": "拍照或输入题目。步骤会逐一出现，每步前都有提示——让你学会方法，而不是抄答案。", "ru": "Сфотографируй или напиши задачу. Шаги появляются по одному, перед каждым — подсказка: чтобы ты понял метод, а не списал ответ.", "es": "Fotografía o escribe la pregunta. Los pasos aparecen uno a uno con una pista antes de cada uno — para aprender el método, no copiar la respuesta.", "ml": "ചോദ്യം ഫോട്ടോ എടുക്കുകയോ ടൈപ്പ് ചെയ്യുകയോ ചെയ്യൂ. ഓരോ ഘട്ടവും സൂചനയോടെ ഒന്നൊന്നായി വരും — ഉത്തരം പകർത്താനല്ല, രീതി പഠിക്കാൻ."},
"صوّر المسألة أو ارفع صورتها":{"fr": "Photographie ou importe le problème", "hi": "सवाल की फ़ोटो लें या अपलोड करें", "bn": "সমস্যার ছবি তুলুন বা আপলোড করুন", "ne": "समस्याको फोटो खिच्नुहोस् वा अपलोड गर्नुहोस्", "id": "Foto atau unggah soalnya", "fil": "Kunan o i-upload ang problema", "tr": "Soruyu fotoğrafla ya da yükle", "zh": "拍照或上传题目", "ru": "Сфотографируй или загрузи задачу", "es": "Fotografía o sube el problema", "ml": "പ്രശ്നം ഫോട്ടോ എടുക്കൂ അല്ലെങ്കിൽ അപ്‌ലോഡ് ചെയ്യൂ"},
"أو اكتب المسألة هنا…":{"fr": "Ou tape le problème ici…", "hi": "या सवाल यहाँ लिखें…", "bn": "অথবা সমস্যাটি এখানে লিখুন…", "ne": "वा समस्या यहाँ लेख्नुहोस्…", "id": "Atau ketik soalnya di sini…", "fil": "O i-type ang problema dito…", "tr": "Ya da soruyu buraya yaz…", "zh": "或在此输入题目…", "ru": "Или напиши задачу здесь…", "es": "O escribe el problema aquí…", "ml": "അല്ലെങ്കിൽ പ്രശ്നം ഇവിടെ ടൈപ്പ് ചെയ്യൂ…"},
"✨ حلّها خطوة بخطوة":{"fr": "✨ Résoudre pas à pas", "hi": "✨ चरण-दर-चरण हल करें", "bn": "✨ ধাপে ধাপে সমাধান করুন", "ne": "✨ चरणबद्ध हल गर्नुहोस्", "id": "✨ Selesaikan langkah demi langkah", "fil": "✨ Lutasin hakbang-hakbang", "tr": "✨ Adım adım çöz", "zh": "✨ 逐步解答", "ru": "✨ Решить пошагово", "es": "✨ Resolver paso a paso", "ml": "✨ ഘട്ടം ഘട്ടമായി പരിഹരിക്കൂ"},
"⏳ نحلّ المسألة…":{"fr": "⏳ Résolution…", "hi": "⏳ हल किया जा रहा है…", "bn": "⏳ সমাধান করা হচ্ছে…", "ne": "⏳ हल गर्दै…", "id": "⏳ Sedang menyelesaikan…", "fil": "⏳ Nilulutas…", "tr": "⏳ Çözülüyor…", "zh": "⏳ 正在解题…", "ru": "⏳ Решаем…", "es": "⏳ Resolviendo…", "ml": "⏳ പരിഹരിക്കുന്നു…"},
"الحلّ":{"fr": "Solution", "hi": "हल", "bn": "সমাধান", "ne": "हल", "id": "Penyelesaian", "fil": "Solusyon", "tr": "Çözüm", "zh": "解答", "ru": "Решение", "es": "Solución", "ml": "പരിഹാരം"},
"الخطوة":{"fr": "Étape", "hi": "चरण", "bn": "ধাপ", "ne": "चरण", "id": "Langkah", "fil": "Hakbang", "tr": "Adım", "zh": "步骤", "ru": "Шаг", "es": "Paso", "ml": "ഘട്ടം"},
"تلميح":{"fr": "Indice", "hi": "संकेत", "bn": "ইঙ্গিত", "ne": "सङ्केत", "id": "Petunjuk", "fil": "Pahiwatig", "tr": "İpucu", "zh": "提示", "ru": "Подсказка", "es": "Pista", "ml": "സൂചന"},
"أظهر الخطوة":{"fr": "Afficher l’étape", "hi": "चरण दिखाएँ", "bn": "ধাপ দেখান", "ne": "चरण देखाउनुहोस्", "id": "Tampilkan langkah", "fil": "Ipakita ang hakbang", "tr": "Adımı göster", "zh": "显示这一步", "ru": "Показать шаг", "es": "Mostrar el paso", "ml": "ഘട്ടം കാണിക്കൂ"},
"أظهر الجواب النهائيّ":{"fr": "Afficher la réponse finale", "hi": "अंतिम उत्तर दिखाएँ", "bn": "চূড়ান্ত উত্তর দেখান", "ne": "अन्तिम उत्तर देखाउनुहोस्", "id": "Tampilkan jawaban akhir", "fil": "Ipakita ang huling sagot", "tr": "Son cevabı göster", "zh": "显示最终答案", "ru": "Показать итоговый ответ", "es": "Mostrar la respuesta final", "ml": "അന്തിമ ഉത്തരം കാണിക്കൂ"},
"الجواب:":{"fr": "Réponse :", "hi": "उत्तर:", "bn": "উত্তর:", "ne": "उत्तर:", "id": "Jawaban:", "fil": "Sagot:", "tr": "Cevap:", "zh": "答案：", "ru": "Ответ:", "es": "Respuesta:", "ml": "ഉത്തരം:"},
"التحقّق:":{"fr": "Vérification :", "hi": "जाँच:", "bn": "যাচাই:", "ne": "जाँच:", "id": "Pengecekan:", "fil": "Pagsuri:", "tr": "Kontrol:", "zh": "验证：", "ru": "Проверка:", "es": "Comprobación:", "ml": "പരിശോധന:"},
"الفكرة للمسائل المشابهة:":{"fr": "L’idée pour les problèmes similaires :", "hi": "मिलते-जुलते सवालों के लिए विचार:", "bn": "একই ধরনের সমস্যার জন্য ধারণা:", "ne": "यस्तै समस्याका लागि उपाय:", "id": "Ide untuk soal serupa:", "fil": "Ang ideya para sa katulad na problema:", "tr": "Benzer sorular için fikir:", "zh": "类似题目的思路：", "ru": "Идея для похожих задач:", "es": "La idea para problemas similares:", "ml": "സമാന പ്രശ്നങ്ങൾക്കുള്ള ആശയം:"},
"اسأل المعلّم عن هذه المسألة":{"fr": "Demander au tuteur sur ce problème", "hi": "इस सवाल के बारे में शिक्षक से पूछें", "bn": "এই সমস্যা নিয়ে শিক্ষককে জিজ্ঞাসা করুন", "ne": "यो समस्याबारे शिक्षकलाई सोध्नुहोस्", "id": "Tanya tutor tentang soal ini", "fil": "Tanungin ang tutor tungkol sa problemang ito", "tr": "Bu soruyu öğretmene sor", "zh": "就这道题问老师", "ru": "Спросить учителя об этой задаче", "es": "Pregunta al tutor sobre este problema", "ml": "ഈ പ്രശ്നത്തെക്കുറിച്ച് അധ്യാപകനോട് ചോദിക്കൂ"},
"مسألة جديدة":{"fr": "Nouveau problème", "hi": "नया सवाल", "bn": "নতুন সমস্যা", "ne": "नयाँ समस्या", "id": "Soal baru", "fil": "Bagong problema", "tr": "Yeni soru", "zh": "新题目", "ru": "Новая задача", "es": "Nuevo problema", "ml": "പുതിയ പ്രശ്നം"},
"مسألة":{"fr": "Problème", "hi": "सवाल", "bn": "সমস্যা", "ne": "समस्या", "id": "Soal", "fil": "Problema", "tr": "Soru", "zh": "题目", "ru": "Задача", "es": "Problema", "ml": "പ്രശ്നം"},
"أساسي":{"fr": "Basique", "hi": "मूलभूत", "bn": "মৌলিক", "ne": "आधारभूत", "id": "Dasar", "fil": "Pangunahin", "tr": "Temel", "zh": "基础", "ru": "Базовый", "es": "Básico", "ml": "അടിസ്ഥാനം"},
"متوسط":{"fr": "Intermédiaire", "hi": "मध्यम", "bn": "মধ্যম", "ne": "मध्यम", "id": "Menengah", "fil": "Katamtaman", "tr": "Orta", "zh": "中级", "ru": "Средний", "es": "Intermedio", "ml": "ഇടത്തരം"},
"متقدّم":{"fr": "Avancé", "hi": "उन्नत", "bn": "উন্নত", "ne": "उन्नत", "id": "Lanjutan", "fil": "Advanced", "tr": "İleri", "zh": "高级", "ru": "Продвинутый", "es": "Avanzado", "ml": "ഉയർന്നത്"},
"تقدّمي":{"fr": "Ma progression", "hi": "मेरी प्रगति", "bn": "আমার অগ্রগতি", "ne": "मेरो प्रगति", "id": "Kemajuanku", "fil": "Aking progreso", "tr": "İlerlemem", "zh": "我的进度", "ru": "Мой прогресс", "es": "Mi progreso", "ml": "എന്റെ പുരോഗതി"},
"يوم متتالٍ":{"fr": "jours d’affilée", "hi": "लगातार दिन", "bn": "টানা দিন", "ne": "लगातार दिन", "id": "hari beruntun", "fil": "sunod-sunod na araw", "tr": "günlük seri", "zh": "连续天数", "ru": "дней подряд", "es": "días seguidos", "ml": "തുടർച്ചയായ ദിവസം"},
"درس":{"fr": "leçons", "hi": "पाठ", "bn": "পাঠ", "ne": "पाठ", "id": "pelajaran", "fil": "aralin", "tr": "ders", "zh": "课", "ru": "уроков", "es": "lecciones", "ml": "പാഠങ്ങൾ"},
"متوسّط الاختبارات":{"fr": "moyenne des quiz", "hi": "क्विज़ औसत", "bn": "কুইজের গড়", "ne": "क्विज औसत", "id": "rata-rata kuis", "fil": "average sa pagsusulit", "tr": "test ortalaması", "zh": "测验平均分", "ru": "средний балл тестов", "es": "promedio de pruebas", "ml": "ക്വിസ് ശരാശരി"},
"بطاقات مستحقّة":{"fr": "cartes à réviser", "hi": "दोहराने वाले कार्ड", "bn": "পুনরালোচনার কার্ড", "ne": "दोहोर्याउनुपर्ने कार्ड", "id": "kartu jatuh tempo", "fil": "kard na dapat balikan", "tr": "tekrarı gelen kart", "zh": "到期卡片", "ru": "карточек к повторению", "es": "tarjetas pendientes", "ml": "ആവർത്തിക്കേണ്ട കാർഡുകൾ"},
"بطاقة متقنة":{"fr": "cartes maîtrisées", "hi": "महारत वाले कार्ड", "bn": "আয়ত্ত করা কার্ড", "ne": "सिकिसकेका कार्ड", "id": "kartu dikuasai", "fil": "kard na kabisado", "tr": "ustalaşılan kart", "zh": "已掌握卡片", "ru": "освоенных карточек", "es": "tarjetas dominadas", "ml": "വശമാക്കിയ കാർഡുകൾ"},
"خوارزميات الألعاب":{"fr": "Algorithmes de jeux", "hi": "गेम एल्गोरिदम", "bn": "গেম অ্যালগরিদম", "ne": "खेल एल्गोरिदम", "id": "Algoritma game", "fil": "Mga algorithm ng laro", "tr": "Oyun algoritmaları", "zh": "游戏算法", "ru": "Игровые алгоритмы", "es": "Algoritmos de juegos", "ml": "ഗെയിം അൽഗോരിതങ്ങൾ"},
"مستواك حسب الصعوبة":{"fr": "Ton niveau par difficulté", "hi": "कठिनाई के अनुसार आपका स्तर", "bn": "কঠিনতা অনুযায়ী আপনার স্তর", "ne": "कठिनाइअनुसार तपाईंको स्तर", "id": "Levelmu per tingkat kesulitan", "fil": "Antas mo ayon sa hirap", "tr": "Zorluğa göre seviyen", "zh": "按难度的水平", "ru": "Твой уровень по сложности", "es": "Tu nivel por dificultad", "ml": "ബുദ്ധിമുട്ട് അനുസരിച്ച് നിങ്ങളുടെ നില"},
"أضعف نقطة عندك: أسئلة المستوى ":{"fr": "Ton point faible : les questions ", "hi": "आपकी सबसे कमज़ोर कड़ी: ", "bn": "আপনার সবচেয়ে দুর্বল দিক: ", "ne": "तपाईंको सबैभन्दा कमजोर पक्ष: ", "id": "Titik terlemahmu: soal ", "fil": "Pinakamahina mong punto: mga tanong na ", "tr": "En zayıf noktan: ", "zh": "你最薄弱的是：", "ru": "Твоё слабое место: вопросы уровня ", "es": "Tu punto más débil: preguntas de nivel ", "ml": "നിങ്ങളുടെ ഏറ്റവും ദുർബല ഭാഗം: "},
" — ابدأ مراجعتك منها.":{"fr": " — commence ta révision par là.", "hi": " स्तर के प्रश्न — दोहराई वहीं से शुरू करें।", "bn": " স্তরের প্রশ্ন — সেখান থেকে পুনরালোচনা শুরু করুন।", "ne": " स्तरका प्रश्न — त्यहीँबाट दोहोर्याउन सुरु गर्नुहोस्।", "id": " — mulai tinjauanmu dari sana.", "fil": " — doon simulan ang balik-aral.", "tr": " seviye sorular — tekrara oradan başla.", "zh": "级题目——从这里开始复习。", "ru": " — начни повторение с них.", "es": " — empieza tu repaso por ahí.", "ml": " നിലയിലെ ചോദ്യങ്ങൾ — അവിടെ നിന്ന് ആവർത്തനം തുടങ്ങൂ."},
"دروس تحتاج مراجعة":{"fr": "Leçons à revoir", "hi": "दोहराने योग्य पाठ", "bn": "পুনরালোচনা দরকার এমন পাঠ", "ne": "दोहोर्याउनुपर्ने पाठ", "id": "Pelajaran yang perlu ditinjau", "fil": "Mga aralin na kailangang balikan", "tr": "Tekrar gereken dersler", "zh": "需要复习的课程", "ru": "Уроки для повторения", "es": "Lecciones para repasar", "ml": "ആവർത്തിക്കേണ്ട പാഠങ്ങൾ"},
"لم تُختبر بعد":{"fr": "pas encore testée", "hi": "अभी परखा नहीं", "bn": "এখনও পরীক্ষা হয়নি", "ne": "अझै परीक्षण भएको छैन", "id": "belum diuji", "fil": "hindi pa nasusubok", "tr": "henüz test edilmedi", "zh": "尚未测验", "ru": "ещё не проверено", "es": "aún sin probar", "ml": "ഇതുവരെ പരീക്ഷിച്ചിട്ടില്ല"},
"خطّة الامتحان":{"fr": "Plan d’examen", "hi": "परीक्षा योजना", "bn": "পরীক্ষার পরিকল্পনা", "ne": "परीक्षा योजना", "id": "Rencana ujian", "fil": "Plano sa pagsusulit", "tr": "Sınav planı", "zh": "考试计划", "ru": "План к экзамену", "es": "Plan de examen", "ml": "പരീക്ഷാ പദ്ധതി"},
"الامتحان:":{"fr": "Examen :", "hi": "परीक्षा:", "bn": "পরীক্ষা:", "ne": "परीक्षा:", "id": "Ujian:", "fil": "Pagsusulit:", "tr": "Sınav:", "zh": "考试：", "ru": "Экзамен:", "es": "Examen:", "ml": "പരീക്ഷ:"},
"مراجعة شاملة + اختبار كلّ الدروس":{"fr": "Révision complète + quiz sur chaque leçon", "hi": "पूरी दोहराई + हर पाठ का क्विज़", "bn": "সম্পূর্ণ পুনরালোচনা + প্রতিটি পাঠের কুইজ", "ne": "पूर्ण दोहोर्याइ + हरेक पाठको क्विज", "id": "Tinjauan penuh + kuis semua pelajaran", "fil": "Buong balik-aral + pagsusulit sa bawat aralin", "tr": "Tam tekrar + her dersten test", "zh": "全面复习 + 每课测验", "ru": "Полное повторение + тест по каждому уроку", "es": "Repaso completo + prueba de cada lección", "ml": "സമ്പൂർണ ആവർത്തനം + ഓരോ പാഠത്തിനും ക്വിസ്"},
"أعد اختبار الأضعف + بطاقات اليوم":{"fr": "Refais le quiz le plus faible + cartes du jour", "hi": "सबसे कमज़ोर का दोबारा क्विज़ + आज के कार्ड", "bn": "দুর্বলতমটির আবার কুইজ + আজকের কার্ড", "ne": "सबैभन्दा कमजोरको फेरि क्विज + आजका कार्ड", "id": "Uji ulang yang terlemah + kartu hari ini", "fil": "Subukin muli ang pinakamahina + mga kard ngayon", "tr": "En zayıfı yeniden sına + bugünün kartları", "zh": "重测最弱的 + 今日卡片", "ru": "Перепроверь самое слабое + карточки дня", "es": "Repite la prueba más débil + tarjetas de hoy", "ml": "ഏറ്റവും ദുർബലമായത് വീണ്ടും പരീക്ഷിക്കൂ + ഇന്നത്തെ കാർഡുകൾ"},
"ذاكر واختبر نفسك:":{"fr": "Étudie et teste-toi :", "hi": "पढ़ें और खुद को परखें:", "bn": "পড়ুন ও নিজেকে যাচাই করুন:", "ne": "पढ्नुहोस् र आफैँलाई जाँच्नुहोस्:", "id": "Belajar dan uji dirimu:", "fil": "Mag-aral at subukin ang sarili:", "tr": "Çalış ve kendini sına:", "zh": "学习并自测：", "ru": "Учи и проверяй себя:", "es": "Estudia y ponte a prueba:", "ml": "പഠിക്കൂ, സ്വയം പരീക്ഷിക്കൂ:"},
"اليوم":{"fr": "Aujourd’hui", "hi": "आज", "bn": "আজ", "ne": "आज", "id": "Hari ini", "fil": "Ngayon", "tr": "Bugün", "zh": "今天", "ru": "Сегодня", "es": "Hoy", "ml": "ഇന്ന്"},
"احذف الخطّة":{"fr": "Supprimer le plan", "hi": "योजना हटाएँ", "bn": "পরিকল্পনা মুছুন", "ne": "योजना मेटाउनुहोस्", "id": "Hapus rencana", "fil": "Burahin ang plano", "tr": "Planı sil", "zh": "删除计划", "ru": "Удалить план", "es": "Eliminar plan", "ml": "പദ്ധതി ഇല്ലാതാക്കൂ"},
"المادة":{"fr": "Matière", "hi": "विषय", "bn": "বিষয়", "ne": "विषय", "id": "Mata pelajaran", "fil": "Asignatura", "tr": "Ders", "zh": "科目", "ru": "Предмет", "es": "Materia", "ml": "വിഷയം"},
"موعد الامتحان":{"fr": "Date de l’examen", "hi": "परीक्षा की तारीख", "bn": "পরীক্ষার তারিখ", "ne": "परीक्षा मिति", "id": "Tanggal ujian", "fil": "Petsa ng pagsusulit", "tr": "Sınav tarihi", "zh": "考试日期", "ru": "Дата экзамена", "es": "Fecha del examen", "ml": "പരീക്ഷാ തീയതി"},
"ابنِ خطّتي":{"fr": "Créer mon plan", "hi": "मेरी योजना बनाएँ", "bn": "আমার পরিকল্পনা তৈরি করুন", "ne": "मेरो योजना बनाउनुहोस्", "id": "Buat rencanaku", "fil": "Gawin ang plano ko", "tr": "Planımı oluştur", "zh": "生成我的计划", "ru": "Составить мой план", "es": "Crear mi plan", "ml": "എന്റെ പദ്ധതി തയ്യാറാക്കൂ"},
"أضف دروسًا أوّلًا (ارفع محاضرة أو درسًا من المنهج) لتُبنى لك خطّة.":{"fr": "Ajoute d’abord des leçons (importe un cours ou une leçon du programme) pour créer un plan.", "hi": "योजना बनाने के लिए पहले पाठ जोड़ें (लेक्चर या पाठ्यक्रम का पाठ अपलोड करें)।", "bn": "পরিকল্পনা তৈরির জন্য আগে পাঠ যোগ করুন (লেকচার বা পাঠ্যক্রমের পাঠ আপলোড করুন)।", "ne": "योजना बनाउन पहिले पाठ थप्नुहोस् (लेक्चर वा पाठ्यक्रमको पाठ अपलोड गर्नुहोस्)।", "id": "Tambahkan pelajaran dulu (unggah materi atau pelajaran kurikulum) untuk membuat rencana.", "fil": "Magdagdag muna ng aralin (mag-upload ng lektyur o aralin sa kurikulum) para makagawa ng plano.", "tr": "Plan oluşturmak için önce ders ekle (ders notu ya da müfredat dersi yükle).", "zh": "请先添加课程（上传讲义或课程体系中的课）再生成计划。", "ru": "Сначала добавь уроки (загрузи лекцию или урок программы), чтобы составить план.", "es": "Primero añade lecciones (sube una clase o una lección del plan) para crear un plan.", "ml": "പദ്ധതി തയ്യാറാക്കാൻ ആദ്യം പാഠങ്ങൾ ചേർക്കൂ (ലക്ചർ അല്ലെങ്കിൽ പാഠ്യപദ്ധതി പാഠം അപ്‌ലോഡ് ചെയ്യൂ)."},
"تعذّر تحميل المسار — تحقّق من الاتصال.":{"fr": "Impossible de charger le parcours — vérifie ta connexion.", "hi": "पाठ्यक्रम लोड नहीं हुआ — कनेक्शन जाँचें।", "bn": "কোর্স লোড হয়নি — সংযোগ পরীক্ষা করুন।", "ne": "मार्ग लोड भएन — जडान जाँच्नुहोस्।", "id": "Jalur tidak bisa dimuat — periksa koneksi.", "fil": "Hindi ma-load ang track — tingnan ang koneksyon.", "tr": "Yol yüklenemedi — bağlantını kontrol et.", "zh": "无法加载课程——请检查网络。", "ru": "Не удалось загрузить курс — проверь подключение.", "es": "No se pudo cargar el recorrido — revisa tu conexión.", "ml": "പാത ലോഡ് ചെയ്യാനായില്ല — കണക്ഷൻ പരിശോധിക്കൂ."},
"مسار جاهز: ٨ دروس بألعاب حيّة":{"fr": "Parcours prêt : 8 leçons avec jeux interactifs", "hi": "तैयार कोर्स: लाइव गेम वाले 8 पाठ", "bn": "প্রস্তুত কোর্স: লাইভ গেমসহ ৮টি পাঠ", "ne": "तयार मार्ग: प्रत्यक्ष खेलसहित ८ पाठ", "id": "Jalur siap: 8 pelajaran dengan game interaktif", "fil": "Handang track: 8 aralin na may live na laro", "tr": "Hazır yol: canlı oyunlu 8 ders", "zh": "现成课程：8课，含互动游戏", "ru": "Готовый курс: 8 уроков с живыми играми", "es": "Recorrido listo: 8 lecciones con juegos en vivo", "ml": "തയ്യാർ പാത: ലൈവ് ഗെയിമുകളുള്ള 8 പാഠങ്ങൾ"},
"صوّر السؤال أو اكتبه":{"fr": "Photographie ou tape la question", "hi": "प्रश्न की फ़ोटो लें या लिखें", "bn": "প্রশ্নের ছবি তুলুন বা লিখুন", "ne": "प्रश्नको फोटो खिच्नुहोस् वा लेख्नुहोस्", "id": "Foto atau ketik soalnya", "fil": "Kunan o i-type ang tanong", "tr": "Soruyu fotoğrafla ya da yaz", "zh": "拍照或输入题目", "ru": "Сфотографируй или напиши вопрос", "es": "Fotografía o escribe la pregunta", "ml": "ചോദ്യം ഫോട്ടോ എടുക്കൂ അല്ലെങ്കിൽ ടൈപ്പ് ചെയ്യൂ"},
"بطاقة مستحقّة":{"fr": "cartes à réviser", "hi": "कार्ड बाकी", "bn": "কার্ড বাকি", "ne": "कार्ड बाँकी", "id": "kartu jatuh tempo", "fil": "kard na dapat balikan", "tr": "kart bekliyor", "zh": "张卡片到期", "ru": "карточек к повторению", "es": "tarjetas pendientes", "ml": "കാർഡുകൾ ബാക്കി"},
"لا شيء اليوم ✓":{"fr": "Rien aujourd’hui ✓", "hi": "आज कुछ नहीं ✓", "bn": "আজ কিছু নেই ✓", "ne": "आज केही छैन ✓", "id": "Tidak ada hari ini ✓", "fil": "Wala ngayon ✓", "tr": "Bugün yok ✓", "zh": "今天没有 ✓", "ru": "Сегодня ничего ✓", "es": "Nada hoy ✓", "ml": "ഇന്ന് ഒന്നുമില്ല ✓"},
"تقدّمي وخطّة الامتحان":{"fr": "Progression et plan d’examen", "hi": "प्रगति और परीक्षा योजना", "bn": "অগ্রগতি ও পরীক্ষার পরিকল্পনা", "ne": "प्रगति र परीक्षा योजना", "id": "Kemajuan & rencana ujian", "fil": "Progreso at plano sa pagsusulit", "tr": "İlerleme ve sınav planı", "zh": "进度与考试计划", "ru": "Прогресс и план к экзамену", "es": "Progreso y plan de examen", "ml": "പുരോഗതിയും പരീക്ഷാ പദ്ധതിയും"},
"📅 عندك مهمّة اليوم":{"fr": "📅 Tu as une tâche aujourd’hui", "hi": "📅 आज आपका एक काम है", "bn": "📅 আজ আপনার একটি কাজ আছে", "ne": "📅 आज तपाईंको एउटा काम छ", "id": "📅 Ada tugas hari ini", "fil": "📅 May gawain ka ngayon", "tr": "📅 Bugün bir görevin var", "zh": "📅 今天有任务", "ru": "📅 На сегодня есть задание", "es": "📅 Tienes una tarea hoy", "ml": "📅 ഇന്ന് ഒരു ജോലിയുണ്ട്"},
"نقاط ضعفك وخطّة المذاكرة":{"fr": "Tes points faibles et plan d’étude", "hi": "आपकी कमज़ोरियाँ और पढ़ाई की योजना", "bn": "আপনার দুর্বলতা ও পড়ার পরিকল্পনা", "ne": "तपाईंका कमजोरी र अध्ययन योजना", "id": "Titik lemahmu & rencana belajar", "fil": "Mahihinang punto at plano sa pag-aaral", "tr": "Zayıf noktaların ve çalışma planı", "zh": "薄弱点与学习计划", "ru": "Слабые места и план учёбы", "es": "Tus puntos débiles y plan de estudio", "ml": "ദുർബല ഭാഗങ്ങളും പഠന പദ്ധതിയും"},
"سرعة الجهاز (إطار/ث)":{"fr": "Vitesse de l’appareil (IPS)", "hi": "डिवाइस गति (FPS)", "bn": "ডিভাইসের গতি (FPS)", "ne": "उपकरण गति (FPS)", "id": "Kecepatan perangkat (FPS)", "fil": "Bilis ng device (FPS)", "tr": "Cihaz hızı (FPS)", "zh": "设备速度（FPS）", "ru": "Скорость устройства (FPS)", "es": "Velocidad del dispositivo (FPS)", "ml": "ഉപകരണ വേഗത (FPS)"},
"حركة مستقلّة عن سرعة الجهاز (dt)":{"fr": "Indépendant du nombre d’images (dt)", "hi": "फ़्रेम-दर से स्वतंत्र (dt)", "bn": "ফ্রেম-রেট নিরপেক্ষ (dt)", "ne": "फ्रेम-दरबाट स्वतन्त्र (dt)", "id": "Tidak tergantung frame rate (dt)", "fil": "Hindi nakadepende sa frame rate (dt)", "tr": "Kare hızından bağımsız (dt)", "zh": "与帧率无关（dt）", "ru": "Независимо от частоты кадров (dt)", "es": "Independiente de los FPS (dt)", "ml": "ഫ്രെയിം റേറ്റിൽ നിന്ന് സ്വതന്ത്രം (dt)"},
"الجاذبيّة":{"fr": "Gravité", "hi": "गुरुत्व", "bn": "মাধ্যাকর্ষণ", "ne": "गुरुत्व", "id": "Gravitasi", "fil": "Grabidad", "tr": "Yerçekimi", "zh": "重力", "ru": "Гравитация", "es": "Gravedad", "ml": "ഗുരുത്വം"},
"قوّة القفزة":{"fr": "Force du saut", "hi": "कूद की ताकत", "bn": "লাফের শক্তি", "ne": "उफ्रने बल", "id": "Kekuatan lompat", "fil": "Lakas ng talon", "tr": "Zıplama gücü", "zh": "跳跃力度", "ru": "Сила прыжка", "es": "Fuerza del salto", "ml": "ചാട്ടത്തിന്റെ ശക്തി"},
"اقفز":{"fr": "Sauter", "hi": "कूदें", "bn": "লাফ দিন", "ne": "उफ्रनुहोस्", "id": "Lompat", "fil": "Tumalon", "tr": "Zıpla", "zh": "跳", "ru": "Прыжок", "es": "Saltar", "ml": "ചാടൂ"},
"💥 تصادم!":{"fr": "💥 Collision !", "hi": "💥 टक्कर!", "bn": "💥 সংঘর্ষ!", "ne": "💥 ठोक्कर!", "id": "💥 Tabrakan!", "fil": "💥 Banggaan!", "tr": "💥 Çarpışma!", "zh": "💥 碰撞！", "ru": "💥 Столкновение!", "es": "💥 ¡Colisión!", "ml": "💥 കൂട്ടിയിടി!"},
"لا تصادم":{"fr": "Pas de collision", "hi": "कोई टक्कर नहीं", "bn": "কোনো সংঘর্ষ নেই", "ne": "ठोक्कर छैन", "id": "Tidak ada tabrakan", "fil": "Walang banggaan", "tr": "Çarpışma yok", "zh": "无碰撞", "ru": "Нет столкновения", "es": "Sin colisión", "ml": "കൂട്ടിയിടിയില്ല"},
"جدران عشوائيّة":{"fr": "Murs aléatoires", "hi": "बेतरतीब दीवारें", "bn": "এলোমেলো দেয়াল", "ne": "अनियमित भित्ता", "id": "Dinding acak", "fil": "Random na pader", "tr": "Rastgele duvarlar", "zh": "随机墙", "ru": "Случайные стены", "es": "Muros aleatorios", "ml": "ക്രമരഹിത ചുമരുകൾ"},
"مسح":{"fr": "Effacer", "hi": "साफ़ करें", "bn": "মুছুন", "ne": "खाली गर्नुहोस्", "id": "Bersihkan", "fil": "Burahin", "tr": "Temizle", "zh": "清除", "ru": "Очистить", "es": "Borrar", "ml": "മായ്ക്കൂ"},
"ارسم جدرانًا بإصبعك ثمّ شغّل BFS أو A*":{"fr": "Dessine des murs, puis lance BFS ou A*", "hi": "दीवारें बनाएँ, फिर BFS या A* चलाएँ", "bn": "দেয়াল আঁকুন, তারপর BFS বা A* চালান", "ne": "भित्ता कोर्नुहोस्, अनि BFS वा A* चलाउनुहोस्", "id": "Gambar dinding, lalu jalankan BFS atau A*", "fil": "Gumuhit ng pader, saka patakbuhin ang BFS o A*", "tr": "Duvar çiz, sonra BFS ya da A* çalıştır", "zh": "画墙，然后运行 BFS 或 A*", "ru": "Нарисуй стены и запусти BFS или A*", "es": "Dibuja muros y luego ejecuta BFS o A*", "ml": "ചുമരുകൾ വരയ്ക്കൂ, എന്നിട്ട് BFS അല്ലെങ്കിൽ A* പ്രവർത്തിപ്പിക്കൂ"},
"قوّة خارقة ٥ ثوانٍ":{"fr": "Super-pouvoir 5 s", "hi": "5 सेकंड की शक्ति", "bn": "৫ সেকেন্ডের শক্তি", "ne": "५ सेकेन्ड शक्ति", "id": "Kekuatan super 5 dtk", "fil": "Power-up 5 segundo", "tr": "5 sn güç", "zh": "5秒强化", "ru": "Суперсила на 5 с", "es": "Poder 5 s", "ml": "5 സെക്കൻഡ് ശക്തി"},
"دوريّة":{"fr": "Patrouille", "hi": "गश्त", "bn": "টহল", "ne": "गस्ती", "id": "Patroli", "fil": "Patrol", "tr": "Devriye", "zh": "巡逻", "ru": "Патруль", "es": "Patrulla", "ml": "റോന്ത്"},
"مطاردة":{"fr": "Poursuite", "hi": "पीछा", "bn": "তাড়া", "ne": "खेद्ने", "id": "Mengejar", "fil": "Paghabol", "tr": "Kovalama", "zh": "追击", "ru": "Погоня", "es": "Persecución", "ml": "പിന്തുടരൽ"},
"هروب":{"fr": "Fuite", "hi": "भागना", "bn": "পালানো", "ne": "भाग्ने", "id": "Kabur", "fil": "Pagtakas", "tr": "Kaçış", "zh": "逃跑", "ru": "Бегство", "es": "Huida", "ml": "ഓടിപ്പോകൽ"},
"أظهر تفكير الكمبيوتر":{"fr": "Voir la réflexion de l’ordinateur", "hi": "कंप्यूटर की सोच दिखाएँ", "bn": "কম্পিউটারের চিন্তা দেখান", "ne": "कम्प्युटरको सोच देखाउनुहोस्", "id": "Tampilkan pemikiran komputer", "fil": "Ipakita ang pag-iisip ng computer", "tr": "Bilgisayarın düşüncesini göster", "zh": "显示电脑的思考", "ru": "Показать ход мыслей компьютера", "es": "Mostrar lo que piensa la computadora", "ml": "കമ്പ്യൂട്ടറിന്റെ ചിന്ത കാണിക്കൂ"},
"لعبة جديدة":{"fr": "Nouvelle partie", "hi": "नया खेल", "bn": "নতুন খেলা", "ne": "नयाँ खेल", "id": "Permainan baru", "fil": "Bagong laro", "tr": "Yeni oyun", "zh": "新游戏", "ru": "Новая игра", "es": "Nuevo juego", "ml": "പുതിയ കളി"},
"بدّل من يبدأ":{"fr": "Changer qui commence", "hi": "कौन शुरू करे, बदलें", "bn": "কে শুরু করবে বদলান", "ne": "को सुरु गर्ने बदल्नुहोस्", "id": "Ganti siapa yang mulai", "fil": "Palitan kung sino ang mauuna", "tr": "Başlayanı değiştir", "zh": "切换先手", "ru": "Сменить, кто начинает", "es": "Cambiar quién empieza", "ml": "ആരാണ് തുടങ്ങുന്നതെന്ന് മാറ്റൂ"},
"فوز":{"fr": "gain", "hi": "जीत", "bn": "জয়", "ne": "जित", "id": "menang", "fil": "panalo", "tr": "kazanç", "zh": "赢", "ru": "победа", "es": "gana", "ml": "ജയം"},
"خسارة":{"fr": "perte", "hi": "हार", "bn": "হার", "ne": "हार", "id": "kalah", "fil": "talo", "tr": "kayıp", "zh": "输", "ru": "поражение", "es": "pierde", "ml": "തോൽവി"},
"تعادل":{"fr": "nul", "hi": "बराबरी", "bn": "ড্র", "ne": "बराबरी", "id": "seri", "fil": "tabla", "tr": "beraberlik", "zh": "平", "ru": "ничья", "es": "empate", "ml": "സമനില"},
"أنت":{"fr": "Toi", "hi": "आप", "bn": "আপনি", "ne": "तपाईं", "id": "Kamu", "fil": "Ikaw", "tr": "Sen", "zh": "你", "ru": "Ты", "es": "Tú", "ml": "നിങ്ങൾ"},
"الكمبيوتر":{"fr": "Ordinateur", "hi": "कंप्यूटर", "bn": "কম্পিউটার", "ne": "कम्प्युटर", "id": "Komputer", "fil": "Computer", "tr": "Bilgisayar", "zh": "电脑", "ru": "Компьютер", "es": "Computadora", "ml": "കമ്പ്യൂട്ടർ"},
"تعادل — كما تتوقّع الرياضيّات":{"fr": "Nul — exactement comme le prévoient les maths", "hi": "बराबरी — ठीक जैसा गणित कहता है", "bn": "ড্র — গণিত যেমন বলে ঠিক তেমন", "ne": "बराबरी — गणितले भनेजस्तै", "id": "Seri — persis seperti prediksi matematika", "fil": "Tabla — gaya ng inaasahan ng matematika", "tr": "Beraberlik — tam matematiğin öngördüğü gibi", "zh": "平局——正如数学所预测", "ru": "Ничья — ровно как предсказывает математика", "es": "Empate — tal como predicen las matemáticas", "ml": "സമനില — ഗണിതം പ്രവചിച്ചതുപോലെ"},
"فزت!؟ هذا لا يُفترض أن يحدث":{"fr": "Tu as gagné ?! C’est censé être impossible", "hi": "आप जीत गए?! यह तो असंभव होना चाहिए", "bn": "আপনি জিতলেন?! এটা তো অসম্ভব হওয়ার কথা", "ne": "तपाईं जित्नुभयो?! यो त असम्भव हुनुपर्ने", "id": "Kamu menang?! Seharusnya mustahil", "fil": "Nanalo ka?! Dapat ay imposible iyon", "tr": "Kazandın mı?! Bu imkânsız olmalıydı", "zh": "你赢了？！这本不可能", "ru": "Ты выиграл?! Так быть не должно", "es": "¡¿Ganaste?! Eso debería ser imposible", "ml": "നിങ്ങൾ ജയിച്ചോ?! അത് അസാധ്യമായിരിക്കണം"},
"فاز الكمبيوتر — اضغط للعب مجدّدًا":{"fr": "L’ordinateur gagne — touche pour rejouer", "hi": "कंप्यूटर जीता — फिर खेलने के लिए टैप करें", "bn": "কম্পিউটার জিতেছে — আবার খেলতে ট্যাপ করুন", "ne": "कम्प्युटर जित्यो — फेरि खेल्न ट्याप गर्नुहोस्", "id": "Komputer menang — ketuk untuk main lagi", "fil": "Nanalo ang computer — i-tap para maglaro muli", "tr": "Bilgisayar kazandı — tekrar oynamak için dokun", "zh": "电脑赢了——点击再玩", "ru": "Компьютер победил — нажми, чтобы сыграть снова", "es": "Gana la computadora — toca para jugar otra vez", "ml": "കമ്പ്യൂട്ടർ ജയിച്ചു — വീണ്ടും കളിക്കാൻ ടാപ്പ് ചെയ്യൂ"},
"البذرة":{"fr": "Graine", "hi": "बीज", "bn": "সিড", "ne": "बीउ", "id": "Seed", "fil": "Seed", "tr": "Tohum", "zh": "种子", "ru": "Зерно", "es": "Semilla", "ml": "സീഡ്"},
"ولّد":{"fr": "Générer", "hi": "बनाएँ", "bn": "তৈরি করুন", "ne": "बनाउनुहोस्", "id": "Buat", "fil": "Bumuo", "tr": "Üret", "zh": "生成", "ru": "Создать", "es": "Generar", "ml": "സൃഷ്ടിക്കൂ"},
"بذرة عشوائيّة":{"fr": "Graine aléatoire", "hi": "यादृच्छिक बीज", "bn": "এলোমেলো সিড", "ne": "अनियमित बीउ", "id": "Seed acak", "fil": "Random na seed", "tr": "Rastgele tohum", "zh": "随机种子", "ru": "Случайное зерно", "es": "Semilla aleatoria", "ml": "ക്രമരഹിത സീഡ്"},
"اكسر البذرة":{"fr": "Casser la graine", "hi": "बीज तोड़ें", "bn": "সিড ভাঙুন", "ne": "बीउ तोड्नुहोस्", "id": "Pecahkan seed", "fil": "Basagin ang seed", "tr": "Tohumu kır", "zh": "破解种子", "ru": "Взломать зерно", "es": "Descifrar la semilla", "ml": "സീഡ് കണ്ടെത്തൂ"},
"أوّل ١٠ أرقام:":{"fr": "10 premiers nombres :", "hi": "पहली 10 संख्याएँ:", "bn": "প্রথম ১০টি সংখ্যা:", "ne": "पहिलो १० सङ्ख्या:", "id": "10 angka pertama:", "fil": "Unang 10 numero:", "tr": "İlk 10 sayı:", "zh": "前10个数：", "ru": "Первые 10 чисел:", "es": "Primeros 10 números:", "ml": "ആദ്യ 10 സംഖ്യകൾ:"},
"رأيتُ:":{"fr": "J’ai vu :", "hi": "मैंने देखा:", "bn": "আমি দেখেছি:", "ne": "मैले देखेँ:", "id": "Aku lihat:", "fil": "Nakita ko:", "tr": "Gördüm:", "zh": "我看到：", "ru": "Я увидел:", "es": "Vi:", "ml": "ഞാൻ കണ്ടത്:"},
"البذرة:":{"fr": "Graine :", "hi": "बीज:", "bn": "সিড:", "ne": "बीउ:", "id": "Seed:", "fil": "Seed:", "tr": "Tohum:", "zh": "种子：", "ru": "Зерно:", "es": "Semilla:", "ml": "സീഡ്:"},
"توقّعي:":{"fr": "Ma prédiction :", "hi": "मेरा अनुमान:", "bn": "আমার অনুমান:", "ne": "मेरो अनुमान:", "id": "Tebakanku:", "fil": "Hula ko:", "tr": "Tahminim:", "zh": "我的预测：", "ru": "Мой прогноз:", "es": "Mi predicción:", "ml": "എന്റെ ഊഹം:"},
"الحقيقة:":{"fr": "Réel :", "hi": "वास्तविक:", "bn": "আসল:", "ne": "वास्तविक:", "id": "Sebenarnya:", "fil": "Totoo:", "tr": "Gerçek:", "zh": "实际：", "ru": "На самом деле:", "es": "Real:", "ml": "യഥാർത്ഥം:"},
"عدد التبديلات":{"fr": "Échanges", "hi": "अदला-बदली", "bn": "অদলবদল", "ne": "साटासाट", "id": "Pertukaran", "fil": "Pagpapalit", "tr": "Değişim sayısı", "zh": "交换次数", "ru": "Перестановки", "es": "Intercambios", "ml": "മാറ്റങ്ങൾ"},
"السرعة":{"fr": "Vitesse", "hi": "गति", "bn": "গতি", "ne": "गति", "id": "Kecepatan", "fil": "Bilis", "tr": "Hız", "zh": "速度", "ru": "Скорость", "es": "Velocidad", "ml": "വേഗത"},
"🧠 وضع التتبّع (رقم مكان الكرة)":{"fr": "🧠 Mode suivi (numéro de la position de la balle)", "hi": "🧠 ट्रैकिंग मोड (गेंद की जगह का नंबर)", "bn": "🧠 ট্র্যাকিং মোড (বলের অবস্থানের নম্বর)", "ne": "🧠 ट्र्याकिङ मोड (बलको स्थान नम्बर)", "id": "🧠 Mode pelacakan (nomor posisi bola)", "fil": "🧠 Tracking mode (numero ng posisyon ng bola)", "tr": "🧠 Takip modu (topun yer numarası)", "zh": "🧠 追踪模式（球所在位置编号）", "ru": "🧠 Режим слежения (номер позиции шарика)", "es": "🧠 Modo seguimiento (número de posición de la bola)", "ml": "🧠 ട്രാക്കിംഗ് മോഡ് (പന്തിന്റെ സ്ഥാന നമ്പർ)"},
"ابدأ جولة":{"fr": "Lancer une manche", "hi": "राउंड शुरू करें", "bn": "রাউন্ড শুরু করুন", "ne": "राउन्ड सुरु गर्नुहोस्", "id": "Mulai ronde", "fil": "Magsimula ng round", "tr": "Tur başlat", "zh": "开始一局", "ru": "Начать раунд", "es": "Empezar ronda", "ml": "റൗണ്ട് തുടങ്ങൂ"},
"الكرة في المكان":{"fr": "Balle à la position", "hi": "गेंद इस जगह पर", "bn": "বল এই অবস্থানে", "ne": "बल यो स्थानमा", "id": "Bola di posisi", "fil": "Nasa posisyon ang bola", "tr": "Top şu konumda", "zh": "球在位置", "ru": "Шарик на позиции", "es": "Bola en la posición", "ml": "പന്ത് ഈ സ്ഥാനത്ത്"},
"وين الكرة؟ اضغط على كوب":{"fr": "Où est la balle ? Touche un gobelet", "hi": "गेंद कहाँ है? किसी कप पर टैप करें", "bn": "বল কোথায়? একটি কাপে ট্যাপ করুন", "ne": "बल कहाँ छ? कुनै कपमा ट्याप गर्नुहोस्", "id": "Di mana bolanya? Ketuk sebuah gelas", "fil": "Nasaan ang bola? I-tap ang isang baso", "tr": "Top nerede? Bir bardağa dokun", "zh": "球在哪？点一个杯子", "ru": "Где шарик? Нажми на стакан", "es": "¿Dónde está la bola? Toca un vaso", "ml": "പന്ത് എവിടെ? ഒരു കപ്പിൽ ടാപ്പ് ചെയ്യൂ"},
"✓ صح!":{"fr": "✓ Correct !", "hi": "✓ सही!", "bn": "✓ সঠিক!", "ne": "✓ सही!", "id": "✓ Benar!", "fil": "✓ Tama!", "tr": "✓ Doğru!", "zh": "✓ 对了！", "ru": "✓ Верно!", "es": "✓ ¡Correcto!", "ml": "✓ ശരി!"},
"✗ غلط":{"fr": "✗ Faux", "hi": "✗ गलत", "bn": "✗ ভুল", "ne": "✗ गलत", "id": "✗ Salah", "fil": "✗ Mali", "tr": "✗ Yanlış", "zh": "✗ 错了", "ru": "✗ Неверно", "es": "✗ Incorrecto", "ml": "✗ തെറ്റ്"},
"اضغط «ابدأ جولة»":{"fr": "Appuie sur « Lancer une manche »", "hi": "«राउंड शुरू करें» दबाएँ", "bn": "«রাউন্ড শুরু করুন» চাপুন", "ne": "«राउन्ड सुरु गर्नुहोस्» थिच्नुहोस्", "id": "Tekan «Mulai ronde»", "fil": "Pindutin ang «Magsimula ng round»", "tr": "«Tur başlat»a bas", "zh": "点击「开始一局」", "ru": "Нажми «Начать раунд»", "es": "Pulsa «Empezar ronda»", "ml": "«റൗണ്ട് തുടങ്ങൂ» അമർത്തൂ"},
"ثمانية دروس: في كلّ درس شرح، ولعبة حيّة تلمس فيها الخوارزميّة بيدك، وتحدٍّ، واختبار قصير — وفي آخر كلّ درس: هل تقدر تغلبها؟":{"fr": "Huit leçons : chacune a une explication, un jeu interactif où tu touches l’algorithme, un défi et un court quiz — et à la fin : peux-tu le battre ?", "hi": "आठ पाठ: हर पाठ में व्याख्या, एक लाइव गेम जिसमें आप एल्गोरिदम को छूते हैं, एक चुनौती और छोटा क्विज़ — और अंत में: क्या आप इसे हरा सकते हैं?", "bn": "আটটি পাঠ: প্রতিটিতে ব্যাখ্যা, একটি লাইভ গেম যেখানে অ্যালগরিদম নিজের হাতে ছোঁবেন, একটি চ্যালেঞ্জ ও ছোট কুইজ — আর শেষে: আপনি কি একে হারাতে পারবেন?", "ne": "आठ पाठ: हरेकमा व्याख्या, एल्गोरिदम आफैँ छुने प्रत्यक्ष खेल, एउटा चुनौती र छोटो क्विज — र अन्त्यमा: के तपाईं यसलाई जित्न सक्नुहुन्छ?", "id": "Delapan pelajaran: masing-masing berisi penjelasan, game interaktif untuk menyentuh algoritmanya, tantangan, dan kuis singkat — dan di akhir: bisakah kamu mengalahkannya?", "fil": "Walong aralin: bawat isa may paliwanag, live na laro kung saan hawak mo ang algorithm, hamon at maikling pagsusulit — at sa dulo: kaya mo ba itong talunin?", "tr": "Sekiz ders: her birinde açıklama, algoritmaya elinle dokunduğun canlı bir oyun, bir meydan okuma ve kısa bir test — ve sonunda: onu yenebilir misin?", "zh": "八节课：每课都有讲解、可亲手操作算法的互动游戏、挑战和小测验——最后还有：你能打败它吗？", "ru": "Восемь уроков: в каждом объяснение, живая игра, где ты трогаешь алгоритм руками, задание и короткий тест — а в конце: сможешь ли ты его победить?", "es": "Ocho lecciones: cada una con explicación, un juego en vivo donde tocas el algoritmo, un reto y una prueba corta — y al final: ¿puedes vencerlo?", "ml": "എട്ട് പാഠങ്ങൾ: ഓരോന്നിലും വിശദീകരണം, അൽഗോരിതം കൈകൊണ്ട് തൊടാവുന്ന ലൈവ് ഗെയിം, ഒരു വെല്ലുവിളി, ചെറിയ ക്വിസ് — അവസാനം: നിങ്ങൾക്ക് അതിനെ തോൽപ്പിക്കാമോ?"},
"الشرح":{"fr": "Explication", "hi": "व्याख्या", "bn": "ব্যাখ্যা", "ne": "व्याख्या", "id": "Penjelasan", "fil": "Paliwanag", "tr": "Açıklama", "zh": "讲解", "ru": "Объяснение", "es": "Explicación", "ml": "വിശദീകരണം"},
"جرّب بيدك":{"fr": "Essaie", "hi": "खुद आज़माएँ", "bn": "নিজে চেষ্টা করুন", "ne": "आफैँ प्रयास गर्नुहोस्", "id": "Coba sendiri", "fil": "Subukan mo", "tr": "Kendin dene", "zh": "动手试试", "ru": "Попробуй", "es": "Pruébalo", "ml": "സ്വയം പരീക്ഷിക്കൂ"},
"اختبار":{"fr": "Quiz", "hi": "क्विज़", "bn": "কুইজ", "ne": "क्विज", "id": "Kuis", "fil": "Pagsusulit", "tr": "Test", "zh": "测验", "ru": "Тест", "es": "Prueba", "ml": "ക്വിസ്"},
"اسأل المعلّم":{"fr": "Demander au tuteur", "hi": "शिक्षक से पूछें", "bn": "শিক্ষককে জিজ্ঞাসা করুন", "ne": "शिक्षकलाई सोध्नुहोस्", "id": "Tanya tutor", "fil": "Magtanong sa tutor", "tr": "Öğretmene sor", "zh": "问老师", "ru": "Спросить учителя", "es": "Pregunta al tutor", "ml": "അധ്യാപകനോട് ചോദിക്കൂ"},
"→ السابق":{"fr": "← Précédent", "hi": "← पिछला", "bn": "← আগের", "ne": "← अघिल्लो", "id": "← Sebelumnya", "fil": "← Nakaraan", "tr": "← Önceki", "zh": "← 上一课", "ru": "← Назад", "es": "← Anterior", "ml": "← മുമ്പത്തേത്"},
"التالي ←":{"fr": "Suivant →", "hi": "अगला →", "bn": "পরের →", "ne": "अर्को →", "id": "Berikutnya →", "fil": "Susunod →", "tr": "Sonraki →", "zh": "下一课 →", "ru": "Далее →", "es": "Siguiente →", "ml": "അടുത്തത് →"},
"جرّب بيدك الآن":{"fr": "Essaie maintenant", "hi": "अभी आज़माएँ", "bn": "এখনই চেষ্টা করুন", "ne": "अहिले नै प्रयास गर्नुहोस्", "id": "Coba sekarang", "fil": "Subukan ngayon", "tr": "Şimdi dene", "zh": "现在试试", "ru": "Попробуй сейчас", "es": "Pruébalo ahora", "ml": "ഇപ്പോൾ പരീക്ഷിക്കൂ"},
"ممتاز! فهمت الخوارزميّة 🌟":{"fr": "Excellent ! Tu as compris l’algorithme 🌟", "hi": "शानदार! आपने एल्गोरिदम समझ लिया 🌟", "bn": "চমৎকার! আপনি অ্যালগরিদম বুঝেছেন 🌟", "ne": "उत्कृष्ट! तपाईंले एल्गोरिदम बुझ्नुभयो 🌟", "id": "Hebat! Kamu paham algoritmanya 🌟", "fil": "Magaling! Naintindihan mo ang algorithm 🌟", "tr": "Harika! Algoritmayı anladın 🌟", "zh": "太棒了！你理解了这个算法 🌟", "ru": "Отлично! Ты понял алгоритм 🌟", "es": "¡Excelente! Entendiste el algoritmo 🌟", "ml": "മികച്ചത്! നിങ്ങൾ അൽഗോരിതം മനസ്സിലാക്കി 🌟"},
"راجع الشرح وجرّب اللعبة ثمّ أعد الاختبار 💪":{"fr": "Relis l’explication, joue au jeu, puis réessaie 💪", "hi": "व्याख्या दोबारा पढ़ें, गेम खेलें, फिर क्विज़ दोहराएँ 💪", "bn": "ব্যাখ্যা আবার পড়ুন, গেম খেলুন, তারপর আবার কুইজ দিন 💪", "ne": "व्याख्या फेरि पढ्नुहोस्, खेल खेल्नुहोस्, अनि फेरि क्विज दिनुहोस् 💪", "id": "Baca lagi penjelasannya, mainkan game-nya, lalu ulangi kuis 💪", "fil": "Balikan ang paliwanag, laruin ang laro, saka ulitin ang pagsusulit 💪", "tr": "Açıklamayı tekrar oku, oyunu oyna, sonra testi tekrarla 💪", "zh": "复习讲解、玩玩游戏，再重做测验 💪", "ru": "Перечитай объяснение, поиграй и пройди тест снова 💪", "es": "Repasa la explicación, juega y vuelve a intentar la prueba 💪", "ml": "വിശദീകരണം വീണ്ടും വായിക്കൂ, ഗെയിം കളിക്കൂ, പിന്നെ ക്വിസ് വീണ്ടും ചെയ്യൂ 💪"}
};
var DAY = 86400000;
function C(){ return window.__eduCore; }
function L(a, e){ var c = C(); return c ? c.eduL(a, e) : a; }
function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function lsGet(k, def){ try{ var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; }catch(e){ return def; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ __swallow(e, 'save:edu-plus'); } }
function $id(id){ return document.getElementById(id); }
function startOfDay(ms){ var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function go(render, back){
  var c = C(); if(!c) return;
  c.setBack(true); c.setNav([back || c.showHome]);
  render(c.body());
  try{ c.body().scrollTop = 0; }catch(e){ __swallow(e, 'ui:edu-plus-scroll'); }
}
function busy(el, txt){ el.innerHTML = '<div class="eduBusyBox"><div class="eduSpin"></div>' + (txt ? '<div style="font-size:var(--fs-3);">' + esc(txt) + '</div>' : '') + '</div>'; }
function errBox(el, msg, retry){
  el.innerHTML = '<div class="eduCenter"><p style="color:#f87171;font-size:var(--fs-3);line-height:1.8;">' + esc(msg) + '</p>'
    + (retry ? '<button class="eduPrimary" id="eduPlusRetry">' + esc(L('أعد المحاولة', 'Try again')) + '</button>' : '') + '</div>';
  var b = $id('eduPlusRetry'); if(b) b.onclick = retry;
}

/* ---------- 🔁 المراجعة المتباعدة (صناديق لايتنر) ----------
   «أعرفه» ترفع البطاقة صندوقًا وتؤجّلها: ١ ← يوم، ٢ ← ٣ أيّام، ٣ ← أسبوع، ٤ ← أسبوعان، ٥ ← شهر.
   «أراجعه» تعيدها للصندوق الأوّل ومستحقّة الآن. التخزين على الجهاز (eduSrs). */
var SRS_KEY = 'eduSrs', SRS_MAX = 800, INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
function hashStr(s){ var h = 5381; s = String(s || ''); for(var i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
function srsNext(entry, known, now){
  var box = (entry && entry.box) || 0;
  if(known){ box = Math.min(box + 1, 5); return { box: box, due: now + INTERVAL_DAYS[box] * DAY }; }
  return { box: 1, due: now };
}
function srsDue(store, now){
  var out = [];
  Object.keys(store || {}).forEach(function(k){ var e = store[k]; if(e && e.due <= now) out.push(Object.assign({ key: k }, e)); });
  out.sort(function(a, b){ return a.due - b.due; });
  return out;
}
function srsMark(lesson, card, known, now){
  if(!lesson || !card || !card.q) return;
  now = now || Date.now();
  var store = lsGet(SRS_KEY, {});
  var key = String(lesson.id || 'x') + '|' + hashStr(card.q);
  var nx = srsNext(store[key], known, now);
  store[key] = { lid: lesson.id, lt: String(lesson.title || '').slice(0, 120), q: String(card.q).slice(0, 600), a: String(card.a || '').slice(0, 1200), box: nx.box, due: nx.due, at: now };
  var keys = Object.keys(store);
  if(keys.length > SRS_MAX){
    keys.sort(function(a, b){ return (store[a].at || 0) - (store[b].at || 0); });
    keys.slice(0, keys.length - SRS_MAX).forEach(function(k){ delete store[k]; });
  }
  lsSet(SRS_KEY, store);
}
function showReview(){
  go(function(body){
    var now = Date.now();
    var due = srsDue(lsGet(SRS_KEY, {}), now);
    if(!due.length){
      body.innerHTML = '<div class="eduCenter"><div style="font-size:42px;">✅</div><p style="font-size:var(--fs-2);">' + esc(L('لا توجد بطاقات مستحقّة اليوم.', 'No cards are due today.')) + '</p>'
        + '<p style="font-size:var(--fs-3);opacity:.8;line-height:1.8;max-width:380px;margin:0 auto;">' + esc(L('كلّ بطاقة تحكم عليها في أيّ درس تُجدوَل هنا تلقائيًّا: يوم، ثمّ ٣ أيّام، ثمّ أسبوع، ثمّ أسبوعان، ثمّ شهر.', 'Every card you rate in any lesson is scheduled here automatically: 1 day, 3 days, a week, two weeks, then a month.')) + '</p></div>';
      return;
    }
    var queue = due.slice(0, 40), i = 0, flipped = false, right = 0;
    function draw(){
      if(i >= queue.length){
        body.innerHTML = '<div class="eduCenter"><div class="eduScoreBig">' + right + '/' + queue.length + '</div><p>' + esc(L('أنهيت مراجعة اليوم! 🎉', "You finished today's review! 🎉")) + '</p></div>';
        try{ C().bumpStreak(); }catch(e){ __swallow(e, 'edu:review-streak'); }
        return;
      }
      var c = queue[i];
      body.innerHTML = '<div class="eduSecTitle" style="margin-top:0;">🔁 ' + esc(L('مراجعة اليوم', "Today's review")) + '</div>'
        + '<div style="text-align:center;font-size:12px;opacity:.65;margin-bottom:10px;">' + (i + 1) + ' / ' + queue.length + ' · ' + esc(c.lt || '') + '</div>'
        + '<div class="eduCardStage"><div class="eduCard' + (flipped ? ' flipped' : '') + '" id="eduRvCard"><div class="eduCardFace eduCardFront">' + esc(c.q) + '</div><div class="eduCardFace eduCardBack">' + esc(c.a) + '</div></div></div>'
        + '<div class="eduHintTxt">' + esc(C().T('tapFlip')) + '</div>'
        + '<div class="eduCardBtns"><button class="eduKnowBtn" id="eduRvKnow">' + esc(C().T('know')) + '</button><button class="eduReviewBtn" id="eduRvAgain">' + esc(C().T('review')) + '</button></div>';
      $id('eduRvCard').onclick = function(){ flipped = !flipped; this.classList.toggle('flipped', flipped); };
      $id('eduRvKnow').onclick = function(){ srsMark({ id: c.lid, title: c.lt }, c, true); right++; i++; flipped = false; draw(); };
      $id('eduRvAgain').onclick = function(){ srsMark({ id: c.lid, title: c.lt }, c, false); queue.push(c); i++; flipped = false; draw(); };
    }
    draw();
  });
}

/* ---------- 🔊 استمع للدرس ---------- */
function plainText(md){
  return String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*`>|$\\]/g, ' ').replace(/^\s*[-•]\s+/gm, '').replace(/-{3,}/g, ' ').replace(/[ \t]+/g, ' ').trim();
}
var speakingBtn = null;
function stopSpeak(){
  try{ if(typeof stopAllSpeaking === 'function') stopAllSpeaking(); else if(window.speechSynthesis) window.speechSynthesis.cancel(); }
  catch(e){ __swallow(e, 'edu:tts-stop'); }
  if(speakingBtn){ speakingBtn.textContent = '🔊 ' + L('استمع للدرس', 'Listen to the lesson'); speakingBtn = null; }
}
function listenBtn(pane, text){
  if(!pane || !String(text || '').trim()) return;
  var b = document.createElement('button');
  b.className = 'eduListenBtn';
  b.textContent = '🔊 ' + L('استمع للدرس', 'Listen to the lesson');
  b.onclick = function(){
    if(speakingBtn === b){ stopSpeak(); return; }
    stopSpeak();
    speakingBtn = b; b.textContent = '⏹ ' + L('إيقاف', 'Stop');
    var t = plainText(text).slice(0, 12000);
    var done = function(){ if(speakingBtn === b) stopSpeak(); };
    try{
      if(typeof speakSmart === 'function') speakSmart(t, null, done);
      else if(window.speechSynthesis){ var u = new SpeechSynthesisUtterance(t); u.lang = /[؀-ۿ]/.test(t) ? 'ar-SA' : 'en-US'; u.onend = done; u.onerror = done; window.speechSynthesis.speak(u); }
      else done();
    }catch(e){ __swallow(e, 'edu:tts'); done(); }
  };
  pane.insertBefore(b, pane.firstChild);
}

/* ---------- 💬 اسأل المعلّم ---------- */
function tutor(pane, ctx){
  var c = C(); if(!c || !pane || !ctx) return;
  var key = 'eduTutor:' + String(ctx.id || hashStr(ctx.title)).slice(0, 60);
  var msgs = lsGet(key, []);
  var chips = [L('ما فهمت — اشرحها بطريقة أبسط', "I don't get it — explain it more simply"), L('أعطني مثالًا من الحياة', 'Give me a real-life example'), L('لخّص الدرس في ٣ نقاط', 'Summarize the lesson in 3 points'), L('اختبرني بسؤال واحد', 'Quiz me with one question')];
  pane.innerHTML = '<div class="eduTutor"><div class="eduTutorLog" id="eduTutorLog"></div>'
    + '<div class="eduTutorChips">' + chips.map(function(t, i){ return '<button class="eduChip" data-chip="' + i + '">' + esc(t) + '</button>'; }).join('') + '</div>'
    + '<div class="eduTutorBar"><textarea id="eduTutorIn" rows="2" placeholder="' + esc(L('اسأل عن أيّ نقطة في الدرس…', 'Ask about anything in this lesson…')) + '"></textarea>'
    + '<button class="eduPrimary" id="eduTutorSend">' + esc(L('إرسال', 'Send')) + '</button></div>'
    + (msgs.length ? '<button class="eduLinkBtn" id="eduTutorClear">' + esc(L('محادثة جديدة', 'New conversation')) + '</button>' : '') + '</div>';
  var log = $id('eduTutorLog'), input = $id('eduTutorIn'), send = $id('eduTutorSend');
  function render(){
    if(!msgs.length){ log.innerHTML = '<div class="eduTutorEmpty">👩‍🏫 ' + esc(L('أنا معلّمك لهذا الدرس. اسألني عن أيّ شيء لم تفهمه.', "I'm your tutor for this lesson. Ask me anything you didn't understand.")) + '</div>'; return; }
    log.innerHTML = msgs.map(function(m){
      return '<div class="eduMsg ' + (m.role === 'assistant' ? 'eduMsgT' : 'eduMsgS') + '">' + (m.role === 'assistant' ? '<div class="eduSummary">' + c.md(m.text) + '</div>' : esc(m.text)) + '</div>';
    }).join('');
    log.scrollTop = log.scrollHeight;
  }
  function ask(q){
    q = String(q || '').trim(); if(!q || send.disabled) return;
    var history = msgs.slice(-8);
    msgs.push({ role: 'user', text: q }); input.value = ''; render();
    log.insertAdjacentHTML('beforeend', '<div class="eduMsg eduMsgT eduTyping" id="eduTyping"><span></span><span></span><span></span></div>');
    log.scrollTop = log.scrollHeight;
    send.disabled = true;
    c.api({ action: 'tutor', title: ctx.title, summary: ctx.summary, history: history, question: q, lang: c.appLang(), nativeLang: c.nativeLang() })
      .then(function(j){ msgs.push({ role: 'assistant', text: String(j.reply || '') }); })
      .catch(function(e){ msgs.push({ role: 'assistant', text: '⚠️ ' + ((e && e.message) || L('تعذّر الردّ الآن — حاول مرة أخرى.', 'Could not reply right now — try again.')) }); })
      .then(function(){ send.disabled = false; msgs = msgs.slice(-20); lsSet(key, msgs); render(); });
  }
  send.onclick = function(){ ask(input.value); };
  input.addEventListener('keydown', function(e){ if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); ask(input.value); } });
  pane.querySelectorAll('[data-chip]').forEach(function(b){ b.onclick = function(){ ask(chips[+b.getAttribute('data-chip')]); }; });
  var clr = $id('eduTutorClear'); if(clr) clr.onclick = function(){ msgs = []; lsSet(key, msgs); tutor(pane, ctx); };
  render();
}
function showTutorView(ctx, back){
  go(function(body){
    body.innerHTML = '<div class="eduSecTitle" style="margin-top:0;">💬 ' + esc(ctx.title) + '</div><div id="eduTutorPane"></div>';
    tutor($id('eduTutorPane'), ctx);
  }, back);
}

/* ---------- 🧩 حلّ مسألة خطوة بخطوة ---------- */
function shrinkImage(file){
  /* صورة الجوّال ٣–٦ م.ب تتجاوز حدّ جسم الطلب — تُصغَّر إلى ١٦٠٠ بكسل JPEG */
  return new Promise(function(res, rej){
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function(){
      try{
        var k = Math.min(1, 1600 / Math.max(im.width, im.height));
        var cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        res({ base64: cv.toDataURL('image/jpeg', 0.85).split(',')[1], mime: 'image/jpeg' });
      }catch(e){ rej(e); }
    };
    im.onerror = function(){ URL.revokeObjectURL(url); rej(new Error(L('تعذّر قراءة الصورة.', 'Could not read the image.'))); };
    im.src = url;
  });
}
function showSolver(){
  go(function(body){
    var img = null;
    body.innerHTML = '<div class="eduSecTitle" style="margin-top:0;">🧩 ' + esc(L('حلّ مسألة خطوة بخطوة', 'Solve a problem step by step')) + '</div>'
      + '<p style="font-size:var(--fs-3);opacity:.8;line-height:1.8;margin:0 0 10px;">' + esc(L('صوّر السؤال أو اكتبه. تظهر لك الخطوات واحدة واحدة مع تلميح قبل كلّ خطوة — لتتعلّم الطريقة لا تنسخ الجواب.', 'Snap or type the question. Steps appear one at a time with a hint before each — so you learn the method, not just copy the answer.')) + '</p>'
      + '<button class="eduUploadBtn" id="eduSolvePick"><span style="font-size:20px;">📷</span><span id="eduSolvePickTxt">' + esc(L('صوّر المسألة أو ارفع صورتها', 'Snap or upload the problem')) + '</span></button>'
      + '<input type="file" id="eduSolveFile" accept="image/*" style="display:none;">'
      + '<textarea id="eduSolveTxt" rows="4" class="eduField" placeholder="' + esc(L('أو اكتب المسألة هنا…', 'Or type the problem here…')) + '"></textarea>'
      + '<button class="eduPrimary" id="eduSolveGo" style="width:100%;">' + esc(L('✨ حلّها خطوة بخطوة', '✨ Solve it step by step')) + '</button>';
    $id('eduSolvePick').onclick = function(){ $id('eduSolveFile').click(); };
    $id('eduSolveFile').onchange = function(){
      var f = this.files && this.files[0]; if(!f) return;
      $id('eduSolvePickTxt').textContent = '⏳ ' + f.name;
      shrinkImage(f).then(function(r){ img = r; $id('eduSolvePickTxt').textContent = '✅ ' + f.name; })
        .catch(function(e){ img = null; $id('eduSolvePickTxt').textContent = '⚠️ ' + ((e && e.message) || ''); });
    };
    $id('eduSolveGo').onclick = function(){
      var text = ($id('eduSolveTxt').value || '').trim();
      if(!text && !img){ $id('eduSolveTxt').focus(); return; }
      solve(body, text, img);
    };
  });
}
function solve(body, text, img){
  var c = C();
  busy(body, L('⏳ نحلّ المسألة…', '⏳ Solving…'));
  c.api({ action: 'solve', text: text, image: img || undefined, lang: c.appLang(), nativeLang: c.nativeLang() })
    .then(function(j){ showSolution(body, j.solution || {}); })
    .catch(function(e){ errBox(body, (e && e.message) || c.T('err'), function(){ solve(body, text, img); }); });
}
function showSolution(body, s){
  var c = C(), steps = s.steps || [], shown = 0;
  body.innerHTML = '<div class="eduSecTitle" style="margin-top:0;">🧩 ' + esc(s.topic || L('الحلّ', 'Solution')) + '</div>'
    + '<div class="eduSolveProblem eduSummary">' + c.md(s.problem) + '</div><div id="eduSteps"></div><div id="eduSolveEnd"></div>';
  var box = $id('eduSteps'), end = $id('eduSolveEnd');
  function addStep(){
    var n = shown, st = steps[n];
    var d = document.createElement('div');
    d.className = 'eduStep';
    d.innerHTML = '<div class="eduStepHead">' + esc(L('الخطوة', 'Step')) + ' ' + (n + 1) + ' / ' + steps.length + '</div>'
      + '<div class="eduStepHint" style="display:none;">💡 <span class="eduSummary">' + c.md(st.hint) + '</span></div>'
      + '<div class="eduStepWork eduSummary" style="display:none;">' + c.md(st.work) + '</div>'
      + '<div class="eduStepBtns">' + (st.hint ? '<button class="eduChip" data-a="hint">💡 ' + esc(L('تلميح', 'Hint')) + '</button>' : '')
      + '<button class="eduChip" data-a="work">👣 ' + esc(L('أظهر الخطوة', 'Show the step')) + '</button></div>';
    box.appendChild(d);
    var hb = d.querySelector('[data-a="hint"]');
    if(hb) hb.onclick = function(){ d.querySelector('.eduStepHint').style.display = ''; hb.remove(); };
    d.querySelector('[data-a="work"]').onclick = function(){
      d.querySelector('.eduStepWork').style.display = '';
      d.querySelector('.eduStepBtns').remove();
      shown++;
      if(shown < steps.length) addStep(); else finish();
    };
  }
  function finish(){
    end.innerHTML = '<button class="eduPrimary" id="eduShowAns" style="width:100%;">✅ ' + esc(L('أظهر الجواب النهائيّ', 'Show the final answer')) + '</button>';
    $id('eduShowAns').onclick = function(){
      end.innerHTML = '<div class="eduAnswer"><b>✅ ' + esc(L('الجواب:', 'Answer:')) + '</b><div class="eduSummary">' + c.md(s.answer) + '</div></div>'
        + (s.check ? '<div class="eduExplain">🔎 <b>' + esc(L('التحقّق:', 'Check:')) + '</b><div class="eduSummary">' + c.md(s.check) + '</div></div>' : '')
        + (s.tip ? '<div class="eduExplain">🎯 <b>' + esc(L('الفكرة للمسائل المشابهة:', 'The idea for similar problems:')) + '</b><div class="eduSummary">' + c.md(s.tip) + '</div></div>' : '')
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;"><button class="eduPrimary" id="eduSolveAsk">💬 ' + esc(L('اسأل المعلّم عن هذه المسألة', 'Ask the tutor about this problem')) + '</button>'
        + '<button class="eduPrimary eduGhost" id="eduSolveNew">🧩 ' + esc(L('مسألة جديدة', 'New problem')) + '</button></div>';
      $id('eduSolveNew').onclick = showSolver;
      $id('eduSolveAsk').onclick = function(){
        var summary = s.problem + '\n\n' + steps.map(function(x, i){ return (i + 1) + ') ' + x.work; }).join('\n') + '\n\n' + s.answer;
        showTutorView({ id: 'solve-' + hashStr(s.problem), title: s.topic || L('مسألة', 'Problem'), summary: summary }, showSolver);
      };
    };
  }
  if(steps.length) addStep(); else finish();
}

/* ---------- 📊 تقدّمي + خطّة الامتحان ---------- */
/* خطّة الامتحان: الدروس الأضعف (أو غير المختبَرة) أوّلًا، موزّعة على أيّام المذاكرة قبل الامتحان،
   واليوم الأخير قبله مراجعة شاملة. يوم واحد متبقٍّ = مراجعة شاملة فقط. */
function buildExamPlan(lessons, examMs, nowMs){
  var today = startOfDay(nowMs), exam = startOfDay(examMs);
  var days = Math.max(1, Math.round((exam - today) / DAY));
  var sorted = (lessons || []).slice().sort(function(a, b){
    var sa = typeof a.bestScore === 'number' ? a.bestScore : -1, sb = typeof b.bestScore === 'number' ? b.bestScore : -1;
    return sa - sb;
  });
  var plan = [], ids = sorted.map(function(l){ return l.id; });
  function dayAt(i){ return new Date(today + i * DAY).toISOString().slice(0, 10); }
  if(days === 1 || !sorted.length){ plan.push({ date: dayAt(0), kind: 'review', ids: ids }); return plan; }
  var study = days - 1, per = Math.ceil(sorted.length / study);
  for(var d = 0; d < study; d++){
    var chunk = ids.slice(d * per, d * per + per);
    plan.push({ date: dayAt(d), kind: chunk.length ? 'study' : 'weak', ids: chunk.length ? chunk : ids.slice(0, Math.min(2, ids.length)) });
  }
  plan.push({ date: dayAt(study), kind: 'review', ids: ids });
  return plan;
}
var PLAN_KEY = 'eduExamPlan';
function openLessonById(id, back){
  var c = C();
  busy(c.body());
  c.getLesson(id).then(function(l){ c.showLesson(l, back); }).catch(function(e){ errBox(c.body(), (e && e.message) || c.T('err')); });
}
function showProgress(){
  go(function(body){
    busy(body);
    C().listLessons().then(function(r){ drawProgress(body, r.lessons || []); }).catch(function(){ drawProgress(body, []); });
  });
}
function drawProgress(body, lessons){
  var c = C(), now = Date.now();
  var srs = lsGet(SRS_KEY, {}), srsAll = Object.keys(srs).length, srsDueN = srsDue(srs, now).length;
  var mastered = Object.keys(srs).filter(function(k){ return srs[k].box >= 4; }).length;
  var st = c.localStreak(), streak = st.streak || 0;
  var scored = lessons.filter(function(l){ return typeof l.bestScore === 'number'; });
  var avg = scored.length ? Math.round(scored.reduce(function(a, l){ return a + l.bestScore; }, 0) / scored.length) : null;
  var algoDone = Object.keys(lsGet('eduAlgoDone', {})).length;
  var lv = { basic: [], mid: [], advanced: [] };
  lessons.forEach(function(l){ var s = l.scores || {}; ['basic', 'mid', 'advanced'].forEach(function(k){ if(typeof s[k] === 'number') lv[k].push(s[k]); }); });
  function mean(a){ return a.length ? Math.round(a.reduce(function(x, y){ return x + y; }, 0) / a.length) : null; }
  var LVL = { basic: L('أساسي', 'Basic'), mid: L('متوسط', 'Intermediate'), advanced: L('متقدّم', 'Advanced') };
  function tile(n, t){ return '<div class="eduStat"><div class="eduStatN">' + n + '</div><div class="eduStatT">' + esc(t) + '</div></div>'; }
  var h = '<div class="eduSecTitle" style="margin-top:0;">📊 ' + esc(L('تقدّمي', 'My progress')) + '</div><div class="eduStats">'
    + tile('🔥 ' + streak, L('يوم متتالٍ', 'day streak')) + tile(lessons.length, L('درس', 'lessons'))
    + tile(avg == null ? '—' : avg + '%', L('متوسّط الاختبارات', 'quiz average')) + tile(srsDueN + '/' + srsAll, L('بطاقات مستحقّة', 'cards due'))
    + tile(mastered, L('بطاقة متقنة', 'cards mastered')) + tile(algoDone + '/8', L('خوارزميات الألعاب', 'Game algorithms')) + '</div>';
  var lvHtml = '';
  ['basic', 'mid', 'advanced'].forEach(function(k){ var m = mean(lv[k]); if(m != null) lvHtml += '<div class="eduLvRow"><span>' + esc(LVL[k]) + '</span><div class="eduBar"><i style="width:' + m + '%;background:' + (m >= 80 ? '#2e9e6b' : m >= 50 ? '#c98a10' : '#c0453f') + ';"></i></div><b>' + m + '%</b></div>'; });
  if(lvHtml){
    var weakLv = ['basic', 'mid', 'advanced'].filter(function(k){ return mean(lv[k]) != null; }).sort(function(a, b){ return mean(lv[a]) - mean(lv[b]); })[0];
    h += '<div class="eduSecTitle">' + esc(L('مستواك حسب الصعوبة', 'Your level by difficulty')) + '</div>' + lvHtml
      + (mean(lv[weakLv]) < 70 ? '<div class="eduExplain">🎯 ' + esc(L('أضعف نقطة عندك: أسئلة المستوى ', 'Your weakest point: ')) + '<b>' + esc(LVL[weakLv]) + '</b>' + esc(L(' — ابدأ مراجعتك منها.', ' questions — start your review there.')) + '</div>' : '');
  }
  var weak = lessons.filter(function(l){ return typeof l.bestScore !== 'number' || l.bestScore < 70; })
    .sort(function(a, b){ return (typeof a.bestScore === 'number' ? a.bestScore : -1) - (typeof b.bestScore === 'number' ? b.bestScore : -1); }).slice(0, 8);
  if(weak.length){
    h += '<div class="eduSecTitle">' + esc(L('دروس تحتاج مراجعة', 'Lessons that need review')) + '</div>'
      + weak.map(function(l){ return '<div class="eduLessonRow" data-open="' + esc(l.id) + '"><div style="flex:1;"><div class="eduLessonTitle">' + esc(l.title) + '</div><div class="eduLessonMeta">' + esc(l.subject || '') + ' · ' + (typeof l.bestScore === 'number' ? l.bestScore + '%' : esc(L('لم تُختبر بعد', 'not tested yet'))) + '</div></div></div>'; }).join('');
  }
  var subs = []; lessons.forEach(function(l){ var s = l.subject || '—'; if(subs.indexOf(s) < 0) subs.push(s); });
  var plan = lsGet(PLAN_KEY, null);
  h += '<div class="eduSecTitle">📅 ' + esc(L('خطّة الامتحان', 'Exam plan')) + '</div>';
  if(plan && plan.days && plan.days.length){
    var todayIso = new Date(startOfDay(now)).toISOString().slice(0, 10);
    var byId = {}; lessons.forEach(function(l){ byId[l.id] = l; });
    h += '<div class="eduLessonMeta" style="margin-bottom:8px;">' + esc(plan.subject) + ' · ' + esc(L('الامتحان:', 'Exam:')) + ' ' + esc(plan.exam) + '</div>'
      + plan.days.map(function(d){
        var kind = d.kind === 'review' ? L('مراجعة شاملة + اختبار كلّ الدروس', 'Full review + quiz on every lesson') : d.kind === 'weak' ? L('أعد اختبار الأضعف + بطاقات اليوم', 'Re-test the weakest + today\'s cards') : L('ذاكر واختبر نفسك:', 'Study and self-test:');
        return '<div class="eduPlanDay' + (d.date === todayIso ? ' today' : '') + (d.date < todayIso ? ' past' : '') + '"><div class="eduPlanDate">' + esc(d.date) + (d.date === todayIso ? ' · ' + esc(L('اليوم', 'Today')) : '') + '</div><div>' + esc(kind) + '</div>'
          + (d.kind === 'study' ? '<div>' + d.ids.map(function(id){ return byId[id] ? '<button class="eduChip" data-open="' + esc(id) + '">' + esc(byId[id].title) + '</button>' : ''; }).join('') + '</div>' : '') + '</div>';
      }).join('')
      + '<button class="eduLinkBtn" id="eduPlanDel">' + esc(L('احذف الخطّة', 'Delete plan')) + '</button>';
  } else if(subs.length){
    h += '<div class="eduPlanForm"><label>' + esc(L('المادة', 'Subject')) + '</label><select id="eduPlanSub" class="eduField">' + subs.map(function(s){ return '<option>' + esc(s) + '</option>'; }).join('') + '</select>'
      + '<label>' + esc(L('موعد الامتحان', 'Exam date')) + '</label><input type="date" id="eduPlanDate" class="eduField" min="' + new Date(now + DAY).toISOString().slice(0, 10) + '">'
      + '<button class="eduPrimary" id="eduPlanGo" style="width:100%;">' + esc(L('ابنِ خطّتي', 'Build my plan')) + '</button></div>';
  } else {
    h += '<div class="eduEmpty">' + esc(L('أضف دروسًا أوّلًا (ارفع محاضرة أو درسًا من المنهج) لتُبنى لك خطّة.', 'Add lessons first (upload a lecture or a curriculum lesson) to build a plan.')) + '</div>';
  }
  body.innerHTML = h;
  body.querySelectorAll('[data-open]').forEach(function(el){ el.onclick = function(){ openLessonById(el.getAttribute('data-open'), showProgress); }; });
  var del = $id('eduPlanDel'); if(del) del.onclick = function(){ lsSet(PLAN_KEY, null); drawProgress(body, lessons); };
  var goBtn = $id('eduPlanGo');
  if(goBtn) goBtn.onclick = function(){
    var sub = $id('eduPlanSub').value, dt = $id('eduPlanDate').value;
    if(!dt){ $id('eduPlanDate').focus(); return; }
    var examMs = new Date(dt + 'T00:00:00').getTime();
    if(!(examMs > now)){ $id('eduPlanDate').focus(); return; }
    var mine = lessons.filter(function(l){ return (l.subject || '—') === sub; });
    lsSet(PLAN_KEY, { subject: sub, exam: dt, days: buildExamPlan(mine, examMs, now) });
    drawProgress(body, lessons);
  };
}

/* ---------- 🎮 مسار خوارزميات الألعاب (edu-algo.js عند الطلب) ---------- */
var algoLoading = null;
function openAlgo(){
  var c = C();
  if(window.__eduAlgo){ window.__eduAlgo.open(); return; }
  busy(c.body());
  if(!algoLoading) algoLoading = new Promise(function(res, rej){
    var s = document.createElement('script');
    s.src = '/js/edu-algo.js?v=1';
    s.onload = res; s.onerror = function(){ algoLoading = null; rej(new Error(L('تعذّر تحميل المسار — تحقّق من الاتصال.', 'Could not load the track — check your connection.'))); };
    document.head.appendChild(s);
  });
  algoLoading.then(function(){ window.__eduAlgo.open(); }).catch(function(e){ errBox(c.body(), e.message, openAlgo); });
}

/* ---------- الواجهة الرئيسيّة: أربع بطاقات ---------- */
function home(el){
  if(!el) return;
  var now = Date.now(), dueN = srsDue(lsGet(SRS_KEY, {}), now).length, algoDone = Object.keys(lsGet('eduAlgoDone', {})).length;
  var plan = lsGet(PLAN_KEY, null), todayIso = new Date(startOfDay(now)).toISOString().slice(0, 10), todayPlan = null;
  if(plan && plan.days) plan.days.forEach(function(d){ if(d.date === todayIso) todayPlan = d; });
  function t(id, icon, title, sub, hot){ return '<button class="eduPlusTile' + (hot ? ' hot' : '') + '" id="' + id + '"><span class="eduPlusIcon">' + icon + '</span><span class="eduPlusTitle">' + esc(title) + '</span><span class="eduPlusSub">' + esc(sub) + '</span></button>'; }
  el.innerHTML = '<div class="eduPlusGrid">'
    + t('eduPlusAlgo', '🎮', L('خوارزميات الألعاب', 'Game algorithms'), L('مسار جاهز: ٨ دروس بألعاب حيّة', 'Ready track: 8 lessons with live games') + ' · ' + algoDone + '/8')
    + t('eduPlusSolve', '🧩', L('حلّ مسألة خطوة بخطوة', 'Solve a problem step by step'), L('صوّر السؤال أو اكتبه', 'Snap or type the question'))
    + t('eduPlusReview', '🔁', L('مراجعة اليوم', "Today's review"), dueN ? dueN + ' ' + L('بطاقة مستحقّة', 'cards due') : L('لا شيء اليوم ✓', 'Nothing due today ✓'), dueN > 0)
    + t('eduPlusProg', '📊', L('تقدّمي وخطّة الامتحان', 'Progress & exam plan'), todayPlan ? L('📅 عندك مهمّة اليوم', '📅 You have a task today') : L('نقاط ضعفك وخطّة المذاكرة', 'Weak points and study plan'), !!todayPlan)
    + '</div>';
  $id('eduPlusAlgo').onclick = openAlgo;
  $id('eduPlusSolve').onclick = showSolver;
  $id('eduPlusReview').onclick = showReview;
  $id('eduPlusProg').onclick = showProgress;
}

/* ---------- الأنماط ---------- */
(function injectCss(){
  try{
    if($id('eduPlusCss')) return;
    var st = document.createElement('style'); st.id = 'eduPlusCss';
    st.textContent = ''
      + '#eduHubModal .eduPlusGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px;}'
      + '@media(min-width:620px){#eduHubModal .eduPlusGrid{grid-template-columns:repeat(4,minmax(0,1fr));}}'
      + '#eduHubModal .eduPlusTile{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:start;padding:12px;border-radius:var(--r-3,14px);border:1px solid rgba(212,175,55,.28);background:linear-gradient(150deg,rgba(212,175,55,.12),rgba(212,175,55,.03));color:inherit;cursor:pointer;font:inherit;min-width:0;}'
      + '#eduHubModal .eduPlusTile:hover{border-color:rgba(212,175,55,.6);}'
      + '#eduHubModal .eduPlusTile.hot{border-color:#d4af37;box-shadow:0 0 0 1px rgba(212,175,55,.35) inset;}'
      + '#eduHubModal .eduPlusIcon{font-size:22px;}#eduHubModal .eduPlusTitle{font-weight:var(--w-bold,700);font-size:var(--fs-3,14px);}#eduHubModal .eduPlusSub{font-size:12px;opacity:.72;line-height:1.5;}'
      + '#eduHubModal .eduField{width:100%;box-sizing:border-box;padding:11px;margin:8px 0;border-radius:var(--r-2,10px);border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit;font-size:var(--fs-3,14px);}'
      + '#eduHubModal .eduField option{background:#111;color:#eee;}'
      + '#eduHubModal .eduGhost{background:transparent!important;border:1px solid currentColor!important;color:inherit!important;}'
      + '#eduHubModal .eduLinkBtn{background:none;border:none;color:inherit;opacity:.7;text-decoration:underline;cursor:pointer;font:inherit;font-size:12.5px;margin-top:10px;}'
      + '#eduHubModal .eduChip{display:inline-flex;margin:4px;padding:7px 12px;border-radius:999px;border:1px solid rgba(212,175,55,.4);background:rgba(212,175,55,.08);color:inherit;cursor:pointer;font:inherit;font-size:12.5px;}'
      + '#eduHubModal .eduListenBtn{margin:0 0 10px;padding:7px 14px;border-radius:999px;border:1px solid rgba(212,175,55,.45);background:rgba(212,175,55,.1);color:inherit;cursor:pointer;font:inherit;font-size:13px;}'
      /* العارض: كود، جداول، معادلات، اقتباس */
      + '#eduHubModal .eduCode{position:relative;background:#0d0d12;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:12px;overflow-x:auto;font:12.5px/1.6 ui-monospace,Menlo,Consolas,monospace;text-align:left;white-space:pre;margin:8px 0;}'
      + '#eduHubModal .eduCodeLang{position:absolute;top:4px;right:8px;font-size:10.5px;opacity:.55;}'
      + '#eduHubModal .eduSummary code{background:rgba(255,255,255,.08);padding:1px 5px;border-radius:5px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em;}'
      + '#eduHubModal .eduCode code{background:none;padding:0;}'
      + '#eduHubModal .eduTblWrap{overflow-x:auto;margin:8px 0;}#eduHubModal .eduTbl{border-collapse:collapse;min-width:100%;font-size:13px;}'
      + '#eduHubModal .eduTbl th,#eduHubModal .eduTbl td{border:1px solid rgba(255,255,255,.14);padding:6px 9px;text-align:start;vertical-align:top;}#eduHubModal .eduTbl th{background:rgba(212,175,55,.12);}'
      + '#eduHubModal .eduMath{display:inline-block;unicode-bidi:isolate;font-family:"Cambria Math","STIX Two Math","Times New Roman",serif;font-size:1.08em;white-space:nowrap;}'
      + '#eduHubModal .eduMathBlock{text-align:center;font-family:"Cambria Math","STIX Two Math","Times New Roman",serif;font-size:1.2em;margin:10px 0;overflow-x:auto;}'
      + '#eduHubModal .eduFrac{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;margin:0 2px;font-size:.9em;}#eduHubModal .eduFrac>span:first-child{border-bottom:1px solid currentColor;padding:0 3px;}'
      + '#eduHubModal .eduSqrt{border-top:1px solid currentColor;padding:0 2px;}'
      + '#eduHubModal .eduSummary blockquote{margin:8px 0;padding:6px 12px;border-inline-start:3px solid #d4af37;background:rgba(212,175,55,.06);border-radius:6px;}'
      /* المعلّم */
      + '#eduHubModal .eduTutorLog{max-height:min(52vh,460px);overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:4px 0 8px;}'
      + '#eduHubModal .eduMsg{max-width:92%;padding:9px 12px;border-radius:14px;font-size:var(--fs-3,14px);line-height:1.8;word-break:break-word;}'
      + '#eduHubModal .eduMsgS{align-self:flex-end;background:rgba(212,175,55,.16);border:1px solid rgba(212,175,55,.3);}'
      + '#eduHubModal .eduMsgT{align-self:flex-start;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);}'
      + '#eduHubModal .eduTutorEmpty{opacity:.75;text-align:center;padding:18px 8px;line-height:1.8;}'
      + '#eduHubModal .eduTutorBar{display:flex;gap:8px;align-items:flex-end;}#eduHubModal .eduTutorBar textarea{flex:1;min-width:0;padding:10px;border-radius:12px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit;resize:vertical;}'
      + '#eduHubModal .eduTutorBar .eduPrimary{margin-top:0;}'
      + '#eduHubModal .eduTyping span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#d4af37;animation:eduDot 1s infinite;}#eduHubModal .eduTyping span:nth-child(2){animation-delay:.15s}#eduHubModal .eduTyping span:nth-child(3){animation-delay:.3s}'
      + '@keyframes eduDot{0%,80%,100%{opacity:.25}40%{opacity:1}}'
      /* الحلّ خطوة بخطوة */
      + '#eduHubModal .eduSolveProblem{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);margin-bottom:10px;}'
      + '#eduHubModal .eduStep{padding:10px 12px;border-radius:12px;border:1px solid rgba(212,175,55,.25);margin:8px 0;}#eduHubModal .eduStepHead{font-weight:var(--w-bold,700);color:#f1d98a;margin-bottom:6px;font-size:13px;}'
      + '#eduHubModal .eduStepHint{padding:6px 10px;border-radius:8px;background:rgba(99,102,241,.1);margin-bottom:6px;}'
      + '#eduHubModal .eduAnswer{padding:12px;border-radius:12px;background:rgba(46,158,107,.12);border:1px solid rgba(46,158,107,.4);}'
      /* التقدّم والخطّة */
      + '#eduHubModal .eduStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}'
      + '#eduHubModal .eduStat{padding:10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);text-align:center;}#eduHubModal .eduStatN{font-size:18px;font-weight:var(--w-bold,700);color:#f1d98a;}#eduHubModal .eduStatT{font-size:11.5px;opacity:.72;margin-top:2px;}'
      + '#eduHubModal .eduLvRow{display:grid;grid-template-columns:90px 1fr 44px;gap:8px;align-items:center;margin:6px 0;font-size:13px;}'
      + '#eduHubModal .eduPlanDay{padding:9px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.1);margin:6px 0;font-size:13px;line-height:1.7;}#eduHubModal .eduPlanDay.today{border-color:#d4af37;background:rgba(212,175,55,.08);}#eduHubModal .eduPlanDay.past{opacity:.5;}'
      + '#eduHubModal .eduPlanDate{font-weight:var(--w-bold,700);color:#f1d98a;}#eduHubModal .eduPlanForm label{display:block;margin-top:8px;font-size:13px;opacity:.85;}'
      /* مسار الخوارزميّات */
      + '#eduHubModal .algoRow{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;border:1px solid rgba(212,175,55,.22);margin:8px 0;cursor:pointer;background:rgba(255,255,255,.02);}'
      + '#eduHubModal .algoRow:hover{border-color:rgba(212,175,55,.55);}#eduHubModal .algoIcon{font-size:26px;flex:0 0 auto;}#eduHubModal .algoRowT{font-weight:var(--w-bold,700);}#eduHubModal .algoRowS{font-size:12px;opacity:.72;line-height:1.6;}'
      + '#eduHubModal .algoDone{margin-inline-start:auto;font-size:12px;color:#2e9e6b;white-space:nowrap;}'
      + '#eduHubModal .algoStage{position:relative;width:100%;max-width:760px;margin:0 auto;border-radius:14px;overflow:hidden;border:1px solid rgba(212,175,55,.35);background:#07070a;touch-action:none;}'
      + '#eduHubModal .algoStage canvas{display:block;width:100%;height:auto;}'
      + '#eduHubModal .algoCtl{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:10px 0;font-size:13px;}'
      + '#eduHubModal .algoCtl label{display:flex;align-items:center;gap:6px;}#eduHubModal .algoCtl input[type=range]{width:120px;accent-color:#d4af37;}'
      + '#eduHubModal .algoInfo{font:12.5px/1.7 ui-monospace,Menlo,Consolas,monospace;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);direction:ltr;text-align:left;white-space:pre-wrap;}'
      + '#eduHubModal .algoTask{padding:8px 12px;border-radius:10px;background:rgba(212,175,55,.08);border:1px dashed rgba(212,175,55,.45);font-size:13px;line-height:1.7;margin-top:8px;}';
    document.head.appendChild(st);
  }catch(e){ __swallow(e, 'ui:edu-plus-css'); }
})();

window.__eduPlus = {
  home: home, tutor: tutor, showTutorView: showTutorView, listenBtn: listenBtn, srsMark: srsMark,
  showReview: showReview, showSolver: showSolver, showProgress: showProgress, openAlgo: openAlgo,
  lib: { srsNext: srsNext, srsDue: srsDue, buildExamPlan: buildExamPlan, plainText: plainText, INTERVAL_DAYS: INTERVAL_DAYS }
};
})();
