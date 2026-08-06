(function(){
  'use strict';
  function AL(){ try{ return (typeof appLang==='function'?appLang():(localStorage.getItem('aiapp_lang')||'ar')); }catch(e){ return 'ar'; } }
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
  function T(ar,en){ return isAr()?ar:en; }

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
