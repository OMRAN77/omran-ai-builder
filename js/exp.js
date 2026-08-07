(function(){
  var EXP_I18N = {
    ar:{title:'محلّل مصاريفي',intro:'ارفع كشف حسابك البنكي (PDF أو صورة) ويحلّل مصاريفك ويصنّفها',pick:'📄 اختر كشف حساب (PDF / صورة)',hint:'PDF أو صورة واضحة للكشف',paste:'أو الصق قائمة المصاريف نصًا',pastePh:'الصق حركات الحساب أو المصاريف هنا…',go:'حلّل المصاريف',busy:'يحلل مصاريفك…',total:'إجمالي المصاريف',tx:'حركة',dist:'توزيع المصاريف',biggest:'أكبر مصروف',tips:'نصائح توفير',again:'تحليل كشف آخر',disc:'بيانات تقريبية مبنية على تحليل الملف — للاسترشاد فقط وليست نصيحة مالية.',noContent:'اختر ملفًا أو الصق نصًا أولًا',err:'تعذّر التحليل، حاول مرة أخرى'},
    en:{title:'Expense Analyzer',intro:'Upload your bank statement (PDF or image) to categorize your spending',pick:'📄 Choose a statement (PDF / image)',hint:'PDF or a clear photo of the statement',paste:'Or paste your expenses as text',pastePh:'Paste account transactions or expenses here…',go:'Analyze Expenses',busy:'Analyzing your spending…',total:'Total Spending',tx:'transactions',dist:'Spending Breakdown',biggest:'Biggest Expense',tips:'Saving Tips',again:'Analyze another statement',disc:'Approximate figures from file analysis — for guidance only, not financial advice.',noContent:'Pick a file or paste text first',err:'Analysis failed, please try again'}
  };
  function eLang(){ try{ return localStorage.getItem('aiapp_lang')||'ar'; }catch(e){ return 'ar'; } }
  function eT(k){ var L=eLang(); return (EXP_I18N[L]&&EXP_I18N[L][k])||EXP_I18N.en[k]||EXP_I18N.ar[k]||k; }
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
