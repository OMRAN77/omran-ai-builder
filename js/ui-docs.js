(function(){
  'use strict';
  function AL(){ try{ if(typeof lang!=='undefined' && lang) return String(lang); return (typeof appLang==='function'?appLang():(localStorage.getItem('aiapp_lang')||'ar')); }catch(e){ return 'ar'; } }
  function TK(){ try{ return (typeof getToken==='function'?getToken():'')||''; }catch(e){ return ''; } }
  function isAr(){ return /^ar/i.test(AL()); }
  function E(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  // ---- markdown lite ----
  function md(t){
    if(!t) return '';
    var lines=String(t).split('\n'), out=[], inUl=false, inOl=false;
    function closeL(){ if(inUl){out.push('</ul>');inUl=false;} if(inOl){out.push('</ol>');inOl=false;} }
    for(var i=0;i<lines.length;i++){
      var ln=lines[i];
      var b=E(ln).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
      if(/^\s*#{1,4}\s+/.test(ln)){ closeL(); out.push('<h3>'+b.replace(/^\s*#{1,4}\s+/,'')+'</h3>'); continue; }
      var mo=ln.match(/^\s*(\d+)[\.\)]\s+(.*)/);
      if(mo){ if(!inOl){closeL();out.push('<ol>');inOl=true;} out.push('<li>'+b.replace(/^\s*\d+[\.\)]\s+/,'')+'</li>'); continue; }
      if(/^\s*[-*•]\s+/.test(ln)){ if(!inUl){closeL();out.push('<ul>');inUl=true;} out.push('<li>'+b.replace(/^\s*[-*•]\s+/,'')+'</li>'); continue; }
      if(/^\s*$/.test(ln)){ closeL(); continue; }
      closeL(); out.push('<div>'+b+'</div>');
    }
    closeL(); return out.join('');
  }
  function fileToB64(f){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result).split(',')[1]||''); }; r.onerror=rej; r.readAsDataURL(f); }); }
  async function api(action, payload){
    var r=await fetch('/api/edu',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({action:action,token:TK(),lang:AL()},payload))});
    var d=await r.json().catch(function(){return{};});
    if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
    return d;
  }
  /* v-tools-i18n-full: ترجمات لكل اللغات — المفتاح النص العربي الأصلي حرفيًا */
  var DOC_XL = {
    '📄 مساعد المستندات': {
      fr: '📄 Assistant Documentaire',
      hi: '📄 दस्तावेज़ सहायक',
      bn: '📄 ডকুমেন্ট সহায়ক',
      ne: '📄 कागजात सहायक',
      id: '📄 Asisten Dokumen',
      fil: '📄 Tulong sa Dokumento',
      tr: '📄 Belge Yardımcısı',
      zh: '📄 文档助手',
      ru: '📄 Помощник документов',
      es: '📄 Asistente de documentos',
      ml: '📄 ഡോക്യുമെന്റ് സഹായക'
    },
    'ارفع مستندك': {
      fr: 'Téléchargez votre document',
      hi: 'अपना दस्तावेज़ अपलोड करें',
      bn: 'আপনার ডকুমেন্ট আপলোড করুন',
      ne: 'आफ्नो कागजात अपलोड गर्नुहोस्',
      id: 'Unggah dokumen Anda',
      fil: 'Mag-upload ng iyong dokumento',
      tr: 'Belgenizi yükleyin',
      zh: '上传您的文档',
      ru: 'Загрузите ваш документ',
      es: 'Carga tu documento',
      ml: 'നിങ്ങളുടെ ഡോക്യുമെന്റ് അപ്‌ലോഡ് ചെയ്യുക'
    },
    'عقد · فاتورة · تقرير · عرض سعر (PDF أو صورة)': {
      fr: 'Contrat · Facture · Rapport · Devis (PDF ou image)',
      hi: 'अनुबंध · चालान · रिपोर्ट · कोटेशन (PDF या छवि)',
      bn: 'চুক্তি · চালান · রিপোর্ট · উদ্ধৃতি (PDF বা ছবি)',
      ne: 'सम्झौता · बिल · रिपोर्ट · मूल्य निर्धारण (PDF वा तस्विर)',
      id: 'Kontrak · Faktur · Laporan · Penawaran (PDF atau gambar)',
      fil: 'Kontrata · Faktura · Ulat · Alok (PDF o larawan)',
      tr: 'Sözleşme · Fatura · Rapor · Teklif (PDF veya görsel)',
      zh: '合同 · 发票 · 报告 · 报价单 (PDF 或图像)',
      ru: 'Контракт · Счёт · Отчёт · Предложение (PDF или изображение)',
      es: 'Contrato · Factura · Informe · Presupuesto (PDF o imagen)',
      ml: 'കരാര് · ഇൻവോയിസ് · റിപ്പോര്ട് · കോട്ടേഷൻ (PDF അല്ലെങ്കില് ചിത്രം)'
    },
    'أو الصق نص المستند': {
      fr: 'Ou collez le texte du document',
      hi: 'या दस्तावेज़ का पाठ चिपकाएँ',
      bn: 'অথবা ডকুমেন্টের পাঠ্য পেস্ট করুন',
      ne: 'वा कागजातको पाठ टाँस्नुहोस्',
      id: 'Atau tempel teks dokumen',
      fil: 'O i-paste ang teksto ng dokumento',
      tr: 'Veya belge metnini yapıştırın',
      zh: '或粘贴文档文本',
      ru: 'Или вставьте текст документа',
      es: 'O pega el texto del documento',
      ml: 'അല്ലെങ്കില് ഡോക്യുമെന്റ് വിവരം തന്നെ പേസ്റ്റ് ചെയ്യുക'
    },
    'الصق نص المستند هنا…': {
      fr: 'Collez le texte du document ici…',
      hi: 'दस्तावेज़ का पाठ यहाँ चिपकाएँ…',
      bn: 'ডকুমেন্টের পাঠ्य এখানে পেস्ट করুন…',
      ne: 'कागजातको पाठ यहाँ टाँस्नुहोस्…',
      id: 'Tempel teks dokumen di sini…',
      fil: 'I-paste ang teksto ng dokumento dito…',
      tr: 'Belge metnini buraya yapıştırın…',
      zh: '在此粘贴文档文本…',
      ru: 'Вставьте текст документа здесь…',
      es: 'Pega el texto del documento aquí…',
      ml: 'ഡോക്യുമെന്റ് വിവരം ഇവിടെ പേസ്റ്റ് ചെയ്യുക…'
    },
    'حلّل المستند': {
      fr: 'Analyser le document',
      hi: 'दस्तावेज़ का विश्लेषण करें',
      bn: 'ডকুমেন্ট বিশ্লেষণ করুন',
      ne: 'कागजातको विश्लेषण गर्नुहोस्',
      id: 'Analisis dokumen',
      fil: 'Suriin ang dokumento',
      tr: 'Belgeyi analiz et',
      zh: '分析文档',
      ru: 'Анализировать документ',
      es: 'Analizar documento',
      ml: 'ഡോക്യുമെന്റ് വിശകലനം ചെയ്യുക'
    },
    'ارفع ملفًا أو الصق نصًا أولًا.': {
      fr: 'Téléchargez un fichier ou collez du texte d\'abord.',
      hi: 'पहले एक फ़ाइल अपलोड करें या पाठ चिपकाएँ।',
      bn: 'প্রথমে একটি ফাইল আপলোড করুন বা পাঠ্য পেস্ট করুন।',
      ne: 'पहले फाइल अपलोड गर्नुहोस् वा पाठ टाँस्नुहोस्।',
      id: 'Unggah file atau tempel teks terlebih dahulu.',
      fil: 'Mag-upload ng file o mag-paste ng teksto muna.',
      tr: 'Önce bir dosya yükleyin veya metin yapıştırın.',
      zh: '请先上传文件或粘贴文本。',
      ru: 'Сначала загрузите файл или вставьте текст.',
      es: 'Sube un archivo o pega texto primero.',
      ml: 'ആദ്യം ഫയിൽ അപ്‌ലോഡ് ചെയ്യുക അല്ലെങ്കില് വിവരം പേസ്റ്റ് ചെയ്യുക।'
    },
    'يقرأ مستندك…': {
      fr: 'Lecture de votre document…',
      hi: 'आपके दस्तावेज़ को पढ़ा जा रहा है…',
      bn: 'আপনার ডকুমেন্ট পড়া হচ্ছে…',
      ne: 'आपको कागजात पढिरहेको छ…',
      id: 'Membaca dokumen Anda…',
      fil: 'Binabasa ang iyong dokumento…',
      tr: 'Belgeniz okunuyor…',
      zh: '正在读取您的文档…',
      ru: 'Чтение вашего документа…',
      es: 'Leyendo tu documento…',
      ml: 'നിങ്ങളുടെ ഡോക്യുമെന്റ് വായിക്കുന്നു…'
    },
    'مستند': {
      fr: 'Document',
      hi: 'दस्तावेज़',
      bn: 'ডকুমেন্ট',
      ne: 'कागजात',
      id: 'Dokumen',
      fil: 'Dokumento',
      tr: 'Belge',
      zh: '文档',
      ru: 'Документ',
      es: 'Documento',
      ml: 'ഡോക്യുമെന്റ്'
    },
    'البيانات الرئيسية': {
      fr: 'Détails clés',
      hi: 'मुख्य विवरण',
      bn: 'মূল বিবরণ',
      ne: 'मुख्य विवरण',
      id: 'Detail utama',
      fil: 'Pangunahing detalye',
      tr: 'Önemli ayrıntılar',
      zh: '关键详情',
      ru: 'Ключевые детали',
      es: 'Detalles clave',
      ml: 'പ്രധാന വിശദാംശങ്ങൾ'
    },
    'الملخص': {
      fr: 'Résumé',
      hi: 'सारांश',
      bn: 'সারাংশ',
      ne: 'सारांश',
      id: 'Ringkasan',
      fil: 'Buod',
      tr: 'Özet',
      zh: '摘要',
      ru: 'Резюме',
      es: 'Resumen',
      ml: 'സംഗ്രഹം'
    },
    'نقاط مهمة': {
      fr: 'Points importants',
      hi: 'महत्वपूर्ण बातें',
      bn: 'গুরুত্বপূর্ণ পয়েন্টগুলি',
      ne: 'महत्वपूर्ण कुराहरू',
      id: 'Poin penting',
      fil: 'Mahalagang punto',
      tr: 'Önemli noktalar',
      zh: '重要点',
      ru: 'Важные моменты',
      es: 'Puntos importantes',
      ml: 'പ്രധാന പോയിന്റുകൾ'
    },
    'اسأل عن المستند': {
      fr: 'Poser une question sur le document',
      hi: 'दस्तावेज़ के बारे में पूछें',
      bn: 'ডকুমেন্ট সম্পর্কে জিজ্ঞাসা করুন',
      ne: 'कागजातको बारेमा सोध्नुहोस्',
      id: 'Tanyakan tentang dokumen',
      fil: 'Magtanong tungkol sa dokumento',
      tr: 'Belge hakkında soru sor',
      zh: '询问文档',
      ru: 'Задать вопрос о документе',
      es: 'Pregunta sobre el documento',
      ml: 'ഡോക്യുമെന്റിനെ കുറിച്ച് ചോദിക്കുക'
    },
    'اكتب سؤالك…': {
      fr: 'Tapez votre question…',
      hi: 'अपना प्रश्न लिखें…',
      bn: 'আপনার প্রশ্ন টাইপ করুন…',
      ne: 'आफ्नो प्रश्न लेख्नुहोस्…',
      id: 'Ketik pertanyaan Anda…',
      fil: 'I-type ang iyong tanong…',
      tr: 'Sorunuzu yazın…',
      zh: '输入您的问题…',
      ru: 'Введите ваш вопрос…',
      es: 'Escribe tu pregunta…',
      ml: 'നിങ്ങളുടെ ചോദ്യം എഴുതുക…'
    },
    'مستند جديد': {
      fr: 'Nouveau document',
      hi: 'नया दस्तावेज़',
      bn: 'নতুন ডকুমেন্ট',
      ne: 'नयाँ कागजात',
      id: 'Dokumen baru',
      fil: 'Bagong dokumento',
      tr: 'Yeni belge',
      zh: '新文档',
      ru: 'Новый документ',
      es: 'Nuevo documento',
      ml: 'പുതിയ ഡോക്യുമെന്റ്'
    },
    '🧾 المعاملات الحكومية': {
      fr: '🧾 Services Gouvernementaux',
      hi: '🧾 सरकारी सेवाएं',
      bn: '🧾 সরকারি সেবা',
      ne: '🧾 सरकारी सेवाएं',
      id: '🧾 Layanan Pemerintah',
      fil: '🧾 Mga Serbisyong Pang-Pamahalaan',
      tr: '🧾 Hükümet Hizmetleri',
      zh: '🧾 政府服务',
      ru: '🧾 Государственные услуги',
      es: '🧾 Servicios Gubernamentales',
      ml: '🧾 സർക്കാർ സേവനങ്ങൾ'
    },
    'اسأل عن أي معاملة حكومية إماراتية — الخطوات والرسوم والرابط الرسمي، ببحث حي.': {
      fr: 'Posez une question sur n\'importe quel service gouvernemental des Émirats — étapes, frais et lien officiel, avec recherche en direct.',
      hi: 'किसी भी यूएई सरकारी सेवा के बारे में पूछें — चरण, शुल्क और आधिकारिक लिंक, लाइव खोज के साथ।',
      bn: 'যেকোনো ইউএই সরকারি সেবা সম্পর্কে জিজ্ঞাসা করুন — পদক্ষেপ, ফি এবং অফিসিয়াল লিংক, লাইভ সার্চ সহ।',
      ne: 'कुनै पनि UAE सरकारी सेवा सम्बन्धी प्रश्न गर्नुहोस् — चरणहरु, शुल्क र अधिकारिक लिंक, लाइभ खोज सहित।',
      id: 'Tanyakan tentang layanan pemerintah UAE apa pun — langkah-langkah, biaya, dan tautan resmi, dengan pencarian langsung.',
      fil: 'Magtanong tungkol sa anumang serbisyong pang-pamahalaan ng UAE — mga hakbang, bayad, at opisyal na link, may live na paghahanap.',
      tr: 'Herhangi bir Birleşik Arap Emirlikleri hükümet hizmetini sorgulamak — adımlar, ücretler ve resmi bağlantı, canlı arama ile.',
      zh: '询问任何阿联酋政府服务 — 步骤、费用和官方链接，带实时搜索。',
      ru: 'Задавайте вопросы о любой государственной услуге ОАЭ — шаги, сборы и официальная ссылка, с поиском в реальном времени.',
      es: 'Pregunta sobre cualquier servicio gubernamental de los Emiratos — pasos, tarifas y enlace oficial, con búsqueda en vivo.',
      ml: 'UAE സർക്കാർ സേവനങ്ങളെ കുറിച്ച് ചോദിക്കുക — ഘട്ടങ്ങൾ, ഫീസ് ഒപ്പം ഔദ്യോഗിക ലിങ്ക്, ലൈവ് സെർച്ച് ഉള്ളത്.'
    },
    'اكتب معاملتك… مثال: كيف أجدّد رخصتي التجارية في الشارقة؟': {
      fr: 'Tapez votre service… exemple : comment renouveler ma licence commerciale ?',
      hi: 'अपनी सेवा टाइप करें… उदाहरण: मैं अपना व्यावसायिक लाइसेंस कैसे नवीनीकृत कर सकता हूं?',
      bn: 'আপনার সেবা টাইপ করুন… উদাহরণ: আমি কীভাবে আমার ব্যবসায়িক লাইসেন্স পুনর্নবীকরণ করতে পারি?',
      ne: 'आफ्नो सेवा लेख्नुहोस्… उदाहरण: मेरो व्यापारिक लाइसेन्स कसरी नवीकरण गर्ने?',
      id: 'Ketik layanan Anda… contoh: bagaimana cara memperbaharui lisensi bisnis saya?',
      fil: 'I-type ang iyong serbisyo… halimbawa: paano ko i-renew ang aking business license?',
      tr: 'Hizmetinizi yazın… örnek: ticari lisansımı nasıl yenileyebilirim?',
      zh: '输入您的服务…例如：我如何更新我的商业执照？',
      ru: 'Введите ваш сервис… пример: как мне обновить мою коммерческую лицензию?',
      es: 'Escribe tu servicio… ejemplo: ¿cómo renuevo mi licencia comercial?',
      ml: 'നിങ്ങളുടെ സേവനം എഴുതുക… ഉദാഹരണം: എനിക്ക് എന്റെ ബിസിനസ് ലൈസൻസ് എങ്ങനെ പുതുക്കാം?'
    },
    'يبحث في المصادر الرسمية…': {
      fr: 'Recherche dans les sources officielles…',
      hi: 'आधिकारिक स्रोतों में खोज जा रही है…',
      bn: 'অফিসিয়াল উৎসে খোঁজ করা হচ্ছে…',
      ne: 'अधिकारिक स्रोतहरुमा खोजिरहेको छ…',
      id: 'Mencari di sumber resmi…',
      fil: 'Naghahanap sa mga opisyal na pagkukunan…',
      tr: 'Resmi kaynaklarda arama yapılıyor…',
      zh: '在官方资源中搜索…',
      ru: 'Поиск в официальных источниках…',
      es: 'Buscando en fuentes oficiales…',
      ml: 'ഔദ്യോഗിക ഉറവിടങ്ങളിൽ തിരയുന്നു…'
    },
    'المصادر الرسمية': {
      fr: 'Sources officielles',
      hi: 'आधिकारिक स्रोत',
      bn: 'অফিসিয়াল উৎস',
      ne: 'अधिकारिक स्रोतहरु',
      id: 'Sumber resmi',
      fil: 'Mga opisyal na pagkukunan',
      tr: 'Resmi kaynaklar',
      zh: '官方资源',
      ru: 'Официальные источники',
      es: 'Fuentes oficiales',
      ml: 'ഔദ്യോഗിക ഉറവിടങ്ങൾ'
    },
    '💼 مولّد السيرة الذاتية': {
      fr: '💼 Générateur de CV',
      hi: '💼 सीवी जनरेटर',
      bn: '💼 সিভি জেনারেটর',
      ne: '💼 सीवी जेनरेटर',
      id: '💼 Generator CV',
      fil: '💼 CV Generator',
      tr: '💼 CV Oluşturucu',
      zh: '💼 简历生成器',
      ru: '💼 Генератор резюме',
      es: '💼 Generador de CV',
      ml: '💼 സിവി ജെനറേറ്റർ'
    },
    'عبّئ بياناتك وسنصمّم لك سيرة ذاتية احترافية + خطاب تقديم جاهز للطباعة PDF.': {
      fr: 'Remplissez vos données et nous concevrons un CV professionnel + lettre de motivation prêt à imprimer en PDF.',
      hi: 'अपनी जानकारी भरें और हम आपके लिए एक पेशेवर सीवी + कवर लेटर प्रिंट करने के लिए तैयार PDF में डिजाइन करेंगे।',
      bn: 'আপনার তথ্য পূরণ করুন এবং আমরা আপনার জন্য একটি পেশাদার সিভি + কভার লেটার PDF-তে প্রিন্টের জন্য প্রস্তুত করব।',
      ne: 'आफ्नो जानकारी भरनुहोस र हामी तपाइंलाई एक पेशेवर सीवी + PDF मा छापिन तयार कभर लेटर डिजाइन गर्नेछौ।',
      id: 'Isi data Anda dan kami akan merancang CV profesional + surat pengantar siap cetak PDF untuk Anda.',
      fil: 'Punan ang iyong impormasyon at dinisenyo namin ang propesyonal na CV + cover letter na handa nang i-print sa PDF.',
      tr: 'Bilgilerinizi doldurun ve size profesyonel bir CV + yazı örnekini PDF olarak yazdırmaya hazır şekilde tasarlayacağız.',
      zh: '填写您的信息，我们将为您设计一份专业简历 + 求职信，以 PDF 格式打印。',
      ru: 'Заполните свои данные, и мы создадим для вас профессиональное резюме + сопроводительное письмо, готовое к печати в PDF.',
      es: 'Completa tu información y diseñaremos un CV profesional + carta de presentación lista para imprimir en PDF.',
      ml: 'നിങ്ങളുടെ വിവരം പൂരിപ്പിക്കുക ഞങ്ങൾ നിങ്ങൾക്കായി പ്രൊഫെഷണൽ സിവി + കവർ ലെറ്റർ PDF-ൽ പ്രിന്റ് ചെയ്യാൻ സജ്ജമാണ്.'
    },
    'الاسم الكامل *': {
      fr: 'Nom complet *',
      hi: 'पूरा नाम *',
      bn: 'সম্পূর্ণ নাম *',
      ne: 'पूरा नाम *',
      id: 'Nama lengkap *',
      fil: 'Buong pangalan *',
      tr: 'Tam ad *',
      zh: '全名 *',
      ru: 'Полное имя *',
      es: 'Nombre completo *',
      ml: 'പൂർണ്ണ നാമം *'
    },
    'عمر عبدالله': {
      fr: 'John Doe',
      hi: 'John Doe',
      bn: 'John Doe',
      ne: 'John Doe',
      id: 'John Doe',
      fil: 'John Doe',
      tr: 'John Doe',
      zh: 'John Doe',
      ru: 'John Doe',
      es: 'John Doe',
      ml: 'John Doe'
    },
    'المسمى الوظيفي': {
      fr: 'Titre du poste',
      hi: 'नौकरी का शीर्षक',
      bn: 'চাকরির শিরোনাম',
      ne: 'जब शीर्षक',
      id: 'Jabatan',
      fil: 'Pamagat ng trabaho',
      tr: 'Unvan',
      zh: '职位',
      ru: 'Должность',
      es: 'Título del trabajo',
      ml: 'നിയുക്തിയുടെ തലക്കെട്ട്'
    },
    'مهندس برمجيات': {
      fr: 'Ingénieur Logiciel',
      hi: 'सॉफ्टवेयर इंजीनियर',
      bn: 'সফটওয়্যার ইঞ্জিনিয়ার',
      ne: 'सफ्टवेयर इंजिनियर',
      id: 'Insinyur Perangkat Lunak',
      fil: 'Software Engineer',
      tr: 'Yazılım Mühendisi',
      zh: '软件工程师',
      ru: 'Инженер программного обеспечения',
      es: 'Ingeniero de Software',
      ml: 'സോഫ്റ്റ്വെയർ ഇഞ്ജിനീയർ'
    },
    'البريد': {
      fr: 'Email',
      hi: 'ईमेल',
      bn: 'ইমেইল',
      ne: 'इमेल',
      id: 'Email',
      fil: 'Email',
      tr: 'E-posta',
      zh: '电子邮箱',
      ru: 'Электронная почта',
      es: 'Correo electrónico',
      ml: 'ഇമെയിൽ'
    },
    'الهاتف': {
      fr: 'Téléphone',
      hi: 'फोन',
      bn: 'ফোন',
      ne: 'फोन',
      id: 'Telepon',
      fil: 'Telepono',
      tr: 'Telefon',
      zh: '电话',
      ru: 'Телефон',
      es: 'Teléfono',
      ml: 'ഫോൺ'
    },
    'المدينة': {
      fr: 'Ville',
      hi: 'शहर',
      bn: 'শহর',
      ne: 'शहर',
      id: 'Kota',
      fil: 'Lungsod',
      tr: 'Şehir',
      zh: '城市',
      ru: 'Город',
      es: 'Ciudad',
      ml: 'നഗരം'
    },
    'الشارقة، الإمارات': {
      fr: 'Dubai, Émirats arabes unis',
      hi: 'दुबई, संयुक्त अरब अमीरात',
      bn: 'দুবাই, সংযুক্ত আরব আমিরাত',
      ne: 'दुबई, संयुक्त अरब अमीरात',
      id: 'Dubai, Uni Emirat Arab',
      fil: 'Dubai, United Arab Emirates',
      tr: 'Dubai, Birleşik Arap Emirlikleri',
      zh: '迪拜，阿联酋',
      ru: 'Дубай, Объединённые Арабские Эмираты',
      es: 'Dubai, Emiratos Árabes Unidos',
      ml: 'ദുബായ്, യുണൈറ്റഡ് അറേബ് എമിറേറ്റ്സ്'
    },
    'نبذة مختصرة': {
      fr: 'Résumé professionnel',
      hi: 'व्यावसायिक सारांश',
      bn: 'পেশাগত সারাংশ',
      ne: 'व्यावसायिक सारांश',
      id: 'Ringkasan profesional',
      fil: 'Propesyonal na buod',
      tr: 'Profesyonel özet',
      zh: '专业总结',
      ru: 'Профессиональное резюме',
      es: 'Resumen profesional',
      ml: 'പ്രൊഫെഷണൽ സംഗ്രഹം'
    },
    'اكتب سطرين عن خبرتك وأهدافك': {
      fr: 'Deux lignes sur votre expérience et vos objectifs',
      hi: 'अपने अनुभव और उद्देश्यों के बारे में दो पंक्तियां',
      bn: 'আপনার অভিজ্ঞতা এবং লক্ষ্যগুলি সম্পর্কে দুটি লাইন',
      ne: 'तपाइंको अनुभव र उद्देश्यहरु को बारे मा दुई लाईन',
      id: 'Dua baris tentang pengalaman dan tujuan Anda',
      fil: 'Dalawang linya tungkol sa iyong karanasan at layunin',
      tr: 'Deneyiminiz ve hedefleriniz hakkında iki satır',
      zh: '关于您的经验和目标的两行',
      ru: 'Две строки о вашем опыте и целях',
      es: 'Dos líneas sobre tu experiencia y objetivos',
      ml: 'നിങ്ങളുടെ അനുഭവത്തെയും ലക്ഷ്യങ്ങളെയും കുറിച്ച് രണ്ട് വരികൾ'
    },
    'الخبرات العملية': {
      fr: 'Expérience professionnelle',
      hi: 'कार्य अनुभव',
      bn: 'কর্মক্ষেত্রের অভিজ্ঞতা',
      ne: 'कार्य अनुभव',
      id: 'Pengalaman kerja',
      fil: 'Karanasan sa trabaho',
      tr: 'İş deneyimi',
      zh: '工作经验',
      ru: 'Опыт работы',
      es: 'Experiencia laboral',
      ml: 'പ്രവൃത്തി അനുഭവം'
    },
    'المسمى - الشركة - المدة - أبرز الإنجازات (كل خبرة بسطر)': {
      fr: 'Titre - Entreprise - Durée - réalisations clés (une par ligne)',
      hi: 'शीर्षक - कंपनी - अवधि - मुख्य उपलब्धियां (एक प्रति पंक्ति)',
      bn: 'শিরোনাম - কোম্পানি - মেয়াদ - মূল অর্জন (প্রতি লাইনে একটি)',
      ne: 'शीर्षक - कंपनी - अवधि - मुख्य उपलब्धिहरु (एक प्रति लाईन)',
      id: 'Judul - Perusahaan - Durasi - pencapaian utama (satu per baris)',
      fil: 'Pamagat - Kumpanya - Tagal - pangunahing tagumpay (isa bawat linya)',
      tr: 'Unvan - Şirket - Süre - temel başarılar (satır başına bir)',
      zh: '职位 - 公司 - 工作时间 - 主要成就 (每行一条)',
      ru: 'Должность - Компания - Период - ключевые достижения (по одному в строке)',
      es: 'Puesto - Empresa - Duración - logros clave (uno por línea)',
      ml: 'പദവി - കമ്പനി - സമയാളം - പ്രധാന നേട്ടങ്ങൾ (ഓരോ വരിയിൽ ഒന്ന്)'
    },
    'التعليم': {
      fr: 'Éducation',
      hi: 'शिक्षा',
      bn: 'শিক্ষা',
      ne: 'शिक्ষा',
      id: 'Pendidikan',
      fil: 'Edukasyon',
      tr: 'Eğitim',
      zh: '教育',
      ru: 'Образование',
      es: 'Educación',
      ml: 'വിദ്യാഭ്യാസം'
    },
    'الشهادة - الجامعة - السنة': {
      fr: 'Diplôme - Université - Année',
      hi: 'डिग्री - विश्वविद्यालय - वर्ष',
      bn: 'ডিগ্রী - বিশ্ববিদ্যালয় - বছর',
      ne: 'डिग्री - विश्वविद्यालय - वर्ष',
      id: 'Gelar - Universitas - Tahun',
      fil: 'Degree - Unibersidad - Taon',
      tr: 'Derece - Üniversite - Yıl',
      zh: '学位 - 大学 - 年份',
      ru: 'Степень - Университет - Год',
      es: 'Grado - Universidad - Año',
      ml: 'ബിരുദം - സർവകലാശാല - വർഷം'
    },
    'المهارات': {
      fr: 'Compétences',
      hi: 'कौशल',
      bn: 'দক্ষতা',
      ne: 'कौशल',
      id: 'Keterampilan',
      fil: 'Kasanayan',
      tr: 'Beceriler',
      zh: '技能',
      ru: 'Навыки',
      es: 'Habilidades',
      ml: 'കഴിവുകൾ'
    },
    'افصل بينها بفاصلة': {
      fr: 'Séparés par des virgules',
      hi: 'अल्पविराम से अलग',
      bn: 'কমা দ্বারা বিভক্ত',
      ne: 'अल्पविराम द्वारा अलग',
      id: 'Dipisahkan dengan koma',
      fil: 'Pinaghihiwalay ng mga kuwit',
      tr: 'Virgülle ayrılmış',
      zh: '用逗号分隔',
      ru: 'Разделённые запятыми',
      es: 'Separado por comas',
      ml: 'കോമ ഉപയോഗിച്ച് വിഭജിച്ചിരിക്കുന്നു'
    },
    'اللغات': {
      fr: 'Langues',
      hi: 'भाषाएं',
      bn: 'ভাষাগুলি',
      ne: 'भाषाहरु',
      id: 'Bahasa',
      fil: 'Mga wika',
      tr: 'Diller',
      zh: '语言',
      ru: 'Языки',
      es: 'Idiomas',
      ml: 'ഭാഷകൾ'
    },
    'العربية (لغة أم)، الإنجليزية (متقدم)': {
      fr: 'Français (natif), Anglais (courant)',
      hi: 'हिंदी (देशी), अंग्रेजी (धाराप्रवाह)',
      bn: 'বাংলা (নেটিভ), ইংরেজি (দক্ষ)',
      ne: 'नेपाली (देशी), अंग्रेजी (धाराप्रवाह)',
      id: 'Indonesia (asli), Inggris (fasih)',
      fil: 'Filipino (katutubong), Ingles (May kahusayan)',
      tr: 'Türkçe (anadili), İngilizce (akıcı)',
      zh: '中文（母语），英语（流利）',
      ru: 'Русский (родной), Английский (свободно)',
      es: 'Español (nativo), Inglés (fluido)',
      ml: 'മലയാളം (മാതൃഭാഷ), ഇംഗ്ലീഷ് (സ്വതസിദ്ധം)'
    },
    'الوظيفة/الجهة المستهدفة (لخطاب التقديم)': {
      fr: 'Emploi/entreprise cible (pour la lettre de motivation)',
      hi: 'लक्ष्य नौकरी/कंपनी (कवर लेटर के लिए)',
      bn: 'লক্ষ্য কাজ/সংস্থা (কভার লেটারের জন্য)',
      ne: 'लक्ष्य नौकरी/कंपनी (कभर लेटरको लागि)',
      id: 'Pekerjaan/perusahaan target (untuk surat pengantar)',
      fil: 'Layuning trabaho/kumpanya (para sa cover letter)',
      tr: 'Hedef iş/şirket (ön yazı için)',
      zh: '目标职位/公司 (求职信用)',
      ru: 'Целевая должность/компания (для сопроводительного письма)',
      es: 'Trabajo/empresa objetivo (para carta de presentación)',
      ml: 'ലക്ഷ്യ തൊഴിൽ/കമ്പനി (കവർ ലെറ്റരിന്)'
    },
    'اختياري': {
      fr: 'Optionnel',
      hi: 'वैकल्पिक',
      bn: 'ঐচ্ছিক',
      ne: 'वैकल्पिक',
      id: 'Opsional',
      fil: 'Opsyonal',
      tr: 'İsteğe bağlı',
      zh: '可选',
      ru: 'Необязательно',
      es: 'Opcional',
      ml: 'ഐച്ഛികം'
    },
    'أنشئ سيرتي الذاتية': {
      fr: 'Générer mon CV',
      hi: 'मेरी सीवी जेनरेट करें',
      bn: 'আমার সিভি তৈরি করুন',
      ne: 'मेरो सीवी जेनरेट गर्नुहोस्',
      id: 'Buat CV saya',
      fil: 'Lumikha ng aking CV',
      tr: 'CV\'mi oluştur',
      zh: '生成我的简历',
      ru: 'Создать моё резюме',
      es: 'Generar mi CV',
      ml: 'എന്റെ സിവി സൃഷ്ടിക്കുക'
    },
    'اكتب اسمك على الأقل.': {
      fr: 'Entrez au moins votre nom.',
      hi: 'कम से कम अपना नाम दर्ज करें।',
      bn: 'কমপক্ষে আপনার নাম প্রবেश করুন।',
      ne: 'कम से कम आफ्नो नाम प्रवेश गर्नुहोस्।',
      id: 'Masukkan setidaknya nama Anda.',
      fil: 'Ilagay ang hindi bababa sa iyong pangalan.',
      tr: 'En azından adınızı girin.',
      zh: '至少输入您的名字。',
      ru: 'Введите хотя бы ваше имя.',
      es: 'Ingresa al menos tu nombre.',
      ml: 'കുറഞ്ഞത് നിങ്ങളുടെ പേര് നൽകുക.'
    },
    'يصمّم سيرتك الذاتية…': {
      fr: 'Conception de votre CV…',
      hi: 'आपकी सीवी डिजाइन की जा रही है…',
      bn: 'আপনার সিভি ডিজাইন করা হচ্ছে…',
      ne: 'आपको सीवी डिजाइन गरिरहेको छ…',
      id: 'Merancang CV Anda…',
      fil: 'Ginagawa ang iyong CV…',
      tr: 'CV\'niz tasarlanıyor…',
      zh: '正在设计您的简历…',
      ru: 'Разработка вашего резюме…',
      es: 'Diseñando tu CV…',
      ml: 'നിങ്ങളുടെ സിവി ഡിസൈൻ ചെയ്യുന്നു…'
    },
    'سيرتك الذاتية': {
      fr: 'Votre CV',
      hi: 'आपकी सीवी',
      bn: 'আপনার সিভি',
      ne: 'आपको सीवी',
      id: 'CV Anda',
      fil: 'Ang iyong CV',
      tr: 'Sizin CV\'niz',
      zh: '您的简历',
      ru: 'Ваше резюме',
      es: 'Tu CV',
      ml: 'നിങ്ങളുടെ സിവി'
    },
    'حفظ PDF': {
      fr: 'Enregistrer PDF',
      hi: 'PDF सहेजें',
      bn: 'PDF সংরক্ষণ করুন',
      ne: 'PDF बचाउनुहोस्',
      id: 'Simpan PDF',
      fil: 'I-save ang PDF',
      tr: 'PDF\'i kaydet',
      zh: '保存 PDF',
      ru: 'Сохранить PDF',
      es: 'Guardar PDF',
      ml: 'പിഡിഎഫ് സംരക്ഷിക്കുക'
    },
    'تعديل البيانات': {
      fr: 'Modifier les données',
      hi: 'जानकारी संपादित करें',
      bn: 'তথ্য সম্পাদনা করুন',
      ne: 'जानकारी सम्पादन गर्नुहोस्',
      id: 'Edit informasi',
      fil: 'I-edit ang impormasyon',
      tr: 'Bilgileri düzenle',
      zh: '编辑信息',
      ru: 'Редактировать информацию',
      es: 'Editar información',
      ml: 'വിവരം തിരുത്തുക'
    },
    'خطاب التقديم': {
      fr: 'Lettre de motivation',
      hi: 'कवर लेटर',
      bn: 'কভার লেটার',
      ne: 'कभर लेटर',
      id: 'Surat pengantar',
      fil: 'Cover letter',
      tr: 'Ön yazı',
      zh: '求职信',
      ru: 'Сопроводительное письмо',
      es: 'Carta de presentación',
      ml: 'കവർ ലെറ്റർ'
    },
    'نصيحة: من نافذة الطباعة اختر «حفظ كـ PDF».': {
      fr: 'Conseil: dans la fenêtre d\'impression choisissez « Enregistrer en PDF ».',
      hi: 'सुझाव: प्रिंट विंडो में « PDF के रूप में सहेजें » चुनें।',
      bn: 'টিপ: প্রিন্ট উইন্ডো থেকে « PDF হিসাবে সংরক্ষণ করুন » চয়ন করুন।',
      ne: 'सुझाव: प्रिन्ट विन्डोमा « PDF को रूपमा बचाउनुहोस् » छनौट गर्नुहोस्।',
      id: 'Tip: di jendela cetak pilih « Simpan sebagai PDF ».',
      fil: 'Tip: sa print window piliin « I-save bilang PDF ».',
      tr: 'İpucu: yazdırma penceresinden PDF olarak kaydet seçeneğini seçin.',
      zh: '提示: 在打印窗口中选择"保存为 PDF"。',
      ru: 'Совет: в окне печати выберите « Сохранить в PDF ».',
      es: 'Consejo: en la ventana de impresión elige « Guardar como PDF ».',
      ml: 'നുറുങ്ങ്: പ്രിന്റ് വിൻഡോയിൽ « PDF കൂടി സംരക്ഷിക്കുക » തിരഞ്ഞെടുക്കുക।'
    },
    'اسمح بالنوافذ المنبثقة للطباعة.': {
      fr: 'Autorisez les fenêtres pop-up pour l\'impression.',
      hi: 'प्रिंटिंग के लिए पॉप-अप की अनुमति दें।',
      bn: 'প্রিন্টিংয়ের জন্য পপ-আপ অনুমতি দিন।',
      ne: 'प्रिन्टिङको लागि पप-अप अनुमति दिनुहोस्।',
      id: 'Izinkan jendela pop-up untuk pencetakan.',
      fil: 'Hayaan ang mga pop-up para sa pagpi-print.',
      tr: 'Yazdırma için açılır pencerelere izin verin.',
      zh: '允许弹出窗口用于打印。',
      ru: 'Разрешите всплывающие окна для печати.',
      es: 'Permite ventanas emergentes para imprimir.',
      ml: 'പ്രിന്റിംഗിനായി പോപ്പ്-അപ്പ് അനുമതി നൽകുക.'
    }
  };
  /* v-tools-i18n: كل أداة بلغة مستخدمها — عربي/أردو ← عربي، وغيرهما ← إنجليزي */
  function docL(ar, en){
    /* v657: كل لغة بنصّها عبر القاموس الثنائيّ __BI؛ الرجوع ar/en عند غيابه. */
    try{ if(typeof window.__bT === 'function'){ var v = window.__bT(ar, en); if(v) return v; } }
    catch(_){ /* guard-ok: tool label lookup is cosmetic — falls back below. */ }
    var l = (typeof lang !== 'undefined' && lang) ? lang : 'ar';
    if(l === 'ar' || l === 'ur') return ar;
    if(l === 'en') return en;
    var m = DOC_XL[ar];
    return (m && m[l]) || en;
  }
  function T(ar,en){ return docL(ar,en); }

  /* ===================== 📄 مساعد المستندات ===================== */
  (function(){
    var modal=document.getElementById('docModal'), body=document.getElementById('docBody');
    var curFile=null, curImgs=[], docText='', history=[];
    function open(){ modal.classList.add('open'); document.getElementById('docTitleH').textContent=T('📄 مساعد المستندات','📄 Document Assistant'); intro(); }
    function close(){ modal.classList.remove('open'); }
    function intro(){
      curFile=null; curImgs=[]; docText=''; history=[];
      body.innerHTML=''+
        '<div class="xmDrop" id="docDrop">📄 '+T('ارفع مستندك','Upload your document')+'<small>'+T('عقد · فاتورة · تقرير · عرض سعر (PDF أو صورة)','Contract · Invoice · Report · Quote (PDF or image)')+'</small></div>'+
        '<input type="file" id="docFile" accept="application/pdf,image/*" style="display:none">'+
        '<div id="docPick" style="margin-top:8px;font-size:12.5px;opacity:.8;text-align:center"></div>'+
        '<button class="xmLink" id="docPasteT">'+T('أو الصق نص المستند','Or paste document text')+'</button>'+
        '<div class="xmPaste" id="docPasteW"><textarea id="docPaste" placeholder="'+T('الصق نص المستند هنا…','Paste document text here…')+'"></textarea></div>'+
        '<button class="xmGo" id="docGo">'+T('حلّل المستند','Analyze document')+'</button>'+
        '<div id="docErr"></div>';
      var drop=document.getElementById('docDrop'), fi=document.getElementById('docFile');
      drop.onclick=function(){ fi.click(); };
      fi.onchange=function(){ if(fi.files&&fi.files[0]){ curFile=fi.files[0]; curImgs=[]; document.getElementById('docPick').textContent='✅ '+curFile.name; } };
      document.getElementById('docPasteT').onclick=function(){ var w=document.getElementById('docPasteW'); w.style.display=w.style.display==='block'?'none':'block'; };
      document.getElementById('docGo').onclick=run;
    }
    async function run(){
      var txt=(document.getElementById('docPaste')||{}).value||'';
      if(!curFile && !txt.trim()){ document.getElementById('docErr').innerHTML='<div class="xmErr">'+T('ارفع ملفًا أو الصق نصًا أولًا.','Upload a file or paste text first.')+'</div>'; return; }
      body.innerHTML='<div class="xmBusy"><div class="xmSpin"></div><div>'+T('يقرأ مستندك…','Reading your document…')+'</div></div>';
      try{
        var payload={text:txt};
        if(curFile){ var b64=await fileToB64(curFile); if(/pdf/i.test(curFile.type)) { payload.fileBase64=b64; payload.mime='application/pdf'; } else { payload.fileBase64=b64; payload.mime=curFile.type||'image/jpeg'; } }
        var d=await api('docqa',payload);
        docText=d.doc.docText||txt||''; history=[];
        render(d.doc);
      }catch(e){ body.innerHTML=''; intro(); document.getElementById('docErr').innerHTML='<div class="xmErr">'+E(e.message)+'</div>'; }
    }
    function render(doc){
      var fields=(doc.fields||[]).map(function(f){ return '<div class="xmFCard"><div class="k">'+E(f.label)+'</div><div class="v">'+E(f.value)+'</div></div>'; }).join('');
      var kps=(doc.keypoints||[]).map(function(k){ return '<li>'+E(k)+'</li>'; }).join('');
      body.innerHTML=''+
        '<div class="xmBadge">'+E(doc.docType||T('مستند','Document'))+'</div>'+
        '<h2 style="margin:0 0 10px;font-size: var(--fs-1)">'+E(doc.title||'')+'</h2>'+
        (fields?'<div class="xmSecTitle">'+T('البيانات الرئيسية','Key details')+'</div><div class="xmFields">'+fields+'</div>':'')+
        '<div class="xmSecTitle">'+T('الملخص','Summary')+'</div><div class="xmMd">'+md(doc.summary)+'</div>'+
        (kps?'<div class="xmSecTitle">'+T('نقاط مهمة','Important points')+'</div><ul class="xmKp">'+kps+'</ul>':'')+
        '<div class="xmSecTitle">'+T('اسأل عن المستند','Ask about the document')+'</div>'+
        '<div class="xmChips">'+
          ['كم المبلغ الإجمالي؟','متى ينتهي/يبدأ؟','ما الشروط الجزائية؟','لخّص لي التزاماتي'].map(function(c,i){
            var en=['What is the total?','When does it start/end?','What are the penalties?','Summarize my obligations'][i];
            return '<button class="xmChip" data-q="'+E(T(c,en))+'">'+T(c,en)+'</button>'; }).join('')+
        '</div>'+
        '<div class="xmQA" id="docQA"></div>'+
        '<div class="xmQwrap"><input class="xmInp" id="docQ" placeholder="'+T('اكتب سؤالك…','Type your question…')+'"><button id="docSend">➤</button></div>'+
        '<button class="xmLink" id="docNew" style="display:block;margin:18px auto 0">↻ '+T('مستند جديد','New document')+'</button>';
      Array.prototype.forEach.call(body.querySelectorAll('.xmChip'),function(ch){ ch.onclick=function(){ document.getElementById('docQ').value=ch.getAttribute('data-q'); ask(); }; });
      document.getElementById('docSend').onclick=ask;
      document.getElementById('docQ').addEventListener('keydown',function(e){ if(e.key==='Enter') ask(); });
      document.getElementById('docNew').onclick=intro;
    }
    async function ask(){
      var inp=document.getElementById('docQ'), q=inp.value.trim(); if(!q) return;
      inp.value=''; var qa=document.getElementById('docQA');
      qa.insertAdjacentHTML('beforeend','<div class="xmQ">'+E(q)+'</div>');
      var aId='a'+Date.now(); qa.insertAdjacentHTML('beforeend','<div class="xmA" id="'+aId+'">…</div>');
      qa.scrollIntoView(false);
      try{
        var d=await api('docask',{docText:docText,question:q,history:history});
        document.getElementById(aId).innerHTML=md(d.answer);
        history.push({role:'user',content:q}); history.push({role:'assistant',content:d.answer});
      }catch(e){ document.getElementById(aId).innerHTML='<span style="color:#fca5a5">'+E(e.message)+'</span>'; }
    }
    var b=document.getElementById('btnDocs'); if(b) b.addEventListener('click',open);
    document.getElementById('docX').onclick=close;
    modal.addEventListener('click',function(e){ if(e.target===modal) close(); });
  })();

  /* ===================== 🧾 المعاملات الحكومية ===================== */
  (function(){
    var modal=document.getElementById('govModal'), body=document.getElementById('govBody');
    function open(){ modal.classList.add('open'); document.getElementById('govTitleH').textContent=T('🧾 المعاملات الحكومية','🧾 Government Services'); intro(); }
    function close(){ modal.classList.remove('open'); }
    function intro(){
      body.innerHTML=''+
        '<div style="font-size: var(--fs-3);opacity:.85;line-height:1.7;margin-bottom:10px">'+T('اسأل عن أي معاملة حكومية إماراتية — الخطوات والرسوم والرابط الرسمي، ببحث حي.','Ask about any UAE government service — steps, fees and the official link, with live search.')+'</div>'+
        '<div class="xmChips" id="govChips">'+
          ['تجديد الإقامة','تجديد رخصة تجارية','دفع مخالفات مرورية','تجديد بطاقة الهوية','تأمين على السيارة','تجديد جواز السفر'].map(function(c,i){
            var en=['Renew residence visa','Renew trade license','Pay traffic fines','Renew Emirates ID','Car insurance','Renew passport'][i];
            return '<button class="xmChip" data-q="'+E(T(c,en))+'">'+T(c,en)+'</button>'; }).join('')+
        '</div>'+
        '<div class="xmQwrap" style="position:static;background:none"><input class="xmInp" id="govQ" placeholder="'+T('اكتب معاملتك… مثال: كيف أجدّد رخصتي التجارية في الشارقة؟','Type your service… e.g. how to renew my trade license?')+'"><button id="govSend">➤</button></div>'+
        '<div id="govOut"></div>';
      Array.prototype.forEach.call(body.querySelectorAll('.xmChip'),function(ch){ ch.onclick=function(){ document.getElementById('govQ').value=ch.getAttribute('data-q'); run(); }; });
      document.getElementById('govSend').onclick=run;
      document.getElementById('govQ').addEventListener('keydown',function(e){ if(e.key==='Enter') run(); });
    }
    async function run(){
      var q=(document.getElementById('govQ')||{}).value||''; if(!q.trim()) return;
      var out=document.getElementById('govOut');
      out.innerHTML='<div class="xmBusy"><div class="xmSpin"></div><div>'+T('يبحث في المصادر الرسمية…','Searching official sources…')+'</div></div>';
      try{
        var d=await api('gov',{query:q});
        var src=(d.sources||[]).map(function(s){ return '<a class="xmSrc" href="'+E(s.url)+'" target="_blank" rel="noopener">🔗 '+E(s.title||s.url)+'</a>'; }).join('');
        out.innerHTML='<div class="xmMd" style="margin-top:6px">'+md(d.answer)+'</div>'+(src?'<div class="xmSecTitle">'+T('المصادر الرسمية','Official sources')+'</div>'+src:'');
      }catch(e){ out.innerHTML='<div class="xmErr">'+E(e.message)+'</div>'; }
    }
    var b=document.getElementById('btnGov'); if(b) b.addEventListener('click',open);
    document.getElementById('govX').onclick=close;
    modal.addEventListener('click',function(e){ if(e.target===modal) close(); });
  })();

  /* ===================== 💼 مولّد السيرة الذاتية ===================== */
  (function(){
    var modal=document.getElementById('cvModal'), body=document.getElementById('cvBody');
    function open(){ modal.classList.add('open'); document.getElementById('cvTitleH').textContent=T('💼 مولّد السيرة الذاتية','💼 CV Builder'); form(); }
    function close(){ modal.classList.remove('open'); }
    function fld(id,label,ph,ta){ return '<div class="xmField"><label>'+E(label)+'</label>'+(ta?'<textarea id="'+id+'" placeholder="'+E(ph)+'"></textarea>':'<input class="xmInp" id="'+id+'" placeholder="'+E(ph)+'">')+'</div>'; }
    function form(){
      body.innerHTML=''+
        '<div style="font-size: var(--fs-3);opacity:.8;margin-bottom:14px">'+T('عبّئ بياناتك وسنصمّم لك سيرة ذاتية احترافية + خطاب تقديم جاهز للطباعة PDF.','Fill your info and get a professional CV + cover letter ready as PDF.')+'</div>'+
        fld('cvName',T('الاسم الكامل *','Full name *'),T('عمر عبدالله','John Doe'))+
        fld('cvJob',T('المسمى الوظيفي','Job title'),T('مهندس برمجيات','Software Engineer'))+
        '<div class="xmFields">'+
          '<div class="xmField"><label>'+T('البريد','Email')+'</label><input class="xmInp" id="cvEmail" placeholder="name@email.com"></div>'+
          '<div class="xmField"><label>'+T('الهاتف','Phone')+'</label><input class="xmInp" id="cvPhone" placeholder="+9715..."></div>'+
        '</div>'+
        fld('cvCity',T('المدينة','City'),T('الشارقة، الإمارات','Dubai, UAE'))+
        fld('cvSummary',T('نبذة مختصرة','Professional summary'),T('اكتب سطرين عن خبرتك وأهدافك','Two lines about your experience & goals'),true)+
        fld('cvExp',T('الخبرات العملية','Work experience'),T('المسمى - الشركة - المدة - أبرز الإنجازات (كل خبرة بسطر)','Title - Company - Duration - key achievements (one per line)'),true)+
        fld('cvEdu',T('التعليم','Education'),T('الشهادة - الجامعة - السنة','Degree - University - Year'),true)+
        fld('cvSkills',T('المهارات','Skills'),T('افصل بينها بفاصلة','Comma separated'))+
        fld('cvLangs',T('اللغات','Languages'),T('العربية (لغة أم)، الإنجليزية (متقدم)','Arabic (native), English (fluent)'))+
        fld('cvTarget',T('الوظيفة/الجهة المستهدفة (لخطاب التقديم)','Target job/company (for cover letter)'),T('اختياري','Optional'))+
        '<button class="xmGo" id="cvGo">'+T('أنشئ سيرتي الذاتية','Generate my CV')+'</button>'+
        '<div id="cvErr"></div>';
      document.getElementById('cvGo').onclick=run;
    }
    function val(id){ var el=document.getElementById(id); return el?el.value.trim():''; }
    async function run(){
      var name=val('cvName');
      if(!name){ document.getElementById('cvErr').innerHTML='<div class="xmErr">'+T('اكتب اسمك على الأقل.','Enter your name at least.')+'</div>'; return; }
      var info={ name:name, jobTitle:val('cvJob'), email:val('cvEmail'), phone:val('cvPhone'), city:val('cvCity'), summary:val('cvSummary'), experience:val('cvExp'), education:val('cvEdu'), skills:val('cvSkills'), languages:val('cvLangs'), targetJob:val('cvTarget') };
      body.innerHTML='<div class="xmBusy"><div class="xmSpin"></div><div>'+T('يصمّم سيرتك الذاتية…','Designing your CV…')+'</div></div>';
      try{
        var d=await api('cv',{info:info});
        result(d.cvHtml, d.coverLetter);
      }catch(e){ form(); document.getElementById('cvErr').innerHTML='<div class="xmErr">'+E(e.message)+'</div>'; }
    }
    var lastHtml='';
    function result(html, cover){
      lastHtml=html;
      body.innerHTML=''+
        '<div class="xmSecTitle">'+T('سيرتك الذاتية','Your CV')+'</div>'+
        '<iframe id="cvFrame" style="width:100%;height:520px;border:1px solid rgba(255,255,255,.14);border-radius:var(--r-3);background:#fff"></iframe>'+
        '<div class="xmActBtns"><button id="cvPdf">⬇️ '+T('حفظ PDF','Save PDF')+'</button><button id="cvEdit">✏️ '+T('تعديل البيانات','Edit info')+'</button></div>'+
        (cover?'<div class="xmSecTitle">'+T('خطاب التقديم','Cover letter')+'</div><div class="xmMd" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:var(--r-3);padding:14px">'+md(cover)+'</div>':'')+
        '<div class="xmDisc">'+T('نصيحة: من نافذة الطباعة اختر «حفظ كـ PDF».','Tip: in the print dialog choose “Save as PDF”.')+'</div>';
      var fr=document.getElementById('cvFrame');
      try{ fr.contentDocument.open(); fr.contentDocument.write(html); fr.contentDocument.close(); }catch(e){ __swallow(e, "misc:index#26"); }
      document.getElementById('cvPdf').onclick=function(){
        var w=window.open('','_blank'); if(!w){ alert(T('اسمح بالنوافذ المنبثقة للطباعة.','Allow pop-ups to print.')); return; }
        w.document.write(lastHtml+'<script>setTimeout(function(){window.print();},400);<\/script>'); w.document.close();
      };
      document.getElementById('cvEdit').onclick=form;
    }
    var b=document.getElementById('btnCV'); if(b) b.addEventListener('click',open);
    document.getElementById('cvX').onclick=close;
    modal.addEventListener('click',function(e){ if(e.target===modal) close(); });
  })();
})();

/* ══════════════════════════════════════════════════════════════════════════
   v472 · Strangler: زرّ «مولّد السيرة الذاتية» → حوار داخل الدردشة
   ──────────────────────────────────────────────────────────────────────────
   • لم يُحذف سطر واحد من المسار القديم (نافذة ١٠ حقول → api/cv → 410).
     النقر يُعترض في مرحلة الالتقاط على document فلا يصل إلى المستمع القديم.
     التراجع = حذف هذه الكتلة وحدها، ويعود القديم كما كان.
   • الصياغة مُختبرة ضدّ بوّابات الحزمة الخمس (__strongBuildRe · GATE_BUILD_RE
     · GATE_CMD_RE · BUILD_TASK_RE · __deepRe384): صفر تطابق — فتبقى حوارًا
     ولا تُقرأ كطلب بناء صفحة HTML. («أريد سيرة ذاتية…» كانت تُطابق
     GATE_CMD_RE فاستُبدلت بـ«ساعدني…».)
   • «أنا في الإمارات»: قياس حيّ أثبت أنّ الردّ يفترض الولايات المتحدة تلقائيًّا.
     السياق مزروع في الصياغة — لا في الخادم — فيبقى الإصلاح داخل هذا الملفّ.
   • كتم البحث الحيّ وملاحظة القدرات: تغليف مقيّد بمطابقة حرفيّة لنصوصنا
     وحدها (MINE). أي طلب آخر يمرّ إلى الدالّة الأصليّة بلا تغيير.
     قياس حيّ أثبت أنّ نداء الحزمة يمرّ عبر window فالتغليف فعّال.
   • يعمل أيضًا مع النقر البرمجيّ من openFeatureById() (أيقونة القدرات ✨)،
     فيُغلَق الطريق إلى النافذة المتقاعدة من بابيه.
   ══════════════════════════════════════════════════════════════════════════ */
(function(){
  var CHAT_ROUTES = {
    btnCV: {
      ar: 'ساعدني في إعداد سيرتي الذاتية. أنا في الإمارات — لا تفترض أي بلد آخر. اسألني سؤالاً واحداً في كل مرة، وابدأ الآن بالسؤال الأول.',
      en: 'Help me prepare my CV. I am in the UAE — do not assume any other country. Ask me one question at a time, and start now with the first question.'
    }
  };

  /* نصوصنا بالحرف — مرجع الكتم الوحيد. لا شيء خارجها يُمَسّ. */
  var MINE = [];
  Object.keys(CHAT_ROUTES).forEach(function(k){
    var r = CHAT_ROUTES[k];
    Object.keys(r).forEach(function(L){ MINE.push(String(r[L]).trim()); });
  });
  function isMine(t){ return MINE.indexOf(String(t == null ? '' : t).trim()) !== -1; }

  /* التغليف يُركَّب عند أوّل نقر: الحزمة تكون قد حُمّلت بالكامل حينها. */
  var wrapped = false;
  function silenceForOurPrompts(){
    if(wrapped) return;
    wrapped = true;
    var origSearch = window.smartMaybeSearch;
    if(typeof origSearch === 'function'){
      window.smartMaybeSearch = function(text){
        /* طلبنا حوار لا سؤال معلوماتيّ: لا بحث حيّ، ولا تأخير، ولا تلويث للردّ. */
        if(isMine(text)) return Promise.resolve(null);
        return origSearch.apply(this, arguments);
      };
    }
    var origHint = window.capabilityHintFor;
    if(typeof origHint === 'function'){
      window.capabilityHintFor = function(userText){
        /* لا تقترح على عمران الميزة التي هو داخلها أصلًا. */
        if(isMine(userText)) return null;
        return origHint.apply(this, arguments);
      };
    }
  }

  function pick(r){
    var L = 'ar';
    try{
      L = ((typeof lang !== 'undefined' && lang) ? String(lang) : (document.documentElement.getAttribute('lang') || 'ar')).slice(0,2).toLowerCase();
    }catch(e){ /* صمت مقصود: تعذّر قراءة سمة اللغة ⇒ العربيّة هي الافتراض أصلًا */ }
    /* v-tools-i18n: عربي/أردو ← عربي، وغيرهما ← إنجليزي */
    return (L === 'ar' || L === 'ur') ? r.ar : (r.en || r.ar);
  }

  function toChat(txt){
    silenceForOurPrompts();
    try{
      if(typeof window.closeDrawers === 'function') window.closeDrawers();
    }catch(e){ /* صمت مقصود: فشل إغلاق الأدراج تجميليّ ولا يجوز أن يمنع الحوار */ }
    try{
      if(typeof window.closeMsgMoreMenu === 'function') window.closeMsgMoreMenu();
    }catch(e){ /* صمت مقصود: القائمة الصغيرة تُغلق بالنقرة التالية على أي حال */ }
    var p = document.getElementById('prompt');
    if(!p) return;
    p.value = txt;
    try{
      p.dispatchEvent(new Event('input', { bubbles: true }));
    }catch(e){ /* صمت مقصود: الحدث لتنمية الصندوق فقط — النصّ مزروع والإرسال يتمّ */ }
    if(typeof window.sendPrompt === 'function'){
      try{ window.sendPrompt(); return; }
      catch(e){ /* صمت مقصود: نسقط إلى نقر زرّ الإرسال أدناه كبديل مكافئ */ }
    }
    var s = document.getElementById('btnSend');
    if(s){
      try{ s.click(); return; }
      catch(e){ /* صمت مقصود: نسقط إلى تبئير الصندوق ليُرسل عمران بنفسه */ }
    }
    try{ p.focus(); }
    catch(e){ /* صمت مقصود: التبئير آخر محاولة تحسينيّة، والنصّ ظاهر أمامه */ }
  }

  document.addEventListener('click', function(e){
    var t = (e.target && e.target.closest) ? e.target.closest('button[id]') : null;
    if(!t) return;
    var r = CHAT_ROUTES[t.id];
    if(!r) return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    toChat(pick(r));
  }, true);
})();
