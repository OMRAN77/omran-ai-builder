(function(){
  var EXP_I18N = {
    ar:{title:'محلّل مصاريفي',intro:'ارفع كشف حسابك البنكي (PDF أو صورة) ويحلّل مصاريفك ويصنّفها',pick:'📄 اختر كشف حساب (PDF / صورة)',hint:'PDF أو صورة واضحة للكشف',paste:'أو الصق قائمة المصاريف نصًا',pastePh:'الصق حركات الحساب أو المصاريف هنا…',go:'حلّل المصاريف',busy:'يحلل مصاريفك…',total:'إجمالي المصاريف',tx:'حركة',dist:'توزيع المصاريف',biggest:'أكبر مصروف',tips:'نصائح توفير',again:'تحليل كشف آخر',disc:'بيانات تقريبية مبنية على تحليل الملف — للاسترشاد فقط وليست نصيحة مالية.',noContent:'اختر ملفًا أو الصق نصًا أولًا',err:'تعذّر التحليل، حاول مرة أخرى'},
    en:{title:'Expense Analyzer',intro:'Upload your bank statement (PDF or image) to categorize your spending',pick:'📄 Choose a statement (PDF / image)',hint:'PDF or a clear photo of the statement',paste:'Or paste your expenses as text',pastePh:'Paste account transactions or expenses here…',go:'Analyze Expenses',busy:'Analyzing your spending…',total:'Total Spending',tx:'transactions',dist:'Spending Breakdown',biggest:'Biggest Expense',tips:'Saving Tips',again:'Analyze another statement',disc:'Approximate figures from file analysis — for guidance only, not financial advice.',noContent:'Pick a file or paste text first',err:'Analysis failed, please try again'},
    fr:{title:'Analyseur de dépenses',intro:'Téléchargez votre relevé bancaire (PDF ou image) pour catégoriser vos dépenses',pick:'📄 Choisir un relevé (PDF / image)',hint:'PDF ou une photo claire du relevé',paste:'Ou collez vos dépenses sous forme de texte',pastePh:'Collez les transactions ou dépenses du compte ici…',go:'Analyser les dépenses',busy:'Analyse de vos dépenses…',total:'Total des dépenses',tx:'transactions',dist:'Détail des dépenses',biggest:'Dépense la plus importante',tips:'Conseils d\'économies',again:'Analyser un autre relevé',disc:'Chiffres approximatifs provenant de l\'analyse du fichier — à titre informatif uniquement, non un conseil financier.',noContent:'Choisissez d\'abord un fichier ou collez du texte',err:'Analyse échouée, veuillez réessayer'},
    hi:{title:'खर्च विश्लेषक',intro:'अपने बैंक विवरण (PDF या छवि) अपलोड करें अपना खर्च वर्गीकृत करने के लिए',pick:'📄 एक विवरण चुनें (PDF / छवि)',hint:'PDF या विवरण की स्पष्ट फोटो',paste:'या अपने खर्च पाठ के रूप में पेस्ट करें',pastePh:'यहाँ खाता लेनदेन या खर्च पेस्ट करें…',go:'खर्च का विश्लेषण करें',busy:'आपके खर्च का विश्लेषण किया जा रहा है…',total:'कुल खर्च',tx:'लेनदेन',dist:'खर्च विवरण',biggest:'सबसे बड़ा खर्च',tips:'बचत सुझाव',again:'दूसरे विवरण का विश्लेषण करें',disc:'फाइल विश्लेषण से अनुमानित आंकड़े — केवल मार्गदर्शन के लिए, वित्तीय सलाह नहीं।',noContent:'पहले एक फाइल चुनें या पाठ पेस्ट करें',err:'विश्लेषण विफल, कृपया पुनः प्रयास करें'},
    bn:{title:'ব্যয় বিশ্লেষক',intro:'আপনার ব্যাংক স্টেটমেন্ট (PDF বা ছবি) আপলোড করুন আপনার খরচ বিভাগীকরণ করতে',pick:'📄 একটি স্টেটমেন্ট চয়ন করুন (PDF / ছবি)',hint:'PDF বা স্টেটমেন্টের পরিষ্কার ফটো',paste:'বা আপনার খরচ পাঠ হিসাবে পেস্ট করুন',pastePh:'এখানে অ্যাকাউন্ট লেনদেন বা খরচ পেস্ট করুন…',go:'ব্যয় বিশ্লেষণ করুন',busy:'আপনার খরচ বিশ্লেষণ করা হচ্ছে…',total:'মোট খরচ',tx:'লেনদেন',dist:'ব্যয় বিভাজন',biggest:'সবচেয়ে বড় খরচ',tips:'সাশ্রয় টিপস',again:'অন্য স্টেটমেন্ট বিশ্লেষণ করুন',disc:'ফাইল বিশ্লেষণ থেকে অনুমানিত সংখ্যা — শুধুমাত্র নির্দেশনার জন্য, আর্থিক পরামর্শ নয়।',noContent:'প্রথমে একটি ফাইল চয়ন করুন বা পাঠ পেস্ট করুন',err:'বিশ্লেষণ ব্যর্থ, আবার চেষ্টা করুন'},
    ne:{title:'खर्च विश्लेषक',intro:'आपको बैंक स्टेटमेन्ट (PDF वा छवि) अपलोड गर्नुहोस् आपको खर्च वर्गीकृत गर्न',pick:'📄 स्टेटमेन्ट चयन गर्नुहोस् (PDF / छवि)',hint:'PDF वा स्टेटमेन्टको स्पष्ट फोटो',paste:'वा आपको खर्च पाठको रूपमा पेस्ट गर्नुहोस्',pastePh:'यहाँ खाता लेनदेन वा खर्च पेस्ट गर्नुहोस्…',go:'खर्च विश्लेषण गर्नुहोस्',busy:'आपको खर्च विश्लेषण गरिँदै छ…',total:'कुल खर्च',tx:'लेनदेन',dist:'खर्च विवरण',biggest:'सबैभन्दा ठूलो खर्च',tips:'बचत सुझाव',again:'अर्को स्टेटमेन्ट विश्लेषण गर्नुहोस्',disc:'फाइल विश्लेषणबाट अनुमानित आंकडा — मार्गदर्शन मात्रको लागि, आर्थिक सल्लाह होइन।',noContent:'पहिले फाइल चयन गर्नुहोस् वा पाठ पेस्ट गर्नुहोस्',err:'विश्लेषण विफल, कृपया पुनः प्रयास गर्नुहोस्'},
    id:{title:'Penganalisis Pengeluaran',intro:'Unggah pernyataan bank Anda (PDF atau gambar) untuk mengkategorikan pengeluaran Anda',pick:'📄 Pilih pernyataan (PDF / gambar)',hint:'PDF atau foto jelas dari pernyataan',paste:'Atau tempel pengeluaran Anda sebagai teks',pastePh:'Tempel transaksi atau pengeluaran akun di sini…',go:'Analisis Pengeluaran',busy:'Menganalisis pengeluaran Anda…',total:'Total Pengeluaran',tx:'transaksi',dist:'Rincian Pengeluaran',biggest:'Pengeluaran Terbesar',tips:'Tips Penghematan',again:'Analisis pernyataan lain',disc:'Angka perkiraan dari analisis file — untuk panduan saja, bukan saran keuangan.',noContent:'Pilih file atau tempel teks terlebih dahulu',err:'Analisis gagal, silakan coba lagi'},
    fil:{title:'Expense Analyzer',intro:'Mag-upload ng iyong bank statement (PDF o larawan) upang ikategorya ang iyong gastos',pick:'📄 Pumili ng statement (PDF / larawan)',hint:'PDF o malinaw na larawan ng statement',paste:'O i-paste ang iyong gastos bilang teksto',pastePh:'I-paste ang mga transaksyon o gastos ng account dito…',go:'Suriin ang Gastos',busy:'Sinusuri ang iyong gastos…',total:'Kabuuang Gastos',tx:'transaksyon',dist:'Breakdown ng Gastos',biggest:'Pinakamalaking Gastos',tips:'Mga Tip sa Pagtitipid',again:'Suriin ang iba pang statement',disc:'Tinantyang mga numero mula sa pagsusuri ng file — para sa gabay lamang, hindi payo sa pananalapi.',noContent:'Pumili ng file o i-paste ang teksto muna',err:'Nabigo ang pagsusuri, subukan muli'},
    tr:{title:'Gider Analiz Aracı',intro:'Harcamalarınızı kategorize etmek için banka ekstreniz (PDF veya resim) yükleyin',pick:'📄 Ekstre seçin (PDF / resim)',hint:'Ekstrenin PDF\'si veya net fotoğrafı',paste:'Veya harcamalarınızı metin olarak yapıştırın',pastePh:'Hesap işlemlerini veya harcamalarını buraya yapıştırın…',go:'Harcamaları Analiz Et',busy:'Harcamalarınız analiz ediliyor…',total:'Toplam Harcama',tx:'işlem',dist:'Harcama Dağılımı',biggest:'En Büyük Harcama',tips:'Tasarruf İpuçları',again:'Başka ekstre analiz et',disc:'Dosya analizinden elde edilen yaklaşık rakamlar — yalnızca rehberlik için, finansal tavsiye değildir.',noContent:'Önce bir dosya seçin veya metin yapıştırın',err:'Analiz başarısız, lütfen tekrar deneyin'},
    zh:{title:'支出分析器',intro:'上传您的银行对账单（PDF 或图片）来分类您的支出',pick:'📄 选择对账单（PDF / 图片）',hint:'PDF 或清晰的对账单照片',paste:'或将您的支出粘贴为文本',pastePh:'将账户交易或支出粘贴在此处…',go:'分析支出',busy:'正在分析您的支出…',total:'总支出',tx:'交易',dist:'支出明细',biggest:'最大支出',tips:'省钱提示',again:'分析另一个对账单',disc:'从文件分析获得的近似数据 — 仅供参考，不构成财务建议。',noContent:'请先选择文件或粘贴文本',err:'分析失败，请重试'},
    ru:{title:'Анализатор расходов',intro:'Загрузите выписку из банка (PDF или изображение) для категоризации ваших расходов',pick:'📄 Выберите выписку (PDF / изображение)',hint:'PDF или четкое фото выписки',paste:'Или вставьте свои расходы как текст',pastePh:'Вставьте транзакции или расходы счета здесь…',go:'Анализировать расходы',busy:'Анализируется ваша трата…',total:'Итого расходов',tx:'операции',dist:'Распределение расходов',biggest:'Самый крупный расход',tips:'Советы по экономии',again:'Анализировать другую выписку',disc:'Приблизительные цифры из анализа файла — только для справки, не является финансовым советом.',noContent:'Сначала выберите файл или вставьте текст',err:'Анализ не удался, попробуйте еще раз'},
    es:{title:'Analizador de Gastos',intro:'Cargue su estado de cuenta bancario (PDF o imagen) para categorizar sus gastos',pick:'📄 Elija un estado de cuenta (PDF / imagen)',hint:'PDF o una foto clara del estado de cuenta',paste:'O pegue sus gastos como texto',pastePh:'Pegue las transacciones o gastos de la cuenta aquí…',go:'Analizar Gastos',busy:'Analizando sus gastos…',total:'Gasto Total',tx:'transacciones',dist:'Desglose de Gastos',biggest:'Gasto Más Grande',tips:'Consejos para Ahorrar',again:'Analizar otro estado de cuenta',disc:'Cifras aproximadas del análisis de archivos — solo para orientación, no es asesoramiento financiero.',noContent:'Elija un archivo o pegue texto primero',err:'El análisis falló, intente nuevamente'},
    ml:{title:'ചെലവ് വിശകലനകാരി',intro:'നിങ്ങളുടെ ബാങ്ക് സ്റ്റേറ്റ്മെന്റ് (PDF അല്ലെങ്കിൽ ചിത്രം) അപ്‌ലോഡ് ചെയ്ത് നിങ്ങളുടെ ചെലവ് വിഭാഗീകരിക്കുക',pick:'📄 ഒരു സ്റ്റേറ്റ്മെന്റ് തിരഞ്ഞെടുക്കുക (PDF / ചിത്രം)',hint:'PDF അല്ലെങ്കിൽ സ്റ്റേറ്റ്മെന്റിന്റെ വ്യക്തമായ ഫോട്ടോ',paste:'അല്ലെങ്കിൽ നിങ്ങളുടെ ചെലവ് പാഠമായി ഒട്ടിക്കുക',pastePh:'ഇവിടെ അക്കൌണ്ട് ഇടപാടുകൾ അല്ലെങ്കിൽ ചെലവ് ഒട്ടിക്കുക…',go:'ചെലവ് വിശകലനം ചെയ്യുക',busy:'നിങ്ങളുടെ ചെലവ് വിശകലനം ചെയ്യുന്നു…',total:'മൊത്തം ചെലവ്',tx:'ഇടപാടുകൾ',dist:'ചെലവ് വിതരണം',biggest:'ഏറ്റവും വലിയ ചെലവ്',tips:'സ്ഥിരീകരണ നുറുങ്ങുകൾ',again:'മറ്റൊരു സ്റ്റേറ്റ്മെന്റ് വിശകലനം ചെയ്യുക',disc:'ഫയൽ വിശകലനത്തിൽ നിന്ന് ഏകദേശ കണക്കുകൾ — വെറും നിർദ്ദേശത്തിനായി, സാമ്പത്തിക ഉപദേശം അല്ല।',noContent:'ആദ്യം ഒരു ഫയൽ തിരഞ്ഞെടുക്കുക അല്ലെങ്കിൽ പാഠം ഒട്ടിക്കുക',err:'വിശകലനം പരാജയപ്പെട്ടു, പുനരാവൃത്തി ചെയ്യുക'}
  };
  function eLang(){ try{ return (typeof lang!=='undefined'&&lang)?String(lang):(localStorage.getItem('aiapp_lang')||'ar'); }catch(e){ return 'ar'; } }
  /* v-exp-i18n (شكوى المالك ٢٩ أغسطس: المحلّل إنجليزي وسط واجهة المليالم):
     المترجم العام (exp_*) أولًا لكل الـ14 لغة، والاحتياط بقاعدة v-tools-i18n
     من main: عربي/أردو ← عربي، وغيرهما ← إنجليزي. */
  function eT(k){
    /* دمج: مفاتيح المترجم العام (exp_*) أولًا، ثم جدول اللغات الـ15 المحلي */
    try{ if(typeof window.t==='function'){ var g=window.t('exp_'+k); if(g && g!=='exp_'+k) return g; } }catch(e){ /* i18n لم يجهز */ }
    var l = eLang();
    if (l === 'ar' || l === 'ur') {
      return EXP_I18N.ar[k] || EXP_I18N.en[k] || k;
    }
    var langObj = EXP_I18N[l];
    return (langObj && langObj[k]) || EXP_I18N.en[k] || EXP_I18N.ar[k] || k;
  }
  function eRTL(){ return ['ar','ur'].indexOf(eLang())>=0; }
  function eEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function eTok(){ try{ return (typeof authGet==='function'?authGet('aiapp_auth_token'):null)||localStorage.getItem('aiapp_auth_token')||sessionStorage.getItem('aiapp_auth_token')||''; }catch(e){ return ''; } }
  var PAL = ['#34d399','#6b7280','#f59e0b','#38bdf8','#f472b6','#a3e635','#fb7185','#9ca3af'];
  var modal=document.getElementById('expModal'), body=document.getElementById('expBody'), fileInput=document.getElementById('expFile');
  var pending=null; // {base64,mime,name}

  function fmtNum(n){ try{ return Number(n).toLocaleString('en-US',{maximumFractionDigits:0}); }catch(e){ return n; } }

  function openModal(){
    document.getElementById('expTitleTxt').textContent = eT('title');
    modal.setAttribute('dir', eRTL()?'rtl':'ltr');
    renderIntro();
    modal.classList.add('open');
    try{ var dd=document.getElementById('headerMenuDropdown'); if(dd) dd.classList.remove('open'); }catch(e){ __swallow(e, "ui:index#25"); }
  }
  function closeModal(){ modal.classList.remove('open'); pending=null; }

  function renderIntro(err){
    pending=null; fileInput.value='';
    body.innerHTML =
      '<p style="opacity:.8;font-size: var(--fs-3);text-align:center;margin:2px 0 16px;line-height:1.6">'+eEsc(eT('intro'))+'</p>'+
      '<div class="expDrop" id="expDrop"><svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg><span id="expDropLabel">'+eEsc(eT('pick'))+'</span><small>'+eEsc(eT('hint'))+'</small></div>'+
      '<div style="text-align:center"><button class="expPasteToggle" id="expPasteToggle">'+eEsc(eT('paste'))+'</button></div>'+
      '<div class="expPaste" id="expPaste"><textarea id="expText" placeholder="'+eEsc(eT('pastePh'))+'"></textarea></div>'+
      '<button class="expGo" id="expGo">'+eEsc(eT('go'))+'</button>'+
      (err?'<div class="expErr">'+eEsc(err)+'</div>':'')+
      '<div class="expDisc">'+eEsc(eT('disc'))+'</div>';
    document.getElementById('expDrop').onclick=function(){ fileInput.click(); };
    document.getElementById('expPasteToggle').onclick=function(){ var p=document.getElementById('expPaste'); p.style.display=p.style.display==='block'?'none':'block'; };
    document.getElementById('expGo').onclick=doAnalyze;
  }

  fileInput.onchange=function(){
    var f=fileInput.files&&fileInput.files[0]; if(!f) return;
    var rd=new FileReader();
    rd.onload=function(){ var s=String(rd.result||''); var b64=s.indexOf(',')>=0?s.split(',')[1]:s; pending={base64:b64,mime:f.type||'application/octet-stream',name:f.name};
      var lbl=document.getElementById('expDropLabel'); if(lbl) lbl.textContent='✓ '+f.name; };
    rd.readAsDataURL(f);
  };

  function renderBusy(){ body.innerHTML='<div class="expBusy"><div class="expSpin"></div><div style="font-size: var(--fs-3);font-weight: var(--w-mid);opacity:.85">'+eEsc(eT('busy'))+'</div></div>'; }

  function doAnalyze(){
    var txt=''; var ta=document.getElementById('expText'); if(ta) txt=ta.value.trim();
    if(!pending && !txt){ renderIntro(eT('noContent')); return; }
    renderBusy();
    var payload={ action:'expense', lang:eLang(), token:eTok()||undefined };
    if(pending){ payload.fileBase64=pending.base64; payload.mime=pending.mime; }
    if(txt){ payload.text=txt; }
    fetch('/api/edu',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
      .then(function(res){ if(!res.ok||!res.j||!res.j.report) throw new Error((res.j&&res.j.error)||eT('err')); renderReport(res.j.report); })
      .catch(function(e){ renderIntro(e.message||eT('err')); });
  }

  function renderReport(rep){
    var cats=(rep.categories||[]).slice(0,8);
    var cur=rep.currency||'';
    // donut gradient
    var acc=0, stops=[];
    cats.forEach(function(c,i){ var col=PAL[i%PAL.length]; var from=acc; acc+=(c.pct||0); stops.push(col+' '+from+'% '+acc+'%'); });
    if(acc<100 && cats.length) stops.push('rgba(255,255,255,.08) '+acc+'% 100%');
    var donut = stops.length?('<div class="expDonut" style="background:conic-gradient('+stops.join(',')+')"></div>'):'';
    var legend = cats.map(function(c,i){ var col=PAL[i%PAL.length];
      return '<div class="expLegRow"><span class="expDot" style="background:'+col+'"></span><span class="expLegName">'+eEsc((c.icon||'')+' '+c.name)+'</span><span class="expLegVal">'+fmtNum(c.amount)+' '+eEsc(cur)+'</span><span class="expLegPct">'+(c.pct||0)+'%</span></div>';
    }).join('');
    var tips=(rep.tips||[]).map(function(t){ return '<div class="expTip"><span>✓</span><div>'+eEsc(t)+'</div></div>'; }).join('');
    var big = rep.biggest&&rep.biggest.name ? '<div class="expSecTitle">'+eEsc(eT('biggest'))+'</div><div class="expBig"><span>'+eEsc(rep.biggest.name)+'</span><b style="letter-spacing:0;color:#fca5a5">'+fmtNum(rep.biggest.amount)+' '+eEsc(cur)+'</b></div>' : '';
    body.innerHTML =
      '<div class="expTotal"><div class="lab">'+eEsc(eT('total'))+'</div><div class="val">'+fmtNum(rep.total)+' '+eEsc(cur)+'</div><div class="sub">'+(rep.txCount?rep.txCount+' '+eEsc(eT('tx')):'')+(rep.period?' · '+eEsc(rep.period):'')+'</div></div>'+
      '<div class="expSecTitle">'+eEsc(eT('dist'))+'</div>'+
      '<div class="expChartWrap">'+donut+'<div class="expLegend">'+legend+'</div></div>'+
      big+
      (tips?'<div class="expSecTitle">'+eEsc(eT('tips'))+'</div>'+tips:'')+
      '<div class="expDisc">'+eEsc(eT('disc'))+'</div>'+
      '<button class="expAgain" id="expAgain">'+eEsc(eT('again'))+'</button>';
    var a=document.getElementById('expAgain'); if(a) a.onclick=function(){ renderIntro(); };
  }

  var btn=document.getElementById('btnExpense');
  if(btn) btn.addEventListener('click', openModal);
  var xb=document.getElementById('expCloseBtn'); if(xb) xb.addEventListener('click', closeModal);
  modal.addEventListener('click', function(e){ if(e.target===modal) closeModal(); });
})();
