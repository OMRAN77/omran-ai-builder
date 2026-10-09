/* v-inspire (المالك ٩ أكتوبر «أبدأ بالخطوة الأولى»): «اقتراحات» صارت شاشة بتبويبين — «الإلهام» و«اقتراحات سريعة».
   «الإلهام» قسمه الأوّل «مدينتك الحقيقيّة»: عشر تجارب ثلاثيّة الأبعاد تبني حيّ المستخدم الحقيقيّ من الخرائط المفتوحة
   (inspire/city/<id>.html — تُبنى من inspire/src بـscripts/inspire/build.mjs). الضغط على بطاقة يجلب الملفّ ويفتحه مشروعًا
   جديدًا في المعاينة فورًا — بلا موديل ولا رسالة تنحسب. (التجربة ٦٥–٨٠ ك.ب: تعديلها بالمحادثة يعيد كتابة الملفّ كلّه فيتجاوز
   حدّ الردّ الواحد — لذلك لا تَعِد الشاشة بالتعديل بالمحادثة؛ ذاك يحتاج تعديلًا بالمقاطع، قرار للمالك.)
   الاقتراحات العشرة (QUICK_SUGGESTIONS) كما هي في تبويبها، وتعمل بـ__runQuickSuggestion نفسها. */
const INSPIRE_CITY = [
  { id:'chase',
    t:{ar:'مطاردة في شوارعك', en:'Street chase', fr:'Course dans vos rues', hi:'आपकी गलियों में रेस', ur:'آپ کی گلیوں میں ریس', bn:'আপনার রাস্তায় রেস', ne:'तपाईंका सडकमा दौड', ml:'നിങ്ങളുടെ തെരുവുകളിൽ റേസ്', fil:'Karera sa mga kalye mo', id:'Balapan di jalanmu', zh:'街头追逐', ru:'Гонка по вашим улицам', tr:'Sokaklarında yarış', es:'Carrera por tus calles'},
    d:{ar:'سيّارة على شوارع حيّك الحقيقيّة: نقاط تفتيش، مؤقّت، وأفضل وقت لك.', en:'Drive your real streets: checkpoints, a timer and your best time.', fr:'Conduisez dans vos vraies rues : points de passage, chrono et meilleur temps.', hi:'अपनी असली सड़कों पर गाड़ी चलाएँ: चेकपॉइंट, टाइमर और आपका सबसे अच्छा समय।', ur:'اپنی اصلی سڑکوں پر گاڑی چلائیں: چیک پوائنٹس، ٹائمر اور آپ کا بہترین وقت۔', bn:'নিজের আসল রাস্তায় গাড়ি চালান: চেকপয়েন্ট, টাইমার আর আপনার সেরা সময়।', ne:'आफ्नै वास्तविक सडकमा गाडी चलाउनुहोस्: चेकपोइन्ट, टाइमर र तपाईंको उत्कृष्ट समय।', ml:'നിങ്ങളുടെ യഥാർത്ഥ തെരുവുകളിൽ ഡ്രൈവ് ചെയ്യൂ: ചെക്ക്‌പോയിന്റുകൾ, ടൈമർ, നിങ്ങളുടെ മികച്ച സമയം.', fil:'Magmaneho sa totoong mga kalye mo: mga checkpoint, timer at ang pinakamabilis mong oras.', id:'Menyetir di jalan-jalan nyata sekitarmu: checkpoint, pengatur waktu, dan waktu terbaikmu.', zh:'在你真实的街道上驾驶：检查点、计时器和你的最佳成绩。', ru:'Езда по настоящим улицам района: контрольные точки, таймер и лучшее время.', tr:'Gerçek sokaklarında araba sür: kontrol noktaları, süre ve en iyi zamanın.', es:'Conduce por tus calles reales: puntos de control, cronómetro y tu mejor tiempo.'} },
  { id:'drone',
    t:{ar:'سباق الدرون بين الأبراج', en:'Drone race between the towers', fr:'Course de drone entre les tours', hi:'टावरों के बीच ड्रोन रेस', ur:'ٹاوروں کے بیچ ڈرون ریس', bn:'টাওয়ারের মাঝে ড্রোন রেস', ne:'टावरबीच ड्रोन दौड', ml:'ടവറുകൾക്കിടയിൽ ഡ്രോൺ റേസ്', fil:'Karera ng drone sa pagitan ng mga tore', id:'Balapan drone di antara menara', zh:'高楼间的无人机竞速', ru:'Гонка дронов между башнями', tr:'Kuleler arasında drone yarışı', es:'Carrera de drones entre torres'},
    d:{ar:'طيّر درون عبر حلقات مضيئة بين أعلى أبراج منطقتك.', en:'Fly a drone through glowing rings between your area\'s tallest towers.', fr:'Pilotez un drone à travers des anneaux lumineux entre les plus hautes tours du quartier.', hi:'अपने इलाके के सबसे ऊँचे टावरों के बीच चमकते छल्लों से ड्रोन उड़ाएँ।', ur:'اپنے علاقے کے سب سے اونچے ٹاوروں کے بیچ چمکتے حلقوں سے ڈرون اڑائیں۔', bn:'এলাকার সবচেয়ে উঁচু টাওয়ারগুলোর মাঝে জ্বলন্ত রিং দিয়ে ড্রোন ওড়ান।', ne:'आफ्नो क्षेत्रका अग्ला टावरबीच चम्किला घेराहरूबाट ड्रोन उडाउनुहोस्।', ml:'നിങ്ങളുടെ പ്രദേശത്തെ ഉയർന്ന ടവറുകൾക്കിടയിലെ തിളങ്ങുന്ന വളയങ്ങളിലൂടെ ഡ്രോൺ പറത്തൂ.', fil:'Magpalipad ng drone sa mga kumikinang na singsing sa pagitan ng pinakamatataas na tore sa lugar mo.', id:'Terbangkan drone melewati cincin bercahaya di antara menara tertinggi di daerahmu.', zh:'驾驶无人机穿过你所在区域最高楼宇之间的发光圆环。', ru:'Проведите дрон через светящиеся кольца между самыми высокими башнями района.', tr:'Bölgendeki en yüksek kuleler arasındaki parlak halkalardan drone uçur.', es:'Vuela un dron por anillos luminosos entre las torres más altas de tu zona.'} },
  { id:'sun',
    t:{ar:'شمس بيتك ساعة بساعة', en:'Your home\'s sun, hour by hour', fr:'Le soleil de chez vous, heure par heure', hi:'आपके घर की धूप, घंटे-दर-घंटे', ur:'آپ کے گھر کی دھوپ، گھنٹہ بہ گھنٹہ', bn:'আপনার বাড়ির রোদ, ঘণ্টায় ঘণ্টায়', ne:'तपाईंको घरको घाम, घण्टा-घण्टामा', ml:'നിങ്ങളുടെ വീട്ടിലെ വെയിൽ, മണിക്കൂർ തോറും', fil:'Araw sa bahay mo, oras-oras', id:'Matahari rumahmu, jam demi jam', zh:'你家的阳光，逐小时', ru:'Солнце вашего дома по часам', tr:'Evinin güneşi, saat saat', es:'El sol de tu casa, hora a hora'},
    d:{ar:'اختر أيّ نقطة وشوف كم ساعة توصلها الشمس فعلًا في أيّ يوم من السنة.', en:'Pick any spot and see how many hours of direct sun it really gets on any day of the year.', fr:'Choisissez un point et voyez combien d\'heures de soleil direct il reçoit vraiment, n\'importe quel jour de l\'année.', hi:'कोई भी जगह चुनें और देखें कि साल के किसी भी दिन उसे असल में कितने घंटे सीधी धूप मिलती है।', ur:'کوئی بھی جگہ چنیں اور دیکھیں کہ سال کے کسی بھی دن اسے واقعی کتنے گھنٹے سیدھی دھوپ ملتی ہے۔', bn:'যেকোনো জায়গা বেছে নিন আর দেখুন বছরের যেকোনো দিনে সেখানে আসলে কত ঘণ্টা সরাসরি রোদ পড়ে।', ne:'कुनै पनि ठाउँ छान्नुहोस् र वर्षको जुनसुकै दिन त्यहाँ वास्तवमा कति घण्टा सिधा घाम पर्छ हेर्नुहोस्।', ml:'ഏതെങ്കിലും സ്ഥലം തിരഞ്ഞെടുത്ത് വർഷത്തിലെ ഏത് ദിവസവും അവിടെ എത്ര മണിക്കൂർ നേരിട്ട് വെയിൽ കിട്ടുന്നുവെന്ന് കാണൂ.', fil:'Pumili ng anumang lugar at tingnan kung ilang oras ng direktang araw ang talagang natatanggap nito sa anumang araw ng taon.', id:'Pilih titik mana saja dan lihat berapa jam sinar matahari langsung yang benar-benar didapat pada hari apa pun dalam setahun.', zh:'选择任意位置，查看它在一年中任意一天真正能晒到几小时阳光。', ru:'Выберите любую точку и узнайте, сколько часов прямого солнца она реально получает в любой день года.', tr:'Herhangi bir noktayı seç, yılın herhangi bir gününde gerçekte kaç saat doğrudan güneş aldığını gör.', es:'Elige cualquier punto y mira cuántas horas de sol directo recibe de verdad cualquier día del año.'} },
  { id:'view',
    t:{ar:'إطلالة الطابق قبل البناء', en:'Your floor\'s view, before it\'s built', fr:'La vue de votre étage avant sa construction', hi:'बनने से पहले अपनी मंज़िल का नज़ारा', ur:'تعمیر سے پہلے اپنی منزل کا منظر', bn:'তৈরির আগেই আপনার তলার দৃশ্য', ne:'बन्नुअघि नै तपाईंको तलाको दृश्य', ml:'പണിയും മുൻപേ നിങ്ങളുടെ നിലയിലെ കാഴ്ച', fil:'Tanawin ng palapag mo bago itayo', id:'Pemandangan lantaimu sebelum dibangun', zh:'建成之前，先看楼层景观', ru:'Вид с вашего этажа до стройки', tr:'İnşa edilmeden katının manzarası', es:'La vista de tu piso antes de construirlo'},
    d:{ar:'اختر الطابق والاتّجاه وشوف الإطلالة الحقيقيّة: كم هي مفتوحة، وهل يبان الماء.', en:'Choose a floor and a direction and see the real view: how open it is and whether the water shows.', fr:'Choisissez l\'étage et l\'orientation et voyez la vraie vue : son ouverture et si l\'eau est visible.', hi:'मंज़िल और दिशा चुनें और असली नज़ारा देखें: कितना खुला है और पानी दिखता है या नहीं।', ur:'منزل اور سمت چنیں اور اصل منظر دیکھیں: کتنا کھلا ہے اور پانی نظر آتا ہے یا نہیں۔', bn:'তলা আর দিক বেছে নিন, আসল দৃশ্য দেখুন: কতটা খোলা আর পানি দেখা যায় কি না।', ne:'तला र दिशा छान्नुहोस् र वास्तविक दृश्य हेर्नुहोस्: कति खुला छ र पानी देखिन्छ कि देखिँदैन।', ml:'നിലയും ദിശയും തിരഞ്ഞെടുത്ത് യഥാർത്ഥ കാഴ്ച കാണൂ: എത്ര തുറന്നതാണ്, വെള്ളം കാണാമോ എന്ന്.', fil:'Pumili ng palapag at direksyon at tingnan ang totoong tanawin: gaano kabukas at kung tanaw ang tubig.', id:'Pilih lantai dan arah, lalu lihat pemandangan nyata: seberapa terbuka dan apakah air terlihat.', zh:'选择楼层和朝向，查看真实景观：视野有多开阔，能否看到水面。', ru:'Выберите этаж и направление и посмотрите на реальный вид: насколько он открыт и видна ли вода.', tr:'Katı ve yönü seç, gerçek manzarayı gör: ne kadar açık ve su görünüyor mu.', es:'Elige piso y orientación y mira la vista real: cuánto se abre y si se ve el agua.'} },
  { id:'tower',
    t:{ar:'برجك بين جيرانه', en:'Your tower among its neighbours', fr:'Votre tour parmi ses voisines', hi:'पड़ोसियों के बीच आपका टावर', ur:'پڑوسیوں کے بیچ آپ کا ٹاور', bn:'প্রতিবেশীদের মাঝে আপনার টাওয়ার', ne:'छिमेकीबीच तपाईंको टावर', ml:'അയൽക്കാർക്കിടയിൽ നിങ്ങളുടെ ടവർ', fil:'Ang tore mo sa gitna ng mga kapitbahay', id:'Menaramu di antara tetangganya', zh:'你的大楼与邻居', ru:'Ваша башня среди соседей', tr:'Kulen komşularının arasında', es:'Tu torre entre sus vecinos'},
    d:{ar:'ضع برجك المقترح في الحيّ، غيّر أبعاده، وشوف ظلّه على المباني حوله.', en:'Place your proposed tower in the neighbourhood, change its size and see its shadow on the buildings around it.', fr:'Placez votre tour dans le quartier, changez ses dimensions et voyez son ombre sur les bâtiments voisins.', hi:'अपना प्रस्तावित टावर मोहल्ले में रखें, उसका आकार बदलें और आसपास की इमारतों पर उसकी छाया देखें।', ur:'اپنا مجوزہ ٹاور محلے میں رکھیں، اس کا سائز بدلیں اور آس پاس کی عمارتوں پر اس کا سایہ دیکھیں۔', bn:'প্রস্তাবিত টাওয়ারটি পাড়ায় বসান, মাপ বদলান আর চারপাশের ভবনে তার ছায়া দেখুন।', ne:'आफ्नो प्रस्तावित टावर टोलमा राख्नुहोस्, आकार बदल्नुहोस् र वरपरका भवनमा यसको छायाँ हेर्नुहोस्।', ml:'നിർദ്ദിഷ്ട ടവർ പ്രദേശത്ത് വയ്ക്കൂ, വലിപ്പം മാറ്റൂ, ചുറ്റുമുള്ള കെട്ടിടങ്ങളിൽ അതിന്റെ നിഴൽ കാണൂ.', fil:'Ilagay ang iminumungkahi mong tore sa lugar, baguhin ang sukat at tingnan ang anino nito sa mga gusali sa paligid.', id:'Tempatkan menara usulanmu di lingkungan, ubah ukurannya, dan lihat bayangannya di gedung-gedung sekitar.', zh:'把拟建大楼放进街区，调整尺寸，查看它投在周围建筑上的阴影。', ru:'Поставьте проектируемую башню в районе, меняйте размеры и смотрите её тень на соседних зданиях.', tr:'Önerdiğin kuleyi mahalleye yerleştir, boyutlarını değiştir ve çevredeki binalara düşen gölgesini gör.', es:'Coloca tu torre propuesta en el barrio, cambia sus medidas y mira su sombra sobre los edificios cercanos.'} },
  { id:'fireworks',
    t:{ar:'وين أوقف عشان أشوف الألعاب الناريّة', en:'Where to stand for the fireworks', fr:'Où se placer pour le feu d\'artifice', hi:'आतिशबाज़ी देखने के लिए कहाँ खड़े हों', ur:'آتش بازی دیکھنے کے لیے کہاں کھڑے ہوں', bn:'আতশবাজি দেখতে কোথায় দাঁড়াবেন', ne:'आतिशबाजी हेर्न कहाँ उभिने', ml:'വെടിക്കെട്ട് കാണാൻ എവിടെ നിൽക്കണം', fil:'Saan tatayo para sa paputok', id:'Di mana berdiri untuk melihat kembang api', zh:'在哪儿看烟花最好', ru:'Где встать, чтобы увидеть салют', tr:'Havai fişekler için nerede durmalı', es:'Dónde ponerte para ver los fuegos artificiales'},
    d:{ar:'يفحص كلّ الشوارع ويحدّد أفضل ثلاث نقاط تشوف منها العرض بدون ما يحجبه مبنى.', en:'Checks every street and finds the three best spots to watch the show with no building in the way.', fr:'Analyse chaque rue et trouve les trois meilleurs endroits pour voir le spectacle sans bâtiment devant.', hi:'हर सड़क जाँचकर वे तीन सबसे अच्छी जगहें ढूँढता है जहाँ से बिना किसी इमारत की रुकावट के शो दिखे।', ur:'ہر سڑک جانچ کر وہ تین بہترین جگہیں ڈھونڈتا ہے جہاں سے بغیر کسی عمارت کی رکاوٹ کے شو نظر آئے۔', bn:'প্রতিটি রাস্তা যাচাই করে এমন তিনটি সেরা জায়গা খুঁজে দেয় যেখান থেকে কোনো ভবনের বাধা ছাড়াই শো দেখা যায়।', ne:'हरेक सडक जाँचेर कुनै भवनले नछेक्ने गरी शो हेर्न सकिने तीन उत्कृष्ट ठाउँ खोज्छ।', ml:'എല്ലാ തെരുവുകളും പരിശോധിച്ച്, ഒരു കെട്ടിടവും മറയ്ക്കാതെ ഷോ കാണാവുന്ന മികച്ച മൂന്ന് സ്ഥലങ്ങൾ കണ്ടെത്തുന്നു.', fil:'Sinusuri ang bawat kalye at hinahanap ang tatlong pinakamagandang puwesto para makita ang palabas nang walang harang na gusali.', id:'Memeriksa setiap jalan dan menemukan tiga titik terbaik untuk menonton pertunjukan tanpa terhalang gedung.', zh:'检查每一条街道，找出三个不被建筑遮挡、观赏烟花的最佳位置。', ru:'Проверяет каждую улицу и находит три лучших места, откуда шоу видно без зданий на пути.', tr:'Her sokağı tarar ve gösteriyi hiçbir binanın engellemediği en iyi üç noktayı bulur.', es:'Revisa cada calle y encuentra los tres mejores puntos para ver el espectáculo sin edificios delante.'} },
  { id:'lights',
    t:{ar:'عرض الدرون الضوئيّ فوق مدينتك', en:'Drone light show over your city', fr:'Spectacle de drones lumineux sur votre ville', hi:'आपके शहर पर ड्रोन लाइट शो', ur:'آپ کے شہر پر ڈرون لائٹ شو', bn:'আপনার শহরের ওপর ড্রোন লাইট শো', ne:'तपाईंको सहरमाथि ड्रोन लाइट शो', ml:'നിങ്ങളുടെ നഗരത്തിന് മുകളിൽ ഡ്രോൺ ലൈറ്റ് ഷോ', fil:'Drone light show sa ibabaw ng lungsod mo', id:'Pertunjukan cahaya drone di atas kotamu', zh:'城市上空的无人机灯光秀', ru:'Световое шоу дронов над вашим городом', tr:'Şehrinin üzerinde drone ışık gösterisi', es:'Show de luces con drones sobre tu ciudad'},
    d:{ar:'٥٠٠ درون مضيئة فوق أبراجك الحقيقيّة ترسم أشكالًا وأيّ كلمة تكتبها.', en:'500 glowing drones above your real skyline draw shapes and any word you type.', fr:'500 drones lumineux au-dessus de vos vraies tours dessinent des formes et le mot de votre choix.', hi:'आपकी असली स्काईलाइन के ऊपर 500 चमकते ड्रोन आकृतियाँ और आपका लिखा कोई भी शब्द बनाते हैं।', ur:'آپ کی اصلی اسکائی لائن کے اوپر 500 چمکتے ڈرون شکلیں اور آپ کا لکھا ہر لفظ بناتے ہیں۔', bn:'আপনার আসল আকাশরেখার ওপর ৫০০টি জ্বলন্ত ড্রোন আকৃতি আর আপনার লেখা যেকোনো শব্দ আঁকে।', ne:'तपाईंको वास्तविक स्काइलाइनमाथि ५०० चम्किला ड्रोनले आकार र तपाईंले लेखेको जुनसुकै शब्द बनाउँछन्।', ml:'നിങ്ങളുടെ യഥാർത്ഥ സ്കൈലൈനിന് മുകളിൽ 500 തിളങ്ങുന്ന ഡ്രോണുകൾ രൂപങ്ങളും നിങ്ങൾ ടൈപ്പ് ചെയ്യുന്ന ഏത് വാക്കും വരയ്ക്കുന്നു.', fil:'500 kumikinang na drone sa ibabaw ng totoong skyline mo ang gumuguhit ng mga hugis at anumang salitang i-type mo.', id:'500 drone bercahaya di atas cakrawala nyata kotamu menggambar bentuk dan kata apa pun yang kamu ketik.', zh:'500 架发光无人机在你真实的天际线上空，排出各种图案和你输入的任何文字。', ru:'500 светящихся дронов над настоящими башнями рисуют фигуры и любое слово, которое вы напишете.', tr:'Gerçek siluetinin üzerinde 500 parlak drone şekiller ve yazdığın her kelimeyi çiziyor.', es:'500 drones luminosos sobre tu horizonte real dibujan figuras y cualquier palabra que escribas.'} },
  { id:'billboard',
    t:{ar:'اختبار اللوحة الإعلانيّة', en:'Billboard visibility test', fr:'Test de visibilité d\'un panneau', hi:'बिलबोर्ड दृश्यता परीक्षण', ur:'بل بورڈ نمائش کا ٹیسٹ', bn:'বিলবোর্ড দৃশ্যমানতা পরীক্ষা', ne:'बिलबोर्ड देखिने परीक्षण', ml:'ബിൽബോർഡ് കാഴ്ചാ പരിശോധന', fil:'Pagsubok sa visibility ng billboard', id:'Uji keterlihatan papan reklame', zh:'广告牌可见度测试', ru:'Тест видимости билборда', tr:'Reklam panosu görünürlük testi', es:'Prueba de visibilidad de una valla'},
    d:{ar:'ضع لوحتك على واجهة حقيقيّة واعرف كم متر من الشوارع يشوفها وكم ثانية.', en:'Put your billboard on a real facade and see how many metres of road can see it, and for how many seconds.', fr:'Placez votre panneau sur une vraie façade et voyez combien de mètres de route le voient, et pendant combien de secondes.', hi:'अपना बिलबोर्ड असली इमारत पर लगाएँ और देखें कि सड़क के कितने मीटर से और कितने सेकंड तक वह दिखता है।', ur:'اپنا بل بورڈ اصلی عمارت پر لگائیں اور دیکھیں کہ سڑک کے کتنے میٹر سے اور کتنے سیکنڈ تک وہ نظر آتا ہے۔', bn:'বিলবোর্ড আসল ভবনের গায়ে বসান আর দেখুন রাস্তার কত মিটার থেকে, কত সেকেন্ড ধরে সেটি দেখা যায়।', ne:'आफ्नो बिलबोर्ड वास्तविक भवनमा राख्नुहोस् र सडकको कति मिटरबाट, कति सेकेन्डसम्म देखिन्छ हेर्नुहोस्।', ml:'നിങ്ങളുടെ ബിൽബോർഡ് യഥാർത്ഥ കെട്ടിടത്തിൽ വച്ച്, റോഡിന്റെ എത്ര മീറ്ററിൽ നിന്ന്, എത്ര സെക്കൻഡ് അത് കാണാമെന്ന് നോക്കൂ.', fil:'Ilagay ang billboard mo sa totoong gusali at tingnan kung ilang metro ng kalsada ang nakakakita rito, at ilang segundo.', id:'Pasang papan reklamemu di fasad nyata dan lihat berapa meter jalan yang bisa melihatnya, dan selama berapa detik.', zh:'把广告牌放到真实的建筑立面上，看看有多少米道路能看到它、能看几秒。', ru:'Разместите билборд на настоящем фасаде и узнайте, со скольких метров дороги и сколько секунд его видно.', tr:'Panonu gerçek bir cepheye yerleştir; yolun kaç metresinden ve kaç saniye göründüğünü gör.', es:'Pon tu valla en una fachada real y mira cuántos metros de calle la ven y durante cuántos segundos.'} },
  { id:'noise',
    t:{ar:'اسمع الشقّة قبل التوقيع', en:'Hear the apartment before you sign', fr:'Écoutez l\'appartement avant de signer', hi:'साइन करने से पहले फ़्लैट को सुनें', ur:'دستخط سے پہلے فلیٹ کو سنیں', bn:'সই করার আগে ফ্ল্যাটটি শুনুন', ne:'सही गर्नुअघि फ्ल्याट सुन्नुहोस्', ml:'ഒപ്പിടും മുൻപ് ഫ്ലാറ്റ് കേട്ടുനോക്കൂ', fil:'Pakinggan ang apartment bago pumirma', id:'Dengarkan apartemen sebelum tanda tangan', zh:'签约前先听听这套房', ru:'Послушайте квартиру до подписания', tr:'İmzalamadan önce daireyi dinle', es:'Escucha el piso antes de firmar'},
    d:{ar:'اختر المكان والطابق واعرف مستوى ضجيج الشوارع حوله ليلًا ونهارًا، واسمعه.', en:'Pick a spot and a floor to get the street noise level by day and night, and hear it.', fr:'Choisissez un lieu et un étage pour connaître le bruit de la rue le jour et la nuit, et l\'entendre.', hi:'जगह और मंज़िल चुनें, दिन और रात में सड़क के शोर का स्तर जानें और उसे सुनें।', ur:'جگہ اور منزل چنیں، دن اور رات میں سڑک کے شور کی سطح جانیں اور اسے سنیں۔', bn:'জায়গা আর তলা বেছে নিন, দিনে ও রাতে রাস্তার শব্দের মাত্রা জানুন এবং শুনুন।', ne:'ठाउँ र तला छान्नुहोस्, दिउँसो र राति सडकको आवाजको स्तर थाहा पाउनुहोस् र सुन्नुहोस्।', ml:'സ്ഥലവും നിലയും തിരഞ്ഞെടുത്ത് പകലും രാത്രിയും തെരുവിലെ ശബ്ദനില അറിയൂ, കേൾക്കൂ.', fil:'Pumili ng lugar at palapag para malaman ang ingay ng kalye sa araw at gabi, at pakinggan ito.', id:'Pilih lokasi dan lantai untuk mengetahui tingkat kebisingan jalan siang dan malam, lalu dengarkan.', zh:'选择位置和楼层，了解白天和夜间的街道噪音水平，并亲耳听一听。', ru:'Выберите место и этаж, узнайте уровень уличного шума днём и ночью и послушайте его.', tr:'Bir yer ve kat seç; sokak gürültüsünün gündüz ve gece seviyesini öğren ve dinle.', es:'Elige un lugar y una planta para conocer el ruido de la calle de día y de noche, y escúchalo.'} },
  { id:'walkshade',
    t:{ar:'أبرد طريق ظهرًا', en:'The coolest walk at noon', fr:'La marche la plus fraîche à midi', hi:'दोपहर का सबसे ठंडा रास्ता', ur:'دوپہر کا سب سے ٹھنڈا راستہ', bn:'দুপুরের সবচেয়ে ঠান্ডা পথ', ne:'दिउँसोको सबैभन्दा शीतल बाटो', ml:'ഉച്ചയ്ക്ക് ഏറ്റവും തണുത്ത നടവഴി', fil:'Pinakapreskong lakad sa tanghali', id:'Jalan kaki paling sejuk di siang hari', zh:'正午最凉快的步行路线', ru:'Самый прохладный путь в полдень', tr:'Öğlen en serin yürüyüş', es:'El paseo más fresco a mediodía'},
    d:{ar:'اختر بدايتك ونهايتك ويطلع لك أكثر طريق في الظلّ مقابل أقصر طريق.', en:'Pick a start and an end to get the shadiest route compared with the shortest one.', fr:'Choisissez un départ et une arrivée pour obtenir l\'itinéraire le plus ombragé face au plus court.', hi:'शुरुआत और मंज़िल चुनें और सबसे छायादार रास्ते की तुलना सबसे छोटे रास्ते से देखें।', ur:'آغاز اور منزل چنیں اور سب سے سایہ دار راستے کا موازنہ سب سے چھوٹے راستے سے دیکھیں۔', bn:'শুরু আর শেষ বেছে নিন, সবচেয়ে ছায়াময় পথের সঙ্গে সবচেয়ে ছোট পথের তুলনা দেখুন।', ne:'सुरु र अन्त्य छान्नुहोस्, सबैभन्दा छायादार बाटोलाई सबैभन्दा छोटो बाटोसँग तुलना गर्नुहोस्।', ml:'തുടക്കവും അവസാനവും തിരഞ്ഞെടുത്ത് ഏറ്റവും തണലുള്ള വഴി ഏറ്റവും ചെറിയ വഴിയുമായി താരതമ്യം ചെയ്യൂ.', fil:'Pumili ng simula at dulo para makuha ang pinakamalilim na ruta kumpara sa pinakamaikli.', id:'Pilih titik awal dan akhir untuk mendapat rute paling teduh dibandingkan rute terpendek.', zh:'选择起点和终点，对比阴凉最多的路线和最短路线。', ru:'Выберите начало и конец и сравните самый тенистый маршрут с самым коротким.', tr:'Başlangıç ve bitiş seç; en gölgeli rotayı en kısa rotayla karşılaştır.', es:'Elige inicio y destino para obtener la ruta con más sombra frente a la más corta.'} },
];

(function(){
  const ID = 'inspireScreen';
  const MARK = 'CityKit'; // كلّ تجربة تحمل النواة — بدونها فالمجلوب ليس تجربة (احتياط العامل يرجّع index.html أوفلاين)
  let tab = 'inspire';
  let inFlight = 0, seq = 0, opener = null; // بطاقة واحدة تُفتح في كلّ مرّة؛ الإغلاق يلغي ما يُحمَّل
  const L = (o) => (o && (o[(typeof lang !== 'undefined' && lang) || 'ar'] || o.en || o.ar)) || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const tx = (k, fb) => { try{ const v = (typeof t === 'function') ? t(k) : ''; return (v && v !== k) ? v : fb; }catch(_){ __swallow(_, 'inspire:t'); return fb; } };

  function css(){
    if(document.getElementById('inspireCss')) return;
    const s = document.createElement('style');
    s.id = 'inspireCss';
    s.textContent = `
#inspireScreen{position:fixed; inset:0; z-index:2400; display:none; background:rgba(0,0,0,.62); backdrop-filter:blur(6px); align-items:stretch; justify-content:center;}
#inspireScreen.show{display:flex;}
#inspireScreen .insBox{position:relative; width:min(1080px,100%); margin:24px; background:var(--panel, #12141c); color:var(--text, #eee); border:1px solid var(--border, #262b36); border-radius:18px; box-shadow:0 24px 60px rgba(0,0,0,.55); display:flex; flex-direction:column; overflow:hidden;}
#inspireScreen .insHead{display:flex; align-items:center; gap:10px; padding:14px 18px 0;}
#inspireScreen .insTitle{font-size:18px; font-weight:800; flex:1;}
#inspireScreen .insClose{background:none; border:0; color:inherit; opacity:.75; cursor:pointer; padding:6px; border-radius:10px; display:flex;}
#inspireScreen .insClose:hover{opacity:1; background:rgba(255,255,255,.06);}
#inspireScreen .insTabs{display:flex; gap:6px; padding:12px 18px 0; border-bottom:1px solid var(--border, #262b36);}
#inspireScreen .insTab{background:none; border:0; border-bottom:2px solid transparent; color:inherit; opacity:.7; font:inherit; font-size:14px; font-weight:700; padding:8px 12px 10px; cursor:pointer;}
#inspireScreen .insTab.on{opacity:1; border-bottom-color:var(--accent, #c9a45c);}
#inspireScreen .insBody{flex:1; overflow-y:auto; padding:18px;}
#inspireScreen .insSecT{font-size:17px; font-weight:800; margin:0 0 4px;}
#inspireScreen .insSecS{font-size:13px; opacity:.72; margin:0 0 16px; line-height:1.6;}
#inspireScreen .insGrid{display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:14px;}
#inspireScreen .insCard{position:relative; display:flex; flex-direction:column; text-align:start; background:rgba(255,255,255,.03); border:1px solid var(--border, #262b36); border-radius:14px; overflow:hidden; padding:0; color:inherit; font:inherit; cursor:pointer; transition:border-color .15s, transform .15s;}
#inspireScreen .insCard:hover{border-color:var(--accent, #c9a45c); transform:translateY(-2px);}
#inspireScreen .insCard img{display:block; width:100%; height:auto; aspect-ratio:5/3; object-fit:cover; background:#0b0d12;}
#inspireScreen .insCard .insTxt{padding:10px 12px 12px;}
#inspireScreen .insCard .insCT{font-size:14.5px; font-weight:800; margin-bottom:4px; line-height:1.4;}
#inspireScreen .insCard .insCD{font-size:12.5px; opacity:.74; line-height:1.55;}
#inspireScreen .insCard .insBusy{position:absolute; inset:0; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.55); font-size:13px; font-weight:700;}
#inspireScreen .insCard.busy .insBusy, #inspireScreen .insCard.fail .insBusy{display:flex;}
#inspireScreen .insCard.fail .insBusy{background:rgba(120,20,20,.72); padding:10px; text-align:center;}
#inspireScreen .insGrid.loading .insCard:not(.busy){opacity:.55; pointer-events:none;}
#inspireScreen .insErr{margin:0 0 12px; font-size:13px; color:var(--danger, #e88);}
#inspireScreen .insQuick{display:flex; flex-direction:column; gap:2px; max-width:560px;}
#inspireScreen .insQ{display:flex; align-items:center; gap:10px; background:none; border:0; border-radius:10px; color:inherit; font:inherit; font-size:14px; text-align:start; padding:11px 12px; cursor:pointer;}
#inspireScreen .insQ:hover{background:rgba(255,255,255,.05);}
#inspireScreen .insQ span{flex:1;}
#inspireScreen .insQ svg{opacity:.55; flex:none;}
html[dir="rtl"] #inspireScreen .insQ svg{transform:scaleX(-1);}
@media (max-width:640px){
  #inspireScreen .insBox{margin:0; border-radius:0; border:0;}
  #inspireScreen .insGrid{grid-template-columns:1fr 1fr; gap:10px;}
  #inspireScreen .insCard .insCD{display:none;}
  #inspireScreen .insBody{padding:14px;}
}`;
    document.head.appendChild(s);
  }

  const CLOSE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  const CHEV_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';

  function root(){
    let el = document.getElementById(ID);
    if(el) return el;
    css();
    el = document.createElement('div');
    el.id = ID;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="insBox"><div class="insHead"><div class="insTitle"></div><button type="button" class="insClose" id="inspireCloseBtn">' + CLOSE_SVG + '</button></div><div class="insTabs" role="tablist"></div><div class="insBody"></div></div>';
    el.addEventListener('click', (e) => { if(e.target === el) closeInspireScreen(); });
    el.querySelector('.insClose').onclick = () => closeInspireScreen();
    document.body.appendChild(el); // Esc والسحب للرجوع: app-05-swipe-back.js (inspireScreen ← inspireCloseBtn) — يغلقها وحدها
    return el;
  }

  function render(){
    const el = root();
    el.querySelector('.insTitle').textContent = tx('quickTemplatesTitle', 'اقتراحات');
    el.querySelector('.insClose').setAttribute('aria-label', tx('closeTitle', 'إغلاق'));
    const tabs = el.querySelector('.insTabs');
    tabs.innerHTML = [['inspire', tx('inspTabInspire', 'الإلهام')], ['quick', tx('inspTabQuick', 'اقتراحات سريعة')]]
      .map(([k, label]) => '<button type="button" role="tab" aria-selected="' + (tab === k) + '" class="insTab' + (tab === k ? ' on' : '') + '" data-tab="' + k + '">' + esc(label) + '</button>').join('');
    tabs.querySelectorAll('.insTab').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; render(); try{ const t = el.querySelector('.insTab.on'); if(t) t.focus(); }catch(_){ __swallow(_, 'inspire:tabfocus'); } }; });
    const body = el.querySelector('.insBody');
    if(tab === 'quick'){
      const list = (typeof QUICK_SUGGESTIONS !== 'undefined' ? QUICK_SUGGESTIONS : []).slice().sort((a, b) => (a.order||99) - (b.order||99));
      body.innerHTML = '<div class="insQuick">' + list.map((s, i) => '<button type="button" class="insQ" data-i="' + i + '"><span>' + esc(__quickSugLabel(s)) + '</span>' + CHEV_SVG + '</button>').join('') + '</div>';
      body.querySelectorAll('.insQ').forEach((b) => { b.onclick = () => { closeInspireScreen(); __runQuickSuggestion(list[+b.dataset.i]); }; });
      return;
    }
    body.innerHTML = '<h3 class="insSecT">' + esc(tx('inspCityTitle', 'مدينتك الحقيقيّة')) + '</h3>'
      + '<p class="insSecS">' + esc(tx('inspCitySub', '')) + '</p>'
      + '<p class="insErr" role="alert" hidden></p>'
      + '<div class="insGrid">' + INSPIRE_CITY.map((c) => '<button type="button" class="insCard" data-id="' + c.id + '">'
        + '<img src="/assets/inspire/city/' + c.id + '.jpg?v=1" alt="" loading="lazy" decoding="async" width="600" height="360">'
        + '<div class="insTxt"><div class="insCT">' + esc(L(c.t)) + '</div><div class="insCD">' + esc(L(c.d)) + '</div></div>'
        + '<div class="insBusy">' + esc(tx('inspLoading', 'يجهّز…')) + '</div></button>').join('') + '</div>';
    body.querySelectorAll('.insCard').forEach((b) => { b.onclick = () => openInspireExperience(b.dataset.id, b); });
  }

  // التجربة تتكلّم عربيّ أو إنجليزيّ (CityKit.T): نخبرها بلغة التطبيق عبر lang الوثيقة قبل أن تُعرض.
  // ووسم omran-inspire يبقى في الكود نفسه: صورة السجلّ تعرف التجربة حتّى لو ضاع حقل inspire في مزامنة الخادم.
  function withLang(code, id){
    const ar = ((typeof lang !== 'undefined' && lang) || 'ar') === 'ar';
    return String(code).replace(/<html\b[^>]*>/i, ar ? '<html lang="ar" dir="rtl">' : '<html lang="en" dir="ltr">')
      .replace(/<head>/i, '<head><meta name="omran-inspire" content="' + id + '">');
  }

  async function openInspireExperience(id, card){
    const item = INSPIRE_CITY.find((c) => c.id === id);
    if(!item) return false;
    if(inFlight) return false; // نقرة ثانية أثناء التحميل لا تصنع مشروعًا ثانيًا
    const token = ++seq; inFlight = token;
    const el = document.getElementById(ID);
    const err = el && el.querySelector('.insErr'), grid = el && el.querySelector('.insGrid');
    if(err) err.hidden = true;
    if(grid) grid.classList.add('loading');
    if(card){ card.classList.remove('fail'); card.classList.add('busy'); }
    try{
      const r = await fetch('/inspire/city/' + id + '.html', { cache:'no-cache' });
      const code = r.ok ? await r.text() : '';
      if(inFlight !== token) return false; // أُغلقت الشاشة أثناء التحميل: لا مشروع ولا قفز
      if(!code || code.indexOf(MARK) === -1) throw new Error('inspire_fetch_' + r.status);
      const cur = { id: 'p_' + Date.now(), title: L(item.t), code: withLang(code, id), codeType: 'html', messages: [], inspire: id };
      state.projects.push(cur);
      state.currentId = cur.id;
      saveState();
      closeInspireScreen();
      try{ const o = document.getElementById('sectionsToolsOverlay'); if(o) o.classList.remove('show'); }catch(_){ __swallow(_, 'inspire:close-tools'); }
      try{ const p = document.getElementById('plusToolsPopup'); if(p){ p.classList.remove('show'); p.classList.remove('open'); } }catch(_){ __swallow(_, 'inspire:close-plus'); }
      renderAll();
      switchWorkTab('preview');
      try{ if(window.waAutoExpand) window.waAutoExpand(); }catch(_){ __swallow(_, 'inspire:waExpand'); }
      try{ if(window.matchMedia('(max-width:860px)').matches && !workareaEl.classList.contains('open')) openDrawer(workareaEl); }catch(_){ __swallow(_, 'inspire:drawer'); }
      return true;
    }catch(e){
      __swallow(e, 'inspire:open');
      if(inFlight === token){
        const msg = tx('inspFail', 'ما قدرت أفتحها الحين — جرّب مرّة ثانية');
        if(err){ err.textContent = msg; err.hidden = false; }
        if(card){ const b = card.querySelector('.insBusy'); if(b) b.textContent = msg; card.classList.add('fail'); setTimeout(() => { card.classList.remove('fail'); if(b) b.textContent = tx('inspLoading', 'يجهّز…'); }, 3000); }
      }
      return false;
    }finally{
      if(inFlight === token) inFlight = 0;
      if(card) card.classList.remove('busy');
      if(grid) grid.classList.remove('loading');
    }
  }

  function openInspireScreen(which){
    if(which === 'quick' || which === 'inspire') tab = which;
    try{ if(typeof closeQuickTemplates === 'function') closeQuickTemplates(); }catch(_){ __swallow(_, 'inspire:close-quick'); }
    try{ const p = document.getElementById('plusToolsPopup'); if(p){ p.classList.remove('show'); p.classList.remove('open'); } }catch(_){ __swallow(_, 'inspire:close-plus'); }
    opener = document.activeElement;
    render();
    const el = root();
    el.classList.add('show');
    try{ const t = el.querySelector('.insTab.on'); if(t) t.focus(); }catch(_){ __swallow(_, 'inspire:focus'); }
  }
  function closeInspireScreen(){
    inFlight = 0; // تحميل جارٍ لا يفتح مشروعًا بعد الإغلاق
    const el = document.getElementById(ID);
    if(!el || !el.classList.contains('show')) return;
    el.classList.remove('show');
    try{ if(opener && opener.isConnected && typeof opener.focus === 'function') opener.focus(); }catch(_){ __swallow(_, 'inspire:refocus'); }
    opener = null;
  }

  window.openInspireScreen = openInspireScreen;
  window.closeInspireScreen = closeInspireScreen;
  window.openInspireExperience = openInspireExperience;
})();
