/* js/app-15-floorplan.js — 🏗️ مولّد المخططات.
 *
 * لماذا لا يرسمه نموذج الصور:
 * ‏Gemini ينتج بكسلات تشبه الأرقام، لا أرقامًا محسوبة. في مخططك السابق كتب
 * «مجلس 150 م²» على غرفة أبعادها 3.00 × 3.80 = 11 م²، و«1100 م²» على غرفة
 * نوم. الرقم الوحيد الصحيح كان حوض السباحة (4 × 2.5 = 10) — لأنه رقم سهل،
 * لا لأنه حُسب. ولا توجد صياغة طلب تصلح هذا: المشكلة في طبيعة الأداة.
 *
 * الحل هنا: النموذج يقرّر الغرف وأبعادها فقط، والحساب والرسم بالكود.
 * فالمساحة لا يمكن أن تكون خاطئة — هي w × h ولا شيء آخر.
 *
 * ونفس ملف المواصفات يغذّي توليد الواجهة، فيستحيل أن يختلف عدد الطوابق أو
 * الغرف بين المخطط والصورة (وهي المشكلة التي أوقفت القسم).
 */
(function () {
  'use strict';

  var M = 34;            // بكسل لكل متر
  var PAD = 56;          // هامش للأبعاد الخارجية
  var WALL = 3;

  /* v-cons-i18n (طلب عمران: «غير اللغات في المقاولات»): صفحة المحرّر كانت
     عربية صرفة مهما كانت لغة التطبيق. الاتفاقية: ar/ur عربي، وإلا لغة
     المستخدم من الجدول ثم الإنجليزية. أسماء الغرف تأتي من النموذج بالعربية
     (لوحة الألوان مفتاحها عربي) وتُعرض للغات الأخرى بالإنجليزية. */
  var ROOM_EN = { 'مجلس':'Majlis', 'صالة':'Living', 'نوم':'Bedroom', 'حمام':'Bath', 'مطبخ':'Kitchen', 'كراج':'Garage', 'خدامة':'Maid room', 'مسبح':'Pool', 'مكتب':'Office', 'مخزن':'Storage', 'سلم':'Stairs', 'ممر':'Corridor', 'غرفة':'Room' };
  var L10N = {
    en:{ prep:'⏳ Preparing the plan…', arch:'📐 The AI architect is laying out rooms and sizes…', planFail:'⚠️ Could not prepare the plan now. Try again shortly.', tot:'Total build', pw:'Plot width', dp:'Build depth', fa:'Floor area', addR:'＋ Room', addF:'＋ Floor', hint:'Tap a room to rename or resize it · drag it to move · drag the corner to resize', nm:'Name', w:'Width (m)', h:'Length (m)', area:'Area', del:'Delete', views:'Project renders', day:'Day', dusk:'Dusk', air:'Aerial', ent:'Entrance', maj:'Majlis', liv:'Living', note:'Areas are computed live from the dimensions. Concept plan only — execution requires a licensed engineering office and municipality approval.', t3:'3D tour', t3x:'Split floors', t3hint:'Drag to rotate · pinch to zoom', t3t:'Building tour', room:'Room', floor:'Floor', gen:'… generating', genFail:'Could not generate the image now. Try again shortly.', cap:'generated from the plan as you edited it', m2:' m²', m:' m' },
    fr:{ prep:'⏳ Préparation du plan…', arch:'📐 L’architecte IA répartit les pièces et les mesures…', planFail:'⚠️ Impossible de préparer le plan. Réessayez bientôt.', tot:'Surface totale', pw:'Largeur du terrain', dp:'Profondeur', fa:'Surface de l’étage', addR:'＋ Pièce', addF:'＋ Étage', hint:'Touchez une pièce pour la renommer ou la redimensionner · glissez-la pour la déplacer · tirez le coin pour l’agrandir', nm:'Nom', w:'Largeur (m)', h:'Longueur (m)', area:'Surface', del:'Supprimer', views:'Rendus du projet', day:'Jour', dusk:'Crépuscule', air:'Vue aérienne', ent:'Entrée', maj:'Majlis', liv:'Salon', note:'Les surfaces sont calculées en direct à partir des dimensions. Plan conceptuel — l’exécution exige un bureau d’études agréé et l’accord de la municipalité.', t3:'Visite 3D', t3x:'Séparer les étages', t3hint:'Glissez pour pivoter · pincez pour zoomer', t3t:'Visite du bâtiment', room:'Pièce', floor:'Étage', gen:'… génération', genFail:'Impossible de générer l’image maintenant. Réessayez bientôt.', cap:'généré à partir du plan tel que vous l’avez modifié', m2:' m²', m:' m' },
    hi:{ prep:'⏳ नक्शा तैयार हो रहा है…', arch:'📐 AI वास्तुकार कमरे और माप व्यवस्थित कर रहा है…', planFail:'⚠️ अभी नक्शा तैयार नहीं हो सका। थोड़ी देर में फिर कोशिश करें।', tot:'कुल निर्माण', pw:'भूखंड चौड़ाई', dp:'निर्माण गहराई', fa:'मंज़िल क्षेत्रफल', addR:'＋ कमरा', addF:'＋ मंज़िल', hint:'नाम या माप बदलने के लिए कमरे पर टैप करें · हिलाने के लिए खींचें · बड़ा करने के लिए कोना खींचें', nm:'नाम', w:'चौड़ाई (मी)', h:'लंबाई (मी)', area:'क्षेत्रफल', del:'हटाएँ', views:'प्रोजेक्ट चित्र', day:'दिन', dusk:'शाम', air:'ऊपर से', ent:'प्रवेश', maj:'मजलिस', liv:'बैठक', note:'क्षेत्रफल माप से तुरंत गणना होती है। यह अवधारणा नक्शा है — निर्माण के लिए लाइसेंस प्राप्त इंजीनियरिंग कार्यालय और नगरपालिका की मंज़ूरी आवश्यक है।', t3:'3D सैर', t3x:'मंज़िलें अलग करें', t3hint:'घुमाने के लिए खींचें · ज़ूम के लिए पिंच करें', t3t:'भवन की सैर', room:'कमरा', floor:'मंज़िल', gen:'… बन रहा है', genFail:'अभी चित्र नहीं बन सका। थोड़ी देर में फिर कोशिश करें।', cap:'आपके संपादित नक्शे से बनाया गया', m2:' मी²', m:' मी' },
    bn:{ prep:'⏳ নকশা প্রস্তুত হচ্ছে…', arch:'📐 AI স্থপতি কক্ষ ও মাপ সাজাচ্ছে…', planFail:'⚠️ এখন নকশা প্রস্তুত করা গেল না। একটু পরে আবার চেষ্টা করুন।', tot:'মোট নির্মাণ', pw:'জমির প্রস্থ', dp:'নির্মাণ গভীরতা', fa:'তলার আয়তন', addR:'＋ কক্ষ', addF:'＋ তলা', hint:'নাম বা মাপ বদলাতে কক্ষে চাপ দিন · সরাতে টেনে আনুন · বড় করতে কোণা টানুন', nm:'নাম', w:'প্রস্থ (মি)', h:'দৈর্ঘ্য (মি)', area:'আয়তন', del:'মুছুন', views:'প্রকল্পের ছবি', day:'দিন', dusk:'সন্ধ্যা', air:'উপর থেকে', ent:'প্রবেশপথ', maj:'মজলিস', liv:'বসার ঘর', note:'আয়তন মাপ থেকে সরাসরি হিসাব হয়। এটি ধারণামূলক নকশা — নির্মাণে লাইসেন্সধারী প্রকৌশল অফিস ও পৌরসভার অনুমোদন লাগবে।', t3:'3D ভ্রমণ', t3x:'তলা আলাদা করুন', t3hint:'ঘোরাতে টানুন · জুম করতে পিঞ্চ করুন', t3t:'ভবন ভ্রমণ', room:'কক্ষ', floor:'তলা', gen:'… তৈরি হচ্ছে', genFail:'এখন ছবি তৈরি করা গেল না। একটু পরে আবার চেষ্টা করুন।', cap:'আপনার সম্পাদিত নকশা থেকে তৈরি', m2:' মি²', m:' মি' },
    ne:{ prep:'⏳ नक्सा तयार हुँदैछ…', arch:'📐 AI वास्तुकारले कोठा र नाप मिलाउँदैछ…', planFail:'⚠️ अहिले नक्सा तयार गर्न सकिएन। केही बेरमा फेरि प्रयास गर्नुहोस्।', tot:'कुल निर्माण', pw:'जग्गाको चौडाइ', dp:'निर्माण गहिराइ', fa:'तलाको क्षेत्रफल', addR:'＋ कोठा', addF:'＋ तला', hint:'नाम वा नाप बदल्न कोठामा ट्याप गर्नुहोस् · सार्न तान्नुहोस् · ठूलो बनाउन कुना तान्नुहोस्', nm:'नाम', w:'चौडाइ (मि)', h:'लम्बाइ (मि)', area:'क्षेत्रफल', del:'हटाउनुहोस्', views:'परियोजना चित्रहरू', day:'दिन', dusk:'साँझ', air:'माथिबाट', ent:'प्रवेशद्वार', maj:'मजलिस', liv:'बैठक', note:'क्षेत्रफल नापबाट तुरुन्तै गणना हुन्छ। यो अवधारणा नक्सा हो — निर्माणका लागि इजाजतप्राप्त इन्जिनियरिङ कार्यालय र नगरपालिकाको स्वीकृति चाहिन्छ।', t3:'3D भ्रमण', t3x:'तलाहरू छुट्याउनुहोस्', t3hint:'घुमाउन तान्नुहोस् · जुम गर्न पिन्च गर्नुहोस्', t3t:'भवन भ्रमण', room:'कोठा', floor:'तला', gen:'… बन्दैछ', genFail:'अहिले चित्र बनाउन सकिएन। केही बेरमा फेरि प्रयास गर्नुहोस्।', cap:'तपाईंले सम्पादन गरेको नक्साबाट बनेको', m2:' मि²', m:' मि' },
    id:{ prep:'⏳ Menyiapkan denah…', arch:'📐 Arsitek AI menata ruangan dan ukuran…', planFail:'⚠️ Denah tidak dapat disiapkan sekarang. Coba lagi sebentar.', tot:'Total bangunan', pw:'Lebar lahan', dp:'Kedalaman bangunan', fa:'Luas lantai', addR:'＋ Ruang', addF:'＋ Lantai', hint:'Ketuk ruangan untuk mengganti nama atau ukurannya · seret untuk memindahkan · tarik sudutnya untuk memperbesar', nm:'Nama', w:'Lebar (m)', h:'Panjang (m)', area:'Luas', del:'Hapus', views:'Gambar proyek', day:'Siang', dusk:'Senja', air:'Dari atas', ent:'Pintu masuk', maj:'Majlis', liv:'Ruang keluarga', note:'Luas dihitung langsung dari ukuran. Denah konsep — pelaksanaan memerlukan kantor teknik berlisensi dan izin pemerintah kota.', t3:'Tur 3D', t3x:'Pisahkan lantai', t3hint:'Seret untuk memutar · cubit untuk zoom', t3t:'Tur bangunan', room:'Ruang', floor:'Lantai', gen:'… membuat', genFail:'Gambar tidak dapat dibuat sekarang. Coba lagi sebentar.', cap:'dibuat dari denah yang Anda edit', m2:' m²', m:' m' },
    fil:{ prep:'⏳ Inihahanda ang plano…', arch:'📐 Inaayos ng AI architect ang mga kuwarto at sukat…', planFail:'⚠️ Hindi maihanda ang plano ngayon. Subukan muli mamaya.', tot:'Kabuuang gusali', pw:'Lapad ng lote', dp:'Lalim ng gusali', fa:'Sukat ng palapag', addR:'＋ Kuwarto', addF:'＋ Palapag', hint:'I-tap ang kuwarto para palitan ang pangalan o sukat · i-drag para ilipat · hilahin ang sulok para palakihin', nm:'Pangalan', w:'Lapad (m)', h:'Haba (m)', area:'Sukat', del:'Burahin', views:'Mga larawan ng proyekto', day:'Araw', dusk:'Takipsilim', air:'Mula sa itaas', ent:'Pasukan', maj:'Majlis', liv:'Sala', note:'Ang sukat ay kinukwenta agad mula sa mga dimensyon. Konseptong plano — ang pagpapatupad ay nangangailangan ng lisensyadong engineering office at pag-apruba ng munisipyo.', t3:'3D tour', t3x:'Ihiwalay ang mga palapag', t3hint:'I-drag para iikot · i-pinch para mag-zoom', t3t:'Tour ng gusali', room:'Kuwarto', floor:'Palapag', gen:'… ginagawa', genFail:'Hindi mabuo ang larawan ngayon. Subukan muli mamaya.', cap:'mula sa planong in-edit mo', m2:' m²', m:' m' },
    tr:{ prep:'⏳ Plan hazırlanıyor…', arch:'📐 Yapay zekâ mimar odaları ve ölçüleri yerleştiriyor…', planFail:'⚠️ Plan şu an hazırlanamadı. Az sonra tekrar deneyin.', tot:'Toplam inşaat', pw:'Arsa genişliği', dp:'Yapı derinliği', fa:'Kat alanı', addR:'＋ Oda', addF:'＋ Kat', hint:'Adını veya ölçüsünü değiştirmek için odaya dokunun · taşımak için sürükleyin · büyütmek için köşeyi çekin', nm:'Ad', w:'Genişlik (m)', h:'Uzunluk (m)', area:'Alan', del:'Sil', views:'Proje görselleri', day:'Gündüz', dusk:'Akşam', air:'Yukarıdan', ent:'Giriş', maj:'Meclis', liv:'Salon', note:'Alanlar ölçülerden anında hesaplanır. Konsept plandır — uygulama için lisanslı mühendislik bürosu ve belediye onayı gerekir.', t3:'3B tur', t3x:'Katları ayır', t3hint:'Döndürmek için sürükleyin · yakınlaştırmak için kıstırın', t3t:'Bina turu', room:'Oda', floor:'Kat', gen:'… oluşturuluyor', genFail:'Görsel şu an oluşturulamadı. Az sonra tekrar deneyin.', cap:'düzenlediğiniz plandan üretildi', m2:' m²', m:' m' },
    zh:{ prep:'⏳ 正在准备平面图…', arch:'📐 AI 建筑师正在布置房间和尺寸…', planFail:'⚠️ 暂时无法准备平面图，请稍后再试。', tot:'总建筑面积', pw:'地块宽度', dp:'建筑深度', fa:'楼层面积', addR:'＋ 房间', addF:'＋ 楼层', hint:'点按房间可改名或改尺寸 · 拖动可移动 · 拖动角落可放大', nm:'名称', w:'宽度（米）', h:'长度（米）', area:'面积', del:'删除', views:'项目效果图', day:'白天', dusk:'黄昏', air:'俯视', ent:'入口', maj:'会客厅', liv:'客厅', note:'面积根据尺寸实时计算。此为概念图 — 施工需持牌工程事务所及市政审批。', t3:'3D 漫游', t3x:'分离楼层', t3hint:'拖动旋转 · 双指缩放', t3t:'建筑漫游', room:'房间', floor:'楼层', gen:'… 生成中', genFail:'暂时无法生成图片，请稍后再试。', cap:'由您编辑后的平面图生成', m2:' 平方米', m:' 米' },
    ru:{ prep:'⏳ Готовим план…', arch:'📐 ИИ-архитектор расставляет комнаты и размеры…', planFail:'⚠️ Не удалось подготовить план. Попробуйте чуть позже.', tot:'Общая площадь', pw:'Ширина участка', dp:'Глубина застройки', fa:'Площадь этажа', addR:'＋ Комната', addF:'＋ Этаж', hint:'Нажмите на комнату, чтобы изменить название или размер · перетащите, чтобы переместить · тяните за угол, чтобы увеличить', nm:'Название', w:'Ширина (м)', h:'Длина (м)', area:'Площадь', del:'Удалить', views:'Изображения проекта', day:'День', dusk:'Закат', air:'Сверху', ent:'Вход', maj:'Меджлис', liv:'Гостиная', note:'Площади считаются мгновенно по размерам. Концептуальный план — для строительства нужны лицензированное бюро и разрешение муниципалитета.', t3:'3D-тур', t3x:'Разделить этажи', t3hint:'Тяните для вращения · щипок для масштаба', t3t:'Тур по зданию', room:'Комната', floor:'Этаж', gen:'… создаётся', genFail:'Не удалось создать изображение. Попробуйте чуть позже.', cap:'создано по плану с вашими правками', m2:' м²', m:' м' },
    es:{ prep:'⏳ Preparando el plano…', arch:'📐 El arquitecto IA distribuye habitaciones y medidas…', planFail:'⚠️ No se pudo preparar el plano ahora. Inténtalo en un momento.', tot:'Construcción total', pw:'Ancho del terreno', dp:'Profundidad', fa:'Área de la planta', addR:'＋ Habitación', addF:'＋ Planta', hint:'Toca una habitación para renombrarla o cambiar su tamaño · arrástrala para moverla · tira de la esquina para ampliarla', nm:'Nombre', w:'Ancho (m)', h:'Largo (m)', area:'Área', del:'Eliminar', views:'Imágenes del proyecto', day:'Día', dusk:'Atardecer', air:'Aérea', ent:'Entrada', maj:'Majlis', liv:'Salón', note:'Las áreas se calculan al instante según las medidas. Plano conceptual — la ejecución requiere una oficina de ingeniería licenciada y aprobación municipal.', t3:'Tour 3D', t3x:'Separar plantas', t3hint:'Arrastra para girar · pellizca para acercar', t3t:'Tour del edificio', room:'Habitación', floor:'Planta', gen:'… generando', genFail:'No se pudo generar la imagen ahora. Inténtalo en un momento.', cap:'generado del plano tal como lo editaste', m2:' m²', m:' m' },
    ml:{ prep:'⏳ പ്ലാൻ തയ്യാറാക്കുന്നു…', arch:'📐 AI ആർക്കിടെക്റ്റ് മുറികളും അളവുകളും ക്രമീകരിക്കുന്നു…', planFail:'⚠️ ഇപ്പോൾ പ്ലാൻ തയ്യാറാക്കാനായില്ല. അൽപം കഴിഞ്ഞ് ശ്രമിക്കുക.', tot:'ആകെ നിർമ്മാണം', pw:'സ്ഥലത്തിന്റെ വീതി', dp:'നിർമ്മാണ ആഴം', fa:'നിലയുടെ വിസ്തീർണ്ണം', addR:'＋ മുറി', addF:'＋ നില', hint:'പേരോ അളവോ മാറ്റാൻ മുറിയിൽ ടാപ്പ് ചെയ്യുക · നീക്കാൻ വലിക്കുക · വലുതാക്കാൻ മൂല വലിക്കുക', nm:'പേര്', w:'വീതി (മീ)', h:'നീളം (മീ)', area:'വിസ്തീർണ്ണം', del:'നീക്കം ചെയ്യുക', views:'പ്രോജക്റ്റ് ചിത്രങ്ങൾ', day:'പകൽ', dusk:'സന്ധ്യ', air:'മുകളിൽ നിന്ന്', ent:'പ്രവേശനം', maj:'മജ്‌ലിസ്', liv:'സ്വീകരണമുറി', note:'അളവുകളിൽ നിന്ന് വിസ്തീർണ്ണം തത്സമയം കണക്കാക്കുന്നു. ആശയരൂപരേഖ മാത്രം — നിർമ്മാണത്തിന് ലൈസൻസുള്ള എൻജിനീയറിങ് ഓഫീസും മുനിസിപ്പാലിറ്റി അനുമതിയും വേണം.', t3:'3D ടൂർ', t3x:'നിലകൾ വേർതിരിക്കുക', t3hint:'തിരിക്കാൻ വലിക്കുക · സൂം ചെയ്യാൻ പിഞ്ച് ചെയ്യുക', t3t:'കെട്ടിട ടൂർ', room:'മുറി', floor:'നില', gen:'… സൃഷ്ടിക്കുന്നു', genFail:'ഇപ്പോൾ ചിത്രം സൃഷ്ടിക്കാനായില്ല. അൽപം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.', cap:'നിങ്ങൾ എഡിറ്റ് ചെയ്ത പ്ലാനിൽ നിന്ന്', m2:' മീ²', m:' മീ' },
  };
  function uiLng() {
    try {
      var l = (typeof lang !== 'undefined' && lang) || localStorage.getItem('aiapp_lang') || 'ar';
      return l === 'ur' ? 'ar' : l;
    } catch (e) { return 'ar'; }
  }
  function l10nFor(l) { return l === 'ar' ? null : (L10N[l] || L10N.en); }

  var PALETTE = {
    مجلس: '#F6E4D7', صالة: '#FAF3DC', نوم: '#FCE6D2', حمام: '#DCE9F5',
    مطبخ: '#F5DDEE', كراج: '#E6E6E6', خدامة: '#EDE7DA', مسبح: '#BFE4F2',
    مكتب: '#E4EEDC', مخزن: '#EAEAEA', سلم: '#E0DCE8', ممر: '#F4F1EA',
    _افتراضي: '#F0EFEA',
  };

  function colorFor(name) {
    var n = String(name || '');
    for (var k in PALETTE) {
      if (k !== '_افتراضي' && n.indexOf(k) !== -1) return PALETTE[k];
    }
    return PALETTE._افتراضي;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** رقم بمنزلتين بلا أصفار زائدة. */
  function num(v) {
    var n = Math.round(Number(v) * 100) / 100;
    return String(n);
  }

  /**
   * توزيع الغرف على صفوف داخل عرض الأرض.
   * ليس تخطيطًا معماريًا — هو ترتيب صادق يُظهر النسب والمساحات الصحيحة.
   * البديل (ترك النموذج يرسم) يعطي شكلًا أجمل بأرقام مخترعة.
   */
  function packRooms(rooms, plotWidth) {
    var rows = [];
    var row = { items: [], w: 0, h: 0 };
    rooms.forEach(function (r) {
      if (row.items.length && row.w + r.w > plotWidth + 0.001) {
        rows.push(row);
        row = { items: [], w: 0, h: 0 };
      }
      row.items.push(r);
      row.w += r.w;
      row.h = Math.max(row.h, r.h);
    });
    if (row.items.length) rows.push(row);

    var y = 0;
    rows.forEach(function (rw) {
      var x = 0;
      rw.items.forEach(function (r) { r._x = x; r._y = y; x += r.w; });
      rw._y = y; rw._h = rw.h;
      y += rw.h;
    });
    return { rows: rows, depth: y };
  }

  function normalizeFloor(floor, plotWidth) {
    var rooms = (floor.rooms || [])
      .map(function (r) {
        var w = Math.max(1, Number(r.w) || 0);
        var h = Math.max(1, Number(r.h) || 0);
        return { name: String(r.name || 'غرفة'), w: w, h: h, area: Math.round(w * h * 10) / 10 };
      })
      .filter(function (r) { return r.w > 0 && r.h > 0; });
    // غرفة أعرض من الأرض تُقلَّص بدل أن تخرج عن الإطار
    rooms.forEach(function (r) { if (r.w > plotWidth) { r.w = plotWidth; r.area = Math.round(r.w * r.h * 10) / 10; } });
    return rooms;
  }

  function renderFloor(floor, plotWidth, index) {
    var rooms = normalizeFloor(floor, plotWidth);
    if (!rooms.length) return { svg: '', total: 0, rooms: [] };
    var packed = packRooms(rooms, plotWidth);
    var depth = packed.depth;

    var W = plotWidth * M + PAD * 2;
    var H = depth * M + PAD * 2 + 34;
    var total = rooms.reduce(function (s, r) { return s + r.area; }, 0);

    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Math.round(W) + ' ' + Math.round(H) +
      '" style="width:100%;height:auto;background:#fff;font-family:Tajawal,Arial,sans-serif" direction="rtl">');
    out.push('<rect width="100%" height="100%" fill="#fff"/>');

    // الجدار الخارجي
    out.push('<rect x="' + PAD + '" y="' + PAD + '" width="' + (plotWidth * M) + '" height="' + (depth * M) +
      '" fill="none" stroke="#333" stroke-width="' + (WALL + 2) + '"/>');

    rooms.forEach(function (r) {
      var x = PAD + r._x * M, y = PAD + r._y * M, w = r.w * M, h = r.h * M;
      out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
        '" fill="' + colorFor(r.name) + '" stroke="#4a4a4a" stroke-width="' + WALL + '"/>');
      var cx = x + w / 2, cy = y + h / 2;
      var fs = Math.max(10, Math.min(15, Math.round(Math.min(w, h) / 5)));
      out.push('<text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" font-size="' + fs +
        '" font-weight="700" fill="#222">' + esc(r.name) + '</text>');
      // المساحة محسوبة من الأبعاد — لا يمكن أن تخالف الرسم
      out.push('<text x="' + cx + '" y="' + (cy + fs + 1) + '" text-anchor="middle" font-size="' + (fs - 1) +
        '" fill="#444">' + num(r.area) + ' م²</text>');
      out.push('<text x="' + cx + '" y="' + (cy + fs * 2 + 1) + '" text-anchor="middle" font-size="' + (fs - 3) +
        '" fill="#888">' + num(r.w) + '×' + num(r.h) + '</text>');
    });

    // أبعاد الأرض
    var yb = PAD + depth * M + 22;
    out.push('<line x1="' + PAD + '" y1="' + yb + '" x2="' + (PAD + plotWidth * M) + '" y2="' + yb + '" stroke="#666" stroke-width="1"/>');
    out.push('<text x="' + (PAD + plotWidth * M / 2) + '" y="' + (yb - 5) + '" text-anchor="middle" font-size="12" fill="#555">' + num(plotWidth) + ' م</text>');
    var xl = PAD - 22;
    out.push('<line x1="' + xl + '" y1="' + PAD + '" x2="' + xl + '" y2="' + (PAD + depth * M) + '" stroke="#666" stroke-width="1"/>');
    out.push('<text x="' + xl + '" y="' + (PAD + depth * M / 2) + '" text-anchor="middle" font-size="12" fill="#555" transform="rotate(-90 ' + xl + ' ' + (PAD + depth * M / 2) + ')">' + num(depth) + ' م</text>');

    out.push('<text x="' + (W / 2) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#222">' +
      esc(floor.name || ('الطابق ' + (index + 1))) + ' — ' + num(Math.round(total * 10) / 10) + ' م²</text>');
    out.push('</svg>');

    return { svg: out.join(''), total: Math.round(total * 10) / 10, rooms: rooms, depth: depth };
  }


  var CSS = [
    'body{font-family:Tajawal,Arial,sans-serif;margin:0;padding:14px;background:#fafafa;color:#222;line-height:1.7;-webkit-user-select:none;user-select:none}',
    'header{text-align:center;margin:0 0 12px}h1{margin:0;font-size:20px}',
    '.sub{color:#777;font-size:13px}.tot{margin-top:6px;font-size:15px}',
    '.tabs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:0 0 10px}',
    '.tab{font:inherit;font-size:13px;padding:6px 13px;border-radius:8px;border:1px solid #d5d5d5;background:#fff;cursor:pointer}',
    '.tab.on{background:#2E9E6B;border-color:#2E9E6B;color:#fff}',
    '.meta{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;font-size:13px;color:#666;margin:0 0 10px}',
    '.stageWrap{overflow:auto;display:flex;justify-content:center;padding:10px 0}',
    '#stage{position:relative;background:#fff;border:3px solid #333;touch-action:none}',
    '.rx{position:absolute;top:1px;inset-inline-end:3px;width:18px;height:18px;line-height:18px;text-align:center;border-radius:50%;background:rgba(255,255,255,.85);color:#b42318;font-size:12px;font-weight:800;cursor:pointer;z-index:3}' +
    '.room{touch-action:none;position:absolute;border:2px solid #4a4a4a;box-sizing:border-box;display:flex;flex-direction:column;',
    ' align-items:center;justify-content:center;overflow:hidden;cursor:grab;touch-action:none}',
    '.room.sel{border-color:#2E9E6B;border-width:3px;box-shadow:inset 0 0 0 2px rgba(46,158,107,.25)}',
    '.room.clash{border-color:#c0453f;border-style:dashed}',
    '.rn{font-size:12px;font-weight:700;text-align:center;padding:0 3px;line-height:1.25}',
    '.ra{font-size:11px;color:#444}.rd{font-size:10px;color:#999}',
    '.grip{position:absolute;inset-inline-start:0;bottom:0;width:16px;height:16px;background:#2E9E6B;',
    ' border-radius:0 4px 0 0;cursor:nwse-resize;opacity:.75}',
    '.bar{display:flex;gap:8px;justify-content:center;margin:8px 0}',
    '.bar button{font:inherit;font-size:14px;padding:8px 14px;border-radius:9px;border:1px solid #cfcfcf;background:#fff;cursor:pointer}',
    '.panel{background:#fff;border:1px solid #e6e6e6;border-radius:12px;padding:12px;margin:8px 0;min-height:52px}',
    '.hint{color:#888;font-size:13px;text-align:center}',
    '.row{display:flex;align-items:center;gap:10px;margin:0 0 8px}',
    '.row label{width:78px;font-size:13px;color:#555}',
    '.row input{flex:1;font:inherit;font-size:14px;padding:7px 9px;border:1px solid #d5d5d5;border-radius:8px;-webkit-user-select:text;user-select:text}',
    '.row .area{flex:1;font-size:14px}',
    '.danger{font:inherit;font-size:13px;padding:7px 13px;border-radius:8px;border:1px solid #e0b4b1;background:#fff;color:#a33;cursor:pointer}',
    '.vlabel{margin:18px 0 6px;font-size:14px;font-weight:700}',
    '.views{display:flex;gap:8px;flex-wrap:wrap}',
    '.ov-btn{font:inherit;font-size:14px;padding:9px 15px;border-radius:9px;border:1px solid #cfcfcf;background:#fff;cursor:pointer}',
    '.ov-btn[disabled]{opacity:.55;cursor:default}',
    '.note{margin:16px 0 0;padding:11px 14px;background:#FFF6E5;border-radius:8px;font-size:13px;color:#6b5320}'
  ].join('');

  var EDITOR_CLIENT = '/* عميل المحرّر — يعمل داخل صفحة المعاينة (iframe).\n *\n * لماذا محرّر لا رسم ثابت:\n * الترتيب الآلي يرصّ الغرف في صفوف — نِسَب صحيحة ومساحات صحيحة، لكنه ليس\n * توزيعًا معماريًا. والمستخدم يعرف بيته أكثر من أي نموذج: أين يريد المجلس،\n * وأي غرفة على الشارع. فالنموذج يعطي البداية، وهو يضبط.\n *\n * والمساحة تبقى محسوبة في كل لحظة — تُعاد من العرض×الطول بعد كل سحب أو\n * تغيير مقاس. لا يمكن أن يظهر رقم لا يطابق الشكل.\n *\n * pointer events لا mouse: أغلب المستخدمين على الجوال.\n */\n(function () {\n  \'use strict\';\n\n  var SNAP = 0.25;                       // متر\n  var spec = window.__omranSpec || { floors: [] };\n  var LT = window.__omranL10n || null;\n  function T2(k, arv) { return (LT && LT[k]) || arv; }\n  function rn2(n) { if (!LT || !LT.roomEn) return String(n || \'\'); n = String(n || \'\'); for (var k in LT.roomEn) { if (n.indexOf(k) !== -1) return LT.roomEn[k]; } return n; }\n  var M = 30;                            // بكسل لكل متر (يُعاد حسابه للجوال)\n  var active = 0;                        // الطابق المعروض\n  var selected = null;\n\n  var PALETTE = {\n    مجلس: \'#F6E4D7\', صالة: \'#FAF3DC\', نوم: \'#FCE6D2\', حمام: \'#DCE9F5\',\n    مطبخ: \'#F5DDEE\', كراج: \'#E6E6E6\', خدامة: \'#EDE7DA\', مسبح: \'#BFE4F2\',\n    مكتب: \'#E4EEDC\', مخزن: \'#EAEAEA\', سلم: \'#E0DCE8\',\n  };\n  function colorFor(n) {\n    n = String(n || \'\');\n    for (var k in PALETTE) if (n.indexOf(k) !== -1) return PALETTE[k];\n    return \'#F0EFEA\';\n  }\n  function snap(v) { return Math.max(SNAP, Math.round(v / SNAP) * SNAP); }\n  function fmt(v) { return String(Math.round(v * 100) / 100); }\n\n  /* أول تحميل: نوزّع الغرف صفوفًا كبداية، ثم يعدّل المستخدم. */\n  function seedPositions() {\n    var pw = Number(spec.plotWidth) || 15;\n    (spec.floors || []).forEach(function (f) {\n      var x = 0, y = 0, rowH = 0;\n      (f.rooms || []).forEach(function (r) {\n        r.w = Number(r.w) || 3; r.h = Number(r.h) || 3;\n        if (typeof r.x === \'number\' && typeof r.y === \'number\') return;\n        if (x + r.w > pw + 0.01) { x = 0; y += rowH; rowH = 0; }\n        r.x = x; r.y = y; x += r.w; rowH = Math.max(rowH, r.h);\n      });\n    });\n  }\n\n  function floorDepth(f) {\n    return (f.rooms || []).reduce(function (m, r) { return Math.max(m, (r.y || 0) + r.h); }, 0);\n  }\n  function floorArea(f) {\n    return (f.rooms || []).reduce(function (s, r) { return s + r.w * r.h; }, 0);\n  }\n\n  /* تداخل الغرف — لا نمنعه (قد يريد المستخدم غرفة داخل أخرى مؤقتًا) لكن نُظهره. */\n  function overlaps(f, room) {\n    return (f.rooms || []).some(function (o) {\n      if (o === room) return false;\n      return room.x < o.x + o.w - 0.01 && o.x < room.x + room.w - 0.01 &&\n             room.y < o.y + o.h - 0.01 && o.y < room.y + room.h - 0.01;\n    });\n  }\n\n  var $ = function (id) { return document.getElementById(id); };\n\n  function render() {\n    var f = spec.floors[active];\n    if (!f) return;\n    var pw = Number(spec.plotWidth) || 15;\n    var avail = Math.min(document.body.clientWidth - 28, 900);\n    M = Math.max(14, Math.floor(avail / pw));\n    var depth = Math.max(floorDepth(f), 4);\n\n    var stage = $(\'stage\');\n    stage.style.width = (pw * M) + \'px\';\n    stage.style.height = (depth * M) + \'px\';\n    stage.innerHTML = \'\';\n\n    (f.rooms || []).forEach(function (r, i) {\n      var el = document.createElement(\'div\');\n      el.className = \'room\' + (selected === r ? \' sel\' : \'\') + (overlaps(f, r) ? \' clash\' : \'\');\n      el.style.cssText = \'left:\' + (r.x * M) + \'px;top:\' + (r.y * M) + \'px;width:\' + (r.w * M) +\n        \'px;height:\' + (r.h * M) + \'px;background:\' + colorFor(r.name);\n      el.dataset.i = i;\n      el.innerHTML =\n        \'<div class="rn">\' + rn2(r.name).replace(/</g, \'&lt;\') + \'</div>\' +\n        \'<div class="ra">\' + fmt(r.w * r.h) + T2(\'m2\', \' م²\') + \'</div>\' +\n        \'<div class="rd">\' + fmt(r.w) + \'×\' + fmt(r.h) + \'</div>\' +\n        \'<div class="grip" data-grip="1"></div>\' +\n        \'<div class="rx" data-del="1" title="\' + T2(\'del\', \'حذف\') + \'">✕</div>\';\n      stage.appendChild(el);\n    });\n\n    $(\'total\').textContent = fmt(floorArea(f)) + T2(\'m2\', \' م²\');\n    $(\'depth\').textContent = fmt(depth) + T2(\'m\', \' م\');\n    $(\'pw\').textContent = fmt(pw) + T2(\'m\', \' م\');\n    var grand = (spec.floors || []).reduce(function (s, x) { return s + floorArea(x); }, 0);\n    $(\'grand\').textContent = fmt(grand) + T2(\'m2\', \' م²\');\n    renderTabs();\n    renderPanel();\n  }\n\n  function renderTabs() {\n    var t = $(\'tabs\');\n    t.innerHTML = (spec.floors || []).map(function (f, i) {\n      return \'<button class="tab\' + (i === active ? \' on\' : \'\') + \'" data-f="\' + i + \'">\' +\n        String((LT && f.name && f.name.indexOf(\'طابق \') === 0) ? (T2(\'floor\', \'طابق\') + \' \' + f.name.slice(5)) : (f.name || (T2(\'floor\', \'طابق\') + \' \' + (i + 1)))).replace(/</g, \'&lt;\') + \'</button>\';\n    }).join(\'\');\n  }\n\n  function renderPanel() {\n    var p = $(\'panel\');\n    if (!selected) { p.innerHTML = \'<div class="hint">\' + T2(\'hint\', \'اضغط على أي غرفة لتغيير اسمها أو مقاسها · اسحبها لتحريكها · اسحب الزاوية لتكبيرها\') + \'</div>\'; return; }\n    p.innerHTML =\n      \'<div class="row"><label>\' + T2(\'nm\', \'الاسم\') + \'</label><input id="fName" value="\' + String(selected.name).replace(/"/g, \'&quot;\') + \'"></div>\' +\n      \'<div class="row"><label>\' + T2(\'w\', \'العرض (م)\') + \'</label><input id="fW" type="number" step="0.25" min="0.5" value="\' + fmt(selected.w) + \'"></div>\' +\n      \'<div class="row"><label>\' + T2(\'h\', \'الطول (م)\') + \'</label><input id="fH" type="number" step="0.25" min="0.5" value="\' + fmt(selected.h) + \'"></div>\' +\n      \'<div class="row"><span class="area">\' + T2(\'area\', \'المساحة\') + \': <b>\' + fmt(selected.w * selected.h) + T2(\'m2\', \' م²\') + \'</b></span>\' +\n      \'<button id="fDel" class="danger">\' + T2(\'del\', \'حذف\') + \'</button></div>\';\n\n    [\'fName\', \'fW\', \'fH\'].forEach(function (id) {\n      var el = $(id);\n      el.oninput = function () {\n        if (!selected) return;\n        if (id === \'fName\') selected.name = el.value || T2(\'room\', \'غرفة\');\n        else {\n          var v = parseFloat(el.value);\n          if (!isFinite(v) || v <= 0) return;\n          if (id === \'fW\') selected.w = v; else selected.h = v;\n        }\n        var keep = selected;\n        render();\n        selected = keep;\n        try { $(id).focus(); } catch (e) { /* أُعيد الرسم */ }\n      };\n    });\n    $(\'fDel\').onclick = function () {\n      var f = spec.floors[active];\n      f.rooms = f.rooms.filter(function (r) { return r !== selected; });\n      selected = null; render();\n    };\n  }\n\n  /* ───────── السحب وتغيير المقاس ───────── */\n  var drag = null;\n\n  function onDown(e) {\n    var el = e.target.closest ? e.target.closest(\'.room\') : null;\n    if (!el) { selected = null; render(); return; }\n    var f = spec.floors[active];\n    var r = f.rooms[+el.dataset.i];\n    if (e.target.dataset && e.target.dataset.del) { f.rooms = f.rooms.filter(function (x) { return x !== r; }); selected = null; render(); e.preventDefault(); return; } /* v-plan-delete: ✕ على الغرفة يحذفها مباشرة */\n    selected = r;\n    var isGrip = e.target.dataset && e.target.dataset.grip;\n    drag = {\n      room: r, mode: isGrip ? \'size\' : \'move\',\n      px: e.clientX, py: e.clientY,\n      ox: r.x, oy: r.y, ow: r.w, oh: r.h,\n    };\n    el.setPointerCapture && el.setPointerCapture(e.pointerId);\n    render();\n    e.preventDefault();\n  }\n\n  function onMove(e) {\n    if (!drag) return;\n    var dx = (e.clientX - drag.px) / M, dy = (e.clientY - drag.py) / M;\n    // v-plan-drag: الغرف موضوعة بـleft/top مطلقين فالسحب يمينًا = زيادة x دائمًا (كان يُعكس في RTL فتتحرك الغرفة عكس الإصبع)\n    var pw = Number(spec.plotWidth) || 15;\n    if (drag.mode === \'move\') {\n      drag.room.x = Math.max(0, Math.min(pw - drag.room.w, snap(drag.ox + dx)));\n      drag.room.y = Math.max(0, snap(drag.oy + dy));\n    } else {\n      drag.room.w = Math.max(0.5, Math.min(pw - drag.room.x, snap(drag.ow + dx)));\n      drag.room.h = Math.max(0.5, snap(drag.oh + dy));\n    }\n    render();\n    e.preventDefault();\n  }\n\n  function onUp() { drag = null; }\n\n  function addRoom() {\n    var f = spec.floors[active];\n    f.rooms = f.rooms || [];\n    var r = { name: T2(\'room\', \'غرفة\'), w: 4, h: 3.5, x: 0, y: floorDepth(f) };\n    f.rooms.push(r); selected = r; render();\n  }\n\n  function addFloor() {\n    spec.floors.push({ name: T2(\'floor\', \'طابق\') + \' \' + (spec.floors.length + 1), rooms: [] });\n    active = spec.floors.length - 1; selected = null; render();\n  }\n\n  /* ───────── توليد الواجهة من المخطط المُعدَّل ───────── */\n  function requestView(view, btn) {\n    var label = btn.textContent;\n    btn.disabled = true; btn.textContent = T2(\'gen\', \'… جارٍ التوليد\');\n    var id = Date.now();\n    function onMsg(e) {\n      var d = e.data;\n      if (!d || d.__omranViewOut !== 1 || d.id !== id) return;\n      window.removeEventListener(\'message\', onMsg);\n      btn.disabled = false; btn.textContent = label;\n      var out = $(\'views\');\n      if (d.ok) {\n        var fig = document.createElement(\'figure\');\n        fig.style.cssText = \'margin:12px 0\';\n        fig.innerHTML = \'<img src="\' + d.dataUrl + \'" style="width:100%;border-radius:12px;display:block">\' +\n          \'<figcaption style="font-size:12px;color:#777;margin-top:6px;text-align:center">\' +\n          label + \' — \' + T2(\'cap\', \'مولّد من المخطط كما عدّلته\') + \'</figcaption>\';\n        out.appendChild(fig);\n      } else {\n        var p = document.createElement(\'p\');\n        p.style.cssText = \'color:#a33;font-size:13px\';\n        p.textContent = \'⚠️ \' + (d.error || T2(\'genFail\', \'تعذّر التوليد\'));\n        out.appendChild(p);\n      }\n    }\n    window.addEventListener(\'message\', onMsg);\n    // نرسل المواصفات الحالية — أي بعد تعديلات المستخدم، لا الأصلية\n    parent.postMessage({ __omranView: 1, id: id, view: view, spec: spec }, \'*\');\n  }\n\n  function boot() {\n    seedPositions();\n    render();\n    var stage = $(\'stage\');\n    stage.addEventListener(\'pointerdown\', onDown);\n    /* v-drag-touch: بعض المتصفحات تخطف اللمس للتمرير رغم touch-action — نمنعها صراحة أثناء السحب */\n    stage.addEventListener(\'touchstart\', function (e) { if (e.target.closest && e.target.closest(\'.room\')) e.preventDefault(); }, { passive: false });\n    window.addEventListener(\'touchmove\', function (e) { if (drag) e.preventDefault(); }, { passive: false });\n    window.addEventListener(\'pointermove\', onMove);\n    window.addEventListener(\'pointerup\', onUp);\n    window.addEventListener(\'pointercancel\', onUp);\n    $(\'tabs\').addEventListener(\'click\', function (e) {\n      var b = e.target.closest(\'.tab\'); if (!b) return;\n      active = +b.dataset.f; selected = null; render();\n    });\n    $(\'addRoom\').onclick = addRoom;\n    $(\'addFloor\').onclick = addFloor;\n    document.querySelectorAll(\'.ov-btn\').forEach(function (b) {\n      b.onclick = function () { requestView(b.dataset.view, b); };\n    });\n    window.addEventListener(\'resize\', function () { render(); });\n  }\n\n  if (document.readyState === \'loading\') document.addEventListener(\'DOMContentLoaded\', boot);\n  else boot();\n})();\n';

  /* v-construction-3d: 🧊 «امشِ داخل بيتك قبل أن يُبنى» — جولة ثلاثية الأبعاد
   * مبنية من نفس مواصفات المخطط (أبعاد الغرف الحقيقية بالمتر، بعد تعديلات
   * المستخدم). CSS 3D خالص بلا مكتبات ولا ذكاء اصطناعي ولا رصيد: الهندسة
   * موجودة أصلًا، نرفع منها جدرانًا ونعطي دورانًا وإمالة وتكبيرًا وفصل طوابق. */
  function omranTour3d() {
    'use strict';
    var LT3 = window.__omranL10n || null;
    function T3(k, arv) { return (LT3 && LT3[k]) || arv; }
    var M = 24, WH = 3 * M;
    var yaw = -32, tilt = 62, scale = 1, exploded = false;
    var SHADE = { 0: 1, 90: 0.82, 180: 0.66, 270: 0.82 };
    var PAL = {
      مجلس: '#F6E4D7', صالة: '#FAF3DC', نوم: '#FCE6D2', حمام: '#DCE9F5',
      مطبخ: '#F5DDEE', كراج: '#E6E6E6', خدامة: '#EDE7DA', مسبح: '#BFE4F2',
      مكتب: '#E4EEDC', مخزن: '#EAEAEA', سلم: '#E0DCE8',
    };
    function colorFor(n) {
      n = String(n || '');
      for (var k in PAL) if (n.indexOf(k) !== -1) return PAL[k];
      return '#F0EFEA';
    }
    function shade(hex, f) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ',.94)';
    }
    function specDepth(f) {
      return (f.rooms || []).reduce(function (m, r) { return Math.max(m, (Number(r.y) || 0) + (Number(r.h) || 0)); }, 0);
    }
    var world = null, floorsEls = [];
    function apply() {
      if (!world) return;
      world.style.transform = 'scale(' + scale + ') rotateX(' + tilt + 'deg) rotateZ(' + yaw + 'deg)';
      floorsEls.forEach(function (el, i) {
        el.style.transform = 'translateZ(' + (i * (WH + (exploded ? WH * 0.9 : 0))) + 'px)';
      });
      world.querySelectorAll('.t3lbl').forEach(function (l) { l.style.transform = 'rotateZ(' + (-yaw) + 'deg)'; });
    }
    function build() {
      var spec = window.__omranSpec || { floors: [] };
      var pw = Number(spec.plotWidth) || 15;
      var dep = Math.max(4, (spec.floors || []).reduce(function (m, f) { return Math.max(m, specDepth(f)); }, 0));
      var ov = document.createElement('div');
      ov.id = 't3dOverlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:radial-gradient(ellipse at 50% 30%,#1c1c26,#0b0b0f);touch-action:none;overflow:hidden;font-family:inherit;';
      var bar = document.createElement('div');
      bar.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:8px;padding:12px 14px;color:#eee;';
      bar.innerHTML = '<b style="font-size:14px;">🧊 ' + String((spec.title || T3('t3t', 'جولة المبنى'))).replace(/</g, '&lt;') + '</b>'
        + '<span style="font-size:11px;opacity:.6;">' + T3('t3hint', 'اسحب للدوران · قرّب بإصبعين') + '</span>'
        + '<span style="flex:1"></span>'
        + ((spec.floors || []).length > 1 ? '<button id="t3x" class="t3b">🧨 ' + T3('t3x', 'فصل الطوابق') + '</button>' : '')
        + '<button id="t3zi" class="t3b">＋</button><button id="t3zo" class="t3b">－</button>'
        + '<button id="t3c" class="t3b" style="background:#7f1d1d;">✕</button>';
      var st = document.createElement('style');
      st.textContent = '.t3b{background:#26262f;border:1px solid #3a3a46;color:#eee;border-radius:9px;padding:7px 11px;font:inherit;font-size:12px;cursor:pointer;}';
      ov.appendChild(st); ov.appendChild(bar);
      var view = document.createElement('div');
      view.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;perspective:1700px;';
      world = document.createElement('div');
      world.style.cssText = 'position:relative;width:' + (pw * M) + 'px;height:' + (dep * M) + 'px;transform-style:preserve-3d;transition:transform .08s linear;';
      // الأرض
      var ground = document.createElement('div');
      ground.style.cssText = 'position:absolute;left:' + (-M) + 'px;top:' + (-M) + 'px;width:' + ((pw + 2) * M) + 'px;height:' + ((dep + 2) * M) + 'px;background:#20241f;border:2px solid #3a4038;border-radius:8px;transform:translateZ(-3px);';
      world.appendChild(ground);
      floorsEls = [];
      (spec.floors || []).forEach(function (f) {
        var fl = document.createElement('div');
        fl.style.cssText = 'position:absolute;inset:0;transform-style:preserve-3d;';
        (f.rooms || []).forEach(function (r) {
          var x = (Number(r.x) || 0) * M, y = (Number(r.y) || 0) * M, w = (Number(r.w) || 3) * M, h = (Number(r.h) || 3) * M;
          var col = colorFor(r.name);
          var face = document.createElement('div');
          face.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;background:' + col + ';border:1px solid #55545e;display:flex;align-items:center;justify-content:center;';
          var lbl = document.createElement('div');
          lbl.className = 't3lbl';
          lbl.style.cssText = 'font-size:11px;font-weight:700;color:#333;text-align:center;line-height:1.3;pointer-events:none;';
          var __rn3 = String(r.name || '');
          if (LT3 && LT3.roomEn) { for (var __k3 in LT3.roomEn) { if (__rn3.indexOf(__k3) !== -1) { __rn3 = LT3.roomEn[__k3]; break; } } }
          lbl.innerHTML = __rn3.replace(/</g, '&lt;') + '<br><span style="font-weight:400;font-size:10px;">' + (Math.round((Number(r.w) || 0) * (Number(r.h) || 0) * 10) / 10) + T3('m2', ' م²') + '</span>';
          face.appendChild(lbl);
          fl.appendChild(face);
          // أربعة جدران زجاجية — ترى الداخل من كل زاوية
          [[x, y, w, 0], [x + w, y, h, 90], [x + w, y + h, w, 180], [x, y + h, h, 270]].forEach(function (e2) {
            var wall = document.createElement('div');
            wall.style.cssText = 'position:absolute;left:0;top:0;width:' + e2[2] + 'px;height:' + WH + 'px;transform-origin:0 0;'
              + 'transform:translate3d(' + e2[0] + 'px,' + e2[1] + 'px,0) rotateZ(' + e2[3] + 'deg) rotateX(90deg);'
              + 'background:' + shade(col, SHADE[e2[3]] * 0.9) + ';border:1px solid rgba(60,58,70,.8);opacity:.62;';
            fl.appendChild(wall);
          });
        });
        world.appendChild(fl);
        floorsEls.push(fl);
      });
      view.appendChild(world);
      ov.appendChild(view);
      document.body.appendChild(ov);
      apply();
      // التحكم: سحب = دوران/إمالة · إصبعان = تكبير
      var ptrs = {}, lastDist = 0;
      view.addEventListener('pointerdown', function (e) { ptrs[e.pointerId] = e; view.setPointerCapture(e.pointerId); });
      view.addEventListener('pointermove', function (e) {
        if (!ptrs[e.pointerId]) return;
        var ks = Object.keys(ptrs);
        if (ks.length === 2) {
          ptrs[e.pointerId] = e;
          var a = ptrs[ks[0]], b = ptrs[ks[1]];
          var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (lastDist) scale = Math.max(0.35, Math.min(3, scale * (d / lastDist)));
          lastDist = d; apply(); return;
        }
        var p = ptrs[e.pointerId];
        yaw += (e.clientX - p.clientX) * 0.45;
        tilt = Math.max(12, Math.min(88, tilt - (e.clientY - p.clientY) * 0.3));
        ptrs[e.pointerId] = e; apply();
      });
      function up(e) { delete ptrs[e.pointerId]; lastDist = 0; }
      view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
      view.addEventListener('wheel', function (e) { scale = Math.max(0.35, Math.min(3, scale * (e.deltaY < 0 ? 1.12 : 0.89))); apply(); e.preventDefault(); }, { passive: false });
      var g = function (id) { return document.getElementById(id); };
      if (g('t3x')) g('t3x').onclick = function () { exploded = !exploded; apply(); };
      g('t3zi').onclick = function () { scale = Math.min(3, scale * 1.2); apply(); };
      g('t3zo').onclick = function () { scale = Math.max(0.35, scale / 1.2); apply(); };
      g('t3c').onclick = function () { ov.remove(); world = null; };
    }
    function mount() {
      var row = document.querySelector('.views');
      if (!row || document.getElementById('t3dBtn')) return;
      var b = document.createElement('button');
      b.id = 't3dBtn';
      b.className = 'ov-btn';
      b.textContent = '🧊 ' + T3('t3', 'جولة 3D');
      b.style.cssText = 'background:linear-gradient(135deg,#b8860b,#8a6a1a);color:#fff;border-color:#d4af37;';
      b.onclick = function (e) { e.stopPropagation(); build(); };
      row.insertBefore(b, row.firstChild);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }

  /** يبني صفحة المحرّر التفاعلي من مواصفات المبنى. */
  function renderPlan(spec) {
    var title = esc((spec && spec.title) || 'مخطط');
    var style = spec && spec.style ? '<div class="sub">' + esc(spec.style) + '</div>' : '';
    var specJson = JSON.stringify(spec || {}).replace(/</g, '\\u003c');
    /* v-cons-i18n: الصفحة بلغة التطبيق — ar/ur عربي وإلا الجدول ثم الإنجليزية */
    var lng = uiLng();
    var T = l10nFor(lng);
    function tt(k, arv) { return (T && T[k]) || arv; }
    var dirAttr = T ? 'ltr' : 'rtl';
    var l10nJson = T ? JSON.stringify(Object.assign({ roomEn: ROOM_EN }, T)).replace(/</g, '\\u003c') : 'null';

    return '<!doctype html><html dir="' + dirAttr + '" lang="' + esc(lng) + '"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
      '<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">' +
      '<style>' + CSS + '</style></head><body>' +
      '<header><h1>' + title + '</h1>' + style +
        '<div class="tot">' + tt('tot', 'إجمالي البناء') + ': <b id="grand">—</b></div></header>' +
      '<div id="tabs" class="tabs"></div>' +
      '<div class="meta"><span>' + tt('pw', 'عرض الأرض') + ': <b id="pw">—</b></span><span>' + tt('dp', 'عمق البناء') + ': <b id="depth">—</b></span>' +
        '<span>' + tt('fa', 'مساحة الطابق') + ': <b id="total">—</b></span></div>' +
      '<div class="stageWrap"><div id="stage"></div></div>' +
      '<div class="bar"><button id="addRoom">' + tt('addR', '＋ غرفة') + '</button><button id="addFloor">' + tt('addF', '＋ طابق') + '</button></div>' +
      '<div id="panel" class="panel"></div>' +
      '<div class="vlabel">' + tt('views', 'صور المشروع') + '</div>' +
      '<div class="views">' +
        '<button class="ov-btn" data-view="exterior">🏠 ' + tt('day', 'نهارًا') + '</button>' +
        '<button class="ov-btn" data-view="dusk">🌆 ' + tt('dusk', 'مغربًا') + '</button>' +
        '<button class="ov-btn" data-view="aerial">🚁 ' + tt('air', 'من فوق') + '</button>' +
        '<button class="ov-btn" data-view="entrance">🚪 ' + tt('ent', 'المدخل') + '</button>' +
        '<button class="ov-btn" data-view="majlis">🛋️ ' + tt('maj', 'المجلس') + '</button>' +
        '<button class="ov-btn" data-view="living">🪑 ' + tt('liv', 'الصالة') + '</button>' +
      '</div>' +
      '<div id="views"></div>' +
      '<p class="note">' + tt('note', 'المساحات تُحسب من المقاسات لحظيًا. مخطط تصوّري — التنفيذ يتطلب مكتبًا هندسيًا معتمدًا وموافقة البلدية.') + '</p>' +
      '<script>window.__omranSpec=' + specJson + ';window.__omranL10n=' + l10nJson + ';<' + '/script>' +
      '<script>' + EDITOR_CLIENT + '<' + '/script>' +
      /* v-construction-3d: مشغّل الجولة يُحقن كدالة — بلا هروب نصي هش */
      '<script>(' + omranTour3d.toString() + ')();<' + '/script>' +
      '</body></html>';
  }

  /** يستخرج مواصفات المبنى من رد النموذج. */
  function extractSpec(text) {
    var s = String(text || '');
    var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    var raw = m ? m[1] : s;
    var a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
      var spec = JSON.parse(raw.slice(a, b + 1));
      if (!spec || !Array.isArray(spec.floors) || !spec.floors.length) return null;
      return spec;
    } catch (e) { return null; }
  }

  var PROMPT = [
    'أنت مهندس معماري. حوّل طلب المستخدم إلى مواصفات مبنى بصيغة JSON فقط،',
    'بلا أي نص خارجها وبلا أسوار كود.',
    '',
    '{"title":"اسم المشروع","style":"الطراز","plotWidth":العرض بالمتر,',
    ' "floors":[{"name":"الطابق الأرضي","rooms":[{"name":"مجلس","w":6,"h":5}]}]}',
    '',
    'قواعد إلزامية:',
    '- w و h بالمتر، أرقام واقعية: مجلس 5-8م، نوم 3.5-5م، حمام 1.8-2.5م، مطبخ 3-5م.',
    '- ممنوع كتابة المساحة — التطبيق يحسبها من w×h. أي رقم مساحة تكتبه يُتجاهل.',
    '- مجموع عرض غرف كل صف يجب ألا يتجاوز plotWidth.',
    '- إن طلب المستخدم مساحة إجمالية، وزّع الغرف لتقاربها.',
    '- الأسماء بالعربية: مجلس، صالة، غرفة نوم، حمام، مطبخ، كراج، غرفة خدامة، مسبح، مكتب، مخزن، سلم.',
    '- راعِ العادات الخليجية: مجلس رجال منفصل بمدخله، ومطبخ داخلي وخارجي إن كانت المساحة تسمح.',
  ].join('\n');

  window.omranFloorplan = { renderPlan: renderPlan, extractSpec: extractSpec, PROMPT: PROMPT, renderFloor: renderFloor, uiLng: uiLng, l10nFor: l10nFor };
})();

/* ───────── الواجهة من نفس المواصفات ─────────
 *
 * هذه هي التي تحلّ مشكلتك الأصلية: كان المخطط والواجهة يُولَّدان مستقلَّين،
 * فتخرج واجهة بطابق واحد ومخطط بطابقين، أو كراج لسيارتين مقابل ثلاث.
 *
 * الآن الوصف يُشتقّ من ملف المواصفات نفسه — تُعدّ الطوابق وتُحسب سعة الكراج
 * من مساحته ويُقرأ وجود المسبح من الغرف. فلا يمكن أن يختلف العدد.
 *
 * ولا يُترجَم الوصف من العربية: نبنيه بالإنجليزية مباشرة من الأرقام، لأن
 * الترجمة تضيع الأعداد وهي بالضبط ما يجب أن يتطابق.
 */
(function () {
  'use strict';
  var FP = window.omranFloorplan;
  if (!FP) return;

  // مواد محدّدة بالاسم لا أوصاف عامة. «فخم» لا تعني شيئًا لنموذج الصور،
  // أما «travertine» و«board-formed concrete» فتعني ملمسًا ولونًا بعينه.
  var STYLE_EN = {
    // مستخرج من عرض معماري اختاره صاحب التطبيق مرجعًا. مكتوب بالمواد لا
    // بالانطباع: «فخم» لا تعني شيئًا لنموذج الصور، أما honed limestone فتعني
    // حجرًا مصقولًا غير لامع بلون بعينه.
    'سني عصري': 'contemporary Gulf (Khaleeji) villa — cream honed limestone cladding in large-format panels with fine joints, a thick flat roof slab with a deep cantilevered overhang casting a strong horizontal shadow, horizontal timber slat soffit under the overhang and a matching timber pergola, full-height sliding glazing with slim dark-grey aluminium frames, a shaded outdoor kitchen with stone counter and built-in grill beside a long dining table, pale travertine paving',
    'عصري': 'modern minimalist architecture — crisp intersecting white render and grey basalt volumes, flat roof with a thin fascia, floor-to-ceiling frameless glazing, concealed gutters, no ornament',
    'كلاسيك': 'classical architecture — symmetrical composition, cream limestone ashlar, engaged Corinthian columns, deep moulded cornice, arched openings with carved keystones, wrought-iron balustrades',
    'إسلامي': 'traditional Islamic architecture — pointed and horseshoe arches, carved gypsum (juss) panels, turquoise and cobalt glazed tilework, geometric mashrabiya lattice, a shaded arcaded loggia',
    'نجدي': 'Najdi heritage architecture — thick adobe-toned rendered walls, small deep-set windows, triangular pierced parapet motifs, exposed tamarisk beams, earth-tone palette',
    'حديث': 'contemporary architecture — bold cantilevers, mixed grey stone and warm timber cladding, board-formed concrete accents, floor-to-ceiling glass with slim mullions',
  };

  function styleEn(style) {
    var s = String(style || '');
    for (var k in STYLE_EN) if (s.indexOf(k) !== -1) return STYLE_EN[k];
    return s ? (s + ' architectural style') : STYLE_EN['عصري'];
  }

  /** يستخرج الحقائق القابلة للعدّ — وهي ما يقارنه المستخدم بالمخطط. */
  function factsFrom(spec) {
    var floors = (spec && spec.floors) || [];
    var all = [];
    floors.forEach(function (f) { (f.rooms || []).forEach(function (r) { all.push(r); }); });

    function find(word) { return all.filter(function (r) { return String(r.name || '').indexOf(word) !== -1; }); }

    var garages = find('كراج');
    var garageArea = garages.reduce(function (s, r) { return s + (Number(r.w) || 0) * (Number(r.h) || 0); }, 0);
    // ~15 م² لكل سيارة (2.5×6 مع حركة)
    var cars = garageArea ? Math.max(1, Math.round(garageArea / 15)) : 0;

    var total = 0;
    floors.forEach(function (f) {
      (f.rooms || []).forEach(function (r) { total += (Number(r.w) || 0) * (Number(r.h) || 0); });
    });

    return {
      floors: floors.length,
      bedrooms: find('نوم').length,
      majlis: find('مجلس').length > 0,
      pool: find('مسبح').length > 0 || find('سباحة').length > 0,
      cars: cars,
      total: Math.round(total),
      width: Number(spec && spec.plotWidth) || 0,
    };
  }

  function floorsPhrase(n) {
    if (n <= 1) return 'a SINGLE-STOREY house (ground floor only, exactly one level, no upper floor)';
    if (n === 2) return 'a TWO-STOREY house (exactly two levels: ground + first floor, flat roof, no third level)';
    return 'a ' + n + '-STOREY house (exactly ' + n + ' levels)';
  }

  /* المشهد: زاوية الكاميرا والإضاءة. نموذج الصور يعطي نتيجة مختلفة تمامًا
     بحسب هذين، وتركهما للصدفة هو الفرق بين «عرض معماري» و«صورة بيت». */
  var SCENES = {
    exterior: {
      camera: '24mm wide-angle lens at eye level (1.6 m above ground), three-quarter view from the front-left corner of the plot, two-point perspective with vertical lines kept perfectly parallel — no fisheye, no tilted horizon',
      light: 'late-afternoon golden hour, warm low sun raking from the left, long soft shadows across the facade, clear sky with a faint haze near the horizon',
    },
    dusk: {
      camera: '24mm wide-angle lens at eye level, three-quarter view, vertical lines parallel',
      light: 'blue-hour dusk just after sunset, deep blue sky, warm interior lights glowing through the glazing, concealed cove lighting washing the walls, subtle pool illumination',
    },
    aerial: {
      camera: '35mm lens from a drone at about 25 metres altitude, 40-degree downward angle showing the roof, courtyard and plot boundaries together',
      light: 'mid-morning sun, crisp shadows, clear sky',
    },
    entrance: {
      camera: '35mm lens at eye level, straight-on view of the main entrance from 6 metres away',
      light: 'soft overcast daylight, even illumination showing material texture clearly',
    },
  };

  var QUALITY = 'Photorealistic architectural render, V-Ray quality, physically based materials, accurate glass reflections, realistic ambient occlusion, 8K sharpness.';

  // ما يفسد العروض المعمارية عادةً — نمنعه صراحةً
  var NEGATIVE = 'No text, signage, logos or watermarks. No people. No cars outside the garage. No distorted geometry, no fisheye, no floor-plan overlay.';

  /**
   * يبني وصف الواجهة أو الداخل.
   * view: exterior | dusk | aerial | entrance | majlis | living
   */
  function facadePrompt(spec, view) {
    var f = factsFrom(spec);

    if (view === 'majlis' || view === 'living') {
      var isMajlis = view === 'majlis';
      var room = spec && spec.floors && spec.floors[0] && (spec.floors[0].rooms || [])
        .filter(function (r) { return String(r.name).indexOf(isMajlis ? 'مجلس' : 'صالة') !== -1; })[0];
      var dims = room ? (' approximately ' + room.w + ' by ' + room.h + ' metres') : '';
      return [
        'Interior view of ' + (isMajlis ? 'a formal Gulf majlis (men\'s reception room)' : 'the main family living room') +
          ' in a Gulf villa,' + dims + '.',
        'Style: ' + styleEn(spec && spec.style) + '.',
        isMajlis
          ? 'Low upholstered seating running continuously along three walls, a large hand-knotted Persian carpet, a low brass coffee service table with dallah and finjan cups, carved timber ceiling detail, tall curtained windows, warm indirect cove lighting.'
          : 'Contemporary modular sofas around a low table, an adjoining dining area, full-height sliding glazing opening to the garden, layered neutral palette with warm timber accents, soft daylight from the left.',
        '35mm lens at seated eye level (1.2 m), one-point perspective, vertical lines parallel.',
        QUALITY,
        NEGATIVE,
      ].join(' ');
    }

    var scene = SCENES[view] || SCENES.exterior;
    var parts = [];

    // ← الحقائق القابلة للعدّ أولًا: هي ما يقارنه المستخدم بالمخطط
    // الضمانة في المقدمة لا النهاية: أي قصّ مستقبلي يقطع من الآخر، فلو بقيت
    // في الذيل لكانت أول ما يُحذف — وهي بالضبط ما يضمن التطابق مع المخطط.
    parts.push('STRICT: the floor count and garage bay count below are fixed — the client already has the matching floor plan.');
    parts.push('Private villa: ' + floorsPhrase(f.floors) + '.');
    parts.push('Built-up area approximately ' + f.total + ' square metres' +
      (f.width ? ', plot frontage about ' + f.width + ' metres' : '') + '.');
    parts.push('Architecture: ' + styleEn(spec && spec.style) + '.');
    if (f.cars) {
      parts.push('An attached covered garage with EXACTLY ' + f.cars + ' bay' + (f.cars > 1 ? 's' : '') +
        ' (' + (f.cars > 1 ? f.cars + ' cars side by side' : 'one car') + '), set slightly back from the main facade.');
    }
    if (f.pool) parts.push('A rectangular swimming pool in the courtyard with a pale stone deck, two loungers and a shaded pergola.');
    if (f.majlis) parts.push('A distinct majlis wing with its own separate street entrance, visually set apart from the family entrance.');
    parts.push('Surroundings: low matching-stone boundary wall, mature date palms, desert planting (bougainvillea, agave), interlocking stone driveway.');
    parts.push('Camera: ' + scene.camera + '.');
    parts.push('Lighting: ' + scene.light + '.');
    parts.push(QUALITY);
    parts.push(NEGATIVE);

    return parts.join(' ');
  }

  FP.facadePrompt = facadePrompt;
  FP.factsFrom = factsFrom;
})();

/* ───────── التكامل: زر المقاولات + جسر توليد الصور ─────────
 *
 * المحرّر يعيش داخل iframe المعاينة ولا يملك مفاتيح ولا توكن — فأزرار
 * «الشكل الخارجي/المجلس/الصالة» ترسل رسالة للتطبيق الأم، وهو الذي يبني
 * الوصف من المخطط الفعلي (بعد تعديل المستخدم) ويولّد الصورة ويعيدها.
 */
(function () {
  'use strict';
  var FP = window.omranFloorplan;
  if (!FP) return;

  /* ① جسر توليد الواجهات: {__omranView, id, view, spec} ← المحرّر */
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.__omranView !== 1 || !e.source) return;
    var src = e.source;
    function reply(msg) {
      msg.__omranViewOut = 1; msg.id = d.id;
      try { src.postMessage(msg, '*'); } catch (err) { __swallow(err, 'floorplan:bridge#reply'); }
    }
    var prompt;
    try { prompt = FP.facadePrompt(d.spec || {}, d.view); }
    catch (err) { reply({ ok: false, error: 'تعذر بناء الوصف من المخطط' }); return; }
    fetch('/api/maha-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt, architectural: true,
        token: authGet('aiapp_auth_token'), guestId: window.getGuestId(),
      }),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok && data.imageBase64) {
          reply({ ok: true, dataUrl: 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64 });
        } else {
          /* v-view-err: مرّر سبب الخادم الحقيقي — والفارغ يعرضه المحرر بلغة التطبيق */
          reply({ ok: false, error: (data && (data.message_ar || data.error)) || '' });
        }
      });
    }).catch(function () {
      reply({ ok: false, error: '' });
    });
  });

  /* ② زر «📐 محرّر المخططات» داخل نافذة المقاولات */
  var btn = document.getElementById('constructionEditorBtn');
  if (!btn) return;

  function statusMsg(txt) {
    var el = document.getElementById('constructionStatus');
    if (!el) return;
    el.style.display = txt ? 'block' : 'none';
    el.textContent = txt || '';
  }

  /* وصف المشروع من حقول النافذة نفسها — لا نسأل المستخدم من جديد */
  function buildDescription() {
    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    function selTxt(id) {
      var el = document.getElementById(id);
      return (el && el.selectedOptions && el.selectedOptions[0]) ? el.selectedOptions[0].textContent.trim() : '';
    }
    var annexes = [];
    document.querySelectorAll('.constructionAnnex:checked').forEach(function (c) {
      var sp = c.parentElement && c.parentElement.querySelector('span');
      annexes.push(sp ? sp.textContent.trim() : c.value);
    });
    var notes = (val('constructionNotes') || '').trim();
    return [
      'النوع: ' + (selTxt('constructionType') || 'فيلا سكنية'),
      'عدد الطوابق: ' + (val('constructionFloors') || '1'),
      'المساحة الإجمالية المطلوبة تقريبًا: ' + (val('constructionArea') || '300') + ' م²',
      'الطراز: ' + (selTxt('constructionStyle') || 'عصري'),
      annexes.length ? 'الملاحق المطلوبة: ' + annexes.join('، ') : '',
      notes ? 'ملاحظات: ' + notes : '',
    ].filter(Boolean).join('\n');
  }

  function requestPlanSpec(desc) {
    /* v-cons-i18n: العنوان والطراز وأسماء الطوابق بلغة التطبيق —
       أسماء الغرف تبقى عربية (لوحة الألوان والترجمة عليها). */
    var __lg = (FP.uiLng && FP.uiLng()) || 'ar';
    var __langRule = __lg === 'ar' ? '' :
      '\n- Write the "title", "style" and every floor "name" in the language with ISO code "' + __lg + '" (the app language). Room "name" values MUST stay in Arabic from the allowed list above.';
    return fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-flash-latest',
        systemInstruction: { parts: [{ text: FP.PROMPT + __langRule }] },
        contents: [{ role: 'user', parts: [{ text: desc }] }],
        token: authGet('aiapp_auth_token'),
        guestId: window.getGuestId(),
        stream: false,
        mode: 'factory',
      }),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error('plan_provider_failed');
        var candidates = data && data.candidates;
        var parts = candidates && candidates[0] && candidates[0].content && candidates[0].content.parts;
        var text = Array.isArray(parts) ? parts.map(function (p) { return (p && p.text) || ''; }).join('') : '';
        var spec = FP.extractSpec(text);
        if (!spec) throw new Error('invalid_plan_spec');
        return spec;
      });
    });
  }

  btn.addEventListener('click', function () {
    var label = btn.textContent;
    /* v-l10n-scope-fix (لقطة عمران TestFlight: ReferenceError l10nFor): الدالتان
       معرفتان في وحدة الرسم — تُقرآن من omranFloorplan لا من هذا النطاق. */
    var TT = (FP && FP.l10nFor && FP.uiLng) ? FP.l10nFor(FP.uiLng()) : null;
    function ttt(k, arv){ return (TT && TT[k]) || arv; }
    btn.disabled = true;
    btn.textContent = ttt('prep', '⏳ يجهّز المخطط…');
    statusMsg(ttt('arch', '📐 المهندس الذكي يوزّع الغرف والمقاسات…'));

    requestPlanSpec(buildDescription()).then(function (spec) {
        /* مشروع جديد يفتح في المعاينة — نفس مسار التطبيقات المبنية */
        var code = FP.renderPlan(spec);
        var cur = { id: Date.now().toString(), title: String(spec.title || 'مخطط بيتي'), code: code, codeType: 'html', messages: [] };
        state.projects.push(cur);
        state.currentId = cur.id;
        saveState();
        renderHistory();
        renderCodeAndPreview();
        switchWorkTab('preview');
        try { if (window.waAutoExpand) window.waAutoExpand(); } catch (e2) { __swallow(e2, 'floorplan:waExpand'); }
        /* على الجوال: افتح درج المعاينة */
        try {
          if (window.matchMedia('(max-width:860px)').matches && !workareaEl.classList.contains('open')) openDrawer(workareaEl);
        } catch (e3) { __swallow(e3, 'floorplan:drawer'); }
        statusMsg('');
        var modal = document.getElementById('constructionModal');
        if (modal) modal.style.display = 'none';
    }).catch(function () {
      statusMsg(ttt('planFail', '⚠️ تعذر تجهيز المخطط الآن. حاول مرة أخرى بعد قليل.'));
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = label;
    });
  });
})();
